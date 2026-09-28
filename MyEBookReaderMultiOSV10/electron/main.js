// MyEBookReader — Electron main process.
//
// Responsibilities:
//   • window lifecycle (frameless main window, single instance, transparency)
//   • serving the built renderer over a custom `app://` scheme rather than
//     file:// — pdf.js spawns a module Worker and uses fetch(), both of which
//     are blocked on file:// origins
//   • native dialogs, chunked file I/O with progress, URL downloads, printing
//   • persisted settings / recent files under userData
//   • receiving files handed over by the shell (file associations, "Open with")
//   • menus and dialogs as real child windows (see childwindows.js)
'use strict';

const {
  app, BrowserWindow, ipcMain, dialog, Menu, shell, session, protocol, net,
  clipboard, nativeImage,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { readLevel, OPENABLE_EXTENSIONS } = require('./folder-list');
const child = require('./childwindows');

const isDev = !app.isPackaged && process.env.ELECTRON_DEV === '1';
// Set by `npm run smoke`: the app starts, drives its own controls and exits.
const isSmoke = process.env.EBK_SMOKE === '1';

// The smoke test writes settings, a gallery and cover files like any other run.
// It must not write them into the reader's own folder: one of its checks shelves
// a hundred thousand books, and nobody wants that in their real gallery.
if (isSmoke) app.setPath('userData', path.join(app.getPath('temp'), 'myebookreader-smoke'));
const DEV_URL = 'http://localhost:5183';
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

    // app://covers/<name>.png — the gallery's thumbnails, one file each, so a
    // shelf of a hundred thousand books costs the renderer only the covers it
    // is actually showing. The browser does the loading, caching and evicting.
    if (url.host === 'covers') {
      const name = path.basename(rel);
      if (!/^[a-z0-9]+\.png$/i.test(name)) return new Response('Forbidden', { status: 403 });
      const file = path.join(coversDir(), name);
      if (!fs.existsSync(file)) return new Response('Not found', { status: 404 });
      return new Response(fs.readFileSync(file), {
        headers: { 'content-type': 'image/png', 'cache-control': 'max-age=86400' },
      });
    }

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
let pendingOpenPath = null;

function fileFromArgv(argv) {
  for (const raw of argv.slice(1)) {
    if (!raw || raw.startsWith('-')) continue;
    const ext = path.extname(raw).toLowerCase().replace('.', '');
    if (!OPENABLE_EXTENSIONS.has(ext)) continue;
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

// Floor and ceiling for the measured toolbar minimum: never let the window get
// unusably narrow, and never let a runaway measurement make it unresizable.
const MIN_WINDOW_WIDTH = 980;
const MAX_MIN_WINDOW_WIDTH = 2200;

function createWindow() {
  const win = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: 660,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    icon: path.join(__dirname, '..', 'build', 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    backgroundColor: '#14161c',
    frame: false,            // the in-app title bar provides the window controls
    autoHideMenuBar: true,
    show: false,
    title: 'MyEBookReader',
  });

  if (isDev) win.loadURL(DEV_URL);
  else win.loadURL(APP_ORIGIN + '/index.html');

  win.once('ready-to-show', () => {
    win.show();
    // Popup renderers start warming only once the reader itself is up.
    setTimeout(() => child.warmChildWindows(), isSmoke ? 200 : 1200);
  });

  if (isSmoke) require('./smoke').startSmoke(win);

  // `npm run shoot:dialog` — opens one dialog and photographs its own window,
  // which is the only way to see a popup's layout without sitting in front of
  // the machine. Off unless EBK_SHOOT names a dialog.
  if (process.env.EBK_SHOOT) {
    const [dialogName, file, tab] = process.env.EBK_SHOOT.split('|');
    win.webContents.once('did-finish-load', async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      try {
        await wait(2500);
        child.openDialogWindow(dialogName, {
          language: 'ko',
          theme: 'dark',
          settings: JSON.parse(fs.readFileSync(settingsFile(), 'utf-8').toString()),
          storagePath: app.getPath('userData'),
        }, win);
        await wait(2500);
        const dialog = child.dialogWindows.get(dialogName);
        if (!dialog) throw new Error(`the ${dialogName} window did not open`);
        if (Number(tab) > 0) {
          await dialog.webContents.executeJavaScript(
            `(() => { const tabs = document.querySelectorAll('.tabs .tab'); if (tabs[${Number(tab)}]) tabs[${Number(tab)}].click(); return true; })()`,
            true,
          );
          await wait(800);
        }
        const image = await dialog.capturePage();
        fs.writeFileSync(file, image.toPNG());
        console.log(`[shoot] wrote ${file}`);
      } catch (err) {
        console.error('[shoot] failed:', err.message);
      } finally {
        app.exit(0);
      }
    });
  }

  if (isDev) {
    win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      const tag = ['debug', 'info', 'warn', 'error'][level] || 'log';
      console.log(`[renderer:${tag}] ${message}  (${sourceId}:${line})`);
    });
  }

  const sendMax = () => { if (!win.isDestroyed()) win.webContents.send('win:maximized', win.isMaximized()); };
  win.on('maximize', sendMax);
  win.on('unmaximize', sendMax);

  // Closing the main window tears down everything else and quits. The renderer
  // is asked first when there is unsaved reading work; forceClose sets the flag
  // so the second close goes through.
  win.webContents.on('did-finish-load', () => { win.__rendererReady = true; });
  win.on('close', (e) => {
    if (win.__allowClose || !win.__rendererReady) return;
    if (win.webContents.isDestroyed() || win.webContents.isCrashed()) return;
    e.preventDefault();
    win.webContents.send('win:close-request');
  });
  win.on('closed', () => {
    mainWin = null;
    child.closeAllChildWindows();
    for (const other of BrowserWindow.getAllWindows()) if (!other.isDestroyed()) other.destroy();
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
  child.setMainWindow(win);
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

  pendingOpenPath = fileFromArgv(process.argv)
    || (isSmoke ? require('./smoke').smokeBook() : null);

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerAppProtocol();
    child.configure({
      dev: isDev ? `${DEV_URL}/index.html` : '',
      bundle: `${APP_ORIGIN}/index.html`,
    });
    child.registerChildWindowHandlers();
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

  app.on('before-quit', () => child.closeAllChildWindows());

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

ipcMain.handle('fs:readDir', (_e, dirPath) => readLevel(fs, path, dirPath));

// Reads a file in chunks, reporting progress so the renderer can show a
// progress dialog for a large book. Returns the bytes as a Uint8Array.
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

ipcMain.handle('dialog:openBook', async (e, { defaultDir, multi, title } = {}) => {
  const props = ['openFile'];
  if (multi) props.push('multiSelections');
  const opts = {
    title: title || '책 열기 / Open book',
    properties: props,
    filters: [
      { name: 'All books & pictures', extensions: ['epub', 'pdf', 'mobi', 'prc', 'azw', 'azw3', 'fb2', 'cbz', 'cbr', 'md', 'markdown', 'html', 'htm', 'xhtml', 'txt', 'ebkr', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'svg', 'tif', 'tiff', 'heic', 'heif', 'dcm'] },
      { name: 'EPUB', extensions: ['epub'] },
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'MOBI / AZW', extensions: ['mobi', 'prc', 'azw', 'azw3'] },
      { name: 'FictionBook', extensions: ['fb2'] },
      { name: 'Comic book', extensions: ['cbz', 'cbr'] },
      { name: 'Text / Markdown / HTML', extensions: ['txt', 'md', 'markdown', 'html', 'htm', 'xhtml'] },
      { name: 'Pictures', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'svg', 'tif', 'tiff', 'heic', 'heif', 'ico'] },
      { name: 'DICOM', extensions: ['dcm', 'dicom'] },
      { name: 'MyEBookReader reading file', extensions: ['ebkr'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  };
  if (defaultDir && fs.existsSync(defaultDir)) opts.defaultPath = defaultDir;
  const { canceled, filePaths } = await dialog.showOpenDialog(ownerWin(e), opts);
  if (canceled || !filePaths.length) return null;
  return multi ? filePaths : filePaths[0];
});

ipcMain.handle('dialog:openImage', async (e, { defaultDir } = {}) => {
  const opts = {
    title: '배경 이미지 / Background image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] }],
  };
  if (defaultDir && fs.existsSync(defaultDir)) opts.defaultPath = defaultDir;
  const { canceled, filePaths } = await dialog.showOpenDialog(ownerWin(e), opts);
  if (canceled || !filePaths.length) return null;
  return filePaths[0];
});

ipcMain.handle('dialog:pickDirectory', async (e, { defaultDir, title } = {}) => {
  const opts = { title: title || '폴더 선택 / Select folder', properties: ['openDirectory'] };
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

// ── Download a book from a URL, with progress ─────────────
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

  let name = 'download.epub';
  try {
    const cd = res.headers.get('content-disposition') || '';
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    name = m ? decodeURIComponent(m[1]) : (path.basename(new URL(url).pathname) || name);
  } catch { /* keep default */ }
  return { data: new Uint8Array(buf), name, size: buf.length, url };
});

// ── Printing ──────────────────────────────────────────────
// The renderer builds the print document (chapters, or page images for a PDF or
// a comic) and it is printed from an offscreen window, so the system print
// dialog shows exactly what the user chose.
async function printDocument(html, title) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myebookreader-print-'));
  const file = path.join(dir, 'print.html');
  fs.writeFileSync(file, html, 'utf-8');
  const cleanup = () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp sweep */ } };

  // Shown but off-screen and transparent: a `show: false` window is throttled
  // and can reach the printer before the content has painted.
  const win = new BrowserWindow({
    show: true, x: -32000, y: -32000, width: 900, height: 1200,
    opacity: 0, skipTaskbar: true, focusable: false,
    webPreferences: { sandbox: true, backgroundThrottling: false },
  });

  try {
    await win.loadFile(file);
    await win.webContents.executeJavaScript(
      'Promise.all(Array.from(document.images).map(function (i) { return i.decode().catch(function () {}); })).then(function () { return true; })'
    );
    await new Promise((r) => setTimeout(r, 250));

    const result = await new Promise((resolve) => {
      win.webContents.print(
        { silent: false, printBackground: true, title: title || 'MyEBookReader' },
        (success, failureReason) => resolve({ success, failureReason })
      );
    });
    if (!result.success && result.failureReason && !/cancel/i.test(result.failureReason)) {
      throw new Error(result.failureReason);
    }
    return { printed: result.success, reason: result.failureReason || '' };
  } finally {
    if (!win.isDestroyed()) win.destroy();
    cleanup();
  }
}

ipcMain.handle('print:html', (_e, { html, title }) => printDocument(html, title));

ipcMain.handle('print:images', async (_e, { images, title, html }) => {
  if (html) return printDocument(html, title);
  const sheets = (images || []).map((src) => `<div class="sheet"><img src="${src}" alt=""></div>`).join('\n');
  const document = `<!doctype html><html><head><meta charset="utf-8"><title>${String(title || 'Print').replace(/[<&]/g, '')}</title>
<style>@page { size: auto; margin: 8mm; } html,body{margin:0;background:#fff;}
.sheet{page-break-after:always;break-after:page;display:flex;align-items:center;justify-content:center;}
.sheet:last-child{page-break-after:auto;break-after:auto;} .sheet img{max-width:100%;display:block;}</style>
</head><body>${sheets}</body></html>`;
  return printDocument(document, title);
});

// ── Clipboard ─────────────────────────────────────────────
ipcMain.handle('clipboard:writeText', (_e, text) => { clipboard.writeText(String(text ?? '')); return true; });
ipcMain.handle('clipboard:readText', () => clipboard.readText());
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

// ── The gallery: an index file and a folder of thumbnails ─────────────
function galleryDir() { return path.join(app.getPath('userData'), 'gallery'); }
function coversDir() { return path.join(galleryDir(), 'covers'); }
function galleryFile() { return path.join(galleryDir(), 'index.json'); }

ipcMain.handle('gallery:load', () => {
  // The text, not the parsed array: parsing once in the renderer is faster
  // than parsing here and copying a hundred thousand objects across the bridge.
  try { return fs.readFileSync(galleryFile(), 'utf-8'); } catch { return ''; }
});

ipcMain.handle('gallery:save', (_e, text) => {
  try {
    fs.mkdirSync(galleryDir(), { recursive: true });
    // Written beside the real file and renamed over it, so an interrupted
    // write leaves the previous shelf intact rather than half of a new one.
    const temp = `${galleryFile()}.tmp`;
    fs.writeFileSync(temp, String(text ?? '[]'), 'utf-8');
    fs.renameSync(temp, galleryFile());
    return true;
  } catch { return false; }
});

function positionsFile() { return path.join(galleryDir(), 'positions.json'); }

// Where the reading got to, for every shelved book. Tiny, and written far more
// often than the index — which is exactly why it is not part of it.
ipcMain.handle('gallery:loadPositions', () => {
  try { return fs.readFileSync(positionsFile(), 'utf-8'); } catch { return ''; }
});

ipcMain.handle('gallery:savePositions', (_e, text) => {
  try {
    fs.mkdirSync(galleryDir(), { recursive: true });
    // Merged, not replaced: the renderer sends only what changed.
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(positionsFile(), 'utf-8')) || {}; } catch { saved = {}; }
    Object.assign(saved, JSON.parse(String(text || '{}')));
    const temp = `${positionsFile()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(saved), 'utf-8');
    fs.renameSync(temp, positionsFile());
    return true;
  } catch { return false; }
});

ipcMain.handle('gallery:putCover', (_e, name, base64) => {
  try {
    if (!/^[a-z0-9]+\.png$/i.test(String(name || ''))) return false;
    fs.mkdirSync(coversDir(), { recursive: true });
    fs.writeFileSync(path.join(coversDir(), name), Buffer.from(String(base64 || ''), 'base64'));
    return true;
  } catch { return false; }
});

ipcMain.handle('gallery:clear', () => {
  try {
    fs.rmSync(coversDir(), { recursive: true, force: true });
    fs.rmSync(galleryFile(), { force: true });
    fs.rmSync(positionsFile(), { force: true });
    return true;
  } catch { return false; }
});

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
ipcMain.handle('win:forceClose', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || w.isDestroyed()) return false;
  w.__allowClose = true;
  child.closeAllChildWindows();
  w.close();
  return true;
});
ipcMain.handle('win:isMaximized', (e) => !!BrowserWindow.fromWebContents(e.sender)?.isMaximized());
ipcMain.handle('win:setTitle', (e, title) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && !w.isDestroyed()) w.setTitle(String(title || 'MyEBookReader'));
  return true;
});

ipcMain.handle('win:getSize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || w.isDestroyed()) return null;
  const [width, height] = w.getSize();
  const [minWidth, minHeight] = w.getMinimumSize();
  return { width, height, minWidth, minHeight };
});

// Used by the resize grip in the status bar: a frameless window has no corner
// of its own to drag, so the grip drags the size itself.
ipcMain.handle('win:setSize', (e, { width, height } = {}) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || w.isDestroyed() || w.isMaximized() || w.isFullScreen()) return false;
  const [minWidth, minHeight] = w.getMinimumSize();
  const nw = Math.max(minWidth, Math.round(Number(width) || 0));
  const nh = Math.max(minHeight, Math.round(Number(height) || 0));
  if (!Number.isFinite(nw) || !Number.isFinite(nh)) return false;
  w.setSize(nw, nh);
  return true;
});

// The narrowest the window may get. The renderer measures what the toolbar
// actually needs — which depends on the language, the font and whether button
// labels are shown — so the width is set from there rather than guessed here.
ipcMain.handle('win:setMinWidth', (e, width) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const want = Math.round(Number(width) || 0);
  if (!w || w.isDestroyed() || !Number.isFinite(want) || want <= 0) return false;
  // The renderer measures the page it draws on, but a minimum size is set in
  // window coordinates — on a frameless window the two still differ by the
  // resize border.
  const pad = Math.max(0, w.getSize()[0] - w.getContentSize()[0]);
  const min = Math.max(MIN_WINDOW_WIDTH, Math.min(want + pad, MAX_MIN_WINDOW_WIDTH));
  const [curMin, minH] = w.getMinimumSize();
  if (curMin === min) return true;
  w.setMinimumSize(min, minH);
  if (!w.isMaximized() && !w.isFullScreen()) {
    const [cw, ch] = w.getSize();
    if (cw < min) w.setSize(min, ch);
  }
  return true;
});

ipcMain.handle('win:getContentBounds', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || w.isDestroyed()) return null;
  return w.getContentBounds();
});
