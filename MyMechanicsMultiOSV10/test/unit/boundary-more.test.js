// Boundary boss / surface options (advanced.js buildBoundary): direction-2 curves, start / end conditions to the
// body's faces with an influence, and a patch of open curves tangent to the face its curve lies on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, createSketchGeometry } from '../../src/cad/sketch.js';
import { faceSampler } from '../../src/cad/mold-brep.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const ok = (part) => { const r = regenerate(part); for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`); return r; };
function plane(part, offset) { const p = createFeature(part, 'plane', { base: { kind: 'std', name: 'top' }, offset }); part.features.push(p); return { kind: 'ref', id: p.id }; }
function square(part, on, h) { const s = createFeature(part, 'sketch', { plane: on, ...createSketchGeometry() }); addRectangle(s, -h, -h, h, h); part.features.push(s); return s; }
function widthAt(body, z) { const sl = body.clone().intersect(R.makeBox([-100, -100, z - 1e-3], [100, 100, z + 1e-3])); const [lo, hi] = sl.boundingBox.bounds; return hi[0] - lo[0]; }

test('boundary boss with a direction-2 curve follows it like a guided loft; a start condition tangent to the face', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const base = square(part, { kind: 'std', name: 'top' }, 20);
  part.features.push(createFeature(part, 'extrude', { sketch: base.id, depth: 10 }));
  const a = square(part, plane(part, 10), 20); const b = square(part, plane(part, 40), 10);
  const bd = createFeature(part, 'boundary', { curves: [a.id, b.id], op: 'boss' }); part.features.push(bd);
  const plain = ok(part).body; const v0 = R.measureVolume(plain);
  bd.startCond = 'tangentFace';
  const tan = ok(part).body;
  assert.ok(widthAt(tan, 10.3) > 39.98, `tangent ${widthAt(tan, 10.3)}`);
  near(widthAt(plain, 10.3), 40 - 20 * 0.3 / 30, 1e-3);
  // A second-direction curve bulging out at x = +20 … 10 (a 3D polyline through x = 24 halfway up).
  bd.startCond = 'none';
  const g = createFeature(part, 'sketch3d', { points: [[20, 0, 10], [24, 0, 25], [10, 0, 40]], spline: true }); part.features.splice(part.features.indexOf(bd), 0, g);
  bd.curves2 = [g.id];
  const bulged = ok(part).body;
  assert.ok(R.measureVolume(bulged) > v0 + 50, `${R.measureVolume(bulged)} vs ${v0}`);
  assert.ok(bulged.boundingBox.bounds[1][0] > 21, `${bulged.boundingBox.bounds[1][0]}`);
  // The same as a loft through the profiles with that guide curve.
  const loft = createFeature(part, 'loft', { sketches: [a.id, b.id], guides: [g.id] });
  const p2 = { ...part, features: [...part.features.filter((x) => x !== bd), loft] };
  near(R.measureVolume(ok(p2).body), R.measureVolume(bulged), 1e-9);
});

test('a patch of open curves leaves the face its first curve lies on tangent (G1) when asked', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addRectangle(s, -20, -20, 40, 40); part.features.push(s);
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 10 }));
  const c = (pts) => { const f = createFeature(part, 'sketch3d', { points: pts }); part.features.push(f); return f.id; };
  const curves = [c([[0, 0, 10], [20, 0, 10]]), c([[0, 20, 30], [20, 20, 30]])];
  const curves2 = [c([[0, 0, 10], [0, 20, 30]]), c([[20, 0, 10], [20, 20, 30]])];
  const bd = createFeature(part, 'boundary', { curves, curves2, op: 'surface' }); part.features.push(bd);
  const nz = (tangent) => {
    bd.tangent = tangent;
    const r = ok(part); const face = r.surfaces.get(bd.id).faces[0];
    const S = faceSampler(face); const [u, v] = face.uvCoordinates([10, 0.01, 10]); const n = S.at(u, v).n; S.delete();
    return Math.abs(n[2]);
  };
  assert.ok(nz('none') < 0.8, `plain ${nz('none')}`);
  assert.ok(nz('face') > 0.995, `tangent ${nz('face')}`);
});
