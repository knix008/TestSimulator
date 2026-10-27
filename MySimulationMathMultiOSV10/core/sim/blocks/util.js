// Helpers shared by the block definitions: parameter descriptors, the def()
// factory and small signal (Float64Array) operations.
//
// Runtime contract of a block (returned by def.make(B)):
//   { ts?        sample time: -1 inherited, 0 continuous, [T, offset] discrete, Infinity constant
//     direct?    direct feedthrough: true | false | boolean[] per input (default true)
//     nx?        number of continuous states;  x0?() → Float64Array
//     widthFromInput?  true: nx follows the width of input 1 (Integrator-like); setWidth(w)
//     init?(S)   before the run;  output(S, u, x) → [y1, y2, ...] (Float64Array each, or bus objects)
//     deriv?(S, u, x, dx)   continuous derivatives
//     update?(S, u, x)      discrete update at a major step (may write x for resets)
//     zc?(S, u, x) → number[]   zero-crossing functions (located by variable-step solvers)
//     nextHit?(t) → time of the next breakpoint after t (sources with jumps)
//     term?(S) }
// S is the run state: { t, minor, major, run } (see runtime.js).
// B gives the evaluated parameters: B.str(n) raw text, B.num(n), B.arr(n) Float64Array,
// B.val(n) Value, B.bool(n), B.mat(n) {re, m, n}, plus B.block, B.path, B.nIn, B.nOut, B.run.

export const L = (en, ko) => ({ en, ko });

/** Parameter descriptor. type: expr | text | enum | bool | code | dtype. */
export function P(name, type, def, en, ko, extra = {}) {
  return { name, type, def: String(def), label: L(en, ko), ...extra };
}
export const opt = (value, en, ko) => ({ value, label: L(en || value, ko || en || value) });
export const enumP = (name, def, en, ko, options, extra = {}) => P(name, 'enum', def, en, ko, { options: options.map((o) => (typeof o === 'string' ? opt(o) : o)), ...extra });
export const boolP = (name, def, en, ko, extra = {}) => P(name, 'bool', def ? 'on' : 'off', en, ko, extra);
export const numP = (name, def, en, ko, extra = {}) => P(name, 'expr', def, en, ko, { num: true, ...extra });
export const TS = (def = '-1') => numP('SampleTime', def, 'Sample time (-1 = inherited)', '샘플 시간 (-1 = 상속)', { tab: 'advanced', step: 0.01 });

export const DTYPES = ['double', 'single', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'boolean'];

/** Block definition with defaults filled in. */
export function def(type, group, en, ko, o = {}) {
  return {
    type, group, label: L(en, ko), desc: o.desc || L('', ''), params: o.params || [], size: o.size || [40, 40],
    ports: o.ports || { in: 1, out: 1 }, icon: o.icon || (() => ({ text: en })), make: o.make || null,
    template: o.template || null, shape: o.shape || 'rect', hideName: !!o.hideName, virtual: !!o.virtual, ...o.extra,
  };
}

// ---------------------------------------------------------------- signals

export const F = (n) => new Float64Array(n);
export const S1 = (x) => { const a = new Float64Array(1); a[0] = x; return a; };
export const at = (u, i) => (u.length === 1 ? u[0] : u[i]);
export function map1(u, f) { const y = new Float64Array(u.length); for (let i = 0; i < u.length; i++) y[i] = f(u[i], i); return y; }
export function map2(a, b, f) {
  const n = Math.max(a.length, b.length);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = f(a.length === 1 ? a[0] : a[i], b.length === 1 ? b[0] : b[i], i);
  return y;
}
export function widthOf(us) { let n = 1; for (const u of us) if (u && u.length > n) n = u.length; return n; }
export const copy = (u) => { const y = Float64Array.from(u); if (u.dims) y.dims = u.dims; return y; };
export const withDims = (y, dims) => { if (dims && dims.length === 2 && !(dims[1] === 1)) y.dims = dims; return y; };
export const dimsOfSig = (u) => (u && u.dims ? u.dims : [u ? u.length : 1, 1]);
export const isBus = (u) => u != null && u.bus === true;

/** Sample time parameter → -1 | 0 | Infinity | [T, offset]. */
export function parseTs(v) {
  if (v == null) return -1;
  const a = v instanceof Float64Array || Array.isArray(v) ? Array.from(v) : [Number(v)];
  if (!a.length) return -1;
  const T = a[0];
  if (T === -1) return -1;
  if (T === 0) return 0;
  if (!Number.isFinite(T)) return Infinity;
  if (T < 0) return -1;
  return [T, a[1] || 0];
}
export const tsOf = (B, fallback = -1) => (B.has('SampleTime') ? parseTs(B.arr('SampleTime')) : fallback);

export const sat = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const sgn = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);

/** Interpolation helpers for lookup blocks. */
export function findInterval(bp, x) {
  // index k with bp[k] <= x < bp[k+1], clamped to [0, n-2]
  const n = bp.length;
  if (n < 2) return 0;
  if (x <= bp[0]) return 0;
  if (x >= bp[n - 1]) return n - 2;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (bp[mid] <= x) lo = mid; else hi = mid; }
  return lo;
}
export function interp1(bp, tab, x, method = 'linear', extrap = 'linear') {
  const n = bp.length;
  if (n === 0) return 0;
  if (n === 1) return tab[0];
  if (extrap === 'clip') x = sat(x, bp[0], bp[n - 1]);
  const k = findInterval(bp, x);
  const x0 = bp[k], x1 = bp[k + 1];
  const f = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
  switch (method) {
    case 'nearest': return f < 0.5 ? tab[k] : tab[k + 1];
    case 'below': case 'flat': return f >= 1 ? tab[k + 1] : tab[k];
    case 'above': return f <= 0 ? tab[k] : tab[k + 1];
    default: return tab[k] + f * (tab[k + 1] - tab[k]);
  }
}

/** Polynomial evaluation (highest power first). */
export function polyval(c, x) { let y = 0; for (let i = 0; i < c.length; i++) y = y * x + c[i]; return y; }

/** Controllable canonical state-space form of num/den (proper). */
export function tf2ss(num, den) {
  let d = Array.from(den);
  while (d.length > 1 && d[0] === 0) d.shift();
  const a0 = d[0];
  d = d.map((x) => x / a0);
  const n = d.length - 1;
  let nm = Array.from(num).map((x) => x / a0);
  while (nm.length > n + 1 && nm[0] === 0) nm.shift();
  if (nm.length > n + 1) throw new Error('The transfer function must be proper (numerator degree <= denominator degree).');
  while (nm.length < n + 1) nm.unshift(0);
  const D = nm[0];
  const A = F(n * n), Bm = F(n), C = F(n);
  for (let j = 0; j < n; j++) A[0 + j * n] = -d[j + 1];
  for (let i = 1; i < n; i++) A[i + (i - 1) * n] = 1;
  if (n) Bm[0] = 1;
  for (let j = 0; j < n; j++) C[j] = nm[j + 1] - nm[0] * d[j + 1];
  return { A, B: Bm, C, D, n };
}

/** Polynomial with given roots (real coefficients for conjugate pairs). */
export function poly(rootsRe, rootsIm) {
  let cr = [1], ci = [0];
  for (let k = 0; k < rootsRe.length; k++) {
    const rr = rootsRe[k], ri = rootsIm ? rootsIm[k] || 0 : 0;
    const nr = new Array(cr.length + 1).fill(0), ni = new Array(cr.length + 1).fill(0);
    for (let i = 0; i < cr.length; i++) {
      nr[i] += cr[i]; ni[i] += ci[i];
      nr[i + 1] -= cr[i] * rr - ci[i] * ri; ni[i + 1] -= cr[i] * ri + ci[i] * rr;
    }
    cr = nr; ci = ni;
  }
  return cr;
}

/** y = M*v for a column-major m x n matrix. */
export function matvec(M, m, n, v, out = F(m)) {
  for (let i = 0; i < m; i++) { let s = 0; for (let j = 0; j < n; j++) s += M[i + j * m] * v[j]; out[i] = s; }
  return out;
}

/** Saturated cast of a number to a data type name. */
export function castTo(dtype, x, round = 'nearest') {
  if (dtype === 'boolean' || dtype === 'logical') return x !== 0 && !Number.isNaN(x) ? 1 : 0;
  if (dtype === 'double' || !dtype) return x;
  if (dtype === 'single') return Math.fround(x);
  const r = { int8: [-128, 127], uint8: [0, 255], int16: [-32768, 32767], uint16: [0, 65535], int32: [-2147483648, 2147483647], uint32: [0, 4294967295] }[dtype];
  if (!r) return x;
  if (Number.isNaN(x)) return 0;
  let v;
  switch (round) {
    case 'floor': v = Math.floor(x); break;
    case 'ceil': v = Math.ceil(x); break;
    case 'zero': v = Math.trunc(x); break;
    default: v = x < 0 ? -Math.round(-x) : Math.round(x);
  }
  return v < r[0] ? r[0] : v > r[1] ? r[1] : v;
}

/** Deterministic random generator (mulberry32) + normal deviates. */
export function rng(seed) {
  let s = (Math.floor(Math.abs(seed)) >>> 0) || 0x9e3779b9;
  const u = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let spare = null;
  const n = () => {
    if (spare != null) { const v = spare; spare = null; return v; }
    let a, b, r;
    do { a = 2 * u() - 1; b = 2 * u() - 1; r = a * a + b * b; } while (r >= 1 || r === 0);
    const f = Math.sqrt(-2 * Math.log(r) / r);
    spare = b * f; return a * f;
  };
  return { u, n };
}
