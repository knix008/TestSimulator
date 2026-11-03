// A picture, presented as a book.
//
// JPEG, PNG, GIF, WebP, BMP, AVIF, SVG and ICO/CUR the browser decodes itself,
// so they become a page directly. TIFF it cannot, so it is decoded here
// (tiff.js) and painted onto a canvas; so are the less common formats in
// imageformats.js (TGA, PNM, PCX, QOI, HDR, DDS, PSD, SGI, …). Camera RAW files
// show their embedded JPEG preview. HEIF/HEIC is offered to the browser as
// well — Chromium decodes it on some platforms and not others — and says so
// plainly when it cannot.
//
// pictureResource() is the one place that turns any of these into bytes an
// <img> can show; the comic and folder readers can use it for their pages too.
//
// One file is one page. A folder of pictures is what the comic reader (.cbz)
// is for.
import { decodeTiff, looksLikeTiff } from './tiff.js';
import {
  EXTRA_IMAGE_EXTENSIONS, RAW_IMAGE_EXTENSIONS, decodeExtraImage, sniffExtraImage, rawPreviewJpeg,
} from './imageformats.js';

const NATIVE_EXTENSIONS = [
  'jpg', 'jpeg', 'jpe', 'jfif', 'pjpeg', 'pjp', 'png', 'apng', 'gif', 'webp', 'bmp', 'dib',
  'avif', 'svg', 'ico', 'cur', 'heic', 'heif',
];

export const IMAGE_EXTENSIONS = [
  ...NATIVE_EXTENSIONS,
  'tif', 'tiff',
  ...EXTRA_IMAGE_EXTENSIONS,
  ...RAW_IMAGE_EXTENSIONS,
];

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', jfif: 'image/jpeg', pjpeg: 'image/jpeg',
  pjp: 'image/jpeg', png: 'image/png', apng: 'image/apng', gif: 'image/gif', webp: 'image/webp',
  bmp: 'image/bmp', dib: 'image/bmp', avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon',
  cur: 'image/x-icon', heic: 'image/heic', heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff',
};

/** Formats the browser decodes on its own. */
const NATIVE = new Set(NATIVE_EXTENSIONS);
const EXTRA = new Set(EXTRA_IMAGE_EXTENSIONS);
const RAW = new Set(RAW_IMAGE_EXTENSIONS);

export function imageExtension(name) {
  const match = /\.([A-Za-z0-9]+)$/.exec(String(name || ''));
  return match ? match[1].toLowerCase() : '';
}

export function isImageName(name) {
  return IMAGE_EXTENSIONS.includes(imageExtension(name));
}

/** The MIME type of a browser-native picture, from its first bytes, or ''. */
function nativeMimeOf(b) {
  if (!b || b.length < 12) return '';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
  }
  return '';
}

/** Recognises a picture from its first bytes, whatever it is called. */
export function looksLikeImage(data, name = '') {
  if (isImageName(name)) return true;
  if (!data || data.length < 12) return false;
  if (nativeMimeOf(data)) return true;
  if (looksLikeTiff(data)) return true;
  if (sniffExtraImage(data)) return true;
  return false;
}

export function imageMime(name) {
  return MIME[imageExtension(name)] || 'application/octet-stream';
}

/** RGBA pixels → a PNG data URL, through a canvas. */
function rgbaToDataUrl({ width, height, data }) {
  if (typeof document === 'undefined') {
    throw new Error('Images can only be decoded where a canvas is available.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser did not provide a 2D canvas, so the picture cannot be shown.');
  const image = ctx.createImageData(width, height);
  image.data.set(data);
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

function dataUrlBytes(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || '';
  const binary = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('latin1');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Decoded RGBA → a PNG resource, keeping the pixel size alongside. */
function pngResource(image, kind) {
  return {
    bytes: dataUrlBytes(rgbaToDataUrl(image)),
    mime: 'image/png',
    width: image.width,
    height: image.height,
    kind,
  };
}

/**
 * Works out how a picture is to be shown, without decoding it.
 * @returns {{route:'native'|'tiff'|'extra'|'raw'|'', kind:string, mime:string}}
 */
function classify(bytes, name) {
  const ext = imageExtension(name);
  if (RAW.has(ext)) return { route: 'raw', kind: ext, mime: 'image/jpeg' };
  if (looksLikeTiff(bytes)) return { route: 'tiff', kind: 'tiff', mime: 'image/tiff' };
  const sniffed = sniffExtraImage(bytes);
  if (sniffed) return { route: 'extra', kind: sniffed, mime: 'image/png' };
  const magic = nativeMimeOf(bytes);
  if (magic) return { route: 'native', kind: ext, mime: NATIVE.has(ext) ? MIME[ext] : magic };
  if (EXTRA.has(ext)) return { route: 'extra', kind: ext, mime: 'image/png' };
  if (NATIVE.has(ext)) return { route: 'native', kind: ext, mime: MIME[ext] };
  if (ext === 'tif' || ext === 'tiff') return { route: 'tiff', kind: 'tiff', mime: 'image/tiff' };
  return { route: '', kind: ext, mime: '' };
}

/**
 * Turns any supported picture into something an <img> can show.
 *
 * Browser-native pictures come back unchanged; TIFF and the formats in
 * imageformats.js are decoded and re-encoded as PNG (this needs a canvas, so a
 * DOM); camera RAW files give their embedded JPEG preview. The bytes decide
 * first, the name only breaks ties.
 *
 * @param {Uint8Array} bytes
 * @param {string} name file name (its extension is the hint)
 * @returns {{bytes:Uint8Array, mime:string, width?:number, height?:number, kind?:string}}
 *   width/height are present when the picture was decoded here
 */
export function pictureResource(bytes, name = '') {
  const { route, kind, mime } = classify(bytes, name);
  switch (route) {
    case 'raw': {
      const jpeg = rawPreviewJpeg(bytes);
      if (jpeg) return { bytes: jpeg, mime: 'image/jpeg', kind };
      // No JPEG inside: a DNG may still carry a plain TIFF preview.
      if (looksLikeTiff(bytes)) return pngResource(decodeTiff(bytes), kind);
      throw new Error(`"${name}" has no embedded preview this reader can show.`);
    }
    case 'tiff':
      return pngResource(decodeTiff(bytes), 'tiff');
    case 'extra':
      return pngResource(decodeExtraImage(bytes, kind), kind);
    case 'native':
      return { bytes, mime, kind };
    default:
      throw new Error(`"${name}" is not a picture this reader can show.`);
  }
}

/**
 * Opens a picture as a one-page book.
 * @param {Uint8Array} data
 * @param {object} options `name` — the file name, which decides the decoder
 */
export function openImageBook(data, { name = '' } = {}) {
  const ext = imageExtension(name);
  const { route, kind } = classify(data, name);

  let label = (MIME[ext] || 'image').replace(/^image\//, '').toUpperCase();
  if (route === 'tiff') label = 'TIFF';
  else if (route === 'extra' || route === 'raw') label = String(kind || ext || 'image').toUpperCase();

  const meta = {
    title: String(name || '').replace(/\.[^.]+$/, '') || label,
    author: '',
    format: label,
    pages: 1,
  };

  let decoded = null;          // filled in on first use
  let pixelInfo = null;

  const decode = () => {
    if (decoded) return decoded;
    decoded = pictureResource(data, name);
    if (decoded.width && decoded.height) pixelInfo = { width: decoded.width, height: decoded.height };
    return decoded;
  };

  return {
    format: 'image',
    meta,
    sections: [{ index: 0, id: 'image-0', href: name || 'image', kind: 'image', label: '1' }],
    toc: [{ label: meta.title || '1', section: 0, anchor: '', children: [] }],
    coverPath: 'image:0',
    resource(path) {
      if (String(path || '') !== 'image:0') return null;
      const value = decode();
      return { bytes: value.bytes, mime: value.mime };
    },
    loadSection(index, { resolveSrc } = {}) {
      if (index !== 0) throw new Error('A picture has only one page.');
      const src = resolveSrc ? resolveSrc('image:0') : 'image:0';
      if (pixelInfo) Object.assign(meta, { pixels: `${pixelInfo.width} × ${pixelInfo.height}` });
      return {
        kind: 'image',
        index: 0,
        href: name || 'image',
        src,
        html: '',
        headings: [],
        title: meta.title,
        text: '',
      };
    },
    sectionText() { return ''; },
    /** What the properties panel shows about the picture. */
    imageInfo() {
      decode();
      return pixelInfo;
    },
  };
}
