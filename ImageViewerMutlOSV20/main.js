const { app, BrowserWindow, ipcMain, dialog, Menu, shell, clipboard, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const os = require('os');
const crypto = require('crypto');
const DicomDecoder = require('./src/js/dicomDecoder');
const Themes = require('./src/js/themes');

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
  try {
    if (!dir) {
      lastOpenDir = null;
      let cfg = {};
      try { cfg = JSON.parse(fs.readFileSync(_getUiConfigPath(), 'utf8')); } catch {}
      delete cfg.lastOpenDir;
      fs.writeFileSync(_getUiConfigPath(), JSON.stringify(cfg), 'utf8');
      return;
    }
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
 * Copy the ICO to a unique temp path so Windows Shell does not keep showing
 * a cached icon from the previous src/assets/icon.ico contents.
 */
function _shellIconPath() {
  const ico = _resolveAsset('src', 'assets', 'icon.ico');
  if (!fs.existsSync(ico)) return _getAppIconPath();
  try {
    const buf = fs.readFileSync(ico);
    const hash = crypto.createHash('md5').update(buf).digest('hex').slice(0, 10);
    const dest = path.join(os.tmpdir(), `imageviewer-icon-${hash}.ico`);
    if (!fs.existsSync(dest) || fs.statSync(dest).size !== buf.length) {
      fs.writeFileSync(dest, buf);
    }
    return dest;
  } catch {
    return ico;
  }
}

/**
 * Path Windows Shell can load for the taskbar / Jump List.
 * Always prefer a real .ico on disk — more reliable than the .exe for setAppDetails.
 */
function _getTaskbarIconPath() {
  if (process.platform === 'win32') {
    const ico = _shellIconPath();
    if (ico && fs.existsSync(ico) && !ico.includes(`${path.sep}app.asar${path.sep}`)) {
      return ico;
    }
    if (app.isPackaged) return process.execPath;
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
  // Window chrome prefers a unique .ico path so Windows does not reuse a cached icon
  const windowIconPath = (() => {
    if (process.platform === 'win32') {
      const ico = _shellIconPath();
      if (ico && fs.existsSync(ico)) return ico;
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
    _destroyPopupWindow();
  });
  // The detached menu follows the app window: any move / minimise / focus loss closes it
  mainWindow.on('move', _hidePopupWindow);
  mainWindow.on('minimize', _hidePopupWindow);
  mainWindow.on('blur', () => {
    // Clicking inside the popup does not blur us (it is non-focusable); anything else does
    setTimeout(() => { if (!popupWindow || popupWindow.isDestroyed() || !popupWindow.isFocused()) _hidePopupWindow(); }, 0);
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
  const themeItem = (th) => ({
    label: Themes.label(th.id, t),
    type: 'radio',
    checked: currentTheme === th.id,
    click: () => {
      currentTheme = th.id;
      mainWindow && mainWindow.webContents.send('menu-action', `theme:${th.id}`);
      buildMenu(translations);
    },
  });

  const template = [
    {
      label: t('menu.file'),
      submenu: [
        {
          label: t('menu.openFile'),
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'open-file'),
        },
        {
          label: t('menu.openFolder'),
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'open-folder'),
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
          label: t('menu.settings'),
          click: () => mainWindow && mainWindow.webContents.send('menu-action', 'show-settings'),
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
          label: t('menu.theme'),
          submenu: [
            { label: t('menu.darkThemes'), enabled: false },
            ...Themes.ofKind('dark').map((th) => themeItem(th)),
            { type: 'separator' },
            { label: t('menu.lightThemes'), enabled: false },
            ...Themes.ofKind('light').map((th) => themeItem(th)),
          ],
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

ipcMain.handle('open-subtitle-dialog', async (event, videoPath) => {
  if (!mainWindow) return { canceled: true };
  const defaultPath = (() => {
    try {
      if (videoPath && fs.existsSync(videoPath)) return path.dirname(videoPath);
    } catch {}
    return _dialogDefaultPath();
  })();
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath,
    properties: ['openFile'],
    filters: [
      { name: 'Subtitles', extensions: ['srt', 'smi'] },
      { name: 'SRT', extensions: ['srt'] },
      { name: 'SMI', extensions: ['smi'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  return { canceled: false, filePath: result.filePaths[0] };
});

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
    const parsed = await Promise.race([
      exifr.parse(filePath, {
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
        multiSegment: false,
        translateKeys: true,
        translateValues: true,
        reviveValues: true,
        mergeOutput: false,
        sanitize: false,
        silentErrors: true,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('exif timeout')), 4000)),
    ]);
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

/** Audio/video container metadata (duration, codecs, dimensions, tags). */
ipcMain.handle('read-media-meta', async (event, filePath) => {
  if (!filePath) return null;
  const out = { basic: {}, tags: {}, all: {} };
  const ext = path.extname(filePath).toLowerCase().slice(1);
  let fileSize = null;
  try {
    fileSize = (await fs.promises.stat(filePath)).size;
  } catch {}

  function _applyBasic(basic) {
    out.basic = {};
    for (const [k, v] of Object.entries(basic || {})) {
      if (v == null || v === '') continue;
      out.basic[k] = v;
    }
  }

  function _applyTagMap(tagMap) {
    for (const [k, v] of Object.entries(tagMap || {})) {
      if (v == null || v === '') continue;
      out.tags[k] = v;
      out.all[k] = v;
    }
  }

  function _stripCodecDecor(name) {
    return String(name || '').replace(/^<|>$/g, '').trim();
  }

  function _prettyCodec(name) {
    const raw = _stripCodecDecor(name);
    if (!raw) return null;
    const key = raw.toLowerCase();
    const map = {
      avc1: 'H.264 (AVC)', avc: 'H.264 (AVC)', h264: 'H.264 (AVC)',
      hvc1: 'H.265 (HEVC)', hev1: 'H.265 (HEVC)', hevc: 'H.265 (HEVC)', h265: 'H.265 (HEVC)',
      vp8: 'VP8', vp9: 'VP9', av01: 'AV1', av1: 'AV1',
      vorbis: 'Vorbis', opus: 'Opus', flac: 'FLAC', pcm: 'PCM',
      'mpeg-4/aac': 'AAC', aac: 'AAC',
      'mpeg 1 layer 3': 'MP3', 'mpeg 2 layer 3': 'MP3', mp3: 'MP3',
      'ieee float': 'IEEE Float',
    };
    if (map[key]) return map[key];
    if (/avc|h\.?264/i.test(raw)) return 'H.264 (AVC)';
    if (/hvc|hev|h\.?265|hevc/i.test(raw)) return 'H.265 (HEVC)';
    if (/mpeg-4\s*\/\s*aac|aac/i.test(raw)) return 'AAC';
    if (/mpeg\s*\d*\s*layer\s*3|mp3/i.test(raw)) return 'MP3';
    if (/^text$/i.test(raw)) return null;
    return raw;
  }

  function _isVideoCodecName(name) {
    const s = _stripCodecDecor(name);
    if (!s || /^text$/i.test(s)) return false;
    // Audio MPEG labels must not count as video (e.g. "MPEG-4/AAC", "MPEG 1 Layer 3")
    if (/mpeg.*layer|\bmp3\b|mpeg-4\s*\/\s*aac|(^|\/)\s*aac\b|\bvorbis\b|\bopus\b|\bflac\b|\bpcm\b/i.test(s)
      && !/\b(avc\d*|h\.?26[45]|vp[89]|hevc|hvc1|hev1)\b/i.test(s)) {
      return false;
    }
    return /^(vp[89]|av0?1|avc\d*|h\.?26[45]|hevc|hvc1|hev1|theora|mp4v)/i.test(s)
      || /\b(vp[89]|h\.?26[45]|avc\d*|hevc|hvc1|hev1|mp4v)\b/i.test(s);
  }

  function _isAudioCodecName(name) {
    const s = _stripCodecDecor(name);
    if (!s || /^text$/i.test(s)) return false;
    if (_isVideoCodecName(s)) return false;
    return /^(vorbis|opus|aac|mp3|flac|pcm|ac-?3|e-?ac-?3)/i.test(s)
      || /MPEG-4\s*\/\s*AAC|MPEG\s+\d+\s+Layer|\bAAC\b|\bVorbis\b|\bOpus\b|\bFLAC\b|\bPCM\b|\bMP3\b/i.test(s)
      || (/^mpeg/i.test(s) && /aac|layer|audio/i.test(s));
  }

  function _fmtContainer(container, fileExt) {
    if (!container) return (fileExt || '').toUpperCase() || null;
    let s = String(container).replace(/^EBML\//i, '').trim();
    const low = s.toLowerCase();
    if (/^(mp4|isom|iso2|mp42|avc1|m4a|m4v)/i.test(low) || /\/(isom|iso2|mp42|avc1)\b/i.test(low)) {
      return 'MP4';
    }
    if (/^webm$/i.test(low)) return 'WebM';
    if (/^matroska|mkv$/i.test(low)) return 'Matroska';
    if (/^wave|wav$/i.test(low)) return 'WAVE';
    if (/^mpeg$/i.test(low)) return 'MPEG';
    if (/^ogg$/i.test(low)) return 'Ogg';
    if (/^flac$/i.test(low)) return 'FLAC';
    return s;
  }

  /** Lightweight RIFF/WAVE header fallback (PCM and common variants). */
  async function _parseWavFallback() {
    if (ext !== 'wav' && ext !== 'wave') return null;
    const fh = await fs.promises.open(filePath, 'r');
    try {
      const head = Buffer.alloc(12);
      await fh.read(head, 0, 12, 0);
      if (head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') {
        return null;
      }
      let offset = 12;
      const stat = await fh.stat();
      let fmt = null;
      let dataSize = null;
      const infoTags = {};
      while (offset + 8 <= stat.size) {
        const chunkHead = Buffer.alloc(8);
        await fh.read(chunkHead, 0, 8, offset);
        const id = chunkHead.toString('ascii', 0, 4);
        const size = chunkHead.readUInt32LE(4);
        const dataOff = offset + 8;
        if (id === 'fmt ' && size >= 16) {
          const fmtBuf = Buffer.alloc(Math.min(size, 40));
          await fh.read(fmtBuf, 0, fmtBuf.length, dataOff);
          fmt = {
            audioFormat: fmtBuf.readUInt16LE(0),
            channels: fmtBuf.readUInt16LE(2),
            sampleRate: fmtBuf.readUInt32LE(4),
            byteRate: fmtBuf.readUInt32LE(8),
            blockAlign: fmtBuf.readUInt16LE(12),
            bitsPerSample: fmtBuf.readUInt16LE(14),
          };
        } else if (id === 'data') {
          dataSize = size;
        } else if (id === 'LIST' && size >= 4) {
          const listKind = Buffer.alloc(4);
          await fh.read(listKind, 0, 4, dataOff);
          if (listKind.toString('ascii') === 'INFO') {
            let p = dataOff + 4;
            const end = dataOff + size;
            while (p + 8 <= end) {
              const ih = Buffer.alloc(8);
              await fh.read(ih, 0, 8, p);
              const iid = ih.toString('ascii', 0, 4);
              const isize = ih.readUInt32LE(4);
              const ival = Buffer.alloc(Math.min(isize, 1024));
              await fh.read(ival, 0, ival.length, p + 8);
              const text = ival.toString('utf8').replace(/\0+$/, '').trim();
              if (text) infoTags[iid] = text;
              p += 8 + isize + (isize % 2); // word-aligned
            }
          }
        }
        offset += 8 + size + (size % 2);
        if (offset > stat.size) break;
      }
      if (!fmt) return null;
      const codecMap = {
        1: 'PCM',
        3: 'IEEE Float',
        6: 'A-law',
        7: 'μ-law',
        17: 'IMA ADPCM',
        85: 'MPEG',
        65534: 'Extensible',
      };
      const bytesPerSample = Math.max(1, Math.round(fmt.bitsPerSample / 8));
      const duration = (dataSize != null && fmt.sampleRate && fmt.channels)
        ? dataSize / (fmt.sampleRate * fmt.channels * bytesPerSample)
        : null;
      const bitrate = fmt.byteRate ? fmt.byteRate * 8 : null;
      return {
        basic: {
          format: 'WAVE',
          duration: Number.isFinite(duration) ? duration : null,
          bitrate: Number.isFinite(bitrate) ? bitrate : null,
          sampleRate: fmt.sampleRate || null,
          channels: fmt.channels || null,
          bitsPerSample: fmt.bitsPerSample || null,
          codec: codecMap[fmt.audioFormat] || `format ${fmt.audioFormat}`,
          audioCodec: codecMap[fmt.audioFormat] || `format ${fmt.audioFormat}`,
          lossless: fmt.audioFormat === 1 || fmt.audioFormat === 3,
          mediaKind: 'audio',
          blockAlign: fmt.blockAlign || null,
        },
        tags: {
          title: infoTags.INAM || infoTags.TITLE || null,
          artist: infoTags.IART || infoTags.ARTIST || null,
          album: infoTags.IPRD || infoTags.ALBUM || null,
          copyright: infoTags.ICOP || null,
          comment: infoTags.ICMT || null,
          genre: infoTags.IGNR || null,
          date: infoTags.ICRD || null,
          encoder: infoTags.ISFT || infoTags.ITCH || null,
          description: infoTags.ISBJ || null,
        },
      };
    } finally {
      await fh.close();
    }
  }

  try {
    const mm = await import('music-metadata');
    const metadata = await Promise.race([
      mm.parseFile(filePath, { duration: true, skipCovers: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('media meta timeout')), 8000)),
    ]);
    const fmt = metadata.format || {};
    const common = metadata.common || {};

    let width = null;
    let height = null;
    let videoCodec = null;
    let audioCodec = null;
    let frameRate = null;
    let trackSampleRate = null;
    let trackChannels = null;
    let trackBitDepth = null;
    // music-metadata: format.trackInfo (and sometimes top-level trackInfo)
    // Note: ISOBMFF/MP4 often mis-labels video tracks (type=2 + bogus audio blob for <avc1>).
    const trackInfo = Array.isArray(fmt.trackInfo)
      ? fmt.trackInfo
      : (Array.isArray(metadata.trackInfo) ? metadata.trackInfo : []);
    for (const t of trackInfo) {
      if (!t || typeof t !== 'object') continue;
      const codecRaw = t.codecName || t.codec || t.codecProfile || null;
      if (!codecRaw || /^text$/i.test(_stripCodecDecor(codecRaw))) continue;
      const v = (t.video && typeof t.video === 'object') ? t.video : null;
      const a = (t.audio && typeof t.audio === 'object') ? t.audio : null;
      const typeNum = Number(t.type);
      const typeStr = String(t.type || '').toLowerCase();
      const byCodecVideo = _isVideoCodecName(codecRaw);
      const byCodecAudio = _isAudioCodecName(codecRaw);
      // Prefer codec-name heuristics; Matroska uses type 1=video / 2=audio reliably.
      const looksVideo = byCodecVideo || !!(v && (v.pixelWidth || v.pixelHeight))
        || typeNum === 1 || typeStr === 'video' || typeStr.includes('video');
      const looksAudio = !byCodecVideo && (byCodecAudio
        || !!(a && ((a.channels > 0) || (a.samplingFrequency >= 1000)))
        || ((typeNum === 2 || typeStr === 'audio' || typeStr.includes('audio')) && !byCodecVideo));

      if (looksVideo) {
        const tw = v?.pixelWidth || v?.displayWidth || t.width || t.pixelWidth || null;
        const th = v?.pixelHeight || v?.displayHeight || t.height || t.pixelHeight || null;
        if (tw) width = tw;
        if (th) height = th;
        const pretty = _prettyCodec(codecRaw);
        if (pretty) videoCodec = pretty;
        const fr = v?.frameRate || t.frameRate || t.fps || null;
        if (fr && Number(fr) > 0) frameRate = Number(fr);
      }
      if (looksAudio) {
        const pretty = _prettyCodec(codecRaw);
        if (pretty) audioCodec = pretty;
        const sr = a?.samplingFrequency || a?.outputSamplingFrequency || null;
        // Reject bogus rates from misclassified video tracks (e.g. 320 Hz on avc1)
        if (Number.isFinite(sr) && sr >= 1000) trackSampleRate = sr;
        if (Number.isFinite(a?.channels) && a.channels > 0) trackChannels = a.channels;
        if (Number.isFinite(a?.bitDepth) && a.bitDepth > 0) trackBitDepth = a.bitDepth;
      }
    }

    // Container brand hint when track list omitted video codec (rare)
    if (!videoCodec && fmt.hasVideo && typeof fmt.container === 'string') {
      if (/avc1|avc/i.test(fmt.container)) videoCodec = 'H.264 (AVC)';
      else if (/hvc1|hev1|hevc/i.test(fmt.container)) videoCodec = 'H.265 (HEVC)';
    }

    const hasVideo = !!(width || height || videoCodec || fmt.hasVideo === true);
    const sampleRate = Number.isFinite(fmt.sampleRate) && fmt.sampleRate >= 1000
      ? fmt.sampleRate
      : (Number.isFinite(trackSampleRate) ? trackSampleRate : null);
    const channels = Number.isFinite(fmt.numberOfChannels) && fmt.numberOfChannels > 0
      ? fmt.numberOfChannels
      : (Number.isFinite(trackChannels) ? trackChannels : null);
    const bitsPerSample = Number.isFinite(fmt.bitsPerSample) && fmt.bitsPerSample > 0
      ? fmt.bitsPerSample
      : (Number.isFinite(trackBitDepth) && trackBitDepth > 0 ? trackBitDepth : null);

    const duration = Number.isFinite(fmt.duration) ? fmt.duration : null;
    let bitrate = Number.isFinite(fmt.bitrate) && fmt.bitrate > 0 ? fmt.bitrate : null;
    let bitrateEstimated = false;
    if (!bitrate && duration > 0 && fileSize > 0) {
      bitrate = (fileSize * 8) / duration;
      bitrateEstimated = true;
    }

    const prettyFmtCodec = _prettyCodec(fmt.codec);
    if (!audioCodec && !hasVideo && prettyFmtCodec) audioCodec = prettyFmtCodec;
    if (!audioCodec && hasVideo && prettyFmtCodec && _isAudioCodecName(fmt.codec)) {
      audioCodec = prettyFmtCodec;
    }

    const containerLabel = _fmtContainer(fmt.container, ext);

    _applyBasic({
      width,
      height,
      format: containerLabel,
      duration,
      bitrate,
      bitrateEstimated: bitrateEstimated || null,
      sampleRate,
      channels,
      bitsPerSample,
      numberOfSamples: Number.isFinite(fmt.numberOfSamples) ? fmt.numberOfSamples : null,
      codec: videoCodec && audioCodec
        ? `${videoCodec} / ${audioCodec}`
        : (videoCodec || audioCodec || prettyFmtCodec || null),
      videoCodec: videoCodec || null,
      audioCodec: audioCodec || null,
      frameRate: Number.isFinite(frameRate) ? frameRate : null,
      lossless: fmt.lossless === true ? true : (fmt.lossless === false ? false : null),
      hasAudio: fmt.hasAudio === true ? true : (audioCodec ? true : null),
      hasVideo: hasVideo ? true : (fmt.hasVideo === false ? false : null),
      mediaKind: hasVideo ? 'video' : 'audio',
    });

    _applyTagMap({
      title: common.title,
      artist: common.artist,
      album: common.album,
      albumartist: common.albumartist,
      year: common.year,
      genre: Array.isArray(common.genre) ? common.genre.join(', ') : common.genre,
      comment: Array.isArray(common.comment)
        ? common.comment.map((c) => (typeof c === 'string' ? c : c?.text)).filter(Boolean).join('; ')
        : common.comment,
      track: common.track?.no,
      disk: common.disk?.no,
      composer: Array.isArray(common.composer) ? common.composer.join(', ') : common.composer,
      copyright: common.copyright,
      encoder: common.encodedby || common.encodersettings,
      date: common.date,
      description: common.description,
    });

    // Keep native dump lean: only into all[], avoid polluting tags with obscure ids
    if (metadata.native && typeof metadata.native === 'object') {
      for (const [ns, list] of Object.entries(metadata.native)) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
          if (!item || item.id == null) continue;
          const key = `${ns}.${item.id}`;
          const val = _metaJsonSafe(item.value);
          if (val == null || val === '' || val === false) continue;
          if (out.all[key] == null) out.all[key] = val;
        }
      }
    }

    // Fill gaps from WAV header if needed
    if ((!out.basic.bitsPerSample || !out.basic.duration || !out.basic.sampleRate) && (ext === 'wav' || ext === 'wave')) {
      const fb = await _parseWavFallback();
      if (fb?.basic) {
        for (const [k, v] of Object.entries(fb.basic)) {
          if (out.basic[k] == null && v != null) out.basic[k] = v;
        }
      }
      if (fb?.tags) {
        for (const [k, v] of Object.entries(fb.tags)) {
          if (v == null || v === '') continue;
          if (out.tags[k] == null) out.tags[k] = v;
          if (out.all[k] == null) out.all[k] = v;
        }
      }
    }
  } catch (err) {
    // Fallback for WAV if ESM/parser fails in Electron
    try {
      const fb = await _parseWavFallback();
      if (fb) {
        _applyBasic(fb.basic);
        _applyTagMap(fb.tags);
      } else {
        out.basic = { error: err.message || 'media meta failed' };
      }
    } catch (err2) {
      out.basic = { error: err2.message || err.message || 'media meta failed' };
    }
  }
  return out;
});

ipcMain.handle('get-file-url', async (event, filePath) => {
  try {
    return url.pathToFileURL(filePath).href;
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('read-file-bytes', async (event, filePath) => {
  try {
    const data = await fs.promises.readFile(filePath);
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
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
      srt: 'text/plain', smi: 'text/plain',
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

function _sendOpenProgress(event, percent, message) {
  try {
    if (event?.sender && !event.sender.isDestroyed()) {
      event.sender.send('open-progress', { percent, message: message || '' });
    }
  } catch (_) {}
}

/**
 * Decode HEIC/HEIF to a displayable JPEG (cached).
 * Prefer heic-convert (libheif-js) — prebuilt sharp on Windows often lacks HEVC.
 */
async function _convertHeicToDataUrl(filePath, onProgress) {
  const note = (p, m) => { try { onProgress?.(p, m); } catch {} };
  note(8, 'reading');
  const stat = await fs.promises.stat(filePath);
  const key = _heicCacheKey(filePath, stat);
  const hit = _heicMemCache.get(key);
  if (hit) {
    note(92, 'displaying');
    return hit;
  }

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
        note(90, 'displaying');
        return cachedUrl;
      }
    } catch { /* convert */ }

    note(18, 'reading');
    const inputBuf = await fs.promises.readFile(filePath);
    const errors = [];
    let jpegBuf = null;

    note(28, 'decoding');
    try {
      const heicConvert = require('heic-convert');
      jpegBuf = Buffer.from(await Promise.race([
        heicConvert({
          buffer: inputBuf,
          format: 'JPEG',
          quality: 0.88,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('HEIC convert timeout')), 18000)),
      ]));
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

    note(78, 'caching');
    await fs.promises.writeFile(cacheFile, jpegBuf);
    _pruneHeicCache();
    const displayUrl = _jpegDataUrl(jpegBuf);
    _rememberHeic(key, displayUrl);
    note(94, 'displaying');
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
  const note = (p, m) => _sendOpenProgress(event, p, m);
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.heic' || ext === '.heif' || ext === '.hif') {
      return await _convertHeicToDataUrl(filePath, note);
    }
    note(12, 'reading');
    const sharp = require('sharp');
    note(40, 'converting');
    const buf = await sharp(filePath)
      .rotate()
      .toColorspace('srgb')
      .png()
      .toBuffer();
    note(92, 'displaying');
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch (err) {
    return { error: err.message };
  }
});

/* ═══════════════════════════════════════════════════════════
   Python + rembg auto-provisioning
   ───────────────────────────────────────────────────────────
   Policy: use whatever Python the machine already has and install only
   the missing `rembg`/`onnxruntime` packages into it (streaming progress
   to the renderer). We never downgrade or replace an existing Python.
   Downloading/installing Python is a LAST RESORT, only when no working
   interpreter exists at all — and then we install a current version.
   ═══════════════════════════════════════════════════════════ */
const PY_VERSION = '3.14.0';

function _pyInstallerName() {
  if (process.arch === 'arm64') return `python-${PY_VERSION}-arm64.exe`;
  if (process.arch === 'ia32')  return `python-${PY_VERSION}.exe`;
  return `python-${PY_VERSION}-amd64.exe`;
}
function _pyInstallerUrl() {
  return `https://www.python.org/ftp/python/${PY_VERSION}/${_pyInstallerName()}`;
}
function _managedPythonExe() {
  return path.join(app.getPath('userData'), 'python', 'python.exe');
}

function _runCmd(cmd, args, opts = {}) {
  const { spawn } = require('child_process');
  return new Promise((resolve) => {
    let out = '', err = '', child;
    try {
      child = spawn(cmd, args, { windowsHide: true, ...opts });
    } catch (e) {
      return resolve({ code: -1, out: '', err: e.message });
    }
    if (child.stdout) child.stdout.on('data', (d) => { const s = d.toString(); out += s; if (opts.onLine) opts.onLine(s); });
    if (child.stderr) child.stderr.on('data', (d) => { const s = d.toString(); err += s; if (opts.onLine) opts.onLine(s); });
    child.on('error', (e) => resolve({ code: -1, out, err: err || e.message }));
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

async function _pythonWorks(py) {
  if (!py) return false;
  const r = await _runCmd(py, ['--version']);
  return r.code === 0 && /Python\s+3\./.test(`${r.out}${r.err}`);
}

function _downloadFile(fileUrl, destPath, onProgress, redirects = 0) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    const file = fs.createWriteStream(destPath);
    const req = https.get(fileUrl, { headers: { 'User-Agent': 'ImageViewer' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        file.close(() => fs.unlink(destPath, () => {
          _downloadFile(res.headers.location, destPath, onProgress, redirects + 1).then(resolve, reject);
        }));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        file.close(() => fs.unlink(destPath, () => reject(new Error(`HTTP ${res.statusCode} for ${fileUrl}`))));
        return;
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let done = 0;
      res.on('data', (chunk) => { done += chunk.length; if (total && onProgress) onProgress(done / total); });
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(destPath)));
    });
    req.on('error', (err) => { file.close(() => fs.unlink(destPath, () => reject(err))); });
  });
}

// Download and silently install a per-user Python into userData/python.
async function _installManagedPython(emit) {
  if (process.platform !== 'win32') {
    throw new Error('Automatic Python installation is only supported on Windows. Please install Python 3 from https://www.python.org/downloads/');
  }
  const targetDir = path.join(app.getPath('userData'), 'python');
  const tmp = path.join(os.tmpdir(), 'imageviewer-rembg');
  await fs.promises.mkdir(tmp, { recursive: true });
  const installer = path.join(tmp, _pyInstallerName());

  emit(4, 'downloading_python');
  await _downloadFile(_pyInstallerUrl(), installer, (frac) => {
    emit(4 + Math.round(frac * 26), 'downloading_python'); // 4 → 30
  });

  // ≥35 so the renderer's creep animates the bar during the silent install.
  emit(36, 'installing_python');
  // Per-user, unattended, no PATH changes, into our own folder.
  const r = await _runCmd(installer, [
    '/quiet', 'InstallAllUsers=0', 'PrependPath=0', 'Include_launcher=0',
    'Include_test=0', 'Include_pip=1', 'AssociateFiles=0', 'Shortcuts=0',
    `TargetDir=${targetDir}`,
  ]);
  const exe = _managedPythonExe();
  if (!fs.existsSync(exe)) {
    throw new Error(`Python installation failed (exit ${r.code}). ${(r.err || '').trim()}`.trim());
  }
  try { await fs.promises.unlink(installer); } catch {}
  emit(42, 'installing_python');
  return exe;
}

// Ensure rembg + onnxruntime are importable by `py`; pip-install if not.
async function _ensureRembgPackages(py, emit) {
  const chk = await _runCmd(py, ['-c', 'import rembg, onnxruntime']);
  if (chk.code === 0) return;

  emit(44, 'installing_deps');
  await _runCmd(py, ['-m', 'pip', 'install', '--upgrade', '--no-warn-script-location', 'pip']);

  let creep = 46;
  const bump = (s) => {
    if (/Collecting|Downloading|Building|Preparing|Installing/i.test(s)) {
      creep = Math.min(88, creep + 1);
      emit(creep, 'installing_deps');
    }
  };
  const r = await _runCmd(py, [
    '-m', 'pip', 'install', '--upgrade', '--no-warn-script-location',
    'rembg', 'onnxruntime',
  ], { onLine: bump });

  const verify = await _runCmd(py, ['-c', 'import rembg, onnxruntime']);
  if (verify.code !== 0) {
    const tail = (r.err || r.out || verify.err || '').split(/\r?\n/).filter(Boolean).slice(-4).join(' ');
    throw new Error(`Failed to install rembg/onnxruntime: ${tail || `pip exit ${r.code}`}`);
  }
  emit(90, 'installing_deps');
}

// Resolve a working Python, preferring what the machine already has:
// explicit override → system python → previously app-installed → install.
async function _resolvePython(emit) {
  const candidates = [
    process.env.IMAGEVIEWER_PYTHON,
    process.platform === 'win32' ? 'python' : 'python3',
    'py',
    _managedPythonExe(),
  ].filter(Boolean);
  for (const py of candidates) {
    if (await _pythonWorks(py)) return py;
  }
  return _installManagedPython(emit);
}

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
  // In a packaged build the worker is unpacked from app.asar (asarUnpack), because
  // a child Python process cannot read files from inside the asar archive. In dev
  // (__dirname is not inside app.asar) the replace is a harmless no-op.
  const worker = path
    .join(__dirname, 'scripts', 'rembg_worker.py')
    .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

  // Monotonic progress: never let the bar move backwards across phases
  // (provision → model → inference), which would look like a stall/reset.
  let lastPct = 0;
  const emit = (percent, message) => {
    lastPct = Math.max(lastPct, Math.min(100, percent | 0));
    try {
      if (!event.sender.isDestroyed()) {
        event.sender.send('rembg-progress', { percent: lastPct, message: message || '' });
      }
    } catch (_) {}
  };

  // Run the Python worker; remap its own 0–100 progress into [base..100]
  // so the inference phase keeps advancing from wherever provisioning ended.
  const runWorker = (py, base) => new Promise((resolve) => {
    const remap = (p) => base + ((100 - base) * Math.max(0, Math.min(100, p))) / 100;
    let child;
    try {
      child = spawn(py, [worker, (model || 'rembg1').toString(), inPath, outPath], {
        windowsHide: true, env: { ...process.env },
      });
    } catch (e) {
      return resolve({ code: -1, stderr: e.message });
    }
    let stderr = '', buf = '';
    child.stderr.on('data', (d) => {
      const chunk = d.toString();
      stderr += chunk; buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() || '';
      for (const line of lines) {
        const m = line.match(/^PROGRESS\s+(\d+)\s*(.*)$/);
        if (m) emit(remap(Number(m[1])), (m[2] || '').trim());
      }
    });
    child.on('error', (err) => resolve({ code: -1, stderr: err.message }));
    child.on('close', (code) => {
      const m = buf.match(/^PROGRESS\s+(\d+)\s*(.*)$/m);
      if (m) emit(remap(Number(m[1])), (m[2] || '').trim());
      resolve({ code, stderr });
    });
  });

  try {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      return { error: 'Invalid image data' };
    }
    emit(2, 'preparing');
    const b64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
    await fs.promises.writeFile(inPath, Buffer.from(b64, 'base64'));
    emit(3, 'preparing');

    if (!fs.existsSync(worker)) {
      return { error: `rembg worker missing: ${worker}` };
    }

    // 1) Use the machine's existing Python; only if none exists do we
    //    install one (last resort). We never replace an existing interpreter.
    const py = await _resolvePython(emit);

    // 2) Install rembg/onnxruntime into that Python if they're missing.
    //    (Fast path: if already importable, this returns immediately.)
    await _ensureRembgPackages(py, emit);

    // 3) Run the actual background removal.
    const base = Math.max(lastPct, 8);
    const result = await runWorker(py, base);
    if (result.code === 0 && fs.existsSync(outPath)) {
      emit(96, 'applying');
      const outBuf = await fs.promises.readFile(outPath);
      emit(100, 'done');
      return { dataUrl: `data:image/png;base64,${outBuf.toString('base64')}` };
    }

    return {
      error: (result.stderr || '').trim() || `rembg failed (exit ${result.code})`,
      hint: 'models: rembg1=u2net, rembg2=bria-rmbg, rembg3=isnet-general-use',
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
  const note = (p, m) => _sendOpenProgress(event, p, m);
  try {
    note(10, 'reading');
    const data = await fs.promises.readFile(filePath);
    note(35, 'decoding');
    const decoded = await DicomDecoder.decode(data);
    if (decoded.error) return { error: decoded.error, meta: decoded.meta };

    note(70, 'converting');
    const sharp = require('sharp');
    const pngBuf = await sharp(Buffer.from(decoded.rgba.buffer, decoded.rgba.byteOffset, decoded.rgba.byteLength), {
      raw: { width: decoded.width, height: decoded.height, channels: 4 },
    }).png().toBuffer();
    note(92, 'displaying');
    const image = decoded.image;
    return {
      dataUrl: `data:image/png;base64,${pngBuf.toString('base64')}`,
      meta: image.meta,
      tags: image.tags,
      frames: image.frames,
      state: image.state,
    };
  } catch (err) {
    return { error: err.message };
  }
});

/* Print: the renderer's preview dialog decides paper / orientation / margins / image size;
 * the picture is rendered at exactly that size in a hidden window and sent straight to the
 * chosen printer (silent) — no second system dialog. */
const PRINT_PAGE_SIZES = new Set(['A3', 'A4', 'A5', 'Legal', 'Letter', 'Tabloid']);

function _printPageHtml(dataUrl, title, { marginMm = 10, imgWmm, imgHmm, color } = {}) {
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const imgCss = (imgWmm > 0 && imgHmm > 0)
    ? `width: ${imgWmm}mm; height: ${imgHmm}mm;`
    : 'max-width: 100%; max-height: 100vh; object-fit: contain;';
  const filter = color === 'gray' ? 'filter: grayscale(1);' : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { margin: ${marginMm}mm; }
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #fff; }
  body { display: flex; align-items: center; justify-content: center; overflow: hidden; }
  img { ${imgCss} ${filter} }
</style></head><body><img src="${dataUrl}" alt=""></body></html>`;
}

ipcMain.handle('get-printers', async () => {
  try {
    const wc = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null;
    if (!wc) return [];
    const list = await wc.getPrintersAsync();
    return list.map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      description: p.description || '',
      isDefault: !!p.isDefault,
    }));
  } catch (err) {
    console.warn('getPrinters failed:', err.message);
    return [];
  }
});

ipcMain.handle('print-image', async (event, opts = {}) => {
  const { dataUrl, title, deviceName, copies, landscape, pageSize, marginMm, imgWmm, imgHmm, color } = opts;
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return { error: 'Nothing to print' };
  let win = null;
  try {
    win = new BrowserWindow({
      show: false,
      parent: mainWindow || undefined,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    const mm = Number.isFinite(marginMm) ? Math.max(0, marginMm) : 10;
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(_printPageHtml(dataUrl, title, { marginMm: mm, imgWmm, imgHmm, color })));
    await win.webContents.executeJavaScript(
      'new Promise((r) => { const i = document.querySelector("img"); if (!i || i.complete) r(); else { i.onload = () => r(); i.onerror = () => r(); } })'
    );
    const px = (v) => Math.round(v * 96 / 25.4);
    const printOpts = {
      silent: !!deviceName,            // a printer was chosen in the preview → print directly
      printBackground: false,
      color: color !== 'gray',
      landscape: !!landscape,
      copies: Math.min(99, Math.max(1, parseInt(copies, 10) || 1)),
      margins: { marginType: 'custom', top: px(mm), bottom: px(mm), left: px(mm), right: px(mm) },
    };
    if (deviceName) printOpts.deviceName = deviceName;
    if (PRINT_PAGE_SIZES.has(pageSize)) printOpts.pageSize = pageSize;
    return await new Promise((resolve) => {
      win.webContents.print(printOpts, (success, reason) => {
        try { win.destroy(); } catch {}
        win = null;
        resolve(success ? { success: true } : { error: reason || 'cancelled' });
      });
    });
  } catch (err) {
    try { win && win.destroy(); } catch {}
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

ipcMain.handle('open-file-dialog', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('menu-action', 'open-file');
  }
});
ipcMain.handle('get-launch-file', () => {
  const filePath = pendingOpenPath;
  pendingOpenPath = null;
  return filePath;
});
ipcMain.handle('get-app-info', () => {
  let version = app.getVersion() || '0.0.0';
  let buildNumber = '';
  try {
    const pkg = require('./package.json');
    if (pkg.version) version = String(pkg.version);
    if (pkg.buildNumber != null && pkg.buildNumber !== '') {
      buildNumber = String(pkg.buildNumber);
    }
  } catch {}
  if (!buildNumber) {
    try {
      const v = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'version.json'), 'utf8'));
      if (v.buildNumber != null) buildNumber = String(v.buildNumber);
      if (v.version) version = String(v.version);
    } catch {}
  }
  return {
    version,
    buildNumber,
    name: app.getName() || 'Image Viewer',
    isPackaged: !!app.isPackaged,
  };
});

/* ── Default image-viewer file associations (per-user, Windows) ── */
const IMAGE_ASSOC = [
  { ext: 'jpg',  progId: 'ImageViewer.jpeg', desc: 'JPEG Image' },
  { ext: 'jpeg', progId: 'ImageViewer.jpeg', desc: 'JPEG Image' },
  { ext: 'png',  progId: 'ImageViewer.png',  desc: 'PNG Image' },
  { ext: 'gif',  progId: 'ImageViewer.gif',  desc: 'GIF Image' },
  { ext: 'bmp',  progId: 'ImageViewer.bmp',  desc: 'BMP Image' },
  { ext: 'webp', progId: 'ImageViewer.webp', desc: 'WebP Image' },
  { ext: 'avif', progId: 'ImageViewer.avif', desc: 'AVIF Image' },
  { ext: 'svg',  progId: 'ImageViewer.svg',  desc: 'SVG Image' },
  { ext: 'ico',  progId: 'ImageViewer.ico',  desc: 'Windows Icon' },
  { ext: 'tif',  progId: 'ImageViewer.tiff', desc: 'TIFF Image' },
  { ext: 'tiff', progId: 'ImageViewer.tiff', desc: 'TIFF Image' },
  { ext: 'heic', progId: 'ImageViewer.heic', desc: 'HEIC Image' },
  { ext: 'heif', progId: 'ImageViewer.heic', desc: 'HEIC Image' },
  { ext: 'hif',  progId: 'ImageViewer.heic', desc: 'HEIC Image' },
  { ext: 'dcm',  progId: 'ImageViewer.dcm',  desc: 'DICOM Image' },
  { ext: 'dicom',progId: 'ImageViewer.dcm',  desc: 'DICOM Image' },
];

function _regExec(args) {
  const { execFile } = require('child_process');
  return new Promise((resolve) => {
    execFile('reg.exe', args, { windowsHide: true, timeout: 8000 }, (err, stdout) => {
      resolve({ ok: !err, stdout: String(stdout || '') });
    });
  });
}

function _parseRegSz(stdout) {
  const m = String(stdout || '').match(/REG_SZ\s+(.+)\s*$/m);
  return m ? m[1].trim() : '';
}

function _isOurProgId(progId) {
  return /^ImageViewer\./i.test(String(progId || ''));
}

function _assocLaunch() {
  const exe = process.execPath;
  const iconFile = fs.existsSync(path.join(__dirname, 'src', 'assets', 'icon.ico'))
    ? path.join(__dirname, 'src', 'assets', 'icon.ico')
    : exe;
  const cmd = app.isPackaged
    ? `"${exe}" "%1"`
    : `"${exe}" "${path.join(__dirname, 'main.js')}" "%1"`;
  return { exe, icon: `${iconFile},0`, cmd };
}

async function _queryProgId(ext) {
  const userChoice = await _regExec([
    'query',
    `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.${ext}\\UserChoice`,
    '/v', 'ProgId',
  ]);
  const chosen = _parseRegSz(userChoice.stdout);
  if (chosen) return chosen;
  const hkcu = await _regExec(['query', `HKCU\\Software\\Classes\\.${ext}`, '/ve']);
  const a = _parseRegSz(hkcu.stdout);
  if (a) return a;
  const hkcr = await _regExec(['query', `HKCR\\.${ext}`, '/ve']);
  return _parseRegSz(hkcr.stdout);
}

async function _getFileAssocStatus() {
  if (process.platform !== 'win32') {
    return {
      platform: process.platform,
      supported: false,
      items: IMAGE_ASSOC.map((a) => ({ ext: a.ext, isDefault: false })),
    };
  }
  const items = [];
  for (const a of IMAGE_ASSOC) {
    const progId = await _queryProgId(a.ext);
    items.push({ ext: a.ext, progId, isDefault: _isOurProgId(progId) });
  }
  return {
    platform: 'win32',
    supported: true,
    items,
    defaultCount: items.filter((i) => i.isDefault).length,
    total: items.length,
  };
}

async function _regAdd(key, valueName, data) {
  const args = ['add', key, '/f', '/t', 'REG_SZ'];
  if (valueName == null || valueName === '') args.push('/ve');
  else args.push('/v', String(valueName));
  args.push('/d', String(data));
  return _regExec(args);
}

async function _setDefaultImageViewer() {
  if (process.platform !== 'win32') {
    return { ok: false, unsupported: true, platform: process.platform };
  }
  const { icon, cmd } = _assocLaunch();
  const capRoot = 'HKCU\\Software\\com.shkwon.imageviewer\\Capabilities';
  await _regAdd(`${capRoot}`, 'ApplicationName', 'Image Viewer');
  await _regAdd(`${capRoot}`, 'ApplicationDescription', 'Image Viewer');
  await _regAdd(`${capRoot}`, 'ApplicationIcon', icon);
  await _regAdd('HKCU\\Software\\RegisteredApplications', 'Image Viewer', 'Software\\com.shkwon.imageviewer\\Capabilities');

  const written = new Set();
  for (const a of IMAGE_ASSOC) {
    const progKey = `HKCU\\Software\\Classes\\${a.progId}`;
    if (!written.has(a.progId)) {
      written.add(a.progId);
      await _regAdd(progKey, '', a.desc);
      await _regAdd(`${progKey}\\DefaultIcon`, '', icon);
      await _regAdd(`${progKey}\\shell\\open\\command`, '', cmd);
    }
    await _regAdd(`HKCU\\Software\\Classes\\.${a.ext}`, '', a.progId);
    await _regAdd(`HKCU\\Software\\Classes\\.${a.ext}\\OpenWithProgids`, a.progId, '');
    await _regAdd(`${capRoot}\\FileAssociations`, `.${a.ext}`, a.progId);
  }

  try {
    const { execFile } = require('child_process');
    execFile('ie4uinit.exe', ['-show'], { windowsHide: true }, () => {});
  } catch {}
  const status = await _getFileAssocStatus();
  return { ok: true, status };
}

async function _openDefaultAppsSettings() {
  if (process.platform === 'win32') {
    try {
      await shell.openExternal('ms-settings:defaultapps');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  if (process.platform === 'darwin') {
    try {
      await shell.openExternal('x-apple.systempreferences:com.apple.settings.Storage');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  return { ok: false, unsupported: true, platform: process.platform };
}

ipcMain.handle('get-file-assoc-status', () => _getFileAssocStatus());
ipcMain.handle('set-default-image-viewer', () => _setDefaultImageViewer());
ipcMain.handle('open-default-apps-settings', () => _openDefaultAppsSettings());
ipcMain.handle('open-folder-dialog', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('menu-action', 'open-folder');
  }
});
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

/* ── Detached context-menu window ──
 * A transparent, frameless, non-focusable window that covers the work area of the display
 * under the cursor; src/popup.html draws the menu (same module as the in-page menu) so it
 * can extend beyond the app window. Mouse events outside the menu rows pass through. */
let popupWindow = null;
let popupReady = null;
let popupSeq = null;   // sequence number of the menu on screen (events of older menus are stale)

function _ensurePopupWindow() {
  if (popupWindow && !popupWindow.isDestroyed()) return popupReady;
  popupWindow = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    parent: mainWindow || undefined,
    backgroundColor: '#00000000',
    title: 'Menu',
    webPreferences: {
      preload: path.join(__dirname, 'popupPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  popupWindow.setMenuBarVisibility(false);
  popupWindow.on('closed', () => { popupWindow = null; popupReady = null; });
  popupReady = new Promise((resolve) => {
    popupWindow.webContents.once('did-finish-load', () => resolve());
    popupWindow.loadFile(path.join(__dirname, 'src', 'popup.html')).catch((err) => { console.error('popup menu page:', err.message); resolve(); });
  });
  return popupReady;
}

function _hidePopupWindow() {
  if (!popupWindow || popupWindow.isDestroyed()) return;
  try { popupWindow.webContents.send('popup-hide'); } catch { /* ignore */ }
  if (popupWindow.isVisible()) popupWindow.hide();
}

function _destroyPopupWindow() {
  if (popupWindow && !popupWindow.isDestroyed()) { try { popupWindow.destroy(); } catch { /* ignore */ } }
  popupWindow = null;
  popupReady = null;
}

ipcMain.handle('popup-menu', async (event, payload = {}) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  await _ensurePopupWindow();
  if (!popupWindow || popupWindow.isDestroyed()) return false;
  const cb = mainWindow.getContentBounds();
  const sx = cb.x + Math.round(Number(payload.x) || 0);
  const sy = cb.y + Math.round(Number(payload.y) || 0);
  const wa = screen.getDisplayNearestPoint({ x: sx, y: sy }).workArea;
  popupSeq = payload.seq;
  popupWindow.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height });
  popupWindow.setIgnoreMouseEvents(true, { forward: true });
  popupWindow.webContents.send('popup-show', { ...payload, x: sx - wa.x, y: sy - wa.y });
  if (!popupWindow.isVisible()) popupWindow.showInactive();
  return true;
});

ipcMain.handle('popup-menu-hide', () => { _hidePopupWindow(); });

ipcMain.handle('popup-menu-refresh', (event, payload = {}) => {
  if (popupWindow && !popupWindow.isDestroyed() && popupWindow.isVisible()) popupWindow.webContents.send('popup-refresh', payload);
});

ipcMain.on('popup-event', (event, ev) => {
  if (!ev) return;
  const stale = ev.seq !== undefined && popupSeq !== null && ev.seq !== popupSeq;
  if (ev.type === 'closed' && !stale && popupWindow && !popupWindow.isDestroyed() && popupWindow.isVisible()) popupWindow.hide();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('popup-menu-event', ev);
});

ipcMain.on('popup-ignore-mouse', (event, ignore) => {
  if (popupWindow && !popupWindow.isDestroyed()) popupWindow.setIgnoreMouseEvents(!!ignore, { forward: true });
});

ipcMain.handle('update-menu', async (event, { lang, translations, theme }) => {
  if (lang) currentLang = lang;
  if (theme) currentTheme = Themes.normalize(theme);
  if (process.platform === 'darwin') buildMenu(translations || {});
});

ipcMain.handle('window-set-min-size', (_event, width, height) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const w = Math.max(800, Math.round(Number(width) || 0));
  const h = Math.max(500, Math.round(Number(height) || 0));
  const [cw, ch] = mainWindow.getMinimumSize();
  if (cw === w && ch === h) return;
  const bounds = mainWindow.getBounds();
  const wasMax = _isWindowMaximized();
  mainWindow.setMinimumSize(w, h);
  if (wasMax) return;
  // setMinimumSize can nudge the window on Windows; keep the user's size
  if (bounds.width >= w && bounds.height >= h) {
    const after = mainWindow.getBounds();
    if (after.width !== bounds.width || after.height !== bounds.height
        || after.x !== bounds.x || after.y !== bounds.y) {
      mainWindow.setBounds(bounds);
    }
  }
});
ipcMain.handle('window-get-bounds', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const b = mainWindow.getBounds();
  return { x: b.x, y: b.y, width: b.width, height: b.height, maximized: _isWindowMaximized() };
});
ipcMain.handle('window-apply-size', (_event, opts = {}) => {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const minW = Math.max(800, Math.round(Number(opts.minWidth || opts.width) || 0));
  const minH = Math.max(500, Math.round(Number(opts.minHeight || opts.height) || 0));
  const w = Math.max(minW, Math.round(Number(opts.width) || minW));
  const h = Math.max(minH, Math.round(Number(opts.height) || minH));
  mainWindow.setMinimumSize(minW, minH);
  if (_isWindowMaximized()) return { ...mainWindow.getBounds(), maximized: true };
  const b = mainWindow.getBounds();
  mainWindow.setBounds({ x: b.x, y: b.y, width: w, height: h });
  return { ...mainWindow.getBounds(), maximized: false };
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
