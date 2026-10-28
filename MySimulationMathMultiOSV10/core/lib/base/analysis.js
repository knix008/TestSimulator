// Data analysis (second part): covariance and correlation, numerical
// gradients and Laplacians, trend removal and data smoothing.
import { tensor, num, isTensor, isSparse, toTensor } from '../../value.js';
import { E, dense, finalize, optArg, textArg, firstNonSingleton, splitDims, dimsWith } from './util.js';
import { betainc, norminv } from '../numeric/_kernels.js';

const outCls = (t) => (t.cls === 'single' ? 'single' : 'double');
function numIn(v, fname) {
  if (v === undefined) throw E(`base:${fname}:notEnoughInputs`, 'Not enough input arguments.');
  if (isTensor(v)) return v;
  if (isSparse(v)) return toTensor(v);
  throw E(`base:${fname}:invalidType`, 'Invalid data type. First argument must be numeric or logical.');
}
const isNumArg = (v) => v != null && (isTensor(v) || isSparse(v)) && optArg(v) === null;

/** Applies f(re: Float64Array) → Float64Array of length outLen to every slice along dim k. */
export function along(t, k, outLen, f) {
  const { before, len, after } = splitDims(t.dims, k);
  const nOut = before * outLen * after;
  const parts = [t.re, t.im].map((src) => {
    if (!src) return null;
    const r = new Float64Array(nOut), s = new Float64Array(len);
    for (let a = 0; a < after; a++) for (let b = 0; b < before; b++) {
      const base = a * before * len + b;
      for (let q = 0; q < len; q++) s[q] = src[base + q * before];
      const y = f(s);
      const ob = a * before * outLen + b;
      for (let q = 0; q < outLen; q++) r[ob + q * before] = y[q];
    }
    return r;
  });
  return { dims: dimsWith(t.dims, k, outLen), re: parts[0], im: parts[1] };
}

// ------------------------------------------------------------- cov / corrcoef

/** Columns of a 2-D value as {m, n, re, im}; vectors become one column. */
function columnsOf(t, fname) {
  if (t.dims.length > 2) throw E(`base:${fname}:InputDim`, 'Inputs must be 2-D.');
  let [m, n] = t.dims;
  if (m === 1) { m = n; n = 1; }
  return { m, n, re: t.re, im: t.im };
}
function joinCols(a, b) {
  const re = new Float64Array(a.re.length + b.re.length); re.set(a.re); re.set(b.re, a.re.length);
  let im = null;
  if (a.im || b.im) { im = new Float64Array(re.length); if (a.im) im.set(a.im); if (b.im) im.set(b.im, a.re.length); }
  return { m: a.m, n: 2, re, im };
}
/** Parses (X), (X, Y), weights / 0 / 1 and the NaN flag. */
function covArgs(args, fname) {
  if (!args.length) throw E(`base:${fname}:notEnoughInputs`, 'Not enough input arguments.');
  const t = numIn(args[0], fname);
  let X = columnsOf(t, fname), i = 1;
  let w = 0, wv = null, nan = 'includenan';
  if (isNumArg(args[1]) && fname === 'cov') {
    const y = dense(args[1], fname);
    const isW = (y.re.length === 1 && t.re.length !== 1) || (y.re.length === 0);
    if (!isW) {
      if (y.re.length !== t.re.length) throw E(`base:${fname}:XYlengthMismatch`, 'The number of elements in A and B must match.');
      const a = { m: t.re.length, n: 1, re: t.re, im: t.im }, b = { m: y.re.length, n: 1, re: y.re, im: y.im };
      X = joinCols(a, b); i = 2;
    }
  }
  if (isNumArg(args[i])) {
    const wt = dense(args[i], fname);
    if (wt.re.length === 1) {
      if (wt.re[0] !== 0 && wt.re[0] !== 1) throw E(`base:${fname}:invalidWgts`, 'W must be 0, 1, or a vector of nonnegative weights.');
      w = wt.re[0];
    } else if (wt.re.length) {
      if (wt.re.length !== X.m || wt.re.some((x) => !(x >= 0))) throw E(`base:${fname}:invalidWgts`, 'W must be 0, 1, or a vector of nonnegative weights.');
      wv = wt.re;
    }
    i++;
  }
  for (; i < args.length; i++) {
    const s = optArg(args[i]);
    if (s === 'includenan' || s === 'includemissing' || s === 'omitrows' || s === 'partialrows') nan = s === 'includemissing' ? 'includenan' : s;
    else throw E(`base:${fname}:unknownFlag`, `Invalid option '${textArg(args[i]) ?? '?'}'.`);
  }
  return { X, w, wv, nan, cls: outCls(t) };
}
const rowNaN = (X, r, cols) => cols.some((j) => X.re[r + j * X.m] !== X.re[r + j * X.m] || (X.im && X.im[r + j * X.m] !== X.im[r + j * X.m]));
/** Covariance of columns j, k of X over rows `rows`. Returns [re, im]. */
function covPair(X, j, k, rows, w, wv) {
  const n = rows.length;
  if (n === 0) return [NaN, 0];
  const wt = (r) => (wv ? wv[r] : 1);
  let sw = 0, mjr = 0, mji = 0, mkr = 0, mki = 0;
  for (const r of rows) {
    const q = wt(r); sw += q;
    mjr += q * X.re[r + j * X.m]; mkr += q * X.re[r + k * X.m];
    if (X.im) { mji += q * X.im[r + j * X.m]; mki += q * X.im[r + k * X.m]; }
  }
  mjr /= sw; mji /= sw; mkr /= sw; mki /= sw;
  let sr = 0, si = 0;
  for (const r of rows) {
    const q = wt(r);
    const ar = X.re[r + j * X.m] - mjr, ai = X.im ? X.im[r + j * X.m] - mji : 0;
    const br = X.re[r + k * X.m] - mkr, bi = X.im ? X.im[r + k * X.m] - mki : 0;
    // conj(a) * b
    sr += q * (ar * br + ai * bi); si += q * (ar * bi - ai * br);
  }
  const d = wv ? sw : (w === 1 || n === 1 ? n : n - 1);
  return [sr / d, si / d];
}
function covMatrix(o) {
  const { X, w, wv, nan } = o;
  const n = X.n, all = Array.from({ length: n }, (_, j) => j);
  let rowsAll = Array.from({ length: X.m }, (_, r) => r);
  if (nan === 'omitrows') rowsAll = rowsAll.filter((r) => !rowNaN(X, r, all));
  const re = new Float64Array(n * n);
  const im = X.im ? new Float64Array(n * n) : null;
  const counts = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let k = j; k < n; k++) {
    const rows = nan === 'partialrows' ? rowsAll.filter((r) => !rowNaN(X, r, [j, k])) : rowsAll;
    const [a, b] = covPair(X, j, k, rows, w, wv);
    re[j + k * n] = a; re[k + j * n] = a;
    if (im) { im[j + k * n] = b; im[k + j * n] = j === k ? 0 : -b; }
    counts[j + k * n] = counts[k + j * n] = rows.length;
  }
  return { n, re, im, counts };
}
function covFn(args) {
  const o = covArgs(args, 'cov');
  if (o.X.m === 0 && o.X.n <= 1) return num(NaN);
  if (o.X.n === 0) return tensor('double', [0, 0]);
  const C = covMatrix(o);
  return finalize(o.cls, [C.n, C.n], C.re, C.im);
}
const tcdfUpper = (t, v) => { const x2 = t * t; return x2 < v ? 0.5 * betainc(x2 / (v + x2), 0.5, v / 2, true) : 0.5 * betainc(v / (v + x2), v / 2, 0.5); };
function corrcoefFn(args, nargout) {
  // split name/value options from data args
  const data = []; let rowsOpt = 'all', alpha = 0.05;
  for (let i = 0; i < args.length; i++) {
    const s = optArg(args[i]);
    if (s === null) { data.push(args[i]); continue; }
    const v = args[++i];
    if (v === undefined) throw E('base:corrcoef:missingValue', `Option '${textArg(args[i - 1])}' needs a value.`);
    if (s === 'rows') { rowsOpt = optArg(v); if (!['all', 'complete', 'pairwise'].includes(rowsOpt)) throw E('base:corrcoef:invalidRows', "'Rows' must be 'all', 'complete' or 'pairwise'."); }
    else if (s === 'alpha') { alpha = dense(v, 'corrcoef').re[0]; if (!(alpha > 0 && alpha < 1)) throw E('base:corrcoef:invalidAlpha', 'Alpha must be a scalar between 0 and 1.'); }
    else throw E('base:corrcoef:unknownOption', `Invalid option '${textArg(args[i - 1])}'.`);
  }
  if (!data.length) throw E('base:corrcoef:notEnoughInputs', 'Not enough input arguments.');
  const t = numIn(data[0], 'corrcoef');
  let X;
  if (data.length > 1) {
    const y = numIn(data[1], 'corrcoef');
    if (y.re.length !== t.re.length) throw E('base:corrcoef:XYmismatch', 'The lengths of X and Y must match.');
    X = joinCols({ m: t.re.length, n: 1, re: t.re, im: t.im }, { m: y.re.length, n: 1, re: y.re, im: y.im });
  } else X = columnsOf(t, 'corrcoef');
  const nan = rowsOpt === 'complete' ? 'omitrows' : rowsOpt === 'pairwise' ? 'partialrows' : 'includenan';
  const C = covMatrix({ X, w: 0, wv: null, nan });
  const n = C.n, R = new Float64Array(n * n), Ri = C.im ? new Float64Array(n * n) : null;
  const d = (j) => Math.sqrt(C.re[j + j * n]);
  for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
    const s = d(j) * d(k);
    R[j + k * n] = C.re[j + k * n] / s; if (Ri) Ri[j + k * n] = C.im[j + k * n] / s;
    if (j === k && s === s && s !== 0) { R[j + k * n] = 1; if (Ri) Ri[j + k * n] = 0; }
    // clamp rounding
    if (!Ri && Math.abs(R[j + k * n]) > 1) R[j + k * n] = Math.sign(R[j + k * n]);
  }
  const cls = outCls(t);
  const outs = [finalize(cls, [n, n], R, Ri)];
  if (nargout >= 2) {
    const P = new Float64Array(n * n), L = new Float64Array(n * n), U = new Float64Array(n * n);
    const z = norminv(1 - alpha / 2);
    for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
      const r = Ri ? Math.hypot(R[j + k * n], Ri[j + k * n]) : R[j + k * n];
      const m = C.counts[j + k * n];
      if (j === k) P[j + k * n] = 1;
      else { const df = m - 2; const tt = r * Math.sqrt(df / Math.max(0, 1 - r * r)); P[j + k * n] = df > 0 ? Math.min(1, 2 * tcdfUpper(Math.abs(tt), df)) : NaN; }
      const zr = Math.atanh(r), half = m > 3 ? z / Math.sqrt(m - 3) : NaN;
      L[j + k * n] = Math.tanh(zr - half); U[j + k * n] = Math.tanh(zr + half);
      if (j === k) { L[j + k * n] = r; U[j + k * n] = r; }
    }
    outs.push(finalize(cls, [n, n], P), finalize(cls, [n, n], L), finalize(cls, [n, n], U));
  }
  return nargout <= 1 ? outs[0] : outs.slice(0, nargout);
}

// ------------------------------------------------------------- gradient / del2

/** Spacing arguments → per-dimension coordinate arrays (null = uniform with step h). */
function spacing(args, start, nd, dimsForSpacing, fname) {
  const sp = args.slice(start);
  const out = [];
  const one = (v, len) => {
    const t = dense(v, fname);
    if (t.re.length === 1) return { h: t.re[0], x: null };
    if (t.re.length !== len) throw E(`base:${fname}:InvalidGridSpacing`, 'Spacing vector length must match the size of F in that dimension.');
    return { h: null, x: t.re };
  };
  if (sp.length === 0) for (let i = 0; i < nd; i++) out.push({ h: 1, x: null });
  else if (sp.length === 1) {
    const t = dense(sp[0], fname);
    if (t.re.length === 1) for (let i = 0; i < nd; i++) out.push({ h: t.re[0], x: null });
    else if (nd === 1) out.push(one(sp[0], dimsForSpacing[0]));
    else throw E(`base:${fname}:InvalidGridSpacing`, 'A single spacing input must be a scalar for multidimensional data.');
  } else {
    if (sp.length !== nd) throw E(`base:${fname}:InvalidGridSpacing`, 'Number of spacing inputs must match the number of dimensions.');
    for (let i = 0; i < nd; i++) out.push(one(sp[i], dimsForSpacing[i]));
  }
  return out;
}
function grad1(f, s) {
  const n = f.length, g = new Float64Array(n);
  if (n < 2) return g;
  const X = (i) => (s.x ? s.x[i] : i * s.h);
  g[0] = (f[1] - f[0]) / (X(1) - X(0));
  g[n - 1] = (f[n - 1] - f[n - 2]) / (X(n - 1) - X(n - 2));
  for (let i = 1; i < n - 1; i++) g[i] = (f[i + 1] - f[i - 1]) / (X(i + 1) - X(i - 1));
  return g;
}
/** Order of the derivative dimensions: x (dim 2), y (dim 1), then 3, 4, ... */
function gradOrder(t) {
  const d = t.dims;
  const isVec = d.length === 2 && (d[0] === 1 || d[1] === 1);
  if (isVec) return [d[0] === 1 && d[1] !== 1 ? 1 : 0];
  const o = [1, 0]; for (let k = 2; k < d.length; k++) o.push(k);
  return o;
}
function gradientFn(args, nargout) {
  const t = numIn(args[0], 'gradient');
  const order = gradOrder(t);
  const sp = spacing(args, 1, order.length, order.map((k) => t.dims[k] ?? 1), 'gradient');
  const n = Math.max(1, nargout);
  if (n > order.length) throw E('base:gradient:tooManyOutputs', 'Too many output arguments.');
  const outs = [];
  for (let q = 0; q < n; q++) {
    const k = order[q];
    const r = along(t, k, t.dims[k] ?? 1, (s) => grad1(s, sp[q]));
    outs.push(finalize(outCls(t), r.dims, r.re, r.im));
  }
  return n === 1 ? outs[0] : outs;
}
function lap1(f, s) {
  const n = f.length, D = new Float64Array(n);
  if (n < 3) return D;
  const X = (i) => (s.x ? s.x[i] : i * s.h);
  for (let i = 1; i < n - 1; i++) {
    const hl = X(i) - X(i - 1), hr = X(i + 1) - X(i);
    D[i] = ((f[i + 1] - f[i]) / hr - (f[i] - f[i - 1]) / hl) / ((hl + hr) / 2);
  }
  // linear extrapolation to the edges
  const ex = (a, b, c) => D[b] + (X(a) - X(b)) * (D[c] - D[b]) / (X(c) - X(b));
  if (n === 3) { D[0] = D[1]; D[2] = D[1]; } else { D[0] = ex(0, 1, 2); D[n - 1] = ex(n - 1, n - 2, n - 3); }
  return D;
}
function del2Fn(args) {
  const t = numIn(args[0], 'del2');
  const order = gradOrder(t);
  const sp = spacing(args, 1, order.length, order.map((k) => t.dims[k] ?? 1), 'del2');
  const N = t.re.length;
  const re = new Float64Array(N), im = t.im ? new Float64Array(N) : null;
  const nd = order.length;
  const scale = nd === 1 ? 4 : 2 * nd;
  order.forEach((k, q) => {
    const r = along(t, k, t.dims[k] ?? 1, (s) => lap1(s, sp[q]));
    for (let i = 0; i < N; i++) { re[i] += r.re[i] / scale; if (im) im[i] += r.im[i] / scale; }
  });
  return finalize(outCls(t), t.dims, re, im);
}

// ------------------------------------------------------------- detrend

/** Least-squares residual of columns `cols` (basis matrix) for data y (Householder QR). */
function lsResidual(cols, y) {
  const m = y.length, p = cols.length;
  const A = cols.map((c) => Float64Array.from(c));
  const b = Float64Array.from(y);
  const Q = [];
  for (let k = 0; k < p; k++) {
    // orthogonalize column k against previous (modified Gram-Schmidt, twice for stability)
    const v = A[k];
    for (let pass = 0; pass < 2; pass++) for (const q of Q) { let d = 0; for (let i = 0; i < m; i++) d += q[i] * v[i]; for (let i = 0; i < m; i++) v[i] -= d * q[i]; }
    let nv = 0; for (let i = 0; i < m; i++) nv += v[i] * v[i];
    nv = Math.sqrt(nv);
    if (nv > 1e-12 * Math.sqrt(m)) { for (let i = 0; i < m; i++) v[i] /= nv; Q.push(v); }
  }
  for (const q of Q) { let d = 0; for (let i = 0; i < m; i++) d += q[i] * b[i]; for (let i = 0; i < m; i++) b[i] -= d * q[i]; }
  return b;
}
function detrendFn(args) {
  const t = numIn(args[0], 'detrend');
  let deg = 1, bp = [], cont = true, sp = null, nan = 'includenan', i = 1;
  if (i < args.length) {
    const s = optArg(args[i]);
    if (s === 'constant') { deg = 0; i++; } else if (s === 'linear') { deg = 1; i++; } else if (s === null) {
      const d = dense(args[i], 'detrend').re;
      if (d.length !== 1 || !(d[0] >= 0) || !Number.isInteger(d[0])) throw E('base:detrend:invalidDegree', 'Polynomial degree must be a nonnegative integer scalar.');
      deg = d[0]; i++;
    }
  }
  if (i < args.length && optArg(args[i]) === null) { bp = Array.from(dense(args[i], 'detrend').re); i++; }
  for (; i < args.length; i++) {
    const s = optArg(args[i]); const v = args[i + 1];
    if (s === 'continuous') { cont = !!dense(v, 'detrend').re[0]; i++; }
    else if (s === 'samplepoints') { sp = Float64Array.from(dense(v, 'detrend').re); i++; }
    else if (s === 'omitnan' || s === 'omitmissing') nan = 'omitnan';
    else if (s === 'includenan' || s === 'includemissing') nan = 'includenan';
    else throw E('base:detrend:invalidOption', `Invalid option '${textArg(args[i]) ?? '?'}'.`);
  }
  const d = t.dims;
  const isRowV = d.length === 2 && d[0] === 1;
  const k = isRowV ? 1 : 0;
  const len = d[k];
  const x = sp || Float64Array.from({ length: len }, (_, q) => q + 1);
  if (x.length !== len) throw E('base:detrend:SamplePointsLength', 'Sample points must have the same length as the data.');
  const lo = x[0], hi = x[len - 1];
  const span = hi - lo || 1, mid = (hi + lo) / 2;
  const u = Array.from(x, (v) => (v - mid) / (span / 2));
  const bpu = bp.filter((b) => b > lo && b < hi).map((b) => (b - mid) / (span / 2));
  const basis = [];
  for (let p = 0; p <= deg; p++) basis.push(u.map((v) => v ** p));
  for (const b of bpu) {
    for (let p = cont ? 1 : 0; p <= deg; p++) basis.push(u.map((v) => (v > b || (p === 0 && v >= b) ? (v - b) ** p : 0)));
    if (deg === 0 && cont) basis.push(u.map((v) => (v >= b ? 1 : 0)));
  }
  const r = along(t, k, len, (y) => {
    if (nan === 'omitnan' && y.some((v) => v !== v)) {
      const keep = []; for (let q = 0; q < len; q++) if (y[q] === y[q]) keep.push(q);
      const res = lsResidual(basis.map((c) => keep.map((q) => c[q])), keep.map((q) => y[q]));
      const out = new Float64Array(len).fill(NaN); keep.forEach((q, j) => { out[q] = res[j]; }); return out;
    }
    return lsResidual(basis, y);
  });
  return finalize(outCls(t), d, r.re, r.im);
}

// ------------------------------------------------------------- smoothdata

function windowBounds(k) {
  if (k.length === 2) return [k[0], k[1]];
  const w = k[0];
  if (!(w > 0)) throw E('base:smoothdata:invalidWindow', 'Window length must be a positive scalar or a 2-element vector of nonnegative values.');
  if (Number.isInteger(w)) return w % 2 ? [(w - 1) / 2, (w - 1) / 2] : [w / 2, w / 2 - 1];
  return [Math.floor(w / 2), Math.floor(w / 2)];
}
/** Weighted least-squares polynomial value at x0 (degree deg). */
function wpoly(xs, ys, ws, x0, deg) {
  const n = xs.length;
  if (!n) return NaN;
  deg = Math.min(deg, n - 1);
  const p = deg + 1;
  // normal equations on centered coordinates
  const A = Array.from({ length: p }, () => new Float64Array(p)), b = new Float64Array(p);
  let sc = 0; for (const x of xs) sc = Math.max(sc, Math.abs(x - x0)); sc = sc || 1;
  for (let i = 0; i < n; i++) {
    const u = (xs[i] - x0) / sc, w = ws ? ws[i] : 1; if (!(w > 0)) continue;
    const pw = [1]; for (let q = 1; q < 2 * p; q++) pw.push(pw[q - 1] * u);
    for (let r = 0; r < p; r++) { b[r] += w * pw[r] * ys[i]; for (let c = 0; c < p; c++) A[r][c] += w * pw[r + c]; }
  }
  // Gaussian elimination with partial pivoting; drop degree on singularity
  for (let c = 0; c < p; c++) {
    let piv = c; for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-13 * (Math.abs(A[0][0]) || 1)) return deg > 0 ? wpoly(xs, ys, ws, x0, deg - 1) : NaN;
    [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = c + 1; r < p; r++) { const f = A[r][c] / A[c][c]; if (!f) continue; for (let q = c; q < p; q++) A[r][q] -= f * A[c][q]; b[r] -= f * b[c]; }
  }
  const z = new Float64Array(p);
  for (let r = p - 1; r >= 0; r--) { let s = b[r]; for (let q = r + 1; q < p; q++) s -= A[r][q] * z[q]; z[r] = s / A[r][r]; }
  return z[0];
}
const median = (a) => { const s = Float64Array.from(a).sort(); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
function smooth1(y, x, method, kb, kf, deg, omit) {
  const n = y.length, out = new Float64Array(n);
  const nanIn = Array.from(y, (v) => v !== v);
  let robust = null;
  const iters = method === 'rlowess' || method === 'rloess' ? 6 : 1;
  for (let it = 0; it < iters; it++) {
    let j0 = 0;
    for (let i = 0; i < n; i++) {
      const lo = x[i] - kb, hi = x[i] + kf;
      const xs = [], ys = [], ws = [];
      let hasNaN = false;
      while (j0 < n && x[j0] < lo) j0++;
      for (let j = j0; j < n && x[j] <= hi; j++) {
        if (nanIn[j]) { hasNaN = true; continue; }
        xs.push(x[j]); ys.push(y[j]); ws.push(robust ? robust[j] : 1);
      }
      if (hasNaN && !omit) { out[i] = NaN; continue; }
      if (!ys.length) { out[i] = NaN; continue; }
      if (method === 'movmean') out[i] = ys.reduce((a, b) => a + b, 0) / ys.length;
      else if (method === 'movmedian') out[i] = median(ys);
      else if (method === 'gaussian') {
        const sig = (kb + kf) / 5 || 1; let s = 0, sw = 0;
        for (let q = 0; q < xs.length; q++) { const w = Math.exp(-0.5 * ((xs[q] - x[i]) / sig) ** 2); s += w * ys[q]; sw += w; }
        out[i] = s / sw;
      } else if (method === 'sgolay') out[i] = wpoly(xs, ys, null, x[i], deg);
      else {
        const dmax = Math.max(x[i] - lo, hi - x[i]) * (1 + 1e-12) || 1;
        const w = xs.map((xx, q) => { const d = Math.abs(xx - x[i]) / dmax; return (1 - d ** 3) ** 3 * ws[q]; });
        out[i] = wpoly(xs, ys, w, x[i], method === 'lowess' || method === 'rlowess' ? 1 : 2);
      }
    }
    if (it + 1 < iters) {
      const res = Array.from(y, (v, j) => (nanIn[j] ? NaN : v - out[j]));
      const mad = median(res.filter((v) => v === v).map(Math.abs));
      if (!(mad > 0)) break;
      robust = res.map((r) => { const u = r / (6 * mad); return r !== r ? 0 : Math.abs(u) < 1 ? (1 - u * u) ** 2 : 0; });
    }
  }
  return out;
}
function smoothdataFn(args, nargout) {
  const t = numIn(args[0], 'smoothdata');
  let i = 1, dim = null, method = 'movmean', win = null, deg = 2, omit = false, sp = null, factor = 0.25;
  const METHODS = ['movmean', 'movmedian', 'gaussian', 'lowess', 'loess', 'rlowess', 'rloess', 'sgolay'];
  if (isNumArg(args[i])) { dim = dense(args[i], 'smoothdata').re[0] - 1; i++; }
  if (optArg(args[i]) !== null && METHODS.includes(optArg(args[i]))) {
    method = optArg(args[i]); i++;
    if (isNumArg(args[i])) { win = Array.from(dense(args[i], 'smoothdata').re); i++; }
  }
  for (; i < args.length; i++) {
    const s = optArg(args[i]);
    if (s === 'omitnan' || s === 'omitmissing') omit = true;
    else if (s === 'includenan' || s === 'includemissing') omit = false;
    else if (s === 'degree') { deg = dense(args[++i], 'smoothdata').re[0]; }
    else if (s === 'samplepoints') { sp = Float64Array.from(dense(args[++i], 'smoothdata').re); }
    else if (s === 'smoothingfactor') { factor = dense(args[++i], 'smoothdata').re[0]; if (!(factor >= 0 && factor <= 1)) throw E('base:smoothdata:invalidFactor', 'Smoothing factor must be between 0 and 1.'); }
    else throw E('base:smoothdata:invalidOption', `Invalid option '${textArg(args[i]) ?? '?'}'.`);
  }
  if (dim === null) dim = firstNonSingleton(t.dims);
  const len = t.dims[dim] ?? 1;
  const x = sp || Float64Array.from({ length: len }, (_, q) => q);
  if (x.length !== len) throw E('base:smoothdata:SamplePointsLength', 'Sample points must have the same length as the data.');
  if (win === null) {
    // heuristic: a fraction of the data span controlled by the smoothing factor
    const span = len > 1 ? x[len - 1] - x[0] + (sp ? 0 : 1) : 1;
    win = [Math.max(1, Math.round(span * factor * 0.4))];
  }
  if (method === 'sgolay' && !(deg >= 0 && Number.isInteger(deg))) throw E('base:smoothdata:invalidDegree', 'Degree must be a nonnegative integer.');
  const [kb, kf] = windowBounds(win);
  const r = along(t, dim, len, (y) => smooth1(y, x, method, kb, kf, deg, omit));
  const B = finalize(outCls(t), t.dims, r.re, r.im);
  return nargout >= 2 ? [B, tensor('double', [1, win.length], Float64Array.from(win))] : B;
}

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const builtins = {
  cov: covFn,
  corrcoef: corrcoefFn,
  gradient: gradientFn,
  del2: del2Fn,
  detrend: detrendFn,
  smoothdata: smoothdataFn,
};
export const help = {
  cov: H('Covariance (of vectors, matrix columns or two variables).', '공분산 (벡터, 행렬 열 또는 두 변수).', ['C = cov(A)', 'C = cov(A, B)', 'C = cov(..., w)', "C = cov(..., 'omitrows')", "C = cov(..., 'partialrows')"]),
  corrcoef: H('Correlation coefficients with p-values and confidence bounds.', '상관 계수 (p-값, 신뢰 구간 포함).', ['R = corrcoef(A)', 'R = corrcoef(A, B)', '[R, P, RL, RU] = corrcoef(...)', "R = corrcoef(..., 'Rows', 'complete')", "R = corrcoef(..., 'Alpha', 0.01)"]),
  gradient: H('Numerical gradient (central differences inside, one-sided at the edges).', '수치 기울기 (내부는 중앙 차분, 가장자리는 단측 차분).', ['FX = gradient(F)', '[FX, FY] = gradient(F)', '[FX, FY, FZ, ...] = gradient(F, h)', '[...] = gradient(F, hx, hy, ...)']),
  del2: H('Discrete Laplacian (sum of second differences divided by 2N).', '이산 라플라시안 (2차 차분의 합 / 2N).', ['L = del2(U)', 'L = del2(U, h)', 'L = del2(U, hx, hy, ...)']),
  detrend: H('Removes a polynomial trend (optionally piecewise with break points).', '다항 추세 제거 (중단점으로 구간별 가능).', ['D = detrend(x)', 'D = detrend(x, n)', "D = detrend(x, 'constant')", 'D = detrend(x, n, bp)', "D = detrend(..., 'Continuous', false)", "D = detrend(..., 'SamplePoints', t)"]),
  smoothdata: H('Smooths noisy data with a moving window method.', '이동 창 방법으로 잡음 데이터를 평활화.', ['B = smoothdata(A)', 'B = smoothdata(A, dim)', "B = smoothdata(..., method, window)", "B = smoothdata(..., 'omitnan')", "B = smoothdata(..., 'sgolay', w, 'Degree', d)", '[B, window] = smoothdata(...)']),
};
