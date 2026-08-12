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
  connectSsh,
  disconnectSsh,
  getSessionInfo,
  killSessionsForWindow,
  reattachSession,
  stashAdopt,
  takeAdopt,
} = require('./pty-manager');
const {
  PROMPT_PRESETS,
  DEFAULT_PROMPT,
  DEFAULT_PROMPT_GIT_MODE,
  normalizePromptGitMode,
  asciiSafePromptGlyphs,
  findPromptPresetId,
} = require('./prompt');
const {
  createTray,
  destroyTray,
  rebuildMenu,
  isTrayActive,
  setQuitting,
  getIsQuitting,
} = require('./tray');
const { registerPopupIpc } = require('./popup');
const {
  registerDetachPreviewIpc,
  destroyDetachPreview,
} = require('./detach-preview');

const windows = new Set();

/** Fallback until renderer measures the real toolbar content width. */
const TOOLBAR_MIN_WIDTH = 1100;
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

function getRestoredWindowOptions() {
  const settings = readSettings();
  const saved = settings.windowBounds;
  const defaults = { width: 1100, height: 720 };
  if (!saved || typeof saved !== 'object') {
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
  win.on('close', (e) => {
    saveWindowState(win);
    if (isTrayActive() && !getIsQuitting()) {
      e.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => {
    const timer = windowStateTimers.get(win);
    if (timer) clearTimeout(timer);
    windowStateTimers.delete(win);
    killSessionsForWindow(win);
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

app.on('before-quit', () => {
  for (const win of windows) saveWindowState(win);
  destroyDetachPreview();
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
  const rawW = Math.ceil(Number(payload.width) || TOOLBAR_MIN_WIDTH);
  const minWidth = Math.min(
    TOOLBAR_MIN_WIDTH_CAP,
    Math.max(900, rawW || TOOLBAR_MIN_WIDTH)
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
  // Merge so windowBounds / windowMaximized persisted by main are kept.
  const patch = { ...(settings || {}) };
  // Always persist directory-related fields explicitly (including empty clear).
  if ('startDirectory' in patch) {
    patch.startDirectory =
      typeof patch.startDirectory === 'string' ? patch.startDirectory.trim() : '';
  }
  if ('backgroundImageDir' in patch) {
    patch.backgroundImageDir =
      typeof patch.backgroundImageDir === 'string' ? patch.backgroundImageDir : '';
  }
  if ('promptTemplate' in patch) {
    patch.promptTemplate =
      typeof patch.promptTemplate === 'string' && patch.promptTemplate.length
        ? asciiSafePromptGlyphs(patch.promptTemplate)
        : DEFAULT_PROMPT;
  }
  if ('promptGitMode' in patch) {
    patch.promptGitMode = normalizePromptGitMode(patch.promptGitMode);
  }
  if ('promptPresetId' in patch) {
    patch.promptPresetId =
      typeof patch.promptPresetId === 'string' ? patch.promptPresetId : '';
  }
  const next = updateSettings(patch);
  loadDirectoryPrefsFromSettings(next);
  applyTrayFromSettings(next);
  return true;
});

ipcMain.handle('tray:getEnabled', () => isTrayActive());

const BG_MAX_BYTES = 5 * 1024 * 1024;
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

function fileToDataUrl(filePath) {
  const buf = fs.readFileSync(filePath);
  const mime = BG_MIME[path.extname(filePath).toLowerCase()] || 'image/png';
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
  const win = winFromEvent(event);
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
      defaultPath = fs.statSync(expanded).isDirectory() ? expanded : path.dirname(expanded);
    }
  }
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
  if (buf.length > BG_MAX_BYTES) {
    return { ok: false, error: 'too_large' };
  }

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

ipcMain.handle('prompt:getPresets', () => ({
  default: DEFAULT_PROMPT,
  presets: PROMPT_PRESETS,
}));

ipcMain.handle('prompt:set', (_e, payload) => {
  const result = setPromptTemplate(payload);
  const presetId =
    result.presetId ||
    findPromptPresetId(result.template) ||
    (typeof payload === 'object' && payload?.presetId) ||
    '';
  updateSettings({
    promptTemplate: result.template || DEFAULT_PROMPT,
    promptGitMode: result.gitMode || DEFAULT_PROMPT_GIT_MODE,
    promptPresetId: presetId,
  });
  return { ...result, presetId };
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
