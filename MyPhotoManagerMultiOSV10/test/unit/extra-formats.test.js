// Extra raster formats (TGA, PCX, Netpbm, QOI, HDR, DDS, SGI, Sun raster, XBM,
// ICO) and the WebAssembly codecs (JPEG 2000, JPEG XL). Every sample file is
// built here, byte by byte or with a tiny encoder, and decoded pixels are
// compared exactly.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { decodeDds, decodeExtra, decodeHdr, decodeIco, decodePcx, decodePnm, decodeQoi, decodeRas, decodeSgi, decodeTga, decodeXbm, EXTRA_FORMATS } from '../../src/formats/extra.js';
import { decodeJpeg2000, decodeJxl, jpeg2000Codestream } from '../../src/formats/codecs.js';

// Reference image, 3×2, row-major RGBA.
const REF = [
  [255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255],
  [255, 255, 255, 255], [0, 0, 0, 255], [10, 20, 30, 255],
];
const REF_ALPHA = REF.map((p, i) => [p[0], p[1], p[2], [255, 128, 0, 64, 255, 200][i]]);

const bytes = (...parts) => Uint8Array.from(parts.flat(Infinity));
const ascii = (s) => [...Buffer.from(s, 'latin1')];
const le16 = (v) => [v & 255, (v >> 8) & 255];
const le32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
const be16 = (v) => [(v >> 8) & 255, v & 255];
const be32 = (v) => [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];

function pixels(image) {
  const out = [];
  for (let i = 0; i < image.width * image.height; i++) out.push(Array.from(image.data.subarray(i * 4, i * 4 + 4)));
  return out;
}

function assertImage(image, width, height, expected) {
  assert.equal(image.width, width);
  assert.equal(image.height, height);
  assert.ok(image.data instanceof Uint8ClampedArray);
  assert.deepEqual(pixels(image), expected);
}

// ---------------------------------------------------------------- TGA

function tgaHeader({ type, width, height, bpp, descriptor = 0, mapType = 0, mapLength = 0, mapBits = 0, id = [] }) {
  return [id.length, mapType, type, le16(0), le16(mapLength), mapBits, le16(0), le16(0), le16(width), le16(height), bpp, descriptor, id];
}

// features: FMT-EXTRA
test('TGA: uncompressed 24-bit, bottom-up', () => {
  const rows = [REF.slice(3), REF.slice(0, 3)]; // bottom row first
  const file = bytes(tgaHeader({ type: 2, width: 3, height: 2, bpp: 24, id: ascii('hi') }), rows.flat().map(([r, g, b]) => [b, g, r]));
  assertImage(decodeTga(file), 3, 2, REF);
});

test('TGA: RLE 32-bit with alpha, top-down', () => {
  const bgra = ([r, g, b, a]) => [b, g, r, a];
  const red = [255, 0, 0, 200];
  // Row 0: run of 3 reds. Row 1: raw packet of 2 then a run of 1.
  const expected = [red, red, red, REF_ALPHA[3], REF_ALPHA[4], REF_ALPHA[5]];
  const file = bytes(
    tgaHeader({ type: 10, width: 3, height: 2, bpp: 32, descriptor: 0x28 }),
    0x82, bgra(red),
    0x01, bgra(REF_ALPHA[3]), bgra(REF_ALPHA[4]),
    0x80, bgra(REF_ALPHA[5]),
  );
  assertImage(decodeTga(file), 3, 2, expected);
});

test('TGA: 32-bit with all-zero alpha and no alpha bits shows opaque', () => {
  const file = bytes(tgaHeader({ type: 2, width: 1, height: 1, bpp: 32 }), [1, 2, 3, 0]);
  assertImage(decodeTga(file), 1, 1, [[3, 2, 1, 255]]);
});

test('TGA: grayscale 8 and color-mapped 8 (RLE), right-to-left', () => {
  const gray = bytes(tgaHeader({ type: 3, width: 2, height: 1, bpp: 8 }), [10, 200]);
  assertImage(decodeTga(gray), 2, 1, [[10, 10, 10, 255], [200, 200, 200, 255]]);
  const mapped = bytes(
    tgaHeader({ type: 9, width: 3, height: 1, bpp: 8, mapType: 1, mapLength: 2, mapBits: 24, descriptor: 0x10 }),
    [0, 0, 255], [255, 0, 0], // map: red, blue (BGR)
    0x81, 0, 0x00, 1,
  );
  // File order red, red, blue; drawn right to left.
  assertImage(decodeTga(mapped), 3, 1, [[0, 0, 255, 255], [255, 0, 0, 255], [255, 0, 0, 255]]);
});

// ---------------------------------------------------------------- PCX

function pcxRle(line) {
  const out = [];
  for (let i = 0; i < line.length;) {
    let n = 1;
    while (i + n < line.length && line[i + n] === line[i] && n < 63) n++;
    if (n > 1 || line[i] >= 0xc0) out.push(0xc0 | n, line[i]);
    else out.push(line[i]);
    i += n;
  }
  return out;
}

function pcxHeader({ width, height, bits, planes, bytesPerLine, ega = [] }) {
  const h = new Array(128).fill(0);
  h[0] = 0x0a; h[1] = 5; h[2] = 1; h[3] = bits;
  h.splice(8, 4, ...le16(width - 1), ...le16(height - 1));
  for (let i = 0; i < ega.length; i++) h[16 + i] = ega[i];
  h[65] = planes;
  h.splice(66, 2, ...le16(bytesPerLine));
  return h;
}

test('PCX: 8-bit with 256-color palette', () => {
  const palette = new Array(768).fill(0);
  REF.forEach(([r, g, b], i) => palette.splice(i * 3, 3, r, g, b));
  const lines = [[0, 1, 2, 0], [3, 4, 5, 0]]; // even bytes per line
  const file = bytes(pcxHeader({ width: 3, height: 2, bits: 8, planes: 1, bytesPerLine: 4 }), lines.map(pcxRle), 0x0c, palette);
  assertImage(decodePcx(file), 3, 2, REF);
});

test('PCX: 24-bit planes and 1-bit mono', () => {
  const lines = [REF.slice(0, 3), REF.slice(3)].map((row) => [0, 1, 2].flatMap((c) => [...row.map((p) => p[c]), 0]));
  const rgb = bytes(pcxHeader({ width: 3, height: 2, bits: 8, planes: 3, bytesPerLine: 4 }), lines.map(pcxRle));
  assertImage(decodePcx(rgb), 3, 2, REF);
  const mono = bytes(pcxHeader({ width: 3, height: 1, bits: 1, planes: 1, bytesPerLine: 2 }), pcxRle([0b10100000, 0]));
  assertImage(decodePcx(mono), 3, 1, [[255, 255, 255, 255], [0, 0, 0, 255], [255, 255, 255, 255]]);
});

// ---------------------------------------------------------------- Netpbm

const W = [255, 255, 255, 255];
const K = [0, 0, 0, 255];

test('PNM: P1 and P4 bitmaps (1 is black)', () => {
  assertImage(decodePnm(bytes(ascii('P1\n# comment\n3 2\n1 0 1\n010\n'))), 3, 2, [K, W, K, W, K, W]);
  assertImage(decodePnm(bytes(ascii('P4 3 2\n'), 0b10100000, 0b01000000)), 3, 2, [K, W, K, W, K, W]);
});

test('PNM: P2 and P5 graymaps, 8 and 16 bits', () => {
  const g = (v) => [v, v, v, 255];
  assertImage(decodePnm(bytes(ascii('P2\n2 2\n# max\n15\n0 15\n5 10\n'))), 2, 2, [g(0), g(255), g(85), g(170)]);
  assertImage(decodePnm(bytes(ascii('P5 2 1 255\n'), 7, 250)), 2, 1, [g(7), g(250)]);
  assertImage(decodePnm(bytes(ascii('P5\n2 1\n65535\n'), be16(65535), be16(257 * 100))), 2, 1, [g(255), g(100)]);
});

test('PNM: P3 and P6 pixmaps', () => {
  const values = REF.flatMap(([r, g, b]) => [r, g, b]);
  assertImage(decodePnm(bytes(ascii(`P3\n3 2\n255\n${values.join(' ')}\n`))), 3, 2, REF);
  assertImage(decodePnm(bytes(ascii('P6\n3 2\n255\n'), values)), 3, 2, REF);
  assertImage(decodePnm(bytes(ascii('P6 1 1 1023\n'), be16(1023), be16(0), be16(341))), 1, 1, [[255, 0, 85, 255]]);
});

test('PNM: P7 PAM, RGB_ALPHA, GRAYSCALE_ALPHA, GRAYSCALE', () => {
  const header = (depth, type) => ascii(`P7\nWIDTH 3\nHEIGHT 2\nDEPTH ${depth}\nMAXVAL 255\nTUPLTYPE ${type}\nENDHDR\n`);
  assertImage(decodePnm(bytes(header(4, 'RGB_ALPHA'), REF_ALPHA)), 3, 2, REF_ALPHA);
  assertImage(decodePnm(bytes(header(3, 'RGB'), REF.map((p) => p.slice(0, 3)))), 3, 2, REF);
  const grayAlpha = REF_ALPHA.map(([r, , , a]) => [r, a]);
  assertImage(decodePnm(bytes(header(2, 'GRAYSCALE_ALPHA'), grayAlpha)), 3, 2, REF_ALPHA.map(([r, , , a]) => [r, r, r, a]));
  assertImage(decodePnm(bytes(header(1, 'GRAYSCALE'), REF.map((p) => p[1]))), 3, 2, REF.map(([, g]) => [g, g, g, 255]));
});

// ---------------------------------------------------------------- QOI

/** The reference QOI encoder (RGBA input). */
function encodeQoi(width, height, rgba, channels = 4) {
  const out = [...ascii('qoif'), ...be32(width), ...be32(height), channels, 0];
  const index = new Array(64).fill(null).map(() => [0, 0, 0, 0]);
  let prev = [0, 0, 0, 255];
  let run = 0;
  const total = width * height;
  for (let i = 0; i < total; i++) {
    const px = rgba.slice(i * 4, i * 4 + 4);
    const same = px.every((v, k) => v === prev[k]);
    if (same) {
      run++;
      if (run === 62 || i === total - 1) { out.push(0xc0 | (run - 1)); run = 0; }
      continue;
    }
    if (run) { out.push(0xc0 | (run - 1)); run = 0; }
    const h = (px[0] * 3 + px[1] * 5 + px[2] * 7 + px[3] * 11) % 64;
    if (index[h].every((v, k) => v === px[k])) {
      out.push(h);
    } else {
      index[h] = px;
      if (px[3] === prev[3]) {
        const dr = ((px[0] - prev[0] + 384) % 256) - 128;
        const dg = ((px[1] - prev[1] + 384) % 256) - 128;
        const db = ((px[2] - prev[2] + 384) % 256) - 128;
        const drg = dr - dg;
        const dbg = db - dg;
        if (dr >= -2 && dr <= 1 && dg >= -2 && dg <= 1 && db >= -2 && db <= 1) out.push(0x40 | ((dr + 2) << 4) | ((dg + 2) << 2) | (db + 2));
        else if (dg >= -32 && dg <= 31 && drg >= -8 && drg <= 7 && dbg >= -8 && dbg <= 7) out.push(0x80 | (dg + 32), ((drg + 8) << 4) | (dbg + 8));
        else out.push(0xfe, px[0], px[1], px[2]);
      } else {
        out.push(0xff, ...px);
      }
    }
    prev = px;
  }
  out.push(0, 0, 0, 0, 0, 0, 0, 1);
  return Uint8Array.from(out);
}

test('QOI: every op (RGB, RGBA, index, diff, luma, run)', () => {
  const px = [
    [10, 20, 30, 255], [10, 20, 30, 255], [10, 20, 30, 255], // run
    [11, 19, 31, 255], // diff
    [30, 35, 40, 255], // luma
    [200, 0, 100, 255], // rgb
    [200, 0, 100, 17], // rgba
    [10, 20, 30, 255], // index
    [11, 19, 31, 255], // index
  ];
  const rgba = px.flat();
  const file = encodeQoi(3, 3, rgba);
  // The encoder really produced each op kind.
  const ops = new Set();
  for (let p = 14; p < file.length - 8;) {
    const op = file[p];
    if (op === 0xfe) { ops.add('rgb'); p += 4; } else if (op === 0xff) { ops.add('rgba'); p += 5; } else { ops.add(['index', 'diff', 'luma', 'run'][op >> 6]); p += op >> 6 === 2 ? 2 : 1; }
  }
  assert.deepEqual([...ops].sort(), ['diff', 'index', 'luma', 'rgb', 'rgba', 'run']);
  assertImage(decodeQoi(file), 3, 3, px);
  assertImage(decodeQoi(encodeQoi(3, 2, REF_ALPHA.flat())), 3, 2, REF_ALPHA);
});

// ---------------------------------------------------------------- HDR

const tone = (v) => Math.round(255 * Math.pow(v / (1 + v), 1 / 2.2));

test('HDR: flat RGBE, tone-mapped', () => {
  // (128, e=129) = 1.0 → 186; (64, 129) = 0.5; e=0 is black; (128, 136) = 128.
  const file = bytes(ascii('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 3\n'), [128, 64, 0, 129], [0, 0, 0, 0], [128, 128, 128, 136]);
  const image = decodeHdr(file);
  assert.equal(tone(1), 186);
  assertImage(image, 3, 1, [[186, tone(0.5), 0, 255], [0, 0, 0, 255], [tone(128), tone(128), tone(128), 255]]);
});

test('HDR: new-style RLE scanlines match the flat encoding', () => {
  const width = 8;
  const row = (y) => Array.from({ length: width }, (_, x) => [x < 5 ? 100 : 20 * x, y * 10 + x, 50, x < 4 ? 130 : 128 + x]);
  const rle = (pixels) => {
    const out = [2, 2, width >> 8, width & 255];
    for (let c = 0; c < 4; c++) {
      const values = pixels.map((p) => p[c]);
      // A run for the first five when they repeat, literal packets otherwise.
      let x = 0;
      while (x < width) {
        let n = 1;
        while (x + n < width && values[x + n] === values[x]) n++;
        if (n > 2) { out.push(128 + n, values[x]); x += n; } else { out.push(1, values[x]); x++; }
      }
    }
    return out;
  };
  const header = ascii(`#?RGBE\n\n-Y 2 +X ${width}\n`);
  const flat = decodeHdr(bytes(header, row(0), row(1)));
  const packed = decodeHdr(bytes(header, rle(row(0)), rle(row(1))));
  assert.deepEqual(pixels(packed), pixels(flat));
  assert.equal(pixels(flat)[0][0], tone(100 * 2 ** (130 - 136)));
  // +Y flips rows.
  const flipped = decodeHdr(bytes(ascii(`#?RGBE\n\n+Y 2 +X ${width}\n`), rle(row(0)), rle(row(1))));
  assert.deepEqual(pixels(flipped).slice(0, width), pixels(flat).slice(width));
});

// ---------------------------------------------------------------- DDS

function ddsHeader({ width, height, pfFlags, fourCC = '\0\0\0\0', bitCount = 0, masks = [0, 0, 0, 0] }) {
  const h = [...ascii('DDS '), ...le32(124), ...le32(0x1007), ...le32(height), ...le32(width), ...le32(0), ...le32(0), ...le32(1), ...new Array(44).fill(0)];
  h.push(...le32(32), ...le32(pfFlags), ...ascii(fourCC), ...le32(bitCount), ...masks.flatMap(le32));
  h.push(...le32(0x1000), ...new Array(16).fill(0));
  assert.equal(h.length, 128);
  return h;
}

test('DDS: uncompressed A8R8G8B8 and R8G8B8', () => {
  const argb = bytes(ddsHeader({ width: 3, height: 2, pfFlags: 0x41, bitCount: 32, masks: [0xff0000, 0xff00, 0xff, 0xff000000] }), REF_ALPHA.map(([r, g, b, a]) => [b, g, r, a]));
  assertImage(decodeDds(argb), 3, 2, REF_ALPHA);
  const rgb = bytes(ddsHeader({ width: 3, height: 2, pfFlags: 0x40, bitCount: 24, masks: [0xff, 0xff00, 0xff0000, 0] }), REF.map(([r, g, b]) => [r, g, b]));
  assertImage(decodeDds(rgb), 3, 2, REF);
  const r5g6b5 = bytes(ddsHeader({ width: 1, height: 1, pfFlags: 0x40, bitCount: 16, masks: [0xf800, 0x07e0, 0x001f, 0] }), le16(0xf81f));
  assertImage(decodeDds(r5g6b5), 1, 1, [[255, 0, 255, 255]]);
});

test('DDS: DXT1 four-color and three-color+transparent blocks', () => {
  const red = 0xf800;
  const blue = 0x001f;
  // Rows of codes: 0 1 2 3 / 3 2 1 0 / 0 0 0 0 / 1 1 1 1 (2 bits each, LSB first).
  const codes = [0b11100100, 0b00011011, 0b00000000, 0b01010101];
  const four = decodeDds(bytes(ddsHeader({ width: 4, height: 4, pfFlags: 0x4, fourCC: 'DXT1' }), le16(red), le16(blue), codes));
  const R = [255, 0, 0, 255], B = [0, 0, 255, 255], C2 = [170, 0, 85, 255], C3 = [85, 0, 170, 255];
  assert.deepEqual(pixels(four), [R, B, C2, C3, C3, C2, B, R, R, R, R, R, B, B, B, B]);
  // c0 <= c1: code 2 is the midpoint, code 3 is transparent. A 3×2 image crops the block.
  const three = decodeDds(bytes(ddsHeader({ width: 3, height: 2, pfFlags: 0x4, fourCC: 'DXT1' }), le16(blue), le16(red), codes));
  const M = [128, 0, 128, 255], T = [0, 0, 0, 0];
  assertImage(three, 3, 2, [B, R, M, T, M, R]);
});

test('DDS: DXT3 and DXT5 alpha', () => {
  const color = [...le16(0xffff), ...le16(0x0000), 0, 0, 0, 0]; // all code 0 = white
  const dxt3Alpha = [0x10, 0x32, 0x54, 0x76, 0x98, 0xba, 0xdc, 0xfe]; // pixel i has alpha i*17
  const dxt3 = decodeDds(bytes(ddsHeader({ width: 4, height: 4, pfFlags: 0x4, fourCC: 'DXT3' }), dxt3Alpha, color));
  assert.deepEqual(pixels(dxt3).map((p) => p[3]), Array.from({ length: 16 }, (_, i) => i * 17));
  assert.deepEqual(pixels(dxt3)[5].slice(0, 3), [255, 255, 255]);
  // DXT5: a0=255, a1=0 (8-value mode); pixel i uses code i % 8.
  let bits = 0n;
  for (let i = 0; i < 16; i++) bits |= BigInt(i % 8) << BigInt(3 * i);
  const idx = Array.from({ length: 6 }, (_, k) => Number((bits >> BigInt(8 * k)) & 255n));
  const dxt5 = decodeDds(bytes(ddsHeader({ width: 4, height: 4, pfFlags: 0x4, fourCC: 'DXT5' }), 255, 0, idx, color));
  const pal = [255, 0, ...[1, 2, 3, 4, 5, 6].map((i) => Math.round(((7 - i) * 255) / 7))];
  assert.deepEqual(pixels(dxt5).map((p) => p[3]), Array.from({ length: 16 }, (_, i) => pal[i % 8]));
});

// ---------------------------------------------------------------- SGI

function sgiHeader({ width, height, channels, rle }) {
  const h = new Array(512).fill(0);
  h.splice(0, 12, ...be16(474), rle ? 1 : 0, 1, ...be16(3), ...be16(width), ...be16(height), ...be16(channels));
  h.splice(16, 4, ...be32(255));
  return h;
}

test('SGI: RLE RGB and verbatim RGBA (rows bottom to top)', () => {
  const width = 3, height = 2;
  // rows[y] with y = 0 the bottom row.
  const rows = [REF.slice(3), REF.slice(0, 3)];
  const packets = [];
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < height; y++) {
      const values = rows[y].map((p) => p[c]);
      // A run when the first two match, otherwise one literal packet.
      packets.push(values[0] === values[1] ? [2, values[0], 0x81, values[2], 0] : [0x83, ...values, 0]);
    }
  }
  const tableStart = 512;
  let offset = tableStart + 2 * 3 * height * 4;
  const starts = [];
  const lengths = [];
  for (const packet of packets) { starts.push(offset); lengths.push(packet.length); offset += packet.length; }
  const rle = bytes(sgiHeader({ width, height, channels: 3, rle: true }), starts.map(be32), lengths.map(be32), packets);
  assertImage(decodeSgi(rle), 3, 2, REF);

  const alphaRows = [REF_ALPHA.slice(3), REF_ALPHA.slice(0, 3)];
  const planes = [0, 1, 2, 3].map((c) => alphaRows.flatMap((row) => row.map((p) => p[c])));
  assertImage(decodeSgi(bytes(sgiHeader({ width, height, channels: 4, rle: false }), planes)), 3, 2, REF_ALPHA);
});

// ---------------------------------------------------------------- Sun raster

function rasHeader({ width, height, depth, type = 1, mapType = 0, mapLength = 0, length = 0 }) {
  return [be32(0x59a66a95), be32(width), be32(height), be32(depth), be32(length), be32(type), be32(mapType), be32(mapLength)];
}

test('Sun raster: 24-bit BGR with row padding, 32-bit RGB (type 3)', () => {
  const rows = [REF.slice(0, 3), REF.slice(3)];
  const bgr = bytes(rasHeader({ width: 3, height: 2, depth: 24 }), rows.map((row) => [...row.flatMap(([r, g, b]) => [b, g, r]), 0]));
  assertImage(decodeRas(bgr), 3, 2, REF);
  const xrgb = bytes(rasHeader({ width: 3, height: 2, depth: 32, type: 3 }), REF.map(([r, g, b]) => [0, r, g, b]));
  assertImage(decodeRas(xrgb), 3, 2, REF);
});

test('Sun raster: RLE 8-bit with a color map, and 1-bit mono', () => {
  // Map: 0 red, 1 green, 0x80 → blue. Rows: [0 0 0x80] [1 1 1] (each padded to 4 bytes).
  const n = 256;
  const map = new Array(n * 3).fill(0);
  map[0] = 255; map[n + 1] = 255; map[2 * n + 0x80] = 255;
  const data = [0x80, 1, 0, 0x80, 0x00, 0, 0x80, 2, 1, 0];
  const file = bytes(rasHeader({ width: 3, height: 2, depth: 8, type: 2, mapType: 1, mapLength: n * 3 }), map, data);
  const R = [255, 0, 0, 255], G = [0, 255, 0, 255], B = [0, 0, 255, 255];
  assertImage(decodeRas(file), 3, 2, [R, R, B, G, G, G]);
  const mono = bytes(rasHeader({ width: 3, height: 1, depth: 1 }), 0b01000000, 0);
  assertImage(decodeRas(mono), 3, 1, [W, K, W]);
});

// ---------------------------------------------------------------- XBM

test('XBM: X11 char array and X10 short array', () => {
  const x11 = `#define dot_width 10
#define dot_height 2
static unsigned char dot_bits[] = {
   0x01, 0x02, 0xff, 0x03 };`;
  const image = decodeXbm(x11);
  assert.equal(image.width, 10);
  assert.deepEqual(pixels(image).slice(0, 10), [K, W, W, W, W, W, W, W, W, K]);
  assert.deepEqual(pixels(image).slice(10), new Array(10).fill(K));
  const x10 = '#define a_width 3\n#define a_height 1\nstatic short a_bits[] = { 0x0005 };';
  assertImage(decodeXbm(Buffer.from(x10)), 3, 1, [K, W, K]);
});

// ---------------------------------------------------------------- ICO

function icoFile(entries) {
  const head = [le16(0), le16(1), le16(entries.length)];
  let offset = 6 + 16 * entries.length;
  const dir = [];
  for (const e of entries) {
    dir.push(e.width & 255, e.height & 255, 0, 0, le16(1), le16(e.bpp), le32(e.data.length), le32(offset));
    offset += e.data.length;
  }
  return bytes(head, dir, entries.map((e) => [...e.data]));
}

function bmpEntry(width, height, bpp, rowsBottomUp, maskRowsBottomUp, palette = []) {
  const header = [le32(40), le32(width), le32(height * 2), le16(1), le16(bpp), le32(0), le32(0), le32(0), le32(0), le32(palette.length / 4), le32(0)];
  return { width, height, bpp, data: bytes(header, palette, rowsBottomUp, maskRowsBottomUp) };
}

// features: FMT-ICO
test('ICO: largest BMP entry, 24-bit with AND mask, 32-bit alpha, 8-bit palette', () => {
  // 2×2 24-bit: rows padded to 8 bytes; mask rows are 4 bytes. Top-left is masked out.
  const rows = [[[0, 0, 255], [0, 255, 0]], [[255, 0, 0], [255, 255, 255]]]; // bottom row first, BGR
  const bmp24 = bmpEntry(2, 2, 24, rows.map((r) => [...r.flat(), 0, 0]), [[0, 0, 0, 0], [0x80, 0, 0, 0]]);
  const small = bmpEntry(1, 1, 24, [[1, 2, 3, 0]], [[0, 0, 0, 0]]);
  const image = decodeIco(icoFile([small, bmp24]));
  assertImage(image, 2, 2, [[0, 0, 255, 0], [255, 255, 255, 255], [255, 0, 0, 255], [0, 255, 0, 255]]);

  const bmp32 = bmpEntry(1, 2, 32, [[1, 2, 3, 40], [4, 5, 6, 0]], [[0, 0, 0, 0], [0, 0, 0, 0]]);
  assertImage(decodeIco(icoFile([bmp32])), 1, 2, [[6, 5, 4, 0], [3, 2, 1, 40]]);

  const palette = [[0, 0, 255, 0], [255, 0, 0, 0]].flat();
  const bmp8 = bmpEntry(2, 1, 8, [[1, 0, 0, 0]], [[0x40, 0, 0, 0]], palette);
  assertImage(decodeIco(icoFile([bmp8])), 2, 1, [[0, 0, 255, 255], [255, 0, 0, 0]]);

  const bmp1 = bmpEntry(3, 1, 1, [[0b10100000, 0, 0, 0]], [[0, 0, 0, 0]], [0, 0, 0, 0, 255, 255, 255, 0]);
  assertImage(decodeIco(icoFile([bmp1])), 3, 1, [W, K, W]);
});

test('ICO: a PNG entry is handed back undecoded', () => {
  const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], be32(13), ascii('IHDR'), be32(48), be32(48), 8, 6, 0, 0, 0, [0, 0, 0, 0]);
  const small = bmpEntry(1, 1, 24, [[1, 2, 3, 0]], [[0, 0, 0, 0]]);
  const result = decodeIco(icoFile([small, { width: 48, height: 48, bpp: 32, data: png }]));
  assert.equal(result.width, 48);
  assert.equal(result.height, 48);
  assert.deepEqual(Array.from(result.png), Array.from(png));
});

// ---------------------------------------------------------------- dispatch

test('EXTRA_FORMATS and decodeExtra', () => {
  assert.equal(EXTRA_FORMATS.pgm, 'pnm');
  assert.equal(EXTRA_FORMATS.rgb, 'sgi');
  assert.equal(EXTRA_FORMATS.sun, 'ras');
  const ppm = bytes(ascii('P6 1 1 255\n'), 1, 2, 3);
  assertImage(decodeExtra(ppm, 'PPM'), 1, 1, [[1, 2, 3, 255]]);
  assertImage(decodeExtra(ppm.buffer, '.pnm'), 1, 1, [[1, 2, 3, 255]]);
  assert.throws(() => decodeExtra(ppm, 'xyz'), /no decoder/);
  assert.throws(() => decodeTga(new Uint8Array(4)), /truncated/);
  assert.throws(() => decodeQoi(bytes(ascii('nope'), new Array(20).fill(0))), /not a QOI/);
});

// ---------------------------------------------------------------- WebAssembly codecs

async function encodeJ2k(width, height, componentCount, bitsPerSample, samples) {
  const { default: factory } = await import('@cornerstonejs/codec-openjpeg');
  const openjpeg = await factory({ print() {}, printErr() {} });
  const encoder = new openjpeg.J2KEncoder();
  const input = encoder.getDecodedBuffer({ width, height, bitsPerSample, componentCount, isSigned: false });
  const view = bitsPerSample > 8 ? new Uint16Array(input.buffer, input.byteOffset, samples.length) : input;
  view.set(samples);
  encoder.setDecompositions(0);
  encoder.encode();
  const out = encoder.getEncodedBuffer().slice();
  encoder.delete();
  return out;
}

function box(type, ...payload) {
  const body = payload.flat(Infinity);
  return [be32(8 + body.length), ascii(type), body];
}

// features: FMT-JP2
test('JPEG 2000: J2K codestream and JP2 file, 8-bit RGB and 16-bit gray', async () => {
  const rgb = REF.flatMap(([r, g, b]) => [r, g, b]);
  const j2k = await encodeJ2k(3, 2, 3, 8, rgb);
  assert.deepEqual([j2k[0], j2k[1]], [0xff, 0x4f]);
  assertImage(await decodeJpeg2000(j2k), 3, 2, REF);

  const jp2 = bytes(
    box('jP  ', 0x0d, 0x0a, 0x87, 0x0a),
    box('ftyp', ascii('jp2 '), be32(0), ascii('jp2 ')),
    box('jp2h', box('ihdr', be32(2), be32(3), be16(3), 7, 7, 0, 0), box('colr', 1, 0, 0, be32(16))),
    box('jp2c', [...j2k]),
  );
  assert.equal(jpeg2000Codestream(jp2).length, j2k.length);
  assertImage(await decodeJpeg2000(jp2.buffer), 3, 2, REF);

  const gray16 = [0, 65535, 257 * 10, 257 * 200];
  const image = await decodeJpeg2000(await encodeJ2k(2, 2, 1, 16, gray16));
  assertImage(image, 2, 2, [0, 255, 10, 200].map((v) => [v, v, v, 255]));
});

// features: FMT-JXL
test('JPEG XL: lossless round trip through @jsquash/jxl', async () => {
  const { default: encode, init } = await import('@jsquash/jxl/encode.js');
  await init(await WebAssembly.compile(fs.readFileSync(new URL(import.meta.resolve('@jsquash/jxl/codec/enc/jxl_enc.wasm')))));
  const data = new Uint8ClampedArray(REF_ALPHA.flat());
  const jxl = await encode({ data, width: 3, height: 2 }, { lossless: true });
  const image = await decodeJxl(new Uint8Array(jxl));
  assertImage(image, 3, 2, REF_ALPHA);
});
