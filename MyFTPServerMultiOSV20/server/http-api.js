// core/api.js over HTTP — shared by the web version (server/server.js) and
// the desktop app's Node host (host/host.js):
//
//   POST /api/<method>   JSON body → { ok: true, data } | { ok: false, error }
//
// With a token every call needs `Authorization: Bearer <token>` (or
// `?token=`). `cors: true` answers the preflight and echoes the Origin: the
// desktop page (http://tauri.localhost, tauri://localhost, the Vite dev
// server) calls the host on another origin, and the token is the protection.
'use strict';

const { serializeError } = require('../core/api');

const MAX_BODY = 8 << 20;

function sendJson(res, status, body, extra = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(data), ...extra });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('Body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function authorized(req, url, token) {
  if (!token) return true;
  if ((req.headers.authorization || '') === `Bearer ${token}`) return true;
  return url.searchParams.get('token') === token;
}

function corsHeaders(req) {
  return {
    'access-control-allow-origin': req.headers.origin || '*',
    vary: 'Origin',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-private-network': 'true',
    'access-control-max-age': '600',
  };
}

/** handle(req, res, url) → true when it answered (an /api/ request). */
function createApiHandler(api, { token = '', cors = false } = {}) {
  return async function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/')) return false;
    const extra = cors ? corsHeaders(req) : {};
    if (cors && req.method === 'OPTIONS') {
      res.writeHead(204, extra);
      res.end();
      return true;
    }
    if (!authorized(req, url, token)) { sendJson(res, 401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, extra); return true; }
    if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: { code: 'METHOD', message: 'POST only' } }, extra); return true; }
    const name = decodeURIComponent(url.pathname.slice('/api/'.length));
    let args = {};
    try {
      const raw = await readBody(req);
      args = raw ? JSON.parse(raw) : {};
    } catch (err) {
      sendJson(res, 400, { ok: false, error: serializeError(err) }, extra);
      return true;
    }
    try {
      sendJson(res, 200, { ok: true, data: await api.call(name, args) }, extra);
    } catch (err) {
      sendJson(res, 200, { ok: false, error: serializeError(err) }, extra);
    }
    return true;
  };
}

module.exports = { createApiHandler, sendJson };
