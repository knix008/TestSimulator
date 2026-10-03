'use strict';

/**
 * 설정 패널 창을 창 없이 돌려 보는 하네스.
 *
 * panel.html 을 작은 DOM 으로 세우고, 그 문서가 읽어 들이는 스크립트를 순서대로
 * 같은 전역에 넣어 진짜 panel.js 를 돌린다. 시계 창은 가짜다 — 패널이 보낸
 * 명령을 받아 적고, 검사가 돌려주고 싶은 상태를 넣어 줄 수 있다.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDocument } = require('./minidom');

const ROOT = path.join(__dirname, '..', '..');

const BASE_SETTINGS = {
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
  alarms: [],
  worldCities: [
    { city: '서울', region: '대한민국', zone: 'Asia/Seoul' },
    { city: '뉴욕', region: '미국 동부', zone: 'America/New_York' }
  ],
  timers: [{ label: '', hours: 0, minutes: 5, seconds: 0 }],
  alarmSoundId: 'Marimba',
  alarmVolume: 50,
  startWithSystem: false
};

/** 시계 창이 보내는 상태 한 벌. */
function stateFrom(settings, extra = {}) {
  return {
    type: 'state',
    settings,
    alarms: settings.alarms || [],
    timers: [
      {
        id: 'timer-1',
        label: '',
        hours: 0,
        minutes: 5,
        seconds: 0,
        state: 'Idle',
        remainingMs: 300000,
        endAt: 0,
        durationMs: 300000,
        display: '00:05:00.00',
        startLabel: '시작',
        canStart: true,
        canStop: false
      }
    ],
    stopwatch: { running: false, startedAt: 0, accumulated: 0, elapsedMs: 0, display: '00:00:00.00', laps: [] },
    events: [],
    ...extra
  };
}

async function openPanelWindow(options = {}) {
  const document = createDocument(fs.readFileSync(path.join(ROOT, 'src', 'panel.html'), 'utf8'));

  const settings = { ...BASE_SETTINGS, ...(options.settings || {}) };
  const log = {
    toClock: [],
    panelCloses: 0,
    fullscreens: 0,
    startupSet: [],
    clockUpdates: [],
    fits: [],
    sizes: [],
    clocksAdded: [],
    clocksClosed: [],
    toolsOpened: [],
    selfClosed: 0
  };
  const handlers = {};
  let pendingTab = options.tab === undefined ? null : options.tab;
  let startup = options.startup === true;
  /** @type {any[]} 추가 시계 — 메인 프로세스가 들고 있는 목록을 흉내 낸다. */
  let clocks = (options.clocks || []).map((clock, index) => ({
    id: clock.id || `clock-${index + 1}`,
    city: clock.city || '도시',
    region: clock.region || '',
    zone: clock.zone || 'Asia/Seoul',
    showCity: clock.showCity !== false,
    theme: clock.theme || 'DarkTheme',
    customThemeColor: clock.customThemeColor || '#89B4FA',
    customThemeLight: clock.customThemeLight === true,
    isDigital: clock.isDigital !== false,
    digitalStyle: clock.digitalStyle || 'SevenSegment',
    analogStyle: clock.analogStyle || 'Classic',
    use24h: clock.use24h === true,
    brightness: clock.brightness ?? 50,
    digitColor: clock.digitColor || '#58A6FF',
    amPmColor: clock.amPmColor || '#89B4FA',
    windowWidth: 260,
    windowHeight: 180,
    windowLeft: null,
    windowTop: null
  }));

  const api = {
    settings: {
      load: async () => ({ ...settings }),
      defaultCities: async () => BASE_SETTINGS.worldCities
    },
    panel: {
      close: () => {
        log.panelCloses += 1;
      },
      pendingTab: async () => {
        const tab = pendingTab;
        pendingTab = null;
        return tab;
      },
      fit: (size) => log.fits.push(size),
      onTab: (fn) => {
        handlers.tab = fn;
      },
      onSide: (fn) => {
        handlers.side = fn;
      }
    },
    clocks: {
      list: async () => clocks.map((clock) => ({ ...clock })),
      add: async (city) => {
        const config = {
          ...clocks[0],
          id: `clock-new-${clocks.length + 1}`,
          city: city.city,
          region: city.region || city.country || '',
          zone: city.zone,
          theme: settings.theme,
          isDigital: settings.isDigital
        };
        log.clocksAdded.push(city);
        clocks = [...clocks, config];
        return config;
      },
      close: (id) => {
        log.clocksClosed.push(id);
        clocks = clocks.filter((clock) => clock.id !== id);
      },
      update: (id, patch) => {
        log.clockUpdates.push({ id, patch });
        clocks = clocks.map((clock) => (clock.id === id ? { ...clock, ...patch } : clock));
      },
      openSettings: () => {},
      onChanged: (fn) => {
        handlers.clocksChanged = fn;
      }
    },

    tools: {
      open: (tab) => log.toolsOpened.push(tab),
      opened: async () => [...log.toolsOpened]
    },

    window: {
      closeSelf: () => {
        log.selfClosed += 1;
      },
      setSize: (size) => log.sizes.push(size)
    },

    bus: {
      toClock: (message) => log.toClock.push(message),
      onFromClock: (fn) => {
        handlers.fromClock = fn;
      }
    },
    fullscreen: {
      open: () => {
        log.fullscreens += 1;
      }
    },
    startup: {
      get: async () => startup,
      set: async (value) => {
        log.startupSet.push(value);
        startup = value === true;
        return startup;
      }
    }
  };

  const only = options.only || null;
  const clockParam = options.clock ? `&clock=${options.clock}` : '';
  const sandbox = {
    console,
    Math,
    Date,
    JSON,
    URLSearchParams,
    Set,
    Map,
    Number,
    String,
    Object,
    Array,
    Promise,
    Error,
    Intl,
    isNaN,
    parseInt,
    parseFloat,
    Float32Array,
    setTimeout,
    clearTimeout,
    queueMicrotask
  };
  const intervals = [];
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
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    // 알람음은 소리를 내지 않는다 — 미리듣기를 눌러도 Web Audio 를 건드리지 않게 한다.
    AudioContext: function AudioContext() {
      return {
        state: 'running',
        destination: {},
        resume() {},
        createBuffer: (channels, length, rate) => ({ length, sampleRate: rate, getChannelData: () => new Float32Array(length) }),
        createBufferSource: () => ({ buffer: null, loop: false, start() {}, stop() {}, connect: (n) => n, disconnect() {} }),
        createGain: () => ({ gain: { value: 1 }, connect: (n) => n, disconnect() {} })
      };
    }
  };
  const toolFlag = options.tool === true ? '&tool=1' : '';
  sandbox.location = { search: `?only=${only || 'settings'}${toolFlag}${clockParam}` };
  sandbox.document = document;
  sandbox.getComputedStyle = () => ({
    getPropertyValue: (key) => document.documentElement.style.getPropertyValue(key)
  });
  sandbox.globalThis = sandbox;

  const html = fs.readFileSync(path.join(ROOT, 'src', 'panel.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);

  const context = vm.createContext(sandbox);
  for (const src of scripts) {
    const file = path.join(ROOT, 'src', src);
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }

  async function flush(turns = 4) {
    for (let i = 0; i < turns; i++) await new Promise((done) => setImmediate(done));
  }

  await flush();
  // 시계 창이 첫 상태를 돌려준다.
  handlers.fromClock(stateFrom({ ...settings }));
  await flush();

  const $ = (id) => document.getElementById(id);

  return {
    context,
    document,
    log,
    handlers,
    api,
    intervals,
    flush,
    $,
    /** 지금 켜진 탭 */
    activeTab: () => {
      const tab = document.querySelectorAll('.tab').find((node) => node.classList.contains('active'));
      return tab ? tab.dataset.tab : null;
    },
    activePage: () => {
      const page = document.querySelectorAll('.tab-page').find((node) => node.classList.contains('active'));
      return page ? page.dataset.page : null;
    },
    /** 요소를 누르고 처리가 끝나기를 기다린다. */
    click: async (id) => {
      $(id).emit('click');
      await flush();
    },
    emit: async (node, type, event) => {
      (typeof node === 'string' ? $(node) : node).emit(type, event);
      await flush();
    },
    /** 시계 창이 보낸 상태를 넣어 준다. */
    pushState: async (nextSettings, extra) => {
      handlers.fromClock(stateFrom({ ...settings, ...nextSettings }, extra));
      await flush();
    },
    /** 시계 창으로 보낸 설정 변경들 */
    patches: () => log.toClock.filter((m) => m.type === 'settings:patch').map((m) => m.patch),
    lastPatch: () => {
      const list = log.toClock.filter((m) => m.type === 'settings:patch');
      return list.length ? list.at(-1).patch : null;
    },
    /** 메인 프로세스가 탭을 바꿔 달라고 알리기 */
    setTab: async (tab) => {
      handlers.tab(tab);
      await flush();
    },
    themeVar: (key) => document.documentElement.style.getPropertyValue(key),
    themeName: () => document.documentElement.dataset.theme,
    /** 추가 시계 목록 (패널이 보고 있는 것) */
    clocks: () => clocks.map((clock) => ({ ...clock })),
    /** 고른 시계로 보낸 설정 변경들 */
    clockPatches: () => log.clockUpdates.map((entry) => entry.patch),
    lastClockPatch: () => (log.clockUpdates.length ? log.clockUpdates.at(-1) : null),
    /** 이 설정 창이 맡은 시계 */
    target: () => (document.querySelector('.tab[data-tab="settings"] .tab-label') || {}).textContent
  };
}

module.exports = { openPanelWindow, BASE_SETTINGS, stateFrom };
