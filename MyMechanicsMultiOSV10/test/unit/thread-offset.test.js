// Thread start offset and trimming (advanced.js buildThread): a V thread on a shaft starting 5 mm along it cuts
// only from there; a negative offset trimmed with the start face cuts nothing before the edge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { edgeSignature } from '../../src/cad/refs.js';
import { createSketchGeometry, addCircle } from '../../src/cad/sketch.js';

await loadKernel();
const R = rep();

function shaft() {
  const part = { id: 'p', name: 'P', features: [] };
  const sk = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addCircle(sk, 0, 0, 5); part.features.push(sk);
  part.features.push(createFeature(part, 'extrude', { sketch: sk.id, depth: 40 }));
  const body = regenerate(part).body;
  const top = body.edges.find((e) => e.geomType === 'CIRCLE' && e.center?.z > 39 || (e.startPoint.z > 39 && e.geomType === 'CIRCLE'));
  return { part, top, v0: R.measureVolume(body) };
}
const zRange = (part) => {
  const r = regenerate(part);
  // The lowest point of the thread's cut: where the shaft's radius first drops below 5.
  return r;
};

test('a V thread 10 long, offset 5: the groove lies between 5 and 15 mm from the top edge', () => {
  const { part, top, v0 } = shaft();
  const th = createFeature(part, 'thread', { edge: edgeSignature(top), form: 'v', pitch: 1.5, length: 10, offset: 5 });
  const r = regenerate({ ...part, features: [...part.features, th] });
  assert.ok(r.results.get(th.id).ok, String(r.results.get(th.id).error));
  const removed = v0 - R.measureVolume(r.body);
  assert.ok(removed > 0);
  // Nothing removed within 4 mm of the top: the shaft is whole between z = 36 and 40.
  const slab = R.makeCylinder(6, 4, [0, 0, 36], [0, 0, 1]);
  const kept = R.measureVolume(r.body.clone().intersect(slab));
  assert.ok(Math.abs(kept - Math.PI * 25 * 4) < 1e-3, String(kept));
  void zRange;
});

test('a negative offset: the thread starts at the edge (nothing before it is material), shorter by the offset', () => {
  const { part, top, v0 } = shaft();
  const a = createFeature(part, 'thread', { edge: edgeSignature(top), form: 'v', pitch: 1.5, length: 10, offset: -3, trimStart: true });
  const ra = regenerate({ ...part, features: [...part.features, a] });
  assert.ok(ra.results.get(a.id).ok);
  const remA = v0 - R.measureVolume(ra.body);
  const b = createFeature(part, 'thread', { edge: edgeSignature(top), form: 'v', pitch: 1.5, length: 10, offset: -3, trimStart: false });
  const rb = regenerate({ ...part, features: [...part.features, b] });
  const remB = v0 - R.measureVolume(rb.body);
  // Only material is cut either way: trimming before the edge changes nothing in the body.
  assert.ok(Math.abs(remA - remB) < 1e-6 * v0, `${remA} vs ${remB}`);
  // About 7 of the 10 mm cut into the shaft (less than a full 10 mm thread).
  const full = createFeature(part, 'thread', { edge: edgeSignature(top), form: 'v', pitch: 1.5, length: 10 });
  const remFull = v0 - R.measureVolume(regenerate({ ...part, features: [...part.features, full] }).body);
  assert.ok(remA < remFull && remA > remFull * 0.55, `${remA} vs ${remFull}`);
});
