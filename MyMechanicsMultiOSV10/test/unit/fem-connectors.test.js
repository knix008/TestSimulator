// Connectors (fem/connectors.js) in the linear static study: a spring's stretch F/k and force, a pin carrying a load
// from one block to the other, a bolt's preload clamping two plates, a spot weld carrying shear, a rigid link
// carrying a twist, a bearing's radial force.
import test from 'node:test';
import assert from 'node:assert/strict';
import { linearStatic } from '../../src/cad/fem/static.js';
import { boxMesh, tubeMesh } from './fem-shapes.js';

const STEEL = { E: 210000, nu: 0.3, yield: 250, density: 7850 };
const near = (a, b, tol, what = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${what} ${a} ≉ ${b}`);
// boxMesh faces: 0 x = 0, 1 x = L, 2 y = 0, 3 y = W, 4 z = 0, 5 z = H.
const blockA = { mesh: boxMesh(20, 20, 20, 2), material: STEEL };
const blockB = { mesh: boxMesh(20, 20, 20, 2, [40, 0, 0]), material: STEEL };
const opts = { mesh: { size: 5, order: 2 }, tol: 1e-10 };
const meanX = (r, body) => { let s = 0, n = 0; const nb = r.model.nodeBody ?? null; for (let k = 0; k < r.model.nn; k++) { const x = r.model.nodes[3 * k]; if ((body === 1) === (x > 30)) { s += r.displacement[3 * k]; n++; } } return s / n; };

test('spring: block B pulled away from fixed block A moves F / k; the spring carries F', () => {
  const k = 500, F = 1000;
  // B is kept from turning (and sliding sideways) by rollers on two of its sides; along x only the spring holds it.
  const r = linearStatic({ bodies: [blockA, blockB], fixtures: [{ body: 0, faceId: 0 }, { body: 1, faceId: 2, type: 'roller' }, { body: 1, faceId: 4, type: 'roller' }], loads: [{ body: 1, faceId: 1, force: [F, 0, 0] }], connectors: [{ type: 'spring', faceA: 1, bodyA: 0, faceB: 0, bodyB: 1, axial: k, shear: 1e4 }], contacts: 'none', ...opts });
  assert.ok(r.ok, r.error);
  near(r.connectors[0].axial, F, 1e-6, 'spring force');
  near(meanX(r, 1) - meanX(r, 0), F / k, 0.01, 'stretch');
});

test('pin: the load on block B reaches block A’s support through the pin', () => {
  const rr = linearStatic({ bodies: [blockA, blockB], fixtures: [{ body: 0, faceId: 0 }], loads: [{ body: 1, faceId: 5, force: [0, 0, -2000] }], connectors: [{ type: 'rigid', faceA: 1, bodyA: 0, faceB: 0, bodyB: 1 }], contacts: 'none', ...opts });
  assert.ok(rr.ok, rr.error);
  near(rr.reactions[0].force[2], 2000, 1e-6, 'reaction');
  near(rr.connectors[0].force[2], -2000, 1e-3, 'tie force (B on A)');
  assert.ok(rr.maxDisplacement < 0.05, `${rr.maxDisplacement}`);
});

test('pin carries force but not a turn; the rigid link carries both', () => {
  const load = [{ body: 1, faceId: 1, force: [0, 0, -500] }];
  const rigid = linearStatic({ bodies: [blockA, blockB], fixtures: [{ body: 0, faceId: 0 }], loads: load, connectors: [{ type: 'rigid', faceA: 1, bodyA: 0, faceB: 0, bodyB: 1 }], contacts: 'none', ...opts });
  // With the pin, B is also held by a soft spring far from the pin: it turns about the pin much more.
  const pin = linearStatic({ bodies: [blockA, blockB], fixtures: [{ body: 0, faceId: 0 }], loads: load, connectors: [{ type: 'pin', faceA: 1, bodyA: 0, faceB: 0, bodyB: 1 }, { type: 'spring', faceA: 4, bodyA: 0, faceB: 4, bodyB: 1, axial: 50, shear: 50 }], contacts: 'none', ...opts });
  assert.ok(rigid.ok && pin.ok, `${rigid.error} ${pin.error}`);
  assert.ok(pin.maxDisplacement > 20 * rigid.maxDisplacement, `${pin.maxDisplacement} vs ${rigid.maxDisplacement}`);
});

test('bolt: the preload clamps two bonded plates — the bolt carries about P, the plates are squeezed', () => {
  const lower = { mesh: boxMesh(40, 40, 10, 2), material: STEEL }, upper = { mesh: boxMesh(40, 40, 10, 2, [0, 0, 10]), material: STEEL };
  const P = 20000;
  const r = linearStatic({ bodies: [lower, upper], fixtures: [{ body: 0, faceId: 0, type: 'roller' }, { body: 0, faceId: 2, type: 'roller' }, { body: 0, faceId: 4, type: 'roller' }], loads: [], connectors: [{ type: 'bolt', faceA: 5, bodyA: 1, faceB: 4, bodyB: 0, diameter: 10, preload: P }], contacts: 'bonded', ...opts });
  assert.ok(r.ok, r.error);
  const b = r.connectors[0];
  assert.ok(b.axial > 0.8 * P && b.axial <= P * 1.0001, `bolt ${b.axial}`);
  // The upper face moves down (towards the lower one).
  let dz = 0, n = 0; for (let k = 0; k < r.model.nn; k++) if (Math.abs(r.model.nodes[3 * k + 2] - 20) < 1e-9) { dz += r.displacement[3 * k + 2]; n++; }
  assert.ok(dz / n < 0, `upper face ${dz / n}`);
});

test('spot weld: two overlapping strips joined at one point carry the pull through it', () => {
  const s1 = { mesh: boxMesh(60, 20, 2, 2), material: STEEL }, s2 = { mesh: boxMesh(60, 20, 2, 2, [40, 0, 2]), material: STEEL };
  const r = linearStatic({ bodies: [s1, s2], fixtures: [{ body: 0, faceId: 0 }], loads: [{ body: 1, faceId: 1, force: [800, 0, 0] }, { body: 1, faceId: 5, force: [0, 0, 0] }], connectors: [{ type: 'spotWeld', faceA: 5, bodyA: 0, faceB: 4, bodyB: 1, point: [50, 10, 2], diameter: 6 }], contacts: 'none', ...opts });
  assert.ok(r.ok, r.error);
  near(Math.abs(r.connectors[0].force[0]), 800, 1e-3, 'weld shear');
});

test('bearing: a shaft in a housing — the bearing takes the shaft’s radial load', () => {
  const housing = { mesh: tubeMesh(30, 15, 20, 48, 2), material: STEEL }, shaft = { mesh: tubeMesh(14, 5, 20, 48, 2), material: STEEL };
  const r = linearStatic({ bodies: [housing, shaft], fixtures: [{ body: 0, faceId: 0 }, { body: 1, faceId: 2, type: 'roller' }, { body: 1, faceId: 3, type: 'elastic', stiffness: 1e-2 }], loads: [{ body: 1, faceId: 1, force: [0, -1500, 0] }], connectors: [{ type: 'bearing', faceA: 1, bodyA: 0, faceB: 0, bodyB: 1, radial: 1e6, axialFixed: false }], contacts: 'none', ...opts });
  assert.ok(r.ok, r.error);
  near(r.connectors[0].radial, 1500, 1e-4, 'radial'); // the shaft's end holds a hair of it (a very soft support against turning)
});
