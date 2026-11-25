// Solid sweep (cad/solid-sweep.js): a revolved tool body moved along a path with its axis held cuts the exact slot
// (its section swept, the tool at both ends); a path climbing along the axis is refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addCircle, createSketchGeometry } from '../../src/cad/sketch.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

function setup(pathPoints) {
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addRectangle(s, 0, 0, 100, 60); part.features.push(s);
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 20 }));
  // The cutter: a Ø10 cylinder from z = 10 up 20, a body of its own.
  const pl = createFeature(part, 'plane', { base: { kind: 'std', name: 'top' }, offset: 10 }); part.features.push(pl);
  const k = createFeature(part, 'sketch', { plane: { kind: 'ref', id: pl.id }, ...createSketchGeometry() }); addCircle(k, 10, 30, 5); part.features.push(k);
  const tool = createFeature(part, 'extrude', { sketch: k.id, depth: 20, merge: false }); part.features.push(tool);
  const path = createFeature(part, 'sketch3d', { points: pathPoints }); part.features.push(path);
  const sw = createFeature(part, 'sweep', { path: path.id, solidTool: tool.id, op: 'cut' }); part.features.push(sw);
  return { part, sw };
}

test('a cutter swept along x cuts a rounded slot 10 deep (and is used up)', () => {
  const { part, sw } = setup([[10, 30, 10], [90, 30, 10]]);
  const r = regenerate(part);
  assert.ok(r.results.get(sw.id).ok, `${r.results.get(sw.id).error} ${r.results.get(sw.id).detail ?? ''}`);
  near(R.measureVolume(r.body), 100 * 60 * 20 - (80 * 10 + Math.PI * 25) * 10, 1e-6);
});

test('an L-shaped path: the slot turns the corner round; a path along the axis is refused', () => {
  const { part, sw } = setup([[10, 30, 10], [60, 30, 10], [60, 50, 10]]);
  const r = regenerate(part);
  assert.ok(r.results.get(sw.id).ok, `${r.results.get(sw.id).error} ${r.results.get(sw.id).detail ?? ''}`);
  // Two straight runs (50 and 20 long, width 10), the round corner (a quarter disc of radius 5 outside, the inner
  // corner overlapping) and the two round ends: (50 + 20) · 10 + π 25 / 4 · … — checked against the union of the
  // cutter's positions: the area is that of a stadium path of length 70 with a round outside corner.
  const area = 70 * 10 + Math.PI * 25 + Math.PI * 25 / 4 - 25;
  near(100 * 60 * 20 - R.measureVolume(r.body), area * 10, 1e-6);
  const bad = setup([[10, 30, 10], [90, 30, 15]]);
  assert.equal(regenerate(bad.part).results.get(bad.sw.id).error, 'path-along-axis');
});
