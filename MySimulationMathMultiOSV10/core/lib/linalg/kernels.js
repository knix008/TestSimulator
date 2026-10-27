// Dense matrix kernels of the linear algebra area. Pure JS, no Values.
//
// A matrix is {m, n, re: Float64Array, im: Float64Array} in column-major
// order (element (i, j) at i + j*m). The generic kernels are complex; real
// data simply carries an all-zero imaginary part. Real-only kernels (the
// symmetric tridiagonal QL and the real Hessenberg QR) are used for speed and
// to return exact conjugate pairs for real input.
import { EPS, cdiv, csqrt, cmatmul } from './util.js';

// ---------------------------------------------------------------- basics

export function cm(m, n, re, im) {
  return { m, n, re: re || new Float64Array(m * n), im: im || new Float64Array(m * n) };
}
/** Complex copy of {m, n, re, im|null}. */
export function toC(a) {
  return { m: a.m, n: a.n, re: Float64Array.from(a.re), im: a.im ? Float64Array.from(a.im) : new Float64Array(a.re.length) };
}
export function allZero(x) { if (!x) return true; for (let i = 0; i < x.length; i++) if (x[i] !== 0) return false; return true; }
export const isRealM = (a) => allZero(a.im);
export function ceye(n) { const a = cm(n, n); for (let i = 0; i < n; i++) a.re[i * (n + 1)] = 1; return a; }
export function cmul(A, B) {
  const r = cmatmul(A.m, A.n, B.n, A.re, isRealM(A) ? null : A.im, B.re, isRealM(B) ? null : B.im);
  return cm(A.m, B.n, r.re, r.im || new Float64Array(A.m * B.n));
}
/** Conjugate transpose (conj = false: plain transpose). */
export function ctrans(A, conj = true) {
  const { m, n } = A; const B = cm(n, m); const s = conj ? -1 : 1;
  for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) { B.re[j + i * n] = A.re[i + j * m]; B.im[j + i * n] = s * A.im[i + j * m]; }
  return B;
}
export function cadd(A, B, alpha = 1) {
  const C = cm(A.m, A.n);
  for (let i = 0; i < C.re.length; i++) { C.re[i] = A.re[i] + alpha * B.re[i]; C.im[i] = A.im[i] + alpha * B.im[i]; }
  return C;
}
export function cscale(A, sr, si = 0) {
  const C = cm(A.m, A.n);
  for (let i = 0; i < C.re.length; i++) { const a = A.re[i], b = A.im[i]; C.re[i] = a * sr - b * si; C.im[i] = a * si + b * sr; }
  return C;
}
export const cabs1 = (r, i) => Math.abs(r) + Math.abs(i);
export function norm1(A) {
  let best = 0;
  for (let j = 0; j < A.n; j++) { let s = 0; for (let i = 0; i < A.m; i++) s += Math.hypot(A.re[i + j * A.m], A.im[i + j * A.m]); if (s > best || Number.isNaN(s)) best = s; }
  return best;
}
export function normInf(A) {
  let best = 0;
  for (let i = 0; i < A.m; i++) { let s = 0; for (let j = 0; j < A.n; j++) s += Math.hypot(A.re[i + j * A.m], A.im[i + j * A.m]); if (s > best || Number.isNaN(s)) best = s; }
  return best;
}
export function normFro(A) {
  let scale = 0, ssq = 1;
  const add = (x) => { x = Math.abs(x); if (x !== 0) { if (scale < x) { ssq = 1 + ssq * (scale / x) ** 2; scale = x; } else ssq += (x / scale) ** 2; } else if (Number.isNaN(x)) scale = NaN; };
  for (let i = 0; i < A.re.length; i++) { add(A.re[i]); add(A.im[i]); }
  return scale * Math.sqrt(ssq);
}
export function hasNonFinite(A) {
  for (let i = 0; i < A.re.length; i++) if (!Number.isFinite(A.re[i]) || !Number.isFinite(A.im[i])) return true;
  return false;
}

// complex scalars
export const cexp = (a, b) => { const e = Math.exp(a); return b === 0 ? [e, 0] : [e * Math.cos(b), e * Math.sin(b)]; };
export const clog = (a, b) => [Math.log(Math.hypot(a, b)), Math.atan2(b, a)];
export function cpow(a, b, c, d) {
  if (b === 0 && d === 0 && (a >= 0 || Number.isInteger(c))) return [Math.pow(a, c), 0];
  if (a === 0 && b === 0) { if (c === 0 && d === 0) return [1, 0]; if (c > 0) return [0, 0]; return [Infinity, 0]; }
  const [lr, li] = clog(a, b);
  return cexp(c * lr - d * li, c * li + d * lr);
}
export const cmulS = (a, b, c, d) => [a * c - b * d, a * d + b * c];

// ---------------------------------------------------------------- structure tests

export function isUpperTri(A) {
  const { m, n } = A;
  for (let j = 0; j < n; j++) for (let i = j + 1; i < m; i++) if (A.re[i + j * m] !== 0 || A.im[i + j * m] !== 0) return false;
  return true;
}
export function isLowerTri(A) {
  const { m, n } = A;
  for (let j = 0; j < n; j++) for (let i = 0; i < Math.min(j, m); i++) if (A.re[i + j * m] !== 0 || A.im[i + j * m] !== 0) return false;
  return true;
}
export function isHermitian(A, skew = false) {
  const { m, n } = A; if (m !== n) return false;
  const sg = skew ? -1 : 1;
  for (let j = 0; j < n; j++) for (let i = j; i < n; i++) {
    if (A.re[i + j * n] !== sg * A.re[j + i * n] || A.im[i + j * n] !== -sg * A.im[j + i * n]) return false;
  }
  return true;
}
export function isSymmetricT(A) {
  const { m, n } = A; if (m !== n) return false;
  for (let j = 0; j < n; j++) for (let i = j + 1; i < n; i++) if (A.re[i + j * n] !== A.re[j + i * n] || A.im[i + j * n] !== A.im[j + i * n]) return false;
  return true;
}
export function isUpperHess(A) {
  const { m, n } = A;
  for (let j = 0; j < n; j++) for (let i = j + 2; i < m; i++) if (A.re[i + j * m] !== 0 || A.im[i + j * m] !== 0) return false;
  return true;
}

// ---------------------------------------------------------------- LU

/** LU with partial pivoting of an m-by-n complex matrix. piv: row order (P*A = L*U). */
export function luFactor(A) {
  const { m, n } = A;
  const re = Float64Array.from(A.re), im = Float64Array.from(A.im);
  const piv = new Int32Array(m); for (let i = 0; i < m; i++) piv[i] = i;
  let sign = 1, info = -1;
  const kmax = Math.min(m, n);
  for (let k = 0; k < kmax; k++) {
    let p = k, best = -1;
    for (let i = k; i < m; i++) { const v = cabs1(re[i + k * m], im[i + k * m]); if (v > best || (Number.isNaN(v) && best < 0)) { best = v; p = i; } }
    if (p !== k) {
      for (let j = 0; j < n; j++) {
        const a = p + j * m, b = k + j * m;
        let t = re[a]; re[a] = re[b]; re[b] = t; t = im[a]; im[a] = im[b]; im[b] = t;
      }
      const t = piv[p]; piv[p] = piv[k]; piv[k] = t; sign = -sign;
    }
    const dr = re[k + k * m], di = im[k + k * m];
    if (dr === 0 && di === 0) { if (info < 0) info = k; continue; }
    const [ir, ii] = cdiv(1, 0, dr, di);
    for (let i = k + 1; i < m; i++) {
      const a = i + k * m; const xr = re[a], xi = im[a];
      re[a] = xr * ir - xi * ii; im[a] = xr * ii + xi * ir;
    }
    for (let j = k + 1; j < n; j++) {
      const ur = re[k + j * m], ui = im[k + j * m];
      if (ur === 0 && ui === 0) continue;
      const cj = j * m, ck = k * m;
      for (let i = k + 1; i < m; i++) {
        const lr = re[ck + i], li = im[ck + i];
        re[cj + i] -= lr * ur - li * ui; im[cj + i] -= lr * ui + li * ur;
      }
    }
  }
  return { m, n, re, im, piv, sign, info };
}

/** Solves op(A) X = B with a square LU factorization. trans: '' | 'T' | 'H'. B complex n-by-p. */
export function luSolve(F, B, trans = '') {
  const n = F.n, p = B.n, { re, im, piv } = F;
  const X = cm(n, p);
  const xr = new Float64Array(n), xi = new Float64Array(n);
  const cs = trans === 'H' ? -1 : 1;
  for (let c = 0; c < p; c++) {
    const off = c * n;
    if (!trans) {
      for (let i = 0; i < n; i++) { xr[i] = B.re[off + piv[i]]; xi[i] = B.im[off + piv[i]]; }
      for (let j = 0; j < n; j++) {
        const br = xr[j], bi = xi[j]; if (br === 0 && bi === 0) continue;
        for (let i = j + 1; i < n; i++) { const lr = re[i + j * n], li = im[i + j * n]; xr[i] -= lr * br - li * bi; xi[i] -= lr * bi + li * br; }
      }
      for (let j = n - 1; j >= 0; j--) {
        const [qr, qi] = cdiv(xr[j], xi[j], re[j + j * n], im[j + j * n]); xr[j] = qr; xi[j] = qi;
        if (qr === 0 && qi === 0) continue;
        for (let i = 0; i < j; i++) { const ur = re[i + j * n], ui = im[i + j * n]; xr[i] -= ur * qr - ui * qi; xi[i] -= ur * qi + ui * qr; }
      }
      X.re.set(xr, off); X.im.set(xi, off);
    } else {
      for (let i = 0; i < n; i++) { xr[i] = B.re[off + i]; xi[i] = B.im[off + i]; }
      // U^T y = b (forward)
      for (let i = 0; i < n; i++) {
        let sr = xr[i], si = xi[i];
        for (let k = 0; k < i; k++) { const ur = re[k + i * n], ui = cs * im[k + i * n]; sr -= ur * xr[k] - ui * xi[k]; si -= ur * xi[k] + ui * xr[k]; }
        const [qr, qi] = cdiv(sr, si, re[i + i * n], cs * im[i + i * n]); xr[i] = qr; xi[i] = qi;
      }
      // L^T z = y (backward, unit)
      for (let i = n - 1; i >= 0; i--) {
        let sr = xr[i], si = xi[i];
        for (let k = i + 1; k < n; k++) { const lr = re[k + i * n], li = cs * im[k + i * n]; sr -= lr * xr[k] - li * xi[k]; si -= lr * xi[k] + li * xr[k]; }
        xr[i] = sr; xi[i] = si;
      }
      for (let i = 0; i < n; i++) { X.re[off + piv[i]] = xr[i]; X.im[off + piv[i]] = xi[i]; }
    }
  }
  return X;
}

/** Triangular solve op(T) X = B. upper: T is upper triangular. trans '' | 'T' | 'H'. */
export function triSolve(T, B, upper, trans = '', unit = false) {
  const n = T.n, p = B.n;
  const X = cm(n, p);
  const effUpper = trans ? !upper : upper;
  const cs = trans === 'H' ? -1 : 1;
  const idx = trans ? (i, j) => j + i * n : (i, j) => i + j * n;
  for (let c = 0; c < p; c++) {
    const off = c * n;
    const xr = X.re.subarray(off, off + n), xi = X.im.subarray(off, off + n);
    for (let i = 0; i < n; i++) { xr[i] = B.re[off + i]; xi[i] = B.im[off + i]; }
    if (effUpper) {
      for (let i = n - 1; i >= 0; i--) {
        let sr = xr[i], si = xi[i];
        for (let j = i + 1; j < n; j++) { const k = idx(i, j); const tr = T.re[k], ti = cs * T.im[k]; sr -= tr * xr[j] - ti * xi[j]; si -= tr * xi[j] + ti * xr[j]; }
        if (unit) { xr[i] = sr; xi[i] = si; } else { const k = idx(i, i); const [qr, qi] = cdiv(sr, si, T.re[k], cs * T.im[k]); xr[i] = qr; xi[i] = qi; }
      }
    } else {
      for (let i = 0; i < n; i++) {
        let sr = xr[i], si = xi[i];
        for (let j = 0; j < i; j++) { const k = idx(i, j); const tr = T.re[k], ti = cs * T.im[k]; sr -= tr * xr[j] - ti * xi[j]; si -= tr * xi[j] + ti * xr[j]; }
        if (unit) { xr[i] = sr; xi[i] = si; } else { const k = idx(i, i); const [qr, qi] = cdiv(sr, si, T.re[k], cs * T.im[k]); xr[i] = qr; xi[i] = qi; }
      }
    }
  }
  return X;
}

/** Hager/Higham 1-norm estimate of inv(A) given solve(B, trans) functions. */
export function invNorm1Est(n, solve) {
  if (n === 0) return 0;
  const vec = (fill) => { const v = cm(n, 1); for (let i = 0; i < n; i++) v.re[i] = fill(i); return v; };
  let x = vec(() => 1 / n);
  let est = 0, lastJ = -1;
  for (let it = 0; it < 5; it++) {
    const y = solve(x, '');
    let ny = 0; for (let i = 0; i < n; i++) ny += Math.hypot(y.re[i], y.im[i]);
    if (!Number.isFinite(ny)) return Infinity;
    if (it > 0 && ny <= est) { est = Math.max(est, ny); break; }
    est = ny;
    const xi = cm(n, 1);
    for (let i = 0; i < n; i++) { const a = Math.hypot(y.re[i], y.im[i]); if (a === 0) xi.re[i] = 1; else { xi.re[i] = y.re[i] / a; xi.im[i] = y.im[i] / a; } }
    const z = solve(xi, 'H');
    let j = 0, zj = -1, zx = 0;
    for (let i = 0; i < n; i++) { const a = Math.hypot(z.re[i], z.im[i]); if (a > zj) { zj = a; j = i; } zx += z.re[i] * x.re[i] + z.im[i] * x.im[i]; }
    if (it > 0 && (zj <= zx || j === lastJ)) break;
    lastJ = j;
    x = cm(n, 1); x.re[j] = 1;
  }
  // alternating sign test vector
  const alt = vec((i) => (i % 2 ? -1 : 1) * (1 + (n > 1 ? i / (n - 1) : 0)));
  const y = solve(alt, '');
  let ny = 0; for (let i = 0; i < n; i++) ny += Math.hypot(y.re[i], y.im[i]);
  return Math.max(est, (2 * ny) / (3 * n));
}

/** Reciprocal 1-norm condition estimate from an LU factorization. */
export function rcondLU(A, F) {
  const n = A.n; if (n === 0) return Infinity;
  if (F.info >= 0) return 0;
  const an = norm1(A); if (an === 0) return 0;
  if (!Number.isFinite(an)) return Number.isNaN(an) ? NaN : 0;
  const inv = invNorm1Est(n, (b, t) => luSolve(F, b, t));
  if (!Number.isFinite(inv)) return 0;
  return 1 / (an * inv);
}
/** rcond of a triangular matrix. */
export function rcondTri(T, upper) {
  const n = T.n; if (n === 0) return Infinity;
  for (let i = 0; i < n; i++) if (T.re[i * (n + 1)] === 0 && T.im[i * (n + 1)] === 0) return 0;
  const an = norm1(T); if (an === 0) return 0;
  if (!Number.isFinite(an)) return Number.isNaN(an) ? NaN : 0;
  const inv = invNorm1Est(n, (b, t) => triSolve(T, b, upper, t));
  if (!Number.isFinite(inv)) return 0;
  return 1 / (an * inv);
}

// ---------------------------------------------------------------- Cholesky

/** A = R^H R using the upper triangle. Returns {R, p}: p = 0 on success, else the failing column (1-based). */
export function cholFactor(A) {
  const n = A.n; const R = cm(n, n);
  for (let j = 0; j < n; j++) {
    let s = A.re[j + j * n];
    for (let k = 0; k < j; k++) { const a = R.re[k + j * n], b = R.im[k + j * n]; s -= a * a + b * b; }
    if (!(s > 0) || A.im[j + j * n] !== 0) return { R, p: j + 1 };
    const d = Math.sqrt(s); R.re[j + j * n] = d;
    for (let i = j + 1; i < n; i++) {
      let sr = A.re[j + i * n], si = A.im[j + i * n];
      for (let k = 0; k < j; k++) {
        const ar = R.re[k + j * n], ai = -R.im[k + j * n], br = R.re[k + i * n], bi = R.im[k + i * n];
        sr -= ar * br - ai * bi; si -= ar * bi + ai * br;
      }
      R.re[j + i * n] = sr / d; R.im[j + i * n] = si / d;
    }
  }
  return { R, p: 0 };
}

// ---------------------------------------------------------------- Householder

/** Householder vector for x (complex, length len): returns {vr, vi, beta, ar, ai} with (I - beta v v^H) x = alpha e1. */
export function house(xr, xi) {
  const len = xr.length;
  let nrm = 0; for (let i = 0; i < len; i++) nrm = Math.hypot(nrm, xr[i], xi[i]);
  const vr = Float64Array.from(xr), vi = Float64Array.from(xi);
  if (nrm === 0) return { vr, vi, beta: 0, ar: 0, ai: 0 };
  const a0 = Math.hypot(xr[0], xi[0]);
  const pr = a0 === 0 ? 1 : xr[0] / a0, pi = a0 === 0 ? 0 : xi[0] / a0;
  const ar = -pr * nrm, ai = -pi * nrm;
  vr[0] -= ar; vi[0] -= ai;
  let vn = 0; for (let i = 0; i < len; i++) vn += vr[i] * vr[i] + vi[i] * vi[i];
  // when x is already a multiple of e1 with the "right" sign, v could be tiny: guard
  if (vn === 0) return { vr, vi, beta: 0, ar: xr[0], ai: xi[0] };
  return { vr, vi, beta: 2 / vn, ar, ai };
}
/** Applies (I - beta v v^H) from the left to rows r0.. of columns c0..c1-1 of A (m rows). */
function houseLeft(A, h, r0, c0, c1) {
  const { m, re, im } = A; const { vr, vi, beta } = h; const len = vr.length;
  if (beta === 0) return;
  for (let j = c0; j < c1; j++) {
    const o = r0 + j * m;
    let wr = 0, wi = 0;
    for (let i = 0; i < len; i++) { const ar = re[o + i], ai = im[o + i]; wr += vr[i] * ar + vi[i] * ai; wi += vr[i] * ai - vi[i] * ar; }
    wr *= beta; wi *= beta;
    if (wr === 0 && wi === 0) continue;
    for (let i = 0; i < len; i++) { re[o + i] -= vr[i] * wr - vi[i] * wi; im[o + i] -= vr[i] * wi + vi[i] * wr; }
  }
}
/** Applies (I - beta v v^H) from the right to columns c0.. of rows r0..r1-1. */
function houseRight(A, h, c0, r0, r1) {
  const { m, re, im } = A; const { vr, vi, beta } = h; const len = vr.length;
  if (beta === 0) return;
  for (let i = r0; i < r1; i++) {
    let wr = 0, wi = 0;
    for (let k = 0; k < len; k++) { const o = i + (c0 + k) * m; const ar = re[o], ai = im[o]; wr += ar * vr[k] - ai * vi[k]; wi += ar * vi[k] + ai * vr[k]; }
    wr *= beta; wi *= beta;
    if (wr === 0 && wi === 0) continue;
    for (let k = 0; k < len; k++) { const o = i + (c0 + k) * m; re[o] -= wr * vr[k] + wi * vi[k]; im[o] -= wi * vr[k] - wr * vi[k]; }
  }
}

/**
 * Householder QR with optional column pivoting. Returns {R (m-by-n upper), refl: [h...], perm: Int32Array}.
 * A(:, perm) = Q R with Q = H0 H1 ... H(k-1).
 */
export function qrFactor(A0, pivot = false) {
  const A = toC(A0); const { m, n } = A;
  const perm = new Int32Array(n); for (let j = 0; j < n; j++) perm[j] = j;
  const K = Math.min(m, n); const refl = [];
  const cn = new Float64Array(n);
  const colNorm = (j, r0) => { let s = 0; for (let i = r0; i < m; i++) s = Math.hypot(s, A.re[i + j * m], A.im[i + j * m]); return s; };
  for (let k = 0; k < K; k++) {
    if (pivot) {
      let best = -1, p = k;
      for (let j = k; j < n; j++) { cn[j] = colNorm(j, k); if (cn[j] > best) { best = cn[j]; p = j; } }
      if (p !== k) {
        for (let i = 0; i < m; i++) {
          const a = i + p * m, b = i + k * m;
          let t = A.re[a]; A.re[a] = A.re[b]; A.re[b] = t; t = A.im[a]; A.im[a] = A.im[b]; A.im[b] = t;
        }
        const t = perm[p]; perm[p] = perm[k]; perm[k] = t;
      }
    }
    const len = m - k;
    const xr = A.re.slice(k + k * m, m + k * m), xi = A.im.slice(k + k * m, m + k * m);
    const h = house(xr, xi); h.k = k;
    refl.push(h);
    if (h.beta !== 0) {
      houseLeft(A, h, k, k + 1, n);
      A.re[k + k * m] = h.ar; A.im[k + k * m] = h.ai;
      for (let i = k + 1; i < m; i++) { A.re[i + k * m] = 0; A.im[i + k * m] = 0; }
    }
    void len;
  }
  return { m, n, R: A, refl, perm };
}
/** Q (m-by-cols) from reflectors. */
export function qrQ(F, cols) {
  const { m } = F; const Q = cm(m, cols);
  for (let i = 0; i < Math.min(m, cols); i++) Q.re[i + i * m] = 1;
  for (let t = F.refl.length - 1; t >= 0; t--) { const h = F.refl[t]; houseLeft(Q, h, h.k, 0, cols); }
  return Q;
}
/** Q^H B. */
export function qrQhB(F, B) {
  const X = toC(B);
  for (const h of F.refl) houseLeft(X, h, h.k, 0, X.n);
  return X;
}
/** Makes the diagonal of R real non-negative-phase for complex data (adjusting Q). */
export function qrRealDiag(Q, R) {
  const K = Math.min(R.m, R.n);
  for (let k = 0; k < K; k++) {
    const dr = R.re[k + k * R.m], di = R.im[k + k * R.m];
    if (di === 0) continue;
    const a = Math.hypot(dr, di), pr = dr / a, pi = di / a;
    for (let j = k; j < R.n; j++) { const o = k + j * R.m; const x = R.re[o], y = R.im[o]; R.re[o] = x * pr + y * pi; R.im[o] = y * pr - x * pi; }
    R.im[k + k * R.m] = 0;
    if (Q) for (let i = 0; i < Q.m; i++) { const o = i + k * Q.m; const x = Q.re[o], y = Q.im[o]; Q.re[o] = x * pr - y * pi; Q.im[o] = x * pi + y * pr; }
  }
}

/** Least squares / basic solution via pivoted QR. Returns {X, rank, tol}. */
export function lsqQR(A, B) {
  const { m, n } = A; const F = qrFactor(A, true); const R = F.R;
  const K = Math.min(m, n);
  const r00 = K ? Math.hypot(R.re[0], R.im[0]) : 0;
  const tol = Math.max(m, n) * EPS * r00;
  let rank = 0; while (rank < K && Math.hypot(R.re[rank + rank * m], R.im[rank + rank * m]) > tol) rank++;
  const QB = qrQhB(F, B);
  const p = B.n; const X = cm(n, p);
  for (let c = 0; c < p; c++) {
    const yr = new Float64Array(rank), yi = new Float64Array(rank);
    for (let i = rank - 1; i >= 0; i--) {
      let sr = QB.re[i + c * m], si = QB.im[i + c * m];
      for (let j = i + 1; j < rank; j++) { const rr = R.re[i + j * m], ri = R.im[i + j * m]; sr -= rr * yr[j] - ri * yi[j]; si -= rr * yi[j] + ri * yr[j]; }
      const [qr, qi] = cdiv(sr, si, R.re[i + i * m], R.im[i + i * m]); yr[i] = qr; yi[i] = qi;
    }
    for (let i = 0; i < rank; i++) { X.re[F.perm[i] + c * n] = yr[i]; X.im[F.perm[i] + c * n] = yi[i]; }
  }
  return { X, rank, tol };
}

// ---------------------------------------------------------------- SVD (one-sided Jacobi)

/** Orthonormal completion: returns m-by-m matrix whose first k columns are U's first k (orthonormal) columns. */
export function completeBasis(U, k) {
  const m = U.m; const Q = cm(m, m);
  Q.re.set(U.re.subarray(0, m * k)); Q.im.set(U.im.subarray(0, m * k));
  let cnt = k;
  const vr = new Float64Array(m), vi = new Float64Array(m);
  for (let e = 0; e < m && cnt < m; e++) {
    vr.fill(0); vi.fill(0); vr[e] = 1;
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < cnt; j++) {
        let dr = 0, di = 0; const o = j * m;
        for (let i = 0; i < m; i++) { dr += Q.re[o + i] * vr[i] + Q.im[o + i] * vi[i]; di += Q.re[o + i] * vi[i] - Q.im[o + i] * vr[i]; }
        for (let i = 0; i < m; i++) { vr[i] -= Q.re[o + i] * dr - Q.im[o + i] * di; vi[i] -= Q.re[o + i] * di + Q.im[o + i] * dr; }
      }
    }
    let nr = 0; for (let i = 0; i < m; i++) nr = Math.hypot(nr, vr[i], vi[i]);
    if (nr < 0.5) continue;
    for (let i = 0; i < m; i++) { Q.re[cnt * m + i] = vr[i] / nr; Q.im[cnt * m + i] = vi[i] / nr; }
    cnt++;
  }
  return Q;
}

/**
 * Economy SVD of A (m-by-n). Returns {U (m-by-k), s (k), V (n-by-k)}, k = min(m, n),
 * s in descending order. wantUV = false skips the vectors.
 */
export function svdEcon(A0, wantUV = true) {
  const tr = A0.m < A0.n;
  let A = tr ? ctrans(A0) : toC(A0);
  const { m, n } = A; // m >= n
  const real = isRealM(A);
  // preconditioning by QR when tall
  let Qpre = null;
  if (m > n && n > 0) {
    const F = qrFactor(A, false);
    const R = cm(n, n);
    for (let j = 0; j < n; j++) for (let i = 0; i <= j; i++) { R.re[i + j * n] = F.R.re[i + j * m]; R.im[i + j * n] = F.R.im[i + j * m]; }
    if (wantUV) Qpre = qrQ(F, n);
    A = R;
  }
  const N = A.n, M = A.m;
  const gr = A.re, gi = A.im;
  const Vr = new Float64Array(N * N), Vi = new Float64Array(N * N);
  for (let i = 0; i < N; i++) Vr[i * (N + 1)] = 1;
  const nrm = new Float64Array(N);
  for (let j = 0; j < N; j++) { let s = 0; for (let i = 0; i < M; i++) s += gr[i + j * M] ** 2 + gi[i + j * M] ** 2; nrm[j] = s; }
  for (let sweep = 0; sweep < 80; sweep++) {
    let rotated = false;
    for (let p = 0; p < N - 1; p++) {
      for (let q = p + 1; q < N; q++) {
        const op = p * M, oq = q * M;
        let cr = 0, ci = 0;
        if (real) { for (let i = 0; i < M; i++) cr += gr[op + i] * gr[oq + i]; }
        else for (let i = 0; i < M; i++) { cr += gr[op + i] * gr[oq + i] + gi[op + i] * gi[oq + i]; ci += gr[op + i] * gi[oq + i] - gi[op + i] * gr[oq + i]; }
        const g = Math.hypot(cr, ci);
        const alpha = nrm[p], beta = nrm[q];
        if (g === 0 || g <= EPS * Math.sqrt(alpha * beta)) continue;
        rotated = true;
        const zeta = (beta - alpha) / (2 * g);
        const t = (zeta >= 0 ? 1 : -1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t), s = c * t;
        const er = cr / g, ei = -ci / g; // e^{-i phi}
        if (real) {
          const sg = er; // +-1
          for (let i = 0; i < M; i++) { const a = gr[op + i], b = sg * gr[oq + i]; gr[op + i] = c * a - s * b; gr[oq + i] = s * a + c * b; }
          for (let i = 0; i < N; i++) { const a = Vr[p * N + i], b = sg * Vr[q * N + i]; Vr[p * N + i] = c * a - s * b; Vr[q * N + i] = s * a + c * b; }
        } else {
          const rot = (xr, xi, o1, o2, len) => {
            for (let i = 0; i < len; i++) {
              const ar = xr[o1 + i], ai = xi[o1 + i];
              const br0 = xr[o2 + i], bi0 = xi[o2 + i];
              const br = br0 * er - bi0 * ei, bi = br0 * ei + bi0 * er;
              xr[o1 + i] = c * ar - s * br; xi[o1 + i] = c * ai - s * bi;
              xr[o2 + i] = s * ar + c * br; xi[o2 + i] = s * ai + c * bi;
            }
          };
          rot(gr, gi, op, oq, M); rot(Vr, Vi, p * N, q * N, N);
        }
        // update norms (recompute for accuracy)
        let sp = 0, sq = 0;
        for (let i = 0; i < M; i++) { sp += gr[op + i] ** 2 + gi[op + i] ** 2; sq += gr[oq + i] ** 2 + gi[oq + i] ** 2; }
        nrm[p] = sp; nrm[q] = sq;
      }
    }
    if (!rotated) break;
  }
  const order = Array.from({ length: N }, (_, j) => j).sort((a, b) => nrm[b] - nrm[a]);
  const s = new Float64Array(N);
  for (let k = 0; k < N; k++) s[k] = Math.sqrt(nrm[order[k]]);
  if (!wantUV) return { s };
  let U = cm(M, N); const V = cm(N, N);
  let good = 0;
  const smax = s[0] || 0;
  for (let k = 0; k < N; k++) {
    const j = order[k];
    for (let i = 0; i < N; i++) { V.re[i + k * N] = Vr[i + j * N]; V.im[i + k * N] = Vi[i + j * N]; }
    if (s[k] > 0 && s[k] > smax * 1e-300) {
      for (let i = 0; i < M; i++) { U.re[i + k * M] = gr[i + j * M] / s[k]; U.im[i + k * M] = gi[i + j * M] / s[k]; }
      good = k + 1;
    }
  }
  if (good < N) { const Uc = completeBasis(U, good); U = cm(M, N, Uc.re.slice(0, M * N), Uc.im.slice(0, M * N)); }
  if (Qpre) U = cmul(Qpre, U);
  if (tr) return { U: V, s, V: U };
  return { U, s, V };
}

// ---------------------------------------------------------------- symmetric eigenproblem (real)

/** Eigen-decomposition of a real symmetric matrix (tridiagonal QL). Returns {d ascending, V}. */
export function eigSymReal(a, n) {
  const V = []; for (let i = 0; i < n; i++) { V.push(new Float64Array(n)); for (let j = 0; j < n; j++) V[i][j] = a[i + j * n]; }
  const d = new Float64Array(n), e = new Float64Array(n);
  if (n === 0) return { d, V: new Float64Array(0) };
  // tred2
  for (let j = 0; j < n; j++) d[j] = V[n - 1][j];
  for (let i = n - 1; i > 0; i--) {
    let scale = 0, h = 0;
    for (let k = 0; k < i; k++) scale += Math.abs(d[k]);
    if (scale === 0) {
      e[i] = d[i - 1];
      for (let j = 0; j < i; j++) { d[j] = V[i - 1][j]; V[i][j] = 0; V[j][i] = 0; }
    } else {
      for (let k = 0; k < i; k++) { d[k] /= scale; h += d[k] * d[k]; }
      let f = d[i - 1]; let g = Math.sqrt(h); if (f > 0) g = -g;
      e[i] = scale * g; h -= f * g; d[i - 1] = f - g;
      for (let j = 0; j < i; j++) e[j] = 0;
      for (let j = 0; j < i; j++) {
        f = d[j]; V[j][i] = f; g = e[j] + V[j][j] * f;
        for (let k = j + 1; k <= i - 1; k++) { g += V[k][j] * d[k]; e[k] += V[k][j] * f; }
        e[j] = g;
      }
      f = 0;
      for (let j = 0; j < i; j++) { e[j] /= h; f += e[j] * d[j]; }
      const hh = f / (h + h);
      for (let j = 0; j < i; j++) e[j] -= hh * d[j];
      for (let j = 0; j < i; j++) {
        f = d[j]; g = e[j];
        for (let k = j; k <= i - 1; k++) V[k][j] -= f * e[k] + g * d[k];
        d[j] = V[i - 1][j]; V[i][j] = 0;
      }
    }
    d[i] = h;
  }
  for (let i = 0; i < n - 1; i++) {
    V[n - 1][i] = V[i][i]; V[i][i] = 1;
    const h = d[i + 1];
    if (h !== 0) {
      for (let k = 0; k <= i; k++) d[k] = V[k][i + 1] / h;
      for (let j = 0; j <= i; j++) {
        let g = 0;
        for (let k = 0; k <= i; k++) g += V[k][i + 1] * V[k][j];
        for (let k = 0; k <= i; k++) V[k][j] -= g * d[k];
      }
    }
    for (let k = 0; k <= i; k++) V[k][i + 1] = 0;
  }
  for (let j = 0; j < n; j++) { d[j] = V[n - 1][j]; V[n - 1][j] = 0; }
  V[n - 1][n - 1] = 1; e[0] = 0;
  // tql2
  for (let i = 1; i < n; i++) e[i - 1] = e[i];
  e[n - 1] = 0;
  let f = 0, tst1 = 0;
  for (let l = 0; l < n; l++) {
    tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]));
    let m = l;
    while (m < n) { if (Math.abs(e[m]) <= EPS * tst1) break; m++; }
    if (m === n) m = n - 1;
    if (m > l) {
      let iter = 0;
      do {
        iter++;
        let g = d[l];
        let p = (d[l + 1] - g) / (2 * e[l]);
        let r = Math.hypot(p, 1); if (p < 0) r = -r;
        d[l] = e[l] / (p + r); d[l + 1] = e[l] * (p + r);
        const dl1 = d[l + 1];
        let h = g - d[l];
        for (let i = l + 2; i < n; i++) d[i] -= h;
        f += h;
        p = d[m];
        let c = 1, c2 = c, c3 = c, s = 0, s2 = 0;
        const el1 = e[l + 1];
        for (let i = m - 1; i >= l; i--) {
          c3 = c2; c2 = c; s2 = s;
          g = c * e[i]; h = c * p; r = Math.hypot(p, e[i]);
          e[i + 1] = s * r; s = e[i] / r; c = p / r;
          p = c * d[i] - s * g;
          d[i + 1] = h + s * (c * g + s * d[i]);
          for (let k = 0; k < n; k++) { h = V[k][i + 1]; V[k][i + 1] = s * V[k][i] + c * h; V[k][i] = c * V[k][i] - s * h; }
        }
        p = (-s * s2 * c3 * el1 * e[l]) / dl1;
        e[l] = s * p; d[l] = c * p;
      } while (Math.abs(e[l]) > EPS * tst1 && iter < 300);
    }
    d[l] += f; e[l] = 0;
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => d[x] - d[y]);
  const dd = new Float64Array(n), VV = new Float64Array(n * n);
  for (let k = 0; k < n; k++) { const j = order[k]; dd[k] = d[j]; for (let i = 0; i < n; i++) VV[i + k * n] = V[i][j]; }
  // sign convention: make the largest-magnitude component... keep LAPACK-like: first nonzero component sign free; normalize so column sum of sign is deterministic
  return { d: dd, V: VV };
}

// ---------------------------------------------------------------- real nonsymmetric eigenproblem

/** Real Hessenberg reduction (orthogonal). Returns {H (n x n rows arrays), V}. */
function orthes(a, n) {
  const H = []; for (let i = 0; i < n; i++) { H.push(new Float64Array(n)); for (let j = 0; j < n; j++) H[i][j] = a[i + j * n]; }
  const V = []; for (let i = 0; i < n; i++) { V.push(new Float64Array(n)); V[i][i] = 1; }
  const ort = new Float64Array(n);
  const low = 0, high = n - 1;
  for (let m = low + 1; m <= high - 1; m++) {
    let scale = 0;
    for (let i = m; i <= high; i++) scale += Math.abs(H[i][m - 1]);
    if (scale !== 0) {
      let h = 0;
      for (let i = high; i >= m; i--) { ort[i] = H[i][m - 1] / scale; h += ort[i] * ort[i]; }
      let g = Math.sqrt(h); if (ort[m] > 0) g = -g;
      h -= ort[m] * g; ort[m] -= g;
      for (let j = m; j < n; j++) {
        let f = 0; for (let i = high; i >= m; i--) f += ort[i] * H[i][j];
        f /= h; for (let i = m; i <= high; i++) H[i][j] -= f * ort[i];
      }
      for (let i = 0; i <= high; i++) {
        let f = 0; for (let j = high; j >= m; j--) f += ort[j] * H[i][j];
        f /= h; for (let j = m; j <= high; j++) H[i][j] -= f * ort[j];
      }
      ort[m] = scale * ort[m]; H[m][m - 1] = scale * g;
    }
  }
  for (let m = high - 1; m >= low + 1; m--) {
    if (H[m][m - 1] !== 0) {
      for (let i = m + 1; i <= high; i++) ort[i] = H[i][m - 1];
      for (let j = m; j <= high; j++) {
        let g = 0; for (let i = m; i <= high; i++) g += ort[i] * V[i][j];
        g = g / ort[m] / H[m][m - 1];
        for (let i = m; i <= high; i++) V[i][j] += g * ort[i];
      }
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < i - 1; j++) H[i][j] = 0;
  return { H, V };
}

/** Real Hessenberg form: {H, P} column-major arrays with A = P H P'. */
export function hessReal(a, n) {
  const { H, V } = orthes(a, n);
  const h = new Float64Array(n * n), p = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { h[i + j * n] = H[i][j]; p[i + j * n] = V[i][j]; }
  return { H: h, P: p };
}

/**
 * Real Schur / eigen-decomposition by the double-shift QR algorithm.
 * Returns {wr, wi, T, U} (T, U as row arrays) and, when vectors = true, {V} real
 * eigenvector columns in the "pairs" format (column j real part, j+1 imaginary part).
 */
export function hqr(a, n, { vectors = true, schur = false } = {}) {
  const { H, V } = orthes(a, n);
  const d = new Float64Array(n), e = new Float64Array(n);
  let nn = n, high = nn - 1, low = 0;
  let N = nn - 1, exshift = 0, p = 0, q = 0, r = 0, s = 0, z = 0, t, w, x, y;
  let norm = 0;
  for (let i = 0; i < nn; i++) for (let j = Math.max(i - 1, 0); j < nn; j++) norm += Math.abs(H[i][j]);
  let iter = 0, total = 0;
  while (N >= low) {
    let l = N;
    while (l > low) {
      s = Math.abs(H[l - 1][l - 1]) + Math.abs(H[l][l]);
      if (s === 0) s = norm;
      if (Math.abs(H[l][l - 1]) < EPS * s) break;
      l--;
    }
    if (l === N) {
      H[N][N] += exshift; d[N] = H[N][N]; e[N] = 0; N--; iter = 0;
    } else if (l === N - 1) {
      w = H[N][N - 1] * H[N - 1][N];
      p = (H[N - 1][N - 1] - H[N][N]) / 2;
      q = p * p + w;
      z = Math.sqrt(Math.abs(q));
      H[N][N] += exshift; H[N - 1][N - 1] += exshift;
      x = H[N][N];
      if (q >= 0) {
        z = p >= 0 ? p + z : p - z;
        d[N - 1] = x + z; d[N] = d[N - 1]; if (z !== 0) d[N] = x - w / z;
        e[N - 1] = 0; e[N] = 0;
        x = H[N][N - 1];
        s = Math.abs(x) + Math.abs(z); p = x / s; q = z / s; r = Math.sqrt(p * p + q * q); p /= r; q /= r;
        for (let j = N - 1; j < nn; j++) { z = H[N - 1][j]; H[N - 1][j] = q * z + p * H[N][j]; H[N][j] = q * H[N][j] - p * z; }
        for (let i = 0; i <= N; i++) { z = H[i][N - 1]; H[i][N - 1] = q * z + p * H[i][N]; H[i][N] = q * H[i][N] - p * z; }
        for (let i = low; i <= high; i++) { z = V[i][N - 1]; V[i][N - 1] = q * z + p * V[i][N]; V[i][N] = q * V[i][N] - p * z; }
        H[N][N - 1] = 0;
      } else {
        d[N - 1] = x + p; d[N] = x + p; e[N - 1] = z; e[N] = -z;
      }
      N -= 2; iter = 0;
    } else {
      x = H[N][N]; y = 0; w = 0;
      if (l < N) { y = H[N - 1][N - 1]; w = H[N][N - 1] * H[N - 1][N]; }
      if (iter === 10) {
        exshift += x;
        for (let i = low; i <= N; i++) H[i][i] -= x;
        s = Math.abs(H[N][N - 1]) + Math.abs(H[N - 1][N - 2]);
        x = y = 0.75 * s; w = -0.4375 * s * s;
      }
      if (iter === 30) {
        s = (y - x) / 2; s = s * s + w;
        if (s > 0) {
          s = Math.sqrt(s); if (y < x) s = -s;
          s = x - w / ((y - x) / 2 + s);
          for (let i = low; i <= N; i++) H[i][i] -= s;
          exshift += s; x = y = w = 0.964;
        }
      }
      iter++; total++;
      if (total > 100 * Math.max(n, 10)) throw new Error('hqr: no convergence');
      let m = N - 2;
      while (m >= l) {
        z = H[m][m]; r = x - z; s = y - z;
        p = (r * s - w) / H[m + 1][m] + H[m][m + 1];
        q = H[m + 1][m + 1] - z - r - s;
        r = H[m + 2][m + 1];
        s = Math.abs(p) + Math.abs(q) + Math.abs(r); p /= s; q /= s; r /= s;
        if (m === l) break;
        if (Math.abs(H[m][m - 1]) * (Math.abs(q) + Math.abs(r)) < EPS * (Math.abs(p) * (Math.abs(H[m - 1][m - 1]) + Math.abs(z) + Math.abs(H[m + 1][m + 1])))) break;
        m--;
      }
      for (let i = m + 2; i <= N; i++) { H[i][i - 2] = 0; if (i > m + 2) H[i][i - 3] = 0; }
      for (let k = m; k <= N - 1; k++) {
        const notlast = k !== N - 1;
        if (k !== m) {
          p = H[k][k - 1]; q = H[k + 1][k - 1]; r = notlast ? H[k + 2][k - 1] : 0;
          x = Math.abs(p) + Math.abs(q) + Math.abs(r);
          if (x === 0) continue;
          p /= x; q /= x; r /= x;
        }
        s = Math.sqrt(p * p + q * q + r * r); if (p < 0) s = -s;
        if (s !== 0) {
          if (k !== m) H[k][k - 1] = -s * x;
          else if (l !== m) H[k][k - 1] = -H[k][k - 1];
          p += s; x = p / s; y = q / s; z = r / s; q /= p; r /= p;
          for (let j = k; j < nn; j++) {
            p = H[k][j] + q * H[k + 1][j];
            if (notlast) { p += r * H[k + 2][j]; H[k + 2][j] -= p * z; }
            H[k][j] -= p * x; H[k + 1][j] -= p * y;
          }
          for (let i = 0; i <= Math.min(N, k + 3); i++) {
            p = x * H[i][k] + y * H[i][k + 1];
            if (notlast) { p += z * H[i][k + 2]; H[i][k + 2] -= p * r; }
            H[i][k] -= p; H[i][k + 1] -= p * q;
          }
          for (let i = low; i <= high; i++) {
            p = x * V[i][k] + y * V[i][k + 1];
            if (notlast) { p += z * V[i][k + 2]; V[i][k + 2] -= p * r; }
            V[i][k] -= p; V[i][k + 1] -= p * q;
          }
        }
      }
    }
  }
  const res = { wr: d, wi: e };
  if (schur) {
    const T = new Float64Array(n * n), U = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { T[i + j * n] = j >= i - 1 ? H[i][j] : 0; U[i + j * n] = V[i][j]; }
    for (let i = 1; i < n; i++) if (!(e[i - 1] > 0 && e[i] < 0 && d[i - 1] === d[i])) T[i + (i - 1) * n] = 0;
    standardizeBlocks(T, U, n, e);
    res.T = T; res.U = U;
  }
  if (!vectors) return res;
  if (norm === 0) { const Vc = new Float64Array(n * n); for (let i = 0; i < n; i++) Vc[i * (n + 1)] = 1; res.V = Vc; return res; }
  for (N = nn - 1; N >= 0; N--) {
    p = d[N]; q = e[N];
    if (q === 0) {
      let l = N; H[N][N] = 1;
      for (let i = N - 1; i >= 0; i--) {
        w = H[i][i] - p; r = 0;
        for (let j = l; j <= N; j++) r += H[i][j] * H[j][N];
        if (e[i] < 0) { z = w; s = r; } else {
          l = i;
          if (e[i] === 0) H[i][N] = w !== 0 ? -r / w : -r / (EPS * norm);
          else {
            x = H[i][i + 1]; y = H[i + 1][i];
            q = (d[i] - p) * (d[i] - p) + e[i] * e[i];
            t = (x * s - z * r) / q;
            H[i][N] = t;
            H[i + 1][N] = Math.abs(x) > Math.abs(z) ? (-r - w * t) / x : (-s - y * t) / z;
          }
          t = Math.abs(H[i][N]);
          if (EPS * t * t > 1) for (let j = i; j <= N; j++) H[j][N] /= t;
        }
      }
    } else if (q < 0) {
      let l = N - 1;
      if (Math.abs(H[N][N - 1]) > Math.abs(H[N - 1][N])) {
        H[N - 1][N - 1] = q / H[N][N - 1];
        H[N - 1][N] = -(H[N][N] - p) / H[N][N - 1];
      } else {
        const [cr, ci] = cdiv(0, -H[N - 1][N], H[N - 1][N - 1] - p, q);
        H[N - 1][N - 1] = cr; H[N - 1][N] = ci;
      }
      H[N][N - 1] = 0; H[N][N] = 1;
      for (let i = N - 2; i >= 0; i--) {
        let ra = 0, sa = 0;
        for (let j = l; j <= N; j++) { ra += H[i][j] * H[j][N - 1]; sa += H[i][j] * H[j][N]; }
        w = H[i][i] - p;
        if (e[i] < 0) { z = w; r = ra; s = sa; } else {
          l = i;
          if (e[i] === 0) {
            const [cr, ci] = cdiv(-ra, -sa, w, q); H[i][N - 1] = cr; H[i][N] = ci;
          } else {
            x = H[i][i + 1]; y = H[i + 1][i];
            let vr = (d[i] - p) * (d[i] - p) + e[i] * e[i] - q * q;
            const vi = (d[i] - p) * 2 * q;
            if (vr === 0 && vi === 0) vr = EPS * norm * (Math.abs(w) + Math.abs(q) + Math.abs(x) + Math.abs(y) + Math.abs(z));
            const [cr, ci] = cdiv(x * r - z * ra + q * sa, x * s - z * sa - q * ra, vr, vi);
            H[i][N - 1] = cr; H[i][N] = ci;
            if (Math.abs(x) > Math.abs(z) + Math.abs(q)) {
              H[i + 1][N - 1] = (-ra - w * H[i][N - 1] + q * H[i][N]) / x;
              H[i + 1][N] = (-sa - w * H[i][N] - q * H[i][N - 1]) / x;
            } else {
              const [c2r, c2i] = cdiv(-r - y * H[i][N - 1], -s - y * H[i][N], z, q);
              H[i + 1][N - 1] = c2r; H[i + 1][N] = c2i;
            }
          }
          t = Math.max(Math.abs(H[i][N - 1]), Math.abs(H[i][N]));
          if (EPS * t * t > 1) for (let j = i; j <= N; j++) { H[j][N - 1] /= t; H[j][N] /= t; }
        }
      }
    }
  }
  for (let j = nn - 1; j >= low; j--) {
    for (let i = low; i <= high; i++) {
      z = 0;
      for (let k = low; k <= Math.min(j, high); k++) z += V[i][k] * H[k][j];
      V[i][j] = z;
    }
  }
  const Vc = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) Vc[i + j * n] = V[i][j];
  res.V = Vc;
  return res;
}

/** Standardizes the 2x2 blocks of a real Schur form (equal diagonal, b*c < 0). */
function standardizeBlocks(T, U, n, e) {
  for (let k = 0; k < n - 1; k++) {
    if (T[k + 1 + k * n] === 0) continue;
    const a = T[k + k * n], b = T[k + (k + 1) * n], c = T[k + 1 + k * n], d = T[k + 1 + (k + 1) * n];
    if (a === d && Math.sign(b) !== Math.sign(c)) { k++; continue; }
    const temp = a - d, p = 0.5 * temp;
    const sigma = b + c;
    const tau = Math.hypot(sigma, temp);
    const cs = Math.sqrt(0.5 * (1 + Math.abs(sigma) / tau));
    const sn = -(p / (tau * cs)) * (sigma >= 0 ? 1 : -1);
    // rows k, k+1 (all columns >= k): Q^T T
    for (let j = k; j < n; j++) {
      const r1 = T[k + j * n], r2 = T[k + 1 + j * n];
      T[k + j * n] = cs * r1 + sn * r2; T[k + 1 + j * n] = -sn * r1 + cs * r2;
    }
    for (let i = 0; i <= k + 1; i++) {
      const c1 = T[i + k * n], c2 = T[i + (k + 1) * n];
      T[i + k * n] = cs * c1 + sn * c2; T[i + (k + 1) * n] = -sn * c1 + cs * c2;
    }
    for (let i = 0; i < n; i++) {
      const c1 = U[i + k * n], c2 = U[i + (k + 1) * n];
      U[i + k * n] = cs * c1 + sn * c2; U[i + (k + 1) * n] = -sn * c1 + cs * c2;
    }
    const avg = 0.5 * (T[k + k * n] + T[k + 1 + (k + 1) * n]);
    T[k + k * n] = avg; T[k + 1 + (k + 1) * n] = avg;
    k++;
  }
  void e;
}

/** Real eig: returns {wr, wi, Vr, Vi} complex eigenvectors normalized (unit 2-norm, largest component real). */
export function eigReal(a, n, wantV = true) {
  const r = hqr(a, n, { vectors: wantV });
  if (!wantV) return { wr: r.wr, wi: r.wi };
  const Vr = new Float64Array(n * n), Vi = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    if (r.wi[j] === 0) { for (let i = 0; i < n; i++) Vr[i + j * n] = r.V[i + j * n]; }
    else if (r.wi[j] > 0 && j + 1 < n) {
      for (let i = 0; i < n; i++) {
        Vr[i + j * n] = r.V[i + j * n]; Vi[i + j * n] = r.V[i + (j + 1) * n];
        Vr[i + (j + 1) * n] = r.V[i + j * n]; Vi[i + (j + 1) * n] = -r.V[i + (j + 1) * n];
      }
      j++;
    }
  }
  normalizeCols(Vr, Vi, n, n, true);
  // exact conjugate pairs after normalization
  for (let j = 0; j < n - 1; j++) if (r.wi[j] > 0) { for (let i = 0; i < n; i++) { Vr[i + (j + 1) * n] = Vr[i + j * n]; Vi[i + (j + 1) * n] = -Vi[i + j * n]; } j++; }
  return { wr: r.wr, wi: r.wi, Vr, Vi };
}

/** Normalizes columns to unit 2-norm; rotate = true makes the largest component real. */
export function normalizeCols(re, im, m, n, rotate) {
  for (let j = 0; j < n; j++) {
    let s = 0, big = -1, bk = 0;
    for (let i = 0; i < m; i++) { const a = Math.hypot(re[i + j * m], im[i + j * m]); s = Math.hypot(s, a); if (a > big * (1 + 1e-12)) { big = a; bk = i; } }
    if (s === 0) continue;
    let pr = 1 / s, pi = 0;
    if (rotate && im) {
      const a = Math.hypot(re[bk + j * m], im[bk + j * m]);
      if (a > 0 && im[bk + j * m] !== 0) { pr = re[bk + j * m] / a / s; pi = -im[bk + j * m] / a / s; }
    }
    for (let i = 0; i < m; i++) {
      const x = re[i + j * m], y = im[i + j * m];
      re[i + j * m] = x * pr - y * pi; im[i + j * m] = x * pi + y * pr;
    }
    if (rotate && im) im[bk + j * m] = 0;
  }
}

// ---------------------------------------------------------------- complex Hessenberg / Schur

/** Complex Hessenberg reduction: A = Q H Q^H. */
export function hessC(A0) {
  const H = toC(A0); const n = H.n; const Q = ceye(n);
  for (let k = 0; k < n - 2; k++) {
    const xr = new Float64Array(n - k - 1), xi = new Float64Array(n - k - 1);
    for (let i = k + 1; i < n; i++) { xr[i - k - 1] = H.re[i + k * n]; xi[i - k - 1] = H.im[i + k * n]; }
    const h = house(xr, xi);
    if (h.beta === 0) continue;
    houseLeft(H, h, k + 1, k, n);
    houseRight(H, h, k + 1, 0, n);
    houseRight(Q, h, k + 1, 0, n);
    H.re[k + 1 + k * n] = h.ar; H.im[k + 1 + k * n] = h.ai;
    for (let i = k + 2; i < n; i++) { H.re[i + k * n] = 0; H.im[i + k * n] = 0; }
  }
  return { H, Q };
}

/** Complex Schur form A = Z T Z^H (T upper triangular). */
export function schurC(A0) {
  const { H, Q: Z } = hessC(A0);
  const n = H.n; const re = H.re, im = H.im;
  const norm = normFro(H) || 1;
  let hi = n - 1, iter = 0, total = 0;
  while (hi > 0) {
    let l = hi;
    while (l > 0) {
      let s = cabs1(re[l - 1 + (l - 1) * n], im[l - 1 + (l - 1) * n]) + cabs1(re[l + l * n], im[l + l * n]);
      if (s === 0) s = norm;
      if (cabs1(re[l + (l - 1) * n], im[l + (l - 1) * n]) <= EPS * s) { re[l + (l - 1) * n] = 0; im[l + (l - 1) * n] = 0; break; }
      l--;
    }
    if (l === hi) { hi--; iter = 0; continue; }
    iter++; total++;
    if (total > 60 * n + 100) throw new Error('schur: no convergence');
    let mur, mui;
    if (iter % 11 === 10) {
      mur = re[hi + hi * n] + Math.abs(re[hi + (hi - 1) * n]) + (hi > 1 ? Math.abs(re[hi - 1 + (hi - 2) * n]) : 0);
      mui = im[hi + hi * n];
    } else {
      const ar = re[hi - 1 + (hi - 1) * n], ai = im[hi - 1 + (hi - 1) * n];
      const br = re[hi - 1 + hi * n], bi = im[hi - 1 + hi * n];
      const cr = re[hi + (hi - 1) * n], ci = im[hi + (hi - 1) * n];
      const dr = re[hi + hi * n], di = im[hi + hi * n];
      const hr = (ar - dr) / 2, hi2 = (ai - di) / 2;
      const [bcr, bci] = cmulS(br, bi, cr, ci);
      const [sr, si] = csqrt(hr * hr - hi2 * hi2 + bcr, 2 * hr * hi2 + bci);
      const m1r = (ar + dr) / 2 + sr, m1i = (ai + di) / 2 + si;
      const m2r = (ar + dr) / 2 - sr, m2i = (ai + di) / 2 - si;
      if (Math.hypot(m1r - dr, m1i - di) <= Math.hypot(m2r - dr, m2i - di)) { mur = m1r; mui = m1i; } else { mur = m2r; mui = m2i; }
    }
    let xr = re[l + l * n] - mur, xi = im[l + l * n] - mui, yr = re[l + 1 + l * n], yi = im[l + 1 + l * n];
    for (let k = l; k < hi; k++) {
      if (k > l) { xr = re[k + (k - 1) * n]; xi = im[k + (k - 1) * n]; yr = re[k + 1 + (k - 1) * n]; yi = im[k + 1 + (k - 1) * n]; }
      const ax = Math.hypot(xr, xi), ay = Math.hypot(yr, yi);
      if (ay === 0) continue;
      const nr = Math.hypot(ax, ay);
      let c, sr, si;
      if (ax === 0) { c = 0; sr = yr / ay; si = -yi / ay; } else {
        c = ax / nr;
        const pr = xr / ax, pi = xi / ax;
        // s = (x/|x|) * conj(y) / nr
        sr = (pr * yr + pi * yi) / nr; si = (pi * yr - pr * yi) / nr;
      }
      // rows k, k+1: [c s; -conj(s) c]
      for (let j = (k > l ? k - 1 : l); j < n; j++) {
        const o1 = k + j * n, o2 = k + 1 + j * n;
        const ar = re[o1], ai = im[o1], br = re[o2], bi = im[o2];
        re[o1] = c * ar + sr * br - si * bi; im[o1] = c * ai + sr * bi + si * br;
        re[o2] = -(sr * ar + si * ai) + c * br; im[o2] = -(sr * ai - si * ar) + c * bi;
      }
      if (k > l) { re[k + 1 + (k - 1) * n] = 0; im[k + 1 + (k - 1) * n] = 0; }
      // columns k, k+1: [colk c + colk1 conj(s), -colk s + colk1 c]
      const rmax = Math.min(k + 2, hi);
      const colOp = (R, I, rows, ld) => {
        for (let i = 0; i < rows; i++) {
          const o1 = i + k * ld, o2 = i + (k + 1) * ld;
          const ar = R[o1], ai = I[o1], br = R[o2], bi = I[o2];
          R[o1] = c * ar + sr * br + si * bi; I[o1] = c * ai + sr * bi - si * br;
          R[o2] = -(sr * ar - si * ai) + c * br; I[o2] = -(sr * ai + si * ar) + c * bi;
        }
      };
      colOp(re, im, rmax + 1, n);
      colOp(Z.re, Z.im, n, n);
    }
  }
  for (let j = 0; j < n; j++) for (let i = j + 1; i < n; i++) { re[i + j * n] = 0; im[i + j * n] = 0; }
  return { T: H, Z };
}

/** Eigenvectors of an upper triangular T (complex), back-transformed by Z and normalized. */
export function triEigvecs(T, Z) {
  const n = T.n; const X = cm(n, n);
  const norm = normFro(T) || 1;
  for (let k = 0; k < n; k++) {
    const lr = T.re[k + k * n], li = T.im[k + k * n];
    X.re[k + k * n] = 1;
    for (let i = k - 1; i >= 0; i--) {
      let sr = 0, si = 0;
      for (let j = i + 1; j <= k; j++) {
        const tr = T.re[i + j * n], ti = T.im[i + j * n], xr = X.re[j + k * n], xi = X.im[j + k * n];
        sr += tr * xr - ti * xi; si += tr * xi + ti * xr;
      }
      let dr = T.re[i + i * n] - lr, di = T.im[i + i * n] - li;
      if (Math.hypot(dr, di) < EPS * norm) { dr = EPS * norm; di = 0; }
      const [qr, qi] = cdiv(-sr, -si, dr, di);
      X.re[i + k * n] = qr; X.im[i + k * n] = qi;
    }
  }
  const V = cmul(Z, X);
  normalizeCols(V.re, V.im, n, n, true);
  return V;
}

// ---------------------------------------------------------------- matrix functions helpers

/** Solves A X = B (square) with LU; returns {X, rcond, singular}. */
export function solveSquare(A, B, wantRcond = true) {
  const F = luFactor(A);
  const X = luSolve(F, B);
  return { X, rcond: wantRcond ? rcondLU(A, F) : NaN, singular: F.info >= 0 };
}

/** Inverse with LU. */
export function invC(A) {
  return solveSquare(A, ceye(A.n));
}

/** Matrix exponential (scaling and squaring, Pade 13). */
export function expmC(A) {
  const n = A.n;
  if (n === 0) return cm(0, 0);
  const b = [64764752532480000, 32382376266240000, 7771770303897600, 1187353796428800, 129060195264000, 10559470521600, 670442572800, 33522128640, 1323241920, 40840800, 960960, 16380, 182, 1];
  const theta = [1.495585217958292e-2, 2.539398330063230e-1, 9.504178996162932e-1, 2.097847961257068, 5.371920351148152];
  const nrm = norm1(A);
  const I = ceye(n);
  const padeLow = (X, deg) => {
    const c = { 3: [120, 60, 12, 1], 5: [30240, 15120, 3360, 420, 30, 1], 7: [17297280, 8648640, 1995840, 277200, 25200, 1512, 56, 1], 9: [17643225600, 8821612800, 2075673600, 302702400, 30270240, 2162160, 110880, 3960, 90, 1] }[deg];
    const X2 = cmul(X, X);
    const pw = [I, X2];
    for (let k = 2; 2 * k <= deg; k++) pw.push(cmul(pw[k - 1], X2));
    let U = cm(n, n), V = cm(n, n);
    for (let k = 0; 2 * k <= deg; k++) {
      if (2 * k + 1 <= deg) U = cadd(U, pw[k], c[2 * k + 1]);
      V = cadd(V, pw[k], c[2 * k]);
    }
    U = cmul(X, U);
    return { U, V };
  };
  let s = 0, X = A, UV;
  const degs = [3, 5, 7, 9];
  for (let i = 0; i < 4; i++) if (nrm <= theta[i]) { UV = padeLow(A, degs[i]); break; }
  if (!UV) {
    s = Math.max(0, Math.ceil(Math.log2(nrm / theta[4])));
    if (!Number.isFinite(s)) s = 0;
    X = cscale(A, Math.pow(2, -s));
    const X2 = cmul(X, X), X4 = cmul(X2, X2), X6 = cmul(X4, X2);
    const lin = (terms) => { let R = cm(n, n); for (const [M, c] of terms) R = cadd(R, M, c); return R; };
    const U1 = cmul(X6, lin([[X6, b[13]], [X4, b[11]], [X2, b[9]]]));
    const U = cmul(X, cadd(U1, lin([[X6, b[7]], [X4, b[5]], [X2, b[3]], [I, b[1]]])));
    const V1 = cmul(X6, lin([[X6, b[12]], [X4, b[10]], [X2, b[8]]]));
    const V = cadd(V1, lin([[X6, b[6]], [X4, b[4]], [X2, b[2]], [I, b[0]]]));
    UV = { U, V };
  }
  const P = cadd(UV.V, UV.U), Q = cadd(UV.V, UV.U, -1);
  let R = solveSquare(Q, P, false).X;
  for (let k = 0; k < s; k++) R = cmul(R, R);
  return R;
}

/** Square root of an upper triangular matrix (Bjorck-Hammarling). Returns {R, singular}. */
export function sqrtmTri(T) {
  const n = T.n; const R = cm(n, n); let singular = false;
  for (let j = 0; j < n; j++) {
    const [a, b] = csqrt(T.re[j + j * n], T.im[j + j * n]);
    R.re[j + j * n] = a; R.im[j + j * n] = b;
    if (a === 0 && b === 0) singular = true;
    for (let i = j - 1; i >= 0; i--) {
      let sr = T.re[i + j * n], si = T.im[i + j * n];
      for (let k = i + 1; k < j; k++) {
        const ar = R.re[i + k * n], ai = R.im[i + k * n], br = R.re[k + j * n], bi = R.im[k + j * n];
        sr -= ar * br - ai * bi; si -= ar * bi + ai * br;
      }
      const dr = R.re[i + i * n] + R.re[j + j * n], di = R.im[i + i * n] + R.im[j + j * n];
      if (dr === 0 && di === 0) { if (sr === 0 && si === 0) { R.re[i + j * n] = 0; R.im[i + j * n] = 0; } else { R.re[i + j * n] = Infinity; R.im[i + j * n] = 0; singular = true; } continue; }
      const [qr, qi] = cdiv(sr, si, dr, di);
      R.re[i + j * n] = qr; R.im[i + j * n] = qi;
    }
  }
  return { R, singular };
}

/** Gauss-Legendre nodes/weights on [0, 1]. */
export function gaussLegendre01(m) {
  const x = new Float64Array(m), w = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    let z = Math.cos(Math.PI * (i + 0.75) / (m + 0.5)), pp = 0;
    for (let it = 0; it < 100; it++) {
      let p1 = 1, p2 = 0;
      for (let j = 1; j <= m; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
      pp = (m * (z * p1 - p2)) / (z * z - 1);
      const z1 = z; z = z1 - p1 / pp;
      if (Math.abs(z - z1) < 1e-15) break;
    }
    x[i] = (1 - z) / 2; w[i] = 1 / ((1 - z * z) * pp * pp);
  }
  return { x, w };
}

/** Principal logarithm of an upper triangular matrix (inverse scaling and squaring). */
export function logmTri(T0) {
  const n = T0.n; let T = toC(T0); let k = 0;
  const I = ceye(n);
  while (k < 60) {
    const D = cadd(T, I, -1);
    if (norm1(D) <= 0.25) break;
    T = sqrtmTri(T).R; k++;
  }
  const X = cadd(T, I, -1);
  const { x, w } = gaussLegendre01(10);
  let L = cm(n, n);
  for (let j = 0; j < x.length; j++) {
    const M = cadd(I, X, x[j]);
    const Y = triSolve(M, X, true);
    L = cadd(L, Y, w[j]);
  }
  // exact diagonal
  for (let i = 0; i < n; i++) { const [a, b] = clog(T0.re[i + i * n], T0.im[i + i * n]); L.re[i + i * n] = a / Math.pow(2, k); L.im[i + i * n] = b / Math.pow(2, k); }
  return cscale(L, Math.pow(2, k));
}
