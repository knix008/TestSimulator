// More dense linear algebra: rotation matrices (rotx/roty/rotz, givens),
// Householder and Gram-Schmidt steps (housh, mgorth, krylov), Cholesky and QR
// / LU updating (chol2inv, cholinv, cholinsert, choldelete, cholshift,
// qrshift, luupdate), structured matrices (commutation_matrix,
// duplication_matrix), page products (blkmm), the generalized SVD (gsvd),
// generalized Schur tools (qzhess, ordqz, trexc), the 1-norm estimator
// normest1, and the settings / probes matrix_type and svd_driver.
import { EPS, fail, mat, dbl, out, outMat, scalar, cscalar, optText, isOpt, scal, intArg, H, cdiv } from './util.js';
import { cm, toC, ceye, cmul, ctrans, qrFactor, qrQ, svdEcon, completeBasis, cholFactor, triSolve, luFactor, allZero, hasNonFinite } from './kernels.js';
import { rotg, rowRot, colRot } from './qz.js';
import { swapBlocks, blocksOf, builtins as extraB } from './extra.js';
import { builtins as denseB } from './dense.js';
import { spMulDense, spTranspose } from './sparse.js';
import { tensor, str, isSparse, isFuncHandle, isText, toStr, toBool } from '../../value.js';

const cmulS = (ar, ai, br, bi) => [ar * br - ai * bi, ar * bi + ai * br];
const isEmptyV = (v) => v == null || (v.dims && v.dims.reduce((a, b) => a * b, 1) === 0);
const many = (outs, nargout) => (nargout <= 1 ? outs[0] : outs.slice(0, Math.max(1, nargout)));

/** Complex column-major copy {m, n, re, im, cls} of a 2-D numeric argument. */
function cmat(v, fn, what) { const a = mat(v, fn, what); const c = toC(a); c.cls = a.cls; return c; }
/** Value of a complex matrix (imaginary part dropped when zero). */
const outC = (M, cls = 'double') => outMat(M.m, M.n, M.re, allZero(M.im) ? null : M.im, cls);
const colOf = (M, j) => ({ re: M.re.slice(j * M.m, (j + 1) * M.m), im: M.im.slice(j * M.m, (j + 1) * M.m) });
const vnorm = (v) => { let s = 0; for (let i = 0; i < v.re.length; i++) s = Math.hypot(s, v.re[i], v.im[i]); return s; };
/** M (m-by-k) times vector v (k). */
function mv(M, v) {
  const r = { re: new Float64Array(M.m), im: new Float64Array(M.m) };
  for (let j = 0; j < M.n; j++) {
    const br = v.re[j], bi = v.im[j]; if (br === 0 && bi === 0) continue;
    for (let i = 0; i < M.m; i++) { const ar = M.re[i + j * M.m], ai = M.im[i + j * M.m]; r.re[i] += ar * br - ai * bi; r.im[i] += ar * bi + ai * br; }
  }
  return r;
}
/** u^H v. */
function dotH(u, v) { let r = 0, i = 0; for (let k = 0; k < u.re.length; k++) { r += u.re[k] * v.re[k] + u.im[k] * v.im[k]; i += u.re[k] * v.im[k] - u.im[k] * v.re[k]; } return [r, i]; }
/** Matrix from column vectors. */
function fromCols(m, cols) { const M = cm(m, cols.length); cols.forEach((c, j) => { M.re.set(c.re, j * m); M.im.set(c.im, j * m); }); return M; }

/** m-by-ncol matrix whose columns are the given orthonormal vectors (null = free) completed orthonormally. */
function fillBasis(m, cols, ncol) {
  const Q = cm(m, ncol); const have = [];
  cols.forEach((c, j) => { if (c && j < ncol) { Q.re.set(c.re, j * m); Q.im.set(c.im, j * m); have.push(j); } });
  const known = have.map((j) => colOf(Q, j));
  let e = 0;
  for (let j = 0; j < ncol; j++) {
    if (cols[j] && j < ncol) continue;
    let v = null;
    while (e < m && !v) {
      const w = { re: new Float64Array(m), im: new Float64Array(m) }; w.re[e++] = 1;
      for (let pass = 0; pass < 2; pass++) for (const k of known) { const [dr, di] = dotH(k, w); for (let i = 0; i < m; i++) { w.re[i] -= k.re[i] * dr - k.im[i] * di; w.im[i] -= k.re[i] * di + k.im[i] * dr; } }
      const nr = vnorm(w);
      if (nr > 0.5) { for (let i = 0; i < m; i++) { w.re[i] /= nr; w.im[i] /= nr; } v = w; }
    }
    if (!v) break;
    known.push(v); Q.re.set(v.re, j * m); Q.im.set(v.im, j * m);
  }
  return Q;
}

// ------------------------------------------------------------- rotations

/** [sin, cos] of an angle in degrees, exact at multiples of 90. */
function sincosd(t) {
  const r = ((t % 360) + 360) % 360;
  if (r === 0) return [0, 1];
  if (r === 90) return [1, 0];
  if (r === 180) return [0, -1];
  if (r === 270) return [-1, 0];
  const a = (t * Math.PI) / 180; return [Math.sin(a), Math.cos(a)];
}
function rotFn(axis) {
  const fn = `rot${axis}`;
  return (args) => {
    if (args.length < 1) fail(`${fn}:notEnoughInputs`, 'Not enough input arguments.');
    const t = dbl(args[0], fn, 'theta');
    if (t.re.length !== 1 || (t.im && t.im[0] !== 0)) fail(`${fn}:invalidAngle`, 'The angle must be a real scalar (degrees).');
    const [s, c] = sincosd(t.re[0]);
    const rows = axis === 'x' ? [[1, 0, 0], [0, c, -s], [0, s, c]] : axis === 'y' ? [[c, 0, s], [0, 1, 0], [-s, 0, c]] : [[c, -s, 0], [s, c, 0], [0, 0, 1]];
    const re = new Float64Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) re[i + 3 * j] = rows[i][j];
    return outMat(3, 3, re);
  };
}

function givensFn(args, nargout) {
  if (args.length < 2) fail('givens:notEnoughInputs', 'Not enough input arguments.');
  const x = dbl(args[0], 'givens', 'x'), y = dbl(args[1], 'givens', 'y');
  if (x.re.length !== 1 || y.re.length !== 1) fail('givens:notScalar', 'x and y must be scalars.');
  const xr = x.re[0], xi = x.im ? x.im[0] : 0, yr = y.re[0], yi = y.im ? y.im[0] : 0;
  const af = Math.hypot(xr, xi), ag = Math.hypot(yr, yi);
  let c, sr, si;
  if (ag === 0) { c = 1; sr = 0; si = 0; } else if (af === 0) { c = 0; sr = yr / ag; si = -yi / ag; } else {
    const nr = Math.hypot(af, ag); c = af / nr;
    [sr, si] = cmulS(xr / af, xi / af, yr, -yi); sr /= nr; si /= nr;
  }
  if (nargout >= 2) return [scalar(c), cscalar(sr, si)];
  return outMat(2, 2, [c, -sr, sr, c], [0, si, si, 0]);
}

// ------------------------------------------------------------- Householder / Gram-Schmidt / Krylov

function houshFn(args, nargout) {
  if (args.length < 2) fail('housh:notEnoughInputs', 'Not enough input arguments.');
  const x = dbl(args[0], 'housh', 'x');
  const n = x.re.length;
  const j = intArg(args[1], 'housh', 'j') - 1;
  if (j < 0 || j >= n) fail('housh:badIndex', 'j must be an index into x.');
  const z = args[2] == null || isEmptyV(args[2]) ? 0 : scal(args[2], 'housh', 'z');
  const re = Float64Array.from(x.re), im = x.im ? Float64Array.from(x.im) : new Float64Array(n);
  let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.hypot(re[i], im[i]));
  let beta = 0;
  if (m !== 0) {
    for (let i = 0; i < n; i++) { re[i] /= m; im[i] /= m; }
    let alpha = 0; for (let i = 0; i < n; i++) alpha = Math.hypot(alpha, re[i], im[i]);
    if (alpha > z) {
      const aj = Math.hypot(re[j], im[j]);
      beta = 1 / (alpha * (alpha + aj));
      const sr = aj === 0 ? 1 : re[j] / aj, si = aj === 0 ? 0 : im[j] / aj;
      re[j] += alpha * sr; im[j] += alpha * si;
    }
  }
  const hv = outMat(x.dims[0], x.dims[1], re, allZero(im) ? null : im);
  return many([hv, scalar(beta), scalar(beta === 0 ? 1 : 0)], nargout);
}

function mgorthFn(args, nargout) {
  if (args.length < 2) fail('mgorth:notEnoughInputs', 'Not enough input arguments.');
  const x = cmat(args[0], 'mgorth', 'x'), V = cmat(args[1], 'mgorth', 'v');
  if (x.n !== 1) fail('mgorth:notColumn', 'x must be a column vector.');
  if (V.m !== x.m) fail('mgorth:dimMismatch', 'v must have as many rows as x.');
  const k = V.n; const y = colOf(x, 0);
  const hr = new Float64Array(k + 1), hi = new Float64Array(k + 1);
  for (let j = 0; j < k; j++) {
    const vj = colOf(V, j); const [dr, di] = dotH(vj, y); hr[j] = dr; hi[j] = di;
    for (let i = 0; i < x.m; i++) { y.re[i] -= vj.re[i] * dr - vj.im[i] * di; y.im[i] -= vj.re[i] * di + vj.im[i] * dr; }
  }
  const nr = vnorm(y); hr[k] = nr;
  if (nr > 0) for (let i = 0; i < x.m; i++) { y.re[i] /= nr; y.im[i] /= nr; }
  return many([outMat(x.m, 1, y.re, allZero(y.im) ? null : y.im), outMat(k + 1, 1, hr, allZero(hi) ? null : hi)], nargout);
}

function krylovFn(args, nargout) {
  if (args.length < 3) fail('krylov:notEnoughInputs', 'Not enough input arguments.');
  const A = cmat(args[0], 'krylov', 'A'); const n = A.n;
  if (A.m !== n) fail('krylov:notSquare', 'A must be a square matrix.');
  const V = cmat(args[1], 'krylov', 'V');
  if (V.m !== n) fail('krylov:dimMismatch', 'V must have as many rows as A.');
  const k = intArg(args[2], 'krylov', 'k');
  const eps1 = args[3] == null || isEmptyV(args[3]) ? 1e-12 : scal(args[3], 'krylov', 'eps1');
  const basis = [];
  let block = Array.from({ length: V.n }, (_, j) => colOf(V, j));
  for (let it = 0; it < k && basis.length < n && block.length; it++) {
    const next = [];
    for (const v0 of block) {
      if (basis.length + next.length >= n) break;
      const w = { re: Float64Array.from(v0.re), im: Float64Array.from(v0.im) };
      const n0 = vnorm(w); if (n0 === 0) continue;
      for (let pass = 0; pass < 2; pass++) for (const u of basis.concat(next)) {
        const [dr, di] = dotH(u, w);
        for (let i = 0; i < n; i++) { w.re[i] -= u.re[i] * dr - u.im[i] * di; w.im[i] -= u.re[i] * di + u.im[i] * dr; }
      }
      const nr = vnorm(w);
      if (nr <= eps1 * n0) continue;
      for (let i = 0; i < n; i++) { w.re[i] /= nr; w.im[i] /= nr; }
      next.push(w);
    }
    basis.push(...next);
    block = next.map((u) => mv(A, u));
  }
  const nu = basis.length;
  const U = fromCols(n, basis);
  const Hm = cmul(ctrans(U), cmul(A, U));
  return many([outC(U), outC(Hm), scalar(nu)], nargout);
}

// ------------------------------------------------------------- Cholesky / QR / LU updating

function chol2invCore(R) {
  const n = R.n;
  const Ru = cm(n, n); for (let j = 0; j < n; j++) for (let i = 0; i <= j; i++) { Ru.re[i + j * n] = R.re[i + j * n]; Ru.im[i + j * n] = R.im[i + j * n]; }
  const Ri = triSolve(Ru, ceye(n), true);
  const X = cmul(Ri, ctrans(Ri));
  for (let j = 0; j < n; j++) {
    X.im[j + j * n] = 0;
    for (let i = j + 1; i < n; i++) {
      const a = i + j * n, b = j + i * n;
      const r = (X.re[a] + X.re[b]) / 2, im = (X.im[a] - X.im[b]) / 2;
      X.re[a] = r; X.re[b] = r; X.im[a] = im; X.im[b] = -im;
    }
  }
  return X;
}
function chol2invFn(args) {
  if (!args.length) fail('chol2inv:notEnoughInputs', 'Not enough input arguments.');
  const R = cmat(args[0], 'chol2inv', 'R');
  if (R.m !== R.n) fail('chol2inv:notSquare', 'R must be a square matrix.');
  return outC(chol2invCore(R), R.cls);
}
function cholinvFn(args) {
  if (!args.length) fail('cholinv:notEnoughInputs', 'Not enough input arguments.');
  const A = cmat(args[0], 'cholinv', 'A');
  if (A.m !== A.n) fail('cholinv:notSquare', 'A must be a square matrix.');
  const { R, p } = cholFactor(A);
  if (p) fail('cholinv:notPosDef', 'A must be positive definite.');
  return outC(chol2invCore(R), A.cls);
}
/** Square upper-triangular argument (lower part ignored). */
function upperArg(v, fn) {
  const R = cmat(v, fn, 'R');
  if (R.m !== R.n) fail(`${fn}:notSquare`, 'R must be a square upper triangular matrix.');
  for (let j = 0; j < R.n; j++) for (let i = j + 1; i < R.n; i++) { R.re[i + j * R.n] = 0; R.im[i + j * R.n] = 0; }
  return R;
}
/** Givens sweep: makes M upper triangular from the left, accumulating Q <- Q*G^H. */
function retriangularize(M, Q = null) {
  const m = M.m, n = M.n;
  for (let c = 0; c < Math.min(m - 1, n); c++) {
    for (let r = m - 1; r > c; r--) {
      const o = r + c * m;
      if (M.re[o] === 0 && M.im[o] === 0) continue;
      const G = rotg(M.re[o - 1], M.im[o - 1], M.re[o], M.im[o]);
      rowRot(M, r - 1, r, G, c, n);
      M.re[o] = 0; M.im[o] = 0;
      if (Q) colRot(Q, r - 1, r, { c: G.c, sr: -G.sr, si: -G.si }, 0, Q.m);
    }
  }
}
/** Makes the diagonal of an upper triangular R real and nonnegative (row scaling by unit factors). */
function positiveDiag(R) {
  const { m, n } = R;
  for (let k = 0; k < Math.min(m, n); k++) {
    const dr = R.re[k + k * m], di = R.im[k + k * m]; const a = Math.hypot(dr, di);
    if (a === 0 || (di === 0 && dr > 0)) continue;
    const pr = dr / a, pi = -di / a;
    for (let j = k; j < n; j++) { const o = k + j * m; const [x, y] = cmulS(R.re[o], R.im[o], pr, pi); R.re[o] = x; R.im[o] = y; }
    R.im[k + k * m] = 0;
  }
}
/** Column order p of the cyclic shift that moves column i to position j (0-based). */
function shiftPerm(n, i, j) {
  const p = Array.from({ length: n }, (_, k) => k);
  if (i < j) { const t = p[i]; for (let k = i; k < j; k++) p[k] = p[k + 1]; p[j] = t; } else if (j < i) { const t = p[i]; for (let k = i; k > j; k--) p[k] = p[k - 1]; p[j] = t; }
  return p;
}
function permCols(M, p) {
  const R = cm(M.m, p.length);
  p.forEach((c, j) => { R.re.set(M.re.subarray(c * M.m, (c + 1) * M.m), j * M.m); R.im.set(M.im.subarray(c * M.m, (c + 1) * M.m), j * M.m); });
  return R;
}

function cholinsertFn(args, nargout) {
  if (args.length < 3) fail('cholinsert:notEnoughInputs', 'Not enough input arguments.');
  const R = upperArg(args[0], 'cholinsert'); const n = R.n;
  const j = intArg(args[1], 'cholinsert', 'j') - 1;
  if (j < 0 || j > n) fail('cholinsert:badIndex', 'Index j out of range.');
  const x = dbl(args[2], 'cholinsert', 'x');
  if (x.re.length !== n + 1) fail('cholinsert:dimMismatch', 'x must have length(R)+1 elements.');
  for (let k = 0; k < n; k++) if (R.re[k + k * n] === 0 && R.im[k + k * n] === 0) {
    if (nargout >= 2) return [outC(R, R.cls), scalar(2)];
    fail('cholinsert:singular', 'R is singular.');
  }
  const A = cmul(ctrans(R), R); const N = n + 1;
  const A1 = cm(N, N); const map = (k) => (k < j ? k : k + 1);
  for (let c = 0; c < n; c++) for (let r = 0; r < n; r++) { const o = map(r) + map(c) * N; A1.re[o] = A.re[r + c * n]; A1.im[o] = A.im[r + c * n]; }
  for (let r = 0; r < N; r++) {
    const xr = x.re[r], xi = x.im ? x.im[r] : 0;
    A1.re[r + j * N] = xr; A1.im[r + j * N] = xi;
    A1.re[j + r * N] = xr; A1.im[j + r * N] = -xi;
  }
  A1.im[j + j * N] = 0;
  const F = cholFactor(A1);
  if (F.p) {
    if (nargout >= 2) return [outC(R, R.cls), scalar(1)];
    fail('cholinsert:notPosDef', 'Insertion violates positiveness.');
  }
  return many([outC(F.R, R.cls), scalar(0)], nargout);
}
function choldeleteFn(args) {
  if (args.length < 2) fail('choldelete:notEnoughInputs', 'Not enough input arguments.');
  const R = upperArg(args[0], 'choldelete'); const n = R.n;
  const j = intArg(args[1], 'choldelete', 'j') - 1;
  if (j < 0 || j >= n) fail('choldelete:badIndex', 'Index j out of range.');
  const keep = []; for (let k = 0; k < n; k++) if (k !== j) keep.push(k);
  const M = permCols(R, keep);
  retriangularize(M);
  const R1 = cm(n - 1, n - 1);
  for (let c = 0; c < n - 1; c++) for (let r = 0; r <= c; r++) { R1.re[r + c * (n - 1)] = M.re[r + c * n]; R1.im[r + c * (n - 1)] = M.im[r + c * n]; }
  positiveDiag(R1);
  return outC(R1, R.cls);
}
function cholshiftFn(args) {
  if (args.length < 3) fail('cholshift:notEnoughInputs', 'Not enough input arguments.');
  const R = upperArg(args[0], 'cholshift'); const n = R.n;
  const i = intArg(args[1], 'cholshift', 'i') - 1, j = intArg(args[2], 'cholshift', 'j') - 1;
  if (i < 0 || i >= n || j < 0 || j >= n) fail('cholshift:badIndex', 'Indices out of range.');
  const M = permCols(R, shiftPerm(n, i, j));
  retriangularize(M); positiveDiag(M);
  return outC(M, R.cls);
}
function qrshiftFn(args, nargout) {
  if (args.length < 4) fail('qrshift:notEnoughInputs', 'Not enough input arguments.');
  const Q = cmat(args[0], 'qrshift', 'Q'), R = cmat(args[1], 'qrshift', 'R');
  if (Q.n !== R.m) fail('qrshift:dimMismatch', 'Q and R dimensions do not match.');
  const n = R.n;
  const i = intArg(args[2], 'qrshift', 'i') - 1, j = intArg(args[3], 'qrshift', 'j') - 1;
  if (i < 0 || i >= n || j < 0 || j >= n) fail('qrshift:badIndex', 'Indices out of range.');
  const M = permCols(R, shiftPerm(n, i, j)); const Q1 = toC(Q);
  retriangularize(M, Q1);
  const cls = Q.cls === 'single' || R.cls === 'single' ? 'single' : 'double';
  return many([outC(Q1, cls), outC(M, cls)], nargout);
}

function luupdateFn(args, nargout) {
  if (args.length !== 4 && args.length !== 5) fail('luupdate:badArgs', 'Use luupdate(L, U, x, y) or luupdate(L, U, P, x, y).');
  const L = cmat(args[0], 'luupdate', 'L'), U = cmat(args[1], 'luupdate', 'U');
  const m = L.m, k = L.n, n = U.n;
  if (U.m !== k) fail('luupdate:dimMismatch', 'L and U dimensions do not match.');
  const piv = args.length === 5;
  const P = piv ? cmat(args[2], 'luupdate', 'P') : null;
  const xv = dbl(args[piv ? 3 : 2], 'luupdate', 'x'), yv = dbl(args[piv ? 4 : 3], 'luupdate', 'y');
  if (xv.re.length !== m || yv.re.length !== n) fail('luupdate:dimMismatch', 'x must have rows(L) and y columns(U) elements.');
  const x = { re: Float64Array.from(xv.re), im: xv.im ? Float64Array.from(xv.im) : new Float64Array(m) };
  const y = { re: Float64Array.from(yv.re), im: yv.im ? Float64Array.from(yv.im) : new Float64Array(n) };
  const cls = [L, U].some((a) => a.cls === 'single') ? 'single' : 'double';
  if (piv) {
    if (P.m !== m || P.n !== m) fail('luupdate:dimMismatch', 'P must be square with rows(L) rows.');
    // P1'*L1*U1 = P'*L*U + x*y.'  <=>  lu(L*U + (P*x)*y.') with P1 = Pf*P
    const B = cmul(L, U); const px = mv(P, x);
    for (let c = 0; c < n; c++) for (let r = 0; r < m; r++) { const [a, b] = cmulS(px.re[r], px.im[r], y.re[c], y.im[c]); B.re[r + c * m] += a; B.im[r + c * m] += b; }
    const F = luFactor(B); const kk = Math.min(m, n);
    const L1 = cm(m, kk), U1 = cm(kk, n), Pf = cm(m, m);
    for (let c = 0; c < kk; c++) for (let r = 0; r < m; r++) { if (r === c) L1.re[r + c * m] = 1; else if (r > c) { L1.re[r + c * m] = F.re[r + c * m]; L1.im[r + c * m] = F.im[r + c * m]; } }
    for (let c = 0; c < n; c++) for (let r = 0; r <= Math.min(c, kk - 1); r++) { U1.re[r + c * kk] = F.re[r + c * m]; U1.im[r + c * kk] = F.im[r + c * m]; }
    for (let r = 0; r < m; r++) Pf.re[r + F.piv[r] * m] = 1;
    return many([outC(L1, cls), outC(U1, cls), outC(cmul(Pf, P), cls)], nargout);
  }
  // Bennett's rank-one update of L*U (L normalized to a unit diagonal first)
  const Lw = toC(L), Uw = toC(U);
  for (let c = 0; c < k; c++) {
    const dr = Lw.re[c + c * m], di = Lw.im[c + c * m];
    if (dr === 0 && di === 0) fail('luupdate:singularL', 'L must have a nonzero diagonal.');
    if (dr === 1 && di === 0) continue;
    for (let r = c; r < m; r++) { const [a, b] = cdiv(Lw.re[r + c * m], Lw.im[r + c * m], dr, di); Lw.re[r + c * m] = a; Lw.im[r + c * m] = b; }
    for (let j = 0; j < n; j++) { const o = c + j * k; const [a, b] = cmulS(Uw.re[o], Uw.im[o], dr, di); Uw.re[o] = a; Uw.im[o] = b; }
  }
  for (let c = 0; c < k; c++) {
    const ou = c + c * k;
    const u11r = Uw.re[ou], u11i = Uw.im[ou];
    const [t1, t2] = cmulS(x.re[c], x.im[c], y.re[c], y.im[c]);
    const unr = u11r + t1, uni = u11i + t2;
    for (let j = c + 1; j < n; j++) { const o = c + j * k; const [a, b] = cmulS(x.re[c], x.im[c], y.re[j], y.im[j]); Uw.re[o] += a; Uw.im[o] += b; }
    for (let r = c + 1; r < m; r++) {
      const o = r + c * m; const lr = Lw.re[o], li = Lw.im[o];
      const [a1, b1] = cmulS(lr, li, u11r, u11i), [a2, b2] = cmulS(x.re[r], x.im[r], y.re[c], y.im[c]);
      const [nr, ni] = cdiv(a1 + a2, b1 + b2, unr, uni);
      const [a3, b3] = cmulS(x.re[c], x.im[c], lr, li); x.re[r] -= a3; x.im[r] -= b3;
      Lw.re[o] = nr; Lw.im[o] = ni;
    }
    const [gr, gi] = cdiv(y.re[c], y.im[c], unr, uni);
    for (let j = c + 1; j < n; j++) { const o = c + j * k; const [a, b] = cmulS(gr, gi, Uw.re[o], Uw.im[o]); y.re[j] -= a; y.im[j] -= b; }
    Uw.re[ou] = unr; Uw.im[ou] = uni;
  }
  if (m > k && n > k) fail('luupdate:dimMismatch', 'L must be m-by-min(m,n) and U min(m,n)-by-n.');
  return many([outC(Lw, cls), outC(Uw, cls)], nargout);
}

// ------------------------------------------------------------- structured matrices, aliases, settings

function commutationFn(args) {
  if (!args.length) fail('commutation_matrix:notEnoughInputs', 'Not enough input arguments.');
  const m = intArg(args[0], 'commutation_matrix', 'm');
  const n = args[1] == null ? m : intArg(args[1], 'commutation_matrix', 'n');
  const N = m * n; const re = new Float64Array(N * N);
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) re[(j + n * i) + N * (i + m * j)] = 1;
  return outMat(N, N, re);
}
function duplicationFn(args) {
  if (!args.length) fail('duplication_matrix:notEnoughInputs', 'Not enough input arguments.');
  const n = intArg(args[0], 'duplication_matrix', 'n');
  const rows = n * n, cols = (n * (n + 1)) / 2; const re = new Float64Array(rows * cols);
  let c = 0;
  for (let j = 0; j < n; j++) for (let i = j; i < n; i++) { re[(i + n * j) + rows * c] = 1; re[(j + n * i) + rows * c] = 1; c++; }
  return outMat(rows, cols, re);
}
function blkmmFn(args, nargout, ctx) {
  if (args.length < 2) fail('blkmm:notEnoughInputs', 'Not enough input arguments.');
  const a = args[0].dims, b = args[1].dims;
  if (!a || !b) fail('blkmm:invalidInput', 'A and B must be numeric arrays.');
  if (a[1] !== b[0]) fail('blkmm:dimMismatch', 'A and B dimensions don\'t match: columns(A) must equal rows(B).');
  const pa = a.slice(2), pb = b.slice(2);
  while (pa.length < pb.length) pa.push(1); while (pb.length < pa.length) pb.push(1);
  if (pa.some((x, i) => x !== pb[i])) fail('blkmm:dimMismatch', 'A and B must have the same trailing dimensions.');
  void ctx;
  const A = dbl(args[0], 'blkmm', 'A'), B = dbl(args[1], 'blkmm', 'B');
  const m = a[0], k = a[1], n = b[1]; const np = pa.reduce((s, x) => s * x, 1);
  const cplx = !!(A.im || B.im);
  const re = new Float64Array(m * n * np), im = cplx ? new Float64Array(m * n * np) : null;
  for (let pg = 0; pg < np; pg++) {
    const r = cmul(cm(m, k, A.re.slice(pg * m * k, (pg + 1) * m * k), A.im ? A.im.slice(pg * m * k, (pg + 1) * m * k) : null), cm(k, n, B.re.slice(pg * k * n, (pg + 1) * k * n), B.im ? B.im.slice(pg * k * n, (pg + 1) * k * n) : null));
    re.set(r.re, pg * m * n); if (im) im.set(r.im, pg * m * n);
  }
  const cls = A.cls === 'single' || B.cls === 'single' || args[0].cls === 'single' || args[1].cls === 'single' ? 'single' : 'double';
  return out([m, n, ...pa], re, im && !allZero(im) ? im : null, cls);
}

const MATRIX_TYPES = ['unknown', 'full', 'positive definite', 'diagonal', 'permuted diagonal', 'upper', 'lower', 'banded', 'banded positive definite', 'tridiagonal', 'tridiagonal positive definite', 'permuted upper', 'permuted lower', 'singular', 'rectangular'];
function hermPosProbe(get, n) {
  const d = new Float64Array(n);
  for (let j = 0; j < n; j++) { const [r, i] = get(j, j); if (!(r > 0) || i !== 0) return false; d[j] = r; }
  return d;
}
function matrixTypeFn(args) {
  if (!args.length) fail('matrix_type:notEnoughInputs', 'Not enough input arguments.');
  const A = args[0];
  if (args.length >= 2) {
    const t = optText(args[1]);
    if (t == null || !MATRIX_TYPES.includes(t)) fail('matrix_type:badType', `Unknown matrix type '${t}'.`);
    if (t.startsWith('permuted') && t !== 'permuted diagonal' && args.length < 3) fail('matrix_type:needPerm', 'A permuted type needs the permutation vector.');
    return A;
  }
  const [m, n] = A.dims || [1, 1];
  if (isSparse(A)) {
    if (m !== n) return str('Rectangular');
    const nz = A.colPtr[n];
    let lo = 0, up = 0; const rowCnt = new Int32Array(m); let colOk = true;
    for (let j = 0; j < n; j++) {
      if (A.colPtr[j + 1] - A.colPtr[j] > 1) colOk = false;
      for (let p = A.colPtr[j]; p < A.colPtr[j + 1]; p++) { const i = A.rowIdx[p]; lo = Math.max(lo, i - j); up = Math.max(up, j - i); rowCnt[i]++; }
    }
    if (lo === 0 && up === 0) return str('Diagonal');
    if (colOk && nz === n && rowCnt.every((c) => c === 1)) return str('Permuted Diagonal');
    if (lo === 0) return str('Upper');
    if (up === 0) return str('Lower');
    const get = (i, j) => { for (let p = A.colPtr[j]; p < A.colPtr[j + 1]; p++) if (A.rowIdx[p] === i) return [A.re[p], A.im ? A.im[p] : 0]; return [0, 0]; };
    const posdef = () => {
      const d = hermPosProbe(get, n); if (!d) return false;
      for (let j = 0; j < n; j++) for (let p = A.colPtr[j]; p < A.colPtr[j + 1]; p++) {
        const i = A.rowIdx[p]; if (i === j) continue;
        const [ar, ai] = [A.re[p], A.im ? A.im[p] : 0]; const [br, bi] = get(j, i);
        if (ar !== br || ai !== -bi || ar * ar + ai * ai >= d[i] * d[j]) return false;
      }
      return true;
    };
    let area = 0; for (let k = -lo; k <= up; k++) area += n - Math.abs(k);
    if (area < n * n && nz / area >= spparmsGet(null, 'bandden')) {
      const pd = posdef();
      if (lo === 1 && up === 1) return str(pd ? 'Tridiagonal Positive Definite' : 'Tridiagonal');
      return str(pd ? 'Banded Positive Definite' : 'Banded');
    }
    return str(posdef() ? 'Positive Definite' : 'Full');
  }
  const t = dbl(A, 'matrix_type', 'A');
  if (t.dims.length > 2) fail('matrix_type:inputMustBe2D', 'A must be a 2-D matrix.');
  if (m !== n) return str('Rectangular');
  const g = (i, j) => [t.re[i + j * m], t.im ? t.im[i + j * m] : 0];
  let upper = true, lower = true;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (i === j) continue; const [r, im] = g(i, j);
    if (r !== 0 || im !== 0) { if (i > j) upper = false; else lower = false; }
  }
  if (upper) return str('Upper');
  if (lower) return str('Lower');
  const d = hermPosProbe(g, n);
  if (d) {
    let herm = true;
    for (let j = 0; j < n && herm; j++) for (let i = j + 1; i < n; i++) {
      const [ar, ai] = g(i, j), [br, bi] = g(j, i);
      if (ar !== br || ai !== -bi || ar * ar + ai * ai >= d[i] * d[j]) { herm = false; break; }
    }
    if (herm) return str('Positive Definite');
  }
  return str('Full');
}

// Sparse parameter table shared with sparse2.js (spparms) — kept here so matrix_type can read 'bandden'.
export const SPPARMS_KEYS = ['spumoni', 'ths_rel', 'ths_abs', 'exact_d', 'supernd', 'rreduce', 'wh_frac', 'autommd', 'autoamd', 'piv_tol', 'bandden', 'umfpack', 'sym_tol'];
export const SPPARMS_DEFAULT = [0, 1, 1, 0, 3, 3, 0.5, 1, 1, 0.1, 0.5, 1, 0.001];
export const SPPARMS_TIGHT = [0, 1, 0, 1, 1, 1, 0.5, 1, 1, 0.1, 0.5, 1, 0.001];
export function spparmsState(ctx) {
  const st = ctx && ctx.state ? (ctx.state.linalg ||= {}) : {};
  if (!st.spparms) st.spparms = SPPARMS_DEFAULT.slice();
  return st.spparms;
}
function spparmsGet(ctx, key) { return spparmsState(ctx)[SPPARMS_KEYS.indexOf(key)]; }

const SVD_DRIVERS = ['gesvd', 'gesdd', 'gejsv'];
function svdDriverFn(args, nargout, ctx) {
  const st = ctx && ctx.state ? (ctx.state.linalg ||= {}) : {};
  const old = st.svdDriver || 'gesvd';
  if (args.length >= 1) {
    const v = optText(args[0]);
    if (v == null || !SVD_DRIVERS.includes(v)) fail('svd_driver:badValue', "The SVD driver must be 'gesvd', 'gesdd' or 'gejsv'.");
    if (args.length >= 2 && optText(args[1]) !== 'local') fail('svd_driver:badOption', "The second argument must be 'local'.");
    st.svdDriver = v;
    if (nargout === 0) return undefined;
  }
  return str(old);
}

// ------------------------------------------------------------- normest1 (Higham & Tisseur block estimator)

function normest1Fn(args, nargout, ctx) {
  if (!args.length) fail('normest1:notEnoughInputs', 'Not enough input arguments.');
  const A = args[0];
  let t = args[1] == null || isEmptyV(args[1]) ? 2 : intArg(args[1], 'normest1', 't');
  const X0 = args[2] == null || isEmptyV(args[2]) ? null : cmat(args[2], 'normest1', 'x0');
  const extra = args.slice(3);
  let n, real = true, apply, applyT;
  let exact = null;
  if (isFuncHandle(A) || isText(A)) {
    const f = isText(A) ? toStr(A) : A;
    const callf = (flag, X) => ctx.call(f, [str(flag), X || tensor('double', [0, 0]), ...extra], 1)[0];
    n = Math.round(scal(callf('dim'), 'normest1', 'dim'));
    real = toBool(callf('real'));
    apply = (X) => cmat(callf('notransp', outC(X)), 'normest1', 'Afcn');
    applyT = (X) => cmat(callf('transp', outC(X)), 'normest1', 'Afcn');
  } else if (isSparse(A)) {
    if (A.dims[0] !== A.dims[1]) fail('normest1:notSquare', 'A must be square.');
    n = A.dims[0]; real = !A.im;
    const At = spTranspose(A, true);
    apply = (X) => cmat(spMulDense(A, outC(X)), 'normest1');
    applyT = (X) => cmat(spMulDense(At, outC(X)), 'normest1');
  } else {
    const M = cmat(A, 'normest1', 'A');
    if (M.m !== M.n) fail('normest1:notSquare', 'A must be square.');
    n = M.n; real = allZero(M.im);
    const Mh = ctrans(M);
    apply = (X) => cmul(M, X); applyT = (X) => cmul(Mh, X);
    if (n <= 4) exact = M;
  }
  if (n === 0) return many([scalar(0), outMat(0, 1, []), outMat(0, 1, []), outMat(1, 2, [0, 0])], nargout);
  t = Math.max(1, Math.min(t, n));
  const colNorms = (Y) => { const r = new Float64Array(Y.n); for (let j = 0; j < Y.n; j++) { let s = 0; for (let i = 0; i < Y.m; i++) s += Math.hypot(Y.re[i + j * Y.m], Y.im[i + j * Y.m]); r[j] = s; } return r; };
  const unit = (k) => { const e = cm(n, 1); e.re[k] = 1; return e; };
  if (exact || t === n) {
    const M = exact || apply(ceye(n));
    const cn = colNorms(M); let j = 0; for (let k = 1; k < n; k++) if (cn[k] > cn[j]) j = k;
    const w = cm(n, 1); w.re.set(M.re.subarray(j * n, (j + 1) * n)); w.im.set(M.im.subarray(j * n, (j + 1) * n));
    return many([scalar(cn[j]), outC(unit(j)), outC(w), outMat(1, 2, [1, exact ? 0 : n])], nargout);
  }
  let seed = 0x2545F491;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 16) & 1 ? 1 : -1; };
  const parallel = (a, b) => { let s = 0; for (let i = 0; i < n; i++) s += a[i] * b[i]; return Math.abs(s) === n; };
  let X;
  if (X0) { if (X0.m !== n || X0.n !== t) fail('normest1:badX0', 'x0 must be n-by-t.'); X = X0; } else {
    X = cm(n, t);
    for (let i = 0; i < n; i++) X.re[i] = 1;
    for (let j = 1; j < t; j++) {
      for (let tries = 0; tries < 100; tries++) {
        const col = Array.from({ length: n }, rnd);
        let ok = true; for (let q = 0; q < j && ok; q++) if (parallel(col, Array.from(X.re.subarray(q * n, (q + 1) * n), (v) => (v >= 0 ? 1 : -1)))) ok = false;
        X.re.set(col, j * n); if (ok) break;
      }
    }
    for (let i = 0; i < X.re.length; i++) X.re[i] /= n;
  }
  const itmax = 5; let estOld = 0, est = 0, nmv = 0, k = 1;
  let vBest = null, wBest = null, indBest = -1;
  const histSet = new Set(); let S = null; let ind = null;
  for (;;) {
    const Y = apply(X); nmv += t;
    const cn = colNorms(Y); let j = 0; for (let q = 1; q < t; q++) if (cn[q] > cn[j]) j = q;
    est = cn[j];
    if (est > estOld || k === 2) {
      if (ind) indBest = ind[j];
      vBest = cm(n, 1); vBest.re.set(X.re.subarray(j * n, (j + 1) * n)); vBest.im.set(X.im.subarray(j * n, (j + 1) * n));
      wBest = cm(n, 1); wBest.re.set(Y.re.subarray(j * n, (j + 1) * n)); wBest.im.set(Y.im.subarray(j * n, (j + 1) * n));
    }
    if (k >= 2 && est <= estOld) { est = estOld; break; }
    estOld = est;
    if (k > itmax) break;
    const Sold = S;
    S = cm(n, t);
    for (let q = 0; q < n * t; q++) { const a = Math.hypot(Y.re[q], Y.im[q]); if (a === 0) S.re[q] = 1; else if (real) S.re[q] = Y.re[q] >= 0 ? 1 : -1; else { S.re[q] = Y.re[q] / a; S.im[q] = Y.im[q] / a; } }
    if (real && Sold) {
      const col = (M, q) => Array.from(M.re.subarray(q * n, (q + 1) * n));
      let all = true;
      for (let q = 0; q < t && all; q++) { let any = false; for (let r = 0; r < t; r++) if (parallel(col(S, q), col(Sold, r))) { any = true; break; } if (!any) all = false; }
      if (all) break;
      for (let q = 0; q < t; q++) {
        for (let tries = 0; tries < 100; tries++) {
          const c = col(S, q); let bad = false;
          for (let r = 0; r < q && !bad; r++) if (parallel(c, col(S, r))) bad = true;
          for (let r = 0; r < t && !bad; r++) if (parallel(c, col(Sold, r))) bad = true;
          if (!bad) break;
          S.re.set(Array.from({ length: n }, rnd), q * n);
        }
      }
    }
    const Z = applyT(S); nmv += t;
    const h = new Float64Array(n);
    for (let i = 0; i < n; i++) { let mx = 0; for (let q = 0; q < t; q++) mx = Math.max(mx, Math.hypot(Z.re[i + q * n], Z.im[i + q * n])); h[i] = mx; }
    let hmax = 0; for (let i = 0; i < n; i++) hmax = Math.max(hmax, h[i]);
    if (k >= 2 && indBest >= 0 && hmax === h[indBest]) break;
    let order = Array.from({ length: n }, (_, i) => i).sort((a, b) => h[b] - h[a] || a - b);
    if (t > 1) {
      if (order.slice(0, t).every((i) => histSet.has(i))) break;
      order = order.filter((i) => !histSet.has(i)).concat(order.filter((i) => histSet.has(i)));
    }
    ind = order.slice(0, t);
    X = cm(n, t); ind.forEach((i, q) => { X.re[i + q * n] = 1; histSet.add(i); });
    k++;
  }
  return many([scalar(est), outC(vBest), outC(wBest), outMat(1, 2, [k, nmv])], nargout);
}

// ------------------------------------------------------------- generalized SVD

/** SVD with a full set of right singular vectors: {U (m-by-min), s (n, zero padded), V (n-by-n)}. */
function svdFullRight(A) {
  const r = Math.min(A.m, A.n);
  if (r === 0) return { U: cm(A.m, 0), s: new Float64Array(A.n), V: ceye(A.n) };
  const { U, s, V } = svdEcon(A, true);
  const Vf = A.n > r ? completeBasis(V, r) : V;
  const sf = new Float64Array(A.n); sf.set(s);
  return { U, s: sf, V: Vf };
}
function gsvdFn(args, nargout) {
  if (args.length < 2) fail('gsvd:notEnoughInputs', 'Not enough input arguments.');
  const A = cmat(args[0], 'gsvd', 'A'), B = cmat(args[1], 'gsvd', 'B');
  if (A.n !== B.n) fail('gsvd:dimMismatch', 'A and B must have the same number of columns.');
  if (hasNonFinite(A) || hasNonFinite(B)) fail('gsvd:nonFinite', 'A and B must not contain NaN or Inf.');
  let econ = false;
  if (args.length > 2) { const o = optText(args[2]); econ = o === 'econ' || (o == null && scal(args[2], 'gsvd', 'econ') === 0); if (o != null && o !== 'econ') fail('gsvd:badOption', "The third argument must be 0 or 'econ'."); }
  const cls = A.cls === 'single' || B.cls === 'single' ? 'single' : 'double';
  const m = A.m, p = B.m, n = A.n, mp = m + p;
  const q = Math.min(mp, n);
  const M = cm(mp, n);
  for (let j = 0; j < n; j++) {
    M.re.set(A.re.subarray(j * m, (j + 1) * m), j * mp); M.im.set(A.im.subarray(j * m, (j + 1) * m), j * mp);
    M.re.set(B.re.subarray(j * p, (j + 1) * p), j * mp + m); M.im.set(B.im.subarray(j * p, (j + 1) * p), j * mp + m);
  }
  const F = qrFactor(M, false);
  const Q = qrQ(F, q);
  const R = cm(q, n);
  for (let j = 0; j < n; j++) for (let i = 0; i <= Math.min(j, q - 1); i++) { R.re[i + j * q] = F.R.re[i + j * mp]; R.im[i + j * q] = F.R.im[i + j * mp]; }
  const Q1 = cm(m, q), Q2 = cm(p, q);
  for (let j = 0; j < q; j++) for (let i = 0; i < mp; i++) {
    const src = i + j * mp;
    if (i < m) { Q1.re[i + j * m] = Q.re[src]; Q1.im[i + j * m] = Q.im[src]; } else { Q2.re[i - m + j * p] = Q.re[src]; Q2.im[i - m + j * p] = Q.im[src]; }
  }
  // CS decomposition of [Q1; Q2]: Q1 = U*C*W', Q2 = V*S*W' (two SVDs for accuracy at both ends)
  const items = [];
  const s1 = svdFullRight(Q2); const kp = Math.min(p, q);
  const L = [];
  for (let k = 0; k < q; k++) {
    if (s1.s[k] >= Math.SQRT1_2) { L.push(k); continue; }
    const w = colOf(s1.V, k); const g1 = mv(Q1, w); const c = vnorm(g1);
    const u = c > 0 ? { re: g1.re.map((x) => x / c), im: g1.im.map((x) => x / c) } : null;
    items.push({ w, c, s: s1.s[k], u, v: k < kp ? colOf(s1.U, k) : null });
  }
  if (L.length) {
    const WL = fromCols(q, L.map((k) => colOf(s1.V, k)));
    const s2 = svdFullRight(cmul(Q1, WL)); const km = Math.min(m, L.length);
    for (let j = 0; j < L.length; j++) {
      const w = mv(WL, colOf(s2.V, j)); const g2 = mv(Q2, w); const s = vnorm(g2);
      items.push({ w, c: s2.s[j], s, u: j < km ? colOf(s2.U, j) : null, v: s > 0 ? { re: g2.re.map((x) => x / s), im: g2.im.map((x) => x / s) } : null });
    }
  }
  const sig = (it) => (it.s === 0 ? Infinity : it.c / it.s);
  items.sort((a, b) => sig(a) - sig(b));
  if (nargout <= 1) return outMat(q, 1, Float64Array.from(items, sig), null, cls);
  const nu = econ ? Math.min(m, q) : m, nv = econ ? Math.min(p, q) : p;
  const shift = Math.max(0, q - m);
  const C = cm(nu, q), Sm = cm(nv, q);
  const Ucols = new Array(nu).fill(null), Vcols = new Array(nv).fill(null);
  items.forEach((it, k) => {
    if (k >= shift) { const row = k - shift; if (row < nu) { C.re[row + k * nu] = it.c; Ucols[row] = it.u; } }
    if (k < kp && k < nv) { Sm.re[k + k * nv] = it.s; Vcols[k] = it.v; }
  });
  const U = fillBasis(m, Ucols, nu), V = fillBasis(p, Vcols, nv);
  const W = fromCols(q, items.map((it) => it.w));
  const X = cmul(ctrans(R), W);
  return many([outC(U, cls), outC(V, cls), outC(X, cls), outC(C, cls), outC(Sm, cls)], nargout);
}

// ------------------------------------------------------------- generalized Schur tools

/** Hessenberg-triangular reduction with Givens rotations: QH*A*Z = AA (Hessenberg), QH*B*Z = BB (triangular). */
function hessTri(A0, B0) {
  const n = A0.n; const A = toC(A0), B = toC(B0), QH = ceye(n), Z = ceye(n);
  const at = (M, i, j) => [M.re[i + j * n], M.im[i + j * n]];
  const zero = (M, i, j) => { M.re[i + j * n] = 0; M.im[i + j * n] = 0; };
  for (let j = 0; j < n - 1; j++) for (let i = n - 1; i > j; i--) {
    const [fr, fi] = at(B, i - 1, j), [gr, gi] = at(B, i, j);
    if (gr === 0 && gi === 0) continue;
    const R = rotg(fr, fi, gr, gi);
    rowRot(B, i - 1, i, R, j, n); rowRot(A, i - 1, i, R, 0, n); rowRot(QH, i - 1, i, R, 0, n); zero(B, i, j);
  }
  for (let j = 0; j < n - 2; j++) for (let i = n - 1; i >= j + 2; i--) {
    const [fr, fi] = at(A, i - 1, j), [gr, gi] = at(A, i, j);
    if (gr === 0 && gi === 0) continue;
    const R = rotg(fr, fi, gr, gi);
    rowRot(A, i - 1, i, R, j, n); rowRot(B, i - 1, i, R, i - 1, n); rowRot(QH, i - 1, i, R, 0, n); zero(A, i, j);
    const [vr, vi] = at(B, i, i), [ur, ui] = at(B, i, i - 1);
    const C = rotg(vr, vi, ur, ui);
    colRot(B, i - 1, i, C, 0, i + 1); colRot(A, i - 1, i, C, 0, n); colRot(Z, i - 1, i, C, 0, n); zero(B, i, i - 1);
  }
  return { A, B, QH, Z };
}
function qzhessFn(args, nargout) {
  if (args.length < 2) fail('qzhess:notEnoughInputs', 'Not enough input arguments.');
  const A = cmat(args[0], 'qzhess', 'A'), B = cmat(args[1], 'qzhess', 'B');
  if (A.m !== A.n || B.m !== B.n || A.n !== B.n) fail('qzhess:dimMismatch', 'A and B must be square matrices of the same size.');
  const cls = A.cls === 'single' || B.cls === 'single' ? 'single' : 'double';
  const r = hessTri(A, B);
  return many([outC(r.A, cls), outC(r.B, cls), outC(r.QH, cls), outC(r.Z, cls)], nargout);
}

/** Dense complex linear solve (Gaussian elimination, partial pivoting; tiny pivots perturbed). */
function smallSolve(N, Kr, Ki, br, bi) {
  let scale = 0; for (let q = 0; q < Kr.length; q++) scale = Math.max(scale, Math.hypot(Kr[q], Ki[q]));
  const tiny = EPS * (scale || 1);
  for (let c = 0; c < N; c++) {
    let piv = c, pv = -1; for (let r = c; r < N; r++) { const a = Math.hypot(Kr[r + c * N], Ki[r + c * N]); if (a > pv) { pv = a; piv = r; } }
    if (pv < tiny) { Kr[piv + c * N] = tiny; Ki[piv + c * N] = 0; }
    if (piv !== c) {
      for (let j = 0; j < N; j++) { const a = c + j * N, b = piv + j * N; [Kr[a], Kr[b]] = [Kr[b], Kr[a]]; [Ki[a], Ki[b]] = [Ki[b], Ki[a]]; }
      [br[c], br[piv]] = [br[piv], br[c]]; [bi[c], bi[piv]] = [bi[piv], bi[c]];
    }
    for (let r = c + 1; r < N; r++) {
      const [fr, fi] = cdiv(Kr[r + c * N], Ki[r + c * N], Kr[c + c * N], Ki[c + c * N]);
      if (fr === 0 && fi === 0) continue;
      for (let j = c; j < N; j++) { const [x, y] = cmulS(fr, fi, Kr[c + j * N], Ki[c + j * N]); Kr[r + j * N] -= x; Ki[r + j * N] -= y; }
      const [x, y] = cmulS(fr, fi, br[c], bi[c]); br[r] -= x; bi[r] -= y;
    }
  }
  const xr = new Float64Array(N), xi = new Float64Array(N);
  for (let r = N - 1; r >= 0; r--) {
    let sr = br[r], si = bi[r];
    for (let j = r + 1; j < N; j++) { const [x, y] = cmulS(Kr[r + j * N], Ki[r + j * N], xr[j], xi[j]); sr -= x; si -= y; }
    [xr[r], xi[r]] = cdiv(sr, si, Kr[r + r * N], Ki[r + r * N]);
  }
  return { xr, xi };
}
/**
 * Swaps the adjacent diagonal blocks (sizes n1 at k, n2 at k+n1) of the (quasi) triangular pencil (S, T)
 * in place: rows of S, T, QH are multiplied by Gl^H, columns of S, T, Z by Gr.
 */
function genSwap(S, T, QH, Z, k, n1, n2) {
  const n = S.m, s = n1 + n2, nn = n1 * n2, N = 2 * nn;
  const Kr = new Float64Array(N * N), Ki = new Float64Array(N * N), br = new Float64Array(N), bi = new Float64Array(N);
  [[S, 0], [T, nn]].forEach(([M, off]) => {
    const g = (i, j) => [M.re[i + j * n], M.im[i + j * n]];
    for (let c = 0; c < n2; c++) for (let r = 0; r < n1; r++) {
      const eq = off + r + c * n1; const [a, b] = g(k + r, k + n1 + c); br[eq] = -a; bi[eq] = -b;
      for (let l = 0; l < n1; l++) { const [x, y] = g(k + r, k + l); Kr[eq + (l + c * n1) * N] += x; Ki[eq + (l + c * n1) * N] += y; }
      for (let l = 0; l < n2; l++) { const [x, y] = g(k + n1 + l, k + n1 + c); const col = nn + r + l * n1; Kr[eq + col * N] -= x; Ki[eq + col * N] -= y; }
    }
  });
  const { xr, xi } = smallSolve(N, Kr, Ki, br, bi);
  const Xr = cm(s, n2), Xl = cm(s, n2);
  for (let c = 0; c < n2; c++) {
    for (let r = 0; r < n1; r++) { Xr.re[r + c * s] = xr[r + c * n1]; Xr.im[r + c * s] = xi[r + c * n1]; Xl.re[r + c * s] = xr[nn + r + c * n1]; Xl.im[r + c * s] = xi[nn + r + c * n1]; }
    Xr.re[n1 + c + c * s] = 1; Xl.re[n1 + c + c * s] = 1;
  }
  const Zr = qrQ(qrFactor(Xr), s), Zl = qrQ(qrFactor(Xl), s);
  const left = (M) => {
    const cols = M.n, mm = M.m;
    for (let j = 0; j < cols; j++) {
      const tr = new Float64Array(s), ti = new Float64Array(s);
      for (let a = 0; a < s; a++) { let sr = 0, si = 0; for (let i = 0; i < s; i++) { const qr = Zl.re[i + a * s], qi = -Zl.im[i + a * s]; const [x, y] = cmulS(qr, qi, M.re[k + i + j * mm], M.im[k + i + j * mm]); sr += x; si += y; } tr[a] = sr; ti[a] = si; }
      for (let a = 0; a < s; a++) { M.re[k + a + j * mm] = tr[a]; M.im[k + a + j * mm] = ti[a]; }
    }
  };
  const right = (M) => {
    const mm = M.m;
    for (let i = 0; i < mm; i++) {
      const tr = new Float64Array(s), ti = new Float64Array(s);
      for (let a = 0; a < s; a++) { let sr = 0, si = 0; for (let l = 0; l < s; l++) { const [x, y] = cmulS(M.re[i + (k + l) * mm], M.im[i + (k + l) * mm], Zr.re[l + a * s], Zr.im[l + a * s]); sr += x; si += y; } tr[a] = sr; ti[a] = si; }
      for (let a = 0; a < s; a++) { M.re[i + (k + a) * mm] = tr[a]; M.im[i + (k + a) * mm] = ti[a]; }
    }
  };
  left(S); left(T); left(QH); right(S); right(T); right(Z);
  for (let j = k; j < k + n2; j++) for (let i = k + n2; i < k + s; i++) { S.re[i + j * n] = 0; S.im[i + j * n] = 0; T.re[i + j * n] = 0; T.im[i + j * n] = 0; }
  for (const [b, size] of [[k, n2], [k + n2, n1]]) {
    if (size === 2) {
      const o = b + 1 + b * n;
      const G = rotg(T.re[o - 1], T.im[o - 1], T.re[o], T.im[o]);
      rowRot(S, b, b + 1, G, b, n); rowRot(T, b, b + 1, G, b, n); rowRot(QH, b, b + 1, G, 0, QH.n);
      T.re[o] = 0; T.im[o] = 0;
    } else if (b + 1 < k + s) { S.re[b + 1 + b * n] = 0; S.im[b + 1 + b * n] = 0; T.re[b + 1 + b * n] = 0; T.im[b + 1 + b * n] = 0; }
  }
}
function selectLabels(fn, selArg, ev, n) {
  const kw = optText(selArg);
  if (kw !== null) {
    const f = { lhp: (r) => r < 0, rhp: (r) => r > 0, udi: (r, i) => Math.hypot(r, i) < 1, udo: (r, i) => Math.hypot(r, i) > 1 }[kw];
    if (!f) fail(`${fn}:badKeyword`, "The keyword must be 'lhp', 'rhp', 'udi' or 'udo'.");
    return Array.from(ev.re, (r, i) => (f(r, ev.im ? ev.im[i] : 0) ? 1 : 0));
  }
  const s = dbl(selArg, fn, 'select').re;
  if (s.length !== n) fail(`${fn}:badSelect`, 'The selection vector must have one entry per eigenvalue.');
  return Array.from(s, (x) => (x ? 1 : 0));
}
function ordqzFn(args, nargout) {
  if (args.length < 5) fail('ordqz:notEnoughInputs', 'Not enough input arguments.');
  const S = cmat(args[0], 'ordqz', 'AA'), T = cmat(args[1], 'ordqz', 'BB'), QH = cmat(args[2], 'ordqz', 'Q'), Z = cmat(args[3], 'ordqz', 'Z');
  const n = S.n;
  if ([S, T, QH, Z].some((M) => M.m !== n || M.n !== n)) fail('ordqz:dimMismatch', 'AA, BB, Q and Z must be square matrices of the same size.');
  for (let j = 0; j < n; j++) for (let i = j + 1; i < n; i++) {
    if (T.re[i + j * n] !== 0 || T.im[i + j * n] !== 0) fail('ordqz:notTriangular', 'BB must be upper triangular.');
    if (i > j + 1 && (S.re[i + j * n] !== 0 || S.im[i + j * n] !== 0)) fail('ordqz:notQuasiTriangular', 'AA must be quasi upper triangular.');
  }
  const ev = extraB.ordeig([args[0], args[1]]);
  const labels = selectLabels('ordqz', args[4], ev, n);
  const bl = blocksOf(S, n);
  const lab = bl.map((b) => (b.size === 2 ? Math.max(labels[b.k], labels[b.k + 1]) : labels[b.k]));
  let ks = 0;
  for (let bi = 0; bi < bl.length; bi++) {
    if (!lab[bi]) continue;
    for (let j = bi; j > ks; j--) {
      const a = bl[j - 1], b = bl[j];
      genSwap(S, T, QH, Z, a.k, a.size, b.size);
      bl[j - 1] = { k: a.k, size: b.size }; bl[j] = { k: a.k + b.size, size: a.size };
      [lab[j - 1], lab[j]] = [lab[j], lab[j - 1]];
    }
    ks++;
  }
  const cls = [args[0], args[1]].some((v) => v.cls === 'single') ? 'single' : 'double';
  return many([outC(S, cls), outC(T, cls), outC(QH, cls), outC(Z, cls)], nargout);
}
function trexcFn(args, nargout) {
  if (args.length < 4) fail('trexc:notEnoughInputs', 'Not enough input arguments.');
  const U = cmat(args[0], 'trexc', 'U'), T = cmat(args[1], 'trexc', 'T');
  const n = T.n;
  if (T.m !== n || U.n !== n || U.m !== n) fail('trexc:dimMismatch', 'U and T must be square matrices of the same size.');
  const ifst = intArg(args[2], 'trexc', 'ifst') - 1, ilst = intArg(args[3], 'trexc', 'ilst') - 1;
  if (ifst < 0 || ifst >= n || ilst < 0 || ilst >= n) fail('trexc:badIndex', 'ifst and ilst must be between 1 and n.');
  const bl = blocksOf(T, n);
  const find = (r) => bl.findIndex((b) => r >= b.k && r < b.k + b.size);
  let bi = find(ifst); const bj = find(ilst);
  const swapAt = (j) => { const a = bl[j], b = bl[j + 1]; swapBlocks(T, U, n, a.k, a.size, b.size); bl[j] = { k: a.k, size: b.size }; bl[j + 1] = { k: a.k + b.size, size: a.size }; };
  while (bi < bj) { swapAt(bi); bi++; }
  while (bi > bj) { swapAt(bi - 1); bi--; }
  const cls = [args[0], args[1]].some((v) => v.cls === 'single') ? 'single' : 'double';
  return many([outC(U, cls), outC(T, cls)], nargout);
}

// ------------------------------------------------------------- builtins / help

export const builtins = {
  rotx: rotFn('x'),
  roty: rotFn('y'),
  rotz: rotFn('z'),
  givens: givensFn,
  housh: houshFn,
  mgorth: mgorthFn,
  krylov: krylovFn,
  chol2inv: chol2invFn,
  cholinv: cholinvFn,
  cholinsert: cholinsertFn,
  choldelete: choldeleteFn,
  cholshift: cholshiftFn,
  qrshift: qrshiftFn,
  luupdate: luupdateFn,
  commutation_matrix: commutationFn,
  duplication_matrix: duplicationFn,
  blkmm: blkmmFn,
  inverse(args, nargout, ctx) { return denseB.inv(args, nargout, ctx); },
  matrix_type: matrixTypeFn,
  svd_driver: svdDriverFn,
  normest1: normest1Fn,
  gsvd: gsvdFn,
  qzhess: qzhessFn,
  ordqz: ordqzFn,
  trexc: trexcFn,
};
void isOpt;

export const help = {
  rotx: H('Rotation matrix about the x axis (angle in degrees).', 'x 축 회전 행렬 (각도 단위: 도).', ['T = rotx(theta)']),
  roty: H('Rotation matrix about the y axis (angle in degrees).', 'y 축 회전 행렬 (각도 단위: 도).', ['T = roty(theta)']),
  rotz: H('Rotation matrix about the z axis (angle in degrees).', 'z 축 회전 행렬 (각도 단위: 도).', ['T = rotz(theta)']),
  givens: H("Givens rotation G = [c s; -s' c] with G*[x; y] = [*; 0].", "G*[x; y] = [*; 0] 이 되는 기븐스 회전 G = [c s; -s' c].", ['G = givens(x, y)', '[c, s] = givens(x, y)']),
  housh: H('Householder reflection vector that maps x onto a multiple of the j-th unit vector.', 'x 를 j 번째 단위 벡터의 배수로 보내는 하우스홀더 반사 벡터.', ['[housv, beta, zer] = housh(x, j, z)']),
  mgorth: H('One modified Gram-Schmidt step: orthogonalize x against the orthonormal columns of v.', '수정 그람-슈미트 한 단계: x 를 v 의 정규직교 열에 대해 직교화.', ['[y, h] = mgorth(x, v)']),
  krylov: H('Orthonormal basis of the block Krylov subspace [V, A*V, A^2*V, ...] and the projected matrix H = U\'*A*U.', "블록 크릴로프 부분공간 [V, A*V, A^2*V, ...] 의 정규직교 기저와 투영 행렬 H = U'*A*U.", ['[U, H, nu] = krylov(A, V, k)', '[U, H, nu] = krylov(A, V, k, eps1, pflg)']),
  chol2inv: H("Inverse of R'*R from an upper triangular Cholesky factor R.", "상삼각 촐레스키 인수 R 로부터 R'*R 의 역행렬.", ['Ainv = chol2inv(R)']),
  cholinv: H('Inverse of a symmetric (Hermitian) positive definite matrix via Cholesky.', '촐레스키 분해로 구한 대칭(에르미트) 양의 정부호 행렬의 역행렬.', ['Ainv = cholinv(A)']),
  cholinsert: H('Cholesky factor after inserting row/column j (A1(:,j) = A1(j,:)\' = x).', "j 번째 행/열 삽입 후의 촐레스키 인수 (A1(:,j) = A1(j,:)' = x).", ['R1 = cholinsert(R, j, x)', '[R1, info] = cholinsert(R, j, x)']),
  choldelete: H('Cholesky factor after deleting row and column j.', 'j 번째 행과 열을 삭제한 후의 촐레스키 인수.', ['R1 = choldelete(R, j)']),
  cholshift: H('Cholesky factor of A(p,p) after the cyclic shift that moves column i to position j.', '열 i 를 위치 j 로 옮기는 순환 이동 후 A(p,p) 의 촐레스키 인수.', ['R1 = cholshift(R, i, j)']),
  qrshift: H('QR factors of A(:,p) after the cyclic shift that moves column i to position j.', '열 i 를 위치 j 로 옮기는 순환 이동 후 A(:,p) 의 QR 인수.', ['[Q1, R1] = qrshift(Q, R, i, j)']),
  luupdate: H("LU factors of A + x*y.' from the factors of A (with pivoting when P is given).", "A 의 인수로부터 A + x*y.' 의 LU 인수 (P 가 있으면 피벗 사용).", ['[L1, U1] = luupdate(L, U, x, y)', '[L1, U1, P1] = luupdate(L, U, P, x, y)']),
  commutation_matrix: H("Commutation matrix K with K*vec(A) = vec(A.') for m-by-n A.", "m×n 행렬 A 에 대해 K*vec(A) = vec(A.') 인 교환 행렬 K.", ['K = commutation_matrix(m, n)', 'K = commutation_matrix(m)']),
  duplication_matrix: H('Duplication matrix D with D*vech(A) = vec(A) for symmetric A.', '대칭 행렬 A 에 대해 D*vech(A) = vec(A) 인 복제 행렬 D.', ['D = duplication_matrix(n)']),
  blkmm: H('Products of matrix blocks: C(:,:,i) = A(:,:,i) * B(:,:,i).', '행렬 블록의 곱: C(:,:,i) = A(:,:,i) * B(:,:,i).', ['C = blkmm(A, B)']),
  inverse: H('Inverse of a square matrix (same as inv).', '정방 행렬의 역행렬 (inv 와 같음).', ['X = inverse(A)', '[X, rcond] = inverse(A)']),
  matrix_type: H("Probe the matrix type ('Upper', 'Lower', 'Positive Definite', 'Banded', 'Diagonal', 'Full', ...) or tag it for the solver.", "행렬 유형 확인 ('Upper', 'Lower', 'Positive Definite', 'Banded', 'Diagonal', 'Full' 등) 또는 풀이용 유형 지정.", ['type = matrix_type(A)', "A = matrix_type(A, 'upper')", "A = matrix_type(A, 'permuted upper', perm)"]),
  svd_driver: H("Query or set the SVD driver name ('gesvd', 'gesdd' or 'gejsv').", "SVD 드라이버 이름 조회 또는 설정 ('gesvd', 'gesdd', 'gejsv').", ['val = svd_driver()', 'old = svd_driver(new)', "svd_driver(new, 'local')"]),
  normest1: H('Estimate of the 1-norm of a matrix (block Higham-Tisseur algorithm); A may be a function handle Afcn(flag, x).', "행렬 1-노름 추정 (블록 Higham-Tisseur 알고리즘); A 는 함수 핸들 Afcn(flag, x) 가능.", ['nest = normest1(A)', 'nest = normest1(A, t)', '[nest, v, w, iter] = normest1(A, t, x0, Afcn_args...)']),
  gsvd: H("Generalized singular value decomposition: A = U*C*X', B = V*S*X', C'*C + S'*S = I.", "일반화 특이값 분해: A = U*C*X', B = V*S*X', C'*C + S'*S = I.", ['sigma = gsvd(A, B)', '[U, V, X, C, S] = gsvd(A, B)', '[U, V, X, C, S] = gsvd(A, B, 0)']),
  qzhess: H('Hessenberg-triangular reduction of a matrix pencil: AA = Q*A*Z, BB = Q*B*Z.', '행렬 펜슬의 헤센베르크-삼각 축약: AA = Q*A*Z, BB = Q*B*Z.', ['[AA, BB, Q, Z] = qzhess(A, B)']),
  ordqz: H('Reorder a QZ factorization so that the selected eigenvalues come first.', '선택한 고유값이 앞에 오도록 QZ 분해 재정렬.', ['[AAS, BBS, QS, ZS] = ordqz(AA, BB, Q, Z, select)', "[AAS, BBS, QS, ZS] = ordqz(AA, BB, Q, Z, 'lhp')"]),
  trexc: H('Move a diagonal block of a Schur form from position ifst to ilst by adjacent swaps.', '슈어 형식의 대각 블록을 인접 교환으로 위치 ifst 에서 ilst 로 이동.', ['[US, TS] = trexc(U, T, ifst, ilst)']),
};
