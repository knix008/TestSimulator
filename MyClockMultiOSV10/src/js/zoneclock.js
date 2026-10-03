'use strict';

/**
 * 추가 시계 창.
 *
 * 메인 시계(clock.js)와 달리 앱 상태를 갖지 않는다. 자기 설정 한 벌
 * (시간대·테마·모양)만 들고 그 지역의 시각을 그린다. 알람·타이머·스톱워치·일정은
 * 앱이 하나로 들고 있으므로 여기에는 없다.
 */

const api = window.myclock;

const el = {
  root: document.getElementById('root'),
  chromeBackground: document.getElementById('chromeBackground'),
  cityName: document.getElementById('cityName'),
  headerDate: document.getElementById('headerDate'),
  digitalPanel: document.getElementById('digitalPanel'),
  canvasDigital: document.getElementById('canvasDigital'),
  amPmText: document.getElementById('amPmText'),
  digitalCanvas: document.getElementById('digitalCanvas'),
  textClockBox: document.getElementById('textClockBox'),
  textClockInner: document.getElementById('textClockInner'),
  textTime: document.getElementById('textTime'),
  analogCanvas: document.getElementById('analogCanvas'),
  resizeOutline: document.getElementById('resizeOutline'),
  resizeGrip: document.getElementById('resizeGrip'),
  chromeToolbar: document.getElementById('chromeToolbar'),
  modeToggleBtn: document.getElementById('modeToggleBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  closeBtn: document.getElementById('closeBtn')
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const CHROME_HIDE_DELAY = 400;
const CITY_ROW = 22;

/** @type {any} */ let config = null;
let chromeVisible = false;
let chromeHideHandle = 0;
let menuOpen = false;

const pad2 = (n) => String(n).padStart(2, '0');

function show(node, visible) {
  node.hidden = !visible;
}

// ── 설정 적용 ───────────────────────────────────────────────────────────

function applyConfig(next) {
  config = next;
  if (!config) return;

  // 이 시계의 테마 — 사용자 색은 이 시계가 고른 색으로 만든다.
  setCustomTheme(config.customThemeColor, config.customThemeLight);
  applyTheme(config.theme);
  document.documentElement.style.setProperty('--digital-text-color', config.digitColor);
  document.documentElement.style.setProperty('--digital-ampm-color', config.amPmColor);
  el.digitalPanel.style.opacity = String(Math.max(0, Math.min(100, config.brightness)) / 100);

  el.cityName.textContent = config.showCity ? config.city || config.zone : '';

  const canvasStyle = usesCanvasDigital(config.digitalStyle);
  show(el.canvasDigital, canvasStyle);
  show(el.textClockBox, !canvasStyle);
  if (!canvasStyle) {
    const font = textDigitalFont(config.digitalStyle);
    el.textTime.style.fontFamily = font.family;
    el.textTime.style.fontWeight = String(font.weight);
    el.textTime.style.fontSize = `${font.size}px`;
    el.textTime.style.textShadow = font.glow
      ? `0 0 ${font.glow}px ${config.digitColor}, 0 0 ${font.glow / 2}px ${config.digitColor}`
      : 'none';
  }

  show(el.digitalPanel, config.isDigital);
  show(el.analogCanvas, !config.isDigital);
  el.root.classList.toggle('analog-mode', !config.isDigital);
  show(el.chromeBackground, chromeVisible && config.isDigital);

  el.modeToggleBtn.textContent = config.isDigital ? '◷' : '▦';
  el.modeToggleBtn.title = config.isDigital ? '아날로그 시계로 전환' : '디지털 시계로 전환';

  applyMinSize();
  draw();
}

/** 창이 더 작아지면 시계가 보이지 않으므로 최소 크기를 알려 둔다. */
function applyMinSize() {
  const cityRow = config.showCity ? CITY_ROW : 0;
  const size = config.isDigital
    ? {
        width: 140,
        height: 50 + cityRow + (!config.use24h && usesCanvasDigital(config.digitalStyle) ? 28 : 0)
      }
    : { width: 150, height: 150 + cityRow };
  api.window.setMinSize(size);
}

/** 이 시계의 설정만 바꾼다 — 다른 시계와 메인 시계는 그대로다. */
function patchConfig(patch) {
  if (!config) return;
  config = { ...config, ...patch };
  api.clocks.update(config.id, patch);
  applyConfig(config);
}

// ── 그리기 ──────────────────────────────────────────────────────────────

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

function formatTime(parts, use24h, showSeconds) {
  const h = use24h ? pad2(parts.hour) : pad2(parts.hour % 12 === 0 ? 12 : parts.hour % 12);
  const base = `${h}:${pad2(parts.minute)}`;
  return showSeconds ? `${base}:${pad2(parts.second)}` : base;
}

function draw() {
  if (!config) return;
  const now = new Date();
  const parts = zonedParts(now, config.zone);
  const local = zonedDate(now, config.zone);
  const ampm = config.use24h ? '' : parts.hour < 12 ? '오전' : '오후';

  if (config.isDigital) {
    // 숫자 바로 위 한 줄: 도시 · 오전/오후 · 날짜
    el.amPmText.textContent = ampm;
    const diff = zoneDayDiff(parts, now);
    const date = `${pad2(parts.month)}월 ${pad2(parts.day)}일 ${WEEKDAYS[local.getDay()]}`;
    el.headerDate.textContent = diff ? `${date} (${diff})` : date;

    if (usesCanvasDigital(config.digitalStyle)) {
      const text = formatTime(parts, config.use24h, true);
      if (config.digitalStyle === 'DotMatrix') drawDotMatrix(el.digitalCanvas, text, config.digitColor);
      else drawSevenSegment(el.digitalCanvas, text, config.digitColor);
    } else {
      const showSeconds = config.digitalStyle !== 'Minimal';
      el.textTime.textContent =
        config.digitalStyle === 'Korean'
          ? formatKoreanClock(local, config.use24h, showSeconds)
          : formatTime(parts, config.use24h, showSeconds);
      fitTextClock();
    }
  } else {
    // 아날로그는 도시·오전/오후·날짜를 모두 문자판 안에 그린다 (바깥 글자 없음).
    const label = config.showCity ? config.city || config.zone : '';
    drawAnalogClock(el.analogCanvas, local, config.analogStyle, analogColorsFrom(), label);
  }
}

// ── 창 크롬 (호버 시 표시) ──────────────────────────────────────────────

function setChromeVisible(visible) {
  if (chromeVisible === visible) return;
  chromeVisible = visible;

  // 아날로그는 둥근 문자판 뒤에 사각형이 보이지 않도록 배경을 깔지 않는다.
  show(el.chromeBackground, visible && !!config && config.isDigital);
  show(el.chromeToolbar, visible);
  // 날짜는 호버할 때만 — 도시와 오전/오후는 늘 보인다.
  show(el.headerDate, visible);
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

function openContextMenu() {
  menuOpen = true;
  setChromeVisible(true);
  api.menu.open({
    theme: config.theme,
    customThemeColor: config.customThemeColor,
    customThemeLight: config.customThemeLight,
    items: [
      { id: 'settings', icon: '⚙', label: '이 시계 설정...' },
      {
        id: 'mode',
        icon: config.isDigital ? '◷' : '▦',
        label: config.isDigital ? '아날로그 시계로 전환' : '디지털 시계로 전환'
      },
      { id: 'city', icon: '🏷', label: config.showCity ? '도시 이름 숨기기' : '도시 이름 보이기' },
      { separator: true },
      // 여기서도 시계를 더 둘 수 있게 — 도시는 세계 시간 창에서 고른다.
      { id: 'newclock', icon: '＋', label: '시계 추가...' },
      { id: 'close', icon: '✕', label: '이 시계 닫기' }
    ]
  });
}

const menuActions = {
  settings: () => api.clocks.openSettings(),
  newclock: () => api.tools.open('world'),
  mode: () => patchConfig({ isDigital: !config.isDigital }),
  city: () => patchConfig({ showCity: !config.showCity }),
  close: () => api.window.closeSelf()
};

// ── 초기화 ──────────────────────────────────────────────────────────────

function wireEvents() {
  el.root.addEventListener('mouseenter', () => {
    window.clearTimeout(chromeHideHandle);
    setChromeVisible(true);
  });
  el.root.addEventListener('mouseleave', scheduleHideChrome);

  // 좌클릭 드래그로 창 이동 — 메인 시계와 같은 방식 (메인 프로세스가 커서를 따라간다).
  let gestureActive = false;
  function endGesture() {
    if (!gestureActive) return;
    gestureActive = false;
    api.window.gestureEnd();
  }

  el.root.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('.chrome-btn')) return;
    gestureActive = true;
    try {
      el.root.setPointerCapture(event.pointerId);
    } catch {
      /* 포인터 캡처를 못 잡아도 이동은 된다 */
    }
    if (event.target.closest('.resize-grip')) api.window.resizeStart();
    else api.window.dragStart();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    el.root.addEventListener(type, endGesture);
  }
  // 버튼에서 손을 뗀 이동이 들어오면 끌기가 끝난 것이다 (이벤트를 놓쳤을 때의 안전장치).
  el.root.addEventListener('pointermove', (event) => {
    if (event.buttons === 0) endGesture();
  });
  window.addEventListener('mouseup', endGesture);
  window.addEventListener('blur', endGesture);
  document.addEventListener('visibilitychange', endGesture);

  // 휠로 밝기 조절 — 이 시계만.
  el.root.addEventListener(
    'wheel',
    (event) => {
      if (!config) return;
      const delta = event.deltaY < 0 ? 5 : -5;
      const next = Math.min(100, Math.max(10, config.brightness + delta));
      if (next === config.brightness) return;
      patchConfig({ brightness: next });
    },
    { passive: true }
  );

  el.root.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    openContextMenu();
  });

  el.modeToggleBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    patchConfig({ isDigital: !config.isDigital });
  });
  el.settingsBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    api.clocks.openSettings();
  });
  el.closeBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    api.window.closeSelf();
  });

  window.addEventListener('resize', () => {
    fitTextClock();
    draw();
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

  // 패널에서 이 시계의 설정을 바꾸면 그대로 받아 적용한다.
  api.clock.onConfig((next) => {
    if (next && config && next.id === config.id) applyConfig(next);
  });
}

async function init() {
  const self = await api.clock.self();
  if (!self) return;
  wireEvents();
  applyConfig(self);
  window.setInterval(draw, 200);
}

init();
