#!/usr/bin/env node
// Web host: serves dist/ with the cross-origin isolation headers the engine
// needs (SharedArrayBuffer) and the file-system API (server/fs-api.js)
// rooted at a workspace folder.
//
//   node server/server.js [--root <dir>] [--port 5231] [--host 127.0.0.1] [--allow-system] [--no-open]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createFsApi, defaultWebRoot, ISOLATION_HEADERS } from './fs-api.js';
import { freeDevPort } from '../scripts/dev-port.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const dist = path.join(root, 'dist');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return fallback;
}
function readVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version; } catch { return '1.0.0'; }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.m': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

export function createWebServer({ workRoot = defaultWebRoot(), allowSystem = false, distDir = dist } = {}) {
  const { handle } = createFsApi({ root: workRoot, jail: true, allowSystem, version: readVersion(), platform: 'web' });
  return http.createServer(async (req, res) => {
    try {
      if (await handle(req, res)) return;
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: { code: 'EIO', message: err.message } }));
      return;
    }
    const url = new URL(req.url, 'http://x');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.join(distDir, path.normalize(rel));
    const back = path.relative(distDir, file);
    if (back.startsWith('..') || path.isAbsolute(back)) { res.writeHead(403); res.end('Forbidden'); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, ISOLATION_HEADERS); res.end('Not found'); return; }
      res.writeHead(200, { ...ISOLATION_HEADERS, 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
      res.end(buf);
    });
  });
}

async function main() {
  const workRoot = path.resolve(arg('root', process.env.MSM_ROOT || defaultWebRoot()));
  const host = arg('host', '127.0.0.1');
  const port = Number(process.env.MSM_PORT || arg('port', 0)) || await freeDevPort(5231);
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.error('dist/ is missing. Run "npm run build" first.');
    process.exit(1);
  }
  const server = createWebServer({ workRoot, allowSystem: process.argv.includes('--allow-system') });
  server.listen(port, host, () => {
    const url = `http://${host}:${port}`;
    console.log(`MySimulationMath ${url}  (workspace folder: ${workRoot})`);
    if (process.argv.includes('--no-open') || process.env.MSM_NO_OPEN) return;
    const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    try { spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true }).unref(); } catch { /* the URL is printed */ }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
