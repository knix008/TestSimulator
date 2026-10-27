// PNG decoder and encoder (all colour types, bit depths 1..16, Adam7).
import { inflate, deflate, crc32 } from '../../io/zlib.js';
import { cerr, be32, Out, makeRaster } from './common.js';

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

/** Splits a PNG file into its chunks: [{type, data}] (CRC is not checked). */
export function pngChunks(b) {
  for (let i = 0; i < 8; i++) if (b[i] !== SIG[i]) throw cerr('png', 'bad signature');
  const out = [];
  let p = 8;
  while (p + 8 <= b.length) {
    const len = be32(b, p);
    const type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
    if (p + 12 + len > b.length) { if (type === 'IEND') break; throw cerr('png', `truncated ${type} chunk`); }
    out.push({ type, data: b.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
    if (type === 'IEND') break;
  }
  return out;
}

const paeth = (a, b, c) => { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };

function unfilter(raw, off, rows, rowBytes, bpp) {
  // returns Uint8Array of rows*rowBytes and new offset
  const out = new Uint8Array(rows * rowBytes);
  let p = off;
  for (let y = 0; y < rows; y++) {
    const ft = raw[p++];
    const o = y * rowBytes, po = o - rowBytes;
    if (p + rowBytes > raw.length) throw cerr('png', 'image data too short');
    for (let x = 0; x < rowBytes; x++) {
      const v = raw[p + x];
      const a = x >= bpp ? out[o + x - bpp] : 0;
      const b = y > 0 ? out[po + x] : 0;
      const c = y > 0 && x >= bpp ? out[po + x - bpp] : 0;
      let r;
      switch (ft) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: r = v + paeth(a, b, c); break;
        default: throw cerr('png', `bad filter type ${ft}`);
      }
      out[o + x] = r & 255;
    }
    p += rowBytes;
  }
  return [out, p];
}

/** Decodes a PNG. Returns a Raster plus { colorType, interlace, transparent, info }. */
export function decodePng(bytes) {
  const chunks = pngChunks(bytes);
  const ihdr = chunks.find((c) => c.type === 'IHDR');
  if (!ihdr) throw cerr('png', 'missing IHDR');
  const h = ihdr.data;
  const width = be32(h, 0), height = be32(h, 4), depth = h[8], ctype = h[9], interlace = h[12];
  const ch = CHANNELS[ctype];
  if (!ch || ![1, 2, 4, 8, 16].includes(depth)) throw cerr('png', 'unsupported colour type or depth');
  let palette = null, palAlpha = null, transparent = null;
  const idat = [];
  const text = {};
  let gamma = null;
  for (const c of chunks) {
    if (c.type === 'PLTE') palette = c.data.slice();
    else if (c.type === 'tRNS') {
      if (ctype === 3) { palAlpha = new Uint8Array(palette ? palette.length / 3 : 256).fill(255); palAlpha.set(c.data.subarray(0, palAlpha.length)); } else if (ctype === 0) transparent = [(c.data[0] << 8) | c.data[1]];
      else if (ctype === 2) transparent = [(c.data[0] << 8) | c.data[1], (c.data[2] << 8) | c.data[3], (c.data[4] << 8) | c.data[5]];
    } else if (c.type === 'IDAT') idat.push(c.data);
    else if (c.type === 'gAMA') gamma = be32(c.data, 0) / 100000;
    else if (c.type === 'tEXt') { const z = c.data.indexOf(0); if (z > 0) text[String.fromCharCode(...c.data.subarray(0, z))] = String.fromCharCode(...c.data.subarray(z + 1)); }
  }
  if (ctype === 3 && !palette) throw cerr('png', 'missing palette');
  let n = 0; for (const d of idat) n += d.length;
  const z = new Uint8Array(n); let o = 0; for (const d of idat) { z.set(d, o); o += d.length; }
  const bitsPP = ch * depth;
  const bpp = Math.max(1, bitsPP >> 3);
  const est = interlace ? 0 : height * (1 + Math.ceil(width * bitsPP / 8));
  const raw = inflate(z, est);
  const r = makeRaster(width, height, ch, depth > 8 ? 16 : depth <= 8 ? depth : 8);
  r.bitDepth = depth;
  r.data = depth === 16 ? new Uint16Array(width * height * ch) : new Uint8Array(width * height * ch);
  const put = (rows, sw, sh, x0, y0, dx, dy) => {
    const rowBytes = Math.ceil(sw * bitsPP / 8);
    for (let y = 0; y < sh; y++) {
      const ro = y * rowBytes;
      const yy = y0 + y * dy;
      for (let x = 0; x < sw; x++) {
        const xx = x0 + x * dx;
        const di = (yy * width + xx) * ch;
        if (depth === 8) for (let k = 0; k < ch; k++) r.data[di + k] = rows[ro + x * ch + k];
        else if (depth === 16) for (let k = 0; k < ch; k++) r.data[di + k] = (rows[ro + (x * ch + k) * 2] << 8) | rows[ro + (x * ch + k) * 2 + 1];
        else {
          // sub-byte: ch is 1 here
          const bit = x * depth;
          const byte = rows[ro + (bit >> 3)];
          r.data[di] = (byte >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
        }
      }
    }
  };
  if (!interlace) {
    const [rows] = unfilter(raw, 0, height, Math.ceil(width * bitsPP / 8), bpp);
    put(rows, width, height, 0, 0, 1, 1);
  } else {
    let p = 0;
    for (const [x0, y0, dx, dy] of ADAM7) {
      const sw = Math.ceil((width - x0) / dx), sh = Math.ceil((height - y0) / dy);
      if (sw <= 0 || sh <= 0) continue;
      const [rows, np] = unfilter(raw, p, sh, Math.ceil(sw * bitsPP / 8), bpp);
      p = np;
      put(rows, sw, sh, x0, y0, dx, dy);
    }
  }
  if (ctype === 3) { r.indexed = true; r.palette = palette; r.paletteAlpha = palAlpha; }
  r.colorType = ctype;
  r.interlace = interlace;
  r.transparent = transparent;
  r.gamma = gamma;
  r.text = text;
  r.hasAlpha = ctype === 4 || ctype === 6;
  return r;
}

/** Header fields without decoding the pixels. */
export function pngInfo(bytes) {
  const chunks = pngChunks(bytes);
  const h = chunks[0].data;
  const ctype = h[9];
  const plte = chunks.find((c) => c.type === 'PLTE');
  return { width: be32(h, 0), height: be32(h, 4), bitDepth: h[8], colorType: ctype, interlace: h[12], channels: CHANNELS[ctype], paletteSize: plte ? plte.data.length / 3 : 0, palette: plte ? plte.data : null, hasTrns: chunks.some((c) => c.type === 'tRNS') };
}

function chunk(out, type, data) {
  out.be32(data.length);
  const td = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) td[i] = type.charCodeAt(i);
  td.set(data, 4);
  out.bytes(td);
  out.be32(crc32(td));
}

/**
 * Encodes a PNG.
 * img: { width, height, channels (1..4), bitDepth (1,2,4,8,16), data (samples, interleaved),
 *        palette?: Uint8Array RGB triples (indexed, channels 1), paletteAlpha?: Uint8Array,
 *        transparent?: number[] (gray or RGB sample values), text?: {key: value} }
 * opts: { level }
 */
export function encodePng(img, opts = {}) {
  const { width, height, channels: ch, bitDepth: depth, data } = img;
  const ctype = img.palette ? 3 : ({ 1: 0, 2: 4, 3: 2, 4: 6 })[ch];
  const bitsPP = ch * depth;
  const rowBytes = Math.ceil(width * bitsPP / 8);
  const bpp = Math.max(1, bitsPP >> 3);
  const raw = new Uint8Array(height * (rowBytes + 1));
  const cur = new Uint8Array(rowBytes), prev = new Uint8Array(rowBytes);
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(rowBytes));
  for (let y = 0; y < height; y++) {
    cur.fill(0);
    const base = y * width * ch;
    if (depth === 8) for (let i = 0; i < width * ch; i++) cur[i] = data[base + i];
    else if (depth === 16) for (let i = 0; i < width * ch; i++) { const v = data[base + i]; cur[2 * i] = v >> 8; cur[2 * i + 1] = v & 255; }
    else for (let x = 0; x < width; x++) { const bit = x * depth; cur[bit >> 3] |= (data[base + x] & ((1 << depth) - 1)) << (8 - depth - (bit & 7)); }
    // adaptive filtering (none for palette / sub-byte images, as libpng does)
    let best = 0;
    if (ctype !== 3 && depth >= 8) {
      let bestSum = Infinity;
      for (let f = 0; f < 5; f++) {
        const c = cand[f]; let sum = 0;
        for (let x = 0; x < rowBytes; x++) {
          const a = x >= bpp ? cur[x - bpp] : 0, b = y ? prev[x] : 0, cc = y && x >= bpp ? prev[x - bpp] : 0;
          const v = (cur[x] - (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, cc))) & 255;
          c[x] = v; sum += v < 128 ? v : 256 - v;
        }
        if (sum < bestSum) { bestSum = sum; best = f; }
      }
    } else cand[0].set(cur);
    raw[y * (rowBytes + 1)] = best;
    raw.set(cand[best], y * (rowBytes + 1) + 1);
    prev.set(cur);
  }
  const out = new Out(raw.length / 2 + 128);
  out.bytes(SIG);
  const ih = new Uint8Array(13);
  const dv = new DataView(ih.buffer);
  dv.setUint32(0, width); dv.setUint32(4, height); ih[8] = depth; ih[9] = ctype; ih[10] = 0; ih[11] = 0; ih[12] = 0;
  chunk(out, 'IHDR', ih);
  if (img.gamma) { const g = new Uint8Array(4); new DataView(g.buffer).setUint32(0, Math.round(img.gamma * 100000)); chunk(out, 'gAMA', g); }
  if (ctype === 3) {
    chunk(out, 'PLTE', img.palette);
    if (img.paletteAlpha) {
      let n = img.paletteAlpha.length; while (n > 0 && img.paletteAlpha[n - 1] === 255) n--;
      if (n) chunk(out, 'tRNS', img.paletteAlpha.subarray(0, n));
    }
  } else if (img.transparent && (ctype === 0 || ctype === 2)) {
    const t = new Uint8Array(img.transparent.length * 2);
    img.transparent.forEach((v, i) => { t[2 * i] = v >> 8; t[2 * i + 1] = v & 255; });
    chunk(out, 'tRNS', t);
  }
  for (const [k, v] of Object.entries(img.text || {})) {
    const s = k + '\0' + v; const t = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) t[i] = s.charCodeAt(i) & 255; chunk(out, 'tEXt', t);
  }
  chunk(out, 'IDAT', deflate(raw, opts.level ?? 6));
  chunk(out, 'IEND', new Uint8Array(0));
  return out.result();
}
