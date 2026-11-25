// Wrap scribe: the face is split along the wrapped outline, the volume does not change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addCircle, createSketchGeometry } from '../../src/cad/sketch.js';
import { faceSignature } from '../../src/cad/refs.js';

await loadKernel();
const R = rep();
const add = (part, type, params) => { const f = createFeature(part, type, params); part.features.push(f); return f; };
function ok(part) { const r = regenerate(part); for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`); return r; }

for (const [name, draw, pickFace] of [
  ['a planar face', (k) => addRectangle(k, 0, 0, 40, 30), (b) => b.faces.find((f) => f.geomType === 'PLANE' && Math.abs(f.center.z - 10) < 1e-6)],
  ['a cylinder', (k) => addCircle(k, 0, 0, 15), (b) => b.faces.find((f) => /CYL/.test(f.geomType))],
]) {
  test(`wrap scribe on ${name}: more faces, the same volume`, () => {
    const part = { id: 'p', name: 'P', features: [] };
    const s = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); draw(s); part.features.push(s);
    add(part, 'extrude', { sketch: s.id, depth: 10 });
    const body = ok(part).body;
    const face = pickFace(body);
    const front = { kind: 'std', name: name === 'a cylinder' ? 'front' : 'top' };
    const k = createFeature(part, 'sketch', { plane: front, ...createSketchGeometry() });
    addRectangle(k, name === 'a cylinder' ? -4 : 10, name === 'a cylinder' ? 3 : 10, name === 'a cylinder' ? 4 : 20, name === 'a cylinder' ? 7 : 20); part.features.push(k);
    add(part, 'wrap', { sketch: k.id, face: faceSignature(face), op: 'scribe' });
    const after = ok(part).body;
    assert.ok(after.faces.length > body.faces.length, `${after.faces.length} faces`);
    assert.ok(Math.abs(R.measureVolume(after) - R.measureVolume(body)) < 1e-6 * R.measureVolume(body));
  });
}
