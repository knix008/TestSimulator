// Generalized Schur (QZ) factorization of a matrix pencil (A, B):
// Q*A*Z = AA, Q*B*Z = BB with AA, BB upper triangular ('complex') or AA
// quasi upper triangular with 1x1 / 2x2 blocks ('real'), plus generalized
// eigenvectors. Hessenberg-triangular reduction and the QZ sweeps use Givens
// rotations only, so real data stays real in the 'real' variant.
import { EPS, fail, sqmat, outMat, optText, H, cdiv, csqrt } from './util.js';
import { cm, toC, ceye, normFro, hasNonFinite, allZero } from './kernels.js';

const cmulS = (ar, ai, br, bi) => [ar * br - ai * bi, ar * bi + ai * br];

/** Rotation [c s; -conj(s) c] with [c s; -conj(s) c] [f; g] = [r; 0]. */
function rotg(fr, fi, gr, gi) {
  const af = Math.hypot(fr, fi), ag = Math.hypot(gr, gi);
  if (ag === 0) return { c: 1, sr: 0, si: 0 };
  if (af === 0) return { c: 0, sr: gr / ag, si: -gi / ag };
  const nr = Math.hypot(af, ag), pr = fr / af, pi = fi / af;
  return { c: af / nr, sr: (pr * gr + pi * gi) / nr, si: (pi * gr - pr * gi) / nr };
}
/** Rows p, q ← G [row p; row q] over columns c0..c1-1. */
function rowRot(M, p, q, R, c0, c1) {
  const { c, sr, si } = R; const n = M.m, re = M.re, im = M.im;
  for (let j = c0; j < c1; j++) {
    const a = p + j * n, b = q + j * n;
    const ar = re[a], ai = im[a], br = re[b], bi = im[b];
    re[a] = c * ar + sr * br - si * bi; im[a] = c * ai + sr * bi + si * br;
    re[b] = -(sr * ar + si * ai) + c * br; im[b] = -(sr * ai - si * ar) + c * bi;
  }
}
/** Columns p, q: new_p = c*p - conj(s)*q, new_q = s*p + c*q over rows r0..r1-1. */
function colRot(M, p, q, R, r0, r1) {
  const { c, sr, si } = R; const n = M.m, re = M.re, im = M.im;
  for (let i = r0; i < r1; i++) {
    const a = i + p * n, b = i + q * n;
    const ur = re[a], ui = im[a], vr = re[b], vi = im[b];
    re[a] = c * ur - (sr * vr + si * vi); im[a] = c * ui - (sr * vi - si * vr);
    re[b] = sr * ur - si * ui + c * vr; im[b] = sr * ui + si * ur + c * vi;
  }
}
const at = (M, i, j) => [M.re[i + j * M.m], M.im[i + j * M.m]];
const zero = (M, i, j) => { M.re[i + j * M.m] = 0; M.im[i + j * M.m] = 0; };
const abs = (M, i, j) => Math.hypot(M.re[i + j * M.m], M.im[i + j * M.m]);
/** Column rotation on (p, q) that zeroes M(row, p). */
const colZero = (M, row, p, q) => { const [vr, vi] = at(M, row, q), [ur, ui] = at(M, row, p); return rotg(vr, vi, ur, ui); };

/** Eigenvalues of the 2x2 pencil at (k, k+1) with B upper triangular. */
function eig2(S, T, k) {
  const [a11r, a11i] = at(S, k, k), [a12r, a12i] = at(S, k, k + 1), [a21r, a21i] = at(S, k + 1, k), [a22r, a22i] = at(S, k + 1, k + 1);
  const [b11r, b11i] = at(T, k, k), [b12r, b12i] = at(T, k, k + 1), [b22r, b22i] = at(T, k + 1, k + 1);
  const [qar, qai] = cmulS(b11r, b11i, b22r, b22i);
  const t1 = cmulS(a11r, a11i, b22r, b22i), t2 = cmulS(a22r, a22i, b11r, b11i), t3 = cmulS(a21r, a21i, b12r, b12i);
  const qbr = -(t1[0] + t2[0] - t3[0]), qbi = -(t1[1] + t2[1] - t3[1]);
  const u1 = cmulS(a11r, a11i, a22r, a22i), u2 = cmulS(a12r, a12i, a21r, a21i);
  const qcr = u1[0] - u2[0], qci = u1[1] - u2[1];
  const [bbr, bbi] = cmulS(qbr, qbi, qbr, qbi), [acr, aci] = cmulS(qar, qai, qcr, qci);
  const [dr, di] = csqrt(bbr - 4 * acr, bbi - 4 * aci);
  const disc = bbr - 4 * acr; // real part, sign tells real/complex for real data
  const r1 = cdiv(-qbr + dr, -qbi + di, 2 * qar, 2 * qai), r2 = cdiv(-qbr - dr, -qbi - di, 2 * qar, 2 * qai);
  return { r1, r2, disc };
}
/** Triangularizes the 2x2 block (k, k+1) for eigenvalue lam: column rotation from the eigenvector, then a row rotation. */
function split2(S, T, QH, Z, k, lam, colRows) {
  const n = S.m;
  const [a11r, a11i] = at(S, k, k), [a12r, a12i] = at(S, k, k + 1), [a21r, a21i] = at(S, k + 1, k), [a22r, a22i] = at(S, k + 1, k + 1);
  const [b11r, b11i] = at(T, k, k), [b12r, b12i] = at(T, k, k + 1), [b22r, b22i] = at(T, k + 1, k + 1);
  const [lr, li] = lam;
  const m = (ar, ai, br, bi) => { const [x, y] = cmulS(lr, li, br, bi); return [ar - x, ai - y]; };
  const M11 = m(a11r, a11i, b11r, b11i), M12 = m(a12r, a12i, b12r, b12i), M21 = [a21r, a21i], M22 = m(a22r, a22i, b22r, b22i);
  const n1 = Math.hypot(...M11, ...M12), n2 = Math.hypot(...M21, ...M22);
  // null vector of the dominant row [m1 m2] is [m2; -m1]
  let v1, v2;
  if (n1 >= n2) { v1 = M12; v2 = [-M11[0], -M11[1]]; } else { v1 = M22; v2 = [-M21[0], -M21[1]]; }
  const nv = Math.hypot(...v1, ...v2);
  if (nv === 0) return;
  const a1 = Math.hypot(...v1);
  const ph = a1 === 0 ? [1, 0] : [v1[0] / a1, v1[1] / a1];
  // w = v / phase; c = |v1| / nv, s = -conj(w2)
  const [w2r, w2i] = cmulS(v2[0], v2[1], ph[0], -ph[1]);
  const R = { c: a1 / nv, sr: -w2r / nv, si: w2i / nv };
  colRot(S, k, k + 1, R, 0, colRows); colRot(T, k, k + 1, R, 0, colRows); colRot(Z, k, k + 1, R, 0, Z.m);
  const [x, y] = at(T, k, k), [u, w] = at(T, k + 1, k);
  const G = rotg(x, y, u, w);
  rowRot(S, k, k + 1, G, k, n); rowRot(T, k, k + 1, G, k, n); rowRot(QH, k, k + 1, G, 0, QH.n);
  zero(S, k + 1, k); zero(T, k + 1, k);
}

function qzCore(A0, B0, real) {
  const n = A0.n;
  const A = toC(A0), B = toC(B0), QH = ceye(n), Z = ceye(n);
  // B → upper triangular
  for (let j = 0; j < n - 1; j++) for (let i = n - 1; i > j; i--) {
    const [fr, fi] = at(B, i - 1, j), [gr, gi] = at(B, i, j);
    if (gr === 0 && gi === 0) continue;
    const R = rotg(fr, fi, gr, gi);
    rowRot(B, i - 1, i, R, j, n); rowRot(A, i - 1, i, R, 0, n); rowRot(QH, i - 1, i, R, 0, n); zero(B, i, j);
  }
  // A → upper Hessenberg, keeping B triangular
  for (let j = 0; j < n - 2; j++) for (let i = n - 1; i >= j + 2; i--) {
    const [fr, fi] = at(A, i - 1, j), [gr, gi] = at(A, i, j);
    if (gr === 0 && gi === 0) continue;
    const R = rotg(fr, fi, gr, gi);
    rowRot(A, i - 1, i, R, j, n); rowRot(B, i - 1, i, R, i - 1, n); rowRot(QH, i - 1, i, R, 0, n); zero(A, i, j);
    const C = colZero(B, i, i - 1, i);
    colRot(B, i - 1, i, C, 0, i + 1); colRot(A, i - 1, i, C, 0, n); colRot(Z, i - 1, i, C, 0, n); zero(B, i, i - 1);
  }
  const nA = normFro(A) || 1, nB = normFro(B) || 1;
  let hi = n - 1, iter = 0, total = 0;
  const chase = (j, l) => {
    // move the zero B(j,j) down to B(hi,hi), then deflate an infinite eigenvalue
    for (let k = j; k < hi; k++) {
      const [fr, fi] = at(B, k, k + 1), [gr, gi] = at(B, k + 1, k + 1);
      const R = rotg(fr, fi, gr, gi);
      rowRot(B, k, k + 1, R, k + 1, n); rowRot(A, k, k + 1, R, Math.max(k - 1, 0), n); rowRot(QH, k, k + 1, R, 0, n);
      zero(B, k + 1, k + 1);
      if (k > l) {
        const C = colZero(A, k + 1, k - 1, k);
        colRot(A, k - 1, k, C, 0, n); colRot(B, k - 1, k, C, 0, n); colRot(Z, k - 1, k, C, 0, n); zero(A, k + 1, k - 1);
      }
    }
    const C = colZero(A, hi, hi - 1, hi);
    colRot(A, hi - 1, hi, C, 0, n); colRot(B, hi - 1, hi, C, 0, n); colRot(Z, hi - 1, hi, C, 0, n); zero(A, hi, hi - 1);
  };
  const single = (l) => {
    let mr, mi;
    const [ahr, ahi] = at(A, hi, hi), [bhr, bhi] = at(B, hi, hi);
    if (iter % 10 === 0) {
      [mr, mi] = cdiv(ahr, ahi, bhr, bhi);
      mr += abs(A, hi, hi - 1) / (abs(B, hi - 1, hi - 1) || 1);
    } else {
      const { r1, r2 } = eig2(A, B, hi - 1);
      const [er, ei] = cdiv(ahr, ahi, bhr, bhi);
      const d1 = Math.hypot(r1[0] - er, r1[1] - ei), d2 = Math.hypot(r2[0] - er, r2[1] - ei);
      [mr, mi] = d1 <= d2 ? r1 : r2;
      if (!Number.isFinite(mr) || !Number.isFinite(mi)) [mr, mi] = [er, ei];
    }
    const [allr, alli] = at(A, l, l), [bllr, blli] = at(B, l, l);
    const [pr, pi] = cmulS(mr, mi, bllr, blli);
    let xr = allr - pr, xi = alli - pi;
    let [yr, yi] = at(A, l + 1, l);
    for (let k = l; k < hi; k++) {
      if (k > l) { [xr, xi] = at(A, k, k - 1); [yr, yi] = at(A, k + 1, k - 1); }
      const R = rotg(xr, xi, yr, yi);
      rowRot(A, k, k + 1, R, k > l ? k - 1 : l, n); rowRot(B, k, k + 1, R, k, n); rowRot(QH, k, k + 1, R, 0, n);
      if (k > l) zero(A, k + 1, k - 1);
      const C = colZero(B, k + 1, k, k + 1);
      const rows = Math.min(k + 2, hi) + 1;
      colRot(A, k, k + 1, C, 0, rows); colRot(B, k, k + 1, C, 0, k + 2); colRot(Z, k, k + 1, C, 0, n); zero(B, k + 1, k);
    }
  };
  const double = (l) => {
    const a = (i, j) => A.re[i + j * n], b = (i, j) => B.re[i + j * n];
    const i11 = 1 / b(l, l), i22 = 1 / b(l + 1, l + 1), i12 = -b(l, l + 1) * i11 * i22;
    const C11 = a(l, l) * i11, C12 = a(l, l) * i12 + a(l, l + 1) * i22;
    const C21 = a(l + 1, l) * i11, C22 = a(l + 1, l) * i12 + a(l + 1, l + 1) * i22;
    const C32 = a(l + 2, l + 1) * i22;
    const m0 = hi - 2, m1 = hi - 1;
    const t11 = b(m0, m0), t12 = b(m0, m1), t13 = b(m0, hi), t22 = b(m1, m1), t23 = b(m1, hi), t33 = b(hi, hi);
    const u22 = 1 / t22, u33 = 1 / t33, u12 = -t12 / (t11 * t22), u23 = -t23 / (t22 * t33), u13 = (t12 * t23 - t13 * t22) / (t11 * t22 * t33);
    const D11 = a(m1, m0) * u12 + a(m1, m1) * u22;
    const D12 = a(m1, m0) * u13 + a(m1, m1) * u23 + a(m1, hi) * u33;
    const D21 = a(hi, m1) * u22, D22 = a(hi, m1) * u23 + a(hi, hi) * u33;
    let s = D11 + D22, t = D11 * D22 - D12 * D21;
    if (iter % 10 === 0) { const mu = D22 + Math.abs(D21) * 1.5; s = 2 * mu; t = mu * mu + D21 * D21; }
    let x = C11 * C11 + C12 * C21 - s * C11 + t, y = C21 * (C11 + C22 - s), z = C21 * C32;
    for (let k = l; k <= hi - 2; k++) {
      if (k > l) { x = a(k, k - 1); y = a(k + 1, k - 1); z = a(k + 2, k - 1); }
      const c0 = k > l ? k - 1 : l;
      const R1 = rotg(y, 0, z, 0);
      rowRot(A, k + 1, k + 2, R1, c0, n); rowRot(B, k + 1, k + 2, R1, k, n); rowRot(QH, k + 1, k + 2, R1, 0, n);
      const y2 = R1.c * y + R1.sr * z;
      const R2 = rotg(x, 0, y2, 0);
      rowRot(A, k, k + 1, R2, c0, n); rowRot(B, k, k + 1, R2, k, n); rowRot(QH, k, k + 1, R2, 0, n);
      if (k > l) { zero(A, k + 1, k - 1); zero(A, k + 2, k - 1); }
      const rows = Math.min(k + 3, hi) + 1;
      const step = (p, q, row) => { const C = colZero(B, row, p, q); colRot(A, p, q, C, 0, rows); colRot(B, p, q, C, 0, k + 3); colRot(Z, p, q, C, 0, n); zero(B, row, p); };
      step(k, k + 1, k + 2); step(k + 1, k + 2, k + 2); step(k, k + 1, k + 1);
    }
    const R = rotg(a(hi - 1, hi - 2), 0, a(hi, hi - 2), 0);
    rowRot(A, hi - 1, hi, R, hi - 2, n); rowRot(B, hi - 1, hi, R, hi - 1, n); rowRot(QH, hi - 1, hi, R, 0, n); zero(A, hi, hi - 2);
    const C = colZero(B, hi, hi - 1, hi);
    colRot(A, hi - 1, hi, C, 0, hi + 1); colRot(B, hi - 1, hi, C, 0, hi + 1); colRot(Z, hi - 1, hi, C, 0, n); zero(B, hi, hi - 1);
  };
  while (hi > 0) {
    let l = hi;
    while (l > 0) {
      const s = abs(A, l - 1, l - 1) + abs(A, l, l);
      if (abs(A, l, l - 1) <= EPS * (s || nA)) { zero(A, l, l - 1); break; }
      l--;
    }
    if (l === hi) { hi--; iter = 0; continue; }
    let zj = -1;
    for (let j = l; j <= hi; j++) if (abs(B, j, j) <= EPS * nB) { zero(B, j, j); zj = j; break; }
    if (zj >= 0) { chase(zj, l); iter = 0; continue; }
    if (real && l === hi - 1) {
      const e = eig2(A, B, l);
      if (e.disc < 0) { hi -= 2; iter = 0; continue; }
      split2(A, B, QH, Z, l, e.r1, hi + 1); continue;
    }
    iter++; total++;
    if (total > 40 * n + 100) fail('qz:noConvergence', 'QZ iteration failed to converge.');
    if (real) double(l); else single(l);
  }
  // clean the strictly lower parts
  for (let j = 0; j < n; j++) for (let i = j + 1; i < n; i++) { zero(B, i, j); if (i > j + 1 || !real) zero(A, i, j); }
  // nonnegative real diagonal of BB (1x1 blocks only in the real form)
  for (let k = 0; k < n; k++) {
    const inBlock = real && ((k + 1 < n && A.re[k + 1 + k * n] !== 0) || (k > 0 && A.re[k + (k - 1) * n] !== 0));
    if (inBlock) continue;
    const [br, bi] = at(B, k, k); const ab = Math.hypot(br, bi);
    if (ab === 0 || (bi === 0 && br > 0)) continue;
    const pr = br / ab, pi = -bi / ab; // conj(phase)
    for (const M of [A, B, Z]) for (let i = 0; i < n; i++) {
      const o = i + k * n; const [x, y] = cmulS(M.re[o], M.im[o], pr, pi); M.re[o] = x; M.im[o] = y;
    }
    B.im[k + k * n] = 0;
  }
  return { A, B, QH, Z };
}

/** Right and left generalized eigenvectors from the (quasi) triangular result. */
function qzVectors(r, real) {
  const n = r.A.n;
  const S = toC(r.A), T = toC(r.B), QH = toC(r.QH), Z = toC(r.Z);
  if (real) {
    for (let k = 0; k + 1 < n; k++) {
      if (S.re[k + 1 + k * n] === 0 && S.im[k + 1 + k * n] === 0) continue;
      const e = eig2(S, T, k);
      split2(S, T, QH, Z, k, e.r1[1] >= e.r2[1] ? e.r1 : e.r2, n);
      k++;
    }
  }
  const scale = Math.max(normFro(S), normFro(T)) || 1;
  const Vr = cm(n, n), Wl = cm(n, n);
  const Mij = (al, be, i, j) => {
    const [sr, si] = at(S, i, j), [tr, ti] = at(T, i, j);
    const p = cmulS(be[0], be[1], sr, si), q = cmulS(al[0], al[1], tr, ti);
    return [p[0] - q[0], p[1] - q[1]];
  };
  const guard = (d) => (Math.hypot(d[0], d[1]) < EPS * scale ? [EPS * scale, 0] : d);
  const normCol = (X, k) => {
    let mx = 0; for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(X.re[i + k * n]) + Math.abs(X.im[i + k * n]));
    if (mx > 0) for (let i = 0; i < n; i++) { X.re[i + k * n] /= mx; X.im[i + k * n] /= mx; }
  };
  for (let k = 0; k < n; k++) {
    const al = at(S, k, k), be = at(T, k, k);
    const xr = new Float64Array(n), xi = new Float64Array(n); xr[k] = 1;
    for (let i = k - 1; i >= 0; i--) {
      let sr = 0, si = 0;
      for (let j = i + 1; j <= k; j++) { const m = Mij(al, be, i, j); const p = cmulS(m[0], m[1], xr[j], xi[j]); sr += p[0]; si += p[1]; }
      const d = guard(Mij(al, be, i, i)); const q = cdiv(-sr, -si, d[0], d[1]); xr[i] = q[0]; xi[i] = q[1];
    }
    for (let i = 0; i < n; i++) { let sr = 0, si = 0; for (let j = 0; j <= k; j++) { const p = cmulS(Z.re[i + j * n], Z.im[i + j * n], xr[j], xi[j]); sr += p[0]; si += p[1]; } Vr.re[i + k * n] = sr; Vr.im[i + k * n] = si; }
    const yr = new Float64Array(n), yi = new Float64Array(n); yr[k] = 1;
    for (let i = k + 1; i < n; i++) {
      let sr = 0, si = 0;
      for (let j = k; j < i; j++) { const m = Mij(al, be, j, i); const p = cmulS(m[0], -m[1], yr[j], yi[j]); sr += p[0]; si += p[1]; }
      const d = guard(Mij(al, be, i, i)); const q = cdiv(-sr, -si, d[0], -d[1]); yr[i] = q[0]; yi[i] = q[1];
    }
    // W = QH^H y
    for (let i = 0; i < n; i++) { let sr = 0, si = 0; for (let j = k; j < n; j++) { const p = cmulS(QH.re[j + i * n], -QH.im[j + i * n], yr[j], yi[j]); sr += p[0]; si += p[1]; } Wl.re[i + k * n] = sr; Wl.im[i + k * n] = si; }
    normCol(Vr, k); normCol(Wl, k);
  }
  return { V: Vr, W: Wl };
}

const Vout = (M, cls) => outMat(M.m, M.n, M.re, allZero(M.im) ? null : M.im, cls);

export const builtins = {
  qz(args, nargout) {
    if (args.length < 2) fail('qz:notEnoughInputs', 'Not enough input arguments.');
    const a = sqmat(args[0], 'qz', 'A'), b = sqmat(args[1], 'qz', 'B');
    if (a.n !== b.n) fail('qz:dimagree', 'A and B must be square matrices of the same size.');
    const flag = args[2] == null ? 'complex' : optText(args[2]);
    if (flag !== 'real' && flag !== 'complex') fail('qz:badFlag', "The flag must be 'real' or 'complex'.");
    const A = toC(a), B = toC(b);
    if (hasNonFinite(A) || hasNonFinite(B)) fail('qz:matrixWithNaNInf', 'Input to QZ must not contain NaN or Inf.');
    const real = flag === 'real' && allZero(A.im) && allZero(B.im);
    const cls = a.cls === 'single' || b.cls === 'single' ? 'single' : 'double';
    const r = qzCore(A, B, real);
    const outs = [Vout(r.A, cls), Vout(r.B, cls), Vout(r.QH, cls), Vout(r.Z, cls)];
    if (nargout >= 5) { const v = qzVectors(r, real); outs.push(Vout(v.V, cls), Vout(v.W, cls)); }
    return nargout <= 1 ? outs[0] : outs.slice(0, Math.max(nargout, 1));
  },
};
export const help = {
  qz: H('Generalized Schur (QZ) factorization: Q*A*Z = AA, Q*B*Z = BB.', '일반화 슈어(QZ) 분해: Q*A*Z = AA, Q*B*Z = BB.', ['[AA, BB, Q, Z] = qz(A, B)', '[AA, BB, Q, Z, V, W] = qz(A, B)', "[...] = qz(A, B, 'real')", "[...] = qz(A, B, 'complex')"]),
};
