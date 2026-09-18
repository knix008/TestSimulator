// Images: which files count as one, how to get pixels out of them and how
// to write them back in another format.
//
//   isImageName(name)            — by extension (the same list as core/fsops.js IMAGE_TYPES)
//   decodeImage(data, name)      — fs.readFile result → { source, width, height, url, note, details, dicom }
//                                  details: [[i18n key or label, value]] for the file-info window;
//                                  dicom: frames / window state + show() for a DICOM (src/lib/dicom.js)
//                                  source is an <img> (formats the browser draws itself) or a
//                                  <canvas> (HEIC / HEIF, DICOM, TIFF — decoded here, in the
//                                  renderer, so the desktop app and the browser behave alike)
//   renderImage(decoded, rot)    — a canvas of the picture, rotated by rot × 90°
//   encodeImage(canvas, format)  — PNG / JPEG / WebP via the canvas, BMP by hand → Blob
//
// The decoders are loaded on first use (dynamic import), so the app bundle does not carry
// libheif's WebAssembly (~2 MB) for people who never open a HEIC.

export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'jfif', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif', 'apng', 'heic', 'heif', 'hif', 'dcm', 'dicom', 'tif', 'tiff'];
const EXT_SET = new Set(IMAGE_EXTS);

export function extOf(name) {
  const dot = String(name || '').lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function isImageName(name) {
  return EXT_SET.has(extOf(name));
}

// What the browser cannot draw by itself.
const DECODED = { heic: 'heif', heif: 'heif', hif: 'heif', dcm: 'dicom', dicom: 'dicom', tif: 'tiff', tiff: 'tiff' };

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function loadImg(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('IMAGE_DECODE'));
    img.src = url;
  });
}

function canvasOf(width, height) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  return c;
}

// ── Decoding ──────────────────────────────────────────────

export async function decodeImage(data, name) {
  if (!data || data.kind !== 'image' || !data.base64) throw new Error('IMAGE_DECODE');
  const kind = DECODED[extOf(name)];
  if (!kind) {
    const url = `data:${data.mime || 'image/png'};base64,${data.base64}`;
    const img = await loadImg(url);
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, url, note: '', details: [] };
  }
  const bytes = base64ToBytes(data.base64);
  const r = kind === 'heif' ? await decodeHeif(bytes) : kind === 'dicom' ? await decodeDicom(bytes) : await decodeTiff(bytes);
  return { source: r.canvas, width: r.canvas.width, height: r.canvas.height, url: r.canvas.toDataURL('image/png'), note: r.note || '', details: r.details || [], dicom: r.dicom || null };
}

// HEIC / HEIF (libheif compiled to WebAssembly). The first image of the file; a multi-image file
// (a burst, a live photo's stills) says how many it holds.
async function decodeHeif(bytes) {
  const mod = await import('libheif-js/wasm-bundle');
  const libheif = mod.default || mod;
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(bytes);
  if (!images || !images.length) throw new Error('IMAGE_DECODE');
  const image = images[0];
  const width = image.get_width(), height = image.get_height();
  const canvas = canvasOf(width, height);
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  await new Promise((resolve, reject) => {
    image.display(imageData, (ok) => (ok ? resolve() : reject(new Error('IMAGE_DECODE'))));
  });
  ctx.putImageData(imageData, 0, 0);
  for (const im of images) { try { im.free(); } catch { /* older builds */ } }
  return { canvas, note: images.length > 1 ? `1 / ${images.length}` : '', details: [['info_images', String(images.length)]] };
}

// TIFF (UTIF): the first page, every compression UTIF knows (LZW, PackBits, Deflate, JPEG-in-TIFF …).
async function decodeTiff(bytes) {
  const mod = await import('utif');
  const UTIF = mod.default || mod;
  const ifds = UTIF.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  if (!ifds || !ifds.length) throw new Error('IMAGE_DECODE');
  // The largest page is usually the picture itself (thumbnails and reduced pages come after it).
  const page = ifds.reduce((a, b) => ((b.t256 && b.t257 && b.t256[0] * b.t257[0] > (a.t256 ? a.t256[0] * a.t257[0] : 0)) ? b : a), ifds[0]);
  UTIF.decodeImage(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), page, ifds);
  const rgba = UTIF.toRGBA8(page);
  const canvas = canvasOf(page.width, page.height);
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), page.width, page.height), 0, 0);
  const COMP = { 1: 'None', 2: 'CCITT RLE', 3: 'CCITT G3', 4: 'CCITT G4', 5: 'LZW', 6: 'JPEG (old)', 7: 'JPEG', 8: 'Deflate', 32773: 'PackBits', 32946: 'Deflate', 34712: 'JPEG 2000' };
  const PHOTO = { 0: 'WhiteIsZero', 1: 'BlackIsZero', 2: 'RGB', 3: 'Palette', 4: 'Mask', 5: 'CMYK', 6: 'YCbCr', 8: 'CIELab' };
  const tag = (k) => (page[k] ? page[k][0] : undefined);
  const details = [
    ['info_pages', String(ifds.length)],
    ['info_compression', COMP[tag('t259')] || (tag('t259') !== undefined ? String(tag('t259')) : '')],
    ['info_color', [PHOTO[tag('t262')], page.t258 ? `${page.t258.join('/')} bit` : '', page.t277 ? `${tag('t277')} ch` : ''].filter(Boolean).join('  ·  ')],
    ['info_resolution', tag('t282') ? `${Math.round(tag('t282'))} × ${Math.round(tag('t283') || tag('t282'))} ${tag('t296') === 3 ? 'dpcm' : 'dpi'}` : ''],
    ['info_camera', [tag('t271'), tag('t272')].filter(Boolean).join(' ')],
    ['info_software', tag('t305') || ''], ['info_taken', tag('t306') || ''],
  ].filter(([, v]) => v);
  return { canvas, note: ifds.length > 1 ? `1 / ${ifds.length}` : '', details };
}

// DICOM: src/lib/dicom.js (tags, every transfer syntax's codec, frames, window / level).
async function decodeDicom(bytes) {
  const m = await import('./dicom');
  return m.decodeDicom(bytes);
}

// ── Rendering / encoding ──────────────────────────────────

// The picture on a canvas, rotated by rot quarter turns clockwise.
export function renderImage(decoded, rot = 0) {
  const q = ((rot % 4) + 4) % 4;
  const w = decoded.width, h = decoded.height;
  const canvas = canvasOf(q % 2 ? h : w, q % 2 ? w : h);
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((q * Math.PI) / 2);
  ctx.drawImage(decoded.source, -w / 2, -h / 2, w, h);
  return canvas;
}

export const SAVE_FORMATS = [
  { id: 'png', label: 'PNG', ext: 'png', mime: 'image/png' },
  { id: 'jpeg', label: 'JPEG', ext: 'jpg', mime: 'image/jpeg' },
  { id: 'webp', label: 'WebP', ext: 'webp', mime: 'image/webp' },
  { id: 'bmp', label: 'BMP', ext: 'bmp', mime: 'image/bmp' },
];

export function encodeImage(canvas, format, quality = 0.92) {
  const f = SAVE_FORMATS.find((x) => x.id === format) || SAVE_FORMATS[0];
  if (f.id === 'bmp') return Promise.resolve(new Blob([encodeBmp(canvas)], { type: f.mime }));
  if (f.id === 'jpeg') {
    // JPEG has no alpha: transparent parts would come out black, so they are laid on white first.
    const flat = canvasOf(canvas.width, canvas.height);
    const ctx = flat.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, flat.width, flat.height); ctx.drawImage(canvas, 0, 0);
    canvas = flat;
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('ENCODE'))), f.mime, quality));
}

// 24-bit bottom-up BMP (BITMAPINFOHEADER), transparent pixels on white.
function encodeBmp(canvas) {
  const w = canvas.width, h = canvas.height;
  const src = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const stride = (w * 3 + 3) & ~3;
  const size = 54 + stride * h;
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  dv.setUint8(0, 0x42); dv.setUint8(1, 0x4d); dv.setUint32(2, size, true); dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true); dv.setInt32(18, w, true); dv.setInt32(22, h, true); dv.setUint16(26, 1, true); dv.setUint16(28, 24, true);
  dv.setUint32(34, stride * h, true); dv.setInt32(38, 2835, true); dv.setInt32(42, 2835, true);
  for (let y = 0; y < h; y++) {
    const row = 54 + (h - 1 - y) * stride;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, a = src[i + 3] / 255;
      u8[row + x * 3] = Math.round(src[i + 2] * a + 255 * (1 - a));
      u8[row + x * 3 + 1] = Math.round(src[i + 1] * a + 255 * (1 - a));
      u8[row + x * 3 + 2] = Math.round(src[i] * a + 255 * (1 - a));
    }
  }
  return buf;
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error || new Error('READ'));
    r.readAsDataURL(blob);
  });
}

// Replaces the extension: photo.heic → photo.png
export function withExt(name, ext) {
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name}.${ext}`;
}
