// Local mini library of the simulation expression evaluator: fast real
// element-wise math, constants and a few array functions used by block
// parameters and Fcn blocks. Anything it does not handle returns NOT_LOCAL and
// the evaluator forwards the call to ctx.call (the full session library).
import { tensor, num, bool, isTensor, isChar, prod, str, toStr } from '../../value.js';
import { NOT_LOCAL } from './interp.js';


const real = (v) => v && isTensor(v) && !v.im && !isChar(v);
const T = (dims, re) => tensor('double', dims, re);
function u1(f, domain) {
  return (args, nargout, it) => {
    const a = args[0];
    if (args.length !== 1 || !real(a)) return NOT_LOCAL;
    const re = new Float64Array(a.re.length);
    for (let i = 0; i < re.length; i++) { const x = a.re[i]; if (domain && !domain(x)) return NOT_LOCAL; re[i] = f(x); }
    return T(a.dims.slice(), re);
  };
}
function b2(f) {
  return (args, nargout, it) => {
    const [a, b] = args;
    if (args.length !== 2 || !real(a) || !real(b)) return NOT_LOCAL;
    const na = a.re.length, nb = b.re.length;
    if (na !== nb && na !== 1 && nb !== 1) return NOT_LOCAL;
    const n = Math.max(na, nb);
    const re = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = f(na === 1 ? a.re[0] : a.re[i], nb === 1 ? b.re[0] : b.re[i]);
    return T((na >= nb ? a : b).dims.slice(), re);
  };
}
const konst = (x) => (args, nargout, it) => (args.length ? NOT_LOCAL : num(x));
function reduce(f, init) {
  return (args, nargout, it) => {
    const a = args[0];
    if (args.length !== 1 || !real(a) || a.dims.length !== 2 || (a.dims[0] !== 1 && a.dims[1] !== 1)) return NOT_LOCAL;
    let s = init; for (let i = 0; i < a.re.length; i++) s = f(s, a.re[i]);
    return num(s);
  };
}
function sizeArgs(args) {
  if (!args.length) return [1, 1];
  if (args.length === 1) { const a = args[0]; if (!real(a)) return null; return a.re.length === 1 ? [a.re[0], a.re[0]] : Array.from(a.re); }
  if (!args.every((a) => real(a) && a.re.length === 1)) return null;
  return args.map((a) => a.re[0]);
}
const fill = (x) => (args, nargout, it) => { const d = sizeArgs(args); if (!d || d.some((v) => !(v >= 0) || !Number.isInteger(v))) return NOT_LOCAL; const t = T(d, new Float64Array(prod(d))); if (x) t.re.fill(x); return t; };
const mod = (a, b) => (b === 0 ? a : a - Math.floor(a / b) * b);
const rem = (a, b) => (b === 0 ? a : a - Math.trunc(a / b) * b);
const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : x);
const roundHalfAway = (x) => (x < 0 ? -Math.round(-x) : Math.round(x));

export const LIB = {
  sin: u1(Math.sin), cos: u1(Math.cos), tan: u1(Math.tan), asin: u1(Math.asin, (x) => x >= -1 && x <= 1), acos: u1(Math.acos, (x) => x >= -1 && x <= 1),
  atan: u1(Math.atan), sinh: u1(Math.sinh), cosh: u1(Math.cosh), tanh: u1(Math.tanh), asinh: u1(Math.asinh), acosh: u1(Math.acosh, (x) => x >= 1), atanh: u1(Math.atanh, (x) => x >= -1 && x <= 1),
  exp: u1(Math.exp), log: u1(Math.log, (x) => x >= 0 || Number.isNaN(x)), log10: u1(Math.log10, (x) => x >= 0 || Number.isNaN(x)), log2: u1(Math.log2, (x) => x >= 0 || Number.isNaN(x)),
  sqrt: u1(Math.sqrt, (x) => x >= 0 || Number.isNaN(x)), abs: u1(Math.abs), floor: u1(Math.floor), ceil: u1(Math.ceil), fix: u1(Math.trunc), round: u1(roundHalfAway), sign: u1(sign),
  log1p: u1(Math.log1p, (x) => x >= -1), expm1: u1(Math.expm1), cbrt: u1(Math.cbrt), nthroot: null,
  atan2: b2(Math.atan2), hypot: b2(Math.hypot), mod: b2(mod), rem: b2(rem), power: b2((a, b) => a ** b),
  pi: konst(Math.PI), Inf: konst(Infinity), inf: konst(Infinity), NaN: konst(NaN), nan: konst(NaN), eps: (args, n, it) => (args.length ? NOT_LOCAL : num(2.220446049250313e-16)),
  true: (args, n, it) => (args.length ? NOT_LOCAL : bool(true)), false: (args, n, it) => (args.length ? NOT_LOCAL : bool(false)),
  zeros: fill(0), ones: fill(1),
  sum: reduce((s, x) => s + x, 0), prod: reduce((s, x) => s * x, 1),
  numel: (args, n, it) => (args.length === 1 && args[0] && args[0].dims ? num(prod(args[0].dims)) : NOT_LOCAL),
  length: (args, n, it) => (args.length === 1 && args[0] && args[0].dims ? num(prod(args[0].dims) === 0 ? 0 : Math.max(...args[0].dims)) : NOT_LOCAL),
  isempty: (args, n, it) => (args.length === 1 && args[0] && args[0].dims ? bool(prod(args[0].dims) === 0) : NOT_LOCAL),
  min: (args, n, it) => (args.length === 2 && n <= 1 ? b2((a, b) => (Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.min(a, b)))(args, n, it) : args.length === 1 && n <= 1 ? reduce((s, x) => (x < s || Number.isNaN(s) ? x : s), NaN)(args, n, it) : NOT_LOCAL),
  max: (args, n, it) => (args.length === 2 && n <= 1 ? b2((a, b) => (Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.max(a, b)))(args, n, it) : args.length === 1 && n <= 1 ? reduce((s, x) => (x > s || Number.isNaN(s) ? x : s), NaN)(args, n, it) : NOT_LOCAL),
  double: (args, n, it) => (args.length === 1 && args[0] && isTensor(args[0]) ? tensor('double', args[0].dims.slice(), Float64Array.from(args[0].re), args[0].im ? Float64Array.from(args[0].im) : null) : NOT_LOCAL),
  num2str: (args, n, it) => (args.length === 1 && real(args[0]) && args[0].re.length === 1 ? str(String(Number(args[0].re[0].toPrecision(5)))) : NOT_LOCAL),
  disp: (args, n, it) => { if (args.length !== 1) return NOT_LOCAL; const a = args[0]; if (isChar(a)) { it.out(toStr(a) + '\n'); return undefined; } return NOT_LOCAL; },
};
delete LIB.nthroot;
