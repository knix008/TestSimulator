// An open plan: undoable changes, undo / redo with rescheduling, the
// "unsaved changes" flag and the saved text.
import assert from 'node:assert/strict';
import test from 'node:test';
import { PlanDocument } from '../../src/domain/document.js';
import { parsePlan } from '../../src/domain/format.js';
import * as P from '../../src/domain/project.js';
import { fromMin } from '../../src/domain/time.js';

const DAY = 480;

function open() {
  const project = P.createProject({ title: 'Doc', start: '2026-10-19T08:00' });
  const a = P.insertTask(project, 0, { name: 'A', duration: 2 * DAY });
  const b = P.insertTask(project, 1, { name: 'B', duration: DAY });
  P.linkTasks(project, a.id, b.id);
  return { doc: new PlanDocument(project, { path: 'C:\\plans\\doc.mwp', name: 'doc.mwp' }), a: a.id, b: b.id };
}
const finishOf = (doc, id) => fromMin(doc.sched.info(id).finish);

test('a new document is scheduled, clean and has no history', () => {
  const { doc, b } = open();
  assert.equal(doc.dirty, false);
  assert.equal(doc.history.canUndo, false);
  assert.equal(doc.history.canRedo, false);
  assert.equal(finishOf(doc, b), '2026-10-21T17:00');
  assert.deepEqual([doc.path, doc.name, doc.fromTemplate], ['C:\\plans\\doc.mwp', 'doc.mwp', false]);
  assert.equal(doc.view.id, 'gantt');
  assert.ok(doc.id.startsWith('doc-'));
  assert.notEqual(new PlanDocument(P.createProject()).id, doc.id);
});

test('apply records an undo step and reschedules only on a real change', () => {
  const { doc, a, b } = open();
  const result = doc.apply('op.duration', (project) => { P.setTaskDuration(project, a, 3 * DAY); return 'done'; });
  assert.equal(result, 'done', 'apply returns what the change returned');
  assert.equal(doc.history.undoStack.length, 1);
  assert.equal(doc.history.undoLabel, 'op.duration');
  assert.equal(finishOf(doc, b), '2026-10-22T17:00', 'rescheduled');
  assert.equal(doc.dirty, true);
  const sched = doc.sched;
  doc.apply('op.nothing', (project) => { P.findTask(project, a).name = 'A'; return 0; });
  assert.equal(doc.history.undoStack.length, 1, 'no change: no step');
  assert.equal(doc.sched, sched, 'no change: no new schedule');
  doc.apply('op.reads', (project) => project.tasks.length);
  assert.equal(doc.history.undoStack.length, 1);
});

test('undo and redo restore the plan and its schedule', () => {
  const { doc, a, b } = open();
  doc.apply('op.one', (project) => P.setTaskDuration(project, a, 3 * DAY));
  doc.apply('op.two', (project) => P.insertTask(project, 2, { name: 'C', duration: DAY }));
  assert.equal(doc.project.tasks.length, 3);
  assert.equal(doc.undo(), 'op.two');
  assert.equal(doc.project.tasks.length, 2);
  assert.equal(doc.history.redoLabel, 'op.two');
  assert.equal(doc.undo(), 'op.one');
  assert.equal(P.findTask(doc.project, a).duration, 2 * DAY);
  assert.equal(finishOf(doc, b), '2026-10-21T17:00', 'the schedule follows');
  assert.equal(doc.dirty, false, 'back to the saved state');
  assert.equal(doc.undo(), null, 'nothing more to undo');
  assert.equal(doc.redo(), 'op.one');
  assert.equal(finishOf(doc, b), '2026-10-22T17:00');
  assert.equal(doc.redo(), 'op.two');
  assert.equal(doc.project.tasks.length, 3);
  assert.equal(doc.redo(), null);
  doc.undo();
  doc.apply('op.three', (project) => P.updateTask(project, a, { name: 'Renamed' }));
  assert.equal(doc.history.canRedo, false, 'a new change clears redo');
  assert.equal(P.findTask(doc.project, a).name, 'Renamed');
});

test('undo gives a fresh project object (views must re-read doc.project)', () => {
  const { doc, a } = open();
  const before = doc.project;
  doc.apply('op', (project) => P.updateTask(project, a, { name: 'X' }));
  doc.undo();
  assert.notEqual(doc.project, before);
  assert.equal(P.findTask(doc.project, a).name, 'A');
});

test('collapsing summaries is not an unsaved change, but stays undoable', () => {
  const project = P.createProject({ start: '2026-10-19T08:00' });
  const sum = P.insertTask(project, 0, { name: 'S' });
  P.insertTask(project, 1, { name: 'K', outlineLevel: 2 });
  const doc = new PlanDocument(project);
  doc.apply('op.collapse', (p) => { P.findTask(p, sum.id).collapsed = true; });
  assert.equal(doc.dirty, false);
  assert.equal(doc.history.canUndo, true);
  doc.apply('op.rename', (p) => { P.findTask(p, sum.id).name = 'Phase'; });
  assert.equal(doc.dirty, true);
});

test('markSaved clears the dirty flag and remembers the path', () => {
  const { doc, a } = open();
  doc.fromTemplate = true;
  doc.apply('op', (project) => P.updateTask(project, a, { name: 'Changed' }));
  assert.equal(doc.dirty, true);
  doc.markSaved('D:\\new.mwp');
  assert.equal(doc.dirty, false);
  assert.equal(doc.path, 'D:\\new.mwp');
  assert.equal(doc.fromTemplate, false, 'saved as a plan');
  doc.markSaved();
  assert.equal(doc.path, 'D:\\new.mwp', 'the path is kept');
  doc.undo();
  assert.equal(doc.dirty, true, 'undoing past the save is a change again');
});

test('text() is the saved file, as a plan or a template', () => {
  const { doc, a } = open();
  P.findTask(doc.project, a).percentComplete = 50;
  const plan = parsePlan(doc.text());
  assert.equal(plan.template, false);
  assert.equal(plan.project.title, 'Doc');
  assert.equal(plan.project.tasks[0].percentComplete, 50);
  const data = JSON.parse(doc.text());
  assert.equal(data.project.tasks[0].scheduledStart, '2026-10-19T08:00', 'scheduled dates are written');
  const template = parsePlan(doc.text({ template: true }));
  assert.equal(template.template, true);
  assert.equal(template.project.tasks[0].percentComplete, 0);
});

test('a document from a template, and recalculate', () => {
  const project = P.createProject({ start: '2026-10-19T08:00' });
  const doc = new PlanDocument(project, { template: true });
  assert.equal(doc.fromTemplate, true);
  assert.equal(doc.path, null);
  project.tasks.push(P.createTask(project, { name: 'Outside', duration: DAY }));
  assert.equal(doc.sched.info(project.tasks[0].id), null, 'changes outside apply are not scheduled');
  assert.equal(doc.recalculate(), doc.sched);
  assert.ok(doc.sched.info(project.tasks[0].id));
});
