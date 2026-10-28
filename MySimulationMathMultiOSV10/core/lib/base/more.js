// More elementary and data functions: pi-scaled trigonometry, coordinate
// transforms, rational approximation, hexadecimal IEEE text, k largest /
// smallest elements, sorted-row tests, bivariate histograms, padding and
// trimming, tolerant set membership, extra text functions, missing data
// handling (rmmissing / fillmissing / standardizeMissing) and outliers.
import {
  tensor, num, str, bool, cell, stringArray, isTensor, isSparse, isString, isCell, isStruct, isObject,
  toTensor, toStr, prod, normDims,
} from '../../value.js';
import {
  E, dense, finalize, optArg, textArg, firstNonSingleton, splitDims, dimsWith, gather, count, textList, makeText,
  isCellstr, first,
} from './util.js';
import { along } from './analysis.js';

const isNumV = (v) => v != null && (isTensor(v) || isSparse(v)) && optArg(v) === null;
const outCls = (t) => (t.cls === 'single' ? 'single' : 'double');
const dbl = (dims, re, im = null) => finalize('double', dims, re, im);
const need = (args, n, f) => { if (args.length < n) throw E(`base:${f}:notEnoughInputs`, 'Not enough input arguments.'); };
const numIn = (v, f) => { if (v === undefined) throw E(`base:${f}:notEnoughInputs`, 'Not enough input arguments.'); if (isTensor(v)) return v; if (isSparse(v)) return toTensor(v); throw E(`base:${f}:invalidType`, 'Input must be numeric or logical.'); };
const call1 = (ctx, f, args, n = 1) => ctx.call(f, args, n);
const S = (s) => str(s);

// ------------------------------------------------------------- elementwise helpers

function mapEl(v, f, fname) {
  const t = numIn(v, fname);
  if (t.im) throw E(`base:${fname}:complexInput`, 'Input must be real.');
  return finalize(outCls(t), t.dims, Float64Array.from(t.re, f));
}
function sinpiK(x) {
  if (!Number.isFinite(x)) return NaN;
  const r = x - 2 * Math.round(x / 2); // r in [-1, 1]
  if (Number.isInteger(r)) return r === 0 ? 0 * Math.sign(x) : 0;
  if (Math.abs(r) === 0.5) return Math.sign(r);
  return Math.sin(Math.PI * r);
}
function cospiK(x) {
  if (!Number.isFinite(x)) return NaN;
  const r = Math.abs(x - 2 * Math.round(x / 2));
  if (r === 0.5) return 0;
  if (r === 0) return 1; if (r === 1) return -1;
  return Math.cos(Math.PI * r);
}
/** Broadcasts real args to common dims and applies f(...scalars) → array of outputs. */
function bcast(vals, nout, f, fname) {
  const ts = vals.map((v) => numIn(v, fname));
  let dims = [1, 1];
  for (const t of ts) {
    if (count(t) === 1) continue;
    if (prod(dims) === 1) { dims = t.dims; continue; }
    if (t.dims.length !== dims.length || t.dims.some((d, i) => d !== dims[i])) throw E(`base:${fname}:sizeMismatch`, 'Arrays have incompatible sizes for this operation.');
  }
  const n = prod(dims);
  const outs = Array.from({ length: nout }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    const r = f(...ts.map((t) => (count(t) === 1 ? t.re[0] : t.re[i])));
    for (let k = 0; k < nout; k++) outs[k][i] = r[k];
  }
  const cls = ts.some((t) => t.cls === 'single') ? 'single' : 'double';
  return outs.map((o) => finalize(cls, dims, o));
}

// ------------------------------------------------------------- rat / rats

function ratOne(x, tol) {
  if (!Number.isFinite(x)) return { n: x !== x ? 0 : Math.sign(x), d: 0, terms: [] };
  if (x === 0) return { n: 0, d: 1, terms: [0] };
  let y = x, n0 = 1, d0 = 0, n1 = 0, d1 = 1; // convergents
  const terms = [];
  for (let k = 0; k < 64; k++) {
    const a = Math.round(y);
    terms.push(a);
    const n2 = a * n0 + n1, d2 = a * d0 + d1;
    n1 = n0; d1 = d0; n0 = n2; d0 = d2;
    if (Math.abs(x - n0 / d0) < tol || y === a) break;
    y = 1 / (y - a);
  }
  if (d0 < 0) { n0 = -n0; d0 = -d0; }
  return { n: n0, d: d0, terms };
}
function ratFn(args, nargout) {
  need(args, 1, 'rat');
  const t = numIn(args[0], 'rat');
  if (t.im) throw E('base:rat:complexInput', 'Input must be real.');
  let s1 = 0; for (const x of t.re) if (Number.isFinite(x)) s1 += Math.abs(x);
  const tol = args[1] !== undefined ? dense(args[1], 'rat').re[0] : 1e-6 * s1;
  const rs = Array.from(t.re, (x) => ratOne(x, tol));
  if (nargout >= 2) return [dbl(t.dims, Float64Array.from(rs, (r) => r.n)), dbl(t.dims, Float64Array.from(rs, (r) => r.d))];
  // continued fraction text: a0 + 1/(a1 + 1/(a2 + ...))
  const texts = rs.map((r, i) => {
    const x = t.re[i];
    if (!Number.isFinite(x)) return x !== x ? 'NaN' : x > 0 ? 'Inf' : '-Inf';
    const tm = r.terms; let s = String(tm[0]);
    for (let k = 1; k < tm.length; k++) s += ` + 1/(${tm[k]}`;
    return s + ')'.repeat(Math.max(0, tm.length - 1));
  });
  const w = Math.max(0, ...texts.map((s) => s.length));
  return charMat(texts.map((s) => s.padEnd(w)));
}
function charMat(lines) {
  const m = lines.length, n = m ? lines[0].length : 0;
  const re = new Float64Array(m * n);
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) re[i + j * m] = lines[i].charCodeAt(j);
  return tensor('char', [m, n], re);
}
function ratsFn(args) {
  need(args, 1, 'rats');
  const t = numIn(args[0], 'rats');
  const len = args[1] !== undefined ? dense(args[1], 'rats').re[0] : 13;
  const d = t.dims.length === 2 ? t.dims : [t.dims[0], prod(t.dims) / t.dims[0]];
  const [m, n] = d;
  const lines = [];
  for (let i = 0; i < m; i++) {
    let line = '';
    for (let j = 0; j < n; j++) {
      const x = t.re[i + j * m];
      let s;
      if (x !== x) s = 'NaN'; else if (!Number.isFinite(x)) s = x > 0 ? 'Inf' : '-Inf';
      else {
        let tolr = Math.max(Math.abs(x) * 1e-6, 1e-12);
        let r = ratOne(x, tolr); s = r.d === 1 ? String(r.n) : `${r.n}/${r.d}`;
        while (s.length > len - 1 && tolr < Math.abs(x) + 1) { tolr *= 10; r = ratOne(x, tolr); s = r.d === 1 ? String(r.n) : `${r.n}/${r.d}`; }
        if (s.length > len - 1) s = '*';
        if (x !== 0 && r.n === 0) s = '*';
      }
      const pad = len - s.length; const left = Math.floor(pad / 2);
      line += ' '.repeat(Math.max(0, left)) + s + ' '.repeat(Math.max(0, pad - left));
    }
    lines.push(line);
  }
  return charMat(lines);
}

// ------------------------------------------------------------- num2hex / hex2num

function num2hexFn(args) {
  need(args, 1, 'num2hex');
  const t = numIn(args[0], 'num2hex');
  if (t.im) throw E('base:num2hex:complexInput', 'Input must be real.');
  const single = t.cls === 'single';
  const lines = Array.from(t.re, (x) => {
    const b = new DataView(new ArrayBuffer(8));
    if (single) { b.setFloat32(0, x); return [0, 1, 2, 3].map((k) => b.getUint8(k).toString(16).padStart(2, '0')).join(''); }
    b.setFloat64(0, x); return [0, 1, 2, 3, 4, 5, 6, 7].map((k) => b.getUint8(k).toString(16).padStart(2, '0')).join('');
  });
  if (!lines.length) return tensor('char', [0, 0]);
  return charMat(lines);
}
function hex2numFn(args) {
  need(args, 1, 'hex2num');
  const { list, dims, kind } = textList(args[0], 'Input');
  const vals = list.map((s) => {
    s = (s || '').trim().toLowerCase();
    if (!/^[0-9a-f]*$/.test(s) || s.length > 16) throw E('base:hex2num:invalidHex', 'Input must be hexadecimal text of at most 16 digits.');
    s = s.padEnd(16, '0');
    const b = new DataView(new ArrayBuffer(8));
    for (let k = 0; k < 8; k++) b.setUint8(k, parseInt(s.slice(2 * k, 2 * k + 2), 16));
    return b.getFloat64(0);
  });
  return dbl(kind === 'charmat' ? [list.length, 1] : dims, Float64Array.from(vals));
}

// ------------------------------------------------------------- maxk / mink / topkrows / issortedrows

function kFn(fname, desc) {
  return (args, nargout, ctx) => {
    need(args, 2, fname);
    const t = numIn(args[0], fname);
    const k = dense(args[1], fname).re[0];
    if (!(k >= 0) || !Number.isInteger(k)) throw E(`base:${fname}:invalidK`, 'K must be a nonnegative integer scalar.');
    let dim = null; const rest = [];
    for (let i = 2; i < args.length; i++) {
      if (isNumV(args[i]) && dim === null) dim = dense(args[i], fname).re[0] - 1;
      else rest.push(args[i]);
    }
    if (dim === null) dim = firstNonSingleton(t.dims);
    const [B, I] = call1(ctx, 'sort', [t, num(dim + 1), S(desc ? 'descend' : 'ascend'), ...rest], 2);
    const len = t.dims[dim] ?? 1, kk = Math.min(k, len);
    const take = (v) => {
      const { before, after } = splitDims(v.dims, dim);
      const idx = [];
      for (let a = 0; a < after; a++) for (let q = 0; q < kk; q++) for (let b = 0; b < before; b++) idx.push(a * before * len + q * before + b);
      // gather expects column-major order of the output dims
      const od = dimsWith(v.dims, dim, kk);
      const ordered = new Array(idx.length);
      let p = 0;
      for (let a = 0; a < after; a++) for (let q = 0; q < kk; q++) for (let b = 0; b < before; b++) ordered[a * before * kk + q * before + b] = idx[p++];
      return gather(v, ordered, od);
    };
    return nargout >= 2 ? [take(B), take(I)] : take(B);
  };
}
function topkrowsFn(args, nargout, ctx) {
  need(args, 2, 'topkrows');
  const X = args[0];
  const k = dense(args[1], 'topkrows').re[0];
  if (!(k >= 0) || !Number.isInteger(k)) throw E('base:topkrows:invalidK', 'K must be a nonnegative integer scalar.');
  const rest = args.slice(2);
  // default: descending on all columns
  let srArgs;
  if (!rest.length) {
    const nc = isObject(X) ? null : X.dims[1];
    srArgs = nc === null ? [S('descend')] : [tensor('double', [1, nc], Float64Array.from({ length: nc }, (_, j) => -(j + 1)))];
  } else {
    srArgs = rest.slice();
    if (rest.length === 1 && isNumV(rest[0])) srArgs = [rest[0], S('descend')];
  }
  const [B, I] = call1(ctx, 'sortrows', [X, ...srArgs], 2);
  const n = Math.min(k, toTensor(I).re.length);
  const rows = tensor('double', [n, 1], Float64Array.from({ length: n }, (_, i) => i + 1));
  const colon = S(':');
  const sub = first(call1(ctx, 'subsref', [B, structSubs(rows, colon)]));
  if (nargout >= 2) return [sub, gather(I, Array.from({ length: n }, (_, i) => i), [n, 1])];
  return sub;
}
function structSubs(...subs) {
  return { cls: 'struct', dims: [1, 1], fields: ['type', 'subs'], data: [{ type: str('()'), subs: cell([1, subs.length], subs) }] };
}
function issortedrowsFn(args, nargout, ctx) {
  need(args, 1, 'issortedrows');
  const [, I] = call1(ctx, 'sortrows', args, 2);
  const r = toTensor(I).re;
  for (let i = 0; i < r.length; i++) if (r[i] !== i + 1) return bool(false);
  return bool(true);
}

// ------------------------------------------------------------- histcounts2

function histcounts2Fn(args, nargout, ctx) {
  need(args, 2, 'histcounts2');
  const x = numIn(args[0], 'histcounts2'), y = numIn(args[1], 'histcounts2');
  if (x.re.length !== y.re.length) throw E('base:histcounts2:sizeMismatch', 'X and Y must have the same number of elements.');
  let i = 2; let bx = [], by = [];
  if (isNumV(args[i]) && isNumV(args[i + 1]) && count(args[i]) > 1 && count(args[i + 1]) > 1) { bx = [args[i]]; by = [args[i + 1]]; i += 2; }
  else if (isNumV(args[i])) {
    const nb = dense(args[i], 'histcounts2').re; bx = [num(nb[0])]; by = [num(nb.length > 1 ? nb[1] : nb[0])]; i++;
  }
  let norm = 'count';
  for (; i < args.length; i += 2) {
    const s = optArg(args[i]);
    if (s === 'normalization') norm = optArg(args[i + 1]);
    else if (s === 'xbinedges') bx = [args[i + 1]];
    else if (s === 'ybinedges') by = [args[i + 1]];
    else if (s === 'numbins') { const nb = dense(args[i + 1], 'histcounts2').re; bx = [num(nb[0])]; by = [num(nb.length > 1 ? nb[1] : nb[0])]; }
    else throw E('base:histcounts2:invalidOption', `Invalid option '${textArg(args[i]) ?? '?'}'.`);
  }
  const ok = []; for (let q = 0; q < x.re.length; q++) if (x.re[q] === x.re[q] && y.re[q] === y.re[q]) ok.push(q);
  const xs = tensor('double', [ok.length, 1], Float64Array.from(ok, (q) => x.re[q])), ys = tensor('double', [ok.length, 1], Float64Array.from(ok, (q) => y.re[q]));
  const [, ex] = call1(ctx, 'histcounts', [xs, ...bx], 2);
  const [, ey] = call1(ctx, 'histcounts', [ys, ...by], 2);
  const exa = toTensor(ex).re, eya = toTensor(ey).re;
  const nx = exa.length - 1, ny = eya.length - 1;
  const binOf = (e, v) => {
    const nb = e.length - 1;
    if (!(v >= e[0] && v <= e[nb])) return -1;
    if (v === e[nb]) return nb - 1;
    let lo = 0, hi = nb; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (v >= e[mid]) lo = mid; else hi = mid; }
    return lo;
  };
  const N = new Float64Array(nx * ny);
  const binX = new Float64Array(x.re.length), binY = new Float64Array(x.re.length);
  for (let q = 0; q < x.re.length; q++) {
    const a = binOf(exa, x.re[q]), b = binOf(eya, y.re[q]);
    if (a < 0 || b < 0) continue;
    N[a + b * nx]++; binX[q] = a + 1; binY[q] = b + 1;
  }
  const total = N.reduce((s, v) => s + v, 0);
  if (norm === 'probability') for (let q = 0; q < N.length; q++) N[q] /= total;
  else if (norm === 'pdf') for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) N[a + b * nx] /= total * (exa[a + 1] - exa[a]) * (eya[b + 1] - eya[b]);
  else if (norm === 'cdf') { const C = new Float64Array(N.length); for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) { let s = N[a + b * nx]; if (a) s += C[a - 1 + b * nx]; if (b) s += C[a + (b - 1) * nx]; if (a && b) s -= C[a - 1 + (b - 1) * nx]; C[a + b * nx] = s; } for (let q = 0; q < N.length; q++) N[q] = C[q] / total; }
  else if (norm !== 'count') throw E('base:histcounts2:invalidNormalization', `Invalid normalization '${norm}'.`);
  const outs = [dbl([nx, ny], N), ex, ey, dbl(x.dims, binX), dbl(x.dims, binY)];
  return nargout <= 1 ? outs[0] : outs.slice(0, nargout);
}

// ------------------------------------------------------------- paddata / trimdata / resize

function padTrimArgs(args, fname) {
  need(args, 2, fname);
  const A = args[0];
  const m = Array.from(dense(args[1], fname).re);
  if (m.some((x) => !(x >= 0) || !Number.isInteger(x))) throw E(`base:${fname}:invalidSize`, 'Size must contain nonnegative integers.');
  const o = { fill: null, dims: null, side: 'trailing', pattern: 'constant' };
  for (let i = 2; i < args.length; i += 2) {
    const s = optArg(args[i]); const v = args[i + 1];
    if (v === undefined) throw E(`base:${fname}:missingValue`, `Option '${textArg(args[i])}' needs a value.`);
    if (s === 'fillvalue') o.fill = v;
    else if (s === 'dimension') o.dims = optArg(v) === 'auto' ? null : Array.from(dense(v, fname).re, (d) => d - 1);
    else if (s === 'side') o.side = optArg(v);
    else if (s === 'pattern') o.pattern = optArg(v);
    else throw E(`base:${fname}:invalidOption`, `Invalid option '${textArg(args[i]) ?? '?'}'.`);
  }
  const d = (A.dims || [1, 1]).slice();
  let dims = o.dims;
  if (!dims) {
    if (m.length === 1) dims = [d.length === 2 && d[0] === 1 && d[1] !== 1 ? 1 : 0];
    else dims = m.map((_, k) => k);
  }
  if (m.length !== 1 && m.length !== dims.length) throw E(`base:${fname}:sizeMismatch`, 'The size vector must match the dimensions to operate along.');
  const target = d.slice();
  dims.forEach((k, q) => { while (target.length <= k) target.push(1); target[k] = m.length === 1 ? m[0] : m[q]; });
  return { A, target, o, side: o.side };
}
function fillScalar(A, fill) {
  if (fill) return fill;
  if (isString(A)) return stringArray([1, 1], [null]);
  if (isCell(A)) return cell([1, 1], [tensor('double', [0, 0])]);
  if (isTensor(A)) return A.cls === 'double' || A.cls === 'single' ? num(0) : tensor(A.cls, [1, 1], [A.cls === 'char' ? 32 : 0]);
  return num(0);
}
/** Builds an array of target dims picking source elements; out-of-range → fill/pattern. */
function reshapeTo(A, target, side, pattern, fill, allowGrow, allowTrim) {
  const d = (A.dims || [1, 1]).slice(); while (d.length < target.length) d.push(1);
  const t = target.slice(); while (t.length < d.length) t.push(1);
  const off = d.map((n, k) => {
    const diff = t[k] - n;
    if (diff > 0 && !allowGrow) return 0;
    if (diff < 0 && !allowTrim) return 0;
    if (side === 'leading') return diff;
    if (side === 'both') return diff > 0 ? Math.floor(diff / 2) : -Math.floor(-diff / 2);
    return 0;
  });
  const T = t.map((n, k) => (n > d[k] && !allowGrow) || (n < d[k] && !allowTrim) ? d[k] : n);
  const N = prod(T);
  const idx = new Array(N); const missing = [];
  const strides = []; let st = 1; for (let k = 0; k < d.length; k++) { strides.push(st); st *= d[k]; }
  for (let e = 0; e < N; e++) {
    let r = e, lin = 0, out = false;
    for (let k = 0; k < T.length; k++) {
      let s = (r % T[k]) - off[k]; r = Math.floor(r / T[k]);
      if (s < 0 || s >= d[k]) {
        if (pattern === 'edge') s = Math.min(Math.max(s, 0), d[k] - 1);
        else if (pattern === 'circular') s = ((s % d[k]) + d[k]) % d[k];
        else if (pattern === 'flip' || pattern === 'reflect') { const p = 2 * d[k]; s = ((s % p) + p) % p; if (s >= d[k]) s = p - 1 - s; }
        else out = true;
      }
      lin += s * strides[k];
    }
    if (out) { idx[e] = 0; missing.push(e); } else idx[e] = lin;
  }
  if (count(A) === 0 && N > 0) return replicateFill(fillScalar(A, fill), T);
  let R = gather(A, idx, T);
  if (missing.length) {
    const f = fillScalar(A, fill);
    if (isTensor(R)) { const ft = toTensor(f); R = { ...R, re: Float64Array.from(R.re) }; for (const e of missing) R.re[e] = ft.re[0]; if (R.im) { R.im = Float64Array.from(R.im); for (const e of missing) R.im[e] = 0; } }
    else if (R.data) { R = { ...R, data: R.data.slice() }; const fv = isString(f) ? f.data[0] : isCell(f) ? f.data[0] : f; for (const e of missing) R.data[e] = fv; }
  }
  return R;
}
function replicateFill(f, T) {
  const N = prod(T);
  if (isTensor(f)) return { ...f, dims: normDims(T), re: new Float64Array(N).fill(f.re[0]), im: null };
  if (isString(f)) return stringArray(T, new Array(N).fill(f.data[0]));
  if (isCell(f)) return cell(T, new Array(N).fill(f.data[0]));
  return f;
}
const padFn = (fname, grow, trim) => (args) => {
  const { A, target, o, side } = padTrimArgs(args, fname);
  return reshapeTo(A, target, side, fname === 'trimdata' ? 'constant' : o.pattern, o.fill, grow, trim);
};

// ------------------------------------------------------------- ismembertol / uniquetol

function tolArgs(args, start, fname, A, B) {
  let tol = (A.cls === 'single' || (B && B.cls === 'single')) ? 1e-6 : 1e-12, i = start;
  if (isNumV(args[i])) { tol = dense(args[i], fname).re[0]; i++; }
  const o = { byRows: false, dataScale: null, allIdx: false };
  for (; i < args.length; i += 2) {
    const s = optArg(args[i]); const v = args[i + 1];
    if (s === 'byrows') o.byRows = !!dense(v, fname).re[0];
    else if (s === 'datascale') o.dataScale = Array.from(dense(v, fname).re);
    else if (s === 'outputallindices') o.allIdx = !!dense(v, fname).re[0];
    else throw E(`base:${fname}:invalidOption`, `Invalid option '${textArg(args[i]) ?? '?'}'.`);
  }
  return { tol, ...o };
}
function maxAbs(...ts) { let m = 0; for (const t of ts) for (const x of t.re) if (Number.isFinite(x)) m = Math.max(m, Math.abs(x)); return m; }
function rowsOfT(t, byRows) {
  if (!byRows) return { n: t.re.length, w: 1, get: (r) => [t.re[r]] };
  const [m, n] = t.dims; return { n: m, w: n, get: (r) => Array.from({ length: n }, (_, j) => t.re[r + j * m]) };
}
function ismembertolFn(args, nargout) {
  need(args, 2, 'ismembertol');
  const A = numIn(args[0], 'ismembertol'), B = numIn(args[1], 'ismembertol');
  const o = tolArgs(args, 2, 'ismembertol', A, B);
  const ra = rowsOfT(A, o.byRows), rb = rowsOfT(B, o.byRows);
  if (o.byRows && A.dims[1] !== B.dims[1]) throw E('base:ismembertol:colMismatch', "A and B must have the same number of columns with 'ByRows'.");
  const ds = o.dataScale || [maxAbs(A, B)];
  const scale = (j) => (ds.length === 1 ? ds[0] : ds[j]);
  const lia = new Float64Array(ra.n), locs = [];
  const brows = Array.from({ length: rb.n }, (_, r) => rb.get(r));
  for (let r = 0; r < ra.n; r++) {
    const a = ra.get(r); const hits = [];
    for (let q = 0; q < rb.n; q++) {
      const b = brows[q];
      if (a.every((x, j) => Math.abs(x - b[j]) <= o.tol * scale(j))) { hits.push(q + 1); if (!o.allIdx) break; }
    }
    lia[r] = hits.length ? 1 : 0; locs.push(hits);
  }
  const dims = o.byRows ? [ra.n, 1] : A.dims;
  const L = finalize('logical', dims, lia);
  if (nargout < 2) return L;
  if (o.allIdx) return [L, cell(dims, locs.map((h) => tensor('double', [h.length ? h.length : 1, 1], h.length ? Float64Array.from(h) : [0])))];
  return [L, dbl(dims, Float64Array.from(locs, (h) => (h.length ? h[0] : 0)))];
}
function uniquetolFn(args, nargout) {
  need(args, 1, 'uniquetol');
  const A = numIn(args[0], 'uniquetol');
  const o = tolArgs(args, 1, 'uniquetol', A, null);
  const ra = rowsOfT(A, o.byRows);
  const ds = o.dataScale || [maxAbs(A)];
  const scale = (j) => (ds.length === 1 ? ds[0] : ds[j]);
  const rows = Array.from({ length: ra.n }, (_, r) => ra.get(r));
  const order = rows.map((_, r) => r).sort((p, q) => { for (let j = 0; j < ra.w; j++) { const d = rows[p][j] - rows[q][j]; if (d) return d; } return p - q; });
  const ic = new Float64Array(ra.n); const reps = [];
  const done = new Array(ra.n).fill(false);
  for (const r of order) {
    if (done[r]) continue;
    const rep = rows[r]; reps.push(r); done[r] = true; ic[r] = reps.length;
    for (const q of order) if (!done[q] && rows[q].every((x, j) => Math.abs(x - rep[j]) <= o.tol * scale(j))) { done[q] = true; ic[q] = reps.length; }
  }
  const k = reps.length;
  let C;
  if (o.byRows) { const re = new Float64Array(k * ra.w); reps.forEach((r, i) => rows[r].forEach((x, j) => { re[i + j * k] = x; })); C = finalize(outCls(A), [k, ra.w], re); }
  else C = finalize(outCls(A), A.dims[0] === 1 && A.dims.length === 2 ? [1, k] : [k, 1], Float64Array.from(reps, (r) => rows[r][0]));
  if (nargout < 2) return C;
  return [C, dbl([k, 1], Float64Array.from(reps, (r) => r + 1)), dbl([ra.n, 1], ic)];
}

// ------------------------------------------------------------- text functions

function textOut(list, dims, kind) { return makeText(list, dims, kind === 'charmat' ? 'cell' : kind); }
function appendFn(args) {
  if (!args.length) return tensor('char', [0, 0]);
  const anyString = args.some(isString), anyCell = args.some(isCell);
  const parts = args.map((a) => {
    if (isTensor(a) && a.cls !== 'char' && isString(a) === false && anyString) return { list: [String(a.re[0])], dims: [1, 1] };
    return textList(a, 'Input');
  });
  let dims = [1, 1];
  for (const p of parts) if (p.list.length !== 1) { dims = p.dims; break; }
  const n = prod(dims);
  for (const p of parts) if (p.list.length !== 1 && p.list.length !== n) throw E('base:append:sizeMismatch', 'Input arguments must have compatible sizes.');
  const out = [];
  for (let i = 0; i < n; i++) {
    let s = '', miss = false;
    for (const p of parts) { const x = p.list.length === 1 ? p.list[0] : p.list[i]; if (x == null) miss = true; else s += x; }
    out.push(miss ? null : s);
  }
  if (anyString) return stringArray(dims, out);
  if (anyCell) return cell(dims, out.map((s) => S(s)));
  return S(out[0]);
}
function splitlinesFn(args) {
  need(args, 1, 'splitlines');
  const { list, kind } = textList(args[0], 'Input');
  if (list.length !== 1) throw E('base:splitlines:notScalar', 'Input must be a string scalar or character vector.');
  const parts = list[0] == null ? [null] : list[0].split(/\r\n|\n|\r/);
  if (kind === 'string') return stringArray([parts.length, 1], parts);
  return cell([parts.length, 1], parts.map((s) => S(s)));
}
function strtokFn(args, nargout) {
  need(args, 1, 'strtok');
  const delims = args[1] !== undefined ? toStr(args[1]) : ' \f\n\r\t\v\0';
  const isD = (c) => delims.includes(c);
  const one = (s) => {
    if (s == null) return [null, null];
    let i = 0; while (i < s.length && isD(s[i])) i++;
    let j = i; while (j < s.length && !isD(s[j])) j++;
    return [s.slice(i, j), s.slice(j)];
  };
  const { list, dims, kind } = textList(args[0], 'Input');
  const r = list.map(one);
  const tok = r.map((x) => x[0]), rem = r.map((x) => x[1]);
  const mk = (l) => (kind === 'char' ? (l[0] === '' ? tensor('char', [1, 0]) : S(l[0])) : textOut(l, dims, kind));
  return nargout >= 2 ? [mk(tok), mk(rem)] : mk(tok);
}
function betweenFn(fname, erase) {
  return (args) => {
    need(args, erase ? 3 : 4, fname);
    const T = textList(args[0], 'Input');
    const newT = erase ? null : textList(args[3], 'New text');
    let bound = 'inclusive';
    for (let i = erase ? 3 : 4; i < args.length; i += 2) { if (optArg(args[i]) === 'boundaries') bound = optArg(args[i + 1]); else throw E(`base:${fname}:invalidOption`, `Invalid option '${textArg(args[i]) ?? '?'}'.`); }
    const posMode = isNumV(args[1]);
    const val = (v, i) => { const t = dense(v, fname).re; return t.length === 1 ? t[0] : t[i]; };
    const pats = (v) => { const p = textList(v, 'Pattern').list; return p; };
    const out = T.list.map((s, i) => {
      if (s == null) return null;
      const rep = erase ? '' : (newT.list.length === 1 ? newT.list[0] : newT.list[i]) ?? '';
      if (posMode) {
        let a = val(args[1], i), b = val(args[2], i);
        if (!(a >= 1 && b <= s.length && a <= b + 1)) throw E(`base:${fname}:invalidPositions`, 'Start and end positions must be within the text.');
        let lo = a - 1, hi = b;
        if (bound === 'exclusive') { lo = a; hi = b - 1; }
        return s.slice(0, lo) + rep + s.slice(hi);
      }
      const ps = pats(args[1]), pe = pats(args[2]);
      let res = '', pos = 0;
      for (;;) {
        let best = null;
        for (const p of ps) { const k = s.indexOf(p, pos); if (k >= 0 && (best === null || k < best[0])) best = [k, p.length]; }
        if (!best) break;
        let eb = null;
        for (const p of pe) { const k = s.indexOf(p, best[0] + best[1]); if (k >= 0 && (eb === null || k < eb[0])) eb = [k, p.length]; }
        if (!eb) break;
        const lo = bound === 'inclusive' ? best[0] : best[0] + best[1];
        const hi = bound === 'inclusive' ? eb[0] + eb[1] : eb[0];
        res += s.slice(pos, lo) + rep;
        pos = hi;
        if (bound !== 'inclusive') { res += s.slice(hi, eb[0] + eb[1]); pos = eb[0] + eb[1]; }
      }
      return res + s.slice(pos);
    });
    if (T.kind === 'char') return out[0] === '' ? tensor('char', [1, 0]) : S(out[0]);
    return textOut(out, T.dims, T.kind);
  };
}
function matchesFn(args) {
  need(args, 2, 'matches');
  const T = textList(args[0], 'Input'), P = textList(args[1], 'Pattern').list;
  let ic = false;
  for (let i = 2; i < args.length; i += 2) { if (optArg(args[i]) === 'ignorecase') ic = !!dense(args[i + 1], 'matches').re[0]; else throw E('base:matches:invalidOption', `Invalid option '${textArg(args[i]) ?? '?'}'.`); }
  const ps = P.map((p) => (ic ? p.toLowerCase() : p));
  const re = Float64Array.from(T.list, (s) => (s != null && ps.includes(ic ? s.toLowerCase() : s) ? 1 : 0));
  return finalize('logical', T.kind === 'char' ? [1, 1] : T.dims, re);
}
function convContained(v) {
  if (isString(v)) return v.data.length === 1 ? S(v.data[0] ?? '') : cell(v.dims, v.data.map((s) => S(s ?? '')));
  if (isCell(v)) return cell(v.dims, v.data.map(convContained));
  if (isStruct(v)) return { ...v, data: v.data.map((r) => Object.fromEntries(Object.entries(r).map(([k, x]) => [k, convContained(x)]))) };
  return v;
}

// ------------------------------------------------------------- types

function underlyingTypeFn(args) {
  need(args, 1, 'underlyingType');
  const v = args[0];
  if (v.isObject && (v.cls === 'duration' || v.cls === 'datetime' || v.cls === 'calendarDuration' || v.cls === 'categorical' || v.cls === 'table' || v.cls === 'timetable')) return S(v.cls);
  return S(v.cls);
}
const NUMERIC = ['double', 'single', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64'];
function isUnderlyingTypeFn(args) {
  need(args, 2, 'isUnderlyingType');
  const c = args[0].cls, t = toStr(args[1]);
  if (t === 'numeric') return bool(NUMERIC.includes(c));
  if (t === 'float') return bool(c === 'double' || c === 'single');
  if (t === 'integer') return bool(NUMERIC.slice(2).includes(c));
  return bool(c === t);
}
function mustBeNonmissingFn(args, nargout, ctx) {
  need(args, 1, 'mustBeNonmissing');
  const tf = toTensor(first(call1(ctx, 'ismissing', [args[0]])));
  if (tf.re.some((x) => x)) throw E('base:validators:mustBeNonmissing', 'Value must be nonmissing.');
  return undefined;
}

// ------------------------------------------------------------- missing data

/** Missing mask of any supported array (numeric NaN, string <missing>, empty char in cells). */
function missingMask(v, ctx) { return toTensor(first(call1(ctx, 'ismissing', [v]))).re; }
function dimOpt(v, args, i, fname) { if (isNumV(args[i])) return [dense(args[i], fname).re[0] - 1, i + 1]; return [null, i]; }
function rmmissingFn(args, nargout, ctx) {
  need(args, 1, 'rmmissing');
  const A = args[0];
  if (A.isObject && A.cls === 'table') throw E('base:rmmissing:tableUnsupported', 'rmmissing on tables is not supported; use rows with ismissing.');
  let [dim, i] = dimOpt(A, args, 1, 'rmmissing');
  let minMiss = 1;
  for (; i < args.length; i += 2) { if (optArg(args[i]) === 'minnummissing') minMiss = dense(args[i + 1], 'rmmissing').re[0]; else throw E('base:rmmissing:invalidOption', `Invalid option '${textArg(args[i]) ?? '?'}'.`); }
  const m = missingMask(A, ctx);
  const d = A.dims;
  if (d.length > 2) throw E('base:rmmissing:inputMustBe2D', 'Input must be a vector or a 2-D matrix.');
  const isVec = d[0] === 1 || d[1] === 1;
  if (isVec && dim === null) {
    const keep = []; for (let q = 0; q < m.length; q++) if (!m[q]) keep.push(q);
    const R = gather(A, keep, d[0] === 1 ? [1, keep.length] : [keep.length, 1]);
    return nargout >= 2 ? [R, finalize('logical', d, Float64Array.from(m))] : R;
  }
  if (dim === null) dim = 0;
  const [rows, cols] = d;
  const nOut = dim === 0 ? rows : cols;
  const tf = new Float64Array(nOut);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (m[r + c * rows]) tf[dim === 0 ? r : c]++;
  for (let q = 0; q < nOut; q++) tf[q] = tf[q] >= minMiss ? 1 : 0;
  const idx = [];
  let R;
  if (dim === 0) { const keep = []; for (let r = 0; r < rows; r++) if (!tf[r]) keep.push(r); for (let c = 0; c < cols; c++) for (const r of keep) idx.push(r + c * rows); R = gather(A, idx, [keep.length, cols]); }
  else { const keep = []; for (let c = 0; c < cols; c++) if (!tf[c]) keep.push(c); for (const c of keep) for (let r = 0; r < rows; r++) idx.push(r + c * rows); R = gather(A, idx, [rows, keep.length]); }
  return nargout >= 2 ? [R, finalize('logical', dim === 0 ? [rows, 1] : [1, cols], tf)] : R;
}
function standardizeMissingFn(args) {
  need(args, 2, 'standardizeMissing');
  const A = args[0], ind = args[1];
  if (isString(A)) {
    const set = new Set(textList(ind, 'Indicator').list);
    return stringArray(A.dims, A.data.map((s) => (set.has(s) ? null : s)));
  }
  if (isCell(A) && isCellstr(A)) {
    const set = new Set(textList(ind, 'Indicator').list);
    return cell(A.dims, A.data.map((x) => (set.has(toStr(x)) ? tensor('char', [0, 0]) : x)));
  }
  const t = numIn(A, 'standardizeMissing');
  const vals = isNumV(ind) ? Array.from(dense(ind, 'standardizeMissing').re) : (isCell(ind) ? ind.data.filter(isNumV).flatMap((x) => Array.from(dense(x, 'standardizeMissing').re)) : []);
  if (t.cls !== 'double' && t.cls !== 'single') return t;
  const re = Float64Array.from(t.re, (x) => (vals.includes(x) ? NaN : x));
  return finalize(t.cls, t.dims, re, t.im ? Float64Array.from(t.im) : null);
}

const FILL_METHODS = ['constant', 'previous', 'next', 'nearest', 'linear', 'spline', 'pchip', 'makima', 'movmean', 'movmedian', 'knn'];
function fillmissingFn(args, nargout, ctx) {
  need(args, 2, 'fillmissing');
  const A = args[0];
  const method = optArg(args[1]);
  if (!FILL_METHODS.includes(method)) throw E('base:fillmissing:invalidMethod', `Invalid fill method '${textArg(args[1]) ?? '?'}'.`);
  let i = 2, cval = null, win = null;
  if (method === 'constant') { cval = args[2]; i = 3; if (cval === undefined) throw E('base:fillmissing:missingConstant', "The 'constant' method needs a fill value."); }
  if (method === 'movmean' || method === 'movmedian') { win = args[2]; i = 3; if (win === undefined) throw E('base:fillmissing:missingWindow', 'Moving methods need a window length.'); }
  let dim = null;
  if (isNumV(args[i])) { dim = dense(args[i], 'fillmissing').re[0] - 1; i++; }
  let endv = null, maxGap = Infinity, sp = null;
  for (; i < args.length; i += 2) {
    const s = optArg(args[i]); const v = args[i + 1];
    if (s === 'endvalues') endv = v;
    else if (s === 'maxgap') maxGap = dense(v, 'fillmissing').re[0];
    else if (s === 'samplepoints') sp = Float64Array.from(dense(v, 'fillmissing').re);
    else if (s === 'missinglocations') throw E('base:fillmissing:unsupportedOption', "'MissingLocations' is not supported.");
    else throw E('base:fillmissing:invalidOption', `Invalid option '${textArg(args[i]) ?? '?'}'.`);
  }
  const mask = missingMask(A, ctx);
  if (!isTensor(A) && !isSparse(A)) {
    // text arrays: constant / previous / next / nearest only
    if (!['constant', 'previous', 'next', 'nearest'].includes(method)) throw E('base:fillmissing:textMethod', `Method '${method}' is not supported for text data.`);
    const isStr = isString(A); const items = isStr ? A.data.slice() : A.data.slice();
    const k = dim ?? firstNonSingleton(A.dims);
    const { before, len, after } = splitDims(A.dims, k);
    const cv = cval ? (isStr ? textList(cval, 'Fill').list[0] : S(textList(cval, 'Fill').list[0])) : null;
    for (let a = 0; a < after; a++) for (let b = 0; b < before; b++) {
      const at = (q) => a * before * len + q * before + b;
      const src = Array.from({ length: len }, (_, q) => items[at(q)]);
      const mk = Array.from({ length: len }, (_, q) => mask[at(q)]);
      for (let q = 0; q < len; q++) {
        if (!mk[q]) continue;
        let p = -1, nx = -1;
        for (let r = q - 1; r >= 0; r--) if (!mk[r]) { p = r; break; }
        for (let r = q + 1; r < len; r++) if (!mk[r]) { nx = r; break; }
        let pick = null;
        if (method === 'constant') { items[at(q)] = cv; continue; }
        if (method === 'previous') pick = p; else if (method === 'next') pick = nx;
        else pick = p < 0 ? nx : nx < 0 ? p : (q - p <= nx - q ? (q - p < nx - q ? p : nx) : nx);
        if (pick >= 0) items[at(q)] = src[pick];
      }
    }
    const R = isStr ? stringArray(A.dims, items) : cell(A.dims, items);
    return nargout >= 2 ? [R, finalize('logical', A.dims, Float64Array.from(mask, (x, q) => (x && !first(call1(ctx, 'ismissing', [gather(R, [q], [1, 1])])).re[0] ? 1 : 0)))] : R;
  }
  const t = numIn(A, 'fillmissing');
  const k = dim ?? firstNonSingleton(t.dims);
  const len = t.dims[k] ?? 1;
  const x = sp || Float64Array.from({ length: len }, (_, q) => q + 1);
  const cv = cval ? dense(cval, 'fillmissing').re : null;
  const isInterp = ['linear', 'spline', 'pchip', 'makima'].includes(method);
  const endMode = endv == null ? 'extrap' : optArg(endv) ?? 'value';
  const endVal = endMode === 'value' ? dense(endv, 'fillmissing').re[0] : null;
  let sliceNo = 0;
  const filled = new Float64Array(t.re.length);
  const doFill = (y) => {
    const out = Float64Array.from(y), n = y.length;
    const ok = []; for (let q = 0; q < n; q++) if (y[q] === y[q]) ok.push(q);
    const first0 = ok.length ? ok[0] : n, last0 = ok.length ? ok[ok.length - 1] : -1;
    // gap lengths (in sample-point units) for MaxGap
    const gapOK = new Array(n).fill(true);
    if (maxGap !== Infinity) {
      for (let q = 0; q < n;) {
        if (y[q] === y[q]) { q++; continue; }
        let r = q; while (r < n && y[r] !== y[r]) r++;
        const lo = q > 0 ? x[q - 1] : x[q], hi = r < n ? x[r] : x[r - 1];
        if (hi - lo > maxGap) for (let s = q; s < r; s++) gapOK[s] = false;
        q = r;
      }
    }
    let interp = null;
    if (isInterp && ok.length >= 2) {
      const xq = []; for (let q = 0; q < n; q++) if (y[q] !== y[q]) xq.push(x[q]);
      const r = toTensor(first(call1(ctx, 'interp1', [tensor('double', [ok.length, 1], Float64Array.from(ok, (q) => x[q])), tensor('double', [ok.length, 1], Float64Array.from(ok, (q) => y[q])), tensor('double', [xq.length, 1], Float64Array.from(xq)), S(method), S('extrap')]))).re;
      interp = new Map(); let p = 0; for (let q = 0; q < n; q++) if (y[q] !== y[q]) interp.set(q, r[p++]);
    }
    for (let q = 0; q < n; q++) {
      if (y[q] === y[q] || !gapOK[q]) continue;
      const isEnd = q < first0 || q > last0;
      if (isEnd && endMode !== 'extrap') {
        if (endMode === 'none') continue;
        if (endMode === 'value') { out[q] = endVal; continue; }
        const e = endMode === 'previous' ? (q > last0 ? last0 : -1) : endMode === 'next' ? (q < first0 ? first0 : -1) : (q < first0 ? first0 : last0);
        if (e >= 0 && e < n) out[q] = y[e];
        continue;
      }
      let p = -1, nx = -1;
      for (let r = q - 1; r >= 0; r--) if (y[r] === y[r]) { p = r; break; }
      for (let r = q + 1; r < n; r++) if (y[r] === y[r]) { nx = r; break; }
      if (method === 'constant') out[q] = cv.length === 1 ? cv[0] : cv[sliceNo] ?? cv[0];
      else if (method === 'previous') { if (p >= 0) out[q] = y[p]; }
      else if (method === 'next') { if (nx >= 0) out[q] = y[nx]; }
      else if (method === 'nearest' || (isInterp && ok.length === 1)) {
        const pick = p < 0 ? nx : nx < 0 ? p : (x[q] - x[p] < x[nx] - x[q] ? p : nx);
        if (pick >= 0) out[q] = y[pick];
      } else if (isInterp) { if (interp) out[q] = interp.get(q); }
      else if (method === 'movmean' || method === 'movmedian' || method === 'knn') {
        const w = method === 'knn' ? null : dense(win, 'fillmissing').re;
        let kb, kf;
        if (w) { if (w.length === 2) [kb, kf] = w; else if (Number.isInteger(w[0]) && w[0] % 2 === 0) { kb = w[0] / 2; kf = w[0] / 2 - 1; } else { kb = kf = (w[0] - 1) / 2; } }
        const vals = []; for (let r = 0; r < n; r++) if (y[r] === y[r] && x[r] >= x[q] - kb && x[r] <= x[q] + kf) vals.push(y[r]);
        if (vals.length) { if (method === 'movmean') out[q] = vals.reduce((s2, v) => s2 + v, 0) / vals.length; else { vals.sort((a2, b2) => a2 - b2); const m2 = vals.length; out[q] = m2 % 2 ? vals[(m2 - 1) / 2] : (vals[m2 / 2 - 1] + vals[m2 / 2]) / 2; } }
      }
    }
    sliceNo++;
    return out;
  };
  const r = along(t, k, len, doFill);
  const F = finalize(t.cls === 'single' ? 'single' : t.cls, t.dims, r.re, r.im);
  if (nargout >= 2) { for (let q = 0; q < t.re.length; q++) filled[q] = mask[q] && F.re[q] === F.re[q] ? 1 : 0; return [F, finalize('logical', t.dims, filled)]; }
  return F;
}

// ------------------------------------------------------------- outliers

const MADC = 1.482602218505602; // -1/(sqrt(2)*erfcinv(3/2))
const medianOf = (a) => { const s = Float64Array.from(a).sort(); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
function quartiles(a) {
  const s = Float64Array.from(a).sort(); const n = s.length;
  const pct = (p) => { if (!n) return NaN; if (n === 1) return s[0]; const pos = p * n + 0.5; if (pos <= 1) return s[0]; if (pos >= n) return s[n - 1]; const i = Math.floor(pos); return s[i - 1] + (pos - i) * (s[i] - s[i - 1]); };
  return [pct(0.25), pct(0.75)];
}
function tInvApprox(p, v) {
  // inverse Student t by bisection on the regularized incomplete beta (numeric/_kernels import avoided: series)
  let lo = 0, hi = 1e3;
  const cdfUp = (t) => { const x = v / (v + t * t); return 0.5 * ibeta(x, v / 2, 0.5); };
  for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; if (cdfUp(mid) > 1 - p) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
function ibeta(x, a, b) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const lbeta = lgam(a) + lgam(b) - lgam(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta);
  if (x > (a + 1) / (a + b + 2)) return 1 - ibeta(1 - x, b, a);
  let f = 1, c = 1, d = 0;
  for (let i = 0; i <= 300; i++) {
    const m = i >> 1;
    let num2;
    if (i === 0) num2 = 1; else if (i % 2 === 0) num2 = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m)); else num2 = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num2 * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c = 1 + num2 / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    const cd = c * d; f *= cd;
    if (Math.abs(1 - cd) < 1e-15) break;
  }
  return front * (f - 1) / a;
}
function lgam(z) {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61503916999185, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - lgam(1 - z);
  z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
function outlierArgs(args, start, fname) {
  let i = start, method = 'median', win = null, dim = null;
  const s0 = optArg(args[i]);
  if (s0 !== null && ['median', 'mean', 'quartiles', 'grubbs', 'gesd', 'movmedian', 'movmean'].includes(s0)) {
    method = s0; i++;
    if (method === 'movmedian' || method === 'movmean') { win = dense(args[i], fname).re; i++; }
  }
  if (isNumV(args[i])) { dim = dense(args[i], fname).re[0] - 1; i++; }
  const o = { method, win, dim, thr: null, maxNum: null, sp: null };
  for (; i < args.length; i += 2) {
    const s = optArg(args[i]); const v = args[i + 1];
    if (s === 'thresholdfactor') o.thr = dense(v, fname).re[0];
    else if (s === 'maxnumoutliers') o.maxNum = dense(v, fname).re[0];
    else if (s === 'samplepoints') o.sp = Float64Array.from(dense(v, fname).re);
    else if (s === 'outlierlocations') throw E(`base:${fname}:unsupportedOption`, "'OutlierLocations' is not supported.");
    else throw E(`base:${fname}:invalidOption`, `Invalid option '${textArg(args[i]) ?? '?'}'.`);
  }
  return o;
}
/** Per slice: returns {tf, lo, hi, center} arrays (lo/hi/center are per element for moving methods). */
function detectSlice(y, o) {
  const n = y.length, tf = new Float64Array(n), lo = new Float64Array(n), hi = new Float64Array(n), ce = new Float64Array(n);
  const ok = Array.from(y).filter((v) => v === v);
  const setAll = (l, h, c) => { lo.fill(l); hi.fill(h); ce.fill(c); };
  const m = o.method;
  if (m === 'median') { const c = medianOf(ok), mad = MADC * medianOf(ok.map((v) => Math.abs(v - c))), t = o.thr ?? 3; setAll(c - t * mad, c + t * mad, c); }
  else if (m === 'mean') { const k = ok.length, c = ok.reduce((a, b) => a + b, 0) / k; const sd = Math.sqrt(ok.reduce((a, b) => a + (b - c) ** 2, 0) / (k - 1)); const t = o.thr ?? 3; setAll(c - t * sd, c + t * sd, c); }
  else if (m === 'quartiles') { const [q1, q3] = quartiles(ok), iq = q3 - q1, t = o.thr ?? 1.5; setAll(q1 - t * iq, q3 + t * iq, (q1 + q3) / 2); }
  else if (m === 'grubbs' || m === 'gesd') {
    const alpha = o.thr ?? 0.05;
    const idx = []; for (let q = 0; q < n; q++) if (y[q] === y[q]) idx.push(q);
    const maxOut = m === 'grubbs' ? idx.length : Math.min(o.maxNum ?? Math.ceil(idx.length * 0.1), idx.length - 2);
    const removed = []; let cur = idx.slice(); let nOut = 0;
    const lambda = [];
    for (let r = 1; r <= maxOut && cur.length > 2; r++) {
      const k = cur.length; const c = cur.reduce((a, q) => a + y[q], 0) / k;
      const sd = Math.sqrt(cur.reduce((a, q) => a + (y[q] - c) ** 2, 0) / (k - 1));
      let best = cur[0], bv = -1; for (const q of cur) { const d = Math.abs(y[q] - c); if (d > bv) { bv = d; best = q; } }
      const R = sd > 0 ? bv / sd : 0;
      const p = m === 'grubbs' ? 1 - alpha / (2 * k) : 1 - alpha / (2 * (k));
      const tc = tInvApprox(p, k - 2);
      const lam = ((k - 1) * tc) / Math.sqrt((k - 2 + tc * tc) * k);
      lambda.push(lam);
      removed.push(best);
      if (R > lam) nOut = r; else if (m === 'grubbs') break;
      cur = cur.filter((q) => q !== best);
    }
    for (let r = 0; r < nOut; r++) tf[removed[r]] = 1;
    const keep = idx.filter((q) => !tf[q]); const k = keep.length; const c = keep.reduce((a, q) => a + y[q], 0) / k;
    const sd = Math.sqrt(keep.reduce((a, q) => a + (y[q] - c) ** 2, 0) / (k - 1));
    const lam = lambda[nOut] ?? lambda[lambda.length - 1] ?? 0;
    setAll(c - lam * sd, c + lam * sd, c);
    return { tf, lo, hi, ce };
  } else {
    const w = o.win; const x = o.sp || Float64Array.from({ length: n }, (_, q) => q);
    let kb, kf; if (w.length === 2) [kb, kf] = w; else if (Number.isInteger(w[0]) && w[0] % 2 === 0) { kb = w[0] / 2; kf = w[0] / 2 - 1; } else { kb = kf = (w[0] - 1) / 2; }
    const t = o.thr ?? 3;
    for (let q = 0; q < n; q++) {
      const vals = []; for (let r = 0; r < n; r++) if (y[r] === y[r] && x[r] >= x[q] - kb && x[r] <= x[q] + kf) vals.push(y[r]);
      let c, s;
      if (m === 'movmedian') { c = medianOf(vals); s = MADC * medianOf(vals.map((v) => Math.abs(v - c))); }
      else { const k = vals.length; c = vals.reduce((a, b) => a + b, 0) / k; s = k > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - c) ** 2, 0) / (k - 1)) : 0; }
      lo[q] = c - t * s; hi[q] = c + t * s; ce[q] = c;
    }
  }
  for (let q = 0; q < n; q++) tf[q] = y[q] === y[q] && (y[q] < lo[q] || y[q] > hi[q]) ? 1 : 0;
  return { tf, lo, hi, ce };
}
function detectAll(t, o) {
  const k = o.dim ?? firstNonSingleton(t.dims);
  const len = t.dims[k] ?? 1;
  const moving = o.method === 'movmedian' || o.method === 'movmean';
  const res = [];
  const tf = along({ ...t, im: null }, k, len, (y) => { const r = detectSlice(y, o); res.push(r); return r.tf; });
  let p = 0;
  const pick = (key, outLen) => along({ ...t, im: null }, k, outLen, () => { const r = res[p++]; return moving ? r[key] : Float64Array.of(r[key][0]); });
  const lo = pick('lo', moving ? len : 1); p = 0;
  const hi = pick('hi', moving ? len : 1); p = 0;
  const ce = pick('ce', moving ? len : 1);
  return { k, len, tf, lo, hi, ce };
}
function isoutlierFn(args, nargout) {
  need(args, 1, 'isoutlier');
  const t = numIn(args[0], 'isoutlier');
  const o = outlierArgs(args, 1, 'isoutlier');
  const r = detectAll(t, o);
  const outs = [finalize('logical', t.dims, r.tf.re), dbl(r.lo.dims, r.lo.re), dbl(r.hi.dims, r.hi.re), dbl(r.ce.dims, r.ce.re)];
  return nargout <= 1 ? outs[0] : outs.slice(0, nargout);
}
function rmoutliersFn(args, nargout) {
  need(args, 1, 'rmoutliers');
  const t = numIn(args[0], 'rmoutliers');
  const o = outlierArgs(args, 1, 'rmoutliers');
  const d = t.dims;
  const isVec = d.length === 2 && (d[0] === 1 || d[1] === 1);
  const r = detectAll(t, isVec ? o : { ...o, dim: o.dim ?? 0 });
  const tfA = r.tf.re;
  if (isVec) {
    const keep = []; for (let q = 0; q < tfA.length; q++) if (!tfA[q]) keep.push(q);
    const B = gather(t, keep, d[0] === 1 ? [1, keep.length] : [keep.length, 1]);
    return nargout >= 2 ? [B, finalize('logical', d, Float64Array.from(tfA))] : B;
  }
  const [rows, cols] = d; const dim = o.dim ?? 0;
  const nOut = dim === 0 ? rows : cols;
  const tf = new Float64Array(nOut);
  for (let a = 0; a < rows; a++) for (let c = 0; c < cols; c++) if (tfA[a + c * rows]) tf[dim === 0 ? a : c] = 1;
  const idx = []; let B;
  if (dim === 0) { const keep = []; for (let a = 0; a < rows; a++) if (!tf[a]) keep.push(a); for (let c = 0; c < cols; c++) for (const a of keep) idx.push(a + c * rows); B = gather(t, idx, [keep.length, cols]); }
  else { const keep = []; for (let c = 0; c < cols; c++) if (!tf[c]) keep.push(c); for (const c of keep) for (let a = 0; a < rows; a++) idx.push(a + c * rows); B = gather(t, idx, [rows, keep.length]); }
  return nargout >= 2 ? [B, finalize('logical', dim === 0 ? [rows, 1] : [1, cols], tf)] : B;
}
function filloutliersFn(args, nargout, ctx) {
  need(args, 2, 'filloutliers');
  const t = numIn(args[0], 'filloutliers');
  const fm = isNumV(args[1]) ? 'value' : optArg(args[1]);
  if (!['value', 'center', 'clip', 'previous', 'next', 'nearest', 'linear', 'spline', 'pchip', 'makima'].includes(fm)) throw E('base:filloutliers:invalidFill', `Invalid fill method '${textArg(args[1]) ?? '?'}'.`);
  const o = outlierArgs(args, 2, 'filloutliers');
  const r = detectAll(t, o);
  const tf = r.tf.re;
  const moving = o.method === 'movmedian' || o.method === 'movmean';
  const { before, len, after } = splitDims(t.dims, r.k);
  const stat = (arr, q) => { if (moving) return arr.re[q]; const a = Math.floor(q / (before * len)), b = q % before; return arr.re[a * before + b]; };
  let B;
  if (fm === 'value' || fm === 'center' || fm === 'clip') {
    const fv = fm === 'value' ? dense(args[1], 'filloutliers').re[0] : null;
    const re = Float64Array.from(t.re);
    for (let q = 0; q < re.length; q++) if (tf[q]) re[q] = fm === 'value' ? fv : fm === 'center' ? stat(r.ce, q) : Math.min(Math.max(re[q], stat(r.lo, q)), stat(r.hi, q));
    B = finalize(outCls(t), t.dims, re);
  } else {
    const re = Float64Array.from(t.re, (x, q) => (tf[q] ? NaN : x));
    B = first(call1(ctx, 'fillmissing', [finalize('double', t.dims, re), S(fm), num(r.k + 1)]));
    // restore the original NaN values that were not outliers
    const bre = Float64Array.from(B.re); for (let q = 0; q < bre.length; q++) if (t.re[q] !== t.re[q]) bre[q] = NaN;
    B = finalize(outCls(t), t.dims, bre);
  }
  const outs = [B, finalize('logical', t.dims, Float64Array.from(tf)), dbl(r.lo.dims, r.lo.re), dbl(r.hi.dims, r.hi.re), dbl(r.ce.dims, r.ce.re)];
  return nargout <= 1 ? outs[0] : outs.slice(0, nargout);
}

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const builtins = {
  sinpi: (args) => mapEl(args[0], sinpiK, 'sinpi'),
  cospi: (args) => mapEl(args[0], cospiK, 'cospi'),
  cart2pol(args, nargout) {
    need(args, 2, 'cart2pol');
    const r = bcast(args.slice(0, 3), args.length >= 3 ? 3 : 2, (x, y, z) => [Math.atan2(y, x), Math.hypot(x, y), z], 'cart2pol');
    return nargout <= 1 ? r[0] : r.slice(0, Math.max(nargout, 1));
  },
  pol2cart(args, nargout) {
    need(args, 2, 'pol2cart');
    const r = bcast(args.slice(0, 3), args.length >= 3 ? 3 : 2, (th, rho, z) => [rho * Math.cos(th), rho * Math.sin(th), z], 'pol2cart');
    return nargout <= 1 ? r[0] : r.slice(0, Math.max(nargout, 1));
  },
  cart2sph(args, nargout) {
    need(args, 3, 'cart2sph');
    const r = bcast(args.slice(0, 3), 3, (x, y, z) => { const h = Math.hypot(x, y); return [Math.atan2(y, x), Math.atan2(z, h), Math.hypot(h, z)]; }, 'cart2sph');
    return nargout <= 1 ? r[0] : r.slice(0, Math.max(nargout, 1));
  },
  sph2cart(args, nargout) {
    need(args, 3, 'sph2cart');
    const r = bcast(args.slice(0, 3), 3, (az, el, rr) => { const c = rr * Math.cos(el); return [c * Math.cos(az), c * Math.sin(az), rr * Math.sin(el)]; }, 'sph2cart');
    return nargout <= 1 ? r[0] : r.slice(0, Math.max(nargout, 1));
  },
  rat: ratFn,
  rats: ratsFn,
  num2hex: num2hexFn,
  hex2num: hex2numFn,
  maxk: kFn('maxk', true),
  mink: kFn('mink', false),
  topkrows: topkrowsFn,
  issortedrows: issortedrowsFn,
  histcounts2: histcounts2Fn,
  paddata: padFn('paddata', true, false),
  trimdata: padFn('trimdata', false, true),
  resize: padFn('resize', true, true),
  ismembertol: ismembertolFn,
  uniquetol: uniquetolFn,
  append: appendFn,
  splitlines: splitlinesFn,
  strtok: strtokFn,
  replaceBetween: betweenFn('replaceBetween', false),
  eraseBetween: betweenFn('eraseBetween', true),
  matches: matchesFn,
  convertContainedStringsToChars(args, nargout) { need(args, 1, 'convertContainedStringsToChars'); const r = args.map(convContained); return nargout <= 1 ? r[0] : r; },
  underlyingType: underlyingTypeFn,
  isUnderlyingType: isUnderlyingTypeFn,
  mustBeNonmissing: mustBeNonmissingFn,
  namelengthmax: () => num(63),
  usejava: () => bool(false),
  rmmissing: rmmissingFn,
  standardizeMissing: standardizeMissingFn,
  fillmissing: fillmissingFn,
  isoutlier: isoutlierFn,
  rmoutliers: rmoutliersFn,
  filloutliers: filloutliersFn,
};
export const help = {
  sinpi: H('Sine of pi*x, exact at integers and half-integers.', 'pi*x 의 사인 (정수와 반정수에서 정확).', ['Y = sinpi(X)']),
  cospi: H('Cosine of pi*x, exact at integers and half-integers.', 'pi*x 의 코사인 (정수와 반정수에서 정확).', ['Y = cospi(X)']),
  cart2pol: H('Cartesian to polar (or cylindrical) coordinates.', '직교 좌표 → 극(원통) 좌표.', ['[theta, rho] = cart2pol(x, y)', '[theta, rho, z] = cart2pol(x, y, z)']),
  pol2cart: H('Polar (or cylindrical) to Cartesian coordinates.', '극(원통) 좌표 → 직교 좌표.', ['[x, y] = pol2cart(theta, rho)', '[x, y, z] = pol2cart(theta, rho, z)']),
  cart2sph: H('Cartesian to spherical coordinates.', '직교 좌표 → 구면 좌표.', ['[azimuth, elevation, r] = cart2sph(x, y, z)']),
  sph2cart: H('Spherical to Cartesian coordinates.', '구면 좌표 → 직교 좌표.', ['[x, y, z] = sph2cart(azimuth, elevation, r)']),
  rat: H('Rational approximation (continued fraction text or numerator/denominator).', '유리수 근사 (연분수 텍스트 또는 분자/분모).', ['R = rat(X)', '[N, D] = rat(X)', '[N, D] = rat(X, tol)']),
  rats: H('Rational approximation as fixed-width text.', '고정 폭 텍스트로 된 유리수 근사.', ['S = rats(X)', 'S = rats(X, strlen)']),
  num2hex: H('IEEE hexadecimal text of floating-point numbers.', '부동소수점 수의 IEEE 16진 텍스트.', ['hexStr = num2hex(X)']),
  hex2num: H('Double from IEEE hexadecimal text.', 'IEEE 16진 텍스트에서 double 값.', ['X = hex2num(hexStr)']),
  maxk: H('k largest elements.', '가장 큰 k 개 원소.', ['B = maxk(A, k)', 'B = maxk(A, k, dim)', '[B, I] = maxk(...)']),
  mink: H('k smallest elements.', '가장 작은 k 개 원소.', ['B = mink(A, k)', 'B = mink(A, k, dim)', '[B, I] = mink(...)']),
  topkrows: H('Top k rows in sorted order.', '정렬 순서에서 상위 k 개 행.', ['B = topkrows(X, k)', 'B = topkrows(X, k, col)', "B = topkrows(X, k, col, 'ascend')", '[B, I] = topkrows(...)']),
  issortedrows: H('True when the rows are sorted.', '행이 정렬되어 있는지 확인.', ['TF = issortedrows(A)', 'TF = issortedrows(A, column)', "TF = issortedrows(A, column, 'descend')"]),
  histcounts2: H('Bivariate histogram bin counts.', '이변량 히스토그램 구간 개수.', ['N = histcounts2(X, Y)', 'N = histcounts2(X, Y, nbins)', 'N = histcounts2(X, Y, Xedges, Yedges)', '[N, Xedges, Yedges, binX, binY] = histcounts2(...)', "N = histcounts2(..., 'Normalization', 'probability')"]),
  paddata: H('Pads data to a given size.', '데이터를 지정 크기로 채움.', ['B = paddata(A, m)', "B = paddata(A, m, 'FillValue', v, 'Side', 'both')", "B = paddata(A, m, 'Pattern', 'edge')", "B = paddata(A, m, 'Dimension', dim)"]),
  trimdata: H('Trims data to a given size.', '데이터를 지정 크기로 자름.', ['B = trimdata(A, m)', "B = trimdata(A, m, 'Side', 'leading')", "B = trimdata(A, m, 'Dimension', dim)"]),
  resize: H('Resizes data by padding or trimming.', '채우거나 잘라서 데이터 크기 변경.', ['B = resize(A, m)', "B = resize(A, m, 'FillValue', v)", "B = resize(A, m, 'Side', 'both')"]),
  ismembertol: H('Set membership within a tolerance.', '허용 오차 내 집합 소속 판정.', ['LIA = ismembertol(A, B)', 'LIA = ismembertol(A, B, tol)', '[LIA, LocB] = ismembertol(...)', "[...] = ismembertol(..., 'ByRows', true)"]),
  uniquetol: H('Unique values within a tolerance.', '허용 오차 내 고유 값.', ['C = uniquetol(A)', 'C = uniquetol(A, tol)', '[C, IA, IC] = uniquetol(...)', "C = uniquetol(..., 'ByRows', true)"]),
  append: H('Combines text (keeps trailing whitespace).', '텍스트 결합 (후행 공백 유지).', ['str = append(str1, ..., strN)']),
  splitlines: H('Splits text at newline characters.', '줄바꿈 문자에서 텍스트 분할.', ['newStr = splitlines(str)']),
  strtok: H('First token of text.', '텍스트의 첫 토큰.', ['token = strtok(str)', 'token = strtok(str, delimiters)', '[token, remain] = strtok(...)']),
  replaceBetween: H('Replaces text between boundaries.', '경계 사이의 텍스트 교체.', ['newStr = replaceBetween(str, startPat, endPat, newText)', 'newStr = replaceBetween(str, startPos, endPos, newText)', "newStr = replaceBetween(..., 'Boundaries', 'exclusive')"]),
  eraseBetween: H('Deletes text between boundaries.', '경계 사이의 텍스트 삭제.', ['newStr = eraseBetween(str, startPat, endPat)', 'newStr = eraseBetween(str, startPos, endPos)', "newStr = eraseBetween(..., 'Boundaries', 'exclusive')"]),
  matches: H('True where the whole text equals a pattern.', '텍스트 전체가 패턴과 같은지 확인.', ['TF = matches(str, pat)', "TF = matches(str, pat, 'IgnoreCase', true)"]),
  convertContainedStringsToChars: H('Converts string arrays inside cells and structs to character vectors.', '셀과 구조체 안의 string 배열을 문자형 벡터로 변환.', ['B = convertContainedStringsToChars(A)', '[B1, ..., Bn] = convertContainedStringsToChars(A1, ..., An)']),
  underlyingType: H('Class of the underlying data.', '기본 데이터의 클래스.', ['T = underlyingType(X)']),
  isUnderlyingType: H('True when the underlying data has the given class or category.', '기본 데이터가 지정 클래스나 범주인지 확인.', ["TF = isUnderlyingType(X, 'double')", "TF = isUnderlyingType(X, 'numeric')"]),
  mustBeNonmissing: H('Validates that the value has no missing elements.', '값에 누락 원소가 없는지 검증.', ['mustBeNonmissing(value)']),
  namelengthmax: H('Maximum identifier length.', '식별자 최대 길이.', ['len = namelengthmax']),
  usejava: H('True when a Java feature is available (always false here).', 'Java 기능 사용 가능 여부 (여기서는 항상 false).', ["tf = usejava('jvm')"]),
  rmmissing: H('Removes missing entries (rows of a matrix, elements of a vector).', '누락 항목 제거 (행렬은 행, 벡터는 원소).', ['R = rmmissing(A)', 'R = rmmissing(A, dim)', "R = rmmissing(..., 'MinNumMissing', n)", '[R, TF] = rmmissing(...)']),
  standardizeMissing: H('Replaces indicator values with standard missing values.', '지정한 값을 표준 누락 값으로 교체.', ['B = standardizeMissing(A, indicator)']),
  fillmissing: H('Fills missing entries.', '누락 항목 채우기.', ["F = fillmissing(A, 'constant', v)", "F = fillmissing(A, method)", "F = fillmissing(A, 'movmean', window)", 'F = fillmissing(..., dim)', "F = fillmissing(..., 'EndValues', 'nearest')", "F = fillmissing(..., 'MaxGap', g)", '[F, TF] = fillmissing(...)']),
  isoutlier: H('Finds outliers (scaled MAD, mean, quartiles, Grubbs, GESD, moving).', '이상값 찾기 (척도화 MAD, 평균, 사분위수, Grubbs, GESD, 이동 창).', ['TF = isoutlier(A)', 'TF = isoutlier(A, method)', "TF = isoutlier(A, 'movmedian', window)", "TF = isoutlier(..., 'ThresholdFactor', t)", '[TF, L, U, C] = isoutlier(...)']),
  rmoutliers: H('Removes outliers (rows of a matrix, elements of a vector).', '이상값 제거 (행렬은 행, 벡터는 원소).', ['B = rmoutliers(A)', 'B = rmoutliers(A, method)', '[B, TF] = rmoutliers(...)']),
  filloutliers: H('Replaces outliers.', '이상값 교체.', ['B = filloutliers(A, fillmethod)', 'B = filloutliers(A, fillmethod, findmethod)', '[B, TF, L, U, C] = filloutliers(...)']),
};
