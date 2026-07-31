const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer, startIcsServer } = require('./helpers');

const ICS_TWO = [
  'BEGIN:VCALENDAR', 'VERSION:2.0',
  'BEGIN:VEVENT', 'UID:s1@t', 'SUMMARY:Sub A', 'DTSTART:20260805T010000Z', 'DTEND:20260805T020000Z', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:s2@t', 'SUMMARY:Sub B', 'DTSTART;VALUE=DATE:20260810', 'DTEND;VALUE=DATE:20260811', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const ICS_ONE = [
  'BEGIN:VCALENDAR', 'VERSION:2.0',
  'BEGIN:VEVENT', 'UID:s1@t', 'SUMMARY:Sub A (updated)', 'DTSTART:20260805T010000Z', 'DTEND:20260805T020000Z', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

let ctx, ics, body = ICS_TWO;
before(async () => {
  ctx = await startTestServer();
  ics = await startIcsServer(() => body);
});
after(async () => { await ics.close(); await ctx.close(); });

test('add requires a url', async () => {
  const r = await ctx.api('POST', '/api/subscriptions', { name: 'x' });
  assert.strictEqual(r.status, 400);
});

let subId;
test('add subscription imports events and creates a calendar', async () => {
  const r = await ctx.api('POST', '/api/subscriptions', { url: ics.url, name: 'Outlook' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.error, null);
  assert.strictEqual(r.body.summary.created, 2);
  subId = r.body.subscription.id;

  const cals = await ctx.api('GET', '/api/settings/calendars');
  assert.ok(cals.body.some(c => c.name === 'Outlook'), 'a calendar named after the sub exists');
});

test('list reports event count and ok status', async () => {
  const r = await ctx.api('GET', '/api/subscriptions');
  const sub = r.body.find(s => s.id === subId);
  assert.strictEqual(sub.eventCount, 2);
  assert.strictEqual(sub.last_status, 'ok');
});

test('imported events are queryable', async () => {
  const r = await ctx.api('GET', '/api/events?from=2026-08-01T00:00:00Z&to=2026-08-31T00:00:00Z');
  const titles = r.body.map(e => e.title);
  assert.ok(titles.includes('Sub A'));
  assert.ok(titles.includes('Sub B'));
});

test('refresh is idempotent (updates, no duplicates)', async () => {
  const r = await ctx.api('POST', `/api/subscriptions/${subId}/refresh`);
  assert.strictEqual(r.body.summary.created, 0);
  assert.strictEqual(r.body.summary.updated, 2);
  assert.strictEqual(r.body.summary.deleted, 0);
});

test('refresh prunes events removed from the feed', async () => {
  body = ICS_ONE; // feed now has only one event, with an updated title
  const r = await ctx.api('POST', `/api/subscriptions/${subId}/refresh`);
  assert.strictEqual(r.body.summary.deleted, 1);
  const evs = await ctx.api('GET', '/api/events?from=2026-08-01T00:00:00Z&to=2026-08-31T00:00:00Z');
  const titles = evs.body.map(e => e.title);
  assert.ok(titles.includes('Sub A (updated)'));
  assert.ok(!titles.includes('Sub B'));
});

test('delete removes the subscription and its events', async () => {
  const d = await ctx.api('DELETE', `/api/subscriptions/${subId}`);
  assert.strictEqual(d.status, 200);
  const list = await ctx.api('GET', '/api/subscriptions');
  assert.ok(!list.body.some(s => s.id === subId));
  const evs = await ctx.api('GET', '/api/events?from=2026-08-01T00:00:00Z&to=2026-08-31T00:00:00Z');
  assert.strictEqual(evs.body.length, 0);
});
