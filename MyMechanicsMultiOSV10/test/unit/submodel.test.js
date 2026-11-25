// Submodelling (fem/submodel.js): the faces of a cut-out region are matched to the part's (cut faces found), the
// global loads and fixtures carry over, and a fine submodel driven by a coarse global result finds the peak stress at
// a hole that the coarse mesh misses — with the cut faces in balance with the load and matching the global stress.
import test from 'node:test';
import assert from 'node:assert/strict';
import { linearStatic } from '../../src/cad/fem/static.js';
import { submodelStatic, mapSubFaces, carryOver } from '../../src/cad/fem/submodel.js';
import { adaptiveStatic } from '../../src/cad/fem/adaptive.js';
import { quarterPlateWithHole, boxMesh } from './fem-shapes.js';

const STEEL = { E: 210000, nu: 0.3, yield: 250 };
// The quarter plate 60 × 60 × 10 with a 10 mm hole (faces 0 x = 0, 1 y = 0, 2 x = 60, 3 y = 60, 4 hole, 100 bottom,
// 101 top), pulled along x; the submodel is its 25 × 25 corner at the hole (faces 2 and 3 there are cuts).
const part = quarterPlateWithHole(60, 60, 10, 10, 48), corner = quarterPlateWithHole(25, 25, 10, 10, 48);
const fixtures = [{ faceId: 0, type: 'roller' }, { faceId: 1, type: 'roller' }, { faceId: 100, type: 'roller' }];
const loads = [{ faceId: 2, traction: [100, 0, 0] }];
const global = { bodies: [{ mesh: part, material: STEEL }], fixtures, loads, mesh: { size: 8, order: 2 }, tol: 1e-9 };

test('faces: the corner’s faces lie on the part’s, its two inner faces are cuts; the area share is kept', () => {
  const m = mapSubFaces(part, corner);
  assert.deepEqual(m.cut.sort(), [2, 3]);
  assert.equal(m.map.get(0).faceId, 0); assert.equal(m.map.get(4).faceId, 4); assert.equal(m.map.get(101).faceId, 101);
  // Bottom: (25² − π·10²/4) / (60² − π·10²/4).
  const want = (625 - Math.PI * 25) / (3600 - Math.PI * 25);
  assert.ok(Math.abs(m.map.get(100).areaRatio - want) < 0.01, `${m.map.get(100).areaRatio} vs ${want}`);
  assert.equal(m.map.get(4).areaRatio, 1);
});

test('carry-over: fixtures follow their faces, a face force is scaled by the share, multi-face loads are flagged', () => {
  const m = mapSubFaces(part, corner);
  const c = carryOver({ fixtures, loads: [{ faceId: 100, force: [0, 0, -1000] }, { thermal: { deltaT: 10 } }, { faceId: [4], remote: { point: [0, 0, 0], force: [1, 0, 0] } }] }, m);
  assert.deepEqual(c.fixtures.map((f) => f.faceId).sort(), [0, 1, 100]);
  const f = c.loads.find((l) => l.force);
  assert.ok(f.faceId === 100 && Math.abs(f.force[2] + 1000 * m.map.get(100).areaRatio) < 1e-9);
  assert.ok(c.loads.some((l) => l.thermal));
  assert.deepEqual(c.unsupported, ['remote']);
  // Nothing of the far end's load reaches the corner.
  assert.equal(carryOver({ fixtures: [], loads }, m).loads.length, 0);
});

test('a fine corner driven by the coarse plate: the peak stress at the hole, balance and matching cut stresses', () => {
  const g = linearStatic(global);
  assert.ok(g.ok, g.error);
  const m = mapSubFaces(part, corner), c = carryOver({ fixtures, loads }, m);
  const s = submodelStatic({ bodies: [{ mesh: corner, material: STEEL }], fixtures: c.fixtures, loads: c.loads, cutFaces: m.cut, global: g, mesh: { size: 1.5, order: 2 }, tol: 1e-9 });
  assert.ok(s.ok, s.error);
  // Reference: the adaptive solution of the whole plate (converged to 0.5 % estimated error) peaks about 325 MPa.
  const ref = adaptiveStatic(global, { target: 0.005, maxPasses: 4 }).maxStress;
  assert.ok(Math.abs(s.maxStress - ref) < Math.abs(g.maxStress - ref), `global ${g.maxStress} sub ${s.maxStress} ref ${ref}`);
  assert.ok(Math.abs(s.maxStress - ref) < 0.03 * ref, `sub ${s.maxStress} ref ${ref}`);
  // No load acts on the corner itself: the force driven through the cuts is held by the symmetry rollers (balance).
  const held = [0, 1, 2].map((k) => s.reactions.slice(0, c.fixtures.length).reduce((t, r) => t + r.force[k], 0));
  const F = Math.hypot(...s.submodel.cutForce);
  assert.ok(F > 10000 && [0, 1, 2].every((k) => Math.abs(held[k] + s.submodel.cutForce[k]) < 0.01 * F), `${s.submodel.cutForce} / ${held}`);
  // On the cuts the submodel's stress is the global one (St. Venant: the cuts are away from the hole).
  assert.ok(Math.abs(s.submodel.boundary - 1) < 0.1, JSON.stringify(s.submodel));
});

test('without a global result or cut faces it says so', () => {
  assert.equal(submodelStatic({ bodies: [{ mesh: boxMesh(10, 10, 10), material: STEEL }], cutFaces: [0] }).error, 'no-global');
  assert.equal(submodelStatic({ bodies: [{ mesh: boxMesh(10, 10, 10), material: STEEL }], global: { model: {}, displacement: [] }, cutFaces: [] }).error, 'no-cut');
});
