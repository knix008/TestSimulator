// Shell multi-thickness on curved faces (dressup-more.js curvedWall): a cup from a cylinder, its round wall made
// thinner or thicker than the shell — volumes exact against the formula.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { faceSignature } from '../../src/cad/refs.js';
import { createSketchGeometry, addCircle } from '../../src/cad/sketch.js';

await loadKernel();
const R = rep();

test('a cup (shell 2, top removed) with its cylindrical wall 1, 2 or 3 thick', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const sk = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addCircle(sk, 0, 0, 10); part.features.push(sk);
  part.features.push(createFeature(part, 'extrude', { sketch: sk.id, depth: 30 }));
  const b0 = regenerate(part).body;
  const top = b0.faces.find((f) => f.geomType === 'PLANE' && f.center.z > 29); const side = b0.faces.find((f) => f.geomType === 'CYLINDRE');
  for (const ti of [1, 2, 3]) {
    const sh = createFeature(part, 'shell', { thickness: 2, faces: [faceSignature(top)], multi: [{ sig: faceSignature(side), t: ti }] });
    const r = regenerate({ ...part, features: [...part.features, sh] });
    assert.ok(r.results.get(sh.id).ok, String(r.results.get(sh.id).error));
    const want = Math.PI * (100 - (10 - ti) ** 2) * 30 + Math.PI * (10 - ti) ** 2 * 2;
    assert.ok(Math.abs(R.measureVolume(r.body) - want) < want * 1e-6, `${ti}: ${R.measureVolume(r.body)} vs ${want}`);
  }
});
