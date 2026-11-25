// Conic / curvature-continuous fillets on edges between curved faces (dressup-more.js generalProfileFillet): a conic
// is fuller as rho grows and G2 is fuller than the circular fillet (all from the same rolling-ball contact points).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addCircle, createSketchGeometry } from '../../src/cad/sketch.js';
import { edgeSignature } from '../../src/cad/refs.js';

await loadKernel();
const R = rep();
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

/** A 40 × 40 × 20 block met by a Ø50 cylinder (block ∩ cylinder): its vertical edges at x = 0 lie between a plane and the cylinder. */
function part(fillet) {
  const p = { id: 'p', name: 'P', features: [] };
  const s = createFeature(p, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addRectangle(s, 0, 0, 40, 40); p.features.push(s);
  p.features.push(createFeature(p, 'extrude', { sketch: s.id, depth: 20 }));
  const c = createFeature(p, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addCircle(c, 0, 0, 25); p.features.push(c);
  p.features.push(createFeature(p, 'extrude', { sketch: c.id, depth: 20, op: 'common' }));
  const r0 = regenerate(p);
  const edge = r0.body.edges.find((e) => e.geomType === 'LINE' && [e.startPoint, e.endPoint].every((q) => Math.abs(q.x) < 1e-6 && Math.abs(q.y - 25) < 1e-6));
  assert.ok(edge, 'the plane / cylinder edge');
  if (fillet) p.features.push(createFeature(p, 'fillet', { edges: [edgeSignature(edge)], radius: 3, ...fillet }));
  const r = regenerate(p);
  for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`);
  return R.measureVolume(r.body);
}

test('conic fillets on an edge between a plane and a cylinder: fuller as rho grows, G2 fuller than circular', () => {
  const v0 = part(null);
  const circ = v0 - part({});
  const lean = v0 - part({ profile: 'conic', rho: 0.3 });
  const full = v0 - part({ profile: 'conic', rho: 0.7 });
  const g2 = v0 - part({ profile: 'curvature' });
  // Same contact points as the circular fillet; a fuller profile (larger rho) leaves more of the corner.
  assert.ok(lean > full && full > 0, `rho 0.3: ${lean}, rho 0.7: ${full}`);
  assert.ok(lean > circ * 0.9 && full < circ, `circular ${circ}`);
  assert.ok(g2 > 0 && g2 < circ, `g2 ${g2} vs circular ${circ}`);
});
