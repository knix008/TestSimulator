/* node --test — general image decoders (TIFF via UTIF, JPEG 2000 container parsing, HEIF module loading). */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/js/encoders');
const IF = require('../src/js/imageFormats');
const D = require('../src/js/dicomDecoder');

function gradient(w, h) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; rgba[o] = Math.round(x * 255 / (w - 1)); rgba[o + 1] = Math.round(y * 255 / (h - 1)); rgba[o + 2] = 77; rgba[o + 3] = 255; }
  return rgba;
}

test('TIFF: RGB round trip through the encoder and UTIF', async () => {
  const w = 64, h = 48, rgba = gradient(w, h);
  const r = await IF.decode(new Uint8Array(E.tiff({ width: w, height: h, rgba, dpi: 300 })), 'tif');
  assert.equal(r.width, w); assert.equal(r.height, h); assert.equal(r.pages, 1);
  for (let i = 0; i < w * h; i++) {
    assert.equal(r.rgba[i * 4], rgba[i * 4]); assert.equal(r.rgba[i * 4 + 1], rgba[i * 4 + 1]); assert.equal(r.rgba[i * 4 + 2], 77); assert.equal(r.rgba[i * 4 + 3], 255);
  }
});

test('TIFF: 16-bit greyscale is scaled to 8 bit', async () => {
  const w = 8, h = 4;
  const gray16 = new Uint16Array(w * h);
  for (let i = 0; i < gray16.length; i++) gray16[i] = i * 2000;
  const r = await IF.decodeTiff(new Uint8Array(E.tiff({ width: w, height: h, gray16 })));
  assert.equal(r.width, w);
  assert.equal(r.rgba[0], 0);
  assert.ok(Math.abs(r.rgba[31 * 4] - 31 * 2000 / 65535 * 255) <= 1);
  assert.equal(r.rgba[5 * 4], r.rgba[5 * 4 + 1], 'grey');
});

test('TIFF: decode() ignores unknown extensions and rejects garbage', async () => {
  assert.equal(await IF.decode(new Uint8Array([1, 2, 3]), 'png'), null);
  await assert.rejects(IF.decode(new Uint8Array(16), 'tiff'));
});

test('JPEG 2000: the codestream is found inside a JP2 box structure', async () => {
  // build a fake JP2: signature box, ftyp box, then a jp2c box holding a (fake) codestream
  const box = (type, payload) => { const b = Buffer.alloc(8 + payload.length); b.writeUInt32BE(8 + payload.length, 0); b.write(type, 4, 'latin1'); Buffer.from(payload).copy(b, 8); return b; };
  const cs = Buffer.from([0xFF, 0x4F, 0xFF, 0x51, 1, 2, 3, 4]);
  const jp2 = Buffer.concat([box('jP  ', Buffer.from([0x0D, 0x0A, 0x87, 0x0A])), box('ftyp', Buffer.from('jp2 ')), box('jp2c', cs)]);
  const found = IF.j2kCodestream(new Uint8Array(jp2));
  assert.deepEqual(Array.from(found), Array.from(cs));
  assert.deepEqual(Array.from(IF.j2kCodestream(new Uint8Array(cs))), Array.from(cs), 'a bare codestream is returned as is');
  assert.throws(() => IF.j2kCodestream(new Uint8Array(box('ftyp', Buffer.from('jp2 ')))), /No JPEG 2000 codestream/);
});

test('HEIF: libheif wasm module loads and exposes the decoder', async () => {
  const lib = await D.vendor('libheif');
  assert.equal(typeof lib.HeifDecoder, 'function');
  const dec = new lib.HeifDecoder();
  const images = dec.decode(new Uint8Array(32));   // not a HEIF file → no images, no crash
  assert.ok(Array.isArray(images) && images.length === 0);
});

test('extension sets', () => {
  for (const e of ['tif', 'tiff', 'heic', 'heif', 'hif', 'jp2', 'j2k']) assert.ok(IF.EXTS.has(e), e);
  assert.equal(IF.EXTS.has('png'), false);
});
