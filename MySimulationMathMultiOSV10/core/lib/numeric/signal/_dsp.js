// Private helpers of the signal-processing submodule: complex scalars,
// zero/pole/gain transforms, frequency responses, vector/column handling.
import { E, M, F, row, col, cplx, isText, toStr } from '../_util.js';
import { roots as kroots, poly as kpoly, fft as kfft } from '../_kernels.js';

// ------------------------------------------------------------ complex scalars [re, im]
export const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export function cdiv(a, b) { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; }
export const cabs = (a) => Math.hypot(a[0], a[1]);
export const cscale = (a, s) => [a[0] * s, a[1] * s];
export const cneg = (a) => [-a[0], -a[1]];
export const conj = (a) => [a[0], -a[1]];
export function csqrt(a) {
  const m = Math.hypot(a[0], a[1]);
  const r = Math.sqrt(Math.max(0, (m + a[0]) / 2)); let i = Math.sqrt(Math.max(0, (m - a[0]) / 2));
  if (a[1] < 0) i = -i;
  return [r, i];
}
export function cexp(a) { const e = Math.exp(a[0]); return [e * Math.cos(a[1]), e * Math.sin(a[1])]; }
export const cprod = (list) => list.reduce((acc, x) => cmul(acc, x), [1, 0]);

/** Roots of a real polynomial as [re, im] pairs. */
export function rootsC(p) { const r = kroots(Array.from(p)); return r.re.map((x, i) => [x, r.im[i]]); }
/** Real polynomial from complex roots (imaginary residue dropped). */
export function polyR(list) { return kpoly(list.map((z) => z[0]), list.map((z) => z[1])); }
/** Complex polynomial from complex roots: [[re, im], ...] coefficients. */
export function polyCx(list) {
  let p = [[1, 0]];
  for (const z of list) { const q = new Array(p.length + 1).fill(null).map(() => [0, 0]); for (let j = 0; j < p.length; j++) { q[j] = cadd(q[j], p[j]); q[j + 1] = csub(q[j + 1], cmul(z, p[j])); } p = q; }
  return p;
}
/** Polynomial with real coefficients evaluated at a complex point (descending powers). */
export function pvalC(p, z) { let s = [0, 0]; for (const c of p) s = cadd(cmul(s, z), [c, 0]); return s; }

// ------------------------------------------------------------ zpk transforms (analog)
const negProd = (list) => cprod(list.map(cneg));
export function lp2lp(f, wo) { const d = f.p.length - f.z.length; return { z: f.z.map((z) => cscale(z, wo)), p: f.p.map((p) => cscale(p, wo)), k: f.k * wo ** d }; }
export function lp2hp(f, wo) {
  const d = f.p.length - f.z.length;
  const z = f.z.map((x) => cdiv([wo, 0], x)); const p = f.p.map((x) => cdiv([wo, 0], x));
  for (let i = 0; i < d; i++) z.push([0, 0]);
  return { z, p, k: f.k * cdiv(negProd(f.z), negProd(f.p))[0] };
}
function bpSplit(list, wo) { const out = []; for (const x of list) { const s = csqrt(csub(cmul(x, x), [wo * wo, 0])); out.push(cadd(x, s)); } for (const x of list) { const s = csqrt(csub(cmul(x, x), [wo * wo, 0])); out.push(csub(x, s)); } return out; }
export function lp2bp(f, wo, bw) {
  const d = f.p.length - f.z.length;
  const z = bpSplit(f.z.map((x) => cscale(x, bw / 2)), wo); const p = bpSplit(f.p.map((x) => cscale(x, bw / 2)), wo);
  for (let i = 0; i < d; i++) z.push([0, 0]);
  return { z, p, k: f.k * bw ** d };
}
export function lp2bs(f, wo, bw) {
  const d = f.p.length - f.z.length;
  const z = bpSplit(f.z.map((x) => cdiv([bw / 2, 0], x)), wo); const p = bpSplit(f.p.map((x) => cdiv([bw / 2, 0], x)), wo);
  for (let i = 0; i < d; i++) { z.push([0, wo]); z.push([0, -wo]); }
  return { z, p, k: f.k * cdiv(negProd(f.z), negProd(f.p))[0] };
}
/** Bilinear transform of an analog zpk with sample rate fs. */
export function bilinearZpk(f, fs) {
  const fs2 = 2 * fs; const d = f.p.length - f.z.length;
  const z = f.z.map((x) => cdiv(cadd([fs2, 0], x), csub([fs2, 0], x)));
  const p = f.p.map((x) => cdiv(cadd([fs2, 0], x), csub([fs2, 0], x)));
  for (let i = 0; i < d; i++) z.push([-1, 0]);
  const k = f.k * cdiv(cprod(f.z.map((x) => csub([fs2, 0], x))), cprod(f.p.map((x) => csub([fs2, 0], x))))[0];
  return { z, p, k };
}
/** Cleans tiny imaginary parts of a root list. */
export const cleanRoots = (list, tol = 1e-12) => list.map((z) => [z[0], Math.abs(z[1]) <= tol * Math.max(1, Math.abs(z[0])) ? 0 : z[1]]);

/** zpk → [b, a] real coefficient rows (b padded on the left to the length of a). */
export function zpk2tf(f) {
  const a = polyR(f.p); let b = polyR(f.z).map((x) => x * f.k);
  while (b.length < a.length) b.unshift(0);
  return { b, a };
}
/** Controller canonical state space of b/a (same form as tf2ss). */
export function tf2ssLocal(b, a) {
  b = Array.from(b); a = Array.from(a);
  while (a.length > 1 && a[0] === 0) a.shift();
  const a0 = a[0]; a = a.map((x) => x / a0); b = b.map((x) => x / a0);
  const n = a.length - 1;
  while (b.length < a.length) b.unshift(0);
  if (b.length > a.length) throw E('tf2ss:improper', 'Numerator degree must not exceed the denominator degree.');
  const D = b[0];
  const A = Array.from({ length: n }, (_, i) => new Array(n).fill(0));
  for (let j = 0; j < n; j++) A[0][j] = -a[j + 1];
  for (let i = 1; i < n; i++) A[i][i - 1] = 1;
  const B = Array.from({ length: n }, (_, i) => [i === 0 ? 1 : 0]);
  const Cr = [new Array(n).fill(0)]; for (let j = 0; j < n; j++) Cr[0][j] = b[j + 1] - b[0] * a[j + 1];
  return { A, B, C: Cr, D: [[D]] };
}

// ------------------------------------------------------------ frequency responses
/** H(e^{jw}) = B(e^{-jw}) / A(e^{-jw}) for b, a in powers of z^-1. Returns [re, im] arrays. */
export function freqzEval(b, a, w) {
  const n = w.length; const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let br = 0, bi = 0, ar = 0, ai = 0; const wi = w[i];
    for (let k = 0; k < b.length; k++) { br += b[k] * Math.cos(wi * k); bi -= b[k] * Math.sin(wi * k); }
    for (let k = 0; k < a.length; k++) { ar += a[k] * Math.cos(wi * k); ai -= a[k] * Math.sin(wi * k); }
    const h = cdiv([br, bi], [ar, ai]); re[i] = h[0]; im[i] = h[1];
  }
  return { re, im };
}
/** Analog H(jw) with b, a in descending powers of s. */
export function freqsEval(b, a, w) {
  const n = w.length; const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) { const h = cdiv(pvalC(b, [0, w[i]]), pvalC(a, [0, w[i]])); re[i] = h[0]; im[i] = h[1]; }
  return { re, im };
}

// ------------------------------------------------------------ vectors and columns
/** Real vector input → {a: Float64Array copy, row: boolean}. */
export function vecIn(v, what = 'Input') {
  const t = M(v, what);
  return { a: Float64Array.from(t.a), row: t.m === 1 && t.n !== 1, im: t.im ? Float64Array.from(t.im) : null, m: t.m, n: t.n };
}
export const vout = (a, isRow) => (isRow ? row(a) : col(a));
export function cvout(re, im, isRow) { const n = re.length; return cplx(isRow ? [1, n] : [n, 1], re, im); }
/** Columns of a matrix (a row vector counts as one column). */
export function columnsOf(v, what = 'Input') {
  const t = M(v, what);
  if (t.m === 1) return { cols: [Float64Array.from(t.a)], icols: t.im ? [Float64Array.from(t.im)] : null, isRow: true, len: t.n, ncol: 1 };
  const cols = [], icols = t.im ? [] : null;
  for (let j = 0; j < t.n; j++) { cols.push(t.a.slice(j * t.m, (j + 1) * t.m)); if (icols) icols.push(t.im.slice(j * t.m, (j + 1) * t.m)); }
  return { cols, icols, isRow: false, len: t.m, ncol: t.n };
}
/** Assembles columns (each length L) back into a Value; isRow → 1×L. Complex when ims given. */
export function fromColumns(cols, isRow, ims = null) {
  const L = cols.length ? cols[0].length : 0, n = cols.length;
  if (isRow && n === 1) return ims ? cplx([1, L], cols[0], ims[0]) : row(cols[0]);
  const re = new Float64Array(L * n); let im = ims ? new Float64Array(L * n) : null;
  for (let j = 0; j < n; j++) { re.set(cols[j], j * L); if (im) im.set(ims[j], j * L); }
  return cplx([L, n], re, im);
}
export const nextpow2 = (n) => (n <= 1 ? 0 : Math.ceil(Math.log2(n) - 1e-12));
export const sincf = (x) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
/** DFT of length n of a (zero-padded or truncated). */
export function dft(re, im, n, inverse = false) {
  const r = new Float64Array(n), i = new Float64Array(n);
  for (let k = 0; k < Math.min(n, re.length); k++) { r[k] = re[k]; if (im) i[k] = im[k]; }
  return kfft(r, i, inverse);
}
export const lowerText = (v) => (v != null && isText(v) ? toStr(v).toLowerCase() : null);
/** Linear convolution of two real arrays. */
export function convR(a, b) {
  const n = a.length + b.length - 1; if (!a.length || !b.length) return new Float64Array(0);
  const r = new Float64Array(n);
  if (a.length * b.length < 4e5) { for (let i = 0; i < a.length; i++) { const x = a[i]; if (x !== 0) for (let j = 0; j < b.length; j++) r[i + j] += x * b[j]; } return r; }
  let m = 1; while (m < n) m <<= 1;
  const A = dft(a, null, m), B = dft(b, null, m);
  const pr = new Float64Array(m), pi = new Float64Array(m);
  for (let k = 0; k < m; k++) { pr[k] = A.re[k] * B.re[k] - A.im[k] * B.im[k]; pi[k] = A.re[k] * B.im[k] + A.im[k] * B.re[k]; }
  const y = kfft(pr, pi, true); for (let k = 0; k < n; k++) r[k] = y.re[k];
  return r;
}
export { F, E };
