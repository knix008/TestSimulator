'use strict';

/**
 * 설정 사이드 패널 — MyClockWinV10/SidePanelWindow.xaml.cs 와 WorldTimePanel 이식.
 *
 * 상태는 시계 창이 소유한다. 이 창은 bus 로 명령을 보내고 돌아온 스냅샷을 그린다.
 * 실행 중인 타이머·스톱워치만 타임스탬프로 국소 보간해 매끄럽게 표시한다.
 */

const api = window.myclock;
const player = new AlarmSoundPlayer();

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad2 = (n) => String(n).padStart(2, '0');

/** @type {any} */ let settings = null;
/** @type {any[]} */ let alarms = [];
/** @type {any[]} */ let timerViews = [];
/** @type {any} */ let stopwatchView = { running: false, accumulated: 0, startedAt: 0, laps: [] };
/** @type {any[]} */ let events = [];

let activeTab = 'world';
let suggestions = [];
let suggestionIndex = -1;
/** @type {any} */ let pendingCity = null;
/** @type {string | null} */ let editingAlarmId = null;
let alarmRepeatDays = 0b1111111;
let calendarMonth = new Date();
let selectedDate = new Date();
/** @type {string | null} */ let editingEventId = null;
/** @type {number | null} */ let dragIndex = null;

const $ = (id) => document.getElementById(id);

// ── 탭 ──────────────────────────────────────────────────────────────────

function selectTab(name) {
  activeTab = name;
  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('active', tab.dataset.tab === name);
  }
  for (const page of document.querySelectorAll('.tab-page')) {
    page.classList.toggle('active', page.dataset.page === name);
  }
  // 시계 창의 컨텍스트 메뉴가 "캘린더 닫기" 여부를 판단할 수 있도록 알린다.
  api.bus.toClock({ type: 'panel:tab-changed', tab: name });
}

// ── 시계 창과의 통신 ────────────────────────────────────────────────────

function send(message) {
  api.bus.toClock(message);
}

function patchSettings(patch) {
  settings = { ...settings, ...patch };
  send({ type: 'settings:patch', patch });
}

// ── 세계 시간 ───────────────────────────────────────────────────────────

/** 주어진 IANA 시간대의 현지 시각을 Date 처럼 쓸 수 있는 필드로 분해한다. */
function zonedParts(date, zone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(date);

  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  const hour = get('hour') % 24; // Intl 은 자정을 24로 줄 수 있다
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second')
  };
}

function zonedDate(date, zone) {
  const p = zonedParts(date, zone);
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

function formatZoneTime(parts, use24h) {
  if (use24h) return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
  const suffix = parts.hour < 12 ? '오전' : '오후';
  let h = parts.hour % 12;
  if (h === 0) h = 12;
  return `${suffix} ${pad2(h)}:${pad2(parts.minute)}`;
}

/** 로컬 날짜 대비 +1일 / -1일 표기. */
function dayDiffLabel(parts, now) {
  const there = new Date(parts.year, parts.month - 1, parts.day).getTime();
  const here = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((there - here) / 86400000);
  if (diff === 0) return '';
  return diff > 0 ? `+${diff}일` : `${diff}일`;
}

function renderWorldList() {
  const list = $('worldList');
  list.innerHTML = '';
  const cities = settings?.worldCities || [];

  if (cities.length === 0) {
    list.innerHTML = '<li class="empty-hint">도시를 추가하세요.</li>';
    return;
  }

  cities.forEach((city, index) => {
    const item = document.createElement('li');
    item.className = 'world-item';
    item.draggable = true;
    item.dataset.index = String(index);

    const canvas = document.createElement('canvas');
    canvas.className = 'world-mini';
    canvas.width = 40;
    canvas.height = 40;

    const text = document.createElement('div');
    text.className = 'world-text';
    text.innerHTML =
      `<div class="world-city"></div><div class="world-region"></div>` +
      `<div class="world-time"><span class="world-time-value"></span><span class="world-daydiff"></span></div>`;
    text.querySelector('.world-city').textContent = city.city;
    text.querySelector('.world-region').textContent = city.region;

    const remove = document.createElement('button');
    remove.className = 'icon-btn';
    remove.type = 'button';
    remove.textContent = '✕';
    remove.title = '삭제';
    remove.addEventListener('click', () => {
      const next = (settings.worldCities || []).filter((_, i) => i !== index);
      patchSettings({ worldCities: next });
      renderWorldList();
    });

    item.append(canvas, text, remove);
    list.appendChild(item);
  });

  updateWorldTimes();
}

function updateWorldTimes() {
  const now = new Date();
  const cities = settings?.worldCities || [];
  const colors = analogColorsFrom();
  const items = $('worldList').querySelectorAll('.world-item');

  $('worldHeader').textContent = `현지 ${formatZoneTime(
    { hour: now.getHours(), minute: now.getMinutes(), year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() },
    settings?.worldUse24h
  )}`;

  items.forEach((item, index) => {
    const city = cities[index];
    if (!city) return;
    const parts = zonedParts(now, city.zone);
    item.querySelector('.world-time-value').textContent = formatZoneTime(parts, settings?.worldUse24h);
    item.querySelector('.world-daydiff').textContent = dayDiffLabel(parts, now);
    drawMiniAnalogClock(item.querySelector('.world-mini'), zonedDate(now, city.zone), colors);
  });
}

function renderSuggestions(query) {
  const box = $('citySuggestions');
  suggestions = searchCities(query);
  suggestionIndex = -1;

  if (suggestions.length === 0) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }

  box.innerHTML = '';
  suggestions.forEach((city, index) => {
    const item = document.createElement('li');
    item.className = 'suggestion';
    item.dataset.index = String(index);
    const name = document.createElement('span');
    name.textContent = city.en ? `${city.city} (${city.en})` : city.city;
    const sub = document.createElement('span');
    sub.className = 'suggestion-sub';
    sub.textContent = city.country;
    item.append(name, sub);
    item.addEventListener('mousedown', (event) => {
      event.preventDefault();
      chooseSuggestion(index);
    });
    box.appendChild(item);
  });
  box.hidden = false;
}

function highlightSuggestion(index) {
  const items = $('citySuggestions').querySelectorAll('.suggestion');
  items.forEach((item, i) => item.classList.toggle('active', i === index));
  suggestionIndex = index;
}

function chooseSuggestion(index) {
  const city = suggestions[index];
  if (!city) return;
  pendingCity = city;
  $('citySearch').value = city.en ? `${city.city} (${city.en})` : city.city;
  $('citySuggestions').hidden = true;
}

function addPendingCity() {
  const city = pendingCity || suggestions[0];
  if (!city) return;
  const next = [...(settings.worldCities || []), { city: city.city, region: city.country, zone: city.zone }];
  patchSettings({ worldCities: next });
  pendingCity = null;
  $('citySearch').value = '';
  $('citySuggestions').hidden = true;
  renderWorldList();
}

function wireWorldTab() {
  const search = $('citySearch');

  search.addEventListener('input', () => {
    pendingCity = null;
    renderSuggestions(search.value);
  });

  search.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      highlightSuggestion(Math.min(suggestions.length - 1, suggestionIndex + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      highlightSuggestion(Math.max(0, suggestionIndex - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (suggestionIndex >= 0) chooseSuggestion(suggestionIndex);
      addPendingCity();
    } else if (event.key === 'Escape') {
      $('citySuggestions').hidden = true;
    }
  });

  search.addEventListener('blur', () => {
    window.setTimeout(() => {
      $('citySuggestions').hidden = true;
    }, 120);
  });

  $('cityAddBtn').addEventListener('click', addPendingCity);

  // 드래그로 순서 바꾸기 (WPF DragAdorner 대응)
  const list = $('worldList');
  list.addEventListener('dragstart', (event) => {
    const item = event.target.closest('.world-item');
    if (!item) return;
    dragIndex = Number(item.dataset.index);
    item.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
  });

  list.addEventListener('dragover', (event) => {
    const item = event.target.closest('.world-item');
    if (!item || dragIndex === null) return;
    event.preventDefault();
    for (const node of list.querySelectorAll('.world-item')) node.classList.remove('drop-target');
    item.classList.add('drop-target');
  });

  list.addEventListener('drop', (event) => {
    const item = event.target.closest('.world-item');
    if (!item || dragIndex === null) return;
    event.preventDefault();
    const target = Number(item.dataset.index);
    const cities = [...(settings.worldCities || [])];
    const [moved] = cities.splice(dragIndex, 1);
    cities.splice(target, 0, moved);
    dragIndex = null;
    patchSettings({ worldCities: cities });
    renderWorldList();
  });

  list.addEventListener('dragend', () => {
    dragIndex = null;
    for (const node of list.querySelectorAll('.world-item')) {
      node.classList.remove('dragging', 'drop-target');
    }
  });
}

// ── 알람 ────────────────────────────────────────────────────────────────

function repeatSummary(alarm) {
  if (!alarm.isRepeat) return '한번';
  if (alarm.repeatDays === 0b1111111) return '매일';
  const parts = [];
  for (let i = 0; i < 7; i++) if (alarm.repeatDays & (1 << i)) parts.push(WEEKDAYS[i]);
  return parts.length ? parts.join('·') : '매일';
}

function renderAlarms() {
  const list = $('alarmList');
  list.innerHTML = '';

  if (alarms.length === 0) {
    list.innerHTML = '<li class="empty-hint">등록된 알람이 없습니다.</li>';
    return;
  }

  for (const alarm of alarms) {
    const item = document.createElement('li');
    item.className = `alarm-item${alarm.isEnabled ? '' : ' off'}`;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = `alarm-toggle${alarm.isEnabled ? ' on' : ''}`;
    toggle.title = alarm.isEnabled ? '사용 중' : '사용 안 함';
    toggle.addEventListener('click', () => {
      alarm.isEnabled = !alarm.isEnabled;
      send({ type: 'alarms:set', alarms });
      renderAlarms();
    });

    const text = document.createElement('div');
    text.className = 'alarm-text';
    text.innerHTML = '<div class="alarm-time-text"></div><div class="alarm-sub"></div>';
    text.querySelector('.alarm-time-text').textContent = alarm.time;
    text.querySelector('.alarm-sub').textContent = alarm.label
      ? `${repeatSummary(alarm)} · ${alarm.label}`
      : repeatSummary(alarm);

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'btn btn-small';
    edit.textContent = '편집';
    edit.addEventListener('click', () => openAlarmForm(alarm));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn';
    remove.textContent = '✕';
    remove.title = '삭제';
    remove.addEventListener('click', () => {
      alarms = alarms.filter((a) => a.id !== alarm.id);
      send({ type: 'alarms:set', alarms });
      renderAlarms();
    });

    item.append(toggle, text, edit, remove);
    list.appendChild(item);
  }
}

function renderDayPicker() {
  const picker = $('alarmDays');
  picker.innerHTML = '';
  WEEKDAYS.forEach((name, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `day-btn${alarmRepeatDays & (1 << index) ? ' on' : ''}`;
    button.textContent = name;
    button.addEventListener('click', () => {
      alarmRepeatDays ^= 1 << index;
      renderDayPicker();
    });
    picker.appendChild(button);
  });
  picker.hidden = !$('alarmRepeat').checked;
}

function openAlarmForm(alarm) {
  editingAlarmId = alarm ? alarm.id : null;
  $('alarmTime').value = alarm ? alarm.time : '07:00';
  $('alarmLabel').value = alarm ? alarm.label : '';
  $('alarmRepeat').checked = alarm ? alarm.isRepeat : false;
  alarmRepeatDays = alarm ? alarm.repeatDays : 0b1111111;
  renderDayPicker();
  $('alarmForm').hidden = false;
}

function closeAlarmForm() {
  editingAlarmId = null;
  $('alarmForm').hidden = true;
}

function wireAlarmTab() {
  $('alarmAddBtn').addEventListener('click', () => openAlarmForm(null));
  $('alarmCancelBtn').addEventListener('click', closeAlarmForm);
  $('alarmRepeat').addEventListener('change', renderDayPicker);

  $('alarmForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const time = $('alarmTime').value || '07:00';
    const payload = {
      time,
      label: $('alarmLabel').value.trim(),
      isEnabled: true,
      isRepeat: $('alarmRepeat').checked,
      repeatDays: alarmRepeatDays
    };

    if (editingAlarmId) {
      const existing = alarms.find((a) => a.id === editingAlarmId);
      if (existing) Object.assign(existing, payload);
    } else {
      alarms = [...alarms, { id: `alarm-${Math.random().toString(36).slice(2, 10)}`, ...payload }];
    }
    alarms.sort((a, b) => a.time.localeCompare(b.time));

    send({ type: 'alarms:set', alarms });
    closeAlarmForm();
    renderAlarms();
  });
}

// ── 타이머 ──────────────────────────────────────────────────────────────

function renderTimers() {
  const list = $('timerList');
  list.innerHTML = '';

  for (const view of timerViews) {
    const item = document.createElement('li');
    item.className = 'timer-item';
    item.dataset.id = view.id;

    const top = document.createElement('div');
    top.className = 'timer-top';
    const label = document.createElement('input');
    label.className = 'text-input';
    label.type = 'text';
    label.placeholder = '레이블 (선택)';
    label.value = view.label;
    label.addEventListener('change', () =>
      send({ type: 'timer:command', id: view.id, command: 'label', value: label.value })
    );
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn';
    remove.textContent = '✕';
    remove.title = '삭제';
    remove.addEventListener('click', () => send({ type: 'timer:remove', id: view.id }));
    top.append(label, remove);

    const remaining = document.createElement('div');
    remaining.className = 'timer-remaining';
    remaining.textContent = view.display;

    const fields = document.createElement('div');
    fields.className = 'timer-fields';
    for (const [field, name] of [
      ['hours', '시'],
      ['minutes', '분'],
      ['seconds', '초']
    ]) {
      const wrap = document.createElement('div');
      wrap.className = 'timer-field';
      wrap.innerHTML = `<div class="timer-field-label">${name}</div>`;

      const spin = document.createElement('div');
      spin.className = 'timer-spin';
      const minus = document.createElement('button');
      minus.type = 'button';
      minus.className = 'btn';
      minus.textContent = '−';
      const value = document.createElement('span');
      value.className = 'timer-value';
      value.textContent = pad2(view[field]);
      const plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'btn';
      plus.textContent = '+';

      const step = (delta) =>
        send({ type: 'timer:command', id: view.id, command: 'field', field, value: view[field] + delta });
      minus.addEventListener('click', () => step(-1));
      plus.addEventListener('click', () => step(1));
      minus.disabled = !view.canStart || view.state !== 'Idle';
      plus.disabled = minus.disabled;

      spin.append(minus, value, plus);
      wrap.appendChild(spin);
      fields.appendChild(wrap);
    }

    const actions = document.createElement('div');
    actions.className = 'timer-actions';
    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'btn btn-accent';
    start.textContent = view.startLabel;
    start.disabled = !view.canStart;
    start.addEventListener('click', () => send({ type: 'timer:command', id: view.id, command: 'start' }));

    const pause = document.createElement('button');
    pause.type = 'button';
    pause.className = 'btn';
    pause.textContent = '일시정지';
    pause.disabled = view.state !== 'Running';
    pause.addEventListener('click', () => send({ type: 'timer:command', id: view.id, command: 'pause' }));

    const stop = document.createElement('button');
    stop.type = 'button';
    stop.className = 'btn';
    stop.textContent = '정지';
    stop.disabled = !view.canStop;
    stop.addEventListener('click', () => send({ type: 'timer:command', id: view.id, command: 'stop' }));

    actions.append(start, pause, stop);
    item.append(top, remaining, fields, actions);
    list.appendChild(item);
  }
}

/** 실행 중인 타이머만 매 프레임 남은 시간을 다시 계산한다. */
function refreshRunningTimers() {
  for (const view of timerViews) {
    if (view.state !== 'Running' || !view.endAt) continue;
    const node = $('timerList').querySelector(`.timer-item[data-id="${view.id}"] .timer-remaining`);
    if (node) node.textContent = formatCentiseconds(Math.max(0, view.endAt - Date.now()));
  }
}

// ── 스톱워치 ────────────────────────────────────────────────────────────

function stopwatchElapsed() {
  return stopwatchView.accumulated + (stopwatchView.running ? Date.now() - stopwatchView.startedAt : 0);
}

function renderStopwatch() {
  $('swDisplay').textContent = formatCentiseconds(stopwatchElapsed());
  $('swStartBtn').disabled = stopwatchView.running;
  $('swLapBtn').disabled = !stopwatchView.running;
  $('swStopBtn').disabled = !stopwatchView.running;
  $('swResetBtn').disabled = stopwatchView.running || stopwatchElapsed() === 0;

  const list = $('swLaps');
  list.innerHTML = '';
  for (const lap of stopwatchView.laps) {
    const item = document.createElement('li');
    item.className = 'lap-item';
    item.innerHTML = '<span class="lap-number"></span><span class="lap-time"></span>';
    item.querySelector('.lap-number').textContent = lap.label;
    item.querySelector('.lap-time').textContent = lap.display;
    list.appendChild(item);
  }
}

function wireStopwatchTab() {
  $('swStartBtn').addEventListener('click', () => send({ type: 'stopwatch:command', command: 'start' }));
  $('swLapBtn').addEventListener('click', () => send({ type: 'stopwatch:command', command: 'lap' }));
  $('swStopBtn').addEventListener('click', () => send({ type: 'stopwatch:command', command: 'stop' }));
  $('swResetBtn').addEventListener('click', () => send({ type: 'stopwatch:command', command: 'reset' }));
}

// ── 캘린더 ──────────────────────────────────────────────────────────────

function dateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 반복·여러 날 일정까지 고려해 그 날짜에 표시할 일정을 고른다. */
function eventsOn(date) {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  return events.filter((ev) => {
    const start = parseDateKey(ev.date);
    const startDay = start.getTime();

    if (ev.recurrence && ev.recurrence !== 'None') {
      if (day < startDay) return false;
      if (ev.recurrence === 'Daily') return true;
      if (ev.recurrence === 'Weekly') return start.getDay() === date.getDay();
      if (ev.recurrence === 'Monthly') return start.getDate() === date.getDate();
      if (ev.recurrence === 'Yearly') {
        return start.getMonth() === date.getMonth() && start.getDate() === date.getDate();
      }
      return false;
    }

    const endDay = ev.endDate ? parseDateKey(ev.endDate).getTime() : startDay;
    return day >= startDay && day <= endDay;
  });
}

function renderCalendar() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  $('calTitle').textContent = `${year}년 ${month + 1}월`;

  const grid = $('calGrid');
  grid.innerHTML = '';

  const first = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - first.getDay());
  const today = new Date();

  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if (date.getMonth() !== month) cell.classList.add('other-month');
    if (dateKey(date) === dateKey(today)) cell.classList.add('today');
    if (dateKey(date) === dateKey(selectedDate)) cell.classList.add('selected');

    const num = document.createElement('div');
    num.className = 'cal-day-num';
    num.textContent = String(date.getDate());
    if (date.getDay() === 0) num.style.color = '#e05555';
    if (date.getDay() === 6) num.style.color = '#5588ee';
    cell.appendChild(num);

    const dayEvents = eventsOn(date);
    // WPF 와 같이 한 칸에 최대 3건만 띄우고 나머지는 +n 으로 접는다.
    for (const ev of dayEvents.slice(0, 3)) {
      const chip = document.createElement('div');
      chip.className = 'cal-chip';
      chip.style.background = ev.color;
      chip.textContent = ev.title || '(제목 없음)';
      cell.appendChild(chip);
    }
    if (dayEvents.length > 3) {
      const more = document.createElement('div');
      more.className = 'cal-more';
      more.textContent = `+${dayEvents.length - 3}`;
      cell.appendChild(more);
    }

    cell.addEventListener('click', () => {
      selectedDate = date;
      if (date.getMonth() !== month) calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      renderCalendar();
    });

    grid.appendChild(cell);
  }

  renderDayEvents();
}

function renderDayEvents() {
  $('calDayTitle').textContent =
    `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 (${WEEKDAYS[selectedDate.getDay()]})`;

  const list = $('calDayEvents');
  list.innerHTML = '';
  const dayEvents = eventsOn(selectedDate);

  if (dayEvents.length === 0) {
    list.innerHTML = '<li class="empty-hint">일정이 없습니다.</li>';
    return;
  }

  for (const ev of dayEvents) {
    const item = document.createElement('li');
    item.className = 'event-item';
    item.style.borderLeftColor = ev.color;

    const text = document.createElement('div');
    text.className = 'event-text';
    text.innerHTML = '<div class="event-title"></div><div class="event-sub"></div>';
    text.querySelector('.event-title').textContent = ev.title || '(제목 없음)';
    const bits = [ev.isAllDay ? '종일' : `${ev.startTime} ~ ${ev.endTime}`];
    if (ev.reminderMinutes != null) bits.push(`알림 ${ev.reminderMinutes}분 전`);
    if (ev.description) bits.push(ev.description);
    text.querySelector('.event-sub').textContent = bits.join(' · ');

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'btn btn-small';
    edit.textContent = '편집';
    edit.addEventListener('click', () => openEventForm(ev));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn';
    remove.textContent = '✕';
    remove.title = '삭제';
    remove.addEventListener('click', () => {
      events = events.filter((e) => e.id !== ev.id);
      send({ type: 'events:set', events });
      renderCalendar();
    });

    item.append(text, edit, remove);
    list.appendChild(item);
  }
}

function openEventForm(ev) {
  editingEventId = ev ? ev.id : null;
  $('eventTitle').value = ev ? ev.title : '';
  $('eventDate').value = ev ? ev.date : dateKey(selectedDate);
  $('eventAllDay').checked = ev ? ev.isAllDay : false;
  $('eventStart').value = ev ? ev.startTime : '09:00';
  $('eventEnd').value = ev ? ev.endTime : '10:00';
  $('eventEndDate').value = ev && ev.endDate ? ev.endDate : '';
  $('eventRecurrence').value = ev ? ev.recurrence : 'None';
  $('eventReminder').value = ev && ev.reminderMinutes != null ? String(ev.reminderMinutes) : '';
  $('eventColor').value = ev ? ev.color : '#4A90D9';
  $('eventDesc').value = ev ? ev.description : '';
  $('eventTimeRow').hidden = $('eventAllDay').checked;
  $('eventForm').hidden = false;
}

function wireCalendarTab() {
  $('calPrevBtn').addEventListener('click', () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    renderCalendar();
  });
  $('calNextBtn').addEventListener('click', () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    renderCalendar();
  });
  $('eventAddBtn').addEventListener('click', () => openEventForm(null));
  $('eventCancelBtn').addEventListener('click', () => {
    editingEventId = null;
    $('eventForm').hidden = true;
  });
  $('eventAllDay').addEventListener('change', () => {
    $('eventTimeRow').hidden = $('eventAllDay').checked;
  });

  $('eventForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const reminder = $('eventReminder').value;
    const payload = {
      title: $('eventTitle').value.trim(),
      date: $('eventDate').value,
      endDate: $('eventEndDate').value || null,
      startTime: $('eventStart').value || '09:00',
      endTime: $('eventEnd').value || '10:00',
      isAllDay: $('eventAllDay').checked,
      description: $('eventDesc').value.trim(),
      reminderMinutes: reminder === '' ? null : Number(reminder),
      recurrence: $('eventRecurrence').value,
      color: $('eventColor').value.toUpperCase()
    };

    if (editingEventId) {
      const existing = events.find((e) => e.id === editingEventId);
      if (existing) Object.assign(existing, payload);
    } else {
      events = [...events, { id: `evt-${Math.random().toString(36).slice(2, 10)}`, ...payload }];
    }

    send({ type: 'events:set', events });
    editingEventId = null;
    $('eventForm').hidden = true;
    selectedDate = parseDateKey(payload.date);
    calendarMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    renderCalendar();
  });
}

// ── 설정 탭 ─────────────────────────────────────────────────────────────

function fillSelect(select, options, selected) {
  select.innerHTML = '';
  for (const option of options) {
    const node = document.createElement('option');
    node.value = option.id;
    node.textContent = option.label;
    select.appendChild(node);
  }
  select.value = selected;
}

/** 각 버튼을 그 테마의 색으로 칠해, 고르기 전에 색을 볼 수 있게 한다. */
function renderThemeGrid() {
  const grid = $('themeGrid');
  grid.innerHTML = '';

  for (const name of THEME_NAMES) {
    const theme = THEMES[name];
    const vars = theme.vars;
    const active = settings.theme === name;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `theme-btn${active ? ' active' : ''}`;
    button.title = theme.label;
    button.style.background = vars['--window-background'];
    button.style.color = vars['--foreground'];
    button.style.borderColor = active ? vars['--accent'] : vars['--border'];

    // 문자판 위의 디지털 숫자 색 — 그 테마 시계가 어떤 색인지 한눈에 보인다.
    const swatch = document.createElement('span');
    swatch.className = 'theme-swatch';
    swatch.style.background = vars['--clock-face'];
    swatch.style.borderColor = vars['--clock-border'];

    const dot = document.createElement('span');
    dot.className = 'theme-swatch-dot';
    dot.style.background = vars['--digital-text'];
    swatch.appendChild(dot);

    const label = document.createElement('span');
    label.className = 'theme-name';
    label.textContent = theme.label;

    button.append(swatch, label);
    button.addEventListener('click', () => {
      patchSettings({ theme: name });
      applyTheme(name);
      renderThemeGrid();
      renderWorldList();
    });
    grid.appendChild(button);
  }
}

function renderSettingsTab() {
  fillSelect($('soundSelect'), ALARM_SOUNDS, settings.alarmSoundId);
  $('volumeSlider').value = String(settings.alarmVolume);
  $('volumeValue').textContent = `${settings.alarmVolume}%`;

  for (const button of document.querySelectorAll('#modeGroup .seg-btn')) {
    button.classList.toggle('active', (button.dataset.value === 'digital') === settings.isDigital);
  }

  for (const button of document.querySelectorAll('#formatGroup .seg-btn')) {
    button.classList.toggle('active', (button.dataset.value === '24') === settings.use24h);
  }

  $('amPmColor').value = settings.amPmColor;
  $('amPmColorValue').textContent = settings.amPmColor;
  $('digitColor').value = settings.digitColor;
  $('digitColorValue').textContent = settings.digitColor;
  $('brightnessSlider').value = String(settings.brightness);
  $('brightnessValue').textContent = `${settings.brightness}%`;
  $('worldUse24h').checked = settings.worldUse24h;
  $('alwaysOnTop').checked = settings.alwaysOnTop;

  fillSelect($('digitalStyleSelect'), DIGITAL_STYLES, settings.digitalStyle);
  fillSelect($('analogStyleSelect'), ANALOG_STYLES, settings.analogStyle);
  renderThemeGrid();
}

function wireSettingsTab() {
  $('soundSelect').addEventListener('change', (event) => patchSettings({ alarmSoundId: event.target.value }));

  $('volumeSlider').addEventListener('input', (event) => {
    const value = Number(event.target.value);
    $('volumeValue').textContent = `${value}%`;
    patchSettings({ alarmVolume: value });
  });

  $('soundPreviewBtn').addEventListener('click', () => {
    player.preview(settings.alarmSoundId, settings.alarmVolume / 100);
  });

  for (const button of document.querySelectorAll('#modeGroup .seg-btn')) {
    button.addEventListener('click', () => {
      patchSettings({ isDigital: button.dataset.value === 'digital' });
      renderSettingsTab();
    });
  }

  for (const button of document.querySelectorAll('#formatGroup .seg-btn')) {
    button.addEventListener('click', () => {
      patchSettings({ use24h: button.dataset.value === '24' });
      renderSettingsTab();
    });
  }

  $('amPmColor').addEventListener('input', (event) => {
    const value = event.target.value.toUpperCase();
    $('amPmColorValue').textContent = value;
    patchSettings({ amPmColor: value });
  });

  $('digitColor').addEventListener('input', (event) => {
    const value = event.target.value.toUpperCase();
    $('digitColorValue').textContent = value;
    patchSettings({ digitColor: value });
  });

  $('brightnessSlider').addEventListener('input', (event) => {
    const value = Number(event.target.value);
    $('brightnessValue').textContent = `${value}%`;
    patchSettings({ brightness: value });
  });

  $('digitalStyleSelect').addEventListener('change', (event) =>
    patchSettings({ digitalStyle: event.target.value })
  );
  $('analogStyleSelect').addEventListener('change', (event) =>
    patchSettings({ analogStyle: event.target.value })
  );

  $('worldUse24h').addEventListener('change', (event) => {
    patchSettings({ worldUse24h: event.target.checked });
    updateWorldTimes();
  });

  $('alwaysOnTop').addEventListener('change', (event) => patchSettings({ alwaysOnTop: event.target.checked }));

  $('startWithSystem').addEventListener('change', async (event) => {
    const enabled = await api.startup.set(event.target.checked);
    event.target.checked = enabled;
    patchSettings({ startWithSystem: enabled });
  });

  $('fullscreenBtn').addEventListener('click', () => api.fullscreen.open());

  $('resetBtn').addEventListener('click', () => {
    send({ type: 'settings:reset' });
  });
}

// ── 상태 수신 ───────────────────────────────────────────────────────────

function applyState(state) {
  const themeChanged = !settings || settings.theme !== state.settings.theme;
  settings = state.settings;
  alarms = state.alarms;
  timerViews = state.timers;
  stopwatchView = state.stopwatch;
  events = state.events;

  if (themeChanged) applyTheme(settings.theme);
  document.documentElement.style.setProperty('--digital-text-color', settings.digitColor);

  renderWorldList();
  renderAlarms();
  renderTimers();
  renderStopwatch();
  renderCalendar();
  renderSettingsTab();
}

// ── 초기화 ──────────────────────────────────────────────────────────────

function wireTabs() {
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => selectTab(tab.dataset.tab));
  }
  $('panelCloseBtn').addEventListener('click', () => api.panel.close());

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    // 열려 있는 입력 폼이 있으면 폼만 닫고, 없으면 패널을 닫는다.
    const openForm = [$('alarmForm'), $('eventForm')].find((form) => !form.hidden);
    if (openForm) {
      openForm.hidden = true;
      editingAlarmId = null;
      editingEventId = null;
      return;
    }
    api.panel.close();
  });

  api.panel.onTab((tab) => selectTab(tab));
  api.panel.onSide((right) => document.body.classList.toggle('panel-left', !right));
}

async function init() {
  settings = await api.settings.load();
  applyTheme(settings.theme);

  wireTabs();
  wireWorldTab();
  wireAlarmTab();
  wireStopwatchTab();
  wireCalendarTab();
  wireSettingsTab();
  $('timerAddBtn').addEventListener('click', () => send({ type: 'timer:add' }));

  $('startWithSystem').checked = await api.startup.get();

  api.bus.onFromClock((message) => {
    if (message && message.type === 'state') applyState(message);
  });
  send({ type: 'request:state' });

  selectTab('world');

  window.setInterval(() => {
    updateWorldTimes();
    if (activeTab === 'timer') refreshRunningTimers();
    if (activeTab === 'stopwatch' && stopwatchView.running) {
      $('swDisplay').textContent = formatCentiseconds(stopwatchElapsed());
    }
  }, 100);
}

init();
