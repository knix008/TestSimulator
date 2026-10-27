// Operator implementations used by the interpreter when the library does not
// provide (or before it provides) the operator builtins. Covers dense numeric,
// logical and char arrays (real and complex), implicit expansion, integer
// saturation, string arrays (concatenation and comparison), transposes of every
// array kind and colon ranges. Matrix algebra is limited to products, powers
// with integer exponents and square solves; the linear-algebra area provides
// the full versions.
import {
  MError, tensor, isTensor, isString, isCell, isStruct, INT_RANGE, saturate, broadcastDims, prod,
  stringArray, cell, struct, isSparse, toTensor, normDims,
} from '../value.js';

export const BINOP_NAMES = {
  '+': 'plus', '-': 'minus', '*': 'mtimes', '.*': 'times', '/': 'mrdivide', './': 'rdivide',
  '\\': 'mldivide', '.\\': 'ldivide', '^': 'mpower', '.^': 'power', '==': 'eq', '~=': 'ne',
  '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge', '&': 'and', '|': 'or',
};
export const UNOP_NAMES = { '-': 'uminus', '+': 'uplus', '~': 'not' };
export const POSTOP_NAMES = { "'": 'ctranspose', ".'": 'transpose' };
export const OP_SYMBOL = Object.fromEntries([...Object.entries(BINOP_NAMES), ...Object.entries(UNOP_NAMES), ...Object.entries(POSTOP_NAMES)].map(([k, v]) => [v, k]));

const isInt = (c) => c in INT_RANGE;
const typeErr = (op, a, b) => new MError('core:undefinedOperator',
  `Operator '${OP_SYMBOL[op] || op}' is not supported for operands of type '${a.cls}'${b ? ` and '${b.cls}'` : ''}.`);

/** Fast scalar double result. Same shape as value.js tensor(). */
export function dnum(x) { const re = new Float64Array(1); re[0] = x; return { cls: 'double', dims: [1, 1], re, im: null }; }
export function lnum(b) { const re = new Float64Array(1); re[0] = b ? 1 : 0; return { cls: 'logical', dims: [1, 1], re, im: null }; }

function arithClass(op, a, b) {
  const ca = a.cls, cb = b.cls;
  const ia = isInt(ca), ib = isInt(cb);
  if (ia || ib) {
    if (ia && ib && ca !== cb) throw new MError('core:mixedIntegerClasses', 'Integers can only be combined with integers of the same class, or scalar doubles.');
    if (ia && ib) return ca;
    const other = ia ? b : a;
    if (other.cls !== 'double' && other.cls !== 'logical' && other.cls !== 'char' && other.cls !== 'single') throw typeErr(op, a, b);
    return ia ? ca : cb;
  }
  if (ca === 'single' || cb === 'single') return 'single';
  return 'double';
}

function checkNumeric(op, a, b) {
  if (!isTensor(a) || (b && !isTensor(b))) throw typeErr(op, a, b);
}

/** Broadcast loop: calls f(i, ia, ib) for every output element. */
function bcastIndex(da, db) {
  const dims = broadcastDims(da, db);
  const n = prod(dims);
  const na = prod(da), nb = prod(db);
  const ia = new Int32Array(n), ib = new Int32Array(n);
  if (na === n && nb === n) { for (let i = 0; i < n; i++) { ia[i] = i; ib[i] = i; } return { dims, n, ia, ib }; }
  const nd = dims.length;
  const sa = [], sb = [];
  let ma = 1, mb = 1;
  for (let k = 0; k < nd; k++) {
    const xa = k < da.length ? da[k] : 1, xb = k < db.length ? db[k] : 1;
    sa.push(xa === 1 ? 0 : ma); sb.push(xb === 1 ? 0 : mb);
    ma *= xa; mb *= xb;
  }
  const sub = new Array(nd).fill(0);
  let pa = 0, pb = 0;
  for (let i = 0; i < n; i++) {
    ia[i] = pa; ib[i] = pb;
    for (let k = 0; k < nd; k++) {
      sub[k]++; pa += sa[k]; pb += sb[k];
      if (sub[k] < dims[k]) break;
      pa -= sa[k] * dims[k]; pb -= sb[k] * dims[k]; sub[k] = 0;
    }
  }
  return { dims, n, ia, ib };
}

function finish(cls, dims, re, im) {
  if (isInt(cls)) { for (let i = 0; i < re.length; i++) re[i] = saturate(cls, re[i]); if (im) for (let i = 0; i < im.length; i++) im[i] = saturate(cls, im[i]); }
  else if (cls === 'single') { for (let i = 0; i < re.length; i++) re[i] = Math.fround(re[i]); if (im) for (let i = 0; i < im.length; i++) im[i] = Math.fround(im[i]); }
  if (im) { let any = false; for (let i = 0; i < im.length; i++) if (im[i] !== 0) { any = true; break; } if (!any) im = null; }
  return tensor(cls, dims, re, im);
}

function cdiv(ar, ai, br, bi) {
  if (bi === 0) return [ar / br, ai / br];
  const d = br * br + bi * bi;
  return [(ar * br + ai * bi) / d, (ai * br - ar * bi) / d];
}
function cpow(ar, ai, br, bi) {
  if (ar === 0 && ai === 0) {
    if (br === 0 && bi === 0) return [1, 0];
    if (bi === 0 && br > 0) return [0, 0];
    return [Infinity, 0];
  }
  if (ai === 0 && bi === 0 && Number.isInteger(br)) return [ar ** br, 0];
  const lr = Math.log(Math.hypot(ar, ai)), th = Math.atan2(ai, ar);
  const er = br * lr - bi * th, ei = bi * lr + br * th;
  const m = Math.exp(er);
  return [m * Math.cos(ei), m * Math.sin(ei)];
}

const REAL_FN = {
  plus: (x, y) => x + y, minus: (x, y) => x - y, times: (x, y) => x * y, rdivide: (x, y) => x / y,
  ldivide: (x, y) => y / x, power: (x, y) => x ** y,
};

/** Integer division/arithmetic: M computes in double then rounds. idivide semantics differ (base). */
function elementwiseArith(op, a, b) {
  checkNumeric(op, a, b);
  const cls = arithClass(op, a, b);
  const { dims, n, ia, ib } = bcastIndex(a.dims, b.dims);
  const re = new Float64Array(n);
  const ar = a.re, br = b.re, ai = a.im, bi = b.im;
  if (!ai && !bi) {
    if (op === 'power') {
      let neg = false;
      for (let i = 0; i < n; i++) { const x = ar[ia[i]], y = br[ib[i]]; if (x < 0 && !Number.isInteger(y)) { neg = true; break; } }
      if (neg && !isInt(cls)) return complexArith(op, a, b, cls, dims, n, ia, ib);
    }
    const f = REAL_FN[op];
    for (let i = 0; i < n; i++) re[i] = f(ar[ia[i]], br[ib[i]]);
    return finish(cls, dims, re, null);
  }
  return complexArith(op, a, b, cls, dims, n, ia, ib);
}

function complexArith(op, a, b, cls, dims, n, ia, ib) {
  const re = new Float64Array(n), im = new Float64Array(n);
  const ar = a.re, br = b.re, ai = a.im, bi = b.im;
  for (let i = 0; i < n; i++) {
    const xr = ar[ia[i]], xi = ai ? ai[ia[i]] : 0, yr = br[ib[i]], yi = bi ? bi[ib[i]] : 0;
    let r;
    switch (op) {
      case 'plus': r = [xr + yr, xi + yi]; break;
      case 'minus': r = [xr - yr, xi - yi]; break;
      case 'times': r = [xr * yr - xi * yi, xr * yi + xi * yr]; break;
      case 'rdivide': r = cdiv(xr, xi, yr, yi); break;
      case 'ldivide': r = cdiv(yr, yi, xr, xi); break;
      case 'power': r = cpow(xr, xi, yr, yi); break;
      default: throw typeErr(op, a, b);
    }
    re[i] = r[0]; im[i] = r[1];
  }
  return finish(cls, dims, re, im);
}

function stringOperand(v) {
  if (isString(v)) return v;
  if (v.cls === 'char') {
    const s = v.dims[0] <= 1 ? String.fromCharCode(...v.re) : null;
    if (s === null) throw new MError('core:undefinedOperator', 'Character matrices cannot be combined with strings.');
    return stringArray([1, 1], [s]);
  }
  if (isCell(v)) return stringArray(v.dims, v.data.map((x) => stringOperand(x).data[0]));
  if (isTensor(v)) return stringArray(v.dims, Array.from(v.re, (x) => (v.cls === 'logical' ? (x ? 'true' : 'false') : numToStr(x))));
  throw new MError('core:undefinedOperator', `Operator is not supported for operands of type '${v.cls}' with strings.`);
}
function numToStr(x) {
  if (Number.isInteger(x)) return String(x);
  if (!Number.isFinite(x)) return Number.isNaN(x) ? 'NaN' : x > 0 ? 'Inf' : '-Inf';
  return String(Number(x.toPrecision(5)));
}

function stringBinary(op, a, b) {
  const sa = stringOperand(a), sb = stringOperand(b);
  const { dims, n, ia, ib } = bcastIndex(sa.dims, sb.dims);
  if (op === 'plus') {
    const data = new Array(n);
    for (let i = 0; i < n; i++) { const x = sa.data[ia[i]], y = sb.data[ib[i]]; data[i] = x == null || y == null ? null : x + y; }
    return stringArray(dims, data);
  }
  const re = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = sa.data[ia[i]], y = sb.data[ib[i]];
    if (x == null || y == null) { re[i] = op === 'ne' ? 1 : 0; continue; }
    const c = x < y ? -1 : x > y ? 1 : 0;
    re[i] = op === 'eq' ? +(c === 0) : op === 'ne' ? +(c !== 0) : op === 'lt' ? +(c < 0) : op === 'le' ? +(c <= 0) : op === 'gt' ? +(c > 0) : +(c >= 0);
  }
  return tensor('logical', dims, re);
}

const CMP = {
  eq: (x, y) => x === y, ne: (x, y) => x !== y, lt: (x, y) => x < y, le: (x, y) => x <= y, gt: (x, y) => x > y, ge: (x, y) => x >= y,
};

function compare(op, a, b) {
  if (isString(a) || isString(b)) return stringBinary(op, a, b);
  if (a.cls === 'function_handle' || b.cls === 'function_handle') {
    if (op === 'eq' || op === 'ne') { const same = a === b || (a.name && a.name === b.name && !a.body && !b.body); return tensor('logical', [1, 1], [(op === 'eq') === same ? 1 : 0]); }
  }
  if (isSparse(a)) a = toTensor(a);
  if (isSparse(b)) b = toTensor(b);
  checkNumeric(op, a, b);
  if (isInt(a.cls) && isInt(b.cls) && a.cls !== b.cls && false) throw typeErr(op, a, b);
  const { dims, n, ia, ib } = bcastIndex(a.dims, b.dims);
  const re = new Float64Array(n);
  const f = CMP[op];
  const ar = a.re, br = b.re;
  if ((op === 'eq' || op === 'ne') && (a.im || b.im)) {
    for (let i = 0; i < n; i++) {
      const same = ar[ia[i]] === br[ib[i]] && (a.im ? a.im[ia[i]] : 0) === (b.im ? b.im[ib[i]] : 0);
      re[i] = (op === 'eq') === same ? 1 : 0;
    }
  } else for (let i = 0; i < n; i++) re[i] = f(ar[ia[i]], br[ib[i]]) ? 1 : 0;
  return tensor('logical', dims, re);
}

function logicalArg(op, v) {
  if (isSparse(v)) v = toTensor(v);
  if (!isTensor(v)) throw typeErr(op, v);
  for (let i = 0; i < v.re.length; i++) if (Number.isNaN(v.re[i])) throw new MError('core:logical:NaN', 'NaN values cannot be converted to logicals.');
  return v;
}

function logicalOp(op, a, b) {
  a = logicalArg(op, a); b = logicalArg(op, b);
  const { dims, n, ia, ib } = bcastIndex(a.dims, b.dims);
  const re = new Float64Array(n);
  if (op === 'and') for (let i = 0; i < n; i++) re[i] = a.re[ia[i]] !== 0 && b.re[ib[i]] !== 0 ? 1 : 0;
  else for (let i = 0; i < n; i++) re[i] = a.re[ia[i]] !== 0 || b.re[ib[i]] !== 0 ? 1 : 0;
  return tensor('logical', dims, re);
}

// ------------------------------------------------------------ matrix algebra

function matmul(a, b) {
  const [m, k] = a.dims, [k2, n] = b.dims;
  if (a.dims.length > 2 || b.dims.length > 2) throw new MError('core:mtimes:ndims', 'Arguments must be 2-D, or at least one argument must be scalar.');
  if (k !== k2) throw new MError('core:innerdim', 'Incorrect dimensions for matrix multiplication. Check that the number of columns in the first matrix matches the number of rows in the second matrix. To operate on each element of the matrix individually, use TIMES (.*) for elementwise multiplication.');
  const cls = arithClass('mtimes', a, b);
  if (isInt(cls)) throw new MError('core:mtimes:integer', 'Integer matrix multiplication requires one scalar operand.');
  const re = new Float64Array(m * n);
  const cx = !!(a.im || b.im);
  const im = cx ? new Float64Array(m * n) : null;
  const ar = a.re, br = b.re, ai = a.im, bi = b.im;
  for (let j = 0; j < n; j++) {
    for (let p = 0; p < k; p++) {
      const yr = br[p + j * k], yi = bi ? bi[p + j * k] : 0;
      if (yr === 0 && yi === 0) continue;
      for (let i = 0; i < m; i++) {
        const xr = ar[i + p * m];
        if (!cx) { re[i + j * m] += xr * yr; continue; }
        const xi = ai ? ai[i + p * m] : 0;
        re[i + j * m] += xr * yr - xi * yi;
        im[i + j * m] += xr * yi + xi * yr;
      }
    }
  }
  // 0*Inf rules: recompute rows with non-finite entries naively
  return finish(cls, [m, n], re, im);
}

function solveSquare(A, B) {
  // Gaussian elimination with partial pivoting, real only. A: n x n, B: n x m
  const n = A.dims[0], m = B.dims[1];
  const a = Float64Array.from(A.re), b = Float64Array.from(B.re);
  let singular = false;
  for (let c = 0; c < n; c++) {
    let p = c, best = Math.abs(a[c + c * n]);
    for (let r = c + 1; r < n; r++) { const v = Math.abs(a[r + c * n]); if (v > best) { best = v; p = r; } }
    if (best === 0) { singular = true; continue; }
    if (p !== c) {
      for (let j = 0; j < n; j++) { const t = a[c + j * n]; a[c + j * n] = a[p + j * n]; a[p + j * n] = t; }
      for (let j = 0; j < m; j++) { const t = b[c + j * n]; b[c + j * n] = b[p + j * n]; b[p + j * n] = t; }
    }
    for (let r = c + 1; r < n; r++) {
      const f = a[r + c * n] / a[c + c * n];
      if (f === 0) continue;
      for (let j = c; j < n; j++) a[r + j * n] -= f * a[c + j * n];
      for (let j = 0; j < m; j++) b[r + j * n] -= f * b[c + j * n];
    }
  }
  const x = new Float64Array(n * m);
  for (let j = 0; j < m; j++) {
    for (let r = n - 1; r >= 0; r--) {
      let s = b[r + j * n];
      for (let k = r + 1; k < n; k++) s -= a[r + k * n] * x[k + j * n];
      x[r + j * n] = s / a[r + r * n];
    }
  }
  return { x: tensor('double', [n, m], x), singular };
}

function mldivide(a, b, warn) {
  if (prod(a.dims) === 1) return elementwiseArith('ldivide', a, b);
  if (a.im || b.im || a.dims[0] !== a.dims[1]) throw new MError('core:undefinedFunction', 'Undefined function \'mldivide\' for non-square or complex matrices (the linear algebra library is not loaded).');
  if (a.dims[0] !== b.dims[0]) throw new MError('core:mldivide:dims', 'Matrix dimensions must agree.');
  const { x, singular } = solveSquare(a, b);
  if (singular && warn) warn('core:singularMatrix', 'Matrix is singular to working precision.');
  return x;
}

function transpose2(v, conj) {
  if (v.dims.length > 2) throw new MError('core:transpose:ndims', 'Transpose on ND array is not defined. Use PERMUTE instead.');
  const [m, n] = v.dims;
  const perm = (src) => { const out = new Array(m * n); for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) out[j + i * n] = src[i + j * m]; return out; };
  if (isTensor(v)) {
    const re = new Float64Array(m * n);
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) re[j + i * n] = v.re[i + j * m];
    let im = null;
    if (v.im) { im = new Float64Array(m * n); for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) im[j + i * n] = conj ? -v.im[i + j * m] : v.im[i + j * m]; }
    return tensor(v.cls, [n, m], re, im);
  }
  if (isCell(v)) return cell([n, m], perm(v.data));
  if (isString(v)) return stringArray([n, m], perm(v.data));
  if (isStruct(v)) return struct([n, m], v.fields, perm(v.data));
  if (v.cls === 'function_handle' && m * n === 1) return v;
  throw typeErr(conj ? 'ctranspose' : 'transpose', v);
}

function mpower(a, b) {
  if (prod(a.dims) === 1 && prod(b.dims) === 1) return elementwiseArith('power', a, b);
  if (prod(b.dims) === 1 && !b.im && Number.isInteger(b.re[0]) && a.dims.length === 2 && a.dims[0] === a.dims[1]) {
    let p = b.re[0];
    let base = a;
    if (p < 0) {
      const n = a.dims[0];
      const I = tensor('double', [n, n]); for (let i = 0; i < n; i++) I.re[i + i * n] = 1;
      base = mldivide(a, I);
      p = -p;
    }
    const n = a.dims[0];
    let r = tensor('double', [n, n]); for (let i = 0; i < n; i++) r.re[i + i * n] = 1;
    while (p > 0) { if (p & 1) r = matmul(r, base); base = matmul(base, base); p = Math.floor(p / 2); }
    return r;
  }
  throw new MError('core:undefinedFunction', "Undefined function 'mpower' for these operands (the linear algebra library is not loaded).");
}

/** Colon ranges a:b and a:s:b. */
export function colonRange(a, s, b) {
  const ok = (v) => isTensor(v) && v.re.length >= 1;
  if (!ok(a) || !ok(b) || (s && !ok(s))) {
    if ((isTensor(a) && a.re.length === 0) || (isTensor(b) && b.re.length === 0) || (s && isTensor(s) && s.re.length === 0)) return tensor('double', [1, 0]);
    throw new MError('core:colon:type', 'Colon operands must be real numeric scalars.');
  }
  const x0 = a.re[0], st = s ? s.re[0] : 1, x1 = b.re[0];
  let cls = 'double';
  for (const v of [a, s, b]) if (v && (isInt(v.cls) || v.cls === 'single')) cls = v.cls;
  if (cls === 'double' && a.cls === 'char' && b.cls === 'char') cls = 'char';
  const n = rangeCount(x0, st, x1);
  const re = new Float64Array(n);
  for (let k = 0; k < n; k++) re[k] = x0 + k * st;
  return finish(cls, [1, n], re, null);
}
export function rangeCount(x0, st, x1) {
  if (Number.isNaN(x0) || Number.isNaN(st) || Number.isNaN(x1)) return 0;
  if (st === 0 || (st > 0 && x0 > x1) || (st < 0 && x0 < x1)) return 0;
  const q = (x1 - x0) / st;
  if (!Number.isFinite(q)) throw new MError('core:colon:tooMany', 'Maximum variable size allowed by the program is exceeded.');
  const tol = 3 * 2.220446049250313e-16 * Math.max(Math.abs(x0), Math.abs(x1)) / Math.abs(st);
  return Math.floor(q + tol) + 1;
}

/** Fallback for operator builtin `name` (no library implementation available). */
export function fallbackOp(name, args, warn) {
  const [a, b] = args;
  switch (name) {
    case 'plus': case 'minus': case 'times': case 'rdivide': case 'ldivide': case 'power':
      if (isString(a) || isString(b)) { if (name === 'plus') return stringBinary('plus', a, b); throw typeErr(name, a, b); }
      return elementwiseArith(name, isSparse(a) ? toTensor(a) : a, isSparse(b) ? toTensor(b) : b);
    case 'mtimes':
      if (!isTensor(a) || !isTensor(b)) { if (isSparse(a) || isSparse(b)) return matmul(toTensor(a), toTensor(b)); throw typeErr(name, a, b); }
      if (prod(a.dims) === 1 || prod(b.dims) === 1) return elementwiseArith('times', a, b);
      return matmul(a, b);
    case 'mrdivide':
      checkNumeric(name, a, b);
      if (prod(b.dims) === 1) return elementwiseArith('rdivide', a, b);
      return transpose2(mldivide(transpose2(b), transpose2(a), warn));
    case 'mldivide':
      checkNumeric(name, a, b);
      return mldivide(a, b, warn);
    case 'mpower': checkNumeric(name, a, b); return mpower(a, b);
    case 'eq': case 'ne': case 'lt': case 'le': case 'gt': case 'ge': return compare(name, a, b);
    case 'and': case 'or': return logicalOp(name, a, b);
    case 'not': {
      const v = logicalArg(name, a);
      const re = new Float64Array(v.re.length);
      for (let i = 0; i < re.length; i++) re[i] = v.re[i] === 0 ? 1 : 0;
      return tensor('logical', v.dims, re);
    }
    case 'uminus': {
      const v = isSparse(a) ? toTensor(a) : a;
      if (!isTensor(v)) throw typeErr(name, a);
      const cls = v.cls === 'logical' || v.cls === 'char' ? 'double' : v.cls;
      const re = new Float64Array(v.re.length);
      for (let i = 0; i < re.length; i++) re[i] = -v.re[i];
      let im = null;
      if (v.im) { im = new Float64Array(v.im.length); for (let i = 0; i < im.length; i++) im[i] = -v.im[i]; }
      return finish(cls, v.dims, re, im);
    }
    case 'uplus': {
      if (!isTensor(a) && !isSparse(a) && !isString(a)) throw typeErr(name, a);
      if (isTensor(a) && (a.cls === 'logical' || a.cls === 'char')) return tensor('double', a.dims, Float64Array.from(a.re));
      return a;
    }
    case 'transpose': return transpose2(isSparse(a) ? toTensor(a) : a, false);
    case 'ctranspose': return transpose2(isSparse(a) ? toTensor(a) : a, true);
    case 'colon': return args.length === 3 ? colonRange(args[0], args[1], args[2]) : colonRange(args[0], null, args[1]);
    default: throw new MError('core:undefinedFunction', `Undefined function '${name}'.`);
  }
}

export { transpose2, normDims };
