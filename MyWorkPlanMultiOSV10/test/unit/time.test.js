// Wall-clock moments as whole minutes (no time zones), and the date parsing
// and formatting the tables use.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from '../../src/domain/time.js';

const { toMin, fromMin } = T;

test('toMin / fromMin round trip whole moments', () => {
  for (const text of ['1970-01-01T00:00', '2026-10-19T08:00', '2026-12-31T23:59', '2024-02-29T12:30', '2000-01-01T00:01']) {
    assert.equal(fromMin(toMin(text)), text, text);
  }
  assert.equal(toMin('1970-01-01T00:00'), 0);
  assert.equal(toMin('1970-01-02'), 1440, 'a date alone is midnight');
  assert.equal(toMin('2026-10-19 08:00'), toMin('2026-10-19T08:00'), 'a space works like T');
  assert.equal(toMin('2026-10-19T08:00:59'), toMin('2026-10-19T08:00'), 'seconds are ignored');
  assert.equal(toMin('2026-1-5'), toMin('2026-01-05'), 'single-digit month and day');
});

test('toMin accepts numbers and Dates, and rejects nonsense', () => {
  assert.equal(toMin(1234.4), 1234);
  assert.equal(toMin(Number.NaN), null);
  assert.equal(toMin(Infinity), null);
  assert.equal(toMin(new Date(2026, 9, 19, 8, 30)), toMin('2026-10-19T08:30'), 'a Date is read on the local wall clock');
  for (const bad of [null, undefined, '', 'hello', '19/10/2026', '2026-13-01', '2026-00-10', '2026-10-00', '2026-10-32', '2026-10-19T25:00', '2026-10-19T08:60']) {
    assert.equal(toMin(bad), null, String(bad));
  }
});

test('impossible calendar days are invalid', () => {
  assert.equal(toMin('2026-02-30'), null);
  assert.equal(toMin('2026-02-29'), null, '2026 is not a leap year');
  assert.notEqual(toMin('2024-02-29'), null, '2024 is');
  assert.equal(toMin('2100-02-29'), null, 'century years are not leap years');
  assert.notEqual(toMin('2000-02-29'), null, '…unless divisible by 400');
  assert.equal(toMin('2026-04-31'), null);
  assert.equal(fromMin(toMin('2026-10-19T24:00')), '2026-10-20T00:00', '24:00 is the end of the day');
});

test('fromMin of nothing is null', () => {
  assert.equal(fromMin(null), null);
  assert.equal(fromMin(undefined), null);
  assert.equal(fromMin(Number.NaN), null);
  assert.equal(fromMin(-1), '1969-12-31T23:59', 'moments before 1970 work too');
});

test('days and weekdays', () => {
  const monday = toMin('2026-10-19T08:00');
  assert.equal(T.weekday(monday), 1);
  assert.equal(T.weekday(toMin('2026-10-18')), 0, 'Sunday');
  assert.equal(T.weekday(toMin('2026-10-24')), 6, 'Saturday');
  assert.equal(T.weekdayOfDay(0), 4, '1970-01-01 was a Thursday');
  assert.equal(T.weekdayOfDay(-1), 3, 'negative day numbers wrap correctly');
  assert.equal(T.dayOf(monday), T.dayOf(toMin('2026-10-19T23:59')));
  assert.equal(T.dayOf(-1), -1);
  assert.equal(T.dayStart(T.dayOf(monday)), toMin('2026-10-19'));
  assert.equal(T.isoDay(T.dayOf(monday)), '2026-10-19');
  assert.equal(T.isoDay(0), '1970-01-01');
  assert.equal(T.dayFromIso('2026-10-19'), T.dayOf(monday));
  assert.equal(T.dayFromIso('nope'), null);
});

test('parts and fromParts (months are 0-based)', () => {
  const p = T.parts(toMin('2026-10-19T08:30'));
  assert.deepEqual(p, { year: 2026, month: 9, day: 19, hour: 8, minute: 30, weekday: 1 });
  assert.equal(T.fromParts(2026, 9, 19, 8, 30), toMin('2026-10-19T08:30'));
  assert.equal(T.fromParts(2026, 12, 1), toMin('2027-01-01'), 'month overflow rolls into the next year');
  assert.equal(typeof T.nowMin(), 'number');
  assert.equal(T.todayDay(), T.dayOf(T.nowMin()));
});

test('clock text ↔ minutes of the day', () => {
  assert.equal(T.clockToMin('08:00'), 480);
  assert.equal(T.clockToMin('8:05'), 485);
  assert.equal(T.clockToMin(' 17:30 '), 1050);
  assert.equal(T.clockToMin('24:00'), 1440, 'the end of the day');
  assert.equal(T.clockToMin('00:00'), 0);
  for (const bad of ['24:01', '25:00', '12:60', '1200', '12:5', 'ab:cd', '', null, undefined]) assert.equal(T.clockToMin(bad), null, String(bad));
  assert.equal(T.minToClock(480), '08:00');
  assert.equal(T.minToClock(1050), '17:30');
  assert.equal(T.minToClock(0), '00:00');
  assert.equal(T.minToClock(1440), '24:00');
});

test('addMonths keeps the day, or the last day of a shorter month', () => {
  const at = (text, n) => fromMin(T.addMonths(toMin(text), n));
  assert.equal(at('2026-01-15T08:00', 1), '2026-02-15T08:00');
  assert.equal(at('2026-01-31T08:00', 1), '2026-02-28T08:00');
  assert.equal(at('2024-01-31T08:00', 1), '2024-02-29T08:00', 'leap year');
  assert.equal(at('2026-03-31T00:00', 1), '2026-04-30T00:00');
  assert.equal(at('2026-03-31T00:00', -1), '2026-02-28T00:00', 'backwards');
  assert.equal(at('2026-11-30T09:15', 3), '2027-02-28T09:15', 'across a year');
  assert.equal(at('2026-05-31T00:00', 12), '2027-05-31T00:00');
  assert.equal(at('2026-05-31T00:00', 0), '2026-05-31T00:00');
});

test('weekStartDay finds the Monday (or Sunday) of the week', () => {
  const day = T.dayFromIso('2026-10-22'); // Thursday
  assert.equal(T.isoDay(T.weekStartDay(day)), '2026-10-19');
  assert.equal(T.isoDay(T.weekStartDay(day, 0)), '2026-10-18');
  assert.equal(T.isoDay(T.weekStartDay(T.dayFromIso('2026-10-18'))), '2026-10-12', 'a Sunday belongs to the week before (Monday start)');
  assert.equal(T.isoDay(T.weekStartDay(T.dayFromIso('2026-10-18'), 0)), '2026-10-18');
});

test('isoWeek follows ISO-8601 (week 1 holds the first Thursday)', () => {
  const w = (text) => T.isoWeek(T.dayFromIso(text));
  assert.equal(w('2026-01-01'), 1, 'Thursday 1 January');
  assert.equal(w('2026-10-19'), 43);
  assert.equal(w('2027-01-01'), 53, 'Friday 1 January 2027 is in week 53 of 2026');
  assert.equal(w('2026-12-31'), 53);
  assert.equal(w('2027-01-04'), 1);
  assert.equal(w('2024-12-30'), 1, 'Monday 30 December 2024 is in week 1 of 2025');
  assert.equal(w('2021-01-03'), 53, 'Sunday 3 January 2021 is in week 53 of 2020');
});

test('formatDay in every display format, with and without time', () => {
  const m = toMin('2026-03-05T08:07');
  assert.equal(T.formatDay(m), '2026-03-05');
  assert.equal(T.formatDay(m, 'iso', true), '2026-03-05 08:07');
  assert.equal(T.formatDay(m, 'ko'), '2026. 3. 5.');
  assert.equal(T.formatDay(m, 'ko', true), '2026. 3. 5. 08:07');
  assert.equal(T.formatDay(m, 'us'), '3/5/2026');
  assert.equal(T.formatDay(m, 'eu'), '05/03/2026');
  assert.equal(T.formatDay(m, 'eu', true), '05/03/2026 08:07');
  assert.equal(T.formatDay(m, 'unknown'), '2026-03-05', 'unknown formats fall back to ISO');
  assert.equal(T.formatDay(null), '');
  assert.equal(T.formatDay(undefined, 'ko'), '');
});

test('parseDay reads every display format back', () => {
  const m = toMin('2026-03-05');
  for (const format of ['iso', 'ko', 'us', 'eu']) {
    assert.equal(T.parseDay(T.formatDay(m, format), format), m, format);
    assert.equal(T.parseDay(T.formatDay(toMin('2026-03-05T13:30'), format, true), format), toMin('2026-03-05T13:30'), `${format} with time`);
  }
  assert.equal(T.parseDay('2026-03-05'), m);
  assert.equal(T.parseDay('2026/3/5'), m);
  assert.equal(T.parseDay('2026.03.05'), m);
  assert.equal(T.parseDay('2026. 3. 5.', 'ko'), m);
  assert.equal(T.parseDay('2026-03-05 13:30'), toMin('2026-03-05T13:30'));
  assert.equal(T.parseDay('2026. 3. 5. 9:05', 'ko'), toMin('2026-03-05T09:05'));
  assert.equal(T.parseDay('3/5/2026', 'us'), m, 'US: month first');
  assert.equal(T.parseDay('5/3/2026', 'eu'), m, 'EU: day first');
  assert.equal(T.parseDay('05.03.2026', 'eu'), m);
  assert.equal(T.parseDay('25/3/2026', 'us'), toMin('2026-03-25'), 'a first number above 12 can only be the day');
  assert.equal(T.parseDay('3/5/2026 13:30', 'us'), toMin('2026-03-05T13:30'));
  assert.equal(T.parseDay('2026-03-05', 'eu'), m, 'ISO is understood in any format');
});

test('parseDay refuses what is not a date', () => {
  for (const bad of ['', '   ', null, undefined, 'tomorrow', '2026-02-30', '31/31/2026', '2026-13-01', '13:30', '3/5/26', '2026-03']) {
    assert.equal(T.parseDay(bad, 'us'), null, String(bad));
  }
  assert.equal(T.parseDay('30/2/2026', 'eu'), null, '30 February');
  assert.equal(T.parseDay('2026-03-05 25:00'), null, 'no hour 25');
  assert.equal(T.parseDay('2026-03-05 12:75'), null, 'no minute 75');
  assert.equal(T.parseDay('2026-03-05 24:00'), toMin('2026-03-06T00:00'), '24:00 is the end of the day');
});
