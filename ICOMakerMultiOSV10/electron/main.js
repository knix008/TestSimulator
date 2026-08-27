const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const isDev = !app.isPackaged && process.env.ELECTRON_DEV === '1';

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'svg', 'tiff', 'tif', 'ico', 'avif', 'heic', 'heif', 'dcm'];

app.commandLine.appendSwitch('disable-features', 'Autofill');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    icon: path.join(__dirname, '..', 'build', 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    backgroundColor: '#1e1e2a',
    frame: false,            // custom title bar / window controls live in the toolbar
    autoHideMenuBar: true,
    show: false,
    title: 'ICOMaker',
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  win.once('ready-to-show', () => win.show());

  // Keep the toolbar's maximize/restore button in sync.
  const sendMax = () => { if (!win.isDestroyed()) win.webContents.send('win:maximized', win.isMaximized()); };
  win.on('maximize', sendMax);
  win.on('unmaximize', sendMax);
  return win;
}

// ── Single instance ──────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // A second instance: tell the user and quit.
  app.whenReady().then(() => {
    try {
      dialog.showMessageBoxSync({
        type: 'info',
        title: 'ICOMaker',
        message: 'ICOMaker가 이미 실행 중입니다.\nICOMaker is already running.',
        buttons: ['OK'],
      });
    } catch { /* ignore */ }
    app.quit();
  });
} else {
  // Focus the existing window if another instance is launched.
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

// ── App info ──────────────────────────────────────────────
function readBuildInfo() {
  const candidates = [
    path.join(__dirname, '..', 'dist', 'build-info.json'),
    path.join(__dirname, '..', 'src', 'build-info.json'),
    path.join(process.resourcesPath || '', 'build-info.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch { /* ignore */ }
  }
  return {};
}

ipcMain.handle('app:getInfo', () => ({
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  v8: process.versions.v8,
  ...readBuildInfo(),
}));

// ── Filesystem: directory explorer ────────────────────────
function mimeForExt(ext) {
  switch (ext) {
    case 'svg': return 'image/svg+xml';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'tif':
    case 'tiff': return 'image/tiff';
    case 'ico': return 'image/x-icon';
    default: return `image/${ext}`;
  }
}

ipcMain.handle('fs:home', () => os.homedir());

ipcMain.handle('fs:drives', () => {
  if (process.platform !== 'win32') return ['/'];
  const drives = [];
  for (let c = 65; c <= 90; c++) {
    const root = String.fromCharCode(c) + ':\\';
    try {
      if (fs.existsSync(root)) drives.push(root);
    } catch { /* ignore */ }
  }
  return drives.length ? drives : ['C:\\'];
});

ipcMain.handle('fs:listDir', (_e, dirPath) => {
  const target = dirPath && dirPath.length ? dirPath : os.homedir();
  const entries = [];
  let names = [];
  try {
    names = fs.readdirSync(target, { withFileTypes: true });
  } catch (err) {
    throw new Error(`Cannot read directory: ${target}\n${err.message}`);
  }
  for (const d of names) {
    let isDir = d.isDirectory();
    const full = path.join(target, d.name);
    // Resolve symlinks best-effort
    if (d.isSymbolicLink()) {
      try { isDir = fs.statSync(full).isDirectory(); } catch { continue; }
    }
    if (d.name.startsWith('.')) continue; // hide dotfiles
    const ext = path.extname(d.name).toLowerCase().slice(1);
    const isImage = !isDir && IMAGE_EXTS.includes(ext);
    if (!isDir && !isImage) continue; // only show folders + images
    entries.push({ name: d.name, path: full, isDir, isImage, ext });
  }
  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const parent = path.dirname(target);
  return { path: target, parent: parent === target ? null : parent, entries };
});

ipcMain.handle('fs:readImage', (_e, filePath) => {
  try {
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().slice(1);
    return {
      name: path.basename(filePath),
      path: filePath,
      dataUrl: `data:${mimeForExt(ext)};base64,${buf.toString('base64')}`,
    };
  } catch (err) {
    throw new Error(`Cannot read image: ${filePath}\n${err.message}`);
  }
});

// ── Dialogs ───────────────────────────────────────────────
ipcMain.handle('dialog:openImages', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Open Image',
    filters: [
      { name: 'Images', extensions: IMAGE_EXTS },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile', 'multiSelections'],
  });
  if (canceled || !filePaths.length) return [];
  return filePaths.map((fp) => {
    const buf = fs.readFileSync(fp);
    const ext = path.extname(fp).toLowerCase().slice(1);
    return {
      name: path.basename(fp),
      path: fp,
      dataUrl: `data:${mimeForExt(ext)};base64,${buf.toString('base64')}`,
    };
  });
});

// Save a single binary file (base64) with a save dialog.
ipcMain.handle('dialog:saveBinary', async (_e, { defaultName, base64, filters }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save',
    defaultPath: defaultName || 'icon.ico',
    filters: filters || [{ name: 'Icon', extensions: ['ico'] }],
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return filePath;
});

// Save multiple files (icon set) into a chosen folder.
ipcMain.handle('dialog:saveFiles', async (_e, files) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Select Output Folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled || !filePaths.length) return null;
  const dir = filePaths[0];
  for (const f of files) {
    fs.writeFileSync(path.join(dir, f.name), Buffer.from(f.base64, 'base64'));
  }
  return dir;
});

ipcMain.handle('shell:showItem', (_e, p) => {
  try { shell.showItemInFolder(p); return true; } catch { return false; }
});

// ── Window controls (frameless) ───────────────────────────
ipcMain.handle('win:minimize', (e) => { BrowserWindow.fromWebContents(e.sender)?.minimize(); });
ipcMain.handle('win:toggleMaximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return false;
  if (w.isMaximized()) w.unmaximize(); else w.maximize();
  return w.isMaximized();
});
ipcMain.handle('win:close', (e) => { BrowserWindow.fromWebContents(e.sender)?.close(); });
ipcMain.handle('win:isMaximized', (e) => !!BrowserWindow.fromWebContents(e.sender)?.isMaximized());
