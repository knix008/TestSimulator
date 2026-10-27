// Elementary math: exponential / logarithm / power, trigonometry (radians and
// degrees), hyperbolic functions, rounding, remainders, complex parts,
// number theory (gcd, lcm, factor, primes, nchoosek, perms) and bit
// operations. Real inputs outside the real domain give complex results.
import { INT_RANGE, tensor, normDims, prod, isTensor, isSparse, toTensor, num, bool, MError } from '../../value.js';
import { E, finalize, dense, textArg, optArg, firstNonSingleton, dimArg, splitDims, dimsWith } from './util.js';
import { arithClass, mapReal, mapComplex } from './ops.js';
import * as cm from './cmath.js';

const isIntC = (c) => c in INT_RANGE;
const D2R = Math.PI / 180;

function numIn(v, fname) {
  if (v === undefined) throw E(`base:${fname}:notEnoughInputs`, 'Not enough input arguments.');
  if (isTensor(v)) return v;
  if (isSparse(v)) return toTensor(v);
  throw E(`base:${fname}:invalidType`, `Check for incorrect argument data type or missing argument in call to function '${fname}'.`);
}
const outCls = (c) => (c === 'logical' || c === 'char' ? 'double' : c);

/**
 * Unary float function. realFn(x) for real; complexFn(a,b) writing cm.C;
 * needC(x) tells whether a real x leaves the real domain.
 */
function unary(fname, realFn, complexFn, needC = null, opts = {}) {
  return (args) => {
    if (args.length > 1 && !opts.extraArgs) throw E(`base:${fname}:tooManyInputs`, 'Too many input arguments.');
    const t = numIn(args[0], fname);
    if (isIntC(t.cls) && !opts.ints) throw E(`base:${fname}:invalidType`, `Check for incorrect argument data type or missing argument in call to function '${fname}'.`);
    const cls = outCls(t.cls);
    const n = t.re.length;
    let complexPath = !!t.im;
    if (!complexPath && needC) for (let i = 0; i < n; i++) if (needC(t.re[i])) { complexPath = true; break; }
    if (!complexPath) {
      const re = new Float64Array(n);
      for (let i = 0; i < n; i++) re[i] = realFn(t.re[i]);
      return finalize(cls, t.dims, re);
    }
    if (!complexFn) throw E(`base:${fname}:complex`, `Function '${fname}' does not support complex inputs.`);
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) { complexFn(t.re[i], t.im ? t.im[i] : 0); re[i] = cm.C.re; im[i] = cm.C.im; }
    return finalize(cls, t.dims, re, im);
  };
}

/** Same for functions that are exact on integers and keep integer class. */
function unaryKeep(fname, realFn, complexPart = true) {
  return (args) => {
    const t = numIn(args[0], fname);
    const cls = outCls(t.cls);
    const re = new Float64Array(t.re.length);
    for (let i = 0; i < re.length; i++) re[i] = realFn(t.re[i]);
    let im = null;
    if (t.im) { im = new Float64Array(t.im.length); for (let i = 0; i < im.length; i++) im[i] = complexPart ? realFn(t.im[i]) : t.im[i]; }
    return finalize(cls, t.dims, re, im);
  };
}

// Inverse functions through reciprocal: f(1/z)
function recip(a, b) { cm.cdiv(1, 0, a, b); return [cm.C.re, cm.C.im]; }
const viaRecip = (fn) => (a, b) => { const [r, i] = recip(a, b); fn(r, i); };
const scaleC = (fn, s) => (a, b) => { fn(a, b); cm.C.re *= s; cm.C.im *= s; };

// ------------------------------------------------------------- degrees (exact at multiples of 90)

function sind(x) {
  if (!Number.isFinite(x)) return NaN;
  let r = x % 360; if (r < 0) r += 360;
  if (r === 0 || r === 180) return x < 0 && r === 0 ? -0 : 0;
  if (r === 90) return 1;
  if (r === 270) return -1;
  if (r === 30 || r === 150) return 0.5;
  if (r === 210 || r === 330) return -0.5;
  return Math.sin(x * D2R);
}
function cosd(x) {
  if (!Number.isFinite(x)) return NaN;
  let r = x % 360; if (r < 0) r += 360;
  if (r === 90 || r === 270) return 0;
  if (r === 0) return 1;
  if (r === 180) return -1;
  if (r === 60 || r === 300) return 0.5;
  if (r === 120 || r === 240) return -0.5;
  return Math.cos(x * D2R);
}
function tand(x) {
  if (!Number.isFinite(x)) return NaN;
  let r = x % 180; if (r < 0) r += 180;
  if (r === 0) return x < 0 ? -0 : 0;
  if (r === 90) { let s = x % 360; if (s < 0) s += 360; return s === 90 ? Infinity : -Infinity; }
  if (r === 45) return 1;
  if (r === 135) return -1;
  return Math.tan(x * D2R);
}

// ------------------------------------------------------------- binary helpers

function binaryNum(fname, args, f, opts = {}) {
  if (args.length < 2) throw E(`base:${fname}:notEnoughInputs`, 'Not enough input arguments.');
  const A = numIn(args[0], fname), B = numIn(args[1], fname);
  if ((A.im || B.im) && !opts.complex) throw E(`base:${fname}:complex`, `Inputs to '${fname}' must be real.`);
  const cls = arithClass(A, B, fname);
  if (isIntC(cls) && opts.noInt) throw E(`base:${fname}:invalidType`, `Check for incorrect argument data type or missing argument in call to function '${fname}'.`);
  const r = mapReal(A, B, f, fname);
  return finalize(opts.cls || cls, r.dims, r.re);
}

const EPS = 2.220446049250313e-16;
function modf(x, y) {
  if (y === 0) return x;
  if (!Number.isFinite(x)) return NaN;
  if (!Number.isFinite(y)) return x === 0 || Math.sign(x) === Math.sign(y) ? x : y;
  const q = x / y;
  if (Number.isInteger(x) && Number.isInteger(y)) { const r = x % y; return r !== 0 && (r < 0) !== (y < 0) ? r + y : r === 0 ? 0 : r; }
  if (Math.abs(q - Math.round(q)) <= EPS * Math.abs(q)) return 0;
  const r = x - Math.floor(q) * y;
  return r;
}
function remf(x, y) {
  if (y === 0) return NaN;
  if (!Number.isFinite(x)) return NaN;
  if (!Number.isFinite(y)) return x;
  if (Number.isInteger(x) && Number.isInteger(y)) { const r = x % y; return r === 0 ? 0 : r; }
  const q = x / y;
  if (Math.abs(q - Math.round(q)) <= EPS * Math.abs(q)) return 0;
  return x - Math.trunc(q) * y;
}

function intKernel(fname, args, fFloat, fInt) {
  if (args.length < 2) throw E(`base:${fname}:notEnoughInputs`, 'Not enough input arguments.');
  const A = numIn(args[0], fname), B = numIn(args[1], fname);
  if (A.im || B.im) throw E(`base:${fname}:complex`, `Arguments to '${fname}' must be real.`);
  const cls = arithClass(A, B, fname);
  const ic = isIntC(cls);
  // integer classes: operate on the rounded integer operands
  const prep = (t) => (ic && !isIntC(t.cls) ? { ...t, re: Float64Array.from(t.re, (x) => finalize(cls, [1, 1], Float64Array.of(x)).re[0]) } : t);
  const r = mapReal(prep(A), prep(B), ic ? fInt : fFloat, fname);
  return finalize(cls, r.dims, r.re);
}

// ------------------------------------------------------------- rounding with digits

function roundDigits(x, n, significant) {
  if (!Number.isFinite(x) || x === 0) return x;
  if (significant) {
    const d = Math.floor(Math.log10(Math.abs(x)));
    n = n - 1 - d;
  }
  if (n >= 0) {
    const p = 10 ** n;
    const y = x * p;
    if (!Number.isFinite(y)) return x;
    const r = Math.sign(y) * Math.round(Math.abs(y));
    const v = r / p;
    // correct representation errors (e.g. 2.675 -> 2.68)
    const s = Number(Math.abs(x).toFixed(Math.min(100, n)));
    const alt = Math.sign(x) * s;
    return Math.abs(alt - v) < Math.abs(v) * 1e-15 + 1e-300 ? alt : v;
  }
  const p = 10 ** -n;
  return Math.sign(x) * Math.round(Math.abs(x) / p) * p;
}
const roundHalfAway = (x) => (x < 0 ? -Math.round(-x) : Math.round(x));

function roundFn(args) {
  const t = numIn(args[0], 'round');
  if (args.length === 1) return unaryKeep('round', roundHalfAway)(args);
  const n = dense(args[1], 'round').re[0];
  if (!Number.isInteger(n)) throw E('base:round:invalidDigits', 'The number of digits must be an integer.');
  let sig = false;
  if (args.length > 2) { const o = optArg(args[2]); if (o === 'significant') sig = true; else if (o !== 'decimals') throw E('base:round:invalidType', "Rounding type must be 'decimals' or 'significant'."); }
  if (sig && n <= 0) throw E('base:round:invalidDigits', "The number of significant digits must be a positive integer.");
  const cls = outCls(t.cls);
  const re = Float64Array.from(t.re, (x) => roundDigits(x, n, sig));
  const im = t.im ? Float64Array.from(t.im, (x) => roundDigits(x, n, sig)) : null;
  return finalize(cls, t.dims, re, im);
}

// ------------------------------------------------------------- number theory

function gcd2(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
function egcd(a, b) {
  let [or, r] = [a, b], [os, s] = [1, 0], [ot, t] = [0, 1];
  while (r !== 0) { const q = Math.floor(or / r); [or, r] = [r, or - q * r]; [os, s] = [s, os - q * s]; [ot, t] = [t, ot - q * t]; }
  if (or < 0) { or = -or; os = -os; ot = -ot; }
  return [or, os, ot];
}

function checkIntegerValued(t, fname) {
  for (const x of t.re) if (!Number.isInteger(x) && Number.isFinite(x)) throw E(`base:${fname}:nonInteger`, 'Inputs must be real integers.');
}

function factorFn(args) {
  const t = numIn(args[0], 'factor');
  if (t.re.length !== 1) throw E('base:factor:nonScalar', 'N must be a real nonnegative integer scalar.');
  let n = t.re[0];
  if (!(n >= 0) || !Number.isInteger(n)) throw E('base:factor:nonInteger', 'N must be a real nonnegative integer scalar.');
  if (n > 2 ** 53) throw E('base:factor:tooLarge', 'The maximum value of N allowed is flintmax.');
  const out = [];
  if (n < 4) out.push(n);
  else {
    for (let p = 2; p * p <= n; p += p === 2 ? 1 : 2) while (n % p === 0) { out.push(p); n /= p; }
    if (n > 1) out.push(n);
  }
  return finalize(outCls(t.cls), [1, out.length], Float64Array.from(out));
}

function sieve(n) {
  const isP = new Uint8Array(n + 1).fill(1);
  isP[0] = 0; if (n >= 1) isP[1] = 0;
  for (let i = 2; i * i <= n; i++) if (isP[i]) for (let j = i * i; j <= n; j += i) isP[j] = 0;
  return isP;
}
function isPrimeNum(x) {
  if (!Number.isInteger(x) || x < 2) return false;
  if (x < 4) return true;
  if (x % 2 === 0 || x % 3 === 0) return false;
  for (let i = 5; i * i <= x; i += 6) if (x % i === 0 || x % (i + 2) === 0) return false;
  return true;
}

function binom(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
  return Math.round(r);
}

function nchoosekFn(args, nargout, ctx) {
  if (args.length < 2) throw E('base:nchoosek:notEnoughInputs', 'Not enough input arguments.');
  const v = numIn(args[0], 'nchoosek');
  const k = dense(args[1], 'nchoosek').re[0];
  if (!(k >= 0) || !Number.isInteger(k)) throw E('base:nchoosek:invalidK', 'K must be an integer between 0 and N.');
  if (v.re.length === 1) {
    const n = v.re[0];
    if (!(n >= 0) || !Number.isInteger(n)) throw E('base:nchoosek:invalidN', 'N must be a non-negative integer.');
    if (k > n) throw E('base:nchoosek:KOutOfRange', 'K must be an integer between 0 and N.');
    const r = binom(n, k);
    if (r > 2 ** 53 && ctx && ctx.warning) ctx.warning('base:nchoosek:LargeCoefficient', 'Result may not be exact. Coefficient is greater than 9.007199e+15 and is only accurate to 15 digits');
    return finalize(outCls(v.cls), [1, 1], Float64Array.of(r));
  }
  const n = v.re.length;
  if (k > n) return tensor(outCls(v.cls), [0, k]);
  const rows = [];
  const comb = Array.from({ length: k }, (_, i) => i);
  if (k === 0) return tensor(v.cls, [1, 0]);
  for (;;) {
    rows.push(comb.slice());
    let i = k - 1;
    while (i >= 0 && comb[i] === n - k + i) i--;
    if (i < 0) break;
    comb[i]++;
    for (let j = i + 1; j < k; j++) comb[j] = comb[j - 1] + 1;
  }
  const m = rows.length;
  const re = new Float64Array(m * k), im = v.im ? new Float64Array(m * k) : null;
  rows.forEach((r, i) => r.forEach((s, j) => { re[i + j * m] = v.re[s]; if (im) im[i + j * m] = v.im[s]; }));
  return { cls: v.cls, dims: [m, k], re, im };
}

function permsFn(args) {
  const v = args[0];
  const t = isTensor(v) || isSparse(v) ? toTensor(v) : null;
  const n = t ? t.re.length : (v.dims ? prod(v.dims) : 1);
  if (n > 11) throw E('base:perms:tooLarge', 'Maximum variable size allowed by the program is exceeded.');
  // lexicographic permutations of indices, then reversed
  const perms = [];
  const a = Array.from({ length: n }, (_, i) => i);
  const rec = (k) => {
    if (k === n) { perms.push(a.slice()); return; }
    for (let i = k; i < n; i++) {
      const b = a.slice(k);
      // generate in lexicographic order by choosing the i-th smallest remaining
      const chosen = b.slice().sort((x, y) => x - y)[i - k];
      const rest = b.filter((x) => x !== chosen);
      const save = a.slice();
      a[k] = chosen; for (let j = 0; j < rest.length; j++) a[k + 1 + j] = rest[j];
      rec(k + 1);
      for (let j = 0; j < n; j++) a[j] = save[j];
    }
  };
  if (n === 0) return tensor(t ? t.cls : 'double', [1, 0]);
  rec(0);
  perms.reverse();
  const m = perms.length;
  if (t) {
    const re = new Float64Array(m * n), im = t.im ? new Float64Array(m * n) : null;
    perms.forEach((p, i) => p.forEach((s, j) => { re[i + j * m] = t.re[s]; if (im) im[i + j * m] = t.im[s]; }));
    return { cls: t.cls, dims: [m, n], re, im };
  }
  const data = new Array(m * n);
  perms.forEach((p, i) => p.forEach((s, j) => { data[i + j * m] = v.data[s]; }));
  return { ...v, dims: [m, n], data };
}

function factorialFn(args) {
  const t = numIn(args[0], 'factorial');
  const re = Float64Array.from(t.re, (n) => {
    if (!(n >= 0) || !Number.isInteger(n)) {
      if (n === Infinity) return Infinity;
      throw E('base:factorial:NNegativeInt', 'N must be an array of real non-negative integers.');
    }
    if (n > 170) return Infinity;
    let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
  });
  return finalize(outCls(t.cls), t.dims, re);
}

// ------------------------------------------------------------- bit operations

const BITS = { int8: 8, uint8: 8, int16: 16, uint16: 16, int32: 32, uint32: 32, int64: 64, uint64: 64 };
const SIGNED = (c) => c.startsWith('int');
function bitClass(A, B, fname) {
  const ia = isIntC(A.cls), ib = isIntC(B.cls);
  if (ia && ib && A.cls !== B.cls) throw E(`base:${fname}:mixedIntegers`, 'Integers can only be combined with integers of the same class, or scalar doubles.');
  return ia ? A.cls : ib ? B.cls : A.cls === 'single' || B.cls === 'single' ? 'single' : 'double';
}
function toBig(x, cls, fname) {
  if (cls === 'double' || cls === 'single') {
    if (!(x >= 0) || !Number.isInteger(x) || x > 9007199254740991) throw E(`base:${fname}:inputRange`, 'Double inputs must have integer values in the range of ASSUMEDTYPE.');
    return BigInt(x);
  }
  return BigInt.asUintN(BITS[cls], BigInt(x));
}
function fromBig(b, cls) {
  if (cls === 'double' || cls === 'single') return Number(BigInt.asUintN(53, b));
  return Number(SIGNED(cls) ? BigInt.asIntN(BITS[cls], b) : BigInt.asUintN(BITS[cls], b));
}
function bitBinary(fname, op) {
  return (args) => {
    if (args.length < 2) throw E(`base:${fname}:notEnoughInputs`, 'Not enough input arguments.');
    const A = numIn(args[0], fname), B = numIn(args[1], fname);
    const cls = bitClass(A, B, fname);
    const r = mapReal(A, B, (x, y) => fromBig(op(toBig(x, cls, fname), toBig(y, cls, fname)), cls), fname);
    return finalize(cls === 'single' ? 'single' : cls, r.dims, r.re);
  };
}
function assumedBits(args, k, cls) {
  if (args.length > k) {
    const t = textArg(args[k]);
    if (t !== null) { if (!(t in BITS)) throw E('base:bitop:invalidType', 'ASSUMEDTYPE must be an integer type name.'); return { bits: BITS[t], cls: t }; }
    const n = dense(args[k], 'bitshift').re[0];
    return { bits: n, cls: null };
  }
  if (cls in BITS) return { bits: BITS[cls], cls };
  return { bits: 53, cls: null };
}
function bitshiftFn(args) {
  if (args.length < 2) throw E('base:bitshift:notEnoughInputs', 'Not enough input arguments.');
  const A = numIn(args[0], 'bitshift'), K = numIn(args[1], 'bitshift');
  const cls = isIntC(A.cls) ? A.cls : outCls(A.cls);
  const { bits } = assumedBits(args, 2, cls);
  const r = mapReal(A, K, (x, k) => {
    let b = toBig(x, cls, 'bitshift');
    b = k >= 0 ? b << BigInt(k) : b >> BigInt(-k);
    if (cls in BITS) return fromBig(b, cls);
    return Number(BigInt.asUintN(bits, b));
  }, 'bitshift');
  return finalize(cls, r.dims, r.re);
}
function bitcmpFn(args) {
  const A = numIn(args[0], 'bitcmp');
  const cls = isIntC(A.cls) ? A.cls : outCls(A.cls);
  const { bits } = assumedBits(args, 1, cls);
  const re = Float64Array.from(A.re, (x) => {
    const b = toBig(x, cls, 'bitcmp');
    const mask = (1n << BigInt(bits)) - 1n;
    const c = ~b & mask;
    return cls in BITS ? fromBig(c, cls) : Number(c);
  });
  return finalize(cls, A.dims, re);
}
function bitgetFn(args) {
  const A = numIn(args[0], 'bitget'), Bt = numIn(args[1], 'bitget');
  const cls = isIntC(A.cls) ? A.cls : outCls(A.cls);
  const r = mapReal(A, Bt, (x, k) => {
    if (!(k >= 1) || !Number.isInteger(k)) throw E('base:bitget:BITOutOfRange', 'BIT must be between 1 and the number of bits of the input type.');
    return Number((toBig(x, cls, 'bitget') >> BigInt(k - 1)) & 1n);
  }, 'bitget');
  return finalize(cls, r.dims, r.re);
}
function bitsetFn(args) {
  const A = numIn(args[0], 'bitset'), Bt = numIn(args[1], 'bitset');
  const V = args.length > 2 ? numIn(args[2], 'bitset') : null;
  const cls = isIntC(A.cls) ? A.cls : outCls(A.cls);
  const r = mapReal(A, Bt, (x, k) => 0, 'bitset');
  const m = mapReal(A, Bt, (x) => x, 'bitset'), kk = mapReal(A, Bt, (x, k) => k, 'bitset');
  for (let i = 0; i < r.re.length; i++) {
    const k = kk.re[i];
    if (!(k >= 1) || !Number.isInteger(k)) throw E('base:bitset:BITOutOfRange', 'BIT must be between 1 and the number of bits of the input type.');
    const v = V ? (V.re.length === 1 ? V.re[0] : V.re[i]) : 1;
    let b = toBig(m.re[i], cls, 'bitset');
    const mask = 1n << BigInt(k - 1);
    b = v ? b | mask : b & ~mask;
    r.re[i] = cls in BITS ? fromBig(b, cls) : Number(b);
  }
  return finalize(cls, r.dims, r.re);
}

// ------------------------------------------------------------- cross / dot

function crossFn(args) {
  if (args.length < 2) throw E('base:cross:notEnoughInputs', 'Not enough input arguments.');
  const A = numIn(args[0], 'cross'), B = numIn(args[1], 'cross');
  const sameSize = A.dims.length === B.dims.length && A.dims.every((x, i) => x === B.dims[i]);
  const isV3 = (t) => t.re.length === 3 && t.dims.length === 2 && (t.dims[0] === 1 || t.dims[1] === 1);
  let dim;
  if (args.length > 2) dim = dimArg(args[2], 'cross');
  else if (isV3(A) && isV3(B)) {
    const re = new Float64Array(3);
    const a = A.re, b = B.re;
    re[0] = a[1] * b[2] - a[2] * b[1]; re[1] = a[2] * b[0] - a[0] * b[2]; re[2] = a[0] * b[1] - a[1] * b[0];
    const cls = arithClass(A, B, 'cross');
    if (A.im || B.im) {
      const ar = (i) => [A.re[i], A.im ? A.im[i] : 0], br = (i) => [B.re[i], B.im ? B.im[i] : 0];
      const mul = (p, q) => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]];
      const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
      const c = [sub(mul(ar(1), br(2)), mul(ar(2), br(1))), sub(mul(ar(2), br(0)), mul(ar(0), br(2))), sub(mul(ar(0), br(1)), mul(ar(1), br(0)))];
      return finalize(cls, A.dims, Float64Array.from(c.map((x) => x[0])), Float64Array.from(c.map((x) => x[1])));
    }
    return finalize(cls, A.dims, re);
  } else {
    if (!sameSize) throw E('base:cross:InputDimsMismatch', 'A and B must be of the same size.');
    dim = A.dims.findIndex((x) => x === 3);
    if (dim < 0) throw E('base:cross:InvalidDimAorB', 'A and B must have at least one dimension of length 3.');
  }
  if (!sameSize) throw E('base:cross:InputDimsMismatch', 'A and B must be of the same size.');
  if (A.dims[dim] !== 3) throw E('base:cross:InvalidDimAorBForCrossProd', 'A and B must be of length 3 in the dimension in which the cross product is taken.');
  const { before, after } = splitDims(A.dims, dim);
  const re = new Float64Array(A.re.length);
  for (let o = 0; o < after; o++) for (let i = 0; i < before; i++) {
    const p = (k) => i + k * before + o * before * 3;
    const a = [A.re[p(0)], A.re[p(1)], A.re[p(2)]], b = [B.re[p(0)], B.re[p(1)], B.re[p(2)]];
    re[p(0)] = a[1] * b[2] - a[2] * b[1]; re[p(1)] = a[2] * b[0] - a[0] * b[2]; re[p(2)] = a[0] * b[1] - a[1] * b[0];
  }
  return finalize(arithClass(A, B, 'cross'), A.dims, re);
}

function dotFn(args) {
  if (args.length < 2) throw E('base:dot:notEnoughInputs', 'Not enough input arguments.');
  const A = numIn(args[0], 'dot'), B = numIn(args[1], 'dot');
  const isVec = (t) => t.dims.length === 2 && (t.dims[0] === 1 || t.dims[1] === 1);
  const cls = arithClass(A, B, 'dot') === 'single' ? 'single' : 'double';
  if (args.length < 3 && isVec(A) && isVec(B)) {
    if (A.re.length !== B.re.length) throw E('base:dot:InputSizeMismatch', 'A and B must be the same size.');
    let sr = 0, si = 0;
    for (let i = 0; i < A.re.length; i++) {
      const ar = A.re[i], ai = A.im ? -A.im[i] : 0, br = B.re[i], bi = B.im ? B.im[i] : 0;
      sr += ar * br - ai * bi; si += ar * bi + ai * br;
    }
    return finalize(cls, [1, 1], Float64Array.of(sr), si !== 0 ? Float64Array.of(si) : null);
  }
  if (!(A.dims.length === B.dims.length && A.dims.every((x, i) => x === B.dims[i]))) throw E('base:dot:InputSizeMismatch', 'A and B must be the same size.');
  const dim = args.length > 2 ? dimArg(args[2], 'dot') : firstNonSingleton(A.dims);
  const { before, len, after } = splitDims(A.dims, dim);
  const od = dimsWith(A.dims, dim, 1);
  const re = new Float64Array(before * after), im = A.im || B.im ? new Float64Array(before * after) : null;
  for (let o = 0; o < after; o++) for (let i = 0; i < before; i++) {
    let sr = 0, si = 0;
    for (let k = 0; k < len; k++) {
      const p = i + k * before + o * before * len;
      const ar = A.re[p], ai = A.im ? -A.im[p] : 0, br = B.re[p], bi = B.im ? B.im[p] : 0;
      sr += ar * br - ai * bi; si += ar * bi + ai * br;
    }
    re[i + o * before] = sr; if (im) im[i + o * before] = si;
  }
  return finalize(cls, od, re, im);
}

// ------------------------------------------------------------- complex parts

function complexFn(args) {
  if (args.length < 1) throw E('base:complex:notEnoughInputs', 'Not enough input arguments.');
  const A = numIn(args[0], 'complex');
  if (args.length === 1) {
    const cls = outCls(A.cls);
    const t = finalize(cls, A.dims, Float64Array.from(A.re), A.im ? Float64Array.from(A.im) : null);
    if (!t.im) t.im = new Float64Array(t.re.length); // keeps an all-zero imaginary part
    return t;
  }
  const B = numIn(args[1], 'complex');
  if (A.im || B.im) throw E('base:complex:complexInput', 'Input A and B must be real.');
  const cls = arithClass(A, B, 'complex');
  const r1 = mapReal(A, B, (x) => x, 'complex'), r2 = mapReal(A, B, (x, y) => y, 'complex');
  const t = finalize(cls, r1.dims, r1.re, r2.re);
  if (!t.im) t.im = new Float64Array(t.re.length);
  return t;
}

function log2Fn(args, nargout) {
  if (nargout >= 2) {
    const t = numIn(args[0], 'log2');
    const F = new Float64Array(t.re.length), Ex = new Float64Array(t.re.length);
    for (let i = 0; i < F.length; i++) {
      const x = t.re[i];
      if (x === 0 || !Number.isFinite(x)) { F[i] = x; Ex[i] = 0; continue; }
      let e = Math.floor(Math.log2(Math.abs(x))) + 1;
      let f = x / 2 ** e;
      if (Math.abs(f) >= 1) { f /= 2; e++; } else if (Math.abs(f) < 0.5) { f *= 2; e--; }
      F[i] = f; Ex[i] = e;
    }
    return [finalize(outCls(t.cls), t.dims, F), finalize(outCls(t.cls), t.dims, Ex)];
  }
  return unary('log2', Math.log2, cm.clog2, (x) => x < 0)(args);
}

function nthrootFn(args) {
  if (args.length < 2) throw E('base:nthroot:notEnoughInputs', 'Not enough input arguments.');
  const X = numIn(args[0], 'nthroot'), N = numIn(args[1], 'nthroot');
  if (X.im || N.im) throw E('base:nthroot:ComplexInput', 'Both X and N must be real.');
  const r = mapReal(X, N, (x, n) => {
    if (x < 0 && (n % 2 !== 1 && n % 2 !== -1)) throw E('base:nthroot:NegXNotOddIntegerN', 'If X is negative, N must be an odd integer.');
    let y = Math.sign(x) * Math.abs(x) ** (1 / n);
    // one Newton step for accuracy
    if (Number.isFinite(y) && y !== 0 && Number.isFinite(n) && n !== 0) y = y - (y ** n - x) / (n * y ** (n - 1));
    return y;
  }, 'nthroot');
  return finalize(arithClass(X, N, 'nthroot') === 'single' ? 'single' : 'double', r.dims, r.re);
}

function idivideFn(args) {
  if (args.length < 2) throw E('base:idivide:notEnoughInputs', 'Not enough input arguments.');
  const A = numIn(args[0], 'idivide'), B = numIn(args[1], 'idivide');
  if (!isIntC(A.cls) && !isIntC(B.cls)) throw E('base:idivide:InputClass', 'At least one input argument must belong to an integer class.');
  const cls = arithClass(A, B, 'idivide');
  const opt = args.length > 2 ? optArg(args[2]) : 'fix';
  const f = { fix: Math.trunc, round: roundHalfAway, floor: Math.floor, ceil: Math.ceil }[opt];
  if (!f) throw E('base:idivide:InvalidOption', "OPT must be 'fix', 'round', 'floor', or 'ceil'.");
  const toI = (t) => (isIntC(t.cls) ? t : finalize(cls, t.dims, Float64Array.from(t.re)));
  const r = mapReal(toI(A), toI(B), (x, y) => { if (y === 0) return x === 0 ? 0 : x > 0 ? Infinity : -Infinity; return f(x / y); }, 'idivide');
  return finalize(cls, r.dims, r.re);
}

function gcdFn(args, nargout) {
  if (args.length < 2) throw E('base:gcd:notEnoughInputs', 'Not enough input arguments.');
  const A = numIn(args[0], 'gcd'), B = numIn(args[1], 'gcd');
  checkIntegerValued(A, 'gcd'); checkIntegerValued(B, 'gcd');
  const cls = arithClass(A, B, 'gcd');
  if (nargout >= 2) {
    const g = mapReal(A, B, (x, y) => egcd(x, y)[0], 'gcd'), u = mapReal(A, B, (x, y) => egcd(x, y)[1], 'gcd'), v = mapReal(A, B, (x, y) => egcd(x, y)[2], 'gcd');
    return [finalize(cls, g.dims, g.re), finalize(cls, u.dims, u.re), finalize(cls, v.dims, v.re)];
  }
  const r = mapReal(A, B, gcd2, 'gcd');
  return finalize(cls, r.dims, r.re);
}
function lcmFn(args) {
  if (args.length < 2) throw E('base:lcm:notEnoughInputs', 'Not enough input arguments.');
  const A = numIn(args[0], 'lcm'), B = numIn(args[1], 'lcm');
  checkIntegerValued(A, 'lcm'); checkIntegerValued(B, 'lcm');
  for (const t of [A, B]) for (const x of t.re) if (x < 0) throw E('base:lcm:InputNotPosInt', 'Input arguments must contain positive integers.');
  const r = mapReal(A, B, (x, y) => (x === 0 || y === 0 ? 0 : (x / gcd2(x, y)) * y), 'lcm');
  return finalize(arithClass(A, B, 'lcm'), r.dims, r.re);
}

function pow2Fn(args) {
  if (args.length === 1) return unary('pow2', (x) => 2 ** x, (a, b) => cm.cexp(a * Math.LN2, b * Math.LN2))(args);
  const F = numIn(args[0], 'pow2'), Ex = numIn(args[1], 'pow2');
  const r = mapReal(F, Ex, (f, e) => f * 2 ** e, 'pow2');
  return finalize(arithClass(F, Ex, 'pow2'), r.dims, r.re);
}

function atan2Fn(args, deg) {
  const fname = deg ? 'atan2d' : 'atan2';
  if (args.length < 2) throw E(`base:${fname}:notEnoughInputs`, 'Not enough input arguments.');
  const Y = numIn(args[0], fname), X = numIn(args[1], fname);
  if (Y.im || X.im) throw E(`base:${fname}:complex`, 'Inputs must be real.');
  if (isIntC(Y.cls) || isIntC(X.cls)) throw E(`base:${fname}:invalidType`, `Check for incorrect argument data type or missing argument in call to function '${fname}'.`);
  const r = mapReal(Y, X, deg ? (y, x) => Math.atan2(y, x) / D2R : Math.atan2, fname);
  return finalize(Y.cls === 'single' || X.cls === 'single' ? 'single' : 'double', r.dims, r.re);
}

function hypotFn(args) {
  if (args.length < 2) throw E('base:hypot:notEnoughInputs', 'Not enough input arguments.');
  const A = numIn(args[0], 'hypot'), B = numIn(args[1], 'hypot');
  const absT = (t) => (t.im ? { ...t, re: Float64Array.from(t.re, (x, i) => Math.hypot(x, t.im[i])), im: null } : t);
  const r = mapReal(absT(A), absT(B), (x, y) => (x === Infinity || y === Infinity || x === -Infinity || y === -Infinity ? Infinity : Math.hypot(x, y)), 'hypot');
  return finalize(A.cls === 'single' || B.cls === 'single' ? 'single' : 'double', r.dims, r.re);
}

function realOnly(fname, fn, check, msg) {
  return (args) => {
    const t = numIn(args[0], fname);
    if (t.im) throw E(`base:${fname}:complexResult`, msg);
    for (const x of t.re) if (check(x)) throw E(`base:${fname}:complexResult`, msg);
    return finalize(outCls(t.cls), t.dims, Float64Array.from(t.re, fn));
  };
}

function absFn(args) {
  const t = numIn(args[0], 'abs');
  const cls = outCls(t.cls);
  if (t.im) return finalize(cls, t.dims, Float64Array.from(t.re, (x, i) => Math.hypot(x, t.im[i])));
  return finalize(cls, t.dims, Float64Array.from(t.re, Math.abs));
}
function signFn(args) {
  const t = numIn(args[0], 'sign');
  const cls = outCls(t.cls);
  if (t.im) {
    const re = new Float64Array(t.re.length), im = new Float64Array(t.re.length);
    for (let i = 0; i < re.length; i++) { const a = Math.hypot(t.re[i], t.im[i]); re[i] = a ? t.re[i] / a : 0; im[i] = a ? t.im[i] / a : 0; }
    return finalize(cls, t.dims, re, im);
  }
  return finalize(cls, t.dims, Float64Array.from(t.re, (x) => (x > 0 ? 1 : x < 0 ? -1 : x === 0 ? 0 : NaN)));
}
function partFn(fname, pick) {
  return (args) => {
    const t = numIn(args[0], fname);
    const cls = outCls(t.cls === 'logical' || t.cls === 'char' ? 'double' : t.cls);
    return finalize(cls, t.dims, pick(t));
  };
}
function conjFn(args) {
  const t = numIn(args[0], 'conj');
  if (!t.im) return t.cls === 'logical' || t.cls === 'char' ? finalize('double', t.dims, Float64Array.from(t.re)) : t;
  return { ...t, im: Float64Array.from(t.im, (x) => -x) };
}

function predicate(fname, test) {
  return (args) => {
    const v = args[0];
    if (v === undefined) throw E(`base:${fname}:notEnoughInputs`, 'Not enough input arguments.');
    if (!isTensor(v) && !isSparse(v)) throw E(`base:${fname}:invalidType`, `Function '${fname}' is not supported for values of class '${v.cls}'.`);
    const t = toTensor(v);
    const re = new Float64Array(t.re.length);
    for (let i = 0; i < re.length; i++) re[i] = test(t.re[i], t.im ? t.im[i] : 0) ? 1 : 0;
    return { cls: 'logical', dims: t.dims, re, im: null };
  };
}

// asind etc: degree inverses that can be complex
const degOut = (fn) => (a, b) => { fn(a, b); cm.C.re /= D2R; cm.C.im /= D2R; };

const fns = {
  exp: unary('exp', Math.exp, cm.cexp),
  expm1: unary('expm1', Math.expm1, (a, b) => { cm.cexp(a, b); cm.C.re -= 1; }),
  log: unary('log', Math.log, cm.clog, (x) => x < 0),
  log10: unary('log10', Math.log10, cm.clog10, (x) => x < 0),
  log1p: unary('log1p', Math.log1p, (a, b) => cm.clog(1 + a, b), (x) => x < -1),
  sqrt: unary('sqrt', Math.sqrt, cm.csqrt, (x) => x < 0),
  reallog: realOnly('reallog', Math.log, (x) => x < 0, 'Reallog produced complex result.'),
  realsqrt: realOnly('realsqrt', Math.sqrt, (x) => x < 0, 'Realsqrt produced complex result.'),
  sin: unary('sin', Math.sin, cm.csin),
  cos: unary('cos', Math.cos, cm.ccos),
  tan: unary('tan', Math.tan, cm.ctan),
  asin: unary('asin', Math.asin, cm.casin, (x) => x > 1 || x < -1),
  acos: unary('acos', Math.acos, cm.cacos, (x) => x > 1 || x < -1),
  atan: unary('atan', Math.atan, cm.catan),
  sec: unary('sec', (x) => 1 / Math.cos(x), (a, b) => { cm.ccos(a, b); cm.cdiv(1, 0, cm.C.re, cm.C.im); }),
  csc: unary('csc', (x) => 1 / Math.sin(x), (a, b) => { cm.csin(a, b); cm.cdiv(1, 0, cm.C.re, cm.C.im); }),
  cot: unary('cot', (x) => 1 / Math.tan(x), (a, b) => { cm.ctan(a, b); cm.cdiv(1, 0, cm.C.re, cm.C.im); }),
  asec: unary('asec', (x) => Math.acos(1 / x), viaRecip(cm.cacos), (x) => x > -1 && x < 1),
  acsc: unary('acsc', (x) => Math.asin(1 / x), viaRecip(cm.casin), (x) => x > -1 && x < 1),
  acot: unary('acot', (x) => Math.atan(1 / x), viaRecip(cm.catan)),
  sinh: unary('sinh', Math.sinh, cm.csinh),
  cosh: unary('cosh', Math.cosh, cm.ccosh),
  tanh: unary('tanh', Math.tanh, cm.ctanh),
  asinh: unary('asinh', Math.asinh, cm.casinh),
  acosh: unary('acosh', Math.acosh, cm.cacosh, (x) => x < 1),
  atanh: unary('atanh', Math.atanh, cm.catanh, (x) => x > 1 || x < -1),
  sech: unary('sech', (x) => 1 / Math.cosh(x), (a, b) => { cm.ccosh(a, b); cm.cdiv(1, 0, cm.C.re, cm.C.im); }),
  csch: unary('csch', (x) => 1 / Math.sinh(x), (a, b) => { cm.csinh(a, b); cm.cdiv(1, 0, cm.C.re, cm.C.im); }),
  coth: unary('coth', (x) => 1 / Math.tanh(x), (a, b) => { cm.ctanh(a, b); cm.cdiv(1, 0, cm.C.re, cm.C.im); }),
  asech: unary('asech', (x) => Math.acosh(1 / x), viaRecip(cm.cacosh), (x) => x < 0 || x > 1),
  acsch: unary('acsch', (x) => Math.asinh(1 / x), viaRecip(cm.casinh)),
  acoth: unary('acoth', (x) => Math.atanh(1 / x), viaRecip(cm.catanh), (x) => x > -1 && x < 1),
  sind: unary('sind', sind, (a, b) => cm.csin(a * D2R, b * D2R)),
  cosd: unary('cosd', cosd, (a, b) => cm.ccos(a * D2R, b * D2R)),
  tand: unary('tand', tand, (a, b) => cm.ctan(a * D2R, b * D2R)),
  secd: unary('secd', (x) => 1 / cosd(x), (a, b) => { cm.ccos(a * D2R, b * D2R); cm.cdiv(1, 0, cm.C.re, cm.C.im); }),
  cscd: unary('cscd', (x) => 1 / sind(x), (a, b) => { cm.csin(a * D2R, b * D2R); cm.cdiv(1, 0, cm.C.re, cm.C.im); }),
  cotd: unary('cotd', (x) => 1 / tand(x), (a, b) => { cm.ctan(a * D2R, b * D2R); cm.cdiv(1, 0, cm.C.re, cm.C.im); }),
  asind: unary('asind', (x) => Math.asin(x) / D2R, degOut(cm.casin), (x) => x > 1 || x < -1),
  acosd: unary('acosd', (x) => Math.acos(x) / D2R, degOut(cm.cacos), (x) => x > 1 || x < -1),
  atand: unary('atand', (x) => Math.atan(x) / D2R, degOut(cm.catan)),
  asecd: unary('asecd', (x) => Math.acos(1 / x) / D2R, degOut(viaRecip(cm.cacos)), (x) => x > -1 && x < 1),
  acscd: unary('acscd', (x) => Math.asin(1 / x) / D2R, degOut(viaRecip(cm.casin)), (x) => x > -1 && x < 1),
  acotd: unary('acotd', (x) => Math.atan(1 / x) / D2R, degOut(viaRecip(cm.catan))),
  deg2rad: unary('deg2rad', (x) => x * D2R, (a, b) => { cm.C.re = a * D2R; cm.C.im = b * D2R; }),
  rad2deg: unary('rad2deg', (x) => x / D2R, (a, b) => { cm.C.re = a / D2R; cm.C.im = b / D2R; }),
  atan2: (args) => atan2Fn(args, false),
  atan2d: (args) => atan2Fn(args, true),
  hypot: hypotFn,
  log2: log2Fn,
  pow2: pow2Fn,
  nthroot: nthrootFn,
  realpow(args) {
    const A = numIn(args[0], 'realpow'), B = numIn(args[1], 'realpow');
    const r = mapReal(A, B, (x, y) => { if (x < 0 && !Number.isInteger(y)) throw E('base:realpow:complexResult', 'Realpow produced complex result.'); return x ** y; }, 'realpow');
    return finalize(arithClass(A, B, 'realpow'), r.dims, r.re);
  },
  abs: absFn,
  sign: signFn,
  real: partFn('real', (t) => Float64Array.from(t.re)),
  imag: partFn('imag', (t) => (t.im ? Float64Array.from(t.im) : new Float64Array(t.re.length))),
  conj: conjFn,
  angle: (args) => { const t = numIn(args[0], 'angle'); return finalize(t.cls === 'single' ? 'single' : 'double', t.dims, Float64Array.from(t.re, (x, i) => Math.atan2(t.im ? t.im[i] : 0, x))); },
  complex: complexFn,
  isreal: (args) => { const v = args[0]; if (isTensor(v) || isSparse(v)) return bool(!v.im); return bool(v.cls === 'string' || v.cls === 'cell' ? false : !v.isObject); },
  floor: unaryKeep('floor', Math.floor),
  ceil: unaryKeep('ceil', Math.ceil),
  fix: unaryKeep('fix', Math.trunc),
  round: roundFn,
  mod: (args) => intKernel('mod', args, modf, (x, y) => (y === 0 ? x : ((x % y) + y) % y === 0 ? 0 : ((x % y) + y) % y)),
  rem: (args) => intKernel('rem', args, remf, (x, y) => (y === 0 ? 0 : x % y === 0 ? 0 : x % y)),
  idivide: idivideFn,
  gcd: gcdFn,
  lcm: lcmFn,
  factor: factorFn,
  primes(args) {
    const t = numIn(args[0], 'primes');
    const n = Math.floor(t.re[0]);
    if (!(n >= 2)) return tensor(outCls(t.cls), [1, 0]);
    const s = sieve(n);
    const out = []; for (let i = 2; i <= n; i++) if (s[i]) out.push(i);
    return finalize(outCls(t.cls), [1, out.length], Float64Array.from(out));
  },
  isprime: (args) => {
    const t = numIn(args[0], 'isprime');
    for (const x of t.re) if (x < 0 || !Number.isInteger(x)) throw E('base:isprime:InputNotPosInt', 'All entries of X must be nonnegative integers.');
    return { cls: 'logical', dims: t.dims, re: Float64Array.from(t.re, (x) => (isPrimeNum(x) ? 1 : 0)), im: null };
  },
  nchoosek: nchoosekFn,
  factorial: factorialFn,
  perms: permsFn,
  bitand: bitBinary('bitand', (a, b) => a & b),
  bitor: bitBinary('bitor', (a, b) => a | b),
  bitxor: bitBinary('bitxor', (a, b) => a ^ b),
  bitshift: bitshiftFn,
  bitcmp: bitcmpFn,
  bitget: bitgetFn,
  bitset: bitsetFn,
  cross: crossFn,
  dot: dotFn,
  isnan: predicate('isnan', (re, im) => re !== re || im !== im),
  isinf: predicate('isinf', (re, im) => re === Infinity || re === -Infinity || im === Infinity || im === -Infinity),
  isfinite: predicate('isfinite', (re, im) => Number.isFinite(re) && Number.isFinite(im)),
};
export const builtins = fns;

const H = (en, ko, syntax) => ({ en, ko, syntax });
const u = (name, en, ko) => H(en, ko, [`Y = ${name}(X)`]);
export const help = {
  exp: u('exp', 'Exponential.', '지수 함수.'),
  expm1: u('expm1', 'exp(x) - 1 accurately for small x.', '작은 x에서 정확한 exp(x) - 1.'),
  log: u('log', 'Natural logarithm (complex for negative inputs).', '자연로그 (음수는 복소수 결과).'),
  log10: u('log10', 'Common (base 10) logarithm.', '상용로그 (밑 10).'),
  log1p: u('log1p', 'log(1 + x) accurately for small x.', '작은 x에서 정확한 log(1 + x).'),
  log2: H('Base 2 logarithm and dissection of floating-point numbers.', '밑 2 로그 및 부동소수점 분해.', ['Y = log2(X)', '[F, E] = log2(X)']),
  sqrt: u('sqrt', 'Square root (complex for negative inputs).', '제곱근 (음수는 복소수 결과).'),
  reallog: u('reallog', 'Natural logarithm for nonnegative real arrays.', '음이 아닌 실수 배열의 자연로그.'),
  realsqrt: u('realsqrt', 'Square root for nonnegative real arrays.', '음이 아닌 실수 배열의 제곱근.'),
  realpow: H('Array power for real-only output.', '실수 결과만 허용하는 거듭제곱.', ['Z = realpow(X, Y)']),
  sin: u('sin', 'Sine of argument in radians.', '사인 (라디안).'),
  cos: u('cos', 'Cosine of argument in radians.', '코사인 (라디안).'),
  tan: u('tan', 'Tangent of argument in radians.', '탄젠트 (라디안).'),
  asin: u('asin', 'Inverse sine in radians.', '역사인 (라디안).'),
  acos: u('acos', 'Inverse cosine in radians.', '역코사인 (라디안).'),
  atan: u('atan', 'Inverse tangent in radians.', '역탄젠트 (라디안).'),
  sec: u('sec', 'Secant in radians.', '시컨트 (라디안).'),
  csc: u('csc', 'Cosecant in radians.', '코시컨트 (라디안).'),
  cot: u('cot', 'Cotangent in radians.', '코탄젠트 (라디안).'),
  asec: u('asec', 'Inverse secant in radians.', '역시컨트 (라디안).'),
  acsc: u('acsc', 'Inverse cosecant in radians.', '역코시컨트 (라디안).'),
  acot: u('acot', 'Inverse cotangent in radians.', '역코탄젠트 (라디안).'),
  sinh: u('sinh', 'Hyperbolic sine.', '쌍곡사인.'),
  cosh: u('cosh', 'Hyperbolic cosine.', '쌍곡코사인.'),
  tanh: u('tanh', 'Hyperbolic tangent.', '쌍곡탄젠트.'),
  asinh: u('asinh', 'Inverse hyperbolic sine.', '역쌍곡사인.'),
  acosh: u('acosh', 'Inverse hyperbolic cosine.', '역쌍곡코사인.'),
  atanh: u('atanh', 'Inverse hyperbolic tangent.', '역쌍곡탄젠트.'),
  sech: u('sech', 'Hyperbolic secant.', '쌍곡시컨트.'),
  csch: u('csch', 'Hyperbolic cosecant.', '쌍곡코시컨트.'),
  coth: u('coth', 'Hyperbolic cotangent.', '쌍곡코탄젠트.'),
  asech: u('asech', 'Inverse hyperbolic secant.', '역쌍곡시컨트.'),
  acsch: u('acsch', 'Inverse hyperbolic cosecant.', '역쌍곡코시컨트.'),
  acoth: u('acoth', 'Inverse hyperbolic cotangent.', '역쌍곡코탄젠트.'),
  sind: u('sind', 'Sine of argument in degrees (exact at multiples of 90).', '사인 (도 단위, 90의 배수에서 정확).'),
  cosd: u('cosd', 'Cosine of argument in degrees.', '코사인 (도 단위).'),
  tand: u('tand', 'Tangent of argument in degrees.', '탄젠트 (도 단위).'),
  secd: u('secd', 'Secant of argument in degrees.', '시컨트 (도 단위).'),
  cscd: u('cscd', 'Cosecant of argument in degrees.', '코시컨트 (도 단위).'),
  cotd: u('cotd', 'Cotangent of argument in degrees.', '코탄젠트 (도 단위).'),
  asind: u('asind', 'Inverse sine in degrees.', '역사인 (도 단위).'),
  acosd: u('acosd', 'Inverse cosine in degrees.', '역코사인 (도 단위).'),
  atand: u('atand', 'Inverse tangent in degrees.', '역탄젠트 (도 단위).'),
  asecd: u('asecd', 'Inverse secant in degrees.', '역시컨트 (도 단위).'),
  acscd: u('acscd', 'Inverse cosecant in degrees.', '역코시컨트 (도 단위).'),
  acotd: u('acotd', 'Inverse cotangent in degrees.', '역코탄젠트 (도 단위).'),
  deg2rad: u('deg2rad', 'Convert angle from degrees to radians.', '각도를 도에서 라디안으로 변환.'),
  rad2deg: u('rad2deg', 'Convert angle from radians to degrees.', '각도를 라디안에서 도로 변환.'),
  atan2: H('Four-quadrant inverse tangent.', '4사분면 역탄젠트.', ['P = atan2(Y, X)']),
  atan2d: H('Four-quadrant inverse tangent in degrees.', '4사분면 역탄젠트 (도 단위).', ['D = atan2d(Y, X)']),
  hypot: H('Square root of sum of squares (no overflow).', '제곱합의 제곱근 (오버플로 없음).', ['C = hypot(A, B)']),
  pow2: H('Base 2 power and scaling.', '2의 거듭제곱 및 스케일링.', ['Y = pow2(E)', 'X = pow2(F, E)']),
  nthroot: H('Real n-th root of real numbers.', '실수의 실수 n제곱근.', ['Y = nthroot(X, N)']),
  abs: u('abs', 'Absolute value and complex magnitude.', '절댓값 및 복소수 크기.'),
  sign: u('sign', 'Sign function (signum).', '부호 함수.'),
  real: u('real', 'Real part of a complex number.', '복소수의 실수부.'),
  imag: u('imag', 'Imaginary part of a complex number.', '복소수의 허수부.'),
  conj: u('conj', 'Complex conjugate.', '켤레 복소수.'),
  angle: u('angle', 'Phase angle.', '위상각.'),
  complex: H('Create a complex array (keeps a zero imaginary part).', '복소수 배열 생성 (0 허수부 유지).', ['z = complex(a, b)', 'z = complex(x)']),
  isreal: H('True for a real array (no imaginary storage).', '실수 배열이면 참 (허수부 없음).', ['TF = isreal(A)']),
  floor: u('floor', 'Round toward negative infinity.', '음의 무한대 방향으로 내림.'),
  ceil: u('ceil', 'Round toward positive infinity.', '양의 무한대 방향으로 올림.'),
  fix: u('fix', 'Round toward zero.', '0 방향으로 버림.'),
  round: H('Round to nearest integer, or to n digits.', '가장 가까운 정수 또는 n자리로 반올림.', ['Y = round(X)', 'Y = round(X, n)', "Y = round(X, n, 'significant')"]),
  mod: H('Remainder after division (modulo), sign of divisor.', '나눗셈 나머지 (모듈로), 제수의 부호.', ['b = mod(a, m)']),
  rem: H('Remainder after division, sign of dividend.', '나눗셈 나머지, 피제수의 부호.', ['r = rem(a, b)']),
  idivide: H('Integer division with rounding option.', '반올림 옵션이 있는 정수 나눗셈.', ['C = idivide(A, B)', "C = idivide(A, B, 'floor')"]),
  gcd: H('Greatest common divisor.', '최대공약수.', ['G = gcd(A, B)', '[G, U, V] = gcd(A, B)']),
  lcm: H('Least common multiple.', '최소공배수.', ['L = lcm(A, B)']),
  factor: H('Prime factors.', '소인수.', ['f = factor(n)']),
  primes: H('Prime numbers less than or equal to n.', 'n 이하의 소수.', ['p = primes(n)']),
  isprime: H('Determine which elements are prime.', '소수인 원소 판별.', ['TF = isprime(X)']),
  nchoosek: H('Binomial coefficient or all combinations.', '이항 계수 또는 모든 조합.', ['b = nchoosek(n, k)', 'C = nchoosek(v, k)']),
  factorial: u('factorial', 'Factorial of input.', '계승 (팩토리얼).'),
  perms: H('All possible permutations (reverse lexicographic order).', '모든 순열 (역 사전 순).', ['P = perms(v)']),
  bitand: H('Bit-wise AND.', '비트 AND.', ['C = bitand(A, B)']),
  bitor: H('Bit-wise OR.', '비트 OR.', ['C = bitor(A, B)']),
  bitxor: H('Bit-wise XOR.', '비트 XOR.', ['C = bitxor(A, B)']),
  bitshift: H('Shift bits by K positions.', '비트를 K 자리 이동.', ['C = bitshift(A, k)', 'C = bitshift(A, k, assumedtype)']),
  bitcmp: H('Bit-wise complement.', '비트 보수.', ['C = bitcmp(A)', 'C = bitcmp(A, assumedtype)']),
  bitget: H('Get bit at a position.', '지정 위치의 비트 얻기.', ['b = bitget(A, bit)']),
  bitset: H('Set bit at a position.', '지정 위치의 비트 설정.', ['C = bitset(A, bit)', 'C = bitset(A, bit, V)']),
  cross: H('Cross product.', '외적 (벡터곱).', ['C = cross(A, B)', 'C = cross(A, B, dim)']),
  dot: H('Dot product.', '내적 (스칼라곱).', ['C = dot(A, B)', 'C = dot(A, B, dim)']),
  isnan: u('isnan', 'True for Not-a-Number elements.', 'NaN 원소이면 참.'),
  isinf: u('isinf', 'True for infinite elements.', '무한대 원소이면 참.'),
  isfinite: u('isfinite', 'True for finite elements.', '유한 원소이면 참.'),
};
