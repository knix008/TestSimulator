// Shared helpers of the image library: image arrays (column-major
// rows x cols x channels) ↔ codec rasters (row-major interleaved), class
// ranges and conversions, colour quantization.
import { MError, tensor, toTensor, isTensor, isSparse, saturate, INT_RANGE } from '../../value.js';

export const IE = (fn, what, msg) => new MError(`image:${fn}:${what}`, msg);

/** Image view of a value: { cls, h, w, c, n (h*w), re, dims }. Extra dims beyond 3 fold into c. */
export function imgOf(v, fn = 'image') {
  if (!isTensor(v) && !isSparse(v)) throw IE(fn, 'invalidInput', `Expected the input image to be a numeric or logical array, got ${v ? v.cls : 'nothing'}.`);
  const t = toTensor(v);
  if (t.cls === 'char') throw IE(fn, 'invalidInput', 'Expected the input image to be numeric or logical, not char.');
  const d = t.dims;
  const h = d[0], w = d[1];
  let c = 1; for (let i = 2; i < d.length; i++) c *= d[i];
  return { cls: t.cls, h, w, c, n: h * w, re: t.re, im: t.im, dims: d };
}

export function classRange(cls) {
  if (cls in INT_RANGE) return INT_RANGE[cls];
  return [0, 1];
}
export const isIntCls = (cls) => cls in INT_RANGE;

/** Values of an image as doubles scaled like im2double. */
export function toUnit(v) {
  const im = v.re ? v : imgOf(v);
  const src = im.re;
  const out = new Float64Array(src.length);
  switch (im.cls) {
    case 'uint8': for (let i = 0; i < src.length; i++) out[i] = src[i] / 255; break;
    case 'uint16': for (let i = 0; i < src.length; i++) out[i] = src[i] / 65535; break;
    case 'int16': for (let i = 0; i < src.length; i++) out[i] = (src[i] + 32768) / 65535; break;
    case 'uint32': for (let i = 0; i < src.length; i++) out[i] = src[i] / 4294967295; break;
    case 'int8': for (let i = 0; i < src.length; i++) out[i] = (src[i] + 128) / 255; break;
    case 'int32': for (let i = 0; i < src.length; i++) out[i] = (src[i] + 2147483648) / 4294967295; break;
    default: out.set(src);
  }
  return out;
}

/** Converts unit-scaled doubles to class `cls` (rounding and saturation for integers). */
export function fromUnit(unit, dims, cls) {
  const re = new Float64Array(unit.length);
  const sat = (x, lo, hi) => (Number.isNaN(x) ? 0 : x < lo ? lo : x > hi ? hi : Math.round(x));
  switch (cls) {
    case 'uint8': for (let i = 0; i < re.length; i++) re[i] = sat(unit[i] * 255, 0, 255); break;
    case 'uint16': for (let i = 0; i < re.length; i++) re[i] = sat(unit[i] * 65535, 0, 65535); break;
    case 'int16': for (let i = 0; i < re.length; i++) re[i] = sat(unit[i] * 65535 - 32768, -32768, 32767); break;
    case 'logical': for (let i = 0; i < re.length; i++) re[i] = unit[i] > 0.5 ? 1 : 0; break;
    case 'single': for (let i = 0; i < re.length; i++) re[i] = Math.fround(unit[i]); break;
    default: if (cls in INT_RANGE) { const [lo, hi] = INT_RANGE[cls]; for (let i = 0; i < re.length; i++) re[i] = sat(lo + unit[i] * (hi - lo), lo, hi); } else re.set(unit);
  }
  return tensor(cls, dims, re);
}

/** A tensor of class cls; integer classes are rounded and saturated, logical is x != 0. */
export function makeOut(cls, dims, re) {
  const r = re instanceof Float64Array ? re : Float64Array.from(re);
  if (cls in INT_RANGE) for (let i = 0; i < r.length; i++) r[i] = saturate(cls, r[i]);
  else if (cls === 'single') for (let i = 0; i < r.length; i++) r[i] = Math.fround(r[i]);
  else if (cls === 'logical') for (let i = 0; i < r.length; i++) r[i] = r[i] !== 0 && !Number.isNaN(r[i]) ? 1 : 0;
  return tensor(cls, dims, r);
}

export const dbl = (dims, re) => tensor('double', dims, re);
export const logical = (dims, re) => tensor('logical', dims, re);

// ---------------------------------------------------------------- raster <-> array

/** Raster → { A, map, alpha } (M values). */
export function rasterToArray(r) {
  const { width: w, height: h } = r;
  const ch = r.channels;
  const hasAlpha = !r.indexed && !r.cmyk && (ch === 2 || ch === 4);
  const cc = hasAlpha ? ch - 1 : ch;
  let cls;
  if (r.data instanceof Float32Array) cls = 'single';
  else if (r.data instanceof Uint32Array) cls = 'uint32';
  else if (r.bitDepth === 1 && !r.indexed) cls = 'logical';
  else if (r.bitDepth > 8) cls = 'uint16';
  else cls = 'uint8';
  const A = new Float64Array(w * h * cc);
  const al = hasAlpha ? new Float64Array(w * h) : null;
  const n = w * h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * ch, d = y + x * h;
      for (let k = 0; k < cc; k++) A[d + k * n] = r.data[s + k];
      if (al) al[d] = r.data[s + cc];
    }
  }
  const A2 = tensor(cls, cc > 1 ? [h, w, cc] : [h, w], A);
  let map = tensor('double', [0, 0]);
  if (r.indexed && r.palette) {
    const m = r.palette16 ? r.palette16.length / 3 : r.palette.length / 3;
    const mr = new Float64Array(m * 3);
    for (let i = 0; i < m; i++) {
      for (let k = 0; k < 3; k++) mr[i + k * m] = r.palette16 ? r.palette16[k * m + i] / 65535 : r.palette[3 * i + k] / 255;
    }
    map = tensor('double', [m, 3], mr);
  }
  const alpha = al ? tensor(cls, [h, w], al) : tensor('double', [0, 0]);
  return { A: A2, map, alpha };
}

/** Bits of a target depth for an array class. */
export function defaultDepth(cls) {
  return cls === 'logical' ? 1 : cls === 'uint16' || cls === 'int16' ? 16 : 8;
}

/**
 * Image array → raster with interleaved samples.
 * opts: { depth (1, 2, 4, 8, 16), alpha (array or null), float (keep single as float32) }
 */
export function arrayToRaster(v, opts = {}) {
  const im = imgOf(v, 'imwrite');
  const { h, w, c } = im;
  if (c !== 1 && c !== 3 && c !== 4) throw IE('imwrite', 'invalidSize', 'Expected the image to be M-by-N (grayscale), M-by-N-by-3 (truecolor) or M-by-N-by-4 (CMYK).');
  const depth = opts.depth || defaultDepth(im.cls);
  const float = opts.float && im.cls === 'single';
  let alpha = null;
  if (opts.alpha) {
    alpha = imgOf(opts.alpha, 'imwrite');
    if (alpha.h !== h || alpha.w !== w || alpha.c !== 1) throw IE('imwrite', 'badAlpha', 'The alpha data must be an M-by-N array matching the image.');
  }
  const ch = c + (alpha ? 1 : 0);
  const n = h * w;
  const data = float ? new Float32Array(n * ch) : depth > 8 ? new Uint16Array(n * ch) : new Uint8Array(n * ch);
  const maxv = depth >= 16 ? 65535 : (1 << depth) - 1;
  const conv = (cls, x) => {
    if (float) return x;
    if (cls === 'logical') return x ? maxv : 0;
    if (cls === 'double' || cls === 'single') { const t = Math.round((Number.isNaN(x) ? 0 : x) * maxv); return t < 0 ? 0 : t > maxv ? maxv : t; }
    if (cls === 'uint8') return depth === 8 ? x : depth === 16 ? x * 257 : Math.round((x * maxv) / 255);
    if (cls === 'uint16') return depth === 16 ? x : Math.round((x * maxv) / 65535);
    if (cls === 'int16') return Math.round(((x + 32768) * maxv) / 65535);
    const [lo, hi] = classRange(cls);
    return Math.round(((x - lo) * maxv) / (hi - lo));
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = y + x * h, d = (y * w + x) * ch;
      for (let k = 0; k < c; k++) data[d + k] = conv(im.cls, im.re[s + k * n]);
      if (alpha) data[d + c] = conv(alpha.cls, alpha.re[s]);
    }
  }
  return { width: w, height: h, channels: ch, bitDepth: float ? 32 : depth, data, palette: null, indexed: false, sampleFormat: float ? 'float' : 'uint', colorChannels: c };
}

/** Indexed image + colormap → raster with palette (indices 0-based). */
export function indexedToRaster(X, map, maxEntries = 256) {
  const im = imgOf(X, 'imwrite');
  if (im.c !== 1) throw IE('imwrite', 'badIndexed', 'An indexed image must be a 2-D array.');
  const mt = toTensor(map);
  if (mt.dims.length !== 2 || mt.dims[1] !== 3) throw IE('imwrite', 'badMap', 'The colormap must be an M-by-3 array.');
  const m = mt.dims[0];
  if (m > maxEntries) throw IE('imwrite', 'tooManyColors', `The colormap can have at most ${maxEntries} entries for this format.`);
  const palette = new Uint8Array(m * 3);
  const palette16 = new Uint16Array(m * 3);
  for (let i = 0; i < m; i++) for (let k = 0; k < 3; k++) {
    const v = Math.min(1, Math.max(0, mt.re[i + k * m]));
    palette[3 * i + k] = Math.round(v * 255);
    palette16[k * m + i] = Math.round(v * 65535);
  }
  const off = im.cls === 'double' || im.cls === 'single' ? 1 : 0;
  const data = m > 256 ? new Uint16Array(im.n) : new Uint8Array(im.n);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    let v = Math.round(im.re[y + x * im.h] - off);
    if (v < 0) v = 0; if (v >= m) v = m - 1;
    data[y * im.w + x] = v;
  }
  return { width: im.w, height: im.h, channels: 1, bitDepth: m > 256 ? 16 : 8, data, palette, palette16, indexed: true };
}

// ---------------------------------------------------------------- quantization

/**
 * Median-cut colour quantization of interleaved RGB bytes (n pixels).
 * Returns { palette: Uint8Array RGB triples, indices: Uint16Array }.
 */
export function quantize(rgb, n, maxColors) {
  const indices = new Uint16Array(n);
  // exact palette when few colours
  const seen = new Map();
  for (let i = 0; i < n; i++) {
    const key = (rgb[3 * i] << 16) | (rgb[3 * i + 1] << 8) | rgb[3 * i + 2];
    let id = seen.get(key);
    if (id === undefined) { if (seen.size >= maxColors) { seen.clear(); seen.set(-1, -1); break; } id = seen.size; seen.set(key, id); }
    indices[i] = id;
  }
  if (!seen.has(-1)) {
    const palette = new Uint8Array(seen.size * 3);
    for (const [key, id] of seen) { palette[3 * id] = key >> 16; palette[3 * id + 1] = (key >> 8) & 255; palette[3 * id + 2] = key & 255; }
    return { palette, indices };
  }
  const all = new Uint32Array(n); for (let i = 0; i < n; i++) all[i] = i;
  const boxes = [{ a: 0, b: n }];
  const rangeOf = (bx) => {
    const lo = [255, 255, 255], hi = [0, 0, 0];
    for (let i = bx.a; i < bx.b; i++) { const p = all[i] * 3; for (let k = 0; k < 3; k++) { const v = rgb[p + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; } }
    let ch = 0; for (let k = 1; k < 3; k++) if (hi[k] - lo[k] > hi[ch] - lo[ch]) ch = k;
    return { ch, span: hi[ch] - lo[ch] };
  };
  while (boxes.length < maxColors) {
    let best = -1, bestSpan = 0, bestCh = 0;
    for (let i = 0; i < boxes.length; i++) { const bx = boxes[i]; if (bx.b - bx.a < 2) continue; const r = rangeOf(bx); if (r.span > bestSpan) { bestSpan = r.span; best = i; bestCh = r.ch; } }
    if (best < 0) break;
    const bx = boxes[best];
    const seg = Array.from(all.subarray(bx.a, bx.b)).sort((p, q) => rgb[p * 3 + bestCh] - rgb[q * 3 + bestCh]);
    all.set(seg, bx.a);
    const mid = bx.a + ((bx.b - bx.a) >> 1);
    boxes.splice(best, 1, { a: bx.a, b: mid }, { a: mid, b: bx.b });
  }
  const palette = new Uint8Array(boxes.length * 3);
  boxes.forEach((bx, id) => {
    const s = [0, 0, 0];
    for (let i = bx.a; i < bx.b; i++) { const p = all[i] * 3; s[0] += rgb[p]; s[1] += rgb[p + 1]; s[2] += rgb[p + 2]; }
    const cnt = Math.max(1, bx.b - bx.a);
    for (let k = 0; k < 3; k++) palette[3 * id + k] = Math.round(s[k] / cnt);
  });
  // nearest palette colour for each pixel (with a cache)
  const cache = new Map();
  const m = boxes.length;
  for (let i = 0; i < n; i++) {
    const r = rgb[3 * i], g = rgb[3 * i + 1], b = rgb[3 * i + 2];
    const key = (r << 16) | (g << 8) | b;
    let id = cache.get(key);
    if (id === undefined) {
      let bd = Infinity; id = 0;
      for (let j = 0; j < m; j++) { const dr = palette[3 * j] - r, dg = palette[3 * j + 1] - g, db = palette[3 * j + 2] - b; const d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; id = j; } }
      cache.set(key, id);
    }
    indices[i] = id;
  }
  return { palette, indices };
}

/** Nearest-colour mapping of RGB bytes to a palette (RGB triples). */
export function mapToPalette(rgb, n, palette) {
  const m = palette.length / 3;
  const out = new Uint16Array(n);
  const cache = new Map();
  for (let i = 0; i < n; i++) {
    const r = rgb[3 * i], g = rgb[3 * i + 1], b = rgb[3 * i + 2];
    const key = r * 65536 + g * 256 + b;
    let id = cache.get(key);
    if (id === undefined) {
      let bd = Infinity; id = 0;
      for (let j = 0; j < m; j++) { const dr = palette[3 * j] - r, dg = palette[3 * j + 1] - g, db = palette[3 * j + 2] - b; const d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; id = j; } }
      cache.set(key, id);
    }
    out[i] = id;
  }
  return out;
}
