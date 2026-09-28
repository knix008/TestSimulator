'use strict';

// fences.js 는 electron 과 바탕화면 모듈에 기대고 있다.
// 테스트에서는 둘을 가짜로 바꿔 끼워 순수한 판단만 확인한다.

const Module = require('node:module');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const themes = require('../../src/main/themes');
const i18n = require('../../src/shared/i18n');

class FakeWindow extends EventEmitter {
  static count = 0;

  constructor(options) {
    super();
    this.options = options;
    this.bounds = {
      x: options.x || 0,
      y: options.y || 0,
      width: options.width || 0,
      height: options.height || 0,
    };
    this.visible = false;
    this.destroyed = false;
    this.sent = [];
    this.loaded = null;
    this.alwaysOnTop = false;
    // 시스템 창의 주인으로 넘길 창 번호를 흉내 낸다.
    this.handle = Buffer.alloc(8);
    this.handle.writeBigUInt64LE(BigInt(0x10000 + FakeWindow.count));
    FakeWindow.count += 1;
    const self = this;
    this.webContents = {
      send(channel, payload) {
        self.sent.push({ channel, payload });
      },
      isLoading: () => false,
      once() {},
      on() {},
    };
  }

  loadFile(file, opts) {
    this.loaded = { file, opts };
  }

  showInactive() {
    this.visible = true;
    this.emit('show');
  }

  show() {
    this.showInactive();
  }

  hide() {
    this.visible = false;
  }

  focus() {}

  isVisible() {
    return this.visible;
  }

  isDestroyed() {
    return this.destroyed;
  }

  getBounds() {
    return { ...this.bounds };
  }

  getNativeWindowHandle() {
    return this.handle;
  }

  setBounds(rect) {
    this.bounds = { ...this.bounds, ...rect };
  }

  setAlwaysOnTop(value) {
    this.alwaysOnTop = value;
  }

  setVisibleOnAllWorkspaces() {}

  close() {
    this.destroyed = true;
    this.emit('closed');
  }

  // 테스트에서 창이 다 그려진 시점을 흉내 낸다.
  ready() {
    this.emit('ready-to-show');
  }

  messages(channel) {
    return this.sent.filter((entry) => entry.channel === channel).map((entry) => entry.payload);
  }
}

function makeElectron(userData) {
  const windows = [];
  const menus = [];
  const opened = [];
  const trays = [];
  // 오류 창에 보여 준 것과 클립보드로 간 글.
  const errors = [];
  const copied = [];
  let answer = 0;
  // 오류 창에서 고를 단추. 0 이면 '복사', 1 이면 '닫기'.
  let fatalPick = 1;
  // 폴더 고르는 창에서 고를 자리. 비어 있으면 취소한 것으로 한다.
  let folder = '';
  const picks = [];
  const shell = {
    links: new Map(),
    trashed: [],
    openPath: async (target) => {
      opened.push(target);
      return '';
    },
    trashItem: async (target) => {
      shell.trashed.push(target);
      // 진짜 휴지통처럼 그 자리에서는 없어진다. 이것이 없으면 지운 파일이
      // 박스 폴더에 남아, 폴더와 맞추는 길(settleBox)이 다시 담아 버린다.
      try {
        fs.rmSync(target, { recursive: true, force: true });
      } catch (_err) {
        /* 휴지통 같은 셸 항목은 지울 파일이 없다. */
      }
    },
    readShortcutLink: (target) => {
      if (shell.links.has(target)) return shell.links.get(target);
      throw new Error('바로가기가 아니다');
    },
  };

  class BrowserWindow extends FakeWindow {
    constructor(options) {
      super(options);
      windows.push(this);
    }
  }

  return {
    windows,
    menus,
    opened,
    trays,
    shell,
    errors,
    copied,
    setDialogAnswer(value) {
      answer = value;
    },
    // 폴더 고르는 창에서 이 폴더를 고른 것으로 한다. 빈 글자를 주면 취소한 것이 된다.
    pickFolder(dir) {
      folder = String(dir || '');
    },
    picks,
    // 오류 창에서 '복사'를 누른 것으로 한다. 한 번 누르면 다음에는 닫는다.
    copyOnFatal() {
      fatalPick = 0;
      let turns = 0;
      const stop = () => {
        turns += 1;
        if (turns >= 1) fatalPick = 1;
      };
      const write = copied.push.bind(copied);
      copied.push = (...args) => {
        stop();
        return write(...args);
      };
    },
    module: {
      app: {
        // main.js 가 건 이벤트를 적어 둔다. 검사에서 'before-quit' 을 직접 부를 수 있다.
        handlers: new Map(),
        requestSingleInstanceLock: () => true,
        setAppUserModelId() {},
        getLocale: () => 'ko-KR',
        getVersion: () => '1.0.0',
        exit() {},
        getPath: () => userData,
        getFileIcon: async () => ({ isEmpty: () => true, toDataURL: () => '', getSize: () => ({ width: 0, height: 0 }) }),
        getName: () => 'MyDeskBox',
        // 설치본일 때만 시작프로그램에 적는다. 검사에서는 설치본인 것으로 둔다.
        isPackaged: true,
        login: { openAtLogin: false, path: '' },
        setLoginItemSettings(options) {
          this.login = { ...(options || {}) };
        },
        // 진짜 앱처럼 적어 둔 것을 그대로 돌려준다. 적은 적이 없으면 꺼져 있다.
        getLoginItemSettings() {
          return { openAtLogin: !!this.login.openAtLogin, executableWillLaunchAtLogin: !!this.login.openAtLogin };
        },
        quit() {},
        on(event, fn) {
          const list = this.handlers.get(event) || [];
          list.push(fn);
          this.handlers.set(event, list);
        },
        // 검사에서 그 이벤트가 일어난 것처럼 만든다.
        async fire(event, ...args) {
          for (const fn of this.handlers.get(event) || []) await fn(...args);
        },
        whenReady: async () => {},
        commandLine: { appendSwitch() {} },
      },
      BrowserWindow,
      screen: {
        getCursorScreenPoint: () => ({ x: 0, y: 0 }),
        // 작업 영역까지 준다. 이것이 없으면 화면 안으로 들이는 길과
        // 가장자리에 붙이는 길이 검사에서 조용히 지나간다.
        getDisplayNearestPoint: () => ({
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          workArea: { x: 0, y: 0, width: 1920, height: 1040 },
        }),
        getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
        dipToScreenPoint: (point) => point,
      },
      shell,
      dialog: {
        showMessageBox: async () => ({ response: answer }),
        // 폴더를 고르는 창. 검사에서 pickFolder 로 정해 준 자리를 고른 것으로 한다.
        showOpenDialog: async (...args) => {
          const options = args.length > 1 ? args[1] : args[0];
          picks.push(options);
          if (!folder) return { canceled: true, filePaths: [] };
          return { canceled: false, filePaths: [folder] };
        },
        showErrorBox(title, detail) {
          errors.push({ title, detail });
        },
        // 큰 오류를 알리는 창. 무엇을 보여 줬는지 적어 두고 '닫기'를 고른 것으로 한다.
        showMessageBoxSync(options) {
          errors.push(options);
          return fatalPick;
        },
      },
      clipboard: {
        writeText(text) {
          copied.push(text);
        },
        readText: () => copied.at(-1) || '',
      },
      Menu: {
        buildFromTemplate(template) {
          menus.push(template);
          return { popup() {} };
        },
      },
      nativeImage: {
        // 어떤 파일을 그림으로 삼았는지 테스트에서 확인할 수 있게 경로를 달아 둔다.
        createFromPath: (file) => ({
          path: file,
          isEmpty: () => !fs.existsSync(file),
          getSize: () => ({ width: 16, height: 16 }),
          // 창에 보낼 때는 크기를 줄여 data URL 로 바꾼다. 진짜 그림처럼 그 길을 열어 둔다.
          resize(size) {
            return { ...this, getSize: () => ({ ...size }) };
          },
          toDataURL: () => `data:image/png;base64,${Buffer.from(String(file)).toString('base64')}`,
        }),
        createEmpty: () => ({ path: null, isEmpty: () => true, getSize: () => ({ width: 0, height: 0 }) }),
        createFromBitmap: (_data, size) => ({
          isEmpty: () => false,
          getSize: () => ({ ...size }),
          resize: () => ({ isEmpty: () => false, getSize: () => ({ width: 16, height: 16 }) }),
          toDataURL: () => 'data:image/png;base64,셸',
        }),
      },
      Tray: class Tray {
        constructor(image) {
          this.image = image;
          this.menu = null;
          trays.push(this);
        }

        setToolTip() {}

        setContextMenu(menu) {
          this.menu = menu;
        }

        on() {}
      },
      ipcMain: { on() {}, handle() {} },
    },
  };
}

function makeDesktop() {
  const calls = {
    gather: [], release: [], moved: [], placed: [], blocks: [], drags: [],
    emptied: 0, binOwners: [], shutdown: 0, shell: [], hidden: [], revealed: [],
    nudged: [], homed: [], refreshed: [], concealedDirs: [],
  };
  // 검사에서 바탕화면으로 볼 폴더. 기본은 없다.
  let deskDirs = [];
  // 바탕화면 아이콘 격자. 기본은 없다고 두어 박스를 그린 자리에 그대로 둔다.
  let grid = null;
  // 지금 숨김 속성이 붙어 있는 파일.
  const concealed = new Set();
  return {
    calls,
    concealed,
    // 검사에서 '이 폴더가 바탕화면이다' 라고 알려 준다.
    useDesktop(...dirs) {
      deskDirs = dirs.filter(Boolean);
    },
    // 검사에서 바탕화면 아이콘 격자를 정해 준다. 박스가 여기에 맞춰진다.
    useGrid(value) {
      grid = value;
    },
    module: {
      nativeIcons: true,
      init() {},
      place(win) {
        calls.placed.push(win);
      },
      gather(items, blocks) {
        calls.gather.push(items.map((item) => item.path));
        calls.blocks.push(blocks || []);
        return true;
      },
      release(items) {
        calls.release.push(items.map((item) => item.path));
      },
      moveIcon(item, point) {
        calls.moved.push({ path: item.path, point });
        return true;
      },
      mouseDown: () => false,
      isShellItem: (value) => String(value || '').startsWith('shell:'),
      shellItems: () => [{ name: '휴지통', path: 'shell:RecycleBinFolder' }],
      fileIcon: () => null,
      watchDrag: (fn) => {
        calls.drags.push(fn);
        return () => {};
      },
      watchDoubleClick: () => () => {},
      watchDesktop: () => () => {},
      labelOf: (name) => String(name).replace(/\.(lnk|url)$/i, ''),
      sameName: () => false,
      // 진짜 모듈처럼 시스템 창이 닫힌 뒤에 답을 준다.
      emptyRecycle(owner) {
        calls.emptied += 1;
        calls.binOwners.push(owner);
        return Promise.resolve(true);
      },
      syncShellIcons(items) {
        calls.shell.push((items || []).filter((item) => String(item.path).startsWith('shell:')).map((item) => item.path));
      },
      // 박스가 깔고 앉은 바탕화면 아이콘을 밖으로 밀어낸다.
      nudge(blocks) {
        calls.nudged.push((blocks || []).map((rect) => ({ ...rect })));
        calls.blocks.push(blocks || []);
        return true;
      },
      // 바탕화면 아이콘 격자. 검사에서 useGrid 로 정해 준 것만 돌려준다.
      gridInfo() {
        return grid;
      },
      // 보관함 폴더를 탐색기에서 감춘다.
      hidePath(dir) {
        calls.concealedDirs.push(dir);
        return true;
      },
      refreshFolder(dir) {
        calls.refreshed.push(dir);
      },
      noteHome() {},
      putHome(names) {
        calls.homed.push((names || []).slice());
        return true;
      },
      hideFile(filePath) {
        if (concealed.has(filePath)) return false;
        concealed.add(filePath);
        calls.hidden.push(filePath);
        return true;
      },
      revealFile(filePath) {
        if (!concealed.has(filePath)) return false;
        concealed.delete(filePath);
        calls.revealed.push(filePath);
        return true;
      },
      isOnDesktop: (filePath) => deskDirs.some((dir) => path.relative(dir, path.dirname(String(filePath))) === ''),
      desktopDirectories: () => deskDirs.slice(),
      // 검사에서 바탕화면으로 본 폴더의 내용. 진짜 모듈처럼 폴더를 그대로 읽는다.
      desktopEntries() {
        const out = [];
        for (const dir of deskDirs) {
          let names = [];
          try {
            names = fs.readdirSync(dir);
          } catch (_err) {
            continue;
          }
          for (const name of names) {
            if (name.startsWith('.')) continue;
            out.push({ name, path: path.join(dir, name) });
          }
        }
        return out;
      },
      // 위와 같되 폴더인지까지 본다. 자동 분류 규칙이 종류를 보려면 이것이 필요하다.
      listDesktopFiles() {
        const out = [];
        for (const dir of deskDirs) {
          let names = [];
          try {
            names = fs.readdirSync(dir);
          } catch (_err) {
            continue;
          }
          for (const name of names) {
            if (name.startsWith('.')) continue;
            const at = path.join(dir, name);
            let directory = false;
            try {
              directory = fs.statSync(at).isDirectory();
            } catch (_err) {
              continue;
            }
            out.push({ name, path: at, directory });
          }
        }
        return out;
      },
      claimSingleInstance: () => true,
      unstashFile: (filePath) => filePath,
      recycleCount: () => 0,
      shutdown() {
        calls.shutdown += 1;
      },
    },
  };
}

// fences.js 를 가짜 모듈과 함께 새로 읽어 온다.
function loadHost(state) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-test-'));
  const electron = makeElectron(userData);
  const desktop = makeDesktop();
  const root = path.join(__dirname, '..', '..', 'src', 'main');
  const fencesPath = path.join(root, 'fences.js');
  const storePath = path.join(root, 'store.js');

  // 묻는 창은 창을 띄우지 않고 미리 정한 답을 준다.
  // before 를 달아 두면 답을 주기 직전에 부른다. 묻는 동안 무엇이 바뀌는 경우를 흉내 낸다.
  // hold 에 약속을 달아 두면 그것이 풀릴 때까지 답하지 않는다. 창이 떠 있는 동안을 흉내 낸다.
  const asks = { reply: false, calls: [], before: null, hold: null };
  const askStub = {
    confirm(options) {
      asks.calls.push(options);
      if (typeof asks.before === 'function') asks.before(options);
      // 답은 풀리는 때에 읽는다. 창이 떠 있는 동안 검사가 답을 바꿀 수 있어야 한다.
      if (asks.hold) return asks.hold.then(() => asks.reply);
      return Promise.resolve(asks.reply);
    },
  };

  const original = Module._resolveFilename;
  const stubs = new Map([
    ['electron', ' electron'],
    ['./desktop', ' desktop'],
    ['./ask', ' ask'],
  ]);
  Module._resolveFilename = function resolve(request, parent, ...rest) {
    if (stubs.has(request)) return stubs.get(request);
    return original.call(this, request, parent, ...rest);
  };
  require.cache[' electron'] = { id: ' electron', filename: ' electron', loaded: true, exports: electron.module };
  require.cache[' desktop'] = { id: ' desktop', filename: ' desktop', loaded: true, exports: desktop.module };
  require.cache[' ask'] = { id: ' ask', filename: ' ask', loaded: true, exports: askStub };
  delete require.cache[fencesPath];
  delete require.cache[storePath];

  const trayPath = path.join(root, 'tray.js');
  const iconsPath = path.join(root, 'icons.js');
  delete require.cache[trayPath];
  delete require.cache[iconsPath];
  // autostart 는 읽을 때 electron 을 붙잡는다. 검사마다 새로 읽어야 이번 가짜를 쓴다.
  delete require.cache[path.join(root, 'autostart.js')];

  try {
    const { createHost } = require(fencesPath);
    // 가짜 모듈이 걸려 있는 동안 미리 읽어 둔다. 나중에 읽으면 진짜 electron 을 찾는다.
    const tray = require(trayPath);
    const host = createHost(state);
    // 지금까지 쓰던 대로 0 이면 '예', 그 밖이면 '아니오' 로 둔다.
    const setAnswer = electron.setDialogAnswer;
    electron.setDialogAnswer = (value) => {
      asks.reply = value === 0;
      setAnswer(value);
    };
    return {
      host,
      electron,
      desktop,
      asks,
      userData,
      installTray: () => tray.install(host),
    };
  } finally {
    Module._resolveFilename = original;
  }
}

// main.js 를 가짜 모듈과 함께 띄운다. 시작과 종료 절차를 그대로 밟아 볼 수 있다.
async function loadMain(state) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-main-'));
  const electron = makeElectron(userData);
  const desktop = makeDesktop();
  const root = path.join(__dirname, '..', '..', 'src', 'main');
  const mainPath = path.join(root, 'main.js');

  const original = Module._resolveFilename;
  const stubs = new Map([
    ['electron', '\u0000electron'],
    ['./desktop', '\u0000desktop'],
    ['./ask', '\u0000ask'],
    ['./store', '\u0000store'],
  ]);
  const askStub = { confirm: () => Promise.resolve(false), notice: () => Promise.resolve() };
  // 저장은 하지 않는다. 검사에서 준 상태를 그대로 쓴다.
  const storeStub = {
    load: () => state,
    save() {},
    defaults: () => state,
    normalizeFence: (raw) => raw,
  };
  Module._resolveFilename = function resolve(request, parent, ...rest) {
    if (stubs.has(request)) return stubs.get(request);
    return original.call(this, request, parent, ...rest);
  };
  require.cache['\u0000electron'] = { id: '\u0000electron', filename: '\u0000electron', loaded: true, exports: electron.module };
  require.cache['\u0000desktop'] = { id: '\u0000desktop', filename: '\u0000desktop', loaded: true, exports: desktop.module };
  require.cache['\u0000ask'] = { id: '\u0000ask', filename: '\u0000ask', loaded: true, exports: askStub };
  require.cache['\u0000store'] = { id: '\u0000store', filename: '\u0000store', loaded: true, exports: storeStub };
  for (const file of ['main.js', 'fences.js', 'tray.js', 'icons.js', 'ipc.js', 'autostart.js']) {
    delete require.cache[path.join(root, file)];
  }

  // main.js 는 주기 확인을 건다. 검사가 끝나도 남으면 프로세스가 끝나지 않으므로 모아 둔다.
  const timers = [];
  const realInterval = global.setInterval;
  global.setInterval = (...args) => {
    const timer = realInterval(...args);
    timers.push(timer);
    return timer;
  };

  // main.js 가 프로세스에 거는 손잡이. 검사 프로세스에 남으면 다음 검사까지 따라가므로
  // 무엇이 늘었는지 적어 두었다가 끝날 때 떼어 낸다.
  const SIGNALS = ['uncaughtException', 'unhandledRejection', 'exit', 'SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'];
  const had = new Map(SIGNALS.map((name) => [name, new Set(process.listeners(name))]));
  const added = () => {
    const rows = new Map();
    for (const name of SIGNALS) {
      rows.set(name, process.listeners(name).filter((fn) => !had.get(name).has(fn)));
    }
    return rows;
  };

  try {
    require(mainPath);
    // whenReady 가 끝난 뒤에 창과 트레이가 생긴다.
    await new Promise((done) => setImmediate(done));
    await new Promise((done) => setImmediate(done));
    const hooks = added();
    const unhook = () => {
      for (const [name, list] of hooks) {
        for (const fn of list) process.removeListener(name, fn);
      }
    };
    const stop = () => {
      for (const timer of timers) clearInterval(timer);
      unhook();
    };
    return {
      electron,
      desktop,
      userData,
      hooks,
      quit: async () => {
        await electron.module.app.fire('before-quit');
        stop();
      },
      // 큰 오류가 난 것처럼 만든다. 손잡이를 직접 불러 검사 실행기와 섞이지 않게 한다.
      crash: (err) => {
        for (const fn of hooks.get('uncaughtException')) fn(err);
        stop();
      },
      // Ctrl+C 로 끊은 것처럼 만든다.
      signal: (name = 'SIGINT') => {
        for (const fn of hooks.get(name)) fn();
        stop();
      },
      // 창을 닫지 못하고 끝나는 길.
      exit: () => {
        for (const fn of hooks.get('exit')) fn();
        stop();
      },
      stop,
    };
  } finally {
    global.setInterval = realInterval;
    Module._resolveFilename = original;
    delete require.cache[mainPath];
  }
}

function fence(extra) {
  return {
    id: 'a',
    title: '박스',
    x: 100,
    y: 100,
    w: 400,
    h: 300,
    theme: themes.DEFAULT_THEME,
    opacity: themes.DEFAULT_OPACITY,
    collapsed: false,
    // 박스가 선 바탕화면 페이지. 첫 페이지의 이름은 store.js 가 정한다.
    page: 'main',
    // 폴더 포털이면 비출 폴더. 보통 박스는 비어 있다.
    portal: '',
    look: themes.normalizeLook(null),
    items: [],
    ...extra,
  };
}

// 박스는 제 폴더에서 돌아간다. 검사마다 빈 보관함 폴더를 따로 준다.
// 이 값이 없으면 진짜 집 폴더에 검사용 폴더가 생긴다.
function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-root-'));
}

function baseState(extra) {
  const settings = {
    lang: i18n.DEFAULT_LANG,
    openAtLogin: false,
    theme: themes.DEFAULT_THEME,
    opacity: themes.DEFAULT_OPACITY,
    corner: themes.DEFAULT_CORNER,
    shadow: false,
    openWith: 'double',
    // 이 아래의 검사는 대부분 '담으면 파일이 박스 폴더로 옮겨 간다' 는 길을 본다.
    // 그래서 여기서는 옮기기로 못 박는다. 그대로 두기는 test/take.test.js 가 따로 본다.
    // (프로그램의 기본값은 그대로 두기다. store.defaults 를 보는 검사가 그것을 지킨다.)
    takeWith: 'move',
    // 규칙대로 저절로 담는 일은 사람이 켜 주기 전에는 하지 않는다.
    autoSort: false,
    rules: [],
    root: tempRoot(),
  };
  return {
    version: 2,
    didWelcome: true,
    hidden: false,
    pages: [{ id: 'main', name: '' }],
    page: 'main',
    snaps: [],
    ...extra,
    settings: { ...settings, ...(extra && extra.settings ? extra.settings : {}) },
    fences: (extra && extra.fences) || [],
  };
}

// ghost 나 그리기 창을 빼고 박스 창만 고른다.
function fenceWindows(electron) {
  return electron.windows.filter((win) => win.loaded && /fence\.html$/.test(win.loaded.file));
}

module.exports = { loadHost, loadMain, fence, baseState, tempRoot, fenceWindows, FakeWindow };
