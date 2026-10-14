// High bit depth pictures (16 bits per channel): the decoders keep a precise
// copy — { width, height, data: Float32Array RGBA, values 0…255 with fractions }
// — so strong tone edits do not band, and edits can be saved as 16-bit TIFF / PNG.
//   readTiff16(page)   UTIF page (already decoded, little-endian) → high copy
//   decodePng16(bytes) 16-bit PNG (grey, grey+alpha, RGB, RGBA; not interlaced)
//   dither(high)       → 8-bit RGBA with ordered dithering (no banding)
//   scaleHigh(high, w, h)  area-averaged copy at another size
//   encodeTiff16(high) / encodePng16(high)  16-bit files
import pako from 'pako';

/** A 16-bit TIFF page's samples as a high copy, or null for other depths. */
export function readTiff16(page) {
  const bps = page.t258?.[0];
  if (bps !== 16 || !page.data) return null;
  const spp = page.t277?.[0] ?? 1;
  const { width, height } = page;
  const src = page.data;
  const view = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const out = new Float32Array(width * height * 4);
  const k = 255 / 65535;
  for (let i = 0; i < width * height; i++) {
    const at = i * spp * 2;
    if (at + spp * 2 > src.byteLength) break;
    const s = (c) => view.getUint16(at + c * 2, true) * k;
    const o = i * 4;
    if (spp >= 3) { out[o] = s(0); out[o + 1] = s(1); out[o + 2] = s(2); out[o + 3] = spp >= 4 ? s(3) : 255; } else { const v = s(0); out[o] = v; out[o + 1] = v; out[o + 2] = v; out[o + 3] = spp === 2 ? s(1) : 255; }
  }
  return { width, height, data: out };
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A 16-bit PNG as a high copy; null when the PNG is not 16-bit (or interlaced / palette). */
export function decodePng16(bytes) {
  if (!PNG_SIG.every((b, i) => bytes[i] === b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0; let height = 0; let depth = 0; let type = 0; let interlace = 0;
  const idat = [];
  for (let at = 8; at + 12 <= bytes.length;) {
    const length = view.getUint32(at);
    const name = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (name === 'IHDR') { width = view.getUint32(at + 8); height = view.getUint32(at + 12); depth = bytes[at + 16]; type = bytes[at + 17]; interlace = bytes[at + 20]; }
    if (name === 'IDAT') idat.push(body);
    if (name === 'IEND') break;
    at += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  if (depth !== 16 || !channels || interlace) return null;
  const joined = new Uint8Array(idat.reduce((s, c) => s + c.length, 0));
  let p = 0;
  for (const c of idat) { joined.set(c, p); p += c.length; }
  const raw = pako.inflate(joined);
  const bpp = channels * 2;
  const stride = width * bpp;
  const lines = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = lines.subarray(y * stride, (y + 1) * stride);
    const prev = y ? lines.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const pa = Math.abs(b - c); const pb = Math.abs(a - c); const pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[x] = v;
    }
  }
  const data = new Float32Array(width * height * 4);
  const k = 255 / 65535;
  for (let i = 0; i < width * height; i++) {
    const at = i * bpp;
    const s = (ch) => ((lines[at + ch * 2] << 8) | lines[at + ch * 2 + 1]) * k;
    const o = i * 4;
    if (channels >= 3) { data[o] = s(0); data[o + 1] = s(1); data[o + 2] = s(2); data[o + 3] = channels === 4 ? s(3) : 255; } else { const v = s(0); data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = channels === 2 ? s(1) : 255; }
  }
  return { width, height, data };
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

/** 8-bit RGBA from a high copy, with 4 × 4 ordered dithering (smooth gradients stay smooth). */
export function dither(high, out = new Uint8ClampedArray(high.width * high.height * 4)) {
  const { width, data } = high;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const d = BAYER[((((p / width) | 0) & 3) << 2) | ((p % width) & 3)];
    out[i] = data[i] + d; out[i + 1] = data[i + 1] + d; out[i + 2] = data[i + 2] + d; out[i + 3] = data[i + 3];
  }
  return out;
}

/** Area-averaged copy of a high copy at width × height. */
export function scaleHigh(high, width, height) {
  if (high.width === width && high.height === height) return { width, height, data: new Float32Array(high.data) };
  const out = new Float32Array(width * height * 4);
  const sx = high.width / width;
  const sy = high.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * sy); const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * sx); const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0; let g = 0; let b = 0; let a = 0; let n = 0;
      for (let yy = y0; yy < Math.min(high.height, y1); yy++) for (let xx = x0; xx < Math.min(high.width, x1); xx++) {
        const i = (yy * high.width + xx) * 4;
        r += high.data[i]; g += high.data[i + 1]; b += high.data[i + 2]; a += high.data[i + 3]; n++;
      }
      const o = (y * width + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return { width, height, data: out };
}

const to16 = (v) => Math.max(0, Math.min(65535, Math.round(v * 257)));

/** Uncompressed 16-bit RGB(A) TIFF (little-endian). */
export function encodeTiff16(high, { alpha = false } = {}) {
  const { width, height, data } = high;
  const spp = alpha ? 4 : 3;
  const pixelBytes = width * height * spp * 2;
  const tags = [[256, 4, 1, width], [257, 4, 1, height], [258, 3, spp, 'bps'], [259, 3, 1, 1], [262, 3, 1, 2], [273, 4, 1, 'strip'], [277, 3, 1, spp], [278, 4, 1, height], [279, 4, 1, pixelBytes], [284, 3, 1, 1], ...(alpha ? [[338, 3, 1, 2]] : [])];
  const ifd = 8;
  const bpsAt = ifd + 2 + tags.length * 12 + 4;
  const stripAt = bpsAt + spp * 2 + ((spp * 2) % 4 ? 4 - ((spp * 2) % 4) : 0);
  const out = new Uint8Array(stripAt + pixelBytes);
  const v = new DataView(out.buffer);
  out.set([0x49, 0x49, 42, 0]);
  v.setUint32(4, ifd, true);
  v.setUint16(ifd, tags.length, true);
  tags.forEach(([tag, type, count, value], i) => {
    const at = ifd + 2 + i * 12;
    v.setUint16(at, tag, true); v.setUint16(at + 2, type, true); v.setUint32(at + 4, count, true);
    const val = value === 'bps' ? bpsAt : value === 'strip' ? stripAt : value;
    if (type === 3 && count === 1) v.setUint16(at + 8, val, true); else v.setUint32(at + 8, val, true);
  });
  for (let c = 0; c < spp; c++) v.setUint16(bpsAt + c * 2, 16, true);
  for (let i = 0, o = stripAt; i < width * height; i++) for (let c = 0; c < spp; c++, o += 2) v.setUint16(o, to16(data[i * 4 + c]), true);
  return out;
}

function crc32(bytes) {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) { c ^= bytes[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}

/** 16-bit RGB(A) PNG. */
export function encodePng16(high, { alpha = false } = {}) {
  const { width, height, data } = high;
  const channels = alpha ? 4 : 3;
  const stride = width * channels * 2;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < width; x++) for (let c = 0; c < channels; c++) {
      const v = to16(data[(y * width + x) * 4 + c]);
      const o = y * (stride + 1) + 1 + (x * channels + c) * 2;
      raw[o] = v >> 8; raw[o + 1] = v & 0xff;
    }
  }
  const chunk = (name, body) => {
    const out = new Uint8Array(12 + body.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, body.length);
    for (let i = 0; i < 4; i++) out[4 + i] = name.charCodeAt(i);
    out.set(body, 8);
    v.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const hv = new DataView(ihdr.buffer);
  hv.setUint32(0, width); hv.setUint32(4, height);
  ihdr[8] = 16; ihdr[9] = alpha ? 6 : 2;
  const parts = [Uint8Array.from(PNG_SIG), chunk('IHDR', ihdr), chunk('IDAT', pako.deflate(raw)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
