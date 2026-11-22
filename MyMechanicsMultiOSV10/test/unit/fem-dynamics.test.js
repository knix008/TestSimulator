// Heat conduction, natural frequencies and buckling on quadratic tetrahedra (src/cad/fem/thermal.js, modal.js):
// a bar between two temperatures (linear profile, k·A·ΔT/L), a heated bar end, transient cooling of a slab against the
// Fourier series, a convection fin, the bending frequencies of a cantilever (Euler–Bernoulli / Timoshenko) with
// effective masses, and the Euler buckling load of a cantilever column.
import test from 'node:test';
import assert from 'node:assert/strict';
import { heatStudy, probeTemperature, temperatureLine } from '../../src/cad/fem/thermal.js';
import { modalStudy, bucklingStudy } from '../../src/cad/fem/modal.js';
import { thermal } from '../../src/cad/fea.js';
import { boxMesh } from './fem-shapes.js';

const STEEL = { E: 210000, nu: 0.3, yield: 250, density: 7850, k: 50, cp: 500 };
const within = (v, e, rel, what) => assert.ok(Math.abs(v - e) <= rel * Math.abs(e), `${what}: ${v} vs ${e} (±${rel * 100}%)`);

test('bar 100×10×10 between 100 °C and 0 °C: linear profile and heat flow k·A·ΔT/L', () => {
  const r = heatStudy({ bodies: [{ mesh: boxMesh(100, 10, 10, 2), material: STEEL }], temperatures: [{ faceId: 0, value: 100 }, { faceId: 1, value: 0 }], mesh: { size: 5 } });
  assert.equal(r.ok, true, r.error);
  within(r.faceHeatFlow[1].value, (0.05 * 100 * 100) / 100, 1e-6, 'heat flow');
  for (const p of temperatureLine(r, [0, 5, 5], [100, 5, 5], 11)) within(p.value + 1e-9, 100 - p.s + 1e-9, 1e-6, `T at x = ${p.s}`);
});

test('heat power into one end: ΔT = P·L/(k·A); balance of the power in and out', () => {
  const r = thermal(boxMesh(100, 10, 10, 2), { material: { k: 50 }, temperatures: [{ faceId: 0, value: 20 }], fluxes: [{ faceId: 1, power: 5 }], elementSize: 5 });
  within(probeTemperature(r, [100, 5, 5]) - 20, (5 * 100) / (0.05 * 100), 1e-4, 'end temperature rise');
  within(r.heatFlowOut, 5, 1e-6, 'heat out = power in');
});

test('transient: a slab cooled at one face follows the Fourier series (backward Euler)', () => {
  const r = heatStudy({ bodies: [{ mesh: boxMesh(100, 10, 10, 2), material: STEEL }], temperatures: [{ faceId: 0, value: 0 }], mesh: { size: 5 }, transient: { duration: 300, steps: 150, initial: 100, probes: [[100, 5, 5]] } });
  const alpha = 0.05 / (7850e-9 * 500), L = 100;
  const exact = (t) => { let s = 0; for (let n = 0; n < 60; n++) { const k = ((2 * n + 1) * Math.PI) / (2 * L); s += (400 / ((2 * n + 1) * Math.PI)) * Math.sin(k * L) * Math.exp(-k * k * alpha * t); } return s; };
  for (const h of r.history.filter((x) => x.time > 50)) within(h.probes[0], exact(h.time), 0.02, `T(L) at ${h.time} s`);
});

test('convection fin (80 °C root, h = 25 W/m²K): fin theory tip temperature', () => {
  const L = 100, k = 167, hc = 25e-6, P = 40, A = 100, m = Math.sqrt((hc * P) / ((k * 1e-3) * A)), mL = m * L;
  const r = heatStudy({ bodies: [{ mesh: boxMesh(L, 10, 10, 2), material: { k, cp: 896, density: 2700 } }], temperatures: [{ faceId: 0, value: 80 }], convections: [1, 2, 3, 4, 5].map((faceId) => ({ faceId, h: 25, ambient: 20 })), mesh: { size: 5 } });
  const hk = hc / (k * 1e-3), tip = (Math.cosh(0) + (hk / m) * Math.sinh(0)) / (Math.cosh(mL) + (hk / m) * Math.sinh(mL));
  within(probeTemperature(r, [L, 5, 5]) - 20, 60 * tip, 0.01, 'tip excess temperature');
  within(r.heatFlowIn, r.convectionOut, 1e-3, 'heat balance: in at the root = convected away');
});

test('steel cantilever 100×10×10: bending frequencies (Timoshenko-corrected Euler–Bernoulli) and effective mass', () => {
  const r = modalStudy({ bodies: [{ mesh: boxMesh(100, 10, 10, 2), material: STEEL }], fixtures: [0], modes: 4, mesh: { size: 3.4 } });
  assert.equal(r.ok, true, r.error);
  const EI = 210000 * (10 ** 4 / 12), rA = 7850e-12 * 100, f = (b) => ((b * b) / (2 * Math.PI)) * Math.sqrt(EI / (rA * 100 ** 4));
  within(r.frequencies[0], f(1.8751), 0.01, 'first bending (EB)');
  within(r.frequencies[1], r.frequencies[0], 1e-3, 'square section: equal pair');
  within(r.frequencies[2], f(4.6941) * 0.955, 0.02, 'second bending (with shear and rotary inertia, ≈ −4.5 %)');
  const m1 = r.effectiveMass[0];
  within(m1[1] + m1[2], 0.613, 0.04, 'first mode effective mass fraction (0.613 for a cantilever)');
});

test('Euler buckling of a 200 mm cantilever column: P = π²EI/4L², two equal modes, tension buckles reversed', () => {
  const euler = (Math.PI ** 2 * 210000 * (10 ** 4 / 12)) / (4 * 200 * 200);
  const r = bucklingStudy({ bodies: [{ mesh: boxMesh(200, 10, 10, 2), material: STEEL }], fixtures: [0], loads: [{ faceId: 1, force: [-1000, 0, 0] }], mesh: { size: 3.4 }, modes: 2 });
  assert.equal(r.ok, true, r.error);
  within(r.loadFactor, euler / 1000, 0.01, 'load factor');
  within(r.loadFactors[1], r.loadFactors[0], 2e-3, 'equal pair');
  const t = bucklingStudy({ bodies: [{ mesh: boxMesh(200, 10, 10, 2), material: STEEL }], fixtures: [0], loads: [{ faceId: 1, force: [1000, 0, 0] }], mesh: { size: 5 } });
  assert.ok(t.loadFactor < 0, 'tension');
});
