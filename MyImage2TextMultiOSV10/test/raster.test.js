import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { inputExtensions } from '../src/formats.js';
import { decodeHdr, decodePnm, decodeQoi, decodeTga, detectFormat } from '../src/raster.js';

test('the native file list accepts every format the app decodes', () => {
  const rust = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  for (const extension of inputExtensions()) {
    assert.match(rust, new RegExp(`"${extension}"`));
  }
});

test('qoi decodes a solid pixel', () => {
  const bytes = Uint8Array.from([
    0x71, 0x6f, 0x69, 0x66,
    0, 0, 0, 1,
    0, 0, 0, 1,
    3, 0,
    0xfe, 255, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 1,
  ]);
  assert.equal(detectFormat(bytes, 'qoi'), 'qoi');
  const image = decodeQoi(bytes);
  assert.deepEqual([...image.rgba], [255, 0, 0, 255]);
});

test('tga decodes bottom-origin truecolor', () => {
  const bytes = new Uint8Array(18 + 8);
  bytes[2] = 2;
  bytes[12] = 2;
  bytes[14] = 1;
  bytes[16] = 24;
  bytes.set([0, 0, 255, 0, 255, 0], 18);
  const image = decodeTga(bytes);
  assert.equal(image.width, 2);
  assert.deepEqual([...image.rgba.subarray(0, 4)], [255, 0, 0, 255]);
  assert.deepEqual([...image.rgba.subarray(4, 8)], [0, 255, 0, 255]);
});

test('pnm decodes binary and ascii color', () => {
  const binary = Uint8Array.from([
    ...new TextEncoder().encode('P6\n1 1\n255\n'),
    10, 20, 30,
  ]);
  assert.equal(detectFormat(binary, 'ppm'), 'pnm');
  assert.deepEqual([...decodePnm(binary).rgba], [10, 20, 30, 255]);

  const ascii = new TextEncoder().encode('P3\n1 1\n255\n1 2 3\n');
  assert.deepEqual([...decodePnm(ascii).rgba], [1, 2, 3, 255]);
});

test('hdr maps the brightest sample to white', () => {
  const header = new TextEncoder().encode('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 1\n');
  const bytes = new Uint8Array(header.length + 4);
  bytes.set(header);
  bytes.set([128, 0, 0, 129], header.length);
  assert.equal(detectFormat(bytes, 'hdr'), 'hdr');
  const image = decodeHdr(bytes);
  assert.equal(image.rgba[0], 255);
  assert.equal(image.rgba[3], 255);
});

test('heif and jpeg xl signatures are recognized', () => {
  const heic = new Uint8Array(12);
  heic.set(new TextEncoder().encode('ftypheic'), 4);
  assert.equal(detectFormat(heic, 'heic'), 'heif');
  const jxl = Uint8Array.from([0xff, 0x0a, 0, 0]);
  assert.equal(detectFormat(jxl, 'jxl'), 'jxl');
});
