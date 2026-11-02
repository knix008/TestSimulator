// Tests of the Octave-compatibility functions of the numerics area
// (core/lib/numeric/octave): special functions, polynomials, optimization,
// quadrature, ODE/DAE interfaces, statistics and time-series functions.
// Results are checked against analytic solutions and known optima.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as octave from '../core/lib/numeric/octave/index.js';
import { MError, isFuncHandle, num, str, rowVec, colVec, matrix, tensor, toStr, structOf, cell, isStruct } from '../core/value.js';

const jsHandle = (jsfn) => ({ cls: 'function_handle', dims: [1, 1], jsfn });
/** A ctx shaped like test/helpers/mockctx.mjs over the given registry. */
function baseMockCtx({ registry: reg }) {
  const out = [];
  const ctx = {
    registry: reg, outText: out, warnings: [], state: {}, format: { numeric: 'short', spacing: 'loose' },
    host: { post() {}, request() { return null; } },
    out(text) { out.push(text); }, errOut(text) { out.push(text); },
    warning(id, message) { ctx.warnings.push({ id, message }); },
    onMessage() {}, checkInterrupt() {},
    call(fn, args, nargout = 1) {
      let r;
      if (typeof fn === 'string') { const b = reg.builtins[fn]; if (!b) throw new MError('test:undefined', `Undefined function '${fn}'.`); r = b(args, nargout, ctx); }
      else if (isFuncHandle(fn) && fn.jsfn) r = fn.jsfn(args, nargout);
      else if (isFuncHandle(fn) && fn.name) return ctx.call(fn.name, args, nargout);
      else throw new MError('test:badCall', 'cannot call this value');
      return Array.isArray(r) ? r : r === undefined ? [] : [r];
    },
  };
  for (const install of reg.installs) install(ctx);
  return ctx;
}

// The registry is assembled from the areas these tests need (base, linalg,
// numerics, graphics), each loaded on its own so that unfinished work in an
// unrelated area does not break the numerics tests.
const AREAS = [['base', '../core/lib/base/index.js'], ['linalg', '../core/lib/linalg/index.js'], ['numeric', '../core/lib/numeric/index.js'], ['graphics', '../core/graphics/index.js']];
const loaded = {};
for (const [name, path] of AREAS) {
  try { loaded[name] = await import(path); } catch (e) { if (name === 'numeric') throw e; }
}
const hasGraphics = !!loaded.graphics;
function buildReg() {
  const reg = { builtins: Object.create(null), owner: Object.create(null), help: Object.create(null), classes: Object.create(null), installs: [] };
  for (const [name, mod] of Object.entries(loaded)) {
    for (const [k, fn] of Object.entries(mod.builtins || {})) { reg.builtins[k] = fn; reg.owner[k] = name; }
    Object.assign(reg.help, mod.help || {});
    for (const [k, c] of Object.entries(mod.classes || {})) reg.classes[k] = c;
    if (typeof mod.install === 'function') reg.installs.push(mod.install);
  }
  return reg;
}
const mockCtx = () => baseMockCtx({ registry: buildReg() });
const graphicsOnly = { skip: hasGraphics ? false : 'the graphics area could not be loaded' };

const call = (ctx, name, args, nargout = 1) => ctx.call(name, args, nargout);
const c1 = (ctx, name, args) => ctx.call(name, args, 1)[0];
const re = (v) => Array.from(v.re);
const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a} (tol ${tol})`);
const nearArr = (a, b, tol, msg = '') => { assert.equal(a.length, b.length, `${msg} length`); a.forEach((x, i) => near(x, b[i], tol, `${msg}[${i}]`)); };
const cplx = (r, i) => tensor('double', [1, 1], Float64Array.of(r), Float64Array.of(i));
const field = (s, f) => s.data[0][f];
/** Handle from a JS function of numeric arrays (first argument) → array or number. */
const fh = (f) => jsHandle((args) => { const out = f(...args.map((a) => (a.re ? Array.from(a.re) : a))); return typeof out === 'number' ? num(out) : colVec(out); });

// ------------------------------------------------------------ elementary and special functions
test('arg, cbrt, signbit, roundb', () => {
  const ctx = mockCtx();
  near(c1(ctx, 'arg', [num(-1)]).re[0], Math.PI, 1e-15);
  near(c1(ctx, 'arg', [cplx(0, 2)]).re[0], Math.PI / 2, 1e-15);
  assert.deepEqual(re(c1(ctx, 'cbrt', [rowVec([-27, 8, 0])])), [-3, 2, 0]);
  assert.throws(() => c1(ctx, 'cbrt', [cplx(1, 1)]), /real/);
  const sb = c1(ctx, 'signbit', [rowVec([-1, 0, -0, 1, NaN, -Infinity])]);
  assert.equal(sb.cls, 'logical');
  assert.deepEqual(re(sb), [1, 0, 1, 0, 0, 1]);
  assert.deepEqual(re(c1(ctx, 'roundb', [rowVec([2.5, 3.5, -2.5, 2.4, -0.5, 0.5000001])])), [2, 4, -2, 2, -0, 1]);
});

test('lgamma and bincoeff', () => {
  const ctx = mockCtx();
  near(c1(ctx, 'lgamma', [num(5)]).re[0], Math.log(24), 1e-13);
  const v = c1(ctx, 'lgamma', [num(-0.5)]); // Γ(-0.5) = -2√π
  near(v.re[0], Math.log(2 * Math.sqrt(Math.PI)), 1e-13); near(v.im[0], Math.PI, 1e-15);
  near(c1(ctx, 'lgamma', [num(-1.5)]).re[0], Math.log(4 * Math.sqrt(Math.PI) / 3), 1e-13);
  assert.equal(c1(ctx, 'lgamma', [num(-1.5)]).im, null); // Γ(-1.5) > 0
  assert.equal(c1(ctx, 'lgamma', [num(-2)]).re[0], Infinity);
  assert.deepEqual(re(c1(ctx, 'bincoeff', [num(5), rowVec([0, 1, 2, 5, 7])])), [1, 5, 10, 1, 0]);
  near(c1(ctx, 'bincoeff', [num(0.5), num(2)]).re[0], -0.125, 1e-15);
  assert.equal(c1(ctx, 'bincoeff', [num(-1), num(3)]).re[0], -1);
  assert.equal(c1(ctx, 'bincoeff', [num(-4), num(2)]).re[0], 10);
  assert.ok(Number.isNaN(c1(ctx, 'bincoeff', [num(5), num(-1)]).re[0]));
  assert.ok(Number.isNaN(c1(ctx, 'bincoeff', [num(5), num(1.5)]).re[0]));
  assert.equal(c1(ctx, 'bincoeff', [num(60), num(30)]).re[0], 118264581564861424);
});

test('sinint and cosint: tabulated values and the derivative identities in the complex plane', () => {
  const ctx = mockCtx();
  const si = { 1: 0.9460830703671830, 2: 1.605412976802695, 10: 1.658347594218874, 20: 1.548241701043440 };
  const ci = { 1: 0.3374039229009681, 2: 0.4229808287748650, 10: -0.04545643300445537, 20: 0.04441982084535332 };
  for (const x of [1, 2, 10, 20]) {
    near(c1(ctx, 'sinint', [num(x)]).re[0], si[x], 1e-14, `Si(${x})`);
    near(c1(ctx, 'cosint', [num(x)]).re[0], ci[x], 1e-14, `Ci(${x})`);
  }
  near(c1(ctx, 'sinint', [num(-2)]).re[0], -si[2], 1e-14);
  const cn = c1(ctx, 'cosint', [num(-1)]); near(cn.re[0], ci[1], 1e-14); near(cn.im[0], Math.PI, 1e-15);
  assert.equal(c1(ctx, 'cosint', [num(0)]).re[0], -Infinity);
  near(c1(ctx, 'sinint', [num(Infinity)]).re[0], Math.PI / 2, 1e-15);
  // Si'(z) = sin z / z and Ci'(z) = cos z / z, on the series and the continued-fraction paths
  for (const [zr, zi] of [[3, 2], [2, 5], [10, 1], [30, -4], [-12, 3], [0.5, 0.25]]) {
    const h = 1e-5;
    const at = (name, dr) => c1(ctx, name, [cplx(zr + dr, zi)]);
    const d = (name) => { const a = at(name, h), b = at(name, -h); return [(a.re[0] - b.re[0]) / (2 * h), ((a.im ? a.im[0] : 0) - (b.im ? b.im[0] : 0)) / (2 * h)]; };
    const den = zr * zr + zi * zi;
    const sr = Math.sin(zr) * Math.cosh(zi), sim = Math.cos(zr) * Math.sinh(zi);
    const cr = Math.cos(zr) * Math.cosh(zi), cim = -Math.sin(zr) * Math.sinh(zi);
    const [dsr, dsi] = d('sinint'); const [dcr, dci] = d('cosint');
    const scale = Math.max(1, Math.hypot(sr, sim));
    near(dsr, (sr * zr + sim * zi) / den, 1e-6 * scale, `Si' re ${zr}+${zi}i`); near(dsi, (sim * zr - sr * zi) / den, 1e-6 * scale, `Si' im ${zr}+${zi}i`);
    near(dcr, (cr * zr + cim * zi) / den, 1e-6 * scale, `Ci' re ${zr}+${zi}i`); near(dci, (cim * zr - cr * zi) / den, 1e-6 * scale, `Ci' im ${zr}+${zi}i`);
  }
  // continuity across the real axis: Ci(x + i0) = Ci(x)
  const z = c1(ctx, 'cosint', [cplx(10, 1e-12)]); near(z.re[0], ci[10], 1e-11);
  const zs = c1(ctx, 'sinint', [cplx(20, 1e-12)]); near(zs.re[0], si[20], 1e-11);
});

/** e^{-x²} ∫0^x e^{t²} dt by composite Simpson (reference values). */
function dawsonRef(x) {
  const n = 400000; const h = x / n; let s = 0;
  for (let i = 0; i <= n; i++) { const t = i * h; const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2; s += w * Math.exp(t * t - x * x); }
  return s * h / 3;
}
test('dawson and erfi: real values, complex paths and the differential equation', () => {
  const ctx = mockCtx();
  near(c1(ctx, 'dawson', [num(1)]).re[0], 0.5380795069127684, 1e-15);
  near(c1(ctx, 'dawson', [num(2)]).re[0], 0.3013403889237920, 1e-15);
  for (const x of [0.1, 0.45, 0.7, 1.3, 3, 5.5, 9]) near(c1(ctx, 'dawson', [num(x)]).re[0], dawsonRef(x), 1e-12, `F(${x})`);
  near(c1(ctx, 'dawson', [num(-1)]).re[0], -0.5380795069127684, 1e-15);
  near(c1(ctx, 'dawson', [num(1e7)]).re[0], 5e-8, 1e-20);
  near(c1(ctx, 'erfi', [num(1)]).re[0], 1.650425758797543, 1e-14);
  near(c1(ctx, 'erfi', [num(0.5)]).re[0], 0.6149520946965110, 1e-14);
  near(c1(ctx, 'erfi', [num(-1)]).re[0], -1.650425758797543, 1e-14);
  // erfi(i y) = i erf(y)
  const e = c1(ctx, 'erfi', [cplx(0, 1)]); near(e.re[0], 0, 1e-15); near(e.im[0], 0.8427007929497149, 1e-14);
  const e2 = c1(ctx, 'erfi', [cplx(0, 2)]); near(e2.im[0], 0.9953222650189527, 1e-13);
  // complex path just off the real axis agrees with the real algorithm
  for (const x of [0.6, 1.5, 4, 12]) near(c1(ctx, 'dawson', [cplx(x, 1e-300)]).re[0], c1(ctx, 'dawson', [num(x)]).re[0], 1e-13, `w(${x})`);
  // F'(z) = 1 - 2 z F(z)
  for (const [zr, zi] of [[1, 1], [3, 0.5], [0.2, 0.1], [2, -1.5], [-0.7, 2]]) {
    const h = 1e-5;
    const F = (r, i) => { const v = c1(ctx, 'dawson', [cplx(r, i)]); return [v.re[0], v.im ? v.im[0] : 0]; };
    const [ar, ai] = F(zr + h, zi), [br, bi] = F(zr - h, zi), [fr, fi] = F(zr, zi);
    near((ar - br) / (2 * h), 1 - 2 * (zr * fr - zi * fi), 1e-7, `F' re ${zr}${zi}`);
    near((ai - bi) / (2 * h), -2 * (zr * fi + zi * fr), 1e-7, `F' im ${zr}${zi}`);
  }
});

test('list_primes, humps, sumsq, meansq, center', () => {
  const ctx = mockCtx();
  assert.deepEqual(re(c1(ctx, 'list_primes', [num(5)])), [2, 3, 5, 7, 11]);
  const p = c1(ctx, 'list_primes', []); assert.equal(p.re.length, 25); assert.equal(p.re[24], 97);
  near(c1(ctx, 'humps', [num(0.3)]).re[0], 100 + 1 / 0.4 - 6, 1e-12);
  const [x, y] = call(ctx, 'humps', [], 2); assert.equal(x.re.length, 21); near(y.re[0], 1 / 0.1 + 1 / 0.85 - 6, 1e-12);
  const A = matrix([[1, 2], [3, 4]]);
  assert.deepEqual(re(c1(ctx, 'sumsq', [A])), [10, 20]);
  assert.deepEqual(re(c1(ctx, 'sumsq', [A, num(2)])), [5, 25]);
  near(c1(ctx, 'sumsq', [cplx(3, 4)]).re[0], 25, 0);
  near(c1(ctx, 'meansq', [rowVec([1, 2, 3])]).re[0], 14 / 3, 1e-15);
  assert.deepEqual(re(c1(ctx, 'center', [rowVec([1, 2, 3])])), [-1, 0, 1]);
  assert.deepEqual(re(c1(ctx, 'center', [A])), [-1, 1, -1, 1]);
  assert.deepEqual(re(c1(ctx, 'center', [A, num(2)])), [-0.5, -0.5, 0.5, 0.5]);
});

function grid2(xs, ys, f) {
  const ny = ys.length, nx = xs.length; const a = new Float64Array(ny * nx);
  for (let j = 0; j < nx; j++) for (let i = 0; i < ny; i++) a[i + ny * j] = f(xs[j], ys[i]);
  return tensor('double', [ny, nx], a);
}
test('curl and divergence of linear fields', () => {
  const ctx = mockCtx();
  const xs = [0, 0.5, 1, 2], ys = [-1, 0, 1.5];
  const X = grid2(xs, ys, (x) => x), Y = grid2(xs, ys, (x, y) => y);
  const fx = grid2(xs, ys, (x, y) => -y), fy = grid2(xs, ys, (x) => x);
  const [cz, av] = call(ctx, 'curl', [X, Y, fx, fy], 2);
  re(cz).forEach((v) => near(v, 2, 1e-13)); re(av).forEach((v) => near(v, 1, 1e-13));
  re(c1(ctx, 'curl', [rowVec(xs), colVec(ys), fx, fy])).forEach((v) => near(v, 1, 1e-13));
  const dv = c1(ctx, 'divergence', [X, Y, grid2(xs, ys, (x) => 3 * x), grid2(xs, ys, (x, y) => -y)]);
  re(dv).forEach((v) => near(v, 2, 1e-13));
  // unit spacing defaults
  re(c1(ctx, 'divergence', [grid2([1, 2, 3], [1, 2], (x) => x), grid2([1, 2, 3], [1, 2], (x, y) => y)])).forEach((v) => near(v, 2, 1e-13));
  // 3-D: F = (-y, x, z): curl = (0, 0, 2), div = 1, angular velocity = z / |F|
  const n = 3; const dims = [n, n, n]; const mk = (f) => { const a = new Float64Array(27); for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) a[i + n * j + n * n * k] = f(j + 1, i + 1, k + 1); return tensor('double', dims, a); };
  const [cx, cy, cz3, av3] = call(ctx, 'curl', [mk((x, y) => -y), mk((x) => x), mk((x, y, z) => z)], 4);
  re(cx).forEach((v) => near(v, 0, 1e-13)); re(cy).forEach((v) => near(v, 0, 1e-13)); re(cz3).forEach((v) => near(v, 2, 1e-13));
  near(av3.re[0], 1 / Math.sqrt(3), 1e-13);
  re(c1(ctx, 'divergence', [mk((x) => x), mk((x, y) => 2 * y), mk((x, y, z) => -z)])).forEach((v) => near(v, 2, 1e-13));
});

test('colloc: nodes, derivative matrices and weights', () => {
  const ctx = mockCtx();
  const [r1, a1, b1, q1] = call(ctx, 'colloc', [num(1)], 4);
  assert.deepEqual(re(r1), [0.5]); assert.deepEqual(re(a1), [0]); assert.deepEqual(re(b1), [0]); assert.deepEqual(re(q1), [1]);
  assert.deepEqual(re(c1(ctx, 'colloc', [num(1), str('left'), str('right')])), [0, 0.5, 1]);
  const [r2, , , q2] = call(ctx, 'colloc', [num(2)], 4);
  nearArr(re(r2), [0.5 - 0.5 / Math.sqrt(3), 0.5 + 0.5 / Math.sqrt(3)], 1e-15); nearArr(re(q2), [0.5, 0.5], 1e-15);
  const [r, A, B] = call(ctx, 'colloc', [num(3), str('left'), str('right')], 3);
  const x = re(r); const m = x.length; assert.equal(m, 5); assert.equal(x[0], 0); assert.equal(x[4], 1);
  for (let i = 0; i < m; i++) {
    let d1 = 0, d2 = 0; for (let j = 0; j < m; j++) { d1 += A.re[i + m * j] * x[j] ** 4; d2 += B.re[i + m * j] * x[j] ** 4; }
    near(d1, 4 * x[i] ** 3, 1e-11, 'A x^4'); near(d2, 12 * x[i] ** 2, 1e-10, 'B x^4');
  }
  const [r3, , , q3] = call(ctx, 'colloc', [num(3)], 4); // Gauss–Legendre on [0, 1]: exact to degree 5
  near(re(q3).reduce((s, w, i) => s + w * r3.re[i] ** 5, 0), 1 / 6, 1e-15);
});

// ------------------------------------------------------------ polynomials
test('mpoles, padecoef, polyaffine, polygcd, polyout, polyreduce, fftconv', () => {
  const ctx = mockCtx();
  const [m, n] = call(ctx, 'mpoles', [rowVec([2, 3, 1, 1, 2])], 2);
  assert.deepEqual(re(m), [1, 1, 2, 1, 2]); assert.deepEqual(re(n), [2, 5, 1, 4, 3]);
  const [mm] = call(ctx, 'mpoles', [rowVec([1, 1.0001, -2])], 1); assert.deepEqual(re(mm), [1, 1, 2]);
  const [pn, pd] = call(ctx, 'padecoef', [num(0.1), num(1)], 2);
  nearArr(re(pn), [-1, 20], 1e-12); nearArr(re(pd), [1, 20], 1e-12);
  const [qn, qd] = call(ctx, 'padecoef', [num(1), num(2)], 2);
  nearArr(re(qn), [1, -6, 12], 1e-12); nearArr(re(qd), [1, 6, 12], 1e-12);
  nearArr(re(c1(ctx, 'polyaffine', [rowVec([1, 2, 3]), rowVec([1, 2])])), [0.25, 0.5, 2.25], 1e-15);
  const g = c1(ctx, 'polygcd', [rowVec([1, -6, 11, -6]), rowVec([1, -9, 26, -24])]);
  nearArr(re(g), [1, -5, 6], 1e-10);
  assert.equal(toStr(c1(ctx, 'polyout', [rowVec([1, 2, 3])])), '1*s^2 + 2*s^1 + 3');
  assert.equal(toStr(c1(ctx, 'polyout', [rowVec([1, -2.5, 3]), str('x')])), '1*x^2 - 2.5*x^1 + 3');
  call(ctx, 'polyout', [rowVec([2, 0])], 0); assert.match(ctx.outText.join(''), /2\*s\^1 \+ 0/);
  assert.deepEqual(re(c1(ctx, 'polyreduce', [rowVec([0, 0, 1, 2])])), [1, 2]);
  assert.deepEqual(re(c1(ctx, 'polyreduce', [rowVec([0, 0])])), [0]);
  nearArr(re(c1(ctx, 'fftconv', [rowVec([1, 2, 3]), rowVec([1, 1])])), [1, 3, 5, 3], 1e-12);
  const cv = c1(ctx, 'fftconv', [colVec([1, 2, 3, 4, 5]), colVec([1, -1, 2])]);
  assert.deepEqual(cv.dims, [7, 1]); nearArr(re(cv), [1, 1, 3, 5, 7, 3, 10], 1e-12);
});

test('ppder, ppint and ppjumps', () => {
  const ctx = mockCtx();
  const pp = c1(ctx, 'mkpp', [rowVec([0, 1, 2]), matrix([[1, 0, 0], [1, 2, 1]])]); // x² on [0, 2]
  const d = c1(ctx, 'ppder', [pp]);
  nearArr(re(c1(ctx, 'ppval', [d, rowVec([0.25, 1.5, 2])])), [0.5, 3, 4], 1e-14);
  const d2 = c1(ctx, 'ppder', [pp, num(2)]); nearArr(re(c1(ctx, 'ppval', [d2, rowVec([0.3, 1.7])])), [2, 2], 1e-14);
  const d5 = c1(ctx, 'ppder', [pp, num(5)]); assert.deepEqual(re(c1(ctx, 'ppval', [d5, rowVec([0.3, 1.7])])), [0, 0]);
  const I = c1(ctx, 'ppint', [pp]);
  nearArr(re(c1(ctx, 'ppval', [I, rowVec([0, 0.5, 1, 2])])), [0, 1 / 24, 1 / 3, 8 / 3], 1e-14);
  const I2 = c1(ctx, 'ppint', [pp, num(5)]); near(c1(ctx, 'ppval', [I2, num(2)]).re[0], 5 + 8 / 3, 1e-14);
  const jump = c1(ctx, 'mkpp', [rowVec([0, 1, 2, 3]), matrix([[1, 0], [1, 5], [0, 7]])]);
  const j = c1(ctx, 'ppjumps', [jump]); assert.deepEqual(j.dims, [1, 2]); nearArr(re(j), [4, 1], 1e-14);
  nearArr(re(c1(ctx, 'ppjumps', [pp])), [0], 1e-15);
});

test('splinefit: exact reproduction, smooth fit, periodicity and constraints', () => {
  const ctx = mockCtx();
  const xs = Array.from({ length: 41 }, (_, i) => i / 10);
  const cubic = (x) => 1 - 2 * x + 0.5 * x * x - 0.2 * x ** 3;
  const pp = c1(ctx, 'splinefit', [rowVec(xs), rowVec(xs.map(cubic)), num(3)]);
  nearArr(re(c1(ctx, 'ppval', [pp, rowVec([0.05, 1.33, 3.9])])), [0.05, 1.33, 3.9].map(cubic), 1e-10);
  const xx = Array.from({ length: 201 }, (_, i) => 2 * Math.PI * i / 200);
  const ps = c1(ctx, 'splinefit', [rowVec(xx), rowVec(xx.map(Math.sin)), num(8)]);
  const t = [0.4, 2, 3.3, 5.9]; nearArr(re(c1(ctx, 'ppval', [ps, rowVec(t)])), t.map(Math.sin), 2e-3);
  // periodic: value and slope match at the ends
  const pc = c1(ctx, 'splinefit', [rowVec(xx), rowVec(xx.map((x) => Math.sin(x) + 0.1 * x)), num(5), str('periodic'), num(1)]);
  const v = re(c1(ctx, 'ppval', [pc, rowVec([0, 2 * Math.PI])])); near(v[0], v[1], 1e-10);
  const dpc = c1(ctx, 'ppder', [pc]); const dv = re(c1(ctx, 'ppval', [dpc, rowVec([0, 2 * Math.PI])])); near(dv[0], dv[1], 1e-9);
  // constraints: y(0) = 0 and y'(2π) = 0
  const cons = structOf({ xc: rowVec([0, 2 * Math.PI]), yc: rowVec([0, 0]), cc: matrix([[1, 0], [0, 1]]) });
  const pk = c1(ctx, 'splinefit', [rowVec(xx), rowVec(xx.map((x) => Math.cos(x) + 0.3)), num(4), str('constraints'), cons]);
  near(c1(ctx, 'ppval', [pk, num(0)]).re[0], 0, 1e-10);
  near(c1(ctx, 'ppval', [c1(ctx, 'ppder', [pk]), num(2 * Math.PI)]).re[0], 0, 1e-9);
  // order 1 (piecewise linear, continuous) and robust fitting ignore an outlier
  const pl = c1(ctx, 'splinefit', [rowVec(xs), rowVec(xs.map((x) => 2 * x + 1)), num(2), str('order'), num(1)]);
  assert.equal(field(pl, 'order').re[0], 2); near(c1(ctx, 'ppval', [pl, num(3.3)]).re[0], 7.6, 1e-10);
  const yo = xs.map((x) => 2 * x + 1); yo[20] += 50;
  const pr = c1(ctx, 'splinefit', [rowVec(xs), rowVec(yo), num(2), str('order'), num(1), str('robust'), num(1)]);
  near(c1(ctx, 'ppval', [pr, num(1)]).re[0], 3, 0.05);
});

// ------------------------------------------------------------ optimization
test('glpk: LP with duals and reduced costs, maximization, MILP and mixed constraint types', () => {
  const ctx = mockCtx();
  const c = colVec([10, 6, 4]); const A = matrix([[1, 1, 1], [10, 4, 5], [2, 2, 6]]); const b = colVec([100, 600, 300]);
  const [x, f, err, extra] = call(ctx, 'glpk', [c, A, b, colVec([0, 0, 0]), tensor('double', [0, 0]), str('UUU'), str('CCC'), num(-1)], 4);
  nearArr(re(x), [100 / 3, 200 / 3, 0], 1e-9); near(f.re[0], 2200 / 3, 1e-9); assert.equal(err.re[0], 0);
  assert.equal(field(extra, 'status').re[0], 5);
  nearArr(re(field(extra, 'lambda')), [10 / 3, 2 / 3, 0], 1e-9);
  nearArr(re(field(extra, 'redcosts')), [0, 0, -8 / 3], 1e-9);
  const [xi, fi] = call(ctx, 'glpk', [c, A, b, colVec([0, 0, 0]), tensor('double', [0, 0]), str('UUU'), str('III'), num(-1)], 2);
  near(fi.re[0], 732, 1e-9); re(xi).forEach((v) => assert.equal(v, Math.round(v)));
  // min x1 + x2 s.t. x1 + 2 x2 >= 4, x1 - x2 = 1, x >= 0
  const [x2, f2, , e2] = call(ctx, 'glpk', [colVec([1, 1]), matrix([[1, 2], [1, -1]]), colVec([4, 1]), colVec([0, 0]), colVec([Infinity, Infinity]), str('LS'), str('CC'), num(1)], 4);
  nearArr(re(x2), [2, 1], 1e-10); near(f2.re[0], 3, 1e-10);
  // duals: c = A' lambda + d
  const lam = re(field(e2, 'lambda')); const red = re(field(e2, 'redcosts'));
  near(1, lam[0] * 1 + lam[1] * 1 + red[0], 1e-10); near(1, lam[0] * 2 - lam[1] + red[1], 1e-10);
  near(lam[0], 2 / 3, 1e-10);
  // infeasible and unbounded
  const ctxq = mockCtx();
  const [, , , ei] = call(ctxq, 'glpk', [colVec([1]), matrix([[1], [1]]), colVec([1, 2]), colVec([0]), colVec([Infinity]), str('UL'), str('C'), num(1)], 4);
  assert.equal(field(ei, 'status').re[0], 4);
  const [, , , eu] = call(ctxq, 'glpk', [colVec([-1]), matrix([[1]]), colVec([0]), colVec([0]), colVec([Infinity]), str('L'), str('C'), num(1)], 4);
  assert.equal(field(eu, 'status').re[0], 6);
});

test('qp: bounds, general inequalities, equalities and multipliers', () => {
  const ctx = mockCtx();
  const Hm = matrix([[1, 0], [0, 1]]); const q = colVec([-1, -1]); const E = tensor('double', [0, 0]);
  // min 0.5|x|² - x1 - x2  s.t. x1 + x2 <= 1, x1 <= 0.3
  const [x, obj, info, lambda] = call(ctx, 'qp', [colVec([0, 0]), Hm, q, E, E, colVec([-Infinity, -Infinity]), colVec([0.3, Infinity]), num(-Infinity), matrix([[1, 1]]), num(1)], 4);
  nearArr(re(x), [0.3, 0.7], 1e-10); near(obj.re[0], 0.5 * (0.09 + 0.49) - 1, 1e-12);
  assert.equal(field(info, 'info').re[0], 0);
  // inequality rows in order: ub(x1), A_ub ; multipliers 0.4 and 0.3
  nearArr(re(lambda), [0.4, 0.3], 1e-9);
  // equality: min 0.5|x|² s.t. x1 + x2 = 2  ->  x = (1, 1), H x = A' lambda  ->  lambda = 1
  const [xe, , , le] = call(ctx, 'qp', [colVec([0, 0]), Hm, colVec([0, 0]), matrix([[1, 1]]), num(2)], 4);
  nearArr(re(xe), [1, 1], 1e-10); nearArr(re(le), [1], 1e-10);
  // unconstrained
  nearArr(re(c1(ctx, 'qp', [colVec([5, 5]), matrix([[2, 0], [0, 4]]), colVec([-2, -8])])), [1, 2], 1e-10);
  // infeasible
  const [, , inf6] = call(ctx, 'qp', [colVec([0]), num(1), num(0), E, E, num(2), num(1)], 3);
  assert.equal(field(inf6, 'info').re[0], 6);
});

test('pqpnonneg', () => {
  const ctx = mockCtx();
  const [x, minval, exitflag, output, lambda] = call(ctx, 'pqpnonneg', [matrix([[2, 0], [0, 2]]), colVec([-2, 4])], 5);
  nearArr(re(x), [1, 0], 1e-12); near(minval.re[0], -1, 1e-12); assert.ok(exitflag.re[0] > 0);
  assert.ok(isStruct(output)); nearArr(re(lambda), [0, 4], 1e-12);
  nearArr(re(c1(ctx, 'pqpnonneg', [matrix([[4, 1], [1, 2]]), colVec([-1, -1])])), [1 / 7, 3 / 7], 1e-12);
});

test('sqp: the documented example and inequality constraints with multipliers', () => {
  const ctx = mockCtx();
  const g = fh((x) => [x.reduce((s, v) => s + v * v, 0) - 10, x[1] * x[2] - 5 * x[3] * x[4], x[0] ** 3 + x[1] ** 3 + 1]);
  const phi = fh((x) => Math.exp(x.reduce((p, v) => p * v, 1)) - 0.5 * (x[0] ** 3 + x[1] ** 3 + 1) ** 2);
  const [x, obj, info, iter, nf] = call(ctx, 'sqp', [colVec([-1.8, 1.7, 1.9, -0.8, -0.8]), phi, g, tensor('double', [0, 0])], 5);
  nearArr(re(x), [-1.71714, 1.59571, 1.82725, -0.76364, -0.76364], 1e-4);
  near(obj.re[0], 0.053950, 1e-5); assert.equal(info.re[0], 101); assert.ok(iter.re[0] > 0 && nf.re[0] > 0);
  // min x1² + x2²  s.t. x1 + x2 - 1 >= 0  ->  (0.5, 0.5), lambda = 1
  const [x2, o2, i2, , , l2] = call(ctx, 'sqp', [colVec([3, -1]), fh((v) => v[0] ** 2 + v[1] ** 2), tensor('double', [0, 0]), fh((v) => [v[0] + v[1] - 1])], 6);
  nearArr(re(x2), [0.5, 0.5], 1e-6); near(o2.re[0], 0.5, 1e-8); assert.equal(i2.re[0], 101); nearArr(re(l2), [1], 1e-5);
  // gradient in a cell and bounds
  const obj3 = cell([1, 2], [fh((v) => (v[0] - 3) ** 2 + (v[1] + 1) ** 2), fh((v) => [2 * (v[0] - 3), 2 * (v[1] + 1)])]);
  const [x3] = call(ctx, 'sqp', [colVec([0, 0]), obj3, tensor('double', [0, 0]), tensor('double', [0, 0]), colVec([-1, 0]), colVec([2, 1])], 1);
  nearArr(re(x3), [2, 0], 1e-7);
});

test('ols and gls', () => {
  const ctx = mockCtx();
  const xs = [0, 1, 2, 3, 4, 5]; const noise = [0.1, -0.2, 0.05, 0.15, -0.1, 0.0];
  const X = matrix(xs.map((x) => [1, x])); const y = colVec(xs.map((x, i) => 2 + 3 * x + noise[i]));
  const [beta, sigma, r] = call(ctx, 'ols', [y, X], 3);
  // closed form of simple linear regression
  const mx = 2.5, yv = re(y), my = yv.reduce((s, v) => s + v, 0) / 6;
  const sxy = xs.reduce((s, x, i) => s + (x - mx) * (yv[i] - my), 0), sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const b1 = sxy / sxx, b0 = my - b1 * mx;
  nearArr(re(beta), [b0, b1], 1e-12);
  const res = xs.map((x, i) => yv[i] - b0 - b1 * x); nearArr(re(r), res, 1e-12);
  near(sigma.re[0], res.reduce((s, v) => s + v * v, 0) / 4, 1e-12);
  // gls with identity covariance = ols; with diagonal covariance = weighted least squares
  const I6 = matrix(Array.from({ length: 6 }, (_, i) => Array.from({ length: 6 }, (_, j) => (i === j ? 1 : 0))));
  const [bg, vg] = call(ctx, 'gls', [y, X, I6], 2); nearArr(re(bg), [b0, b1], 1e-10); near(vg.re[0], sigma.re[0], 1e-10);
  const wts = [1, 2, 4, 1, 0.5, 3];
  const O = matrix(Array.from({ length: 6 }, (_, i) => Array.from({ length: 6 }, (_, j) => (i === j ? 1 / wts[i] : 0))));
  const bw = re(c1(ctx, 'gls', [y, X, O]));
  // weighted normal equations
  let s0 = 0, s1 = 0, s2 = 0, t0 = 0, t1 = 0; xs.forEach((x, i) => { const w = wts[i]; s0 += w; s1 += w * x; s2 += w * x * x; t0 += w * yv[i]; t1 += w * x * yv[i]; });
  const det = s0 * s2 - s1 * s1; nearArr(bw, [(s2 * t0 - s1 * t1) / det, (s0 * t1 - s1 * t0) / det], 1e-10);
});

test('quadcc: finite, infinite, singular and complex integrands', () => {
  const ctx = mockCtx();
  const vf = (f) => jsHandle(([x]) => tensor('double', x.dims.slice(), x.re.map(f)));
  near(c1(ctx, 'quadcc', [vf((x) => x * x), num(0), num(1)]).re[0], 1 / 3, 1e-14);
  near(c1(ctx, 'quadcc', [vf(Math.sin), num(Math.PI), num(0)]).re[0], -2, 1e-12);
  near(c1(ctx, 'quadcc', [vf((x) => Math.exp(-x)), num(0), num(Infinity)]).re[0], 1, 1e-9);
  near(c1(ctx, 'quadcc', [vf((x) => Math.exp(-x * x)), num(-Infinity), num(Infinity)]).re[0], Math.sqrt(Math.PI), 1e-9);
  near(c1(ctx, 'quadcc', [vf((x) => Math.exp(x)), num(-Infinity), num(0)]).re[0], 1, 1e-9);
  const [q, err, np] = call(ctx, 'quadcc', [vf((x) => 1 / Math.sqrt(x)), num(0), num(1)], 3);
  near(q.re[0], 2, 5e-6); assert.ok(err.re[0] < 1e-5); assert.ok(np.re[0] > 31);
  near(c1(ctx, 'quadcc', [vf((x) => 1 / Math.sqrt(Math.abs(x))), num(-1), num(1), rowVec([1e-12, 1e-10]), num(0)]).re[0], 4, 1e-6);
  near(c1(ctx, 'quadcc', [vf((x) => Math.abs(x - 0.3)), num(0), num(1), tensor('double', [0, 0]), num(0.3)]).re[0], 0.045 + 0.245, 1e-13);
  const cq = c1(ctx, 'quadcc', [jsHandle(([x]) => tensor('double', x.dims.slice(), x.re.map(Math.cos), x.re.map(Math.sin))), num(0), num(Math.PI / 2)]);
  near(cq.re[0], 1, 1e-12); near(cq.im[0], 1, 1e-12);
  assert.equal(c1(ctx, 'quadcc', [vf((x) => x), num(2), num(2)]).re[0], 0);
});

test('*_options keyword sets and quad_options feeding quad', () => {
  const ctx = mockCtx();
  near(c1(ctx, 'lsode_options', [str('relative tolerance')]).re[0], Math.sqrt(2.220446049250313e-16), 1e-20);
  call(ctx, 'lsode_options', [str('rel'), num(1e-6)], 0);
  assert.equal(c1(ctx, 'lsode_options', [str('relative tolerance')]).re[0], 1e-6);
  call(ctx, 'lsode_options', [str('integration method'), str('non')], 0);
  assert.equal(toStr(c1(ctx, 'lsode_options', [str('integration method')])), 'non-stiff');
  assert.throws(() => call(ctx, 'lsode_options', [str('integration method'), str('euler')], 0), /valid value/);
  assert.throws(() => call(ctx, 'lsode_options', [str('maximum')], 1), /ambiguous/);
  call(ctx, 'dassl_options', [], 0); assert.match(ctx.outText.join(''), /Options for DASSL include:[\s\S]*relative tolerance/);
  call(ctx, 'daspk_options', [str('algebraic variables'), rowVec([0, 1])], 0);
  assert.deepEqual(re(c1(ctx, 'daspk_options', [str('algebraic variables')])), [0, 1]);
  assert.ok(c1(ctx, 'dasrt_options', [str('maximum order')]).re[0] < 0);
  const f = jsHandle(([x]) => tensor('double', x.dims.slice(), x.re.map((v) => Math.exp(v))));
  const loose = Math.abs(c1(ctx, 'quad', [f, num(0), num(3), num(1e-2)]).re[0] - (Math.E ** 3 - 1));
  call(ctx, 'quad_options', [str('absolute tolerance'), num(1e-12)], 0);
  const tight = Math.abs(c1(ctx, 'quad', [f, num(0), num(3)]).re[0] - (Math.E ** 3 - 1));
  assert.ok(tight < 1e-9 && tight <= loose, `quad uses quad_options (${tight})`);
});

// ------------------------------------------------------------ ODE / DAE
test('lsode: scalar decay, oscillator with Jacobian, non-stiff method and critical times', () => {
  const ctx = mockCtx();
  const t = [0, 0.5, 1, 1.5, 2];
  const decay = jsHandle(([x, tt]) => { assert.equal(tt.re.length, 1); return num(-x.re[0]); });
  const [x, istate, msg] = call(ctx, 'lsode', [decay, num(1), rowVec(t)], 3);
  assert.deepEqual(x.dims, [5, 1]); nearArr(re(x), t.map((s) => Math.exp(-s)), 1e-6);
  assert.equal(istate.re[0], 2); assert.equal(toStr(msg), 'successful exit');
  const osc = jsHandle(([v]) => colVec([v.re[1], -v.re[0]]));
  const jac = jsHandle(() => matrix([[0, 1], [-1, 0]]));
  const ts = [0, 1, 2, 3.5];
  const xo = c1(ctx, 'lsode', [cell([1, 2], [osc, jac]), colVec([1, 0]), rowVec(ts)]);
  assert.deepEqual(xo.dims, [4, 2]);
  nearArr(re(xo).slice(0, 4), ts.map(Math.cos), 1e-6); nearArr(re(xo).slice(4), ts.map((s) => -Math.sin(s)), 1e-6);
  call(ctx, 'lsode_options', [str('integration method'), str('adams')], 0);
  nearArr(re(c1(ctx, 'lsode', [osc, colVec([1, 0]), rowVec(ts)])).slice(0, 4), ts.map(Math.cos), 1e-6);
  // a right-hand side that changes at t = 1: integration restarts there
  const ctx2 = mockCtx();
  const sw = jsHandle(([, tt]) => num(tt.re[0] < 1 ? 1 : -1));
  const xs = c1(ctx2, 'lsode', [sw, num(0), rowVec([0, 0.5, 1, 1.5, 2]), num(1)]);
  nearArr(re(xs), [0, 0.5, 1, 0.5, 0], 1e-7);
  // two output times only
  near(c1(ctx2, 'lsode', [decay, num(2), rowVec([0, 3])]).re[1], 2 * Math.exp(-3), 1e-6);
});

const daeRes = jsHandle(([x, xd]) => colVec([xd.re[0] + x.re[0], x.re[1] - x.re[0] ** 2])); // x1' = -x1, 0 = x2 - x1²
test('daspk and dassl: index-1 DAE against the analytic solution, consistent initial conditions', () => {
  for (const name of ['daspk', 'dassl']) {
    const ctx = mockCtx();
    const t = [0, 0.5, 1, 2];
    const [x, xd, istate] = call(ctx, name, [daeRes, colVec([1, 1]), colVec([-1, -2]), rowVec(t)], 3);
    assert.deepEqual(x.dims, [4, 2]); assert.equal(istate.re[0], 2);
    nearArr(re(x).slice(0, 4), t.map((s) => Math.exp(-s)), 2e-6, `${name} x1`);
    nearArr(re(x).slice(4), t.map((s) => Math.exp(-2 * s)), 2e-6, `${name} x2`);
    nearArr(re(xd).slice(0, 4), t.map((s) => -Math.exp(-s)), 5e-5, `${name} x1'`);
    nearArr(re(xd).slice(4), t.map((s) => -2 * Math.exp(-2 * s)), 5e-5, `${name} x2'`);
  }
  const ctx = mockCtx();
  call(ctx, 'daspk_options', [str('compute consistent initial condition'), num(1)], 0);
  call(ctx, 'daspk_options', [str('algebraic variables'), colVec([0, 1])], 0);
  const [x, xd] = call(ctx, 'daspk', [daeRes, colVec([1, 0.4]), colVec([0, 0]), rowVec([0, 1])], 2);
  nearArr(re(x), [1, Math.exp(-1), 1, Math.exp(-2)], 2e-6); near(xd.re[0], -1, 1e-6);
  // user Jacobian df/dx + cj df/dxdot
  const ctx3 = mockCtx();
  const jac = jsHandle(([x2, , , cj]) => matrix([[1 + cj.re[0], 0], [-2 * x2.re[0], 1]]));
  const xj = c1(ctx3, 'dassl', [cell([1, 2], [daeRes, jac]), colVec([1, 1]), colVec([-1, -2]), rowVec([0, 1.5])]);
  nearArr(re(xj), [1, Math.exp(-1.5), 1, Math.exp(-3)], 2e-6);
});

test('dasrt: stops at the first root of the constraint function', () => {
  const ctx = mockCtx();
  const ball = jsHandle(([x, xd]) => colVec([xd.re[0] - x.re[1], xd.re[1] + 9.81])); // height, velocity
  const g = jsHandle(([x]) => num(x.re[0]));
  const [x, xd, tout, istate, msg] = call(ctx, 'dasrt', [ball, g, colVec([10, 0]), colVec([0, -9.81]), rowVec([0, 0.5, 1, 2, 3])], 5);
  const tr = Math.sqrt(20 / 9.81);
  assert.equal(istate.re[0], 4); assert.match(toStr(msg), /root/);
  const to = re(tout); assert.equal(to.length, 4); nearArr(to.slice(0, 3), [0, 0.5, 1], 0); near(to[3], tr, 1e-6);
  assert.deepEqual(x.dims, [4, 2]); near(x.re[3], 0, 1e-6); near(x.re[1], 10 - 0.5 * 9.81 * 0.25, 1e-6);
  near(xd.re[4 + 3], -9.81, 1e-6);
  // without g: plain DAE solve, t_out = t
  const [x2, , t2, i2] = call(ctx, 'dasrt', [ball, colVec([10, 0]), colVec([0, -9.81]), rowVec([0, 1])], 4);
  assert.equal(i2.re[0], 2); assert.deepEqual(re(t2), [0, 1]); near(x2.re[1], 10 - 9.81 / 2, 1e-6);
});

test('odeplot as an OutputFcn and called directly', graphicsOnly, () => {
  const ctx = mockCtx();
  const opts = c1(ctx, 'odeset', [str('OutputFcn'), str('odeplot')]);
  const f = jsHandle(([, y]) => colVec([-y.re[0], y.re[0] - y.re[1]]));
  const [t] = call(ctx, 'ode45', [f, rowVec([0, 1]), colVec([1, 0]), opts], 2);
  assert.ok(t.re.length > 2); assert.equal(ctx.state.odeplot, null);
  assert.equal(c1(ctx, 'odeplot', [rowVec([0, 2]), colVec([1, 2]), str('init')]).re[0], 0);
  call(ctx, 'odeplot', [rowVec([0.5, 1]), matrix([[0.9, 0.8], [2.1, 2.2]]), str('')], 1);
  const h = ctx.state.odeplot.lines[1];
  assert.deepEqual(re(c1(ctx, 'get', [h, str('YData')])), [2, 2.1, 2.2]);
  call(ctx, 'odeplot', [tensor('double', [0, 0]), tensor('double', [0, 0]), str('done')], 1);
  assert.equal(ctx.state.odeplot, null);
});

// ------------------------------------------------------------ statistics
test('corrcov, kendall, spearman, ranks', () => {
  const ctx = mockCtx();
  const [r, s] = call(ctx, 'corrcov', [matrix([[4, 2], [2, 9]])], 2);
  nearArr(re(r), [1, 1 / 3, 1 / 3, 1], 1e-15); nearArr(re(s), [2, 3], 0);
  near(c1(ctx, 'kendall', [rowVec([1, 2, 3, 4]), rowVec([1, 3, 2, 4])]).re[0], 2 / 3, 1e-15);
  const km = c1(ctx, 'kendall', [matrix([[1, 4], [2, 3], [3, 2], [4, 1]])]); nearArr(re(km), [1, -1, -1, 1], 1e-15);
  const ry = [1, 2, 3.5, 5, 3.5]; const mx = 3, my = 3; let a = 0, b = 0, c = 0; ry.forEach((v, i) => { a += (i + 1 - mx) * (v - my); b += (i + 1 - mx) ** 2; c += (v - my) ** 2; });
  near(c1(ctx, 'spearman', [rowVec([1, 2, 3, 4, 5]), rowVec([5, 6, 7, 8, 7])]).re[0], a / Math.sqrt(b * c), 1e-15);
  const x = rowVec([10, 20, 20, 30]);
  assert.deepEqual(re(c1(ctx, 'ranks', [x])), [1, 2.5, 2.5, 4]);
  assert.deepEqual(re(c1(ctx, 'ranks', [x, num(2), num(1)])), [1, 2, 2, 4]);
  assert.deepEqual(re(c1(ctx, 'ranks', [x, num(2), str('modified')])), [1, 3, 3, 4]);
  assert.deepEqual(re(c1(ctx, 'ranks', [x, num(2), num(3)])), [1, 2, 2, 3]);
  assert.deepEqual(re(c1(ctx, 'ranks', [x, num(2), str('ordinal')])), [1, 2, 3, 4]);
  assert.deepEqual(re(c1(ctx, 'ranks', [matrix([[3, 1], [1, 2], [2, 2]])])), [3, 1, 2, 1, 2.5, 2.5]);
});

test('run_count, runlength, statistics', () => {
  const ctx = mockCtx();
  const rc = c1(ctx, 'run_count', [rowVec([1, 2, 3, 1, 2, 1, 5, 6, 7, 8]), num(3)]);
  assert.deepEqual(rc.dims, [1, 3]); assert.deepEqual(re(rc), [0, 1, 2]);
  assert.deepEqual(re(c1(ctx, 'run_count', [colVec([3, 2, 1]), num(2)])), [3, 0]);
  const [cnt, val] = call(ctx, 'runlength', [rowVec([2, 2, 0, 4, 4, 4, 0, 1, 1, 1, 1])], 2);
  assert.deepEqual(re(cnt), [2, 1, 3, 1, 4]); assert.deepEqual(re(val), [2, 0, 4, 0, 1]);
  const st = c1(ctx, 'statistics', [rowVec([1, 2, 3, 4, 5])]);
  assert.deepEqual(st.dims, [1, 9]);
  nearArr(re(st), [1, 1.75, 3, 4.25, 5, 3, Math.sqrt(2.5), 0, 1.7], 1e-14);
  const sm = c1(ctx, 'statistics', [matrix([[1, 10], [2, 20], [4, 40]])]); assert.deepEqual(sm.dims, [9, 2]);
  near(sm.re[5], 7 / 3, 1e-15); near(sm.re[9 + 5], 70 / 3, 1e-13);
  assert.throws(() => c1(ctx, 'statistics', [num(1)]), /too small/);
});

test('rmse and mape', () => {
  const ctx = mockCtx();
  near(c1(ctx, 'rmse', [rowVec([1, 2, 3]), rowVec([2, 2, 5])]).re[0], Math.sqrt(5 / 3), 1e-15);
  near(c1(ctx, 'mape', [rowVec([1, 2, 3]), rowVec([2, 2, 5])]).re[0], 30, 1e-12);
  const F2 = matrix([[1, 2], [3, 4]]), A2 = matrix([[1, 4], [5, 4]]);
  nearArr(re(c1(ctx, 'rmse', [F2, A2])), [Math.sqrt(2), Math.sqrt(2)], 1e-15);
  nearArr(re(c1(ctx, 'rmse', [F2, A2, num(2)])), [Math.sqrt(2), Math.sqrt(2)], 1e-15);
  near(c1(ctx, 'rmse', [F2, A2, str('all')]).re[0], Math.sqrt(2), 1e-15);
  near(c1(ctx, 'rmse', [F2, A2, rowVec([1, 2])]).re[0], Math.sqrt(2), 1e-15);
  near(c1(ctx, 'rmse', [rowVec([1, NaN, 3]), rowVec([2, 2, 3]), str('omitnan')]).re[0], Math.sqrt(0.5), 1e-15);
  assert.ok(Number.isNaN(c1(ctx, 'rmse', [rowVec([1, NaN, 3]), rowVec([2, 2, 3])]).re[0]));
  near(c1(ctx, 'rmse', [rowVec([1, 2]), rowVec([2, 2]), str('Weights'), rowVec([3, 1])]).re[0], Math.sqrt(3 / 4), 1e-15);
  near(c1(ctx, 'mape', [rowVec([90, 110]), num(100)]).re[0], 10, 1e-12);
});

test('discrete and empirical distributions', () => {
  const ctx = mockCtx();
  const v = rowVec([1, 2, 3]), p = rowVec([1, 1, 2]);
  const cd = re(c1(ctx, 'discrete_cdf', [rowVec([0.5, 1, 2.5, 3, NaN]), v, p]));
  nearArr(cd.slice(0, 4), [0, 0.25, 0.5, 1], 1e-15); assert.ok(Number.isNaN(cd[4]));
  const inv = re(c1(ctx, 'discrete_inv', [rowVec([-1, 0, 0.1, 0.5, 1, 2]), rowVec([0.1, 0.2, 0.3, 0.4, 0.5]), rowVec([1, 1, 1, 1, 1])]));
  assert.ok(Number.isNaN(inv[0]) && Number.isNaN(inv[1]) && Number.isNaN(inv[5])); nearArr(inv.slice(2, 5), [0.1, 0.3, 0.5], 1e-15);
  assert.deepEqual(re(c1(ctx, 'discrete_pdf', [rowVec([1, 2, 4]), v, p])), [0.25, 0.25, 0]);
  call(ctx, 'rng', [num(7)], 0);
  const r = re(c1(ctx, 'discrete_rnd', [v, rowVec([0.2, 0.3, 0.5]), num(1), num(20000)]));
  const fr = [1, 2, 3].map((k) => r.filter((x) => x === k).length / r.length);
  nearArr(fr, [0.2, 0.3, 0.5], 0.015);
  assert.deepEqual(c1(ctx, 'discrete_rnd', [v, p, rowVec([2, 3])]).dims, [2, 3]);
  const data = rowVec([1, 2, 2, 3]);
  assert.equal(c1(ctx, 'empirical_cdf', [num(2), data]).re[0], 0.75);
  assert.equal(c1(ctx, 'empirical_pdf', [num(2), data]).re[0], 0.5);
  assert.equal(c1(ctx, 'empirical_inv', [num(0.5), data]).re[0], 2);
  const er = c1(ctx, 'empirical_rnd', [data, num(3), num(4)]); assert.deepEqual(er.dims, [3, 4]); re(er).forEach((x) => assert.ok([1, 2, 3].includes(x)));
});

test('rande and randp moments', () => {
  const ctx = mockCtx();
  call(ctx, 'rng', [num(3)], 0);
  const e = re(c1(ctx, 'rande', [num(1), num(100000)]));
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length; const vr = (a) => { const m = mean(a); return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1); };
  near(mean(e), 1, 0.015); near(vr(e), 1, 0.04); assert.ok(e.every((x) => x > 0));
  assert.equal(c1(ctx, 'rande', [num(2), num(3), str('single')]).cls, 'single');
  for (const lam of [3, 50]) {
    const p = re(c1(ctx, 'randp', [num(lam), num(1), num(60000)]));
    assert.ok(p.every((x) => x >= 0 && x === Math.floor(x)));
    near(mean(p), lam, 0.03 * lam); near(vr(p), lam, 0.06 * lam);
  }
  const pm = c1(ctx, 'randp', [matrix([[0, 1], [2, -1]])]); assert.deepEqual(pm.dims, [2, 2]);
  assert.equal(pm.re[0], 0); assert.ok(Number.isNaN(pm.re[3]));
});

test('movfun, movmad, movslice', () => {
  const ctx = mockCtx();
  const mean = jsHandle(([w]) => num(w.re.reduce((s, v) => s + v, 0) / w.re.length));
  const x = rowVec([1, 2, 3, 4, 5]);
  nearArr(re(c1(ctx, 'movfun', [mean, x, num(3)])), [1.5, 2, 3, 4, 4.5], 1e-15);
  nearArr(re(c1(ctx, 'movfun', [mean, x, num(3), str('Endpoints'), str('discard')])), [2, 3, 4], 1e-15);
  const fl = re(c1(ctx, 'movfun', [mean, x, num(3), str('Endpoints'), str('fill')])); assert.ok(Number.isNaN(fl[0]) && Number.isNaN(fl[4])); nearArr(fl.slice(1, 4), [2, 3, 4], 1e-15);
  nearArr(re(c1(ctx, 'movfun', [mean, x, num(3), str('Endpoints'), num(-7)])), [-7, 2, 3, 4, -7], 1e-15);
  nearArr(re(c1(ctx, 'movfun', [mean, x, num(3), str('Endpoints'), str('periodic')])), [8 / 3, 2, 3, 4, 10 / 3], 1e-15);
  nearArr(re(c1(ctx, 'movfun', [mean, x, num(3), str('Endpoints'), str('same')])), [4 / 3, 2, 3, 4, 14 / 3], 1e-15);
  nearArr(re(c1(ctx, 'movfun', [mean, x, rowVec([1, 0])])), [1, 1.5, 2.5, 3.5, 4.5], 1e-15);
  nearArr(re(c1(ctx, 'movfun', [mean, rowVec([1, NaN, 3]), num(3), str('nancond'), str('omitnan')])), [1, 2, 3], 1e-15);
  const M = c1(ctx, 'movfun', [mean, matrix([[1, 10], [2, 20], [3, 30]]), num(3)]); nearArr(re(M), [1.5, 2, 2.5, 15, 20, 25], 1e-13);
  const two = jsHandle(([w]) => rowVec([Math.min(...w.re), Math.max(...w.re)]));
  const mm = c1(ctx, 'movfun', [two, colVec([3, 1, 4, 1, 5]), num(3)]); assert.deepEqual(mm.dims, [5, 2]);
  assert.deepEqual(re(mm), [1, 1, 1, 1, 1, 3, 4, 4, 5, 5]);
  assert.deepEqual(re(c1(ctx, 'movfun', [two, colVec([3, 1, 4, 1, 5]), num(3), str('outdim'), num(2)])), [3, 4, 4, 5, 5]);
  nearArr(re(c1(ctx, 'movmad', [rowVec([1, 2, 4, 8, 16]), num(3)])), [0.5, 1, 2, 4, 4], 1e-15);
  const [s, C, Cpre, Cpos, win] = call(ctx, 'movslice', [num(10), num(3)], 5);
  assert.deepEqual(s.dims, [3, 8]); assert.deepEqual(re(s).slice(0, 6), [1, 2, 3, 2, 3, 4]);
  assert.deepEqual(re(C), [2, 3, 4, 5, 6, 7, 8, 9]); assert.deepEqual(re(Cpre), [1]); assert.deepEqual(re(Cpos), [10]); assert.deepEqual(re(win), [-1, 0, 1]);
  const [s4, C4] = call(ctx, 'movslice', [num(6), num(4)], 2); assert.deepEqual(s4.dims, [4, 3]); assert.deepEqual(re(C4), [3, 4, 5]);
});

// ------------------------------------------------------------ time series and signals
test('autoreg_matrix, durbinlevinson, yulewalker', () => {
  const ctx = mockCtx();
  assert.deepEqual(re(c1(ctx, 'autoreg_matrix', [rowVec([1, 2, 3]), num(2)])), [1, 1, 1, 0, 1, 2, 0, 0, 1]);
  const rho = 0.6, g0 = 1 / (1 - rho * rho);
  nearArr(re(c1(ctx, 'durbinlevinson', [rowVec([g0, g0 * rho, g0 * rho * rho])])), [0, 0.6], 1e-14);
  const [p1, v1] = call(ctx, 'durbinlevinson', [rowVec([g0, g0 * rho, g0 * rho * rho]), num(0.6), num(g0 * (1 - 0.36))], 2);
  nearArr(re(p1), [0, 0.6], 1e-14); near(v1.re[0], 1, 1e-14);
  const r1 = 0.5 / 0.7, r2 = 0.5 * r1 + 0.3, r3 = 0.5 * r2 + 0.3 * r1;
  nearArr(re(c1(ctx, 'durbinlevinson', [rowVec([1, r1, r2, r3])])), [0, 0.3, 0.5], 1e-13);
  const [a, v] = call(ctx, 'yulewalker', [rowVec([1, r1, r2])], 2);
  nearArr(re(a), [0.5, 0.3], 1e-13); near(v.re[0], 1 - 0.5 * r1 - 0.3 * r2, 1e-14);
});

test('arch_rnd, arch_fit, arch_test and arma_rnd', () => {
  const ctx = mockCtx();
  call(ctx, 'rng', [num(11)], 0);
  const Tn = 6000;
  const y = c1(ctx, 'arch_rnd', [colVec([1, 0.5]), num(0), num(Tn)]);
  assert.deepEqual(y.dims, [Tn, 1]);
  const ones = colVec(new Array(Tn).fill(1));
  const [a, b] = call(ctx, 'arch_fit', [y, ones, num(1), num(60), num(0.5)], 2);
  near(a.re[0], 1, 0.15); near(a.re[1], 0.5, 0.12); near(b.re[0], 0, 0.1);
  const [pval, lm] = call(ctx, 'arch_test', [y, ones, num(2)], 2);
  assert.ok(pval.re[0] < 1e-6 && lm.re[0] > 50, `ARCH effect detected (p = ${pval.re[0]})`);
  const wn = colVec(Array.from({ length: 2000 }, () => c1(ctx, 'randn', []).re[0]));
  assert.ok(c1(ctx, 'arch_test', [wn, num(0), num(2)]).re[0] > 0.001);
  const x = re(c1(ctx, 'arma_rnd', [num(0.8), tensor('double', [0, 0]), num(1), num(20000)]));
  const m = x.reduce((s, v) => s + v, 0) / x.length;
  let c0 = 0, c1v = 0; for (let i = 0; i < x.length; i++) { c0 += (x[i] - m) ** 2; if (i) c1v += (x[i] - m) * (x[i - 1] - m); }
  near(c1v / c0, 0.8, 0.02); near(c0 / x.length, 1 / (1 - 0.64), 0.2);
  const ma = c1(ctx, 'arma_rnd', [tensor('double', [0, 0]), num(0.5), num(2), num(10), num(0)]); assert.deepEqual(ma.dims, [10, 1]);
});

test('fractdiff, diffpara, hurst', () => {
  const ctx = mockCtx();
  assert.deepEqual(re(c1(ctx, 'fractdiff', [rowVec([1, 2, 4, 7]), num(1)])), [1, 2, 3]);
  nearArr(re(c1(ctx, 'fractdiff', [colVec([1, 0, 0, 0]), num(0.5)])), [1, -0.5, -0.125, -0.0625], 1e-15);
  call(ctx, 'rng', [num(5)], 0);
  const n = 4096; const e = Array.from({ length: n }, () => c1(ctx, 'randn', []).re[0]);
  const [d0] = call(ctx, 'diffpara', [colVec(e)], 1); near(d0.re[0], 0, 0.25);
  const walk = []; e.reduce((s, v) => { walk.push(s + v); return s + v; }, 0);
  const [d1, dd] = call(ctx, 'diffpara', [colVec(walk)], 2); near(d1.re[0], 1, 0.25); near(dd.re[0], d1.re[0], 0);
  const both = c1(ctx, 'diffpara', [matrix(e.map((v, i) => [v, walk[i]])), num(5), num(40)]); assert.deepEqual(both.dims, [1, 2]);
  // hurst: rescaled range of a known series
  const xs = [1, 3, 2, 5, 4]; const mx = 3; let w = 0, hi = -Infinity, lo = Infinity; for (const v of xs) { w += v - mx; hi = Math.max(hi, w); lo = Math.min(lo, w); }
  const sd = Math.sqrt(xs.reduce((s, v) => s + (v - mx) ** 2, 0) / 4);
  near(c1(ctx, 'hurst', [rowVec(xs)]).re[0], Math.log((hi - lo) / sd) / Math.log(5), 1e-14);
  assert.deepEqual(c1(ctx, 'hurst', [matrix([[1, 2], [3, 1], [2, 5]])]).dims, [1, 2]);
});

test('spectral_adf, spectral_xdf, spencer', () => {
  const ctx = mockCtx();
  const c = [1, 0.5, 0.25, 0.125];
  const r = c1(ctx, 'spectral_adf', [rowVec(c)]); assert.deepEqual(r.dims, [4, 2]);
  const b = 1 / Math.ceil(Math.sqrt(4)); const w = c.map((_, k) => Math.max(0, 1 - k * b)); const cw = c.map((v, k) => v * w[k]);
  const dens = [0, 1, 2, 3].map((k) => 2 * cw.reduce((s, v, j) => s + v * Math.cos(2 * Math.PI * j * k / 4), 0) - cw[0]);
  nearArr(re(r).slice(0, 4), [0, 0.25, 0.5, 0.75], 1e-15); nearArr(re(r).slice(4), dens, 1e-14);
  const rr = c1(ctx, 'spectral_adf', [rowVec(c), str('rectangle'), num(0.5)]);
  const cr = [1, 0.5, 0, 0]; nearArr(re(rr).slice(4), [0, 1, 2, 3].map((k) => 2 * cr.reduce((s, v, j) => s + v * Math.cos(2 * Math.PI * j * k / 4), 0) - 1), 1e-14);
  // spectral_xdf: FFT circular convolution against a direct one
  const x = [0.3, -1.2, 2.5, 0.7, -0.4, 1.1, -2.0, 0.6]; const n = x.length; const m = x.reduce((s, v) => s + v, 0) / n; const xc = x.map((v) => v - m);
  const per = Array.from({ length: n }, (_, k) => { let a = 0, s = 0; xc.forEach((v, j) => { a += v * Math.cos(2 * Math.PI * j * k / n); s -= v * Math.sin(2 * Math.PI * j * k / n); }); return (a * a + s * s) / (n * n); });
  const bb = 1 / Math.ceil(Math.sqrt(n));
  const sw = Array.from({ length: n }, (_, k) => { if (!k) return 1 / bb; const l = 2 * Math.PI * k / n; return bb * (Math.sin(l / (2 * bb)) / Math.sin(l / 2)) ** 2; });
  const conv = Array.from({ length: n }, (_, k) => per.reduce((s, v, j) => s + v * sw[((k - j) % n + n) % n], 0));
  const xd = c1(ctx, 'spectral_xdf', [rowVec(x)]); nearArr(re(xd).slice(n), conv, 1e-13);
  const sp = re(c1(ctx, 'spencer', [colVec(Array.from({ length: 20 }, (_, i) => (i + 1) ** 3 / 100))]));
  for (let i = 7; i < 13; i++) near(sp[i], (i + 1) ** 3 / 100, 1e-10);
  assert.deepEqual(sp.slice(0, 7), [0, 0, 0, 0, 0, 0, 0]); assert.equal(sp[19], 0);
});

test('sinetone, sinewave, stft, synthesis', () => {
  const ctx = mockCtx();
  const st = c1(ctx, 'sinetone', [rowVec([1000, 2000]), num(8000), num(0.001), num(1)]);
  assert.deepEqual(st.dims, [8, 2]); nearArr(re(st).slice(0, 8), Array.from({ length: 8 }, (_, k) => Math.sin(2 * Math.PI * 1000 * (k + 1) / 8000)), 1e-15);
  assert.equal(c1(ctx, 'sinetone', [num(440)]).dims[0], 8000);
  nearArr(re(c1(ctx, 'sinewave', [num(4)])), [0, 1, 0, -1], 1e-15);
  nearArr(re(c1(ctx, 'sinewave', [num(3), num(4), num(2)])), [0, -1, 0], 1e-15);
  const x = Array.from({ length: 400 }, (_, i) => Math.sin(0.3 * i) + 0.5 * Math.cos(0.05 * i * i / 40));
  const [y, c] = call(ctx, 'stft', [colVec(x)], 2);
  assert.deepEqual(y.dims, [64, 14]); assert.deepEqual(re(c), [80, 24, 2]);
  const ham = Array.from({ length: 80 }, (_, k) => 0.54 - 0.46 * Math.cos(2 * Math.PI * k / 79));
  const seg = x.slice(24, 104).map((v, k) => v * ham[k]);
  const mag3 = Math.hypot(seg.reduce((s, v, j) => s + v * Math.cos(2 * Math.PI * 3 * j / 80), 0), seg.reduce((s, v, j) => s + v * Math.sin(2 * Math.PI * 3 * j / 80), 0));
  near(y.re[64 + 3], mag3, 1e-12);
  const y2 = c1(ctx, 'stft', [colVec(x), num(64), num(32), num(64), str('rectangle')]); assert.deepEqual(y2.dims, [64, 11]);
  const xs = c1(ctx, 'synthesis', [y, c]); assert.deepEqual(xs.dims, [24 * 14, 1]);
  // a full-length rectangular frame set is inverted exactly where the window is 1
  const z = Array.from({ length: 64 }, (_, i) => Math.exp(-((i - 32) ** 2) / 50));
  const [yz, cz] = call(ctx, 'stft', [colVec(z), num(64), num(32), num(64), num(3)], 2);
  const zr = re(c1(ctx, 'synthesis', [yz, cz])); assert.equal(zr.length, 32); assert.ok(zr.every(Number.isFinite));
  assert.throws(() => c1(ctx, 'stft', [colVec([1, 2, 3])]), /WIN_SIZE/);
});

test('freqz_plot and fftw', graphicsOnly, () => {
  const ctx = mockCtx();
  const w = Array.from({ length: 64 }, (_, i) => Math.PI * i / 64);
  const hr = w.map((v) => 0.5 + 0.5 * Math.cos(v)), hi = w.map((v) => -0.5 * Math.sin(v));
  assert.doesNotThrow(() => call(ctx, 'freqz_plot', [rowVec(w), tensor('double', [1, 64], Float64Array.from(hr), Float64Array.from(hi))], 0));
  assert.equal(toStr(c1(ctx, 'fftw', [str('planner')])), 'estimate');
  assert.equal(toStr(c1(ctx, 'fftw', [str('planner'), str('measure')])), 'estimate');
  assert.equal(toStr(c1(ctx, 'fftw', [str('planner')])), 'measure');
  call(ctx, 'fftw', [str('threads'), num(4)], 0); assert.equal(c1(ctx, 'fftw', [str('threads')]).re[0], 4);
  call(ctx, 'fftw', [str('dwisdom'), str('abc')], 1); assert.equal(toStr(c1(ctx, 'fftw', [str('dwisdom')])), 'abc');
  assert.throws(() => call(ctx, 'fftw', [str('planner'), str('fast')], 1), /planner/);
});

test('every octave-numeric builtin is registered and documented in English and Korean', () => {
  const ctx = mockCtx();
  const names = Object.keys(octave.builtins);
  assert.equal(names.length, 87);
  for (const k of names) {
    assert.equal(ctx.registry.owner[k], 'numeric', `owner of ${k}`);
    const h = octave.help[k];
    assert.ok(h && h.en && h.ko && Array.isArray(h.syntax) && h.syntax.length, `help for ${k}`);
    assert.ok(ctx.registry.help[k], `registry help for ${k}`);
  }
});
