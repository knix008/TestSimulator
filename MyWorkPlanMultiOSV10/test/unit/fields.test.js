// The columns of the task and resource sheets: every field reads and shows a
// value on the scheduled sample, and the editable ones change the plan the way
// typing into MS Project's tables does.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as F from '../../src/domain/fields.js';
import * as P from '../../src/domain/project.js';
import { schedule } from '../../src/domain/schedule.js';
import { buildSample } from '../../src/domain/templates.js';
import { fromMin, toMin } from '../../src/domain/time.js';

const DAY = 480;
const TODAY = '2026-10-16';
const contextOf = (project, language = 'ko') => ({ project, sched: schedule(project), language, dateFormat: 'iso', showTime: false, t: (key) => key, toMin });

/** A: 2 days from Monday 2026-10-19, B: 3 days after A, M: milestone after B; C: manual. */
function plan() {
  const project = P.createProject({ title: 'Fields', start: '2026-10-19T08:00' });
  const add = (name, data = {}) => P.insertTask(project, project.tasks.length, { name, duration: 2 * DAY, ...data });
  const t = { A: add('A'), B: add('B', { duration: 3 * DAY }), M: add('M', { milestone: true }), C: add('C', { manual: true, start: '2026-10-19T08:00', finish: '2026-10-20T17:00' }) };
  P.linkTasks(project, t.A.id, t.B.id);
  P.linkTasks(project, t.B.id, t.M.id);
  return { project, t };
}

/** Sets a field and recalculates, like the table does. */
function set(ctx, list, id, item, value) {
  const field = list.find((f) => f.id === id);
  const result = field.set(ctx, item, value);
  ctx.sched = schedule(ctx.project);
  return result;
}
const setTask = (ctx, id, task, value) => set(ctx, F.TASK_FIELDS, id, task, value);
const setResource = (ctx, id, resource, value) => set(ctx, F.RESOURCE_FIELDS, id, resource, value);
const throwsCode = (fn, code) => assert.throws(fn, (error) => error instanceof Error && error.message === code, code);

test('field ids are unique and every table lists existing fields', () => {
  for (const [list, map, tables] of [[F.TASK_FIELDS, F.TASK_FIELD_MAP, F.TASK_TABLES], [F.RESOURCE_FIELDS, F.RESOURCE_FIELD_MAP, F.RESOURCE_TABLES]]) {
    assert.equal(new Set(list.map((f) => f.id)).size, list.length, 'unique ids');
    assert.equal(map.size, list.length);
    for (const [name, ids] of Object.entries(tables)) {
      assert.ok(ids.length > 1, name);
      assert.equal(new Set(ids).size, ids.length, `${name}: no repeats`);
      for (const id of ids) assert.ok(map.has(id), `${name}: ${id}`);
      assert.ok(ids.includes('name'), `${name} has the name column`);
    }
  }
  for (const field of [...F.TASK_FIELDS, ...F.RESOURCE_FIELDS]) {
    assert.equal(typeof field.get, 'function', field.id);
    assert.ok(field.width > 0 && ['left', 'right', 'center'].includes(field.align), field.id);
    if (field.kind !== 'readonly') assert.equal(typeof field.set, 'function', `${field.id} is editable`);
  }
});

for (const language of ['ko', 'en']) {
  test(`every task and resource field reads and shows the sample (${language})`, () => {
    const project = buildSample(language, { today: TODAY });
    const ctx = contextOf(project, language);
    for (const task of project.tasks) {
      const info = ctx.sched.info(task.id);
      for (const field of F.TASK_FIELDS) {
        const text = F.fieldText(ctx, field, task, info);
        assert.equal(typeof text, 'string', `${field.id} of ${task.name}`);
        assert.ok(!/undefined|NaN|\[object/.test(text), `${field.id} of ${task.name}: "${text}"`);
        const sort = F.sortValue(ctx, field, task, info);
        assert.ok(typeof sort === 'number' ? Number.isFinite(sort) : typeof sort === 'string', `sort ${field.id}`);
      }
    }
    for (const resource of project.resources) {
      for (const field of F.RESOURCE_FIELDS) {
        const text = F.fieldText(ctx, field, resource, null);
        assert.equal(typeof text, 'string', `${field.id} of ${resource.name}`);
        assert.ok(!/undefined|NaN|\[object/.test(text), `${field.id} of ${resource.name}: "${text}"`);
      }
    }
    const first = project.tasks[0];
    const info = ctx.sched.info(first.id);
    const text = (id) => F.fieldText(ctx, F.TASK_FIELD_MAP.get(id), first, info);
    assert.equal(text('id'), '1');
    assert.equal(text('wbs'), '1');
    assert.equal(text('start'), fromMin(info.start).slice(0, 10));
    assert.equal(text('critical'), info.critical ? 'common.yes' : 'common.no');
    assert.match(text('cost'), language === 'en' ? /^\$/ : /^₩/);
    assert.match(text('work'), language === 'en' ? / hrs?$/ : /시간$/);
    assert.ok(project.tasks.some((task) => F.fieldText(ctx, F.TASK_FIELD_MAP.get('resourceNames'), task, ctx.sched.info(task.id)) !== ''), 'some tasks show resources');
    assert.ok(project.tasks.some((task) => F.fieldText(ctx, F.TASK_FIELD_MAP.get('baselineStart'), task, ctx.sched.info(task.id)) !== 'common.na'), 'the sample has a baseline');
  });
}

test('texts of special values', () => {
  const { project, t } = plan();
  const ctx = contextOf(project, 'en');
  const text = (id, task) => F.fieldText(ctx, F.TASK_FIELD_MAP.get(id), task, ctx.sched.info(task.id));
  assert.equal(text('duration', t.A), '2 days');
  t.A.estimated = true;
  assert.equal(text('duration', t.A), '2 days?', 'an estimate shows a question mark');
  assert.equal(text('predecessors', t.B), '1');
  assert.equal(text('successors', t.A), '2');
  assert.equal(text('actualStart', t.A), 'common.na');
  assert.equal(text('constraintDate', t.A), 'common.na');
  assert.equal(text('deadline', t.A), 'common.na');
  assert.equal(text('baselineCost', t.A), 'common.na');
  assert.equal(text('percentComplete', t.A), '0%');
  assert.equal(text('mode', t.C), 'mode.manual');
  assert.equal(text('constraintType', t.A), 'constraint.ASAP');
  assert.equal(text('calendar', t.A), 'common.none');
  assert.equal(text('milestone', t.M), 'common.yes');
  assert.equal(text('levelingDelay', t.A), '0 edays');
  t.A.notes = 'two\n  lines';
  assert.equal(text('notes', t.A), 'two lines');
  ctx.showTime = true;
  assert.equal(text('start', t.A), '2026-10-19 08:00');
  ctx.dateFormat = 'us';
  assert.equal(text('finish', t.A), '10/20/2026 17:00');
  assert.deepEqual(F.fieldOptions(ctx, F.TASK_FIELD_MAP.get('mode')), ['auto', 'manual']);
  assert.deepEqual(F.fieldOptions(ctx, F.TASK_FIELD_MAP.get('calendar')), ['', 'standard', '24hours', 'night']);
  assert.deepEqual(F.fieldOptions(ctx, F.TASK_FIELD_MAP.get('name')), []);
  assert.equal(F.findResource(project, 'nope'), null);
});

test('name and simple text fields', () => {
  const { project, t } = plan();
  const ctx = contextOf(project);
  assert.equal(setTask(ctx, 'name', t.A, 'Design'), true);
  assert.equal(t.A.name, 'Design');
  setTask(ctx, 'name', t.A, 42);
  assert.equal(t.A.name, '42');
  setTask(ctx, 'notes', t.A, 'hello');
  setTask(ctx, 'hyperlink', t.A, '  https://example.com  ');
  setTask(ctx, 'text1', t.A, 'x');
  setTask(ctx, 'text2', t.A, 'y');
  setTask(ctx, 'text3', t.A, 'z');
  assert.deepEqual([t.A.notes, t.A.hyperlink, t.A.text1, t.A.text2, t.A.text3], ['hello', 'https://example.com', 'x', 'y', 'z']);
  setTask(ctx, 'number1', t.A, '12.5');
  assert.equal(t.A.number1, 12.5);
  throwsCode(() => setTask(ctx, 'number1', t.A, 'abc'), 'field.badNumber');
  setTask(ctx, 'fixedCost', t.A, '₩1,500');
  assert.equal(t.A.fixedCost, 1500);
  throwsCode(() => setTask(ctx, 'fixedCost', t.A, '1.2.3'), 'field.badNumber');
});

test('duration: units, estimates, bad input', () => {
  const { project, t } = plan();
  const ctx = contextOf(project);
  setTask(ctx, 'duration', t.A, '3d');
  assert.deepEqual([t.A.duration, t.A.durationUnit, t.A.estimated], [3 * DAY, 'd', false]);
  assert.equal(fromMin(ctx.sched.info(t.B.id).start), '2026-10-22T08:00', 'the successor moves');
  setTask(ctx, 'duration', t.A, '2');
  assert.equal(t.A.duration, 2 * DAY, 'a bare number uses the task unit');
  setTask(ctx, 'duration', t.A, '4h?');
  assert.deepEqual([t.A.duration, t.A.durationUnit, t.A.estimated], [240, 'h', true]);
  setTask(ctx, 'duration', t.A, '1');
  assert.equal(t.A.duration, 60, 'now in hours');
  setTask(ctx, 'duration', t.A, '0');
  assert.equal(t.A.milestone, true);
  throwsCode(() => setTask(ctx, 'duration', t.A, 'long'), 'field.badDuration');
  throwsCode(() => setTask(ctx, 'duration', t.A, '-2d'), 'field.badDuration');
  setTask(ctx, 'duration', t.C, '5d');
  assert.equal(t.C.duration, 5 * DAY);
  assert.equal(t.C.finish, null, 'a manual task loses its typed finish');
  assert.equal(fromMin(ctx.sched.info(t.C.id).finish), '2026-10-23T17:00', 'and ends after its new duration');
});

test('start: an auto task gets a "start no earlier than" constraint, a manual task moves', () => {
  const { project, t } = plan();
  const ctx = contextOf(project);
  setTask(ctx, 'start', t.B, '2026-10-26');
  assert.deepEqual(t.B.constraint, { type: 'SNET', date: '2026-10-26T08:00' }, 'a date alone means the start of the working day');
  assert.equal(fromMin(ctx.sched.info(t.B.id).start), '2026-10-26T08:00');
  setTask(ctx, 'start', t.B, '2026-10-26 10:30');
  assert.deepEqual(t.B.constraint, { type: 'SNET', date: '2026-10-26T10:30' }, 'a typed time is kept');
  setTask(ctx, 'start', t.C, '2026-10-21');
  assert.equal(t.C.start, '2026-10-21T08:00');
  assert.equal(t.C.finish, '2026-10-22T17:00', 'the manual task keeps its length');
  throwsCode(() => setTask(ctx, 'start', t.B, 'soon'), 'field.badDate');
  throwsCode(() => setTask(ctx, 'start', t.B, '2026-02-30'), 'field.badDate');
});

test('finish: an auto task changes its duration; before its start it gets FNET', () => {
  const { project, t } = plan();
  const ctx = contextOf(project);
  setTask(ctx, 'finish', t.A, '2026-10-21');
  assert.equal(t.A.duration, 3 * DAY, 'Monday 08:00 to Wednesday 17:00');
  setTask(ctx, 'finish', t.A, '2026-10-19 12:00');
  assert.equal(t.A.duration, 240);
  setTask(ctx, 'finish', t.B, '2026-10-01');
  assert.deepEqual(t.B.constraint, { type: 'FNET', date: '2026-10-01T17:00' });
  setTask(ctx, 'finish', t.C, '2026-10-23');
  assert.equal(t.C.finish, '2026-10-23T17:00');
  assert.equal(t.C.start, '2026-10-19T08:00');
  setTask(ctx, 'finish', t.C, '2026-10-01');
  assert.equal(t.C.finish, '2026-10-19T08:00', 'a manual finish never comes before its start');
  throwsCode(() => setTask(ctx, 'finish', t.A, 'x'), 'field.badDate');
});

test('predecessors: parsing, own row ignored, loops refused with the old links kept', () => {
  const { project, t } = plan();
  const ctx = contextOf(project);
  setTask(ctx, 'predecessors', t.M, '1SS+1d, 2');
  assert.deepEqual(t.M.predecessors.map((l) => [l.taskId, l.type, l.lag]), [[t.A.id, 'SS', DAY], [t.B.id, 'FS', 0]]);
  setTask(ctx, 'predecessors', t.C, '4, 1');
  assert.deepEqual(t.C.predecessors.map((l) => l.taskId), [t.A.id], 'a task is never its own predecessor');
  const before = t.A.predecessors;
  throwsCode(() => setTask(ctx, 'predecessors', t.A, '3'), 'field.loop');
  assert.equal(t.A.predecessors, before, 'the old links are back');
  assert.equal(schedule(project).conflicts.filter((c) => c.kind === 'circular').length, 0);
  throwsCode(() => setTask(ctx, 'predecessors', t.A, '9'), 'field.badPredecessors');
  throwsCode(() => setTask(ctx, 'predecessors', t.A, 'abc'), 'field.badPredecessors');
  setTask(ctx, 'predecessors', t.M, '');
  assert.deepEqual(t.M.predecessors, []);
});

test('predecessors: a summary and its own task cannot be linked', () => {
  const project = P.createProject({ start: '2026-10-19T08:00' });
  const sum = P.insertTask(project, 0, { name: 'S', duration: DAY });
  const kid = P.insertTask(project, 1, { name: 'K', duration: DAY, outlineLevel: 2 });
  const ctx = contextOf(project);
  throwsCode(() => setTask(ctx, 'predecessors', kid, '1'), 'field.loop');
  throwsCode(() => setTask(ctx, 'predecessors', sum, '2'), 'field.loop');
  assert.deepEqual(kid.predecessors, []);
  assert.deepEqual(sum.predecessors, []);
});

test('resource names: new resources, units, replacing the list', () => {
  const { project, t } = plan();
  const ctx = contextOf(project);
  assert.equal(setTask(ctx, 'resourceNames', t.A, 'Kim[50%], Lee'), true);
  assert.deepEqual(project.resources.map((r) => [r.name, r.type]), [['Kim', 'work'], ['Lee', 'work']]);
  assert.deepEqual(P.assignmentsOf(project, t.A.id).map((a) => a.units), [0.5, 1]);
  assert.equal(F.fieldText(ctx, F.TASK_FIELD_MAP.get('resourceNames'), t.A, ctx.sched.info(t.A.id)), 'Kim[50%], Lee');
  setTask(ctx, 'resourceNames', t.A, 'lee [200%]');
  assert.equal(project.resources.length, 2, 'names match without case');
  assert.deepEqual(P.assignmentsOf(project, t.A.id).map((a) => [P.findResource(project, a.resourceId).name, a.units]), [['Lee', 2]]);
  setTask(ctx, 'resourceNames', t.A, '');
  assert.deepEqual(P.assignmentsOf(project, t.A.id), []);
  assert.equal(project.resources.length, 2, 'resources stay in the sheet');
});

test('parseResourceNames', () => {
  assert.deepEqual(F.parseResourceNames('Kim[50%], Lee; Park [2]'), [{ name: 'Kim', units: 0.5 }, { name: 'Lee', units: 1 }, { name: 'Park', units: 2 }]);
  assert.deepEqual(F.parseResourceNames('Sand[10 kg]'), [{ name: 'Sand', units: 10 }]);
  assert.deepEqual(F.parseResourceNames('Kim [ 25 % ]'), [{ name: 'Kim', units: 0.25 }]);
  assert.deepEqual(F.parseResourceNames('Odd[x]'), [{ name: 'Odd[x]', units: 1 }], 'unreadable units stay in the name');
  assert.deepEqual(F.parseResourceNames(''), []);
  assert.deepEqual(F.parseResourceNames(null), []);
  assert.deepEqual(F.parseResourceNames(' , ;'), []);
});

test('% complete sets actual dates', () => {
  const { project, t } = plan();
  const ctx = contextOf(project);
  setTask(ctx, 'percentComplete', t.A, '50%');
  assert.equal(t.A.percentComplete, 50);
  assert.equal(t.A.actualStart, '2026-10-19T08:00');
  assert.equal(t.A.actualFinish, null);
  setTask(ctx, 'percentComplete', t.A, 100);
  assert.equal(t.A.actualFinish, '2026-10-20T17:00');
  setTask(ctx, 'percentComplete', t.A, '0');
  assert.deepEqual([t.A.percentComplete, t.A.actualStart, t.A.actualFinish], [0, null, null]);
  throwsCode(() => setTask(ctx, 'percentComplete', t.A, 'half'), 'field.badNumber');
});

test('actual start and finish', () => {
  const { project, t } = plan();
  const ctx = contextOf(project);
  setTask(ctx, 'actualStart', t.A, '2026-10-20');
  assert.equal(t.A.actualStart, '2026-10-20T08:00');
  assert.equal(t.A.percentComplete, 1, 'started');
  setTask(ctx, 'actualFinish', t.A, '2026-10-22');
  assert.equal(t.A.actualFinish, '2026-10-22T17:00');
  assert.equal(t.A.percentComplete, 100);
  setTask(ctx, 'actualFinish', t.A, '');
  assert.equal(t.A.actualFinish, null);
  assert.equal(t.A.percentComplete, 99);
  setTask(ctx, 'actualStart', t.A, 'common.na');
  assert.deepEqual([t.A.actualStart, t.A.actualFinish, t.A.percentComplete], [null, null, 0]);
  setTask(ctx, 'actualFinish', t.B, '2026-10-30');
  assert.equal(t.B.actualStart, '2026-10-21T08:00', 'finishing fills in the scheduled start');
  throwsCode(() => setTask(ctx, 'actualStart', t.A, 'x'), 'field.badDate');
  throwsCode(() => setTask(ctx, 'actualFinish', t.A, 'x'), 'field.badDate');
});

test('work, with and without resources', () => {
  const { project, t } = plan();
  const ctx = contextOf(project);
  setTask(ctx, 'work', t.A, '20h');
  assert.equal(t.A.work, 1200);
  assert.equal(ctx.sched.info(t.A.id).work, 1200);
  setTask(ctx, 'resourceNames', t.B, 'Kim');
  setTask(ctx, 'work', t.B, '4d');
  assert.equal(t.B.duration, 4 * DAY, 'fixed units: the duration follows');
  setTask(ctx, 'work', t.B, '16');
  assert.equal(t.B.duration, 2 * DAY, 'a bare number is hours');
  throwsCode(() => setTask(ctx, 'work', t.B, 'lots'), 'field.badDuration');
});

test('constraint type and date', () => {
  const { project, t } = plan();
  const ctx = contextOf(project);
  setTask(ctx, 'constraintType', t.B, 'MSO');
  assert.deepEqual(t.B.constraint, { type: 'MSO', date: '2026-10-21T08:00' }, 'a date is taken from the current start');
  setTask(ctx, 'constraintType', t.B, 'FNLT');
  assert.deepEqual(t.B.constraint, { type: 'FNLT', date: '2026-10-21T08:00' }, 'an existing date is kept');
  setTask(ctx, 'constraintType', t.B, 'ASAP');
  assert.deepEqual(t.B.constraint, { type: 'ASAP', date: null });
  setTask(ctx, 'constraintType', t.B, 'MFO');
  assert.deepEqual(t.B.constraint, { type: 'MFO', date: '2026-10-23T17:00' }, 'finish constraints take the finish');
  setTask(ctx, 'constraintDate', t.A, '2026-10-22');
  assert.deepEqual(t.A.constraint, { type: 'SNET', date: '2026-10-22T08:00' }, 'a date on an ASAP task makes SNET');
  t.A.constraint = { type: 'FNET', date: '2026-10-22T17:00' };
  setTask(ctx, 'constraintDate', t.A, '2026-10-27');
  assert.deepEqual(t.A.constraint, { type: 'FNET', date: '2026-10-27T17:00' }, 'finish constraints end at the end of the day');
  setTask(ctx, 'constraintDate', t.A, '  ');
  assert.deepEqual(t.A.constraint, { type: 'ASAP', date: null }, 'clearing the date clears the constraint');
  throwsCode(() => setTask(ctx, 'constraintDate', t.A, 'x'), 'field.badDate');
});

test('deadline', () => {
  const { project, t } = plan();
  const ctx = contextOf(project);
  setTask(ctx, 'deadline', t.B, '2026-10-22');
  assert.equal(t.B.deadline, '2026-10-22T17:00');
  assert.equal(ctx.sched.info(t.B.id).missedDeadline, true, 'B finishes on the 23rd');
  setTask(ctx, 'deadline', t.B, '');
  assert.equal(t.B.deadline, null);
  setTask(ctx, 'deadline', t.B, '2026-10-22');
  setTask(ctx, 'deadline', t.B, 'common.na');
  assert.equal(t.B.deadline, null, 'typing the "NA" text clears it too');
  throwsCode(() => setTask(ctx, 'deadline', t.B, 'friday'), 'field.badDate');
});

test('priority stays between 0 and 1000', () => {
  const { project, t } = plan();
  const ctx = contextOf(project);
  setTask(ctx, 'priority', t.A, '700');
  assert.equal(t.A.priority, 700);
  setTask(ctx, 'priority', t.A, 5000);
  assert.equal(t.A.priority, 1000);
  setTask(ctx, 'priority', t.A, -1);
  assert.equal(t.A.priority, 0);
  throwsCode(() => setTask(ctx, 'priority', t.A, 'high'), 'field.badNumber');
});

test('select and yes/no fields', () => {
  const { project, t } = plan();
  const ctx = contextOf(project);
  assert.equal(setTask(ctx, 'mode', t.A, 'auto'), false, 'no change');
  assert.equal(setTask(ctx, 'mode', t.B, 'manual'), true);
  assert.deepEqual([t.B.manual, t.B.start, t.B.finish], [true, '2026-10-21T08:00', '2026-10-23T17:00'], 'a manual task keeps its dates');
  setTask(ctx, 'mode', t.B, 'auto');
  assert.equal(t.B.manual, false);
  setTask(ctx, 'type', t.A, 'fixedWork');
  assert.equal(t.A.type, 'fixedWork');
  setTask(ctx, 'effortDriven', t.A, 1);
  assert.equal(t.A.effortDriven, true);
  setTask(ctx, 'active', t.A, false);
  assert.equal(t.A.active, false);
  setTask(ctx, 'flag1', t.A, 'yes');
  assert.equal(t.A.flag1, true);
  setTask(ctx, 'milestone', t.A, true);
  assert.deepEqual([t.A.milestone, t.A.duration], [true, 0]);
  setTask(ctx, 'milestone', t.A, false);
  assert.deepEqual([t.A.milestone, t.A.duration], [false, DAY], 'back to one day');
  setTask(ctx, 'calendar', t.A, 'night');
  assert.equal(t.A.calendarId, 'night');
  assert.equal(F.fieldText(ctx, F.TASK_FIELD_MAP.get('calendar'), t.A, null), 'Night Shift');
  setTask(ctx, 'calendar', t.A, '');
  assert.equal(t.A.calendarId, null);
});

test('resource fields', () => {
  const { project } = plan();
  const r = P.addResource(project, { name: 'Kim' });
  const m = P.addResource(project, { name: 'Sand', type: 'material', materialLabel: 'kg' });
  const c = P.addResource(project, { name: 'Travel', type: 'cost' });
  project.options.currency = '$';
  const ctx = contextOf(project, 'en');
  const text = (id, res) => F.fieldText(ctx, F.RESOURCE_FIELD_MAP.get(id), res, null);
  assert.equal(text('id', m), '2');
  assert.equal(text('maxUnits', r), '100%');
  assert.equal(text('maxUnits', m), '', 'materials have no max units');
  assert.equal(text('stdRate', r), '$0.00unit.perHour');
  assert.equal(text('stdRate', m), '$0.00');
  assert.equal(text('stdRate', c), '');
  assert.equal(text('ovtRate', m), '');
  assert.equal(text('costPerUse', c), '');
  assert.equal(text('calendar', r), 'common.projectCalendar');
  assert.equal(text('work', m), '');
  setResource(ctx, 'name', r, 'Kim Min');
  setResource(ctx, 'resourceType', r, 'material');
  setResource(ctx, 'resourceType', r, 'work');
  setResource(ctx, 'materialLabel', m, 'tons');
  setResource(ctx, 'initials', r, 'KM');
  setResource(ctx, 'group', r, 'Dev');
  setResource(ctx, 'maxUnits', r, '50%');
  setResource(ctx, 'stdRate', r, '$40');
  setResource(ctx, 'ovtRate', r, '60');
  setResource(ctx, 'costPerUse', r, '$5.5');
  setResource(ctx, 'accrue', r, 'start');
  setResource(ctx, 'calendar', r, 'night');
  setResource(ctx, 'code', r, 'D1');
  setResource(ctx, 'email', r, ' kim@example.com ');
  setResource(ctx, 'notes', r, 'n');
  assert.deepEqual(
    [r.name, r.type, m.materialLabel, r.initials, r.group, r.maxUnits, r.stdRate, r.ovtRate, r.costPerUse, r.accrue, r.calendarId, r.code, r.email, r.notes],
    ['Kim Min', 'work', 'tons', 'KM', 'Dev', 0.5, 40, 60, 5.5, 'start', 'night', 'D1', 'kim@example.com', 'n'],
  );
  setResource(ctx, 'calendar', r, '');
  assert.equal(r.calendarId, null);
  throwsCode(() => setResource(ctx, 'maxUnits', r, '-10'), 'field.badNumber');
  throwsCode(() => setResource(ctx, 'maxUnits', r, 'all'), 'field.badNumber');
  throwsCode(() => setResource(ctx, 'stdRate', r, '1.2.3'), 'field.badNumber');
  // Work and cost come from the schedule.
  P.assignResource(project, project.tasks[0].id, r.id, 1);
  ctx.sched = schedule(project);
  assert.equal(F.RESOURCE_FIELD_MAP.get('work').get(ctx, r), 2 * DAY);
  assert.equal(F.RESOURCE_FIELD_MAP.get('cost').get(ctx, r), 16 * 40 + 5.5);
  assert.equal(text('peak', r), '100%');
  assert.equal(text('overallocated', r), 'common.yes', 'more than the 50% maximum');
});
