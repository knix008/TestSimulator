const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeTheme, protocol, net, screen } = require('electron');

// Keep the terminal quiet unless explicitly debugging (MYVIDEOPLAYER_VERBOSE=1).
// Chromium otherwise prints benign decoder noise like "Unsupported pixel format: -1".
const VERBOSE_LOGS = ['1', 'true', 'yes'].includes(
  String(process.env.MYVIDEOPLAYER_VERBOSE || '').toLowerCase()
);
if (!VERBOSE_LOGS) {
  app.commandLine.appendSwitch('disable-logging');
  app.commandLine.appendSwitch('log-level', '3'); // FATAL only
  const noisyChromiumLog =
    /(?:ERROR|WARNING):(?:ffmpeg_common|gpu_|gl_|viz_|desktop_capture|allocation_tracker|console)\.cc|\bUnsupported pixel format\b/i;
  const wrapStd = (stream) => {
    const write = stream.write.bind(stream);
    stream.write = (chunk, encoding, cb) => {
      const text = typeof chunk === 'string' ? chunk : chunk?.toString?.(encoding || 'utf8') || '';
      if (text && noisyChromiumLog.test(text)) {
        if (typeof encoding === 'function') encoding();
        else if (typeof cb === 'function') cb();
        return true;
      }
      return write(chunk, encoding, cb);
    };
  };
  wrapStd(process.stderr);
  wrapStd(process.stdout);
}

const {
  ensureYoutubeCookies,
  writeYoutubeCookiesFile
} = require('./youtube-auth');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Readable } = require('stream');
const { pathToFileURL } = require('url');
const {
  openRtspStream,
  stopRtspStream,
  getActiveRtsp,
  serveRtspHttp,
  isRtspUrl,
  startRtspRecord,
  stopRtspRecord,
  getRtspRecording
} = require('./rtsp-stream');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'localmedia',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true
    }
  }
]);

const LOCAL_MEDIA_MIME = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.ogv': 'video/ogg',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.opus': 'audio/opus',
  '.wma': 'audio/x-ms-wma'
};

function encodeMediaToken(filePath) {
  return Buffer.from(path.resolve(filePath), 'utf8').toString('base64url');
}

function decodeMediaToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    return path.normalize(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function toLocalMediaUrl(filePath) {
  // Prefer same-origin HTTP with Range — Chromium seeks/decodes this reliably.
  // Avoid embedding raw filesystem paths (apostrophes, Unicode) in custom-scheme URLs.
  if (uiServerPort) {
    return `http://127.0.0.1:${uiServerPort}/__media/${encodeMediaToken(filePath)}`;
  }
  const normalized = path.resolve(filePath).replace(/\\/g, '/');
  const prefixed = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `localmedia://media${encodeURI(prefixed)}`;
}

function resolveLocalMediaPath(requestUrl) {
  const u = new URL(requestUrl);
  let filePath = decodeURIComponent(u.pathname);
  // Windows: /C:/Users/... -> C:/Users/...
  if (/^\/[A-Za-z]:\//.test(filePath)) filePath = filePath.slice(1);
  return path.normalize(filePath);
}

function parseByteRange(rangeHeader, size) {
  if (!rangeHeader) return null;
  const match = /bytes=(\d*)-(\d*)/i.exec(rangeHeader);
  if (!match) return null;
  let start = match[1] === '' ? 0 : Number.parseInt(match[1], 10);
  let end = match[2] === '' ? size - 1 : Number.parseInt(match[2], 10);
  if (!Number.isFinite(start)) start = 0;
  if (!Number.isFinite(end) || end >= size) end = size - 1;
  if (start < 0) start = 0;
  if (start > end || start >= size) return { unsatisfiable: true };
  return { start, end, length: end - start + 1 };
}

/**
 * Node HTTP Range response for local media (used by UI server /__media).
 */
function serveMediaFileHttp(req, res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const { size } = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = LOCAL_MEDIA_MIME[ext] || 'application/octet-stream';
  const range = parseByteRange(req.headers.range, size);
  const common = {
    'Accept-Ranges': 'bytes',
    'Content-Type': contentType,
    'Cache-Control': 'no-cache'
  };

  if (range?.unsatisfiable) {
    res.writeHead(416, { ...common, 'Content-Range': `bytes */${size}` });
    res.end();
    return;
  }

  if (range) {
    res.writeHead(206, {
      ...common,
      'Content-Length': String(range.length),
      'Content-Range': `bytes ${range.start}-${range.end}/${size}`
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
    return;
  }

  res.writeHead(200, { ...common, 'Content-Length': String(size) });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

/**
 * Fallback custom-protocol Range handler (kept for older URLs / early boot).
 */
function serveLocalMediaRequest(request) {
  const filePath = resolveLocalMediaPath(request.url);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return new Response('Not found', { status: 404 });
  }

  const { size } = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = LOCAL_MEDIA_MIME[ext] || 'application/octet-stream';
  const range = parseByteRange(
    request.headers.get('Range') || request.headers.get('range'),
    size
  );

  const toWeb = (nodeStream) => {
    if (typeof Readable.toWeb === 'function') return Readable.toWeb(nodeStream);
    return fs.readFileSync(filePath);
  };

  if (range?.unsatisfiable) {
    return new Response(null, {
      status: 416,
      headers: {
        'Content-Range': `bytes */${size}`,
        'Accept-Ranges': 'bytes'
      }
    });
  }

  if (range) {
    const stream = fs.createReadStream(filePath, { start: range.start, end: range.end });
    return new Response(toWeb(stream), {
      status: 206,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(range.length),
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
      }
    });
  }

  const stream = fs.createReadStream(filePath);
  return new Response(toWeb(stream), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache'
    }
  });
}
const {
  extractVideoId,
  normalizeWatchUrl,
  sanitizeFilename,
  getYouTubeInfo,
  downloadYouTube,
  stopYouTubeDownload
} = require('./youtube');
const persistStore = require('./persist-store');
const { makeChromiumCompatible } = require('./media-compat');

const APP_NAME = 'MyVideoPlayer';
const APP_VERSION = '1.0.0';
const AUTHOR = 'SHKWON';
const AUTHOR_EMAIL = 'knix008@naver.com';

const DIALOG_OPEN_DIR_KEY = 'dialog.lastOpenDir';
const DIALOG_SAVE_DIR_KEY = 'dialog.lastSaveDir';

function fallbackMediaDir() {
  try {
    return app.getPath('videos');
  } catch {
    try {
      return app.getPath('documents');
    } catch {
      return app.getPath('home');
    }
  }
}

function getRememberedDir(key) {
  try {
    const raw = persistStore.getItem(key);
    if (raw && fs.existsSync(raw) && fs.statSync(raw).isDirectory()) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return fallbackMediaDir();
}

function rememberDirFromFile(key, filePath) {
  if (!filePath || typeof filePath !== 'string') return;
  try {
    const dir = path.dirname(path.resolve(filePath));
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      persistStore.setItem(key, dir);
    }
  } catch {
    /* ignore */
  }
}

const OPENABLE_MEDIA_EXTS = new Set([
  '.mp4', '.m4v', '.webm', '.mkv', '.mov', '.avi', '.ogv', '.hevc', '.h265',
  '.mp3', '.aac', '.m4a', '.wav', '.flac', '.opus', '.ogg', '.wma'
]);

function extractMediaPathsFromArgv(argv) {
  return (argv || [])
    .slice(1)
    .filter((arg) => {
      if (!arg || typeof arg !== 'string') return false;
      if (arg.startsWith('-')) return false;
      // Ignore electron/app entry paths
      if (/electron\.exe$/i.test(arg) || /[\\/]electron([\\/]|$)/i.test(arg)) return false;
      if (/\.(js|mjs|cjs|json|html)$/i.test(arg) && !OPENABLE_MEDIA_EXTS.has(path.extname(arg).toLowerCase())) {
        return false;
      }
      const ext = path.extname(arg).toLowerCase();
      if (!OPENABLE_MEDIA_EXTS.has(ext)) return false;
      try {
        return fs.existsSync(arg) && fs.statSync(arg).isFile();
      } catch {
        return false;
      }
    })
    .map((arg) => path.resolve(arg));
}

function sendOpenMediaPaths(paths) {
  if (!paths?.length || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('app:openMediaPaths', paths);
}

/** @type {string[]} */
let pendingOpenFiles = extractMediaPathsFromArgv(process.argv);

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const files = extractMediaPathsFromArgv(argv);
    if (mainWindow && !mainWindow.isDestroyed()) {
      restoreAllAppWindows();
      mainWindow.show();
      mainWindow.focus();
      if (files.length) sendOpenMediaPaths(files);
    } else if (files.length) {
      pendingOpenFiles.push(...files);
    }
  });
}

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let spectrumWindow = null;
/** @type {BrowserWindow | null} */
let historyWindow = null;
/** When true, restoring any app window restores the whole group. */
let restoreGroupOnNextRestore = false;
let downloadInProgress = false;
/** @type {http.Server | null} */
let uiServer = null;
let uiServerPort = 0;

function forEachAppWindow(fn) {
  for (const win of [mainWindow, spectrumWindow, historyWindow]) {
    if (win && !win.isDestroyed()) fn(win);
  }
}

/** Minimize player + spectrum + history together (Esc / caption minimize). */
function minimizeAllAppWindows() {
  let minimizedAny = false;
  forEachAppWindow((win) => {
    if (!win.isMinimized()) {
      win.minimize();
      minimizedAny = true;
    }
  });
  if (minimizedAny) restoreGroupOnNextRestore = true;
  return true;
}

/** Restore every app window that was group-minimized. */
function restoreAllAppWindows() {
  restoreGroupOnNextRestore = false;
  forEachAppWindow((win) => {
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
  });
  return true;
}

function attachGroupMinimizeRestore(win) {
  if (!win || win.isDestroyed()) return;
  win.on('restore', () => {
    if (!restoreGroupOnNextRestore) return;
    restoreAllAppWindows();
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2'
};

function startUiServer() {
  const root = path.join(__dirname, '..', 'src');
  return new Promise((resolve, reject) => {
    uiServer = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
        const pathname = decodeURIComponent(reqUrl.pathname);

        // Local media with HTTP Range (seek + decode). Token = base64url(abs path).
        if (pathname.startsWith('/__media/')) {
          const token = pathname.slice('/__media/'.length);
          const mediaPath = decodeMediaToken(token);
          if (!mediaPath) {
            res.writeHead(400);
            res.end('Bad media token');
            return;
          }
          serveMediaFileHttp(req, res, mediaPath);
          return;
        }

        // Live RTSP → fMP4 bridge (ffmpeg). Token = stream session id.
        if (pathname.startsWith('/__rtsp/')) {
          const streamId = pathname.slice('/__rtsp/'.length);
          if (!streamId) {
            res.writeHead(400);
            res.end('Bad RTSP stream id');
            return;
          }
          serveRtspHttp(req, res, streamId);
          return;
        }

        let rel = pathname === '/' ? '/index.html' : pathname;
        const filePath = path.normalize(path.join(root, rel));
        if (!filePath.startsWith(root)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } catch (err) {
        res.writeHead(500);
        res.end(String(err.message || err));
      }
    });
    uiServer.once('error', reject);
    uiServer.listen(0, '127.0.0.1', () => {
      uiServerPort = uiServer.address().port;
      resolve(uiServerPort);
    });
  });
}

const VIDEO_FILTERS = [
  {
    name: 'Media Files',
    extensions: [
      'mp4', 'm4v', 'webm', 'mkv', 'mov', 'avi', 'ogv', 'ogg',
      'mp3', 'aac', 'm4a', 'wav', 'flac', 'opus', 'wma',
      'hevc', 'h265', 'h264'
    ]
  },
  { name: 'Video', extensions: ['mp4', 'm4v', 'webm', 'mkv', 'mov', 'avi', 'ogv', 'hevc', 'h265'] },
  { name: 'Audio', extensions: ['mp3', 'aac', 'm4a', 'wav', 'flac', 'opus', 'ogg', 'wma'] },
  { name: 'All Files', extensions: ['*'] }
];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    // Fits brand + left tools + spacer + right tools/opacity/locale + caption.
    minWidth: 800,
    minHeight: 420,
    resizable: true,
    maximizable: true,
    minimizable: true,
    fullscreenable: true,
    frame: false,
    titleBarStyle: 'hidden',
    // Windows: keep thick frame so edges can be dragged to resize.
    thickFrame: true,
    icon: getAppIconPath(),
    backgroundColor: '#121418',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  });

  // Ensure resize/move stay enabled even after OS/theme changes.
  mainWindow.setResizable(true);
  mainWindow.setMaximizable(true);
  mainWindow.setMinimizable(true);
  mainWindow.setMovable(true);

  Menu.setApplicationMenu(null);

  // Load over localhost so YouTube iframe API accepts the page origin.
  mainWindow.loadURL(`http://127.0.0.1:${uiServerPort}/index.html`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  attachGroupMinimizeRestore(mainWindow);

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingOpenFiles.length) {
      const files = pendingOpenFiles.slice();
      pendingOpenFiles = [];
      // Slight delay so renderer listeners are bound.
      setTimeout(() => sendOpenMediaPaths(files), 250);
    }
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:state', { maximized: true });
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:state', { maximized: false });
  });
  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('window:state', { fullscreen: true });
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('window:state', { fullscreen: false });
  });

  mainWindow.on('closed', () => {
    try {
      spectrumWindow?.close();
    } catch {
      /* ignore */
    }
    spectrumWindow = null;
    try {
      historyWindow?.close();
    } catch {
      /* ignore */
    }
    historyWindow = null;
    mainWindow = null;
  });
}

function getAppIconPath() {
  return path.join(
    __dirname,
    '..',
    'asset',
    process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  );
}

function createSpectrumWindow(initPayload = {}) {
  if (spectrumWindow && !spectrumWindow.isDestroyed()) {
    spectrumWindow.focus();
    const opacityPct = Number(initPayload?.opacity);
    if (Number.isFinite(opacityPct)) {
      const value = Math.min(1, Math.max(0.2, opacityPct / 100));
      spectrumWindow.setOpacity(value);
    }
    if (initPayload && Object.keys(initPayload).length) {
      spectrumWindow.webContents.send('spectrum:message', { type: 'init', ...initPayload });
    }
    return true;
  }

  spectrumWindow = new BrowserWindow({
    width: 520,
    height: 320,
    minWidth: 320,
    minHeight: 200,
    resizable: true,
    maximizable: true,
    minimizable: true,
    fullscreenable: false,
    frame: false,
    titleBarStyle: 'hidden',
    thickFrame: true,
    // Independent window (not owned by the player) so it can move to another display.
    modal: false,
    show: false,
    backgroundColor: '#121418',
    icon: getAppIconPath(),
    title: 'Spectrum — MyVideoPlayer',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  });

  spectrumWindow.loadURL(`http://127.0.0.1:${uiServerPort}/spectrum.html`);

  attachGroupMinimizeRestore(spectrumWindow);

  spectrumWindow.once('ready-to-show', () => {
    spectrumWindow?.show();
    const opacityPct = Number(initPayload?.opacity);
    if (Number.isFinite(opacityPct)) {
      const value = Math.min(1, Math.max(0.2, opacityPct / 100));
      spectrumWindow?.setOpacity(value);
    }
    if (initPayload && Object.keys(initPayload).length) {
      spectrumWindow?.webContents.send('spectrum:message', { type: 'init', ...initPayload });
    }
  });

  spectrumWindow.on('closed', () => {
    spectrumWindow = null;
    mainWindow?.webContents.send('spectrum:hostEvent', { type: 'closed' });
  });

  return true;
}

function createHistoryWindow(initPayload = {}) {
  if (historyWindow && !historyWindow.isDestroyed()) {
    historyWindow.focus();
    const opacityPct = Number(initPayload?.opacity);
    if (Number.isFinite(opacityPct)) {
      const value = Math.min(1, Math.max(0.2, opacityPct / 100));
      historyWindow.setOpacity(value);
    }
    if (initPayload && Object.keys(initPayload).length) {
      historyWindow.webContents.send('history:message', { type: 'init', ...initPayload });
    }
    return true;
  }

  historyWindow = new BrowserWindow({
    width: 380,
    height: 560,
    minWidth: 300,
    minHeight: 280,
    resizable: true,
    maximizable: true,
    minimizable: true,
    fullscreenable: false,
    frame: false,
    titleBarStyle: 'hidden',
    thickFrame: true,
    // Independent window (not owned by the player) so it can move to another display.
    modal: false,
    show: false,
    backgroundColor: '#121418',
    icon: getAppIconPath(),
    title: 'Play list — MyVideoPlayer',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  });

  historyWindow.loadURL(`http://127.0.0.1:${uiServerPort}/history.html`);

  attachGroupMinimizeRestore(historyWindow);

  historyWindow.once('ready-to-show', () => {
    historyWindow?.show();
    const opacityPct = Number(initPayload?.opacity);
    if (Number.isFinite(opacityPct)) {
      const value = Math.min(1, Math.max(0.2, opacityPct / 100));
      historyWindow?.setOpacity(value);
    }
    if (initPayload && Object.keys(initPayload).length) {
      historyWindow?.webContents.send('history:message', { type: 'init', ...initPayload });
    }
  });

  historyWindow.on('closed', () => {
    historyWindow = null;
    mainWindow?.webContents.send('history:hostEvent', { type: 'closed' });
  });

  return true;
}

function getSubtitleCandidates(mediaPath) {
  const dir = path.dirname(mediaPath);
  const base = path.basename(mediaPath, path.extname(mediaPath));
  const candidates = ['.smi', '.SMI', '.srt', '.SRT', '.vtt', '.VTT'].map((ext) =>
    path.join(dir, base + ext)
  );
  return candidates.filter((p) => fs.existsSync(p));
}

async function readSubtitleNearMedia(mediaPath) {
  const found = getSubtitleCandidates(mediaPath);
  if (!found.length) return null;
  const subtitlePath = found[0];
  const content = fs.readFileSync(subtitlePath, 'utf8');
  return {
    path: subtitlePath,
    name: path.basename(subtitlePath),
    content,
    ext: path.extname(subtitlePath).toLowerCase()
  };
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;

  protocol.handle('localmedia', (request) => {
    try {
      return serveLocalMediaRequest(request);
    } catch (err) {
      // Last resort: try Chromium file fetch (may still be non-seekable).
      try {
        const filePath = resolveLocalMediaPath(request.url);
        return net.fetch(pathToFileURL(filePath).href, { bypassCustomProtocolHandlers: true });
      } catch {
        return new Response(String(err?.message || err), { status: 500 });
      }
    }
  });

  await startUiServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// macOS: open file from Finder
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (!filePath) return;
  const ext = path.extname(filePath).toLowerCase();
  if (!OPENABLE_MEDIA_EXTS.has(ext)) return;
  if (mainWindow && !mainWindow.isDestroyed()) sendOpenMediaPaths([path.resolve(filePath)]);
  else pendingOpenFiles.push(path.resolve(filePath));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try {
    void stopRtspRecord();
  } catch {
    /* ignore */
  }
  try {
    stopRtspStream();
  } catch {
    /* ignore */
  }
  try {
    uiServer?.close();
  } catch {
    /* ignore */
  }
  uiServer = null;
});

ipcMain.handle('app:getInfo', () => ({
  name: APP_NAME,
  version: APP_VERSION,
  author: AUTHOR,
  email: AUTHOR_EMAIL,
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  isElectron: true
}));

// Sync persist so renderer modules can load settings/recent before async init.
ipcMain.on('persist:getItem', (event, key) => {
  event.returnValue = persistStore.getItem(key);
});
ipcMain.on('persist:setItem', (event, key, value) => {
  event.returnValue = persistStore.setItem(key, value);
});
ipcMain.on('persist:removeItem', (event, key) => {
  event.returnValue = persistStore.removeItem(key);
});

ipcMain.handle('window:minimize', () => minimizeAllAppWindows());

ipcMain.handle('window:maximizeToggle', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  }
  mainWindow.maximize();
  return true;
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

ipcMain.handle('window:setMinimumSize', (event, width, height) => {
  const win = resolveSenderWindow(event);
  if (!win || win.isDestroyed()) return false;
  // Allow compact-mode floors below the normal toolbar minimum.
  const minW = Math.max(320, Math.round(Number(width) || 800));
  const minH = Math.max(200, Math.round(Number(height) || 420));
  win.setMinimumSize(minW, minH);
  const [cw, ch] = win.getSize();
  if (cw < minW || ch < minH) {
    win.setSize(Math.max(cw, minW), Math.max(ch, minH));
  }
  return true;
});

ipcMain.handle('window:getBounds', (event) => {
  const win = resolveSenderWindow(event);
  if (!win || win.isDestroyed()) return null;
  return win.getBounds();
});

ipcMain.handle('window:setBounds', (event, bounds) => {
  const win = resolveSenderWindow(event);
  if (!win || win.isDestroyed() || !bounds || typeof bounds !== 'object') {
    return false;
  }
  if (win.isMaximized()) win.unmaximize();
  const [minW, minH] = win.getMinimumSize();
  const next = {
    x: Math.round(Number(bounds.x)),
    y: Math.round(Number(bounds.y)),
    width: Math.max(minW || 320, Math.round(Number(bounds.width) || 480)),
    height: Math.max(minH || 200, Math.round(Number(bounds.height) || 300))
  };
  if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) {
    const cur = win.getBounds();
    next.x = cur.x;
    next.y = cur.y;
  }
  win.setBounds(next);
  return true;
});

ipcMain.handle('window:setOpacity', (event, opacity) => {
  const win = resolveSenderWindow(event);
  if (!win || win.isDestroyed()) return 1;
  const value = Math.min(1, Math.max(0.2, Number(opacity)));
  if (!Number.isFinite(value)) return win.getOpacity();
  win.setOpacity(value);
  return win.getOpacity();
});

ipcMain.handle('window:getOpacity', (event) => {
  const win = resolveSenderWindow(event);
  if (!win || win.isDestroyed()) return 1;
  return win.getOpacity();
});

ipcMain.handle('spectrum:setOpacity', (event, opacity) => {
  // Alias: always applies to the spectrum window when present.
  if (!spectrumWindow || spectrumWindow.isDestroyed()) {
    const win = resolveSenderWindow(event);
    if (!win || win.isDestroyed()) return 1;
    const value = Math.min(1, Math.max(0.2, Number(opacity)));
    if (!Number.isFinite(value)) return win.getOpacity();
    win.setOpacity(value);
    return win.getOpacity();
  }
  const value = Math.min(1, Math.max(0.2, Number(opacity)));
  if (!Number.isFinite(value)) return spectrumWindow.getOpacity();
  spectrumWindow.setOpacity(value);
  return spectrumWindow.getOpacity();
});

ipcMain.handle('spectrum:getOpacity', () => {
  if (!spectrumWindow || spectrumWindow.isDestroyed()) return 1;
  return spectrumWindow.getOpacity();
});

/** @type {{ win: BrowserWindow, offsetX: number, offsetY: number } | null} */
let windowMoveDrag = null;

function resolveSenderWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) || mainWindow;
}

ipcMain.on('window:beginDrag', (event) => {
  const win = resolveSenderWindow(event);
  if (!win || win.isDestroyed() || win.isFullScreen()) {
    windowMoveDrag = null;
    return;
  }

  try {
    win.setMovable(true);
  } catch {
    /* ignore */
  }

  const cursor = screen.getCursorScreenPoint();

  if (win.isMaximized()) {
    const before = win.getBounds();
    win.unmaximize();
    const after = win.getBounds();
    const ratio = before.width > 0 ? (cursor.x - before.x) / before.width : 0.5;
    const x = Math.round(cursor.x - after.width * Math.min(1, Math.max(0, ratio)));
    const y = Math.round(cursor.y - Math.min(24, after.height / 3));
    win.setPosition(x, y);
  }

  const [wx, wy] = win.getPosition();
  windowMoveDrag = {
    win,
    offsetX: cursor.x - wx,
    offsetY: cursor.y - wy
  };
});

ipcMain.on('window:updateDrag', (event, screenX, screenY) => {
  const drag = windowMoveDrag;
  if (!drag?.win || drag.win.isDestroyed()) return;
  const senderWin = resolveSenderWindow(event);
  if (senderWin && senderWin !== drag.win) return;

  // Prefer live cursor point (more reliable than renderer screenX/Y on some DPI setups).
  const cursor = screen.getCursorScreenPoint();
  const x = Number.isFinite(Number(screenX)) ? Number(screenX) : cursor.x;
  const y = Number.isFinite(Number(screenY)) ? Number(screenY) : cursor.y;
  drag.win.setPosition(Math.round(x - drag.offsetX), Math.round(y - drag.offsetY));
});

ipcMain.on('window:endDrag', () => {
  windowMoveDrag = null;
});

ipcMain.handle('spectrum:open', (_evt, initPayload) => createSpectrumWindow(initPayload || {}));
ipcMain.handle('spectrum:close', () => {
  if (spectrumWindow && !spectrumWindow.isDestroyed()) {
    spectrumWindow.close();
  }
  spectrumWindow = null;
  return true;
});
ipcMain.handle('spectrum:focus', () => {
  if (spectrumWindow && !spectrumWindow.isDestroyed()) {
    spectrumWindow.focus();
    return true;
  }
  return false;
});
ipcMain.on('spectrum:toWindow', (_evt, message) => {
  if (spectrumWindow && !spectrumWindow.isDestroyed()) {
    spectrumWindow.webContents.send('spectrum:message', message);
  }
});
ipcMain.on('spectrum:toHost', (_evt, message) => {
  mainWindow?.webContents.send('spectrum:hostEvent', message);
});

ipcMain.handle('history:open', (_evt, initPayload) => createHistoryWindow(initPayload || {}));
ipcMain.handle('history:close', () => {
  if (historyWindow && !historyWindow.isDestroyed()) {
    historyWindow.close();
  }
  historyWindow = null;
  return true;
});
ipcMain.handle('history:focus', () => {
  if (historyWindow && !historyWindow.isDestroyed()) {
    historyWindow.focus();
    return true;
  }
  return false;
});
ipcMain.on('history:toWindow', (_evt, message) => {
  if (historyWindow && !historyWindow.isDestroyed()) {
    historyWindow.webContents.send('history:message', message);
  }
});
ipcMain.on('history:toHost', (_evt, message) => {
  mainWindow?.webContents.send('history:hostEvent', message);
});

async function mediaFromPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return { ok: false, error: '파일을 찾을 수 없습니다.', path: resolved };
  }
  const subtitle = await readSubtitleNearMedia(resolved);
  const stat = fs.statSync(resolved);
  return {
    ok: true,
    path: resolved,
    name: path.basename(resolved),
    url: toLocalMediaUrl(resolved),
    size: stat.size,
    ext: path.extname(resolved).toLowerCase(),
    subtitle
  };
}

ipcMain.handle('dialog:openMedia', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Media File',
    defaultPath: getRememberedDir(DIALOG_OPEN_DIR_KEY),
    properties: ['openFile'],
    filters: VIDEO_FILTERS
  });
  if (result.canceled || !result.filePaths.length) return null;
  rememberDirFromFile(DIALOG_OPEN_DIR_KEY, result.filePaths[0]);
  const media = await mediaFromPath(result.filePaths[0]);
  return media?.ok ? media : null;
});

ipcMain.handle('media:openPath', async (_evt, filePath) => {
  const media = await mediaFromPath(filePath);
  if (media?.ok && media.path) rememberDirFromFile(DIALOG_OPEN_DIR_KEY, media.path);
  return media;
});

ipcMain.handle('media:makeCompatible', async (evt, filePath, options = {}) => {
  const sendProgress = (progress) => {
    try {
      evt.sender.send('media:compatProgress', progress);
    } catch {
      /* ignore */
    }
  };
  try {
    const result = await makeChromiumCompatible(filePath, sendProgress, options || {});
    if (!result?.ok) return result;
    const media = await mediaFromPath(result.path);
    if (!media?.ok) {
      return { ok: false, error: media?.error || '변환된 파일을 열 수 없습니다.' };
    }
    return {
      ...media,
      ok: true,
      cached: Boolean(result.cached),
      mode: result.mode || options?.mode || 'soft',
      repairedFrom: path.resolve(filePath)
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('dialog:openSubtitle', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Subtitle File',
    defaultPath: getRememberedDir(DIALOG_OPEN_DIR_KEY),
    properties: ['openFile'],
    filters: [
      { name: 'Subtitles', extensions: ['smi', 'srt', 'vtt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return null;
  const subtitlePath = result.filePaths[0];
  rememberDirFromFile(DIALOG_OPEN_DIR_KEY, subtitlePath);
  return {
    path: subtitlePath,
    name: path.basename(subtitlePath),
    content: fs.readFileSync(subtitlePath, 'utf8'),
    ext: path.extname(subtitlePath).toLowerCase()
  };
});

ipcMain.handle('fs:findSubtitle', async (_evt, mediaPath) => {
  if (!mediaPath || typeof mediaPath !== 'string') return null;
  return readSubtitleNearMedia(mediaPath);
});

ipcMain.handle('shell:openExternal', async (_evt, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('mailto:'))) {
    await shell.openExternal(url);
  }
});

ipcMain.handle('theme:getSystem', () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'));

ipcMain.handle('theme:setSource', (_evt, source) => {
  if (source === 'dark' || source === 'light' || source === 'system') {
    nativeTheme.themeSource = source;
  }
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

ipcMain.handle('rtsp:open', (_evt, input) => {
  const result = openRtspStream(input);
  if (!result.ok) return result;
  if (!uiServerPort) {
    stopRtspStream();
    return { ok: false, error: 'UI server is not ready' };
  }
  return {
    ok: true,
    id: result.id,
    url: result.url,
    name: result.name,
    playUrl: `http://127.0.0.1:${uiServerPort}${result.path}`,
    isRtsp: true
  };
});

ipcMain.handle('rtsp:stop', () => stopRtspStream());

ipcMain.handle('rtsp:getActive', () => getActiveRtsp());

ipcMain.handle('rtsp:isUrl', (_evt, input) => isRtspUrl(input));

ipcMain.handle('rtsp:getRecording', () => getRtspRecording());

ipcMain.handle('rtsp:startRecord', async (_evt, payload) => {
  const input = payload?.url || payload?.input;
  const url = String(input || '').trim();
  if (!isRtspUrl(url)) {
    return { ok: false, error: '유효한 RTSP 링크가 아닙니다.' };
  }
  if (getRtspRecording()) {
    return { ok: false, error: '이미 RTSP 녹화가 진행 중입니다.', recording: getRtspRecording() };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  let host = 'rtsp';
  try {
    host = new URL(url).hostname || host;
  } catch {
    /* keep fallback */
  }
  const suggestedName = sanitizeFilename(`rtsp-${host}-${stamp}`) + '.mp4';

  const save = await dialog.showSaveDialog(mainWindow, {
    title: 'Save RTSP Stream',
    defaultPath: path.join(getRememberedDir(DIALOG_SAVE_DIR_KEY), suggestedName),
    filters: [
      { name: 'MP4 Video', extensions: ['mp4'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (save.canceled || !save.filePath) return { ok: false, cancelled: true };
  rememberDirFromFile(DIALOG_SAVE_DIR_KEY, save.filePath);

  const result = startRtspRecord(url, save.filePath, (progress) => {
    mainWindow?.webContents.send('rtsp:recordProgress', progress);
  });
  return result;
});

ipcMain.handle('rtsp:stopRecord', async (_evt, options = {}) => {
  const result = await stopRtspRecord(options || {});
  if (result?.cancelled) {
    mainWindow?.webContents.send('rtsp:recordProgress', {
      phase: 'cancelled',
      elapsed: result.elapsed,
      elapsedMs: result.elapsedMs
    });
    return result;
  }
  if (result?.ok) {
    let size = 0;
    let name = '';
    try {
      if (result.path && fs.existsSync(result.path)) {
        size = fs.statSync(result.path).size;
        name = path.basename(result.path);
      }
    } catch {
      /* ignore */
    }
    const payload = {
      ...result,
      name: name || (result.path ? path.basename(result.path) : ''),
      size
    };
    mainWindow?.webContents.send('rtsp:recordProgress', {
      phase: 'done',
      path: payload.path,
      name: payload.name,
      size: payload.size,
      elapsed: payload.elapsed,
      elapsedMs: payload.elapsedMs
    });
    return payload;
  }
  return result;
});

ipcMain.handle('youtube:parse', (_evt, input) => {
  const id = extractVideoId(input);
  const url = normalizeWatchUrl(input);
  return id ? { id, url } : null;
});

ipcMain.handle('youtube:info', async (_evt, input) => {
  try {
    return { ok: true, info: await getYouTubeInfo(input) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('youtube:download', async (_evt, payload) => {
  if (downloadInProgress) {
    return { ok: false, error: '이미 다운로드가 진행 중입니다.' };
  }
  const input = payload?.url || payload?.input;
  const url = normalizeWatchUrl(input);
  if (!url) return { ok: false, error: '유효한 YouTube 링크가 아닙니다.' };

  let suggestedName = sanitizeFilename(payload?.title || extractVideoId(url) || 'youtube-video') + '.mp4';
  try {
    if (!payload?.title) {
      const info = await getYouTubeInfo(url);
      suggestedName = sanitizeFilename(info.title) + '.mp4';
    }
  } catch {
    /* keep fallback name */
  }

  const save = await dialog.showSaveDialog(mainWindow, {
    title: 'Save YouTube Video',
    defaultPath: path.join(getRememberedDir(DIALOG_SAVE_DIR_KEY), suggestedName),
    filters: [
      { name: 'MP4 Video', extensions: ['mp4'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (save.canceled || !save.filePath) return { ok: false, cancelled: true };
  rememberDirFromFile(DIALOG_SAVE_DIR_KEY, save.filePath);

  downloadInProgress = true;
  mainWindow?.webContents.send('youtube:downloadProgress', {
    percent: 0,
    message: 'Starting download…'
  });

  const runDownload = async (cookiesPath, opts = {}) =>
    downloadYouTube(
      url,
      save.filePath,
      (progress) => {
        mainWindow?.webContents.send('youtube:downloadProgress', progress);
      },
      { cookiesPath, ...opts }
    );

  try {
    let cookies = null;
    try {
      cookies = await writeYoutubeCookiesFile();
    } catch {
      cookies = null;
    }

    let result;
    try {
      // Prefer adaptive DASH via yt-dlp (works for most public videos without login).
      result = await runDownload(cookies?.authenticated ? cookies.path : null, {
        skipInnertubeFallback: true
      });
    } catch (err) {
      if (err?.cancelled) throw err;
      // Some videos need a signed-in session (age-gate / bot check). Prompt once.
      mainWindow?.webContents.send('youtube:downloadProgress', {
        percent: null,
        message: 'Sign in to YouTube required for this download…'
      });
      const signedIn = await ensureYoutubeCookies({
        parentWindow: mainWindow,
        forcePrompt: true
      });
      if (!signedIn?.authenticated || !signedIn.path) throw err;
      mainWindow?.webContents.send('youtube:downloadProgress', {
        percent: null,
        message: 'Continuing download with signed-in session…'
      });
      result = await runDownload(signedIn.path, { skipInnertubeFallback: true });
    }

    let size = 0;
    try {
      if (result.path && fs.existsSync(result.path)) {
        size = fs.statSync(result.path).size;
      }
    } catch {
      /* ignore */
    }
    const finalSize = result.size != null ? result.size : size;
    return {
      ok: true,
      path: result.path,
      name: result.name || path.basename(result.path || save.filePath),
      size: finalSize,
      engine: result.engine,
      stopped: Boolean(result.stopped),
      partial: Boolean(result.partial)
    };
  } catch (err) {
    if (err?.cancelled) {
      return { ok: false, cancelled: true };
    }
    return { ok: false, error: err.message || String(err) };
  } finally {
    downloadInProgress = false;
  }
});

ipcMain.handle('youtube:cancelDownload', (_event, options) =>
  stopYouTubeDownload(options || { discard: true })
);
