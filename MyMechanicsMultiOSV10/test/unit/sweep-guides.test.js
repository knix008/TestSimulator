// Sweep with two or more guide curves (cad/sweep-more.js): sections of the profile mapped through every guide at
// stations along the path and lofted; the 2 x 2 map and its rotation-stretch-rotation split.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, createSketchGeometry } from '../../src/cad/sketch.js';
import { guideMap, svd2 } from '../../src/cad/sweep-more.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test('the guide map: exact for two guides, along the line for guides on one line; its SVD rebuilds it', () => {
  const A = guideMap([[10, 0], [0, 5]], [[20, 0], [0, 5]]);
  near(A[0][0], 2); near(A[0][1], 0); near(A[1][0], 0); near(A[1][1], 1);
  // Turned by 90° and doubled.
  const B = guideMap([[1, 0], [0, 1]], [[0, 2], [-2, 0]]);
  near(B[0][0], 0); near(B[0][1], -2); near(B[1][0], 2); near(B[1][1], 0);
  // Two guides on opposite sides of the path (one line): stretched along it only.
  const C = guideMap([[10, 0], [-10, 0]], [[15, 0], [-15, 0]]);
  near(C[0][0], 1.5); near(C[1][1], 1); near(C[0][1], 0); near(C[1][0], 0);
  for (const L of [[[2, 0.5], [-0.3, 1.2]], [[0, -2], [2, 0]], [[1, 0], [0, -1]]]) {
    const { phi, theta, s1, s2 } = svd2(L);
    const rot = (a) => [[Math.cos(a), -Math.sin(a)], [Math.sin(a), Math.cos(a)]];
    const m = (P, Q) => [[P[0][0] * Q[0][0] + P[0][1] * Q[1][0], P[0][0] * Q[0][1] + P[0][1] * Q[1][1]], [P[1][0] * Q[0][0] + P[1][1] * Q[1][0], P[1][0] * Q[0][1] + P[1][1] * Q[1][1]]];
    const back = m(m(rot(phi), [[s1, 0], [0, s2]]), rot(theta));
    for (const i of [0, 1]) for (const j of [0, 1]) near(back[i][j], L[i][j], 1e-12);
  }
});

test('a rectangle swept up a straight path widens with one guide and keeps its depth with the other', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const prof = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() });
  addRectangle(prof, -10, -5, 10, 5); part.features.push(prof);
  const path = createFeature(part, 'sketch3d', { points: [[0, 0, 0], [0, 0, 50]] }); part.features.push(path);
  const g1 = createFeature(part, 'sketch3d', { points: [[10, 0, 0], [20, 0, 50]] }); part.features.push(g1);
  const g2 = createFeature(part, 'sketch3d', { points: [[0, 5, 0], [0, 5, 50]] }); part.features.push(g2);
  const sw = createFeature(part, 'sweep', { sketch: prof.id, path: path.id, guide: g1.id, guides: [g2.id] }); part.features.push(sw);
  const r = regenerate(part);
  for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`);
  // Half-width 10 → 20 linearly, depth 10: ∫ 2 (10 + z / 5) · 10 dz over 0…50 = 15000.
  near(R.measureVolume(r.body), 15000, 1e-4);
  const [lo, hi] = r.body.boundingBox.bounds;
  near(hi[0], 20, 1e-4); near(lo[0], -20, 1e-4); near(hi[1], 5, 1e-4); near(lo[1], -5, 1e-4);
  // One guide alone scales the whole profile evenly (both ways): depth grows too.
  sw.guides = [];
  const one = regenerate(part);
  assert.ok(one.results.get(sw.id).ok);
  near(one.body.boundingBox.bounds[1][1], 10, 1e-3);
});

test('start tangency "square to the path": a profile not square to the path is turned square to the path before sweeping', () => {
  const part = { id: 'p', name: 'P', features: [] };
  // A 10 × 10 square on the Top plane, swept along a path that leans 3 in 40 (so the profile is not square to it).
  const prof = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() });
  addRectangle(prof, -5, -5, 5, 5); part.features.push(prof);
  const path = createFeature(part, 'sketch3d', { points: [[0, 0, 0], [0, 3, 40]] }); part.features.push(path);
  const sw = createFeature(part, 'sweep', { sketch: prof.id, path: path.id, startTangent: 'path' }); part.features.push(sw);
  const r = regenerate(part);
  assert.ok(r.results.get(sw.id).ok, r.results.get(sw.id).error);
  // Square to the path: the swept volume is the profile area times the path length.
  near(R.measureVolume(r.body), 100 * Math.hypot(3, 40), 1e-6);
  sw.startTangent = 'none';
  const plain = regenerate(part);
  assert.ok(Math.abs(R.measureVolume(plain.body) - 100 * Math.hypot(3, 40)) > 1e-3);
});

test('surface sweep of an open line with its two ends on two guides: a sheet whose edges are the guides', async () => {
  const { addLine } = await import('../../src/cad/sketch.js');
  const { guideAffine } = await import('../../src/cad/sweep-more.js');
  // Guides on one line through the path: met exactly by an affine map (scale and shift along the line).
  const m = guideAffine([[10, 0], [-10, 0]], [[20, 0], [-10, 0]]);
  for (const [a, b] of [[[10, 0], [20, 0]], [[-10, 0], [-10, 0]]]) { near(m.A[0][0] * a[0] + m.A[0][1] * a[1] + m.T[0], b[0], 1e-12); near(m.A[1][0] * a[0] + m.A[1][1] * a[1] + m.T[1], b[1], 1e-12); }
  const part = { id: 'p', name: 'P', features: [] };
  const prof = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() });
  addLine(prof, -10, 0, 10, 0); part.features.push(prof);
  const path = createFeature(part, 'sketch3d', { points: [[0, 0, 0], [0, 0, 50]] }); part.features.push(path);
  const g1 = createFeature(part, 'sketch3d', { points: [[10, 0, 0], [20, 0, 50]] }); part.features.push(g1);
  const g2 = createFeature(part, 'sketch3d', { points: [[-10, 0, 0], [-10, 0, 50]] }); part.features.push(g2);
  const sw = createFeature(part, 'surfaceSweep', { sketch: prof.id, path: path.id, guide: g1.id, guides: [g2.id] }); part.features.push(sw);
  const r = regenerate(part);
  assert.ok(r.results.get(sw.id).ok, `${r.results.get(sw.id).error} ${r.results.get(sw.id).detail ?? ''}`);
  const sheet = r.surfaces.get(sw.id);
  // A flat trapezoid in y = 0: width 20 → 30 over 50.
  near(R.measureArea(sheet), (20 + 30) / 2 * 50, 1e-4);
  const [lo, hi] = sheet.boundingBox.bounds;
  near(lo[0], -10, 1e-4); near(hi[0], 20, 1e-4); near(hi[1] - lo[1], 0, 1e-6);
});
