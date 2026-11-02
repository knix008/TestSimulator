// Tests for the linear algebra additions: rotations, Householder / Krylov
// helpers, factorization updating, gsvd, qzhess / ordqz / trexc, normest1,
// sparse orderings and structure analysis, pcr / qmr / tfqmr and N-d
// computational geometry (convhulln, delaunayn, voronoi(n), tsearch(n),
// griddata3 / griddatan). Results are checked by reconstruction, residuals
// and hand-computed small cases.
import test from 'node:test';
import { call, c1, V, D, C, close, makeCtx, jsHandle, assert, str, num, matrix, tensor } from './linalg-util.mjs';
import * as linalg from '../core/lib/linalg/index.js';
import { isSparse, toTensor, isCell, toStr } from '../core/value.js';

// ---------------------------------------------------------------- tiny complex matrix helpers
const M = (v) => { const t = D(v); return { m: t.m, n: t.n, re: Float64Array.from(t.re), im: t.im ? Float64Array.from(t.im) : new Float64Array(t.re.length) }; };
function mul(A, B) {
  const R = { m: A.m, n: B.n, re: new Float64Array(A.m * B.n), im: new Float64Array(A.m * B.n) };
  for (let j = 0; j < B.n; j++) for (let k = 0; k < A.n; k++) {
    const br = B.re[k + j * B.m], bi = B.im[k + j * B.m];
    for (let i = 0; i < A.m; i++) { const ar = A.re[i + k * A.m], ai = A.im[i + k * A.m]; R.re[i + j * A.m] += ar * br - ai * bi; R.im[i + j * A.m] += ar * bi + ai * br; }
  }
  return R;
}
function ct(A) { const R = { m: A.n, n: A.m, re: new Float64Array(A.re.length), im: new Float64Array(A.re.length) }; for (let i = 0; i < A.m; i++) for (let j = 0; j < A.n; j++) { R.re[j + i * A.n] = A.re[i + j * A.m]; R.im[j + i * A.n] = -A.im[i + j * A.m]; } return R; }
function diff(A, B) { assert.equal(A.re.length, B.re.length, 'same size'); let d = 0; for (let i = 0; i < A.re.length; i++) d = Math.max(d, Math.hypot(A.re[i] - B.re[i], A.im[i] - B.im[i])); return d; }
function eye(n) { const R = { m: n, n, re: new Float64Array(n * n), im: new Float64Array(n * n) }; for (let i = 0; i < n; i++) R.re[i * (n + 1)] = 1; return R; }
function fro(A) { let s = 0; for (let i = 0; i < A.re.length; i++) s = Math.hypot(s, A.re[i], A.im[i]); return s; }
const val = (A) => tensor('double', [A.m, A.n], A.re, A.im.some((x) => x !== 0) ? A.im : null);
const at = (A, i, j) => Math.hypot(A.re[i + j * A.m], A.im[i + j * A.m]);
function isUpper(A, tol = 0) { for (let j = 0; j < A.n; j++) for (let i = j + 1; i < A.m; i++) if (at(A, i, j) > tol) return false; return true; }
function orthErr(Q) { return diff(mul(ct(Q), Q), eye(Q.n)); }
/** Deterministic pseudo-random matrix (rows). */
function rnd(m, n, seed = 1) { let s = seed; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; }; return Array.from({ length: m }, () => Array.from({ length: n }, r)); }
const spd = (n, seed) => { const A = M(V(rnd(n, n, seed))); const S = mul(ct(A), A); for (let i = 0; i < n; i++) S.re[i * (n + 1)] += n; return S; };
const row = (v) => Array.from(D(v).re);
const sparseV = (rows) => c1('sparse', [V(rows)]);
const laplace2d = (k) => {
  const n = k * k; const A = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { const p = i + j * k; A[p][p] = 4; if (i > 0) A[p][p - 1] = A[p - 1][p] = -1; if (j > 0) A[p][p - k] = A[p - k][p] = -1; }
  return A;
};
const isPerm = (p, n) => p.length === n && new Set(p).size === n && p.every((x) => Number.isInteger(x) && x >= 1 && x <= n);

// ---------------------------------------------------------------- rotations / small helpers
test('rotx / roty / rotz are exact at multiples of 90 degrees and orthogonal', () => {
  close(c1('rotx', [90]), [[1, 0, 0], [0, 0, -1], [0, 1, 0]], 0);
  close(c1('roty', [90]), [[0, 0, 1], [0, 1, 0], [-1, 0, 0]], 0);
  close(c1('rotz', [180]), [[-1, 0, 0], [0, -1, 0], [0, 0, 1]], 0);
  const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
  close(c1('rotz', [30]), [[c, -s, 0], [s, c, 0], [0, 0, 1]], 1e-15);
  for (const f of ['rotx', 'roty', 'rotz']) { const R = M(c1(f, [37.5])); assert.ok(orthErr(R) < 1e-15, f); }
  assert.throws(() => c1('rotx', [V([1, 2])]), /real scalar/);
});
test('givens zeroes the second component (real and complex)', () => {
  close(c1('givens', [1, 1]), [[Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2]], 1e-15);
  const G = M(c1('givens', [3, 4]));
  close(val(mul(G, M(V([[3], [4]])))), [[5], [0]], 1e-14);
  const [cc, ss] = call('givens', [3, 4], 2);
  close(cc, 0.6, 1e-15); close(ss, 0.8, 1e-15);
  const x = C([[1]], [[2]]), y = C([[-3]], [[0.5]]);
  const Gc = M(c1('givens', [x, y]));
  const r = mul(Gc, M(C([[1], [-3]], [[2], [0.5]])));
  assert.ok(Math.hypot(r.re[1], r.im[1]) < 1e-14);
  assert.ok(orthErr(Gc) < 1e-15);
  close(c1('givens', [0, 2]), [[0, 1], [-1, 0]], 0);
});
test('housh reflects x onto -sign(x(j))*norm(x)*e_j', () => {
  const x = [3, -1, 2, 5];
  const [hv, beta, zer] = call('housh', [V([[3], [-1], [2], [5]]), 2, 0], 3);
  const v = row(hv); const b = D(beta).re[0];
  const vx = v.reduce((s, vi, i) => s + vi * x[i], 0);
  const y = x.map((xi, i) => xi - b * v[i] * vx);
  const nx = Math.hypot(...x);
  close(y, [0, nx, 0, 0], 1e-13);
  assert.equal(D(zer).re[0], 0);
  const z = call('housh', [V([[0], [0]]), 1, 0], 3);
  assert.equal(D(z[1]).re[0], 0); assert.equal(D(z[2]).re[0], 1);
});
test('mgorth: one modified Gram-Schmidt step', () => {
  const Q = M(c1('orth', [V(rnd(5, 2, 3))]));
  const x = M(V(rnd(5, 1, 7)));
  const [y, h] = call('mgorth', [val(x), val(Q)], 2);
  const Y = M(y), Hh = M(h);
  assert.equal(Hh.m, 3);
  assert.ok(fro(mul(ct(Q), Y)) < 1e-14, 'y orthogonal to v');
  close(fro(Y), 1, 1e-14);
  const rec = mul(Q, { m: 2, n: 1, re: Hh.re.slice(0, 2), im: Hh.im.slice(0, 2) });
  for (let i = 0; i < 5; i++) { rec.re[i] += Hh.re[2] * Y.re[i]; }
  assert.ok(diff(rec, x) < 1e-14, 'x = v*h(1:k) + h(k+1)*y');
});
test('krylov: orthonormal basis, Hessenberg projection and invariant subspaces', () => {
  const A = M(V(rnd(6, 6, 11))); const v = M(V(rnd(6, 1, 12)));
  const [U, Hh, nu] = call('krylov', [val(A), val(v), 6], 3);
  const Um = M(U), Hm = M(Hh);
  assert.equal(D(nu).re[0], 6);
  assert.ok(orthErr(Um) < 1e-13);
  assert.ok(diff(mul(A, Um), mul(Um, Hm)) < 1e-12, 'A*U = U*H for the full space');
  for (let j = 0; j < 6; j++) for (let i = j + 2; i < 6; i++) assert.ok(at(Hm, i, j) < 1e-12, 'H is upper Hessenberg');
  const r3 = call('krylov', [val(A), val(v), 3], 3);
  assert.equal(D(r3[2]).re[0], 3);
  const Dg = V([[1, 0, 0, 0], [0, 2, 0, 0], [0, 0, 3, 0], [0, 0, 0, 4]]);
  const r = call('krylov', [Dg, V([[1], [1], [0], [0]]), 4], 3);
  assert.equal(D(r[2]).re[0], 2, 'invariant subspace of dimension 2');
});

// ---------------------------------------------------------------- Cholesky / QR / LU updating
test('chol2inv and cholinv give the inverse of an SPD matrix', () => {
  const A = spd(5, 21);
  const R = M(c1('chol', [val(A)]));
  const X1 = M(c1('chol2inv', [val(R)])), X2 = M(c1('cholinv', [val(A)]));
  assert.ok(diff(mul(A, X1), eye(5)) < 1e-12);
  assert.ok(diff(X1, X2) < 1e-12);
  assert.ok(diff(X1, ct(X1)) === 0, 'exactly symmetric');
  assert.throws(() => c1('cholinv', [V([[1, 2], [2, 1]])]), /positive definite/);
  const Ac = { m: 2, n: 2, re: Float64Array.from([4, 1, 1, 3]), im: Float64Array.from([0, -2, 2, 0]) };
  assert.ok(diff(mul(Ac, M(c1('cholinv', [val(Ac)]))), eye(2)) < 1e-14, 'Hermitian complex');
});
test('cholinsert / choldelete / cholshift agree with chol of the modified matrix', () => {
  const A1 = spd(6, 31);
  const keep = [0, 1, 3, 4, 5];
  const sub = (A, rows, cols) => { const R = { m: rows.length, n: cols.length, re: new Float64Array(rows.length * cols.length), im: new Float64Array(rows.length * cols.length) }; cols.forEach((c, j) => rows.forEach((r, i) => { R.re[i + j * rows.length] = A.re[r + c * A.m]; })); return R; };
  const A = sub(A1, keep, keep);
  const R = c1('chol', [val(A)]);
  const x = Array.from({ length: 6 }, (_, i) => A1.re[i + 2 * 6]);
  const [R1, info] = call('cholinsert', [R, 3, V(x.map((t) => [t]))], 2);
  assert.equal(D(info).re[0], 0);
  assert.ok(diff(M(R1), M(c1('chol', [val(A1)]))) < 1e-12, 'cholinsert = chol(A1)');
  const Rd = M(c1('choldelete', [c1('chol', [val(A1)]), 3]));
  assert.ok(isUpper(Rd) && diff(Rd, M(R)) < 1e-12, 'choldelete = chol(A without row/col 3)');
  for (const [i, j] of [[2, 5], [5, 2]]) {
    const p = [0, 1, 2, 3, 4, 5]; const t = p.splice(i - 1, 1)[0]; p.splice(j - 1, 0, t);
    const Rs = M(c1('cholshift', [c1('chol', [val(A1)]), i, j]));
    assert.ok(isUpper(Rs), 'upper');
    for (let k = 0; k < 6; k++) assert.ok(Rs.re[k * 7] > 0, 'positive diagonal');
    assert.ok(diff(mul(ct(Rs), Rs), sub(A1, p, p)) < 1e-11, `R1'*R1 = A(p,p) for shift ${i}->${j}`);
  }
  const bad = call('cholinsert', [R, 1, V([[-1], [0], [0], [0], [0], [0]])], 2);
  assert.equal(D(bad[1]).re[0], 1, 'info = 1 when not positive definite');
});
test('qrshift moves column i to position j', () => {
  const A = M(V(rnd(5, 4, 41)));
  const [Q, R] = call('qr', [val(A)], 2);
  for (const [i, j] of [[1, 4], [4, 2]]) {
    const [Q1, R1] = call('qrshift', [Q, R, i, j], 2);
    const p = [0, 1, 2, 3]; const t = p.splice(i - 1, 1)[0]; p.splice(j - 1, 0, t);
    const Ap = { m: 5, n: 4, re: new Float64Array(20), im: new Float64Array(20) };
    p.forEach((c, k) => Ap.re.set(A.re.subarray(c * 5, c * 5 + 5), k * 5));
    assert.ok(isUpper(M(R1), 1e-14), 'R1 upper');
    assert.ok(orthErr(M(Q1)) < 1e-14, 'Q1 orthogonal');
    assert.ok(diff(mul(M(Q1), M(R1)), Ap) < 1e-14, 'Q1*R1 = A(:,p)');
  }
});
test('luupdate: rank-one update with and without pivoting', () => {
  const A = M(V([[4, 1, 2], [1, 5, 1], [2, 1, 6]]));
  const [L, U] = call('lu', [val(A)], 2);
  const x = [1, -2, 0.5], y = [0.3, 1, -1];
  const target = { ...A, re: Float64Array.from(A.re), im: new Float64Array(9) };
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) target.re[i + 3 * j] += x[i] * y[j];
  const [L1, U1] = call('luupdate', [L, U, V(x.map((t) => [t])), V(y.map((t) => [t]))], 2);
  assert.ok(diff(mul(M(L1), M(U1)), target) < 1e-13, 'L1*U1 = A + x*y.\'');
  assert.ok(isUpper(M(U1), 0));
  const B = M(V(rnd(4, 4, 51)));
  const [Lp, Up, P] = call('lu', [val(B)], 3);
  const xb = [1, 2, 3, 4], yb = [-1, 0.5, 2, 1];
  const [L2, U2, P2] = call('luupdate', [Lp, Up, P, V(xb.map((t) => [t])), V(yb.map((t) => [t]))], 3);
  const tb = { ...B, re: Float64Array.from(B.re), im: new Float64Array(16) };
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) tb.re[i + 4 * j] += xb[i] * yb[j];
  assert.ok(diff(mul(ct(M(P2)), mul(M(L2), M(U2))), tb) < 1e-13, "P1'*L1*U1 = P'*L*U + x*y.'");
});

// ---------------------------------------------------------------- structured matrices, settings
test('commutation_matrix, duplication_matrix, blkmm and inverse', () => {
  const K = M(c1('commutation_matrix', [2, 3]));
  const Am = [[1, 2, 3], [4, 5, 6]];
  const vecA = { m: 6, n: 1, re: Float64Array.from([1, 4, 2, 5, 3, 6]), im: new Float64Array(6) };
  close(Array.from(mul(K, vecA).re), [1, 2, 3, 4, 5, 6], 0, 'K*vec(A) = vec(A.\')');
  void Am;
  const Dm = M(c1('duplication_matrix', [3]));
  assert.deepEqual([Dm.m, Dm.n], [9, 6]);
  const S = [[1, 2, 3], [2, 4, 5], [3, 5, 6]];
  const vech = { m: 6, n: 1, re: Float64Array.from([1, 2, 3, 4, 5, 6]), im: new Float64Array(6) };
  close(Array.from(mul(Dm, vech).re), [1, 2, 3, 2, 4, 5, 3, 5, 6], 0);
  void S;
  const Ab = tensor('double', [2, 2, 2], [1, 2, 3, 4, 5, 6, 7, 8]), Bb = tensor('double', [2, 1, 2], [1, 1, 2, -1]);
  const Cb = c1('blkmm', [Ab, Bb]);
  assert.deepEqual(Cb.dims, [2, 1, 2]);
  close(Array.from(Cb.re), [4, 6, 3, 4], 1e-15);
  assert.throws(() => c1('blkmm', [Ab, tensor('double', [3, 1, 2])]), /match/);
  close(c1('inverse', [V([[2, 0], [0, 4]])]), [[0.5, 0], [0, 0.25]], 0);
});
test('matrix_type probes full and sparse matrices', () => {
  const t = (A) => toStr(c1('matrix_type', [A]));
  assert.equal(t(V([[1, 2], [0, 3]])), 'Upper');
  assert.equal(t(V([[1, 0], [2, 3]])), 'Lower');
  assert.equal(t(V([[2, 1], [1, 2]])), 'Positive Definite');
  assert.equal(t(V([[1, 2], [3, 4]])), 'Full');
  assert.equal(t(V([[1, 2, 3], [4, 5, 6]])), 'Rectangular');
  assert.equal(t(sparseV([[1, 0], [0, 2]])), 'Diagonal');
  assert.equal(t(sparseV([[0, 1], [2, 0]])), 'Permuted Diagonal');
  assert.equal(t(sparseV([[2, -1, 0, 0], [-1, 2, -1, 0], [0, -1, 2, -1], [0, 0, -1, 2]])), 'Tridiagonal Positive Definite');
  assert.equal(t(sparseV([[1, 2, 0], [0, 1, 2], [0, 0, 1]])), 'Upper');
  const A = V([[1, 2], [3, 4]]);
  assert.equal(c1('matrix_type', [A, str('upper')]), A);
  assert.throws(() => c1('matrix_type', [A, str('bogus')]), /Unknown matrix type/);
});
test('svd_driver and spparms keep per-session settings', () => {
  const ctx = makeCtx();
  assert.equal(toStr(call('svd_driver', [], 1, ctx)[0]), 'gesvd');
  assert.equal(toStr(call('svd_driver', [str('gesdd')], 1, ctx)[0]), 'gesvd');
  assert.equal(toStr(call('svd_driver', [], 1, ctx)[0]), 'gesdd');
  assert.throws(() => call('svd_driver', [str('xyz')], 1, ctx), /gesvd/);
  close(call('spparms', [str('bandden')], 1, ctx)[0], 0.5, 0);
  call('spparms', [str('bandden'), 0.25], 0, ctx);
  close(call('spparms', [str('bandden')], 1, ctx)[0], 0.25, 0);
  const [keys, vals] = call('spparms', [], 2, ctx);
  assert.equal(keys.dims[0], 13); assert.equal(D(vals).re[10], 0.25);
  call('spparms', [str('default')], 0, ctx);
  close(call('spparms', [str('bandden')], 1, ctx)[0], 0.5, 0);
  call('spparms', [], 0, ctx);
  assert.ok(ctx.outText.join('').includes('piv_tol'));
  assert.throws(() => call('spparms', [str('nope')], 1, ctx), /Unknown sparse parameter/);
});

// ---------------------------------------------------------------- normest1
test('normest1 estimates the 1-norm (matrix, sparse and function handle)', () => {
  const A = V([[1, -2, 3], [4, 5, -6], [-7, 8, 9]]);
  close(c1('normest1', [A]), 18, 0);
  const B = M(V(rnd(30, 30, 61)));
  for (let i = 0; i < 30; i++) B.re[i + 7 * 30] *= 20;
  let exact = 0; for (let j = 0; j < 30; j++) { let s = 0; for (let i = 0; i < 30; i++) s += Math.abs(B.re[i + j * 30]); exact = Math.max(exact, s); }
  const [est, v, w, it] = call('normest1', [val(B)], 4);
  const e = D(est).re[0];
  assert.ok(e <= exact * (1 + 1e-14) && e >= 0.9 * exact, `estimate ${e} vs ${exact}`);
  const Bv = mul(B, M(v)); assert.ok(diff(Bv, M(w)) < 1e-12, 'w = A*v');
  const n1 = (X) => X.re.reduce((s, x, i) => s + Math.hypot(x, X.im[i]), 0);
  close(n1(M(w)), e * n1(M(v)), 1e-10);
  assert.equal(D(it).re.length, 2);
  close(c1('normest1', [sparseV(Array.from({ length: 30 }, (_, i) => Array.from(B.re.subarray(0, 30).map((_, j) => B.re[i + j * 30]))))]), e, 1e-10);
  const Bt = ct(B);
  const afun = jsHandle((args) => {
    const flag = toStr(args[0]);
    if (flag === 'dim') return num(30);
    if (flag === 'real') return tensor('logical', [1, 1], [1]);
    return val(mul(flag === 'notransp' ? B : Bt, M(args[1])));
  });
  close(call('normest1', [afun], 1, makeCtx())[0], e, 1e-10);
});

// ---------------------------------------------------------------- gsvd
function checkGsvd(Av, Bv, econ = false, tol = 1e-12) {
  const A = M(Av), B = M(Bv);
  const [U, Vv, X, Cc, S] = call('gsvd', econ ? [Av, Bv, 0] : [Av, Bv], 5);
  const Um = M(U), Vm = M(Vv), Xm = M(X), Cm = M(Cc), Sm = M(S);
  const scale = Math.max(fro(A), fro(B), 1);
  assert.ok(diff(mul(Um, mul(Cm, ct(Xm))), A) < tol * scale, 'A = U*C*X\'');
  assert.ok(diff(mul(Vm, mul(Sm, ct(Xm))), B) < tol * scale, 'B = V*S*X\'');
  if (!econ) { assert.ok(orthErr(Um) < tol, 'U unitary'); assert.ok(orthErr(Vm) < tol, 'V unitary'); } else { assert.ok(diff(mul(ct(Um), Um), eye(Um.n)) < tol); }
  const q = Cm.n;
  assert.ok(diff(mul(ct(Cm), Cm).re.length ? (() => { const G = mul(ct(Cm), Cm); const H2 = mul(ct(Sm), Sm); for (let i = 0; i < G.re.length; i++) G.re[i] += H2.re[i]; return G; })() : eye(q), eye(q)) < tol, "C'*C + S'*S = I");
  return { U: Um, V: Vm, X: Xm, C: Cm, S: Sm };
}
test('gsvd reconstructs A and B for several shapes', () => {
  checkGsvd(V(rnd(5, 3, 71)), V(rnd(4, 3, 72)));
  checkGsvd(V(rnd(2, 4, 73)), V(rnd(5, 4, 74)));
  checkGsvd(V(rnd(4, 5, 75)), V(rnd(2, 5, 76)));
  checkGsvd(V(rnd(3, 6, 77)), V(rnd(2, 6, 78)));
  checkGsvd(V(rnd(6, 3, 79)), V(rnd(5, 3, 80)), true);
  const Ac = C(rnd(4, 3, 81), rnd(4, 3, 82)), Bc = C(rnd(3, 3, 83), rnd(3, 3, 84));
  checkGsvd(Ac, Bc);
  // generalized singular values: det(A'A - s^2 B'B) = 0, ascending
  const A = V([[1, 2], [3, 4], [5, 6]]), B = V([[2, 0], [1, 1]]);
  const sig = row(c1('gsvd', [A, B]));
  assert.ok(sig[0] <= sig[1]);
  const AtA = mul(ct(M(A)), M(A)), BtB = mul(ct(M(B)), M(B));
  for (const s of sig) {
    const P = { m: 2, n: 2, re: AtA.re.map((x, i) => x - s * s * BtB.re[i]), im: new Float64Array(4) };
    const dt = P.re[0] * P.re[3] - P.re[1] * P.re[2];
    assert.ok(Math.abs(dt) < 1e-9 * Math.max(1, s ** 4) * 100, `det ${dt} at sigma ${s}`);
  }
  const g = checkGsvd(A, B);
  close(row(c1('gsvd', [A, B])), [0, 1].map((k) => g.C.re[k + k * 3 + 0] / g.S.re[k + k * 2]), 1e-12);
  // B with a null space direction: infinite generalized singular value
  const sigInf = row(c1('gsvd', [V([[1, 0], [0, 1]]), V([[1, 0]])]));
  assert.equal(sigInf[1], Infinity); close(sigInf[0], 1, 1e-14);
});

// ---------------------------------------------------------------- generalized Schur tools
test('qzhess: Hessenberg-triangular reduction', () => {
  const A = M(V(rnd(5, 5, 91))), B = M(V(rnd(5, 5, 92)));
  const [AA, BB, Q, Z] = call('qzhess', [val(A), val(B)], 4).map(M);
  assert.ok(diff(mul(Q, mul(A, Z)), AA) < 1e-13 && diff(mul(Q, mul(B, Z)), BB) < 1e-13);
  assert.ok(orthErr(Q) < 1e-14 && orthErr(Z) < 1e-14);
  assert.ok(isUpper(BB, 0));
  for (let j = 0; j < 5; j++) for (let i = j + 2; i < 5; i++) assert.equal(at(AA, i, j), 0);
});
function eigOfPencil(AA, BB) { return row(c1('ordeig', [val(AA), val(BB)])).map((r, i) => [r, D(c1('ordeig', [val(AA), val(BB)])).im ? D(c1('ordeig', [val(AA), val(BB)])).im[i] : 0]); }
test('ordqz moves the selected generalized eigenvalues to the top (complex and real forms)', () => {
  const A = M(V([[1, 2, 0, 1], [0, -3, 1, 2], [1, 0, 2, -1], [2, 1, 0, -4]])), B = M(V([[2, 0, 1, 0], [0, 1, 0, 1], [1, 0, 3, 0], [0, 0, 1, 2]]));
  for (const flag of ['complex', 'real']) {
    const [AA, BB, Q, Z] = call('qz', [val(A), val(B), str(flag)], 4);
    const [AS, BS, QS, ZS] = call('ordqz', [AA, BB, Q, Z, str('lhp')], 4).map(M);
    assert.ok(diff(mul(QS, mul(A, ZS)), AS) < 1e-12, `${flag}: QS*A*ZS = AAS`);
    assert.ok(diff(mul(QS, mul(B, ZS)), BS) < 1e-12, `${flag}: QS*B*ZS = BBS`);
    assert.ok(orthErr(QS) < 1e-13 && orthErr(ZS) < 1e-13);
    assert.ok(isUpper(BS, 1e-13), 'BBS triangular');
    const ev = eigOfPencil(AS, BS);
    const before = eigOfPencil(M(AA), M(BB));
    const nNeg = before.filter(([r]) => r < 0).length;
    assert.ok(nNeg > 0 && nNeg < 4, 'test pencil has mixed eigenvalues');
    for (let k = 0; k < 4; k++) assert.equal(ev[k][0] < 0, k < nNeg, `${flag}: eigenvalue ${k} ordering`);
    const sortRe = (e) => e.map(([r, i]) => r * 1e3 + i).sort((a, b) => a - b);
    close(sortRe(ev), sortRe(before), 1e-8, 'same spectrum');
  }
  // real pencil with a complex pair, selected by a logical vector
  const A2 = M(V([[0, -2, 1], [2, 0, 1], [0, 0, 3]])), B2 = eye(3);
  const r = call('qz', [val(A2), val(B2), str('real')], 4);
  const ev0 = eigOfPencil(M(r[0]), M(r[1]));
  const sel = ev0.map(([re]) => (re > 2 ? 1 : 0));
  const [AS, BS, QS, ZS] = call('ordqz', [...r, V([sel])], 4).map(M);
  assert.ok(diff(mul(QS, mul(A2, ZS)), AS) < 1e-12 && diff(mul(QS, mul(B2, ZS)), BS) < 1e-12);
  close(AS.re[0] / BS.re[0], 3, 1e-12, 'real eigenvalue 3 first');
  assert.ok(Math.abs(AS.re[2]) < 1e-14 && Math.abs(AS.re[1]) < 1e-14, 'block structure below the 1x1 block');
});
test('trexc moves a Schur block and keeps U*T*U\'', () => {
  const A = M(V([[4, 1, 2, 0], [0, 3, 1, 1], [1, 0, 1, 2], [0, 1, 0, 2]]));
  const [U, T] = call('schur', [val(A)], 2);
  const ev0 = row(c1('ordeig', [T]));
  const [U1, T1] = call('trexc', [U, T, 1, 4], 2).map(M);
  assert.ok(diff(mul(U1, mul(T1, ct(U1))), A) < 1e-12);
  assert.ok(orthErr(U1) < 1e-13);
  const ev1 = row(c1('ordeig', [val(T1)]));
  close(ev1[ev1.length - 1], ev0[0], 1e-10, 'first eigenvalue moved to the end');
});

// ---------------------------------------------------------------- sparse orderings and structure
function fillOf(Arows, p) {
  const n = Arows.length; const P = p ? p.map((x) => x - 1) : Arows.map((_, i) => i);
  const B = P.map((i) => P.map((j) => Arows[i][j]));
  return D(c1('symbfact', [sparseV(B)])).re.reduce((s, x) => s + x, 0) - n;
}
test('amd / symamd / csymamd: valid permutations that reduce fill', () => {
  const n = 12; const arrow = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? n : i === 0 || j === 0 ? 1 : 0)));
  const natural = fillOf(arrow, null);
  assert.equal(natural, (n * (n - 1)) / 2, 'arrow pointing up fills completely');
  for (const f of ['amd', 'symamd', 'csymamd']) {
    const p = row(c1(f, [sparseV(arrow)]));
    assert.ok(isPerm(p, n), f);
    assert.equal(fillOf(arrow, p), n - 1, `${f}: no fill`);
    assert.ok(p.slice(-2).includes(1), `${f}: hub among the last two`);
  }
  const L = laplace2d(6);
  const pa = row(c1('amd', [sparseV(L)]));
  assert.ok(isPerm(pa, 36));
  assert.ok(fillOf(L, pa) < fillOf(L, null), 'amd beats the natural order on a 2-D grid');
  const cm = V([[...new Array(18).fill(2), ...new Array(18).fill(1)]]);
  const pc = row(c1('csymamd', [sparseV(L), V([]), cm]));
  assert.ok(isPerm(pc, 36));
  assert.ok(pc.slice(0, 18).every((x) => x > 18), 'constraint set 1 first');
});
test('colamd / ccolamd / colperm order columns', () => {
  const A = [[1, 1, 1, 1, 1], [1, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, 1, 0], [0, 0, 0, 0, 1]];
  const p = row(c1('colamd', [sparseV(A)]));
  assert.ok(isPerm(p, 5));
  const pp = row(c1('ccolamd', [sparseV(A), V([]), V([[2, 2, 1, 1, 2]])]));
  assert.ok(isPerm(pp, 5)); assert.deepEqual(pp.slice(0, 2).sort(), [3, 4]);
  assert.deepEqual(row(c1('colperm', [sparseV([[1, 1, 0], [1, 0, 0], [1, 1, 1]])])), [3, 2, 1]);
});
test('dmperm / sprank: matching and block triangular form', () => {
  const A = [[0, 1, 0, 0], [1, 0, 0, 1], [0, 0, 1, 0], [1, 0, 0, 0]];
  const pm = row(c1('dmperm', [sparseV(A)]));
  assert.ok(pm.every((i, j) => i > 0 && A[i - 1][j] !== 0), 'p(j) is a row matched to column j');
  assert.equal(new Set(pm).size, 4);
  close(c1('sprank', [sparseV(A)]), 4, 0);
  close(c1('sprank', [sparseV([[1, 1, 0], [1, 1, 0], [1, 1, 0]])]), 2, 0);
  // reducible matrix: block upper triangular after the permutation
  const B = [[1, 0, 0, 1, 0], [0, 1, 1, 0, 0], [0, 1, 1, 0, 0], [0, 0, 0, 1, 1], [0, 0, 0, 1, 1]];
  const [p, q, r, s] = call('dmperm', [sparseV(B)], 4).map(row);
  assert.ok(isPerm(p, 5) && isPerm(q, 5));
  const C2 = p.map((i) => q.map((j) => B[i - 1][j - 1]));
  for (let k = 0; k < 5; k++) assert.ok(C2[k][k] !== 0, 'zero-free diagonal');
  const blk = (k, bounds) => { let b = 0; while (bounds[b + 1] - 1 <= k) b++; return b; };
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if (C2[i][j]) assert.ok(blk(i, r) <= blk(j, s), 'block upper triangular');
  assert.equal(r.length - 1, 3, 'three diagonal blocks');
  // rectangular: unmatched rows go to the coarse bottom block
  const R = [[1, 1], [1, 0], [1, 0]];
  const out = call('dmperm', [sparseV(R)], 6).map(row);
  assert.ok(isPerm(out[0], 3) && isPerm(out[1], 2));
  assert.equal(out[4].length, 5); assert.equal(out[5].length, 5);
  close(c1('sprank', [sparseV(R)]), 2, 0);
});
test('etree, symbfact and treelayout', () => {
  const T = sparseV([[2, -1, 0, 0, 0], [-1, 2, -1, 0, 0], [0, -1, 2, -1, 0], [0, 0, -1, 2, -1], [0, 0, 0, -1, 2]]);
  const [par, post] = call('etree', [T], 2).map(row);
  assert.deepEqual(par, [2, 3, 4, 5, 0]); assert.deepEqual(post, [1, 2, 3, 4, 5]);
  const Acol = sparseV([[1, 0, 1], [0, 1, 1], [1, 0, 0]]);
  assert.deepEqual(row(c1('etree', [Acol, str('col')])), [3, 3, 0]);
  // symbfact against the numeric Cholesky pattern
  const S = M(V(laplace2d(4)));
  const [count, h, parent, , Rp] = call('symbfact', [sparseV(laplace2d(4))], 5);
  const R = M(c1('chol', [val(S)]));
  const cnt = []; for (let i = 0; i < 16; i++) { let c = 0; for (let j = 0; j < 16; j++) if (Math.abs(R.re[i + 16 * j]) > 1e-14) c++; cnt.push(c); }
  assert.deepEqual(row(count), cnt);
  assert.ok(isSparse(Rp));
  const Rd = toTensor(Rp);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) assert.equal(Rd.re[i + 16 * j] !== 0, Math.abs(R.re[i + 16 * j]) > 1e-14);
  assert.deepEqual(row(parent), row(c1('etree', [sparseV(laplace2d(4))])));
  assert.ok(D(h).re[0] >= 4 && D(h).re[0] <= 16);
  const [x, y, hh, ss] = call('treelayout', [V([0, 1, 1, 2, 2])], 4).map(row);
  assert.equal(hh[0], 3); assert.equal(ss[0], 1);
  close(x, [0.5625, 0.375, 0.75, 0.25, 0.5], 1e-15);
  assert.ok(y[0] > y[1] && y[1] > y[3] && y[1] === y[2]);
});
test('spaugment and spstats', () => {
  const A = [[1, 0], [2, 3], [0, 4]];
  const S = c1('spaugment', [V(A), 0.5]);
  assert.ok(isSparse(S));
  close(toTensor(S), [[0.5, 0, 0, 1, 0], [0, 0.5, 0, 2, 3], [0, 0, 0.5, 0, 4], [1, 2, 0, 0, 0], [0, 3, 4, 0, 0]], 0);
  close(D(toTensor(c1('spaugment', [V(A)]))).re[0], 4 / 1000, 1e-18);
  const [cnt, mean, vr] = call('spstats', [sparseV([[1, 0, 2], [3, 0, 0], [5, 0, 4]])], 3).map((v) => Array.from(toTensor(v).re));
  assert.deepEqual(cnt, [3, 0, 2]); close(mean, [3, NaN, 3], 1e-15); close(vr, [4, 0, 2], 1e-15);
});

// ---------------------------------------------------------------- iterative solvers
function residual(Av, x, b) { const r = mul(M(Av), M(x)); const B = M(b); let s = 0, nb = 0; for (let i = 0; i < r.re.length; i++) { s = Math.hypot(s, r.re[i] - B.re[i], r.im[i] - B.im[i]); nb = Math.hypot(nb, B.re[i], B.im[i]); } return s / nb; }
test('pcr solves Hermitian (also indefinite) systems', () => {
  const A = val(spd(20, 101)); const b = V(rnd(20, 1, 102));
  const [x, flag, relres, iter] = call('pcr', [A, b, 1e-10, 100], 4, makeCtx());
  assert.equal(D(flag).re[0], 0); assert.ok(D(relres).re[0] <= 1e-10); assert.ok(D(iter).re[0] <= 25);
  assert.ok(residual(A, x, b) < 1e-9);
  const ind = V([[2, 1, 0, 0], [1, -3, 1, 0], [0, 1, 1, 2], [0, 0, 2, -1]]); const bi = V([[1], [2], [3], [4]]);
  const r = call('pcr', [ind, bi, 1e-12, 20], 2, makeCtx());
  assert.equal(D(r[1]).re[0], 0); assert.ok(residual(ind, r[0], bi) < 1e-10);
  const Md = V(Array.from({ length: 20 }, (_, i) => Array.from({ length: 20 }, (_, j) => (i === j ? D(A).re[i * 21] : 0))));
  const rp = call('pcr', [A, b, 1e-10, 100, Md], 4, makeCtx());
  assert.equal(D(rp[1]).re[0], 0); assert.ok(residual(A, rp[0], b) < 1e-9);
});
test('qmr solves nonsymmetric systems (matrix, preconditioned, function handle, complex)', () => {
  const n = 25; const Ar = rnd(n, n, 111); for (let i = 0; i < n; i++) Ar[i][i] += 6;
  const A = V(Ar), b = V(rnd(n, 1, 112));
  const [x, flag] = call('qmr', [A, b, 1e-10, 200], 2, makeCtx());
  assert.equal(D(flag).re[0], 0); assert.ok(residual(A, x, b) < 1e-9);
  const L = V(Ar.map((r, i) => r.map((v, j) => (j <= i ? v : 0))));
  const rp = call('qmr', [A, b, 1e-10, 200, L], 4, makeCtx());
  assert.equal(D(rp[1]).re[0], 0); assert.ok(residual(A, rp[0], b) < 1e-9);
  assert.ok(D(rp[3]).re[0] <= D(call('qmr', [A, b, 1e-10, 200], 4, makeCtx())[3]).re[0], 'preconditioning does not slow down');
  const Am = M(A), At = ct(Am);
  const afun = jsHandle((args) => val(mul(toStr(args[1]) === 'transp' ? At : Am, M(args[0]))));
  const rf = call('qmr', [afun, b, 1e-10, 200], 2, makeCtx());
  assert.equal(D(rf[1]).re[0], 0); assert.ok(residual(A, rf[0], b) < 1e-9);
  const Ac = C(Ar, rnd(n, n, 113)), bc = C(rnd(n, 1, 114), rnd(n, 1, 115));
  const rc = call('qmr', [Ac, bc, 1e-10, 300], 2, makeCtx());
  assert.equal(D(rc[1]).re[0], 0); assert.ok(residual(Ac, rc[0], bc) < 1e-9);
  const ctx = makeCtx(); call('qmr', [A, b, 1e-10, 2], 1, ctx);
  assert.ok(ctx.warnings.length === 1, 'warning when not converged');
});
test('tfqmr solves nonsymmetric systems', () => {
  const n = 25; const Ar = rnd(n, n, 121); for (let i = 0; i < n; i++) Ar[i][i] += 6;
  const A = V(Ar), b = V(rnd(n, 1, 122));
  const [x, flag, relres, , resvec] = call('tfqmr', [A, b, 1e-10, 100], 5, makeCtx());
  assert.equal(D(flag).re[0], 0); assert.ok(D(relres).re[0] <= 1e-10); assert.ok(residual(A, x, b) < 1e-9);
  assert.ok(D(resvec).re.length >= 2);
  const Md = V(Ar.map((r, i) => r.map((v, j) => (i === j ? v : 0))));
  const rp = call('tfqmr', [A, b, 1e-10, 100, Md], 2, makeCtx());
  assert.equal(D(rp[1]).re[0], 0); assert.ok(residual(A, rp[0], b) < 1e-9);
  const ctx = makeCtx(); const out1 = call('tfqmr', [A, b, 1e-10, 100], 1, ctx);
  assert.ok(ctx.outText.join('').includes('tfqmr converged')); void out1;
  const Ac = C(Ar, rnd(n, n, 123)), bc = C(rnd(n, 1, 124), rnd(n, 1, 125));
  const rc = call('tfqmr', [Ac, bc, 1e-10, 200], 2, makeCtx());
  assert.equal(D(rc[1]).re[0], 0); assert.ok(residual(Ac, rc[0], bc) < 1e-9);
});

// ---------------------------------------------------------------- computational geometry
const pts = (rows) => V(rows);
function randPts(n, d, seed) { return rnd(n, d, seed).map((r) => r.map((x) => x * 2)); }
function circumCheck(P, T, d) {
  // empty circumsphere: no point strictly inside any simplex's circumsphere
  for (const t of T) {
    const vs = t.map((x) => x - 1);
    const rows = [], rhs = [];
    for (let k = 1; k <= d; k++) { rows.push(P[vs[k]].map((x, c) => 2 * (x - P[vs[0]][c]))); rhs.push(P[vs[k]].reduce((s, x) => s + x * x, 0) - P[vs[0]].reduce((s, x) => s + x * x, 0)); }
    const cc = solveSmall(rows, rhs);
    const r2 = P[vs[0]].reduce((s, x, c) => s + (x - cc[c]) ** 2, 0);
    for (let i = 0; i < P.length; i++) { if (vs.includes(i)) continue; const d2 = P[i].reduce((s, x, c) => s + (x - cc[c]) ** 2, 0); assert.ok(d2 >= r2 * (1 - 1e-9), `point ${i} inside circumsphere`); }
  }
}
function solveSmall(A, b) { const n = A.length; const a = A.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r; [a[p], a[c]] = [a[c], a[p]]; for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c] / a[c][c]; for (let j = c; j <= n; j++) a[r][j] -= f * a[c][j]; } } return a.map((r, i) => r[n] / r[i]); }
const tRows = (v) => { const t = D(v); return Array.from({ length: t.m }, (_, i) => Array.from({ length: t.n }, (_, j) => t.re[i + j * t.m])); };
function detN(rows) { const n = rows.length; const a = rows.map((r) => r.slice()); let s = 1; for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r; if (a[p][c] === 0) return 0; if (p !== c) { [a[p], a[c]] = [a[c], a[p]]; s = -s; } for (let r = c + 1; r < n; r++) { const f = a[r][c] / a[c][c]; for (let j = c; j < n; j++) a[r][j] -= f * a[c][j]; } s *= a[c][c]; } return s; }
const simplexVol = (P, t) => { const d = P[0].length; const v = t.map((x) => P[x - 1]); return Math.abs(detN(v.slice(1).map((p) => p.map((x, c) => x - v[0][c])))) / [1, 1, 2, 6, 24][d]; };

test('convhulln: cube, volume and random points', () => {
  const cube = [];
  for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) cube.push([x, y, z]);
  const P = cube.concat([[0.5, 0.5, 0.5], [0.2, 0.3, 0.4], [0.5, 0.5, 1]]);
  const [Hh, vol] = call('convhulln', [pts(P)], 2);
  const F = tRows(Hh);
  assert.equal(F.length, 12, 'cube surface = 12 triangles');
  assert.ok(F.every((f) => f.every((i) => i <= 8)), 'only cube corners are hull vertices');
  close(vol, 1, 1e-14);
  const R = randPts(60, 3, 131);
  const [H2, v2] = call('convhulln', [pts(R), str('Qt')], 2);
  const T = tRows(c1('delaunayn', [pts(R)]));
  const tv = T.reduce((s, t) => s + simplexVol(R, t), 0);
  close(D(v2).re[0], tv, 1e-12, 'hull volume = sum of Delaunay volumes');
  // every point is on the inner side of every facet
  const cen = R.reduce((a, p) => a.map((x, c) => x + p[c] / R.length), [0, 0, 0]);
  for (const f of tRows(H2)) {
    const [a, b, c] = f.map((i) => R[i - 1]);
    const u = b.map((x, k) => x - a[k]), w = c.map((x, k) => x - a[k]);
    let nrm = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (nrm.reduce((s, x, k) => s + x * (cen[k] - a[k]), 0) > 0) nrm = nrm.map((x) => -x);
    for (const p of R) assert.ok(nrm.reduce((s, x, k) => s + x * (p[k] - a[k]), 0) <= 1e-12);
  }
  const sq = tRows(c1('convhulln', [pts([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]])]));
  assert.equal(sq.length, 4, '2-D hull has 4 edges');
  assert.throws(() => c1('convhulln', [pts([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]])]), /degenerate/);
});
test('delaunayn: empty circumspheres in 2-D and 3-D, cospherical grids', () => {
  const P2 = randPts(40, 2, 141);
  const T2 = tRows(c1('delaunayn', [pts(P2)]));
  circumCheck(P2, T2, 2);
  assert.equal(T2.length, tRows(c1('delaunay', [pts(P2)])).length, 'same triangle count as delaunay');
  const P3 = randPts(30, 3, 142);
  const T3 = tRows(c1('delaunayn', [pts(P3)]));
  circumCheck(P3, T3, 3);
  const grid = []; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) grid.push([i, j]);
  const Tg = tRows(c1('delaunayn', [pts(grid)]));
  assert.equal(Tg.length, 18, '3x3 squares -> 18 triangles');
  close(Tg.reduce((s, t) => s + simplexVol(grid, t), 0), 9, 1e-12);
  const cube = []; for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) cube.push([x, y, z]);
  const Tc = tRows(c1('delaunayn', [pts(cube)]));
  close(Tc.reduce((s, t) => s + simplexVol(cube, t), 0), 1, 1e-12, 'cube volume from tetrahedra');
});
test('voronoi edges and voronoin cells', () => {
  const x = [0, 1, 0, 1, 0.5], y = [0, 0, 1, 1, 0.5];
  const [vx, vy] = call('voronoi', [V(x), V(y)], 2).map(M);
  assert.equal(vx.m, 2); assert.ok(vx.n >= 4);
  // every edge lies on a perpendicular bisector: both ends equidistant from two nearest sites
  for (let k = 0; k < vx.n; k++) for (let e = 0; e < 2; e++) {
    const px = vx.re[e + 2 * k], py = vy.re[e + 2 * k];
    const ds = x.map((xi, i) => Math.hypot(px - xi, py - y[i])).sort((a, b) => a - b);
    assert.ok(Math.abs(ds[1] - ds[0]) < 1e-9 * (1 + ds[0]), 'vertex equidistant from two sites');
  }
  const hasEdge = (a, b) => { for (let k = 0; k < vx.n; k++) { const e1 = [vx.re[2 * k], vy.re[2 * k]], e2 = [vx.re[2 * k + 1], vy.re[2 * k + 1]]; const m = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-12; if ((m(e1, a) && m(e2, b)) || (m(e1, b) && m(e2, a))) return true; } return false; };
  assert.ok(hasEdge([0.5, 0], [1, 0.5]) && hasEdge([0, 0.5], [0.5, 1]), 'the diamond around the centre site');
  // plotting form goes through plot
  const ctx = makeCtx(); let seen = null;
  ctx.call = (fn, a) => { seen = { fn, n: a.length }; return [num(7)]; };
  const h = linalg.builtins.voronoi([V(x), V(y)], 1, ctx);
  assert.equal(seen.fn, 'plot'); assert.equal(seen.n, 6); assert.equal(D(h).re[0], 7);
  const [Cv, F] = call('voronoin', [pts(x.map((xi, i) => [xi, y[i]]))], 2);
  assert.ok(isCell(F) && F.data.length === 5);
  const Cm = tRows(Cv);
  assert.ok(Cm[0].every((v) => v === Infinity));
  const centre = row(F.data[4]);
  assert.ok(!centre.includes(1), 'interior cell is bounded');
  assert.equal(centre.length, 4);
  for (const k of centre) close(Math.hypot(Cm[k - 1][0] - 0.5, Cm[k - 1][1] - 0.5), 0.5, 1e-12);
  for (let i = 0; i < 4; i++) assert.ok(row(F.data[i]).includes(1), 'hull sites have unbounded cells');
});
test('tsearch / tsearchn locate points; griddatan / griddata3 interpolate', () => {
  const x = [0, 1, 0, 1], y = [0, 0, 1, 1];
  const tri = V([[1, 2, 3], [2, 4, 3]]);
  close(c1('tsearch', [V(x), V(y), tri, V([0.2, 0.8, 2]), V([0.2, 0.7, 0])]), [1, 2, NaN], 0);
  const [idx, p] = call('tsearchn', [pts([[0, 0], [1, 0], [0, 1], [1, 1]]), tri, pts([[0.25, 0.25], [5, 5]])], 2);
  close(idx, [[1], [NaN]], 0);
  close(row(p).slice(0, 2).concat(row(p).slice(2, 6)).filter((v, i) => i % 2 === 0), [0.5, 0.25, 0.25], 1e-15);
  const P3 = randPts(50, 3, 151);
  const f = (q) => 1 + 2 * q[0] - q[1] + 0.5 * q[2];
  const vals = V(P3.map((q) => [f(q)]));
  const Q = [[0.01, 0.02, -0.03], [0.1, -0.1, 0.05], [9, 9, 9]];
  const yi = row(c1('griddatan', [pts(P3), vals, pts(Q)]));
  close(yi.slice(0, 2), Q.slice(0, 2).map(f), 1e-12); assert.ok(Number.isNaN(yi[2]));
  const yn = row(c1('griddatan', [pts(P3), vals, pts(Q), str('nearest')]));
  assert.ok(yn.every(Number.isFinite));
  const cols = [0, 1, 2].map((c) => V(P3.map((q) => q[c])));
  const vi = c1('griddata3', [...cols, V(P3.map(f)), V([0.01, 0.1]), V([0.02, -0.1]), V([-0.03, 0.05])]);
  close(row(vi), Q.slice(0, 2).map(f), 1e-12);
  const g = c1('griddata3', [...cols, V(P3.map(f)), V([0, 0.1]), V([[0], [0.05]]), V([0, 0, 0.01].slice(0, 1))]);
  assert.deepEqual(g.dims, [2, 2]);
  void matrix;
});
test('every new builtin has English and Korean help', () => {
  const names = ['rotx', 'roty', 'rotz', 'givens', 'housh', 'mgorth', 'krylov', 'chol2inv', 'cholinv', 'cholinsert', 'choldelete', 'cholshift', 'qrshift', 'luupdate', 'commutation_matrix', 'duplication_matrix', 'blkmm', 'inverse', 'matrix_type', 'svd_driver', 'normest1', 'gsvd', 'qzhess', 'ordqz', 'trexc',
    'amd', 'colamd', 'ccolamd', 'symamd', 'csymamd', 'colperm', 'dmperm', 'sprank', 'etree', 'symbfact', 'treelayout', 'spaugment', 'spstats', 'spparms', 'pcr', 'qmr', 'tfqmr',
    'convhulln', 'delaunayn', 'voronoi', 'voronoin', 'tsearch', 'tsearchn', 'griddatan', 'griddata3'];
  assert.equal(names.length, 50);
  for (const nm of names) {
    assert.ok(linalg.builtins[nm], `builtin ${nm}`);
    const h = linalg.help[nm];
    assert.ok(h && h.en && /[가-힣]/.test(h.ko) && h.syntax.length, `help ${nm}`);
  }
});
