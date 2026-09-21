// My FTP Server — Electron main process.
//
//   • main window lifecycle (single instance, persisted bounds, optional
//     "close hides to tray" so the server keeps serving)
//   • hands the renderer the core API over IPC (see ./ipc.js)
//   • native bits the core cannot do on its own: folder / file / save
//     dialogs, reveal in the file manager, the clipboard
//   • smoke-test hook: --smoke-shot=<png> screenshots the window and quits
const { app, BrowserWindow, Menu, Tray, shell, clipboard, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const { registerIpc } = require('./ipc');
const { MIN_WIDTH, MIN_HEIGHT } = require('./window-size');
const { createApi } = require('../core/api');

const isDev = !app.isPackaged && process.env.ELECTRON_DEV === '1';
const DEV_URL = 'http://localhost:5189';
const PRODUCT = 'My FTP Server';

app.commandLine.appendSwitch('disable-features', 'Autofill');
// A separate profile for tests / parallel runs (settings + instance lock).
if (process.env.MFS_USER_DATA && !app.isPackaged) app.setPath('userData', process.env.MFS_USER_DATA);

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : (process.env[`MFS_${name.toUpperCase().replace(/-/g, '_')}`] || null);
}

function readBuildInfo() {
  const candidates = [path.join(process.resourcesPath || '', 'build-info.json'), path.join(__dirname, '..', 'src', 'build-info.json')];
  for (const p of candidates) {
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { /* next */ }
  }
  return null;
}

let mainWin = null;
let api = null;
let tray = null;
let quitting = false;

function iconPath(ext) {
  return path.join(__dirname, '..', 'build', 'icons', ext ? `icon.${ext}` : (process.platform === 'win32' ? 'icon.ico' : 'icon.png'));
}

function createWindow() {
  const session = api.session.get();
  const saved = session.windowBounds || null;
  const win = new BrowserWindow({
    width: saved && saved.width ? saved.width : 1360,
    height: saved && saved.height ? saved.height : 800,
    x: saved && Number.isFinite(saved.x) ? saved.x : undefined,
    y: saved && Number.isFinite(saved.y) ? saved.y : undefined,
    // The floor; the renderer raises it to what its single-line strips need
    // (win:setMinSize) so the control bar never wraps.
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
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

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  const saveBounds = () => {
    if (win.isDestroyed()) return;
    const b = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
    api.session.save({ windowBounds: { ...b, maximized: win.isMaximized() } });
  };
  win.on('close', (e) => {
    saveBounds();
    // "Minimize to tray": the window hides, the servers keep running.
    if (!quitting && api.session.get().minimizeToTray && api.manager.running && !argValue('smoke-shot')) {
      e.preventDefault();
      win.hide();
      ensureTray();
    }
  });
  win.on('closed', () => { mainWin = null; });

  if (argValue('smoke-url')) win.loadURL(argValue('smoke-url'));
  else if (isDev) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  const shot = argValue('smoke-shot');
  if (shot) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const script = argValue('smoke-script');
          if (script) {
            const result = await win.webContents.executeJavaScript(fs.readFileSync(script, 'utf-8'), true);
            await new Promise((r) => setTimeout(r, Number(argValue('smoke-settle') || 800)));
            if (result !== undefined) console.log('[smoke-script]', typeof result === 'string' ? result : JSON.stringify(result));
          }
          const img = await win.webContents.capturePage();
          fs.mkdirSync(path.dirname(shot), { recursive: true });
          fs.writeFileSync(shot, img.toPNG());
          console.log(`[smoke] wrote ${shot}`);
        } catch (err) {
          console.error('[smoke] capture failed:', err);
        }
        quitting = true;
        app.quit();
      }, Number(argValue('smoke-delay') || 2500));
    });
  }
  return win;
}

function ensureTray() {
  if (tray) return;
  const img = fs.existsSync(iconPath('png')) ? nativeImage.createFromPath(iconPath('png')).resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip(PRODUCT);
  const show = () => { if (mainWin) { mainWin.show(); mainWin.focus(); } else createWindow(); };
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: PRODUCT, click: show },
    { type: 'separator' },
    { label: 'Quit / 종료', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', show);
}

function buildMenu() {
  if (process.platform !== 'darwin') { Menu.setApplicationMenu(null); return; }
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
    if (!mainWin) { createWindow(); return; }
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show();
    mainWin.focus();
  });

  app.whenReady().then(() => {
    const owner = () => mainWin && !mainWin.isDestroyed() ? mainWin : undefined;
    api = createApi({
      name: 'electron',
      version: app.getVersion(),
      buildInfo: readBuildInfo(),
      configDir: app.getPath('userData'),
      pickFolder: async ({ title, defaultPath }) => {
        const r = await dialog.showOpenDialog(owner(), { title, defaultPath: defaultPath || undefined, properties: ['openDirectory', 'createDirectory'] });
        return r.canceled ? null : r.filePaths[0];
      },
      pickFile: async ({ title, defaultPath, filters }) => {
        const r = await dialog.showOpenDialog(owner(), { title, defaultPath: defaultPath || undefined, filters: filters || undefined, properties: ['openFile'] });
        return r.canceled ? null : r.filePaths[0];
      },
      saveFile: async ({ title, defaultPath, filters }) => {
        const r = await dialog.showSaveDialog(owner(), { title, defaultPath: defaultPath || undefined, filters: filters || undefined });
        return r.canceled ? null : r.filePath;
      },
      openPath: (p) => shell.openPath(p),
      revealPath: async (p) => {
        let isDir = false;
        try { isDir = fs.statSync(p).isDirectory(); } catch { /* treat as file */ }
        if (isDir) { const r = await shell.openPath(p); if (r) throw new Error(r); } else shell.showItemInFolder(p);
      },
      clipboard: { readText: () => clipboard.readText(), writeText: (t) => clipboard.writeText(t) },
    });
    if (process.platform === 'darwin' && fs.existsSync(iconPath('png'))) app.dock.setIcon(nativeImage.createFromPath(iconPath('png')));
    buildMenu();
    registerIpc(api, () => mainWin);
    createWindow();
    if (api.session.get().minimizeToTray) ensureTray();

    // "Start the server when the app opens".
    if (api.session.get().autoStart && !argValue('smoke-shot')) {
      api.call('server.start', {}).catch(() => { /* the log shows why */ });
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else if (mainWin) mainWin.show();
    });
  });

  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => {
    if (tray && !quitting) return;   // hidden to the tray: keep serving
    if (api) api.shutdown().catch(() => {});
    app.quit();
  });
}
