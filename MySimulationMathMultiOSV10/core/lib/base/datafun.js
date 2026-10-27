// Data analysis: sum / prod / cumulative ops / max / min / mean / median /
// mode / std / var / range / bounds / diff / any / all / nnz, moving-window
// statistics, normalize / rescale, histcounts / histc, accumarray, isequal.
import {
  INT_RANGE, tensor, normDims, prod, isTensor, isSparse, isString, isCell, isStruct, isChar, isObject,
  isFuncHandle, toTensor, num, bool, cell, MError,
} from '../../value.js';
import {
  E, dense, finalize, optArg, textArg, firstNonSingleton, splitDims, dimsWith, permuteAny, reshapeAny,
  nameValues,
} from './util.js';
import { arithClass, mapReal } from './ops.js';

const isIntC = (c) => c in INT_RANGE;
const promoteCls = (c) => (c === 'logical' || c === 'char' ? 'double' : c);

function numIn(v, fname) {
  if (v === undefined) throw E(`base:${fname}:notEnoughInputs`, 'Not enough input arguments.');
  if (isTensor(v)) return v;
  if (isSparse(v)) return toTensor(v);
  throw E(`base:${fname}:invalidType`, `Invalid data type. First argument must be numeric or logical.`);
}

/** Parses dim / vecdim / 'all' / nanflag / outtype options. */
function reduceOpts(args, start, fname, defNan = 'includenan') {
  const o = { dim: null, all: false, vecdim: null, nan: defNan, outtype: 'default', extra: [] };
  for (let i = start; i < args.length; i++) {
    const a = args[i];
    const s = optArg(a);
    if (s !== null) {
      if (s === 'all') o.all = true;
      else if (s === 'omitnan' || s === 'omitmissing') o.nan = 'omitnan';
      else if (s === 'includenan' || s === 'includemissing') o.nan = 'includenan';
      else if (s === 'native' || s === 'double' || s === 'default') o.outtype = s;
      else if (s === 'linear') o.extra.push('linear');
      else if (s === 'reverse' || s === 'forward') o.extra.push(s);
      else throw E(`base:${fname}:invalidOption`, `Invalid option '${textArg(a)}'.`);
      continue;
    }
    const t = dense(a, fname);
    if (t.re.length === 0 && o.dim === null && i === start) { o.extra.push('[]'); continue; }
    if (t.re.length === 1) {
      if (!(t.re[0] >= 1) || !Number.isInteger(t.re[0])) throw E(`base:${fname}:invalidDim`, 'Dimension argument must be a positive integer scalar within indexing range.');
      o.dim = t.re[0] - 1;
    } else {
      const v = Array.from(t.re).map((x) => x - 1);
      if (v.some((x) => !(x >= 0) || !Number.isInteger(x)) || new Set(v).size !== v.length) throw E(`base:${fname}:invalidVecDim`, 'Vector of dimensions must be a vector of unique positive integers.');
      o.vecdim = v;
    }
  }
  return o;
}

/**
 * Applies a slice kernel along the chosen dimension(s). kernel(re, im|null, len)
 * returns [re, im] for the slice result (scalars) or a number.
 */
function reduce(t, o, kernel, fname) {
  let dims = t.dims;
  let src = t;
  let k;
  let outDims;
  if (o.all) {
    src = { ...t, dims: [t.re.length, 1] }; k = 0; outDims = [1, 1];
  } else if (o.vecdim) {
    const nd = Math.max(dims.length, ...o.vecdim.map((x) => x + 1));
    const d = dims.slice(); while (d.length < nd) d.push(1);
    const sel = o.vecdim.slice().sort((a, b) => a - b);
    const rest = []; for (let i = 0; i < nd; i++) if (!sel.includes(i)) rest.push(i);
    const p = permuteAny(t, [...sel, ...rest]);
    const lenSel = sel.reduce((acc, i) => acc * d[i], 1);
    const restDims = rest.map((i) => d[i]);
    src = reshapeAny(p, [lenSel, ...restDims, 1]);
    k = 0;
    outDims = d.map((x, i) => (sel.includes(i) ? 1 : x));
  } else {
    k = o.dim !== null ? o.dim : defaultDim(dims);
    outDims = dimsWith(dims, k, 1);
  }
  const sd = src.dims;
  const { before, len, after } = splitDims(sd, k);
  const nOut = before * after;
  const re = new Float64Array(nOut);
  let im = null;
  const sr = new Float64Array(len), si = src.im ? new Float64Array(len) : null;
  for (let a = 0; a < after; a++) for (let b = 0; b < before; b++) {
    const base = a * before * len + b;
    for (let q = 0; q < len; q++) { sr[q] = src.re[base + q * before]; if (si) si[q] = src.im[base + q * before]; }
    const r = kernel(sr, si, len);
    const pos = b + a * before;
    if (typeof r === 'number') re[pos] = r;
    else { re[pos] = r[0]; if (r[1]) { if (!im) im = new Float64Array(nOut); im[pos] = r[1]; } }
  }
  return { dims: normDims(outDims), re, im };
}
/** Default reduction dimension: first non-singleton; a 0x0 input reduces to 1x1. */
function defaultDim(dims) {
  return firstNonSingleton(dims);
}
function isEmpty00(t) { return t.dims.length === 2 && t.dims[0] === 0 && t.dims[1] === 0; }

function sumLike(fname, isProd) {
  return (args) => {
    const t = numIn(args[0], fname);
    const o = reduceOpts(args, 1, fname);
    let cls;
    if (o.outtype === 'double') cls = 'double';
    else if (o.outtype === 'native') cls = t.cls === 'char' ? (() => { throw E(`base:${fname}:nativeChar`, "'native' is not supported for char inputs."); })() : t.cls;
    else cls = isIntC(t.cls) || t.cls === 'single' ? t.cls : 'double';
    if (isEmpty00(t) && o.dim === null && !o.vecdim) return finalize(cls, [1, 1], Float64Array.of(isProd ? 1 : 0));
    const omit = o.nan === 'omitnan';
    const r = reduce(t, o, (re, im, len) => {
      if (isProd) {
        let pr = 1, pi = 0;
        for (let i = 0; i < len; i++) {
          const a = re[i], b = im ? im[i] : 0;
          if (omit && (a !== a || b !== b)) continue;
          if (b === 0 && pi === 0) pr *= a; else { const nr = pr * a - pi * b; pi = pr * b + pi * a; pr = nr; }
        }
        return [pr, pi];
      }
      let s = 0, si = 0;
      for (let i = 0; i < len; i++) { const a = re[i]; if (omit && a !== a) continue; s += a; if (im) si += im[i]; }
      return [s, si];
    }, fname);
    return finalize(cls, r.dims, r.re, r.im);
  };
}

function cumLike(fname, op) {
  return (args) => {
    const t = numIn(args[0], fname);
    const o = reduceOpts(args, 1, fname);
    const reverse = o.extra.includes('reverse');
    const k = o.dim !== null ? o.dim : firstNonSingleton(t.dims);
    const cls = isIntC(t.cls) || t.cls === 'single' ? t.cls : 'double';
    const { before, len, after } = splitDims(t.dims, k);
    const n = t.re.length;
    const re = new Float64Array(n);
    const im = t.im && (op === 'sum' || op === 'prod') ? new Float64Array(n) : null;
    const omit = o.nan === 'omitnan' || op === 'max' || op === 'min' ? o.nan !== 'includenan' || op === 'max' || op === 'min' : false;
    const omitNaN = op === 'max' || op === 'min' ? o.nan !== 'includenan' : o.nan === 'omitnan';
    for (let a = 0; a < after; a++) for (let b = 0; b < before; b++) {
      const base = a * before * len + b;
      let acc = op === 'prod' ? 1 : op === 'sum' ? 0 : NaN, acci = 0;
      for (let q0 = 0; q0 < len; q0++) {
        const q = reverse ? len - 1 - q0 : q0;
        const p = base + q * before;
        const x = t.re[p], xi = t.im ? t.im[p] : 0;
        if (op === 'sum') { if (!(omitNaN && x !== x)) { acc += x; acci += xi; } } else if (op === 'prod') {
          if (!(omitNaN && x !== x)) { if (xi === 0 && acci === 0) acc *= x; else { const nr = acc * x - acci * xi; acci = acc * xi + acci * x; acc = nr; } }
        } else if (op === 'max') { if (x === x) { if (acc !== acc || x > acc) acc = x; } else if (!omitNaN) acc = NaN; } else if (op === 'min') { if (x === x) { if (acc !== acc || x < acc) acc = x; } else if (!omitNaN) acc = NaN; }
        re[p] = acc; if (im) im[p] = acci;
      }
    }
    void omit;
    return finalize(cls, t.dims, re, im);
  };
}

// ------------------------------------------------------------- max / min

const cmpGreater = (a, ai, b, bi, isMax, complex) => {
  if (complex) {
    const ma = Math.hypot(a, ai), mb = Math.hypot(b, bi);
    if (ma !== mb) return isMax ? ma > mb : ma < mb;
    const pa = Math.atan2(ai, a), pb = Math.atan2(bi, b);
    return isMax ? pa > pb : pa < pb;
  }
  return isMax ? a > b : a < b;
};

function minmax(fname, isMax) {
  return (args, nargout) => {
    if (args.length < 1) throw E(`base:${fname}:notEnoughInputs`, 'Not enough input arguments.');
    const A = numIn(args[0], fname);
    // two-array form max(A, B)
    if (args.length >= 2 && !(isTensor(args[1]) && args[1].re.length === 0 && args[1].dims[0] === 0 && args[1].dims[1] === 0) && optArg(args[1]) === null) {
      if (nargout > 1) throw E(`base:${fname}:TwoInTwoOutCaseNotSupported`, `${fname.toUpperCase()} with two matrices to compare and two output arguments is not supported.`);
      const B = numIn(args[1], fname);
      const o = reduceOpts(args, 2, fname, 'omitnan');
      const cls = A.cls === 'logical' && B.cls === 'logical' ? 'double' : promoteCls(arithClass(A, B, fname));
      if (A.im || B.im) {
        const m = mapReal({ ...A, re: Float64Array.from(A.re, (_, i) => i) }, { ...B, re: Float64Array.from(B.re, (_, i) => i) }, (i, j) => i * 1e9 + j, fname);
        const re = new Float64Array(m.re.length), im = new Float64Array(m.re.length);
        for (let q = 0; q < m.re.length; q++) {
          const i = Math.floor(m.re[q] / 1e9), j = m.re[q] - i * 1e9;
          const a = A.re[i], ai = A.im ? A.im[i] : 0, b = B.re[j], bi = B.im ? B.im[j] : 0;
          const pickB = a !== a ? o.nan !== 'includenan' : b !== b ? o.nan === 'includenan' : cmpGreater(b, bi, a, ai, isMax, true);
          re[q] = pickB ? b : a; im[q] = pickB ? bi : ai;
        }
        return finalize(cls, m.dims, re, im);
      }
      const inc = o.nan === 'includenan';
      const r = mapReal(A, B, (a, b) => {
        if (a !== a) return inc ? NaN : b;
        if (b !== b) return inc ? NaN : a;
        return isMax ? (b > a ? b : a) : (b < a ? b : a);
      }, fname);
      return finalize(cls, r.dims, r.re);
    }
    const o = reduceOpts(args, 1, fname, 'omitnan');
    const cls = promoteCls(A.cls);
    if (isEmpty00(A) && o.dim === null && !o.vecdim && !o.all) return nargout >= 2 ? [tensor(cls, [0, 0]), tensor('double', [0, 0])] : tensor(cls, [0, 0]);
    const complex = !!A.im;
    const inc = o.nan === 'includenan';
    const idx = [];
    const r = reduce(A, o, (re, im, len) => {
      let best = -1;
      for (let i = 0; i < len; i++) {
        const x = re[i], xi = im ? im[i] : 0;
        if (x !== x || xi !== xi) { if (inc) { best = i; break; } continue; }
        if (best < 0 || cmpGreater(x, xi, re[best], im ? im[best] : 0, isMax, complex)) best = i;
      }
      if (best < 0) { idx.push(len ? 0 : NaN); return len ? [NaN, 0] : [NaN, 0]; }
      idx.push(best);
      return [re[best], im ? im[best] : 0];
    }, fname);
    // an empty reduction dimension gives an empty result
    const k = o.all ? -1 : o.dim !== null ? o.dim : firstNonSingleton(A.dims);
    if (k >= 0 && !o.vecdim && (k < A.dims.length ? A.dims[k] : 1) === 0) {
      const ed = dimsWith(A.dims, k, 0);
      return nargout >= 2 ? [tensor(cls, ed), tensor('double', ed)] : tensor(cls, ed);
    }
    const M = finalize(cls, r.dims, r.re, r.im);
    if (nargout < 2) return M;
    let I;
    if (o.extra.includes('linear') || o.all) {
      // linear indices into A
      const kk = o.all ? 0 : k;
      const { before, len } = splitDims(o.all ? [A.re.length, 1] : A.dims, kk);
      I = Float64Array.from(idx, (q, p) => { const b = p % before, a = Math.floor(p / before); return a * before * len + b + q * before + 1; });
    } else I = Float64Array.from(idx, (q) => q + 1);
    return [M, tensor('double', r.dims, I)];
  };
}

// ------------------------------------------------------------- mean / median / mode / var / std

function meanFn(args) {
  const t = numIn(args[0], 'mean');
  const o = reduceOpts(args, 1, 'mean');
  let cls = o.outtype === 'native' ? t.cls : t.cls === 'single' ? 'single' : 'double';
  if (o.outtype === 'double') cls = 'double';
  if (isEmpty00(t) && o.dim === null && !o.vecdim) return tensor(cls, [1, 1], [NaN]);
  const omit = o.nan === 'omitnan';
  const r = reduce(t, o, (re, im, len) => {
    let s = 0, si = 0, c = 0;
    for (let i = 0; i < len; i++) { const x = re[i]; if (omit && (x !== x || (im && im[i] !== im[i]))) continue; s += x; if (im) si += im[i]; c++; }
    return [s / c, si / c];
  }, 'mean');
  return finalize(cls, r.dims, r.re, r.im);
}

function medianOf(re, len, omit) {
  const a = [];
  for (let i = 0; i < len; i++) { const x = re[i]; if (x !== x) { if (!omit) return NaN; continue; } a.push(x); }
  if (!a.length) return NaN;
  a.sort((x, y) => x - y);
  const h = a.length >> 1;
  if (a.length % 2) return a[h];
  const lo = a[h - 1], hi = a[h];
  if (lo === hi) return lo;
  if ((lo === Infinity && hi === Infinity) || (lo === -Infinity && hi === -Infinity)) return lo;
  return lo + (hi - lo) / 2;
}

function medianFn(args) {
  const t = numIn(args[0], 'median');
  const o = reduceOpts(args, 1, 'median');
  const cls = o.outtype === 'double' ? 'double' : promoteCls(t.cls);
  if (isEmpty00(t) && o.dim === null && !o.vecdim) return tensor(cls, [1, 1], [NaN]);
  const r = reduce(t, o, (re, im, len) => medianOf(re, len, o.nan === 'omitnan'), 'median');
  return finalize(cls, r.dims, r.re);
}

function modeFn(args, nargout) {
  const t = numIn(args[0], 'mode');
  const o = reduceOpts(args, 1, 'mode');
  const cls = promoteCls(t.cls);
  const freqs = [], ties = [];
  if (isEmpty00(t) && o.dim === null) {
    const out = [tensor(cls, [1, 1], [NaN]), num(0), cell([1, 1], [tensor(cls, [0, 0])])];
    return nargout <= 1 ? out[0] : out.slice(0, nargout);
  }
  const r = reduce(t, o, (re, im, len) => {
    const a = []; for (let i = 0; i < len; i++) if (re[i] === re[i]) a.push(re[i]);
    a.sort((x, y) => x - y);
    let best = NaN, bestN = 0, cur = NaN, n = 0;
    const all = [];
    for (let i = 0; i <= a.length; i++) {
      if (i < a.length && a[i] === cur) { n++; continue; }
      if (n > bestN) { bestN = n; best = cur; all.length = 0; all.push(cur); } else if (n === bestN && n > 0) all.push(cur);
      if (i < a.length) { cur = a[i]; n = 1; }
    }
    freqs.push(bestN); ties.push(all.slice());
    return bestN ? best : NaN;
  }, 'mode');
  const M = finalize(cls, r.dims, r.re);
  if (nargout <= 1) return M;
  const F = tensor('double', r.dims, freqs);
  const C = cell(r.dims, ties.map((v) => finalize(cls, [v.length, 1], Float64Array.from(v))));
  return [M, F, C].slice(0, nargout);
}

function varLike(fname, isStd) {
  return (args, nargout) => {
    const t = numIn(args[0], fname);
    if (isIntC(t.cls)) throw E(`base:${fname}:integerClass`, `Invalid data type. First argument must be single or double.`);
    let w = null;
    let rest = 1;
    if (args.length > 1 && optArg(args[1]) === null) {
      const wt = dense(args[1], fname);
      if (wt.re.length === 0) w = 0;
      else if (wt.re.length === 1) { w = wt.re[0]; if (w !== 0 && w !== 1) throw E(`base:${fname}:invalidWgts`, 'W must be a vector of nonnegative weights, or a scalar 0 or 1.'); } else w = Float64Array.from(wt.re);
      rest = 2;
    }
    const o = reduceOpts(args, rest, fname);
    const cls = t.cls === 'single' ? 'single' : 'double';
    if (isEmpty00(t) && o.dim === null && !o.vecdim) { const z = tensor(cls, [1, 1], [NaN]); return nargout >= 2 ? [z, tensor(cls, [1, 1], [NaN])] : z; }
    const omit = o.nan === 'omitnan';
    const means = [];
    const r = reduce(t, o, (re, im, len) => {
      const xs = [], xis = [], ws = [];
      for (let i = 0; i < len; i++) {
        if (omit && (re[i] !== re[i] || (im && im[i] !== im[i]))) continue;
        xs.push(re[i]); xis.push(im ? im[i] : 0); ws.push(w instanceof Float64Array ? w[i] : 1);
      }
      const n = xs.length;
      if (w instanceof Float64Array && w.length !== len) throw E(`base:${fname}:invalidSizeWgts`, 'The length of W must be compatible with X.');
      const W = ws.reduce((a, b) => a + b, 0);
      let mr = 0, mi = 0;
      for (let i = 0; i < n; i++) { mr += ws[i] * xs[i]; mi += ws[i] * xis[i]; }
      mr /= W; mi /= W;
      means.push([mr, mi]);
      if (n === 0) return NaN;
      let s = 0;
      for (let i = 0; i < n; i++) { const dr = xs[i] - mr, di = xis[i] - mi; s += ws[i] * (dr * dr + di * di); }
      let v;
      if (w instanceof Float64Array) v = s / W;
      else if (w === 1) v = s / n;
      else v = n === 1 ? 0 : s / (n - 1);
      return isStd ? Math.sqrt(v) : v;
    }, fname);
    const S = finalize(cls, r.dims, r.re);
    if (nargout >= 2) {
      const M = finalize(cls, r.dims, Float64Array.from(means, (m) => m[0]), t.im ? Float64Array.from(means, (m) => m[1]) : null);
      return [S, M];
    }
    return S;
  };
}

function rangeFn(args) {
  const mx = minmax('range', true)([args[0], tensor('double', [0, 0]), ...args.slice(1)], 1);
  const mn = minmax('range', false)([args[0], tensor('double', [0, 0]), ...args.slice(1)], 1);
  const r = mapReal(mx, mn, (a, b) => a - b, 'range');
  return finalize(mx.cls, r.dims, r.re);
}

function diffFn(args) {
  let t = numIn(args[0], 'diff');
  const n = args.length > 1 && !(isTensor(args[1]) && args[1].re.length === 0) ? dense(args[1], 'diff').re[0] : 1;
  if (!(n >= 0) || !Number.isInteger(n)) throw E('base:diff:differenceOrderMustBePositiveInteger', 'Difference order N must be a positive integer scalar.');
  let k = args.length > 2 ? dense(args[2], 'diff').re[0] - 1 : -1;
  const cls = promoteCls(t.cls);
  for (let step = 0; step < n; step++) {
    const kk = k >= 0 ? k : firstNonSingleton(t.dims);
    const { before, len, after } = splitDims(t.dims, kk);
    if (len <= 0) break;
    const nl = len - 1;
    const re = new Float64Array(before * nl * after), im = t.im ? new Float64Array(re.length) : null;
    for (let a = 0; a < after; a++) for (let q = 0; q < nl; q++) for (let b = 0; b < before; b++) {
      const p0 = a * before * len + q * before + b, p1 = p0 + before;
      const o = a * before * nl + q * before + b;
      re[o] = t.re[p1] - t.re[p0];
      if (im) im[o] = t.im[p1] - t.im[p0];
    }
    t = { cls: t.cls, dims: dimsWith(t.dims, kk, nl), re, im };
  }
  return finalize(cls === 'logical' ? 'double' : cls, t.dims, Float64Array.from(t.re), t.im ? Float64Array.from(t.im) : null);
}

function anyAll(fname, isAll) {
  return (args) => {
    const v = args[0];
    if (v === undefined) throw E(`base:${fname}:notEnoughInputs`, 'Not enough input arguments.');
    if (!isTensor(v) && !isSparse(v)) throw E(`base:${fname}:invalidType`, `Function '${fname}' is not supported for values of class '${v.cls}'.`);
    const t = toTensor(v);
    const o = reduceOpts(args, 1, fname);
    if (isEmpty00(t) && o.dim === null && !o.vecdim) return bool(isAll);
    const r = reduce(t, o, (re, im, len) => {
      for (let i = 0; i < len; i++) {
        const nz = (re[i] !== 0 && re[i] === re[i]) || (im && im[i] !== 0 && im[i] === im[i]);
        const nan = re[i] !== re[i];
        if (isAll) { if (!nz && !nan) return 0; } else if (nz) return 1;
      }
      return isAll ? 1 : 0;
    }, fname);
    return { cls: 'logical', dims: r.dims, re: r.re, im: null };
  };
}

// ------------------------------------------------------------- moving window statistics

function movFn(fname, kernel) {
  return (args) => {
    if (args.length < 2) throw E(`base:${fname}:notEnoughInputs`, 'Not enough input arguments.');
    const t = numIn(args[0], fname);
    const kv = dense(args[1], fname).re;
    let kb, kf;
    if (kv.length === 1) {
      const k = kv[0];
      if (!(k > 0)) throw E(`base:${fname}:invalidWindow`, 'Window length must be a finite positive scalar or a 2-element vector of nonnegative values.');
      if (Number.isInteger(k) && k % 2 === 1) { kb = kf = (k - 1) / 2; } else if (Number.isInteger(k)) { kb = k / 2; kf = k / 2 - 1; } else { kb = kf = Math.floor(k / 2); }
    } else { kb = kv[0]; kf = kv[1]; }
    let dim = -1, endpoints = 'shrink', fillv = NaN, omit = false;
    let i = 2;
    if (i < args.length && optArg(args[i]) === null) { dim = dense(args[i], fname).re[0] - 1; i++; }
    for (; i < args.length; i++) {
      const s = optArg(args[i]);
      if (s === 'omitnan' || s === 'omitmissing') omit = true;
      else if (s === 'includenan' || s === 'includemissing') omit = false;
      else if (s === 'endpoints') {
        const v = args[++i]; const e = optArg(v);
        if (e === null) { endpoints = 'fill'; fillv = dense(v, fname).re[0]; } else endpoints = e;
      } else if (s === 'samplepoints') i++;
      else throw E(`base:${fname}:invalidOption`, `Invalid option '${textArg(args[i])}'.`);
    }
    if (dim < 0) dim = firstNonSingleton(t.dims);
    const { before, len, after } = splitDims(t.dims, dim);
    const outLen = endpoints === 'discard' ? Math.max(0, len - kb - kf) : len;
    const re = new Float64Array(before * outLen * after);
    const win = [];
    for (let a = 0; a < after; a++) for (let b = 0; b < before; b++) {
      const base = a * before * len + b;
      let o = 0;
      for (let q = 0; q < len; q++) {
        const lo = q - kb, hi = q + kf;
        if (endpoints === 'discard' && (lo < 0 || hi > len - 1)) continue;
        win.length = 0;
        let fill = false;
        for (let p = lo; p <= hi; p++) {
          if (p < 0 || p >= len) { if (endpoints === 'fill') fill = true; continue; }
          const x = t.re[base + p * before];
          if (omit && x !== x) continue;
          win.push(x);
        }
        re[a * before * outLen + o * before + b] = fill ? fillv : kernel(win);
        o++;
      }
    }
    const cls = t.cls === 'single' ? 'single' : 'double';
    return finalize(cls, dimsWith(t.dims, dim, outLen), re);
  };
}
const kSum = (w) => w.reduce((a, b) => a + b, 0);
const kMean = (w) => (w.length ? kSum(w) / w.length : NaN);
const kVar = (w) => { const n = w.length; if (n === 0) return NaN; if (n === 1) return 0; const m = kMean(w); let s = 0; for (const x of w) s += (x - m) ** 2; return s / (n - 1); };

// ------------------------------------------------------------- normalize / rescale

function normalizeFn(args) {
  const t = numIn(args[0], 'normalize');
  let i = 1, dim = firstNonSingleton(t.dims);
  if (i < args.length && optArg(args[i]) === null) { dim = dense(args[i], 'normalize').re[0] - 1; i++; }
  let method = 'zscore', opt = null;
  let center = null, scale = null;
  for (; i < args.length; i++) {
    const s = optArg(args[i]);
    if (['zscore', 'range', 'norm', 'center', 'scale', 'medianiqr'].includes(s)) {
      method = s;
      if (i + 1 < args.length && (optArg(args[i + 1]) === null || ['std', 'robust', 'mean', 'median', 'mad', 'first', 'iqr'].includes(optArg(args[i + 1])))) { opt = args[++i]; }
    } else throw E('base:normalize:invalidMethod', `Invalid normalization method '${textArg(args[i])}'.`);
  }
  const { before, len, after } = splitDims(t.dims, dim);
  const re = new Float64Array(t.re.length);
  for (let a = 0; a < after; a++) for (let b = 0; b < before; b++) {
    const base = a * before * len + b;
    const x = []; for (let q = 0; q < len; q++) x.push(t.re[base + q * before]);
    let y;
    const vals = x.filter((v) => v === v);
    const mean = kMean(vals), sd = Math.sqrt(kVar(vals));
    if (method === 'zscore') {
      const o = opt ? optArg(opt) : 'std';
      if (o === 'robust') { const med = medianOf(Float64Array.from(vals), vals.length, true); const mad = medianOf(Float64Array.from(vals.map((v) => Math.abs(v - med))), vals.length, true); y = x.map((v) => (v - med) / mad); } else y = x.map((v) => (v - mean) / sd);
    } else if (method === 'range') {
      let lo = 0, hi = 1;
      if (opt) { const r = dense(opt, 'normalize').re; lo = r[0]; hi = r[1]; }
      const mn = Math.min(...vals), mx = Math.max(...vals);
      y = x.map((v) => (mx === mn ? lo : lo + (v - mn) / (mx - mn) * (hi - lo)));
    } else if (method === 'norm') {
      const p = opt ? dense(opt, 'normalize').re[0] : 2;
      const nrm = p === Infinity ? Math.max(...vals.map(Math.abs)) : vals.reduce((s, v) => s + Math.abs(v) ** p, 0) ** (1 / p);
      y = x.map((v) => v / nrm);
    } else if (method === 'center') {
      let c = mean;
      if (opt) { const o = optArg(opt); if (o === 'median') c = medianOf(Float64Array.from(vals), vals.length, true); else if (o === null) c = dense(opt, 'normalize').re[0]; }
      y = x.map((v) => v - c);
    } else if (method === 'scale') {
      let s = sd;
      if (opt) {
        const o = optArg(opt);
        if (o === 'mad') { const med = medianOf(Float64Array.from(vals), vals.length, true); s = medianOf(Float64Array.from(vals.map((v) => Math.abs(v - med))), vals.length, true); } else if (o === 'first') s = x[0];
        else if (o === null) s = dense(opt, 'normalize').re[0];
      }
      y = x.map((v) => v / s);
    } else {
      const med = medianOf(Float64Array.from(vals), vals.length, true);
      const sorted = vals.slice().sort((p, q) => p - q);
      const q1 = quantileSorted(sorted, 0.25), q3 = quantileSorted(sorted, 0.75);
      y = x.map((v) => (v - med) / (q3 - q1));
    }
    for (let q = 0; q < len; q++) re[base + q * before] = y[q];
    void center; void scale;
  }
  return finalize(t.cls === 'single' ? 'single' : 'double', t.dims, re);
}
function quantileSorted(s, p) {
  const n = s.length;
  if (!n) return NaN;
  const pos = n * p - 0.5;
  if (pos <= 0) return s[0];
  if (pos >= n - 1) return s[n - 1];
  const lo = Math.floor(pos);
  return s[lo] + (pos - lo) * (s[lo + 1] - s[lo]);
}

function rescaleFn(args) {
  const t = numIn(args[0], 'rescale');
  let lo = 0, hi = 1, i = 1;
  if (args.length >= 3 && optArg(args[1]) === null) { lo = dense(args[1], 'rescale').re[0]; hi = dense(args[2], 'rescale').re[0]; i = 3; }
  const nv = nameValues(args, i, 'rescale', ['InputMin', 'InputMax']);
  const vals = Array.from(t.re).filter((v) => v === v);
  let mn = nv.has('inputmin') ? dense(nv.get('inputmin'), 'rescale').re[0] : Math.min(...vals);
  let mx = nv.has('inputmax') ? dense(nv.get('inputmax'), 'rescale').re[0] : Math.max(...vals);
  const re = Float64Array.from(t.re, (v) => {
    const c = Math.min(Math.max(v, mn), mx);
    return mx === mn ? lo : lo + (c - mn) / (mx - mn) * (hi - lo);
  });
  return finalize(t.cls === 'single' ? 'single' : 'double', t.dims, re);
}

// ------------------------------------------------------------- histcounts

const realmaxD = Number.MAX_VALUE;
function epsD(x) { x = Math.abs(x); if (x === 0) return 4.9e-324; let e = Math.floor(Math.log2(x)); if (2 ** e > x) e--; return 2 ** (e - 52); }

export function binPicker(xmin, xmax, nbins, rawBinWidth) {
  const xscale = Math.max(Math.abs(xmin), Math.abs(xmax));
  const xrange = xmax - xmin;
  rawBinWidth = Math.max(rawBinWidth, epsD(xscale));
  let leftEdge, rightEdge, binWidth;
  if (xrange > Math.max(Math.sqrt(epsD(xscale)), 2.2250738585072014e-308)) {
    const powOfTen = 10 ** Math.floor(Math.log10(rawBinWidth));
    const relSize = rawBinWidth / powOfTen;
    if (relSize < 1.5) binWidth = powOfTen; else if (relSize < 2.5) binWidth = 2 * powOfTen; else if (relSize < 4) binWidth = 3 * powOfTen; else if (relSize < 7.5) binWidth = 5 * powOfTen; else binWidth = 10 * powOfTen;
    if (nbins == null) {
      leftEdge = Math.max(Math.min(binWidth * Math.floor(xmin / binWidth), xmin), -realmaxD);
      const nb = Math.max(1, Math.ceil((xmax - leftEdge) / binWidth));
      rightEdge = Math.min(Math.max(leftEdge + nb * binWidth, xmax), realmaxD);
      nbins = nb;
    } else {
      binWidth = 10 ** Math.floor(Math.log10(xrange));
      leftEdge = Math.max(Math.min(binWidth * Math.floor(xmin / binWidth), xmin), -realmaxD);
      if (nbins > 1) {
        const ll = (xmax - leftEdge) / nbins, ul = (xmax - leftEdge) / (nbins - 1);
        const p10 = 10 ** Math.floor(Math.log10(ul - ll));
        binWidth = p10 * Math.ceil(ll / p10);
      }
      rightEdge = Math.max(Math.min(leftEdge + nbins * binWidth, realmaxD), xmax);
    }
  } else {
    if (nbins == null) nbins = 1;
    const binRange = Math.max(1, Math.ceil(nbins * epsD(xscale)));
    leftEdge = Math.floor(2 * (xmin - binRange / 4)) / 2;
    rightEdge = Math.ceil(2 * (xmax + binRange / 4)) / 2;
    binWidth = (rightEdge - leftEdge) / nbins;
  }
  const edges = [];
  if (!Number.isFinite(binWidth)) { for (let i = 0; i <= nbins; i++) edges.push(leftEdge + (rightEdge - leftEdge) * i / nbins); } else {
    edges.push(leftEdge);
    for (let i = 1; i < nbins; i++) edges.push(leftEdge + i * binWidth);
    edges.push(rightEdge);
  }
  return edges;
}

function autoEdges(x, method, binLimits) {
  let xmin, xmax;
  if (binLimits) { [xmin, xmax] = binLimits; } else {
    xmin = Infinity; xmax = -Infinity;
    for (const v of x) if (Number.isFinite(v)) { if (v < xmin) xmin = v; if (v > xmax) xmax = v; }
    if (xmin === Infinity) { xmin = 0; xmax = 1; }
  }
  const fin = x.filter((v) => Number.isFinite(v) && v >= xmin && v <= xmax);
  const n = fin.length;
  if (method === 'auto' || method === 'integers') {
    const allInt = fin.every((v) => Number.isInteger(v));
    if (method === 'integers' || (allInt && xmax - xmin <= 50)) {
      if (xmax - xmin > 65536) return binPicker(xmin, xmax, null, (xmax - xmin) / 65536);
      const lo = Math.floor(xmin) - 0.5, hi = Math.ceil(xmax) + 0.5;
      const e = []; for (let v = lo; v <= hi + 1e-9; v++) e.push(v);
      if (e.length < 2) e.push(lo + 1);
      return e;
    }
  }
  if (method === 'auto' || method === 'scott') {
    const m = n ? fin.reduce((a, b) => a + b, 0) / n : 0;
    const sd = n > 1 ? Math.sqrt(fin.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1)) : 0;
    const bw = 3.5 * sd / Math.cbrt(Math.max(n, 1));
    return binPicker(xmin, xmax, null, bw);
  }
  if (method === 'fd') {
    const s = fin.slice().sort((a, b) => a - b);
    const iqr = quantileSorted(s, 0.75) - quantileSorted(s, 0.25);
    return binPicker(xmin, xmax, null, 2 * iqr * Math.cbrt(1 / Math.max(n, 1)));
  }
  if (method === 'sturges') return binPicker(xmin, xmax, Math.max(1, Math.ceil(Math.log2(n) + 1)), (xmax - xmin) / Math.max(1, Math.ceil(Math.log2(n) + 1)));
  if (method === 'sqrt') { const nb = Math.max(1, Math.ceil(Math.sqrt(n))); return binPicker(xmin, xmax, nb, (xmax - xmin) / nb); }
  throw E('base:histcounts:invalidBinMethod', `Invalid bin method '${method}'.`);
}

function histcountsFn(args, nargout) {
  if (args.length < 1) throw E('base:histcounts:notEnoughInputs', 'Not enough input arguments.');
  const t = numIn(args[0], 'histcounts');
  const x = Array.from(t.re);
  let edges = null, nbins = null, i = 1;
  if (i < args.length && optArg(args[i]) === null) {
    const e = dense(args[i], 'histcounts');
    if (e.re.length === 1) { nbins = e.re[0]; if (!(nbins >= 1) || !Number.isInteger(nbins)) throw E('base:histcounts:invalidNumBins', 'Number of bins must be a positive integer.'); } else edges = Array.from(e.re);
    i++;
  }
  const nv = nameValues(args, i, 'histcounts', ['BinWidth', 'BinLimits', 'Normalization', 'BinMethod', 'NumBins', 'BinEdges']);
  if (nv.has('binedges')) edges = Array.from(dense(nv.get('binedges'), 'histcounts').re);
  if (nv.has('numbins')) nbins = dense(nv.get('numbins'), 'histcounts').re[0];
  const limits = nv.has('binlimits') ? Array.from(dense(nv.get('binlimits'), 'histcounts').re) : null;
  if (!edges) {
    if (nv.has('binwidth')) {
      const bw = dense(nv.get('binwidth'), 'histcounts').re[0];
      let xmin, xmax;
      if (limits) [xmin, xmax] = limits; else { const f = x.filter(Number.isFinite); xmin = Math.min(...f); xmax = Math.max(...f); }
      const left = limits ? xmin : bw * Math.floor(xmin / bw);
      const nb = Math.max(1, Math.ceil((xmax - left) / bw));
      edges = []; for (let k = 0; k <= nb; k++) edges.push(left + k * bw);
      if (limits) edges[edges.length - 1] = xmax;
    } else if (nbins !== null) {
      let xmin, xmax;
      if (limits) [xmin, xmax] = limits; else { const f = x.filter(Number.isFinite); xmin = f.length ? Math.min(...f) : 0; xmax = f.length ? Math.max(...f) : 1; }
      if (limits) { edges = []; for (let k = 0; k <= nbins; k++) edges.push(xmin + (xmax - xmin) * k / nbins); } else edges = binPicker(xmin, xmax, nbins, (xmax - xmin) / nbins);
    } else {
      const m = nv.has('binmethod') ? optArg(nv.get('binmethod')) : 'auto';
      edges = autoEdges(x, m, limits);
    }
  }
  const nb = edges.length - 1;
  const counts = new Float64Array(Math.max(nb, 0));
  const bin = new Float64Array(x.length);
  for (let q = 0; q < x.length; q++) {
    const v = x[q];
    if (!(v >= edges[0]) || !(v <= edges[nb])) continue;
    let lo = 0, hi = nb - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (edges[mid] <= v) lo = mid; else hi = mid - 1; }
    counts[lo]++; bin[q] = lo + 1;
  }
  const norm = nv.has('normalization') ? optArg(nv.get('normalization')) : 'count';
  let N = counts;
  const total = x.length;
  const widths = Float64Array.from({ length: nb }, (_, k) => edges[k + 1] - edges[k]);
  if (norm === 'probability') N = Float64Array.from(counts, (c) => c / total);
  else if (norm === 'countdensity') N = Float64Array.from(counts, (c, k) => c / widths[k]);
  else if (norm === 'pdf') N = Float64Array.from(counts, (c, k) => c / total / widths[k]);
  else if (norm === 'cumcount') { let s = 0; N = Float64Array.from(counts, (c) => (s += c)); } else if (norm === 'cdf') { let s = 0; N = Float64Array.from(counts, (c) => (s += c) / total); } else if (norm !== 'count') throw E('base:histcounts:invalidNormalization', `Invalid normalization '${norm}'.`);
  const out = [tensor('double', [1, nb], N), tensor('double', [1, edges.length], edges), tensor('double', t.dims, bin)];
  return nargout <= 1 ? out[0] : out.slice(0, nargout);
}

function histcFn(args, nargout) {
  const t = numIn(args[0], 'histc');
  const e = Array.from(dense(args[1], 'histc').re);
  const n = e.length;
  const counts = new Float64Array(n);
  const bin = new Float64Array(t.re.length);
  for (let q = 0; q < t.re.length; q++) {
    const v = t.re[q];
    if (v === e[n - 1]) { counts[n - 1]++; bin[q] = n; continue; }
    for (let k = 0; k < n - 1; k++) if (v >= e[k] && v < e[k + 1]) { counts[k]++; bin[q] = k + 1; break; }
  }
  const isRow = t.dims[0] === 1;
  const N = tensor('double', isRow ? [1, n] : [n, 1], counts);
  return nargout >= 2 ? [N, tensor('double', t.dims, bin)] : N;
}

// ------------------------------------------------------------- accumarray

function accumarrayFn(args, nargout, ctx) {
  if (args.length < 2) throw E('base:accumarray:notEnoughInputs', 'Not enough input arguments.');
  const S = numIn(args[0], 'accumarray');
  const V = numIn(args[1], 'accumarray');
  let m, nd;
  if (S.dims[1] === 1 || (S.dims[0] === 1 && S.dims[1] > 1 && false)) { m = S.dims[0]; nd = 1; } else { m = S.dims[0]; nd = S.dims[1]; }
  if (S.dims[0] === 1 && S.dims[1] > 1 && V.re.length === S.re.length) { m = S.re.length; nd = 1; }
  const subs = [];
  for (let q = 0; q < m; q++) {
    const s = [];
    for (let d = 0; d < nd; d++) { const x = S.re[q + d * m]; if (!(x >= 1) || !Number.isInteger(x)) throw E('base:accumarray:InvalidSubscripts', 'First input SUBS must contain positive integer subscripts.'); s.push(x - 1); }
    subs.push(s);
  }
  if (V.re.length !== 1 && V.re.length !== m) throw E('base:accumarray:LengthMismatch', 'Second input VAL must be a vector with one element for each row in SUBS, or a scalar.');
  let sz = null;
  if (args.length > 2 && !(isTensor(args[2]) && args[2].re.length === 0)) sz = Array.from(dense(args[2], 'accumarray').re);
  const maxs = Array.from({ length: nd }, (_, d) => subs.reduce((a, s) => Math.max(a, s[d] + 1), 0));
  let od = sz ? sz.slice() : nd === 1 ? [maxs[0], 1] : maxs;
  if (sz) for (let d = 0; d < nd; d++) if (maxs[d] > (od[d] || 1)) throw E('base:accumarray:SubsOutOfRange', 'Index exceeds the output size.');
  od = normDims(od);
  const fn = args.length > 3 && !(isTensor(args[3]) && args[3].re.length === 0) ? args[3] : null;
  const fill = args.length > 4 && !(isTensor(args[4]) && args[4].re.length === 0) ? dense(args[4], 'accumarray').re[0] : 0;
  const n = prod(od);
  const groups = new Map();
  const strides = []; let p = 1; for (let d = 0; d < nd; d++) { strides.push(p); p *= od[d] || 1; }
  subs.forEach((s, q) => {
    let lin = 0; for (let d = 0; d < nd; d++) lin += s[d] * strides[d];
    if (!groups.has(lin)) groups.set(lin, []);
    groups.get(lin).push(V.re.length === 1 ? V.re[0] : V.re[q]);
  });
  const re = new Float64Array(n).fill(fill);
  let im = null;
  let cls = V.cls === 'logical' || V.cls === 'char' ? 'double' : V.cls;
  if (!fn) {
    for (const [lin, vals] of groups) re[lin] = vals.reduce((a, b) => a + b, 0);
  } else {
    let cellOut = null;
    for (const [lin, vals] of groups) {
      const arg = finalize(V.cls, [vals.length, 1], Float64Array.from(vals));
      const r = ctx.call(fn, [arg], 1)[0];
      if (isCell(r)) { if (!cellOut) cellOut = new Array(n).fill(null); cellOut[lin] = r.data[0]; continue; }
      if (!isTensor(r) || r.re.length !== 1) throw E('base:accumarray:NonscalarFunctionOutput', 'The function FUN must return a scalar.');
      re[lin] = r.re[0];
      if (r.im) { if (!im) im = new Float64Array(n); im[lin] = r.im[0]; }
      cls = r.cls === 'logical' ? 'logical' : r.cls;
    }
    if (cellOut) return cell(od, cellOut.map((x) => x || tensor('double', [0, 0])));
  }
  return finalize(cls, od, re, im);
}

// ------------------------------------------------------------- isequal

function valuesEqual(a, b, nanEqual) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  const da = a.dims || [1, 1], db = b.dims || [1, 1];
  if (da.length !== db.length || da.some((x, i) => x !== db[i])) return false;
  const numA = isTensor(a) || isSparse(a), numB = isTensor(b) || isSparse(b);
  if (numA && numB) {
    const A = toTensor(a), B = toTensor(b);
    for (let i = 0; i < A.re.length; i++) {
      const x = A.re[i], y = B.re[i];
      if (x !== y && !(nanEqual && x !== x && y !== y)) return false;
      const xi = A.im ? A.im[i] : 0, yi = B.im ? B.im[i] : 0;
      if (xi !== yi && !(nanEqual && xi !== xi && yi !== yi)) return false;
    }
    return true;
  }
  if ((isString(a) || isChar(a)) && (isString(b) || isChar(b))) {
    const sa = isString(a) ? a.data : null, sb = isString(b) ? b.data : null;
    if (sa && sb) return sa.every((s, i) => s === sb[i] && s !== null);
    // char vs string scalar
    const ta = sa ? (sa.length === 1 ? sa[0] : null) : String.fromCharCode(...a.re);
    const tb = sb ? (sb.length === 1 ? sb[0] : null) : String.fromCharCode(...b.re);
    return ta !== null && ta === tb;
  }
  if (a.cls !== b.cls) {
    if (isString(a) && isChar(b)) return false;
    return false;
  }
  if (isCell(a)) return a.data.every((x, i) => valuesEqual(x, b.data[i], nanEqual));
  if (isStruct(a)) {
    if (a.fields.length !== b.fields.length || !a.fields.every((f) => b.fields.includes(f))) return false;
    return a.data.every((r, i) => a.fields.every((f) => valuesEqual(r[f], b.data[i][f], nanEqual)));
  }
  if (isFuncHandle(a)) return (a.name && a.name === b.name) || (a.text && a.text === b.text && a.closure === b.closure);
  if (isObject(a)) {
    if (a.handle && b.handle) return a.props === b.props;
    if (a.arr || b.arr) {
      if (!a.arr || !b.arr || a.arr.length !== b.arr.length) return false;
      for (let i = 0; i < a.arr.length; i++) if (a.arr[i] !== b.arr[i] && !(nanEqual && a.arr[i] !== a.arr[i] && b.arr[i] !== b.arr[i])) return false;
      if (a.arr2 && b.arr2) for (let i = 0; i < a.arr2.length; i++) if (a.arr2[i] !== b.arr2[i]) return false;
      if (a.cls === 'categorical') return JSON.stringify(a.props.categories) === JSON.stringify(b.props.categories) || catEqual(a, b);
      return true;
    }
    return propsEqual(a.props, b.props, nanEqual);
  }
  return false;
}
function catEqual(a, b) {
  for (let i = 0; i < a.arr.length; i++) {
    const x = a.arr[i] ? a.props.categories[a.arr[i] - 1] : null, y = b.arr[i] ? b.props.categories[b.arr[i] - 1] : null;
    if (x !== y || x === null) return false;
  }
  return true;
}
function propsEqual(p, q, nanEqual) {
  const ka = Object.keys(p || {}), kb = Object.keys(q || {});
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    const x = p[k], y = q[k];
    if (x && typeof x === 'object' && x.cls) { if (!valuesEqual(x, y, nanEqual)) return false; } else if (JSON.stringify(x) !== JSON.stringify(y)) return false;
  }
  return true;
}
export { valuesEqual };

function isequalFn(nanEqual) {
  return (args) => {
    if (args.length < 2) throw E('base:isequal:notEnoughInputs', 'Not enough input arguments.');
    for (let i = 1; i < args.length; i++) if (!valuesEqual(args[0], args[i], nanEqual)) return bool(false);
    return bool(true);
  };
}

function boundsFn(args, nargout) {
  const lo = minmax('bounds', false)([args[0], tensor('double', [0, 0]), ...args.slice(1)], 1);
  const hi = minmax('bounds', true)([args[0], tensor('double', [0, 0]), ...args.slice(1)], 1);
  return [lo, hi];
}

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const builtins = {
  sum: sumLike('sum', false),
  prod: sumLike('prod', true),
  cumsum: cumLike('cumsum', 'sum'),
  cumprod: cumLike('cumprod', 'prod'),
  cummax: cumLike('cummax', 'max'),
  cummin: cumLike('cummin', 'min'),
  max: minmax('max', true),
  min: minmax('min', false),
  bounds: boundsFn,
  range: rangeFn,
  mean: meanFn,
  median: medianFn,
  mode: modeFn,
  var: varLike('var', false),
  std: varLike('std', true),
  diff: diffFn,
  any: anyAll('any', false),
  all: anyAll('all', true),
  nnz(args) { const t = numIn(args[0], 'nnz'); let n = 0; for (let i = 0; i < t.re.length; i++) if (t.re[i] !== 0 || (t.im && t.im[i] !== 0)) n++; return num(n); },
  movsum: movFn('movsum', kSum),
  movmean: movFn('movmean', kMean),
  movmax: movFn('movmax', (w) => (w.length ? Math.max(...w.filter((x) => x === x).concat(w.every((x) => x !== x) ? [NaN] : [])) : NaN)),
  movmin: movFn('movmin', (w) => (w.length ? Math.min(...w.filter((x) => x === x).concat(w.every((x) => x !== x) ? [NaN] : [])) : NaN)),
  movmedian: movFn('movmedian', (w) => medianOf(Float64Array.from(w), w.length, false)),
  movprod: movFn('movprod', (w) => w.reduce((a, b) => a * b, 1)),
  movvar: movFn('movvar', kVar),
  movstd: movFn('movstd', (w) => Math.sqrt(kVar(w))),
  normalize: normalizeFn,
  rescale: rescaleFn,
  histcounts: histcountsFn,
  histc: histcFn,
  accumarray: accumarrayFn,
  isequal: isequalFn(false),
  isequaln: isequalFn(true),
};

export const help = {
  sum: H('Sum of array elements.', '배열 원소의 합.', ['S = sum(A)', 'S = sum(A, dim)', "S = sum(A, 'all')", 'S = sum(A, vecdim)', "S = sum(..., 'omitnan')", "S = sum(..., 'native')"]),
  prod: H('Product of array elements.', '배열 원소의 곱.', ['P = prod(A)', 'P = prod(A, dim)', "P = prod(A, 'all')"]),
  cumsum: H('Cumulative sum.', '누적 합.', ['B = cumsum(A)', 'B = cumsum(A, dim)', "B = cumsum(..., 'reverse')"]),
  cumprod: H('Cumulative product.', '누적 곱.', ['B = cumprod(A)', 'B = cumprod(A, dim)']),
  cummax: H('Cumulative maximum.', '누적 최댓값.', ['M = cummax(A)', 'M = cummax(A, dim)']),
  cummin: H('Cumulative minimum.', '누적 최솟값.', ['M = cummin(A)', 'M = cummin(A, dim)']),
  max: H('Maximum elements of an array.', '배열의 최댓값.', ['M = max(A)', 'M = max(A, [], dim)', '[M, I] = max(...)', 'C = max(A, B)', "M = max(A, [], 'all')"]),
  min: H('Minimum elements of an array.', '배열의 최솟값.', ['M = min(A)', 'M = min(A, [], dim)', '[M, I] = min(...)', 'C = min(A, B)']),
  bounds: H('Smallest and largest elements.', '최솟값과 최댓값.', ['[S, L] = bounds(A)', '[S, L] = bounds(A, dim)']),
  range: H('Range of values (max - min).', '값의 범위 (최댓값 - 최솟값).', ['y = range(X)', 'y = range(X, dim)']),
  mean: H('Average (mean) of array elements.', '배열 원소의 평균.', ['M = mean(A)', 'M = mean(A, dim)', "M = mean(A, 'all')", "M = mean(..., 'omitnan')"]),
  median: H('Median value of array.', '배열의 중앙값.', ['M = median(A)', 'M = median(A, dim)', "M = median(..., 'omitnan')"]),
  mode: H('Most frequent values in array.', '배열의 최빈값.', ['M = mode(A)', 'M = mode(A, dim)', '[M, F, C] = mode(...)']),
  var: H('Variance.', '분산.', ['V = var(A)', 'V = var(A, w)', 'V = var(A, w, dim)', '[V, M] = var(...)']),
  std: H('Standard deviation.', '표준편차.', ['S = std(A)', 'S = std(A, w)', 'S = std(A, w, dim)', '[S, M] = std(...)']),
  diff: H('Differences and approximate derivatives.', '차분 및 근사 도함수.', ['Y = diff(X)', 'Y = diff(X, n)', 'Y = diff(X, n, dim)']),
  any: H('True if any element is nonzero.', '0이 아닌 원소가 하나라도 있으면 참.', ['B = any(A)', 'B = any(A, dim)', "B = any(A, 'all')"]),
  all: H('True if all elements are nonzero.', '모든 원소가 0이 아니면 참.', ['B = all(A)', 'B = all(A, dim)', "B = all(A, 'all')"]),
  nnz: H('Number of nonzero elements.', '0이 아닌 원소 개수.', ['N = nnz(X)']),
  movsum: H('Moving sum.', '이동 합.', ['M = movsum(A, k)', 'M = movsum(A, [kb kf])', 'M = movsum(A, k, dim)', "M = movsum(..., 'Endpoints', 'discard')"]),
  movmean: H('Moving mean.', '이동 평균.', ['M = movmean(A, k)', 'M = movmean(A, [kb kf])']),
  movmax: H('Moving maximum.', '이동 최댓값.', ['M = movmax(A, k)']),
  movmin: H('Moving minimum.', '이동 최솟값.', ['M = movmin(A, k)']),
  movmedian: H('Moving median.', '이동 중앙값.', ['M = movmedian(A, k)']),
  movprod: H('Moving product.', '이동 곱.', ['M = movprod(A, k)']),
  movvar: H('Moving variance.', '이동 분산.', ['M = movvar(A, k)']),
  movstd: H('Moving standard deviation.', '이동 표준편차.', ['M = movstd(A, k)']),
  normalize: H('Normalize data (z-score, range, norm, center, scale).', '데이터 정규화 (z-점수, 범위, 노름, 중심, 척도).', ['N = normalize(A)', 'N = normalize(A, dim)', "N = normalize(..., 'range')", "N = normalize(..., 'norm', p)"]),
  rescale: H('Scale range of array elements.', '배열 원소의 범위 조정.', ['R = rescale(A)', 'R = rescale(A, l, u)']),
  histcounts: H('Histogram bin counts.', '히스토그램 구간별 개수.', ['N = histcounts(X)', 'N = histcounts(X, nbins)', 'N = histcounts(X, edges)', '[N, edges, bin] = histcounts(...)', "N = histcounts(..., 'Normalization', 'probability')"]),
  histc: H('Histogram count with explicit edges (legacy).', '경계 지정 히스토그램 개수 (구형).', ['N = histc(X, edges)', '[N, idx] = histc(X, edges)']),
  accumarray: H('Accumulate values into an array by subscripts.', '첨자에 따라 값을 누적.', ['A = accumarray(subs, val)', 'A = accumarray(subs, val, sz)', 'A = accumarray(subs, val, sz, fun)', 'A = accumarray(subs, val, sz, fun, fillval)']),
  isequal: H('Determine array equality (NaN values differ).', '배열이 같은지 판별 (NaN은 다름).', ['tf = isequal(A, B)', 'tf = isequal(A1, A2, ..., An)']),
  isequaln: H('Determine array equality, treating NaN values as equal.', 'NaN을 같은 값으로 보고 배열 동등성 판별.', ['tf = isequaln(A, B)']),
};
