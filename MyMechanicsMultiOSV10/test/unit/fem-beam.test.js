// Frame (beam element) analysis of structural members (cad/fem/beam.js) against closed forms: section properties,
// a cantilever's tip deflection and root stress, a simply supported beam under its own weight, a pipe's twist, members
// split where another member's end lies on them, and a portal frame's sway.
import test from 'node:test';
import assert from 'node:assert/strict';
import { profileLoops, sectionProperties, frameModel, frameStudy } from '../../src/cad/fem/beam.js';

const STEEL = { E: 210000, nu: 0.3, density: 7850, yield: 250 };
const near = (a, b, tol, what = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${what} ${a} ≉ ${b}`);
const sec = (kind, w, h, t) => { const p = profileLoops(kind, w, h, t); return sectionProperties(p.loops, p.torsion); };

test('sections: rectangle tube, pipe, I-beam and angle', () => {
  const r = sec('rectTube', 40, 80, 4);
  near(r.A, 40 * 80 - 32 * 72, 1e-12, 'A');
  near(r.Iu, (40 * 80 ** 3 - 32 * 72 ** 3) / 12, 1e-12, 'Iu');
  near(r.Iv, (80 * 40 ** 3 - 72 * 32 ** 3) / 12, 1e-12, 'Iv');
  near(r.J, (4 * (36 * 76) ** 2 * 4) / (2 * 36 + 2 * 76), 1e-12, 'J (Bredt)');
  const p = sec('pipe', 60, 60, 5);
  near(p.A, Math.PI * (30 ** 2 - 25 ** 2), 1e-12); near(p.J, (Math.PI * (60 ** 4 - 50 ** 4)) / 32, 1e-12, 'pipe J');
  const i = sec('ibeam', 100, 200, 6);
  const tf = 9; near(i.Iu, (100 * 200 ** 3 - (100 - 6) * (200 - 2 * tf) ** 3) / 12, 1e-12, 'I-beam strong axis');
  near(i.cu, 0, 1e-12); near(i.cv, 0, 1e-12);
  // An angle: the centroid off the corner, the product of inertia not zero, principal axes at 45° for equal legs.
  const a = sec('angle', 50, 50, 5);
  near(a.cu, a.cv, 1e-12); assert.ok(a.Iuv < 0); near(Math.abs(a.angle), Math.PI / 4, 1e-9, 'principal angle');
});

test('cantilever: tip load deflects P L³ / 3 E I, the root stresses M c / I', () => {
  const s = sec('squareBar', 20);
  const r = frameStudy({ members: [{ a: [0, 0, 0], b: [1000, 0, 0], u: [0, 1, 0], section: s, material: STEEL }], supports: [{ point: [0, 0, 0], dofs: 'fixed' }], loads: [{ point: [1000, 0, 0], force: [0, -100, 0] }] });
  assert.ok(r.ok, r.error);
  const I = 20 ** 4 / 12;
  near(r.displacement[1][1], -(100 * 1000 ** 3) / (3 * STEEL.E * I), 1e-9, 'tip');
  near(r.maxStress, (100 * 1000 * 10) / I, 1e-9, 'root stress');
  near(r.reactions[0].force[1], 100, 1e-9); near(Math.abs(r.reactions[0].moment[2]), 100 * 1000, 1e-9);
  // The same load along z (the section's v): the other bending plane.
  const z = frameStudy({ members: [{ a: [0, 0, 0], b: [1000, 0, 0], u: [0, 1, 0], section: sec('rectTube', 40, 80, 4), material: STEEL }], supports: [{ point: [0, 0, 0], dofs: 'fixed' }], loads: [{ point: [1000, 0, 0], force: [0, 0, -100] }] });
  near(z.displacement[1][2], -(100 * 1000 ** 3) / (3 * STEEL.E * sec('rectTube', 40, 80, 4).Iu), 1e-9, 'tip along v');
});

test('simply supported beam under its own weight: midspan 5 q L⁴ / 384 E I (one element, exact)', () => {
  const s = sec('squareTube', 50, 50, 3);
  const L = 3000, q = 7850e-9 * s.A * 9.81;
  const r = frameStudy({ members: [{ a: [0, 0, 0], b: [L, 0, 0], u: [0, 1, 0], section: s, material: STEEL }], supports: [{ point: [0, 0, 0], dofs: [0, 1, 2, 3] }, { point: [L, 0, 0], dofs: [1, 2] }], gravity: [0, 0, -9.81] });
  assert.ok(r.ok, r.error);
  const mid = r.results[0].samples[5];
  near(mid.disp[2], -(5 * q * L ** 4) / (384 * STEEL.E * s.Iu), 1e-9, 'midspan');
  near(Math.abs(mid.My), (q * L * L) / 8, 1e-9, 'midspan moment');
  near(r.reactions.reduce((sum, x) => sum + x.force[2], 0), q * L, 1e-9, 'reactions carry the weight');
});

test('pipe in torsion: twist T L / G J', () => {
  const s = sec('pipe', 60, 60, 5), L = 2000, T = 5e5;
  const r = frameStudy({ members: [{ a: [0, 0, 0], b: [0, 0, L], u: [1, 0, 0], section: s, material: STEEL }], supports: [{ point: [0, 0, 0], dofs: 'fixed' }], loads: [{ point: [0, 0, L], moment: [0, 0, T] }] });
  const G = STEEL.E / 2.6;
  near(r.rotation[1][2], (T * L) / (G * s.J), 1e-9, 'twist');
});

test('a member ending on another’s span splits it there; collinear pieces give the same answer as one member', () => {
  const s = sec('squareBar', 30);
  const m = frameModel([{ a: [0, 0, 0], b: [2000, 0, 0] }, { a: [800, 0, 0], b: [800, 0, 900] }]);
  assert.equal(m.joints.length, 4); assert.equal(m.elements.length, 3);
  const one = frameStudy({ members: [{ a: [0, 0, 0], b: [2000, 0, 0], u: [0, 1, 0], section: s, material: STEEL }], supports: [{ point: [0, 0, 0], dofs: 'fixed' }], loads: [{ point: [2000, 0, 0], force: [0, 0, -50] }] });
  const two = frameStudy({ members: [{ a: [0, 0, 0], b: [700, 0, 0], u: [0, 1, 0], section: s, material: STEEL }, { a: [700, 0, 0], b: [2000, 0, 0], u: [0, 1, 0], section: s, material: STEEL }], supports: [{ point: [0, 0, 0], dofs: 'fixed' }], loads: [{ point: [2000, 0, 0], force: [0, 0, -50] }] });
  near(two.maxDisplacement, one.maxDisplacement, 1e-9); near(two.maxStress, one.maxStress, 1e-9);
});

test('portal frame with fixed feet: sway under a side load as the stiffness method gives (columns and beam alike)', () => {
  // Columns h, beam span b, all the same EI; fixed feet; H at the top: sway Δ = H h³ (2k + 1) / (12 E I · 2k)… for a
  // rigid beam (k → ∞) Δ = H h³ / (24 E I). With a very stiff beam the result tends to it.
  const col = sec('squareBar', 40), beam = sec('squareBar', 400), h = 1000, b = 2000, H = 1000;
  const r = frameStudy({
    members: [{ a: [0, 0, 0], b: [0, 0, h], u: [0, 1, 0], section: col, material: STEEL }, { a: [b, 0, 0], b: [b, 0, h], u: [0, 1, 0], section: col, material: STEEL }, { a: [0, 0, h], b: [b, 0, h], u: [0, 1, 0], section: beam, material: STEEL }],
    supports: [{ point: [0, 0, 0], dofs: 'fixed' }, { point: [b, 0, 0], dofs: 'fixed' }], loads: [{ point: [0, 0, h], force: [H, 0, 0] }],
  });
  const I = 40 ** 4 / 12;
  near(r.displacement[1][0], (H * h ** 3) / (24 * STEEL.E * I), 0.01, 'sway');
  assert.ok(r.minFactorOfSafety > 0 && Number.isFinite(r.minFactorOfSafety));
});

test('members meeting at their faces (centre lines apart) are tied by rigid links within the sections’ reach', () => {
  // Two 40 mm square-tube legs and a rail between their faces (its ends 20 mm short of the legs' centre lines).
  const s = sec('squareTube', 40, 40, 3), u = [0, 1, 0];
  const members = [{ a: [0, 0, 0], b: [0, 0, 500], u, section: s, material: STEEL }, { a: [600, 0, 0], b: [600, 0, 500], u, section: s, material: STEEL }, { a: [20, 0, 400], b: [580, 0, 400], u, section: s, material: STEEL }];
  const m = frameModel(members);
  assert.equal(m.elements.filter((e) => e.link).length, 2);
  const r = frameStudy({ members, supports: [{ point: [0, 0, 0], dofs: 'fixed' }, { point: [600, 0, 0], dofs: 'fixed' }], gravity: [0, 0, -9.81] });
  assert.ok(r.ok, r.error);
  // The weight of the three members (not of the links) goes down both legs alike.
  const W = 7850e-9 * s.A * 9.81 * (500 + 500 + 560);
  near(r.reactions[0].force[2] + r.reactions[1].force[2], W, 1e-9, 'total');
  near(r.reactions[0].force[2], r.reactions[1].force[2], 1e-6, 'symmetric');
  assert.equal(r.results.length, 5); // two legs split at the rail, the rail; no link results
});
