// Rotating walls on the lattice (src/cad/cfd/lbm.js): Taylor–Couette flow between an inner cylinder turning at ω
// and a fixed outer one — u_θ(r) = A r + B / r with A = −ω R1² / (R2² − R1²), B = ω R1² R2² / (R2² − R1²) — and the
// torque on the inner cylinder 4π μ ω R1² R2² / (R2² − R1²) per unit length; turning the other way flips both.
import test from 'node:test';
import assert from 'node:assert/strict';
import { latticeRun } from '../../src/cad/cfd/lbm.js';

const couette = (omega) => {
  const n = 56, c = n / 2, R1 = 8, R2 = 22, N = n * n;
  const solid = new Uint8Array(N), mask = new Uint8Array(N);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const r = Math.hypot(i + 0.5 - c, j + 0.5 - c), s = i + n * j;
    if (r < R1) { solid[s] = 1; mask[s] = 1; } else if (r > R2) solid[s] = 2;
  }
  const tau = 0.8;
  const run = latticeRun({ dims: [n, n, 1], solid, flowAxis: 0, sides: ['periodic', 'periodic', 'periodic'], inlet: 'none', outlet: 'none', tau, collision: 'trt', steps: 30000, minSteps: 4000, tol: 1e-10, center: [c, c, 0.5], rotation: { axis: [0, 0, 1], center: [c, c, 0.5], omega, mask } });
  return { run, n, c, R1, R2, nu: (tau - 0.5) / 3 };
};

test('Taylor–Couette: the swirl profile A r + B/r between the cylinders and the torque on the inner one', () => {
  const omega = 0.004;
  const { run, n, c, R1, R2, nu } = couette(omega);
  const A = (-omega * R1 * R1) / (R2 * R2 - R1 * R1), B = (omega * R1 * R1 * R2 * R2) / (R2 * R2 - R1 * R1);
  // Azimuthal speed against theory over the gap (away from the stair-stepped walls).
  let worst = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = i + 0.5 - c, y = j + 0.5 - c, r = Math.hypot(x, y);
    if (r < R1 + 2 || r > R2 - 2) continue;
    const s = i + n * j, ut = (-y * run.vel[3 * s] + x * run.vel[3 * s + 1]) / r;
    const ua = A * r + B / r;
    worst = Math.max(worst, Math.abs(ut - ua) / (omega * R1));
  }
  assert.ok(worst < 0.06, `largest error ${worst} of the wall speed`);
  // Torque on the inner cylinder (momentum exchange about the axis): magnitude 4π ν ω R1² R2² / (R2² − R1²), against the turning.
  const Tz = run.torque[2], Ta = (4 * Math.PI * nu * omega * R1 * R1 * R2 * R2) / (R2 * R2 - R1 * R1);
  assert.ok(Math.abs(Math.abs(Tz) - Ta) < 0.12 * Ta, `torque ${Tz} vs ${Ta}`);
  const back = couette(-omega).run;
  assert.ok(Math.sign(back.torque[2]) === -Math.sign(Tz), 'the other way round, the other torque');
});

test('a flat wall moving at U (the rim of a far-off rotor): plane Couette flow is exactly linear, also across the periodic sides', () => {
  const nx = 4, ny = 22, N = nx * ny; const solid = new Uint8Array(N), mask = new Uint8Array(N);
  for (let i = 0; i < nx; i++) { solid[i] = 2; solid[i + nx * (ny - 1)] = 1; mask[i + nx * (ny - 1)] = 1; }
  const Yc = 1e6, U = 0.05;
  const run = latticeRun({ dims: [nx, ny, 1], solid, flowAxis: 0, sides: ['periodic', 'periodic', 'periodic'], inlet: 'none', outlet: 'none', tau: 0.8, collision: 'trt', steps: 20000, minSteps: 4000, tol: 1e-12, rotation: { axis: [0, 0, -1], center: [2, -Yc, 0.5], omega: U / Yc, mask } });
  for (let i = 0; i < nx; i++) for (let j = 1; j < ny - 1; j++) {
    const u = run.vel[3 * (i + nx * j)] / U;
    assert.ok(Math.abs(u - (j - 0.5) / 20) < 1e-3, `u(${i}, ${j}) = ${u}`);
  }
});

test('a spinning cylinder in a cross-flow (Magnus): a side force that turns with the spin, a torque that resists it', async () => {
  const { flowStudy } = await import('../../src/cad/cfd/lbm.js');
  const { cylinderMesh } = await import('./fem-shapes.js');
  const mesh = cylinderMesh(10, 16, 32, 4, [0, 0, -8]);
  const run = (rpm) => flowStudy(mesh, { mode: 'external', axis: 'x', velocity: 1, fluid: 'air', resolution: 8, collision: 'mrt', les: 0.17, domain: { upstream: 0.8, downstream: 1.5, lateral: 0.8 }, time: { mode: 'steady', maxSteps: 2500 }, rotation: { axis: 'z', rpm } });
  const ccw = run(955), cw = run(-955);                              // rim speed ≈ 1 m/s
  assert.ok(ccw.rotation && cw.rotation);
  // Flow along +x, spin about +z (counter-clockwise): the top moves against the flow — the force points to −y.
  assert.ok(ccw.forceVector[1] < 0 && cw.forceVector[1] > 0, `side forces ${ccw.forceVector[1]} / ${cw.forceVector[1]} N`);
  assert.ok(Math.abs(Math.abs(ccw.forceVector[1]) - Math.abs(cw.forceVector[1])) < 0.25 * Math.abs(ccw.forceVector[1]), 'mirror images');
  assert.ok(ccw.rotation.torque < 0 && cw.rotation.torque > 0, `torques ${ccw.rotation.torque} / ${cw.rotation.torque} N·m`);
  assert.ok(ccw.rotation.power > 0 && cw.rotation.power > 0, 'the shaft supplies power either way');
  // (The side force comes from the spin: the two runs are mirror images. A still cylinder on so short a coarse run
  // sheds unevenly, so it is no reference here.)
});
