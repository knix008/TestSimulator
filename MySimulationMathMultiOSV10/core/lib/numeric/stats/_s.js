// Shared helpers of the statistics submodule: broadcasting, working along a
// dimension, ranks, grouping variables and small numeric routines.
import { tensor, broadcastDims, prod, isText, toStr, isCell, isString, isTensor, isChar, cell, str, isObject } from '../../../value.js';
import { E, F, isEmptyV } from '../_util.js';

/** Element-wise evaluation with implicit expansion. vals: Values or JS numbers. Returns {dims, out: Float64Array[]} */
export function bcast(vals, nout, f, targetDims = null) {
  const ts = vals.map((v) => (typeof v === 'number' ? { dims: [1, 1], re: Float64Array.of(v) } : { dims: v.dims || [1, 1], re: F(v) }));
  let dims = targetDims ? targetDims.slice() : [1, 1];
  for (const t of ts) {
    if (prod(t.dims) === 1) continue;
    try { dims = broadcastDims(dims, t.dims); } catch { throw E('stats:sizeMismatch', 'Non-scalar arguments must have compatible sizes.'); }
  }
  if (targetDims && prod(dims) !== prod(targetDims)) throw E('stats:sizeMismatch', 'Size information is inconsistent with the parameter sizes.');
  const n = prod(dims);
  const outs = Array.from({ length: nout }, () => new Float64Array(n));
  const k = ts.length;
  const same = ts.map((t) => prod(t.dims) === n && t.dims.length === dims.length && t.dims.every((d, i) => d === dims[i]));
  const scal = ts.map((t) => prod(t.dims) === 1);
  const xs = new Array(k);
  const simple = same.every((s, i) => s || scal[i]);
  const strides = ts.map((t) => { const s = []; let m = 1; for (let i = 0; i < dims.length; i++) { const d = i < t.dims.length ? t.dims[i] : 1; s.push(d === 1 ? 0 : m); m *= d; } return s; });
  const sub = new Array(dims.length).fill(0);
  for (let i = 0; i < n; i++) {
    if (simple) { for (let j = 0; j < k; j++) xs[j] = scal[j] ? ts[j].re[0] : ts[j].re[i]; }
    else {
      for (let j = 0; j < k; j++) { let idx = 0; for (let d = 0; d < dims.length; d++) idx += sub[d] * strides[j][d]; xs[j] = ts[j].re[idx]; }
      for (let d = 0; d < dims.length; d++) { if (++sub[d] < dims[d]) break; sub[d] = 0; }
    }
    const r = f(...xs);
    if (nout === 1) outs[0][i] = r; else for (let o = 0; o < nout; o++) outs[o][i] = r[o];
  }
  return { dims, outs };
}
/** One-output element-wise function returning a Value. */
export function ew(vals, f, targetDims) {
  const { dims, outs } = bcast(vals, 1, f, targetDims);
  return tensor('double', dims, outs[0]);
}
export function ewN(vals, nout, f) {
  const { dims, outs } = bcast(vals, nout, f);
  return outs.map((o) => tensor('double', dims, o));
}

/** First non-singleton dimension (0-based). */
export function defDim(dims) { const k = dims.findIndex((d) => d !== 1); return k < 0 ? 0 : k; }
/** Dimension argument (1-based Value) → 0-based, or default. */
export function dimArg(v, dims) {
  if (v == null || isEmptyV(v)) return defDim(dims);
  const d = F(v)[0];
  if (!Number.isInteger(d) || d < 1) throw E('stats:badDim', 'Dimension argument must be a positive integer scalar.');
  return d - 1;
}
/**
 * Applies f(vec: Float64Array) → number[] (length outLen) along dimension dim
 * (0-based) of a tensor. Returns a double tensor with dims[dim] = outLen.
 */
export function alongDim(t, dim, f, outLen = 1) {
  const dims = t.dims.slice(); while (dims.length <= dim) dims.push(1);
  const a = F(t);
  let stride = 1; for (let i = 0; i < dim; i++) stride *= dims[i];
  const len = dims[dim]; const outer = prod(dims.slice(dim + 1));
  const od = dims.slice(); od[dim] = outLen;
  const out = new Float64Array(prod(od));
  const v = new Float64Array(len);
  for (let o = 0; o < outer; o++) for (let i = 0; i < stride; i++) {
    for (let k = 0; k < len; k++) v[k] = a[i + stride * (k + len * o)];
    const r = f(v);
    for (let k = 0; k < outLen; k++) out[i + stride * (k + outLen * o)] = r[k];
  }
  return tensor('double', od, out);
}

// ------------------------------------------------------------ basic statistics
export const sumA = (a) => { let s = 0; for (const x of a) s += x; return s; };
export const meanA = (a) => (a.length ? sumA(a) / a.length : NaN);
export function varA(a, w = 0) { const n = a.length; if (!n) return NaN; if (n === 1) return 0; const m = meanA(a); let s = 0; for (const x of a) s += (x - m) ** 2; return s / (w ? n : n - 1); }
export const stdA = (a, w = 0) => Math.sqrt(varA(a, w));
export function sorted(a) { return Float64Array.from(a).sort(); }
export function medianA(a) { const s = sorted(a); const n = s.length; if (!n) return NaN; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
export const noNaN = (a) => Float64Array.from(Array.from(a).filter((x) => !Number.isNaN(x)));
/** Ranks with ties averaged (1-based). Returns {r, tieadj} where tieadj = sum(t^3 - t)/... pieces. */
export function tiedRank(a) {
  const n = a.length; const idx = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[i] - a[j]);
  const r = new Float64Array(n); let tieSum = 0; const ties = [];
  for (let i = 0; i < n;) {
    let j = i; while (j + 1 < n && a[idx[j + 1]] === a[idx[i]]) j++;
    const rk = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k]] = rk;
    const t = j - i + 1; if (t > 1) { tieSum += t * t * t - t; ties.push(t); }
    i = j + 1;
  }
  return { r, tieSum, ties };
}
/** Matrix (rows array) of a Value; vectors become a column when asCol. */
export function rowsOfV(v) {
  const t = F(v); const d = v.dims || [1, 1]; const m = d[0], n = d[1];
  const r = []; for (let i = 0; i < m; i++) { const x = new Array(n); for (let j = 0; j < n; j++) x[j] = t[i + j * m]; r.push(x); }
  return r;
}
export function colsOf(v) {
  const t = F(v); const d = v.dims || [1, 1]; const m = d[0], n = d[1];
  const c = []; for (let j = 0; j < n; j++) c.push(t.slice(j * m, (j + 1) * m));
  return c;
}
/** Vector data, columns of matrix if requested. */
export function vecOf(v) { return Float64Array.from(F(v)); }

// ------------------------------------------------------------ grouping variables
/** Group labels → {idx: Int32Array (0-based, -1 missing), names: string[]} (order of first appearance for text, sorted for numbers). */
export function groups(v) {
  let keys;
  if (isObject(v) && v.cls === 'categorical' && v.props) {
    // categorical: try codes/categories fields used by base
    const codes = v.codes || (v.props.codes && F(v.props.codes));
    const cats = v.categories || null;
    if (codes && cats) {
      const idx = Int32Array.from(Array.from(codes).map((c) => (c > 0 ? c - 1 : -1)));
      return { idx, names: cats.slice() };
    }
  }
  if (isCell(v) || isString(v) || (isChar(v) && v.dims[0] > 1)) {
    keys = isChar(v) ? toStr(v).split('\n').map((s) => s.trimEnd()) : isCell(v) ? v.data.map((x) => (isText(x) ? toStr(x) : String(F(x)[0]))) : v.data.map((s) => (s == null ? null : s));
    const names = []; const map = new Map(); const sortedNames = [...new Set(keys.filter((k) => k != null && k !== ''))].sort();
    sortedNames.forEach((k) => { map.set(k, names.length); names.push(k); });
    return { idx: Int32Array.from(keys.map((k) => (k == null || k === '' ? -1 : map.get(k)))), names };
  }
  if (isChar(v)) { const s = toStr(v); keys = [...s]; const names = [...new Set(keys)].sort(); return { idx: Int32Array.from(keys.map((k) => names.indexOf(k))), names }; }
  const a = F(v);
  const u = [...new Set(Array.from(a).filter((x) => !Number.isNaN(x)))].sort((x, y) => x - y);
  const map = new Map(u.map((x, i) => [x, i]));
  return { idx: Int32Array.from(Array.from(a).map((x) => (Number.isNaN(x) ? -1 : map.get(x)))), names: u.map((x) => String(x)), values: u };
}
export const cellStrCol = (list) => cell([list.length, 1], list.map((s) => str(s)));

// ------------------------------------------------------------ small optimizer and root finder
/** Nelder–Mead minimizer for f(x: number[]) → number. */
export function nelderMead(f, x0, { tol = 1e-12, maxIter = 4000 } = {}) {
  const n = x0.length; let pts = [x0.slice()];
  for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] = p[i] !== 0 ? p[i] * 1.05 : 0.00025; pts.push(p); }
  let vals = pts.map((p) => { const v = f(p); return Number.isFinite(v) ? v : Infinity; });
  for (let it = 0; it < maxIter * n; it++) {
    const ord = vals.map((_, i) => i).sort((a, b) => vals[a] - vals[b]);
    pts = ord.map((i) => pts[i]); vals = ord.map((i) => vals[i]);
    const spread = Math.abs(vals[n] - vals[0]); let size = 0;
    for (let i = 1; i <= n; i++) for (let j = 0; j < n; j++) size = Math.max(size, Math.abs(pts[i][j] - pts[0][j]));
    if (spread <= tol * (Math.abs(vals[0]) + 1e-20) && size <= 1e-10 * (1 + Math.max(...pts[0].map(Math.abs)))) break;
    const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i][j] / n;
    const at = (t) => c.map((cj, j) => cj + t * (pts[n][j] - cj));
    const xr = at(-1); const fr = f(xr);
    if (fr < vals[0]) { const xe = at(-2); const fe = f(xe); if (fe < fr) { pts[n] = xe; vals[n] = fe; } else { pts[n] = xr; vals[n] = fr; } }
    else if (fr < vals[n - 1]) { pts[n] = xr; vals[n] = fr; }
    else {
      const xc = fr < vals[n] ? at(-0.5) : at(0.5); const fc = f(xc);
      if (fc < Math.min(fr, vals[n])) { pts[n] = xc; vals[n] = Number.isFinite(fc) ? fc : Infinity; }
      else { for (let i = 1; i <= n; i++) { pts[i] = pts[i].map((x, j) => pts[0][j] + 0.5 * (x - pts[0][j])); const v = f(pts[i]); vals[i] = Number.isFinite(v) ? v : Infinity; } }
    }
  }
  let b = 0; for (let i = 1; i <= n; i++) if (vals[i] < vals[b]) b = i;
  return { x: pts[b], f: vals[b] };
}
/** Root of a scalar function between lo and hi (bracket expanded when needed). */
export function brent(f, lo, hi, tol = 1e-14) {
  let a = lo, b = hi, fa = f(a), fb = f(b);
  for (let k = 0; k < 100 && fa * fb > 0; k++) { if (Math.abs(fa) < Math.abs(fb)) { a -= (b - a); fa = f(a); } else { b += (b - a); fb = f(b); } }
  if (fa * fb > 0) return NaN;
  let c = a, fc = fa, d = b - a, e = d;
  for (let it = 0; it < 300; it++) {
    if (fb * fc > 0) { c = a; fc = fa; d = e = b - a; }
    if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
    const t = 2 * 2.2e-16 * Math.abs(b) + tol; const m = 0.5 * (c - b);
    if (Math.abs(m) <= t || fb === 0) return b;
    if (Math.abs(e) >= t && Math.abs(fa) > Math.abs(fb)) {
      let p, q; const s = fb / fa;
      if (a === c) { p = 2 * m * s; q = 1 - s; } else { const qq = fa / fc, r = fb / fc; p = s * (2 * m * qq * (qq - r) - (b - a) * (r - 1)); q = (qq - 1) * (r - 1) * (s - 1); }
      if (p > 0) q = -q; else p = -p;
      if (2 * p < Math.min(3 * m * q - Math.abs(t * q), Math.abs(e * q))) { e = d; d = p / q; } else { d = m; e = m; }
    } else { d = m; e = m; }
    a = b; fa = fb; b += Math.abs(d) > t ? d : (m > 0 ? t : -t); fb = f(b);
  }
  return b;
}
/** Inverse of a symmetric positive (semi)definite matrix via Gauss-Jordan; null when singular. */
export function invM(A) {
  const n = A.length; const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let k = 0; k < n; k++) {
    let p = k; for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    if (!(Math.abs(M[p][k]) > 1e-300)) return null;
    [M[p], M[k]] = [M[k], M[p]]; const d = M[k][k];
    for (let j = 0; j < 2 * n; j++) M[k][j] /= d;
    for (let i = 0; i < n; i++) if (i !== k) { const f = M[i][k]; if (f) for (let j = 0; j < 2 * n; j++) M[i][j] -= f * M[k][j]; }
  }
  return M.map((r) => r.slice(n));
}
export function trigamma(x) {
  let r = 0; while (x < 6) { r += 1 / (x * x); x += 1; }
  const f = 1 / (x * x);
  return r + 1 / x + f / 2 + (f / x) * (1 / 6 - f * (1 / 30 - f * (1 / 42 - f / 30)));
}
export { isTensor };
