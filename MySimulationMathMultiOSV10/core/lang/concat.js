// Concatenation [a, b; c, d] and {a, b} for non-object values.
import {
  MError, tensor, isTensor, isCell, isStruct, isString, isSparse, toTensor, prod, cell, struct,
  stringArray, INT_RANGE, saturate, isObject, empty,
} from '../value.js';
import { toSparse } from './indexing.js';

const isInt = (c) => c in INT_RANGE;

function concatClass(vals) {
  let cls = null, anyChar = false, anyInt = null, anySingle = false, allLogical = true;
  for (const v of vals) {
    if (v.cls === 'char') anyChar = true;
    if (isInt(v.cls)) { if (!anyInt) anyInt = v.cls; }
    if (v.cls === 'single') anySingle = true;
    if (v.cls !== 'logical') allLogical = false;
  }
  if (anyInt) cls = anyInt;
  else if (anyChar) cls = 'char';
  else if (anySingle) cls = 'single';
  else if (allLogical && vals.length) cls = 'logical';
  else cls = 'double';
  return cls;
}

/** Concatenates along dimension dim (0 = vertical, 1 = horizontal, k = any). */
export function catValues(dim, vals) {
  if (vals.length === 0) return tensor('double', [0, 0]);
  if (vals.length === 1 && !isCellWrapNeeded(vals)) return vals[0];
  if (vals.some((v) => isCell(v))) vals = vals.map((v) => (isCell(v) ? v : cell([1, 1], [v])));
  else if (vals.some((v) => isString(v))) vals = vals.map(toStringValue);
  if (vals.some((v) => isObject(v) || v.cls === 'function_handle')) {
    const bad = vals.find((v) => v.cls === 'function_handle');
    if (bad) throw new MError('core:concat:fh', 'Nonscalar arrays of function handles are not allowed; use cell arrays instead.');
    throw new MError('core:concat:object', `Concatenation of ${vals.find(isObject).cls} objects is not supported.`);
  }
  const anySparse = vals.some(isSparse);
  if (anySparse) vals = vals.map((v) => (isSparse(v) ? toTensor(v) : v));
  // drop [] (0x0) operands; keep other empties only if they fit
  let items = vals.filter((v) => !(v.dims.length === 2 && v.dims[0] === 0 && v.dims[1] === 0));
  const ks = items[0] || vals[0];
  const kind = isCell(ks) ? 'cell' : isStruct(ks) ? 'struct' : isString(ks) ? 'string' : 'tensor';
  for (const v of items) {
    const k = isCell(v) ? 'cell' : isStruct(v) ? 'struct' : isString(v) ? 'string' : isTensor(v) ? 'tensor' : v.cls;
    if (k !== kind) {
      if (kind === 'struct' || k === 'struct') {
        if (prod(v.dims) === 0 && isTensor(v)) continue;
        throw new MError('core:concat:struct', 'Concatenation of a struct with a non-struct value is not allowed.');
      }
      throw new MError('core:concat:types', `Unable to concatenate values of type ${ks.cls} and ${v.cls}.`);
    }
  }
  if (items.length === 0) {
    // all empty: result keeps the "largest" empty shape
    const first = vals.find((v) => !(v.dims[0] === 0 && v.dims[1] === 0)) || vals[0];
    let dims = first.dims.slice();
    if (vals.length > 1 && first !== vals[0]) {
      dims = first.dims.slice();
      let s = 0; for (const v of vals) if (!(v.dims[0] === 0 && v.dims[1] === 0)) s += v.dims[dim] || 0; dims[dim] = s;
    }
    if (kind === 'tensor') return tensor(concatClass(vals), dims);
    if (kind === 'cell') return cell(dims);
    if (kind === 'string') return stringArray(dims, []);
    return struct(dims, vals[0].fields || []);
  }
  // drop empties that do not match the other dims
  const ref = items.find((v) => prod(v.dims) > 0) || items[0];
  items = items.filter((v) => prod(v.dims) > 0 || compatible(v.dims, ref.dims, dim));
  if (items.length === 1) {
    const only = items[0];
    if (kind === 'tensor') {
      const cls = concatClass(vals);
      const out = only.cls === cls ? only : convert(only, cls);
      return anySparse ? toSparse(out) : out;
    }
    if (kind === 'struct') return alignStructs([only])[0];
    return only;
  }
  const nd = Math.max(dim + 1, ...items.map((v) => v.dims.length));
  const dimsOf = (v) => { const d = v.dims.slice(); while (d.length < nd) d.push(1); return d; };
  const base = dimsOf(items[0]);
  let total = 0;
  for (const v of items) {
    const d = dimsOf(v);
    for (let k = 0; k < nd; k++) {
      if (k !== dim && d[k] !== base[k]) {
        throw new MError('core:catenate:dimensionMismatch', dim === 1
          ? 'Dimensions of arrays being concatenated are not consistent.'
          : 'Dimensions of arrays being concatenated are not consistent.');
      }
    }
    total += d[dim];
  }
  const outDims = base.slice(); outDims[dim] = total;
  // blocks: elements are laid out as [inner (dims < dim)] x [dim] x [outer]
  let inner = 1; for (let k = 0; k < dim; k++) inner *= base[k];
  let outer = 1; for (let k = dim + 1; k < nd; k++) outer *= base[k];
  const n = prod(outDims);
  const copyBlocks = (write) => {
    let off = 0;
    for (let o = 0; o < outer; o++) {
      for (const v of items) {
        const dv = dimsOf(v)[dim];
        const blk = inner * dv;
        write(v, o * blk, off, blk);
        off += blk;
      }
    }
  };
  if (kind === 'tensor') {
    const cls = concatClass(vals);
    const re = new Float64Array(n);
    const cx = items.some((v) => v.im);
    const im = cx ? new Float64Array(n) : null;
    const conv = isInt(cls) || cls === 'single';
    copyBlocks((v, src, dst, len) => {
      const r = v.re;
      if (conv && v.cls !== cls) for (let i = 0; i < len; i++) re[dst + i] = saturate(cls, r[src + i]);
      else re.set(r.subarray(src, src + len), dst);
      if (cx && v.im) im.set(v.im.subarray(src, src + len), dst);
    });
    const out = tensor(cls, outDims, re, im);
    return anySparse ? toSparse(out) : out;
  }
  if (kind === 'struct') items = alignStructs(items);
  const data = new Array(n);
  copyBlocks((v, src, dst, len) => { for (let i = 0; i < len; i++) data[dst + i] = v.data[src + i]; });
  if (kind === 'cell') return cell(outDims, data);
  if (kind === 'string') return stringArray(outDims, data);
  return struct(outDims, items[0].fields, data);
}

function compatible(d, ref, dim) {
  for (let k = 0; k < Math.max(d.length, ref.length); k++) if (k !== dim && (d[k] ?? 1) !== (ref[k] ?? 1)) return false;
  return true;
}

function isCellWrapNeeded() { return false; }

function convert(v, cls) {
  const re = new Float64Array(v.re.length);
  for (let i = 0; i < re.length; i++) re[i] = saturate(cls, v.re[i]);
  return tensor(cls, v.dims, re, v.im && cls !== 'char' ? Float64Array.from(v.im) : null);
}

function alignStructs(items) {
  const fields = items[0].fields;
  for (const s of items) {
    if (s.fields.length !== fields.length || s.fields.some((f) => !fields.includes(f))) {
      throw new MError('core:concat:fieldNames', 'Names of fields in structure arrays being concatenated do not match.');
    }
  }
  return items;
}

function toStringValue(v) {
  if (isString(v)) return v;
  if (v.cls === 'char') {
    if (v.dims[0] <= 1) return stringArray([1, 1], [String.fromCharCode(...v.re)]);
    const [m, n] = v.dims; const rows = [];
    for (let i = 0; i < m; i++) { let s = ''; for (let j = 0; j < n; j++) s += String.fromCharCode(v.re[i + j * m]); rows.push(s); }
    return stringArray([m, 1], rows);
  }
  if (isTensor(v)) return stringArray(v.dims, Array.from(v.re, (x) => (v.cls === 'logical' ? (x ? 'true' : 'false') : String(Number.isInteger(x) ? x : Number(x.toPrecision(5))))));
  if (isCell(v)) return stringArray(v.dims, v.data.map((x) => toStringValue(x).data[0]));
  throw new MError('core:concat:types', `Unable to concatenate ${v.cls} with strings.`);
}

/** Concatenates a matrix literal given rows of values. */
export function buildMatrix(rows) {
  if (rows.length === 1) return catValues(1, rows[0]);
  return catValues(0, rows.map((r) => catValues(1, r)));
}

/** Cell literal {a, b; c, d}: elements that are cells are concatenated as cells. */
export function buildCell(rows) {
  const wrapped = rows.map((r) => r.map((v) => cell([1, 1], [v])));
  if (wrapped.length === 0) return cell([0, 0]);
  const rowVals = wrapped.map((r) => (r.length ? catValues(1, r) : cell([0, 0])));
  if (rowVals.length === 1) return rowVals[0];
  return catValues(0, rowVals);
}

export { empty };
