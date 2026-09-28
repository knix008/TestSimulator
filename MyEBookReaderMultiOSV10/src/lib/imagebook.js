// A picture, presented as a book.
//
// JPEG, PNG, GIF, WebP, BMP, AVIF and SVG the browser decodes itself, so they
// become a page directly. TIFF and DICOM it cannot, so those are decoded here
// (tiff.js, dicom.js) and painted onto a canvas. HEIF/HEIC is offered to the
// browser as well — Chromium decodes it on some platforms and not others — and
// says so plainly when it cannot.
//
// One file is one page. A folder of pictures is what the comic reader (.cbz)
// is for.
import { decodeTiff, looksLikeTiff } from './tiff.js';
import { decodeDicom, looksLikeDicom } from './dicom.js';

export const IMAGE_EXTENSIONS = [
  'jpg', 'jpeg', 'jpe', 'png', 'gif', 'webp', 'bmp', 'avif', 'svg',
  'tif', 'tiff', 'heic', 'heif', 'dcm', 'dicom', 'ico',
];

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif',
  svg: 'image/svg+xml', ico: 'image/x-icon', heic: 'image/heic', heif: 'image/heif',
  tif: 'image/tiff', tiff: 'image/tiff', dcm: 'application/dicom', dicom: 'application/dicom',
};

/** Formats the browser decodes on its own. */
const NATIVE = new Set(['jpg', 'jpeg', 'jpe', 'png', 'gif', 'webp', 'bmp', 'avif', 'svg', 'ico', 'heic', 'heif']);

export function imageExtension(name) {
  const match = /\.([A-Za-z0-9]+)$/.exec(String(name || ''));
  return match ? match[1].toLowerCase() : '';
}

export function isImageName(name) {
  return IMAGE_EXTENSIONS.includes(imageExtension(name));
}

/** Recognises a picture from its first bytes, whatever it is called. */
export function looksLikeImage(data, name = '') {
  if (isImageName(name)) return true;
  if (!data || data.length < 12) return false;
  const b = data;
  if (b[0] === 0xff && b[1] === 0xd8) return true;                                   // JPEG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true; // PNG
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return true;                  // GIF
  if (b[0] === 0x42 && b[1] === 0x4d) return true;                                   // BMP
  if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return true; // WEBP
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (['avif', 'avis', 'heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(brand)) return true;
  }
  if (looksLikeTiff(data)) return true;
  if (looksLikeDicom(data, name)) return true;
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

/**
 * Opens a picture as a one-page book.
 * @param {Uint8Array} data
 * @param {object} options `name` — the file name, which decides the decoder
 */
export function openImageBook(data, { name = '' } = {}) {
  const ext = imageExtension(name);
  const isDicom = looksLikeDicom(data, name);
  const isTiff = !isDicom && looksLikeTiff(data);

  let label = (MIME[ext] || 'image').replace(/^image\//, '').toUpperCase();
  if (isDicom) label = 'DICOM';
  else if (isTiff) label = 'TIFF';

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

    if (isDicom) {
      const image = decodeDicom(data);
      Object.assign(meta, {
        patient: image.meta.patient,
        study: image.meta.study,
        series: image.meta.series,
        modality: image.meta.modality,
        date: image.meta.date,
        publisher: image.meta.manufacturer,
        subject: image.meta.institution,
      });
      if (image.kind === 'jpeg') {
        decoded = { bytes: image.bytes, mime: 'image/jpeg' };
        pixelInfo = { width: image.meta.width, height: image.meta.height };
      } else {
        decoded = { dataUrl: rgbaToDataUrl(image), mime: 'image/png' };
        pixelInfo = { width: image.width, height: image.height };
      }
      return decoded;
    }

    if (isTiff) {
      const image = decodeTiff(data);
      decoded = { dataUrl: rgbaToDataUrl(image), mime: 'image/png' };
      pixelInfo = { width: image.width, height: image.height };
      return decoded;
    }

    if (!NATIVE.has(ext) && !looksLikeImage(data, name)) {
      throw new Error(`"${name}" is not a picture this reader can show.`);
    }
    decoded = { bytes: data, mime: imageMime(name) };
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
      if (value.bytes) return { bytes: value.bytes, mime: value.mime };
      // A decoded picture is already a data URL; hand back its bytes so the
      // caller can make a blob of it like any other resource.
      const base64 = value.dataUrl.split(',')[1] || '';
      const binary = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('latin1');
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return { bytes, mime: value.mime };
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
