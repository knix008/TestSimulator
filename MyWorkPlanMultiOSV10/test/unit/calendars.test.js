// Working-time arithmetic: the standard calendar works Monday–Friday
// 08:00–12:00 and 13:00–17:00 (lunch from 12:00 to 13:00).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../../src/domain/calendars.js';
import { dayFromIso, fromMin, toMin } from '../../src/domain/time.js';

const at = (text) => toMin(text);
const engine = (calendars = C.defaultCalendars(), id = 'standard') => new C.CalendarEngine(calendars, id);
const standard = () => engine();
const iso = fromMin;

test('normalizePeriods sorts, merges, clips and drops bad periods', () => {
  assert.deepEqual(C.normalizePeriods([[780, 1020], [480, 720]]), [[480, 720], [780, 1020]]);
  assert.deepEqual(C.normalizePeriods([[480, 700], [600, 800]]), [[480, 800]], 'overlaps merge');
  assert.deepEqual(C.normalizePeriods([[0, 60], [60, 120]]), [[0, 120]], 'touching periods merge');
  assert.deepEqual(C.normalizePeriods([[480, 1020], [600, 700]]), [[480, 1020]], 'contained periods vanish');
  assert.deepEqual(C.normalizePeriods([[-60, 60], [1400, 1600]]), [[0, 60], [1400, 1440]], 'clipped to the day');
  assert.deepEqual(C.normalizePeriods([[100, 50], [Number.NaN, 5], null, 'x', [5], [1500, 1600], [-10, 0]]), []);
  assert.deepEqual(C.normalizePeriods([['480', '720.4']]), [[480, 720]], 'numbers as text, rounded');
  assert.deepEqual(C.normalizePeriods(null), []);
  assert.deepEqual(C.normalizePeriods('08:00'), []);
  const input = [[480, 720], [700, 800]];
  C.normalizePeriods(input);
  assert.deepEqual(input, [[480, 720], [700, 800]], 'the input is not changed');
  assert.equal(C.periodMinutes([[480, 720], [780, 1020]]), 480);
  assert.equal(C.periodMinutes([]), 0);
});

test('the built-in calendars', () => {
  const [std, all, night] = C.defaultCalendars({ standard: '표준', allDay: '24시간', night: '야간' });
  assert.deepEqual([std.id, all.id, night.id], ['standard', '24hours', 'night']);
  assert.deepEqual([std.name, all.name, night.name], ['표준', '24시간', '야간']);
  assert.equal(C.defaultCalendars()[0].name, 'Standard', 'English names by default');
  const cals = C.defaultCalendars();
  assert.equal(C.weeklyHours(cals, 'standard'), 40);
  assert.equal(C.weeklyHours(cals, '24hours'), 168);
  assert.equal(C.weeklyHours(cals, 'night'), 40, 'Mon 1 h + Tue–Fri 8 h + Sat 7 h');
});

test('working days and day minutes', () => {
  const e = standard();
  assert.ok(e.isWorkingDay(dayFromIso('2026-10-19')), 'Monday');
  assert.ok(!e.isWorkingDay(dayFromIso('2026-10-24')), 'Saturday');
  assert.ok(!e.isWorkingDay(dayFromIso('2026-10-25')), 'Sunday');
  assert.equal(e.dayMinutes(dayFromIso('2026-10-23')), 480);
  assert.equal(e.dayMinutes(dayFromIso('2026-10-25')), 0);
  assert.deepEqual(e.periods(dayFromIso('2026-10-19')), [[480, 720], [780, 1020]]);
});

test('add: forward in working time, around lunch and weekends', () => {
  const e = standard();
  assert.equal(iso(e.add(at('2026-10-19T08:00'), 480)), '2026-10-19T17:00', 'one day');
  assert.equal(iso(e.add(at('2026-10-19T08:00'), 240)), '2026-10-19T12:00', 'a result on the end of a period stays there');
  assert.equal(iso(e.add(at('2026-10-19T12:00'), 1)), '2026-10-19T13:01', 'continues after lunch');
  assert.equal(iso(e.add(at('2026-10-19T12:30'), 60)), '2026-10-19T14:00', 'from inside the break');
  assert.equal(iso(e.add(at('2026-10-19T11:00'), 120)), '2026-10-19T14:00', 'across the break');
  assert.equal(iso(e.add(at('2026-10-23T17:00'), 60)), '2026-10-26T09:00', 'Friday evening to Monday');
  assert.equal(iso(e.add(at('2026-10-24T10:00'), 480)), '2026-10-26T17:00', 'from a Saturday');
  assert.equal(iso(e.add(at('2026-10-19T06:00'), 30)), '2026-10-19T08:30', 'from before work');
  assert.equal(iso(e.add(at('2026-10-19T08:00'), 5 * 480)), '2026-10-23T17:00', 'a week');
  assert.equal(iso(e.add(at('2026-10-19T08:00'), 6 * 480)), '2026-10-26T17:00');
  assert.equal(e.add(at('2026-10-24T10:00'), 0), at('2026-10-24T10:00'), 'zero does not move, even on a weekend');
  assert.equal(iso(e.add(at('2026-10-26T08:30'), -60)), '2026-10-23T16:30', 'negative amounts go backwards');
});

test('subtract: backward in working time', () => {
  const e = standard();
  assert.equal(iso(e.subtract(at('2026-10-19T17:00'), 480)), '2026-10-19T08:00');
  assert.equal(iso(e.subtract(at('2026-10-19T08:00'), 60)), '2026-10-16T16:00', 'Monday morning back to Friday');
  assert.equal(iso(e.subtract(at('2026-10-19T13:00'), 60)), '2026-10-19T11:00', 'back over lunch');
  assert.equal(iso(e.subtract(at('2026-10-19T14:00'), 60)), '2026-10-19T13:00', 'a result on the start of a period stays there');
  assert.equal(iso(e.subtract(at('2026-10-25T12:00'), 480)), '2026-10-23T08:00', 'from a Sunday');
  assert.equal(e.subtract(at('2026-10-19T10:00'), 0), at('2026-10-19T10:00'));
  for (const [start, amount] of [['2026-10-19T08:00', 1234], ['2026-10-21T12:00', 480 * 7 + 13], ['2026-10-22T15:17', 1]]) {
    assert.equal(e.subtract(e.add(at(start), amount), amount), e.snapForward(at(start)), `subtract undoes add from ${start}`);
    assert.equal(e.between(at(start), e.add(at(start), amount)), amount, `between undoes add from ${start}`);
  }
});

test('between measures working minutes (negative backwards)', () => {
  const e = standard();
  assert.equal(e.between(at('2026-10-19T08:00'), at('2026-10-19T17:00')), 480);
  assert.equal(e.between(at('2026-10-19T00:00'), at('2026-10-20T00:00')), 480);
  assert.equal(e.between(at('2026-10-23T12:00'), at('2026-10-26T12:00')), 480, 'over a weekend');
  assert.equal(e.between(at('2026-10-19T12:00'), at('2026-10-19T13:00')), 0, 'lunch');
  assert.equal(e.between(at('2026-10-26T12:00'), at('2026-10-23T12:00')), -480);
  assert.equal(e.between(at('2026-10-24T08:00'), at('2026-10-25T20:00')), 0, 'weekend');
  assert.equal(e.between(at('2026-10-19T10:00'), at('2026-10-19T10:00')), 0);
  assert.equal(e.between(null, at('2026-10-19T10:00')), 0);
  assert.equal(e.between(at('2026-10-19T10:00'), null), 0);
});

test('snapForward / snapBackward keep starts and finishes out of breaks', () => {
  const e = standard();
  assert.equal(iso(e.snapForward(at('2026-10-19T09:00'))), '2026-10-19T09:00', 'working time stays');
  assert.equal(iso(e.snapForward(at('2026-10-19T12:00'))), '2026-10-19T13:00', 'lunch → after lunch');
  assert.equal(iso(e.snapForward(at('2026-10-19T12:30'))), '2026-10-19T13:00');
  assert.equal(iso(e.snapForward(at('2026-10-19T17:00'))), '2026-10-20T08:00', 'end of day → next morning');
  assert.equal(iso(e.snapForward(at('2026-10-23T17:00'))), '2026-10-26T08:00', 'Friday evening → Monday');
  assert.equal(iso(e.snapForward(at('2026-10-24T11:00'))), '2026-10-26T08:00', 'Saturday → Monday');
  assert.equal(iso(e.snapForward(at('2026-10-19T05:00'))), '2026-10-19T08:00');
  assert.equal(iso(e.snapBackward(at('2026-10-19T10:00'))), '2026-10-19T10:00');
  assert.equal(iso(e.snapBackward(at('2026-10-19T13:00'))), '2026-10-19T12:00', 'after lunch → before lunch');
  assert.equal(iso(e.snapBackward(at('2026-10-19T12:30'))), '2026-10-19T12:00');
  assert.equal(iso(e.snapBackward(at('2026-10-19T17:00'))), '2026-10-19T17:00', 'a finish at 17:00 stays');
  assert.equal(iso(e.snapBackward(at('2026-10-20T08:00'))), '2026-10-19T17:00', 'next morning → the evening before');
  assert.equal(iso(e.snapBackward(at('2026-10-26T08:00'))), '2026-10-23T17:00', 'Monday morning → Friday evening');
  assert.equal(iso(e.snapBackward(at('2026-10-25T15:00'))), '2026-10-23T17:00', 'Sunday → Friday');
});

test('non-working exceptions (holidays), single days and ranges', () => {
  const cals = C.defaultCalendars();
  cals[0].exceptions = [
    { id: 'h1', name: 'Holiday', start: '2026-10-21', finish: '2026-10-21', working: false },
    { id: 'h2', name: 'Break', start: '2026-11-02', finish: '2026-11-04', working: false },
    { id: 'h3', name: 'No finish', start: '2026-11-10', working: false },
  ];
  const e = engine(cals);
  assert.ok(!e.isWorkingDay(dayFromIso('2026-10-21')));
  assert.equal(iso(e.add(at('2026-10-19T08:00'), 3 * 480)), '2026-10-22T17:00', 'the holiday is skipped');
  assert.equal(e.between(at('2026-10-19T08:00'), at('2026-10-23T17:00')), 4 * 480);
  for (const day of ['2026-11-02', '2026-11-03', '2026-11-04']) assert.ok(!e.isWorkingDay(dayFromIso(day)), day);
  assert.ok(e.isWorkingDay(dayFromIso('2026-11-05')));
  assert.ok(!e.isWorkingDay(dayFromIso('2026-11-10')), 'an exception without a finish is one day');
  assert.ok(e.isWorkingDay(dayFromIso('2026-11-11')));
  assert.equal(iso(e.snapForward(at('2026-10-20T17:00'))), '2026-10-22T08:00');
  assert.equal(iso(e.snapBackward(at('2026-10-22T08:00'))), '2026-10-20T17:00');
  assert.equal(iso(e.subtract(at('2026-11-05T08:00'), 60)), '2026-10-30T16:00', 'back over the break and a weekend');
});

test('working exceptions with their own hours', () => {
  const cals = C.defaultCalendars();
  cals[0].exceptions = [
    { id: 'w1', name: 'Saturday work', start: '2026-10-24', finish: '2026-10-24', working: true, periods: [[540, 720]] },
    { id: 'w2', name: 'Short Monday', start: '2026-10-26', finish: '2026-10-26', working: true, periods: [[600, 660], [480, 540]] },
    { id: 'w3', name: 'No hours', start: '2026-10-27', finish: '2026-10-27', working: true, periods: [] },
  ];
  const e = engine(cals);
  assert.ok(e.isWorkingDay(dayFromIso('2026-10-24')));
  assert.equal(e.dayMinutes(dayFromIso('2026-10-24')), 180);
  assert.equal(iso(e.add(at('2026-10-23T17:00'), 60)), '2026-10-24T10:00', 'Friday evening continues on the working Saturday');
  assert.equal(iso(e.snapForward(at('2026-10-24T08:00'))), '2026-10-24T09:00');
  assert.deepEqual(e.periods(dayFromIso('2026-10-26')), [[480, 540], [600, 660]], 'the periods are normalized');
  assert.equal(iso(e.add(at('2026-10-26T08:00'), 90)), '2026-10-26T10:30');
  assert.ok(!e.isWorkingDay(dayFromIso('2026-10-27')), 'working without hours is a day off');
  assert.equal(e.between(at('2026-10-24T00:00'), at('2026-10-28T00:00')), 180 + 120);
});

test('a calendar based on another inherits its week and exceptions', () => {
  const cals = C.defaultCalendars();
  cals[0].exceptions = [
    { id: 'h', name: 'Holiday', start: '2026-10-21', finish: '2026-10-21', working: false },
    { id: 'h2', name: 'Other holiday', start: '2026-10-22', finish: '2026-10-22', working: false },
  ];
  cals.push({ id: 'fourday', name: 'Four days', base: 'standard', week: { 5: [] }, exceptions: [{ id: 'x', name: 'Make-up day', start: '2026-10-22', finish: '2026-10-22', working: true, periods: [[480, 720]] }] });
  cals.push({ id: 'late', name: 'Late', base: 'fourday', week: { 1: [[600, 1200]] }, exceptions: [] });
  const e = engine(cals, 'fourday');
  assert.ok(!e.isWorkingDay(dayFromIso('2026-10-23')), 'its own Friday is off');
  assert.equal(e.dayMinutes(dayFromIso('2026-10-20')), 480, 'other days come from the base');
  assert.ok(!e.isWorkingDay(dayFromIso('2026-10-21')), 'the base holiday applies');
  assert.equal(e.dayMinutes(dayFromIso('2026-10-22')), 240, 'its own exception wins over the base one');
  assert.equal(C.weeklyHours(cals, 'fourday'), 32);
  const g = engine(cals, 'late');
  assert.equal(g.dayMinutes(dayFromIso('2026-10-19')), 600, 'grandchild Monday');
  assert.ok(!g.isWorkingDay(dayFromIso('2026-10-23')), 'Friday from the parent');
  assert.ok(!g.isWorkingDay(dayFromIso('2026-10-21')), 'holiday from the grandparent');
  assert.equal(C.weeklyHours(cals, 'late'), 34);
  assert.deepEqual(C.dependents(cals, 'standard').sort(), ['fourday', 'late']);
  assert.deepEqual(C.dependents(cals, 'fourday'), ['late']);
  assert.deepEqual(C.dependents(cals, 'late'), []);
  assert.deepEqual(C.dependents(cals, 'night'), []);
});

test('a loop of base calendars does not hang', () => {
  const cals = [
    { id: 'a', name: 'A', base: 'b', week: { 1: [[480, 1020]] }, exceptions: [] },
    { id: 'b', name: 'B', base: 'a', week: { 2: [[480, 1020]] }, exceptions: [] },
  ];
  const e = engine(cals, 'a');
  assert.ok(e.isWorkingDay(dayFromIso('2026-10-19')));
  assert.ok(Array.isArray(C.dependents(cals, 'a')));
});

test('the 24-hour calendar works around the clock, every day', () => {
  const e = engine(C.defaultCalendars(), '24hours');
  assert.equal(iso(e.add(at('2026-10-19T00:00'), 1440)), '2026-10-20T00:00');
  assert.equal(iso(e.add(at('2026-10-24T22:00'), 180)), '2026-10-25T01:00', 'over a weekend midnight');
  assert.equal(e.between(at('2026-10-24T00:00'), at('2026-10-26T00:00')), 2880);
  assert.equal(iso(e.snapForward(at('2026-10-24T03:17'))), '2026-10-24T03:17');
  assert.equal(iso(e.subtract(at('2026-10-19T00:00'), 60)), '2026-10-18T23:00');
});

test('the night shift calendar runs over midnight with a break at 03:00', () => {
  const e = engine(C.defaultCalendars(), 'night');
  assert.equal(iso(e.snapForward(at('2026-10-19T08:00'))), '2026-10-19T23:00', 'Monday work starts at 23:00');
  assert.equal(iso(e.add(at('2026-10-19T23:00'), 480)), '2026-10-20T08:00', 'one shift: 23–24, 0–3, 4–8');
  assert.equal(iso(e.add(at('2026-10-20T02:00'), 120)), '2026-10-20T05:00', 'over the 03:00 break');
  assert.equal(iso(e.snapBackward(at('2026-10-20T04:00'))), '2026-10-20T03:00');
  assert.equal(e.between(at('2026-10-19T00:00'), at('2026-10-26T00:00')), 40 * 60);
  assert.ok(!e.isWorkingDay(dayFromIso('2026-10-25')), 'Sunday');
  assert.equal(e.dayMinutes(dayFromIso('2026-10-24')), 7 * 60, 'Saturday morning ends the week');
});

test('a calendar without working time throws CalendarError', () => {
  const none = { id: 'none', name: 'Nothing', base: null, week: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }, exceptions: [] };
  const e = engine([none], 'none');
  assert.equal(e.hasWork, false);
  assert.throws(() => e.add(at('2026-10-19T08:00'), 60), (error) => error instanceof C.CalendarError && error.code === 'calendar.noWorkingTime' && error.message === 'calendar.noWorkingTime');
  assert.throws(() => e.subtract(at('2026-10-19T08:00'), 60), C.CalendarError);
  assert.throws(() => e.snapForward(at('2026-10-19T08:00')), C.CalendarError);
  assert.throws(() => e.snapBackward(at('2026-10-19T08:00')), C.CalendarError);
  assert.equal(e.between(at('2026-10-19T08:00'), at('2026-10-26T08:00')), 0);
  // One working exception is enough to have work.
  const one = { ...none, exceptions: [{ id: 'x', start: '2026-10-21', finish: '2026-10-21', working: true, periods: [[480, 540]] }] };
  const f = engine([one], 'none');
  assert.equal(f.hasWork, true);
  assert.equal(iso(f.add(at('2026-10-19T08:00'), 30)), '2026-10-21T08:30');
});

test('workingSpans lists the working periods between two moments, clipped', () => {
  const e = standard();
  assert.deepEqual([...e.workingSpans(at('2026-10-19T10:00'), at('2026-10-20T10:00'))].map(([a, b]) => [iso(a), iso(b)]), [
    ['2026-10-19T10:00', '2026-10-19T12:00'],
    ['2026-10-19T13:00', '2026-10-19T17:00'],
    ['2026-10-20T08:00', '2026-10-20T10:00'],
  ]);
  assert.deepEqual([...e.workingSpans(at('2026-10-24T00:00'), at('2026-10-26T00:00'))], [], 'nothing on a weekend');
  const total = [...e.workingSpans(at('2026-10-19T00:00'), at('2026-11-02T00:00'))].reduce((sum, [a, b]) => sum + b - a, 0);
  assert.equal(total, e.between(at('2026-10-19T00:00'), at('2026-11-02T00:00')));
});

test('unknown calendar ids fall back to the first calendar', () => {
  const cals = C.defaultCalendars();
  assert.equal(engine(cals, 'missing').calendar.id, 'standard');
  const set = new C.CalendarSet(cals);
  assert.equal(set.get('night').calendar.id, 'night');
  assert.equal(set.get('missing').calendar.id, 'standard');
  assert.equal(set.get('night'), set.get('night'), 'engines are shared');
  assert.equal(new C.CalendarSet([]).get('standard').calendar.id, 'standard', 'no calendars: the defaults');
  assert.equal(new C.CalendarSet(null).calendars.length, 3);
  assert.equal(new C.CalendarEngine([], 'x').calendar.id, 'standard', 'an empty list uses a standard calendar');
});
