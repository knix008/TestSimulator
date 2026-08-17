const { app, BrowserWindow, ipcMain, dialog, Menu, shell, clipboard, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const os = require('os');
const crypto = require('crypto');
const DicomDecoder = require('./src/js/dicomDecoder');

let mainWindow;
let currentLang = 'en';
let currentTheme = 'dark';
let hasUnsavedChanges = false;
let isForceClose = false;
let lastOpenDir = null;

/**
 * Packaged builds must match build.appId (Start Menu shortcut).
 * Unpackaged (npm start) MUST use a different AUMID — otherwise Windows
 * reuses the installed shortcut's cached taskbar icon (often an old icon).
 */
function _computeAppUserModelId() {
  const base = 'com.shkwon.imageviewer';
  if (app.isPackaged) return base;
  try {
    const ico = path.join(__dirname, 'src', 'assets', 'icon.ico');
    const hash = crypto.createHash('md5').update(fs.readFileSync(ico)).digest('hex').slice(0, 8);
    return `${base}.dev.${hash}`;
  } catch {
    return `${base}.dev`;
  }
}

const APP_USER_MODEL_ID = _computeAppUserModelId();

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

const OPENABLE_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif',
  'heic', 'heif', 'hif', 'dcm', 'dicom', 'avif',
  'mp4', 'webm', 'ogv', 'mov', 'avi', 'mkv', 'm4v', 'flv', 'wmv', '3gp',
  'mpeg', 'mpg', 'ts', 'm2ts', 'vob', 'rm', 'rmvb',
  'mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'wma', 'mid', 'midi', 'aiff', 'aif',
]);

let pendingOpenPath = null;

function _isFileArg(arg) {
  if (!arg || typeof arg !== 'string') return false;
  if (arg.startsWith('-')) return false;
  const lower = arg.toLowerCase();
  if (lower === '.' || lower.endsWith('.exe') || lower.endsWith('electron')) return false;
  try {
    if (path.resolve(arg) === path.resolve(__dirname)) return false;
  } catch {}
  return true;
}

function _fileFromArgv(argv) {
  if (!Array.isArray(argv)) return null;
  for (const arg of argv) {
    if (!_isFileArg(arg)) continue;
    try {
      const resolved = path.resolve(arg);
      if (!fs.existsSync(resolved)) continue;
      if (fs.statSync(resolved).isDirectory()) continue;
      const ext = path.extname(resolved).slice(1).toLowerCase();
      if (OPENABLE_EXTS.has(ext)) return resolved;
    } catch {}
  }
  return null;
}

function _queueOpenFile(filePath) {
  if (!filePath) return;
  try {
    if (!fs.existsSync(filePath)) return;
  } catch {
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('open-file', filePath);
    pendingOpenPath = null;
    return;
  }
  pendingOpenPath = filePath;
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const filePath = _fileFromArgv(argv);
    if (filePath) _queueOpenFile(filePath);
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

pendingOpenPath = _fileFromArgv(process.argv);

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  _queueOpenFile(filePath);
});

// File watchers: map of watchedPath → fs.FSWatcher
const fileWatchers = new Map();

function _getUiConfigPath() {
  return path.join(app.getPath('userData'), 'image-viewer-ui.json');
}

function _loadUiConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(_getUiConfigPath(), 'utf8'));
    if (cfg.lastOpenDir && fs.existsSync(cfg.lastOpenDir)) {
      lastOpenDir = cfg.lastOpenDir;
    }
  } catch {}
}

function _saveLastOpenDir(dir) {
  if (!dir) return;
  try {
    const resolved = fs.existsSync(dir) && fs.statSync(dir).isDirectory()
      ? dir
      : path.dirname(dir);
    if (!resolved || !fs.existsSync(resolved)) return;
    lastOpenDir = resolved;
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(_getUiConfigPath(), 'utf8')); } catch {}
    cfg.lastOpenDir = lastOpenDir;
    fs.writeFileSync(_getUiConfigPath(), JSON.stringify(cfg), 'utf8');
  } catch {}
}

function _dialogDefaultPath() {
  if (lastOpenDir && fs.existsSync(lastOpenDir)) return lastOpenDir;
  return app.getPath('documents');
}

function _resolveAsset(...parts) {
  const packaged = path.join(__dirname, ...parts);
  if (fs.existsSync(packaged)) return packaged;
  // electron-builder asarUnpack → app.asar.unpacked/...
  const unpacked = packaged.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
  if (unpacked !== packaged && fs.existsSync(unpacked)) return unpacked;
  return packaged;
}

function _getAppIconPath() {
  const candidates = process.platform === 'win32'
    ? ['icon.ico', 'icon.png', 'icon_512.png']
    : process.platform === 'darwin'
      ? ['icon.icns', 'icon_512.png', 'icon.png']
      : ['icon_512.png', 'icon.png', 'icon.ico'];

  for (const file of candidates) {
    const p = _resolveAsset('src', 'assets', file);
    if (fs.existsSync(p)) return p;
  }
  return _resolveAsset('src', 'assets', 'icon.png');
}

/**
 * Path Windows Shell can load for the taskbar / Jump List.
 * Always prefer a real .ico on disk — more reliable than the .exe for setAppDetails.
 */
function _getTaskbarIconPath() {
  const ico = _resolveAsset('src', 'assets', 'icon.ico');
  if (fs.existsSync(ico) && !ico.includes(`${path.sep}app.asar${path.sep}`)) {
    return ico;
  }
  if (process.platform === 'win32' && app.isPackaged) {
    return process.execPath;
  }
  return _getAppIconPath();
}

function _loadAppIcon() {
  // Windows taskbar quality is best with .ico (not PNG-only nativeImage)
  if (process.platform === 'win32') {
    const ico = _resolveAsset('src', 'assets', 'icon.ico');
    if (fs.existsSync(ico)) {
      const image = nativeImage.createFromPath(ico);
      return { iconPath: ico, image: image.isEmpty() ? null : image };
    }
  }

  const prefer = process.platform === 'darwin'
    ? ['icon_512.png', 'icon.png', 'icon.icns']
    : ['icon_512.png', 'icon.png', 'icon.ico'];

  for (const file of prefer) {
    const iconPath = _resolveAsset('src', 'assets', file);
    if (!fs.existsSync(iconPath)) continue;
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) return { iconPath, image };
  }
  const fallback = _getAppIconPath();
  return { iconPath: fallback, image: null };
}

function createWindow() {
  const { iconPath, image: appIcon } = _loadAppIcon();
  const taskbarIconPath = _getTaskbarIconPath();
  // Window chrome prefers a real .ico / PNG path (not the .exe)
  const windowIconPath = (() => {
    if (process.platform === 'win32') {
      const ico = _resolveAsset('src', 'assets', 'icon.ico');
      if (fs.existsSync(ico)) return ico;
    }
    return appIcon || iconPath;
  })();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    backgroundColor: '#1e1e1e',
    title: 'Image Viewer',
    icon: windowIconPath,
    frame: false,
    autoHideMenuBar: true,
    maximizable: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
  });

  // Windows taskbar / Jump List
  if (process.platform === 'win32') {
    try {
      mainWindow.setAppDetails({
        appId: APP_USER_MODEL_ID,
        appIconPath: taskbarIconPath,
        appIconIndex: 0,
        relaunchDisplayName: 'Image Viewer',
        relaunchCommand: `"${process.execPath}"`,
      });
      console.log(`[icon] AUMID=${APP_USER_MODEL_ID}`);
      console.log(`[icon] taskbar=${taskbarIconPath}`);
      console.log(`[icon] window=${windowIconPath}`);
    } catch (e) {
      console.warn('setAppDetails failed:', e.message);
    }
  }

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    try {
      if (process.platform === 'win32' && fs.existsSync(windowIconPath)) {
        mainWindow.setIcon(windowIconPath);
      } else if (appIcon) {
        mainWindow.setIcon(appIcon);
      } else if (fs.existsSync(iconPath)) {
        mainWindow.setIcon(iconPath);
      }
    } catch (e) {
      console.warn('setIcon failed:', e.message);
    }
    if (process.platform === 'darwin' && app.dock) {
      const dockIcon = nativeImage.createFromPath(iconPath);
      if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
    }
  });

  mainWindow.on('close', async (event) => {
    if (isForceClose || !hasUnsavedChanges) return;

    event.preventDefault();

    const isKo = currentLang === 'ko';
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title:   isKo ? '저장되지 않은 변경 사항' : 'Unsaved Changes',
      message: isKo
        ? '저장되지 않은 변경 사항이 있습니다.\n저장하시겠습니까?'
        : 'You have unsaved changes.\nDo you want to save before closing?',
      buttons: isKo
        ? ['저장', '저장 안 함', '취소']
        : ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      icon: _getAppIconPath(),
    });

    if (result.response === 0) {
      // Save → ask renderer to save, then close after save completes
      mainWindow.webContents.send('menu-action', 'save-before-close');
    } else if (result.response === 1) {
      // Discard changes → close
      isForceClose = true;
      mainWindow.close();
    }
    // response === 2 (Cancel) → do nothing
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const sendMaxState = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('maximize-change', _isWindowMaximized());
    }
  };
  mainWindow.on('maximize', sendMaxState);
  mainWindow.on('unmaximize', sendMaxState);
  mainWindow.on('restore', sendMaxState);
  mainWindow.on('enter-full-screen', sendMaxState);
  mainWindow.on('leave-full-screen', sendMaxState);
  mainWindow.on('resize', () => {
    clearTimeout(mainWindow._maxStateTimer);
    mainWindow._maxStateTimer = setTimeout(sendMaxState, 40);
  });
}

function _isWindowMaximized() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMaximized() || mainWindow.isFullScreen()) return true;
  if (process.platform !== 'win32') return false;
  try {
    const bounds = mainWindow.getBounds();
    const wa = screen.getDisplayMatching(bounds).workArea;
    return bounds.x <= wa.x + 2
      && bounds.y <= wa.y + 2
      && bounds.width >= wa.width - 4
      && bounds.height >= wa.height - 4;
  } catch {
    return false;
  }
}

function buildMenu(translations) {
  const t = (key) => (translations && translations[key]) ? translations[key] : key;

  const template = [
    {
      label: t('menu.file'),
      submenu: [
        {
          label: t('menu.openFile'),
          accelerator: 'CmdOrCtrl+O',
          click: () => handleOpenFile(),
        },
        {
          label: t('menu.openFolder'),
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => handleOpenFolder(),
        },
        { type: 'separator' },
        {
          label: t('menu.saveAs'),
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'save-as'),
        },
        {
          label: t('menu.copyToClipboard'),
          accelerator: 'CmdOrCtrl+C',
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'copy-clipboard'),
        },
        { type: 'separator' },
        {
          label: t('menu.exit'),
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: t('menu.edit'),
      submenu: [
        {
          label: t('menu.editImage') || t('toolbar.edit') || 'Edit Image',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'edit-image'),
        },
        { type: 'separator' },
        {
          label: t('menu.undo') || t('toolbar.undo') || 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'undo'),
        },
        {
          label: t('menu.redo') || t('toolbar.redo') || 'Redo',
          accelerator: 'CmdOrCtrl+Y',
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'redo'),
        },
        {
          label: t('menu.redo') || t('toolbar.redo') || 'Redo',
          accelerator: 'CmdOrCtrl+Shift+Z',
          visible: false,
          acceleratorWorksWhenHidden: true,
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'redo'),
        },
        { type: 'separator' },
        {
          label: t('menu.rotateLeft'),
          accelerator: 'CmdOrCtrl+[',
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'rotate-left'),
        },
        {
          label: t('menu.rotateRight'),
          accelerator: 'CmdOrCtrl+]',
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'rotate-right'),
        },
        { type: 'separator' },
        {
          label: t('menu.flipHorizontal'),
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'flip-h'),
        },
        {
          label: t('menu.flipVertical'),
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'flip-v'),
        },
        { type: 'separator' },
        {
          label: t('menu.resetEdits'),
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'reset-all'),
        },
      ],
    },
    {
      label: t('menu.view'),
      submenu: [
        {
          label: t('menu.zoomIn'),
          accelerator: 'CmdOrCtrl+Plus',
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'zoom-in'),
        },
        {
          label: t('menu.zoomOut'),
          accelerator: 'CmdOrCtrl+-',
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'zoom-out'),
        },
        {
          label: t('menu.fitToWindow'),
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'fit-window'),
        },
        {
          label: t('menu.actualSize'),
          accelerator: 'CmdOrCtrl+1',
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'actual-size'),
        },
        { type: 'separator' },
        {
          label: t('menu.previousImage'),
          accelerator: 'Left',
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'prev-image'),
        },
        {
          label: t('menu.nextImage'),
          accelerator: 'Right',
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'next-image'),
        },
        { type: 'separator' },
        {
          label: t('menu.fullscreen'),
          accelerator: process.platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11',
          click: () => {
            if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
          },
        },
        { type: 'separator' },
        {
          label: t('menu.darkTheme'),
          type: 'radio',
          checked: currentTheme === 'dark',
          click: () => {
            currentTheme = 'dark';
            mainWindow && mainWindow.webContents.send('menu-action', 'theme-dark');
            buildMenu(translations);
          },
        },
        {
          label: t('menu.lightTheme'),
          type: 'radio',
          checked: currentTheme === 'light',
          click: () => {
            currentTheme = 'light';
            mainWindow && mainWindow.webContents.send('menu-action', 'theme-light');
            buildMenu(translations);
          },
        },
        { type: 'separator' },
        {
          label: '한국어',
          type: 'radio',
          checked: currentLang === 'ko',
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'lang-ko'),
        },
        {
          label: 'English',
          type: 'radio',
          checked: currentLang === 'en',
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'lang-en'),
        },
      ],
    },
    {
      label: t('menu.effects'),
      submenu: [
        {
          label: t('menu.adjustments'),
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'show-effects'),
        },
        { type: 'separator' },
        {
          label: t('menu.grayscale'),
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'effect-grayscale'),
        },
        {
          label: t('menu.sepia'),
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'effect-sepia'),
        },
        {
          label: t('menu.invert'),
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'effect-invert'),
        },
        { type: 'separator' },
        {
          label: t('menu.resetEffects'),
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'effect-reset'),
        },
      ],
    },
    {
      label: t('menu.help'),
      submenu: [
        {
          label: t('menu.about'),
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'show-about'),
        },
        {
          label: t('menu.shortcuts'),
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'show-shortcuts'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(menu);
  } else {
    Menu.setApplicationMenu(null);
  }
}

async function handleOpenFile() {
  if (!mainWindow) return;
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: _dialogDefaultPath(),
    properties: ['openFile'],
    filters: [
      {
        name: 'Images',
        extensions: [
          'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'avif',
          'svg', 'ico', 'tiff', 'tif',
          'heic', 'heif', 'hif',
          'dcm', 'dicom',
        ],
      },
      { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
      { name: 'PNG', extensions: ['png'] },
      { name: 'WebP', extensions: ['webp'] },
      { name: 'HEIC / HEIF', extensions: ['heic', 'heif', 'hif'] },
      { name: 'DICOM', extensions: ['dcm', 'dicom'] },
      { name: 'TIFF', extensions: ['tiff', 'tif'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    _saveLastOpenDir(result.filePaths[0]);
    mainWindow.webContents.send('open-file', result.filePaths[0]);
  }
}

async function handleOpenFolder() {
  if (!mainWindow) return;
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: _dialogDefaultPath(),
    properties: ['openDirectory'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    _saveLastOpenDir(result.filePaths[0]);
    mainWindow.webContents.send('open-folder', result.filePaths[0]);
  }
}

ipcMain.handle('read-directory', async (event, dirPath) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    return entries
      .map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        path: path.join(dirPath, entry.name),
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('list-drives', async () => {
  try {
    if (process.platform === 'win32') {
      const drives = [];
      for (let i = 65; i <= 90; i++) {
        const letter = String.fromCharCode(i);
        const root = `${letter}:\\`;
        try {
          fs.accessSync(root);
          drives.push({
            name: `${letter}:`,
            path: root,
            isDirectory: true,
            isDrive: true,
          });
        } catch {}
      }
      return drives;
    }

    if (process.platform === 'darwin') {
      const drives = [{ name: 'Macintosh HD', path: '/', isDirectory: true, isDrive: true }];
      try {
        const vols = await fs.promises.readdir('/Volumes', { withFileTypes: true });
        for (const v of vols) {
          if (!v.isDirectory() && !v.isSymbolicLink()) continue;
          if (v.name === 'Macintosh HD') continue;
          drives.push({
            name: v.name,
            path: path.join('/Volumes', v.name),
            isDirectory: true,
            isDrive: true,
          });
        }
      } catch {}
      return drives;
    }

    // Linux: root + common mount points
    const drives = [{ name: '/', path: '/', isDirectory: true, isDrive: true }];
    const mediaUser = (() => {
      try { return `/run/media/${os.userInfo().username}`; } catch { return null; }
    })();
    for (const base of ['/media', '/mnt', mediaUser].filter(Boolean)) {
      try {
        const entries = await fs.promises.readdir(base, { withFileTypes: true });
        for (const e of entries) {
          if (!e.isDirectory()) continue;
          drives.push({
            name: e.name,
            path: path.join(base, e.name),
            isDirectory: true,
            isDrive: true,
          });
        }
      } catch {}
    }
    return drives;
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('path-ancestors', async (event, targetPath) => {
  try {
    if (!targetPath) return [];
    let current = path.resolve(targetPath);
    try {
      const st = fs.statSync(current);
      if (!st.isDirectory()) current = path.dirname(current);
    } catch {}

    const ancestors = [];
    const seen = new Set();
    while (current && !seen.has(current)) {
      seen.add(current);
      ancestors.unshift(current);
      const parent = path.dirname(current);
      if (!parent || parent === current) break;
      current = parent;
    }
    return ancestors;
  } catch {
    return [];
  }
});

ipcMain.handle('get-file-stats', async (event, filePath) => {
  try {
    const stats = await fs.promises.stat(filePath);
    return {
      size: stats.size,
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString(),
      accessed: stats.atime.toISOString(),
      changed: stats.ctime.toISOString(),
      isDirectory: stats.isDirectory(),
    };
  } catch (err) {
    return { error: err.message };
  }
});

function _viewToMeta(value) {
  const buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (!buf.length) return null;
  if (buf.length >= 8) {
    const head = buf.slice(0, 8).toString('latin1');
    const rest = buf.slice(8);
    if (head.startsWith('ASCII')) {
      const s = rest.toString('utf8').replace(/\0/g, '').trim();
      if (s) return s;
    } else if (head.startsWith('UNICODE') || head.startsWith('Unicode')) {
      const s = rest.toString('utf16le').replace(/\0/g, '').trim();
      if (s) return s;
    }
  }
  const ascii = buf.toString('latin1').replace(/\0/g, '').trim();
  if (ascii && /^[\x20-\x7E]+$/.test(ascii)) return ascii;
  if (buf.length <= 16) return Array.from(buf).join(', ');
  return `[binary ${buf.length} bytes]`;
}

function _metaJsonSafe(value, depth = 0) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const s = value.replace(/\0/g, '').trim();
    return s || null;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return _viewToMeta(value);
  if (ArrayBuffer.isView(value)) return _viewToMeta(value);
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')) {
      return value.map((v) => String(v)).join(', ');
    }
    if (depth > 6) return value.map((v) => String(v)).join(', ');
    const arr = value.map((v) => _metaJsonSafe(v, depth + 1)).filter((v) => v != null && v !== '');
    return arr.length ? arr : null;
  }
  if (typeof value === 'object') {
    if (depth > 8) return String(value);
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (/thumbnail/i.test(k)) continue;
      const s = _metaJsonSafe(v, depth + 1);
      if (s != null && s !== '') out[k] = s;
    }
    return Object.keys(out).length ? out : null;
  }
  return String(value);
}

function _flattenMeta(value, prefix, out, depth = 0) {
  if (value == null) return;
  const isPlain = value
    && typeof value === 'object'
    && !Array.isArray(value)
    && !(value instanceof Date)
    && !(typeof Buffer !== 'undefined' && Buffer.isBuffer(value))
    && !ArrayBuffer.isView(value);
  if (!isPlain || depth > 8) {
    const safe = _metaJsonSafe(value, depth);
    if (safe != null && safe !== '' && safe !== false) out[prefix] = safe;
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    if (/thumbnail/i.test(k)) continue;
    _flattenMeta(v, prefix ? `${prefix}.${k}` : k, out, depth + 1);
  }
}

ipcMain.handle('read-image-meta', async (event, filePath) => {
  if (!filePath) return null;
  const out = { basic: {}, tags: {}, all: {} };
  try {
    const sharp = require('sharp');
    const md = await sharp(filePath).metadata();
    const basic = {
      width: md.width ?? null,
      height: md.height ?? null,
      format: md.format || null,
      space: md.space || null,
      channels: md.channels ?? null,
      depth: md.depth || null,
      density: md.density ?? null,
      chromaSubsampling: md.chromaSubsampling || null,
      isProgressive: md.isProgressive ?? null,
      hasProfile: md.hasProfile ?? null,
      hasAlpha: md.hasAlpha ?? null,
      orientation: md.orientation ?? null,
      compression: md.compression || null,
      pages: md.pages ?? null,
      loop: md.loop ?? null,
    };
    out.basic = {};
    for (const [k, v] of Object.entries(basic)) {
      if (v == null || v === '' || v === false) continue;
      out.basic[k] = v;
    }
  } catch {}
  try {
    const exifr = require('exifr');
    const parsed = await exifr.parse(filePath, {
      tiff: true,
      xmp: true,
      icc: true,
      iptc: true,
      jfif: true,
      ihdr: true,
      ifd0: true,
      ifd1: false,
      exif: true,
      gps: true,
      interop: true,
      makerNote: false,
      userComment: true,
      multiSegment: true,
      translateKeys: true,
      translateValues: true,
      reviveValues: true,
      mergeOutput: false,
      sanitize: false,
      silentErrors: true,
    });
    if (parsed && typeof parsed === 'object') {
      _flattenMeta(parsed, '', out.all);
      for (const [k, v] of Object.entries(out.all)) {
        if (v == null || v === '' || v === false) continue;
        const short = k.includes('.') ? k.slice(k.lastIndexOf('.') + 1) : k;
        if (out.tags[short] == null) out.tags[short] = v;
      }
    }
  } catch {}
  return out;
});

ipcMain.handle('get-file-url', async (event, filePath) => {
  try {
    return url.pathToFileURL(filePath).href;
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('read-file-base64', async (event, filePath) => {
  try {
    const data = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const mimeMap = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp',
      svg: 'image/svg+xml', ico: 'image/x-icon', avif: 'image/avif',
      tiff: 'image/tiff', tif: 'image/tiff',
      heic: 'image/heic', heif: 'image/heif', hif: 'image/heif',
      dcm: 'application/dicom', dicom: 'application/dicom',
    };
    const mime = mimeMap[ext] || 'application/octet-stream';
    return `data:${mime};base64,${data.toString('base64')}`;
  } catch (err) {
    return { error: err.message };
  }
});

const HEIC_CACHE_DIR = path.join(os.tmpdir(), 'imageviewer-heic-cache');
const _heicMemCache = new Map();
const HEIC_MEM_MAX = 8;
const _heicInflight = new Map();

function _heicCacheKey(filePath, stat) {
  return crypto.createHash('sha1')
    .update(`${filePath}|${stat.mtimeMs}|${stat.size}`)
    .digest('hex');
}

function _rememberHeic(key, displayUrl) {
  if (_heicMemCache.has(key)) _heicMemCache.delete(key);
  _heicMemCache.set(key, displayUrl);
  while (_heicMemCache.size > HEIC_MEM_MAX) {
    const first = _heicMemCache.keys().next().value;
    _heicMemCache.delete(first);
  }
}

async function _pruneHeicCache() {
  let names;
  try { names = await fs.promises.readdir(HEIC_CACHE_DIR); } catch { return; }
  if (names.length < 48) return;
  const rows = await Promise.all(names.map(async (n) => {
    const p = path.join(HEIC_CACHE_DIR, n);
    try {
      const s = await fs.promises.stat(p);
      return { p, t: s.mtimeMs };
    } catch {
      return null;
    }
  }));
  rows.filter(Boolean).sort((a, b) => b.t - a.t).slice(40)
    .forEach((x) => fs.promises.unlink(x.p).catch(() => {}));
}

function _jpegDataUrl(buf) {
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

/**
 * Decode HEIC/HEIF to a displayable JPEG (cached).
 * Prefer heic-convert (libheif-js) — prebuilt sharp on Windows often lacks HEVC.
 */
async function _convertHeicToDataUrl(filePath) {
  const stat = await fs.promises.stat(filePath);
  const key = _heicCacheKey(filePath, stat);
  const hit = _heicMemCache.get(key);
  if (hit) return hit;

  const pending = _heicInflight.get(key);
  if (pending) return pending;

  const work = (async () => {
    await fs.promises.mkdir(HEIC_CACHE_DIR, { recursive: true });
    const cacheFile = path.join(HEIC_CACHE_DIR, `${key}.jpg`);
    try {
      const cached = await fs.promises.readFile(cacheFile);
      if (cached && cached.length) {
        const cachedUrl = _jpegDataUrl(cached);
        _rememberHeic(key, cachedUrl);
        return cachedUrl;
      }
    } catch { /* convert */ }

    const inputBuf = await fs.promises.readFile(filePath);
    const errors = [];
    let jpegBuf = null;

    try {
      const heicConvert = require('heic-convert');
      jpegBuf = Buffer.from(await heicConvert({
        buffer: inputBuf,
        format: 'JPEG',
        quality: 0.88,
      }));
    } catch (e) {
      errors.push(`heic-convert: ${e.message}`);
    }

    if (!jpegBuf) {
      try {
        const decode = require('heic-decode');
        const { width, height, data } = await decode({ buffer: inputBuf });
        const sharp = require('sharp');
        jpegBuf = await sharp(Buffer.from(data), {
          raw: { width, height, channels: 4 },
        })
          .jpeg({ quality: 88 })
          .toBuffer();
      } catch (e) {
        errors.push(`heic-decode: ${e.message}`);
      }
    }

    if (!jpegBuf) {
      try {
        const sharp = require('sharp');
        jpegBuf = await sharp(filePath)
          .rotate()
          .jpeg({ quality: 88 })
          .toBuffer();
      } catch (e) {
        errors.push(`sharp: ${e.message}`);
      }
    }

    if (!jpegBuf) throw new Error(errors.join(' | '));

    await fs.promises.writeFile(cacheFile, jpegBuf);
    _pruneHeicCache();
    const displayUrl = _jpegDataUrl(jpegBuf);
    _rememberHeic(key, displayUrl);
    return displayUrl;
  })();

  _heicInflight.set(key, work);
  try {
    return await work;
  } finally {
    _heicInflight.delete(key);
  }
}

ipcMain.handle('convert-to-png', async (event, filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.heic' || ext === '.heif' || ext === '.hif') {
      return await _convertHeicToDataUrl(filePath);
    }
    const sharp = require('sharp');
    const buf = await sharp(filePath)
      .rotate()
      .toColorspace('srgb')
      .png()
      .toBuffer();
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch (err) {
    return { error: err.message };
  }
});

/**
 * AI background removal via Python rembg (rembg1/u2net, rembg2/bria-rmbg, rembg3/isnet).
 * Input: { dataUrl: 'data:image/png;base64,...', model: 'rembg1'|'rembg2'|'rembg3' }
 * Emits 'rembg-progress' events: { percent, message }
 */
ipcMain.handle('rembg-remove', async (event, { dataUrl, model }) => {
  const { spawn } = require('child_process');
  const tmpRoot = path.join(os.tmpdir(), 'imageviewer-rembg');
  await fs.promises.mkdir(tmpRoot, { recursive: true });
  const id = `${Date.now()}-${process.pid}`;
  const inPath = path.join(tmpRoot, `${id}-in.png`);
  const outPath = path.join(tmpRoot, `${id}-out.png`);
  const worker = path.join(__dirname, 'scripts', 'rembg_worker.py');

  const sendProgress = (percent, message) => {
    try {
      if (!event.sender.isDestroyed()) {
        event.sender.send('rembg-progress', { percent, message: message || '' });
      }
    } catch (_) {}
  };

  try {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      return { error: 'Invalid image data' };
    }
    sendProgress(2, 'preparing');
    const b64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
    await fs.promises.writeFile(inPath, Buffer.from(b64, 'base64'));
    sendProgress(8, 'preparing');

    if (!fs.existsSync(worker)) {
      return { error: `rembg worker missing: ${worker}` };
    }

    const modelKey = (model || 'rembg1').toString();
    const pyCandidates = [
      process.env.IMAGEVIEWER_PYTHON,
      process.platform === 'win32' ? 'python' : 'python3',
      'python',
    ].filter(Boolean);

    let lastErr = '';
    for (const py of pyCandidates) {
      const result = await new Promise((resolve) => {
        const child = spawn(py, [worker, modelKey, inPath, outPath], {
          windowsHide: true,
          env: { ...process.env },
        });
        let stderr = '';
        let stderrBuf = '';
        child.stderr.on('data', (d) => {
          const chunk = d.toString();
          stderr += chunk;
          stderrBuf += chunk;
          const lines = stderrBuf.split(/\r?\n/);
          stderrBuf = lines.pop() || '';
          for (const line of lines) {
            const m = line.match(/^PROGRESS\s+(\d+)\s*(.*)$/);
            if (m) {
              sendProgress(Number(m[1]), (m[2] || '').trim());
            }
          }
        });
        child.on('error', (err) => resolve({ code: -1, stderr: err.message }));
        child.on('close', (code) => {
          if (stderrBuf) {
            const m = stderrBuf.match(/^PROGRESS\s+(\d+)\s*(.*)$/m);
            if (m) sendProgress(Number(m[1]), (m[2] || '').trim());
          }
          resolve({ code, stderr });
        });
      });

      if (result.code === 0 && fs.existsSync(outPath)) {
        sendProgress(95, 'applying');
        const outBuf = await fs.promises.readFile(outPath);
        sendProgress(100, 'done');
        return { dataUrl: `data:image/png;base64,${outBuf.toString('base64')}` };
      }
      lastErr = (result.stderr || '').trim() || `exit ${result.code}`;
      // If python missing, try next candidate
      if (/ENOENT|not found/i.test(lastErr)) continue;
      break;
    }

    return {
      error: lastErr || 'rembg failed',
      hint: 'pip install rembg onnxruntime  (models: rembg1=u2net, rembg2=bria-rmbg, rembg3=isnet-general-use)',
    };
  } catch (err) {
    return { error: err.message };
  } finally {
    for (const p of [inPath, outPath]) {
      try { await fs.promises.unlink(p); } catch {}
    }
  }
});

ipcMain.handle('decode-dicom', async (event, filePath) => {
  try {
    const data = await fs.promises.readFile(filePath);
    const decoded = DicomDecoder.decode(data);
    if (decoded.error) return { error: decoded.error };

    const meta = {
      patientName: decoded.meta?.patientName || '',
      studyDate: decoded.meta?.studyDate || '',
      modality: decoded.meta?.modality || '',
      rows: decoded.height,
      cols: decoded.width,
    };

    if (decoded.jpegBytes) {
      return {
        dataUrl: `data:image/jpeg;base64,${Buffer.from(decoded.jpegBytes).toString('base64')}`,
        meta,
      };
    }

    if (!decoded.rgba || !decoded.width || !decoded.height) {
      return { error: 'Could not render DICOM pixels' };
    }

    const sharp = require('sharp');
    const pngBuf = await sharp(Buffer.from(decoded.rgba), {
      raw: { width: decoded.width, height: decoded.height, channels: 4 },
    }).png().toBuffer();
    return { dataUrl: `data:image/png;base64,${pngBuf.toString('base64')}`, meta };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('save-file', async (event, { defaultPath, dataUrl }) => {
  if (!mainWindow) return { canceled: true };
  const saveDefault = defaultPath
    ? (path.isAbsolute(defaultPath) ? defaultPath : path.join(_dialogDefaultPath(), defaultPath))
    : path.join(_dialogDefaultPath(), 'image.png');
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: saveDefault,
    filters: [
      { name: 'PNG Image',  extensions: ['png'] },
      { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] },
      { name: 'WebP Image', extensions: ['webp'] },
      { name: 'BMP Image',  extensions: ['bmp'] },
    ],
  });
  if (result.canceled) return { canceled: true };
  try {
    const base64 = dataUrl.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');
    await fs.promises.writeFile(result.filePath, buffer);
    _saveLastOpenDir(result.filePath);
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('show-save-dialog', async (event, { defaultPath }) => {
  if (!mainWindow) return { canceled: true };
  const saveDefault = defaultPath
    ? (path.isAbsolute(defaultPath) ? defaultPath : path.join(_dialogDefaultPath(), defaultPath))
    : path.join(_dialogDefaultPath(), 'image.png');
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: saveDefault,
    filters: [
      { name: 'PNG Image',  extensions: ['png'] },
      { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] },
      { name: 'WebP Image', extensions: ['webp'] },
      { name: 'BMP Image',  extensions: ['bmp'] },
    ],
  });
  if (result.canceled) return { canceled: true };
  _saveLastOpenDir(result.filePath);
  return { filePath: result.filePath };
});

ipcMain.handle('write-file', async (event, { filePath, dataUrl }) => {
  try {
    const base64 = dataUrl.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');
    await fs.promises.writeFile(filePath, buffer);
    return { success: true, filePath };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('open-file-dialog', async () => handleOpenFile());
ipcMain.handle('get-launch-file', () => {
  const filePath = pendingOpenPath;
  pendingOpenPath = null;
  return filePath;
});
ipcMain.handle('open-folder-dialog', async () => handleOpenFolder());
ipcMain.handle('set-last-open-dir', async (event, dirPath) => {
  _saveLastOpenDir(dirPath);
  return lastOpenDir;
});
ipcMain.handle('get-last-open-dir', async () => lastOpenDir || _dialogDefaultPath());
ipcMain.handle('get-home-dir', async () => os.homedir());
ipcMain.handle('get-path-sep', async () => path.sep);
ipcMain.handle('path-join', async (event, ...parts) => path.join(...parts.flat()));
ipcMain.handle('path-dirname', async (event, p) => path.dirname(p));
ipcMain.handle('path-basename', async (event, p) => path.basename(p));

ipcMain.handle('update-menu', async (event, { lang, translations, theme }) => {
  if (lang) currentLang = lang;
  if (theme) currentTheme = theme;
  if (process.platform === 'darwin') buildMenu(translations || {});
});

ipcMain.handle('window-set-min-size', (_event, width, height) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const w = Math.max(800, Math.round(Number(width) || 0));
  const h = Math.max(500, Math.round(Number(height) || 0));
  const [cw, ch] = mainWindow.getMinimumSize();
  if (cw === w && ch === h) return;
  mainWindow.setMinimumSize(w, h);
});
ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});
ipcMain.handle('window-maximize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (_isWindowMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return _isWindowMaximized();
});
ipcMain.handle('window-is-maximized', () => _isWindowMaximized());
ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.close();
});
ipcMain.handle('window-toggle-fullscreen', () => {
  if (!mainWindow) return false;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
  return mainWindow.isFullScreen();
});

ipcMain.handle('show-message-box', async (event, options) => {
  if (!mainWindow) return { response: 0 };
  return dialog.showMessageBox(mainWindow, options);
});

ipcMain.handle('show-item-in-folder', async (event, filePath) => {
  shell.showItemInFolder(filePath);
});

// File watching: watch a directory for changes and notify renderer
ipcMain.handle('watch-directory', (event, dirPath) => {
  if (fileWatchers.has(dirPath)) return;
  try {
    let debounceTimer = null;
    const watcher = fs.watch(dirPath, { persistent: false }, (eventType, filename) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('directory-changed', dirPath);
        }
      }, 300);
    });
    watcher.on('error', () => fileWatchers.delete(dirPath));
    fileWatchers.set(dirPath, watcher);
  } catch (e) {
    // ignore watch errors (network drives, permissions, etc.)
  }
});

ipcMain.handle('unwatch-directory', (event, dirPath) => {
  const watcher = fileWatchers.get(dirPath);
  if (watcher) { watcher.close(); fileWatchers.delete(dirPath); }
});

// Watch current file for external changes
ipcMain.handle('watch-file', (event, filePath) => {
  if (fileWatchers.has(filePath)) return;
  try {
    let debounceTimer = null;
    const watcher = fs.watch(filePath, { persistent: false }, () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('file-changed', filePath);
        }
      }, 400);
    });
    watcher.on('error', () => fileWatchers.delete(filePath));
    fileWatchers.set(filePath, watcher);
  } catch (e) {}
});

ipcMain.handle('unwatch-file', (event, filePath) => {
  const watcher = fileWatchers.get(filePath);
  if (watcher) { watcher.close(); fileWatchers.delete(filePath); }
});

// Native drag-out: renderer calls this synchronously on dragstart
// Supports one path (string) or many (string[]). OS drop is typically copy.
ipcMain.on('start-drag', (event, filePathOrPaths) => {
  try {
    const paths = (Array.isArray(filePathOrPaths) ? filePathOrPaths : [filePathOrPaths])
      .filter((p) => typeof p === 'string' && p && fs.existsSync(p));
    if (!paths.length) return;

    const iconPath = path.join(__dirname, 'src', 'assets', 'icon.png');
    const icon = fs.existsSync(iconPath)
      ? nativeImage.createFromPath(iconPath).resize({ width: 64, height: 64 })
      : nativeImage.createEmpty();

    if (paths.length === 1) {
      event.sender.startDrag({ file: paths[0], icon });
    } else {
      try {
        event.sender.startDrag({ files: paths, icon });
      } catch (_) {
        // Some platforms only accept a single file
        event.sender.startDrag({ file: paths[0], icon });
      }
    }
  } catch (e) {
    console.error('startDrag failed:', e.message);
  }
});

ipcMain.handle('pick-directory', async (event, opts = {}) => {
  if (!mainWindow) return { canceled: true };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: opts.title || undefined,
    defaultPath: opts.defaultPath || lastOpenDir || _dialogDefaultPath(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths?.length) return { canceled: true };
  _saveLastOpenDir(result.filePaths[0]);
  return { path: result.filePaths[0] };
});

ipcMain.handle('set-unsaved-changes', (event, value) => {
  hasUnsavedChanges = value;
});

ipcMain.handle('close-window', () => {
  isForceClose = true;
  mainWindow && mainWindow.close();
});

ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    const st = await fs.promises.stat(filePath);
    if (st.isDirectory()) {
      await fs.promises.rm(filePath, { recursive: true, force: true });
    } else {
      await fs.promises.unlink(filePath);
    }
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

/** Unique destination path if name already exists (e.g. photo (1).jpg). */
async function _uniqueDestPath(destDir, baseName) {
  let dest = path.join(destDir, baseName);
  try {
    await fs.promises.access(dest);
  } catch {
    return dest;
  }
  const ext = path.extname(baseName);
  const stem = path.basename(baseName, ext);
  let i = 1;
  for (;;) {
    dest = path.join(destDir, `${stem} (${i})${ext}`);
    try {
      await fs.promises.access(dest);
      i += 1;
    } catch {
      return dest;
    }
  }
}

function _isPathInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Copy or move files/folders into destDir.
 * @param {{ sources: string[], destDir: string, mode?: 'copy'|'move' }} opts
 */
ipcMain.handle('transfer-into-dir', async (event, opts = {}) => {
  const sources = Array.isArray(opts.sources) ? opts.sources.filter(Boolean) : [];
  const destDir = opts.destDir;
  const mode = opts.mode === 'move' ? 'move' : 'copy';

  if (!destDir || !sources.length) {
    return { error: 'Missing source or destination' };
  }

  try {
    const destStat = await fs.promises.stat(destDir);
    if (!destStat.isDirectory()) {
      return { error: 'Destination is not a directory' };
    }
  } catch (err) {
    return { error: err.message };
  }

  const results = [];
  const errors = [];

  for (const src of sources) {
    try {
      const srcResolved = path.resolve(src);
      const destResolved = path.resolve(destDir);

      if (_isPathInside(srcResolved, destResolved)) {
        errors.push({ src, error: 'Cannot drop a folder into itself' });
        continue;
      }

      const srcStat = await fs.promises.stat(srcResolved);
      const baseName = path.basename(srcResolved);
      const srcParent = path.resolve(path.dirname(srcResolved));

      // Moving within the same folder is a no-op
      if (mode === 'move' && srcParent.toLowerCase() === destResolved.toLowerCase()) {
        results.push({ src: srcResolved, dest: srcResolved, skipped: true });
        continue;
      }

      const dest = await _uniqueDestPath(destDir, baseName);

      // Copying onto exact same path — skip
      if (srcResolved.toLowerCase() === path.resolve(dest).toLowerCase()) {
        results.push({ src: srcResolved, dest: srcResolved, skipped: true });
        continue;
      }

      if (mode === 'move') {
        try {
          await fs.promises.rename(srcResolved, dest);
        } catch (renameErr) {
          // Cross-device move: copy then remove
          if (srcStat.isDirectory()) {
            await fs.promises.cp(srcResolved, dest, { recursive: true });
            await fs.promises.rm(srcResolved, { recursive: true, force: true });
          } else {
            await fs.promises.copyFile(srcResolved, dest);
            await fs.promises.unlink(srcResolved);
          }
        }
      } else if (srcStat.isDirectory()) {
        await fs.promises.cp(srcResolved, dest, { recursive: true });
      } else {
        await fs.promises.copyFile(srcResolved, dest);
      }

      results.push({ src: srcResolved, dest, mode });
    } catch (err) {
      errors.push({ src, error: err.message });
    }
  }

  return {
    success: errors.length === 0,
    mode,
    destDir,
    results,
    errors: errors.length ? errors : undefined,
  };
});

app.whenReady().then(() => {
  if (!gotTheLock) return;
  _loadUiConfig();
  createWindow();
  buildMenu({});

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
