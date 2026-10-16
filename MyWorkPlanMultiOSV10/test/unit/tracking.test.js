// Baselines and progress (Set Baseline, Update Tasks, Mark on Track, Update
// Project) on a small plan:
//   S (summary): A 2 days Mon 19 – Tue 20 → B 3 days Wed 21 – Fri 23
//   C 1 day Mon 19
import assert from 'node:assert/strict';
import test from 'node:test';
import * as P from '../../src/domain/project.js';
import { schedule } from '../../src/domain/schedule.js';
import * as Tr from '../../src/domain/tracking.js';
import { fromMin } from '../../src/domain/time.js';

const DAY = 480;

function plan() {
  const project = P.createProject({ title: 'Tracking', start: '2026-10-19T08:00' });
  const add = (name, days, outlineLevel) => P.insertTask(project, project.tasks.length, { name, duration: days * DAY, outlineLevel });
  const t = { S: add('S', 1, 1), A: add('A', 2, 2), B: add('B', 3, 2), C: add('C', 1, 1) };
  P.linkTasks(project, t.A.id, t.B.id);
  return { project, t, sched: schedule(project) };
}

test('setBaseline saves every task, summaries included', () => {
  const { project, t, sched } = plan();
  assert.equal(Tr.hasBaseline(project), false);
  assert.equal(Tr.setBaseline(project, sched, 0, null, '2026-10-16T10:00:00.000Z'), 4);
  assert.equal(Tr.hasBaseline(project), true);
  assert.equal(Tr.hasBaseline(project, 1), false);
  assert.deepEqual(t.A.baselines[0], { start: '2026-10-19T08:00', finish: '2026-10-20T17:00', duration: 2 * DAY, work: 0, cost: 0 });
  assert.deepEqual(t.S.baselines[0], { start: '2026-10-19T08:00', finish: '2026-10-23T17:00', duration: 5 * DAY, work: 0, cost: 0 });
  assert.equal(project.baselineDates[0], '2026-10-16T10:00:00.000Z');
  const s = schedule(project);
  assert.equal(s.info(t.B.id).finishVariance, 0, 'no variance right after saving');
  P.setTaskDuration(project, t.A.id, 3 * DAY);
  const later = schedule(project);
  assert.equal(later.info(t.B.id).finishVariance, DAY, 'B now finishes a day late');
  assert.equal(later.info(t.B.id).baseline.finish, sched.info(t.B.id).finish);
  assert.equal(typeof Tr.setBaseline(project, later, 3), 'number');
  assert.equal(typeof project.baselineDates[3], 'string', 'the date defaults to now');
});

test('setBaseline for selected tasks rolls up into their summaries only', () => {
  const { project, t, sched } = plan();
  Tr.setBaseline(project, sched, 0);
  P.setTaskDuration(project, t.A.id, 3 * DAY);
  const s = schedule(project);
  assert.equal(Tr.setBaseline(project, s, 0, [t.A.id]), 2, 'A and its summary S');
  assert.equal(t.A.baselines[0].finish, '2026-10-21T17:00');
  assert.equal(t.S.baselines[0].finish, '2026-10-26T17:00', 'the summary takes its new dates');
  assert.equal(t.B.baselines[0].finish, '2026-10-23T17:00', 'B keeps its old baseline');
  assert.equal(Tr.setBaseline(project, s, 1, [t.C.id]), 1, 'a top-level task has no summary');
  assert.equal(t.S.baselines[1], undefined);
  assert.equal(Tr.setBaseline(project, s, 2, ['nope']), 0);
});

test('clearBaseline for some or all tasks', () => {
  const { project, t, sched } = plan();
  Tr.setBaseline(project, sched, 0);
  Tr.setBaseline(project, sched, 1);
  assert.equal(Tr.clearBaseline(project, 1, [t.A.id, t.C.id]), 2);
  assert.equal(t.A.baselines[1], undefined);
  assert.ok(t.B.baselines[1], 'B keeps baseline 1');
  assert.ok(project.baselineDates[1], 'the date stays while tasks still have the baseline');
  assert.equal(Tr.clearBaseline(project, 1), 2, 'S and B');
  assert.equal(Tr.hasBaseline(project, 1), false);
  assert.equal(project.baselineDates[1], undefined);
  assert.ok(Tr.hasBaseline(project, 0), 'baseline 0 is untouched');
  assert.ok(project.baselineDates[0]);
  assert.equal(Tr.clearBaseline(project, 5), 0);
});

test('copyBaseline copies values and the date', () => {
  const { project, t, sched } = plan();
  Tr.setBaseline(project, sched, 0, null, 'when');
  Tr.copyBaseline(project, 0, 1);
  assert.deepEqual(t.B.baselines[1], t.B.baselines[0]);
  assert.notEqual(t.B.baselines[1], t.B.baselines[0], 'a copy, not the same object');
  assert.equal(project.baselineDates[1], 'when');
  Tr.copyBaseline(project, 7, 2);
  assert.equal(Tr.hasBaseline(project, 2), false, 'copying nothing makes nothing');
  assert.equal(project.baselineDates[2], undefined);
  assert.equal(Tr.BASELINE_COUNT, 11);
});

test('setPercentComplete fixes actual dates on leaf tasks', () => {
  const { project, t, sched } = plan();
  assert.equal(Tr.setPercentComplete(project, sched, [t.A.id], 50), 1);
  assert.deepEqual([t.A.percentComplete, t.A.actualStart, t.A.actualFinish], [50, '2026-10-19T08:00', null]);
  Tr.setPercentComplete(project, sched, [t.A.id], 100);
  assert.deepEqual([t.A.percentComplete, t.A.actualStart, t.A.actualFinish], [100, '2026-10-19T08:00', '2026-10-20T17:00']);
  Tr.setPercentComplete(project, sched, [t.A.id], 60);
  assert.equal(t.A.actualFinish, null, 'less than 100% has no actual finish');
  t.A.actualStart = '2026-10-19T10:00';
  Tr.setPercentComplete(project, sched, [t.A.id], 70);
  assert.equal(t.A.actualStart, '2026-10-19T10:00', 'an actual start is kept');
  Tr.setPercentComplete(project, sched, [t.A.id], 0);
  assert.deepEqual([t.A.percentComplete, t.A.actualStart, t.A.actualFinish], [0, null, null]);
  Tr.setPercentComplete(project, sched, [t.C.id], 150);
  assert.equal(t.C.percentComplete, 100);
  Tr.setPercentComplete(project, sched, [t.C.id], 'x');
  assert.equal(t.C.percentComplete, 0);
  Tr.setPercentComplete(project, sched, [t.C.id], 33.4);
  assert.equal(t.C.percentComplete, 33);
  assert.equal(Tr.setPercentComplete(project, sched, ['nope'], 50), 0);
});

test('setPercentComplete on a summary sets every task inside it', () => {
  const { project, t, sched } = plan();
  assert.equal(Tr.setPercentComplete(project, sched, [t.S.id, t.A.id], 100), 2, 'A is counted once');
  assert.equal(t.S.percentComplete, 0, 'the summary itself is not set');
  assert.deepEqual([t.A.actualFinish, t.B.actualFinish], ['2026-10-20T17:00', '2026-10-23T17:00']);
  const s = schedule(project);
  assert.equal(s.info(t.S.id).percentComplete, 100, 'the summary rolls up');
  assert.equal(s.info(t.S.id).status, 'complete');
  Tr.setPercentComplete(project, s, [t.B.id], 0);
  assert.equal(schedule(project).info(t.S.id).percentComplete, 40, 'weighted by duration: 2 of 5 days');
});

test('updateProgress: actual and remaining durations, percentages, actual dates', () => {
  const { project, t, sched } = plan();
  assert.equal(Tr.updateProgress(project, sched, t.S.id, { percentComplete: 50 }), false, 'not on a summary');
  assert.equal(Tr.updateProgress(project, sched, 'nope', { percentComplete: 50 }), false);
  Tr.updateProgress(project, sched, t.A.id, { actualDuration: DAY, remainingDuration: 2 * DAY });
  assert.deepEqual([t.A.duration, t.A.percentComplete, t.A.actualStart], [3 * DAY, 33, '2026-10-19T08:00'], 'the duration is actual + remaining');
  Tr.updateProgress(project, sched, t.B.id, { actualDuration: DAY });
  assert.equal(t.B.percentComplete, 33, 'actual duration of the current duration');
  Tr.updateProgress(project, sched, t.B.id, { actualDuration: 10 * DAY });
  assert.equal(t.B.percentComplete, 100);
  assert.equal(t.B.actualFinish, '2026-10-23T17:00', 'finished: the scheduled finish');
  Tr.updateProgress(project, sched, t.C.id, { percentComplete: 40.4 });
  assert.equal(t.C.percentComplete, 40);
  Tr.updateProgress(project, sched, t.C.id, { percentComplete: 140 });
  assert.equal(t.C.percentComplete, 100);
  Tr.updateProgress(project, sched, t.C.id, { percentComplete: 0 });
  assert.deepEqual([t.C.actualStart, t.C.actualFinish], [null, null]);
  Tr.updateProgress(project, sched, t.C.id, { actualStart: '2026-10-20T08:00', actualFinish: '2026-10-21T17:00' });
  assert.deepEqual([t.C.percentComplete, t.C.actualStart, t.C.actualFinish], [100, '2026-10-20T08:00', '2026-10-21T17:00']);
  Tr.updateProgress(project, sched, t.C.id, { percentComplete: 50, actualFinish: null });
  assert.deepEqual([t.C.percentComplete, t.C.actualFinish], [50, null]);
  Tr.updateProgress(project, sched, t.C.id, { actualDuration: 0, remainingDuration: 0, percentComplete: 100 });
  assert.equal(t.C.duration, 0);
  assert.equal(t.C.percentComplete, 100, 'nothing left: the typed percentage');
});

test('markOnTrack: progress as scheduled up to the status date', () => {
  const { project, t, sched } = plan();
  const status = sched.start + 2 * 1440 + 240; // Wednesday 12:00
  assert.equal(fromMin(status), '2026-10-21T12:00');
  assert.equal(Tr.markOnTrack(project, sched, [t.S.id, t.C.id], status), 3);
  assert.equal(t.A.percentComplete, 100);
  assert.equal(t.A.actualFinish, '2026-10-20T17:00');
  assert.equal(t.B.percentComplete, 17, 'half a day of three');
  assert.equal(t.B.actualStart, '2026-10-21T08:00');
  assert.equal(t.B.actualFinish, null);
  assert.equal(t.C.percentComplete, 100);
  assert.equal(Tr.markOnTrack(project, sched, [t.S.id, t.C.id], status), 0, 'nothing changes the second time');
  assert.equal(Tr.markOnTrack(project, sched, [t.B.id], sched.start), 1, 'before the start: 0%');
  assert.deepEqual([t.B.percentComplete, t.B.actualStart], [0, null]);
});

test('updateProjectThrough marks every task complete through a date', () => {
  const { project, t, sched } = plan();
  assert.equal(Tr.updateProjectThrough(project, sched, 'not a date'), 0);
  Tr.updateProjectThrough(project, sched, '2026-10-22T17:00');
  assert.deepEqual([t.A.percentComplete, t.B.percentComplete, t.C.percentComplete], [100, 67, 100]);
  Tr.updateProjectThrough(project, sched, '2026-10-21', [t.B.id]);
  assert.equal(t.B.percentComplete, 0, 'only the given tasks: B starts on the 21st');
  assert.equal(t.A.percentComplete, 100);
});

test('rescheduleUncompleted moves unstarted work after a date', () => {
  const { project, t, sched } = plan();
  t.C.percentComplete = 50;
  assert.equal(Tr.rescheduleUncompleted(project, sched, 'nope'), 0);
  assert.equal(Tr.rescheduleUncompleted(project, sched, '2026-10-21T08:00'), 1, 'only A: C has started, B starts then anyway');
  assert.deepEqual(t.A.constraint, { type: 'SNET', date: '2026-10-21T08:00' });
  assert.deepEqual(t.C.constraint, { type: 'ASAP', date: null });
  assert.deepEqual(t.S.constraint, { type: 'ASAP', date: null }, 'summaries are not constrained');
  const s = schedule(project);
  assert.equal(fromMin(s.info(t.A.id).start), '2026-10-21T08:00');
  assert.equal(fromMin(s.info(t.B.id).start), '2026-10-23T08:00');
  t.B.manual = true;
  assert.equal(Tr.rescheduleUncompleted(project, s, '2026-12-01T08:00'), 1, 'A again; manual B is left alone');
});

test('leafIds expands summaries and removes repeats', () => {
  const { project, t } = plan();
  assert.deepEqual(Tr.leafIds(project, [t.S.id]), [t.A.id, t.B.id]);
  assert.deepEqual(Tr.leafIds(project, [t.A.id, t.S.id, t.C.id]), [t.A.id, t.B.id, t.C.id]);
  assert.deepEqual(Tr.leafIds(project, []), []);
});
