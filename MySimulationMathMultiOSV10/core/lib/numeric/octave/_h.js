// Helpers of the Octave-compatibility submodule (core/lib/numeric/octave).
import { tensor, prod, isText, toStr, toNum, isTensor, isSparse, toTensor } from '../../../value.js';
import { E, F, isEmptyV } from '../_util.js';

/** Tensor view of a numeric argument (sparse → full, logical/char/int → values). */
export function T(v, fn, what = 'Argument') {
  if (v == null) throw E(`${fn}:nargin`, `${fn}: ${what} is missing.`);
  if (typeof v === 'number') return tensor('double', [1, 1], Float64Array.of(v));
  if (isTensor(v) || isSparse(v)) return toTensor(v);
  throw E(`${fn}:notNumeric`, `${fn}: ${what} must be numeric.`);
}

/** Element-wise map of a real-or-complex tensor. fr(x) for real data; fc(re, im) → [re, im] for complex data
 *  (fc may be null: the imaginary part is then an error). fr may return [re, im] to produce complex output. */
export function mapEl(v, fn, fr, fc = null) {
  const t = T(v, fn);
  const n = t.re.length;
  const re = new Float64Array(n);
  let im = null;
  const cplx = t.im && t.im.some((x) => x !== 0);
  if (cplx && !fc) throw E(`${fn}:complex`, `${fn}: the argument must be real.`);
  for (let i = 0; i < n; i++) {
    const r = cplx ? fc(t.re[i], t.im[i]) : fr(t.re[i]);
    if (Array.isArray(r)) { if (!im) im = new Float64Array(n); re[i] = r[0]; im[i] = r[1]; } else re[i] = r;
  }
  if (im && im.every((x) => x === 0)) im = null;
  return tensor(t.cls === 'single' ? 'single' : 'double', t.dims.slice(), re, im);
}

/** First non-singleton dimension (0-based). */
export const defDim = (dims) => { const k = dims.findIndex((d) => d !== 1); return k < 0 ? 0 : k; };
/** Optional 1-based dim argument → 0-based. */
export function dimOf(v, dims, fn) {
  if (v == null || isEmptyV(v)) return defDim(dims);
  const d = toNum(v);
  if (!Number.isInteger(d) || d < 1) throw E(`${fn}:badDim`, `${fn}: DIM must be a valid dimension.`);
  return d - 1;
}

/**
 * Applies f(re: Float64Array, im: Float64Array|null) → {re: number[], im?: number[]} (length outLen) along dim.
 * Returns a tensor with dims[dim] = outLen.
 */
export function along(t, dim, outLen, f) {
  const dims = t.dims.slice(); while (dims.length <= dim) dims.push(1);
  let stride = 1; for (let i = 0; i < dim; i++) stride *= dims[i];
  const len = dims[dim]; const outer = prod(dims.slice(dim + 1));
  const od = dims.slice(); od[dim] = outLen;
  const N = prod(od);
  const re = new Float64Array(N); let im = null;
  const vr = new Float64Array(len), vi = t.im ? new Float64Array(len) : null;
  for (let o = 0; o < outer; o++) for (let i = 0; i < stride; i++) {
    for (let k = 0; k < len; k++) { const s = i + stride * (k + len * o); vr[k] = t.re[s]; if (vi) vi[k] = t.im[s]; }
    const r = f(vr, vi);
    for (let k = 0; k < outLen; k++) {
      const d = i + stride * (k + outLen * o);
      re[d] = r.re[k];
      if (r.im) { if (!im) im = new Float64Array(N); im[d] = r.im[k]; }
    }
  }
  return tensor('double', od, re, im && im.some((x) => x !== 0) ? im : null);
}

/** Text option (lower case) or null. */
export const txt = (v) => (v != null && isText(v) ? toStr(v).toLowerCase() : null);
/** Real data as plain array. */
export const A = (v) => Array.from(F(v));
/** Column-major matrix Value → rows. */
export function rowsOf(v) {
  const t = toTensor(v); const m = t.dims[0], n = t.dims.length > 1 ? prod(t.dims.slice(1)) : 1;
  const r = []; for (let i = 0; i < m; i++) { const x = new Array(n); for (let j = 0; j < n; j++) x[j] = t.re[i + j * m]; r.push(x); }
  return r;
}
/** Rows → double matrix Value. */
export function mat(rows, m, n) {
  m = m ?? rows.length; n = n ?? (m ? rows[0].length : 0);
  const a = new Float64Array(m * n);
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) a[i + j * m] = rows[i][j];
  return tensor('double', [m, n], a);
}
export const colV = (a) => tensor('double', [a.length, 1], Float64Array.from(a));
export const rowV = (a) => tensor('double', [1, a.length], Float64Array.from(a));
/** Vector shaped like the input vector v (row stays row, otherwise column). */
export function likeVec(v, a) {
  const d = v && v.dims ? v.dims : [1, 1];
  return d.length === 2 && d[0] === 1 && d[1] !== 1 ? rowV(a) : colV(a);
}
