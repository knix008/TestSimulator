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

let activeTab = 'settings';
/**
 * 이 창이 보여 줄 탭.
 *   · 설정 패널      — only=settings      (설정만 맡는다)
 *   · 분리한 기능 창 — only=<탭>&tool=1   (알람·타이머·스톱워치·캘린더·세계 시간)
 * 한 창이 한 가지만 맡으므로 탭 줄 대신 제목만 남는다.
 */
const params = new URLSearchParams(location.search);
const onlyTab = params.get('only') || 'settings';
const isToolWindow = params.get('tool') === '1';
/**
 * 이 설정 창이 맡은 시계 — 'main' 또는 추가 시계 id.
 * 시계마다 자기 설정 창을 갖는다. 그래서 창 안에서 시계를 고를 일이 없다.
 */
let clockTarget = params.get('clock') || 'main';
/** @type {any[]} 추가 시계 목록 (메인 프로세스가 들고 있다) */
let clocks = [];
/**
 * 설정 창 안의 갈래 — 시계 · 모양 · 스타일 · 소리.
 * 열면 테마가 바로 보이도록 "모양" 부터 보여 준다.
 */
let settingsSub = 'look';
/** 테마 칸을 한 줄에 몇 개 둘지 — 창 폭이 이 수에 맞춰 정해진다. */
const THEME_COLUMNS = 4;
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

/**
 * 지금 쓰고 있는 칸인가.
 *
 * 설정은 시계 창이 상태를 보낼 때마다 다시 그린다. 그때 값을 그대로 다시 넣으면
 * 끌고 있던 슬라이더가 제자리로 튕겨 손에서 빠진다. 그래서 포커스를 쥔 칸
 * (끄는 중인 슬라이더·입력 중인 칸)은 건너뛴다.
 */
function isBeingUsed(node) {
  return !!node && document.activeElement === node;
}

/** 쓰고 있지 않은 칸에만 값을 넣는다. */
function setValue(node, value) {
  if (!node || isBeingUsed(node)) return;
  node.value = String(value);
}

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

/** 테마 칸 하나의 너비 (fitThemeTiles 가 재서 넣는다). */
let themeTileWidth = 96;

/**
 * 테마 칸 너비 — 가장 긴 이름이 잘리지 않을 만큼으로 잡는다.
 * 글꼴·배율이 달라도 글자가 잘리지 않도록 그때그때 재서 넣는다.
 */
function fitThemeTiles() {
  const probe = document.createElement('span');
  probe.className = 'theme-name';
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.whiteSpace = 'nowrap';
  document.body.appendChild(probe);

  let widest = 0;
  for (const family of THEME_FAMILIES) {
    probe.textContent = family.label;
    widest = Math.max(widest, probe.offsetWidth);
  }
  probe.textContent = THEMES[CUSTOM_THEME].label;
  widest = Math.max(widest, probe.offsetWidth);
  probe.remove();

  // 스와치(11) + 사이 간격(4) + 좌우 여백·테두리(8) + 여유(5)
  themeTileWidth = Math.ceil(widest) + 28;
  document.documentElement.style.setProperty('--theme-tile', `${themeTileWidth}px`);
}

/**
 * 설정 창 크기 — 가장 큰 갈래가 잘리지 않을 만큼으로 맞춘다.
 * 스크롤 막대를 두지 않으므로, 창이 작으면 아래쪽이 가려진다.
 */
function fitSettingsWindow() {
  if (onlyTab !== 'settings') return;
  // 칸을 쓰고 있는 동안 창 크기를 바꾸면 끌던 손에서 빠진다.
  if (document.activeElement && document.activeElement !== document.body) return;
  const page = document.querySelector('.tab-page[data-page="settings"]');
  const strip = document.querySelector('.tab-strip');
  const pages = [...document.querySelectorAll('.sub-page')];
  if (!page || !pages.length) return;

  const active = pages.find((sub) => sub.classList.contains('active')) || pages[0];
  let height = 0;
  for (const sub of pages) {
    for (const other of pages) other.classList.toggle('active', other === sub);
    height = Math.max(height, page.scrollHeight);
  }
  for (const other of pages) other.classList.toggle('active', other === active);

  // 폭은 재지 않는다 — 내용은 창 폭을 그대로 채우므로 재면 잴수록 넓어진다.
  // 가장 넓은 것(테마 네 칸)에서 계산한다. 칸 사이 4px, 좌우 여백 20px, 테두리 2px.
  const wanted = {
    width: THEME_COLUMNS * themeTileWidth + (THEME_COLUMNS - 1) * 4 + 26,
    height: Math.min(900, Math.max(420, Math.ceil(height) + strip.offsetHeight + 14))
  };
  if (isToolWindow) api.window.setSize(wanted);
  else api.panel.fit(wanted);
}

/**
 * 이 창에서 보여 줄 것이 있는 갈래만 탭에 남긴다.
 * 추가 시계의 설정 창에는 공용 설정(소리)이 없으므로 그 탭을 감춘다.
 */
function renderSubTabs() {
  let firstVisible = null;
  for (const tab of document.querySelectorAll('.sub-tab')) {
    const page = document.querySelector(`.sub-page[data-sub-page="${tab.dataset.sub}"]`);
    // NodeList 에는 some 이 없다 — 배열로 옮겨 담고 쓴다.
    const titles = page ? [...page.querySelectorAll('.section-title')] : [];
    const hasContent = titles.some((title) => {
      const scope = title.closest('[data-scope]');
      return !scope || !scope.hidden;
    });
    tab.hidden = !hasContent;
    if (hasContent && !firstVisible) firstVisible = tab.dataset.sub;
  }
  // 보고 있던 갈래가 사라졌으면 첫 갈래로 옮긴다.
  const current = document.querySelector(`.sub-tab[data-sub="${settingsSub}"]`);
  if (firstVisible && (!current || current.hidden)) selectSettingsSub(firstVisible);
}

/** 설정 창은 갈래를 나눠 한 번에 하나만 보여 준다 (스크롤이 생기지 않도록). */
function selectSettingsSub(name) {
  settingsSub = name;
  for (const tab of document.querySelectorAll('.sub-tab')) {
    tab.classList.toggle('active', tab.dataset.sub === name);
  }
  for (const page of document.querySelectorAll('.sub-page')) {
    page.classList.toggle('active', page.dataset.subPage === name);
  }
}

// ── 시계 창과의 통신 ────────────────────────────────────────────────────

function send(message) {
  api.bus.toClock(message);
}

/** 지금 설정 탭이 고치고 있는 대상 — 메인 시계의 설정이거나 추가 시계 하나. */
function targetSettings() {
  if (clockTarget === 'main') return settings;
  return clocks.find((clock) => clock.id === clockTarget) || settings;
}

function editingClock() {
  return clockTarget !== 'main' && clocks.some((clock) => clock.id === clockTarget);
}

/**
 * 테마를 고르면 디지털 표시 색도 그 테마의 색으로 맞춘다.
 * (메인 시계는 시계 창이 같은 일을 한다 — clock.js 의 settings:patch 처리부)
 */
function themeDisplayPatch(target, patch) {
  if (!('theme' in patch)) return {};
  const theme =
    patch.theme === CUSTOM_THEME
      ? customThemeFrom(
          'customThemeColor' in patch ? patch.customThemeColor : target.customThemeColor,
          'customThemeLight' in patch ? patch.customThemeLight : target.customThemeLight
        )
      : THEMES[patch.theme] || THEMES.DarkTheme;
  return { digitColor: theme.vars['--digital-text'], amPmColor: theme.vars['--accent'] };
}

/**
 * 모양 설정을 고친다 — 고른 시계에만 적용된다.
 * 알람·타이머·스톱워치·캘린더는 앱이 하나로 들고 있으므로 이 길을 쓰지 않는다.
 */
function patchSettings(patch) {
  if (editingClock()) {
    const target = targetSettings();
    const full = { ...themeDisplayPatch(target, patch), ...patch };
    const next = { ...target, ...full };
    clocks = clocks.map((clock) => (clock.id === next.id ? next : clock));
    api.clocks.update(next.id, full);
    return;
  }
  settings = { ...settings, ...patch };
  send({ type: 'settings:patch', patch });
}

// ── 세계 시간 ───────────────────────────────────────────────────────────
// 시간대 변환(zonedParts/zonedDate/zoneDayDiff)은 추가 시계 창과 함께 쓰는
// js/zone-time.js 에 있다.

function formatZoneTime(parts, use24h) {
  if (use24h) return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
  const suffix = parts.hour < 12 ? '오전' : '오후';
  let h = parts.hour % 12;
  if (h === 0) h = 12;
  return `${suffix} ${pad2(h)}:${pad2(parts.minute)}`;
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

    // 이 도시의 시계 창을 하나 더 연다 — 시계마다 테마·모양을 따로 갖는다.
    const openClock = document.createElement('button');
    openClock.className = 'btn btn-small';
    openClock.type = 'button';
    openClock.textContent = '시계';
    openClock.title = `${city.city} 시계 창 열기`;
    openClock.addEventListener('click', async () => {
      await api.clocks.add(city);
      clocks = await api.clocks.list();
      renderSettingsTab();
    });

    const remove = document.createElement('button');
    remove.className = 'icon-btn';
    remove.type = 'button';
    remove.textContent = '✕';
    remove.title = '삭제';
    remove.addEventListener('click', () => {
      // 세계 시간 목록은 메인 설정이다 — 시계를 고치는 중이어도 목록은 그대로 둔다.
      const next = (settings.worldCities || []).filter((_, i) => i !== index);
      settings = { ...settings, worldCities: next };
      send({ type: 'settings:patch', patch: { worldCities: next } });
      renderWorldList();
    });

    item.append(canvas, text, openClock, remove);
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
    item.querySelector('.world-daydiff').textContent = zoneDayDiff(parts, now);
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
  $('worldUse24h').addEventListener('change', (event) => {
    settings = { ...settings, worldUse24h: event.target.checked };
    send({ type: 'settings:patch', patch: { worldUse24h: event.target.checked } });
    updateWorldTimes();
  });

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

/** 사용자 정의 색·바탕을 바꾸고 그 테마로 갈아탄다. */
function useCustomTheme(patch) {
  const target = targetSettings();
  const next = { ...patch };
  const color = 'customThemeColor' in next ? next.customThemeColor : target.customThemeColor;
  const light = 'customThemeLight' in next ? next.customThemeLight : target.customThemeLight;
  // 추가 시계를 고치는 중이면 패널 자신의 사용자 색 등록표는 건드리지 않는다.
  if (!editingClock()) {
    setCustomTheme(color, light);
    patchSettings({ ...next, theme: CUSTOM_THEME });
    applyTheme(CUSTOM_THEME);
  } else {
    patchSettings({ ...next, theme: CUSTOM_THEME });
  }
  renderThemeGrid();
  renderWorldList();
  renderSettingsTab();
}

/** 지금 고른 테마가 밝은 바탕인가 (사용자 색은 따로 저장된 값을 본다). */
function themeIsLight() {
  const target = targetSettings();
  return target.theme === CUSTOM_THEME ? target.customThemeLight === true : isLightTheme(target.theme);
}

/** 패널 창 자신의 색은 메인 시계의 테마를 따른다 (추가 시계를 고치는 중에도). */
function applyTargetTheme(name) {
  if (editingClock()) return;
  applyTheme(name);
}

/** 같은 색의 반대쪽 판으로 바꾼다. 사용자 색도 같은 바탕을 따라가게 맞춘다. */
function setThemeBase(light) {
  const target = targetSettings();
  if (target.theme === CUSTOM_THEME) {
    useCustomTheme({ customThemeLight: light });
    return;
  }
  const next = themeVariant(target.theme, light);
  if (!editingClock()) setCustomTheme(target.customThemeColor, light);
  patchSettings({ theme: next, customThemeLight: light });
  applyTargetTheme(next);
  renderThemeGrid();
  renderWorldList();
  renderSettingsTab();
}

/** 테마 칸 하나 — 그 테마의 색으로 직접 칠해 고르기 전에 색을 볼 수 있게 한다. */
function themeTile(name, label, onPick, theme) {
  const vars = (theme || THEMES[name]).vars;
  const active = targetSettings().theme === name;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = `theme-btn${active ? ' active' : ''}`;
  button.title = label;
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

  const text = document.createElement('span');
  text.className = 'theme-name';
  text.textContent = label;

  button.append(swatch, text);
  button.addEventListener('click', onPick);
  return button;
}

/**
 * 테마 목록 — 색마다 한 칸씩 보여 주고, 어두운 판/밝은 판 중 고른 쪽으로 칠한다.
 * 맨 끝 칸은 사용자가 고른 색으로 만든 테마다.
 */
function renderThemeGrid() {
  const grid = $('themeGrid');
  grid.innerHTML = '';
  const light = themeIsLight();

  for (const family of THEME_FAMILIES) {
    const name = light ? family.light : family.dark;
    grid.appendChild(
      themeTile(name, family.label, () => {
        patchSettings({ theme: name });
        applyTargetTheme(name);
        renderThemeGrid();
        renderWorldList();
      })
    );
  }

  // 사용자 색 칸은 고치는 대상이 고른 색으로 칠한다 (패널 자신의 색과 별개).
  const target = targetSettings();
  const custom = editingClock()
    ? customThemeFrom(target.customThemeColor, target.customThemeLight)
    : THEMES[CUSTOM_THEME];
  grid.appendChild(themeTile(CUSTOM_THEME, custom.label, () => useCustomTheme({}), custom));
  fitThemeTiles();
}

/** 이 설정 창이 어느 시계의 것인지 제목과 안내에 적는다. */
function renderClockScope() {
  const clockMode = editingClock();
  const target = targetSettings();
  const name = clockMode ? `${target.city || target.zone} 시계` : '메인 시계';

  const label = document.querySelector('.tab[data-tab="settings"] .tab-label');
  if (label) label.textContent = `${name} 설정`;

  $('clockScopeHint').textContent = clockMode
    ? `${name}의 설정입니다. 다른 시계와 메인 시계는 그대로 둡니다.`
    : '메인 시계의 설정입니다. 추가한 시계는 저마다 자기 설정 창을 갖습니다.';
}

function renderSettingsTab() {
  const target = targetSettings();
  const clockMode = editingClock();

  renderClockScope();
  for (const node of document.querySelectorAll('[data-scope="main"]')) node.hidden = clockMode;
  for (const node of document.querySelectorAll('[data-scope="clock"]')) node.hidden = !clockMode;
  renderSubTabs();

  // 도시는 메인 시계도 고를 수 있다. 메인은 "이 컴퓨터 시간"을 더 둔다.
  const cityOptions = CITIES.map((city) => ({ id: city.zone, label: `${city.city} (${city.country})` }));
  if (!isBeingUsed($('clockZone'))) fillSelect(
    $('clockZone'),
    clockMode ? cityOptions : [{ id: '', label: '이 컴퓨터 시간' }, ...cityOptions],
    target.zone || ''
  );
  // 목록에 없는 시간대면 그 값을 보여 주기 위해 한 줄 더 넣는다.
  if (target.zone && $('clockZone').value !== target.zone) {
    const option = document.createElement('option');
    option.value = target.zone;
    option.textContent = target.city || target.zone;
    $('clockZone').appendChild(option);
    $('clockZone').value = target.zone;
  }
  $('clockShowCity').checked = target.showCity !== false;
  $('clockShowCity').disabled = !target.zone;

  if (!isBeingUsed($('soundSelect'))) fillSelect($('soundSelect'), ALARM_SOUNDS, settings.alarmSoundId);
  setValue($('volumeSlider'), settings.alarmVolume);
  $('volumeValue').textContent = `${settings.alarmVolume}%`;

  for (const button of document.querySelectorAll('#modeGroup .seg-btn')) {
    button.classList.toggle('active', (button.dataset.value === 'digital') === target.isDigital);
  }

  // 아날로그는 문자판에 오전/오후를 그리므로 12/24시간 선택이 쓰이지 않는다.
  const formatUsed = target.isDigital;
  for (const button of document.querySelectorAll('#formatGroup .seg-btn')) {
    button.classList.toggle('active', (button.dataset.value === '24') === target.use24h);
    button.disabled = !formatUsed;
  }
  $('formatGroup').classList.toggle('disabled', !formatUsed);
  $('formatHint').hidden = formatUsed;

  setValue($('customThemeColor'), target.customThemeColor);
  $('customThemeColorValue').textContent = target.customThemeColor;
  for (const button of document.querySelectorAll('#themeBaseGroup .seg-btn')) {
    button.classList.toggle('active', (button.dataset.value === 'light') === themeIsLight());
  }

  setValue($('amPmColor'), target.amPmColor);
  $('amPmColorValue').textContent = target.amPmColor;
  setValue($('digitColor'), target.digitColor);
  $('digitColorValue').textContent = target.digitColor;
  setValue($('brightnessSlider'), target.brightness);
  $('brightnessValue').textContent = `${target.brightness}%`;
  if (!isBeingUsed($('digitalStyleSelect'))) fillSelect($('digitalStyleSelect'), DIGITAL_STYLES, target.digitalStyle);
  if (!isBeingUsed($('analogStyleSelect'))) fillSelect($('analogStyleSelect'), ANALOG_STYLES, target.analogStyle);
  renderThemeGrid();
  fitSettingsWindow();
}

function wireSettingsTab() {
  for (const tab of document.querySelectorAll('.sub-tab')) {
    tab.addEventListener('click', () => selectSettingsSub(tab.dataset.sub));
  }

  $('clockZone').addEventListener('change', (event) => {
    const zone = event.target.value;
    if (!zone) {
      // 메인 시계만 고를 수 있는 "이 컴퓨터 시간".
      patchSettings({ zone: null, city: '' });
    } else {
      const city = CITIES.find((entry) => entry.zone === zone);
      patchSettings(city ? { zone, city: city.city, region: city.country } : { zone });
    }
    renderSettingsTab();
  });

  $('clockShowCity').addEventListener('change', (event) => patchSettings({ showCity: event.target.checked }));

  // 맡은 시계를 닫으면 이 설정 창도 닫힌다 (clocks:changed 를 받아서).
  $('clockCloseBtn').addEventListener('click', () => {
    if (!editingClock()) return;
    api.clocks.close(clockTarget);
  });

  // 알람음·볼륨은 앱 전체가 함께 쓴다 — 고른 시계와 상관없이 메인 설정으로 간다.
  $('soundSelect').addEventListener('change', (event) =>
    send({ type: 'settings:patch', patch: { alarmSoundId: event.target.value } })
  );

  $('volumeSlider').addEventListener('input', (event) => {
    const value = Number(event.target.value);
    $('volumeValue').textContent = `${value}%`;
    settings = { ...settings, alarmVolume: value };
    send({ type: 'settings:patch', patch: { alarmVolume: value } });
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
      if (button.disabled) return;
      patchSettings({ use24h: button.dataset.value === '24' });
      renderSettingsTab();
    });
  }

  // 색을 고르면 그 색으로 만든 사용자 정의 테마로 바로 갈아탄다.
  $('customThemeColor').addEventListener('input', (event) => {
    const value = event.target.value.toUpperCase();
    $('customThemeColorValue').textContent = value;
    useCustomTheme({ customThemeColor: value });
  });

  for (const button of document.querySelectorAll('#themeBaseGroup .seg-btn')) {
    button.addEventListener('click', () => setThemeBase(button.dataset.value === 'light'));
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

  $('fullscreenBtn').addEventListener('click', () => api.fullscreen.open());
}

// ── 상태 수신 ───────────────────────────────────────────────────────────

function applyState(state) {
  const themeChanged =
    !settings ||
    settings.theme !== state.settings.theme ||
    settings.customThemeColor !== state.settings.customThemeColor ||
    settings.customThemeLight !== state.settings.customThemeLight;
  settings = state.settings;
  alarms = state.alarms;
  timerViews = state.timers;
  stopwatchView = state.stopwatch;
  events = state.events;

  if (themeChanged) {
    setCustomTheme(settings.customThemeColor, settings.customThemeLight);
    applyTheme(settings.theme);
  }
  document.documentElement.style.setProperty('--digital-text-color', settings.digitColor);

  $('worldUse24h').checked = !!settings.worldUse24h;
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
  // 분리한 기능 창은 그 창을 닫고, 설정 패널은 패널을 닫는다.
  $('panelCloseBtn').addEventListener('click', () => {
    if (isToolWindow) api.window.closeSelf();
    else api.panel.close();
  });
  // 설정 패널을 떠 있는 창으로 떼어낸다 (기능 창에서는 숨긴다).
  $('panelDetachBtn').addEventListener('click', () => {
    api.tools.open(activeTab);
    if (!isToolWindow) api.panel.close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    // 열려 있는 입력 폼이 있으면 폼만 닫고, 없으면 창을 닫는다.
    const openForm = [$('alarmForm'), $('eventForm')].find((form) => !form.hidden);
    if (openForm) {
      openForm.hidden = true;
      editingAlarmId = null;
      editingEventId = null;
      return;
    }
    if (isToolWindow) api.window.closeSelf();
    else api.panel.close();
  });

  api.panel.onTab((tab) => selectTab(tab));
  api.panel.onSide((right) => document.body.classList.toggle('panel-left', !right));
  // 맡은 시계가 닫히면 이 설정 창도 할 일이 없다.
  api.clocks.onChanged((list) => {
    clocks = Array.isArray(list) ? list : [];
    if (clockTarget !== 'main' && !clocks.some((clock) => clock.id === clockTarget)) {
      api.window.closeSelf();
      return;
    }
    renderSettingsTab();
  });
}

async function init() {
  settings = await api.settings.load();
  clocks = await api.clocks.list();
  setCustomTheme(settings.customThemeColor, settings.customThemeLight);
  applyTheme(settings.theme);

  // 창 하나가 한 가지만 맡는다 — 탭 줄 대신 제목만 남긴다.
  document.body.classList.add('tool-window');
  // 설정 창은 갈래 탭으로 나눠 한 화면에 담는다 (스크롤 막대 없음).
  document.body.classList.toggle('settings-window', onlyTab === 'settings');
  $('panelDetachBtn').hidden = isToolWindow;

  wireTabs();
  selectSettingsSub(settingsSub);
  wireWorldTab();
  wireAlarmTab();
  wireStopwatchTab();
  wireCalendarTab();
  wireSettingsTab();
  $('timerAddBtn').addEventListener('click', () => send({ type: 'timer:add' }));

  api.bus.onFromClock((message) => {
    if (message && message.type === 'state') applyState(message);
  });
  send({ type: 'request:state' });

  selectTab(onlyTab);

  // 메인 시계의 설정 패널은 열어 달라고 한 탭 정보를 비워 둔다.
  if (!isToolWindow) await api.panel.pendingTab();

  window.setInterval(() => {
    updateWorldTimes();
    if (activeTab === 'timer') refreshRunningTimers();
    if (activeTab === 'stopwatch' && stopwatchView.running) {
      $('swDisplay').textContent = formatCentiseconds(stopwatchElapsed());
    }
  }, 100);
}

init();
