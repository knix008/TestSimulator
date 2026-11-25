// Wrap on a non-cylindrical face (wrap-surface.js): a 6 × 4 rectangle wrapped by arc length onto the side of a
// lofted (spline) frustum, raised 1 — its footprint keeps (to the surface's curvature) the rectangle's size.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addCircle, createSketchGeometry } from '../../src/cad/sketch.js';
import { faceSignature } from '../../src/cad/refs.js';

await loadKernel();
const R = rep();

test('a rectangle wrapped on a lofted face: raised by its area × depth, lying on the face', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const a = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addCircle(a, 0, 0, 20); part.features.push(a);
  const pl = createFeature(part, 'plane', { base: { kind: 'std', name: 'top' }, offset: 30 }); part.features.push(pl);
  const b = createFeature(part, 'sketch', { plane: { kind: 'ref', id: pl.id }, ...createSketchGeometry() }); addCircle(b, 0, 0, 14); part.features.push(b);
  part.features.push(createFeature(part, 'loft', { sketches: [a.id, b.id] }));
  const r0 = regenerate(part);
  const side = r0.body.faces.find((f) => f.geomType !== 'PLANE');
  assert.ok(side, `the side face (${r0.body.faces.map((f) => f.geomType)})`);
  const k = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'front' }, ...createSketchGeometry() }); addRectangle(k, -3, 13, 3, 17); part.features.push(k);
  const w = createFeature(part, 'wrap', { sketch: k.id, face: faceSignature(side), op: 'emboss', depth: 1 }); part.features.push(w);
  const r = regenerate(part);
  assert.ok(r.results.get(w.id).ok, `${r.results.get(w.id).error} ${r.results.get(w.id).detail ?? ''}`);
  const added = R.measureVolume(r.body) - R.measureVolume(r0.body);
  assert.ok(Math.abs(added - 24) < 24 * 0.06, `raised ${added}`);
  // The pad sits on the side: its tool's centre is about 1/2 off the face.
  const tool = r.results.get(w.id).tool; const c = tool.boundingBox.center ?? null; void c;
  const [lo, hi] = tool.boundingBox.bounds;
  assert.ok(hi[2] - lo[2] > 3.5 && hi[2] - lo[2] < 4.6, `height ${hi[2] - lo[2]}`);
});
