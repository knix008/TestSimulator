// Non-Newtonian fluids and porous media in the lattice Boltzmann solver (cfd/lbm.js latticeRun): a shear-thinning
// power-law fluid (n = 0.5) driven between two plates against its analytic velocity profile; a porous plug's
// pressure drop against Darcy–Forchheimer (α u + β u²) L; a Carreau fluid at low shear behaving as its ν0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { latticeRun } from '../../src/cad/cfd/lbm.js';

const channel = (nx, ny, nz) => {
  const solid = new Uint8Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { solid[i + nx * (0 + ny * k)] = 2; solid[i + nx * (ny - 1 + ny * k)] = 2; }
  return solid;
};
const ux = (r, i, j, k, d) => r.vel[3 * (i + d[0] * (j + d[1] * k))];

test('power-law fluid (n = 0.5) between plates: the analytic profile u = n/(n+1)·(G/K)^(1/n)·(h^(1+1/n) − |y|^(1+1/n))', () => {
  const d = [4, 22, 4], G = 2.5e-4, K = 0.0204, n = 0.5, h = 10;
  const r = latticeRun({ dims: d, solid: channel(...d), sides: ['periodic', 'slip', 'periodic'], inlet: 'none', outlet: 'none', flowAxis: 0, tau: 1, force: [G, 0, 0], rheology: { model: 'powerLaw', K, n }, steps: 40000, minSteps: 4000, tol: 1e-9, collision: 'trt' });
  const prof = (y) => (n / (n + 1)) * (G / K) ** (1 / n) * (h ** (1 + 1 / n) - Math.abs(y) ** (1 + 1 / n));
  const centre = ux(r, 1, 10, 1, d), want = (prof(0.5) + prof(-0.5)) / 2;
  assert.ok(Math.abs(centre / want - 1) < 0.05, `${centre} vs ${want}`);
  // A Newtonian fluid of the same wall viscosity would be parabolic; the shear-thinning one is flatter: u(y = 5)/u(0).
  // (cell j sits at y = j − 10.5: the walls are half-way, at 0.5 and 20.5)
  const ratio = ux(r, 1, 15, 1, d) / centre, wantRatio = prof(4.5) / prof(0.5);
  assert.ok(Math.abs(ratio - wantRatio) < 0.03, `${ratio} vs ${wantRatio}`);
  assert.ok(ratio > 1 - (4.5 / 10) ** 2 + 0.05, "flatter than a parabola");
});

test('a porous plug: the pressure drop is the Darcy–Forchheimer (α u + β |u| u) L', () => {
  const d = [100, 6, 6], N = d[0] * d[1] * d[2], mask = new Uint8Array(N);
  for (let k = 0; k < 6; k++) for (let j = 0; j < 6; j++) for (let i = 40; i < 60; i++) mask[i + 100 * (j + 6 * k)] = 1;
  const uIn = 0.02, alpha = 0.01, beta = 0.5, L = 20;
  const r = latticeRun({ dims: d, solid: new Uint8Array(N), sides: ['open', 'slip', 'slip'], flowAxis: 0, uIn, tau: 0.8, porous: { mask, alpha, beta }, steps: 30000, minSteps: 3000, tol: 1e-9 });
  const rhoAt = (i) => { let s = 0; for (let k = 0; k < 6; k++) for (let j = 0; j < 6; j++) s += r.rho[i + 100 * (j + 6 * k)]; return s / 36; };
  const dp = (rhoAt(30) - rhoAt(70)) / 3, want = (alpha * uIn + beta * uIn * uIn) * L;
  assert.ok(Math.abs(dp / want - 1) < 0.06, `Δp ${dp} vs ${want}`);
  // Inside the plug the flow is the inlet's (continuity).
  assert.ok(Math.abs(ux(r, 50, 3, 3, d) / uIn - 1) < 0.03);
});

test('a Carreau fluid sheared gently acts as its zero-shear viscosity ν0 (a Newtonian parabola)', () => {
  const d = [4, 22, 4], G = 1e-6, nu0 = 1 / 6;
  const r = latticeRun({ dims: d, solid: channel(...d), sides: ['periodic', 'slip', 'periodic'], inlet: 'none', outlet: 'none', flowAxis: 0, tau: 1, force: [G, 0, 0], rheology: { model: 'carreau', nu0, nuInf: 0.01, lambda: 1, n: 0.4 }, steps: 40000, minSteps: 4000, tol: 1e-10 });
  const want = (G / (2 * nu0)) * (10 ** 2 - 0.5 ** 2);
  assert.ok(Math.abs(ux(r, 1, 10, 1, d) / want - 1) < 0.03, `${ux(r, 1, 10, 1, d)} vs ${want}`);
});

test('mixing-length turbulence: a channel profile flatter and slower than laminar, the eddy viscosity zero at the wall', () => {
  const d = [4, 42, 4], G = 2e-5, h = 20;
  const base = { dims: d, solid: channel(...d), sides: ['periodic', 'slip', 'periodic'], inlet: 'none', outlet: 'none', flowAxis: 0, tau: 0.53, force: [G, 0, 0], steps: 60000, minSteps: 4000, tol: 1e-10 };
  const yOf = (j) => Math.min(j - 0.5, 40.5 - j);
  const mix = new Float64Array(d[0] * d[1] * d[2]);
  for (let k = 0; k < 4; k++) for (let j = 1; j < 41; j++) for (let i = 0; i < 4; i++) mix[i + 4 * (j + 42 * k)] = Math.min(0.41 * yOf(j), 0.09 * h);
  const lam = latticeRun(base), turb = latticeRun({ ...base, mixingLength: mix });
  const cL = ux(lam, 1, 20, 1, d), cT = ux(turb, 1, 20, 1, d);
  assert.ok(cT < 0.8 * cL, `${cT} vs laminar ${cL}`);
  // Flatter: the speed a quarter of the way in, over the centre's.
  const fl = ux(lam, 1, 10, 1, d) / cL, ft = ux(turb, 1, 10, 1, d) / cT;
  assert.ok(ft > fl + 0.01, `${ft} vs ${fl}`);
  // The same wall shear holds the same force: u'(wall) τ_w = G h (laminar ν0 at the wall).
  const nu0 = (0.53 - 0.5) / 3, slope = (u) => ux(u, 1, 1, 1, d) / 0.5;
  assert.ok(Math.abs((nu0 * slope(turb)) / (G * h) - 1) < 0.25, `${nu0 * slope(turb)} vs ${G * h}`);
});
