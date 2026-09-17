const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Menu,
  screen,
  dialog,
  nativeImage,
  clipboard,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const UTIF = require('utif');
const {
  createPty,
  writePty,
  resizePty,
  killPty,
  setPromptTemplate,
  loadDirectoryPrefsFromSettings,
  setStartDirectoryPreference,
  connectSsh,
  disconnectSsh,
  getSessionInfo,
  killSessionsForWindow,
  reattachSession,
  stashAdopt,
  takeAdopt,
  countSessionsForWindow,
  listShells,
  currentShell,
} = require('./pty-manager');
const {
  PRESETS,
  DEFAULT_PROMPT_GIT_MODE,
  normalizePromptGitMode,
  normalizePrompt,
  normalizeCustomPrompts,
} = require('./prompt');
const { defaultShellId, shortName } = require('./shells');
const { normalizeLsColors } = require('./ls-colors');
const {
  createTray,
  destroyTray,
  rebuildMenu,
  isTrayActive,
  setQuitting,
  getIsQuitting,
} = require('./tray');
const { registerPopupIpc, closePopupsForOwner, closeAllPopups, getPopup } = require('./popup');
const { describeError } = require('../shared/error-format');

/**
 * Show an error in a main window's error dialog. `target` is a BrowserWindow
 * (a popup's error goes to the popup's owner); without one, the focused or
 * first main window shows it.
 */
function reportErrorToWindow(target, err, context = 'main') {
  try {
    const info = err && typeof err === 'object' && typeof err.details === 'string' ? err : describeError(err, { context });
    let win = target && !target.isDestroyed() ? target : null;
    if (!win) win = BrowserWindow.getFocusedWindow();
    if (!win || win.isDestroyed() || !windows.has(win)) win = [...windows].find((w) => !w.isDestroyed()) || null;
    if (!win) {
      console.error(`[${context}]`, info.details);
      return false;
    }
    win.webContents.send('app:error', { message: info.message, details: info.details, context });
    return true;
  } catch (e) {
    console.error('reportErrorToWindow failed', e);
    return false;
  }
}

process.on('uncaughtException', (err) => {
  console.error('uncaughtException', err);
  reportErrorToWindow(null, err, 'main');
});
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection', reason);
  reportErrorToWindow(null, reason, 'main');
});
const {
  registerDetachPreviewIpc,
  destroyDetachPreview,
} = require('./detach-preview');

const windows = new Set();
const windowFocusOrder = new WeakMap();
let windowFocusSeq = 0;
/** Last window that was showing a merge-drop ghost tab. */
let lastMergePreviewTargetId = null;

/** Fallback until renderer measures the real toolbar content width. */
const TOOLBAR_MIN_WIDTH = 920;
const WINDOW_MIN_HEIGHT = 420;
const TOOLBAR_MIN_WIDTH_CAP = 1800;

function getIconPath() {
  const candidates = [
    path.join(__dirname, '../../build/icon.png'),
    path.join(__dirname, '../../assets/icons/icon.png'),
    path.join(process.resourcesPath || '', 'icons', 'icon.png'),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function winFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function getUserDataPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readSettings() {
  try {
    const p = getUserDataPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (_) {
    /* ignore */
  }
  return {};
}

function writeSettings(settings) {
  const p = getUserDataPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(settings, null, 2), 'utf8');
}

/** Merge patch into settings.json so renderer updates cannot wipe window state. */
function updateSettings(patch = {}) {
  const next = { ...readSettings(), ...(patch || {}) };
  writeSettings(next);
  return next;
}

function ensureBoundsOnScreen(bounds) {
  const width = Math.max(
    TOOLBAR_MIN_WIDTH,
    Math.min(Math.round(bounds.width) || TOOLBAR_MIN_WIDTH, TOOLBAR_MIN_WIDTH_CAP)
  );
  const height = Math.max(
    WINDOW_MIN_HEIGHT,
    Math.min(Math.round(bounds.height) || 720, 10000)
  );
  let x = Number.isFinite(bounds.x) ? Math.round(bounds.x) : undefined;
  let y = Number.isFinite(bounds.y) ? Math.round(bounds.y) : undefined;

  const displays = screen.getAllDisplays();
  if (!displays.length) {
    return { width, height, x, y };
  }

  const intersects = (area) => {
    if (x === undefined || y === undefined) return false;
    const right = x + width;
    const bottom = y + height;
    return (
      right > area.x + 40 &&
      x < area.x + area.width - 40 &&
      bottom > area.y + 40 &&
      y < area.y + area.height - 40
    );
  };

  const onScreen = displays.some((d) => intersects(d.workArea));
  if (onScreen) return { width, height, x, y };

  const primary = screen.getPrimaryDisplay().workArea;
  const w = Math.min(width, primary.width);
  const h = Math.min(height, primary.height);
  return {
    width: w,
    height: h,
    x: Math.round(primary.x + (primary.width - w) / 2),
    y: Math.round(primary.y + (primary.height - h) / 2),
  };
}

/** True until a window size has been saved: the renderer fits the terminal to its default cols × rows. */
let firstLaunch = false;

function getRestoredWindowOptions() {
  const settings = readSettings();
  const saved = settings.windowBounds;
  const defaults = { width: 1100, height: 720 };
  if (!saved || typeof saved !== 'object') {
    firstLaunch = true;
    return { ...defaults, maximized: !!settings.windowMaximized };
  }
  const restored = ensureBoundsOnScreen({
    x: saved.x,
    y: saved.y,
    width: saved.width || defaults.width,
    height: saved.height || defaults.height,
  });
  return { ...restored, maximized: !!settings.windowMaximized };
}

const windowStateTimers = new WeakMap();

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const maximized = win.isMaximized();
    const bounds = typeof win.getNormalBounds === 'function' && maximized
      ? win.getNormalBounds()
      : win.getBounds();
    updateSettings({
      windowBounds: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      },
      windowMaximized: maximized,
    });
  } catch (_) {
    /* ignore */
  }
}

function scheduleSaveWindowState(win) {
  const prev = windowStateTimers.get(win);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    windowStateTimers.delete(win);
    saveWindowState(win);
  }, 250);
  windowStateTimers.set(win, timer);
}

function createWindow(options = {}) {
  Menu.setApplicationMenu(null);

  const restored = getRestoredWindowOptions();
  const hasExplicitSize =
    Number.isFinite(options.width) || Number.isFinite(options.height);
  const hasExplicitPos =
    Number.isFinite(options.x) || Number.isFinite(options.y);

  // Width starts at the toolbar minimum; renderer refines via setMinSize(resizeToMin).
  // Ignore restored.width so a previously runaway size cannot reopen ultra-wide.
  const width = Math.max(
    TOOLBAR_MIN_WIDTH,
    Math.round(options.width || TOOLBAR_MIN_WIDTH)
  );
  const height = Math.max(
    WINDOW_MIN_HEIGHT,
    Math.round(options.height || restored.height || 720)
  );
  const x = hasExplicitPos
    ? Number.isFinite(options.x)
      ? Math.round(options.x)
      : undefined
    : restored.x;
  const y = hasExplicitPos
    ? Number.isFinite(options.y)
      ? Math.round(options.y)
      : undefined
    : restored.y;

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: TOOLBAR_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    frame: false,
    titleBarStyle: 'hidden',
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    show: false,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  windows.add(win);
  win.on('focus', () => {
    windowFocusOrder.set(win, ++windowFocusSeq);
  });

  const loadOpts = {};
  if (options.adoptSessionId) {
    loadOpts.query = { adopt: String(options.adoptSessionId) };
  }
  win.loadFile(path.join(__dirname, '../renderer/index.html'), loadOpts);

  const shouldMaximize =
    !hasExplicitSize && !options.adoptSessionId && restored.maximized;

  win.once('ready-to-show', () => {
    if (shouldMaximize && !win.isDestroyed()) win.maximize();
    win.show();
    if (options.focus !== false) win.focus();
  });

  win.on('maximize', () => {
    if (!win.isDestroyed()) win.webContents.send('window:maximized', true);
    scheduleSaveWindowState(win);
  });
  win.on('unmaximize', () => {
    if (!win.isDestroyed()) win.webContents.send('window:maximized', false);
    scheduleSaveWindowState(win);
  });
  win.on('resize', () => scheduleSaveWindowState(win));
  win.on('move', () => scheduleSaveWindowState(win));

  // With tray enabled, close hides to tray instead of quitting.
  // webContents.id is unavailable once the window is destroyed ('closed').
  const ownerId = win.webContents.id;
  win.on('close', () => {
    saveWindowState(win);
    // The window's dialogs (settings / SSH / About) go with it. Closing the
    // window really closes it — the tray icon never keeps a closed window
    // hidden around (closing the last window quits the app).
    closePopupsForOwner(ownerId);
  });

  win.on('closed', () => {
    const timer = windowStateTimers.get(win);
    if (timer) clearTimeout(timer);
    windowStateTimers.delete(win);
    killSessionsForWindow(win);
    closePopupsForOwner(ownerId);
    windows.delete(win);
  });

  return win;
}

function readInstallerOptions() {
  const candidates = [
    path.join(process.resourcesPath || '', 'installer-options.json'),
    path.join(path.dirname(process.execPath), 'resources', 'installer-options.json'),
    path.join(path.dirname(process.execPath), 'installer-options.json'),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      }
    } catch (_) {
      /* ignore */
    }
  }
  return null;
}

/** Seed showTrayIcon from the NSIS installer choice when unset. */
function bootstrapSettings() {
  const settings = readSettings();
  if (typeof settings.showTrayIcon === 'boolean') return settings;

  const installer = readInstallerOptions();
  const showTrayIcon =
    installer && typeof installer.showTrayIcon === 'boolean'
      ? installer.showTrayIcon
      : false;
  return updateSettings({ showTrayIcon });
}

function applyTrayFromSettings(settings = {}) {
  const enabled = !!settings.showTrayIcon;
  const lang = settings.lang === 'ko' ? 'ko' : 'en';
  if (enabled) {
    createTray(windows, createWindow, lang);
    rebuildMenu(windows, createWindow, lang);
  } else {
    destroyTray();
    for (const win of windows) {
      if (!win.isDestroyed() && !win.isVisible()) win.show();
    }
  }
}

// Chromium's GPU shader disk cache can fail to initialize on Windows when the
// userData cache dir is locked (a lingering prior instance or antivirus),
// spamming "Unable to move the cache ... (0x5)" / "Gpu Cache Creation failed".
// We don't rely on the persistent shader cache, so disable it for clean startup.
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// Single-instance lock: a second launch would spawn a competing process sharing
// this userData — racing on settings.json (lost saves) and locking the GPU cache.
// Instead, quit the newcomer and surface the window that already owns the lock.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = [...windows][0];
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
  });

  app.whenReady().then(() => {
    registerPopupIpc();
    registerDetachPreviewIpc();
    const settings = bootstrapSettings();
    syncBackgroundSelectionFromSettings(settings);
    loadDirectoryPrefsFromSettings(readSettings());
    applyTrayFromSettings(readSettings());
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('before-quit', () => {
  for (const win of windows) saveWindowState(win);
  closeAllPopups();
  destroyDetachPreview();
  setQuitting(true);
  destroyTray();
  killPty();
});

app.on('window-all-closed', () => {
  // The last window closed → the program ends (the tray icon goes with it),
  // except on macOS where apps stay in the Dock until Quit.
  if (process.platform === 'darwin') return;
  setQuitting(true);
  destroyTray();
  killPty();
  app.quit();
});

ipcMain.handle('window:minimize', (event) => winFromEvent(event)?.minimize());
ipcMain.handle('window:maximize', (event) => {
  const win = winFromEvent(event);
  if (!win) return false;
  if (win.isMaximized()) {
    win.unmaximize();
    return false;
  }
  win.maximize();
  return true;
});
ipcMain.handle('window:close', (event) => {
  const win = winFromEvent(event);
  if (!win) return;
  closePopupsForOwner(win.webContents.id);
  win.close();
});

// Force-quit when the last terminal is closed (e.g. via `exit`). Bypasses the
// tray hide-on-close behavior so the program actually exits. If other windows
// remain open, only the requesting window is closed.
ipcMain.handle('app:quit', (event) => {
  const senderWin = winFromEvent(event);
  const others = [...windows].filter((w) => w !== senderWin && !w.isDestroyed());
  if (others.length > 0) {
    if (senderWin && !senderWin.isDestroyed()) senderWin.destroy();
    return;
  }
  // Last window → tear everything down and quit, ignoring the tray.
  setQuitting(true);
  destroyTray();
  killPty();
  closeAllPopups();
  for (const win of [...windows]) {
    if (win && !win.isDestroyed()) win.destroy();
  }
  app.quit();
});
// Whole-window translucency (toolbar transparency slider). Clamp the floor so the
// window can never become fully invisible / unclickable.
ipcMain.handle('window:setOpacity', (event, value) => {
  const win = winFromEvent(event);
  if (!win || win.isDestroyed()) return false;
  const o = Math.max(0.2, Math.min(1, Number(value)));
  win.setOpacity(o);
  return true;
});
ipcMain.handle('window:isMaximized', (event) => winFromEvent(event)?.isMaximized() ?? false);
// Terminal profiles: grow / shrink the window so the terminal shows cols × rows.
ipcMain.handle('window:resizeBy', (event, payload = {}) => {
  const win = winFromEvent(event);
  if (!win || win.isDestroyed()) return null;
  if (win.isMaximized()) win.unmaximize();
  const [w, h] = win.getSize();
  const [minW, minH] = win.getMinimumSize();
  const area = screen.getDisplayMatching(win.getBounds()).workArea;
  const width = Math.max(minW, Math.min(area.width, Math.round(w + (Number(payload.dw) || 0))));
  const height = Math.max(minH, Math.min(area.height, Math.round(h + (Number(payload.dh) || 0))));
  win.setSize(width, height);
  const b = win.getBounds();
  // Keep the window on screen after growing.
  const x = Math.max(area.x, Math.min(b.x, area.x + area.width - b.width));
  const y = Math.max(area.y, Math.min(b.y, area.y + area.height - b.height));
  if (x !== b.x || y !== b.y) win.setPosition(x, y);
  return { width, height };
});

ipcMain.handle('window:getBounds', (event) => {
  const win = winFromEvent(event);
  return win ? win.getBounds() : null;
});

/** Other MyTerminal window under a screen point (for tab merge drag). */
function findWindowAtPoint(screenX, screenY, excludeWin) {
  const x = Math.round(Number(screenX));
  const y = Math.round(Number(screenY));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const hits = [];
  for (const win of windows) {
    if (!win || win.isDestroyed() || !win.isVisible()) continue;
    if (typeof win.isMinimized === 'function' && win.isMinimized()) continue;
    if (excludeWin && win.id === excludeWin.id) continue;
    const b = win.getBounds();
    if (
      x >= b.x &&
      x < b.x + b.width &&
      y >= b.y &&
      y < b.y + b.height
    ) {
      hits.push(win);
    }
  }
  if (!hits.length) return null;
  hits.sort(
    (a, b) => (windowFocusOrder.get(b) || 0) - (windowFocusOrder.get(a) || 0)
  );
  return hits.find((w) => w.isFocused()) || hits[0];
}

function clearMergePreviewExcept(keepWin) {
  for (const win of windows) {
    if (!win || win.isDestroyed()) continue;
    if (keepWin && win.id === keepWin.id) continue;
    try {
      win.webContents.send('session:mergePreviewClear');
    } catch (_) {
      /* ignore */
    }
  }
}

function sendMergePreview(source, payload = {}) {
  const targetId = Number(payload.targetWindowId);
  const target =
    Number.isFinite(targetId) && targetId > 0
      ? BrowserWindow.fromId(targetId)
      : null;
  if (
    !target ||
    target.isDestroyed() ||
    !windows.has(target) ||
    (source && target.id === source.id)
  ) {
    clearMergePreviewExcept(null);
    lastMergePreviewTargetId = null;
    return false;
  }

  if (lastMergePreviewTargetId !== target.id) {
    clearMergePreviewExcept(target);
    lastMergePreviewTargetId = target.id;
  }

  target.webContents.send('session:mergePreview', {
    sessionId: String(payload.sessionId || ''),
    title: payload.title || '',
    mode: payload.mode || 'local',
    screenX: payload.screenX,
    screenY: payload.screenY,
  });
  return true;
}

ipcMain.handle('window:findAtPoint', (event, payload = {}) => {
  const source = winFromEvent(event);
  const cursor = screen.getCursorScreenPoint();
  const x = Number.isFinite(Number(payload.x)) ? Number(payload.x) : cursor.x;
  const y = Number.isFinite(Number(payload.y)) ? Number(payload.y) : cursor.y;
  const win = findWindowAtPoint(cursor.x, cursor.y, source) ||
    findWindowAtPoint(x, y, source);
  if (!win) return null;
  return { id: win.id, bounds: win.getBounds() };
});

ipcMain.on('session:mergePreview', (event, payload = {}) => {
  sendMergePreview(winFromEvent(event), payload || {});
});

ipcMain.on('session:mergePreviewClear', () => {
  clearMergePreviewExcept(null);
  lastMergePreviewTargetId = null;
});

/** Destroy this window after its last tab was merged away (skip tray-hide). */
ipcMain.handle('window:destroyEmpty', (event) => {
  const win = winFromEvent(event);
  if (!win || win.isDestroyed()) return false;
  win.destroy();
  return true;
});

ipcMain.handle('window:setMinSize', (event, payload = {}) => {
  const win = winFromEvent(event);
  if (!win) return null;
  const rawW = Math.ceil(Number(payload.width) || TOOLBAR_MIN_WIDTH);
  // Trust renderer measurement; only clamp to a modest floor/cap.
  const minWidth = Math.min(
    TOOLBAR_MIN_WIDTH_CAP,
    Math.max(TOOLBAR_MIN_WIDTH, rawW || TOOLBAR_MIN_WIDTH)
  );
  const minHeight = Math.max(
    WINDOW_MIN_HEIGHT,
    Math.ceil(Number(payload.height) || WINDOW_MIN_HEIGHT)
  );
  win.setMinimumSize(minWidth, minHeight);
  const [cw, ch] = win.getSize();
  if (payload.resizeToMin) {
    // Start (or snap) at the toolbar-fit minimum width; keep height.
    win.setSize(minWidth, Math.max(ch, minHeight));
  } else if (cw < minWidth || ch < minHeight) {
    win.setSize(Math.max(cw, minWidth), Math.max(ch, minHeight));
  }
  return { minWidth, minHeight };
});

// A popup (settings / SSH / About) reports its own errors; the owner window shows them.
ipcMain.handle('app:reportError', (event, info = {}) => {
  let owner = winFromEvent(event);
  if (!owner || !windows.has(owner)) {
    for (const [, entry] of Object.entries({})) void entry;
    const all = BrowserWindow.getAllWindows();
    owner = all.find((w) => windows.has(w) && !w.isDestroyed()) || null;
  }
  return reportErrorToWindow(owner, { message: String(info.message || 'Error'), details: String(info.details || info.message || '') }, info.context || 'popup');
});

ipcMain.handle('app:getInfo', () => {
  let buildDate = '';
  try {
    // Approximate build time from the packaged main entry's mtime.
    buildDate = fs.statSync(__filename).mtime.toISOString();
  } catch (_) {
    /* ignore */
  }
  return {
    name: 'MyTerminal',
    version: app.getVersion(),
    author: 'SHKWON',
    email: 'knix008@naver.com',
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    os: `${os.type()} ${os.release()}`,
    buildDate,
    firstLaunch,
    homepage: 'https://github.com/knix008',
  };
});

ipcMain.handle('settings:get', () => readSettings());
ipcMain.handle('settings:set', (_e, settings) => {
  // Merge so windowBounds / windowMaximized persisted by main are kept.
  const patch = { ...(settings || {}) };
  // Always persist directory-related fields explicitly (including empty clear).
  if ('startDirectory' in patch) {
    patch.startDirectory = setStartDirectoryPreference(
      typeof patch.startDirectory === 'string' ? patch.startDirectory : '',
      { applyToSessions: true }
    );
  }
  if ('backgroundImageDir' in patch) {
    patch.backgroundImageDir =
      typeof patch.backgroundImageDir === 'string' ? patch.backgroundImageDir : '';
  }
  if ('promptGitMode' in patch) {
    patch.promptGitMode = normalizePromptGitMode(patch.promptGitMode);
  }
  if ('promptPresetId' in patch) {
    patch.promptPresetId =
      typeof patch.promptPresetId === 'string' ? patch.promptPresetId : '';
  }
  if ('promptConfig' in patch) {
    patch.promptConfig =
      patch.promptConfig && typeof patch.promptConfig === 'object'
        ? normalizePrompt(patch.promptConfig)
        : null;
  }
  if ('promptTheme' in patch) {
    const t = patch.promptTheme;
    patch.promptTheme =
      t && typeof t === 'object'
        ? { accent: String(t.accent || ''), fg: String(t.fg || ''), bg: String(t.bg || '') }
        : null;
  }
  if ('customPrompts' in patch) {
    patch.customPrompts = normalizeCustomPrompts(patch.customPrompts);
  }
  if ('termCols' in patch || 'termRows' in patch) {
    if ('termCols' in patch) patch.termCols = Math.max(20, Math.min(500, Number.parseInt(patch.termCols, 10) || 120));
    if ('termRows' in patch) patch.termRows = Math.max(5, Math.min(200, Number.parseInt(patch.termRows, 10) || 25));
  }
  if ('terminalProfiles' in patch) {
    patch.terminalProfiles = (Array.isArray(patch.terminalProfiles) ? patch.terminalProfiles : [])
      .filter((item) => item && typeof item === 'object' && typeof item.id === 'string' && item.id)
      .map((item) => ({
        id: item.id,
        name: String(item.name || ''),
        cols: Math.max(20, Math.min(500, Number.parseInt(item.cols, 10) || 80)),
        rows: Math.max(5, Math.min(200, Number.parseInt(item.rows, 10) || 24)),
        fontId: String(item.fontId || ''),
        fontSize: Math.max(10, Math.min(28, Number.parseInt(item.fontSize, 10) || 14)),
        scrollback: Math.max(100, Math.min(100000, Number.parseInt(item.scrollback, 10) || 10000)),
        shellId: String(item.shellId || ''),
      }));
  }
  if ('sshProfiles' in patch) {
    patch.sshProfiles = (Array.isArray(patch.sshProfiles) ? patch.sshProfiles : [])
      .filter((item) => item && typeof item === 'object' && typeof item.id === 'string' && item.id)
      .map((item) => ({
        id: item.id,
        name: String(item.name || ''),
        host: String(item.host || ''),
        port: Math.max(1, Math.min(65535, Number.parseInt(item.port, 10) || 22)),
        username: String(item.username || ''),
        privateKey: String(item.privateKey || ''),
      }));
  }
  if ('themeOverrides' in patch) {
    patch.themeOverrides =
      patch.themeOverrides && typeof patch.themeOverrides === 'object' ? patch.themeOverrides : {};
  }
  if ('shellId' in patch) {
    patch.shellId = typeof patch.shellId === 'string' ? patch.shellId : '';
  }
  if ('shellCustomPath' in patch) {
    patch.shellCustomPath =
      typeof patch.shellCustomPath === 'string' ? patch.shellCustomPath.trim() : '';
  }
  if ('lsDirectoryColor' in patch || 'lsFileColor' in patch) {
    const current = readSettings();
    const colors = normalizeLsColors({
      directory:
        'lsDirectoryColor' in patch
          ? patch.lsDirectoryColor
          : current.lsDirectoryColor,
      file: 'lsFileColor' in patch ? patch.lsFileColor : current.lsFileColor,
    });
    patch.lsDirectoryColor = colors.directory;
    patch.lsFileColor = colors.file;
  }
  const next = updateSettings(patch);
  loadDirectoryPrefsFromSettings(next);
  applyTrayFromSettings(next);
  return true;
});

ipcMain.handle('tray:getEnabled', () => isTrayActive());

// Wallpapers are stored as files in userData/backgrounds (only a marker lives in
// settings.json) and downscaled for display, so there is no import size limit.
const BG_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const BG_EXTENSIONS = Object.keys(BG_MIME).map((ext) => ext.slice(1));

/** Chromium cannot paint TIFF as CSS backgrounds; convert to PNG. */
function tiffToPngBuffer(buf) {
  const ifds = UTIF.decode(buf);
  if (!ifds?.length) throw new Error('invalid_tiff');
  UTIF.decodeImage(buf, ifds[0]);
  const rgba = Buffer.from(UTIF.toRGBA8(ifds[0]));
  const width = ifds[0].width;
  const height = ifds[0].height;
  if (!width || !height || rgba.length < width * height * 4) {
    throw new Error('invalid_tiff');
  }
  // Electron createFromBitmap expects BGRA on little-endian.
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    rgba[i] = rgba[i + 2];
    rgba[i + 2] = r;
  }
  const img = nativeImage.createFromBitmap(rgba, { width, height });
  if (img.isEmpty()) throw new Error('tiff_decode_failed');
  return img.toPNG();
}

function prepareBackgroundBytes(buf, ext) {
  if (ext === '.tif' || ext === '.tiff') {
    return { buf: tiffToPngBuffer(buf), ext: '.png', mime: 'image/png' };
  }
  const mime = BG_MIME[ext];
  if (!mime) return { error: 'unsupported_type' };
  return { buf, ext, mime };
}

function backgroundDir() {
  return path.join(app.getPath('userData'), 'backgrounds');
}

function libraryMetaPath() {
  return path.join(backgroundDir(), 'library.json');
}

function newBackgroundId() {
  return `bg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Cap wallpaper dimensions so the generated CSS data URL stays small. A huge
// --bg-image value (e.g. a 6000×4500 photo → ~11 MB data URL) is silently
// dropped by Chromium and also risks exceeding GPU texture limits, so the
// wallpaper never paints. 2560px on the long edge is ample for a background.
const BG_MAX_DIMENSION = 2560;

function fileToDataUrl(filePath) {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = BG_MIME[ext] || 'image/png';
  try {
    const img = nativeImage.createFromBuffer(buf);
    const size = img.getSize();
    if (size.width > BG_MAX_DIMENSION || size.height > BG_MAX_DIMENSION) {
      const scale = BG_MAX_DIMENSION / Math.max(size.width, size.height);
      const resized = img.resize({
        width: Math.round(size.width * scale),
        height: Math.round(size.height * scale),
        quality: 'good',
      });
      if (!resized.isEmpty()) {
        // Keep PNG for images that may have alpha; JPEG is far smaller for photos.
        return mime === 'image/png'
          ? `data:image/png;base64,${resized.toPNG().toString('base64')}`
          : `data:image/jpeg;base64,${resized.toJPEG(85).toString('base64')}`;
      }
    }
  } catch (_) {
    /* fall back to the raw bytes below (e.g. formats nativeImage can't decode) */
  }
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function defaultLibrary() {
  return { items: [], activeId: '' };
}

function migrateLegacyWallpaper(lib) {
  const dir = backgroundDir();
  if (!fs.existsSync(dir)) return lib;
  const legacy = fs
    .readdirSync(dir)
    .find((name) => /^wallpaper\./i.test(name) && BG_MIME[path.extname(name).toLowerCase()]);
  if (!legacy) return lib;
  if (lib.items.some((item) => item.file === legacy)) return lib;
  const id = newBackgroundId();
  lib.items.unshift({
    id,
    file: legacy,
    name: 'Wallpaper',
    addedAt: Date.now(),
  });
  if (!lib.activeId) lib.activeId = id;
  return lib;
}

function readLibrary() {
  const dir = backgroundDir();
  fs.mkdirSync(dir, { recursive: true });
  let lib = defaultLibrary();
  const meta = libraryMetaPath();
  if (fs.existsSync(meta)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(meta, 'utf8'));
      if (parsed && Array.isArray(parsed.items)) {
        lib = {
          items: parsed.items
            .filter((item) => item && item.id && item.file)
            .map((item) => ({
              id: String(item.id),
              file: String(item.file),
              name: String(item.name || item.file),
              addedAt: Number(item.addedAt) || 0,
            })),
          activeId: typeof parsed.activeId === 'string' ? parsed.activeId : '',
        };
      }
    } catch (_) {
      lib = defaultLibrary();
    }
  }
  lib = migrateLegacyWallpaper(lib);
  // Drop missing files.
  lib.items = lib.items.filter((item) => fs.existsSync(path.join(dir, item.file)));
  if (lib.activeId && !lib.items.some((item) => item.id === lib.activeId)) {
    lib.activeId = '';
  }
  writeLibrary(lib);
  return lib;
}

function writeLibrary(lib) {
  const dir = backgroundDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    libraryMetaPath(),
    JSON.stringify(
      {
        items: lib.items || [],
        activeId: lib.activeId || '',
      },
      null,
      2
    ),
    'utf8'
  );
}

function listBackgroundLibrary() {
  const dir = backgroundDir();
  const lib = readLibrary();
  const items = lib.items.map((item) => {
    const filePath = path.join(dir, item.file);
    let dataUrl = '';
    try {
      dataUrl = fileToDataUrl(filePath);
    } catch (_) {
      dataUrl = '';
    }
    return {
      id: item.id,
      name: item.name,
      dataUrl,
    };
  });
  return {
    ok: true,
    items: items.filter((item) => item.dataUrl),
    activeId: lib.activeId || '',
  };
}

function getActiveBackgroundDataUrl() {
  const dir = backgroundDir();
  const lib = readLibrary();
  if (!lib.activeId) return null;
  const item = lib.items.find((entry) => entry.id === lib.activeId);
  if (!item) return null;
  const filePath = path.join(dir, item.file);
  if (!fs.existsSync(filePath)) return null;
  try {
    return fileToDataUrl(filePath);
  } catch (_) {
    return null;
  }
}

/** Keep library activeId and settings wallpaper markers in sync across restarts. */
function syncBackgroundSelectionFromSettings(settings = {}) {
  try {
    const lib = readLibrary();
    const settingsId =
      typeof settings.backgroundImageId === 'string' ? settings.backgroundImageId : '';
    const wantsFile = settings.backgroundImage === 'file' || !!settingsId;
    let activeId = lib.activeId || '';
    if (settingsId && lib.items.some((item) => item.id === settingsId)) {
      activeId = settingsId;
    } else if (!activeId && wantsFile && lib.items.length) {
      activeId = lib.items[0].id;
    }
    if (activeId !== lib.activeId) {
      lib.activeId = activeId;
      writeLibrary(lib);
    }
    const hasImage = !!(activeId && lib.items.some((item) => item.id === activeId));
    const patch = {
      backgroundImage: hasImage ? 'file' : '',
      backgroundImageId: hasImage ? activeId : '',
    };
    if (settings.bgTransparency != null) {
      patch.bgTransparency = Math.max(
        0,
        Math.min(100, Number(settings.bgTransparency) || 0)
      );
    }
    if (typeof settings.backgroundFit === 'string' && settings.backgroundFit) {
      patch.backgroundFit = settings.backgroundFit;
    }
    updateSettings(patch);
  } catch (_) {
    /* ignore */
  }
}

function clearBackgroundFiles() {
  const dir = backgroundDir();
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch (_) {
      /* ignore */
    }
  }
}

ipcMain.handle('dialog:pickDirectory', async (event, options = {}) => {
  const senderWin = winFromEvent(event);
  const win =
    (senderWin && windows.has(senderWin) && !senderWin.isDestroyed()
      ? senderWin
      : null) ||
    [...windows].find((w) => w && !w.isDestroyed() && w.isVisible()) ||
    senderWin;
  const settings = readSettings();
  const remembered =
    typeof options?.defaultPath === 'string' && options.defaultPath.trim()
      ? options.defaultPath.trim()
      : typeof settings.startDirectory === 'string'
        ? settings.startDirectory.trim()
        : '';
  let defaultPath;
  if (remembered) {
    const expanded = remembered.replace(/^~(?=[\\/]|$)/, os.homedir());
    if (fs.existsSync(expanded)) {
      defaultPath = fs.statSync(expanded).isDirectory()
        ? expanded
        : path.dirname(expanded);
    }
  }
  if (!defaultPath) defaultPath = os.homedir();
  const result = await dialog.showOpenDialog(win || undefined, {
    title: options?.title || 'Select start directory',
    defaultPath,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return { ok: false, canceled: true };
  }
  return { ok: true, path: result.filePaths[0] };
});

ipcMain.handle('background:pick', async (event) => {
  const win = winFromEvent(event);
  const settings = readSettings();
  const rememberedDir =
    typeof settings.backgroundImageDir === 'string' ? settings.backgroundImageDir : '';
  const defaultPath =
    rememberedDir && fs.existsSync(rememberedDir) ? rememberedDir : undefined;

  const result = await dialog.showOpenDialog(win || undefined, {
    title: 'Select background image',
    defaultPath,
    filters: [
      {
        name: 'Images',
        extensions: BG_EXTENSIONS,
      },
      {
        name: 'JPEG',
        extensions: ['jpg', 'jpeg', 'jfif'],
      },
      {
        name: 'PNG / WebP / AVIF / GIF',
        extensions: ['png', 'webp', 'avif', 'gif'],
      },
      {
        name: 'TIFF',
        extensions: ['tif', 'tiff'],
      },
      {
        name: 'Other',
        extensions: ['bmp', 'svg', 'ico'],
      },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return { ok: false, canceled: true };
  }

  const src = result.filePaths[0];
  const srcExt = path.extname(src).toLowerCase();
  if (!BG_MIME[srcExt]) {
    return { ok: false, error: 'unsupported_type' };
  }

  let buf;
  try {
    buf = fs.readFileSync(src);
  } catch (err) {
    return { ok: false, error: err.message || 'read_failed' };
  }
  // No size cap: originals are stored as files and downscaled when a CSS data URL
  // is generated (see fileToDataUrl / BG_MAX_DIMENSION), so any resolution is fine.

  let prepared;
  try {
    prepared = prepareBackgroundBytes(buf, srcExt);
  } catch (err) {
    return { ok: false, error: err.message || 'decode_failed' };
  }
  if (prepared.error) {
    return { ok: false, error: prepared.error };
  }

  const { buf: outBuf, ext, mime } = prepared;
  const dir = backgroundDir();
  fs.mkdirSync(dir, { recursive: true });
  const lib = readLibrary();
  const id = newBackgroundId();
  const baseName = path.basename(src, path.extname(src)) || 'Wallpaper';
  const file = `${id}${ext}`;
  fs.writeFileSync(path.join(dir, file), outBuf);
  lib.items.unshift({
    id,
    file,
    name: baseName,
    addedAt: Date.now(),
  });
  lib.activeId = id;
  writeLibrary(lib);

  const chosenDir = path.dirname(src);
  try {
    updateSettings({
      backgroundImageDir: chosenDir,
      backgroundImage: 'file',
      backgroundImageId: id,
    });
  } catch (_) {
    /* ignore */
  }

  const listed = listBackgroundLibrary();
  return {
    ok: true,
    id,
    dataUrl: `data:${mime};base64,${outBuf.toString('base64')}`,
    directory: chosenDir,
    items: listed.items,
    activeId: listed.activeId,
  };
});

ipcMain.handle('background:list', () => {
  try {
    return listBackgroundLibrary();
  } catch (err) {
    return { ok: false, error: err.message || 'list_failed', items: [], activeId: '' };
  }
});

ipcMain.handle('background:select', (_e, id) => {
  try {
    const lib = readLibrary();
    const nextId = id == null ? '' : String(id);
    if (nextId && !lib.items.some((item) => item.id === nextId)) {
      return { ok: false, error: 'not_found', ...listBackgroundLibrary() };
    }
    lib.activeId = nextId;
    writeLibrary(lib);
    const dataUrl = nextId ? getActiveBackgroundDataUrl() : null;
    updateSettings({
      backgroundImage: dataUrl ? 'file' : '',
      backgroundImageId: nextId,
    });
    return {
      ok: true,
      id: nextId,
      dataUrl: dataUrl || '',
      ...listBackgroundLibrary(),
    };
  } catch (err) {
    return { ok: false, error: err.message || 'select_failed' };
  }
});

ipcMain.handle('background:remove', (_e, id) => {
  try {
    const targetId = String(id || '');
    if (!targetId) return { ok: false, error: 'missing_id' };
    const dir = backgroundDir();
    const lib = readLibrary();
    const item = lib.items.find((entry) => entry.id === targetId);
    if (!item) return { ok: false, error: 'not_found', ...listBackgroundLibrary() };
    try {
      fs.unlinkSync(path.join(dir, item.file));
    } catch (_) {
      /* ignore missing file */
    }
    lib.items = lib.items.filter((entry) => entry.id !== targetId);
    if (lib.activeId === targetId) lib.activeId = '';
    writeLibrary(lib);
    const dataUrl = getActiveBackgroundDataUrl();
    updateSettings({
      backgroundImage: dataUrl ? 'file' : '',
      backgroundImageId: lib.activeId || '',
    });
    return {
      ok: true,
      removedId: targetId,
      dataUrl: dataUrl || '',
      activeId: lib.activeId || '',
      ...listBackgroundLibrary(),
    };
  } catch (err) {
    return { ok: false, error: err.message || 'remove_failed' };
  }
});

ipcMain.handle('background:load', () => {
  try {
    const dataUrl = getActiveBackgroundDataUrl();
    const lib = readLibrary();
    return dataUrl
      ? { ok: true, dataUrl, activeId: lib.activeId || '' }
      : { ok: false, activeId: '' };
  } catch (err) {
    return { ok: false, error: err.message || 'load_failed' };
  }
});

ipcMain.handle('background:clear', () => {
  const lib = readLibrary();
  lib.activeId = '';
  writeLibrary(lib);
  try {
    updateSettings({ backgroundImage: '', backgroundImageId: '' });
  } catch (_) {
    /* ignore */
  }
  return { ok: true, ...listBackgroundLibrary() };
});

ipcMain.handle('shell:openExternal', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    return shell.openExternal(url);
  }
  return false;
});

ipcMain.handle('clipboard:writeText', (_e, text) => {
  clipboard.writeText(String(text ?? ''));
  return { ok: true };
});

ipcMain.handle('clipboard:readText', () => ({
  ok: true,
  text: clipboard.readText(),
}));

ipcMain.handle('pty:start', (event, options) => {
  const win = winFromEvent(event);
  if (!win) return { ok: false, error: 'No window' };
  try {
    return createPty(win, options || {});
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle('pty:write', (_e, payload) => {
  writePty(payload);
  return true;
});

ipcMain.handle('pty:resize', (_e, payload) => {
  resizePty(payload);
  return true;
});

ipcMain.handle('pty:kill', (_e, payload) => killPty(payload || {}));

ipcMain.handle('prompt:getPresets', () => ({ presets: PRESETS }));

// Command shells installed on this machine (settings › general › command shell).
ipcMain.handle('shells:list', (_e, payload = {}) => {
  const shells = listShells({ refresh: !!payload?.refresh }).map((s) => ({ ...s, short: shortName(s) }));
  return {
    shells,
    defaultId: defaultShellId(process.platform, shells),
    current: currentShell(),
    platform: process.platform,
  };
});

ipcMain.handle('prompt:set', (_e, payload) => {
  const result = setPromptTemplate(payload);
  updateSettings({
    promptConfig: result.config,
    promptGitMode: result.gitMode || DEFAULT_PROMPT_GIT_MODE,
    promptPresetId: result.presetId,
  });
  return result;
});

ipcMain.handle('ssh:connect', async (event, config) => {
  const win = winFromEvent(event);
  if (!win) return { ok: false, error: 'No window' };
  return connectSsh(win, config || {});
});

ipcMain.handle('ssh:disconnect', (_e, payload) => disconnectSsh(payload || {}));
ipcMain.handle('ssh:status', (_e, payload) => getSessionInfo(payload || {}));

ipcMain.handle('session:detach', (event, payload = {}) => {
  const source = winFromEvent(event);
  const sessionId = String(payload.sessionId || '');
  if (!source || !sessionId) return { ok: false, error: 'Invalid detach request' };

  const info = getSessionInfo({ sessionId });
  if (!info.exists) return { ok: false, error: 'Session not found' };

  stashAdopt(sessionId, {
    title: payload.title || info.title || `Terminal ${sessionId}`,
    mode: payload.mode || info.mode || 'local',
    serialized: payload.serialized || '',
    fontSize: payload.fontSize || 13,
    fontFamily: payload.fontFamily || '',
  });

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const width = payload.width || 1000;
  const height = payload.height || 680;
  let x = Math.round(cursor.x - 80);
  let y = Math.round(cursor.y - 20);
  x = Math.min(
    Math.max(x, display.workArea.x),
    display.workArea.x + display.workArea.width - 200
  );
  y = Math.min(
    Math.max(y, display.workArea.y),
    display.workArea.y + display.workArea.height - 120
  );

  const child = createWindow({
    adoptSessionId: sessionId,
    x,
    y,
    width,
    height,
  });

  reattachSession(sessionId, child);
  child.webContents.once('did-finish-load', () => {
    reattachSession(sessionId, child);
  });

  if (!source.isDestroyed()) {
    source.webContents.send('session:detached', {
      sessionId,
      closeIfEmpty: true,
    });
  }

  return { ok: true, sessionId };
});

/** Move a session into an existing window as a new tab (merge). */
ipcMain.handle('session:attach', (event, payload = {}) => {
  const source = winFromEvent(event);
  const sessionId = String(payload.sessionId || '');
  const targetId = Number(payload.targetWindowId);
  const target =
    [...windows].find((w) => !w.isDestroyed() && w.id === targetId) ||
    (Number.isFinite(targetId) && targetId > 0
      ? BrowserWindow.fromId(targetId)
      : null);

  if (!source || !sessionId) return { ok: false, error: 'Invalid attach request' };
  if (!target || target.isDestroyed()) {
    return { ok: false, error: 'Target window not found' };
  }
  if (target.id === source.id) return { ok: false, error: 'Same window' };

  const info = getSessionInfo({ sessionId });
  if (!info.exists) return { ok: false, error: 'Session not found' };

  const meta = {
    title: payload.title || info.title || `Terminal ${sessionId}`,
    mode: payload.mode || info.mode || 'local',
    serialized: payload.serialized || '',
    fontSize: payload.fontSize || 13,
    fontFamily: payload.fontFamily || '',
  };

  stashAdopt(sessionId, meta);
  reattachSession(sessionId, target);
  clearMergePreviewExcept(null);
  lastMergePreviewTargetId = null;

  if (!target.isDestroyed()) {
    target.focus();
    target.webContents.send('session:adopt', {
      sessionId,
      insertIndex: payload.insertIndex,
      screenX: payload.screenX,
      screenY: payload.screenY,
      ...meta,
    });
  }

  const sourceEmpty = countSessionsForWindow(source) === 0;
  if (sourceEmpty) {
    setImmediate(() => {
      if (!source.isDestroyed()) source.destroy();
    });
  } else if (!source.isDestroyed()) {
    source.webContents.send('session:detached', {
      sessionId,
      closeIfEmpty: true,
    });
  }

  return { ok: true, sessionId, targetWindowId: target.id };
});

ipcMain.handle('session:takeAdopt', (_e, sessionId) => takeAdopt(sessionId));
