'use strict';

/**
 * 시계 창 컨트롤러 — MyClockWinV10/MainWindow.xaml.cs 이식.
 *
 * 이 창이 앱 상태(설정·알람·타이머·스톱워치·일정)의 주인이다.
 * 설정 패널 창은 순수한 보기 역할이며 bus 를 통해 명령을 보내고 상태를 받아본다.
 */

const api = window.myclock;

const el = {
  root: document.getElementById('root'),
  chromeBackground: document.getElementById('chromeBackground'),
  digitalPanel: document.getElementById('digitalPanel'),
  canvasDigital: document.getElementById('canvasDigital'),
  amPmText: document.getElementById('amPmText'),
  digitalCanvas: document.getElementById('digitalCanvas'),
  textClockBox: document.getElementById('textClockBox'),
  textClockInner: document.getElementById('textClockInner'),
  textAmPm: document.getElementById('textAmPm'),
  textTime: document.getElementById('textTime'),
  analogCanvas: document.getElementById('analogCanvas'),
  headerDate: document.getElementById('headerDate'),
  clockStatus: document.getElementById('clockStatus'),
  resizeOutline: document.getElementById('resizeOutline'),
  resizeGrip: document.getElementById('resizeGrip'),
  chromeToolbar: document.getElementById('chromeToolbar'),
  modeToggleBtn: document.getElementById('modeToggleBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  trayCanvas: document.getElementById('trayCanvas')
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const CHROME_HIDE_DELAY = 400;

const DIGITAL_MIN_WIDTH = 140;
const DIGITAL_MIN_HEIGHT = 50;
const DIGITAL_AMPM_ROW = 28;
const ANALOG_MIN_WIDTH = 150;
const ANALOG_MIN_HEIGHT = 150;

const DEFAULT_DIGIT_COLOR = '#58A6FF';
const DEFAULT_AMPM_COLOR = '#89B4FA';

/** @type {any} */ let settings = null;
/** @type {any[]} */ let alarms = [];
/** @type {CountdownTimer[]} */ let timers = [];
const stopwatch = new Stopwatch();
/** @type {any[]} */ let calendarEvents = [];

let chromeVisible = false;
let chromeHideHandle = 0;
let panelOpen = false;
let panelTab = 'world';
let menuOpen = false;
let brightnessSaveHandle = 0;
let statusResetHandle = 0;
let lastTraySecond = -1;
const firedAlarms = new Set();
const firedEvents = new Set();

// 모드별 창 기하 — 디지털↔아날로그 전환 시 각자의 크기를 되살린다.
const modeGeometry = {
  digital: { width: 300, height: 300, x: null, y: null },
  analog: { width: 300, height: 300, x: null, y: null }
};

/**
 * 최소화·숨김 중에는 창 크기가 0에 가깝게 보고될 수 있다.
 * 그런 값을 저장하면 다음 실행에서 창이 사라지므로 걸러낸다.
 */
function isUsableBounds(bounds) {
  return (
    !!bounds &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width >= DIGITAL_MIN_WIDTH &&
    bounds.height >= DIGITAL_MIN_HEIGHT
  );
}

function rememberGeometry(bounds) {
  if (!isUsableBounds(bounds)) return false;
  const mode = settings.isDigital ? 'digital' : 'analog';
  modeGeometry[mode] = { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y };
  return true;
}

// ── 유틸 ────────────────────────────────────────────────────────────────

const pad2 = (n) => String(n).padStart(2, '0');

function formatDateHeader(date) {
  return `${date.getFullYear()}년 ${pad2(date.getMonth() + 1)}월 ${pad2(date.getDate())}일  ${WEEKDAYS[date.getDay()]}`;
}

function hour12(date) {
  const h = date.getHours() % 12;
  return h === 0 ? 12 : h;
}

function formatClockTime(date, use24h, showSeconds) {
  const h = use24h ? pad2(date.getHours()) : pad2(hour12(date));
  const base = `${h}:${pad2(date.getMinutes())}`;
  return showSeconds ? `${base}:${pad2(date.getSeconds())}` : base;
}

function show(node, visible) {
  node.hidden = !visible;
}

// ── 테마 / 스타일 적용 ──────────────────────────────────────────────────

/**
 * 테마가 정의한 디지털 표시 색.
 * 숫자는 DigitalTextBrush, 오전/오후는 AccentBrush 를 따른다.
 */
function themeDisplayColors(name) {
  const vars = (THEMES[name] || THEMES.DarkTheme).vars;
  return {
    digitColor: vars['--digital-text'] || DEFAULT_DIGIT_COLOR,
    amPmColor: vars['--accent'] || DEFAULT_AMPM_COLOR
  };
}

function applyThemeSettings() {
  applyTheme(settings.theme);
  document.documentElement.style.setProperty('--digital-text-color', settings.digitColor);
  document.documentElement.style.setProperty('--digital-ampm-color', settings.amPmColor);
  el.digitalPanel.style.opacity = String(Math.max(0, Math.min(100, settings.brightness)) / 100);
  applyDigitalStyle();
}

/** 텍스트 디지털 스타일의 글꼴·굵기·발광을 적용한다. */
function applyDigitalStyle() {
  const canvasStyle = usesCanvasDigital(settings.digitalStyle);
  show(el.canvasDigital, canvasStyle);
  show(el.textClockBox, !canvasStyle);

  if (!canvasStyle) {
    const font = textDigitalFont(settings.digitalStyle);
    el.textTime.style.fontFamily = font.family;
    el.textTime.style.fontWeight = String(font.weight);
    el.textTime.style.fontSize = `${font.size}px`;
    el.textTime.style.textShadow = font.glow
      ? `0 0 ${font.glow}px ${settings.digitColor}, 0 0 ${font.glow / 2}px ${settings.digitColor}`
      : 'none';
  }
  applyClockModeMinSize();
}

function applyClockMode() {
  show(el.digitalPanel, settings.isDigital);
  show(el.analogCanvas, !settings.isDigital);
  updateModeToggle();
  applyClockModeMinSize();
}

/** 호버 툴바의 토글 버튼을 "지금 전환하면 될 모드"로 표시한다. */
function updateModeToggle() {
  const toAnalog = settings.isDigital;
  el.modeToggleBtn.textContent = toAnalog ? '◷' : '▦';
  el.modeToggleBtn.title = toAnalog ? '아날로그 시계로 전환' : '디지털 시계로 전환';
}

function applyClockModeMinSize() {
  const size = settings.isDigital
    ? {
        width: DIGITAL_MIN_WIDTH,
        height:
          DIGITAL_MIN_HEIGHT +
          (!settings.use24h && usesCanvasDigital(settings.digitalStyle) ? DIGITAL_AMPM_ROW : 0)
      }
    : { width: ANALOG_MIN_WIDTH, height: ANALOG_MIN_HEIGHT };
  api.window.setMinSize(size);
}

// ── 시계 표시 ───────────────────────────────────────────────────────────

/** WPF Viewbox(Stretch=Uniform) 대응 — 내용 크기를 재서 균일 배율을 건다. */
function fitTextClock() {
  const box = el.textClockBox;
  const inner = el.textClockInner;
  if (box.hidden) return;

  inner.style.transform = 'scale(1)';
  const boxRect = box.getBoundingClientRect();
  const innerRect = inner.getBoundingClientRect();
  if (innerRect.width < 1 || innerRect.height < 1) return;

  const scale = Math.min(boxRect.width / innerRect.width, boxRect.height / innerRect.height);
  inner.style.transform = `scale(${Math.max(0.05, scale)})`;
}

function setAmPm(node, text) {
  node.textContent = text;
}

function drawCanvasDigital(text) {
  if (settings.digitalStyle === 'DotMatrix') drawDotMatrix(el.digitalCanvas, text, settings.digitColor);
  else drawSevenSegment(el.digitalCanvas, text, settings.digitColor);
}

function updateDigital(now) {
  const ampm = settings.use24h ? '' : now.getHours() < 12 ? '오전' : '오후';

  if (usesCanvasDigital(settings.digitalStyle)) {
    setAmPm(el.amPmText, ampm);
    drawCanvasDigital(formatClockTime(now, settings.use24h, true));
  } else {
    setAmPm(el.textAmPm, ampm);
    const showSeconds = settings.digitalStyle !== 'Minimal';
    el.textTime.textContent =
      settings.digitalStyle === 'Korean'
        ? formatKoreanClock(now, settings.use24h, showSeconds)
        : formatClockTime(now, settings.use24h, showSeconds);
    fitTextClock();
  }

  if (statusResetHandle) return;
  el.clockStatus.textContent = '';
  show(el.clockStatus, false);
}

function updateAnalog(now) {
  drawAnalogClock(el.analogCanvas, now, settings.analogStyle, analogColorsFrom());
  const status = settings.use24h
    ? formatClockTime(now, true, true)
    : `${now.getHours() < 12 ? '오전' : '오후'} ${formatClockTime(now, false, true)}`;
  el.clockStatus.textContent = status;
  show(el.clockStatus, chromeVisible);
}

function updateTimerDisplay(timer, now) {
  const text = formatHms(timer.remainingMs);
  const header = timer.isPaused ? '일시정지' : '타이머';

  if (settings.isDigital) {
    if (usesCanvasDigital(settings.digitalStyle)) {
      setAmPm(el.amPmText, header);
      drawCanvasDigital(text);
    } else {
      setAmPm(el.textAmPm, header);
      el.textTime.textContent =
        settings.digitalStyle === 'Korean' ? formatKoreanCountdown(timer.remainingMs, true) : text;
      fitTextClock();
    }
    el.clockStatus.textContent = '타이머';
  } else {
    drawAnalogClock(el.analogCanvas, now, settings.analogStyle, analogColorsFrom());
    el.clockStatus.textContent = text;
  }
  show(el.clockStatus, chromeVisible);
}

/** 밝기 같은 즉석 조작의 결과를 상태 줄에 잠시 띄운다. */
function flashStatus(text) {
  window.clearTimeout(statusResetHandle);
  el.clockStatus.textContent = text;
  show(el.clockStatus, true);
  setChromeVisible(true);
  statusResetHandle = window.setTimeout(() => {
    statusResetHandle = 0;
    redrawNow();
  }, 1400);
}

/**
 * 디지털 표시 밝기를 한 단계 조절한다 (휠 한 칸 = 5%).
 * 저장은 몰아서 하고, 설정 패널의 슬라이더도 따라 움직이도록 상태를 보낸다.
 */
function nudgeBrightness(delta) {
  const next = Math.min(100, Math.max(10, settings.brightness + delta));
  if (next === settings.brightness) return;

  settings.brightness = next;
  el.digitalPanel.style.opacity = String(next / 100);
  flashStatus(`밝기 ${next}%`);

  window.clearTimeout(brightnessSaveHandle);
  brightnessSaveHandle = window.setTimeout(() => {
    persistSettings({ brightness: settings.brightness }).then(broadcastState);
  }, 400);
}

// ── 트레이 아이콘 ───────────────────────────────────────────────────────

function updateTrayIcon(now) {
  if (now.getSeconds() === lastTraySecond) return;
  lastTraySecond = now.getSeconds();
  drawMiniAnalogClock(el.trayCanvas, now, analogColorsFrom());
  api.tray.setIcon(el.trayCanvas.toDataURL('image/png'));
  api.tray.setTooltip(formatClockTime(now, settings.use24h, false));
}

// ── 알람 / 일정 알림 ────────────────────────────────────────────────────

function fireNotification(time, label, header) {
  api.alarm.show({
    time,
    label,
    header,
    soundId: settings.alarmSoundId,
    volume: settings.alarmVolume / 100
  });
}

function checkAlarms(now) {
  const current = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  let changed = false;

  for (const alarm of alarms) {
    if (alarm.time !== current) {
      firedAlarms.delete(alarm.id);
      continue;
    }
    if (!alarm.isEnabled || now.getSeconds() !== 0) continue;

    // 비트 0 = 일요일 … 비트 6 = 토요일 (Date.getDay 와 같은 순서)
    const shouldFire = !alarm.isRepeat || (alarm.repeatDays & (1 << now.getDay())) !== 0;
    if (!shouldFire || firedAlarms.has(alarm.id)) continue;

    firedAlarms.add(alarm.id);
    fireNotification(alarm.time, alarm.label, '알람');
    if (!alarm.isRepeat) {
      alarm.isEnabled = false;
      changed = true;
    }
  }

  if (changed) {
    persistSettings({ alarms });
    broadcastState();
  }
}

function checkCalendarAlarms(now) {
  const nowMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), 0);

  for (const ev of calendarEvents) {
    if (ev.reminderMinutes == null) continue;

    const [y, m, d] = ev.date.split('-').map(Number);
    const [sh, sm] = ev.isAllDay ? [0, 0] : (ev.startTime || '09:00').split(':').map(Number);
    const eventStart = new Date(y, m - 1, d, sh, sm, 0);
    const fireAt = new Date(eventStart.getTime() - ev.reminderMinutes * 60000);
    const fireMinute = new Date(
      fireAt.getFullYear(),
      fireAt.getMonth(),
      fireAt.getDate(),
      fireAt.getHours(),
      fireAt.getMinutes(),
      0
    );

    if (nowMinute.getTime() === fireMinute.getTime()) {
      if (firedEvents.has(ev.id)) continue;
      firedEvents.add(ev.id);
      const timeStr = ev.isAllDay ? `${m}월 ${d}일` : `${m}월 ${d}일 ${ev.startTime}`;
      fireNotification(timeStr, ev.title, '일정 알림');
    } else if (nowMinute.getTime() > fireMinute.getTime() + 60000) {
      firedEvents.delete(ev.id);
    }
  }
}

// ── 메인 루프 ───────────────────────────────────────────────────────────

function activeTimer() {
  return timers.find((t) => t.isRunning) || timers.find((t) => t.isPaused) || null;
}

function tick() {
  const now = new Date();
  el.headerDate.textContent = formatDateHeader(now);

  let completed = false;
  for (const timer of timers) {
    const wasRunning = timer.isRunning;
    timer.tick();
    if (wasRunning && !timer.isRunning) completed = true;
  }

  const active = activeTimer();
  if (active) updateTimerDisplay(active, now);
  else if (settings.isDigital) updateDigital(now);
  else updateAnalog(now);

  checkAlarms(now);
  checkCalendarAlarms(now);
  updateTrayIcon(now);

  // 실행 중인 타이머·스톱워치는 패널이 직접 보간하므로 상태 변화 때만 보낸다.
  if (completed) broadcastState();
}

// ── 설정 저장 / 패널 연동 ───────────────────────────────────────────────

function currentGeometryPatch() {
  const mode = settings.isDigital ? 'digital' : 'analog';
  const geo = modeGeometry[mode];
  const patch = {
    windowWidth: geo.width,
    windowHeight: geo.height,
    windowLeft: geo.x,
    windowTop: geo.y
  };
  patch[`${mode}WindowWidth`] = geo.width;
  patch[`${mode}WindowHeight`] = geo.height;
  patch[`${mode}WindowLeft`] = geo.x;
  patch[`${mode}WindowTop`] = geo.y;
  return patch;
}

async function persistSettings(patch) {
  settings = await api.settings.save({
    ...patch,
    alarms,
    timers: timers.map((t) => t.toSettings()),
    ...currentGeometryPatch()
  });
}

function stateSnapshot() {
  return {
    type: 'state',
    settings,
    alarms,
    timers: timers.map((t) => t.toView()),
    stopwatch: stopwatch.toView(),
    events: calendarEvents
  };
}

function broadcastState() {
  api.bus.toPanel(stateSnapshot());
}

// ── 패널에서 온 명령 처리 ───────────────────────────────────────────────

const panelCommands = {
  async 'settings:patch'(msg) {
    if (Object.prototype.hasOwnProperty.call(msg.patch, 'isDigital')) {
      await setClockMode(msg.patch.isDigital === true);
      return;
    }

    const patch = { ...msg.patch };
    // 테마를 고르면 디지털 표시 색도 그 테마의 색으로 맞춘다.
    // 이후 사용자가 색을 직접 고르면 다음 테마 변경 전까지 그 색이 유지된다.
    if (Object.prototype.hasOwnProperty.call(patch, 'theme')) {
      const themed = themeDisplayColors(patch.theme);
      if (!('digitColor' in patch)) patch.digitColor = themed.digitColor;
      if (!('amPmColor' in patch)) patch.amPmColor = themed.amPmColor;
    }

    await persistSettings(patch);
    applyThemeSettings();
    applyClockMode();
    if (Object.prototype.hasOwnProperty.call(patch, 'alwaysOnTop')) {
      api.window.setAlwaysOnTop(settings.alwaysOnTop);
    }
    redrawNow();
    broadcastState();
  },

  async 'settings:reset'() {
    settings = await api.settings.reset();
    // WPF 판과 같이 기본 도시 목록도 되살린다.
    settings = await api.settings.save({ worldCities: await api.settings.defaultCities() });
    alarms = settings.alarms;
    rebuildTimers();
    firedAlarms.clear();
    applyThemeSettings();
    applyClockMode();
    api.window.setAlwaysOnTop(settings.alwaysOnTop);
    api.window.setSize({ width: settings.windowWidth, height: settings.windowHeight });
    redrawNow();
    broadcastState();
  },

  async 'alarms:set'(msg) {
    alarms = Array.isArray(msg.alarms) ? msg.alarms : [];
    firedAlarms.clear();
    await persistSettings({ alarms });
    broadcastState();
  },

  'timer:command'(msg) {
    const timer = timers.find((t) => t.id === msg.id);
    if (!timer) return;
    if (msg.command === 'start') timer.start();
    else if (msg.command === 'pause') timer.pause();
    else if (msg.command === 'stop') timer.stop();
    else if (msg.command === 'field') timer.setField(msg.field, msg.value);
    else if (msg.command === 'label') timer.label = String(msg.value || '');
    persistSettings({});
    redrawNow();
    broadcastState();
  },

  'timer:add'() {
    addTimer(new CountdownTimer({}));
    persistSettings({});
    broadcastState();
  },

  'timer:remove'(msg) {
    timers = timers.filter((t) => t.id !== msg.id);
    if (timers.length === 0) addTimer(new CountdownTimer({}));
    persistSettings({});
    redrawNow();
    broadcastState();
  },

  'stopwatch:command'(msg) {
    if (msg.command === 'start') stopwatch.start();
    else if (msg.command === 'stop') stopwatch.stop();
    else if (msg.command === 'lap') stopwatch.recordLap();
    else if (msg.command === 'reset') stopwatch.reset();
    broadcastState();
  },

  async 'events:set'(msg) {
    calendarEvents = await api.events.save(Array.isArray(msg.events) ? msg.events : []);
    firedEvents.clear();
    broadcastState();
  },

  'panel:tab-changed'(msg) {
    panelTab = typeof msg.tab === 'string' ? msg.tab : panelTab;
  },

  'request:state'() {
    broadcastState();
  }
};

function handlePanelMessage(msg) {
  if (!msg || typeof msg.type !== 'string') return;
  const handler = panelCommands[msg.type];
  if (handler) handler(msg);
}

// ── 창 크롬 (호버 시 표시) ──────────────────────────────────────────────

function setChromeVisible(visible) {
  if (chromeVisible === visible) return;
  chromeVisible = visible;

  show(el.chromeBackground, visible);
  show(el.chromeToolbar, visible);
  show(el.headerDate, visible);
  show(el.clockStatus, visible && !!el.clockStatus.textContent);
  show(el.resizeOutline, visible);
  show(el.resizeGrip, visible);
}

function scheduleHideChrome() {
  window.clearTimeout(chromeHideHandle);
  chromeHideHandle = window.setTimeout(() => {
    if (menuOpen) return;
    setChromeVisible(false);
  }, CHROME_HIDE_DELAY);
}

// ── 컨텍스트 메뉴 ───────────────────────────────────────────────────────

/**
 * 컨텍스트 메뉴를 연다.
 *
 * 메뉴는 시계 창이 아니라 별도 팝업 창에 그린다. 창 안에 그리면 시계 창 크기
 * (작게는 140×50)에 잘려서 항목이 보이지 않는다.
 */
async function openContextMenu() {
  const maximized = await api.window.isMaximized();
  menuOpen = true;
  setChromeVisible(true);

  api.menu.open({
    theme: settings.theme,
    items: [
      { id: 'settings', icon: '⚙', label: panelOpen ? '설정 닫기' : '설정...' },
      {
        id: 'calendar',
        icon: '🗓',
        label: panelOpen && panelTab === 'calendar' ? '캘린더 닫기' : '캘린더'
      },
      {
        id: 'mode',
        icon: settings.isDigital ? '◷' : '▦',
        label: settings.isDigital ? '아날로그 시계로 전환' : '디지털 시계로 전환'
      },
      { id: 'fullscreen', icon: '⛶', label: '전체 화면 시계' },
      { separator: true },
      { id: 'maximize', icon: '▢', label: maximized ? '창 크기 복원' : '최대화' },
      { id: 'tray', icon: '▾', label: '트레이로 숨기기' },
      { separator: true },
      { id: 'quit', icon: '✕', label: '종료' }
    ]
  });
}

function closeContextMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  api.menu.close();
}

const menuActions = {
  settings: () => api.panel.toggle(),
  calendar: () => {
    if (panelOpen && panelTab === 'calendar') api.panel.close();
    else api.panel.toggle('calendar');
  },
  mode: () => toggleClockMode(),
  fullscreen: () => api.fullscreen.open(),
  maximize: () => api.window.toggleMaximize(),
  tray: () => api.window.hideToTray(),
  quit: () => api.app.quit()
};

// ── 모드 전환 ───────────────────────────────────────────────────────────

function toggleClockMode() {
  return setClockMode(!settings.isDigital);
}

/** 디지털 ↔ 아날로그 전환 — 각 모드의 창 크기·위치를 따로 기억했다가 되살린다. */
async function setClockMode(isDigital) {
  if (settings.isDigital === isDigital) return;

  const bounds = await api.window.getBounds();
  rememberGeometry(bounds);

  settings.isDigital = isDigital;
  const to = settings.isDigital ? 'digital' : 'analog';
  applyClockMode();

  const target = modeGeometry[to];
  const width = target.width || bounds?.width || 300;
  let height = target.height || bounds?.height || 300;
  // 아날로그는 정사각형에 가깝게 — WPF ApplyClockModeLayout 과 같은 보정.
  if (!settings.isDigital && height < width * 0.75) height = width;

  // 크기만 모드별로 되살리고 창은 제자리에 둔다. 모드마다 위치까지 되살리면
  // 전환할 때마다 창이 화면을 가로질러 튄다.
  api.window.setSize({ width, height, x: bounds?.x, y: bounds?.y });

  await persistSettings({ isDigital: settings.isDigital });
  redrawNow();
  broadcastState();
}

function redrawNow() {
  const now = new Date();
  const active = activeTimer();
  if (active) updateTimerDisplay(active, now);
  else if (settings.isDigital) updateDigital(now);
  else updateAnalog(now);
}

// ── 타이머 목록 ─────────────────────────────────────────────────────────

function addTimer(timer) {
  timer.onCompleted = (t) => {
    const label = t.label && t.label.trim() ? t.label : formatHms(t.durationMs);
    fireNotification(formatHms(t.durationMs), label, '타이머 완료');
    redrawNow();
    broadcastState();
  };
  timers.push(timer);
}

function rebuildTimers() {
  timers = [];
  const source = settings.timers && settings.timers.length ? settings.timers : [{}];
  for (const dto of source) addTimer(new CountdownTimer(dto));
}

// ── 초기화 ──────────────────────────────────────────────────────────────

function wireEvents() {
  el.root.addEventListener('mouseenter', () => {
    window.clearTimeout(chromeHideHandle);
    setChromeVisible(true);
  });
  el.root.addEventListener('mouseleave', scheduleHideChrome);

  // 좌클릭 드래그로 창 이동 — 투명 창에서도 안정적이도록 메인 프로세스가 좌표를 따라간다.
  //
  // 포인터 캡처를 잡아 두면 창이 커서를 따라 움직이는 동안에도 pointerup 이 반드시
  // 이 창으로 전달된다. 캡처를 놓치면 제스처가 끝나지 않아 창이 커서에 붙어버린다.
  let gestureActive = false;

  function endGesture() {
    if (!gestureActive) return;
    gestureActive = false;
    api.window.gestureEnd();
  }

  el.root.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.pointerType === 'touch') return;
    closeContextMenu();

    // 툴바 버튼 위에서는 창을 끌지 않는다.
    if (event.target.closest('.chrome-toolbar')) return;

    gestureActive = true;
    try {
      el.root.setPointerCapture(event.pointerId);
    } catch {
      /* 캡처를 못 잡아도 아래 안전장치들이 제스처를 끝낸다 */
    }

    if (event.target.closest('.resize-grip')) api.window.resizeStart();
    else api.window.dragStart();
    event.preventDefault();
  });

  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    el.root.addEventListener(type, endGesture);
  }
  // 버튼에서 손을 뗀 이동이 들어오면 제스처가 끝난 것이다 (이벤트를 놓쳤을 때의 안전장치).
  el.root.addEventListener('pointermove', (event) => {
    if (event.buttons === 0) endGesture();
  });
  window.addEventListener('mouseup', endGesture);
  window.addEventListener('blur', endGesture);
  document.addEventListener('visibilitychange', endGesture);

  // 디지털 시계 위에서 휠을 굴리면 표시 밝기가 바로 바뀐다.
  el.root.addEventListener(
    'wheel',
    (event) => {
      if (!settings.isDigital) return;
      event.preventDefault();
      nudgeBrightness(event.deltaY < 0 ? 5 : -5);
    },
    { passive: false }
  );

  el.root.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    openContextMenu();
  });

  api.menu.onAction((id) => {
    menuOpen = false;
    const action = menuActions[id];
    if (action) action();
  });

  api.menu.onClosed(() => {
    menuOpen = false;
    scheduleHideChrome();
  });

  el.modeToggleBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleClockMode();
  });

  el.settingsBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    api.panel.toggle();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeContextMenu();
  });

  window.addEventListener('resize', () => {
    fitTextClock();
    redrawNow();
  });

  api.window.onBounds((bounds) => {
    rememberGeometry(bounds);
    fitTextClock();
    redrawNow();
  });

  api.panel.onOpened((open) => {
    panelOpen = open;
    if (open) broadcastState();
    else panelTab = 'world';
  });

  api.bus.onFromPanel(handlePanelMessage);
  api.app.onBeforeQuit(() => persistSettings({}));
}

async function init() {
  settings = await api.settings.load();
  alarms = settings.alarms;
  calendarEvents = await api.events.load();

  if (!settings.worldCities) {
    settings.worldCities = await api.settings.defaultCities();
    await api.settings.save({ worldCities: settings.worldCities });
  }

  rebuildTimers();

  const bounds = await api.window.getBounds();
  if (isUsableBounds(bounds)) {
    modeGeometry.digital = {
      width: settings.digitalWindowWidth || bounds.width,
      height: settings.digitalWindowHeight || bounds.height,
      x: settings.digitalWindowLeft ?? bounds.x,
      y: settings.digitalWindowTop ?? bounds.y
    };
    modeGeometry.analog = {
      width: settings.analogWindowWidth || bounds.width,
      height: settings.analogWindowHeight || bounds.height,
      x: settings.analogWindowLeft ?? bounds.x,
      y: settings.analogWindowTop ?? bounds.y
    };
    rememberGeometry(bounds);
  }

  applyThemeSettings();
  applyClockMode();
  api.window.setAlwaysOnTop(settings.alwaysOnTop);

  wireEvents();
  redrawNow();
  window.setInterval(tick, 100);
  tick();
}

init();
