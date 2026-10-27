// Shared helpers of the numerics area (core/lib/numeric). Pure ESM.
// Value <-> JS conversions, name/value option parsing, function-handle calls.
import {
  MError, tensor, num, str, bool, empty, rowVec, colVec, structOf, struct, cell, cellRow,
  toTensor, toStr, toNum, isText, isStruct, isCell, isFuncHandle, isTensor, isSparse, isString,
  isChar, isObject, fromJS, stringArray, prod,
} from '../../value.js';

export { MError };

/** Throws a numerics error. id is relative: E('ode45:badTspan', ...) → numeric:ode45:badTspan */
export function E(id, msg) {
  return new MError(id.startsWith('numeric:') ? id : 'numeric:' + id, msg);
}

// ------------------------------------------------------------ dense matrix view
/** {m, n, a: Float64Array column-major} of a real numeric/logical value. */
export function M(v, what = 'Argument') {
  if (v == null) throw E('internal', `${what} is missing.`);
  if (typeof v === 'number') return { m: 1, n: 1, a: Float64Array.of(v) };
  let t;
  try { t = toTensor(v); } catch { throw E('notNumeric', `${what} must be numeric.`); }
  const d = t.dims;
  const m = d[0], n = prod(d) / (m || 1) || (d.length === 2 ? d[1] : 0);
  return { m, n: d.length === 2 ? d[1] : n, a: t.re, im: t.im, dims: d };
}
/** Real data as Float64Array (no copy). */
export function F(v, what) {
  if (v == null) return new Float64Array(0);
  if (typeof v === 'number') return Float64Array.of(v);
  if (Array.isArray(v)) return Float64Array.from(v);
  if (v instanceof Float64Array) return v;
  try { return toTensor(v).re; } catch { throw E('notNumeric', `${what || 'Argument'} must be numeric.`); }
}
export const arr = (v) => Array.from(F(v));
/** Value from {m,n,a} */
export const V = (m, n, a) => tensor('double', [m, n], a instanceof Float64Array ? a : Float64Array.from(a));
export const row = (a) => rowVec(a instanceof Float64Array ? a : Float64Array.from(a));
export const col = (a) => colVec(a instanceof Float64Array ? a : Float64Array.from(a));
/** Matrix Value from array of row arrays. */
export function fromRows(rows) {
  const m = rows.length, n = m ? rows[0].length : 0;
  const a = new Float64Array(m * n);
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) a[i + j * m] = rows[i][j];
  return V(m, n, a);
}
/** Rows (array of arrays) of a matrix Value. */
export function toRows(v) {
  const { m, n, a } = M(v);
  const r = [];
  for (let i = 0; i < m; i++) { const x = new Array(n); for (let j = 0; j < n; j++) x[j] = a[i + j * m]; r.push(x); }
  return r;
}
/** Complex Value from arrays of re/im with given dims. */
export function cplx(dims, re, im) {
  const t = tensor('double', dims, Float64Array.from(re), im ? Float64Array.from(im) : null);
  if (t.im && t.im.every((x) => x === 0)) return { ...t, im: null };
  return t;
}
export const isNum = (v) => v != null && isTensor(v) && !isChar(v);
export const isNumOrSparse = (v) => v != null && (isTensor(v) || isSparse(v)) && !isChar(v);
export const isEmptyV = (v) => v == null || (v.dims && prod(v.dims) === 0 && !isObject(v));
export const n1 = (v, def) => (v == null || isEmptyV(v) ? def : toNum(v));
export { num, str, bool, empty, structOf, struct, cell, cellRow, fromJS, toStr, toNum, isText, isStruct, isCell, isFuncHandle, isString, isChar, isObject, stringArray, tensor, prod };

/** Cell array of strings (char rows) */
export const cellStr = (list, dims) => cell(dims || [1, list.length], list.map((s) => str(s)));
export const strArr = (list) => stringArray([1, list.length], list.slice());
export function lstr(v) { return isText(v) ? toStr(v).toLowerCase() : null; }

// ------------------------------------------------------------ options
/**
 * Name/value pairs from args[start..] (case-insensitive, partial match against
 * `known` when given). Returns a plain object { lowerName: Value }.
 * A struct argument (options struct / optimset) merges its fields.
 */
export function nv(args, start = 0, known = null) {
  const o = Object.create(null);
  let i = start;
  while (i < args.length) {
    const a = args[i];
    if (isStruct(a) && a.data.length === 1) { for (const f of a.fields) if (!isEmptyV(a.data[0][f]) || true) o[f.toLowerCase()] = a.data[0][f]; i++; continue; }
    if (isObject(a) && a.props) { for (const k of Object.keys(a.props)) o[k.toLowerCase()] = a.props[k]; i++; continue; }
    if (!isText(a)) throw E('badOption', `Expected an option name at argument ${i + 1}.`);
    let k = toStr(a).toLowerCase();
    if (known) {
      const ks = known.map((x) => x.toLowerCase());
      if (!ks.includes(k)) { const c = ks.filter((x) => x.startsWith(k)); if (c.length === 1) k = c[0]; }
    }
    if (i + 1 >= args.length) throw E('badOption', `Option '${toStr(a)}' needs a value.`);
    o[k] = args[i + 1];
    i += 2;
  }
  return o;
}
/** Field of a struct Value (case-insensitive), or undefined. */
export function sfield(s, name) {
  if (!s) return undefined;
  if (isObject(s) && s.props) {
    const k = Object.keys(s.props).find((x) => x.toLowerCase() === name.toLowerCase());
    return k ? s.props[k] : undefined;
  }
  if (!isStruct(s) || !s.data.length) return undefined;
  const f = s.fields.find((x) => x.toLowerCase() === name.toLowerCase());
  return f ? s.data[0][f] : undefined;
}
/** Option getter on an object from nv() or a struct: numeric with default (empty → default). */
export function onum(o, name, def) {
  const v = o && (isStruct(o) || isObject(o) ? sfield(o, name) : o[name.toLowerCase()]);
  if (v == null || isEmptyV(v)) return def;
  return toNum(v);
}
export function ostr(o, name, def) {
  const v = o && (isStruct(o) || isObject(o) ? sfield(o, name) : o[name.toLowerCase()]);
  if (v == null || isEmptyV(v)) return def;
  if (isText(v)) return toStr(v);
  return def;
}
export function oval(o, name) {
  const v = o && (isStruct(o) || isObject(o) ? sfield(o, name) : o[name.toLowerCase()]);
  if (v == null || (isEmptyV(v) && !isFuncHandle(v))) return undefined;
  return v;
}
export function obool(o, name, def) {
  const v = oval(o, name);
  if (v === undefined) return def;
  if (isText(v)) { const s = toStr(v).toLowerCase(); return s === 'on' || s === 'true' || s === 'yes'; }
  return toNum(v) !== 0;
}
export function oarr(o, name, def) {
  const v = oval(o, name);
  if (v === undefined) return def;
  return Array.from(F(v));
}

// ------------------------------------------------------------ calling functions
/** Calls fh (handle or name) and returns the output Values array. */
export function callFn(ctx, fh, args, nargout = 1) {
  const r = ctx.call(fh, args.map((a) => (typeof a === 'number' ? num(a) : a instanceof Float64Array ? col(a) : a)), nargout);
  return Array.isArray(r) ? r : [r];
}
/** f(x) with scalar x → JS number. */
export function callScalar(ctx, fh, x, extra = []) {
  const r = callFn(ctx, fh, [num(x), ...extra], 1);
  if (!r.length) throw E('noOutput', 'The function did not return a value.');
  return toNum(r[0], 'Function value');
}
/** f(...) → Float64Array of the first output. */
export function callArr(ctx, fh, args, nargout = 1) {
  const r = callFn(ctx, fh, args, nargout);
  if (!r.length) throw E('noOutput', 'The function did not return a value.');
  return Float64Array.from(F(r[0]));
}
/** Makes a function handle value from a JS function (args Values → Value|Value[]). Used by internal wrappers. */
export function jsFn(jsfn, name = '') {
  return { cls: 'function_handle', dims: [1, 1], jsfn, name: name || undefined };
}
/** Resolves a text function name to a handle-like target for ctx.call. */
export function fnArg(v, what = 'Function') {
  if (isFuncHandle(v)) return v;
  if (isText(v)) return toStr(v);
  throw E('notFunction', `${what} must be a function handle.`);
}
/** Calls a builtin of another area if it exists; returns null when undefined. */
export function tryCall(ctx, name, args, nargout = 1) {
  try { return ctx.call(name, args, nargout); }
  catch (e) {
    const id = (e && e.identifier) || '';
    if (/undefined|notFound|UndefinedFunction/i.test(id)) return null;
    throw e;
  }
}

// ------------------------------------------------------------ formatting
/** %g with p significant digits, like sprintf('%.*g'). */
export function fmtG(x, p = 5) {
  if (Number.isNaN(x)) return 'NaN';
  if (!Number.isFinite(x)) return x > 0 ? 'Inf' : '-Inf';
  if (x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  if (e < -5 || e >= p) {
    let s = x.toExponential(p - 1);
    let [mant, ex] = s.split('e');
    if (mant.includes('.')) mant = mant.replace(/0+$/, '').replace(/\.$/, '');
    const sign = ex[0] === '-' ? '-' : '+';
    let d = ex.replace(/^[+-]/, '');
    if (d.length < 2) d = '0' + d;
    return `${mant}e${sign}${d}`;
  }
  let s = x.toFixed(Math.max(0, p - 1 - e));
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
/** format short display of a scalar */
export function fmtShort(x) {
  if (Number.isInteger(x) && Math.abs(x) < 1e9) return String(x);
  if (Math.abs(x) >= 1e5 || (Math.abs(x) < 1e-4 && x !== 0)) return fmtG(x, 5);
  return x.toFixed(4);
}
/** Simple matrix text (used by object displays). */
export function matText(rows, indent = '    ') {
  if (!rows.length) return indent + '[]\n';
  const cells = rows.map((r) => r.map((x) => fmtShort(x)));
  const w = Math.max(...cells.flat().map((s) => s.length));
  return cells.map((r) => indent + r.map((s) => s.padStart(w)).join('   ')).join('\n') + '\n';
}

// ------------------------------------------------------------ misc
export const linspace = (a, b, n) => { const r = new Float64Array(n); for (let i = 0; i < n; i++) r[i] = n === 1 ? b : a + (b - a) * i / (n - 1); return r; };
export const EPS = 2.220446049250313e-16;
/** Struct Value from a JS object whose values are JS numbers/strings/arrays/Values. */
export function S(obj) { const o = {}; for (const k of Object.keys(obj)) o[k] = fromJS(obj[k] instanceof Float64Array ? row(obj[k]) : obj[k]); return structOf(o); }
/** Wraps a help entry. */
export const H = (en, ko, syntax) => ({ en, ko, syntax: Array.isArray(syntax) ? syntax : [syntax] });
/** Size argument parsing: (n) → [n,n], (m,n,..) or ([m n ..]) → dims. Returns {dims, rest}. */
export function sizeArgs(args) {
  const dims = [];
  let i = 0;
  for (; i < args.length; i++) {
    const a = args[i];
    if (isText(a)) break;
    const v = F(a);
    if (args.length && i === 0 && v.length > 1) { dims.push(...v); i++; break; }
    if (v.length !== 1) break;
    dims.push(v[0]);
  }
  const rest = args.slice(i);
  let d = dims.length === 0 ? [1, 1] : dims.length === 1 ? [dims[0], dims[0]] : dims;
  d = d.map((x) => { if (!Number.isFinite(x) || Number.isNaN(x)) throw E('badSize', 'Size inputs must be finite integers.'); return Math.max(0, Math.trunc(x)); });
  return { dims: d, rest };
}
