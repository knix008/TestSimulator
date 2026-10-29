// Shared helpers of the base library (argument handling, class rules,
// generic element gathering for every array kind, index resolution).
import {
  MError, INT_RANGE, NUMERIC_CLASSES, tensor, normDims, prod, isTensor, isString, isCell, isStruct,
  isChar, isObject, isSparse, toTensor, str, string, stringArray, cell, num, toStr,
} from '../../value.js';

export const E = (id, msg) => new MError(id, msg);
export const isInt = (v) => v != null && v.cls in INT_RANGE;
export const isIntCls = (c) => c in INT_RANGE;
export const FLOAT = new Set(['double', 'single']);
export { INT_RANGE, NUMERIC_CLASSES };

/** Text argument (char row or string scalar) → JS string, else null. */
export function textArg(v) {
  if (v == null) return null;
  if (isChar(v) && (v.dims[0] <= 1 && v.dims.length === 2)) return toStr(v);
  if (isString(v) && v.data.length === 1 && v.data[0] != null) return v.data[0];
  return null;
}
export const isTextScalar = (v) => textArg(v) !== null;
/** Lower-case option word, or null. */
export const optArg = (v) => { const s = textArg(v); return s === null ? null : s.toLowerCase(); };

/** Returns the array a real JS number list of a numeric argument. */
export function numbers(v) { return Array.from(toTensor(v).re); }

/** Dense numeric tensor (sparse → dense); errors on non-numeric. */
export function dense(v, fname = 'function') {
  if (isTensor(v)) return v;
  if (isSparse(v)) return toTensor(v);
  throw E(`base:${fname}:invalidType`, `Invalid data type. Argument must be numeric, char, or logical.`);
}

/** Finalizes a computed tensor for class cls: saturation / single rounding / complex simplification. */
export function finalize(cls, dims, re, im = null) {
  if (cls in INT_RANGE) {
    const r = INT_RANGE[cls];
    const lo = r[0], hi = r[1];
    for (let i = 0; i < re.length; i++) {
      const x = re[i];
      if (x !== x) re[i] = 0;
      else { const v = x < 0 ? -Math.round(-x) : Math.round(x); re[i] = v < lo ? lo : v > hi ? hi : v; }
    }
    if (im) {
      for (let i = 0; i < im.length; i++) {
        const x = im[i];
        if (x !== x) im[i] = 0;
        else { const v = x < 0 ? -Math.round(-x) : Math.round(x); im[i] = v < lo ? lo : v > hi ? hi : v; }
      }
    }
  } else if (cls === 'single') {
    for (let i = 0; i < re.length; i++) re[i] = Math.fround(re[i]);
    if (im) for (let i = 0; i < im.length; i++) im[i] = Math.fround(im[i]);
  } else if (cls === 'logical') {
    for (let i = 0; i < re.length; i++) re[i] = re[i] !== 0 ? 1 : 0;
  }
  if (im) {
    let any = false;
    for (let i = 0; i < im.length; i++) if (im[i] !== 0) { any = true; break; }
    if (!any) im = null;
  }
  return { cls, dims: normDims(dims), re, im };
}

/** First non-singleton dimension (0-based); 0 when all are 1. */
export function firstNonSingleton(dims) {
  for (let i = 0; i < dims.length; i++) if (dims[i] !== 1) return i;
  return 0;
}

/** Dimension argument (1-based value) → 0-based integer. */
export function dimArg(v, fname) {
  const t = isTensor(v) ? v : null;
  if (!t || t.re.length !== 1 || !(t.re[0] >= 1) || !Number.isInteger(t.re[0])) {
    throw E(`base:${fname}:invalidDim`, 'Dimension argument must be a positive integer scalar within indexing range.');
  }
  return t.re[0] - 1;
}

/** Splits dims around dimension k: before (product of lower dims), len, after. */
export function splitDims(dims, k) {
  let before = 1, after = 1;
  for (let i = 0; i < dims.length; i++) { if (i < k) before *= dims[i]; else if (i > k) after *= dims[i]; }
  const len = k < dims.length ? dims[k] : 1;
  return { before, len, after };
}
export function dimsWith(dims, k, n) {
  const d = dims.slice();
  while (d.length <= k) d.push(1);
  d[k] = n;
  return normDims(d);
}

/** Number of elements of any value. */
export function count(v) { return v.dims ? prod(v.dims) : 1; }

// ------------------------------------------------------------- generic gather

/** New value of the same kind with elements idx (0-based linear) and dims. */
export function gather(v, idx, dims) {
  const n = idx.length;
  dims = normDims(dims);
  if (isSparse(v)) v = toTensor(v);
  if (isTensor(v)) {
    const re = new Float64Array(n), src = v.re;
    for (let i = 0; i < n; i++) re[i] = src[idx[i]];
    let im = null;
    if (v.im) { im = new Float64Array(n); const s = v.im; for (let i = 0; i < n; i++) im[i] = s[idx[i]]; }
    return { cls: v.cls, dims, re, im };
  }
  if (v.data && !isObject(v)) {
    const data = new Array(n), src = v.data;
    for (let i = 0; i < n; i++) data[i] = src[idx[i]];
    const out = { ...v, dims, data };
    return out;
  }
  if (v.arr) {
    const C = v.arr.constructor;
    const arr = new C(n), src = v.arr;
    for (let i = 0; i < n; i++) arr[i] = src[idx[i]];
    const out = { ...v, dims, arr };
    if (v.arr2) { const a2 = new v.arr2.constructor(n); for (let i = 0; i < n; i++) a2[i] = v.arr2[idx[i]]; out.arr2 = a2; }
    if (v.arr3) { const a3 = new v.arr3.constructor(n); for (let i = 0; i < n; i++) a3[i] = v.arr3[idx[i]]; out.arr3 = a3; }
    return out;
  }
  if (v.isObject && v.rows) return v; // tables handle their own indexing
  // scalar values (function handles, scalar objects)
  if (n === 1 && idx[0] === 0) return v;
  if (n === 0) return { ...v, dims };
  throw E('base:index:unsupported', `Indexing is not supported for values of class '${v.cls}'.`);
}

/** Generic empty of the same kind. */
export function emptyLike(v, dims = [0, 0]) { return gather(v, [], dims); }

/** Reshape any array value (number of elements must match). */
export function reshapeAny(v, dims) {
  dims = normDims(dims);
  if (prod(dims) !== count(v)) throw E('base:reshape:notSameNumel', 'Number of elements must not change. Use [] as one of the size inputs to automatically calculate the appropriate size for that dimension.');
  if (isSparse(v)) v = toTensor(v);
  return { ...v, dims };
}

/** Permutation indices: out element k comes from in element idx[k]. */
export function permuteIndex(dims, perm) {
  const nd = perm.length;
  const d = dims.slice(); while (d.length < nd) d.push(1);
  const od = perm.map((p) => d[p]);
  const n = prod(od);
  const idx = new Int32Array(n);
  const stride = new Array(nd); let s = 1;
  for (let i = 0; i < nd; i++) { stride[i] = s; s *= d[i]; }
  const ostr = perm.map((p) => stride[p]); // input stride for each output dim
  const sub = new Array(nd).fill(0);
  let cur = 0;
  for (let k = 0; k < n; k++) {
    idx[k] = cur;
    // increment
    for (let q = 0; q < nd; q++) {
      sub[q]++; cur += ostr[q];
      if (sub[q] < od[q]) break;
      cur -= ostr[q] * od[q]; sub[q] = 0;
    }
  }
  return { idx, dims: od };
}
export function permuteAny(v, perm) {
  const { idx, dims } = permuteIndex(v.dims || [1, 1], perm);
  return gather(v, idx, dims);
}
export function transposeAny(v) {
  const d = v.dims || [1, 1];
  if (d.length > 2) throw E('base:transpose:NDArray', 'Transpose on ND array is not defined. Use PERMUTE instead.');
  const [m, n] = d;
  if (m === 1 || n === 1) { if (isSparse(v)) v = toTensor(v); return { ...v, dims: [n, m] }; }
  const idx = new Int32Array(m * n);
  let k = 0;
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) idx[k++] = i + j * m;
  return gather(v, idx, [n, m]);
}

// ------------------------------------------------------------- broadcasting maps

/** Index maps for implicit expansion of two dims. */
export function bcastMaps(da, db, opname = '') {
  const nd = Math.max(da.length, db.length);
  const out = [];
  for (let i = 0; i < nd; i++) {
    const x = i < da.length ? da[i] : 1, y = i < db.length ? db[i] : 1;
    if (x === y || y === 1) out.push(x);
    else if (x === 1) out.push(y);
    else throw E('base:sizeDimensionsMustMatch', 'Arrays have incompatible sizes for this operation.');
  }
  const n = prod(out);
  const ia = new Int32Array(n), ib = new Int32Array(n);
  const sa = [], sb = []; let pa = 1, pb = 1;
  for (let i = 0; i < nd; i++) {
    const x = i < da.length ? da[i] : 1, y = i < db.length ? db[i] : 1;
    sa.push(x === 1 ? 0 : pa); sb.push(y === 1 ? 0 : pb); pa *= x; pb *= y;
  }
  const sub = new Array(nd).fill(0);
  let ca = 0, cb = 0;
  for (let k = 0; k < n; k++) {
    ia[k] = ca; ib[k] = cb;
    for (let q = 0; q < nd; q++) {
      sub[q]++; ca += sa[q]; cb += sb[q];
      if (sub[q] < out[q]) break;
      ca -= sa[q] * out[q]; cb -= sb[q] * out[q]; sub[q] = 0;
    }
  }
  return { dims: normDims(out), ia, ib, n };
}

// ------------------------------------------------------------- indexing

const isColonArg = (s) => (!!s && s.colon === true) || (isChar(s) && s.re.length === 1 && s.re[0] === 58) || (isString(s) && s.data.length === 1 && s.data[0] === ':');

/** Index list (0-based) of one subscript against extent n. */
export function subIndex(s, n, allowGrow = false) {
  if (isColonArg(s)) { const a = new Int32Array(n); for (let i = 0; i < n; i++) a[i] = i; return { idx: a, shape: null, colon: true }; }
  const t = isTensor(s) ? s : isSparse(s) ? toTensor(s) : null;
  if (!t) throw E('base:index:badSubscript', `Unable to use a value of type ${s.cls} as an index.`);
  if (t.cls === 'logical') {
    if (t.re.length > n && !allowGrow) { for (let i = n; i < t.re.length; i++) if (t.re[i]) throw E('base:index:outOfBounds', `The logical indices contain a true value outside of the array bounds.`); }
    const out = [];
    for (let i = 0; i < t.re.length; i++) if (t.re[i]) out.push(i);
    return { idx: Int32Array.from(out), shape: t.dims, logical: true };
  }
  const a = new Int32Array(t.re.length);
  for (let i = 0; i < t.re.length; i++) {
    const x = t.re[i];
    if (!(x >= 1) || !Number.isInteger(x)) {
      if (x === 0 || x < 0 || !Number.isInteger(x)) throw E('base:index:badSubscript', `Index in position 1 is invalid. Array indices must be positive integers or logical values.`);
    }
    if (x > n && !allowGrow) throw E('base:index:outOfBounds', `Index exceeds the number of array elements. Index must not exceed ${n}.`);
    a[i] = x - 1;
  }
  return { idx: a, shape: t.dims };
}

/**
 * Resolves `()` subscripts on dims. Returns {idx (linear, 0-based), dims}.
 * Linear indexing keeps the index shape (vector orientation rules).
 */
export function resolveIndex(dims, subs) {
  const n = prod(dims);
  if (subs.length === 0) { const a = new Int32Array(n); for (let i = 0; i < n; i++) a[i] = i; return { idx: a, dims: dims.slice() }; }
  if (subs.length === 1) {
    const r = subIndex(subs[0], n);
    let od;
    if (r.colon) od = [n, 1];
    else {
      const sh = r.shape;
      const isVec = dims.length === 2 && (dims[0] === 1 || dims[1] === 1);
      const shVec = sh.length === 2 && (sh[0] === 1 || sh[1] === 1);
      if (r.logical) od = isVec && dims[0] === 1 ? [1, r.idx.length] : (dims[0] === 1 && sh[0] === 1 ? [1, r.idx.length] : [r.idx.length, 1]);
      else if (isVec && shVec && n !== 1) od = dims[0] === 1 ? [1, r.idx.length] : [r.idx.length, 1];
      else od = sh.slice();
    }
    return { idx: r.idx, dims: od };
  }
  const k = subs.length;
  const d = dims.slice(); while (d.length < k) d.push(1);
  // collapse trailing dims into the last subscript
  const ext = d.slice(0, k);
  if (d.length > k) { let p = 1; for (let i = k - 1; i < d.length; i++) p *= d[i]; ext[k - 1] = p; }
  const lists = subs.map((s, i) => {
    const r = subIndex(s, ext[i]);
    return r.idx;
  });
  const od = lists.map((l) => l.length);
  const total = prod(od);
  const idx = new Int32Array(total);
  const stride = []; let p = 1;
  for (let i = 0; i < k; i++) { stride.push(p); p *= ext[i]; }
  const sub = new Array(k).fill(0);
  for (let q = 0; q < total; q++) {
    let lin = 0;
    for (let i = 0; i < k; i++) lin += lists[i][sub[i]] * stride[i];
    idx[q] = lin;
    for (let i = 0; i < k; i++) { sub[i]++; if (sub[i] < od[i]) break; sub[i] = 0; }
  }
  return { idx, dims: od };
}

/** Index of the elements removed by A(subs) = []. Returns {keep: Int32Array, dims}. */
export function resolveDelete(dims, subs) {
  const n = prod(dims);
  if (subs.length === 1) {
    const r = subIndex(subs[0], n);
    const del = new Uint8Array(n); for (const i of r.idx) del[i] = 1;
    const keep = []; for (let i = 0; i < n; i++) if (!del[i]) keep.push(i);
    const od = dims.length === 2 && dims[1] === 1 && dims[0] !== 1 ? [keep.length, 1] : [1, keep.length];
    if (r.colon) return { keep: new Int32Array(0), dims: [0, 0] };
    return { keep: Int32Array.from(keep), dims: od };
  }
  // exactly one non-colon subscript allowed
  const k = subs.length;
  const d = dims.slice(); while (d.length < k) d.push(1);
  let which = -1;
  for (let i = 0; i < k; i++) if (!isColonArg(subs[i])) {
    const r = subIndex(subs[i], d[i]);
    if (r.idx.length === d[i] && [...r.idx].every((x, j) => true)) { const s = new Set(r.idx); if (s.size === d[i]) continue; }
    if (which >= 0) throw E('base:index:deleteMultipleDims', 'A null assignment can have only one non-colon index.');
    which = i;
  }
  if (which < 0) { const z = d.slice(); z[0] = 0; return { keep: new Int32Array(0), dims: normDims(z) }; }
  const r = subIndex(subs[which], d[which]);
  const del = new Uint8Array(d[which]); for (const i of r.idx) del[i] = 1;
  const keepK = []; for (let i = 0; i < d[which]; i++) if (!del[i]) keepK.push(i);
  const { before, after } = splitDims(d, which);
  const len = d[which];
  const keep = [];
  for (let o = 0; o < after; o++) for (const j of keepK) for (let i = 0; i < before; i++) keep.push(i + j * before + o * before * len);
  return { keep: Int32Array.from(keep), dims: dimsWith(d, which, keepK.length) };
}

// ------------------------------------------------------------- text helpers

export function isCellstr(v) {
  if (!isCell(v)) return false;
  for (const x of v.data) if (!(isChar(x) && (x.dims[0] <= 1 && x.dims.length === 2))) return false;
  return true;
}
/** Text collection → JS strings, null for missing; with orientation dims. */
export function textList(v, what = 'Input') {
  if (isString(v)) return { list: v.data.slice(), dims: v.dims, kind: 'string' };
  if (isChar(v)) {
    if (v.dims[0] <= 1 && v.dims.length === 2) return { list: [toStr(v)], dims: [1, 1], kind: 'char' };
    const [m, n] = v.dims; const list = [];
    for (let i = 0; i < m; i++) { let s = ''; for (let j = 0; j < n; j++) s += String.fromCharCode(v.re[i + j * m]); list.push(s); }
    return { list, dims: [m, 1], kind: 'charmat' };
  }
  if (isCell(v)) {
    const list = v.data.map((x) => {
      if (isChar(x) && x.dims.length === 2 && x.dims[0] <= 1) return toStr(x);
      if (isString(x) && x.data.length === 1) return x.data[0];
      throw E('base:text:notCellstr', `${what} must be a string array, character vector, or cell array of character vectors.`);
    });
    return { list, dims: v.dims, kind: 'cell' };
  }
  throw E('base:text:invalidInput', `${what} must be a string array, character vector, or cell array of character vectors.`);
}
/** Builds a text result in the kind of the input. */
export function makeText(list, dims, kind) {
  if (kind === 'string') return stringArray(dims, list);
  if (kind === 'cell') return cell(dims, list.map((s) => str(s == null ? '' : s)));
  if (kind === 'char') return str(list[0] == null ? '' : list[0]);
  if (kind === 'charmat') return cell(dims, list.map((s) => str(s)));
  return stringArray(dims, list);
}
export function charRow(s) { const t = str(s); if (s.length === 0) t.dims = [0, 0]; return t; }
export const S = (s) => string(s);

/** Name/value pairs from args[start..] → Map(lowercase name → value). */
export function nameValues(args, start, fname, allowed) {
  const m = new Map();
  if ((args.length - start) % 2) throw E(`base:${fname}:nameValue`, 'Name-value arguments must occur in pairs.');
  for (let i = start; i < args.length; i += 2) {
    const k = textArg(args[i]);
    if (k === null) throw E(`base:${fname}:nameValue`, 'Expected a parameter name.');
    let key = k.toLowerCase();
    if (allowed) {
      const hit = allowed.filter((a) => a.toLowerCase().startsWith(key));
      const exact = allowed.find((a) => a.toLowerCase() === key);
      if (exact) key = exact.toLowerCase();
      else if (hit.length === 1) key = hit[0].toLowerCase();
      else throw E(`base:${fname}:unknownParameter`, `Invalid parameter name '${k}'.`);
    }
    m.set(key, args[i + 1]);
  }
  return m;
}

export const numOut = (x) => num(x);
export const boolT = (dims, re) => ({ cls: 'logical', dims: normDims(dims), re, im: null });
export const dbl = (dims, re, im = null) => ({ cls: 'double', dims: normDims(dims), re, im });

/** Converts logical/char tensor to double; leaves other classes. */
export function promote(v) {
  if (v.cls === 'logical' || v.cls === 'char') return { cls: 'double', dims: v.dims, re: v.re, im: v.im };
  return v;
}

/** Plain class name for messages. */
export const clsName = (v) => (v == null ? 'double' : v.cls);

/** Size vector argument(s) → dims array (from size args like zeros(2,3) or zeros([2 3])). */
export function sizeArgs(args, fname) {
  if (args.length === 0) return [1, 1];
  let d;
  if (args.length === 1) {
    const t = dense(args[0], fname);
    if (t.re.length === 1) d = [t.re[0], t.re[0]];
    else d = Array.from(t.re);
    if (t.re.length === 0) d = [0, 0];
  } else d = args.map((a) => { const t = dense(a, fname); if (t.re.length !== 1) throw E(`base:${fname}:nonScalarSize`, 'Size inputs must be scalar.'); return t.re[0]; });
  return normDims(d.map((x) => {
    if (Number.isNaN(x)) throw E(`base:${fname}:NaNSize`, 'Size inputs must be integers.');
    if (!Number.isInteger(x) && Number.isFinite(x)) throw E(`base:${fname}:nonIntegerSize`, 'Size inputs must be integers.');
    if (x === Infinity) throw E(`base:${fname}:sizeTooLarge`, 'Requested array exceeds the maximum possible variable size.');
    return x < 0 ? 0 : x;
  }));
}

/** Looks up a JS class definition (own classes first, then registry). */
let ownClasses = null;
export function setOwnClasses(c) { ownClasses = c; }
export function classDef(ctx, name) {
  if (ownClasses && ownClasses[name]) return ownClasses[name];
  const r = ctx && (ctx.registry || ctx.session?.registry);
  if (r && r.classes && r.classes[name]) return r.classes[name];
  if (ctx && ctx.classes && ctx.classes[name]) return ctx.classes[name];
  return null;
}
/** Calls method `name` of an object operand if its class defines it. Returns undefined when not defined. */
export function objMethod(ctx, obj, name) {
  if (!obj || !obj.isObject) return null;
  const def = classDef(ctx, obj.cls);
  if (def && def.methods && typeof def.methods[name] === 'function') return def.methods[name];
  return null;
}
export function hasBuiltin(ctx, name) {
  const r = ctx && (ctx.registry || ctx.session?.registry);
  if (r && r.builtins) return !!r.builtins[name];
  if (ctx && typeof ctx.hasFunction === 'function') return ctx.hasFunction(name);
  return false;
}
export const first = (r) => (Array.isArray(r) ? r[0] : r);

/** Text description of a value's size for messages ("3x4"). */
export const dimText = (d) => d.join('x');
export { tensor, normDims, prod, num, str, string, stringArray, cell };
