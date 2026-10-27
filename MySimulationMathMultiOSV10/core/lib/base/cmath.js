// Scalar complex math. Every function writes its result to C.re / C.im
// (module-level, read immediately by the caller) to avoid allocation.
export const C = { re: 0, im: 0 };
const set = (r, i) => { C.re = r; C.im = i; };

export function cmul(a, b, c, d) { set(a * c - b * d, a * d + b * c); }
export function cdiv(a, b, c, d) {
  if (d === 0) {
    if (b === 0) { set(a / c, 0); return; }
    set(a / c, b / c); return;
  }
  if (c === 0) { set(b / d, -a / d); return; }
  // Smith's algorithm
  if (Math.abs(c) >= Math.abs(d)) {
    const r = d / c, den = c + d * r;
    set((a + b * r) / den, (b - a * r) / den);
  } else {
    const r = c / d, den = c * r + d;
    set((a * r + b) / den, (b * r - a) / den);
  }
}
export const cabs = (a, b) => Math.hypot(a, b);
export function cexp(a, b) {
  if (b === 0) { set(Math.exp(a), 0); return; }
  const e = Math.exp(a); set(e * Math.cos(b), e * Math.sin(b));
}
export function clog(a, b) { set(Math.log(Math.hypot(a, b)), Math.atan2(b, a)); }
export function csqrt(a, b) {
  if (a === 0 && b === 0) { set(0, b); return; }
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    if (b === Infinity || b === -Infinity) { set(Infinity, b); return; }
    if (a === Infinity) { set(Infinity, Number.isNaN(b) ? NaN : 0 * b); return; }
    if (a === -Infinity) { set(Number.isNaN(b) ? NaN : 0, b >= 0 || Number.isNaN(b) ? Infinity : -Infinity); return; }
  }
  const t = Math.sqrt((Math.abs(a) + Math.hypot(a, b)) / 2);
  if (a >= 0) set(t, b / (2 * t));
  else set(Math.abs(b) / (2 * t), (b < 0 || Object.is(b, -0)) ? -t : t);
}
function ipow(a, b, n) {
  // binary exponentiation of complex (a,b) by integer n >= 0
  let rr = 1, ri = 0, pr = a, pi = b;
  while (n > 0) {
    if (n & 1) { const t = rr * pr - ri * pi; ri = rr * pi + ri * pr; rr = t; }
    n = Math.floor(n / 2);
    if (n) { const t = pr * pr - pi * pi; pi = 2 * pr * pi; pr = t; }
  }
  set(rr, ri);
}
export function cpow(a, b, c, d) {
  if (d === 0 && Number.isInteger(c) && Math.abs(c) <= 1024) {
    if (b === 0) { set(Math.pow(a, c), 0); return; } // real base, integer exponent
    if (c >= 0) { ipow(a, b, c); return; }
    ipow(a, b, -c); const r = C.re, i = C.im; cdiv(1, 0, r, i); return;
  }
  if (a === 0 && b === 0) {
    if (c > 0) { set(0, 0); return; }
    if (c === 0 && d === 0) { set(1, 0); return; }
    if (c < 0) { set(Infinity, 0); return; }
    set(NaN, NaN); return;
  }
  if (d === 0 && b === 0 && a > 0) { set(Math.pow(a, c), 0); return; }
  const lr = Math.log(Math.hypot(a, b)), li = Math.atan2(b, a);
  const er = c * lr - d * li, ei = c * li + d * lr;
  cexp(er, ei);
}
export function csin(a, b) { if (b === 0) { set(Math.sin(a), 0); return; } set(Math.sin(a) * Math.cosh(b), Math.cos(a) * Math.sinh(b)); }
export function ccos(a, b) { if (b === 0) { set(Math.cos(a), 0); return; } set(Math.cos(a) * Math.cosh(b), -Math.sin(a) * Math.sinh(b)); }
export function ctan(a, b) {
  if (b === 0) { set(Math.tan(a), 0); return; }
  if (Math.abs(b) > 20) { set(0, Math.sign(b)); return; }
  const den = Math.cos(2 * a) + Math.cosh(2 * b);
  set(Math.sin(2 * a) / den, Math.sinh(2 * b) / den);
}
export function csinh(a, b) { if (b === 0) { set(Math.sinh(a), 0); return; } set(Math.sinh(a) * Math.cos(b), Math.cosh(a) * Math.sin(b)); }
export function ccosh(a, b) { if (b === 0) { set(Math.cosh(a), 0); return; } set(Math.cosh(a) * Math.cos(b), Math.sinh(a) * Math.sin(b)); }
export function ctanh(a, b) {
  if (b === 0) { set(Math.tanh(a), 0); return; }
  if (Math.abs(a) > 20) { set(Math.sign(a), 0); return; }
  const den = Math.cosh(2 * a) + Math.cos(2 * b);
  set(Math.sinh(2 * a) / den, Math.sin(2 * b) / den);
}
// asin(z) = -i log(iz + sqrt(1 - z^2))
export function casin(a, b) {
  cmul(a, b, a, b); const zr = 1 - C.re, zi = -C.im;
  csqrt(zr, zi); const sr = C.re - b, si = C.im + a;
  clog(sr, si); set(C.im, -C.re);
}
// acos(z) = -i log(z + i sqrt(1 - z^2))
export function cacos(a, b) {
  cmul(a, b, a, b); const zr = 1 - C.re, zi = -C.im;
  csqrt(zr, zi); const sr = a - C.im, si = b + C.re;
  clog(sr, si); set(C.im, -C.re);
}
// atan(z) = i/2 log((i + z)/(i - z))
export function catan(a, b) {
  cdiv(a, 1 + b, -a, 1 - b); clog(C.re, C.im); set(-C.im / 2, C.re / 2);
}
// asinh(z) = log(z + sqrt(z^2 + 1))
export function casinh(a, b) {
  cmul(a, b, a, b); csqrt(C.re + 1, C.im); clog(a + C.re, b + C.im);
}
// acosh(z) = log(z + sqrt(z+1) sqrt(z-1))
export function cacosh(a, b) {
  csqrt(a + 1, b); const pr = C.re, pi = C.im;
  csqrt(a - 1, b); const qr = C.re, qi = C.im;
  cmul(pr, pi, qr, qi); clog(a + C.re, b + C.im);
}
// atanh(z) = 1/2 log((1+z)/(1-z))
export function catanh(a, b) {
  cdiv(1 + a, b, 1 - a, -b); clog(C.re, C.im); set(C.re / 2, C.im / 2);
}
export function clog10(a, b) { clog(a, b); set(C.re / Math.LN10, C.im / Math.LN10); }
export function clog2(a, b) { clog(a, b); set(C.re / Math.LN2, C.im / Math.LN2); }
