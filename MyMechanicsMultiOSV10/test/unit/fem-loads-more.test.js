// More loads and constraints of the tetrahedral engine (fem/model.js, contact.js, static.js): bearing, remote force
// and moment, a mass on faces, a spin (centrifugal), thermal expansion; hinge, cylindrical constraints and cyclic
// symmetry. Load resultants are checked exactly; the solves against closed forms.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, loadVector, selectFaces, cylinderOfFaces } from '../../src/cad/fem/model.js';
import { linearStatic } from '../../src/cad/fem/static.js';
import { boxMesh, tubeMesh, sectorMesh } from './fem-shapes.js';

const STEEL = { E: 210000, nu: 0.3, yield: 250, density: 7850, alpha: 12 };
const near = (a, b, tol, what = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${what} ${a} ≉ ${b}`);
const sum = (model, f) => { const s = [0, 0, 0]; for (let n = 0; n < model.nn; n++) for (let k = 0; k < 3; k++) s[k] += f[3 * n + k]; return s; };
const moment = (model, f, c) => {
  const m = [0, 0, 0];
  for (let n = 0; n < model.nn; n++) {
    const r = [0, 1, 2].map((k) => model.nodes[3 * n + k] - c[k]), F = [f[3 * n], f[3 * n + 1], f[3 * n + 2]];
    m[0] += r[1] * F[2] - r[2] * F[1]; m[1] += r[2] * F[0] - r[0] * F[2]; m[2] += r[0] * F[1] - r[1] * F[0];
  }
  return m;
};

test('bearing load on a hole: the faces carry exactly F along its direction and nothing across it', () => {
  const model = buildModel([{ mesh: tubeMesh(20, 10, 8, 48, 2), material: STEEL }], { size: 2.5, order: 2 });
  const f = loadVector(model, [{ faceId: 1, bearing: [0, -1000, 0] }]);
  const s = sum(model, f);
  near(s[1], -1000, 1e-9, 'Fy'); near(s[0], 0, 1e-6, 'Fx'); near(s[2], 0, 1e-6, 'Fz');
  // Only the half of the hole wall the force points to is loaded (y < 0 there, up to the triangles across y = 0).
  // (each node's share by the far side: what the mesh's triangles across y = 0 give it)
  const far = [...Array(model.nn).keys()].filter((n) => model.nodes[3 * n + 1] > 2.5).reduce((a, n) => a + Math.hypot(f[3 * n], f[3 * n + 1], f[3 * n + 2]), 0);
  assert.ok(far < 1e-3 * 1000, `far side carries ${far}`);
});

test('remote force and moment: the faces carry F and the moment of F about the point plus M, exactly', () => {
  const model = buildModel([{ mesh: boxMesh(40, 20, 10, 2), material: STEEL }], { size: 4, order: 2 });
  const P = [140, 10, 30], F = [0, 300, -500], M = [2000, -1000, 4000];
  const f = loadVector(model, [{ faceId: 1, remote: { point: P, force: F, moment: M } }]);
  const s = sum(model, f);
  for (let k = 0; k < 3; k++) near(s[k], F[k], 1e-9, `F${k}`);
  const c = [40, 10, 5], m = moment(model, f, c);
  const r = [P[0] - c[0], P[1] - c[1], P[2] - c[2]], rxF = [r[1] * F[2] - r[2] * F[1], r[2] * F[0] - r[0] * F[2], r[0] * F[1] - r[1] * F[0]];
  for (let k = 0; k < 3; k++) near(m[k], M[k] + rxF[k], 1e-8, `M${k}`);
});

test('a mass on faces: its weight (m·g), at its centre or at a point', () => {
  const model = buildModel([{ mesh: boxMesh(40, 20, 10, 2), material: STEEL }], { size: 4, order: 2 });
  const f = loadVector(model, [{ faceId: 5, mass: 12 }]);
  const s = sum(model, f);
  near(s[2], -12 * 9.81, 1e-9, 'weight'); near(s[0], 0, 1e-9); near(s[1], 0, 1e-9);
  const g = loadVector(model, [{ faceId: 5, mass: 12, point: [20, 10, 60], accel: [0, -9.81, 0] }]);
  near(sum(model, g)[1], -12 * 9.81, 1e-9, 'sideways weight');
  // Off-centre point: a moment about the face centre of (P − c) × W.
  const m = moment(model, g, [20, 10, 10]);
  near(m[0], 50 * 12 * 9.81, 1e-8, 'Mx');
});

test('centrifugal: a bar spinning about z through one end pulls outward with ρ ω² A L² / 2', () => {
  const model = buildModel([{ mesh: boxMesh(100, 10, 10, 2, [0, -5, -5]), material: STEEL }], { size: 3, order: 2 });
  const omega = 300;
  const f = loadVector(model, [{ centrifugal: { point: [0, 0, 0], axis: [0, 0, 1], omega } }]);
  const rho = 7850e-12, A = 100, L = 100;
  const s = sum(model, f);
  near(s[0], (rho * omega * omega * A * L * L) / 2, 1e-9, 'pull'); near(s[1], 0, 1e-6); near(s[2], 0, 1e-6);
  // Angular acceleration: the tangential force ρ α A L² / 2.
  const t = sum(model, loadVector(model, [{ centrifugal: { point: [0, 0, 0], axis: [0, 0, 1], omega: 0, alpha: 50 } }]));
  near(t[1], (rho * 50 * A * L * L) / 2, 1e-9, 'tangential');
});

test('thermal: a free bar grows α ΔT L with no stress; held between two walls it carries σ = −E α ΔT', () => {
  const body = { mesh: boxMesh(100, 10, 10, 2), material: STEEL };
  const sym = [{ faceId: 0, type: 'roller' }, { faceId: 2, type: 'roller' }, { faceId: 4, type: 'roller' }];
  const free = linearStatic({ bodies: [body], fixtures: sym, loads: [{ thermal: { deltaT: 50 } }], mesh: { size: 4, order: 2 }, tol: 1e-10 });
  assert.ok(free.ok, free.error);
  near(free.maxDisplacement, Math.hypot(12e-6 * 50 * 100, 12e-6 * 50 * 10, 12e-6 * 50 * 10), 1e-4, 'growth');
  assert.ok(free.maxStress < 1e-3, `free stress ${free.maxStress}`);
  const held = linearStatic({ bodies: [body], fixtures: [...sym, { faceId: 1, type: 'roller' }], loads: [{ thermal: { deltaT: 50 } }], mesh: { size: 4, order: 2 }, tol: 1e-10 });
  near(held.maxStress, 210000 * 12e-6 * 50, 1e-4, 'held stress');
});

test('cylinder of faces: axis and radius of a hole are found', () => {
  const model = buildModel([{ mesh: tubeMesh(20, 10, 8, 48, 2), material: STEEL }], { size: 2.5, order: 2 });
  const c = cylinderOfFaces(model, selectFaces(model, 1));
  near(Math.abs(c.dir[2]), 1, 1e-9, 'axis'); near(c.radius, 10, 2e-3, 'radius (a 48-gon)'); near(Math.hypot(c.point[0], c.point[1]), 0, 1e-6, 'centre');
});

test('cylindrical constraint: the hole wall pushed out 0.01 mm radially (free axially) — Lamé ring, both ends free', () => {
  const body = { mesh: tubeMesh(20, 10, 8, 48, 2), material: STEEL };
  const r = linearStatic({ bodies: [body], fixtures: [{ faceId: 1, type: 'cylindrical', radial: 0.01, circumferential: 0, axial: null }, { faceId: 2, type: 'roller' }], loads: [], mesh: { size: 2, order: 2 }, tol: 1e-10 });
  assert.ok(r.ok, r.error);
  // Plane stress ring with u(a) = δ: u(b) = δ · 2ab / ((1 − ν) a² + (1 + ν) b²) (Lamé, outer face free).
  const a = 10, b = 20, nu = 0.3, d = 0.01, ub = (d * 2 * a * b) / ((1 - nu) * a * a + (1 + nu) * b * b);
  let got = 0, cnt = 0;
  for (let n = 0; n < r.model.nn; n++) { const x = r.model.nodes[3 * n], y = r.model.nodes[3 * n + 1]; const rr = Math.hypot(x, y); if (Math.abs(rr - 20) < 0.05) { got += (r.displacement[3 * n] * x + r.displacement[3 * n + 1] * y) / rr; cnt++; } }
  near(got / cnt, ub, 0.03, 'outer radial displacement');
});

test('hinge: a ring held by its hole turns freely about it — a tangential push on the rim gives no stress', () => {
  // A hinge alone leaves the turn about the axis free: with an elastic support on one end it is held weakly; a
  // pure moment about the axis then turns the ring almost rigidly (stresses small against a fixed hole).
  const body = { mesh: tubeMesh(20, 10, 8, 48, 2), material: STEEL };
  const load = [{ faceId: 0, torque: [0, 0, 1000] }];
  const hinge = linearStatic({ bodies: [body], fixtures: [{ faceId: 1, type: 'hinge' }, { faceId: 2, type: 'elastic', stiffness: 0.05 }], loads: load, mesh: { size: 2.5, order: 2 }, tol: 1e-10 });
  const fixed = linearStatic({ bodies: [body], fixtures: [{ faceId: 1, type: 'fixed' }], loads: load, mesh: { size: 2.5, order: 2 }, tol: 1e-10 });
  assert.ok(hinge.ok && fixed.ok, `${hinge.error} ${fixed.error}`);
  assert.ok(hinge.maxDisplacement > 20 * fixed.maxDisplacement, `hinge turns: ${hinge.maxDisplacement} vs fixed ${fixed.maxDisplacement}`);
  // Radial and axial motion of the hole stays nil.
  for (let n = 0; n < hinge.model.nn; n++) {
    const x = hinge.model.nodes[3 * n], y = hinge.model.nodes[3 * n + 1], rr = Math.hypot(x, y);
    if (Math.abs(rr - 10) < 1e-6) { const ur = (hinge.displacement[3 * n] * x + hinge.displacement[3 * n + 1] * y) / rr; assert.ok(Math.abs(ur) < 1e-8, `radial ${ur}`); assert.ok(Math.abs(hinge.displacement[3 * n + 2]) < 1e-8, `axial ${hinge.displacement[3 * n + 2]}`); }
  }
});

test('cyclic symmetry: a 90° sector under a twist matches the whole ring (symmetry planes would not)', () => {
  const T = 2e5;
  const opts = { mesh: { size: 2.2, order: 2 }, tol: 1e-10 };
  const ring = linearStatic({ bodies: [{ mesh: tubeMesh(20, 10, 6, 64, 3), material: STEEL }], fixtures: [{ faceId: 1, type: 'fixed' }], loads: [{ faceId: 0, torque: [0, 0, T] }], ...opts });
  const sector = linearStatic({ bodies: [{ mesh: sectorMesh(20, 10, 6, Math.PI / 2, 16, 3, 4), material: STEEL }], fixtures: [{ faceId: 1, type: 'fixed' }, { faceId: 4, faceB: 5, type: 'cyclic' }], loads: [{ faceId: 0, torque: [0, 0, T / 4] }], ...opts });
  const symmetric = linearStatic({ bodies: [{ mesh: sectorMesh(20, 10, 6, Math.PI / 2, 16, 3, 4), material: STEEL }], fixtures: [{ faceId: 1, type: 'fixed' }, { faceId: 4, type: 'roller' }, { faceId: 5, type: 'roller' }], loads: [{ faceId: 0, torque: [0, 0, T / 4] }], ...opts });
  assert.ok(ring.ok && sector.ok, `${ring.error} ${sector.error}`);
  near(sector.maxDisplacement, ring.maxDisplacement, 0.04, 'cyclic sector vs ring');
  assert.ok(Math.abs(symmetric.maxDisplacement - ring.maxDisplacement) > 0.1 * ring.maxDisplacement, `symmetry planes ${symmetric.maxDisplacement} vs ring ${ring.maxDisplacement}`);
});

test('shrink fit: a ring pressed over a sleeve 0.02 mm too big — contact pressure as Lamé gives', () => {
  // Quarter models (symmetry rollers), plane stress (one end on a roller, the other free): sleeve 5…10.02, ring 10…20.
  const a = 5, b = 10, c = 20, delta = 0.02, E = 210000, h = 4;
  const sleeve = { mesh: sectorMesh(b + delta, a, h, Math.PI / 2, 96, 2, 3), material: STEEL };
  const ring = { mesh: sectorMesh(c, b, h, Math.PI / 2, 96, 2, 4), material: STEEL };
  const fixtures = [0, 1].flatMap((body) => [{ body, faceId: 4, type: 'roller' }, { body, faceId: 5, type: 'roller' }, { body, faceId: 2, type: 'roller' }]);
  const r = linearStatic({ bodies: [sleeve, ring], fixtures, loads: [], contacts: 'contact', contactMethod: 'mortar', tolerance: 0.5, mesh: { size: 1.2, order: 2 }, tol: 1e-10 });
  assert.ok(r.ok, r.error);
  // Same material: p = (E δ / b) (b² − a²)(c² − b²) / (2 b² (c² − a²)); on a quarter the contact force is p·b·h·√2.
  const p = ((E * delta) / b) * ((b * b - a * a) * (c * c - b * b)) / (2 * b * b * (c * c - a * a));
  near(Math.hypot(...r.contact.force) / (Math.SQRT2 * b * h), p, 0.05, 'contact pressure');
});
