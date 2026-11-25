// Dome: elliptical on a circular face (half an ellipsoid: 2/3 π r² h), continuous on a rectangle (sections
// shrinking by cos φ: 2/3 A h, the loft between them within a little).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addCircle, createSketchGeometry } from '../../src/cad/sketch.js';
import { faceSignature } from '../../src/cad/refs.js';

await loadKernel();
const R = rep();
const V = (s) => R.measureVolume(s);
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const top = { kind: 'std', name: 'top' };
const add = (part, type, params) => { const f = createFeature(part, type, params); part.features.push(f); return f; };
function ok(part) { const r = regenerate(part); for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`); return r; }
function base(draw, h) {
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: top, ...createSketchGeometry() }); draw(s); part.features.push(s);
  add(part, 'extrude', { sketch: s.id, depth: h });
  const body = ok(part).body;
  return { part, before: V(body), topFace: faceSignature(body.faces.find((f) => f.geomType === 'PLANE' && Math.abs(f.center.z - h) < 1e-6)) };
}

test('elliptical dome on a Ø20 cylinder, 5 high: half an ellipsoid', () => {
  const { part, before, topFace } = base((k) => addCircle(k, 0, 0, 10), 10);
  add(part, 'dome', { faces: [topFace], height: 5, shape: 'elliptical' });
  near(V(ok(part).body) - before, (2 / 3) * Math.PI * 100 * 5, 1e-6);
});

test('continuous dome on a 40 × 30 face, 5 high: about 2/3 of the prism, and it stands square on the face', () => {
  const { part, before, topFace } = base((k) => addRectangle(k, 0, 0, 40, 30), 10);
  add(part, 'dome', { faces: [topFace], height: 5, shape: 'continuous' });
  const body = ok(part).body;
  near(V(body) - before, (2 / 3) * 1200 * 5, 0.02);
  near(body.boundingBox.bounds[1][2], 15, 1e-3);
  // Square to the face: the outline stays inside the 40 × 30 rectangle.
  near(body.boundingBox.bounds[1][0], 40, 1e-6);
});
