// Pictures in and out of the page: decoding a photo (file, bytes, URL, camera), rasters on
// canvases, and encoding (PNG / JPEG / WebP by the browser, BMP / TIFF by export/image-encode.js).
import { createRaster, fitSize } from '../engine/raster.js';
import { encodeBmp, encodeTiff } from '../export/image-encode.js';
import { DECODED_EXTENSIONS, decodeImage, encodeGif, encodePpm, encodeQoi, encodeTga, icoFromPng, sniff, svgFromPng } from '../export/codecs.js';
import { bytesToBase64, pdfFromJpegs } from '../export/files.js';

/** An <img> loaded from a URL (data:, blob: or a page-relative path). */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(Object.assign(new Error('photo.decodeFailed'), { code: 'photo.decodeFailed' }));
    img.src = url;
  });
}

/** A Blob as a data: URL. */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * A photo kept by the project: its pixels at most `max` px on the longer side, as JPEG data
 * (the picture the caricatures come from; large phone photos become a few hundred KB).
 */
export async function normalizePhoto(img, max = 2048) {
  const { width, height } = fitSize(img.naturalWidth || img.width, img.naturalHeight || img.height, max);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(img, 0, 0, width, height);
  return { width, height, data: canvas.toDataURL('image/jpeg', 0.93) };
}

/**
 * The pixels of an image (or of its `crop` rectangle, in image pixels) scaled to fit `max`
 * (high-quality browser scaling).
 */
export function rasterFromImage(img, max, crop = null) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const r = crop ?? { x: 0, y: 0, w: iw, h: ih };
  const { width, height } = fitSize(r.w, r.h, max);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingQuality = 'high';
  context.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;
  return createRaster(width, height, new Uint8ClampedArray(data));
}

/** A part of an image as a JPEG data: URL (the "original" of the compare view). */
export function cropDataUrl(img, crop, max = 1400) {
  const raster = rasterFromImage(img, max, crop);
  return rasterCanvas(raster).toDataURL('image/jpeg', 0.9);
}

/** A canvas showing a raster. */
export function rasterCanvas(raster, canvas = document.createElement('canvas')) {
  canvas.width = raster.width;
  canvas.height = raster.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height), 0, 0);
  return canvas;
}

export const EXPORT_TYPES = {
  png: { ext: 'png', mime: 'image/png', label: 'PNG' },
  jpg: { ext: 'jpg', mime: 'image/jpeg', label: 'JPEG', quality: true },
  webp: { ext: 'webp', mime: 'image/webp', label: 'WebP', quality: true },
  avif: { ext: 'avif', mime: 'image/avif', label: 'AVIF', quality: true },
  gif: { ext: 'gif', mime: 'image/gif', label: 'GIF' },
  bmp: { ext: 'bmp', mime: 'image/bmp', label: 'BMP' },
  tiff: { ext: 'tiff', mime: 'image/tiff', label: 'TIFF' },
  tga: { ext: 'tga', mime: 'image/x-tga', label: 'TGA' },
  ppm: { ext: 'ppm', mime: 'image/x-portable-pixmap', label: 'PPM' },
  qoi: { ext: 'qoi', mime: 'image/qoi', label: 'QOI' },
  ico: { ext: 'ico', mime: 'image/x-icon', label: 'ICO' },
  pdf: { ext: 'pdf', mime: 'application/pdf', label: 'PDF', quality: true },
  svg: { ext: 'svg', mime: 'image/svg+xml', label: 'SVG' },
};

const toBlob = (canvas, mime, quality) => new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
const blobBytes = async (blob) => new Uint8Array(await blob.arrayBuffer());
const rgbaOf = (canvas) => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;

/** A copy of a canvas over white (formats without transparency). */
function flatten(canvas) {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

/** A canvas encoded as file bytes (Uint8Array) of `type` (EXPORT_TYPES). */
export async function encodeCanvas(canvas, type = 'png', quality = 92) {
  const q = quality / 100;
  switch (type) {
    case 'bmp': return encodeBmp(rgbaOf(canvas), canvas.width, canvas.height);
    case 'tiff': return encodeTiff(rgbaOf(canvas), canvas.width, canvas.height);
    case 'tga': return encodeTga(rgbaOf(canvas), canvas.width, canvas.height);
    case 'ppm': return encodePpm(rgbaOf(canvas), canvas.width, canvas.height);
    case 'qoi': return encodeQoi(rgbaOf(canvas), canvas.width, canvas.height);
    case 'gif': return encodeGif(rgbaOf(canvas), canvas.width, canvas.height);
    case 'ico': {
      // Icons hold at most 256 × 256.
      const scale = Math.min(1, 256 / Math.max(canvas.width, canvas.height));
      const small = document.createElement('canvas');
      small.width = Math.max(1, Math.round(canvas.width * scale));
      small.height = Math.max(1, Math.round(canvas.height * scale));
      const ctx = small.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, small.width, small.height);
      return icoFromPng(await blobBytes(await toBlob(small, 'image/png')), small.width, small.height);
    }
    case 'pdf': {
      const jpeg = await blobBytes(await toBlob(flatten(canvas), 'image/jpeg', q));
      // One page the size of the picture (72 dpi points; at most 14 400 pt per side).
      const scale = Math.min(1, 14400 / Math.max(canvas.width, canvas.height));
      return pdfFromJpegs([{ jpeg, width: canvas.width, height: canvas.height }], { title: 'MyPhotoCut', pageWidth: canvas.width * scale, pageHeight: canvas.height * scale });
    }
    case 'svg': return svgFromPng(await blobBytes(await toBlob(canvas, 'image/png')), canvas.width, canvas.height, bytesToBase64);
    default: {
      const info = EXPORT_TYPES[type] ?? EXPORT_TYPES.png;
      const source = type === 'jpg' ? flatten(canvas) : canvas;
      const blob = await toBlob(source, info.mime, info.quality ? q : undefined);
      // The browser falls back to PNG for a type it cannot write (AVIF in some engines).
      if (!blob || blob.type !== info.mime) throw Object.assign(new Error('export.unsupported'), { code: 'export.unsupported', detail: info.label });
      return blobBytes(blob);
    }
  }
}

/**
 * A picture file (name + bytes) as an <img>: formats the browser reads go straight to it; TIFF,
 * TGA, PNM, QOI and PSD are decoded here first (also when the extension is wrong: the first
 * bytes decide).
 */
export async function imageFromBytes(name, bytes, mime) {
  const ext = String(name).split('.').pop().toLowerCase();
  const kind = DECODED_EXTENSIONS[ext] ?? sniff(bytes);
  if (kind) return loadImage(rasterCanvas(await decodeImage(kind, bytes)).toDataURL('image/png'));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  try {
    return await loadImage(url);
  } catch (error) {
    if (ext === 'heic' || ext === 'heif') throw Object.assign(new Error('photo.heicUnsupported'), { code: 'photo.heicUnsupported' });
    throw error;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

/** Bytes → Blob URL of a type (shown in <img>). */
export const bytesUrl = (bytes, mime) => URL.createObjectURL(new Blob([bytes], { type: mime }));

/** base64 (from the desktop backend) → bytes. */
export function base64ToBytes(base64) {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}
