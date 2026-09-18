/**
 * DCM Viewer — Electron main process.
 *
 * Owns the window, the OS dialogs, the file system and the settings file.
 * Everything the renderer needs goes through the IPC handlers below (see preload.js).
 * DICOM decoding and image encoding happen in the renderer (canvas available there);
 * the main process only moves bytes.
 */
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');

const APP_ID = 'com.shkwon.dcmviewer';
const PKG = require('./package.json');
const ASSETS = path.join(__dirname, 'src', 'assets');

const DICOM_EXTS = new Set(['dcm', 'dicm', 'dicom', 'dic']);
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'ico', 'svg', 'avif', 'heic', 'heif', 'hif', 'jp2', 'j2k', 'jpc', 'jpx', 'j2c']);

let mainWindow = null;
let pendingOpenPath = null;
let settings = {};

if (process.platform === 'win32') app.setAppUserModelId(app.isPackaged ? APP_ID : `${APP_ID}.dev`);

/* ── Settings (userData/dcmviewer-settings.json) ── */
function settingsPath() { return path.join(app.getPath('userData'), 'dcmviewer-settings.json'); }
function loadSettings() {
  try { settings = JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) || {}; } catch { settings = {}; }
}
function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) { console.warn('[settings]', err.message); }
}

/* ── Launch file (argv / Finder / second instance) ── */
function isOpenableFile(p) {
  try {
    if (!p || typeof p !== 'string' || p.startsWith('-')) return false;
    const resolved = path.resolve(p);
    if (resolved === path.resolve(__dirname)) return false;
    const st = fs.statSync(resolved);
    if (st.isDirectory()) return true;   // a folder is fine too: it opens in the tree
    const ext = path.extname(resolved).slice(1).toLowerCase();
    return DICOM_EXTS.has(ext) || IMAGE_EXTS.has(ext) || ext === '' || st.size > 132;
  } catch { return false; }
}
function fileFromArgv(argv) {
  for (const a of (argv || []).slice(1)) {
    if (a === '.' || /electron(\.exe)?$/i.test(a)) continue;
    if (isOpenableFile(a)) return path.resolve(a);
  }
  return null;
}
function queueOpen(p) {
  if (!p) return;
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('open-path', p);
    pendingOpenPath = null;
  } else {
    pendingOpenPath = p;
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    queueOpen(fileFromArgv(argv));
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
pendingOpenPath = fileFromArgv(process.argv);
app.on('open-file', (e, p) => { e.preventDefault(); queueOpen(p); });

/* ── Window ── */
function appIcon() {
  const p = process.platform === 'win32' ? path.join(ASSETS, 'icon.ico') : path.join(ASSETS, 'icon.png');
  try { return nativeImage.createFromPath(p); } catch { return undefined; }
}

function createWindow() {
  const b = settings.windowBounds || {};
  mainWindow = new BrowserWindow({
    width: b.width || 1400,
    height: b.height || 900,
    x: Number.isFinite(b.x) ? b.x : undefined,
    y: Number.isFinite(b.y) ? b.y : undefined,
    minWidth: 900,
    minHeight: 600,
    title: 'DCM Viewer',
    icon: appIcon(),
    backgroundColor: settings.theme === 'light' ? '#f3f4f6' : '#111318',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  if (b.maximized) mainWindow.maximize();
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingOpenPath) { mainWindow.webContents.send('open-path', pendingOpenPath); pendingOpenPath = null; }
  });
  const rememberBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const maximized = mainWindow.isMaximized();
    const nb = maximized ? (settings.windowBounds || {}) : mainWindow.getBounds();
    settings.windowBounds = { ...nb, maximized };
  };
  mainWindow.on('resize', rememberBounds);
  mainWindow.on('move', rememberBounds);
  mainWindow.on('close', () => { rememberBounds(); saveSettings(); });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

/* The renderer draws its own menu bar; macOS still needs an application menu for Cmd shortcuts. */
function installMenu() {
  if (process.platform !== 'darwin') { Menu.setApplicationMenu(null); return; }
  const send = (action) => () => mainWindow && mainWindow.webContents.send('menu-action', action);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'File', submenu: [
      { label: 'Open File…', accelerator: 'CmdOrCtrl+O', click: send('open-file') },
      { label: 'Open Folder…', accelerator: 'CmdOrCtrl+Shift+O', click: send('open-folder') },
      { type: 'separator' },
      { label: 'Export as PNG…', accelerator: 'CmdOrCtrl+E', click: send('export-png') },
      { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: send('print') },
    ] },
    { label: 'Edit', submenu: [{ role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [
      { label: 'Fit to Window', accelerator: 'CmdOrCtrl+0', click: send('fit') },
      { label: 'Actual Size', accelerator: 'CmdOrCtrl+1', click: send('actual') },
      { type: 'separator' },
      { role: 'togglefullscreen' }, { role: 'toggleDevTools' },
    ] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }] },
  ]));
}

app.whenReady().then(() => {
  loadSettings();
  installMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

/* ── Helpers ── */
const IMAGE_FILTERS = [
  { name: 'All supported', extensions: [...DICOM_EXTS, ...IMAGE_EXTS] },
  { name: 'DICOM', extensions: [...DICOM_EXTS] },
  { name: 'Images', extensions: [...IMAGE_EXTS] },
  { name: 'All files', extensions: ['*'] },
];

function defaultDir() {
  const d = settings.lastDir;
  if (d && fs.existsSync(d)) return d;
  const pics = app.getPath('pictures');
  return fs.existsSync(pics) ? pics : os.homedir();
}

function listDrives() {
  if (process.platform !== 'win32') return ['/'];
  const out = [];
  for (let c = 65; c <= 90; c++) {
    const d = `${String.fromCharCode(c)}:\\`;
    try { fs.readdirSync(d); out.push(d); } catch { /* not present */ }
  }
  return out;
}

async function uniqueDir(base) {
  let dir = base;
  for (let i = 2; fs.existsSync(dir); i++) dir = `${base}_${i}`;
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

/* ── IPC: app / settings ── */
ipcMain.handle('app-info', () => ({
  name: PKG.productName, version: PKG.version, author: PKG.author, description: PKG.description,
  electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node,
  platform: process.platform, arch: process.arch, packaged: app.isPackaged, userData: app.getPath('userData'),
}));
ipcMain.handle('settings-get', () => settings);
ipcMain.handle('settings-set', (_e, patch) => { Object.assign(settings, patch || {}); saveSettings(); return settings; });
ipcMain.handle('default-dir', () => defaultDir());
ipcMain.handle('home-dir', () => os.homedir());
ipcMain.handle('list-drives', () => listDrives());

/* ── IPC: paths ── */
ipcMain.handle('path-join', (_e, parts) => path.join(...parts));
ipcMain.handle('path-dirname', (_e, p) => path.dirname(p));
ipcMain.handle('path-basename', (_e, p) => path.basename(p));
ipcMain.handle('path-sep', () => path.sep);

/* ── IPC: file system ── */
ipcMain.handle('read-dir', async (_e, dir) => {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const ent of entries) {
    if (ent.name.startsWith('.') || ent.name === 'System Volume Information' || ent.name === '$RECYCLE.BIN') continue;
    const full = path.join(dir, ent.name);
    let st = null;
    try { st = await fsp.stat(full); } catch { continue; }
    const isDir = st.isDirectory();
    out.push({ name: ent.name, path: full, isDir, size: isDir ? 0 : st.size, mtime: st.mtimeMs });
  }
  out.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : a.isDir ? -1 : 1));
  return out;
});
ipcMain.handle('stat', async (_e, p) => {
  try { const st = await fsp.stat(p); return { exists: true, isDir: st.isDirectory(), size: st.size, mtime: st.mtimeMs }; } catch { return { exists: false }; }
});
ipcMain.handle('read-file', async (_e, p) => {
  const buf = await fsp.readFile(p);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});
ipcMain.handle('read-file-head', async (_e, p, n) => {
  const fh = await fsp.open(p, 'r');
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await fh.read(buf, 0, n, 0);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + bytesRead);
  } finally { await fh.close(); }
});
ipcMain.handle('write-file', async (_e, p, data) => {
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, Buffer.from(data));
  return p;
});
ipcMain.handle('mkdir', async (_e, p) => { await fsp.mkdir(p, { recursive: true }); return p; });
ipcMain.handle('unique-dir', async (_e, base) => uniqueDir(base));
ipcMain.handle('trash', async (_e, p) => { await shell.trashItem(p); return true; });
ipcMain.handle('copy-into', async (_e, sources, destDir, move) => {
  const results = [];
  for (const src of sources) {
    const name = path.basename(src);
    let dest = path.join(destDir, name);
    if (path.resolve(dest) === path.resolve(src)) {
      const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
      let i = 2;
      while (fs.existsSync(dest)) dest = path.join(destDir, `${stem} (${i++})${ext}`);
    }
    try {
      const st = await fsp.stat(src);
      if (move) await fsp.rename(src, dest);
      else if (st.isDirectory()) await fsp.cp(src, dest, { recursive: true });
      else await fsp.copyFile(src, dest);
      results.push({ src, dest, ok: true });
    } catch (err) { results.push({ src, dest, ok: false, error: err.message }); }
  }
  return results;
});
ipcMain.handle('show-in-folder', (_e, p) => { shell.showItemInFolder(p); });
ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));

/* ── IPC: dialogs ── */
ipcMain.handle('dialog-open-file', async (_e, opts = {}) => {
  const r = await dialog.showOpenDialog(mainWindow, {
    defaultPath: opts.defaultPath || defaultDir(), filters: IMAGE_FILTERS,
    properties: ['openFile', ...(opts.multiple ? ['multiSelections'] : [])],
  });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('dialog-open-folder', async (_e, opts = {}) => {
  const r = await dialog.showOpenDialog(mainWindow, { defaultPath: opts.defaultPath || defaultDir(), properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog-save', async (_e, opts = {}) => {
  const r = await dialog.showSaveDialog(mainWindow, { defaultPath: opts.defaultPath, filters: opts.filters || [{ name: 'All files', extensions: ['*'] }] });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('dialog-message', async (_e, opts = {}) => {
  const r = await dialog.showMessageBox(mainWindow, { type: opts.type || 'info', title: opts.title || 'DCM Viewer', message: opts.message || '', detail: opts.detail, buttons: opts.buttons || ['OK'], defaultId: 0, cancelId: opts.cancelId ?? -1, noLink: true });
  return r.response;
});

/* ── IPC: window / print / clipboard ── */
ipcMain.handle('window-min-size', (_e, w, hgt) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const [cw, ch] = mainWindow.getContentSize();
  const [ww, wh] = mainWindow.getSize();
  const frameW = ww - cw, frameH = wh - ch;   // min size is in window coordinates
  const minW = Math.round(w + frameW), minH = Math.round(hgt + frameH);
  mainWindow.setMinimumSize(minW, minH);
  if (ww < minW || wh < minH) mainWindow.setSize(Math.max(ww, minW), Math.max(wh, minH));
});
ipcMain.handle('window-fullscreen', () => { if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen()); });
ipcMain.handle('window-devtools', () => { if (mainWindow) mainWindow.webContents.toggleDevTools(); });
ipcMain.handle('print-html', async (_e, html, opts = {}) => {
  const win = new BrowserWindow({ show: false, parent: mainWindow || undefined, webPreferences: { sandbox: true } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 150));   // let the image decode before printing
  const printOpts = { silent: !!opts.silent, printBackground: true, landscape: !!opts.landscape, copies: opts.copies || 1, margins: { marginType: 'default' } };
  if (opts.paper) printOpts.pageSize = opts.paper;
  return new Promise((resolve) => {
    try {
      win.webContents.print(printOpts, (ok, reason) => { if (!win.isDestroyed()) win.close(); resolve({ ok, reason }); });
    } catch (err) { if (!win.isDestroyed()) win.close(); resolve({ ok: false, reason: err.message }); }
  });
});
ipcMain.handle('clipboard-write-image', (_e, dataUrl) => {
  const { clipboard } = require('electron');
  clipboard.writeImage(nativeImage.createFromDataURL(dataUrl));
  return true;
});
ipcMain.handle('clipboard-write-text', (_e, text) => { require('electron').clipboard.writeText(String(text)); return true; });

/* ── Popup windows (dialogs live in their own windows; children of the main window, so they close with it) ── */
const popups = new Map();   // kind → BrowserWindow
const popupInit = new Map(); // kind → { payload, theme, lang } waiting for 'popup-ready'

ipcMain.handle('popup-open', (_e, { kind, payload, theme, lang, width, height }) => {
  const existing = popups.get(kind);
  if (existing && !existing.isDestroyed()) {
    existing.webContents.send('popup-init', { payload, theme, lang });
    existing.focus();
    return true;
  }
  const win = new BrowserWindow({
    parent: mainWindow || undefined,
    width: width || 520, height: height || 400,
    resizable: kind === 'mpr', minimizable: false, maximizable: kind === 'mpr', fullscreenable: false,
    useContentSize: true, autoHideMenuBar: true, show: false,
    title: 'DCM Viewer', icon: appIcon(),
    backgroundColor: settings.theme && /light|paper|sky|mint|rose|solarized-light/.test(settings.theme) ? '#f3f4f6' : '#191c23',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, spellcheck: false },
  });
  win.setMenuBarVisibility(false);
  popups.set(kind, win);
  popupInit.set(kind, { payload, theme, lang });
  win.loadFile(path.join(__dirname, 'src', 'popup.html'), { query: { kind } });
  win.on('closed', () => { if (popups.get(kind) === win) popups.delete(kind); popupInit.delete(kind); if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('popup-event', { kind, event: 'closed' }); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  return true;
});
ipcMain.handle('popup-ready', (e, { kind }) => {
  const init = popupInit.get(kind);
  if (init) { e.sender.send('popup-init', init); popupInit.delete(kind); }
  const win = popups.get(kind);
  if (win && !win.isDestroyed()) win.show();
});
ipcMain.handle('popup-resize', (e, { width, height }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win || win.isDestroyed()) return;
  const w = Math.max(200, Math.round(width)), h = Math.max(120, Math.round(height));
  const wasVisible = win.isVisible();
  win.setContentSize(w, h);
  if (!wasVisible || !win._positioned) {
    win._positioned = true;
    if (mainWindow && !mainWindow.isDestroyed()) {
      const b = mainWindow.getBounds();
      const [ww, wh] = win.getSize();
      win.setPosition(Math.round(b.x + (b.width - ww) / 2), Math.round(b.y + (b.height - wh) / 2));
    } else win.center();
  }
  if (!wasVisible) win.show();
});
ipcMain.handle('popup-emit', (_e, msg) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('popup-event', msg); });
ipcMain.handle('popup-send', (_e, { kind, event, data }) => {
  if (kind) { const win = popups.get(kind); if (win && !win.isDestroyed()) win.webContents.send('popup-send', { event, data }); return; }
  for (const win of popups.values()) if (!win.isDestroyed()) win.webContents.send('popup-send', { event, data });
});
ipcMain.handle('popup-close', (_e, kind) => { const win = popups.get(kind); if (win && !win.isDestroyed()) win.close(); });

/* ── IPC: directory watch ── */
const watchers = new Map();
ipcMain.handle('watch-dir', (_e, dir) => {
  if (watchers.has(dir)) return true;
  try {
    let timer = null;
    const w = fs.watch(dir, { persistent: false }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('dir-changed', dir); }, 300);
    });
    w.on('error', () => { watchers.delete(dir); });
    watchers.set(dir, w);
    return true;
  } catch { return false; }
});
ipcMain.handle('unwatch-dir', (_e, dir) => { const w = watchers.get(dir); if (w) { w.close(); watchers.delete(dir); } return true; });
