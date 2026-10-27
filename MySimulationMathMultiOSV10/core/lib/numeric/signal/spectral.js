// Frequency responses and spectral estimation: freqz freqs impz stepz
// grpdelay phasez pwelch periodogram spectrogram cpsd tfestimate mscohere
// xcorr xcov.
import { E, H, F, M, row, col, num, cplx, toNum, isText, toStr, isObject, toRows, isEmptyV } from '../_util.js';
import { filter as kfilter, roots as kroots } from '../_kernels.js';
import { freqzEval, freqsEval, columnsOf, fromColumns, nextpow2, dft, lowerText, convR, cdiv } from './_dsp.js';
import { hammingW } from './windows.js';

// ------------------------------------------------------------ filter arguments (b,a | sos | digitalFilter)
/** Coefficients of the filter at args[0..]: returns {b, a, sos|null, rest}. */
export function filtCoeffs(args, name) {
  const a0 = args[0];
  if (a0 && isObject(a0) && a0.cls === 'digitalFilter') return { b: a0._b, a: a0._a, sos: a0._sos || null, rest: args.slice(1), obj: a0 };
  if (!a0) throw E(`${name}:args`, 'Not enough input arguments.');
  const t = M(a0);
  if (t.n === 6 && t.m > 1) { const sos = toRows(a0); const { b, a } = sosToTf(sos); return { b, a, sos, rest: args.slice(1) }; }
  const b = Array.from(t.a); let a = [1], rest = args.slice(1);
  if (rest.length && !isText(rest[0])) { a = isEmptyV(rest[0]) ? [1] : Array.from(F(rest[0])); rest = rest.slice(1); }
  return { b, a, sos: null, rest };
}
export function sosToTf(sos) {
  let b = [1], a = [1];
  const cv = (x, y) => { const r = new Array(x.length + y.length - 1).fill(0); for (let i = 0; i < x.length; i++) for (let j = 0; j < y.length; j++) r[i + j] += x[i] * y[j]; return r; };
  for (const r of sos) { b = cv(b, r.slice(0, 3)); a = cv(a, r.slice(3, 6)); }
  return { b, a };
}
/** Frequency-vector arguments shared by freqz/grpdelay/phasez. */
function freqArgs(rest, defN = 512) {
  let n = defN, wvec = null, whole = false, fs = null; const nums = [];
  for (const r of rest) { const s = lowerText(r); if (s === 'whole') whole = true; else if (s === 'half') whole = false; else if (s == null) nums.push(r); }
  if (nums.length) { const v = F(nums[0]); if (v.length > 1) wvec = Array.from(v); else if (v.length === 1) n = v[0]; }
  if (nums.length > 1 && F(nums[1]).length) fs = toNum(nums[1]);
  let w;
  if (wvec) w = fs ? wvec.map((f) => 2 * Math.PI * f / fs) : wvec;
  else { w = []; for (let k = 0; k < n; k++) w.push((whole ? 2 : 1) * Math.PI * k / n); }
  const wout = fs ? w.map((x) => x * fs / (2 * Math.PI)) : w;
  return { w, wout, fs };
}
function evalFilt(c, w) {
  if (c.sos) {
    const re = new Float64Array(w.length).fill(1), im = new Float64Array(w.length);
    for (const r of c.sos) { const h = freqzEval(r.slice(0, 3), r.slice(3, 6), w); for (let i = 0; i < w.length; i++) { const x = re[i] * h.re[i] - im[i] * h.im[i]; im[i] = re[i] * h.im[i] + im[i] * h.re[i]; re[i] = x; } }
    return { re, im };
  }
  return freqzEval(c.b, c.a, w);
}
export function freqzImpl(args) {
  const c = filtCoeffs(args, 'freqz'); const f = freqArgs(c.rest);
  const h = evalFilt(c, f.w);
  return [cplx([f.w.length, 1], h.re, h.im), col(f.wout)];
}
function impzLen(b, a) {
  if (a.length <= 1) return b.length;
  const r = kroots(a); const mags = r.re.map((x, i) => Math.hypot(x, r.im[i]));
  const mx = Math.max(...mags); let n;
  if (mx > 1.0001) n = Math.ceil(6 / Math.log(mx));
  else if (mags.some((m) => Math.abs(m - 1) < 1e-5)) {
    let per = 1; mags.forEach((m, i) => { if (Math.abs(m - 1) < 1e-5) { const ang = Math.abs(Math.atan2(r.im[i], r.re[i])); per = Math.max(per, ang > 1e-9 ? 2 * Math.PI / ang : 1); } });
    n = Math.ceil(5 * per);
  } else n = mx === 0 ? a.length : Math.ceil(Math.log(5e-5) / Math.log(mx));
  return Math.max(n, b.length, 1);
}
function impulseOf(c, idx) {
  const L = Math.max(...idx) + 1; const x = new Float64Array(L); x[0] = 1;
  let y = x;
  if (c.sos) for (const r of c.sos) y = kfilter(r.slice(0, 3), r.slice(3, 6), y).y; else y = kfilter(c.b, c.a, x).y;
  return idx.map((i) => y[i]);
}
function impzCommon(args, name, step) {
  const c = filtCoeffs(args, name); let idx, fs = 1;
  const nums = c.rest.filter((x) => !isText(x));
  if (nums.length && F(nums[0]).length > 1) idx = Array.from(F(nums[0])).map((x) => Math.round(x));
  else { const n = nums.length && F(nums[0]).length ? toNum(nums[0]) : impzLen(c.b, c.a); idx = Array.from({ length: n }, (_, i) => i); }
  if (nums.length > 1 && F(nums[1]).length) fs = toNum(nums[1]);
  let h = impulseOf(c, idx.map((i) => Math.max(0, i))).map((v, k) => (idx[k] < 0 ? 0 : v));
  if (step) { const full = impulseOf(c, Array.from({ length: Math.max(...idx) + 1 }, (_, i) => i)); const cs = []; let s = 0; for (const v of full) { s += v; cs.push(s); } h = idx.map((i) => (i < 0 ? 0 : cs[i])); }
  return [col(h), col(idx.map((i) => i / fs))];
}
function grpdelayImpl(args) {
  const c = filtCoeffs(args, 'grpdelay'); const f = freqArgs(c.rest);
  const one = (b, a) => {
    const ar = a.slice().reverse(); const cc = Array.from(convR(Float64Array.from(b), Float64Array.from(ar)));
    const cr = cc.map((x, i) => x * i); const oa = a.length - 1;
    const N = freqzEval(cr, [1], f.w), D = freqzEval(cc, [1], f.w);
    return f.w.map((_, i) => { const d = Math.hypot(D.re[i], D.im[i]); if (d < 1e-12 * (1 + Math.hypot(N.re[i], N.im[i]))) return 0; return cdiv([N.re[i], N.im[i]], [D.re[i], D.im[i]])[0] - oa; });
  };
  let gd;
  if (c.sos) { gd = new Array(f.w.length).fill(0); for (const r of c.sos) { const g = one(r.slice(0, 3), r.slice(3, 6)); for (let i = 0; i < gd.length; i++) gd[i] += g[i]; } }
  else gd = one(c.b, c.a);
  return [col(gd), col(f.wout)];
}
export function unwrapArr(p, tol = Math.PI) {
  const out = Float64Array.from(p); let corr = 0;
  for (let i = 1; i < p.length; i++) {
    const dp = p[i] - p[i - 1]; let dps = ((dp + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    if (dps === -Math.PI && dp > 0) dps = Math.PI;
    if (Math.abs(dp) >= tol) corr += dps - dp;
    out[i] = p[i] + corr;
  }
  return out;
}
function phasezImpl(args) {
  const [h, w] = freqzImpl(args);
  const ph = Array.from(h.re).map((x, i) => Math.atan2(h.im ? h.im[i] : 0, x));
  return [col(unwrapArr(ph)), w];
}
function freqsImpl(args) {
  if (args.length < 2) throw E('freqs:args', 'Usage: [h,w] = freqs(b, a, w).');
  const b = Array.from(F(args[0])), a = Array.from(F(args[1]));
  let w;
  const n3 = args.length > 2 ? F(args[2]) : null;
  if (n3 && n3.length > 1) w = Array.from(n3);
  else {
    const n = n3 && n3.length ? n3[0] : 200;
    const mags = []; for (const p of [b, a]) { const r = p.length > 1 ? kroots(p) : { re: [], im: [] }; r.re.forEach((x, i) => { const m = Math.hypot(x, r.im[i]); if (m > 0) mags.push(m); }); }
    const lo = mags.length ? Math.min(...mags) / 10 : 0.1, hi = mags.length ? Math.max(...mags) * 10 : 10;
    const l0 = Math.floor(Math.log10(lo)), l1 = Math.ceil(Math.log10(hi));
    w = []; for (let k = 0; k < n; k++) w.push(10 ** (l0 + (l1 - l0) * k / (n - 1 || 1)));
  }
  const h = freqsEval(b, a, w);
  return [cplx([w.length, 1], h.re, h.im), col(w)];
}

// ------------------------------------------------------------ spectral estimation
function winArg(v, N, defL) {
  if (v == null || isEmptyV(v)) return Array.from(hammingW(defL));
  const t = F(v); if (t.length === 1) return Array.from(hammingW(Math.round(t[0])));
  return Array.from(t);
}
function parseFlags(rest, isReal) {
  let range = isReal ? 'onesided' : 'twosided', type = 'psd', mean = false;
  const nums = [];
  for (const r of rest) {
    const s = lowerText(r);
    if (s == null) { nums.push(r); continue; }
    if (['onesided', 'twosided', 'centered'].includes(s)) range = s;
    else if (['psd', 'power', 'ms'].includes(s)) type = s;
    else if (s === 'mean' || s === 'maxhold' || s === 'minhold') mean = s;
    else if (s === 'reassigned' || s === 'yaxis' || s === 'xaxis') { /* display options */ } else throw E('spectral:badOption', `Unknown option '${s}'.`);
  }
  return { range, type, nums };
}
/** DFT of a windowed segment at nfft bins (or explicit frequencies w rad/sample). */
function segDft(re, im, win, nfft, wvec) {
  const L = win.length; const xr = new Float64Array(L), xi = new Float64Array(L);
  for (let i = 0; i < L; i++) { xr[i] = re[i] * win[i]; xi[i] = im ? im[i] * win[i] : 0; }
  if (wvec) {
    const R = new Float64Array(wvec.length), I = new Float64Array(wvec.length);
    wvec.forEach((w, k) => { let sr = 0, si = 0; for (let i = 0; i < L; i++) { const c = Math.cos(w * i), s = Math.sin(w * i); sr += xr[i] * c + xi[i] * s; si += xi[i] * c - xr[i] * s; } R[k] = sr; I[k] = si; });
    return { re: R, im: I };
  }
  if (nfft < L) { const wr = new Float64Array(nfft), wi = new Float64Array(nfft); for (let i = 0; i < L; i++) { wr[i % nfft] += xr[i]; wi[i % nfft] += xi[i]; } return dft(wr, wi, nfft); }
  return dft(xr, xi, nfft);
}
/**
 * Welch-style averaged (cross) periodogram of one column pair.
 * Returns two-sided {re, im} of P = mean(X conj(Y)) (not yet scaled).
 */
function welchCore(x, xi, y, yi, win, nov, nfft, wvec) {
  const L = win.length, N = x.length; const step = L - nov;
  const K = Math.max(1, Math.floor((N - nov) / step));
  const nb = wvec ? wvec.length : nfft; const pr = new Float64Array(nb), pi = new Float64Array(nb);
  const Xs = [];
  for (let k = 0; k < K; k++) {
    const s = k * step; const X = segDft(x.subarray(s, s + L), xi ? xi.subarray(s, s + L) : null, win, nfft, wvec);
    const Y = y === x ? X : segDft(y.subarray(s, s + L), yi ? yi.subarray(s, s + L) : null, win, nfft, wvec);
    for (let i = 0; i < nb; i++) { pr[i] += X.re[i] * Y.re[i] + X.im[i] * Y.im[i]; pi[i] += X.im[i] * Y.re[i] - X.re[i] * Y.im[i]; }
    Xs.push(X);
  }
  for (let i = 0; i < nb; i++) { pr[i] /= K; pi[i] /= K; }
  return { re: pr, im: pi, K, Xs };
}
/** Applies range selection and scaling. Returns {re, im, f}. */
function finish(P, win, nfft, fs, range, type, wvec, fsGiven) {
  const U = win.reduce((s, x) => s + x * x, 0), S = win.reduce((s, x) => s + x, 0);
  const scale = type === 'psd' ? 1 / (U * fs) : 1 / (S * S);
  let re = Array.from(P.re, (x) => x * scale), im = Array.from(P.im, (x) => x * scale);
  const toF = (k) => k * fs / nfft;
  if (wvec) return { re, im, f: wvec.map((w) => (fsGiven ? w : w)) };
  let f;
  if (range === 'onesided') {
    const n = nfft % 2 ? (nfft + 1) / 2 : nfft / 2 + 1;
    re = re.slice(0, n); im = im.slice(0, n);
    if (type === 'psd' || type === 'power' || type === 'ms') {
      const hi = nfft % 2 ? n : n - 1;
      if (type === 'psd') for (let i = 1; i < hi; i++) { re[i] *= 2; im[i] *= 2; }
      else for (let i = 1; i < hi; i++) { re[i] *= 2; im[i] *= 2; }
    }
    f = re.map((_, k) => toF(k));
  } else if (range === 'centered') {
    const sh = Math.floor(nfft / 2); const rot = (a) => [...a.slice(nfft - sh), ...a.slice(0, nfft - sh)];
    re = rot(re); im = rot(im); f = re.map((_, k) => toF(k - sh));
  } else f = re.map((_, k) => toF(k));
  return { re, im, f };
}
function welchApi(args, name, opts = {}) {
  const cross = !!opts.cross; const nIn = cross ? 2 : 1;
  if (args.length < nIn) throw E(`${name}:args`, 'Not enough input arguments.');
  const X = columnsOf(args[0], 'x'); const Y = cross ? columnsOf(args[1], 'y') : X;
  const N = X.len; const isReal = !X.icols && !Y.icols;
  const fl = parseFlags(args.slice(nIn), isReal); const p = fl.nums;
  const get = (i) => (i < p.length && !isEmptyV(p[i]) ? p[i] : null);
  let win, nov, nfftArg, fsArg;
  if (opts.periodogram) { win = get(0) ? Array.from(F(get(0))) : new Array(N).fill(1); nov = 0; nfftArg = get(1); fsArg = get(2); if (win.length !== N) throw E('periodogram:badWindow', 'The window length must equal the signal length.'); }
  else {
    const defL = Math.floor(N / 4.5) || N; win = winArg(get(0), N, defL);
    nov = get(1) ? toNum(get(1)) : Math.floor(win.length / 2); nfftArg = get(2); fsArg = get(3);
    if (win.length > N) throw E(`${name}:badWindow`, 'The window length must not exceed the signal length.');
    if (nov >= win.length) throw E(`${name}:badOverlap`, 'noverlap must be smaller than the window length.');
  }
  const fsGiven = fsArg != null; const fs = fsGiven ? toNum(fsArg) : 2 * Math.PI;
  let nfft = Math.max(256, 2 ** nextpow2(win.length)), wvec = null;
  if (nfftArg) { const v = F(nfftArg); if (v.length > 1) wvec = Array.from(v).map((f) => (fsGiven ? 2 * Math.PI * f / fs : f)); else nfft = Math.round(v[0]); }
  const outs = [];
  const ncol = Math.max(X.ncol, Y.ncol);
  for (let j = 0; j < ncol; j++) {
    const xj = X.cols[Math.min(j, X.ncol - 1)], xij = X.icols ? X.icols[Math.min(j, X.ncol - 1)] : null;
    const yj = Y.cols[Math.min(j, Y.ncol - 1)], yij = Y.icols ? Y.icols[Math.min(j, Y.ncol - 1)] : null;
    const P = welchCore(xj, xij, cross ? yj : xj, cross ? yij : xij, win, nov, nfft, wvec);
    outs.push({ P, xj, xij, yj, yij });
  }
  return { outs, win, nov, nfft, wvec, fs, fsGiven, fl, X, Y };
}
function packCols(list, cplxOut) {
  const L = list[0].re.length; const n = list.length; const re = new Float64Array(L * n), im = cplxOut ? new Float64Array(L * n) : null;
  list.forEach((c, j) => { for (let i = 0; i < L; i++) { re[i + j * L] = c.re[i]; if (im) im[i + j * L] = c.im[i]; } });
  return cplx([L, n], re, im);
}
function psdApi(args, name, periodogram) {
  const s = welchApi(args, name, { periodogram });
  const res = s.outs.map((o) => finish(o.P, s.win, s.nfft, s.fs, s.fl.range, s.fl.type, s.wvec, s.fsGiven));
  return [packCols(res, false), col(res[0].f)];
}
function cpsdImpl(args) {
  const s = welchApi(args, 'cpsd', { cross: true });
  const res = s.outs.map((o) => finish(o.P, s.win, s.nfft, s.fs, s.fl.range, 'psd', s.wvec, s.fsGiven));
  return [packCols(res, true), col(res[0].f)];
}
function tfeImpl(args, kind) {
  const s = welchApi(args, kind, { cross: true });
  const res = s.outs.map((o) => {
    const Pxx = welchCore(o.xj, o.xij, o.xj, o.xij, s.win, s.nov, s.nfft, s.wvec);
    const Pyy = welchCore(o.yj, o.yij, o.yj, o.yij, s.win, s.nov, s.nfft, s.wvec);
    const n = o.P.re.length; const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      if (kind === 'tfestimate') { const h = cdiv([o.P.re[i], -o.P.im[i]], [Pxx.re[i], 0]); re[i] = h[0]; im[i] = h[1]; }
      else { re[i] = (o.P.re[i] ** 2 + o.P.im[i] ** 2) / (Pxx.re[i] * Pyy.re[i]); }
    }
    // select range without psd doubling
    return finish({ re, im }, s.win.map(() => 1), s.nfft, s.fs, s.fl.range, 'raw', s.wvec, s.fsGiven);
  });
  // undo finish scaling (raw type uses 1/(S*S) with unit window): rescale
  const L = s.win.length;
  for (const r of res) for (let i = 0; i < r.re.length; i++) { r.re[i] *= L * L; r.im[i] *= L * L; }
  return [packCols(res, kind === 'tfestimate'), col(res[0].f)];
}
function spectrogramImpl(args) {
  if (!args.length) throw E('spectrogram:args', 'Not enough input arguments.');
  const x = columnsOf(args[0], 'x'); if (x.ncol !== 1) throw E('spectrogram:vector', 'The input must be a vector.');
  const N = x.len; const isReal = !x.icols; const fl = parseFlags(args.slice(1), isReal); const p = fl.nums;
  const get = (i) => (i < p.length && !isEmptyV(p[i]) ? p[i] : null);
  const win = winArg(get(0), N, Math.floor(N / 4.5) || N);
  const nov = get(1) ? toNum(get(1)) : Math.floor(win.length / 2);
  const fsGiven = get(3) != null; const fs = fsGiven ? toNum(get(3)) : 2 * Math.PI;
  let nfft = Math.max(256, 2 ** nextpow2(win.length)), wvec = null;
  if (get(2)) { const v = F(get(2)); if (v.length > 1) wvec = Array.from(v).map((f) => (fsGiven ? 2 * Math.PI * f / fs : f)); else nfft = Math.round(v[0]); }
  const L = win.length, step = L - nov; const K = Math.max(1, Math.floor((N - nov) / step));
  const U = win.reduce((s, v) => s + v * v, 0);
  const cols = [], pcols = [];
  let freqs;
  for (let k = 0; k < K; k++) {
    const s0 = k * step; const X = segDft(x.cols[0].subarray(s0, s0 + L), x.icols ? x.icols[0].subarray(s0, s0 + L) : null, win, nfft, wvec);
    let re = Array.from(X.re), im = Array.from(X.im); let f;
    if (!wvec && fl.range === 'onesided') { const n = nfft % 2 ? (nfft + 1) / 2 : nfft / 2 + 1; re = re.slice(0, n); im = im.slice(0, n); f = re.map((_, i) => i * fs / nfft); }
    else if (!wvec && fl.range === 'centered') { const sh = Math.floor(nfft / 2); const rot = (a) => [...a.slice(nfft - sh), ...a.slice(0, nfft - sh)]; re = rot(re); im = rot(im); f = re.map((_, i) => (i - sh) * fs / nfft); }
    else f = wvec ? wvec.map((w) => (fsGiven ? w * fs / (2 * Math.PI) : w)) : re.map((_, i) => i * fs / nfft);
    freqs = f;
    const ps = re.map((r, i) => (r * r + im[i] * im[i]) / (U * fs));
    if (!wvec && fl.range === 'onesided') { const hi = nfft % 2 ? ps.length : ps.length - 1; for (let i = 1; i < hi; i++) ps[i] *= 2; }
    cols.push({ re, im }); pcols.push({ re: ps, im: null });
  }
  const t = Array.from({ length: K }, (_, k) => (L / 2 + k * step) / (fsGiven ? fs : 1));
  return [packCols(cols, true), col(freqs), row(t), packCols(pcols, false)];
}

// ------------------------------------------------------------ correlation
function xcorrPair(x, xi, y, yi, maxlag) {
  const N = Math.max(x.length, y.length); const n = 2 * maxlag + 1;
  const re = new Float64Array(n), im = new Float64Array(n); const cplxIn = !!(xi || yi);
  if (N * n > 2e6) {
    let m = 1; while (m < 2 * N) m <<= 1;
    const X = dft(x, xi, m), Y = dft(y, yi, m); const pr = new Float64Array(m), pim = new Float64Array(m);
    for (let k = 0; k < m; k++) { pr[k] = X.re[k] * Y.re[k] + X.im[k] * Y.im[k]; pim[k] = X.im[k] * Y.re[k] - X.re[k] * Y.im[k]; }
    const r = dft(pr, pim, m, true);
    for (let l = -maxlag; l <= maxlag; l++) { const idx = ((l % m) + m) % m; re[l + maxlag] = r.re[idx]; im[l + maxlag] = r.im[idx]; }
  } else {
    for (let l = -maxlag; l <= maxlag; l++) {
      let sr = 0, si = 0;
      for (let k = Math.max(0, -l); k < N && k + l < N; k++) {
        const ar = k + l < x.length ? x[k + l] : 0, ai = xi && k + l < xi.length ? xi[k + l] : 0;
        const br = k < y.length ? y[k] : 0, bi = yi && k < yi.length ? yi[k] : 0;
        sr += ar * br + ai * bi; si += ai * br - ar * bi;
      }
      re[l + maxlag] = sr; im[l + maxlag] = si;
    }
  }
  return { re, im: cplxIn ? im : null };
}
function xcorrImpl(args, nargout, cov) {
  if (!args.length) throw E('xcorr:args', 'Not enough input arguments.');
  const X = columnsOf(args[0], 'x'); let Y = null; let i = 1;
  if (args.length > 1 && !isText(args[1]) && !(F(args[1]).length === 1 && X.len > 1)) { Y = columnsOf(args[1], 'y'); i = 2; }
  let maxlag = null, scale = 'none';
  for (; i < args.length; i++) { const s = lowerText(args[i]); if (s != null) scale = s; else if (F(args[i]).length) maxlag = toNum(args[i]); }
  if (!['none', 'biased', 'unbiased', 'coeff', 'normalized'].includes(scale)) throw E('xcorr:badScale', `Unknown scale option '${scale}'.`);
  const demean = (cols) => cols && cols.map((c) => { const m = c.reduce((s, v) => s + v, 0) / (c.length || 1); return c.map((v) => v - m); });
  let xc = X.cols, xic = X.icols, yc = Y ? Y.cols : null, yic = Y ? Y.icols : null;
  if (cov) { xc = demean(xc); xic = demean(xic); yc = demean(yc); yic = demean(yic); }
  const N = Math.max(X.len, Y ? Y.len : 0);
  if (maxlag == null) maxlag = N - 1;
  if (maxlag < 0) throw E('xcorr:badLag', 'maxlag must be a non-negative integer.');
  const pairs = [];
  if (Y) pairs.push([xc[0], xic && xic[0], yc[0], yic && yic[0]]);
  else if (X.ncol === 1) pairs.push([xc[0], xic && xic[0], xc[0], xic && xic[0]]);
  else for (let a = 0; a < X.ncol; a++) for (let b = 0; b < X.ncol; b++) pairs.push([xc[a], xic && xic[a], xc[b], xic && xic[b]]);
  const res = pairs.map(([x, xi, y, yi]) => {
    const r = xcorrPair(x, xi, y, yi, maxlag);
    const sc = (l) => (scale === 'biased' ? 1 / N : scale === 'unbiased' ? 1 / Math.max(1, N - Math.abs(l)) : 1);
    if (scale === 'coeff' || scale === 'normalized') {
      const e = (v, vi) => v.reduce((s, q, k) => s + q * q + (vi ? vi[k] * vi[k] : 0), 0);
      const d = Math.sqrt(e(x, xi) * e(y, yi)) || 1; for (let k = 0; k < r.re.length; k++) { r.re[k] /= d; if (r.im) r.im[k] /= d; }
    } else for (let k = 0; k < r.re.length; k++) { const s = sc(k - maxlag); r.re[k] *= s; if (r.im) r.im[k] *= s; }
    return r;
  });
  const lags = row(Array.from({ length: 2 * maxlag + 1 }, (_, k) => k - maxlag));
  const anyIm = res.some((r) => r.im);
  const out = fromColumns(res.map((r) => r.re), X.isRow && res.length === 1, anyIm ? res.map((r) => r.im || new Float64Array(r.re.length)) : null);
  return [out, lags];
}

export const builtins = {
  freqz: freqzImpl,
  freqs: freqsImpl,
  impz(args) { return impzCommon(args, 'impz', false); },
  stepz(args) { return impzCommon(args, 'stepz', true); },
  grpdelay: grpdelayImpl,
  phasez: phasezImpl,
  pwelch(args) { return psdApi(args, 'pwelch', false); },
  periodogram(args) { return psdApi(args, 'periodogram', true); },
  spectrogram: spectrogramImpl,
  cpsd: cpsdImpl,
  tfestimate(args) { return tfeImpl(args, 'tfestimate'); },
  mscohere(args) { return tfeImpl(args, 'mscohere'); },
  xcorr(args, nargout) { return xcorrImpl(args, nargout, false); },
  xcov(args, nargout) { return xcorrImpl(args, nargout, true); },
};

export const help = {
  freqz: H('Frequency response of a digital filter (b,a, SOS matrix or digitalFilter).', '디지털 필터의 주파수 응답 (b,a, SOS 행렬 또는 digitalFilter).', ['[h,w] = freqz(b, a, n)', "[h,w] = freqz(b, a, n, 'whole')", '[h,f] = freqz(b, a, n, fs)', 'h = freqz(b, a, w)', '[h,w] = freqz(sos, n)', '[h,w] = freqz(d, n)']),
  freqs: H('Frequency response of an analog filter H(s) = B(s)/A(s).', '아날로그 필터 H(s)=B(s)/A(s) 의 주파수 응답.', ['[h,w] = freqs(b, a)', 'h = freqs(b, a, w)', '[h,w] = freqs(b, a, n)']),
  impz: H('Impulse response of a digital filter.', '디지털 필터의 임펄스 응답.', ['[h,t] = impz(b, a)', '[h,t] = impz(b, a, n)', '[h,t] = impz(b, a, n, fs)', '[h,t] = impz(sos)']),
  stepz: H('Step response of a digital filter.', '디지털 필터의 계단 응답.', ['[s,t] = stepz(b, a)', '[s,t] = stepz(b, a, n, fs)']),
  grpdelay: H('Group delay of a digital filter (samples).', '디지털 필터의 군지연 (샘플 단위).', ['[gd,w] = grpdelay(b, a, n)', '[gd,f] = grpdelay(b, a, n, fs)', "[gd,w] = grpdelay(b, a, n, 'whole')"]),
  phasez: H('Unwrapped phase response of a digital filter.', '디지털 필터의 펼친 위상 응답.', ['[phi,w] = phasez(b, a, n)', '[phi,f] = phasez(b, a, n, fs)']),
  pwelch: H("Welch's power spectral density estimate (averaged modified periodograms).", 'Welch 전력 스펙트럼 밀도 추정 (평균 수정 주기도).', ['[pxx,w] = pwelch(x)', '[pxx,w] = pwelch(x, window, noverlap, nfft)', '[pxx,f] = pwelch(x, window, noverlap, nfft, fs)', "[___] = pwelch(___, 'twosided'|'centered'|'power')"]),
  periodogram: H('Periodogram power spectral density estimate.', '주기도 전력 스펙트럼 밀도 추정.', ['[pxx,w] = periodogram(x)', '[pxx,w] = periodogram(x, window, nfft)', '[pxx,f] = periodogram(x, window, nfft, fs)', "[___] = periodogram(___, 'power')"]),
  spectrogram: H('Short-time Fourier transform: STFT matrix, frequencies, times and PSD.', '단시간 푸리에 변환: STFT 행렬, 주파수, 시간, PSD.', ['s = spectrogram(x)', '[s,w,t] = spectrogram(x, window, noverlap, nfft)', '[s,f,t,ps] = spectrogram(x, window, noverlap, nfft, fs)']),
  cpsd: H("Cross power spectral density (Welch's method).", '교차 전력 스펙트럼 밀도 (Welch 방법).', ['[pxy,w] = cpsd(x, y)', '[pxy,f] = cpsd(x, y, window, noverlap, nfft, fs)']),
  tfestimate: H('Transfer function estimate Txy = Pyx / Pxx.', '전달함수 추정 Txy = Pyx / Pxx.', ['[txy,w] = tfestimate(x, y)', '[txy,f] = tfestimate(x, y, window, noverlap, nfft, fs)']),
  mscohere: H('Magnitude-squared coherence |Pxy|^2 / (Pxx Pyy).', '크기 제곱 코히어런스 |Pxy|^2/(Pxx Pyy).', ['[cxy,w] = mscohere(x, y)', '[cxy,f] = mscohere(x, y, window, noverlap, nfft, fs)']),
  xcorr: H("Cross-correlation (or autocorrelation) with lags; scale 'biased', 'unbiased', 'normalized'.", "지연별 상호상관(자기상관); 스케일 'biased', 'unbiased', 'normalized'.", ['r = xcorr(x)', 'r = xcorr(x, y)', '[r, lags] = xcorr(___, maxlag)', "[r, lags] = xcorr(___, scaleopt)"]),
  xcov: H('Cross-covariance (cross-correlation of mean-removed sequences).', '상호공분산 (평균을 뺀 수열의 상호상관).', ['c = xcov(x)', 'c = xcov(x, y)', '[c, lags] = xcov(___, maxlag, scaleopt)']),
};
