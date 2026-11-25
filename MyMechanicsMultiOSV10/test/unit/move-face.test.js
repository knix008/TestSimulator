// Move Face (move-face.js): a planar face offset, translated across its plane and turned about an axis — the faces
// around it extend or trim to follow (exact volumes) — and a hole's radius changed by offsetting its cylinder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { faceSignature } from '../../src/cad/refs.js';
import { createSketchGeometry, addRectangle, addCircle } from '../../src/cad/sketch.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

/** A 40 × 20 × 10 block (z 0 … 10), optionally with a Ø10 through hole. */
function block(hole = false) {
  const part = { id: 'p', name: 'P', features: [] };
  const sk = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() });
  addRectangle(sk, -20, -10, 20, 10); if (hole) addCircle(sk, 0, 0, 5);
  part.features.push(sk); part.features.push(createFeature(part, 'extrude', { sketch: sk.id, depth: 10 }));
  return { part, body: regenerate(part).body };
}
const run = (part, params) => { const f = createFeature(part, 'moveFace', params); const r = regenerate({ ...part, features: [...part.features, f] }); assert.ok(r.results.get(f.id).ok, String(r.results.get(f.id).error)); return R.measureVolume(r.body); };

test('offset and translate the top face: the block grows or shrinks by the move across the plane', () => {
  const { part, body } = block();
  const top = body.faces.find((f) => f.geomType === 'PLANE' && f.center.z > 9);
  near(run(part, { faces: [faceSignature(top)], mode: 'offset', distance: 3 }), 40 * 20 * 13);
  near(run(part, { faces: [faceSignature(top)], mode: 'offset', distance: -4 }), 40 * 20 * 6);
  // Translated by 5 along z: the same as an offset of 5; along x: no change (it slides in its own plane).
  near(run(part, { faces: [faceSignature(top)], mode: 'translate', direction: { kind: 'axis', axis: 'z' }, distance: 5 }), 40 * 20 * 15);
  near(run(part, { faces: [faceSignature(top)], mode: 'translate', direction: { kind: 'axis', axis: 'x' }, distance: 5 }), 40 * 20 * 10);
});

test('rotate the top face 10° about the x axis through its centre: a wedge on, a wedge off — the volume is the same, the top is sloped', () => {
  const { part, body } = block();
  const top = body.faces.find((f) => f.geomType === 'PLANE' && f.center.z > 9);
  const f = createFeature(part, 'moveFace', { faces: [faceSignature(top)], mode: 'rotate', axis: { kind: 'axis', axis: 'x' }, angle: 10 });
  const r = regenerate({ ...part, features: [...part.features, f] });
  near(R.measureVolume(r.body), 40 * 20 * 10, 1e-9);
  const [lo, hi] = r.body.boundingBox.bounds;
  near(hi[2], 10 + 10 * Math.tan((10 * Math.PI) / 180), 1e-9);
  void lo;
});

test('offset a hole\'s cylinder: the hole gets smaller (+) or bigger (−) through the whole block', () => {
  const { part, body } = block(true);
  const v0 = R.measureVolume(body);
  const cyl = body.faces.find((f) => /CYL/.test(f.geomType));
  near(run(part, { faces: [faceSignature(cyl)], mode: 'offset', distance: 1 }), v0 + Math.PI * (25 - 16) * 10, 1e-7);
  near(run(part, { faces: [faceSignature(cyl)], mode: 'offset', distance: -2 }), v0 - Math.PI * (49 - 25) * 10, 1e-7);
});
