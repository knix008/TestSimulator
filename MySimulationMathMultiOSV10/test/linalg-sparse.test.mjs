// Sparse matrices: construction, conversion, helpers, direct and iterative solvers.
import { test } from 'node:test';
import { call, c1, V, C, D, close, relClose, makeCtx, assert, num, str, jsHandle } from './linalg-util.mjs';
import { structOf, toTensor, isSparse, tensor } from '../core/value.js';
import { sparseOps } from '../core/lib/linalg/index.js';

const full = (S) => toTensor(S);
/** 1-D Poisson matrix (tridiagonal 2, -1) of size n as sparse. */
function poisson(n) {
  const i = [], j = [], v = [];
  for (let k = 1; k <= n; k++) { i.push(k); j.push(k); v.push(2); if (k > 1) { i.push(k); j.push(k - 1); v.push(-1); } if (k < n) { i.push(k); j.push(k + 1); v.push(-1); } }
  return c1('sparse', [V(i), V(j), V(v), num(n), num(n)]);
}
function spMatVec(S, x) { const t = full(S); const n = t.dims[0], m = t.dims[1]; const y = new Float64Array(n); for (let c = 0; c < m; c++) for (let r = 0; r < n; r++) y[r] += t.re[r + c * n] * x[c]; return y; }

test('sparse: triplets with accumulation, size, logical, errors', () => {
  const S = c1('sparse', [V([1, 2, 2, 3]), V([1, 2, 2, 1]), V([4, 1, 2, 5])]);
  assert.ok(isSparse(S));
  assert.deepEqual(S.dims, [3, 2]);
  close(full(S), [[4, 0], [0, 3], [5, 0]]);
  const T = c1('sparse', [V([1, 2]), V([1, 1]), num(7), num(4), num(4)]);
  assert.deepEqual(T.dims, [4, 4]); close(full(T).re.slice(0, 2), [7, 7]);
  const E = c1('sparse', [num(2), num(3)]);
  assert.deepEqual(E.dims, [2, 3]); assert.equal(c1('nnz', [E]).re[0], 0);
  const Sd = c1('sparse', [V([[0, 1], [2, 0]])]);
  close(full(Sd), [[0, 1], [2, 0]]); assert.equal(c1('nnz', [Sd]).re[0], 2);
  // cancellation drops the entry
  const Z = c1('sparse', [V([1, 1]), V([1, 1]), V([1, -1])]);
  assert.equal(c1('nnz', [Z]).re[0], 0);
  const L = c1('sparse', [tensor('logical', [2, 2], [1, 0, 0, 1])]);
  assert.equal(L.cls, 'logical');
  assert.throws(() => c1('sparse', [V([0]), V([1]), V([1])]), /positive integers/);
  assert.throws(() => c1('sparse', [V([3]), V([1]), V([1]), num(2), num(2)]), /exceeds/);
  const Cx = c1('sparse', [C([[1, 0], [0, 2]], [[1, 0], [0, 0]])]);
  close(full(Cx), C([[1, 0], [0, 2]], [[1, 0], [0, 0]]));
});
test('full, issparse, nnz, nonzeros, nzmax, spones, speye, spalloc', () => {
  const S = c1('sparse', [V([[0, 2], [3, 0]])]);
  assert.equal(c1('issparse', [S]).re[0], 1);
  assert.equal(c1('issparse', [V([[1]])]).re[0], 0);
  assert.equal(c1('full', [S]).sparse, undefined);
  close(c1('nonzeros', [S]), [[3], [2]]);
  close(c1('nonzeros', [V([[0, 2], [3, 0]])]), [[3], [2]]);
  assert.equal(c1('nnz', [V([[0, 2], [3, 0]])]).re[0], 2);
  assert.equal(c1('nzmax', [S]).re[0], 2);
  close(full(c1('spones', [S])), [[0, 1], [1, 0]]);
  close(full(c1('speye', [num(3)])), [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  assert.deepEqual(c1('speye', [num(2), num(3)]).dims, [2, 3]);
  assert.deepEqual(c1('spalloc', [num(5), num(4), num(10)]).dims, [5, 4]);
});
test('spdiags: create, extract, replace', () => {
  const B = V([[1, 4, 7], [2, 5, 8], [3, 6, 9]]);
  const S = c1('spdiags', [B, V([-1, 0, 1]), num(3), num(3)]);
  // m >= n: super-diagonal takes the lower part of its column, sub-diagonal the upper part
  close(full(S), [[4, 8, 0], [1, 5, 9], [0, 2, 6]]);
  const [Bx, d] = call('spdiags', [S], 2);
  close(d, [[-1], [0], [1]]);
  close(Bx, [[1, 4, 0], [2, 5, 8], [0, 6, 9]]);
  const R = c1('spdiags', [V([[10], [20], [30]]), num(0), S]);
  close(full(R), [[10, 8, 0], [1, 20, 9], [0, 2, 30]]);
  const W = c1('spdiags', [V([[1, 2], [3, 4]]), V([0, 1]), num(2), num(3)]);
  // m < n: S(i, i+d) = B(i, k)
  close(full(W), [[1, 2, 0], [0, 3, 4]]);
});
test('spfun, spconvert, sprand, sprandn, sprandsym', () => {
  const ctx = makeCtx();
  const S = c1('sparse', [V([[0, 2], [3, 0]])]);
  const E = call('spfun', [str('exp'), S], 1, ctx)[0];
  close(full(E), [[0, Math.exp(2)], [Math.exp(3), 0]], 1e-14);
  const Sc = c1('spconvert', [V([[1, 1, 5], [3, 2, 7]])]);
  assert.deepEqual(Sc.dims, [3, 2]); close(full(Sc), [[5, 0], [0, 0], [0, 7]]);
  const R = call('sprand', [num(20), num(30), num(0.1)], 1, ctx)[0];
  assert.deepEqual(R.dims, [20, 30]); assert.equal(c1('nnz', [R]).re[0], 60);
  assert.ok(Array.from(R.re).every((x) => x > 0 && x < 1));
  const Rn = call('sprandn', [S], 1, ctx)[0];
  assert.equal(c1('nnz', [Rn]).re[0], 2);
  const Rs = call('sprandsym', [num(8), num(0.3)], 1, ctx)[0];
  const t = full(Rs); for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) assert.equal(t.re[i + j * 8], t.re[j + i * 8]);
});
test('sparseOps helpers: add, multiply, transpose, find, scale', () => {
  const A = c1('sparse', [V([[1, 0, 2], [0, 3, 0]])]);
  const B = c1('sparse', [V([[0, 1], [1, 0], [4, 0]])]);
  close(full(sparseOps.spMul(A, B)), [[8, 1], [3, 0]]);
  close(full(sparseOps.spAdd(A, A, 1, -1)), [[0, 0, 0], [0, 0, 0]]);
  assert.equal(sparseOps.spNnz(sparseOps.spAdd(A, A, 1, -1)), 0);
  close(full(sparseOps.spTranspose(A)), [[1, 0], [0, 3], [2, 0]]);
  close(sparseOps.spMulDense(A, V([[1], [1], [1]])), [[3], [3]]);
  close(sparseOps.denseMulSp(V([[1, 1]]), A), [[1, 3, 2]]);
  const f = sparseOps.spFind(A);
  assert.deepEqual(Array.from(f.rows), [0, 1, 0]); assert.deepEqual(Array.from(f.cols), [0, 1, 2]);
  close(full(sparseOps.spScale(A, 2)), [[2, 0, 4], [0, 6, 0]]);
  assert.deepEqual(sparseOps.spGet(A, 0, 2), [2, 0]);
  const Ac = c1('sparse', [C([[1, 0], [0, 1]], [[1, 0], [0, 0]])]);
  close(full(sparseOps.spTranspose(Ac, true)), C([[1, 0], [0, 1]], [[-1, 0], [0, 0]]));
});
test('mldivide on sparse: direct LU, triangular, sparse result, singular warning', () => {
  const n = 200;
  const A = poisson(n);
  const b = new Array(n).fill(1).map((x, i) => Math.sin(i));
  const x = c1('mldivide', [A, V(b.map((v) => [v]))]);
  assert.ok(!isSparse(x));
  const r = spMatVec(A, D(x).re);
  close(Array.from(r), b, 1e-10);
  // nonsymmetric with pivoting
  const P = c1('sparse', [V([[0, 2, 0], [1, 0, 3], [4, 0, 5]])]);
  const xp = c1('mldivide', [P, V([[2], [4], [9]])]);
  close(spMatVec(P, D(xp).re), [2, 4, 9], 1e-13);
  const Bs = c1('sparse', [V([[2], [4], [9]])]);
  const xs = c1('mldivide', [P, Bs]);
  assert.ok(isSparse(xs));
  const L = c1('sparse', [V([[2, 0], [1, 4]])]);
  close(c1('mldivide', [L, V([[2], [5]])]), [[1], [1]], 1e-15);
  const big = poisson(80);
  const ctx = makeCtx();
  const sing = sparseOps.spAdd(big, c1('speye', [num(80)]), 1, 0);
  call('mldivide', [sing, V(new Array(80).fill([1]))], 1, ctx);
  assert.equal(ctx.warnings.length, 0, 'well conditioned: no warning');
  const S0 = c1('sparse', [V([1, 2, 3, 1, 2, 3].concat([])), V([1, 1, 1, 2, 2, 2]), V([1, 1, 1, 1, 1, 1]), num(70), num(70)]);
  const ctx2 = makeCtx();
  call('mldivide', [S0, V(new Array(70).fill([1]))], 1, ctx2);
  assert.ok(ctx2.warnings.some((w) => /singular/.test(w.id)));
});
test('iterative solvers: pcg, minres, gmres, bicgstab, cgs, lsqr', () => {
  const n = 60;
  const A = poisson(n);
  const xTrue = Array.from({ length: n }, (_, i) => Math.cos(i / 5));
  const b = V(Array.from(spMatVec(A, xTrue), (v) => [v]));
  const ctx = makeCtx();
  for (const fn of ['pcg', 'minres', 'bicgstab', 'cgs']) {
    const [x, flag, relres, iter] = call(fn, [A, b, num(1e-10), num(400)], 4, ctx);
    assert.equal(flag.re[0], 0, `${fn} converged`);
    assert.ok(relres.re[0] <= 1e-10 * 10, `${fn} relres ${relres.re[0]}`);
    assert.ok(iter.re[0] > 0);
    close(D(x).re, xTrue, 1e-6, fn);
  }
  const [xg, fg, , itg] = call('gmres', [A, b, V([]), num(1e-10), num(200)], 4, ctx);
  assert.equal(fg.re[0], 0); assert.deepEqual(itg.dims, [1, 2]);
  close(D(xg).re, xTrue, 1e-6, 'gmres');
  const [xr, fr2] = call('gmres', [A, b, num(10), num(1e-10), num(200)], 2, ctx);
  assert.equal(fr2.re[0], 0, 'restarted gmres'); close(D(xr).re, xTrue, 1e-6);
  // function handle operator
  const afun = jsHandle((args) => tensor('double', [n, 1], spMatVec(A, args[0].re)));
  const [xf, ff] = call('pcg', [afun, b, num(1e-10), num(400)], 2, ctx);
  assert.equal(ff.re[0], 0); close(D(xf).re, xTrue, 1e-6, 'pcg handle');
  // preconditioned with ichol
  const L = c1('ichol', [A]);
  const [xp, fp, , itp] = call('pcg', [A, b, num(1e-10), num(400), L, sparseOps.spTranspose(L)], 4, ctx);
  assert.equal(fp.re[0], 0); close(D(xp).re, xTrue, 1e-6, 'pcg ichol');
  assert.ok(itp.re[0] <= 3, 'IC(0) of a tridiagonal matrix is exact');
  // lsqr on an overdetermined system
  const M = V([[1, 0], [1, 1], [1, 2], [1, 3]]);
  const [xl, fl] = call('lsqr', [M, V([[1], [3], [5], [7]]), num(1e-12), num(50)], 2, ctx);
  assert.equal(fl.re[0], 0); close(xl, [[1], [2]], 1e-8);
  // message when nargout < 2; warning when not converged
  const ctx2 = makeCtx();
  call('pcg', [A, b, num(1e-12), num(2)], 1, ctx2);
  assert.ok(ctx2.warnings.length === 1);
  const ctx3 = makeCtx();
  call('pcg', [A, b, num(1e-8), num(400)], 1, ctx3);
  assert.ok(/converged at iteration/.test(ctx3.outText.join('')));
});
test('ilu, ichol, condest, symrcm', () => {
  const A = c1('sparse', [V([[4, -1, 0, -1], [-1, 4, -1, 0], [0, -1, 4, -1], [-1, 0, -1, 4]])]);
  const [L, U] = call('ilu', [A], 2);
  const LU = sparseOps.spMul(L, U);
  // ILU(0): exact on the sparsity pattern of A
  const a = full(A), lu = full(LU);
  for (let k = 0; k < 16; k++) if (a.re[k] !== 0) relClose(lu.re[k], a.re[k], 1e-14, 'pattern entry');
  const [L2, U2] = call('ilu', [A, structOf({ type: str('crout'), droptol: num(0) })], 2);
  close(full(sparseOps.spMul(L2, U2)), full(A), 1e-13, 'no dropping = exact LU');
  const R = c1('ichol', [A]);
  const RR = full(sparseOps.spMul(R, sparseOps.spTranspose(R)));
  for (let k = 0; k < 16; k++) if (a.re[k] !== 0) relClose(RR.re[k], a.re[k], 1e-14);
  const Ri = c1('ichol', [A, structOf({ type: str('ict'), droptol: num(0) })]);
  close(full(sparseOps.spMul(Ri, sparseOps.spTranspose(Ri))), full(A), 1e-13);
  const ce = c1('condest', [A]).re[0];
  const cd = c1('cond', [full(A), num(1)]).re[0];
  relClose(ce, cd, 1e-10);
  const p = c1('symrcm', [poisson(10)]);
  assert.deepEqual(Array.from(p.re).sort((x, y) => x - y), Array.from({ length: 10 }, (_, i) => i + 1));
  assert.throws(() => c1('ilu', [V([[1]])]), /sparse/);
});
test('dense functions accept sparse input', () => {
  const S = c1('sparse', [V([[4, 1], [1, 3]])]);
  relClose(c1('det', [S]).re[0], 11, 1e-14);
  const Si = c1('inv', [S]);
  assert.ok(isSparse(Si));
  close(full(Si), [[3 / 11, -1 / 11], [-1 / 11, 4 / 11]], 1e-15);
  const R = c1('chol', [S]); assert.ok(isSparse(R));
  close(c1('eig', [S]), [[(7 - Math.sqrt(5)) / 2], [(7 + Math.sqrt(5)) / 2]], 1e-14);
  assert.ok(isSparse(c1('kron', [S, V([[1]])])));
});
