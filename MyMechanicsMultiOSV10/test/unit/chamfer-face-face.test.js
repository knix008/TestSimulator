// Face-face chamfer (dressup-more.js faceFaceChamfer): the top and a side of a block (next to each other), and the
// top and a side with a fillet between them (not next to each other: the fillet is taken away) — exact volumes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { faceSignature, edgeSignature } from '../../src/cad/refs.js';
import { createSketchGeometry, addRectangle } from '../../src/cad/sketch.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-7) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

function block(fillet = 0) {
  const part = { id: 'p', name: 'P', features: [] };
  const sk = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addRectangle(sk, -20, -10, 20, 10);
  part.features.push(sk); part.features.push(createFeature(part, 'extrude', { sketch: sk.id, depth: 10 }));
  if (fillet) {
    const b = regenerate(part).body;
    const e = b.edges.find((x) => x.geomType === 'LINE' && Math.abs(x.startPoint.z - 10) < 1e-6 && Math.abs(x.endPoint.z - 10) < 1e-6 && Math.abs(x.startPoint.x - 20) < 1e-6 && Math.abs(x.endPoint.x - 20) < 1e-6);
    part.features.push(createFeature(part, 'fillet', { edges: [edgeSignature(e)], radius: fillet }));
  }
  return part;
}

for (const fillet of [0, 1]) {
  test(`top and +x side${fillet ? ' with a 1 mm fillet between them' : ''}: distances 3 and 2 cut off a 3 × 2 triangle along 20 mm`, () => {
    const part = block(fillet);
    const b = regenerate(part).body;
    const top = b.faces.find((f) => f.geomType === 'PLANE' && Math.abs(f.center.z - 10) < 1e-6);
    const side = b.faces.find((f) => f.geomType === 'PLANE' && Math.abs(f.center.x - 20) < 1e-6);
    const c = createFeature(part, 'chamfer', { kind: 'faceFace', faceA: faceSignature(top), faceB: faceSignature(side), distance: 3, distance2: 2, edges: [] });
    const r = regenerate({ ...part, features: [...part.features, c] });
    assert.ok(r.results.get(c.id).ok, String(r.results.get(c.id).error));
    near(R.measureVolume(r.body), 40 * 20 * 10 - (3 * 2) / 2 * 20, 1e-9);
  });
}
