// Dome along a direction (advanced.js domeDirected): a dome leaning along a vector keeps the height above the face
// and the volume of the upright one (a shear), and its top moves along the direction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { faceSignature } from '../../src/cad/refs.js';
import { createSketchGeometry, addCircle, addRectangle } from '../../src/cad/sketch.js';

await loadKernel();
const R = rep();

for (const shape of ['round', 'square']) {
  test(`a ${shape} face: the dome leaning 45° toward +x has the upright dome's volume and its top moved by its height`, () => {
    const part = { id: 'p', name: 'P', features: [] };
    const sk = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() });
    if (shape === 'round') addCircle(sk, 0, 0, 10); else addRectangle(sk, -10, -10, 10, 10);
    part.features.push(sk); part.features.push(createFeature(part, 'extrude', { sketch: sk.id, depth: 10 }));
    const b0 = regenerate(part).body; const top = b0.faces.find((f) => f.geomType === 'PLANE' && f.center.z > 9);
    const v0 = R.measureVolume(b0);
    const up = createFeature(part, 'dome', { faces: [faceSignature(top)], height: 5, shape: 'spherical' });
    const ru = regenerate({ ...part, features: [...part.features, up] });
    const lean = createFeature(part, 'dome', { faces: [faceSignature(top)], height: 5, shape: 'spherical', direction: { kind: 'vector', v: [1, 0, 1] } });
    const rl = regenerate({ ...part, features: [...part.features, lean] });
    assert.ok(rl.results.get(lean.id).ok, String(rl.results.get(lean.id).error));
    const vu = R.measureVolume(ru.body) - v0; const vl = R.measureVolume(rl.body) - v0;
    assert.ok(Math.abs(vl - vu) < 2e-3 * vu, `${vl} vs ${vu}`);
    // The highest point: 15 high, 5 along x (45°).
    const [lo, hi] = rl.body.boundingBox.bounds;
    assert.ok(Math.abs(hi[2] - 15) < 1e-3, String(hi[2]));
    void lo;
    const apexNear = R.measureDistanceBetween(R.makeVertex([5, 0, 15]), rl.body);
    assert.ok(apexNear < 1e-3, String(apexNear));
  });
}
