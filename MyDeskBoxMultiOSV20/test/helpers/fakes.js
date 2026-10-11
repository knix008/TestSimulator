'use strict';

// fences.js depends on electron and the desktop module.
// Tests swap both for fakes so only the pure logic is checked.

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
    // Mimics the window handle passed as the owner of system dialogs.
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

  setIgnoreMouseEvents() {}

  setVisibleOnAllWorkspaces() {}

  close() {
    this.destroyed = true;
    this.emit('closed');
  }

  // Simulates the moment the window has finished rendering.
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
  // What was shown in error dialogs and what text went to the clipboard.
  const errors = [];
  const copied = [];
  let answer = 0;
  // Button to pick in the error dialog: 0 is "Copy", 1 is "Close".
  let fatalPick = 1;
  const ipcListeners = new Map();
  const shell = {
    links: new Map(),
    trashed: [],
    openPath: async (target) => {
      opened.push(target);
      return '';
    },
    trashItem: async (target) => {
      shell.trashed.push(target);
      // Like the real Recycle Bin, the item disappears from its location. Without this,
      // the deleted file stays in the box folder and the folder sync (settleBox) picks it up again.
      try {
        fs.rmSync(target, { recursive: true, force: true });
      } catch (_err) {
        /* Shell items such as the Recycle Bin have no file to delete. */
      }
    },
    readShortcutLink: (target) => {
      if (shell.links.has(target)) return shell.links.get(target);
      throw new Error('not a shortcut');
    },
  };

  class BrowserWindow extends FakeWindow {
    constructor(options) {
      super(options);
      windows.push(this);
    }

    static getAllWindows() {
      return windows.filter((win) => !win.isDestroyed());
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
    // Pretend "Copy" was clicked in the error dialog. After one click, the next pick is "Close".
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
        // Records events registered by main.js so tests can fire 'before-quit' directly.
        handlers: new Map(),
        requestSingleInstanceLock: () => true,
        setAppUserModelId() {},
        getLocale: () => 'ko-KR',
        getVersion: () => '1.0.0',
        exit() {},
        getPath: () => userData,
        getFileIcon: async () => ({ isEmpty: () => true, toDataURL: () => '', getSize: () => ({ width: 0, height: 0 }) }),
        getName: () => 'MyDeskBox',
        // Startup registration only happens for packaged builds; tests act as a packaged build.
        isPackaged: true,
        login: { openAtLogin: false, path: '' },
        setLoginItemSettings(options) {
          this.login = { ...(options || {}) };
        },
        // Like the real app, returns whatever was set. Off if never set.
        getLoginItemSettings() {
          return { openAtLogin: !!this.login.openAtLogin, executableWillLaunchAtLogin: !!this.login.openAtLogin };
        },
        quit() {},
        on(event, fn) {
          const list = this.handlers.get(event) || [];
          list.push(fn);
          this.handlers.set(event, list);
        },
        // Lets tests trigger the event as if it had happened.
        async fire(event, ...args) {
          for (const fn of this.handlers.get(event) || []) await fn(...args);
        },
        whenReady: async () => {},
        commandLine: { appendSwitch() {} },
      },
      BrowserWindow,
      screen: {
        getCursorScreenPoint: () => ({ x: 0, y: 0 }),
        // Includes the work area. Without it, the keep-on-screen and edge-snapping
        // paths are silently skipped in tests.
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
        showErrorBox(title, detail) {
          errors.push({ title, detail });
        },
        // Fatal error dialog. Records what was shown and picks the configured button ("Close" by default).
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
        // Attaches the path so tests can check which file was used as the image.
        createFromPath: (file) => ({
          path: file,
          isEmpty: () => !fs.existsSync(file),
          getSize: () => ({ width: 16, height: 16 }),
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
      ipcMain: {
        on(channel, fn) {
          const list = ipcListeners.get(channel) || [];
          list.push(fn);
          ipcListeners.set(channel, list);
        },
        removeListener(channel, fn) {
          const list = (ipcListeners.get(channel) || []).filter((item) => item !== fn);
          ipcListeners.set(channel, list);
        },
        handle() {},
        // Calls the channel's handlers as if a window had sent the message.
        emit(channel, payload) {
          for (const fn of ipcListeners.get(channel) || []) fn({}, payload);
        },
      },
    },
  };
}

function makeDesktop() {
  const calls = {
    gather: [], release: [], moved: [], placed: [], blocks: [], drags: [],
    emptied: 0, binOwners: [], shutdown: 0, shell: [], hidden: [], revealed: [],
    nudged: [], homed: [], refreshed: [], concealedDirs: [], placedAt: [],
  };
  // Folders treated as the desktop in tests. None by default.
  let deskDirs = [];
  // Desktop icon grid. None by default, so boxes stay exactly where they were drawn.
  let grid = null;
  // Files that currently have the hidden attribute.
  const concealed = new Set();
  return {
    calls,
    concealed,
    // Tells the fake which folders are the desktop.
    useDesktop(...dirs) {
      deskDirs = dirs.filter(Boolean);
    },
    // Sets the desktop icon grid for a test. Boxes snap to it.
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
      // Like the real module, resolves after the system dialog closes.
      emptyRecycle(owner) {
        calls.emptied += 1;
        calls.binOwners.push(owner);
        return Promise.resolve(true);
      },
      syncShellIcons(items) {
        calls.shell.push((items || []).filter((item) => String(item.path).startsWith('shell:')).map((item) => item.path));
      },
      // Pushes desktop icons out from under the boxes.
      nudge(blocks) {
        calls.nudged.push((blocks || []).map((rect) => ({ ...rect })));
        calls.blocks.push(blocks || []);
        return true;
      },
      // Desktop icon grid. Returns only what the test set with useGrid.
      gridInfo() {
        return grid;
      },
      // Hides the storage folder from Explorer.
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
      // Places the icon where it was dropped.
      putAt(name, point) {
        calls.placedAt.push({ name, point });
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
      // Contents of the test desktop folders. Reads the folders directly, like the real module.
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
      claimSingleInstance: () => true,
      unstashFile: (filePath) => filePath,
      recycleCount: () => 0,
      shutdown() {
        calls.shutdown += 1;
      },
    },
  };
}

// Freshly loads fences.js with the fake modules.
function loadHost(state) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-test-'));
  // Copy/paste tests use memory only. They must not touch the user's clipboard.
  require(path.join(__dirname, '..', '..', 'src', 'main', 'clipfiles')).useMemory();
  const electron = makeElectron(userData);
  const desktop = makeDesktop();
  const root = path.join(__dirname, '..', '..', 'src', 'main');
  const fencesPath = path.join(root, 'fences.js');
  const storePath = path.join(root, 'store.js');

  // Prompts return a preset answer without opening a window.
  // If `before` is set, it is called right before answering, to simulate changes while the prompt is open.
  // If `hold` is set to a promise, no answer is given until it resolves, to simulate the dialog staying open.
  const asks = { reply: false, calls: [], before: null, hold: null };
  const askStub = {
    // Notice dialog: nothing to choose, it only informs. Calls are recorded alongside confirm calls.
    notice(options) {
      return askStub.confirm({ ...options, lone: true });
    },
    confirm(options) {
      asks.calls.push(options);
      if (typeof asks.before === 'function') asks.before(options);
      // The answer is read on resolve so tests can change it while the dialog is open.
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
  // autostart and props capture electron when loaded. They must be reloaded per test
  // to use the current fake; otherwise property windows pile up in a previous test's window list.
  delete require.cache[path.join(root, 'autostart.js')];
  delete require.cache[path.join(root, 'props.js')];

  try {
    const { createHost } = require(fencesPath);
    // Load it now while the fakes are installed; loading later would find the real electron.
    const tray = require(trayPath);
    const host = createHost(state);
    // As before, 0 means "Yes" and anything else means "No".
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

// Starts main.js with the fake modules so the full startup and shutdown sequence can be exercised.
async function loadMain(state) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-main-'));
  require(path.join(__dirname, '..', '..', 'src', 'main', 'clipfiles')).useMemory();
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
  // Nothing is saved; the state given by the test is used as is.
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
  for (const file of ['main.js', 'fences.js', 'tray.js', 'icons.js', 'ipc.js', 'autostart.js', 'props.js']) {
    delete require.cache[path.join(root, file)];
  }

  // main.js starts periodic checks. Collect them, since leftover timers keep the process alive after tests.
  const timers = [];
  const realInterval = global.setInterval;
  global.setInterval = (...args) => {
    const timer = realInterval(...args);
    timers.push(timer);
    return timer;
  };

  // Handlers main.js attaches to the process. If left on the test process they leak into later tests,
  // so record which ones were added and remove them at the end.
  // main.js prints crash reports and notices to the console. Keep them in `logs` instead,
  // so a passing run prints nothing besides the test results.
  const logs = [];
  const realConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const level of Object.keys(realConsole)) {
    console[level] = (...args) => logs.push({ level, text: args.map(String).join(' ') });
  }
  const restoreConsole = () => Object.assign(console, realConsole);

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
    // Windows and the tray are created after whenReady finishes.
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
      restoreConsole();
    };
    return {
      electron,
      desktop,
      userData,
      hooks,
      logs,
      quit: async () => {
        await electron.module.app.fire('before-quit');
        stop();
      },
      // Simulates a fatal error. Calls the handlers directly so it doesn't interfere with the test runner.
      crash: (err) => {
        for (const fn of hooks.get('uncaughtException')) fn(err);
        stop();
      },
      // Simulates an interrupt via Ctrl+C.
      signal: (name = 'SIGINT') => {
        for (const fn of hooks.get(name)) fn();
        stop();
      },
      // Exit path where windows never get a chance to close.
      exit: () => {
        for (const fn of hooks.get('exit')) fn();
        stop();
      },
      stop,
    };
  } catch (err) {
    restoreConsole();
    throw err;
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
    items: [],
    ...extra,
  };
}

// Boxes work out of their own folders. Each test gets its own empty storage folder;
// without this, test folders would be created in the real home folder.
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
    root: tempRoot(),
  };
  return {
    version: 1,
    didWelcome: true,
    hidden: false,
    ...extra,
    settings: { ...settings, ...(extra && extra.settings ? extra.settings : {}) },
    fences: (extra && extra.fences) || [],
  };
}

// Selects only box windows, excluding ghost and drawing windows.
function fenceWindows(electron) {
  return electron.windows.filter((win) => win.loaded && /fence\.html$/.test(win.loaded.file));
}

module.exports = { loadHost, loadMain, fence, baseState, tempRoot, fenceWindows, FakeWindow };
