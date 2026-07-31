const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

let ctx;
before(async () => { ctx = await startTestServer(); });
after(async () => { await ctx.close(); });

test('settings round-trip (theme/language/opacity/week/view)', async () => {
  const put = await ctx.api('PUT', '/api/settings', {
    theme: 'light', language: 'en', bgOpacity: 80, weekStartsOn: 1, defaultView: 'week',
  });
  assert.strictEqual(put.status, 200);

  const get = await ctx.api('GET', '/api/settings');
  assert.strictEqual(get.body.theme, 'light');
  assert.strictEqual(get.body.language, 'en');
  assert.strictEqual(get.body.bgOpacity, 80);
  assert.strictEqual(get.body.weekStartsOn, 1);
  assert.strictEqual(get.body.defaultView, 'week');
});

test('partial update does not clobber other keys', async () => {
  await ctx.api('PUT', '/api/settings', { theme: 'dark' });
  const get = await ctx.api('GET', '/api/settings');
  assert.strictEqual(get.body.theme, 'dark');
  assert.strictEqual(get.body.language, 'en'); // from previous test's persistence
});

test('app-info exposes name/version/author', async () => {
  const r = await ctx.api('GET', '/api/app-info');
  assert.strictEqual(r.body.name, 'MyCalendar');
  assert.ok(r.body.version);
  assert.match(r.body.author, /SHKWON/);
});
