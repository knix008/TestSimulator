// Tests of the numerical integration builtins of the numerics area.
// A numerics-only ctx is used so that work in progress in other areas does
// not affect these tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as numeric from '../core/lib/numeric/index.js';
import { MError, isFuncHandle, num, rowVec, colVec, str, matrix, tensor, bool } from '../core/value.js';

const B = numeric.builtins;
const jsHandle = (jsfn) => ({ cls: 'function_handle', dims: [1, 1], jsfn });
function makeCtx() {
  const ctx = {
    state: {}, outText: [], warnings: [],
    out(t) { this.outText.push(t); }, errOut(t) { this.outText.push(t); },
    warning(id, message) { this.warnings.push({ id, message }); },
    checkInterrupt() {},
    call(fn, args, nargout = 1) {
      let r;
      if (typeof fn === 'string') { const b = B[fn]; if (!b) throw new MError('test:undefined', `Undefined function '${fn}'.`); r = b(args, nargout, ctx); }
      else if (isFuncHandle(fn) && fn.jsfn) r = fn.jsfn(args, nargout);
      else throw new MError('test:badCall', 'cannot call this value');
      return Array.isArray(r) ? r : r === undefined ? [] : [r];
    },
  };
  numeric.install(ctx);
  return ctx;
}
const ctx = makeCtx();
const close = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a} (tol ${tol})`);
/** elementwise handle: g(x) on numbers, applied to the input array */
const ew = (g) => jsHandle(([x]) => tensor('double', x.dims, Float64Array.from(x.re, g)));
const ew2 = (g) => jsHandle(([x, y]) => tensor('double', x.dims, Float64Array.from(x.re, (v, i) => g(v, y.re.length > 1 ? y.re[i] : y.re[0]))));
const ew3 = (g) => jsHandle(([x, y, z]) => tensor('double', x.dims, Float64Array.from(x.re, (v, i) => g(v, y.re.length > 1 ? y.re[i] : y.re[0], z.re.length > 1 ? z.re[i] : z.re[0]))));

test('integral: smooth integrand', () => {
  close(B.integral([ew(Math.exp), num(0), num(1)], 1, ctx).re[0], Math.E - 1, 1e-12);
  close(B.integral([ew(Math.sin), num(0), num(Math.PI)], 1, ctx).re[0], 2, 1e-12);
});

test('integral: endpoint singularity 1/sqrt(x)', () => {
  const c = makeCtx();
  close(B.integral([ew((x) => 1 / Math.sqrt(x)), num(0), num(1)], 1, c).re[0], 2, 1e-8);
  close(B.integral([ew((x) => Math.log(x)), num(0), num(1)], 1, c).re[0], -1, 1e-6);
});

test('integral: infinite limits', () => {
  close(B.integral([ew((x) => Math.exp(-x * x)), num(-Infinity), num(Infinity)], 1, ctx).re[0], Math.sqrt(Math.PI), 1e-9);
  close(B.integral([ew((x) => 1 / (1 + x * x)), num(0), num(Infinity)], 1, ctx).re[0], Math.PI / 2, 1e-9);
  close(B.integral([ew((x) => Math.exp(x)), num(-Infinity), num(0)], 1, ctx).re[0], 1, 1e-9);
});

test('integral: reversed and equal limits', () => {
  close(B.integral([ew((x) => x * x), num(1), num(0)], 1, ctx).re[0], -1 / 3, 1e-12);
  assert.equal(B.integral([ew((x) => x), num(2), num(2)], 1, ctx).re[0], 0);
});

test('integral: tolerances, waypoints and complex values', () => {
  const q = B.integral([ew((x) => Math.abs(x - 0.3)), num(0), num(1), str('Waypoints'), num(0.3), str('AbsTol'), num(1e-13), str('RelTol'), num(1e-12)], 1, ctx);
  close(q.re[0], (0.09 + 0.49) / 2, 1e-12);
  const ce = jsHandle(([x]) => tensor('double', x.dims, Float64Array.from(x.re, Math.cos), Float64Array.from(x.re, Math.sin)));
  const z = B.integral([ce, num(0), num(Math.PI)], 1, ctx);
  close(z.re[0], 0, 1e-12); close(z.im[0], 2, 1e-12);
});

test('integral: ArrayValued integrand', () => {
  const f = jsHandle(([x]) => rowVec([x.re[0], x.re[0] ** 2, Math.cos(x.re[0])]));
  const q = B.integral([f, num(0), num(1), str('ArrayValued'), bool(true)], 1, ctx);
  assert.deepEqual(q.dims, [1, 3]);
  close(q.re[0], 0.5, 1e-12); close(q.re[1], 1 / 3, 1e-12); close(q.re[2], Math.sin(1), 1e-12);
});

test('integral: size mismatch is an error', () => {
  const bad = jsHandle(() => rowVec([1, 2]));
  assert.throws(() => B.integral([bad, num(0), num(1)], 1, ctx), /ArrayValued/);
});

test('quadgk: value and error bound', () => {
  const [q, e] = B.quadgk([ew((x) => Math.exp(-x) * Math.cos(x)), num(0), num(Infinity)], 2, ctx);
  close(q.re[0], 0.5, 1e-10); assert.ok(e.re[0] >= 0 && e.re[0] < 1e-8);
});

test('integral2: rectangle and variable limits', () => {
  close(B.integral2([ew2((x, y) => x * y), num(0), num(1), num(0), num(1)], 1, ctx).re[0], 0.25, 1e-10);
  const ylo = num(0), yhi = jsHandle(([x]) => x);
  close(B.integral2([ew2(() => 1), num(0), num(1), ylo, yhi], 1, ctx).re[0], 0.5, 1e-10);
  // area of the unit disc
  const lo = ew((x) => -Math.sqrt(Math.max(0, 1 - x * x))), hi = ew((x) => Math.sqrt(Math.max(0, 1 - x * x)));
  close(B.integral2([ew2(() => 1), num(-1), num(1), lo, hi], 1, ctx).re[0], Math.PI, 1e-6);
  close(B.quad2d([ew2((x, y) => x + y), num(0), num(1), num(0), num(2)], 1, ctx).re[0], 3, 1e-10);
  close(B.integral2([ew2((x, y) => Math.exp(-x * x - y * y)), num(-Infinity), num(Infinity), num(-Infinity), num(Infinity)], 1, ctx).re[0], Math.PI, 1e-6);
});

test('integral3: box and Gaussian', () => {
  close(B.integral3([ew3((x, y, z) => x * y * z), num(0), num(1), num(0), num(1), num(0), num(1)], 1, ctx).re[0], 0.125, 1e-10);
  close(B.integral3([ew3((x, y, z) => x + y + z), num(0), num(1), num(0), num(2), num(0), num(3)], 1, ctx).re[0], 6 * 3, 1e-9);
});

test('quad / quadl / quadv', () => {
  close(B.quad([ew((x) => 1 / (x * x * x - 2 * x - 5)), num(0), num(2)], 1, ctx).re[0], -0.460501533846733, 1e-6);
  const [q, n] = B.quad([ew(Math.exp), num(0), num(1), num(1e-10)], 2, ctx);
  close(q.re[0], Math.E - 1, 1e-9); assert.ok(n.re[0] > 7);
  close(B.quadl([ew((x) => 1 / (x * x * x - 2 * x - 5)), num(0), num(2)], 1, ctx).re[0], -0.460501533846733, 1e-6);
  const fv = jsHandle(([x]) => rowVec([1, 2, 3, 4, 5].map((k) => 1 / (k + x.re[0]))));
  const Q = B.quadv([fv, num(0), num(1)], 1, ctx);
  [1, 2, 3, 4, 5].forEach((k, i) => close(Q.re[i], Math.log((k + 1) / k), 1e-6));
});

test('dblquad / triplequad', () => {
  close(B.dblquad([ew2((x, y) => y * Math.sin(x) + x * Math.cos(y)), num(Math.PI), num(2 * Math.PI), num(0), num(Math.PI)], 1, ctx).re[0], -(Math.PI ** 2), 1e-6);
  close(B.triplequad([ew3((x, y, z) => y * Math.sin(x) + z * Math.cos(x)), num(0), num(Math.PI), num(0), num(1), num(-1), num(1)], 1, ctx).re[0], 2, 1e-6);
});

test('trapz and cumtrapz', () => {
  assert.equal(B.trapz([rowVec([1, 2, 3])], 1, ctx).re[0], 4);
  close(B.trapz([rowVec([0, 0.5, 2]), rowVec([0, 1, 4])], 1, ctx).re[0], 0.25 + 1.5 * 2.5, 1e-15);
  assert.equal(B.trapz([num(0.5), rowVec([1, 2, 3])], 1, ctx).re[0], 2);
  const M = matrix([[1, 2], [3, 4], [5, 6]]);
  assert.deepEqual(Array.from(B.trapz([M], 1, ctx).re), [6, 8]);
  assert.deepEqual(Array.from(B.trapz([M, num(2)], 1, ctx).re), [1.5, 3.5, 5.5]);
  assert.deepEqual(B.trapz([M], 1, ctx).dims, [1, 2]);
  const c = B.cumtrapz([colVec([1, 2, 3, 4])], 1, ctx);
  assert.deepEqual(Array.from(c.re), [0, 1.5, 4, 7.5]); assert.deepEqual(c.dims, [4, 1]);
  const x = Array.from({ length: 101 }, (_, i) => i * Math.PI / 100);
  close(B.trapz([rowVec(x), rowVec(x.map(Math.sin))], 1, ctx).re[0], 2, 2e-4);
});

test('help entries exist for every integration builtin', () => {
  for (const k of ['integral', 'quadgk', 'integral2', 'quad2d', 'integral3', 'quad', 'quadv', 'quadl', 'dblquad', 'triplequad', 'trapz', 'cumtrapz']) {
    assert.ok(B[k], `builtin ${k}`);
    const h = numeric.help[k]; assert.ok(h && h.en && h.ko && h.syntax.length, `help ${k}`);
  }
});
