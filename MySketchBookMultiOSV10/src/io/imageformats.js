// Picture formats for exported views and photo renders. The browser encodes PNG, JPEG and WebP;
// AVIF comes from the canvas where it can (Chrome), else from a bundled WebAssembly encoder
// (@jsquash/avif = libavif + aom, Apache-2.0/BSD, loaded only when AVIF is chosen — Edge and the
// desktop app's WebView2 cannot encode AVIF); BMP, TIFF, TGA and PDF (the picture on a page) are
// written here, so every format works the same in the desktop app and on the web. Pure apart from
// the canvas.

/** [id, label, { mime, ext, alpha (keeps transparency), quality (lossy: quality slider) }] */
const ALL = [
  ['png', 'PNG', { mime: 'image/png', ext: 'png', alpha: true }],
  ['jpg', 'JPEG', { mime: 'image/jpeg', ext: 'jpg', quality: true }],
  ['webp', 'WebP', { mime: 'image/webp', ext: 'webp', alpha: true, quality: true }],
  ['avif', 'AVIF', { mime: 'image/avif', ext: 'avif', alpha: true, quality: true }],
  ['bmp', 'BMP', { mime: 'image/bmp', ext: 'bmp' }],
  ['tiff', 'TIFF', { mime: 'image/tiff', ext: 'tif', alpha: true }],
  ['tga', 'TGA', { mime: 'image/x-tga', ext: 'tga', alpha: true }],
  ['pdf', 'PDF', { mime: 'application/pdf', ext: 'pdf' }],
];

/** Every format can be written everywhere (AVIF through the bundled encoder where the canvas cannot). */
export function imageFormats() {
  return ALL.map(([id, label, f]) => ({ id, label, ...f }));
}

let canvasAvif = null;
/** Whether this browser's canvas writes AVIF itself (Chrome yes; Edge/WebView2, Firefox, Safari no). Probed once. */
export function canvasEncodesAvif() {
  if (canvasAvif === null) {
    try {
      const c = globalThis.document?.createElement('canvas');
      canvasAvif = Boolean(c) && ((c.width = c.height = 2), c.toDataURL('image/avif').startsWith('data:image/avif'));
    } catch { canvasAvif = false; }
  }
  return canvasAvif;
}

/** How AVIF is written: 'canvas' when the canvas can, else 'wasm'. `force` (tests, smoke runs) picks one. */
export const avifEncoderFor = (canvasCan, force = null) => (force === 'canvas' || force === 'wasm' ? force : canvasCan ? 'canvas' : 'wasm');

// libavif's settings as @jsquash/avif/meta.js lists them (the encoder needs every field).
const AVIF_DEFAULTS = { quality: 50, qualityAlpha: -1, denoiseLevel: 0, tileColsLog2: 0, tileRowsLog2: 0, speed: 6, subsample: 1, chromaDeltaQ: false, sharpness: 0, tune: 0, enableSharpYUV: false, bitDepth: 8, lossless: false };

/** AVIF encoder settings for a quality 0..1 (libavif quality 0..100; faster on big pictures). */
export function avifOptions(quality = 0.92, pixels = 0, base = {}) {
  const q = Math.round(Math.max(0, Math.min(1, Number(quality) || 0)) * 100);
  return { ...AVIF_DEFAULTS, ...base, quality: Math.max(1, q), qualityAlpha: -1, speed: pixels > 4e6 ? 8 : pixels > 1.5e6 ? 7 : 6, subsample: 1, bitDepth: 8, lossless: false };
}

/** AVIF bytes from RGBA pixels with a loaded encoder module (the browser's or one a test loaded). */
export function encodeAvifPixels(module, rgba, width, height, quality = 0.92, base = {}) {
  const pixels = rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  const out = module.encode(pixels, width, height, avifOptions(quality, width * height, base));
  if (!out) throw new Error('AVIF encoding failed');
  return ArrayBuffer.isView(out) ? new Uint8Array(out.buffer, out.byteOffset, out.byteLength).slice() : new Uint8Array(out).slice();
}

let avifModule = null;
/** The WebAssembly AVIF encoder (single-threaded build; its .wasm ships with the app — no network). */
export function loadAvifEncoder() {
  if (!avifModule) {
    avifModule = (async () => {
      const [{ default: factory }, { default: wasmUrl }] = await Promise.all([
        import('@jsquash/avif/codec/enc/avif_enc.js'),
        import('@jsquash/avif/codec/enc/avif_enc.wasm?url'),
      ]);
      const module = await factory({ noInitialRun: true, locateFile: (file) => (file.endsWith('.wasm') ? wasmUrl : file) });
      return module;
    })();
    avifModule.catch(() => { avifModule = null; });
  }
  return avifModule;
}

async function avifBytes(canvas, quality) {
  if (avifEncoderFor(canvasEncodesAvif(), globalThis.__mysketchbookAvifEncoder) === 'canvas') return blobBytes(canvas, 'image/avif', quality);
  const module = await loadAvifEncoder();
  const { ctx } = as2d(canvas);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return encodeAvifPixels(module, data, width, height, quality);
}

export const formatInfo = (id) => imageFormats().find((f) => f.id === id) ?? imageFormats()[0];

/** A 2D canvas with the picture (WebGL canvases are copied; the copy keeps alpha). */
function as2d(canvas) {
  const ctx = canvas.getContext?.('2d');
  if (ctx) return { canvas, ctx };
  const copy = document.createElement('canvas');
  copy.width = canvas.width; copy.height = canvas.height;
  const c2 = copy.getContext('2d');
  c2.drawImage(canvas, 0, 0);
  return { canvas: copy, ctx: c2 };
}

/** The picture on an opaque white background (formats without transparency). */
function flattened(canvas) {
  const copy = document.createElement('canvas');
  copy.width = canvas.width; copy.height = canvas.height;
  const ctx = copy.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, copy.width, copy.height);
  ctx.drawImage(canvas, 0, 0);
  return copy;
}

const blobBytes = async (canvas, mime, quality) => {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
  if (!blob || blob.type !== mime) throw new Error(`This browser cannot write ${mime}`);
  return new Uint8Array(await blob.arrayBuffer());
};

/**
 * Encodes a canvas: { bytes, mime, ext }. `quality` 0..1 for JPEG/WebP/AVIF/PDF;
 * `transparent` keeps alpha in formats that have it (others get a white background).
 */
export async function encodeCanvas(canvas, id, { quality = 0.92, transparent = false } = {}) {
  const f = formatInfo(id);
  const keepAlpha = transparent && f.alpha;
  const source = keepAlpha ? canvas : flattened(canvas);
  let bytes;
  if (f.id === 'avif') bytes = await avifBytes(source, quality);
  else if (f.id === 'png' || f.id === 'jpg' || f.id === 'webp') bytes = await blobBytes(source, f.mime, f.quality ? quality : undefined);
  else if (f.id === 'pdf') bytes = pdfWithJpeg(await blobBytes(source, 'image/jpeg', quality), source.width, source.height);
  else {
    const { ctx } = as2d(source);
    const { data, width, height } = ctx.getImageData(0, 0, source.width, source.height);
    bytes = f.id === 'bmp' ? encodeBmp(data, width, height) : f.id === 'tga' ? encodeTga(data, width, height, keepAlpha) : encodeTiff(data, width, height, keepAlpha);
  }
  return { bytes, mime: f.mime, ext: f.ext };
}

// ───────────────────────── writers (RGBA pixels, rows top to bottom)

/** 24-bit BMP (BGR, rows bottom-up, padded to 4 bytes). */
export function encodeBmp(rgba, width, height) {
  const row = Math.ceil((width * 3) / 4) * 4;
  const size = 54 + row * height;
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  out[0] = 0x42; out[1] = 0x4d;
  v.setUint32(2, size, true); v.setUint32(10, 54, true);
  v.setUint32(14, 40, true); v.setInt32(18, width, true); v.setInt32(22, height, true);
  v.setUint16(26, 1, true); v.setUint16(28, 24, true); v.setUint32(34, row * height, true);
  v.setInt32(38, 3780, true); v.setInt32(42, 3780, true); // 96 dpi
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 4;
    let o = 54 + y * row;
    for (let x = 0; x < width; x++) { const i = src + x * 4; out[o++] = rgba[i + 2]; out[o++] = rgba[i + 1]; out[o++] = rgba[i]; }
  }
  return out;
}

/** Uncompressed TGA, 24-bit or 32-bit (BGRA), top-left origin. */
export function encodeTga(rgba, width, height, alpha = false) {
  const bpp = alpha ? 4 : 3;
  const out = new Uint8Array(18 + width * height * bpp);
  out[2] = 2; // uncompressed true colour
  out[12] = width & 255; out[13] = width >> 8; out[14] = height & 255; out[15] = height >> 8;
  out[16] = bpp * 8;
  out[17] = 0x20 | (alpha ? 8 : 0); // top-left origin, alpha bits
  let o = 18;
  for (let i = 0; i < width * height * 4; i += 4) { out[o++] = rgba[i + 2]; out[o++] = rgba[i + 1]; out[o++] = rgba[i]; if (alpha) out[o++] = rgba[i + 3]; }
  return out;
}

/** Baseline TIFF, uncompressed RGB(A) in one strip, little-endian. */
export function encodeTiff(rgba, width, height, alpha = false) {
  const spp = alpha ? 4 : 3;
  const pixels = width * height * spp;
  const entries = alpha ? 13 : 12;
  const ifdOffset = 8;
  const ifdSize = 2 + entries * 12 + 4;
  const bitsOffset = ifdOffset + ifdSize;
  const resOffset = bitsOffset + spp * 2;
  const dataOffset = resOffset + 16;
  const out = new Uint8Array(dataOffset + pixels);
  const v = new DataView(out.buffer);
  out[0] = 0x49; out[1] = 0x49; v.setUint16(2, 42, true); v.setUint32(4, ifdOffset, true);
  v.setUint16(ifdOffset, entries, true);
  let p = ifdOffset + 2;
  const tag = (id, type, count, value) => {
    v.setUint16(p, id, true); v.setUint16(p + 2, type, true); v.setUint32(p + 4, count, true);
    if (type === 3 && count === 1) v.setUint16(p + 8, value, true); else v.setUint32(p + 8, value, true);
    p += 12;
  };
  tag(256, 4, 1, width); // ImageWidth
  tag(257, 4, 1, height); // ImageLength
  tag(258, 3, spp, bitsOffset); // BitsPerSample (8 each)
  tag(259, 3, 1, 1); // Compression: none
  tag(262, 3, 1, 2); // Photometric: RGB
  tag(273, 4, 1, dataOffset); // StripOffsets
  tag(277, 3, 1, spp); // SamplesPerPixel
  tag(278, 4, 1, height); // RowsPerStrip
  tag(279, 4, 1, pixels); // StripByteCounts
  tag(282, 5, 1, resOffset); // XResolution
  tag(283, 5, 1, resOffset + 8); // YResolution
  tag(296, 3, 1, 2); // ResolutionUnit: inch
  if (alpha) tag(338, 3, 1, 2); // ExtraSamples: unassociated alpha
  v.setUint32(p, 0, true);
  for (let i = 0; i < spp; i++) v.setUint16(bitsOffset + i * 2, 8, true);
  v.setUint32(resOffset, 96, true); v.setUint32(resOffset + 4, 1, true);
  v.setUint32(resOffset + 8, 96, true); v.setUint32(resOffset + 12, 1, true);
  let o = dataOffset;
  for (let i = 0; i < width * height * 4; i += 4) { out[o++] = rgba[i]; out[o++] = rgba[i + 1]; out[o++] = rgba[i + 2]; if (alpha) out[o++] = rgba[i + 3]; }
  return out;
}

/** A one-page PDF showing a JPEG at 96 dpi (page size = picture size). */
export function pdfWithJpeg(jpeg, width, height) {
  const w = +(width * 0.75).toFixed(2); const h = +(height * 0.75).toFixed(2);
  const enc = new TextEncoder();
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (chunk) => { const b = typeof chunk === 'string' ? enc.encode(chunk) : chunk; parts.push(b); length += b.length; };
  const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n`); for (const b of [].concat(body)) push(b); push('\nendobj\n'); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, [`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, '\nendstream']);
  const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = length;
  push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => `${String(offsets[n]).padStart(10, '0')} 00000 n \n`).join('')}`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let o = 0;
  for (const b of parts) { out.set(b, o); o += b.length; }
  return out;
}
