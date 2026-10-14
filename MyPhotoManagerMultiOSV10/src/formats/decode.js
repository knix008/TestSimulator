// Decoding any supported image into an upright canvas / ImageBitmap.
// Runs in the page and in the thumbnail worker (SVG needs the page: <img>).
import UTIF from 'utif2';
import { context2d, makeCanvas, orientedCanvas, scaledCanvas } from './canvas.js';
import { isJpeg, jpegSize, readOrientation, stripExif } from './jpeg-meta.js';
import { decodePsd } from './psd.js';
import { extractRawPreview } from './raw.js';
import { extensionOf, kindOf, mimeOf } from './types.js';

let heifModule = null;
async function heif() {
  if (!heifModule) {
    const { default: factory } = await import('libheif-js/libheif-wasm/libheif-bundle.mjs');
    heifModule = await factory();
  }
  return heifModule;
}

const inWorker = typeof document === 'undefined';

/** ImageBitmap of encoded bytes the engine understands, optionally pre-scaled. */
async function bitmapOf(bytes, mime, resize) {
  const blob = new Blob([bytes], { type: mime });
  if (resize) {
    try {
      return await createImageBitmap(blob, { resizeWidth: resize.width, resizeHeight: resize.height, resizeQuality: 'high', imageOrientation: 'none' });
    } catch { /* engines without resize options */ }
  }
  try {
    return await createImageBitmap(blob, { imageOrientation: 'none' });
  } catch {
    return createImageBitmap(blob);
  }
}

/** Picture of a JPEG (or other native format) — EXIF orientation applied by us, the same on every engine. */
async function decodeNative(bytes, name, maxSize) {
  let orientation = 1;
  let data = bytes;
  let resize = null;
  if (isJpeg(bytes)) {
    orientation = readOrientation(bytes);
    data = stripExif(bytes);
    const size = jpegSize(bytes);
    if (size && maxSize && Math.max(size.width, size.height) > maxSize * 1.5) {
      const k = maxSize / Math.max(size.width, size.height);
      resize = { width: Math.max(1, Math.round(size.width * k)), height: Math.max(1, Math.round(size.height * k)) };
    }
  }
  const bitmap = await bitmapOf(data, mimeOf(name) === 'application/octet-stream' ? 'image/jpeg' : mimeOf(name), resize);
  return { source: orientation === 1 ? bitmap : orientedCanvas(bitmap, bitmap.width, bitmap.height, orientation), orientation, original: resize ? jpegSize(bytes) : null };
}

async function decodeSvg(bytes) {
  if (inWorker) throw new Error('SVG is decoded in the page');
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const w = image.naturalWidth || 1024;
    const h = image.naturalHeight || 1024;
    const k = Math.max(1, 1024 / Math.max(w, h));
    const canvas = makeCanvas(w * k, h * k);
    context2d(canvas).drawImage(image, 0, 0, canvas.width, canvas.height);
    return { source: canvas };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function decodeTiff(bytes, pageIndex = null) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const ifds = UTIF.decode(buffer);
  const pages = ifds.filter((ifd) => ifd.t256 && ifd.t257);
  if (!pages.length) throw new Error('no image in the TIFF file');
  // The largest page (some files keep a small preview first).
  const page = pageIndex != null ? pages[Math.min(Math.max(0, pageIndex), pages.length - 1)] : pages.reduce((a, b) => (b.t256[0] * b.t257[0] > a.t256[0] * a.t257[0] ? b : a));
  UTIF.decodeImage(buffer, page, ifds);
  const rgba = UTIF.toRGBA8(page);
  const width = page.width;
  const height = page.height;
  const canvas = makeCanvas(width, height);
  context2d(canvas).putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, width * height * 4), width, height), 0, 0);
  const orientation = page.t274?.[0] ?? 1;
  return { source: orientation === 1 ? canvas : orientedCanvas(canvas, width, height, orientation), orientation, pages: pages.length };
}

async function decodeHeif(bytes) {
  const lib = await heif();
  const decoder = new lib.HeifDecoder();
  const images = decoder.decode(bytes);
  if (!images?.length) throw new Error('no image in the HEIF file');
  const image = images.find((candidate) => candidate.is_primary?.()) ?? images[0];
  const width = image.get_width();
  const height = image.get_height();
  const target = { data: new Uint8ClampedArray(width * height * 4), width, height };
  const pixels = await new Promise((resolve, reject) => {
    image.display(target, (result) => (result ? resolve(result) : reject(new Error('HEIF decoding failed'))));
  });
  const canvas = makeCanvas(width, height);
  context2d(canvas).putImageData(new ImageData(pixels.data, width, height), 0, 0);
  for (const each of images) each.free?.();
  return { source: canvas };
}

function decodePsdFile(bytes) {
  const { width, height, data } = decodePsd(bytes);
  const canvas = makeCanvas(width, height);
  context2d(canvas).putImageData(new ImageData(data, width, height), 0, 0);
  return { source: canvas };
}

async function decodeRaw(bytes, name, maxSize) {
  const preview = extractRawPreview(bytes);
  if (!preview) {
    // No embedded JPEG (some DNGs, scientific cameras): develop the sensor data.
    const { developRaw } = await import('./rawdevelop.js');
    const developed = await developRaw(bytes, { half: Boolean(maxSize && maxSize <= 1024) });
    const { source } = developed;
    if (!maxSize || Math.max(source.width, source.height) <= maxSize) return { source, orientation: 1, developed: true };
    const k = maxSize / Math.max(source.width, source.height);
    const canvas = makeCanvas(Math.max(1, Math.round(source.width * k)), Math.max(1, Math.round(source.height * k)));
    context2d(canvas).drawImage(source, 0, 0, canvas.width, canvas.height);
    return { source: canvas, orientation: 1, developed: true };
  }
  const orientation = preview.applyOrientation ? preview.orientation : readOrientation(preview.jpeg);
  const result = await decodeNative(writeNoExif(preview.jpeg), 'preview.jpg', maxSize);
  const source = orientation === 1 ? result.source : orientedCanvas(result.source, result.source.width, result.source.height, orientation);
  return { source, orientation, preview: true };
}

const writeNoExif = (jpeg) => stripExif(jpeg);

function canvasOf({ width, height, data }) {
  const canvas = makeCanvas(width, height);
  context2d(canvas).putImageData(new ImageData(data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data), width, height), 0, 0);
  return canvas;
}

async function decodeExtraFile(bytes, name, maxSize) {
  const { decodeExtra } = await import('./extra.js');
  const decoded = decodeExtra(bytes, extensionOf(name));
  if (decoded.png) return decodeNative(decoded.png, 'icon.png', maxSize);
  return { source: canvasOf(decoded) };
}

/** First page of a PDF (pdf.js, in the page only). */
async function decodePdf(bytes, { page = 1, scale = 2 } = {}) {
  if (inWorker) throw new Error('PDF is decoded in the page');
  const { renderPdfPage } = await import('./pdf-view.js');
  return renderPdfPage(bytes, page, scale);
}

/**
 * Upright picture of a file: { source (canvas | ImageBitmap), width, height, kind }.
 * `maxSize` scales large pictures down (long side), e.g. for thumbnails.
 */
export async function decodeImage(input, name, { maxSize = 0, page = null } = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const kind = kindOf(name) ?? 'native';
  let result;
  switch (kind) {
    case 'tiff': result = decodeTiff(bytes, page); break;
    case 'heif': result = await decodeHeif(bytes); break;
    case 'psd': result = decodePsdFile(bytes); break;
    case 'raw': result = await decodeRaw(bytes, name, maxSize); break;
    case 'svg': result = await decodeSvg(bytes); break;
    case 'extra': result = await decodeExtraFile(bytes, name, maxSize); break;
    case 'jp2': result = { source: canvasOf(await (await import('./codecs.js')).decodeJpeg2000(bytes)) }; break;
    case 'jxl': result = { source: canvasOf(await (await import('./codecs.js')).decodeJxl(bytes)) }; break;
    case 'pdf': result = await decodePdf(bytes, { page: (page ?? 0) + 1 }); break;
    case 'dicom': {
      if (inWorker) throw new Error('DICOM is decoded in the page');
      result = await (await import('./dicom.js')).decodeDicom(bytes, page ?? 0);
      break;
    }
    case 'video': throw new Error('video');
    default: result = await decodeNative(bytes, name, maxSize);
  }
  let { source } = result;
  const fullWidth = source.width;
  const fullHeight = source.height;
  if (maxSize && Math.max(source.width, source.height) > maxSize) source = scaledCanvas(source, source.width, source.height, maxSize);
  return { ...result, source, width: source.width, height: source.height, fullWidth, fullHeight, kind };
}

/** Pixel size without decoding when the header tells (JPEG, PSD, …); else null. */
export function quickSize(bytes, name) {
  if (isJpeg(bytes)) {
    const size = jpegSize(bytes);
    if (!size) return null;
    return [5, 6, 7, 8].includes(readOrientation(bytes)) ? { width: size.height, height: size.width } : size;
  }
  return null;
}
