// Plan pictures the browser cannot decode by itself: TIFF (scanner and fax files, several pages,
// 1-bit / grey / colour, uncompressed, PackBits, LZW, Deflate, CCITT G3 / G4, JPEG — read with UTIF.js,
// MIT) and TGA (all Truevision kinds, run-length or not). Both give RGBA pixels the caller turns into
// a PNG underlay (and plan-image.js reads for walls). AVIF and HEIC are left to the platform: AVIF
// decodes in every WebView the app runs in, HEIC only where the system has the codec (macOS);
// elsewhere the caller explains how to convert it. Pure (no DOM), works in Node.
import UTIF from 'utif';

export const isTiffName = (name) => /\.tiff?$/i.test(name ?? '');
export const isTgaName = (name) => /\.tga$/i.test(name ?? '');
export const isHeicName = (name) => /\.(heic|heif)$/i.test(name ?? '');
export const isAvifName = (name) => /\.avif$/i.test(name ?? '');
/** Pictures decoded here instead of by the browser. */
export const needsRasterDecode = (name) => isTiffName(name) || isTgaName(name);

const u8 = (bytes) => (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
const bufferOf = (bytes) => { const b = u8(bytes); return b.byteOffset === 0 && b.byteLength === b.buffer.byteLength ? b.buffer : b.slice().buffer; };

/** The pages of a TIFF: [{ index, width, height, bits }] (thumbnails and masks left out). */
export function tiffPages(bytes) {
  const ifds = UTIF.decode(bufferOf(bytes));
  return ifds.map((ifd, index) => ({ index, width: ifd.t256?.[0] ?? 0, height: ifd.t257?.[0] ?? 0, bits: ifd.t258?.[0] ?? 1, subfile: ifd.t254?.[0] ?? 0 }))
    .filter((p) => p.width > 0 && p.height > 0 && !(p.subfile & 1)); // NewSubfileType bit 0: a reduced copy
}

/** One TIFF page → { width, height, data: Uint8ClampedArray RGBA, pages }. */
export function decodeTiff(bytes, page = 0) {
  const buffer = bufferOf(bytes);
  const ifds = UTIF.decode(buffer);
  const pages = ifds.filter((ifd) => ifd.t256 && ifd.t257 && !((ifd.t254?.[0] ?? 0) & 1));
  const ifd = pages[Math.max(0, Math.min(pages.length - 1, page))];
  if (!ifd) throw Object.assign(new Error('No picture in this TIFF file'), { code: 'raster-invalid' });
  UTIF.decodeImage(buffer, ifd, ifds);
  const rgba = UTIF.toRGBA8(ifd);
  return { width: ifd.width, height: ifd.height, data: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), pages: pages.length };
}

/** A TGA → { width, height, data: Uint8ClampedArray RGBA }. Colour-mapped, true-colour and grey, plain or run-length. */
export function decodeTga(bytes) {
  const b = u8(bytes);
  if (b.length < 18) throw Object.assign(new Error('Not a TGA file'), { code: 'raster-invalid' });
  const idLength = b[0]; const mapType = b[1]; const type = b[2];
  const mapStart = b[3] | (b[4] << 8); const mapLength = b[5] | (b[6] << 8); const mapBits = b[7];
  const width = b[12] | (b[13] << 8); const height = b[14] | (b[15] << 8); const bits = b[16]; const desc = b[17];
  const kind = type & 7; const rle = type & 8;
  if (![1, 2, 3].includes(kind) || !width || !height || ![8, 15, 16, 24, 32].includes(bits)) throw Object.assign(new Error(`Unsupported TGA (type ${type}, ${bits} bits)`), { code: 'raster-invalid' });
  let at = 18 + idLength;
  // Colour map
  const mapBytes = Math.ceil(mapBits / 8);
  const palette = [];
  if (mapType === 1) { for (let i = 0; i < mapLength; i++) { palette.push(pixel(b, at, mapBits)); at += mapBytes; } }
  const px = Math.ceil(bits / 8);
  const count = width * height;
  const raw = new Uint8Array(count * px);
  if (rle) {
    let i = 0;
    while (i < raw.length && at < b.length) {
      const head = b[at++]; const n = (head & 0x7f) + 1;
      if (head & 0x80) { for (let k = 0; k < n; k++) { raw.set(b.subarray(at, at + px), i); i += px; } at += px; }
      else { raw.set(b.subarray(at, at + n * px), i); i += n * px; at += n * px; }
    }
  } else raw.set(b.subarray(at, at + raw.length));
  const out = new Uint8ClampedArray(count * 4);
  const topDown = Boolean(desc & 0x20); const rightToLeft = Boolean(desc & 0x10);
  const alphaBits = desc & 0x0f;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * px;
      let rgba;
      if (kind === 1) rgba = palette[(px === 2 ? raw[src] | (raw[src + 1] << 8) : raw[src]) - mapStart] ?? [0, 0, 0, 255];
      else if (kind === 3) rgba = [raw[src], raw[src], raw[src], px === 2 ? raw[src + 1] : 255];
      else rgba = pixel(raw, src, bits);
      if (bits === 32 && !alphaBits) rgba[3] = 255;
      const ty = topDown ? y : height - 1 - y; const tx = rightToLeft ? width - 1 - x : x;
      out.set(rgba, (ty * width + tx) * 4);
    }
  }
  return { width, height, data: out };
}

/** A true-colour TGA pixel (little-endian BGR(A) or 5-5-5) → [r, g, b, a]. */
function pixel(b, at, bits) {
  if (bits === 15 || bits === 16) {
    const v = b[at] | (b[at + 1] << 8);
    return [((v >> 10) & 31) * 255 / 31, ((v >> 5) & 31) * 255 / 31, (v & 31) * 255 / 31, bits === 16 && !(v & 0x8000) ? 255 : 255].map(Math.round);
  }
  if (bits === 8) return [b[at], b[at], b[at], 255];
  return [b[at + 2], b[at + 1], b[at], bits === 32 ? b[at + 3] : 255];
}

/** Decodes a TIFF (page) or TGA → { width, height, data, pages }. */
export function decodeRaster(name, bytes, { page = 0 } = {}) {
  if (isTiffName(name)) return decodeTiff(bytes, page);
  if (isTgaName(name)) return { ...decodeTga(bytes), pages: 1 };
  throw Object.assign(new Error(`Not a TIFF or TGA picture: ${name}`), { code: 'raster-invalid' });
}
