// Fillet "keep features" (features.js keepFeaturesDressUp): the round made on the body without the chosen earlier
// features, those features then added / cut again, so a boss in the round's way stays whole.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addCircle, createSketchGeometry } from '../../src/cad/sketch.js';
import { edgeSignature } from '../../src/cad/refs.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test('a boss standing where the fillet rounds the edge is kept whole', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addRectangle(s, 0, 0, 100, 40); part.features.push(s);
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 20 }));
  const pl = createFeature(part, 'plane', { base: { kind: 'std', name: 'top' }, offset: 20 }); part.features.push(pl);
  const k = createFeature(part, 'sketch', { plane: { kind: 'ref', id: pl.id }, ...createSketchGeometry() }); addCircle(k, 50, 34, 4); part.features.push(k);
  const boss = createFeature(part, 'extrude', { sketch: k.id, depth: 10 }); part.features.push(boss);
  const r0 = regenerate(part);
  const edge = r0.body.edges.find((e) => e.geomType === 'LINE' && [e.startPoint, e.endPoint].every((p) => Math.abs(p.y - 40) < 1e-6 && Math.abs(p.z - 20) < 1e-6));
  const fil = createFeature(part, 'fillet', { edges: [edgeSignature(edge)], radius: 8, keep: [boss.id] }); part.features.push(fil);
  const r = regenerate(part);
  assert.ok(r.results.get(fil.id).ok, `${r.results.get(fil.id).error} ${r.results.get(fil.id).detail ?? ''}`);
  near(R.measureVolume(r.body), 100 * 40 * 20 - (1 - Math.PI / 4) * 64 * 100 + Math.PI * 16 * 10, 1e-6);
  // The boss is whole: its top disc is still a full circle of radius 4 at z = 30.
  const top = r.body.faces.find((f) => f.geomType === 'PLANE' && Math.abs(f.center.z - 30) < 1e-6);
  near(R.measureArea(top), Math.PI * 16, 1e-6);
});
