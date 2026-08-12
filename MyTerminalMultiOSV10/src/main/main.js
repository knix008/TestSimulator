const { app, BrowserWindow, ipcMain, shell, Menu, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  createPty,
  writePty,
  resizePty,
  killPty,
  setPromptTemplate,
  connectSsh,
  disconnectSsh,
  getSessionInfo,
  killSessionsForWindow,
  reattachSession,
  stashAdopt,
  takeAdopt,
} = require('./pty-manager');
const { PROMPT_PRESETS, DEFAULT_PROMPT } = require('./prompt');
const {
  createTray,
  destroyTray,
  rebuildMenu,
  isTrayActive,
  setQuitting,
  getIsQuitting,
} = require('./tray');

const windows = new Set();

/** Fallback until renderer measures the real toolbar width. */
const TOOLBAR_MIN_WIDTH = 1080;
const WINDOW_MIN_HEIGHT = 420;

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

function createWindow(options = {}) {
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: options.width || 1100,
    height: options.height || 720,
    x: options.x,
    y: options.y,
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

  const loadOpts = {};
  if (options.adoptSessionId) {
    loadOpts.query = { adopt: String(options.adoptSessionId) };
  }
  win.loadFile(path.join(__dirname, '../renderer/index.html'), loadOpts);

  win.once('ready-to-show', () => {
    win.show();
    if (options.focus !== false) win.focus();
  });

  win.on('maximize', () => {
    if (!win.isDestroyed()) win.webContents.send('window:maximized', true);
  });
  win.on('unmaximize', () => {
    if (!win.isDestroyed()) win.webContents.send('window:maximized', false);
  });

  // With tray enabled, close hides to tray instead of quitting.
  win.on('close', (e) => {
    if (isTrayActive() && !getIsQuitting()) {
      e.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => {
    killSessionsForWindow(win);
    windows.delete(win);
  });

  return win;
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
  if (installer && typeof installer.showTrayIcon === 'boolean') {
    settings.showTrayIcon = installer.showTrayIcon;
  } else {
    settings.showTrayIcon = false;
  }
  writeSettings(settings);
  return settings;
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

app.whenReady().then(() => {
  const settings = bootstrapSettings();
  applyTrayFromSettings(settings);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  setQuitting(true);
  destroyTray();
  killPty();
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return;
  if (isTrayActive()) return;
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
  if (isTrayActive()) {
    win.hide();
    return;
  }
  win.close();
});
ipcMain.handle('window:isMaximized', (event) => winFromEvent(event)?.isMaximized() ?? false);
ipcMain.handle('window:getBounds', (event) => {
  const win = winFromEvent(event);
  return win ? win.getBounds() : null;
});

ipcMain.handle('window:setMinSize', (event, payload = {}) => {
  const win = winFromEvent(event);
  if (!win) return null;
  const minWidth = Math.max(
    TOOLBAR_MIN_WIDTH,
    Math.ceil(Number(payload.width) || TOOLBAR_MIN_WIDTH)
  );
  const minHeight = Math.max(
    WINDOW_MIN_HEIGHT,
    Math.ceil(Number(payload.height) || WINDOW_MIN_HEIGHT)
  );
  win.setMinimumSize(minWidth, minHeight);
  const [cw, ch] = win.getSize();
  if (cw < minWidth || ch < minHeight) {
    win.setSize(Math.max(cw, minWidth), Math.max(ch, minHeight));
  }
  return { minWidth, minHeight };
});

ipcMain.handle('app:getInfo', () => ({
  name: 'MyTerminal',
  version: app.getVersion(),
  author: 'SHKWON',
  email: 'knix008@naver.com',
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  os: `${os.type()} ${os.release()}`,
  homepage: 'https://github.com/knix008',
}));

ipcMain.handle('settings:get', () => readSettings());
ipcMain.handle('settings:set', (_e, settings) => {
  const next = settings || {};
  writeSettings(next);
  applyTrayFromSettings(next);
  return true;
});

ipcMain.handle('tray:getEnabled', () => isTrayActive());

const BG_MAX_BYTES = 5 * 1024 * 1024;
const BG_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

function backgroundDir() {
  return path.join(app.getPath('userData'), 'backgrounds');
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

function readStoredBackground() {
  const dir = backgroundDir();
  if (!fs.existsSync(dir)) return null;
  const file = fs
    .readdirSync(dir)
    .find((name) => BG_MIME[path.extname(name).toLowerCase()]);
  if (!file) return null;
  const filePath = path.join(dir, file);
  const buf = fs.readFileSync(filePath);
  const mime = BG_MIME[path.extname(file).toLowerCase()] || 'image/png';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

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
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'],
      },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return { ok: false, canceled: true };
  }

  const src = result.filePaths[0];
  let buf;
  try {
    buf = fs.readFileSync(src);
  } catch (err) {
    return { ok: false, error: err.message || 'read_failed' };
  }
  if (buf.length > BG_MAX_BYTES) {
    return { ok: false, error: 'too_large' };
  }

  const ext = path.extname(src).toLowerCase() || '.png';
  const mime = BG_MIME[ext] || 'image/png';
  const dir = backgroundDir();
  fs.mkdirSync(dir, { recursive: true });
  clearBackgroundFiles();
  fs.writeFileSync(path.join(dir, `wallpaper${ext}`), buf);

  const chosenDir = path.dirname(src);
  try {
    writeSettings({ ...settings, backgroundImageDir: chosenDir });
  } catch (_) {
    /* ignore */
  }

  return {
    ok: true,
    dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
    directory: chosenDir,
  };
});

ipcMain.handle('background:load', () => {
  try {
    const dataUrl = readStoredBackground();
    return dataUrl ? { ok: true, dataUrl } : { ok: false };
  } catch (err) {
    return { ok: false, error: err.message || 'load_failed' };
  }
});

ipcMain.handle('background:clear', () => {
  clearBackgroundFiles();
  return true;
});

ipcMain.handle('shell:openExternal', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    return shell.openExternal(url);
  }
  return false;
});

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

ipcMain.handle('prompt:getPresets', () => ({
  default: DEFAULT_PROMPT,
  presets: PROMPT_PRESETS,
}));

ipcMain.handle('prompt:set', (_e, template) => setPromptTemplate(template));

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
    title: payload.title || info.title || `Session ${sessionId}`,
    mode: payload.mode || info.mode || 'local',
    serialized: payload.serialized || '',
    fontSize: payload.fontSize || 14,
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
    source.webContents.send('session:detached', { sessionId });
  }

  return { ok: true, sessionId };
});

ipcMain.handle('session:takeAdopt', (_e, sessionId) => takeAdopt(sessionId));
