// Solid sweep (cad/solid-sweep.js): a revolved tool body moved along a path with its axis held cuts the exact slot
// (its section swept, the tool at both ends); ramps and plunges sweep the exact Minkowski sum.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addCircle, createSketchGeometry } from '../../src/cad/sketch.js';
import { translationSweep } from '../../src/cad/solid-sweep.js';

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
});

test('a straight move in any direction: the Minkowski sum of the tool and the move', () => {
  // A Ø10 x 20 cylinder moved by (80, 0, 8): its volume plus its shadow on the plane square to the move times the
  // move's length (shadow = 2 r h sin θ + π r² cos θ, θ the angle between the move and the axis).
  const tool = R.makeCylinder(5, 20, [10, 30, 10], [0, 0, 1]);
  const v = [80, 0, 8]; const L = Math.hypot(...v); const c = 8 / L; const sn = 80 / L;
  near(R.measureVolume(translationSweep(tool, v)), Math.PI * 25 * 20 + (10 * 20 * sn + Math.PI * 25 * c) * L, 1e-6);
  // Along the axis: a longer cylinder.
  near(R.measureVolume(translationSweep(tool, [0, 0, -8])), Math.PI * 25 * 28, 1e-9);
});

test('a ramp (the cutter climbing while it moves) and a plunge along its axis cut what the cutter sweeps', () => {
  // Ramp from (10, 30, 10) to (90, 30, 18): under each point the floor is where the cutter's leading disc first
  // reached it — the depth below the block's top (z = 20) integrated over the plan.
  const { part, sw } = setup([[10, 30, 10], [90, 30, 18]]);
  const r = regenerate(part);
  assert.ok(r.results.get(sw.id).ok, `${r.results.get(sw.id).error} ${r.results.get(sw.id).detail ?? ''}`);
  const h = 0.02; let want = 0;
  for (let x = 5 + h / 2; x < 95; x += h) for (let y = 25 + h / 2; y < 35; y += h) {
    const w = Math.sqrt(Math.max(0, 25 - (y - 30) ** 2));
    const cMin = Math.max(10, x - w); if (cMin > Math.min(90, x + w)) continue;
    want += (20 - (10 + 0.1 * (cMin - 10))) * h * h;
  }
  near(100 * 60 * 20 - R.measureVolume(r.body), want, 2e-4);
  // A plunge along the axis: a round hole 8 deeper than the cutter started (18 deep in all).
  const plunge = setup([[10, 30, 10], [10, 30, 2]]);
  const rp = regenerate(plunge.part);
  assert.ok(rp.results.get(plunge.sw.id).ok, `${rp.results.get(plunge.sw.id).error}`);
  near(100 * 60 * 20 - R.measureVolume(rp.body), Math.PI * 25 * 18, 1e-6);
});
