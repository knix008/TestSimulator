#!/usr/bin/env node
// My FTP Server — web version.
//
// Serves the built UI (dist/) and exposes core/api.js over HTTP, so the
// server can be configured and watched from a browser. The FTP / FTPS /
// SFTP listeners run inside THIS process — a headless box (NAS, lab PC) runs
// `node server/server.js` and is managed from any machine on the network.
//
//   npm run web              build + serve on http://127.0.0.1:5190
//   node server/server.js --port 8080 --host 0.0.0.0 --token secret
//   node server/server.js --autostart          start the servers right away
//
// Only the loopback interface is bound by default: the API changes shared
// folders and user accounts. Binding another interface should go together
// with --token (sent as `Authorization: Bearer …` or `?token=`).
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { createApi, serializeError } = require('../core/api');
const { createApiHandler, sendJson } = require('./http-api');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  const env = process.env[`MFS_${name.toUpperCase()}`];
  return env !== undefined ? env : fallback;
}

const PORT = Number(arg('port', 5190));
const HOST = arg('host', '127.0.0.1');
const TOKEN = arg('token', '');
const OPEN = !process.argv.includes('--no-open') && !process.env.MFS_NO_OPEN;
const AUTOSTART = process.argv.includes('--autostart') || process.env.MFS_AUTOSTART === '1';

let buildInfo = null;
try { buildInfo = JSON.parse(fs.readFileSync(path.join(root, 'src', 'build-info.json'), 'utf-8')); } catch { /* none */ }
let version = '';
try { version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')).version; } catch { /* none */ }

const api = createApi({ name: 'web', version, buildInfo, configDir: arg('config', '') || undefined });
const handleApi = createApiHandler(api, { token: TOKEN });

function send(res, status, body, type) {
  if (!type) return sendJson(res, status, body);
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json',
};

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(distDir, rel));
  if (!file.startsWith(distDir)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      if (rel !== '/index.html') return serveStatic(req, res, new URL('/', url));
      return send(res, 404, 'dist/ not found — run `npm run build` first.', 'text/plain');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) { handleApi(req, res, url).catch((err) => send(res, 500, { ok: false, error: serializeError(err) })); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
  serveStatic(req, res, url);
});

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  const urlStr = `http://${shown}:${PORT}/${TOKEN ? `?token=${encodeURIComponent(TOKEN)}` : ''}`;
  console.log(`[web] My FTP Server web version: ${urlStr}`);
  console.log(`[web] config: ${api.configDir}`);
  if (!fs.existsSync(path.join(distDir, 'index.html'))) console.log('[web] dist/ is missing — run `npm run build` (or `npm run web`).');
  if (HOST !== '127.0.0.1' && HOST !== 'localhost' && !TOKEN) console.log('[web] WARNING: listening on a non-loopback interface without --token.');
  if (AUTOSTART || api.session.get().autoStart) {
    api.call('server.start', {}).then((s) => console.log(`[web] servers: ${s.state.protocols.map((p) => `${p.proto}:${p.port}`).join(', ')}`)).catch((err) => console.log(`[web] auto-start failed: ${err.message}`));
  }
  if (OPEN && !process.env.MFS_SMOKE) openBrowser(urlStr);
});

// Console mirror of the log so a headless run still shows what happens.
api.log.on('line', (l) => { if (l.level !== 'trace') console.log(`[${l.level}] ${l.text}`); });

function openBrowser(u) {
  const { spawn } = require('child_process');
  try {
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', u.replace(/&/g, '^&')], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', [u], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [u], { detached: true, stdio: 'ignore' }).unref();
  } catch { /* the URL is printed anyway */ }
}

const stop = () => { api.shutdown().catch(() => {}).finally(() => { server.close(); process.exit(0); }); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
