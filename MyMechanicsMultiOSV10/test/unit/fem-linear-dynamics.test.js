// Linear dynamics by mode superposition (src/cad/fem/dynamic.js) on a steel cantilever 100×10×10 fixed at x = 0:
// a slow sine gives the static deflection, resonance amplifies it by about 1/(2ζ), a suddenly applied load overshoots
// to 1 + e^(−ζπ/√(1−ζ²)) times static, a white base-acceleration PSD gives the single-mode RMS (Γφ)²·S/(8ζω³), and the
// PSD helpers integrate log-log tables exactly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dynamicStudy, psdAt, psdRms, G } from '../../src/cad/fem/dynamic.js';
import { linearStatic } from '../../src/cad/fem/static.js';
import { boxMesh } from './fem-shapes.js';

const STEEL = { E: 210000, nu: 0.3, yield: 250, density: 7850 };
const within = (v, e, rel, what) => assert.ok(Math.abs(v - e) <= rel * Math.abs(e), `${what}: ${v} vs ${e} (±${rel * 100}%)`);
const beam = () => ({ bodies: [{ mesh: boxMesh(100, 10, 10, 2), material: STEEL }], fixtures: [0], mesh: { size: 3.4 } });
const tip = [{ faceId: 1, force: [0, 0, -100] }];
let staticTip = null;
const stat = () => (staticTip ??= linearStatic({ ...beam(), loads: tip }).maxDisplacement);

test('harmonic: a slow sine gives the static deflection; at the first frequency it is amplified about 1/(2ζ)', () => {
  const zeta = 0.02;
  const slow = dynamicStudy({ ...beam(), modes: 10, damping: zeta, kind: 'harmonic', excitation: { type: 'force', loads: tip }, harmonic: { from: 1, to: 2, steps: 3, at: 1 } });
  assert.equal(slow.ok, true, slow.error);
  within(slow.maxDisplacement, stat(), 0.04, 'quasi-static amplitude (10 modes)');
  const f1 = slow.frequencies[0];
  const res = dynamicStudy({ ...beam(), modes: 10, damping: zeta, kind: 'harmonic', excitation: { type: 'force', loads: tip }, harmonic: { from: 0.5 * f1, to: 1.5 * f1, steps: 60 } });
  within(res.peakFrequency, f1, 0.01, 'peak at the first natural frequency');
  const ratio = res.maxDisplacement / stat();
  assert.ok(ratio > 0.85 / (2 * zeta) && ratio < 1.05 / (2 * zeta), `amplification ${ratio} ≈ 0.97/(2ζ) = ${0.97 / (2 * zeta)}`);
  assert.ok(res.maxStress > 0 && res.curve.frequency.length === res.curve.displacement.length);
});

test('transient: a suddenly applied tip load overshoots to 1 + e^(−ζπ/√(1−ζ²)) times the static deflection', () => {
  const zeta = 0.02;
  const r0 = dynamicStudy({ ...beam(), modes: 6, damping: zeta, kind: 'harmonic', excitation: { type: 'force', loads: tip }, harmonic: { from: 1, to: 2, steps: 2 } });
  const T1 = 1 / r0.frequencies[0];
  const r = dynamicStudy({ ...beam(), modes: 6, damping: zeta, kind: 'transient', excitation: { type: 'force', loads: tip }, transient: { duration: 3 * T1, curve: [[0, 1], [10, 1]] } });
  assert.equal(r.ok, true, r.error);
  within(r.maxDisplacement / stat(), 1 + Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta * zeta)), 0.06, 'dynamic overshoot');
  within(r.peakTime, T1 / 2, 0.15, 'the first peak half a period in');
});

test('random: a white base acceleration along z gives the single-mode RMS (Γφ)² S / (8ζω³) at the tip', () => {
  const zeta = 0.03, S = (0.1 * G) ** 2;           // 0.01 g²/Hz
  const r0 = dynamicStudy({ ...beam(), modes: 4, damping: zeta, kind: 'harmonic', excitation: { type: 'base', axis: 'z', acceleration: G }, harmonic: { from: 1, to: 2, steps: 2 } });
  const fz = r0.frequencies.find((f, i) => r0.effectiveMass[i][2] > 0.3);
  const r = dynamicStudy({ ...beam(), modes: 4, damping: zeta, kind: 'random', excitation: { type: 'base', axis: 'z', acceleration: G }, random: { psd: [[0.1 * fz, S], [10 * fz, S]], steps: 300 } });
  assert.equal(r.ok, true, r.error);
  // Γφ at the tip for the z mode = the quasi-static tip deflection per unit acceleration × ω² (single mode).
  const g1 = dynamicStudy({ ...beam(), modes: 4, damping: zeta, kind: 'harmonic', excitation: { type: 'base', axis: 'z', acceleration: 1 }, harmonic: { from: 0.01 * fz, to: 0.011 * fz, steps: 2, at: 0.01 * fz } });
  const w = 2 * Math.PI * fz, gphi = g1.maxDisplacement * w * w;
  within(r.maxDisplacementRms, Math.sqrt((gphi * gphi * S) / (8 * zeta * w ** 3)), 0.12, 'tip RMS (one mode)');
  within(r.inputRms, Math.sqrt(S * 9.9 * fz), 1e-6, 'input RMS of a flat PSD');
  assert.ok(r.maxStressRms > 0 && r.sigma3.stress === 3 * r.maxStressRms);
});

test('PSD tables: log-log interpolation and exact integration (a −3 dB/oct slope)', () => {
  const t = [[20, 0.01], [80, 0.04], [350, 0.04], [2000, 0.007]];
  within(psdAt(t, 40), 0.02, 1e-9, '+3 dB/oct');
  assert.equal(psdAt(t, 10), 0); assert.equal(psdAt(t, 3000), 0);
  // ∫ over the flat part is exact; the whole table against fine numerical integration.
  let num = 0; for (let f = 20; f < 2000; f += 0.05) num += 0.5 * (psdAt(t, f) + psdAt(t, f + 0.05)) * 0.05;
  within(psdRms(t) ** 2, num, 1e-4, 'mean square');
});
