// Bytes as pictures (src/domain/visual.js): every pixel format, the digram and the entropy map, pixel → offset.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bytesPerPixel, pixelOffset, renderPixels, VISUAL_MODES } from '../../src/domain/visual.js';

const px = (img, i) => [...img.rgba.slice(i * 4, i * 4 + 4)];

test('pixel formats: grey, RGB/BGR, RGBA/BGRA, 565, 555, 1-bit, 4-bit palette', () => {
  const bytes = Uint8Array.from([0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80]);
  assert.deepEqual(px(renderPixels(bytes, 'gray8', 4), 1), [0x20, 0x20, 0x20, 255]);
  assert.deepEqual(px(renderPixels(bytes, 'rgb24', 2), 1), [0x40, 0x50, 0x60, 255]);
  assert.deepEqual(px(renderPixels(bytes, 'bgr24', 2), 0), [0x30, 0x20, 0x10, 255]);
  assert.deepEqual(px(renderPixels(bytes, 'rgba32', 2), 1), [0x50, 0x60, 0x70, 0x80]);
  assert.deepEqual(px(renderPixels(bytes, 'bgra32', 2), 0), [0x30, 0x20, 0x10, 0x40]);
  assert.deepEqual(px(renderPixels(Uint8Array.from([0x00, 0xF8]), 'rgb565', 1), 0), [255, 0, 0, 255], 'F800 = pure red');
  assert.deepEqual(px(renderPixels(Uint8Array.from([0xE0, 0x03]), 'rgb555', 1), 0), [0, 255, 0, 255], '03E0 = pure green');
  const bits = renderPixels(Uint8Array.from([0b10100000]), 'bits1', 8);
  assert.deepEqual([0, 1, 2].map((i) => px(bits, i)[0]), [255, 0, 255]);
  assert.deepEqual(px(renderPixels(Uint8Array.from([0x1F]), 'nibble4', 2), 1), [255, 255, 255, 255], 'low nibble F = white');
  const img = renderPixels(new Uint8Array(10), 'gray8', 4);
  assert.deepEqual([img.width, img.height], [4, 3]);
  assert.equal(VISUAL_MODES.length, 11);
});

test('digram counts byte pairs; entropy map tells random from constant', () => {
  const d = renderPixels(Uint8Array.from([1, 2, 1, 2, 1]), 'digram');
  assert.deepEqual([d.width, d.height], [256, 256]);
  assert.equal(d.counts[(1 << 8) | 2], 2);
  assert.equal(d.counts[(2 << 8) | 1], 2);
  assert.equal(d.counts[0], 0);
  const random = Uint8Array.from({ length: 4096 }, (_, i) => (i * 2654435761) >>> 24);
  const e = renderPixels(Uint8Array.from([...new Uint8Array(1024), ...random]), 'entropy', 4, { block: 1024 });
  assert.equal(e.values[0], 0);
  assert.ok(e.values[2] > 6, `random block entropy ${e.values[2]}`);
});

test('pixel → byte offset for each format', () => {
  assert.equal(pixelOffset('rgb24', 10, 3, 1, 1000), 39);
  assert.equal(pixelOffset('bits1', 8, 7, 1, 100), 1);
  assert.equal(pixelOffset('entropy', 4, 1, 0, 5000, { block: 256 }), 256);
  assert.equal(pixelOffset('gray8', 4, 0, 99, 10), null);
  assert.equal(pixelOffset('digram', 256, 1, 1, 10), null);
  assert.equal(bytesPerPixel('rgba32'), 4);
});
