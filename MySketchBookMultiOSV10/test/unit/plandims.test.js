import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dimensionColor, facingSides, interiorDimensionColor, planDimensionSegments, roomInteriorSegments } from '../../src/ui/plandims.js';

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
  // Overall = walls included: outer face to outer face (6 m between centre lines + 2 × 0.1 m).
  assert.ok(near(overall[0].length, 6.2));
  // The left side has no partition: just the overall, 4.5 m + the walls.
  const left = segs.filter((s) => s.side === 'left');
  assert.equal(left.length, 1);
  assert.ok(near(left[0].length, 4.7));
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

test('plan dimension colour: light figures on a dark background, dark ones on a light one', () => {
  for (const bg of ['#ffffff', '#f3f3f3', '#d9d4cb', '#a9b8c8']) assert.equal(dimensionColor(bg), '#1f2933', bg);
  for (const bg of ['#000000', '#20242b', '#0d0f14', '#3a3f48']) assert.equal(dimensionColor(bg), '#e8edf3', bg);
});

test('plan dimensions: nothing for no walls or a single point', () => {
  assert.deepEqual(planDimensionSegments([], 0.01), []);
  assert.deepEqual(planDimensionSegments([wall([1, 1], [1, 1])], 0.01), []);
});

test('interior dimensions: clear width and depth between the inner faces of rectangle-like rooms', () => {
  // Rooms are drawn on the inner faces: the 3.5 m bay between centre lines is 3.3 m clear inside.
  const rooms = [
    { id: 'r1', points: [[0.1, 0.1], [3.4, 0.1], [3.4, 4.4], [0.1, 4.4]] },
    { id: 'L', points: [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]] }, // L-shaped: no single width
    { id: 'tiny', points: [[0, 0], [0.4, 0], [0.4, 0.4], [0, 0.4]] },
  ];
  const segs = roomInteriorSegments(rooms, 0.01);
  assert.deepEqual([...new Set(segs.map((s) => s.room))], ['r1']);
  const w = segs.find((s) => s.axis === 'x'); const d = segs.find((s) => s.axis === 'z');
  assert.ok(near(w.length, 3.3)); assert.ok(near(d.length, 4.3));
  // Inside the room, 16 px from its lower and left inner face.
  assert.ok(near(w.a[1], 4.4 - 0.16)); assert.ok(near(d.a[0], 0.1 + 0.16));
  assert.notEqual(interiorDimensionColor('#ffffff'), dimensionColor('#ffffff'));
  assert.notEqual(interiorDimensionColor('#20242b'), dimensionColor('#20242b'));
});
