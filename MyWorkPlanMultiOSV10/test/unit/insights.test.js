// The bottom panel's schedule check (domain/insights.js): problems of every kind
// are found and sorted by severity, the critical path runs start to finish,
// overallocations name their days and tasks, delays and milestones are listed,
// and the counts match the lists.
import assert from 'node:assert/strict';
import test from 'node:test';
import { INSIGHT_TABS, scheduleInsights } from '../../src/domain/insights.js';
import { schedule } from '../../src/domain/schedule.js';
import { addResource, assignResource, createProject, insertTask, linkTasks } from '../../src/domain/project.js';
import { buildSample } from '../../src/domain/templates.js';
import { SAMPLE_PROJECTS } from '../../src/domain/samples/index.js';

const START = '2026-10-19T08:00';

function plan() {
  const p = createProject({ title: 'Check', start: START, language: 'en' });
  const a = insertTask(p, 0, { name: 'A', duration: 3 * 480, durationUnit: 'd' });
  const b = insertTask(p, 1, { name: 'B', duration: 2 * 480, durationUnit: 'd' });
  const c = insertTask(p, 2, { name: 'C', duration: 4 * 480, durationUnit: 'd' });
  const lone = insertTask(p, 3, { name: 'Lone', duration: 1 * 480, durationUnit: 'd' });
  const m = insertTask(p, 4, { name: 'Done', milestone: true, duration: 0 });
  linkTasks(p, a.id, b.id, 'FS', 0, 'd');
  linkTasks(p, b.id, m.id, 'FS', 0, 'd');
  linkTasks(p, a.id, c.id, 'SS', 0, 'd');
  const ann = addResource(p, { name: 'Ann', type: 'work' });
  assignResource(p, a.id, ann.id, 1);
  assignResource(p, c.id, ann.id, 1); // A and C run on the same days: Ann is booked 200%
  assignResource(p, b.id, ann.id, 1);
  return { p, a, b, c, lone, m, ann };
}

test('the tabs', () => assert.deepEqual(INSIGHT_TABS, ['problems', 'critical', 'overallocation', 'delays', 'milestones']));

test('problems: overallocation, unlinked and unassigned work, sorted by severity', () => {
  const { p, lone, ann } = plan();
  const r = scheduleInsights(p, schedule(p));
  const kinds = r.problems.map((x) => x.kind);
  assert.ok(kinds.includes('overallocated'));
  assert.ok(r.problems.some((x) => x.kind === 'overallocated' && x.resourceId === ann.id && x.peak >= 2));
  assert.ok(r.problems.some((x) => x.kind === 'unlinked' && x.taskId === lone.id), 'a task with no links');
  assert.ok(r.problems.some((x) => x.kind === 'noResource' && x.taskId === lone.id), 'a task nobody does');
  const order = r.problems.map((x) => ({ error: 0, warning: 1, info: 2 }[x.severity]));
  assert.deepEqual(order, [...order].sort((x, y) => x - y), 'errors first, then warnings, then info');
  assert.equal(r.counts.problems, r.problems.length);
  assert.equal(r.counts.warnings, r.problems.filter((x) => x.severity === 'warning').length);
});

test('problems: missed deadlines, late work, constraint conflicts and loops', () => {
  const { p, a, b, c } = plan();
  b.deadline = '2026-10-20T17:00';
  a.percentComplete = 0;
  p.statusDate = '2026-10-30T17:00';
  c.constraint = { type: 'MFO', date: '2026-10-19T17:00' };
  let r = scheduleInsights(p, schedule(p));
  assert.ok(r.problems.some((x) => x.kind === 'deadline' && x.taskId === b.id && x.severity === 'error' && x.days >= 1), 'deadline');
  assert.ok(r.problems.some((x) => x.kind === 'late' && x.taskId === a.id), 'late');
  assert.ok(r.counts.errors >= 1);
  assert.equal(r.problems[0].severity, 'error');
  // A loop.
  b.predecessors.push({ taskId: c.id, type: 'FS', lag: 0, lagUnit: 'd' });
  c.predecessors.push({ taskId: b.id, type: 'FS', lag: 0, lagUnit: 'd' });
  r = scheduleInsights(p, schedule(p));
  assert.ok(r.problems.some((x) => x.kind === 'circular' && x.severity === 'error'), 'loop');
});

test('critical path, overallocation details, milestones', () => {
  const { p, a, c, m, ann } = plan();
  const s = schedule(p);
  const r = scheduleInsights(p, s);
  assert.ok(r.critical.tasks.length >= 2);
  assert.equal(r.critical.finish, s.finish);
  assert.ok(r.critical.tasks.every((x) => x.slack <= 0));
  const starts = r.critical.tasks.map((x) => x.start);
  assert.deepEqual(starts, [...starts].sort((x, y) => x - y), 'in date order');
  assert.equal(r.overallocation.length, 1);
  const o = r.overallocation[0];
  assert.equal(o.resourceId, ann.id);
  assert.ok(o.days >= 1 && o.first <= o.last);
  assert.ok(o.tasks.includes(a.id) && o.tasks.includes(c.id), 'the tasks that clash');
  assert.deepEqual(r.milestones.map((x) => x.taskId), [m.id]);
  assert.equal(r.milestones[0].done, false);
  assert.equal(r.counts.critical, r.critical.tasks.length);
});

test('delays: late, slipping against the baseline, deadlines first', () => {
  const p = buildSample('ko', { today: '2026-11-11' });
  const r = scheduleInsights(p, schedule(p));
  assert.ok(r.delays.length > 0);
  assert.ok(r.delays.some((x) => x.kind === 'late'));
  assert.ok(r.delays.some((x) => x.kind === 'slip' && x.slip > 0), 'the wireframes pushed later work past the baseline');
  const order = r.delays.map((x) => ({ error: 0, warning: 1, info: 2 }[x.severity]));
  assert.deepEqual(order, [...order].sort((x, y) => x - y));
  assert.equal(r.overallocation.length, 1, 'QA is booked twice in the tutorial plan');
  assert.ok(r.milestones.some((x) => x.done) && r.milestones.some((x) => !x.done));
});

test('every sample: the check runs, counts match and nothing points nowhere', () => {
  for (const sample of SAMPLE_PROJECTS) {
    const p = sample.build('en', { today: '2026-11-11' });
    const s = schedule(p);
    const r = scheduleInsights(p, s);
    const tasks = new Set(p.tasks.map((x) => x.id));
    const resources = new Set(p.resources.map((x) => x.id));
    for (const item of [...r.problems, ...r.delays, ...r.milestones, ...r.overallocation, ...r.critical.tasks]) {
      if (item.taskId) assert.ok(tasks.has(item.taskId), `${sample.id}: task ${item.taskId}`);
      if (item.resourceId) assert.ok(resources.has(item.resourceId), `${sample.id}: resource ${item.resourceId}`);
    }
    assert.equal(r.problems.filter((x) => x.kind === 'circular').length, 0, `${sample.id}: no loops`);
    assert.ok(r.critical.tasks.length > 0, `${sample.id}: a critical path`);
    assert.equal(r.counts.milestones, r.milestones.length);
    assert.equal(r.counts.delays, r.delays.length);
  }
});
