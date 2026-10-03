'use strict';

/**
 * 추가 시계 창을 창 없이 돌려 보는 하네스.
 * zoneclock.html 이 읽어 들이는 스크립트를 한 샌드박스에 넣어 진짜 zoneclock.js 를 돌린다.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { FakeElement } = require('./clockwindow');

const ROOT = path.join(__dirname, '..', '..');

const BASE_CLOCK = {
  id: 'clock-1',
  city: '뉴욕',
  region: '미국 동부',
  zone: 'America/New_York',
  showCity: true,
  theme: 'DarkTheme',
  customThemeColor: '#89B4FA',
  customThemeLight: false,
  isDigital: true,
  digitalStyle: 'SevenSegment',
  analogStyle: 'Classic',
  use24h: false,
  brightness: 50,
  digitColor: '#58A6FF',
  amPmColor: '#89B4FA',
  windowWidth: 260,
  windowHeight: 180,
  windowLeft: null,
  windowTop: null
};

async function openZoneClockWindow(options = {}) {
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

  let config = { ...BASE_CLOCK, ...(options.clock || {}) };
  const log = { updates: [], closed: 0, settingsOpened: 0, menus: [], minSizes: [], toolsOpened: [] };
  const handlers = {};

  const api = {
    clock: {
      self: async () => ({ ...config }),
      onConfig: (fn) => {
        handlers.config = fn;
      }
    },
    clocks: {
      update: (id, patch) => {
        log.updates.push({ id, patch });
        config = { ...config, ...patch };
      },
      close: (id) => {
        log.closed += 1;
        log.closedId = id;
      },
      openSettings: () => {
        log.settingsOpened += 1;
      }
    },
    window: {
      setMinSize: (size) => log.minSizes.push(size),
      dragStart: () => {},
      resizeStart: () => {},
      gestureEnd: () => {},
      closeSelf: () => {
        log.closed += 1;
      }
    },
    tools: {
      open: (tab) => log.toolsOpened.push(tab)
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
    Intl,
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
    clearTimeout: (handle) => clearTimeout(handle)
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

  const html = fs.readFileSync(path.join(ROOT, 'src', 'zoneclock.html'), 'utf8');
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

  return {
    context,
    log,
    handlers,
    element,
    themeVars,
    documentElement,
    intervals,
    flush,
    config: () => ({ ...config }),
    /** 메인 루프 한 번 */
    draw: () => context.draw(),
    emit: async (id, type, event) => {
      element(id).emit(type, event);
      await flush();
    },
    chooseMenu: async (id) => {
      handlers.menuAction(id);
      await flush();
    },
    /** 패널에서 이 시계의 설정을 바꿔 보낸다 */
    pushConfig: async (patch) => {
      config = { ...config, ...patch };
      handlers.config({ ...config });
      await flush();
    }
  };
}

module.exports = { openZoneClockWindow, BASE_CLOCK };
