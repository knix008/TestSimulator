// Elementary matrices and array manipulation: constructors, constants,
// size queries, reshape / permute / flip / circshift / repmat, find, sort.
import {
  INT_RANGE, tensor, normDims, prod, isTensor, isSparse, isString, isCell, isStruct, isChar, isObject,
  toTensor, num, bool, cell, stringArray, MError,
} from '../../value.js';
import {
  E, dense, finalize, sizeArgs, textArg, optArg, firstNonSingleton, dimArg, splitDims, dimsWith, count,
  gather, reshapeAny, permuteAny, transposeAny, classDef,
} from './util.js';

const CLASS_NAMES = new Set(['double', 'single', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64', 'logical', 'char']);
const EPS = 2.220446049250313e-16;

/** Splits trailing class name / 'like', proto arguments off a constructor call. */
export function classArgs(args, fname, def = 'double', allowed = null) {
  let cls = def, like = null, a = args;
  if (a.length >= 2 && optArg(a[a.length - 2]) === 'like') {
    like = a[a.length - 1]; a = a.slice(0, -2);
    if (!isTensor(like) && !isSparse(like)) throw E(`base:${fname}:invalidLike`, `The 'like' prototype must be a numeric or logical array.`);
    cls = like.cls;
  } else if (a.length >= 1 && textArg(a[a.length - 1]) !== null) {
    const c = textArg(a[a.length - 1]);
    if (!CLASS_NAMES.has(c) || (allowed && !allowed.includes(c))) throw E(`base:${fname}:invalidClass`, `Invalid data type '${c}'. Data type must be one of ${allowed ? allowed.join(', ') : 'double, single, int8 ... uint64, logical'}.`);
    cls = c; a = a.slice(0, -1);
  }
  return { args: a, cls, like };
}

function filledArray(args, fname, value, allowed) {
  const r = classArgs(args, fname, 'double', allowed);
  const dims = sizeArgs(r.args, fname);
  const n = prod(dims);
  const re = new Float64Array(n);
  if (value !== 0) re.fill(value);
  let im = null;
  if (r.like && r.like.im) im = new Float64Array(n);
  const t = finalize(r.cls, dims, re, null);
  if (im) t.im = im;
  return t;
}

// ------------------------------------------------------------- constants

function constFn(name, value, singleValue) {
  return (args) => {
    const r = classArgs(args, name, 'double', ['double', 'single']);
    const dims = sizeArgs(r.args, name);
    const re = new Float64Array(prod(dims));
    re.fill(r.cls === 'single' && singleValue !== undefined ? singleValue : value);
    return finalize(r.cls, dims, re);
  };
}

function intLimit(args, which, name) {
  let cls = 'int32';
  if (args.length) {
    const a = args[0];
    const t = textArg(a);
    if (t !== null) cls = t;
    else if (isTensor(a)) cls = a.cls;
    if (!(cls in INT_RANGE)) throw E(`base:${name}:invalidClass`, `Invalid class name '${cls}'. Expected an integer class name.`);
  }
  return tensor(cls, [1, 1], [INT_RANGE[cls][which]]);
}

function epsOf(x, single) {
  if (!Number.isFinite(x)) return NaN;
  x = Math.abs(x);
  if (single) {
    if (x < 1.1754943508222875e-38) return 1.401298464324817e-45;
    const e = Math.floor(Math.log2(x));
    let p = 2 ** (e - 23);
    if (2 ** e > x) p /= 2; // log2 rounding guard
    return p;
  }
  if (x < 2.2250738585072014e-308) return 4.9406564584124654e-324;
  let e = Math.floor(Math.log2(x));
  if (2 ** e > x) e--;
  if (2 ** (e + 1) <= x) e++;
  return 2 ** (e - 52);
}

// ------------------------------------------------------------- size queries

export function dimsOfValue(v, ctx) {
  if (v && v.isObject) {
    const def = classDef(ctx, v.cls);
    if (def && typeof def.size === 'function') return normDims(def.size(v));
  }
  return v.dims ? v.dims : [1, 1];
}

function sizeFn(args, nargout, ctx) {
  if (args.length < 1) throw E('base:size:notEnoughInputs', 'Not enough input arguments.');
  const d = dimsOfValue(args[0], ctx);
  if (args.length >= 2) {
    // size(A, dim) or size(A, dim1, dim2, ...) or size(A, [d1 d2])
    const ds = [];
    for (const a of args.slice(1)) {
      if (optArg(a) === 'all') { ds.push(...d.map((_, i) => i + 1)); continue; }
      const t = dense(a, 'size');
      for (const x of t.re) {
        if (!(x >= 1) || !Number.isInteger(x)) throw E('base:size:invalidDim', 'Dimension argument must be a positive integer scalar or a vector of positive integers.');
        ds.push(x);
      }
    }
    const vals = ds.map((k) => (k <= d.length ? d[k - 1] : 1));
    if (nargout <= 1) return tensor('double', [1, vals.length], vals);
    return vals.map((x) => num(x));
  }
  if (nargout <= 1) return tensor('double', [1, d.length], d);
  const out = [];
  for (let i = 0; i < nargout; i++) {
    if (i < nargout - 1) out.push(num(i < d.length ? d[i] : 1));
    else { let p = 1; for (let k = i; k < d.length; k++) p *= d[k]; out.push(num(i < d.length ? p : 1)); }
  }
  return out;
}

const numelOf = (v, ctx) => prod(dimsOfValue(v, ctx));

// ------------------------------------------------------------- find

function findFn(args, nargout) {
  if (args.length < 1) throw E('base:find:notEnoughInputs', 'Not enough input arguments.');
  const t0 = args[0];
  if (!isTensor(t0) && !isSparse(t0)) throw E('base:find:invalidType', `Function 'find' is not supported for values of class '${t0.cls}'.`);
  const t = toTensor(t0);
  let limit = Infinity, fromEnd = false;
  if (args.length >= 2) {
    const k = dense(args[1], 'find');
    if (k.re.length !== 1 || !(k.re[0] >= 0) || !(Number.isInteger(k.re[0]) || k.re[0] === Infinity)) throw E('base:find:nonIntegerK', 'Second argument must be a positive scalar integer.');
    limit = k.re[0];
  }
  if (args.length >= 3) {
    const d = optArg(args[2]);
    if (d !== 'first' && d !== 'last') throw E('base:find:invalidDirection', "Invalid search direction. Must be 'first' or 'last'.");
    fromEnd = d === 'last';
  }
  const n = t.re.length;
  let hits = [];
  if (!fromEnd) { for (let i = 0; i < n && hits.length < limit; i++) if (t.re[i] !== 0 || (t.im && t.im[i] !== 0)) hits.push(i); } else {
    for (let i = n - 1; i >= 0 && hits.length < limit; i--) if (t.re[i] !== 0 || (t.im && t.im[i] !== 0)) hits.push(i);
    hits.reverse();
  }
  const d = t.dims;
  const isRowIn = d.length === 2 && d[0] === 1 && d[1] !== 1;
  let od;
  if (isRowIn) od = [1, hits.length];
  else if (n === 0 && d.length === 2 && d[0] === 0 && d[1] === 0 && hits.length === 0) od = [0, 0];
  else if (d.length === 2 && d[0] === 1 && d[1] === 1 && hits.length === 0) od = [0, 0];
  else od = [hits.length, 1];
  if (nargout <= 1) return tensor('double', od, hits.map((i) => i + 1));
  const m = d[0];
  const rows = hits.map((i) => (i % m) + 1);
  const cols = hits.map((i) => Math.floor(i / m) + 1);
  const out = [tensor('double', od, rows), tensor('double', od, cols)];
  if (nargout >= 3) {
    const re = hits.map((i) => t.re[i]);
    const im = t.im ? hits.map((i) => t.im[i]) : null;
    out.push(finalize(t.cls === 'char' ? 'char' : t.cls, od, Float64Array.from(re), im ? Float64Array.from(im) : null));
  }
  return out;
}

// ------------------------------------------------------------- sort

/** Comparison of numbers for ascending sort with NaN last. */
const cmpAsc = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Sorts one vector of keys; returns permutation (0-based). */
export function sortPerm(keys, descend, keys2 = null, missingFirst = null) {
  const n = keys.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  const isNaNk = (i) => keys[i] !== keys[i];
  idx.sort((i, j) => {
    const ni = isNaNk(i), nj = isNaNk(j);
    if (ni || nj) {
      if (ni && nj) return i - j;
      // NaN last in ascend, first in descend (default)
      const nanLast = missingFirst === null ? !descend : !missingFirst;
      return (ni ? 1 : -1) * (nanLast ? 1 : -1);
    }
    let c = cmpAsc(keys[i], keys[j]);
    if (c === 0 && keys2) c = cmpAsc(keys2[i], keys2[j]);
    if (descend) c = -c;
    return c !== 0 ? c : i - j;
  });
  return idx;
}

/** Sorts JS strings (code unit order); null (missing) last. */
export function sortStrPerm(list, descend) {
  const idx = Array.from({ length: list.length }, (_, i) => i);
  idx.sort((i, j) => {
    const a = list[i], b = list[j];
    if (a == null || b == null) { if (a == null && b == null) return i - j; return a == null ? 1 : -1; }
    let c = a < b ? -1 : a > b ? 1 : 0;
    if (descend) c = -c;
    return c !== 0 ? c : i - j;
  });
  return idx;
}

function sortFn(args, nargout, ctx) {
  if (args.length < 1) throw E('base:sort:notEnoughInputs', 'Not enough input arguments.');
  let A = args[0];
  let dim = -1, descend = false, missing = null, cmpAbs = null;
  for (let i = 1; i < args.length; i++) {
    const o = optArg(args[i]);
    if (o === 'ascend') descend = false;
    else if (o === 'descend') descend = true;
    else if (o === 'missingplacement' || o === 'comparisonmethod') {
      const v = optArg(args[++i]);
      if (o === 'missingplacement') missing = v === 'first' ? true : v === 'last' ? false : null;
      else cmpAbs = v === 'abs' ? true : v === 'real' ? false : null;
    } else if (o === null) dim = dimArg(args[i], 'sort');
    else throw E('base:sort:invalidOption', `Invalid sorting option '${o}'.`);
  }
  const isText = isCell(A) || isString(A);
  if (isCell(A)) {
    for (const x of A.data) if (!isChar(x) || x.dims[0] > 1) throw E('base:sort:cellNotCellstr', 'Only cell arrays of character vectors are supported by sort.');
  } else if (!isTensor(A) && !isSparse(A) && !isString(A)) throw E('base:sort:invalidType', `Sorting of values of class '${A.cls}' is not supported.`);
  if (isSparse(A)) A = toTensor(A);
  const dims = A.dims;
  if (dim < 0) dim = firstNonSingleton(dims);
  const { before, len, after } = splitDims(dims, dim);
  const n = count(A);
  const order = new Int32Array(n);
  const iout = new Float64Array(n);
  const keyOf = isText ? null : A;
  const strs = isText ? (isString(A) ? A.data : A.data.map((x) => { let s = ''; for (let i = 0; i < x.re.length; i++) s += String.fromCharCode(x.re[i]); return s; })) : null;
  for (let o = 0; o < after; o++) {
    for (let b = 0; b < before; b++) {
      const base = o * before * len + b;
      let perm;
      if (isText) {
        const list = []; for (let k = 0; k < len; k++) list.push(strs[base + k * before]);
        perm = sortStrPerm(list, descend);
      } else {
        const keys = new Float64Array(len), k2 = keyOf.im || cmpAbs ? new Float64Array(len) : null;
        for (let k = 0; k < len; k++) {
          const p = base + k * before;
          if (keyOf.im && cmpAbs !== false) { keys[k] = Math.hypot(keyOf.re[p], keyOf.im[p]); k2[k] = Math.atan2(keyOf.im[p], keyOf.re[p]); } else if (cmpAbs) { keys[k] = Math.abs(keyOf.re[p]); k2[k] = keyOf.re[p]; } else keys[k] = keyOf.re[p];
        }
        perm = sortPerm(keys, descend, k2, missing);
      }
      for (let k = 0; k < len; k++) { order[base + k * before] = base + perm[k] * before; iout[base + k * before] = perm[k] + 1; }
    }
  }
  const B = gather(A, order, dims);
  if (nargout >= 2) return [B, tensor('double', dims, iout)];
  return B;
}

function issortedFn(args, nargout, ctx) {
  const A = args[0];
  let descend = false, rows = false;
  for (let i = 1; i < args.length; i++) { const o = optArg(args[i]); if (o === 'descend') descend = true; else if (o === 'rows') rows = true; else if (o === 'ascend' || o === 'monotonic' || o === 'strictascend' || o === 'strictdescend' || o === 'strictmonotonic') { descend = o.includes('descend'); } }
  if (rows) { const r = sortrowsFn([A], 2, ctx); const I = r[1].re; for (let i = 0; i < I.length; i++) if (I[i] !== i + 1) return bool(false); return bool(true); }
  if (isCell(A) || isString(A)) {
    const list = isString(A) ? A.data : A.data.map((x) => { let s = ''; for (let i = 0; i < x.re.length; i++) s += String.fromCharCode(x.re[i]); return s; });
    for (let i = 1; i < list.length; i++) { if (descend ? list[i - 1] < list[i] : list[i - 1] > list[i]) return bool(false); }
    return bool(true);
  }
  const t = toTensor(A);
  if (!(t.dims.length === 2 && (t.dims[0] === 1 || t.dims[1] === 1)) && t.re.length > 1) {
    // matrices: each column must be sorted? the reference requires a vector unless 'rows'
    throw E('base:issorted:notVector', "Input must be a vector or 'rows' must be specified.");
  }
  for (let i = 1; i < t.re.length; i++) {
    const a = t.re[i - 1], b = t.re[i];
    if (descend ? (a < b) : (a > b)) return bool(false);
    if (!descend && a !== a && b === b) return bool(false);
  }
  return bool(true);
}

/** Row comparator for sortrows on a numeric / char matrix. */
export function sortrowsFn(args, nargout, ctx) {
  if (args.length < 1) throw E('base:sortrows:notEnoughInputs', 'Not enough input arguments.');
  let A = args[0];
  let cols = null, descendAll = false;
  for (let i = 1; i < args.length; i++) {
    const o = optArg(args[i]);
    if (o === 'ascend') descendAll = false;
    else if (o === 'descend') descendAll = true;
    else if (o === 'missingplacement' || o === 'comparisonmethod') i++;
    else if (o === null) cols = Array.from(dense(args[i], 'sortrows').re);
  }
  if (isCell(A)) {
    // cellstr column (or matrix of cellstr)
    const [m, n] = A.dims;
    const strs = A.data.map((x) => { if (!isChar(x) && !isString(x)) throw E('base:sortrows:cellNotCellstr', 'Only cell arrays of character vectors are supported by sortrows.'); return isString(x) ? x.data[0] : String.fromCharCode(...x.re); });
    const useCols = cols || Array.from({ length: n }, (_, j) => j + 1);
    const idx = Array.from({ length: m }, (_, i) => i);
    idx.sort((p, q) => {
      for (const c0 of useCols) {
        const c = Math.abs(c0) - 1, desc = c0 < 0 || descendAll;
        const a = strs[p + c * m], b = strs[q + c * m];
        if (a !== b) return (a < b ? -1 : 1) * (desc ? -1 : 1);
      }
      return p - q;
    });
    const gidx = []; for (let j = 0; j < n; j++) for (const i of idx) gidx.push(i + j * m);
    const B = gather(A, gidx, [m, n]);
    return nargout >= 2 ? [B, tensor('double', [m, 1], idx.map((i) => i + 1))] : B;
  }
  if (isString(A)) {
    const [m, n] = A.dims;
    const useCols = cols || Array.from({ length: n }, (_, j) => j + 1);
    const idx = Array.from({ length: m }, (_, i) => i);
    idx.sort((p, q) => {
      for (const c0 of useCols) {
        const c = Math.abs(c0) - 1, desc = c0 < 0 || descendAll;
        const a = A.data[p + c * m], b = A.data[q + c * m];
        if (a !== b) return (a < b ? -1 : 1) * (desc ? -1 : 1);
      }
      return p - q;
    });
    const gidx = []; for (let j = 0; j < n; j++) for (const i of idx) gidx.push(i + j * m);
    const B = gather(A, gidx, [m, n]);
    return nargout >= 2 ? [B, tensor('double', [m, 1], idx.map((i) => i + 1))] : B;
  }
  if (isSparse(A)) A = toTensor(A);
  if (!isTensor(A)) throw E('base:sortrows:invalidType', `sortrows is not supported for values of class '${A.cls}'.`);
  if (A.dims.length > 2) throw E('base:sortrows:NDArray', 'Input must be a 2-D matrix.');
  const [m, n] = A.dims;
  const useCols = cols || Array.from({ length: n }, (_, j) => j + 1);
  for (const c of useCols) if (c === 0 || Math.abs(c) > n || !Number.isInteger(c)) throw E('base:sortrows:badColumn', 'Column sorting vector must contain integers with absolute value between 1 and the number of columns in the first argument.');
  const idx = Array.from({ length: m }, (_, i) => i);
  const key = (i, c) => (A.im ? Math.hypot(A.re[i + c * m], A.im[i + c * m]) : A.re[i + c * m]);
  idx.sort((p, q) => {
    for (const c0 of useCols) {
      const c = Math.abs(c0) - 1, desc = c0 < 0 || descendAll;
      const a = key(p, c), b = key(q, c);
      const na = a !== a, nb = b !== b;
      if (na || nb) { if (na && nb) continue; return (na ? 1 : -1) * (desc ? -1 : 1); }
      if (a !== b) return (a < b ? -1 : 1) * (desc ? -1 : 1);
    }
    return p - q;
  });
  const gidx = []; for (let j = 0; j < n; j++) for (const i of idx) gidx.push(i + j * m);
  const B = gather(A, gidx, [m, n]);
  return nargout >= 2 ? [B, tensor('double', [m, 1], idx.map((i) => i + 1))] : B;
}

// ------------------------------------------------------------- shape manipulation

function reshapeFn(args) {
  if (args.length < 2) throw E('base:reshape:notEnoughInputs', 'Not enough input arguments.');
  const A = args[0];
  let dims = [], unknown = -1;
  if (args.length === 2) {
    const t = dense(args[1], 'reshape');
    if (t.re.length < 2) throw E('base:reshape:sizeVector', 'Size vector must have at least two elements.');
    dims = Array.from(t.re);
  } else {
    for (let i = 1; i < args.length; i++) {
      const t = dense(args[i], 'reshape');
      if (t.re.length === 0) { if (unknown >= 0) throw E('base:reshape:unknownDim', 'Size can only have one unknown dimension.'); unknown = i - 1; dims.push(1); } else if (t.re.length !== 1) throw E('base:reshape:sizeScalar', 'Size arguments must be integer scalars.');
      else dims.push(t.re[0]);
    }
  }
  for (const d of dims) if (!(d >= 0) || !Number.isInteger(d)) throw E('base:reshape:nonIntegerSize', 'Size arguments must be real integers.');
  const n = count(A);
  if (unknown >= 0) {
    const p = prod(dims);
    if (p === 0 || n % p !== 0) throw E('base:reshape:notDivisible', `Product of known dimensions, ${p}, not divisible into total number of elements, ${n}.`);
    dims[unknown] = n / p;
  }
  return reshapeAny(A, dims);
}

function squeezeFn(args) {
  const A = args[0];
  const d = A.dims || [1, 1];
  if (d.length <= 2) return A;
  let nd = d.filter((x) => x !== 1);
  if (nd.length === 0) nd = [1, 1];
  if (nd.length === 1) nd = [nd[0], 1];
  return reshapeAny(A, nd);
}

function permuteFn(args, inverse) {
  if (args.length < 2) throw E('base:permute:notEnoughInputs', 'Not enough input arguments.');
  const A = args[0];
  const p = Array.from(dense(args[1], 'permute').re).map((x) => x - 1);
  const nd = Math.max((A.dims || [1, 1]).length, p.length);
  if (p.length < (A.dims || [1, 1]).length) throw E('base:permute:tooFewDims', 'ORDER must have at least N elements for an N-D array.');
  const seen = new Set(p);
  if (seen.size !== p.length || p.some((x) => !(x >= 0) || x >= nd || !Number.isInteger(x))) throw E('base:permute:badIndex', 'ORDER contains an invalid permutation index.');
  let perm = p;
  if (inverse) { perm = new Array(p.length); p.forEach((x, i) => { perm[x] = i; }); }
  return permuteAny(A, perm);
}

function flipAlong(A, k) {
  const d = A.dims || [1, 1];
  if (k >= d.length || d[k] <= 1) return A;
  const { before, len, after } = splitDims(d, k);
  const n = count(A);
  const idx = new Int32Array(n);
  for (let o = 0; o < after; o++) for (let j = 0; j < len; j++) for (let i = 0; i < before; i++) idx[i + j * before + o * before * len] = i + (len - 1 - j) * before + o * before * len;
  return gather(A, idx, d);
}

function circshiftAlong(A, k, s) {
  const d = A.dims || [1, 1];
  if (k >= d.length) return A;
  const { before, len, after } = splitDims(d, k);
  if (len === 0) return A;
  s = ((s % len) + len) % len;
  if (s === 0) return A;
  const n = count(A);
  const idx = new Int32Array(n);
  for (let o = 0; o < after; o++) for (let j = 0; j < len; j++) for (let i = 0; i < before; i++) idx[i + ((j + s) % len) * before + o * before * len] = i + j * before + o * before * len;
  return gather(A, idx, d);
}

function repmatFn(args) {
  if (args.length < 2) throw E('base:repmat:notEnoughInputs', 'Not enough input arguments.');
  const A = args[0];
  let reps;
  if (args.length === 2) {
    const t = dense(args[1], 'repmat');
    reps = t.re.length === 1 ? [t.re[0], t.re[0]] : Array.from(t.re);
  } else reps = args.slice(1).map((a) => { const t = dense(a, 'repmat'); if (t.re.length !== 1) throw E('base:repmat:invalidReplications', 'Replication factors must be a row vector of integers or integer scalars.'); return t.re[0]; });
  reps = reps.map((r) => { if (!Number.isInteger(r)) throw E('base:repmat:invalidReplications', 'Replication factors must be a row vector of integers or integer scalars.'); return Math.max(0, r); });
  const d = (A.dims || [1, 1]).slice();
  const nd = Math.max(d.length, reps.length);
  while (d.length < nd) d.push(1);
  while (reps.length < nd) reps.push(1);
  const od = d.map((x, i) => x * reps[i]);
  const n = prod(od);
  const idx = new Int32Array(n);
  const sub = new Array(nd).fill(0);
  for (let q = 0; q < n; q++) {
    let lin = 0, mul = 1;
    for (let i = 0; i < nd; i++) { lin += (sub[i] % d[i]) * mul; mul *= d[i]; }
    idx[q] = lin;
    for (let i = 0; i < nd; i++) { sub[i]++; if (sub[i] < od[i]) break; sub[i] = 0; }
  }
  return gather(A, idx, od);
}

function repelemFn(args) {
  if (args.length < 2) throw E('base:repelem:notEnoughInputs', 'Not enough input arguments.');
  const A = args[0];
  const d = (A.dims || [1, 1]).slice();
  const isVec = d.length === 2 && (d[0] === 1 || d[1] === 1);
  if (args.length === 2) {
    if (!isVec) throw E('base:repelem:invalidInput', 'If the first input is a matrix, at least two replication factors must be specified.');
    const r = Array.from(dense(args[1], 'repelem').re);
    const n = count(A);
    if (r.length !== 1 && r.length !== n) throw E('base:repelem:mismatchedReplications', 'Replication vector must be scalar or have the same length as the input vector.');
    const idx = [];
    for (let i = 0; i < n; i++) { const k = r.length === 1 ? r[0] : r[i]; for (let j = 0; j < k; j++) idx.push(i); }
    return gather(A, Int32Array.from(idx), d[0] === 1 ? [1, idx.length] : [idx.length, 1]);
  }
  const reps = args.slice(1).map((a) => Array.from(dense(a, 'repelem').re));
  const nd = Math.max(d.length, reps.length);
  while (d.length < nd) d.push(1);
  const maps = [];
  for (let i = 0; i < nd; i++) {
    const r = i < reps.length ? reps[i] : [1];
    if (r.length !== 1 && r.length !== d[i]) throw E('base:repelem:mismatchedReplications', 'Each replication vector must be scalar or have the length of the corresponding dimension.');
    const m = [];
    for (let j = 0; j < d[i]; j++) { const k = r.length === 1 ? r[0] : r[j]; for (let t = 0; t < k; t++) m.push(j); }
    maps.push(m);
  }
  const od = maps.map((m) => m.length);
  const n = prod(od);
  const idx = new Int32Array(n);
  const sub = new Array(nd).fill(0);
  for (let q = 0; q < n; q++) {
    let lin = 0, mul = 1;
    for (let i = 0; i < nd; i++) { lin += maps[i][sub[i]] * mul; mul *= d[i]; }
    idx[q] = lin;
    for (let i = 0; i < nd; i++) { sub[i]++; if (sub[i] < od[i]) break; sub[i] = 0; }
  }
  return gather(A, idx, od);
}

function diagFn(args) {
  const A0 = args[0];
  const k = args.length > 1 ? dense(args[1], 'diag').re[0] : 0;
  if (!Number.isInteger(k)) throw E('base:diag:kthDiagInputNotInteger', 'K-th diagonal input must be an integer scalar.');
  if (isCell(A0) || isString(A0)) {
    const d = A0.dims;
    if (d[0] === 1 || d[1] === 1) throw E('base:diag:unsupported', 'diag of a vector is supported only for numeric arrays.');
  }
  const A = isSparse(A0) ? toTensor(A0) : A0;
  if (!isTensor(A) && !isCell(A) && !isString(A)) throw E('base:diag:invalidType', `diag is not supported for values of class '${A.cls}'.`);
  if (A.dims.length > 2) throw E('base:diag:NDArray', 'First input must be 2-D.');
  const [m, n] = A.dims;
  if (m === 1 || n === 1) {
    const len = m * n;
    const N = len + Math.abs(k);
    const re = new Float64Array(N * N);
    const im = A.im ? new Float64Array(N * N) : null;
    for (let i = 0; i < len; i++) {
      const r = k >= 0 ? i : i - k, c = k >= 0 ? i + k : i;
      re[r + c * N] = A.re[i]; if (im) im[r + c * N] = A.im[i];
    }
    return { cls: A.cls, dims: [N, N], re, im };
  }
  const idx = [];
  for (let i = 0; i < m; i++) { const j = i + k; if (j >= 0 && j < n) idx.push(i + j * m); }
  return gather(A, Int32Array.from(idx), [idx.length, 1]);
}

function triFn(args, upper) {
  const A = isSparse(args[0]) ? toTensor(args[0]) : args[0];
  const k = args.length > 1 ? dense(args[1], upper ? 'triu' : 'tril').re[0] : 0;
  if (!isTensor(A)) throw E(`base:${upper ? 'triu' : 'tril'}:invalidType`, 'First input must be numeric or logical.');
  if (A.dims.length > 2) throw E(`base:${upper ? 'triu' : 'tril'}:NDArray`, 'First input must be 2-D.');
  const [m, n] = A.dims;
  const re = Float64Array.from(A.re);
  const im = A.im ? Float64Array.from(A.im) : null;
  for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) {
    const keep = upper ? j - i >= k : j - i <= k;
    if (!keep) { re[i + j * m] = 0; if (im) im[i + j * m] = 0; }
  }
  return { cls: A.cls, dims: A.dims, re, im };
}

function linspaceFn(args) {
  if (args.length < 2) throw E('base:linspace:notEnoughInputs', 'Not enough input arguments.');
  const A = dense(args[0], 'linspace'), B = dense(args[1], 'linspace');
  let n = args.length > 2 ? dense(args[2], 'linspace').re[0] : 100;
  if (Number.isNaN(n)) throw E('base:linspace:NaNInput', 'N must be a real scalar.');
  n = Math.floor(n);
  if (n < 1) n = 0;
  const cls = A.cls === 'single' || B.cls === 'single' ? 'single' : 'double';
  const a = A.re[0], b = B.re[0];
  const re = new Float64Array(n);
  let im = null;
  if (A.im || B.im) {
    im = new Float64Array(n);
    const ai = A.im ? A.im[0] : 0, bi = B.im ? B.im[0] : 0;
    for (let k = 0; k < n; k++) { re[k] = n === 1 ? b : a + (b - a) * k / (n - 1); im[k] = n === 1 ? bi : ai + (bi - ai) * k / (n - 1); }
    return finalize(cls, [1, n], re, im);
  }
  if (n === 1) re[0] = b;
  else {
    const step = (b - a) / (n - 1);
    const big = !Number.isFinite(step);
    for (let k = 0; k < n; k++) re[k] = big ? a + (b / (n - 1) - a / (n - 1)) * k : a + k * step;
    re[n - 1] = b;
    if (n > 0) re[0] = a;
  }
  return finalize(cls, [1, n], re);
}

function logspaceFn(args) {
  if (args.length < 2) throw E('base:logspace:notEnoughInputs', 'Not enough input arguments.');
  const a = dense(args[0], 'logspace').re[0];
  let b = dense(args[1], 'logspace').re[0];
  const n = args.length > 2 ? Math.floor(dense(args[2], 'logspace').re[0]) : 50;
  if (b === Math.PI) b = Math.log10(Math.PI);
  const lin = linspaceFn([num(a), num(b), num(n)]);
  const re = Float64Array.from(lin.re, (x) => 10 ** x);
  return tensor('double', [1, Math.max(0, n)], re);
}

function asVector(v, fname) {
  const t = isSparse(v) ? toTensor(v) : v;
  if (!isTensor(t)) throw E(`base:${fname}:invalidType`, 'Grid vectors must be numeric.');
  return t;
}

function meshgridFn(args, nargout) {
  if (args.length < 1) throw E('base:meshgrid:notEnoughInputs', 'Not enough input arguments.');
  const x = asVector(args[0], 'meshgrid');
  const y = asVector(args.length > 1 ? args[1] : args[0], 'meshgrid');
  const three = args.length > 2 || (args.length === 1 && nargout === 3);
  const z = three ? asVector(args.length > 2 ? args[2] : args[0], 'meshgrid') : null;
  const nx = x.re.length, ny = y.re.length, nz = z ? z.re.length : 1;
  const dims = z ? [ny, nx, nz] : [ny, nx];
  const n = nx * ny * nz;
  const mk = (src, f) => {
    const re = new Float64Array(n);
    const im = src.im ? new Float64Array(n) : null;
    for (let k = 0; k < nz; k++) for (let j = 0; j < nx; j++) for (let i = 0; i < ny; i++) { const p = i + j * ny + k * nx * ny; const s = f(i, j, k); re[p] = src.re[s]; if (im) im[p] = src.im[s]; }
    return { cls: src.cls, dims: normDims(dims), re, im };
  };
  const out = [mk(x, (i, j) => j), mk(y, (i) => i)];
  if (z) out.push(mk(z, (i, j, k) => k));
  return nargout <= 1 ? out[0] : out.slice(0, Math.max(nargout, 1));
}

function ndgridFn(args, nargout) {
  if (args.length < 1) throw E('base:ndgrid:notEnoughInputs', 'Not enough input arguments.');
  const nout = Math.max(1, nargout);
  const vecs = [];
  for (let i = 0; i < Math.max(nout, args.length); i++) vecs.push(asVector(args.length === 1 ? args[0] : args[i], 'ndgrid'));
  if (args.length > 1 && args.length < nout) throw E('base:ndgrid:notEnoughInputs', 'Not enough input arguments.');
  const dims = vecs.map((v) => v.re.length);
  if (dims.length === 1) dims.push(1);
  const n = prod(dims);
  const out = [];
  for (let q = 0; q < nout; q++) {
    const v = vecs[q];
    const re = new Float64Array(n); const im = v.im ? new Float64Array(n) : null;
    let stride = 1; for (let i = 0; i < q; i++) stride *= dims[i];
    const len = dims[q];
    for (let p = 0; p < n; p++) { const s = Math.floor(p / stride) % len; re[p] = v.re[s]; if (im) im[p] = v.im[s]; }
    out.push({ cls: v.cls, dims: normDims(dims), re, im });
  }
  return nout === 1 ? out[0] : out;
}

function sub2indFn(args) {
  if (args.length < 2) throw E('base:sub2ind:notEnoughInputs', 'Not enough input arguments.');
  const d = Array.from(dense(args[0], 'sub2ind').re);
  const subs = args.slice(1).map((a) => dense(a, 'sub2ind'));
  const n = subs[0].re.length;
  for (const s of subs) if (s.re.length !== n) throw E('base:sub2ind:SubscriptVectorSize', 'The subscript vectors must all be of the same size.');
  const k = subs.length;
  const ext = d.slice(0, k); while (ext.length < k) ext.push(1);
  if (d.length > k) { let p = 1; for (let i = k - 1; i < d.length; i++) p *= d[i]; ext[k - 1] = p; }
  const re = new Float64Array(n);
  for (let q = 0; q < n; q++) {
    let lin = 0, mul = 1;
    for (let i = 0; i < k; i++) {
      const s = subs[i].re[q];
      if (!(s >= 1) || s > ext[i] || !Number.isInteger(s)) throw E('base:sub2ind:IndexOutOfRange', 'Out of range subscript.');
      lin += (s - 1) * mul; mul *= ext[i];
    }
    re[q] = lin + 1;
  }
  return tensor('double', subs[0].dims, re);
}

function ind2subFn(args, nargout) {
  if (args.length < 2) throw E('base:ind2sub:notEnoughInputs', 'Not enough input arguments.');
  const d = Array.from(dense(args[0], 'ind2sub').re);
  const ind = dense(args[1], 'ind2sub');
  const nout = Math.max(1, nargout);
  const ext = d.slice(0, nout); while (ext.length < nout) ext.push(1);
  if (d.length > nout) { let p = 1; for (let i = nout - 1; i < d.length; i++) p *= d[i]; ext[nout - 1] = p; }
  const total = prod(d);
  const outs = ext.map(() => new Float64Array(ind.re.length));
  for (let q = 0; q < ind.re.length; q++) {
    let x = ind.re[q];
    if (!(x >= 1) || x > total || !Number.isInteger(x)) throw E('base:ind2sub:IndexOutOfRange', 'Index out of range; index must be a positive integer less than or equal to the number of elements.');
    x -= 1;
    for (let i = 0; i < nout; i++) { if (i === nout - 1) outs[i][q] = x + 1; else { outs[i][q] = (x % ext[i]) + 1; x = Math.floor(x / ext[i]); } }
  }
  const vals = outs.map((o) => tensor('double', ind.dims, o));
  return nout === 1 ? vals[0] : vals;
}

function shiftdimFn(args, nargout) {
  const A = args[0];
  const d = (A.dims || [1, 1]).slice();
  let n;
  if (args.length > 1) n = dense(args[1], 'shiftdim').re[0];
  else { n = 0; while (n < d.length && d[n] === 1) n++; if (n === d.length) n = 0; }
  let B;
  if (n > 0) {
    const nd = d.length;
    const perm = []; for (let i = 0; i < nd; i++) perm.push((i + n) % nd);
    B = permuteAny(A, perm);
  } else if (n < 0) B = reshapeAny(A, [...new Array(-n).fill(1), ...d]);
  else B = A;
  return nargout >= 2 ? [B, num(n)] : B;
}

const isVecDims = (d) => d.length === 2 && (d[0] === 1 || d[1] === 1);

function H(en, ko, syntax) { return { en, ko, syntax }; }

export const builtins = {
  zeros: (args) => filledArray(args, 'zeros', 0),
  ones: (args) => filledArray(args, 'ones', 1),
  eye(args) {
    const r = classArgs(args, 'eye', 'double');
    const dims = sizeArgs(r.args, 'eye');
    if (dims.length > 2) throw E('base:eye:NDArray', 'N-dimensional arrays are not supported.');
    const [m, n] = dims;
    const re = new Float64Array(m * n);
    for (let i = 0; i < Math.min(m, n); i++) re[i + i * m] = 1;
    return finalize(r.cls, dims, re);
  },
  Inf: constFn('Inf', Infinity), inf: constFn('inf', Infinity),
  NaN: constFn('NaN', NaN), nan: constFn('nan', NaN),
  pi: constFn('pi', Math.PI),
  flintmax(args) { const c = args.length ? textArg(args[0]) : 'double'; return c === 'single' ? tensor('single', [1, 1], [16777216]) : num(9007199254740992); },
  realmax(args) {
    const r = classArgs(args, 'realmax', 'double', ['double', 'single']);
    const v = r.cls === 'single' ? 3.4028234663852886e38 : Number.MAX_VALUE;
    const t = tensor(r.cls, sizeArgs(r.args, 'realmax')); t.re.fill(v); return t;
  },
  realmin(args) {
    const r = classArgs(args, 'realmin', 'double', ['double', 'single']);
    const v = r.cls === 'single' ? 1.1754943508222875e-38 : 2.2250738585072014e-308;
    const t = tensor(r.cls, sizeArgs(r.args, 'realmin')); t.re.fill(v); return t;
  },
  eps(args) {
    if (args.length === 1 && isTensor(args[0]) && textArg(args[0]) === null) {
      const x = args[0];
      if (x.cls !== 'double' && x.cls !== 'single') throw E('base:eps:invalidType', 'Input must be a floating-point array or a floating-point class name.');
      const re = Float64Array.from(x.re, (v) => epsOf(v, x.cls === 'single'));
      return tensor(x.cls, x.dims, re);
    }
    const r = classArgs(args, 'eps', 'double', ['double', 'single']);
    const t = tensor(r.cls, sizeArgs(r.args, 'eps')); t.re.fill(r.cls === 'single' ? 1.1920928955078125e-7 : EPS); return t;
  },
  intmax: (args) => intLimit(args, 1, 'intmax'),
  intmin: (args) => intLimit(args, 0, 'intmin'),
  i: (args) => { if (args.length) throw E('base:i:tooManyInputs', 'Too many input arguments.'); return tensor('double', [1, 1], [0], [1]); },
  j: (args) => { if (args.length) throw E('base:j:tooManyInputs', 'Too many input arguments.'); return tensor('double', [1, 1], [0], [1]); },
  true(args) { const r = classArgs(args, 'true', 'logical', ['logical']); const t = tensor('logical', sizeArgs(r.args, 'true')); t.re.fill(1); return t; },
  false(args) { const r = classArgs(args, 'false', 'logical', ['logical']); return tensor('logical', sizeArgs(r.args, 'false')); },
  linspace: linspaceFn,
  logspace: logspaceFn,
  meshgrid: meshgridFn,
  ndgrid: ndgridFn,
  repmat: repmatFn,
  repelem: repelemFn,
  reshape: reshapeFn,
  squeeze: squeezeFn,
  permute: (args) => permuteFn(args, false),
  ipermute: (args) => permuteFn(args, true),
  circshift(args) {
    if (args.length < 2) throw E('base:circshift:notEnoughInputs', 'Not enough input arguments.');
    let A = args[0];
    const K = Array.from(dense(args[1], 'circshift').re);
    if (args.length > 2) return circshiftAlong(A, dimArg(args[2], 'circshift'), K[0]);
    if (K.length === 1) return circshiftAlong(A, firstNonSingleton(A.dims || [1, 1]), K[0]);
    K.forEach((s, k) => { A = circshiftAlong(A, k, s); });
    return A;
  },
  flip(args) {
    const A = args[0];
    const k = args.length > 1 ? dimArg(args[1], 'flip') : firstNonSingleton(A.dims || [1, 1]);
    return flipAlong(A, k);
  },
  fliplr: (args) => flipAlong(args[0], 1),
  flipud: (args) => flipAlong(args[0], 0),
  rot90(args) {
    const A = args[0];
    if ((A.dims || [1, 1]).length > 2) throw E('base:rot90:NDArray', 'A must be a 2-D array.');
    let k = args.length > 1 ? dense(args[1], 'rot90').re[0] : 1;
    if (!Number.isInteger(k)) throw E('base:rot90:kNonInteger', 'k must be an integer scalar.');
    k = ((k % 4) + 4) % 4;
    if (k === 0) return A;
    if (k === 1) return flipAlong(transposeAny(A), 0);
    if (k === 2) return flipAlong(flipAlong(A, 0), 1);
    return transposeAny(flipAlong(A, 0));
  },
  shiftdim: shiftdimFn,
  diag: diagFn,
  tril: (args) => triFn(args, false),
  triu: (args) => triFn(args, true),
  size: sizeFn,
  length(args, nargout, ctx) { const d = dimsOfValue(args[0], ctx); return num(prod(d) === 0 ? 0 : Math.max(...d)); },
  numel(args, nargout, ctx) { if (args.length > 1) return num(1); return num(numelOf(args[0], ctx)); },
  ndims(args, nargout, ctx) { return num(dimsOfValue(args[0], ctx).length); },
  isempty(args, nargout, ctx) { return bool(numelOf(args[0], ctx) === 0); },
  isscalar(args, nargout, ctx) { return bool(numelOf(args[0], ctx) === 1); },
  isvector(args, nargout, ctx) { const d = dimsOfValue(args[0], ctx); return bool(isVecDims(d) && prod(d) >= 1); },
  isrow(args, nargout, ctx) { const d = dimsOfValue(args[0], ctx); return bool(d.length === 2 && d[0] === 1); },
  iscolumn(args, nargout, ctx) { const d = dimsOfValue(args[0], ctx); return bool(d.length === 2 && d[1] === 1); },
  ismatrix(args, nargout, ctx) { return bool(dimsOfValue(args[0], ctx).length === 2); },
  issquare(args, nargout, ctx) { const d = dimsOfValue(args[0], ctx); return bool(d.length === 2 && d[0] === d[1]); },
  find: findFn,
  sort: sortFn,
  sortrows: sortrowsFn,
  issorted: issortedFn,
  sub2ind: sub2indFn,
  ind2sub: ind2subFn,
};

export const help = {
  zeros: H('Array of zeros.', '0으로 채운 배열.', ['X = zeros(n)', 'X = zeros(m, n, ...)', 'X = zeros(sz)', "X = zeros(..., 'int8')", "X = zeros(..., 'like', p)"]),
  ones: H('Array of ones.', '1로 채운 배열.', ['X = ones(n)', 'X = ones(m, n, ...)', "X = ones(..., classname)"]),
  eye: H('Identity matrix.', '단위 행렬.', ['I = eye(n)', 'I = eye(m, n)', "I = eye(..., classname)"]),
  Inf: H('Positive infinity.', '양의 무한대.', ['x = Inf', 'X = Inf(m, n)']),
  inf: H('Positive infinity.', '양의 무한대.', ['x = inf', 'X = inf(m, n)']),
  NaN: H('Not-a-Number.', '숫자가 아님 (NaN).', ['x = NaN', 'X = NaN(m, n)']),
  nan: H('Not-a-Number.', '숫자가 아님 (NaN).', ['x = nan', 'X = nan(m, n)']),
  pi: H('Ratio of a circle\'s circumference to its diameter.', '원주율.', ['p = pi', 'P = pi(m, n)']),
  flintmax: H('Largest consecutive integer in floating point.', '부동소수점에서 연속으로 표현 가능한 최대 정수.', ['f = flintmax', "f = flintmax('single')"]),
  realmax: H('Largest positive floating-point number.', '가장 큰 양의 부동소수점 수.', ['f = realmax', "f = realmax('single')"]),
  realmin: H('Smallest positive normalized floating-point number.', '가장 작은 양의 정규화 부동소수점 수.', ['f = realmin', "f = realmin('single')"]),
  eps: H('Floating-point relative accuracy.', '부동소수점 상대 정밀도.', ['d = eps', 'd = eps(x)', "d = eps('single')"]),
  intmax: H('Largest value of an integer type.', '정수형의 최댓값.', ['v = intmax', "v = intmax('int8')"]),
  intmin: H('Smallest value of an integer type.', '정수형의 최솟값.', ['v = intmin', "v = intmin('int8')"]),
  i: H('Imaginary unit.', '허수 단위.', ['z = i']),
  j: H('Imaginary unit.', '허수 단위.', ['z = j']),
  true: H('Logical 1 (true).', '논리값 1 (참).', ['t = true', 'T = true(m, n)']),
  false: H('Logical 0 (false).', '논리값 0 (거짓).', ['f = false', 'F = false(m, n)']),
  linspace: H('Linearly spaced vector.', '선형 간격 벡터.', ['y = linspace(a, b)', 'y = linspace(a, b, n)']),
  logspace: H('Logarithmically spaced vector.', '로그 간격 벡터.', ['y = logspace(a, b)', 'y = logspace(a, b, n)']),
  meshgrid: H('2-D and 3-D grids.', '2차원·3차원 격자.', ['[X, Y] = meshgrid(x, y)', '[X, Y, Z] = meshgrid(x, y, z)']),
  ndgrid: H('Rectangular grid in N-D space.', 'N차원 직사각 격자.', ['[X1, X2, ...] = ndgrid(x1, x2, ...)']),
  repmat: H('Repeat copies of an array.', '배열을 반복 복사.', ['B = repmat(A, n)', 'B = repmat(A, m, n, ...)', 'B = repmat(A, [m n ...])']),
  repelem: H('Repeat copies of array elements.', '배열 원소를 반복.', ['u = repelem(v, n)', 'B = repelem(A, r1, r2, ...)']),
  reshape: H('Reshape an array.', '배열 모양 변경.', ['B = reshape(A, sz)', 'B = reshape(A, m, n, ...)', 'B = reshape(A, [], n)']),
  squeeze: H('Remove dimensions of length 1.', '길이 1인 차원 제거.', ['B = squeeze(A)']),
  permute: H('Permute array dimensions.', '배열 차원 순서 바꾸기.', ['B = permute(A, order)']),
  ipermute: H('Inverse permute array dimensions.', '차원 순서 바꾸기의 역.', ['A = ipermute(B, order)']),
  circshift: H('Shift array circularly.', '배열 순환 이동.', ['B = circshift(A, K)', 'B = circshift(A, K, dim)']),
  flip: H('Flip order of elements.', '원소 순서 뒤집기.', ['B = flip(A)', 'B = flip(A, dim)']),
  fliplr: H('Flip array left to right.', '좌우 뒤집기.', ['B = fliplr(A)']),
  flipud: H('Flip array up to down.', '상하 뒤집기.', ['B = flipud(A)']),
  rot90: H('Rotate array 90 degrees.', '배열을 90도 회전.', ['B = rot90(A)', 'B = rot90(A, k)']),
  shiftdim: H('Shift array dimensions.', '배열 차원 이동.', ['B = shiftdim(A, n)', '[B, n] = shiftdim(A)']),
  diag: H('Create a diagonal matrix or get diagonal elements.', '대각 행렬 생성 또는 대각 원소 추출.', ['D = diag(v)', 'D = diag(v, k)', 'x = diag(A)', 'x = diag(A, k)']),
  tril: H('Lower triangular part of a matrix.', '행렬의 아래 삼각 부분.', ['L = tril(A)', 'L = tril(A, k)']),
  triu: H('Upper triangular part of a matrix.', '행렬의 위 삼각 부분.', ['U = triu(A)', 'U = triu(A, k)']),
  size: H('Array size.', '배열 크기.', ['sz = size(A)', 'szdim = size(A, dim)', '[m, n] = size(A)']),
  length: H('Length of the largest array dimension.', '가장 큰 차원의 길이.', ['L = length(X)']),
  numel: H('Number of array elements.', '배열 원소 개수.', ['n = numel(A)']),
  ndims: H('Number of array dimensions.', '배열 차원 수.', ['N = ndims(A)']),
  isempty: H('True for an empty array.', '빈 배열이면 참.', ['TF = isempty(A)']),
  isscalar: H('True for a scalar (1-by-1).', '스칼라(1×1)이면 참.', ['TF = isscalar(A)']),
  isvector: H('True for a vector.', '벡터이면 참.', ['TF = isvector(A)']),
  isrow: H('True for a row vector.', '행 벡터이면 참.', ['TF = isrow(A)']),
  iscolumn: H('True for a column vector.', '열 벡터이면 참.', ['TF = iscolumn(A)']),
  ismatrix: H('True for a 2-D array.', '2차원 배열이면 참.', ['TF = ismatrix(A)']),
  issquare: H('True for a square matrix.', '정사각 행렬이면 참.', ['TF = issquare(A)']),
  find: H('Find indices of nonzero elements.', '0이 아닌 원소의 인덱스 찾기.', ['k = find(X)', 'k = find(X, n)', "k = find(X, n, 'last')", '[row, col] = find(X)', '[row, col, v] = find(X)']),
  sort: H('Sort array elements.', '배열 원소 정렬.', ['B = sort(A)', 'B = sort(A, dim)', "B = sort(..., 'descend')", '[B, I] = sort(...)']),
  sortrows: H('Sort rows of a matrix, cell array or table.', '행렬·셀형 배열·테이블의 행 정렬.', ['B = sortrows(A)', 'B = sortrows(A, column)', "B = sortrows(..., 'descend')", '[B, index] = sortrows(...)']),
  issorted: H('True if array is sorted.', '정렬되어 있으면 참.', ['TF = issorted(A)', "TF = issorted(A, 'descend')", "TF = issorted(A, 'rows')"]),
  sub2ind: H('Convert subscripts to linear indices.', '첨자를 선형 인덱스로 변환.', ['ind = sub2ind(sz, row, col, ...)']),
  ind2sub: H('Convert linear indices to subscripts.', '선형 인덱스를 첨자로 변환.', ['[row, col] = ind2sub(sz, ind)', '[I1, I2, ..., In] = ind2sub(sz, ind)']),
};
