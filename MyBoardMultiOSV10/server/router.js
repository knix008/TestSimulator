// A tiny router on node:http (no Express): method + path pattern (`/api/issues/:id`) → handler.
// Handlers receive { req, res, params, query, body, ctx } and return a value:
//   plain value → 200 JSON; `Raw` → bytes with headers; undefined → 204.
// Errors with `status` + `toJSON()` (AppError) become { error: { code, message, details } }.
import { AppError } from '../core/errors.js';

export class Raw {
  /** @param {Buffer|string} body @param {object} headers @param {number} status */
  constructor(body, headers = {}, status = 200) { this.body = body; this.headers = headers; this.status = status; }
}

const MAX_BODY = 80 * 1024 * 1024; // attachments arrive as base64 JSON (50 MB file ≈ 67 MB)

export function createRouter() {
  /** @type {Array<{ method: string, re: RegExp, keys: string[], handler: Function, raw: boolean }>} */
  const routes = [];

  function add(method, pattern, handler, opts = {}) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    routes.push({ method, re, keys, handler, raw: !!opts.rawBody, public: !!opts.public });
  }

  function match(method, pathname) {
    let allowed = false;
    for (const r of routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) { allowed = true; continue; }
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
    return allowed ? 'method' : null;
  }

  return {
    get: (p, h, o) => add('GET', p, h, o),
    post: (p, h, o) => add('POST', p, h, o),
    put: (p, h, o) => add('PUT', p, h, o),
    patch: (p, h, o) => add('PATCH', p, h, o),
    delete: (p, h, o) => add('DELETE', p, h, o),
    routes,

    /**
     * Handle a request. `makeCtx(req)` resolves auth (may throw 401). Returns false when no route matched.
     */
    async handle(req, res, url, makeCtx) {
      const m = match(req.method, url.pathname);
      if (!m) return false;
      try {
        if (m === 'method') throw new AppError('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
        const { route, params } = m;
        const query = Object.fromEntries(url.searchParams);
        const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req, route.raw) : undefined;
        const ctx = await makeCtx(req, route);
        const out = await route.handler({ req, res, params, query, body, ctx });
        if (res.writableEnded) return true;
        if (out instanceof Raw) {
          res.writeHead(out.status, { 'Content-Length': Buffer.byteLength(out.body), ...out.headers });
          res.end(req.method === 'HEAD' ? undefined : out.body);
        } else if (out === undefined) {
          res.writeHead(204); res.end();
        } else sendJson(res, 200, out);
      } catch (err) {
        sendError(res, err);
      }
      return true;
    },
  };
}

export function sendJson(res, status, value) {
  const text = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store' });
  res.end(text);
}

export function sendError(res, err) {
  if (res.headersSent) { res.destroy(); return; }
  if (err && typeof err.status === 'number' && typeof err.toJSON === 'function') {
    sendJson(res, err.status, { error: err.toJSON() });
    return;
  }
  // database / unexpected errors: stable code, no stack
  const dbConflict = /UNIQUE|duplicate key|Duplicate entry|unique constraint|Violation of UNIQUE KEY/i.test(err?.message || '');
  if (!dbConflict) console.error('[api]', err);
  sendJson(res, dbConflict ? 409 : 500, { error: { code: dbConflict ? 'DUPLICATE' : 'INTERNAL', message: dbConflict ? 'The value already exists' : 'Internal error' } });
}

/** Read the request body: JSON (default) or raw Buffer for routes that accept uploads. */
export function readBody(req, raw = false) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new AppError('BODY_TOO_LARGE', 'The request is too large', 413)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      const type = String(req.headers['content-type'] || '');
      if (raw && !type.includes('application/json')) { resolve(buf); return; }
      if (!buf.length) { resolve({}); return; }
      try { resolve(JSON.parse(buf.toString('utf8'))); } catch { reject(new AppError('INVALID_JSON', 'The request body is not valid JSON', 400)); }
    });
    req.on('error', reject);
  });
}
