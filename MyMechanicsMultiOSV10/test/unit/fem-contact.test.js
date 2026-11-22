// Contact on the tetrahedral model (src/cad/fem/contact.js, static.js, nonlinear.js): Hertz contact of an elastic sphere on
// a rigid plane (contact radius, peak pressure p0 and the pressure profile p0·√(1 − r²/a²)), Coulomb friction (slip at μN,
// stick below it), and finite sliding in the nonlinear study (frictionless and frictional).
import test from 'node:test';
import assert from 'node:assert/strict';
import { linearStatic } from '../../src/cad/fem/static.js';
import { nonlinearStudy } from '../../src/cad/fem/nonlinear.js';
import { quarterCap, boxMesh } from './fem-shapes.js';

const within = (v, e, rel, what) => assert.ok(Math.abs(v - e) <= rel * Math.abs(e), `${what}: ${v} vs ${e} (±${rel * 100}%)`);

test('Hertz contact: elastic sphere on a rigid plane — contact radius, peak pressure p0 and the pressure profile', () => {
  const E = 210000, nu = 0.3, R = 10, a = 0.8, Es = E / (1 - nu * nu), F = (4 * Es * a ** 3) / (3 * R), p0 = (3 * F) / (2 * Math.PI * a * a);
  const r = linearStatic({
    bodies: [{ mesh: quarterCap(R, 4, 48, 24), material: { E, nu, yield: 1e9 } }],
    fixtures: [{ faceId: 2, type: 'roller' }, { faceId: 3, type: 'roller' }], loads: [{ faceId: 1, force: [0, 0, -F / 4] }],
    walls: [{ point: [0, 0, 0], normal: [0, 0, 1] }], mesh: { size: 2, refine: [{ point: [0, 0, 0], radius: 1.04, size: 0.15 }], grading: 0.35 },
  });
  assert.equal(r.ok, true, r.error);
  within(4 * r.contact.force[2], F, 1e-3, 'contact force');
  let rmax = 0;
  r.contact.list.forEach((c, i) => { if (r.contact.pressure[i] > 0) rmax = Math.max(rmax, Math.hypot(r.model.nodes[3 * c.s], r.model.nodes[3 * c.s + 1])); });
  within(rmax, a, 0.06, 'contact radius');
  within(r.contact.maxPressure, p0, 0.05, 'peak contact pressure p0');
  for (const [n, p] of r.contact.nodalPressure) {
    const rr = Math.hypot(r.model.nodes[3 * n], r.model.nodes[3 * n + 1]);
    if (rr < 0.7 * a) assert.ok(Math.abs(p / p0 - Math.sqrt(1 - (rr * rr) / (a * a))) < 0.07, `p(${rr.toFixed(2)}) = ${(p / p0).toFixed(3)} p0`);
  }
});

test('Coulomb friction: a pressed block slips at μN against an elastic side support, and sticks below it', () => {
  const run = (T) => linearStatic({ bodies: [{ mesh: boxMesh(10, 10, 10, 2), material: { E: 210000, nu: 0.3, yield: 1e9 } }], fixtures: [{ faceId: 0, type: 'elastic', stiffness: 50 }, { faceId: 2, type: 'roller' }], loads: [{ faceId: 5, force: [T, 0, -1000] }], walls: [{ point: [0, 0, 0], normal: [0, 0, 1], friction: 0.3 }], mesh: { size: 3.4 } });
  const slip = run(500);
  assert.equal(slip.ok, true, slip.error);
  assert.equal(slip.contact.sticking, 0, 'all contact nodes slip');
  // Every node slips at μ·p; the resultant is a little smaller because the lateral (Poisson) slip turns some of it sideways.
  within(Math.hypot(slip.contact.friction[0], slip.contact.friction[1]), 0.3 * slip.contact.force[2], 0.04, 'friction ≈ μN while slipping');
  assert.ok(slip.contact.friction[0] < 0, 'friction opposes the push');
  const stick = run(100);
  assert.ok(stick.contact.sticking > 0, 'nodes stick below μN');
  assert.ok(Math.hypot(...stick.contact.friction) < 0.3 * stick.contact.force[2]);
});

test('finite sliding in the nonlinear study: a pressed block dragged 10 mm along a rigid floor (frictionless and μ = 0.3)', () => {
  const base = (mu, order) => nonlinearStudy({ bodies: [{ mesh: boxMesh(10, 10, 10, 2), material: { E: 210000, nu: 0.3, plastic: false } }], fixtures: [{ faceId: 5, type: 'displacement', value: [10, 0, null] }], loads: [{ faceId: 5, force: [0, 0, -1000] }], walls: [{ point: [0, 0, 0], normal: [0, 0, 1], friction: mu }], mesh: { size: 5, order }, geometric: true, steps: mu > 0 ? 10 : 5, maxNewton: 40 });
  const bottom = (r) => { const m = r.model; let s = 0, n = 0; for (let i = 0; i < m.nn; i++) if (m.nodes[3 * i + 2] < 1e-6) { s += r.displacement[3 * i]; n++; } return s / n; };
  const free = base(0, 2);
  assert.equal(free.ok, true, free.error);
  within(bottom(free), 10, 1e-3, 'slid 10 mm (quadratic tets)');
  within(free.curve.at(-1).contactForce[2], 1000, 1e-3, 'normal force');
  const fric = base(0.3, 1);
  assert.equal(fric.ok, true, fric.error);
  within(bottom(fric), 10, 2e-3, 'slid 10 mm with friction');
  within(-fric.curve.at(-1).frictionForce[0], 300, 0.01, 'friction μN all along');
  within(fric.curve.at(-1).reaction[0], 300, 0.01, 'drag force');
});

test('bonded ties: eliminated exactly in the linear study, kept by penalty in the nonlinear one — both bend like one beam', () => {
  const STEEL = { E: 210000, nu: 0.3, yield: 1e9, plastic: false };
  const one = linearStatic({ bodies: [{ mesh: boxMesh(100, 10, 10, 2), material: STEEL }], fixtures: [0], loads: [{ faceId: 1, force: [0, 0, -100] }], mesh: { size: 2.5 } });
  const bodies = [{ mesh: boxMesh(50, 10, 10, 2), material: STEEL, meshOptions: { size: 2.5 } }, { mesh: boxMesh(50, 10, 10, 2, [50, 0, 0], 10), material: STEEL, meshOptions: { size: 3.3 } }];
  const lin = linearStatic({ bodies, fixtures: [{ body: 0, faceId: 0 }], loads: [{ body: 1, faceId: 11, force: [0, 0, -100] }], contacts: 'bonded', mesh: { size: 2.5 } });
  within(lin.maxDisplacement, one.maxDisplacement, 0.02, 'linear, tie eliminated');
  const nl = nonlinearStudy({ bodies, fixtures: [{ body: 0, faceId: 0 }], loads: [{ body: 1, faceId: 11, force: [0, 0, -100] }], contacts: 'bonded', mesh: { size: 3.3 }, geometric: true, steps: 2 });
  assert.equal(nl.ok, true, nl.error);
  within(nl.maxDisplacement, one.maxDisplacement, 0.04, 'nonlinear with bonded ties');
});
