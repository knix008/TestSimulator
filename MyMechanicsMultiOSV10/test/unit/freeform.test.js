// Freeform (freeform.js): the top face of a block reshaped by a control-point grid — an exact B-spline face sewn
// back in, its border staying on the block's edges.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, createSketchGeometry } from '../../src/cad/sketch.js';
import { faceSignature } from '../../src/cad/refs.js';
import { freeformField } from '../../src/cad/freeform.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test('the offset field: zero on the border, the blend of the control offsets inside', () => {
  const f = freeformField(4, 4, [{ i: 1, j: 1, d: 3 }, { i: 2, j: 2, d: 3 }, { i: 1, j: 2, d: 3 }, { i: 2, j: 1, d: 3 }]);
  for (const s of [0, 0.3, 1]) { near(f(s, 0), 0); near(f(0, s), 0); near(f(1, s), 0); }
  // All four inner points raised 3: the middle rises 3 · (B1 + B2)(½)² = 3 · 0.75² .
  near(f(0.5, 0.5), 3 * 0.75 * 0.75, 1e-12);
  // A border point given an offset is ignored.
  near(freeformField(4, 4, [{ i: 0, j: 1, d: 5 }])(0.2, 0.4), 0);
});

test('a block top raised by four control points: volume = block + ∫∫ δ, exact B-spline face, edges unchanged', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addRectangle(s, 0, 0, 40, 30); part.features.push(s);
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 10 }));
  const top = regenerate(part).body.faces.find((f) => f.geomType === 'PLANE' && Math.abs(f.center.z - 10) < 1e-6);
  const pts = [{ i: 1, j: 1, d: 3 }, { i: 2, j: 2, d: 3 }, { i: 1, j: 2, d: 3 }, { i: 2, j: 1, d: 3 }];
  const ff = createFeature(part, 'freeform', { face: faceSignature(top), points: pts }); part.features.push(ff);
  const r = regenerate(part);
  assert.ok(r.results.get(ff.id).ok, `${r.results.get(ff.id).error} ${r.results.get(ff.id).detail ?? ''}`);
  assert.equal(r.results.get(ff.id).faceted, false);
  // ∫∫ δ over the face: 40 · 30 · 3 · (∫(B1 + B2))² = 1200 · 3 · (1/2)² .
  near(R.measureVolume(r.body), 40 * 30 * 10 + 1200 * 3 * 0.25, 1e-4);
  near(r.body.boundingBox.bounds[1][2], 10 + 3 * 0.5625, 1e-4);
  assert.ok(r.body.faces.some((f) => f.geomType === 'BSPLINE_SURFACE'));
});
