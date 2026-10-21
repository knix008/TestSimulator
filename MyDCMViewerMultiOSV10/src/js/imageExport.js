/* Image export to (almost) every image file format — runs in the browser and in Node (tests).
 *
 *   ImageExport.FORMATS                         → [{ id, label, ext, exts, mime, group, kinds, options, available, isAvailable(), notes }]
 *   ImageExport.encode(id, input, options)      → Promise<Uint8Array>            (two-file formats → one ZIP)
 *   ImageExport.encodeFiles(id, input, options) → Promise<[{ name, data }]>      (two-file formats → both files)
 *   ImageExport.isAvailable(id)                 → Promise<boolean>
 *   ImageExport.get(id) / byExt('nii.gz') / defaults(id) / setVendorBase(url) / fitSquare(rgba, w, h, size)
 *
 * input = { width, height,
 *           rgba?:   Uint8ClampedArray (RGBA, what the viewer shows),
 *           gray?:   Float32Array | Uint16Array | Int16Array | Uint8Array (raw values, one channel),
 *           frames?: [{ rgba?, gray? } | typed array]  (multi-frame / volume; same size as the first),
 *           rgb16?:  Uint16Array (RGB, 3 samples / pixel, optional for 16-bit colour PNG),
 *           spacing?: [row mm, col mm], sliceThickness?, dpi?, name? }
 *
 * 8-bit formats use rgba (gray is windowed min..max when only gray is given); alpha-less formats composite
 * over white. 16-bit / float / volume formats use gray (rgba luminance when absent). Integer formats that
 * cannot hold the raw values ('range: auto') shift negative integers up by -min and stretch floats to the
 * full range; 'range: stretch' always maps min..max to the full range.
 * Codecs: pako (zlib), @cornerstonejs/codec-openjpeg + codec-charls full builds (JPEG 2000 / JPEG-LS encoders,
 * classic scripts), @jsquash/avif, jxl, webp (ES modules + .wasm, loaded with import()), WebCodecs HEVC (HEIC).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ImageExport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const IS_NODE = typeof process !== 'undefined' && !!(process.versions && process.versions.node) && typeof window === 'undefined';
  const G = typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : {};
  const SELF_URL = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : null;

  /* ── Vendor modules ── */
  let vendorBase = null;
  const cache = {};
  function setVendorBase(url) { vendorBase = url; }
  function base() {
    if (vendorBase) return vendorBase;
    try { return new URL('vendor/', document.baseURI).href; } catch { return 'vendor/'; }
  }
  function once(key, fn) {
    if (!cache[key]) cache[key] = fn().catch((err) => { delete cache[key]; throw err; });
    return cache[key];
  }
  function nodeFile(pkg, file) {
    const path = require('path'), fs = require('fs');
    for (const dir of [path.join(__dirname, '..', '..', 'node_modules'), ...(require.resolve.paths(pkg) || [])]) {
      const p = path.join(dir, pkg, file);
      if (fs.existsSync(p)) return p;
    }
    throw new Error(`${pkg}/${file} not found — run npm install`);
  }
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url; s.async = false;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Could not load ${url}`));
      document.head.appendChild(s);
    });
  }
  const pako = () => once('pako', async () => {
    if (IS_NODE) return require('pako');
    if (!G.pako) await loadScript(base() + 'pako/dist/pako.min.js');
    return G.pako;
  });
  const encoders = () => once('encoders', async () => {
    if (IS_NODE) return require('./encoders.js');
    if (!G.Encoders) await loadScript(SELF_URL ? new URL('encoders.js', SELF_URL).href : 'js/encoders.js');
    return G.Encoders;
  });
  // Full (encoder + decoder) builds; they define the same global as the decode-only builds, which they replace.
  const CS = { j2k: ['@cornerstonejs/codec-openjpeg', 'dist/openjpegjs.js', 'OpenJPEGJS'], jls: ['@cornerstonejs/codec-charls', 'dist/charlsjs.js', 'CharLS'] };
  const cornerstone = (kind) => once('cs-' + kind, async () => {
    const [pkg, file, name] = CS[kind];
    let factory;
    if (IS_NODE) factory = require(nodeFile(pkg, file));
    else { await loadScript(base() + pkg + '/' + file); factory = G[name]; }
    if (factory && factory.default) factory = factory.default;
    if (typeof factory !== 'function') throw new Error(`${pkg} did not load`);
    return factory({ print() {}, printErr() {} });
  });
  const JSQ = { avif: ['@jsquash/avif', 'codec/enc/avif_enc'], jxl: ['@jsquash/jxl', 'codec/enc/jxl_enc'], webp: ['@jsquash/webp', 'codec/enc/webp_enc'] };
  const jsquash = (kind) => once('jsq-' + kind, async () => {
    const [pkg, file] = JSQ[kind];
    let factory, wasmBinary;
    if (IS_NODE) {
      factory = (await import(require('url').pathToFileURL(nodeFile(pkg, file + '.js')).href)).default;
      wasmBinary = require('fs').readFileSync(nodeFile(pkg, file + '.wasm'));
    } else {
      const url = base() + pkg + '/' + file;
      factory = (await import(url + '.js')).default;
      const r = await fetch(url + '.wasm');
      if (!r.ok) throw new Error(`Could not load ${url}.wasm (${r.status})`);
      wasmBinary = new Uint8Array(await r.arrayBuffer());
    }
    return factory({ noInitialRun: true, wasmBinary, print() {}, printErr() {} });
  });

  /* ── Bytes ── */
  class Bytes {
    constructor(n = 4096) { this.buf = new Uint8Array(Math.max(16, Math.ceil(n))); this.length = 0; this.dv = new DataView(this.buf.buffer); }
    ensure(n) {
      if (this.length + n <= this.buf.length) return;
      let m = this.buf.length * 2;
      while (m < this.length + n) m *= 2;
      const b = new Uint8Array(m); b.set(this.buf.subarray(0, this.length));
      this.buf = b; this.dv = new DataView(b.buffer);
    }
    u8(v) { this.ensure(1); this.buf[this.length++] = v; return this; }
    u16(v, le) { this.ensure(2); this.dv.setUint16(this.length, v, le); this.length += 2; return this; }
    i16(v, le) { this.ensure(2); this.dv.setInt16(this.length, v, le); this.length += 2; return this; }
    u32(v, le) { this.ensure(4); this.dv.setUint32(this.length, v >>> 0, le); this.length += 4; return this; }
    i32(v, le) { this.ensure(4); this.dv.setInt32(this.length, v, le); this.length += 4; return this; }
    f32(v, le) { this.ensure(4); this.dv.setFloat32(this.length, v, le); this.length += 4; return this; }
    u64(v, le) { this.ensure(8); this.dv.setBigUint64(this.length, BigInt(v), le); this.length += 8; return this; }
    bytes(a) { this.ensure(a.length); this.buf.set(a, this.length); this.length += a.length; return this; }
    str(s) { this.ensure(s.length); for (let i = 0; i < s.length; i++) this.buf[this.length++] = s.charCodeAt(i) & 255; return this; }
    zeros(n) { this.ensure(n); this.buf.fill(0, this.length, this.length + n); this.length += n; return this; }
    align(n) { while (this.length % n) this.u8(0); return this; }
    put32(at, v, le) { this.dv.setUint32(at, v >>> 0, le); }
    put16(at, v, le) { this.dv.setUint16(at, v, le); }
    done() { return this.buf.slice(0, this.length); }
  }
  const ascii = (s) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
  const concat = (parts) => { let n = 0; for (const p of parts) n += p.length; const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
  function base64(b) {
    const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let s = '';
    for (let i = 0; i < b.length; i += 3) {
      const n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
      s += T[n >> 18] + T[(n >> 12) & 63] + (i + 1 < b.length ? T[(n >> 6) & 63] : '=') + (i + 2 < b.length ? T[n & 63] : '=');
    }
    return s;
  }
  const CRC_TABLE = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
  function crc32(data, prev = 0) { let c = ~prev; for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 255] ^ (c >>> 8); return ~c >>> 0; }

  /* ── Pixel preparation ── */
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const isFloatArr = (a) => a instanceof Float32Array || a instanceof Float64Array;
  const isU8 = (a) => a instanceof Uint8Array || a instanceof Uint8ClampedArray;
  function rangeOf(arrs) {
    let lo = Infinity, hi = -Infinity, integral = true;
    for (const a of arrs) {
      const fl = isFloatArr(a);
      for (let i = 0; i < a.length; i++) {
        const v = a[i];
        if (v !== v) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
        if (fl && integral && v !== Math.round(v)) integral = false;
      }
    }
    if (lo === Infinity) { lo = 0; hi = 0; }
    return { lo, hi, integral };
  }
  function flatten(rgba) {      // composite over white
    const out = new Uint8ClampedArray(rgba.length);
    for (let i = 0; i < rgba.length; i += 4) {
      const a = rgba[i + 3];
      if (a === 255) { out[i] = rgba[i]; out[i + 1] = rgba[i + 1]; out[i + 2] = rgba[i + 2]; }
      else { const k = 255 - a; out[i] = Math.round((rgba[i] * a + 255 * k) / 255); out[i + 1] = Math.round((rgba[i + 1] * a + 255 * k) / 255); out[i + 2] = Math.round((rgba[i + 2] * a + 255 * k) / 255); }
      out[i + 3] = 255;
    }
    return out;
  }
  function luminance(rgba) {
    const n = rgba.length >> 2, out = new Uint8Array(n);
    for (let i = 0, s = 0; i < n; i++, s += 4) out[i] = Math.round((rgba[s] * 299 + rgba[s + 1] * 587 + rgba[s + 2] * 114) / 1000);
    return out;
  }
  function frameList(input) {
    const n = input.width * input.height;
    const norm = (f) => {
      if (!f) return {};
      if (ArrayBuffer.isView(f)) return (isU8(f) && f.length === n * 4) ? { rgba: f } : { gray: f };
      return { rgba: f.rgba || null, gray: f.gray || null };
    };
    if (input.frames && input.frames.length) return input.frames.map(norm);
    return [norm({ rgba: input.rgba, gray: input.gray })];
  }
  const safeName = (s) => String(s || 'image').replace(/\.[a-z0-9]{1,5}(\.gz)?$/i, '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 120) || 'image';

  function prep(input) {
    if (!input || !(input.width >= 1) || !(input.height >= 1)) throw new Error('ImageExport: width and height are required');
    const w = input.width | 0, h = input.height | 0, n = w * h;
    const frames = frameList(input);
    frames.forEach((f, i) => {
      if (!f.rgba && !f.gray) throw new Error(`ImageExport: frame ${i} has no pixels (rgba or gray)`);
      if (f.rgba && f.rgba.length < n * 4) throw new Error(`ImageExport: frame ${i} rgba is too short`);
      if (f.gray && f.gray.length < n) throw new Error(`ImageExport: frame ${i} gray is too short`);
    });
    const hasGray = frames.every((f) => f.gray);
    const range = hasGray ? rangeOf(frames.map((f) => f.gray)) : null;
    const memo = new Map();
    const m = (k, fn) => { if (!memo.has(k)) memo.set(k, fn()); return memo.get(k); };
    const sp = Array.isArray(input.spacing) ? input.spacing.map(Number) : [];
    const ctx = {
      w, h, n, count: frames.length, frames, hasGray, range, rgb16: input.rgb16 || null,
      name: safeName(input.name), dpi: input.dpi > 0 ? +input.dpi : 0,
      sx: sp[1] > 0 ? sp[1] : 1, sy: sp[0] > 0 ? sp[0] : 1, sz: input.sliceThickness > 0 ? +input.sliceThickness : 1,
      hasSpacing: sp[0] > 0 && sp[1] > 0,
      gray8w: (i) => m('g8w' + i, () => {   // windowed raw grey (min..max → 0..255)
        const g = frames[i].gray, out = new Uint8Array(n);
        const { lo, hi } = range, k = hi > lo ? 255 / (hi - lo) : 0;
        if (isU8(g) && hi <= 255) { out.set(g.subarray(0, n)); return out; }
        for (let j = 0; j < n; j++) out[j] = Math.round((g[j] - lo) * k);
        return out;
      }),
      rgba: (i = 0) => m('rgba' + i, () => {
        if (frames[i].rgba) { const r = frames[i].rgba; return r instanceof Uint8ClampedArray && r.length === n * 4 ? r : new Uint8ClampedArray(r.buffer, r.byteOffset, n * 4); }
        const g = ctx.gray8w(i), out = new Uint8ClampedArray(n * 4);
        for (let j = 0; j < n; j++) { out[j * 4] = out[j * 4 + 1] = out[j * 4 + 2] = g[j]; out[j * 4 + 3] = 255; }
        return out;
      }),
      flat: (i = 0) => m('flat' + i, () => (ctx.alpha(i) ? flatten(ctx.rgba(i)) : ctx.rgba(i))),
      gray8: (i = 0) => m('g8' + i, () => (frames[i].rgba ? luminance(ctx.flat(i)) : ctx.gray8w(i))),
      alpha: (i = 0) => m('a' + i, () => { const r = ctx.rgba(i); for (let j = 3; j < r.length; j += 4) if (r[j] !== 255) return true; return false; }),
      anyAlpha: () => frames.some((_, i) => ctx.alpha(i)),
      isGrey: (i = 0) => m('grey' + i, () => { const r = ctx.rgba(i); for (let j = 0; j < r.length; j += 4) if (r[j] !== r[j + 1] || r[j] !== r[j + 2]) return false; return true; }),
    };
    return ctx;
  }

  // One grey frame as 16-bit samples: { data: Uint16Array | Int16Array, signed }
  function gray16(ctx, i, o, allowSigned) {
    const n = ctx.n, g = ctx.frames[i].gray;
    if (!g) { const l = ctx.gray8(i), u = new Uint16Array(n); for (let j = 0; j < n; j++) u[j] = l[j] * 257; return { data: u, signed: false }; }
    const { lo, hi, integral } = ctx.range;
    if (o.range !== 'stretch') {
      if (g instanceof Uint16Array) return { data: g.subarray(0, n), signed: false };
      if (g instanceof Int16Array && allowSigned && lo < 0) return { data: g.subarray(0, n), signed: true };
      if (isU8(g)) { const u = new Uint16Array(n); for (let j = 0; j < n; j++) u[j] = g[j] * 257; return { data: u, signed: false }; }
      if (integral && lo >= -2147483648 && hi - Math.min(lo, 0) <= 65535) {
        if (allowSigned && lo < 0 && lo >= -32768 && hi <= 32767) { const s = new Int16Array(n); for (let j = 0; j < n; j++) s[j] = g[j]; return { data: s, signed: true }; }
        const off = lo < 0 ? -lo : 0, u = new Uint16Array(n);
        for (let j = 0; j < n; j++) u[j] = g[j] + off;
        return { data: u, signed: false };
      }
    }
    const k = hi > lo ? 65535 / (hi - lo) : 0, u = new Uint16Array(n);
    for (let j = 0; j < n; j++) u[j] = clamp(Math.round((g[j] - lo) * k), 0, 65535);
    return { data: u, signed: false };
  }
  // Floats for HDR formats: [R, G, B, A?] planes (sRGB → linear when asked) or one grey plane of raw values.
  const srgbLin = (() => { const t = new Float32Array(256); for (let i = 0; i < 256; i++) { const c = i / 255; t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); } return t; })();
  function floatPlanes(ctx, i, o, withAlpha) {
    const n = ctx.n;
    if (ctx.frames[i].gray && ctx.hasGray) { const p = new Float32Array(n); const g = ctx.frames[i].gray; for (let j = 0; j < n; j++) p[j] = g[j]; return { gray: true, planes: [p] }; }
    const alpha = withAlpha && ctx.alpha(i);
    const src = alpha ? ctx.rgba(i) : ctx.flat(i);
    const lin = o.linear !== false;
    const planes = [0, 1, 2, 3].slice(0, alpha ? 4 : 3).map(() => new Float32Array(n));
    for (let j = 0, s = 0; j < n; j++, s += 4) {
      for (let c = 0; c < 3; c++) planes[c][j] = lin ? srgbLin[src[s + c]] : src[s + c] / 255;
      if (alpha) planes[3][j] = src[s + 3] / 255;
    }
    return { gray: false, planes, alpha };
  }

  /* ── PNG / APNG ── */
  function pngChunk(out, type, data) {
    const t = ascii(type);
    out.u32(data.length).bytes(t).bytes(data).u32(crc32(data, crc32(t)));
  }
  function pngFilter(src, w, h, bpp) {        // adaptive filter per row (minimum sum of absolute differences)
    const stride = w * bpp, out = new Uint8Array((stride + 1) * h);
    const cand = [null, new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride)];
    for (let y = 0; y < h; y++) {
      const r = y * stride, p = r - stride;
      let best = 0, bestSum = 0;
      for (let x = 0; x < stride; x++) { const v = src[r + x]; bestSum += v < 128 ? v : 256 - v; }
      for (let f = 1; f <= 4; f++) {
        const t = cand[f];
        let sum = 0, x = 0;
        for (; x < stride && sum < bestSum; x++) {
          const a = x >= bpp ? src[r + x - bpp] : 0, b = y ? src[p + x] : 0, c = x >= bpp && y ? src[p + x - bpp] : 0;
          let pred;
          if (f === 1) pred = a;
          else if (f === 2) pred = b;
          else if (f === 3) pred = (a + b) >> 1;
          else { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
          const v = (src[r + x] - pred) & 255;
          t[x] = v; sum += v < 128 ? v : 256 - v;
        }
        if (x === stride && sum < bestSum) { best = f; bestSum = sum; }
      }
      const o = y * (stride + 1);
      out[o] = best;
      out.set(best ? cand[best] : src.subarray(r, r + stride), o + 1);
    }
    return out;
  }
  // samples: Uint8Array (8-bit) or Uint16Array (16-bit) → big-endian packed bytes
  function pngSamples(samples, depth) {
    if (depth === 8) return samples;
    const b = new Uint8Array(samples.length * 2);
    for (let i = 0; i < samples.length; i++) { b[i * 2] = samples[i] >> 8; b[i * 2 + 1] = samples[i] & 255; }
    return b;
  }
  const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  function pngIHDR(w, h, depth, ctype) {
    const b = new Bytes(13); b.u32(w).u32(h).u8(depth).u8(ctype).u8(0).u8(0).u8(0); return b.done();
  }
  function pngPHYs(dpi) { const ppm = Math.round(dpi / 0.0254); const b = new Bytes(9); b.u32(ppm).u32(ppm).u8(1); return b.done(); }
  function pngData(P, samples, w, h, channels, depth, level) {
    return P.deflate(pngFilter(pngSamples(samples, depth), w, h, channels * depth / 8), { level });
  }
  function pngSync(P, { w, h, samples, channels, depth, level = 6, dpi }) {
    const ctype = { 1: 0, 2: 4, 3: 2, 4: 6 }[channels];
    const out = new Bytes(samples.length + 1024);
    out.bytes(PNG_SIG);
    pngChunk(out, 'IHDR', pngIHDR(w, h, depth, ctype));
    if (dpi) pngChunk(out, 'pHYs', pngPHYs(dpi));
    pngChunk(out, 'IDAT', pngData(P, samples, w, h, channels, depth, level));
    pngChunk(out, 'IEND', new Uint8Array(0));
    return out.done();
  }
  const pngRGBA8 = (P, rgba, w, h, level) => pngSync(P, { w, h, samples: new Uint8Array(rgba.buffer, rgba.byteOffset, w * h * 4), channels: 4, depth: 8, level });
  function pickChannels(rgba, n, mode, alpha, grey) {
    const ch = mode === 'rgba' ? 4 : mode === 'rgb' ? 3 : mode === 'gray' ? 1 : alpha ? 4 : grey ? 1 : 3;
    if (ch === 4) return { ch, data: new Uint8Array(rgba.buffer, rgba.byteOffset, n * 4) };
    const out = new Uint8Array(n * ch);
    if (ch === 3) for (let i = 0; i < n; i++) { out[i * 3] = rgba[i * 4]; out[i * 3 + 1] = rgba[i * 4 + 1]; out[i * 3 + 2] = rgba[i * 4 + 2]; }
    return { ch, data: out };
  }
  async function png(ctx, o) {
    const P = await pako();
    const { w, h, n } = ctx, level = clamp(o.level | 0, 0, 9);
    if (o.depth === '16') {
      const useGray = o.color === 'gray' || (o.color === 'auto' && (ctx.hasGray || ctx.isGrey(0)));
      if (useGray) return pngSync(P, { w, h, samples: gray16(ctx, 0, o, false).data, channels: 1, depth: 16, level, dpi: ctx.dpi });
      const alpha = o.color === 'rgba' || (o.color === 'auto' && ctx.alpha(0));
      const ch = alpha ? 4 : 3, src = alpha ? ctx.rgba(0) : ctx.flat(0), s = new Uint16Array(n * ch);
      for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) s[i * ch + c] = c < 3 && ctx.rgb16 ? ctx.rgb16[i * 3 + c] : src[i * 4 + c] * 257;
      return pngSync(P, { w, h, samples: s, channels: ch, depth: 16, level, dpi: ctx.dpi });
    }
    const alpha = o.color === 'rgba' || (o.color === 'auto' && ctx.alpha(0));
    if (o.color === 'gray' || (o.color === 'auto' && !alpha && ctx.isGrey(0))) return pngSync(P, { w, h, samples: ctx.gray8(0), channels: 1, depth: 8, level, dpi: ctx.dpi });
    const { ch, data } = pickChannels(alpha ? ctx.rgba(0) : ctx.flat(0), n, alpha ? 'rgba' : 'rgb');
    return pngSync(P, { w, h, samples: data, channels: ch, depth: 8, level, dpi: ctx.dpi });
  }
  async function apng(ctx, o) {
    const P = await pako();
    const { w, h, n, count } = ctx, level = clamp(o.level | 0, 0, 9);
    const alpha = ctx.anyAlpha(), ch = alpha ? 4 : 3;
    const delay = clamp(Math.round(o.delayMs) || 100, 1, 65535);
    const out = new Bytes(n * ch * count + 1024);
    out.bytes(PNG_SIG);
    pngChunk(out, 'IHDR', pngIHDR(w, h, 8, alpha ? 6 : 2));
    const ac = new Bytes(8); ac.u32(count).u32(o.loop | 0); pngChunk(out, 'acTL', ac.done());
    let seq = 0;
    for (let f = 0; f < count; f++) {
      const fc = new Bytes(26);
      fc.u32(seq++).u32(w).u32(h).u32(0).u32(0).u16(delay).u16(1000).u8(0).u8(0);
      pngChunk(out, 'fcTL', fc.done());
      const data = pngData(P, pickChannels(alpha ? ctx.rgba(f) : ctx.flat(f), n, alpha ? 'rgba' : 'rgb').data, w, h, ch, 8, level);
      if (f === 0) pngChunk(out, 'IDAT', data);
      else { const fd = new Bytes(data.length + 4); fd.u32(seq++).bytes(data); pngChunk(out, 'fdAT', fd.done()); }
    }
    pngChunk(out, 'IEND', new Uint8Array(0));
    return out.done();
  }

  /* ── JPEG (baseline or progressive, 4:4:4, standard Huffman tables) ── */
  const JPEG = (() => {
    const ZZ = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
    const QL = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
    const QC = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99].concat(new Array(32).fill(99));
    const seq = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };
    const tail = (starts) => starts.flatMap(([a, b]) => seq(a, b));
    const DC_VALS = seq(0, 11);
    const AC_L_VALS = [0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a]
      .concat(tail([[0x16, 0x1a], [0x25, 0x2a], [0x34, 0x3a], [0x43, 0x4a], [0x53, 0x5a], [0x63, 0x6a], [0x73, 0x7a], [0x83, 0x8a], [0x92, 0x9a], [0xa2, 0xaa], [0xb2, 0xba], [0xc2, 0xca], [0xd2, 0xda], [0xe1, 0xea], [0xf1, 0xfa]]));
    const AC_C_VALS = [0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a]
      .concat(tail([[0x26, 0x2a], [0x35, 0x3a], [0x43, 0x4a], [0x53, 0x5a], [0x63, 0x6a], [0x73, 0x7a], [0x82, 0x8a], [0x92, 0x9a], [0xa2, 0xaa], [0xb2, 0xba], [0xc2, 0xca], [0xd2, 0xda], [0xe2, 0xea], [0xf2, 0xfa]]));
    const HT = [
      { cls: 0, id: 0, bits: [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], vals: DC_VALS },
      { cls: 1, id: 0, bits: [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d], vals: AC_L_VALS },
      { cls: 0, id: 1, bits: [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], vals: DC_VALS },
      { cls: 1, id: 1, bits: [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77], vals: AC_C_VALS },
    ];
    for (const t of HT) {
      t.code = new Uint16Array(256); t.len = new Uint8Array(256);
      let c = 0, k = 0;
      for (let l = 1; l <= 16; l++) { for (let i = 0; i < t.bits[l - 1]; i++) { t.code[t.vals[k]] = c; t.len[t.vals[k]] = l; c++; k++; } c <<= 1; }
    }
    const COS = new Float64Array(64);
    for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) COS[u * 8 + x] = (u ? 1 : Math.SQRT1_2) * Math.cos(((2 * x + 1) * u * Math.PI) / 16) / 2;
    const qtable = (b, q) => { const s = q < 50 ? 5000 / q : 200 - 2 * q; return b.map((v) => clamp(Math.floor((v * s + 50) / 100), 1, 255)); };
    const nbits = (v) => { v = v < 0 ? -v : v; let n = 0; while (v) { n++; v >>= 1; } return n; };

    function encode({ width: W, height: H, rgba, quality = 90, progressive = false, gray = false, dpi = 0 }) {
      const q = clamp(Math.round(quality), 1, 100);
      const qts = [qtable(QL, q), qtable(QC, q)];
      const nc = gray ? 1 : 3, bw = Math.ceil(W / 8), bh = Math.ceil(H / 8), nb = bw * bh;
      const coef = [0, 1, 2].slice(0, nc).map(() => new Int16Array(nb * 64));
      const blk = [new Float64Array(64), new Float64Array(64), new Float64Array(64)], tmp = new Float64Array(64);
      for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
        for (let y = 0; y < 8; y++) {
          const sy = Math.min(H - 1, by * 8 + y);
          for (let x = 0; x < 8; x++) {
            const s = (sy * W + Math.min(W - 1, bx * 8 + x)) * 4, r = rgba[s], g = rgba[s + 1], b = rgba[s + 2], k = y * 8 + x;
            blk[0][k] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
            if (!gray) { blk[1][k] = -0.168736 * r - 0.331264 * g + 0.5 * b; blk[2][k] = 0.5 * r - 0.418688 * g - 0.081312 * b; }
          }
        }
        const b0 = (by * bw + bx) * 64;
        for (let c = 0; c < nc; c++) {
          const f = blk[c], qt = qts[c ? 1 : 0], dst = coef[c];
          for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) { let s = 0; for (let x = 0; x < 8; x++) s += COS[u * 8 + x] * f[y * 8 + x]; tmp[y * 8 + u] = s; }
          for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) { let s = 0; for (let y = 0; y < 8; y++) s += COS[v * 8 + y] * tmp[y * 8 + u]; f[v * 8 + u] = s; }
          for (let i = 0; i < 64; i++) { const k = ZZ[i]; dst[b0 + i] = Math.round(f[k] / qt[k]); }
        }
      }
      const out = new Bytes(nb * 64 * nc + 2048);
      const seg = (marker, body) => { out.u16(marker).u16(body.length + 2).bytes(body); };
      out.u16(0xFFD8);
      const app = new Bytes(14); app.str('JFIF\0').u8(1).u8(2).u8(dpi ? 1 : 0).u16(dpi ? Math.round(dpi) : 1).u16(dpi ? Math.round(dpi) : 1).u8(0).u8(0);
      seg(0xFFE0, app.done());
      const dqt = new Bytes(130);
      for (let t = 0; t < (gray ? 1 : 2); t++) { dqt.u8(t); for (let i = 0; i < 64; i++) dqt.u8(qts[t][ZZ[i]]); }
      seg(0xFFDB, dqt.done());
      const sof = new Bytes(16); sof.u8(8).u16(H).u16(W).u8(nc);
      for (let c = 0; c < nc; c++) sof.u8(c + 1).u8(0x11).u8(c ? 1 : 0);
      seg(progressive ? 0xFFC2 : 0xFFC0, sof.done());
      const dht = new Bytes(512);
      for (const t of HT) { if (gray && t.id) continue; dht.u8((t.cls << 4) | t.id); t.bits.forEach((b) => dht.u8(b)); t.vals.forEach((v) => dht.u8(v)); }
      seg(0xFFC4, dht.done());
      let acc = 0, nacc = 0;
      const put = (code, len) => {
        acc = (acc << len) | code; nacc += len;
        while (nacc >= 8) { const b = (acc >>> (nacc - 8)) & 255; out.u8(b); if (b === 255) out.u8(0); nacc -= 8; }
        acc &= (1 << nacc) - 1;
      };
      const putVal = (v, s) => { if (s) put(v < 0 ? v + (1 << s) - 1 : v, s); };
      const scan = (comps, Ss, Se) => {
        const sos = new Bytes(12); sos.u8(comps.length);
        comps.forEach((c) => sos.u8(c + 1).u8(c ? 0x11 : 0x00));
        sos.u8(Ss).u8(Se).u8(0);
        seg(0xFFDA, sos.done());
        const pred = [0, 0, 0];
        for (let b = 0; b < nb; b++) for (const c of comps) {
          const d = coef[c], b0 = b * 64, dc = HT[c ? 2 : 0], ac = HT[c ? 3 : 1];
          if (Ss === 0) { const diff = d[b0] - pred[c]; pred[c] = d[b0]; const s = nbits(diff); put(dc.code[s], dc.len[s]); putVal(diff, s); }
          let run = 0;
          for (let k = Math.max(1, Ss); k <= Se; k++) {
            const v = d[b0 + k];
            if (v === 0) { run++; continue; }
            while (run > 15) { put(ac.code[0xF0], ac.len[0xF0]); run -= 16; }
            const s = nbits(v), sym = (run << 4) | s;
            put(ac.code[sym], ac.len[sym]); putVal(v, s); run = 0;
          }
          if (run > 0) put(ac.code[0], ac.len[0]);
        }
        if (nacc > 0) put((1 << (8 - nacc)) - 1, 8 - nacc);
      };
      const all = coef.map((_, c) => c);
      if (!progressive) scan(all, 0, 63);
      else { scan(all, 0, 0); for (const c of all) { scan([c], 1, 5); scan([c], 6, 63); } }
      out.u16(0xFFD9);
      return out.done();
    }
    return { encode };
  })();
  async function jpeg(ctx, o, frame = 0) {
    return JPEG.encode({ width: ctx.w, height: ctx.h, rgba: ctx.flat(frame), quality: o.quality, progressive: !!o.progressive, gray: !!o.grayscale, dpi: ctx.dpi });
  }

  /* ── Canvas (browser) ── */
  async function canvasEncode(rgba, w, h, mime, quality) {
    if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') throw new Error('no canvas');
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
    const blob = cv.convertToBlob ? await cv.convertToBlob({ type: mime, quality }) : await new Promise((r) => cv.toBlob(r, mime, quality));
    if (!blob || blob.type !== mime) throw new Error(`${mime} is not supported by this browser's canvas`);
    return new Uint8Array(await blob.arrayBuffer());
  }

  /* ── WebP / AVIF / JPEG XL (libwebp, libavif + aom, libjxl in wasm) ── */
  async function webp(ctx, o) {
    const lossless = !!o.lossless, q = clamp(Math.round(o.quality), 0, 100);
    if (!IS_NODE && !lossless && o.encoder !== 'wasm') {
      try { return await canvasEncode(ctx.rgba(0), ctx.w, ctx.h, 'image/webp', q / 100); } catch { /* wasm below */ }
    }
    const m = await jsquash('webp');
    const opts = { quality: q, target_size: 0, target_PSNR: 0, method: 4, sns_strength: 50, filter_strength: 60, filter_sharpness: 0, filter_type: 1, partitions: 0, segments: 4, pass: 1, show_compressed: 0, preprocessing: 0, autofilter: 0, partition_limit: 0, alpha_compression: 1, alpha_filtering: 1, alpha_quality: 100, lossless: lossless ? 1 : 0, exact: lossless ? 1 : 0, image_hint: 0, emulate_jpeg_size: 0, thread_level: 0, low_memory: 0, near_lossless: 100, use_delta_palette: 0, use_sharp_yuv: 0 };
    const r = m.encode(ctx.rgba(0), ctx.w, ctx.h, opts);
    if (!r) throw new Error('WebP encoding failed');
    return new Uint8Array(r);
  }
  async function avif(ctx, o) {
    const m = await jsquash('avif');
    const lossless = !!o.lossless, depth = +o.depth || 8, n = ctx.n;
    const opts = { quality: lossless ? 100 : clamp(Math.round(o.quality), 0, 100), qualityAlpha: -1, denoiseLevel: 0, tileColsLog2: 0, tileRowsLog2: 0, speed: clamp(o.speed | 0, 0, 10), subsample: lossless || o.chroma !== '420' ? 3 : 1,   /* 4:4:4 unless asked: thin coloured lines and labels survive */ chromaDeltaQ: false, sharpness: 0, tune: 0, enableSharpYUV: false, bitDepth: depth, lossless };
    let data;
    if (depth === 8) { const r = ctx.rgba(0); data = new Uint8Array(r.buffer, r.byteOffset, n * 4); }
    else {   // 10 / 12-bit: grey (raw values scaled into the bit depth) or rgba
      const max = (1 << depth) - 1, px = new Uint16Array(n * 4);
      if (ctx.hasGray) { const g = gray16(ctx, 0, o, false).data; for (let i = 0; i < n; i++) { const v = Math.round(g[i] * max / 65535); px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v; px[i * 4 + 3] = max; } }
      else { const r = ctx.rgba(0); for (let i = 0; i < n * 4; i++) px[i] = Math.round(r[i] * max / 255); }
      data = new Uint8Array(px.buffer);
    }
    const r = m.encode(data, ctx.w, ctx.h, opts);
    if (!r) throw new Error('AVIF encoding failed');
    return new Uint8Array(r);
  }
  async function jxl(ctx, o) {
    const m = await jsquash('jxl');
    const lossless = !!o.lossless;
    const opts = { effort: clamp(o.effort | 0, 1, 9), quality: lossless ? 100 : clamp(Math.round(o.quality), 0, 100), progressive: false, epf: -1, lossyPalette: false, decodingSpeedTier: 0, photonNoiseIso: 0, lossyModular: false, lossless };
    const r = m.encode(ctx.rgba(0), ctx.w, ctx.h, opts);
    if (!r) throw new Error('JPEG XL encoding failed');
    return new Uint8Array(r);
  }

  /* ── HEIC: WebCodecs HEVC key frame in a HEIF container (ftyp / meta / mdat) ── */
  const HEVC_MIN = 128;
  function hevcCodec(w, h) {
    const s = w * h;
    const level = s <= 983040 ? 93 : s <= 2228224 ? 120 : s <= 8912896 ? 150 : 180;
    return `hvc1.1.6.L${level}.B0`;
  }
  function heicDims(w, h) { return { cw: Math.max(HEVC_MIN, w + (w & 1)), ch: Math.max(HEVC_MIN, h + (h & 1)) }; }
  async function heicAvailable() {
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return false;
    try { const s = await VideoEncoder.isConfigSupported({ codec: hevcCodec(512, 512), width: 512, height: 512, hevc: { format: 'hevc' } }); return !!s.supported; } catch { return false; }
  }
  function box(type, ...parts) { const body = concat(parts); const b = new Bytes(body.length + 8); b.u32(body.length + 8).str(type).bytes(body); return b.done(); }
  function fullBox(type, version, flags, ...parts) { const h = new Bytes(4); h.u8(version).u8((flags >> 16) & 255).u8((flags >> 8) & 255).u8(flags & 255); return box(type, h.done(), ...parts); }
  const NCLX = { primaries: { bt709: 1, bt470bg: 5, smpte170m: 6, bt2020: 9, smpte432: 12 }, transfer: { bt709: 1, smpte170m: 6, 'iec61966-2-1': 13, linear: 8, pq: 16, hlg: 18 }, matrix: { rgb: 0, bt709: 1, bt470bg: 5, smpte170m: 6, 'bt2020-ncl': 9 } };
  function heifContainer({ brand, itemType, config, w, h, cw, ch, data, colorSpace }) {
    const ftyp = box('ftyp', ascii(brand), new Uint8Array(4), ascii('mif1' + brand + 'miaf'));
    const hdlr = fullBox('hdlr', 0, 0, new Uint8Array(4), ascii('pict'), new Uint8Array(12), new Uint8Array(1));
    const pitm = fullBox('pitm', 0, 0, new Uint8Array([0, 1]));
    const infe = fullBox('infe', 2, 0, new Uint8Array([0, 1, 0, 0]), ascii(itemType), new Uint8Array(1));
    const iinf = fullBox('iinf', 0, 0, new Uint8Array([0, 1]), infe);
    const props = [config];
    const ispe = new Bytes(8); ispe.u32(cw).u32(ch); props.push(fullBox('ispe', 0, 0, ispe.done()));
    props.push(fullBox('pixi', 0, 0, new Uint8Array([3, 8, 8, 8])));
    if (colorSpace && colorSpace.matrix) {
      const c = new Bytes(7);
      c.u16(NCLX.primaries[colorSpace.primaries] || 2).u16(NCLX.transfer[colorSpace.transfer] || 2).u16(NCLX.matrix[colorSpace.matrix] ?? 2).u8(colorSpace.fullRange ? 0x80 : 0);
      props.push(box('colr', ascii('nclx'), c.done()));
    }
    if (cw !== w || ch !== h) {   // clean aperture: crop the padded picture back to w × h from the top-left corner
      const c = new Bytes(32); c.u32(w).u32(1).u32(h).u32(1).i32(w - cw).u32(2).i32(h - ch).u32(2);
      props.push(box('clap', c.done()));
    }
    const ipco = box('ipco', ...props);
    const assoc = new Bytes(16); assoc.u32(1).u16(1).u8(props.length);
    props.forEach((p, i) => { const t = String.fromCharCode(...p.subarray(4, 8)); assoc.u8(((t === 'hvcC' || t === 'av1C' || t === 'clap') ? 0x80 : 0) | (i + 1)); });
    const ipma = fullBox('ipma', 0, 0, assoc.done());
    const iprp = box('iprp', ipco, ipma);
    const ilocBody = (offset) => { const b = new Bytes(18); b.u8(0x44).u8(0x00).u16(1).u16(1).u16(0).u16(1).u32(offset).u32(data.length); return b.done(); };
    const metaLen = fullBox('meta', 0, 0, hdlr, pitm, fullBox('iloc', 0, 0, ilocBody(0)), iinf, iprp).length;
    const offset = ftyp.length + metaLen + 8;
    const meta = fullBox('meta', 0, 0, hdlr, pitm, fullBox('iloc', 0, 0, ilocBody(offset)), iinf, iprp);
    return concat([ftyp, meta, box('mdat', data)]);
  }
  async function heic(ctx, o) {
    if (!(await heicAvailable())) throw new Error('HEIC needs a WebCodecs HEVC encoder (VideoEncoder hvc1), which this browser / GPU does not offer');
    const { w, h } = ctx, { cw, ch } = heicDims(w, h);
    const src = ctx.flat(0), px = new Uint8Array(cw * ch * 4);
    for (let y = 0; y < ch; y++) {   // pad by repeating the edge pixels
      const sy = Math.min(h - 1, y);
      for (let x = 0; x < cw; x++) { const s = (sy * w + Math.min(w - 1, x)) * 4, d = (y * cw + x) * 4; px[d] = src[s]; px[d + 1] = src[s + 1]; px[d + 2] = src[s + 2]; px[d + 3] = 255; }
    }
    const q = clamp(Math.round(o.quality), 1, 100);
    const codec = hevcCodec(cw, ch);
    const base = { codec, width: cw, height: ch, hevc: { format: 'hevc' }, framerate: 1, latencyMode: 'quality' };
    const qp = Math.round((100 - q) * 0.45);
    let config = { ...base, bitrateMode: 'quantizer' };
    let quant = true;
    try { if (!(await VideoEncoder.isConfigSupported(config)).supported) quant = false; } catch { quant = false; }
    if (!quant) config = { ...base, bitrate: Math.round(cw * ch * (0.3 + (3.7 * q) / 100)) };
    const chunks = [];
    let desc = null, colorSpace = null, failure = null;
    const enc = new VideoEncoder({
      output: (chunk, meta) => {
        const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); chunks.push(b);
        if (meta && meta.decoderConfig) {
          if (meta.decoderConfig.description) { const d = meta.decoderConfig.description; desc = new Uint8Array(ArrayBuffer.isView(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d.slice(0)); }
          if (meta.decoderConfig.colorSpace) colorSpace = meta.decoderConfig.colorSpace;
        }
      },
      error: (e) => { failure = e; },
    });
    enc.configure(config);
    const frame = new VideoFrame(px, { format: 'RGBX', codedWidth: cw, codedHeight: ch, timestamp: 0 });
    enc.encode(frame, quant ? { keyFrame: true, hevc: { quantizer: qp } } : { keyFrame: true });
    frame.close();
    await enc.flush();
    enc.close();
    if (failure) throw failure;
    if (!chunks.length || !desc) throw new Error('The HEVC encoder returned no key frame / hvcC');
    return heifContainer({ brand: 'heic', itemType: 'hvc1', config: box('hvcC', desc), w, h, cw, ch, data: chunks[0], colorSpace });
  }

  /* ── JPEG 2000 (OpenJPEG) / JPEG-LS (CharLS) ── */
  function codecInput(ctx, o, allowSigned, allowAlpha) {
    const n = ctx.n;
    if (ctx.hasGray && o.color !== 'rgb') { const g = gray16(ctx, 0, o, allowSigned); return { comps: 1, bits: 16, signed: g.signed, data: new Uint8Array(g.data.buffer, g.data.byteOffset, n * 2) }; }
    if (ctx.isGrey(0) && !ctx.alpha(0)) return { comps: 1, bits: 8, signed: false, data: ctx.gray8(0) };
    const alpha = allowAlpha && ctx.alpha(0);
    return { comps: alpha ? 4 : 3, bits: 8, signed: false, data: pickChannels(alpha ? ctx.rgba(0) : ctx.flat(0), n, alpha ? 'rgba' : 'rgb').data };
  }
  async function j2kCodestream(ctx, o) {
    const m = await cornerstone('j2k');
    const lossless = o.lossless !== false;
    const inp = codecInput(ctx, o, true, lossless);
    const e = new m.J2KEncoder();
    try {
      const buf = e.getDecodedBuffer({ width: ctx.w, height: ctx.h, bitsPerSample: inp.bits, componentCount: inp.comps, isSigned: inp.signed });
      buf.set(inp.data);
      e.setDecompositions(clamp(Math.floor(Math.log2(Math.min(ctx.w, ctx.h))) - 1, 0, 5));
      // lossless: reversible 5/3; lossy: irreversible 9/7 (this build has no working rate control, so no ratio)
      e.setQuality(lossless, 0);
      e.encode();
      return { cs: new Uint8Array(e.getEncodedBuffer()), inp };
    } finally { e.delete(); }
  }
  async function j2k(ctx, o) { return (await j2kCodestream(ctx, o)).cs; }
  async function jp2(ctx, o) {
    const { cs, inp } = await j2kCodestream(ctx, o);
    const sig = new Uint8Array([0, 0, 0, 12, 0x6A, 0x50, 0x20, 0x20, 0x0D, 0x0A, 0x87, 0x0A]);
    const ftyp = box('ftyp', ascii('jp2 '), new Uint8Array(4), ascii('jp2 '));
    const ih = new Bytes(14); ih.u32(ctx.h).u32(ctx.w).u16(inp.comps).u8((inp.bits - 1) | (inp.signed ? 0x80 : 0)).u8(7).u8(0).u8(0);
    const colr = new Bytes(7); colr.u8(1).u8(0).u8(0).u32(inp.comps >= 3 ? 16 : 17);
    const parts = [box('ihdr', ih.done()), box('colr', colr.done())];
    if (inp.comps === 4) { const c = new Bytes(26); c.u16(4); [[0, 0, 1], [1, 0, 2], [2, 0, 3], [3, 1, 0]].forEach(([i, t, a]) => c.u16(i).u16(t).u16(a)); parts.push(box('cdef', c.done())); }
    return concat([sig, ftyp, box('jp2h', ...parts), box('jp2c', cs)]);
  }
  async function jls(ctx, o) {
    const m = await cornerstone('jls');
    const inp = codecInput(ctx, o, false, false);
    const e = new m.JpegLSEncoder();
    try {
      const buf = e.getDecodedBuffer({ width: ctx.w, height: ctx.h, bitsPerSample: inp.bits, componentCount: inp.comps });
      buf.set(inp.data);
      e.setNearLossless(clamp(o.near | 0, 0, inp.bits === 8 ? 127 : 255));
      if (inp.comps === 3) e.setInterleaveMode(1);   // line interleave: sample interleave (2) is not read by every decoder (ffmpeg)
      e.encode();
      return new Uint8Array(e.getEncodedBuffer());
    } finally { e.delete(); }
  }

  /* ── GIF / BMP / TIFF ── */
  async function gif(ctx) { const E = await encoders(); return E.gif({ width: ctx.w, height: ctx.h, rgba: ctx.flat(0) }); }
  async function gifAnimated(ctx, o) {
    const E = await encoders();
    return E.gifAnimated({ width: ctx.w, height: ctx.h, frames: ctx.frames.map((_, i) => ctx.flat(i)), delayMs: Math.round(o.delayMs) || 100, loop: o.loop !== false });
  }
  function bmp(ctx, o) {
    const { w, h } = ctx, bits = +o.bits || 24;
    const bpp = bits / 8, rowBytes = (w * bpp + 3) & ~3, hdr = bits === 32 ? 124 : 40, pal = bits === 8 ? 1024 : 0;
    const off = 14 + hdr + pal, size = off + rowBytes * h;
    const b = new Bytes(size);
    const ppm = Math.round((ctx.dpi || 72) / 0.0254);
    b.str('BM').u32(size, true).u32(0, true).u32(off, true);
    b.u32(hdr, true).i32(w, true).i32(h, true).u16(1, true).u16(bits, true).u32(bits === 32 ? 3 : 0, true).u32(rowBytes * h, true).i32(ppm, true).i32(ppm, true).u32(bits === 8 ? 256 : 0, true).u32(0, true);
    if (bits === 32) {   // BITMAPV5HEADER: channel masks, sRGB
      b.u32(0x00FF0000, true).u32(0x0000FF00, true).u32(0x000000FF, true).u32(0xFF000000, true).str('BGRs').zeros(36).zeros(12).u32(4, true).u32(0, true).u32(0, true).u32(0, true);
    }
    if (bits === 8) for (let i = 0; i < 256; i++) b.u8(i).u8(i).u8(i).u8(0);
    const src = bits === 32 ? ctx.rgba(0) : ctx.flat(0), g = bits === 8 ? ctx.gray8(0) : null;
    for (let y = h - 1; y >= 0; y--) {
      const start = b.length;
      for (let x = 0; x < w; x++) {
        const i = y * w + x, s = i * 4;
        if (bits === 8) b.u8(g[i]);
        else { b.u8(src[s + 2]).u8(src[s + 1]).u8(src[s]); if (bits === 32) b.u8(src[s + 3]); }
      }
      b.zeros(rowBytes - (b.length - start));
    }
    return b.done();
  }
  function packBits(src, start, end, out) {
    let i = start;
    while (i < end) {
      let j = i + 1;
      while (j < end && j - i < 128 && src[j] === src[i]) j++;
      if (j - i >= 2) { out.u8((257 - (j - i)) & 255).u8(src[i]); i = j; continue; }
      let k = i + 1;
      while (k < end && k - i < 128 && !(k + 1 < end && src[k] === src[k + 1])) k++;
      out.u8(k - i - 1); out.bytes(src.subarray(i, k)); i = k;
    }
  }
  const LZW = { codes: null, stamp: null, gen: 0 };
  function tiffLzw(src) {   // TIFF LZW (MSB first, early change), as libtiff writes it
    const out = new Bytes(src.length / 2 + 64);
    let acc = 0, nacc = 0, width = 9, next = 258;
    const emit = (code) => { acc = (acc << width) | code; nacc += width; while (nacc >= 8) { out.u8((acc >>> (nacc - 8)) & 255); nacc -= 8; } acc &= (1 << nacc) - 1; };
    if (!LZW.codes) { LZW.codes = new Int32Array(4096 * 256); LZW.stamp = new Int32Array(4096 * 256); }
    const { codes, stamp } = LZW;
    let gen = ++LZW.gen;
    emit(256);
    if (!src.length) { emit(257); if (nacc) out.u8((acc << (8 - nacc)) & 255); return out.done(); }
    let ent = src[0];
    for (let i = 1; i < src.length; i++) {
      const c = src[i], key = ent * 256 + c;
      if (stamp[key] === gen) { ent = codes[key]; continue; }
      emit(ent);
      ent = c;
      codes[key] = next++; stamp[key] = gen;
      if (next === 4094) { emit(256); gen = ++LZW.gen; next = 258; width = 9; }
      else if (next > (1 << width) - 1) width++;
    }
    emit(ent);
    next++;
    if (next === 4094) width = 9;
    else if (next > (1 << width) - 1) width++;
    emit(257);
    if (nacc) out.u8((acc << (8 - nacc)) & 255);
    return out.done();
  }
  function tiffWrite(pages, { compression, dpi, P }) {
    const comp = { none: 1, lzw: 5, deflate: 8, packbits: 32773 }[compression] || 1;
    const out = new Bytes(1 << 16);
    out.str('II').u16(42, true).u32(0, true);
    let prevNext = 4;
    pages.forEach((pg, pi) => {
      const { w, h, spp, bps, sfmt, photo, extra, data } = pg;
      const rowBytes = w * spp * (bps / 8);
      const rps = Math.max(1, Math.min(h, Math.floor(65536 / Math.max(1, rowBytes))));
      const offs = [], counts = [];
      for (let y = 0; y < h; y += rps) {
        const raw = data.subarray(y * rowBytes, Math.min(h, y + rps) * rowBytes);
        let enc = raw;
        if (comp === 5) enc = tiffLzw(raw);
        else if (comp === 8) enc = P.deflate(raw);
        else if (comp === 32773) { const b = new Bytes(raw.length + raw.length / 64 + 16); for (let r = 0; r < raw.length; r += rowBytes) packBits(raw, r, r + rowBytes, b); enc = b.done(); }
        out.align(2); offs.push(out.length); counts.push(enc.length); out.bytes(enc);
      }
      const entries = [];
      const add = (tag, type, values) => entries.push({ tag, type, values });
      if (pages.length > 1) add(254, 4, [2]);
      add(256, 4, [w]); add(257, 4, [h]);
      add(258, 3, new Array(spp).fill(bps));
      add(259, 3, [comp]); add(262, 3, [photo]);
      add(273, 4, offs); add(277, 3, [spp]); add(278, 4, [rps]); add(279, 4, counts);
      add(282, 5, [Math.round(dpi || 72), 1]); add(283, 5, [Math.round(dpi || 72), 1]);
      add(284, 3, [1]); add(296, 3, [2]);
      if (pages.length > 1) add(297, 3, [pi, pages.length]);
      if (extra) add(338, 3, [2]);
      add(339, 3, new Array(spp).fill(sfmt));
      const size = (e) => (e.type === 3 ? 2 : 4) * e.values.length;
      // out-of-line values first, then the IFD
      for (const e of entries) {
        const s = e.type === 5 ? 8 : size(e);
        if (s <= 4) continue;
        out.align(2); e.offset = out.length;
        if (e.type === 3) e.values.forEach((v) => out.u16(v, true));
        else e.values.forEach((v) => out.u32(v, true));
      }
      out.align(2);
      const ifd = out.length;
      out.put32(prevNext, ifd, true);
      out.u16(entries.length, true);
      for (const e of entries) {
        const count = e.type === 5 ? 1 : e.values.length;
        out.u16(e.tag, true).u16(e.type, true).u32(count, true);
        if (e.offset !== undefined) out.u32(e.offset, true);
        else if (e.type === 3) { out.u16(e.values[0], true).u16(e.values[1] || 0, true); }
        else out.u32(e.values[0], true);
      }
      prevNext = out.length;
      out.u32(0, true);
    });
    return out.done();
  }
  async function tiff(ctx, o) {
    const P = o.compression === 'deflate' ? await pako() : null;
    const { w, h, n } = ctx;
    let sample = o.sample || 'auto';
    if (sample === 'auto') sample = ctx.hasGray ? (isFloatArr(ctx.frames[0].gray) && !ctx.range.integral ? 'float32' : 'gray16') : ctx.anyAlpha() ? 'rgba' : ctx.frames.every((_, i) => ctx.isGrey(i)) ? 'gray8' : 'rgb';
    const idx = o.multipage === false ? [0] : ctx.frames.map((_, i) => i);
    const pages = idx.map((i) => {
      if (sample === 'gray8') return { w, h, spp: 1, bps: 8, sfmt: 1, photo: 1, data: ctx.gray8(i) };
      if (sample === 'gray16') { const g = gray16(ctx, i, o, true); return { w, h, spp: 1, bps: 16, sfmt: g.signed ? 2 : 1, photo: 1, data: new Uint8Array(g.data.buffer, g.data.byteOffset, n * 2) }; }
      if (sample === 'float32') {
        const f = new Float32Array(n), g = ctx.frames[i].gray;
        if (g) for (let j = 0; j < n; j++) f[j] = g[j]; else { const l = ctx.gray8(i); for (let j = 0; j < n; j++) f[j] = l[j] / 255; }
        return { w, h, spp: 1, bps: 32, sfmt: 3, photo: 1, data: new Uint8Array(f.buffer) };
      }
      const alpha = sample === 'rgba';
      const { ch, data } = pickChannels(alpha ? ctx.rgba(i) : ctx.flat(i), n, alpha ? 'rgba' : 'rgb');
      return { w, h, spp: ch, bps: 8, sfmt: 1, photo: 2, extra: alpha, data: alpha ? data.slice() : data };
    });
    return tiffWrite(pages, { compression: o.compression, dpi: ctx.dpi, P });
  }

  /* ── Icons: ICO / CUR / ICNS ── */
  function resizeRGBA(src, w, h, tw, th) {   // premultiplied box filter when shrinking, bilinear when enlarging
    const out = new Uint8ClampedArray(tw * th * 4);
    const sx = w / tw, sy = h / th;
    for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      const add = (x, y, wt) => { const s = (y * w + x) * 4, al = src[s + 3] * wt; r += src[s] * al; g += src[s + 1] * al; b += src[s + 2] * al; a += al; wsum += wt; };
      if (sx >= 1 && sy >= 1) {
        const x0 = tx * sx, x1 = x0 + sx, y0 = ty * sy, y1 = y0 + sy;
        for (let y = Math.floor(y0); y < Math.min(h, Math.ceil(y1)); y++) {
          const wy = Math.min(y1, y + 1) - Math.max(y0, y);
          for (let x = Math.floor(x0); x < Math.min(w, Math.ceil(x1)); x++) add(x, y, wy * (Math.min(x1, x + 1) - Math.max(x0, x)));
        }
      } else {
        const fx = clamp((tx + 0.5) * sx - 0.5, 0, w - 1), fy = clamp((ty + 0.5) * sy - 0.5, 0, h - 1);
        const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), ax = fx - x0, ay = fy - y0;
        add(x0, y0, (1 - ax) * (1 - ay)); add(x1, y0, ax * (1 - ay)); add(x0, y1, (1 - ax) * ay); add(x1, y1, ax * ay);
      }
      const d = (ty * tw + tx) * 4;
      if (a > 0) { out[d] = Math.round(r / a); out[d + 1] = Math.round(g / a); out[d + 2] = Math.round(b / a); }
      out[d + 3] = Math.round(a / wsum);
    }
    return out;
  }
  function fitSquare(rgba, w, h, size) {   // scale to fit size × size, centred on transparency
    const k = size / Math.max(w, h), tw = Math.max(1, Math.round(w * k)), th = Math.max(1, Math.round(h * k));
    const img = tw === w && th === h ? rgba : resizeRGBA(rgba, w, h, tw, th);
    const out = new Uint8ClampedArray(size * size * 4), ox = (size - tw) >> 1, oy = (size - th) >> 1;
    for (let y = 0; y < th; y++) out.set(img.subarray(y * tw * 4, (y + 1) * tw * 4), ((y + oy) * size + ox) * 4);
    return out;
  }
  const parseSizes = (s, max) => [...new Set(String(s).split(/[ ,;]+/).map(Number).filter((v) => v >= 1 && v <= max))].sort((a, b) => a - b);
  function iconDib(img, s) {
    const andRow = ((s + 31) >> 5) * 4, b = new Bytes(40 + s * s * 4 + andRow * s);
    b.u32(40, true).i32(s, true).i32(s * 2, true).u16(1, true).u16(32, true).u32(0, true).u32(s * s * 4 + andRow * s, true).zeros(16);
    for (let y = s - 1; y >= 0; y--) for (let x = 0; x < s; x++) { const i = (y * s + x) * 4; b.u8(img[i + 2]).u8(img[i + 1]).u8(img[i]).u8(img[i + 3]); }
    for (let y = s - 1; y >= 0; y--) {
      const row = new Uint8Array(andRow);
      for (let x = 0; x < s; x++) if (img[(y * s + x) * 4 + 3] === 0) row[x >> 3] |= 0x80 >> (x & 7);
      b.bytes(row);
    }
    return b.done();
  }
  async function icoLike(ctx, o, type) {
    const P = await pako();
    const sizes = type === 2 ? [clamp(+o.size || 32, 1, 256)] : parseSizes(o.sizes, 256);
    if (!sizes.length) throw new Error('No icon sizes');
    const rgba = ctx.rgba(0);
    const imgs = sizes.map((s) => { const img = fitSquare(rgba, ctx.w, ctx.h, s); return { s, data: o.entry === 'bmp' ? iconDib(img, s) : pngRGBA8(P, img, s, s, 9) }; });
    const b = new Bytes(6 + 16 * imgs.length + imgs.reduce((t, i) => t + i.data.length, 0));
    b.u16(0, true).u16(type, true).u16(imgs.length, true);
    let off = 6 + 16 * imgs.length;
    for (const im of imgs) {
      b.u8(im.s >= 256 ? 0 : im.s).u8(im.s >= 256 ? 0 : im.s).u8(0).u8(0);
      if (type === 2) b.u16(clamp(o.hotspotX | 0, 0, im.s - 1), true).u16(clamp(o.hotspotY | 0, 0, im.s - 1), true);
      else b.u16(1, true).u16(32, true);
      b.u32(im.data.length, true).u32(off, true);
      off += im.data.length;
    }
    imgs.forEach((im) => b.bytes(im.data));
    return b.done();
  }
  async function icns(ctx, o) {
    const P = await pako();
    const TYPES = { 16: 'icp4', 32: 'icp5', 64: 'icp6', 128: 'ic07', 256: 'ic08', 512: 'ic09', 1024: 'ic10' };
    const sizes = parseSizes(o.sizes, 1024).filter((s) => TYPES[s]);
    const parts = sizes.map((s) => { const data = pngRGBA8(P, fitSquare(ctx.rgba(0), ctx.w, ctx.h, s), s, s, 9); const b = new Bytes(data.length + 8); b.str(TYPES[s]).u32(data.length + 8).bytes(data); return b.done(); });
    const body = concat(parts), b = new Bytes(body.length + 8);
    b.str('icns').u32(body.length + 8).bytes(body);
    return b.done();
  }

  /* ── TGA / PCX / Netpbm / QOI / DDS / PSD / SGI / Sun / XBM / XPM / WBMP / Farbfeld ── */
  function tga(ctx, o) {
    const { w, h } = ctx, bits = +o.bits || 32, ps = bits / 8, rle = o.rle !== false;
    const src = bits === 32 ? ctx.rgba(0) : ctx.flat(0), g = bits === 8 ? ctx.gray8(0) : null;
    const b = new Bytes(18 + w * h * ps * 1.1 + 64);
    b.u8(0).u8(0).u8((bits === 8 ? 3 : 2) + (rle ? 8 : 0)).zeros(5).u16(0, true).u16(0, true).u16(w, true).u16(h, true).u8(bits).u8((bits === 32 ? 8 : 0) | 0x20);
    const px = (i, arr, at) => { if (g) arr[at] = g[i]; else { const s = i * 4; arr[at] = src[s + 2]; arr[at + 1] = src[s + 1]; arr[at + 2] = src[s]; if (ps === 4) arr[at + 3] = src[s + 3]; } };
    const row = new Uint8Array(w * ps);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) px(y * w + x, row, x * ps);
      if (!rle) { b.bytes(row); continue; }
      const same = (a, c) => { for (let k = 0; k < ps; k++) if (row[a * ps + k] !== row[c * ps + k]) return false; return true; };
      let x = 0;
      while (x < w) {
        let j = x + 1;
        while (j < w && j - x < 128 && same(j, x)) j++;
        if (j - x >= 2) { b.u8(0x80 | (j - x - 1)).bytes(row.subarray(x * ps, x * ps + ps)); x = j; continue; }
        let k = x + 1;
        while (k < w && k - x < 128 && !(k + 1 < w && same(k, k + 1))) k++;
        b.u8(k - x - 1).bytes(row.subarray(x * ps, k * ps)); x = k;
      }
    }
    b.zeros(8).str('TRUEVISION-XFILE.').u8(0);
    return b.done();
  }
  function pcx(ctx) {
    const { w, h } = ctx, src = ctx.flat(0), bpl = w + (w & 1), dpi = Math.round(ctx.dpi || 72);
    const b = new Bytes(128 + w * h * 4);
    b.u8(10).u8(5).u8(1).u8(8).u16(0, true).u16(0, true).u16(w - 1, true).u16(h - 1, true).u16(dpi, true).u16(dpi, true).zeros(48).u8(0).u8(3).u16(bpl, true).u16(1, true).u16(0, true).u16(0, true).zeros(54);
    const line = new Uint8Array(bpl);
    for (let y = 0; y < h; y++) for (let c = 0; c < 3; c++) {
      for (let x = 0; x < w; x++) line[x] = src[(y * w + x) * 4 + c];
      let i = 0;
      while (i < bpl) {
        let j = i + 1;
        while (j < bpl && j - i < 63 && line[j] === line[i]) j++;
        if (j - i > 1 || line[i] >= 0xC0) b.u8(0xC0 | (j - i)).u8(line[i]); else b.u8(line[i]);
        i = j;
      }
    }
    return b.done();
  }
  function asciiRows(vals, perLine) { let s = ''; for (let i = 0; i < vals.length; i += perLine) s += Array.prototype.slice.call(vals, i, i + perLine).join(' ') + '\n'; return s; }
  function pbm(ctx, o) {
    const { w, h } = ctx, g = ctx.gray8(0), t = o.threshold ?? 128;
    if (o.ascii) { const v = new Uint8Array(w * h); for (let i = 0; i < v.length; i++) v[i] = g[i] < t ? 1 : 0; return ascii(`P1\n${w} ${h}\n` + asciiRows(v, w)); }
    const rb = (w + 7) >> 3, head = ascii(`P4\n${w} ${h}\n`), out = new Uint8Array(head.length + rb * h);
    out.set(head);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y * w + x] < t) out[head.length + y * rb + (x >> 3)] |= 0x80 >> (x & 7);
    return out;
  }
  function pgm(ctx, o) {
    const { w, h, n } = ctx, d16 = o.depth === '16';
    const v = d16 ? gray16(ctx, 0, o, false).data : ctx.gray8(0), max = d16 ? 65535 : 255;
    if (o.ascii) return ascii(`P2\n${w} ${h}\n${max}\n` + asciiRows(v, Math.min(w, 16)));
    const head = ascii(`P5\n${w} ${h}\n${max}\n`), b = new Bytes(head.length + n * (d16 ? 2 : 1));
    b.bytes(head);
    if (d16) for (let i = 0; i < n; i++) b.u16(v[i]); else b.bytes(v);
    return b.done();
  }
  function ppm(ctx, o) {
    const { w, h, n } = ctx, src = ctx.flat(0), rgb = pickChannels(src, n, 'rgb').data;
    if (o.ascii) return ascii(`P3\n${w} ${h}\n255\n` + asciiRows(rgb, Math.min(w * 3, 15)));
    return concat([ascii(`P6\n${w} ${h}\n255\n`), rgb]);
  }
  function pam(ctx, o) {
    const { w, h, n } = ctx, d16 = o.depth === '16';
    let depth, tupl, data;
    if (ctx.hasGray || (ctx.isGrey(0) && !ctx.alpha(0))) {
      depth = 1; tupl = 'GRAYSCALE';
      if (d16) { const v = gray16(ctx, 0, o, false).data, b = new Bytes(n * 2); for (let i = 0; i < n; i++) b.u16(v[i]); data = b.done(); } else data = ctx.gray8(0);
    } else {
      const alpha = ctx.alpha(0);
      depth = alpha ? 4 : 3; tupl = alpha ? 'RGB_ALPHA' : 'RGB';
      const px = pickChannels(alpha ? ctx.rgba(0) : ctx.flat(0), n, alpha ? 'rgba' : 'rgb').data;
      if (d16) { const b = new Bytes(px.length * 2); for (let i = 0; i < px.length; i++) b.u16(px[i] * 257); data = b.done(); } else data = px;
    }
    return concat([ascii(`P7\nWIDTH ${w}\nHEIGHT ${h}\nDEPTH ${depth}\nMAXVAL ${d16 ? 65535 : 255}\nTUPLTYPE ${tupl}\nENDHDR\n`), data]);
  }
  function pfm(ctx, o) {
    const { w, h } = ctx, { gray, planes } = floatPlanes(ctx, 0, o, false), ch = gray ? 1 : 3;
    const b = new Bytes(w * h * ch * 4 + 32);
    b.str(`${gray ? 'Pf' : 'PF'}\n${w} ${h}\n-1.0\n`);
    for (let y = h - 1; y >= 0; y--) for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) b.f32(planes[c][y * w + x], true);
    return b.done();
  }
  function qoi(ctx) {
    const { w, h, n } = ctx, alpha = ctx.alpha(0), src = alpha ? ctx.rgba(0) : ctx.flat(0);
    const b = new Bytes(14 + n * 5 + 8);
    b.str('qoif').u32(w).u32(h).u8(alpha ? 4 : 3).u8(0);
    const index = new Uint32Array(64);
    let pr = 0, pg = 0, pb = 0, pa = 255, run = 0;
    for (let i = 0; i < n; i++) {
      const s = i * 4, r = src[s], g = src[s + 1], bl = src[s + 2], a = src[s + 3];
      if (r === pr && g === pg && bl === pb && a === pa) {
        run++;
        if (run === 62 || i === n - 1) { b.u8(0xC0 | (run - 1)); run = 0; }
        continue;
      }
      if (run > 0) { b.u8(0xC0 | (run - 1)); run = 0; }
      const hsh = (r * 3 + g * 5 + bl * 7 + a * 11) % 64, key = ((r << 24) | (g << 16) | (bl << 8) | a) >>> 0;
      if (index[hsh] === key) b.u8(hsh);
      else {
        index[hsh] = key;
        if (a === pa) {
          const dr = ((r - pr) << 24) >> 24, dg = ((g - pg) << 24) >> 24, db = ((bl - pb) << 24) >> 24, drg = dr - dg, dbg = db - dg;
          if (dr >= -2 && dr <= 1 && dg >= -2 && dg <= 1 && db >= -2 && db <= 1) b.u8(0x40 | ((dr + 2) << 4) | ((dg + 2) << 2) | (db + 2));
          else if (dg >= -32 && dg <= 31 && drg >= -8 && drg <= 7 && dbg >= -8 && dbg <= 7) b.u8(0x80 | (dg + 32)).u8(((drg + 8) << 4) | (dbg + 8));
          else b.u8(0xFE).u8(r).u8(g).u8(bl);
        } else b.u8(0xFF).u8(r).u8(g).u8(bl).u8(a);
      }
      pr = r; pg = g; pb = bl; pa = a;
    }
    b.zeros(7).u8(1);
    return b.done();
  }
  function dds(ctx) {
    const { w, h, n } = ctx, src = ctx.rgba(0), b = new Bytes(128 + n * 4);
    b.str('DDS ').u32(124, true).u32(0x100F, true).u32(h, true).u32(w, true).u32(w * 4, true).u32(0, true).u32(0, true).zeros(44);
    b.u32(32, true).u32(0x41, true).u32(0, true).u32(32, true).u32(0x00FF0000, true).u32(0x0000FF00, true).u32(0x000000FF, true).u32(0xFF000000, true);
    b.u32(0x1000, true).zeros(16);
    for (let i = 0; i < n * 4; i += 4) b.u8(src[i + 2]).u8(src[i + 1]).u8(src[i]).u8(src[i + 3]);
    return b.done();
  }
  function psd(ctx, o) {
    const { w, h, n } = ctx, rle = o.compression !== 'raw';
    let planes, depth = 8, mode;
    if (ctx.hasGray) { depth = 16; mode = 1; const v = gray16(ctx, 0, o, false).data, p = new Uint8Array(n * 2); for (let i = 0; i < n; i++) { p[i * 2] = v[i] >> 8; p[i * 2 + 1] = v[i] & 255; } planes = [p]; }
    else if (ctx.isGrey(0) && !(o.alpha && ctx.alpha(0))) { mode = 1; planes = [ctx.gray8(0)]; }
    else {   // a 4th channel of a flat PSD is an extra (alpha) channel, not transparency: only on request
      mode = 3;
      const alpha = !!o.alpha && ctx.alpha(0), src = alpha ? ctx.rgba(0) : ctx.flat(0);
      planes = [0, 1, 2, 3].slice(0, alpha ? 4 : 3).map((c) => { const p = new Uint8Array(n); for (let i = 0; i < n; i++) p[i] = src[i * 4 + c]; return p; });
    }
    const b = new Bytes(64 + n * planes.length * (depth / 8) * 1.2);
    b.str('8BPS').u16(1).zeros(6).u16(planes.length).u32(h).u32(w).u16(depth).u16(mode);
    b.u32(0).u32(0).u32(0);
    b.u16(rle ? 1 : 0);
    const rowBytes = w * (depth / 8);
    if (!rle) planes.forEach((p) => b.bytes(p));
    else {
      const rows = [];
      for (const p of planes) for (let y = 0; y < h; y++) { const r = new Bytes(rowBytes + rowBytes / 64 + 4); packBits(p, y * rowBytes, (y + 1) * rowBytes, r); rows.push(r.done()); }
      rows.forEach((r) => b.u16(r.length));
      rows.forEach((r) => b.bytes(r));
    }
    return b.done();
  }
  function sgi(ctx, o) {
    const { w, h, n } = ctx, d16 = o.depth === '16';
    let planes;
    if (d16 || ctx.hasGray) {
      const v = d16 ? gray16(ctx, 0, o, false).data : ctx.gray8(0);
      planes = [v];
    } else if (ctx.isGrey(0) && !ctx.alpha(0)) planes = [ctx.gray8(0)];
    else { const alpha = ctx.alpha(0), src = alpha ? ctx.rgba(0) : ctx.flat(0); planes = [0, 1, 2, 3].slice(0, alpha ? 4 : 3).map((c) => { const p = new Uint8Array(n); for (let i = 0; i < n; i++) p[i] = src[i * 4 + c]; return p; }); }
    const bpc = d16 ? 2 : 1, z = planes.length, rle = o.rle !== false && bpc === 1;
    const b = new Bytes(512 + n * z * bpc * 1.1 + z * h * 8);
    b.u16(474).u8(rle ? 1 : 0).u8(bpc).u16(z === 1 ? 2 : 3).u16(w).u16(h).u16(z).u32(0).u32(bpc === 2 ? 65535 : 255).u32(0);
    const nm = ctx.name.slice(0, 79); b.str(nm).zeros(80 - nm.length).u32(0).zeros(404);
    if (!rle) { for (const p of planes) for (let y = h - 1; y >= 0; y--) for (let x = 0; x < w; x++) { if (bpc === 2) b.u16(p[y * w + x]); else b.u8(p[y * w + x]); } return b.done(); }
    const tab = b.length; b.zeros(z * h * 8);
    for (let c = 0; c < z; c++) for (let r = 0; r < h; r++) {
      const p = planes[c], y = h - 1 - r, start = b.length;
      let i = 0;
      const at = (k) => p[y * w + k];
      while (i < w) {
        let s = i;
        while (i < w && i - s < 126 && !(i + 2 < w && at(i) === at(i + 1) && at(i) === at(i + 2))) i++;
        if (i > s) { b.u8(0x80 | (i - s)); for (let k = s; k < i; k++) b.u8(at(k)); }
        if (i < w) { s = i; const v = at(i); while (i < w && i - s < 126 && at(i) === v) i++; b.u8(i - s).u8(v); }
      }
      b.u8(0);
      b.put32(tab + (c * h + r) * 4, start); b.put32(tab + z * h * 4 + (c * h + r) * 4, b.length - start);
    }
    return b.done();
  }
  function ras(ctx, o) {
    const { w, h } = ctx, src = ctx.flat(0), rowBytes = (w * 3 + 1) & ~1;
    const raw = new Uint8Array(rowBytes * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = (y * w + x) * 4, d = y * rowBytes + x * 3; raw[d] = src[s + 2]; raw[d + 1] = src[s + 1]; raw[d + 2] = src[s]; }
    let data = raw;
    if (o.rle) {
      const b = new Bytes(raw.length + 64);
      for (let i = 0; i < raw.length;) {   // runs stay inside a row (Pillow rejects runs across rows)
        const v = raw[i], rowEnd = (Math.floor(i / rowBytes) + 1) * rowBytes; let j = i + 1;
        while (j < rowEnd && j - i < 256 && raw[j] === v) j++;
        const run = j - i;
        if (run >= 3 || v === 0x80) { if (v === 0x80 && run === 1) b.u8(0x80).u8(0); else b.u8(0x80).u8(run - 1).u8(v); }
        else for (let k = 0; k < run; k++) b.u8(v);
        i = j;
      }
      data = b.done();
    }
    const b = new Bytes(32 + data.length);
    b.u32(0x59a66a95).u32(w).u32(h).u32(24).u32(data.length).u32(o.rle ? 2 : 1).u32(0).u32(0).bytes(data);
    return b.done();
  }
  const cName = (s) => { const v = String(s).replace(/[^A-Za-z0-9_]/g, '_'); return /^[A-Za-z_]/.test(v) ? v : '_' + v; };
  function xbm(ctx, o) {
    const { w, h } = ctx, g = ctx.gray8(0), t = o.threshold ?? 128, nm = cName(ctx.name), rb = (w + 7) >> 3, bytes = [];
    for (let y = 0; y < h; y++) for (let bx = 0; bx < rb; bx++) {
      let v = 0;
      for (let k = 0; k < 8; k++) { const x = bx * 8 + k; if (x < w && g[y * w + x] < t) v |= 1 << k; }
      bytes.push('0x' + v.toString(16).padStart(2, '0'));
    }
    let s = `#define ${nm}_width ${w}\n#define ${nm}_height ${h}\nstatic unsigned char ${nm}_bits[] = {\n`;
    for (let i = 0; i < bytes.length; i += 12) s += '   ' + bytes.slice(i, i + 12).join(', ') + (i + 12 < bytes.length ? ',' : '') + '\n';
    return ascii(s + '};\n');
  }
  async function xpm(ctx, o) {
    const E = await encoders();
    const { w, h, n } = ctx, rgba = ctx.rgba(0), flat = ctx.flat(0);
    const transparent = new Uint8Array(n); let anyT = false;
    for (let i = 0; i < n; i++) if (rgba[i * 4 + 3] < 128) { transparent[i] = 1; anyT = true; }
    const opaque = new Uint8ClampedArray(flat);
    if (anyT) { let fill = -1; for (let i = 0; i < n; i++) if (!transparent[i]) { fill = i; break; } for (let i = 0; i < n; i++) if (transparent[i] && fill >= 0) opaque.set(flat.subarray(fill * 4, fill * 4 + 4), i * 4); }
    const max = clamp(o.colors | 0 || 256, 2, 256) - (anyT ? 1 : 0);
    const { palette, indices, count } = E.quantize(opaque, max);
    const total = count + (anyT ? 1 : 0);
    const CH = ' .XoO+@#$%&*=-;:>,<1234567890qwertyuipasdfghjklzxcvbnmMNBVCZASDFGHJKLPIUYTREWQ!~^/()_`\'][{}|';
    const cpp = total <= CH.length ? 1 : 2;
    const code = (k) => (cpp === 1 ? CH[k] : CH[Math.floor(k / CH.length)] + CH[k % CH.length]);
    const nm = cName(ctx.name);
    const lines = [`"${w} ${h} ${total} ${cpp}"`];
    for (let k = 0; k < count; k++) lines.push(`"${code(k)} c #${[0, 1, 2].map((c) => palette[k * 3 + c].toString(16).padStart(2, '0')).join('').toUpperCase()}"`);
    if (anyT) lines.push(`"${code(count)} c None"`);
    for (let y = 0; y < h; y++) { let row = ''; for (let x = 0; x < w; x++) { const i = y * w + x; row += code(transparent[i] ? count : indices[i]); } lines.push(`"${row}"`); }
    return ascii(`/* XPM */\nstatic char *${nm}[] = {\n/* columns rows colors chars-per-pixel */\n` + lines.join(',\n') + '\n};\n');
  }
  function wbmp(ctx, o) {
    const { w, h } = ctx, g = ctx.gray8(0), t = o.threshold ?? 128, rb = (w + 7) >> 3;
    const mb = (v) => { const out = [v & 127]; v >>>= 7; while (v) { out.unshift(0x80 | (v & 127)); v >>>= 7; } return out; };
    const head = [0, 0, ...mb(w), ...mb(h)], out = new Uint8Array(head.length + rb * h);
    out.set(head);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y * w + x] >= t) out[head.length + y * rb + (x >> 3)] |= 0x80 >> (x & 7);
    return out;
  }
  function farbfeld(ctx, o) {
    const { w, h, n } = ctx, b = new Bytes(16 + n * 8);
    b.str('farbfeld').u32(w).u32(h);
    if (ctx.hasGray) { const v = gray16(ctx, 0, o, false).data; for (let i = 0; i < n; i++) b.u16(v[i]).u16(v[i]).u16(v[i]).u16(65535); }
    else { const src = ctx.rgba(0); for (let i = 0; i < n * 4; i++) b.u16(src[i] * 257); }
    return b.done();
  }

  /* ── HDR: OpenEXR / Radiance ── */
  const h16 = (() => {
    const f = new Float32Array(1), u = new Uint32Array(f.buffer);
    return (v) => {
      f[0] = v; const x = u[0], sign = (x >>> 16) & 0x8000;
      let e = (x >>> 23) & 0xff, m = x & 0x7fffff;
      if (e === 255) return sign | 0x7c00 | (m ? 0x200 : 0);
      e = e - 127 + 15;
      if (e >= 31) return sign | 0x7c00;
      if (e <= 0) {
        if (e < -10) return sign;
        m = (m | 0x800000) >> (1 - e);
        return sign | ((m + 0x1000) >> 13);
      }
      const r = (e << 10) | (m >> 13), rem = m & 0x1fff;
      return sign | (rem > 0x1000 || (rem === 0x1000 && (r & 1)) ? r + 1 : r);
    };
  })();
  async function exr(ctx, o) {
    const half = o.pixel !== 'float', comp = { none: 0, zips: 2, zip: 3 }[o.compression] ?? 3;
    const P = comp ? await pako() : null;
    const { w, h } = ctx, { gray, planes } = floatPlanes(ctx, 0, o, true);
    const names = gray ? ['Y'] : planes.length === 4 ? ['A', 'B', 'G', 'R'] : ['B', 'G', 'R'];
    const chan = gray ? [planes[0]] : (planes.length === 4 ? [planes[3], planes[2], planes[1], planes[0]] : [planes[2], planes[1], planes[0]]);
    const bps = half ? 2 : 4, lines = comp === 3 ? 16 : 1, nChunks = Math.ceil(h / lines);
    const b = new Bytes(w * h * names.length * bps + 4096);
    b.u32(20000630, true).u32(2, true);
    const attr = (name, type, body) => { b.str(name + '\0' + type + '\0').u32(body.length, true).bytes(body); };
    const cl = new Bytes(64);
    for (const nm of names) cl.str(nm + '\0').i32(half ? 1 : 2, true).u8(0).zeros(3).i32(1, true).i32(1, true);
    cl.u8(0);
    attr('channels', 'chlist', cl.done());
    attr('compression', 'compression', new Uint8Array([comp]));
    const win = new Bytes(16); win.i32(0, true).i32(0, true).i32(w - 1, true).i32(h - 1, true);
    attr('dataWindow', 'box2i', win.done()); attr('displayWindow', 'box2i', win.done());
    attr('lineOrder', 'lineOrder', new Uint8Array([0]));
    const f1 = new Bytes(4); f1.f32(1, true);
    attr('pixelAspectRatio', 'float', f1.done());
    attr('screenWindowCenter', 'v2f', new Uint8Array(8));
    attr('screenWindowWidth', 'float', f1.done());
    b.u8(0);
    const table = b.length; b.zeros(nChunks * 8);
    for (let c = 0; c < nChunks; c++) {
      const y0 = c * lines, ny = Math.min(lines, h - y0), raw = new Bytes(ny * w * names.length * bps);
      for (let y = y0; y < y0 + ny; y++) for (const p of chan) for (let x = 0; x < w; x++) { if (half) raw.u16(h16(p[y * w + x]), true); else raw.f32(p[y * w + x], true); }
      let data = raw.done();
      if (comp) {
        const n = data.length, t = new Uint8Array(n);
        let t1 = 0, t2 = (n + 1) >> 1;
        for (let i = 0; i < n; i++) { if (i & 1) t[t2++] = data[i]; else t[t1++] = data[i]; }
        for (let i = n - 1; i > 0; i--) t[i] = (t[i] - t[i - 1] + 128) & 255;
        const z = P.deflate(t);
        if (z.length < n) data = z;
      }
      const at = b.length;
      b.dv.setBigUint64(table + c * 8, BigInt(at), true);
      b.i32(y0, true).i32(data.length, true).bytes(data);
    }
    return b.done();
  }
  function hdrRle(row, b) {
    const W = row.length;
    let cur = 0;
    while (cur < W) {
      let beg = cur, run = 0, oldRun = 0;
      while (run < 4 && beg < W) { beg += run; oldRun = run; run = 1; while (beg + run < W && run < 127 && row[beg] === row[beg + run]) run++; }
      if (oldRun > 1 && oldRun === beg - cur) { b.u8(128 + oldRun).u8(row[cur]); cur = beg; }
      while (cur < beg) { const k = Math.min(128, beg - cur); b.u8(k).bytes(row.subarray(cur, cur + k)); cur += k; }
      if (run >= 4) { b.u8(128 + run).u8(row[beg]); cur += run; }
    }
  }
  function hdr(ctx, o) {
    const { w, h } = ctx, { gray, planes } = floatPlanes(ctx, 0, o, false);
    const P3 = gray ? [planes[0], planes[0], planes[0]] : planes;
    const b = new Bytes(w * h * 4 + 256);
    b.str(`#?RADIANCE\n# MyDCMViewer\nFORMAT=32-bit_rle_rgbe\nEXPOSURE=1.0\n\n-Y ${h} +X ${w}\n`);
    const rle = o.rle !== false && w >= 8 && w <= 32767;
    const ch = [new Uint8Array(w), new Uint8Array(w), new Uint8Array(w), new Uint8Array(w)];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, r = Math.max(0, P3[0][i]), g = Math.max(0, P3[1][i]), bl = Math.max(0, P3[2][i]), v = Math.max(r, g, bl);
        if (v < 1e-32) { ch[0][x] = ch[1][x] = ch[2][x] = ch[3][x] = 0; continue; }
        let e = Math.floor(Math.log2(v)) + 1, s = Math.pow(2, -e) * 256;
        if (v * s >= 256) { e++; s /= 2; }
        if (v * s < 128) { e--; s *= 2; }
        ch[0][x] = Math.min(255, Math.floor(r * s)); ch[1][x] = Math.min(255, Math.floor(g * s)); ch[2][x] = Math.min(255, Math.floor(bl * s)); ch[3][x] = clamp(e + 128, 0, 255);
      }
      if (!rle) { for (let x = 0; x < w; x++) b.u8(ch[0][x]).u8(ch[1][x]).u8(ch[2][x]).u8(ch[3][x]); continue; }
      b.u8(2).u8(2).u8(w >> 8).u8(w & 255);
      for (let c = 0; c < 4; c++) hdrRle(ch[c], b);
    }
    return b.done();
  }

  /* ── FITS ── */
  function fitsCard(key, value, comment) {
    let s = key.padEnd(8);
    if (value !== undefined) {
      const v = typeof value === 'string' ? `'${value.replace(/'/g, "''").padEnd(8)}'`.padEnd(20) : typeof value === 'boolean' ? (value ? 'T' : 'F').padStart(20) : String(value).toUpperCase().padStart(20);
      s += '= ' + v + (comment ? ' / ' + comment : '');
    }
    return s.padEnd(80).slice(0, 80);
  }
  function fits(ctx, o) {
    const { w, h, n, count } = ctx, flip = o.flipY !== false;
    const cards = [fitsCard('SIMPLE', true, 'conforms to FITS standard')];
    let bitpix, write, naxis3 = count > 1 ? count : 0, bzero = 0, bscale = 1;
    const rows = (fn) => { for (let f = 0; f < (naxis3 || 1); f++) for (let r = 0; r < h; r++) { const y = flip ? h - 1 - r : r; for (let x = 0; x < w; x++) fn(f, y * w + x); } };
    let type = o.type || 'auto';
    if (!ctx.hasGray) {
      if (ctx.isGrey(0) && ctx.frames.every((_, i) => ctx.isGrey(i))) { bitpix = 8; write = (b) => rows((f, i) => b.u8(ctx.gray8(f)[i])); }
      else { bitpix = 8; naxis3 = 3; write = (b) => { for (let c = 0; c < 3; c++) for (let r = 0; r < h; r++) { const y = flip ? h - 1 - r : r; const src = ctx.flat(0); for (let x = 0; x < w; x++) b.u8(src[(y * w + x) * 4 + c]); } }; }
    } else {
      const g0 = ctx.frames[0].gray, { lo, hi, integral } = ctx.range;
      if (type === 'auto') type = isFloatArr(g0) && !integral ? 'float32' : 'int16';
      const G = (f) => ctx.frames[f].gray;
      if (type === 'float32') { bitpix = -32; write = (b) => rows((f, i) => b.f32(G(f)[i])); }
      else if (integral && lo >= -32768 && hi <= 32767) { bitpix = 16; write = (b) => rows((f, i) => b.i16(G(f)[i])); }
      else if (integral && lo >= 0 && hi <= 65535) { bitpix = 16; bzero = 32768; write = (b) => rows((f, i) => b.i16(G(f)[i] - 32768)); }
      else {
        bitpix = 16; bscale = hi > lo ? (hi - lo) / 65535 : 1; bzero = lo + 32768 * bscale;
        write = (b) => rows((f, i) => b.i16(clamp(Math.round((G(f)[i] - bzero) / bscale), -32768, 32767)));
      }
    }
    cards.push(fitsCard('BITPIX', bitpix, 'bits per data value'), fitsCard('NAXIS', naxis3 ? 3 : 2), fitsCard('NAXIS1', w), fitsCard('NAXIS2', h));
    if (naxis3) cards.push(fitsCard('NAXIS3', naxis3));
    if (bzero || bscale !== 1) cards.push(fitsCard('BSCALE', bscale), fitsCard('BZERO', bzero));
    if (ctx.hasSpacing) cards.push(fitsCard('CDELT1', ctx.sx, 'mm'), fitsCard('CDELT2', ctx.sy, 'mm'), fitsCard('CUNIT1', 'mm'), fitsCard('CUNIT2', 'mm'));
    if (naxis3 && count > 1) cards.push(fitsCard('CDELT3', ctx.sz, 'mm'));
    cards.push(fitsCard('ORIGIN', 'MyDCMViewer'), fitsCard('OBJECT', ctx.name.slice(0, 60)), fitsCard('END'));
    const b = new Bytes(2880 + n * (naxis3 || 1) * 4 + 2880);
    b.str(cards.join(''));
    while (b.length % 2880) b.u8(32);
    write(b);
    b.align(2880);
    void n;
    return b.done();
  }

  /* ── Vector wrappers: SVG / EPS / PDF ── */
  async function svg(ctx, o) {
    const P = await pako();
    const { w, h } = ctx, alpha = ctx.alpha(0);
    const png8 = pngSync(P, { w, h, ...(() => { const p = pickChannels(alpha ? ctx.rgba(0) : ctx.flat(0), ctx.n, alpha ? 'rgba' : 'rgb'); return { samples: p.data, channels: p.ch }; })(), depth: 8, level: 9 });
    const mm = o.units === 'mm';
    const W = mm ? `${+(w * ctx.sx).toFixed(3)}mm` : w, H = mm ? `${+(h * ctx.sy).toFixed(3)}mm` : h;
    return ascii(`<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="${W}" height="${H}" viewBox="0 0 ${w} ${h}">\n` +
      `  <title>${ctx.name.replace(/[<&>]/g, '_')}</title>\n  <image x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" style="image-rendering:pixelated" xlink:href="data:image/png;base64,${base64(png8)}"/>\n</svg>\n`);
  }
  function ascii85(data) {
    let s = '', line = 0;
    const push = (t) => { s += t; line += t.length; if (line >= 72) { s += '\n'; line = 0; } };
    for (let i = 0; i < data.length; i += 4) {
      const k = Math.min(4, data.length - i);
      let v = 0;
      for (let j = 0; j < 4; j++) v = v * 256 + (j < k ? data[i + j] : 0);
      if (k === 4 && v === 0) { push('z'); continue; }
      const c = [];
      for (let j = 0; j < 5; j++) { c.unshift(String.fromCharCode(33 + (v % 85))); v = Math.floor(v / 85); }
      push(c.slice(0, k + 1).join(''));
    }
    return s + '~>';
  }
  function asciiHex(data) { let s = ''; for (let i = 0; i < data.length; i++) { s += data[i].toString(16).padStart(2, '0'); if (i % 36 === 35) s += '\n'; } return s + '>'; }
  function eps(ctx, o) {
    const { w, h, n } = ctx, grey = !!o.grayscale || ctx.isGrey(0);
    const data = grey ? ctx.gray8(0) : pickChannels(ctx.flat(0), n, 'rgb').data;
    const k = ctx.dpi ? 72 / ctx.dpi : 1, pw = +(w * k).toFixed(3), ph = +(h * k).toFixed(3);
    const hex = o.encoding === 'hex';
    const ps = `%!PS-Adobe-3.0 EPSF-3.0\n%%Creator: MyDCMViewer\n%%Title: ${ctx.name.replace(/[\r\n]/g, ' ')}\n%%BoundingBox: 0 0 ${Math.ceil(pw)} ${Math.ceil(ph)}\n%%HiResBoundingBox: 0 0 ${pw} ${ph}\n%%LanguageLevel: 2\n%%Pages: 1\n%%EndComments\n%%Page: 1 1\n` +
      `save\n${pw} ${ph} scale\n/Device${grey ? 'Gray' : 'RGB'} setcolorspace\n<<\n  /ImageType 1 /Width ${w} /Height ${h} /BitsPerComponent 8\n  /Decode [${grey ? '0 1' : '0 1 0 1 0 1'}] /ImageMatrix [${w} 0 0 -${h} 0 ${h}]\n  /DataSource currentfile /${hex ? 'ASCIIHexDecode' : 'ASCII85Decode'} filter\n>> image\n` +
      (hex ? asciiHex(data) : ascii85(data)) + `\nrestore\nshowpage\n%%Trailer\n%%EOF\n`;
    return ascii(ps);
  }
  async function pdf(ctx, o) {
    const E = await encoders();
    const pages = ctx.frames.map((_, i) => ({ jpeg: JPEG.encode({ width: ctx.w, height: ctx.h, rgba: ctx.flat(i), quality: o.quality }), width: ctx.w, height: ctx.h, dpi: ctx.dpi || 72 }));
    return E.pdf({ pages, title: ctx.name });
  }

  /* ── Medical / research volumes: NIfTI-1, Analyze 7.5, MetaImage, NRRD ── */
  const VT = {
    uint8: { arr: Uint8Array, min: 0, max: 255, nifti: 2, bits: 8, met: 'MET_UCHAR', nrrd: 'unsigned char' },
    int16: { arr: Int16Array, min: -32768, max: 32767, nifti: 4, bits: 16, met: 'MET_SHORT', nrrd: 'short' },
    uint16: { arr: Uint16Array, min: 0, max: 65535, nifti: 512, bits: 16, met: 'MET_USHORT', nrrd: 'unsigned short' },
    int32: { arr: Int32Array, min: -2147483648, max: 2147483647, nifti: 8, bits: 32, met: 'MET_INT', nrrd: 'int' },
    float32: { arr: Float32Array, nifti: 16, bits: 32, met: 'MET_FLOAT', nrrd: 'float' },
    rgb: { arr: Uint8Array, nifti: 128, bits: 24, met: 'MET_UCHAR', nrrd: 'unsigned char', channels: 3 },
  };
  function nativeType(g) {
    if (g instanceof Int16Array || g instanceof Int8Array) return 'int16';
    if (g instanceof Uint16Array) return 'uint16';
    if (isU8(g)) return 'uint8';
    if (g instanceof Int32Array || g instanceof Uint32Array) return 'int32';
    return 'float32';
  }
  function volume(ctx, o, allowed) {   // → { type, data: little-endian bytes, dims, channels }
    const { n, count } = ctx;
    let type = o.type && o.type !== 'auto' ? o.type : ctx.hasGray ? nativeType(ctx.frames[0].gray) : ctx.frames.every((_, i) => ctx.isGrey(i)) ? 'uint8' : 'rgb';
    if (allowed && !allowed.includes(type)) {
      if (type === 'rgb') type = 'uint8';
      else if (type === 'uint16') type = ctx.range && ctx.range.hi <= 32767 ? 'int16' : 'int32';
    }
    const t = VT[type];
    if (type === 'rgb') {
      const out = new Uint8Array(n * count * 3);
      for (let f = 0; f < count; f++) { const src = ctx.flat(f); for (let i = 0; i < n; i++) { out[(f * n + i) * 3] = src[i * 4]; out[(f * n + i) * 3 + 1] = src[i * 4 + 1]; out[(f * n + i) * 3 + 2] = src[i * 4 + 2]; } }
      return { type, t, data: out, channels: 3 };
    }
    const arr = new t.arr(n * count);
    for (let f = 0; f < count; f++) {
      const g = ctx.frames[f].gray;
      const src = type === 'uint8' && g && !(isU8(g)) ? ctx.gray8w(f) : g || ctx.gray8(f);
      if (type === 'float32') for (let i = 0; i < n; i++) arr[f * n + i] = src[i];
      else for (let i = 0; i < n; i++) arr[f * n + i] = clamp(Math.round(src[i]), t.min, t.max);
    }
    return { type, t, data: new Uint8Array(arr.buffer), channels: 1 };
  }
  function volumeStats(v) {
    if (v.type === 'rgb') return { lo: 0, hi: 255 };
    const a = new v.t.arr(v.data.buffer); let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < a.length; i++) { const x = a[i]; if (x < lo) lo = x; if (x > hi) hi = x; }
    return { lo, hi };
  }
  function analyzeLikeHeader(ctx, v, nifti) {
    const b = new Bytes(352);
    b.zeros(nifti ? 352 : 348);
    const dv = b.dv, L = true, N = ctx.count > 1 ? 3 : 2;
    const st = volumeStats(v);
    dv.setInt32(0, 348, L);
    if (!nifti) { dv.setInt32(32, 16384, L); b.buf[38] = 'r'.charCodeAt(0); }
    else b.buf[38] = 'r'.charCodeAt(0);
    [N, ctx.w, ctx.h, ctx.count, 1, 1, 1, 1].forEach((d, i) => dv.setInt16(40 + i * 2, d, L));
    if (!nifti) b.buf.set(ascii('mm'), 56);
    dv.setInt16(70, v.t.nifti, L);
    dv.setInt16(72, v.t.bits, L);
    [nifti ? 1 : 0, ctx.sx, ctx.sy, ctx.sz, 0, 0, 0, 0].forEach((d, i) => dv.setFloat32(76 + i * 4, d, L));
    dv.setFloat32(108, nifti ? 352 : 0, L);
    if (nifti) { dv.setFloat32(112, 1, L); dv.setFloat32(116, 0, L); b.buf[123] = 2; }
    else dv.setFloat32(112, 1, L);
    dv.setInt32(140, Math.round(clamp(st.hi, -2147483648, 2147483647)), L);
    dv.setInt32(144, Math.round(clamp(st.lo, -2147483648, 2147483647)), L);
    b.buf.set(ascii(('MyDCMViewer ' + ctx.name).slice(0, 79)), 148);
    if (nifti) {
      dv.setInt16(252, 0, L); dv.setInt16(254, 0, L);
      b.buf.set(ascii('n+1\0'), 344);
    }
    b.length = nifti ? 352 : 348;
    return b.done();
  }
  async function nifti(ctx, o, gz) {
    const v = volume(ctx, o);
    const file = concat([analyzeLikeHeader(ctx, v, true), v.data]);
    return gz ? (await pako()).gzip(file) : file;
  }
  function analyzeFiles(ctx, o) {
    const v = volume(ctx, o, ['uint8', 'int16', 'int32', 'float32']);
    return [{ name: ctx.name + '.hdr', data: analyzeLikeHeader(ctx, v, false) }, { name: ctx.name + '.img', data: v.data }];
  }
  async function metaFiles(ctx, o, single) {
    const v = volume(ctx, o);
    let data = v.data;
    const zip = !!o.compress;
    if (zip) data = (await pako()).deflate(data);
    const N = ctx.count > 1 ? 3 : 2;
    const sp = [ctx.sx, ctx.sy, ctx.sz].slice(0, N), dims = [ctx.w, ctx.h, ctx.count].slice(0, N);
    const eye = N === 3 ? '1 0 0 0 1 0 0 0 1' : '1 0 0 1';
    const raw = ctx.name + (zip ? '.zraw' : '.raw');
    let head = `ObjectType = Image\nNDims = ${N}\nBinaryData = True\nBinaryDataByteOrderMSB = False\nCompressedData = ${zip ? 'True' : 'False'}\n` + (zip ? `CompressedDataSize = ${data.length}\n` : '') +
      `TransformMatrix = ${eye}\nOffset = ${new Array(N).fill(0).join(' ')}\nCenterOfRotation = ${new Array(N).fill(0).join(' ')}\nAnatomicalOrientation = ${N === 3 ? 'RAI' : 'RA'}\n` +
      `ElementSpacing = ${sp.join(' ')}\nDimSize = ${dims.join(' ')}\n` + (v.channels > 1 ? `ElementNumberOfChannels = ${v.channels}\n` : '') +
      `ElementType = ${v.t.met}\nElementDataFile = ${single ? 'LOCAL' : raw}\n`;
    if (single) return [{ name: ctx.name + '.mha', data: concat([ascii(head), data]) }];
    return [{ name: ctx.name + '.mhd', data: ascii(head) }, { name: raw, data }];
  }
  async function nrrd(ctx, o) {
    const v = volume(ctx, o);
    const gz = o.encoding === 'gzip';
    const data = gz ? (await pako()).gzip(v.data) : v.data;
    const N = ctx.count > 1 ? 3 : 2, rgb = v.channels > 1;
    const sizes = (rgb ? [3] : []).concat([ctx.w, ctx.h, ctx.count].slice(0, N));
    const sp = (rgb ? ['nan'] : []).concat([ctx.sx, ctx.sy, ctx.sz].slice(0, N));
    const kinds = (rgb ? ['RGB-color'] : []).concat(new Array(N).fill('domain'));
    const head = `NRRD0004\n# Complete NRRD file format specification at:\n# http://teem.sourceforge.net/nrrd/format.html\ntype: ${v.t.nrrd}\ndimension: ${sizes.length}\nsizes: ${sizes.join(' ')}\nspacings: ${sp.join(' ')}\nkinds: ${kinds.join(' ')}\n` +
      (v.t.bits > 8 && !rgb ? 'endian: little\n' : '') + `encoding: ${gz ? 'gzip' : 'raw'}\n\n`;
    return concat([ascii(head), data]);
  }

  /* ── Format table ── */
  const Q = (d) => ({ key: 'quality', type: 'quality', default: d, min: 1, max: 100 });
  const SEL = (key, d, choices) => ({ key, type: 'select', default: d, choices });
  const BOOL = (key, d) => ({ key, type: 'bool', default: d });
  const NUM = (key, d, min, max) => ({ key, type: 'number', default: d, min, max });
  const RANGE = SEL('range', 'auto', ['auto', 'stretch']);
  const LINEAR = BOOL('linear', true);
  const VTYPE = SEL('type', 'auto', ['auto', 'uint8', 'int16', 'uint16', 'int32', 'float32', 'rgb']);
  const wasmAvail = (k) => async () => { try { await jsquash(k); return true; } catch { return false; } };
  const csAvail = (k) => async () => { try { await cornerstone(k); return true; } catch { return false; } };
  const F = (id, label, ext, exts, mime, group, kinds, options, enc, notes, extra = {}) => ({ id, label, ext, exts, mime, group, kinds, options, notes, available: true, ...extra, _enc: enc });
  const RGBA = ['rgba'], RG = ['rgba', 'gray16'], RGF = ['rgba', 'gray16', 'frames'], RF = ['rgba', 'frames'];
  const FORMATS = [
    F('png', 'PNG', 'png', ['png'], 'image/png', 'common', RG, [SEL('depth', '8', ['8', '16']), SEL('color', 'auto', ['auto', 'rgba', 'rgb', 'gray']), NUM('level', 6, 0, 9), RANGE], png,
      'Own encoder (zlib via pako, adaptive filters). 8-bit grey / RGB / RGBA; 16-bit grey from raw values or 16-bit RGB(A). pHYs from dpi.'),
    F('apng', 'APNG (animated PNG)', 'png', ['png', 'apng'], 'image/apng', 'common', RF, [NUM('delayMs', 100, 1, 65535), NUM('loop', 0, 0, 65535), NUM('level', 6, 0, 9)], apng, 'One frame per input frame; loop 0 = forever.'),
    F('jpeg', 'JPEG', 'jpg', ['jpg', 'jpeg', 'jpe', 'jfif'], 'image/jpeg', 'common', RGBA, [Q(90), BOOL('progressive', false), BOOL('grayscale', false)], jpeg,
      'Own encoder: baseline or progressive (spectral selection), 4:4:4, JFIF with dpi; alpha is composited over white.'),
    F('webp', 'WebP', 'webp', ['webp'], 'image/webp', 'common', RGBA, [Q(85), BOOL('lossless', false)], webp,
      'Lossy: the browser canvas when it can, else libwebp (@jsquash/webp, wasm); lossless always libwebp (exact, keeps alpha).', { isAvailable: async () => !IS_NODE || (await wasmAvail('webp')()) }),
    F('avif', 'AVIF', 'avif', ['avif'], 'image/avif', 'common', RG, [Q(60), BOOL('lossless', false), SEL('depth', '8', ['8', '10', '12']), SEL('chroma', '444', ['444', '420']), NUM('speed', 6, 0, 10), RANGE], avif,
      'libavif + aom (@jsquash/avif, wasm, single thread). 10 / 12-bit uses the raw grey values. Slow: seconds for large images.', { isAvailable: wasmAvail('avif') }),
    F('heic', 'HEIC (HEVC)', 'heic', ['heic', 'heif'], 'image/heic', 'common', RGBA, [Q(80)], heic,
      'Browser only: WebCodecs HEVC key frame (hardware encoder; Chromium needs --enable-features=PlatformHEVCEncoderSupport) in an ISO HEIF container written here (padded to ≥128 px, cropped back with clap). No alpha.',
      { available: false, isAvailable: heicAvailable }),
    F('jxl', 'JPEG XL', 'jxl', ['jxl'], 'image/jxl', 'common', RGBA, [Q(85), BOOL('lossless', false), NUM('effort', 7, 1, 9)], jxl, 'libjxl (@jsquash/jxl, wasm, single thread).', { isAvailable: wasmAvail('jxl') }),
    F('gif', 'GIF', 'gif', ['gif'], 'image/gif', 'common', RGBA, [], gif, 'Encoders.gif: ≤256 colours (median cut), no transparency.'),
    F('gif-animated', 'Animated GIF', 'gif', ['gif'], 'image/gif', 'common', RF, [NUM('delayMs', 100, 10, 65535), BOOL('loop', true)], gifAnimated, 'Encoders.gifAnimated, one local palette per frame.'),
    F('bmp', 'BMP', 'bmp', ['bmp', 'dib'], 'image/bmp', 'common', RGBA, [SEL('bits', '24', ['24', '32', '8'])], bmp, '24-bit, 32-bit with alpha (BITMAPV5, bit fields) or 8-bit grey palette.'),
    F('tiff', 'TIFF', 'tif', ['tif', 'tiff'], 'image/tiff', 'common', RGF, [SEL('compression', 'lzw', ['none', 'lzw', 'deflate', 'packbits']), SEL('sample', 'auto', ['auto', 'rgb', 'rgba', 'gray8', 'gray16', 'float32']), BOOL('multipage', true), RANGE], tiff,
      '8-bit RGB / RGBA / grey, 16-bit grey (signed when the raw values are negative int16), 32-bit float grey; one page per frame.'),
    F('jp2', 'JPEG 2000 (JP2)', 'jp2', ['jp2'], 'image/jp2', 'pro', RG, [BOOL('lossless', true), RANGE], jp2,
      'OpenJPEG (full @cornerstonejs/codec-openjpeg build). Lossless 5/3 (RGBA with cdef, 16-bit grey, signed int16 kept) or lossy 9/7 (RGB / grey; the wasm build ignores rate targets, so lossy files are near-lossless).', { isAvailable: csAvail('j2k') }),
    F('j2k', 'JPEG 2000 codestream', 'j2k', ['j2k', 'j2c', 'jpc'], 'image/x-jp2-codestream', 'pro', RG, [BOOL('lossless', true), RANGE], j2k, 'Bare J2K codestream (what DICOM embeds).', { isAvailable: csAvail('j2k') }),
    F('jls', 'JPEG-LS', 'jls', ['jls'], 'image/jls', 'pro', RG, [NUM('near', 0, 0, 255), RANGE], jls, 'CharLS (full @cornerstonejs/codec-charls build). near = 0 is lossless; 8-bit RGB / grey, 16-bit grey.', { isAvailable: csAvail('jls') }),
    F('psd', 'Photoshop PSD', 'psd', ['psd'], 'image/vnd.adobe.photoshop', 'pro', RG, [SEL('compression', 'rle', ['raw', 'rle']), BOOL('alpha', false), RANGE], psd, 'Flat image (no layers): RGB or grey 8-bit, grey 16-bit from raw values; alpha = keep transparency as an extra channel (otherwise composited over white).'),
    F('tga', 'TGA (Targa)', 'tga', ['tga', 'icb', 'vda', 'vst'], 'image/x-tga', 'pro', RGBA, [SEL('bits', '32', ['32', '24', '8']), BOOL('rle', true)], tga, 'Top-left origin, RLE or raw, TGA 2.0 footer.'),
    F('dds', 'DirectDraw Surface', 'dds', ['dds'], 'image/vnd-ms.dds', 'pro', RGBA, [], dds, 'Uncompressed 32-bit BGRA, no mipmaps.'),
    F('qoi', 'QOI', 'qoi', ['qoi'], 'image/qoi', 'pro', RGBA, [], qoi, 'Quite OK Image, lossless; RGB or RGBA.'),
    F('exr', 'OpenEXR', 'exr', ['exr'], 'image/x-exr', 'hdr', RG, [SEL('pixel', 'half', ['half', 'float']), SEL('compression', 'zip', ['none', 'zip', 'zips']), LINEAR], exr,
      'Scan lines, R G B (A) from sRGB (linearised by default) or one Y channel of raw values (use float for exact CT numbers).'),
    F('hdr', 'Radiance HDR', 'hdr', ['hdr', 'pic'], 'image/vnd.radiance', 'hdr', RG, [BOOL('rle', true), LINEAR], hdr, 'RGBE, new-style RLE scan lines; grey raw values go to R = G = B.'),
    F('pfm', 'Portable FloatMap', 'pfm', ['pfm'], 'image/x-portable-floatmap', 'hdr', RG, [LINEAR], pfm, 'PF (RGB) or Pf (grey, raw values), little-endian, bottom-up.'),
    F('pcx', 'PCX', 'pcx', ['pcx'], 'image/vnd.zbrush.pcx', 'legacy', RGBA, [], pcx, '24-bit, three RLE planes.'),
    F('pbm', 'PBM (bitmap)', 'pbm', ['pbm'], 'image/x-portable-bitmap', 'legacy', RGBA, [BOOL('ascii', false), NUM('threshold', 128, 1, 255)], pbm, '1-bit, black below the threshold; P4 or P1.'),
    F('pgm', 'PGM (greymap)', 'pgm', ['pgm'], 'image/x-portable-graymap', 'legacy', RG, [SEL('depth', '8', ['8', '16']), BOOL('ascii', false), RANGE], pgm, 'P5 / P2, 8 or 16-bit.'),
    F('ppm', 'PPM (pixmap)', 'ppm', ['ppm', 'pnm'], 'image/x-portable-pixmap', 'legacy', RGBA, [BOOL('ascii', false)], ppm, 'P6 / P3, 8-bit RGB.'),
    F('pam', 'PAM', 'pam', ['pam'], 'image/x-portable-arbitrarymap', 'legacy', RG, [SEL('depth', '8', ['8', '16']), RANGE], pam, 'P7: GRAYSCALE, RGB or RGB_ALPHA; 8 or 16-bit.'),
    F('sgi', 'SGI image', 'sgi', ['sgi', 'rgb', 'rgba', 'bw'], 'image/sgi', 'legacy', RG, [BOOL('rle', true), SEL('depth', '8', ['8', '16']), RANGE], sgi, 'RLE or verbatim 8-bit; 16-bit grey verbatim.'),
    F('ras', 'Sun Raster', 'ras', ['ras', 'sun'], 'image/x-sun-raster', 'legacy', RGBA, [BOOL('rle', false)], ras, '24-bit BGR, standard or byte-encoded (RLE).'),
    F('xbm', 'XBM', 'xbm', ['xbm'], 'image/x-xbitmap', 'legacy', RGBA, [NUM('threshold', 128, 1, 255)], xbm, 'X11 bitmap (C source), 1 = dark pixel.'),
    F('xpm', 'XPM', 'xpm', ['xpm'], 'image/x-xpixmap', 'legacy', RGBA, [NUM('colors', 256, 2, 256)], xpm, 'X11 pixmap, ≤256 colours (median cut), alpha < 128 → None.'),
    F('wbmp', 'WBMP', 'wbmp', ['wbmp'], 'image/vnd.wap.wbmp', 'legacy', RGBA, [NUM('threshold', 128, 1, 255)], wbmp, 'Wireless bitmap type 0, 1 = white.'),
    F('ff', 'Farbfeld', 'ff', ['ff'], 'image/x-farbfeld', 'legacy', RG, [RANGE], farbfeld, '16-bit big-endian RGBA.'),
    F('svg', 'SVG (embedded PNG)', 'svg', ['svg'], 'image/svg+xml', 'vector', RGBA, [SEL('units', 'px', ['px', 'mm'])], svg, 'One <image> with a PNG data URL; mm uses the pixel spacing for true size.'),
    F('eps', 'EPS', 'eps', ['eps', 'epsf'], 'application/postscript', 'vector', RGBA, [SEL('encoding', 'ascii85', ['ascii85', 'hex']), BOOL('grayscale', false)], eps, 'PostScript level 2 image operator, ASCII85 or ASCIIHex; 1 px = 1 pt unless dpi.'),
    F('pdf', 'PDF', 'pdf', ['pdf'], 'application/pdf', 'vector', RF, [Q(92)], pdf, 'Encoders.pdf: one JPEG page per frame.'),
    F('ico', 'Windows icon', 'ico', ['ico'], 'image/x-icon', 'icon', RGBA, [SEL('sizes', '16,32,48,256', ['16,32,48,256', '16,24,32,48,64,128,256', '16,32', '256']), SEL('entry', 'png', ['png', 'bmp'])], (c, o) => icoLike(c, o, 1),
      'Several sizes (image fitted into a square, transparent margins); PNG or 32-bit DIB entries.'),
    F('cur', 'Windows cursor', 'cur', ['cur'], 'image/x-win-bitmap', 'icon', RGBA, [SEL('size', '32', ['16', '32', '48', '64', '128', '256']), NUM('hotspotX', 0, 0, 255), NUM('hotspotY', 0, 0, 255), SEL('entry', 'bmp', ['bmp', 'png'])], (c, o) => icoLike(c, o, 2), 'One 32-bit DIB (or PNG) cursor image with a hot spot.'),
    F('icns', 'Apple icon', 'icns', ['icns'], 'image/icns', 'icon', RGBA, [SEL('sizes', '16,32,64,128,256,512', ['16,32,64,128,256,512', '16,32,64,128,256,512,1024', '128,256,512'])], icns, 'PNG entries icp4 … ic10.'),
    F('fits', 'FITS', 'fits', ['fits', 'fit', 'fts'], 'image/fits', 'scientific', RGF, [SEL('type', 'auto', ['auto', 'int16', 'float32']), BOOL('flipY', true)], fits,
      'BITPIX 16 (BZERO 32768 for unsigned, BSCALE/BZERO for other ranges) or -32; NAXIS3 for frames or RGB; rows bottom-up like FITS viewers expect.'),
    F('nifti', 'NIfTI-1', 'nii', ['nii'], 'application/x-nifti', 'medical', RGF, [VTYPE], (c, o) => nifti(c, o, false),
      'Single file n+1, datatype from the raw values (int16 / uint16 / float32 / uint8 / RGB24), pixdim from spacing + slice thickness (mm), qform/sform 0, rows as shown.'),
    F('nifti-gz', 'NIfTI-1 (gzip)', 'nii.gz', ['nii.gz'], 'application/gzip', 'medical', RGF, [VTYPE], (c, o) => nifti(c, o, true), 'Gzipped .nii.'),
    F('analyze', 'Analyze 7.5 (.hdr + .img)', 'zip', ['hdr', 'img'], 'application/zip', 'medical', RGF, [VTYPE], null,
      'Two files: encode() returns a ZIP with both, encodeFiles() returns them separately. uint16 is stored as int16 (fits) or int32, RGB as grey.', { files: analyzeFiles }),
    F('mha', 'MetaImage (.mha)', 'mha', ['mha'], 'application/octet-stream', 'medical', RGF, [VTYPE, BOOL('compress', false)], async (c, o) => (await metaFiles(c, o, true))[0].data, 'ITK MetaImage, header + data in one file; optional zlib.'),
    F('mhd', 'MetaImage (.mhd + .raw)', 'zip', ['mhd', 'raw'], 'application/zip', 'medical', RGF, [VTYPE, BOOL('compress', false)], null, 'Two files (ZIP from encode(), separate from encodeFiles()).', { files: (c, o) => metaFiles(c, o, false) }),
    F('nrrd', 'NRRD', 'nrrd', ['nrrd'], 'application/octet-stream', 'medical', RGF, [VTYPE, SEL('encoding', 'raw', ['raw', 'gzip'])], nrrd, 'NRRD0004, raw or gzip encoding, spacings in mm.'),
  ];
  for (const f of FORMATS) {
    if (!f.isAvailable) f.isAvailable = async () => true;
    Object.defineProperty(f, '_enc', { enumerable: false });
    if (f.files) Object.defineProperty(f, 'files', { enumerable: false });
  }
  const BY_ID = new Map(FORMATS.map((f) => [f.id, f]));
  function get(id) { return BY_ID.get(String(id).toLowerCase()) || null; }
  function byExt(ext) {
    const e = String(ext).toLowerCase().replace(/^\./, '');
    return FORMATS.find((f) => f.ext === e && f._enc) || FORMATS.find((f) => f.exts.includes(e)) || null;
  }
  function defaults(id) { const f = get(id); const o = {}; if (f) for (const opt of f.options) o[opt.key] = opt.default; return o; }
  async function isAvailable(id) { const f = get(id); return !!f && f.isAvailable(); }
  function lookup(id) { const f = get(id); if (!f) throw new Error(`ImageExport: unknown format ${id}`); return f; }
  async function encodeFiles(id, input, options = {}) {
    const f = lookup(id), ctx = prep(input), o = { ...defaults(f.id), ...options };
    if (f.files) return f.files(ctx, o);
    return [{ name: `${ctx.name}.${f.ext}`, data: await f._enc(ctx, o) }];
  }
  async function encode(id, input, options = {}) {
    const f = lookup(id);
    if (f.files) { const files = await encodeFiles(id, input, options); return (await encoders()).zip(files); }
    const out = await f._enc(prep(input), { ...defaults(f.id), ...options });
    return out instanceof Uint8Array ? out : new Uint8Array(out);
  }

  return { FORMATS, encode, encodeFiles, isAvailable, get, byExt, defaults, setVendorBase, fitSquare, resizeRGBA, crc32 };
});
