// Section properties (section-props.js): a rectangle, a tube and an L section against the textbook formulas.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../src/cad/features.js';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { sectionProperties } from '../../src/cad/section-props.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const XY = (z) => ({ origin: [0, 0, z], xDir: [1, 0, 0], yDir: [0, 1, 0], normal: [0, 0, 1] });

test('a 40 × 20 rectangle: A = bh, Iu = b h³/12, Iv = h b³/12, no product, principal along the axes', () => {
  const p = sectionProperties(R.makeBox([-5, 0, 0], [35, 20, 50]), XY(25));
  near(p.area, 800); near(p.cu, 15); near(p.cv, 10);
  near(p.Iu, (40 * 20 ** 3) / 12); near(p.Iv, (20 * 40 ** 3) / 12); near(p.Iuv, 0, 1e-6);
  near(p.I1, (20 * 40 ** 3) / 12); near(p.J, p.Iu + p.Iv); near(p.ru, Math.sqrt(p.Iu / 800));
});

test('a tube Ø20 / Ø16: A = π(R² − r²), I = π(R⁴ − r⁴)/4 both ways, J = twice that', () => {
  const tube = R.makeCylinder(10, 30, [0, 0, 0], [0, 0, 1]).cut(R.makeCylinder(8, 30, [0, 0, 0], [0, 0, 1]));
  const p = sectionProperties(tube, XY(12));
  near(p.area, Math.PI * (100 - 64), 1e-6);
  near(p.Iu, (Math.PI * (1e4 - 4096)) / 4, 1e-6); near(p.Iv, p.Iu, 1e-6); near(p.J, (Math.PI * (1e4 - 4096)) / 2, 1e-6);
});

test('an L section (equal legs 30 × 30, 5 thick): the product of inertia and principal axes at 45°', () => {
  const L = R.makeBox([0, 0, 0], [30, 5, 10]).fuse(R.makeBox([0, 0, 0], [5, 30, 10]));
  const p = sectionProperties(L, XY(5));
  const A = 30 * 5 + 25 * 5; near(p.area, A);
  // Centroid of the L: (Σ A x)/A.
  const cx = (150 * 15 + 125 * 2.5) / A; near(p.cu, cx); near(p.cv, cx);
  // Iu about the centroid: parts' own moments plus A d².
  const Iu = (30 * 5 ** 3) / 12 + 150 * (2.5 - cx) ** 2 + (5 * 25 ** 3) / 12 + 125 * (17.5 - cx) ** 2;
  near(p.Iu, Iu); near(p.Iv, Iu);
  const Iuv = 150 * (15 - cx) * (2.5 - cx) + 125 * (2.5 - cx) * (17.5 - cx);
  near(p.Iuv, Iuv);
  near(Math.abs(p.angle), 45, 1e-6);
  assert.equal(sectionProperties(L, XY(50)), null);
});
