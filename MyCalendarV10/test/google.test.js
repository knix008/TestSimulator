// Set embedded credentials via env BEFORE the server starts so the flow is deterministic.
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

let ctx;
before(async () => { ctx = await startTestServer(); });
after(async () => { await ctx.close(); });

test('status: credentials embedded, not yet connected', async () => {
  const r = await ctx.api('GET', '/api/google/status');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.hasCredentials, true);
  assert.strictEqual(r.body.embedded, true);
  assert.strictEqual(r.body.connected, false);
});

test('auth-url is generated from embedded credentials', async () => {
  const r = await ctx.api('GET', '/api/google/auth-url');
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.url.startsWith('https://accounts.google.com/'));
  assert.match(r.body.url, /test-client-id/);
  assert.match(decodeURIComponent(r.body.url), /calendar/);
});

test('disconnect is a safe no-op when not connected', async () => {
  const r = await ctx.api('POST', '/api/google/disconnect');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.ok, true);
});
