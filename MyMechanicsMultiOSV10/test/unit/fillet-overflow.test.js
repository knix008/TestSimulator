// Fillet overflow (features.js / dressup-more.js planarRounds / fillet-setback.js): an R8 round on the top front edge
// of a rib only 5 high — the kernel's fillet cannot (it overflows); keep surface carries the round on into the block,
// keep edge stops it at the rib's own faces.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, createSketchGeometry } from '../../src/cad/sketch.js';
import { edgeSignature } from '../../src/cad/refs.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

function rib(overflow) {
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addRectangle(s, 0, 0, 40, 40); part.features.push(s);
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 10 }));
  const pl = createFeature(part, 'plane', { base: { kind: 'std', name: 'top' }, offset: 10 }); part.features.push(pl);
  const k = createFeature(part, 'sketch', { plane: { kind: 'ref', id: pl.id }, ...createSketchGeometry() }); addRectangle(k, 0, 30, 40, 40); part.features.push(k);
  part.features.push(createFeature(part, 'extrude', { sketch: k.id, depth: 5 }));
  const b = regenerate(part).body;
  const edge = b.edges.find((e) => e.geomType === 'LINE' && [e.startPoint, e.endPoint].every((q) => Math.abs(q.y - 30) < 1e-6 && Math.abs(q.z - 15) < 1e-6));
  const f = createFeature(part, 'fillet', { edges: [edgeSignature(edge)], radius: 8, ...(overflow ? { overflow } : {}) }); part.features.push(f);
  return regenerate(part).results.get(f.id);
}

test('the kernel alone cannot; keep surface takes the whole corner; keep edge stops at the rib\'s faces', () => {
  assert.equal(rib(null).ok, false);
  const V0 = 40 * 40 * 10 + 40 * 10 * 5;
  const surf = rib('keepSurface'); assert.ok(surf.ok, surf.error);
  near(R.measureVolume(surf.body), V0 - 64 * (1 - Math.PI / 4) * 40);
  const edge = rib('keepEdge'); assert.ok(edge.ok, edge.error);
  // Only the part of the corner over the rib's front face (z 10 … 15): ∫ (8 − √(64 − (z − 7)²)) dz.
  let area = 0; const h = 1e-4;
  for (let z = 10 + h / 2; z < 15; z += h) area += (8 - Math.sqrt(64 - (z - 7) ** 2)) * h;
  near(R.measureVolume(edge.body), V0 - area * 40, 1e-6);
});
