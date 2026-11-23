// Radiation in the heat study (src/cad/fem/thermal.js): a rod held at 200 °C at one end and radiating from the other
// end face settles where the conduction k (T0 − Ts) / L equals εσ (Ts⁴ − T∞⁴) — the 1D answer; the heat balance
// closes; a black body loses more than a polished one; and in time the rod approaches the steady state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { heatStudy } from '../../src/cad/fem/thermal.js';
import { boxMesh } from './fem-shapes.js';

const SIGMA = 5.670374419e-8;
const rodSurface = (eps, k = 15, L = 100, T0 = 200, Tinf = 20) => {
  // k (T0 − Ts) / L = εσ (Ts⁴ − T∞⁴), per unit area (SI): bisection on Ts.
  let lo = Tinf, hi = T0;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; const f = (k * (T0 - m)) / (L / 1000) - eps * SIGMA * ((m + 273.15) ** 4 - (Tinf + 273.15) ** 4); if (f > 0) lo = m; else hi = m; }
  return (lo + hi) / 2;
};
const study = (eps, extra = {}) => heatStudy({
  bodies: [{ mesh: boxMesh(100, 10, 10, 2), material: { k: 15, cp: 500, density: 8000 } }],
  temperatures: [{ faceId: 0, value: 200 }], radiations: [{ faceId: 1, emissivity: eps, ambient: 20 }], mesh: { size: 3, order: 2 }, ...extra,
});
const endT = (r) => { let s = 0, n = 0; for (let i = 0; i < r.model.nn; i++) if (r.nodes[3 * i] > 100 - 1e-6) { s += r.nodeTemperature[i]; n++; } return s / n; };

test('a rod radiating from its end face: the end temperature matches the 1D balance', () => {
  const r = study(0.9);
  assert.equal(r.ok, true, r.error);
  const Ts = rodSurface(0.9);
  assert.ok(Math.abs(endT(r) - Ts) < 0.005 * (200 - Ts), `end ${endT(r)} vs ${Ts}`);
  // Heat balance: what goes in at the hot end leaves by radiation.
  assert.ok(Math.abs(r.heatFlowIn - r.radiationOut) < 0.01 * r.radiationOut, `${r.heatFlowIn} in vs ${r.radiationOut} out`);
  const qExpected = 0.9 * SIGMA * ((Ts + 273.15) ** 4 - 293.15 ** 4) * 1e-4;   // W through 10 × 10 mm
  assert.ok(Math.abs(r.radiationOut - qExpected) < 0.01 * qExpected);
});

test('a black end loses more heat than a polished one (lower end temperature)', () => {
  const black = study(1), shiny = study(0.05);
  assert.ok(endT(black) < endT(shiny) - 5, `${endT(black)} vs ${endT(shiny)}`);
  assert.ok(black.radiationOut > shiny.radiationOut);
});

test('radiation alone (no fixed face) with heat put in: settles where the input equals the radiated heat', () => {
  const r = heatStudy({ bodies: [{ mesh: boxMesh(20, 20, 20, 2), material: { k: 200 } }], fluxes: [{ faceId: 0, power: 5 }], radiations: [0, 1, 2, 3, 4, 5].map((f) => ({ faceId: f, emissivity: 0.8, ambient: 25 })), mesh: { size: 4, order: 1 } });
  assert.equal(r.ok, true, r.error);
  assert.ok(Math.abs(r.radiationOut - 5) < 0.02 * 5, `radiated ${r.radiationOut} W`);
  const T = ((5 / (0.8 * SIGMA * 6 * 4e-4)) + 298.15 ** 4) ** 0.25 - 273.15;   // nearly uniform (k high)
  assert.ok(Math.abs(r.max - T) < 3, `${r.max} vs ${T}`);
});

test('transient: starting cold the radiating rod warms toward the steady end temperature', () => {
  const r = study(0.9, { transient: { duration: 20000, steps: 80, initial: 20, samples: 10 } });
  assert.equal(r.ok, true, r.error);
  const Ts = rodSurface(0.9);
  assert.ok(Math.abs(endT(r) - Ts) < 0.03 * (200 - Ts), `end after a long time ${endT(r)} vs steady ${Ts}`);
  assert.ok(r.history.at(-1).mean > r.history[1].mean);
});
