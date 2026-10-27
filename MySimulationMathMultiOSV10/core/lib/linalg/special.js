// Special functions: gamma family (gamma, gammaln, gammainc, gammaincinv,
// psi), beta family (beta, betaln, betainc, betaincinv), error functions
// (erf, erfc, erfcx, erfinv, erfcinv), expint, Bessel functions (besselj,
// bessely, besseli, besselk, besselh), airy, legendre, ellipke, ellipj.
// Elementwise with implicit expansion. Real arguments (Bessel and Airy return
// complex values for negative arguments).
import { EPS, fail, out, optText, scal, intArg, H, dbl, resultCls } from './util.js';
import { broadcastDims, prod } from '../../value.js';

const PI = Math.PI;
const SQRTPI = Math.sqrt(PI);
const EULER = 0.5772156649015329;
const FPMIN = 1e-300;

// ---------------------------------------------------------------- elementwise driver

/**
 * Elementwise evaluation with implicit expansion. fn(...xs) returns a number,
 * [re, im] (complex) or, with nout > 1, an array of numbers / [re, im].
 */
function ew(fnName, vals, fn, nout = 1, { allowComplex = false } = {}) {
  const ts = vals.map((v, i) => {
    const t = dbl(v, fnName, `Argument ${i + 1}`);
    if (t.im && !allowComplex) {
      let any = false; for (const x of t.im) if (x !== 0) { any = true; break; }
      if (any) fail(`${fnName}:complexArg`, `Input arguments of ${fnName} must be real.`);
    }
    return t;
  });
  let dims = ts[0].dims;
  try { for (let i = 1; i < ts.length; i++) dims = broadcastDims(dims, ts[i].dims); }
  catch { fail(`${fnName}:sizeMismatch`, 'Arguments must be the same size or have compatible sizes.'); }
  const n = prod(dims);
  const outs = Array.from({ length: nout }, () => ({ re: new Float64Array(n), im: null }));
  const strides = ts.map((t) => {
    const d = t.dims.slice(); while (d.length < dims.length) d.push(1);
    const st = []; let s = 1; for (let k = 0; k < d.length; k++) { st.push(d[k] === 1 ? 0 : s); s *= d[k]; }
    return st;
  });
  const sub = new Array(dims.length).fill(0);
  const xs = new Array(ts.length);
  for (let k = 0; k < n; k++) {
    for (let a = 0; a < ts.length; a++) { let off = 0; for (let d = 0; d < dims.length; d++) off += sub[d] * strides[a][d]; xs[a] = ts[a].re[off]; }
    let r = fn(...xs);
    if (nout === 1) r = [r];
    for (let o = 0; o < nout; o++) {
      const v = r[o];
      if (Array.isArray(v)) {
        outs[o].re[k] = v[0];
        if (v[1] !== 0) { if (!outs[o].im) outs[o].im = new Float64Array(n); outs[o].im[k] = v[1]; }
      } else outs[o].re[k] = v;
    }
    for (let d = 0; d < dims.length; d++) { if (++sub[d] < dims[d]) break; sub[d] = 0; }
  }
  const cls = resultCls(...vals);
  const res = outs.map((o) => out(dims, o.re, o.im, cls));
  return nout === 1 ? res[0] : res;
}

// ---------------------------------------------------------------- gamma

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
const FACT = [1]; for (let i = 1; i <= 170; i++) FACT.push(FACT[i - 1] * i);

export function gammaFn(x) {
  if (Number.isNaN(x)) return NaN;
  if (x === Infinity) return Infinity;
  if (x === -Infinity) return NaN;
  if (Number.isInteger(x)) {
    if (x <= 0) return x === 0 && 1 / x < 0 ? -Infinity : Infinity;
    if (x <= 171) return FACT[x - 1];
    return Infinity;
  }
  if (x < 0.5) return PI / (Math.sin(PI * x) * gammaFn(1 - x));
  if (x > 171.7) return Infinity;
  const z = x - 1;
  let a = LANCZOS[0]; const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (z + i);
  // split the power to avoid overflow for large x
  const p = Math.pow(t, (z + 0.5) / 2);
  return Math.sqrt(2 * PI) * p * (p * Math.exp(-t)) * a;
}
export function gammaln(x) {
  if (Number.isNaN(x)) return NaN;
  if (x <= 0) return x === 0 ? Infinity : NaN;
  if (x === Infinity) return Infinity;
  if (x === 1 || x === 2) return 0;
  if (x < 12) return Math.log(Math.abs(gammaFn(x)));
  const r = 1 / x, r2 = r * r;
  const series = r * (1 / 12 - r2 * (1 / 360 - r2 * (1 / 1260 - r2 * (1 / 1680 - r2 * (1 / 1188 - r2 * (691 / 360360 - r2 / 156))))));
  return (x - 0.5) * Math.log(x) - x + 0.5 * Math.log(2 * PI) + series;
}
const lgam = (x) => (x > 0 ? gammaln(x) : Math.log(Math.abs(gammaFn(x))));

/** Regularized incomplete gamma: returns {p, q} (lower, upper) and scaled variants. */
function incgamma(x, a) {
  if (Number.isNaN(x) || Number.isNaN(a)) return { p: NaN, q: NaN, sp: NaN, sq: NaN };
  if (a === 0) return { p: x > 0 ? 1 : x === 0 ? 0 : NaN, q: x > 0 ? 0 : 1, sp: NaN, sq: NaN };
  if (x === 0) return { p: 0, q: 1, sp: 1, sq: Infinity };
  if (x === Infinity) return { p: 1, q: 0, sp: Infinity, sq: 0 };
  const logPre = -x + a * Math.log(x) - gammaln(a); // log(x^a e^-x / Gamma(a))
  const scaleLog = gammaln(a + 1) + x - a * Math.log(x); // log(Gamma(a+1) e^x / x^a)
  const maxit = 100000;
  if (x < a + 1) {
    let ap = a, del = 1 / a, sum = del;
    for (let i = 0; i < maxit; i++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-17) break; }
    const p = sum * Math.exp(logPre);
    const sp = sum * a;
    const q = 1 - p;
    return { p, q, sp, sq: q * Math.exp(scaleLog) };
  }
  let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i < maxit; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  const q = Math.exp(logPre) * h;
  const p = 1 - q;
  return { p, q, sp: p * Math.exp(scaleLog), sq: h * a };
}

function gammaincinvScalar(y, a, upper) {
  if (Number.isNaN(y) || Number.isNaN(a) || y < 0 || y > 1 || a < 0) return NaN;
  const p = upper ? 1 - y : y;
  if ((upper ? y === 1 : y === 0)) return 0;
  if ((upper ? y === 0 : y === 1)) return Infinity;
  if (a === 0) return 0;
  const a1 = a - 1, gln = gammaln(a);
  let x, lna1 = 0, afac = 0;
  if (a > 1) {
    lna1 = Math.log(a1); afac = Math.exp(a1 * (lna1 - 1) - gln);
    const pp = p < 0.5 ? p : 1 - p;
    const t = Math.sqrt(-2 * Math.log(Math.max(pp, 1e-300)));
    x = (2.30753 + t * 0.27061) / (1 + t * (0.99229 + t * 0.04481)) - t;
    if (p < 0.5) x = -x;
    x = Math.max(1e-3, a * Math.pow(1 - 1 / (9 * a) - x / (3 * Math.sqrt(a)), 3));
  } else {
    const t = 1 - a * (0.253 + a * 0.12);
    x = p < t ? Math.pow(p / t, 1 / a) : 1 - Math.log(1 - (p - t) / (1 - t));
  }
  for (let j = 0; j < 100; j++) {
    if (x <= 0) return 0;
    const g = incgamma(x, a);
    const err = upper ? -(g.q - y) : g.p - y;
    const t = a > 1 ? afac * Math.exp(-(x - a1) + a1 * (Math.log(x) - lna1)) : Math.exp(-x + a1 * Math.log(x) - gln);
    if (t === 0 || !Number.isFinite(t)) break;
    const u = err / t;
    let dx = u / (1 - 0.5 * Math.min(1, u * ((a - 1) / x - 1)));
    let xn = x - dx;
    if (xn <= 0) xn = 0.5 * x;
    dx = x - xn; x = xn;
    if (Math.abs(dx) < 1e-15 * x) break;
  }
  return x;
}

export function psiFn(x) {
  if (Number.isNaN(x)) return NaN;
  if (x === Infinity) return Infinity;
  if (x <= 0 && Number.isInteger(x)) return x === 0 ? -Infinity : NaN;
  if (x < 0) return psiFn(1 - x) - PI / Math.tan(PI * x);
  let r = 0;
  while (x < 10) { r -= 1 / x; x += 1; }
  const f = 1 / (x * x);
  const t = f * (-1 / 12 + f * (1 / 120 + f * (-1 / 252 + f * (1 / 240 + f * (-1 / 132 + f * (691 / 32760 + f * (-1 / 12)))))));
  return r + Math.log(x) - 0.5 / x + t;
}
const BERN = [1 / 6, -1 / 30, 1 / 42, -1 / 30, 5 / 66, -691 / 2730, 7 / 6, -3617 / 510, 43867 / 798, -174611 / 330];
export function polygamma(k, x) {
  if (k === 0) return psiFn(x);
  if (Number.isNaN(x)) return NaN;
  if (x <= 0 && Number.isInteger(x)) return Infinity;
  if (x <= 0) return NaN;
  const sgn = k % 2 ? 1 : -1;
  let s = 0;
  const lim = Math.max(20, k + 10);
  while (x < lim) { s += 1 / Math.pow(x, k + 1); x += 1; }
  const kf = FACT[k] ?? gammaFn(k + 1);
  let t = FACT[k - 1] / Math.pow(x, k) + kf / (2 * Math.pow(x, k + 1));
  for (let j = 1; j <= BERN.length; j++) {
    const term = BERN[j - 1] * gammaFn(2 * j + k) / (FACT[2 * j] * Math.pow(x, 2 * j + k));
    t += term;
    if (Math.abs(term) < 1e-17 * Math.abs(t)) break;
  }
  return sgn * (kf * s + t);
}

// ---------------------------------------------------------------- beta

function betaln(a, b) { return gammaln(a) + gammaln(b) - gammaln(a + b); }
function betaFn(a, b) {
  if (a > 0 && b > 0) {
    if (a + b < 171 && Number.isInteger(a) && Number.isInteger(b)) return gammaFn(a) * gammaFn(b) / gammaFn(a + b);
    return Math.exp(betaln(a, b));
  }
  return gammaFn(a) * gammaFn(b) / gammaFn(a + b);
}
function betacf(a, b, x) {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d; let h = d;
  for (let m = 1; m <= 100000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return h;
}
/** Regularized incomplete beta I_x(a, b) (upper = 1 - I). */
function betainc(x, a, b, upper = false) {
  if (Number.isNaN(x) || Number.isNaN(a) || Number.isNaN(b)) return NaN;
  if (x < 0 || x > 1) return NaN;
  if (a === 0 && b === 0) return NaN;
  if (a === 0) return upper ? 0 : 1;
  if (b === 0) return upper ? (x === 1 ? 0 : 1) : (x === 1 ? 1 : 0);
  if (x === 0) return upper ? 1 : 0;
  if (x === 1) return upper ? 0 : 1;
  const lbt = -betaln(a, b) + a * Math.log(x) + b * Math.log1p(-x);
  const bt = Math.exp(lbt);
  if (x < (a + 1) / (a + b + 2)) {
    const lo = (bt * betacf(a, b, x)) / a;
    return upper ? 1 - lo : lo;
  }
  const up = (bt * betacf(b, a, 1 - x)) / b;
  return upper ? up : 1 - up;
}
function betaincinv(y, a, b, upper = false) {
  if (Number.isNaN(y) || y < 0 || y > 1 || !(a > 0) || !(b > 0)) return NaN;
  const target = y;
  const F = (x) => betainc(x, a, b, upper) - target;
  const sgn = upper ? -1 : 1;
  if (y === 0) return upper ? 1 : 0;
  if (y === 1) return upper ? 0 : 1;
  let lo = 0, hi = 1;
  // initial guess (NR)
  let x;
  const p = upper ? 1 - y : y;
  if (a >= 1 && b >= 1) {
    const pp = p < 0.5 ? p : 1 - p;
    const t = Math.sqrt(-2 * Math.log(pp));
    let z = (2.30753 + t * 0.27061) / (1 + t * (0.99229 + t * 0.04481)) - t;
    if (p < 0.5) z = -z;
    const al = (z * z - 3) / 6, h = 2 / (1 / (2 * a - 1) + 1 / (2 * b - 1));
    const w = (z * Math.sqrt(al + h)) / h - (1 / (2 * b - 1) - 1 / (2 * a - 1)) * (al + 5 / 6 - 2 / (3 * h));
    x = a / (a + b * Math.exp(2 * w));
  } else {
    const lna = Math.log(a / (a + b)), lnb = Math.log(b / (a + b));
    const t = Math.exp(a * lna) / a, u = Math.exp(b * lnb) / b, w = t + u;
    x = p < t / w ? Math.pow(a * w * p, 1 / a) : 1 - Math.pow(b * w * (1 - p), 1 / b);
  }
  if (!(x > 0 && x < 1)) x = 0.5;
  const lb = betaln(a, b);
  for (let it = 0; it < 300; it++) {
    const f = F(x);
    if (f === 0) return x;
    if (sgn * f < 0) lo = x; else hi = x;
    const dens = Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log1p(-x) - lb);
    let xn = x - f / (sgn * dens);
    if (!(xn > lo && xn < hi) || !Number.isFinite(xn)) xn = 0.5 * (lo + hi);
    if (Math.abs(xn - x) <= 1e-16 * Math.max(x, 1e-300) || hi - lo < 1e-300) return xn;
    x = xn;
  }
  return x;
}

// ---------------------------------------------------------------- error functions

function erfSeries(x) {
  // erf(x) = 2x/sqrt(pi) exp(-x^2) sum (2x^2)^n / (1*3*...*(2n+1))
  const x2 = x * x; let term = 1, sum = 1;
  for (let n = 1; n < 500; n++) { term *= (2 * x2) / (2 * n + 1); sum += term; if (term < 1e-17 * sum) break; }
  return ((2 * x) / SQRTPI) * Math.exp(-x2) * sum;
}
/** erfcx(x) = exp(x^2) erfc(x) for x >= 0.5 by continued fraction. */
function erfcxCF(x) {
  // erfc(x) = exp(-x^2)/sqrt(pi) * 1/(x + (1/2)/(x + 1/(x + (3/2)/(x + ...))))
  let f = x, C = x, D = 0;
  for (let k = 1; k < 5000; k++) {
    const ak = k / 2;
    D = x + ak * D; if (D === 0) D = FPMIN;
    C = x + ak / C; if (C === 0) C = FPMIN;
    D = 1 / D; const del = C * D; f *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return 1 / (SQRTPI * f);
}
export function erfFn(x) {
  if (Number.isNaN(x)) return NaN;
  const ax = Math.abs(x);
  if (ax < 1.5) return erfSeries(x);
  if (ax > 6) return Math.sign(x);
  const v = 1 - Math.exp(-ax * ax) * erfcxCF(ax);
  return x < 0 ? -v : v;
}
export function erfcFn(x) {
  if (Number.isNaN(x)) return NaN;
  if (x < 0.5) return 1 - erfFn(x);
  if (x > 27.3) return 0;
  return Math.exp(-x * x) * erfcxCF(x);
}
export function erfcxFn(x) {
  if (Number.isNaN(x)) return NaN;
  if (x >= 0.5) return x > 1e8 ? 1 / (SQRTPI * x) : erfcxCF(x);
  if (x < -26.7) return Infinity;
  return Math.exp(x * x) * erfcFn(x);
}
/** erfcinv for 0 < y <= 1 (x >= 0) by Newton on log(erfc). */
function erfcinvSmall(y) {
  let x = y > 0.5 ? Math.sqrt(PI) / 2 * (1 - y) : Math.sqrt(Math.max(0.1, -Math.log(y * Math.sqrt(PI) * Math.sqrt(Math.max(1e-300, -Math.log(y))))));
  if (y >= 0.5) {
    // small x: Newton on erfc directly
    for (let i = 0; i < 60; i++) {
      const f = erfcFn(x) - y; const d = (-2 / SQRTPI) * Math.exp(-x * x);
      const dx = f / d; x -= dx; if (Math.abs(dx) <= 1e-16 * Math.max(Math.abs(x), 1e-300)) break;
    }
    return x;
  }
  const ly = Math.log(y);
  for (let i = 0; i < 100; i++) {
    const ex = erfcxFn(x);
    const g = Math.log(ex) - x * x - ly;
    const gp = -2 / (SQRTPI * ex); // d/dx log(erfc(x))
    const dx = g / gp;
    x -= dx;
    if (Math.abs(dx) <= 2e-16 * x) break;
  }
  return x;
}
export function erfcinvFn(y) {
  if (Number.isNaN(y) || y < 0 || y > 2) return NaN;
  if (y === 0) return Infinity;
  if (y === 2) return -Infinity;
  if (y === 1) return 0;
  if (y > 1) return -erfcinvSmall(2 - y);
  return erfcinvSmall(y);
}
export function erfinvFn(x) {
  if (Number.isNaN(x) || x < -1 || x > 1) return NaN;
  if (x === 1) return Infinity;
  if (x === -1) return -Infinity;
  if (x === 0) return 0;
  const ax = Math.abs(x);
  let r;
  if (ax <= 0.5) {
    r = (SQRTPI / 2) * (ax + (PI / 12) * ax * ax * ax);
    for (let i = 0; i < 50; i++) {
      const f = erfFn(r) - ax; const d = (2 / SQRTPI) * Math.exp(-r * r);
      const dx = f / d; r -= dx; if (Math.abs(dx) <= 1e-16 * r) break;
    }
  } else r = erfcinvSmall(1 - ax);
  return x < 0 ? -r : r;
}

// ---------------------------------------------------------------- exponential integral

function expintE1(x) {
  // returns [re, im]
  if (Number.isNaN(x)) return [NaN, 0];
  if (x === 0) return [Infinity, 0];
  if (x === Infinity) return [0, 0];
  if (x > 0) {
    if (x <= 1) {
      let sum = 0, term = 1;
      for (let k = 1; k < 200; k++) { term *= -x / k; const t = term / k; sum += t; if (Math.abs(t) < 1e-17 * Math.abs(sum)) break; }
      return [-EULER - Math.log(x) - sum, 0];
    }
    // continued fraction (Lentz)
    let b = x + 1, c = 1 / FPMIN, d = 1 / b, h = d;
    for (let i = 1; i < 10000; i++) {
      const an = -i * i; b += 2;
      d = 1 / (an * d + b); c = b + an / c;
      const del = c * d; h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    return [h * Math.exp(-x), 0];
  }
  // x < 0: E1(x) = -Ei(-x) - i*pi
  const t = -x;
  let ei;
  if (t < 40) {
    let sum = 0, term = 1;
    for (let k = 1; k < 500; k++) { term *= t / k; const s = term / k; sum += s; if (s < 1e-17 * sum) break; }
    ei = EULER + Math.log(t) + sum;
  } else {
    let sum = 1, term = 1;
    for (let k = 1; k < 40; k++) { const nt = (term * k) / t; if (nt > term) break; term = nt; sum += term; if (term < 1e-17) break; }
    ei = (Math.exp(t) / t) * sum;
  }
  return [-ei, -PI];
}

// ---------------------------------------------------------------- Bessel functions (Temme / Steed)

const sinpi = (v) => { const r = v % 2; if (Number.isInteger(2 * v)) { return [0, 1, 0, -1][((Math.round(2 * r) % 4) + 4) % 4]; } return Math.sin(PI * r); };
const cospi = (v) => sinpi(v + 0.5);

/** 1/Gamma(1+mu) and 1/Gamma(1-mu) based gam1, gam2 for |mu| <= 1/2. */
const RG = [1, 0.5772156649015329, -0.6558780715202538, -0.0420026350340952, 0.1665386113822915, -0.0421977345555443, -0.0096219715278770, 0.0072189432466630, -0.0011651675918591, -0.0002152416741149, 0.0001280502823882, -0.0000201348547807, -0.0000012504934821, 0.0000011330272320, -0.0000002056338417, 0.0000000061160950, 0.0000000050020075, -0.0000000011812746, 0.0000000001043427, 0.0000000000077823, -0.0000000000036968, 0.0000000000005100, -0.0000000000000206, -0.0000000000000054, 0.0000000000000014, 0.0000000000000001];
function gamTemme(mu) {
  const gp = 1 / gammaFn(1 + mu), gm = 1 / gammaFn(1 - mu);
  let gam1;
  if (Math.abs(mu) < 0.15) {
    // gam1 = -(a2 + a4 mu^2 + a6 mu^4 + ...)
    let s = 0, m2 = 1; const mu2 = mu * mu;
    for (let k = 1; k < RG.length; k += 2) { s += RG[k] * m2; m2 *= mu2; }
    gam1 = -s;
  } else gam1 = (gm - gp) / (2 * mu);
  const gam2 = (gm + gp) / 2;
  return { gam1, gam2, gampl: gp, gammi: gm };
}

/** J_nu(x), Y_nu(x) for nu >= 0, x > 0. Returns [J, Y]. */
function besseljy(nu, x) {
  if (x > 25 && x > 2 * nu * nu + 25) return besselAsym(nu, x);
  const MAXIT = 100000;
  const XMIN = 2;
  const nl = x < XMIN ? Math.floor(nu + 0.5) : Math.max(0, Math.floor(nu - x + 1.5));
  const xmu = nu - nl, xmu2 = xmu * xmu;
  const xi = 1 / x, xi2 = 2 * xi, w = xi2 / PI;
  let isign = 1, h = nu * xi; if (h < FPMIN) h = FPMIN;
  let b = xi2 * nu, d = 0, c = h;
  let i;
  for (i = 1; i <= MAXIT; i++) {
    b += xi2; d = b - d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b - 1 / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = c * d; h = del * h; if (d < 0) isign = -isign;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  let rjl = isign * FPMIN, rjpl = h * rjl;
  const rjl1 = rjl, rjp1 = rjpl;
  let fact = nu * xi;
  for (let l = nl; l >= 1; l--) { const rjtemp = fact * rjl + rjpl; fact -= xi; rjpl = fact * rjtemp - rjl; rjl = rjtemp; }
  if (rjl === 0) rjl = EPS;
  const f = rjpl / rjl;
  let rjmu, rymu, rymup, ry1;
  if (x < XMIN) {
    const x2 = 0.5 * x, pimu = PI * xmu;
    const fct = Math.abs(pimu) < EPS ? 1 : pimu / Math.sin(pimu);
    d = -Math.log(x2); let e = xmu * d;
    const fact2 = Math.abs(e) < EPS ? 1 : Math.sinh(e) / e;
    const { gam1, gam2, gampl, gammi } = gamTemme(xmu);
    let ff = (2 / PI) * fct * (gam1 * Math.cosh(e) + gam2 * fact2 * d);
    e = Math.exp(e);
    let p = e / (gampl * PI);
    let q = 1 / (e * PI * gammi);
    const pimu2 = 0.5 * pimu;
    const fact3 = Math.abs(pimu2) < EPS ? 1 : Math.sin(pimu2) / pimu2;
    const r = PI * pimu2 * fact3 * fact3;
    c = 1; d = -x2 * x2;
    let sum = ff + r * q, sum1 = p;
    for (i = 1; i <= MAXIT; i++) {
      ff = (i * ff + p + q) / (i * i - xmu2);
      c *= d / i; p /= i - xmu; q /= i + xmu;
      const del = c * (ff + r * q); sum += del;
      const del1 = c * p - i * del; sum1 += del1;
      if (Math.abs(del) < (1 + Math.abs(sum)) * 1e-17) break;
    }
    rymu = -sum; ry1 = -sum1 * xi2; rymup = xmu * xi * rymu - ry1;
    rjmu = w / (rymup - f * rymu);
  } else {
    let a = 0.25 - xmu2, p = -0.5 * xi, q = 1;
    const br = 2 * x; let bi = 2;
    let fct = (a * xi) / (p * p + q * q);
    let cr = br + q * fct, ci = bi + p * fct;
    let den = br * br + bi * bi;
    let dr = br / den, di = -bi / den;
    let dlr = cr * dr - ci * di, dli = cr * di + ci * dr;
    let temp = p * dlr - q * dli; q = p * dli + q * dlr; p = temp;
    for (i = 2; i <= MAXIT; i++) {
      a += 2 * (i - 1); bi += 2;
      dr = a * dr + br; di = a * di + bi;
      if (Math.abs(dr) + Math.abs(di) < FPMIN) dr = FPMIN;
      fct = a / (cr * cr + ci * ci); cr = br + cr * fct; ci = bi - ci * fct;
      if (Math.abs(cr) + Math.abs(ci) < FPMIN) cr = FPMIN;
      den = dr * dr + di * di; dr /= den; di /= -den;
      dlr = cr * dr - ci * di; dli = cr * di + ci * dr;
      temp = p * dlr - q * dli; q = p * dli + q * dlr; p = temp;
      if (Math.abs(dlr - 1) + Math.abs(dli) < 1e-16) break;
    }
    const gam = (p - f) / q;
    rjmu = Math.sqrt(w / ((p - f) * gam + q));
    rjmu = rjl < 0 ? -Math.abs(rjmu) : Math.abs(rjmu);
    rymu = rjmu * gam;
    rymup = rymu * (p + q / gam);
    ry1 = xmu * xi * rymu - rymup;
  }
  const fct = rjmu / rjl;
  const rj = rjl1 * fct;
  void rjp1;
  for (i = 1; i <= nl; i++) { const rytemp = (xmu + i) * xi2 * ry1 - rymu; rymu = ry1; ry1 = rytemp; }
  return [rj, rymu];
}
/** Hankel asymptotic expansion for large x. */
function besselAsym(nu, x) {
  const mu = 4 * nu * nu;
  let P = 1, Q = 0, term = 1;
  const z8 = 8 * x;
  let k = 1, prev = Infinity;
  // term_k = prod_{j=1..k} (mu - (2j-1)^2) / (k! (8x)^k)
  for (; k < 60; k++) {
    term *= (mu - (2 * k - 1) ** 2) / (k * z8);
    if (Math.abs(term) > prev) break;
    prev = Math.abs(term);
    if (k % 2 === 1) Q += (k % 4 === 1 ? 1 : -1) * term;
    else P += (k % 4 === 2 ? -1 : 1) * term;
    if (Math.abs(term) < 1e-17) break;
  }
  const chi = x - (nu / 2 + 0.25) * PI;
  // cos/sin of chi with argument reduction relative to x
  const s = Math.sqrt(2 / (PI * x));
  const c = Math.cos(chi), sn = Math.sin(chi);
  return [s * (P * c - Q * sn), s * (P * sn + Q * c)];
}

/** I_nu(x), K_nu(x) for nu >= 0, x > 0; scaled = true returns I e^-x and K e^x. */
function besselik(nu, x, scaled = false) {
  const MAXIT = 100000, XMIN = 2;
  const nl = Math.floor(nu + 0.5);
  const xmu = nu - nl, xmu2 = xmu * xmu;
  const xi = 1 / x, xi2 = 2 * xi;
  let h = nu * xi; if (h < FPMIN) h = FPMIN;
  let b = xi2 * nu, d = 0, c = h, i;
  for (i = 1; i <= MAXIT; i++) {
    b += xi2; d = 1 / (b + d); c = b + 1 / c;
    const del = c * d; h = del * h;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  let ril = FPMIN, ripl = h * ril;
  const ril1 = ril;
  let fact = nu * xi;
  for (let l = nl; l >= 1; l--) {
    const ritemp = fact * ril + ripl; fact -= xi; ripl = fact * ritemp + ril; ril = ritemp;
    if (Math.abs(ril) > 1e250) { ril *= 1e-250; ripl *= 1e-250; /* rescale */ return besselikScaledRecur(nu, x, scaled); }
  }
  const f = ripl / ril;
  let rkmu, rk1; // scaled by e^x when x >= XMIN
  let kScale; // log factor: true K = rkmu * exp(-kScale)
  if (x < XMIN) {
    const x2 = 0.5 * x, pimu = PI * xmu;
    const fct = Math.abs(pimu) < EPS ? 1 : pimu / Math.sin(pimu);
    d = -Math.log(x2); let e = xmu * d;
    const fact2 = Math.abs(e) < EPS ? 1 : Math.sinh(e) / e;
    const { gam1, gam2, gampl, gammi } = gamTemme(xmu);
    let ff = fct * (gam1 * Math.cosh(e) + gam2 * fact2 * d);
    let sum = ff; e = Math.exp(e);
    let p = 0.5 * e / gampl, q = 0.5 / (e * gammi);
    c = 1; d = x2 * x2; let sum1 = p;
    for (i = 1; i <= MAXIT; i++) {
      ff = (i * ff + p + q) / (i * i - xmu2);
      c *= d / i; p /= i - xmu; q /= i + xmu;
      const del = c * ff; sum += del;
      const del1 = c * (p - i * ff); sum1 += del1;
      if (Math.abs(del) < Math.abs(sum) * 1e-17) break;
    }
    rkmu = sum; rk1 = sum1 * xi2; kScale = 0;
  } else {
    b = 2 * (1 + x); d = 1 / b;
    let hh = d, delh = d, q1 = 0, q2 = 1;
    const a1 = 0.25 - xmu2;
    let q = a1; c = a1; let a = -a1;
    let s = 1 + q * delh;
    for (i = 2; i <= MAXIT; i++) {
      a -= 2 * (i - 1); c = (-a * c) / i;
      const qnew = (q1 - b * q2) / a; q1 = q2; q2 = qnew; q += c * qnew;
      b += 2; d = 1 / (b + a * d); delh = (b * d - 1) * delh; hh += delh;
      const dels = q * delh; s += dels;
      if (Math.abs(dels / s) < 1e-16) break;
    }
    hh = a1 * hh;
    rkmu = Math.sqrt(PI / (2 * x)) / s; // times e^-x
    rk1 = rkmu * (xmu + x + 0.5 - hh) * xi;
    kScale = x;
  }
  const rkmup = xmu * xi * rkmu - rk1;
  const rimu = xi / (f * rkmu - rkmup); // = I * e^{-kScale}... (I e^{-x} when kScale = x)
  let ri = (rimu * ril1) / ril;
  for (i = 1; i <= nl; i++) { const rktemp = (xmu + i) * xi2 * rk1 + rkmu; rkmu = rk1; rk1 = rktemp; }
  let rk = rkmu;
  // ri currently is I * exp(-kScale), rk is K * exp(kScale)
  if (scaled) {
    // want I e^{-x}, K e^{x}
    ri *= Math.exp(kScale - x); rk *= Math.exp(x - kScale);
  } else {
    ri *= Math.exp(kScale); rk *= Math.exp(-kScale);
  }
  return [ri, rk];
}
/** Fallback for very large orders: series / uniform asymptotics are not implemented; use log-space series for I and K via recurrence from K. */
function besselikScaledRecur(nu, x, scaled) {
  // I by power series in log space (large nu relative to x), K by forward recurrence from K_mu
  let lt = nu * Math.log(x / 2) - gammaln(nu + 1);
  let sum = 0, term = 1;
  const q = (x * x) / 4;
  for (let k = 1; k < 10000; k++) { term *= q / (k * (nu + k)); sum += term; if (term < 1e-17 * (1 + sum)) break; }
  const lI = lt + Math.log1p(sum);
  const I = Math.exp(lI - (scaled ? x : 0));
  const [, k0] = besselik(nu - Math.floor(nu), x, scaled);
  const [, k1] = besselik(nu - Math.floor(nu) + 1, x, scaled);
  let km = k0, kc = k1;
  for (let v = nu - Math.floor(nu) + 1; v < nu - 0.5; v += 1) { const kn = (2 * v / x) * kc + km; km = kc; kc = kn; }
  return [I, Math.floor(nu) === 0 ? k0 : kc];
}

/** J, Y for any real nu and x (complex for x < 0). Returns {j:[re,im], y:[re,im]}. */
function besselJY(nu, x) {
  if (Number.isNaN(nu) || Number.isNaN(x)) return { j: [NaN, 0], y: [NaN, 0] };
  const isInt = Number.isInteger(nu);
  if (x === 0) {
    const j = nu === 0 ? 1 : nu > 0 || isInt ? 0 : Infinity;
    return { j: [j, 0], y: [-Infinity, 0] };
  }
  if (x === Infinity || x === -Infinity) return { j: [0, 0], y: [0, 0] };
  const ax = Math.abs(x), an = Math.abs(nu);
  let [J, Y] = besseljy(an, ax);
  if (nu < 0) {
    if (isInt) { const s = an % 2 ? -1 : 1; J *= s; Y *= s; }
    else { const c = cospi(an), s = sinpi(an); const Jn = c * J - s * Y, Yn = s * J + c * Y; J = Jn; Y = Yn; }
  }
  if (x > 0) return { j: [J, 0], y: [Y, 0] };
  // x < 0: J(-x) = e^{i nu pi} J(x); Y(-x) = e^{-i nu pi} Y(x) + 2 i cos(nu pi) J(x)
  const c = cospi(nu), s = sinpi(nu);
  return { j: [c * J, s * J], y: [c * Y, -s * Y + 2 * c * J] };
}
function besselIK(nu, x, scaled = false) {
  if (Number.isNaN(nu) || Number.isNaN(x)) return { i: [NaN, 0], k: [NaN, 0] };
  const isInt = Number.isInteger(nu);
  if (x === 0) {
    const i = nu === 0 ? 1 : nu > 0 || isInt ? 0 : Infinity;
    return { i: [i, 0], k: [Infinity, 0] };
  }
  const ax = Math.abs(x), an = Math.abs(nu);
  if (ax === Infinity) return { i: [scaled ? 0 : Infinity, 0], k: [0, 0] };
  let [I, K] = besselik(an, ax, scaled);
  if (nu < 0 && !isInt) {
    // I_{-nu} = I_nu + (2/pi) sin(nu pi) K_nu  (scaled: K e^x → multiply by e^{-2x})
    I += (2 / PI) * sinpi(an) * K * (scaled ? Math.exp(-2 * ax) : 1);
  }
  if (x > 0) return { i: [I, 0], k: [K, 0] };
  // x < 0: I(-x) = e^{i nu pi} I(x); K(-x) = e^{-i nu pi} K(x) - i pi I(x)
  const c = cospi(nu), s = sinpi(nu);
  const kre = c * K, kim = -s * K - PI * I * (scaled ? Math.exp(2 * ax) : 1);
  // scaled versions: I e^{-|Re z|}, K e^{z}; z = x < 0 → K(-x) e^{x}: K was scaled by e^{ax}; adjust by e^{-2ax}
  if (scaled) return { i: [c * I, s * I], k: [kre * Math.exp(-2 * ax), kim * Math.exp(-2 * ax)] };
  return { i: [c * I, s * I], k: [kre, kim] };
}

function scaleArg(v, fn) {
  if (v == null) return false;
  const s = scal(v, fn, 'scale');
  if (s !== 0 && s !== 1) fail(`${fn}:badScale`, 'The scale option must be 0 or 1.');
  return s === 1;
}

function airyScalar(k, x, scaled) {
  if (Number.isNaN(x)) return [NaN, 0];
  const c3 = Math.sqrt(3);
  if (x === 0) return [[0.3550280538878172, -0.2588194037928068, 0.6149266274460007, 0.4482883573538264][k], 0];
  const ax = Math.abs(x);
  const zeta = (2 / 3) * ax * Math.sqrt(ax);
  if (x > 0) {
    const sc = scaled ? Math.exp(zeta) : 1;
    if (k === 0) return [(1 / PI) * Math.sqrt(x / 3) * besselik(1 / 3, zeta, true)[1] * Math.exp(-zeta) * sc, 0];
    if (k === 1) return [-(x / (PI * c3)) * besselik(2 / 3, zeta, true)[1] * Math.exp(-zeta) * sc, 0];
    const sb = scaled ? Math.exp(-zeta) : 1;
    if (k === 2) { const I = besselIK(-1 / 3, zeta, true).i[0] + besselIK(1 / 3, zeta, true).i[0]; return [Math.sqrt(x / 3) * I * Math.exp(zeta) * sb, 0]; }
    const I = besselIK(-2 / 3, zeta, true).i[0] + besselIK(2 / 3, zeta, true).i[0];
    return [(x / c3) * I * Math.exp(zeta) * sb, 0];
  }
  const Jp13 = besselJY(1 / 3, zeta).j[0], Jm13 = besselJY(-1 / 3, zeta).j[0];
  const Jp23 = besselJY(2 / 3, zeta).j[0], Jm23 = besselJY(-2 / 3, zeta).j[0];
  if (k === 0) return [(Math.sqrt(ax) / 3) * (Jp13 + Jm13), 0];
  if (k === 1) return [(ax / 3) * (Jp23 - Jm23), 0];
  if (k === 2) return [Math.sqrt(ax / 3) * (Jm13 - Jp13), 0];
  return [(ax / c3) * (Jm23 + Jp23), 0];
}

// ---------------------------------------------------------------- elliptic

function ellipkeScalar(m, tol) {
  if (Number.isNaN(m)) return [NaN, NaN];
  if (m < 0 || m > 1) fail('ellipke:MOutOfRange', 'M must be in the range 0 <= M <= 1.');
  if (m === 1) return [Infinity, 1];
  let a = 1, b = Math.sqrt(1 - m), c = Math.sqrt(m), sum = 0.5 * c * c, pw = 0.5;
  for (let i = 0; i < 100 && Math.abs(c) > tol; i++) {
    const an = (a + b) / 2, bn = Math.sqrt(a * b); c = (a - b) / 2; a = an; b = bn;
    pw *= 2; sum += pw * c * c;
  }
  const K = PI / (2 * a);
  return [K, K * (1 - sum)];
}
function ellipjScalar(u, m, tol) {
  if (Number.isNaN(u) || Number.isNaN(m)) return [NaN, NaN, NaN];
  if (m < 0 || m > 1) fail('ellipj:MOutOfRange', 'M must be in the range 0 <= M <= 1.');
  if (m < 1e-9) { const s = Math.sin(u), c = Math.cos(u); const t = 0.25 * m * (u - s * c); return [s - t * c, c + t * s, 1 - 0.5 * m * s * s]; }
  if (m >= 1 - 1e-12) { const t = Math.tanh(u), sc = 1 / Math.cosh(u); return [t, sc, sc]; }
  const a = [1], c = [Math.sqrt(m)]; let b = Math.sqrt(1 - m);
  let n = 0;
  while (Math.abs(c[n]) > tol && n < 60) {
    const an = (a[n] + b) / 2, bn = Math.sqrt(a[n] * b), cn = (a[n] - b) / 2;
    a.push(an); c.push(cn); b = bn; n++;
  }
  let phi = Math.pow(2, n) * a[n] * u;
  let phiPrev = phi;
  for (let k = n; k >= 1; k--) {
    phiPrev = phi;
    phi = (phi + Math.asin((c[k] / a[k]) * Math.sin(phi))) / 2;
  }
  const sn = Math.sin(phi), cn = Math.cos(phi);
  const dn = n === 0 ? 1 : cn / Math.cos(phiPrev - phi);
  return [sn, cn, dn];
}

// ---------------------------------------------------------------- legendre

function legendreAt(n, x, norm) {
  // fully normalized P̄_n^m (with Condon-Shortley phase), m = 0..n
  const res = new Float64Array(n + 1);
  const s = Math.sqrt(Math.max(0, (1 - x) * (1 + x)));
  let pmm = Math.sqrt(0.5);
  for (let m = 0; m <= n; m++) {
    if (m > 0) pmm = -Math.sqrt((2 * m + 1) / (2 * m)) * s * pmm;
    if (m === n) { res[m] = pmm; break; }
    let p0 = pmm, p1 = Math.sqrt(2 * m + 3) * x * pmm;
    if (m + 1 === n) { res[m] = p1; continue; }
    for (let l = m + 2; l <= n; l++) {
      const a = Math.sqrt((4 * l * l - 1) / (l * l - m * m));
      const b = Math.sqrt(((l - 1) * (l - 1) - m * m) / (4 * (l - 1) * (l - 1) - 1));
      const p2 = a * (x * p1 - b * p0); p0 = p1; p1 = p2;
    }
    res[m] = p1;
  }
  for (let m = 0; m <= n; m++) {
    const bar = res[m];
    if (norm === 'norm') res[m] = (m % 2 ? -1 : 1) * bar;
    else {
      const lr = 0.5 * (gammaln(n - m + 1) - gammaln(n + m + 1));
      const Nnm = Math.sqrt((2 * n + 1) / 2) * Math.exp(lr);
      const un = bar / Nnm;
      if (norm === 'unnorm') res[m] = un;
      else res[m] = m === 0 ? un : (m % 2 ? -1 : 1) * Math.sqrt(2) * Math.exp(lr) * un;
    }
  }
  return res;
}

// ---------------------------------------------------------------- builtins

const realFn = (name, f) => (args) => {
  if (!args.length) fail(`${name}:notEnoughInputs`, 'Not enough input arguments.');
  return ew(name, [args[0]], f);
};

function tailArg(v, fn, allowed) {
  if (v == null) return allowed[0];
  const o = optText(v);
  if (o == null || !allowed.includes(o)) fail(`${fn}:badTail`, `Tail must be ${allowed.map((x) => `'${x}'`).join(', ')}.`);
  return o;
}

export const builtins = {
  gamma: realFn('gamma', gammaFn),
  gammaln: realFn('gammaln', (x) => { if (x < 0) fail('gammaln:notNonNeg', 'Input must be nonnegative.'); return gammaln(x); }),
  gammainc(args) {
    if (args.length < 2) fail('gammainc:notEnoughInputs', 'Not enough input arguments.');
    const tail = tailArg(args[2], 'gammainc', ['lower', 'upper', 'scaledlower', 'scaledupper']);
    return ew('gammainc', [args[0], args[1]], (x, a) => {
      if (x < 0 || a < 0) fail('gammainc:negativeArg', 'X and A must be nonnegative.');
      const r = incgamma(x, a);
      return { lower: r.p, upper: r.q, scaledlower: r.sp, scaledupper: r.sq }[tail];
    });
  },
  gammaincinv(args) {
    if (args.length < 2) fail('gammaincinv:notEnoughInputs', 'Not enough input arguments.');
    const tail = tailArg(args[2], 'gammaincinv', ['lower', 'upper']);
    return ew('gammaincinv', [args[0], args[1]], (y, a) => gammaincinvScalar(y, a, tail === 'upper'));
  },
  psi(args) {
    if (args.length >= 2) {
      const k = intArg(args[0], 'psi', 'k');
      return ew('psi', [args[1]], (x) => polygamma(k, x));
    }
    return ew('psi', [args[0]], psiFn);
  },
  beta(args) {
    if (args.length < 2) fail('beta:notEnoughInputs', 'Not enough input arguments.');
    return ew('beta', [args[0], args[1]], betaFn);
  },
  betaln(args) {
    if (args.length < 2) fail('betaln:notEnoughInputs', 'Not enough input arguments.');
    return ew('betaln', [args[0], args[1]], (a, b) => (a > 0 && b > 0 ? betaln(a, b) : Math.log(Math.abs(betaFn(a, b)))));
  },
  betainc(args) {
    if (args.length < 3) fail('betainc:notEnoughInputs', 'Not enough input arguments.');
    const tail = tailArg(args[3], 'betainc', ['lower', 'upper']);
    return ew('betainc', [args[0], args[1], args[2]], (x, a, b) => {
      if (x < 0 || x > 1) fail('betainc:XOutOfRange', 'X must be in the interval [0,1].');
      return betainc(x, a, b, tail === 'upper');
    });
  },
  betaincinv(args) {
    if (args.length < 3) fail('betaincinv:notEnoughInputs', 'Not enough input arguments.');
    const tail = tailArg(args[3], 'betaincinv', ['lower', 'upper']);
    return ew('betaincinv', [args[0], args[1], args[2]], (y, a, b) => betaincinv(y, a, b, tail === 'upper'));
  },
  erf: realFn('erf', erfFn),
  erfc: realFn('erfc', erfcFn),
  erfcx: realFn('erfcx', erfcxFn),
  erfinv: realFn('erfinv', erfinvFn),
  erfcinv: realFn('erfcinv', erfcinvFn),
  expint: realFn('expint', expintE1),
  besselj(args) { return besselBuiltin('besselj', args); },
  bessely(args) { return besselBuiltin('bessely', args); },
  besseli(args) { return besselBuiltin('besseli', args); },
  besselk(args) { return besselBuiltin('besselk', args); },
  besselh(args) {
    if (args.length < 2) fail('besselh:notEnoughInputs', 'Not enough input arguments.');
    let kind = 1, xi = 1;
    if (args.length >= 3) { kind = intArg(args[1], 'besselh', 'K'); xi = 2; }
    if (kind !== 1 && kind !== 2) fail('besselh:badKind', 'K must be 1 or 2.');
    const scaled = scaleArg(args[xi + 1], 'besselh');
    const sg = kind === 1 ? 1 : -1;
    return ew('besselh', [args[0], args[xi]], (nu, x) => {
      const { j, y } = besselJY(nu, x);
      // H = J + sg*i*Y
      let re = j[0] - sg * y[1], im = j[1] + sg * y[0];
      if (scaled) { const c = Math.cos(x), s = -sg * Math.sin(x); const r = re * c - im * s; im = re * s + im * c; re = r; }
      return [re, im];
    });
  },
  airy(args) {
    let k = 0, xv, sc = false;
    if (args.length === 1) xv = args[0];
    else { k = intArg(args[0], 'airy', 'k'); xv = args[1]; sc = scaleArg(args[2], 'airy'); }
    if (k > 3) fail('airy:badK', 'K must be 0, 1, 2 or 3.');
    return ew('airy', [xv], (x) => airyScalar(k, x, sc));
  },
  legendre(args) {
    if (args.length < 2) fail('legendre:notEnoughInputs', 'Not enough input arguments.');
    const n = intArg(args[0], 'legendre', 'n');
    const X = dbl(args[1], 'legendre', 'X');
    const norm = args.length > 2 ? optText(args[2]) : 'unnorm';
    if (!['unnorm', 'sch', 'norm'].includes(norm)) fail('legendre:badNormalization', "Normalization must be 'unnorm', 'sch' or 'norm'.");
    const q = X.re.length;
    const re = new Float64Array((n + 1) * q);
    for (let k = 0; k < q; k++) {
      const x = X.re[k];
      if (x < -1 || x > 1) fail('legendre:XOutOfRange', 'X must be real and in the range [-1, 1].');
      re.set(legendreAt(n, x, norm), k * (n + 1));
    }
    const isVec = X.dims.length === 2 && (X.dims[0] === 1 || X.dims[1] === 1);
    const dims = isVec ? [n + 1, q] : [n + 1, ...X.dims];
    return out(dims, re, null, resultCls(args[1]));
  },
  ellipke(args, nargout) {
    if (!args.length) fail('ellipke:notEnoughInputs', 'Not enough input arguments.');
    const tol = args.length > 1 ? scal(args[1], 'ellipke', 'tol') : EPS;
    const r = ew('ellipke', [args[0]], (m) => ellipkeScalar(m, tol), 2);
    return nargout > 1 ? r : r[0];
  },
  ellipj(args, nargout) {
    if (args.length < 2) fail('ellipj:notEnoughInputs', 'Not enough input arguments.');
    const tol = args.length > 2 ? scal(args[2], 'ellipj', 'tol') : EPS;
    const r = ew('ellipj', [args[0], args[1]], (u, m) => ellipjScalar(u, m, tol), 3);
    return r.slice(0, Math.max(1, nargout));
  },
};

function besselBuiltin(fn, args) {
  if (args.length < 2) fail(`${fn}:notEnoughInputs`, 'Not enough input arguments.');
  const scaled = scaleArg(args[2], fn);
  return ew(fn, [args[0], args[1]], (nu, x) => {
    if (fn === 'besselj' || fn === 'bessely') {
      const r = besselJY(nu, x)[fn === 'besselj' ? 'j' : 'y'];
      if (!scaled) return r;
      // scaled: multiply by exp(-|imag(x)|) = 1 for real x
      return r;
    }
    const r = besselIK(nu, x, scaled)[fn === 'besseli' ? 'i' : 'k'];
    return r;
  });
}

export const help = {
  gamma: H('Gamma function.', '감마 함수.', ['Y = gamma(X)']),
  gammaln: H('Logarithm of the gamma function.', '감마 함수의 로그.', ['Y = gammaln(X)']),
  gammainc: H('Regularized incomplete gamma function.', '정규화된 불완전 감마 함수.', ['Y = gammainc(X, A)', "Y = gammainc(X, A, 'upper')", "Y = gammainc(X, A, 'scaledlower')"]),
  gammaincinv: H('Inverse of the incomplete gamma function.', '불완전 감마 함수의 역함수.', ['X = gammaincinv(Y, A)', "X = gammaincinv(Y, A, 'upper')"]),
  psi: H('Digamma and polygamma functions.', '디감마 및 폴리감마 함수.', ['Y = psi(X)', 'Y = psi(k, X)']),
  beta: H('Beta function.', '베타 함수.', ['B = beta(Z, W)']),
  betaln: H('Logarithm of the beta function.', '베타 함수의 로그.', ['L = betaln(Z, W)']),
  betainc: H('Regularized incomplete beta function.', '정규화된 불완전 베타 함수.', ['I = betainc(X, Z, W)', "I = betainc(X, Z, W, 'upper')"]),
  betaincinv: H('Inverse of the incomplete beta function.', '불완전 베타 함수의 역함수.', ['X = betaincinv(Y, Z, W)', "X = betaincinv(Y, Z, W, 'upper')"]),
  erf: H('Error function.', '오차 함수.', ['Y = erf(X)']),
  erfc: H('Complementary error function.', '여오차 함수.', ['Y = erfc(X)']),
  erfcx: H('Scaled complementary error function exp(x^2)*erfc(x).', '스케일된 여오차 함수 exp(x^2)*erfc(x).', ['Y = erfcx(X)']),
  erfinv: H('Inverse error function.', '역오차 함수.', ['X = erfinv(Y)']),
  erfcinv: H('Inverse complementary error function.', '역 여오차 함수.', ['X = erfcinv(Y)']),
  expint: H('Exponential integral E1.', '지수 적분 E1.', ['Y = expint(X)']),
  besselj: H('Bessel function of the first kind.', '제1종 베셀 함수.', ['J = besselj(nu, Z)', 'J = besselj(nu, Z, scale)']),
  bessely: H('Bessel function of the second kind.', '제2종 베셀 함수.', ['Y = bessely(nu, Z)', 'Y = bessely(nu, Z, scale)']),
  besseli: H('Modified Bessel function of the first kind.', '제1종 변형 베셀 함수.', ['I = besseli(nu, Z)', 'I = besseli(nu, Z, 1)  % I*exp(-abs(real(Z)))']),
  besselk: H('Modified Bessel function of the second kind.', '제2종 변형 베셀 함수.', ['K = besselk(nu, Z)', 'K = besselk(nu, Z, 1)  % K*exp(Z)']),
  besselh: H('Bessel function of the third kind (Hankel function).', '제3종 베셀 함수 (한켈 함수).', ['H = besselh(nu, Z)', 'H = besselh(nu, K, Z)', 'H = besselh(nu, K, Z, 1)']),
  airy: H('Airy functions Ai, Ai\', Bi, Bi\'.', '에어리 함수 Ai, Ai\', Bi, Bi\'.', ['W = airy(Z)', 'W = airy(k, Z)', 'W = airy(k, Z, scale)']),
  legendre: H('Associated Legendre functions.', '연관 르장드르 함수.', ['P = legendre(n, X)', "P = legendre(n, X, 'sch')", "P = legendre(n, X, 'norm')"]),
  ellipke: H('Complete elliptic integrals of the first and second kind.', '제1종 및 제2종 완전 타원 적분.', ['K = ellipke(M)', '[K, E] = ellipke(M)', '[K, E] = ellipke(M, tol)']),
  ellipj: H('Jacobi elliptic functions.', '야코비 타원 함수.', ['[SN, CN, DN] = ellipj(U, M)', '[SN, CN, DN] = ellipj(U, M, tol)']),
};
