// My FTP Client — Electron main process.
//
//   • main window lifecycle (single instance, persisted bounds)
//   • hands the renderer the core API over IPC (see ./ipc.js)
//   • native bits the core cannot do on its own: reveal a file in the OS file
//     manager ("탐색기에서 열기"), open with the default app, the clipboard
//   • smoke-test hook: --smoke-shot=<png> screenshots the window and quits
const { app, BrowserWindow, Menu, shell, clipboard, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const { registerIpc } = require('./ipc');
const { registerDialogHandlers, closeAllDialogWindows } = require('./dialogs');
const { createApi } = require('../core/api');

const isDev = !app.isPackaged && process.env.ELECTRON_DEV === '1';
const DEV_URL = 'http://localhost:5187';
const PRODUCT = 'My FTP Client';
// Tight enough to shrink, wide enough that every toolbar / title-bar
// control stays on one row (theme name may ellipsis; the connection
// badge is the only item that shrinks).
const MIN_WINDOW_WIDTH = 1200;
const MIN_WINDOW_HEIGHT = 720;

app.commandLine.appendSwitch('disable-features', 'Autofill');
// A separate profile for tests / parallel runs (settings + instance lock).
if (process.env.MFC_USER_DATA && !app.isPackaged) app.setPath('userData', process.env.MFC_USER_DATA);

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : (process.env[`MFC_${name.toUpperCase().replace(/-/g, '_')}`] || null);
}

function readBuildInfo() {
  const candidates = [
    path.join(process.resourcesPath || '', 'build-info.json'),
    path.join(__dirname, '..', 'src', 'build-info.json'),
  ];
  for (const p of candidates) {
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { /* next */ }
  }
  return null;
}

let mainWin = null;
let api = null;

function iconPath() {
  const dir = path.join(__dirname, '..', 'build', 'icons');
  return path.join(dir, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
}

function createWindow() {
  const session = api.session.get();
  const saved = session.windowBounds || null;
  const win = new BrowserWindow({
    width: Math.max(MIN_WINDOW_WIDTH, (saved && saved.width) || MIN_WINDOW_WIDTH),
    height: Math.max(MIN_WINDOW_HEIGHT, (saved && saved.height) || MIN_WINDOW_HEIGHT),
    x: saved && Number.isFinite(saved.x) ? saved.x : undefined,
    y: saved && Number.isFinite(saved.y) ? saved.y : undefined,
    // Every toolbar control (including min / max / close) stays visible.
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    backgroundColor: session.themeBg || '#12161c',
    // No native title bar: the toolbar carries the window buttons and is the
    // drag region (see src/components/Toolbar.jsx).
    frame: false,
    autoHideMenuBar: true,
    show: false,
    title: PRODUCT,
    icon: fs.existsSync(iconPath()) ? iconPath() : undefined,
    webPreferences: {
      // --smoke-url=<http://…> loads the web version instead (no preload, so
      // the UI runs exactly as it does in a browser) — used by the smoke test.
      preload: argValue('smoke-url') ? undefined : path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  mainWin = win;
  if (saved && saved.maximized) win.maximize();

  // Windows paints a white frame for a frameless window's first frame:
  // show it transparent and fade in once it is painted.
  win.once('ready-to-show', () => {
    win.setOpacity(0);
    win.show();
    setTimeout(() => { if (!win.isDestroyed()) win.setOpacity(1); }, 50);
  });
  const sendMax = () => { if (!win.isDestroyed()) win.webContents.send('win:maximized', win.isMaximized()); };
  win.on('maximize', sendMax);
  win.on('unmaximize', sendMax);

  // Links go to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  const saveBounds = () => {
    if (win.isDestroyed()) return;
    const b = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
    api.session.save({ windowBounds: { ...b, maximized: win.isMaximized() } });
  };
  win.on('close', () => { saveBounds(); closeAllDialogWindows(); });
  win.on('closed', () => { mainWin = null; });

  if (argValue('smoke-url')) win.loadURL(argValue('smoke-url'));
  else if (isDev) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  const shot = argValue('smoke-shot');
  if (shot) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          // Optional script run inside the page first (drives dialogs etc.).
          const script = argValue('smoke-script');
          if (script) {
            const result = await win.webContents.executeJavaScript(fs.readFileSync(script, 'utf-8'), true);
            await new Promise((r) => setTimeout(r, Number(argValue('smoke-settle') || 800)));
            if (argValue('smoke-probe')) {
              const probe = await win.webContents.executeJavaScript(fs.readFileSync(argValue('smoke-probe'), 'utf-8'), true);
              console.log('[smoke-probe]', typeof probe === 'string' ? probe : JSON.stringify(probe));
            }
            if (result !== undefined) console.log('[smoke-script]', typeof result === 'string' ? result : JSON.stringify(result));
          }
          const img = await win.webContents.capturePage();
          fs.mkdirSync(path.dirname(shot), { recursive: true });
          fs.writeFileSync(shot, img.toPNG());
          console.log(`[smoke] wrote ${shot}`);
        } catch (err) {
          console.error('[smoke] capture failed:', err);
        }
        app.quit();
      }, Number(argValue('smoke-delay') || 2500));
    });
  }
  return win;
}

function buildMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  // macOS needs an application menu for Cmd+Q / Cmd+C / Cmd+V to work.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'togglefullscreen' }, { role: 'toggleDevTools' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }] },
  ]));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWin) return;
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
  });

  app.whenReady().then(() => {
    const smokeMode = !!(argValue('smoke-shot') || argValue('smoke-url'));
    api = createApi({
      name: 'electron',
      version: app.getVersion(),
      buildInfo: readBuildInfo(),
      configDir: app.getPath('userData'),
      detachedDialogs: !smokeMode,
      openPath: (p) => shell.openPath(p),
      // A folder opens in the file manager; a file is shown selected in its folder.
      revealPath: async (p) => {
        let isDir = false;
        try { isDir = fs.statSync(p).isDirectory(); } catch { /* treat as file */ }
        if (isDir) { const r = await shell.openPath(p); if (r) throw new Error(r); } else shell.showItemInFolder(p);
      },
      clipboard: { readText: () => clipboard.readText(), writeText: (t) => clipboard.writeText(t) },
      pickFolder: async (start) => {
        const win = BrowserWindow.getFocusedWindow() || mainWin;
        const opts = {
          properties: ['openDirectory', 'createDirectory'],
          defaultPath: (start && fs.existsSync(start)) ? start : app.getPath('home'),
        };
        const r = win && !win.isDestroyed()
          ? await dialog.showOpenDialog(win, opts)
          : await dialog.showOpenDialog(opts);
        if (r.canceled || !r.filePaths || !r.filePaths[0]) return '';
        return r.filePaths[0];
      },
    });
    if (process.platform === 'darwin' && fs.existsSync(path.join(__dirname, '..', 'build', 'icons', 'icon.png'))) {
      app.dock.setIcon(nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icons', 'icon.png')));
    }
    buildMenu();
    registerIpc(api, () => mainWin);
    registerDialogHandlers(() => mainWin, () => api, isDev);
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (api) api.shutdown().catch(() => {});
    app.quit();
  });
}
