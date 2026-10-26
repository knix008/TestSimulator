'use strict';

// Additional active/observational checks: SSRF (with an in-process callback
// listener), JWT algorithm weaknesses on bearer tokens, dangerous HTTP methods
// advertised by the server, and absence of rate limiting on login.

const http = require('http');
const { URL } = require('url');
const { truncate } = require('./client');

let counter = 0;
function marker(prefix) {
  counter += 1;
  return `mcc${prefix}${Date.now().toString(36)}${counter}x`;
}

function headerStr(h) {
  return Object.entries(h || {})
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join('\n');
}

// ---- SSRF callback listener ------------------------------------------------

// A loopback HTTP listener the *target* is tricked into calling. If a probe
// token arrives here, the target fetched our URL — conclusive SSRF. The scanner
// never requests this listener itself, so it is outside the scope allowlist by
// design (only the scanned app reaches it).
class SsrfCallback {
  constructor() {
    this.hits = new Map(); // token -> { ua, from }
    this.server = null;
    this.base = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const m = /[?&]t=([^&]+)/.exec(req.url || '');
        const token = m ? decodeURIComponent(m[1]) : (req.url || '');
        this.hits.set(token, { ua: req.headers['user-agent'] || '', from: req.socket.remoteAddress || '' });
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('ok');
      });
      this.server.on('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        const { port } = this.server.address();
        this.base = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  }

  url(token) { return `${this.base}/cb?t=${encodeURIComponent(token)}`; }
  hit(token) { return this.hits.has(token); }

  stop() {
    return new Promise((resolve) => {
      if (!this.server) { resolve(); return; }
      this.server.close(() => resolve());
    });
  }
}

const SSRF_PARAM = /^(url|uri|dest|destination|redirect|redirect_uri|callback|webhook|target|path|domain|host|feed|site|proxy|fetch|load|image|img|file|src|resource|api|endpoint|link|data|out|to|next|continue|return)$/i;

function looksLikeUrlValue(v) {
  return typeof v === 'string' && (/^https?:\/\//i.test(v) || /^\/\//.test(v) || /^\//.test(v));
}

// Probe one injection point for SSRF by injecting the callback URL and waiting
// briefly for a hit. `send` is the bound sender from active.js.
async function ssrfProbe(send, point, callback, settleMs) {
  const findings = [];
  const interesting = SSRF_PARAM.test(point.param) || looksLikeUrlValue(point.baseValue);
  if (!interesting) return findings;
  const token = marker('ssrf');
  const cbUrl = callback.url(token);
  let res;
  try { res = await send(cbUrl); }
  catch (err) { if (err.code === 'CANCELLED' || err.code === 'BUDGET') throw err; return findings; }
  // Give the target a moment to make the out-of-band request.
  const deadline = Date.now() + (settleMs || 600);
  while (!callback.hit(token) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (callback.hit(token)) {
    findings.push({
      rule: 'dast:ssrf',
      url: point.url,
      method: point.method,
      param: point.param,
      evidence: truncate(`Target fetched the out-of-band callback ${cbUrl}`, 400),
      request: truncate(`${res.request.method} ${res.request.url}${res.request.body ? '\n\n' + res.request.body : ''}`, 400),
      response: truncate(`HTTP ${res.status}\n${headerStr(res.headers)}`, 600),
      message: {
        en: `Parameter '${point.param}' caused the server to request an attacker-controlled URL — server-side request forgery.`,
        ko: `파라미터 '${point.param}'로 인해 서버가 공격자가 지정한 URL을 요청해 SSRF가 확인되었습니다.`,
      },
    });
  }
  return findings;
}

// ---- JWT algorithm analysis ------------------------------------------------

function b64urlDecode(seg) {
  try {
    const s = String(seg).replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
    return Buffer.from(s + pad, 'base64').toString('utf8');
  } catch { return ''; }
}

function parseJwt(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  let header;
  try { header = JSON.parse(b64urlDecode(parts[0])); } catch { return null; }
  if (!header || typeof header !== 'object') return null;
  return { header, signature: parts[2] || '', parts };
}

// Analyze a bearer token for algorithm weaknesses. `where` describes the source
// (e.g. 'Authorization header'). Returns findings.
function analyzeJwt(token, where, urlForReport) {
  const findings = [];
  const jwt = parseJwt(token);
  if (!jwt) return findings;
  const alg = String(jwt.header.alg || '').toUpperCase();
  const base = { url: urlForReport || where, method: 'GET', param: 'Authorization' };
  if (alg === 'NONE' || alg === '' || jwt.signature === '') {
    findings.push({
      rule: 'dast:jwt-none-alg',
      ...base,
      evidence: truncate(`JWT header alg=${jwt.header.alg || '(none)'}, signature ${jwt.signature ? 'present' : 'empty'} (${where})`, 300),
      request: `(observed) ${where}`,
      response: `JWT header: ${JSON.stringify(jwt.header)}`,
      message: {
        en: `A bearer JWT uses the "${jwt.header.alg || 'none'}" algorithm or carries no signature; such tokens can be forged.`,
        ko: `Bearer JWT가 "${jwt.header.alg || 'none'}" 알고리즘을 쓰거나 서명이 없어 토큰 위조가 가능합니다.`,
      },
    });
  } else if (/^HS\d+$/.test(alg)) {
    findings.push({
      rule: 'dast:jwt-weak-alg',
      ...base,
      evidence: truncate(`JWT header alg=${alg} (symmetric HMAC) (${where})`, 300),
      request: `(observed) ${where}`,
      response: `JWT header: ${JSON.stringify(jwt.header)}`,
      message: {
        en: `A bearer JWT is signed with symmetric ${alg}; sharing the secret for verification enables algorithm-confusion/key-leak attacks. Prefer asymmetric (RS/ES).`,
        ko: `Bearer JWT가 대칭키 ${alg}로 서명되어 검증용 비밀 공유 시 알고리즘 혼동·키 유출 공격에 취약합니다. 비대칭(RS/ES)을 권장합니다.`,
      },
    });
  }
  return findings;
}

// ---- Dangerous HTTP methods (from an OPTIONS Allow header) -----------------

const DANGEROUS_METHODS = ['PUT', 'DELETE', 'PATCH'];

// Inspect an Allow header (already obtained via a safe OPTIONS request) and
// flag write methods. We never actually send PUT/DELETE/PATCH.
function dangerousMethods(allowHeader, url) {
  const findings = [];
  if (!allowHeader) return findings;
  const allowed = String(allowHeader).toUpperCase().split(/[,\s]+/).filter(Boolean);
  const danger = DANGEROUS_METHODS.filter((m) => allowed.includes(m));
  if (danger.length) {
    findings.push({
      rule: 'dast:http-dangerous-method',
      url,
      method: 'OPTIONS',
      param: null,
      evidence: `Allow advertises write methods: ${danger.join(', ')}`,
      request: `OPTIONS ${url}`,
      response: `Allow: ${allowHeader}`,
      message: {
        en: `The server advertises write methods (${danger.join(', ')}) via Allow; ensure they are authenticated and intended.`,
        ko: `서버가 Allow로 쓰기 메서드(${danger.join(', ')})를 광고합니다. 인증·의도 여부를 확인하세요.`,
      },
    });
  }
  return findings;
}

// ---- Login rate-limit absence ---------------------------------------------

// Fire a bounded number of failed-login requests and report if none is ever
// throttled (no 429 / rate-limit response). Uses deliberately wrong, harmless
// credentials. Returns findings.
async function rateLimitLoginCheck(client, scope, loginUrl, fields, attempts) {
  const findings = [];
  if (!loginUrl || !scope.inScope(loginUrl)) return findings;
  const n = Math.max(3, Math.min(attempts || 6, 10));
  let throttled = false;
  let sent = 0;
  for (let i = 0; i < n; i++) {
    const body = new URLSearchParams({ ...(fields || {}), __mcc_rl: String(i) }).toString();
    let res;
    try { res = await client.request(loginUrl, { method: 'POST', body }); }
    catch (err) { if (err.code === 'CANCELLED' || err.code === 'BUDGET') { throttled = true; break; } break; }
    sent += 1;
    const ra = res.headers['retry-after'];
    if (res.status === 429 || res.status === 503 || ra) { throttled = true; break; }
  }
  if (!throttled && sent >= n) {
    findings.push({
      rule: 'dast:rate-limit-missing',
      url: loginUrl,
      method: 'POST',
      param: null,
      evidence: `${sent} rapid failed-login requests, none throttled (no 429/Retry-After)`,
      request: `POST ${loginUrl} x${sent}`,
      response: 'No rate-limit response observed',
      message: {
        en: 'The login endpoint accepted many rapid failed attempts without throttling, enabling credential brute-force.',
        ko: '로그인 엔드포인트가 다수의 빠른 실패 시도를 제한 없이 허용해 자격증명 무차별 대입에 취약합니다.',
      },
    });
  }
  return findings;
}

module.exports = {
  SsrfCallback,
  ssrfProbe,
  parseJwt,
  analyzeJwt,
  dangerousMethods,
  rateLimitLoginCheck,
  SSRF_PARAM,
};
