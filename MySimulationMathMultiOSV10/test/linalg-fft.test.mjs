// FFT family, convolution and polynomials.
import { test } from 'node:test';
import { call, c1, V, C, D, at, close, relClose, makeCtx, assert, num, str } from './linalg-util.mjs';
import { tensor, isStruct } from '../core/value.js';

/** Naive DFT for reference. */
function dft(re, im, inverse = false) {
  const n = re.length; const or = new Float64Array(n), oi = new Float64Array(n); const s = inverse ? 1 : -1;
  for (let k = 0; k < n; k++) for (let t = 0; t < n; t++) { const a = (s * 2 * Math.PI * k * t) / n; or[k] += re[t] * Math.cos(a) - im[t] * Math.sin(a); oi[k] += re[t] * Math.sin(a) + im[t] * Math.cos(a); }
  if (inverse) for (let k = 0; k < n; k++) { or[k] /= n; oi[k] /= n; }
  return { or, oi };
}
const seq = (n, f) => Array.from({ length: n }, (_, i) => f(i));

test('fft matches the DFT for many lengths (radix 2/3/4/5, primes, Bluestein)', () => {
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 12, 15, 16, 17, 30, 64, 67, 97, 100, 127, 128, 210, 257]) {
    const xr = seq(n, (i) => Math.sin(i * 1.3) + 0.1 * i), xi = seq(n, (i) => Math.cos(i * 0.7));
    const X = c1('fft', [C([xr], [xi])]);
    const ref = dft(xr, xi);
    const x = D(X);
    let err = 0; for (let k = 0; k < n; k++) err = Math.max(err, Math.hypot(x.re[k] - ref.or[k], (x.im ? x.im[k] : 0) - ref.oi[k]));
    assert.ok(err < 1e-10 * n, `n=${n} err=${err}`);
    const back = c1('ifft', [X]);
    close(D(back).re, xr, 1e-12 * n, `ifft re n=${n}`);
  }
});
test('fft: real input, padding/truncation, dims, matrices', () => {
  close(c1('fft', [V([1, 2, 3, 4])]), C([[10, -2, -2, -2]], [[0, 2, 0, -2]]), 1e-14);
  close(c1('fft', [V([1, 1])]), [2, 0]);
  const Xp = c1('fft', [V([1, 2]), num(4)]);
  assert.deepEqual(Xp.dims, [1, 4]); close(Xp, C([[3, 1, -1, 1]], [[0, -2, 0, 2]]), 1e-14);
  const Xt = c1('fft', [V([1, 2, 3, 4]), num(2)]);
  close(Xt, [3, -1]);
  const M = V([[1, 2], [3, 4]]);
  close(c1('fft', [M]), [[4, 6], [-2, -2]], 1e-14);
  close(c1('fft', [M, V([]), num(2)]), [[3, -1], [7, -1]], 1e-14);
  for (const n of [6, 9, 101, 128]) {
    const x = seq(n, (i) => Math.exp(-i / 9) * Math.sin(i));
    const X = c1('fft', [V(x)]);
    const ref = dft(x, new Array(n).fill(0));
    let err = 0; const d = D(X); for (let k = 0; k < n; k++) err = Math.max(err, Math.hypot(d.re[k] - ref.or[k], d.im[k] - ref.oi[k]));
    assert.ok(err < 1e-12 * n, `real n=${n}`);
  }
  assert.deepEqual(c1('fft', [V([])]).dims, [0, 0]);
  assert.equal(c1('fft', [tensor('single', [1, 2], [1, 2])]).cls, 'single');
});
test('ifft symmetric, fft2/ifft2, fftn/ifftn', () => {
  const x = V([1, 5, 2, 8, 3]);
  const X = c1('fft', [x]);
  const y = c1('ifft', [X, str('symmetric')]);
  assert.equal(y.im, null); close(y, [1, 5, 2, 8, 3], 1e-13);
  const A = V([[1, 2, 3], [4, 5, 6]]);
  const F2 = c1('fft2', [A]);
  close(F2, c1('fft', [c1('fft', [A]), V([]), num(2)]), 1e-13);
  close(c1('ifft2', [F2]), A, 1e-14);
  close(c1('fftn', [A]), F2, 1e-13);
  close(c1('ifftn', [c1('fftn', [A])]), A, 1e-14);
  assert.deepEqual(c1('fft2', [A, num(4), num(4)]).dims, [4, 4]);
  const T = tensor('double', [2, 2, 2], [1, 2, 3, 4, 5, 6, 7, 8]);
  const Fn = c1('fftn', [T]);
  relClose(D(Fn).re[0], 36, 1e-15);
  close(c1('ifftn', [Fn, str('symmetric')]).re, [1, 2, 3, 4, 5, 6, 7, 8], 1e-13);
});
test('fftshift, ifftshift, nextpow2', () => {
  close(c1('fftshift', [V([1, 2, 3, 4, 5])]), [4, 5, 1, 2, 3]);
  close(c1('ifftshift', [V([4, 5, 1, 2, 3])]), [1, 2, 3, 4, 5]);
  close(c1('fftshift', [V([1, 2, 3, 4])]), [3, 4, 1, 2]);
  close(c1('fftshift', [V([[1, 2], [3, 4]])]), [[4, 3], [2, 1]]);
  close(c1('fftshift', [V([[1, 2, 3], [4, 5, 6]]), num(2)]), [[3, 1, 2], [6, 4, 5]]);
  close(c1('nextpow2', [V([1, 2, 3, 1023, 1024, 1025, 0.3, -5, 0])]), [0, 1, 2, 10, 10, 11, -1, 3, 0]);
});
test('conv, conv2, deconv', () => {
  close(c1('conv', [V([1, 2, 3]), V([1, 1])]), [1, 3, 5, 3]);
  close(c1('conv', [V([1, 2, 3]), V([1, 1, 1]), str('same')]), [3, 6, 5]);
  close(c1('conv', [V([1, 2, 3, 4]), V([1, 1]), str('valid')]), [3, 5, 7]);
  assert.deepEqual(c1('conv', [V([[1], [2]]), V([[1], [1]])]).dims, [3, 1]);
  close(c1('conv', [C([[1, 1]], [[1, 0]]), V([1, -1])]), C([[1, 0, -1]], [[1, -1, 0]]));
  close(c1('conv2', [V([[1, 2], [3, 4]]), V([[1, 1], [1, 1]])]), [[1, 3, 2], [4, 10, 6], [3, 7, 4]]);
  close(c1('conv2', [V([[1, 2, 3], [4, 5, 6], [7, 8, 9]]), V([[0, 1, 0], [1, 1, 1], [0, 1, 0]]), str('same')]), [[7, 11, 11], [17, 25, 23], [19, 29, 23]]);
  close(c1('conv2', [V([[1, 2, 3], [4, 5, 6], [7, 8, 9]]), V([[1, 1], [1, 1]]), str('valid')]), [[12, 16], [24, 28]]);
  close(c1('conv2', [V([1, 1]), V([1, 2]), V([[1, 0], [0, 1]])]), c1('conv2', [V([[1, 0], [0, 1]]), V([[1, 2], [1, 2]])]));
  const [q, r] = call('deconv', [V([1, 5, 10, 11, 6]), V([1, 2, 3])], 2);
  close(q, [1, 3, 1]); close(r, [0, 0, 0, 0, 3], 1e-14);
  assert.throws(() => c1('deconv', [V([1, 2]), V([0, 1])]), /First coefficient/);
});
test('polyval, polyfit (S, mu, delta), polyvalm', () => {
  close(c1('polyval', [V([3, 2, 1]), V([5, 7, 9])]), [86, 162, 262]);
  close(c1('polyval', [V([1, 0, 1]), C([[0]], [[1]])]), 0, 1e-15);
  const x = seq(10, (i) => i / 3), y = x.map((t) => 2 * t * t - t + 0.5);
  close(c1('polyfit', [V(x), V(y), num(2)]), [2, -1, 0.5], 1e-12);
  const [p, S] = call('polyfit', [V(x), V(y.map((v, i) => v + (i % 2 ? 0.1 : -0.1))), num(1)], 2);
  assert.deepEqual(p.dims, [1, 2]); assert.ok(isStruct(S));
  assert.equal(S.data[0].df.re[0], 8);
  const [yv, delta] = call('polyval', [p, V([0.5, 1]), S], 2);
  assert.deepEqual(yv.dims, [1, 2]); assert.ok(delta.re.every((d) => d > 0 && d < 5));
  const [p3, , mu] = call('polyfit', [V([1, 2, 3, 4]), V([1, 4, 9, 16]), num(2)], 3);
  relClose(mu.re[0], 2.5, 1e-15);
  close(c1('polyval', [p3, V([5]), V([]), mu]), [25], 1e-12);
  const ctx = makeCtx();
  call('polyfit', [V([1, 2, 3]), V([1, 2, 3]), num(4)], 1, ctx);
  assert.ok(ctx.warnings.length === 1);
  close(c1('polyvalm', [V([1, 0, -1]), V([[1, 2], [3, 4]])]), [[6, 10], [15, 21]]);
});
test('roots, poly, polyder, polyint', () => {
  const r = c1('roots', [V([1, -6, 11, -6])]);
  close(Array.from(r.re).sort((a, b) => a - b), [1, 2, 3], 1e-12);
  const rc = c1('roots', [V([1, 0, 1])]);
  close(Array.from(D(rc).im).sort((a, b) => a - b), [-1, 1], 1e-15);
  close(c1('roots', [V([0, 0, 1, -1, 0, 0])]), [[1], [0], [0]], 1e-15);
  close(c1('poly', [V([1, 2, 3])]), [1, -6, 11, -6]);
  const pc = c1('poly', [C([[0, 0]], [[1, -1]])]);
  assert.equal(pc.im, null); close(pc, [1, 0, 1]);
  close(c1('poly', [V([[1, 2], [3, 4]])]), [1, -5, -2], 1e-13);
  close(c1('polyder', [V([1, 2, 3, 4])]), [3, 4, 3]);
  close(c1('polyder', [V([1, 1]), V([1, -1])]), [2, 0]);
  const [qn, qd] = call('polyder', [V([1]), V([1, 0])], 2);
  close(qn, [-1]); close(qd, [1, 0, 0]);
  close(c1('polyint', [V([3, 2, 1])]), [1, 1, 1, 0]);
  close(c1('polyint', [V([3, 2, 1]), num(5)]), [1, 1, 1, 5]);
});
test('residue: simple and repeated poles, inverse', () => {
  const [r, p, k] = call('residue', [V([5, 3, -2, 7]), V([-4, 0, 8, 3])], 3);
  // check via reconstruction
  const [b, a] = call('residue', [r, p, k], 2);
  const scale = -4;
  close(D(b).re.map((v) => v * scale), [5, 3, -2, 7], 1e-10, 'b');
  close(D(a).re.map((v) => v * scale), [-4, 0, 8, 3], 1e-10, 'a');
  // 1/((s+1)^2 (s+2)) = 1/(s+2) - 1/(s+1) + 1/(s+1)^2
  const [r2, p2, k2] = call('residue', [V([1]), V([1, 4, 5, 2])], 3);
  assert.equal(k2.re.length, 0);
  const pairs = Array.from(D(p2).re, (pv, i) => [Math.round(pv), D(r2).re[i]]);
  const twos = pairs.filter((q) => q[0] === -2), ones = pairs.filter((q) => q[0] === -1);
  relClose(twos[0][1], 1, 1e-6); assert.equal(ones.length, 2);
  close(ones.map((q) => q[1]), [-1, 1], 1e-6, 'repeated pole residues in increasing power');
  const [rc, pc] = call('residue', [V([1]), V([1, 0, 1])], 2);
  assert.ok(D(rc).im && D(pc).im, 'complex residues');
});
