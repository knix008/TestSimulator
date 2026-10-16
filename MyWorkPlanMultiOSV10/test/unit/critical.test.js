// Critical path tracing (src/domain/critical.js): forward and backward over the scheduled plan.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as P from '../../src/domain/project.js';
import { schedule } from '../../src/domain/schedule.js';
import { criticalPath } from '../../src/domain/critical.js';
import { buildSample } from '../../src/domain/templates.js';

const DAY = 480;
const make = () => P.createProject({ title: 'Test', start: '2026-10-19T08:00' }); // Monday
const add = (project, name, days, data = {}) => P.insertTask(project, project.tasks.length, { name, duration: days * DAY, ...data });
const names = (project, ids) => ids.map((id) => project.tasks.find((t) => t.id === id).name);

test('the longest chain is critical; a shorter parallel branch with slack is not', () => {
  const p = make();
  const a = add(p, 'A', 2);
  const b = add(p, 'B', 5);
  const c = add(p, 'C', 1); // parallel to B, 4 days of slack
  const d = add(p, 'D', 3);
  P.linkTasks(p, a.id, b.id);
  P.linkTasks(p, a.id, c.id);
  P.linkTasks(p, b.id, d.id);
  P.linkTasks(p, c.id, d.id);
  const s = schedule(p);
  const cp = criticalPath(p, s);
  assert.deepEqual(names(p, [...cp.ids].sort((x, y) => s.info(x).row - s.info(y).row)), ['A', 'B', 'D']);
  assert.deepEqual(cp.chains.map((chain) => names(p, chain)), [['A', 'B', 'D']]);
  assert.deepEqual(names(p, cp.starts), ['A']);
  assert.deepEqual(names(p, cp.ends), ['D']);
  assert.equal(cp.finish, s.finish, 'the path ends when the project ends');
  assert.ok(cp.links.has(`${a.id}>${b.id}`) && cp.links.has(`${b.id}>${d.id}`) && !cp.links.has(`${a.id}>${c.id}`));
});

test('two equally long chains are both found, top to bottom and bottom to top', () => {
  const p = make();
  const a = add(p, 'A', 2);
  const b1 = add(p, 'B1', 3);
  const b2 = add(p, 'B2', 3);
  const e = add(p, 'E', 1);
  P.linkTasks(p, a.id, b1.id);
  P.linkTasks(p, a.id, b2.id);
  P.linkTasks(p, b1.id, e.id);
  P.linkTasks(p, b2.id, e.id);
  const cp = criticalPath(p, schedule(p));
  assert.equal(cp.ids.size, 4);
  assert.deepEqual(cp.chains.map((chain) => names(p, chain)), [['A', 'B1', 'E'], ['A', 'B2', 'E']]);
});

test('a link on a summary task reaches its subtasks; the summary is reported too', () => {
  const p = make();
  const a = add(p, 'A', 2);
  const phase = add(p, 'Phase', 1);
  const x = add(p, 'X', 4);
  const y = add(p, 'Y', 1);
  P.indentTasks(p, [x.id, y.id]);
  P.linkTasks(p, a.id, phase.id); // the summary's link applies to X and Y
  const s = schedule(p);
  assert.ok(s.info(phase.id).summary);
  const cp = criticalPath(p, s);
  assert.deepEqual(cp.chains.map((chain) => names(p, chain)), [['A', 'X']]);
  assert.ok(cp.summaries.has(phase.id));
});

test('finished work stays on the path, from the project start through to the finish', () => {
  const p = make();
  const a = add(p, 'A', 2, { percentComplete: 100 });
  const b = add(p, 'B', 3, { percentComplete: 100 });
  const c = add(p, 'C', 2);
  const d = add(p, 'D', 1); // shorter, and not linked, so it has slack
  P.linkTasks(p, a.id, b.id);
  P.linkTasks(p, b.id, c.id);
  const s = schedule(p);
  const cp = criticalPath(p, s);
  assert.deepEqual(names(p, [...cp.ids].sort((x, y) => s.info(x).row - s.info(y).row)), ['A', 'B', 'C']);
  assert.deepEqual(cp.chains.map((chain) => names(p, chain)), [['A', 'B', 'C']]);
  assert.equal(s.info(cp.chains[0][0]).start, s.start, 'the path opens at the project start');
  assert.equal(s.info(cp.chains[0].at(-1)).finish, s.finish, 'the path closes at the project finish');
  assert.equal(cp.ids.has(d.id), false);
});

test('a link that does not set the successor date is not a step of the path', () => {
  const p = make();
  const a = add(p, 'A', 4);
  const b = add(p, 'B', 4);
  const m = add(p, 'M', 0, { milestone: true });
  P.linkTasks(p, a.id, b.id, 'SS', DAY, 'd'); // B starts one day after A and finishes later
  P.linkTasks(p, a.id, m.id); // A finishes before B, so this link does not move M
  P.linkTasks(p, b.id, m.id);
  const s = schedule(p);
  const cp = criticalPath(p, s);
  assert.deepEqual(cp.chains.map((chain) => names(p, chain)), [['A', 'B', 'M']]);
  assert.ok(cp.links.has(`${a.id}>${b.id}`) && cp.links.has(`${b.id}>${m.id}`));
  assert.equal(cp.links.has(`${a.id}>${m.id}`), false);
  assert.equal(s.info(cp.chains[0][0]).start, s.start);
  assert.equal(s.info(m.id).finish, s.finish);
});

test('sample plan: driving chains from the project start to the project finish', () => {
  const p = buildSample('ko', { today: '2026-10-16' });
  const s = schedule(p);
  const cp = criticalPath(p, s);
  assert.ok(cp.ids.size >= 5, `${cp.ids.size} critical tasks`);
  assert.ok(cp.chains.length >= 1);
  for (const chain of cp.chains) {
    for (let i = 1; i < chain.length; i++) {
      assert.ok(s.graph.driving.get(chain[i]).includes(chain[i - 1]), 'each step is a driving link');
    }
    assert.equal(s.info(chain[0]).start, s.start, 'each chain opens at the project start');
    assert.equal(s.info(chain.at(-1)).finish, s.finish, 'each chain runs to the project finish');
  }
  for (const id of cp.ids) assert.ok(s.info(id).critical && s.info(id).totalSlack <= 0);
});
