'use strict';

// Authentication for authenticated scans.
//
// Two recording styles are supported:
//
//   * HTTP sequence (no browser) — options.auth.sequence:
//       [{ method, url, form|json, extract: { name: regex | { json: 'a.b' } } }]
//     Earlier-extracted values substitute as ${name} in later urls/bodies.
//     Set-Cookie responses are captured into the client; a variable named
//     `bearer` (or options.auth.bearerVar) becomes the Authorization bearer.
//
//   * Browser script — options.auth.script:
//       [{ action:'goto'|'fill'|'click'|'submit'|'wait', selector?, value?, url? }]
//     Driven in the headless browser; afterwards the page cookies are copied
//     into the HTTP client so the scan continues authenticated.
//
// Session verification (loggedInPattern / loggedOutPattern / checkUrl / loginUrl)
// detects session loss during the scan and triggers an automatic re-login.
// Bearer tokens can be refreshed from options.auth.tokenEndpoint.

// ${name} substitution over strings and plain-object values.
function substitute(value, vars) {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, vars));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = substitute(v, vars);
    return out;
  }
  return value;
}

function jsonPath(obj, pathStr) {
  let cur = obj;
  for (const part of String(pathStr).split('.')) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

// Apply an extract spec { name: regexString | { json:'a.b' } | { regex:'...' } }
// to one response, writing into `vars`.
function extractVars(res, spec, vars) {
  if (!spec) return;
  const body = res.body || '';
  let parsed;
  for (const [name, rule] of Object.entries(spec)) {
    try {
      if (rule && typeof rule === 'object' && rule.json) {
        if (parsed === undefined) { try { parsed = JSON.parse(body); } catch { parsed = null; } }
        const v = jsonPath(parsed, rule.json);
        if (v != null) vars[name] = v;
      } else {
        const reStr = (rule && typeof rule === 'object') ? rule.regex : rule;
        if (reStr) {
          const re = new RegExp(reStr);
          const m = re.exec(body);
          if (m) vars[name] = m[1] != null ? m[1] : m[0];
        }
      }
    } catch { /* ignore a single bad extract rule */ }
  }
}

function captureCookies(client, res) {
  for (const sc of res.setCookie || []) {
    const first = sc.split(';')[0];
    const eq = first.indexOf('=');
    if (eq > 0) client._cookies.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
  }
}

// Run the HTTP login sequence. Returns { ok, vars }. Cookies and bearer are
// applied to the client in place.
async function runHttpSequence(client, scope, steps, baseVars, emit) {
  const vars = { ...(baseVars || {}) };
  for (const raw of steps || []) {
    const step = raw || {};
    const url = substitute(step.url, vars);
    if (!url || !scope.inScope(url)) {
      if (emit) emit('error', { phase: 'auth', message: `login step url out of scope: ${url}` });
      return { ok: false, vars };
    }
    const method = (step.method || 'POST').toUpperCase();
    const opts = { method: method === 'GET' ? 'GET' : method };
    if (step.json != null) {
      opts.headers = { 'content-type': 'application/json' };
      opts.body = JSON.stringify(substitute(step.json, vars));
    } else if (step.form != null) {
      const form = substitute(step.form, vars);
      opts.body = new URLSearchParams(form).toString();
    }
    let res;
    try {
      res = await client.request(url, opts);
    } catch (err) {
      if (err.code === 'CANCELLED') throw err;
      if (emit) emit('error', { phase: 'auth', message: String(err.message || err) });
      return { ok: false, vars };
    }
    captureCookies(client, res);
    extractVars(res, step.extract, vars);
  }
  applyBearer(client, vars, baseVars && baseVars.__bearerVar);
  return { ok: true, vars };
}

function applyBearer(client, vars, bearerVar) {
  const key = bearerVar || 'bearer';
  if (vars[key] != null) {
    client.auth = client.auth || {};
    client.auth.bearer = String(vars[key]);
  }
}

// Refresh a bearer token from a token endpoint. tokenEndpoint:
//   { method, url, form|json, extract:{ bearer: ... } , bearerVar? }
async function refreshBearer(client, scope, tokenEndpoint, baseVars, emit) {
  if (!tokenEndpoint || !tokenEndpoint.url) return { ok: false };
  const vars = { ...(baseVars || {}) };
  const bearerVar = tokenEndpoint.bearerVar || 'bearer';
  const res = await runHttpSequence(
    client, scope,
    [{ method: tokenEndpoint.method || 'POST', url: tokenEndpoint.url, form: tokenEndpoint.form, json: tokenEndpoint.json, extract: tokenEndpoint.extract }],
    { ...vars, __bearerVar: bearerVar }, emit,
  );
  return { ok: res.ok && client.auth && client.auth.bearer != null };
}

// Verify the session is still valid by fetching checkUrl and matching patterns.
// Returns true when logged in, false when logged out / unknown-loggedout.
async function verifySession(client, scope, auth) {
  if (!auth) return true;
  const checkUrl = auth.checkUrl;
  if (!checkUrl || !scope.inScope(checkUrl)) return true;
  let res;
  try { res = await client.request(checkUrl, { method: 'GET' }); }
  catch (err) { if (err.code === 'CANCELLED') throw err; return true; }
  return !sessionLost(res, auth);
}

// Decide from a response whether the authenticated session has been lost.
function sessionLost(res, auth) {
  if (!res || !auth) return false;
  const body = res.body || '';
  // Redirect to the login URL is a strong signal.
  if (auth.loginUrl && res.status >= 300 && res.status < 400) {
    const loc = res.location || '';
    try {
      const target = new URL(loc, res.url).href;
      if (target.startsWith(auth.loginUrl) || loc.startsWith(auth.loginUrl)) return true;
    } catch { /* ignore */ }
  }
  if (auth.loggedOutPattern) {
    try { if (new RegExp(auth.loggedOutPattern).test(body)) return true; } catch { /* ignore */ }
  }
  if (auth.loggedInPattern) {
    try { if (!new RegExp(auth.loggedInPattern).test(body) && res.status < 400) return true; } catch { /* ignore */ }
  }
  return false;
}

// ---- Browser login ---------------------------------------------------------

// Run a recorded browser login script against an open BrowserSession, then copy
// the resulting page cookies into the HTTP client.
async function runBrowserLogin(session, client, scope, script, emit) {
  for (const raw of script || []) {
    const step = raw || {};
    try {
      switch (step.action) {
        case 'goto':
          if (step.url && scope.inScope(step.url)) await session.navigate(step.url, 5000);
          break;
        case 'fill':
          await session.evaluate(fillExpr(step.selector, step.value));
          break;
        case 'click':
          await session.evaluate(clickExpr(step.selector));
          await session.waitNetworkIdle(300, 3000);
          break;
        case 'submit':
          await session.evaluate(submitExpr(step.selector));
          await session.waitNetworkIdle(400, 5000);
          break;
        case 'wait':
          if (step.selector) await waitForSelector(session, step.selector, 4000);
          else await session.waitNetworkIdle(300, step.value ? Number(step.value) : 2000);
          break;
        default:
          break;
      }
    } catch (err) {
      if (emit) emit('error', { phase: 'auth', message: `browser login step failed: ${String(err.message || err)}` });
    }
  }
  // Copy cookies from the browser into the HTTP client.
  try {
    const got = await session.cmd('Network.getCookies', {});
    for (const c of (got && got.cookies) || []) {
      if (c && c.name) client._cookies.set(c.name, c.value);
    }
  } catch { /* ignore */ }
  return { ok: true };
}

function jsStr(s) { return JSON.stringify(String(s == null ? '' : s)); }

function fillExpr(selector, value) {
  return `(function(){var el=document.querySelector(${jsStr(selector)});` +
    `if(el){el.value=${jsStr(value)};` +
    `el.dispatchEvent(new Event('input',{bubbles:true}));` +
    `el.dispatchEvent(new Event('change',{bubbles:true}));}return !!el;})()`;
}

function clickExpr(selector) {
  return `(function(){var el=document.querySelector(${jsStr(selector)});if(el){el.click();}return !!el;})()`;
}

function submitExpr(selector) {
  return `(function(){var el=document.querySelector(${jsStr(selector)});if(!el)return false;` +
    `if(el.tagName==='FORM'){el.submit();}else if(el.form){` +
    `if(typeof el.form.requestSubmit==='function'){el.form.requestSubmit(el);}else{el.form.submit();}}` +
    `else{el.click();}return true;})()`;
}

async function waitForSelector(session, selector, maxMs) {
  const deadline = Date.now() + (maxMs || 4000);
  while (Date.now() < deadline) {
    let found = false;
    try { found = await session.evaluate(`!!document.querySelector(${jsStr(selector)})`); } catch { /* ignore */ }
    if (found) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

module.exports = {
  substitute,
  extractVars,
  jsonPath,
  runHttpSequence,
  refreshBearer,
  verifySession,
  sessionLost,
  runBrowserLogin,
  captureCookies,
};
