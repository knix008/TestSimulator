// Special matrices and area-wide checks (help coverage, product-name rule).
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, c1, V, D, close, relClose, assert, num, str } from './linalg-util.mjs';
import * as linalg from '../core/lib/linalg/index.js';

const sums = (M) => { const d = D(M); const n = d.m; const r = [], c = []; for (let i = 0; i < n; i++) { let a = 0, b = 0; for (let j = 0; j < n; j++) { a += d.re[i + j * n]; b += d.re[j + i * n]; } r.push(a); c.push(b); } let d1 = 0, d2 = 0; for (let i = 0; i < n; i++) { d1 += d.re[i * (n + 1)]; d2 += d.re[(n - 1 - i) + i * n]; } return { r, c, d1, d2 }; };

test('magic squares of odd, doubly even and singly even order', () => {
  close(c1('magic', [num(3)]), [[8, 1, 6], [3, 5, 7], [4, 9, 2]]);
  close(c1('magic', [num(4)]), [[16, 2, 3, 13], [5, 11, 10, 8], [9, 7, 6, 12], [4, 14, 15, 1]]);
  close(c1('magic', [num(6)]), [[35, 1, 6, 26, 19, 24], [3, 32, 7, 21, 23, 25], [31, 9, 2, 22, 27, 20], [8, 28, 33, 17, 10, 15], [30, 5, 34, 12, 14, 16], [4, 36, 29, 13, 18, 11]]);
  for (const n of [5, 7, 8, 10, 12, 14]) {
    const M = c1('magic', [num(n)]); const t = n * (n * n + 1) / 2; const s = sums(M);
    assert.ok(s.r.every((x) => x === t) && s.c.every((x) => x === t) && s.d1 === t && s.d2 === t, `magic(${n})`);
    assert.deepEqual(Array.from(D(M).re).sort((a, b) => a - b), Array.from({ length: n * n }, (_, i) => i + 1));
  }
  close(c1('magic', [num(2)]), [[1, 3], [4, 2]]);
  assert.deepEqual(c1('magic', [num(0)]).dims, [0, 0]);
});
test('hilb, invhilb, pascal, rosser, wilkinson', () => {
  close(c1('hilb', [num(3)]), [[1, 1 / 2, 1 / 3], [1 / 2, 1 / 3, 1 / 4], [1 / 3, 1 / 4, 1 / 5]]);
  close(c1('invhilb', [num(3)]), [[9, -36, 30], [-36, 192, -180], [30, -180, 180]]);
  const n = 6; const H = D(c1('hilb', [num(n)])), Hi = D(c1('invhilb', [num(n)]));
  let err = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < n; k++) s += H.re[i + k * n] * Hi.re[k + j * n]; err = Math.max(err, Math.abs(s - (i === j ? 1 : 0))); }
  assert.ok(err < 1e-8);
  close(c1('pascal', [num(4)]), [[1, 1, 1, 1], [1, 2, 3, 4], [1, 3, 6, 10], [1, 4, 10, 20]]);
  close(c1('pascal', [num(3), num(1)]), [[1, 0, 0], [1, -1, 0], [1, -2, 1]]);
  const P1 = D(c1('pascal', [num(4), num(1)]));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += P1.re[i + k * 4] * P1.re[k + j * 4]; assert.equal(s, i === j ? 1 : 0, 'involutory'); }
  const P2 = D(c1('pascal', [num(3), num(2)]));
  // cube root of the identity
  const mm = (A, B) => { const R = new Float64Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) R[i + j * 3] += A[i + k * 3] * B[k + j * 3]; return R; };
  close(Array.from(mm(mm(P2.re, P2.re), P2.re)), [1, 0, 0, 0, 1, 0, 0, 0, 1], 1e-15);
  assert.deepEqual(c1('rosser', []).dims, [8, 8]);
  const W = c1('wilkinson', [num(7)]);
  close(Array.from({ length: 7 }, (_, i) => D(W).re[i * 8]), [3, 2, 1, 0, 1, 2, 3]);
  const e = Array.from(c1('eig', [c1('wilkinson', [num(21)])]).re);
  relClose(e[20], 10.746194182903393, 1e-12); relClose(e[19], 10.746194182903322, 1e-12);
});
test('vander, toeplitz, hankel, hadamard, compan', () => {
  close(c1('vander', [V([1, 2, 3])]), [[1, 1, 1], [4, 2, 1], [9, 3, 1]]);
  close(c1('vander', [V([2, 3]), num(4)]), [[8, 4, 2, 1], [27, 9, 3, 1]]);
  close(c1('toeplitz', [V([1, 2, 3]), V([1, 5, 6, 7])]), [[1, 5, 6, 7], [2, 1, 5, 6], [3, 2, 1, 5]]);
  close(c1('toeplitz', [V([1, 2, 3])]), [[1, 2, 3], [2, 1, 2], [3, 2, 1]]);
  close(c1('hankel', [V([1, 2, 3])]), [[1, 2, 3], [2, 3, 0], [3, 0, 0]]);
  close(c1('hankel', [V([1, 2, 3]), V([3, 4, 5])]), [[1, 2, 3], [2, 3, 4], [3, 4, 5]]);
  for (const n of [1, 2, 4, 8, 12, 20, 24, 40]) {
    const Hm = D(c1('hadamard', [num(n)]));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < n; k++) s += Hm.re[i + k * n] * Hm.re[j + k * n]; assert.equal(s, i === j ? n : 0, `hadamard(${n})`); }
  }
  assert.throws(() => c1('hadamard', [num(6)]), /2\^k/);
  close(c1('compan', [V([1, 2, 3])]), [[-2, -3], [1, 0]]);
  close(c1('compan', [V([2, 4, 6])]), [[-2, -3], [1, 0]]);
  assert.throws(() => c1('compan', [V([[1, 2], [3, 4]])]), /vector/);
});
test('gallery families', () => {
  close(c1('gallery', [str('minij'), num(3)]), [[1, 1, 1], [1, 2, 2], [1, 2, 3]]);
  close(c1('gallery', [str('tridiag'), num(3)]), [[2, -1, 0], [-1, 2, -1], [0, -1, 2]]);
  close(c1('gallery', [str('tridiag'), num(3), num(1), num(4), num(2)]), [[4, 2, 0], [1, 4, 2], [0, 1, 4]]);
  close(c1('gallery', [str('lehmer'), num(2)]), [[1, 0.5], [0.5, 1]]);
  close(c1('gallery', [str('moler'), num(3)]), [[1, -1, -1], [-1, 2, 0], [-1, 0, 3]]);
  close(c1('gallery', [str('kms'), num(3), num(0.5)]), [[1, 0.5, 0.25], [0.5, 1, 0.5], [0.25, 0.5, 1]]);
  close(c1('gallery', [str('frank'), num(3)]), [[3, 2, 1], [2, 2, 1], [0, 1, 1]]);
  close(c1('gallery', [str('circul'), V([1, 2, 3])]), [[1, 2, 3], [3, 1, 2], [2, 3, 1]]);
  close(c1('gallery', [str('clement'), num(3)]), [[0, 1, 0], [2, 0, 2], [0, 1, 0]]);
  close(c1('gallery', [str('jordbloc'), num(2), num(5)]), [[5, 1], [0, 5]]);
  close(c1('gallery', [str('pei'), num(2), num(3)]), [[4, 1], [1, 4]]);
  const Q = D(c1('gallery', [str('orthog'), num(5)]));
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { let s = 0; for (let k = 0; k < 5; k++) s += Q.re[k + i * 5] * Q.re[k + j * 5]; assert.ok(Math.abs(s - (i === j ? 1 : 0)) < 1e-14); }
  const B = D(c1('gallery', [str('binomial'), num(4)]));
  const mm = (A, Bm, n) => { const R = new Float64Array(n * n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) R[i + j * n] += A[i + k * n] * Bm[k + j * n]; return R; };
  const BB = mm(B.re, B.re, 4); const s = BB[0];
  close(Array.from(BB), [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, s], 1e-9, 'binomial is a multiple of an involutory matrix');
  assert.throws(() => c1('gallery', [str('nosuchfamily'), num(3)]), /Unknown matrix family/);
});
test('every builtin has English and Korean help with syntax', () => {
  for (const name of Object.keys(linalg.builtins)) {
    const h = linalg.help[name];
    assert.ok(h, `help for ${name}`);
    assert.ok(h.en && h.ko && Array.isArray(h.syntax) && h.syntax.length > 0, `complete help for ${name}`);
    assert.ok(/[가-힣]/.test(h.ko), `Korean text for ${name}`);
  }
  for (const name of Object.keys(linalg.classes)) assert.ok(linalg.help[name], `help for class ${name}`);
});
test('source files follow the product-name rule', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.join(here, '..', 'core', 'lib', 'linalg');
  const files = fs.readdirSync(dir).map((f) => path.join(dir, f)).concat(fs.readdirSync(here).filter((f) => f.startsWith('linalg')).map((f) => path.join(here, f)));
  const banned = new RegExp(['mat', 'lab', '|', 'sim', 'ulink'].join(''), 'i');
  for (const f of files) assert.ok(!banned.test(fs.readFileSync(f, 'utf8')), path.basename(f));
});
void call;
