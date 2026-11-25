// Compressible flow (cfd/euler.js): the Sod shock tube against its exact Riemann solution, a cube at Mach 0.5 with
// the isentropic stagnation pressure on its face, and at Mach 2 behind a bow shock (Rayleigh pitot).
import test from 'node:test';
import assert from 'node:assert/strict';
import { eulerRun, riemannDensity, compressibleStudy, pitotRatio } from '../../src/cad/cfd/euler.js';
import { boxMesh } from './fem-shapes.js';

test('Sod shock tube: density within L1 0.006 of the exact solution at t = 0.2 (200 cells, MUSCL + HLL)', () => {
  const n = 200, h = 1 / n;
  const r = eulerRun({ dims: [n, 1, 1], h, init: (s) => (s < n / 2 ? [1, 0, 0, 0, 1] : [0.125, 0, 0, 0, 0.1]), bc: { axis: 0, sign: 1, inflow: null, outflow: 'extrapolate', lateral: 'extrapolate' }, tEnd: 0.2, steps: 100000, cfl: 0.4 });
  let err = 0; for (let i = 0; i < n; i++) err += Math.abs(r.rho[i] - riemannDensity([1, 0, 1], [0.125, 0, 0.1], ((i + 0.5) * h - 0.5) / 0.2)) * h;
  assert.ok(err < 0.006, `L1 ${err}`);
  // First order is more diffusive.
  const r1 = eulerRun({ dims: [n, 1, 1], h, init: (s) => (s < n / 2 ? [1, 0, 0, 0, 1] : [0.125, 0, 0, 0, 0.1]), bc: { axis: 0, outflow: 'extrapolate', lateral: 'extrapolate' }, tEnd: 0.2, steps: 100000, cfl: 0.4, order: 1 });
  let e1 = 0; for (let i = 0; i < n; i++) e1 += Math.abs(r1.rho[i] - riemannDensity([1, 0, 1], [0.125, 0, 0.1], ((i + 0.5) * h - 0.5) / 0.2)) * h;
  assert.ok(e1 > err);
});

test('a cube at Mach 0.5: the stagnation pressure on its face is the isentropic one, no shock', () => {
  const r = compressibleStudy(boxMesh(10, 10, 10, 2), { mach: 0.5, resolution: 6, steps: 900 });
  assert.ok(r.ok);
  const want = pitotRatio(0.5) * 101325;
  assert.ok(Math.abs(r.stagnationPressure / want - 1) < 0.03, `${r.stagnationPressure} vs ${want}`);
  assert.equal(r.shock, false);
  assert.ok(r.maxMach < 1 && r.dragCoefficient > 0.5);
});

test('a cube at Mach 2: a bow shock ahead, the face near the Rayleigh pitot pressure, supersonic around', () => {
  const r = compressibleStudy(boxMesh(10, 10, 10, 2), { mach: 2, resolution: 6, steps: 900 });
  assert.ok(r.ok && r.shock);
  const want = pitotRatio(2) * 101325;
  assert.ok(Math.abs(pitotRatio(2) - 5.64) < 0.01);
  assert.ok(r.stagnationPressure < want * 1.02 && r.stagnationPressure > want * 0.82, `${r.stagnationPressure / 101325} vs ${want / 101325}`);
  assert.ok(r.maxMach > 1.5 && r.dragCoefficient > 1);
});
