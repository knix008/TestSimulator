'use strict';

/**
 * 시계 창을 창 없이 돌려 보는 하네스.
 *
 * index.html 이 읽어 들이는 스크립트를 같은 전역(샌드박스)에 차례로 넣어,
 * 브라우저가 하는 일을 그대로 흉내 낸다. 그러면 clock.js 안의 함수와 상태를
 * 바깥에서 그대로 부를 수 있다 — 알람이 울리는지, 테마가 적용되는지 따위를
 * 진짜 코드로 확인할 수 있다.
 *
 * DOM·Electron·캔버스는 가짜다. "무엇을 했는지"는 가짜가 받아 적는다.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');

/** index.html 의 <script> 순서 — 실제 창과 어긋나면 검사 의미가 없으므로 문서에서 읽는다. */
function scriptOrder(htmlFile) {
  const html = fs.readFileSync(path.join(ROOT, 'src', htmlFile), 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
}

class FakeClassList {
  constructor() {
    this.set = new Set();
  }
  add(name) {
    this.set.add(name);
  }
  remove(name) {
    this.set.delete(name);
  }
  contains(name) {
    return this.set.has(name);
  }
  toggle(name, force) {
    const on = force === undefined ? !this.set.has(name) : force === true;
    if (on) this.set.add(name);
    else this.set.delete(name);
    return on;
  }
}

class FakeElement {
  constructor(id) {
    this.id = id;
    this.hidden = false;
    this.textContent = '';
    this.style = {};
    this.classList = new FakeClassList();
    this.dataset = {};
    this.listeners = new Map();
    this.clientWidth = 300;
    this.clientHeight = 300;
    this.width = 0;
    this.height = 0;
    this.children = [];
    this.calls = [];
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  /** 검사에서 이벤트를 일으킨다. */
  emit(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) handler({ preventDefault() {}, stopPropagation() {}, ...event });
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setPointerCapture() {}
  releasePointerCapture() {}
  getBoundingClientRect() {
    return { x: 0, y: 0, width: this.clientWidth, height: this.clientHeight, top: 0, left: 0 };
  }

  getContext() {
    if (!this.ctx) this.ctx = fakeContext(this.calls);
    return this.ctx;
  }

  toDataURL() {
    return 'data:image/png;base64,FAKE';
  }
}

function fakeContext(calls) {
  const record = (name) => (...args) => calls.push({ name, args });
  const ctx = {
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arc: record('arc'),
    roundRect: record('roundRect'),
    fill: record('fill'),
    stroke: record('stroke'),
    fillRect: record('fillRect'),
    clearRect: record('clearRect'),
    fillText: record('fillText'),
    setTransform: record('setTransform'),
    save: record('save'),
    restore: record('restore'),
    // 글꼴 크기에 비례하는 어림 너비 — 글자가 칸을 넘치는지 가늠하는 데 쓴다.
    measureText(text) {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(String(ctx.font || '') )?.[1]) || 16;
      return { width: String(text).length * size * 0.62 };
    }
  };
  for (const prop of ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'font', 'globalAlpha', 'textAlign', 'textBaseline']) {
    let value;
    Object.defineProperty(ctx, prop, {
      get: () => value,
      set: (next) => {
        value = next;
        calls.push({ name: `set:${prop}`, args: [next] });
      }
    });
  }
  return ctx;
}

/**
 * 시계 창을 띄운다 (가짜로).
 * @param {object} options.settings 설정 파일에 들어 있는 값
 * @param {any[]} options.events 저장된 일정
 */
async function openClockWindow(options = {}) {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, new FakeElement(id));
    return elements.get(id);
  };

  const themeVars = new Map();
  const documentElement = {
    dataset: {},
    style: {
      setProperty: (key, value) => themeVars.set(key, value),
      getPropertyValue: (key) => themeVars.get(key) || ''
    }
  };

  const log = {
    saved: [],
    toPanel: [],
    alarms: [],
    menus: [],
    panelToggles: [],
    panelCloses: 0,
    trayIcons: 0,
    tooltips: [],
    sizes: [],
    minSizes: [],
    alwaysOnTop: [],
    fullscreens: 0,
    quits: 0,
    hidesToTray: 0,
    maximizeToggles: 0,
    toolsOpened: [],
    clocksAdded: []
  };

  const settings = {
    // store.js 의 기본값과 같은 모양 — 검사에서 필요한 것만 추려 둔다.
    alwaysOnTop: false,
    use24h: false,
    worldUse24h: false,
    theme: 'DarkTheme',
    customThemeColor: '#89B4FA',
    customThemeLight: false,
    brightness: 50,
    digitColor: '#58A6FF',
    amPmColor: '#89B4FA',
    isDigital: true,
    digitalStyle: 'SevenSegment',
    analogStyle: 'Classic',
    windowWidth: 300,
    windowHeight: 300,
    windowLeft: 100,
    windowTop: 100,
    digitalWindowWidth: null,
    digitalWindowHeight: null,
    digitalWindowLeft: null,
    digitalWindowTop: null,
    analogWindowWidth: null,
    analogWindowHeight: null,
    analogWindowLeft: null,
    analogWindowTop: null,
    alarms: [],
    worldCities: [{ city: '서울', region: '대한민국', zone: 'Asia/Seoul' }],
    timers: [{ label: '', hours: 0, minutes: 5, seconds: 0 }],
    alarmSoundId: 'Marimba',
    alarmVolume: 50,
    startWithSystem: false,
    ...(options.settings || {})
  };

  let stored = { ...settings };
  let storedEvents = options.events ? [...options.events] : [];
  const handlers = {};
  let bounds = { x: 100, y: 100, width: 300, height: 300 };
  let maximized = false;

  const api = {
    settings: {
      load: async () => ({ ...stored }),
      save: async (patch) => {
        log.saved.push(patch);
        stored = { ...stored, ...patch };
        return { ...stored };
      },
      reset: async () => {
        stored = { ...settings, alarms: [], theme: 'DarkTheme' };
        return { ...stored };
      },
      defaultCities: async () => [{ city: '서울', region: '대한민국', zone: 'Asia/Seoul' }]
    },
    events: {
      load: async () => [...storedEvents],
      save: async (list) => {
        storedEvents = [...list];
        return [...storedEvents];
      }
    },
    window: {
      getBounds: async () => ({ ...bounds }),
      setBounds: (next) => {
        bounds = { ...bounds, ...next };
      },
      setSize: (next) => {
        log.sizes.push(next);
        bounds = { ...bounds, ...next };
      },
      setMinSize: (size) => log.minSizes.push(size),
      setAlwaysOnTop: (value) => log.alwaysOnTop.push(value),
      isMaximized: async () => maximized,
      toggleMaximize: () => {
        maximized = !maximized;
        log.maximizeToggles += 1;
      },
      hideToTray: () => {
        log.hidesToTray += 1;
      },
      dragStart: () => {},
      resizeStart: () => {},
      gestureEnd: () => {},
      onBounds: (fn) => {
        handlers.bounds = fn;
      }
    },
    tray: {
      setIcon: () => {
        log.trayIcons += 1;
      },
      setTooltip: (text) => log.tooltips.push(text)
    },
    alarm: {
      show: (payload) => log.alarms.push(payload)
    },
    menu: {
      open: (payload) => log.menus.push(payload),
      close: () => {},
      onAction: (fn) => {
        handlers.menuAction = fn;
      },
      onClosed: (fn) => {
        handlers.menuClosed = fn;
      }
    },
    panel: {
      toggle: (tab) => log.panelToggles.push(tab ?? null),
      close: () => {
        log.panelCloses += 1;
      },
      onOpened: (fn) => {
        handlers.panelOpened = fn;
      }
    },
    bus: {
      toPanel: (message) => log.toPanel.push(message),
      onFromPanel: (fn) => {
        handlers.fromPanel = fn;
      }
    },
    fullscreen: {
      open: () => {
        log.fullscreens += 1;
      }
    },
    /** 추가 시계 — 메뉴에서 도시를 고르면 그 도시의 시계가 하나 더 열린다 */
    clocks: {
      add: async (city) => {
        log.clocksAdded.push(city);
        return { id: `clock-${log.clocksAdded.length}`, ...city };
      },
      list: async () => [],
      close: () => {},
      update: () => {},
      onChanged: () => {}
    },
    /** 알람·타이머·스톱워치·캘린더·세계 시간 — 저마다 독립한 창 */
    tools: {
      open: (tab) => log.toolsOpened.push(tab),
      opened: async () => [...log.toolsOpened]
    },
    app: {
      quit: () => {
        log.quits += 1;
      },
      onBeforeQuit: (fn) => {
        handlers.beforeQuit = fn;
      }
    }
  };

  const intervals = [];
  const sandbox = {
    console,
    Math,
    Date,
    JSON,
    Set,
    Map,
    Number,
    String,
    Object,
    Array,
    Promise,
    Error,
    isNaN,
    parseInt,
    parseFloat,
    Float32Array,
    setTimeout,
    clearTimeout,
    queueMicrotask
  };

  sandbox.window = {
    myclock: api,
    devicePixelRatio: 1,
    addEventListener: (type, fn) => {
      handlers[`window:${type}`] = fn;
    },
    setInterval: (fn, delay) => {
      intervals.push({ fn, delay });
      return intervals.length;
    },
    clearInterval: () => {},
    setTimeout: (fn, delay) => setTimeout(fn, delay),
    clearTimeout: (handle) => clearTimeout(handle),
    requestAnimationFrame: (fn) => setTimeout(fn, 0)
  };
  sandbox.document = {
    documentElement,
    getElementById: element,
    addEventListener: (type, fn) => {
      handlers[`document:${type}`] = fn;
    },
    createElement: (tag) => new FakeElement(`<${tag}>`),
    querySelectorAll: () => []
  };
  sandbox.getComputedStyle = () => ({ getPropertyValue: (key) => themeVars.get(key) || '' });
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  for (const src of scriptOrder('index.html')) {
    const file = path.join(ROOT, 'src', src);
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }

  /** 가짜 IPC 는 약속(Promise)으로 답한다. 그 답이 다 돌아올 때까지 기다린다. */
  async function flush(turns = 4) {
    for (let i = 0; i < turns; i++) await new Promise((done) => setImmediate(done));
  }

  // init() 이 await 하는 IPC 가 끝나도록 돌려 준다.
  await flush();

  return {
    context,
    api,
    log,
    handlers,
    element,
    elements,
    themeVars,
    documentElement,
    intervals,
    /** 지금 저장소에 들어 있는 설정 */
    stored: () => ({ ...stored }),
    events: () => [...storedEvents],
    /** 메인 루프 한 번 — tick() */
    tick: () => context.tick(),
    /**
     * 시각을 정해 놓고 메인 루프를 한 번 돌린다.
     * 타이머가 "다 지난" 상황을 기다리지 않고 만들어 볼 때 쓴다.
     */
    tickAt: (timestamp) => {
      const RealDate = context.Date;
      class FrozenDate extends RealDate {
        constructor(...args) {
          if (args.length === 0) return new RealDate(timestamp);
          return new RealDate(...args);
        }
        static now() {
          return timestamp;
        }
      }
      context.Date = FrozenDate;
      try {
        context.tick();
      } finally {
        context.Date = RealDate;
      }
    },
    /** 미뤄 둔 약속·타이머가 끝나기를 기다린다 (IPC 가 비동기라서 필요하다). */
    flush,
    /** 패널에서 온 명령 — 처리가 끝날 때까지 기다린다. */
    fromPanel: async (message) => {
      handlers.fromPanel(message);
      await flush();
    },
    /** 컨텍스트 메뉴 항목 고르기 */
    chooseMenu: async (id) => {
      handlers.menuAction(id);
      await flush();
    },
    /** 요소에 이벤트를 일으키고 처리가 끝나기를 기다린다. */
    emit: async (id, type, event) => {
      element(id).emit(type, event);
      await flush();
    },
    /** 패널이 열렸다/닫혔다고 알리기 */
    setPanelOpen: (open) => handlers.panelOpened(open),
    /** 지금 상태 한 벌 (패널에 보내는 것과 같은 모양) */
    state: async () => {
      handlers.fromPanel({ type: 'request:state' });
      await flush();
      return log.toPanel.at(-1);
    }
  };
}

module.exports = { openClockWindow, FakeElement };
