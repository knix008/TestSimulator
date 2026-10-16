// The project model: outline structure, edits of rows, links, resources,
// assignments, task types, calendars and the clipboard.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as P from '../../src/domain/project.js';
import { CalendarEngine } from '../../src/domain/calendars.js';
import { dayFromIso, toMin, weekday } from '../../src/domain/time.js';

const DAY = 480;
const make = (data = {}) => P.createProject({ title: 'Test', start: '2026-10-19T08:00', ...data });
const add = (project, name, outlineLevel = 1, data = {}) => P.insertTask(project, project.tasks.length, { name, outlineLevel, duration: DAY, ...data });
const names = (project) => project.tasks.map((task) => task.name);
const levels = (project) => project.tasks.map((task) => task.outlineLevel);
const byName = (project, name) => project.tasks.find((task) => task.name === name);

/** A(1) { A1(2), A2(2) { A2a(3) } }, B(1) */
function tree() {
  const p = make();
  const t = {};
  for (const [name, level] of [['A', 1], ['A1', 2], ['A2', 2], ['A2a', 3], ['B', 1]]) t[name] = add(p, name, level);
  return { p, t };
}

test('createProject: defaults per language', () => {
  const p = make();
  assert.equal(p.format, 'myworkplan');
  assert.equal(p.version, 1);
  assert.equal(p.title, 'Test');
  assert.equal(p.start, '2026-10-19T08:00');
  assert.equal(p.calendarId, 'standard');
  assert.deepEqual(p.calendars.map((cal) => cal.id), ['standard', '24hours', 'night']);
  assert.deepEqual([p.tasks, p.resources, p.assignments], [[], [], []]);
  assert.equal(p.scheduleFrom, 'start');
  assert.equal(p.options.currency, '₩');
  assert.equal(p.options.hoursPerDay, 8);
  assert.equal(p.options.defaultTaskMode, 'auto');
  assert.equal(make({ language: 'en' }).options.currency, '$');
  assert.equal(make({ calendarNames: { standard: '표준' } }).calendars[0].name, '표준');
  assert.notEqual(make().id, make().id, 'ids are unique');
  const auto = P.createProject();
  const start = toMin(auto.start);
  assert.ok([1, 2, 3, 4, 5].includes(weekday(start)), 'the default start is a weekday');
  assert.equal(start % 1440, 480, 'at 08:00');
  assert.ok(P.newId('x').startsWith('x-'));
});

test('createTask and createResource fill every field', () => {
  const p = make();
  const task = P.createTask(p);
  assert.equal(task.duration, DAY, 'one day by default');
  assert.equal(task.estimated, true, 'a default duration is an estimate');
  assert.equal(task.outlineLevel, 1);
  assert.equal(task.manual, false);
  assert.deepEqual(task.constraint, { type: 'ASAP', date: null });
  assert.equal(task.type, 'fixedUnits');
  assert.deepEqual(task.predecessors, []);
  const ms = P.createTask(p, { milestone: true });
  assert.equal(ms.duration, 0);
  assert.equal(ms.estimated, false);
  assert.equal(P.createTask(p, { duration: 960 }).estimated, false);
  assert.equal(P.createTask(p, { durationUnit: 'h' }).duration, 60, 'the default duration follows the unit');
  p.options.defaultTaskMode = 'manual';
  assert.equal(P.createTask(p).manual, true);
  const r = P.createResource(p, { name: 'Kim Min', type: 'robot' });
  assert.equal(r.type, 'work', 'unknown types become work');
  assert.equal(r.initials, 'KM');
  assert.equal(r.maxUnits, 1);
  assert.equal(P.createResource(p, { type: 'material' }).type, 'material');
});

test('initialsOf takes the first letter of up to three words', () => {
  assert.equal(P.initialsOf('Kim Min Su Park'), 'KMS');
  assert.equal(P.initialsOf(' ann  bell '), 'AB');
  assert.equal(P.initialsOf('김철수'), '김');
  assert.equal(P.initialsOf('홍 길동'), '홍길');
  assert.equal(P.initialsOf(''), '');
  assert.equal(P.initialsOf(null), '');
});

test('insertTask: the level follows the row above, or the deeper row below', () => {
  const p = make();
  const a = P.insertTask(p);
  assert.equal(a.outlineLevel, 1, 'first row');
  const a1 = P.insertTask(p, 1, { outlineLevel: 2 });
  assert.equal(a1.outlineLevel, 2);
  assert.equal(P.insertTask(p, 2).outlineLevel, 2, 'at the end: the level of the row above');
  assert.equal(P.insertTask(p, 1).outlineLevel, 2, 'just under a summary: inside it');
  assert.equal(P.insertTask(p, 0).outlineLevel, 1, 'at the top: level 1');
  const deep = P.insertTask(p, 0, { outlineLevel: 5 });
  assert.equal(deep.outlineLevel, 1, 'an impossible level is repaired');
  assert.equal(p.tasks[0], deep);
  const far = P.insertTask(p, 999, { name: 'last' });
  assert.equal(p.tasks.at(-1), far, 'an index past the end appends');
  const first = P.insertTask(p, -5, { name: 'first' });
  assert.equal(p.tasks[0], first, 'a negative index inserts at the top');
});

test('outline: parents, children, summaries and WBS codes', () => {
  const { p, t } = tree();
  const o = P.outline(p);
  assert.deepEqual(p.tasks.map((task) => o.wbs.get(task.id)), ['1', '1.1', '1.2', '1.2.1', '2']);
  assert.equal(o.parent.get(t.A.id), null);
  assert.equal(o.parent.get(t.A2a.id), t.A2.id);
  assert.deepEqual(o.children.get(t.A.id), [t.A1.id, t.A2.id]);
  assert.ok(o.isSummary(t.A.id) && o.isSummary(t.A2.id));
  assert.ok(!o.isSummary(t.A1.id) && !o.isSummary(t.B.id));
  // A level jump is read as one level deeper.
  t.B.outlineLevel = 1;
  const x = add(p, 'X', 1);
  x.outlineLevel = 3;
  assert.equal(P.outline(p).wbs.get(x.id), '2.1');
  assert.equal(P.outline(p).parent.get(x.id), t.B.id);
});

test('subtreeRange, descendants and ancestors', () => {
  const { p, t } = tree();
  assert.deepEqual(P.subtreeRange(p, t.A.id), [0, 4]);
  assert.deepEqual(P.subtreeRange(p, t.A2.id), [2, 4]);
  assert.deepEqual(P.subtreeRange(p, t.B.id), [4, 5]);
  assert.deepEqual(P.subtreeRange(p, 'nope'), [0, 0]);
  assert.deepEqual(P.descendants(p, t.A.id), [t.A1.id, t.A2.id, t.A2a.id]);
  assert.deepEqual(P.descendants(p, t.A1.id), []);
  assert.deepEqual(P.descendants(p, 'nope'), []);
  assert.deepEqual(P.ancestors(p, t.A2a.id), [t.A2.id, t.A.id]);
  assert.deepEqual(P.ancestors(p, t.B.id), []);
  assert.equal(P.rowOf(p, t.A2.id), 3);
  assert.equal(P.rowOf(p, 'nope'), 0);
  assert.equal(P.taskAtRow(p, 5), t.B);
  assert.equal(P.taskAtRow(p, 6), null);
  assert.equal(P.findTask(p, 'nope'), null);
  assert.equal(P.taskIndex(p, t.B.id), 4);
});

test('visibleTasks hides the rows under collapsed summaries', () => {
  const { p, t } = tree();
  assert.equal(P.visibleTasks(p).length, 5);
  t.A2.collapsed = true;
  assert.deepEqual(P.visibleTasks(p).map((task) => task.name), ['A', 'A1', 'A2', 'B']);
  t.A.collapsed = true;
  assert.deepEqual(P.visibleTasks(p).map((task) => task.name), ['A', 'B']);
  t.A.collapsed = false;
  t.A2.collapsed = false;
  t.B.collapsed = true;
  assert.equal(P.visibleTasks(p).length, 5, 'collapsing a task without children hides nothing');
});

test('fixOutline repairs levels', () => {
  const p = make();
  for (const level of [3, 5, 0, 12, 2.6, null]) add(p, `L${level}`).outlineLevel = level;
  P.fixOutline(p);
  assert.deepEqual(levels(p), [1, 2, 1, 2, 3, 1]);
  const q = make();
  for (let i = 1; i <= 12; i++) add(q, `L${i}`).outlineLevel = i;
  P.fixOutline(q);
  assert.equal(Math.max(...levels(q)), P.MAX_LEVEL);
});

test('topmost keeps only the outermost selected subtrees, in row order', () => {
  const { p, t } = tree();
  assert.deepEqual(P.topmost(p, [t.B.id, t.A2a.id, t.A.id]), [t.A.id, t.B.id]);
  assert.deepEqual(P.topmost(p, [t.A2a.id, t.A1.id]), [t.A1.id, t.A2a.id]);
  assert.deepEqual(P.topmost(p, [t.A2.id, t.A2a.id, t.B.id]), [t.A2.id, t.B.id]);
  assert.deepEqual(P.topmost(p, ['nope']), []);
});

test('updateTask: milestones, percentages and priorities are kept valid', () => {
  const { p, t } = tree();
  assert.equal(P.updateTask(p, 'nope', { name: 'x' }), null);
  P.updateTask(p, t.B.id, { milestone: true });
  assert.equal(t.B.duration, 0);
  P.updateTask(p, t.B.id, { duration: 960 });
  assert.equal(t.B.milestone, false, 'a duration makes it a task again');
  P.updateTask(p, t.B.id, { duration: 0 });
  assert.equal(t.B.milestone, true, 'zero makes a milestone');
  P.updateTask(p, t.B.id, { percentComplete: 140 });
  assert.equal(t.B.percentComplete, 100);
  P.updateTask(p, t.B.id, { percentComplete: 'x' });
  assert.equal(t.B.percentComplete, 0);
  P.updateTask(p, t.B.id, { percentComplete: 33.6 });
  assert.equal(t.B.percentComplete, 34);
  P.updateTask(p, t.B.id, { priority: 5000 });
  assert.equal(t.B.priority, 1000);
  P.updateTask(p, t.B.id, { priority: -3 });
  assert.equal(t.B.priority, 0);
});

test('indent: under the row above, with the whole subtree; never the first row', () => {
  const { p, t } = tree();
  assert.equal(P.indentTasks(p, [t.A.id]), 0, 'the first row cannot be indented');
  assert.equal(P.indentTasks(p, [t.A1.id]), 0, 'a first child cannot go two levels below its summary');
  assert.equal(P.indentTasks(p, [t.A2.id]), 1);
  assert.deepEqual(levels(p), [1, 2, 3, 4, 1], 'A2 and A2a went one level deeper, under A1');
  assert.equal(P.indentTasks(p, [t.B.id]), 1);
  assert.equal(t.B.outlineLevel, 2, 'B is now inside A');
  // Selecting a summary and its child indents the subtree once.
  const q = tree();
  P.indentTasks(q.p, [q.t.B.id, q.t.A2.id, q.t.A2a.id]);
  assert.deepEqual(levels(q.p), [1, 2, 3, 4, 2]);
});

test('indent drops a link between a task and its new summary', () => {
  const { p, t } = tree();
  P.linkTasks(p, t.A1.id, t.A2.id);
  P.linkTasks(p, t.A1.id, t.B.id);
  P.indentTasks(p, [t.A2.id]);
  assert.deepEqual(t.A2.predecessors, [], 'A1 is now the summary of A2');
  assert.equal(t.B.predecessors.length, 1, 'other links stay');
});

test('indent stops at the deepest level', () => {
  const p = make();
  add(p, 'top', 1);
  for (let i = 2; i <= P.MAX_LEVEL; i++) add(p, `L${i}`, i);
  const last = add(p, 'last', P.MAX_LEVEL);
  assert.equal(P.indentTasks(p, [last.id]), 0);
  assert.equal(last.outlineLevel, P.MAX_LEVEL);
});

test('outdent: one level up with the subtree; level 1 stays', () => {
  const { p, t } = tree();
  assert.equal(P.outdentTasks(p, [t.A.id, t.B.id]), 0);
  assert.equal(P.outdentTasks(p, [t.A2.id]), 1);
  assert.deepEqual(levels(p), [1, 2, 1, 2, 1]);
  assert.equal(P.outline(p).parent.get(t.A2a.id), t.A2.id, 'A2a stays under A2');
});

test('moveTasks up and down past whole sibling subtrees', () => {
  const { p, t } = tree();
  assert.equal(P.moveTasks(p, [t.A2.id], -1), 1);
  assert.deepEqual(names(p), ['A', 'A2', 'A2a', 'A1', 'B']);
  assert.equal(P.moveTasks(p, [t.A2.id], -1), 0, 'the first child stays inside its summary');
  assert.equal(P.moveTasks(p, [t.A2.id], 1), 1);
  assert.deepEqual(names(p), ['A', 'A1', 'A2', 'A2a', 'B']);
  assert.equal(P.moveTasks(p, [t.A2.id], 1), 0, 'the last child stays inside its summary');
  assert.equal(P.moveTasks(p, [t.B.id], -1), 1, 'B jumps over all of A');
  assert.deepEqual(names(p), ['B', 'A', 'A1', 'A2', 'A2a']);
  assert.equal(P.moveTasks(p, [t.B.id], -1), 0, 'already first');
  assert.equal(P.moveTasks(p, [t.A.id], -1), 1);
  assert.deepEqual(names(p), ['A', 'A1', 'A2', 'A2a', 'B']);
  assert.equal(P.moveTasks(p, [t.A.id], 1), 1, 'a summary moves down with its subtree');
  assert.deepEqual(names(p), ['B', 'A', 'A1', 'A2', 'A2a']);
  assert.deepEqual(levels(p), [1, 1, 2, 2, 3]);
});

test('moveTasks with several selected rows keeps their order', () => {
  const p = make();
  for (const name of ['X', 'Y', 'Z', 'W']) add(p, name);
  const [x, y, z] = p.tasks;
  P.moveTasks(p, [y.id, z.id], -1);
  assert.deepEqual(names(p), ['Y', 'Z', 'X', 'W']);
  P.moveTasks(p, [y.id, z.id], 1);
  assert.deepEqual(names(p), ['X', 'Y', 'Z', 'W']);
  // The first row cannot move up, so the rows selected with it stay behind it.
  assert.equal(P.moveTasks(p, [x.id, y.id], -1), 0);
  assert.deepEqual(names(p), ['X', 'Y', 'Z', 'W']);
  assert.equal(P.moveTasks(p, [z.id, p.tasks[3].id], 1), 0, 'the same at the bottom');
  assert.deepEqual(names(p), ['X', 'Y', 'Z', 'W']);
});

test('moveTasksTo moves subtrees to a row, optionally to a new level', () => {
  const { p, t } = tree();
  assert.equal(P.moveTasksTo(p, [t.B.id], 1, 2), 1);
  assert.deepEqual(names(p), ['A', 'B', 'A1', 'A2', 'A2a']);
  assert.deepEqual(levels(p), [1, 2, 2, 2, 3]);
  assert.equal(P.moveTasksTo(p, [t.A2.id], 5, 1), 1, 'to the end, out to level 1');
  assert.deepEqual(names(p), ['A', 'B', 'A1', 'A2', 'A2a']);
  assert.deepEqual(levels(p), [1, 2, 2, 1, 2], 'the subtree keeps its shape');
  assert.equal(P.moveTasksTo(p, [t.A.id], 5), 1, 'a whole summary to the end');
  assert.deepEqual(names(p), ['A2', 'A2a', 'A', 'B', 'A1']);
  assert.equal(P.moveTasksTo(p, [], 0), 0);
  assert.equal(P.moveTasksTo(p, [t.A1.id], -10, 1), 1, 'a target before the top inserts first');
  assert.equal(p.tasks[0], t.A1);
});

test('moveTasksTo drops links that would join a summary and its own task', () => {
  const { p, t } = tree();
  P.linkTasks(p, t.B.id, t.A1.id);
  // A1 (which waits for B) is dropped under B: B becomes its summary.
  P.moveTasksTo(p, [t.A1.id], 5, 2);
  assert.deepEqual(names(p), ['A', 'A2', 'A2a', 'B', 'A1']);
  assert.equal(P.outline(p).parent.get(t.A1.id), t.B.id);
  assert.deepEqual(t.A1.predecessors, []);
});

test('deleteTasks removes subtrees with their links and assignments', () => {
  const { p, t } = tree();
  const r = P.addResource(p, { name: 'R' });
  P.assignResource(p, t.A2a.id, r.id);
  P.assignResource(p, t.B.id, r.id);
  P.linkTasks(p, t.A1.id, t.B.id);
  P.linkTasks(p, t.A2a.id, t.B.id);
  assert.equal(P.deleteTasks(p, [t.A.id, 'nope']), 4);
  assert.deepEqual(names(p), ['B']);
  assert.deepEqual(t.B.predecessors, []);
  assert.deepEqual(p.assignments.map((a) => a.taskId), [t.B.id]);
  assert.equal(P.deleteTasks(p, ['nope']), 0);
});

test('deleting the summary row above a deeper row repairs levels', () => {
  const p = make();
  add(p, 'A', 1);
  const b = add(p, 'B', 1);
  add(p, 'B1', 2);
  P.deleteTasks(p, [p.tasks[0].id]);
  assert.deepEqual(levels(p), [1, 2]);
  P.outdentTasks(p, [p.tasks[1].id]);
  P.deleteTasks(p, [b.id]);
  assert.deepEqual(levels(p), [1]);
});

test('linkTasks, linkSequence, unlinkTasks and successorsOf', () => {
  const { p, t } = tree();
  assert.equal(P.linkTasks(p, 'nope', t.B.id), false);
  assert.equal(P.linkTasks(p, t.B.id, 'nope'), false);
  assert.equal(P.linkTasks(p, t.A1.id, t.B.id, 'SS', 240, 'h'), true);
  assert.deepEqual(t.B.predecessors, [{ taskId: t.A1.id, type: 'SS', lag: 240, lagUnit: 'h' }]);
  assert.equal(P.linkTasks(p, t.A1.id, t.B.id, 'FF'), true, 'linking again changes the link');
  assert.deepEqual(t.B.predecessors, [{ taskId: t.A1.id, type: 'FF', lag: 0, lagUnit: 'd' }]);
  assert.deepEqual(P.successorsOf(p, t.A1.id).map((s) => [s.task.id, s.link.type]), [[t.B.id, 'FF']]);
  assert.deepEqual(P.successorsOf(p, t.B.id), []);
  assert.equal(P.unlinkTasks(p, t.A1.id, t.B.id), true);
  assert.equal(P.unlinkTasks(p, t.A1.id, t.B.id), false, 'nothing left to unlink');
  assert.equal(P.unlinkTasks(p, t.A1.id, 'nope'), false);
  assert.equal(P.linkSequence(p, [t.B.id, t.A2a.id, t.A1.id]), 2, 'in row order: A1 → A2a → B');
  assert.deepEqual(t.A2a.predecessors.map((l) => l.taskId), [t.A1.id]);
  assert.deepEqual(t.B.predecessors.map((l) => l.taskId), [t.A2a.id]);
  assert.equal(P.linkSequence(p, [t.B.id]), 0);
});

test('wouldCycle: direct loops, chains and summary families', () => {
  const { p, t } = tree();
  assert.equal(P.wouldCycle(p, t.B.id, t.B.id), true, 'self');
  assert.equal(P.wouldCycle(p, t.A.id, t.A1.id), true, 'summary → its own task');
  assert.equal(P.wouldCycle(p, t.A2a.id, t.A.id), true, 'task → its own summary');
  assert.equal(P.linkTasks(p, t.A.id, t.A2a.id), false);
  P.linkTasks(p, t.A1.id, t.A2a.id);
  assert.equal(P.wouldCycle(p, t.A2a.id, t.A1.id), true, 'reverse of a link');
  P.linkTasks(p, t.A2a.id, t.B.id);
  assert.equal(P.wouldCycle(p, t.B.id, t.A1.id), true, 'through a chain');
  assert.equal(P.linkTasks(p, t.B.id, t.A1.id), false);
  assert.equal(P.wouldCycle(p, t.B.id, t.A.id), true, 'B waits for a task inside A, so A cannot wait for B');
  assert.equal(P.wouldCycle(p, t.B.id, t.A2.id), true);
  assert.equal(P.wouldCycle(p, t.A1.id, t.B.id), false, 'a second path in the same direction is fine');
  // A link from a summary: everything inside waits for the predecessor.
  const q = tree();
  P.linkTasks(q.p, q.t.A.id, q.t.B.id);
  assert.equal(P.wouldCycle(q.p, q.t.B.id, q.t.A2a.id), true, 'B waits for A, which finishes with A2a');
  const c = add(q.p, 'C', 1);
  assert.equal(P.wouldCycle(q.p, c.id, q.t.A1.id), false);
});

test('unlinkAll: one task loses every link, several only those among them', () => {
  const p = make();
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((name) => add(p, name));
  P.linkSequence(p, [a.id, b.id, c.id, d.id]);
  assert.equal(P.unlinkAll(p, [a.id, b.id]), 1, 'only a → b');
  assert.deepEqual(c.predecessors.map((l) => l.taskId), [b.id], 'b → c stays');
  assert.equal(P.unlinkAll(p, [c.id]), 2, 'b → c and c → d');
  assert.equal(p.tasks.reduce((n, task) => n + task.predecessors.length, 0), 0);
});

test('resources: add, update (initials follow the name), delete with assignments', () => {
  const { p, t } = tree();
  const kim = P.addResource(p, { name: 'Kim Min' });
  const lee = P.addResource(p, { name: 'Lee' }, 0);
  assert.deepEqual(p.resources.map((r) => r.name), ['Lee', 'Kim Min'], 'inserted at an index');
  P.updateResource(p, kim.id, { name: 'Park Ji', previousName: 'Kim Min' });
  assert.equal(kim.initials, 'PJ', 'automatic initials follow the name');
  assert.equal('previousName' in kim, false);
  P.updateResource(p, kim.id, { initials: 'XX' });
  P.updateResource(p, kim.id, { name: 'Choi', previousName: 'Park Ji' });
  assert.equal(kim.initials, 'XX', 'typed initials are kept');
  P.updateResource(p, kim.id, { maxUnits: -2 });
  assert.equal(kim.maxUnits, 0);
  P.updateResource(p, kim.id, { maxUnits: 'abc' });
  assert.equal(kim.maxUnits, 0);
  P.updateResource(p, kim.id, { maxUnits: '1.5' });
  assert.equal(kim.maxUnits, 1.5);
  assert.equal(P.updateResource(p, 'nope', { name: 'x' }), null);
  P.assignResource(p, t.A1.id, kim.id);
  P.assignResource(p, t.B.id, kim.id);
  P.assignResource(p, t.B.id, lee.id);
  assert.equal(P.assignmentsFor(p, kim.id).length, 2);
  P.deleteResources(p, [kim.id]);
  assert.deepEqual(p.resources.map((r) => r.name), ['Lee']);
  assert.deepEqual(p.assignments.map((a) => a.resourceId), [lee.id]);
  assert.equal(P.findResource(p, kim.id), null);
});

test('assignResource / unassignResource', () => {
  const { p, t } = tree();
  const r = P.addResource(p, { name: 'R' });
  assert.equal(P.assignResource(p, 'nope', r.id), null);
  assert.equal(P.assignResource(p, t.B.id, 'nope'), null);
  const a = P.assignResource(p, t.B.id, r.id, 0.5);
  assert.equal(a.units, 0.5);
  const again = P.assignResource(p, t.B.id, r.id, 2, { cost: 10 });
  assert.equal(again, a, 'assigning again changes the assignment');
  assert.equal(a.units, 2);
  assert.equal(a.cost, 10);
  assert.equal(P.assignmentsOf(p, t.B.id).length, 1);
  assert.equal(P.unassignResource(p, t.B.id, r.id), true);
  assert.equal(P.unassignResource(p, t.B.id, r.id), false);
});

test('effort-driven tasks get shorter when people are added', () => {
  const p = make();
  const task = add(p, 'Dig', 1, { duration: 4 * DAY, effortDriven: true });
  const fixedDuration = add(p, 'Meet', 1, { duration: 4 * DAY, effortDriven: true, type: 'fixedDuration' });
  const plain = add(p, 'Plain', 1, { duration: 4 * DAY });
  const [r1, r2, r3] = ['R1', 'R2', 'R3'].map((name) => P.addResource(p, { name }));
  const sand = P.addResource(p, { name: 'Sand', type: 'material' });
  P.assignResource(p, task.id, r1.id);
  assert.equal(task.duration, 4 * DAY, 'the first person sets the work');
  P.assignResource(p, task.id, r2.id);
  assert.equal(task.duration, 2 * DAY, 'two people: half the time');
  P.assignResource(p, task.id, r3.id, 2);
  assert.equal(task.duration, DAY, 'four units in all: a quarter');
  assert.equal(P.taskWorkUnits(p, task), 4);
  P.assignResource(p, task.id, sand.id, 10);
  assert.equal(task.duration, DAY, 'materials do not change the duration');
  assert.equal(P.taskWorkUnits(p, task), 4, 'material units are not work units');
  P.assignResource(p, fixedDuration.id, r1.id);
  P.assignResource(p, fixedDuration.id, r2.id);
  assert.equal(fixedDuration.duration, 4 * DAY, 'fixed duration never shrinks');
  P.assignResource(p, plain.id, r1.id);
  P.assignResource(p, plain.id, r2.id);
  assert.equal(plain.duration, 4 * DAY, 'not effort-driven');
});

test('assignmentWork: duration × units for work resources', () => {
  const p = make();
  const task = add(p, 'T', 1, { duration: 2 * DAY });
  const r = P.addResource(p, { name: 'R' });
  const m = P.addResource(p, { name: 'M', type: 'material' });
  const a = P.assignResource(p, task.id, r.id, 0.5);
  const b = P.assignResource(p, task.id, m.id, 3);
  assert.equal(P.assignmentWork(p, task, a), DAY);
  assert.equal(P.assignmentWork(p, task, b), 0);
  a.work = 100;
  assert.equal(P.assignmentWork(p, task, a), DAY, 'stored work only counts for fixed-work tasks');
  task.type = 'fixedWork';
  assert.equal(P.assignmentWork(p, task, a), 100);
});

test('setTaskDuration follows the task type', () => {
  const p = make();
  const r = P.addResource(p, { name: 'R' });
  const units = add(p, 'units', 1, { duration: 4 * DAY });
  const work = add(p, 'work', 1, { duration: 4 * DAY, type: 'fixedWork' });
  const dur = add(p, 'duration', 1, { duration: 4 * DAY, type: 'fixedDuration' });
  const [au, aw, ad] = [units, work, dur].map((task) => P.assignResource(p, task.id, r.id, 1));
  P.setTaskDuration(p, units.id, 2 * DAY, 'd');
  assert.equal(au.units, 1, 'fixed units: units stay');
  assert.equal(P.assignmentWork(p, units, au), 2 * DAY, '…and the work follows the duration');
  P.setTaskDuration(p, work.id, 2 * DAY);
  assert.equal(aw.units, 2, 'fixed work: twice the units in half the time');
  assert.equal(aw.work, 4 * DAY);
  assert.equal(P.assignmentWork(p, work, aw), 4 * DAY);
  P.setTaskDuration(p, work.id, 8 * DAY);
  assert.equal(aw.units, 0.5);
  P.setTaskDuration(p, dur.id, DAY);
  assert.equal(ad.units, 1, 'fixed duration: units stay');
  P.setTaskDuration(p, units.id, 0);
  assert.equal(units.milestone, true, 'zero makes a milestone');
  P.setTaskDuration(p, units.id, 90.4, 'h');
  assert.deepEqual([units.duration, units.durationUnit, units.milestone, units.estimated], [90, 'h', false, false]);
  P.setTaskDuration(p, units.id, -5);
  assert.equal(units.duration, 0);
  assert.equal(P.setTaskDuration(p, 'nope', 1), null);
});

test('setTaskWork: duration (fixed units) or units (fixed duration / work) follow', () => {
  const p = make();
  const r = P.addResource(p, { name: 'R' });
  const r2 = P.addResource(p, { name: 'R2' });
  const none = add(p, 'none', 1, { duration: 2 * DAY });
  P.setTaskWork(p, none.id, 1000);
  assert.equal(none.work, 1000, 'without resources the work is stored on the task');
  assert.equal(none.duration, 2 * DAY);
  const units = add(p, 'units', 1, { duration: 2 * DAY });
  P.assignResource(p, units.id, r.id, 1);
  P.assignResource(p, units.id, r2.id, 1);
  P.setTaskWork(p, units.id, 8 * DAY);
  assert.equal(units.duration, 4 * DAY, 'fixed units: two people need four days for eight days of work');
  const dur = add(p, 'dur', 1, { duration: 2 * DAY, type: 'fixedDuration' });
  const ad = P.assignResource(p, dur.id, r.id, 1);
  P.setTaskWork(p, dur.id, 4 * DAY);
  assert.equal(dur.duration, 2 * DAY);
  assert.equal(ad.units, 2);
  const work = add(p, 'work', 1, { duration: 2 * DAY, type: 'fixedWork' });
  const aw = P.assignResource(p, work.id, r.id, 1);
  P.setTaskWork(p, work.id, DAY);
  assert.equal(work.duration, 2 * DAY);
  assert.equal(aw.units, 0.5);
  assert.equal(aw.work, DAY);
  assert.equal(P.setTaskWork(p, 'nope', 1), null);
});

test('calendars: add a copy, change its week, add and remove exceptions', () => {
  const p = make();
  const cal = P.addCalendar(p, 'Mine');
  assert.notEqual(cal.id, 'standard');
  assert.equal(cal.base, null);
  assert.equal(cal.name, 'Mine');
  assert.deepEqual(cal.week, p.calendars[0].week);
  P.setWorkWeek(p, cal.id, 5, [[780, 1020], [480, 720], [700, 800]]);
  assert.deepEqual(cal.week[5], [[480, 1020]], 'periods are normalized');
  assert.deepEqual(p.calendars[0].week[5], [[480, 720], [780, 1020]], 'the source calendar is untouched');
  assert.equal(P.setWorkWeek(p, 'nope', 1, []), null);
  assert.equal(P.addCalendar(p, 'From night', 'night').week[1][0][0], 23 * 60);
  assert.equal(P.addCalendar(p, 'Fallback', 'missing').week[1].length, 2, 'an unknown source copies the first calendar');
  const later = P.addException(p, cal.id, { name: 'Later', start: '2026-12-25' });
  const earlier = P.addException(p, cal.id, { name: 'Earlier', start: '2026-10-21', finish: '2026-10-22', working: true, periods: [[600, 660]] });
  assert.equal(later.finish, '2026-12-25', 'a one-day exception by default');
  assert.equal(later.working, false);
  assert.deepEqual(cal.exceptions.map((e) => e.name), ['Earlier', 'Later'], 'sorted by date');
  const engine = new CalendarEngine(p.calendars, cal.id);
  assert.equal(engine.dayMinutes(dayFromIso('2026-10-22')), 60);
  assert.equal(engine.isWorkingDay(dayFromIso('2026-12-25')), false);
  assert.equal(P.addException(p, 'nope', { start: '2026-10-21' }), null);
  assert.equal(P.removeException(p, cal.id, earlier.id), true);
  assert.equal(P.removeException(p, cal.id, earlier.id), false);
  assert.equal(P.removeException(p, 'nope', later.id), false);
  assert.deepEqual(cal.exceptions.map((e) => e.name), ['Later']);
});

test('deleteCalendar clears every reference, but not the project or standard calendar', () => {
  const p = make();
  const cal = P.addCalendar(p, 'Shift');
  const child = P.addCalendar(p, 'Child');
  child.base = cal.id;
  const task = add(p, 'T', 1, { calendarId: cal.id });
  const r = P.addResource(p, { name: 'R', calendarId: cal.id });
  assert.equal(P.deleteCalendar(p, 'standard'), false);
  p.calendarId = 'night';
  assert.equal(P.deleteCalendar(p, 'night'), false, 'the project calendar stays');
  assert.equal(P.deleteCalendar(p, cal.id), true);
  assert.equal(p.calendars.some((c) => c.id === cal.id), false);
  assert.equal(task.calendarId, null);
  assert.equal(r.calendarId, null);
  assert.equal(child.base, null);
});

test('copyTasks / pasteTasks keep links inside the copy and drop the rest', () => {
  const { p, t } = tree();
  const r = P.addResource(p, { name: 'R' });
  P.linkTasks(p, t.A1.id, t.A2a.id, 'SS', DAY);
  P.linkTasks(p, t.B.id, t.A1.id);
  P.assignResource(p, t.A2a.id, r.id, 0.5);
  t.A2a.notes = 'note';
  const copied = P.copyTasks(p, [t.A2.id, t.A1.id, t.A2a.id]);
  assert.deepEqual(copied.tasks.map((task) => [task.name, task.outlineLevel]), [['A1', 1], ['A2', 1], ['A2a', 2]], 'levels start at 1');
  assert.deepEqual(copied.tasks[0].predecessors, [], 'the link from B (not copied) is dropped');
  assert.deepEqual(copied.tasks[2].predecessors.map((l) => [l.taskId, l.type]), [[t.A1.id, 'SS']]);
  assert.equal(copied.assignments.length, 1);
  copied.tasks[2].notes = 'changed';
  assert.equal(t.A2a.notes, 'note', 'the copy is deep');
  const ids = P.pasteTasks(p, copied);
  assert.equal(ids.length, 3);
  assert.equal(p.tasks.length, 8);
  const pasted = ids.map((id) => P.findTask(p, id));
  assert.ok(pasted.every((task) => !Object.values(t).some((old) => old.id === task.id)), 'new ids');
  assert.deepEqual(pasted.map((task) => task.outlineLevel), [1, 1, 2], 'under the level of the row above (B)');
  assert.deepEqual(pasted[2].predecessors.map((l) => [l.taskId, l.type, l.lag]), [[ids[0], 'SS', DAY]], 'the link points at the pasted A1');
  const newAssignments = P.assignmentsOf(p, ids[2]);
  assert.equal(newAssignments.length, 1);
  assert.equal(newAssignments[0].units, 0.5);
  assert.equal(p.assignments.length, 2);
  assert.notEqual(newAssignments[0].id, copied.assignments[0].id);
});

test('pasteTasks at an index inside a summary, and assignments to missing resources', () => {
  const { p, t } = tree();
  const r = P.addResource(p, { name: 'R' });
  P.assignResource(p, t.B.id, r.id);
  const copied = P.copyTasks(p, [t.B.id]);
  P.deleteResources(p, [r.id]);
  const [id] = P.pasteTasks(p, copied, 4);
  assert.equal(P.findTask(p, id).outlineLevel, 3, 'below A2a, at its level');
  assert.equal(P.assignmentsOf(p, id).length, 0, 'the resource is gone');
  const [top] = P.pasteTasks(p, copied, 0);
  assert.equal(P.findTask(p, top).outlineLevel, 1);
  const [given] = P.pasteTasks(p, copied, 2, 2);
  assert.equal(P.findTask(p, given).outlineLevel, 2, 'an explicit level');
  assert.deepEqual(P.copyTasks(p, []), { tasks: [], assignments: [] });
});
