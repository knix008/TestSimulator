const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parseIcs, parseIcsDate } = require('../src/services/ics-parser');

const sample = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample.ics'), 'utf8');

test('parses all VEVENTs in the fixture', () => {
  const events = parseIcs(sample);
  assert.strictEqual(events.length, 4);
});

test('timed UTC event maps to correct ISO start/end', () => {
  const e = parseIcs(sample).find(x => x.uid === 'evt-1@test');
  assert.strictEqual(e.title, 'Timed Meeting');
  assert.strictEqual(e.location, 'Room A');
  assert.strictEqual(new Date(e.start).toISOString(), '2026-08-05T01:00:00.000Z');
  assert.strictEqual(new Date(e.end).toISOString(), '2026-08-05T02:00:00.000Z');
  assert.strictEqual(e.allDay, false);
});

test('escaped characters are unescaped (\\n and \\,)', () => {
  const e = parseIcs(sample).find(x => x.uid === 'evt-1@test');
  assert.ok(e.description.includes('\n'), 'newline unescaped');
  assert.ok(e.description.includes(', with comma'), 'comma unescaped');
});

test('all-day event (VALUE=DATE) is flagged and keeps date', () => {
  const e = parseIcs(sample).find(x => x.uid === 'evt-2@test');
  assert.strictEqual(e.allDay, true);
  assert.match(e.start, /^2026-08-10T00:00:00/);
  assert.match(e.end, /^2026-08-11T00:00:00/);
});

test('folded lines are unfolded into a single value', () => {
  const e = parseIcs(sample).find(x => x.uid === 'evt-3@test');
  assert.strictEqual(e.title, 'Folded summary that continues on the next physical line');
});

test('missing DTEND falls back to +1h for timed events', () => {
  const e = parseIcs(sample).find(x => x.uid === 'evt-4@test');
  const diff = new Date(e.end) - new Date(e.start);
  assert.strictEqual(diff, 60 * 60 * 1000);
});

test('parseIcsDate handles UTC, local, and date-only', () => {
  assert.deepStrictEqual(parseIcsDate('20260101T000000Z', ''), { iso: '2026-01-01T00:00:00.000Z', allDay: false });
  const d = parseIcsDate('20260101', 'VALUE=DATE');
  assert.strictEqual(d.allDay, true);
  assert.strictEqual(parseIcsDate('not-a-date', ''), null);
});

test('empty / non-event input yields no events', () => {
  assert.deepStrictEqual(parseIcs('BEGIN:VCALENDAR\nEND:VCALENDAR'), []);
  assert.deepStrictEqual(parseIcs(''), []);
});
