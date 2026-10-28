// Functions added to close coverage gaps: covariance / correlation,
// gradients and Laplacians, trend removal, smoothing, block diagonal and
// cell partitioning, conjugate pairing, the QZ factorization, BiCG, plus the
// later batches (missing data, outliers, page-wise algebra, Schur
// reordering, DCT, statistics, table reshaping, timetables, images).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../core/session.js';
import { createMemoryFs } from '../core/fs-memory.js';

function session() {
  const out = [];
  const s = createSession({ fs: createMemoryFs({}), print: (t) => out.push(t) });
  const run = (code) => { const r = s.evaluate(code); if (!r.ok) throw new Error(`${r.error.identifier}: ${r.error.message}\n  in: ${code}`); };
  const v = (name) => {
    const x = s.getVariable(name);
    if (x.cls === 'char') return String.fromCharCode(...x.re);
    if (x.cls === 'string') return x.data.length === 1 ? x.data[0] : x.data;
    if (x.re) return x.re.length === 1 && !x.im ? x.re[0] : Array.from(x.re);
    return x;
  };
  const raw = (name) => s.getVariable(name);
  const fail = (code) => { const r = s.evaluate(code); assert.equal(r.ok, false, `expected an error from: ${code}`); return r.error; };
  return { run, v, raw, fail, out };
}
const S = session();
const near = (a, b, tol = 1e-9, msg = '') => {
  if (typeof b === 'number') { assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} expected ${b}, got ${a}`); return; }
  assert.equal(a.length, b.length, `${msg} length`);
  b.forEach((x, i) => assert.ok(Math.abs(a[i] - x) <= tol * Math.max(1, Math.abs(x)) || (Number.isNaN(x) && Number.isNaN(a[i])), `${msg}[${i}] expected ${x}, got ${a[i]}`));
};
const val = (code, name = 'r') => { S.run(`${name} = ${code};`); return S.v(name); };

// ------------------------------------------------------------- the 12 original gaps

test('cov: vectors, two variables, normalization, weights and NaN handling', () => {
  near(val('cov([1 2 3 4])'), 5 / 3);
  near(val('cov([1 2 3 4], [2 4 5 9])'), [5 / 3, 11 / 3, 11 / 3, 26 / 3]);
  near(val('cov([1 2 3 4], [2 4 5 9], 1)'), [1.25, 2.75, 2.75, 6.5]);
  near(val('cov([1 2; 3 4; 5 7])'), [4, 5, 5, 6.333333333333333]);
  near(val(`cov([1 2 3]', [1 1 2])`), [1, 0.5, 0.5, 1 / 3]);
  near(val("cov([1 NaN; 2 4; 3 5; 4 7], 'omitrows')"), [1, 1.5, 1.5, 7 / 3]);
  assert.ok(Number.isNaN(val('cov([1 NaN; 2 4; 3 5])')[1]));
  near(val('cov(5)'), 0);
  near(val('cov([1+1i 2 3-1i])'), 1 + 2 / 2);
});

test('corrcoef: coefficients, p-values and confidence bounds', () => {
  S.run(`[R, P, RL, RU] = corrcoef([1 2 3 4 5]', [2 4 5 4 6]');`);
  const r = 8 / Math.sqrt(88);
  near(S.v('R'), [1, r, r, 1], 1e-12);
  S.run('tt = R(1,2) * sqrt(3 / (1 - R(1,2)^2)); pref = 2 * tcdf(-abs(tt), 3);');
  near(S.v('P')[1], S.v('pref'), 1e-10);
  near(S.v('P')[0], 1);
  const z = Math.atanh(r), h = 1.959963984540054 / Math.sqrt(2);
  near(S.v('RL')[1], Math.tanh(z - h), 1e-8); near(S.v('RU')[1], Math.tanh(z + h), 1e-8);
  near(val(`corrcoef([1 2 3]', [2 4 6]')`), [1, 1, 1, 1], 1e-12);
  near(val("corrcoef([1 2; 2 NaN; 3 6; 4 8], 'Rows', 'complete')"), [1, 1, 1, 1], 1e-12);
});

test('gradient: vectors, spacing, matrices, coordinates and 3-D arrays', () => {
  near(val('gradient([1 4 9 16 25])'), [3, 4, 6, 8, 9]);
  near(val('gradient([1 4 9 16 25], 0.5)'), [6, 8, 12, 16, 18]);
  near(val('gradient([0 1 4 9], [0 1 2 4])'), [1, 2, 8 / 3, 2.5]);
  S.run('[gx, gy] = gradient(magic(3));');
  near(S.v('gx'), [-7, 2, 5, -1, 2, -1, 5, 2, -7]);
  near(S.v('gy'), [-5, -2, 1, 4, 4, 4, 1, -2, -5]);
  S.run('[X, Y, Z] = meshgrid(1:3, 1:4, 1:2); F = 2*X + 3*Y + 5*Z; [fx, fy, fz] = gradient(F, 1, 1, 0.5);');
  assert.ok(S.v('fx').every((x) => Math.abs(x - 2) < 1e-12));
  assert.ok(S.v('fy').every((x) => Math.abs(x - 3) < 1e-12));
  assert.ok(S.v('fz').every((x) => Math.abs(x - 10) < 1e-12));
});

test('del2: discrete Laplacian with edge extrapolation and spacing', () => {
  near(val('del2([1 4 9 16 25])'), [0.5, 0.5, 0.5, 0.5, 0.5]);
  S.run('[X, Y] = meshgrid(1:5, 1:4); L = del2(X.^2 + Y.^2);');
  assert.ok(S.v('L').every((x) => Math.abs(x - 1) < 1e-12));
  S.run('[X, Y] = meshgrid(0:0.5:2, 0:0.25:1); L2 = del2(X.^2 + Y.^2, 0.5, 0.25);');
  assert.ok(S.v('L2').every((x) => Math.abs(x - 1) < 1e-12));
  S.run('x = [0 1 3 6 10]; L3 = del2(x.^3, x);');
  near(S.v('L3')[2], (((216 - 27) / 3 - (27 - 1) / 2) / 2.5) / 4, 1e-12);
});

test('detrend: linear, constant, polynomial degree and break points', () => {
  near(val('detrend(3 + 2*(1:6))'), [0, 0, 0, 0, 0, 0], 1e-10);
  near(val('detrend([1 3 2 5 4], 0)'), [-2, 0, -1, 2, 1], 1e-12);
  near(val("detrend([1 3 2 5 4], 'constant')"), [-2, 0, -1, 2, 1], 1e-12);
  near(val('detrend([1 3 2 5 4])'), [-0.4, 0.8, -1, 1.2, -0.6], 1e-12);
  near(val('detrend((1:8).^2, 2)'), new Array(8).fill(0), 1e-9);
  near(val('detrend([1:5, 4:-1:0], 1, 5)'), new Array(10).fill(0), 1e-9);
  S.run('D = detrend([1 2; 3 5; 5 7]);');
  near(S.v('D'), [0, 0, 0, -1 / 6, 1 / 3, -1 / 6], 1e-12);
});

test('smoothdata: moving windows, Gaussian, local regression, Savitzky-Golay, NaN handling', () => {
  near(val("smoothdata([1 5 2 8 3 9 4], 'movmean', 3)"), [3, 8 / 3, 5, 13 / 3, 20 / 3, 16 / 3, 6.5], 1e-12);
  near(val("smoothdata([1 5 2 8 3 9 4], 'movmedian', 3)"), [3, 2, 5, 3, 8, 4, 6.5], 1e-12);
  near(val("smoothdata((1:8).^2, 'sgolay', 5)"), [1, 4, 9, 16, 25, 36, 49, 64], 1e-9);
  near(val("smoothdata(1:10, 'lowess', 5)"), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1e-9);
  near(val("smoothdata((1:10).^2, 'loess', 5)"), [1, 4, 9, 16, 25, 36, 49, 64, 81, 100], 1e-9);
  const g = val("smoothdata([0 0 0 6 0 0 0], 'gaussian', 5)");
  assert.ok(g[3] < 6 && g[3] > g[2] && Math.abs(g[2] - g[4]) < 1e-12);
  const rl = val("smoothdata([1 2 3 4 50 6 7 8 9 10], 'rlowess', 5)");
  assert.ok(Math.abs(rl[4] - 5) < 1e-6, 'robust smoothing ignores the outlier');
  near(val("smoothdata([1 NaN 3 5], 'movmean', 3, 'omitnan')"), [1, 2, 4, 4], 1e-12);
  S.run("[B, w] = smoothdata([1 2 3 4; 5 6 7 8], 2, 'movmean', 2);");
  near(S.v('B'), [1, 5, 1.5, 5.5, 2.5, 6.5, 3.5, 7.5], 1e-12); near(S.v('w'), 2);
});

test('blkdiag, mat2cell, cplxpair and isdeployed', () => {
  near(val('blkdiag([1 2; 3 4], 5)'), [1, 3, 0, 2, 4, 0, 0, 0, 5]);
  assert.equal(val('class(blkdiag(int8(1), 2))'), 'int8');
  assert.equal(val('issparse(blkdiag(sparse(1), 2))'), 1);
  S.run('c = mat2cell(reshape(1:16, 4, 4), [1 3], [2 2]); c21 = c{2,1}; sz = size(c);');
  near(S.v('c21'), [2, 3, 4, 6, 7, 8]); near(S.v('sz'), [2, 2]);
  S.run('c2 = mat2cell(magic(4), [2 2]); s2 = size(c2{1}); n2 = numel(c2);');
  near(S.v('s2'), [2, 4]); near(S.v('n2'), 2);
  S.run("c3 = mat2cell('abcdef', 1, [2 4]); t3 = c3{2};"); assert.equal(S.v('t3'), 'cdef');
  S.run('c4 = mat2cell(reshape(1:8, 2, 2, 2), 2, 2, [1 1]); p4 = c4{2};'); near(S.v('p4'), [5, 6, 7, 8]);
  S.run('z = cplxpair([1+2i, 3, 1-2i, -1-1i, -1+1i, 2]); zr = real(z); zi = imag(z);');
  near(S.v('zr'), [-1, -1, 1, 1, 2, 3]); near(S.v('zi'), [-1, 1, -2, 2, 0, 0]);
  assert.match(S.fail('cplxpair([1+1i 2])').message, /paired/);
  assert.equal(val('isdeployed'), 0);
});

test('qz: complex and real generalized Schur forms with eigenvectors', () => {
  S.run('A = [1 2 3; 4 5 6; 7 8 10]; B = [2 0 1; 1 3 0; 0 1 4]; [AA, BB, Q, Z, V, W] = qz(A, B);');
  S.run(`e1 = norm(Q*A*Z - AA) + norm(Q*B*Z - BB); e2 = norm(Q*Q' - eye(3)) + norm(Z*Z' - eye(3)); e3 = norm(tril(AA, -1)) + norm(tril(BB, -1));`);
  S.run('ev = sort(real(diag(AA) ./ diag(BB))); ee = sort(real(eig(A, B)));');
  S.run(`r = norm(A*V*diag(diag(BB)) - B*V*diag(diag(AA))); l = norm(diag(diag(BB))*W'*A - diag(diag(AA))*W'*B);`);
  assert.ok(S.v('e1') < 1e-12 && S.v('e2') < 1e-12 && S.v('e3') === 0);
  near(S.v('ev'), S.v('ee'), 1e-10);
  assert.ok(S.v('r') < 1e-12 && S.v('l') < 1e-12);
  S.run("rng(7); A = randn(6); B = randn(6); [AA, BB, Q, Z, V] = qz(A, B, 'real');");
  S.run('rr = isreal(AA) && isreal(Q); e4 = norm(Q*A*Z - AA) + norm(Q*B*Z - BB); e5 = norm(tril(AA, -2)) + norm(tril(BB, -1));');
  S.run('d = eig(A, B); r2 = 0; for k = 1:6, lam = ordeig(AA, BB); r2 = max(r2, min(abs(lam(k) - d))); end');
  S.run('lam = ordeig(AA, BB); res = norm(A*V - B*V*diag(lam));');
  assert.equal(S.v('rr'), 1);
  assert.ok(S.v('e4') < 1e-12 && S.v('e5') === 0 && S.v('r2') < 1e-10 && S.v('res') < 1e-10);
  S.run('[AA, BB, Q, Z] = qz(magic(3), [1 2 0; 0 0 1; 0 0 0]); e6 = norm(Q*magic(3)*Z - AA); bz = sum(abs(diag(BB)) < 1e-12);');
  assert.ok(S.v('e6') < 1e-12); near(S.v('bz'), 1);
  assert.match(S.fail('qz(eye(2), eye(3))').identifier, /qz/);
});

test('bicg: sparse, dense, preconditioned and function-handle operators', () => {
  S.run('n = 30; A = spdiags([-ones(n,1) 4*ones(n,1) -2*ones(n,1)], [-1 0 1], n, n); b = A*ones(n,1);');
  S.run('[x, flag, relres, iter, resvec] = bicg(A, b, 1e-10, 100); e = norm(x - 1);');
  near(S.v('flag'), 0); assert.ok(S.v('relres') < 1e-10 && S.v('e') < 1e-9 && S.v('iter') <= 30);
  assert.equal(S.raw('resvec').dims[0], S.v('iter') + 1);
  S.run("f = @(x, t) (strcmp(t, 'notransp'))*(A*x) + (~strcmp(t, 'notransp'))*(A'*x); [x2, fl2] = bicg(f, b, 1e-10, 100); e2 = norm(x2 - 1);");
  near(S.v('fl2'), 0); assert.ok(S.v('e2') < 1e-9);
  S.run('[L, U] = ilu(A); [x3, fl3, ~, it3] = bicg(A, b, 1e-10, 100, L, U);');
  near(S.v('fl3'), 0); near(S.v('it3'), 1);
  S.run('[x4, fl4] = bicg(full(A) + 1i*eye(n), (full(A) + 1i*eye(n))*ones(n,1), 1e-10, 200); e4 = norm(x4 - 1);');
  near(S.v('fl4'), 0); assert.ok(S.v('e4') < 1e-9);
  S.run('[x5, fl5] = bicg(A, b, 1e-14, 2);'); near(S.v('fl5'), 1);
});

// ------------------------------------------------------------- later batches

test('elementary extras: sinpi/cospi, coordinates, rat/rats, num2hex/hex2num', () => {
  near(val('sinpi([0 0.5 1 1.5 2])'), [0, 1, 0, -1, 0], 0);
  near(val('cospi([0 0.5 1 1.5])'), [1, 0, -1, 0], 0);
  S.run('[th, rho] = cart2pol(1, 1); [x, y, z] = sph2cart(pi/2, 0, 2); [az, el, rr] = cart2sph(0, 3, 4);');
  near(S.v('th'), Math.PI / 4); near(S.v('rho'), Math.SQRT2); near(S.v('y'), 2); near(S.v('rr'), 5); near(S.v('el'), Math.atan2(4, 3));
  S.run('[N, D] = rat(pi); [N2, D2] = rat([0.5 0.75]); s = rat(0.75);');
  near(S.v('N'), 355); near(S.v('D'), 113); near(S.v('N2'), [1, 3]); near(S.v('D2'), [2, 4]);
  assert.equal(S.v('s'), '1 + 1/(-4)');
  assert.equal(val("strtrim(rats(0.5))"), '1/2');
  assert.equal(val('num2hex(1)'), '3ff0000000000000');
  near(val("hex2num('400921fb54442d18')"), Math.PI, 0);
});

test('maxk / mink / topkrows / issortedrows / histcounts2', () => {
  S.run('[B, I] = maxk([3 1 4 1 5 9 2 6], 3);'); near(S.v('B'), [9, 6, 5]); near(S.v('I'), [6, 8, 5]);
  near(val('mink([3 1; 4 1; 5 9], 2)'), [3, 4, 1, 1]);
  near(val('topkrows([1 2; 3 4; 5 0; 3 1], 2)'), [5, 3, 0, 4]);
  near(val('issortedrows([1 2; 1 3; 2 0])'), 1); near(val('issortedrows([2 1; 1 3])'), 0);
  S.run('[N, ex, ey] = histcounts2([1 2 3 4], [1 1 2 2], [2 2]);'); near(S.v('N'), [2, 0, 0, 2]);
});

test('paddata / trimdata / resize, ismembertol / uniquetol', () => {
  near(val('paddata([1 2 3], 5)'), [1, 2, 3, 0, 0]);
  near(val("paddata([1 2 3], 6, 'Pattern', 'circular')"), [1, 2, 3, 1, 2, 3]);
  near(val("trimdata([1 2 3 4 5], 3, 'Side', 'leading')"), [3, 4, 5]);
  near(val("resize([1 2; 3 4], [3 3], 'FillValue', 9)"), [1, 3, 9, 2, 4, 9, 9, 9, 9]);
  near(val('ismembertol([1 1+1e-14 2.5], [1 2])'), [1, 1, 0]);
  S.run('[C, IA, IC] = uniquetol([1 1.0000000000001 2 3 3]);'); near(S.v('C'), [1, 2, 3]); near(S.v('IC'), [1, 1, 2, 3, 3]);
});

test('text extras: append, splitlines, strtok, replaceBetween, eraseBetween, matches', () => {
  assert.equal(val("append('x ', 'y')"), 'x y');
  S.run("[t, rem] = strtok('  hello world');"); assert.equal(S.v('t'), 'hello'); assert.equal(S.v('rem'), ' world');
  assert.equal(val("replaceBetween('abcdef', 2, 4, 'XY')"), 'aXYef');
  assert.equal(val(`eraseBetween("hello [x] world", '[', ']', 'Boundaries', 'exclusive')`), 'hello [] world');
  near(val('matches(["ab" "abc"], "ab")'), [1, 0]);
  S.run('L = splitlines("a" + newline + "b"); n = numel(L);'); near(S.v('n'), 2);
  near(val("isUnderlyingType(int8(1), 'integer')"), 1);
});

test('missing data: fillmissing, rmmissing, standardizeMissing', () => {
  S.run('x = [NaN 1 NaN 3 NaN NaN 6 NaN];');
  near(val("fillmissing(x, 'linear')"), [0, 1, 2, 3, 4, 5, 6, 7]);
  near(val("fillmissing(x, 'previous')"), [NaN, 1, 1, 3, 3, 3, 6, 6]);
  near(val("fillmissing(x, 'next')"), [1, 1, 3, 3, 6, 6, 6, NaN]);
  near(val("fillmissing(x, 'constant', 0)"), [0, 1, 0, 3, 0, 0, 6, 0]);
  near(val("fillmissing(x, 'linear', 'EndValues', 'none')"), [NaN, 1, 2, 3, 4, 5, 6, NaN]);
  near(val("fillmissing([1 NaN NaN NaN 5], 'linear', 'MaxGap', 2)"), [1, NaN, NaN, NaN, 5]);
  near(val("fillmissing([1 NaN; NaN 4; 3 5], 'previous')"), [1, 1, 3, NaN, 4, 5]);
  S.run('[R, TF] = rmmissing([1 NaN; NaN 4; 3 5]);'); near(S.v('R'), [3, 5]); near(S.v('TF'), [1, 1, 0]);
  near(val('standardizeMissing([1 -99 3], -99)'), [1, NaN, 3]);
});

test('outliers: isoutlier methods, rmoutliers, filloutliers', () => {
  S.run('a = [1 2 3 4 100 5 6];');
  for (const m of ["'median'", "'quartiles'", "'grubbs'", "'gesd'", "'movmedian', 3"]) near(val(`isoutlier(a, ${m})`), [0, 0, 0, 0, 1, 0, 0], 0, m);
  S.run("[tf, L, U, C] = isoutlier(a, 'mean');"); near(S.v('C'), 121 / 7, 1e-12);
  near(val('rmoutliers(a)'), [1, 2, 3, 4, 5, 6]);
  near(val("filloutliers(a, 'linear')"), [1, 2, 3, 4, 4.5, 5, 6]);
  near(val("filloutliers(a, 'center')"), [1, 2, 3, 4, 4, 5, 6]);
});

test('geometry and polynomial eigenvalues: polyarea, inpolygon, rectint, dsearchn, polyeig', () => {
  near(val('polyarea([0 1 1 0], [0 0 1 1])'), 1);
  near(val('polyarea([0 4 0], [0 0 3])'), 6);
  S.run('[in, on] = inpolygon([0.5 2 1], [0.5 0.5 0.5], [0 1 1 0], [0 0 1 1]);'); near(S.v('in'), [1, 0, 1]); near(S.v('on'), [0, 0, 1]);
  near(val('rectint([0 0 2 2], [1 1 2 2; 5 5 1 1])'), [1, 0]);
  near(val('dsearchn([0 0; 1 1; 2 2], [0.9 1.2; 3 3])'), [2, 3]);
  S.run('A0 = [1 2; 3 4]; A1 = [0 1; 1 0]; A2 = eye(2); [X, e] = polyeig(A0, A1, A2); r = 0; for k = 1:4, r = max(r, norm((A0 + e(k)*A1 + e(k)^2*A2) * X(:,k))); end');
  assert.ok(S.v('r') < 1e-12); near(S.raw('e').dims, [4, 1]);
});

test('ordeig / ordschur / QR updates', () => {
  near(val('ordeig([1 2 3; 0 4 5; 0 0 -1])'), [1, 4, -1]);
  S.run(`A = magic(4); [U, T] = schur(A); [US, TS] = ordschur(U, T, [0 0 0 1]); ev = ordeig(TS); err = norm(US*TS*US' - A);`);
  assert.ok(Math.abs(S.v('ev')[0]) < 1e-10 && S.v('err') < 1e-12);
  S.run("A2 = [0 -2 1 0; 1 0 3 1; 0 0 -1 4; 0 0 0 -3]; [U2, T2] = schur(A2); [US2, TS2] = ordschur(U2, T2, 'lhp'); o = real(ordeig(TS2)); err2 = norm(US2*TS2*US2' - A2);");
  near(S.v('o').slice(0, 2), [-1, -3], 1e-10); assert.ok(S.v('err2') < 1e-12);
  S.run('A = magic(4); [Q, R] = qr(A); [Q1, R1] = qrdelete(Q, R, 2); d1 = norm(Q1*R1 - A(:, [1 3 4])); [Q2, R2] = qrinsert(Q, R, 2, [1;2;3;4]); d2 = norm(Q2*R2 - [A(:,1) [1;2;3;4] A(:,2:4)]);');
  S.run('[Q3, R3] = qrupdate(Q, R, [1;0;0;0], [0;1;0;0]); d3 = norm(Q3*R3 - (A + [0 1 0 0; zeros(3,4)]));');
  assert.ok(S.v('d1') < 1e-12 && S.v('d2') < 1e-12 && S.v('d3') < 1e-12);
});

test('page-wise algebra and tensorprod', () => {
  S.run(`X = cat(3, [1 2; 3 4], [0 1; 1 0]); Z = pagemtimes(X, [1; 1]); Zt = pagemtimes(X, 'transpose', X, 'none');`);
  near(S.v('Z'), [3, 7, 1, 1]); near(S.v('Zt').slice(0, 4), [10, 14, 14, 20]);
  S.run('Pi = pageinv(X); P2 = Pi(:,:,2); sz = size(pagetranspose(rand(2, 3, 4)));'); near(S.v('P2'), [0, 1, 1, 0]); near(S.v('sz'), [3, 2, 4]);
  S.run('D = pagemldivide(X, cat(3, [1; 2], [3; 4]));'); near(S.v('D'), [0, 0.5, 4, 3], 1e-12);
  S.run(`[U, Sg, V] = pagesvd(X); e = norm(U(:,:,1)*Sg(:,:,1)*V(:,:,1)' - X(:,:,1)); nn = squeeze(pagenorm(X))';`);
  assert.ok(S.v('e') < 1e-12); near(S.v('nn')[1], 1);
  S.run('A = rand(2, 3, 4); B = rand(3, 4, 5); C = tensorprod(A, B, [2 3], [1 2]); ce = norm(C - reshape(A, 2, 12)*reshape(B, 12, 5));');
  assert.ok(S.v('ce') < 1e-12);
  near(val("tensorprod([1 2 3], [4 5 6], 'all')"), 32);
  near(val('size(tensorprod([1 2], [3 4 5]))'), [1, 2, 1, 3]);
});

test('signal extras: rms family, DCT, czt, goertzel, buffer, xcorr2, lowpass', () => {
  near(val('rms([1 2 3 4])'), Math.sqrt(7.5)); near(val('rssq([3 4])'), 5); near(val('peak2peak([1 5 -2])'), 7); near(val('peak2rms([1 -3 1 1])'), 3 / Math.sqrt(3));
  const dc = (k) => Math.sqrt((k ? 2 : 1) / 4) * [1, 2, 3, 4].reduce((s2, x, j) => s2 + x * Math.cos(Math.PI * (2 * j + 1) * k / 8), 0);
  near(val('dct([1 2 3 4])'), [0, 1, 2, 3].map(dc), 1e-12);
  near(val('idct(dct([1 2 3 4]))'), [1, 2, 3, 4], 1e-12);
  near(val("idct(dct([4 1 2 7], 'Type', 4), 'Type', 4)"), [4, 1, 2, 7], 1e-12);
  near(val('idct2(dct2(magic(3)))'), [8, 3, 4, 1, 5, 9, 6, 7, 2], 1e-12);
  near(val('norm(czt([1 2 3]) - fft([1 2 3]))'), 0, 1e-12);
  near(val('abs(goertzel([1 2 3 4], 2))'), Math.hypot(-2, 2), 1e-12);
  near(val('buffer(1:7, 3)'), [1, 2, 3, 4, 5, 6, 7, 0, 0]);
  near(val('buffer(1:6, 4, 2)'), [0, 0, 1, 2, 1, 2, 3, 4, 3, 4, 5, 6]);
  near(val('xcorr2([1 2; 3 4], [1 1])'), [1, 3, 3, 7, 2, 4]);
  S.run('t = (0:999)/1000; x = sin(2*pi*5*t) + sin(2*pi*200*t); y = lowpass(x, 50, 1000); el = max(abs(y(200:800) - sin(2*pi*5*t(200:800))));');
  assert.ok(S.v('el') < 1e-3);
});

test('statistics extras: ecdf, ksdensity, crosstab, grpstats, ridge, lasso, robustfit, nlinfit, glmfit, knnsearch', () => {
  S.run('[f, x] = ecdf([3 1 2 2]);'); near(S.v('f'), [0, 0.25, 0.75, 1]); near(S.v('x'), [1, 1, 2, 3]);
  S.run('[fk, xi] = ksdensity([1 2 3 4 5]); area = trapz(xi, fk);'); near(S.v('area'), 1, 2e-3);
  S.run('[t, c2, p] = crosstab([1 1 2 2 2], [1 2 1 2 2]);'); near(S.v('t'), [1, 1, 1, 2]);
  S.run("[m, n] = grpstats([1; 2; 3; 4], [1; 1; 2; 2], {'mean', 'numel'});"); near(S.v('m'), [1.5, 3.5]); near(S.v('n'), [2, 2]);
  S.run(`X = (1:10)'; y = 2*X + 1; br = ridge(y, X, 0, 0); [B, FI] = lasso([X X.^2], 2*X + 3, 'Lambda', 0);`);
  near(S.v('br'), [1, 2], 1e-10); near(S.v('B'), [2, 0], 1e-6);
  S.run('y2 = y; y2(10) = 100; b = robustfit(X, y2);'); near(S.v('b'), [1, 2], 1e-6);
  S.run('beta = nlinfit(X, 3*exp(0.2*X), @(b, x) b(1)*exp(b(2)*x), [1 0.1]);'); near(S.v('beta'), [3, 0.2], 1e-6);
  S.run("bg = glmfit(X, y, 'normal');"); near(S.v('bg'), [1, 2], 1e-10);
  S.run("[I, D] = knnsearch([0 0; 1 1; 3 3], [0.9 0.9], 'K', 2);"); near(S.v('I'), [2, 1]); near(S.v('D'), [Math.hypot(0.1, 0.1), Math.hypot(0.9, 0.9)], 1e-12);
  near(val('friedman([1 2 3; 2 3 1; 3 1 2; 1 2 3])'), Math.exp(-0.25), 1e-10);
});

test('table reshaping and timetable resampling', () => {
  S.run("T = table([1; 2; 3], [4; 5; 6], 'VariableNames', {'a', 'b'}); R = rows2vars(T); h = height(R); w = width(R);"); near(S.v('h'), 2); near(S.v('w'), 4);
  S.run("S = stack(T, {'a', 'b'}); sv = S.a_b'; U = unstack(table([1; 1; 2; 2], {'x'; 'y'; 'x'; 'y'}, [10; 20; 30; 40], 'VariableNames', {'id', 'k', 'v'}), 'v', 'k'); ux = U.x'; uy = U.y';");
  near(S.v('sv'), [1, 4, 2, 5, 3, 6]); near(S.v('ux'), [10, 30]); near(S.v('uy'), [20, 40]);
  S.run("M = mergevars(T, {'a', 'b'}, 'NewVariableName', 'ab'); ms = size(M.ab); Sp = splitvars(M); sw = width(Sp);"); near(S.v('ms'), [3, 2]); near(S.v('sw'), 2);
  S.run("G = groupcounts(table([1; 1; 2], 'VariableNames', {'g'}), 'g'); gc = G.GroupCount';"); near(S.v('gc'), [2, 1]);
  S.run(`t = datetime(2024, 1, 1) + hours([0; 1; 2; 4]); TT = timetable(t, [1; 2; 3; 5], 'VariableNames', {'Var1'}); reg = isregular(TT); T2 = retime(TT, 'hourly', 'linear'); v2 = T2.Var1';`);
  near(S.v('reg'), 0); near(S.v('v2'), [1, 2, 3, 4, 5]);
  S.run("T3 = retime(TT, 'regular', 'mean', 'TimeStep', hours(2)); v3 = T3.Var1'; L = lag(TT); vl = L.Var1';"); near(S.v('v3'), [1.5, 3, 5]); near(S.v('vl'), [NaN, 1, 2, 3]);
});

test('image extras: statistics, blocks, filters, color, distance, extrema, thresholds', () => {
  near(val('mean2(magic(4))'), 8.5); near(val('corr2(magic(4), magic(4))'), 1);
  near(val('im2col(reshape(1:9, 3, 3), [2 2])'), [1, 2, 4, 5, 2, 3, 5, 6, 4, 5, 7, 8, 5, 6, 8, 9]);
  near(val("isequal(col2im(im2col(magic(4), [2 2], 'distinct'), [2 2], [4 4], 'distinct'), magic(4))"), 1);
  near(val('blockproc(magic(4), [2 2], @(b) sum(b.data(:)))'), [34, 34, 34, 34]);
  near(val('nlfilter(magic(3), [3 3], @(x) max(x(:)))'), [8, 9, 9, 8, 9, 9, 7, 9, 9]);
  near(val('stdfilt(ones(3))'), new Array(9).fill(0));
  near(val('imtranslate([1 2; 3 4], [1 0])'), [0, 0, 1, 3]);
  near(val('rgb2lab([1 0 0])'), [53.2408, 80.0925, 67.2032], 1e-5);
  near(val('lab2rgb(rgb2lab([0.2 0.5 0.7]))'), [0.2, 0.5, 0.7], 1e-10);
  near(val('double(bwdist(logical([0 0 0; 0 1 0; 0 0 0])))'), [Math.SQRT2, 1, Math.SQRT2, 1, 0, 1, Math.SQRT2, 1, Math.SQRT2], 1e-6);
  near(val('imregionalmax([1 2 1; 2 5 2; 1 2 1])'), [0, 0, 0, 0, 1, 0, 0, 0, 0]);
  const th = val('multithresh([zeros(1, 50) 0.8*ones(1, 50)])'); assert.ok(th > 0 && th < 0.8);
  near(val('imquantize([0.1 0.5 0.9], [0.3 0.7])'), [1, 2, 3]);
  near(val('ssim(magic(8)/64, magic(8)/64)'), 1, 1e-12);
  near(val('size(imtile({ones(2), zeros(2), ones(2)}))'), [4, 4]);
  near(val('size(phantom(16))'), [16, 16]); near(val('size(checkerboard(2, 1, 1))'), [4, 4]);
});
