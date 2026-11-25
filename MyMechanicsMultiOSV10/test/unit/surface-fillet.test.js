// Surface fillet (surface-fillet.js): a horizontal and a vertical planar surface crossing, each trimmed to the
// other and joined by an R3 round — one sheet of the exact area.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, createSketchGeometry } from '../../src/cad/sketch.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test('two crossing planes trimmed and rounded: (20 − 3) · 20 twice plus a quarter cylinder; flips choose the quadrant', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const a = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addRectangle(a, -20, -10, 20, 10); part.features.push(a);
  const A = createFeature(part, 'surfacePlanar', { sketch: a.id }); part.features.push(A);
  const b = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'right' }, ...createSketchGeometry() }); addRectangle(b, -10, -20, 10, 20); part.features.push(b);
  const B = createFeature(part, 'surfacePlanar', { sketch: b.id }); part.features.push(B);
  const f = createFeature(part, 'surfaceFillet', { surfaceA: A.id, surfaceB: B.id, radius: 3 }); part.features.push(f);
  const quadrants = new Set();
  for (const flipA of [false, true]) for (const flipB of [false, true]) {
    Object.assign(f, { flipA, flipB });
    const r = regenerate(part);
    assert.ok(r.results.get(f.id).ok, `${r.results.get(f.id).error} ${r.results.get(f.id).detail ?? ''}`);
    const s = r.surfaces.get(f.id);
    near(R.measureArea(s), 2 * 17 * 20 + (Math.PI / 2) * 3 * 20, 1e-6);
    const [lo, hi] = s.boundingBox.bounds;
    quadrants.add(`${Math.sign(lo[0] + hi[0])},${Math.sign(lo[2] + hi[2])}`);
  }
  assert.equal(quadrants.size, 4);
});
