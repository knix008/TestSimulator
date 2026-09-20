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
const { spawnSync } = require('child_process');

const { registerIpc } = require('./ipc');
const { createApi } = require('../core/api');

const isDev = !app.isPackaged && process.env.ELECTRON_DEV === '1';
const DEV_URL = 'http://localhost:5189';
const PRODUCT = 'My Editor';
const APP_ID = 'com.shkwon.myeditor';
app.setName(PRODUCT);
app.setAppUserModelId(APP_ID);

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

function existingPath(p) {
  try { return p && fs.existsSync(p) ? p : null; } catch { return null; }
}
function iconCandidates() {
  const exeDir = path.dirname(process.execPath);
  const names = process.platform === 'win32'
    ? ['MyEditor.ico', 'icon.ico', 'icon.png']
    : ['icon.png', 'icon.ico'];
  const dirs = [
    exeDir,
    process.resourcesPath,
    path.join(exeDir, 'resources'),
    path.join(__dirname, '..', 'build', 'icons'),
    path.join(__dirname, '..', 'build'),
    path.join(__dirname, '..'),
  ].filter(Boolean);
  const out = [];
  for (const dir of dirs) for (const name of names) out.push(path.join(dir, name));
  return out;
}
function iconPath() {
  return iconCandidates().find((p) => existingPath(p)) || null;
}
function shortcutIconPath() {
  if (process.platform !== 'win32') return iconPath();
  const icos = iconCandidates().filter((p) => /\.ico$/i.test(p));
  return icos.find((p) => existingPath(p)) || iconPath();
}
function loadFromIcoOrPng(p) {
  if (!existingPath(p)) return null;
  try {
    const n = nativeImage.createFromPath(p);
    return n && !n.isEmpty() ? n : null;
  } catch { return null; }
}
function loadWindowIcon() {
  // Windows: the .ico is what Explorer, the taskbar, the EXE (rcedit) and the
  // Desktop / Start Menu shortcuts all display — same file as MyEditor.ico.
  if (process.platform === 'win32') {
    for (const p of iconCandidates().filter((c) => /\.ico$/i.test(c))) {
      const img = loadFromIcoOrPng(p);
      if (img) return img;
    }
  }
  const img = nativeImage.createEmpty();
  const dir = path.join(__dirname, '..', 'build', 'icons', 'png');
  let added = 0;
  for (const size of [16, 24, 32, 48, 256]) {
    const p = path.join(dir, `${size}x${size}.png`);
    if (!existingPath(p)) continue;
    try {
      img.addRepresentation({ width: size, height: size, scaleFactor: 1, buffer: fs.readFileSync(p) });
      added += 1;
    } catch { /* skip a missing size */ }
  }
  if (added && !img.isEmpty()) return img;
  return loadFromIcoOrPng(iconPath()) || undefined;
}
function applyWindowIcon(win) {
  if (!win || win.isDestroyed()) return;
  const img = loadWindowIcon();
  if (img) { try { win.setIcon(img); } catch { /* icon is best-effort */ } }
}
// Windows shows a blank taskbar button when the process AppUserModelId does
// not match any .lnk. Stamp the Desktop / Start Menu shortcuts (NSIS already
// does this; WScript.Shell.Save strips AppUserModelId, so the script sets the
// icon first, then the AUMI via the property store).
function stampShortcutAumi() {
  if (process.platform !== 'win32') return;
  const ps1 = app.isPackaged
    ? path.join(process.resourcesPath || '', 'set-lnk-aumi.ps1')
    : path.join(__dirname, '..', 'scripts', 'set-lnk-aumi.ps1');
  if (!existingPath(ps1)) return;
  const ico = shortcutIconPath();
  const marker = path.join(app.getPath('userData'), 'aumi-stamped');
  const token = `${APP_ID}\n${app.isPackaged ? process.execPath : 'dev'}\n${ico || ''}`;
  try { if (fs.readFileSync(marker, 'utf8') === token) return; } catch { /* stamp */ }
  try {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-AppId', APP_ID];
    if (app.isPackaged) args.push('-ExePath', process.execPath);
    if (ico) args.push('-IconPath', ico);
    spawnSync('powershell.exe', args, { windowsHide: true, timeout: 8000 });
    fs.writeFileSync(marker, token);
  } catch { /* best-effort */ }
}
function printIconPath() {
  const candidates = [
    path.join(__dirname, '..', 'assets', 'print-icon.png'),
    path.join(__dirname, '..', 'build', 'icons', 'print.png'),
    iconPath(),
  ];
  return candidates.find((p) => p && fs.existsSync(p));
}

function sendOpenFiles(list) {
  if (!list.length) return;
  if (!mainWin || mainWin.isDestroyed() || !rendererReady) { pendingFiles.push(...list); return; }
  mainWin.webContents.send('files:open', list);
}

// Settings / info / shortcuts as separate windows — children of the main
// window (always above it, minimized and closed with it) that can be moved
// anywhere on the screen. Each loads the same bundle with ?popup=<kind>
// (src/main.jsx renders PopupWindow instead of App). One window per kind.
// Fixed sizes (not resizable): large enough for their content, so nothing scrolls.
const POPUPS = {
  settings: { width: 1000, height: 1000 },
  about: { width: 560, height: 340 },   // title + info + 확인; the footer stays on screen
  shortcuts: { width: 1000, height: 780 },
  print: { width: 1100, height: 800, resizable: true },
};
const popups = new Map();
let pendingPrintJob = null;
function openPopup(kind, tab) {
  const spec = POPUPS[kind];
  if (!spec || !mainWin || mainWin.isDestroyed()) return null;
  const existing = popups.get(kind);
  if (existing && !existing.isDestroyed()) { existing.focus(); return existing; }
  const session = api.session.get();
  const pb = mainWin.getBounds();
  const resizable = !!spec.resizable;
  let icon = loadWindowIcon();
  if (kind === 'print') {
    const p = printIconPath();
    if (p) {
      try {
        const n = nativeImage.createFromPath(p);
        if (!n.isEmpty()) icon = n;
      } catch { /* keep app icon */ }
    }
  }
  const win = new BrowserWindow({
    width: spec.width, height: spec.height, resizable, maximizable: resizable, fullscreenable: false, useContentSize: true,
    x: Math.round(pb.x + (pb.width - spec.width) / 2), y: Math.round(pb.y + Math.max(40, (pb.height - spec.height) / 2)),
    parent: mainWin, modal: false, frame: false, autoHideMenuBar: true, show: false, title: kind === 'print' ? '인쇄' : PRODUCT,
    backgroundColor: session.themeBg || '#12161c',
    icon: icon || undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, spellcheck: false },
  });
  popups.set(kind, win);
  if (icon) { try { win.setIcon(icon); } catch { /* best-effort */ } }
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { if (popups.get(kind) === win) popups.delete(kind); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  const query = { popup: kind, ...(tab ? { tab } : {}) };
  if (isDev) win.loadURL(`${DEV_URL}?${new URLSearchParams(query)}`);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query });
  return win;
}
function openPrint(job) {
  pendingPrintJob = job && typeof job === 'object' ? job : null;
  const win = openPopup('print');
  if (!win || !pendingPrintJob) return win;
  const send = () => { if (!win.isDestroyed()) win.webContents.send('print:job', pendingPrintJob); };
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send);
  else send();
  return win;
}
function takePrintJob() { return pendingPrintJob; }
// Printing: Electron's Windows dialog has no page preview ("this app doesn't
// support print preview"). This window is the printer dialog — destination,
// copies, colour, layout — with the page on the left. Print sends the
// document from a hidden window so the native dialog never opens.
function listPrinters() {
  const src = (mainWin && !mainWin.isDestroyed() && mainWin.webContents) || webContentsWithPrinters();
  return src ? src.getPrintersAsync() : Promise.resolve([]);
}
function webContentsWithPrinters() {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed() && w.webContents) return w.webContents;
  }
  return null;
}
function runPrintJob(html, opts) {
  return new Promise((resolve) => {
    const hidden = new BrowserWindow({
      show: false,
      width: 900,
      height: 1200,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    const done = (success, failureReason) => {
      if (!hidden.isDestroyed()) hidden.destroy();
      resolve({ success: !!success, failureReason: failureReason || '' });
    };
    hidden.webContents.once('did-fail-load', () => done(false, 'load-failed'));
    hidden.webContents.once('did-finish-load', async () => {
      try {
        await hidden.webContents.executeJavaScript(`Promise.all([
          document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve(),
          Promise.all([...document.images].map((img) => img.complete ? 1 : new Promise((r) => { img.onload = img.onerror = () => r(1); })))
        ])`);
      } catch { /* print what is already there */ }
      const copies = Math.max(1, Math.min(99, Number(opts && opts.copies) || 1));
      hidden.webContents.print({
        silent: true,
        printBackground: true,
        deviceName: String((opts && opts.deviceName) || ''),
        copies,
        color: !(opts && opts.color === false),
        landscape: !!(opts && opts.landscape),
        pageSize: 'A4',
      }, (success, failureReason) => done(success, failureReason));
    });
    hidden.loadURL(`data:text/html;charset=utf-8;base64,${Buffer.from(String(html || ''), 'utf8').toString('base64')}`);
  });
}
function printRun(_event, opts) {
  const html = opts && opts.html;
  if (!html) return Promise.resolve({ success: false, failureReason: 'no-job' });
  return runPrintJob(html, opts);
}
function printHtml(html, _title, _labels, opts) {
  return runPrintJob(html, opts || {});
}
function closePopups() { for (const w of popups.values()) { if (!w.isDestroyed()) w.close(); } popups.clear(); }

// Default first-launch size. The real minimum width is the toolbar / menu
// bar (measured in the renderer); this floor is only a fallback before that.
const WIN_DEFAULT_WIDTH = 1200;
const WIN_DEFAULT_HEIGHT = 780;
const WIN_MIN_WIDTH = 640;
const WIN_MIN_HEIGHT = 600;

function createWindow() {
  const session = api.session.get();
  const saved = session.windowBounds || null;
  const win = new BrowserWindow({
    width: saved && saved.width ? Math.max(WIN_MIN_WIDTH, saved.width) : WIN_DEFAULT_WIDTH,
    height: saved && saved.height ? saved.height : WIN_DEFAULT_HEIGHT,
    x: saved && Number.isFinite(saved.x) ? saved.x : undefined,
    y: saved && Number.isFinite(saved.y) ? saved.y : undefined,
    minWidth: WIN_MIN_WIDTH,
    minHeight: WIN_MIN_HEIGHT,
    backgroundColor: session.themeBg || '#12161c',
    // No native title bar: the menu bar carries the window buttons and is the
    // drag region (see src/components/MenuBar.jsx).
    frame: false,
    autoHideMenuBar: true,
    show: false,
    title: PRODUCT,
    icon: loadWindowIcon() || undefined,
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
  applyWindowIcon(win);
  if (saved && saved.maximized) win.maximize();

  win.once('ready-to-show', () => {
    applyWindowIcon(win);
    win.show();
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
  win.on('closed', () => { mainWin = null; closePopups(); });

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
          const popupKind = argValue('smoke-popup');
          if (popupKind) {
            const pw = openPopup(popupKind);
            await new Promise((r) => pw.webContents.once('did-finish-load', r));
            await new Promise((r) => setTimeout(r, 1200));
            const pimg = await pw.webContents.capturePage();
            fs.mkdirSync(path.dirname(shot), { recursive: true });
            fs.writeFileSync(shot.replace(/\.png$/, `.${popupKind}.png`), pimg.toPNG());
            const pb2 = pw.getBounds(), mb = win.getBounds();
            console.log('[smoke-popup]', JSON.stringify({ kind: popupKind, bounds: pb2, parent: mb, title: pw.getTitle(), url: pw.webContents.getURL().replace(/^.*[\\/]/, '') }));
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
      filters: images ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'heic', 'heif', 'dcm', 'dicom'] }, { name: 'All files', extensions: ['*'] }] : [
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
      clipboard,
      writeImage: (dataUrl) => clipboard.writeImage(nativeImage.createFromDataURL(dataUrl)),
      // A folder opens in the file manager; a file is shown selected in its folder.
      revealPath: async (p) => {
        let isDir = false;
        try { isDir = fs.statSync(p).isDirectory(); } catch { /* treat as file */ }
        if (isDir) { const r = await shell.openPath(p); if (r) throw new Error(r); } else shell.showItemInFolder(p);
      },
      clipboard: { readText: () => clipboard.readText(), writeText: (t) => clipboard.writeText(t) },
    });
    if (process.platform === 'win32') {
      app.setAppUserModelId(APP_ID);
      stampShortcutAumi();
    }
    if (process.platform === 'darwin' && fs.existsSync(path.join(__dirname, '..', 'build', 'icons', 'icon.png'))) {
      app.dock.setIcon(nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icons', 'icon.png')));
    }
    buildMenu();
    registerIpc(api, () => mainWin, {
      dialogs,
      openPopup,
      openPrint,
      takePrintJob,
      listPrinters,
      printHtml,
      printRun,
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
