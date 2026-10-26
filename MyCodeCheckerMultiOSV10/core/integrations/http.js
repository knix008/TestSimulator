'use strict';

// Small JSON HTTP client shared by the integration modules (tracker, alm).
// http/https built-ins only, a timeout per attempt, retries on 429 and 5xx
// with exponential backoff (Retry-After is honoured, capped). No proxy
// support. A `transport` function can replace the network for tests or for
// the desktop host:
//   transport({ method, url, headers, body }) -> Promise<{ status, headers, body }>

const http = require('http');
const https = require('https');

const DEFAULTS = { timeoutMs: 15000, retries: 2, backoffMs: 400, maxBackoffMs: 8000 };

class HttpError extends Error {
  /**
   * @param {string} message English message
   * @param {{status?:number|null, body?:string, url?:string, method?:string, code?:string, text?:{en:string,ko:string}}} info
   */
  constructor(message, info = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = info.status == null ? null : info.status;
    this.body = info.body || '';
    this.url = info.url || '';
    this.method = info.method || '';
    this.code = info.code || (info.status ? `HTTP_${info.status}` : 'NETWORK');
    this.text = info.text || { en: message, ko: message };
  }
}

function sleep(ms) {
  return new Promise((resolve) => { const t = setTimeout(resolve, ms); if (t.unref) t.unref(); });
}

/** Strip credentials from a URL for error messages. */
function safeUrl(url) {
  try { const u = new URL(url); u.username = ''; u.password = ''; return u.toString(); } catch { return String(url); }
}

function lowerHeaders(h) {
  const out = {};
  for (const [k, v] of Object.entries(h || {})) if (v != null) out[k.toLowerCase()] = v;
  return out;
}

/** One network attempt with node:http(s). */
function nodeTransport(req, opts) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(req.url); } catch { reject(new HttpError(`Invalid URL: ${req.url}`, { code: 'BAD_URL', url: req.url, text: { en: `The URL is not valid: ${req.url}`, ko: `URL이 올바르지 않습니다: ${req.url}` } })); return; }
    const lib = u.protocol === 'https:' ? https : u.protocol === 'http:' ? http : null;
    if (!lib) { reject(new HttpError(`Unsupported protocol: ${u.protocol}`, { code: 'BAD_URL', url: req.url, text: { en: `Only http and https URLs are supported: ${req.url}`, ko: `http와 https URL만 지원합니다: ${req.url}` } })); return; }
    const options = { method: req.method, headers: req.headers, timeout: opts.timeoutMs };
    if (u.protocol === 'https:') {
      if (opts.rejectUnauthorized === false) options.rejectUnauthorized = false;
      if (opts.ca) options.ca = opts.ca;
    }
    const r = lib.request(u, options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    r.on('timeout', () => {
      r.destroy(new HttpError(`Timed out after ${opts.timeoutMs} ms`, { code: 'TIMEOUT', url: safeUrl(req.url), method: req.method, text: { en: `The server did not answer within ${opts.timeoutMs} ms.`, ko: `서버가 ${opts.timeoutMs} ms 안에 응답하지 않았습니다.` } }));
    });
    r.on('error', (err) => {
      if (err instanceof HttpError) { reject(err); return; }
      reject(new HttpError(`${req.method} ${safeUrl(req.url)} failed: ${err.message}`, { code: err.code || 'NETWORK', url: safeUrl(req.url), method: req.method, text: { en: `Could not reach the server: ${err.message}`, ko: `서버에 연결하지 못했습니다: ${err.message}` } }));
    });
    if (req.body != null) r.write(req.body);
    r.end();
  });
}

function retryDelay(attempt, res, opts) {
  const ra = res && res.headers && (res.headers['retry-after'] || res.headers['Retry-After']);
  if (ra != null) {
    const s = Number(ra);
    if (Number.isFinite(s)) return Math.min(s * 1000, opts.maxBackoffMs);
    const when = Date.parse(ra);
    if (Number.isFinite(when)) return Math.max(0, Math.min(when - Date.now(), opts.maxBackoffMs));
  }
  return Math.min(opts.backoffMs * 2 ** attempt, opts.maxBackoffMs);
}

/**
 * Send a request. JSON bodies are serialized; JSON responses are parsed into `json`.
 * Resolves for 2xx (and statuses listed in `okStatuses`); rejects with HttpError otherwise.
 * @param {{method?:string, url:string, headers?:object, body?:any, timeoutMs?:number, retries?:number,
 *   backoffMs?:number, maxBackoffMs?:number, okStatuses?:number[], transport?:Function,
 *   rejectUnauthorized?:boolean, ca?:string|Buffer}} req
 * @returns {Promise<{status:number, headers:object, body:string, json:any, attempts:number}>}
 */
async function request(req) {
  const opts = { ...DEFAULTS };
  for (const [k, v] of Object.entries(req || {})) if (v !== undefined && v !== null) opts[k] = v;
  const method = String(opts.method || 'GET').toUpperCase();
  const headers = { accept: 'application/json', 'user-agent': 'MyCodeChecker', ...lowerHeaders(opts.headers) };
  let body = null;
  if (opts.body != null) {
    if (Buffer.isBuffer(opts.body) || typeof opts.body === 'string') body = opts.body;
    else { body = JSON.stringify(opts.body); if (!headers['content-type']) headers['content-type'] = 'application/json'; }
    headers['content-length'] = String(Buffer.byteLength(body));
  }
  const send = typeof opts.transport === 'function' ? (r) => opts.transport(r) : (r) => nodeTransport(r, opts);
  const ok = (s) => (s >= 200 && s < 300) || (opts.okStatuses || []).includes(s);
  let lastErr = null;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    let res;
    try {
      res = await send({ method, url: opts.url, headers, body });
    } catch (err) {
      lastErr = err instanceof HttpError ? err : new HttpError(String((err && err.message) || err), { code: (err && err.code) || 'NETWORK', url: safeUrl(opts.url), method, text: { en: `Could not reach the server: ${(err && err.message) || err}`, ko: `서버에 연결하지 못했습니다: ${(err && err.message) || err}` } });
      // Network errors are retried only for idempotent methods (a POST may have reached the server).
      if (attempt < opts.retries && ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS'].includes(method) && lastErr.code !== 'BAD_URL') { await sleep(retryDelay(attempt, null, opts)); continue; }
      throw lastErr;
    }
    const status = Number(res.status);
    if (ok(status)) {
      const text = res.body == null ? '' : Buffer.isBuffer(res.body) ? res.body.toString('utf8') : String(res.body);
      let json = null;
      if (text) { try { json = JSON.parse(text); } catch { json = null; } }
      return { status, headers: lowerHeaders(res.headers), body: text, json, attempts: attempt + 1 };
    }
    const text = res.body == null ? '' : String(res.body);
    lastErr = new HttpError(`${method} ${safeUrl(opts.url)} returned HTTP ${status}: ${text.slice(0, 300)}`, {
      status, body: text.slice(0, 4000), url: safeUrl(opts.url), method,
      text: status === 401 || status === 403
        ? { en: `The server refused the credentials (HTTP ${status}).`, ko: `서버가 인증 정보를 거부했습니다 (HTTP ${status}).` }
        : status === 404
          ? { en: `Not found (HTTP 404): ${safeUrl(opts.url)}`, ko: `찾을 수 없습니다 (HTTP 404): ${safeUrl(opts.url)}` }
          : { en: `The server returned HTTP ${status}.`, ko: `서버가 HTTP ${status}을(를) 반환했습니다.` },
    });
    if ((status === 429 || status >= 500) && attempt < opts.retries) { await sleep(retryDelay(attempt, { headers: lowerHeaders(res.headers) }, opts)); continue; }
    throw lastErr;
  }
  throw lastErr;
}

/**
 * A client bound to a base URL and default headers / options.
 * @param {{baseUrl:string, headers?:object} & object} defaults
 */
function client(defaults = {}) {
  const base = String(defaults.baseUrl || '').replace(/\/+$/, '');
  const call = (method, path, body, extra = {}) => request({
    ...defaults, ...extra, method,
    url: /^https?:\/\//i.test(path) ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`,
    headers: { ...(defaults.headers || {}), ...(extra.headers || {}) },
    body,
  });
  return {
    get: (p, extra) => call('GET', p, undefined, extra),
    post: (p, body, extra) => call('POST', p, body, extra),
    put: (p, body, extra) => call('PUT', p, body, extra),
    patch: (p, body, extra) => call('PATCH', p, body, extra),
    del: (p, extra) => call('DELETE', p, undefined, extra),
    request: call,
  };
}

/** `Basic base64(user:pass)`. */
function basicAuth(user, pass) {
  return `Basic ${Buffer.from(`${user == null ? '' : user}:${pass == null ? '' : pass}`, 'utf8').toString('base64')}`;
}

module.exports = { request, client, basicAuth, HttpError, safeUrl, DEFAULTS };
