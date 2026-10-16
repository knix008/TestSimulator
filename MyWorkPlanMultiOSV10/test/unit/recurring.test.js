// Recurring tasks: the days of the occurrences for every pattern, and the
// summary task with one pinned occurrence per day.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CalendarEngine, defaultCalendars } from '../../src/domain/calendars.js';
import * as P from '../../src/domain/project.js';
import * as R from '../../src/domain/recurring.js';
import { schedule } from '../../src/domain/schedule.js';
import { dayFromIso, fromMin, isoDay } from '../../src/domain/time.js';

const standard = new CalendarEngine(defaultCalendars(), 'standard');
const workday = (day) => standard.isWorkingDay(day);
const days = (pattern, isWorkingDay) => R.occurrences(pattern, isWorkingDay).map(isoDay);

test('daily: every day, every n days, until an end date', () => {
  assert.deepEqual(days({ kind: 'daily', start: '2026-10-22', count: 4 }), ['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  assert.deepEqual(days({ kind: 'daily', every: 3, start: '2026-10-19', end: '2026-10-28' }), ['2026-10-19', '2026-10-22', '2026-10-25', '2026-10-28']);
  assert.deepEqual(days({ kind: 'daily', every: 0, start: '2026-10-19', count: 2 }), ['2026-10-19', '2026-10-20'], 'every 0 means every day');
  assert.deepEqual(days({ kind: 'daily', every: 2.4, start: '2026-10-19', count: 2 }), ['2026-10-19', '2026-10-21'], 'rounded');
});

test('daily on working days only, also every n working days', () => {
  assert.deepEqual(days({ kind: 'daily', workdaysOnly: true, start: '2026-10-22', count: 4 }, workday), ['2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27']);
  assert.deepEqual(days({ kind: 'daily', workdaysOnly: true, every: 2, start: '2026-10-19', count: 4 }, workday), ['2026-10-19', '2026-10-21', '2026-10-23', '2026-10-27'], 'never on a weekend');
  assert.deepEqual(days({ kind: 'daily', workdaysOnly: true, every: 3, start: '2026-10-24', count: 2 }, workday), ['2026-10-26', '2026-10-29'], 'a weekend start begins on Monday');
  assert.deepEqual(days({ kind: 'daily', workdaysOnly: true, start: '2026-10-24', end: '2026-10-25' }, workday), [], 'only a weekend');
  assert.equal(R.occurrences({ kind: 'daily', workdaysOnly: true, start: '2026-10-19', count: 3 }).length, 3, 'without a calendar every day works');
});

test('weekly: several weekdays, in date order, every n weeks', () => {
  assert.deepEqual(days({ kind: 'weekly', weekdays: [1, 3, 5], start: '2026-10-19', count: 6 }), ['2026-10-19', '2026-10-21', '2026-10-23', '2026-10-26', '2026-10-28', '2026-10-30']);
  assert.deepEqual(days({ kind: 'weekly', weekdays: [3, 1], start: '2026-10-21', count: 3 }), ['2026-10-21', '2026-10-26', '2026-10-28'], 'days before the start are skipped');
  assert.deepEqual(days({ kind: 'weekly', weekdays: [0, 1], start: '2026-10-19', count: 3 }), ['2026-10-19', '2026-10-25', '2026-10-26'], 'Sunday ends the week');
  assert.deepEqual(days({ kind: 'weekly', weekdays: [6, 0], start: '2026-10-24', count: 1 }), ['2026-10-24'], 'the count keeps the earliest days');
  assert.deepEqual(days({ kind: 'weekly', every: 2, weekdays: [2], start: '2026-10-19', count: 3 }), ['2026-10-20', '2026-11-03', '2026-11-17']);
  assert.deepEqual(days({ kind: 'weekly', start: '2026-10-22', count: 2 }), ['2026-10-22', '2026-10-29'], 'no weekdays: the weekday of the start');
  assert.deepEqual(days({ kind: 'weekly', weekdays: ['1'], start: '2026-10-19', end: '2026-11-02' }), ['2026-10-19', '2026-10-26', '2026-11-02'], 'weekdays as text, end date included');
  const list = R.occurrences({ kind: 'weekly', weekdays: [0, 2, 4, 6], start: '2026-10-19', count: 20 });
  assert.deepEqual(list, [...list].sort((a, b) => a - b), 'always ascending');
});

test('monthly: a day of the month, clipped to short months', () => {
  assert.deepEqual(days({ kind: 'monthly', dayOfMonth: 31, start: '2026-01-01', count: 6 }), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30']);
  assert.deepEqual(days({ kind: 'monthly', dayOfMonth: 15, start: '2026-01-31', count: 2 }), ['2026-02-15', '2026-03-15'], 'the first month is skipped when its day has passed');
  assert.deepEqual(days({ kind: 'monthly', every: 2, dayOfMonth: 30, start: '2026-11-01', count: 3 }), ['2026-11-30', '2027-01-30', '2027-03-30']);
  assert.deepEqual(days({ kind: 'monthly', start: '2026-10-19', count: 2 }), ['2026-10-19', '2026-11-19'], 'no day: the day of the start');
  assert.deepEqual(days({ kind: 'monthly', dayOfMonth: 29, start: '2024-01-01', count: 3 }), ['2024-01-29', '2024-02-29', '2024-03-29'], 'leap February');
  assert.deepEqual(days({ kind: 'monthly', dayOfMonth: 99, start: '2026-02-01', count: 1 }), ['2026-02-28'], 'above 31 is the last day');
});

test('yearly: the same day every year', () => {
  assert.deepEqual(days({ kind: 'yearly', start: '2024-02-29', count: 3 }), ['2024-02-29', '2025-02-28', '2026-02-28']);
  assert.deepEqual(days({ kind: 'yearly', every: 2, start: '2026-10-19', end: '2031-01-01' }), ['2026-10-19', '2028-10-19', '2030-10-19']);
});

test('count, end date and the hard limit', () => {
  assert.deepEqual(days({ kind: 'daily', start: '2026-10-19', end: '2026-10-21', count: 10 }), ['2026-10-19', '2026-10-20', '2026-10-21'], 'the end date wins');
  assert.equal(R.occurrences({ kind: 'daily', start: '2026-10-19', end: '2027-10-19', count: 2 }).length, 2, 'the count wins');
  assert.equal(R.occurrences({ kind: 'daily', start: '2026-10-19', count: 0.2 }).length, 1, 'at least one');
  assert.equal(R.occurrences({ kind: 'daily', start: '2026-10-19' }).length, R.MAX_OCCURRENCES, 'no end: capped');
  assert.equal(R.occurrences({ kind: 'daily', start: '2026-10-19', count: 5000 }).length, R.MAX_OCCURRENCES);
  assert.equal(R.occurrences({ kind: 'monthly', start: '2026-10-19' }).length, 61, 'no end: five years ahead');
  assert.deepEqual(R.occurrences({ kind: 'daily', start: '2026-10-19', end: '2026-10-18' }), [], 'an end before the start');
  assert.deepEqual(R.occurrences({ kind: 'daily', start: 'someday', count: 3 }), []);
  assert.deepEqual(R.occurrences({ kind: 'hourly', start: '2026-10-19', count: 3 }), []);
  assert.deepEqual(R.PATTERNS, ['daily', 'weekly', 'monthly', 'yearly']);
});

test('insertRecurring makes a summary with pinned occurrences', () => {
  const project = P.createProject({ start: '2026-10-19T08:00' });
  P.insertTask(project, 0, { name: 'Before', duration: 480 });
  P.insertTask(project, 1, { name: 'After', duration: 480 });
  const pattern = { kind: 'weekly', weekdays: [1, 3], start: '2026-10-19', count: 4 };
  const summary = R.insertRecurring(project, 1, { name: 'Standup', duration: 60, pattern, startTime: 600 }, workday);
  assert.deepEqual(project.tasks.map((task) => [task.name, task.outlineLevel]), [
    ['Before', 1], ['Standup', 1], ['Standup 1', 2], ['Standup 2', 2], ['Standup 3', 2], ['Standup 4', 2], ['After', 1],
  ]);
  assert.ok(R.isRecurringSummary(summary));
  assert.deepEqual(summary.recurring.pattern, pattern);
  const kids = project.tasks.slice(2, 6);
  assert.ok(kids.every((task) => task.recurring.groupId === summary.recurring.groupId && !R.isRecurringSummary(task)));
  assert.deepEqual(kids.map((task) => task.constraint), ['2026-10-19', '2026-10-21', '2026-10-26', '2026-10-28'].map((day) => ({ type: 'SNET', date: `${day}T10:00` })));
  assert.ok(kids.every((task) => task.duration === 60 && task.durationUnit === 'h' && !task.estimated));
  const s = schedule(project);
  assert.deepEqual(kids.map((task) => [fromMin(s.info(task.id).start), fromMin(s.info(task.id).finish)]), [
    ['2026-10-19T10:00', '2026-10-19T11:00'], ['2026-10-21T10:00', '2026-10-21T11:00'],
    ['2026-10-26T10:00', '2026-10-26T11:00'], ['2026-10-28T10:00', '2026-10-28T11:00'],
  ]);
  assert.equal(fromMin(s.info(summary.id).start), '2026-10-19T10:00');
  assert.equal(fromMin(s.info(summary.id).finish), '2026-10-28T11:00');
  assert.equal(R.isRecurringSummary(null), false);
  assert.equal(R.isRecurringSummary(project.tasks[0]), false);
});

test('insertRecurring inside a summary, with the default start time and unit', () => {
  const project = P.createProject({ start: '2026-10-19T08:00' });
  P.insertTask(project, 0, { name: 'Phase', duration: 480 });
  P.insertTask(project, 1, { name: 'Work', duration: 480, outlineLevel: 2 });
  const summary = R.insertRecurring(project, 2, { name: 'Review', duration: 120, pattern: { kind: 'daily', workdaysOnly: true, every: 2, start: '2026-10-23', count: 2 } }, workday);
  assert.equal(summary.outlineLevel, 2, 'inside the phase');
  assert.deepEqual(project.tasks.slice(3).map((task) => [task.outlineLevel, task.durationUnit, task.constraint.date]), [[3, 'h', '2026-10-23T08:00'], [3, 'h', '2026-10-27T08:00']]);
  const s = schedule(project);
  assert.equal(s.info(summary.id).parentId, project.tasks[0].id);
  assert.equal(dayFromIso(fromMin(s.info(project.tasks[4].id).start)), dayFromIso('2026-10-27'));
});

test('insertRecurring with no matching day changes nothing', () => {
  const project = P.createProject({ start: '2026-10-19T08:00' });
  assert.equal(R.insertRecurring(project, 0, { name: 'Never', duration: 60, pattern: { kind: 'daily', workdaysOnly: true, start: '2026-10-24', end: '2026-10-25' } }, workday), null);
  assert.deepEqual(project.tasks, []);
});
