// Fiber orientation (src/cad/plastics-fiber.js): Folgar–Tucker with the hybrid closure behaves as the literature
// says — simple shear lines fibers up with the flow (a11 ≈ 0.8 at C_I = 0.01) at a value that depends on the strain
// only, stretching aligns them fully, a diverging flow turns them across — and over a plate the skin follows the
// flow while the core of a centre-gated disc turns tangential.
import test from 'node:test';
import assert from 'node:assert/strict';
import { eigenSym3, folgarTuckerRate, integrateOrientation, interactionCoefficient, fiberOrientation } from '../../src/cad/plastics-fiber.js';
import { plateDomain } from '../../src/cad/plastics.js';

const R = [1 / 3, 0, 0, 0, 1 / 3, 0, 0, 0, 1 / 3];
const tr = (A) => A[0] + A[4] + A[8];

test('symmetric eigen-decomposition: values sorted, vectors orthonormal, A v = λ v', () => {
  const M = [4, 1, 0.5, 1, 3, 0.2, 0.5, 0.2, 1];
  const { values, vectors } = eigenSym3(M);
  assert.ok(values[0] >= values[1] && values[1] >= values[2]);
  assert.ok(Math.abs(values[0] + values[1] + values[2] - 8) < 1e-12);
  for (let k = 0; k < 3; k++) {
    const v = vectors[k];
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(M[3 * i] * v[0] + M[3 * i + 1] * v[1] + M[3 * i + 2] * v[2] - values[k] * v[i]) < 1e-9);
    assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-12);
  }
});

test('random fibers at rest stay random; the rate keeps the trace', () => {
  const { rate } = folgarTuckerRate(R, new Array(9).fill(0));
  assert.ok(rate.every((v) => Math.abs(v) < 1e-15));
  const L = [0, 0, 5, 0, 0, 0, 0, 0, 0];                                  // ∂u/∂z = 5 1/s
  const r2 = folgarTuckerRate(R, L).rate;
  assert.ok(Math.abs(r2[0] + r2[4] + r2[8]) < 1e-12);
});

test('simple shear: the steady state lines fibers up with the flow (a11 ≈ 0.8 at C_I 0.01) and depends on the strain only', () => {
  const L = (g) => [0, 0, g, 0, 0, 0, 0, 0, 0];
  const A = integrateOrientation(R, L(10), 20, { CI: 0.01, maxSteps: 4000, maxStrain: 400 });
  assert.ok(A[0] > 0.7 && A[0] < 0.9, `a11 ${A[0]}`);
  assert.ok(A[8] < 0.15 && A[4] < 0.2, `a33 ${A[8]}, a22 ${A[4]}`);
  assert.ok(Math.abs(tr(A) - 1) < 1e-12);
  assert.ok(Math.abs(A[2] - A[6]) < 1e-15, 'symmetric');
  const B = integrateOrientation(R, L(100), 2, { CI: 0.01, maxSteps: 4000, maxStrain: 400 });
  assert.ok(Math.abs(A[0] - B[0]) < 1e-6, 'the same strain gives the same orientation');
  const lowCI = integrateOrientation(R, L(10), 20, { CI: 0.001, maxSteps: 4000, maxStrain: 400 });
  assert.ok(lowCI[0] > A[0], 'less interaction, more alignment');
});

test('stretching along x aligns fibers fully; a diverging flow (x slowing, y widening) turns them across', () => {
  const ext = integrateOrientation(R, [1, 0, 0, 0, -0.5, 0, 0, 0, -0.5], 10, { CI: 0 });
  assert.ok(ext[0] > 0.97, `a11 ${ext[0]}`);
  const div = integrateOrientation(R, [-1, 0, 0, 0, 1, 0, 0, 0, 0], 5, { CI: 0.01 });
  assert.ok(div[4] > div[0] + 0.3, `a22 ${div[4]} vs a11 ${div[0]}`);
});

test('interaction coefficient falls with fiber content (Bay)', () => {
  assert.ok(interactionCoefficient(0.05, 20) > interactionCoefficient(0.2, 20));
  assert.ok(Math.abs(interactionCoefficient(0, 20) - 0.0184) < 1e-12);
});

test('a plate filled from its left edge: the skin follows the flow, the core less; the tensors keep trace 1', () => {
  const d = plateDomain(24, 10, 2, () => 3);
  const fill = { fillTime: Float64Array.from(d.nodes, (n) => n.c[0] / 40) };   // 40 mm/s from x = 0
  const r = fiberOrientation(d, fill, { fraction: 0.3, layers: 5, maxSteps: 120 });
  const mid = d.nodes.findIndex((n) => Math.abs(n.c[0] - 15) < 1.1 && Math.abs(n.c[1] - 9) < 1.1);
  assert.ok(r.skin[mid] > 0.6, `skin ${r.skin[mid]}`);
  // A straight flow of constant thickness has no in-plane stretching: the core turns only with its (small) shear,
  // so it is less aligned than the skin but still with the flow.
  assert.ok(r.skin[mid] >= r.core[mid] && r.core[mid] > 1 / 3, `skin ${r.skin[mid]} vs core ${r.core[mid]}`);
  for (let i = 0; i < d.nodes.length; i += 17) assert.ok(Math.abs(r.tensor[9 * i] + r.tensor[9 * i + 4] + r.tensor[9 * i + 8] - 1) < 1e-9);
  const last = d.nodes.findIndex((n) => n.c[0] > 46);
  assert.ok(Math.abs(r.alignment[last] - 1 / 3) < 0.05, 'filled last: no time to orient');
});

test('a centre-gated disc: radial flow slows as it widens, so the core turns tangential while the skin stays radial', () => {
  const N = 41, cell = 2, c0 = (N * cell) / 2;
  const d = plateDomain(N, N, cell, (x, y) => (Math.hypot(x - c0, y - c0) < 40 ? 2 : 0));
  const fill = { fillTime: Float64Array.from(d.nodes, (n) => (Math.hypot(n.c[0] - c0, n.c[1] - c0) ** 2) / 800) };   // constant flow rate: area ∝ t
  const r = fiberOrientation(d, fill, { fraction: 0.3, layers: 6, maxSteps: 150 });
  const i = d.nodes.findIndex((n) => Math.abs(n.c[0] - c0 - 15) < 1.1 && Math.abs(n.c[1] - c0) < 1.1);
  assert.ok(r.core[i] < 0.3, `core flow component ${r.core[i]} (below random: across the flow)`);
  assert.ok(r.skin[i] > 0.5, `skin flow component ${r.skin[i]}`);
});
