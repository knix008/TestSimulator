// Octave's time-series and signal functions: ARCH/ARMA models, autoregression
// helpers, fractional differencing, Hurst exponent, spectral density
// estimates, Spencer smoothing, test tones, the Octave stft/synthesis pair,
// freqz_plot and the fftw planner settings.
import { tensor, prod, num, str, toNum, isText, toStr, isFuncHandle } from '../../../value.js';
import { E, F, H, isEmptyV, callFn } from '../_util.js';
import * as K from '../_kernels.js';
import { nrand } from '../random.js';
import { T, txt, colV, rowV, mat, rowsOf } from './_h.js';

const vecCol = (v, fn, what = 'X') => {
  const t = T(v, fn, what);
  if (t.dims.length !== 2 || (t.dims[0] !== 1 && t.dims[1] !== 1)) throw E(`${fn}:notVector`, `${fn}: ${what} must be a vector.`);
  return Array.from(t.re);
};
/** T×(k+1) autoregression design matrix (rows). */
function autoreg(y, k) {
  const Tn = y.length;
  return Array.from({ length: Tn }, (_, t) => [1, ...Array.from({ length: k }, (_, j) => (t - j - 1 >= 0 ? y[t - j - 1] : 0))]);
}
function autoreg_matrix(args) {
  if (args.length !== 2) throw E('autoreg_matrix:nargin', 'autoreg_matrix: expected autoreg_matrix(y, k).');
  const y = vecCol(args[0], 'autoreg_matrix', 'Y');
  const k = toNum(args[1]);
  if (!(k >= 0) || k !== Math.floor(k)) throw E('autoreg_matrix:badK', 'autoreg_matrix: K must be a non-negative integer.');
  return mat(autoreg(y, k), y.length, k + 1);
}
/** OLS of the column vector y on rows X: {b, e, s2}. */
function olsVec(y, X) {
  const Xt = K.T(X); const Z = K.mul(Xt, X);
  const b = K.chol(Z) ? K.solve(Z, K.mulv(Xt, y)) : K.mulv(K.pinv(X), y);
  const e = y.map((v, i) => v - K.dot(X[i], b));
  const k = X[0].length; const s2 = K.dot(e, e) / (y.length - k);
  return { b, e, s2 };
}

// ------------------------------------------------------------ ARCH / ARMA
function arch_rnd(args, nargout, ctx) {
  if (args.length !== 3) throw E('arch_rnd:nargin', 'arch_rnd: expected arch_rnd(a, b, t).');
  const a = Array.from(F(args[0])), b = Array.from(F(args[1])); const Tn = toNum(args[2]);
  if (!(Tn >= 1) || Tn !== Math.floor(Tn)) throw E('arch_rnd:badT', 'arch_rnd: T must be a positive integer.');
  if (!(a[0] > 0) || a.slice(1).some((v) => v < 0)) throw E('arch_rnd:badA', 'arch_rnd: A(1) must be positive and the other coefficients non-negative.');
  const la = a.length, lb = b.length;
  const h = new Float64Array(Tn), e = new Float64Array(Tn), y = new Float64Array(Tn);
  for (let t = 0; t < Tn; t++) {
    let ht = a[0]; for (let i = 1; i < la && t - i >= 0; i++) ht += a[i] * e[t - i] * e[t - i];
    h[t] = ht; e[t] = Math.sqrt(ht) * nrand(ctx);
    let yt = b[0] ?? 0; for (let i = 1; i < lb && t - i >= 0; i++) yt += b[i] * y[t - i];
    y[t] = yt + e[t];
  }
  return colV(y);
}
function arma_rnd(args, nargout, ctx) {
  if (args.length < 4 || args.length > 5) throw E('arma_rnd:nargin', 'arma_rnd: expected arma_rnd(a, b, v, t, n).');
  const a = Array.from(F(args[0])), b = Array.from(F(args[1])); const v = toNum(args[2]); const Tn = toNum(args[3]);
  const n = args.length > 4 && !isEmptyV(args[4]) ? toNum(args[4]) : 100;
  if (!(v >= 0)) throw E('arma_rnd:badV', 'arma_rnd: V must be a non-negative scalar.');
  if (!(Tn >= 1) || Tn !== Math.floor(Tn) || !(n >= 0) || n !== Math.floor(n)) throw E('arma_rnd:badT', 'arma_rnd: T and N must be integers.');
  const L = Tn + n; const e = Array.from({ length: L }, () => Math.sqrt(v) * nrand(ctx));
  const x = new Float64Array(L);
  for (let t = 0; t < L; t++) {
    let s = e[t]; for (let j = 0; j < b.length && t - j - 1 >= 0; j++) s += b[j] * e[t - j - 1];
    for (let j = 0; j < a.length && t - j - 1 >= 0; j++) s += a[j] * x[t - j - 1];
    x[t] = s;
  }
  return colV(Array.from(x.subarray(n)));
}
function arch_fit(args, nargout) {
  if (args.length < 3 || args.length > 7) throw E('arch_fit:nargin', 'arch_fit: expected arch_fit(y, x, p, iter, gamma, a0, b0).');
  const y = vecCol(args[0], 'arch_fit', 'Y'); const Tn = y.length;
  const xt = T(args[1], 'arch_fit', 'X');
  const X = xt.re.length === 1 ? autoreg(y, toNum(args[1])) : rowsOf(xt);
  if (X.length !== Tn) throw E('arch_fit:sizeMismatch', 'arch_fit: X must have as many rows as Y has elements.');
  const p = toNum(args[2]);
  if (!(p >= 1) || p !== Math.floor(p)) throw E('arch_fit:badP', 'arch_fit: P must be a positive integer.');
  const iter = args.length > 3 && !isEmptyV(args[3]) ? toNum(args[3]) : 50;
  const gamma = args.length > 4 && !isEmptyV(args[4]) ? toNum(args[4]) : 0.1;
  const k = X[0].length;
  let b = args.length > 6 && !isEmptyV(args[6]) ? Array.from(F(args[6])) : olsVec(y, X).b;
  let e = y.map((v, i) => v - K.dot(X[i], b));
  let a = args.length > 5 && !isEmptyV(args[5]) ? Array.from(F(args[5])) : olsVec(e.map((v) => v * v), autoreg(e.map((v) => v * v), p)).b;
  const fixA = () => { const v0 = e.reduce((s, v) => s + v * v, 0) / Tn; a[0] = Math.max(a[0], 1e-6 * v0 + 1e-300); for (let i = 1; i <= p; i++) a[i] = Math.max(0, a[i]); };
  fixA();
  for (let it = 0; it < iter; it++) {
    let esq = e.map((v) => v * v); let Z = autoreg(esq, p);
    let h = Z.map((z) => K.dot(z, a));
    // scoring step for b
    const n = Tn - p;
    const Xr = [], er = [];
    for (let s = 0; s < n; s++) {
      let sc = 1 / h[s], r2 = 1 / h[s];
      for (let j = 1; j <= p; j++) { const hj = h[s + j]; sc -= a[j] * (esq[s + j] / (hj * hj) - 1 / hj); r2 += 2 * a[j] * a[j] * esq[s] / (hj * hj); }
      const r = Math.sqrt(r2);
      Xr.push(X[s].map((v) => v * r)); er.push(e[s] * sc / r);
    }
    const db = K.mulv(K.pinv(Xr), er);
    b = b.map((v, i) => v + gamma * db[i]);
    e = y.map((v, i) => v - K.dot(X[i], b));
    esq = e.map((v) => v * v); Z = autoreg(esq, p);
    h = Z.map((z) => K.dot(z, a));
    const f = esq.map((v, t) => v / h[t] - 1);
    const Zt = Z.map((z, t) => z.map((v) => v / h[t]));
    const da = K.mulv(K.pinv(Zt), f);
    a = a.map((v, i) => v + gamma * da[i]);
    fixA();
  }
  return nargout >= 2 ? [colV(a), colV(b)] : colV(a);
}
function arch_test(args, nargout) {
  if (args.length !== 3) throw E('arch_test:nargin', 'arch_test: expected arch_test(y, x, p).');
  const y = vecCol(args[0], 'arch_test', 'Y'); const Tn = y.length;
  const xt = T(args[1], 'arch_test', 'X');
  const X = xt.re.length === 1 ? autoreg(y, toNum(args[1])) : rowsOf(xt);
  if (X.length !== Tn) throw E('arch_test:sizeMismatch', 'arch_test: X must have as many rows as Y has elements.');
  const p = toNum(args[2]);
  if (!(p >= 1) || p !== Math.floor(p)) throw E('arch_test:badP', 'arch_test: P must be a positive integer.');
  const { e, s2 } = olsVec(y, X);
  const Z = autoreg(e.map((v) => v * v), p);
  const f = e.map((v) => v * v / s2 - 1);
  const Ztf = K.mulv(K.T(Z), f);
  const lm = K.dot(Ztf, K.mulv(K.pinv(K.mul(K.T(Z), Z)), Ztf)) / 2;
  const pval = K.gammainc(lm / 2, p / 2, true);
  return nargout >= 2 ? [num(pval), num(lm)] : num(pval);
}

// ------------------------------------------------------------ autocovariance based
function durbinlevinson(args, nargout) {
  if (args.length !== 1 && args.length !== 3) throw E('durbinlevinson:nargin', 'durbinlevinson: expected durbinlevinson(c) or durbinlevinson(c, oldphi, oldv).');
  const c = Array.from(F(args[0]));
  // coefficient vectors are ordered from the highest lag down: [phi_tt, ..., phi_t1]
  const step = (old, v, t) => {
    if (c.length < t + 2) throw E('durbinlevinson:tooShort', 'durbinlevinson: C is too small.');
    if (v === 0) throw E('durbinlevinson:zeroV', 'durbinlevinson: OLDV = 0.');
    let s = c[t + 1]; for (let k = 0; k < t; k++) s -= old[k] * c[k + 1];
    const p0 = s / v; const nw = [p0];
    for (let i = 1; i <= t; i++) nw.push(old[i - 1] - p0 * old[t - i]);
    return [nw, (1 - p0 * p0) * v];
  };
  let phi, v;
  if (args.length === 3) {
    const old = Array.from(F(args[1])); [phi, v] = step(old, toNum(args[2]), old.length);
  } else {
    if (c.length < 2) throw E('durbinlevinson:tooShort', 'durbinlevinson: C must have at least two elements.');
    if (c[0] === 0) throw E('durbinlevinson:zeroV', 'durbinlevinson: C(1) = 0.');
    phi = [c[1] / c[0]]; v = (1 - phi[0] * phi[0]) * c[0];
    for (let t = 1; t < c.length - 1; t++) [phi, v] = step(phi, v, t);
  }
  return nargout >= 2 ? [rowV(phi), num(v)] : rowV(phi);
}
function yulewalker(args, nargout) {
  if (args.length !== 1) throw E('yulewalker:nargin', 'yulewalker: one input is required.');
  const c = Array.from(F(args[0])); const p = c.length - 1;
  if (p < 1) throw E('yulewalker:tooShort', 'yulewalker: C must contain at least two autocovariances.');
  const CP = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => c[Math.abs(i - j)]));
  const cp = c.slice(1);
  const a = K.solve(CP, cp);
  const v = c[0] - K.dot(a, cp);
  return nargout >= 2 ? [colV(a), num(v)] : colV(a);
}

// ------------------------------------------------------------ differencing, long memory
function fractdiff(args) {
  if (args.length !== 2) throw E('fractdiff:nargin', 'fractdiff: expected fractdiff(x, d).');
  const xt = T(args[0], 'fractdiff');
  let x = vecCol(xt, 'fractdiff');
  const d = toNum(args[1]);
  let dd = d;
  while (dd >= 1) { x = x.slice(1).map((v, i) => v - x[i]); dd -= 1; }
  let out = x;
  if (d > -1 && dd !== 0) {
    const N = 100; const w = [1]; for (let k = 1; k <= N; k++) w.push(w[k - 1] * (k - 1 - dd) / k);
    out = x.map((_, t) => { let s = 0; for (let k = 0; k <= Math.min(N, t); k++) s += w[k] * x[t - k]; return s; });
  }
  return xt.dims[0] === 1 ? rowV(out) : colV(out);
}
function diffpara(args, nargout) {
  if (args.length < 1 || args.length > 3) throw E('diffpara:nargin', 'diffpara: expected diffpara(x, a, b).');
  const t = T(args[0], 'diffpara');
  const isVec = t.dims.length === 2 && (t.dims[0] === 1 || t.dims[1] === 1);
  const n = isVec ? t.re.length : t.dims[0]; const kc = isVec ? 1 : t.re.length / n;
  let a, b;
  if (args.length === 1) { a = 0.5 * Math.sqrt(n); b = 1.5 * Math.sqrt(n); }
  else if (args.length === 2) { b = toNum(args[1]); a = 1; }
  else { a = toNum(args[1]); b = toNum(args[2]); }
  a = Math.max(1, Math.round(a)); b = Math.round(b);
  if (a > b) throw E('diffpara:badRange', 'diffpara: A must not exceed B.');
  if (b >= n / 2) throw E('diffpara:badRange', 'diffpara: B must be smaller than n/2.');
  const m = n - 1;
  const xr = Array.from({ length: m }, (_, j) => { const w = 2 * Math.PI * (j + 1) / n; return 2 * Math.log(Math.hypot(1 - Math.cos(w), Math.sin(w))); });
  const mx = xr.reduce((s, v) => s + v, 0) / m; const xc = xr.map((v) => v - mx);
  const d = [];
  for (let c = 0; c < kc; c++) {
    const col = Array.from(t.re.subarray(c * n, (c + 1) * n));
    const f = K.fft(col, null);
    const yl = Array.from({ length: m }, (_, j) => Math.log((f.re[j + 1] ** 2 + f.im[j + 1] ** 2) / n));
    const my = yl.reduce((s, v) => s + v, 0) / m; const yc = yl.map((v) => v - my);
    let sxy = 0, sxx = 0; for (let j = a - 1; j < b; j++) { sxy += xc[j] * yc[j]; sxx += xc[j] * xc[j]; }
    d.push(-sxy / sxx);
  }
  const dd = d.reduce((s, v) => s + v, 0) / d.length;
  return nargout >= 2 ? [rowV(d), num(dd)] : rowV(d);
}
function hurst(args) {
  if (args.length !== 1) throw E('hurst:nargin', 'hurst: one input is required.');
  const t = T(args[0], 'hurst');
  const isVec = t.dims.length === 2 && (t.dims[0] === 1 || t.dims[1] === 1);
  const n = isVec ? t.re.length : t.dims[0]; const kc = isVec ? 1 : t.re.length / n;
  if (n < 2) throw E('hurst:tooShort', 'hurst: X must have at least two observations.');
  const H2 = [];
  for (let c = 0; c < kc; c++) {
    const x = t.re.subarray(c * n, (c + 1) * n);
    const m = x.reduce((s, v) => s + v, 0) / n;
    let ss = 0; for (const v of x) ss += (v - m) ** 2; const sd = Math.sqrt(ss / (n - 1));
    let w = 0, mx = -Infinity, mn = Infinity; for (const v of x) { w += v - m; mx = Math.max(mx, w); mn = Math.min(mn, w); }
    H2.push(Math.log((mx - mn) / sd) / Math.log(n));
  }
  return kc === 1 ? num(H2[0]) : rowV(H2);
}

// ------------------------------------------------------------ spectral density estimates
function lagWindow(name, n, b, ctx, kind) {
  if (name === 'triangle' && kind === 'lw') return Array.from({ length: n }, (_, k) => Math.max(0, 1 - k * b));
  if (name === 'rectangle' && kind === 'lw') { const t = Math.floor(1 / b); return Array.from({ length: n }, (_, k) => (k < t ? 1 : 0)); }
  if (name === 'triangle' && kind === 'sw') return Array.from({ length: n }, (_, k) => { if (!k) return 1 / b; const l = 2 * Math.PI * k / n; return b * (Math.sin(l / (2 * b)) / Math.sin(l / 2)) ** 2; });
  if (name === 'rectangle' && kind === 'sw') return Array.from({ length: n }, (_, k) => { if (!k) return 2 / b + 1; const l = 2 * Math.PI * k / n; return Math.sin((2 / b + 1) * l / 2) / Math.sin(l / 2); });
  const r = callFn(ctx, `${name}_${kind}`, [num(n), num(b)], 1);
  const w = Array.from(F(r[0]));
  if (w.length !== n) throw E('spectral:badWindow', `The window function ${name}_${kind} must return ${n} values.`);
  return w;
}
function windowName(v, fn) {
  if (isFuncHandle(v)) return v;
  if (!isText(v)) throw E(`${fn}:badWin`, `${fn}: WIN must be the name of a window (e.g. "triangle", "rectangle").`);
  return toStr(v);
}
function spectral_adf(args, nargout, ctx) {
  if (args.length < 1 || args.length > 3) throw E('spectral_adf:nargin', 'spectral_adf: expected spectral_adf(c, win, b).');
  const c = vecCol(args[0], 'spectral_adf', 'C'); const cr = c.length;
  const b = args.length > 2 && !isEmptyV(args[2]) ? toNum(args[2]) : 1 / Math.ceil(Math.sqrt(cr));
  let w;
  if (args.length < 2 || isEmptyV(args[1])) w = lagWindow('triangle', cr, b, ctx, 'lw');
  else { const nm = windowName(args[1], 'spectral_adf'); w = typeof nm === 'string' ? lagWindow(nm, cr, b, ctx, 'lw') : Array.from(F(callFn(ctx, nm, [num(cr), num(b)], 1)[0])); }
  const cw = c.map((v, i) => v * w[i]);
  const f = K.fft(cw, null);
  const rows = Array.from({ length: cr }, (_, k) => [k / cr, 2 * f.re[k] - cw[0]]);
  return mat(rows, cr, 2);
}
function spectral_xdf(args, nargout, ctx) {
  if (args.length < 1 || args.length > 3) throw E('spectral_xdf:nargin', 'spectral_xdf: expected spectral_xdf(x, win, b).');
  const x0 = vecCol(args[0], 'spectral_xdf'); const xr = x0.length;
  const b = args.length > 2 && !isEmptyV(args[2]) ? toNum(args[2]) : 1 / Math.ceil(Math.sqrt(xr));
  let w;
  if (args.length < 2 || isEmptyV(args[1])) w = lagWindow('triangle', xr, b, ctx, 'sw');
  else { const nm = windowName(args[1], 'spectral_xdf'); w = typeof nm === 'string' ? lagWindow(nm, xr, b, ctx, 'sw') : Array.from(F(callFn(ctx, nm, [num(xr), num(b)], 1)[0])); }
  const m = x0.reduce((s, v) => s + v, 0) / xr; const x = x0.map((v) => v - m);
  const fx = K.fft(x, null);
  const per = Array.from({ length: xr }, (_, k) => (fx.re[k] ** 2 + fx.im[k] ** 2) / (xr * xr));
  const A = K.fft(per, null), B = K.fft(w, null);
  const pr = new Float64Array(xr), pi = new Float64Array(xr);
  for (let k = 0; k < xr; k++) { pr[k] = A.re[k] * B.re[k] - A.im[k] * B.im[k]; pi[k] = A.re[k] * B.im[k] + A.im[k] * B.re[k]; }
  const r = K.fft(pr, pi, true);
  const rows = Array.from({ length: xr }, (_, k) => [k / xr, r.re[k]]);
  return mat(rows, xr, 2);
}

// ------------------------------------------------------------ smoothing and test signals
function spencer(args) {
  if (args.length !== 1) throw E('spencer:nargin', 'spencer: one input is required.');
  const t = T(args[0], 'spencer');
  const isVec = t.dims.length === 2 && (t.dims[0] === 1 || t.dims[1] === 1);
  const n = isVec ? t.re.length : t.dims[0]; const c = isVec ? 1 : t.re.length / n;
  const w = [-3, -6, -5, 3, 21, 46, 67, 74, 67, 46, 21, 3, -5, -6, -3].map((v) => v / 320);
  const out = new Float64Array(t.re.length);
  for (let j = 0; j < c; j++) for (let i = 7; i < n - 7; i++) { let s = 0; for (let k = 0; k < 15; k++) s += w[k] * t.re[j * n + i - 7 + k]; out[j * n + i] = s; }
  return tensor('double', t.dims.slice(), out);
}
function sinetone(args) {
  if (args.length < 1 || args.length > 4) throw E('sinetone:nargin', 'sinetone: expected sinetone(freq, rate, sec, ampl).');
  const freq = Array.from(F(args[0]));
  const rate = args.length > 1 && !isEmptyV(args[1]) ? toNum(args[1]) : 8000;
  const sec = args.length > 2 && !isEmptyV(args[2]) ? toNum(args[2]) : 1;
  let ampl = args.length > 3 && !isEmptyV(args[3]) ? Array.from(F(args[3])) : [64];
  if (ampl.length === 1) ampl = freq.map(() => ampl[0]);
  if (ampl.length !== freq.length) throw E('sinetone:sizeMismatch', 'sinetone: FREQ and AMPL must have the same number of elements.');
  const ns = Math.round(rate * sec);
  const out = new Float64Array(ns * freq.length);
  freq.forEach((f, k) => { for (let i = 0; i < ns; i++) out[i + ns * k] = ampl[k] * Math.sin(2 * Math.PI * (i + 1) / rate * f); });
  return tensor('double', [ns, freq.length], out);
}
function sinewave(args) {
  if (args.length < 1 || args.length > 3) throw E('sinewave:nargin', 'sinewave: expected sinewave(m, n, d).');
  const m = toNum(args[0]);
  const n = args.length > 1 && !isEmptyV(args[1]) ? toNum(args[1]) : m;
  const d = args.length > 2 && !isEmptyV(args[2]) ? toNum(args[2]) : 0;
  if (!(m >= 0) || m !== Math.floor(m)) throw E('sinewave:badM', 'sinewave: M must be a non-negative integer.');
  return colV(Array.from({ length: m }, (_, i) => Math.sin(2 * Math.PI * (i + 1 + d - 1) / n)));
}

// ------------------------------------------------------------ Octave stft / synthesis
const hanningW = (N) => Array.from({ length: N }, (_, k) => 0.5 - 0.5 * Math.cos(2 * Math.PI * (k + 1) / (N + 1)));
const hammingW = (N) => (N === 1 ? [1] : Array.from({ length: N }, (_, k) => 0.54 - 0.46 * Math.cos(2 * Math.PI * k / (N - 1))));
function winCoef(type, N) { return type === 1 ? hanningW(N) : type === 2 ? hammingW(N) : new Array(N).fill(1); }
function stft(args, nargout) {
  if (args.length < 1 || args.length > 5) throw E('stft:nargin', 'stft: expected stft(x, win_size, inc, num_coef, win_type).');
  const x = vecCol(args[0], 'stft');
  const ws = args.length > 1 && !isEmptyV(args[1]) ? toNum(args[1]) : 80;
  const inc = args.length > 2 && !isEmptyV(args[2]) ? toNum(args[2]) : 24;
  const nc = args.length > 3 && !isEmptyV(args[3]) ? toNum(args[3]) : 64;
  let wt = 2;
  if (args.length > 4 && !isEmptyV(args[4])) {
    const s = txt(args[4]);
    if (s === null) wt = toNum(args[4]);
    else wt = s === 'hanning' || s === 'hann' ? 1 : s === 'hamming' ? 2 : s === 'rectangle' ? 3 : 0;
    if (![1, 2, 3].includes(wt)) throw E('stft:badWinType', 'stft: WIN_TYPE must be "hanning" (1), "hamming" (2) or "rectangle" (3).');
  }
  if (!(ws >= 1) || ws !== Math.floor(ws) || !(inc >= 1) || inc !== Math.floor(inc) || !(nc >= 1) || nc !== Math.floor(nc)) throw E('stft:badArg', 'stft: WIN_SIZE, INC and NUM_COEF must be positive integers.');
  if (nc > ws) throw E('stft:badNumCoef', 'stft: NUM_COEF must not be greater than WIN_SIZE.');
  if (x.length < ws) throw E('stft:tooShort', 'stft: X must be at least WIN_SIZE long.');
  const numWin = Math.trunc((x.length - ws) / inc);
  const wc = winCoef(wt, ws);
  const out = new Float64Array(nc * (numWin + 1));
  for (let i = 0; i <= numWin; i++) {
    const seg = Array.from({ length: ws }, (_, k) => x[i * inc + k] * wc[k]);
    const f = K.fft(seg, null);
    for (let k = 0; k < nc; k++) out[k + nc * i] = Math.hypot(f.re[k], f.im[k]);
  }
  const y = tensor('double', [nc, numWin + 1], out);
  return nargout >= 2 ? [y, rowV([ws, inc, wt])] : y;
}
function synthesis(args) {
  if (args.length !== 2) throw E('synthesis:nargin', 'synthesis: expected synthesis(y, c).');
  const c = Array.from(F(args[1]));
  if (c.length !== 3) throw E('synthesis:badC', 'synthesis: C must be a 3-element vector [win_size, inc, win_type].');
  const [ws, inc, wt] = c;
  if (inc > ws) throw E('synthesis:badC', 'synthesis: the increment must not exceed the window size.');
  if (![1, 2, 3].includes(wt)) throw E('synthesis:badC', 'synthesis: the window type must be 1, 2 or 3.');
  const yt = T(args[0], 'synthesis'); const m = yt.dims[0], nc = yt.re.length / (m || 1);
  const wc = winCoef(wt, ws);
  const st = Math.max(1, Math.trunc((ws - inc) / 2));
  if (st + inc - 1 > m) throw E('synthesis:tooFewCoef', 'synthesis: Y has too few rows for the window and increment.');
  const out = new Float64Array(inc * nc);
  for (let j = 0; j < nc; j++) {
    const r = K.fft(yt.re.subarray(j * m, (j + 1) * m), yt.im ? yt.im.subarray(j * m, (j + 1) * m) : null, true);
    for (let k = 0; k < inc; k++) out[k + inc * j] = r.re[st - 1 + k] / wc[st - 1 + k];
  }
  return colV(Array.from(out));
}

// ------------------------------------------------------------ freqz_plot, fftw
function unwrapA(p) { const o = p.slice(); for (let i = 1; i < o.length; i++) { let d = o[i] - o[i - 1]; while (d > Math.PI) { o[i] -= 2 * Math.PI; d -= 2 * Math.PI; } while (d < -Math.PI) { o[i] += 2 * Math.PI; d += 2 * Math.PI; } } return o; }
function freqz_plot(args, nargout, ctx) {
  if (args.length < 2 || args.length > 3) throw E('freqz_plot:nargin', 'freqz_plot: expected freqz_plot(w, h, freq_norm).');
  const w = Array.from(F(args[0])); const ht = T(args[1], 'freqz_plot', 'H');
  if (ht.re.length !== w.length) throw E('freqz_plot:sizeMismatch', 'freqz_plot: W and H must have the same length.');
  const norm = args.length > 2 && !isEmptyV(args[2]) && toNum(args[2]) !== 0;
  const n = w.length;
  const mag = w.map((_, i) => 20 * Math.log10(Math.hypot(ht.re[i], ht.im ? ht.im[i] : 0)));
  const ph = unwrapA(w.map((_, i) => Math.atan2(ht.im ? ht.im[i] : 0, ht.re[i]))).map((v) => v * 180 / Math.PI);
  const finite = mag.filter(Number.isFinite); const maxmag = finite.length ? Math.max(...finite) : 0;
  const W = rowV(w);
  const xl = norm ? 'Normalized Frequency (×π rad/sample)' : 'Frequency (rad/sample)';
  const x0 = w[0], x1 = w[n - 1] > w[0] ? w[n - 1] : w[0] + 1;
  ctx.call('subplot', [num(3), num(1), num(1)], 1);
  ctx.call('plot', [W, rowV(mag)], 1); ctx.call('grid', [str('on')], 0);
  ctx.call('axis', [rowV([x0, x1, maxmag - 3, maxmag])], 0); ctx.call('ylabel', [str('Pass band (dB)')], 0);
  ctx.call('subplot', [num(3), num(1), num(2)], 1);
  ctx.call('plot', [W, rowV(mag)], 1); ctx.call('grid', [str('on')], 0);
  ctx.call('axis', [rowV([x0, x1, maxmag - 100, maxmag])], 0); ctx.call('ylabel', [str('Stop band (dB)')], 0);
  ctx.call('subplot', [num(3), num(1), num(3)], 1);
  ctx.call('plot', [W, rowV(ph)], 1); ctx.call('grid', [str('on')], 0);
  ctx.call('xlim', [rowV([x0, x1])], 0); ctx.call('xlabel', [str(xl)], 0); ctx.call('ylabel', [str('Phase (degrees)')], 0);
  return undefined;
}
const PLANNERS = ['estimate', 'measure', 'patient', 'exhaustive', 'hybrid'];
function fftw(args, nargout, ctx) {
  if (!ctx.state.fftw) ctx.state.fftw = { planner: 'estimate', dwisdom: '', swisdom: '', threads: 1 };
  const st = ctx.state.fftw;
  const what = txt(args[0]);
  if (!what) throw E('fftw:badArg', 'fftw: the first argument must be "planner", "dwisdom", "swisdom" or "threads".');
  if (what === 'planner') {
    const old = st.planner;
    if (args.length > 1) { const m = txt(args[1]); if (!PLANNERS.includes(m)) throw E('fftw:badPlanner', `fftw: unknown planner method (${PLANNERS.join(', ')}).`); st.planner = m; }
    return str(old);
  }
  if (what === 'dwisdom' || what === 'swisdom') {
    const old = st[what];
    if (args.length > 1) { if (!isText(args[1]) && !isEmptyV(args[1])) throw E('fftw:badWisdom', 'fftw: wisdom must be a string.'); st[what] = isText(args[1]) ? toStr(args[1]) : ''; }
    return str(old);
  }
  if (what === 'threads') {
    if (args.length > 1) { const n = toNum(args[1]); if (!(n >= 1) || n !== Math.floor(n)) throw E('fftw:badThreads', 'fftw: the number of threads must be a positive integer.'); st.threads = n; return undefined; }
    return num(st.threads);
  }
  throw E('fftw:badArg', `fftw: unknown argument '${what}'.`);
}

export const builtins = {
  arch_fit, arch_rnd, arch_test, arma_rnd, autoreg_matrix, diffpara, durbinlevinson, fftw, fractdiff, freqz_plot, hurst,
  sinetone, sinewave, spectral_adf, spectral_xdf, spencer, stft, synthesis, yulewalker,
};

export const help = {
  arch_fit: H('Fit an ARCH regression model y(t) = x(t,:)*b + e(t), h(t) = a(1) + a(2)e(t-1)² + … + a(p+1)e(t-p)² by the scoring algorithm. A scalar X gives an autoregression of that order.',
    'ARCH 회귀 모형 y(t) = x(t,:)*b + e(t), h(t) = a(1) + a(2)e(t-1)² + … 를 스코어링 알고리즘으로 맞춥니다. X 가 스칼라이면 그 차수의 자기회귀입니다.', ['[a, b] = arch_fit(y, x, p)', '[a, b] = arch_fit(y, x, p, iter, gamma, a0, b0)']),
  arch_rnd: H('Simulate T samples of an ARCH process with conditional variance coefficients A and AR mean coefficients B.', '조건부 분산 계수 A, 자기회귀 평균 계수 B 인 ARCH 과정을 T 개 모의합니다.', ['y = arch_rnd(a, b, t)']),
  arch_test: H('Lagrange multiplier test for ARCH effects of order P in the residuals of y regressed on x; returns the p-value and the LM statistic.', 'y 를 x 에 회귀한 잔차에 차수 P 의 ARCH 효과가 있는지 라그랑주 승수 검정. p-값과 LM 통계량을 돌려줍니다.', ['[pval, lm] = arch_test(y, x, p)']),
  arma_rnd: H('Simulate T samples of an ARMA process x(t) = a(1)x(t-1) + … + e(t) + b(1)e(t-1) + … with noise variance V (N burn-in samples, default 100).', 'ARMA 과정 x(t) = a(1)x(t-1) + … + e(t) + b(1)e(t-1) + … 을 잡음 분산 V 로 T 개 모의합니다 (버림 표본 N, 기본 100).', ['x = arma_rnd(a, b, v, t)', 'x = arma_rnd(a, b, v, t, n)']),
  autoreg_matrix: H('Design matrix for an autoregression of order K: a column of ones and K lagged copies of y (zero padded).', 'K 차 자기회귀의 설계 행렬: 1 의 열과 K 개의 지연된 y (0 채움).', ['X = autoreg_matrix(y, k)']),
  diffpara: H('Log-periodogram estimate of the fractional differencing parameter d (per column) using the frequencies 2πa/T … 2πb/T; dd is the mean.', '주파수 2πa/T … 2πb/T 의 로그 주기도로 분수 차분 모수 d (열마다)를 추정합니다. dd 는 평균입니다.', ['[d, dd] = diffpara(x)', '[d, dd] = diffpara(x, a)', '[d, dd] = diffpara(x, a, b)']),
  durbinlevinson: H('Durbin–Levinson recursion on autocovariances c (lag 0, 1, …): all steps, or one step from OLDPHI/OLDV. Coefficients are ordered from the highest lag down.', '자기공분산 c (지연 0, 1, …) 에 대한 더빈–레빈슨 재귀: 모든 단계, 또는 OLDPHI/OLDV 에서 한 단계. 계수는 가장 큰 지연부터 정렬됩니다.', ['newphi = durbinlevinson(c)', '[newphi, newv] = durbinlevinson(c, oldphi, oldv)']),
  fftw: H('FFT planner settings: query or set the planner method, the wisdom strings and the number of threads (kept for compatibility; the engine FFT needs no planning).', 'FFT 계획기 설정: 계획 방법, wisdom 문자열, 스레드 수를 조회·설정합니다 (호환용, 엔진 FFT 는 계획이 필요 없음).', ['method = fftw("planner")', 'old = fftw("planner", method)', 'wisdom = fftw("dwisdom")', 'fftw("dwisdom", wisdom)', 'n = fftw("threads")', 'fftw("threads", n)']),
  fractdiff: H('Fractional differencing (1 − L)^d x (integer part by differencing, fractional part by a 100-term filter).', '분수 차분 (1 − L)^d x (정수 부분은 차분, 소수 부분은 100항 필터).', ['y = fractdiff(x, d)']),
  freqz_plot: H('Plot a frequency response: pass band and stop band magnitude in dB and the unwrapped phase in degrees.', '주파수 응답을 그립니다: 통과대역·저지대역 크기(dB)와 펼친 위상(도).', ['freqz_plot(w, h)', 'freqz_plot(w, h, freq_norm)']),
  hurst: H('Hurst exponent of each column estimated with the rescaled range method.', '재조정 범위 방법으로 추정한 각 열의 허스트 지수.', ['H = hurst(x)']),
  sinetone: H('Sine tones of the given frequencies sampled at RATE (default 8000) for SEC seconds (default 1) with amplitude AMPL (default 64); one column per frequency.', '주어진 주파수의 사인 음을 RATE(기본 8000)로 SEC 초(기본 1) 동안 진폭 AMPL(기본 64)로 만듭니다. 주파수마다 한 열.', ['y = sinetone(freq)', 'y = sinetone(freq, rate, sec, ampl)']),
  sinewave: H('M samples of a sine wave with period N (default M) and phase delay D (default 0), as a column.', '주기 N(기본 M), 위상 지연 D(기본 0) 인 사인파 M 표본 (열 벡터).', ['y = sinewave(m)', 'y = sinewave(m, n, d)']),
  spectral_adf: H('Spectral density estimate from autocovariances with a lag window ("triangle" default, "rectangle" or a NAME_lw function) and bandwidth B; returns [frequency, density].', '자기공분산과 지연 창("triangle" 기본, "rectangle" 또는 NAME_lw 함수), 대역폭 B 로 구한 스펙트럼 밀도 추정. [주파수, 밀도] 를 돌려줍니다.', ['retval = spectral_adf(c)', 'retval = spectral_adf(c, win, b)']),
  spectral_xdf: H('Spectral density estimate by smoothing the periodogram with a spectral window ("triangle" default, "rectangle" or a NAME_sw function) and bandwidth B; returns [frequency, density].', '주기도를 스펙트럼 창("triangle" 기본, "rectangle" 또는 NAME_sw 함수)과 대역폭 B 로 평활한 스펙트럼 밀도 추정. [주파수, 밀도] 를 돌려줍니다.', ['retval = spectral_xdf(x)', 'retval = spectral_xdf(x, win, b)']),
  spencer: H("Spencer's 15-point moving average of each column (7 zeros at each end).", '각 열의 스펜서 15점 이동 평균 (양 끝 7개는 0).', ['y = spencer(x)']),
  stft: H('Short-time Fourier transform magnitudes (Octave form): windows of WIN_SIZE (default 80) every INC (24) samples, first NUM_COEF (64) coefficients, window "hanning", "hamming" (default) or "rectangle". C = [win_size, inc, win_type] for synthesis.',
    '단시간 푸리에 변환 크기 (Octave 형식): WIN_SIZE(기본 80) 창을 INC(24) 표본마다, 처음 NUM_COEF(64) 계수, 창 "hanning", "hamming"(기본), "rectangle". C = [win_size, inc, win_type] 은 synthesis 용.', ['y = stft(x)', '[y, c] = stft(x, win_size, inc, num_coef, win_type)']),
  synthesis: H('Inverse of the Octave stft: rebuilds a signal from the coefficients Y and the parameters C = [win_size, inc, win_type].', 'Octave stft 의 역변환: 계수 Y 와 매개변수 C = [win_size, inc, win_type] 로 신호를 다시 만듭니다.', ['x = synthesis(y, c)']),
  yulewalker: H('Yule–Walker estimate of AR coefficients from autocovariances c (lag 0 … p); v is the innovation variance.', '자기공분산 c (지연 0 … p) 로부터 AR 계수의 율–워커 추정. v 는 혁신 분산.', ['a = yulewalker(c)', '[a, v] = yulewalker(c)']),
};

export { prod };
