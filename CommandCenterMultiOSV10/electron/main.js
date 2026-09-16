// Command Center — Electron main process.
//
//   • main window lifecycle (single instance, persisted bounds)
//   • hands the renderer the core API over IPC (see ./ipc.js)
//   • native bits the core cannot do on its own: open with the default app,
//     move to the OS trash, the system clipboard
//   • smoke-test hook: --smoke-shot=<png> screenshots the window and quits
const { app, BrowserWindow, Menu, shell, clipboard, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const { registerIpc } = require('./ipc');
const { createApi } = require('../core/api');
const fsops = require('../core/fsops');

const isDev = !app.isPackaged && process.env.ELECTRON_DEV === '1';
const DEV_URL = 'http://localhost:5185';
const PRODUCT = 'Command Center';

app.commandLine.appendSwitch('disable-features', 'Autofill');
// A separate profile for tests / parallel runs (settings + instance lock).
if (process.env.CC_USER_DATA && !app.isPackaged) app.setPath('userData', process.env.CC_USER_DATA);

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : (process.env[`CC_${name.toUpperCase().replace(/-/g, '_')}`] || null);
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
// Tool windows (viewer, editor, multi-rename, search, settings): independent
// top-level windows that close together with the main window.
const toolWins = new Set();
const TOOL_SIZES = { viewer: [960, 720], editor: [960, 720], multiRename: [920, 680], search: [760, 600], settings: [600, 620] };

function loadApp(win, query) {
  if (argValue('smoke-url')) { const u = new URL(argValue('smoke-url')); for (const [k, v] of Object.entries(query || {})) u.searchParams.set(k, v); win.loadURL(u.toString()); }
  else if (isDev) { const u = new URL(DEV_URL); for (const [k, v] of Object.entries(query || {})) u.searchParams.set(k, v); win.loadURL(u.toString()); }
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query: query || {} });
}

function openToolWindow({ kind, title, width, height }) {
  const session = api.session.get();
  const saved = (session.toolBounds || {})[kind] || null;
  const [dw, dh] = TOOL_SIZES[kind] || [800, 600];
  // A second window of the same kind opens slightly offset so it does not hide the first.
  const twins = Array.from(toolWins).filter((w) => w.ccKind === kind).length;
  const win = new BrowserWindow({
    width: saved && saved.width ? saved.width : width || dw,
    height: saved && saved.height ? saved.height : height || dh,
    x: saved && Number.isFinite(saved.x) ? saved.x + twins * 24 : undefined,
    y: saved && Number.isFinite(saved.y) ? saved.y + twins * 24 : undefined,
    minWidth: 480,
    minHeight: 360,
    backgroundColor: session.themeBg || '#12161c',
    autoHideMenuBar: true,
    show: false,
    title: title || PRODUCT,
    icon: fs.existsSync(iconPath()) ? iconPath() : undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, spellcheck: false },
  });
  win.ccKind = kind;
  toolWins.add(win);
  win.once('ready-to-show', () => win.show());
  // The page sets document.title; keep it (Electron would otherwise reset it on navigation).
  win.on('page-title-updated', (e) => e.preventDefault());
  win.webContents.on('page-title-updated', (_e, t) => { if (!win.isDestroyed()) win.setTitle(t); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.on('close', () => {
    if (win.isDestroyed() || win.isMinimized()) return;
    const b = win.getBounds();
    const all = { ...(api.session.get().toolBounds || {}), [kind]: b };
    api.session.save({ toolBounds: all });
  });
  win.on('closed', () => toolWins.delete(win));
  loadApp(win, { win: kind, id: String(win.id) });
  return win;
}

function iconPath() {
  const dir = path.join(__dirname, '..', 'build', 'icons');
  return path.join(dir, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
}

function createWindow() {
  const session = api.session.get();
  const saved = session.windowBounds || null;
  const MIN_W = 1000, MIN_H = 600;   // outer size; ≈ 984 px of content — see .app min-width in styles.css
  const win = new BrowserWindow({
    // Saved bounds from an older build may be smaller than today's minimum — Electron does not clamp them itself.
    width: Math.max(MIN_W, saved && saved.width ? saved.width : 1280),
    height: Math.max(MIN_H, saved && saved.height ? saved.height : 780),
    x: saved && Number.isFinite(saved.x) ? saved.x : undefined,
    y: saved && Number.isFinite(saved.y) ? saved.y : undefined,
    // Wide enough for the full icon toolbar (measured ~965 px) in either language, so
    // switching the language never changes the window and no button is ever clipped.
    minWidth: MIN_W,
    minHeight: MIN_H,
    backgroundColor: session.themeBg || '#12161c',
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

  win.once('ready-to-show', () => win.show());

  // Links and "open in browser" requests go to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  const saveBounds = () => {
    if (win.isDestroyed()) return;
    const b = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
    api.session.save({ windowBounds: { ...b, maximized: win.isMaximized() } });
  };
  win.on('close', saveBounds);
  // Tool windows are independent, but they belong to the app: closing the main window closes them all.
  win.on('closed', () => { mainWin = null; for (const w of Array.from(toolWins)) { if (!w.isDestroyed()) w.close(); } });

  loadApp(win, null);

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
            // --smoke-tool-script=<file>: run inside every tool window the scenario opened (drives them from within).
            if (argValue('smoke-tool-script')) {
              for (const w of Array.from(toolWins)) {
                if (w.isDestroyed()) continue;
                // The script may close its window (OK buttons do) — then the call never settles, so race it.
                const r = await Promise.race([w.webContents.executeJavaScript(fs.readFileSync(argValue('smoke-tool-script'), 'utf-8'), true), new Promise((res) => w.once('closed', () => res('(window closed)')))]);
                console.log(`[smoke-tool:${w.ccKind}]`, typeof r === 'string' ? r : JSON.stringify(r));
              }
              await new Promise((r) => setTimeout(r, Number(argValue('smoke-settle') || 800)));
            }
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
          // Tool windows the scenario opened are captured next to it (<shot>-<kind>.png) and reported.
          let n = 0;
          for (const w of Array.from(toolWins)) {
            if (w.isDestroyed()) continue;
            const file = shot.replace(/\.png$/i, '') + `-${w.ccKind}${n++ ? n : ''}.png`;
            fs.writeFileSync(file, (await w.webContents.capturePage()).toPNG());
            console.log(`[smoke] tool window ${w.ccKind} "${w.getTitle()}" ${JSON.stringify(w.getBounds())} → ${file}`);
          }
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
    api = createApi({
      name: 'electron',
      version: app.getVersion(),
      buildInfo: readBuildInfo(),
      configDir: app.getPath('userData'),
      // shell.openPath fails ("Failed to open path") for associations that
      // point at Store apps — Notepad on Windows 11, for one — so the shell
      // verb is tried through PowerShell / open / xdg-open as a fallback.
      openPath: async (p) => { const r = await shell.openPath(p); return r ? fsops.openWithDefaultApp(p) : ''; },
      trashPath: (p) => shell.trashItem(p),
      clipboard: { readText: () => clipboard.readText(), writeText: (t) => clipboard.writeText(t) },
    });
    if (process.platform === 'darwin' && fs.existsSync(path.join(__dirname, '..', 'build', 'icons', 'icon.png'))) {
      app.dock.setIcon(nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icons', 'icon.png')));
    }
    buildMenu();
    registerIpc(api, () => mainWin, {
      // Native folder picker (settings › terminal › start directory); the web version types the path.
      openFolder: async ({ defaultPath } = {}, owner) => {
        const r = await dialog.showOpenDialog(owner || mainWin, { defaultPath: defaultPath || undefined, properties: ['openDirectory'] });
        return r.canceled ? null : r.filePaths[0];
      },
      // Program picker (settings › file open › text editor application).
      openFile: async ({ defaultPath, filters } = {}, owner) => {
        const r = await dialog.showOpenDialog(owner || mainWin, { defaultPath: defaultPath || undefined, properties: ['openFile'], filters: filters || undefined });
        return r.canceled ? null : r.filePaths[0];
      },
    }, { openToolWindow, toolWins: () => toolWins });
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (api) api.jobs.cancelAll();
    app.quit();
  });
  // Every way out (closing the window, Cmd+Q, the smoke test) kills the dock's shells.
  app.on('will-quit', () => { if (api) api.shutdown(); });
}
