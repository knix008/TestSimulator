const { app, BrowserWindow, ipcMain, dialog, Menu, shell, clipboard, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const os = require('os');
const crypto = require('crypto');

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
    minWidth: 800,
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
  Menu.setApplicationMenu(menu);
}

async function handleOpenFile() {
  if (!mainWindow) return;
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: _dialogDefaultPath(),
    properties: ['openFile'],
    filters: [
      {
        name: 'Images',
        extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif'],
      },
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
      isDirectory: stats.isDirectory(),
    };
  } catch (err) {
    return { error: err.message };
  }
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
      svg: 'image/svg+xml', ico: 'image/x-icon',
      tiff: 'image/tiff', tif: 'image/tiff',
      heic: 'image/heic', heif: 'image/heif',
    };
    const mime = mimeMap[ext] || 'application/octet-stream';
    return `data:${mime};base64,${data.toString('base64')}`;
  } catch (err) {
    return { error: err.message };
  }
});

/**
 * Decode HEIC/HEIF to a displayable JPEG data URL.
 * Prefer heic-convert (libheif-js) — prebuilt sharp on Windows often lacks HEVC
 * and may produce wrong / non-photographic looking results if it "succeeds".
 */
async function _convertHeicToDataUrl(filePath) {
  const inputBuf = await fs.promises.readFile(filePath);
  const errors = [];

  // 1) heic-convert → high-quality JPEG (photographic)
  try {
    const heicConvert = require('heic-convert');
    const jpegBuf = Buffer.from(await heicConvert({
      buffer: inputBuf,
      format: 'JPEG',
      quality: 0.95,
    }));
    try {
      const sharp = require('sharp');
      const normalized = await sharp(jpegBuf)
        .rotate()
        .toColorspace('srgb')
        .jpeg({ quality: 95, mozjpeg: true })
        .toBuffer();
      return `data:image/jpeg;base64,${normalized.toString('base64')}`;
    } catch {
      return `data:image/jpeg;base64,${jpegBuf.toString('base64')}`;
    }
  } catch (e) {
    errors.push(`heic-convert: ${e.message}`);
  }

  // 2) heic-decode raw RGBA → sharp PNG
  try {
    const decode = require('heic-decode');
    const { width, height, data } = await decode({ buffer: inputBuf });
    const sharp = require('sharp');
    const pngBuf = await sharp(Buffer.from(data), {
      raw: { width, height, channels: 4 },
    })
      .toColorspace('srgb')
      .png()
      .toBuffer();
    return `data:image/png;base64,${pngBuf.toString('base64')}`;
  } catch (e) {
    errors.push(`heic-decode: ${e.message}`);
  }

  // 3) sharp last (only if libvips was built with HEVC)
  try {
    const sharp = require('sharp');
    const buf = await sharp(filePath)
      .rotate()
      .toColorspace('srgb')
      .jpeg({ quality: 95, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch (e) {
    errors.push(`sharp: ${e.message}`);
  }

  throw new Error(errors.join(' | '));
}

ipcMain.handle('convert-to-png', async (event, filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.heic' || ext === '.heif') {
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
    if (data.length < 132) throw new Error('File too small for DICOM');

    const sig = data.slice(128, 132).toString('ascii');
    if (sig !== 'DICM') throw new Error('No DICM signature at offset 128');

    let offset = 132;
    let rows = 0, cols = 0, bitsAllocated = 8, pixelRepresentation = 0;
    let samplesPerPixel = 1, photometric = 'MONOCHROME2';
    let pixelData = null;
    let explicit = true;

    while (offset < data.length - 8) {
      if (offset + 4 > data.length) break;
      const group   = data.readUInt16LE(offset);
      const element = data.readUInt16LE(offset + 2);
      offset += 4;

      let vr = '', length = 0;
      if (explicit) {
        const b0 = data[offset], b1 = data[offset + 1];
        if (b0 >= 65 && b0 <= 90 && b1 >= 65 && b1 <= 90) {
          vr = String.fromCharCode(b0, b1);
          offset += 2;
          if (['OB','OD','OF','OL','OW','SQ','UC','UN','UR','UT'].includes(vr)) {
            offset += 2; // reserved
            length = data.readUInt32LE(offset);
            offset += 4;
          } else {
            length = data.readUInt16LE(offset);
            offset += 2;
          }
        } else {
          explicit = false;
          length = data.readUInt32LE(offset);
          offset += 4;
        }
      } else {
        length = data.readUInt32LE(offset);
        offset += 4;
      }

      if (length === 0xFFFFFFFF) length = 0;
      const valueStart = offset;

      if (group === 0x0028) {
        if      (element === 0x0010) rows               = data.readUInt16LE(offset);
        else if (element === 0x0011) cols               = data.readUInt16LE(offset);
        else if (element === 0x0100) bitsAllocated      = data.readUInt16LE(offset);
        else if (element === 0x0103) pixelRepresentation = data.readUInt16LE(offset);
        else if (element === 0x0002) samplesPerPixel    = data.readUInt16LE(offset);
        else if (element === 0x0004) photometric        = data.slice(offset, offset + length).toString('ascii').replace(/\0/g,'').trim();
      } else if (group === 0x7FE0 && element === 0x0010) {
        if (length > 0 && offset + length <= data.length) {
          pixelData = data.slice(offset, offset + length);
        }
        break;
      }

      offset = valueStart + length;
      if (offset % 2 !== 0) offset++;
    }

    if (!pixelData || rows === 0 || cols === 0) {
      throw new Error(`DICOM parse failed: rows=${rows} cols=${cols} pixelData=${!!pixelData}`);
    }

    const pixelCount = rows * cols;
    const rgba = Buffer.alloc(pixelCount * 4);
    const isMono   = !photometric.includes('RGB');
    const isSigned = pixelRepresentation === 1;

    if (!isMono && bitsAllocated === 8 && samplesPerPixel === 3) {
      for (let i = 0; i < pixelCount; i++) {
        rgba[i*4]   = pixelData[i*3];
        rgba[i*4+1] = pixelData[i*3+1];
        rgba[i*4+2] = pixelData[i*3+2];
        rgba[i*4+3] = 255;
      }
    } else {
      let minVal = Infinity, maxVal = -Infinity;
      const rawVals = new Array(pixelCount);
      for (let i = 0; i < pixelCount; i++) {
        let val;
        if (bitsAllocated <= 8) {
          val = isSigned && pixelData[i] > 127 ? pixelData[i] - 256 : pixelData[i];
        } else {
          const raw = pixelData.readUInt16LE(i * 2);
          val = isSigned && raw > 32767 ? raw - 65536 : raw;
        }
        rawVals[i] = val;
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }
      const range  = maxVal - minVal || 1;
      const invert = photometric === 'MONOCHROME1';
      for (let i = 0; i < pixelCount; i++) {
        let gray = Math.round(((rawVals[i] - minVal) / range) * 255);
        if (invert) gray = 255 - gray;
        rgba[i*4] = rgba[i*4+1] = rgba[i*4+2] = gray;
        rgba[i*4+3] = 255;
      }
    }

    const sharp = require('sharp');
    const pngBuf = await sharp(rgba, {
      raw: { width: cols, height: rows, channels: 4 }
    }).png().toBuffer();
    return `data:image/png;base64,${pngBuf.toString('base64')}`;
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
  buildMenu(translations);
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
