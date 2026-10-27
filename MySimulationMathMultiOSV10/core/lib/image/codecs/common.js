// Shared pieces of the image codecs.
//
// A decoded raster ("Raster") is a plain object:
//   { width, height, channels, bitDepth, data, palette, paletteAlpha, indexed, extra }
// data: Uint8Array (bitDepth <= 8) or Uint16Array (16), interleaved, row-major,
//       `channels` samples per pixel. For indexed images data holds palette
//       indices (channels = 1) and palette is a Uint8Array of RGB triples.
import { MError } from '../../../value.js';

export const cerr = (fmt, msg) => new MError(`io:${fmt}:corrupt`, `Invalid ${fmt.toUpperCase()} data: ${msg}`);

export function makeRaster(width, height, channels, bitDepth, extra = {}) {
  const n = width * height * channels;
  return { width, height, channels, bitDepth, data: bitDepth > 8 ? new Uint16Array(n) : new Uint8Array(n), palette: null, paletteAlpha: null, indexed: false, ...extra };
}

export const be16 = (b, o) => (b[o] << 8) | b[o + 1];
export const be32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
export const le16 = (b, o) => b[o] | (b[o + 1] << 8);
export const le32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** Detects a format from magic bytes: 'png' | 'jpg' | 'bmp' | 'gif' | 'tif' | null. */
export function sniff(b) {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8) return 'jpg';
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return 'bmp';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
  if (b.length >= 4 && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 42 && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 42))) return 'tif';
  return null;
}

/** Growable byte output. */
export class Out {
  constructor(cap = 4096) { this.buf = new Uint8Array(cap); this.len = 0; }
  ensure(n) { if (this.len + n > this.buf.length) { let c = this.buf.length * 2; while (c < this.len + n) c *= 2; const b = new Uint8Array(c); b.set(this.buf.subarray(0, this.len)); this.buf = b; } }
  u8(x) { this.ensure(1); this.buf[this.len++] = x & 255; }
  bytes(a) { this.ensure(a.length); this.buf.set(a, this.len); this.len += a.length; }
  be16(x) { this.u8(x >> 8); this.u8(x); }
  be32(x) { this.u8(x >>> 24); this.u8(x >>> 16); this.u8(x >>> 8); this.u8(x); }
  le16(x) { this.u8(x); this.u8(x >> 8); }
  le32(x) { this.u8(x); this.u8(x >>> 8); this.u8(x >>> 16); this.u8(x >>> 24); }
  ascii(s) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); }
  result() { return this.buf.slice(0, this.len); }
}
