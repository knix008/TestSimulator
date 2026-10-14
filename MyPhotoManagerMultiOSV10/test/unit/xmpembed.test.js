// Embedded XMP in PNG, WebP and TIFF: written packets read back (by our reader
// and by exifr), replacing an older packet, files stay well-formed (PNG CRCs,
// RIFF sizes, VP8X flags and canvas, TIFF pixels unchanged).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readMetadata } from '../../src/formats/exif.js';
import { buildXmp, parseXmp, updateXmp } from '../../src/formats/xmp.js';
import { embedXmp, readEmbeddedXmp, xmpContainer } from '../../src/formats/xmpembed.js';
import { crc32 } from '../../src/formats/zip.js';

const require = createRequire(import.meta.url);
const UTIF = require('utif2');
const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'photos');
const read = (name) => new Uint8Array(fs.readFileSync(path.join(fixtures, name)));
const fields = { rating: 4, label: 'green', keywords: ['sea', 'Places|Korea|Busan'], headline: 'Embedded', copyright: '© Test' };

function pngChunksValid(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const types = [];
  for (let at = 8; at < bytes.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    assert.equal(view.getUint32(at + 8 + length), crc32(bytes.subarray(at + 4, at + 8 + length)), `CRC of ${type}`);
    types.push(type);
    at += 12 + length;
  }
  return types;
}

test('recognises the containers', () => {
  assert.equal(xmpContainer(read('sunset.png')), 'png');
  assert.equal(xmpContainer(read('flower.webp')), 'webp');
  assert.equal(xmpContainer(read('scan.tif')), 'tiff');
  assert.equal(xmpContainer(read('beach.jpg')), null);
  assert.throws(() => embedXmp(read('beach.jpg'), 'x'), /PNG, WebP and TIFF/);
});

test('PNG: iTXt after IHDR, valid CRCs, read back by us and by exifr, replaced not duplicated', async () => {
  const once = embedXmp(read('sunset.png'), buildXmp(fields));
  const types = pngChunksValid(once);
  assert.equal(types[0], 'IHDR');
  assert.equal(types[1], 'iTXt');
  assert.equal(types.at(-1), 'IEND');
  const back = parseXmp(readEmbeddedXmp(once));
  assert.equal(back.rating, 4);
  assert.ok(back.keywords.includes('sea') && back.keywords.includes('Places'), JSON.stringify(back.keywords));
  const meta = await readMetadata(once);
  assert.equal(meta.summary.xmpRating, 4, 'exifr sees the rating');
  const twice = embedXmp(once, updateXmp(readEmbeddedXmp(once), { ...fields, rating: 2 }));
  assert.equal(pngChunksValid(twice).filter((t) => t === 'iTXt').length, 1, 'one XMP chunk');
  assert.equal(parseXmp(readEmbeddedXmp(twice)).rating, 2);
});

test('WebP (extended): XMP chunk, flag set, RIFF size right', () => {
  const out = embedXmp(read('flower.webp'), buildXmp(fields));
  const view = new DataView(out.buffer);
  assert.equal(view.getUint32(4, true), out.length - 8, 'RIFF size');
  assert.equal(String.fromCharCode(...out.subarray(12, 16)), 'VP8X');
  assert.ok(out[20] & 0x04, 'XMP flag');
  assert.equal(parseXmp(readEmbeddedXmp(out)).label, 'green');
  const again = embedXmp(out, buildXmp({ rating: 1 }));
  assert.equal(parseXmp(readEmbeddedXmp(again)).rating, 1);
  assert.equal(again.length < out.length + 200, true, 'old packet replaced');
});

test('WebP (simple lossless): becomes extended with the right canvas', () => {
  // A VP8L chunk header for a 300 × 200 picture with alpha (the image data itself does not matter here).
  const vp8l = new Uint8Array(12);
  vp8l[0] = 0x2f;
  const bits = (299) | (199 << 14) | (1 << 28);
  new DataView(vp8l.buffer).setUint32(1, bits >>> 0, true);
  const riff = new Uint8Array(12 + 8 + vp8l.length);
  riff.set([0x52, 0x49, 0x46, 0x46], 0);
  new DataView(riff.buffer).setUint32(4, riff.length - 8, true);
  riff.set([0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c], 8);
  new DataView(riff.buffer).setUint32(16, vp8l.length, true);
  riff.set(vp8l, 20);
  const out = embedXmp(riff, buildXmp({ rating: 3 }));
  const view = new DataView(out.buffer);
  assert.equal(String.fromCharCode(...out.subarray(12, 16)), 'VP8X');
  assert.equal(out[20], 0x04 | 0x10, 'XMP + alpha flags');
  assert.equal((out[24] | (out[25] << 8) | (out[26] << 16)) + 1, 300);
  assert.equal((out[27] | (out[28] << 8) | (out[29] << 16)) + 1, 200);
  assert.equal(view.getUint32(4, true), out.length - 8);
  assert.equal(parseXmp(readEmbeddedXmp(out)).rating, 3);
});

test('TIFF: tag 700, pixels unchanged, read back by exifr', async () => {
  const original = read('scan.tif');
  const out = embedXmp(original, buildXmp(fields));
  assert.equal(parseXmp(readEmbeddedXmp(out)).headline, 'Embedded');
  const decode = (bytes) => { const ifds = UTIF.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); UTIF.decodeImage(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ifds[0]); return { w: ifds[0].width, h: ifds[0].height, rgba: UTIF.toRGBA8(ifds[0]) }; };
  const a = decode(original);
  const b = decode(out);
  assert.equal(b.w, a.w);
  assert.equal(b.h, a.h);
  assert.ok(Buffer.from(a.rgba).equals(Buffer.from(b.rgba)), 'same pixels');
  const meta = await readMetadata(out);
  assert.equal(meta.summary.xmpRating, 4, 'exifr sees the rating');
  const again = embedXmp(out, updateXmp(readEmbeddedXmp(out), { ...fields, rating: 5 }));
  assert.equal(parseXmp(readEmbeddedXmp(again)).rating, 5);
  assert.equal(parseXmp(readEmbeddedXmp(again)).headline, 'Embedded', 'other fields written again');
});
