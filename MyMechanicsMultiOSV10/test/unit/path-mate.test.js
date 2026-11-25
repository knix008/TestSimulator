// Path mate: a point of one component on a path (edges) of another; anywhere along it, at a distance or a
// percentage of its length (from either end), and optionally turned to follow the path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { solveMates, nearestOnPath, chainPath, matesFor, quatIdentity, placeDir } from '../../src/cad/assembly.js';

const near = (a, b, tol = 1e-4) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const at = (position) => ({ position, rotation: quatIdentity() });
// An L-shaped track in the xy plane: (0,0,0) → (100,0,0) → (100,50,0); length 150.
const track = [[0, 0, 0], [100, 0, 0], [100, 50, 0]];
const asmWith = (mate, carPos = [30, 20, 5]) => ({
  components: [{ id: 'rail', fixed: true, ...at([0, 0, 0]) }, { id: 'car', ...at(carPos) }],
  mates: [{ id: 'p', type: 'path', a: { comp: 'car', kind: 'point', point: [0, 0, 0], dir: [0, 0, 1] }, b: { comp: 'rail', kind: 'path', point: [0, 0, 0], dir: [0, 0, 1], points: track }, ...mate }],
});

test('nearest point on a polyline: arc length, tangent, closed', () => {
  const r = nearestOnPath(track, [120, 30, 0]);
  assert.deepEqual(r.q, [100, 30, 0]);
  near(r.s, 130); near(r.length, 150);
  assert.deepEqual(r.tangent, [0, 1, 0]);
  assert.equal(r.closed, false);
  assert.equal(nearestOnPath([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 0, 0]], [0, 0, 0]).closed, true);
});

test('edges chain into one path whichever way they were picked', () => {
  const p = chainPath([[[100, 0, 0], [100, 50, 0]], [[100, 0, 0], [0, 0, 0]]]);
  assert.deepEqual(p, [[0, 0, 0], [100, 0, 0], [100, 50, 0]]);
  const q = chainPath([[[0, 0, 0], [100, 0, 0]], [[100, 50, 0], [100, 0, 0]], [[0, 20, 0], [0, 0, 0]]]);
  assert.deepEqual(q, [[0, 20, 0], [0, 0, 0], [100, 0, 0], [100, 50, 0]]);
});

test('the path mate is offered (advanced) for a point / face and a path', () => {
  const pt = { kind: 'point' }; const path = { kind: 'path' };
  assert.deepEqual(matesFor(pt, path, 'advanced'), ['path']);
  assert.deepEqual(matesFor({ kind: 'plane' }, path, 'standard'), []);
});

test('free: the point goes onto the track (nearest place)', () => {
  const asm = asmWith({ pathMode: 'free' });
  const r = solveMates(asm);
  assert.deepEqual(r.failed, []);
  const p = asm.components[1].position;
  near(p[0], 30, 1e-3); near(p[1], 0, 1e-3); near(p[2], 0, 1e-3);
});

test('distance along the path, and from its end; percent', () => {
  for (const [mate, want] of [
    [{ pathMode: 'distance', value: 120 }, [100, 20, 0]],
    [{ pathMode: 'distance', value: 120, flip: true }, [30, 0, 0]],
    [{ pathMode: 'percent', value: 50 }, [75, 0, 0]],
    [{ pathMode: 'percent', value: 90 }, [100, 35, 0]],
  ]) {
    const asm = asmWith(mate);
    const r = solveMates(asm);
    assert.deepEqual(r.failed, [], JSON.stringify(mate));
    const p = asm.components[1].position;
    for (let i = 0; i < 3; i++) near(p[i], want[i], 1e-3);
  }
});

test('follow: the direction of the component turns along the path where its point is', () => {
  // The car's reference is an axis along its own x; on the second leg (along y) it must turn to y.
  const asm = asmWith({ pathMode: 'distance', value: 120, follow: true });
  asm.mates[0].a = { comp: 'car', kind: 'axis', point: [0, 0, 0], dir: [1, 0, 0] };
  const r = solveMates(asm);
  assert.deepEqual(r.failed, []);
  const car = asm.components[1];
  const d = placeDir(car, [1, 0, 0]);
  near(Math.abs(d[1]), 1, 1e-4);
  near(car.position[1], 20, 1e-3);
});
