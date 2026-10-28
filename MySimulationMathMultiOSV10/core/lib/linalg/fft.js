// Fourier transforms (fft, ifft, fft2, ifft2, fftn, ifftn, fftshift,
// ifftshift, nextpow2), convolution (conv, conv2, deconv) and polynomials
// (polyfit, polyval, polyvalm, roots, poly, polyder, polyint, residue).
import {
  EPS, fail, warn, out, outMat, scalar, resultCls, optText, isOpt, scal, intArg, H, dbl, firstNonSingleton,
  isSparse, toTensor, tensor, num, cdiv,
} from './util.js';
import { fftInPlace, fftRealInto, alongDim } from './fft-kernel.js';
import { cm, toC, cmul, ctrans, allZero, ceye, cadd, qrFactor, qrQ, lsqQR, isRealM, cpow } from './kernels.js';
import { eigFull, solveDense } from './dense.js';
import { structOf, isStruct, sparseMatrix, isTensor } from '../../value.js';
import { field } from './util.js';

const isEmptyV = (v) => v == null || (v.dims && v.dims.reduce((a, b) => a * b, 1) === 0);

// ---------------------------------------------------------------- FFT

function fftAlong(t, n, dim, inverse, symmetric = false) {
  const len = t.dims[dim] ?? 1;
  const N = n == null ? len : n;
  const real = !t.im;
  const r = alongDim(t.dims, t.re, t.im, dim, N, (lr, li, yr, yi) => {
    const m = Math.min(len, N);
    if (real && !inverse) {
      const x = new Float64Array(N); for (let k = 0; k < m; k++) x[k] = lr[k];
      fftRealInto(x, yr, yi);
      return;
    }
    for (let k = 0; k < m; k++) { yr[k] = lr[k]; yi[k] = li ? li[k] : 0; }
    if (inverse && symmetric) {
      yi[0] = 0;
      for (let k = 1; k < N; k++) if (k > N - k) { yr[k] = yr[N - k]; yi[k] = -yi[N - k]; }
      if (N % 2 === 0) yi[N / 2] = 0;
    }
    fftInPlace(yr, yi, inverse);
    if (inverse) { const s = 1 / N; for (let k = 0; k < N; k++) { yr[k] *= s; yi[k] *= s; } }
  });
  if (inverse && symmetric) r.im = null;
  return r;
}

function fftArgs(args, fn) {
  if (!args.length) fail(`${fn}:notEnoughInputs`, 'Not enough input arguments.');
  let sym = false;
  const nums = [];
  for (const a of args) { const o = optText(a); if (o === 'symmetric') sym = true; else if (o === 'nonsymmetric') sym = false; else if (o != null) fail(`${fn}:badOption`, `Unknown option '${o}'.`); else nums.push(a); }
  const x = nums[0];
  const t = dbl(isSparse(x) ? toTensor(x) : x, fn, 'X');
  let n = null;
  if (nums.length > 1 && !isEmptyV(nums[1])) { n = intArg(nums[1], fn, 'n'); }
  let dim;
  if (nums.length > 2) { dim = intArg(nums[2], fn, 'dim') - 1; if (dim < 0) fail(`${fn}:badDim`, 'Dimension must be a positive integer.'); }
  else dim = firstNonSingleton(t.dims);
  return { t, n, dim, sym, cls: resultCls(x) };
}

function fftImpl(args, inverse) {
  const fn = inverse ? 'ifft' : 'fft';
  const { t, n, dim, sym, cls } = fftArgs(args, fn);
  if (t.re.length === 0 && n == null) return out(t.dims, t.re, null, cls);
  const r = fftAlong(t, n, dim, inverse, sym);
  return out(r.dims, r.re, r.im, cls);
}

function fftMulti(args, inverse, fn, nd) {
  const nums = []; let sym = false;
  for (const a of args) { const o = optText(a); if (o === 'symmetric') sym = true; else if (o === 'nonsymmetric') sym = false; else if (o != null) fail(`${fn}:badOption`, `Unknown option '${o}'.`); else nums.push(a); }
  if (!nums.length) fail(`${fn}:notEnoughInputs`, 'Not enough input arguments.');
  let t = dbl(isSparse(nums[0]) ? toTensor(nums[0]) : nums[0], fn, 'X');
  const cls = resultCls(nums[0]);
  let sizes;
  if (nd === 2) {
    if (nums.length >= 3) sizes = [intArg(nums[1], fn, 'm'), intArg(nums[2], fn, 'n')];
    else sizes = [t.dims[0], t.dims[1]];
  } else {
    if (nums.length >= 2) sizes = Array.from(dbl(nums[1], fn, 'siz').re);
    else sizes = t.dims.slice();
  }
  let cur = { dims: t.dims, re: t.re, im: t.im };
  for (let d = 0; d < sizes.length; d++) {
    const last = d === sizes.length - 1;
    const r = fftAlong(cur, sizes[d], d, inverse, sym && last);
    cur = { dims: r.dims, re: r.re, im: r.im };
  }
  if (inverse && sym) cur.im = null;
  return out(cur.dims, cur.re, cur.im, cls);
}

function shiftImpl(args, inverse) {
  const x = args[0];
  if (x == null) fail('fftshift:notEnoughInputs', 'Not enough input arguments.');
  const t = isSparse(x) ? toTensor(x) : x;
  if (!isTensor(t)) fail('fftshift:badInput', 'Input must be a numeric, logical or char array.');
  const dims = t.dims;
  const dimsToShift = args.length > 1 ? [intArg(args[1], 'fftshift', 'dim') - 1] : dims.map((_, i) => i);
  const shifts = dims.map(() => 0);
  for (const d of dimsToShift) if (d < dims.length) shifts[d] = inverse ? -Math.floor(dims[d] / 2) : Math.floor(dims[d] / 2);
  const n = t.re.length;
  const re = new Float64Array(n), im = t.im ? new Float64Array(n) : null;
  const sub = new Array(dims.length).fill(0);
  for (let k = 0; k < n; k++) {
    let rem = k, dst = 0, mul = 1;
    for (let d = 0; d < dims.length; d++) {
      sub[d] = rem % dims[d]; rem = Math.floor(rem / dims[d]);
      const s = ((sub[d] + shifts[d]) % dims[d] + dims[d]) % dims[d];
      dst += s * mul; mul *= dims[d];
    }
    re[dst] = t.re[k]; if (im) im[dst] = t.im[k];
  }
  return tensor(t.cls, dims, re, im);
}

// ---------------------------------------------------------------- polynomial helpers

/** Row of coefficients (complex) from a vector Value. */
function coeffs(v, fn, what = 'p') {
  const t = dbl(v, fn, what);
  if (!(t.dims.length === 2 && (t.dims[0] <= 1 || t.dims[1] <= 1))) fail(`${fn}:badInput`, `${what} must be a vector.`);
  return { re: Float64Array.from(t.re), im: t.im ? Float64Array.from(t.im) : new Float64Array(t.re.length) };
}
const rowOut = (c, cls = 'double') => out([1, c.re.length], c.re, allZero(c.im) ? null : c.im, cls);
function stripLeading(c) {
  let k = 0; while (k < c.re.length - 1 && c.re[k] === 0 && c.im[k] === 0) k++;
  return { re: c.re.slice(k), im: c.im.slice(k) };
}
function convC(a, b) {
  const n = a.re.length, m = b.re.length;
  if (n === 0 || m === 0) return { re: new Float64Array(0), im: new Float64Array(0) };
  const re = new Float64Array(n + m - 1), im = new Float64Array(n + m - 1);
  if (n * m > 4e6) {
    let N = 1; while (N < n + m - 1) N *= 2;
    const ar = new Float64Array(N), ai = new Float64Array(N), br = new Float64Array(N), bi = new Float64Array(N);
    ar.set(a.re); ai.set(a.im); br.set(b.re); bi.set(b.im);
    fftInPlace(ar, ai); fftInPlace(br, bi);
    for (let k = 0; k < N; k++) { const x = ar[k] * br[k] - ai[k] * bi[k]; ai[k] = ar[k] * bi[k] + ai[k] * br[k]; ar[k] = x; }
    fftInPlace(ar, ai, true);
    for (let k = 0; k < n + m - 1; k++) { re[k] = ar[k] / N; im[k] = ai[k] / N; }
    return { re, im };
  }
  for (let i = 0; i < n; i++) {
    const xr = a.re[i], xi = a.im[i]; if (xr === 0 && xi === 0) continue;
    for (let j = 0; j < m; j++) { re[i + j] += xr * b.re[j] - xi * b.im[j]; im[i + j] += xr * b.im[j] + xi * b.re[j]; }
  }
  return { re, im };
}
function polyvalC(p, xr, xi) {
  let yr = 0, yi = 0;
  for (let k = 0; k < p.re.length; k++) { const t = yr * xr - yi * xi + p.re[k]; yi = yr * xi + yi * xr + p.im[k]; yr = t; }
  return [yr, yi];
}
/** Polynomial with given roots (complex). */
function polyFromRoots(rr, ri) {
  let c = { re: Float64Array.of(1), im: Float64Array.of(0) };
  for (let k = 0; k < rr.length; k++) c = convC(c, { re: Float64Array.of(1, -rr[k]), im: Float64Array.of(0, -ri[k]) });
  return c;
}
function conjClosed(rr, ri) {
  const used = new Uint8Array(rr.length);
  for (let i = 0; i < rr.length; i++) {
    if (used[i]) continue;
    if (ri[i] === 0) { used[i] = 1; continue; }
    let found = -1;
    for (let j = 0; j < rr.length; j++) if (!used[j] && j !== i && rr[j] === rr[i] && ri[j] === -ri[i]) { found = j; break; }
    if (found < 0) return false;
    used[i] = 1; used[found] = 1;
  }
  return true;
}
/** Polynomial long division: y = q*a + r. */
function deconvC(y, a) {
  const ny = y.re.length, na = a.re.length;
  if (na === 0 || (a.re[0] === 0 && a.im[0] === 0)) fail('deconv:zeroFirstCoeff', 'First coefficient of A must be non-zero.');
  if (na > ny) return { q: { re: Float64Array.of(0), im: Float64Array.of(0) }, r: { re: Float64Array.from(y.re), im: Float64Array.from(y.im) } };
  const rr = Float64Array.from(y.re), ri = Float64Array.from(y.im);
  const nq = ny - na + 1; const qr = new Float64Array(nq), qi = new Float64Array(nq);
  for (let k = 0; k < nq; k++) {
    const [cr, ci] = cdiv(rr[k], ri[k], a.re[0], a.im[0]); qr[k] = cr; qi[k] = ci;
    for (let j = 0; j < na; j++) { rr[k + j] -= cr * a.re[j] - ci * a.im[j]; ri[k + j] -= cr * a.im[j] + ci * a.re[j]; }
    rr[k] = 0; ri[k] = 0;
  }
  return { q: { re: qr, im: qi }, r: { re: rr, im: ri } };
}
function polyderC(p) {
  const n = p.re.length; if (n <= 1) return { re: Float64Array.of(0), im: Float64Array.of(0) };
  const re = new Float64Array(n - 1), im = new Float64Array(n - 1);
  for (let k = 0; k < n - 1; k++) { const e = n - 1 - k; re[k] = p.re[k] * e; im[k] = p.im[k] * e; }
  return stripLeading({ re, im });
}
function addPoly(a, b) {
  const n = Math.max(a.re.length, b.re.length); const re = new Float64Array(n), im = new Float64Array(n);
  for (let k = 0; k < a.re.length; k++) { re[n - a.re.length + k] += a.re[k]; im[n - a.re.length + k] += a.im[k]; }
  for (let k = 0; k < b.re.length; k++) { re[n - b.re.length + k] += b.re[k]; im[n - b.re.length + k] += b.im[k]; }
  return { re, im };
}
const negPoly = (a) => ({ re: a.re.map((x) => -x), im: a.im.map((x) => -x) });

/** Roots of a polynomial (complex coefficients). Returns {re, im}. */
export function rootsC(c0) {
  let c = c0; let s = 0;
  while (s < c.re.length && c.re[s] === 0 && c.im[s] === 0) s++;
  let e = c.re.length - 1;
  while (e >= s && c.re[e] === 0 && c.im[e] === 0) e--;
  if (s > e) return { re: new Float64Array(0), im: new Float64Array(0) };
  const nz = c.re.length - 1 - e; // trailing zeros → zero roots
  const coef = { re: c.re.slice(s, e + 1), im: c.im.slice(s, e + 1) };
  for (let k = 0; k < coef.re.length; k++) if (!Number.isFinite(coef.re[k]) || !Number.isFinite(coef.im[k])) fail('roots:NonFiniteInput', 'Input to ROOTS must not contain NaN or Inf.');
  const n = coef.re.length - 1;
  const rr = [], ri = [];
  if (n >= 1) {
    const A = cm(n, n);
    for (let j = 0; j < n; j++) {
      const [x, y] = cdiv(-coef.re[j + 1], -coef.im[j + 1], coef.re[0], coef.im[0]);
      A.re[0 + j * n] = x; A.im[0 + j * n] = y;
    }
    for (let i = 1; i < n; i++) A.re[i + (i - 1) * n] = 1;
    const ev = eigFull(A, false);
    for (let i = 0; i < n; i++) { rr.push(ev.wr[i]); ri.push(ev.wi[i]); }
  }
  for (let k = 0; k < nz; k++) { rr.push(0); ri.push(0); }
  return { re: Float64Array.from(rr), im: Float64Array.from(ri) };
}

function vander(x, n) {
  const m = x.length; const A = cm(m, n + 1);
  for (let i = 0; i < m; i++) { let v = 1; for (let j = n; j >= 0; j--) { A.re[i + j * m] = v; v *= x[i]; } }
  return A;
}

// ---------------------------------------------------------------- residue

function groupPoles(pr, pi, tol = 1e-3) {
  // groups (nearly) equal poles; returns [{re, im, mult}] preserving order of first appearance
  const groups = [];
  for (let k = 0; k < pr.length; k++) {
    const g = groups.find((q) => Math.hypot(q.re - pr[k], q.im - pi[k]) <= tol * Math.max(1, Math.hypot(pr[k], pi[k])));
    if (g) { g.sumr += pr[k]; g.sumi += pi[k]; g.mult++; g.re = g.sumr / g.mult; g.im = g.sumi / g.mult; } else groups.push({ re: pr[k], im: pi[k], sumr: pr[k], sumi: pi[k], mult: 1 });
  }
  return groups;
}

function residueForward(b0, a0) {
  const b = stripLeading(b0), a = stripLeading(a0);
  if (a.re[0] === 0 && a.im[0] === 0) fail('residue:zeroDenominator', 'The denominator must not be zero.');
  // normalize
  const [nr, ni] = [a.re[0], a.im[0]];
  const norm = (p) => { const re = new Float64Array(p.re.length), im = new Float64Array(p.re.length); for (let k = 0; k < re.length; k++) { const [x, y] = cdiv(p.re[k], p.im[k], nr, ni); re[k] = x; im[k] = y; } return { re, im }; };
  const an = norm(a), bn = norm(b);
  let k = { re: new Float64Array(0), im: new Float64Array(0) };
  let rem = bn;
  if (bn.re.length >= an.re.length) {
    const d = deconvC(bn, an); k = d.q;
    rem = { re: d.r.re.slice(d.r.re.length - (an.re.length - 1)), im: d.r.im.slice(d.r.im.length - (an.re.length - 1)) };
  }
  const n = an.re.length - 1;
  if (n === 0) return { r: { re: [], im: [] }, p: { re: [], im: [] }, k };
  const rt = rootsC(an);
  const groups = groupPoles(Array.from(rt.re), Array.from(rt.im));
  // unknowns: r_{g,j} for j=1..mult; basis polynomial a(s)/(s-p)^j
  const basis = [], poles = [];
  for (const g of groups) {
    for (let j = 1; j <= g.mult; j++) {
      // a(s)/(s-p)^j = prod over other groups (s-q)^{mq} * (s-p)^{mult-j}
      let poly = { re: Float64Array.of(1), im: Float64Array.of(0) };
      for (const h of groups) {
        const e = h === g ? g.mult - j : h.mult;
        for (let t = 0; t < e; t++) poly = convC(poly, { re: Float64Array.of(1, -h.re), im: Float64Array.of(0, -h.im) });
      }
      const padded = { re: new Float64Array(n), im: new Float64Array(n) };
      padded.re.set(poly.re, n - poly.re.length); padded.im.set(poly.im, n - poly.im.length);
      basis.push(padded); poles.push([g.re, g.im]);
    }
  }
  const M = cm(n, n);
  basis.forEach((bp, j) => { for (let i = 0; i < n; i++) { M.re[i + j * n] = bp.re[i]; M.im[i + j * n] = bp.im[i]; } });
  const rhs = cm(n, 1);
  const rpad = { re: new Float64Array(n), im: new Float64Array(n) };
  rpad.re.set(rem.re.slice(-n), n - Math.min(n, rem.re.length)); rpad.im.set(rem.im.slice(-n), n - Math.min(n, rem.im.length));
  rhs.re.set(rpad.re); rhs.im.set(rpad.im);
  const X = solveDense(M, rhs, null, { warnings: false });
  return { r: { re: Array.from(X.re), im: Array.from(X.im) }, p: { re: poles.map((q) => q[0]), im: poles.map((q) => q[1]) }, k };
}

function residueInverse(r, p, k) {
  const n = p.re.length;
  const groups = []; // consecutive equal poles form multiplicities
  for (let i = 0; i < n; i++) {
    const last = groups[groups.length - 1];
    if (last && Math.hypot(last.re - p.re[i], last.im - p.im[i]) <= 1e-3 * Math.max(1, Math.hypot(p.re[i], p.im[i]))) { last.idx.push(i); }
    else groups.push({ re: p.re[i], im: p.im[i], idx: [i] });
  }
  const a = polyFromRoots(Float64Array.from(p.re), Float64Array.from(p.im));
  let b = { re: new Float64Array(Math.max(n, 1)), im: new Float64Array(Math.max(n, 1)) };
  for (const g of groups) {
    g.idx.forEach((ri, jj) => {
      const j = jj + 1;
      let poly = { re: Float64Array.of(1), im: Float64Array.of(0) };
      for (const h of groups) {
        const e = h === g ? g.idx.length - j : h.idx.length;
        for (let t = 0; t < e; t++) poly = convC(poly, { re: Float64Array.of(1, -h.re), im: Float64Array.of(0, -h.im) });
      }
      const sc = { re: poly.re.map((x, q) => x * r.re[ri] - poly.im[q] * r.im[ri]), im: poly.re.map((x, q) => x * r.im[ri] + poly.im[q] * r.re[ri]) };
      b = addPoly(b, sc);
    });
  }
  if (k.re.length) b = addPoly(b, convC(k, a));
  return { b: stripLeading(b), a };
}

function shapeArg(v, fn) {
  const o = optText(v);
  if (o == null) return null;
  if (!['full', 'same', 'valid'].includes(o)) fail(`${fn}:badShape`, "Shape must be 'full', 'same' or 'valid'.");
  return o;
}

// ---------------------------------------------------------------- builtins

export const builtins = {
  fft(args) { return fftImpl(args, false); },
  ifft(args) { return fftImpl(args, true); },
  fft2(args) { return fftMulti(args, false, 'fft2', 2); },
  ifft2(args) { return fftMulti(args, true, 'ifft2', 2); },
  fftn(args) { return fftMulti(args, false, 'fftn', 0); },
  ifftn(args) { return fftMulti(args, true, 'ifftn', 0); },
  fftshift(args) { return shiftImpl(args, false); },
  ifftshift(args) { return shiftImpl(args, true); },
  nextpow2(args) {
    const t = dbl(args[0], 'nextpow2');
    const re = new Float64Array(t.re.length);
    for (let i = 0; i < re.length; i++) {
      const a = Math.abs(t.im ? Math.hypot(t.re[i], t.im[i]) : t.re[i]);
      if (a === 0) re[i] = 0;
      else if (!Number.isFinite(a)) re[i] = a;
      else { let p = Math.ceil(Math.log2(a)); if (Math.pow(2, p - 1) >= a) p--; if (Math.pow(2, p) < a) p++; re[i] = p; }
    }
    return out(t.dims, re, null, resultCls(args[0]));
  },
  conv(args) {
    if (args.length < 2) fail('conv:notEnoughInputs', 'Not enough input arguments.');
    const shape = args.length > 2 ? shapeArg(args[2], 'conv') : 'full';
    const u = dbl(args[0], 'conv', 'u'), v = dbl(args[1], 'conv', 'v');
    const isVec = (t) => t.dims.length === 2 && (t.dims[0] <= 1 || t.dims[1] <= 1);
    if (!isVec(u) || !isVec(v)) fail('conv:AorBNotVector', 'A and B must be vectors.');
    const a = { re: u.re, im: u.im || new Float64Array(u.re.length) }, b = { re: v.re, im: v.im || new Float64Array(v.re.length) };
    let c = convC(a, b);
    const nu = u.re.length, nv = v.re.length;
    if (shape === 'same') { const s = Math.ceil((nv - 1) / 2); c = { re: c.re.slice(s, s + nu), im: c.im.slice(s, s + nu) }; if (nu && !c.re.length) c = { re: new Float64Array(nu), im: new Float64Array(nu) }; }
    else if (shape === 'valid') { const len = Math.max(0, nu - nv + 1); c = nv === 0 ? { re: new Float64Array(0), im: new Float64Array(0) } : { re: c.re.slice(nv - 1, nv - 1 + len), im: c.im.slice(nv - 1, nv - 1 + len) }; }
    const isCol = (t) => t.dims[1] === 1 && t.dims[0] !== 1;
    const isScal = (t) => t.re.length === 1;
    const col = (isCol(u) || isScal(u)) && (isCol(v) || isScal(v)) && !(isScal(u) && isScal(v)) || (shape === 'same' && isCol(u));
    const dims = col ? [c.re.length, 1] : [1, c.re.length];
    return out(dims, c.re, allZero(c.im) ? null : c.im, resultCls(args[0], args[1]));
  },
  deconv(args, nargout) {
    if (args.length < 2) fail('deconv:notEnoughInputs', 'Not enough input arguments.');
    const y = coeffs(args[0], 'deconv', 'y'), a = coeffs(args[1], 'deconv', 'a');
    const { q, r } = deconvC(y, a);
    const cls = resultCls(args[0], args[1]);
    const ydims = dbl(args[0], 'deconv').dims;
    const qv = ydims[1] === 1 && ydims[0] > 1 ? out([q.re.length, 1], q.re, allZero(q.im) ? null : q.im, cls) : rowOut(q, cls);
    if (nargout < 2) return qv;
    return [qv, out(ydims, r.re, allZero(r.im) ? null : r.im, cls)];
  },
  polyval(args, nargout) {
    if (args.length < 2) fail('polyval:notEnoughInputs', 'Not enough input arguments.');
    const p = coeffs(args[0], 'polyval');
    const x = dbl(args[1], 'polyval', 'x');
    const S = args[2], mu = args[3];
    let m0 = 0, m1 = 1;
    if (mu != null && !isEmptyV(mu)) { const t = dbl(mu, 'polyval', 'mu'); m0 = t.re[0]; m1 = t.re[1]; }
    const n = x.re.length; const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const xr = (x.re[i] - m0) / m1, xi = (x.im ? x.im[i] : 0) / m1;
      const [a, b] = polyvalC(p, xr, xi); re[i] = a; im[i] = b;
    }
    const y = out(x.dims, re, allZero(im) ? null : im, resultCls(args[0], args[1]));
    if (nargout < 2) return y;
    if (S == null || !isStruct(S)) fail('polyval:RequiresS', 'S is required to compute error estimates.');
    const R = dbl(field(S, 'R'), 'polyval', 'S.R'), df = scal(field(S, 'df'), 'polyval'), normr = scal(field(S, 'normr'), 'polyval');
    const nc = p.re.length;
    const xs = Float64Array.from(x.re, (v) => (v - m0) / m1);
    const A = vander(xs, nc - 1);
    // E = A / R  (solve E R = A)  → R' E' = A'
    const Rc = toC({ m: R.dims[0], n: R.dims[1], re: R.re, im: null });
    const Et = solveDense(ctrans(Rc, false), ctrans(A, false), null, { warnings: false });
    const delta = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0; for (let j = 0; j < Et.m; j++) s += Et.re[j + i * Et.m] ** 2;
      delta[i] = df === 0 ? Infinity : (normr / Math.sqrt(df)) * Math.sqrt(1 + s);
    }
    return [y, out(x.dims, delta)];
  },
  polyfit(args, nargout, ctx) {
    if (args.length < 3) fail('polyfit:notEnoughInputs', 'Not enough input arguments.');
    const x = dbl(args[0], 'polyfit', 'x'), y = dbl(args[1], 'polyfit', 'y');
    const n = intArg(args[2], 'polyfit', 'n');
    if (x.re.length !== y.re.length) fail('polyfit:XYSizeMismatch', 'The first two inputs must have the same number of elements.');
    const m = x.re.length;
    let xs = Float64Array.from(x.re), mu = null;
    if (nargout > 2) {
      let mean = 0; for (const v of xs) mean += v; mean /= m;
      let sd = 0; for (const v of xs) sd += (v - mean) ** 2; sd = Math.sqrt(sd / Math.max(1, m - 1));
      mu = [mean, sd]; xs = xs.map((v) => (v - mean) / sd);
    }
    const A = vander(xs, n);
    const yc = cm(m, 1, Float64Array.from(y.re), y.im ? Float64Array.from(y.im) : null);
    const F = qrFactor(A, false);
    const ls = lsqQR(A, yc);
    const K = Math.min(m, n + 1);
    let rank = 0; for (let i = 0; i < K; i++) if (Math.abs(F.R.re[i + i * m]) > Math.max(m, n + 1) * EPS * Math.abs(F.R.re[0])) rank++;
    if (rank < n + 1) {
      if (m <= n) warn(ctx, 'linalg:polyfit:PolyNotUnique', 'Polynomial is not unique; degree >= number of data points.');
      else warn(ctx, 'linalg:polyfit:RepeatedPointsOrRescale', 'Polynomial is badly conditioned. Add points with distinct X values, reduce the degree of the polynomial, or try centering and scaling as described in HELP POLYFIT.');
    }
    const p = { re: ls.X.re, im: ls.X.im };
    const pv = rowOut(p, resultCls(args[0], args[1]));
    if (nargout < 2) return pv;
    const R = cm(n + 1, n + 1);
    for (let j = 0; j <= n; j++) for (let i = 0; i <= Math.min(j, m - 1); i++) R.re[i + j * (n + 1)] = F.R.re[i + j * m];
    const res = cadd(cmul(A, ls.X), yc, -1);
    let normr = 0; for (let i = 0; i < m; i++) normr = Math.hypot(normr, res.re[i], res.im[i]);
    let ym = 0; for (const v of y.re) ym += v; ym /= m;
    let sst = 0; for (const v of y.re) sst += (v - ym) ** 2;
    const S = structOf({ R: outMat(n + 1, n + 1, R.re), df: num(Math.max(0, m - (n + 1))), normr: num(normr), rsquared: num(sst === 0 ? NaN : 1 - normr * normr / sst) });
    const outs = [pv, S];
    if (nargout > 2) outs.push(out([2, 1], mu));
    return outs;
  },
  polyvalm(args) {
    const p = coeffs(args[0], 'polyvalm');
    const X = dbl(args[1], 'polyvalm', 'X');
    if (X.dims.length > 2 || X.dims[0] !== X.dims[1]) fail('polyvalm:NonSquareMatrix', 'Matrix must be square.');
    const n = X.dims[0]; const Xc = toC({ m: n, n, re: X.re, im: X.im });
    let Y = cm(n, n);
    const I = ceye(n);
    for (let k = 0; k < p.re.length; k++) {
      Y = cmul(Y, Xc);
      for (let i = 0; i < n; i++) { Y.re[i * (n + 1)] += p.re[k] * I.re[i * (n + 1)]; Y.im[i * (n + 1)] += p.im[k]; }
    }
    return outMat(n, n, Y.re, allZero(Y.im) ? null : Y.im, resultCls(args[0], args[1]));
  },
  roots(args) {
    const c = coeffs(args[0], 'roots', 'c');
    const r = rootsC(c);
    return out([r.re.length, r.re.length ? 1 : 0], r.re, allZero(r.im) ? null : r.im, resultCls(args[0]));
  },
  poly(args) {
    const t = dbl(args[0], 'poly', 'r');
    let rr, ri;
    if (t.dims.length === 2 && t.dims[0] === t.dims[1] && t.dims[0] > 1) {
      const A = toC({ m: t.dims[0], n: t.dims[1], re: t.re, im: t.im });
      const e = eigFull(A, false); rr = e.wr; ri = e.wi;
    } else if (t.dims.length === 2 && (t.dims[0] <= 1 || t.dims[1] <= 1)) {
      rr = Float64Array.from(t.re); ri = t.im ? Float64Array.from(t.im) : new Float64Array(rr.length);
    } else fail('poly:InputSize', 'Argument must be a vector or a square matrix.');
    const keep = []; for (let i = 0; i < rr.length; i++) if (Number.isFinite(rr[i]) && Number.isFinite(ri[i])) keep.push(i);
    const c = polyFromRoots(Float64Array.from(keep, (i) => rr[i]), Float64Array.from(keep, (i) => ri[i]));
    let real = allZero(c.im) || conjClosed(Array.from(keep, (i) => rr[i]), Array.from(keep, (i) => ri[i]));
    const isMat = t.dims[0] === t.dims[1] && t.dims[0] > 1;
    if (isMat && isRealM(toC({ m: t.dims[0], n: t.dims[1], re: t.re, im: t.im }))) real = true;
    return out([1, c.re.length], c.re, real ? null : c.im, resultCls(args[0]));
  },
  polyder(args, nargout) {
    if (args.length === 1) return rowOut(polyderC(coeffs(args[0], 'polyder')), resultCls(args[0]));
    const a = coeffs(args[0], 'polyder', 'a'), b = coeffs(args[1], 'polyder', 'b');
    if (nargout < 2) {
      // derivative of a*b
      const d = addPoly(convC(polyderC(a), b), convC(a, polyderC(b)));
      return rowOut(stripLeading(d), resultCls(args[0], args[1]));
    }
    // quotient a/b: (a' b - a b') / b^2  (args are b, a in the reference order: [q,d] = polyder(b, a) for b/a)
    const num_ = addPoly(convC(polyderC(a), b), negPoly(convC(a, polyderC(b))));
    const den = convC(b, b);
    return [rowOut(stripLeading(num_), resultCls(args[0], args[1])), rowOut(stripLeading(den), resultCls(args[0], args[1]))];
  },
  polyint(args) {
    const p = coeffs(args[0], 'polyint');
    let kr = 0, ki = 0;
    if (args.length > 1) { const k = dbl(args[1], 'polyint', 'k'); kr = k.re[0]; ki = k.im ? k.im[0] : 0; }
    const n = p.re.length; const re = new Float64Array(n + 1), im = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) { const e = n - i; re[i] = p.re[i] / e; im[i] = p.im[i] / e; }
    re[n] = kr; im[n] = ki;
    return rowOut({ re, im }, resultCls(args[0]));
  },
  residue(args, nargout) {
    if (args.length === 2) {
      const b = coeffs(args[0], 'residue', 'b'), a = coeffs(args[1], 'residue', 'a');
      const { r, p, k } = residueForward(b, a);
      const col = (z) => out([z.re.length, z.re.length ? 1 : 0], z.re, z.im.some((v) => Math.abs(v) > 0) ? z.im : null);
      const kk = k.re.length ? rowOut(k) : out([0, 0], []);
      return [col(r), col(p), kk].slice(0, Math.max(1, nargout));
    }
    if (args.length === 3) {
      const r = coeffs(args[0], 'residue', 'r'), p = coeffs(args[1], 'residue', 'p');
      const k = isEmptyV(args[2]) ? { re: new Float64Array(0), im: new Float64Array(0) } : coeffs(args[2], 'residue', 'k');
      if (r.re.length !== p.re.length) fail('residue:sizeMismatch', 'R and P must be the same length.');
      const { b, a } = residueInverse(r, p, k);
      const realize = (z) => { let mx = 0, mi = 0; for (let i = 0; i < z.re.length; i++) { mx = Math.max(mx, Math.abs(z.re[i])); mi = Math.max(mi, Math.abs(z.im[i])); } return mi <= 1e3 * EPS * Math.max(1, mx) ? { re: z.re, im: new Float64Array(z.re.length) } : z; };
      return [rowOut(realize(b)), rowOut(realize(a))].slice(0, Math.max(1, nargout));
    }
    fail('residue:badInputs', 'Use [r, p, k] = residue(b, a) or [b, a] = residue(r, p, k).');
  },
};

export const help = {
  fft: H('Fast Fourier transform (any length).', '고속 푸리에 변환 (임의 길이).', ['Y = fft(X)', 'Y = fft(X, n)', 'Y = fft(X, n, dim)']),
  ifft: H('Inverse fast Fourier transform.', '역 고속 푸리에 변환.', ['X = ifft(Y)', 'X = ifft(Y, n, dim)', "X = ifft(..., 'symmetric')"]),
  fft2: H('2-D fast Fourier transform.', '2차원 고속 푸리에 변환.', ['Y = fft2(X)', 'Y = fft2(X, m, n)']),
  ifft2: H('2-D inverse fast Fourier transform.', '2차원 역 고속 푸리에 변환.', ['X = ifft2(Y)', 'X = ifft2(Y, m, n)', "X = ifft2(..., 'symmetric')"]),
  fftn: H('N-D fast Fourier transform.', 'N차원 고속 푸리에 변환.', ['Y = fftn(X)', 'Y = fftn(X, sz)']),
  ifftn: H('N-D inverse fast Fourier transform.', 'N차원 역 고속 푸리에 변환.', ['X = ifftn(Y)', 'X = ifftn(Y, sz)', "X = ifftn(..., 'symmetric')"]),
  fftshift: H('Shift the zero-frequency component to the center.', '0 주파수 성분을 가운데로 이동.', ['Y = fftshift(X)', 'Y = fftshift(X, dim)']),
  ifftshift: H('Inverse of fftshift.', 'fftshift의 역.', ['X = ifftshift(Y)', 'X = ifftshift(Y, dim)']),
  nextpow2: H('Exponent of the next higher power of 2.', '다음 2의 거듭제곱 지수.', ['P = nextpow2(A)']),
  conv: H('Convolution and polynomial multiplication.', '합성곱 및 다항식 곱셈.', ['w = conv(u, v)', "w = conv(u, v, shape)  % 'full' | 'same' | 'valid'"]),
  deconv: H('Deconvolution and polynomial division.', '역합성곱 및 다항식 나눗셈.', ['[q, r] = deconv(y, a)']),
  polyval: H('Polynomial evaluation.', '다항식 값 계산.', ['y = polyval(p, x)', '[y, delta] = polyval(p, x, S)', 'y = polyval(p, x, [], mu)']),
  polyfit: H('Polynomial curve fitting (least squares).', '다항식 곡선 맞춤 (최소제곱).', ['p = polyfit(x, y, n)', '[p, S] = polyfit(x, y, n)', '[p, S, mu] = polyfit(x, y, n)']),
  polyvalm: H('Matrix polynomial evaluation.', '행렬 다항식 계산.', ['Y = polyvalm(p, X)']),
  roots: H('Polynomial roots.', '다항식의 근.', ['r = roots(p)']),
  poly: H('Polynomial with the given roots, or characteristic polynomial.', '주어진 근을 갖는 다항식 또는 특성 다항식.', ['p = poly(r)', 'p = poly(A)']),
  polyder: H('Polynomial derivative.', '다항식 미분.', ['k = polyder(p)', 'k = polyder(a, b)', '[q, d] = polyder(b, a)']),
  polyint: H('Polynomial integration.', '다항식 적분.', ['q = polyint(p)', 'q = polyint(p, k)']),
  residue: H('Partial fraction expansion (residues).', '부분분수 전개 (유수).', ['[r, p, k] = residue(b, a)', '[b, a] = residue(r, p, k)']),
};
void sparseMatrix; void isOpt; void qrQ; void cpow; void scalar; void ctrans;
