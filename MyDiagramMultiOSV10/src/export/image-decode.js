// Pictures the web view cannot show itself (TIFF, HEIC/HEIF, JPEG XL, JPEG 2000, QOI, TGA,
// PCX, Netpbm) become PNG data URLs on the way into a drawing. Each decoder is large and
// rarely needed, so it is loaded the first time a file of its format arrives.
import { imageDecoderFor, nativeImageMime } from '../domain/image-formats.js';

const toBase64 = (bytes) => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
};

async function decodeTiff(bytes) {
  const { default: UTIF } = await import('utif');
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const ifds = UTIF.decode(buffer);
  const ifd = ifds.find((item) => item.t256 && item.t257) ?? ifds[0];
  if (!ifd) throw new Error('The TIFF file holds no image.');
  UTIF.decodeImage(buffer, ifd);
  return { width: ifd.width, height: ifd.height, rgba: UTIF.toRGBA8(ifd) };
}

async function decodeHeif(bytes) {
  const { default: libheif } = await import('libheif-js/wasm-bundle.js');
  const lib = typeof libheif === 'function' ? libheif() : libheif;
  const images = new lib.HeifDecoder().decode(bytes);
  if (!images?.length) throw new Error('The HEIF file holds no image.');
  // A phone's large photo is a grid of tiles: the primary item is the whole picture.
  const image = images.find((item) => { try { return item.is_primary(); } catch { return false; } }) ?? images[0];
  const width = image.get_width();
  const height = image.get_height();
  const rgba = new Uint8ClampedArray(width * height * 4);
  await new Promise((resolve, reject) => {
    image.display({ data: rgba, width, height }, (done) => (done ? resolve(done) : reject(new Error('The HEIF image could not be decoded.'))));
  });
  for (const item of images) { try { item.free(); } catch { /* already freed */ } }
  return { width, height, rgba };
}

async function decodeJxl(bytes) {
  const { default: decode } = await import('@jsquash/jxl/decode.js');
  const image = await decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  if (!image) throw new Error('The JPEG XL image could not be decoded.');
  return { width: image.width, height: image.height, rgba: image.data };
}

/** The raw code stream of a JPEG 2000 file: the jp2c box of a .jp2, or the file itself. */
function j2kCodestream(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0x4f) return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 0; at + 8 <= bytes.length;) {
    let length = view.getUint32(at);
    let head = 8;
    if (length === 1) { length = Number(view.getBigUint64(at + 8)); head = 16; }
    if (length === 0) length = bytes.length - at;
    if (String.fromCharCode(...bytes.subarray(at + 4, at + 8)) === 'jp2c') return bytes.subarray(at + head, at + length);
    if (length < 8) break;
    at += length;
  }
  throw new Error('The JPEG 2000 file holds no image.');
}

async function decodeJ2k(bytes) {
  const { default: factory } = await import('@cornerstonejs/codec-openjpeg/decode');
  const module = await factory();
  const stream = j2kCodestream(bytes);
  const decoder = new module.J2KDecoder();
  try {
    decoder.getEncodedBuffer(stream.length).set(stream);
    decoder.decode();
    const { width, height, componentCount: spp, bitsPerSample: bits } = decoder.getFrameInfo();
    const out = decoder.getDecodedBuffer();
    const shift = Math.max(0, bits - 8);
    const samples = bits > 8 ? new Uint16Array(out.buffer, out.byteOffset, out.byteLength >> 1) : out;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let p = 0; p < width * height; p += 1) {
      const o = p * 4;
      const first = samples[p * spp] >> shift;
      rgba[o] = first;
      rgba[o + 1] = spp >= 3 ? samples[p * spp + 1] >> shift : first;
      rgba[o + 2] = spp >= 3 ? samples[p * spp + 2] >> shift : first;
      rgba[o + 3] = spp > 3 ? samples[p * spp + 3] >> shift : 255;
    }
    return { width, height, rgba };
  } finally {
    decoder.delete?.();
  }
}

async function decodeSimple(bytes, family) {
  const { default: extra } = await import('./extra-formats.js');
  return extra.decode(bytes, family);
}

const DECODERS = { tiff: decodeTiff, heif: decodeHeif, jxl: decodeJxl, j2k: decodeJ2k, qoi: decodeSimple, tga: decodeSimple, pcx: decodeSimple, netpbm: decodeSimple };

function pngDataUrl({ width, height, rgba }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const pixels = rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  canvas.getContext('2d').putImageData(new ImageData(pixels.subarray(0, width * height * 4), width, height), 0, 0);
  return canvas.toDataURL('image/png');
}

/** The data URL a picture file goes into the drawing as. */
export async function pictureDataUrl(name, bytes, mime = '') {
  const family = imageDecoderFor(name, bytes);
  if (family) return pngDataUrl(await DECODERS[family](bytes, family));
  return `data:${nativeImageMime(name) ?? (mime || 'image/png')};base64,${toBase64(bytes)}`;
}

/** Bytes of a base64 string (the desktop side reads files as base64). */
export function bytesFromBase64(text) {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
