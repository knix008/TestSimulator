/* Picture → file bytes for every format the app writes: PNG, JPG, WEBP (the web view's own
 * encoder), GIF and BMP (written here: WebView2 has no encoder for them — a BMP "save"
 * used to come out as PNG bytes) and AVIF (the web view when it can, otherwise the desktop
 * host, superres.rs encode_avif with ravif).
 *
 * encode(canvas | {width,height,data}, ext, quality 0..1) → Promise<data URL>.
 * UMD: the GIF / BMP writers are unit-tested in Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ImageCodec = api;
}(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', bmp: 'image/bmp' };

  function _u16(out, o, v) { out[o] = v & 255; out[o + 1] = (v >> 8) & 255; }
  function _u32(out, o, v) { out[o] = v & 255; out[o + 1] = (v >> 8) & 255; out[o + 2] = (v >> 16) & 255; out[o + 3] = (v >>> 24) & 255; }

  /** 24-bit BMP (bottom-up rows padded to 4 bytes); see-through pixels laid on `bg`. */
  function encodeBmp(img, bg = [255, 255, 255]) {
    const { width: w, height: h, data } = img;
    const row = Math.ceil((w * 3) / 4) * 4;
    const size = 54 + row * h;
    const f = new Uint8Array(size);
    f[0] = 0x42; f[1] = 0x4d;
    _u32(f, 2, size); _u32(f, 10, 54); _u32(f, 14, 40); _u32(f, 18, w); _u32(f, 22, h);
    _u16(f, 26, 1); _u16(f, 28, 24); _u32(f, 34, row * h); _u32(f, 38, 2835); _u32(f, 42, 2835);
    for (let y = 0; y < h; y++) {
      const s = (h - 1 - y) * w * 4, t = 54 + y * row;
      for (let x = 0; x < w; x++) {
        const p = s + x * 4, a = data[p + 3] / 255, q = t + x * 3;
        f[q] = Math.round(data[p + 2] * a + bg[2] * (1 - a));
        f[q + 1] = Math.round(data[p + 1] * a + bg[1] * (1 - a));
        f[q + 2] = Math.round(data[p] * a + bg[0] * (1 - a));
      }
    }
    return f;
  }

  /** Median-cut palette of at most `count` colours from a sample of the opaque pixels. */
  function quantize(data, count, skipTransparent) {
    const n = data.length / 4;
    const step = Math.max(1, Math.floor(n / 200000));
    const pts = [];
    for (let i = 0; i < n; i += step) {
      const p = i * 4;
      if (skipTransparent && data[p + 3] < 128) continue;
      pts.push((data[p] << 16) | (data[p + 1] << 8) | data[p + 2]);
    }
    if (!pts.length) return [[0, 0, 0]];
    const ch = (c, k) => (c >> (16 - 8 * k)) & 255;
    const span = (box) => {
      let best = 0, bestK = 0;
      for (let k = 0; k < 3; k++) {
        let lo = 255, hi = 0;
        for (const c of box) { const v = ch(c, k); if (v < lo) lo = v; if (v > hi) hi = v; }
        if (hi - lo > best) { best = hi - lo; bestK = k; }
      }
      return { range: best, k: bestK };
    };
    const boxes = [pts];
    while (boxes.length < count) {
      let idx = -1, range = 0, kk = 0;
      for (let i = 0; i < boxes.length; i++) {
        if (boxes[i].length < 2) continue;
        // Big, wide boxes first
        const s = span(boxes[i]);
        const score = s.range * Math.sqrt(boxes[i].length);
        if (score > range) { range = score; idx = i; kk = s.k; }
      }
      if (idx < 0) break;
      const box = boxes[idx];
      box.sort((a, b) => ch(a, kk) - ch(b, kk));
      const mid = box.length >> 1;
      boxes.splice(idx, 1, box.slice(0, mid), box.slice(mid));
    }
    return boxes.map((box) => {
      let r = 0, g = 0, b = 0;
      for (const c of box) { r += ch(c, 0); g += ch(c, 1); b += ch(c, 2); }
      return [Math.round(r / box.length), Math.round(g / box.length), Math.round(b / box.length)];
    });
  }

  /** GIF LZW with a flat (prefix, byte) → code table. */
  function lzw(indexes, minCode) {
    const clear = 1 << minCode, eoi = clear + 1;
    let size = minCode + 1, next = eoi + 1;
    const table = new Int16Array(4096 * 256).fill(-1);
    const used = [];
    const out = [];
    let buf = 0, bits = 0;
    const put = (code) => {
      buf |= code << bits;
      bits += size;
      while (bits >= 8) { out.push(buf & 255); buf >>= 8; bits -= 8; }
    };
    put(clear);
    if (!indexes.length) { put(eoi); if (bits) out.push(buf & 255); return Uint8Array.from(out); }
    let prefix = indexes[0];
    for (let i = 1; i < indexes.length; i++) {
      const c = indexes[i], key = prefix * 256 + c;
      const hit = table[key];
      if (hit >= 0) { prefix = hit; continue; }
      put(prefix);
      if (next < 4096) {
        table[key] = next; used.push(key);
        next++;
        if (next > (1 << size) && size < 12) size++;
      } else {
        put(clear);
        for (const k of used) table[k] = -1;
        used.length = 0;
        size = minCode + 1;
        next = eoi + 1;
      }
      prefix = c;
    }
    put(prefix);
    put(eoi);
    if (bits) out.push(buf & 255);
    return Uint8Array.from(out);
  }

  /**
   * 256-colour GIF89a; see-through pixels (alpha < 128) become the transparent index 0.
   * `dither`: Floyd–Steinberg error diffusion (smooth photos instead of colour bands).
   */
  function encodeGif(img, { dither = true } = {}) {
    const { width: w, height: h, data } = img;
    let transparent = false;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 128) { transparent = true; break; }
    const colors = quantize(data, transparent ? 255 : 256, transparent);
    const pal = transparent ? [[0, 0, 0], ...colors] : colors.slice();
    while (pal.length < 256) pal.push([0, 0, 0]);
    const first = transparent ? 1 : 0;
    const cache = new Int16Array(32768).fill(-1);
    const nearest = (r, g, b) => {
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const hit = cache[key];
      if (hit >= 0) return hit;
      let best = first, score = Infinity;
      for (let i = first; i < first + colors.length; i++) {
        const c = pal[i], dr = c[0] - r, dg = c[1] - g, db = c[2] - b;
        const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
        if (d < score) { score = d; best = i; if (!d) break; }
      }
      cache[key] = best;
      return best;
    };
    const idx = new Uint8Array(w * h);
    // Error rows (current, next) for dithering
    let err0 = new Float32Array((w + 2) * 3), err1 = new Float32Array((w + 2) * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4, o = y * w + x;
        if (transparent && data[p + 3] < 128) { idx[o] = 0; continue; }
        const e = (x + 1) * 3;
        const r = Math.min(255, Math.max(0, data[p] + (dither ? err0[e] : 0)));
        const g = Math.min(255, Math.max(0, data[p + 1] + (dither ? err0[e + 1] : 0)));
        const b = Math.min(255, Math.max(0, data[p + 2] + (dither ? err0[e + 2] : 0)));
        const k = nearest(r | 0, g | 0, b | 0);
        idx[o] = k;
        if (dither) {
          const c = pal[k], er = r - c[0], eg = g - c[1], eb = b - c[2];
          err0[e + 3] += er * 7 / 16; err0[e + 4] += eg * 7 / 16; err0[e + 5] += eb * 7 / 16;
          err1[e - 3] += er * 3 / 16; err1[e - 2] += eg * 3 / 16; err1[e - 1] += eb * 3 / 16;
          err1[e] += er * 5 / 16; err1[e + 1] += eg * 5 / 16; err1[e + 2] += eb * 5 / 16;
          err1[e + 3] += er / 16; err1[e + 4] += eg / 16; err1[e + 5] += eb / 16;
        }
      }
      const t = err0; err0 = err1; err1 = t; err1.fill(0);
    }
    const code = lzw(idx, 8);
    const parts = [];
    const head = new Uint8Array(13 + 768);
    head.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, w & 255, w >> 8, h & 255, h >> 8, 0xf7, 0, 0]);
    for (let i = 0; i < 256; i++) head.set(pal[i], 13 + i * 3);
    parts.push(head);
    if (transparent) parts.push(Uint8Array.from([0x21, 0xf9, 0x04, 0x01, 0, 0, 0, 0]));
    parts.push(Uint8Array.from([0x2c, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8, 0, 8]));
    for (let i = 0; i < code.length; i += 255) {
      const chunk = code.subarray(i, Math.min(code.length, i + 255));
      parts.push(Uint8Array.of(chunk.length), chunk);
    }
    parts.push(Uint8Array.of(0, 0x3b));
    let len = 0;
    for (const p of parts) len += p.length;
    const out = new Uint8Array(len);
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return out;
  }

  function bytesToDataUrl(bytes, mime) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return `data:${mime};base64,${btoa(bin)}`;
  }

  /** GIF stores 16-bit sizes. */
  const GIF_MAX = 65535;

  function _toCanvas(src) {
    if (src && typeof src.getContext === 'function') return src;
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    c.getContext('2d').putImageData(src instanceof ImageData ? src : new ImageData(src.data, src.width, src.height), 0, 0);
    return c;
  }

  function _pixels(src) {
    if (src && typeof src.getContext === 'function') return src.getContext('2d').getImageData(0, 0, src.width, src.height);
    return src;
  }

  function _flatCanvas(canvas, bg = '#ffffff') {
    const f = document.createElement('canvas');
    f.width = canvas.width; f.height = canvas.height;
    const c = f.getContext('2d');
    c.fillStyle = bg; c.fillRect(0, 0, f.width, f.height);
    c.drawImage(canvas, 0, 0);
    return f;
  }

  /**
   * canvas or ImageData → data URL in `ext`. JPG and BMP have no transparency: laid on
   * white. AVIF needs the desktop host when the web view cannot write it ('AVIF_UNAVAILABLE').
   */
  async function encode(src, ext, quality = 0.92, { api = (typeof window !== 'undefined' ? window.electronAPI : null) } = {}) {
    const e = String(ext || 'png').toLowerCase().replace(/^\./, '');
    const mime = MIME[e] || 'image/png';
    if (e === 'gif') {
      const px = _pixels(src);
      if (px.width > GIF_MAX || px.height > GIF_MAX) throw new Error('GIF_TOO_LARGE');
      return bytesToDataUrl(encodeGif(px), mime);
    }
    if (e === 'bmp') return bytesToDataUrl(encodeBmp(_pixels(src)), mime);
    const canvas = _toCanvas(src);
    if (mime === 'image/jpeg') return _flatCanvas(canvas).toDataURL(mime, quality);
    if (mime === 'image/avif') {
      const own = canvas.toDataURL(mime, quality);
      if (own.startsWith('data:image/avif')) return own;
      if (!api || typeof api.encodeAvif !== 'function') throw new Error('AVIF_UNAVAILABLE');
      const r = await api.encodeAvif({ dataUrl: canvas.toDataURL('image/png'), quality: Math.round(quality * 100) });
      if (!r || r.error || !r.dataUrl) throw new Error((r && r.error) || 'AVIF_UNAVAILABLE');
      return r.dataUrl;
    }
    return canvas.toDataURL(mime, quality);
  }

  return { MIME, encode, encodeGif, encodeBmp, quantize, lzw, bytesToDataUrl };
}));
