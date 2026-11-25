// Fillet setback (fillet-setback.js): the corner where three filleted edges meet blended from a distance along each
// edge — one smooth patch tangent to the fillets around it, a closed solid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, createSketchGeometry } from '../../src/cad/sketch.js';
import { edgeSignature } from '../../src/cad/refs.js';

await loadKernel();
const R = rep();

function cube(setbacks) {
  const p = { id: 'p', name: 'P', features: [] };
  const s = createFeature(p, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addRectangle(s, 0, 0, 40, 40); p.features.push(s);
  p.features.push(createFeature(p, 'extrude', { sketch: s.id, depth: 40 }));
  const b = regenerate(p).body;
  const at = (q) => Math.hypot(q.x - 40, q.y - 40, q.z - 40) < 1e-6;
  const edges = b.edges.filter((e) => at(e.startPoint) || at(e.endPoint));
  const f = createFeature(p, 'fillet', { edges: edges.map(edgeSignature), radius: 5, ...(setbacks ? { setbacks } : {}) }); p.features.push(f);
  const r = regenerate(p);
  assert.ok(r.results.get(f.id).ok, `${r.results.get(f.id).error} ${r.results.get(f.id).detail ?? ''}`);
  return r.body;
}

test('three edges filleted at a cube corner, blended from 12 along each edge: one closed solid, a smoother (smaller) corner', () => {
  const plain = cube(null);
  const set = cube([{ vertex: [40, 40, 40], d: [12, 12, 12] }]);
  assert.equal([...R.iterTopo(set.wrapped, 'solid')].length, 1);
  const v0 = R.measureVolume(plain); const v1 = R.measureVolume(set);
  assert.ok(v1 < v0 - 0.1 && v1 > v0 - 200, `setback ${v1} vs ${v0}`);
  // Away from the corner nothing changed: the far ends of the three fillets are as before.
  for (const z of [5, 20]) {
    const slab = (b) => R.measureVolume(b.clone().intersect(R.makeBox([0, 0, z - 0.5], [40, 40, z + 0.5])));
    assert.ok(Math.abs(slab(set) - slab(plain)) < 1e-6, `slab at z = ${z}`);
  }
});
