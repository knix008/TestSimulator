const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

let ctx;
before(async () => { ctx = await startTestServer(); });
after(async () => { await ctx.close(); });

const EV = {
  title: '테스트 회의',
  start: '2026-07-31T10:00:00.000Z',
  end: '2026-07-31T11:00:00.000Z',
  location: '회의실',
};

test('POST /api/events requires title/start/end', async () => {
  const r = await ctx.api('POST', '/api/events', { title: 'no times' });
  assert.strictEqual(r.status, 400);
});

test('create → list → get round-trip', async () => {
  const created = await ctx.api('POST', '/api/events', EV);
  assert.strictEqual(created.status, 201);
  assert.ok(created.body.id);
  assert.ok(created.body.uid, 'server assigns a uid');

  const list = await ctx.api('GET', '/api/events?from=2026-07-01T00:00:00Z&to=2026-08-01T00:00:00Z');
  assert.strictEqual(list.status, 200);
  assert.ok(list.body.some(e => e.id === created.body.id));

  const one = await ctx.api('GET', `/api/events/${created.body.id}`);
  assert.strictEqual(one.body.title, EV.title);
  assert.strictEqual(one.body.location, EV.location);
});

test('range filter excludes out-of-range events', async () => {
  const r = await ctx.api('GET', '/api/events?from=2020-01-01T00:00:00Z&to=2020-02-01T00:00:00Z');
  assert.strictEqual(r.body.length, 0);
});

test('update mutates fields', async () => {
  const c = await ctx.api('POST', '/api/events', EV);
  const u = await ctx.api('PUT', `/api/events/${c.body.id}`, { title: '수정된 제목' });
  assert.strictEqual(u.status, 200);
  assert.strictEqual(u.body.title, '수정된 제목');
});

test('delete removes a non-synced event', async () => {
  const c = await ctx.api('POST', '/api/events', EV);
  const d = await ctx.api('DELETE', `/api/events/${c.body.id}`);
  assert.strictEqual(d.status, 200);
  const g = await ctx.api('GET', `/api/events/${c.body.id}`);
  assert.strictEqual(g.status, 404);
});

test('GET missing event returns 404', async () => {
  const r = await ctx.api('GET', '/api/events/999999');
  assert.strictEqual(r.status, 404);
});

test('all-day event persists all_day flag', async () => {
  const c = await ctx.api('POST', '/api/events', {
    title: '하루종일', allDay: true,
    start: '2026-07-20T00:00:00.000Z', end: '2026-07-21T00:00:00.000Z',
  });
  assert.strictEqual(c.body.allDay, true);
});
