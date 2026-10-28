// More statistics: empirical CDF, kernel density, cross tabulation, group
// statistics, random sampling and bootstrap, robust / ridge / lasso / GLM /
// nonlinear regression, nearest neighbours, normality and Friedman tests,
// bivariate histogram counts and gamma random numbers.
import { tensor, num, str, cell, isText, toStr, isTensor, isFuncHandle, struct, toTensor } from '../../../value.js';
import { E, F, isEmptyV, nv, cellStr } from '../_util.js';
import { globalGen } from '../random.js';
import { groups, sorted, medianA, meanA, varA } from './_s.js';
import { DIST, gammaRnd } from './dist.js';

const call1 = (ctx, f, args) => ctx.call(f, args, 1)[0];
const lstr = (v) => (v != null && isText(v) ? toStr(v).toLowerCase() : null);
const col = (a) => tensor('double', [a.length, 1], Float64Array.from(a));
const row = (a) => tensor('double', [1, a.length], Float64Array.from(a));
const matV = (m, n, a) => tensor('double', [m, n], a instanceof Float64Array ? a : Float64Array.from(a));
const T = (v, fn) => { if (v == null) throw E(`${fn}:notEnoughInputs`, 'Not enough input arguments.'); if (!isTensor(v) && !v.sparse) throw E(`${fn}:badInput`, `${fn} requires numeric input.`); return toTensor(v); };
function M2(v, fn, flip = true) { const t = T(v, fn); const d = t.dims; if (d.length > 2) throw E(`${fn}:notMatrix`, 'Input must be a 2-D matrix.'); let [m, n] = d; if (flip && m === 1 && n > 1) { m = n; n = 1; } return { m, n, a: t.re }; }
const chi2up = (x, v) => DIST.chi2.cdf(x, [v], true);
const tUp = (x, v) => DIST.t.cdf(x, [v], true);

// ------------------------------------------------------------- linear algebra helpers (small, dense)

/** Least squares via normal equations with Cholesky (ridge-regularized when lam > 0). X: rows array. */
function wls(X, y, w = null, lam = 0) {
  const n = X.length, p = n ? X[0].length : 0;
  const A = Array.from({ length: p }, () => new Float64Array(p)), b = new Float64Array(p);
  for (let i = 0; i < n; i++) { const wi = w ? w[i] : 1; if (!wi) continue; const xi = X[i]; for (let r = 0; r < p; r++) { b[r] += wi * xi[r] * y[i]; for (let c = 0; c <= r; c++) A[r][c] += wi * xi[r] * xi[c]; } }
  for (let r = 0; r < p; r++) { A[r][r] += lam; for (let c = r + 1; c < p; c++) A[r][c] = A[c][r]; }
  return { beta: solveSym(A, b), A };
}
function solveSym(A, b) {
  const p = b.length; const M = A.map((r) => Float64Array.from(r)); const x = Float64Array.from(b);
  for (let c = 0; c < p; c++) {
    let piv = c; for (let r = c + 1; r < p; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]]; [x[c], x[piv]] = [x[piv], x[c]];
    const d = M[c][c] || 1e-300;
    for (let r = c + 1; r < p; r++) { const f = M[r][c] / d; if (!f) continue; for (let q = c; q < p; q++) M[r][q] -= f * M[c][q]; x[r] -= f * x[c]; }
  }
  for (let r = p - 1; r >= 0; r--) { let s = x[r]; for (let q = r + 1; q < p; q++) s -= M[r][q] * x[q]; x[r] = s / (M[r][r] || 1e-300); }
  return x;
}
function invSym(A) { const p = A.length; const R = []; for (let j = 0; j < p; j++) { const e = new Float64Array(p); e[j] = 1; R.push(solveSym(A, e)); } return R; }
const rowsOf = (Xm) => Array.from({ length: Xm.m }, (_, i) => Array.from({ length: Xm.n }, (_, j) => Xm.a[i + j * Xm.m]));

// ------------------------------------------------------------- ecdf / ksdensity

function ecdfFn(args, nargout) {
  const y = Array.from(T(args[0], 'ecdf').re).filter((v) => v === v);
  const o = nv(args, 1);
  const fun = o.function ? lstr(o.function) : 'cdf';
  const s = sorted(y); const n = s.length;
  const xs = [s[0]], fs = [0];
  for (let i = 0; i < n; i++) if (i === n - 1 || s[i + 1] !== s[i]) { xs.push(s[i]); fs.push((i + 1) / n); }
  const f = fun === 'survivor' ? fs.map((v) => 1 - v) : fun === 'cumulative hazard' ? fs.map((v) => -Math.log(1 - v)) : fs;
  const out = [col(f), col(xs)];
  return nargout <= 1 ? out[0] : out;
}
const KERNELS = {
  normal: { k: (u) => Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI), K: (u) => 0.5 * (1 + erfJS(u / Math.SQRT2)), r: 6 },
  box: { k: (u) => (Math.abs(u) <= Math.sqrt(3) ? 1 / (2 * Math.sqrt(3)) : 0), K: (u) => Math.min(1, Math.max(0, (u + Math.sqrt(3)) / (2 * Math.sqrt(3)))), r: Math.sqrt(3) },
  triangle: { k: (u) => { const a = Math.abs(u) / Math.sqrt(6); return a < 1 ? (1 - a) / Math.sqrt(6) : 0; }, K: (u) => { const t = u / Math.sqrt(6); if (t <= -1) return 0; if (t >= 1) return 1; return t < 0 ? 0.5 * (1 + t) ** 2 : 1 - 0.5 * (1 - t) ** 2; }, r: Math.sqrt(6) },
  epanechnikov: { k: (u) => { const a = u / Math.sqrt(5); return Math.abs(a) < 1 ? 0.75 * (1 - a * a) / Math.sqrt(5) : 0; }, K: (u) => { const t = Math.max(-1, Math.min(1, u / Math.sqrt(5))); return 0.5 + 0.75 * (t - t ** 3 / 3); }, r: Math.sqrt(5) },
};
function erfJS(x) { const t = 1 / (1 + 0.5 * Math.abs(x)); const y = 1 - t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? y : -y; }
function ksdensityFn(args, nargout) {
  const x = Array.from(T(args[0], 'ksdensity').re).filter((v) => v === v);
  let i = 1, pts = null;
  if (args[i] !== undefined && !isText(args[i])) { pts = Array.from(F(args[i])); i++; }
  const o = nv(args, i);
  const kname = o.kernel ? lstr(o.kernel) : 'normal';
  const K = KERNELS[kname === 'epanechnikov' ? 'epanechnikov' : kname];
  if (!K) throw E('ksdensity:badKernel', "Kernel must be 'normal', 'box', 'triangle' or 'epanechnikov'.");
  const fun = o.function ? lstr(o.function) : 'pdf';
  const n = x.length;
  let bw = o.bandwidth ? F(o.bandwidth)[0] : null;
  if (!bw) { const med = medianA(x); const sig = medianA(x.map((v) => Math.abs(v - med))) / 0.6745; bw = (sig > 0 ? sig : Math.sqrt(varA(x)) || 1) * Math.pow(4 / (3 * n), 0.2); }
  const npts = o.numpoints ? F(o.numpoints)[0] : 100;
  if (!pts) { const lo = Math.min(...x) - 3 * bw, hi = Math.max(...x) + 3 * bw; pts = Array.from({ length: npts }, (_, k) => lo + (hi - lo) * k / (npts - 1)); }
  const w = o.weights ? Array.from(F(o.weights)) : null; const sw = w ? w.reduce((a, b) => a + b, 0) : n;
  const f = pts.map((p) => {
    let s = 0;
    for (let k = 0; k < n; k++) { const u = (p - x[k]) / bw; const wk = w ? w[k] : 1; s += wk * (fun === 'pdf' ? K.k(u) / bw : K.K(u)); }
    s /= sw;
    return fun === 'survivor' ? 1 - s : s;
  });
  const shape = args[1] !== undefined && !isText(args[1]) ? args[1].dims : [1, pts.length];
  const outs = [tensor('double', shape, Float64Array.from(f)), tensor('double', shape, Float64Array.from(pts)), num(bw)];
  return nargout <= 1 ? outs[0] : outs.slice(0, nargout);
}

// ------------------------------------------------------------- crosstab / grpstats / hist3

function crosstabFn(args, nargout) {
  if (!args.length) throw E('crosstab:notEnoughInputs', 'Not enough input arguments.');
  const gs = args.map((a) => groups(a));
  const n = gs[0].idx.length;
  if (gs.some((g) => g.idx.length !== n)) throw E('crosstab:lengthMismatch', 'All grouping variables must have the same length.');
  if (gs.length === 1) gs.push({ idx: new Int32Array(n), names: ['1'] });
  if (gs.length > 2) throw E('crosstab:tooMany', 'Only two grouping variables are supported.');
  const r = gs[0].names.length, c = gs[1].names.length;
  const tbl = new Float64Array(r * c);
  for (let k = 0; k < n; k++) { const a = gs[0].idx[k], b = gs[1].idx[k]; if (a >= 0 && b >= 0) tbl[a + b * r]++; }
  const N = tbl.reduce((s, v) => s + v, 0);
  let chi2 = 0;
  for (let a = 0; a < r; a++) for (let b = 0; b < c; b++) {
    let ra = 0, cb = 0; for (let q = 0; q < c; q++) ra += tbl[a + q * r]; for (let q = 0; q < r; q++) cb += tbl[q + b * r];
    const e = ra * cb / N; if (e > 0) chi2 += (tbl[a + b * r] - e) ** 2 / e;
  }
  const df = (r - 1) * (c - 1);
  const p = df > 0 ? chi2up(chi2, df) : 1;
  const L = Math.max(r, c); const labs = new Array(L * 2).fill(null);
  gs[0].names.forEach((s, k) => { labs[k] = str(s); }); gs[1].names.forEach((s, k) => { labs[k + L] = str(s); });
  const labels = cell([L, 2], labs.map((x) => x || tensor('double', [0, 0])));
  const outs = [matV(r, c, tbl), num(chi2), num(p), labels];
  return nargout <= 1 ? outs[0] : outs.slice(0, nargout);
}
const GRP = {
  mean: (a) => meanA(a), median: (a) => medianA(a), numel: (a) => a.length, std: (a) => Math.sqrt(varA(a)), var: (a) => varA(a),
  min: (a) => (a.length ? Math.min(...a) : NaN), max: (a) => (a.length ? Math.max(...a) : NaN), range: (a) => (a.length ? Math.max(...a) - Math.min(...a) : NaN),
  sem: (a) => Math.sqrt(varA(a) / a.length), sum: (a) => a.reduce((s, v) => s + v, 0),
};
function grpstatsFn(args, nargout) {
  const X = M2(args[0], 'grpstats');
  const g = args[1] === undefined || isEmptyV(args[1]) ? { idx: new Int32Array(X.m), names: ['1'] } : groups(args[1]);
  let which = ['mean'];
  if (args[2] !== undefined) which = isText(args[2]) ? [lstr(args[2])] : args[2].data.map((x) => toStr(x).toLowerCase());
  const G = g.names.length;
  const outs = which.map((w) => {
    if (w === 'gname') return cellStr(g.names, [G, 1]);
    const f = GRP[w]; if (!f) throw E('grpstats:badStat', `Unknown statistic '${w}'.`);
    const res = new Float64Array(G * X.n);
    for (let j = 0; j < X.n; j++) for (let k = 0; k < G; k++) {
      const a = []; for (let i = 0; i < X.m; i++) if (g.idx[i] === k) { const v = X.a[i + j * X.m]; if (v === v) a.push(v); }
      res[k + j * G] = f(a);
    }
    return matV(G, X.n, res);
  });
  return nargout <= 1 ? outs[0] : outs.slice(0, Math.max(1, nargout));
}
function hist3Fn(args, nargout, ctx) {
  const X = M2(args[0], 'hist3');
  if (X.n !== 2) throw E('hist3:badX', 'X must be a matrix with two columns.');
  let nb = [10, 10], ctrs = null, edges = null, i = 1;
  if (args[i] !== undefined && !isText(args[i])) { if (args[i].cls === 'cell') ctrs = args[i].data.map((c) => Array.from(F(c))); else { const b = F(args[i]); nb = [b[0], b.length > 1 ? b[1] : b[0]]; } i++; }
  const o = nv(args, i);
  if (o.nbins) { const b = F(o.nbins); nb = [b[0], b.length > 1 ? b[1] : b[0]]; }
  if (o.ctrs) ctrs = o.ctrs.data.map((c) => Array.from(F(c)));
  if (o.edges) edges = o.edges.data.map((c) => Array.from(F(c)));
  const xs = [], ys = []; for (let k = 0; k < X.m; k++) { const a = X.a[k], b = X.a[k + X.m]; if (a === a && b === b) { xs.push(a); ys.push(b); } }
  const mk = (v, n) => { let lo = Math.min(...v), hi = Math.max(...v); if (lo === hi) { lo -= 0.5; hi += 0.5; } const w = (hi - lo) / n; return Array.from({ length: n }, (_, k) => lo + w * (k + 0.5)); };
  if (!ctrs && !edges) ctrs = [mk(xs, nb[0]), mk(ys, nb[1])];
  const N = [], C = [];
  let bins;
  if (edges) {
    bins = edges.map((e) => (v) => { if (v < e[0] || v > e[e.length - 1]) return -1; let k = 0; while (k < e.length - 2 && v >= e[k + 1]) k++; return k; });
    C.push(edges[0].slice(0, -1).map((v, k) => (v + edges[0][k + 1]) / 2), edges[1].slice(0, -1).map((v, k) => (v + edges[1][k + 1]) / 2));
  } else {
    bins = ctrs.map((c) => (v) => { if (c.length === 1) return 0; let best = 0; for (let k = 0; k < c.length; k++) { const lo = k === 0 ? -Infinity : (c[k - 1] + c[k]) / 2, hi = k === c.length - 1 ? Infinity : (c[k] + c[k + 1]) / 2; if (v >= lo && v < hi) { best = k; break; } } return best; });
    C.push(ctrs[0], ctrs[1]);
  }
  const nx = C[0].length, ny = C[1].length; const cnt = new Float64Array(nx * ny);
  for (let k = 0; k < xs.length; k++) { const a = bins[0](xs[k]), b = bins[1](ys[k]); if (a >= 0 && b >= 0) cnt[a + b * nx]++; }
  N.push(matV(nx, ny, cnt));
  void ctx;
  return nargout >= 2 ? [N[0], cell([1, 2], [row(C[0]), row(C[1])])] : N[0];
}

// ------------------------------------------------------------- sampling

function weightedPick(g, cum) { const u = g.rand() * cum[cum.length - 1]; let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] > u) hi = m; else lo = m + 1; } return lo; }
function sampleIdx(ctx, n, k, replace, w) {
  const g = globalGen(ctx);
  if (!replace && k > n) throw E('randsample:sampleTooLarge', 'K must not exceed the population size when sampling without replacement.');
  const out = [];
  if (w) {
    if (w.length !== n) throw E('randsample:badWeights', 'Weights must have one entry per population element.');
    if (replace) { const cum = []; let s = 0; for (const x of w) cum.push(s += x); for (let i = 0; i < k; i++) out.push(weightedPick(g, cum)); }
    else { const ww = w.slice(); for (let i = 0; i < k; i++) { const cum = []; let s = 0; for (const x of ww) cum.push(s += x); const j = weightedPick(g, cum); out.push(j); ww[j] = 0; } }
  } else if (replace) for (let i = 0; i < k; i++) out.push(Math.floor(g.rand() * n));
  else { const p = Array.from({ length: n }, (_, i) => i); for (let i = 0; i < k; i++) { const j = i + Math.floor(g.rand() * (n - i)); [p[i], p[j]] = [p[j], p[i]]; out.push(p[i]); } }
  return out;
}
function randsampleFn(args, nargout, ctx) {
  if (args.length < 2) throw E('randsample:notEnoughInputs', 'Not enough input arguments.');
  const pop = F(args[0]); const k = F(args[1])[0];
  const isPop = pop.length > 1;
  const n = isPop ? pop.length : pop[0];
  const replace = args[2] !== undefined && !isEmptyV(args[2]) ? !!F(args[2])[0] : false;
  const w = args[3] !== undefined ? Array.from(F(args[3])) : null;
  const idx = sampleIdx(ctx, n, k, replace || false, w);
  return col(idx.map((i) => (isPop ? pop[i] : i + 1)));
}
function datasampleFn(args, nargout, ctx) {
  if (args.length < 2) throw E('datasample:notEnoughInputs', 'Not enough input arguments.');
  const data = args[0]; const k = F(args[1])[0];
  let i = 2, dim = null;
  if (args[i] !== undefined && !isText(args[i])) { dim = F(args[i])[0] - 1; i++; }
  const o = nv(args, i);
  const replace = o.replace !== undefined ? !!F(o.replace)[0] : true;
  const w = o.weights ? Array.from(F(o.weights)) : null;
  const d = data.dims;
  const isVec = d.length === 2 && (d[0] === 1 || d[1] === 1);
  if (dim === null) dim = isVec ? (d[0] === 1 ? 1 : 0) : 0;
  const n = d[dim];
  const idx = sampleIdx(ctx, n, k, replace, w);
  const iv = col(idx.map((q) => q + 1));
  const colon = str(':');
  const subs = dim === 0 ? [iv, colon] : [colon, iv];
  const S = { cls: 'struct', dims: [1, 1], fields: ['type', 'subs'], data: [{ type: str('()'), subs: cell([1, 2], subs) }] };
  const y = call1(ctx, 'subsref', [data, S]);
  return nargout >= 2 ? [y, isVec && d[0] === 1 ? row(idx.map((q) => q + 1)) : iv] : y;
}
function bootstrpFn(args, nargout, ctx) {
  if (args.length < 3) throw E('bootstrp:notEnoughInputs', 'Not enough input arguments.');
  const nboot = F(args[0])[0]; const fun = args[1]; const data = args.slice(2).filter((a) => !isText(a));
  const n = data[0].dims[0] === 1 && data[0].dims.length === 2 ? data[0].dims[1] : data[0].dims[0];
  const g = globalGen(ctx);
  const rowsSel = (v, idx) => {
    const isRowV = v.dims[0] === 1 && v.dims.length === 2;
    const iv = col(idx.map((q) => q + 1)); const colon = str(':');
    const S = { cls: 'struct', dims: [1, 1], fields: ['type', 'subs'], data: [{ type: str('()'), subs: cell([1, isRowV ? 1 : 2], isRowV ? [iv] : [iv, colon]) }] };
    return call1(ctx, 'subsref', [v, S]);
  };
  const stats = [], sam = [];
  for (let b = 0; b < nboot; b++) {
    const idx = Array.from({ length: n }, () => Math.floor(g.rand() * n));
    sam.push(idx);
    if (fun && !isEmptyV(fun)) { const r = toTensor(call1(ctx, fun, data.map((v) => rowsSel(v, idx)))); stats.push(Array.from(r.re)); }
    ctx.checkInterrupt();
  }
  const w = stats.length ? stats[0].length : 0;
  const bs = new Float64Array(nboot * w); stats.forEach((s, b) => s.forEach((v, j) => { bs[b + j * nboot] = v; }));
  const outs = [matV(nboot, w, bs)];
  if (nargout >= 2) { const sm = new Float64Array(n * nboot); sam.forEach((s, b) => s.forEach((q, i) => { sm[i + b * n] = q + 1; })); outs.push(matV(n, nboot, sm)); }
  return nargout <= 1 ? outs[0] : outs;
}
function randgFn(args, nargout, ctx) {
  const a = args.length ? T(args[0], 'randg') : num(1);
  const g = globalGen(ctx);
  let dims = a.dims;
  if (args.length > 1) { const s = args.slice(1).flatMap((v) => Array.from(F(v))); dims = s.length === 1 ? [s[0], s[0]] : s; }
  const n = dims.reduce((x, y) => x * y, 1);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = gammaRnd(g, a.re.length === 1 ? a.re[0] : a.re[i]);
  return tensor('double', dims, out);
}

// ------------------------------------------------------------- regression

function designRows(Xm, addConst) { return rowsOf(Xm).map((r) => (addConst ? [1, ...r] : r)); }
const WFUN = {
  bisquare: [(r) => (Math.abs(r) < 1 ? (1 - r * r) ** 2 : 0), 4.685], andrews: [(r) => (Math.abs(r) < Math.PI ? Math.sin(r) / r || 1 : 0), 1.339],
  cauchy: [(r) => 1 / (1 + r * r), 2.385], fair: [(r) => 1 / (1 + Math.abs(r)), 1.4], huber: [(r) => 1 / Math.max(1, Math.abs(r)), 1.345],
  logistic: [(r) => (r === 0 ? 1 : Math.tanh(r) / r), 1.205], talwar: [(r) => (Math.abs(r) < 1 ? 1 : 0), 2.795], welsch: [(r) => Math.exp(-r * r), 2.985],
  ols: [() => 1, 1],
};
function robustfitFn(args, nargout) {
  if (args.length < 2) throw E('robustfit:notEnoughInputs', 'Not enough input arguments.');
  const Xm = M2(args[0], 'robustfit'); const y = Array.from(F(args[1]));
  const wname = args[2] !== undefined && !isEmptyV(args[2]) ? lstr(args[2]) : 'bisquare';
  const W = WFUN[wname]; if (!W) throw E('robustfit:badWeight', `Unknown weight function '${wname}'.`);
  const tune = args[3] !== undefined && !isEmptyV(args[3]) ? F(args[3])[0] : W[1];
  const addC = args[4] === undefined || lstr(args[4]) === 'on' || (!isText(args[4]) && F(args[4])[0] !== 0);
  const X = designRows(Xm, addC); const n = X.length, p = X[0].length;
  let { beta, A } = wls(X, y);
  // leverage-adjusted residuals
  const Ainv = invSym(A);
  const h = X.map((xi) => { let s = 0; for (let r = 0; r < p; r++) for (let c = 0; c < p; c++) s += xi[r] * Ainv[r][c] * xi[c]; return Math.min(s, 0.9999); });
  const adj = h.map((v) => 1 / Math.sqrt(1 - v));
  let w = new Array(n).fill(1), s = 1;
  for (let it = 0; it < 50; it++) {
    const res = X.map((xi, i) => y[i] - xi.reduce((a, v, j) => a + v * beta[j], 0));
    const ra = res.map((r, i) => r * adj[i]);
    const absr = ra.map(Math.abs).sort((a, b) => a - b);
    s = medianA(absr.slice(p - 1 >= 0 ? Math.max(0, p - 1) : 0)) / 0.6745 || medianA(absr) / 0.6745 || 1;
    w = ra.map((r) => W[0](r / (tune * s)));
    const nb = wls(X, y, w).beta;
    const delta = Math.max(...nb.map((b, j) => Math.abs(b - beta[j])));
    beta = nb;
    if (delta < 1e-8 * Math.max(1, ...beta.map(Math.abs))) break;
  }
  const out = col(Array.from(beta));
  if (nargout < 2) return out;
  const res = X.map((xi, i) => y[i] - xi.reduce((a, v, j) => a + v * beta[j], 0));
  const st = struct([1, 1], ['s', 'resid', 'w', 'dfe'], [{ s: num(s), resid: col(res), w: col(w), dfe: num(n - p) }]);
  return [out, st];
}
function ridgeFn(args) {
  if (args.length < 3) throw E('ridge:notEnoughInputs', 'Not enough input arguments.');
  const y = Array.from(F(args[0])); const Xm = M2(args[1], 'ridge'); const ks = Array.from(F(args[2]));
  const scaled = args[3] !== undefined ? F(args[3])[0] : 1;
  const n = Xm.m, p = Xm.n;
  const mu = new Float64Array(p), sd = new Float64Array(p);
  for (let j = 0; j < p; j++) { const c = Array.from(Xm.a.subarray(j * n, (j + 1) * n)); mu[j] = meanA(c); sd[j] = Math.sqrt(varA(c)) || 1; }
  const Z = Array.from({ length: n }, (_, i) => Array.from({ length: p }, (_, j) => (Xm.a[i + j * n] - mu[j]) / sd[j]));
  const my = meanA(y);
  const rows = scaled ? p : p + 1;
  const B = new Float64Array(rows * ks.length);
  ks.forEach((k, c) => {
    const b = wls(Z, y.map((v) => v - my), null, k).beta;
    if (scaled) for (let j = 0; j < p; j++) B[j + c * rows] = b[j];
    else { let b0 = my; for (let j = 0; j < p; j++) { const bj = b[j] / sd[j]; B[j + 1 + c * rows] = bj; b0 -= mu[j] * bj; } B[c * rows] = b0; }
  });
  return matV(rows, ks.length, B);
}
function lassoFn(args, nargout) {
  if (args.length < 2) throw E('lasso:notEnoughInputs', 'Not enough input arguments.');
  const Xm = M2(args[0], 'lasso'); const y = Array.from(F(args[1]));
  const o = nv(args, 2);
  const alpha = o.alpha ? F(o.alpha)[0] : 1;
  const standardize = o.standardize === undefined ? true : !!F(o.standardize)[0];
  const n = Xm.m, p = Xm.n;
  const mu = new Float64Array(p), sd = new Float64Array(p).fill(1);
  for (let j = 0; j < p; j++) { const c = Array.from(Xm.a.subarray(j * n, (j + 1) * n)); mu[j] = meanA(c); if (standardize) sd[j] = Math.sqrt(varA(c, 1)) || 1; }
  const Z = Array.from({ length: p }, (_, j) => Float64Array.from({ length: n }, (_, i) => (Xm.a[i + j * n] - mu[j]) / sd[j]));
  const my = meanA(y); const yc = y.map((v) => v - my);
  let lambdas;
  if (o.lambda) lambdas = Array.from(F(o.lambda)).sort((a, b) => b - a);
  else {
    let lmax = 0; for (let j = 0; j < p; j++) { let s = 0; for (let i = 0; i < n; i++) s += Z[j][i] * yc[i]; lmax = Math.max(lmax, Math.abs(s) / (n * alpha)); }
    const nl = o.numlambda ? F(o.numlambda)[0] : 100; const ratio = o.lambdaratio ? F(o.lambdaratio)[0] : 1e-4;
    lambdas = Array.from({ length: nl }, (_, k) => lmax * Math.pow(ratio, k / (nl - 1)));
  }
  const zz = Z.map((z) => z.reduce((a, v) => a + v * v, 0) / n);
  const beta = new Float64Array(p); const r = Float64Array.from(yc);
  const Bs = [], mse = [], df = [], icp = [];
  for (const lam of lambdas) {
    for (let it = 0; it < 10000; it++) {
      let maxd = 0;
      for (let j = 0; j < p; j++) {
        let rho = 0; const z = Z[j]; for (let i = 0; i < n; i++) rho += z[i] * r[i];
        rho = rho / n + zz[j] * beta[j];
        const st = Math.sign(rho) * Math.max(0, Math.abs(rho) - lam * alpha);
        const nb = st / (zz[j] + lam * (1 - alpha));
        const d = nb - beta[j];
        if (d) { for (let i = 0; i < n; i++) r[i] -= d * z[i]; beta[j] = nb; maxd = Math.max(maxd, Math.abs(d)); }
      }
      if (maxd < 1e-10) break;
    }
    const b = Array.from(beta, (v, j) => v / sd[j]);
    Bs.push(b); df.push(b.filter((v) => v !== 0).length);
    icp.push(my - b.reduce((a, v, j) => a + v * mu[j], 0));
    mse.push(r.reduce((a, v) => a + v * v, 0) / n);
  }
  // output in increasing lambda order
  const order = lambdas.map((_, k) => k).reverse();
  const L = order.length;
  const B = new Float64Array(p * L); order.forEach((k, c) => Bs[k].forEach((v, j) => { B[j + c * p] = v; }));
  const out = matV(p, L, B);
  if (nargout < 2) return out;
  const fi = struct([1, 1], ['Intercept', 'Lambda', 'Alpha', 'DF', 'MSE'], [{ Intercept: row(order.map((k) => icp[k])), Lambda: row(order.map((k) => lambdas[k])), Alpha: num(alpha), DF: row(order.map((k) => df[k])), MSE: row(order.map((k) => mse[k])) }]);
  return [out, fi];
}
function nlinfitFn(args, nargout, ctx) {
  if (args.length < 4) throw E('nlinfit:notEnoughInputs', 'Not enough input arguments.');
  const X = args[0], yv = T(args[1], 'nlinfit'), fun = args[2];
  if (!isFuncHandle(fun)) throw E('nlinfit:badModel', 'MODELFUN must be a function handle.');
  const y = Array.from(yv.re); let b = Array.from(F(args[3]));
  const p = b.length, n = y.length;
  const opts = args[4] && args[4].cls === 'struct' ? args[4] : null;
  const maxIter = opts && opts.data[0].MaxIter && !isEmptyV(opts.data[0].MaxIter) ? F(opts.data[0].MaxIter)[0] : 100;
  const f = (beta) => Array.from(toTensor(call1(ctx, fun, [tensor('double', args[3].dims, Float64Array.from(beta)), X])).re);
  const sse = (r) => r.reduce((a, v) => a + v * v, 0);
  const jac = (beta, f0) => { const J = Array.from({ length: n }, () => new Array(p)); for (let j = 0; j < p; j++) { const h = 1e-7 * Math.max(1, Math.abs(beta[j])); const bb = beta.slice(); bb[j] += h; const f1 = f(bb); for (let i = 0; i < n; i++) J[i][j] = (f1[i] - f0[i]) / h; } return J; };
  let f0 = f(b), r = y.map((v, i) => v - f0[i]), s0 = sse(r), lam = 0.01;
  let J = jac(b, f0);
  for (let it = 0; it < maxIter; it++) {
    const JtJ = Array.from({ length: p }, () => new Float64Array(p)), Jtr = new Float64Array(p);
    for (let i = 0; i < n; i++) for (let a = 0; a < p; a++) { Jtr[a] += J[i][a] * r[i]; for (let c = 0; c < p; c++) JtJ[a][c] += J[i][a] * J[i][c]; }
    let improved = false;
    for (let tries = 0; tries < 20; tries++) {
      const A = JtJ.map((rr, a) => { const q = Float64Array.from(rr); q[a] += lam * (rr[a] || 1); return q; });
      const step = solveSym(A, Jtr);
      const nb = b.map((v, j) => v + step[j]);
      const f1 = f(nb); const r1 = y.map((v, i) => v - f1[i]); const s1 = sse(r1);
      if (s1 <= s0) {
        const rel = Math.max(...step.map((d, j) => Math.abs(d) / (Math.abs(b[j]) + 1e-8)));
        b = nb; f0 = f1; r = r1; const ds = s0 - s1; s0 = s1; lam = Math.max(lam / 10, 1e-12); improved = true;
        J = jac(b, f0);
        if (rel < 1e-8 || ds <= 1e-14 * Math.max(1, s0)) it = maxIter;
        break;
      }
      lam *= 10;
    }
    if (!improved) break;
    ctx.checkInterrupt();
  }
  const outs = [tensor('double', args[3].dims, Float64Array.from(b)), tensor('double', yv.dims, Float64Array.from(r))];
  if (nargout >= 3) { const Ja = new Float64Array(n * p); for (let i = 0; i < n; i++) for (let j = 0; j < p; j++) Ja[i + j * n] = J[i][j]; outs.push(matV(n, p, Ja)); }
  if (nargout >= 4) {
    const JtJ = Array.from({ length: p }, () => new Float64Array(p)); for (let i = 0; i < n; i++) for (let a = 0; a < p; a++) for (let c = 0; c < p; c++) JtJ[a][c] += J[i][a] * J[i][c];
    const mse = s0 / Math.max(1, n - p); const C = invSym(JtJ); const cv = new Float64Array(p * p); for (let a = 0; a < p; a++) for (let c = 0; c < p; c++) cv[a + c * p] = C[a][c] * mse;
    outs.push(matV(p, p, cv), num(mse));
  }
  return nargout <= 1 ? outs[0] : outs.slice(0, nargout);
}
const LINKS = {
  identity: { f: (m) => m, inv: (e) => e, d: () => 1 },
  log: { f: (m) => Math.log(m), inv: (e) => Math.exp(e), d: (m) => 1 / m },
  logit: { f: (m) => Math.log(m / (1 - m)), inv: (e) => 1 / (1 + Math.exp(-e)), d: (m) => 1 / (m * (1 - m)) },
  probit: { f: (m) => DIST.norm.inv(m, [0, 1]), inv: (e) => 0.5 * (1 + erfJS(e / Math.SQRT2)), d: (m) => { const z = DIST.norm.inv(m, [0, 1]); return Math.sqrt(2 * Math.PI) * Math.exp(0.5 * z * z); } },
  comploglog: { f: (m) => Math.log(-Math.log(1 - m)), inv: (e) => 1 - Math.exp(-Math.exp(e)), d: (m) => -1 / ((1 - m) * Math.log(1 - m)) },
  reciprocal: { f: (m) => 1 / m, inv: (e) => 1 / e, d: (m) => -1 / (m * m) },
};
const FAMILY = {
  normal: { v: () => 1, link: 'identity', dev: (y, m) => (y - m) ** 2 },
  binomial: { v: (m) => m * (1 - m), link: 'logit', dev: (y, m) => 2 * ((y > 0 ? y * Math.log(y / m) : 0) + (y < 1 ? (1 - y) * Math.log((1 - y) / (1 - m)) : 0)) },
  poisson: { v: (m) => m, link: 'log', dev: (y, m) => 2 * ((y > 0 ? y * Math.log(y / m) : 0) - (y - m)) },
  gamma: { v: (m) => m * m, link: 'reciprocal', dev: (y, m) => 2 * (-Math.log(y / m) + (y - m) / m) },
  inverse: { v: (m) => m ** 3, link: 'reciprocal', dev: (y, m) => (y - m) ** 2 / (y * m * m) },
};
function linkOf(v, def) {
  if (v == null) return LINKS[def];
  const s = lstr(v); if (s === null) { const pw = F(v)[0]; return pw === 0 ? LINKS.log : { f: (m) => m ** pw, inv: (e) => e ** (1 / pw), d: (m) => pw * m ** (pw - 1) }; }
  if (!LINKS[s]) throw E('glmfit:badLink', `Unknown link '${s}'.`);
  return LINKS[s];
}
function glmfitFn(args, nargout) {
  if (args.length < 3) throw E('glmfit:notEnoughInputs', 'Not enough input arguments.');
  const Xm = M2(args[0], 'glmfit'); let yt = T(args[1], 'glmfit');
  const fam = lstr(args[2]); const F0 = FAMILY[fam]; if (!F0) throw E('glmfit:badDistribution', `Unknown distribution '${fam}'.`);
  const o = nv(args, 3);
  let y, N = null;
  if (fam === 'binomial' && yt.dims[1] === 2) { const m = yt.dims[0]; y = Array.from({ length: m }, (_, i) => yt.re[i] / yt.re[i + m]); N = Array.from({ length: m }, (_, i) => yt.re[i + m]); }
  else y = Array.from(yt.re);
  const L = linkOf(o.link, F0.link);
  const addC = o.constant === undefined || lstr(o.constant) !== 'off';
  const X = designRows(Xm, addC); const n = X.length, p = X[0].length;
  const wts = N || new Array(n).fill(1);
  let mu = y.map((v) => (fam === 'binomial' ? (v * 0.98 + 0.01) : fam === 'normal' ? v : Math.max(v, 0.1)));
  let eta = mu.map(L.f); let b = new Float64Array(p);
  for (let it = 0; it < 100; it++) {
    const z = [], w = [];
    for (let i = 0; i < n; i++) { const g = L.d(mu[i]); z.push(eta[i] + (y[i] - mu[i]) * g); w.push(wts[i] / (g * g * F0.v(mu[i]))); }
    const nb = wls(X, z, w).beta;
    const d = Math.max(...Array.from(nb, (v, j) => Math.abs(v - b[j])));
    b = nb; eta = X.map((xi) => xi.reduce((a, v, j) => a + v * b[j], 0)); mu = eta.map(L.inv);
    if (fam === 'binomial') mu = mu.map((m) => Math.min(Math.max(m, 1e-12), 1 - 1e-12));
    if (d < 1e-10 * Math.max(1, ...Array.from(b, Math.abs))) break;
  }
  const dev = y.reduce((a, v, i) => a + wts[i] * F0.dev(v, mu[i]), 0);
  const outs = [col(Array.from(b)), num(dev)];
  if (nargout >= 3) {
    const w = mu.map((m, i) => { const g = L.d(m); return wts[i] / (g * g * F0.v(m)); });
    const { A } = wls(X, y, w); const Ci = invSym(A);
    const dfe = n - p; const sfit = fam === 'normal' || fam === 'gamma' || fam === 'inverse' ? Math.sqrt(dev / dfe) : 1;
    const se = Array.from({ length: p }, (_, j) => Math.sqrt(Ci[j][j]) * sfit);
    const t = Array.from(b, (v, j) => v / se[j]);
    const pv = t.map((v) => (sfit !== 1 || fam === 'normal' ? 2 * tUp(Math.abs(v), dfe) : 2 * 0.5 * (1 - erfJS(Math.abs(v) / Math.SQRT2))));
    outs.push(struct([1, 1], ['beta', 'dfe', 'sfit', 's', 'se', 't', 'p', 'resid'], [{ beta: col(Array.from(b)), dfe: num(dfe), sfit: num(sfit), s: num(sfit), se: col(se), t: col(t), p: col(pv), resid: col(y.map((v, i) => v - mu[i])) }]));
  }
  return nargout <= 1 ? outs[0] : outs.slice(0, nargout);
}
function glmvalFn(args) {
  if (args.length < 3) throw E('glmval:notEnoughInputs', 'Not enough input arguments.');
  const b = Array.from(F(args[0])); const Xm = M2(args[1], 'glmval');
  const L = linkOf(args[2], 'identity');
  const o = nv(args, 3);
  const addC = o.constant === undefined || lstr(o.constant) !== 'off';
  const X = designRows(Xm, addC);
  const yh = X.map((xi) => L.inv(xi.reduce((a, v, j) => a + v * b[j], 0)));
  return col(yh);
}

// ------------------------------------------------------------- nearest neighbours

function distFn(name, P) {
  switch (name) {
    case 'euclidean': return (a, b) => Math.sqrt(a.reduce((s, v, j) => s + (v - b[j]) ** 2, 0));
    case 'seuclidean': return (a, b) => Math.sqrt(a.reduce((s, v, j) => s + (v - b[j]) ** 2, 0));
    case 'cityblock': return (a, b) => a.reduce((s, v, j) => s + Math.abs(v - b[j]), 0);
    case 'chebychev': return (a, b) => a.reduce((s, v, j) => Math.max(s, Math.abs(v - b[j])), 0);
    case 'minkowski': return (a, b) => Math.pow(a.reduce((s, v, j) => s + Math.abs(v - b[j]) ** P, 0), 1 / P);
    case 'cosine': return (a, b) => { let d = 0, na = 0, nb = 0; a.forEach((v, j) => { d += v * b[j]; na += v * v; nb += b[j] * b[j]; }); return 1 - d / Math.sqrt(na * nb); };
    default: throw E('knnsearch:badDistance', `Unknown distance '${name}'.`);
  }
}
function knnArgs(args, fn) {
  if (args.length < 2) throw E(`${fn}:notEnoughInputs`, 'Not enough input arguments.');
  const X = rowsOf(M2(args[0], fn, false)), Y = rowsOf(M2(args[1], fn, false));
  if (X.length && Y.length && X[0].length !== Y[0].length) throw E(`${fn}:dimMismatch`, 'X and Y must have the same number of columns.');
  return { X, Y };
}
function knnsearchFn(args, nargout) {
  const { X, Y } = knnArgs(args, 'knnsearch');
  const o = nv(args, 2);
  const k = o.k ? F(o.k)[0] : 1; const d = distFn(o.distance ? lstr(o.distance) : 'euclidean', o.p ? F(o.p)[0] : 2);
  const kk = Math.min(k, X.length);
  const I = new Float64Array(Y.length * kk), D = new Float64Array(Y.length * kk);
  Y.forEach((y, q) => {
    const ds = X.map((x, i) => [d(x, y), i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (let j = 0; j < kk; j++) { I[q + j * Y.length] = ds[j][1] + 1; D[q + j * Y.length] = ds[j][0]; }
  });
  const outs = [matV(Y.length, kk, I), matV(Y.length, kk, D)];
  return nargout <= 1 ? outs[0] : outs;
}
function rangesearchFn(args, nargout) {
  const { X, Y } = knnArgs(args, 'rangesearch');
  if (args[2] === undefined) throw E('rangesearch:notEnoughInputs', 'Not enough input arguments.');
  const r = F(args[2])[0]; const o = nv(args, 3);
  const d = distFn(o.distance ? lstr(o.distance) : 'euclidean', o.p ? F(o.p)[0] : 2);
  const idx = [], dist = [];
  Y.forEach((y) => { const ds = X.map((x, i) => [d(x, y), i]).filter((e) => e[0] <= r).sort((a, b) => a[0] - b[0] || a[1] - b[1]); idx.push(row(ds.map((e) => e[1] + 1))); dist.push(row(ds.map((e) => e[0]))); });
  const outs = [cell([Y.length, 1], idx), cell([Y.length, 1], dist)];
  return nargout <= 1 ? outs[0] : outs;
}

// ------------------------------------------------------------- tests

function jbtestFn(args, nargout) {
  const x = Array.from(T(args[0], 'jbtest').re).filter((v) => v === v);
  const alpha = args[1] !== undefined && !isEmptyV(args[1]) ? F(args[1])[0] : 0.05;
  const n = x.length, m = meanA(x);
  let m2 = 0, m3 = 0, m4 = 0; for (const v of x) { const d = v - m; m2 += d * d; m3 += d ** 3; m4 += d ** 4; }
  m2 /= n; m3 /= n; m4 /= n;
  const S = m3 / m2 ** 1.5, K = m4 / (m2 * m2);
  const jb = n / 6 * (S * S + (K - 3) ** 2 / 4);
  const p = chi2up(jb, 2); const crit = DIST.chi2.inv(1 - alpha, [2]);
  const outs = [num(p < alpha ? 1 : 0), num(p), num(jb), num(crit)];
  return nargout <= 1 ? outs[0] : outs.slice(0, nargout);
}
function lillietestFn(args, nargout) {
  const x = Array.from(T(args[0], 'lillietest').re).filter((v) => v === v);
  const alpha = args[1] !== undefined && !isEmptyV(args[1]) ? F(args[1])[0] : 0.05;
  const n = x.length, m = meanA(x), s = Math.sqrt(varA(x));
  const z = sorted(x.map((v) => (v - m) / s));
  let D = 0;
  for (let i = 0; i < n; i++) { const Fz = 0.5 * (1 + erfJS(z[i] / Math.SQRT2)); D = Math.max(D, (i + 1) / n - Fz, Fz - i / n); }
  // Dallal-Wilkinson approximation of the p-value
  let nn = n, Dd = D;
  if (n > 100) { Dd = D * Math.pow(n / 100, 0.49); nn = 100; }
  let p = Math.exp(-7.01256 * Dd * Dd * (nn + 2.78019) + 2.99587 * Dd * Math.sqrt(nn + 2.78019) - 0.122119 + 0.974598 / Math.sqrt(nn) + 1.67997 / nn);
  if (p > 0.1) { const kk = (Math.sqrt(n) - 0.01 + 0.85 / Math.sqrt(n)) * D; p = kk <= 0.302 ? 1 : kk <= 0.5 ? 2.76773 - 19.828315 * kk + 80.709644 * kk ** 2 - 138.55152 * kk ** 3 + 81.218052 * kk ** 4 : kk <= 0.9 ? -4.901232 + 40.662806 * kk - 97.490286 * kk ** 2 + 94.029866 * kk ** 3 - 32.355711 * kk ** 4 : kk <= 1.31 ? 6.198765 - 19.558097 * kk + 23.186922 * kk ** 2 - 12.234627 * kk ** 3 + 2.423045 * kk ** 4 : 0; p = Math.min(0.5, Math.max(0, p)); }
  const crit = 0.886 / Math.sqrt(n) * (alpha === 0.05 ? 1 : 1);
  const outs = [num(p < alpha ? 1 : 0), num(p), num(D), num(crit)];
  return nargout <= 1 ? outs[0] : outs.slice(0, nargout);
}
function friedmanFn(args, nargout) {
  const Xm = M2(args[0], 'friedman');
  const reps = args[1] !== undefined && !isEmptyV(args[1]) ? F(args[1])[0] : 1;
  const rows = Xm.m / reps, c = Xm.n;
  // rank within each block (rows of one replicate group)
  const R = new Float64Array(Xm.m * c);
  for (let b = 0; b < rows; b++) {
    const vals = []; for (let r = 0; r < reps; r++) for (let j = 0; j < c; j++) vals.push([Xm.a[b * reps + r + j * Xm.m], b * reps + r, j]);
    vals.sort((p, q) => p[0] - q[0]);
    for (let i = 0; i < vals.length;) { let k = i; while (k + 1 < vals.length && vals[k + 1][0] === vals[i][0]) k++; const rk = (i + k + 2) / 2; for (let q = i; q <= k; q++) R[vals[q][1] + vals[q][2] * Xm.m] = rk; i = k + 1; }
  }
  const N = Xm.m * c; const rbar = (N / rows + 1) / 2;
  let ssc = 0; for (let j = 0; j < c; j++) { let s = 0; for (let i = 0; i < Xm.m; i++) s += R[i + j * Xm.m]; ssc += reps * rows * ((s / Xm.m) - rbar) ** 2; }
  let sst = 0; for (let i = 0; i < N; i++) sst += (R[i] - rbar) ** 2;
  const sigma2 = sst / (N - rows);
  const chi = ssc / sigma2; const df = c - 1;
  const p = chi2up(chi, df);
  const tbl = cell([4, 6], [
    str('Source'), str('Columns'), str('Error'), str('Total'),
    str('SS'), num(ssc), num(sst - ssc), num(sst),
    str('df'), num(df), num(N - df - 1), num(N - 1),
    str('MS'), num(ssc / df), num((sst - ssc) / (N - df - 1)), tensor('double', [0, 0]),
    str('Chi-sq'), num(chi), tensor('double', [0, 0]), tensor('double', [0, 0]),
    str('Prob>Chi-sq'), num(p), tensor('double', [0, 0]), tensor('double', [0, 0]),
  ]);
  const outs = [num(p), tbl];
  return nargout <= 1 ? outs[0] : outs.slice(0, nargout);
}

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const builtins = {
  ecdf: ecdfFn,
  ksdensity: ksdensityFn,
  crosstab: crosstabFn,
  grpstats: grpstatsFn,
  hist3: hist3Fn,
  randsample: randsampleFn,
  datasample: datasampleFn,
  bootstrp: bootstrpFn,
  randg: randgFn,
  robustfit: robustfitFn,
  ridge: ridgeFn,
  lasso: lassoFn,
  nlinfit: nlinfitFn,
  glmfit: glmfitFn,
  glmval: glmvalFn,
  knnsearch: knnsearchFn,
  rangesearch: rangesearchFn,
  jbtest: jbtestFn,
  lillietest: lillietestFn,
  friedman: friedmanFn,
};
export const help = {
  ecdf: H('Empirical cumulative distribution function.', '경험적 누적 분포 함수.', ['[f, x] = ecdf(y)', "[f, x] = ecdf(y, 'Function', 'survivor')"]),
  ksdensity: H('Kernel smoothing density estimate.', '커널 평활 밀도 추정.', ['[f, xi] = ksdensity(x)', 'f = ksdensity(x, pts)', "[f, xi, bw] = ksdensity(..., 'Bandwidth', bw, 'Kernel', 'epanechnikov')", "f = ksdensity(..., 'Function', 'cdf')"]),
  crosstab: H('Cross-tabulation with a chi-square test of independence.', '교차표와 독립성 카이제곱 검정.', ['tbl = crosstab(x1, x2)', '[tbl, chi2, p, labels] = crosstab(x1, x2)']),
  grpstats: H('Summary statistics by group.', '그룹별 요약 통계.', ['means = grpstats(X, group)', "[m, s, n] = grpstats(X, group, {'mean', 'std', 'numel'})"]),
  hist3: H('Bivariate histogram counts.', '이변량 히스토그램 개수.', ['N = hist3(X)', 'N = hist3(X, nbins)', '[N, c] = hist3(X, ctrs)', "N = hist3(X, 'Edges', edges)"]),
  randsample: H('Random sample, with or without replacement.', '복원 또는 비복원 무작위 표본.', ['y = randsample(n, k)', 'y = randsample(population, k)', 'y = randsample(n, k, true)', 'y = randsample(n, k, true, w)']),
  datasample: H('Random sample of data rows (or elements).', '데이터 행(또는 원소)의 무작위 표본.', ['y = datasample(data, k)', "y = datasample(data, k, 'Replace', false)", "[y, idx] = datasample(..., 'Weights', w)"]),
  bootstrp: H('Bootstrap sampling of a statistic.', '통계량의 부트스트랩 표본 추출.', ['bootstat = bootstrp(nboot, bootfun, d)', '[bootstat, bootsam] = bootstrp(...)']),
  randg: H('Gamma random numbers with unit scale.', '단위 척도 감마 난수.', ['r = randg(a)', 'r = randg(a, m, n)']),
  robustfit: H('Robust linear regression (iteratively reweighted least squares).', '로버스트 선형 회귀 (반복 재가중 최소제곱).', ['b = robustfit(X, y)', "b = robustfit(X, y, 'huber')", '[b, stats] = robustfit(X, y, wfun, tune, const)']),
  ridge: H('Ridge regression.', '능형 회귀.', ['b = ridge(y, X, k)', 'b = ridge(y, X, k, 0)']),
  lasso: H('Lasso and elastic net regularized regression.', '라소와 엘라스틱넷 정규화 회귀.', ['B = lasso(X, y)', "[B, FitInfo] = lasso(X, y, 'Lambda', lambda)", "[B, FitInfo] = lasso(X, y, 'Alpha', 0.5)"]),
  nlinfit: H('Nonlinear regression (Levenberg-Marquardt).', '비선형 회귀 (Levenberg-Marquardt).', ['beta = nlinfit(X, y, modelfun, beta0)', '[beta, R, J, CovB, MSE] = nlinfit(...)']),
  glmfit: H('Generalized linear model fit (IRLS).', '일반화 선형 모형 적합 (IRLS).', ["b = glmfit(X, y, 'poisson')", "[b, dev, stats] = glmfit(X, [y n], 'binomial', 'Link', 'logit')"]),
  glmval: H('Generalized linear model predictions.', '일반화 선형 모형 예측.', ["yhat = glmval(b, X, 'logit')"]),
  knnsearch: H('k nearest neighbours.', 'k 개 최근접 이웃.', ['Idx = knnsearch(X, Y)', "[Idx, D] = knnsearch(X, Y, 'K', k, 'Distance', 'cityblock')"]),
  rangesearch: H('All neighbours within a distance.', '거리 내 모든 이웃.', ['Idx = rangesearch(X, Y, r)', '[Idx, D] = rangesearch(X, Y, r)']),
  jbtest: H('Jarque-Bera test of normality (asymptotic chi-square p-value).', 'Jarque-Bera 정규성 검정 (점근 카이제곱 p-값).', ['h = jbtest(x)', '[h, p, jbstat, critval] = jbtest(x, alpha)']),
  lillietest: H('Lilliefors test of normality.', 'Lilliefors 정규성 검정.', ['h = lillietest(x)', '[h, p, kstat, critval] = lillietest(x, alpha)']),
  friedman: H('Friedman test (nonparametric two-way ANOVA).', 'Friedman 검정 (비모수 이원 분산 분석).', ['p = friedman(X)', 'p = friedman(X, reps)', '[p, tbl] = friedman(...)']),
};
