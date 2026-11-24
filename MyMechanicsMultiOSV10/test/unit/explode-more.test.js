// Explode steps: regular (a move and a turn about the component's centre), radial (straight out from an axis),
// played one after the other (animation progress), and the explode lines the parts travel along.
import test from 'node:test';
import assert from 'node:assert/strict';
import { explodedPlacement, applyExplodeStep, explodeLines, placePoint, placeDir, quatIdentity } from '../../src/cad/assembly.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const nearV = (a, b, tol = 1e-9) => a.forEach((v, i) => near(v, b[i], tol));
const at = (position) => ({ position, rotation: quatIdentity() });

test('a regular step moves along its direction and turns about its axis through the centre', () => {
  // Centre at (5, 0, 0) in the component; a quarter turn about z keeps the centre and turns +x into +y.
  const pl = applyExplodeStep({ dir: [0, 0, 1], distance: 20, angle: 90, rotAxis: [0, 0, 1] }, at([10, 0, 0]), [5, 0, 0], 1);
  nearV(placePoint(pl, [5, 0, 0]), [15, 0, 20]);
  nearV(placeDir(pl, [1, 0, 0]), [0, 1, 0]);
  // Halfway: half the move and half the turn.
  const half = applyExplodeStep({ dir: [0, 0, 1], distance: 20, angle: 90, rotAxis: [0, 0, 1] }, at([10, 0, 0]), [5, 0, 0], 0.5);
  nearV(placePoint(half, [5, 0, 0]), [15, 0, 10]);
  nearV(placeDir(half, [1, 0, 0]), [Math.SQRT1_2, Math.SQRT1_2, 0]);
});

test('a radial step pushes each component straight out from the axis; one on the axis stays', () => {
  const step = { kind: 'radial', axis: { point: [0, 0, 0], dir: [0, 0, 1] }, distance: 10 };
  nearV(applyExplodeStep(step, at([3, 4, 7]), [0, 0, 0]).position, [9, 12, 7]);
  nearV(applyExplodeStep(step, at([0, 0, 5]), [0, 0, 0]).position, [0, 0, 5]);
  // The centre decides the direction, not the origin of the component.
  nearV(applyExplodeStep(step, at([0, 0, 0]), [0, -2, 0]).position, [0, -10, 0]);
});

const asm = () => ({
  components: [{ id: 'a', ...at([0, 0, 0]) }, { id: 'b', ...at([10, 0, 0]) }, { id: 'c', ...at([0, 10, 0]) }],
  explode: { on: true, steps: [{ id: 's1', comps: ['b'], dir: [0, 0, 1], distance: 30 }, { id: 's2', comps: ['b', 'c'], dir: [1, 0, 0], distance: 5 }] },
});

test('steps add up in order; animation progress plays them one after the other', () => {
  const a = asm();
  nearV(explodedPlacement(a, 'b').position, [15, 0, 30]);
  nearV(explodedPlacement(a, 'c').position, [5, 10, 0]);
  nearV(explodedPlacement(a, 'a').position, [0, 0, 0]);
  nearV(explodedPlacement(a, 'b', 1, { progress: 0.5 }).position, [10, 0, 15]);
  nearV(explodedPlacement(a, 'b', 1, { progress: 1.5 }).position, [12.5, 0, 30]);
  nearV(explodedPlacement(a, 'c', 1, { progress: 1 }).position, [0, 10, 0]);
  nearV(explodedPlacement(a, 'b', 1, { progress: 0 }).position, [10, 0, 0]);
  // The old factor form (drawings' exploded views) still scales every step.
  nearV(explodedPlacement(a, 'b', 0.5).position, [12.5, 0, 15]);
});

test('explode lines follow each moved component from its place through the end of each step', () => {
  const centers = new Map([['a', [1, 1, 1]], ['b', [1, 1, 1]], ['c', [1, 1, 1]]]);
  const lines = explodeLines(asm(), centers);
  assert.deepEqual(lines.map((l) => l.comp), ['b', 'c']);
  assert.deepEqual(lines[0].points, [[11, 1, 1], [11, 1, 31], [16, 1, 31]]);
  assert.deepEqual(lines[1].points, [[1, 11, 1], [6, 11, 1]]);
});
