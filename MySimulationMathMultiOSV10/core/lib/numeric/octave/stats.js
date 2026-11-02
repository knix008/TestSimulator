// Octave-compatible statistics: correlation (corrcov, kendall, spearman),
// ranks and runs, statistics, forecasting metrics (rmse, mape), discrete and
// empirical distributions, rande/randp and sliding-window functions
// (movfun, movmad, movslice).
import { tensor, prod, num, toNum, isText, toStr, isFuncHandle, broadcastDims } from '../../../value.js';
import { E, F, H, isEmptyV, callFn, sizeArgs } from '../_util.js';
import * as K from '../_kernels.js';
import { urand } from '../random.js';
import { ew } from '../stats/_s.js';
import { T, defDim, dimOf, along, txt, colV, rowV, mat, rowsOf } from './_h.js';
import { lgammaSigned } from './math.js';

// ------------------------------------------------------------ correlation
function corrcov(args, nargout) {
  if (args.length !== 1) throw E('corrcov:nargin', 'corrcov: one input is required.');
  const t = T(args[0], 'corrcov'); const n = t.dims[0];
  if (t.dims.length !== 2 || t.dims[1] !== n) throw E('corrcov:notSquare', 'corrcov: SIGMA must be a square covariance matrix.');
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) { const a = t.re[i + j * n], b = t.re[j + i * n]; if (Math.abs(a - b) > 1e3 * 2.2e-16 * (Math.abs(a) + Math.abs(b) + 1e-300)) throw E('corrcov:notSymmetric', 'corrcov: SIGMA must be symmetric.'); }
  const s = Array.from({ length: n }, (_, i) => Math.sqrt(t.re[i + i * n]));
  const r = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) r[i + j * n] = i === j && s[i] > 0 ? 1 : t.re[i + j * n] / (s[i] * s[j]);
  const R = tensor('double', [n, n], r);
  return nargout >= 2 ? [R, colV(s)] : R;
}
/** Columns of x (row vectors become a column); y appended when given. */
function colsPair(args, fn) {
  const asCols = (v) => { const t = T(v, fn); const d = t.dims; if (d.length !== 2) throw E(`${fn}:badSize`, `${fn}: X must be a vector or a matrix.`); const isRow = d[0] === 1; const m = isRow ? d[1] : d[0], n = isRow ? 1 : d[1]; return Array.from({ length: n }, (_, j) => Array.from({ length: m }, (_, i) => t.re[i + j * m])); };
  const X = asCols(args[0]);
  if (args.length < 2) return { cols: X, c: X.length, pair: false };
  const Y = asCols(args[1]);
  if (Y.length && X.length && Y[0].length !== X[0].length) throw E(`${fn}:sizeMismatch`, `${fn}: X and Y must have the same number of observations.`);
  return { cols: [...X, ...Y], c: X.length, pair: true };
}
/** Fractional ranks (ties averaged) of a vector. */
function frRanks(a) {
  const n = a.length; const idx = Array.from({ length: n }, (_, i) => i).sort((i, j) => (Number.isNaN(a[i]) ? 1 : 0) - (Number.isNaN(a[j]) ? 1 : 0) || a[i] - a[j] || i - j);
  const r = new Array(n);
  for (let i = 0; i < n;) { let j = i; while (j + 1 < n && a[idx[j + 1]] === a[idx[i]]) j++; for (let k = i; k <= j; k++) r[idx[k]] = (i + j) / 2 + 1; i = j + 1; }
  return r;
}
const pearson = (x, y) => {
  const n = x.length; const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxy / Math.sqrt(sxx * syy);
};
function corrMatrix(cols, c, pair, f) {
  const nc = cols.length;
  if (!pair) { const R = K.zerosM(nc, nc); for (let i = 0; i < nc; i++) for (let j = i; j < nc; j++) { R[i][j] = R[j][i] = f(cols[i], cols[j]); } return nc === 1 ? num(R[0][0]) : mat(R, nc, nc); }
  const p = nc - c; const R = K.zerosM(c, p);
  for (let i = 0; i < c; i++) for (let j = 0; j < p; j++) R[i][j] = f(cols[i], cols[c + j]);
  return c === 1 && p === 1 ? num(R[0][0]) : mat(R, c, p);
}
function kendall(args) {
  if (args.length < 1 || args.length > 2) throw E('kendall:nargin', 'kendall: expected kendall(x) or kendall(x, y).');
  const { cols, c, pair } = colsPair(args, 'kendall');
  const ranked = cols.map(frRanks);
  const tau = (a, b) => {
    const n = a.length; let s = 0, sa = 0, sb = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const u = Math.sign(a[i] - a[j]), v = Math.sign(b[i] - b[j]); s += u * v; sa += u * u; sb += v * v; }
    return s / Math.sqrt(sa * sb);
  };
  return corrMatrix(ranked, c, pair, tau);
}
function spearman(args) {
  if (args.length < 1 || args.length > 2) throw E('spearman:nargin', 'spearman: expected spearman(x) or spearman(x, y).');
  const { cols, c, pair } = colsPair(args, 'spearman');
  return corrMatrix(cols.map(frRanks), c, pair, pearson);
}

// ------------------------------------------------------------ ranks and runs
const RTYPES = { fractional: 0, competition: 1, modified: 2, dense: 3, ordinal: 4 };
function ranks(args) {
  if (args.length < 1 || args.length > 3) throw E('ranks:nargin', 'ranks: expected ranks(x, dim, rtype).');
  const t = T(args[0], 'ranks');
  const dim = dimOf(args[1], t.dims, 'ranks');
  let rt = 0;
  if (args.length > 2 && !isEmptyV(args[2])) {
    if (isText(args[2])) { const s = toStr(args[2]).toLowerCase(); if (!(s in RTYPES)) throw E('ranks:badType', 'ranks: unknown RTYPE.'); rt = RTYPES[s]; }
    else { rt = toNum(args[2]); if (![0, 1, 2, 3, 4].includes(rt)) throw E('ranks:badType', 'ranks: RTYPE must be 0, 1, 2, 3 or 4.'); }
  }
  if (prod(t.dims) === 0) return tensor('double', t.dims.slice(), new Float64Array(0));
  const len = t.dims[dim] || 1;
  return along(t, dim, len, (a) => {
    const n = a.length; const idx = Array.from({ length: n }, (_, i) => i).sort((i, j) => (Number.isNaN(a[i]) ? 1 : 0) - (Number.isNaN(a[j]) ? 1 : 0) || a[i] - a[j] || i - j);
    const r = new Array(n); let dense = 0;
    for (let i = 0; i < n;) {
      let j = i; while (j + 1 < n && a[idx[j + 1]] === a[idx[i]]) j++;
      dense++;
      for (let k = i; k <= j; k++) {
        r[idx[k]] = rt === 0 ? (i + j) / 2 + 1 : rt === 1 ? i + 1 : rt === 2 ? j + 1 : rt === 3 ? dense : k + 1;
      }
      i = j + 1;
    }
    return { re: r };
  });
}
function run_count(args) {
  if (args.length < 2 || args.length > 3) throw E('run_count:nargin', 'run_count: expected run_count(x, n, dim).');
  const t = T(args[0], 'run_count');
  const n = toNum(args[1]);
  if (!(n >= 1) || n !== Math.floor(n)) throw E('run_count:badN', 'run_count: N must be a positive integer.');
  const dim = dimOf(args[2], t.dims, 'run_count');
  return along(t, dim, n, (a) => {
    const L = a.length; const out = new Array(n).fill(0);
    // breaks where the series decreases; Inf before and -Inf after
    const ext = [Infinity, ...a, -Infinity];
    const ind = []; for (let k = 0; k < ext.length - 1; k++) if (ext[k + 1] - ext[k] < 0) ind.push(k);
    for (let k = 1; k < ind.length; k++) { const len = Math.min(ind[k] - ind[k - 1], n); out[len - 1]++; }
    void L;
    return { re: out };
  });
}
function runlength(args, nargout) {
  if (args.length !== 1) throw E('runlength:nargin', 'runlength: one input is required.');
  const t = T(args[0], 'runlength');
  if (t.dims.length !== 2 || (t.dims[0] !== 1 && t.dims[1] !== 1)) throw E('runlength:notVector', 'runlength: X must be a vector.');
  const a = t.re; const count = [], value = [];
  for (let i = 0; i < a.length;) { let j = i; while (j + 1 < a.length && a[j + 1] === a[i]) j++; count.push(j - i + 1); value.push(a[i]); i = j + 1; }
  return nargout >= 2 ? [rowV(count), rowV(value)] : rowV(count);
}

// ------------------------------------------------------------ descriptive
/** Quantile by Octave's default method 5 (piecewise linear, p(k) = (k - 0.5)/n) of sorted data. */
function q5(s, p) {
  const n = s.length; const pos = n * p + 0.5;
  if (pos < 1) return s[0];
  if (pos >= n) return s[n - 1];
  const lo = Math.floor(pos); const f = pos - lo;
  return s[lo - 1] + f * (s[lo] - s[lo - 1]);
}
function statistics(args) {
  if (args.length < 1 || args.length > 2) throw E('statistics:nargin', 'statistics: expected statistics(x, dim).');
  const t = T(args[0], 'statistics');
  if (t.im && t.im.some((v) => v !== 0)) throw E('statistics:complex', 'statistics: X must be real.');
  const dim = dimOf(args[1], t.dims, 'statistics');
  if ((t.dims[dim] || 1) < 2) throw E('statistics:tooSmall', 'statistics: dimension of X is too small (<2).');
  return along(t, dim, 9, (a) => {
    const n = a.length; const s = Float64Array.from(a).sort();
    const mean = a.reduce((x, y) => x + y, 0) / n;
    let m2 = 0, m3 = 0, m4 = 0; for (const v of a) { const d = v - mean; m2 += d * d; m3 += d * d * d; m4 += d * d * d * d; }
    const sd = Math.sqrt(m2 / (n - 1));
    m2 /= n; m3 /= n; m4 /= n;
    const hasNaN = a.some(Number.isNaN);
    const qs = hasNaN ? [NaN, NaN, NaN, NaN, NaN] : [s[0], q5(s, 0.25), q5(s, 0.5), q5(s, 0.75), s[n - 1]];
    return { re: [...qs, mean, sd, m2 > 0 ? m3 / m2 ** 1.5 : NaN, m2 > 0 ? m4 / (m2 * m2) : NaN] };
  });
}

// ------------------------------------------------------------ forecasting metrics
/** Reduces e (tensor) over the dims set (0-based) with optional weights (tensor same size). f(vals, ws) → number. */
function reduceOver(e, w, red, f) {
  const dims = e.dims.slice(); const nd = Math.max(dims.length, ...red.map((d) => d + 1)); while (dims.length < nd) dims.push(1);
  const od = dims.map((d, i) => (red.includes(i) ? 1 : d));
  const N = prod(od); const vals = Array.from({ length: N }, () => []), ws = Array.from({ length: N }, () => []);
  const sub = new Array(nd).fill(0); const total = prod(dims);
  for (let i = 0; i < total; i++) {
    let o = 0, m = 1; for (let d = 0; d < nd; d++) { if (!red.includes(d)) o += sub[d] * m; m *= od[d]; }
    vals[o].push(e.re[i]); ws[o].push(w ? w[i] : 1);
    for (let d = 0; d < nd; d++) { if (++sub[d] < dims[d]) break; sub[d] = 0; }
  }
  const out = new Float64Array(N); for (let k = 0; k < N; k++) out[k] = f(vals[k], ws[k]);
  while (od.length > 2 && od[od.length - 1] === 1) od.pop();
  return tensor('double', od, out);
}
function metric(args, fn, kind) {
  if (args.length < 2) throw E(`${fn}:nargin`, `${fn}: expected ${fn}(F, A, ...).`);
  const Ft = T(args[0], fn, 'F'), At = T(args[1], fn, 'A');
  let dims;
  try { dims = broadcastDims(Ft.dims, At.dims); } catch { throw E(`${fn}:sizeMismatch`, `${fn}: F and A must have compatible sizes.`); }
  let all = false, red = null, omit = false, W = null;
  for (let i = 2; i < args.length; i++) {
    const a = args[i]; const s = txt(a);
    if (s === 'all') all = true;
    else if (s === 'omitnan' || s === 'omitmissing') omit = true;
    else if (s === 'includenan' || s === 'includemissing') omit = false;
    else if (s === 'weights') { W = T(args[++i], fn, 'W'); }
    else if (s === null) red = Array.from(F(a)).map((d) => { if (!(d >= 1) || d !== Math.floor(d)) throw E(`${fn}:badDim`, `${fn}: DIM must be a positive integer.`); return d - 1; });
    else throw E(`${fn}:badOption`, `${fn}: unknown option '${toStr(a)}'.`);
  }
  // element errors with implicit expansion
  const eT = ew([Ft, At], kind === 'rmse' ? (f, a) => f - a : (f, a) => Math.abs((a - f) / a), dims);
  if (all) red = eT.dims.map((_, i) => i);
  if (!red) red = [defDim(eT.dims)];
  let w = null;
  if (W) {
    const n = prod(eT.dims);
    if (W.re.length === n) w = W.re;
    else if (red.length === 1 && W.re.length === (eT.dims[red[0]] || 1)) {
      const d = red[0]; let stride = 1; for (let i = 0; i < d; i++) stride *= eT.dims[i];
      w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = W.re[Math.floor(i / stride) % eT.dims[d]];
    } else throw E(`${fn}:badWeights`, `${fn}: the weights must match the size of the data or the operating dimension.`);
    if (Array.from(W.re).some((v) => v < 0)) throw E(`${fn}:badWeights`, `${fn}: the weights must be non-negative.`);
  }
  return reduceOver(eT, w, red, (v, ws) => {
    let s = 0, sw = 0;
    for (let i = 0; i < v.length; i++) {
      if (omit && (Number.isNaN(v[i]) || Number.isNaN(ws[i]))) continue;
      s += ws[i] * (kind === 'rmse' ? v[i] * v[i] : v[i]); sw += ws[i];
    }
    const m = s / sw;
    return kind === 'rmse' ? Math.sqrt(m) : 100 * m;
  });
}
const rmse = (args) => metric(args, 'rmse', 'rmse');
const mape = (args) => metric(args, 'mape', 'mape');

// ------------------------------------------------------------ discrete / empirical distributions
function discreteVP(vV, pV, fn) {
  const v = Array.from(F(vV)), p = Array.from(F(pV));
  if (v.length !== p.length) throw E(`${fn}:sizeMismatch`, `${fn}: V and P must be vectors of the same length.`);
  if (!v.length) throw E(`${fn}:empty`, `${fn}: V and P must not be empty.`);
  if (p.some((q) => !(q >= 0))) throw E(`${fn}:badP`, `${fn}: P must be non-negative.`);
  const s = p.reduce((a, b) => a + b, 0);
  if (!(s > 0)) throw E(`${fn}:badP`, `${fn}: P must not be all zero.`);
  return { v, p: p.map((q) => q / s) };
}
function discreteCdf(x, v, p) {
  const order = v.map((_, i) => i).sort((i, j) => v[i] - v[j]);
  const sv = order.map((i) => v[i]); const cp = []; let acc = 0; for (const i of order) { acc += p[i]; cp.push(acc); }
  return (xv) => {
    if (Number.isNaN(xv)) return NaN;
    let lo = 0, hi = sv.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sv[m] <= xv) lo = m + 1; else hi = m; }
    return lo === 0 ? 0 : Math.min(1, cp[lo - 1]);
  };
}
function discreteInv(v, p) {
  const order = v.map((_, i) => i).sort((i, j) => v[i] - v[j]);
  const sv = order.map((i) => v[i]); const cp = []; let acc = 0; for (const i of order) { acc += p[i]; cp.push(acc); }
  cp[cp.length - 1] = 1;
  return (q) => {
    if (!(q > 0 && q <= 1)) return NaN;
    if (q === 1) return sv[sv.length - 1];
    for (let k = 0; k < cp.length; k++) if (cp[k] >= q - 1e-15) return sv[k];
    return sv[sv.length - 1];
  };
}
function discretePdf(v, p) {
  return (xv) => { if (Number.isNaN(xv)) return NaN; let s = 0; for (let i = 0; i < v.length; i++) if (v[i] === xv) s += p[i]; return s; };
}
const mapX = (xV, fn, f) => { const t = T(xV, fn, 'X'); return tensor('double', t.dims.slice(), t.re.map(f)); };
function discrete_cdf(args) { if (args.length !== 3) throw E('discrete_cdf:nargin', 'discrete_cdf: expected discrete_cdf(x, v, p).'); const { v, p } = discreteVP(args[1], args[2], 'discrete_cdf'); return mapX(args[0], 'discrete_cdf', discreteCdf(null, v, p)); }
function discrete_inv(args) { if (args.length !== 3) throw E('discrete_inv:nargin', 'discrete_inv: expected discrete_inv(x, v, p).'); const { v, p } = discreteVP(args[1], args[2], 'discrete_inv'); return mapX(args[0], 'discrete_inv', discreteInv(v, p)); }
function discrete_pdf(args) { if (args.length !== 3) throw E('discrete_pdf:nargin', 'discrete_pdf: expected discrete_pdf(x, v, p).'); const { v, p } = discreteVP(args[1], args[2], 'discrete_pdf'); return mapX(args[0], 'discrete_pdf', discretePdf(v, p)); }
function drawDiscrete(ctx, v, p, dims) {
  const cp = []; let acc = 0; for (const q of p) { acc += q; cp.push(acc); }
  const n = prod(dims); const out = new Float64Array(n);
  for (let i = 0; i < n; i++) { const u = urand(ctx) * acc; let k = 0; while (k < cp.length - 1 && cp[k] <= u) k++; out[i] = v[k]; }
  return tensor('double', dims, out);
}
function discrete_rnd(args, nargout, ctx) {
  if (args.length < 2) throw E('discrete_rnd:nargin', 'discrete_rnd: expected discrete_rnd(v, p, ...).');
  const { v, p } = discreteVP(args[0], args[1], 'discrete_rnd');
  const dims = args.length > 2 ? sizeArgs(args.slice(2)).dims : [1, 1];
  return drawDiscrete(ctx, v, p, dims);
}
const empiricalVP = (d, fn) => { const v = Array.from(F(d)); if (!v.length) throw E(`${fn}:empty`, `${fn}: DATA must not be empty.`); return { v, p: v.map(() => 1 / v.length) }; };
function empirical_cdf(args) { if (args.length !== 2) throw E('empirical_cdf:nargin', 'empirical_cdf: expected empirical_cdf(x, data).'); const { v, p } = empiricalVP(args[1], 'empirical_cdf'); return mapX(args[0], 'empirical_cdf', discreteCdf(null, v, p)); }
function empirical_inv(args) { if (args.length !== 2) throw E('empirical_inv:nargin', 'empirical_inv: expected empirical_inv(x, data).'); const { v, p } = empiricalVP(args[1], 'empirical_inv'); return mapX(args[0], 'empirical_inv', discreteInv(v, p)); }
function empirical_pdf(args) { if (args.length !== 2) throw E('empirical_pdf:nargin', 'empirical_pdf: expected empirical_pdf(x, data).'); const { v, p } = empiricalVP(args[1], 'empirical_pdf'); return mapX(args[0], 'empirical_pdf', discretePdf(v, p)); }
function empirical_rnd(args, nargout, ctx) {
  if (args.length < 1) throw E('empirical_rnd:nargin', 'empirical_rnd: expected empirical_rnd(data, ...).');
  const { v, p } = empiricalVP(args[0], 'empirical_rnd');
  const dims = args.length > 1 ? sizeArgs(args.slice(1)).dims : [1, 1];
  return drawDiscrete(ctx, v, p, dims);
}

// ------------------------------------------------------------ rande / randp
function classOf(rest, fn) {
  let cls = 'double';
  for (const a of rest) {
    const s = txt(a);
    if (s === 'double' || s === 'single') cls = s;
    else throw E(`${fn}:badArg`, `${fn}: unknown option '${isText(a) ? toStr(a) : '?'}'.`);
  }
  return cls;
}
function rande(args, nargout, ctx) {
  const { dims, rest } = sizeArgs(args);
  const cls = classOf(rest, 'rande');
  const n = prod(dims); const out = new Float64Array(n);
  for (let i = 0; i < n; i++) { let u; do { u = urand(ctx); } while (u <= 0); out[i] = -Math.log(u); if (cls === 'single') out[i] = Math.fround(out[i]); }
  return tensor(cls, dims, out);
}
export function poissonDraw(ctx, lam) {
  if (Number.isNaN(lam) || lam < 0) return NaN;
  if (lam === 0) return 0;
  if (lam === Infinity) return Infinity;
  if (lam < 12) {
    const L = Math.exp(-lam); let k = 0, p = 1;
    do { k++; p *= urand(ctx); } while (p > L);
    return k - 1;
  }
  // PTRS: transformed rejection with squeeze (Hörmann 1993)
  const slam = Math.sqrt(lam), loglam = Math.log(lam);
  const b = 0.931 + 2.53 * slam, a = -0.059 + 0.02483 * b, invalpha = 1.1239 + 1.1328 / (b - 3.4), vr = 0.9277 - 3.6224 / (b - 2);
  for (;;) {
    const U = urand(ctx) - 0.5, V = urand(ctx); const us = 0.5 - Math.abs(U);
    const k = Math.floor((2 * a / us + b) * U + lam + 0.43);
    if (us >= 0.07 && V <= vr) return k;
    if (k < 0 || (us < 0.013 && V > us)) continue;
    if (Math.log(V) + Math.log(invalpha) - Math.log(a / (us * us) + b) <= -lam + k * loglam - lgammaSigned(k + 1)[0]) return k;
  }
}
function randp(args, nargout, ctx) {
  if (args.length < 1) throw E('randp:nargin', 'randp: L is required.');
  const L = T(args[0], 'randp', 'L');
  let dims;
  let rest = [];
  if (args.length > 1) { const s = sizeArgs(args.slice(1)); dims = s.dims; rest = s.rest; if (L.re.length !== 1 && prod(dims) !== L.re.length) throw E('randp:sizeMismatch', 'randp: L must be scalar or of the requested size.'); }
  else dims = L.dims.slice();
  const cls = classOf(rest, 'randp');
  const n = prod(dims); const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = poissonDraw(ctx, L.re.length === 1 ? L.re[0] : L.re[i]);
  return tensor(cls, dims, out);
}

// ------------------------------------------------------------ sliding windows
function wlenOf(v, fn) {
  const w = Array.from(F(v));
  if (w.length === 1) {
    const k = w[0];
    if (!(k >= 1) || k !== Math.floor(k)) throw E(`${fn}:badWlen`, `${fn}: WLEN must be a positive integer or a two-element vector.`);
    return k % 2 ? [(k - 1) / 2, (k - 1) / 2] : [k / 2, k / 2 - 1];
  }
  if (w.length === 2 && w.every((x) => x >= 0 && x === Math.floor(x))) return w;
  throw E(`${fn}:badWlen`, `${fn}: WLEN must be a positive integer or a two-element vector of non-negative integers.`);
}
function movOpts(args, start, fn, allowOutdim) {
  const o = { dim: null, endpoints: 'shrink', fill: NaN, nancond: 'includenan', outdim: null };
  for (let i = start; i < args.length; i++) {
    const a = args[i]; const s = txt(a);
    if (s === null) { if (i === start && !allowOutdim) { o.dim = toNum(a) - 1; continue; } throw E(`${fn}:badOption`, `${fn}: expected property/value pairs.`); }
    if (s === 'omitnan' || s === 'includenan') { o.nancond = s; continue; }
    if (i + 1 >= args.length) throw E(`${fn}:badOption`, `${fn}: property '${s}' needs a value.`);
    const v = args[++i];
    if (s === 'dim') o.dim = toNum(v) - 1;
    else if (s === 'endpoints') {
      const e = txt(v);
      if (e === null) { o.endpoints = 'fill'; o.fill = toNum(v); }
      else if (['shrink', 'discard', 'fill', 'periodic', 'same'].includes(e)) o.endpoints = e;
      else throw E(`${fn}:badEndpoints`, `${fn}: unknown Endpoints value '${e}'.`);
    } else if (s === 'nancond') { const e = txt(v); if (e !== 'omitnan' && e !== 'includenan') throw E(`${fn}:badNancond`, `${fn}: nancond must be "omitnan" or "includenan".`); o.nancond = e; }
    else if (s === 'outdim' && allowOutdim) o.outdim = Array.from(F(v)).map((d) => d - 1);
    else if (s === 'samplepoints') throw E(`${fn}:samplePoints`, `${fn}: SamplePoints are not supported; resample the data to a uniform grid first.`);
    else throw E(`${fn}:badOption`, `${fn}: unknown property '${s}'.`);
  }
  return o;
}
/** Moving-window evaluation along dim. f(window: Float64Array) → number[] (nout values). */
function movCore(t, wl, o, fn, f, noutHint = 1) {
  const dims = t.dims.slice();
  const dim = o.dim ?? defDim(dims); while (dims.length <= dim) dims.push(1);
  const N = dims[dim]; const [nb, na] = wl;
  const keep = o.endpoints === 'discard' ? Array.from({ length: Math.max(0, N - nb - na) }, (_, k) => k + nb) : Array.from({ length: N }, (_, k) => k);
  let stride = 1; for (let i = 0; i < dim; i++) stride *= dims[i];
  const outer = prod(dims.slice(dim + 1));
  const results = []; let nout = noutHint;
  for (let o2 = 0; o2 < outer; o2++) for (let i = 0; i < stride; i++) {
    const x = new Float64Array(N); for (let k = 0; k < N; k++) x[k] = t.re[i + stride * (k + N * o2)];
    const col = [];
    for (const c of keep) {
      const full = c - nb >= 0 && c + na <= N - 1;
      if (!full && o.endpoints === 'fill') { col.push(null); continue; }
      let w = [];
      for (let k = c - nb; k <= c + na; k++) {
        if (k >= 0 && k < N) w.push(x[k]);
        else if (o.endpoints === 'periodic') w.push(x[((k % N) + N) % N]);
        else if (o.endpoints === 'same') w.push(x[k < 0 ? 0 : N - 1]);
      }
      if (o.nancond === 'omitnan') w = w.filter((v) => !Number.isNaN(v));
      const r = f(Float64Array.from(w));
      nout = r.length; col.push(r);
    }
    results.push(col);
  }
  const L = keep.length;
  const fillRow = new Array(nout).fill(o.fill);
  if (nout === 1) {
    const od = dims.slice(); od[dim] = L;
    const out = new Float64Array(prod(od)); let s = 0;
    for (let o2 = 0; o2 < outer; o2++) for (let i = 0; i < stride; i++, s++) results[s].forEach((r, k) => { out[i + stride * (k + L * o2)] = (r ?? fillRow)[0]; });
    return tensor('double', od, out);
  }
  if (results.length !== 1) throw E(`${fn}:multiOutput`, `${fn}: functions returning several values per window need vector data.`);
  let cols = Array.from({ length: nout }, (_, j) => j);
  if (o.outdim) { if (o.outdim.some((j) => j < 0 || j >= nout)) throw E(`${fn}:badOutdim`, `${fn}: OUTDIM is out of range.`); cols = o.outdim; }
  const rows = results[0].map((r) => cols.map((j) => (r ?? fillRow)[j]));
  return mat(rows, L, cols.length);
}
function movfun(args, nargout, ctx) {
  if (args.length < 3) throw E('movfun:nargin', 'movfun: expected movfun(fcn, x, wlen, ...).');
  const fh = isFuncHandle(args[0]) ? args[0] : isText(args[0]) ? toStr(args[0]) : null;
  if (!fh) throw E('movfun:badFunction', 'movfun: FCN must be a function handle.');
  const t = T(args[1], 'movfun', 'X');
  const wl = wlenOf(args[2], 'movfun');
  const o = movOpts(args, 3, 'movfun', true);
  return movCore(t, wl, o, 'movfun', (w) => {
    ctx.checkInterrupt();
    const r = callFn(ctx, fh, [colV(Array.from(w))], 1);
    if (!r.length) throw E('movfun:noOutput', 'movfun: FCN did not return a value.');
    return Array.from(F(r[0]));
  });
}
const median = (a) => { const s = Float64Array.from(a).sort(); const n = s.length; if (!n) return NaN; if (s.some(Number.isNaN)) return NaN; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
function movmad(args) {
  if (args.length < 2) throw E('movmad:nargin', 'movmad: expected movmad(x, wlen, ...).');
  const t = T(args[0], 'movmad', 'X');
  const wl = wlenOf(args[1], 'movmad');
  const o = movOpts(args, 2, 'movmad', false);
  return movCore(t, wl, o, 'movmad', (w) => { const m = median(w); return [median(Array.from(w, (v) => Math.abs(v - m)))]; });
}
function movslice(args, nargout) {
  if (args.length !== 2) throw E('movslice:nargin', 'movslice: expected movslice(N, wlen).');
  const N = toNum(args[0]);
  if (!(N >= 1) || N !== Math.floor(N)) throw E('movslice:badN', 'movslice: N must be a positive integer.');
  const [nb, na] = wlenOf(args[1], 'movslice');
  const Cpre = Array.from({ length: nb }, (_, i) => i + 1);
  const Cnf = N - na + 1;
  const Cpos = []; for (let c = Cnf; c <= N; c++) Cpos.push(c);
  const C = []; for (let c = nb + 1; c <= Cnf - 1; c++) C.push(c);
  const win = []; for (let k = -nb; k <= na; k++) win.push(k);
  const W = win.length; const s = new Float64Array(W * C.length);
  C.forEach((c, j) => win.forEach((k, i) => { s[i + W * j] = c + k; }));
  return [tensor('double', [W, C.length], s), rowV(C), rowV(Cpre), rowV(Cpos), colV(win)].slice(0, Math.max(1, nargout));
}

export const builtins = {
  corrcov, kendall, spearman, ranks, run_count, runlength, statistics, rmse, mape,
  discrete_cdf, discrete_inv, discrete_pdf, discrete_rnd, empirical_cdf, empirical_inv, empirical_pdf, empirical_rnd,
  rande, randp, movfun, movmad, movslice,
};

export const help = {
  corrcov: H('Correlation matrix (and standard deviations) from a covariance matrix.', '공분산 행렬로부터 상관 행렬(과 표준편차)을 구합니다.', ['r = corrcov(sigma)', '[r, s] = corrcov(sigma)']),
  kendall: H("Kendall's rank correlation tau between the columns of x (and y).", 'x (와 y) 의 열 사이의 켄달 순위 상관계수 tau.', ['tau = kendall(x)', 'tau = kendall(x, y)']),
  spearman: H("Spearman's rank correlation rho between the columns of x (and y).", 'x (와 y) 의 열 사이의 스피어먼 순위 상관계수 rho.', ['rho = spearman(x)', 'rho = spearman(x, y)']),
  ranks: H('Ranks of the data along a dimension. RTYPE 0 "fractional" (ties averaged, default), 1 "competition", 2 "modified", 3 "dense", 4 "ordinal".', '차원을 따라 데이터의 순위. RTYPE 0 "fractional"(동순위 평균, 기본), 1 "competition", 2 "modified", 3 "dense", 4 "ordinal".', ['y = ranks(x)', 'y = ranks(x, dim)', 'y = ranks(x, dim, rtype)']),
  run_count: H('Count the upward runs of length 1, 2, …, N−1 and >= N along a dimension.', '차원을 따라 길이 1, 2, …, N−1 및 N 이상인 상승 런의 개수를 셉니다.', ['count = run_count(x, n)', 'count = run_count(x, n, dim)']),
  runlength: H('Lengths of the runs of equal values of a vector, and the values of the runs.', '벡터에서 같은 값이 이어지는 런의 길이와 그 값.', ['count = runlength(x)', '[count, value] = runlength(x)']),
  statistics: H('Minimum, first quartile, median, third quartile, maximum, mean, standard deviation, skewness and kurtosis along a dimension.', '차원을 따라 최솟값, 1사분위수, 중앙값, 3사분위수, 최댓값, 평균, 표준편차, 왜도, 첨도.', ['stats = statistics(x)', 'stats = statistics(x, dim)']),
  rmse: H('Root mean squared error between forecast F and actual A: sqrt(mean((F − A).^2)); options dim, vecdim, "all", nanflag, "Weights".', '예측 F 와 실제 A 의 평균 제곱근 오차. 옵션 dim, vecdim, "all", nanflag, "Weights".', ['E = rmse(F, A)', 'E = rmse(F, A, dim)', 'E = rmse(F, A, "all")', 'E = rmse(..., nanflag)', 'E = rmse(..., "Weights", w)']),
  mape: H('Mean absolute percentage error 100·mean(|(A − F)./A|) between forecast F and actual A; options dim, vecdim, "all", nanflag, "Weights".', '예측 F 와 실제 A 의 평균 절대 백분율 오차 100·mean(|(A − F)./A|). 옵션 dim, vecdim, "all", nanflag, "Weights".', ['E = mape(F, A)', 'E = mape(F, A, dim)', 'E = mape(F, A, "all")', 'E = mape(..., nanflag)', 'E = mape(..., "Weights", w)']),
  discrete_cdf: H('CDF at x of the discrete distribution with values v and probabilities p.', '값 v, 확률 p 인 이산 분포의 x 에서의 누적분포함수.', ['cdf = discrete_cdf(x, v, p)']),
  discrete_inv: H('Quantile function of the discrete distribution with values v and probabilities p.', '값 v, 확률 p 인 이산 분포의 분위수 함수.', ['inv = discrete_inv(x, v, p)']),
  discrete_pdf: H('Probability mass at x of the discrete distribution with values v and probabilities p.', '값 v, 확률 p 인 이산 분포의 x 에서의 확률 질량.', ['pdf = discrete_pdf(x, v, p)']),
  discrete_rnd: H('Random draws from the discrete distribution with values v and probabilities p.', '값 v, 확률 p 인 이산 분포에서의 난수.', ['r = discrete_rnd(v, p)', 'r = discrete_rnd(v, p, r, c, ...)', 'r = discrete_rnd(v, p, [sz])']),
  empirical_cdf: H('Empirical CDF at x of the sample DATA.', '표본 DATA 의 x 에서의 경험적 누적분포함수.', ['cdf = empirical_cdf(x, data)']),
  empirical_inv: H('Empirical quantile function of the sample DATA.', '표본 DATA 의 경험적 분위수 함수.', ['inv = empirical_inv(x, data)']),
  empirical_pdf: H('Empirical probability mass at x of the sample DATA.', '표본 DATA 의 x 에서의 경험적 확률 질량.', ['pdf = empirical_pdf(x, data)']),
  empirical_rnd: H('Bootstrap draws (with replacement) from the sample DATA.', '표본 DATA 에서 복원 추출(부트스트랩) 난수.', ['r = empirical_rnd(data)', 'r = empirical_rnd(data, r, c, ...)', 'r = empirical_rnd(data, [sz])']),
  rande: H('Exponentially distributed random numbers with mean 1.', '평균 1 인 지수 분포 난수.', ['x = rande(n)', 'x = rande(m, n, ...)', 'x = rande([m n ...])', 'x = rande(..., "single")']),
  randp: H('Poisson distributed random integers with mean L.', '평균 L 인 푸아송 분포 정수 난수.', ['x = randp(l)', 'x = randp(l, n)', 'x = randp(l, m, n, ...)', 'x = randp(l, [m n ...])']),
  movfun: H('Apply a function to a sliding window of length WLEN along a dimension. Properties "dim", "Endpoints" ("shrink", "discard", "fill", value, "periodic", "same"), "nancond" ("includenan", "omitnan"), "outdim".', '길이 WLEN 의 이동 창에 함수를 적용합니다. 속성 "dim", "Endpoints"("shrink", "discard", "fill", 값, "periodic", "same"), "nancond"("includenan", "omitnan"), "outdim".', ['y = movfun(fcn, x, wlen)', 'y = movfun(fcn, x, [nb, na])', 'y = movfun(..., property, value)']),
  movmad: H('Moving median absolute deviation over a sliding window of length WLEN.', '길이 WLEN 의 이동 창에 대한 중앙값 절대 편차.', ['y = movmad(x, wlen)', 'y = movmad(x, wlen, dim)', 'y = movmad(..., "omitnan")', 'y = movmad(..., property, value)']),
  movslice: H('Index matrix of the sliding windows of length WLEN over 1..N, the window centres C, the centres Cpre/Cpos that do not fit, and the relative window WIN.', '1..N 위의 길이 WLEN 이동 창의 인덱스 행렬, 창 중심 C, 창이 들어가지 않는 중심 Cpre/Cpos, 상대 창 WIN.', ['[slcidx, C, Cpre, Cpos, win] = movslice(N, wlen)']),
};

export { rowsOf };
