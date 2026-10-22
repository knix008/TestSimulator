'use strict';

const http = require('http');
const https = require('https');
const tls = require('tls');
const { URL } = require('url');

const USER_AGENT = 'MyCodeChecker-DAST';
const MAX_BODY = 512 * 1024; // cap bytes read per response
const TRUNCATE = 2048; // evidence truncation for stored request/response

// Methods this scanner is ever allowed to send. No DELETE/PUT/PATCH: active
// probes stay non-destructive.
const SAFE_METHODS = new Set(['GET', 'POST', 'HEAD', 'OPTIONS', 'TRACE']);

// Token-bucket rate limiter + hard request cap + scope gate + cancel.
class Client {
  constructor(opts = {}) {
    this.scope = opts.scope;
    this.ratePerSec = Math.max(0.1, Number(opts.rateLimit) || 5);
    this.maxRequests = Number.isFinite(opts.maxRequests) ? opts.maxRequests : 500;
    this.timeoutMs = Number(opts.timeoutMs) || 8000;
    this.auth = opts.auth || null;
    this.count = 0;
    this.cancelled = false;
    this._times = []; // timestamps of recent sends (for rate limit)
    this._cookies = new Map(); // name -> value, from auth login / set-cookie reuse
    if (this.auth && this.auth.cookie) this._seedCookies(this.auth.cookie);
  }

  _seedCookies(cookieStr) {
    for (const part of String(cookieStr).split(';')) {
      const eq = part.indexOf('=');
      if (eq > 0) this._cookies.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
  }

  cancel() {
    this.cancelled = true;
  }

  get requests() {
    return this.count;
  }

  async _throttle() {
    const now = Date.now();
    const windowStart = now - 1000;
    this._times = this._times.filter((t) => t > windowStart);
    if (this._times.length >= this.ratePerSec) {
      const wait = this._times[0] + 1000 - now;
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    this._times.push(Date.now());
  }

  _cookieHeader() {
    if (this._cookies.size === 0) return '';
    return [...this._cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  _authHeaders(headers) {
    if (!this.auth) return headers;
    if (this.auth.bearer) headers['authorization'] = `Bearer ${this.auth.bearer}`;
    if (this.auth.headers) for (const [k, v] of Object.entries(this.auth.headers)) headers[k.toLowerCase()] = v;
    const cookie = this._cookieHeader();
    if (cookie) headers['cookie'] = headers['cookie'] ? `${headers['cookie']}; ${cookie}` : cookie;
    return headers;
  }

  // Perform one request. Never follows redirects. Enforces scope + caps.
  async request(rawUrl, options = {}) {
    if (this.cancelled) throw new CancelError();
    const method = (options.method || 'GET').toUpperCase();
    if (!SAFE_METHODS.has(method)) throw new Error(`Refusing unsafe method ${method}`);
    if (this.scope && !this.scope.inScope(rawUrl)) {
      const err = new Error(`Out of scope: ${rawUrl}`);
      err.code = 'OUT_OF_SCOPE';
      throw err;
    }
    if (this.count >= this.maxRequests) {
      const err = new Error(`Request budget exhausted (${this.maxRequests})`);
      err.code = 'BUDGET';
      throw err;
    }
    await this._throttle();
    if (this.cancelled) throw new CancelError();
    this.count += 1;

    const u = new URL(rawUrl);
    const lib = u.protocol === 'https:' ? https : http;
    const headers = this._authHeaders({
      'user-agent': USER_AGENT,
      accept: '*/*',
      ...(options.headers || {}),
    });
    let body = options.body;
    if (body && typeof body !== 'string') body = String(body);
    if (body != null) {
      if (!headers['content-type']) headers['content-type'] = 'application/x-www-form-urlencoded';
      headers['content-length'] = Buffer.byteLength(body);
    }

    return await new Promise((resolve, reject) => {
      const req = lib.request(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname + u.search,
          method,
          headers,
          // Never auto-follow. For https test targets allow self-signed so the
          // TLS passive check can still report it (we never send data there
          // beyond scope-approved origins).
          rejectUnauthorized: false,
          timeout: this.timeoutMs,
        },
        (res) => {
          const chunks = [];
          let size = 0;
          res.on('data', (c) => {
            size += c.length;
            if (size <= MAX_BODY) chunks.push(c);
            if (size > MAX_BODY) res.destroy();
          });
          res.on('end', () => finish());
          res.on('close', () => finish());
          let done = false;
          function finish() {
            if (done) return;
            done = true;
            const text = Buffer.concat(chunks).toString('utf8');
            resolve({
              url: rawUrl,
              method,
              status: res.statusCode,
              headers: res.headers,
              rawHeaders: res.rawHeaders,
              setCookie: res.headers['set-cookie'] || [],
              location: res.headers['location'] || '',
              body: text,
              request: { method, url: rawUrl, headers, body: body || '' },
            });
          }
        },
      );
      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy(new Error('timeout'));
      });
      if (body != null) req.write(body);
      req.end();
    });
  }

  // Inspect TLS without sending an HTTP payload. Returns cert + protocol info.
  async inspectTls(rawUrl) {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:') return null;
    if (this.scope && !this.scope.inScope(rawUrl)) {
      const err = new Error(`Out of scope: ${rawUrl}`);
      err.code = 'OUT_OF_SCOPE';
      throw err;
    }
    const host = u.hostname;
    const port = Number(u.port) || 443;
    const isIp = /^[0-9.]+$/.test(host) || host.includes(':');
    return await new Promise((resolve) => {
      let settled = false;
      const done = (val) => {
        if (settled) return;
        settled = true;
        try { socket.end(); } catch { /* ignore */ }
        resolve(val);
      };
      const socket = tls.connect(
        { host, port, ...(isIp ? {} : { servername: host }), rejectUnauthorized: false, timeout: this.timeoutMs },
        () => {
          const cert = socket.getPeerCertificate(false) || {};
          const authorized = socket.authorized;
          done({
            protocol: socket.getProtocol(),
            authorized,
            authorizationError: socket.authorizationError ? String(socket.authorizationError) : '',
            cert: {
              subject: cert.subject || {},
              issuer: cert.issuer || {},
              valid_from: cert.valid_from || '',
              valid_to: cert.valid_to || '',
              subjectaltname: cert.subjectaltname || '',
              fingerprint: cert.fingerprint || '',
            },
            host,
          });
        },
      );
      socket.on('error', (err) => done({ error: String(err && err.message || err), host, protocol: null }));
      socket.on('timeout', () => done({ error: 'timeout', host, protocol: null }));
    });
  }
}

class CancelError extends Error {
  constructor() {
    super('cancelled');
    this.code = 'CANCELLED';
  }
}

function truncate(s, n = TRUNCATE) {
  if (s == null) return '';
  s = String(s);
  return s.length > n ? s.slice(0, n) + `\n…[truncated ${s.length - n} bytes]` : s;
}

module.exports = { Client, CancelError, USER_AGENT, SAFE_METHODS, truncate };
