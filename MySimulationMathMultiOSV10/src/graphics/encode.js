// Byte helpers for the figure export replies: base64, zlib deflate (the
// platform CompressionStream) and a minimal PDF that holds one RGB image.
// DOM-free so Node tests can import it.

/** Uint8Array → base64 (chunked, so large images do not overflow the call stack). */
export function bytesToBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}

export function base64ToBytes(b64) {
  const bin = atob(String(b64 || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const enc = (s) => new TextEncoder().encode(s);

/** zlib-wrapped deflate (what PDF /FlateDecode expects). */
export async function deflate(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** RGBA (canvas ImageData) → RGB composited over white (alpha) or as is. */
export function rgbaToRgb(rgba, over = [255, 255, 255]) {
  const n = rgba.length >> 2;
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rgba[4 * i + 3] / 255;
    for (let k = 0; k < 3; k++) out[3 * i + k] = Math.round(rgba[4 * i + k] * a + over[k] * (1 - a));
  }
  return out;
}

function concat(parts) {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/**
 * A one-page PDF showing an RGB image scaled to the page.
 *   pageW, pageH: page size in points; imgW, imgH: image pixels;
 *   data: RGB bytes, already deflated when flate = true.
 */
export function buildPdf({ pageW, pageH, imgW, imgH, data, flate = true, title = 'Figure' }) {
  const parts = [];
  const offsets = [];
  let pos = 0;
  const push = (p) => { const b = typeof p === 'string' ? enc(p) : p; parts.push(b); pos += b.length; };
  const obj = (n, body) => { offsets[n] = pos; push(`${n} 0 obj\n`); for (const b of body) push(b); push('\nendobj\n'); };
  const W = Number(pageW.toFixed(2)), H = Number(pageH.toFixed(2));
  push('%PDF-1.4\n%\xC7\xEC\x8F\xA2\n');
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  obj(2, ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>']);
  obj(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`]);
  obj(4, [`<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8${flate ? ' /Filter /FlateDecode' : ''} /Length ${data.length} >>\nstream\n`, data, '\nendstream']);
  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  obj(5, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
  const safeTitle = String(title).replace(/[^\x20-\x7e]/g, '?').replace(/([()\\])/g, '\\$1');
  obj(6, [`<< /Title (${safeTitle}) /Producer (MySimulationMath) >>`]);
  const xref = pos;
  let x = `xref\n0 7\n0000000000 65535 f \n`;
  for (let n = 1; n <= 6; n++) x += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(x);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return concat(parts);
}

/** Bytes of a Blob (canvas.toBlob result). */
export async function blobBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

// ---------------------------------------------------------------- GIF

/**
 * Palette for RGBA pixels: the most frequent colours at 5 bits per channel
 * (up to 256, or 255 plus a transparent slot). Exact when the image has at
 * most that many colours. Returns { palette: [[r,g,b]...], transparent: index|-1, index(r,g,b) }.
 */
export function quantize(rgba, { transparent = true, maxColors = 256 } = {}) {
  const n = rgba.length >> 2;
  const exact = new Map();
  let hasAlpha = false;
  for (let i = 0; i < n && exact.size <= maxColors; i++) {
    if (transparent && rgba[4 * i + 3] < 128) { hasAlpha = true; continue; }
    const k = (rgba[4 * i] << 16) | (rgba[4 * i + 1] << 8) | rgba[4 * i + 2];
    exact.set(k, (exact.get(k) || 0) + 1);
  }
  if (transparent && !hasAlpha) for (let i = 0; i < n; i++) if (rgba[4 * i + 3] < 128) { hasAlpha = true; break; }
  const slots = maxColors - (hasAlpha ? 1 : 0);
  let palette;
  const cache = new Map();
  if (exact.size <= slots) {
    palette = [...exact.keys()].map((k) => [(k >> 16) & 255, (k >> 8) & 255, k & 255]);
    palette.forEach((c, i) => cache.set((c[0] << 16) | (c[1] << 8) | c[2], i));
  } else {
    // popularity on a 5-5-5 grid, each bin represented by its mean colour
    const bins = new Map();
    for (let i = 0; i < n; i++) {
      if (transparent && rgba[4 * i + 3] < 128) continue;
      const r = rgba[4 * i], g = rgba[4 * i + 1], b = rgba[4 * i + 2];
      const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let e = bins.get(k);
      if (!e) { e = [0, 0, 0, 0]; bins.set(k, e); }
      e[0] += r; e[1] += g; e[2] += b; e[3] += 1;
    }
    palette = [...bins.values()].sort((a, b) => b[3] - a[3]).slice(0, slots).map((e) => [Math.round(e[0] / e[3]), Math.round(e[1] / e[3]), Math.round(e[2] / e[3])]);
  }
  const tIndex = hasAlpha ? palette.length : -1;
  const index = (r, g, b) => {
    const k = (r << 16) | (g << 8) | b;
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    let best = 0, bd = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const p = palette[i];
      const d = (p[0] - r) * (p[0] - r) * 2 + (p[1] - g) * (p[1] - g) * 4 + (p[2] - b) * (p[2] - b) * 3;
      if (d < bd) { bd = d; best = i; if (d === 0) break; }
    }
    cache.set(k, best);
    return best;
  };
  return { palette, transparent: tIndex, index };
}

/** GIF LZW compression of colour indices (min code size 8): the image data sub-blocks. */
export function lzwEncode(indices, minCode = 8) {
  const clear = 1 << minCode, eoi = clear + 1;
  const out = [];
  let cur = 0, bits = 0;
  let size = minCode + 1;
  const emit = (code) => {
    cur |= code << bits; bits += size;
    while (bits >= 8) { out.push(cur & 255); cur >>>= 8; bits -= 8; }
  };
  let dict = new Map();
  let next = eoi + 1;
  emit(clear);
  let prefix = indices.length ? indices[0] : -1;
  for (let i = 1; i < indices.length; i++) {
    const c = indices[i];
    const key = prefix * 256 + c;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > (1 << size) && size < 12) size += 1;
    } else {
      emit(clear);
      dict = new Map(); next = eoi + 1; size = minCode + 1;
    }
    prefix = c;
  }
  if (prefix >= 0) emit(prefix);
  emit(eoi);
  if (bits > 0) out.push(cur & 255);
  return Uint8Array.from(out);
}

/** A single-frame GIF89a from RGBA pixels (alpha < 128 → transparent when allowed). */
export function encodeGif(rgba, width, height, { transparent = true } = {}) {
  const q = quantize(rgba, { transparent });
  const n = width * height;
  const idx = new Uint8Array(n);
  for (let i = 0; i < n; i++) idx[i] = q.transparent >= 0 && rgba[4 * i + 3] < 128 ? q.transparent : q.index(rgba[4 * i], rgba[4 * i + 1], rgba[4 * i + 2]);
  const data = lzwEncode(idx, 8);
  const parts = [];
  const u16 = (v) => [v & 255, (v >> 8) & 255];
  parts.push(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...u16(width), ...u16(height), 0xf7, 0, 0]));
  const table = new Uint8Array(768);
  q.palette.forEach((c, i) => table.set(c, 3 * i));
  parts.push(table);
  if (q.transparent >= 0) parts.push(Uint8Array.from([0x21, 0xf9, 0x04, 0x01, 0, 0, q.transparent, 0]));
  parts.push(Uint8Array.from([0x2c, 0, 0, 0, 0, ...u16(width), ...u16(height), 0, 8]));
  const blocks = [];
  for (let i = 0; i < data.length; i += 255) { const chunk = data.subarray(i, i + 255); blocks.push(Uint8Array.from([chunk.length])); blocks.push(chunk); }
  parts.push(...blocks, Uint8Array.from([0, 0x3b]));
  return concat(parts);
}

// ---------------------------------------------------------------- DPI in PNG / JPEG

let CRC_TABLE = null;
export function crc32(bytes, start = 0, end = bytes.length) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** PNG with a pHYs chunk for `dpi` (any old pHYs is replaced). */
export function setPngDpi(png, dpi) {
  if (png.length < 33 || png[12] !== 0x49 || png[13] !== 0x48) return png; // IHDR first
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
  dv.setUint32(17, crc32(chunk, 4, 17));
  const parts = [png.subarray(0, 33), chunk];
  let p = 33;
  const pv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  while (p + 8 <= png.length) {
    const len = pv.getUint32(p);
    const type = String.fromCharCode(png[p + 4], png[p + 5], png[p + 6], png[p + 7]);
    const end = p + 12 + len;
    if (type !== 'pHYs') parts.push(png.subarray(p, end));
    p = end;
  }
  return concat(parts);
}

/** JPEG whose JFIF APP0 says `dpi` (an APP0 is added after SOI when missing). */
export function setJpegDpi(jpg, dpi) {
  if (jpg[0] !== 0xff || jpg[1] !== 0xd8) return jpg;
  const d = Math.max(1, Math.min(65535, Math.round(dpi)));
  if (jpg[2] === 0xff && jpg[3] === 0xe0 && jpg[6] === 0x4a && jpg[7] === 0x46 && jpg[8] === 0x49 && jpg[9] === 0x46) {
    const out = jpg.slice();
    out[13] = 1; out[14] = d >> 8; out[15] = d & 255; out[16] = d >> 8; out[17] = d & 255;
    return out;
  }
  const app0 = Uint8Array.from([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, d >> 8, d & 255, d >> 8, d & 255, 0, 0]);
  return concat([jpg.subarray(0, 2), app0, jpg.subarray(2)]);
}

/** BMP (24-bit, bottom-up rows): RGBA composited over `over` (BMP readers rarely honour alpha). */
export function encodeBmp(rgba, width, height, over = [255, 255, 255]) {
  const row = Math.ceil((width * 3) / 4) * 4;
  const size = 54 + row * height;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  out[0] = 0x42; out[1] = 0x4d;
  dv.setUint32(2, size, true); dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true); dv.setInt32(18, width, true); dv.setInt32(22, height, true);
  dv.setUint16(26, 1, true); dv.setUint16(28, 24, true); dv.setUint32(34, row * height, true);
  dv.setInt32(38, 3780, true); dv.setInt32(42, 3780, true); // 96 dpi
  for (let y = 0; y < height; y++) {
    const o = 54 + (height - 1 - y) * row;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, a = rgba[i + 3] / 255;
      out[o + x * 3] = Math.round(rgba[i + 2] * a + over[2] * (1 - a));
      out[o + x * 3 + 1] = Math.round(rgba[i + 1] * a + over[1] * (1 - a));
      out[o + x * 3 + 2] = Math.round(rgba[i] * a + over[0] * (1 - a));
    }
  }
  return out;
}

/** Baseline TIFF, uncompressed RGBA (unassociated alpha) — or RGB composited over white when alpha is false. */
export function encodeTiff(rgba, width, height, { alpha = true } = {}) {
  const spp = alpha ? 4 : 3;
  const data = new Uint8Array(width * height * spp);
  for (let p = 0, q = 0; p < rgba.length; p += 4, q += spp) {
    const a = rgba[p + 3] / 255;
    if (alpha) { data[q] = rgba[p]; data[q + 1] = rgba[p + 1]; data[q + 2] = rgba[p + 2]; data[q + 3] = rgba[p + 3]; } else {
      data[q] = Math.round(rgba[p] * a + 255 * (1 - a)); data[q + 1] = Math.round(rgba[p + 1] * a + 255 * (1 - a)); data[q + 2] = Math.round(rgba[p + 2] * a + 255 * (1 - a));
    }
  }
  const tags = [
    [256, 4, 1, width], [257, 4, 1, height], [258, 3, spp, null], [259, 3, 1, 1], [262, 3, 1, 2], [273, 4, 1, null],
    [277, 3, 1, spp], [278, 4, 1, height], [279, 4, 1, data.length], [282, 5, 1, null], [283, 5, 1, null], [284, 3, 1, 1], [296, 3, 1, 2],
  ];
  if (alpha) tags.push([338, 3, 1, 2]);
  const ifdOff = 8, ifdSize = 2 + tags.length * 12 + 4;
  const bpsOff = ifdOff + ifdSize, resOff = bpsOff + spp * 2, dataOff = resOff + 16;
  const out = new Uint8Array(dataOff + data.length);
  const dv = new DataView(out.buffer);
  out[0] = 0x49; out[1] = 0x49; dv.setUint16(2, 42, true); dv.setUint32(4, ifdOff, true);
  dv.setUint16(ifdOff, tags.length, true);
  tags.forEach(([tag, type, count, value], k) => {
    const e = ifdOff + 2 + k * 12;
    dv.setUint16(e, tag, true); dv.setUint16(e + 2, type, true); dv.setUint32(e + 4, count, true);
    let v = value;
    if (tag === 258) v = bpsOff; else if (tag === 273) v = dataOff; else if (tag === 282) v = resOff; else if (tag === 283) v = resOff + 8;
    if (type === 3 && count === 1) dv.setUint16(e + 8, v, true); else dv.setUint32(e + 8, v, true);
  });
  for (let k = 0; k < spp; k++) dv.setUint16(bpsOff + k * 2, 8, true);
  dv.setUint32(resOff, 96, true); dv.setUint32(resOff + 4, 1, true); dv.setUint32(resOff + 8, 96, true); dv.setUint32(resOff + 12, 1, true);
  out.set(data, dataOff);
  return out;
}

const canvasBlob = (canvas, type, q) => (canvas.convertToBlob ? canvas.convertToBlob({ type, quality: q })
  : new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The image could not be encoded.'))), type, q)));

/**
 * A canvas as image file bytes: format png | jpg | gif | webp | bmp | tiff.
 * transparent: keep the alpha channel where the format has one (else the
 * image is put on white). quality 10–100 for jpg / webp.
 */
export async function encodeCanvas(canvas, format, { transparent = false, quality = 92 } = {}) {
  let c = canvas;
  const alphaOk = ['png', 'gif', 'webp', 'tiff'].includes(format);
  if (!transparent || !alphaOk) {
    // flatten on white (jpg / bmp have no alpha; an opaque export asked for)
    c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(canvas.width, canvas.height) : Object.assign(document.createElement('canvas'), { width: canvas.width, height: canvas.height });
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(canvas, 0, 0);
  }
  const pixels = () => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  if (format === 'gif') return encodeGif(pixels(), c.width, c.height, { transparent: transparent && alphaOk });
  if (format === 'bmp') return encodeBmp(pixels(), c.width, c.height);
  if (format === 'tiff') return encodeTiff(pixels(), c.width, c.height, { alpha: transparent });
  const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[format] || 'image/png';
  return blobBytes(await canvasBlob(c, mime, format === 'jpg' || format === 'webp' ? quality / 100 : undefined));
}
