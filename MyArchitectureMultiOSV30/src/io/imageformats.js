// Picture formats for exported plans and 3D views (ported from MySketchBook's
// src/io/imageformats.js). The browser encodes PNG, JPEG and WebP (and AVIF
// where its canvas can — Chrome; Edge and the desktop app's WebView2 cannot,
// so AVIF is offered only there); BMP, TIFF, TGA and PDF (the picture on a
// page) are written here, so they work the same in the desktop app and on the
// web. The writers are pure (RGBA pixels in, bytes out) and unit-tested.

/** [id, label, { mime, ext, alpha (keeps transparency), quality (lossy: quality setting) }] */
const ALL = [
  ["png", "PNG", { mime: "image/png", ext: "png", alpha: true }],
  ["jpg", "JPEG", { mime: "image/jpeg", ext: "jpg", quality: true }],
  ["webp", "WebP", { mime: "image/webp", ext: "webp", alpha: true, quality: true }],
  ["avif", "AVIF", { mime: "image/avif", ext: "avif", alpha: true, quality: true, probe: true }],
  ["bmp", "BMP", { mime: "image/bmp", ext: "bmp" }],
  ["tiff", "TIFF", { mime: "image/tiff", ext: "tif", alpha: true }],
  ["tga", "TGA", { mime: "image/x-tga", ext: "tga", alpha: true }],
  ["pdf", "PDF", { mime: "application/pdf", ext: "pdf", quality: true }],
];

let canvasAvif = null;
/** Whether this browser's canvas writes AVIF itself (Chrome yes; Edge/WebView2, Firefox, Safari no). Probed once. */
export function canvasEncodesAvif() {
  if (canvasAvif === null) {
    try {
      const c = globalThis.document?.createElement("canvas");
      canvasAvif = !!c && ((c.width = c.height = 2), c.toDataURL("image/avif").startsWith("data:image/avif"));
    } catch { canvasAvif = false; }
  }
  return canvasAvif;
}

/** The formats this browser / app can write: [{ id, label, mime, ext, alpha?, quality? }]. */
export function imageFormats({ avif = canvasEncodesAvif() } = {}) {
  return ALL.filter(([id]) => id !== "avif" || avif).map(([id, label, f]) => ({ id, label, ...f }));
}

export const formatInfo = (id) => imageFormats({ avif: true }).find((f) => f.id === id) || imageFormats({ avif: false })[0];

/** The file-dialog filter for a format. */
export const formatFilter = (id) => { const f = formatInfo(id); return { name: f.label, extensions: f.ext === "jpg" ? ["jpg", "jpeg"] : f.ext === "tif" ? ["tif", "tiff"] : [f.ext] }; };

/** A 2D canvas with the picture (a WebGL canvas is copied). */
function as2d(canvas) {
  const ctx = canvas.getContext && canvas.getContext("2d", { willReadFrequently: true });
  if (ctx) return { canvas, ctx };
  const copy = document.createElement("canvas");
  copy.width = canvas.width; copy.height = canvas.height;
  const c2 = copy.getContext("2d", { willReadFrequently: true });
  c2.drawImage(canvas, 0, 0);
  return { canvas: copy, ctx: c2 };
}

/** The picture on an opaque white background (formats without transparency). */
function flattened(canvas) {
  const copy = document.createElement("canvas");
  copy.width = canvas.width; copy.height = canvas.height;
  const ctx = copy.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, copy.width, copy.height);
  ctx.drawImage(canvas, 0, 0);
  return copy;
}

async function blobBytes(canvas, mime, quality) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
  if (!blob || blob.type !== mime) throw new Error(`This browser cannot write ${mime}`);
  return new Uint8Array(await blob.arrayBuffer());
}

/** A canvas holding a picture given as a data URL (the 3D view's screenshot). */
export function canvasFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      resolve(c);
    };
    img.onerror = () => reject(new Error("The picture could not be read"));
    img.src = dataUrl;
  });
}

/**
 * Encodes a canvas: { bytes, mime, ext }. `quality` 0..1 for JPEG/WebP/AVIF/PDF;
 * `transparent` keeps alpha in formats that have it (others get a white background).
 */
export async function encodeCanvas(canvas, id, { quality = 0.92, transparent = false } = {}) {
  const f = formatInfo(id);
  const keepAlpha = transparent && f.alpha;
  const source = keepAlpha ? canvas : flattened(canvas);
  let bytes;
  if (f.id === "png" || f.id === "jpg" || f.id === "webp" || f.id === "avif") bytes = await blobBytes(source, f.mime, f.quality ? quality : undefined);
  else if (f.id === "pdf") bytes = pdfWithJpeg(await blobBytes(source, "image/jpeg", quality), source.width, source.height);
  else {
    const { ctx } = as2d(source);
    const { data, width, height } = ctx.getImageData(0, 0, source.width, source.height);
    bytes = f.id === "bmp" ? encodeBmp(data, width, height) : f.id === "tga" ? encodeTga(data, width, height, keepAlpha) : encodeTiff(data, width, height, keepAlpha);
  }
  return { bytes, mime: f.mime, ext: f.ext };
}

// ---------------------------------------------------------------- writers (RGBA pixels, rows top to bottom)

/** 24-bit BMP (BGR, rows bottom-up, padded to 4 bytes), 96 dpi. */
export function encodeBmp(rgba, width, height) {
  const row = Math.ceil((width * 3) / 4) * 4;
  const size = 54 + row * height;
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  out[0] = 0x42; out[1] = 0x4d;
  v.setUint32(2, size, true); v.setUint32(10, 54, true);
  v.setUint32(14, 40, true); v.setInt32(18, width, true); v.setInt32(22, height, true);
  v.setUint16(26, 1, true); v.setUint16(28, 24, true); v.setUint32(34, row * height, true);
  v.setInt32(38, 3780, true); v.setInt32(42, 3780, true);
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

/** Baseline TIFF, uncompressed RGB(A) in one strip, little-endian, 96 dpi. */
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
  const push = (chunk) => { const b = typeof chunk === "string" ? enc.encode(chunk) : chunk; parts.push(b); length += b.length; };
  const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n`); for (const b of [].concat(body)) push(b); push("\nendobj\n"); };
  push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // %PDF-1.4, binary marker
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, [`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, "\nendstream"]);
  const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = length;
  push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => `${String(offsets[n]).padStart(10, "0")} 00000 n \n`).join("")}`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let o = 0;
  for (const b of parts) { out.set(b, o); o += b.length; }
  return out;
}
