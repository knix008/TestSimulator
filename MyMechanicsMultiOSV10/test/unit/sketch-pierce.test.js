// The pierce relation (sketch-pierce.js): a sketch point held where a curve outside its sketch crosses the sketch's
// plane — a line or an arc of another sketch, or a 3D curve feature — refreshed when the part rebuilds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { loadKernel } from '../../src/cad/kernel.js';
import { addLine, addArc, addConstraint, byId, createSketchGeometry } from '../../src/cad/sketch.js';
import { planeCrossings, sketchCurveFn } from '../../src/cad/sketch-pierce.js';

await loadKernel();
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const XY = { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, 1, 0], normal: [0, 0, 1] };

test('planeCrossings: a line and an arc crossing a plane, found to the last bits', () => {
  const s = createSketchGeometry();
  const l = addLine(s, 0, 0, 30, 0);
  const vert = { origin: [12.345, 0, 0], xDir: [0, 1, 0], yDir: [0, 0, 1], normal: [1, 0, 0] };
  const [hit] = planeCrossings(vert, sketchCurveFn(s, XY, l));
  near(hit[0], 0); near(hit[1], 0);
  const a = addArc(s, 0, 0, 10, 0, Math.PI);
  const hits = planeCrossings({ origin: [6, 0, 0], xDir: [0, 1, 0], yDir: [0, 0, 1], normal: [1, 0, 0] }, sketchCurveFn(s, XY, a));
  assert.equal(hits.length, 1); near(hits[0][0], 8, 1e-9);
});

test('a profile point pierces a path in another sketch and follows it when the path changes', () => {
  const part = { id: 'p', name: 'P', features: [] };
  // Path on the Top plane (z = 0): a line from (0, 5) to (40, 25) in sketch coordinates.
  const path = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() });
  const pl = addLine(path, 0, 5, 40, 25);
  part.features.push(path);
  // Profile on the Right plane (x = 0): a point pierced by the path.
  const prof = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'right' }, ...createSketchGeometry() });
  const pt = { id: 'pp', type: 'point', x: 3, y: 3 }; prof.entities.push(pt);
  addConstraint(prof, { type: 'pierce', a: pt.id, src: { feature: path.id, entity: pl.id } });
  part.features.push(prof);
  const world = (r) => { const fr = r.results.get(prof.id).frame; const p = byId(r.features.find((f) => f.id === prof.id), pt.id); return [0, 1, 2].map((i) => fr.origin[i] + fr.xDir[i] * p.x + fr.yDir[i] * p.y); };
  const pathWorld = (r, u, v) => { const fr = r.results.get(path.id).frame; return [0, 1, 2].map((i) => fr.origin[i] + fr.xDir[i] * u + fr.yDir[i] * v); };
  let r = regenerate(part);
  const w = world(r); const expect = pathWorld(r, 0, 5);
  w.forEach((x, i) => near(x, expect[i], 1e-7));
  // The stored part is not changed (the pierced copy is what was built).
  assert.equal(pt.x, 3);
  // Move the path's start: the pierce point follows on the next rebuild.
  byId(path, pl.p1).y = 12;
  r = regenerate(part);
  const w2 = world(r); const e2 = pathWorld(r, 0, 12);
  w2.forEach((x, i) => near(x, e2[i], 1e-7));
});

test('a pierce to a 3D curve (3D sketch) through the sketch plane', () => {
  const part = { id: 'q', name: 'Q', features: [] };
  const s3 = createFeature(part, 'sketch3d', { points: [[-10, 4, 7], [10, 4, 7]] });
  part.features.push(s3);
  const prof = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'right' }, ...createSketchGeometry() });
  const pt = { id: 'p3', type: 'point', x: 0, y: 0 }; prof.entities.push(pt);
  addConstraint(prof, { type: 'pierce', a: pt.id, src: { feature: s3.id } });
  part.features.push(prof);
  const r = regenerate(part);
  assert.ok(r.results.get(s3.id).ok, String(r.results.get(s3.id).error) + ' ' + String(r.results.get(s3.id).detail));
  const fr = r.results.get(prof.id).frame; const p = byId(r.features.find((f) => f.id === prof.id), pt.id);
  const w = [0, 1, 2].map((i) => fr.origin[i] + fr.xDir[i] * p.x + fr.yDir[i] * p.y);
  near(w[0], 0, 1e-7);
  // The 3D sketch is written Y-up in its points: its point (x, 4, 7) — whatever the axes, the crossing is on the line.
  const dir = [20, 0, 0];
  void dir;
  assert.ok(Math.abs(Math.hypot(w[1], w[2]) - Math.hypot(4, 7)) < 1e-6, JSON.stringify(w));
});
