// Value model shared by the interpreter, the library, graphics and the
// simulation engine. Pure ESM, no platform APIs: it runs in a browser Web
// Worker and in Node alike. See core/CONTRACT.md.
//
// Every value is a plain object with a `cls` string. Arrays are column-major
// with `dims` of length >= 2 (trailing singleton dimensions are trimmed to 2).
// Values are immutable by convention: library code never mutates an argument
// and returns fresh values (or the argument itself when nothing changes).

export const NUMERIC_CLASSES = ['double', 'single', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64'];
export const INT_RANGE = {
  int8: [-128, 127], uint8: [0, 255], int16: [-32768, 32767], uint16: [0, 65535],
  int32: [-2147483648, 2147483647], uint32: [0, 4294967295],
  int64: [-9223372036854775808, 9223372036854775807], uint64: [0, 18446744073709551615],
};
const TENSOR_CLASSES = new Set([...NUMERIC_CLASSES, 'logical', 'char']);

// ---------------------------------------------------------------- errors

/** A run-time error raised by code or by the engine (identifier + message). */
export class MError extends Error {
  constructor(identifier, message, extra = {}) {
    super(message);
    this.identifier = identifier || '';
    this.mstack = extra.stack || [];
    this.cause_ = extra.cause || null;
    this.extra = extra;
  }
}
export const err = (id, msg) => new MError(id, msg);

// ---------------------------------------------------------------- dims

export function normDims(dims) {
  const d = dims.length ? dims.slice() : [0, 0];
  if (d.length === 1) d.push(1);
  while (d.length > 2 && d[d.length - 1] === 1) d.pop();
  return d;
}
export const prod = (dims) => { let n = 1; for (const d of dims) n *= d; return n; };
export const sameDims = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
export const dimsOf = (v) => (v.dims ? v.dims : [1, 1]);
export function numel(v) {
  if (v.dims) return prod(v.dims);
  return 1;
}
export const isEmpty = (v) => numel(v) === 0;
export const isScalar = (v) => numel(v) === 1;
export const isVector = (v) => { const d = dimsOf(v); return d.length === 2 && (d[0] === 1 || d[1] === 1); };
export const isRow = (v) => { const d = dimsOf(v); return d.length === 2 && d[0] === 1; };
export const isColumn = (v) => { const d = dimsOf(v); return d.length === 2 && d[1] === 1; };
export const isMatrix = (v) => dimsOf(v).length === 2;

/** Broadcast (implicit expansion) of two dims; throws on mismatch. */
export function broadcastDims(a, b) {
  const n = Math.max(a.length, b.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = i < a.length ? a[i] : 1;
    const y = i < b.length ? b[i] : 1;
    if (x === y || y === 1) out.push(x);
    else if (x === 1) out.push(y);
    else throw err('core:sizeDimensionsMustMatch', 'Arrays have incompatible sizes for this operation.');
  }
  return normDims(out);
}

/** Linear index of subscripts (0-based) in dims. */
export function sub2ind(dims, subs) {
  let idx = 0, mul = 1;
  for (let i = 0; i < subs.length; i++) { idx += subs[i] * mul; mul *= i < dims.length ? dims[i] : 1; }
  return idx;
}
/** Subscripts (0-based) of a linear index (0-based). */
export function ind2sub(dims, idx) {
  const subs = new Array(dims.length);
  for (let i = 0; i < dims.length; i++) { subs[i] = idx % dims[i]; idx = Math.floor(idx / dims[i]); }
  return subs;
}

// ---------------------------------------------------------------- tensors

/**
 * Numeric, logical and char arrays. `re` is always a Float64Array (int64
 * values beyond 2^53 lose precision); `im` is a Float64Array or null. Integer
 * classes hold rounded, saturated values; logical holds 0/1; char holds UTF-16
 * code units.
 */
export function tensor(cls, dims, re, im = null) {
  const d = normDims(dims);
  const n = prod(d);
  if (!re) re = new Float64Array(n);
  else if (!(re instanceof Float64Array)) re = Float64Array.from(re);
  if (re.length !== n) throw err('core:internal', `tensor data length ${re.length} does not match size ${d.join('x')}`);
  if (im && !(im instanceof Float64Array)) im = Float64Array.from(im);
  return { cls, dims: d, re, im: im || null };
}
export const isTensor = (v) => v != null && TENSOR_CLASSES.has(v.cls) && !v.sparse;
export const isNumeric = (v) => v != null && NUMERIC_CLASSES.includes(v.cls);
export const isFloat = (v) => v != null && (v.cls === 'double' || v.cls === 'single');
export const isInteger = (v) => v != null && v.cls in INT_RANGE;
export const isLogical = (v) => v != null && v.cls === 'logical';
export const isChar = (v) => v != null && v.cls === 'char';
export const isComplex = (v) => v != null && !!v.im;
export const isSparse = (v) => v != null && !!v.sparse;

export const num = (x, cls = 'double') => tensor(cls, [1, 1], [x]);
export const complex = (re, im) => tensor('double', [1, 1], [re], [im]);
export const bool = (b) => tensor('logical', [1, 1], [b ? 1 : 0]);
export const empty = (cls = 'double', dims = [0, 0]) => tensor(cls, dims);
export const zeros = (dims, cls = 'double') => tensor(cls, dims);
export function filled(dims, x, cls = 'double') { const t = tensor(cls, dims); t.re.fill(x); return t; }
export const rowVec = (arr, cls = 'double') => tensor(cls, [1, arr.length], arr);
export const colVec = (arr, cls = 'double') => tensor(cls, [arr.length, 1], arr);
/** Matrix from an array of rows (JS numbers). */
export function matrix(rows, cls = 'double') {
  const m = rows.length, n = m ? rows[0].length : 0;
  const t = tensor(cls, [m, n]);
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) t.re[i + j * m] = rows[i][j];
  return t;
}
/** Char row vector from a JS string. */
export function str(s) {
  const t = tensor('char', [1, s.length]);
  for (let i = 0; i < s.length; i++) t.re[i] = s.charCodeAt(i);
  if (s.length === 0) t.dims = [0, 0];
  return t;
}
/** Char matrix from JS strings, padded with blanks. */
export function charMatrix(lines) {
  const m = lines.length, n = Math.max(0, ...lines.map((l) => l.length));
  const t = tensor('char', [m, n]);
  t.re.fill(32);
  lines.forEach((l, i) => { for (let j = 0; j < l.length; j++) t.re[i + j * m] = l.charCodeAt(j); });
  return t;
}

/** Drops an all-zero imaginary part (the engine's "complex only when needed" rule). */
export function simplifyComplex(t) {
  if (t.im && t.im.every((x) => x === 0)) return { ...t, im: null };
  return t;
}

/** Rounds and saturates x for an integer class (round half away from zero). */
export function saturate(cls, x) {
  const r = INT_RANGE[cls];
  if (!r) return cls === 'single' ? Math.fround(x) : x;
  if (Number.isNaN(x)) return 0;
  const v = x < 0 ? -Math.round(-x) : Math.round(x);
  return v < r[0] ? r[0] : v > r[1] ? r[1] : v;
}
/** Converts a tensor to another numeric/char/logical class. */
export function cast(v, cls) {
  if (v.cls === cls) return v;
  if (!isTensor(v)) throw err('core:invalidConversion', `Conversion to ${cls} from ${v.cls} is not possible.`);
  const re = new Float64Array(v.re.length);
  if (cls === 'logical') {
    if (v.im) throw err('core:logical:complex', 'Complex values cannot be converted to logicals.');
    for (let i = 0; i < re.length; i++) {
      if (Number.isNaN(v.re[i])) throw err('core:logical:NaN', 'NaN values cannot be converted to logicals.');
      re[i] = v.re[i] !== 0 ? 1 : 0;
    }
    return tensor('logical', v.dims, re);
  }
  for (let i = 0; i < re.length; i++) re[i] = saturate(cls, v.re[i]);
  let im = null;
  if (v.im && cls !== 'char') { im = new Float64Array(v.im.length); for (let i = 0; i < im.length; i++) im[i] = saturate(cls, v.im[i]); }
  return tensor(cls, v.dims, re, im);
}

// ---------------------------------------------------------------- sparse

/** Compressed sparse column matrix (double or logical). */
export function sparseMatrix(m, n, colPtr, rowIdx, re, im = null, cls = 'double') {
  return { cls, sparse: true, dims: [m, n], colPtr: Int32Array.from(colPtr), rowIdx: Int32Array.from(rowIdx), re: Float64Array.from(re), im: im ? Float64Array.from(im) : null };
}

// ---------------------------------------------------------------- strings

/** String arrays: data holds JS strings, or null for <missing>. */
export function stringArray(dims, data) {
  return { cls: 'string', dims: normDims(dims), data: data || new Array(prod(dims)).fill('') };
}
export const string = (s) => stringArray([1, 1], [s]);
export const isString = (v) => v != null && v.cls === 'string';

// ---------------------------------------------------------------- cells and structs

export function cell(dims, data) {
  const d = normDims(dims);
  return { cls: 'cell', dims: d, data: data || Array.from({ length: prod(d) }, () => empty()) };
}
export const cellRow = (items) => cell([1, items.length], items);
export const isCell = (v) => v != null && v.cls === 'cell';

/** Struct arrays: `fields` keeps field order; each element is a null-prototype record. */
export function struct(dims, fields = [], data) {
  const d = normDims(dims);
  const n = prod(d);
  const elems = data || Array.from({ length: n }, () => { const r = Object.create(null); for (const f of fields) r[f] = empty(); return r; });
  return { cls: 'struct', dims: d, fields: fields.slice(), data: elems };
}
/** Scalar struct from a JS object of Values (insertion order = field order). */
export function structOf(obj) {
  const r = Object.create(null);
  for (const k of Object.keys(obj)) r[k] = obj[k];
  return struct([1, 1], Object.keys(obj), [r]);
}
export const isStruct = (v) => v != null && v.cls === 'struct';

// ---------------------------------------------------------------- function handles and objects

/**
 * Function handles. The interpreter fills the private parts; library code
 * only calls them through ctx.call(fh, args, nargout).
 *   { cls:'function_handle', name:'sin' }                       named
 *   { cls:'function_handle', params:[...], body, closure, text } anonymous
 */
export const funcHandle = (name, extra = {}) => ({ cls: 'function_handle', dims: [1, 1], name, ...extra });
export const isFuncHandle = (v) => v != null && v.cls === 'function_handle';

/**
 * Objects: user classdef instances and engine classes written in JS (table,
 * datetime, containers.Map, ...). `cls` is the class name; `isObject` is true.
 * Handle objects share `props` by reference; value objects copy on write.
 */
export function object(cls, props = {}, opts = {}) {
  return { cls, isObject: true, dims: opts.dims || [1, 1], handle: !!opts.handle, props, ...opts.extra };
}
export const isObject = (v) => v != null && !!v.isObject;

// ---------------------------------------------------------------- conversions to JS

/** The JS string of a char row, a char array (column-major order) or a string scalar. */
export function toStr(v, what = 'Argument') {
  if (isString(v)) {
    if (v.data.length !== 1) throw err('core:notScalarString', `${what} must be a string scalar or character vector.`);
    return v.data[0] == null ? '' : v.data[0];
  }
  if (isChar(v)) {
    if (v.dims[0] > 1 && v.dims.length === 2) {
      // char matrix: read rows
      const [m, n] = v.dims; let s = '';
      for (let i = 0; i < m; i++) { for (let j = 0; j < n; j++) s += String.fromCharCode(v.re[i + j * m]); if (i < m - 1) s += '\n'; }
      return s;
    }
    let s = '';
    for (let i = 0; i < v.re.length; i++) s += String.fromCharCode(v.re[i]);
    return s;
  }
  throw err('core:notText', `${what} must be a character vector or string.`);
}
export const isText = (v) => isChar(v) || (isString(v) && v.data.length === 1);

/** A real scalar as a JS number (logical, char and numeric accepted). */
export function toNum(v, what = 'Argument') {
  if (isTensor(v) && v.re.length >= 1) {
    if (v.re.length !== 1) throw err('core:notScalar', `${what} must be a scalar.`);
    return v.re[0];
  }
  if (isSparse(v) && v.dims[0] * v.dims[1] === 1) return v.re.length ? v.re[0] : 0;
  throw err('core:notNumeric', `${what} must be a numeric scalar.`);
}
export function toBool(v) {
  if (isTensor(v)) { if (v.re.length === 0) return false; for (let i = 0; i < v.re.length; i++) if (v.re[i] === 0 || Number.isNaN(v.re[i])) return false; return true; }
  throw err('core:notLogical', 'Value cannot be converted to logical.');
}
/** The elements of a real tensor as a JS number array. */
export const toArray = (v) => Array.from(toTensor(v).re);
/** A non-negative integer (sizes, counts). */
export function toInt(v, what = 'Argument') {
  const x = toNum(v, what);
  if (!Number.isInteger(x)) throw err('core:notInteger', `${what} must be an integer.`);
  return x;
}
/** Dense tensor view of a sparse or dense value. */
export function toTensor(v) {
  if (isTensor(v)) return v;
  if (isSparse(v)) {
    const [m, n] = v.dims; const t = tensor(v.cls, [m, n], null, v.im ? new Float64Array(m * n) : null);
    for (let j = 0; j < n; j++) for (let k = v.colPtr[j]; k < v.colPtr[j + 1]; k++) { t.re[v.rowIdx[k] + j * m] = v.re[k]; if (v.im) t.im[v.rowIdx[k] + j * m] = v.im[k]; }
    return t;
  }
  throw err('core:notNumeric', `Expected a numeric array, got ${v.cls}.`);
}
/** Cell array of text, string array or text → JS string array. */
export function toStrList(v) {
  if (isString(v)) return v.data.map((s) => (s == null ? '' : s));
  if (isCell(v)) return v.data.map((x) => toStr(x));
  if (isChar(v)) {
    if (v.dims[0] <= 1) return [toStr(v)];
    return toStr(v).split('\n');
  }
  throw err('core:notText', 'Expected text, a cell array of text or a string array.');
}

/** JS → Value for plain data (numbers, booleans, strings, arrays, objects). */
export function fromJS(x) {
  if (x == null) return empty();
  if (typeof x === 'number') return num(x);
  if (typeof x === 'boolean') return bool(x);
  if (typeof x === 'string') return str(x);
  if (x.cls) return x;
  if (Array.isArray(x)) {
    if (x.every((e) => typeof e === 'number')) return rowVec(x);
    if (x.every((e) => typeof e === 'boolean')) return tensor('logical', [1, x.length], x.map(Number));
    return cellRow(x.map(fromJS));
  }
  if (typeof x === 'object') { const o = {}; for (const k of Object.keys(x)) o[k] = fromJS(x[k]); return structOf(o); }
  throw err('core:internal', `Cannot convert ${typeof x}`);
}

/** Class name as returned by class(). */
export const className = (v) => v.cls;

/** Short size text "3x4" / "1x1". */
export const sizeText = (v) => dimsOf(v).join('×');
