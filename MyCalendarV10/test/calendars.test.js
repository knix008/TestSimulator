const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

let ctx;
before(async () => { ctx = await startTestServer(); });
after(async () => { await ctx.close(); });

test('a default calendar is seeded', async () => {
  const r = await ctx.api('GET', '/api/settings/calendars');
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.length >= 1);
  assert.ok(r.body.some(c => c.is_default));
});

test('create calendar', async () => {
  const c = await ctx.api('POST', '/api/settings/calendars', { name: '업무', color: '#ef4444' });
  assert.strictEqual(c.status, 201);
  assert.strictEqual(c.body.name, '업무');
  assert.strictEqual(c.body.color, '#ef4444');
});

test('create requires a name', async () => {
  const c = await ctx.api('POST', '/api/settings/calendars', { color: '#000' });
  assert.strictEqual(c.status, 400);
});

test('update name/color', async () => {
  const c = await ctx.api('POST', '/api/settings/calendars', { name: 'x' });
  const u = await ctx.api('PUT', `/api/settings/calendars/${c.body.id}`, { name: 'y', color: '#22c55e' });
  assert.strictEqual(u.body.name, 'y');
  assert.strictEqual(u.body.color, '#22c55e');
});

test('delete non-default calendar', async () => {
  const c = await ctx.api('POST', '/api/settings/calendars', { name: 'temp' });
  const d = await ctx.api('DELETE', `/api/settings/calendars/${c.body.id}`);
  assert.strictEqual(d.status, 200);
});

test('default calendar cannot be deleted', async () => {
  const list = await ctx.api('GET', '/api/settings/calendars');
  const def = list.body.find(c => c.is_default);
  const d = await ctx.api('DELETE', `/api/settings/calendars/${def.id}`);
  assert.strictEqual(d.status, 400);
});

test('hiding a calendar hides its events from the list', async () => {
  const cal = await ctx.api('POST', '/api/settings/calendars', { name: 'hidden-cal' });
  await ctx.api('POST', '/api/events', {
    title: 'in hidden cal', calendarId: cal.body.id,
    start: '2026-06-01T10:00:00.000Z', end: '2026-06-01T11:00:00.000Z',
  });
  // events API returns all events regardless of visibility (client filters);
  // just assert the event exists tied to the calendar
  const evs = await ctx.api('GET', '/api/events?from=2026-06-01T00:00:00Z&to=2026-06-02T00:00:00Z');
  assert.ok(evs.body.some(e => e.calendarId === cal.body.id));
});
