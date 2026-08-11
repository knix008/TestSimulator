const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
  Tray,
  Notification,
  nativeTheme,
  protocol,
  net,
  screen,
  session,
  clipboard
} = require('electron');

// Allow multiple processes for local testing:
// - unpackaged (`npm start`) always
// - packaged / any mode with `--multi` or MyVideoPhone_MULTI=1
// Single instance is the default everywhere (a second process would fight over
// the camera device and the fixed phone port). Multi-instance stays available
// for deliberate local testing via --multi or MyVideoPhone_MULTI=1.
const allowMultipleInstances =
  process.argv.includes('--multi') ||
  ['1', 'true', 'yes'].includes(String(process.env.MyVideoPhone_MULTI || '').toLowerCase());

let gotSingleInstanceLock = true;
// Stable AUMID is required for Windows toast notifications (Start Menu shortcut).
// Do not use a per-pid id — toasts are silently dropped without a matching shortcut.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.shkwon.myvideophone');
}
if (allowMultipleInstances) {
  // Separate storage/cache per process so two test instances do not collide.
  const baseUserData = app.getPath('userData');
  app.setPath('userData', `${baseUserData}-pid-${process.pid}`);
} else {
  // Production default: one running process; second launch focuses the first.
  gotSingleInstanceLock = app.requestSingleInstanceLock();
  if (!gotSingleInstanceLock) {
    // Immediate hard exit — do not create a second window / tray.
    app.exit(0);
    process.exit(0);
  }
}

// Keep the terminal quiet unless explicitly debugging (MyVideoPhone_VERBOSE=1).
// Chromium otherwise prints benign decoder noise like "Unsupported pixel format: -1".
const VERBOSE_LOGS = ['1', 'true', 'yes'].includes(
  String(process.env.MyVideoPhone_VERBOSE || '').toLowerCase()
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
const {
  PHONE_PORT,
  RING_TIMEOUT_MS,
  startPhoneServer,
  stopPhoneServer,
  setPhonePublishEnabled,
  getPhoneInfo,
  warmPublisher,
  setIncomingCallHandler,
  setPeerDisconnectHandler,
  respondToCall,
  clearAcceptedSessions,
  allowCallbackFrom,
  grantLiveToken,
  setLanCallActive,
  getCallPeerIps,
  getPhonePort,
  setPhoneMic,
  setPublishCaptureHandler,
  setPublishConfig,
  setPublishCaptureStatus,
  feedPublishChunk
} = require('./phone-stream');

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
const persistStore = require('./persist-store');
const { makeChromiumCompatible } = require('./media-compat');

function sanitizeFilename(name) {
  return String(name || 'media')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'media';
}

const APP_NAME = 'MyVideoPhone';
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

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {Tray | null} */
let appTray = null;
/** When true, window close / tray Quit really exits the process. */
let isQuitting = false;
/** Show “still running in tray” toast at most once per session. */
let trayHideHintShown = false;
/** @type {http.Server | null} */
let uiServer = null;
let uiServerPort = 0;

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

function listenOnce(server, port) {
  return new Promise((resolve, reject) => {
    const onListening = () => {
      server.off('error', onError);
      resolve(server.address().port);
    };
    const onError = (err) => {
      server.off('listening', onListening);
      reject(err);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    // Local UI/media bridge only — phone LAN port is separate (phone-stream).
    server.listen(port, '127.0.0.1');
  });
}

/** Loopback host names Chromium treats differently from 127.0.0.1. */
function canonicalizeLoopbackHost(host) {
  const h = String(host || '').trim().toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '[::1]' || h === '0.0.0.0') return '127.0.0.1';
  return String(host || '').trim();
}

/** Only proxy phone live streams to loopback / private LAN (SSRF guard). */
function isAllowedPhoneProxyHost(host) {
  const h = canonicalizeLoopbackHost(host).toLowerCase();
  if (!h) return false;
  if (h === '127.0.0.1') return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => !Number.isFinite(n) || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/**
 * Same-origin bridge for peer / local phone /live.
 * Avoids Chromium “Media load rejected by URL safety check” when the UI is on
 * 127.0.0.1 and the stream URL uses localhost (or another host:port).
 */
function proxyPhoneLiveHttp(req, res, reqUrl) {
  const host = canonicalizeLoopbackHost(reqUrl.searchParams.get('host') || '');
  const port = Math.trunc(Number(reqUrl.searchParams.get('port')) || PHONE_PORT);
  const token = String(reqUrl.searchParams.get('token') || '').trim();

  if (!isAllowedPhoneProxyHost(host) || !Number.isFinite(port) || port < 1 || port > 65535) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad phone proxy target');
    return;
  }

  const targetPath = token ? `/live?token=${encodeURIComponent(token)}` : '/live';
  const upstream = http.request(
    {
      hostname: host,
      port,
      path: targetPath,
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: {
        Accept: req.headers.accept || '*/*',
        Connection: 'keep-alive'
      }
    },
    (up) => {
      const status = up.statusCode || 502;
      const headers = {
        'Content-Type': up.headers['content-type'] || 'video/mp4',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      };
      res.writeHead(status, headers);
      // Stream chunk-by-chunk (avoid pipe buffering that stalls live MSE).
      up.on('data', (chunk) => {
        try {
          if (!res.writableEnded) res.write(chunk);
        } catch {
          try {
            up.destroy();
          } catch {
            /* ignore */
          }
        }
      });
      up.on('end', () => {
        try {
          if (!res.writableEnded) res.end();
        } catch {
          /* ignore */
        }
      });
      up.on('error', () => {
        try {
          if (!res.writableEnded) res.end();
        } catch {
          /* ignore */
        }
      });
    }
  );

  upstream.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(String(err?.message || err || 'Phone proxy failed'));
      return;
    }
    try {
      res.end();
    } catch {
      /* ignore */
    }
  });

  req.on('close', () => {
    try {
      upstream.destroy();
    } catch {
      /* ignore */
    }
  });
  upstream.end();
}

function buildUiPhonePlayUrl({ host, port, token = '' } = {}) {
  if (!uiServerPort) return '';
  const h = canonicalizeLoopbackHost(host);
  const p = Math.trunc(Number(port) || PHONE_PORT);
  if (!isAllowedPhoneProxyHost(h) || !Number.isFinite(p) || p < 1 || p > 65535) return '';
  const params = new URLSearchParams({
    host: h,
    port: String(p)
  });
  if (token) params.set('token', String(token));
  return `http://127.0.0.1:${uiServerPort}/__phone/live?${params.toString()}`;
}

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

        // Phone /live proxy (same origin as the renderer UI).
        if (pathname === '/__phone/live') {
          proxyPhoneLiveHttp(req, res, reqUrl);
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
    // Ephemeral loopback port — not shown to users.
    listenOnce(uiServer, 0).then((port) => {
      uiServerPort = port;
      resolve(port);
    }, reject);
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

function allowVideoPhoneMediaPermissions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    if (
      permission === 'media' ||
      permission === 'mediaKeySystem' ||
      permission === 'display-capture' ||
      permission === 'clipboard-sanitized-write' ||
      permission === 'clipboard-read'
    ) {
      callback(true);
      return;
    }
    callback(false);
  });
  if (typeof ses.setDevicePermissionHandler === 'function') {
    ses.setDevicePermissionHandler((details) => {
      const deviceType = details?.deviceType || details?.mediaType;
      return deviceType === 'camera' || deviceType === 'microphone' || deviceType === 'video' || deviceType === 'audio';
    });
  }
}

function isKoreanLocale() {
  try {
    return String(app.getLocale() || '').toLowerCase().startsWith('ko');
  } catch {
    return false;
  }
}

function getAppIconPath() {
  return path.join(
    __dirname,
    '..',
    'asset',
    process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  );
}

function getTrayIconPath() {
  const root = path.join(__dirname, '..', 'asset');
  if (process.platform === 'win32') {
    return path.join(root, 'icon.ico');
  }
  const png256 = path.join(root, 'icon-256.png');
  if (fs.existsSync(png256)) return png256;
  return path.join(root, 'icon.png');
}

/**
 * Windows toast notifications need a Start Menu .lnk whose AppUserModelID matches
 * app.setAppUserModelId. Unpackaged `npm start` has no installer shortcut — create one.
 */
function ensureWindowsNotificationShortcut() {
  if (process.platform !== 'win32') return;
  try {
    const programs = path.join(
      app.getPath('appData'),
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs'
    );
    fs.mkdirSync(programs, { recursive: true });
    const shortcutPath = path.join(programs, `${APP_NAME}.lnk`);
    const iconPath = getAppIconPath();
    const shortcut = {
      target: process.execPath,
      cwd: path.dirname(process.execPath),
      description: APP_NAME,
      appUserModelId: 'com.shkwon.myvideophone',
      icon: iconPath,
      iconIndex: 0
    };
    if (!app.isPackaged) {
      shortcut.args = `"${app.getAppPath()}"`;
      shortcut.cwd = app.getAppPath();
    }
    // Refresh link so AUMID stays correct after upgrades / path changes.
    shell.writeShortcutLink(shortcutPath, fs.existsSync(shortcutPath) ? 'update' : 'create', shortcut);
  } catch (err) {
    if (VERBOSE_LOGS) console.warn('[notify] shortcut:', err?.message || err);
  }
}

function showAppNotification({ title, body, silent = false, sticky = false } = {}) {
  if (!Notification.isSupported()) {
    return { ok: false, error: 'Notifications are not supported on this system.' };
  }
  try {
    /** @type {Electron.NotificationConstructorOptions} */
    const opts = {
      title: title || APP_NAME,
      body: body || '',
      icon: getAppIconPath(),
      silent: Boolean(silent),
      urgency: 'critical'
    };
    // Keep incoming-call toasts visible until dismissed (Windows).
    if (sticky && process.platform === 'win32') {
      opts.timeoutType = 'never';
    }
    const notification = new Notification(opts);
    notification.on('click', () => {
      showMainWindow();
    });
    notification.show();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

function notifyWindowVisibility(state) {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('window:visibility', state);
  } catch {
    /* ignore */
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  try {
    mainWindow.flashFrame(false);
  } catch {
    /* ignore */
  }
  // Resume LAN camera publish when the window is visible again.
  setPhonePublishEnabled(true);
  notifyWindowVisibility({ visible: true });
}

function hideToTray({ notify = false } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isFullScreen()) {
    mainWindow.setFullScreen(false);
  }
  // Release webcam in the renderer before hiding (tray must not keep the camera on).
  setPhonePublishEnabled(false);
  notifyWindowVisibility({ visible: false, reason: 'tray' });
  mainWindow.hide();

  if (notify && !trayHideHintShown) {
    trayHideHintShown = true;
    const ko = isKoreanLocale();
    showAppNotification({
      title: APP_NAME,
      body: ko
        ? '트레이에서 계속 실행 중입니다. 종료는 트레이 메뉴의 “종료”를 사용하세요.'
        : 'Still running in the system tray. Use Quit in the tray menu to exit.'
    });
  }
}

function quitApplication() {
  isQuitting = true;
  try {
    if (appTray) {
      appTray.destroy();
      appTray = null;
    }
  } catch {
    /* ignore */
  }
  app.quit();
}

function buildTrayMenu() {
  const ko = isKoreanLocale();
  return Menu.buildFromTemplate([
    {
      label: ko ? 'MyVideoPhone 열기' : 'Open MyVideoPhone',
      click: () => showMainWindow()
    },
    { type: 'separator' },
    {
      label: ko ? '종료' : 'Quit',
      click: () => quitApplication()
    }
  ]);
}

function createTray() {
  if (appTray) return appTray;
  try {
    appTray = new Tray(getTrayIconPath());
  } catch (err) {
    console.error('[tray] failed to create tray icon:', err);
    return null;
  }
  appTray.setToolTip(APP_NAME);
  appTray.setContextMenu(buildTrayMenu());
  appTray.on('click', () => {
    // Windows/Linux: single click toggles visibility.
    if (process.platform === 'darwin') return;
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      hideToTray({ notify: false });
    } else {
      showMainWindow();
    }
  });
  appTray.on('double-click', () => {
    showMainWindow();
  });
  appTray.on('right-click', () => {
    appTray?.setContextMenu(buildTrayMenu());
    appTray?.popUpContextMenu();
  });
  return appTray;
}

function createWindow() {
  allowVideoPhoneMediaPermissions();

  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow();
    return;
  }

  mainWindow = new BrowserWindow({
    // Portrait video-phone chrome (≈9:16).
    width: 420,
    height: 780,
    // Raised after load by renderer measure of full toolbar content.
    minWidth: 420,
    minHeight: 640,
    resizable: true,
    maximizable: true,
    minimizable: true,
    fullscreenable: false,
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

  mainWindow.loadURL(`http://127.0.0.1:${uiServerPort}/index.html`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

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

  // Caption ✕ / Alt+F4: hide to tray instead of quitting.
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hideToTray({ notify: true });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function focusExistingInstance(argv = []) {
  const files = extractMediaPathsFromArgv(argv);
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow();
    if (files.length) sendOpenMediaPaths(files);
    return;
  }
  if (files.length) pendingOpenFiles.push(...files);
  if (uiServerPort) {
    createWindow();
    showMainWindow();
  }
}

if (gotSingleInstanceLock) {
  // Another launch while we are already running → focus this instance (incl. from tray).
  app.on('second-instance', (_event, argv) => {
    focusExistingInstance(argv);
  });
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) {
    app.exit(0);
    return;
  }

  ensureWindowsNotificationShortcut();

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
  try {
    await startPhoneServer();
  } catch (err) {
    console.error('[phone] failed to start LAN phone server:', err);
  }
  setIncomingCallHandler((info) => {
    const ko = isKoreanLocale();
    const from = String(info?.fromLabel || info?.fromIp || '').trim();
    // Toast BEFORE focusing the window — Windows suppresses notifications for the
    // foreground app, so showMainWindow() first would hide the incoming-call toast.
    showAppNotification({
      title: ko ? '수신 요청' : 'Incoming call',
      body: from
        ? ko
          ? `${from} 에서 영상 전화를 요청했습니다.`
          : `${from} is requesting a video call.`
        : ko
          ? '영상 전화 수신 요청'
          : 'Incoming video call request',
      sticky: true
    });

    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.flashFrame(true);
        } catch {
          /* ignore */
        }
      }
      showMainWindow();
    } catch {
      /* ignore */
    }
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('phone:incoming', info);
      }
    } catch {
      /* ignore */
    }
  });
  setPeerDisconnectHandler((info) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('phone:peerLeft', info || {});
      }
    } catch {
      /* ignore */
    }
  });
  // The publisher (main) asks the renderer to start/stop camera capture; the
  // renderer streams webm chunks back over 'phone:publishChunk'.
  setPublishCaptureHandler((action, generation) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('phone:publishSignal', action, generation);
      }
    } catch {
      /* ignore */
    }
  });
  createTray();
  createWindow();

  app.on('activate', () => {
    // macOS dock click — show existing window or recreate.
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    else showMainWindow();
  });
});

// macOS: open file from Finder
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (!filePath) return;
  const ext = path.extname(filePath).toLowerCase();
  if (!OPENABLE_MEDIA_EXTS.has(ext)) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow();
    sendOpenMediaPaths([path.resolve(filePath)]);
  } else pendingOpenFiles.push(path.resolve(filePath));
});

// Keep running in the tray when windows are closed/hidden. Exit only via tray Quit.
app.on('window-all-closed', () => {
  /* intentionally empty — do not app.quit() */
});

app.on('before-quit', () => {
  isQuitting = true;
  try {
    if (appTray) {
      appTray.destroy();
      appTray = null;
    }
  } catch {
    /* ignore */
  }
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
    stopPhoneServer();
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

ipcMain.handle('app:getInfo', () => {
  const phone = getPhoneInfo();
  const phonePort = phone.port || PHONE_PORT;
  // Prefer same-origin UI proxy so <video> is not blocked by Chromium URL safety.
  const proxiedLive =
    buildUiPhonePlayUrl({ host: '127.0.0.1', port: phonePort }) || phone.localLiveUrl;
  return {
    name: APP_NAME,
    version: APP_VERSION,
    author: AUTHOR,
    email: AUTHOR_EMAIL,
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    isElectron: true,
    uiPort: uiServerPort,
    phonePort,
    phoneDefaultPort: PHONE_PORT,
    phoneLiveUrl: proxiedLive,
    lanAddresses: phone.lanAddresses,
    peerHints: phone.peerHints
  };
});

ipcMain.handle('phone:setPublish', (_event, enabled) => setPhonePublishEnabled(Boolean(enabled)));
ipcMain.handle('phone:getInfo', () => getPhoneInfo());

ipcMain.handle('phone:respond', (_event, payload = {}) => {
  const callId = String(payload?.callId || '');
  const accepted = Boolean(payload?.accepted);
  return respondToCall(callId, accepted);
});

ipcMain.handle('phone:clearSessions', async () => {
  // Caller hang-up: notify every known peer BEFORE wiping session state.
  // (Renderer activePeer alone is not enough — Accept side uses socket IP.)
  const peers = getCallPeerIps();
  const port = getPhonePort() || PHONE_PORT;
  await Promise.all(
    peers.map((host) =>
      phoneHttpJson('POST', host, port, '/bye', { app: APP_NAME, reason: 'hangup' }, 1200).catch(() => ({
        ok: false
      }))
    )
  );
  clearAcceptedSessions();
  return { ok: true, notified: peers };
});

ipcMain.handle('phone:setCallActive', (_event, active) => setLanCallActive(Boolean(active)));

ipcMain.handle('phone:setMic', (_event, payload = {}) =>
  setPhoneMic({
    enabled: payload?.enabled,
    volume: payload?.volume,
    restart: payload?.restart
  })
);

ipcMain.handle('phone:publishConfig', (_event, config = {}) =>
  setPublishConfig({ hasAudio: config?.hasAudio, mimeType: config?.mimeType })
);

// High-frequency webm chunks from the renderer's MediaRecorder → ffmpeg stdin.
ipcMain.on('phone:publishChunk', (_event, generation, chunk) => {
  try {
    feedPublishChunk(generation, chunk);
  } catch {
    /* ignore — publisher may have torn down */
  }
});

ipcMain.on('phone:publishStatus', (_event, status) => {
  try {
    setPublishCaptureStatus(status);
  } catch {
    /* ignore */
  }
});

function phoneHttpJson(method, host, port, pathName, bodyObj, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const body = bodyObj ? JSON.stringify(bodyObj) : '';
    const req = http.request(
      {
        hostname: host,
        port,
        path: pathName,
        method,
        headers: body
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body)
            }
          : { Accept: 'application/json' },
        timeout: timeoutMs
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch {
            json = null;
          }
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            json
          });
        });
      }
    );
    req.on('timeout', () => {
      try {
        req.destroy();
      } catch {
        /* ignore */
      }
      resolve({ ok: false, error: 'timeout', reachable: false });
    });
    req.on('error', (err) => {
      resolve({ ok: false, error: String(err?.message || err), reachable: false });
    });
    if (body) req.write(body);
    req.end();
  });
}

/** Tell peer we hung up so their UI leaves “in call” immediately. */
ipcMain.handle('phone:bye', async (_event, payload = {}) => {
  const host = canonicalizeLoopbackHost(payload?.host || '');
  const port = Math.trunc(Number(payload?.port) || PHONE_PORT);
  if (!host || !Number.isFinite(port) || port < 1 || port > 65535) {
    return { ok: false, error: 'invalid target' };
  }
  // Retry once — UDP-like loss on busy LAN / sleeping NICs.
  let last = await phoneHttpJson('POST', host, port, '/bye', { app: APP_NAME, reason: 'hangup' }, 1500);
  if (!last.ok) {
    last = await phoneHttpJson('POST', host, port, '/bye', { app: APP_NAME, reason: 'hangup' }, 1500);
  }
  return last;
});

/** Probe peer /status — used to clear stuck “in call” when /bye was missed. */
ipcMain.handle('phone:peerStatus', async (_event, payload = {}) => {
  const host = canonicalizeLoopbackHost(payload?.host || '');
  const port = Math.trunc(Number(payload?.port) || PHONE_PORT);
  if (!host || !Number.isFinite(port) || port < 1 || port > 65535) {
    return { ok: false, reachable: false, inCall: false };
  }
  const result = await phoneHttpJson('GET', host, port, '/status', null, 1500);
  if (!result.ok) {
    return { ok: false, reachable: false, inCall: false, error: result.error };
  }
  return {
    ok: true,
    reachable: true,
    inCall: Boolean(result.json?.inCall),
    statusCode: result.statusCode
  };
});

/** Dial peer: POST /ring and wait for Accept / Reject / timeout. */
ipcMain.handle('phone:ring', async (_event, payload = {}) => {
  const host = canonicalizeLoopbackHost(payload?.host || '');
  const port = Math.trunc(Number(payload?.port) || PHONE_PORT);
  if (!host || !Number.isFinite(port) || port < 1 || port > 65535) {
    return { ok: false, accepted: false, error: 'invalid target' };
  }

  const phone = getPhoneInfo();
  const fromLabel = phone.peerHints?.[0] || phone.lanAddresses?.[0] || '';
  const url = `http://${host}:${port}/ring`;
  // Peer may pull our camera after they Accept — token + IP allow (backup).
  const callbackToken = grantLiveToken(host, RING_TIMEOUT_MS + 120000);
  allowCallbackFrom(host, RING_TIMEOUT_MS + 120000);
  setLanCallActive(true);
  // Open the camera encoder while ringing so the callee gets video immediately
  // on Accept (avoids a cold DirectShow start racing the callback pull).
  void warmPublisher();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const body = JSON.stringify({ from: fromLabel, app: APP_NAME, callbackToken });
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: RING_TIMEOUT_MS + 5000
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            const token = parsed?.token || '';
            const accepted = Boolean(parsed?.accepted);
            if (!accepted) setLanCallActive(false);
            finish({
              ok: Boolean(parsed?.ok ?? res.statusCode === 200),
              accepted,
              token,
              callbackToken: parsed?.callbackToken || callbackToken,
              livePath: parsed?.livePath || '',
              playUrl: accepted
                ? buildUiPhonePlayUrl({ host, port, token })
                : '',
              error: parsed?.error || (res.statusCode === 409 ? 'busy' : ''),
              statusCode: res.statusCode
            });
          } catch {
            setLanCallActive(false);
            finish({
              ok: false,
              accepted: false,
              error: 'bad response',
              statusCode: res.statusCode
            });
          }
        });
      }
    );

    req.on('timeout', () => {
      try {
        req.destroy();
      } catch {
        /* ignore */
      }
      setLanCallActive(false);
      finish({ ok: false, accepted: false, error: 'timeout' });
    });
    req.on('error', (err) => {
      setLanCallActive(false);
      finish({ ok: false, accepted: false, error: String(err?.message || err) });
    });
    req.write(body);
    req.end();
  });
});

// Sync persist so renderer modules can load settings before async init.
ipcMain.on('persist:getItem', (event, key) => {
  event.returnValue = persistStore.getItem(key);
});
ipcMain.on('persist:setItem', (event, key, value) => {
  event.returnValue = persistStore.setItem(key, value);
});
ipcMain.on('persist:removeItem', (event, key) => {
  event.returnValue = persistStore.removeItem(key);
});

ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

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
  // Caption close hides to tray; real exit is tray → Quit.
  hideToTray({ notify: true });
  return true;
});

ipcMain.handle('window:show', () => {
  showMainWindow();
  return true;
});

ipcMain.handle('clipboard:writeText', (_evt, text) => {
  clipboard.writeText(String(text ?? ''));
  return true;
});

ipcMain.handle('app:notify', (_evt, payload = {}) => {
  const title = typeof payload?.title === 'string' ? payload.title : APP_NAME;
  const body = typeof payload?.body === 'string' ? payload.body : '';
  return showAppNotification({
    title,
    body,
    silent: Boolean(payload?.silent)
  });
});

ipcMain.handle('app:quit', () => {
  quitApplication();
  return true;
});

ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

ipcMain.handle('window:setMinimumSize', (_evt, width, height, options = {}) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  // Width comes from measured toolbar content so controls/labels never clip.
  const minW = Math.max(360, Math.round(Number(width) || 420));
  const minH = Math.max(560, Math.round(Number(height) || 640));
  mainWindow.setMinimumSize(minW, minH);
  const [cw, ch] = mainWindow.getSize();
  // First layout: open at content-fit minimum (fixed brand/chrome, no shrink-to-fit fonts).
  if (options?.fitInitial) {
    const nextH = Math.max(minH, Math.round(Number(options.initialHeight) || ch || 780));
    mainWindow.setSize(minW, nextH);
    return true;
  }
  if (cw < minW || ch < minH) {
    mainWindow.setSize(Math.max(cw, minW), Math.max(ch, minH));
  }
  return true;
});

ipcMain.handle('window:setOpacity', (_evt, opacity) => {
  if (!mainWindow || mainWindow.isDestroyed()) return 1;
  const value = Math.min(1, Math.max(0.2, Number(opacity)));
  if (!Number.isFinite(value)) return mainWindow.getOpacity();
  mainWindow.setOpacity(value);
  return mainWindow.getOpacity();
});

ipcMain.handle('window:getOpacity', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return 1;
  return mainWindow.getOpacity();
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

async function mediaFromPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return { ok: false, error: '파일을 찾을 수 없습니다.', path: resolved };
  }
  const stat = fs.statSync(resolved);
  return {
    ok: true,
    path: resolved,
    name: path.basename(resolved),
    url: toLocalMediaUrl(resolved),
    size: stat.size,
    ext: path.extname(resolved).toLowerCase()
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

