// CaptureMaster — Electron main process.
//
// Responsibilities:
//   • main window lifecycle (frameless, single instance, persisted bounds)
//   • the `cm-media://` scheme that streams recorded videos with Range support
//   • the close flow: the renderer is asked first so unsaved captures can be
//     saved, and every dialog window goes down with the main window
//   • receiving files handed over by the shell (.cmcap association, "Open with")
//   • detecting a reinstall so the renderer can ask whether to keep old data
const { app, BrowserWindow, Menu, shell, session, protocol, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

const { registerIpcHandlers, MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT } = require('./ipc');
const { closeAllDialogWindows } = require('./dialogs');
const state = require('./state');

const isDev = !app.isPackaged && process.env.ELECTRON_DEV === '1';
const DEV_URL = 'http://localhost:5184';
const PRODUCT = 'CaptureMaster';

app.commandLine.appendSwitch('disable-features', 'Autofill');
// Development aid: a separate profile (settings, window state, instance lock)
// so a test run never touches — or collides with — the real one.
if (process.env.CM_USER_DATA && !app.isPackaged) app.setPath('userData', process.env.CM_USER_DATA);
// Wayland sessions (Ubuntu 22.04+) capture through the PipeWire portal.
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');

// Recorded videos live on disk and are played back inside the app. A custom
// scheme keeps the renderer sandboxed (no file:// access) while still giving
// <video> the Range requests it needs to seek.
protocol.registerSchemesAsPrivileged([
  { scheme: 'cm-media', privileges: { secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } },
]);

const MEDIA_MIME = {
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.ogg': 'video/ogg',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp',
};

function registerMediaProtocol() {
  protocol.handle('cm-media', (request) => {
    let filePath;
    try {
      filePath = decodeURIComponent(request.url.replace(/^cm-media:\/\/[^/]*\//, ''));
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    if (process.platform !== 'win32' && !filePath.startsWith('/')) filePath = '/' + filePath;
    if (!fs.existsSync(filePath)) return new Response('Not found', { status: 404 });
    const st = fs.statSync(filePath);
    const type = MEDIA_MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const range = request.headers.get('range');
    let start = 0;
    let end = st.size - 1;
    let status = 200;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        if (m[1]) start = Number(m[1]);
        if (m[2]) end = Number(m[2]);
        if (!m[1] && m[2]) { start = Math.max(0, st.size - Number(m[2])); end = st.size - 1; }
        end = Math.min(end, st.size - 1);
        status = 206;
      }
    }
    const headers = {
      'content-type': type,
      'accept-ranges': 'bytes',
      'content-length': String(end - start + 1),
      'cache-control': 'no-store',
    };
    if (status === 206) headers['content-range'] = `bytes ${start}-${end}/${st.size}`;
    const stream = fs.createReadStream(filePath, { start, end });
    return new Response(Readable.toWeb(stream), { status, headers });
  });
}

// ── Files handed to us by the shell ───────────────────────
const OPENABLE = new Set(['.cmcap', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.webm', '.mp4', '.mkv']);

function fileFromArgv(argv) {
  for (const raw of argv.slice(1)) {
    if (!raw || raw.startsWith('-')) continue;
    const ext = path.extname(raw).toLowerCase();
    if (!OPENABLE.has(ext)) continue;
    const abs = path.resolve(raw);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function deliverOpen(win, filePath) {
  if (!filePath) return;
  if (win && !win.isDestroyed() && win.webContents) win.webContents.send('app:openPath', filePath);
  else state.pendingOpenPath = filePath;
}

// ── Window state ──────────────────────────────────────────
function windowStateFile() { return path.join(app.getPath('userData'), 'window-state.json'); }

function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(windowStateFile(), 'utf-8')); } catch { return null; }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const bounds = win.isMaximized() || win.isFullScreen() ? win.getNormalBounds() : win.getBounds();
    const data = { ...bounds, maximized: win.isMaximized() };
    fs.mkdirSync(path.dirname(windowStateFile()), { recursive: true });
    fs.writeFileSync(windowStateFile(), JSON.stringify(data), 'utf-8');
  } catch { /* best effort */ }
}

// Only restore bounds that still land on a connected display.
function usableBounds(saved) {
  if (!saved || !Number.isFinite(saved.width) || !Number.isFinite(saved.height)) return null;
  const displays = screen.getAllDisplays();
  const visible = displays.some((d) => {
    const a = d.workArea;
    return saved.x + saved.width > a.x + 40 && saved.x < a.x + a.width - 40 &&
      saved.y >= a.y - 20 && saved.y < a.y + a.height - 40;
  });
  return visible ? saved : null;
}

// ── Reinstall detection (Linux / macOS) ───────────────────
// The Windows installer asks about leftover data itself. Elsewhere the app
// notices that the executable changed underneath an existing profile and
// lets the renderer ask the user whether to keep it.
function installStampFile() { return path.join(app.getPath('userData'), 'install-stamp.json'); }

function currentStamp() {
  let mtime = 0;
  try { mtime = Math.round(fs.statSync(process.execPath).mtimeMs); } catch { /* ignore */ }
  return { exe: process.execPath, mtime, version: app.getVersion() };
}

function checkReinstall() {
  const stamp = currentStamp();
  const settingsExists = fs.existsSync(path.join(app.getPath('userData'), 'settings.json'));
  let previous = null;
  try { previous = JSON.parse(fs.readFileSync(installStampFile(), 'utf-8')); } catch { /* first run */ }
  const changed = !previous || previous.exe !== stamp.exe || previous.mtime !== stamp.mtime || previous.version !== stamp.version;
  if (app.isPackaged && process.platform !== 'win32' && settingsExists && changed) {
    state.pendingInstallCheck = true;      // the renderer asks, then calls app:resolveInstallCheck
  } else {
    writeInstallStamp();
  }
}

function writeInstallStamp() {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(installStampFile(), JSON.stringify(currentStamp()), 'utf-8');
  } catch { /* ignore */ }
}

// ── Main window ───────────────────────────────────────────
function createWindow() {
  // The window always starts at its minimum size (the renderer widens it to
  // whatever the toolbar needs once it has measured itself); only the last
  // position is restored.
  const saved = usableBounds(loadWindowState());
  const win = new BrowserWindow({
    width: MIN_WINDOW_WIDTH,
    height: MIN_WINDOW_HEIGHT,
    x: saved ? saved.x : undefined,
    y: saved ? saved.y : undefined,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    backgroundColor: '#12161c',
    autoHideMenuBar: true,
    show: false,
    title: PRODUCT,
    // No OS title bar: the app draws its own (name, version, document) so the
    // chrome follows the theme the user picked.
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    icon: path.join(__dirname, '..', 'build', 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      // The window is hidden while it captures the screen and minimised while
      // it records; the renderer must keep running at full speed meanwhile.
      backgroundThrottling: false,
    },
  });
  state.mainWin = win;
  state.windowCreatedAt = Date.now();

  win.once('ready-to-show', () => {
    // Shown transparent and faded in a moment later: on Windows the native
    // window paints white for a frame before the first web frame arrives.
    // The renderer applies the user's opacity setting itself once it is up;
    // this only lifts the initial 0 if it has not done so yet.
    win.setOpacity(0);
    win.show();
    setTimeout(() => { if (!win.isDestroyed() && win.getOpacity() === 0) win.setOpacity(1); }, 60);
    // Development aid: `--smoke-shot=<png>` writes a screenshot of the window
    // a moment after it appears (and `--smoke-quit` exits afterwards), so the
    // UI can be checked from a script without a person at the screen.
    const shot = (process.argv.find((a) => a.startsWith('--smoke-shot=')) || '').slice('--smoke-shot='.length);
    const script = (process.argv.find((a) => a.startsWith('--smoke-script=')) || '').slice('--smoke-script='.length);
    if (shot && !app.isPackaged) {
      setTimeout(async () => {
        try {
          if (script) console.log('[smoke] script result:', await win.webContents.executeJavaScript(fs.readFileSync(script, 'utf-8'), true));
          // Every other window (the dialogs) goes to <shot>-<n>.png, after
          // `--smoke-dialog-script=<js>` (if given) has run inside each of them.
          const dialogScript = (process.argv.find((a) => a.startsWith('--smoke-dialog-script=')) || '').slice('--smoke-dialog-script='.length);
          let n = 0;
          for (const w of BrowserWindow.getAllWindows()) {
            if (w === win || w.isDestroyed()) continue;
            n += 1;
            if (dialogScript) console.log(`[smoke] dialog ${n} result:`, await w.webContents.executeJavaScript(fs.readFileSync(dialogScript, 'utf-8'), true));
            if (w.isDestroyed()) { n -= 1; continue; }
            fs.writeFileSync(shot.replace(/\.png$/i, '') + `-${n}.png`, (await w.webContents.capturePage()).toPNG());
          }
          await new Promise((r) => setTimeout(r, Number(process.env.CM_SMOKE_AFTER || 0)));
          fs.writeFileSync(shot, (await win.webContents.capturePage()).toPNG());
        } catch (err) { console.error('[smoke]', err); }
        if (process.argv.includes('--smoke-quit')) { state.quitting = true; app.quit(); }
      }, Number(process.env.CM_SMOKE_DELAY || 3000));
    }
  });

  if (isDev) {
    win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      const tag = ['debug', 'info', 'warn', 'error'][level] || 'log';
      console.log(`[renderer:${tag}] ${message}  (${sourceId}:${line})`);
    });
  }

  const sendMaximized = () => { if (!win.isDestroyed()) win.webContents.send('win:maximized', win.isMaximized()); };
  win.on('maximize', sendMaximized);
  win.on('unmaximize', sendMaximized);

  let saveTimer = null;
  const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => saveWindowState(win), 400); };
  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);

  // Closing: the renderer gets the first say so unsaved work can be saved. It
  // answers with app:quit (see ipc.js), which sets state.quitting and closes
  // for real. A renderer that has crashed cannot answer, so it is not asked.
  win.on('close', (e) => {
    if (state.quitting) return;
    if (win.webContents.isCrashed && win.webContents.isCrashed()) return;
    e.preventDefault();
    win.webContents.send('app:closeRequested');
  });

  // The dialogs are separate windows but not a separate application: when the
  // main window goes, they go with it.
  win.on('closed', () => {
    saveWindowState(win);
    closeAllDialogWindows();
    state.mainWin = null;
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.destroy();
    app.quit();
  });

  // Never navigate away in place; external links go to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(DEV_URL) && !url.startsWith('file:')) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  if (isDev) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  return win;
}

// ── Main-process errors → the renderer's error dialog ─────
function forwardMainError(err, context) {
  const e = err instanceof Error ? err : new Error(String(err));
  console.error('[main]', context, e);
  const win = state.mainWin;
  try {
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('app:mainError', { name: e.name, message: e.message, stack: e.stack || '', context });
    }
  } catch { /* nowhere left to report to */ }
}
process.on('uncaughtException', (err) => forwardMainError(err, 'uncaughtException'));
process.on('unhandledRejection', (err) => forwardMainError(err, 'unhandledRejection'));

// ── Single instance ───────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const win = state.mainWin || BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
    deliverOpen(win, fileFromArgv(argv));
  });

  // macOS delivers associated files through this event.
  app.on('open-file', (e, filePath) => {
    e.preventDefault();
    deliverOpen(state.mainWin, filePath);
  });

  state.pendingOpenPath = fileFromArgv(process.argv);

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerMediaProtocol();
    checkReinstall();

    // Microphone for recordings, local fonts for the settings dialog, and the
    // clipboard for copy & paste — nothing else.
    const allowed = new Set(['media', 'local-fonts', 'clipboard-sanitized-write', 'clipboard-read', 'display-capture', 'fullscreen']);
    try {
      session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
      session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
    } catch { /* ignore */ }

    registerIpcHandlers({ writeInstallStamp });
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  // Cmd+Q on macOS bypasses the window close event: route it through the same
  // ask-the-renderer flow.
  app.on('before-quit', (e) => {
    if (state.quitting) return;
    const win = state.mainWin;
    if (win && !win.isDestroyed()) {
      e.preventDefault();
      win.webContents.send('app:closeRequested');
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' || state.quitting) app.quit();
  });
}
