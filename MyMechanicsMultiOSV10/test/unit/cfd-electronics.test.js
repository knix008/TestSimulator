// Electronics cooling on the lattice (src/cad/cfd/lbm.js): per-axis conductivity is a diagonal diffusion tensor
// (a pulse spreads with σ² = s0² + 2 α_axis t along each axis); air nothing heats stays at the inlet temperature
// (the lattice carries the rise above it); a powered chip gives all its heat to the air; on a board the stronger chip
// runs hotter, a junction adds θ_jc P and a board that spreads heat in its plane cools the chips; and a fan settles
// where its curve meets the system's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { latticeRun, flowStudy, fanOperatingPoint, fanFlowStudy, joinMeshes } from '../../src/cad/cfd/lbm.js';
import { boxMesh } from './fem-shapes.js';

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

// Air at 0.5 m/s along x; MRT with large-eddy damping (what the electronics study uses).
const air = { mode: 'external', axis: 'x', velocity: 0.5, fluid: 'air', collision: 'mrt', les: 0.17 };

test('a 1 W chip alone in the air: all its heat goes to the air; unpowered air and parts stay at the inlet temperature', () => {
  const r = flowStudy(null, { ...air, cellSize: 2.5, domain: { upstream: 0.6, downstream: 1, lateral: 0.6 }, time: { mode: 'steady', maxSteps: 12000, passes: 30 }, thermal: { inlet: 25, components: [{ name: 'U1', mesh: boxMesh(12, 12, 6, 2), power: 1, k: 20, density: 2300, cp: 700 }] } });
  assert.equal(r.ok, true, r.error);
  within(r.heat, 1, 0.02, 'heat to the air');
  const u1 = r.components[0];
  assert.ok(u1.mean > 30 && u1.mean < 60, `chip ${u1.mean} °C`);
  // Downstream of the warm wake the advection undershoots a little (a dispersive ripple), never much.
  let lo = Infinity; for (const v of r.temp) lo = Math.min(lo, v);
  assert.ok(lo > 25 - 0.08 * (u1.max - 25), `coldest ${lo} °C for a chip rise of ${u1.max - 25} K`);
  const cold = flowStudy(null, { ...air, cellSize: 2.5, domain: { upstream: 0.6, downstream: 1, lateral: 0.6 }, time: { mode: 'steady', maxSteps: 1500 }, thermal: { inlet: 25, components: [{ name: 'U1', mesh: boxMesh(12, 12, 6, 2), power: 0, k: 20 }] } });
  let clo = Infinity, chi = -Infinity; for (const v of cold.temp) { clo = Math.min(clo, v); chi = Math.max(chi, v); }
  assert.ok(clo === 25 && chi === 25, `unheated ${clo} … ${chi}`);
});

// A 3 mm board with two chips 5 mm high.
const chips = [
  { name: 'U1', mesh: boxMesh(12, 12, 5, 2, [8, 14, 3]), power: 0.5, k: 20, density: 2300, cp: 700, thetaJC: 5 },
  { name: 'U2', mesh: boxMesh(12, 12, 5, 2, [38, 14, 3]), power: 1, k: 20, density: 2300, cp: 700, thetaJC: 5, limit: 45 },
];
const boardRun = (k) => flowStudy(null, { ...air, cellSize: 3, domain: { upstream: 0.3, downstream: 0.6, lateral: 0.3 }, time: { mode: 'steady', maxSteps: 7000, passes: 30 }, thermal: { inlet: 25, components: [{ name: 'PCB', mesh: boxMesh(60, 40, 3, 2), power: 0, k, density: 1850, cp: 1100 }, ...chips] } });

test('chips on a board: the air takes their 1.5 W, the 1 W chip runs hotter, T_j = case max + θ_jc P; a spreading board cools them', () => {
  const plain = boardRun(0.3);
  assert.ok(plain.ok, plain.error);
  within(plain.heat, 1.5, 0.08, 'heat to the air');
  const [pcb, u1, u2] = plain.components;
  assert.equal(pcb.power, 0);
  assert.ok(u2.max > u1.max + 3, `${u2.max} vs ${u1.max}`);
  within(u2.junction, u2.max + 5, 1e-9, 'junction');
  assert.equal(u2.over, u2.junction > 45);
  const spread = boardRun([20, 20, 0.3]);
  const s2 = spread.components.find((c) => c.name === 'U2');
  assert.ok(s2.max < u2.max - 3, `U2 ${s2.max} °C on the spreading board vs ${u2.max} °C`);
  within(spread.heat, 1.5, 0.08, 'heat to the air (spreading board)');
});

test('fan curve meets the system curve: c Q² = p_max (1 − Q / Q_max)', () => {
  const fan = { maxFlow: 0.01, maxPressure: 50 };
  const op = fanOperatingPoint(20, 0.004, fan);                      // c = 20 / 0.004²
  within(op.systemCoefficient * op.flow ** 2, op.pressure, 1e-9, 'on the system curve');
  within(op.pressure, 50 * (1 - op.flow / 0.01), 1e-12, 'on the fan curve');
  assert.ok(op.flow > 0 && op.flow < 0.01);
});

test('a fan pushing air through a square duct: the second run lands near the fan curve', () => {
  // A 20 × 20 mm duct, 80 mm long, walls 2 mm (two boxes per side make the passage).
  const wall = (x, y, w, h) => boxMesh(w, h, 80, 2, [x, y, 0]);
  const duct = joinMeshes([wall(-12, -12, 24, 2), wall(-12, 10, 24, 2), wall(-12, -10, 2, 20), wall(10, -10, 2, 20)]);
  const r = fanFlowStudy(duct, { mode: 'internal', axis: 'z', velocity: 1, fluid: 'air', collision: 'mrt', les: 0.17, cellSize: 2, time: { mode: 'steady', maxSteps: 6000 }, fan: { maxFlow: 6e-4, maxPressure: 1 } });
  assert.ok(r.ok || r.error === 'not-converged', r.error);
  assert.ok(r.fan.flow > 0 && r.fan.flow < 6e-4);
  assert.ok(r.fan.mismatch < 0.3, `system Δp ${r.fan.systemPressure} vs fan ${r.fan.pressure} Pa`);
  within(r.meanVelocity * r.inletArea * 1e-6, r.fan.flow, 1e-9, 'flow at the operating point');
});

test('joined meshes keep every body (vertex offsets)', () => {
  const j = joinMeshes([boxMesh(1, 1, 1), boxMesh(1, 1, 1, 2, [5, 0, 0])]);
  assert.equal(j.vertices.length, 2 * boxMesh(1, 1, 1).vertices.length);
  assert.ok(Math.max(...j.triangles) === j.vertices.length / 3 - 1);
});
