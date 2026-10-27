// Indexing and indexed assignment for every non-object value kind: numeric,
// logical and char tensors, sparse matrices (through a dense view), cell
// arrays, struct arrays and string arrays.
//
// Ownership: values created by the assignment machinery are recorded in OWNED
// while exactly one slot (a variable, a cell element, a struct field) holds
// them. Such values may be updated in place, which keeps loops like
// `x(i) = v` and `x(end+1) = v` linear. Any read that lets a value escape
// (a variable used as a whole, a result of indexing) removes it from OWNED.
import {
  MError, tensor, isTensor, isCell, isStruct, isString, isSparse, toTensor, prod, normDims,
  cell, struct, stringArray, empty, INT_RANGE, saturate, str,
} from '../value.js';

export const OWNED = new WeakSet();
export const disown = (v) => { if (v !== undefined && v !== null && typeof v === 'object') OWNED.delete(v); return v; };
export const COLON = Object.freeze({ cls: ':', colon: true, dims: [1, 1] });
const isInt = (c) => c in INT_RANGE;

const idxErr = () => new MError('core:badsubscript', 'Array indices must be positive integers or logical values.');

/**
 * Converts one index argument. Returns { all: bool, list: Int32Array (0-based), max (1-based max or 0), dims (shape of the index), logical }.
 */
export function indexList(arg, extent) {
  if (arg === COLON || (arg.cls === 'char' && arg.re.length === 1 && arg.re[0] === 58)) {
    const list = new Int32Array(extent);
    for (let i = 0; i < extent; i++) list[i] = i;
    return { all: true, list, max: extent, dims: [extent, 1], logical: false };
  }
  if (isSparse(arg)) arg = toTensor(arg);
  if (!isTensor(arg)) {
    if (isCell(arg)) throw new MError('core:badsubscript', 'Unable to use a value of type cell as an index.');
    throw new MError('core:badsubscript', `Unable to use a value of type ${arg.cls} as an index.`);
  }
  const re = arg.re;
  if (arg.cls === 'logical') {
    let cnt = 0, max = 0;
    for (let i = 0; i < re.length; i++) if (re[i] !== 0) { cnt++; max = i + 1; }
    const list = new Int32Array(cnt);
    for (let i = 0, k = 0; i < re.length; i++) if (re[i] !== 0) list[k++] = i;
    const isRow = arg.dims.length === 2 && arg.dims[0] === 1;
    return { all: false, list, max, dims: isRow ? [1, cnt] : [cnt, 1], logical: true };
  }
  const n = re.length;
  const list = new Int32Array(n);
  let max = 0;
  for (let i = 0; i < n; i++) {
    const x = re[i];
    if (!(x >= 1) || x !== Math.floor(x)) {
      if (arg.im && arg.im[i] !== 0) throw new MError('core:badsubscript', 'Array indices must be positive integers or logical values.');
      throw idxErr();
    }
    list[i] = x - 1;
    if (x > max) max = x;
  }
  return { all: false, list, max, dims: arg.dims, logical: false };
}

const numelOf = (v) => prod(v.dims);

function outOfRange(pos, n, max, extent) {
  if (n === 1) return new MError('core:index:outOfBounds', `Index exceeds the number of array elements. Index must not exceed ${extent}.`);
  return new MError('core:index:outOfBounds', `Index in position ${pos + 1} exceeds array bounds. Index must not exceed ${extent}.`);
}

/** Linear indices (0-based) and result dims for v(args) (read). */
export function resolveRead(dims, args) {
  const n = args.length;
  if (n === 1) {
    const total = prod(dims);
    const ix = indexList(args[0], total);
    if (ix.max > total) throw outOfRange(0, 1, ix.max, total);
    let rdims;
    if (ix.all) rdims = [total, 1];
    else {
      const srcVec = dims.length === 2 && (dims[0] === 1 || dims[1] === 1) && total !== 1;
      const idxVec = ix.dims.length === 2 && (ix.dims[0] === 1 || ix.dims[1] === 1);
      if (srcVec && idxVec) rdims = dims[0] === 1 ? [1, ix.list.length] : [ix.list.length, 1];
      else rdims = ix.dims.slice();
    }
    return { lin: ix.list, dims: rdims };
  }
  const lists = [];
  const rdims = [];
  for (let k = 0; k < n; k++) {
    const extent = k < n - 1 ? (k < dims.length ? dims[k] : 1) : prod(dims.slice(k)) || (k < dims.length ? 0 : 1);
    const ext = k < n - 1 ? extent : (k >= dims.length ? 1 : prod(dims.slice(k)));
    const ix = indexList(args[k], ext);
    if (ix.max > ext) throw outOfRange(k, n, ix.max, ext);
    lists.push(ix.list);
    rdims.push(ix.list.length);
  }
  const total = prod(rdims);
  const lin = new Int32Array(total);
  const strides = [];
  let m = 1;
  for (let k = 0; k < n; k++) { strides.push(m); m *= k < n - 1 ? (k < dims.length ? dims[k] : 1) : 1; }
  if (n === 2) {
    const l0 = lists[0], l1 = lists[1], s1 = strides[1];
    let p = 0;
    for (let j = 0; j < l1.length; j++) { const b = l1[j] * s1; for (let i = 0; i < l0.length; i++) lin[p++] = b + l0[i]; }
  } else if (total > 0) {
    const sub = new Array(n).fill(0);
    for (let p = 0; p < total; p++) {
      let li = 0;
      for (let k = 0; k < n; k++) li += lists[k][sub[k]] * strides[k];
      lin[p] = li;
      for (let k = 0; k < n; k++) { if (++sub[k] < rdims[k]) break; sub[k] = 0; }
    }
  }
  return { lin, dims: normDims(rdims) };
}

/** Gathers elements at linear indices into a new value of the same kind. */
export function gather(v, lin, dims) {
  if (isTensor(v)) {
    const n = lin.length;
    const re = new Float64Array(n);
    const src = v.re;
    for (let i = 0; i < n; i++) re[i] = src[lin[i]];
    let im = null;
    if (v.im) {
      im = new Float64Array(n);
      let any = false;
      for (let i = 0; i < n; i++) { im[i] = v.im[lin[i]]; if (im[i] !== 0) any = true; }
      if (!any) im = null;
    }
    return tensor(v.cls, dims, re, im);
  }
  if (isCell(v)) { const d = Array.from(lin, (i) => disown(v.data[i])); return cell(dims, d); }
  if (isString(v)) return stringArray(dims, Array.from(lin, (i) => v.data[i]));
  if (isStruct(v)) { const d = Array.from(lin, (i) => v.data[i]); for (const r of d) { OWNED.delete(r); for (const f of v.fields) disown(r[f]); } return struct(dims, v.fields, d); }
  if (isSparse(v)) return toSparse(gather(toTensor(v), lin, dims));
  throw new MError('core:index:type', `Indexing is not supported for values of type ${v.cls}.`);
}

/** Dense -> sparse (CSC) conversion for 2-D numeric/logical tensors. */
export function toSparse(t) {
  const [m, n] = t.dims;
  const colPtr = new Int32Array(n + 1);
  const rows = [], re = [], im = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < m; i++) {
      const k = i + j * m;
      if (t.re[k] !== 0 || (t.im && t.im[k] !== 0)) { rows.push(i); re.push(t.re[k]); if (t.im) im.push(t.im[k]); }
    }
    colPtr[j + 1] = rows.length;
  }
  return { cls: t.cls === 'logical' ? 'logical' : 'double', sparse: true, dims: [m, n], colPtr, rowIdx: Int32Array.from(rows), re: Float64Array.from(re), im: t.im ? Float64Array.from(im) : null };
}

/** v(args) for non-object values. */
export function indexParen(v, args) {
  if (args.length === 0) return v;
  // scalar fast path
  if (args.length === 1 && v.re !== undefined && !v.sparse) {
    const a = args[0];
    if (a.cls === 'double' && a.re.length === 1 && a.dims.length === 2 && a.im === null) {
      const x = a.re[0];
      if (x >= 1 && x === Math.floor(x)) {
        if (x > v.re.length) throw outOfRange(0, 1, x, v.re.length);
        const re = new Float64Array(1);
        re[0] = v.re[x - 1];
        let im = null;
        if (v.im && v.im[x - 1] !== 0) { im = new Float64Array(1); im[0] = v.im[x - 1]; }
        return { cls: v.cls, dims: [1, 1], re, im };
      }
    }
  }
  const { lin, dims } = resolveRead(v.dims, args);
  return gather(v, lin, dims);
}

/** c{args} → array of values (a comma-separated list). */
export function indexBrace(v, args) {
  if (isCell(v)) {
    if (args.length === 1 && args[0].cls === 'double' && args[0].re.length === 1) {
      const x = args[0].re[0];
      if (x >= 1 && x === Math.floor(x)) {
        if (x > v.data.length) throw outOfRange(0, 1, x, v.data.length);
        return [disown(v.data[x - 1])];
      }
    }
    const { lin } = resolveRead(v.dims, args);
    return Array.from(lin, (i) => disown(v.data[i]));
  }
  if (isString(v)) {
    const { lin } = resolveRead(v.dims, args);
    return Array.from(lin, (i) => (v.data[i] == null ? str('') : str(v.data[i])));
  }
  if (v.cls === 'function_handle') throw new MError('core:brace:fh', 'Brace indexing is not supported for variables of this type.');
  throw new MError('core:cellRefFromNonCell', 'Brace indexing is not supported for variables of this type.');
}

/** s.name → array of values (a comma-separated list). */
export function fieldRef(v, name) {
  if (isStruct(v)) {
    if (!v.fields.includes(name)) throw new MError('core:nonExistentField', `Unrecognized field name "${name}".`);
    if (v.data.length === 1) return [disown(v.data[0][name])];
    return v.data.map((r) => disown(r[name]));
  }
  throw new MError('core:dotIndexNotSupported', 'Dot indexing is not supported for variables of this type.');
}

// ------------------------------------------------------------ assignment helpers

function fillValueFor(v) {
  if (isCell(v)) return () => empty();
  if (isString(v)) return () => null;
  if (isStruct(v)) return () => { const r = Object.create(null); for (const f of v.fields) r[f] = empty(); return r; };
  return null;
}

/** Copy of v resized to newDims (old elements keep their subscripts). */
function resized(v, newDims) {
  const od = v.dims;
  const nn = prod(newDims);
  const on = prod(od);
  const sameLayout = on === 0 || (od.length === 2 && newDims.length === 2 && (od[0] === newDims[0] || (od[1] === 1 && newDims[1] === 1)));
  const mapIdx = (i) => {
    if (sameLayout) return i;
    // old linear -> subscripts -> new linear
    let rem = i, li = 0, mul = 1;
    for (let k = 0; k < newDims.length; k++) {
      const ok = k < od.length ? od[k] : 1;
      const s = rem % ok; rem = Math.floor(rem / ok);
      li += s * mul; mul *= newDims[k];
    }
    return li;
  };
  if (isTensor(v)) {
    const re = new Float64Array(nn);
    const im = v.im ? new Float64Array(nn) : null;
    if (sameLayout) { re.set(v.re.subarray(0, Math.min(on, nn))); if (im) im.set(v.im.subarray(0, Math.min(on, nn))); }
    else for (let i = 0; i < on; i++) { const j = mapIdx(i); re[j] = v.re[i]; if (im) im[j] = v.im[i]; }
    return tensor(v.cls, newDims, re, im);
  }
  const fill = fillValueFor(v);
  const data = new Array(nn);
  for (let i = 0; i < nn; i++) data[i] = undefined;
  for (let i = 0; i < on; i++) data[mapIdx(i)] = v.data[i];
  for (let i = 0; i < nn; i++) if (data[i] === undefined) data[i] = fill();
  if (isCell(v)) return cell(newDims, data);
  if (isString(v)) return stringArray(newDims, data);
  return struct(newDims, v.fields, data);
}

/** Grows an owned tensor in place when the layout allows (amortized capacity). */
function growInPlace(v, newDims) {
  const od = v.dims;
  const on = prod(od), nn = prod(newDims);
  const sameLayout = on === 0 || (od.length === 2 && newDims.length === 2 && (od[0] === newDims[0] || (od[1] === 1 && newDims[1] === 1)));
  if (!sameLayout) return false;
  if (isTensor(v)) {
    v.re = growArray(v.re, nn);
    if (v.im) v.im = growArray(v.im, nn);
    v.dims = normDims(newDims);
    return true;
  }
  const fill = fillValueFor(v);
  for (let i = on; i < nn; i++) v.data.push(fill());
  v.dims = normDims(newDims);
  return true;
}
function growArray(a, nn) {
  const cap = (a.buffer.byteLength - a.byteOffset) / 8;
  if (cap >= nn) {
    const b = new Float64Array(a.buffer, a.byteOffset, nn);
    b.fill(0, a.length);
    return b;
  }
  const buf = new Float64Array(Math.max(nn, Math.ceil(a.length * 1.6) + 8));
  buf.set(a);
  return buf.subarray(0, nn);
}

/** Class of the result when assigning a tensor rhs into a tensor target. */
function mergeClass(t, r) {
  if (t === r) return t;
  if (isInt(t)) return t;
  if (isInt(r)) return r;
  if (t === 'single' || r === 'single') return 'single';
  if (t === 'char' && r === 'logical') return 'char';
  if (t === 'logical' && r === 'char') return 'char';
  return 'double';
}

function convertTensor(v, cls) {
  if (v.cls === cls) return v;
  const re = new Float64Array(v.re.length);
  for (let i = 0; i < re.length; i++) re[i] = saturate(cls, v.re[i]);
  let im = null;
  if (v.im) { im = new Float64Array(v.im.length); for (let i = 0; i < im.length; i++) im[i] = saturate(cls, v.im[i]); }
  return tensor(cls, v.dims, re, im);
}

function toStringArray(r) {
  if (isString(r)) return r;
  if (r.cls === 'char') {
    if (r.dims[0] <= 1) return stringArray([1, 1], [String.fromCharCode(...r.re)]);
    const [m, n] = r.dims; const rows = [];
    for (let i = 0; i < m; i++) { let s = ''; for (let j = 0; j < n; j++) s += String.fromCharCode(r.re[i + j * m]); rows.push(s); }
    return stringArray([m, 1], rows);
  }
  if (isCell(r)) return stringArray(r.dims, r.data.map((x) => toStringArray(x).data[0]));
  if (isTensor(r)) return stringArray(r.dims, Array.from(r.re, (x) => (r.cls === 'logical' ? (x ? 'true' : 'false') : String(Number.isInteger(x) ? x : Number(x.toPrecision(5))))));
  throw new MError('core:invalidConversion', `Conversion to string from ${r.cls} is not possible.`);
}

/** Brings target and rhs to a common kind. Returns [target, rhs]. */
function unify(v, r) {
  const vEmptyDouble = v === undefined || (isTensor(v) && v.cls === 'double' && prod(v.dims) === 0);
  if (v === undefined) v = emptyLike(r);
  if (isCell(v)) {
    if (isCell(r)) return [v, r];
    throw new MError('core:invalidConversion', `Conversion to cell from ${r.cls} is not possible.`);
  }
  if (isStruct(v)) {
    if (!isStruct(r)) {
      if (vEmptyDouble) return [emptyLike(r), r];
      throw new MError('core:invalidConversion', `Conversion to struct from ${r.cls} is not possible.`);
    }
    // union of fields
    const extra = r.fields.filter((f) => !v.fields.includes(f));
    const missing = v.fields.filter((f) => !r.fields.includes(f));
    if (extra.length) {
      const fields = v.fields.concat(extra);
      v = struct(v.dims, fields, v.data.map((rec) => { const o = Object.assign(Object.create(null), rec); for (const f of extra) o[f] = empty(); return o; }));
    }
    if (missing.length || extra.length) {
      r = struct(r.dims, v.fields, r.data.map((rec) => { const o = Object.create(null); for (const f of v.fields) o[f] = f in rec ? rec[f] : empty(); return o; }));
    }
    return [v, r];
  }
  if (isString(v)) return [v, toStringArray(r)];
  if (isTensor(v)) {
    if (isSparse(r)) r = toTensor(r);
    if (isTensor(r)) {
      if (vEmptyDouble && prod(v.dims) === 0) {
        if (r.cls !== v.cls) v = tensor(r.cls, v.dims);
        return [v, r];
      }
      const cls = mergeClass(v.cls, r.cls);
      return [convertTensor(v, cls), convertTensor(r, cls)];
    }
    if (vEmptyDouble) return [emptyLike(r, v.dims), r];
    if (isString(r) && v.cls === 'char') return [toStringArray(v), r];
    throw new MError('core:invalidConversion', `Conversion to ${v.cls} from ${r.cls} is not possible.`);
  }
  throw new MError('core:invalidConversion', `Unable to perform assignment to a value of type ${v.cls}.`);
}

export function emptyLike(r, dims = [0, 0]) {
  if (isCell(r)) return cell(dims);
  if (isStruct(r)) return struct(dims, r.fields);
  if (isString(r)) return stringArray(dims, []);
  if (isTensor(r)) return tensor(r.cls, dims);
  if (isSparse(r)) return tensor('double', dims);
  return tensor('double', dims);
}

const isNullRhs = (r) => isTensor(r) && r.cls === 'double' && r.dims.length === 2 && r.dims[0] === 0 && r.dims[1] === 0;

/**
 * v(args) = r. Returns the new value (v itself when updated in place).
 * `v` may be undefined (new variable).
 */
export function assignParen(v, args, r) {
  if (v !== undefined && isSparse(v)) {
    const out = assignParen(toTensor(v), args, isSparse(r) ? toTensor(r) : r);
    return isTensor(out) && out.dims.length === 2 ? toSparse(out) : out;
  }
  if (isNullRhs(r) && v !== undefined) return deleteElements(v, args);
  // in-place scalar fast path
  if (v !== undefined && OWNED.has(v) && args.length === 1 && v.re !== undefined) {
    const a = args[0];
    if (a.cls === 'double' && a.re.length === 1 && r.re !== undefined && r.re.length === 1 && r.cls === v.cls && !r.im && r.dims.length === 2) {
      const x = a.re[0];
      if (x >= 1 && x === Math.floor(x) && x <= v.re.length) {
        v.re[x - 1] = r.re[0];
        if (v.im) v.im[x - 1] = 0;
        return v;
      }
    }
  }
  if (args.length === 0) throw new MError('core:emptyIndex', 'Assignment with empty () requires an index.');
  let target = v;
  [target, r] = unify(v, r);
  const inPlaceOk = target === v && v !== undefined && OWNED.has(v);
  const dims = target.dims;
  const n = args.length;
  let lin, newDims = dims;
  const rn = prod(r.dims);
  if (n === 1) {
    const total = prod(dims);
    let ix;
    if (args[0] === COLON && v === undefined) return own(r);
    ix = indexList(args[0], total);
    if (ix.max > total) {
      const vec = dims.length === 2 && (dims[0] === 1 || dims[1] === 1);
      if (total === 0 && dims.length === 2 && dims[0] === 0 && dims[1] === 0) newDims = rn !== 1 && r.dims[1] === 1 && r.dims[0] > 1 && ix.dims[1] === 1 ? [ix.max, 1] : [1, ix.max];
      else if (dims.length === 2 && dims[0] === 1) newDims = [1, ix.max];
      else if (dims.length === 2 && dims[1] === 1 && dims[0] !== 0) newDims = [ix.max, 1];
      else if (vec || total === 0) newDims = dims[0] === 0 ? [1, ix.max] : [ix.max, 1];
      else throw new MError('core:index:outOfBoundsGrow', 'Attempt to grow array along ambiguous dimension.');
    }
    lin = ix.list;
  } else {
    const lists = [];
    newDims = [];
    let rk = 0;
    const rNonSingleton = r.dims.filter((d) => d !== 1);
    for (let k = 0; k < n; k++) {
      const cur = k < n - 1 ? (k < dims.length ? dims[k] : 1) : (k >= dims.length ? 1 : prod(dims.slice(k)));
      let ix;
      if (args[k] === COLON && cur === 0 && rn > 0) {
        const want = rn === 1 ? 1 : (rNonSingleton[rk++] ?? 1);
        ix = indexList(COLON, want);
        newDims.push(want);
        lists.push(ix.list);
        continue;
      }
      ix = indexList(args[k], cur);
      if (args[k] !== COLON && ix.list.length !== 1) rk++;
      if (ix.max > cur && k === n - 1 && n < dims.length) throw new MError('core:index:outOfBoundsGrow', 'Attempt to grow array along ambiguous dimension.');
      newDims.push(Math.max(cur, ix.max));
      lists.push(ix.list);
    }
    if (n < dims.length) {
      // last index spans trailing dims (no growth there)
      const keep = dims.slice(0, n - 1).map((d, k) => Math.max(d, newDims[k]));
      newDims = keep.concat(dims.slice(n - 1));
      if (keep.some((d, k) => d !== dims[k])) throw new MError('core:index:outOfBoundsGrow', 'Attempt to grow array along ambiguous dimension.');
    }
    newDims = normDims(newDims);
    const total = prod(lists.map((l) => l.length));
    lin = new Int32Array(total);
    const strides = [];
    let m = 1;
    for (let k = 0; k < n; k++) { strides.push(m); m *= k < newDims.length ? newDims[k] : 1; }
    const sub = new Array(n).fill(0);
    for (let p = 0; p < total; p++) {
      let li = 0;
      for (let k = 0; k < n; k++) li += lists[k][sub[k]] * strides[k];
      lin[p] = li;
      for (let k = 0; k < n; k++) { if (++sub[k] < lists[k].length) break; sub[k] = 0; }
    }
  }
  const cnt = lin.length;
  if (rn !== 1 && rn !== cnt) {
    throw new MError('core:subsassignnumelmismatch', n === 1
      ? 'Unable to perform assignment because the left and right sides have a different number of elements.'
      : `Unable to perform assignment because the size of the left side is ${sizeOfLists(lin, args, newDims)} and the size of the right side is ${r.dims.join('-by-')}.`);
  }
  // grow
  let out = target;
  const grow = prod(newDims) !== prod(dims) || newDims.length !== dims.length || newDims.some((d, k) => d !== dims[k]);
  if (grow) {
    if (inPlaceOk && growInPlace(target, newDims)) out = target;
    else out = resized(target, newDims);
  } else if (!inPlaceOk) out = copyOf(target);
  // write
  writeElements(out, lin, r, rn === 1);
  OWNED.add(out);
  return out;
}

function sizeOfLists(lin, args, dims) { return `${lin.length}-by-1`; }

function writeElements(out, lin, r, scalar) {
  const n = lin.length;
  if (isTensor(out)) {
    if (r.im && !out.im) out.im = new Float64Array(out.re.length);
    const re = out.re, im = out.im;
    if (scalar) {
      const x = r.re[0], y = r.im ? r.im[0] : 0;
      for (let i = 0; i < n; i++) { re[lin[i]] = x; if (im) im[lin[i]] = y; }
    } else {
      for (let i = 0; i < n; i++) { re[lin[i]] = r.re[i]; if (im) im[lin[i]] = r.im ? r.im[i] : 0; }
    }
    if (out.im) { let any = false; for (let i = 0; i < out.im.length; i++) if (out.im[i] !== 0) { any = true; break; } if (!any) out.im = null; }
    return;
  }
  const src = r.data;
  if (scalar) {
    for (let i = 0; i < n; i++) out.data[lin[i]] = i === 0 ? src[0] : (isStruct(out) ? Object.assign(Object.create(null), src[0]) : disown(src[0]));
  } else for (let i = 0; i < n; i++) out.data[lin[i]] = src[i];
}

/** Shallow copy (fresh arrays; elements of containers lose ownership). */
export function copyOf(v) {
  if (isTensor(v)) return tensor(v.cls, v.dims, Float64Array.from(v.re), v.im ? Float64Array.from(v.im) : null);
  if (isCell(v)) { for (const x of v.data) disown(x); return cell(v.dims, v.data.slice()); }
  if (isString(v)) return stringArray(v.dims, v.data.slice());
  if (isStruct(v)) { for (const r of v.data) { OWNED.delete(r); for (const f of v.fields) disown(r[f]); } return struct(v.dims, v.fields, v.data.slice()); }
  return v;
}
export const own = (v) => { OWNED.add(v); return v; };

/** v(args) = [] */
export function deleteElements(v, args) {
  const dims = v.dims;
  const n = args.length;
  if (n === 1) {
    const total = prod(dims);
    const ix = indexList(args[0], total);
    if (ix.max > total) throw outOfRange(0, 1, ix.max, total);
    if (ix.all) return emptyLike(v, [0, 0]);
    const del = new Uint8Array(total);
    for (const i of ix.list) del[i] = 1;
    const keep = [];
    for (let i = 0; i < total; i++) if (!del[i]) keep.push(i);
    if (keep.length === total) return v;
    const isCol = dims.length === 2 && dims[1] === 1 && dims[0] !== 1;
    const nd = isCol ? [keep.length, 1] : [1, keep.length];
    return own(gather(v, Int32Array.from(keep), nd));
  }
  // find the single non-colon dimension
  let which = -1;
  const lists = [];
  for (let k = 0; k < n; k++) {
    const ext = k < n - 1 ? (k < dims.length ? dims[k] : 1) : prod(dims.slice(k));
    const ix = indexList(args[k], ext);
    if (ix.max > ext) throw outOfRange(k, n, ix.max, ext);
    lists.push(ix);
    const full = ix.all || (new Set(ix.list).size === ext && ext > 0);
    if (!full) { if (which >= 0) throw new MError('core:nullAssignment', 'A null assignment can have only one non-colon index.'); which = k; }
  }
  if (which < 0) {
    // everything deleted
    const nd = dims.slice(); nd[n - 1 < nd.length ? n - 1 : nd.length - 1] = 0;
    return emptyLike(v, normDims(nd.length ? nd : [0, 0]));
  }
  const fullDims = n < dims.length ? dims.slice(0, n - 1).concat([prod(dims.slice(n - 1))]) : dims.concat(new Array(Math.max(0, n - dims.length)).fill(1));
  const ext = fullDims[which];
  const del = new Uint8Array(ext);
  for (const i of lists[which].list) del[i] = 1;
  const keepIdx = [];
  for (let i = 0; i < ext; i++) if (!del[i]) keepIdx.push(i);
  const args2 = fullDims.map((d, k) => (k === which ? tensor('double', [1, keepIdx.length], keepIdx.map((x) => x + 1)) : COLON));
  const { lin } = resolveRead(fullDims, args2);
  const nd = fullDims.slice(); nd[which] = keepIdx.length;
  return own(gather(v, lin, normDims(nd)));
}

/** c{args} = r */
export function assignBrace(v, args, r) {
  if (v === undefined || (isTensor(v) && prod(v.dims) === 0 && v.cls === 'double')) v = cell([0, 0]);
  if (isString(v)) {
    const s = toStringArray(r);
    if (s.data.length !== 1) throw new MError('core:subsassignnumelmismatch', 'Unable to perform assignment because the left and right sides have a different number of elements.');
    return assignParen(v, args, s);
  }
  if (!isCell(v)) throw new MError('core:cellAssignNonCell', 'Unable to perform assignment because brace indexing is not supported for variables of this type.');
  // fast in-place path
  if (OWNED.has(v) && args.length === 1 && args[0].cls === 'double' && args[0].re.length === 1) {
    const x = args[0].re[0];
    if (x >= 1 && x === Math.floor(x) && x <= v.data.length) { v.data[x - 1] = r; return v; }
  }
  const wrapped = cell([1, 1], [r]);
  // number of target elements must be one
  const probe = args.map((a) => a);
  const out = assignParen(v, probe, wrapped);
  return out;
}

/** Element value of c{args} for nested assignment (undefined if out of range). */
export function braceForAssign(v, args) {
  if (v === undefined || !isCell(v)) return undefined;
  try {
    const { lin } = resolveRead(v.dims, args);
    if (lin.length !== 1) throw new MError('core:cellAssignMultiple', 'Expected one output from a curly brace or dot indexing expression, but there were ' + lin.length + ' results.');
    return v.data[lin[0]];
  } catch (e) {
    if (e.identifier === 'core:index:outOfBounds') return undefined;
    throw e;
  }
}

/** v(args) for nested assignment (undefined if out of range). */
export function parenForAssign(v, args) {
  if (v === undefined) return undefined;
  try { return indexParen(v, args); } catch (e) { if (e.identifier === 'core:index:outOfBounds') return undefined; throw e; }
}

/** s.name for nested assignment. */
export function fieldForAssign(v, name) {
  if (v === undefined || !isStruct(v)) return undefined;
  if (v.data.length !== 1) return undefined;
  return v.data[0][name];
}

/** s.name = r */
export function assignField(v, name, r) {
  if (v === undefined || (isTensor(v) && prod(v.dims) === 0)) {
    const rec = Object.create(null); rec[name] = r;
    return own(struct([1, 1], [name], [rec]));
  }
  if (!isStruct(v)) throw new MError('core:dotAssignNotSupported', 'Unable to perform assignment because dot indexing is not supported for variables of this type.');
  if (v.data.length !== 1) {
    if (v.data.length === 0) {
      const rec = Object.create(null); for (const f of v.fields) rec[f] = empty(); rec[name] = r;
      return own(struct([1, 1], v.fields.includes(name) ? v.fields : v.fields.concat([name]), [rec]));
    }
    throw new MError('core:scalarStructRequired', 'Scalar structure required for this assignment.');
  }
  const has = v.fields.includes(name);
  if (OWNED.has(v)) {
    const rec = v.data[0];
    if (has && OWNED.has(rec)) { rec[name] = r; return v; }
    const nr = Object.assign(Object.create(null), rec);
    nr[name] = r;
    OWNED.add(nr);
    v.data[0] = nr;
    if (!has) v.fields = v.fields.concat([name]);
    return v;
  }
  const nr = Object.assign(Object.create(null), v.data[0]);
  for (const f of v.fields) disown(nr[f]);
  nr[name] = r;
  OWNED.add(nr);
  return own(struct([1, 1], has ? v.fields : v.fields.concat([name]), [nr]));
}

/** Number of elements an index addresses (for [c{1:3}] = ... outputs). */
export function countIndexed(v, args) {
  if (v === undefined) return 1;
  try { return resolveRead(v.dims, args).lin.length; } catch { return 1; }
}

export { numelOf };
