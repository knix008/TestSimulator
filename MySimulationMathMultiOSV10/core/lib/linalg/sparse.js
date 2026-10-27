// Sparse matrices (compressed sparse column): construction, conversion,
// arithmetic helpers for the base operators, a sparse LU direct solver,
// Krylov iterative solvers (pcg, gmres, bicgstab, minres, cgs, lsqr) and
// incomplete factorizations (ilu, ichol).
//
// JS helpers exported for other areas (see index.js `sparseOps`):
//   spFromTriplets, sparseFromDense, spToDense, spTranspose, spFind, spAdd,
//   spMul, spMulDense, denseMulSp, spScale, spMap, spNnz, spGet, spSolve.
import {
  EPS, fail, warn, warnSingular, out, outMat, scalar, lscalar, optText, isOpt, scal, intArg, H, dbl, field,
  isSparse, toTensor, tensor, isStruct, cdiv,
} from './util.js';
import { isFuncHandle, isTensor, isLogical, sparseMatrix, isText, toStr } from '../../value.js';
import { cm, toC, luFactor as _lu, rcondLU as _rc } from './kernels.js';
import { solveDense } from './dense.js';
import { urand, nrand } from '../numeric/random.js';

export const isSparseV = (v) => isSparse(v);

// ---------------------------------------------------------------- construction / conversion

/**
 * Sparse matrix from triplets (0-based). Duplicates are summed (logical: OR).
 * Explicit zeros are dropped.
 */
export function spFromTriplets(m, n, rows, cols, re, im = null, cls = 'double') {
  const nz = rows.length;
  const cnt = new Int32Array(n + 1);
  for (let k = 0; k < nz; k++) cnt[cols[k] + 1]++;
  for (let j = 0; j < n; j++) cnt[j + 1] += cnt[j];
  const pos = Int32Array.from(cnt.subarray(0, n));
  const ri = new Int32Array(nz), vr = new Float64Array(nz), vi = im ? new Float64Array(nz) : null;
  for (let k = 0; k < nz; k++) { const p = pos[cols[k]]++; ri[p] = rows[k]; vr[p] = re[k]; if (vi) vi[p] = im[k]; }
  // sort rows within each column and sum duplicates
  const colPtr = [0], rowIdx = [], outR = [], outI = [];
  const order = [];
  for (let j = 0; j < n; j++) {
    order.length = 0;
    for (let p = cnt[j]; p < cnt[j + 1]; p++) order.push(p);
    order.sort((a, b) => ri[a] - ri[b] || a - b);
    let last = -1;
    for (const p of order) {
      if (ri[p] === last) {
        const q = outR.length - 1;
        if (cls === 'logical') outR[q] = outR[q] || vr[p] ? 1 : 0;
        else { outR[q] += vr[p]; if (vi) outI[q] += vi[p]; }
      } else { rowIdx.push(ri[p]); outR.push(cls === 'logical' ? (vr[p] ? 1 : 0) : vr[p]); if (vi) outI.push(vi[p]); last = ri[p]; }
    }
    colPtr.push(rowIdx.length);
  }
  return compact(m, n, colPtr, rowIdx, outR, vi ? outI : null, cls);
}

/** Drops explicit zeros and an all-zero imaginary part. */
function compact(m, n, colPtr, rowIdx, re, im, cls = 'double') {
  const cp = [0], ri = [], vr = [], vi = [];
  let anyIm = false;
  for (let j = 0; j < n; j++) {
    for (let p = colPtr[j]; p < colPtr[j + 1]; p++) {
      const a = re[p], b = im ? im[p] : 0;
      if (a === 0 && b === 0) continue;
      ri.push(rowIdx[p]); vr.push(a); vi.push(b); if (b !== 0) anyIm = true;
    }
    cp.push(ri.length);
  }
  return sparseMatrix(m, n, cp, ri, vr, anyIm ? vi : null, cls);
}

/** Dense (or sparse) Value → sparse. Logical stays logical; other classes become double. */
export function sparseFromDense(v) {
  if (isSparse(v)) return v;
  const t = isTensor(v) ? v : toTensor(v);
  if (t.dims.length > 2) fail('sparse:ndArray', 'Sparse matrices must be 2-D.');
  const [m, n] = t.dims;
  const cls = isLogical(t) ? 'logical' : 'double';
  const cp = [0], ri = [], vr = [], vi = [];
  let anyIm = false;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < m; i++) {
      const k = i + j * m; const a = t.re[k], b = t.im ? t.im[k] : 0;
      if (a !== 0 || b !== 0) { ri.push(i); vr.push(a); vi.push(b); if (b !== 0) anyIm = true; }
    }
    cp.push(ri.length);
  }
  return sparseMatrix(m, n, cp, ri, vr, anyIm ? vi : null, cls);
}
export const spToDense = (S) => toTensor(S);
export const spNnz = (S) => S.colPtr[S.dims[1]];

/** Element (i, j) (0-based) → [re, im]. */
export function spGet(S, i, j) {
  for (let p = S.colPtr[j]; p < S.colPtr[j + 1]; p++) if (S.rowIdx[p] === i) return [S.re[p], S.im ? S.im[p] : 0];
  return [0, 0];
}

/** Nonzeros in column-major order: {rows, cols, re, im}. */
export function spFind(S) {
  const nz = spNnz(S); const rows = new Int32Array(nz), cols = new Int32Array(nz);
  for (let j = 0; j < S.dims[1]; j++) for (let p = S.colPtr[j]; p < S.colPtr[j + 1]; p++) { rows[p] = S.rowIdx[p]; cols[p] = j; }
  return { rows, cols, re: Float64Array.from(S.re.subarray(0, nz)), im: S.im ? Float64Array.from(S.im.subarray(0, nz)) : null };
}

export function spTranspose(S, conj = false) {
  const [m, n] = S.dims; const f = spFind(S);
  const im = f.im && conj ? f.im.map((x) => -x) : f.im;
  return spFromTriplets(n, m, f.cols, f.rows, f.re, im, S.cls);
}

/** alpha*A + beta*B for sparse A, B of equal size. */
export function spAdd(A, B, alpha = 1, beta = 1) {
  const [m, n] = A.dims;
  if (B.dims[0] !== m || B.dims[1] !== n) fail('sparse:dimagree', 'Matrix dimensions must agree.');
  const fa = spFind(A), fb = spFind(B);
  const rows = Int32Array.from([...fa.rows, ...fb.rows]), cols = Int32Array.from([...fa.cols, ...fb.cols]);
  const re = Float64Array.from([...Array.from(fa.re, (x) => alpha * x), ...Array.from(fb.re, (x) => beta * x)]);
  const im = fa.im || fb.im ? Float64Array.from([...(fa.im ? Array.from(fa.im, (x) => alpha * x) : new Array(fa.re.length).fill(0)), ...(fb.im ? Array.from(fb.im, (x) => beta * x) : new Array(fb.re.length).fill(0))]) : null;
  return spFromTriplets(m, n, rows, cols, re, im);
}

/** Sparse * sparse (Gustavson). */
export function spMul(A, B) {
  const [m, k] = A.dims, [k2, n] = B.dims;
  if (k !== k2) fail('sparse:innerdim', 'Incorrect dimensions for matrix multiplication.');
  const cplx = !!(A.im || B.im);
  const wr = new Float64Array(m), wi = new Float64Array(m), mark = new Int32Array(m).fill(-1);
  const cp = [0], ri = [], vr = [], vi = [];
  for (let j = 0; j < n; j++) {
    const pat = [];
    for (let q = B.colPtr[j]; q < B.colPtr[j + 1]; q++) {
      const c = B.rowIdx[q], br = B.re[q], bi = B.im ? B.im[q] : 0;
      for (let p = A.colPtr[c]; p < A.colPtr[c + 1]; p++) {
        const i = A.rowIdx[p], ar = A.re[p], ai = A.im ? A.im[p] : 0;
        if (mark[i] !== j) { mark[i] = j; pat.push(i); wr[i] = 0; wi[i] = 0; }
        wr[i] += ar * br - ai * bi; wi[i] += ar * bi + ai * br;
      }
    }
    pat.sort((a, b) => a - b);
    for (const i of pat) { ri.push(i); vr.push(wr[i]); vi.push(wi[i]); }
    cp.push(ri.length);
  }
  return compact(m, n, cp, ri, vr, cplx ? vi : null);
}

/** Sparse * dense → dense tensor. */
export function spMulDense(A, Bv) {
  const B = dbl(Bv, 'mtimes'); const [m, k] = A.dims; const n = B.dims[1];
  if (B.dims[0] !== k) fail('sparse:innerdim', 'Incorrect dimensions for matrix multiplication.');
  const re = new Float64Array(m * n), im = A.im || B.im ? new Float64Array(m * n) : null;
  for (let j = 0; j < n; j++) for (let c = 0; c < k; c++) {
    const br = B.re[c + j * k], bi = B.im ? B.im[c + j * k] : 0;
    if (br === 0 && bi === 0) continue;
    for (let p = A.colPtr[c]; p < A.colPtr[c + 1]; p++) {
      const i = A.rowIdx[p], ar = A.re[p], ai = A.im ? A.im[p] : 0;
      re[i + j * m] += ar * br - ai * bi; if (im) im[i + j * m] += ar * bi + ai * br;
    }
  }
  return out([m, n], re, im);
}
/** Dense * sparse → dense tensor. */
export function denseMulSp(Av, B) {
  const A = dbl(Av, 'mtimes'); const [m, k] = A.dims; const [k2, n] = B.dims;
  if (k !== k2) fail('sparse:innerdim', 'Incorrect dimensions for matrix multiplication.');
  const re = new Float64Array(m * n), im = A.im || B.im ? new Float64Array(m * n) : null;
  for (let j = 0; j < n; j++) for (let p = B.colPtr[j]; p < B.colPtr[j + 1]; p++) {
    const c = B.rowIdx[p], br = B.re[p], bi = B.im ? B.im[p] : 0;
    for (let i = 0; i < m; i++) {
      const ar = A.re[i + c * m], ai = A.im ? A.im[i + c * m] : 0;
      re[i + j * m] += ar * br - ai * bi; if (im) im[i + j * m] += ar * bi + ai * br;
    }
  }
  return out([m, n], re, im);
}
/** Scalar times sparse. */
export function spScale(S, sr, si = 0) {
  const f = spFind(S);
  const re = new Float64Array(f.re.length), im = si || f.im ? new Float64Array(f.re.length) : null;
  for (let k = 0; k < re.length; k++) { const a = f.re[k], b = f.im ? f.im[k] : 0; re[k] = a * sr - b * si; if (im) im[k] = a * si + b * sr; }
  return spFromTriplets(S.dims[0], S.dims[1], f.rows, f.cols, re, im);
}
/** Applies fn(re, im) → [re, im] to the nonzeros. */
export function spMap(S, fn, cls = 'double') {
  const f = spFind(S);
  const re = new Float64Array(f.re.length), im = new Float64Array(f.re.length);
  for (let k = 0; k < re.length; k++) { const [a, b] = fn(f.re[k], f.im ? f.im[k] : 0); re[k] = a; im[k] = b; }
  return spFromTriplets(S.dims[0], S.dims[1], f.rows, f.cols, re, im, cls);
}

// ---------------------------------------------------------------- sparse LU (Gilbert-Peierls, partial pivoting)

/** Column lists of a real sparse matrix. */
function columns(S) {
  const n = S.dims[1]; const cols = [];
  for (let j = 0; j < n; j++) { const idx = [], val = []; for (let p = S.colPtr[j]; p < S.colPtr[j + 1]; p++) { idx.push(S.rowIdx[p]); val.push(S.re[p]); } cols.push({ idx, val }); }
  return cols;
}

/** Left-looking sparse LU of a real square sparse matrix. */
export function spLU(S, thresh = 1) {
  const n = S.dims[0];
  const Acols = columns(S);
  const Lc = [], Uc = [], Ud = new Float64Array(n);
  const pinv = new Int32Array(n).fill(-1), prow = new Int32Array(n);
  const x = new Float64Array(n), mark = new Int32Array(n).fill(-1);
  let singular = false;
  for (let k = 0; k < n; k++) {
    // symbolic: reach of A(:,k) in the graph of L
    const topo = [];
    const stack = [], childPos = [];
    for (const i0 of Acols[k].idx) {
      if (mark[i0] === k) continue;
      stack.push(i0); childPos.push(0); mark[i0] = k;
      while (stack.length) {
        const node = stack[stack.length - 1];
        const j = pinv[node];
        const kids = j >= 0 ? Lc[j].idx : null;
        let pushed = false;
        if (kids) {
          let cpos = childPos[childPos.length - 1];
          while (cpos < kids.length) {
            const c = kids[cpos++];
            if (mark[c] !== k) { childPos[childPos.length - 1] = cpos; mark[c] = k; stack.push(c); childPos.push(0); pushed = true; break; }
          }
          if (!pushed) childPos[childPos.length - 1] = cpos;
        }
        if (!pushed) { stack.pop(); childPos.pop(); topo.push(node); }
      }
    }
    topo.reverse();
    for (const i of topo) x[i] = 0;
    const ac = Acols[k];
    for (let t = 0; t < ac.idx.length; t++) x[ac.idx[t]] = ac.val[t];
    for (const i of topo) {
      const j = pinv[i]; if (j < 0) continue;
      const xj = x[i]; if (xj === 0) continue;
      const L = Lc[j];
      for (let t = 0; t < L.idx.length; t++) x[L.idx[t]] -= L.val[t] * xj;
    }
    const uIdx = [], uVal = [];
    let ipiv = -1, amax = -1, diagRow = -1;
    for (const i of topo) {
      if (pinv[i] >= 0) { if (x[i] !== 0) { uIdx.push(pinv[i]); uVal.push(x[i]); } }
      else { const a = Math.abs(x[i]); if (a > amax) { amax = a; ipiv = i; } if (i === k) diagRow = i; }
    }
    if (diagRow >= 0 && Math.abs(x[diagRow]) >= thresh * amax) ipiv = diagRow;
    if (ipiv < 0 || amax === 0) {
      singular = true;
      if (ipiv < 0) { for (let i = 0; i < n; i++) if (pinv[i] < 0) { ipiv = i; x[i] = 0; break; } }
    }
    const piv = x[ipiv];
    pinv[ipiv] = k; prow[k] = ipiv; Ud[k] = piv;
    const lIdx = [], lVal = [];
    for (const i of topo) {
      if (pinv[i] >= 0 || i === ipiv) continue;
      if (x[i] !== 0) { lIdx.push(i); lVal.push(piv === 0 ? 0 : x[i] / piv); }
    }
    Lc.push({ idx: lIdx, val: lVal });
    Uc.push({ idx: uIdx, val: uVal });
  }
  return { n, Lc, Uc, Ud, prow, pinv, singular };
}

/** Solves A x = b (trans = false) or A' x = b (trans = true) with spLU factors; b, result Float64Array. */
function spLUSolve(F, b, trans = false) {
  const { n, Lc, Uc, Ud, prow } = F;
  if (!trans) {
    const w = Float64Array.from(b);
    const z = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const xk = w[prow[k]]; z[k] = xk;
      if (xk === 0) continue;
      const L = Lc[k]; for (let t = 0; t < L.idx.length; t++) w[L.idx[t]] -= L.val[t] * xk;
    }
    for (let k = n - 1; k >= 0; k--) {
      z[k] /= Ud[k];
      const zk = z[k]; if (zk === 0) continue;
      const U = Uc[k]; for (let t = 0; t < U.idx.length; t++) z[U.idx[t]] -= U.val[t] * zk;
    }
    return z;
  }
  // A' x = b: A = P' L U (rows permuted): U' y = b, L' w = y, x(prow) = w
  const y = Float64Array.from(b);
  for (let k = 0; k < n; k++) {
    const U = Uc[k]; let s = y[k];
    for (let t = 0; t < U.idx.length; t++) s -= U.val[t] * y[U.idx[t]];
    y[k] = s / Ud[k];
  }
  const x = new Float64Array(n);
  for (let k = n - 1; k >= 0; k--) {
    const L = Lc[k]; let s = y[k];
    for (let t = 0; t < L.idx.length; t++) s -= L.val[t] * x[L.idx[t]];
    x[prow[k]] = s;
  }
  return x;
}

function spNorm1(S) {
  let best = 0;
  for (let j = 0; j < S.dims[1]; j++) { let s = 0; for (let p = S.colPtr[j]; p < S.colPtr[j + 1]; p++) s += Math.hypot(S.re[p], S.im ? S.im[p] : 0); if (s > best) best = s; }
  return best;
}

function spRcond(S, F) {
  const n = S.dims[0]; if (n === 0) return Infinity; if (F.singular) return 0;
  const an = spNorm1(S); if (an === 0) return 0;
  let x = new Float64Array(n).fill(1 / n), est = 0, lastJ = -1;
  for (let it = 0; it < 5; it++) {
    const y = spLUSolve(F, x);
    let ny = 0; for (const v of y) ny += Math.abs(v);
    if (!Number.isFinite(ny)) return 0;
    if (it > 0 && ny <= est) { est = Math.max(est, ny); break; }
    est = ny;
    const z = spLUSolve(F, y.map((v) => (v >= 0 ? 1 : -1)), true);
    let j = 0, zj = -1, zx = 0;
    for (let i = 0; i < n; i++) { if (Math.abs(z[i]) > zj) { zj = Math.abs(z[i]); j = i; } zx += z[i] * x[i]; }
    if (it > 0 && (zj <= zx || j === lastJ)) break;
    lastJ = j; x = new Float64Array(n); x[j] = 1;
  }
  return 1 / (an * est);
}

function spIsTri(S, upper) {
  for (let j = 0; j < S.dims[1]; j++) for (let p = S.colPtr[j]; p < S.colPtr[j + 1]; p++) { const i = S.rowIdx[p]; if (upper ? i > j : i < j) return false; }
  return true;
}
function spTriSolve(S, b, upper) {
  const n = S.dims[0]; const x = Float64Array.from(b);
  const diag = new Float64Array(n);
  for (let j = 0; j < n; j++) for (let p = S.colPtr[j]; p < S.colPtr[j + 1]; p++) if (S.rowIdx[p] === j) diag[j] = S.re[p];
  if (upper) {
    for (let j = n - 1; j >= 0; j--) { x[j] /= diag[j]; const xj = x[j]; if (xj === 0) continue; for (let p = S.colPtr[j]; p < S.colPtr[j + 1]; p++) { const i = S.rowIdx[p]; if (i < j) x[i] -= S.re[p] * xj; } }
  } else {
    for (let j = 0; j < n; j++) { x[j] /= diag[j]; const xj = x[j]; if (xj === 0) continue; for (let p = S.colPtr[j]; p < S.colPtr[j + 1]; p++) { const i = S.rowIdx[p]; if (i > j) x[i] -= S.re[p] * xj; } }
  }
  return { x, diag };
}

/** A \ B with sparse A. Result is sparse when B is sparse. */
export function spSolve(A, Bv, ctx) {
  const [m, n] = A.dims;
  const Bd = dbl(Bv, 'mldivide');
  if (Bd.dims[0] !== m) fail('mldivide:dimagree', 'Matrix dimensions must agree.');
  const p = Bd.dims[1];
  const wantSparse = isSparse(Bv);
  const finish = (t) => (wantSparse ? sparseFromDense(t) : t);
  if (m !== n || A.im || Bd.im || n <= 64) {
    const Ad = toC({ m, n, re: toTensor(A).re, im: toTensor(A).im });
    const Bc = toC({ m, n: p, re: Bd.re, im: Bd.im });
    const X = solveDense(Ad, Bc, ctx);
    let anyIm = false; for (const v of X.im) if (v !== 0) { anyIm = true; break; }
    return finish(out([n, p], X.re, anyIm ? X.im : null));
  }
  const res = new Float64Array(n * p);
  let rc;
  const upper = spIsTri(A, true), lower = !upper && spIsTri(A, false);
  if (upper || lower) {
    let diagMin = Infinity, diagMax = 0;
    for (let c = 0; c < p; c++) {
      const r = spTriSolve(A, Bd.re.subarray(c * n, (c + 1) * n), upper); res.set(r.x, c * n);
      if (c === 0) for (const d of r.diag) { diagMin = Math.min(diagMin, Math.abs(d)); diagMax = Math.max(diagMax, Math.abs(d)); }
    }
    if (p === 0) { const r = spTriSolve(A, new Float64Array(n), upper); for (const d of r.diag) { diagMin = Math.min(diagMin, Math.abs(d)); diagMax = Math.max(diagMax, Math.abs(d)); } }
    rc = diagMax === 0 ? 0 : diagMin / diagMax;
  } else {
    const F = spLU(A);
    for (let c = 0; c < p; c++) res.set(spLUSolve(F, Bd.re.subarray(c * n, (c + 1) * n)), c * n);
    rc = spRcond(A, F);
  }
  if (rc === 0 || rc < EPS) warnSingular(ctx, rc);
  return finish(out([n, p], res));
}

// ---------------------------------------------------------------- iterative solvers

/** Complex vectors as {re, im} Float64Arrays. */
const vz = (n) => ({ re: new Float64Array(n), im: new Float64Array(n) });
const vcopy = (x) => ({ re: Float64Array.from(x.re), im: Float64Array.from(x.im) });
function vdot(x, y) { let r = 0, i = 0; for (let k = 0; k < x.re.length; k++) { r += x.re[k] * y.re[k] + x.im[k] * y.im[k]; i += x.re[k] * y.im[k] - x.im[k] * y.re[k]; } return [r, i]; }
const vnorm = (x) => { let s = 0; for (let k = 0; k < x.re.length; k++) s = Math.hypot(s, x.re[k], x.im[k]); return s; };
/** y += a*x (a complex). */
function axpy(y, ar, ai, x) { for (let k = 0; k < y.re.length; k++) { const xr = x.re[k], xi = x.im[k]; y.re[k] += ar * xr - ai * xi; y.im[k] += ar * xi + ai * xr; } }
function vscale(x, ar, ai = 0) { const y = vz(x.re.length); axpy(y, ar, ai, x); return y; }
const vsub = (a, b) => { const y = vcopy(a); axpy(y, -1, 0, b); return y; };
const toVal = (x) => out([x.re.length, 1], x.re, x.im.some((v) => v !== 0) ? x.im : null);
const fromVal = (v, n) => { const t = dbl(v, 'iterative'); if (t.re.length !== n) fail('iterative:badOperator', 'The operator returned a vector of the wrong length.'); return { re: Float64Array.from(t.re), im: t.im ? Float64Array.from(t.im) : new Float64Array(n) }; };

/** Linear operator from a matrix Value or a function handle. */
function makeOp(Av, ctx, n, fn, transFlag = null) {
  if (isFuncHandle(Av) || isText(Av)) {
    const f = isText(Av) ? toStr(Av) : Av;
    const flag = (t) => { const w = t ? 'transp' : 'notransp'; return tensor('char', [1, w.length], Array.from(w, (ch) => ch.charCodeAt(0))); };
    return (x, trans = false) => fromVal(ctx.call(f, transFlag ? [toVal(x), flag(trans)] : [toVal(x)], 1)[0], n);
  }
  if (isSparse(Av)) {
    const At = spTranspose(Av, true);
    return (x, trans = false) => {
      const S = trans ? At : Av; const y = vz(S.dims[0]);
      for (let j = 0; j < S.dims[1]; j++) {
        const xr = x.re[j], xi = x.im[j]; if (xr === 0 && xi === 0) continue;
        for (let p = S.colPtr[j]; p < S.colPtr[j + 1]; p++) { const i = S.rowIdx[p], ar = S.re[p], ai = S.im ? S.im[p] : 0; y.re[i] += ar * xr - ai * xi; y.im[i] += ar * xi + ai * xr; }
      }
      return y;
    };
  }
  const t = dbl(Av, fn, 'A'); const [m, k] = t.dims;
  return (x, trans = false) => {
    const y = vz(trans ? k : m);
    if (!trans) {
      for (let j = 0; j < k; j++) { const xr = x.re[j], xi = x.im[j]; if (xr === 0 && xi === 0) continue; for (let i = 0; i < m; i++) { const ar = t.re[i + j * m], ai = t.im ? t.im[i + j * m] : 0; y.re[i] += ar * xr - ai * xi; y.im[i] += ar * xi + ai * xr; } }
    } else {
      for (let j = 0; j < k; j++) { let sr = 0, si = 0; for (let i = 0; i < m; i++) { const ar = t.re[i + j * m], ai = t.im ? -t.im[i + j * m] : 0; sr += ar * x.re[i] - ai * x.im[i]; si += ar * x.im[i] + ai * x.re[i]; } y.re[j] = sr; y.im[j] = si; }
    }
    return y;
  };
}

/** Preconditioner solve z = M2 \ (M1 \ r). */
function makePrec(M1, M2, ctx, n) {
  const one = (M) => {
    if (M == null || (M.dims && M.dims[0] * M.dims[1] === 0 && !isFuncHandle(M))) return null;
    if (isFuncHandle(M)) return (r) => fromVal(ctx.call(M, [toVal(r)], 1)[0], n);
    if (isSparse(M) && !M.im) {
      const up = spIsTri(M, true), lo = !up && spIsTri(M, false);
      if (up || lo) return (r) => ({ re: spTriSolve(M, r.re, up).x, im: r.im.some((v) => v !== 0) ? spTriSolve(M, r.im, up).x : new Float64Array(n) });
      const F = spLU(M);
      return (r) => ({ re: spLUSolve(F, r.re), im: r.im.some((v) => v !== 0) ? spLUSolve(F, r.im) : new Float64Array(n) });
    }
    const t = dbl(M, 'precond'); const Mc = toC({ m: t.dims[0], n: t.dims[1], re: t.re, im: t.im });
    return (r) => { const X = solveDense(Mc, cm(n, 1, Float64Array.from(r.re), Float64Array.from(r.im)), ctx, { warnings: false }); return { re: X.re, im: X.im }; };
  };
  const p1 = one(M1), p2 = one(M2);
  if (!p1 && !p2) return null;
  return (r) => { let z = r; if (p1) z = p1(z); if (p2) z = p2(z); return z; };
}

function iterArgs(args, fn, hasRestart = false) {
  const b = args[1];
  if (b == null) fail(`${fn}:notEnoughInputs`, 'Not enough input arguments.');
  const bt = dbl(b, fn, 'b'); const n = bt.re.length;
  let i = 2; let restart = null;
  const emptyOr = (v) => v == null || (v.dims && v.dims[0] * v.dims[1] === 0);
  if (hasRestart) { restart = emptyOr(args[i]) ? null : intArg(args[i], fn, 'restart'); i++; }
  const tol = emptyOr(args[i]) ? 1e-6 : scal(args[i], fn, 'tol'); i++;
  const maxit = emptyOr(args[i]) ? null : intArg(args[i], fn, 'maxit'); i++;
  const M1 = args[i], M2 = args[i + 1], x0 = args[i + 2];
  return { b: { re: Float64Array.from(bt.re), im: bt.im ? Float64Array.from(bt.im) : new Float64Array(n) }, n, tol, maxit, M1, M2, x0: emptyOr(x0) ? null : x0, restart };
}

function finishIter(fn, nargout, ctx, r) {
  const { x, flag, relres, iter, resvec } = r;
  if (nargout < 2) {
    const it = Array.isArray(iter) ? iter.join(' ') : iter;
    if (flag === 0) ctx.out(`${fn} converged at iteration ${it} to a solution with relative residual ${relres.toExponential(1)}.\n`);
    else {
      const why = { 1: 'reached the maximum number of iterations', 2: 'stopped because the preconditioner is ill conditioned', 3: 'stopped because two consecutive iterates were the same', 4: 'stopped because a scalar quantity became too small or too large' }[flag];
      warn(ctx, `linalg:${fn}:tooSmallTolerance`, `${fn} ${why}. The iterate returned (number ${it}) has relative residual ${relres.toExponential(1)}.`);
    }
  }
  const outs = [toVal(x), scalar(flag), scalar(relres), Array.isArray(iter) ? out([1, iter.length], iter) : scalar(iter), out([resvec.length, 1], resvec)];
  return nargout <= 1 ? outs[0] : outs.slice(0, Math.max(nargout, 1));
}

function pcgCore(A, b, n, tol, maxit, prec, x0) {
  let x = x0 || vz(n);
  const nb = vnorm(b) || 1;
  let r = vsub(b, A(x));
  const resvec = [vnorm(r)];
  if (vnorm(b) === 0) return { x: vz(n), flag: 0, relres: 0, iter: 0, resvec: [0] };
  if (resvec[0] / nb <= tol) return { x, flag: 0, relres: resvec[0] / nb, iter: 0, resvec };
  let p = null, rho1 = null, best = { x: vcopy(x), rel: resvec[0] / nb, it: 0 };
  for (let it = 1; it <= maxit; it++) {
    const z = prec ? prec(r) : r;
    const [rho] = vdot(r, z);
    if (!Number.isFinite(rho) || rho === 0) return { x: best.x, flag: 4, relres: best.rel, iter: best.it, resvec };
    p = p == null ? vcopy(z) : (() => { const beta = rho / rho1; const q = vcopy(z); axpy(q, beta, 0, p); return q; })();
    const q = A(p);
    const [pq] = vdot(p, q);
    if (!(pq > 0) && !(pq < 0)) return { x: best.x, flag: 4, relres: best.rel, iter: best.it, resvec };
    const alpha = rho / pq;
    axpy(x, alpha, 0, p); axpy(r, -alpha, 0, q);
    rho1 = rho;
    const nr = vnorm(r); resvec.push(nr);
    if (nr / nb < best.rel) best = { x: vcopy(x), rel: nr / nb, it };
    if (nr / nb <= tol) {
      const tr = vnorm(vsub(b, A(x))) / nb;
      return { x, flag: 0, relres: tr, iter: it, resvec };
    }
  }
  return { x: best.x, flag: 1, relres: best.rel, iter: best.it, resvec };
}

function bicgstabCore(A, b, n, tol, maxit, prec, x0) {
  let x = x0 || vz(n);
  const nb = vnorm(b) || 1;
  let r = vsub(b, A(x));
  const rt = vcopy(r);
  const resvec = [vnorm(r)];
  if (vnorm(b) === 0) return { x: vz(n), flag: 0, relres: 0, iter: 0, resvec: [0] };
  if (resvec[0] / nb <= tol) return { x, flag: 0, relres: resvec[0] / nb, iter: 0, resvec };
  let rho1 = [1, 0], alpha = [1, 0], omega = [1, 0];
  let v = vz(n), p = vz(n);
  let best = { x: vcopy(x), rel: resvec[0] / nb, it: 0 };
  const cmulS = (a, b2) => [a[0] * b2[0] - a[1] * b2[1], a[0] * b2[1] + a[1] * b2[0]];
  const cdivS = (a, b2) => cdiv(a[0], a[1], b2[0], b2[1]);
  for (let it = 1; it <= maxit; it++) {
    const rho = vdot(rt, r);
    if (rho[0] === 0 && rho[1] === 0) return { x: best.x, flag: 4, relres: best.rel, iter: best.it, resvec };
    const beta = cmulS(cdivS(rho, rho1), cdivS(alpha, omega));
    // p = r + beta*(p - omega*v)
    const pm = vcopy(p); axpy(pm, -omega[0], -omega[1], v);
    p = vcopy(r); axpy(p, beta[0], beta[1], pm);
    const ph = prec ? prec(p) : p;
    v = A(ph);
    const rv = vdot(rt, v);
    alpha = cdivS(rho, rv);
    const s = vcopy(r); axpy(s, -alpha[0], -alpha[1], v);
    const xh = vcopy(x); axpy(xh, alpha[0], alpha[1], ph);
    const ns = vnorm(s); resvec.push(ns);
    if (ns / nb <= tol) { return { x: xh, flag: 0, relres: vnorm(vsub(b, A(xh))) / nb, iter: it - 0.5, resvec }; }
    if (ns / nb < best.rel) best = { x: vcopy(xh), rel: ns / nb, it: it - 0.5 };
    const sh = prec ? prec(s) : s;
    const t = A(sh);
    const tt = vdot(t, t);
    if (tt[0] === 0) return { x: best.x, flag: 4, relres: best.rel, iter: best.it, resvec };
    omega = cdivS(vdot(t, s), tt);
    x = xh; axpy(x, omega[0], omega[1], sh);
    r = vcopy(s); axpy(r, -omega[0], -omega[1], t);
    const nr = vnorm(r); resvec.push(nr);
    if (nr / nb < best.rel) best = { x: vcopy(x), rel: nr / nb, it };
    if (nr / nb <= tol) return { x, flag: 0, relres: vnorm(vsub(b, A(x))) / nb, iter: it, resvec };
    if (omega[0] === 0 && omega[1] === 0) return { x: best.x, flag: 4, relres: best.rel, iter: best.it, resvec };
    rho1 = rho;
  }
  return { x: best.x, flag: 1, relres: best.rel, iter: best.it, resvec };
}

function cgsCore(A, b, n, tol, maxit, prec, x0) {
  let x = x0 || vz(n);
  const nb = vnorm(b) || 1;
  let r = vsub(b, A(x));
  const rt = vcopy(r);
  const resvec = [vnorm(r)];
  if (vnorm(b) === 0) return { x: vz(n), flag: 0, relres: 0, iter: 0, resvec: [0] };
  if (resvec[0] / nb <= tol) return { x, flag: 0, relres: resvec[0] / nb, iter: 0, resvec };
  let rho1 = null, u = null, p = null, q = null;
  let best = { x: vcopy(x), rel: resvec[0] / nb, it: 0 };
  for (let it = 1; it <= maxit; it++) {
    const rho = vdot(rt, r);
    if (rho[0] === 0 && rho[1] === 0) return { x: best.x, flag: 4, relres: best.rel, iter: best.it, resvec };
    if (rho1 == null) { u = vcopy(r); p = vcopy(u); } else {
      const beta = cdiv(rho[0], rho[1], rho1[0], rho1[1]);
      u = vcopy(r); axpy(u, beta[0], beta[1], q);
      const t = vcopy(q); axpy(t, beta[0], beta[1], p);
      p = vcopy(u); axpy(p, beta[0], beta[1], t);
    }
    const ph = prec ? prec(p) : p;
    const vh = A(ph);
    const sig = vdot(rt, vh);
    if (sig[0] === 0 && sig[1] === 0) return { x: best.x, flag: 4, relres: best.rel, iter: best.it, resvec };
    const alpha = cdiv(rho[0], rho[1], sig[0], sig[1]);
    q = vcopy(u); axpy(q, -alpha[0], -alpha[1], vh);
    const uq = vcopy(u); axpy(uq, 1, 0, q);
    const uh = prec ? prec(uq) : uq;
    axpy(x, alpha[0], alpha[1], uh);
    r = vsub(b, A(x));
    const nr = vnorm(r); resvec.push(nr);
    if (nr / nb < best.rel) best = { x: vcopy(x), rel: nr / nb, it };
    if (nr / nb <= tol) return { x, flag: 0, relres: nr / nb, iter: it, resvec };
    rho1 = rho;
  }
  return { x: best.x, flag: 1, relres: best.rel, iter: best.it, resvec };
}

function gmresCore(A, b, n, restart, tol, maxit, prec, x0) {
  let x = x0 || vz(n);
  const M = (v) => (prec ? prec(v) : v);
  const bn = vnorm(M(b)) || 1;
  const nb0 = vnorm(b) || 1;
  const resvec = [];
  if (vnorm(b) === 0) return { x: vz(n), flag: 0, relres: 0, iter: [0, 0], resvec: [0] };
  let r = M(vsub(b, A(x)));
  resvec.push(vnorm(r));
  if (vnorm(vsub(b, A(x))) / nb0 <= tol) return { x, flag: 0, relres: vnorm(vsub(b, A(x))) / nb0, iter: [0, 0], resvec };
  for (let outer = 1; outer <= maxit; outer++) {
    const beta = vnorm(r);
    const Vb = [vscale(r, 1 / beta)];
    const Hr = [], Hi = []; // Hessenberg columns
    const cs = [], sn = []; // Givens (c real, s complex)
    const g = { re: new Float64Array(restart + 1), im: new Float64Array(restart + 1) }; g.re[0] = beta;
    let k = 0;
    for (; k < restart; k++) {
      let w = M(A(Vb[k]));
      const hr = new Float64Array(k + 2), hi = new Float64Array(k + 2);
      for (let j = 0; j <= k; j++) {
        const [dr, di] = vdot(Vb[j], w);
        hr[j] = dr; hi[j] = di; axpy(w, -dr, -di, Vb[j]);
      }
      for (let j = 0; j <= k; j++) { // reorthogonalize
        const [dr, di] = vdot(Vb[j], w);
        hr[j] += dr; hi[j] += di; axpy(w, -dr, -di, Vb[j]);
      }
      const hn = vnorm(w); hr[k + 1] = hn;
      if (hn > 0) Vb.push(vscale(w, 1 / hn)); else Vb.push(vz(n));
      // apply previous rotations
      for (let j = 0; j < k; j++) {
        const c = cs[j], [sr, si] = sn[j];
        const ar = hr[j], ai = hi[j], br = hr[j + 1], bi = hi[j + 1];
        hr[j] = c * ar + sr * br - si * bi; hi[j] = c * ai + sr * bi + si * br;
        hr[j + 1] = -(sr * ar + si * ai) + c * br; hi[j + 1] = -(sr * ai - si * ar) + c * bi;
      }
      // new rotation zeroing h[k+1]
      const ax = Math.hypot(hr[k], hi[k]), ay = Math.hypot(hr[k + 1], hi[k + 1]);
      let c, sr, si;
      if (ay === 0) { c = 1; sr = 0; si = 0; } else if (ax === 0) { c = 0; sr = hr[k + 1] / ay; si = -hi[k + 1] / ay; } else {
        const nr = Math.hypot(ax, ay); c = ax / nr; const pr = hr[k] / ax, pi = hi[k] / ax;
        sr = (pr * hr[k + 1] + pi * hi[k + 1]) / nr; si = (pi * hr[k + 1] - pr * hi[k + 1]) / nr;
      }
      cs.push(c); sn.push([sr, si]);
      const ar = hr[k], ai = hi[k], br = hr[k + 1], bi = hi[k + 1];
      hr[k] = c * ar + sr * br - si * bi; hi[k] = c * ai + sr * bi + si * br; hr[k + 1] = 0; hi[k + 1] = 0;
      const gr = g.re[k], gi = g.im[k];
      g.re[k] = c * gr; g.im[k] = c * gi;
      g.re[k + 1] = -(sr * gr + si * gi); g.im[k + 1] = -(sr * gi - si * gr);
      Hr.push(hr); Hi.push(hi);
      const res = Math.hypot(g.re[k + 1], g.im[k + 1]);
      resvec.push(res);
      if (res / bn <= tol || hn === 0) { k++; break; }
    }
    // solve upper triangular H y = g
    const yr = new Float64Array(k), yi = new Float64Array(k);
    for (let i = k - 1; i >= 0; i--) {
      let sr = g.re[i], si = g.im[i];
      for (let j = i + 1; j < k; j++) { const hr = Hr[j][i], hi = Hi[j][i]; sr -= hr * yr[j] - hi * yi[j]; si -= hr * yi[j] + hi * yr[j]; }
      const [qr, qi] = cdiv(sr, si, Hr[i][i], Hi[i][i]); yr[i] = qr; yi[i] = qi;
    }
    for (let j = 0; j < k; j++) axpy(x, yr[j], yi[j], Vb[j]);
    const trueRes = vnorm(vsub(b, A(x))) / nb0;
    if (trueRes <= tol) return { x, flag: 0, relres: trueRes, iter: [outer, k], resvec };
    r = M(vsub(b, A(x)));
    if (outer === maxit) return { x, flag: 1, relres: trueRes, iter: [outer, k], resvec };
  }
  return { x, flag: 1, relres: vnorm(vsub(b, A(x))) / nb0, iter: [maxit, restart], resvec };
}

function minresCore(A, b, n, tol, maxit, prec, x0) {
  // Paige-Saunders MINRES (real symmetric / Hermitian), preconditioner must be SPD.
  const M = (v) => (prec ? prec(v) : v);
  let x = x0 || vz(n);
  const nb = vnorm(b) || 1;
  if (vnorm(b) === 0) return { x: vz(n), flag: 0, relres: 0, iter: 0, resvec: [0] };
  let r1 = vsub(b, A(x));
  let y = M(r1);
  let beta1 = Math.sqrt(Math.max(0, vdot(r1, y)[0]));
  const resvec = [vnorm(r1)];
  if (resvec[0] / nb <= tol) return { x, flag: 0, relres: resvec[0] / nb, iter: 0, resvec };
  if (!(beta1 > 0)) return { x, flag: 2, relres: resvec[0] / nb, iter: 0, resvec };
  let oldb = 0, beta = beta1, dbar = 0, epsln = 0, phibar = beta1;
  let cs = -1, sn = 0;
  let w = vz(n), w2 = vz(n), r2 = vcopy(r1);
  let best = { x: vcopy(x), rel: resvec[0] / nb, it: 0 };
  for (let it = 1; it <= maxit; it++) {
    const s = 1 / beta;
    const v = vscale(y, s);
    y = A(v);
    if (it >= 2) axpy(y, -beta / oldb, 0, r1);
    const alfa = vdot(v, y)[0];
    axpy(y, -alfa / beta, 0, r2);
    r1 = r2; r2 = y;
    y = M(r2);
    oldb = beta;
    beta = Math.sqrt(Math.max(0, vdot(r2, y)[0]));
    const oldeps = epsln;
    const delta = cs * dbar + sn * alfa;
    const gbar = sn * dbar - cs * alfa;
    epsln = sn * beta; dbar = -cs * beta;
    const gamma = Math.max(Math.hypot(gbar, beta), EPS);
    cs = gbar / gamma; sn = beta / gamma;
    const phi = cs * phibar; phibar = sn * phibar;
    const w1 = w2; w2 = w;
    w = vscale(v, 1 / gamma); axpy(w, -oldeps / gamma, 0, w1); axpy(w, -delta / gamma, 0, w2);
    axpy(x, phi, 0, w);
    const rn = Math.abs(phibar);
    resvec.push(rn);
    if (rn / nb < best.rel) best = { x: vcopy(x), rel: rn / nb, it };
    if (rn / nb <= tol || beta === 0) {
      const tr = vnorm(vsub(b, A(x))) / nb;
      if (tr <= tol || beta === 0) return { x, flag: 0, relres: tr, iter: it, resvec };
    }
  }
  return { x: best.x, flag: 1, relres: vnorm(vsub(b, A(best.x))) / nb, iter: best.it, resvec };
}

function lsqrProper(A, b, m, n, tol, maxit, x0) {
  let x = x0 ? vcopy(x0) : vz(n);
  const nb = vnorm(b) || 1;
  let u = vsub(b, A(x, false));
  let beta = vnorm(u);
  const resvec = [beta];
  if (beta / nb <= tol) return { x, flag: 0, relres: beta / nb, iter: 0, resvec };
  u = vscale(u, 1 / beta);
  let v = A(u, true); let alpha = vnorm(v);
  if (alpha === 0) return { x, flag: 0, relres: beta / nb, iter: 0, resvec };
  v = vscale(v, 1 / alpha);
  let w = vcopy(v), phibar = beta, rhobar = alpha;
  let best = { x: vcopy(x), rel: beta / nb, it: 0 };
  for (let it = 1; it <= maxit; it++) {
    const Av = A(v, false); axpy(Av, -alpha, 0, u); u = Av;
    beta = vnorm(u);
    if (beta > 0) {
      u = vscale(u, 1 / beta);
      const Atu = A(u, true); axpy(Atu, -beta, 0, v); v = Atu;
      alpha = vnorm(v); if (alpha > 0) v = vscale(v, 1 / alpha);
    }
    const rho = Math.hypot(rhobar, beta);
    const c = rhobar / rho, s = beta / rho;
    const theta = s * alpha; rhobar = -c * alpha;
    const phi = c * phibar; phibar = s * phibar;
    axpy(x, phi / rho, 0, w);
    const wn = vcopy(v); axpy(wn, -theta / rho, 0, w); w = wn;
    const rn = Math.abs(phibar); resvec.push(rn);
    if (rn / nb < best.rel) best = { x: vcopy(x), rel: rn / nb, it };
    if (rn / nb <= tol) return { x, flag: 0, relres: rn / nb, iter: it, resvec };
    // normal-equation residual criterion (least squares)
    if (Math.abs(phibar * alpha * c) <= tol * nb * 1e-3 || alpha === 0) return { x, flag: 0, relres: rn / nb, iter: it, resvec };
  }
  return { x: best.x, flag: 1, relres: best.rel, iter: best.it, resvec };
}

function runIter(fn, args, nargout, ctx, kind) {
  if (args.length < 2) fail(`${fn}:notEnoughInputs`, 'Not enough input arguments.');
  const p = iterArgs(args, fn, kind === 'gmres');
  const n = p.n;
  const Aop = makeOp(args[0], ctx, n, fn, kind === 'lsqr');
  if (!isFuncHandle(args[0]) && !isText(args[0]) && kind !== 'lsqr') {
    const d = args[0].dims; if (d[0] !== n || d[1] !== n) fail(`${fn}:dimagree`, 'A must be a square matrix of size length(b).');
  }
  const prec = kind === 'lsqr' ? null : makePrec(p.M1, p.M2, ctx, n);
  const x0 = p.x0 ? fromVal(p.x0, kind === 'lsqr' ? (isFuncHandle(args[0]) ? dbl(p.x0, fn).re.length : args[0].dims[1]) : n) : null;
  let r;
  if (kind === 'pcg') r = pcgCore(Aop, p.b, n, p.tol, p.maxit ?? Math.min(n, 20), prec, x0);
  else if (kind === 'bicgstab') r = bicgstabCore(Aop, p.b, n, p.tol, p.maxit ?? Math.min(n, 20), prec, x0);
  else if (kind === 'cgs') r = cgsCore(Aop, p.b, n, p.tol, p.maxit ?? Math.min(n, 20), prec, x0);
  else if (kind === 'minres') r = minresCore(Aop, p.b, n, p.tol, p.maxit ?? Math.min(n, 20), prec, x0);
  else if (kind === 'gmres') {
    const restart = p.restart == null || p.restart > n ? n : Math.max(1, p.restart);
    const maxit = p.maxit ?? Math.min(Math.ceil(n / restart), 10);
    r = gmresCore(Aop, p.b, n, restart, p.tol, maxit, prec, x0);
  } else {
    const ncols = isFuncHandle(args[0]) || isText(args[0]) ? null : args[0].dims[1];
    if (ncols == null) fail('lsqr:functionHandle', 'lsqr with a function handle needs a matrix; pass the matrix.');
    r = lsqrProper(Aop, p.b, n, ncols, p.tol, p.maxit ?? Math.min(n, 20), x0);
  }
  return finishIter(fn, nargout, ctx, r);
}

// ---------------------------------------------------------------- incomplete factorizations

function rowsOf(S) {
  const [m, n] = S.dims; const rows = Array.from({ length: m }, () => new Map());
  for (let j = 0; j < n; j++) for (let p = S.colPtr[j]; p < S.colPtr[j + 1]; p++) rows[S.rowIdx[p]].set(j, S.re[p]);
  return rows;
}
function fromRows(rows, m, n) {
  const R = [], Cc = [], Vv = [];
  rows.forEach((row, i) => { for (const [j, v] of row) { R.push(i); Cc.push(j); Vv.push(v); } });
  return spFromTriplets(m, n, Int32Array.from(R), Int32Array.from(Cc), Float64Array.from(Vv));
}

/** ILU (IKJ variant): type 'nofill' keeps the pattern of A; 'crout'/'ilutp' drop by droptol. */
function iluCore(S, type, droptol, milu) {
  const n = S.dims[0];
  const rows = rowsOf(S);
  const colNorm = new Float64Array(n);
  for (let j = 0; j < n; j++) { let s = 0; for (let p = S.colPtr[j]; p < S.colPtr[j + 1]; p++) s = Math.hypot(s, S.re[p]); colNorm[j] = s; }
  const U = Array.from({ length: n }, () => new Map());
  const L = Array.from({ length: n }, () => new Map());
  for (let i = 0; i < n; i++) {
    const w = new Map(rows[i]);
    const pattern = rows[i];
    const keys = () => Array.from(w.keys()).filter((k) => k < i).sort((a, b) => a - b);
    let ks = keys(); const done = new Set();
    while (ks.length) {
      const k = ks[0]; done.add(k);
      const ukk = U[k].get(k);
      if (!ukk) { w.delete(k); ks = keys().filter((x) => !done.has(x)); continue; }
      let lik = w.get(k) / ukk;
      if (type !== 'nofill' && Math.abs(lik) < droptol * colNorm[k]) { w.delete(k); if (milu) w.set(i, (w.get(i) || 0) + 0); ks = keys().filter((x) => !done.has(x)); continue; }
      w.set(k, lik);
      for (const [j, u] of U[k]) {
        if (j <= k) continue;
        const val = (w.get(j) || 0) - lik * u;
        if (type === 'nofill' && !pattern.has(j)) { if (milu) w.set(i, (w.get(i) || 0) - lik * u); continue; }
        w.set(j, val);
      }
      ks = keys().filter((x) => !done.has(x));
    }
    for (const [j, v] of w) {
      if (j < i) { if (v !== 0) L[i].set(j, v); }
      else {
        if (type !== 'nofill' && j !== i && Math.abs(v) < droptol * colNorm[j]) continue;
        if (v !== 0 || j === i) U[i].set(j, v);
      }
    }
    if (!U[i].get(i)) fail('ilu:zeroPivot', `Encountered a pivot equal to zero at row ${i + 1}.`);
    L[i].set(i, 1);
  }
  return { L: fromRows(L, n, n), U: fromRows(U, n, n) };
}

/** Incomplete Cholesky: 'nofill' (IC(0)) or 'ict' with droptol. Returns lower L. */
function icholCore(S, type, droptol, diagcomp) {
  const n = S.dims[0];
  // lower triangle by columns as maps
  const cols = Array.from({ length: n }, () => new Map());
  for (let j = 0; j < n; j++) for (let p = S.colPtr[j]; p < S.colPtr[j + 1]; p++) { const i = S.rowIdx[p]; if (i >= j) cols[j].set(i, S.re[p] * (i === j ? 1 + diagcomp : 1)); }
  const pattern = cols.map((c) => new Set(c.keys()));
  const Lc = Array.from({ length: n }, () => new Map());
  const rowsL = Array.from({ length: n }, () => []); // rowsL[i] = list of columns k<i with L(i,k) != 0
  const colNorm = new Float64Array(n);
  for (let j = 0; j < n; j++) { let s = 0; for (const v of cols[j].values()) s = Math.hypot(s, v); colNorm[j] = s; }
  for (let j = 0; j < n; j++) {
    const w = new Map(cols[j]);
    for (const k of rowsL[j]) {
      const ljk = Lc[k].get(j);
      for (const [i, lik] of Lc[k]) {
        if (i < j) continue;
        if (type === 'nofill' && !pattern[j].has(i)) continue;
        w.set(i, (w.get(i) || 0) - lik * ljk);
      }
    }
    const d = w.get(j) || 0;
    if (!(d > 0)) fail('ichol:notPositivePivot', `Encountered a nonpositive pivot at column ${j + 1}.`);
    const ljj = Math.sqrt(d);
    Lc[j].set(j, ljj);
    for (const [i, v] of w) {
      if (i <= j) continue;
      const l = v / ljj;
      if (type === 'ict' && Math.abs(l) < droptol * colNorm[j]) continue;
      if (l !== 0) { Lc[j].set(i, l); rowsL[i].push(j); }
    }
  }
  const R = [], Cc = [], Vv = [];
  Lc.forEach((col, j) => { for (const [i, v] of col) { R.push(i); Cc.push(j); Vv.push(v); } });
  return spFromTriplets(n, n, Int32Array.from(R), Int32Array.from(Cc), Float64Array.from(Vv));
}

/** Reverse Cuthill-McKee ordering (0-based permutation). */
function rcm(S) {
  const n = S.dims[0];
  const adj = Array.from({ length: n }, () => new Set());
  for (let j = 0; j < S.dims[1]; j++) for (let p = S.colPtr[j]; p < S.colPtr[j + 1]; p++) { const i = S.rowIdx[p]; if (i !== j && i < n && j < n) { adj[i].add(j); adj[j].add(i); } }
  const deg = adj.map((s) => s.size);
  const visited = new Uint8Array(n); const order = [];
  while (order.length < n) {
    let start = -1;
    for (let i = 0; i < n; i++) if (!visited[i] && (start < 0 || deg[i] < deg[start])) start = i;
    // pseudo-peripheral node: a few BFS sweeps
    for (let sweep = 0; sweep < 3; sweep++) {
      const lvl = new Int32Array(n).fill(-1); lvl[start] = 0; const q = [start]; let last = start;
      for (let h = 0; h < q.length; h++) { const u = q[h]; for (const v of adj[u]) if (lvl[v] < 0 && !visited[v]) { lvl[v] = lvl[u] + 1; q.push(v); } }
      let far = start; for (const u of q) if (lvl[u] > lvl[far] || (lvl[u] === lvl[far] && deg[u] < deg[far])) far = u;
      if (far === last) break; start = far; last = far;
    }
    visited[start] = 1; const q = [start];
    for (let h = 0; h < q.length; h++) {
      const u = q[h]; order.push(u);
      const nb = Array.from(adj[u]).filter((v) => !visited[v]).sort((a, b) => deg[a] - deg[b] || a - b);
      for (const v of nb) { visited[v] = 1; q.push(v); }
    }
  }
  return order.reverse();
}

// ---------------------------------------------------------------- builtins

function toSparseArg(v, fn) {
  if (isSparse(v)) return v;
  return sparseFromDense(dbl(v, fn));
}
const idxVec = (v, fn, what) => { const t = dbl(v, fn, what); for (const x of t.re) if (!(Number.isInteger(x) && x >= 1)) fail(`${fn}:badSubscript`, `Index into matrix must be positive integers (${what}).`); return t.re; };

export const builtins = {
  sparse(args) {
    const a = args;
    if (a.length === 1) {
      if (isSparse(a[0])) return a[0];
      const t = toTensor(a[0]);
      if (!(isTensor(t))) fail('sparse:badInput', 'Input must be numeric or logical.');
      return sparseFromDense(t.cls === 'logical' ? t : dbl(t, 'sparse'));
    }
    if (a.length === 2) {
      const m = intArg(a[0], 'sparse', 'm'), n = intArg(a[1], 'sparse', 'n');
      return sparseMatrix(m, n, new Int32Array(n + 1), [], []);
    }
    if (a.length < 3) fail('sparse:notEnoughInputs', 'Not enough input arguments.');
    const I = idxVec(a[0], 'sparse', 'i'), J = idxVec(a[1], 'sparse', 'j');
    const vt = isSparse(a[2]) ? toTensor(a[2]) : a[2];
    const logical = isLogical(vt);
    const v = dbl(vt, 'sparse', 'v');
    const len = Math.max(I.length, J.length, v.re.length);
    for (const [arr, nm] of [[I, 'i'], [J, 'j'], [v.re, 'v']]) if (arr.length !== len && arr.length !== 1) fail('sparse:vectorsMustHaveSameLength', `Vectors must be the same length (${nm}).`);
    const get = (arr, k) => (arr.length === 1 ? arr[0] : arr[k]);
    let m, n;
    if (a.length >= 5) { m = intArg(a[3], 'sparse', 'm'); n = intArg(a[4], 'sparse', 'n'); }
    else { m = 0; n = 0; for (let k = 0; k < len; k++) { m = Math.max(m, get(I, k)); n = Math.max(n, get(J, k)); } }
    const rows = new Int32Array(len), cols = new Int32Array(len), re = new Float64Array(len), im = v.im ? new Float64Array(len) : null;
    for (let k = 0; k < len; k++) {
      const i = get(I, k), j = get(J, k);
      if (i > m || j > n) fail('sparse:indexExceedsDims', 'Index exceeds array dimensions.');
      rows[k] = i - 1; cols[k] = j - 1; re[k] = get(v.re, k); if (im) im[k] = get(v.im, k);
    }
    return spFromTriplets(m, n, rows, cols, re, im, logical ? 'logical' : 'double');
  },
  full(args) {
    const v = args[0];
    if (v == null) fail('full:notEnoughInputs', 'Not enough input arguments.');
    if (isSparse(v)) return toTensor(v);
    return v;
  },
  issparse(args) { return lscalar(isSparse(args[0])); },
  nonzeros(args) {
    const v = args[0];
    if (isSparse(v)) { const f = spFind(v); return out([f.re.length, 1], f.re, f.im, v.cls === 'logical' ? 'double' : 'double'); }
    const t = dbl(v, 'nonzeros'); const re = [], im = [];
    for (let i = 0; i < t.re.length; i++) if (t.re[i] !== 0 || (t.im && t.im[i] !== 0)) { re.push(t.re[i]); im.push(t.im ? t.im[i] : 0); }
    return out([re.length, 1], re, t.im ? im : null, v.cls === 'single' ? 'single' : 'double');
  },
  nzmax(args) {
    const v = args[0];
    if (isSparse(v)) return scalar(Math.max(1, spNnz(v)));
    const t = dbl(v, 'nzmax'); return scalar(t.re.length);
  },
  spones(args) {
    const S = toSparseArg(args[0], 'spones');
    return spMap(S, () => [1, 0]);
  },
  speye(args) {
    let m, n;
    if (args.length === 0) { m = 1; n = 1; }
    else if (args.length === 1) { const t = dbl(args[0], 'speye'); if (t.re.length === 2) { m = t.re[0]; n = t.re[1]; } else { m = n = intArg(args[0], 'speye', 'n'); } }
    else { m = intArg(args[0], 'speye', 'm'); n = intArg(args[1], 'speye', 'n'); }
    const k = Math.min(m, n); const r = Int32Array.from({ length: k }, (_, i) => i);
    return spFromTriplets(m, n, r, r, new Float64Array(k).fill(1));
  },
  spalloc(args) {
    const m = intArg(args[0], 'spalloc', 'm'), n = intArg(args[1], 'spalloc', 'n');
    return sparseMatrix(m, n, new Int32Array(n + 1), [], []);
  },
  spdiags(args, nargout) {
    if (args.length <= 2 && args.length >= 1) {
      // extraction
      const A = toTensor(toSparseArg(args[0], 'spdiags'));
      const [m, n] = A.dims;
      let d;
      if (args.length === 2) d = Array.from(dbl(args[1], 'spdiags').re);
      else {
        d = [];
        for (let k = -(m - 1); k <= n - 1; k++) {
          let nz = false;
          for (let i = Math.max(0, -k); i < Math.min(m, n - k); i++) if (A.re[i + (i + k) * m] !== 0 || (A.im && A.im[i + (i + k) * m] !== 0)) { nz = true; break; }
          if (nz) d.push(k);
        }
      }
      const rowsB = Math.min(m, n); const p = d.length;
      const re = new Float64Array(rowsB * p), im = A.im ? new Float64Array(rowsB * p) : null;
      d.forEach((k, c) => {
        for (let i = Math.max(0, -k); i < Math.min(m, n - k); i++) {
          const j = i + k; const r = m >= n ? j : i;
          if (r < rowsB) { re[r + c * rowsB] = A.re[i + j * m]; if (im) im[r + c * rowsB] = A.im[i + j * m]; }
        }
      });
      const B = out([rowsB, p], re, im);
      return nargout > 1 ? [B, out([p, 1], d)] : B;
    }
    const B = dbl(args[0], 'spdiags', 'B');
    const d = Array.from(dbl(args[1], 'spdiags', 'd').re);
    let m, n, base = null;
    if (args.length === 3) { base = toSparseArg(args[2], 'spdiags'); [m, n] = base.dims; }
    else { m = intArg(args[2], 'spdiags', 'm'); n = intArg(args[3], 'spdiags', 'n'); }
    const bm = B.dims[0], bn = B.dims[1];
    const rows = [], cols = [], re = [], im = [];
    const set = new Set();
    d.forEach((k, c) => {
      const col = bn === 1 && d.length > 1 ? 0 : c;
      if (m >= n) {
        for (let j = Math.max(0, k); j < Math.min(n, m + k); j++) { const i = j - k; const r = j; const v = r < bm ? B.re[r + col * bm] : 0; rows.push(i); cols.push(j); re.push(v); im.push(B.im && r < bm ? B.im[r + col * bm] : 0); set.add(i + ',' + j); }
      } else {
        for (let i = Math.max(0, -k); i < Math.min(m, n - k); i++) { const j = i + k; const v = i < bm ? B.re[i + col * bm] : 0; rows.push(i); cols.push(j); re.push(v); im.push(B.im && i < bm ? B.im[i + col * bm] : 0); set.add(i + ',' + j); }
      }
    });
    if (base) {
      const f = spFind(base);
      for (let k = 0; k < f.rows.length; k++) if (!set.has(f.rows[k] + ',' + f.cols[k])) { rows.push(f.rows[k]); cols.push(f.cols[k]); re.push(f.re[k]); im.push(f.im ? f.im[k] : 0); }
    }
    return spFromTriplets(m, n, Int32Array.from(rows), Int32Array.from(cols), Float64Array.from(re), B.im || (base && base.im) ? Float64Array.from(im) : null);
  },
  spfun(args, nargout, ctx) {
    const f = args[0]; const S = toSparseArg(args[1], 'spfun');
    const fi = spFind(S);
    const r = ctx.call(isText(f) ? toStr(f) : f, [out([fi.re.length, 1], fi.re, fi.im)], 1)[0];
    const t = dbl(r, 'spfun');
    if (t.re.length !== fi.re.length) fail('spfun:badFunction', 'The function must return an array of the same size as its input.');
    return spFromTriplets(S.dims[0], S.dims[1], fi.rows, fi.cols, t.re, t.im);
  },
  spconvert(args) {
    const D = dbl(args[0], 'spconvert'); const [r, c] = D.dims;
    if (c !== 3 && c !== 4) fail('spconvert:badInput', 'Input must have 3 or 4 columns.');
    let m = 0, n = 0;
    const rows = [], cols = [], re = [], im = [];
    for (let k = 0; k < r; k++) {
      const i = D.re[k], j = D.re[k + r]; m = Math.max(m, i); n = Math.max(n, j);
      const v = D.re[k + 2 * r], w = c === 4 ? D.re[k + 3 * r] : 0;
      if (v === 0 && w === 0) continue;
      rows.push(i - 1); cols.push(j - 1); re.push(v); im.push(w);
    }
    return spFromTriplets(m, n, Int32Array.from(rows), Int32Array.from(cols), Float64Array.from(re), c === 4 ? Float64Array.from(im) : null);
  },
  sprand(args, nargout, ctx) { return sprandImpl(args, ctx, 'u'); },
  sprandn(args, nargout, ctx) { return sprandImpl(args, ctx, 'n'); },
  sprandsym(args, nargout, ctx) {
    if (args.length === 1 && isSparse(args[0])) {
      const S = args[0]; const f = spFind(S); const rows = [], cols = [], vals = [];
      for (let k = 0; k < f.rows.length; k++) if (f.rows[k] >= f.cols[k]) { const v = nrand(ctx); rows.push(f.rows[k]); cols.push(f.cols[k]); vals.push(v); if (f.rows[k] !== f.cols[k]) { rows.push(f.cols[k]); cols.push(f.rows[k]); vals.push(v); } }
      return spFromTriplets(S.dims[0], S.dims[1], Int32Array.from(rows), Int32Array.from(cols), Float64Array.from(vals));
    }
    const n = intArg(args[0], 'sprandsym', 'n'); const dens = args.length > 1 ? scal(args[1], 'sprandsym', 'density') : 0.1;
    const target = Math.round(dens * n * n);
    const rows = [], cols = [], vals = [];
    let placed = 0, guard = 0;
    const seen = new Set();
    while (placed < target && guard++ < 10 * target + 10) {
      const i = Math.floor(urand(ctx) * n), j = Math.floor(urand(ctx) * n);
      const a = Math.max(i, j), b = Math.min(i, j); const key = a * n + b;
      if (seen.has(key)) continue; seen.add(key);
      const v = nrand(ctx);
      rows.push(a); cols.push(b); vals.push(v); placed++;
      if (a !== b) { rows.push(b); cols.push(a); vals.push(v); placed++; }
    }
    return spFromTriplets(n, n, Int32Array.from(rows), Int32Array.from(cols), Float64Array.from(vals));
  },
  condest(args, nargout) {
    const A = args[0];
    const d = A.dims; if (d.length > 2 || d[0] !== d[1]) fail('condest:notSquare', 'Matrix must be square.');
    const n = d[0]; if (n === 0) return scalar(0);
    const S = toSparseArg(A, 'condest');
    if (S.im) {
      const t = toTensor(S); const Ac = toC({ m: n, n, re: t.re, im: t.im });
      const ctxNo = null; void ctxNo;
      return scalar(1 / rcondDenseC(Ac));
    }
    const F = spLU(S);
    const rc = spRcond(S, F);
    void nargout;
    return scalar(rc === 0 ? Infinity : 1 / rc);
  },
  pcg(args, nargout, ctx) { return runIter('pcg', args, nargout, ctx, 'pcg'); },
  gmres(args, nargout, ctx) { return runIter('gmres', args, nargout, ctx, 'gmres'); },
  bicgstab(args, nargout, ctx) { return runIter('bicgstab', args, nargout, ctx, 'bicgstab'); },
  cgs(args, nargout, ctx) { return runIter('cgs', args, nargout, ctx, 'cgs'); },
  minres(args, nargout, ctx) { return runIter('minres', args, nargout, ctx, 'minres'); },
  lsqr(args, nargout, ctx) { return runIter('lsqr', args, nargout, ctx, 'lsqr'); },
  ilu(args, nargout) {
    const S = args[0];
    if (!isSparse(S)) fail('ilu:sparse', 'A must be a sparse square matrix.');
    if (S.dims[0] !== S.dims[1]) fail('ilu:notSquare', 'A must be a sparse square matrix.');
    if (S.im) fail('ilu:complex', 'ilu supports real matrices only.');
    const o = args[1];
    let type = 'nofill', droptol = 0, milu = false;
    if (o != null) {
      if (!isStruct(o)) fail('ilu:badOptions', 'Options must be a structure.');
      const t = field(o, 'type'); if (t) type = toStr(t).toLowerCase();
      const dt = field(o, 'droptol'); if (dt) droptol = dt.re[0];
      const mi = field(o, 'milu'); if (mi) milu = toStr(mi).toLowerCase() !== 'off';
      if (!['nofill', 'crout', 'ilutp'].includes(type)) fail('ilu:badType', "type must be 'nofill', 'crout' or 'ilutp'.");
    }
    const { L, U } = iluCore(S, type, droptol, milu);
    if (nargout <= 1) return spAdd(spAdd(L, U), speyeN(S.dims[0]), 1, -1);
    const res = [L, U];
    if (nargout >= 3) res.push(speyeN(S.dims[0]));
    return res;
  },
  ichol(args) {
    const S = args[0];
    if (!isSparse(S)) fail('ichol:sparse', 'A must be a sparse square matrix.');
    if (S.dims[0] !== S.dims[1]) fail('ichol:notSquare', 'A must be a sparse square matrix.');
    if (S.im) fail('ichol:complex', 'ichol supports real matrices only.');
    const o = args[1];
    let type = 'nofill', droptol = 0, diagcomp = 0, shape = 'lower';
    if (o != null) {
      if (!isStruct(o)) fail('ichol:badOptions', 'Options must be a structure.');
      const t = field(o, 'type'); if (t) type = toStr(t).toLowerCase();
      const dt = field(o, 'droptol'); if (dt) droptol = dt.re[0];
      const dc = field(o, 'diagcomp'); if (dc) diagcomp = dc.re[0];
      const sh = field(o, 'shape'); if (sh) shape = toStr(sh).toLowerCase();
      if (!['nofill', 'ict'].includes(type)) fail('ichol:badType', "type must be 'nofill' or 'ict'.");
    }
    const L = icholCore(S, type, droptol, diagcomp);
    return shape === 'upper' ? spTranspose(L) : L;
  },
  symrcm(args) {
    const S = toSparseArg(args[0], 'symrcm');
    const p = rcm(S);
    return out([1, p.length], Float64Array.from(p, (x) => x + 1));
  },
};

function speyeN(n) { const r = Int32Array.from({ length: n }, (_, i) => i); return spFromTriplets(n, n, r, r, new Float64Array(n).fill(1)); }

function rcondDenseC(A) {
  // 1-norm reciprocal condition via dense LU
  return rcondImpl(A);
}
function rcondImpl(A) { const F = _lu(A); return _rc(A, F); }

function sprandImpl(args, ctx, kind) {
  const gen = () => (kind === 'n' ? nrand(ctx) : urand(ctx));
  if (args.length === 1) {
    const S = toSparseArg(args[0], kind === 'n' ? 'sprandn' : 'sprand');
    return spMap(S, () => [gen(), 0]);
  }
  const fn = kind === 'n' ? 'sprandn' : 'sprand';
  const m = intArg(args[0], fn, 'm'), n = intArg(args[1], fn, 'n');
  const dens = args.length > 2 ? scal(args[2], fn, 'density') : 0.1;
  if (dens < 0 || dens > 1) fail(`${fn}:badDensity`, 'Density must be between 0 and 1.');
  const target = Math.min(m * n, Math.round(dens * m * n));
  const seen = new Set(); const rows = [], cols = [], vals = [];
  let guard = 0;
  while (rows.length < target && guard++ < 20 * target + 10) {
    const i = Math.floor(urand(ctx) * m), j = Math.floor(urand(ctx) * n);
    const key = i + j * m; if (seen.has(key)) continue; seen.add(key);
    let v = gen(); if (v === 0) v = Number.MIN_VALUE;
    rows.push(i); cols.push(j); vals.push(v);
  }
  return spFromTriplets(m, n, Int32Array.from(rows), Int32Array.from(cols), Float64Array.from(vals));
}

const IT_SYNTAX = (f) => [`x = ${f}(A, b)`, `x = ${f}(A, b, tol, maxit)`, `x = ${f}(A, b, tol, maxit, M1, M2, x0)`, `[x, flag, relres, iter, resvec] = ${f}(...)`];
export const help = {
  sparse: H('Create a sparse matrix.', '희소 행렬 생성.', ['S = sparse(A)', 'S = sparse(m, n)', 'S = sparse(i, j, v)', 'S = sparse(i, j, v, m, n)']),
  full: H('Convert a sparse matrix to a full (dense) matrix.', '희소 행렬을 일반(밀집) 행렬로 변환.', ['A = full(S)']),
  issparse: H('True for a sparse matrix.', '희소 행렬이면 참.', ['tf = issparse(S)']),
  nonzeros: H('Nonzero elements as a column vector.', '0이 아닌 원소를 열 벡터로.', ['v = nonzeros(A)']),
  nzmax: H('Storage allocated for nonzero elements.', '0이 아닌 원소를 위한 저장 공간 크기.', ['n = nzmax(S)']),
  spones: H('Replace nonzero sparse elements with ones.', '희소 행렬의 0이 아닌 원소를 1로 바꿈.', ['R = spones(S)']),
  speye: H('Sparse identity matrix.', '희소 단위 행렬.', ['S = speye(n)', 'S = speye(m, n)']),
  spalloc: H('Allocate an empty sparse matrix.', '빈 희소 행렬 할당.', ['S = spalloc(m, n, nz)']),
  spdiags: H('Extract or create sparse band and diagonal matrices.', '희소 대역/대각 행렬 추출 또는 생성.', ['[B, d] = spdiags(A)', 'B = spdiags(A, d)', 'S = spdiags(B, d, A)', 'S = spdiags(B, d, m, n)']),
  spfun: H('Apply a function to the nonzero elements of a sparse matrix.', '희소 행렬의 0이 아닌 원소에 함수 적용.', ['f = spfun(fun, S)']),
  spconvert: H('Import a sparse matrix from [i j v] rows.', '[i j v] 행에서 희소 행렬 만들기.', ['S = spconvert(D)']),
  sprand: H('Sparse uniformly distributed random matrix.', '희소 균등 분포 난수 행렬.', ['R = sprand(m, n, density)', 'R = sprand(S)']),
  sprandn: H('Sparse normally distributed random matrix.', '희소 정규 분포 난수 행렬.', ['R = sprandn(m, n, density)', 'R = sprandn(S)']),
  sprandsym: H('Sparse symmetric random matrix.', '희소 대칭 난수 행렬.', ['R = sprandsym(n, density)', 'R = sprandsym(S)']),
  condest: H('1-norm condition number estimate.', '1-노름 조건수 추정.', ['c = condest(A)']),
  pcg: H('Preconditioned conjugate gradients.', '전처리 켤레 기울기법.', IT_SYNTAX('pcg')),
  gmres: H('Generalized minimum residual method (with restarts).', '일반화 최소 잔차법 (재시작 포함).', ['x = gmres(A, b)', 'x = gmres(A, b, restart, tol, maxit, M1, M2, x0)', '[x, flag, relres, iter, resvec] = gmres(...)']),
  bicgstab: H('Biconjugate gradients stabilized method.', '안정화 쌍켤레 기울기법.', IT_SYNTAX('bicgstab')),
  cgs: H('Conjugate gradients squared method.', '제곱 켤레 기울기법.', IT_SYNTAX('cgs')),
  minres: H('Minimum residual method (symmetric matrices).', '최소 잔차법 (대칭 행렬).', IT_SYNTAX('minres')),
  lsqr: H('LSQR least-squares solver.', 'LSQR 최소제곱 풀이.', ['x = lsqr(A, b)', 'x = lsqr(A, b, tol, maxit)', '[x, flag, relres, iter, resvec] = lsqr(...)']),
  ilu: H('Incomplete LU factorization.', '불완전 LU 분해.', ['[L, U] = ilu(A)', '[L, U] = ilu(A, setup)', 'W = ilu(A, setup)']),
  ichol: H('Incomplete Cholesky factorization.', '불완전 촐레스키 분해.', ['L = ichol(A)', 'L = ichol(A, opts)']),
  symrcm: H('Symmetric reverse Cuthill-McKee ordering.', '대칭 역 Cuthill-McKee 순서.', ['r = symrcm(S)']),
};
void outMat; void optText; void isOpt; void tensor;
