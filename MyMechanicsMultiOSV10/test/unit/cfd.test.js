// Lattice-Boltzmann flow (src/cad/cfd/lbm.js): plane Poiseuille flow for the TRT, BGK and MRT collisions, the
// Schäfer–Turek cylinder benchmark (Re = 20: Cd = 5.58) with interpolated bounce-back and the drag falling with Re,
// pipe flow through a meshed tube against Hagen–Poiseuille, heat: an advected / diffusing pulse and conjugate
// conduction through a fluid–solid slab, and external flow around a meshed body (drag, surface pressure, section,
// streamlines, trajectories).
import test from 'node:test';
import assert from 'node:assert/strict';
import { latticeRun, flowStudy, CX, CY } from '../../src/cad/cfd/lbm.js';
import { flowSection, streamlines, pathlines, pressureAt } from '../../src/cad/fea-sim2.js';
import { boxMesh, tubeMesh } from './fem-shapes.js';

const within = (v, e, rel, what) => assert.ok(Math.abs(v - e) <= rel * Math.abs(e), `${what}: ${v} vs ${e} (±${rel * 100}%)`);

test('plane Poiseuille flow between walls: parabolic profile for TRT, BGK and MRT collisions', () => {
  const ny = 21, dims = [4, ny, 1], solid = new Uint8Array(4 * ny), tau = 0.9, nu = (tau - 0.5) / 3, g = 1e-6;
  for (const collision of ['trt', 'bgk', 'mrt']) {
    const r = latticeRun({ dims, solid, flowAxis: 0, sides: ['periodic', 'wall', 'periodic'], inlet: 'none', outlet: 'none', tau, collision, force: [g, 0, 0], steps: 20000, minSteps: 2000, tol: 1e-9 });
    let err = 0, umax = 0;
    for (let j = 0; j < ny; j++) { const y = j + 0.5, ua = (g / (2 * nu)) * y * (ny - y); err = Math.max(err, Math.abs(r.vel[3 * (1 + 4 * j)] - ua)); umax = Math.max(umax, ua); }
    assert.ok(err / umax < 5e-3, `${collision}: profile error ${err / umax}`);
  }
});

function cylinder(Re, steps) {
  const D = 10, nx = 220, ny = 41, N = nx * ny, cxc = 20, cyc = 20, R = D / 2, Um = 0.06, Ubar = (2 / 3) * Um, tau = 0.5 + (3 * Ubar * D) / Re;
  const solid = new Uint8Array(N), qwall = new Float32Array(19 * N).fill(-1), prof = new Float32Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const x = i + 0.5, y = j + 0.5; if ((x - cxc) ** 2 + (y - cyc) ** 2 < R * R) solid[i + nx * j] = 1; prof[i + nx * j] = (4 * Um * y * (ny - y)) / (ny * ny); }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s = i + nx * j; if (solid[s]) continue;
    for (let q = 1; q < 19; q++) {
      const ii = i + CX[q], jj = j + CY[q]; if (ii < 0 || ii >= nx || jj < 0 || jj >= ny || !solid[ii + nx * jj]) continue;
      const px = i + 0.5 - cxc, py = j + 0.5 - cyc, a = CX[q] ** 2 + CY[q] ** 2, b = 2 * (px * CX[q] + py * CY[q]), c = px * px + py * py - R * R;
      qwall[19 * s + q] = Math.min(1, Math.max(1e-3, (-b - Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a)));
    }
  }
  const r = latticeRun({ dims: [nx, ny, 1], solid, qwall, flowAxis: 0, sides: ['open', 'wall', 'periodic'], tau, inletProfile: prof, uIn: Um, steps, minSteps: steps, tol: 1e-12 });
  return (2 * r.force[0]) / (Ubar * Ubar * D);
}

test('Schäfer–Turek cylinder in a channel: Cd(Re = 20) = 5.58, and the drag falls as Re rises', () => {
  const cd20 = cylinder(20, 15000), cd40 = cylinder(40, 9000);
  within(cd20, 5.5795, 0.05, 'Cd at Re = 20 (D = 10 cells)');
  assert.ok(cd40 < 0.85 * cd20, `Cd(40) ${cd40} < Cd(20) ${cd20}`);
});

test('laminar pipe flow through a meshed tube: pressure gradient 8μU/R² (Hagen–Poiseuille)', () => {
  const U = 0.0005, r = flowStudy(tubeMesh(7, 5, 40, 64, 8), { mode: 'internal', axis: 'z', velocity: U, fluid: 'water', cellSize: 0.8, uLat: 0.1 });
  assert.equal(r.ok, true, r.error);
  const grad = (pressureAt(r, [0, 0, 40 / 3]) - pressureAt(r, [0, 0, 80 / 3])) / (40 / 3 / 1000);
  within(grad, (8 * 998.2 * 1.004e-6 * U) / 0.005 ** 2, 0.04, 'dp/dx (Pa/m)');
  assert.ok(r.pressureDrop > 0);
});

test('heat: a pulse advected and diffused by a uniform flow; conjugate conduction across a fluid–solid slab', () => {
  const nx = 200, u = 0.05, alpha = 0.02, s0 = 6, x0 = 50, steps = 1500;
  const T0 = Float64Array.from({ length: nx }, (_, i) => Math.exp(-((i + 0.5 - x0) ** 2) / (2 * s0 * s0)));
  const r = latticeRun({ dims: [nx, 1, 1], solid: new Uint8Array(nx), flowAxis: 0, sides: ['periodic', 'periodic', 'periodic'], inlet: 'none', outlet: 'none', tau: 0.8, initialVelocity: [u, 0, 0], steps, transient: true, thermal: { tauF: 0.5 + 4 * alpha, tauS: 1, Tin: 0, Tinit: T0 } });
  const sig2 = s0 * s0 + 2 * alpha * steps;
  for (let i = 0; i < nx; i++) { const Ta = Math.sqrt((s0 * s0) / sig2) * Math.exp(-((i + 0.5 - x0 - u * steps) ** 2) / (2 * sig2)); assert.ok(Math.abs(r.temp[i] - Ta) < 0.005, `T at ${i}`); }
  // Fluid 0–20, solid 20–40 conducting 4× better, walls 0 / 100 °C: interface at 100·20/(20 + 5) = 80 °C.
  const solid = new Uint8Array(40); for (let i = 20; i < 40; i++) solid[i] = 1;
  const c = latticeRun({ dims: [40, 1, 1], solid, flowAxis: 0, sides: ['wall', 'periodic', 'periodic'], inlet: 'none', outlet: 'none', tau: 0.8, steps: 40000, minSteps: 5000, tol: 1e-10, thermal: { tauF: 0.9, tauS: 2.1, Tin: 0, Tinit: 50, walls: { 0: { lo: 0, hi: 100 } } } });
  within(0.5 * (c.temp[19] + c.temp[20]), 80, 0.015, 'interface temperature');
  within(c.temp[5], (80 * 5.5) / 20, 0.02, 'linear in the fluid');
});

test('external flow around a meshed block: drag, stagnation pressure on the body, section, streamlines, trajectories', () => {
  const mesh = boxMesh(20, 20, 20, 2);
  const r = flowStudy(mesh, { mode: 'external', axis: 'x', velocity: 0.0025, fluid: 'water', resolution: 8, time: { mode: 'steady', maxSteps: 3000 } });
  assert.equal(r.ok, true, r.error);
  within(r.reynolds, 49.8, 0.01, 'Reynolds number');
  assert.ok(r.dragForce > 0 && r.dragCoefficient > 1 && r.dragCoefficient < 4, `Cd ${r.dragCoefficient}`);
  const V = mesh.vertices;
  let front = 0, back = 0, nf = 0, nb = 0;
  for (let i = 0; i < V.length / 3; i++) { if (V[3 * i] === 0) { front += r.vertexCp[i]; nf++; } if (V[3 * i] === 20) { back += r.vertexCp[i]; nb++; } }
  assert.ok(front / nf > 0.1 && back / nb < 0 && back / nb < front / nf, `Cp front ${front / nf}, back ${back / nb}`);
  const sec = flowSection(r, { normalAxis: 2, quantity: 'velocity' });
  assert.ok(sec.max > 0.0025 && sec.mesh.triangles.length > 0);
  assert.ok(flowSection(r, { normalAxis: 2, quantity: 'vorticity' }).max > 0);
  assert.ok(streamlines(r, { count: 3 }).segments.length > 0);
  assert.ok(pathlines(r, { count: 3 }).paths.every((p) => p.length > 10));
});

test('transient conjugate heat: the solid stores heat with its own ρc — energy in = stored + given to the fluid, for the time asked for', () => {
  // A 20 W heater in a 20 mm block in slow water for 2 s (fewer than 50 natural time steps: the step is made smaller,
  // never the run longer). Heat in (P·t) = ρc_solid·V·ΔT (stored) + ∫ heat to the fluid dt, for two densities.
  const mesh = boxMesh(20, 20, 20, 2);
  const rises = [];
  for (const density of [7850, 3925]) {
    const r = flowStudy(mesh, { mode: 'external', axis: 'x', velocity: 0.0005, fluid: 'water', resolution: 8, time: { mode: 'transient', duration: 2 }, thermal: { inlet: 20, body: { mode: 'power', value: 20, k: 200, density, cp: 500 } } });
    assert.equal(r.ok, true, r.error);
    within(r.history.at(-1).time, 2, 0.05, 'simulated time');
    let s = 0; let n = 0;
    for (let i = 0; i < r.solid.length; i++) if (r.solid[i] === 1) { s += r.temp[i]; n++; }
    const rise = s / n - 20; rises.push(rise);
    const stored = density * 500 * n * (r.h / 1000) ** 3 * rise;
    let toFluid = 0; const H = r.history;
    for (let i = 1; i < H.length; i++) toFluid += 0.5 * (H[i].heat + H[i - 1].heat) * (H[i].time - H[i - 1].time);
    within(stored + toFluid, 20 * H.at(-1).time, 0.03, `energy balance at ρ ${density}`);
  }
  assert.ok(rises[1] > 1.4 * rises[0], `half the heat capacity warms faster: ${rises[1]} vs ${rises[0]}`);
});

test('nested refinement: a block of half-size cells around the body gives the drag of a uniformly fine grid', () => {
  // A cube at Re ≈ 50: coarse grid (6 cells across) with one nested block (cells halved) against a uniform 12-cell
  // grid. The block is driven as a velocity inlet (sides, upstream) and a pressure outlet (downstream) by the coarse
  // solution — holding both ρ and u on its boundary over-constrained it and read the drag 8 % high — and its solution
  // is fed back into the coarse cells it covers (two-way); one-way driving alone read 5 % high.
  const mesh = boxMesh(20, 20, 20, 2);
  const base = { mode: 'external', axis: 'x', velocity: 0.0025, fluid: 'water', time: { mode: 'steady', maxSteps: 3000, passes: 1 } };
  const fine = flowStudy(mesh, { ...base, resolution: 12 });
  const nested = flowStudy(mesh, { ...base, resolution: 6, refine: 1 });
  assert.equal(nested.ok, true, nested.error);
  assert.equal(nested.refined, 1);
  within(nested.blocks[0].h, fine.h, 1e-9, 'block cell size');
  within(nested.dragCoefficient, fine.dragCoefficient, 0.02, 'Cd nested vs uniform fine');
  assert.ok(nested.coupling.length >= 1 && nested.coupling.at(-1) < 0.005, `coupling sweeps settle: ${nested.coupling}`);
  const oneWay = flowStudy(mesh, { ...base, resolution: 6, refine: 1, couplingIterations: 0 });
  assert.ok(Math.abs(nested.dragCoefficient - fine.dragCoefficient) < Math.abs(oneWay.dragCoefficient - fine.dragCoefficient), `two-way ${nested.dragCoefficient} nearer than one-way ${oneWay.dragCoefficient} to ${fine.dragCoefficient}`);
});
