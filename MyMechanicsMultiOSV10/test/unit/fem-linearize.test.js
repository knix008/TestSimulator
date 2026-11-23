// Stress linearisation (src/cad/fem/linearize.js): a field A + Bx + C(x² − t²/12) through a wall splits exactly
// into membrane A, bending ±Bt/2 and a surface peak Ct²/6; and on a real result — a cantilever's root section —
// the bending stress matches beam theory 6M/(b h²) with almost no membrane.
import test from 'node:test';
import assert from 'node:assert/strict';
import { linearizeSamples, linearizationChecks, linearizeStatic } from '../../src/cad/fem/linearize.js';
import { linearStatic } from '../../src/cad/fem/static.js';
import { boxMesh } from './fem-shapes.js';

const near = (v, e, tol, what) => assert.ok(Math.abs(v - e) <= tol, `${what}: ${v} vs ${e}`);

test('membrane, bending and peak of a known field across a 10 mm wall', () => {
  const t = 10, A = 50, B = 8, C = 2;
  const samples = Array.from({ length: 21 }, (_, i) => { const x = -t / 2 + (i * t) / 20; return [A + B * x + C * (x * x - (t * t) / 12), 0, 0, 0, 0, 0]; });
  const lin = linearizeSamples(samples, t);
  near(lin.membrane[0], A, 1e-9, 'membrane');
  near(Math.abs(lin.bending[0]), (B * t) / 2, 1e-9, 'bending at the surface');
  near(lin.categories.membraneBending.intensity, A + (B * t) / 2, 1e-9, 'Pm + Pb (the larger surface)');
  near(lin.categories.peak.intensity, (C * t * t) / 6, 1e-6, 'peak at a surface');
  near(lin.categories.total.intensity, A + (B * t) / 2 + (C * t * t) / 6, 1e-6, 'total');
  const checks = linearizationChecks(lin, 60);
  assert.deepEqual(checks.map((x) => [x.name, x.ok]), [['Pm', true], ['Pm+Pb', true], ['Pm+Pb+Q+F', true]]);
  assert.equal(linearizationChecks(lin, 40).find((x) => x.name === 'Pm').ok, false);
});

test('a cantilever 100×10×10 with 200 N at the tip: the section through the height at x = 40 is pure bending 6M/(b h²)', () => {
  const r = linearStatic({ bodies: [{ mesh: boxMesh(100, 10, 10, 2), material: { E: 210000, nu: 0.3, yield: 250 } }], fixtures: [0], loads: [{ faceId: 1, force: [0, 0, -200] }], mesh: { size: 1.8 } });
  assert.equal(r.ok, true, r.error);
  const lin = linearizeStatic(r, [40, 5, 0.001], [40, 5, 9.999], 21);
  assert.equal(lin.ok, true, lin.error);
  const M = 200 * 60, sb = (6 * M) / (10 * 100);       // 72 MPa
  near(Math.abs(lin.bending[0]), sb, 0.03 * sb, 'bending σxx');
  assert.ok(Math.abs(lin.membrane[0]) < 0.03 * sb, `membrane ${lin.membrane[0]}`);
  assert.equal(linearizeStatic(r, [40, 5, 0], [40, 5, 0]).ok, false);
});
