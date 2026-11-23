// Electronics cooling on the lattice (src/cad/cfd/lbm.js): per-axis conductivity is a diagonal diffusion tensor
// (a pulse spreads with σ² = s0² + 2 α_axis t along each axis); powered components on a board in an air stream give
// all their heat to the air, the stronger one runs hotter, a junction adds θ_jc P, a board that spreads heat in its
// plane cools its chip; and a fan settles where its curve meets the system's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { latticeRun, flowStudy, fanOperatingPoint, fanFlowStudy, joinMeshes } from '../../src/cad/cfd/lbm.js';
import { boxMesh, tubeMesh } from './fem-shapes.js';

const within = (v, e, rel, what) => assert.ok(Math.abs(v - e) <= rel * Math.abs(e), `${what}: ${v} vs ${e}`);

test('anisotropic solid: a heat pulse spreads by its own diffusivity along x and along y', () => {
  const nx = 80, ny = 80, N = nx * ny, s0 = 4, steps = 600;
  const solid = new Uint8Array(N).fill(1);
  const tx = 0.5 + 4 * 0.1, ty = 0.5 + 4 * 0.02;                 // α_x = 0.1, α_y = 0.02 (lattice)
  const cell = { sig: new Float64Array(N).fill(1), tau: new Float64Array(3 * N), src: new Float64Array(N), fixed: new Uint8Array(N) };
  for (let s = 0; s < N; s++) { cell.tau[3 * s] = tx; cell.tau[3 * s + 1] = ty; cell.tau[3 * s + 2] = 1; }
  const T0 = new Float64Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) T0[i + nx * j] = Math.exp(-((i + 0.5 - 40) ** 2 + (j + 0.5 - 40) ** 2) / (2 * s0 * s0));
  const r = latticeRun({ dims: [nx, ny, 1], solid, flowAxis: 0, sides: ['periodic', 'periodic', 'periodic'], inlet: 'none', outlet: 'none', tau: 0.8, steps, transient: true, thermal: { tauF: 1, tauS: 1, Tin: 0, Tinit: T0, cell } });
  let m = 0, vx = 0, vy = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const T = r.temp[i + nx * j]; m += T; vx += T * (i + 0.5 - 40) ** 2; vy += T * (j + 0.5 - 40) ** 2; }
  within(vx / m, s0 * s0 + 2 * 0.1 * steps, 0.01, 'x variance');
  within(vy / m, s0 * s0 + 2 * 0.02 * steps, 0.01, 'y variance');
  let m0 = 0; for (const v of T0) m0 += v;
  within(m, m0, 1e-9, 'heat conserved');
});

// A board (2 mm FR-4-like plate) in an air stream along x with two chips on it.
const board = () => boxMesh(60, 40, 2, 2, [0, 0, 0]);
const chip = (x, y) => boxMesh(10, 10, 2, 2, [x, y, 2]);
const air = { mode: 'external', axis: 'x', velocity: 2, fluid: 'air', resolution: 22, time: { mode: 'steady', maxSteps: 9000 } };

test('two powered chips on a board: the air takes the 3 W, the 2 W chip runs hotter, the junction adds θ_jc P', () => {
  const r = flowStudy(board(), { ...air, thermal: { inlet: 25, body: { mode: 'conduct', k: 0.3, density: 1850, cp: 1100 }, components: [
    { name: 'U1', mesh: chip(10, 15), power: 1, k: 20, density: 2300, cp: 700, thetaJC: 5 },
    { name: 'U2', mesh: chip(40, 15), power: 2, k: 20, density: 2300, cp: 700, thetaJC: 5, limit: 30 },
  ] } });
  assert.ok(r.ok || r.error === 'not-converged', r.error);
  assert.equal(r.components.length, 2);
  const [u1, u2] = r.components;
  assert.ok(u1.cells > 0 && u2.cells > 0);
  within(r.heat, 3, 0.1, 'heat to the air = the power');
  assert.ok(u2.max > u1.max, `${u2.max} vs ${u1.max}`);
  const rise1 = u1.mean - 25, rise2 = u2.mean - 25;
  assert.ok(rise2 / rise1 > 1.4 && rise2 / rise1 < 2.8, `rise ratio ${rise2 / rise1}`);
  within(u2.junction, u2.max + 10, 1e-9, 'junction');
  assert.equal(u2.over, u2.junction > 30);
});

test('a board that spreads heat in its plane cools the chip on it (orthotropic: in-plane 20, through 0.3 W/m·K)', () => {
  const post = boxMesh(4, 4, 4, 2, [-30, 18, 0]);
  const run = (k) => flowStudy(post, { ...air, thermal: { inlet: 25, body: { mode: 'conduct', k: 1 }, components: [
    { name: 'PCB', mesh: board(), power: 0, k, density: 1850, cp: 1100 }, { name: 'U1', mesh: chip(25, 15), power: 2, k: 20, density: 2300, cp: 700 },
  ] } }).components.find((c) => c.name === 'U1').max;
  const plain = run(0.3), spreading = run([20, 20, 0.3]);
  assert.ok(spreading < plain - 1, `chip ${spreading} °C on the spreading board vs ${plain} °C`);
});

test('fan curve meets the system curve: c Q² = p_max (1 − Q / Q_max)', () => {
  const fan = { maxFlow: 0.01, maxPressure: 50 };
  const op = fanOperatingPoint(20, 0.004, fan);                      // c = 20 / 0.004²
  within(op.systemCoefficient * op.flow ** 2, op.pressure, 1e-9, 'on the system curve');
  within(op.pressure, 50 * (1 - op.flow / 0.01), 1e-12, 'on the fan curve');
  assert.ok(op.flow > 0 && op.flow < 0.01);
});

test('a fan pushing air through a duct with a hot block: the run lands on the fan curve', () => {
  const duct = tubeMesh(12, 10, 80, 32, 6);
  const r = fanFlowStudy(duct, { mode: 'internal', axis: 'z', velocity: 1, fluid: 'air', resolution: 10, time: { mode: 'steady', maxSteps: 6000 }, fan: { maxFlow: 3e-4, maxPressure: 2 } });
  assert.ok(r.ok || r.error === 'not-converged', r.error);
  assert.ok(r.fan.flow > 0 && r.fan.flow < 3e-4);
  assert.ok(r.fan.mismatch < 0.25, `system Δp ${r.fan.systemPressure} vs fan ${r.fan.pressure} Pa`);
  within(r.meanVelocity * r.inletArea * 1e-6, r.fan.flow, 1e-9, 'flow at the operating point');
});

test('joined meshes keep every body (vertex offsets)', () => {
  const j = joinMeshes([boxMesh(1, 1, 1), boxMesh(1, 1, 1, 2, [5, 0, 0])]);
  assert.equal(j.vertices.length, 2 * boxMesh(1, 1, 1).vertices.length);
  assert.ok(Math.max(...j.triangles) === j.vertices.length / 3 - 1);
});
