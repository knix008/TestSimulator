// Test helpers for the linear algebra area. The registry contains only the
// linalg builtins, and the context is built here (not from
// test/helpers/mockctx.mjs, which loads every area), so these tests do not
// depend on other areas being complete.
import assert from 'node:assert/strict';
import * as linalg from '../core/lib/linalg/index.js';
import { matrix, tensor, num, str, toTensor, isSparse, MError, isFuncHandle } from '../core/value.js';

export { matrix, tensor, num, str };

/** Test-only function handle wrapping a JS function (args, nargout) => Value | Value[]. */
export const jsHandle = (jsfn) => ({ cls: 'function_handle', dims: [1, 1], jsfn });

/** Elementwise helpers the tests call by name (the base area owns the real ones). */
const ew1 = (f) => (args) => {
  const t = args[0];
  const re = new Float64Array(t.re.length), im = new Float64Array(t.re.length);
  for (let i = 0; i < re.length; i++) { const [a, b] = f(t.re[i], t.im ? t.im[i] : 0); re[i] = a; im[i] = b; }
  return tensor('double', t.dims, re, im.some((x) => x !== 0) ? im : null);
};
const EXTRA = {
  sin: ew1((a, b) => [Math.sin(a) * Math.cosh(b), Math.cos(a) * Math.sinh(b)]),
  cos: ew1((a, b) => [Math.cos(a) * Math.cosh(b), -Math.sin(a) * Math.sinh(b)]),
  exp: ew1((a, b) => [Math.exp(a) * Math.cos(b), Math.exp(a) * Math.sin(b)]),
  square: ew1((a, b) => [a * a - b * b, 2 * a * b]),
};

export function linalgRegistry() {
  return { builtins: { ...linalg.builtins }, owner: {}, help: { ...linalg.help }, classes: { ...linalg.classes }, installs: [] };
}

/** Minimal context (same members as test/helpers/mockctx.mjs). */
export function makeCtx() {
  const reg = linalgRegistry();
  const outText = [], warnings = [];
  const vars = Object.create(null);
  const ctx = {
    registry: reg, outText, warnings, state: {},
    format: { numeric: 'short', spacing: 'loose' },
    host: { post() {}, request() { return null; } },
    out(text) { outText.push(text); },
    errOut(text) { outText.push(text); },
    warning(id, message) { warnings.push({ id, message }); },
    onMessage() {},
    checkInterrupt() {},
    getVar(name) { return vars[name]; },
    setVar(name, v) { vars[name] = v; },
    evalString() { throw new MError('test:noInterpreter', 'evalString is not available in this context'); },
    call(fn, args, nargout = 1) {
      let r;
      if (typeof fn === 'string') {
        const b = reg.builtins[fn] || EXTRA[fn];
        if (!b) throw new MError('test:undefined', `Undefined function '${fn}'.`);
        r = b(args, nargout, ctx);
      } else if (isFuncHandle(fn) && fn.jsfn) r = fn.jsfn(args, nargout);
      else if (isFuncHandle(fn) && fn.name) return ctx.call(fn.name, args, nargout);
      else throw new MError('test:badCall', 'cannot call this value');
      return Array.isArray(r) ? r : r === undefined ? [] : [r];
    },
  };
  return ctx;
}

/** Calls a linalg builtin; returns an array of outputs. */
export function call(name, args, nargout = 1, ctx = makeCtx()) {
  const fn = linalg.builtins[name];
  assert.ok(fn, `builtin ${name} exists`);
  const r = fn(args.map(V), nargout, ctx);
  return Array.isArray(r) ? r : [r];
}
/** First output of a call. */
export const c1 = (name, args, ctx) => call(name, args, 1, ctx)[0];

/** JS number / nested array / Value → Value. Nested arrays are rows. */
export function V(x) {
  if (x == null) return x;
  if (typeof x === 'number') return num(x);
  if (typeof x === 'string') return str(x);
  if (Array.isArray(x)) {
    if (x.length === 0) return tensor('double', [0, 0]);
    if (Array.isArray(x[0])) return matrix(x);
    return tensor('double', [1, x.length], x);
  }
  return x;
}
/** Complex matrix from re rows and im rows. */
export function C(reRows, imRows) {
  const a = matrix(reRows), b = matrix(imRows);
  return { ...a, im: b.re };
}
/** Value → {m, n, re, im} dense. */
export function D(v) { const t = isSparse(v) ? toTensor(v) : v; return { m: t.dims[0], n: t.dims[1], dims: t.dims, re: t.re, im: t.im }; }
/** Element (i, j) (0-based) of a Value: [re, im]. */
export function at(v, i, j = 0) { const t = D(v); const k = i + j * t.m; return [t.re[k], t.im ? t.im[k] : 0]; }

/** Max abs difference between Values / arrays. */
export function maxDiff(a, b) {
  const flat = (x) => ArrayBuffer.isView(x) || (Array.isArray(x) && !Array.isArray(x[0]));
  const A = flat(a) ? { re: Float64Array.from(a), im: null } : D(V(a));
  const B = flat(b) ? { re: Float64Array.from(b), im: null } : D(V(b));
  assert.equal(A.re.length, B.re.length, 'same number of elements');
  let d = 0;
  for (let i = 0; i < A.re.length; i++) {
    const dr = A.re[i] - B.re[i], di = (A.im ? A.im[i] : 0) - (B.im ? B.im[i] : 0);
    const e = Math.hypot(dr, di);
    if (Number.isNaN(e)) { if (!(Number.isNaN(A.re[i]) && Number.isNaN(B.re[i]))) return Infinity; } else if (A.re[i] === B.re[i] && !Number.isFinite(A.re[i])) { /* equal infinities */ } else if (e > d) d = e;
  }
  return d;
}
/** Asserts all elements close (absolute tol). */
export function close(a, b, tol = 1e-10, msg = '') {
  const d = maxDiff(a, b);
  assert.ok(d <= tol, `${msg} max diff ${d} > ${tol}`);
}
/** Relative closeness of scalars. */
export function relClose(x, y, tol = 1e-12, msg = '') {
  const d = Math.abs(x - y) / Math.max(Math.abs(y), 1e-300);
  assert.ok(d <= tol || x === y, `${msg} ${x} vs ${y} (rel ${d})`);
}
export const dims = (v) => v.dims.slice();
export { assert };
