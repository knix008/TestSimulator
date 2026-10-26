#!/usr/bin/env node
// Web host: serves dist/ and the same /api the desktop sidecar exposes.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createHandler } = require('./handle');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const port = Number(process.env.MCC_PORT || arg('port', 5211));
const host = arg('host', '127.0.0.1');
const { handle } = createHandler({ configDir: arg('config', '') || undefined, version: readVersion(), scheduler: !process.argv.includes('--no-scheduler') });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  if (await handle(req, res)) return;
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.join(dist, path.normalize(rel));
  if (!file.startsWith(dist)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

const openBrowser = !process.argv.includes('--no-open') && !process.env.MCC_NO_OPEN;

server.listen(port, host, () => {
  const url = `http://${host}:${port}`;
  console.log(`MyCodeChecker ${url}`);
  if (!openBrowser) return;
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try { spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true }).unref(); } catch { /* the URL is already printed */ }
});

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}
function readVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version; } catch { return '1.0.0'; }
}
