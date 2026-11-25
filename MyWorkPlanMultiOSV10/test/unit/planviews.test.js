// The planning pictures added together: the burndown data and its printed page,
// the kanban board's columns, the fixed program-information card of the start
// page, and the moving backgrounds (every scene draws at any size without errors).
import assert from 'node:assert/strict';
import test from 'node:test';
import { schedule } from '../../src/domain/schedule.js';
import { buildSample } from '../../src/domain/templates.js';
import { burndownData, burndownVariance } from '../../src/domain/burndown.js';
import { setPercentComplete } from '../../src/domain/tracking.js';
import { CONTENTS, renderPrintSvg } from '../../src/print/render.js';
import { kanbanCards, kanbanColumnOf, kanbanDropPercent, initials, KANBAN_COLUMNS } from '../../src/views/kanban.js';
import { autoArrange, cardsOf, place } from '../../src/ui/startlayout.js';
import { ANIMATIONS } from '../../src/domain/settings.js';
import { PLAN_SCENES, PLAN_SCENE_ITEMS } from '../../src/ui/background-plan.js';

const TODAY = '2026-10-16';
const sample = () => {
  const project = buildSample('en', { today: TODAY });
  return { project, sched: schedule(project) };
};

test('burndown: from everything at the start to nothing at the finish; actual stops at the status date', () => {
  const { project, sched } = sample();
  const data = burndownData(project, sched, { now: sched.start + 10 * 1440 });
  assert.ok(data.total > 0 && data.tasks > 0);
  assert.equal(data.points[0].ideal, data.total, 'ideal starts at the total');
  assert.ok(Math.abs(data.points.at(-1).ideal) < 1e-6, 'and ends at zero');
  assert.ok(data.points.at(-1).planned < 1e-6, 'everything is done by the finish as scheduled');
  for (let i = 1; i < data.points.length; i++) assert.ok(data.points[i].planned <= data.points[i - 1].planned + 1e-6, 'the scheduled line never rises');
  const past = data.points.filter((p) => p.actual != null);
  assert.ok(past.length > 0 && past.length < data.points.length, 'actual only up to the status date');
  assert.ok(data.points.length <= 80);
  assert.equal(data.remaining, data.total - data.done);
  assert.equal(typeof burndownVariance(data), 'number');
});

test('burndown: a plan without resources burns down task durations', () => {
  const { project } = sample();
  project.assignments = [];
  const data = burndownData(project, schedule(project));
  assert.equal(data.unit, 'duration');
  assert.ok(data.total > 0, 'not a flat zero line');
});

test('burndown: finished work lowers the actual line and counts as done tasks', () => {
  const { project, sched } = sample();
  const before = burndownData(project, sched, { now: sched.finish });
  const ids = project.tasks.filter((task) => !sched.info(task.id).summary && (sched.info(task.id).percentComplete ?? 0) < 100 && task.active !== false).slice(0, 3).map((task) => task.id);
  assert.equal(ids.length, 3);
  setPercentComplete(project, sched, ids, 100);
  const after = schedule(project);
  const data = burndownData(project, after, { now: after.finish });
  assert.equal(data.tasksOpen, before.tasksOpen - 3);
  assert.ok(data.done > before.done);
});

test('print: the burndown chart is a page of its own with the paper size', () => {
  const { project, sched } = sample();
  assert.ok(CONTENTS.includes('burndown'));
  const layout = renderPrintSvg(project, sched, { content: 'burndown', paper: 'A4', orientation: 'landscape', t: (key) => key, language: 'en' });
  assert.equal(layout.count, 1);
  assert.ok(layout.rows > 0, 'something to print (the Print button is enabled)');
  assert.deepEqual(layout.paper, { width: 297, height: 210 });
  assert.match(layout.svg, /^<svg /);
  assert.match(layout.svg, /report\.burndown/);
  assert.ok((layout.svg.match(/<polyline/g) || []).length >= 4, 'the lines of both charts');
  // The Gantt pages tell the print job their paper too.
  const gantt = renderPrintSvg(project, sched, { content: 'both', paper: 'A3', orientation: 'portrait', t: (key) => key });
  assert.deepEqual(gantt.paper, { width: 297, height: 420 });
});

test('kanban: three columns by % complete, drops set the progress, every leaf task on the board once', () => {
  assert.deepEqual(KANBAN_COLUMNS.map((c) => c.id), ['backlog', 'todo', 'doing', 'done']);
  assert.deepEqual([kanbanColumnOf(0, true), kanbanColumnOf(40, true), kanbanColumnOf(100, true)], ['backlog', 'doing', 'done'], 'the backlog mark only counts for tasks not started');
  assert.equal(kanbanDropPercent('backlog', 60), 0);
  assert.deepEqual([kanbanColumnOf(0), kanbanColumnOf(1), kanbanColumnOf(99), kanbanColumnOf(100), kanbanColumnOf(undefined)], ['todo', 'doing', 'doing', 'done', 'todo']);
  assert.equal(kanbanDropPercent('done', 30), 100);
  assert.equal(kanbanDropPercent('todo', 30), 0);
  assert.equal(kanbanDropPercent('doing', 0), 50, 'starting a task');
  assert.equal(kanbanDropPercent('doing', 35), 35, 'a task in progress keeps its value');
  const { project, sched } = sample();
  const cards = kanbanCards(project, sched, null);
  const leaves = project.tasks.filter((task) => !sched.info(task.id).summary && task.active !== false);
  assert.equal(cards.backlog.length + cards.todo.length + cards.doing.length + cards.done.length, leaves.length);
  for (const card of cards.done) assert.ok(card.info.percentComplete >= 100);
  assert.ok([...cards.backlog, ...cards.todo, ...cards.doing, ...cards.done].every((card) => typeof card.phase === 'string'));
  // A drop's order is kept (kanbanRank), cards never placed follow after it in schedule order.
  const column = Object.values(cards).find((list) => list.length >= 3);
  const [first, second, ...rest] = column.map((card) => card.task);
  second.kanbanRank = 0;
  first.kanbanRank = 1;
  const reordered = kanbanCards(project, sched, null)[kanbanColumnOf(column[0].info.percentComplete)].map((card) => card.task.id);
  assert.deepEqual(reordered, [second.id, first.id, ...rest.map((task) => task.id)]);
  assert.equal(initials('Kim Minsu'), 'KM');
  assert.equal(initials('홍길동'), '홍길');
});

test('start page: the program information card stays on top, full width, and cannot be moved', () => {
  const ids = ['hero', 'actions', 'recent', 'templates'];
  const span = { hero: 3, actions: 2, recent: 1, templates: 3 };
  const heights = { hero: 6, actions: 7, recent: 9, templates: 7 };
  const cards = autoArrange(ids, span, heights);
  assert.deepEqual(cards.hero, { col: 0, row: 0, w: 3, h: 6, fit: true });
  assert.deepEqual(place(cards, 'hero', { col: 1, row: 10, w: 1 }), cards, 'moving the fixed card does nothing');
  const moved = place(cards, 'templates', { col: 0, row: 0 });
  assert.deepEqual([moved.hero.row, moved.hero.col, moved.hero.w], [0, 0, 3], 'another card dropped on top does not push it away');
  assert.ok(moved.templates.row >= moved.hero.h);
  // An older saved layout that had moved it: back on top.
  const saved = { version: 1, cards: { hero: { col: 1, row: 20, w: 1, h: 6, fit: false }, actions: { col: 0, row: 0, w: 2, h: 7 } } };
  const restored = cardsOf(saved, ids, span, heights);
  assert.deepEqual([restored.hero.col, restored.hero.row, restored.hero.w, restored.hero.fit], [0, 0, 3, true]);
  assert.ok(restored.actions.row >= restored.hero.h);
});

/** A 2D context that records nothing and throws where the browser would (negative radius, NaN). */
function strictContext() {
  const check = (...values) => { for (const v of values) if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`not finite: ${values}`); };
  const gradient = { addColorStop: () => {} };
  return new Proxy({}, {
    get(target, name) {
      if (name in target) return target[name];
      if (name === 'roundRect') return (x, y, w, h, r) => { check(x, y, w, h, r); if (r < 0) throw new RangeError(`Radius value ${r} is negative.`); };
      if (name === 'arc') return (x, y, r) => { check(x, y, r); if (r < 0) throw new RangeError('negative radius'); };
      if (name === 'createRadialGradient' || name === 'createLinearGradient') return () => gradient;
      if (name === 'setLineDash') return () => {};
      return (...args) => check(...args);
    },
    set(target, name, value) { target[name] = value; return true; },
  });
}

test('moving backgrounds: fourteen planning scenes, each draws at every size without an error', () => {
  assert.equal(ANIMATIONS.length, 14, 'two full rows of seven tiles');
  assert.ok(!ANIMATIONS.some((kind) => ['aurora', 'rain', 'fireworks', 'coderain'].includes(kind)), 'no generic scenery any more');
  const colors = { bg: '#101820', accent: '#3fd6b0', text: '#ffffff', danger: '#e5484d', dark: true };
  for (const kind of Object.keys(PLAN_SCENES)) {
    assert.ok(ANIMATIONS.includes(kind), `${kind} is offered`);
    for (const [w, h] of [[4, 3], [40, 30], [320, 200], [1920, 1080]]) {
      const self = { items: Array.from({ length: PLAN_SCENE_ITEMS[kind] }, (_, i) => ({ x: (i * 0.37) % 1, y: (i * 0.61) % 1, z: (i * 0.23) % 1, s: (i * 0.71) % 1, v: (i * 0.13) % 1, h: (i * 0.89) % 1 })) };
      for (const time of [0, 3.7, 125]) assert.doesNotThrow(() => PLAN_SCENES[kind].call(self, strictContext(), w, h, time, colors), `${kind} at ${w}×${h}, t=${time}`);
    }
  }
});
