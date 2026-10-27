// Private numerical kernels of the numerics area. Matrices are JS arrays of
// rows (number[][]) unless stated otherwise. These keep the solvers
// independent of the linear-algebra area at unit-test time; at run time the
// public builtins of that area (eig, svd, fft ...) give the same results.
import { E } from './_util.js';

// ------------------------------------------------------------ basic matrix ops
export const zerosM = (m, n) => Array.from({ length: m }, () => new Array(n).fill(0));
export const eye = (n) => { const r = zerosM(n, n); for (let i = 0; i < n; i++) r[i][i] = 1; return r; };
export const clone = (A) => A.map((r) => r.slice());
export const T = (A) => { const m = A.length, n = m ? A[0].length : 0; const r = zerosM(n, m); for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) r[j][i] = A[i][j]; return r; };
export function mul(A, B) {
  const m = A.length, k = B.length, n = k ? B[0].length : (A.length ? 0 : 0);
  const r = zerosM(m, n);
  for (let i = 0; i < m; i++) { const Ai = A[i], ri = r[i]; for (let p = 0; p < k; p++) { const a = Ai[p]; if (a === 0) continue; const Bp = B[p]; for (let j = 0; j < n; j++) ri[j] += a * Bp[j]; } }
  return r;
}
export const mulv = (A, x) => A.map((r) => { let s = 0; for (let j = 0; j < r.length; j++) s += r[j] * x[j]; return s; });
export const add = (A, B, s = 1) => A.map((r, i) => r.map((x, j) => x + s * B[i][j]));
export const scale = (A, s) => A.map((r) => r.map((x) => x * s));
export const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
export const norm2 = (a) => { let s = 0, sc = 0; for (const x of a) sc = Math.max(sc, Math.abs(x)); if (sc === 0) return 0; for (const x of a) s += (x / sc) ** 2; return sc * Math.sqrt(s); };
export const normInf = (a) => { let s = 0; for (const x of a) s = Math.max(s, Math.abs(x)); return s; };
export function norm1M(A) { let best = 0; const n = A.length ? A[0].length : 0; for (let j = 0; j < n; j++) { let s = 0; for (const r of A) s += Math.abs(r[j]); best = Math.max(best, s); } return best; }
export function normFro(A) { let s = 0; for (const r of A) for (const x of r) s += x * x; return Math.sqrt(s); }
/** column-major Float64Array → rows */
export function rowsOf(a, m, n) { const r = zerosM(m, n); for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) r[i][j] = a[i + j * m]; return r; }
/** rows → column-major Float64Array */
export function colMajor(A) { const m = A.length, n = m ? A[0].length : 0; const a = new Float64Array(m * n); for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) a[i + j * m] = A[i][j]; return a; }
export const hcat = (...Ms) => Ms[0].map((_, i) => Ms.flatMap((X) => X[i]));
export const vcat = (...Ms) => Ms.flatMap((X) => X.map((r) => r.slice()));

// ------------------------------------------------------------ LU / solve
/** LU with partial pivoting. Returns {LU, piv, sign, singular}. */
export function lu(A) {
  const n = A.length; const LU = clone(A); const piv = Array.from({ length: n }, (_, i) => i); let sign = 1; let singular = false;
  for (let k = 0; k < n; k++) {
    let p = k, mx = Math.abs(LU[k][k]);
    for (let i = k + 1; i < n; i++) if (Math.abs(LU[i][k]) > mx) { mx = Math.abs(LU[i][k]); p = i; }
    if (p !== k) { [LU[p], LU[k]] = [LU[k], LU[p]]; [piv[p], piv[k]] = [piv[k], piv[p]]; sign = -sign; }
    if (LU[k][k] === 0) { singular = true; continue; }
    for (let i = k + 1; i < n; i++) { const f = (LU[i][k] /= LU[k][k]); if (f !== 0) for (let j = k + 1; j < n; j++) LU[i][j] -= f * LU[k][j]; }
  }
  return { LU, piv, sign, singular };
}
export function luSolve(F, b) {
  const { LU, piv } = F; const n = LU.length; const x = piv.map((p) => b[p]);
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) x[i] -= LU[i][j] * x[j];
  for (let i = n - 1; i >= 0; i--) { for (let j = i + 1; j < n; j++) x[i] -= LU[i][j] * x[j]; x[i] /= LU[i][i]; }
  return x;
}
/** Solves A x = b (b vector) or A X = B (B rows). Least squares when A is not square. */
export function solve(A, b) {
  const vec = !Array.isArray(b[0]);
  if (A.length !== (A[0] || []).length) { return vec ? lstsq(A, b) : T(T(b).map((c) => lstsq(A, c))); }
  const F = lu(A);
  if (F.singular) { return vec ? lstsq(A, b) : T(T(b).map((c) => lstsq(A, c))); }
  if (vec) return luSolve(F, b);
  return T(T(b).map((c) => luSolve(F, c)));
}
export function inv(A) { const n = A.length; const F = lu(A); if (F.singular) throw E('singular', 'Matrix is singular to working precision.'); return T(eye(n).map((c) => luSolve(F, c))); }
export function det(A) { const F = lu(A); let d = F.sign; for (let i = 0; i < A.length; i++) d *= F.LU[i][i]; return d; }
/** Minimum-norm least squares via SVD. */
export function lstsq(A, b) { const P = pinv(A); return mulv(P, b); }
export function pinv(A, tol) {
  const m = A.length, n = m ? A[0].length : 0;
  if (!m || !n) return zerosM(n, m);
  const { U, s, V } = svd(A);
  const t = tol ?? Math.max(m, n) * (s[0] || 0) * 2.220446049250313e-16;
  const r = zerosM(n, m);
  for (let k = 0; k < s.length; k++) { if (s[k] <= t) continue; const iv = 1 / s[k]; for (let i = 0; i < n; i++) { const vi = V[i][k] * iv; if (vi === 0) continue; for (let j = 0; j < m; j++) r[i][j] += vi * U[j][k]; } }
  return r;
}
export function rank(A, tol) { if (!A.length || !A[0].length) return 0; const { s } = svd(A); const t = tol ?? Math.max(A.length, A[0].length) * s[0] * 2.220446049250313e-16; return s.filter((x) => x > t).length; }
/** Cholesky A = R'R, returns upper R or null when not positive definite. */
export function chol(A) {
  const n = A.length; const R = zerosM(n, n);
  for (let j = 0; j < n; j++) {
    let s = A[j][j];
    for (let k = 0; k < j; k++) s -= R[k][j] * R[k][j];
    if (!(s > 0)) return null;
    R[j][j] = Math.sqrt(s);
    for (let i = j + 1; i < n; i++) { let t = A[j][i]; for (let k = 0; k < j; k++) t -= R[k][j] * R[k][i]; R[j][i] = t / R[j][j]; }
  }
  return R;
}
/** Householder QR: returns {Q (m×m), R (m×n)}. */
export function qr(A) {
  const m = A.length, n = m ? A[0].length : 0; const R = clone(A); const Q = eye(m);
  for (let k = 0; k < Math.min(m - 1, n); k++) {
    let nrm = 0; for (let i = k; i < m; i++) nrm += R[i][k] * R[i][k]; nrm = Math.sqrt(nrm);
    if (nrm === 0) continue;
    const alpha = R[k][k] > 0 ? -nrm : nrm;
    const v = new Array(m).fill(0); v[k] = R[k][k] - alpha; for (let i = k + 1; i < m; i++) v[i] = R[i][k];
    const vv = dot(v, v); if (vv === 0) continue;
    for (let j = 0; j < n; j++) { let s = 0; for (let i = k; i < m; i++) s += v[i] * R[i][j]; s = 2 * s / vv; for (let i = k; i < m; i++) R[i][j] -= s * v[i]; }
    for (let j = 0; j < m; j++) { let s = 0; for (let i = k; i < m; i++) s += v[i] * Q[j][i]; s = 2 * s / vv; for (let i = k; i < m; i++) Q[j][i] -= s * v[i]; }
  }
  return { Q, R };
}

// ------------------------------------------------------------ SVD (one-sided Jacobi)
/** A (m×n) = U diag(s) V'. U m×k, V n×k, k=min(m,n); s descending. */
export function svd(A) {
  let m = A.length, n = m ? A[0].length : 0;
  let trans = false; let W = clone(A);
  if (m < n) { W = T(A); [m, n] = [n, m]; trans = true; }
  const V = eye(n);
  for (let sweep = 0; sweep < 80; sweep++) {
    let off = 0;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      let a = 0, b = 0, c = 0;
      for (let i = 0; i < m; i++) { const x = W[i][p], y = W[i][q]; a += x * x; b += y * y; c += x * y; }
      if (c === 0 || Math.abs(c) <= 1e-15 * Math.sqrt(a * b)) continue;
      off = Math.max(off, Math.abs(c) / Math.sqrt(a * b));
      const z = (b - a) / (2 * c); const t = Math.sign(z || 1) / (Math.abs(z) + Math.sqrt(1 + z * z)); const cs = 1 / Math.sqrt(1 + t * t), sn = cs * t;
      for (let i = 0; i < m; i++) { const x = W[i][p], y = W[i][q]; W[i][p] = cs * x - sn * y; W[i][q] = sn * x + cs * y; }
      for (let i = 0; i < n; i++) { const x = V[i][p], y = V[i][q]; V[i][p] = cs * x - sn * y; V[i][q] = sn * x + cs * y; }
    }
    if (off < 1e-15) break;
  }
  const s = new Array(n); for (let j = 0; j < n; j++) { let t = 0; for (let i = 0; i < m; i++) t += W[i][j] * W[i][j]; s[j] = Math.sqrt(t); }
  const order = s.map((_, i) => i).sort((x, y) => s[y] - s[x]);
  const U = zerosM(m, n), V2 = zerosM(n, n), s2 = new Array(n);
  order.forEach((j, k) => { s2[k] = s[j]; for (let i = 0; i < m; i++) U[i][k] = s[j] ? W[i][j] / s[j] : 0; for (let i = 0; i < n; i++) V2[i][k] = V[i][j]; });
  // complete U columns for zero singular values (Gram-Schmidt against e_i)
  for (let k = 0; k < n; k++) if (!s2[k]) {
    for (let e = 0; e < m; e++) {
      const v = new Array(m).fill(0); v[e] = 1;
      for (let c = 0; c < n; c++) if (c !== k && (s2[c] || c < k)) { const d = U.reduce((acc, r, i) => acc + r[c] * v[i], 0); for (let i = 0; i < m; i++) v[i] -= d * U[i][c]; }
      const nv = norm2(v); if (nv > 1e-8) { for (let i = 0; i < m; i++) U[i][k] = v[i] / nv; break; }
    }
  }
  return trans ? { U: V2, s: s2, V: U } : { U, s: s2, V: V2 };
}

// ------------------------------------------------------------ symmetric eigen (Jacobi)
/** Symmetric A: returns {values ascending, vectors (columns)} */
export function symEig(A) {
  const n = A.length; const a = clone(A); const V = eye(n);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < 1e-30 * (normFro(a) ** 2 + 1e-300)) break;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]); const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)); const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
      for (let k = 0; k < n; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
      for (let k = 0; k < n; k++) { const x = V[k][p], y = V[k][q]; V[k][p] = c * x - s * y; V[k][q] = s * x + c * y; }
    }
  }
  const vals = a.map((r, i) => r[i]); const order = vals.map((_, i) => i).sort((x, y) => vals[x] - vals[y]);
  const vectors = zerosM(n, n); order.forEach((j, k) => { for (let i = 0; i < n; i++) vectors[i][k] = V[i][j]; });
  // sign convention: largest component of each vector positive? keep reference-like: make first nonzero... leave
  return { values: order.map((j) => vals[j]), vectors };
}

// ------------------------------------------------------------ general eigenvalues
function balance(a) {
  const n = a.length; const RADIX = 2, sq = 4; let last = false;
  while (!last) {
    last = true;
    for (let i = 0; i < n; i++) {
      let r = 0, c = 0;
      for (let j = 0; j < n; j++) if (j !== i) { c += Math.abs(a[j][i]); r += Math.abs(a[i][j]); }
      if (c && r) {
        let g = r / RADIX, f = 1; const s = c + r;
        while (c < g) { f *= RADIX; c *= sq; }
        g = r * RADIX;
        while (c > g) { f /= RADIX; c /= sq; }
        if ((c + r) / f < 0.95 * s) { last = false; g = 1 / f; for (let j = 0; j < n; j++) a[i][j] *= g; for (let j = 0; j < n; j++) a[j][i] *= f; }
      }
    }
  }
}
function elmhes(a) {
  const n = a.length;
  for (let m = 1; m < n - 1; m++) {
    let x = 0, i = m;
    for (let j = m; j < n; j++) if (Math.abs(a[j][m - 1]) > Math.abs(x)) { x = a[j][m - 1]; i = j; }
    if (i !== m) { for (let j = m - 1; j < n; j++) { const t = a[i][j]; a[i][j] = a[m][j]; a[m][j] = t; } for (let j = 0; j < n; j++) { const t = a[j][i]; a[j][i] = a[j][m]; a[j][m] = t; } }
    if (x) for (let i2 = m + 1; i2 < n; i2++) {
      let y = a[i2][m - 1];
      if (y !== 0) { y /= x; a[i2][m - 1] = y; for (let j = m; j < n; j++) a[i2][j] -= y * a[m][j]; for (let j = 0; j < n; j++) a[j][m] += y * a[j][i2]; }
    }
  }
  for (let i = 2; i < n; i++) for (let j = 0; j < i - 1; j++) a[i][j] = 0;
}
const sgn = (a, b) => (b >= 0 ? Math.abs(a) : -Math.abs(a));
function hqr(a) {
  const n = a.length; const wr = new Array(n).fill(0), wi = new Array(n).fill(0);
  let anorm = 0; for (let i = 0; i < n; i++) for (let j = Math.max(i - 1, 0); j < n; j++) anorm += Math.abs(a[i][j]);
  let nn = n - 1, t = 0;
  let p = 0, q = 0, r = 0, s, w, x, y, z = 0, u, v, l, m;
  while (nn >= 0) {
    let its = 0;
    do {
      for (l = nn; l > 0; l--) { s = Math.abs(a[l - 1][l - 1]) + Math.abs(a[l][l]); if (s === 0) s = anorm; if (Math.abs(a[l][l - 1]) + s === s) { a[l][l - 1] = 0; break; } }
      x = a[nn][nn];
      if (l === nn) { wr[nn] = x + t; wi[nn--] = 0; }
      else {
        y = a[nn - 1][nn - 1]; w = a[nn][nn - 1] * a[nn - 1][nn];
        if (l === nn - 1) {
          p = 0.5 * (y - x); q = p * p + w; z = Math.sqrt(Math.abs(q)); x += t;
          if (q >= 0) { z = p + sgn(z, p); wr[nn - 1] = wr[nn] = x + z; if (z) wr[nn] = x - w / z; wi[nn - 1] = wi[nn] = 0; }
          else { wr[nn - 1] = wr[nn] = x + p; wi[nn - 1] = -(wi[nn] = z); }
          nn -= 2;
        } else {
          if (its === 60) throw E('eig:noConvergence', 'Eigenvalue iteration did not converge.');
          if (its === 10 || its === 20 || its === 40) { t += x; for (let i = 0; i <= nn; i++) a[i][i] -= x; s = Math.abs(a[nn][nn - 1]) + Math.abs(a[nn - 1][nn - 2]); y = x = 0.75 * s; w = -0.4375 * s * s; }
          ++its;
          for (m = nn - 2; m >= l; m--) {
            z = a[m][m]; r = x - z; s = y - z;
            p = (r * s - w) / a[m + 1][m] + a[m][m + 1]; q = a[m + 1][m + 1] - z - r - s; r = a[m + 2][m + 1];
            s = Math.abs(p) + Math.abs(q) + Math.abs(r); p /= s; q /= s; r /= s;
            if (m === l) break;
            u = Math.abs(a[m][m - 1]) * (Math.abs(q) + Math.abs(r));
            v = Math.abs(p) * (Math.abs(a[m - 1][m - 1]) + Math.abs(z) + Math.abs(a[m + 1][m + 1]));
            if (u + v === v) break;
          }
          for (let i = m + 2; i <= nn; i++) { a[i][i - 2] = 0; if (i !== m + 2) a[i][i - 3] = 0; }
          for (let k = m; k <= nn - 1; k++) {
            if (k !== m) {
              p = a[k][k - 1]; q = a[k + 1][k - 1]; r = 0;
              if (k !== nn - 1) r = a[k + 2][k - 1];
              if ((x = Math.abs(p) + Math.abs(q) + Math.abs(r)) !== 0) { p /= x; q /= x; r /= x; }
            }
            if ((s = sgn(Math.sqrt(p * p + q * q + r * r), p)) !== 0) {
              if (k === m) { if (l !== m) a[k][k - 1] = -a[k][k - 1]; } else a[k][k - 1] = -s * x;
              p += s; x = p / s; y = q / s; z = r / s; q /= p; r /= p;
              for (let j = k; j <= nn; j++) { p = a[k][j] + q * a[k + 1][j]; if (k !== nn - 1) { p += r * a[k + 2][j]; a[k + 2][j] -= p * z; } a[k + 1][j] -= p * y; a[k][j] -= p * x; }
              const mmin = nn < k + 3 ? nn : k + 3;
              for (let i = l; i <= mmin; i++) { p = x * a[i][k] + y * a[i][k + 1]; if (k !== nn - 1) { p += z * a[i][k + 2]; a[i][k + 2] -= p * r; } a[i][k + 1] -= p * q; a[i][k] -= p; }
            }
          }
        }
      }
    } while (l + 1 < nn);
  }
  return { re: wr, im: wi };
}
/** Eigenvalues of a general real square matrix: {re, im} (conjugate pairs adjacent, positive imaginary first). */
export function eigvals(A) {
  const n = A.length; if (!n) return { re: [], im: [] };
  if (n === 1) return { re: [A[0][0]], im: [0] };
  let sym = true; for (let i = 0; i < n && sym; i++) for (let j = 0; j < i; j++) if (Math.abs(A[i][j] - A[j][i]) > 1e-14 * (Math.abs(A[i][j]) + Math.abs(A[j][i]))) { sym = false; break; }
  if (sym) { const v = symEig(A).values; return { re: v, im: v.map(() => 0) }; }
  const a = clone(A); balance(a); elmhes(a);
  const ev = hqr(a);
  // order pairs: + imag first
  for (let i = 0; i < n - 1; i++) if (ev.im[i] !== 0 && ev.im[i] < 0 && ev.im[i + 1] === -ev.im[i] && ev.re[i] === ev.re[i + 1]) { ev.im[i] = -ev.im[i]; ev.im[i + 1] = -ev.im[i + 1]; i++; } else if (ev.im[i] !== 0) i++;
  return ev;
}
/** Eigenvector for eigenvalue (lr + i li) by inverse iteration (complex). Returns {re, im} normalized to unit 2-norm. */
export function eigvec(A, lr, li) {
  const n = A.length; const d = 1e-10 * (normFro(A) + 1);
  const Mr = A.map((r, i) => r.map((x, j) => x - (i === j ? lr + d : 0))); const Mi = A.map((r, i) => r.map((_, j) => (i === j ? -li : 0)));
  let xr = new Array(n).fill(1), xi = new Array(n).fill(0);
  for (let it = 0; it < 3; it++) { [xr, xi] = csolve(Mr, Mi, xr, xi); let s = 0; for (let i = 0; i < n; i++) s += xr[i] ** 2 + xi[i] ** 2; s = Math.sqrt(s) || 1; xr = xr.map((x) => x / s); xi = xi.map((x) => x / s); }
  return { re: xr, im: xi };
}
/** Complex linear solve (Ar + i Ai) x = br + i bi via real 2n system. */
export function csolve(Ar, Ai, br, bi) {
  const n = Ar.length; const B = zerosM(2 * n, 2 * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { B[i][j] = Ar[i][j]; B[i][j + n] = -Ai[i][j]; B[i + n][j] = Ai[i][j]; B[i + n][j + n] = Ar[i][j]; }
  const x = solve(B, [...br, ...bi]);
  return [x.slice(0, n), x.slice(n)];
}

// ------------------------------------------------------------ matrix exponential
export function expm(A) {
  const n = A.length; if (!n) return [];
  const nrm = norm1M(A); let s = 0; if (nrm > 0.5) s = Math.max(0, Math.ceil(Math.log2(nrm / 0.5)));
  const X = scale(A, 1 / 2 ** s);
  const c = [1, 0.5, 5 / 44, 1 / 66, 1 / 792, 1 / 15840, 1 / 665280]; // Pade(6,6)
  let N = eye(n), D = eye(n), P = eye(n);
  for (let k = 1; k <= 6; k++) { P = mul(P, X); N = add(N, P, c[k]); D = add(D, P, (k % 2 ? -1 : 1) * c[k]); }
  let R = solve(D, N);
  for (let k = 0; k < s; k++) R = mul(R, R);
  return R;
}

// ------------------------------------------------------------ polynomials
export function conv(a, b) { if (!a.length || !b.length) return []; const r = new Array(a.length + b.length - 1).fill(0); for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] += a[i] * b[j]; return r; }
export function polyval(p, x) { let s = 0; for (const c of p) s = s * x + c; return s; }
/** complex polyval: p real coeffs, z = [re, im] → [re, im] */
export function cpolyval(p, zr, zi) { let sr = 0, si = 0; for (const c of p) { const t = sr * zr - si * zi + c; si = sr * zi + si * zr; sr = t; } return [sr, si]; }
/** complex-coefficient polyval: p = {re[], im[]} */
export function cpolyvalC(pr, pi, zr, zi) { let sr = 0, si = 0; for (let k = 0; k < pr.length; k++) { const t = sr * zr - si * zi + pr[k]; si = sr * zi + si * zr + (pi ? pi[k] : 0); sr = t; } return [sr, si]; }
/** Roots of a real polynomial: {re, im}. */
export function roots(p) {
  let c = p.slice(); while (c.length && c[0] === 0) c.shift();
  let nz = 0; while (c.length && c[c.length - 1] === 0) { c.pop(); nz++; }
  const n = c.length - 1; const re = [], im = [];
  if (n >= 1) {
    if (n === 1) { re.push(-c[1] / c[0]); im.push(0); }
    else {
      const A = zerosM(n, n); for (let j = 0; j < n; j++) A[0][j] = -c[j + 1] / c[0]; for (let i = 1; i < n; i++) A[i][i - 1] = 1;
      const a = clone(A); balance(a); elmhes(a); const ev = hqr(a);
      for (let i = 0; i < n; i++) { re.push(ev.re[i]); im.push(ev.im[i]); }
    }
  }
  for (let i = 0; i < nz; i++) { re.push(0); im.push(0); }
  return { re, im };
}
/** Real polynomial from roots (pairs are assumed conjugate; imaginary residue dropped when tiny). */
export function poly(re, im = null) {
  let pr = [1], pi = [0];
  for (let k = 0; k < re.length; k++) {
    const zr = re[k], zi = im ? im[k] : 0; const nr = new Array(pr.length + 1).fill(0), ni = new Array(pr.length + 1).fill(0);
    for (let j = 0; j < pr.length; j++) { nr[j] += pr[j]; ni[j] += pi[j]; nr[j + 1] -= zr * pr[j] - zi * pi[j]; ni[j + 1] -= zr * pi[j] + zi * pr[j]; }
    pr = nr; pi = ni;
  }
  return pr;
}
/** Complex poly from complex roots → {re, im}. */
export function polyC(re, im) {
  let pr = [1], pi = [0];
  for (let k = 0; k < re.length; k++) { const zr = re[k], zi = im[k]; const nr = new Array(pr.length + 1).fill(0), ni = new Array(pr.length + 1).fill(0); for (let j = 0; j < pr.length; j++) { nr[j] += pr[j]; ni[j] += pi[j]; nr[j + 1] -= zr * pr[j] - zi * pi[j]; ni[j + 1] -= zr * pi[j] + zi * pr[j]; } pr = nr; pi = ni; }
  return { re: pr, im: pi };
}
/** Characteristic polynomial of a square matrix. */
export function charpoly(A) { const e = eigvals(A); return poly(e.re, e.im); }

// ------------------------------------------------------------ filter
/** y = filter(b, a, x, zi) direct form II transposed; returns {y, zf}. */
export function filter(b, a, x, zi) {
  const n = Math.max(a.length, b.length); const a0 = a[0];
  if (a0 === 0) throw E('filter:a0', 'First denominator filter coefficient must be non-zero.');
  const B = new Array(n).fill(0), A = new Array(n).fill(0);
  for (let i = 0; i < b.length; i++) B[i] = b[i] / a0; for (let i = 0; i < a.length; i++) A[i] = a[i] / a0;
  const z = new Array(n).fill(0); if (zi) for (let i = 0; i < Math.min(zi.length, n - 1); i++) z[i] = zi[i];
  const y = new Float64Array(x.length);
  for (let k = 0; k < x.length; k++) {
    const xk = x[k]; const yk = B[0] * xk + z[0]; y[k] = yk;
    for (let i = 1; i < n; i++) z[i - 1] = B[i] * xk + z[i] - A[i] * yk;
  }
  return { y, zf: z.slice(0, n - 1) };
}

// ------------------------------------------------------------ FFT
function fft2(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inv ? 2 : -2) * Math.PI / len; const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2; const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
/** Discrete Fourier transform of length n (any n). Returns {re, im} (unnormalized; inverse divides by n). */
export function fft(reIn, imIn, inverse = false) {
  const n = reIn.length; const re = Float64Array.from(reIn), im = imIn ? Float64Array.from(imIn) : new Float64Array(n);
  if (n <= 1) return { re, im };
  if ((n & (n - 1)) === 0) { fft2(re, im, inverse); }
  else {
    // Bluestein
    let m = 1; while (m < 2 * n - 1) m <<= 1;
    const wr = new Float64Array(n), wi = new Float64Array(n); const sg = inverse ? 1 : -1;
    for (let k = 0; k < n; k++) { const a = Math.PI * ((k * k) % (2 * n)) / n; wr[k] = Math.cos(a); wi[k] = sg * Math.sin(a); }
    const ar = new Float64Array(m), ai = new Float64Array(m), br = new Float64Array(m), bi = new Float64Array(m);
    for (let k = 0; k < n; k++) { ar[k] = re[k] * wr[k] - im[k] * wi[k]; ai[k] = re[k] * wi[k] + im[k] * wr[k]; }
    br[0] = wr[0]; bi[0] = -wi[0]; for (let k = 1; k < n; k++) { br[k] = br[m - k] = wr[k]; bi[k] = bi[m - k] = -wi[k]; }
    fft2(ar, ai, false); fft2(br, bi, false);
    for (let k = 0; k < m; k++) { const t = ar[k] * br[k] - ai[k] * bi[k]; ai[k] = ar[k] * bi[k] + ai[k] * br[k]; ar[k] = t; }
    fft2(ar, ai, true);
    for (let k = 0; k < n; k++) { const xr = ar[k] / m, xi = ai[k] / m; re[k] = xr * wr[k] - xi * wi[k]; im[k] = xr * wi[k] + xi * wr[k]; }
  }
  if (inverse) for (let k = 0; k < n; k++) { re[k] /= n; im[k] /= n; }
  return { re, im };
}

// ------------------------------------------------------------ special functions
const LG = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
const FACT = [1]; for (let i = 1; i <= 170; i++) FACT[i] = FACT[i - 1] * i;
export function gammaln(x) {
  if (Number.isNaN(x)) return NaN;
  if (x <= 0 && Number.isInteger(x)) return Infinity;
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - gammaln(1 - x);
  if (Number.isInteger(x) && x <= 171) return Math.log(FACT[x - 1]);
  if (x > 1e7) return (x - 0.5) * Math.log(x) - x + 0.5 * Math.log(2 * Math.PI) + 1 / (12 * x);
  // Stirling series for large x is more accurate than Lanczos
  if (x >= 15) { const x2 = 1 / (x * x); return (x - 0.5) * Math.log(x) - x + 0.91893853320467274178 + (1 / x) * (1 / 12 - x2 * (1 / 360 - x2 * (1 / 1260 - x2 * (1 / 1680 - x2 / 1188)))); }
  // Lanczos (g=7, n=9)
  const z = x - 1; let a = LG[0]; const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += LG[i] / (z + i);
  return 0.91893853320467274178 + (z + 0.5) * Math.log(t) - t + Math.log(a);
}
export function gamma(x) {
  if (Number.isNaN(x)) return NaN;
  if (x === Infinity) return Infinity;
  if (Number.isInteger(x)) { if (x <= 0) return x === 0 ? Infinity : NaN; if (x <= 171) return FACT[x - 1]; return Infinity; }
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  if (x > 171.7) return Infinity;
  if (x < 15) { let p = 1, y = x; while (y < 15) { p *= y; y += 1; } return Math.exp(gammaln(y)) / p; }
  return Math.exp(gammaln(x));
}
export const betaln = (a, b) => gammaln(a) + gammaln(b) - gammaln(a + b);
/** Regularized lower incomplete gamma P(a,x). */
export function gammainc(x, a, upper = false) {
  if (Number.isNaN(x) || Number.isNaN(a)) return NaN;
  if (x <= 0) return upper ? 1 : 0;
  if (x === Infinity) return upper ? 0 : 1;
  if (a === 0) return upper ? 0 : 1;
  const gl = a === 0.5 ? 0.57236494292470008707 : a === 1 ? 0 : gammaln(a);
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 10000; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-17) break; }
    const P = sum * Math.exp(-x + a * Math.log(x) - gl);
    return upper ? 1 - P : P;
  }
  const FPMIN = 1e-300; let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i < 10000; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN; c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-16) break; }
  const Q = Math.exp(-x + a * Math.log(x) - gl) * h;
  return upper ? Q : 1 - Q;
}
export function erf(x) { if (Number.isNaN(x)) return NaN; if (x === 0) return 0; const v = gammainc(x * x, 0.5); return x < 0 ? -v : v; }
export function erfc(x) {
  if (Number.isNaN(x)) return NaN;
  if (x < 0) return 2 - erfc(-x);
  if (x < 0.5) return 1 - erf(x);
  return gammainc(x * x, 0.5, true);
}
export function erfcx(x) {
  if (x < 25) return Math.exp(x * x) * erfc(x);
  // asymptotic
  const x2 = x * x; return (1 / (x * Math.sqrt(Math.PI))) * (1 - 1 / (2 * x2) + 3 / (4 * x2 * x2) - 15 / (8 * x2 * x2 * x2));
}
const SQ2 = Math.SQRT2;
export const normcdf = (z) => 0.5 * erfc(-z / SQ2);
export const normpdf = (z) => Math.exp(-0.5 * z * z) / 2.5066282746310002;
/** Inverse standard normal CDF. */
export function norminv(p) {
  if (Number.isNaN(p) || p < 0 || p > 1) return NaN;
  if (p === 0) return -Infinity; if (p === 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425; let x;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p <= 1 - pl) { const q = p - 0.5, r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  else { const q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  // Halley refinement
  for (let it = 0; it < 3; it++) {
    const e = p < 0.5 ? normcdf(x) - p : (1 - p) - 0.5 * erfc(x / SQ2);
    const u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
    x = x - u / (1 + x * u / 2);
  }
  return x;
}
export const erfinv = (y) => (y <= -1 ? (y === -1 ? -Infinity : NaN) : y >= 1 ? (y === 1 ? Infinity : NaN) : norminv((y + 1) / 2) / SQ2);
export const erfcinv = (y) => (y <= 0 ? (y === 0 ? Infinity : NaN) : y >= 2 ? (y === 2 ? -Infinity : NaN) : -norminv(y / 2) / SQ2);
/** Regularized incomplete beta I_x(a,b). */
export function betainc(x, a, b, upper = false) {
  if (Number.isNaN(x) || Number.isNaN(a) || Number.isNaN(b)) return NaN;
  if (x <= 0) return upper ? 1 : 0; if (x >= 1) return upper ? 0 : 1;
  if (a === 0 && b === 0) return NaN;
  if (a === 0) return upper ? 0 : 1; if (b === 0) return upper ? 1 : 0;
  const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log1p(-x));
  const cf = (x, a, b) => {
    const FPMIN = 1e-300; const qab = a + b, qap = a + 1, qam = a - 1; let c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
    for (let m = 1; m <= 10000; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    return h;
  };
  let I;
  if (x < (a + 1) / (a + b + 2)) { I = bt * cf(x, a, b) / a; return upper ? 1 - I : I; }
  const J = bt * cf(1 - x, b, a) / b; return upper ? J : 1 - J;
}
/** Generic monotone inverse on [lo,hi] by bisection + secant (Illinois). f increasing. */
export function invertMonotone(f, p, lo, hi, tol = 1e-15) {
  let flo = f(lo) - p, fhi = f(hi) - p;
  let k = 0; while (flo > 0 && k++ < 200) { hi = lo; fhi = flo; lo = lo - Math.max(1, Math.abs(lo)) * 2; flo = f(lo) - p; }
  k = 0; while (fhi < 0 && k++ < 200) { lo = hi; flo = fhi; hi = hi + Math.max(1, Math.abs(hi)) * 2; fhi = f(hi) - p; }
  if (flo > 0 || fhi < 0) return NaN;
  let side = 0;
  for (let it = 0; it < 300; it++) {
    let x = (lo * fhi - hi * flo) / (fhi - flo);
    if (!(x > lo && x < hi)) x = 0.5 * (lo + hi);
    const fx = f(x) - p;
    if (fx === 0) return x;
    if (fx < 0) { lo = x; flo = fx; if (side === -1) fhi /= 2; side = -1; } else { hi = x; fhi = fx; if (side === 1) flo /= 2; side = 1; }
    if (Math.abs(hi - lo) <= tol * Math.max(1, Math.abs(x)) * 0.5 || hi - lo <= Number.MIN_VALUE * 4) return x;
  }
  return 0.5 * (lo + hi);
}
export function betaincinv(p, a, b) {
  if (Number.isNaN(p) || p < 0 || p > 1) return NaN; if (p === 0) return 0; if (p === 1) return 1;
  // bisect in [0,1] with log-scale aware secant
  return invertMonotone((x) => betainc(x, a, b), p, 0, 1, 1e-16);
}
export function gammaincinv(p, a) {
  if (Number.isNaN(p) || p < 0 || p > 1) return NaN; if (p === 0) return 0; if (p === 1) return Infinity;
  // Newton on P(a,x) from a Wilson-Hilferty start, fallback to bracket
  let x; const t = norminv(p); x = a * Math.pow(1 - 1 / (9 * a) + t / (3 * Math.sqrt(a)), 3); if (!(x > 0)) x = Math.pow(p * Math.exp(gammaln(a + 1)), 1 / a);
  if (!(x > 0) || !Number.isFinite(x)) x = a;
  const gl = gammaln(a);
  for (let it = 0; it < 100; it++) {
    const err = gammainc(x, a) - p; const pdf = Math.exp(-x + (a - 1) * Math.log(x) - gl);
    if (!(pdf > 0)) break;
    let dx = err / pdf; const xn = x - dx;
    x = xn <= 0 ? x / 2 : xn;
    if (Math.abs(dx) < 1e-15 * x) return x;
  }
  return invertMonotone((y) => gammainc(y, a), p, 0, Math.max(1, x * 2), 1e-15);
}
export function digamma(x) {
  if (x <= 0 && Number.isInteger(x)) return NaN;
  if (x < 0) return digamma(1 - x) - Math.PI / Math.tan(Math.PI * x);
  let r = 0; while (x < 6) { r -= 1 / x; x += 1; }
  const f = 1 / (x * x);
  return r + Math.log(x) - 0.5 / x - f * (1 / 12 - f * (1 / 120 - f * (1 / 252 - f * (1 / 240 - f / 132))));
}
/** log(n choose k) */
export const lnchoose = (n, k) => gammaln(n + 1) - gammaln(k + 1) - gammaln(n - k + 1);
/** Modified Bessel function I0 (for kaiser windows). */
export function besseli0(x) {
  let s = 1, t = 1; const y = x * x / 4;
  for (let k = 1; k < 500; k++) { t *= y / (k * k); s += t; if (t < s * 1e-17) break; }
  return s;
}
