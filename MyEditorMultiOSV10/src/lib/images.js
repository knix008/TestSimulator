// Image sources for the Markdown WYSIWYG view and the preview.
//
// `data:` and `http(s):` URLs are used as they are. Anything else is a file
// path — relative to the document's folder — that the page cannot load
// itself (the desktop app runs from file:// or the dev server, the web version
// from a server that does not expose the disk), so the backend reads it and
// hands back a data URL (`file.dataUrl`), cached here per resolved path.
import { call } from './backend';

const cache = new Map();

export function isRemote(src) { return /^(data:|https?:|blob:)/i.test(src); }

export function joinPath(base, rel) {
  let p = rel.replace(/^file:\/\/\/?/i, '');
  try { p = decodeURI(p); } catch { /* keep as typed */ }
  if (/^([a-zA-Z]:[\\/]|\\\\|\/)/.test(p)) return p;          // absolute
  if (!base) return p;
  const sep = base.includes('\\') ? '\\' : '/';
  return base.replace(/[\\/]+$/, '') + sep + p.replace(/^\.\//, '');
}

export function resolveImageSrc(src, base) {
  const s = String(src || '').trim().replace(/^<|>$/g, '');
  if (!s) return Promise.reject(new Error('empty'));
  if (isRemote(s)) return Promise.resolve(s);
  const p = joinPath(base, s.split(/[?#]/)[0]);
  let hit = cache.get(p);
  if (!hit) {
    hit = call('file.dataUrl', { path: p }).then((r) => r.dataUrl);
    hit.catch(() => cache.delete(p));
    cache.set(p, hit);
  }
  return hit;
}

// Rewrites the <img> elements under `root` whose src is a local path.
export function resolveImagesIn(root, base) {
  for (const img of root.querySelectorAll('img[src]')) {
    const src = img.getAttribute('src');
    if (!src || isRemote(src)) continue;
    resolveImageSrc(src, base).then((u) => { img.src = u; }).catch(() => {});
  }
}

// Loads an image into a canvas and says whether it has transparent pixels.
export function analyzeImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let hasAlpha = false;
        for (let i = 3; i < d.length; i += 4) if (d[i] < 255) { hasAlpha = true; break; }
        resolve({ width: c.width, height: c.height, hasAlpha, canvas: c });
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
}

// A 24-bit (no alpha) BMP from a canvas, bottom-up rows padded to 4 bytes.
function encodeBmp(canvas) {
  const w = canvas.width, h = canvas.height;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const rowSize = Math.ceil(w * 3 / 4) * 4;
  const size = 54 + rowSize * h;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  const u8 = new Uint8Array(buf);
  v.setUint8(0, 0x42); v.setUint8(1, 0x4d); v.setUint32(2, size, true); v.setUint32(10, 54, true);
  v.setUint32(14, 40, true); v.setInt32(18, w, true); v.setInt32(22, h, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true); v.setUint32(34, rowSize * h, true);
  v.setInt32(38, 2835, true); v.setInt32(42, 2835, true);
  for (let y = 0; y < h; y++) {
    const row = 54 + (h - 1 - y) * rowSize;
    for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; u8[row + x * 3] = d[i + 2]; u8[row + x * 3 + 1] = d[i + 1]; u8[row + x * 3 + 2] = d[i]; }
  }
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return `data:image/bmp;base64,${btoa(bin)}`;
}

// Encodes a canvas: format png | jpeg | webp | bmp; lossy quality 0–1; with
// keepAlpha false the picture is flattened onto `background` first (JPEG
// and BMP have no transparency, so they always are).
export function encodeImage(canvas, { format = 'png', quality = 0.92, keepAlpha = true, background = '#ffffff' } = {}) {
  let c = canvas;
  if (!keepAlpha || format === 'jpeg' || format === 'bmp') {
    c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    const g = c.getContext('2d');
    g.fillStyle = background; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(canvas, 0, 0);
  }
  if (format === 'bmp') return encodeBmp(c);
  const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
  const url = c.toDataURL(mime, quality);
  if (!url.startsWith(`data:${mime}`)) throw new Error(`${format.toUpperCase()} is not supported here`);
  return url;
}

// The image as a PNG data URL (any format the browser decodes), for the clipboard / export.
export function toPngDataUrl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { try { const c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height; c.getContext('2d').drawImage(img, 0, 0); resolve(c.toDataURL('image/png')); } catch (e) { reject(e); } };
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
}
// Copies an image (a data URL or a loaded src) to the clipboard: the browser
// clipboard when it allows it, the desktop app's clipboard otherwise.
export async function copyImage(src) {
  const png = /^data:image\/png/i.test(src) ? src : await toPngDataUrl(src);
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const blob = await (await fetch(png)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    }
  } catch { /* fall back to the app's clipboard */ }
  return call('clipboard.writeImage', { dataUrl: png });
}

export const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif' };
export function mimeOfName(name) { const m = String(name || '').match(/\.([a-z0-9]+)$/i); return (m && IMAGE_MIME[m[1].toLowerCase()]) || ''; }
export function isImageFile(file) { return /^image\//.test(file.type || '') || !!mimeOfName(file.name); }

function bytesOfDataUrl(url) {
  const m = /^data:[^;]*;base64,(.+)$/s.exec(String(url || ''));
  if (!m) return null;
  const bin = atob(m[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function icoLargestPng(buf) {
  if (!buf || buf.length < 6 || buf[0] !== 0 || buf[1] !== 0 || buf[2] !== 1 || buf[3] !== 0) return null;
  const n = buf[4] | (buf[5] << 8);
  let best = null, bestBytes = -1;
  const u32 = (o) => (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0;
  for (let i = 0; i < n; i++) {
    const o = 6 + i * 16;
    if (o + 16 > buf.length) break;
    const size = u32(o + 8), off = u32(o + 12);
    if (off + size > buf.length || size < 8) continue;
    if (buf[off] === 0x89 && buf[off + 1] === 0x50 && buf[off + 2] === 0x4e && buf[off + 3] === 0x47) {
      if (size >= bestBytes) { bestBytes = size; best = buf.subarray(off, off + size); }
    }
  }
  return best;
}

function pngDataUrl(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(bin)}`;
}

// <img> often cannot draw a PNG-inside-ICO from image/x-icon; unwrap the largest PNG frame.
export function icoDisplaySrc(url) {
  const png = icoLargestPng(bytesOfDataUrl(url));
  return png ? pngDataUrl(png) : url;
}

// Reads a dropped / pasted image file as a data URL (for embedding in
// Markdown). The MIME type comes from the file, or from its extension when
// the OS reports none — PNG, JPEG, GIF, WebP, SVG, BMP, AVIF and ICO all work.
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      let u = String(r.result);
      const mime = (/^image\//.test(file.type || '') ? file.type : '') || mimeOfName(file.name);
      if (mime) u = u.replace(/^data:[^;,]*/, `data:${mime}`);
      if (/\.ico$/i.test(file.name || '') || /icon/i.test(mime)) u = icoDisplaySrc(u);
      resolve(u);
    };
    r.onerror = () => reject(r.error || new Error('read failed'));
    r.readAsDataURL(file);
  });
}
