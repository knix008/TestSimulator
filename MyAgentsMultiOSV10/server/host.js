// HTTP plumbing shared by desktop.js and web.js: server, CORS, static files, auth helpers.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { sendJson } from './router.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.avif': 'image/avif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8', '.map': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

export const CORS_HEADERS = 'Authorization, Content-Type, X-Client-Id, X-Session, X-File-Name';

/** Bearer token from Authorization, or ?token= (for <img src> and WebSocket URLs). */
export function bearer(req, url) {
  const h = String(req.headers.authorization || '');
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (m) return m[1].trim();
  return url?.searchParams.get('token') || null;
}

export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Apply CORS for an allowed origin; returns true when the request was a handled preflight. */
export function cors(req, res, isAllowed) {
  const origin = req.headers.origin;
  if (origin && isAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': CORS_HEADERS, 'Access-Control-Max-Age': '600',
      });
      res.end();
      return true;
    }
  } else if (req.method === 'OPTIONS' && origin) {
    res.writeHead(403); res.end();
    return true;
  }
  return false;
}

/** Serve a file from `root` (SPA fallback to index.html for extension-less paths). Returns false if absent. */
export function serveStatic(req, res, url, root) {
  if (!root || !fs.existsSync(root) || !['GET', 'HEAD'].includes(req.method)) return false;
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { return false; }
  let file = path.resolve(root, '.' + rel);
  if (!file.startsWith(path.resolve(root))) return false;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    if (path.extname(rel)) return false;
    file = path.join(root, 'index.html');
    if (!fs.existsSync(file)) return false;
  }
  const ext = path.extname(file).toLowerCase();
  const st = fs.statSync(file);
  const immutable = /[\\/]assets[\\/]/.test(file) && ext !== '.html';
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': ext === '.html' ? 'no-cache' : immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
  });
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  return true;
}

/**
 * Create the HTTP server.
 * @param {{ router, makeCtx, corsAllowed: (origin) => boolean, staticDir?: string, onUpgrade?: Function, livePath?: string }} o
 */
export function createHttpServer(o) {
  const server = http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); res.end(); return; }
    if (cors(req, res, o.corsAllowed)) return;
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const handled = await o.router.handle(req, res, url, (r, route) => o.makeCtx(r, route, url));
      if (!handled) sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'Unknown API route' } });
      return;
    }
    if (serveStatic(req, res, url, o.staticDir)) return;
    sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
  server.keepAliveTimeout = 65000;
  if (o.onUpgrade) {
    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === (o.livePath || '/api/live')) o.onUpgrade(req, socket, head, url);
      else socket.destroy();
    });
  }
  return server;
}

/** listen() as a promise; resolves the bound port. */
export function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolve(server.address().port); });
  });
}

/** Parse --name value / --flag arguments. */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}
