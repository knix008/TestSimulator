#!/usr/bin/env node
// My FTP Client — the core's HTTP host.
//
// Serves the built UI (dist/) and exposes core/api.js over HTTP, so the same
// FTP / FTPS / SFTP client runs in a browser. The "local" side is then the
// file system of the machine this server runs on (a NAS, a lab PC, a remote
// Linux box…), and the server connections are made from there.
//
// The desktop app is this server too: src-tauri starts it on a free loopback
// port with a random --token and MFC_HOST_NAME=tauri, and its window calls it
// cross-origin. Then the files are the user's own, so "open" and "show in the
// file manager" are available (core/shell.js).
//
//   npm run web              build + serve on http://127.0.0.1:5188
//   node server/server.js --port 8080 --host 0.0.0.0 --token secret
//
// Only the loopback interface is bound by default: the API gives full
// read/write access to the server's files. Binding another interface should
// go together with --token (sent as `Authorization: Bearer …` or `?token=`).
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { createApi, serializeError } = require('../core/api');
const shell = require('../core/shell');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  const env = process.env[`MFC_${name.toUpperCase()}`];
  return env !== undefined ? env : fallback;
}

const PORT = Number(arg('port', 5188));
const HOST = arg('host', '127.0.0.1');
const TOKEN = arg('token', '');
const OPEN = !process.argv.includes('--no-open') && !process.env.MFC_NO_OPEN;
// 'web' for the browser, 'tauri' when the desktop shell started this process.
const HOST_NAME = process.env.MFC_HOST_NAME || 'web';
const DESKTOP = HOST_NAME === 'tauri';

let buildInfo = null;
try { buildInfo = JSON.parse(fs.readFileSync(path.join(root, 'src', 'build-info.json'), 'utf-8')); } catch { /* none */ }
let version = '';
try { version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')).version; } catch { /* none */ }

const api = createApi({
  name: HOST_NAME,
  version,
  buildInfo,
  configDir: arg('config', '') || undefined,
  ...(DESKTOP ? {
    openPath: shell.openPath,
    revealPath: shell.revealPath,
    pickFolderInUi: true,
    // MFC_INLINE_DIALOGS=1 keeps dialogs inside the main window (smoke screenshots).
    detachedDialogs: !process.env.MFC_INLINE_DIALOGS,
  } : {}),
});

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'content-length': Buffer.byteLength(data) });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 8 << 20) { reject(new Error('Body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function authorized(req, url) {
  if (!TOKEN) return true;
  const h = req.headers.authorization || '';
  if (h === `Bearer ${TOKEN}`) return true;
  return url.searchParams.get('token') === TOKEN;
}

// The desktop window is served from tauri.localhost (or the Vite dev origin)
// and calls this core on another loopback port. That fetch is cross-origin,
// so the webview drops the response unless these headers are present. Only
// loopback and the Tauri page origins are reflected; a public site cannot
// read the API.
function allowedPageOrigin(origin) {
  if (!origin) return '';
  let url;
  try { url = new URL(origin); } catch { return ''; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'tauri:') return '';
  const host = url.hostname;
  const loopback = host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1';
  const tauriPage = host === 'tauri.localhost';
  return loopback || tauriPage ? origin : '';
}

function corsHeaders(req) {
  const origin = allowedPageOrigin(req.headers.origin);
  if (!origin) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-private-network': 'true',
    vary: 'Origin',
  };
}

async function handleApi(req, res, url) {
  if (!authorized(req, url)) return send(res, 401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
  const name = decodeURIComponent(url.pathname.slice('/api/'.length));
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: { code: 'METHOD', message: 'POST only' } });
  // The desktop shell is closing: answer, then close the connections and exit.
  if (name === 'app.shutdown') {
    send(res, 200, { ok: true, data: { ok: true } });
    setImmediate(stop);
    return undefined;
  }
  let args = {};
  try {
    const raw = await readBody(req);
    args = raw ? JSON.parse(raw) : {};
  } catch (err) {
    return send(res, 400, { ok: false, error: serializeError(err) });
  }
  try {
    const data = await api.call(name, args);
    send(res, 200, { ok: true, data });
  } catch (err) {
    send(res, 200, { ok: false, error: serializeError(err) });
  }
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(distDir, rel));
  if (!file.startsWith(distDir)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // SPA fallback
      if (rel !== '/index.html') return serveStatic(req, res, new URL('/', url));
      return send(res, 404, 'dist/ not found — run `npm run build` first.', 'text/plain');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    const cors = corsHeaders(req);
    if (cors) {
      const writeHead = res.writeHead;
      res.writeHead = function withCors(status, extra) { return writeHead.call(this, status, { ...cors, ...(extra || {}) }); };
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-max-age': '600', 'content-length': 0 });
      return res.end();
    }
    return handleApi(req, res, url).catch((err) => send(res, 500, { ok: false, error: serializeError(err) }));
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
  serveStatic(req, res, url);
});

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  const urlStr = `http://${shown}:${PORT}/${TOKEN ? `?token=${encodeURIComponent(TOKEN)}` : ''}`;
  console.log(`[web] My FTP Client web version: ${urlStr}`);
  if (!DESKTOP && !fs.existsSync(path.join(distDir, 'index.html'))) console.log('[web] dist/ is missing — run `npm run build` (or `npm run web`).');
  if (HOST !== '127.0.0.1' && HOST !== 'localhost' && !TOKEN) console.log('[web] WARNING: listening on a non-loopback interface without --token.');
  if (OPEN && !process.env.MFC_SMOKE) openBrowser(urlStr);
});

function openBrowser(u) {
  const { spawn } = require('child_process');
  try {
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', u.replace(/&/g, '^&')], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', [u], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [u], { detached: true, stdio: 'ignore' }).unref();
  } catch { /* the URL is printed anyway */ }
}

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  api.shutdown().catch(() => {}).finally(() => { server.close(); process.exit(0); });
  // A server that will not close its sockets does not keep the process alive.
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

// --parent-pid: the desktop shell that started this core. When it is gone (a
// crash, or ended from the task manager, so it never sent app.shutdown) the
// core ends too, and does not stay behind holding the installed runtime's files.
const PARENT_PID = Number(arg('parent-pid', 0));
if (PARENT_PID > 0) {
  setInterval(() => {
    try { process.kill(PARENT_PID, 0); } catch (err) { if (err.code === 'ESRCH') stop(); }
  }, 2000).unref();
}
