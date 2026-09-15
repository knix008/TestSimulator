// My Editor — Electron main process.
//
//   • main window lifecycle (single instance, persisted bounds)
//   • hands the renderer the core API over IPC (see ./ipc.js)
//   • native bits the core cannot do on its own: open / save dialogs, reveal a
//     file in the OS file manager, open with the default app, the clipboard
//   • files passed on the command line (double-click in Explorer, `MyEditor
//     a.txt b.md`, a second instance) are forwarded to the open window
//   • smoke-test hook: --smoke-shot=<png> screenshots the window and quits
const { app, BrowserWindow, Menu, shell, clipboard, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const { registerIpc } = require('./ipc');
const { createApi } = require('../core/api');

const isDev = !app.isPackaged && process.env.ELECTRON_DEV === '1';
const DEV_URL = 'http://localhost:5189';
const PRODUCT = 'My Editor';

app.commandLine.appendSwitch('disable-features', 'Autofill');
// A separate profile for tests / parallel runs (settings + instance lock).
if (process.env.MED_USER_DATA) app.setPath('userData', process.env.MED_USER_DATA);

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : (process.env[`MED_${name.toUpperCase().replace(/-/g, '_')}`] || null);
}

// Plain arguments (no leading "-") that exist on disk are files to open.
function filesFromArgv(argv, cwd) {
  const out = [];
  for (const a of argv.slice(1)) {
    if (!a || a.startsWith('-') || a === '.') continue;
    const p = path.resolve(cwd || process.cwd(), a);
    try { if (fs.statSync(p).isFile()) out.push(p); } catch { /* not a file */ }
  }
  return out;
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
let pendingFiles = filesFromArgv(process.argv);   // opened once the renderer is ready
let rendererReady = false;

function iconPath() {
  const dir = path.join(__dirname, '..', 'build', 'icons');
  return path.join(dir, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
}

function sendOpenFiles(list) {
  if (!list.length) return;
  if (!mainWin || mainWin.isDestroyed() || !rendererReady) { pendingFiles.push(...list); return; }
  mainWin.webContents.send('files:open', list);
}

function createWindow() {
  const session = api.session.get();
  const saved = session.windowBounds || null;
  const win = new BrowserWindow({
    width: saved && saved.width ? Math.max(1200, saved.width) : 1200,
    height: saved && saved.height ? saved.height : 780,
    x: saved && Number.isFinite(saved.x) ? saved.x : undefined,
    y: saved && Number.isFinite(saved.y) ? saved.y : undefined,
    // Every menu, toolbar button and status-bar field stays visible at the
    // minimum size.
    minWidth: 1200,   // the toolbar (with the theme / language / settings / info controls) must fit on one line
    minHeight: 600,
    backgroundColor: session.themeBg || '#12161c',
    // No native title bar: the menu bar carries the window buttons and is the
    // drag region (see src/components/MenuBar.jsx).
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
  win.on('focus', () => { if (!win.isDestroyed()) win.webContents.send('win:focus'); });

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
  // The renderer decides whether the window may close (unsaved documents):
  // it answers 'win:close-reply' after asking the user.
  let closeApproved = false;
  win.on('close', (e) => {
    saveBounds();
    if (closeApproved || !rendererReady || argValue('smoke-shot')) return;
    e.preventDefault();
    win.webContents.send('win:close-request');
  });
  win.approveClose = () => { closeApproved = true; if (!win.isDestroyed()) win.close(); };
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
            if (result !== undefined) console.log('[smoke-script]', typeof result === 'string' ? result : JSON.stringify(result));
          }
          const img = await win.webContents.capturePage();
          fs.mkdirSync(path.dirname(shot), { recursive: true });
          fs.writeFileSync(shot, img.toPNG());
          console.log(`[smoke] wrote ${shot}`);
        } catch (err) {
          console.error('[smoke] capture failed:', err);
        }
        app.exit(0);
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

// Native dialogs used by the renderer through IPC.
const dialogs = {
  async open({ multi = true, defaultPath, images = false } = {}) {
    const r = await dialog.showOpenDialog(mainWin, {
      title: images ? 'Insert image' : 'Open',
      defaultPath: defaultPath || undefined,
      properties: ['openFile', ...(multi ? ['multiSelections'] : [])],
      filters: images ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'] }, { name: 'All files', extensions: ['*'] }] : [
        { name: 'Text files', extensions: ['txt', 'md', 'log', 'json', 'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'htm', 'xml', 'yaml', 'yml', 'ini', 'cfg', 'csv', 'py', 'c', 'cpp', 'h', 'hpp', 'java', 'cs', 'go', 'rs', 'sh', 'bat', 'ps1', 'sql', 'php', 'rb'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    return r.canceled ? [] : r.filePaths;
  },
  async openFolder({ defaultPath } = {}) {
    const r = await dialog.showOpenDialog(mainWin, { title: 'Open folder', defaultPath: defaultPath || undefined, properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  },
  async save({ defaultPath, name } = {}) {
    const r = await dialog.showSaveDialog(mainWin, {
      title: 'Save as',
      defaultPath: defaultPath || name || undefined,
      filters: [{ name: 'Text files', extensions: ['txt'] }, { name: 'All files', extensions: ['*'] }],
    });
    return r.canceled ? null : r.filePath;
  },
};

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv, cwd) => {
    if (!mainWin) return;
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
    sendOpenFiles(filesFromArgv(argv, cwd));
  });
  // macOS: double-click in Finder / "Open with".
  app.on('open-file', (e, p) => { e.preventDefault(); sendOpenFiles([p]); });

  app.whenReady().then(() => {
    api = createApi({
      name: 'electron',
      version: app.getVersion(),
      buildInfo: readBuildInfo(),
      configDir: app.getPath('userData'),
      openPath: (p) => shell.openPath(p),
      // A folder opens in the file manager; a file is shown selected in its folder.
      revealPath: async (p) => {
        let isDir = false;
        try { isDir = fs.statSync(p).isDirectory(); } catch { /* treat as file */ }
        if (isDir) { const r = await shell.openPath(p); if (r) throw new Error(r); } else shell.showItemInFolder(p);
      },
      clipboard: { readText: () => clipboard.readText(), writeText: (t) => clipboard.writeText(t) },
    });
    if (process.platform === 'darwin' && fs.existsSync(path.join(__dirname, '..', 'build', 'icons', 'icon.png'))) {
      app.dock.setIcon(nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icons', 'icon.png')));
    }
    buildMenu();
    registerIpc(api, () => mainWin, {
      dialogs,
      // The renderer reports it is ready to receive files (its session is
      // restored); anything queued so far is delivered then.
      onRendererReady: () => {
        rendererReady = true;
        const list = pendingFiles.splice(0);
        if (list.length) mainWin.webContents.send('files:open', list);
      },
    });
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
