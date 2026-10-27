// Operators called by the interpreter by name: arithmetic, relational,
// logical, transpose, colon, concatenation and the dense matrix product.
// Rules: implicit expansion, integer saturation / rounding, single
// precision, complex results, char/logical promotion, mixed-class errors.
import {
  INT_RANGE, tensor, normDims, prod, sameDims, isTensor, isSparse, isString, isCell, isStruct, isChar,
  isObject, isFuncHandle, toTensor, stringArray, cell, struct, num,
} from '../../value.js';
import { E, finalize, bcastMaps, objMethod, classDef, first, transposeAny, splitDims } from './util.js';
import * as cm from './cmath.js';
import { num2strScalar, num2strComplex } from './fmt.js';

export const OPSYM = {
  plus: '+', minus: '-', times: '.*', rdivide: './', ldivide: '.\\', power: '.^', mtimes: '*',
  eq: '==', ne: '~=', lt: '<', gt: '>', le: '<=', ge: '>=', and: '&', or: '|', xor: 'xor', not: '~',
  uminus: '-', uplus: '+', transpose: ".'", ctranspose: "'", colon: ':', horzcat: '[,]', vertcat: '[;]',
};

const isIntC = (c) => c in INT_RANGE;

function typeLabel(v) {
  if (v == null) return 'double';
  if (isSparse(v)) return 'sparse';
  return v.cls;
}
function unsupported(name, a, b) {
  const t = [a, b].filter((x) => x != null && !isTensor(x) && !isSparse(x)).map(typeLabel);
  const ty = t.length ? t[0] : typeLabel(a);
  return E(`base:${name}:unsupportedType`, `Operator '${OPSYM[name] || name}' is not supported for operands of type '${ty}'.`);
}

/** Calls an operator method of an object operand; undefined when none. */
export function objectOp(name, args, nargout, ctx) {
  for (const a of args) {
    if (a && a.isObject) {
      const m = objMethod(ctx, a, name);
      if (m) return first(m(args, nargout, ctx));
    }
  }
  return undefined;
}

// ------------------------------------------------------------- string conversion for operators

/** Converts an operand to a JS string list with dims (for string operators). */
function strOperand(v, name) {
  if (isString(v)) return { list: v.data, dims: v.dims };
  if (isChar(v)) {
    if (v.dims[0] <= 1 && v.dims.length === 2) { let s = ''; for (let i = 0; i < v.re.length; i++) s += String.fromCharCode(v.re[i]); return { list: [s], dims: [1, 1] }; }
    const [m, n] = v.dims; const list = [];
    for (let i = 0; i < m; i++) { let s = ''; for (let j = 0; j < n; j++) s += String.fromCharCode(v.re[i + j * m]); list.push(s); }
    return { list, dims: [m, 1] };
  }
  if (isCell(v)) {
    return { list: v.data.map((x) => { if (isChar(x)) { let s = ''; for (let i = 0; i < x.re.length; i++) s += String.fromCharCode(x.re[i]); return s; } if (isString(x) && x.data.length === 1) return x.data[0]; throw unsupported(name, v); }), dims: v.dims };
  }
  if (isTensor(v) || isSparse(v)) {
    const t = toTensor(v);
    const list = [];
    for (let i = 0; i < t.re.length; i++) {
      if (t.cls === 'logical') list.push(t.re[i] ? 'true' : 'false');
      else if (t.im && t.im[i] !== 0) list.push(num2strComplex(t.re[i], t.im[i]));
      else list.push(num2strScalar(t.re[i], t.cls === 'single'));
    }
    return { list, dims: t.dims };
  }
  throw unsupported(name, v);
}

function stringBinary(name, a, b) {
  const A = strOperand(a, name), B = strOperand(b, name);
  const m = bcastMaps(A.dims, B.dims, name);
  const out = new Array(m.n);
  if (name === 'plus') {
    for (let k = 0; k < m.n; k++) { const x = A.list[m.ia[k]], y = B.list[m.ib[k]]; out[k] = x == null || y == null ? null : x + y; }
    return stringArray(m.dims, out);
  }
  const re = new Float64Array(m.n);
  for (let k = 0; k < m.n; k++) {
    const x = A.list[m.ia[k]], y = B.list[m.ib[k]];
    if (x == null || y == null) { re[k] = name === 'ne' ? 1 : 0; continue; }
    let r;
    switch (name) {
      case 'eq': r = x === y; break;
      case 'ne': r = x !== y; break;
      case 'lt': r = x < y; break;
      case 'gt': r = x > y; break;
      case 'le': r = x <= y; break;
      case 'ge': r = x >= y; break;
      default: throw unsupported(name, a, b);
    }
    re[k] = r ? 1 : 0;
  }
  return { cls: 'logical', dims: m.dims, re, im: null };
}

// ------------------------------------------------------------- class rules

/** Result class of an arithmetic operation; throws the mixed-class errors. */
export function arithClass(a, b, name) {
  const ia = isIntC(a.cls), ib = isIntC(b.cls);
  if (ia || ib) {
    if (ia && ib && a.cls !== b.cls) throw E(`base:${name}:mixedIntegers`, 'Integers can only be combined with integers of the same class, or scalar doubles.');
    const c = ia ? a.cls : b.cls;
    const o = ia ? b : a;
    if ((o.im || (ia ? a.im : b.im)) && name !== 'plus' && name !== 'minus') throw E(`base:${name}:complexInteger`, 'Complex integer arithmetic is not supported.');
    return c;
  }
  if (a.cls === 'single' || b.cls === 'single') return 'single';
  return 'double';
}

function numericOperand(v, name, other) {
  if (isTensor(v)) return v;
  if (isSparse(v)) return toTensor(v);
  throw unsupported(name, v, other);
}

// ------------------------------------------------------------- elementwise engines

/** Real elementwise map with implicit expansion. */
export function mapReal(a, b, f, name) {
  const ar = a.re, br = b.re;
  const na = ar.length, nb = br.length;
  let dims, re;
  if (sameDims(a.dims, b.dims)) {
    dims = a.dims; re = new Float64Array(na);
    for (let i = 0; i < na; i++) re[i] = f(ar[i], br[i]);
  } else if (nb === 1) {
    dims = a.dims; re = new Float64Array(na); const y = br[0];
    for (let i = 0; i < na; i++) re[i] = f(ar[i], y);
  } else if (na === 1) {
    dims = b.dims; re = new Float64Array(nb); const x = ar[0];
    for (let i = 0; i < nb; i++) re[i] = f(x, br[i]);
  } else {
    const m = bcastMaps(a.dims, b.dims, name);
    dims = m.dims; re = new Float64Array(m.n);
    for (let k = 0; k < m.n; k++) re[k] = f(ar[m.ia[k]], br[m.ib[k]]);
  }
  return { dims, re };
}

/** Index pairs for complex maps. */
function pairMaps(a, b, name) {
  const na = a.re.length, nb = b.re.length;
  if (sameDims(a.dims, b.dims) || nb === 1 || na === 1) {
    const dims = sameDims(a.dims, b.dims) ? a.dims : nb === 1 ? a.dims : b.dims;
    const n = prod(dims);
    return { dims, n, ia: na === 1 ? (k) => 0 : (k) => k, ib: nb === 1 ? (k) => 0 : (k) => k };
  }
  const m = bcastMaps(a.dims, b.dims, name);
  return { dims: m.dims, n: m.n, ia: (k) => m.ia[k], ib: (k) => m.ib[k] };
}

/** Complex elementwise map: f(ar, ai, br, bi) writes cm.C. */
export function mapComplex(a, b, f, name) {
  const m = pairMaps(a, b, name);
  const re = new Float64Array(m.n), im = new Float64Array(m.n);
  const ar = a.re, ai = a.im, br = b.re, bi = b.im;
  for (let k = 0; k < m.n; k++) {
    const i = m.ia(k), j = m.ib(k);
    f(ar[i], ai ? ai[i] : 0, br[j], bi ? bi[j] : 0);
    re[k] = cm.C.re; im[k] = cm.C.im;
  }
  return { dims: m.dims, re, im };
}

const fPlus = (x, y) => x + y, fMinus = (x, y) => x - y, fTimes = (x, y) => x * y, fRdiv = (x, y) => x / y, fLdiv = (x, y) => y / x;
const cPlus = (a, b, c, d) => { cm.C.re = a + c; cm.C.im = b + d; };
const cMinus = (a, b, c, d) => { cm.C.re = a - c; cm.C.im = b - d; };
const cTimes = (a, b, c, d) => {
  if (b === 0 && d === 0) { cm.C.re = a * c; cm.C.im = 0; return; }
  if (b === 0) { cm.C.re = a * c; cm.C.im = a * d; return; }
  if (d === 0) { cm.C.re = a * c; cm.C.im = b * c; return; }
  cm.cmul(a, b, c, d);
};
const cRdiv = (a, b, c, d) => cm.cdiv(a, b, c, d);
const cLdiv = (a, b, c, d) => cm.cdiv(c, d, a, b);

/** Integer division / rounding semantics: compute in double, then saturate. */
function arith(name, a, b, ctx, fr, fc) {
  if (a == null || b == null) throw E(`base:${name}:notEnoughInputs`, 'Not enough input arguments.');
  if (a.isObject || b.isObject) {
    const r = objectOp(name, [a, b], 1, ctx);
    if (r !== undefined) return r;
    throw unsupported(name, a.isObject ? a : b);
  }
  if (isString(a) || isString(b)) {
    if (name === 'plus') return stringBinary(name, a, b);
    throw E(`base:${name}:unsupportedType`, `Operator '${OPSYM[name]}' is not supported for operands of type 'string'.`);
  }
  const A = numericOperand(a, name, b), B = numericOperand(b, name, a);
  const cls = arithClass(A, B, name);
  if (A.im || B.im) {
    const r = mapComplex(A, B, fc, name);
    return finalize(cls, r.dims, r.re, r.im);
  }
  if (isIntC(cls) && (name === 'rdivide' || name === 'ldivide')) {
    // integer division: x/0 → intmax/intmin/0
    const r = mapReal(A, B, fr, name);
    return finalize(cls, r.dims, r.re);
  }
  const r = mapReal(A, B, fr, name);
  return finalize(cls, r.dims, r.re);
}

export function plus(a, b, ctx) { return arith('plus', a, b, ctx, fPlus, cPlus); }
export function minus(a, b, ctx) { return arith('minus', a, b, ctx, fMinus, cMinus); }
export function times(a, b, ctx) { return arith('times', a, b, ctx, fTimes, cTimes); }
export function rdivide(a, b, ctx) { return arith('rdivide', a, b, ctx, fRdiv, cRdiv); }
export function ldivide(a, b, ctx) { return arith('ldivide', a, b, ctx, fLdiv, cLdiv); }

const cPow = (a, b, c, d) => cm.cpow(a, b, c, d);

export function power(a, b, ctx) {
  if (a.isObject || b.isObject) {
    const r = objectOp('power', [a, b], 1, ctx);
    if (r !== undefined) return r;
    throw unsupported('power', a.isObject ? a : b);
  }
  if (isString(a) || isString(b)) throw unsupported('power', isString(a) ? a : b);
  const A = numericOperand(a, 'power', b), B = numericOperand(b, 'power', a);
  const cls = arithClass(A, B, 'power');
  let needC = !!(A.im || B.im);
  if (!needC && !isIntC(cls)) {
    const ar = A.re, br = B.re;
    // negative base with non-integer exponent gives a complex result
    let anyNeg = false;
    for (let i = 0; i < ar.length; i++) if (ar[i] < 0) { anyNeg = true; break; }
    if (anyNeg) {
      let anyFrac = false;
      for (let i = 0; i < br.length; i++) if (!Number.isInteger(br[i]) && Number.isFinite(br[i])) { anyFrac = true; break; }
      needC = anyFrac;
    }
  }
  if (needC) {
    const r = mapComplex(A, B, cPow, 'power');
    return finalize(cls, r.dims, r.re, r.im);
  }
  if (isIntC(cls)) {
    const r = mapReal(A, B, (x, y) => {
      const p = Math.pow(x, y);
      if (x < 0 && !Number.isInteger(y)) throw E('base:power:integerNegativeFractional', 'Integers can only be raised to positive integral powers.');
      return p;
    }, 'power');
    return finalize(cls, r.dims, r.re);
  }
  const r = mapReal(A, B, Math.pow, 'power');
  return finalize(cls, r.dims, r.re);
}

// ------------------------------------------------------------- unary

export function uminus(a, ctx) {
  if (a.isObject) { const r = objectOp('uminus', [a], 1, ctx); if (r !== undefined) return r; throw unsupported('uminus', a); }
  if (!isTensor(a) && !isSparse(a)) throw unsupported('uminus', a);
  const t = toTensor(a);
  const cls = t.cls === 'logical' || t.cls === 'char' ? 'double' : t.cls;
  const re = new Float64Array(t.re.length);
  for (let i = 0; i < re.length; i++) re[i] = -t.re[i];
  let im = null;
  if (t.im) { im = new Float64Array(t.im.length); for (let i = 0; i < im.length; i++) im[i] = -t.im[i]; }
  return finalize(cls, t.dims, re, im);
}
export function uplus(a, ctx) {
  if (a.isObject) { const r = objectOp('uplus', [a], 1, ctx); if (r !== undefined) return r; return a; }
  if (isTensor(a) && (a.cls === 'logical' || a.cls === 'char')) return { cls: 'double', dims: a.dims, re: Float64Array.from(a.re), im: null };
  if (isTensor(a) || isSparse(a) || isString(a)) return a;
  throw unsupported('uplus', a);
}

function truthArray(v, name) {
  if (v.isObject) throw unsupported(name, v);
  if (!isTensor(v) && !isSparse(v)) throw unsupported(name, v);
  const t = toTensor(v);
  const re = new Float64Array(t.re.length);
  for (let i = 0; i < re.length; i++) {
    const x = t.re[i];
    if (x !== x || (t.im && t.im[i] !== t.im[i])) throw E(`base:${name}:NaN`, "NaN's cannot be converted to logicals.");
    re[i] = x !== 0 || (t.im && t.im[i] !== 0) ? 1 : 0;
  }
  return { cls: 'logical', dims: t.dims, re, im: null };
}

export function not(a, ctx) {
  if (a.isObject) { const r = objectOp('not', [a], 1, ctx); if (r !== undefined) return r; }
  const t = truthArray(a, 'not');
  for (let i = 0; i < t.re.length; i++) t.re[i] = t.re[i] ? 0 : 1;
  return t;
}

function logicalBinary(name, a, b, ctx, f) {
  if (a.isObject || b.isObject) { const r = objectOp(name, [a, b], 1, ctx); if (r !== undefined) return r; }
  const A = truthArray(a, name), B = truthArray(b, name);
  const r = mapReal(A, B, f, name);
  return { cls: 'logical', dims: normDims(r.dims), re: r.re, im: null };
}
export const and = (a, b, ctx) => logicalBinary('and', a, b, ctx, (x, y) => (x && y ? 1 : 0));
export const or = (a, b, ctx) => logicalBinary('or', a, b, ctx, (x, y) => (x || y ? 1 : 0));
export const xor = (a, b, ctx) => logicalBinary('xor', a, b, ctx, (x, y) => ((x ? 1 : 0) !== (y ? 1 : 0) ? 1 : 0));

// ------------------------------------------------------------- relational

const relReal = {
  eq: (x, y) => (x === y ? 1 : 0), ne: (x, y) => (x !== y ? 1 : 0), lt: (x, y) => (x < y ? 1 : 0),
  gt: (x, y) => (x > y ? 1 : 0), le: (x, y) => (x <= y ? 1 : 0), ge: (x, y) => (x >= y ? 1 : 0),
};

export function relational(name, a, b, ctx) {
  if (a.isObject || b.isObject) {
    const r = objectOp(name, [a, b], 1, ctx);
    if (r !== undefined) return r;
    throw unsupported(name, a.isObject ? a : b);
  }
  if (isString(a) || isString(b)) return stringBinary(name, a, b);
  if (isCell(a) || isCell(b) || isStruct(a) || isStruct(b) || isFuncHandle(a) || isFuncHandle(b)) throw unsupported(name, a, b);
  const A = numericOperand(a, name, b), B = numericOperand(b, name, a);
  if ((A.im || B.im) && (name === 'eq' || name === 'ne')) {
    const m = pairMaps(A, B, name);
    const re = new Float64Array(m.n);
    for (let k = 0; k < m.n; k++) {
      const i = m.ia(k), j = m.ib(k);
      const e = A.re[i] === B.re[j] && (A.im ? A.im[i] : 0) === (B.im ? B.im[j] : 0);
      re[k] = (name === 'eq') === e ? 1 : 0;
    }
    return { cls: 'logical', dims: normDims(m.dims), re, im: null };
  }
  const r = mapReal(A, B, relReal[name], name);
  return { cls: 'logical', dims: normDims(r.dims), re: r.re, im: null };
}
export const eq = (a, b, ctx) => relational('eq', a, b, ctx);
export const ne = (a, b, ctx) => relational('ne', a, b, ctx);
export const lt = (a, b, ctx) => relational('lt', a, b, ctx);
export const gt = (a, b, ctx) => relational('gt', a, b, ctx);
export const le = (a, b, ctx) => relational('le', a, b, ctx);
export const ge = (a, b, ctx) => relational('ge', a, b, ctx);

// ------------------------------------------------------------- transpose

export function transpose(a, ctx) {
  if (a.isObject) { const r = objectOp('transpose', [a], 1, ctx); if (r !== undefined) return r; }
  return transposeAny(a);
}
export function ctranspose(a, ctx) {
  if (a.isObject) { const r = objectOp('ctranspose', [a], 1, ctx); if (r !== undefined) return r; }
  const t = transposeAny(a);
  if (t.im) { const im = new Float64Array(t.im.length); for (let i = 0; i < im.length; i++) im[i] = -t.im[i]; return { ...t, im }; }
  return t;
}

// ------------------------------------------------------------- matrix product

export function mtimes(a, b, ctx) {
  if (a.isObject || b.isObject) {
    const r = objectOp('mtimes', [a, b], 1, ctx);
    if (r !== undefined) return r;
    throw unsupported('mtimes', a.isObject ? a : b);
  }
  if (isString(a) || isString(b)) throw unsupported('mtimes', isString(a) ? a : b);
  const A = numericOperand(a, 'mtimes', b), B = numericOperand(b, 'mtimes', a);
  if (A.re.length === 1 || B.re.length === 1) return times(A, B, ctx);
  if (A.dims.length > 2 || B.dims.length > 2) throw E('base:mtimes:NDArray', 'Arguments must be 2-D, or at least one argument must be scalar. Use TIMES (.*) for elementwise multiplication.');
  const [m, k] = A.dims, [k2, n] = B.dims;
  if (k !== k2) throw E('base:mtimes:innerdim', 'Incorrect dimensions for matrix multiplication. Check that the number of columns in the first matrix matches the number of rows in the second matrix. To operate on each element of the matrix individually, use TIMES (.*) for elementwise multiplication.');
  if (isIntC(A.cls) || isIntC(B.cls)) {
    if (isIntC(A.cls) && isIntC(B.cls) && A.cls !== B.cls) throw E('base:mtimes:mixedIntegers', 'Integers can only be combined with integers of the same class, or scalar doubles.');
    throw E('base:mtimes:integer', 'MTIMES (*) is not fully supported for integer data types. Use TIMES (.*) instead or convert to double.');
  }
  const cls = arithClass(A, B, 'mtimes');
  const re = new Float64Array(m * n);
  const ar = A.re, br = B.re;
  for (let j = 0; j < n; j++) {
    for (let p = 0; p < k; p++) {
      const bv = br[p + j * k];
      const off = p * m, o = j * m;
      for (let i = 0; i < m; i++) re[o + i] += ar[off + i] * bv;
    }
  }
  let im = null;
  if (A.im || B.im) {
    im = new Float64Array(m * n);
    const ai = A.im, bi = B.im;
    if (ai && bi) for (let j = 0; j < n; j++) for (let p = 0; p < k; p++) { const bv = bi[p + j * k]; if (bv === 0) continue; for (let i = 0; i < m; i++) re[i + j * m] -= ai[i + p * m] * bv; }
    if (ai) for (let j = 0; j < n; j++) for (let p = 0; p < k; p++) { const bv = br[p + j * k]; if (bv === 0) continue; for (let i = 0; i < m; i++) im[i + j * m] += ai[i + p * m] * bv; }
    if (bi) for (let j = 0; j < n; j++) for (let p = 0; p < k; p++) { const bv = bi[p + j * k]; if (bv === 0) continue; for (let i = 0; i < m; i++) im[i + j * m] += ar[i + p * m] * bv; }
  }
  return finalize(cls, [m, n], re, im);
}

// ------------------------------------------------------------- colon

const EPS = 2.220446049250313e-16;

/** a:b or a:d:b. args are Values (first element used). */
export function colon(args, ctx) {
  if (args.length < 2 || args.length > 3) throw E('base:colon:nargin', 'Colon operator requires 2 or 3 inputs.');
  for (const v of args) {
    if (v.isObject) { const r = objectOp('colon', args, 1, ctx); if (r !== undefined) return r; throw unsupported('colon', v); }
    if (!isTensor(v) && !isSparse(v)) throw E('base:colon:invalidType', `Colon operands must be real scalars (got ${v.cls}).`);
  }
  const ts = args.map((v) => toTensor(v));
  for (const t of ts) if (t.re.length === 0) return tensor(colonClass(ts), [1, 0]);
  for (const t of ts) if (t.re.length > 1 && ctx && ctx.warning) { ctx.warning('base:colon:nonScalarInput', 'Colon operands must be real scalars. This warning will become an error in a future release.'); break; }
  const a = ts[0].re[0], d = ts.length === 3 ? ts[1].re[0] : 1, b = ts[ts.length - 1].re[0];
  const cls = colonClass(ts);
  if (Number.isNaN(a) || Number.isNaN(d) || Number.isNaN(b)) return tensor(cls, [1, 1], [NaN]);
  if (d === 0 || (d > 0 && b < a) || (d < 0 && b > a)) return tensor(cls, [1, 0]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    if (!Number.isFinite(d)) return tensor(cls, [1, 1], [a]);
    throw E('base:colon:tooLarge', 'Maximum variable size allowed by the program is exceeded.');
  }
  if (!Number.isFinite(d)) return tensor(cls, [1, 1], [a]);
  let n;
  if (isIntC(cls)) n = Math.floor((b - a) / d) + 1;
  else {
    const tol = 2 * EPS * Math.max(Math.abs(a), Math.abs(b));
    n = Math.floor((b - a) / d + tol / Math.abs(d)) + 1;
  }
  if (n > 2 ** 31) throw E('base:colon:tooLarge', 'Maximum variable size allowed by the program is exceeded.');
  const re = new Float64Array(n);
  if (isIntC(cls) || (Number.isInteger(a) && Number.isInteger(d))) {
    for (let k = 0; k < n; k++) re[k] = a + k * d;
  } else {
    const last = a + (n - 1) * d;
    const half = Math.floor(n / 2);
    for (let k = 0; k < n; k++) re[k] = k < half ? a + k * d : last - (n - 1 - k) * d;
    // land exactly on b when b is within tolerance
    if (n > 1 && Math.abs(re[n - 1] - b) <= 2 * EPS * Math.max(Math.abs(a), Math.abs(b))) {
      const fix = b;
      re[n - 1] = fix;
      for (let k = half; k < n - 1; k++) re[k] = fix - (n - 1 - k) * d;
    }
  }
  return finalize(cls, [1, n], re);
}
function colonClass(ts) {
  let ic = null;
  for (const t of ts) if (isIntC(t.cls)) { if (ic && ic !== t.cls) throw E('base:colon:mixedIntegers', 'Colon operands must all be the same integer type, or a mix of an integer type and doubles.'); ic = t.cls; }
  if (ic) return ic;
  if (ts.some((t) => t.cls === 'single')) return 'single';
  if (ts.every((t) => t.cls === 'char')) return 'char';
  return 'double';
}

// ------------------------------------------------------------- concatenation

/** Class of concatenated numeric/char/logical tensors. */
export function catClass(items) {
  let anyInt = null, anyChar = false, anySingle = false, allLogical = true;
  for (const t of items) {
    if (isIntC(t.cls)) { if (!anyInt) anyInt = t.cls; }
    else if (t.cls === 'char') anyChar = true;
    else if (t.cls === 'single') anySingle = true;
    if (t.cls !== 'logical') allLogical = false;
  }
  if (anyInt) return anyInt;
  if (anyChar) return 'char';
  if (anySingle) return 'single';
  if (allLogical && items.length) return 'logical';
  return 'double';
}

function is00(v) { const d = v.dims || [1, 1]; return d.length === 2 && d[0] === 0 && d[1] === 0; }

function dimsAlong(items, k, what) {
  const d0 = (items[0].dims || [1, 1]).slice();
  const nd = Math.max(k + 1, ...items.map((v) => (v.dims || [1, 1]).length));
  while (d0.length < nd) d0.push(1);
  let total = 0;
  for (const v of items) {
    const d = (v.dims || [1, 1]).slice(); while (d.length < nd) d.push(1);
    for (let i = 0; i < nd; i++) if (i !== k && d[i] !== d0[i]) throw E('base:catenate:dimensionMismatch', `Dimensions of arrays being concatenated are not consistent.`);
    total += d[k];
  }
  d0[k] = total;
  return d0;
}

/** Generic block copy: builds the index plan. calls put(itemIndex, srcIndex, dstIndex). */
function catPlan(items, k, outDims, put) {
  const { before, after } = splitDims(outDims, k);
  const total = outDims[k];
  let off = 0;
  for (let q = 0; q < items.length; q++) {
    const d = items[q].dims || [1, 1];
    const len = k < d.length ? d[k] : 1;
    const chunk = before * len;
    for (let o = 0; o < after; o++) {
      const src = o * chunk, dst = o * before * total + off * before;
      for (let i = 0; i < chunk; i++) put(q, src + i, dst + i);
    }
    off += len;
  }
}

function toStringItem(v) {
  if (isString(v)) return v;
  if (isChar(v)) {
    if (v.dims[0] <= 1 && v.dims.length === 2) { let s = ''; for (let i = 0; i < v.re.length; i++) s += String.fromCharCode(v.re[i]); return stringArray([1, 1], [s]); }
    const [m, n] = v.dims; const list = [];
    for (let i = 0; i < m; i++) { let s = ''; for (let j = 0; j < n; j++) s += String.fromCharCode(v.re[i + j * m]); list.push(s); }
    return stringArray([m, 1], list);
  }
  if (isCell(v)) return stringArray(v.dims, v.data.map((x) => toStringItem(x).data[0]));
  if (isTensor(v) || isSparse(v)) { const r = strOperand(v, 'horzcat'); return stringArray(r.dims, r.list); }
  throw E('base:catenate:invalidType', `Unable to concatenate a value of class '${v.cls}' with a string array.`);
}

/** cat along 0-based dimension k of a list of Values. */
export function catValues(k, items, ctx) {
  if (items.length === 0) return tensor('double', [0, 0]);
  // objects (JS classes): delegate to the class's cat
  const obj = items.find((v) => v && v.isObject);
  if (obj) {
    const def = classDef(ctx, obj.cls);
    if (def && typeof def.cat === 'function') return def.cat(k, items, ctx);
    const mname = k === 0 ? 'vertcat' : k === 1 ? 'horzcat' : 'cat';
    const m = objMethod(ctx, obj, mname);
    if (m) return first(m(k > 1 ? [num(k + 1), ...items] : items, 1, ctx));
    if (items.length === 1) return obj;
    throw E('base:catenate:unsupported', `Concatenation of objects of class '${obj.cls}' is not supported.`);
  }
  if (items.some(isCell)) {
    const list = items.filter((v) => isCell(v) || !is00(v)).map((v) => (isCell(v) ? v : cell([1, 1], [v])));
    const ne = list.filter((v) => prod(v.dims) > 0 || !is00(v));
    const use = ne.length ? ne.filter((v) => prod(v.dims) > 0).length ? ne.filter((v) => prod(v.dims) > 0) : ne.slice(0, 1) : [cell([0, 0], [])];
    if (use.length === 1) return use[0];
    const od = dimsAlong(use, k);
    const data = new Array(prod(od));
    catPlan(use, k, od, (q, s, d) => { data[d] = use[q].data[s]; });
    return cell(od, data);
  }
  if (items.some(isString)) {
    const list = items.filter((v) => !(is00(v) && !isString(v))).map(toStringItem);
    if (list.length === 1) return list[0];
    const use = list.filter((v) => prod(v.dims) > 0);
    if (use.length === 0) return list[0];
    if (use.length === 1) return use[0];
    const od = dimsAlong(use, k);
    const data = new Array(prod(od));
    catPlan(use, k, od, (q, s, d) => { data[d] = use[q].data[s]; });
    return stringArray(od, data);
  }
  if (items.some(isStruct)) {
    const use = items.filter((v) => !(is00(v) && !isStruct(v)));
    for (const v of use) if (!isStruct(v)) throw E('base:catenate:structMix', `Concatenation of a struct with a value of class '${v.cls}' is not allowed.`);
    const ne = use.filter((v) => prod(v.dims) > 0);
    const base = ne.length ? ne : use.slice(0, 1);
    if (base.length === 1) return base[0];
    const fields = base[0].fields;
    for (const v of base) {
      if (v.fields.length !== fields.length || !fields.every((f) => v.fields.includes(f))) throw E('base:catenate:structFieldBad', 'Names of fields in structure arrays being concatenated do not match.');
    }
    const od = dimsAlong(base, k);
    const data = new Array(prod(od));
    catPlan(base, k, od, (q, s, d) => { data[d] = base[q].data[s]; });
    return struct(od, fields, data);
  }
  if (items.some(isFuncHandle)) {
    const use = items.filter((v) => !is00(v) || isFuncHandle(v));
    if (use.length === 1) return use[0];
    throw E('base:catenate:functionHandle', 'Nonscalar arrays of function handles are not allowed; use cell arrays instead.');
  }
  const ts = items.map((v) => {
    if (isTensor(v)) return v;
    if (isSparse(v)) return toTensor(v);
    throw E('base:catenate:invalidType', `Concatenation of values of class '${v.cls}' is not supported.`);
  });
  const cls = catClass(ts);
  let use = ts.filter((t) => !is00(t));
  if (use.length > 1) {
    const nonEmpty = use.filter((t) => t.re.length > 0);
    // empty arrays that do not match are ignored when others are non-empty
    try { dimsAlong(use, k); } catch (e) { if (nonEmpty.length) use = nonEmpty; else throw e; }
  }
  if (use.length === 0) return tensor(cls, [0, 0]);
  if (use.length === 1) return convertTo(use[0], cls);
  const od = dimsAlong(use, k);
  const n = prod(od);
  const re = new Float64Array(n);
  const anyIm = use.some((t) => t.im);
  const im = anyIm ? new Float64Array(n) : null;
  catPlan(use, k, od, (q, s, d) => { const t = use[q]; re[d] = t.re[s]; if (im && t.im) im[d] = t.im[s]; });
  if (cls === 'char') {
    for (let i = 0; i < n; i++) { const x = re[i]; re[i] = x !== x ? 0 : x < 0 ? 0 : x > 65535 ? 65535 : Math.round(x); }
    return { cls, dims: normDims(od), re, im: null };
  }
  return finalize(cls, od, re, im);
}
function convertTo(t, cls) {
  if (t.cls === cls) return t;
  if (cls === 'char') { const re = Float64Array.from(t.re, (x) => (x !== x || x < 0 ? 0 : x > 65535 ? 65535 : Math.round(x))); return { cls, dims: t.dims, re, im: null }; }
  return finalize(cls, t.dims, Float64Array.from(t.re), t.im ? Float64Array.from(t.im) : null);
}

export const horzcat = (items, ctx) => catValues(1, items, ctx);
export const vertcat = (items, ctx) => catValues(0, items, ctx);

// ------------------------------------------------------------- builtins

const b2 = (f, name) => {
  const g = (args, nargout, ctx) => {
    if (args.length < 2) throw E(`base:${name}:notEnoughInputs`, 'Not enough input arguments.');
    if (args.length > 2) throw E(`base:${name}:tooManyInputs`, 'Too many input arguments.');
    return f(args[0], args[1], ctx);
  };
  return g;
};
const b1 = (f, name) => (args, nargout, ctx) => {
  if (args.length < 1) throw E(`base:${name}:notEnoughInputs`, 'Not enough input arguments.');
  if (args.length > 1) throw E(`base:${name}:tooManyInputs`, 'Too many input arguments.');
  return f(args[0], ctx);
};

export const builtins = {
  plus(args, nargout, ctx) {
    if (args.length < 2) throw E('base:plus:notEnoughInputs', 'Not enough input arguments.');
    let r = plus(args[0], args[1], ctx);
    for (let i = 2; i < args.length; i++) r = plus(r, args[i], ctx);
    return r;
  },
  minus: b2(minus, 'minus'),
  times(args, nargout, ctx) {
    if (args.length < 2) throw E('base:times:notEnoughInputs', 'Not enough input arguments.');
    let r = times(args[0], args[1], ctx);
    for (let i = 2; i < args.length; i++) r = times(r, args[i], ctx);
    return r;
  },
  rdivide: b2(rdivide, 'rdivide'),
  ldivide: b2(ldivide, 'ldivide'),
  power: b2(power, 'power'),
  mtimes(args, nargout, ctx) {
    if (args.length < 2) throw E('base:mtimes:notEnoughInputs', 'Not enough input arguments.');
    let r = mtimes(args[0], args[1], ctx);
    for (let i = 2; i < args.length; i++) r = mtimes(r, args[i], ctx);
    return r;
  },
  uminus: b1(uminus, 'uminus'),
  uplus: b1(uplus, 'uplus'),
  not: b1(not, 'not'),
  eq: b2(eq, 'eq'), ne: b2(ne, 'ne'), lt: b2(lt, 'lt'), gt: b2(gt, 'gt'), le: b2(le, 'le'), ge: b2(ge, 'ge'),
  and(args, nargout, ctx) {
    if (args.length < 2) throw E('base:and:notEnoughInputs', 'Not enough input arguments.');
    let r = and(args[0], args[1], ctx);
    for (let i = 2; i < args.length; i++) r = and(r, args[i], ctx);
    return r;
  },
  or(args, nargout, ctx) {
    if (args.length < 2) throw E('base:or:notEnoughInputs', 'Not enough input arguments.');
    let r = or(args[0], args[1], ctx);
    for (let i = 2; i < args.length; i++) r = or(r, args[i], ctx);
    return r;
  },
  xor: b2(xor, 'xor'),
  transpose: b1(transpose, 'transpose'),
  ctranspose: b1(ctranspose, 'ctranspose'),
  colon(args, nargout, ctx) { return colon(args, ctx); },
  horzcat(args, nargout, ctx) { return args.length ? horzcat(args, ctx) : tensor('double', [0, 0]); },
  vertcat(args, nargout, ctx) { return args.length ? vertcat(args, ctx) : tensor('double', [0, 0]); },
  cat(args, nargout, ctx) {
    if (args.length < 1) throw E('base:cat:notEnoughInputs', 'Not enough input arguments.');
    const d = args[0];
    if (!isTensor(d) || d.re.length !== 1 || !(d.re[0] >= 1) || !Number.isInteger(d.re[0])) throw E('base:cat:invalidDim', 'Dimension must be a real, positive, integer scalar.');
    const items = args.slice(1);
    if (items.length === 0) return tensor('double', [0, 0]);
    return catValues(d.re[0] - 1, items, ctx);
  },
};

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  plus: H('Addition (A + B) with implicit expansion; joins strings.', '덧셈 (A + B), 암시적 확장; 문자열은 이어 붙임.', ['C = A + B', 'C = plus(A, B)']),
  minus: H('Subtraction (A - B).', '뺄셈 (A - B).', ['C = A - B', 'C = minus(A, B)']),
  times: H('Element-wise multiplication (A .* B).', '원소별 곱셈 (A .* B).', ['C = A .* B', 'C = times(A, B)']),
  rdivide: H('Right element-wise division (A ./ B).', '원소별 오른쪽 나눗셈 (A ./ B).', ['C = A ./ B', 'C = rdivide(A, B)']),
  ldivide: H('Left element-wise division (A .\\ B = B ./ A).', '원소별 왼쪽 나눗셈 (A .\\ B).', ['C = A .\\ B', 'C = ldivide(A, B)']),
  power: H('Element-wise power (A .^ B); negative bases with fractional exponents give complex results.', '원소별 거듭제곱 (A .^ B); 음수의 분수 거듭제곱은 복소수.', ['C = A .^ B', 'C = power(A, B)']),
  mtimes: H('Matrix multiplication (A * B).', '행렬 곱셈 (A * B).', ['C = A * B', 'C = mtimes(A, B)']),
  uminus: H('Unary minus (-A).', '단항 마이너스 (-A).', ['B = -A', 'B = uminus(A)']),
  uplus: H('Unary plus (+A).', '단항 플러스 (+A).', ['B = +A', 'B = uplus(A)']),
  not: H('Logical NOT (~A).', '논리 부정 (~A).', ['B = ~A', 'B = not(A)']),
  eq: H('Equal (A == B).', '같음 (A == B).', ['TF = A == B', 'TF = eq(A, B)']),
  ne: H('Not equal (A ~= B).', '같지 않음 (A ~= B).', ['TF = A ~= B', 'TF = ne(A, B)']),
  lt: H('Less than (A < B).', '작음 (A < B).', ['TF = A < B', 'TF = lt(A, B)']),
  gt: H('Greater than (A > B).', '큼 (A > B).', ['TF = A > B', 'TF = gt(A, B)']),
  le: H('Less than or equal (A <= B).', '작거나 같음 (A <= B).', ['TF = A <= B', 'TF = le(A, B)']),
  ge: H('Greater than or equal (A >= B).', '크거나 같음 (A >= B).', ['TF = A >= B', 'TF = ge(A, B)']),
  and: H('Element-wise logical AND (A & B).', '원소별 논리곱 (A & B).', ['TF = A & B', 'TF = and(A, B)']),
  or: H('Element-wise logical OR (A | B).', '원소별 논리합 (A | B).', ['TF = A | B', 'TF = or(A, B)']),
  xor: H('Logical exclusive OR.', '배타적 논리합.', ['TF = xor(A, B)']),
  transpose: H("Transpose (A.').", "전치 (A.').", ["B = A.'", 'B = transpose(A)']),
  ctranspose: H("Complex conjugate transpose (A').", "켤레 전치 (A').", ["B = A'", 'B = ctranspose(A)']),
  colon: H('Vector of regularly spaced values (a:b, a:d:b).', '등간격 벡터 생성 (a:b, a:d:b).', ['x = a:b', 'x = a:step:b', 'x = colon(a, b)']),
  horzcat: H('Horizontal concatenation ([A, B]).', '가로 연결 ([A, B]).', ['C = [A, B]', 'C = horzcat(A, B, ...)']),
  vertcat: H('Vertical concatenation ([A; B]).', '세로 연결 ([A; B]).', ['C = [A; B]', 'C = vertcat(A, B, ...)']),
  cat: H('Concatenate arrays along a dimension.', '지정 차원을 따라 배열 연결.', ['C = cat(dim, A, B, ...)']),
};
