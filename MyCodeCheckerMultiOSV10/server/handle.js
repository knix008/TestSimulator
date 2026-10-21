'use strict';

// Shared POST /api/<method> handler for the Vite dev server, the web host
// and the Tauri sidecar.

const { createApi, serializeError } = require('../core/api');

function createHandler(options = {}) {
  const api = options.api || createApi(options);
  const token = options.token || '';

  async function handle(req, res) {
    const host = req.headers.host || '127.0.0.1';
    let url;
    try { url = new URL(req.url, `http://${host}`); } catch { return false; }
    if (!url.pathname.startsWith('/api/')) return false;
    if (token) {
      const header = req.headers.authorization || '';
      const query = url.searchParams.get('token') || '';
      if (header !== `Bearer ${token}` && query !== token) {
        send(res, 401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
        return true;
      }
    }
    if (req.method !== 'POST') {
      send(res, 405, { ok: false, error: { code: 'METHOD', message: 'POST only' } });
      return true;
    }
    const name = decodeURIComponent(url.pathname.slice('/api/'.length));
    try {
      const raw = await readBody(req);
      const args = raw ? JSON.parse(raw) : {};
      const data = await api.call(name, args);
      send(res, 200, { ok: true, data });
    } catch (err) {
      const status = err.code === 'NO_METHOD' ? 404 : err.code === 'NOT_FOUND' ? 404 : 500;
      send(res, status, { ok: false, error: serializeError(err) });
    }
    return true;
  }

  return { handle, api };
}

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(data),
  });
  res.end(data);
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
