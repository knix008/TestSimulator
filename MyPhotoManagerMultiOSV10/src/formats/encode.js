// Writing images: JPEG / PNG / WebP through the canvas encoder, BMP and TIFF
// with our own writers. JPEG keeps the original's EXIF / XMP / IPTC / ICC.
import UTIF from 'utif2';
import { canvasToBlob, context2d } from './canvas.js';
import { insertSegments, isJpeg, metadataSegments, patchExifAfterEdit, writeOrientation } from './jpeg-meta.js';
import { OUTPUT_FORMATS } from './types.js';
import { encodeDds, encodeDicom, encodeHdr, encodeIco, encodePcx, encodePpm, encodeQoi, encodeRas, encodeSgi, encodeTga, encodeXbm } from './writers.js';

const PIXEL_WRITERS = { tga: encodeTga, qoi: encodeQoi, ppm: encodePpm, pcx: encodePcx, sgi: encodeSgi, ras: encodeRas, dds: encodeDds, hdr: encodeHdr, xbm: encodeXbm, dicom: encodeDicom };

/** 24-bit BMP from RGBA pixels (bottom-up rows). */
export function encodeBmp({ width, height, data }) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const out = new Uint8Array(54 + rowSize * height);
  const view = new DataView(out.buffer);
  out[0] = 0x42; out[1] = 0x4d;
  view.setUint32(2, out.length, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, rowSize * height, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      const t = 54 + (height - 1 - y) * rowSize + x * 3;
      out[t] = data[s + 2]; out[t + 1] = data[s + 1]; out[t + 2] = data[s];
    }
  }
  return out;
}

export function encodeTiff({ width, height, data }) {
  return new Uint8Array(UTIF.encodeImage(data, width, height));
}

/**
 * Encodes a canvas: `format` is an OUTPUT_FORMATS id. `original` (bytes of the
 * file the picture came from) passes its JPEG metadata on, with orientation 1
 * because the pixels are already upright.
 */
export async function encodeCanvas(canvas, format, { quality = 0.92, original = null } = {}) {
  const spec = OUTPUT_FORMATS.find((f) => f.id === format) ?? OUTPUT_FORMATS[0];
  const pixels = () => context2d(canvas, { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
  if (spec.id === 'bmp') return encodeBmp(pixels());
  if (spec.id === 'tiff') return encodeTiff(pixels());
  if (PIXEL_WRITERS[spec.id]) return PIXEL_WRITERS[spec.id](pixels());
  if (spec.id === 'gif') { const { encodeGif } = await import('../create/gif.js'); return encodeGif([{ image: pixels() }], { loop: null, dither: true }); }
  if (spec.id === 'psd') { const { encodePsd } = await import('./psd.js'); const p = pixels(); return encodePsd({ width: p.width, height: p.height, data: new Uint8Array(p.data.buffer) }); }
  if (spec.id === 'jp2') { const { encodeJpeg2000 } = await import('./codecs.js'); return encodeJpeg2000(pixels()); }
  if (spec.id === 'jxl') { const { encodeJxl } = await import('./codecs.js'); return encodeJxl(pixels(), { quality: Math.round(quality * 100) }); }
  if (spec.id === 'ico') {
    // Icons are at most 256 × 256: the picture is scaled to fit, stored as PNG.
    const k = Math.min(1, 256 / Math.max(canvas.width, canvas.height));
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.round(canvas.width * k));
    small.height = Math.max(1, Math.round(canvas.height * k));
    small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
    const png = new Uint8Array(await (await canvasToBlob(small, 'image/png')).arrayBuffer());
    return encodeIco(png, small.width, small.height);
  }
  if (spec.id === 'pdf') {
    // One page the size of the picture (72 dpi points), the picture as JPEG.
    const { buildPdf } = await import('../create/pdf.js');
    const jpeg = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', quality)).arrayBuffer());
    return buildPdf([{ jpeg, width: canvas.width, height: canvas.height, pageWidth: canvas.width * 0.75, pageHeight: canvas.height * 0.75, fit: 'fill' }]);
  }
  const blob = await canvasToBlob(canvas, spec.mime, spec.quality ? quality : undefined);
  let bytes = new Uint8Array(await blob.arrayBuffer());
  if (spec.id === 'jpeg' && original && isJpeg(original)) {
    const keep = metadataSegments(original);
    if (keep.length) {
      bytes = insertSegments(bytes, keep);
      bytes = writeOrientation(bytes, 1);
      bytes = patchExifAfterEdit(bytes, canvas.width, canvas.height);
    }
  }
  return bytes;
}
