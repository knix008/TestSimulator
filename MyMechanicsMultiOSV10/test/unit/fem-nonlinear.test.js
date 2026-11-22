// Nonlinear statics (src/cad/fem/nonlinear.js): the J2 return mapping and its consistent tangent, cyclic plasticity of
// a bar against the 1-D bilinear model (Bauschinger effect with kinematic hardening, growing yield surface with
// isotropic hardening), quadratic Newton convergence, the elastica of a cantilever (large displacements), and the
// arc-length method passing the limit load of an elastic–perfectly plastic cantilever.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nonlinearStudy, j2Update } from '../../src/cad/fem/nonlinear.js';
import { lame } from '../../src/cad/fem/elements.js';
import { boxMesh } from './fem-shapes.js';

const within = (v, e, rel, what) => assert.ok(Math.abs(v - e) <= rel * Math.abs(e), `${what}: ${v} vs ${e} (±${rel * 100}%)`);

test('J2 return mapping: stress on the yield surface and the consistent tangent equals the finite-difference one', () => {
  const mat = { ...lame(200000, 0.3), yield: 250, isotropic: 3000, kinematic: 7000, plastic: true };
  const st = { ep: [0, 0, 0, 0, 0, 0], alpha: [0, 0, 0, 0, 0, 0], eqp: 0 };
  const E = [0.004, -0.001, 0.0005, 0.002, -0.001, 0.0015];
  const out = { S: new Float64Array(6), D: new Float64Array(36) };
  j2Update(E, st, mat, out);
  assert.equal(out.yielded, true);
  const S = Array.from(out.S), p = (S[0] + S[1] + S[2]) / 3, xi = [S[0] - p, S[1] - p, S[2] - p, S[3], S[4], S[5]].map((x, i) => x - out.alpha[i]);
  const nx = Math.sqrt(xi[0] ** 2 + xi[1] ** 2 + xi[2] ** 2 + 2 * (xi[3] ** 2 + xi[4] ** 2 + xi[5] ** 2));
  within(nx, Math.sqrt(2 / 3) * (250 + 3000 * out.eqp), 1e-9, 'on the yield surface');
  const D = Array.from(out.D), h = 1e-8;
  for (let j = 0; j < 6; j++) {
    const Ep = E.slice(); Ep[j] += h; const o2 = { S: new Float64Array(6), D: new Float64Array(36) }; j2Update(Ep, st, mat, o2);
    for (let i = 0; i < 6; i++) assert.ok(Math.abs((o2.S[i] - S[i]) / h - D[i * 6 + j]) < 1e-3 * 200000, `C[${i}][${j}]`);
  }
});

function cyclicBar(material, history) {
  const L = 20, amp = 0.1;
  const r = nonlinearStudy({
    bodies: [{ mesh: boxMesh(L, 2, 2, 1), material }],
    fixtures: [{ faceId: 0, type: 'displacement', value: [0, null, null] }, { faceId: 2, type: 'roller' }, { faceId: 4, type: 'roller' }, { faceId: 1, type: 'displacement', value: [amp, null, null] }],
    mesh: { size: 2 }, geometric: false, history, steps: 8, track: { fixture: 3 },
  });
  // The 1-D bilinear model with the same hardening.
  const { E, yield: sy, isotropic: Hi = 0, kinematic: Hk = 0 } = material;
  let ep = 0, al = 0, eq = 0, err = 0;
  for (const c of r.curve) {
    const eps = (c.factor * amp) / L, st = E * (eps - ep), xi = st - al, f = Math.abs(xi) - (sy + Hi * eq);
    if (f > 0) { const dg = f / (E + Hk + Hi), s = Math.sign(xi); ep += dg * s; al += Hk * dg * s; eq += dg; }
    err = Math.max(err, Math.abs(c.reaction[0] / 4 - E * (eps - ep)));
  }
  return { r, err };
}

test('cyclic loading of a bar, kinematic hardening: the FE hysteresis loop is the bilinear 1-D loop (Bauschinger)', () => {
  const { r, err } = cyclicBar({ E: 200000, nu: 0.3, yield: 250, isotropic: 0, kinematic: 10000 }, [0, 1, -1, 1]);
  assert.equal(r.ok, true, r.error);
  assert.ok(err < 1e-3, `max stress error ${err} MPa`);
  const at = (k) => r.curve[k].reaction[0] / 4;
  within(at(8), 250 + (200000 * 10000) / 210000 * (0.005 - 0.00125), 1e-6, 'peak stress');
  within(at(10), at(8) - 200000 * 0.0025, 1e-6, 'elastic unloading to the reversed yield point σmax − 2σy');
  // Dissipated energy of the stable loop > 0 (area by the trapezoid rule over the last full cycle).
  let area = 0; for (let k = 9; k < r.curve.length; k++) area += 0.5 * (at(k) + at(k - 1)) * ((r.curve[k].factor - r.curve[k - 1].factor) * 0.1 / 20);
  assert.ok(Math.abs(area) > 0.5, `loop area ${area} MJ/m³`);
});

test('cyclic loading, isotropic hardening: the yield surface grows (reverse yield at −(σy + K′ε̄p))', () => {
  const { r, err } = cyclicBar({ E: 200000, nu: 0.3, yield: 250, isotropic: 10000, kinematic: 0 }, [0, 1, -1]);
  assert.equal(r.ok, true, r.error);
  assert.ok(err < 1e-3, `max stress error ${err} MPa`);
});

test('Newton with the consistent tangent converges quadratically in a plastic cantilever', () => {
  const r = nonlinearStudy({ bodies: [{ mesh: boxMesh(100, 10, 10, 1), material: { E: 200000, nu: 0.3, yield: 250, isotropic: 2000, kinematic: 8000 } }], fixtures: [0], loads: [{ faceId: 1, force: [0, 0, -560] }], mesh: { size: 5 }, geometric: true, steps: 4 });
  assert.equal(r.ok, true, r.error);
  assert.ok(r.yieldedElements > 0);
  for (const c of r.convergence) {
    const res = c.residuals;
    assert.ok(res.length <= 7, `iterations at λ ${c.factor}: ${res.length}`);
    // The last steps: r_{k+1} ≤ C r_k² (quadratic), checked as log ratios once the residual is small.
    for (let k = 1; k < res.length; k++) if (res[k - 1] < 1e-2 && res[k] > 1e-13) assert.ok(Math.log10(res[k]) <= 1.6 * Math.log10(res[k - 1]), `quadratic at λ ${c.factor}: ${res.join(', ')}`);
  }
});

test('large displacements: the elastica of a cantilever, PL²/EI = 1 → v/L = 0.3017 (linear theory 1/3)', () => {
  const L = 100, b = 2, E = 200000, I = b ** 4 / 12, P = (E * I) / (L * L);
  const r = nonlinearStudy({ bodies: [{ mesh: boxMesh(L, b, b, 1), material: { E, nu: 0.3, plastic: false } }], fixtures: [0], loads: [{ faceId: 1, force: [0, 0, -P] }], mesh: { size: 2 }, geometric: true, steps: 5 });
  assert.equal(r.ok, true, r.error);
  const m = r.model; let v = 0, n = 0;
  for (let i = 0; i < m.nn; i++) if (Math.abs(m.nodes[3 * i] - L) < 1e-6) { v -= r.displacement[3 * i + 2]; n++; }
  within(v / n / L, 0.3017, 0.02, 'tip deflection / L');
});

test('arc length passes the limit load of an elastic–perfectly plastic cantilever; load control fails above it', () => {
  const mat = { E: 200000, nu: 0.3, yield: 250, isotropic: 0, kinematic: 0 };
  const base = { bodies: [{ mesh: boxMesh(100, 10, 10, 1), material: mat }], fixtures: [0], loads: [{ faceId: 1, force: [0, 0, -1000] }], mesh: { size: 5 }, geometric: false };
  const r = nonlinearStudy({ ...base, arcLength: { length: 0.3, maxSteps: 9, target: 1 } });
  const loads = r.curve.map((c) => c.factor * 1000), disp = r.curve.map((c) => c.maxDisplacement);
  const limit = Math.max(...loads);
  assert.ok(limit > 625 && limit < 760, `plateau ${limit} N (beam theory σy·bh²/4L = 625 N)`);
  assert.ok(disp.at(-1) > 3 * disp[2], 'deforms on along the plateau');
  assert.ok(loads.at(-1) - loads.at(-3) < 0.02 * limit, 'flat plateau');
  const lc = nonlinearStudy({ ...base, steps: 4, maxNewton: 8 });
  assert.equal(lc.ok, false, 'load control cannot reach 1000 N');
});
