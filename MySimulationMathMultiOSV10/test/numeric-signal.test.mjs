// Signal processing builtins of the numerics area (core/lib/numeric/signal).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as signal from '../core/lib/numeric/signal/index.js';
import { num, str, rowVec, colVec, matrix, toStr, isFuncHandle, MError } from '../core/value.js';

// A ctx like test/helpers/mockctx.mjs, but with only the signal builtins, so
// this file does not depend on the other areas being loadable.
const ctx = {
  warnings: [], state: {},
  warning(id, message) { this.warnings.push({ id, message }); },
  out() {}, errOut() {}, checkInterrupt() {},
  call(fn, args, nargout = 1) {
    let r;
    if (typeof fn === 'string') { const b = signal.builtins[fn] || signal.sharedImpl[fn]; if (!b) throw new MError('test:undefined', `Undefined function '${fn}'.`); r = b(args, nargout, ctx); }
    else if (isFuncHandle(fn) && fn.jsfn) r = fn.jsfn(args, nargout);
    else if (isFuncHandle(fn) && fn.name) return ctx.call(fn.name, args, nargout);
    else throw new MError('test:badCall', 'cannot call this value');
    return Array.isArray(r) ? r : r === undefined ? [] : [r];
  },
};
const call = (name, args, nargout = 1) => ctx.call(name, args, nargout);
const one = (name, ...args) => call(name, args, 1)[0];
const arr = (v) => Array.from(v.re);
const R = (a) => rowVec(a);
const S = (s) => str(s);
function close(actual, expected, tol = 1e-4, msg = '') {
  assert.equal(actual.length, expected.length, `${msg} length ${actual.length} vs ${expected.length}`);
  actual.forEach((x, i) => assert.ok(Math.abs(x - expected[i]) <= tol * Math.max(1, Math.abs(expected[i])), `${msg}[${i}] ${x} vs ${expected[i]}`));
}
/** |H(e^{jw})| of b/a at normalized frequency f (1 = Nyquist). */
function mag(b, a, f) {
  const w = Math.PI * f; let br = 0, bi = 0, ar = 0, ai = 0;
  b.forEach((c, k) => { br += c * Math.cos(w * k); bi -= c * Math.sin(w * k); });
  a.forEach((c, k) => { ar += c * Math.cos(w * k); ai -= c * Math.sin(w * k); });
  return Math.hypot(br, bi) / Math.hypot(ar, ai);
}
const ba = (r) => [arr(r[0]), arr(r[1])];

test('butter(2,0.5) matches the reference coefficients', () => {
  const [b, a] = ba(call('butter', [num(2), num(0.5)], 2));
  close(b, [0.292893218813452, 0.585786437626905, 0.292893218813452], 1e-12);
  close(a, [1, 0, 0.171572875253810], 1e-12);
});

test('butter(3,[0.2 0.5]) bandpass coefficients and -3 dB edges', () => {
  const [b, a] = ba(call('butter', [num(3), R([0.2, 0.5])], 2));
  close(b, [0.0495, 0, -0.1486, 0, 0.1486, 0, -0.0495], 1e-3);
  close(a, [1, -2.1206, 2.7247, -2.2895, 1.4662, -0.5652, 0.1378], 1e-4);
  assert.ok(Math.abs(mag(b, a, 0.2) - Math.SQRT1_2) < 1e-9);
  assert.ok(Math.abs(mag(b, a, 0.5) - Math.SQRT1_2) < 1e-9);
});

test('butter highpass, bandstop and analog designs', () => {
  const [b, a] = ba(call('butter', [num(4), num(0.3), S('high')], 2));
  assert.ok(mag(b, a, 0) < 1e-12); assert.ok(Math.abs(mag(b, a, 1) - 1) < 1e-12); assert.ok(Math.abs(mag(b, a, 0.3) - Math.SQRT1_2) < 1e-9);
  const [bs, as] = ba(call('butter', [num(2), R([0.3, 0.6]), S('stop')], 2));
  assert.ok(Math.abs(mag(bs, as, 0) - 1) < 1e-9); assert.ok(mag(bs, as, Math.sqrt(1) * 2 / Math.PI * Math.atan(Math.sqrt(Math.tan(0.15 * Math.PI) * Math.tan(0.3 * Math.PI)))) < 1e-6);
  const [bA, aA] = ba(call('butter', [num(2), num(1), S('s')], 2));
  close(bA, [0, 0, 1], 1e-12); close(aA, [1, Math.SQRT2, 1], 1e-12);
});

test('butter zero-pole-gain and state-space outputs', () => {
  const [z, p, k] = call('butter', [num(4), num(0.3)], 3);
  assert.equal(z.dims[0], 4); arr(z).forEach((x) => assert.ok(Math.abs(x + 1) < 1e-6));
  for (let i = 0; i < 4; i++) assert.ok(Math.hypot(p.re[i], p.im ? p.im[i] : 0) < 1);
  const [b] = ba(call('butter', [num(4), num(0.3)], 2));
  assert.ok(Math.abs(k.re[0] - b[0]) < 1e-12);
  const [A, B, C, D] = call('butter', [num(2), num(0.5)], 4);
  assert.deepEqual(A.dims, [2, 2]); assert.deepEqual(B.dims, [2, 1]); assert.deepEqual(C.dims, [1, 2]); assert.ok(Math.abs(D.re[0] - 0.292893218813452) < 1e-12);
});

test('cheby1 / cheby2 / ellip meet their ripple and attenuation specs', () => {
  const [b1, a1] = ba(call('cheby1', [num(2), num(1), num(0.4)], 2));
  const rp = 10 ** (-1 / 20);
  assert.ok(Math.abs(mag(b1, a1, 0) - rp) < 1e-9, 'even-order DC gain'); assert.ok(Math.abs(mag(b1, a1, 0.4) - rp) < 1e-9, 'passband edge');
  close(b1, [0.217979, 0.435958, 0.217979], 1e-4); close(a1, [1, -0.351351, 0.329656], 1e-4);
  const [b2, a2] = ba(call('cheby2', [num(3), num(40), num(0.4)], 2));
  assert.ok(Math.abs(mag(b2, a2, 0) - 1) < 1e-9); assert.ok(Math.abs(mag(b2, a2, 0.4) - 0.01) < 1e-9);
  for (let f = 0.41; f < 1; f += 0.01) assert.ok(mag(b2, a2, f) <= 0.01 + 1e-9);
  const [b3, a3] = ba(call('ellip', [num(4), num(0.5), num(60), num(0.3)], 2));
  const rp3 = 10 ** (-0.5 / 20);
  assert.ok(Math.abs(mag(b3, a3, 0) - rp3) < 1e-6); assert.ok(Math.abs(mag(b3, a3, 0.3) - rp3) < 1e-6);
  for (let f = 0; f < 0.3; f += 0.01) assert.ok(mag(b3, a3, f) >= rp3 - 1e-6 && mag(b3, a3, f) <= 1 + 1e-6);
  let peak = 0; for (let f = 0.6; f <= 1; f += 0.002) peak = Math.max(peak, mag(b3, a3, f));
  assert.ok(Math.abs(20 * Math.log10(peak) + 60) < 0.05, `stopband peak ${20 * Math.log10(peak)}`);
  const [b5, a5] = ba(call('ellip', [num(5), num(1), num(50), R([0.2, 0.4])], 2));
  assert.equal(a5.length, 11); assert.ok(Math.abs(mag(b5, a5, 0.2) - 10 ** (-1 / 20)) < 1e-5);
});

test('besself analog design and order estimators', () => {
  const [b, a] = ba(call('besself', [num(3), num(1)], 2));
  close(b, [0, 0, 0, 1], 1e-9); close(a, [1, 2.432880798339, 2.466212074330, 1], 1e-8);
  const [n, Wn] = call('buttord', [num(0.2), num(0.3), num(3), num(40)], 2);
  const N = n.re[0], W = Wn.re[0];
  const [bb, aa] = ba(call('butter', [num(N), num(W)], 2));
  assert.ok(20 * Math.log10(mag(bb, aa, 0.2)) >= -3 - 1e-6); assert.ok(20 * Math.log10(mag(bb, aa, 0.3)) <= -40 + 1e-6);
  const [n2, Wn2] = call('buttord', [num(0.2), num(0.3), num(3), num(40)], 2);
  assert.ok(n2.re[0] === N && Wn2.re[0] === W);
  assert.equal(call('cheb1ord', [num(0.2), num(0.3), num(3), num(40)], 2)[0].re[0], 6);
  assert.equal(call('ellipord', [num(0.2), num(0.3), num(3), num(40)], 2)[0].re[0], 4);
  const [nc2, wc2] = call('cheb2ord', [num(0.2), num(0.3), num(3), num(40)], 2);
  const [b2, a2] = ba(call('cheby2', [nc2, num(40), wc2], 2));
  assert.ok(20 * Math.log10(mag(b2, a2, 0.2)) >= -3 - 1e-6); assert.ok(20 * Math.log10(mag(b2, a2, 0.3)) <= -40 + 1e-6);
  const [ne, we] = call('ellipord', [R([0.2, 0.5]), R([0.1, 0.6]), num(1), num(40)], 2);
  assert.ok(ne.re[0] >= 2); assert.deepEqual(arr(we), [0.2, 0.5]);
});

test('fir1 window designs', () => {
  close(arr(one('fir1', num(4), num(0.5))), [0, 0.203712, 0.592575, 0.203712, 0], 1e-5);
  const b = arr(one('fir1', num(20), num(0.3)));
  assert.equal(b.length, 21); assert.ok(Math.abs(b.reduce((s, x) => s + x, 0) - 1) < 1e-12);
  b.forEach((x, i) => assert.ok(Math.abs(x - b[20 - i]) < 1e-15));
  const h = arr(one('fir1', num(21), num(0.3), S('high')));
  assert.equal(h.length, 23); assert.equal(ctx.warnings.at(-1).id, 'numeric:fir1:oddOrder');
  assert.ok(Math.abs(mag(h, [1], 1) - 1) < 1e-12);
  const bp = arr(one('fir1', num(30), R([0.3, 0.5])));
  assert.ok(Math.abs(mag(bp, [1], 0.4) - 1) < 1e-12);
  const bk = arr(one('fir1', num(10), num(0.4), one('kaiser', num(11), num(5))));
  assert.equal(bk.length, 11);
});

test('fir2, firls and firpm', () => {
  const b2 = arr(one('fir2', num(30), R([0, 0.5, 0.5, 1]), R([1, 1, 0, 0])));
  assert.equal(b2.length, 31); assert.ok(Math.abs(mag(b2, [1], 0.1) - 1) < 0.02); assert.ok(mag(b2, [1], 0.9) < 0.02);
  const bl = arr(one('firls', num(30), R([0, 0.4, 0.5, 1]), R([1, 1, 0, 0])));
  assert.equal(bl.length, 31); bl.forEach((x, i) => assert.ok(Math.abs(x - bl[30 - i]) < 1e-12));
  assert.ok(Math.abs(mag(bl, [1], 0.2) - 1) < 0.01); assert.ok(mag(bl, [1], 0.8) < 0.01);
  const [bp, err] = call('firpm', [num(30), R([0, 0.4, 0.5, 1]), R([1, 1, 0, 0])], 2);
  const h = arr(bp); assert.equal(h.length, 31); h.forEach((x, i) => assert.ok(Math.abs(x - h[30 - i]) < 1e-9));
  const d = err.re[0]; assert.ok(d > 0 && d < 0.05, `ripple ${d}`);
  let maxPass = 0, maxStop = 0;
  for (let f = 0; f <= 0.4; f += 0.002) maxPass = Math.max(maxPass, Math.abs(mag(h, [1], f) - 1));
  for (let f = 0.5; f <= 1; f += 0.002) maxStop = Math.max(maxStop, mag(h, [1], f));
  assert.ok(Math.abs(maxPass - d) < 0.1 * d && Math.abs(maxStop - d) < 0.1 * d, `equiripple ${maxPass} ${maxStop} ${d}`);
  const [h2] = call('firpm', [num(31), R([0, 0.3, 0.4, 1]), R([1, 1, 0, 0])], 2);
  assert.equal(h2.dims[1], 32);
});

test('kaiserord feeds fir1', () => {
  const [n, Wn, beta, ftype] = call('kaiserord', [R([1000, 1500]), R([1, 0]), R([0.05, 0.01]), num(8000)], 4);
  assert.equal(toStr(ftype), 'low'); assert.ok(Math.abs(Wn.re[0] - 0.3125) < 1e-12);
  assert.ok(Math.abs(beta.re[0] - (0.5842 * (40 - 21) ** 0.4 + 0.07886 * (40 - 21))) < 1e-12);
  assert.equal(n.re[0], Math.ceil((40 - 7.95) / 14.36 / (500 / 8000)));
});

test('window functions', () => {
  close(arr(one('hamming', num(5))), [0.08, 0.54, 1, 0.54, 0.08], 1e-12);
  close(arr(one('hann', num(5))), [0, 0.5, 1, 0.5, 0], 1e-12);
  close(arr(one('hanning', num(3))), [0.5, 1, 0.5], 1e-12);
  close(arr(one('blackman', num(3))), [0, 1, 0], 1e-12);
  close(arr(one('hamming', num(4), S('periodic'))), [0.08, 0.54, 1, 0.54], 1e-12);
  close(arr(one('bartlett', num(5))), [0, 0.5, 1, 0.5, 0], 1e-12);
  close(arr(one('triang', num(3))), [0.5, 1, 0.5], 1e-12);
  close(arr(one('triang', num(4))), [0.25, 0.75, 0.75, 0.25], 1e-12);
  close(arr(one('rectwin', num(3))), [1, 1, 1], 0);
  close(arr(one('kaiser', num(4), num(0))), [1, 1, 1, 1], 1e-12);
  close(arr(one('tukeywin', num(5), num(0.5))), [0, 1, 1, 1, 0], 1e-12);
  close(arr(one('gausswin', num(3))), [Math.exp(-0.5 * 2.5 ** 2), 1, Math.exp(-0.5 * 2.5 ** 2)], 1e-12);
  const c = arr(one('chebwin', num(7), num(50)));
  assert.equal(c.length, 7); assert.ok(Math.abs(Math.max(...c) - 1) < 1e-12); c.forEach((x, i) => assert.ok(Math.abs(x - c[6 - i]) < 1e-12));
  const c8 = arr(one('chebwin', num(8)));
  assert.equal(c8.length, 8); c8.forEach((x, i) => assert.ok(Math.abs(x - c8[7 - i]) < 1e-12));
  const bh = arr(one('blackmanharris', num(4)));
  close([bh[0]], [6e-5], 1e-3);
  for (const w of ['nuttallwin', 'flattopwin', 'barthannwin', 'bohmanwin', 'parzenwin', 'taylorwin']) assert.equal(one(w, num(9)).dims[0], 9, w);
  close(arr(one('window', { cls: 'function_handle', dims: [1, 1], name: 'hamming' }, num(5))), [0.08, 0.54, 1, 0.54, 0.08], 1e-12);
});

test('filter with initial/final conditions and matrices', () => {
  const [y, zf] = call('filter', [R([1]), R([1, -0.5]), R([1, 0, 0])], 2);
  close(arr(y), [1, 0.5, 0.25], 1e-15); close(arr(zf), [0.125], 1e-15);
  const [y2] = call('filter', [R([1]), R([1, -0.5]), R([0, 0]), num(0.125)], 1);
  close(arr(y2), [0.125, 0.0625], 1e-15);
  const m = one('filter', R([1, 1]), num(1), matrix([[1, 10], [2, 20], [3, 30]]));
  close(arr(m), [1, 3, 5, 10, 30, 50], 1e-15);
});

test('filtfilt has zero phase and keeps constants', () => {
  const [b, a] = call('butter', [num(4), num(0.2)], 2);
  const N = 300; const x = Array.from({ length: N }, (_, i) => Math.sin(2 * Math.PI * 0.01 * i));
  const y = arr(one('filtfilt', b, a, R(x)));
  for (let i = 50; i < N - 50; i++) assert.ok(Math.abs(y[i] - x[i]) < 2e-3, `sample ${i}`);
  const c = arr(one('filtfilt', b, a, R(new Array(40).fill(3))));
  c.forEach((v) => assert.ok(Math.abs(v - 3) < 1e-9));
  const sos = one('tf2sos', b, a);
  const ys = arr(one('filtfilt', sos, num(1), R(x)));
  for (let i = 60; i < N - 60; i++) assert.ok(Math.abs(ys[i] - y[i]) < 1e-6);
});

test('freqz, freqs, grpdelay, phasez, impz, stepz', () => {
  const [h, w] = call('freqz', [R([0.5, 0.5]), num(1)], 2);
  assert.equal(h.dims[0], 512); assert.ok(Math.abs(h.re[0] - 1) < 1e-15); assert.ok(Math.abs(w.re[511] - Math.PI * 511 / 512) < 1e-15);
  const [h4, f4] = call('freqz', [R([1, 0]), num(1), num(4), num(100)], 2);
  close(arr(f4), [0, 12.5, 25, 37.5], 1e-12); assert.equal(h4.dims[0], 4);
  const [hw] = call('freqz', [R([1, 1]), num(1), num(4), S('whole')], 2);
  assert.ok(Math.abs(hw.re[2]) < 1e-15);
  const [hs, ws] = call('freqs', [R([1]), R([1, 1]), R([0, 1])], 2);
  close(arr(hs), [1, 0.5], 1e-15); close(Array.from(hs.im), [0, -0.5], 1e-15); assert.deepEqual(arr(ws), [0, 1]);
  const [gd] = call('grpdelay', [R([0, 0, 1]), num(1), num(8)], 2);
  arr(gd).forEach((v) => assert.ok(Math.abs(v - 2) < 1e-12));
  const [ph] = call('phasez', [R([0, 1]), num(1), num(4)], 2);
  close(arr(ph), [0, -Math.PI / 4, -Math.PI / 2, -3 * Math.PI / 4], 1e-12);
  const [hi, ti] = call('impz', [R([1]), R([1, -0.5]), num(4)], 2);
  close(arr(hi), [1, 0.5, 0.25, 0.125], 1e-15); close(arr(ti), [0, 1, 2, 3], 0);
  const [hauto] = call('impz', [R([1]), R([1, -0.5])], 2); assert.ok(hauto.dims[0] >= 14);
  const [st] = call('stepz', [R([1]), R([1, -0.5]), num(3)], 2);
  close(arr(st), [1, 1.5, 1.75], 1e-15);
});

test('correlation: xcorr and xcov', () => {
  const [r, lags] = call('xcorr', [R([1, 2, 3])], 2);
  close(arr(r), [3, 8, 14, 8, 3], 1e-12); close(arr(lags), [-2, -1, 0, 1, 2], 0); assert.equal(r.dims[0], 1);
  close(arr(one('xcorr', R([1, 2, 3]), S('biased'))), [1, 8 / 3, 14 / 3, 8 / 3, 1], 1e-12);
  close(arr(one('xcorr', R([1, 2, 3]), S('unbiased'))), [3, 4, 14 / 3, 4, 3], 1e-12);
  close(arr(one('xcorr', R([1, 2, 3]), S('normalized'))), [3 / 14, 8 / 14, 1, 8 / 14, 3 / 14], 1e-12);
  close(arr(one('xcorr', R([1, 2, 3]), R([0, 1, 0]))), [0, 1, 2, 3, 0], 1e-12);
  close(arr(one('xcorr', R([1, 2, 3]), num(1))), [8, 14, 8], 1e-12);
  const rm = one('xcorr', matrix([[1, 0], [2, 1]]));
  assert.deepEqual(rm.dims, [3, 4]);
  close(arr(one('xcov', R([1, 2, 3]))), [-1, 0, 2, 0, -1], 1e-12);
  const big = Array.from({ length: 2000 }, (_, i) => Math.sin(i / 7));
  const rb = arr(one('xcorr', R(big), num(3))); const direct = (l) => big.reduce((s, v, k) => s + (k + l < big.length && k + l >= 0 ? big[k + l] * v : 0), 0);
  close(rb, [-3, -2, -1, 0, 1, 2, 3].map(direct), 1e-9);
});

test('findpeaks with options and outputs', () => {
  const y = R([0, 2, 1, 3, 1, 5, 0]);
  const [pks, locs, w, p] = call('findpeaks', [y], 4);
  close(arr(pks), [2, 3, 5], 0); close(arr(locs), [2, 4, 6], 0); close(arr(p), [1, 2, 5], 1e-12);
  assert.equal(w.dims[1], 3);
  close(arr(call('findpeaks', [y, S('MinPeakHeight'), num(2.5)], 2)[1]), [4, 6], 0);
  close(arr(call('findpeaks', [y, S('MinPeakDistance'), num(3)], 2)[1]), [2, 6], 0);
  close(arr(call('findpeaks', [y, S('SortStr'), S('descend'), S('NPeaks'), num(2)], 2)[0]), [5, 3], 0);
  close(arr(call('findpeaks', [y, S('MinPeakProminence'), num(1.5)], 2)[1]), [4, 6], 0);
  close(arr(call('findpeaks', [y, S('Threshold'), num(1.5)], 2)[1]), [4, 6], 0);
  close(arr(call('findpeaks', [R([0, 1, 1, 0])], 2)[1]), [2], 0);
  const [, lx] = call('findpeaks', [y, R([0, 10, 20, 30, 40, 50, 60])], 2); close(arr(lx), [10, 30, 50], 0);
});

test('multirate: resample, upfirdn, upsample, downsample, decimate, interp', () => {
  const N = 100; const x = Array.from({ length: N }, (_, i) => Math.sin(2 * Math.PI * i / 50));
  const y = arr(one('resample', R(x), num(3), num(2)));
  assert.equal(y.length, 150);
  for (let k = 30; k < 120; k++) assert.ok(Math.abs(y[k] - Math.sin(2 * Math.PI * (k * 2 / 3) / 50)) < 5e-3, `resample ${k}`);
  assert.equal(one('resample', colVec(x), num(1), num(4)).dims[0], 25);
  close(arr(one('upsample', R([1, 2, 3]), num(2))), [1, 0, 2, 0, 3, 0], 0);
  close(arr(one('upsample', R([1, 2]), num(3), num(1))), [0, 1, 0, 0, 2, 0], 0);
  close(arr(one('downsample', R([1, 2, 3, 4, 5]), num(2))), [1, 3, 5], 0);
  close(arr(one('upfirdn', R([1, 2, 3]), R([1, 1]), num(2), num(1))), [1, 1, 2, 2, 3, 3], 0);
  close(arr(one('upfirdn', R([1, 2, 3, 4]), R([1]), num(1), num(2))), [1, 3], 0);
  const d = arr(one('decimate', R(x), num(2)));
  assert.equal(d.length, 50); for (let k = 5; k < 45; k++) assert.ok(Math.abs(d[k] - Math.sin(2 * Math.PI * (2 * k + 1) / 50)) < 0.01, `decimate ${k}`);
  const df = arr(one('decimate', R(x), num(2), S('fir'))); assert.equal(df.length, 50);
  const it = arr(one('interp', R(x), num(4)));
  assert.equal(it.length, 400); for (let k = 0; k < N; k++) assert.ok(Math.abs(it[4 * k] - x[k]) < 1e-12);
  for (let k = 40; k < 360; k++) assert.ok(Math.abs(it[k] - Math.sin(2 * Math.PI * k / 200)) < 2e-3);
});

test('hilbert of a cosine is cos + i sin; envelope', () => {
  const N = 64; const x = Array.from({ length: N }, (_, i) => Math.cos(2 * Math.PI * 4 * i / N));
  const h = one('hilbert', R(x));
  for (let i = 0; i < N; i++) { assert.ok(Math.abs(h.re[i] - x[i]) < 1e-12); assert.ok(Math.abs(h.im[i] - Math.sin(2 * Math.PI * 4 * i / N)) < 1e-12); }
  const am = Array.from({ length: 256 }, (_, i) => (2 + Math.cos(2 * Math.PI * i / 256)) * Math.cos(2 * Math.PI * 32 * i / 256));
  const [up, lo] = call('envelope', [colVec(am)], 2);
  for (let i = 20; i < 236; i++) assert.ok(Math.abs(up.re[i] - (2 + Math.cos(2 * Math.PI * i / 256))) < 0.02, `env ${i}`);
  assert.ok(Math.abs(lo.re[100] + up.re[100] - 2 * am.reduce((s, v) => s + v, 0) / 256) < 1e-9);
  const [ur] = call('envelope', [colVec(am), num(16), S('rms')], 2); assert.equal(ur.dims[0], 256);
  const [up2] = call('envelope', [colVec(am), num(4), S('peak')], 2); assert.ok(up2.re[128] > 0.9 && up2.re[128] < 1.2);
});

test('spectral estimates: periodogram (Parseval), pwelch, spectrogram, cpsd, tfestimate, mscohere', () => {
  const N = 256, fs = 100; const x = Array.from({ length: N }, (_, i) => Math.sin(2 * Math.PI * 12.5 * i / fs) + 0.5);
  const [pxx, f] = call('periodogram', [R(x), colVec([]), num(N), num(fs)], 2);
  assert.equal(pxx.dims[0], N / 2 + 1); assert.ok(Math.abs(f.re[1] - fs / N) < 1e-12);
  const total = arr(pxx).reduce((s, v) => s + v, 0) * fs / N; const ms = x.reduce((s, v) => s + v * v, 0) / N;
  assert.ok(Math.abs(total - ms) < 1e-9, `Parseval ${total} ${ms}`);
  const peak = arr(pxx).indexOf(Math.max(...arr(pxx).slice(1))); assert.ok(Math.abs(f.re[peak] - 12.5) < 0.5);
  const [pw, fw] = call('pwelch', [R(x), num(64), num(32), num(64), num(fs)], 2);
  assert.equal(pw.dims[0], 33); assert.ok(Math.abs(fw.re[32] - 50) < 1e-12);
  const [pw2] = call('pwelch', [R(x), num(64), num(32), num(64), num(fs), S('twosided')], 2); assert.equal(pw2.dims[0], 64);
  const [pd, wd] = call('pwelch', [R(x)], 2); assert.equal(pd.dims[0], 129); assert.ok(Math.abs(wd.re[128] - Math.PI) < 1e-12);
  const [s, fsg, t, ps] = call('spectrogram', [R(x), num(64), num(32), num(64), num(fs)], 4);
  assert.deepEqual(s.dims, [33, 7]); assert.equal(fsg.dims[0], 33); assert.equal(t.dims[1], 7); assert.ok(Math.abs(t.re[0] - 0.32) < 1e-12); assert.deepEqual(ps.dims, [33, 7]);
  const y = one('filter', R([0.5, 0.5]), num(1), R(x));
  const [pxy] = call('cpsd', [R(x), y, num(64), num(32), num(64), num(fs)], 2); assert.equal(pxy.dims[0], 33);
  const [txy] = call('tfestimate', [R(x), y, num(64), num(32), num(64), num(fs)], 2);
  const hTrue = (fq) => Math.abs(Math.cos(Math.PI * fq / fs));
  const kk = 8; assert.ok(Math.abs(Math.hypot(txy.re[kk], txy.im[kk]) - hTrue(fsg.re[kk])) < 0.02);
  const [cxy] = call('mscohere', [R(x), y, num(64), num(32), num(64), num(fs)], 2); assert.ok(Math.abs(cxy.re[8] - 1) < 1e-6);
});

test('sos conversions and sosfilt', () => {
  const [b, a] = call('butter', [num(4), num(0.3)], 2);
  const sos = one('tf2sos', b, a); assert.deepEqual(sos.dims, [2, 6]);
  const [b2, a2] = call('sos2tf', [sos], 2);
  close(arr(b2), arr(b), 1e-9); close(arr(a2), arr(a), 1e-9);
  const [sg, g] = call('tf2sos', [b, a], 2); assert.ok(Math.abs(g.re[0] - b.re[0]) < 1e-12); assert.equal(sg.re[0], 1);
  const x = R(Array.from({ length: 50 }, (_, i) => Math.sin(i)));
  close(arr(one('sosfilt', sos, x)), arr(one('filter', b, a, x)), 1e-9);
  const [z, p, k] = call('sos2zp', [sos], 3); assert.equal(z.dims[0], 4); assert.equal(p.dims[0], 4); assert.ok(Math.abs(k.re[0] - b.re[0]) < 1e-9);
  const [z0, p0, k0] = call('butter', [num(4), num(0.3)], 3);
  const s2 = one('zp2sos', z0, p0, k0); close(arr(one('sosfilt', s2, x)), arr(one('filter', b, a, x)), 1e-8);
});

test('bilinear (tf, zpk, ss, prewarp) and impinvar', () => {
  const [bz, az] = call('bilinear', [R([1]), R([1, 1]), num(1)], 2);
  close(arr(bz), [1 / 3, 1 / 3], 1e-12); close(arr(az), [1, -1 / 3], 1e-12);
  const [zd, pd, kd] = call('bilinear', [colVec([]), colVec([-1]), num(1), num(1)], 3);
  close(arr(zd), [-1], 1e-12); close(arr(pd), [1 / 3], 1e-12); close(arr(kd), [1 / 3], 1e-12);
  const [Ad, Bd, Cd, Dd] = call('bilinear', [num(-1), num(1), num(1), num(0), num(1)], 4);
  // same transfer function as the tf form: H(z) = Cd (zI-Ad)^-1 Bd + Dd at z = -1 → 0, at z = 1 → 1
  const Hz = (zz) => Cd.re[0] * Bd.re[0] / (zz - Ad.re[0]) + Dd.re[0];
  assert.ok(Math.abs(Hz(1) - 1) < 1e-12); assert.ok(Math.abs(Ad.re[0] - 1 / 3) < 1e-12);
  const [bp, ap] = call('bilinear', [R([1]), R([1, 1]), num(10), num(1)], 2);
  // prewarping keeps the -3 dB point at 1 rad/s ↔ fp = 1 Hz? the match frequency is fp in Hz: |H| at 1 Hz equals analog |H(j 2 pi)|
  const an = 1 / Math.hypot(1, 2 * Math.PI); assert.ok(Math.abs(mag(arr(bp), arr(ap), 1 / 5) - an) < 1e-9);
  const [bi, ai] = call('impinvar', [R([1]), R([1, 1]), num(1)], 2);
  close(arr(bi), [1, 0], 1e-12); close(arr(ai), [1, -Math.exp(-1)], 1e-12);
  const [b3, a3] = call('impinvar', [R([1]), R([1, 3, 2]), num(10)], 2);
  // impulse response samples T*h(nT), h(t) = e^-t - e^-2t
  const hh = arr(one('impz', b3, a3, num(5))); hh.forEach((v, n) => assert.ok(Math.abs(v - 0.1 * (Math.exp(-n / 10) - Math.exp(-2 * n / 10))) < 1e-12));
});

test('residuez forward and inverse', () => {
  const [r, p, k] = call('residuez', [R([1, 0.5]), R([1, -0.75, 0.125])], 3);
  assert.equal(r.dims[0], 2); assert.equal(k.dims[1], 0);
  const [b, a] = call('residuez', [r, p, k], 2);
  close(arr(b).slice(0, 2), [1, 0.5], 1e-12); close(arr(a), [1, -0.75, 0.125], 1e-12);
  const [, , k2] = call('residuez', [R([1, 2, 3]), R([1, 0.5])], 3); assert.equal(k2.dims[1], 2);
});

test('smoothing: medfilt1, sgolay, sgolayfilt', () => {
  close(arr(one('medfilt1', R([1, 5, 2, 8, 3]))), [1, 2, 5, 3, 3], 0);
  close(arr(one('medfilt1', R([1, 5, 2, 8, 3]), num(3), S('truncate'))), [3, 2, 5, 3, 5.5], 0);
  const [B] = call('sgolay', [num(2), num(5)], 2); assert.deepEqual(B.dims, [5, 5]);
  close([B.re[2], B.re[7], B.re[12]], [-3 / 35, 12 / 35, 17 / 35], 1e-12);
  const q = Array.from({ length: 20 }, (_, i) => 0.5 * i * i - 3 * i + 2);
  close(arr(one('sgolayfilt', R(q), num(2), num(7))), q, 1e-9);
});

test('cepstra: cceps/icceps round trip, rceps minimum phase', () => {
  const x = R([1, 0.5, 0.2, ...new Array(61).fill(0)]);
  const [xh, nd] = call('cceps', [x], 2);
  close(arr(one('icceps', xh, nd)), arr(x), 1e-9);
  const [y, ym] = call('rceps', [x], 2); assert.equal(y.dims[1], 64); close(arr(ym), arr(x), 1e-9);
});

test('conv2, filter2, convn, unwrap, sinc, diric', () => {
  const A = matrix([[1, 2], [3, 4]]), B = matrix([[1, 1]]);
  close(arr(one('conv2', A, B)), [1, 3, 3, 7, 2, 4], 0);
  assert.deepEqual(one('conv2', A, B, S('same')).dims, [2, 2]); close(arr(one('conv2', A, B, S('valid'))), [3, 7], 0);
  close(arr(one('conv2', R([1, 1]), R([1]), A)), arr(one('conv2', A, matrix([[1], [1]]))), 0);
  close(arr(one('filter2', matrix([[1, 2]]), A)), [5, 11, 2, 4], 0);
  close(arr(one('convn', R([1, 2]), R([1, 1]))), [1, 3, 2], 0);
  close(arr(one('unwrap', R([0, 3, 6.5, 0.2]))), [0, 3, 6.5 - 2 * Math.PI, 0.2], 1e-12);
  close(arr(one('sinc', R([0, 0.5, 1]))), [1, 2 / Math.PI, 0], 1e-15);
  close(arr(one('diric', R([0, Math.PI, 2 * Math.PI]), num(3))), [1, -1 / 3, 1], 1e-12);
});

test('waveforms and dB conversions', () => {
  close(arr(one('square', R([0.5, 4]))), [1, -1], 0);
  close(arr(one('square', R([1, 2]), num(25))), [1, -1], 0);
  close(arr(one('sawtooth', R([0, Math.PI]))), [-1, 0], 1e-12);
  close(arr(one('sawtooth', R([Math.PI]), num(0.5))), [1], 1e-12);
  close(arr(one('rectpuls', R([-0.5, 0, 0.5]))), [1, 1, 0], 0);
  close(arr(one('tripuls', R([-0.25, 0, 0.25]))), [0.5, 1, 0.5], 1e-12);
  close(arr(one('chirp', R([0, 0.5]), num(0), num(1), num(2))), [1, Math.cos(2 * Math.PI * 0.25)], 1e-12);
  const g = arr(one('gauspuls', R([0]), num(1000), num(0.5))); close(g, [1], 1e-12);
  const tc = one('gauspuls', S('cutoff'), num(1000), num(0.5), num(-6), num(-60)); assert.ok(tc.re[0] > 0);
  close(arr(one('pulstran', R([0, 1, 2, 3]), R([1, 3]), S('rectpuls'))), [0, 1, 0, 1], 0);
  close(arr(one('pulstran', R([0, 0.5, 1]), R([0]), R([1, 2, 3]), num(2))), [1, 2, 3], 1e-12);
  close(arr(one('db2mag', R([20, 0]))), [10, 1], 1e-12); close(arr(one('mag2db', R([10, 1]))), [20, 0], 1e-12);
  close(arr(one('pow2db', R([100]))), [20], 1e-12); close(arr(one('db2pow', R([20]))), [100], 1e-12);
  close(arr(one('fftfilt', R([1, 1]), R([1, 2, 3]))), [1, 3, 5], 1e-12);
});

test('designfilt and digitalFilter methods', () => {
  const d = one('designfilt', S('lowpassiir'), S('FilterOrder'), num(4), S('HalfPowerFrequency'), num(0.3));
  assert.equal(d.cls, 'digitalFilter');
  const [b, a] = call('butter', [num(4), num(0.3)], 2);
  const [db, da] = signal.classes.digitalFilter.methods.tf([d], 2);
  close(arr(db), arr(b), 1e-9); close(arr(da), arr(a), 1e-9);
  const x = R(Array.from({ length: 40 }, (_, i) => Math.cos(i / 3)));
  close(arr(signal.classes.digitalFilter.methods.filter([d, x], 1)), arr(one('filter', b, a, x)), 1e-9);
  const [h] = call('freqz', [d, num(8)], 2); assert.ok(Math.abs(h.re[0] - 1) < 1e-9);
  const df = one('designfilt', S('lowpassfir'), S('FilterOrder'), num(20), S('CutoffFrequency'), num(100), S('SampleRate'), num(1000));
  close(arr(df.props.Coefficients), arr(one('fir1', num(20), num(0.2))), 1e-12);
  assert.equal(toStr(df.props.ImpulseResponse), 'fir');
  const dk = one('designfilt', S('highpassfir'), S('StopbandFrequency'), num(0.25), S('PassbandFrequency'), num(0.35), S('PassbandRipple'), num(0.5), S('StopbandAttenuation'), num(65));
  const hk = arr(dk.props.Coefficients); assert.ok(mag(hk, [1], 0.1) < 10 ** (-60 / 20)); assert.ok(Math.abs(mag(hk, [1], 0.8) - 1) < 0.01);
  const de = one('designfilt', S('bandpassiir'), S('FilterOrder'), num(8), S('HalfPowerFrequency1'), num(0.2), S('HalfPowerFrequency2'), num(0.4));
  assert.deepEqual(de.props.Coefficients.dims, [4, 6]);
  const txt = signal.classes.digitalFilter.display(d, 'd'); assert.match(txt, /digitalFilter with properties/);
  assert.equal(one('filtord', b, a).re[0], 4); assert.equal(one('isfir', R([1, 2, 1])).re[0], 1); assert.equal(one('islinphase', R([1, 2, 1])).re[0], 1);
  assert.equal(one('isminphase', R([1, 0.5])).re[0], 1); assert.equal(one('ismaxphase', R([0.5, 1])).re[0], 1);
  assert.throws(() => one('designfilt', S('notafilter')), /not supported/);
});

test('argument errors use numeric identifiers', () => {
  assert.throws(() => one('butter', num(2), num(1.5)), (e) => e.identifier === 'numeric:butter:badWn');
  assert.throws(() => one('fir1', num(0), num(0.5)), (e) => e.identifier === 'numeric:fir1:badOrder');
  assert.throws(() => one('filtfilt', R([1, 1]), num(1), R([1, 2])), (e) => e.identifier === 'numeric:filtfilt:tooShort');
});

test('every signal builtin has English and Korean help with syntax', () => {
  for (const name of Object.keys(signal.builtins)) {
    const h = signal.help[name]; assert.ok(h, `help for ${name}`);
    assert.ok(h.en && h.ko && h.syntax.length, `complete help for ${name}`);
  }
});

test('source files avoid the commercial product names', () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../core/lib/numeric/signal');
  const re = new RegExp(['mat', 'lab|simu', 'link'].join(''), 'i');
  for (const f of fs.readdirSync(dir)) assert.ok(!re.test(fs.readFileSync(path.join(dir, f), 'utf8')), f);
  assert.ok(!re.test(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')));
});
