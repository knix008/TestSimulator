// Dense linear algebra: solving, factorizations, eigen/singular values, matrix functions.
import { test } from 'node:test';
import { call, c1, V, C, D, at, close, relClose, makeCtx, assert, matrix, num, str } from './linalg-util.mjs';
import { structOf, bool, tensor } from '../core/value.js';

// helpers --------------------------------------------------------------
let seed = 12345;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
const randM = (m, n) => Array.from({ length: m }, () => Array.from({ length: n }, rnd));
const randC = (m, n) => C(randM(m, n), randM(m, n));
function matmul(A, B) {
  const a = D(A), b = D(B); const m = a.m, k = a.n, n = b.n;
  const re = new Float64Array(m * n), im = new Float64Array(m * n);
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) for (let p = 0; p < k; p++) {
    const xr = a.re[i + p * m], xi = a.im ? a.im[i + p * m] : 0, yr = b.re[p + j * k], yi = b.im ? b.im[p + j * k] : 0;
    re[i + j * m] += xr * yr - xi * yi; im[i + j * m] += xr * yi + xi * yr;
  }
  return tensor('double', [m, n], re, im);
}
const ct = (A) => { const a = D(A); const re = new Float64Array(a.re.length), im = new Float64Array(a.re.length); for (let i = 0; i < a.m; i++) for (let j = 0; j < a.n; j++) { re[j + i * a.n] = a.re[i + j * a.m]; im[j + i * a.n] = a.im ? -a.im[i + j * a.m] : 0; } return tensor('double', [a.n, a.m], re, im); };
const eye = (n) => { const r = []; for (let i = 0; i < n; i++) { r.push(new Array(n).fill(0)); r[i][i] = 1; } return matrix(r); };
const isUpper = (A, tol = 0) => { const a = D(A); for (let j = 0; j < a.n; j++) for (let i = j + 1; i < a.m; i++) if (Math.hypot(a.re[i + j * a.m], a.im ? a.im[i + j * a.m] : 0) > tol) return false; return true; };

// mldivide / mrdivide ----------------------------------------------------
test('mldivide: square system residual (real and complex)', () => {
  const A = V(randM(6, 6)), b = V(randM(6, 2));
  const x = c1('mldivide', [A, b]);
  close(matmul(A, x), b, 1e-12, 'real');
  const Ac = randC(5, 5), bc = randC(5, 1);
  close(matmul(Ac, c1('mldivide', [Ac, bc])), bc, 1e-12, 'complex');
});
test('mldivide: triangular, SPD and scalar cases', () => {
  const U = V([[2, 1, 3], [0, 4, 5], [0, 0, 6]]);
  close(c1('mldivide', [U, V([[1], [2], [3]])]), [[-0.1875], [-0.125], [0.5]], 1e-14);
  const S = V([[4, 1, 0], [1, 3, 1], [0, 1, 2]]);
  close(matmul(S, c1('mldivide', [S, V([[1], [2], [3]])])), [[1], [2], [3]], 1e-13);
  close(c1('mldivide', [num(2), V([2, 4, 6])]), [1, 2, 3]);
});
test('mldivide: least squares for rectangular systems', () => {
  // fit y = 1 + 2t exactly
  const A = V([[1, 0], [1, 1], [1, 2], [1, 3]]), y = V([[1], [3], [5], [7]]);
  close(c1('mldivide', [A, y]), [[1], [2]], 1e-13);
  // underdetermined: basic solution satisfies A x = b
  const B = V([[1, 2, 3], [4, 5, 6]]), r = V([[1], [2]]);
  close(matmul(B, c1('mldivide', [B, r])), r, 1e-12);
});
test('mldivide: singular warnings and dimension errors', () => {
  const ctx = makeCtx();
  call('mldivide', [V([[1, 2], [2, 4]]), V([[1], [2]])], 1, ctx);
  assert.ok(ctx.warnings.some((w) => w.id === 'linalg:singularMatrix' || w.id === 'linalg:nearlySingularMatrix'));
  const ctx2 = makeCtx();
  call('mldivide', [c1('hilb', [num(12)]), V(new Array(12).fill(0).map(() => [1]))], 1, ctx2);
  assert.ok(ctx2.warnings.some((w) => w.id === 'linalg:nearlySingularMatrix' && /RCOND = /.test(w.message)));
  const ctx3 = makeCtx();
  call('mldivide', [V([[1, 1], [1, 1], [1, 1]]), V([[1], [2], [3]])], 1, ctx3);
  assert.ok(ctx3.warnings.some((w) => w.id === 'linalg:rankDeficientMatrix'));
  assert.throws(() => c1('mldivide', [V([[1, 2], [3, 4]]), V([[1], [2], [3]])]), (e) => e.identifier === 'linalg:mldivide:dimagree');
});
test('mrdivide: B/A', () => {
  const A = V(randM(4, 4)), B = V(randM(2, 4));
  close(matmul(c1('mrdivide', [B, A]), A), B, 1e-12);
  close(c1('mrdivide', [V([2, 4]), num(2)]), [1, 2]);
});
test('mpower: integer, negative, fractional and scalar^matrix', () => {
  const A = V([[1, 1], [1, 0]]);
  close(c1('mpower', [A, num(10)]), [[89, 55], [55, 34]]);
  close(c1('mpower', [A, num(-1)]), [[0, 1], [1, -1]], 1e-14);
  const S = V([[4, 1], [1, 3]]);
  const R = c1('mpower', [S, num(0.5)]);
  close(matmul(R, R), S, 1e-12, 'sqrt');
  const E = c1('mpower', [num(Math.E), V([[0, 1], [-1, 0]])]);
  close(E, [[Math.cos(1), Math.sin(1)], [-Math.sin(1), Math.cos(1)]], 1e-13);
  const z = c1('mpower', [num(-8), num(1 / 3)]);
  assert.ok(Math.abs(at(z, 0)[0] - 1) < 1e-12 && Math.abs(at(z, 0)[1] - Math.sqrt(3)) < 1e-12);
  assert.throws(() => c1('mpower', [V([[1, 2, 3]]), num(2)]), /square/);
});

// inverse, det, rank, trace, norms ---------------------------------------
test('inv/det/trace and singular inverse', () => {
  const A = V([[4, 7], [2, 6]]);
  close(c1('inv', [A]), [[0.6, -0.7], [-0.2, 0.4]], 1e-14);
  relClose(c1('det', [A]).re[0], 10, 1e-14);
  relClose(c1('det', [c1('magic', [num(4)])]).re[0] + 1, 1, 1e-9, 'magic(4) singular');
  assert.equal(c1('trace', [c1('magic', [num(3)])]).re[0], 15);
  const ctx = makeCtx();
  const Y = call('inv', [V([[1, 2], [2, 4]])], 1, ctx)[0];
  assert.ok(Y.re.every((x) => x === Infinity));
  assert.equal(ctx.warnings[0].id, 'linalg:singularMatrix');
  const Ac = randC(4, 4);
  close(matmul(Ac, c1('inv', [Ac])), eye(4), 1e-12, 'complex inverse');
  const dc = c1('det', [C([[1, 2], [3, 4]], [[1, 0], [0, 1]])]);
  // (1+i)(4+i) - 6 = 3 + 5i - 6 = -3 + 5i
  close(dc, C([[-3]], [[5]]), 1e-14);
  assert.throws(() => c1('trace', [V([[1, 2, 3]])]), /square/);
});
test('rank, pinv, null, orth, rref', () => {
  const M = c1('magic', [num(4)]);
  assert.equal(c1('rank', [M]).re[0], 3);
  const P = c1('pinv', [M]);
  close(matmul(matmul(M, P), M), M, 1e-10, 'Moore-Penrose 1');
  close(matmul(matmul(P, M), P), P, 1e-10, 'Moore-Penrose 2');
  const Z = c1('null', [M]);
  assert.deepEqual(Z.dims, [4, 1]);
  close(matmul(M, Z), [[0], [0], [0], [0]], 1e-12);
  const Zr = c1('null', [V([[1, 2, 3], [2, 4, 6]]), str('r')]);
  close(Zr, [[-2, -3], [1, 0], [0, 1]], 1e-14);
  const Q = c1('orth', [M]);
  assert.deepEqual(Q.dims, [4, 3]);
  close(matmul(ct(Q), Q), eye(3), 1e-12);
  const [R, jb] = call('rref', [V([[1, 2, 3], [4, 5, 6], [7, 8, 9]])], 2);
  close(R, [[1, 0, -1], [0, 1, 2], [0, 0, 0]], 1e-14);
  close(jb, [1, 2]);
});
test('norm: vectors, matrices, special p', () => {
  close(c1('norm', [V([3, 4])]), 5);
  close(c1('norm', [V([3, 4]), num(1)]), 7);
  close(c1('norm', [V([3, -4]), num(Infinity)]), 4);
  close(c1('norm', [V([3, -4]), num(-Infinity)]), 3);
  relClose(c1('norm', [V([1, 2, 3]), num(3)]).re[0], Math.cbrt(36), 1e-14);
  const A = V([[1, 2], [3, 4]]);
  relClose(c1('norm', [A]).re[0], 5.464985704219043, 1e-14);
  close(c1('norm', [A, num(1)]), 6);
  close(c1('norm', [A, str('inf')]), 7);
  relClose(c1('norm', [A, str('fro')]).re[0], Math.sqrt(30), 1e-14);
  close(c1('norm', [V([])]), 0);
  close(c1('norm', [C([[3]], [[4]])]), 5);
  assert.throws(() => c1('norm', [A, num(3)]), (e) => e.identifier === 'linalg:norm:invalidP');
});
test('cond and rcond', () => {
  relClose(c1('cond', [V([[1, 2], [3, 4]])]).re[0], 14.933034373659268, 1e-12);
  relClose(c1('cond', [V([[1, 2], [3, 4]]), num(1)]).re[0], 21, 1e-12);
  assert.equal(c1('cond', [V([[1, 1], [1, 1]])]).re[0] > 1e15, true);
  relClose(c1('rcond', [V([[1, 2], [3, 4]])]).re[0], 1 / 21, 1e-12);
  assert.equal(c1('rcond', [V([[1, 2], [2, 4]])]).re[0], 0);
  assert.ok(c1('rcond', [c1('hilb', [num(10)])]).re[0] < 1e-12);
});

// factorizations ---------------------------------------------------------
test('lu: 2, 3 outputs, vector, rectangular, complex', () => {
  const A = V(randM(5, 5));
  const [L, U] = call('lu', [A], 2);
  close(matmul(L, U), A, 1e-13);
  assert.ok(isUpper(U));
  const [L3, U3, P] = call('lu', [A], 3);
  close(matmul(L3, U3), matmul(P, A), 1e-13);
  const [, , p] = call('lu', [A, str('vector')], 3);
  assert.deepEqual(p.dims, [1, 5]);
  const R = V(randM(3, 5));
  const [Lr, Ur] = call('lu', [R], 2);
  assert.deepEqual(Lr.dims, [3, 3]); assert.deepEqual(Ur.dims, [3, 5]);
  close(matmul(Lr, Ur), R, 1e-13);
  const Ac = randC(4, 4);
  const [Lc, Uc, Pc] = call('lu', [Ac], 3);
  close(matmul(Lc, Uc), matmul(Pc, Ac), 1e-13, 'complex');
  // partial pivoting picks the largest pivot
  const [, Up] = call('lu', [V([[1, 2], [3, 4]])], 2);
  close(at(Up, 0, 0)[0], 3);
});
test('qr: full, economy, pivoting, complex', () => {
  const A = V(randM(6, 4));
  const [Q, R] = call('qr', [A], 2);
  assert.deepEqual(Q.dims, [6, 6]); assert.deepEqual(R.dims, [6, 4]);
  close(matmul(Q, R), A, 1e-13); close(matmul(ct(Q), Q), eye(6), 1e-13); assert.ok(isUpper(R));
  const [Qe, Re] = call('qr', [A, num(0)], 2);
  assert.deepEqual(Qe.dims, [6, 4]); assert.deepEqual(Re.dims, [4, 4]);
  close(matmul(Qe, Re), A, 1e-13);
  const [Q3, R3, P3] = call('qr', [A], 3);
  close(matmul(Q3, R3), matmul(A, P3), 1e-13);
  const r = D(R3); for (let k = 1; k < 4; k++) assert.ok(Math.abs(r.re[k + k * 6]) <= Math.abs(r.re[k - 1 + (k - 1) * 6]) + 1e-14, 'pivoted diag decreasing');
  const [, , pv] = call('qr', [A, str('econ'), str('vector')], 3);
  assert.deepEqual(pv.dims, [1, 4]);
  const Ac = randC(4, 3);
  const [Qc, Rc] = call('qr', [Ac], 2);
  close(matmul(Qc, Rc), Ac, 1e-13, 'complex qr');
  const rd = D(Rc); for (let k = 0; k < 3; k++) assert.ok(!rd.im || Math.abs(rd.im[k + k * 4]) < 1e-15, 'real diagonal');
});
test('chol: upper, lower, p output, errors', () => {
  const A = V([[4, 12, -16], [12, 37, -43], [-16, -43, 98]]);
  close(c1('chol', [A]), [[2, 6, -8], [0, 1, 5], [0, 0, 3]], 1e-13);
  close(c1('chol', [A, str('lower')]), [[2, 0, 0], [6, 1, 0], [-8, 5, 3]], 1e-13);
  const [R, p] = call('chol', [V([[1, 2], [2, 1]])], 2);
  assert.equal(p.re[0], 2); assert.deepEqual(R.dims, [1, 1]);
  assert.throws(() => c1('chol', [V([[1, 2], [2, 1]])]), (e) => e.identifier === 'linalg:chol:notPositiveDefinite');
  const B = randC(4, 4); const H = matmul(ct(B), B);
  const Rc = c1('chol', [H]);
  close(matmul(ct(Rc), Rc), H, 1e-12, 'complex Hermitian');
});
test('ldl: symmetric indefinite', () => {
  const A = V([[1, 2, 3], [2, 1, 4], [3, 4, 1]]);
  const [L, Dm, P] = call('ldl', [A], 3);
  close(matmul(matmul(ct(P), A), P), matmul(matmul(L, Dm), ct(L)), 1e-12);
  const [L2, D2] = call('ldl', [A], 2);
  close(matmul(matmul(L2, D2), ct(L2)), A, 1e-12);
  const S = V([[0, 1], [1, 0]]);
  const [L3, D3] = call('ldl', [S], 2);
  close(matmul(matmul(L3, D3), ct(L3)), S, 1e-14, '2x2 pivot');
});

// eigenvalues ------------------------------------------------------------
test('eig: symmetric (ascending, orthonormal)', () => {
  const A = V([[2, -1, 0], [-1, 2, -1], [0, -1, 2]]);
  const e = c1('eig', [A]);
  close(e, [[2 - Math.SQRT2], [2], [2 + Math.SQRT2]], 1e-14);
  const [Vm, Dm] = call('eig', [A], 2);
  close(matmul(A, Vm), matmul(Vm, Dm), 1e-13);
  close(matmul(ct(Vm), Vm), eye(3), 1e-13);
  const R = c1('eig', [c1('rosser', [])]);
  const exp = [-10 * Math.sqrt(10405), 0, 510 - 100 * Math.sqrt(26), 1000, 1000, 510 + 100 * Math.sqrt(26), 1020, 10 * Math.sqrt(10405)];
  close(Array.from(R.re), exp, 1e-10, 'rosser');
});
test('eig: nonsymmetric real with complex pairs, complex input', () => {
  const A = V([[0, 1], [-2, -3]]);
  close(c1('eig', [A]), [[-1], [-2]], 1e-14);
  const Rt = V([[0, -1], [1, 0]]);
  const e = c1('eig', [Rt]);
  const ev = D(e); const vals = [[ev.re[0], ev.im[0]], [ev.re[1], ev.im[1]]].sort((a, b) => a[1] - b[1]);
  close(vals.flat(), [0, -1, 0, 1], 1e-15);
  const M = V(randM(7, 7));
  const [Vm, Dm] = call('eig', [M], 2);
  close(matmul(M, Vm), matmul(Vm, Dm), 1e-12, 'AV = VD');
  const Mc = randC(5, 5);
  const [Vc, Dc] = call('eig', [Mc], 2);
  close(matmul(Mc, Vc), matmul(Vc, Dc), 1e-12, 'complex AV = VD');
  const [V3, D3, W] = call('eig', [M], 3);
  close(matmul(ct(W), M), matmul(D3, ct(W)), 1e-11, 'left eigenvectors');
  void V3;
  const ev2 = c1('eig', [V([[1, 2], [3, 4]]), str('vector')]);
  assert.deepEqual(ev2.dims, [2, 1]);
  const [, Dv] = call('eig', [V([[1, 2], [3, 4]]), str('vector')], 2);
  assert.deepEqual(Dv.dims, [2, 1]);
  assert.throws(() => c1('eig', [V([[1, NaN], [0, 1]])]), (e2) => e2.identifier === 'linalg:eig:matrixWithNaNInf');
  assert.throws(() => c1('eig', [V([[1, 2, 3]])]), /square/);
});
test('eig: generalized problems', () => {
  const A = V([[2, 1], [1, 3]]), B = V([[4, 1], [1, 2]]);
  const [Vm, Dm] = call('eig', [A, B], 2);
  close(matmul(A, Vm), matmul(matmul(B, Vm), Dm), 1e-13, 'A V = B V D');
  close(matmul(matmul(ct(Vm), B), Vm), eye(2), 1e-13, 'B-normalized');
  const An = V([[1, 2], [3, 4]]), Bn = V([[1, 0], [0, 0]]);
  const e = c1('eig', [An, Bn]);
  const vals = Array.from(e.re).sort((a, b) => a - b);
  relClose(vals[0], -0.5, 1e-12); assert.equal(vals[1], Infinity);
});
test('eigs, condeig, cdf2rdf', () => {
  const A = c1('gallery', [str('tridiag'), num(10)]);
  const d = c1('eigs', [A, num(3)]);
  const all = Array.from(c1('eig', [A]).re).sort((a, b) => b - a);
  close(d, all.slice(0, 3), 1e-12);
  const ds = c1('eigs', [A, num(2), str('smallestabs')]);
  close(ds, all.slice(-2).reverse(), 1e-12);
  const dn = c1('eigs', [A, num(1), num(2.1)]);
  assert.ok(Math.abs(dn.re[0] - 2.1) < 0.3);
  const c = c1('condeig', [V([[1, 2], [3, 4]])]);
  assert.ok(c.re.every((x) => x >= 1));
  const M = V([[0, -1], [1, 0]]);
  const [Vc, Dc] = call('eig', [M], 2);
  const [Vr, Dr] = call('cdf2rdf', [Vc, Dc], 2);
  close(matmul(M, Vr), matmul(Vr, Dr), 1e-14);
  assert.equal(Dr.im, null);
});

// SVD and Schur ----------------------------------------------------------
test('svd: values, full, economy, complex', () => {
  const A = V([[1, 2], [3, 4], [5, 6]]);
  close(c1('svd', [A]), [[9.525518091565107], [0.514300580658644]], 1e-13);
  const [U, S, Vm] = call('svd', [A], 3);
  assert.deepEqual(U.dims, [3, 3]); assert.deepEqual(S.dims, [3, 2]);
  close(matmul(matmul(U, S), ct(Vm)), A, 1e-13); close(matmul(ct(U), U), eye(3), 1e-13);
  const [Ue, Se] = call('svd', [A, str('econ')], 3);
  assert.deepEqual(Ue.dims, [3, 2]); assert.deepEqual(Se.dims, [2, 2]);
  const W = V([[1, 2, 3], [4, 5, 6]]);
  const [Uw, Sw, Vw] = call('svd', [W], 3);
  assert.deepEqual(Vw.dims, [3, 3]); close(matmul(matmul(Uw, Sw), ct(Vw)), W, 1e-13);
  const Ac = randC(4, 3);
  const [Uc, Sc, Vc] = call('svd', [Ac], 3);
  close(matmul(matmul(Uc, Sc), ct(Vc)), Ac, 1e-13, 'complex');
  const sv = c1('svds', [V([[3, 0], [0, 1]]), num(1)]);
  close(sv, [[3]]);
  assert.throws(() => c1('svd', [V([[NaN]])]), (e) => e.identifier === 'linalg:svd:matrixWithNaNInf');
});
test('schur, rsf2csf, hess, balance', () => {
  const A = V(randM(6, 6));
  const [U, T] = call('schur', [A], 2);
  close(matmul(matmul(U, T), ct(U)), A, 1e-13);
  const t = D(T); for (let j = 0; j < 6; j++) for (let i = j + 2; i < 6; i++) assert.equal(t.re[i + j * 6], 0);
  for (let k = 0; k < 5; k++) if (t.re[k + 1 + k * 6] !== 0) relClose(t.re[k + k * 6], t.re[k + 1 + (k + 1) * 6], 1e-12, 'standardized block');
  const [Uc, Tc] = call('schur', [A, str('complex')], 2);
  close(matmul(matmul(Uc, Tc), ct(Uc)), A, 1e-12); assert.ok(isUpper(Tc));
  const [U2, T2] = call('rsf2csf', [U, T], 2);
  close(matmul(matmul(U2, T2), ct(U2)), A, 1e-12, 'rsf2csf'); assert.ok(isUpper(T2, 1e-12));
  const [P, Hh] = call('hess', [A], 2);
  close(matmul(matmul(P, Hh), ct(P)), A, 1e-13);
  const h = D(Hh); for (let j = 0; j < 6; j++) for (let i = j + 2; i < 6; i++) assert.equal(h.re[i + j * 6], 0);
  const Bm = V([[1, 100, 10000], [0.01, 1, 100], [0.0001, 0.01, 1]]);
  const [Tb, Bb] = call('balance', [Bm], 2);
  close(matmul(Tb, Bb), matmul(Bm, Tb), 1e-10, 'T*B = A*T');
  assert.ok(c1('norm', [Bb, num(1)]).re[0] < c1('norm', [Bm, num(1)]).re[0]);
});

// matrix functions ---------------------------------------------------------
test('expm, logm, sqrtm, funm', () => {
  close(c1('expm', [V([[0, 1], [0, 0]])]), [[1, 1], [0, 1]], 1e-15);
  close(c1('expm', [V([[1, 0], [0, 2]])]), [[Math.E, 0], [0, Math.exp(2)]], 1e-14);
  const A = V([[-49, 24], [-64, 31]]);
  close(c1('expm', [A]), [[-0.735758758144742, 0.551819099658089], [-1.471517599088239, 1.103638240715556]], 1e-9, 'classic expm example');
  const S = V([[4, 1], [1, 3]]);
  close(c1('expm', [c1('logm', [S])]), S, 1e-12);
  const N = V([[1, 1, 0], [0, 1, 1], [0, 0, 1]]);
  close(c1('expm', [c1('logm', [N])]), N, 1e-12, 'defective logm');
  const X = c1('sqrtm', [N]);
  close(matmul(X, X), N, 1e-13);
  assert.equal(X.im, null);
  const ctx = makeCtx();
  const L = call('logm', [V([[-1, 0], [0, 1]])], 1, ctx)[0];
  assert.ok(ctx.warnings.some((w) => w.id === 'linalg:logm:nonPosRealEig'));
  close(at(L, 0, 0), [0, Math.PI], 1e-14);
  const ctx2 = makeCtx();
  call('sqrtm', [V([[0, 1], [0, 0]])], 1, ctx2);
  assert.ok(ctx2.warnings.some((w) => w.id === 'linalg:sqrtm:SingularMatrix'));
  const [, res] = call('sqrtm', [S], 2);
  assert.ok(res.re[0] < 1e-14);
  const Sq = c1('sqrtm', [V([[-4, 0], [0, 9]])]);
  close(Sq, C([[0, 0], [0, 3]], [[2, 0], [0, 0]]), 1e-14);
  close(c1('funm', [V([[1, 2], [3, 4]]), str('exp')]), c1('expm', [V([[1, 2], [3, 4]])]), 1e-12);
  const Fs = c1('funm', [V([[1, 2], [0, 3]]), str('sin')]);
  close(Fs, [[Math.sin(1), Math.sin(3) - Math.sin(1)], [0, Math.sin(3)]], 1e-13, 'funm sin');
});

// products, misc ---------------------------------------------------------
test('kron, cross, dot, vecnorm, normest', () => {
  close(c1('kron', [V([[1, 2], [3, 4]]), V([[0, 1], [1, 0]])]), [[0, 1, 0, 2], [1, 0, 2, 0], [0, 3, 0, 4], [3, 0, 4, 0]]);
  close(c1('cross', [V([1, 0, 0]), V([0, 1, 0])]), [0, 0, 1]);
  close(c1('cross', [V([[1, 0], [0, 1], [0, 0]]), V([[0, 0], [1, 0], [0, 1]])]), [[0, 1], [0, 0], [1, 0]]);
  close(c1('dot', [V([1, 2, 3]), V([4, 5, 6])]), 32);
  close(c1('dot', [C([[1, 1]], [[1, 0]]), C([[1, 1]], [[1, 0]])]), 3, 1e-15, 'conj first');
  close(c1('dot', [V([[1, 2], [3, 4]]), V([[1, 2], [3, 4]])]), [10, 20]);
  close(c1('vecnorm', [V([[3, 0], [4, 1]])]), [5, 1]);
  close(c1('vecnorm', [V([[3, 4], [0, 1]]), num(1), num(2)]), [[7], [1]]);
  relClose(c1('normest', [V([[1, 2], [3, 4]])]).re[0], 5.464985704219043, 1e-6);
  assert.throws(() => c1('cross', [V([1, 2]), V([3, 4])]), /length 3/);
});
test('linsolve with options, lsqminnorm, lscov', () => {
  const U = V([[2, 1], [0, 4]]);
  const opts = structOf({ UT: bool(true) });
  close(c1('linsolve', [U, V([[4], [8]]), opts]), [[1], [2]], 1e-15);
  const optsT = structOf({ UT: bool(true), TRANSA: bool(true) });
  close(matmul(ct(U), c1('linsolve', [U, V([[4], [8]]), optsT])), [[4], [8]], 1e-14);
  const [, r] = call('linsolve', [V([[1, 2], [3, 4]]), V([[1], [1]])], 2);
  relClose(r.re[0], 1 / 21, 1e-12);
  const A = V([[1, 2, 3], [4, 5, 6]]), b = V([[1], [2]]);
  const x = c1('lsqminnorm', [A, b]);
  close(x, matmul(c1('pinv', [A]), b), 1e-12);
  const Ar = V([[1, 0], [1, 1], [1, 2]]);
  const [xc, stdx, mse] = call('lscov', [Ar, V([[1], [2], [4]])], 3);
  close(xc, [[5 / 6], [1.5]], 1e-13);
  relClose(mse.re[0], 1 / 6, 1e-12);
  assert.equal(stdx.dims[0], 2);
  const xw = c1('lscov', [Ar, V([[1], [2], [4]]), V([1, 1, 1e-12])]);
  close(xw, [[1], [1]], 1e-6, 'weighted');
});
test('sylvester, subspace, cholupdate, planerot, structure tests', () => {
  const A = V([[1, 2], [0, 3]]), B = V([[4, 0], [1, 5]]), Cm = V([[1, 2], [3, 4]]);
  const X = c1('sylvester', [A, B, Cm]);
  close(Array.from(D(matmul(A, X)).re, (v, i) => v + D(matmul(X, B)).re[i]), Array.from(D(Cm).re), 1e-12);
  relClose(c1('subspace', [V([[1], [0]]), V([[1], [1]])]).re[0], Math.PI / 4, 1e-14);
  const R = c1('chol', [V([[4, 2], [2, 3]])]);
  const R1 = c1('cholupdate', [R, V([[1], [1]])]);
  close(matmul(ct(R1), R1), [[5, 3], [3, 4]], 1e-13);
  const [G, y] = call('planerot', [V([[3], [4]])], 2);
  close(y, [[5], [0]], 1e-15); close(matmul(G, V([[3], [4]])), y, 1e-15);
  assert.equal(c1('issymmetric', [V([[1, 2], [2, 1]])]).re[0], 1);
  assert.equal(c1('ishermitian', [C([[1, 2], [2, 1]], [[0, 1], [-1, 0]])]).re[0], 1);
  assert.equal(c1('istriu', [V([[1, 2], [0, 1]])]).re[0], 1);
  assert.equal(c1('istril', [V([[1, 2], [0, 1]])]).re[0], 0);
  assert.equal(c1('isdiag', [V([[1, 0], [0, 1]])]).re[0], 1);
  const [lo, up] = call('bandwidth', [V([[1, 2, 0], [3, 4, 5], [0, 6, 7]])], 2);
  assert.equal(lo.re[0], 1); assert.equal(up.re[0], 1);
  assert.equal(c1('isbanded', [V([[1, 2, 0], [3, 4, 5], [0, 6, 7]]), num(1), num(1)]).re[0], 1);
});
test('single precision results stay single', () => {
  const A = tensor('single', [2, 2], [4, 2, 7, 6]);
  assert.equal(c1('inv', [A]).cls, 'single');
  assert.equal(c1('det', [A]).cls, 'single');
  assert.equal(c1('mldivide', [A, V([[1], [2]])]).cls, 'single');
});
