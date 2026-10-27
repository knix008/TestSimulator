// BMP codec: reads 1/4/8-bit palette (also RLE4/RLE8), 16/24/32-bit
// (bit fields), OS/2 and Windows V3..V5 headers, top-down or bottom-up.
// Writes 1-bit (logical), 8-bit indexed/grayscale and 24-bit RGB.
import { cerr, makeRaster, le16, le32, Out } from './common.js';

const s32 = (b, o) => le32(b, o) | 0;

function maskInfo(m) {
  if (!m) return { shift: 0, bits: 0, max: 0 };
  let shift = 0; while (!((m >>> shift) & 1)) shift++;
  let bits = 0; while ((m >>> (shift + bits)) & 1) bits++;
  return { shift, bits, max: (2 ** bits) - 1 };
}

export function bmpInfo(b) {
  if (b[0] !== 0x42 || b[1] !== 0x4d) throw cerr('bmp', 'missing BM signature');
  const hs = le32(b, 14);
  if (hs === 12) return { headerSize: hs, width: le16(b, 18), height: le16(b, 20), bpp: le16(b, 24), compression: 0, colorsUsed: 0, topDown: false, version: 'OS/2 1.x' };
  const h = s32(b, 22);
  return {
    headerSize: hs, width: s32(b, 18), height: Math.abs(h), topDown: h < 0, bpp: le16(b, 28), compression: le32(b, 30),
    colorsUsed: le32(b, 46), xppm: s32(b, 38), yppm: s32(b, 42),
    version: hs >= 124 ? 'Version 5 (Microsoft Windows 2000 / XP)' : hs >= 108 ? 'Version 4 (Microsoft Windows 95)' : 'Version 3 (Microsoft Windows 3.x)',
  };
}

export function decodeBmp(b) {
  const info = bmpInfo(b);
  const { width, height, bpp, compression, headerSize: hs } = info;
  const dataOff = le32(b, 10);
  if (width <= 0 || height <= 0) throw cerr('bmp', 'bad image size');
  const palEntry = hs === 12 ? 3 : 4;
  let palette = null;
  if (bpp <= 8) {
    let n = info.colorsUsed || 1 << bpp;
    const pOff = 14 + hs;
    n = Math.min(n, Math.floor((dataOff - pOff) / palEntry));
    palette = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) { const o = pOff + i * palEntry; palette[3 * i] = b[o + 2]; palette[3 * i + 1] = b[o + 1]; palette[3 * i + 2] = b[o]; }
  }
  const rowY = (r) => (info.topDown ? r : height - 1 - r); // file row r → image row
  if (bpp <= 8) {
    const out = makeRaster(width, height, 1, 8, { indexed: true, palette });
    if (compression === 1 || compression === 2) {
      // RLE8 / RLE4: rows are bottom-up
      let p = dataOff, x = 0, r = 0;
      const set = (v) => { if (x < width && r < height) out.data[rowY(r) * width + x] = v; x++; };
      while (p < b.length && r < height) {
        const n = b[p++], c = b[p++];
        if (n > 0) {
          for (let i = 0; i < n; i++) set(compression === 1 ? c : i & 1 ? c & 15 : c >> 4);
        } else if (c === 0) { x = 0; r++; } else if (c === 1) break;
        else if (c === 2) { x += b[p++]; r += b[p++]; } else {
          if (compression === 1) { for (let i = 0; i < c; i++) set(b[p + i]); p += c + (c & 1); } else {
            for (let i = 0; i < c; i++) set(i & 1 ? b[p + (i >> 1)] & 15 : b[p + (i >> 1)] >> 4);
            const nb = (c + 1) >> 1; p += nb + (nb & 1);
          }
        }
      }
      return out;
    }
    const stride = Math.ceil((bpp * width) / 32) * 4;
    for (let r = 0; r < height; r++) {
      const ro = dataOff + r * stride, y = rowY(r);
      for (let x = 0; x < width; x++) {
        const bit = x * bpp;
        const v = (b[ro + (bit >> 3)] >> (8 - bpp - (bit & 7))) & ((1 << bpp) - 1);
        out.data[y * width + x] = v;
      }
    }
    return out;
  }
  let masks;
  if ((compression === 3 || compression === 6) && hs >= 40) {
    masks = [le32(b, 54), le32(b, 58), le32(b, 62), hs >= 56 || compression === 6 ? le32(b, 66) : 0];
  } else if (bpp === 16) masks = [0x7c00, 0x3e0, 0x1f, 0];
  else if (bpp === 32) masks = [0xff0000, 0xff00, 0xff, hs >= 56 ? le32(b, 66) : 0];
  else masks = null;
  const stride = Math.ceil((bpp * width) / 32) * 4;
  if (bpp === 24) {
    const out = makeRaster(width, height, 3, 8);
    for (let r = 0; r < height; r++) {
      const ro = dataOff + r * stride, y = rowY(r);
      for (let x = 0; x < width; x++) { const o = (y * width + x) * 3, q = ro + x * 3; out.data[o] = b[q + 2]; out.data[o + 1] = b[q + 1]; out.data[o + 2] = b[q]; }
    }
    return out;
  }
  if (bpp !== 16 && bpp !== 32) throw cerr('bmp', `${bpp} bits per pixel is not supported`);
  const mi = masks.map(maskInfo);
  // alpha only when the mask exists and some pixel is not fully transparent
  let useAlpha = mi[3].bits > 0;
  const out = makeRaster(width, height, useAlpha ? 4 : 3, 8);
  let anyAlpha = false;
  for (let r = 0; r < height; r++) {
    const ro = dataOff + r * stride, y = rowY(r);
    for (let x = 0; x < width; x++) {
      const v = bpp === 16 ? le16(b, ro + x * 2) : le32(b, ro + x * 4);
      const o = (y * width + x) * out.channels;
      for (let k = 0; k < out.channels; k++) {
        const m = mi[k];
        out.data[o + k] = m.bits ? Math.round((((v & masks[k]) >>> m.shift) * 255) / m.max) : 0;
      }
      if (useAlpha && out.data[o + 3] !== 0) anyAlpha = true;
    }
  }
  if (useAlpha && !anyAlpha) {
    // alpha mask present but all zero: treat as opaque RGB
    const rgb = makeRaster(width, height, 3, 8);
    for (let i = 0; i < width * height; i++) for (let k = 0; k < 3; k++) rgb.data[i * 3 + k] = out.data[i * 4 + k];
    return rgb;
  }
  return out;
}

/**
 * Encodes a BMP. img: { width, height, channels (1 or 3), bitDepth (1 or 8), data, palette? }.
 * Grayscale 8-bit images get a gray palette; 1-bit images a black/white palette.
 */
export function encodeBmp(img) {
  const { width, height, data } = img;
  let bpp, palette = null;
  if (img.bitDepth === 1) { bpp = 1; palette = img.palette || Uint8Array.from([0, 0, 0, 255, 255, 255]); } else if (img.palette) {
    bpp = img.palette.length / 3 <= 2 ? 1 : img.palette.length / 3 <= 16 ? 4 : 8;
    if (img.palette.length / 3 > 256) throw cerr('bmp', 'colormaps larger than 256 entries cannot be written');
    palette = img.palette;
  } else if (img.channels === 1) { bpp = 8; palette = new Uint8Array(768); for (let i = 0; i < 256; i++) palette[3 * i] = palette[3 * i + 1] = palette[3 * i + 2] = i; } else bpp = 24;
  const nPal = palette ? palette.length / 3 : 0;
  const stride = Math.ceil((bpp * width) / 32) * 4;
  const dataOff = 54 + nPal * 4;
  const size = dataOff + stride * height;
  const o = new Out(size);
  o.ascii('BM'); o.le32(size); o.le32(0); o.le32(dataOff);
  o.le32(40); o.le32(width); o.le32(height); o.le16(1); o.le16(bpp); o.le32(0); o.le32(stride * height);
  o.le32(2835); o.le32(2835); o.le32(nPal); o.le32(0);
  for (let i = 0; i < nPal; i++) { o.u8(palette[3 * i + 2]); o.u8(palette[3 * i + 1]); o.u8(palette[3 * i]); o.u8(0); }
  const row = new Uint8Array(stride);
  for (let r = 0; r < height; r++) {
    const y = height - 1 - r;
    row.fill(0);
    if (bpp === 24) {
      for (let x = 0; x < width; x++) { const s = (y * width + x) * img.channels; row[x * 3] = data[s + 2]; row[x * 3 + 1] = data[s + 1]; row[x * 3 + 2] = data[s]; }
    } else {
      for (let x = 0; x < width; x++) {
        const v = data[y * width + x] & ((1 << bpp) - 1);
        const bit = x * bpp;
        row[bit >> 3] |= v << (8 - bpp - (bit & 7));
      }
    }
    o.bytes(row);
  }
  return o.result();
}
