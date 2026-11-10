// Picture file formats the browser cannot read or write by itself, in plain JS (works in the
// page, the worker and Node tests). Every decoder returns { width, height, data: RGBA }; every
// encoder takes RGBA and returns the file bytes (Uint8Array).
//   read:  TIFF (none, PackBits, LZW, Deflate; 8/16-bit, grey, RGB(A), palette), TGA (raw, RLE),
//          PNM (P1–P6), QOI, PSD (merged image, raw or RLE)
//   write: GIF (256 colours), TGA, PPM, QOI, ICO (PNG inside), TIFF and BMP (image-encode.js),
//          PDF (JPEG inside), SVG (PNG inside)
import { kmeansPalette, createRaster } from '../engine/raster.js';

export class DecodeError extends Error {
  constructor(detail) { super('photo.decodeFailed'); this.code = 'photo.decodeFailed'; this.detail = detail; }
}

const ascii = (bytes, start, length) => String.fromCharCode(...bytes.subarray(start, start + length));

/** The format of a file from its first bytes (null: let the browser try). */
export function sniff(bytes) {
  const b = bytes;
  if (b.length < 4) return null;
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 42 && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 42)) return 'tiff';
  if (ascii(b, 0, 4) === 'qoif') return 'qoi';
  if (ascii(b, 0, 4) === '8BPS') return 'psd';
  if (b[0] === 0x50 && b[1] >= 0x31 && b[1] <= 0x36 && (b[2] === 0x0a || b[2] === 0x0d || b[2] === 0x20 || b[2] === 0x09)) return 'pnm';
  return null;
}

/** Formats this module decodes, by file extension. */
export const DECODED_EXTENSIONS = { tif: 'tiff', tiff: 'tiff', tga: 'tga', icb: 'tga', vda: 'tga', vst: 'tga', pbm: 'pnm', pgm: 'pnm', ppm: 'pnm', pnm: 'pnm', pam: 'pnm', qoi: 'qoi', psd: 'psd' };

/** Decodes a picture of a known kind (async: Deflate TIFFs use the browser's DecompressionStream). */
export async function decodeImage(kind, bytes) {
  switch (kind) {
    case 'tiff': return decodeTiff(bytes);
    case 'tga': return decodeTga(bytes);
    case 'pnm': return decodePnm(bytes);
    case 'qoi': return decodeQoi(bytes);
    case 'psd': return decodePsd(bytes);
    default: throw new DecodeError(`unknown format ${kind}`);
  }
}

// ───────────────────────── TIFF

async function inflate(bytes) {
  if (typeof DecompressionStream !== 'function') throw new DecodeError('Deflate is not available');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function unpackBits(src, expected) {
  const out = new Uint8Array(expected);
  let i = 0;
  let o = 0;
  while (i < src.length && o < expected) {
    const n = (src[i] << 24) >> 24;
    i++;
    if (n >= 0) { for (let k = 0; k <= n && o < expected; k++) out[o++] = src[i++]; } else if (n !== -128) { const v = src[i++]; for (let k = 0; k < 1 - n && o < expected; k++) out[o++] = v; }
  }
  return out;
}

function lzwTiff(src, expected) {
  const out = new Uint8Array(expected);
  let o = 0;
  let bitPos = 0;
  let width = 9;
  let table = [];
  const reset = () => { table = Array.from({ length: 258 }, (_, i) => (i < 256 ? [i] : null)); width = 9; };
  const read = () => {
    let v = 0;
    for (let k = 0; k < width; k++) {
      const byte = src[(bitPos + k) >> 3] ?? 0;
      v = (v << 1) | ((byte >> (7 - ((bitPos + k) & 7))) & 1);
    }
    bitPos += width;
    return v;
  };
  reset();
  let prev = null;
  while (o < expected && bitPos + width <= src.length * 8) {
    const code = read();
    if (code === 257) break;
    if (code === 256) { reset(); prev = null; continue; }
    let entry;
    if (code < table.length && table[code]) entry = table[code];
    else if (prev) entry = [...prev, prev[0]];
    else throw new DecodeError('bad LZW data');
    for (const v of entry) { if (o < expected) out[o++] = v; }
    if (prev) table.push([...prev, entry[0]]);
    prev = entry;
    if (table.length + 1 >= 1 << width && width < 12) width++;
  }
  return out;
}

export async function decodeTiff(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const le = bytes[0] === 0x49;
  const u16 = (o) => view.getUint16(o, le);
  const u32 = (o) => view.getUint32(o, le);
  const ifd = u32(4);
  const count = u16(ifd);
  const tags = {};
  const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
  for (let i = 0; i < count; i++) {
    const at = ifd + 2 + i * 12;
    const tag = u16(at);
    const type = u16(at + 2);
    const n = u32(at + 4);
    const bytesLen = (size[type] ?? 1) * n;
    const where = bytesLen <= 4 ? at + 8 : u32(at + 8);
    const values = [];
    for (let k = 0; k < Math.min(n, 1 << 20); k++) values.push(type === 3 ? u16(where + k * 2) : type === 4 ? u32(where + k * 4) : bytes[where + k]);
    tags[tag] = values;
  }
  const width = tags[256]?.[0];
  const height = tags[257]?.[0];
  if (!width || !height) throw new DecodeError('TIFF without size');
  const bits = tags[258]?.[0] ?? 1;
  const compression = tags[259]?.[0] ?? 1;
  const photometric = tags[262]?.[0] ?? 1;
  const spp = tags[277]?.[0] ?? 1;
  const rowsPerStrip = tags[278]?.[0] ?? height;
  const predictor = tags[317]?.[0] ?? 1;
  if ((tags[284]?.[0] ?? 1) !== 1) throw new DecodeError('planar TIFF is not supported');
  if (![1, 8, 16].includes(bits)) throw new DecodeError(`${bits}-bit TIFF is not supported`);
  const offsets = tags[273] ?? [];
  const counts = tags[279] ?? [];
  const rowBytes = Math.ceil((width * spp * bits) / 8);
  const pixels = new Uint8Array(rowBytes * height);
  let written = 0;
  for (let s = 0; s < offsets.length; s++) {
    const rows = Math.min(rowsPerStrip, height - s * rowsPerStrip);
    const expected = rowBytes * rows;
    const raw = bytes.subarray(offsets[s], offsets[s] + counts[s]);
    let strip;
    if (compression === 1) strip = raw;
    else if (compression === 32773) strip = unpackBits(raw, expected);
    else if (compression === 5) strip = lzwTiff(raw, expected);
    else if (compression === 8 || compression === 32946) strip = await inflate(raw);
    else throw new DecodeError(`TIFF compression ${compression} is not supported`);
    pixels.set(strip.subarray(0, expected), written);
    written += expected;
  }
  if (predictor === 2 && bits === 8) {
    for (let y = 0; y < height; y++) for (let x = spp; x < width * spp; x++) pixels[y * rowBytes + x] = (pixels[y * rowBytes + x] + pixels[y * rowBytes + x - spp]) & 255;
  }
  const out = createRaster(width, height);
  const d = out.data;
  const map = tags[320];
  const sampleAt = (y, x, c) => {
    if (bits === 8) return pixels[y * rowBytes + x * spp + c];
    if (bits === 16) { const o = y * rowBytes + (x * spp + c) * 2; return le ? pixels[o + 1] : pixels[o]; }
    const bit = (pixels[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
    return bit * 255;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (photometric === 3 && map) {
        const v = sampleAt(y, x, 0);
        const n = map.length / 3;
        d[i] = map[v] >> 8; d[i + 1] = map[n + v] >> 8; d[i + 2] = map[2 * n + v] >> 8; d[i + 3] = 255;
      } else if (spp >= 3) {
        d[i] = sampleAt(y, x, 0); d[i + 1] = sampleAt(y, x, 1); d[i + 2] = sampleAt(y, x, 2); d[i + 3] = spp >= 4 ? sampleAt(y, x, 3) : 255;
      } else {
        let v = sampleAt(y, x, 0);
        if (photometric === 0) v = 255 - v;
        d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = spp === 2 ? sampleAt(y, x, 1) : 255;
      }
    }
  }
  return out;
}

// ───────────────────────── TGA

export function decodeTga(bytes) {
  const idLength = bytes[0];
  const colorMapType = bytes[1];
  const type = bytes[2];
  const mapLength = bytes[5] | (bytes[6] << 8);
  const mapDepth = bytes[7];
  const width = bytes[12] | (bytes[13] << 8);
  const height = bytes[14] | (bytes[15] << 8);
  const depth = bytes[16];
  const topDown = (bytes[17] & 0x20) !== 0;
  if (![2, 3, 10, 11].includes(type) || !width || !height) throw new DecodeError(`TGA type ${type} is not supported`);
  let at = 18 + idLength + (colorMapType ? mapLength * Math.ceil(mapDepth / 8) : 0);
  const bpp = depth / 8;
  const total = width * height;
  const raw = new Uint8Array(total * bpp);
  if (type === 2 || type === 3) raw.set(bytes.subarray(at, at + raw.length));
  else {
    let o = 0;
    while (o < raw.length && at < bytes.length) {
      const head = bytes[at++];
      const n = (head & 0x7f) + 1;
      if (head & 0x80) { const px = bytes.subarray(at, at + bpp); at += bpp; for (let k = 0; k < n; k++) { raw.set(px, o); o += bpp; } } else { raw.set(bytes.subarray(at, at + n * bpp), o); at += n * bpp; o += n * bpp; }
    }
  }
  const out = createRaster(width, height);
  const d = out.data;
  for (let p = 0; p < total; p++) {
    const x = p % width;
    const yFile = (p - x) / width;
    const y = topDown ? yFile : height - 1 - yFile;
    const i = (y * width + x) * 4;
    const s = p * bpp;
    if (bpp === 1) { d[i] = d[i + 1] = d[i + 2] = raw[s]; d[i + 3] = 255; } else if (bpp === 2) {
      const v = raw[s] | (raw[s + 1] << 8);
      d[i] = ((v >> 10) & 31) * 8.226; d[i + 1] = ((v >> 5) & 31) * 8.226; d[i + 2] = (v & 31) * 8.226; d[i + 3] = 255;
    } else { d[i] = raw[s + 2]; d[i + 1] = raw[s + 1]; d[i + 2] = raw[s]; d[i + 3] = bpp === 4 ? raw[s + 3] : 255; }
  }
  return out;
}

export function encodeTga(rgba, width, height) {
  const out = new Uint8Array(18 + width * height * 4);
  out[2] = 2;
  out[12] = width & 255; out[13] = width >> 8; out[14] = height & 255; out[15] = height >> 8;
  out[16] = 32; out[17] = 0x28; // 8 alpha bits, top-left origin
  for (let p = 0, o = 18; p < width * height; p++, o += 4) { out[o] = rgba[p * 4 + 2]; out[o + 1] = rgba[p * 4 + 1]; out[o + 2] = rgba[p * 4]; out[o + 3] = rgba[p * 4 + 3]; }
  return out;
}

// ───────────────────────── PNM (PBM, PGM, PPM)

export function decodePnm(bytes) {
  const magic = bytes[1] - 0x30;
  let at = 2;
  const token = () => {
    for (;;) {
      while (at < bytes.length && /\s/.test(String.fromCharCode(bytes[at]))) at++;
      if (bytes[at] === 0x23) { while (at < bytes.length && bytes[at] !== 0x0a) at++; } else break;
    }
    let s = '';
    while (at < bytes.length && !/\s/.test(String.fromCharCode(bytes[at]))) s += String.fromCharCode(bytes[at++]);
    return s;
  };
  const width = Number(token());
  const height = Number(token());
  const maxval = magic === 1 || magic === 4 ? 1 : Number(token());
  if (!width || !height || !maxval) throw new DecodeError('PNM header');
  const out = createRaster(width, height);
  const d = out.data;
  const total = width * height;
  const scale = 255 / maxval;
  if (magic <= 3) {
    const channels = magic === 3 ? 3 : 1;
    for (let p = 0; p < total; p++) {
      const values = [];
      for (let c = 0; c < channels; c++) values.push(magic === 1 ? (token() === '1' ? 0 : 255) : Number(token()) * scale);
      const i = p * 4;
      d[i] = values[0]; d[i + 1] = values[channels > 1 ? 1 : 0]; d[i + 2] = values[channels > 1 ? 2 : 0]; d[i + 3] = 255;
    }
    return out;
  }
  at++;
  if (magic === 4) {
    const rowBytes = Math.ceil(width / 8);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const bit = (bytes[at + y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1; const i = (y * width + x) * 4; d[i] = d[i + 1] = d[i + 2] = bit ? 0 : 255; d[i + 3] = 255; }
    return out;
  }
  const channels = magic === 6 ? 3 : 1;
  const wide = maxval > 255 ? 2 : 1;
  for (let p = 0; p < total; p++) {
    const i = p * 4;
    const read = (c) => { const o = at + (p * channels + c) * wide; return (wide === 2 ? (bytes[o] << 8) | bytes[o + 1] : bytes[o]) * scale; };
    d[i] = read(0); d[i + 1] = read(channels > 1 ? 1 : 0); d[i + 2] = read(channels > 1 ? 2 : 0); d[i + 3] = 255;
  }
  return out;
}

export function encodePpm(rgba, width, height) {
  const header = new TextEncoder().encode(`P6\n# MyPhotoCut\n${width} ${height}\n255\n`);
  const out = new Uint8Array(header.length + width * height * 3);
  out.set(header);
  for (let p = 0, o = header.length; p < width * height; p++, o += 3) {
    const a = rgba[p * 4 + 3] / 255;
    // Over white: PPM has no transparency.
    out[o] = rgba[p * 4] * a + 255 * (1 - a); out[o + 1] = rgba[p * 4 + 1] * a + 255 * (1 - a); out[o + 2] = rgba[p * 4 + 2] * a + 255 * (1 - a);
  }
  return out;
}

// ───────────────────────── QOI

const qoiHash = (r, g, b, a) => (r * 3 + g * 5 + b * 7 + a * 11) % 64;

export function decodeQoi(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(4);
  const height = view.getUint32(8);
  if (!width || !height || width * height > 400e6) throw new DecodeError('QOI header');
  const out = createRaster(width, height);
  const d = out.data;
  const index = new Uint8Array(256);
  let r = 0; let g = 0; let b = 0; let a = 255;
  let at = 14;
  let run = 0;
  for (let o = 0; o < d.length; o += 4) {
    if (run > 0) run--;
    else if (at < bytes.length - 8) {
      const b1 = bytes[at++];
      if (b1 === 0xfe) { r = bytes[at++]; g = bytes[at++]; b = bytes[at++]; } else if (b1 === 0xff) { r = bytes[at++]; g = bytes[at++]; b = bytes[at++]; a = bytes[at++]; } else {
        const tag = b1 >> 6;
        if (tag === 0) { const i = (b1 & 63) * 4; r = index[i]; g = index[i + 1]; b = index[i + 2]; a = index[i + 3]; } else if (tag === 1) {
          r = (r + ((b1 >> 4) & 3) - 2) & 255; g = (g + ((b1 >> 2) & 3) - 2) & 255; b = (b + (b1 & 3) - 2) & 255;
        } else if (tag === 2) {
          const b2 = bytes[at++];
          const dg = (b1 & 63) - 32;
          r = (r + dg - 8 + ((b2 >> 4) & 15)) & 255; g = (g + dg) & 255; b = (b + dg - 8 + (b2 & 15)) & 255;
        } else run = b1 & 63;
      }
      const h = qoiHash(r, g, b, a) * 4;
      index[h] = r; index[h + 1] = g; index[h + 2] = b; index[h + 3] = a;
    }
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a;
  }
  return out;
}

export function encodeQoi(rgba, width, height) {
  const out = new Uint8Array(14 + width * height * 5 + 8);
  const view = new DataView(out.buffer);
  out.set([0x71, 0x6f, 0x69, 0x66]);
  view.setUint32(4, width);
  view.setUint32(8, height);
  out[12] = 4; out[13] = 0;
  const index = new Uint8Array(256);
  let at = 14;
  let pr = 0; let pg = 0; let pb = 0; let pa = 255;
  let run = 0;
  const total = width * height * 4;
  for (let o = 0; o < total; o += 4) {
    const r = rgba[o]; const g = rgba[o + 1]; const b = rgba[o + 2]; const a = rgba[o + 3];
    if (r === pr && g === pg && b === pb && a === pa) {
      run++;
      if (run === 62 || o === total - 4) { out[at++] = 0xc0 | (run - 1); run = 0; }
      continue;
    }
    if (run > 0) { out[at++] = 0xc0 | (run - 1); run = 0; }
    const h = qoiHash(r, g, b, a);
    if (index[h * 4] === r && index[h * 4 + 1] === g && index[h * 4 + 2] === b && index[h * 4 + 3] === a) out[at++] = h;
    else {
      index[h * 4] = r; index[h * 4 + 1] = g; index[h * 4 + 2] = b; index[h * 4 + 3] = a;
      if (a === pa) {
        const dr = ((r - pr + 384) % 256) - 128 + 0;
        const dg = ((g - pg + 384) % 256) - 128;
        const db = ((b - pb + 384) % 256) - 128;
        const s = (v) => (v > 127 ? v - 256 : v < -128 ? v + 256 : v);
        const vr = s(dr); const vg = s(dg); const vb = s(db);
        const drg = vr - vg; const dbg = vb - vg;
        if (vr > -3 && vr < 2 && vg > -3 && vg < 2 && vb > -3 && vb < 2) out[at++] = 0x40 | ((vr + 2) << 4) | ((vg + 2) << 2) | (vb + 2);
        else if (vg > -33 && vg < 32 && drg > -9 && drg < 8 && dbg > -9 && dbg < 8) { out[at++] = 0x80 | (vg + 32); out[at++] = ((drg + 8) << 4) | (dbg + 8); } else { out[at++] = 0xfe; out[at++] = r; out[at++] = g; out[at++] = b; }
      } else { out[at++] = 0xff; out[at++] = r; out[at++] = g; out[at++] = b; out[at++] = a; }
    }
    pr = r; pg = g; pb = b; pa = a;
  }
  out.set([0, 0, 0, 0, 0, 0, 0, 1], at);
  return out.slice(0, at + 8);
}

// ───────────────────────── PSD (the merged picture)

export function decodePsd(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(4) !== 1) throw new DecodeError('PSB / unknown PSD version');
  const channels = view.getUint16(12);
  const height = view.getUint32(14);
  const width = view.getUint32(18);
  const depth = view.getUint16(22);
  const mode = view.getUint16(24);
  if (depth !== 8) throw new DecodeError(`${depth}-bit PSD is not supported`);
  if (mode !== 1 && mode !== 3) throw new DecodeError(`PSD colour mode ${mode} is not supported`);
  let at = 26;
  at += 4 + view.getUint32(at); // colour mode data
  at += 4 + view.getUint32(at); // image resources
  at += 4 + view.getUint32(at); // layers and masks
  const compression = view.getUint16(at);
  at += 2;
  const plane = width * height;
  const planes = [];
  const used = Math.min(channels, mode === 3 ? 4 : 2);
  if (compression === 0) {
    for (let c = 0; c < used; c++) planes.push(bytes.subarray(at + c * plane, at + (c + 1) * plane));
  } else if (compression === 1) {
    const counts = [];
    for (let i = 0; i < channels * height; i++) counts.push(view.getUint16(at + i * 2));
    at += channels * height * 2;
    for (let c = 0; c < channels; c++) {
      const out = new Uint8Array(plane);
      for (let y = 0; y < height; y++) {
        const n = counts[c * height + y];
        out.set(unpackBits(bytes.subarray(at, at + n), width), y * width);
        at += n;
      }
      if (c < used) planes.push(out);
    }
  } else throw new DecodeError(`PSD compression ${compression} is not supported`);
  const out = createRaster(width, height);
  const d = out.data;
  for (let p = 0; p < plane; p++) {
    const i = p * 4;
    if (mode === 3) { d[i] = planes[0][p]; d[i + 1] = planes[1][p]; d[i + 2] = planes[2][p]; d[i + 3] = planes[3] ? planes[3][p] : 255; } else { d[i] = d[i + 1] = d[i + 2] = planes[0][p]; d[i + 3] = planes[1] ? planes[1][p] : 255; }
  }
  return out;
}

// ───────────────────────── GIF (256 colours, LZW)

export function encodeGif(rgba, width, height) {
  const raster = { width, height, data: rgba };
  const palette = kmeansPalette(raster, 255, { seed: 3, iterations: 6, samples: 12000 }).map((c) => c.map((v) => Math.max(0, Math.min(255, Math.round(v)))));
  while (palette.length < 256) palette.push([0, 0, 0]);
  const transparent = 255;
  const cache = new Map();
  const indices = new Uint8Array(width * height);
  for (let p = 0; p < indices.length; p++) {
    const i = p * 4;
    if (rgba[i + 3] < 128) { indices[p] = transparent; continue; }
    const key = ((rgba[i] >> 2) << 12) | ((rgba[i + 1] >> 2) << 6) | (rgba[i + 2] >> 2);
    let best = cache.get(key);
    if (best === undefined) {
      let bestD = Infinity;
      for (let k = 0; k < 255; k++) { const c = palette[k]; const dd = (rgba[i] - c[0]) ** 2 + (rgba[i + 1] - c[1]) ** 2 + (rgba[i + 2] - c[2]) ** 2; if (dd < bestD) { bestD = dd; best = k; } }
      cache.set(key, best);
    }
    indices[p] = best;
  }
  const out = [];
  const push = (...v) => out.push(...v);
  const u16 = (v) => push(v & 255, (v >> 8) & 255);
  push(...new TextEncoder().encode('GIF89a'));
  u16(width); u16(height); push(0xf7, 0, 0);
  for (const c of palette) push(c[0], c[1], c[2]);
  push(0x21, 0xf9, 4, 1, 0, 0, transparent, 0); // graphic control: transparent index
  push(0x2c); u16(0); u16(0); u16(width); u16(height); push(0);
  const minCode = 8;
  push(minCode);
  const data = lzwGif(indices, minCode);
  for (let i = 0; i < data.length; i += 255) { const block = data.subarray(i, i + 255); push(block.length); for (const b of block) out.push(b); }
  push(0, 0x3b);
  return Uint8Array.from(out);
}

function lzwGif(indices, minCode) {
  const clear = 1 << minCode;
  const end = clear + 1;
  const bytes = [];
  let bits = 0;
  let acc = 0;
  let width = minCode + 1;
  const emit = (code) => { acc |= code << bits; bits += width; while (bits >= 8) { bytes.push(acc & 255); acc >>>= 8; bits -= 8; } };
  let dict = new Map();
  let next = end + 1;
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 256 + k;
    const found = dict.get(key);
    if (found !== undefined) { prefix = found; continue; }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << width && width < 12) width++;
    } else { emit(clear); dict = new Map(); next = end + 1; width = minCode + 1; }
    prefix = k;
  }
  emit(prefix);
  emit(end);
  if (bits > 0) bytes.push(acc & 255);
  return Uint8Array.from(bytes);
}

// ───────────────────────── containers around PNG / JPEG

/** ICO holding one PNG (Windows Vista and later read PNG icons up to 256 × 256). */
export function icoFromPng(png, width, height) {
  const out = new Uint8Array(22 + png.length);
  const view = new DataView(out.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  out[6] = width >= 256 ? 0 : width;
  out[7] = height >= 256 ? 0 : height;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, png.length, true);
  view.setUint32(18, 22, true);
  out.set(png, 22);
  return out;
}

/** SVG with the picture inside (opens in browsers and vector editors). */
export function svgFromPng(png, width, height, base64) {
  return new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n  <title>MyPhotoCut caricature</title>\n  <image width="${width}" height="${height}" xlink:href="data:image/png;base64,${base64(png)}"/>\n</svg>\n`);
}
