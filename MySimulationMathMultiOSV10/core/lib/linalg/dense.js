// Dense linear algebra builtins: solving (mldivide, mrdivide, linsolve, ...),
// matrix powers and functions, factorizations (lu, qr, chol, ldl, eig, svd,
// schur, hess), norms and condition numbers, subspaces and vector products.
import {
  EPS, fail, warn, warnSingular, mat, out, outMat, scalar, lscalar, resultCls, optText, isOpt, scal,
  intArg, H, firstNonSingleton, isSparse, toTensor, tensor, isStruct, field, dbl, cdiv, csqrt, fmtRcond,
} from './util.js';
import {
  cm, toC, isRealM, ceye, cmul, ctrans, cadd, cscale, norm1, normInf, normFro, hasNonFinite, cexp, clog, cpow,
  isUpperTri, isLowerTri, isHermitian, isSymmetricT, luFactor, luSolve, triSolve, rcondLU, rcondTri, invNorm1Est,
  cholFactor, qrFactor, qrQ, qrRealDiag, lsqQR, svdEcon, completeBasis, eigSymReal, eigReal, hqr, hessReal, hessC,
  schurC, triEigvecs, normalizeCols, solveSquare, invC, expmC, sqrtmTri, logmTri, allZero, isUpperHess,
} from './kernels.js';
import { alongDim } from './fft-kernel.js';
import { isSparseV, sparseFromDense, spSolve } from './sparse.js';
import { isFuncHandle, isText, toStr } from '../../value.js';

// ---------------------------------------------------------------- conversion helpers

/** Value → complex kernel matrix + original class. */
function C(v, fn, what = 'Input') { const a = mat(v, fn, what); const c = toC(a); c.cls = a.cls; return c; }
/** Complex kernel matrix → Value. */
const V = (A, cls = 'double') => outMat(A.m, A.n, A.re, allZero(A.im) ? null : A.im, cls);
const Vreal = (A, cls = 'double') => outMat(A.m, A.n, A.re, null, cls);
function sqC(v, fn, what = 'Input') {
  const A = C(v, fn, what);
  if (A.m !== A.n) fail(`${fn}:notSquare`, `${what} must be a square matrix.`);
  return A;
}
const isScalarV = (v) => v && v.dims && v.dims.length === 2 && v.dims[0] * v.dims[1] === 1;
function diagM(re, im, m = re.length, n = re.length) {
  const D = cm(m, n);
  for (let i = 0; i < Math.min(m, n, re.length); i++) { D.re[i + i * m] = re[i]; if (im) D.im[i + i * m] = im[i]; }
  return D;
}
function colV(re, im, cls = 'double') { return out([re.length, 1], re, im && !allZero(im) ? im : null, cls); }
function maybeSparse(v, input) { return isSparse(input) ? sparseFromDense(v) : v; }
function noNaNInf(A, fn, label) {
  if (hasNonFinite(A)) fail(`${fn}:matrixWithNaNInf`, `Input to ${label} must not contain NaN or Inf.`);
}
function permMatrix(perm, rowsFromPerm = true) {
  const n = perm.length; const P = cm(n, n);
  for (let i = 0; i < n; i++) { if (rowsFromPerm) P.re[i + perm[i] * n] = 1; else P.re[perm[i] + i * n] = 1; }
  return P;
}
const oneBased = (perm) => out([1, perm.length], Float64Array.from(perm, (x) => x + 1));

// ---------------------------------------------------------------- solving

/** Solves A X = B (dense complex). Issues reference-style warnings. */
export function solveDense(A, B, ctx, { warnings = true, wantInfo = false } = {}) {
  const { m, n } = A;
  let X, rc = null, rank = null;
  if (m === 0 || n === 0 || B.n === 0) { X = cm(n, B.n); return wantInfo ? { X, rcond: Infinity, rank: 0 } : X; }
  if (m === n) {
    if (isUpperTri(A) || isLowerTri(A)) {
      const up = isUpperTri(A);
      X = triSolve(A, B, up);
      rc = rcondTri(A, up);
    } else {
      let done = false;
      if (isHermitian(A)) {
        let posDiag = true;
        for (let i = 0; i < n; i++) if (!(A.re[i * (n + 1)] > 0)) { posDiag = false; break; }
        if (posDiag) {
          const { R, p } = cholFactor(A);
          if (p === 0) {
            const solve = (b, t) => triSolve(R, triSolve(R, b, true, 'H'), true);
            X = solve(B);
            const an = norm1(A);
            rc = an === 0 ? 0 : 1 / (an * invNorm1Est(n, solve));
            done = true;
          }
        }
      }
      if (!done) {
        const F = luFactor(A);
        X = luSolve(F, B);
        rc = rcondLU(A, F);
      }
    }
    if (warnings && (rc === 0 || rc < EPS)) {
      if (!hasNonFinite(A)) warnSingular(ctx, rc);
    }
  } else {
    const r = lsqQR(A, B);
    X = r.X; rank = r.rank;
    if (warnings && rank < Math.min(m, n)) {
      warn(ctx, 'linalg:rankDeficientMatrix', `Rank deficient, rank = ${rank}, tol = ${fmtRcond(r.tol)}.`);
    }
  }
  return wantInfo ? { X, rcond: rc, rank } : X;
}

function elementDivide(Bv, a, ctx, leftScalarDiv = true) {
  // B ./ a (a: [re, im])
  const t = dbl(Bv, 'mldivide');
  const re = new Float64Array(t.re.length), im = new Float64Array(t.re.length);
  for (let i = 0; i < re.length; i++) {
    const [x, y] = cdiv(t.re[i], t.im ? t.im[i] : 0, a[0], a[1]); re[i] = x; im[i] = y;
  }
  void ctx; void leftScalarDiv;
  return { dims: t.dims, re, im };
}

function mldivideImpl(Av, Bv, ctx, fn = 'mldivide') {
  const cls = resultCls(Av, Bv);
  if (isScalarV(Av) && !isSparse(Av)) {
    const a = dbl(Av, fn);
    const r = elementDivide(Bv, [a.re[0], a.im ? a.im[0] : 0], ctx);
    return maybeSparse(out(r.dims, r.re, r.im, cls), Bv);
  }
  const am = Av.dims, bm = Bv.dims;
  if (am.length > 2 || bm.length > 2) fail(`${fn}:inputMustBe2D`, 'Arguments must be 2-D, or at least one argument must be scalar.');
  if (am[0] !== bm[0]) fail(`${fn}:dimagree`, 'Matrix dimensions must agree.');
  if (isSparse(Av)) return spSolve(Av, Bv, ctx);
  const A = C(Av, fn, 'A'), B = C(Bv, fn, 'B');
  return V(solveDense(A, B, ctx), cls);
}

function mrdivideImpl(Bv, Av, ctx) {
  // B / A = (A.' \ B.').'
  const cls = resultCls(Av, Bv);
  if (isScalarV(Av) && !isSparse(Av)) {
    const a = dbl(Av, 'mrdivide');
    const r = elementDivide(Bv, [a.re[0], a.im ? a.im[0] : 0], ctx);
    return maybeSparse(out(r.dims, r.re, r.im, cls), Bv);
  }
  if (Av.dims.length > 2 || Bv.dims.length > 2) fail('mrdivide:inputMustBe2D', 'Arguments must be 2-D, or at least one argument must be scalar.');
  if (Av.dims[1] !== Bv.dims[1]) fail('mrdivide:dimagree', 'Matrix dimensions must agree.');
  if (isSparse(Av)) {
    const At = sparseFromDense(V(ctrans(C(Av, 'mrdivide'), false)));
    const Bt = V(ctrans(C(Bv, 'mrdivide'), false));
    const X = spSolve(At, Bt, ctx);
    const Xt = V(ctrans(C(X, 'mrdivide'), false), cls);
    return isSparse(X) ? sparseFromDense(Xt) : Xt;
  }
  const A = ctrans(C(Av, 'mrdivide', 'A'), false), B = ctrans(C(Bv, 'mrdivide', 'B'), false);
  return V(ctrans(solveDense(A, B, ctx), false), cls);
}

// ---------------------------------------------------------------- eigen helpers

/** Full eigen-decomposition of a square complex matrix. Returns {wr, wi, V (complex) | null, herm}. */
export function eigFull(A, wantV = true) {
  const n = A.n;
  if (n === 0) return { wr: new Float64Array(0), wi: new Float64Array(0), V: cm(0, 0), herm: true };
  if (isHermitian(A)) {
    if (isRealM(A)) {
      const r = eigSymReal(A.re, n);
      return { wr: r.d, wi: new Float64Array(n), V: cm(n, n, r.V), herm: true };
    }
    const { T, Z } = schurC(A);
    const d = new Float64Array(n); for (let i = 0; i < n; i++) d[i] = T.re[i * (n + 1)];
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => d[a] - d[b]);
    const Vv = cm(n, n), dd = new Float64Array(n);
    order.forEach((j, k) => { dd[k] = d[j]; for (let i = 0; i < n; i++) { Vv.re[i + k * n] = Z.re[i + j * n]; Vv.im[i + k * n] = Z.im[i + j * n]; } });
    normalizeCols(Vv.re, Vv.im, n, n, true);
    return { wr: dd, wi: new Float64Array(n), V: Vv, herm: true };
  }
  if (isRealM(A)) {
    const r = eigReal(A.re, n, wantV);
    return { wr: r.wr, wi: r.wi, V: wantV ? cm(n, n, r.Vr, r.Vi) : null, herm: false };
  }
  const { T, Z } = schurC(A);
  const wr = new Float64Array(n), wi = new Float64Array(n);
  for (let i = 0; i < n; i++) { wr[i] = T.re[i * (n + 1)]; wi[i] = T.im[i * (n + 1)]; }
  return { wr, wi, V: wantV ? triEigvecs(T, Z) : null, herm: false };
}

/** Generalized eigenproblem A v = lambda B v. */
function eigGen(A, B, wantV, algo) {
  const n = A.n;
  if (isHermitian(A) && isHermitian(B) && algo !== 'qz') {
    const { R, p } = cholFactor(B);
    if (p === 0) {
      // C = R^-H A R^-1
      const Y = triSolve(R, A, true, 'H');           // R^-H A
      const Ct = triSolve(R, ctrans(Y), true, 'H');  // R^-H (R^-H A)^H = R^-H A^H R^-1 = C^H = C
      const Cm = ctrans(Ct);
      for (let j = 0; j < n; j++) for (let i = 0; i < j; i++) { // symmetrize
        const a = 0.5 * (Cm.re[i + j * n] + Cm.re[j + i * n]), b = 0.5 * (Cm.im[i + j * n] - Cm.im[j + i * n]);
        Cm.re[i + j * n] = a; Cm.re[j + i * n] = a; Cm.im[i + j * n] = b; Cm.im[j + i * n] = -b;
      }
      for (let i = 0; i < n; i++) Cm.im[i * (n + 1)] = 0;
      const e = eigFull(Cm, wantV);
      const res = { wr: e.wr, wi: e.wi, V: null, herm: true };
      if (wantV) res.V = triSolve(R, e.V, true); // B-normalized
      return res;
    }
  }
  const FB = luFactor(B);
  const rcB = rcondLU(B, FB);
  if (rcB > 1e3 * EPS) {
    const e = eigFull(luSolve(FB, A), wantV);
    if (e.V) normalizeCols(e.V.re, e.V.im, n, n, false);
    return e;
  }
  const FA = luFactor(A);
  const rcA = rcondLU(A, FA);
  if (rcA > 1e3 * EPS) {
    const e = eigFull(luSolve(FA, B), wantV);
    const wr = new Float64Array(n), wi = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.hypot(e.wr[i], e.wi[i]);
      if (a <= 1e3 * EPS * Math.max(1, norm1(B))) { wr[i] = Infinity; wi[i] = 0; } else { const [x, y] = cdiv(1, 0, e.wr[i], e.wi[i]); wr[i] = x; wi[i] = y; }
    }
    if (e.V) normalizeCols(e.V.re, e.V.im, n, n, false);
    return { wr, wi, V: e.V, herm: false };
  }
  return { wr: new Float64Array(n).fill(NaN), wi: new Float64Array(n), V: wantV ? cm(n, n, new Float64Array(n * n).fill(NaN)) : null, herm: false };
}

// ---------------------------------------------------------------- norms

function vecPNorm(re, im, p) {
  const n = re.length; if (n === 0) return 0;
  const abs = new Float64Array(n);
  for (let i = 0; i < n; i++) { abs[i] = im ? Math.hypot(re[i], im[i]) : Math.abs(re[i]); if (Number.isNaN(abs[i])) return NaN; }
  if (p === Infinity) { let m = 0; for (const a of abs) if (a > m) m = a; return m; }
  if (p === -Infinity) { let m = Infinity; for (const a of abs) if (a < m) m = a; return m; }
  if (p === 2) { let s = 0; for (const a of abs) s = Math.hypot(s, a); return s; }
  if (p === 1) { let s = 0; for (const a of abs) s += a; return s; }
  if (p === 0) { let c = 0; for (const a of abs) if (a !== 0) c++; return c === 0 ? 0 : Infinity; }
  let mx = 0; for (const a of abs) if (a > mx) mx = a;
  if (mx === 0 || !Number.isFinite(mx)) {
    if (mx === Infinity) return p > 0 ? Infinity : 0;
    if (p < 0) return 0;
    return 0;
  }
  let s = 0; for (const a of abs) s += Math.pow(a / mx, p);
  return mx * Math.pow(s, 1 / p);
}
function parseP(v, fn) {
  if (v == null) return 2;
  const t = optText(v);
  if (t != null) {
    if (t === 'fro') return 'fro';
    if (t === 'inf') return Infinity;
    if (t === '-inf') return -Infinity;
    fail(`${fn}:badOption`, `Unknown norm type '${t}'.`);
  }
  return scal(v, fn, 'p');
}
function matNorm(A, p, fn = 'norm') {
  if (A.m === 0 || A.n === 0) return 0;
  if (p === 'fro') return normFro(A);
  if (p === 1) return norm1(A);
  if (p === Infinity) return normInf(A);
  if (p === 2) { if (hasNonFinite(A)) { for (let i = 0; i < A.re.length; i++) if (Number.isNaN(A.re[i]) || Number.isNaN(A.im[i])) return NaN; return Infinity; } return svdEcon(A, false).s[0]; }
  fail(`${fn}:invalidP`, "Matrix norm type must be 1, 2, Inf or 'fro'.");
}

// ---------------------------------------------------------------- along-dimension helper

function dimArg(v, fn) { const d = intArg(v, fn, 'Dimension'); if (d < 1) fail(`${fn}:badDim`, 'Dimension must be a positive integer.'); return d - 1; }

// ---------------------------------------------------------------- builtins

export const builtins = {
  mldivide(args, nargout, ctx) {
    if (args.length < 2) fail('mldivide:notEnoughInputs', 'Not enough input arguments.');
    return mldivideImpl(args[0], args[1], ctx);
  },
  mrdivide(args, nargout, ctx) {
    if (args.length < 2) fail('mrdivide:notEnoughInputs', 'Not enough input arguments.');
    return mrdivideImpl(args[0], args[1], ctx);
  },
  mpower(args, nargout, ctx) {
    if (args.length < 2) fail('mpower:notEnoughInputs', 'Not enough input arguments.');
    const [Av, Pv] = args;
    const cls = resultCls(Av, Pv);
    const sA = isScalarV(Av), sP = isScalarV(Pv);
    if (sA && sP) {
      const a = dbl(Av, 'mpower'), p = dbl(Pv, 'mpower');
      const [r, i] = cpow(a.re[0], a.im ? a.im[0] : 0, p.re[0], p.im ? p.im[0] : 0);
      return out([1, 1], [r], i ? [i] : null, cls);
    }
    if (sP) {
      const A = sqC(Av, 'mpower', 'Base');
      const pr = dbl(Pv, 'mpower');
      const p = pr.re[0], pi = pr.im ? pr.im[0] : 0;
      const n = A.n;
      if (pi === 0 && Number.isInteger(p)) {
        let base = A, e = Math.abs(p);
        if (p < 0) { const r = invC(A); if (r.singular || r.rcond < EPS) warnSingular(ctx, r.singular ? 0 : r.rcond); base = r.X; }
        let R = ceye(n);
        while (e > 0) { if (e & 1) R = cmul(R, base); e = Math.floor(e / 2); if (e > 0) base = cmul(base, base); }
        return maybeSparse(V(R, cls), Av);
      }
      // non-integer power: A^p = V D^p V^-1
      const e = eigFull(A, true);
      const Dp = cm(n, n);
      for (let i = 0; i < n; i++) { const [x, y] = cpow(e.wr[i], e.wi[i], p, pi); Dp.re[i * (n + 1)] = x; Dp.im[i * (n + 1)] = y; }
      let R;
      if (e.herm) R = cmul(cmul(e.V, Dp), ctrans(e.V));
      else R = ctrans(solveDense(ctrans(e.V), ctrans(cmul(e.V, Dp)), ctx), true);
      return V(R, cls);
    }
    if (sA) {
      // s^A = V diag(s.^d) V^-1
      const P = sqC(Pv, 'mpower', 'Exponent'); const n = P.n;
      const a = dbl(Av, 'mpower'); const [lr, li] = clog(a.re[0], a.im ? a.im[0] : 0);
      return V(expmC(cscale(P, lr, li)), cls);
    }
    fail('mpower:notScalarAndSquareMatrix', 'Inputs must be a scalar and a square matrix. To compute elementwise POWER, use POWER (.^) instead.');
  },
  inv(args, nargout, ctx) {
    const A = sqC(args[0], 'inv', 'Matrix');
    const n = A.n;
    if (n === 0) return V(cm(0, 0), A.cls);
    const F = luFactor(A);
    if (F.info >= 0) {
      warnSingular(ctx, 0);
      return maybeSparse(V(cm(n, n, new Float64Array(n * n).fill(Infinity)), A.cls), args[0]);
    }
    const X = luSolve(F, ceye(n));
    const rc = rcondLU(A, F);
    if (rc < EPS && !hasNonFinite(A)) warnSingular(ctx, rc);
    return maybeSparse(V(X, A.cls), args[0]);
  },
  pinv(args) {
    const A = C(args[0], 'pinv'); const { m, n } = A;
    if (m === 0 || n === 0) return V(cm(n, m), A.cls);
    noNaNInf(A, 'pinv', 'SVD');
    const { U, s, V: Vm } = svdEcon(A);
    const tol = args.length > 1 ? scal(args[1], 'pinv', 'tol') : Math.max(m, n) * s[0] * EPS;
    const k = s.length; const X = cm(n, m);
    for (let r = 0; r < k; r++) {
      if (!(s[r] > tol)) continue;
      const inv = 1 / s[r];
      for (let j = 0; j < m; j++) {
        const ur = U.re[j + r * m] * inv, ui = -U.im[j + r * m] * inv; // conj(U)
        for (let i = 0; i < n; i++) {
          const vr = Vm.re[i + r * n], vi = Vm.im[i + r * n];
          X.re[i + j * n] += vr * ur - vi * ui; X.im[i + j * n] += vr * ui + vi * ur;
        }
      }
    }
    return V(X, A.cls);
  },
  det(args) {
    const A = sqC(args[0], 'det', 'Matrix');
    if (A.n === 0) return scalar(1, A.cls);
    const F = luFactor(A);
    let dr = F.sign, di = 0;
    for (let i = 0; i < A.n; i++) { const a = F.re[i * (A.n + 1)], b = F.im[i * (A.n + 1)]; const x = dr * a - di * b; di = dr * b + di * a; dr = x; }
    return out([1, 1], [dr], di ? [di] : null, A.cls);
  },
  rank(args) {
    const A = C(args[0], 'rank');
    if (A.m === 0 || A.n === 0) return scalar(0);
    noNaNInf(A, 'rank', 'SVD');
    const { s } = svdEcon(A, false);
    const tol = args.length > 1 ? scal(args[1], 'rank', 'tol') : Math.max(A.m, A.n) * EPS * s[0];
    let r = 0; for (const x of s) if (x > tol) r++;
    return scalar(r);
  },
  trace(args) {
    const A = C(args[0], 'trace');
    if (A.m !== A.n) fail('trace:square', 'Matrix must be square.');
    let sr = 0, si = 0; for (let i = 0; i < A.n; i++) { sr += A.re[i * (A.n + 1)]; si += A.im[i * (A.n + 1)]; }
    return out([1, 1], [sr], si ? [si] : null, A.cls);
  },
  norm(args) {
    const v = args[0];
    if (v == null) fail('norm:notEnoughInputs', 'Not enough input arguments.');
    const t = dbl(v, 'norm');
    const p = parseP(args[1], 'norm');
    const cls = resultCls(v);
    const isVec = t.dims.length === 2 && (t.dims[0] === 1 || t.dims[1] === 1);
    if (isVec) return scalar(vecPNorm(t.re, t.im, p === 'fro' ? 2 : p), cls);
    if (t.dims.length > 2) {
      if (p === 'fro' || p === 2 && args.length > 1 && false) return scalar(vecPNorm(t.re, t.im, 2), cls);
      fail('norm:inputMustBe2D', "Input must be 2-D (N-D arrays support only 'fro').");
    }
    return scalar(matNorm(C(v, 'norm'), p), cls);
  },
  cond(args, nargout, ctx) {
    const A = C(args[0], 'cond');
    const p = args.length > 1 ? parseP(args[1], 'cond') : 2;
    if (A.m === 0 || A.n === 0) return scalar(0);
    if (p === 2) {
      if (hasNonFinite(A)) return scalar(NaN);
      const { s } = svdEcon(A, false);
      const sm = s[s.length - 1];
      return scalar(sm === 0 ? Infinity : s[0] / sm);
    }
    if (A.m !== A.n) fail('cond:notSquare', 'A is rectangular. Use the 2-norm.');
    const F = luFactor(A);
    if (F.info >= 0) return scalar(Infinity);
    const Ai = luSolve(F, ceye(A.n));
    void ctx;
    return scalar(matNorm(A, p, 'cond') * matNorm(Ai, p, 'cond'));
  },
  rcond(args) {
    const A = sqC(args[0], 'rcond', 'Matrix');
    if (A.n === 0) return scalar(Infinity);
    if (hasNonFinite(A)) { for (let i = 0; i < A.re.length; i++) if (Number.isNaN(A.re[i]) || Number.isNaN(A.im[i])) return scalar(NaN); return scalar(0); }
    const F = luFactor(A);
    return scalar(rcondLU(A, F));
  },
  null(args) {
    const A = C(args[0], 'null'); const { m, n } = A;
    const o = optText(args[1]);
    if (o === 'r') {
      const { R, jb } = rrefCore(A, null);
      const free = []; for (let j = 0; j < n; j++) if (!jb.includes(j)) free.push(j);
      const Z = cm(n, free.length);
      free.forEach((f, k) => { Z.re[f + k * n] = 1; jb.forEach((p, i) => { Z.re[p + k * n] = -R.re[i + f * m]; Z.im[p + k * n] = -R.im[i + f * m]; }); });
      return V(Z, A.cls);
    }
    if (n === 0) return V(cm(0, 0), A.cls);
    if (m === 0) return V(ceye(n), A.cls);
    noNaNInf(A, 'null', 'SVD');
    const { s, V: Vm } = svdEcon(A);
    let Vf = Vm;
    if (Vm.n < n) Vf = completeBasis(Vm, Vm.n);
    const tol = args.length > 1 && !isOpt(args[1]) ? scal(args[1], 'null', 'tol') : Math.max(m, n) * (s[0] || 0) * EPS;
    let r = 0; for (const x of s) if (x > tol) r++;
    const Z = cm(n, n - r, Vf.re.slice(r * n), Vf.im.slice(r * n));
    return V(Z, A.cls);
  },
  orth(args) {
    const A = C(args[0], 'orth'); const { m, n } = A;
    if (m === 0 || n === 0) return V(cm(m, 0), A.cls);
    noNaNInf(A, 'orth', 'SVD');
    const { U, s } = svdEcon(A);
    const tol = args.length > 1 ? scal(args[1], 'orth', 'tol') : Math.max(m, n) * s[0] * EPS;
    let r = 0; for (const x of s) if (x > tol) r++;
    return V(cm(m, r, U.re.slice(0, m * r), U.im.slice(0, m * r)), A.cls);
  },
  rref(args, nargout) {
    const A = C(args[0], 'rref');
    const tol = args.length > 1 ? scal(args[1], 'rref', 'tol') : null;
    const { R, jb } = rrefCore(A, tol);
    const Rv = V(R, A.cls);
    return nargout > 1 ? [Rv, out([1, jb.length], Float64Array.from(jb, (x) => x + 1))] : Rv;
  },
  lu(args, nargout) {
    const A = C(args[0], 'lu'); const { m, n } = A; const k = Math.min(m, n);
    let vecOut = false;
    for (let i = 1; i < args.length; i++) { const o = optText(args[i]); if (o === 'vector') vecOut = true; else if (o === 'matrix' || o == null) { /* thresholds ignored */ } else fail('lu:badOption', `Unknown option '${o}'.`); }
    const F = luFactor(A);
    const sp = (v) => maybeSparse(v, args[0]);
    if (nargout <= 1) return sp(V(cm(m, n, F.re, F.im), A.cls));
    const L = cm(m, k), U = cm(k, n);
    for (let j = 0; j < k; j++) { L.re[j + j * m] = 1; for (let i = j + 1; i < m; i++) { L.re[i + j * m] = F.re[i + j * m]; L.im[i + j * m] = F.im[i + j * m]; } }
    for (let j = 0; j < n; j++) for (let i = 0; i <= Math.min(j, k - 1); i++) { U.re[i + j * k] = F.re[i + j * m]; U.im[i + j * k] = F.im[i + j * m]; }
    if (nargout === 2) {
      // L = P' * L
      const PL = cm(m, k);
      for (let j = 0; j < k; j++) for (let i = 0; i < m; i++) { PL.re[F.piv[i] + j * m] = L.re[i + j * m]; PL.im[F.piv[i] + j * m] = L.im[i + j * m]; }
      return [sp(V(PL, A.cls)), sp(V(U, A.cls))];
    }
    const P = vecOut ? oneBased(F.piv) : sp(V(permMatrix(F.piv, true)));
    const res = [sp(V(L, A.cls)), sp(V(U, A.cls)), P];
    if (nargout >= 4) res.push(vecOut ? out([1, n], Float64Array.from({ length: n }, (_, i) => i + 1)) : sp(V(ceye(n))));
    return res;
  },
  qr(args, nargout) {
    const A = C(args[0], 'qr'); const { m, n } = A;
    let econ = false, vecOut = null;
    for (let i = 1; i < args.length; i++) {
      const o = optText(args[i]);
      if (o === 'econ') econ = true;
      else if (o === 'vector') vecOut = true;
      else if (o === 'matrix') vecOut = false;
      else if (o == null && scal(args[i], 'qr') === 0) { econ = true; if (vecOut == null) vecOut = true; }
      else fail('qr:badOption', 'Use qr(A), qr(A, 0), qr(A, "econ"), qr(A, "vector") or qr(A, "matrix").');
    }
    const pivot = nargout >= 3;
    const F = qrFactor(A, pivot);
    const k = Math.min(m, n);
    const qcols = econ ? k : m, rrows = econ ? k : m;
    const R = cm(rrows, n);
    for (let j = 0; j < n; j++) for (let i = 0; i <= Math.min(j, rrows - 1); i++) { R.re[i + j * rrows] = F.R.re[i + j * m]; R.im[i + j * rrows] = F.R.im[i + j * m]; }
    if (nargout <= 1) { if (!isRealM(A)) qrRealDiag(null, R); return maybeSparse(V(R, A.cls), args[0]); }
    const Q = qrQ(F, qcols);
    if (!isRealM(A)) qrRealDiag(Q, R);
    const res = [V(Q, A.cls), maybeSparse(V(R, A.cls), args[0])];
    if (pivot) res.push((vecOut ?? false) ? oneBased(F.perm) : V(permMatrix(F.perm, false)));
    return res;
  },
  chol(args, nargout) {
    let lower = false;
    for (let i = 1; i < args.length; i++) { const o = optText(args[i]); if (o === 'lower') lower = true; else if (o === 'upper' || o === 'vector' || o === 'matrix') { /* ok */ } else fail('chol:badOption', `Unknown option '${o}'.`); }
    let A = sqC(args[0], 'chol', 'Matrix');
    if (lower) A = ctrans(A);
    const { R, p } = cholFactor(A);
    if (p > 0 && nargout < 2) fail('chol:notPositiveDefinite', 'Matrix must be positive definite.');
    let Rout = R;
    if (p > 0) { const q = p - 1; Rout = cm(q, q); for (let j = 0; j < q; j++) for (let i = 0; i <= j; i++) { Rout.re[i + j * q] = R.re[i + j * A.n]; Rout.im[i + j * q] = R.im[i + j * A.n]; } }
    if (lower) Rout = ctrans(Rout);
    const Rv = maybeSparse(V(Rout, A.cls), args[0]);
    if (nargout < 2) return Rv;
    const res = [Rv, scalar(p)];
    if (nargout >= 3) res.push(V(ceye(A.n)));
    return res;
  },
  ldl(args, nargout) {
    const A = sqC(args[0], 'ldl', 'Matrix');
    if (!isRealM(A)) fail('ldl:complexNotSupported', 'ldl supports real symmetric matrices only.');
    let vecOut = false;
    for (let i = 1; i < args.length; i++) { const o = optText(args[i]); if (o === 'vector') vecOut = true; else if (o === 'lower' || o === 'matrix') { /* ok */ } else if (o === 'upper') fail('ldl:upperNotSupported', "The 'upper' option is not supported."); }
    const { L, D, perm } = ldlBK(A.re, A.n);
    const n = A.n;
    if (nargout <= 1) {
      // packed: D on block diagonal, L strictly below
      const Y = Float64Array.from(L); for (let i = 0; i < n; i++) Y[i * (n + 1)] = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (D[i + j * n] !== 0 && Math.abs(i - j) <= 1) Y[i + j * n] = D[i + j * n];
      return outMat(n, n, Y);
    }
    if (nargout === 2) {
      const PL = new Float64Array(n * n);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) PL[perm[i] + j * n] = L[i + j * n];
      return [outMat(n, n, PL), outMat(n, n, D)];
    }
    const P = vecOut ? oneBased(perm) : V(permMatrix(perm, false));
    return [outMat(n, n, L), outMat(n, n, D), P];
  },
  eig(args, nargout) {
    let vecFmt = null, algo = null; const nums = [];
    for (const a of args) {
      const o = optText(a);
      if (o == null) nums.push(a);
      else if (o === 'vector') vecFmt = true; else if (o === 'matrix') vecFmt = false;
      else if (o === 'chol' || o === 'qz') algo = o;
      else if (o === 'balance' || o === 'nobalance') { /* accepted */ }
      else fail('eig:badOption', `Unknown option '${o}'.`);
    }
    if (!nums.length) fail('eig:notEnoughInputs', 'Not enough input arguments.');
    const A = sqC(nums[0], 'eig', 'Input matrix');
    noNaNInf(A, 'eig', 'EIG');
    const cls = A.cls; const n = A.n;
    const wantV = nargout >= 2;
    let e;
    if (nums.length > 1) {
      const B = sqC(nums[1], 'eig', 'B');
      if (B.n !== n) fail('eig:dimagree', 'Matrices A and B must be the same size.');
      noNaNInf(B, 'eig', 'EIG');
      e = eigGen(A, B, wantV, algo);
    } else e = eigFull(A, wantV);
    if (!wantV) {
      if (vecFmt === false) return V(diagM(e.wr, e.wi), cls);
      return colV(e.wr, e.wi, cls);
    }
    const D = vecFmt ? colV(e.wr, e.wi, cls) : V(diagM(e.wr, e.wi), cls);
    const res = [V(e.V, cls), D];
    if (nargout >= 3) {
      let W;
      if (e.herm && nums.length === 1) W = e.V;
      else { W = ctrans(invC(e.V).X); normalizeCols(W.re, W.im, n, n, false); }
      res.push(V(W, cls));
    }
    return res;
  },
  eigs(args, nargout) {
    if (!args.length) fail('eigs:notEnoughInputs', 'Not enough input arguments.');
    if (isFuncHandle(args[0])) fail('eigs:functionHandle', 'eigs with a function handle is not supported; pass the matrix.');
    const A = sqC(args[0], 'eigs', 'A'); const n = A.n;
    let idx = 1; let B = null;
    if (args[idx] && !isOpt(args[idx]) && args[idx].dims && args[idx].dims[0] === n && args[idx].dims[1] === n && n > 1) { B = sqC(args[idx], 'eigs', 'B'); idx++; }
    let k = Math.min(6, n);
    if (args[idx] && !isOpt(args[idx]) && !isStruct(args[idx])) { k = intArg(args[idx], 'eigs', 'k'); idx++; }
    let sigma = 'largestabs';
    if (args[idx] && !isStruct(args[idx])) {
      const o = optText(args[idx]);
      if (o != null) sigma = { lm: 'largestabs', sm: 'smallestabs', la: 'largestreal', sa: 'smallestreal', lr: 'largestreal', sr: 'smallestreal', li: 'largestimag', si: 'smallestimag', be: 'bothendsreal' }[o] || o;
      else sigma = dbl(args[idx], 'eigs');
      idx++;
    }
    if (k > n) k = n;
    const e = B ? eigGen(A, B, nargout >= 2, null) : eigFull(A, nargout >= 2);
    const ids = Array.from({ length: n }, (_, i) => i);
    let key;
    if (typeof sigma === 'string') {
      const absv = (i) => Math.hypot(e.wr[i], e.wi[i]);
      key = {
        largestabs: (i) => -absv(i), smallestabs: (i) => absv(i), largestreal: (i) => -e.wr[i], smallestreal: (i) => e.wr[i],
        largestimag: (i) => -Math.abs(e.wi[i]), smallestimag: (i) => Math.abs(e.wi[i]), bothendsreal: (i) => -e.wr[i],
      }[sigma];
      if (!key) fail('eigs:badSigma', `Unknown sigma '${sigma}'.`);
    } else {
      const sr = sigma.re[0], si = sigma.im ? sigma.im[0] : 0;
      key = (i) => Math.hypot(e.wr[i] - sr, e.wi[i] - si);
    }
    ids.sort((a, b) => key(a) - key(b) || a - b);
    let sel = ids.slice(0, k);
    if (sigma === 'bothendsreal') { const lo = Math.floor(k / 2); sel = ids.slice(0, k - lo).concat(ids.slice(n - lo).reverse()); }
    const wr = Float64Array.from(sel, (i) => e.wr[i]), wi = Float64Array.from(sel, (i) => e.wi[i]);
    if (nargout <= 1) return colV(wr, wi);
    const Vs = cm(n, k);
    sel.forEach((j, c) => { for (let i = 0; i < n; i++) { Vs.re[i + c * n] = e.V.re[i + j * n]; Vs.im[i + c * n] = e.V.im[i + j * n]; } });
    const res = [V(Vs), V(diagM(wr, wi))];
    if (nargout >= 3) res.push(scalar(0));
    return res;
  },
  svd(args, nargout) {
    const A = C(args[0], 'svd'); const { m, n } = A;
    let econ = false, zero = false, vecFmt = null;
    for (let i = 1; i < args.length; i++) {
      const o = optText(args[i]);
      if (o === 'econ') econ = true; else if (o === 'vector') vecFmt = true; else if (o === 'matrix') vecFmt = false;
      else if (o == null && scal(args[i], 'svd') === 0) zero = true;
      else fail('svd:badOption', 'Use svd(A), svd(A, "econ"), svd(A, 0), "vector" or "matrix".');
    }
    noNaNInf(A, 'svd', 'SVD');
    if (nargout <= 1) {
      const { s } = svdEcon(A, false);
      if (vecFmt === false) return Vreal(diagM(s, null, m, n), A.cls);
      return colV(s, null, A.cls);
    }
    const { U, s, V: Vm } = svdEcon(A);
    const k = Math.min(m, n);
    let Uo = U, Vo = Vm, Sm, Sn;
    if (econ || (zero && m > n)) { Sm = k; Sn = k; }
    else if (zero) { Uo = U.n < m ? completeBasis(U, U.n) : U; Vo = Vm.n < n ? completeBasis(Vm, Vm.n) : Vm; Sm = m; Sn = n; if (m < n) { Vo = Vm.n < n ? completeBasis(Vm, Vm.n) : Vm; } }
    else { Uo = U.n < m ? completeBasis(U, U.n) : U; Vo = Vm.n < n ? completeBasis(Vm, Vm.n) : Vm; Sm = m; Sn = n; }
    const S = vecFmt ? colV(s, null, A.cls) : Vreal(diagM(s, null, Sm, Sn), A.cls);
    return [V(Uo, A.cls), S, V(Vo, A.cls)];
  },
  svds(args, nargout) {
    const A = C(args[0], 'svds');
    let k = Math.min(6, A.m, A.n);
    if (args.length > 1 && !isOpt(args[1])) k = Math.min(intArg(args[1], 'svds', 'k'), A.m, A.n);
    let smallest = false;
    if (args.length > 2) { const o = optText(args[2]); if (o === 'smallest' || o === 'smallestnz') smallest = true; else if (o != null && o !== 'largest') fail('svds:badSigma', `Unknown sigma '${o}'.`); }
    const { U, s, V: Vm } = svdEcon(A);
    const idx = Array.from({ length: s.length }, (_, i) => i);
    const sel = smallest ? idx.slice(s.length - k).reverse() : idx.slice(0, k);
    const ss = Float64Array.from(sel, (i) => s[i]);
    if (nargout <= 1) return colV(ss, null);
    const pick = (M) => { const R = cm(M.m, k); sel.forEach((j, c) => { for (let i = 0; i < M.m; i++) { R.re[i + c * M.m] = M.re[i + j * M.m]; R.im[i + c * M.m] = M.im[i + j * M.m]; } }); return R; };
    const res = [V(pick(U)), Vreal(diagM(ss, null)), V(pick(Vm))];
    if (nargout >= 4) res.push(scalar(0));
    return res;
  },
  schur(args, nargout) {
    const A = sqC(args[0], 'schur', 'Input');
    noNaNInf(A, 'schur', 'SCHUR');
    const o = optText(args[1]);
    if (o != null && o !== 'real' && o !== 'complex') fail('schur:badOption', "The flag must be 'real' or 'complex'.");
    const n = A.n;
    let U, T;
    if (isRealM(A) && o !== 'complex') {
      if (n === 0) { U = cm(0, 0); T = cm(0, 0); } else { const r = hqr(A.re, n, { vectors: false, schur: true }); U = cm(n, n, r.U); T = cm(n, n, r.T); }
    } else {
      const r = schurC(A); U = r.Z; T = r.T;
    }
    if (nargout <= 1) return V(T, A.cls);
    return [V(U, A.cls), V(T, A.cls)];
  },
  rsf2csf(args) {
    const U = C(args[0], 'rsf2csf', 'U'), T = sqC(args[1], 'rsf2csf', 'T');
    const n = T.n;
    for (let m = n - 1; m >= 1; m--) {
      const sub = T.re[m + (m - 1) * n];
      if (sub === 0 && T.im[m + (m - 1) * n] === 0) continue;
      const a = T.re[m - 1 + (m - 1) * n], b = T.re[m - 1 + m * n], c = sub, d = T.re[m + m * n];
      const tr = (a + d) / 2, disc = ((a - d) / 2) ** 2 + b * c;
      const [sr, si] = csqrt(disc, 0);
      const mur = tr + sr - d, mui = si;
      const r = Math.hypot(mur, mui, c);
      const cr = mur / r, ci = mui / r, s = c / r;
      // G = [c' s; -s c]
      const g11r = cr, g11i = -ci, g12 = s, g21 = -s, g22r = cr, g22i = ci;
      for (let j = m - 1; j < n; j++) {
        const x1r = T.re[m - 1 + j * n], x1i = T.im[m - 1 + j * n], x2r = T.re[m + j * n], x2i = T.im[m + j * n];
        T.re[m - 1 + j * n] = g11r * x1r - g11i * x1i + g12 * x2r; T.im[m - 1 + j * n] = g11r * x1i + g11i * x1r + g12 * x2i;
        T.re[m + j * n] = g21 * x1r + g22r * x2r - g22i * x2i; T.im[m + j * n] = g21 * x1i + g22r * x2i + g22i * x2r;
      }
      // X * G' : G' = [c s'; -s c'] ... G' = conj transpose of G = [conj(g11) conj(g21); conj(g12) conj(g22)]
      const colOp = (M, rows) => {
        for (let i = 0; i < rows; i++) {
          const x1r = M.re[i + (m - 1) * n], x1i = M.im[i + (m - 1) * n], x2r = M.re[i + m * n], x2i = M.im[i + m * n];
          // new1 = x1*conj(g11) + x2*conj(g12); new2 = x1*conj(g21) + x2*conj(g22)
          M.re[i + (m - 1) * n] = x1r * g11r + x1i * g11i + x2r * g12; M.im[i + (m - 1) * n] = x1i * g11r - x1r * g11i + x2i * g12;
          M.re[i + m * n] = x1r * g21 + x2r * g22r + x2i * g22i; M.im[i + m * n] = x1i * g21 + x2i * g22r - x2r * g22i;
        }
      };
      colOp(T, m + 1); colOp(U, U.m);
      T.re[m + (m - 1) * n] = 0; T.im[m + (m - 1) * n] = 0;
    }
    return [V(U), V(T)];
  },
  hess(args, nargout) {
    const A = sqC(args[0], 'hess', 'Input'); const n = A.n;
    let P, Hm;
    if (isRealM(A)) { if (n === 0) { P = cm(0, 0); Hm = cm(0, 0); } else { const r = hessReal(A.re, n); P = cm(n, n, r.P); Hm = cm(n, n, r.H); } }
    else { const r = hessC(A); P = r.Q; Hm = r.H; }
    if (nargout <= 1) return V(Hm, A.cls);
    return [V(P, A.cls), V(Hm, A.cls)];
  },
  balance(args, nargout) {
    const A = sqC(args[0], 'balance', 'Input'); const n = A.n;
    const B = toC(A); const d = new Float64Array(n).fill(1);
    let converged = false, guard = 0;
    while (!converged && guard++ < 200) {
      converged = true;
      for (let i = 0; i < n; i++) {
        let c = 0, r = 0;
        for (let j = 0; j < n; j++) if (j !== i) { c += Math.hypot(B.re[j + i * n], B.im[j + i * n]); r += Math.hypot(B.re[i + j * n], B.im[i + j * n]); }
        if (c === 0 || r === 0) continue;
        let g = r / 2, f = 1; const s = c + r;
        while (c < g) { f *= 2; c *= 4; }
        g = r * 2;
        while (c > g) { f /= 2; c /= 4; }
        if ((c + r) / f < 0.95 * s) {
          converged = false; d[i] *= f;
          for (let j = 0; j < n; j++) { B.re[i + j * n] /= f; B.im[i + j * n] /= f; B.re[j + i * n] *= f; B.im[j + i * n] *= f; }
        }
      }
    }
    if (nargout <= 1) return V(B, A.cls);
    if (nargout === 2) return [Vreal(diagM(d, null)), V(B, A.cls)];
    return [colV(d, null), out([n, 1], Float64Array.from({ length: n }, (_, i) => i + 1)), V(B, A.cls)];
  },
  expm(args) {
    const A = sqC(args[0], 'expm', 'Input');
    const n = A.n;
    // diagonal shortcut
    let diag = true;
    for (let j = 0; j < n && diag; j++) for (let i = 0; i < n; i++) if (i !== j && (A.re[i + j * n] !== 0 || A.im[i + j * n] !== 0)) { diag = false; break; }
    if (diag) { const E = cm(n, n); for (let i = 0; i < n; i++) { const [x, y] = cexp(A.re[i * (n + 1)], A.im[i * (n + 1)]); E.re[i * (n + 1)] = x; E.im[i * (n + 1)] = y; } return V(E, A.cls); }
    if (hasNonFinite(A)) return V(cm(n, n, new Float64Array(n * n).fill(NaN)), A.cls);
    const E = expmC(A);
    return isRealM(A) ? Vreal(E, A.cls) : V(E, A.cls);
  },
  logm(args, nargout, ctx) {
    const A = sqC(args[0], 'logm', 'Input'); const n = A.n;
    if (n === 0) return nargout > 1 ? [V(cm(0, 0)), scalar(0)] : V(cm(0, 0));
    let L, bad = false;
    if (isHermitian(A)) {
      const e = eigFull(A, true);
      const D = cm(n, n);
      for (let i = 0; i < n; i++) { if (e.wr[i] <= 0) bad = true; const [x, y] = clog(e.wr[i], 0); D.re[i * (n + 1)] = x; D.im[i * (n + 1)] = y; }
      L = cmul(cmul(e.V, D), ctrans(e.V));
    } else {
      const { T, Z } = schurC(A);
      for (let i = 0; i < n; i++) { const a = T.re[i * (n + 1)], b = T.im[i * (n + 1)]; if (b === 0 && a <= 0) bad = true; if (Math.abs(b) <= 1e-14 * Math.abs(a) && a <= 0 && isRealM(A)) bad = true; }
      L = cmul(cmul(Z, logmTri(T)), ctrans(Z));
    }
    if (bad) warn(ctx, 'linalg:logm:nonPosRealEig', 'Principal matrix logarithm is not defined for A with nonpositive real eigenvalues. A non-principal matrix logarithm is returned.');
    const Lv = isRealM(A) && !bad ? Vreal(L, A.cls) : V(L, A.cls);
    return nargout > 1 ? [Lv, scalar(0)] : Lv;
  },
  sqrtm(args, nargout, ctx) {
    const A = sqC(args[0], 'sqrtm', 'Input'); const n = A.n;
    if (n === 0) return V(cm(0, 0));
    let X, singular = false, negReal = false;
    if (isHermitian(A)) {
      const e = eigFull(A, true); const D = cm(n, n);
      const tol = n * EPS * Math.max(...Array.from(e.wr, Math.abs));
      for (let i = 0; i < n; i++) { if (Math.abs(e.wr[i]) <= tol) singular = true; if (e.wr[i] < 0) negReal = true; const [x, y] = csqrt(e.wr[i], 0); D.re[i * (n + 1)] = x; D.im[i * (n + 1)] = y; }
      X = cmul(cmul(e.V, D), ctrans(e.V));
    } else {
      const { T, Z } = schurC(A);
      for (let i = 0; i < n; i++) { const a = T.re[i * (n + 1)], b = T.im[i * (n + 1)]; if (a < 0 && Math.abs(b) <= 1e-14 * Math.abs(a)) negReal = true; }
      const r = sqrtmTri(T); singular = r.singular;
      X = cmul(cmul(Z, r.R), ctrans(Z));
    }
    if (singular) warn(ctx, 'linalg:sqrtm:SingularMatrix', 'Matrix is singular and may not have a square root.');
    const Xv = isRealM(A) && !negReal ? Vreal(X, A.cls) : V(X, A.cls);
    if (nargout > 1) {
      const Xc = isRealM(A) && !negReal ? cm(n, n, X.re) : X;
      const Rr = cadd(cmul(Xc, Xc), A, -1);
      const na = normFro(A);
      return [Xv, scalar(na === 0 ? 0 : normFro(Rr) / na)];
    }
    return Xv;
  },
  funm(args, nargout, ctx) {
    const A = sqC(args[0], 'funm', 'Input'); const n = A.n;
    const f = args[1];
    if (f == null) fail('funm:notEnoughInputs', 'Not enough input arguments.');
    const name = isText(f) ? toStr(f) : isFuncHandle(f) && f.name ? f.name : null;
    if (name === 'exp') return builtins.expm([args[0]], 1, ctx);
    if (name === 'log') return builtins.logm([args[0]], 1, ctx);
    if (name === 'sqrt') return builtins.sqrtm([args[0]], 1, ctx);
    const fn = isText(f) ? toStr(f) : f;
    const apply = (re, im) => {
      const v = out([re.length, 1], re, im && !allZero(im) ? im : null);
      const r = ctx.call(fn, [v], 1)[0];
      const t = dbl(r, 'funm');
      if (t.re.length !== re.length) fail('funm:badFunction', 'The function must return an array of the same size as its input.');
      return { re: t.re, im: t.im || new Float64Array(re.length) };
    };
    if (n === 0) return V(cm(0, 0));
    let F;
    if (isHermitian(A)) {
      const e = eigFull(A, true); const fv = apply(e.wr, null);
      F = cmul(cmul(e.V, diagM(fv.re, fv.im)), ctrans(e.V));
    } else {
      const { T, Z } = schurC(A);
      const dre = new Float64Array(n), dim = new Float64Array(n);
      for (let i = 0; i < n; i++) { dre[i] = T.re[i * (n + 1)]; dim[i] = T.im[i * (n + 1)]; }
      let minGap = Infinity;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) minGap = Math.min(minGap, Math.hypot(dre[i] - dre[j], dim[i] - dim[j]));
      const scale = Math.max(1, normFro(T));
      if (minGap > 1e-6 * scale) {
        const fv = apply(dre, dim);
        const Fm = cm(n, n);
        for (let i = 0; i < n; i++) { Fm.re[i * (n + 1)] = fv.re[i]; Fm.im[i * (n + 1)] = fv.im[i]; }
        for (let p = 1; p < n; p++) {
          for (let i = 0; i + p < n; i++) {
            const j = i + p;
            // F_ij = T_ij (F_jj - F_ii)/(T_jj - T_ii) + sum_{k=i+1}^{j-1} (F_ik T_kj - T_ik F_kj)/(T_jj - T_ii)
            let sr = T.re[i + j * n] * (Fm.re[j + j * n] - Fm.re[i + i * n]) - T.im[i + j * n] * (Fm.im[j + j * n] - Fm.im[i + i * n]);
            let si = T.re[i + j * n] * (Fm.im[j + j * n] - Fm.im[i + i * n]) + T.im[i + j * n] * (Fm.re[j + j * n] - Fm.re[i + i * n]);
            for (let k = i + 1; k < j; k++) {
              sr += Fm.re[i + k * n] * T.re[k + j * n] - Fm.im[i + k * n] * T.im[k + j * n] - (T.re[i + k * n] * Fm.re[k + j * n] - T.im[i + k * n] * Fm.im[k + j * n]);
              si += Fm.re[i + k * n] * T.im[k + j * n] + Fm.im[i + k * n] * T.re[k + j * n] - (T.re[i + k * n] * Fm.im[k + j * n] + T.im[i + k * n] * Fm.re[k + j * n]);
            }
            const [qr, qi] = cdiv(sr, si, T.re[j + j * n] - T.re[i + i * n], T.im[j + j * n] - T.im[i + i * n]);
            Fm.re[i + j * n] = qr; Fm.im[i + j * n] = qi;
          }
        }
        F = cmul(cmul(Z, Fm), ctrans(Z));
      } else {
        const e = eigFull(A, true); const fv = apply(e.wr, e.wi);
        F = ctrans(solveDense(ctrans(e.V), ctrans(cmul(e.V, diagM(fv.re, fv.im))), ctx, { warnings: false }));
      }
    }
    if (isRealM(A)) {
      let mi = 0; for (const x of F.im) mi = Math.max(mi, Math.abs(x));
      if (mi <= 1e3 * EPS * Math.max(1, normFro(F))) return Vreal(F, A.cls);
    }
    return V(F, A.cls);
  },
  kron(args) {
    if (args.length < 2) fail('kron:notEnoughInputs', 'Not enough input arguments.');
    const A = C(args[0], 'kron', 'A'), B = C(args[1], 'kron', 'B');
    const m = A.m * B.m, n = A.n * B.n; const K = cm(m, n);
    for (let ja = 0; ja < A.n; ja++) for (let ia = 0; ia < A.m; ia++) {
      const ar = A.re[ia + ja * A.m], ai = A.im[ia + ja * A.m];
      if (ar === 0 && ai === 0) continue;
      for (let jb = 0; jb < B.n; jb++) for (let ib = 0; ib < B.m; ib++) {
        const br = B.re[ib + jb * B.m], bi = B.im[ib + jb * B.m];
        const o = ia * B.m + ib + (ja * B.n + jb) * m;
        K.re[o] = ar * br - ai * bi; K.im[o] = ar * bi + ai * br;
      }
    }
    const r = V(K, resultCls(args[0], args[1]));
    return isSparse(args[0]) || isSparse(args[1]) ? sparseFromDense(r) : r;
  },
  vecnorm(args) {
    const a = dbl(args[0], 'vecnorm');
    const p = args.length > 1 ? parseP(args[1], 'vecnorm') : 2;
    if (p === 'fro') fail('vecnorm:badP', 'p must be a positive scalar or Inf.');
    if (!(p > 0)) fail('vecnorm:badP', 'p must be a positive scalar or Inf.');
    const dim = args.length > 2 ? dimArg(args[2], 'vecnorm') : firstNonSingleton(a.dims);
    const R = alongDim(a.dims, a.re, a.im, dim, 1, (lr, li, yr) => { yr[0] = vecPNorm(lr, li, p); });
    return out(R.dims, R.re, null, resultCls(args[0]));
  },
  normest(args, nargout) {
    const A = C(args[0], 'normest');
    const tol = args.length > 1 ? scal(args[1], 'normest', 'tol') : 1e-6;
    const { m, n } = A;
    let x = cm(n, 1);
    for (let j = 0; j < n; j++) { let s = 0; for (let i = 0; i < m; i++) s += Math.hypot(A.re[i + j * m], A.im[i + j * m]); x.re[j] = s; }
    let e = normFro(x), cnt = 0;
    if (e === 0) return nargout > 1 ? [scalar(0), scalar(0)] : scalar(0);
    x = cscale(x, 1 / e);
    let e0 = 0;
    const AH = ctrans(A);
    while (Math.abs(e - e0) > tol * e && cnt < 100) {
      e0 = e;
      const Ax = cmul(A, x);
      const nAx = normFro(Ax);
      x = cmul(AH, Ax);
      const nx = normFro(x);
      e = nx / (nAx || 1);
      if (nx === 0) break;
      x = cscale(x, 1 / nx);
      cnt++;
    }
    return nargout > 1 ? [scalar(e), scalar(cnt)] : scalar(e);
  },
  linsolve(args, nargout, ctx) {
    if (args.length < 2) fail('linsolve:notEnoughInputs', 'Not enough input arguments.');
    let A = C(args[0], 'linsolve', 'A'); const B = C(args[1], 'linsolve', 'B');
    const opts = args[2];
    const fl = (k) => { const v = opts ? field(opts, k) : undefined; return v ? !!(v.re && v.re[0]) : false; };
    if (opts && !isStruct(opts)) fail('linsolve:badOpts', 'opts must be a structure.');
    const LT = fl('LT'), UT = fl('UT'), TR = fl('TRANSA'), SYM = fl('SYM'), PD = fl('POSDEF'), RECT = fl('RECT');
    const cls = resultCls(args[0], args[1]);
    const rows = TR ? A.n : A.m;
    if (rows !== B.m) fail('linsolve:dimagree', 'Matrix dimensions must agree.');
    let X, r;
    if (LT || UT) {
      if (A.m !== A.n) fail('linsolve:notSquare', 'Triangular matrices must be square.');
      X = triSolve(A, B, UT, TR ? 'H' : '');
      r = rcondTri(A, UT);
    } else if (SYM && PD && A.m === A.n) {
      const { R, p } = cholFactor(A);
      if (p > 0) fail('linsolve:notPositiveDefinite', 'Matrix must be positive definite.');
      const solve = (b) => triSolve(R, triSolve(R, b, true, 'H'), true);
      X = solve(B);
      r = 1 / (norm1(A) * invNorm1Est(A.n, solve));
    } else {
      if (TR) A = ctrans(A);
      if (A.m === A.n && !RECT) {
        const F = luFactor(A); X = luSolve(F, B); r = rcondLU(A, F);
      } else {
        const q = lsqQR(A, B); X = q.X; r = q.rank;
        if (nargout < 2 && q.rank < Math.min(A.m, A.n)) warn(ctx, 'linalg:rankDeficientMatrix', `Rank deficient, rank = ${q.rank}, tol = ${fmtRcond(q.tol)}.`);
        return nargout > 1 ? [V(X, cls), scalar(r)] : V(X, cls);
      }
    }
    if (nargout < 2 && (r === 0 || r < EPS)) warnSingular(ctx, r);
    return nargout > 1 ? [V(X, cls), scalar(r)] : V(X, cls);
  },
  lsqminnorm(args) {
    const A = C(args[0], 'lsqminnorm', 'A'), B = C(args[1], 'lsqminnorm', 'B');
    if (A.m !== B.m) fail('lsqminnorm:dimagree', 'Matrix dimensions must agree.');
    const { m, n } = A;
    if (m === 0 || n === 0) return V(cm(n, B.n));
    const { U, s, V: Vm } = svdEcon(A);
    const tol = args.length > 2 && !isOpt(args[2]) ? scal(args[2], 'lsqminnorm', 'tol') : Math.max(m, n) * EPS * s[0];
    let r = 0; for (const x of s) if (x > tol) r++;
    const Ur = cm(m, r, U.re.slice(0, m * r), U.im.slice(0, m * r));
    const Y = cmul(ctrans(Ur), B);
    for (let i = 0; i < r; i++) for (let j = 0; j < Y.n; j++) { Y.re[i + j * r] /= s[i]; Y.im[i + j * r] /= s[i]; }
    const Vr = cm(n, r, Vm.re.slice(0, n * r), Vm.im.slice(0, n * r));
    return V(cmul(Vr, Y), resultCls(args[0], args[1]));
  },
  lscov(args, nargout, ctx) {
    const A = C(args[0], 'lscov', 'A'), b = C(args[1], 'lscov', 'B');
    const { m, n } = A;
    if (b.m !== m) fail('lscov:dimagree', 'A and B must have the same number of rows.');
    let Aw = A, bw = b;
    if (args.length > 2) {
      const w = C(args[2], 'lscov', 'W');
      if (w.m === m && w.n === m && m > 1) {
        const { R, p } = cholFactor(w);
        if (p > 0) fail('lscov:notPositiveDefinite', 'The covariance matrix must be positive definite.');
        Aw = triSolve(R, A, true, 'H'); bw = triSolve(R, b, true, 'H');
      } else {
        if (w.re.length !== m) fail('lscov:badWeights', 'W must be a vector of length size(A,1) or an m-by-m matrix.');
        Aw = toC(A); bw = toC(b);
        for (let i = 0; i < m; i++) {
          if (w.re[i] < 0) fail('lscov:negativeWeights', 'Weights must be nonnegative.');
          const s = Math.sqrt(w.re[i]);
          for (let j = 0; j < n; j++) { Aw.re[i + j * m] *= s; Aw.im[i + j * m] *= s; }
          for (let j = 0; j < b.n; j++) { bw.re[i + j * m] *= s; bw.im[i + j * m] *= s; }
        }
      }
    }
    const q = lsqQR(Aw, bw);
    if (q.rank < n) warn(ctx, 'linalg:lscov:RankDefDesignMat', 'A is rank deficient to within machine precision.');
    const x = q.X;
    if (nargout <= 1) return V(x);
    const res = cadd(cmul(Aw, x), bw, -1);
    const dof = Math.max(m - q.rank, 0);
    const mse = new Float64Array(b.n);
    for (let j = 0; j < b.n; j++) { let s = 0; for (let i = 0; i < m; i++) s += res.re[i + j * m] ** 2 + res.im[i + j * m] ** 2; mse[j] = dof > 0 ? s / dof : 0; }
    const AtA = cmul(ctrans(Aw), Aw);
    const Ci = invC(AtA).X;
    const stdx = cm(n, b.n);
    for (let j = 0; j < b.n; j++) for (let i = 0; i < n; i++) stdx.re[i + j * n] = Math.sqrt(Math.max(0, Ci.re[i * (n + 1)] * mse[j]));
    const outs = [V(x), Vreal(stdx), out([1, b.n], mse)];
    if (nargout >= 4) outs.push(V(cscale(Ci, mse[0])));
    return outs;
  },
  sylvester(args) {
    if (args.length < 3) fail('sylvester:notEnoughInputs', 'Not enough input arguments.');
    const A = sqC(args[0], 'sylvester', 'A'), B = sqC(args[1], 'sylvester', 'B'), Cc = C(args[2], 'sylvester', 'C');
    if (Cc.m !== A.n || Cc.n !== B.n) fail('sylvester:dimagree', 'C must be size(A,1)-by-size(B,1).');
    const X = sylvesterC(A, B, Cc);
    return isRealM(A) && isRealM(B) && isRealM(Cc) ? Vreal(X) : V(X);
  },
  subspace(args) {
    let A = orthC(C(args[0], 'subspace', 'A')), B = orthC(C(args[1], 'subspace', 'B'));
    if (A.m !== B.m) fail('subspace:dimagree', 'A and B must have the same number of rows.');
    if (A.n < B.n) { const t = A; A = B; B = t; }
    for (let k = 0; k < A.n; k++) {
      const a = cm(A.m, 1, A.re.slice(k * A.m, (k + 1) * A.m), A.im.slice(k * A.m, (k + 1) * A.m));
      B = cadd(B, cmul(a, cmul(ctrans(a), B)), -1);
    }
    const nb = B.n === 0 ? 0 : svdEcon(B, false).s[0];
    return scalar(Math.asin(Math.min(1, nb)));
  },
  condeig(args, nargout) {
    const A = sqC(args[0], 'condeig', 'A'); const n = A.n;
    const e = eigFull(A, true);
    const W = ctrans(invC(e.V).X); normalizeCols(W.re, W.im, n, n, false);
    const s = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      let dr = 0, di = 0, nv = 0;
      for (let i = 0; i < n; i++) { const wr = W.re[i + j * n], wi = -W.im[i + j * n], vr = e.V.re[i + j * n], vi = e.V.im[i + j * n]; dr += wr * vr - wi * vi; di += wr * vi + wi * vr; nv = Math.hypot(nv, vr, vi); }
      s[j] = nv / Math.hypot(dr, di);
    }
    if (nargout <= 1) return colV(s, null);
    return [V(e.V), V(diagM(e.wr, e.wi)), colV(s, null)];
  },
  cdf2rdf(args) {
    const Vc = sqC(args[0], 'cdf2rdf', 'V'), D = sqC(args[1], 'cdf2rdf', 'D'); const n = D.n;
    const Vr = cm(n, n), Dr = cm(n, n);
    for (let j = 0; j < n; j++) {
      const lr = D.re[j * (n + 1)], li = D.im[j * (n + 1)];
      if (li !== 0 && j + 1 < n) {
        for (let i = 0; i < n; i++) { Vr.re[i + j * n] = Vc.re[i + j * n]; Vr.re[i + (j + 1) * n] = Vc.im[i + j * n]; }
        Dr.re[j * (n + 1)] = lr; Dr.re[(j + 1) * (n + 1)] = lr; Dr.re[j + (j + 1) * n] = li; Dr.re[j + 1 + j * n] = -li;
        j++;
      } else { for (let i = 0; i < n; i++) Vr.re[i + j * n] = Vc.re[i + j * n]; Dr.re[j * (n + 1)] = lr; }
    }
    return [Vreal(Vr), Vreal(Dr)];
  },
  cholupdate(args, nargout) {
    const R = sqC(args[0], 'cholupdate', 'R'), x = C(args[1], 'cholupdate', 'x');
    const op = optText(args[2]) || '+';
    if (x.re.length !== R.n) fail('cholupdate:dimagree', 'x must be a vector of length size(R,1).');
    const xc = cm(R.n, 1, x.re, x.im);
    const RtR = cmul(ctrans(R), R);
    const upd = cmul(xc, ctrans(xc));
    const M = cadd(RtR, upd, op === '-' ? -1 : 1);
    const { R: R1, p } = cholFactor(M);
    if (p > 0) {
      if (nargout < 2) fail('cholupdate:notPositiveDefinite', 'Downdated matrix must be positive definite.');
      return [V(R), scalar(1)];
    }
    return nargout > 1 ? [V(R1), scalar(0)] : V(R1);
  },
  planerot(args, nargout) {
    const x = dbl(args[0], 'planerot');
    if (x.re.length !== 2) fail('planerot:badInput', 'Input must be a 2-element vector.');
    const a = x.re[0], b = x.re[1];
    const r = Math.hypot(a, b);
    const G = r === 0 ? [1, 0, 0, 1] : [a / r, -b / r, b / r, a / r];
    const Gv = outMat(2, 2, G);
    return nargout > 1 ? [Gv, out([2, 1], [r, 0])] : Gv;
  },
  issymmetric(args) {
    const A = C(args[0], 'issymmetric');
    if (A.m !== A.n) return lscalar(false);
    const o = optText(args[1]);
    if (o === 'skew') { for (let j = 0; j < A.n; j++) for (let i = j; i < A.n; i++) if (A.re[i + j * A.n] !== -A.re[j + i * A.n] || A.im[i + j * A.n] !== -A.im[j + i * A.n]) return lscalar(false); return lscalar(true); }
    if (args[1] != null && o == null) return lscalar(withinTol(A, ctrans(A, false), scal(args[1], 'issymmetric', 'tol')));
    return lscalar(isSymmetricT(A));
  },
  ishermitian(args) {
    const A = C(args[0], 'ishermitian');
    if (A.m !== A.n) return lscalar(false);
    const o = optText(args[1]);
    if (o === 'skew') return lscalar(isHermitian(A, true));
    if (args[1] != null && o == null) return lscalar(withinTol(A, ctrans(A), scal(args[1], 'ishermitian', 'tol')));
    return lscalar(isHermitian(A));
  },
  istriu(args) { const A = C(args[0], 'istriu'); return lscalar(isUpperTri(A)); },
  istril(args) { const A = C(args[0], 'istril'); return lscalar(isLowerTri(A)); },
  isdiag(args) { const A = C(args[0], 'isdiag'); return lscalar(isUpperTri(A) && isLowerTri(A)); },
  isbanded(args) {
    const A = C(args[0], 'isbanded');
    const lo = scal(args[1], 'isbanded', 'lower'), up = scal(args[2], 'isbanded', 'upper');
    const [bl, bu] = bandwidthC(A);
    return lscalar(bl <= lo && bu <= up);
  },
  bandwidth(args, nargout) {
    const A = C(args[0], 'bandwidth');
    const [lo, up] = bandwidthC(A);
    const o = optText(args[1]);
    if (o === 'lower') return scalar(lo);
    if (o === 'upper') return scalar(up);
    return nargout > 1 ? [scalar(lo), scalar(up)] : scalar(lo);
  },
};

function withinTol(A, B, tol) {
  const d = normInf(cadd(A, B, -1)), a = normInf(A);
  return d <= tol * a || d === 0;
}
function bandwidthC(A) {
  let lo = 0, up = 0;
  for (let j = 0; j < A.n; j++) for (let i = 0; i < A.m; i++) if (A.re[i + j * A.m] !== 0 || A.im[i + j * A.m] !== 0) { if (i - j > lo) lo = i - j; if (j - i > up) up = j - i; }
  return [lo, up];
}
void isUpperHess;

function orthC(A) {
  if (A.m === 0 || A.n === 0) return cm(A.m, 0);
  const { U, s } = svdEcon(A);
  const tol = Math.max(A.m, A.n) * s[0] * EPS;
  let r = 0; for (const x of s) if (x > tol) r++;
  return cm(A.m, r, U.re.slice(0, A.m * r), U.im.slice(0, A.m * r));
}

/** Solves A X + X B = C by complex Schur decompositions (Bartels-Stewart). */
export function sylvesterC(A, B, Cc) {
  const m = A.n, n = B.n;
  const sa = schurC(A), sb = schurC(B);
  const F = cmul(cmul(ctrans(sa.Z), Cc), sb.Z);
  const Y = cm(m, n);
  const Ta = sa.T, Tb = sb.T;
  for (let k = 0; k < n; k++) {
    const rhs = cm(m, 1);
    for (let i = 0; i < m; i++) { rhs.re[i] = F.re[i + k * m]; rhs.im[i] = F.im[i + k * m]; }
    for (let j = 0; j < k; j++) {
      const br = Tb.re[j + k * n], bi = Tb.im[j + k * n];
      if (br === 0 && bi === 0) continue;
      for (let i = 0; i < m; i++) { const yr = Y.re[i + j * m], yi = Y.im[i + j * m]; rhs.re[i] -= yr * br - yi * bi; rhs.im[i] -= yr * bi + yi * br; }
    }
    const M = toC(Ta);
    for (let i = 0; i < m; i++) { M.re[i * (m + 1)] += Tb.re[k * (n + 1)]; M.im[i * (m + 1)] += Tb.im[k * (n + 1)]; }
    const y = triSolve(M, rhs, true);
    for (let i = 0; i < m; i++) { Y.re[i + k * m] = y.re[i]; Y.im[i + k * m] = y.im[i]; }
  }
  return cmul(cmul(sa.Z, Y), ctrans(sb.Z));
}

/** Reduced row echelon form with partial pivoting. */
function rrefCore(A0, tol) {
  const A = toC(A0); const { m, n } = A;
  if (tol == null) tol = Math.max(m, n) * EPS * (m && n ? normInf(A) : 0);
  const jb = [];
  let i = 0;
  for (let j = 0; j < n && i < m; j++) {
    let p = i, best = -1;
    for (let k = i; k < m; k++) { const a = Math.hypot(A.re[k + j * m], A.im[k + j * m]); if (a > best) { best = a; p = k; } }
    if (best <= tol) { for (let k = i; k < m; k++) { A.re[k + j * m] = 0; A.im[k + j * m] = 0; } continue; }
    jb.push(j);
    for (let c = j; c < n; c++) {
      const a = p + c * m, b = i + c * m;
      let t = A.re[a]; A.re[a] = A.re[b]; A.re[b] = t; t = A.im[a]; A.im[a] = A.im[b]; A.im[b] = t;
    }
    const pr = A.re[i + j * m], pi = A.im[i + j * m];
    for (let c = j; c < n; c++) { const [x, y] = cdiv(A.re[i + c * m], A.im[i + c * m], pr, pi); A.re[i + c * m] = x; A.im[i + c * m] = y; }
    for (let k = 0; k < m; k++) {
      if (k === i) continue;
      const fr = A.re[k + j * m], fi = A.im[k + j * m];
      if (fr === 0 && fi === 0) continue;
      for (let c = j; c < n; c++) { const xr = A.re[i + c * m], xi = A.im[i + c * m]; A.re[k + c * m] -= fr * xr - fi * xi; A.im[k + c * m] -= fr * xi + fi * xr; }
    }
    i++;
  }
  return { R: A, jb };
}

/** Bunch-Kaufman LDL' for a real symmetric matrix (lower triangle used). */
function ldlBK(a, n) {
  const A = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) A[i + j * n] = i >= j ? a[i + j * n] : a[j + i * n];
  const L = new Float64Array(n * n), D = new Float64Array(n * n);
  const perm = Array.from({ length: n }, (_, i) => i);
  const alpha = (1 + Math.sqrt(17)) / 8;
  const swap = (k, r) => {
    if (k === r) return;
    for (let j = 0; j < n; j++) { const t = A[k + j * n]; A[k + j * n] = A[r + j * n]; A[r + j * n] = t; }
    for (let i = 0; i < n; i++) { const t = A[i + k * n]; A[i + k * n] = A[i + r * n]; A[i + r * n] = t; }
    for (let j = 0; j < n; j++) { const t = L[k + j * n]; L[k + j * n] = L[r + j * n]; L[r + j * n] = t; }
    const t = perm[k]; perm[k] = perm[r]; perm[r] = t;
  };
  let k = 0;
  while (k < n) {
    let lambda = 0, r = k;
    for (let i = k + 1; i < n; i++) { const v = Math.abs(A[i + k * n]); if (v > lambda) { lambda = v; r = i; } }
    const akk = Math.abs(A[k + k * n]);
    let s = 1;
    if (Math.max(akk, lambda) === 0 || akk >= alpha * lambda) { s = 1; }
    else {
      let sigma = 0;
      for (let j = k; j < n; j++) if (j !== r) sigma = Math.max(sigma, Math.abs(A[r + j * n]));
      if (akk * sigma >= alpha * lambda * lambda) s = 1;
      else if (Math.abs(A[r + r * n]) >= alpha * sigma) { s = 1; swap(k, r); }
      else { s = 2; swap(k + 1, r); }
    }
    if (s === 1) {
      const d = A[k + k * n]; D[k + k * n] = d; L[k + k * n] = 1;
      if (d !== 0) for (let i = k + 1; i < n; i++) L[i + k * n] = A[i + k * n] / d;
      for (let j = k + 1; j < n; j++) for (let i = k + 1; i < n; i++) A[i + j * n] -= L[i + k * n] * d * L[j + k * n];
    } else {
      const e11 = A[k + k * n], e21 = A[k + 1 + k * n], e22 = A[k + 1 + (k + 1) * n];
      D[k + k * n] = e11; D[k + 1 + k * n] = e21; D[k + (k + 1) * n] = e21; D[k + 1 + (k + 1) * n] = e22;
      L[k + k * n] = 1; L[k + 1 + (k + 1) * n] = 1;
      const det = e11 * e22 - e21 * e21;
      const i11 = e22 / det, i12 = -e21 / det, i22 = e11 / det;
      for (let i = k + 2; i < n; i++) {
        const x = A[i + k * n], y = A[i + (k + 1) * n];
        L[i + k * n] = x * i11 + y * i12; L[i + (k + 1) * n] = x * i12 + y * i22;
      }
      for (let j = k + 2; j < n; j++) for (let i = k + 2; i < n; i++) {
        A[i + j * n] -= L[i + k * n] * A[j + k * n] + L[i + (k + 1) * n] * A[j + (k + 1) * n];
      }
    }
    k += s;
  }
  return { L, D, perm };
}

// ---------------------------------------------------------------- help

export const help = {
  mldivide: H('Solve systems of linear equations A*x = B (A\\B).', '연립 일차 방정식 A*x = B 풀이 (A\\B).', ['x = A\\B', 'x = mldivide(A, B)']),
  mrdivide: H('Solve systems of linear equations x*A = B (B/A).', '연립 일차 방정식 x*A = B 풀이 (B/A).', ['x = B/A', 'x = mrdivide(B, A)']),
  mpower: H('Matrix power (A^p).', '행렬 거듭제곱 (A^p).', ['C = A^p', 'C = mpower(A, p)']),
  inv: H('Matrix inverse.', '역행렬.', ['Y = inv(X)']),
  pinv: H('Moore-Penrose pseudoinverse.', '무어-펜로즈 유사역행렬.', ['B = pinv(A)', 'B = pinv(A, tol)']),
  det: H('Matrix determinant.', '행렬식.', ['d = det(A)']),
  rank: H('Rank of a matrix.', '행렬의 계수(rank).', ['k = rank(A)', 'k = rank(A, tol)']),
  trace: H('Sum of the diagonal elements.', '대각 원소의 합.', ['b = trace(A)']),
  norm: H('Vector and matrix norms.', '벡터 및 행렬 노름.', ['n = norm(v)', 'n = norm(v, p)', 'n = norm(X)', "n = norm(X, p)  % p = 1, 2, Inf, 'fro'"]),
  cond: H('Condition number with respect to inversion.', '역행렬에 대한 조건수.', ['c = cond(A)', 'c = cond(A, p)']),
  rcond: H('Reciprocal condition number estimate (1-norm).', '역 조건수 추정값 (1-노름).', ['c = rcond(A)']),
  null: H('Orthonormal basis of the null space.', '영공간의 정규직교 기저.', ['Z = null(A)', "Z = null(A, 'r')", 'Z = null(A, tol)']),
  orth: H('Orthonormal basis of the range.', '치역(열공간)의 정규직교 기저.', ['Q = orth(A)', 'Q = orth(A, tol)']),
  rref: H('Reduced row echelon form.', '기약 행 사다리꼴.', ['R = rref(A)', '[R, p] = rref(A, tol)']),
  lu: H('LU factorization with partial pivoting.', '부분 피벗팅 LU 분해.', ['[L, U] = lu(A)', '[L, U, P] = lu(A)', "[L, U, p] = lu(A, 'vector')", 'Y = lu(A)']),
  qr: H('Orthogonal-triangular (QR) decomposition.', 'QR 분해(직교-삼각).', ['R = qr(A)', '[Q, R] = qr(A)', '[Q, R, P] = qr(A)', "[Q, R] = qr(A, 'econ')", '[Q, R, p] = qr(A, 0)']),
  chol: H('Cholesky factorization.', '촐레스키 분해.', ['R = chol(A)', "L = chol(A, 'lower')", '[R, p] = chol(A)']),
  ldl: H('Block LDL\' factorization of a symmetric matrix (Bunch-Kaufman pivoting).', '대칭 행렬의 블록 LDL\' 분해 (Bunch-Kaufman 피벗).', ['[L, D] = ldl(A)', '[L, D, P] = ldl(A)', "[L, D, p] = ldl(A, 'vector')"]),
  eig: H('Eigenvalues and eigenvectors (standard and generalized).', '고유값과 고유벡터 (표준 및 일반화 문제).', ['e = eig(A)', '[V, D] = eig(A)', '[V, D, W] = eig(A)', 'e = eig(A, B)', "[V, D] = eig(A, B, 'chol')", "[V, D] = eig(A, 'vector')"]),
  eigs: H('Subset of eigenvalues and eigenvectors.', '일부 고유값과 고유벡터.', ['d = eigs(A)', 'd = eigs(A, k)', 'd = eigs(A, k, sigma)', '[V, D, flag] = eigs(A, k, sigma)']),
  svd: H('Singular value decomposition.', '특이값 분해.', ['s = svd(A)', '[U, S, V] = svd(A)', "[U, S, V] = svd(A, 'econ')", '[U, S, V] = svd(A, 0)']),
  svds: H('Subset of singular values and vectors.', '일부 특이값과 특이벡터.', ['s = svds(A)', 's = svds(A, k)', "s = svds(A, k, 'smallest')", '[U, S, V] = svds(A, k)']),
  schur: H('Schur decomposition.', '슈어 분해.', ['T = schur(A)', '[U, T] = schur(A)', "[U, T] = schur(A, 'complex')"]),
  rsf2csf: H('Convert a real Schur form to a complex Schur form.', '실수 슈어 형식을 복소수 슈어 형식으로 변환.', ['[U, T] = rsf2csf(U, T)']),
  hess: H('Hessenberg form of a matrix.', '헤센베르크 형식.', ['H = hess(A)', '[P, H] = hess(A)']),
  balance: H('Diagonal scaling to improve eigenvalue accuracy.', '고유값 정확도를 위한 대각 스케일링.', ['B = balance(A)', '[T, B] = balance(A)', '[s, p, B] = balance(A)']),
  expm: H('Matrix exponential.', '행렬 지수 함수.', ['Y = expm(X)']),
  logm: H('Matrix logarithm (principal).', '행렬 로그 (주값).', ['L = logm(A)', '[L, exitflag] = logm(A)']),
  sqrtm: H('Matrix square root (principal).', '행렬 제곱근 (주값).', ['X = sqrtm(A)', '[X, residual] = sqrtm(A)']),
  funm: H('Evaluate a general matrix function.', '일반 행렬 함수 계산.', ['F = funm(A, fun)']),
  kron: H('Kronecker tensor product.', '크로네커 텐서 곱.', ['K = kron(A, B)']),
  vecnorm: H('Vector-wise norm.', '벡터별 노름.', ['N = vecnorm(A)', 'N = vecnorm(A, p)', 'N = vecnorm(A, p, dim)']),
  normest: H('2-norm estimate by power iteration.', '거듭제곱 반복으로 2-노름 추정.', ['nrm = normest(S)', '[nrm, count] = normest(S, tol)']),
  linsolve: H('Solve a linear system with matrix properties given in opts.', 'opts로 행렬 성질을 지정하여 선형 시스템 풀이.', ['X = linsolve(A, B)', 'X = linsolve(A, B, opts)', '[X, r] = linsolve(...)']),
  lsqminnorm: H('Minimum-norm least-squares solution.', '최소 노름 최소제곱 해.', ['X = lsqminnorm(A, B)', 'X = lsqminnorm(A, B, tol)']),
  lscov: H('Least squares with known covariance or weights.', '공분산/가중치를 아는 최소제곱.', ['x = lscov(A, b)', 'x = lscov(A, b, w)', '[x, stdx, mse, S] = lscov(A, b, V)']),
  sylvester: H('Solve the Sylvester equation A*X + X*B = C.', '실베스터 방정식 A*X + X*B = C 풀이.', ['X = sylvester(A, B, C)']),
  subspace: H('Angle between two subspaces.', '두 부분공간 사이의 각.', ['theta = subspace(A, B)']),
  condeig: H('Condition numbers of eigenvalues.', '고유값의 조건수.', ['c = condeig(A)', '[V, D, s] = condeig(A)']),
  cdf2rdf: H('Convert complex diagonal form to real block diagonal form.', '복소 대각 형식을 실수 블록 대각 형식으로 변환.', ['[V, D] = cdf2rdf(V, D)']),
  cholupdate: H('Rank-1 update of a Cholesky factorization.', '촐레스키 분해의 계수-1 갱신.', ['R1 = cholupdate(R, x)', "R1 = cholupdate(R, x, '-')", "[R1, p] = cholupdate(R, x, '-')"]),
  planerot: H('Givens plane rotation.', '기븐스 평면 회전.', ['[G, y] = planerot(x)']),
  issymmetric: H('True for a symmetric matrix.', '대칭 행렬이면 참.', ['tf = issymmetric(A)', "tf = issymmetric(A, 'skew')", 'tf = issymmetric(A, tol)']),
  ishermitian: H('True for a Hermitian matrix.', '에르미트 행렬이면 참.', ['tf = ishermitian(A)', "tf = ishermitian(A, 'skew')", 'tf = ishermitian(A, tol)']),
  istriu: H('True for an upper triangular matrix.', '상삼각 행렬이면 참.', ['tf = istriu(A)']),
  istril: H('True for a lower triangular matrix.', '하삼각 행렬이면 참.', ['tf = istril(A)']),
  isdiag: H('True for a diagonal matrix.', '대각 행렬이면 참.', ['tf = isdiag(A)']),
  isbanded: H('True for a matrix within the given bandwidth.', '주어진 대역폭 안의 행렬이면 참.', ['tf = isbanded(A, lower, upper)']),
  bandwidth: H('Lower and upper bandwidth of a matrix.', '행렬의 아래/위 대역폭.', ['[lower, upper] = bandwidth(A)', "b = bandwidth(A, 'lower')"]),
};
void tensor; void toTensor; void lscalar; void isSparseV; void csqrt;
