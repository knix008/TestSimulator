// The later simulation studies (src/cad/fea-sim2.js) against textbook cases: a cantilever's large deflection
// (the elastica), a bar loaded past yield (bilinear material), a bar dropped on a rigid floor (1-D wave
// theory: impulse 2mv, contact time 2L/c, stress ρcv), combination of load cases (linearity), and
// lattice-Boltzmann flow (plane Poiseuille profile, drag coefficient falling with Reynolds number).
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyse } from '../../src/cad/fea.js';
import { nonlinearStatic, polarRotation, dropTest, combineResults, combinationStudy, flowLattice, flowField, flowSection, streamlines, velocityAt } from '../../src/cad/fea-sim2.js';

const within = (value, expected, rel, what) => assert.ok(Math.abs(value - expected) <= rel * Math.abs(expected), `${what}: ${value} vs ${expected} (±${rel * 100}%)`);

/** Box [0,L]×[0,W]×[0,H] like body.mesh() (faces 0 x=0, 1 x=L, 2 y=0, 3 y=W, 4 z=0, 5 z=H), offset by `at`. */
function boxMesh(L, W, H, div = 2, at = [0, 0, 0], firstFace = 0) {
  const vertices = [], triangles = [], faceGroups = [];
  const faces = [
    [[0, 0, 0], [0, 0, H], [0, W, 0]], [[L, 0, 0], [0, W, 0], [0, 0, H]],
    [[0, 0, 0], [L, 0, 0], [0, 0, H]], [[0, W, 0], [0, 0, H], [L, 0, 0]],
    [[0, 0, 0], [0, W, 0], [L, 0, 0]], [[0, 0, H], [L, 0, 0], [0, W, 0]],
  ];
  faces.forEach(([org, a, b], f) => {
    const base = vertices.length / 3, start = triangles.length;
    for (let j = 0; j <= div; j++) for (let i = 0; i <= div; i++) vertices.push(...org.map((o, c) => at[c] + o + (a[c] * i) / div + (b[c] * j) / div));
    for (let j = 0; j < div; j++) for (let i = 0; i < div; i++) { const p = base + j * (div + 1) + i; triangles.push(p, p + 1, p + div + 2, p, p + div + 2, p + div + 1); }
    faceGroups.push({ start, count: triangles.length - start, faceId: firstFace + f });
  });
  return { vertices: Float32Array.from(vertices), triangles: Uint32Array.from(triangles), faceGroups };
}

/** Tip deflection v/L of the elastica θ'' = −k cos θ, θ(0) = 0, θ'(1) = 0 (k = PL²/EI), by shooting. */
function elastica(k) {
  const run = (a) => {
    const n = 2000, ds = 1 / n;
    let th = 0, w = a, v = 0;
    const f = (t) => -k * Math.cos(t);
    for (let i = 0; i < n; i++) {
      const k1t = w, k1w = f(th), k2t = w + 0.5 * ds * k1w, k2w = f(th + 0.5 * ds * k1t), k3t = w + 0.5 * ds * k2w, k3w = f(th + 0.5 * ds * k2t), k4t = w + ds * k3w, k4w = f(th + ds * k3t);
      const th1 = th + (ds / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
      v += ds * 0.5 * (Math.sin(th) + Math.sin(th1));
      w += (ds / 6) * (k1w + 2 * k2w + 2 * k3w + k4w); th = th1;
    }
    return { end: w, v };
  };
  let lo = 0, hi = k;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (run(mid).end > 0) hi = mid; else lo = mid; }
  return run((lo + hi) / 2).v;
}

test('elastica reference: k = 1 gives v/L = 0.3017 (Bisshopp–Drucker)', () => {
  within(elastica(1), 0.30172, 0.002, 'v/L');
  within(elastica(2), 0.49346, 0.002, 'v/L');
});

test('polar rotation of a rotated stretch is the rotation', () => {
  const c = Math.cos(0.7), s = Math.sin(0.7);
  const R = [c, -s, 0, s, c, 0, 0, 0, 1], U = [1.1, 0.05, 0, 0.05, 0.95, 0, 0, 0, 1.02];
  const F = Array.from({ length: 9 }, (_, k) => { const i = Math.floor(k / 3), j = k % 3; let t = 0; for (let m = 0; m < 3; m++) t += R[3 * i + m] * U[3 * m + j]; return t; });
  polarRotation(F).forEach((v, k) => assert.ok(Math.abs(v - R[k]) < 1e-9, `${k}`));
});

const STEEL = { E: 210000, nu: 0.3, yield: 250, density: 7850 };

test('nonlinear static: cantilever large deflection follows the elastica, stiffer than linear', () => {
  const mesh = boxMesh(100, 10, 10, 2);
  const EI = (210000 * 10 ** 4) / 12, L = 100;
  const material = { ...STEEL, plastic: false };
  const tipLin = (r) => { let m = 0; for (let n = 0; n < r.nodes.length / 3; n++) if (r.nodes[3 * n] > L - 1e-6) m = Math.max(m, -r.displacement[3 * n + 2]); return m; };
  const ratios = [];
  for (const [k, resolution, steps] of [[1, 40, 6], [2.5, 30, 10]]) {
    // The voxel model's own linear stiffness (bending + shear, coarse hexahedra) sets the effective k.
    const lin = analyse(mesh, { material, fixtures: [0], loads: [{ faceId: 1, force: [0, 0, -1] }], resolution });
    const stiff = tipLin(lin) / (L ** 3 / (3 * EI));   // < 1: the voxel cantilever is a bit stiffer than Euler–Bernoulli
    assert.ok(stiff > 0.6 && stiff < 1.2, `voxel/beam ${stiff}`);
    const P = (k * EI) / L ** 2;
    const t0 = performance.now();
    const r = nonlinearStatic(mesh, { material, fixtures: [0], loads: [{ faceId: 1, force: [0, 0, -P] }], resolution, steps });
    assert.equal(r.ok, true, r.error);
    assert.ok(performance.now() - t0 < 20000, 'time');
    const v = tipLin(r) / L;
    const expected = elastica(k * stiff);
    const linear = (k / 3) * stiff;
    within(v, expected, 0.06, `tip v/L at k=${k}`);
    assert.ok(v < linear * 0.97, `stiffening at k=${k}: ${v} vs linear ${linear}`);
    ratios.push(v / linear);
    assert.equal(r.curve.length, steps);
    assert.ok(r.curve.every((c, i) => i === 0 || c.maxDisplacement > r.curve[i - 1].maxDisplacement), 'monotonic load–displacement curve');
  }
  assert.ok(ratios[1] < ratios[0], `ratio falls with load: ${ratios}`);
});

test('nonlinear static: bar in tension past yield follows the bilinear curve', () => {
  const mesh = boxMesh(100, 10, 10, 3);
  const material = { E: 200000, nu: 0, yield: 250, tangentModulus: 20000 };
  const tip = (r) => { let s = 0, c = 0; for (let n = 0; n < r.nodes.length / 3; n++) if (r.nodes[3 * n] > 100 - 1e-6) { s += r.displacement[3 * n]; c++; } return s / c; };
  // Elastic: 200 MPa → ε = 0.001 → 0.1 mm.
  const el = nonlinearStatic(mesh, { material, fixtures: [0], loads: [{ faceId: 1, pressure: -200 }], resolution: 20, steps: 2, geometric: false });
  assert.equal(el.ok, true, el.error);
  within(tip(el), 0.1, 0.04, 'elastic elongation');
  assert.equal(el.yieldedElements, 0);
  // Plastic: 300 MPa → ε = 250/200000 + 50/20000 = 0.00375 → 0.375 mm.
  const pl = nonlinearStatic(mesh, { material, fixtures: [0], loads: [{ faceId: 1, pressure: -300 }], resolution: 20, steps: 4, geometric: false, maxNewton: 30 });
  assert.equal(pl.ok, true, pl.error);
  within(tip(pl), 0.375, 0.06, 'plastic elongation');
  assert.ok(pl.plasticFraction > 0.8, `yielded ${pl.plasticFraction}`);
  within(pl.maxStress, 300, 0.12, 'stress after yield');
  assert.ok(pl.minFactorOfSafety < 1);
  // Without plasticity the same load stays linear: 0.15 mm.
  const lin = nonlinearStatic(mesh, { material: { ...material, plastic: false }, fixtures: [0], loads: [{ faceId: 1, pressure: -300 }], resolution: 20, steps: 1, geometric: false });
  within(tip(lin), 0.15, 0.04, 'linear elongation');
});

test('nonlinear static reports missing fixtures and loads', () => {
  const mesh = boxMesh(10, 10, 10);
  assert.equal(nonlinearStatic(mesh, { material: STEEL, fixtures: [], loads: [{ faceId: 1, force: [1, 0, 0] }] }).error, 'no-fixtures');
  assert.equal(nonlinearStatic(mesh, { material: STEEL, fixtures: [0], loads: [] }).error, 'no-loads');
});

test('drop test: a bar falling on its end rebounds with impulse 2mv, contact 2L/c and stress ρcv', () => {
  const mesh = boxMesh(10, 10, 100, 2);
  const material = { E: 210000, nu: 0, density: 7850, yield: 250 };
  const t0 = performance.now();
  const r = dropTest(mesh, { material, height: 1000, direction: [0, 0, -1], resolution: 40 });
  assert.equal(r.ok, true);
  assert.ok(performance.now() - t0 < 30000, 'time');
  const v0 = Math.sqrt(2 * 9810 * 1000), rho = 7850e-12, c = Math.sqrt(210000 / rho), m = rho * 10 * 10 * 100;
  within(r.impactVelocity, v0, 1e-9, 'impact velocity');
  within(r.waveSpeed, c, 1e-9, 'wave speed');
  within(r.mass, m, 0.01, 'mass');
  within(r.impulse, 2 * m * v0, 0.1, 'impulse = momentum change');
  within(r.momentumChange, r.impulse, 0.08, 'momentum balance');
  within(r.contactDuration, 200 / c, 0.2, 'contact time 2L/c');
  within(r.meanContactForce / 100, rho * c * v0, 0.1, 'contact pressure during impact = ρcv');
  assert.ok(r.peakStress > 0.9 * rho * c * v0 && r.peakStress < 1.45 * rho * c * v0, `peak stress ${r.peakStress} (wave-front overshoot of the explicit scheme)`);
  assert.ok(r.reboundVelocity > 0.8 * v0, `rebound ${r.reboundVelocity}`);
  assert.equal(r.time.length, r.stress.length);
  assert.ok(r.force.some((f) => f > 0) && r.force.at(-1) === 0, 'contact ends');
  assert.equal(r.vertexStress.length, mesh.vertices.length / 3);
});

test('drop test: twice the impact velocity gives twice the stress (linear elastic)', () => {
  const mesh = boxMesh(20, 20, 20, 2);
  const material = { E: 70000, nu: 0.33, density: 2700, yield: 200 };
  const a = dropTest(mesh, { material, velocity: 2000, resolution: 10 });
  const b = dropTest(mesh, { material, velocity: 4000, resolution: 10 });
  within(b.peakStress / a.peakStress, 2, 0.05, 'stress ratio');
  within(b.impulse / a.impulse, 2, 0.05, 'impulse ratio');
});

test('combination: factors combine linearly and SRSS is never below the larger case', () => {
  const mesh = boxMesh(100, 10, 10, 2);
  const caseA = analyse(mesh, { material: STEEL, fixtures: [0], loads: [{ faceId: 1, force: [1000, 0, 0] }], resolution: 30 });
  const caseB = analyse(mesh, { material: STEEL, fixtures: [0], loads: [{ faceId: 1, force: [0, 0, -50] }], resolution: 30 });
  const both = analyse(mesh, { material: STEEL, fixtures: [0], loads: [{ faceId: 1, force: [2000, 0, -150] }], resolution: 30 });
  const comb = combineResults(mesh, { material: STEEL, resolution: 30, cases: [{ result: caseA, factor: 2 }, { result: caseB, factor: 3 }] });
  assert.equal(comb.ok, true);
  let err = 0, big = 0;
  for (let d = 0; d < both.displacement.length; d++) { err = Math.max(err, Math.abs(comb.displacement[d] - both.displacement[d])); big = Math.max(big, Math.abs(both.displacement[d])); }
  assert.ok(err < 2e-4 * big, `displacement superposition ${err} / ${big}`);
  within(comb.maxStress, both.maxStress, 0.01, 'stress of the combination');
  const srss = combineResults(mesh, { material: STEEL, resolution: 30, cases: [{ result: caseA, factor: 2 }, { result: caseB, factor: 3 }], method: 'srss' });
  assert.ok(srss.maxStress >= Math.max(2 * caseA.maxStress, 3 * caseB.maxStress) * 0.999, 'srss envelope');
  assert.equal(combineResults(mesh, { material: STEEL, resolution: 20, cases: [{ result: caseA, factor: 1 }] }).error, 'mismatch');
  const study = combinationStudy(mesh, { material: STEEL, fixtures: [0], resolution: 30, cases: [{ name: 'A', loads: [{ faceId: 1, force: [1000, 0, 0] }], factor: 2 }, { name: 'B', loads: [{ faceId: 1, force: [0, 0, -50] }], factor: 3 }] });
  within(study.maxStress, both.maxStress, 0.01, 'study');
  assert.equal(study.caseResults.length, 2);
});

test('flow: plane Poiseuille profile between two walls (lattice Boltzmann)', () => {
  const dims = [60, 3, 12], [nx, ny, nz] = dims;
  const solid = new Uint8Array(nx * ny * nz);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { solid[i + nx * j] = 2; solid[i + nx * (j + ny * (nz - 1))] = 2; }
  const uLat = 0.04;
  const r = flowLattice({ dims, solid, flowAxis: 0, flowSign: 1, lateral: 'slip', tau: 0.8, uLat, maxSteps: 6000, tol: 1e-6 });
  assert.equal(r.unstable, false);
  const H = nz - 2, x = 45, j = 1;
  const profile = [];
  for (let k = 1; k < nz - 1; k++) profile.push(r.vel[3 * (x + nx * (j + ny * k))]);
  const mean = profile.reduce((a, b) => a + b, 0) / profile.length;
  within(mean, uLat, 0.03, 'mass flow (mean velocity)');
  const umax = Math.max(...profile);
  within(umax / mean, 1.5, 0.04, 'u_max / u_mean of the parabola');
  profile.forEach((u, i) => { const zeta = (i + 0.5) / H; const exact = 6 * mean * zeta * (1 - zeta); assert.ok(Math.abs(u - exact) < 0.05 * umax, `profile at ${i}: ${u} vs ${exact}`); });
  assert.ok(r.inletRho > r.outletRho, 'pressure falls along the channel');
});

test('flow: drag coefficient of a cube falls as the Reynolds number rises', () => {
  const dims = [32, 14, 14], [nx, ny, nz] = dims, D = 4;
  const solid = new Uint8Array(nx * ny * nz);
  for (let k = 5; k < 5 + D; k++) for (let j = 5; j < 5 + D; j++) for (let i = 8; i < 8 + D; i++) solid[i + nx * (j + ny * k)] = 1;
  const uLat = 0.06;
  const cd = [];
  for (const re of [2, 8, 30]) {
    const tau = 3 * ((uLat * D) / re) + 0.5;
    const r = flowLattice({ dims, solid, flowAxis: 0, flowSign: 1, tau, uLat, maxSteps: 3000, tol: 1e-5 });
    assert.equal(r.unstable, false);
    assert.equal(r.frontCells, D * D);
    assert.ok(Math.abs(r.force[1]) < 0.05 * r.force[0] && Math.abs(r.force[2]) < 0.05 * r.force[0], 'symmetric: no side force');
    cd.push(r.force[0] / (0.5 * uLat * uLat * D * D));
  }
  assert.ok(cd[0] > cd[1] && cd[1] > cd[2], `Cd falls with Re: ${cd.map((c) => c.toFixed(2))}`);
  assert.ok(cd[0] > 5 && cd[2] > 0.8 && cd[2] < 6, `plausible values: ${cd}`);
});

test('flow around and through a meshed body: drag, pressure drop, section and streamlines', () => {
  const block = boxMesh(20, 10, 10, 2);
  const ext = flowField(block, { mode: 'external', axis: 'x', resolution: 8, velocity: 0.01, fluid: 'water', maxSteps: 2500 });
  assert.equal(ext.ok, true, ext.error);
  assert.ok(ext.dragForce > 0, 'drag along the flow');
  assert.ok(ext.reynolds > 1 && !ext.capped, `Re ${ext.reynolds}`);
  const sec = flowSection(ext, { normalAxis: 1 });
  assert.ok(sec.mesh.triangles.length > 0 && sec.colors.length === sec.mesh.vertices.length);
  assert.ok(sec.max > 0.01 * 0.99, `max speed ${sec.max}`);
  const pr = flowSection(ext, { normalAxis: 1, quantity: 'pressure' });
  assert.ok(pr.max > 0 && pr.min < pr.max, 'stagnation pressure ahead of the body');
  const sl = streamlines(ext, { count: 3 });
  assert.ok(sl.segments.length > 60, 'streamlines');
  assert.equal(velocityAt(ext, [10, 5, 5]), null, 'no velocity inside the body');
  // Internal: a duct (a block with a square passage along x) — the outside is closed off.
  const parts = [boxMesh(30, 12, 3, 1, [0, 0, 0], 0), boxMesh(30, 12, 3, 1, [0, 0, 9], 6), boxMesh(30, 3, 6, 1, [0, 0, 3], 12), boxMesh(30, 3, 6, 1, [0, 9, 3], 18)];
  const duct = { vertices: new Float32Array(parts.reduce((t, p) => t + p.vertices.length, 0)), triangles: [], faceGroups: [] };
  let off = 0;
  for (const p of parts) { duct.vertices.set(p.vertices, off * 3); const tStart = duct.triangles.length; p.triangles.forEach((t) => duct.triangles.push(t + off)); p.faceGroups.forEach((g) => duct.faceGroups.push({ ...g, start: g.start + tStart })); off += p.vertices.length / 3; }
  duct.triangles = Uint32Array.from(duct.triangles);
  const slow = flowField(duct, { mode: 'internal', axis: 'x', resolution: 20, velocity: 0.002, fluid: 'water', maxSteps: 3000 });
  const fast = flowField(duct, { mode: 'internal', axis: 'x', resolution: 20, velocity: 0.004, fluid: 'water', maxSteps: 3000 });
  assert.equal(slow.ok && fast.ok, true, `${slow.error} ${fast.error}`);
  assert.ok(slow.pressureDrop > 0, `pressure drop ${slow.pressureDrop}`);
  assert.ok(fast.pressureDrop > 1.7 * slow.pressureDrop && fast.pressureDrop < 2.6 * slow.pressureDrop, `laminar Δp ∝ U: ${slow.pressureDrop} → ${fast.pressureDrop}`);
  assert.ok(slow.hydraulicDiameter > 4 && slow.hydraulicDiameter < 8, `Dh ${slow.hydraulicDiameter}`);
});
