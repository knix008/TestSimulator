/* Image-processing filters for the viewer's render pipeline (grey values before windowing, or RGBA).
 *
 *   ImageFilters.apply(name, input, params) → output
 *     input  { values: Float32Array, width, height }                 grey: rescaled values (HU …), NaN = padding
 *            { rgba: Uint8ClampedArray, width, height, channels? }   colour: RGBA (alpha is kept)
 *     output { values, width, height, range: { min, max } }  or  { rgba, width, height }
 *     The input is never modified. NaN pixels stay NaN (padding) and never leak into their neighbours;
 *     borders are handled by clamping to the edge, so no new NaN appears.
 *   ImageFilters.FILTERS   [{ id, label, params: [{ name, label, type, min, max, step, default, options? }] }]
 *   ImageFilters.defaults(name) → { param: default }
 *   ImageFilters.chain(list, input) — apply [{ name, params }] in order
 *
 * Filters: smooth (Gaussian σ), sharpen (unsharp mask: amount, radius), edge (Sobel magnitude), emboss,
 * median (3×3 / 5×5), laplacian (4- / 8-neighbour), invert, equalize (histogram equalisation, remapped into
 * the original range), denoise (bilateral), threshold (value → binary min / max).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ImageFilters = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FILTERS = [
    { id: 'smooth', label: 'Smooth (Gaussian)', params: [{ name: 'sigma', label: 'Sigma', type: 'number', min: 0.3, max: 10, step: 0.1, default: 1.2 }] },
    { id: 'sharpen', label: 'Sharpen (unsharp mask)', params: [
      { name: 'amount', label: 'Amount', type: 'number', min: 0.1, max: 5, step: 0.1, default: 1 },
      { name: 'radius', label: 'Radius', type: 'number', min: 0.3, max: 10, step: 0.1, default: 1.5 }] },
    { id: 'edge', label: 'Edges (Sobel)', params: [] },
    { id: 'emboss', label: 'Emboss', params: [] },
    { id: 'median', label: 'Median', params: [{ name: 'size', label: 'Size', type: 'select', options: [3, 5], default: 3 }] },
    { id: 'laplacian', label: 'Laplacian', params: [{ name: 'neighbours', label: 'Neighbours', type: 'select', options: [4, 8], default: 4 }] },
    { id: 'invert', label: 'Invert', params: [] },
    { id: 'equalize', label: 'Histogram equalisation', params: [{ name: 'bins', label: 'Bins', type: 'number', min: 16, max: 65536, step: 1, default: 4096 }] },
    { id: 'denoise', label: 'Denoise (bilateral)', params: [
      { name: 'sigmaSpatial', label: 'Spatial sigma', type: 'number', min: 0.5, max: 6, step: 0.1, default: 1.5 },
      { name: 'sigmaRange', label: 'Range sigma (fraction of the value range)', type: 'number', min: 0.005, max: 1, step: 0.005, default: 0.08 }] },
    { id: 'threshold', label: 'Threshold', params: [{ name: 'value', label: 'Value', type: 'number', default: null }] },
  ];
  const BY_ID = Object.fromEntries(FILTERS.map((f) => [f.id, f]));

  function defaults(name) {
    const f = BY_ID[name];
    if (!f) throw new Error(`Unknown filter ${name}`);
    return Object.fromEntries(f.params.map((p) => [p.name, p.default]));
  }

  /* ── helpers ── */
  function rangeOf(v) {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < v.length; i++) { const x = v[i]; if (x === x) { if (x < min) min = x; if (x > max) max = x; } }
    if (min === Infinity) { min = 0; max = 0; }
    return { min, max };
  }
  function hasNaN(v) { for (let i = 0; i < v.length; i++) if (v[i] !== v[i]) return true; return false; }
  // copy with NaN replaced by `fill`
  function filled(v, fill) { const o = new Float32Array(v.length); for (let i = 0; i < v.length; i++) { const x = v[i]; o[i] = x === x ? x : fill; } return o; }
  function restoreNaN(src, out) { for (let i = 0; i < src.length; i++) if (src[i] !== src[i]) out[i] = NaN; return out; }

  function gaussKernel(sigma) {
    const s = Math.max(0.1, +sigma || 1);
    const r = Math.max(1, Math.ceil(s * 3));
    const k = new Float32Array(2 * r + 1);
    let sum = 0;
    for (let i = -r; i <= r; i++) { const w = Math.exp(-(i * i) / (2 * s * s)); k[i + r] = w; sum += w; }
    for (let i = 0; i < k.length; i++) k[i] /= sum;
    return k;
  }

  // separable convolution, clamp-to-edge borders
  function convolveSep(src, w, h, k) {
    const r = (k.length - 1) >> 1, n = k.length;
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    const row = new Float32Array(w + 2 * r);
    for (let y = 0; y < h; y++) {
      const off = y * w;
      for (let i = 0; i < r; i++) { row[i] = src[off]; row[r + w + i] = src[off + w - 1]; }
      for (let x = 0; x < w; x++) row[r + x] = src[off + x];
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let j = 0; j < n; j++) s += k[j] * row[x + j];
        tmp[off + x] = s;
      }
    }
    for (let y = 0; y < h; y++) {
      const off = y * w;
      for (let j = 0; j < n; j++) {
        let yy = y + j - r; yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy;
        const kj = k[j], so = yy * w;
        for (let x = 0; x < w; x++) out[off + x] += kj * tmp[so + x];
      }
    }
    return out;
  }

  // Gaussian blur that ignores NaN neighbours (normalised convolution) and keeps NaN pixels NaN
  function gaussian(v, w, h, sigma) {
    const k = gaussKernel(sigma);
    if (!hasNaN(v)) return convolveSep(v, w, h, k);
    const m = new Float32Array(v.length), z = new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) { const x = v[i]; if (x === x) { m[i] = 1; z[i] = x; } }
    const bz = convolveSep(z, w, h, k), bm = convolveSep(m, w, h, k);
    for (let i = 0; i < v.length; i++) bz[i] = m[i] ? (bm[i] > 1e-12 ? bz[i] / bm[i] : v[i]) : NaN;
    return bz;
  }

  // generic 3×3 convolution with clamped borders
  function conv3(v, w, h, k) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const ym = y > 0 ? y - 1 : 0, yp = y < h - 1 ? y + 1 : h - 1;
      const r0 = ym * w, r1 = y * w, r2 = yp * w;
      for (let x = 0; x < w; x++) {
        const xm = x > 0 ? x - 1 : 0, xp = x < w - 1 ? x + 1 : w - 1;
        out[r1 + x] = k[0] * v[r0 + xm] + k[1] * v[r0 + x] + k[2] * v[r0 + xp]
          + k[3] * v[r1 + xm] + k[4] * v[r1 + x] + k[5] * v[r1 + xp]
          + k[6] * v[r2 + xm] + k[7] * v[r2 + x] + k[8] * v[r2 + xp];
      }
    }
    return out;
  }

  function sobel(v, w, h) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const ym = y > 0 ? y - 1 : 0, yp = y < h - 1 ? y + 1 : h - 1;
      const r0 = ym * w, r1 = y * w, r2 = yp * w;
      for (let x = 0; x < w; x++) {
        const xm = x > 0 ? x - 1 : 0, xp = x < w - 1 ? x + 1 : w - 1;
        const a = v[r0 + xm], b = v[r0 + x], c = v[r0 + xp], d = v[r1 + xm], f = v[r1 + xp], g = v[r2 + xm], hh = v[r2 + x], i = v[r2 + xp];
        const gx = (c + 2 * f + i) - (a + 2 * d + g);
        const gy = (g + 2 * hh + i) - (a + 2 * b + c);
        out[r1 + x] = Math.sqrt(gx * gx + gy * gy);
      }
    }
    return out;
  }

  function median(v, w, h, size) {
    const r = size >= 5 ? 2 : 1;
    const out = new Float32Array(w * h);
    const buf = new Float32Array((2 * r + 1) * (2 * r + 1));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = v[y * w + x];
        if (c !== c) { out[y * w + x] = NaN; continue; }
        let n = 0;
        for (let dy = -r; dy <= r; dy++) {
          let yy = y + dy; yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy;
          const ro = yy * w;
          for (let dx = -r; dx <= r; dx++) {
            let xx = x + dx; xx = xx < 0 ? 0 : xx >= w ? w - 1 : xx;
            const s = v[ro + xx];
            if (s !== s) continue;
            // insertion sort as we go
            let j = n++;
            while (j > 0 && buf[j - 1] > s) { buf[j] = buf[j - 1]; j--; }
            buf[j] = s;
          }
        }
        out[y * w + x] = (n & 1) ? buf[n >> 1] : 0.5 * (buf[(n >> 1) - 1] + buf[n >> 1]);
      }
    }
    return out;
  }

  // robust range (1st..99th percentile) for range-relative parameters
  function robustRange(v) {
    const { min, max } = rangeOf(v);
    if (!(max > min)) return { lo: min, hi: max, span: 0 };
    const B = 2048, hist = new Uint32Array(B), k = (B - 1) / (max - min);
    let n = 0;
    for (let i = 0; i < v.length; i++) { const x = v[i]; if (x === x) { hist[((x - min) * k) | 0]++; n++; } }
    const pick = (q) => { const target = q * n; let acc = 0; for (let b = 0; b < B; b++) { acc += hist[b]; if (acc >= target) return min + b / k; } return max; };
    const lo = pick(0.01), hi = pick(0.99);
    return { lo, hi, span: Math.max(hi - lo, (max - min) * 0.05) };
  }

  // Bilateral filter, separable approximation (a row pass then a column pass — Pham & van Vliet 2005):
  // edge-preserving smoothing at ~2·(2r+1) taps per pixel instead of (2r+1)².
  function bilateral(v, w, h, sigmaS, sigmaRangeFrac) {
    const ss = Math.max(0.3, +sigmaS || 1.5);
    const r = Math.max(1, Math.ceil(ss * 2));
    const span = robustRange(v).span || 1;
    const sr = Math.max(1e-12, (+sigmaRangeFrac || 0.08) * span);
    const ws = new Float32Array(2 * r + 1);
    for (let i = -r; i <= r; i++) ws[i + r] = Math.exp(-(i * i) / (2 * ss * ss));
    // range weights over |d| / sr in [0, 4); the last entry (and anything beyond) is 0
    const TN = 1024, TMAX = 4, tab = new Float32Array(TN + 1);
    for (let i = 0; i < TN; i++) { const q = (i / TN) * TMAX; tab[i] = Math.exp(-0.5 * q * q); }
    const tk = TN / (TMAX * sr);
    // one 1D pass: stride 1 (rows) or w (columns)
    const pass = (src, horizontal) => {
      const out = new Float32Array(w * h);
      const len = horizontal ? w : h, lines = horizontal ? h : w;
      const step = horizontal ? 1 : w, lineStep = horizontal ? w : 1;
      for (let l = 0; l < lines; l++) {
        const base = l * lineStep;
        for (let i = 0; i < len; i++) {
          const p = base + i * step, c = src[p];
          if (c !== c) { out[p] = NaN; continue; }
          let sw = 0, sv = 0;
          const lo = i - r < 0 ? 0 : i - r, hi = i + r >= len ? len - 1 : i + r;
          for (let j = lo; j <= hi; j++) {
            const s = src[base + j * step];
            if (s !== s) continue;   // NaN neighbour
            let ti = (Math.abs(s - c) * tk) | 0;
            if (!(ti < TN) || ti < 0) ti = TN;
            const wt = ws[j - i + r] * tab[ti];
            if (wt > 0) { sw += wt; sv += wt * s; }
          }
          out[p] = sw > 0 ? sv / sw : c;
        }
      }
      return out;
    };
    return pass(pass(v, true), false);
  }

  // histogram equalisation; returns the value map remapped into [min, max]
  function equalize(v, bins) {
    const { min, max } = rangeOf(v);
    const out = new Float32Array(v.length);
    if (!(max > min)) { out.set(v); return out; }
    const B = Math.max(16, Math.min(65536, bins | 0 || 4096));
    const hist = new Uint32Array(B), k = (B - 1) / (max - min);
    let n = 0;
    for (let i = 0; i < v.length; i++) { const x = v[i]; if (x === x) { hist[Math.round((x - min) * k)]++; n++; } }
    const cdf = new Float64Array(B);
    let acc = 0, cdfMin = 0;
    for (let b = 0; b < B; b++) { acc += hist[b]; cdf[b] = acc; if (!cdfMin && acc) cdfMin = acc; }
    const denom = n - cdfMin || 1;
    const map = new Float32Array(B);
    for (let b = 0; b < B; b++) map[b] = min + Math.max(0, (cdf[b] - cdfMin) / denom) * (max - min);
    for (let i = 0; i < v.length; i++) { const x = v[i]; out[i] = x === x ? map[Math.round((x - min) * k)] : NaN; }
    return out;
  }

  /* ── grey (value) filters ── */
  function applyValues(name, v, w, h, p) {
    const nan = hasNaN(v);
    const fillLow = () => (nan ? filled(v, rangeOf(v).min) : v);
    switch (name) {
      case 'smooth': return gaussian(v, w, h, p.sigma);
      case 'sharpen': {
        const b = gaussian(v, w, h, p.radius);
        const a = +p.amount;
        const out = new Float32Array(v.length);
        for (let i = 0; i < v.length; i++) out[i] = v[i] + a * (v[i] - b[i]);
        return out;   // NaN stays NaN (v[i] is NaN there)
      }
      case 'edge': { const o = sobel(fillLow(), w, h); return nan ? restoreNaN(v, o) : o; }
      case 'emboss': { const o = conv3(fillLow(), w, h, [-2, -1, 0, -1, 1, 1, 0, 1, 2]); return nan ? restoreNaN(v, o) : o; }
      case 'laplacian': {
        const k = +p.neighbours === 8 ? [1, 1, 1, 1, -8, 1, 1, 1, 1] : [0, 1, 0, 1, -4, 1, 0, 1, 0];
        const o = conv3(fillLow(), w, h, k); return nan ? restoreNaN(v, o) : o;
      }
      case 'median': return median(v, w, h, +p.size || 3);
      case 'invert': {
        const { min, max } = rangeOf(v), s = min + max, out = new Float32Array(v.length);
        for (let i = 0; i < v.length; i++) out[i] = s - v[i];
        return out;
      }
      case 'equalize': return equalize(v, p.bins);
      case 'denoise': return bilateral(v, w, h, p.sigmaSpatial, p.sigmaRange);
      case 'threshold': {
        const { min, max } = rangeOf(v);
        const t = Number.isFinite(+p.value) && p.value !== null && p.value !== '' ? +p.value : (min + max) / 2;
        const out = new Float32Array(v.length);
        for (let i = 0; i < v.length; i++) { const x = v[i]; out[i] = x === x ? (x >= t ? max : min) : NaN; }
        return out;
      }
      default: throw new Error(`Unknown filter ${name}`);
    }
  }

  /* ── colour (RGBA) filters: per channel, or on luminance where colour must be kept ── */
  function applyRgba(name, rgba, w, h, channels, p) {
    const n = w * h, ch = channels || 4;
    const out = new Uint8ClampedArray(rgba.length);
    if (ch === 4) for (let i = 0; i < n; i++) out[i * 4 + 3] = rgba[i * 4 + 3];
    const plane = (c) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = rgba[i * ch + c]; return o; };
    const lum = () => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = 0.299 * rgba[i * ch] + 0.587 * rgba[i * ch + 1] + 0.114 * rgba[i * ch + 2]; return o; };
    if (name === 'invert') {
      for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) out[i * ch + c] = 255 - rgba[i * ch + c];
      return out;
    }
    if (name === 'equalize' || name === 'threshold') {
      const Y = lum();
      if (name === 'threshold') {
        const t = Number.isFinite(+p.value) && p.value !== null && p.value !== '' ? +p.value : 128;
        for (let i = 0; i < n; i++) { const g = Y[i] >= t ? 255 : 0; out[i * ch] = out[i * ch + 1] = out[i * ch + 2] = g; }
        return out;
      }
      // equalise the luminance over the full 0..255 scale, scale the colour with it
      const hist = new Uint32Array(256);
      for (let i = 0; i < n; i++) hist[Math.round(Y[i])]++;
      let acc = 0, cdfMin = 0; const map = new Float32Array(256);
      for (let b = 0; b < 256; b++) { acc += hist[b]; if (!cdfMin && acc) cdfMin = acc; map[b] = acc; }
      for (let b = 0; b < 256; b++) map[b] = Math.max(0, (map[b] - cdfMin) / ((n - cdfMin) || 1)) * 255;
      for (let i = 0; i < n; i++) {
        const y = Y[i], ny = map[Math.round(y)];
        if (y < 0.5) { out[i * ch] = out[i * ch + 1] = out[i * ch + 2] = ny; continue; }
        const k = ny / y;
        for (let c = 0; c < 3; c++) out[i * ch + c] = rgba[i * ch + c] * k;
      }
      return out;
    }
    for (let c = 0; c < 3; c++) {
      const r = applyValues(name, plane(c), w, h, p);
      for (let i = 0; i < n; i++) out[i * ch + c] = r[i];   // Uint8Clamped rounds and clamps
    }
    return out;
  }

  function apply(name, input, params) {
    if (!BY_ID[name]) throw new Error(`Unknown filter ${name}`);
    const p = { ...defaults(name), ...(params || {}) };
    const { width: w, height: h } = input;
    if (input.values) {
      if (input.values.length < w * h) throw new Error('values size mismatch');
      const src = input.values.length === w * h && input.values instanceof Float32Array ? input.values : Float32Array.from(input.values.subarray ? input.values.subarray(0, w * h) : input.values.slice(0, w * h));
      const values = applyValues(name, src, w, h, p);
      return { values, width: w, height: h, range: rangeOf(values) };
    }
    if (input.rgba) {
      const ch = input.channels || 4;
      return { rgba: applyRgba(name, input.rgba, w, h, ch, p), width: w, height: h };
    }
    throw new Error('apply: values or rgba required');
  }

  function chain(list, input) {
    let cur = input;
    for (const f of list || []) {
      const r = apply(f.name, cur, f.params);
      cur = r.values ? { values: r.values, width: r.width, height: r.height } : { rgba: r.rgba, width: r.width, height: r.height, channels: input.channels };
    }
    return cur.values ? { ...cur, range: rangeOf(cur.values) } : cur;
  }

  return { apply, chain, FILTERS, defaults, gaussKernel, rangeOf };
});
