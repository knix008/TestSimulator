// Shared helpers of the linear algebra area: argument conversion, result
// construction, options, warnings. Pure ESM, no platform APIs.
//
// Matrix kernels work on column-major Float64Array data: element (i, j) of an
// m-by-n matrix is a[i + j*m]. Complex data is a pair (re, im) of equal-length
// arrays; im === null means real.
import {
  MError, tensor, isTensor, isSparse, isNumeric, isLogical, isChar, isText, toStr, toTensor,
  simplifyComplex, isString, num, prod, isCell, isStruct, toNum,
} from '../../value.js';

export const EPS = 2.220446049250313e-16;

/** Throws MError('linalg:<fn>:<what>', msg). */
export function fail(id, msg) { throw new MError(id.startsWith('linalg:') ? id : `linalg:${id}`, msg); }

/** Issues a warning when the context supports it. */
export function warn(ctx, id, msg) { if (ctx && typeof ctx.warning === 'function') ctx.warning(id, msg); }

/** Formats RCOND like the reference warning ("1.234567e-17"). */
export function fmtRcond(r) {
  if (!Number.isFinite(r)) return String(r);
  if (r === 0) return '0.000000e+00';
  let s = r.toExponential(6);
  s = s.replace(/e([+-])(\d)$/, 'e$10$2');
  return s;
}
export function warnSingular(ctx, rc) {
  if (rc === 0 || Number.isNaN(rc)) warn(ctx, 'linalg:singularMatrix', 'Matrix is singular to working precision.');
  else warn(ctx, 'linalg:nearlySingularMatrix', `Matrix is close to singular or badly scaled. Results may be inaccurate. RCOND = ${fmtRcond(rc)}.`);
}

/** True for a numeric/logical/char dense tensor or a sparse matrix. */
export const isNumLike = (v) => v != null && ((isTensor(v) && (isNumeric(v) || isLogical(v) || isChar(v))) || isSparse(v));

/**
 * Converts an argument to a dense double tensor (sparse → dense, ints/logical/char → double).
 * Returns the tensor itself when it is already double. Throws for non-numeric input.
 */
export function dbl(v, fn = 'linalg', what = 'Input') {
  if (v == null) fail(`${fn}:missingInput`, `${what} is missing.`);
  if (isSparse(v)) { const t = toTensor(v); return t.cls === 'double' ? t : { ...t, cls: 'double' }; }
  if (!isTensor(v) || !(isNumeric(v) || isLogical(v) || isChar(v))) {
    fail(`${fn}:invalidInput`, `${what} must be numeric (got ${v.cls}).`);
  }
  if (v.cls === 'double') return v;
  return { cls: 'double', dims: v.dims.slice(), re: Float64Array.from(v.re), im: v.im ? Float64Array.from(v.im) : null };
}

/** Like dbl() but requires a 2-D matrix. Returns {m, n, re, im, cls(original)}. */
export function mat(v, fn = 'linalg', what = 'Input') {
  const t = dbl(v, fn, what);
  if (t.dims.length > 2) fail(`${fn}:inputMustBe2D`, `${what} must be a 2-D matrix.`);
  return { m: t.dims[0], n: t.dims[1], re: t.re, im: t.im, cls: v.cls === 'single' ? 'single' : 'double' };
}
/** mat() plus a square check. */
export function sqmat(v, fn = 'linalg', what = 'Input') {
  const a = mat(v, fn, what);
  if (a.m !== a.n) fail(`${fn}:notSquare`, `${what} must be a square matrix.`);
  return a;
}

/** Builds a double tensor (complex dropped when all-zero). cls 'single' rounds. */
export function out(dims, re, im = null, cls = 'double') {
  if (cls === 'single') {
    re = Float64Array.from(re, Math.fround);
    if (im) im = Float64Array.from(im, Math.fround);
  }
  const t = tensor(cls === 'single' ? 'single' : 'double', dims, re, im);
  return t.im ? simplifyComplex(t) : t;
}
/** m-by-n result from data. */
export const outMat = (m, n, re, im = null, cls = 'double') => out([m, n], re, im, cls);
/** Real scalar. */
export const scalar = (x, cls = 'double') => out([1, 1], [x], null, cls);
/** Complex scalar (real when im === 0). */
export const cscalar = (re, im, cls = 'double') => out([1, 1], [re], im ? [im] : null, cls);
/** Logical scalar. */
export const lscalar = (b) => tensor('logical', [1, 1], [b ? 1 : 0]);

/** Result class: 'single' when any numeric input is single. */
export function resultCls(...vals) {
  for (const v of vals) if (v && v.cls === 'single') return 'single';
  return 'double';
}

/** Lower-case option text, or null when v is not text. */
export function optText(v) {
  if (v == null) return null;
  if (isChar(v) || (isString(v) && v.data.length === 1)) return toStr(v).toLowerCase();
  return null;
}
export const isOpt = (v) => optText(v) !== null;

/** JS number of a real scalar argument (any numeric class). */
export function scal(v, fn = 'linalg', what = 'Argument') {
  if (v == null) fail(`${fn}:missingInput`, `${what} is missing.`);
  try { return toNum(v, what); } catch (e) { fail(`${fn}:notScalar`, `${what} must be a numeric scalar.`); }
}
/** Non-negative integer argument. */
export function intArg(v, fn = 'linalg', what = 'Argument') {
  const x = scal(v, fn, what);
  if (!Number.isInteger(x) || x < 0) fail(`${fn}:notNonNegInt`, `${what} must be a nonnegative integer.`);
  return x;
}
/** Real double vector as Float64Array (copy when not double). */
export function vec(v, fn = 'linalg', what = 'Input') {
  const t = dbl(v, fn, what);
  return t.re;
}

/** Reads name/value pairs (keys lower-cased) from args[start..]. Values stay Values. */
export function nameValues(args, start, fn = 'linalg') {
  const o = Object.create(null);
  for (let i = start; i < args.length; i += 2) {
    const k = optText(args[i]);
    if (k == null) fail(`${fn}:badOption`, 'Options must be name-value pairs.');
    if (i + 1 >= args.length) fail(`${fn}:badOption`, `Option '${k}' needs a value.`);
    o[k] = args[i + 1];
  }
  return o;
}

/** Struct field (case-insensitive) of a scalar struct or undefined. */
export function field(s, name) {
  if (!isStruct(s) || s.data.length < 1) return undefined;
  const k = s.fields.find((f) => f.toLowerCase() === name.toLowerCase());
  return k ? s.data[0][k] : undefined;
}

/** Help entry. */
export const H = (en, ko, syntax = []) => ({ en, ko, syntax });

/** First non-singleton dimension (0-based), 0 for scalars/empty 0x0 per reference rules. */
export function firstNonSingleton(dims) {
  for (let i = 0; i < dims.length; i++) if (dims[i] !== 1) return i;
  return 0;
}

// ---------------------------------------------------------------- small dense helpers

/** Copy of a column-major array. */
export const copy = (a) => (a ? Float64Array.from(a) : null);
/** Transpose of an m-by-n real array. */
export function transpose(m, n, a) {
  const t = new Float64Array(m * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) t[j + i * n] = a[i + j * m];
  return t;
}
/** Identity n-by-n. */
export function eye(n) { const a = new Float64Array(n * n); for (let i = 0; i < n; i++) a[i * (n + 1)] = 1; return a; }

/** C = A*B for real column-major A (m×k), B (k×n). */
export function matmul(m, k, n, a, b) {
  const c = new Float64Array(m * n);
  for (let j = 0; j < n; j++) {
    const cj = j * m;
    for (let p = 0; p < k; p++) {
      const s = b[p + j * k];
      if (s === 0) continue;
      const ap = p * m;
      for (let i = 0; i < m; i++) c[cj + i] += a[ap + i] * s;
    }
  }
  return c;
}
/** Complex C = A*B; any of the im parts may be null. Returns {re, im|null}. */
export function cmatmul(m, k, n, ar, ai, br, bi) {
  if (!ai && !bi) return { re: matmul(m, k, n, ar, br), im: null };
  const cr = new Float64Array(m * n), ci = new Float64Array(m * n);
  for (let j = 0; j < n; j++) {
    const cj = j * m;
    for (let p = 0; p < k; p++) {
      const sr = br[p + j * k], si = bi ? bi[p + j * k] : 0;
      if (sr === 0 && si === 0) continue;
      const ap = p * m;
      for (let i = 0; i < m; i++) {
        const xr = ar[ap + i], xi = ai ? ai[ap + i] : 0;
        cr[cj + i] += xr * sr - xi * si;
        ci[cj + i] += xr * si + xi * sr;
      }
    }
  }
  return { re: cr, im: ci };
}

/** 2-norm of a vector slice without overflow. */
export function hypotVec(a, off, len, stride = 1) {
  let scale = 0, ssq = 1;
  for (let k = 0; k < len; k++) {
    const x = Math.abs(a[off + k * stride]);
    if (x !== 0) {
      if (scale < x) { ssq = 1 + ssq * (scale / x) * (scale / x); scale = x; } else ssq += (x / scale) * (x / scale);
    }
  }
  return scale * Math.sqrt(ssq);
}

/** Complex division (ar+i ai)/(br+i bi) → [re, im] (Smith's algorithm). */
export function cdiv(ar, ai, br, bi) {
  if (Math.abs(br) >= Math.abs(bi)) {
    if (br === 0 && bi === 0) return [ar / 0, ai === 0 ? (ar === 0 ? NaN : 0) : ai / 0];
    const r = bi / br, d = br + bi * r;
    return [(ar + ai * r) / d, (ai - ar * r) / d];
  }
  const r = br / bi, d = bi + br * r;
  return [(ar * r + ai) / d, (ai * r - ar) / d];
}
/** Principal complex square root → [re, im]. */
export function csqrt(re, im) {
  if (im === 0) return re >= 0 ? [Math.sqrt(re), 0] : [0, Math.sqrt(-re)];
  const r = Math.hypot(re, im);
  const t = Math.sqrt((r + Math.abs(re)) / 2);
  if (re >= 0) return [t, im / (2 * t)];
  return [Math.abs(im) / (2 * t), im >= 0 ? t : -t];
}

export { MError, tensor, isTensor, isSparse, isText, toStr, toTensor, num, prod, isCell, isStruct, isString, simplifyComplex };
