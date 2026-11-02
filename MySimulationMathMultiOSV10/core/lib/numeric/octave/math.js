// Octave-compatible elementary and special functions and small utilities:
// arg, cbrt, signbit, roundb, lgamma, bincoeff, cosint, sinint, erfi,
// dawson, list_primes, humps, curl, divergence, sumsq, meansq, center, colloc.
import { tensor, prod, num, toNum } from '../../../value.js';
import { E, F, H, isEmptyV } from '../_util.js';
import * as K from '../_kernels.js';
import { ew } from '../stats/_s.js';
import { T, mapEl, dimOf, along, txt, colV, rowV, mat } from './_h.js';

const EULER = 0.5772156649015329;
const EPS = 2.220446049250313e-16;
const SQPI = 1.7724538509055159;

// ------------------------------------------------------------ elementary
function arg(args) {
  if (args.length !== 1) throw E('arg:nargin', 'arg: one input is required.');
  return mapEl(args[0], 'arg', (x) => (Number.isNaN(x) ? NaN : Math.atan2(0, x)), (re, im) => Math.atan2(im, re));
}
function cbrt(args) {
  if (args.length !== 1) throw E('cbrt:nargin', 'cbrt: one input is required.');
  return mapEl(args[0], 'cbrt', Math.cbrt);
}
const DV = new DataView(new ArrayBuffer(8));
function signbit(args) {
  if (args.length !== 1) throw E('signbit:nargin', 'signbit: one input is required.');
  const t = T(args[0], 'signbit');
  if (t.im && t.im.some((x) => x !== 0)) throw E('signbit:complex', 'signbit: the argument must be real.');
  const re = new Float64Array(t.re.length);
  for (let i = 0; i < re.length; i++) { DV.setFloat64(0, t.re[i]); re[i] = DV.getUint8(0) & 0x80 ? 1 : 0; }
  return tensor('logical', t.dims.slice(), re);
}
const rEven = (x) => {
  if (!Number.isFinite(x)) return x;
  const f = Math.floor(x); const d = x - f;
  const r = d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 === 0 ? f : f + 1;
  return r === 0 && x < 0 ? -0 : r;
};
function roundb(args) {
  if (args.length !== 1) throw E('roundb:nargin', 'roundb: one input is required.');
  const t = T(args[0], 'roundb');
  if (t.cls !== 'double' && t.cls !== 'single') return t;
  return mapEl(t, 'roundb', rEven, (re, im) => [rEven(re), rEven(im)]);
}

// ------------------------------------------------------------ gamma family
/** log|Γ(x)| and the sign of Γ(x) for real x. */
export function lgammaSigned(x) {
  if (Number.isNaN(x)) return [NaN, 1];
  if (x === Infinity) return [Infinity, 1];
  if (x === -Infinity) return [Infinity, 1];
  if (x > 0) return [K.gammaln(x), 1];
  if (x === Math.floor(x)) return [Infinity, 1];
  // reflection: Γ(x)Γ(1-x) = π / sin(πx)
  const s = Math.sin(Math.PI * (x - 2 * Math.floor(x / 2)));
  const v = Math.log(Math.PI / Math.abs(s)) - K.gammaln(1 - x);
  return [v, Math.floor(x) % 2 === 0 ? 1 : -1];
}
function lgamma(args) {
  if (args.length !== 1) throw E('lgamma:nargin', 'lgamma: one input is required.');
  return mapEl(args[0], 'lgamma', (x) => { const [v, s] = lgammaSigned(x); return s < 0 ? [v, Math.PI] : v; });
}
function binc(n, k) {
  if (Number.isNaN(n) || Number.isNaN(k) || k < 0 || k !== Math.floor(k)) return NaN;
  if (k === 0) return 1;
  const nInt = n === Math.floor(n);
  if (nInt && n < 0) return (k % 2 ? -1 : 1) * binc(-n + k - 1, k);
  if (nInt && k > n) return 0;
  let kk = k;
  if (nInt && n - k < k) kk = n - k;
  if (nInt && n <= 1e5) {
    // exact integer arithmetic, rounded once
    let r = 1n; const N = BigInt(n);
    for (let i = 1n; i <= BigInt(kk); i++) r = r * (N - BigInt(kk) + i) / i;
    return Number(r);
  }
  let r;
  if (kk <= 2000) { r = 1; for (let i = 1; i <= kk; i++) r *= (n - kk + i) / i; }
  else {
    const [a] = lgammaSigned(n + 1), [b] = lgammaSigned(kk + 1), [c, sc] = lgammaSigned(n - kk + 1);
    const [, sa] = lgammaSigned(n + 1);
    r = sa * sc * Math.exp(a - b - c);
  }
  return nInt ? Math.round(r) : r;
}
function bincoeff(args) {
  if (args.length !== 2) throw E('bincoeff:nargin', 'bincoeff: N and K are required.');
  for (const a of args) { const t = T(a, 'bincoeff'); if (t.im && t.im.some((x) => x !== 0)) throw E('bincoeff:complex', 'bincoeff: N and K must be real.'); }
  return ew(args, binc);
}

// ------------------------------------------------------------ sine and cosine integrals
/** [Ci(t), Si(t)] for real t > 0. */
function cisiPos(t) {
  if (t > 2) {
    // continued fraction (modified Lentz) for E1(i t)
    let br = 1, bi = t, cr = 1e300, ci = 0;
    let [dr, di] = cinv(br, bi); let hr = dr, hi = di;
    for (let i = 2; i < 500; i++) {
      const a = -(i - 1) * (i - 1); br += 2;
      // d = 1/(a d + b)
      [dr, di] = cinv(a * dr + br, a * di + bi);
      // c = b + a/c
      const [qr, qi] = cinv(cr, ci); cr = br + a * qr; ci = bi + a * qi;
      const delr = cr * dr - ci * di, deli = cr * di + ci * dr;
      const nr = hr * delr - hi * deli; hi = hr * deli + hi * delr; hr = nr;
      if (Math.abs(delr - 1) + Math.abs(deli) < 1e-16) break;
    }
    const c = Math.cos(t), s = Math.sin(t);
    const fr = c * hr + s * hi, fi = c * hi - s * hr;
    return [-fr, Math.PI / 2 + fi];
  }
  let sum = 0, sums = 0, sumc = 0, sign = 1, fact = 1, odd = true;
  for (let k = 1; k < 200; k++) {
    fact *= t / k; const term = fact / k; sum += sign * term;
    const err = term / Math.abs(sum);
    if (odd) { sign = -sign; sums = sum; sum = sumc; } else { sumc = sum; sum = sums; }
    if (err < 1e-17) break;
    odd = !odd;
  }
  return [sumc + Math.log(t) + EULER, sums];
}
function cinv(r, i) { const d = r * r + i * i; return [r / d, -i / d]; }
const cmul = (a, b, c, d) => [a * c - b * d, a * d + b * c];
const cexp = (r, i) => { const e = Math.exp(r); return [e * Math.cos(i), e * Math.sin(i)]; };
/** Real Ci and Si (Octave: Ci(x<0) = Ci(-x) + iπ). */
function ciReal(x) {
  if (Number.isNaN(x)) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return 0;
  if (x === -Infinity) return [0, Math.PI];
  const v = cisiPos(Math.abs(x))[0];
  return x < 0 ? [v, Math.PI] : v;
}
function siReal(x) {
  if (Number.isNaN(x)) return NaN;
  if (x === 0) return x;
  if (!Number.isFinite(x)) return Math.sign(x) * Math.PI / 2;
  const v = cisiPos(Math.abs(x))[1];
  return x < 0 ? -v : v;
}
/** Power series of [Ci(z) - γ - log z, Si(z)] for complex z. */
function cisiSeries(zr, zi) {
  const [z2r, z2i] = cmul(zr, zi, zr, zi);
  let tr = 1, ti = 0; // z^(2k)/(2k)! (-1)^k
  let cr = 0, ci = 0; let ur = zr, ui = zi; let sr = zr, si = zi; // si term z^(2k+1)/(2k+1)! (-1)^k
  for (let k = 1; k < 2000; k++) {
    [tr, ti] = cmul(tr, ti, -z2r, -z2i); tr /= (2 * k - 1) * (2 * k); ti /= (2 * k - 1) * (2 * k);
    cr += tr / (2 * k); ci += ti / (2 * k);
    [ur, ui] = cmul(ur, ui, -z2r, -z2i); ur /= (2 * k) * (2 * k + 1); ui /= (2 * k) * (2 * k + 1);
    sr += ur / (2 * k + 1); si += ui / (2 * k + 1);
    const m = Math.hypot(tr, ti) + Math.hypot(ur, ui);
    if (m < 1e-17 * (Math.hypot(cr, ci) + Math.hypot(sr, si) + 1e-300) && k > 2) break;
  }
  return [cr, ci, sr, si];
}
/** Complex E1(w) by continued fraction (|w| not small). */
function e1cf(wr, wi) {
  let br = wr + 1, bi = wi; let cr = 1e300, ci = 0;
  let [dr, di] = cinv(br, bi); let hr = dr, hi = di;
  for (let i = 1; i < 2000; i++) {
    const a = -i * i; br += 2;
    [dr, di] = cinv(a * dr + br, a * di + bi);
    const [qr, qi] = cinv(cr, ci); cr = br + a * qr; ci = bi + a * qi;
    const delr = cr * dr - ci * di, deli = cr * di + ci * dr;
    const nr = hr * delr - hi * deli; hi = hr * deli + hi * delr; hr = nr;
    if (Math.abs(delr - 1) + Math.abs(deli) < 1e-16) break;
  }
  const [er, ei] = cexp(-wr, -wi);
  return cmul(hr, hi, er, ei);
}
/** [Ci, Si] for complex z (zi != 0). Returns [cir, cii, sir, sii]. */
function cisiComplex(zr, zi) {
  const r = Math.hypot(zr, zi);
  if (r <= 4 || zr === 0 || (Math.abs(zr) <= Math.abs(zi) && r <= 40)) {
    const [cr, ci, sr, si] = cisiSeries(zr, zi);
    return [cr + EULER + Math.log(r), ci + Math.atan2(zi, zr), sr, si];
  }
  if (zr < 0) {
    // Ci(-w) = Ci(w) ∓ iπ (− for Im w > 0), Si(-w) = -Si(w)
    const [cr, ci, sr, si] = cisiComplex(-zr, -zi);
    return [cr, ci + (-zi > 0 ? -Math.PI : Math.PI), -sr, -si];
  }
  const [ar, ai] = e1cf(-zi, zr); // E1(iz)
  const [br, bi] = e1cf(zi, -zr); // E1(-iz)
  const cr = -(ar + br) / 2, ci = -(ai + bi) / 2;
  // Si = π/2 + (E1(iz) - E1(-iz)) / (2i)
  const dr = ar - br, di = ai - bi;
  return [cr, ci, Math.PI / 2 + di / 2, -dr / 2];
}
function cosint(args) {
  if (args.length !== 1) throw E('cosint:nargin', 'cosint: one input is required.');
  return mapEl(args[0], 'cosint', ciReal, (re, im) => { const r = cisiComplex(re, im); return [r[0], r[1]]; });
}
function sinint(args) {
  if (args.length !== 1) throw E('sinint:nargin', 'sinint: one input is required.');
  return mapEl(args[0], 'sinint', siReal, (re, im) => { const r = cisiComplex(re, im); return [r[2], r[3]]; });
}

// ------------------------------------------------------------ Dawson, erfi, Faddeeva
/** Dawson's integral F(x) = exp(-x²) ∫0^x exp(t²) dt for real x (Rybicki's method, h = 0.2). */
export function dawsonReal(x) {
  if (Number.isNaN(x)) return NaN;
  if (!Number.isFinite(x)) return 0 * Math.sign(x);
  const ax = Math.abs(x);
  if (ax < 0.5) {
    // F(x) = Σ (-1)^k 2^k x^(2k+1) / (2k+1)!!
    const x2 = x * x; let term = x, s = x;
    for (let k = 1; k < 60; k++) { term *= -2 * x2 / (2 * k + 1); s += term; if (Math.abs(term) < 1e-17 * Math.abs(s)) break; }
    return s;
  }
  if (ax > 1e6) { const y = 1 / (2 * x * x); return (1 + y * (1 + 3 * y)) / (2 * x); }
  const h = 0.2; const NMAX = 20;
  const n0 = 2 * Math.round(0.5 * ax / h);
  const xp = ax - n0 * h;
  let e1 = Math.exp(2 * xp * h); const e2 = e1 * e1;
  let d1 = n0 + 1, d2 = d1 - 2, sum = 0;
  for (let i = 1; i <= NMAX; i++) {
    const c = Math.exp(-(((2 * i - 1) * h) ** 2));
    sum += c * (e1 / d1 + 1 / (d2 * e1));
    d1 += 2; d2 -= 2; e1 *= e2;
  }
  return Math.sign(x) * Math.exp(-xp * xp) * sum / SQPI;
}
// Weideman's rational approximation of the Faddeeva function w(z) (Im z >= 0)
const WN = 64;
const WL = Math.sqrt(WN / Math.SQRT2);
const WA = (() => {
  const M = 2 * WN, M2 = 2 * M;
  const f = new Float64Array(M2 / 2 * 2); // length 2M
  // f = [0; exp(-t²)(L²+t²)] for k = -M+1..M-1
  const fl = [0];
  for (let k = -M + 1; k <= M - 1; k++) { const th = k * Math.PI / M; const t = WL * Math.tan(th / 2); fl.push(Math.exp(-t * t) * (WL * WL + t * t)); }
  // fftshift (length 2M): swap halves
  const L = fl.length; const half = Math.floor(L / 2);
  for (let i = 0; i < L; i++) f[i] = fl[(i + half) % L];
  const a = new Float64Array(WN + 1);
  for (let k = 0; k <= WN; k++) { let s = 0; for (let j = 0; j < L; j++) s += f[j] * Math.cos(2 * Math.PI * j * k / L); a[k] = s / M2; }
  const out = []; for (let k = WN; k >= 1; k--) out.push(a[k]);
  return out;
})();
/** Faddeeva w(z) = exp(-z²) erfc(-iz) for Im z >= 0. */
export function faddeevaUpper(zr, zi) {
  // Z = (L + i z) / (L - i z)
  const nr = WL - zi, ni = zr; const dr = WL + zi, di = -zr;
  const [ir, ii] = cinv(dr, di);
  const [Zr, Zi] = cmul(nr, ni, ir, ii);
  let pr = 0, pi = 0;
  for (const c of WA) { const t = cmul(pr, pi, Zr, Zi); pr = t[0] + c; pi = t[1]; }
  const [d2r, d2i] = cmul(ir, ii, ir, ii);
  const [ar, ai] = cmul(2 * pr, 2 * pi, d2r, d2i);
  return [ar + ir / SQPI, ai + ii / SQPI];
}
/** erfi for complex z. */
function erfiComplex(zr, zi) {
  if (zi < 0) { const [r, i] = erfiComplex(zr, -zi); return [r, -i]; }
  if (Math.hypot(zr, zi) < 0.5) {
    // 2/√π Σ z^(2k+1) / (k! (2k+1))
    const [z2r, z2i] = cmul(zr, zi, zr, zi);
    let tr = zr, ti = zi, sr = zr, si = zi;
    for (let k = 1; k < 60; k++) { [tr, ti] = cmul(tr, ti, z2r, z2i); tr /= k; ti /= k; sr += tr / (2 * k + 1); si += ti / (2 * k + 1); if (Math.hypot(tr, ti) < 1e-18) break; }
    return [2 * sr / SQPI, 2 * si / SQPI];
  }
  // erfi(z) = -i (exp(z²) w(z) - 1)
  const [wr, wi] = faddeevaUpper(zr, zi);
  const [er, ei] = cexp(zr * zr - zi * zi, 2 * zr * zi);
  const [pr, pi] = cmul(er, ei, wr, wi);
  return [pi, -(pr - 1)];
}
function dawsonComplex(zr, zi) {
  if (zi < 0) { const [r, i] = dawsonComplex(zr, -zi); return [r, -i]; }
  if (Math.hypot(zr, zi) < 0.5) {
    const [ar, ai] = erfiComplex(zr, zi);
    const [er, ei] = cexp(-(zr * zr - zi * zi), -2 * zr * zi);
    const [r, i] = cmul(ar, ai, er, ei);
    return [r * SQPI / 2, i * SQPI / 2];
  }
  // F(z) = -i √π/2 (w(z) - exp(-z²))
  const [wr, wi] = faddeevaUpper(zr, zi);
  const [er, ei] = cexp(-(zr * zr - zi * zi), -2 * zr * zi);
  const dr = wr - er, di = wi - ei;
  return [di * SQPI / 2, -dr * SQPI / 2];
}
function erfiReal(x) {
  if (Number.isNaN(x)) return NaN;
  if (!Number.isFinite(x)) return x;
  if (Math.abs(x) > 26.7) return x > 0 ? Infinity : -Infinity;
  return 2 / SQPI * Math.exp(x * x) * dawsonReal(x);
}
function erfi(args) {
  if (args.length !== 1) throw E('erfi:nargin', 'erfi: one input is required.');
  return mapEl(args[0], 'erfi', erfiReal, erfiComplex);
}
function dawson(args) {
  if (args.length !== 1) throw E('dawson:nargin', 'dawson: one input is required.');
  return mapEl(args[0], 'dawson', dawsonReal, dawsonComplex);
}

// ------------------------------------------------------------ utilities
export function firstPrimes(n) {
  const out = [];
  if (n <= 0) return out;
  let lim = Math.max(30, Math.ceil(n * (Math.log(n + 1) + Math.log(Math.log(n + 3)) + 2)));
  for (;;) {
    const sieve = new Uint8Array(lim + 1);
    out.length = 0;
    for (let i = 2; i <= lim; i++) {
      if (sieve[i]) continue;
      out.push(i); if (out.length === n) return out;
      for (let j = i * i; j <= lim; j += i) sieve[j] = 1;
    }
    lim *= 2;
  }
}
function list_primes(args) {
  const n = args.length && !isEmptyV(args[0]) ? toNum(args[0]) : 25;
  if (!(n >= 0) || !Number.isFinite(n)) throw E('list_primes:badN', 'list_primes: N must be a non-negative integer.');
  return rowV(firstPrimes(Math.floor(n)));
}
function humps(args, nargout) {
  const x = args.length ? T(args[0], 'humps') : rowV(Array.from({ length: 21 }, (_, i) => i * 0.05));
  const y = mapEl(x, 'humps', (v) => 1 / ((v - 0.3) ** 2 + 0.01) + 1 / ((v - 0.9) ** 2 + 0.04) - 6,
    (re, im) => {
      const f = (a, b, c) => { const [r, i] = cinv((re - a) ** 2 - im * im + c, 2 * (re - a) * im); void b; return [r, i]; };
      const [p, q] = f(0.3, 0, 0.01), [r, s] = f(0.9, 0, 0.04);
      return [p + r - 6, q + s];
    });
  return nargout >= 2 ? [x, y] : y;
}

// ------------------------------------------------------------ curl / divergence
/** Derivative of data (dims) along dim (0-based) with coordinates c (length dims[dim]). */
function deriv(a, dims, dim, c) {
  const out = new Float64Array(a.length);
  let stride = 1; for (let i = 0; i < dim; i++) stride *= dims[i];
  const len = dims[dim]; const outer = prod(dims.slice(dim + 1));
  if (len < 2) return out;
  for (let o = 0; o < outer; o++) for (let i = 0; i < stride; i++) {
    const at = (k) => i + stride * (k + len * o);
    out[at(0)] = (a[at(1)] - a[at(0)]) / (c[1] - c[0]);
    out[at(len - 1)] = (a[at(len - 1)] - a[at(len - 2)]) / (c[len - 1] - c[len - 2]);
    for (let k = 1; k < len - 1; k++) out[at(k)] = (a[at(k + 1)] - a[at(k - 1)]) / (c[k + 1] - c[k - 1]);
  }
  return out;
}
/** Coordinate vector along dim from a vector or a meshgrid array. */
function coordsOf(v, dims, dim, fn) {
  const t = T(v, fn);
  const len = dims[dim] || 1;
  if (t.re.length === len && (t.dims.filter((d) => d !== 1).length <= 1)) return Array.from(t.re);
  if (prod(t.dims) === prod(dims)) {
    let stride = 1; for (let i = 0; i < dim; i++) stride *= dims[i];
    return Array.from({ length: len }, (_, k) => t.re[k * stride]);
  }
  throw E(`${fn}:sizeMismatch`, `${fn}: coordinate arrays must match the size of the vector field.`);
}
function fieldArgs(args, fn) {
  const na = args.length;
  let nd, coords = null, comps;
  if (na === 2 || na === 3) { nd = na; comps = args; }
  else if (na === 4) { nd = 2; coords = args.slice(0, 2); comps = args.slice(2); }
  else if (na === 6) { nd = 3; coords = args.slice(0, 3); comps = args.slice(3); }
  else throw E(`${fn}:nargin`, `${fn}: expected (fx, fy), (fx, fy, fz), (x, y, fx, fy) or (x, y, z, fx, fy, fz).`);
  const ts = comps.map((c) => T(c, fn));
  const dims = ts[0].dims.slice();
  for (const t of ts) if (t.dims.length !== dims.length || t.dims.some((d, i) => d !== dims[i])) throw E(`${fn}:sizeMismatch`, `${fn}: the vector field components must have the same size.`);
  if (nd === 2 && dims.length !== 2) throw E(`${fn}:badSize`, `${fn}: 2-D vector fields must be matrices.`);
  if (nd === 3) while (dims.length < 3) dims.push(1);
  // dims: [ny (rows, y), nx (columns, x), nz]
  const xs = coords ? coordsOf(coords[0], dims, 1, fn) : Array.from({ length: dims[1] }, (_, i) => i + 1);
  const ys = coords ? coordsOf(coords[1], dims, 0, fn) : Array.from({ length: dims[0] }, (_, i) => i + 1);
  const zs = nd === 3 ? (coords ? coordsOf(coords[2], dims, 2, fn) : Array.from({ length: dims[2] }, (_, i) => i + 1)) : null;
  return { nd, dims, f: ts.map((t) => t.re), xs, ys, zs, odims: ts[0].dims.slice() };
}
function curl(args, nargout) {
  const p = fieldArgs(args, 'curl');
  const out = (a) => tensor('double', p.odims, a);
  if (p.nd === 2) {
    const dFy = deriv(p.f[1], p.dims, 1, p.xs), dFx = deriv(p.f[0], p.dims, 0, p.ys);
    const cz = dFy.map((v, i) => v - dFx[i]);
    const av = cz.map((v) => v / 2);
    if (nargout <= 1) return out(av);
    return [out(cz), out(av)];
  }
  const [fx, fy, fz] = p.f;
  const dfz_dy = deriv(fz, p.dims, 0, p.ys), dfy_dz = deriv(fy, p.dims, 2, p.zs);
  const dfx_dz = deriv(fx, p.dims, 2, p.zs), dfz_dx = deriv(fz, p.dims, 1, p.xs);
  const dfy_dx = deriv(fy, p.dims, 1, p.xs), dfx_dy = deriv(fx, p.dims, 0, p.ys);
  const n = fx.length;
  const cx = new Float64Array(n), cy = new Float64Array(n), cz = new Float64Array(n), av = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    cx[i] = dfz_dy[i] - dfy_dz[i]; cy[i] = dfx_dz[i] - dfz_dx[i]; cz[i] = dfy_dx[i] - dfx_dy[i];
    av[i] = 0.5 * (cx[i] * fx[i] + cy[i] * fy[i] + cz[i] * fz[i]) / Math.sqrt(fx[i] * fx[i] + fy[i] * fy[i] + fz[i] * fz[i]);
  }
  if (nargout <= 1) return out(av);
  return [out(cx), out(cy), out(cz), out(av)].slice(0, Math.max(3, nargout));
}
function divergence(args) {
  const p = fieldArgs(args, 'divergence');
  const d = deriv(p.f[0], p.dims, 1, p.xs); const dy = deriv(p.f[1], p.dims, 0, p.ys);
  for (let i = 0; i < d.length; i++) d[i] += dy[i];
  if (p.nd === 3) { const dz = deriv(p.f[2], p.dims, 2, p.zs); for (let i = 0; i < d.length; i++) d[i] += dz[i]; }
  return tensor('double', p.odims, d);
}

// ------------------------------------------------------------ sums of squares, centering
function sumsqImpl(args, fn, mean) {
  if (args.length < 1 || args.length > 2) throw E(`${fn}:nargin`, `${fn}: expected (x) or (x, dim).`);
  const t = T(args[0], fn);
  if (prod(t.dims) === 0 && args.length < 2 && t.dims.length === 2 && t.dims[0] === 0 && t.dims[1] === 0) return num(mean ? NaN : 0);
  const dim = dimOf(args[1], t.dims, fn);
  return along(t, dim, 1, (re, im) => {
    let s = 0; for (let k = 0; k < re.length; k++) s += re[k] * re[k] + (im ? im[k] * im[k] : 0);
    return { re: [mean ? s / re.length : s] };
  });
}
const sumsq = (args) => sumsqImpl(args, 'sumsq', false);
const meansq = (args) => sumsqImpl(args, 'meansq', true);
function center(args) {
  if (args.length < 1 || args.length > 2) throw E('center:nargin', 'center: expected (x) or (x, dim).');
  const t = T(args[0], 'center');
  if (prod(t.dims) === 0) return tensor('double', t.dims.slice(), new Float64Array(0));
  const dim = dimOf(args[1], t.dims, 'center');
  const len = (t.dims[dim] || 1);
  return along(t, dim, len, (re, im) => {
    let m = 0, mi = 0; for (let k = 0; k < re.length; k++) { m += re[k]; if (im) mi += im[k]; }
    m /= re.length; mi /= re.length;
    return { re: Array.from(re, (v) => v - m), im: im ? Array.from(im, (v) => v - mi) : null };
  });
}

// ------------------------------------------------------------ orthogonal collocation
/** Roots of the Legendre polynomial P_n shifted to [0, 1] (ascending). */
export function legendreRoots01(n) {
  const r = [];
  for (let i = 1; i <= n; i++) {
    let x = Math.cos(Math.PI * (i - 0.25) / (n + 0.5));
    for (let it = 0; it < 100; it++) {
      let p0 = 1, p1 = x;
      for (let k = 2; k <= n; k++) { const p2 = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
      const pn = n === 0 ? 1 : p1, pm = n === 0 ? 0 : p0;
      const dp = n * (x * pn - pm) / (x * x - 1);
      const dx = pn / dp; x -= dx;
      if (Math.abs(dx) < 1e-16) break;
    }
    r.push((1 - x) / 2);
  }
  return r.sort((a, b) => a - b);
}
function colloc(args, nargout) {
  if (args.length < 1 || args.length > 3) throw E('colloc:nargin', 'colloc: expected colloc(n, "left", "right").');
  const n = toNum(args[0]);
  if (!(n >= 0) || n !== Math.floor(n)) throw E('colloc:badN', 'colloc: N must be a non-negative integer.');
  let left = false, right = false;
  for (const a of args.slice(1)) {
    const s = txt(a);
    if (s === 'l' || s === 'left') left = true;
    else if (s === 'r' || s === 'right') right = true;
    else throw E('colloc:badOption', 'colloc: optional arguments must be "left" or "right".');
  }
  const x = [...(left ? [0] : []), ...legendreRoots01(n), ...(right ? [1] : [])];
  const nt = x.length;
  if (!nt) throw E('colloc:empty', 'colloc: there must be at least one collocation point.');
  const dif1 = x.map((xi, i) => x.reduce((p, xk, k) => (k === i ? p : p * (xi - xk)), 1));
  const D = K.zerosM(nt, nt);
  for (let i = 0; i < nt; i++) {
    let s = 0;
    for (let j = 0; j < nt; j++) if (j !== i) { D[i][j] = (dif1[i] / dif1[j]) / (x[i] - x[j]); s += D[i][j]; }
    D[i][i] = 0 - s;
  }
  const B = K.mul(D, D);
  const q = x.map((xi, j) => {
    let ax = xi * (1 - xi);
    if (!left) ax = ax / xi / xi;
    if (!right) ax = ax / (1 - xi) / (1 - xi);
    return ax / (dif1[j] * dif1[j]);
  });
  const qs = q.reduce((a, b) => a + b, 0);
  const outs = [colV(x), mat(D, nt, nt), mat(B, nt, nt), colV(q.map((v) => v / qs))];
  return outs.slice(0, Math.max(1, nargout));
}

export const builtins = {
  arg, cbrt, signbit, roundb, lgamma, bincoeff, cosint, sinint, erfi, dawson, list_primes, humps, curl, divergence, sumsq, meansq, center, colloc,
};

export const help = {
  arg: H('Argument (phase angle) of complex values, in radians; the same as angle.', '복소수의 편각(위상각, 라디안). angle 과 같습니다.', ['theta = arg(z)']),
  cbrt: H('Real cube root of each element (negative inputs give negative roots).', '각 원소의 실수 세제곱근 (음수 입력은 음수 근).', ['y = cbrt(x)']),
  signbit: H('True where the sign bit of the floating-point value is set (including -0 and negative NaN).', '부동소수점 부호 비트가 켜진 원소에서 참 (-0 포함).', ['tf = signbit(x)']),
  roundb: H('Round to the nearest integer; exact halves round to the nearest even integer.', '가장 가까운 정수로 반올림하되, 정확히 절반이면 짝수로 반올림합니다.', ['y = roundb(x)']),
  lgamma: H('Natural logarithm of the gamma function (complex log|Γ| + iπ where Γ(x) < 0); the same as gammaln for positive x.', '감마 함수의 자연로그. Γ(x) < 0 이면 log|Γ| + iπ 를 돌려줍니다. 양수에서는 gammaln 과 같습니다.', ['y = lgamma(x)']),
  bincoeff: H('Binomial coefficient for real N and non-negative integer K (generalized binomial).', '실수 N 과 음이 아닌 정수 K 의 (일반화) 이항계수.', ['b = bincoeff(n, k)']),
  cosint: H('Cosine integral Ci(x) = γ + log(x) + ∫0^x (cos t − 1)/t dt; Ci(−x) = Ci(x) + iπ.', '코사인 적분 Ci(x). 음수 x 에서는 Ci(|x|) + iπ.', ['y = cosint(x)']),
  sinint: H('Sine integral Si(x) = ∫0^x sin(t)/t dt (real and complex arguments).', '사인 적분 Si(x) = ∫0^x sin(t)/t dt (실수·복소수).', ['y = sinint(x)']),
  erfi: H('Imaginary error function erfi(z) = −i·erf(iz) = 2/√π ∫0^z exp(t²) dt.', '허수 오차 함수 erfi(z) = −i·erf(iz).', ['y = erfi(z)']),
  dawson: H("Dawson's integral F(z) = exp(−z²) ∫0^z exp(t²) dt.", '도슨 적분 F(z) = exp(−z²) ∫0^z exp(t²) dt.', ['y = dawson(z)']),
  list_primes: H('Row vector of the first N prime numbers (default 25).', '처음 N 개의 소수를 행 벡터로 돌려줍니다 (기본 25).', ['p = list_primes()', 'p = list_primes(n)']),
  humps: H('Test function with two maxima for minimizers and integrators: 1/((x−.3)²+.01) + 1/((x−.9)²+.04) − 6.', '두 개의 봉우리가 있는 최적화·적분 시험 함수.', ['y = humps(x)', '[x, y] = humps(x)', 'y = humps()']),
  curl: H('Curl and angular velocity of a 2-D or 3-D vector field (meshgrid layout). With one output returns the angular velocity.', '2차원·3차원 벡터장의 회전(curl)과 각속도. 출력이 하나면 각속도를 돌려줍니다.', ['[cx, cy, cz, v] = curl(x, y, z, fx, fy, fz)', '[cz, v] = curl(x, y, fx, fy)', '[...] = curl(fx, fy, fz)', 'v = curl(fx, fy)']),
  divergence: H('Divergence of a 2-D or 3-D vector field (meshgrid layout).', '2차원·3차원 벡터장의 발산 (meshgrid 배치).', ['div = divergence(x, y, z, fx, fy, fz)', 'div = divergence(x, y, fx, fy)', 'div = divergence(fx, fy, fz)', 'div = divergence(fx, fy)']),
  sumsq: H('Sum of squares (|x|² for complex) along a dimension.', '차원을 따라 제곱(복소수는 |x|²)의 합.', ['y = sumsq(x)', 'y = sumsq(x, dim)']),
  meansq: H('Mean of the squares along a dimension.', '차원을 따라 제곱의 평균.', ['y = meansq(x)', 'y = meansq(x, dim)']),
  center: H('Subtract the mean along a dimension (result is double).', '차원을 따라 평균을 뺍니다 (결과는 double).', ['y = center(x)', 'y = center(x, dim)']),
  colloc: H('Orthogonal collocation points on [0, 1] (Legendre roots, optionally with the end points) with first- and second-derivative matrices and quadrature weights.', '[0, 1] 의 직교 배치점(르장드르 근, 끝점 선택)과 1·2차 미분 행렬 및 구적 가중치.', ['[r, amat, bmat, q] = colloc(n)', '[...] = colloc(n, "left")', '[...] = colloc(n, "left", "right")']),
};

export { F };
