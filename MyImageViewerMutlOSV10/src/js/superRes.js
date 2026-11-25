/* Super-resolution: the algorithm catalogue, each algorithm's parameters, and the built-in
 * (no-download) upscalers.
 *
 * Two kinds of algorithm:
 *   builtin — resampling done here (nearest, bilinear, bicubic, Lanczos) in a Web Worker,
 *             with an optional unsharp mask after it;
 *   ai      — a neural network run by one of three downloadable engines (host
 *             superres.rs: Real-ESRGAN, Real-CUGAN, waifu2x, ncnn-vulkan builds). The host
 *             checks every parameter again before it builds the engine's command line.
 *
 * The same file is the worker: loaded with `new Worker('js/superRes.js')` it answers
 * { cmd: 'upscale' } messages. UMD, so the maths is unit-tested in Node (tests/cases).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SuperRes = api;
  // Worker side: no document, a message port of its own
  if (typeof document === 'undefined' && typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof module === 'undefined') {
    self.onmessage = (ev) => api._onWorkerMessage(ev, self);
  }
}(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  /** Largest result the page can hold (canvas limits, ~4 bytes a pixel several times over). */
  const MAX_SIDE = 16384;
  const MAX_PIXELS = 50e6;

  const TILE_OPTS = [0, 64, 128, 200, 256, 400, 512];

  // Every parameter: kind (select | range | check), its values, the default.
  // `labels` are i18n keys for select values (otherwise the value is shown: ×2, 128 px …).
  const P = {
    scale:       { kind: 'select', values: [1.5, 2, 3, 4, 6, 8], def: 2, fmt: 'x' },
    lobes:       { kind: 'select', values: [2, 3, 4], def: 3 },
    cubicA:      { kind: 'range', min: -1, max: -0.25, step: 0.05, def: -0.5 },
    sharpen:     { kind: 'range', min: 0, max: 200, step: 5, def: 0, unit: '%' },
    sharpRadius: { kind: 'range', min: 0.5, max: 3, step: 0.1, def: 1, unit: 'px' },
    outScale:    { kind: 'select', values: [2, 3, 4], def: 4, fmt: 'x' },
    noise:       { kind: 'select', values: [-1, 0, 1, 2, 3], def: 0 },
    syncgap:     { kind: 'select', values: [0, 1, 2, 3], def: 3 },
    tile:        { kind: 'select', values: TILE_OPTS, def: 0, fmt: 'px' },
    tta:         { kind: 'check', def: false },
    gpu:         { kind: 'select', values: ['auto', 'cpu', '0', '1'], def: 'auto' },
    // PyTorch models: GPU when there is one (CUDA / Apple MPS / OpenCL for ESPCN), else the CPU
    device:      { kind: 'select', values: ['auto', 'gpu', 'cpu'], def: 'auto' },
    // Tiles share this many pixels with their neighbours (averaged: fewer seams)
    overlap:     { kind: 'select', values: [8, 16, 32, 48, 64], def: 32, fmt: 'px' },
    // FP16 on a GPU: faster, half the memory (the CPU always uses FP32)
    precision:   { kind: 'select', values: ['fp32', 'fp16'], def: 'fp32' },
    // AuraSR: 64 px tiles sent to the GPU at once (0 = automatic)
    batch:       { kind: 'select', values: [0, 1, 2, 4, 8, 16], def: 0 },
    // AuraSR: a second, offset pass blended in (clean seams) or one pass (about twice as fast)
    seams:       { kind: 'select', values: ['overlap', 'single'], def: 'overlap' },
  };

  const AI_COMMON = ['tile', 'gpu', 'tta', 'sharpen', 'sharpRadius'];
  const PY_COMMON = ['device', 'precision', 'tile', 'overlap', 'sharpen', 'sharpRadius'];
  const PY_TILE = { values: [0, 128, 192, 256, 320, 384, 512, 768, 1024], def: 0 };
  const ALGORITHMS = [
    { id: 'nearest', kind: 'builtin', params: ['scale'] },
    // Tuned defaults: interpolation softens, so a little unsharp mask after it (less for the
    // sharper filters); the AI models already restore detail and get none.
    { id: 'bilinear', kind: 'builtin', params: ['scale', 'sharpen', 'sharpRadius'], over: { sharpen: { def: 50 }, sharpRadius: { def: 1.2 } } },
    { id: 'bicubic', kind: 'builtin', params: ['scale', 'cubicA', 'sharpen', 'sharpRadius'], over: { sharpen: { def: 30 } } },
    { id: 'lanczos', kind: 'builtin', params: ['scale', 'lobes', 'sharpen', 'sharpRadius'], over: { sharpen: { def: 20 } } },
    { id: 'esrgan-x4plus', kind: 'ai', engine: 'realesrgan', params: ['outScale', ...AI_COMMON], native: 4 },
    { id: 'esrgan-x4plus-anime', kind: 'ai', engine: 'realesrgan', params: ['outScale', ...AI_COMMON], native: 4 },
    { id: 'esrgan-animevideov3', kind: 'ai', engine: 'realesrgan', params: ['scale', ...AI_COMMON],
      over: { scale: { values: [2, 3, 4], def: 4 } } },
    { id: 'cugan-se', kind: 'ai', engine: 'realcugan', params: ['scale', 'noise', 'syncgap', ...AI_COMMON],
      over: { scale: { values: [2, 3, 4], def: 2 }, noise: { def: -1 } } },
    { id: 'cugan-pro', kind: 'ai', engine: 'realcugan', params: ['scale', 'noise', 'syncgap', ...AI_COMMON],
      over: { scale: { values: [2, 3], def: 2 }, noise: { values: [-1, 0, 3], def: -1 } } },
    { id: 'waifu2x-cunet', kind: 'ai', engine: 'waifu2x', params: ['scale', 'noise', ...AI_COMMON],
      over: { scale: { values: [1, 2, 4, 8, 16, 32], def: 2 }, noise: { def: 1 } } },
    { id: 'waifu2x-photo', kind: 'ai', engine: 'waifu2x', params: ['scale', 'noise', ...AI_COMMON],
      over: { scale: { values: [2, 4, 8, 16, 32], def: 2 }, noise: { def: 1 } } },
    { id: 'waifu2x-anime', kind: 'ai', engine: 'waifu2x', params: ['scale', 'noise', ...AI_COMMON],
      over: { scale: { values: [2, 4, 8, 16, 32], def: 2 }, noise: { def: 1 } } },
    // PyTorch family (the app's own Python environment, host superres_py.rs + sr_worker.py)
    { id: 'swinir-classical', kind: 'ai', engine: 'swinir', py: true, params: ['scale', ...PY_COMMON],
      over: { scale: { values: [2, 3, 4, 8], def: 4 }, tile: PY_TILE } },
    { id: 'swinir-real', kind: 'ai', engine: 'swinir', py: true, params: ['scale', ...PY_COMMON],
      over: { scale: { values: [2, 4], def: 4 }, tile: PY_TILE } },
    { id: 'swinir-real-large', kind: 'ai', engine: 'swinir', py: true, params: ['outScale', ...PY_COMMON], native: 4,
      over: { tile: PY_TILE } },
    { id: 'swinir-light', kind: 'ai', engine: 'swinir', py: true, params: ['scale', ...PY_COMMON],
      over: { scale: { values: [2, 3, 4], def: 4 }, tile: PY_TILE } },
    { id: 'edsr', kind: 'ai', engine: 'edsr', py: true, params: ['scale', ...PY_COMMON],
      over: { scale: { values: [2, 3, 4], def: 4 }, tile: PY_TILE } },
    { id: 'aurasr', kind: 'ai', engine: 'aurasr', py: true, params: ['outScale', 'device', 'precision', 'batch', 'seams', 'sharpen', 'sharpRadius'], native: 4 },
    { id: 'espcn', kind: 'ai', engine: 'espcn', py: true, params: ['scale', 'device', 'sharpen', 'sharpRadius'],
      over: { scale: { values: [2, 3, 4], def: 4 } } },
  ];
  const BY_ID = Object.fromEntries(ALGORITHMS.map((a) => [a.id, a]));
  /** The first-run choice: best quality for photos where the engines exist, else the best built-in. */
  const DEFAULT_AI = 'esrgan-x4plus';
  const DEFAULT_BUILTIN = 'lanczos';

  const ENGINES = [
    { key: 'realesrgan', label: 'Real-ESRGAN', algos: ['esrgan-x4plus', 'esrgan-x4plus-anime', 'esrgan-animevideov3'], site: 'https://github.com/xinntao/Real-ESRGAN' },
    { key: 'realcugan', label: 'Real-CUGAN', algos: ['cugan-se', 'cugan-pro'], site: 'https://github.com/nihui/realcugan-ncnn-vulkan' },
    { key: 'waifu2x', label: 'waifu2x', algos: ['waifu2x-cunet', 'waifu2x-photo', 'waifu2x-anime'], site: 'https://github.com/nihui/waifu2x-ncnn-vulkan' },
    { key: 'swinir', label: 'SwinIR', py: true, algos: ['swinir-classical', 'swinir-real', 'swinir-real-large', 'swinir-light'], site: 'https://github.com/JingyunLiang/SwinIR' },
    { key: 'edsr', label: 'EDSR', py: true, algos: ['edsr'], site: 'https://github.com/sanghyun-son/EDSR-PyTorch' },
    { key: 'aurasr', label: 'AuraSR', py: true, algos: ['aurasr'], site: 'https://huggingface.co/fal/AuraSR-v2' },
    { key: 'espcn', label: 'ESPCN', py: true, algos: ['espcn'], site: 'https://github.com/fannymonori/TF-ESPCN' },
  ];

  /** The output file formats, JPG first (the default). `alpha`: keeps transparency. */
  const FORMATS = [
    { ext: 'jpg', mime: 'image/jpeg', label: 'JPG', lossy: true, alpha: false },
    { ext: 'png', mime: 'image/png', label: 'PNG', lossy: false, alpha: true },
    { ext: 'webp', mime: 'image/webp', label: 'WEBP', lossy: true, alpha: true },
    { ext: 'avif', mime: 'image/avif', label: 'AVIF', lossy: true, alpha: true },
    { ext: 'gif', mime: 'image/gif', label: 'GIF', lossy: false, alpha: true },
    { ext: 'bmp', mime: 'image/bmp', label: 'BMP', lossy: false, alpha: false },
  ];

  function algorithm(id) { return BY_ID[id] || null; }

  /** The parameter's spec for this algorithm (its own values / default win). */
  function paramSpec(algoId, key, params) {
    const a = BY_ID[algoId];
    const base = P[key];
    if (!a || !base || !a.params.includes(key)) return null;
    const spec = { ...base, ...((a.over && a.over[key]) || {}) };
    // The noise levels a model exists for depend on the scale (Real-CUGAN SE)
    if (key === 'noise' && algoId === 'cugan-se') {
      const s = params && Number(params.scale);
      if (s === 3 || s === 4) spec.values = [-1, 0, 3];
    }
    if (key === 'noise' && algoId.startsWith('waifu2x') && params && Number(params.scale) === 1) spec.values = [0, 1, 2, 3];
    // Real-ESRGAN has no CPU mode
    if (key === 'gpu' && a.engine === 'realesrgan') spec.values = ['auto', '0', '1'];
    return spec;
  }

  function _nearest(v, values) {
    let best = values[0];
    for (const c of values) if (Math.abs(c - v) < Math.abs(best - v) || (Math.abs(c - v) === Math.abs(best - v) && c > best)) best = c;
    return best;
  }

  /** Defaults filled in, every value forced into its allowed set (same rules as the host). */
  function normalize(algoId, params) {
    const a = BY_ID[algoId];
    if (!a) return {};
    const out = {};
    const src = params || {};
    // scale first: the noise list depends on it
    const order = a.params.includes('scale') ? ['scale', ...a.params.filter((k) => k !== 'scale')] : a.params;
    for (const key of order) {
      const spec = paramSpec(algoId, key, out);
      let v = src[key];
      if (spec.kind === 'check') v = v == null ? spec.def : !!v;
      else if (spec.kind === 'range') {
        v = Number(v);
        if (!Number.isFinite(v)) v = spec.def;
        v = Math.min(spec.max, Math.max(spec.min, Math.round(v / spec.step) * spec.step));
        v = Math.round(v * 1000) / 1000;
      } else {
        const numeric = typeof spec.values[0] === 'number';
        if (numeric) {
          v = Number(v);
          if (!Number.isFinite(v)) v = spec.def;
          if (!spec.values.includes(v)) v = spec.values.includes(spec.def) && src[key] == null ? spec.def : _nearest(v, spec.values);
        } else {
          v = v == null ? spec.def : String(v);
          if (!spec.values.includes(v)) v = spec.def;
        }
      }
      out[key] = v;
    }
    return out;
  }

  function defaults(algoId) { return normalize(algoId, {}); }

  /** The largest scale this algorithm can make (its last scale value). */
  function maxScale(algoId) {
    const a = BY_ID[algoId];
    if (!a) return 1;
    const spec = paramSpec(algoId, a.params.includes('outScale') ? 'outScale' : 'scale', {});
    return spec ? spec.values[spec.values.length - 1] : 1;
  }

  /** The scale of the final picture. */
  function targetScale(algoId, params) {
    const a = BY_ID[algoId];
    if (!a) return 1;
    const p = normalize(algoId, params);
    return a.params.includes('outScale') ? p.outScale : (p.scale || 1);
  }

  /** What the engine itself makes (×4 for the x4plus models, whatever is asked). */
  function engineScale(algoId, params) {
    const a = BY_ID[algoId];
    if (!a) return 1;
    return a.native || targetScale(algoId, params);
  }

  function outputSize(w, h, algoId, params) {
    const k = targetScale(algoId, params);
    return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
  }

  /** null when the result fits, otherwise 'side' | 'pixels' (too large to hold). */
  function sizeProblem(w, h, algoId, params) {
    const o = outputSize(w, h, algoId, params);
    // The engine's own (larger) picture must fit as well
    const k = engineScale(algoId, params);
    const ew = Math.round(w * k), eh = Math.round(h * k);
    if (Math.max(o.width, o.height, ew, eh) > MAX_SIDE) return 'side';
    if (Math.max(o.width * o.height, ew * eh) > MAX_PIXELS) return 'pixels';
    return null;
  }

  function format(ext) {
    const e = String(ext || '').toLowerCase().replace(/^\./, '');
    return FORMATS.find((f) => f.ext === (e === 'jpeg' ? 'jpg' : e)) || null;
  }

  /* ═════════════ Resampling ═════════════ */

  function _sinc(x) {
    if (x === 0) return 1;
    const px = Math.PI * x;
    return Math.sin(px) / px;
  }

  /** { support, fn } of the reconstruction filter. */
  function kernel(method, opts = {}) {
    if (method === 'bilinear') return { support: 1, fn: (x) => { x = Math.abs(x); return x < 1 ? 1 - x : 0; } };
    if (method === 'bicubic') {
      const a = Number.isFinite(opts.cubicA) ? opts.cubicA : -0.5;
      return {
        support: 2,
        fn: (x) => {
          x = Math.abs(x);
          if (x <= 1) return ((a + 2) * x - (a + 3)) * x * x + 1;
          if (x < 2) return (((x - 5) * x + 8) * x - 4) * a;
          return 0;
        },
      };
    }
    if (method === 'lanczos') {
      const L = [2, 3, 4].includes(opts.lobes) ? opts.lobes : 3;
      return { support: L, fn: (x) => (Math.abs(x) < L ? _sinc(x) * _sinc(x / L) : 0) };
    }
    return null; // nearest
  }

  /**
   * Weights for resampling a line of `inLen` samples to `outLen`: for every output
   * sample its first input index, tap count and normalised weights. Shrinking widens the
   * filter (no aliasing), enlarging keeps it.
   */
  function _weights(inLen, outLen, k) {
    const scale = outLen / inLen;
    const stretch = scale < 1 ? 1 / scale : 1;
    const support = k.support * stretch;
    const taps = Math.ceil(support * 2) + 1;
    const start = new Int32Array(outLen);
    const count = new Int32Array(outLen);
    const w = new Float32Array(outLen * taps);
    for (let o = 0; o < outLen; o++) {
      const center = (o + 0.5) / scale - 0.5;
      const lo = Math.max(0, Math.floor(center - support) + 1);
      const hi = Math.min(inLen - 1, Math.ceil(center + support) - 1);
      let n = 0, sum = 0;
      const first = Math.min(lo, inLen - 1);
      for (let i = first; i <= Math.max(hi, first) && n < taps; i++, n++) {
        const v = k.fn((i - center) / stretch);
        w[o * taps + n] = v;
        sum += v;
      }
      if (n === 0) { w[o * taps] = 1; n = 1; sum = 1; }
      if (sum !== 0) for (let j = 0; j < n; j++) w[o * taps + j] /= sum;
      start[o] = first;
      count[o] = n;
    }
    return { start, count, w, taps };
  }

  function _nearestResize(src, ow, oh) {
    const { width: iw, height: ih, data } = src;
    const out = new Uint8ClampedArray(ow * oh * 4);
    const xs = new Int32Array(ow);
    for (let x = 0; x < ow; x++) xs[x] = Math.min(iw - 1, Math.floor((x + 0.5) * iw / ow)) * 4;
    const d32 = new Uint32Array(data.buffer, data.byteOffset, iw * ih);
    const o32 = new Uint32Array(out.buffer);
    for (let y = 0; y < oh; y++) {
      const sy = Math.min(ih - 1, Math.floor((y + 0.5) * ih / oh));
      const row = sy * iw, orow = y * ow;
      for (let x = 0; x < ow; x++) o32[orow + x] = d32[row + (xs[x] >> 2)];
    }
    return { width: ow, height: oh, data: out };
  }

  /**
   * Resize { width, height, data (RGBA) } to ow × oh with `method`. Alpha is premultiplied
   * while filtering, so see-through edges do not get dark fringes. onProgress(0..1).
   */
  function resample(src, ow, oh, method = 'lanczos', opts = {}, onProgress = null) {
    ow = Math.max(1, Math.round(ow));
    oh = Math.max(1, Math.round(oh));
    const k = kernel(method, opts);
    if (!k) return _nearestResize(src, ow, oh);
    const { width: iw, height: ih, data } = src;
    // Premultiplied float copy
    const pre = new Float32Array(iw * ih * 4);
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] / 255;
      pre[i] = data[i] * a; pre[i + 1] = data[i + 1] * a; pre[i + 2] = data[i + 2] * a; pre[i + 3] = data[i + 3];
    }
    // Pass 1: rows (iw → ow), ih rows
    const hw = _weights(iw, ow, k);
    const mid = new Float32Array(ow * ih * 4);
    const total = ih + oh;
    let lastTick = 0;
    const tick = (done) => {
      if (!onProgress) return;
      const f = done / total;
      if (f - lastTick >= 0.02 || done === total) { lastTick = f; onProgress(f); }
    };
    for (let y = 0; y < ih; y++) {
      const row = y * iw * 4, orow = y * ow * 4;
      for (let x = 0; x < ow; x++) {
        const s = hw.start[x], n = hw.count[x], base = x * hw.taps;
        let r = 0, g = 0, b = 0, a = 0;
        for (let j = 0; j < n; j++) {
          const wt = hw.w[base + j], p = row + (s + j) * 4;
          r += pre[p] * wt; g += pre[p + 1] * wt; b += pre[p + 2] * wt; a += pre[p + 3] * wt;
        }
        const o = orow + x * 4;
        mid[o] = r; mid[o + 1] = g; mid[o + 2] = b; mid[o + 3] = a;
      }
      tick(y + 1);
    }
    // Pass 2: columns (ih → oh)
    const vw = _weights(ih, oh, k);
    const out = new Uint8ClampedArray(ow * oh * 4);
    const stride = ow * 4;
    for (let y = 0; y < oh; y++) {
      const s = vw.start[y], n = vw.count[y], base = y * vw.taps;
      const orow = y * stride;
      for (let x = 0; x < ow; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        let p = s * stride + x * 4;
        for (let j = 0; j < n; j++, p += stride) {
          const wt = vw.w[base + j];
          r += mid[p] * wt; g += mid[p + 1] * wt; b += mid[p + 2] * wt; a += mid[p + 3] * wt;
        }
        const o = orow + x * 4;
        if (a <= 0.5) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; continue; }
        const inv = 255 / Math.min(255, a);
        out[o] = r * inv; out[o + 1] = g * inv; out[o + 2] = b * inv; out[o + 3] = a;
      }
      tick(ih + y + 1);
    }
    return { width: ow, height: oh, data: out };
  }

  /** Gaussian blur of the RGB channels (separable, radius = sigma), as floats. */
  function _blurRgb(src, sigma) {
    const { width: w, height: h, data } = src;
    const r = Math.max(1, Math.ceil(sigma * 3));
    const ker = new Float32Array(r * 2 + 1);
    let sum = 0;
    for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); ker[i + r] = v; sum += v; }
    for (let i = 0; i < ker.length; i++) ker[i] /= sum;
    const tmp = new Float32Array(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let a = 0, b = 0, c = 0;
        for (let i = -r; i <= r; i++) {
          const xx = Math.min(w - 1, Math.max(0, x + i)), p = (y * w + xx) * 4, k = ker[i + r];
          a += data[p] * k; b += data[p + 1] * k; c += data[p + 2] * k;
        }
        const o = (y * w + x) * 3;
        tmp[o] = a; tmp[o + 1] = b; tmp[o + 2] = c;
      }
    }
    const out = new Float32Array(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let a = 0, b = 0, c = 0;
        for (let i = -r; i <= r; i++) {
          const yy = Math.min(h - 1, Math.max(0, y + i)), p = (yy * w + x) * 3, k = ker[i + r];
          a += tmp[p] * k; b += tmp[p + 1] * k; c += tmp[p + 2] * k;
        }
        const o = (y * w + x) * 3;
        out[o] = a; out[o + 1] = b; out[o + 2] = c;
      }
    }
    return out;
  }

  /** Unsharp mask: amount in % (100 = add the full difference), radius = blur sigma in px. */
  function sharpen(src, amount, radius = 1) {
    const k = (Number(amount) || 0) / 100;
    if (k <= 0) return src;
    const blur = _blurRgb(src, Math.max(0.3, Number(radius) || 1));
    const { data } = src;
    const out = new Uint8ClampedArray(data.length);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      out[i] = data[i] + (data[i] - blur[j]) * k;
      out[i + 1] = data[i + 1] + (data[i + 1] - blur[j + 1]) * k;
      out[i + 2] = data[i + 2] + (data[i + 2] - blur[j + 2]) * k;
      out[i + 3] = data[i + 3];
    }
    return { width: src.width, height: src.height, data: out };
  }

  /**
   * The built-in path, or the finishing step after an AI engine: `src` resized to
   * ow × oh (skipped when it already is that size), then sharpened.
   */
  function finish(src, ow, oh, method, params, onProgress) {
    const p = params || {};
    const sharp = Number(p.sharpen) || 0;
    const share = sharp > 0 ? 0.8 : 1;
    let img = src;
    if (src.width !== ow || src.height !== oh) {
      img = resample(src, ow, oh, method, { cubicA: p.cubicA, lobes: p.lobes }, (f) => onProgress && onProgress(f * share));
    }
    if (sharp > 0) {
      img = sharpen(img, sharp, p.sharpRadius);
    }
    if (onProgress) onProgress(1);
    return img;
  }

  /** Built-in algorithm on `src` (pure; the worker and the tests call it). */
  function upscaleBuiltin(src, algoId, params, onProgress) {
    const p = normalize(algoId, params);
    const o = outputSize(src.width, src.height, algoId, p);
    return finish(src, o.width, o.height, algoId, p, onProgress);
  }

  /* ═════════════ Worker plumbing ═════════════ */

  function _onWorkerMessage(ev, port) {
    const m = ev.data || {};
    if (m.cmd !== 'upscale') return;
    try {
      const src = { width: m.width, height: m.height, data: new Uint8ClampedArray(m.buffer) };
      const progress = (f) => port.postMessage({ id: m.id, progress: f });
      const out = m.finishOnly
        ? finish(src, m.outW, m.outH, 'lanczos', m.params, progress)
        : upscaleBuiltin(src, m.algo, m.params, progress);
      const buf = out.data.buffer;
      port.postMessage({ id: m.id, done: true, width: out.width, height: out.height, buffer: buf }, [buf]);
    } catch (err) {
      port.postMessage({ id: m.id, error: (err && err.message) || String(err) });
    }
  }

  let _seq = 0;
  /**
   * Run in a worker: { width, height, data } → Promise<{ width, height, data }>.
   * job = { algo, params } (built-in) or { finishOnly: true, outW, outH, params } (after AI).
   * `signal.cancelled` set by the caller stops it (the worker is terminated).
   */
  function runInWorker(src, job, onProgress, signal) {
    return new Promise((resolve, reject) => {
      let worker;
      const url = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || 'js/superRes.js';
      try { worker = new Worker(_workerUrl || url); }
      catch (err) {
        // No worker (file:// page): do it here
        try {
          const img = job.finishOnly ? finish(src, job.outW, job.outH, 'lanczos', job.params, onProgress) : upscaleBuiltin(src, job.algo, job.params, onProgress);
          resolve(img);
        } catch (e) { reject(e); }
        return;
      }
      const id = ++_seq;
      const timer = setInterval(() => {
        if (signal && signal.cancelled) { clearInterval(timer); worker.terminate(); reject(Object.assign(new Error('cancelled'), { code: 'CANCELLED' })); }
      }, 100);
      worker.onmessage = (ev) => {
        const m = ev.data || {};
        if (m.id !== id) return;
        if (m.progress != null) { if (onProgress) onProgress(m.progress); return; }
        clearInterval(timer);
        worker.terminate();
        if (m.error) reject(new Error(m.error));
        else resolve({ width: m.width, height: m.height, data: new Uint8ClampedArray(m.buffer) });
      };
      worker.onerror = (ev) => { clearInterval(timer); worker.terminate(); reject(new Error((ev && ev.message) || 'worker failed')); };
      const copy = new Uint8ClampedArray(src.data); // the editor keeps its own pixels
      worker.postMessage({ cmd: 'upscale', id, width: src.width, height: src.height, buffer: copy.buffer, ...job }, [copy.buffer]);
    });
  }
  // Captured while the script tag runs (document.currentScript is gone later)
  const _workerUrl = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || null;

  return {
    MAX_SIDE, MAX_PIXELS, DEFAULT_AI, DEFAULT_BUILTIN, ALGORITHMS, ENGINES, FORMATS, PARAMS: P,
    algorithm, paramSpec, normalize, defaults, maxScale, targetScale, engineScale, outputSize, sizeProblem, format,
    kernel, resample, sharpen, finish, upscaleBuiltin, runInWorker, _onWorkerMessage,
  };
}));
