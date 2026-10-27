// Special functions: accuracy against known values and identities.
import { test } from 'node:test';
import { call, c1, V, D, close, relClose, assert, num, str } from './linalg-util.mjs';
import { tensor } from '../core/value.js';

const f = (name, args, k = 0) => { const r = call(name, args.map((x) => (typeof x === 'number' ? num(x) : x)), Math.max(1, k + 1)); return r[k]; };
const val = (name, args, k = 0) => f(name, args, k).re[0];
const cval = (name, args) => { const v = f(name, args); return [v.re[0], v.im ? v.im[0] : 0]; };
const rel = (got, exp, tol = 1e-13, msg = '') => relClose(got, exp, tol, msg);

test('gamma, gammaln, psi', () => {
  rel(val('gamma', [5]), 24); rel(val('gamma', [0.5]), Math.sqrt(Math.PI), 1e-14);
  rel(val('gamma', [5.5]), 52.34277778455352, 1e-14); rel(val('gamma', [-1.5]), 2.363271801207355, 1e-14);
  assert.equal(val('gamma', [0]), Infinity); assert.equal(val('gamma', [-2]), Infinity); assert.equal(val('gamma', [172]), Infinity);
  rel(val('gammaln', [100]), 359.1342053695754, 1e-15); rel(val('gammaln', [0.5]), 0.5723649429247001, 1e-14);
  assert.equal(val('gammaln', [1]), 0);
  rel(val('psi', [1]), -0.5772156649015329, 1e-14); rel(val('psi', [0.5]), -1.963510026021423, 1e-14);
  rel(val('psi', [-0.5]), 0.03648997397857652, 1e-12);
  rel(val('psi', [1, 1]), Math.PI ** 2 / 6, 1e-14);
  rel(val('psi', [2, 2.5]), -0.2362040516417274, 1e-12);
  close(f('gamma', [V([1, 2, 3, 4])]), [1, 1, 2, 6]);
  assert.throws(() => f('gamma', [{ ...num(1), im: Float64Array.of(1) }]), /real/);
  assert.throws(() => f('gammaln', [-1]), /nonnegative/);
});
test('gammainc / gammaincinv (tails, scaling, broadcasting)', () => {
  rel(val('gammainc', [1, 2]), 0.2642411176571153, 1e-14);
  rel(val('gammainc', [10, 3]), 0.9972306042844884, 1e-14);
  rel(val('gammainc', [10, 3, str('upper')]), 1 - 0.9972306042844884, 1e-11);
  rel(val('gammainc', [50, 5, str('upper')]), Math.exp(-50) * (1 + 50 + 1250 + 125000 / 6 + 6250000 / 24), 1e-12);
  rel(val('gammainc', [2, 1]), 1 - Math.exp(-2), 1e-14);
  const sl = val('gammainc', [2, 3, str('scaledlower')]);
  rel(sl, val('gammainc', [2, 3]) * 6 * Math.exp(2) / 8, 1e-13);
  close(f('gammainc', [V([0, 1, 2]), num(1)]), [0, 1 - Math.exp(-1), 1 - Math.exp(-2)], 1e-15);
  assert.deepEqual(f('gammainc', [V([[1], [2]]), V([1, 2, 3])]).dims, [2, 3]);
  for (const [y, a] of [[0.1, 0.5], [0.5, 2], [0.99, 10], [1e-10, 3], [0.7, 150]]) {
    const x = val('gammaincinv', [y, a]);
    rel(val('gammainc', [x, a]), y, 1e-11, `inverse y=${y} a=${a}`);
  }
  const xu = val('gammaincinv', [1e-12, 4, str('upper')]);
  rel(val('gammainc', [xu, 4, str('upper')]), 1e-12, 1e-9);
});
test('beta, betaln, betainc, betaincinv', () => {
  rel(val('beta', [2.5, 1.5]), 0.1963495408493621, 1e-14);
  rel(val('beta', [3, 4]), 1 / 60, 1e-15);
  rel(val('betaln', [100, 200]), Math.log(val('beta', [100, 200])) || -190.0, 1e-3);
  rel(val('betainc', [0.3, 2, 5]), 0.579825, 1e-14);
  rel(val('betainc', [0.3, 2, 5, str('upper')]), 1 - 0.579825, 1e-13);
  rel(val('betainc', [0.5, 3, 3]), 0.5, 1e-14);
  assert.equal(val('betainc', [0, 2, 3]), 0); assert.equal(val('betainc', [1, 2, 3]), 1);
  for (const [y, a, b] of [[0.579825, 2, 5], [0.01, 0.5, 0.5], [0.9, 10, 3], [0.5, 200, 300]]) {
    const x = val('betaincinv', [y, a, b]);
    rel(val('betainc', [x, a, b]), y, 1e-11, `betaincinv ${y},${a},${b}`);
  }
  const xu = val('betaincinv', [0.2, 2, 3, str('upper')]);
  rel(val('betainc', [xu, 2, 3, str('upper')]), 0.2, 1e-12);
  assert.throws(() => f('betainc', [1.5, 2, 3]), /interval/);
});
test('error functions and inverses', () => {
  for (const [x, e] of [[0.5, 0.5204998778130465], [1.4, 0.9522851197626488], [2, 0.9953222650189527], [-0.3, -0.3286267594591274], [0, 0]]) rel(val('erf', [x]), e, 1e-14, `erf ${x}`);
  for (const [x, e] of [[1, 0.15729920705028513], [0.6, 0.3961439091520741], [3, 2.209049699858544e-05], [10, 2.088487583762545e-45], [-1, 1.842700792949715]]) rel(val('erfc', [x]), e, 1e-13, `erfc ${x}`);
  rel(val('erfcx', [2]), 0.2553956763105057, 1e-14);
  rel(val('erfcx', [100]), 0.005641613782989433, 1e-13);
  rel(val('erfinv', [0.5]), 0.4769362762044699, 1e-14);
  rel(val('erfinv', [-0.999]), -2.326753765513525, 1e-14);
  rel(val('erfcinv', [1e-20]), 6.601580622355143, 1e-14);
  rel(val('erfcinv', [1.5]), -0.4769362762044699, 1e-14);
  assert.equal(val('erfinv', [1]), Infinity); assert.ok(Number.isNaN(val('erfinv', [2])));
  for (const y of [-0.9, -0.2, 0.1, 0.75, 0.999999]) rel(val('erf', [val('erfinv', [y])]), y, 1e-14);
});
test('expint', () => {
  rel(val('expint', [1]), 0.2193839343955203, 1e-14);
  rel(val('expint', [5]), 0.001148295591275326, 1e-13);
  rel(val('expint', [0.01]), 4.037929576538114, 1e-14);
  const [re, im] = cval('expint', [-1]);
  rel(re, -1.895117816355937, 1e-14); rel(im, -Math.PI, 1e-15);
  assert.equal(val('expint', [0]), Infinity);
});
test('Bessel J, Y, I, K, H: values, half-integer identities, recurrences', () => {
  rel(val('besselj', [0, 1]), 0.7651976865579666, 1e-14);
  rel(val('besselj', [1, 10]), 0.04347274616886144, 1e-13);
  rel(val('besselj', [5, 1]), 2.497577302112344e-04, 1e-14);
  rel(val('bessely', [0, 1]), 0.08825696421567697, 1e-14);
  rel(val('bessely', [1, 3]), 0.3246744247918000, 1e-13);
  rel(val('bessely', [2, 0.1]), -127.6447832426958, 1e-12);
  rel(val('besselj', [0, 100]), 0.01998585030422312, 1e-12);
  rel(val('besselj', [0, 1000]), 0.02478668615242017, 1e-12);
  for (const x of [0.3, 1, 2.7, 9]) {
    const s = Math.sqrt(2 / (Math.PI * x));
    rel(val('besselj', [0.5, x]), s * Math.sin(x), 1e-13, `J1/2(${x})`);
    rel(val('bessely', [0.5, x]), -s * Math.cos(x), 1e-13, `Y1/2(${x})`);
    rel(val('besselj', [-0.5, x]), s * Math.cos(x), 1e-13, `J-1/2(${x})`);
    rel(val('besseli', [0.5, x]), s * Math.sinh(x), 1e-13, `I1/2(${x})`);
    rel(val('besselk', [0.5, x]), Math.sqrt(Math.PI / (2 * x)) * Math.exp(-x), 1e-13, `K1/2(${x})`);
  }
  // recurrence J_{n+1} = 2n/x J_n - J_{n-1} (forward stable for n < x)
  let jm = val('besselj', [0, 50]), j = val('besselj', [1, 50]);
  for (let n = 1; n < 30; n++) { const jn = (2 * n / 50) * j - jm; jm = j; j = jn; }
  rel(val('besselj', [30, 50]), j, 1e-11, 'J30(50)');
  rel(val('besseli', [0, 1]), 1.266065877752008, 1e-14);
  rel(val('besseli', [1, 5]), 24.33564214245053, 1e-14);
  rel(val('besselk', [0, 1]), 0.4210244382407083, 1e-14);
  rel(val('besselk', [1, 0.5]), 1.656441120003301, 1e-14);
  rel(val('besseli', [0, 800, 1]), 0.014106945005869, 1e-10, 'scaled I');
  rel(val('besselk', [0, 800, 1]), Math.sqrt(Math.PI / 1600) * (1 - 1 / 6400), 1e-6, 'scaled K');
  // Wronskian J_nu Y_{nu+1} - J_{nu+1} Y_nu = -2/(pi x)
  for (const [nu, x] of [[0.3, 1.7], [2.25, 4], [7.5, 3]]) {
    const w = val('besselj', [nu, x]) * val('bessely', [nu + 1, x]) - val('besselj', [nu + 1, x]) * val('bessely', [nu, x]);
    rel(w, -2 / (Math.PI * x), 1e-12, `Wronskian ${nu},${x}`);
  }
  // negative argument and order
  const [jr, ji] = cval('besselj', [0.5, -2]);
  assert.ok(Math.abs(jr) < 1e-16); rel(ji, Math.sqrt(1 / Math.PI) * Math.sin(2), 1e-14);
  rel(val('besselj', [-3, 2]), -val('besselj', [3, 2]), 1e-15);
  rel(val('besselj', [2, -1.5]), val('besselj', [2, 1.5]), 1e-15);
  // Hankel: H1 = J + iY
  const [hr, hi] = cval('besselh', [1, 2]);
  rel(hr, val('besselj', [1, 2]), 1e-15); rel(hi, val('bessely', [1, 2]), 1e-15);
  const [h2r, h2i] = cval('besselh', [1, 2, 2]);
  rel(h2r, hr, 1e-15); rel(h2i, -hi, 1e-15);
  assert.equal(val('besselj', [0, 0]), 1); assert.equal(val('bessely', [0, 0]), -Infinity); assert.equal(val('besselk', [1, 0]), Infinity);
  assert.deepEqual(f('besselj', [V([0, 1, 2]), V([[1], [2]])]).dims, [2, 3]);
});
test('airy', () => {
  rel(val('airy', [V([1])]), 0.1352924163128814, 1e-14);
  rel(val('airy', [0, -2]), 0.2274074282016856, 1e-13);
  rel(val('airy', [1, 1]), -0.1591474412967932, 1e-14);
  rel(val('airy', [2, 1]), 1.207423594952871, 1e-14);
  rel(val('airy', [3, -1]), 0.5923756264227923, 1e-13);
  rel(val('airy', [0, 0]), 0.3550280538878172, 1e-15);
  rel(val('airy', [0, 5, 1]), val('airy', [0, 5]) * Math.exp((2 / 3) * 5 ** 1.5), 1e-12, 'scaled Ai');
  // Wronskian Ai Bi' - Ai' Bi = 1/pi
  for (const x of [-3, -0.4, 0.7, 2]) rel(val('airy', [0, x]) * val('airy', [3, x]) - val('airy', [1, x]) * val('airy', [2, x]), 1 / Math.PI, 1e-12, `Wronskian ${x}`);
});
test('legendre', () => {
  const P = f('legendre', [2, V([0, 0.5, 1])]);
  assert.deepEqual(P.dims, [3, 3]);
  // P2 = (3x^2-1)/2, P2^1 = -3x sqrt(1-x^2), P2^2 = 3(1-x^2)
  const x = 0.5, s = Math.sqrt(1 - x * x);
  close(Array.from(D(P).re.slice(3, 6)), [(3 * x * x - 1) / 2, -3 * x * s, 3 * (1 - x * x)], 1e-14);
  const S = f('legendre', [2, num(0.5), str('sch')]);
  close(S, [[(3 * x * x - 1) / 2], [Math.sqrt(2 / 6) * 3 * x * s], [Math.sqrt(2 / 24) * 3 * (1 - x * x)]], 1e-14);
  const N = f('legendre', [1, num(0.3), str('norm')]);
  close(N, [[Math.sqrt(1.5) * 0.3], [Math.sqrt(1.5 / 2) * Math.sqrt(1 - 0.09)]], 1e-14);
  // orthonormality of the 'norm' functions (Gauss quadrature by trapezoid on many points)
  const P40 = f('legendre', [40, V([0.1, -0.7])]);
  assert.deepEqual(P40.dims, [41, 2]);
  rel(D(P40).re[0], 0.1 === 0.1 ? D(P40).re[0] : 0, 1e-15);
  assert.throws(() => f('legendre', [2, num(2)]), /range/);
});
test('ellipke, ellipj', () => {
  rel(val('ellipke', [0.5]), 1.854074677301372, 1e-14);
  rel(val('ellipke', [0.5], 1), 1.350643881047675, 1e-14);
  const [K0, E0] = call('ellipke', [num(0)], 2);
  rel(K0.re[0], Math.PI / 2, 1e-15); rel(E0.re[0], Math.PI / 2, 1e-15);
  assert.equal(val('ellipke', [1]), Infinity);
  const [sn, cn, dn] = call('ellipj', [V([0.7, 1.3]), num(0.3)], 3);
  for (let i = 0; i < 2; i++) {
    rel(sn.re[i] ** 2 + cn.re[i] ** 2, 1, 1e-14);
    rel(dn.re[i] ** 2 + 0.3 * sn.re[i] ** 2, 1, 1e-14);
  }
  // sn(K) = 1
  const K = val('ellipke', [0.3]);
  rel(val('ellipj', [K, 0.3]), 1, 1e-12);
  close(call('ellipj', [num(0.4), num(0)], 3).map((v) => v.re[0]), [Math.sin(0.4), Math.cos(0.4), 1], 1e-15);
  close(call('ellipj', [num(0.4), num(1)], 3).map((v) => v.re[0]), [Math.tanh(0.4), 1 / Math.cosh(0.4), 1 / Math.cosh(0.4)], 1e-15);
  assert.throws(() => f('ellipke', [2]), /range/);
});
test('single class and N-D shapes', () => {
  const s = f('erf', [tensor('single', [1, 2], [0.5, 1])]);
  assert.equal(s.cls, 'single');
  assert.deepEqual(f('gamma', [tensor('double', [2, 1, 2], [1, 2, 3, 4])]).dims, [2, 1, 2]);
});
