// Parting-line draft on a curved parting line (draft-curved.js): a cylinder split at half height, its upper face
// drafted 5° about the circle — a cone frustum narrowing upward.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addCircle, createSketchGeometry } from '../../src/cad/sketch.js';
import { edgeSignature } from '../../src/cad/refs.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

function drafted(angle) {
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addCircle(s, 0, 0, 20); part.features.push(s);
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 30 }));
  const pl = createFeature(part, 'plane', { base: { kind: 'std', name: 'top' }, offset: 15 }); part.features.push(pl);
  part.features.push(createFeature(part, 'splitLine', { kind: 'intersection', tools: [`ref:${pl.id}`], faces: [] }));
  const b = regenerate(part).body;
  // The parting circle (the extrusion's two half circles).
  const ring = b.edges.filter((e) => e.geomType === 'CIRCLE' && Math.abs(e.startPoint.z - 15) < 1e-6 && Math.abs(e.endPoint.z - 15) < 1e-6);
  assert.ok(ring.length >= 1, 'the parting circle');
  const d = createFeature(part, 'draft', { kind: 'partingLine', partingEdges: ring.map(edgeSignature), angle, pull: { kind: 'axis', axis: 'z' } });
  part.features.push(d);
  const r = regenerate(part);
  assert.ok(r.results.get(d.id).ok, `${r.results.get(d.id).error} ${r.results.get(d.id).detail ?? ''}`);
  return r.body;
}
const frustum = (r1, r2, h) => (Math.PI * h / 3) * (r1 * r1 + r1 * r2 + r2 * r2);

test('a cylinder drafted 5° above a circular parting line: a frustum narrowing upward (material taken away)', () => {
  const body = drafted(5);
  near(R.measureVolume(body), Math.PI * 400 * 15 + frustum(20, 20 - 15 * Math.tan((5 * Math.PI) / 180), 15), 1e-6);
  const [, hi] = body.boundingBox.bounds; near(hi[2], 30, 1e-6);
});

test('drafted −5°: a frustum widening upward (material added)', () => {
  const body = drafted(-5);
  const r2 = 20 + 15 * Math.tan((5 * Math.PI) / 180);
  near(R.measureVolume(body), Math.PI * 400 * 15 + frustum(20, r2, 15), 1e-6);
  near(body.boundingBox.bounds[1][0], r2, 1e-4);
});
