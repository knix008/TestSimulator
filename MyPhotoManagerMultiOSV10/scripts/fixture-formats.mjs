// Extra test files for the format and "Create" features (called by
// make-fixtures.mjs): every additional image format the app reads, a
// multi-page TIFF, a two-page PDF, a ZIP of photos, an animated GIF and a
// real Bayer-mosaic DNG that LibRaw has to demosaic.
import fs from 'node:fs';
import path from 'node:path';

import { encodeGif } from '../src/create/gif.js';
import { buildPdf } from '../src/create/pdf.js';
import { writeZip } from '../src/formats/zip.js';
import { ASCII, buildTiff, BYTE, LONG, RATIONAL, SHORT, SRATIONAL } from '../src/formats/tiffstruct.js';

const u16le = (v) => [v & 0xff, (v >> 8) & 0xff];
const u32le = (v) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
const u16be = (v) => [(v >> 8) & 0xff, v & 0xff];
const u32be = (v) => [(v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
const ascii = (s) => Array.from(Buffer.from(s, 'latin1'));

/** { width, height, data RGBA } → per-format bytes. */
export function tga({ width, height, data }) {
  const out = [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u16le(width), ...u16le(height), 24, 0x20];
  for (let i = 0; i < width * height; i++) out.push(data[i * 4 + 2], data[i * 4 + 1], data[i * 4]);
  return Uint8Array.from(out);
}

export function ppm({ width, height, data }) {
  const head = Buffer.from(`P6\n# MyPhotoManager fixture\n${width} ${height}\n255\n`);
  const body = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) { body[i * 3] = data[i * 4]; body[i * 3 + 1] = data[i * 4 + 1]; body[i * 3 + 2] = data[i * 4 + 2]; }
  return new Uint8Array(Buffer.concat([head, body]));
}

export function qoi({ width, height, data }) {
  const out = [...ascii('qoif'), ...u32be(width), ...u32be(height), 3, 0];
  for (let i = 0; i < width * height; i++) out.push(0xfe, data[i * 4], data[i * 4 + 1], data[i * 4 + 2]); // QOI_OP_RGB
  out.push(0, 0, 0, 0, 0, 0, 0, 1);
  return Uint8Array.from(out);
}

export function hdr({ width, height, data }) {
  const head = Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`);
  const body = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    // Linear value up to ~4 (an HDR range), RGBE encoded.
    const rgb = [0, 1, 2].map((c) => ((data[i * 4 + c] / 255) ** 2.2) * 4);
    const max = Math.max(...rgb);
    if (max < 1e-32) continue;
    const e = Math.ceil(Math.log2(max));
    const scale = 256 / 2 ** e;
    body[i * 4] = Math.min(255, Math.floor(rgb[0] * scale));
    body[i * 4 + 1] = Math.min(255, Math.floor(rgb[1] * scale));
    body[i * 4 + 2] = Math.min(255, Math.floor(rgb[2] * scale));
    body[i * 4 + 3] = e + 128;
  }
  return new Uint8Array(Buffer.concat([head, body]));
}

export function dds({ width, height, data }) {
  const header = Buffer.alloc(128);
  header.write('DDS ', 0, 'latin1');
  header.writeUInt32LE(124, 4);
  header.writeUInt32LE(0x1 | 0x2 | 0x4 | 0x1000 | 0x8, 8);
  header.writeUInt32LE(height, 12);
  header.writeUInt32LE(width, 16);
  header.writeUInt32LE(width * 4, 20);
  header.writeUInt32LE(32, 76);
  header.writeUInt32LE(0x41, 80); // RGB | ALPHAPIXELS
  header.writeUInt32LE(32, 88);
  header.writeUInt32LE(0x00ff0000, 92);
  header.writeUInt32LE(0x0000ff00, 96);
  header.writeUInt32LE(0x000000ff, 100);
  header.writeUInt32LE(0xff000000, 104);
  header.writeUInt32LE(0x1000, 108);
  const body = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) { body[i * 4] = data[i * 4 + 2]; body[i * 4 + 1] = data[i * 4 + 1]; body[i * 4 + 2] = data[i * 4]; body[i * 4 + 3] = 255; }
  return new Uint8Array(Buffer.concat([header, body]));
}

export function sgi({ width, height, data }) {
  const header = Buffer.alloc(512);
  header.writeUInt16BE(474, 0);
  header[2] = 0; header[3] = 1;
  header.writeUInt16BE(3, 4);
  header.writeUInt16BE(width, 6);
  header.writeUInt16BE(height, 8);
  header.writeUInt16BE(3, 10);
  header.writeUInt32BE(255, 16);
  const body = Buffer.alloc(width * height * 3);
  for (let c = 0; c < 3; c++) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) body[c * width * height + y * width + x] = data[((height - 1 - y) * width + x) * 4 + c];
  return new Uint8Array(Buffer.concat([header, body]));
}

export function ras({ width, height, data }) {
  const rowBytes = Math.ceil((width * 3) / 2) * 2;
  const header = Buffer.from([...u32be(0x59a66a95), ...u32be(width), ...u32be(height), ...u32be(24), ...u32be(rowBytes * height), ...u32be(1), ...u32be(0), ...u32be(0)]);
  const body = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const s = (y * width + x) * 4;
    body[y * rowBytes + x * 3] = data[s + 2]; body[y * rowBytes + x * 3 + 1] = data[s + 1]; body[y * rowBytes + x * 3 + 2] = data[s];
  }
  return new Uint8Array(Buffer.concat([header, body]));
}

export function pcx({ width, height, data }) {
  const bytesPerLine = width + (width % 2);
  const header = Buffer.alloc(128);
  header[0] = 10; header[1] = 5; header[2] = 1; header[3] = 8;
  header.writeUInt16LE(width - 1, 8);
  header.writeUInt16LE(height - 1, 10);
  header.writeUInt16LE(72, 12); header.writeUInt16LE(72, 14);
  header[65] = 3;
  header.writeUInt16LE(bytesPerLine, 66);
  header.writeUInt16LE(1, 68);
  const out = [];
  for (let y = 0; y < height; y++) {
    for (let c = 0; c < 3; c++) {
      const line = [];
      for (let x = 0; x < bytesPerLine; x++) line.push(x < width ? data[(y * width + x) * 4 + c] : 0);
      for (let x = 0; x < line.length;) {
        let run = 1;
        while (x + run < line.length && run < 63 && line[x + run] === line[x]) run++;
        if (run > 1 || line[x] >= 0xc0) out.push(0xc0 | run, line[x]); else out.push(line[x]);
        x += run;
      }
    }
  }
  return new Uint8Array(Buffer.concat([header, Buffer.from(out)]));
}

export function xbm(width, height) {
  const bytesPerRow = Math.ceil(width / 8);
  const bytes = [];
  for (let y = 0; y < height; y++) for (let b = 0; b < bytesPerRow; b++) {
    let v = 0;
    for (let bit = 0; bit < 8; bit++) { const x = b * 8 + bit; if (x < width && ((x >> 3) + (y >> 3)) % 2 === 0) v |= 1 << bit; }
    bytes.push(`0x${v.toString(16).padStart(2, '0')}`);
  }
  return new TextEncoder().encode(`#define check_width ${width}\n#define check_height ${height}\nstatic char check_bits[] = {\n${bytes.join(', ')}\n};\n`);
}

/** Windows icon with one 32-bit BMP entry (bottom-up, empty AND mask). */
export function ico({ width, height, data }) {
  const w = Math.min(width, 256);
  const hgt = Math.min(height, 256);
  const maskRow = Math.ceil(w / 32) * 4;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(w, 4);
  header.writeInt32LE(hgt * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  const pixels = Buffer.alloc(w * hgt * 4);
  for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) {
    const s = ((hgt - 1 - y) * width + x) * 4;
    const d = (y * w + x) * 4;
    pixels[d] = data[s + 2]; pixels[d + 1] = data[s + 1]; pixels[d + 2] = data[s]; pixels[d + 3] = 255;
  }
  const image = Buffer.concat([header, pixels, Buffer.alloc(maskRow * hgt)]);
  const dir = Buffer.alloc(22);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(1, 4);
  dir[6] = w & 0xff; dir[7] = hgt & 0xff;
  dir.writeUInt16LE(1, 10);
  dir.writeUInt16LE(32, 12);
  dir.writeUInt32LE(image.length, 14);
  dir.writeUInt32LE(22, 18);
  return new Uint8Array(Buffer.concat([dir, image]));
}

export const svg = () => new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
<rect width="320" height="200" fill="#3f8fe0"/><circle cx="240" cy="60" r="34" fill="#ffe27a"/><path d="M0 150 Q160 110 320 160 V200 H0Z" fill="#e9d29a"/>
<text x="20" y="40" font-family="sans-serif" font-size="24" fill="#fff">SVG</text></svg>
`);

/** Uncompressed RGB TIFF with several pages (IFD chain). */
export function multiPageTiff(pages) {

  let offset = 8;
  const plan = pages.map(({ width, height }) => {
    const pixels = width * height * 3;
    const ifdAt = offset + pixels + (pixels % 2);
    const entryCount = 10;
    const ifdSize = 2 + entryCount * 12 + 4;
    const bpsAt = ifdAt + ifdSize;
    const page = { width, height, pixelsAt: offset, ifdAt, bpsAt, pixels };
    offset = bpsAt + 6;
    if (offset % 2) offset += 1;
    return page;
  });
  const out = Buffer.alloc(offset);
  out.write('II', 0, 'latin1');
  out.writeUInt16LE(42, 2);
  out.writeUInt32LE(plan[0].ifdAt, 4);
  plan.forEach((page, i) => {
    const { data, width, height } = pages[i];
    for (let p = 0; p < width * height; p++) { out[page.pixelsAt + p * 3] = data[p * 4]; out[page.pixelsAt + p * 3 + 1] = data[p * 4 + 1]; out[page.pixelsAt + p * 3 + 2] = data[p * 4 + 2]; }
    let e = page.ifdAt;
    out.writeUInt16LE(10, e); e += 2;
    const entry = (tag, type, count, value) => { out.writeUInt16LE(tag, e); out.writeUInt16LE(type, e + 2); out.writeUInt32LE(count, e + 4); if (type === 3 && count === 1) out.writeUInt16LE(value, e + 8); else out.writeUInt32LE(value, e + 8); e += 12; };
    entry(254, 4, 1, 2); // page of a multi-page document
    entry(256, 4, 1, width);
    entry(257, 4, 1, height);
    entry(258, 3, 3, page.bpsAt);
    entry(259, 3, 1, 1);
    entry(262, 3, 1, 2);
    entry(273, 4, 1, page.pixelsAt);
    entry(277, 3, 1, 3);
    entry(278, 4, 1, height);
    entry(279, 4, 1, page.pixels);
    out.writeUInt32LE(plan[i + 1]?.ifdAt ?? 0, e);
    out.writeUInt16LE(8, page.bpsAt); out.writeUInt16LE(8, page.bpsAt + 2); out.writeUInt16LE(8, page.bpsAt + 4);
  });

  return new Uint8Array(out);
}

/**
 * A real DNG: 16-bit RGGB Bayer mosaic (no preview), DNG 1.4 tags with a
 * colour matrix, so only a RAW developer (LibRaw) can show it.
 */
export function bayerDng({ width, height, data }, { make = 'MyPhotoManager', model = 'Test Sensor' } = {}) {
  const w = width - (width % 2);
  const hgt = height - (height % 2);
  const strip = Buffer.alloc(w * hgt * 2);
  const linear = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) {
    const channel = y % 2 === 0 ? (x % 2 === 0 ? 0 : 1) : (x % 2 === 0 ? 1 : 2);
    const value = Math.round(linear(data[(y * width + x) * 4 + channel]) * 60000 + 1000);
    strip.writeUInt16LE(Math.min(65535, value), (y * w + x) * 2);
  }
  // XYZ (D65) → linear sRGB, as the camera's ColorMatrix1.
  const matrix = [3.2406, -1.5372, -0.4986, -0.9689, 1.8758, 0.0415, 0.0557, -0.204, 1.057].map((v) => [Math.round(v * 10000), 10000]);
  const entries = (stripAt) => [
    { tag: 254, type: LONG, value: 0 },
    { tag: 256, type: LONG, value: w },
    { tag: 257, type: LONG, value: hgt },
    { tag: 258, type: SHORT, value: 16 },
    { tag: 259, type: SHORT, value: 1 },
    { tag: 262, type: SHORT, value: 32803 },
    { tag: 271, type: ASCII, value: make },
    { tag: 272, type: ASCII, value: model },
    { tag: 273, type: LONG, value: stripAt },
    { tag: 274, type: SHORT, value: 1 },
    { tag: 277, type: SHORT, value: 1 },
    { tag: 278, type: LONG, value: hgt },
    { tag: 279, type: LONG, value: strip.length },
    { tag: 284, type: SHORT, value: 1 },
    { tag: 33421, type: SHORT, value: [2, 2] },
    { tag: 33422, type: BYTE, value: [0, 1, 1, 2] },
    { tag: 50706, type: BYTE, value: [1, 4, 0, 0] },
    { tag: 50707, type: BYTE, value: [1, 1, 0, 0] },
    { tag: 50708, type: ASCII, value: `${make} ${model}` },
    { tag: 50714, type: LONG, value: 1000 },
    { tag: 50717, type: LONG, value: 61000 },
    { tag: 50721, type: SRATIONAL, value: matrix },
    { tag: 50728, type: RATIONAL, value: [[1, 1], [1, 1], [1, 1]] },
    { tag: 50778, type: SHORT, value: 21 },
  ];
  const first = buildTiff({ ifd0: entries(0) });
  const tiff = buildTiff({ ifd0: entries(first.length) });
  return new Uint8Array(Buffer.concat([Buffer.from(tiff), strip]));
}

export function writeExtraFixtures(out, images, { jpegs }) {
  const files = {
    'scene.tga': tga(images.small),
    'scene.ppm': ppm(images.small),
    'scene.qoi': qoi(images.small),
    'scene.hdr': hdr(images.small),
    'scene.dds': dds(images.small),
    'scene.sgi': sgi(images.small),
    'scene.ras': ras(images.small),
    'scene.pcx': pcx(images.small),
    'checker.xbm': xbm(32, 24),
    'scene.ico': ico(images.small),
    'drawing.svg': svg(),
    'pages.tif': multiPageTiff([images.small, images.small2]),
    'document.pdf': buildPdf(jpegs.slice(0, 2).map((jpeg) => ({ jpeg, fit: 'contain', margin: 20, pageWidth: 595, pageHeight: 842 })), { title: 'Fixture' }),
    'album.zip': writeZip(jpegs.slice(0, 3).map((data, i) => ({ name: `zipped/photo-${i + 1}.jpg`, data }))),
    'animation.gif': encodeGif([{ image: images.small, delay: 200 }, { image: images.small2, delay: 200 }]),
    'sensor.dng': bayerDng(images.medium),
  };
  for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(out, name), bytes);
  return Object.keys(files);
}

/** JPEG 2000 (.jp2 file with boxes around a lossless codestream). */
export async function encodeJp2({ width, height, data }) {
  const { default: factory } = await import('@cornerstonejs/codec-openjpeg');
  const openjpeg = await factory({ print() {}, printErr() {} });
  const encoder = new openjpeg.J2KEncoder();
  const input = encoder.getDecodedBuffer({ width, height, bitsPerSample: 8, componentCount: 3, isSigned: false });
  for (let i = 0; i < width * height; i++) { input[i * 3] = data[i * 4]; input[i * 3 + 1] = data[i * 4 + 1]; input[i * 3 + 2] = data[i * 4 + 2]; }
  encoder.setDecompositions(0);
  encoder.encode();
  const j2k = encoder.getEncodedBuffer().slice();
  encoder.delete();
  const box = (type, ...payload) => { const body = payload.flat(Infinity); return [u32be(8 + body.length), ascii(type), body]; };
  return Uint8Array.from([
    box('jP  ', 0x0d, 0x0a, 0x87, 0x0a),
    box('ftyp', ascii('jp2 '), u32be(0), ascii('jp2 ')),
    box('jp2h', box('ihdr', u32be(height), u32be(width), u16be(3), 7, 7, 0, 0), box('colr', 1, 0, 0, u32be(16))),
    box('jp2c', [...j2k]),
  ].flat(Infinity));
}

/** JPEG XL, lossless. */
export async function encodeJxl({ width, height, data }) {
  const { default: encode, init } = await import('@jsquash/jxl/encode.js');
  await init(await WebAssembly.compile(fs.readFileSync(new URL(import.meta.resolve('@jsquash/jxl/codec/enc/jxl_enc.wasm')))));
  return new Uint8Array(await encode({ data: new Uint8ClampedArray(data), width, height }, { lossless: true }));
}
