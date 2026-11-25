// Toolpath editing (cad/cam-edit.js): passes, trimming to a window, deleting and reversing passes, feed factors,
// nearest-next order, arc and line leads, linking (clearance / minimum / stay down); and on a real facing path,
// the material removed by the simulation follows the edits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { passesOf, trimPass, editMoves, leadPoints, passList, cutLength, rapidLength } from '../../src/cad/cam-edit.js';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { machiningModel } from '../../src/cad/cam-features.js';
import { camContext, defaultStock, generateToolpath, createOp } from '../../src/cad/cam-ops.js';
import { simulateMilling } from '../../src/cad/cam-sim.js';
import { cloneTools } from '../../src/cad/cam-tools.js';

const r = (p) => ({ k: 'r', p }); const f = (p, fr = 500) => ({ k: 'f', p, f: fr });
// Two passes along x at y 0 and 5, plunging at x = 0.
const MOVES = [r([0, 0, 10]), r([0, 0, 1]), f([0, 0, 0], 100), f([10, 0, 0]), r([10, 0, 5]), r([0, 5, 5]), r([0, 5, 1]), f([0, 5, 0], 100), f([10, 5, 0]), r([10, 5, 10])];
const CTX = { clearance: 10, retract: 2 };
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('passes: cutting runs between rapids, starting where the rapids left the tool', () => {
  const p = passesOf(MOVES);
  assert.equal(p.length, 2);
  assert.deepEqual(p[0].pts, [[0, 0, 1], [0, 0, 0], [10, 0, 0]]);
  assert.deepEqual(p[1].f, [100, 500]);
});

test('no edits: the same moves come back (cutting length kept)', () => {
  const out = editMoves(MOVES, {}, CTX);
  near(cutLength(out), cutLength(MOVES));
  assert.deepEqual(passesOf(out).map((x) => x.pts), passesOf(MOVES).map((x) => x.pts));
});

test('trim: inside a window only the part of each pass in it is cut; outside splits a pass in two', () => {
  const inside = trimPass(passesOf(MOVES)[0], { x0: 2, x1: 8, y0: -1, y1: 1 }, 'inside');
  assert.deepEqual(inside.map((x) => x.pts), [[[2, 0, 0], [8, 0, 0]]]);
  const outside = trimPass(passesOf(MOVES)[0], { x0: 2, x1: 8, y0: -1, y1: 1 }, 'outside');
  assert.deepEqual(outside.map((x) => [x.pts[0], x.pts.at(-1)]), [[[0, 0, 1], [2, 0, 0]], [[8, 0, 0], [10, 0, 0]]]);
  const out = editMoves(MOVES, { trim: { x0: 2, x1: 8, y0: -1, y1: 6, keep: 'inside' } }, CTX);
  near(cutLength(out), 12 + 2 * 2); // two 6 mm cuts and the 2 mm plunges from the retract plane
  assert.equal(passList(MOVES, { trim: { x0: 2, x1: 8, y0: -1, y1: 1, keep: 'outside' } }).length, 3);
});

test('delete, reverse and feed factor by pass number; reverse all', () => {
  const out = editMoves(MOVES, { deleted: [0], reversed: [1], feeds: { 1: 0.5 } }, CTX);
  const p = passesOf(out);
  assert.equal(p.length, 1);
  assert.deepEqual(p[0].pts.slice(-2), [[0, 5, 0], [0, 5, 1]]);
  assert.ok(p[0].f.every((x) => x === 250 || x === 50));
  const all = passesOf(editMoves(MOVES, { reverseAll: true }, CTX));
  assert.deepEqual(all.map((x) => x.pts[1]), [[10, 0, 0], [10, 5, 0]]);
});

test('leads: an arc lead-in arrives tangent to the first cut, a line lead-out leaves along the last', () => {
  const p0 = [0, 0, 0], d = [1, 0];
  const arc = leadPoints(p0, d, { type: 'arc', radius: 3, angle: 90 }, false, 1);
  // On the circle about (0, 3), starting a quarter turn back: (−3, 3); the last point just before p0.
  for (const q of arc) near(Math.hypot(q[0], q[1] - 3), 3, 1e-9);
  near(arc[0][0], -3, 1e-9); near(arc[0][1], 3, 1e-9);
  const last = arc.at(-1); assert.ok(last[0] < 0 && last[1] > 0 && last[1] < 0.2);
  const line = leadPoints([10, 0, 0], d, { type: 'line', length: 4 }, true);
  assert.deepEqual(line, [[14, 0, 0]]);
  const out = editMoves(MOVES, { leadIn: { type: 'line', length: 2 }, leadOut: { type: 'line', length: 2 } }, CTX);
  const p = passesOf(out);
  assert.deepEqual(p[0].pts.at(-1), [12, 0, 0]);
});

test('linking: stay down crosses at feed when the next pass is near at the same level; minimum lifts only to the approach height', () => {
  const near2 = [r([0, 0, 10]), r([0, 0, 1]), f([0, 0, 0]), f([10, 0, 0]), r([10, 0, 10]), r([10, 3, 10]), r([10, 3, 1]), f([10, 3, 0]), f([0, 3, 0]), r([0, 3, 10])];
  const stay = editMoves(near2, { linking: { mode: 'stay', stayDown: 5 } }, CTX);
  assert.equal(passesOf(stay).length, 1);
  near(rapidLength(stay), rapidLength(editMoves(near2, {}, CTX)) - (10 + 3 + 9), 1e-9);
  const minimum = editMoves(near2, { linking: { mode: 'minimum' } }, CTX);
  // Between the passes the tool rises only to the approach height (1 mm over the cut), not to the clearance plane.
  const between = minimum.slice(minimum.findIndex((m) => m.k === 'f' && m.p[0] === 10 && m.p[1] === 0) + 1, minimum.findIndex((m) => m.k === 'f' && m.p[1] === 3));
  assert.ok(between.length && between.every((m) => m.k !== 'r' || m.p[2] === 1), JSON.stringify(between));
  const far = editMoves(near2, { linking: { mode: 'stay', stayDown: 1 } }, CTX);
  assert.equal(passesOf(far).length, 2);
});

test('nearest order: passes re-ordered by where the last one ended', () => {
  const three = [r([0, 0, 1]), f([0, 0, 0]), f([1, 0, 0]), r([1, 0, 5]), r([50, 0, 5]), r([50, 0, 1]), f([50, 0, 0]), f([51, 0, 0]), r([51, 0, 5]), r([2, 0, 5]), r([2, 0, 1]), f([2, 0, 0]), f([3, 0, 0]), r([3, 0, 5])];
  const p = passesOf(editMoves(three, { order: 'nearest' }, CTX));
  assert.deepEqual(p.map((x) => x.pts.at(-1)[0]), [1, 3, 51]);
});

test('on a facing path: trimmed to half the stock, half the material goes; with every pass deleted none', async () => {
  await loadKernel();
  const R = rep(); const tools = cloneTools();
  const b = R.makeBox([-20, -15, 0], [20, 15, 20]);
  const m = machiningModel(b.mesh({ tolerance: 0.01, angularTolerance: 0.1 }));
  const st = defaultStock(m.bounds, { margin: 0, top: 2 });
  const c = camContext({ model: m, stock: st, tools, material: 'al-6061' });
  const mill = tools.filter((t) => t.type === 'flat' && t.d <= 10).sort((a, b) => b.d - a.d)[0];
  const whole = generateToolpath(c, createOp('facing', { id: 'f', tool: mill.id, stepdown: 2 }));
  const half = generateToolpath(c, createOp('facing', { id: 'f', tool: mill.id, stepdown: 2, edits: { trim: { x0: -100, x1: 0, y0: -100, y1: 100, keep: 'inside' } } }));
  const sw = simulateMilling(st, [whole], tools, { cell: 0.5 }), sh = simulateMilling(st, [half], tools, { cell: 0.5 });
  const ratio = sh.removed / sw.removed;
  assert.ok(ratio > 0.5 && ratio < 0.5 + mill.d / 2 / 40 + 0.02, `half: ${ratio}`); // the cutter's radius reaches past the window's edge
  const n = passList(whole.moves).length;
  const none = generateToolpath(c, createOp('facing', { id: 'f', tool: mill.id, stepdown: 2, edits: { deleted: [...Array(n).keys()] } }));
  assert.equal(cutLength(none.moves), 0);
});
