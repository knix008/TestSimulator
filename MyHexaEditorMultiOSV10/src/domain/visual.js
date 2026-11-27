// Bytes as pictures (ImHex image visualizer and digram): the pixels of a byte range in a chosen pixel format, and
// the digram (how often byte b follows byte a). Pure functions, so the unit tests check them pixel by pixel.

export const VISUAL_MODES = [
  // id, bytes per pixel (fraction for packed formats)
  ['gray8', 1], ['rgb24', 3], ['bgr24', 3], ['rgba32', 4], ['bgra32', 4], ['rgb565', 2], ['rgb555', 2], ['bits1', 1 / 8], ['nibble4', 1 / 2], ['digram', 0], ['entropy', 0],
];
export const bytesPerPixel = (mode) => VISUAL_MODES.find(([id]) => id === mode)?.[1] ?? 1;

/** The 16 colours of a 4-bit pixel (classic VGA palette). */
const VGA = [0x000000, 0x0000AA, 0x00AA00, 0x00AAAA, 0xAA0000, 0xAA00AA, 0xAA5500, 0xAAAAAA, 0x555555, 0x5555FF, 0x55FF55, 0x55FFFF, 0xFF5555, 0xFF55FF, 0xFFFF55, 0xFFFFFF];

/**
 * Pixels of `bytes` read as `mode`, `width` pixels per row: { width, height, rgba: Uint8ClampedArray, perPixel }.
 * Bytes left over at the end (less than one pixel) are not drawn. digram: 256 × 256, brightness = log count.
 * entropy: one pixel per block of `block` bytes, black = 0 bits, white = 8 bits per byte.
 */
export function renderPixels(bytes, mode, width = 256, { block = 256 } = {}) {
  if (mode === 'digram') return digram(bytes);
  if (mode === 'entropy') return entropyMap(bytes, Math.max(1, width), block);
  const per = bytesPerPixel(mode);
  const count = per >= 1 ? Math.floor(bytes.length / per) : bytes.length * Math.round(1 / per);
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.ceil(count / w));
  const rgba = new Uint8ClampedArray(w * h * 4);
  const put = (i, r, g, b, a = 255) => { const o = i * 4; rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a; };
  for (let i = 0; i < count; i += 1) {
    switch (mode) {
      case 'gray8': { const v = bytes[i]; put(i, v, v, v); break; }
      case 'rgb24': { const o = i * 3; put(i, bytes[o], bytes[o + 1], bytes[o + 2]); break; }
      case 'bgr24': { const o = i * 3; put(i, bytes[o + 2], bytes[o + 1], bytes[o]); break; }
      case 'rgba32': { const o = i * 4; put(i, bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]); break; }
      case 'bgra32': { const o = i * 4; put(i, bytes[o + 2], bytes[o + 1], bytes[o], bytes[o + 3]); break; }
      case 'rgb565': { const v = bytes[i * 2] | (bytes[i * 2 + 1] << 8); put(i, ((v >> 11) & 31) * 255 / 31, ((v >> 5) & 63) * 255 / 63, (v & 31) * 255 / 31); break; }
      case 'rgb555': { const v = bytes[i * 2] | (bytes[i * 2 + 1] << 8); put(i, ((v >> 10) & 31) * 255 / 31, ((v >> 5) & 31) * 255 / 31, (v & 31) * 255 / 31); break; }
      case 'bits1': { const bit = (bytes[i >> 3] >> (7 - (i & 7))) & 1; const v = bit ? 255 : 0; put(i, v, v, v); break; }
      case 'nibble4': { const n = (bytes[i >> 1] >> ((i & 1) ? 0 : 4)) & 15; const c = VGA[n]; put(i, c >> 16, (c >> 8) & 255, c & 255); break; }
      default: { const v = bytes[i]; put(i, v, v, v); }
    }
  }
  return { width: w, height: h, rgba, perPixel: per };
}

function digram(bytes) {
  const counts = new Uint32Array(65536);
  let max = 0;
  for (let i = 0; i + 1 < bytes.length; i += 1) { const k = (bytes[i] << 8) | bytes[i + 1]; counts[k] += 1; if (counts[k] > max) max = counts[k]; }
  const rgba = new Uint8ClampedArray(65536 * 4);
  const scale = max > 0 ? 255 / Math.log1p(max) : 0;
  for (let k = 0; k < 65536; k += 1) {
    const v = counts[k] ? Math.max(40, Math.round(Math.log1p(counts[k]) * scale)) : 0;
    const o = k * 4;
    // row = first byte, column = second byte; a warm tint so empty cells stay black
    rgba[o] = v; rgba[o + 1] = Math.round(v * 0.75); rgba[o + 2] = Math.round(v * 0.35); rgba[o + 3] = 255;
  }
  return { width: 256, height: 256, rgba, perPixel: 0, counts, max };
}

function entropyMap(bytes, width, block) {
  const blocks = Math.ceil(bytes.length / block);
  const h = Math.max(1, Math.ceil(blocks / width));
  const rgba = new Uint8ClampedArray(width * h * 4);
  const values = new Float64Array(blocks);
  const freq = new Uint32Array(256);
  for (let bI = 0; bI < blocks; bI += 1) {
    freq.fill(0);
    const start = bI * block;
    const end = Math.min(bytes.length, start + block);
    for (let i = start; i < end; i += 1) freq[bytes[i]] += 1;
    let e = 0;
    const n = end - start;
    for (const f of freq) if (f) { const p = f / n; e -= p * Math.log2(p); }
    values[bI] = e;
    const v = Math.round((e / 8) * 255);
    const o = bI * 4;
    // low entropy blue-black, high entropy red-white (compressed or encrypted)
    rgba[o] = v; rgba[o + 1] = Math.round(v * v / 255); rgba[o + 2] = 255 - v > 128 ? 90 : Math.round(v / 3); rgba[o + 3] = 255;
  }
  return { width, height: h, rgba, perPixel: 0, block, values };
}

/** The byte offset (from the start of the range) a pixel stands for, or null outside the data. */
export function pixelOffset(mode, width, x, y, length, { block = 256 } = {}) {
  if (mode === 'digram') return null;
  const i = y * width + x;
  if (mode === 'entropy') { const o = i * block; return o < length ? o : null; }
  const per = bytesPerPixel(mode);
  const o = Math.floor(i * per);
  return o < length ? o : null;
}
