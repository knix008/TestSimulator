import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { http, listen, close, readBody, html, makeClient, createScope } from './dast-helpers.mjs';

const require = createRequire(import.meta.url);
const dast = require('../core/dast/index.js');
const authMod = require('../core/dast/auth.js');

// Test app: /sign-in issues a form token, /session accepts it and sets a cookie.
// The session ends after /page-a is viewed, so /page-b redirects to /sign-in.
function appServer(state) {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const sid = (/sid=([^;]+)/.exec(req.headers.cookie || '') || [])[1];
    if (u.pathname === '/sign-in') return html(res, 200, '<form><input name="formtoken" value="ft-42"></form>');
    if (u.pathname === '/session' && req.method === 'POST') {
      const body = new URLSearchParams(await readBody(req));
      state.tokens.push(body.get('formtoken'));
      if (body.get('name') === 'tester' && body.get('formtoken') === 'ft-42') {
        state.logins += 1;
        state.valid = 's' + state.logins;
        return html(res, 200, 'ok', { 'Set-Cookie': `sid=${state.valid}; Path=/; HttpOnly; Secure; SameSite=Lax` });
      }
      return html(res, 401, 'no');
    }
    if (u.pathname === '/') return html(res, 200, '<a href="/page-a">a</a><a href="/page-b">b</a>');
    if (u.pathname === '/page-a' || u.pathname === '/page-b') {
      if (sid && sid === state.valid) {
        if (u.pathname === '/page-a' && !state.pageACookie) { state.pageACookie = sid; state.valid = null; }
        return html(res, 200, 'Signed in');
      }
      return html(res, 302, 'redirect', { Location: '/sign-in' });
    }
    return html(res, 404, 'not found');
  });
}

test('HTTP login sequence substitutes extracted values, detects session loss and logs in again', async () => {
  const state = { valid: null, logins: 0, tokens: [], pageACookie: '' };
  const server = appServer(state);
  const base = await listen(server);
  try {
    const phases = [];
    const scan = dast.createScan({
      target: base, rateLimit: 1000, maxRequests: 200,
      auth: {
        loginUrl: base + '/sign-in',
        sequence: [
          { method: 'GET', url: base + '/sign-in', extract: { ft: 'name="formtoken" value="([^"]+)"' } },
          { method: 'POST', url: base + '/session', form: { name: 'tester', formtoken: '${ft}' } },
        ],
      },
    });
    scan.on('progress', (p) => phases.push(p.phase));
    await scan.start();
    assert.equal(state.pageACookie, 's1');
    assert.ok(state.tokens.length >= 1 && state.tokens.every((t) => t === 'ft-42'));
    assert.ok(state.logins >= 2, `expected a second login, got ${state.logins}`);
    assert.ok(phases.includes('relogin'));
  } finally {
    await close(server);
  }
});

test('auth helpers: substitution, JSON extraction and session patterns', () => {
  assert.equal(authMod.substitute('a=${x}&b=${y}', { x: 1 }), 'a=1&b=${y}');
  assert.deepEqual(authMod.substitute({ k: '${x}' }, { x: 'v' }), { k: 'v' });
  const vars = {};
  authMod.extractVars({ body: '{"data":{"token":"T1"}}' }, { tok: { json: 'data.token' } }, vars);
  assert.equal(vars.tok, 'T1');
  assert.ok(authMod.sessionLost({ status: 200, body: 'Please sign in' }, { loggedOutPattern: 'sign in' }));
  assert.ok(authMod.sessionLost({ status: 200, body: 'hello' }, { loggedInPattern: 'Sign out' }));
  assert.ok(!authMod.sessionLost({ status: 200, body: 'Sign out' }, { loggedInPattern: 'Sign out' }));
  assert.ok(authMod.sessionLost({ status: 302, location: '/sign-in', url: 'http://h/x' }, { loginUrl: 'http://h/sign-in' }));
});

test('bearer token is refreshed from a token endpoint', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ access_token: 'fresh-value' }));
  });
  const base = await listen(server);
  try {
    const client = makeClient(base);
    const r = await authMod.refreshBearer(client, createScope({ target: base }),
      { url: base + '/token', form: { grant_type: 'refresh' }, extract: { bearer: { json: 'access_token' } } });
    assert.ok(r.ok);
    assert.equal(client.auth.bearer, 'fresh-value');
  } finally {
    await close(server);
  }
});

test('verifySession reports a lost session from checkUrl', async () => {
  const server = http.createServer((req, res) => html(res, 200, 'Please sign in'));
  const base = await listen(server);
  try {
    const ok = await authMod.verifySession(makeClient(base), createScope({ target: base }),
      { checkUrl: base + '/me', loggedOutPattern: 'sign in' });
    assert.equal(ok, false);
  } finally {
    await close(server);
  }
});
