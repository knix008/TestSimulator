// Create tools: GIF, PDF, ZIP, panorama, exposure fusion and focus stacking.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { encodeGif, quantize } from '../../src/create/gif.js';
import { buildPdf, jpegInfo } from '../../src/create/pdf.js';
import { crc32, extractZip, readZip, writeZip } from '../../src/formats/zip.js';
import { alignPair, stitch } from '../../src/create/panorama.js';
import { alignExposures, fuseExposures } from '../../src/create/hdr.js';
import { focusStack, laplacianEnergy } from '../../src/create/focus.js';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'photos');
const readFixture = (name) => new Uint8Array(fs.readFileSync(path.join(fixtures, name)));

const image = (w, h, fill) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fill(x, y);
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
};

// Deterministic pseudo-random numbers (mulberry32).
const rng = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Smooth random texture: sum of random blobs over noise, values 0…255 (gray plane). */
function texture(w, h, seed) {
  const rand = rng(seed);
  const plane = new Float32Array(w * h);
  // Coarse random grid, bilinearly upsampled, plus fine noise.
  const cell = 8;
  const gw = Math.ceil(w / cell) + 2; const gh = Math.ceil(h / cell) + 2;
  const grid = Float32Array.from({ length: gw * gh }, () => rand());
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = x / cell; const fy = y / cell;
      const x0 = Math.floor(fx); const y0 = Math.floor(fy); const tx = fx - x0; const ty = fy - y0;
      const v = grid[y0 * gw + x0] * (1 - tx) * (1 - ty) + grid[y0 * gw + x0 + 1] * tx * (1 - ty) + grid[(y0 + 1) * gw + x0] * (1 - tx) * ty + grid[(y0 + 1) * gw + x0 + 1] * tx * ty;
      plane[y * w + x] = 30 + 170 * v + 40 * rand();
    }
  }
  return plane;
}

const crop = (src, x0, y0, w, h, gain = 1) => image(w, h, (x, y) => {
  const i = ((y + y0) * src.width + (x + x0)) * 4;
  return [src.data[i] * gain, src.data[i + 1] * gain, src.data[i + 2] * gain];
});

// ---- GIF ----------------------------------------------------------------

/** Minimal GIF decoder: frames with palette-resolved RGB, delays, loop count. */
function decodeGif(bytes) {
  let p = 0;
  const u8 = () => bytes[p++];
  const u16 = () => { const v = bytes[p] | (bytes[p + 1] << 8); p += 2; return v; };
  const sig = String.fromCharCode(...bytes.subarray(0, 6));
  assert.equal(sig, 'GIF89a');
  p = 6;
  const width = u16(); const height = u16();
  const packed = u8(); u8(); u8();
  let globalTable = null;
  if (packed & 0x80) { const size = 1 << ((packed & 7) + 1); globalTable = bytes.slice(p, p + size * 3); p += size * 3; }
  const frames = [];
  let loop = null;
  let delay = 0;
  for (;;) {
    const block = u8();
    if (block === 0x3b) break;
    if (block === 0x21) {
      const label = u8();
      if (label === 0xf9) { u8(); u8(); delay = u16() * 10; u8(); u8(); continue; }
      if (label === 0xff) {
        const len = u8();
        const id = String.fromCharCode(...bytes.subarray(p, p + len)); p += len;
        if (id === 'NETSCAPE2.0') { u8(); u8(); loop = u16(); u8(); continue; }
      }
      for (let n = u8(); n; n = u8()) p += n;
      continue;
    }
    assert.equal(block, 0x2c, 'image descriptor expected');
    const left = u16(); const top = u16(); const w = u16(); const h = u16();
    const ip = u8();
    let table = globalTable;
    if (ip & 0x80) { const size = 1 << ((ip & 7) + 1); table = bytes.slice(p, p + size * 3); p += size * 3; }
    const minCode = u8();
    const chunks = [];
    for (let n = u8(); n; n = u8()) { chunks.push(bytes.subarray(p, p + n)); p += n; }
    const data = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
    let o = 0; for (const c of chunks) { data.set(c, o); o += c.length; }
    const indices = lzwDecode(data, minCode, w * h);
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const k = indices[i];
      rgba[i * 4] = table[k * 3]; rgba[i * 4 + 1] = table[k * 3 + 1]; rgba[i * 4 + 2] = table[k * 3 + 2]; rgba[i * 4 + 3] = 255;
    }
    frames.push({ left, top, image: { width: w, height: h, data: rgba }, delay, codeSize: minCode, local: Boolean(ip & 0x80) });
  }
  return { width, height, frames, loop, global: Boolean(globalTable) };
}

function lzwDecode(data, minCode, count) {
  const clear = 1 << minCode; const eoi = clear + 1;
  let codeSize = minCode + 1; let next = eoi + 1;
  const prefix = new Int32Array(4096); const suffix = new Uint8Array(4096); const length = new Int32Array(4096);
  for (let i = 0; i < clear; i++) { prefix[i] = -1; suffix[i] = i; length[i] = 1; }
  const out = new Uint8Array(count);
  let o = 0; let prev = -1; let bit = 0;
  const stack = new Uint8Array(4096);
  const read = () => {
    let v = 0;
    for (let i = 0; i < codeSize; i++, bit++) v |= ((data[bit >> 3] >> (bit & 7)) & 1) << i;
    return v;
  };
  const first = (code) => { while (prefix[code] >= 0) code = prefix[code]; return suffix[code]; };
  while (bit + codeSize <= data.length * 8) {
    const code = read();
    if (code === clear) { codeSize = minCode + 1; next = eoi + 1; prev = -1; continue; }
    if (code === eoi) break;
    assert.ok(code <= next, `bad LZW code ${code} > ${next}`);
    if (prev >= 0 && next < 4096) {
      prefix[next] = prev;
      suffix[next] = code === next ? first(prev) : first(code);
      length[next] = length[prev] + 1;
      next += 1;
      if (next === 1 << codeSize && codeSize < 12) codeSize += 1;
    }
    let c = code; let s = 0;
    while (c >= 0) { stack[s++] = suffix[c]; c = prefix[c]; }
    while (s > 0 && o < count) out[o++] = stack[--s];
    prev = code;
  }
  assert.equal(o, count, 'pixel count');
  return out;
}

const maxDiff = (a, b) => { let m = 0; for (let i = 0; i < a.data.length; i++) if ((i & 3) !== 3) m = Math.max(m, Math.abs(a.data[i] - b.data[i])); return m; };
const meanDiff = (a, b) => { let s = 0; let n = 0; for (let i = 0; i < a.data.length; i++) if ((i & 3) !== 3) { s += Math.abs(a.data[i] - b.data[i]); n++; } return s / n; };

// features: CREATE-GIF FMT-GIF
test('GIF: two photographic frames decode within quantization error, with loop and delays', () => {
  const a = image(64, 48, (x, y) => [x * 4, y * 5, (x + y) * 2]);
  const b = image(64, 48, (x, y) => [255 - x * 4, (x * y) % 256, 128]);
  const gif = encodeGif([{ image: a, delay: 250 }, { image: b }], { loop: 0, delay: 70 });
  const decoded = decodeGif(gif);
  assert.equal(decoded.width, 64);
  assert.equal(decoded.height, 48);
  assert.equal(decoded.loop, 0, 'NETSCAPE2.0 loop forever');
  assert.equal(decoded.frames.length, 2);
  assert.equal(decoded.frames[0].delay, 250);
  assert.equal(decoded.frames[1].delay, 70);
  assert.ok(meanDiff(decoded.frames[0].image, a) < 6, `frame 1 mean error ${meanDiff(decoded.frames[0].image, a)}`);
  assert.ok(meanDiff(decoded.frames[1].image, b) < 8, `frame 2 mean error ${meanDiff(decoded.frames[1].image, b)}`);
  assert.ok(maxDiff(decoded.frames[0].image, a) < 48);
});

test('GIF: exact colours survive for every LZW code size, global palette, dithering', () => {
  for (const colors of [1, 2, 3, 4, 7, 16, 33, 100, 256]) {
    const rand = rng(colors);
    const palette = Array.from({ length: colors }, () => [Math.floor(rand() * 256), Math.floor(rand() * 256), Math.floor(rand() * 256)]);
    // Large and noisy enough to fill the 4096-entry table and force clear codes.
    const img = image(197, 151, () => palette[Math.floor(rand() * colors)]);
    const decoded = decodeGif(encodeGif([{ image: img }], { loop: 3 }));
    assert.equal(decoded.loop, 3);
    assert.equal(maxDiff(decoded.frames[0].image, img), 0, `${colors} colours must be exact`);
  }
  const a = image(40, 30, (x) => [x * 6, 0, 0]);
  const b = image(40, 30, (x, y) => [0, y * 8, 255]);
  const g = decodeGif(encodeGif([{ image: a }, { image: b }], { palette: 'global', loop: null }));
  assert.ok(g.global);
  assert.equal(g.loop, null);
  assert.ok(g.frames.every((f) => !f.local));
  assert.equal(maxDiff(g.frames[0].image, a), 0);
  assert.equal(maxDiff(g.frames[1].image, b), 0);
  const smooth = image(128, 64, (x, y) => [x * 2, y * 4, 255 - x]);
  const d = decodeGif(encodeGif([{ image: smooth }], { dither: true, maxColors: 16 }));
  assert.ok(meanDiff(d.frames[0].image, smooth) < 20);
});

test('quantize keeps ≤256 colours and is exact for images with ≤256 colours', () => {
  const rich = image(120, 90, (x, y) => [(x * 37) % 256, (y * 53) % 256, (x * y) % 256]);
  const q = quantize(rich, 256);
  assert.ok(q.palette.length / 3 <= 256);
  assert.equal(q.indices.length, 120 * 90);
  assert.ok(Math.max(...q.indices) < q.palette.length / 3);
  let err = 0;
  for (let p = 0; p < q.indices.length; p++) for (let c = 0; c < 3; c++) err += Math.abs(q.palette[q.indices[p] * 3 + c] - rich.data[p * 4 + c]);
  assert.ok(err / (q.indices.length * 3) < 12, `mean error ${err / (q.indices.length * 3)}`);
  const few = image(50, 50, (x, y) => [(x % 16) * 16, (y % 16) * 16, 77]);
  const e = quantize(few, 256);
  assert.equal(e.palette.length / 3, 256);
  for (let p = 0; p < e.indices.length; p++) for (let c = 0; c < 3; c++) assert.equal(e.palette[e.indices[p] * 3 + c], few.data[p * 4 + c]);
  assert.ok(quantize(rich, 8).palette.length / 3 <= 8);
});

// ---- PDF ----------------------------------------------------------------

const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');

// features: CREATE-PDF
test('PDF: two JPEG pages with a valid cross-reference table', () => {
  const j1 = readFixture('beach.jpg');
  const j2 = readFixture('portrait.jpg');
  const info = jpegInfo(j1);
  assert.equal(info.components, 3);
  const pdf = buildPdf([
    { jpeg: j1, width: info.width, height: info.height, pageWidth: 595, pageHeight: 842, fit: 'contain', margin: 36 },
    { jpeg: j2, pageWidth: 842, pageHeight: 595, fit: 'fill', margin: 0 },
  ], { title: 'Holiday 사진', author: 'Tester (me)' });
  const text = latin1(pdf);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.match(text, /\/Count 2/);
  assert.match(text, /\/Filter \/DCTDecode/);
  assert.match(text, /\/ColorSpace \/DeviceRGB/);
  assert.match(text, /\/Author \(Tester \\\(me\\\)\)/);
  assert.match(text, /\/Title <FEFF/);
  const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)[1]);
  assert.equal(text.slice(startxref, startxref + 4), 'xref');
  const [, first, count] = /xref\n(\d+) (\d+)\n/.exec(text.slice(startxref)).map(Number);
  assert.equal(first, 0);
  const size = Number(/\/Size (\d+)/.exec(text)[1]);
  assert.equal(size, count);
  const rows = text.slice(startxref).split('\n').slice(2, 2 + count);
  rows.forEach((row, id) => {
    assert.equal(row.length, 19, 'xref rows are 20 bytes with CRLF');
    if (id === 0) return;
    const offset = Number(row.slice(0, 10));
    assert.ok(text.startsWith(`${id} 0 obj`, offset), `object ${id} at ${offset}`);
  });
  // Stream lengths match the bytes between stream/endstream.
  const imageObj = text.indexOf('/Subtype /Image');
  const len = Number(/\/Length (\d+)/.exec(text.slice(imageObj))[1]);
  assert.equal(len, j1.length);
});

test('PDF: grayscale and Adobe CMYK JPEG headers choose the colour space', () => {
  // Header-only JPEGs: SOI, APP14 Adobe, SOF0 with n components, EOI.
  const jpeg = (components, adobe) => {
    const parts = [0xff, 0xd8];
    if (adobe) parts.push(0xff, 0xee, 0, 14, ...[...'Adobe'].map((c) => c.charCodeAt(0)), 0, 100, 0, 0, 0, 0, 2);
    parts.push(0xff, 0xc0, 0, 8 + 3 * components, 8, 0, 10, 0, 20, components);
    for (let c = 0; c < components; c++) parts.push(c + 1, 0x11, 0);
    parts.push(0xff, 0xd9);
    return new Uint8Array(parts);
  };
  const gray = latin1(buildPdf([{ jpeg: jpeg(1, false) }]));
  assert.match(gray, /\/ColorSpace \/DeviceGray/);
  assert.match(gray, /\/MediaBox \[0 0 20 10\]/);
  const cmyk = latin1(buildPdf([{ jpeg: jpeg(4, true) }]));
  assert.match(cmyk, /\/ColorSpace \/DeviceCMYK \/BitsPerComponent 8 \/Decode \[1 0 1 0 1 0 1 0\]/);
  assert.doesNotMatch(latin1(buildPdf([{ jpeg: jpeg(4, false) }])), /\/Decode/);
});

// features: FMT-PDF
test('PDF: pdf.js opens the document', async () => {
  let pdfjs;
  try { pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); } catch { return; }
  const pdf = buildPdf([{ jpeg: readFixture('beach.jpg'), pageWidth: 595, pageHeight: 842, margin: 20 }, { jpeg: readFixture('city.jpg'), fit: 'fill' }], { title: 'Album', author: 'Me' });
  const task = pdfjs.getDocument({ data: pdf, isEvalSupported: false, verbosity: 0 });
  const doc = await task.promise;
  assert.equal(doc.numPages, 2);
  const page = await doc.getPage(1);
  assert.deepEqual(page.view.map(Math.round), [0, 0, 595, 842]);
  const ops = await page.getOperatorList();
  assert.ok(ops.fnArray.includes(pdfjs.OPS.paintImageXObject));
  const meta = await doc.getMetadata();
  assert.equal(meta.info.Title, 'Album');
  assert.equal(meta.info.Author, 'Me');
  await task.destroy();
});

// ---- ZIP ----------------------------------------------------------------

// features: CREATE-ZIP FMT-ZIP
test('ZIP: round trip with stored and deflated entries and a unicode name', () => {
  const text = new TextEncoder().encode('hello hello hello hello hello hello hello hello\n'.repeat(50));
  const rand = rng(7);
  const noise = Uint8Array.from({ length: 3000 }, () => Math.floor(rand() * 256));
  const when = new Date(2024, 4, 17, 13, 45, 30).getTime();
  const zip = writeZip([
    { name: 'docs/readme.txt', data: text, modified: when },
    { name: '사진/노이즈.bin', data: noise, modified: when },
    { name: 'empty/', data: new Uint8Array(0), modified: when },
  ]);
  const entries = readZip(zip);
  assert.deepEqual(entries.map((e) => e.name), ['docs/readme.txt', '사진/노이즈.bin', 'empty/']);
  assert.equal(entries[0].method, 8);
  assert.ok(entries[0].compressedSize < text.length);
  assert.equal(entries[1].method, 0, 'random data is stored');
  assert.equal(entries[1].size, 3000);
  assert.ok(entries[2].isDir);
  assert.ok(!entries[0].isDir);
  assert.equal(entries[0].modified, when);
  assert.deepEqual(extractZip(zip, entries[0]), text);
  assert.deepEqual(extractZip(zip, entries[1]), noise);
  assert.equal(extractZip(zip, entries[2]).length, 0);
});

test('ZIP: corrupted data fails the CRC check', () => {
  const data = new Uint8Array(500).map((_, i) => i % 7);
  const zip = writeZip([{ name: 'a.bin', data }], { level: 0 });
  const [entry] = readZip(zip);
  assert.equal(entry.method, 0);
  const broken = zip.slice();
  broken[30 + 'a.bin'.length + 100] ^= 0xff;
  assert.throws(() => extractZip(broken, entry), /CRC/);
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('ZIP: reads a hand-built archive (CP437 name, deflate, ZIP64 end record)', () => {
  // Deflate block (fixed Huffman) of "Hi!\n" produced by zlib: f3 c8 54 e4 02 00
  const deflated = new Uint8Array([0xf3, 0xc8, 0x54, 0xe4, 0x02, 0x00]);
  const content = new TextEncoder().encode('Hi!\n');
  const crc = crc32(content);
  const name = new Uint8Array([0x63, 0x61, 0x66, 0x82, 0x2e, 0x74, 0x78, 0x74]); // "café.txt" in CP437 (0x82 = é)
  const bytes = [];
  const u16 = (v) => bytes.push(v & 255, (v >> 8) & 255);
  const u32 = (v) => { u16(v & 0xffff); u16(v >>> 16); };
  const u64 = (v) => { u32(v); u32(0); };
  // Local header
  u32(0x04034b50); u16(20); u16(0); u16(8); u16(0x6000); u16(0x5821); u32(crc); u32(deflated.length); u32(content.length); u16(name.length); u16(0);
  bytes.push(...name, ...deflated);
  const cdOffset = bytes.length;
  // Central directory with a ZIP64 extra field carrying the local header offset.
  u32(0x02014b50); u16(45); u16(45); u16(0); u16(8); u16(0x6000); u16(0x5821); u32(crc); u32(deflated.length); u32(content.length);
  u16(name.length); u16(12); u16(0); u16(0); u16(0); u32(0); u32(0xffffffff);
  bytes.push(...name);
  u16(0x0001); u16(8); u64(0);
  const cdSize = bytes.length - cdOffset;
  const end64 = bytes.length;
  u32(0x06064b50); u64(44); u16(45); u16(45); u32(0); u32(0); u64(1); u64(1); u64(cdSize); u64(cdOffset);
  u32(0x07064b50); u32(0); u64(end64); u32(1);
  u32(0x06054b50); u16(0); u16(0); u16(0xffff); u16(0xffff); u32(0xffffffff); u32(0xffffffff); u16(0);
  const zip = new Uint8Array(bytes);
  const [entry] = readZip(zip);
  assert.equal(entry.name, 'café.txt');
  assert.equal(entry.offset, 0);
  assert.equal(entry.method, 8);
  assert.equal(new Date(entry.modified).getFullYear(), 2024);
  assert.equal(new TextDecoder().decode(extractZip(zip, entry)), 'Hi!\n');
});

// ---- Panorama -------------------------------------------------------------

function colorScene(w, h, seed) {
  const r = texture(w, h, seed); const g = texture(w, h, seed + 1); const b = texture(w, h, seed + 2);
  return image(w, h, (x, y) => [r[y * w + x], g[y * w + x], b[y * w + x]]);
}

// features: CREATE-PANORAMA
test('panorama: alignPair finds a known offset and stitch builds the canvas', () => {
  const scene = colorScene(520, 260, 11);
  const a = crop(scene, 10, 12, 320, 220);
  const b = crop(scene, 10 + 137, 12 + 5, 320, 220, 1.12);
  const r = alignPair(a, b);
  assert.ok(Math.abs(r.dx - 137) <= 1, `dx ${r.dx}`);
  assert.ok(Math.abs(r.dy - 5) <= 1, `dy ${r.dy}`);
  assert.ok(r.score > 0.9);
  const auto = alignPair(a, b, { direction: 'auto' });
  assert.equal(auto.direction, 'horizontal');
  assert.ok(Math.abs(auto.dx - 137) <= 1);
  const out = stitch([a, b]);
  assert.ok(Math.abs(out.image.width - (137 + 320)) <= 2, `width ${out.image.width}`);
  assert.ok(Math.abs(out.image.height - 225) <= 2);
  assert.equal(out.offsets.length, 2);
  // Exposure equalized: the brighter crop got a lower gain.
  assert.ok(out.gains[1][0] < out.gains[0][0]);
  // Seam region matches the scene up to the global gain.
  const k = out.gains[0][1];
  let err = 0; let n = 0;
  for (let y = 20; y < 200; y += 3) {
    for (let x = 150; x < 310; x += 3) {
      const o = (y * out.image.width + x) * 4;
      const s = ((y + 12) * scene.width + (x + 10)) * 4;
      err += Math.abs(out.image.data[o + 1] - scene.data[s + 1] * k); n++;
    }
  }
  assert.ok(err / n < 12, `seam error ${err / n}`);
});

test('panorama: vertical alignment', () => {
  const scene = colorScene(200, 400, 5);
  const a = crop(scene, 0, 0, 180, 240);
  const b = crop(scene, 6, 150, 180, 240);
  const r = alignPair(a, b, { direction: 'vertical' });
  assert.ok(Math.abs(r.dy - 150) <= 1 && Math.abs(r.dx - 6) <= 1, `${r.dx},${r.dy}`);
  const s = stitch([a, b], { direction: 'auto' });
  assert.ok(Math.abs(s.image.height - 390) <= 2);
});

// ---- HDR --------------------------------------------------------------------

const clipped = (img) => { let n = 0; for (let i = 0; i < img.data.length; i += 4) if (img.data[i] >= 254 || img.data[i] <= 1) n++; return n; };
const meanOf = (img) => { let s = 0; for (let i = 0; i < img.data.length; i += 4) s += (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3; return s / (img.data.length / 4); };

// features: CREATE-HDR
test('HDR: exposure fusion of a gradient keeps detail and lands mid-range', () => {
  const w = 128; const h = 64;
  const radiance = (x, y) => 2 ** ((x / (w - 1)) * 8 - 4) * (1 + 0.1 * Math.sin(y / 3)); // 8 stops
  const shot = (ev) => image(w, h, (x, y) => {
    const v = 255 * Math.min(1, (radiance(x, y) * 2 ** ev / 4) ** (1 / 2.2));
    return [v, v * 0.9, v * 0.8];
  });
  const shots = [shot(-3), shot(0), shot(3)];
  const fused = fuseExposures(shots);
  assert.equal(fused.width, w);
  const best = Math.min(...shots.map(clipped));
  assert.ok(clipped(fused) <= best, `fused clipped ${clipped(fused)} vs best ${best}`);
  const m = meanOf(fused);
  assert.ok(m > 70 && m < 185, `mean ${m}`);
  // Monotone along the gradient (no halos reversing the ramp).
  let reversals = 0;
  for (let x = 1; x < w; x++) if (fused.data[(32 * w + x) * 4] + 8 < fused.data[(32 * w + x - 1) * 4]) reversals++;
  assert.ok(reversals <= 2, `reversals ${reversals}`);
});

test('HDR: median threshold bitmaps recover a known shift', () => {
  const scene = colorScene(300, 220, 21);
  const ref = crop(scene, 40, 40, 200, 140);
  const moved = crop(scene, 40 + 13, 40 - 9, 200, 140, 0.45); // darker exposure, shifted
  const { offsets, images } = alignExposures([ref, moved]);
  // moved(x, y) = ref(x + 13, y - 9), so ref(x, y) = moved(x - 13, y + 9).
  assert.ok(Math.abs(offsets[1].dx + 13) <= 1 && Math.abs(offsets[1].dy - 9) <= 1, JSON.stringify(offsets[1]));
  assert.equal(images[0], ref);
  // The aligned dark shot now lines up with the reference (scaled by its exposure).
  let err = 0; let n = 0;
  for (let y = 20; y < 120; y++) for (let x = 20; x < 180; x++) { const i = (y * 200 + x) * 4 + 1; err += Math.abs(images[1].data[i] / 0.45 - ref.data[i]); n++; }
  assert.ok(err / n < 4, `aligned error ${err / n}`);
  const far = crop(scene, 40 - 30, 40 + 25, 200, 140, 1.4);
  const r = alignExposures([ref, far]).offsets[1];
  assert.ok(Math.abs(r.dx - 30) <= 1 && Math.abs(r.dy + 25) <= 1, JSON.stringify(r));
});

// ---- Focus stacking --------------------------------------------------------

function blurHalf(img, left) {
  const { width: w, height: h } = img;
  const out = { width: w, height: h, data: img.data.slice() };
  const r = 3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (left ? x >= w / 2 : x < w / 2) continue;
      for (let c = 0; c < 3; c++) {
        let s = 0; let n = 0;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx)); const yy = Math.min(h - 1, Math.max(0, y + dy));
          s += img.data[(yy * w + xx) * 4 + c]; n++;
        }
        out.data[(y * w + x) * 4 + c] = s / n;
      }
    }
  }
  return out;
}

// features: CREATE-FOCUS
test('focus stacking picks the sharp half of each shot', () => {
  const scene = colorScene(120, 80, 3);
  const nearSharp = blurHalf(scene, false); // left sharp, right blurred
  const farSharp = blurHalf(scene, true); // right sharp, left blurred
  const merged = focusStack([nearSharp, farSharp]);
  const energy = (img, x0, x1) => { const e = laplacianEnergy(img); let s = 0; for (let y = 4; y < 76; y++) for (let x = x0; x < x1; x++) s += e[y * 120 + x]; return s; };
  for (const [x0, x1] of [[4, 54], [66, 116]]) {
    const em = energy(merged, x0, x1);
    const e1 = energy(nearSharp, x0, x1);
    const e2 = energy(farSharp, x0, x1);
    assert.ok(em >= Math.max(e1, e2) * 0.95, `region ${x0}-${x1}: ${em} vs ${e1}, ${e2}`);
  }
  assert.ok(meanDiff(merged, scene) < 6, `difference from the all-sharp scene ${meanDiff(merged, scene)}`);
  // Alignment option recovers a shifted second shot.
  const shifted = crop(colorScene(140, 100, 3), 0, 0, 120, 80);
  const aligned = focusStack([shifted, shifted], { align: true, radius: 1 });
  assert.equal(aligned.width, 120);
});
