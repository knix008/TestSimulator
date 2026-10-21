/* node --test — the dependency-free encoders (BMP, TIFF, GIF, ZIP). */
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const E = require('../src/js/encoders');

function gradient(w, h) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; rgba[o] = x * 255 / (w - 1); rgba[o + 1] = y * 255 / (h - 1); rgba[o + 2] = 128; rgba[o + 3] = 255; }
  return rgba;
}
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

test('bmp header and pixel order', () => {
  const out = E.bmp({ width: 3, height: 2, rgba: gradient(3, 2) });
  assert.equal(String.fromCharCode(out[0], out[1]), 'BM');
  assert.equal(u32(out, 2), out.length);
  assert.equal(u32(out, 18), 3); assert.equal(u32(out, 22), 2); assert.equal(u16(out, 28), 24);
  // bottom-up: first stored row is the last image row; BGR
  assert.equal(out[54], 128);         // B of (0, 1)
  assert.equal(out[54 + 1], 255);     // G of (0, 1) = y max
});

test('tiff rgb layout', () => {
  const out = E.tiff({ width: 4, height: 3, rgba: gradient(4, 3), dpi: 300 });
  assert.equal(String.fromCharCode(out[0], out[1]), 'II');
  assert.equal(u16(out, 2), 42);
  const ifd = u32(out, 4);
  const n = u16(out, ifd);
  assert.ok(n >= 12);
  const tags = [];
  for (let i = 0; i < n; i++) tags.push(u16(out, ifd + 2 + i * 12));
  assert.deepEqual(tags, tags.slice().sort((a, b) => a - b), 'IFD sorted');
  assert.ok(tags.includes(256) && tags.includes(273) && tags.includes(282));
  assert.equal(out[8], 0); assert.equal(out[8 + 3], 85);   // first pixel R=0, second pixel R=85
});

test('tiff 16-bit grey', () => {
  const g = new Uint16Array([0, 1000, 65535, 4096]);
  const out = E.tiff({ width: 2, height: 2, gray16: g });
  assert.equal(u16(out, 8), 0); assert.equal(u16(out, 10), 1000); assert.equal(u16(out, 12), 65535);
});

/* Minimal GIF LZW decoder to verify the encoder round-trips. */
function gifDecode(bytes) {
  assert.equal(String.fromCharCode(...bytes.subarray(0, 6)), 'GIF89a');
  const w = u16(bytes, 6), h = u16(bytes, 8);
  const flags = bytes[10];
  let pos = 13;
  const gctSize = flags & 0x80 ? 3 * (1 << ((flags & 7) + 1)) : 0;
  const gct = bytes.subarray(pos, pos + gctSize); pos += gctSize;
  const frames = [];
  while (pos < bytes.length) {
    const b = bytes[pos++];
    if (b === 0x3B) break;
    if (b === 0x21) { pos++; while (bytes[pos]) pos += bytes[pos] + 1; pos++; continue; }
    assert.equal(b, 0x2C);
    const fw = u16(bytes, pos + 4), fh = u16(bytes, pos + 6), lf = bytes[pos + 8]; pos += 9;
    let pal = gct;
    if (lf & 0x80) { const n = 3 * (1 << ((lf & 7) + 1)); pal = bytes.subarray(pos, pos + n); pos += n; }
    const minCode = bytes[pos++];
    const data = [];
    while (bytes[pos]) { data.push(...bytes.subarray(pos + 1, pos + 1 + bytes[pos])); pos += bytes[pos] + 1; }
    pos++;
    // LZW
    const clear = 1 << minCode, eoi = clear + 1;
    let codeSize = minCode + 1, dict = [], next, prev = null, bitBuf = 0, bitCnt = 0, dp = 0;
    const out = [];
    const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict[i] = [i]; dict[clear] = []; dict[eoi] = []; next = eoi + 1; codeSize = minCode + 1; prev = null; };
    reset();
    while (out.length < fw * fh) {
      while (bitCnt < codeSize && dp < data.length) { bitBuf |= data[dp++] << bitCnt; bitCnt += 8; }
      if (bitCnt < codeSize) break;
      const code = bitBuf & ((1 << codeSize) - 1); bitBuf >>>= codeSize; bitCnt -= codeSize;
      if (code === clear) { reset(); continue; }
      if (code === eoi) break;
      let entry;
      if (dict[code]) entry = dict[code].slice();
      else if (code === next && prev) entry = [...prev, prev[0]];
      else throw new Error('bad code');
      out.push(...entry);
      if (prev && next < 4096) { dict[next++] = [...prev, entry[0]]; if (next === (1 << codeSize) && codeSize < 12) codeSize++; }
      prev = entry;
    }
    frames.push({ w: fw, h: fh, pal, idx: out });
  }
  return { w, h, frames };
}

test('gif round-trip (exact palette)', () => {
  const w = 16, h = 8;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { const v = (i % 7) * 30; rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255; }
  const out = E.gif({ width: w, height: h, rgba });
  const g = gifDecode(out);
  assert.equal(g.w, w); assert.equal(g.h, h);
  const fr = g.frames[0];
  assert.equal(fr.idx.length, w * h);
  for (let i = 0; i < w * h; i++) assert.equal(fr.pal[fr.idx[i] * 3], rgba[i * 4]);
});

test('gif round-trip (quantised photo-like image)', () => {
  const w = 64, h = 48;
  const rgba = gradient(w, h);
  const out = E.gif({ width: w, height: h, rgba });
  const g = gifDecode(out);
  const fr = g.frames[0];
  assert.equal(fr.idx.length, w * h);
  let err = 0;
  for (let i = 0; i < w * h; i++) err += Math.abs(fr.pal[fr.idx[i] * 3] - rgba[i * 4]);
  assert.ok(err / (w * h) < 12, `mean error ${err / (w * h)}`);
});

test('animated gif has all frames', () => {
  const w = 8, h = 8;
  const frames = [0, 1, 2].map((k) => { const a = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { a[i * 4] = k * 80; a[i * 4 + 1] = k * 80; a[i * 4 + 2] = k * 80; a[i * 4 + 3] = 255; } return a; });
  const out = E.gifAnimated({ width: w, height: h, frames, delayMs: 50 });
  const g = gifDecode(out);
  assert.equal(g.frames.length, 3);
  assert.equal(g.frames[2].pal[g.frames[2].idx[0] * 3], 160);
});

test('zip is readable (store)', () => {
  const data = new TextEncoder().encode('hello dicom');
  const out = E.zip([{ name: 'a/b.txt', data }, { name: 'c.bin', data: new Uint8Array([1, 2, 3]) }]);
  assert.equal(u32(out, 0), 0x04034B50);
  assert.equal(u32(out, 14), E.crc32(data));
  assert.equal(E.crc32(data), zlib.crc32 ? zlib.crc32(data) : E.crc32(data));
  const eocd = out.length - 22;
  assert.equal(u32(out, eocd), 0x06054B50);
  assert.equal(u16(out, eocd + 10), 2);
});

test('quantize keeps ≤256 colours exact', () => {
  const rgba = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) { rgba[i * 4] = i; rgba[i * 4 + 1] = 255 - i; rgba[i * 4 + 2] = 7; rgba[i * 4 + 3] = 255; }
  const q = E.quantize(rgba, 256);
  assert.equal(q.count, 256);
  for (let i = 0; i < 256; i++) assert.equal(q.palette[q.indices[i] * 3], i);
});
