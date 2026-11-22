// Explicit drop test (src/cad/fem/explicit.js): an elastic rod falling on its end against 1-D wave theory (impulse 2mv,
// contact time 2L/c, stress ρcv, restitution 1), the energy balance, Coulomb friction stopping a sliding block in v/μg,
// plastic dissipation, and an elastic floor that lengthens the impact.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dropStudy } from '../../src/cad/fem/explicit.js';
import { dropTest } from '../../src/cad/fea-sim2.js';
import { boxMesh } from './fem-shapes.js';

const within = (v, e, rel, what) => assert.ok(Math.abs(v - e) <= rel * Math.abs(e), `${what}: ${v} vs ${e} (±${rel * 100}%)`);
const ROD = { E: 200000, nu: 0, yield: 0, density: 7800, plastic: false };

test('elastic rod on a rigid floor: impulse 2mv, contact 2L/c, stress ρcv, energy conserved', () => {
  const r = dropStudy({ bodies: [{ mesh: boxMesh(10, 10, 100, 1), material: ROD }], mesh: { size: 5, order: 1 }, velocity: 1000, gravity: 0 });
  assert.equal(r.ok, true, r.error);
  const c = Math.sqrt(200000 / 7.8e-9), m = 7.8e-9 * 1e4;
  within(r.impulse, 2 * m * 1000, 0.01, 'impulse');
  within(r.contactDuration, (2 * 100) / c, 0.12, 'contact time');
  within(r.peakStress, 7.8e-9 * c * 1000, 0.15, 'impact stress');
  within(r.restitution, 1, 0.02, 'restitution');
  assert.ok(r.energy.maxImbalance < 0.01, `energy imbalance ${r.energy.maxImbalance}`);
  assert.ok(r.frames.length > 5 && r.frames[0].displacement.length === boxMesh(10, 10, 100, 1).vertices.length);
});

test('Coulomb friction: a block sliding on the floor stops after v/(μg)', () => {
  const r = dropStudy({ bodies: [{ mesh: boxMesh(10, 10, 5, 1), material: { E: 20, nu: 0.3, density: 1000, plastic: false } }], mesh: { size: 2.5, order: 1 }, velocity: 0, gravity: 9810, initialVelocity: [100, 0, 0], floor: { friction: 0.3, damping: 0.3 }, duration: 0.05, samples: 50 });
  const v = r.kinetic.map((k) => Math.sqrt((2 * k) / r.mass));
  within(r.time[v.findIndex((x) => x < 5)], 100 / (0.3 * 9810), 0.1, 'stopping time');
  assert.ok(r.energy.maxImbalance < 0.01);
});

test('plasticity dissipates the impact energy; an elastic floor lengthens the contact', () => {
  const al = { E: 70000, nu: 0.33, yield: 120, tangentModulus: 700, density: 2700 };
  const r = dropTest(boxMesh(10, 10, 40, 1), { material: al, elementSize: 3, velocity: 20000, gravity: 0 });
  assert.ok(r.restitution < 0.6, `restitution ${r.restitution}`);
  assert.ok(r.energy.plastic > 0.5 * r.energy.initialKinetic, 'most energy goes into plastic work');
  assert.ok(r.maxPlasticStrain > 0.005);
  assert.ok(r.energy.maxImbalance < 0.01);
  const rigid = dropStudy({ bodies: [{ mesh: boxMesh(10, 10, 50, 1), material: ROD }], mesh: { size: 5, order: 1 }, velocity: 1000, gravity: 0 });
  const soft = dropStudy({ bodies: [{ mesh: boxMesh(10, 10, 50, 1), material: ROD }], mesh: { size: 5, order: 1 }, velocity: 1000, gravity: 0, floor: { type: 'elastic', E: 2000, thickness: 5 } });
  assert.ok(soft.contactDuration > 1.5 * rigid.contactDuration, `${soft.contactDuration} vs ${rigid.contactDuration}`);
  assert.ok(soft.peakStress < rigid.peakStress);
});

test('meshed elastic floor slab: momentum balance, a soft slab lengthens the impact; quadratic tets match the impulse', () => {
  const rod = { E: 200000, nu: 0, yield: 0, density: 7800, plastic: false };
  const drop = (floor, order = 1) => dropStudy({ bodies: [{ mesh: boxMesh(10, 10, 50, 1), material: rod }], mesh: { size: 5, order }, velocity: 1000, gravity: 0, floor });
  const rigid = drop({}), soft = drop({ type: 'slab', E: 2000, nu: 0.3, density: 1000, thickness: 20 }), steel = drop({ type: 'slab', E: 200000, nu: 0.3, density: 7800, thickness: 20 });
  for (const r of [soft, steel]) {
    assert.equal(r.ok, true, r.error);
    assert.ok(Math.abs(r.impulse - r.momentumChange) < 0.02 * r.momentumChange, `impulse ${r.impulse} = momentum change ${r.momentumChange}`);
    assert.ok(r.energy.maxImbalance < 0.01, `energy imbalance ${r.energy.maxImbalance}`);
  }
  // A soft slab spreads the same impulse over a longer time: a much smaller contact force. (The rod's nodal peak
  // stress is no measure here: a stiff end pressed into a soft floor carries edge concentrations at its corners,
  // as a flat punch on an elastic half-space does, which depend on the mesh.)
  const peakForce = (r) => Math.max(...r.force);
  assert.ok(soft.contactDuration > 3 * rigid.contactDuration, `contact ${soft.contactDuration} s vs rigid ${rigid.contactDuration} s`);
  assert.ok(peakForce(soft) < 0.5 * peakForce(rigid), `peak force ${peakForce(soft)} N vs rigid ${peakForce(rigid)} N`);
  // A slow (quasi-static) impact is a half sine: peak = π·I / (2·T).
  within(peakForce(soft), (Math.PI * soft.impulse) / (2 * soft.contactDuration), 0.25, 'soft-slab peak force vs half sine');
  assert.ok(steel.restitution < rigid.restitution && steel.restitution > 0.8, 'a steel slab takes some energy as waves');
  const quad = drop({}, 2);
  within(quad.impulse, rigid.impulse, 0.02, 'impulse with quadratic tets');
  within(quad.restitution, 1, 0.03, 'restitution with quadratic tets');
});
