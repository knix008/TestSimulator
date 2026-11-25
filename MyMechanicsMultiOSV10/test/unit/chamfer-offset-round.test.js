// Offset-face chamfer on a circular edge: the rim of a hole (a plane and the coaxial cylinder) — the chamfer's
// faces lie 1 and 2 mm from the original faces' offsets meeting point: an exact cone, the volume by Pappus.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { edgeSignature } from '../../src/cad/refs.js';
import { createSketchGeometry, addRectangle, addCircle } from '../../src/cad/sketch.js';

await loadKernel();
const R = rep();

test('an offset-face chamfer on a hole rim (plane ⟂ a coaxial cylinder): offsets 1 and 1 give a 1 × 1 chamfer', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const sk = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addRectangle(sk, -20, -20, 20, 20); addCircle(sk, 0, 0, 5);
  part.features.push(sk); part.features.push(createFeature(part, 'extrude', { sketch: sk.id, depth: 10 }));
  const b = regenerate(part).body;
  const rim = b.edges.find((e) => e.geomType === 'CIRCLE' && Math.abs(e.startPoint.z - 10) < 1e-6);
  const v0 = R.measureVolume(b);
  const c = createFeature(part, 'chamfer', { kind: 'offsetFace', edges: [edgeSignature(rim)], distance: 1, distance2: 1 });
  const r = regenerate({ ...part, features: [...part.features, c] });
  assert.ok(r.results.get(c.id).ok, String(r.results.get(c.id).error));
  // At 90° the offset-face distances equal the face distances: a 1 × 1 triangle swept round r 5 (centroid at 5 + 1/3).
  const want = (1 * 1) / 2 * 2 * Math.PI * (5 + 1 / 3);
  assert.ok(Math.abs(v0 - R.measureVolume(r.body) - want) < 1e-6 * want, `${v0 - R.measureVolume(r.body)} vs ${want}`);
});
