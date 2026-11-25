// Particle study (cfd/particles.js) on hand-made flow fields: tiny particles follow the flow and leave by the
// outlet, a sand grain in still water settles at the Stokes velocity, heavy grains hitting a 45° wall erode it by
// K·v^n·f(45°) per kg and bounce off, a normal impact erodes nothing (ductile).
import test from 'node:test';
import assert from 'node:assert/strict';
import { particleStudy, erosionAngle } from '../../src/cad/cfd/particles.js';
import { FLUIDS } from '../../src/cad/cfd/lbm.js';

/** A box of cells (h mm) with a uniform lattice velocity along +x (U m/s), solid where solidAt(i, j, k). */
function flowOf(dims, h, U, solidAt = () => false, fluid = FLUIDS.air) {
  const n = dims[0] * dims[1] * dims[2], vel = new Float64Array(3 * n), solid = new Uint8Array(n);
  for (let k = 0; k < dims[2]; k++) for (let j = 0; j < dims[1]; j++) for (let i = 0; i < dims[0]; i++) {
    const s = i + dims[0] * (j + dims[1] * k);
    if (solidAt(i, j, k)) solid[s] = 1; else vel[3 * s] = 0.05;
  }
  return { dims, origin: [0, 0, 0], h, vel, solid, velocity: U, uLat: 0.05, fluid, flowAxis: 0, flowSign: 1 };
}

test('tiny particles in a uniform stream: they move with it and all leave by the outlet', () => {
  const f = flowOf([60, 12, 12], 1, 5);
  const r = particleStudy(f, { diameter: 1, density: 1000, count: 16, gravity: [0, 0, 0] });
  assert.ok(r.ok);
  assert.equal(r.fates.escaped, r.tracked);
  for (const path of r.paths) for (const q of path.slice(2)) assert.ok(Math.abs(q[4] - 5) < 0.01, `speed ${q[4]}`);
  assert.ok(r.stokes < 1e-3);
});

test('a 50 µm sand grain in still water settles at the Stokes velocity (ρp − ρf) g d² / 18μ', () => {
  const f = flowOf([10, 10, 400], 1, 1e-9, () => false, FLUIDS.water);
  f.vel.fill(0);
  const d = 50e-6, mu = FLUIDS.water.viscosity * FLUIDS.water.density, want = ((2650 - 998.2) * 9.81 * d * d) / (18 * mu);
  const r = particleStudy(f, { diameter: 50, density: 2650, seeds: [[5, 5, 390]], maxTime: 0.5 });
  const path = r.paths[0], last = path.at(-1);
  // Re_p ≈ 0.1: Stokes' drag with the Schiller–Naumann correction 1 + 0.15 Re^0.687 (≈ 3 %), solved for v.
  let v = want; for (let i = 0; i < 50; i++) v = want / (1 + 0.15 * ((FLUIDS.water.density * v * d) / mu) ** 0.687);
  assert.ok(Math.abs(last[4] - v) < 0.005 * v, `${last[4]} vs ${v} (Stokes ${want})`);
  assert.ok(v < want && v > 0.95 * want);
});

test('heavy grains on a 45° wall: erosion K·v^n·f(45°) per kg, they bounce off; a square impact erodes nothing', () => {
  // A ramp: solid where i − 30 > j (a wall at 45° across the stream), 10 m/s air, 300 µm sand.
  const f = flowOf([60, 20, 6], 1, 10, (i, j) => i - 30 > j);
  const r = particleStudy(f, { diameter: 300, density: 2650, count: 9, seeds: [[2, 4.5, 3], [2, 6.5, 3], [2, 8.5, 3]], massFlow: 0.003, gravity: [0, 0, 0], erosion: { K: 2e-9, n: 2.6 } });
  assert.ok(r.impacts.length >= 3, `${r.impacts.length} impacts`);
  const first = r.impacts.slice(0, 3);
  for (const im of first) assert.ok(Math.abs(im.angle - 45) < 12, `angle ${im.angle}`);
  const v = first.reduce((s, x) => s + x.speed, 0) / first.length;
  const want = 0.003 * 2e-9 * v ** 2.6 * erosionAngle(Math.PI / 4);   // the first impacts of 1 kg/s × 3 grains share it
  const firstLoss = first.reduce((s, im) => s + 2e-9 * im.speed ** 2.6 * erosionAngle((im.angle * Math.PI) / 180) * 0.001, 0);
  assert.ok(Math.abs(firstLoss - want) < 0.3 * want, `${firstLoss} vs ${want}`);
  assert.ok(r.maxErosion > 0 && r.erosionAt);
  // Square to the stream: a wall at i ≥ 40.
  const g = flowOf([60, 12, 6], 1, 10, (i) => i >= 40);
  const s = particleStudy(g, { diameter: 300, density: 2650, seeds: [[2, 6, 3]], gravity: [0, 0, 0] });
  assert.ok(s.impacts.length >= 1 && s.impacts[0].angle > 80);
  assert.ok(s.totalErosion < 1e-15, String(s.totalErosion));
  assert.ok(Math.abs(erosionAngle(Math.PI / 2)) < 1e-12 && erosionAngle(Math.PI / 12) > erosionAngle(Math.PI / 4));
});
