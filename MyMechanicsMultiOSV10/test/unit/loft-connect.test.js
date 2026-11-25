// Loft connectors (each profile's start vertex and direction) and start / end conditions tangent or curvature
// continuous to the body's side faces (cad/loft-more.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, createSketchGeometry } from '../../src/cad/sketch.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const ok = (part) => { const r = regenerate(part); for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`); return r; };
function plane(part, offset) { const p = createFeature(part, 'plane', { base: { kind: 'std', name: 'top' }, offset }); part.features.push(p); return { kind: 'ref', id: p.id }; }
function square(part, on, h) { const s = createFeature(part, 'sketch', { plane: on, ...createSketchGeometry() }); addRectangle(s, -h, -h, h, h); part.features.push(s); return s; }
/** Width (x extent) of the body in a thin slice at height z. */
function widthAt(body, z) { const sl = body.clone().intersect(R.makeBox([-100, -100, z - 1e-3], [100, 100, z + 1e-3])); const [lo, hi] = sl.boundingBox.bounds; return hi[0] - lo[0]; }

test('connectors: the second square starting one corner on twists the loft; back to the paired corner it is a prism', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const a = square(part, { kind: 'std', name: 'top' }, 10); const b = square(part, plane(part, 20), 10);
  const loft = createFeature(part, 'loft', { sketches: [a.id, b.id] }); part.features.push(loft);
  near(R.measureVolume(ok(part).body), 20 * 20 * 20, 1e-6);
  loft.connect = { [b.id]: { start: 1 } };
  const twisted = R.measureVolume(ok(part).body);
  assert.ok(twisted < 8000 - 100, `twisted ${twisted}`);
  // Start at vertex 0 on both: paired as drawn, the prism again.
  loft.connect = { [a.id]: { start: 0 }, [b.id]: { start: 0 } };
  near(R.measureVolume(ok(part).body), 8000, 1e-4);
});

test('start tangent / curvature to face: the loft leaves the block straight up along its side faces', () => {
  const build = (cond) => {
    const part = { id: 'p', name: 'P', features: [] };
    const base = square(part, { kind: 'std', name: 'top' }, 20);
    part.features.push(createFeature(part, 'extrude', { sketch: base.id, depth: 10 }));
    const a = square(part, plane(part, 10), 20); const b = square(part, plane(part, 40), 10);
    const loft = createFeature(part, 'loft', { sketches: [a.id, b.id], startCond: cond }); part.features.push(loft);
    return ok(part).body;
  };
  const plain = build('none'); const tan = build('tangentFace'); const curv = build('curvatureFace');
  // Straight loft: 40 → 20 over 30, so 0.3 above the block it is 39.8 wide; leaving tangent it is still ≈ 40.
  near(widthAt(plain, 10.3), 40 - 20 * 0.3 / 30, 1e-3);
  assert.ok(widthAt(tan, 10.3) > 39.98, `tangent ${widthAt(tan, 10.3)}`);
  assert.ok(widthAt(curv, 10.3) > 39.98, `curvature ${widthAt(curv, 10.3)}`);
  // Both still reach the top square.
  near(widthAt(tan, 39.999), 20, 1e-3);
});

test('a surface loft takes the same options (connectors, start condition) and stays an open sheet', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const a = square(part, { kind: 'std', name: 'top' }, 10); const b = square(part, plane(part, 20), 10);
  const sl = createFeature(part, 'surfaceLoft', { sketches: [a.id, b.id], connect: { [b.id]: { start: 1 } }, startCond: 'normal' }); part.features.push(sl);
  const r = ok(part);
  const sheet = r.surfaces.get(sl.id);
  // No end caps: no face lies in z = 0 or z = 20 square to z.
  for (const f of sheet.faces) { const [lo, hi] = f.boundingBox.bounds; assert.ok(hi[2] - lo[2] > 1, 'a cap was left on'); }
  assert.ok(R.measureArea(sheet) > 4 * 20 * 20, `twisted sheet area ${R.measureArea(sheet)}`);
});
