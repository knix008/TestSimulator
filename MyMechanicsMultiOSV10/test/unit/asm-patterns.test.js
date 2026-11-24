// Component patterns driven by a part's pattern feature, by sketch points, along a curve and as a chain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { featureDrivenMoves, pointDrivenMoves, curveDrivenMoves, chainMoves, movedPlacement, rotationBetween } from '../../src/cad/asm-patterns.js';
import { quatFromAxisAngle, rotate } from '../../src/cad/assembly.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const nearV = (a, b, tol = 1e-9) => a.forEach((v, i) => near(v, b[i], tol));

test('pattern driven: a part turned and moved in the assembly carries its feature pattern with it', () => {
  // The host part: turned 90° about z and moved to (100, 0, 0). Its linear pattern goes 20 along its own x.
  const host = { position: [100, 0, 0], rotation: quatFromAxisAngle([0, 0, 1], 90) };
  const [T] = featureDrivenMoves([{ kind: 'translate', v: [20, 0, 0] }], host);
  // In the assembly the part's x is the world y: the seed (a bolt at (100, 5, 0)) goes 20 along y.
  const seed = { position: [100, 5, 0], rotation: [0, 0, 0, 1] };
  nearV(movedPlacement(seed, T).position, [100, 25, 0]);
  // A circular pattern about the part's own z through its origin (= the host's position): 90° steps.
  const [R1] = featureDrivenMoves([{ kind: 'rotate', deg: 90, origin: [0, 0, 0], dir: [0, 0, 1] }], host);
  const p = movedPlacement({ position: [110, 0, 0], rotation: [0, 0, 0, 1] }, R1);
  nearV(p.position, [100, 10, 0]);
  nearV(rotate(p.rotation, [1, 0, 0]), [0, 1, 0]);
});

test('sketch driven: the seed carried from the first point to the others', () => {
  const moves = pointDrivenMoves([[0, 0, 0], [30, 0, 0], [0, 40, 5]]);
  assert.equal(moves.length, 2);
  nearV(movedPlacement({ position: [2, 3, 0], rotation: [0, 0, 0, 1] }, moves[1]).position, [2, 43, 5]);
});

test('curve driven: equal spacing along a quarter circle, copies turned with the tangent', () => {
  const pts = Array.from({ length: 2001 }, (_, i) => { const a = (i / 2000) * (Math.PI / 2); return [50 * Math.cos(a), 50 * Math.sin(a), 0]; });
  const moves = curveDrivenMoves(pts, { count: 3, align: true });
  assert.equal(moves.length, 2);
  // The seed sits at the start (50, 0, 0) facing +y (the tangent there); the last copy is at (0, 50) facing −x.
  const last = movedPlacement({ position: [50, 0, 0], rotation: [0, 0, 0, 1] }, moves[1]);
  nearV(last.position, [0, 50, 0], 1e-6);
  nearV(rotate(last.rotation, [0, 1, 0]), [-1, 0, 0], 1e-3);
  // Not aligned: moved only.
  const flat = curveDrivenMoves(pts, { count: 3, align: false });
  nearV(movedPlacement({ position: [50, 0, 0], rotation: [0, 0, 0, 1] }, flat[0]).rotation, [0, 0, 0, 1]);
  // Spacing: every 20 along the arc (length 78.5): copies at 20, 40, 60 only.
  assert.equal(curveDrivenMoves(pts, { count: 10, spacing: 20, equal: false }).length, 3);
});

test('chain: pins a pitch apart in a straight line along a circle; links turn by the chord angle', () => {
  const R = 40; const pitch = 12.7;
  const pts = Array.from({ length: 4001 }, (_, i) => { const a = (i / 4000) * Math.PI * 2; return [R * Math.cos(a), R * Math.sin(a), 0]; });
  const moves = chainMoves(pts, pitch, { closed: true });
  // Each link spans an angle 2·asin(p / 2R): floor(2π / that) pins fit round the loop without the last link running
  // into the first, and the links are the spans between them.
  const step = 2 * Math.asin(pitch / (2 * R));
  assert.equal(moves.length + 1, Math.floor((2 * Math.PI) / step) - 1);
  const seed = { position: [R, 0, 0], rotation: [0, 0, 0, 1] };
  const third = movedPlacement(seed, moves[1]);
  nearV(third.position, [R * Math.cos(2 * step), R * Math.sin(2 * step), 0], 1e-6);
  // Consecutive pins are exactly a pitch apart.
  const a = movedPlacement(seed, moves[2]).position; const b = movedPlacement(seed, moves[3]).position;
  near(Math.hypot(a[0] - b[0], a[1] - b[1]), pitch, 1e-6);
  near(rotationBetween([1, 0, 0], [-1, 0, 0], [0, 0, 1])[2], 1, 1e-12);
});
