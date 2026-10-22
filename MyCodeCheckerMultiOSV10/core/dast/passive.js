'use strict';

const { truncate } = require('./client');

// Small bundled table of known-vulnerable client library version ranges.
// Deliberately conservative (major advisories only) and offline.
const LIB_VULNS = [
  { name: 'jquery', lt: '3.5.0', note: 'XSS in htmlPrefilter/jQuery.htmlPrefilter (CVE-2020-11022/11023)' },
  { name: 'angular', lt: '1.8.0', note: 'Multiple AngularJS 1.x XSS/prototype issues; 1.x is end-of-life' },
  { name: 'bootstrap', lt: '3.4.1', note: 'XSS in data-* attributes (CVE-2019-8331 and earlier)' },
  { name: 'lodash', lt: '4.17.21', note: 'Prototype pollution / ReDoS (CVE-2019-10744, CVE-2020-8203)' },
  { name: 'moment', lt: '2.29.4', note: 'ReDoS / path traversal (CVE-2022-31129, CVE-2017-18214)' },
];

function cmpVersion(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

function detectLibraries(scriptUrls, inlineBanner) {
  const hits = [];
  const haystacks = [...scriptUrls];
  if (inlineBanner) haystacks.push(inlineBanner);
  for (const s of haystacks) {
    for (const lib of LIB_VULNS) {
      // match name followed by a version like jquery-3.4.1(.min).js or /angular@1.7.9/
      const re = new RegExp(lib.name + '[-/@._]?v?(\\d+\\.\\d+(?:\\.\\d+)?)', 'i');
      const m = re.exec(s);
      if (m && cmpVersion(m[1], lib.lt) < 0) {
        hits.push({ lib: lib.name, version: m[1], fixed: lib.lt, note: lib.note, where: s });
      }
    }
  }
  return hits;
}

const DB_ERRORS = [
  { re: /you have an error in your sql syntax/i, db: 'MySQL' },
  { re: /warning:\s+mysql/i, db: 'MySQL' },
  { re: /mysql_fetch_/i, db: 'MySQL' },
  { re: /unclosed quotation mark after the character string/i, db: 'MSSQL' },
  { re: /microsoft (?:odbc|ole db|sql server)/i, db: 'MSSQL' },
  { re: /pg_query\(\)|pg_exec\(\)/i, db: 'PostgreSQL' },
  { re: /postgresql.*error|unterminated quoted string/i, db: 'PostgreSQL' },
  { re: /ora-\d{5}/i, db: 'Oracle' },
  { re: /quoted string not properly terminated/i, db: 'Oracle' },
  { re: /sqlite_error|sqlite3?\.|unrecognized token:|near ".*": syntax error/i, db: 'SQLite' },
];

function matchDbError(body) {
  for (const sig of DB_ERRORS) if (sig.re.test(body)) return sig.db;
  return null;
}

const STACK_SIGNS = [
  /Traceback \(most recent call last\)/,
  /at [\w.$]+\([\w./\\:-]+:\d+:\d+\)/, // JS stack frame
  /java\.lang\.[A-Za-z.]+Exception/,
  /System\.[A-Za-z.]+Exception/,
  /org\.springframework\./,
  /Fatal error:.*on line \d+/i,
  /Warning:.*in .*on line \d+/i,
  /\bstack trace\b/i,
];

const SENSITIVE_PARAM = /(pass(word|wd)?|pwd|secret|token|api[_-]?key|auth|session|access[_-]?token)/i;
const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/;
const INTERNAL_IP = /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/;
const REDIRECT_PARAMS = /^(next|url|redirect|redirect_uri|redirect_url|return|returnurl|return_url|dest|destination|continue|goto|target|out|r|u)$/i;

function f(rule, res, extra) {
  return {
    rule,
    url: res.url,
    method: res.method,
    param: extra.param || null,
    evidence: truncate(extra.evidence || '', 400),
    request: extra.request || summarizeReq(res),
    response: extra.response || summarizeRes(res),
    ...(extra.message ? { message: extra.message } : {}),
  };
}

function summarizeReq(res) {
  const r = res.request || {};
  return truncate(`${r.method || res.method} ${r.url || res.url}`, 300);
}

function summarizeRes(res) {
  const hdr = Object.entries(res.headers || {})
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join('\n');
  return truncate(`HTTP ${res.status}\n${hdr}\n\n${res.body || ''}`, 1500);
}

// Run all passive checks on one response. `authed` marks responses the scan
// reached while authenticated (for cache-control checks).
function passiveChecks(res, page, ctx = {}) {
  const findings = [];
  const h = res.headers || {};
  const isHttps = res.url.startsWith('https:');
  const ctype = String(h['content-type'] || '');
  const isHtml = /html/i.test(ctype);
  const body = res.body || '';
  const add = (rule, extra = {}) => findings.push(f(rule, res, extra));

  // Only evaluate header policy on main document (HTML) responses.
  if (isHtml && res.status < 400) {
    const csp = h['content-security-policy'];
    if (!csp) add('dast:missing-csp', { evidence: 'No Content-Security-Policy header' });
    else {
      const c = csp.toLowerCase();
      if (c.includes("'unsafe-inline'")) add('dast:csp-unsafe-inline', { evidence: csp });
      if (c.includes("'unsafe-eval'")) add('dast:csp-unsafe-eval', { evidence: csp });
      if (/(?:^|[\s:])\*|https?:\s|:\s\*|\*\s|default-src[^;]*\*|script-src[^;]*\*/.test(c) && /\*/.test(c)) {
        add('dast:csp-wildcard', { evidence: csp });
      }
    }
    if (isHttps && !h['strict-transport-security']) add('dast:missing-hsts', { evidence: 'No Strict-Transport-Security on HTTPS response' });
    if (!h['x-content-type-options']) add('dast:missing-x-content-type-options', { evidence: 'No X-Content-Type-Options' });
    const frameAncestors = csp && /frame-ancestors/i.test(csp);
    if (!h['x-frame-options'] && !frameAncestors) add('dast:missing-frame-protection', { evidence: 'No X-Frame-Options and no CSP frame-ancestors' });
    if (!h['referrer-policy']) add('dast:missing-referrer-policy', { evidence: 'No Referrer-Policy' });
    if (!h['permissions-policy'] && !h['feature-policy']) add('dast:missing-permissions-policy', { evidence: 'No Permissions-Policy' });

    if (ctx.authed) {
      const cc = String(h['cache-control'] || '').toLowerCase();
      if (!/no-store/.test(cc)) add('dast:cache-sensitive', { evidence: `Cache-Control: ${h['cache-control'] || '(none)'}` });
    }
  }

  // Cookies
  for (const sc of res.setCookie || []) {
    const name = sc.split('=')[0].trim();
    const low = sc.toLowerCase();
    if (!/;\s*secure/.test(low)) add('dast:cookie-no-secure', { param: name, evidence: sc });
    if (!/;\s*httponly/.test(low)) add('dast:cookie-no-httponly', { param: name, evidence: sc });
    if (!/;\s*samesite=/.test(low)) add('dast:cookie-no-samesite', { param: name, evidence: sc });
  }

  // Information disclosure (headers)
  if (h['server'] && /\d/.test(h['server'])) add('dast:server-version', { param: 'Server', evidence: `Server: ${h['server']}` });
  if (h['x-powered-by']) add('dast:server-version', { param: 'X-Powered-By', evidence: `X-Powered-By: ${h['x-powered-by']}` });

  // Information disclosure (body)
  const dbErr = matchDbError(body);
  // db error signatures are also reported by active sqli; here only as info in passive if present
  if (STACK_SIGNS.some((re) => re.test(body))) add('dast:stack-trace', { evidence: firstMatch(body, STACK_SIGNS) });
  if (INTERNAL_IP.test(body)) add('dast:internal-ip', { evidence: (body.match(INTERNAL_IP) || [''])[0] });

  // Directory listing
  if (isHtml && /<title>\s*Index of \//i.test(body)) add('dast:directory-listing', { evidence: 'Index of / page' });
  else if (isHtml && /Directory listing for /i.test(body)) add('dast:directory-listing', { evidence: 'Directory listing for' });

  // Mixed content + insecure form action (on HTTPS pages)
  if (isHttps && isHtml) {
    const mixed = body.match(/(?:src|href)\s*=\s*["']http:\/\/[^"']+/i);
    if (mixed) add('dast:mixed-content', { evidence: mixed[0] });
  }
  for (const form of page && page.forms ? page.forms : []) {
    if (/^http:\/\//i.test(form.action || '')) add('dast:insecure-form-action', { evidence: `form action=${form.action}` });
    const hasPw = (form.fields || []).some((fl) => fl.type === 'password');
    if (hasPw) {
      const autoOff = (form.fields || []).some((fl) => fl.type === 'password' && fl.autocomplete && /off|new-password/i.test(fl.autocomplete));
      const formAuto = form.autocomplete && /off/i.test(form.autocomplete);
      if (!autoOff && !formAuto) add('dast:password-autocomplete', { evidence: 'password field without autocomplete=off/new-password' });
    }
  }

  // URL hygiene
  try {
    const u = new URL(res.url);
    if (JWT_RE.test(u.search)) add('dast:jwt-in-url', { evidence: 'JWT in query string' });
    for (const [k] of u.searchParams) {
      if (SENSITIVE_PARAM.test(k)) add('dast:sensitive-data-in-url', { param: k, evidence: `${k} in URL query` });
      if (REDIRECT_PARAMS.test(k)) add('dast:open-redirect-param', { param: k, evidence: `redirect-like parameter ${k}` });
    }
  } catch { /* ignore */ }

  // Source map exposure (when fetching a .js that references or is a map)
  if (/\.map(\?|$)/.test(res.url) && res.status < 400) add('dast:source-map-exposed', { evidence: res.url });
  if (/javascript/i.test(ctype) && /\/\/[#@]\s*sourceMappingURL=/.test(body)) {
    // only a hint; report the reference
    add('dast:source-map-exposed', { evidence: firstMatch(body, [/\/\/[#@]\s*sourceMappingURL=.*/]) });
  }

  // Outdated libraries
  const libs = detectLibraries(page && page.scripts ? page.scripts : [], body.slice(0, 4000));
  for (const lib of libs) {
    add('dast:outdated-js-library', {
      param: lib.lib,
      evidence: `${lib.lib} ${lib.version} (< ${lib.fixed}): ${lib.note}`,
      message: {
        en: `${lib.lib} ${lib.version} is below the fixed version ${lib.fixed}. ${lib.note}`,
        ko: `${lib.lib} ${lib.version}은(는) 수정 버전 ${lib.fixed}보다 낮아요. ${lib.note}`,
      },
    });
  }

  return { findings, dbError: dbErr };
}

function firstMatch(body, regexes) {
  for (const re of regexes) {
    const m = body.match(re);
    if (m) return m[0].slice(0, 300);
  }
  return '';
}

module.exports = { passiveChecks, detectLibraries, matchDbError, cmpVersion, LIB_VULNS };
