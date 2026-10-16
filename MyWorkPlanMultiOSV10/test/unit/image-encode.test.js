import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeBmp, encodeTiff, IMAGE_FORMATS, imageFormat, rasterSize } from '../../src/export/image-encode.js';

// 2×2: opaque red, half-transparent green / transparent blue, opaque white
const PIXELS = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 255, 255, 255, 255]);

test('formats: six, unique extensions; JPEG is the only one without transparency', () => {
  assert.deepEqual(IMAGE_FORMATS.map((f) => f.id), ['png', 'jpeg', 'webp', 'bmp', 'tiff', 'svg']);
  assert.equal(new Set(IMAGE_FORMATS.map((f) => f.ext)).size, 6);
  assert.deepEqual(IMAGE_FORMATS.filter((f) => !f.alpha).map((f) => f.id), ['jpeg']);
  assert.equal(imageFormat('nope').id, 'png');
});

test('raster size: scale, and never more than 16 000 px a side', () => {
  assert.deepEqual(rasterSize(1000, 400, 2), { width: 2000, height: 800, factor: 2 });
  const big = rasterSize(12000, 3000, 3);
  assert.equal(big.width, 16000);
  assert.equal(big.height, 4000);
});

test('BMP: BITMAPV4 header, 32-bit bit fields with an alpha mask, bottom-up BGRA rows', () => {
  const bmp = encodeBmp(PIXELS, 2, 2);
  const v = new DataView(bmp.buffer);
  assert.equal(String.fromCharCode(bmp[0], bmp[1]), 'BM');
  assert.equal(v.getUint32(2, true), bmp.length);
  assert.equal(v.getUint32(10, true), 122);
  assert.equal(v.getUint32(14, true), 108);
  assert.equal(v.getInt32(18, true), 2);
  assert.equal(v.getInt32(22, true), 2);
  assert.equal(v.getUint16(28, true), 32);
  assert.equal(v.getUint32(30, true), 3);
  assert.equal(v.getUint32(66, true), 0xff000000, 'alpha mask');
  assert.equal(bmp.length, 122 + 16);
  // First stored row is the bottom image row: blue (transparent), white.
  assert.deepEqual([...bmp.subarray(122, 130)], [255, 0, 0, 0, 255, 255, 255, 255]);
  // Then the top row: red, half-transparent green.
  assert.deepEqual([...bmp.subarray(130, 138)], [0, 0, 255, 255, 0, 255, 0, 128]);
});

test('TIFF: little-endian, RGBA 8-bit, unassociated alpha, pixel strip intact', () => {
  const tif = encodeTiff(PIXELS, 2, 2);
  const v = new DataView(tif.buffer);
  assert.equal(String.fromCharCode(tif[0], tif[1]), 'II');
  assert.equal(v.getUint16(2, true), 42);
  const ifd = v.getUint32(4, true);
  const count = v.getUint16(ifd, true);
  const tags = {};
  for (let i = 0; i < count; i++) {
    const at = ifd + 2 + i * 12;
    const type = v.getUint16(at + 2, true);
    tags[v.getUint16(at, true)] = type === 3 && v.getUint32(at + 4, true) === 1 ? v.getUint16(at + 8, true) : v.getUint32(at + 8, true);
  }
  const ids = Object.keys(tags).map(Number);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b), 'tags in ascending order');
  assert.equal(tags[256], 2);
  assert.equal(tags[257], 2);
  assert.equal(tags[259], 1, 'uncompressed');
  assert.equal(tags[277], 4, 'RGBA');
  assert.equal(tags[338], 2, 'unassociated alpha');
  assert.equal(tags[279], 16);
  for (let i = 0; i < 4; i++) assert.equal(v.getUint16(tags[258] + i * 2, true), 8);
  assert.deepEqual([...tif.subarray(tags[273], tags[273] + 16)], [...PIXELS]);
  assert.equal(tif.length, tags[273] + 16);
});
