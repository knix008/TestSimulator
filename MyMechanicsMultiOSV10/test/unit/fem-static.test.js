// Linear static analysis on quadratic tetrahedra (src/cad/fem/static.js) against textbook results: cantilever
// deflection and bending stress, a bar in tension, pressure = force, self-weight, the stress concentration of a hole
// in a wide plate (Kt ≈ 3), symmetry (roller) supports, bonded and no-penetration assembly contact, probes and line plots.
// Hertz contact is in fem-contact.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { linearStatic, probeStatic, staticLine } from '../../src/cad/fem/static.js';
import { analyse } from '../../src/cad/fea.js';
import { boxMesh, halfPlateWithHole, quarterPlateWithHole } from './fem-shapes.js';

const STEEL = { E: 210000, nu: 0.3, yield: 250, density: 7850 };
const within = (v, e, rel, what) => assert.ok(Math.abs(v - e) <= rel * Math.abs(e), `${what}: ${v} vs ${e} (±${rel * 100}%)`);
const tipZ = (r, x) => { const m = r.model; let s = 0, n = 0; for (let i = 0; i < m.nn; i++) if (Math.abs(m.nodes[3 * i] - x) < 1e-6) { s += r.displacement[3 * i + 2]; n++; } return s / n; };

test('cantilever 100×10×10, 100 N tip load: deflection PL³/3EI (+shear) and root stress Mc/I; reactions balance', () => {
  const r = linearStatic({ bodies: [{ mesh: boxMesh(100, 10, 10, 2), material: STEEL }], fixtures: [0], loads: [{ faceId: 1, force: [0, 0, -100] }], mesh: { size: 2.5 } });
  assert.equal(r.ok, true, r.error);
  const I = 10 ** 4 / 12, bend = (100 * 100 ** 3) / (3 * 210000 * I), shear = (100 * 100) / ((5 / 6) * (210000 / 2.6) * 100);
  within(-tipZ(r, 100), bend + shear, 0.02, 'tip deflection');
  within(probeStatic(r, [10, 5, 10]).stress[0], (100 * 90 * 5) / I, 0.03, 'bending stress at x = 10 (top fibre)');
  within(r.reactions[0].force[2], 100, 1e-6, 'reaction');
  assert.ok(r.minFactorOfSafety > 1);
  assert.equal(r.vertexStress.length, boxMesh(100, 10, 10, 2).vertices.length / 3);
});

test('bar in tension: uniform σ = F/A and elongation FL/EA; a pressure equals the force p·A', () => {
  const r = linearStatic({ bodies: [{ mesh: boxMesh(100, 10, 10, 2), material: STEEL }], fixtures: [{ faceId: 0, type: 'displacement', value: [0, null, null] }, { faceId: 2, type: 'roller' }, { faceId: 4, type: 'roller' }], loads: [{ faceId: 1, force: [1000, 0, 0] }], mesh: { size: 5 } });
  within(probeStatic(r, [50, 5, 5]).stress[0], 10, 1e-6, 'σ = F/A');
  within(probeStatic(r, [100, 5, 5]).displacement[0], (1000 * 100) / (210000 * 100), 1e-6, 'elongation');
  const p = linearStatic({ bodies: [{ mesh: boxMesh(100, 10, 10, 2), material: STEEL }], fixtures: [{ faceId: 0, type: 'displacement', value: [0, null, null] }, { faceId: 2, type: 'roller' }, { faceId: 4, type: 'roller' }], loads: [{ faceId: 1, pressure: -10 }], mesh: { size: 5 } });
  within(probeStatic(p, [50, 5, 5]).stress[0], 10, 1e-6, 'pressure −10 MPa pulls with 10 MPa');
});

test('self-weight of a cantilever: qL⁴/8EI with q = ρgA (gravity −Z)', () => {
  const r = analyse(boxMesh(100, 10, 10, 2), { material: STEEL, fixtures: [0], loads: [], gravity: [0, 0, -9.81], elementSize: 2.5 });
  const q = 7850e-9 * 9.81 * 100, I = 10 ** 4 / 12;
  within(-tipZ(r, 100), (q * 100 ** 4) / (8 * 210000 * I), 0.03, 'self-weight deflection');
});

test('hole in a wide plate (d/W = 0.1): Kt = 3.03 at the hole, σθθ = σ(1 − 2cos2θ) around it', () => {
  const r = linearStatic({
    bodies: [{ mesh: halfPlateWithHole(60, 50, 5, 2), material: STEEL }],
    fixtures: [{ faceId: 1, type: 'roller' }, { faceId: 100, type: 'displacement', value: [null, null, 0] }, { faceId: 5, type: 'displacement', value: [0, null, null] }],
    loads: [{ faceId: 2, traction: [10, 0, 0] }], mesh: { size: 4, refine: [{ faceIds: [4], size: 0.5 }], grading: 0.3 },
  });
  assert.equal(r.ok, true, r.error);
  within(probeStatic(r, [0, 5, 1]).stress[0] / 10, 3.03, 0.04, 'Kt (gross section, Heywood)');
  for (const deg of [60, 45]) { const a = (deg * Math.PI) / 180, s = probeStatic(r, [5 * Math.cos(a), 5 * Math.sin(a), 1]).stress[0]; within(s, 10 * (1 - 2 * Math.cos(2 * a)) * Math.sin(a) ** 2, 0.08, `σxx at θ = ${deg}°`); }
  const line = staticLine(r, [0, 5.01, 1], [0, 49, 1], 'sxx', 9);
  assert.ok(line[0].value > line.at(-1).value * 2.5, 'stress decays away from the hole');
  within(line.at(-1).value, 10, 0.06, 'far field');
});

test('quarter plate with symmetry rollers: the CAD edge where the hole meets the symmetry plane stays sharp, Kt ≈ 3', () => {
  const r = linearStatic({
    bodies: [{ mesh: quarterPlateWithHole(100, 50, 5, 2, 64), material: STEEL }],
    fixtures: [{ faceId: 0, type: 'roller' }, { faceId: 1, type: 'roller' }, { faceId: 100, type: 'displacement', value: [null, null, 0] }],
    loads: [{ faceId: 2, traction: [10, 0, 0] }], mesh: { size: 4, refine: [{ faceIds: [4], size: 0.5 }], grading: 0.3 },
  });
  assert.equal(r.ok, true, r.error);
  // The hole / symmetry-plane edge is in the mesh: boundary nodes lie on it all through the thickness.
  const m = r.model; let onEdge = 0;
  for (let n = 0; n < m.nn; n++) if (Math.abs(m.nodes[3 * n]) < 1e-6 && Math.abs(m.nodes[3 * n + 1] - 5) < 1e-6) onEdge++;
  assert.ok(onEdge >= 5, `nodes on the CAD edge: ${onEdge}`);
  const kt = [0.25, 0.5, 0.75, 1.25, 1.5, 1.75].map((z) => probeStatic(r, [0, 5, z]).stress[0] / 10).sort((a, b) => a - b);
  within((kt[2] + kt[3]) / 2, 3.03, 0.04, 'Kt (median through the thickness)');
  for (const deg of [80, 60, 45]) { const a = (deg * Math.PI) / 180, v = probeStatic(r, [5 * Math.cos(a), 5 * Math.sin(a), 1]).stress[0]; within(v, 10 * (1 - 2 * Math.cos(2 * a)) * Math.sin(a) ** 2, 0.08, `σxx at θ = ${deg}°`); }
});

test('bonded contact: two blocks tied across non-matching meshes bend like one beam', () => {
  const one = linearStatic({ bodies: [{ mesh: boxMesh(100, 10, 10, 2), material: STEEL }], fixtures: [0], loads: [{ faceId: 1, force: [0, 0, -100] }], mesh: { size: 2.5 } });
  const two = linearStatic({
    bodies: [{ mesh: boxMesh(50, 10, 10, 2), material: STEEL, meshOptions: { size: 2.5 } }, { mesh: boxMesh(50, 10, 10, 2, [50, 0, 0], 10), material: STEEL, meshOptions: { size: 3.3 } }],
    fixtures: [{ body: 0, faceId: 0 }], loads: [{ body: 1, faceId: 11, force: [0, 0, -100] }], contacts: 'bonded', mesh: { size: 2.5 },
  });
  assert.equal(two.ok, true, two.error);
  assert.ok(two.contact.constraints > 10);
  within(two.maxDisplacement, one.maxDisplacement, 0.03, 'tip deflection of the bonded pair');
});

test('no-penetration contact: a block pressed onto another transmits the load without penetrating', () => {
  const bodies = [{ mesh: boxMesh(10, 10, 10, 2), material: STEEL }, { mesh: boxMesh(10, 10, 10, 2, [0, 0, 10], 10), material: STEEL }];
  const press = linearStatic({ bodies, fixtures: [{ body: 0, faceId: 4 }, { body: 1, faceId: 10, type: 'roller' }, { body: 1, faceId: 12, type: 'roller' }], loads: [{ body: 1, faceId: 15, force: [0, 0, -1000] }], contacts: 'contact', mesh: { size: 2.5 } });
  assert.equal(press.ok, true, press.error);
  within(Math.abs(press.contact.force[2]), 1000, 0.02, 'contact force = load');
  assert.ok(press.contact.maxPenetration < 1e-4, `penetration ${press.contact.maxPenetration}`);
  within(press.reactions[0].force[2], 1000, 0.02, 'support reaction');
});

test('errors: no fixtures, no loads', () => {
  const m = boxMesh(10, 10, 10, 1);
  assert.equal(linearStatic({ bodies: [{ mesh: m, material: STEEL }], fixtures: [], loads: [{ faceId: 1, force: [1, 0, 0] }] }).error, 'no-fixtures');
  assert.equal(linearStatic({ bodies: [{ mesh: m, material: STEEL }], fixtures: [0], loads: [] }).error, 'no-loads');
});
