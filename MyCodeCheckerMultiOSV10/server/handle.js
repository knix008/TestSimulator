'use strict';

// Shared POST /api/<method> handler for the Vite dev server, the web host
// and the Tauri sidecar.

const { createApi, serializeError } = require('../core/api');
const { createCompatApi } = require('../core/compat-api');
const { jsonChunks } = require('../core/json');

// The caller's user token: our header, or code quality style "Bearer <token>" /
// Basic "<token>:" when it is not the transport token of the desktop sidecar.
function userTokenOf(req, transportToken) {
  if (req.headers['x-mcc-user-token']) return String(req.headers['x-mcc-user-token']);
  const auth = String(req.headers.authorization || '');
  const bearer = /^Bearer\s+(.+)$/i.exec(auth);
  if (bearer && bearer[1] !== transportToken) return bearer[1];
  const basic = /^Basic\s+(.+)$/i.exec(auth);
  if (basic) {
    const [user, pass] = Buffer.from(basic[1], 'base64').toString('utf8').split(/:(.*)/s);
    return pass && !user ? pass : user;
  }
  return '';
}

function createHandler(options = {}) {
  const api = options.api || createApi(options);
  const ref = createCompatApi(api, { version: options.version });
  const token = options.token || '';
  // Origins allowed to call cross-origin (the Tauri page calls the sidecar on
  // another port). The bearer token is still required for every POST.
  const corsOrigins = new Set(options.corsOrigins || []);

  async function handle(req, res) {
    const host = req.headers.host || '127.0.0.1';
    let url;
    try { url = new URL(req.url, `http://${host}`); } catch { return false; }
    if (!url.pathname.startsWith('/api/')) return false;
    const origin = req.headers.origin || '';
    if (origin && corsOrigins.has(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'Origin');
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type, x-mcc-user-token',
          'access-control-max-age': '600',
        });
        res.end();
        return true;
      }
    }
    if (token) {
      const header = req.headers.authorization || '';
      const query = url.searchParams.get('token') || '';
      if (header !== `Bearer ${token}` && query !== token) {
        send(res, 401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
        return true;
      }
    }
    const name = decodeURIComponent(url.pathname.slice('/api/'.length));
    // compatible routes: /api/<area>/<action>, GET or form POST, plain JSON replies.
    if (name.includes('/')) {
      try {
        const query = Object.fromEntries(url.searchParams);
        if (req.method === 'POST') {
          const raw = await readBody(req);
          const type = String(req.headers['content-type'] || '');
          if (raw && type.includes('json')) Object.assign(query, JSON.parse(raw));
          else if (raw) Object.assign(query, Object.fromEntries(new URLSearchParams(raw)));
        }
        const data = await ref.route(req.method, name, query, { token: userTokenOf(req, token) });
        if (data === undefined) { send(res, 404, { errors: [{ msg: `Unknown url: /api/${name}` }] }); return true; }
        send(res, 200, data);
      } catch (err) {
        const status = { NOT_FOUND: 404, UNAUTHORIZED: 401, FORBIDDEN: 403, BAD_REQUEST: 400, APPROVAL_REQUIRED: 409 }[err.code] || 500;
        send(res, status, { errors: [{ msg: err.message }] });
      }
      return true;
    }
    if (req.method !== 'POST') {
      send(res, 405, { ok: false, error: { code: 'METHOD', message: 'POST only' } });
      return true;
    }
    try {
      const raw = await readBody(req);
      const args = raw ? JSON.parse(raw) : {};
      const data = await api.call(name, args, { token: userTokenOf(req, token) });
      send(res, 200, { ok: true, data });
    } catch (err) {
      const error = serializeError(err);
      const status = { NO_METHOD: 404, NOT_FOUND: 404, UNAUTHORIZED: 401, FORBIDDEN: 403, BAD_REQUEST: 400, APPROVAL_REQUIRED: 409, CONFLICT: 409, LAST_ADMIN: 409, CANCELLED: 409, TOO_MANY: 429 }[error.code] || 500;
      send(res, status, { ok: false, error });
    }
    return true;
  }

  return { handle, api };
}

// A large analysis is more JSON than one string can hold: past the first
// piece the body is streamed (chunked) as it is serialized.
function send(res, status, body) {
  const pieces = jsonChunks(body);
  const first = pieces.next();
  const head = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
  const second = first.done ? first : pieces.next();
  if (second.done) {
    const data = first.done ? '' : first.value;
    res.writeHead(status, { ...head, 'content-length': Buffer.byteLength(data) });
    res.end(data);
    return;
  }
  res.writeHead(status, head);
  res.write(first.value);
  res.write(second.value);
  for (const piece of pieces) res.write(piece);
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 64 << 20) { reject(new Error('Body too large')); req.destroy(); }
      else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

module.exports = { createHandler, send, readBody };
