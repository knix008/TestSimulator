#!/usr/bin/env node
// Desktop service for the Tauri shell.
//
// The editor's file, session, terminal, lint and format work lives in core/
// and is plain Node. Tauri starts this process on 127.0.0.1, then the
// renderer calls POST /api/<name> the same way the web host does. A random
// bearer token (printed once on stdout as `MED_READY {…}`) keeps other local
// programs from using the API.
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { createApi, serializeError } = require('../core/api');
const files = require('../core/files');
const { listPrinters, printHtml } = require('./print');

const root = path.join(__dirname, '..');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return process.env[`MED_${name.toUpperCase().replace(/-/g, '_')}`] || '';
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

const TOKEN = crypto.randomBytes(24).toString('hex');
let printJob = null;

function readBuildInfo() {
  return readJson(path.join(root, 'src', 'build-info.json')) || readJson(path.join(root, 'build-info.json'));
}
function readVersion() {
  const pkg = readJson(path.join(root, 'package.json'));
  return (pkg && pkg.version) || '';
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { windowsHide: true, timeout: opts.timeout || 20000, encoding: 'utf8', env: opts.env || process.env, input: opts.input });
}

function revealPath(p) {
  let isDir = false;
  try { isDir = fs.statSync(p).isDirectory(); } catch { /* treat as a file */ }
  if (process.platform === 'win32') {
    const r = isDir ? run('explorer.exe', [p]) : run('explorer.exe', [`/select,${p}`]);
    if (r.error) throw r.error;
    return true;
  }
  if (process.platform === 'darwin') {
    const r = isDir ? run('open', [p]) : run('open', ['-R', p]);
    if (r.error) throw r.error;
    return true;
  }
  return files.openExternal(isDir ? p : path.dirname(p));
}

function clipboardText() {
  if (process.platform === 'win32') {
    const r = run('powershell.exe', ['-NoProfile', '-STA', '-Command', 'Get-Clipboard -Raw']);
    return r.stdout ? String(r.stdout).replace(/\r?\n$/, '') : '';
  }
  if (process.platform === 'darwin') {
    const r = run('pbpaste', []);
    return r.stdout || '';
  }
  const r = run('xclip', ['-selection', 'clipboard', '-o']);
  if (!r.error) return r.stdout || '';
  const w = run('wl-paste', ['--no-newline']);
  return w.stdout || '';
}

function writeClipboardText(text) {
  const body = String(text || '');
  if (process.platform === 'win32') {
    run('powershell.exe', ['-NoProfile', '-STA', '-Command', '$t = [Console]::In.ReadToEnd(); Set-Clipboard -Value $t'], { input: body, timeout: 15000 });
    return;
  }
  if (process.platform === 'darwin') { run('pbcopy', [], { input: body }); return; }
  const r = run('xclip', ['-selection', 'clipboard'], { input: body });
  if (r.error) run('wl-copy', [], { input: body });
}

function writeImage(dataUrl) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(String(dataUrl || ''));
  if (!m) return;
  const file = path.join(os.tmpdir(), `med-clip-${process.pid}-${Date.now()}.png`);
  fs.writeFileSync(file, Buffer.from(m[1], 'base64'));
  try {
    if (process.platform === 'win32') {
      run('powershell.exe', ['-NoProfile', '-STA', '-Command', [
        'Add-Type -AssemblyName System.Windows.Forms',
        'Add-Type -AssemblyName System.Drawing',
        '$img = [System.Drawing.Image]::FromFile($env:MED_CLIP)',
        'try { [System.Windows.Forms.Clipboard]::SetImage($img) } finally { $img.Dispose() }',
      ].join('; ')], { env: { ...process.env, MED_CLIP: file }, timeout: 20000 });
    } else if (process.platform === 'darwin') {
      run('osascript', ['-e', `set the clipboard to (read (POSIX file ${JSON.stringify(file)}) as «class PNGf»)`], { timeout: 15000 });
    } else {
      const r = run('xclip', ['-selection', 'clipboard', '-t', 'image/png', '-i', file]);
      if (r.error) run('wl-copy', ['--type', 'image/png'], { input: fs.readFileSync(file) });
    }
  } finally {
    try { fs.unlinkSync(file); } catch { /* temp file already gone */ }
  }
}

const api = createApi({
  name: 'tauri',
  version: readVersion(),
  buildInfo: readBuildInfo(),
  configDir: arg('config') || undefined,
  // shell.openPath returns "" on success; a truthy string is treated as a failure.
  openPath: async (p) => { await files.openExternal(p); return ''; },
  revealPath,
  clipboard: { readText: clipboardText, writeText: writeClipboardText },
  writeImage,
});

async function dispatch(name, args) {
  if (name === 'print.printers') return listPrinters();
  if (name === 'print.setJob') { printJob = args && args.job ? args.job : null; return true; }
  if (name === 'print.takeJob') return printJob;
  if (name === 'print.html') return printHtml(args && args.html, args && args.opts);
  return api.call(name, args);
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(data),
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-private-network': 'true',
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 256 << 20) { reject(new Error('Body too large')); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function authorized(req) {
  return (req.headers.authorization || '') === `Bearer ${TOKEN}`;
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, '');
  const url = new URL(req.url, 'http://127.0.0.1');
  if (!url.pathname.startsWith('/api/')) return send(res, 404, { ok: false, error: { code: 'ENOTFOUND', message: 'Not found' } });
  if (!authorized(req)) return send(res, 401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: { code: 'METHOD', message: 'POST only' } });
  const name = decodeURIComponent(url.pathname.slice('/api/'.length));
  readBody(req).then((raw) => {
    let args = {};
    try { args = raw ? JSON.parse(raw) : {}; } catch (err) { send(res, 400, { ok: false, error: serializeError(err) }); return null; }
    return dispatch(name, args).then(
      (data) => send(res, 200, { ok: true, data }),
      (err) => send(res, 200, { ok: false, error: serializeError(err) }),
    );
  }).catch((err) => send(res, 500, { ok: false, error: serializeError(err) }));
});

server.requestTimeout = 0;
server.headersTimeout = 0;
server.timeout = 0;

const parent = process.ppid;
const watch = setInterval(() => {
  try { process.kill(parent, 0); } catch { shutdown(0); }
}, 2000);
watch.unref();

function shutdown(code) {
  clearInterval(watch);
  server.close();
  api.shutdown().catch(() => {});
  process.exit(code);
}
process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

server.listen(0, '127.0.0.1', () => {
  const addr = server.address();
  // stdout is the handshake with the Tauri shell. Everything else goes to stderr
  // so a log line can never be mistaken for the ready message.
  process.stdout.write(`MED_READY ${JSON.stringify({ port: addr.port, token: TOKEN })}\n`);
});
