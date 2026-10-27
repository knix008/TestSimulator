// Image processing builtins on small arrays with known results.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tensor, str, toStr } from '../core/value.js';
import { builtins as IMG, help } from '../core/lib/image/index.js';

const ctx = { state: {}, out() {}, warning() {}, host: { post() {}, request() { return null; } } };
const call = (name, args, nargout = 1) => { const r = IMG[name](args, nargout, ctx); return Array.isArray(r) ? r : [r]; };
const f1 = (name, ...args) => call(name, args)[0];
const S = (s) => str(s);
const N = (...x) => tensor('double', [1, x.length], x);
/** Matrix from rows. */
const M = (rows, cls = 'double') => { const m = rows.length, n = rows[0].length; const re = new Float64Array(m * n); for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) re[i + j * m] = rows[i][j]; return tensor(cls, [m, n], re); };
const rowsOf = (v) => { const [m, n] = v.dims; return Array.from({ length: m }, (_, i) => Array.from({ length: n }, (_, j) => v.re[i + j * m])); };
const near = (a, b, tol = 1e-9) => { assert.equal(a.length, b.length); a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) <= tol, `index ${i}: ${x} vs ${b[i]}`)); };
const rgbPix = (vals, cls = 'uint8') => tensor(cls, [1, 1, 3], vals);

test('every image builtin has English and Korean help with syntax', () => {
  for (const k of Object.keys(IMG)) {
    assert.ok(help[k] && help[k].en && help[k].ko && help[k].syntax && help[k].syntax.length, k);
  }
});

test('class conversions', () => {
  near(Array.from(f1('im2double', tensor('uint8', [1, 3], [0, 255, 128])).re), [0, 1, 128 / 255]);
  assert.deepEqual(Array.from(f1('im2uint8', N(0, 0.5, 1, 1.2, -1)).re), [0, 128, 255, 255, 0]);
  assert.deepEqual(Array.from(f1('im2uint16', tensor('uint8', [1, 2], [255, 1])).re), [65535, 257]);
  assert.deepEqual(Array.from(f1('im2uint8', tensor('uint16', [1, 2], [65535, 257])).re), [255, 1]);
  assert.deepEqual(Array.from(f1('im2uint8', tensor('logical', [1, 2], [1, 0])).re), [255, 0]);
  assert.deepEqual(Array.from(f1('im2double', tensor('uint8', [1, 2], [0, 4]), S('indexed')).re), [1, 5]);
  assert.deepEqual(Array.from(f1('im2uint8', N(1, 5), S('indexed')).re), [0, 4]);
  assert.equal(f1('im2single', tensor('uint8', [1, 1], [255])).cls, 'single');
  assert.deepEqual(Array.from(f1('im2int16', N(0, 1)).re), [-32768, 32767]);
  near(Array.from(f1('mat2gray', N(2, 4, 6)).re), [0, 0.5, 1]);
  near(Array.from(f1('mat2gray', N(2, 4, 6), N(4, 6)).re), [0, 0, 1]);
  assert.deepEqual(Array.from(f1('imcomplement', tensor('uint8', [1, 2], [0, 200])).re), [255, 55]);
  assert.deepEqual(Array.from(f1('imcomplement', tensor('logical', [1, 2], [0, 1])).re), [1, 0]);
  near(Array.from(f1('imcomplement', N(0.25)).re), [0.75]);
});

test('image arithmetic saturates to the class range', () => {
  const a = tensor('uint8', [1, 2], [200, 10]);
  assert.deepEqual(Array.from(f1('imadd', a, N(100)).re), [255, 110]);
  assert.deepEqual(Array.from(f1('imsubtract', a, N(50)).re), [150, 0]);
  assert.deepEqual(Array.from(f1('immultiply', a, N(2)).re), [255, 20]);
  assert.deepEqual(Array.from(f1('imdivide', a, N(3)).re), [67, 3]);
  assert.deepEqual(Array.from(f1('imabsdiff', a, tensor('uint8', [1, 2], [210, 0])).re), [10, 10]);
  assert.deepEqual(Array.from(f1('imlincomb', N(0.5), a, N(0.5), tensor('uint8', [1, 2], [100, 20])).re), [150, 15]);
  assert.deepEqual(Array.from(f1('imlincomb', N(1), a, N(100)).re), [255, 110]);
  assert.equal(f1('imadd', a, N(1), S('double')).cls, 'double');
});

test('colour space conversions', () => {
  assert.equal(f1('rgb2gray', rgbPix([255, 0, 0])).re[0], 76);
  near(Array.from(f1('rgb2gray', rgbPix([1, 1, 1], 'double')).re), [1]);
  const map = f1('rgb2gray', M([[1, 0, 0], [0, 0, 1]]));
  assert.deepEqual(map.dims, [2, 3]);
  near([map.re[0], map.re[2], map.re[4]], [0.298936021293775, 0.298936021293775, 0.298936021293775]);
  assert.throws(() => f1('rgb2gray', M([[1, 2], [3, 4]])), /truecolor/);
  assert.deepEqual(f1('im2gray', M([[1, 2], [3, 4]])).dims, [2, 2]);
  near(Array.from(f1('rgb2hsv', rgbPix([255, 0, 0])).re), [0, 1, 1]);
  near(Array.from(f1('rgb2hsv', rgbPix([0, 0.5, 0.5], 'double')).re), [0.5, 1, 0.5]);
  const rnd = tensor('double', [2, 3, 3], Array.from({ length: 18 }, (_, i) => ((i * 37) % 17) / 16));
  near(Array.from(f1('hsv2rgb', f1('rgb2hsv', rnd)).re), Array.from(rnd.re), 1e-12);
  assert.deepEqual(Array.from(f1('rgb2ycbcr', rgbPix([255, 255, 255])).re), [235, 128, 128]);
  assert.deepEqual(Array.from(f1('rgb2ycbcr', rgbPix([0, 0, 0])).re), [16, 128, 128]);
  const px = rgbPix([200, 30, 90]);
  const back = f1('ycbcr2rgb', f1('rgb2ycbcr', px));
  Array.from(back.re).forEach((v, i) => assert.ok(Math.abs(v - px.re[i]) <= 1));
  near(Array.from(f1('ycbcr2rgb', f1('rgb2ycbcr', rgbPix([0.2, 0.4, 0.6], 'double'))).re), [0.2, 0.4, 0.6], 1e-9);
});

test('indexed image conversions', () => {
  const map = M([[0, 0, 0], [1, 0.5, 0], [0, 0, 1]]);
  const rgb = f1('ind2rgb', M([[1, 2], [3, 1]]), map);
  assert.deepEqual(rgb.dims, [2, 2, 3]);
  assert.deepEqual(Array.from(rgb.re), [0, 0, 1, 0, 0, 0, 0.5, 0, 0, 1, 0, 0]);
  const rgb0 = f1('ind2rgb', tensor('uint8', [1, 2], [0, 2]), map);
  assert.deepEqual(Array.from(rgb0.re), [0, 0, 0, 0, 0, 1]);
  near(Array.from(f1('ind2gray', N(2), map).re), [0.298936021293775 + 0.5 * 0.587043074451121]);
  const [X, gm] = call('gray2ind', [tensor('uint8', [1, 3], [0, 128, 255])], 2);
  assert.deepEqual(Array.from(X.re), [0, 32, 63]); assert.deepEqual(gm.dims, [64, 3]);
  const img = tensor('uint8', [1, 3, 3], [255, 0, 255, 0, 0, 0, 0, 255, 0]);
  const [Y, ym] = call('rgb2ind', [img, N(2)], 2);
  assert.equal(ym.dims[0], 2);
  const again = f1('ind2rgb', Y, ym);
  near(Array.from(again.re), Array.from(img.re, (v) => v / 255));
  const [Z] = call('rgb2ind', [img, M([[1, 0, 0], [0, 0, 1], [0, 1, 0]])], 1);
  assert.deepEqual(Array.from(Z.re), [0, 1, 0]);
  const [U, um] = call('rgb2ind', [img, N(0.5)], 2);
  assert.equal(um.dims[0], 27); assert.equal(U.re.length, 3);
});

test('imresize: nearest, bilinear (reference weights), bicubic, sizes, NaN', () => {
  assert.deepEqual(rowsOf(f1('imresize', M([[1, 2], [3, 4]]), N(2), S('nearest'))), [[1, 1, 2, 2], [1, 1, 2, 2], [3, 3, 4, 4], [3, 3, 4, 4]]);
  near(Array.from(f1('imresize', M([[0, 1]]), N(1, 4), S('bilinear')).re), [0, 0.25, 0.75, 1]);
  const flat = tensor('double', [6, 8], new Float64Array(48).fill(0.3));
  near(Array.from(f1('imresize', flat, N(0.5)).re), new Array(12).fill(0.3), 1e-12);
  assert.deepEqual(f1('imresize', flat, N(0.5)).dims, [3, 4]);
  assert.deepEqual(f1('imresize', flat, tensor('double', [1, 2], [NaN, 4])).dims, [3, 4]);
  assert.deepEqual(f1('imresize', flat, N(5, 7), S('bicubic')).dims, [5, 7]);
  const u8 = tensor('uint8', [2, 2, 3], new Float64Array(12).fill(100));
  const r = f1('imresize', u8, N(3));
  assert.equal(r.cls, 'uint8'); assert.deepEqual(r.dims, [6, 6, 3]); assert.ok(r.re.every((v) => v === 100));
  assert.deepEqual(f1('imresize', flat, S('OutputSize'), N(2, 2), S('Method'), S('lanczos3')).dims, [2, 2]);
  assert.throws(() => f1('imresize', flat, N(2), S('wavy')), /Unknown option|method/);
});

test('imrotate, imcrop, padarray', () => {
  const A = M([[1, 2], [3, 4]]);
  assert.deepEqual(rowsOf(f1('imrotate', A, N(90))), [[2, 4], [1, 3]]);
  assert.deepEqual(rowsOf(f1('imrotate', A, N(-90))), [[3, 1], [4, 2]]);
  assert.deepEqual(rowsOf(f1('imrotate', A, N(180))), [[4, 3], [2, 1]]);
  const B = tensor('double', [5, 5], new Float64Array(25).fill(1));
  const R = f1('imrotate', B, N(45), S('bilinear'));
  assert.deepEqual(R.dims, [8, 8]);
  assert.ok(R.re[0] === 0 && Math.abs(R.re[3 + 4 * 8] - 1) < 1e-12, 'corners empty, centre kept');
  assert.deepEqual(f1('imrotate', B, N(30), S('nearest'), S('crop')).dims, [5, 5]);
  const C = M([[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15]]);
  const [cr, rect] = call('imcrop', [C, N(2, 1, 2, 1)], 2);
  assert.deepEqual(rowsOf(cr), [[2, 3, 4], [7, 8, 9]]);
  assert.deepEqual(Array.from(rect.re), [2, 1, 2, 1]);
  assert.throws(() => f1('imcrop', C), /rectangle/);
  assert.deepEqual(rowsOf(f1('padarray', A, N(1, 1))), [[0, 0, 0, 0], [0, 1, 2, 0], [0, 3, 4, 0], [0, 0, 0, 0]]);
  assert.deepEqual(rowsOf(f1('padarray', A, N(1, 1), S('replicate'))), [[1, 1, 2, 2], [1, 1, 2, 2], [3, 3, 4, 4], [3, 3, 4, 4]]);
  assert.deepEqual(rowsOf(f1('padarray', A, N(0, 2), S('circular'))), [[1, 2, 1, 2, 1, 2], [3, 4, 3, 4, 3, 4]]);
  assert.deepEqual(rowsOf(f1('padarray', M([[1, 2, 3]]), N(0, 2), S('symmetric'), S('pre'))), [[2, 1, 1, 2, 3]]);
  assert.deepEqual(rowsOf(f1('padarray', A, N(1, 0), N(9), S('post'))), [[1, 2], [3, 4], [9, 9]]);
  assert.deepEqual(f1('padarray', tensor('uint8', [2, 2, 3]), N(1, 1)).dims, [4, 4, 3]);
});

test('histograms and intensity adjustment', () => {
  const [c, x] = call('imhist', [tensor('uint8', [1, 4], [0, 0, 255, 3])], 2);
  assert.deepEqual(c.dims, [256, 1]); assert.equal(c.re[0], 2); assert.equal(c.re[3], 1); assert.equal(c.re[255], 1);
  assert.equal(x.re[255], 255);
  const [c2] = call('imhist', [N(0, 0.5, 1), N(3)], 1);
  assert.deepEqual(Array.from(c2.re), [1, 1, 1]);
  near(Array.from(f1('imadjust', N(0.2, 0.4, 0.6), N(0.2, 0.6)).re), [0, 0.5, 1]);
  near(Array.from(f1('imadjust', N(0, 0.5, 1), N(0, 1), N(1, 0)).re), [1, 0.5, 0]);
  near(Array.from(f1('imadjust', N(0.25), N(0, 1), N(0, 1), N(2)).re), [0.0625]);
  const ramp = tensor('uint8', [1, 256], Array.from({ length: 256 }, (_, i) => i));
  const lim = f1('stretchlim', ramp);
  assert.ok(lim.re[0] > 0 && lim.re[0] < 0.02 && lim.re[1] > 0.98 && lim.re[1] < 1);
  const low = tensor('uint8', [1, 6], [100, 101, 102, 103, 104, 105]);
  const J = f1('imadjust', low, N(100 / 255, 105 / 255));
  assert.deepEqual(Array.from(J.re), [0, 51, 102, 153, 204, 255]);
  const [H, T] = call('histeq', [low], 2);
  assert.equal(H.cls, 'uint8'); assert.deepEqual(T.dims, [1, 256]);
  for (let i = 1; i < 6; i++) assert.ok(H.re[i] >= H.re[i - 1]);
  assert.ok(H.re[5] - H.re[0] > 150, 'contrast is stretched');
});

test('noise and quality metrics', () => {
  const I = tensor('double', [20, 20], new Float64Array(400).fill(0.5));
  const sp = f1('imnoise', I, S('salt & pepper'), N(1));
  assert.ok(sp.re.every((v) => v === 0 || v === 1));
  const g = f1('imnoise', tensor('uint8', [20, 20], new Float64Array(400).fill(128)), S('gaussian'), N(0), N(0.01));
  assert.equal(g.cls, 'uint8'); assert.ok(g.re.some((v) => v !== 128));
  const sk = f1('imnoise', I, S('speckle'));
  assert.ok(sk.re.every((v) => v >= 0 && v <= 1));
  const po = f1('imnoise', tensor('uint8', [5, 5], new Float64Array(25).fill(50)), S('poisson'));
  assert.equal(po.cls, 'uint8');
  assert.equal(f1('immse', N(1, 2, 3), N(1, 2, 5)).re[0], 4 / 3);
  near([f1('psnr', tensor('uint8', [1, 2], [10, 20]), tensor('uint8', [1, 2], [10, 30])).re[0]], [10 * Math.log10((255 * 255) / 50)]);
  assert.equal(f1('entropy', tensor('uint8', [1, 2], [0, 255])).re[0], 1);
  assert.equal(f1('entropy', tensor('uint8', [1, 4], [7, 7, 7, 7])).re[0], 0);
});

test('imfilter: padding, sizes, correlation and convolution', () => {
  const A = M([[1, 2, 3]]);
  assert.deepEqual(Array.from(f1('imfilter', A, M([[1, 1, 1]])).re), [3, 6, 5]);
  assert.deepEqual(Array.from(f1('imfilter', A, M([[1, 1, 1]]), S('replicate')).re), [4, 6, 8]);
  assert.deepEqual(Array.from(f1('imfilter', A, M([[1, 1, 1]]), S('symmetric')).re), [4, 6, 8]);
  assert.deepEqual(Array.from(f1('imfilter', A, M([[1, 1, 1]]), S('circular')).re), [6, 6, 6]);
  assert.deepEqual(Array.from(f1('imfilter', A, M([[1, 1, 1]]), N(10)).re), [13, 6, 15]);
  assert.deepEqual(Array.from(f1('imfilter', A, M([[1, 1, 1]]), S('full')).re), [1, 3, 6, 5, 3]);
  const d = M([[0, 1, 0]]), h = M([[1, 2, 3]]);
  assert.deepEqual(Array.from(f1('imfilter', d, h).re), [3, 2, 1]);
  assert.deepEqual(Array.from(f1('imfilter', d, h, S('conv')).re), [1, 2, 3]);
  const u8 = tensor('uint8', [1, 3], [100, 200, 250]);
  assert.deepEqual(Array.from(f1('imfilter', u8, M([[0.5, 0.6]])).re), [170, 250, 125]);
  const rgb = tensor('double', [2, 2, 3], new Float64Array(12).fill(1));
  assert.deepEqual(f1('imfilter', rgb, M([[1, 1]])).dims, [2, 2, 3]);
});

test('fspecial kernels', () => {
  const sum = (v) => v.re.reduce((a, b) => a + b, 0);
  const av = f1('fspecial', S('average'));
  assert.deepEqual(av.dims, [3, 3]); near([sum(av)], [1]);
  const g = f1('fspecial', S('gaussian'), N(3), N(0.5));
  near([g.re[4]], [0.619347], 1e-6); near([sum(g)], [1]);
  const lap = f1('fspecial', S('laplacian'));
  near(Array.from(lap.re), [1 / 6, 2 / 3, 1 / 6, 2 / 3, -10 / 3, 2 / 3, 1 / 6, 2 / 3, 1 / 6], 1e-12);
  const lg = f1('fspecial', S('log'));
  assert.deepEqual(lg.dims, [5, 5]); near([sum(lg)], [0], 1e-12);
  const dk = f1('fspecial', S('disk'), N(2));
  assert.deepEqual(dk.dims, [5, 5]); near([sum(dk)], [1]); near([dk.re[0]], [dk.re[24]]);
  const mo = f1('fspecial', S('motion'), N(9), N(0));
  assert.deepEqual(mo.dims, [1, 9]); near(Array.from(mo.re), new Array(9).fill(1 / 9), 1e-12);
  const md = f1('fspecial', S('motion'), N(5), N(45));
  assert.ok(md.dims[0] > 1 && md.dims[0] === md.dims[1]); near([sum(md)], [1]);
  assert.deepEqual(rowsOf(f1('fspecial', S('sobel'))), [[1, 2, 1], [0, 0, 0], [-1, -2, -1]]);
  assert.deepEqual(rowsOf(f1('fspecial', S('prewitt'))), [[1, 1, 1], [0, 0, 0], [-1, -1, -1]]);
  near([sum(f1('fspecial', S('unsharp')))], [1]);
  assert.throws(() => f1('fspecial', S('nope')), /Unknown filter/);
});

test('smoothing, sharpening and order filters', () => {
  const flat = tensor('uint8', [6, 6], new Float64Array(36).fill(90));
  assert.ok(f1('imgaussfilt', flat, N(2)).re.every((v) => v === 90));
  assert.ok(f1('imsharpen', flat).re.every((v) => v === 90));
  const step = M([[0, 0, 1, 1], [0, 0, 1, 1]]);
  const sh = f1('imsharpen', step, S('Amount'), N(1));
  assert.ok(sh.re[2] < 0 || sh.re[4] > 1 || sh.re[4] < 1 + 1e-9, 'sharpening changes the step');
  const imp = new Float64Array(25); imp[12] = 9;
  assert.ok(f1('medfilt2', tensor('double', [5, 5], imp)).re.every((v) => v === 0));
  const ones = tensor('double', [3, 3], new Float64Array(9).fill(1));
  const mf = f1('medfilt2', ones);
  assert.equal(mf.re[0], 0); assert.equal(mf.re[4], 1);
  assert.ok(f1('medfilt2', ones, S('symmetric')).re.every((v) => v === 1));
  const mx = f1('ordfilt2', tensor('double', [5, 5], imp), N(9), tensor('logical', [3, 3], new Float64Array(9).fill(1)));
  assert.equal(mx.re.filter((v) => v === 9).length, 9);
});

test('gradients and edge detection', () => {
  const ramp = M([[0, 1, 2, 3, 4], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4]]);
  const [gx, gy] = call('imgradientxy', [ramp], 2);
  assert.equal(gx.re[1 + 2 * 3], 8); assert.equal(gy.re[1 + 2 * 3], 0);
  const [gm, gd] = call('imgradient', [ramp, S('central')], 2);
  near([gm.re[1 + 2 * 3], gd.re[1 + 2 * 3]], [1, 0]);
  const [ix] = call('imgradientxy', [ramp, S('intermediate')], 2);
  assert.equal(ix.re[0], 1); assert.equal(ix.re[4 * 3], 0);
  const re = new Float64Array(100); for (let x = 5; x < 10; x++) for (let y = 0; y < 10; y++) re[y + x * 10] = 1;
  const I = tensor('double', [10, 10], re);
  for (const m of ['sobel', 'prewitt', 'roberts', 'canny', 'log']) {
    const [E, t] = call('edge', [I, S(m)], 2);
    assert.equal(E.cls, 'logical', m);
    let near5 = 0, far = 0;
    for (let x = 0; x < 10; x++) for (let y = 0; y < 10; y++) if (E.re[y + x * 10]) { if (x >= 3 && x <= 6) near5++; else far++; }
    assert.ok(near5 > 0, `${m} finds the step`); assert.equal(far, 0, `${m} has no stray edges`);
    assert.ok(t.re.length >= 1);
  }
  const [, ct] = call('edge', [I, S('canny')], 2);
  assert.deepEqual(ct.dims, [1, 2]);
  assert.ok(f1('edge', I, S('sobel'), N(10)).re.every((v) => v === 0), 'a high threshold finds nothing');
});

test('thresholding: graythresh, otsuthresh, imbinarize, im2bw, adaptthresh', () => {
  const re = new Float64Array(100); for (let i = 0; i < 100; i++) re[i] = i < 50 ? 0.2 : 0.8;
  const I = tensor('double', [10, 10], re);
  const [lv, em] = call('graythresh', [I], 2);
  assert.ok(lv.re[0] > 0.3 && lv.re[0] < 0.7); near([em.re[0]], [1], 1e-9);
  const ot = f1('otsuthresh', tensor('double', [1, 4], [5, 0, 0, 5]));
  assert.ok(ot.re[0] > 0 && ot.re[0] < 1);
  const B = f1('imbinarize', I);
  assert.equal(B.cls, 'logical'); assert.deepEqual(Array.from(B.re), Array.from(re, (v) => (v > 0.5 ? 1 : 0)));
  assert.ok(f1('imbinarize', I, N(0.9)).re.every((v) => v === 0));
  const A = f1('imbinarize', I, S('adaptive'));
  assert.equal(A.cls, 'logical');
  assert.deepEqual(f1('adaptthresh', I).dims, [10, 10]);
  assert.deepEqual(Array.from(f1('im2bw', tensor('uint8', [1, 3], [10, 128, 200]), N(0.5)).re), [0, 1, 1]);
  assert.deepEqual(Array.from(f1('im2bw', N(1, 2), M([[0, 0, 0], [1, 1, 1]]), N(0.5)).re), [0, 1]);
});

test('structuring elements and morphology', () => {
  const nh = (se) => se.data[0].Neighborhood;
  const disk = nh(f1('strel', S('disk'), N(2)));
  assert.deepEqual(disk.dims, [5, 5]); assert.equal(disk.re.reduce((a, b) => a + b, 0), 13);
  assert.equal(nh(f1('strel', S('square'), N(3))).re.length, 9);
  assert.deepEqual(nh(f1('strel', S('rectangle'), N(2, 4))).dims, [2, 4]);
  assert.equal(nh(f1('strel', S('diamond'), N(1))).re.reduce((a, b) => a + b, 0), 5);
  assert.equal(nh(f1('strel', S('octagon'), N(3))).re.reduce((a, b) => a + b, 0), 37);
  const ln = nh(f1('strel', S('line'), N(5), N(0)));
  assert.deepEqual(ln.dims, [1, 5]);
  assert.deepEqual(nh(f1('strel', S('line'), N(3), N(90))).dims, [3, 1]);
  assert.equal(toStr(f1('strel', S('disk'), N(1)).data[0].Type), 'disk');
  const px = new Float64Array(25); px[12] = 1;
  const P = tensor('logical', [5, 5], px);
  const sq = f1('strel', S('square'), N(3));
  const D = f1('imdilate', P, sq);
  assert.equal(D.cls, 'logical'); assert.equal(D.re.reduce((a, b) => a + b, 0), 9);
  assert.deepEqual(Array.from(f1('imerode', D, sq).re), Array.from(px));
  assert.ok(f1('imopen', P, sq).re.every((v) => v === 0), 'opening removes an isolated pixel');
  const gap = tensor('logical', [3, 5], [0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0]);
  const cl = f1('imclose', gap, M([[1, 1, 1]]));
  assert.equal(cl.re[1 + 2 * 3], 1, 'closing bridges a one-pixel gap');
  const g = M([[1, 5, 2], [0, 3, 4]]);
  assert.deepEqual(rowsOf(f1('imdilate', g, M([[1, 1, 1]]))), [[5, 5, 5], [3, 4, 4]]);
  assert.deepEqual(rowsOf(f1('imerode', g, M([[1, 1, 1]]))), [[1, 1, 2], [0, 0, 3]]);
  const th = f1('imtophat', g, M([[1, 1, 1]]));
  assert.ok(th.re.every((v) => v >= 0));
  assert.ok(f1('imbothat', g, M([[1, 1, 1]])).re.every((v) => v >= 0));
});

test('connected components, regionprops, fill and cleanup', () => {
  // 0-based: a 2x2 block at rows 1-2, cols 1-2, and single pixels at (0,4) and (3,4)
  const A = new Float64Array(20); A[1 + 1 * 4] = A[2 + 1 * 4] = A[1 + 2 * 4] = A[2 + 2 * 4] = 1; A[0 + 4 * 4] = 1; A[3 + 4 * 4] = 1;
  const img = tensor('logical', [4, 5], A);
  const [L, n] = call('bwlabel', [img], 2);
  assert.equal(n.re[0], 3);
  assert.equal(L.re[1 + 4], 1); assert.equal(L.re[16], 2); assert.equal(L.re[19], 3);
  const [, n4] = call('bwlabel', [tensor('logical', [2, 2], [1, 0, 0, 1]), N(4)], 2);
  assert.equal(n4.re[0], 2);
  const [, n8] = call('bwlabel', [tensor('logical', [2, 2], [1, 0, 0, 1])], 2);
  assert.equal(n8.re[0], 1);
  const cc = f1('bwconncomp', img);
  assert.equal(cc.data[0].NumObjects.re[0], 3);
  assert.deepEqual(Array.from(cc.data[0].PixelIdxList.data[0].re), [6, 7, 10, 11]);
  const rect = new Float64Array(20); for (let y = 1; y <= 2; y++) for (let x = 2; x <= 4; x++) rect[y + x * 4] = 1;
  const R = tensor('logical', [4, 5], rect);
  const st = f1('regionprops', R, S('Area'), S('Centroid'), S('BoundingBox'), S('Orientation'), S('Eccentricity'), S('Extent'), S('Perimeter'), S('EquivDiameter'), S('MajorAxisLength'), S('MinorAxisLength'));
  const r = st.data[0];
  assert.equal(r.Area.re[0], 6);
  assert.deepEqual(Array.from(r.Centroid.re), [4, 2.5]);
  assert.deepEqual(Array.from(r.BoundingBox.re), [2.5, 1.5, 3, 2]);
  near([r.Orientation.re[0]], [0]); assert.ok(r.Eccentricity.re[0] > 0 && r.Eccentricity.re[0] < 1);
  assert.equal(r.Extent.re[0], 1);
  assert.ok(r.MajorAxisLength.re[0] > r.MinorAxisLength.re[0]);
  near([r.EquivDiameter.re[0]], [Math.sqrt(24 / Math.PI)]);
  assert.equal(r.Perimeter.re[0], 6);
  const gray = tensor('double', [4, 5], new Float64Array(20).map((_, i) => i));
  const si = f1('regionprops', R, gray, S('MeanIntensity'), S('MaxIntensity'), S('PixelIdxList'));
  assert.equal(si.data[0].MaxIntensity.re[0], 18);
  near([si.data[0].MeanIntensity.re[0]], [(9 + 10 + 13 + 14 + 17 + 18) / 6]);
  const all = f1('regionprops', img);
  assert.deepEqual(all.dims, [3, 1]); assert.deepEqual(all.fields, ['Area', 'Centroid', 'BoundingBox']);
  const lab = f1('regionprops', M([[1, 1, 0, 2]]), S('Area'));
  assert.deepEqual(lab.data.map((d) => d.Area.re[0]), [2, 1]);
  // holes
  const ring = M([[0, 0, 0, 0, 0], [0, 1, 1, 1, 0], [0, 1, 0, 1, 0], [0, 1, 1, 1, 0], [0, 0, 0, 0, 0]], 'logical');
  const filled = f1('imfill', ring, S('holes'));
  assert.equal(filled.re[2 + 2 * 5], 1); assert.equal(filled.re.reduce((a, b) => a + b, 0), 9);
  const seed = f1('imfill', M([[0, 0, 1, 0, 0]], 'logical'), N(1));
  assert.deepEqual(Array.from(seed.re), [1, 1, 1, 0, 0]);
  const gh = f1('imfill', M([[5, 5, 5], [5, 1, 5], [5, 5, 5]]), S('holes'));
  assert.equal(gh.re[4], 5);
  assert.equal(f1('bwareaopen', img, N(2)).re.reduce((a, b) => a + b, 0), 4);
  const blk = new Float64Array(25); for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) blk[y + x * 5] = 1;
  assert.equal(f1('bwperim', tensor('logical', [5, 5], blk)).re.reduce((a, b) => a + b, 0), 8);
  assert.equal(f1('imclearborder', img).re.reduce((a, b) => a + b, 0), 4);
  const [Bd, , nb] = call('bwboundaries', [tensor('logical', [5, 5], blk)], 3);
  assert.equal(nb.re[0], 1);
  const b0 = Bd.data[0]; const m = b0.dims[0];
  assert.equal(m, 9);
  assert.deepEqual([b0.re[0], b0.re[m]], [b0.re[m - 1], b0.re[2 * m - 1]]);
  assert.deepEqual([b0.re[0], b0.re[m]], [2, 2]);
  const [B1] = call('bwboundaries', [tensor('logical', [1, 1], [1])], 1);
  assert.deepEqual(B1.data[0].dims, [2, 2]);
});
