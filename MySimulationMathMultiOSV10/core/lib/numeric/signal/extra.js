// More signal processing: RMS-type measurements, discrete cosine
// transforms, chirp z-transform, Goertzel DFT, buffering into frames, 2-D
// cross-correlation and zero-phase frequency-selective filtering.
import { tensor, num, str, isText, toStr, toTensor, isTensor, isSparse } from '../../../value.js';
import { E, F, isEmptyV } from '../_util.js';

const call = (ctx, f, args, n = 1) => ctx.call(f, args, n);
const call1 = (ctx, f, args) => ctx.call(f, args, 1)[0];
const S = (s) => str(s);
const T = (v, fn) => { if (v == null) throw E(`${fn}:notEnoughInputs`, 'Not enough input arguments.'); if (isTensor(v)) return v; if (isSparse(v)) return toTensor(v); throw E(`${fn}:badInput`, `${fn} requires numeric input.`); };
const lstr = (v) => (v != null && isText(v) ? toStr(v).toLowerCase() : null);
const firstNS = (d) => { const k = d.findIndex((x) => x !== 1); return k < 0 ? 0 : k; };

/** Applies f(re, im) → [re, im] (length outLen) along dim k. */
function along(t, k, outLen, f) {
  const d = t.dims.slice(); while (d.length <= k) d.push(1);
  let before = 1, after = 1; for (let i = 0; i < d.length; i++) { if (i < k) before *= d[i]; else if (i > k) after *= d[i]; }
  const len = d[k], nOut = before * outLen * after;
  const re = new Float64Array(nOut), im = new Float64Array(nOut);
  const sr = new Float64Array(len), si = new Float64Array(len);
  let anyIm = false;
  for (let a = 0; a < after; a++) for (let b = 0; b < before; b++) {
    const base = a * before * len + b;
    for (let q = 0; q < len; q++) { sr[q] = t.re[base + q * before]; si[q] = t.im ? t.im[base + q * before] : 0; }
    const [yr, yi] = f(sr, si);
    const ob = a * before * outLen + b;
    for (let q = 0; q < outLen; q++) { re[ob + q * before] = yr[q]; if (yi) { im[ob + q * before] = yi[q]; if (yi[q] !== 0) anyIm = true; } }
  }
  d[k] = outLen;
  while (d.length > 2 && d[d.length - 1] === 1) d.pop();
  return tensor('double', d, re, anyIm ? im : null);
}

// ------------------------------------------------------------- measurements

function absPow(ctx, x) { return call1(ctx, 'power', [call1(ctx, 'abs', [x]), num(2)]); }
const rmsFn = (args, nargout, ctx) => call1(ctx, 'sqrt', [call1(ctx, 'mean', [absPow(ctx, T(args[0], 'rms')), ...args.slice(1)])]);
const rssqFn = (args, nargout, ctx) => call1(ctx, 'sqrt', [call1(ctx, 'sum', [absPow(ctx, T(args[0], 'rssq')), ...args.slice(1)])]);
function minmaxArgs(args) { return args.length > 1 ? [tensor('double', [0, 0]), ...args.slice(1)] : []; }
const peak2peakFn = (args, nargout, ctx) => { const x = T(args[0], 'peak2peak'); const r = minmaxArgs(args); return call1(ctx, 'minus', [call1(ctx, 'max', [x, ...r]), call1(ctx, 'min', [x, ...r])]); };
const peak2rmsFn = (args, nargout, ctx) => { const x = T(args[0], 'peak2rms'); const r = minmaxArgs(args); return call1(ctx, 'rdivide', [call1(ctx, 'max', [call1(ctx, 'abs', [x]), ...r]), rmsFn(args, 1, ctx)]); };

// ------------------------------------------------------------- DCT

function dctArgs(args, fn) {
  const x = T(args[0], fn);
  let i = 1, n = null, dim = null, type = 2;
  if (args[i] !== undefined && !isText(args[i])) { if (!isEmptyV(args[i])) n = F(args[i])[0]; i++; }
  if (args[i] !== undefined && !isText(args[i])) { dim = F(args[i])[0] - 1; i++; }
  for (; i < args.length; i += 2) { if (lstr(args[i]) === 'type') type = F(args[i + 1])[0]; else throw E(`${fn}:badOption`, `Invalid option '${toStr(args[i])}'.`); }
  if (![1, 2, 3, 4].includes(type)) throw E(`${fn}:badType`, 'DCT type must be 1, 2, 3 or 4.');
  if (dim === null) dim = firstNS(x.dims);
  return { x, n, dim, type };
}
/** Orthonormal DCT of the given type (inverse = transpose; types 1 and 4 are their own inverses, 2 and 3 are inverses of each other). */
function dctMat(N, type) {
  const M = new Float64Array(N * N);
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) {
    let v;
    if (type === 2) v = Math.sqrt((k === 0 ? 1 : 2) / N) * Math.cos(Math.PI * (2 * j + 1) * k / (2 * N));
    else if (type === 3) v = Math.sqrt((j === 0 ? 1 : 2) / N) * Math.cos(Math.PI * (2 * k + 1) * j / (2 * N));
    else if (type === 4) v = Math.sqrt(2 / N) * Math.cos(Math.PI * (2 * j + 1) * (2 * k + 1) / (4 * N));
    else { // type 1, orthonormal form
      if (N === 1) v = 1;
      else { const ck = k === 0 || k === N - 1 ? Math.SQRT1_2 : 1, cj = j === 0 || j === N - 1 ? Math.SQRT1_2 : 1; v = Math.sqrt(2 / (N - 1)) * ck * cj * Math.cos(Math.PI * k * j / (N - 1)); }
    }
    M[k + j * N] = v;
  }
  return M;
}
function dctApply(args, fn, inverse) {
  const { x, n, dim, type } = dctArgs(args, fn);
  const len = x.dims[dim] ?? 1;
  const N = n ?? len;
  const t = inverse ? ({ 1: 1, 2: 3, 3: 2, 4: 4 })[type] : type;
  const M = dctMat(N, t);
  const mul = (v) => { const y = new Float64Array(N); for (let k = 0; k < N; k++) { let s = 0; for (let j = 0; j < Math.min(N, v.length); j++) s += M[k + j * N] * v[j]; y[k] = s; } return y; };
  return along(x, dim, N, (re, im) => [mul(re), x.im ? mul(im) : null]);
}
function dct2Apply(args, fn, inverse, ctx) {
  const x = T(args[0], fn);
  let m = x.dims[0], n = x.dims[1];
  if (args[1] !== undefined) { const s = F(args[1]); if (s.length === 1 && args[2] !== undefined) { m = s[0]; n = F(args[2])[0]; } else if (s.length === 2) { m = s[0]; n = s[1]; } }
  const f = inverse ? 'idct' : 'dct';
  const a = call1(ctx, f, [x, num(m), num(1)]);
  return call1(ctx, f, [a, num(n), num(2)]);
}

// ------------------------------------------------------------- czt / goertzel

function cztFn(args) {
  const x = T(args[0], 'czt');
  const d = x.dims, dim = firstNS(d), len = d[dim] ?? 1;
  const M = args[1] !== undefined && !isEmptyV(args[1]) ? F(args[1])[0] : len;
  const cv = (v, dr, di) => { if (v === undefined || isEmptyV(v)) return [dr, di]; const t = toTensor(v); return [t.re[0], t.im ? t.im[0] : 0]; };
  const [wr, wi] = cv(args[2], Math.cos(-2 * Math.PI / M), Math.sin(-2 * Math.PI / M));
  const [ar, ai] = cv(args[3], 1, 0);
  // X(k) = sum_n x(n) A^-n W^(n k)
  const lw = Math.log(Math.hypot(wr, wi)), tw = Math.atan2(wi, wr), la = Math.log(Math.hypot(ar, ai)), ta = Math.atan2(ai, ar);
  return along(x, dim, M, (re, im) => {
    const yr = new Float64Array(M), yi = new Float64Array(M);
    for (let k = 0; k < M; k++) for (let q = 0; q < len; q++) {
      const mag = Math.exp(-q * la + q * k * lw), ph = -q * ta + q * k * tw;
      const c = mag * Math.cos(ph), s = mag * Math.sin(ph);
      yr[k] += re[q] * c - im[q] * s; yi[k] += re[q] * s + im[q] * c;
    }
    return [yr, yi];
  });
}
function goertzelFn(args) {
  const x = T(args[0], 'goertzel');
  const dim = args[2] !== undefined ? F(args[2])[0] - 1 : firstNS(x.dims);
  const len = x.dims[dim] ?? 1;
  const ind = args[1] !== undefined && !isEmptyV(args[1]) ? Array.from(F(args[1])) : Array.from({ length: len }, (_, i) => i + 1);
  return along(x, dim, ind.length, (re, im) => {
    const yr = new Float64Array(ind.length), yi = new Float64Array(ind.length);
    ind.forEach((k, o) => { for (let q = 0; q < len; q++) { const ph = -2 * Math.PI * (k - 1) * q / len, c = Math.cos(ph), s = Math.sin(ph); yr[o] += re[q] * c - im[q] * s; yi[o] += re[q] * s + im[q] * c; } });
    return [yr, yi];
  });
}

// ------------------------------------------------------------- buffer

function bufferFn(args, nargout) {
  if (args.length < 2) throw E('buffer:notEnoughInputs', 'Not enough input arguments.');
  const x = T(args[0], 'buffer'); const xs = Array.from(x.re);
  const n = F(args[1])[0];
  const p = args[2] !== undefined ? F(args[2])[0] : 0;
  if (!(n > 0 && Number.isInteger(n))) throw E('buffer:badN', 'Frame length must be a positive integer.');
  if (!(p < n)) throw E('buffer:badOverlap', 'Overlap must be smaller than the frame length.');
  let init = null, nodelay = false;
  if (args[3] !== undefined) { if (lstr(args[3]) === 'nodelay') nodelay = true; else init = Array.from(F(args[3])); }
  let seq;
  if (p > 0) {
    const pre = nodelay ? [] : init ? init.slice(0, p) : new Array(p).fill(0);
    if (init && init.length !== p) throw E('buffer:badInit', 'Initial conditions must have length P.');
    seq = pre.concat(xs);
  } else seq = p < 0 && init ? xs.slice(init[0] || 0) : xs.slice();
  const step = n - p;
  const cols = [];
  for (let s = 0; s < seq.length; s += step) {
    const c = new Array(n).fill(0);
    for (let q = 0; q < n; q++) c[q] = s + q < seq.length ? seq[s + q] : 0;
    cols.push(c);
    if (s + n >= seq.length) break;
  }
  if (!cols.length) cols.push(new Array(n).fill(0));
  const re = new Float64Array(n * cols.length); cols.forEach((c, j) => c.forEach((v, q) => { re[q + j * n] = v; }));
  const y = tensor('double', [n, cols.length], re);
  return nargout >= 2 ? [y, tensor('double', [0, 1])] : y;
}

// ------------------------------------------------------------- xcorr2 / filtering

const xcorr2Fn = (args, nargout, ctx) => {
  const a = T(args[0], 'xcorr2'); const b = args[1] !== undefined ? T(args[1], 'xcorr2') : a;
  return call1(ctx, 'conv2', [a, call1(ctx, 'rot90', [call1(ctx, 'conj', [b]), num(2)])]);
};
function passFn(fn, kind) {
  return (args, nargout, ctx) => {
    if (args.length < 2) throw E(`${fn}:notEnoughInputs`, 'Not enough input arguments.');
    const x = T(args[0], fn);
    const w = Array.from(F(args[1]));
    const two = kind === 'bandpass' || kind === 'stop';
    if (two ? w.length !== 2 : w.length !== 1) throw E(`${fn}:badBand`, two ? 'Specify the band as a two-element vector.' : 'Specify the passband frequency as a scalar.');
    let fs = null, i = 2;
    if (args[i] !== undefined && !isText(args[i])) { fs = F(args[i])[0]; i++; }
    let order = 6;
    for (; i < args.length; i += 2) {
      const s = lstr(args[i]);
      if (s === 'steepness') { const st = Array.from(F(args[i + 1])); order = Math.max(2, Math.round(4 + 20 * (st[0] - 0.5))); }
      else if (s === 'impulseresponse' || s === 'stopbandattenuation') { /* accepted, IIR design is used */ }
      else throw E(`${fn}:badOption`, `Invalid option '${toStr(args[i])}'.`);
    }
    const Wn = w.map((v) => (fs ? v / (fs / 2) : v));
    if (Wn.some((v) => !(v > 0 && v < 1))) throw E(`${fn}:badFrequency`, 'Frequencies must lie strictly between 0 and the Nyquist frequency.');
    const Wv = tensor('double', [1, Wn.length], Float64Array.from(Wn));
    const bArgs = [num(two ? Math.ceil(order / 2) : order), Wv];
    if (kind !== 'low' && kind !== 'bandpass') bArgs.push(S(kind === 'high' ? 'high' : 'stop'));
    const [b, a] = call(ctx, 'butter', bArgs, 2);
    const isRow = x.dims.length === 2 && x.dims[0] === 1;
    const xin = isRow ? call1(ctx, 'transpose', [x]) : x;
    let y = call1(ctx, 'filtfilt', [b, a, xin]);
    if (isRow) y = call1(ctx, 'transpose', [y]);
    return y;
  };
}

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const builtins = {
  rms: rmsFn,
  rssq: rssqFn,
  peak2peak: peak2peakFn,
  peak2rms: peak2rmsFn,
  dct: (args) => dctApply(args, 'dct', false),
  idct: (args) => dctApply(args, 'idct', true),
  dct2: (args, nargout, ctx) => dct2Apply(args, 'dct2', false, ctx),
  idct2: (args, nargout, ctx) => dct2Apply(args, 'idct2', true, ctx),
  czt: cztFn,
  goertzel: goertzelFn,
  buffer: bufferFn,
  xcorr2: xcorr2Fn,
  lowpass: passFn('lowpass', 'low'),
  highpass: passFn('highpass', 'high'),
  bandpass: passFn('bandpass', 'bandpass'),
  bandstop: passFn('bandstop', 'stop'),
};
export const help = {
  rms: H('Root-mean-square value.', '제곱 평균 제곱근 값.', ['y = rms(x)', 'y = rms(x, dim)', "y = rms(x, 'all')", "y = rms(..., 'omitnan')"]),
  rssq: H('Root-sum-of-squares level.', '제곱합의 제곱근.', ['y = rssq(x)', 'y = rssq(x, dim)']),
  peak2peak: H('Maximum-to-minimum difference.', '최댓값과 최솟값의 차이.', ['y = peak2peak(x)', 'y = peak2peak(x, dim)']),
  peak2rms: H('Ratio of the largest absolute value to the RMS value.', '최대 절댓값과 RMS 의 비.', ['y = peak2rms(x)', 'y = peak2rms(x, dim)']),
  dct: H('Discrete cosine transform (orthonormal, types 1-4).', '이산 코사인 변환 (정규 직교, 유형 1-4).', ['y = dct(x)', 'y = dct(x, n)', 'y = dct(x, n, dim)', "y = dct(..., 'Type', 2)"]),
  idct: H('Inverse discrete cosine transform.', '역 이산 코사인 변환.', ['x = idct(y)', 'x = idct(y, n)', 'x = idct(y, n, dim)', "x = idct(..., 'Type', 2)"]),
  dct2: H('2-D discrete cosine transform.', '2차원 이산 코사인 변환.', ['B = dct2(A)', 'B = dct2(A, m, n)', 'B = dct2(A, [m n])']),
  idct2: H('2-D inverse discrete cosine transform.', '2차원 역 이산 코사인 변환.', ['B = idct2(A)', 'B = idct2(A, m, n)']),
  czt: H('Chirp Z-transform.', '처프 Z 변환.', ['y = czt(x)', 'y = czt(x, m, w, a)']),
  goertzel: H('DFT values at selected indices (Goertzel algorithm).', '선택한 인덱스의 DFT 값 (Goertzel 알고리즘).', ['dft = goertzel(data)', 'dft = goertzel(data, findx)', 'dft = goertzel(data, findx, dim)']),
  buffer: H('Buffers a signal vector into a matrix of data frames.', '신호 벡터를 데이터 프레임 행렬로 버퍼링.', ['y = buffer(x, n)', 'y = buffer(x, n, p)', 'y = buffer(x, n, p, opt)', "y = buffer(x, n, p, 'nodelay')"]),
  xcorr2: H('2-D cross-correlation.', '2차원 교차 상관.', ['C = xcorr2(A, B)', 'C = xcorr2(A)']),
  lowpass: H('Zero-phase lowpass filtering (Butterworth design).', '영위상 저역 통과 필터링 (버터워스 설계).', ['y = lowpass(x, wpass)', 'y = lowpass(x, fpass, fs)', "y = lowpass(..., 'Steepness', s)"]),
  highpass: H('Zero-phase highpass filtering (Butterworth design).', '영위상 고역 통과 필터링 (버터워스 설계).', ['y = highpass(x, wpass)', 'y = highpass(x, fpass, fs)']),
  bandpass: H('Zero-phase bandpass filtering (Butterworth design).', '영위상 대역 통과 필터링 (버터워스 설계).', ['y = bandpass(x, wpass)', 'y = bandpass(x, fpass, fs)']),
  bandstop: H('Zero-phase bandstop filtering (Butterworth design).', '영위상 대역 저지 필터링 (버터워스 설계).', ['y = bandstop(x, wstop)', 'y = bandstop(x, fstop, fs)']),
};
