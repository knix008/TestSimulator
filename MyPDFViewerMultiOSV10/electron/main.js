// MyPDFViewer — Electron main process.
//
// Responsibilities:
//   • window lifecycle (frameless main window, single instance)
//   • serving the built renderer over a custom `app://` scheme rather than
//     file:// — pdf.js spawns a module Worker and uses fetch(), both of which
//     are blocked on file:// origins
//   • native dialogs, chunked file I/O with progress, URL downloads
//   • persisted settings / recent files under userData
//   • receiving files handed over by the shell (file associations, "Open with")
const {
  app, BrowserWindow, ipcMain, dialog, Menu, shell, session, protocol, net, clipboard, nativeImage,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');

const isDev = !app.isPackaged && process.env.ELECTRON_DEV === '1';
const DEV_URL = 'http://localhost:5179';
const APP_ORIGIN = 'app://bundle';

app.commandLine.appendSwitch('disable-features', 'Autofill');

// The renderer is served from a real (standard, secure) origin so module
// workers, fetch() and the Clipboard API behave exactly as they do on the web.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

const DIST = path.join(__dirname, '..', 'dist');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.map': 'application/json',
  '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream',
};

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (!rel || rel === '/') rel = '/index.html';
    // Resolve inside dist/ and refuse anything that escapes it.
    const target = path.normalize(path.join(DIST, rel));
    if (!target.startsWith(DIST)) return new Response('Forbidden', { status: 403 });
    if (!fs.existsSync(target)) return new Response('Not found', { status: 404 });
    const res = await net.fetch(pathToFileURL(target).toString());
    const type = MIME[path.extname(target).toLowerCase()];
    if (!type) return res;
    const headers = new Headers(res.headers);
    headers.set('content-type', type);
    return new Response(res.body, { status: res.status, headers });
  });
}

// ── Files handed to us by the shell ───────────────────────
const OPENABLE = new Set(['.pdf', '.pdfvw']);
let pendingOpenPath = null;

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
  else pendingOpenPath = filePath;
}

let mainWin = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1040,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    icon: path.join(__dirname, '..', 'build', 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    backgroundColor: '#14100f',
    frame: false,            // the in-app title bar provides the window controls
    autoHideMenuBar: true,
    show: false,
    title: 'MyPDFViewer',
  });

  if (isDev) win.loadURL(DEV_URL);
  else win.loadURL(APP_ORIGIN + '/index.html');

  win.once('ready-to-show', () => win.show());

  // In development, renderer console output goes to the terminal running
  // `npm start`, so errors are visible without opening DevTools.
  if (isDev) {
    win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      const tag = ['debug', 'info', 'warn', 'error'][level] || 'log';
      console.log(`[renderer:${tag}] ${message}  (${sourceId}:${line})`);
    });
  }

  const sendMax = () => { if (!win.isDestroyed()) win.webContents.send('win:maximized', win.isMaximized()); };
  win.on('maximize', sendMax);
  win.on('unmaximize', sendMax);

  // Closing the main window tears down everything else and quits.
  win.on('closed', () => {
    mainWin = null;
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.destroy();
    app.quit();
  });

  // Never navigate away in place; external links go to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(APP_ORIGIN) && !url.startsWith(DEV_URL)) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  mainWin = win;
  return win;
}

// ── Single instance ───────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const win = mainWin || BrowserWindow.getAllWindows()[0];
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
    deliverOpen(mainWin, filePath);
  });

  pendingOpenPath = fileFromArgv(process.argv);

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerAppProtocol();
    // The settings dialog enumerates installed fonts via queryLocalFonts().
    try {
      session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
        cb(permission === 'local-fonts' || permission === 'clipboard-sanitized-write');
      });
    } catch { /* ignore */ }
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
    try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { /* ignore */ }
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
  userData: app.getPath('userData'),
  ...readBuildInfo(),
}));

// Handed over once the renderer is ready to receive it.
ipcMain.handle('app:takePendingOpen', () => {
  const p = pendingOpenPath;
  pendingOpenPath = null;
  return p;
});

// ── Filesystem ────────────────────────────────────────────
ipcMain.handle('fs:home', () => os.homedir());

ipcMain.handle('fs:exists', (_e, p) => {
  try { return fs.existsSync(p); } catch { return false; }
});

ipcMain.handle('fs:stat', (_e, p) => {
  try {
    const st = fs.statSync(p);
    return { size: st.size, mtime: st.mtimeMs, dir: path.dirname(p), name: path.basename(p) };
  } catch { return null; }
});

// Reads a file in chunks, reporting progress so the renderer can show a
// progress dialog for large PDFs. Returns the bytes as a Uint8Array.
function readWithProgress(sender, id, filePath) {
  return new Promise((resolve, reject) => {
    let total = 0;
    try { total = fs.statSync(filePath).size; } catch { /* unknown */ }
    const chunks = [];
    let done = 0;
    let lastTick = 0;
    const stream = fs.createReadStream(filePath, { highWaterMark: 1 << 20 });
    stream.on('data', (chunk) => {
      chunks.push(chunk);
      done += chunk.length;
      const now = Date.now();
      if (now - lastTick > 60) {
        lastTick = now;
        if (!sender.isDestroyed()) sender.send('task:progress', { id, done, total });
      }
    });
    stream.on('error', reject);
    stream.on('end', () => {
      if (!sender.isDestroyed()) sender.send('task:progress', { id, done, total: total || done });
      resolve(Buffer.concat(chunks));
    });
  });
}

ipcMain.handle('fs:readBinary', async (e, { filePath, id }) => {
  if (!fs.existsSync(filePath)) throw new Error('File not found: ' + filePath);
  const buf = await readWithProgress(e.sender, id, filePath);
  let mtime = Date.now();
  try { mtime = fs.statSync(filePath).mtimeMs; } catch { /* ignore */ }
  return {
    data: new Uint8Array(buf),
    name: path.basename(filePath),
    dir: path.dirname(filePath),
    path: filePath,
    size: buf.length,
    mtime,
  };
});

ipcMain.handle('fs:readText', (_e, filePath) => fs.readFileSync(filePath, 'utf-8'));

ipcMain.handle('fs:writeText', (_e, { filePath, content }) => {
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
});

// ── Dialogs ───────────────────────────────────────────────
function ownerWin(e) { return BrowserWindow.fromWebContents(e.sender) || mainWin; }

ipcMain.handle('dialog:openPdf', async (e, { defaultDir, multi, title } = {}) => {
  const props = ['openFile'];
  if (multi) props.push('multiSelections');
  const opts = {
    title: title || 'PDF 열기 / Open PDF',
    properties: props,
    filters: [
      { name: 'PDF & Workspace', extensions: ['pdf', 'pdfvw'] },
      { name: 'PDF Document', extensions: ['pdf'] },
      { name: 'MyPDFViewer Workspace', extensions: ['pdfvw'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  };
  if (defaultDir && fs.existsSync(defaultDir)) opts.defaultPath = defaultDir;
  const { canceled, filePaths } = await dialog.showOpenDialog(ownerWin(e), opts);
  if (canceled || !filePaths.length) return null;
  return multi ? filePaths : filePaths[0];
});

ipcMain.handle('dialog:pickDirectory', async (e, { defaultDir, title } = {}) => {
  const opts = { title: title || '폴더 선택 / Select Folder', properties: ['openDirectory'] };
  if (defaultDir && fs.existsSync(defaultDir)) opts.defaultPath = defaultDir;
  const { canceled, filePaths } = await dialog.showOpenDialog(ownerWin(e), opts);
  if (canceled || !filePaths.length) return null;
  return filePaths[0];
});

ipcMain.handle('dialog:saveText', async (e, { defaultName, defaultDir, content, filters }) => {
  const name = defaultName || 'untitled.txt';
  const { canceled, filePath } = await dialog.showSaveDialog(ownerWin(e), {
    title: '저장 / Save',
    defaultPath: defaultDir && fs.existsSync(defaultDir) ? path.join(defaultDir, name) : name,
    filters: filters || [{ name: 'Text', extensions: ['txt'] }],
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
});

// Streams a buffer to disk, reporting progress as it goes.
function writeWithProgress(sender, id, filePath, data) {
  const buf = Buffer.from(data);
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);
    const CHUNK = 1 << 20;
    let off = 0;
    const write = () => {
      while (off < buf.length) {
        const end = Math.min(off + CHUNK, buf.length);
        const ok = stream.write(buf.subarray(off, end));
        off = end;
        if (id && !sender.isDestroyed()) sender.send('task:progress', { id, done: off, total: buf.length });
        if (!ok) { stream.once('drain', write); return; }
      }
      stream.end();
    };
    stream.on('error', reject);
    stream.on('finish', resolve);
    write();
  });
}

// Asks only for the destination. Used when the chosen file extension decides
// how the data is encoded (saving a captured region as PNG/JPEG/WebP/GIF/BMP),
// so the encoder can run once the format is known.
ipcMain.handle('dialog:pickSavePath', async (e, { defaultName, defaultDir, filters, title } = {}) => {
  const name = defaultName || 'file.bin';
  const { canceled, filePath } = await dialog.showSaveDialog(ownerWin(e), {
    title: title || '저장 / Save',
    defaultPath: defaultDir && fs.existsSync(defaultDir) ? path.join(defaultDir, name) : name,
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
  });
  if (canceled || !filePath) return null;
  return filePath;
});

ipcMain.handle('fs:writeBinary', async (e, { filePath, data, id }) => {
  await writeWithProgress(e.sender, id, filePath, data);
  return filePath;
});

// Writes binary data (images, extracted pages) with progress reporting.
ipcMain.handle('dialog:saveBinary', async (e, { defaultName, defaultDir, data, filters, id }) => {
  const name = defaultName || 'file.bin';
  const { canceled, filePath } = await dialog.showSaveDialog(ownerWin(e), {
    title: '저장 / Save',
    defaultPath: defaultDir && fs.existsSync(defaultDir) ? path.join(defaultDir, name) : name,
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
  });
  if (canceled || !filePath) return null;
  await writeWithProgress(e.sender, id, filePath, data);
  return filePath;
});

// ── Download a PDF (or any file) from a URL, with progress ─
ipcMain.handle('net:download', async (e, { url, id }) => {
  const res = await net.fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText + ' — ' + url);
  const total = Number(res.headers.get('content-length') || 0);
  const reader = res.body.getReader();
  const chunks = [];
  let done = 0;
  let lastTick = 0;
  for (;;) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    chunks.push(Buffer.from(value));
    done += value.length;
    const now = Date.now();
    if (now - lastTick > 60) {
      lastTick = now;
      if (!e.sender.isDestroyed()) e.sender.send('task:progress', { id, done, total });
    }
  }
  const buf = Buffer.concat(chunks);
  if (!e.sender.isDestroyed()) e.sender.send('task:progress', { id, done: buf.length, total: buf.length });

  let name = 'download.pdf';
  try {
    const cd = res.headers.get('content-disposition') || '';
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    name = m ? decodeURIComponent(m[1]) : (path.basename(new URL(url).pathname) || name);
  } catch { /* keep default */ }
  return { data: new Uint8Array(buf), name, size: buf.length, url };
});

// ── Clipboard ─────────────────────────────────────────────
ipcMain.handle('clipboard:writeText', (_e, text) => { clipboard.writeText(String(text ?? '')); return true; });

ipcMain.handle('clipboard:writeImage', (_e, dataUrl) => {
  const img = nativeImage.createFromDataURL(dataUrl);
  if (img.isEmpty()) throw new Error('Clipboard image is empty (PNG decode failed).');
  clipboard.writeImage(img);
  return true;
});

// ── Shell ─────────────────────────────────────────────────
ipcMain.handle('shell:openExternal', async (_e, url) => {
  // Only web links and mail addresses — never arbitrary schemes.
  if (!/^(https?|mailto):/i.test(url)) throw new Error('Refusing to open a non-web URL: ' + url);
  await shell.openExternal(url);
  return true;
});
ipcMain.handle('shell:showItem', (_e, p) => { shell.showItemInFolder(p); return true; });

// ── Persisted settings / recents (userData/settings.json) ─
function settingsFile() { return path.join(app.getPath('userData'), 'settings.json'); }
ipcMain.handle('settings:load', () => {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf-8')); } catch { return null; }
});
ipcMain.handle('settings:save', (_e, data) => {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch { return false; }
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
ipcMain.handle('win:setTitle', (e, title) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && !w.isDestroyed()) w.setTitle(String(title || 'MyPDFViewer'));
  return true;
});
