// Library features inserted with size parameters (the item's sketch dimensions, re-solved) and placement on the face
// (at a point, moved and turned) — cad/asm-extra.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate, faceRef } from '../../src/cad/features.js';
import { addRectangle, addCircle, createSketchGeometry } from '../../src/cad/sketch.js';
import { makeLibraryItem, insertLibraryItem, libraryDims, placedFaceRef } from '../../src/cad/asm-extra.js';
import { planeOfFace } from '../../src/cad/refs.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test('a Ø10 pocket from the library goes in as Ø16, 15 to the right of the clicked point', () => {
  // The library item: a circle (radius dimension 5, centre fixed at the sketch origin) cut 4 deep.
  const src = { id: 's', name: 'S', features: [] };
  const k = createFeature(src, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() });
  const c = addCircle(k, 0, 0, 5); k.constraints.push({ id: 'dR', type: 'radius', a: c.id, value: 5 }); src.features.push(k);
  const cut = createFeature(src, 'extrude', { sketch: k.id, depth: 4, op: 'cut', name: 'Pocket' }); src.features.push(cut);
  const item = makeLibraryItem(src, cut.id);
  assert.deepEqual(libraryDims(item).map((d) => [d.id, d.value]), [['dR', 5]]);
  // The target: a 100 × 60 × 20 block; the pocket on its top face.
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addRectangle(s, 0, 0, 100, 60); part.features.push(s);
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 20 }));
  const top = regenerate(part).body.faces.find((f) => f.geomType === 'PLANE' && Math.abs(f.center.z - 20) < 1e-6);
  const ref = faceRef(top); const pl = planeOfFace(top);
  const plane = placedFaceRef(ref, pl.normal, { at: [30, 30, 25], dx: 15, dy: 0, angle: 90 });
  insertLibraryItem(part, item, plane, { dims: { dR: 8 } });
  const r = regenerate(part);
  for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error}`);
  near(R.measureVolume(r.body), 100 * 60 * 20 - Math.PI * 64 * 4, 1e-6);
  // Its centre: 15 along the face's x direction from (30, 30).
  const wall = r.body.faces.find((f) => /CYL/.test(f.geomType));
  const [lo, hi] = wall.boundingBox.bounds;
  const cx = (lo[0] + hi[0]) / 2; const cy = (lo[1] + hi[1]) / 2;
  near(Math.hypot(cx - 30, cy - 30), 15, 1e-6);
  near(hi[2], 20, 1e-9); near(lo[2], 16, 1e-9);
});
