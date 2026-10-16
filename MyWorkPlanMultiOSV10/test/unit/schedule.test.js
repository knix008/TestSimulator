// The scheduler against dates worked out by hand (MS Project's rules): the
// standard calendar works Monday–Friday 08:00–12:00 and 13:00–17:00.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as P from '../../src/domain/project.js';
import { levelResources, schedule } from '../../src/domain/schedule.js';
import { fromMin, toMin } from '../../src/domain/time.js';

const DAY = 480;
const make = () => P.createProject({ title: 'Test', start: '2026-10-19T08:00' }); // Monday
const add = (project, name, days, data = {}) => P.insertTask(project, project.tasks.length, { name, duration: days * DAY, ...data });
const at = (s, task) => ({ start: fromMin(s.info(task.id).start), finish: fromMin(s.info(task.id).finish) });

test('a 5-day task runs Monday 08:00 to Friday 17:00', () => {
  const p = make();
  const a = add(p, 'A', 5);
  assert.deepEqual(at(schedule(p), a), { start: '2026-10-19T08:00', finish: '2026-10-23T17:00' });
});

test('finish-to-start continues on the next working morning, over the weekend', () => {
  const p = make();
  const a = add(p, 'A', 5);
  const b = add(p, 'B', 3);
  P.linkTasks(p, a.id, b.id);
  const s = schedule(p);
  assert.deepEqual(at(s, b), { start: '2026-10-26T08:00', finish: '2026-10-28T17:00' });
  assert.equal(fromMin(s.finish), '2026-10-28T17:00');
  assert.ok(s.info(a.id).critical && s.info(b.id).critical, 'both are on the critical path');
});

test('lags, and start-to-start / finish-to-finish / start-to-finish links', () => {
  const p = make();
  const a = add(p, 'A', 5);
  const b = add(p, 'B', 3);
  P.linkTasks(p, a.id, b.id, 'FS', 2 * DAY, 'd');
  assert.equal(at(schedule(p), b).start, '2026-10-28T08:00', 'FS+2d');
  P.linkTasks(p, a.id, b.id, 'SS', 1 * DAY, 'd');
  assert.equal(at(schedule(p), b).start, '2026-10-20T08:00', 'SS+1d');
  P.linkTasks(p, a.id, b.id, 'FF', 0, 'd');
  assert.deepEqual(at(schedule(p), b), { start: '2026-10-21T08:00', finish: '2026-10-23T17:00' }, 'FF');
  P.linkTasks(p, a.id, b.id, 'FS', -1 * DAY, 'd');
  assert.equal(at(schedule(p), b).start, '2026-10-23T08:00', 'FS-1d (lead)');
  P.linkTasks(p, a.id, b.id, 'FS', 50, '%');
  assert.equal(at(schedule(p), b).start, '2026-10-28T13:00', 'FS+50% of 5 days = 2.5 days after Friday: Wednesday noon, after lunch');
  P.linkTasks(p, a.id, b.id, 'SF', 5 * DAY, 'd');
  assert.equal(at(schedule(p), b).finish, '2026-10-23T17:00', 'SF+5d: B finishes 5 days after A starts');
  P.linkTasks(p, a.id, b.id, 'SF', 0, 'd');
  assert.equal(at(schedule(p), b).start, '2026-10-19T08:00', 'SF+0: B would finish before A starts, but nothing starts before the project');
});

test('a milestone after a task sits at the end of its last day', () => {
  const p = make();
  const a = add(p, 'A', 5);
  const m = add(p, 'Done', 0, { milestone: true });
  P.linkTasks(p, a.id, m.id);
  assert.deepEqual(at(schedule(p), m), { start: '2026-10-23T17:00', finish: '2026-10-23T17:00' });
});

test('slack: a short parallel task has free and total slack up to the project finish', () => {
  const p = make();
  const a = add(p, 'A', 5);
  const b = add(p, 'B', 3);
  const c = add(p, 'C', 2);
  P.linkTasks(p, a.id, b.id);
  const s = schedule(p);
  assert.equal(s.info(c.id).totalSlack, 6 * DAY);
  assert.equal(s.info(c.id).freeSlack, 6 * DAY);
  assert.equal(s.info(c.id).critical, false);
  assert.equal(s.info(a.id).totalSlack, 0);
});

test('summary tasks roll up dates, % complete, work and cost', () => {
  const p = make();
  const sum = add(p, 'Phase', 1);
  const a = add(p, 'A', 2, { outlineLevel: 2 });
  const b = add(p, 'B', 3, { outlineLevel: 2 });
  P.linkTasks(p, a.id, b.id);
  P.updateTask(p, a.id, { percentComplete: 100 });
  const s = schedule(p);
  const info = s.info(sum.id);
  assert.equal(info.summary, true);
  assert.equal(info.wbs, '1');
  assert.equal(s.info(b.id).wbs, '1.2');
  assert.equal(fromMin(info.start), '2026-10-19T08:00');
  assert.equal(fromMin(info.finish), '2026-10-23T17:00');
  assert.equal(info.duration, 5 * DAY);
  assert.equal(info.percentComplete, 40, '2 of 5 days done');
});

test('a link to a summary task holds every task inside it', () => {
  const p = make();
  const a = add(p, 'A', 2);
  const sum = add(p, 'Phase', 1);
  const x = add(p, 'X', 1, { outlineLevel: 2 });
  const y = add(p, 'Y', 1, { outlineLevel: 2 });
  P.linkTasks(p, a.id, sum.id);
  const s = schedule(p);
  assert.equal(at(s, x).start, '2026-10-21T08:00');
  assert.equal(at(s, y).start, '2026-10-21T08:00');
  assert.equal(P.linkTasks(p, sum.id, x.id), false, 'a summary cannot be linked to its own task');
});

test('constraints: start no earlier than, must start on, finish no later than', () => {
  const p = make();
  const a = add(p, 'A', 2, { constraint: { type: 'SNET', date: '2026-10-21T08:00' } });
  assert.equal(at(schedule(p), a).start, '2026-10-21T08:00');
  P.updateTask(p, a.id, { constraint: { type: 'MSO', date: '2026-10-26T08:00' } });
  assert.equal(at(schedule(p), a).start, '2026-10-26T08:00');
  const b = add(p, 'B', 5);
  P.linkTasks(p, a.id, b.id);
  P.updateTask(p, b.id, { constraint: { type: 'FNLT', date: '2026-10-30T17:00' } });
  const s = schedule(p);
  assert.ok(s.conflicts.some((c) => c.taskId === b.id && c.constraint === 'FNLT'), 'missing the constraint is reported');
});

test('a holiday moves the finish; a 24-hour calendar works through nights', () => {
  const p = make();
  P.addException(p, 'standard', { name: 'Holiday', start: '2026-10-21', finish: '2026-10-21' });
  const a = add(p, 'A', 5);
  assert.equal(at(schedule(p), a).finish, '2026-10-26T17:00');
  const b = add(p, 'B', 3, { calendarId: '24hours' });
  assert.equal(at(schedule(p), b).finish, '2026-10-20T08:00', '24 h of work from Monday 08:00');
});

test('elapsed durations count clock time, weekends included', () => {
  const p = P.createProject({ start: '2026-10-23T08:00' }); // Friday
  const a = P.insertTask(p, 0, { name: 'Cure', duration: 3 * 1440, durationUnit: 'ed' });
  assert.equal(at(schedule(p), a).finish, '2026-10-26T08:00');
});

test('a link that would close a loop is refused', () => {
  const p = make();
  const a = add(p, 'A', 1);
  const b = add(p, 'B', 1);
  const c = add(p, 'C', 1);
  assert.ok(P.linkTasks(p, a.id, b.id));
  assert.ok(P.linkTasks(p, b.id, c.id));
  assert.equal(P.linkTasks(p, c.id, a.id), false);
  assert.equal(P.wouldCycle(p, c.id, a.id), true);
});

test('work and cost from resources (fixed units), material and cost resources, fixed cost', () => {
  const p = make();
  const a = add(p, 'A', 5, { fixedCost: 1000 });
  const dev = P.addResource(p, { name: 'Dev', stdRate: 10000, costPerUse: 500 });
  const brick = P.addResource(p, { name: 'Brick', type: 'material', stdRate: 2 });
  const travel = P.addResource(p, { name: 'Travel', type: 'cost' });
  P.assignResource(p, a.id, dev.id, 0.5);
  P.assignResource(p, a.id, brick.id, 300);
  P.assignResource(p, a.id, travel.id, 1, { cost: 7000 });
  const s = schedule(p);
  assert.equal(s.info(a.id).work, 20 * 60, '5 days at 50% = 20 hours');
  assert.equal(s.info(a.id).cost, 20 * 10000 + 500 + 600 + 7000 + 1000);
  assert.equal(s.resources.get(dev.id).work, 1200);
});

test('effort-driven: a second person halves the duration; fixed work keeps the work', () => {
  const p = make();
  const a = add(p, 'A', 4, { effortDriven: true });
  const r1 = P.addResource(p, { name: 'R1' });
  const r2 = P.addResource(p, { name: 'R2' });
  P.assignResource(p, a.id, r1.id, 1);
  P.assignResource(p, a.id, r2.id, 1);
  assert.equal(a.duration, 2 * DAY);
  const b = add(p, 'B', 4, { type: 'fixedWork' });
  P.assignResource(p, b.id, r1.id, 1);
  P.setTaskDuration(p, b.id, 8 * DAY, 'd');
  assert.equal(P.assignmentsOf(p, b.id)[0].units, 0.5);
  assert.equal(schedule(p).info(b.id).work, 4 * DAY);
});

test('overallocation is found and leveling removes it by delaying a task', () => {
  const p = make();
  const a = add(p, 'A', 3);
  const b = add(p, 'B', 2, { priority: 400 });
  const r = P.addResource(p, { name: 'Kim' });
  P.assignResource(p, a.id, r.id, 1);
  P.assignResource(p, b.id, r.id, 1);
  let s = schedule(p);
  assert.equal(s.resources.get(r.id).overallocated, true);
  assert.equal(s.info(b.id).overallocated, true);
  const result = levelResources(p);
  assert.deepEqual(result.moved, [b.id]);
  for (const task of p.tasks) task.levelingDelay = result.delays.get(task.id) ?? 0;
  s = schedule(p);
  assert.equal(s.resources.get(r.id).overallocated, false);
  assert.equal(fromMin(s.info(b.id).start), '2026-10-22T08:00');
});

test('scheduling from the project finish places tasks as late as possible', () => {
  const p = make();
  p.scheduleFrom = 'finish';
  p.finish = '2026-10-30T17:00';
  const a = add(p, 'A', 2);
  const b = add(p, 'B', 3);
  P.linkTasks(p, a.id, b.id);
  const s = schedule(p);
  assert.deepEqual(at(s, b), { start: '2026-10-28T08:00', finish: '2026-10-30T17:00' });
  assert.deepEqual(at(s, a), { start: '2026-10-26T08:00', finish: '2026-10-27T17:00' });
  assert.equal(fromMin(s.start), '2026-10-26T08:00');
});

test('a deadline before the finish gives negative slack', () => {
  const p = make();
  const a = add(p, 'A', 5, { deadline: '2026-10-21T17:00' });
  const s = schedule(p);
  assert.equal(s.info(a.id).missedDeadline, true);
  assert.equal(s.info(a.id).totalSlack, -2 * DAY);
});

test('manual tasks keep the dates typed for them', () => {
  const p = make();
  const a = add(p, 'A', 5);
  const b = add(p, 'B', 1, { manual: true, start: '2026-10-20T08:00', finish: '2026-10-21T17:00' });
  P.linkTasks(p, a.id, b.id);
  assert.deepEqual(at(schedule(p), b), { start: '2026-10-20T08:00', finish: '2026-10-21T17:00' });
});

test('ALAP tasks move as late as their successors allow', () => {
  const p = make();
  const a = add(p, 'A', 5);
  const b = add(p, 'B', 1, { constraint: { type: 'ALAP', date: null } });
  const c = add(p, 'C', 1);
  P.linkTasks(p, a.id, c.id);
  P.linkTasks(p, b.id, c.id);
  const s = schedule(p);
  assert.equal(at(s, b).start, '2026-10-23T08:00');
  assert.equal(toMin('2026-10-26T08:00'), s.info(c.id).start);
});

test('progress: actual start fixes the start; late tasks against the status date', () => {
  const p = make();
  p.statusDate = '2026-10-22T17:00';
  const a = add(p, 'A', 5, { actualStart: '2026-10-20T08:00', percentComplete: 20 });
  const s = schedule(p);
  assert.equal(at(s, a).start, '2026-10-20T08:00');
  assert.equal(s.info(a.id).late, true, '3 of 5 days passed but 20% done');
  assert.equal(s.info(a.id).critical, true);
});

test('baseline variances in working time', () => {
  const p = make();
  const a = add(p, 'A', 5);
  a.baselines[0] = { start: '2026-10-19T08:00', finish: '2026-10-21T17:00', duration: 3 * DAY, work: 0, cost: 0 };
  const s = schedule(p);
  assert.equal(s.info(a.id).finishVariance, 2 * DAY);
  assert.equal(s.info(a.id).durationVariance, 2 * DAY);
});
