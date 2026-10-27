// Image file I/O: imread / imwrite / imfinfo / imformats and the codecs
// (PNG, JPEG, BMP, GIF, TIFF, PBM/PGM/PPM). Fixtures in test/fixtures/io/img_*
// were produced by an independent encoder; *.raw / *.dec hold its pixels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemoryFs } from '../core/fs-memory.js';
import { tensor, str, toStr } from '../core/value.js';
import { builtins as IMG } from '../core/lib/image/index.js';
import { encodeJpeg, decodeJpeg } from '../core/lib/image/codecs/jpeg.js';
import { lzwEncodeGif, lzwDecodeGif } from '../core/lib/image/codecs/gif.js';
import { lzwEncodeTiff, lzwDecodeTiff, packbitsEncode, packbitsDecode } from '../core/lib/image/codecs/tiff.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'io');
const fix = (n) => new Uint8Array(fs.readFileSync(path.join(FIX, n)));
const W = 23, H = 17;

// A minimal ctx (the full registry is not needed here, and other areas may be mid-change).
function mockCtx({ fs: mfs }) {
  const outText = [];
  const ctx = { fs: mfs, state: {}, outText, host: { post() {}, request() { return null; } }, out(t) { outText.push(t); }, warning() {}, checkInterrupt() {},
    call(name, args, nargout = 1) { const r = IMG[name](args, nargout, ctx); return Array.isArray(r) ? r : r === undefined ? [] : [r]; } };
  return ctx;
}
function ctxWith(files = {}) {
  const mfs = createMemoryFs();
  for (const [p, b] of Object.entries(files)) mfs.writeBytes(p, b);
  return mockCtx({ fs: mfs });
}
const call = (ctx, name, args, nargout = 1) => { const r = IMG[name](args, nargout, ctx); return Array.isArray(r) ? r : [r]; };
const S = (s) => str(s);
const N = (x) => tensor('double', [1, 1], [x]);
const at = (v, r, c, k = 0) => v.re[r + c * v.dims[0] + k * v.dims[0] * v.dims[1]];

/** RGB uint8 image (H x W x 3) from row-major interleaved bytes. */
function rgbFrom(bytes, h = H, w = W, ch = 3) {
  const re = new Float64Array(h * w * ch);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < ch; k++) re[y + x * h + k * h * w] = bytes[(y * w + x) * ch + k];
  return tensor('uint8', ch > 1 ? [h, w, ch] : [h, w], re);
}
function meanAbs(a, b) { let s = 0; for (let i = 0; i < a.re.length; i++) s += Math.abs(a.re[i] - b.re[i]); return s / a.re.length; }
function maxAbs(a, b) { let s = 0; for (let i = 0; i < a.re.length; i++) s = Math.max(s, Math.abs(a.re[i] - b.re[i])); return s; }
const SRC = () => rgbFrom(fix('img_src.rgb'));

test('PNG round trip: RGB, gray, 16-bit, logical, indexed, alpha', () => {
  const ctx = ctxWith();
  const rgb = SRC();
  call(ctx, 'imwrite', [rgb, S('/tmp/a.png')]);
  const [A] = call(ctx, 'imread', [S('/tmp/a.png')]);
  assert.equal(A.cls, 'uint8'); assert.deepEqual(A.dims, [H, W, 3]); assert.equal(maxAbs(A, rgb), 0);
  const g16 = tensor('uint16', [3, 4], [0, 1000, 65535, 7, 8, 9, 10, 11, 12, 40000, 2, 3]);
  call(ctx, 'imwrite', [g16, S('/tmp/b.png')]);
  const [B] = call(ctx, 'imread', [S('/tmp/b.png')]);
  assert.equal(B.cls, 'uint16'); assert.deepEqual(Array.from(B.re), Array.from(g16.re));
  const bw = tensor('logical', [2, 3], [1, 0, 0, 1, 1, 1]);
  call(ctx, 'imwrite', [bw, S('/tmp/c.png')]);
  const [C] = call(ctx, 'imread', [S('/tmp/c.png')]);
  assert.equal(C.cls, 'logical'); assert.deepEqual(Array.from(C.re), [1, 0, 0, 1, 1, 1]);
  const dbl = tensor('double', [2, 2], [0, 0.5, 1, 0.25]);
  call(ctx, 'imwrite', [dbl, S('/tmp/d.png')]);
  const [D] = call(ctx, 'imread', [S('/tmp/d.png')]);
  assert.deepEqual(Array.from(D.re), [0, 128, 255, 64]);
  const X = tensor('uint8', [2, 2], [0, 1, 2, 1]);
  const map = tensor('double', [3, 3], [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  call(ctx, 'imwrite', [X, map, S('/tmp/e.png')]);
  const [E, M] = call(ctx, 'imread', [S('/tmp/e.png')], 2);
  assert.deepEqual(Array.from(E.re), [0, 1, 2, 1]); assert.deepEqual(Array.from(M.re), Array.from(map.re));
  const alpha = tensor('uint8', [H, W], new Float64Array(H * W).map((_, i) => i % 256));
  call(ctx, 'imwrite', [rgb, S('/tmp/f.png'), S('Alpha'), alpha]);
  const [F, , AL] = call(ctx, 'imread', [S('/tmp/f.png')], 3);
  assert.equal(maxAbs(F, rgb), 0); assert.equal(maxAbs(AL, alpha), 0);
});

test('PNG with alpha written by another encoder', () => {
  const ctx = ctxWith({ '/home/x.png': fix('img_rgba.png') });
  const [A, , AL] = call(ctx, 'imread', [S('x.png')], 3);
  const ref = rgbFrom(fix('img_rgba.raw'), H, W, 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    for (let k = 0; k < 3; k++) assert.equal(at(A, y, x, k), at(ref, y, x, k));
    assert.equal(at(AL, y, x), at(ref, y, x, 3));
  }
});

test('JPEG decode of baseline 4:2:0, 4:4:4, progressive, restart and gray files', () => {
  for (const [f, ch] of [['img_base.jpg', 3], ['img_444.jpg', 3], ['img_prog.jpg', 3], ['img_rst.jpg', 3], ['img_gray.jpg', 1], ['img_gprog.jpg', 1]]) {
    const ctx = ctxWith({ ['/home/' + f]: fix(f) });
    const [A] = call(ctx, 'imread', [S(f)]);
    assert.equal(A.cls, 'uint8');
    assert.deepEqual(A.dims, ch === 3 ? [H, W, 3] : [H, W], f);
    const ref = rgbFrom(fix(f + '.dec'), H, W, ch);
    const m = meanAbs(A, ref);
    assert.ok(m < 0.6, `${f}: mean abs difference ${m}`);
  }
});

test('JPEG baseline encode round trip and quality', () => {
  const ctx = ctxWith();
  const rgb = SRC();
  call(ctx, 'imwrite', [rgb, S('/tmp/q.jpg'), S('Quality'), N(95)]);
  const [A] = call(ctx, 'imread', [S('/tmp/q.jpg')]);
  assert.deepEqual(A.dims, [H, W, 3]);
  assert.ok(meanAbs(A, rgb) < 4, `mean abs ${meanAbs(A, rgb)}`);
  call(ctx, 'imwrite', [rgb, S('/tmp/lo.jpg'), S('Quality'), N(10)]);
  const hi = ctx.fs.readBytes('/tmp/q.jpg').length, lo = ctx.fs.readBytes('/tmp/lo.jpg').length;
  assert.ok(lo < hi, 'lower quality gives a smaller file');
  const gray = rgbFrom(fix('img_gray.raw'), H, W, 1);
  call(ctx, 'imwrite', [gray, S('/tmp/g.jpg')]);
  const [G] = call(ctx, 'imread', [S('/tmp/g.jpg')]);
  assert.deepEqual(G.dims, [H, W]);
  assert.ok(meanAbs(G, gray) < 4);
  // a flat image survives exactly
  const flat = { width: 16, height: 16, channels: 1, data: new Uint8Array(256).fill(77) };
  const d = decodeJpeg(encodeJpeg(flat, { quality: 75 }));
  assert.ok(d.data.every((v) => v === 77));
  const [info] = call(ctx, 'imfinfo', [S('/tmp/q.jpg')]);
  assert.equal(toStr(info.data[0].Format), 'jpg');
  assert.equal(info.data[0].BitDepth.re[0], 24);
  assert.equal(toStr(info.data[0].CodingProcess), 'Sequential');
});

test('BMP: 24-bit, 8-bit palette, 1-bit, 32-bit (reserved byte ignored) from another encoder', () => {
  const ctx = ctxWith({ '/home/rgb.bmp': fix('img_rgb.bmp'), '/home/pal.bmp': fix('img_pal.bmp'), '/home/bw.bmp': fix('img_bw.bmp'), '/home/rgba.bmp': fix('img_rgba.bmp') });
  const [A] = call(ctx, 'imread', [S('rgb.bmp')]);
  assert.equal(maxAbs(A, SRC()), 0);
  const [X, map] = call(ctx, 'imread', [S('pal.bmp')], 2);
  const idx = fix('img_pal.idx'), pm = fix('img_pal.map');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = at(X, y, x);
    assert.equal(k, idx[y * W + x]);
    for (let c = 0; c < 3; c++) assert.equal(Math.round(map.re[k + c * map.dims[0]] * 255), pm[3 * k + c]);
  }
  const [B] = call(ctx, 'imread', [S('bw.bmp')]);
  const bwRaw = fix('img_bw.raw');
  // a 1-bit BMP is indexed with a black/white palette
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) assert.equal(at(B, y, x), bwRaw[y * W + x]);
  const [R, , AL] = call(ctx, 'imread', [S('rgba.bmp')], 3);
  const ref = rgbFrom(fix('img_rgba.raw'), H, W, 4);
  for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 2) for (let k = 0; k < 3; k++) assert.equal(at(R, y, x, k), at(ref, y, x, k));
  assert.equal(AL.re.length, 0); // BI_RGB: the fourth byte is reserved
});

test('BMP RLE8 and RLE4 hand-built files', () => {
  // 4x2 image, bottom-up: row0 (bottom) = 1 1 1 2, row1 (top) = 3 3 0 0
  const head = (bpp, comp, pal, data) => {
    const off = 54 + pal.length * 4;
    const b = new Uint8Array(off + data.length);
    const dv = new DataView(b.buffer);
    b[0] = 0x42; b[1] = 0x4d; dv.setUint32(2, b.length, true); dv.setUint32(10, off, true);
    dv.setUint32(14, 40, true); dv.setInt32(18, 4, true); dv.setInt32(22, 2, true); dv.setUint16(26, 1, true); dv.setUint16(28, bpp, true);
    dv.setUint32(30, comp, true); dv.setUint32(46, pal.length, true);
    pal.forEach((c, i) => { b[54 + 4 * i] = c[2]; b[55 + 4 * i] = c[1]; b[56 + 4 * i] = c[0]; });
    b.set(data, off);
    return b;
  };
  const pal = [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255]];
  const rle8 = head(8, 1, pal, [3, 1, 1, 2, 0, 0, 2, 3, 2, 0, 0, 1]);
  const rle4 = head(4, 2, pal, [3, 0x11, 1, 0x20, 0, 0, 2, 0x33, 2, 0x00, 0, 1]);
  for (const bytes of [rle8, rle4]) {
    const ctx = ctxWith({ '/home/r.bmp': bytes });
    const [X] = call(ctx, 'imread', [S('r.bmp')], 2);
    assert.deepEqual([0, 1, 2, 3].map((x) => at(X, 0, x)), [3, 3, 0, 0]);
    assert.deepEqual([0, 1, 2, 3].map((x) => at(X, 1, x)), [1, 1, 1, 2]);
  }
});

test('BMP write and read back: RGB, gray, logical, indexed', () => {
  const ctx = ctxWith();
  const rgb = SRC();
  call(ctx, 'imwrite', [rgb, S('/tmp/a.bmp')]);
  assert.equal(maxAbs(call(ctx, 'imread', [S('/tmp/a.bmp')])[0], rgb), 0);
  const g = rgbFrom(fix('img_gray.raw'), H, W, 1);
  call(ctx, 'imwrite', [g, S('/tmp/g.bmp')]);
  const [G, gm] = call(ctx, 'imread', [S('/tmp/g.bmp')], 2);
  assert.equal(maxAbs(G, g), 0); assert.equal(gm.dims[0], 256);
  const bw = tensor('logical', [3, 9], new Float64Array(27).map((_, i) => (i % 4 === 0 ? 1 : 0)));
  call(ctx, 'imwrite', [bw, S('/tmp/b.bmp')]);
  const [B] = call(ctx, 'imread', [S('/tmp/b.bmp')]);
  assert.deepEqual(Array.from(B.re), Array.from(bw.re));
  const [info] = call(ctx, 'imfinfo', [S('/tmp/b.bmp')]);
  assert.equal(info.data[0].BitDepth.re[0], 1);
  assert.equal(toStr(info.data[0].ColorType), 'indexed');
});

test('GIF: animated file from another encoder, frames, interlace, imfinfo', () => {
  const ctx = ctxWith({ '/home/a.gif': fix('img_anim.gif'), '/home/i.gif': fix('img_interlace.gif') });
  const [X, map] = call(ctx, 'imread', [S('a.gif')], 2);
  assert.equal(X.cls, 'uint8'); assert.deepEqual(X.dims, [H, W]);
  for (let x = 0; x < W; x++) assert.equal(at(X, 5, x), Math.floor(x / 6) % 4);
  assert.deepEqual([map.re[1], map.re[1 + map.dims[0]], map.re[1 + 2 * map.dims[0]]], [1, 0, 0]);
  const [all] = call(ctx, 'imread', [S('a.gif'), S('Frames'), S('all')]);
  assert.deepEqual(all.dims, [H, W, 1, 3]);
  const n = H * W;
  for (let k = 0; k < 3; k++) for (let x = 0; x < W; x++) assert.equal(all.re[k * n + 2 + x * H], (Math.floor(x / 6) + k) % 4);
  const [f2] = call(ctx, 'imread', [S('a.gif'), N(2)]);
  assert.equal(at(f2, 0, 0), 1);
  const [info] = call(ctx, 'imfinfo', [S('a.gif')]);
  assert.deepEqual(info.dims, [3, 1]);
  assert.equal(info.data[1].DelayTime.re[0], 12);
  assert.equal(info.data[0].LoopCount.re[0], Infinity);
  const [I] = call(ctx, 'imread', [S('i.gif')]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) assert.equal(at(I, y, x), (Math.floor(x / 6) + 1) % 4);
});

test('GIF write: indexed, gray, RGB quantized, animation via WriteMode append', () => {
  const ctx = ctxWith();
  const X = tensor('uint8', [4, 5], new Float64Array(20).map((_, i) => i % 3));
  const map = tensor('double', [3, 3], [0, 1, 0, 0, 0, 1, 0, 0, 0.5]);
  call(ctx, 'imwrite', [X, map, S('/tmp/a.gif'), S('LoopCount'), N(Infinity), S('DelayTime'), N(0.25)]);
  const [Y, m2] = call(ctx, 'imread', [S('/tmp/a.gif')], 2);
  assert.deepEqual(Array.from(Y.re), Array.from(X.re));
  for (let i = 0; i < 3; i++) for (let c = 0; c < 3; c++) assert.ok(Math.abs(m2.re[i + c * m2.dims[0]] - map.re[i + c * 3]) < 0.003);
  const X2 = tensor('uint8', [4, 5], new Float64Array(20).fill(2));
  call(ctx, 'imwrite', [X2, map, S('/tmp/a.gif'), S('WriteMode'), S('append'), S('DelayTime'), N(0.5)]);
  const [all] = call(ctx, 'imread', [S('/tmp/a.gif'), S('Frames'), S('all')]);
  assert.deepEqual(all.dims, [4, 5, 1, 2]);
  assert.ok(Array.from(all.re.subarray(20)).every((v) => v === 2));
  const [info] = call(ctx, 'imfinfo', [S('/tmp/a.gif')]);
  assert.equal(info.data[0].DelayTime.re[0], 25); assert.equal(info.data[1].DelayTime.re[0], 50);
  // 4-D frames in one call
  const four = tensor('uint8', [2, 2, 1, 3], [0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0]);
  call(ctx, 'imwrite', [four, map, S('/tmp/f.gif')]);
  const [F] = call(ctx, 'imread', [S('/tmp/f.gif'), S('Frames'), S('all')]);
  assert.deepEqual(Array.from(F.re), Array.from(four.re));
  // RGB with few colours is stored exactly
  const rgb = tensor('uint8', [2, 2, 3], [255, 0, 0, 10, 0, 255, 0, 10, 0, 0, 255, 10]);
  call(ctx, 'imwrite', [rgb, S('/tmp/c.gif')]);
  const [Q, qm] = call(ctx, 'imread', [S('/tmp/c.gif')], 2);
  const [RGB] = call(ctx, 'ind2rgb', [Q, qm]);
  for (let i = 0; i < 12; i++) assert.ok(Math.abs(RGB.re[i] * 255 - rgb.re[i]) < 0.6);
});

test('LZW, PackBits codecs round trip (incl. table resets)', () => {
  const big = new Uint8Array(30000); for (let i = 0; i < big.length; i++) big[i] = (i * 7 + (i >> 5)) & 255;
  const small = Uint8Array.from({ length: 5000 }, (_, i) => (i * 13) % 5);
  for (const d of [big, small, new Uint8Array(1)]) {
    assert.deepEqual(lzwDecodeTiff(lzwEncodeTiff(d), d.length), d);
    assert.deepEqual(packbitsDecode(packbitsEncode(d), d.length), d);
  }
  for (const d of [small, Uint8Array.from(big, (v) => v & 15)]) {
    const ms = Math.max(2, Math.ceil(Math.log2(Math.max(...d) + 1)));
    assert.deepEqual(lzwDecodeGif(lzwEncodeGif(d, ms), ms, d.length), d);
  }
});

test('TIFF: LZW, Deflate, PackBits, 16-bit, palette files from another encoder', () => {
  const files = {};
  for (const f of ['img_lzw.tif', 'img_deflate.tif', 'img_packbits.tif', 'img_16.tif', 'img_pal.tif']) files['/home/' + f] = fix(f);
  const ctx = ctxWith(files);
  for (const f of ['img_lzw.tif', 'img_deflate.tif', 'img_packbits.tif']) {
    const [A] = call(ctx, 'imread', [S(f)]);
    assert.equal(maxAbs(A, SRC()), 0, f);
  }
  const [G] = call(ctx, 'imread', [S('img_16.tif')]);
  assert.equal(G.cls, 'uint16');
  const raw = fix('img_16.raw'); const dv = new DataView(raw.buffer, raw.byteOffset);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) assert.equal(at(G, y, x), dv.getUint16((y * W + x) * 2, true));
  const [X, map] = call(ctx, 'imread', [S('img_pal.tif')], 2);
  const idx = fix('img_pal.idx'), pm = fix('img_pal.map');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) assert.equal(at(X, y, x), idx[y * W + x]);
  assert.ok(Math.abs(map.re[3] * 255 - pm[9]) < 1); // that encoder stores 8-bit colours times 256
  const [info] = call(ctx, 'imfinfo', [S('img_lzw.tif')]);
  assert.equal(toStr(info.data[0].Compression), 'LZW');
  assert.equal(info.data[0].BitDepth.re[0], 24);
});

test('TIFF write: compressions, 16-bit, single, logical, indexed, alpha, append pages', () => {
  const ctx = ctxWith();
  const rgb = SRC();
  for (const c of ['none', 'lzw', 'deflate', 'packbits']) {
    call(ctx, 'imwrite', [rgb, S(`/tmp/${c}.tif`), S('Compression'), S(c)]);
    assert.equal(maxAbs(call(ctx, 'imread', [S(`/tmp/${c}.tif`)])[0], rgb), 0, c);
  }
  const u16 = tensor('uint16', [2, 3], [1, 2, 3, 60000, 5, 6]);
  call(ctx, 'imwrite', [u16, S('/tmp/u.tif')]);
  assert.deepEqual(Array.from(call(ctx, 'imread', [S('/tmp/u.tif')])[0].re), [1, 2, 3, 60000, 5, 6]);
  const sg = tensor('single', [2, 2], [0.5, -1.25, 3, 1e-3].map(Math.fround));
  call(ctx, 'imwrite', [sg, S('/tmp/s.tif')]);
  const [SG] = call(ctx, 'imread', [S('/tmp/s.tif')]);
  assert.equal(SG.cls, 'single'); assert.deepEqual(Array.from(SG.re), Array.from(sg.re));
  const bw = tensor('logical', [3, 11], new Float64Array(33).map((_, i) => i % 2));
  call(ctx, 'imwrite', [bw, S('/tmp/b.tif'), S('Compression'), S('none')]);
  const [BW] = call(ctx, 'imread', [S('/tmp/b.tif')]);
  assert.equal(BW.cls, 'logical'); assert.deepEqual(Array.from(BW.re), Array.from(bw.re));
  const X = tensor('double', [2, 2], [1, 2, 3, 1]);
  const map = tensor('double', [3, 3], [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  call(ctx, 'imwrite', [X, map, S('/tmp/p.tif')]);
  const [PX, PM] = call(ctx, 'imread', [S('/tmp/p.tif')], 2);
  assert.deepEqual(Array.from(PX.re), [0, 1, 2, 0]);
  assert.deepEqual([PM.re[0], PM.re[PM.dims[0] + 1], PM.re[2 * PM.dims[0] + 2]], [1, 1, 1]);
  const alpha = tensor('uint8', [H, W], new Float64Array(H * W).fill(128));
  call(ctx, 'imwrite', [rgb, S('/tmp/al.tif'), S('Alpha'), alpha]);
  const [AA, , AL] = call(ctx, 'imread', [S('/tmp/al.tif')], 3);
  assert.equal(maxAbs(AA, rgb), 0); assert.ok(AL.re.every((v) => v === 128));
  // multipage
  call(ctx, 'imwrite', [u16, S('/tmp/m.tif'), S('Description'), S('page one')]);
  call(ctx, 'imwrite', [tensor('uint16', [2, 3], [9, 9, 9, 9, 9, 9]), S('/tmp/m.tif'), S('WriteMode'), S('append'), S('Compression'), S('lzw')]);
  const [info] = call(ctx, 'imfinfo', [S('/tmp/m.tif')]);
  assert.deepEqual(info.dims, [2, 1]);
  assert.equal(toStr(info.data[0].ImageDescription), 'page one');
  assert.deepEqual(Array.from(call(ctx, 'imread', [S('/tmp/m.tif'), N(2)])[0].re), [9, 9, 9, 9, 9, 9]);
  assert.deepEqual(Array.from(call(ctx, 'imread', [S('/tmp/m.tif'), S('Index'), N(1)])[0].re), [1, 2, 3, 60000, 5, 6]);
});

test('PBM/PGM/PPM: raw and plain, 16-bit maxval, hand-built plain files', () => {
  const enc = new TextEncoder();
  const ctx = ctxWith({
    '/home/p1.pbm': enc.encode('P1\n# comment\n3 2\n1 0 1\n0 1 0\n'),
    '/home/p2.pgm': enc.encode('P2\n2 2\n15\n0 5\n10 15\n'),
    '/home/p3.ppm': enc.encode('P3 1 1 255 10 20 30\n'),
  });
  const [B] = call(ctx, 'imread', [S('p1.pbm')]);
  assert.equal(B.cls, 'logical');
  assert.deepEqual([at(B, 0, 0), at(B, 0, 1), at(B, 1, 1)], [0, 1, 0]); // 1 in the file is black
  const [G] = call(ctx, 'imread', [S('p2.pgm')]);
  assert.deepEqual(Array.from(G.re), [0, 10, 5, 15]);
  const [C] = call(ctx, 'imread', [S('p3.ppm')]);
  assert.deepEqual(Array.from(C.re), [10, 20, 30]);
  const rgb = SRC();
  call(ctx, 'imwrite', [rgb, S('/tmp/a.ppm')]);
  assert.equal(maxAbs(call(ctx, 'imread', [S('/tmp/a.ppm')])[0], rgb), 0);
  call(ctx, 'imwrite', [rgb, S('/tmp/b.ppm'), S('Encoding'), S('ASCII')]);
  assert.equal(maxAbs(call(ctx, 'imread', [S('/tmp/b.ppm')])[0], rgb), 0);
  const u16 = tensor('uint16', [1, 3], [0, 300, 65535]);
  call(ctx, 'imwrite', [u16, S('/tmp/c.pgm')]);
  assert.deepEqual(Array.from(call(ctx, 'imread', [S('/tmp/c.pgm')])[0].re), [0, 300, 65535]);
  const bw = tensor('logical', [2, 10], new Float64Array(20).map((_, i) => (i % 3 ? 1 : 0)));
  call(ctx, 'imwrite', [bw, S('/tmp/d.pbm')]);
  assert.deepEqual(Array.from(call(ctx, 'imread', [S('/tmp/d.pbm')])[0].re), Array.from(bw.re));
  const [info] = call(ctx, 'imfinfo', [S('/tmp/d.pbm')]);
  assert.equal(toStr(info.data[0].Format), 'pbm');
  assert.equal(toStr(info.data[0].FormatSignature), 'P4');
});

test('imread errors, extension search, explicit format and imformats', () => {
  const ctx = ctxWith();
  assert.throws(() => call(ctx, 'imread', [S('missing.png')]), /does not exist/);
  call(ctx, 'imwrite', [tensor('uint8', [1, 1], [9]), S('/home/pic'), S('png')]);
  assert.ok(ctx.fs.exists('/home/pic.png'));
  assert.equal(call(ctx, 'imread', [S('pic')])[0].re[0], 9);
  assert.equal(call(ctx, 'imread', [S('pic'), S('png')])[0].re[0], 9);
  assert.throws(() => call(ctx, 'imwrite', [tensor('uint8', [1, 1], [9]), S('/tmp/x.unknown')]), /file format/);
  assert.throws(() => call(ctx, 'imwrite', [tensor('uint8', [1, 1], [9]), S('/tmp/x.png'), S('Bogus'), N(1)]), /Unknown option/);
  const [f] = call(ctx, 'imformats', []);
  assert.ok(f.data.some((r) => toStr(r.description).includes('Portable Network')));
  call(ctx, 'imformats', [], 0);
  assert.ok(ctx.outText.join('').includes('tif tiff'));
  const [info] = call(ctx, 'imfinfo', [S('pic.png')]);
  assert.equal(info.data[0].Width.re[0], 1);
  assert.match(toStr(info.data[0].Filename), /pic\.png$/);
});
