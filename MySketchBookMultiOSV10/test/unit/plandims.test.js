import { test } from 'node:test';
import assert from 'node:assert/strict';
import { facingSides, planDimensionSegments } from '../../src/ui/plandims.js';

// A 6 × 4.5 m box (centre lines) with 0.2 m walls and one partition at x = 3.5.
const wall = (a, b) => ({ a, b, thickness: 0.2, height: 2.4, level: 'L1' });
const walls = [
  wall([0, 0], [6, 0]), wall([6, 0], [6, 4.5]), wall([6, 4.5], [0, 4.5]), wall([0, 4.5], [0, 0]),
  wall([3.5, 0], [3.5, 4.5]),
];
const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

test('plan dimensions: a chain per side split at the partition, plus the overall length behind it', () => {
  const perPx = 0.01; // 1 cm per pixel
  const segs = planDimensionSegments(walls, perPx);
  const top = segs.filter((s) => s.side === 'top');
  const chain = top.filter((s) => s.kind === 'chain').map((s) => s.length).sort((a, b) => a - b);
  assert.deepEqual(chain.map((v) => Math.round(v * 1000)), [2500, 3500]);
  const overall = top.filter((s) => s.kind === 'overall');
  assert.equal(overall.length, 1);
  assert.ok(near(overall[0].length, 6));
  // The left side has no partition: just the overall 4.5 m.
  const left = segs.filter((s) => s.side === 'left');
  assert.equal(left.length, 1);
  assert.ok(near(left[0].length, 4.5));
});

test('plan dimensions: lines sit outside the outer face at a fixed number of pixels, the second row further out', () => {
  for (const perPx of [0.005, 0.02]) {
    const segs = planDimensionSegments(walls, perPx);
    const top = segs.filter((s) => s.side === 'top');
    const rowZ = (row) => top.find((s) => s.row === row).a[1];
    // Outer face of the top wall is z = -0.1; rows at 26 px and 48 px beyond it (z goes up the sheet: negative).
    assert.ok(near(rowZ(0), -0.1 - 26 * perPx));
    assert.ok(near(rowZ(1), -0.1 - 48 * perPx));
    const bottom = segs.find((s) => s.side === 'bottom');
    assert.ok(bottom.a[1] > 4.6, 'the bottom chain is below the building');
    for (const s of segs) assert.ok(s.normal[0] === 0 || s.normal[1] === 0);
  }
});

test('plan dimensions in 3D: only the sides the camera sees from outside', () => {
  assert.deepEqual(facingSides(walls, { x: 10, y: 8, z: 12 }).sort(), ['bottom', 'right']);
  assert.deepEqual(facingSides(walls, { x: -5, y: 8, z: 2 }), ['left']);
  // From inside: the two nearest sides.
  assert.deepEqual(facingSides(walls, { x: 1, y: 1.6, z: 4 }).sort(), ['bottom', 'left']);
});

test('plan dimensions: nothing for no walls or a single point', () => {
  assert.deepEqual(planDimensionSegments([], 0.01), []);
  assert.deepEqual(planDimensionSegments([wall([1, 1], [1, 1])], 0.01), []);
});
