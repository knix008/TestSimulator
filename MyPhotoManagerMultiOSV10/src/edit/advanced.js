// Advanced editor algorithms: HSL and tone equalizers, split toning, dehaze,
// the white-balance picker, skin smoothing, lens and perspective correction,
// tilt-shift, clone stamp, masks for local adjustments, special effects and
// layer blend modes. Images are ImageData-like objects
// { data: Uint8ClampedArray (RGBA), width, height }. Functions work in place
// unless noted (the geometric warps return a new image of the same size), and
// are pure (no DOM), so the same code runs in the page, a worker and Node.
import { vignette as vignetteFx } from './adjust.js';

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (t) => { const x = t < 0 ? 0 : t > 1 ? 1 : t; return x * x * (3 - 2 * x); };
const copyOf = (image) => ({ width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) });
const blankImage = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
const range = (v, min, max) => (v < min ? min : v > max ? max : v);

/** Deterministic xorshift generator → [0, 1). Same seed, same picture. */
function seeded(seed = 1) {
  let state = (seed >>> 0) || 1;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
}

// ───────────────────────── planar helpers (Float32 channels, separable filters)

function toPlanes(image) {
  const { width: w, height: h, data } = image;
  const n = w * h;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) { r[i] = data[j]; g[i] = data[j + 1]; b[i] = data[j + 2]; }
  return [r, g, b];
}

function fromPlanes(image, r, g, b) {
  const { data } = image;
  const n = image.width * image.height;
  for (let i = 0, j = 0; i < n; i++, j += 4) { data[j] = r[i]; data[j + 1] = g[i]; data[j + 2] = b[i]; }
  return image;
}

/** Luminance (Rec. 601) plane, 0…255. */
function lumaPlane(image) {
  const { data } = image;
  const n = image.width * image.height;
  const l = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) l[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
  return l;
}

/** Box blur of one plane (running sums, clamped edges). `out` may be `src`. */
function boxBlurPlane(src, w, h, radius, out = new Float32Array(w * h), temp = new Float32Array(w * h)) {
  const r = Math.min(Math.max(w, h), Math.round(radius));
  if (r < 1) { if (out !== src) out.set(src); return out; }
  const inv = 1 / (2 * r + 1);
  // Horizontal pass into temp.
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = src[row] * (r + 1);
    for (let k = 1; k <= r; k++) sum += src[row + (k < w ? k : w - 1)];
    for (let x = 0; x < w; x++) {
      temp[row + x] = sum * inv;
      const add = x + r + 1;
      const sub = x - r;
      sum += src[row + (add < w ? add : w - 1)] - src[row + (sub > 0 ? sub : 0)];
    }
  }
  // Vertical pass row by row (cache friendly) with a running sum per column.
  const sums = new Float64Array(w);
  for (let x = 0; x < w; x++) sums[x] = temp[x] * (r + 1);
  for (let k = 1; k <= r; k++) { const row = (k < h ? k : h - 1) * w; for (let x = 0; x < w; x++) sums[x] += temp[row + x]; }
  for (let y = 0; y < h; y++) {
    const o = y * w;
    const add = (y + r + 1 < h ? y + r + 1 : h - 1) * w;
    const sub = (y - r > 0 ? y - r : 0) * w;
    for (let x = 0; x < w; x++) {
      out[o + x] = sums[x] * inv;
      sums[x] += temp[add + x] - temp[sub + x];
    }
  }
  return out;
}

/** Radii of three box blurs approximating a Gaussian of `sigma` (Kovesi). */
function boxRadii(sigma) {
  const n = 3;
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let lower = Math.floor(ideal);
  if (lower % 2 === 0) lower -= 1;
  const upper = lower + 2;
  const m = Math.round((12 * sigma * sigma - n * lower * lower - 4 * n * lower - 3 * n) / (-4 * lower - 4));
  return [0, 1, 2].map((i) => ((i < m ? lower : upper) - 1) / 2);
}

/** Approximate Gaussian blur of a plane → new plane. */
function gaussPlane(src, w, h, sigma) {
  const out = new Float32Array(src);
  if (!(sigma > 0.3)) return out;
  const temp = new Float32Array(w * h);
  for (const r of boxRadii(sigma)) boxBlurPlane(out, w, h, r, out, temp);
  return out;
}

/** Gaussian-blurred R, G, B planes of an image. */
function blurredPlanes(image, sigma) {
  const { width: w, height: h } = image;
  return toPlanes(image).map((plane) => gaussPlane(plane, w, h, sigma));
}

/**
 * Guided filter (He et al.): edge-preserving smoothing of `p` steered by the
 * guide `I` (both planes in the same units). eps is in squared plane units.
 */
function guidedFilter(I, p, w, h, radius, eps) {
  const n = w * h;
  const temp = new Float32Array(n);
  const box = (src) => boxBlurPlane(src, w, h, radius, new Float32Array(n), temp);
  const self = I === p;
  const meanI = box(I);
  const meanP = self ? meanI : box(p);
  const prod = new Float32Array(n);
  for (let i = 0; i < n; i++) prod[i] = I[i] * I[i];
  const corrI = box(prod);
  let corrIp = corrI;
  if (!self) { for (let i = 0; i < n; i++) prod[i] = I[i] * p[i]; corrIp = box(prod); }
  const a = prod; // reuse
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const mi = meanI[i];
    const varI = corrI[i] - mi * mi;
    const cov = corrIp[i] - mi * meanP[i];
    a[i] = cov / (varI + eps);
    b[i] = meanP[i] - a[i] * mi;
  }
  const meanA = box(a);
  const meanB = box(b);
  const q = meanA;
  for (let i = 0; i < n; i++) q[i] = meanA[i] * I[i] + meanB[i];
  return q;
}

/** 1-D running minimum (van Herk / Gil-Werman, O(1) per sample). */
function minLine(line, n, r, out, g, s) {
  const k = 2 * r + 1;
  const P = n + 2 * r;
  for (let j = 0; j < P; j++) {
    const v = j < r || j >= n + r ? Infinity : line[j - r];
    g[j] = j % k === 0 ? v : (g[j - 1] < v ? g[j - 1] : v);
  }
  for (let j = P - 1; j >= 0; j--) {
    const v = j < r || j >= n + r ? Infinity : line[j - r];
    s[j] = j % k === k - 1 || j === P - 1 ? v : (s[j + 1] < v ? s[j + 1] : v);
  }
  for (let i = 0; i < n; i++) { const a = s[i]; const b = g[i + 2 * r]; out[i] = a < b ? a : b; }
}

/** Square minimum filter of a plane (separable). */
function minFilterPlane(src, w, h, r) {
  const out = new Float32Array(w * h);
  const size = Math.max(w, h) + 2 * r + 1;
  const line = new Float32Array(size);
  const res = new Float32Array(size);
  const g = new Float32Array(size);
  const s = new Float32Array(size);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) line[x] = src[row + x];
    minLine(line, w, r, res, g, s);
    for (let x = 0; x < w; x++) out[row + x] = res[x];
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) line[y] = out[y * w + x];
    minLine(line, h, r, res, g, s);
    for (let y = 0; y < h; y++) out[y * w + x] = res[y];
  }
  return out;
}

/** Sobel gradient magnitude of a plane. */
function sobelPlane(L, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const up = (y > 0 ? y - 1 : 0) * w;
    const mid = y * w;
    const down = (y < h - 1 ? y + 1 : h - 1) * w;
    for (let x = 0; x < w; x++) {
      const l = x > 0 ? x - 1 : 0;
      const r = x < w - 1 ? x + 1 : w - 1;
      const gx = L[up + r] + 2 * L[mid + r] + L[down + r] - L[up + l] - 2 * L[mid + l] - L[down + l];
      const gy = L[down + l] + 2 * L[down + x] + L[down + r] - L[up + l] - 2 * L[up + x] - L[up + r];
      out[mid + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return out;
}

/** Bilinear sample of all four channels at (fx, fy) (pixel centres at integers), edges clamped. */
function sampleRGBA(src, w, h, fx, fy, dst, di) {
  const x = fx < 0 ? 0 : fx > w - 1 ? w - 1 : fx;
  const y = fy < 0 ? 0 : fy > h - 1 ? h - 1 : fy;
  const x0 = x | 0;
  const y0 = y | 0;
  const x1 = x0 < w - 1 ? x0 + 1 : x0;
  const y1 = y0 < h - 1 ? y0 + 1 : y0;
  const tx = x - x0;
  const ty = y - y0;
  const i00 = (y0 * w + x0) * 4;
  const i10 = (y0 * w + x1) * 4;
  const i01 = (y1 * w + x0) * 4;
  const i11 = (y1 * w + x1) * 4;
  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;
  dst[di] = src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
  dst[di + 1] = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
  dst[di + 2] = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
  dst[di + 3] = src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11;
}

/** Bilinear sample of one channel, edges clamped. */
function sampleChannel(src, w, h, fx, fy, c) {
  const x = fx < 0 ? 0 : fx > w - 1 ? w - 1 : fx;
  const y = fy < 0 ? 0 : fy > h - 1 ? h - 1 : fy;
  const x0 = x | 0;
  const y0 = y | 0;
  const x1 = x0 < w - 1 ? x0 + 1 : x0;
  const y1 = y0 < h - 1 ? y0 + 1 : y0;
  const tx = x - x0;
  const ty = y - y0;
  const a = src[(y0 * w + x0) * 4 + c];
  const b = src[(y0 * w + x1) * 4 + c];
  const d = src[(y1 * w + x0) * 4 + c];
  const e = src[(y1 * w + x1) * 4 + c];
  const top = a + (b - a) * tx;
  return top + (d + (e - d) * tx - top) * ty;
}

/** Inverse-mapped warp in place: map(x, y, pt) puts the source position of output pixel (x, y) into pt. */
function remap(image, map) {
  const { width: w, height: h, data } = image;
  const src = new Uint8ClampedArray(data);
  const pt = [0, 0];
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      map(x, y, pt);
      sampleRGBA(src, w, h, pt[0], pt[1], data, i);
    }
  }
  return image;
}

// ───────────────────────── colour conversions

function rgbToHsl(r, g, b, out) {
  const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
  const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-9) { out[0] = 0; out[1] = 0; out[2] = l; return out; }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  out[0] = h * 60; out[1] = s; out[2] = l;
  return out;
}

/** HSL (h degrees, s and l 0…1) → RGB 0…255 into out. */
function hslToRgb(h, s, l, out) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((((h % 360) + 360) % 360) / 60);
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  let r = 0; let g = 0; let b = 0;
  if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; } else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; } else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
  out[0] = (r + m) * 255; out[1] = (g + m) * 255; out[2] = (b + m) * 255;
  return out;
}

// ───────────────────────── HSL (colour) equalizer

/** Bands of the colour equalizer and their centre hues (degrees). */
export const COLOR_BANDS = Object.freeze(['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta']);
const BAND_HUES = [0, 30, 60, 120, 180, 240, 270, 300];

/** Per-degree table of one band property, smoothly interpolated between neighbouring band centres. */
function bandTable(values) {
  const table = new Float32Array(361);
  for (let d = 0; d <= 360; d++) {
    const hue = d % 360;
    let i = BAND_HUES.length - 1;
    while (i > 0 && BAND_HUES[i] > hue) i--;
    const h0 = BAND_HUES[i];
    const h1 = i + 1 < BAND_HUES.length ? BAND_HUES[i + 1] : 360;
    const t = smoothstep((hue - h0) / (h1 - h0));
    table[d] = values[i] * (1 - t) + values[(i + 1) % values.length] * t;
  }
  return table;
}

/**
 * HSL equalizer. `bands` = { red, orange, …, magenta } each { hue (-180…180°
 * shift), saturation (-100…100), lightness (-100…100) }. Weights blend
 * smoothly between neighbouring band centres; weakly saturated pixels change
 * proportionally less and greys not at all.
 */
export function colorEq(image, bands = {}) {
  const pick = (key) => COLOR_BANDS.map((name) => Number(bands?.[name]?.[key]) || 0);
  const hues = pick('hue');
  const sats = pick('saturation');
  const lights = pick('lightness');
  if (![...hues, ...sats, ...lights].some((v) => v)) return image;
  const hueT = bandTable(hues);
  const satT = bandTable(sats);
  const lightT = bandTable(lights);
  const { data } = image;
  const hsl = [0, 0, 0];
  const rgb = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    rgbToHsl(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, hsl);
    const s = hsl[1];
    if (s <= 0) continue;
    const k = s < 0.5 ? s * 2 : 1;
    const idx = Math.round(hsl[0]);
    const dh = hueT[idx] * k;
    const ds = (satT[idx] / 100) * k;
    const dl = (lightT[idx] / 100) * k;
    if (!dh && !ds && !dl) continue;
    const s2 = clamp01(s * (1 + ds));
    let l = hsl[2];
    l = dl > 0 ? l + (1 - l) * dl * 0.5 : l + l * dl * 0.5;
    hslToRgb(hsl[0] + dh, s2, l, rgb);
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2];
  }
  return image;
}

// ───────────────────────── tone equalizer

/** Number of tone-equalizer bands (blacks … whites). */
export const LIGHT_BANDS = 9;

/**
 * Tone equalizer: `bands` = 9 values (-100…100, ±1 EV) from shadows to
 * highlights. The gain is a smooth function of the pixel's luminance
 * (normalised Gaussian weights around band centres) applied to R, G and B alike,
 * so colours keep their hue (the gain is limited so no channel clips).
 */
export function lightEq(image, bands = []) {
  const values = Array.from({ length: LIGHT_BANDS }, (_, i) => Number(bands?.[i]) || 0);
  if (!values.some((v) => v)) return image;
  const sigma = 0.09;
  const lut = new Float32Array(1021);
  for (let i = 0; i < lut.length; i++) {
    const y = i / 1020;
    let sum = 0;
    let weight = 0;
    for (let b = 0; b < LIGHT_BANDS; b++) {
      const d = y - b / (LIGHT_BANDS - 1);
      const wgt = Math.exp(-(d * d) / (2 * sigma * sigma));
      sum += wgt * values[b];
      weight += wgt;
    }
    lut[i] = 2 ** (sum / weight / 100);
  }
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    let gain = lut[Math.round((0.299 * r + 0.587 * g + 0.114 * b) * 4)];
    if (gain === 1) continue;
    const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
    if (gain > 1 && max * gain > 255) gain = Math.max(1, 255 / Math.max(1, max));
    data[i] = r * gain; data[i + 1] = g * gain; data[i + 2] = b * gain;
  }
  return image;
}

// ───────────────────────── split toning

/** Zero-luminance colour offset of a hue (what tinting adds without changing brightness). */
function tintVector(hue) {
  const rgb = hslToRgb(hue, 1, 0.5, [0, 0, 0]);
  const l = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  return [(rgb[0] - l) / 255, (rgb[1] - l) / 255, (rgb[2] - l) / 255];
}

/**
 * Split toning: tints highlights and shadows. Hues 0…360, saturations 0…100,
 * balance -100 (more shadow tint) … 100 (more highlight tint).
 */
export function splitTone(image, { highlightHue = 45, highlightSat = 0, shadowHue = 220, shadowSat = 0, balance = 0 } = {}) {
  if (!highlightSat && !shadowSat) return image;
  const hi = tintVector(highlightHue);
  const sh = tintVector(shadowHue);
  const hs = range(highlightSat, 0, 100) / 100;
  const ss = range(shadowSat, 0, 100) / 100;
  const pivot = 0.5 - (range(balance, -100, 100) / 100) * 0.4;
  const lut = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const l = i / 255;
    const wh = smoothstep((l - pivot) / 0.7 + 0.5);
    const ws = 1 - wh;
    const envelope = Math.sqrt(4 * l * (1 - l)); // pure black and white stay neutral
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = (hi[c] * wh * hs + sh[c] * ws * ss) * envelope * 255 * 0.45;
  }
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const k = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) * 3;
    data[i] += lut[k]; data[i + 1] += lut[k + 1]; data[i + 2] += lut[k + 2];
  }
  return image;
}

// ───────────────────────── dehaze

/**
 * Dehaze with the dark channel prior: atmospheric light from the brightest 0.1 %
 * of the dark channel, transmission from a patch-minimum of the normalised
 * image, refined by a guided filter on the luminance. amount 0…100 removes
 * haze; negative values (to -100) add haze.
 */
export function dehaze(image, amount, { radius } = {}) {
  const k = range(Number(amount) || 0, -100, 100) / 100;
  if (!k) return image;
  const { width: w, height: h, data } = image;
  const n = w * h;
  const r = Math.max(1, Math.round(radius ?? Math.min(15, Math.max(2, Math.min(w, h) * 0.012))));
  const minc = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = data[j]; const b = data[j + 1]; const c = data[j + 2];
    minc[i] = (a < b ? (a < c ? a : c) : (b < c ? b : c)) / 255;
  }
  const dark = minFilterPlane(minc, w, h, r);
  // Atmospheric light: mean colour of the brightest dark-channel pixels.
  const bins = new Uint32Array(1024);
  for (let i = 0; i < n; i++) bins[Math.min(1023, (dark[i] * 1023) | 0)]++;
  const want = Math.max(1, Math.round(n * 0.001));
  let threshold = 1023;
  for (let acc = 0; threshold > 0; threshold--) { acc += bins[threshold]; if (acc >= want) break; }
  const A = [0, 0, 0];
  let count = 0;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    if (((dark[i] * 1023) | 0) >= threshold) { A[0] += data[j]; A[1] += data[j + 1]; A[2] += data[j + 2]; count++; }
  }
  for (let c = 0; c < 3; c++) A[c] = Math.max(0.2, A[c] / Math.max(1, count) / 255);

  if (k < 0) {
    // Add haze: mix toward the atmospheric light, more where the scene is dark.
    const mix = -k * 0.6;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const t = mix * (1 - 0.4 * dark[i]);
      for (let c = 0; c < 3; c++) data[j + c] += (A[c] * 255 - data[j + c]) * t;
    }
    return image;
  }

  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = data[j] / 255 / A[0]; const b = data[j + 1] / 255 / A[1]; const c = data[j + 2] / 255 / A[2];
    minc[i] = a < b ? (a < c ? a : c) : (b < c ? b : c);
  }
  const darkN = minFilterPlane(minc, w, h, r);
  const t = new Float32Array(n);
  for (let i = 0; i < n; i++) t[i] = 1 - 0.95 * k * Math.min(1, darkN[i]);
  const guide = lumaPlane(image);
  for (let i = 0; i < n; i++) guide[i] /= 255;
  const refined = guidedFilter(guide, t, w, h, Math.min(60, r * 4), 1e-3);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const tt = Math.max(0.1, Math.min(1, refined[i]));
    for (let c = 0; c < 3; c++) {
      const a = A[c] * 255;
      data[j + c] = (data[j + c] - a) / tt + a;
    }
  }
  return image;
}

// ───────────────────────── white-balance picker

/**
 * Temperature and tint (editor scale -100…100) that turn the picked colour grey
 * under applyAdjustments' white balance model (R×(1+0.25w), B×(1−0.25w),
 * G×(1−0.2t)). Results are clamped to the slider range.
 */
export function whiteBalanceFromPixel(r, g, b) {
  if (r + b <= 0) return { temperature: 0, tint: 0 };
  const warm = range((4 * (b - r)) / (r + b), -1, 1);
  const target = (r * (1 + warm * 0.25) + b * (1 - warm * 0.25)) / 2;
  const tint = g > 0 ? range(5 * (1 - target / g), -1, 1) : 0;
  const temperature = Math.round(warm * 100) || 0;
  return { temperature, tint: Math.round(tint * 100) || 0 };
}

// ───────────────────────── skin smoothing

/** Soft skin-tone mask (0…1) from YCbCr, slightly blurred. */
export function skinMask(image) {
  const { width: w, height: h, data } = image;
  const n = w * h;
  const mask = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const r = data[j]; const g = data[j + 1]; const b = data[j + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    const dcb = (cb - 104) / 22;
    const dcr = (cr - 152) / 18;
    const d = Math.sqrt(dcb * dcb + dcr * dcr);
    mask[i] = (1 - smoothstep((d - 0.7) / 0.6)) * smoothstep((y - 30) / 30);
  }
  return gaussPlane(mask, w, h, Math.max(1, Math.min(w, h) * 0.003));
}

/**
 * Skin smoothing: edge-preserving smoothing (guided filter on the luminance)
 * applied only where the skin mask says skin; amount 0…100.
 */
export function skinSmooth(image, amount, { radius } = {}) {
  const a = range(Number(amount) || 0, 0, 100) / 100;
  if (!a) return image;
  const { width: w, height: h, data } = image;
  const n = w * h;
  const mask = skinMask(image);
  const Y = lumaPlane(image);
  for (let i = 0; i < n; i++) Y[i] /= 255;
  const r = Math.max(1, Math.round(radius ?? Math.max(2, Math.min(w, h) * 0.012)));
  const eps = (0.02 + 0.06 * a) ** 2;
  const smooth = guidedFilter(Y, Y, w, h, r, eps);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const m = mask[i] * a;
    if (m < 0.002) continue;
    const delta = (smooth[i] - Y[i]) * 255 * m;
    data[j] += delta; data[j + 1] += delta; data[j + 2] += delta;
  }
  return image;
}

// ───────────────────────── lens and perspective (return a new image)

/**
 * Lens correction → new image of the same size. distortion -100…100
 * (positive straightens barrel, negative pincushion: r' = r(1 + k r²), auto-fitted
 * so no empty corners), chromatic -100…100 (red/blue scale offsets), vignette
 * -100…100 (positive brightens the corners).
 */
export function lensCorrect(image, { distortion = 0, chromatic = 0, vignette = 0 } = {}) {
  const { width: w, height: h, data } = image;
  const out = blankImage(w, h);
  if (!distortion && !chromatic && !vignette) { out.data.set(data); return out; }
  const o = out.data;
  const cx = w / 2;
  const cy = h / 2;
  const invR2 = 1 / (cx * cx + cy * cy);
  const k = -(range(distortion, -100, 100) / 100) * 0.35;
  const fit = k > 0 ? 1 / (1 + k) : 1;
  const ca = (range(chromatic, -100, 100) / 100) * 0.006;
  const sr = 1 + ca;
  const sb = 1 - ca;
  const v = range(vignette, -100, 100) / 100;
  for (let y = 0, i = 0; y < h; y++) {
    const dy = y + 0.5 - cy;
    for (let x = 0; x < w; x++, i += 4) {
      const dx = x + 0.5 - cx;
      const r2 = (dx * dx + dy * dy) * invR2;
      const f = (1 + k * r2) * fit;
      const gx = cx + dx * f - 0.5;
      const gy = cy + dy * f - 0.5;
      const gain = 1 + v * r2;
      o[i + 1] = sampleChannel(data, w, h, gx, gy, 1) * gain;
      o[i + 3] = sampleChannel(data, w, h, gx, gy, 3);
      o[i] = (ca ? sampleChannel(data, w, h, cx + dx * f * sr - 0.5, cy + dy * f * sr - 0.5, 0) : sampleChannel(data, w, h, gx, gy, 0)) * gain;
      o[i + 2] = (ca ? sampleChannel(data, w, h, cx + dx * f * sb - 0.5, cy + dy * f * sb - 0.5, 2) : sampleChannel(data, w, h, gx, gy, 2)) * gain;
    }
  }
  return out;
}

/**
 * Perspective correction → new image of the same size, via a homography.
 * vertical -100…100 (positive widens the top: fixes converging verticals),
 * horizontal -100…100 (positive widens the left side), rotate (degrees),
 * scale (percent, 100 = fit), autoCrop (default true: zoom just enough to hide
 * empty borders; otherwise they are transparent).
 */
export function perspective(image, { vertical = 0, horizontal = 0, rotate = 0, scale = 100, autoCrop = true } = {}) {
  const { width: w, height: h, data } = image;
  const out = blankImage(w, h);
  if (!vertical && !horizontal && !rotate && (scale ?? 100) === 100) { out.data.set(data); return out; }
  const hw = w / 2;
  const hh = h / 2;
  const a = (range(vertical, -100, 100) / 100) * 0.4 / hh;
  const b = (range(horizontal, -100, 100) / 100) * 0.4 / hw;
  const angle = (rotate * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // Output (centred) → source (centred); returns false behind the horizon.
  const toSource = (x, y, z, pt) => {
    const u = (x * cos + y * sin) / z;
    const v = (-x * sin + y * cos) / z;
    const d = 1 - b * u - a * v;
    if (d <= 1e-6) return false;
    pt[0] = u / d; pt[1] = v / d;
    return true;
  };
  const pt = [0, 0];
  const inside = (z) => [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]].every(([x, y]) => toSource(x, y, z, pt) && Math.abs(pt[0]) <= hw + 1e-6 && Math.abs(pt[1]) <= hh + 1e-6);
  let zoom = 1;
  if (autoCrop) {
    let lo = 0.05;
    let hi = 50;
    if (inside(lo)) hi = lo;
    else {
      for (let it = 0; it < 50; it++) { const mid = (lo + hi) / 2; if (inside(mid)) hi = mid; else lo = mid; }
    }
    zoom = hi;
  }
  zoom *= Math.max(0.05, (scale ?? 100) / 100);
  const o = out.data;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      if (!toSource(x + 0.5 - hw, y + 0.5 - hh, zoom, pt)) continue;
      const sx = pt[0] + hw - 0.5;
      const sy = pt[1] + hh - 0.5;
      if (sx < -0.5 || sy < -0.5 || sx > w - 0.5 || sy > h - 0.5) continue;
      sampleRGBA(data, w, h, sx, sy, o, i);
    }
  }
  return out;
}

// ───────────────────────── tilt-shift, clone stamp

/**
 * Tilt-shift (miniature): a sharp band through (centre x, position·height) at
 * `angle` degrees, `width` (0…1 of the height) wide, blurring outside over a
 * `feather` (0…1) transition. blur 0…100 (relative to the image size).
 */
export function tiltShift(image, { position = 0.5, width = 0.2, blur = 50, angle = 0, feather = 0.25 } = {}) {
  if (!blur) return image;
  const { width: w, height: h, data } = image;
  const sigma = (range(blur, 0, 100) / 100) * Math.max(1, Math.min(w, h) * 0.025);
  const [R, G, B] = blurredPlanes(image, sigma);
  const rad = (angle * Math.PI) / 180;
  const nx = -Math.sin(rad);
  const ny = Math.cos(rad);
  const cx = w / 2;
  const cy = position * h;
  const half = Math.max(0, width) / 2;
  const fe = Math.max(1e-3, feather);
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const d = Math.abs(nx * (x + 0.5 - cx) + ny * (y + 0.5 - cy)) / h;
      const m = smoothstep((d - half) / fe);
      if (m <= 0) continue;
      const j = i * 4;
      data[j] += (R[i] - data[j]) * m;
      data[j + 1] += (G[i] - data[j + 1]) * m;
      data[j + 2] += (B[i] - data[j + 2]) * m;
    }
  }
  return image;
}

/** Soft round brush falloff: 1 inside `hardness`, smooth to 0 at the rim (d = distance / radius). */
const brushFalloff = (d, hardness) => (d >= 1 ? 0 : d <= hardness ? 1 : 1 - smoothstep((d - hardness) / (1 - hardness)));

/**
 * Clone stamp: paints the circle around (sx, sy) onto (x, y) with a soft brush.
 * hardness 0…1, opacity 0…1. Works in place.
 */
export function cloneStamp(image, { x, y, sx, sy, radius = 20, hardness = 0.5, opacity = 1 } = {}) {
  const { width: w, height: h, data } = image;
  const rad = Math.max(0.5, radius);
  const hard = range(hardness, 0, 0.999);
  const op = range(opacity, 0, 1);
  if (!op) return image;
  const before = new Uint8ClampedArray(data);
  const ox = sx - x;
  const oy = sy - y;
  for (let py = Math.max(0, Math.floor(y - rad)); py <= Math.min(h - 1, Math.ceil(y + rad)); py++) {
    for (let px = Math.max(0, Math.floor(x - rad)); px <= Math.min(w - 1, Math.ceil(x + rad)); px++) {
      const d = Math.sqrt((px - x) ** 2 + (py - y) ** 2) / rad;
      const alpha = brushFalloff(d, hard) * op;
      if (alpha <= 0) continue;
      const qx = px + ox;
      const qy = py + oy;
      if (qx < -0.5 || qy < -0.5 || qx > w - 0.5 || qy > h - 0.5) continue;
      const i = (py * w + px) * 4;
      const j = (Math.round(range(qy, 0, h - 1)) * w + Math.round(range(qx, 0, w - 1))) * 4;
      for (let c = 0; c < 4; c++) data[i + c] = before[i + c] + (before[j + c] - before[i + c]) * alpha;
    }
  }
  return image;
}

// ───────────────────────── masks for local adjustments (Float32Array 0…1, w×h)

/**
 * Graduated filter: 1 at (x1, y1) fading smoothly to 0 at (x2, y2), constant
 * along lines perpendicular to that direction. Coordinates in pixels.
 */
export function gradientMask(width, height, { x1, y1, x2, y2 }) {
  const mask = new Float32Array(width * height);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i++) {
      const t = len2 ? ((x - x1) * dx + (y - y1) * dy) / len2 : (x - x1 < 0 ? 0 : 1);
      mask[i] = 1 - smoothstep(t);
    }
  }
  return mask;
}

/**
 * Radial filter: ellipse centred at (cx, cy) with radii rx, ry (pixels), turned
 * by `angle` degrees; 1 inside fading to 0 at the rim over `feather` (0…100 % of
 * the radius). `invert` affects the outside instead.
 */
export function radialMask(width, height, { cx, cy, rx, ry, angle = 0, feather = 50, invert = false }) {
  const mask = new Float32Array(width * height);
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const irx = 1 / Math.max(1e-6, rx);
  const iry = 1 / Math.max(1e-6, ry);
  const fe = range(feather, 0, 100) / 100;
  const inner = 1 - fe;
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i++) {
      const px = x - cx;
      const py = y - cy;
      const u = (px * cos + py * sin) * irx;
      const v = (-px * sin + py * cos) * iry;
      const d = Math.sqrt(u * u + v * v);
      const m = d <= inner ? 1 : d >= 1 ? 0 : 1 - smoothstep((d - inner) / Math.max(1e-6, fe));
      mask[i] = invert ? 1 - m : m;
    }
  }
  return mask;
}

/**
 * Brush mask: strokes = [{ points: [[x, y], …], radius, hardness 0…1, opacity 0…1, erase }].
 * Each stroke paints a soft capsule along its segments; painting keeps the
 * maximum, erasing lowers the mask.
 */
export function brushMask(width, height, strokes = []) {
  const mask = new Float32Array(width * height);
  for (const stroke of strokes ?? []) {
    const points = stroke?.points ?? [];
    if (!points.length) continue;
    const rad = Math.max(0.5, stroke.radius ?? 20);
    const hard = range(stroke.hardness ?? 0.5, 0, 0.999);
    const op = range(stroke.opacity ?? 1, 0, 1);
    const erase = !!stroke.erase;
    const segments = points.length === 1 ? [[points[0], points[0]]] : points.slice(1).map((p, k) => [points[k], p]);
    for (const [[ax, ay], [bx, by]] of segments) {
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - rad));
      const x1 = Math.min(width - 1, Math.ceil(Math.max(ax, bx) + rad));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - rad));
      const y1 = Math.min(height - 1, Math.ceil(Math.max(ay, by) + rad));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const t = len2 ? range(((x - ax) * dx + (y - ay) * dy) / len2, 0, 1) : 0;
          const ex = x - (ax + dx * t);
          const ey = y - (ay + dy * t);
          const v = brushFalloff(Math.sqrt(ex * ex + ey * ey) / rad, hard) * op;
          if (v <= 0) continue;
          const i = y * width + x;
          if (erase) { if (1 - v < mask[i]) mask[i] = 1 - v; } else if (v > mask[i]) mask[i] = v;
        }
      }
    }
  }
  return mask;
}

/**
 * Local adjustment: runs fn on a copy of the image (fn may work in place or
 * return a new image of the same size) and blends the result in by `mask`
 * (Float32Array 0…1, one value per pixel). Works in place.
 */
export function applyMasked(image, mask, fn) {
  const copy = copyOf(image);
  const result = fn(copy) ?? copy;
  if (result.width !== image.width || result.height !== image.height) throw new Error('applyMasked: fn changed the image size');
  const { data } = image;
  const src = result.data;
  for (let i = 0, j = 0; j < data.length; i++, j += 4) {
    const m = mask[i];
    if (!(m > 0)) continue;
    if (m >= 1) { data[j] = src[j]; data[j + 1] = src[j + 1]; data[j + 2] = src[j + 2]; data[j + 3] = src[j + 3]; continue; }
    for (let c = 0; c < 4; c++) data[j + c] += (src[j + c] - data[j + c]) * m;
  }
  return image;
}

// ───────────────────────── special effects

/** 256-entry S-curve (strength 0 = identity). */
function sCurve(strength, gain = 10) {
  const lut = new Float32Array(256);
  const sig = (t) => 1 / (1 + Math.exp(-gain * (t - 0.5)));
  const s0 = sig(0);
  const s1 = sig(1);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    lut[i] = 255 * (x + ((sig(x) - s0) / (s1 - s0) - x) * strength);
  }
  return lut;
}

const screen = (a, b) => 255 - ((255 - a) * (255 - b)) / 255;

function fxOilPaint(image, { radius, levels }) {
  const { width: w, height: h, data } = image;
  const r = Math.max(1, Math.round(radius));
  const L = Math.max(2, Math.round(levels));
  const n = w * h;
  const src = new Uint8ClampedArray(data);
  const bin = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) bin[i] = Math.min(L - 1, (((0.299 * src[j] + 0.587 * src[j + 1] + 0.114 * src[j + 2]) * L) / 256) | 0);
  const count = new Int32Array(L);
  const sr = new Int32Array(L);
  const sg = new Int32Array(L);
  const sb = new Int32Array(L);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    count.fill(0); sr.fill(0); sg.fill(0); sb.fill(0);
    const column = (x, sign) => {
      for (let yy = y0; yy <= y1; yy++) {
        const p = yy * w + x;
        const k = bin[p];
        const j = p * 4;
        count[k] += sign; sr[k] += sign * src[j]; sg[k] += sign * src[j + 1]; sb[k] += sign * src[j + 2];
      }
    };
    for (let x = 0; x <= Math.min(r, w - 1); x++) column(x, 1);
    for (let x = 0; x < w; x++) {
      if (x > 0) {
        if (x + r < w) column(x + r, 1);
        if (x - r - 1 >= 0) column(x - r - 1, -1);
      }
      let best = 0;
      for (let k = 1; k < L; k++) if (count[k] > count[best]) best = k;
      const c = count[best];
      const o = (y * w + x) * 4;
      data[o] = sr[best] / c; data[o + 1] = sg[best] / c; data[o + 2] = sb[best] / c;
    }
  }
  return image;
}

/** Pencil sketch luminance (0…255): colour dodge of the grey image by its blurred negative. */
function sketchPlane(image, radius, contrast) {
  const { width: w, height: h } = image;
  const grey = lumaPlane(image);
  const inv = new Float32Array(grey.length);
  for (let i = 0; i < grey.length; i++) inv[i] = 255 - grey[i];
  const blurred = gaussPlane(inv, w, h, Math.max(0.5, radius));
  const power = 1 + contrast / 25;
  const out = grey;
  for (let i = 0; i < out.length; i++) {
    const d = 255 - blurred[i];
    const v = d <= 0.5 ? 255 : Math.min(255, (grey[i] * 255) / d);
    out[i] = 255 * Math.pow(v / 255, power);
  }
  return out;
}

function fxPencilSketch(image, { radius, contrast }) {
  const s = sketchPlane(image, radius, contrast);
  return fromPlanes(image, s, s, s);
}

function fxColorSketch(image, { radius, contrast, color }) {
  const s = sketchPlane(image, radius, contrast);
  const { data } = image;
  const k = color / 100;
  for (let i = 0, j = 0; i < s.length; i++, j += 4) {
    const f = s[i] / 255;
    for (let c = 0; c < 3; c++) data[j + c] = f * (255 + (data[j + c] - 255) * k);
  }
  return image;
}

/** Edge-preserving smoothing of each channel (self-guided filter). */
function smoothPlanes(image, radius, eps) {
  const { width: w, height: h } = image;
  return toPlanes(image).map((plane) => {
    for (let i = 0; i < plane.length; i++) plane[i] /= 255;
    const q = guidedFilter(plane, plane, w, h, Math.max(1, Math.round(radius)), eps);
    for (let i = 0; i < q.length; i++) q[i] *= 255;
    return q;
  });
}

function fxCartoon(image, { smooth, levels, edges, threshold }) {
  const { width: w, height: h, data } = image;
  const [R, G, B] = smoothPlanes(image, smooth, 0.015);
  const L = new Float32Array(R.length);
  for (let i = 0; i < L.length; i++) L[i] = 0.299 * R[i] + 0.587 * G[i] + 0.114 * B[i];
  const edge = sobelPlane(L, w, h);
  const step = 255 / Math.max(1, Math.round(levels) - 1);
  const thr = 20 + threshold * 2;
  const strength = edges / 100;
  for (let i = 0, j = 0; i < L.length; i++, j += 4) {
    const dark = 1 - smoothstep((edge[i] - thr) / (thr * 0.5)) * strength;
    data[j] = Math.round(R[i] / step) * step * dark;
    data[j + 1] = Math.round(G[i] / step) * step * dark;
    data[j + 2] = Math.round(B[i] / step) * step * dark;
  }
  return image;
}

function fxWatercolor(image, { radius, texture, seed }) {
  const { width: w, height: h, data } = image;
  const [R, G, B] = smoothPlanes(image, radius, 0.03);
  const L = new Float32Array(R.length);
  for (let i = 0; i < L.length; i++) L[i] = 0.299 * R[i] + 0.587 * G[i] + 0.114 * B[i];
  const edge = sobelPlane(L, w, h);
  const random = seeded(seed);
  const noise = new Float32Array(R.length);
  for (let i = 0; i < noise.length; i++) noise[i] = random() - 0.5;
  const paper = gaussPlane(noise, w, h, 1.2);
  const t = (texture / 100) * 0.5;
  for (let i = 0, j = 0; i < L.length; i++, j += 4) {
    const pool = 1 - 0.3 * clamp01(edge[i] / 160); // pigment pools at edges
    const grain = 1 + paper[i] * t * 2;
    const planes = [R[i], G[i], B[i]];
    for (let c = 0; c < 3; c++) {
      const washed = 255 - (255 - Math.round(planes[c] / 24) * 24 * 0.5 - planes[c] * 0.5) * 0.85;
      data[j + c] = washed * pool * grain;
    }
  }
  return image;
}

function fxLomo(image, { vignette, saturation, contrast }) {
  const { data } = image;
  const k = contrast / 100;
  const rc = sCurve(0.3 + k * 0.7);
  const gc = sCurve(0.2 + k * 0.5);
  const sat = 1 + saturation / 100;
  for (let i = 0; i < data.length; i += 4) {
    const r = rc[data[i]];
    const g = gc[data[i + 1]];
    const b = data[i + 2] * 0.75 + 32;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    data[i] = l + (r - l) * sat; data[i + 1] = l + (g - l) * sat; data[i + 2] = l + (b - l) * sat;
  }
  if (vignette) vignetteFx(image, -vignette, 20);
  return image;
}

function fxOrton(image, { blur, glow }) {
  const { width: w, height: h, data } = image;
  const planes = toPlanes(image);
  for (const p of planes) for (let i = 0; i < p.length; i++) p[i] = screen(p[i], p[i]);
  const blurred = planes.map((p) => gaussPlane(p, w, h, Math.max(0.5, blur)));
  const k = glow / 100;
  for (let i = 0, j = 0; i < planes[0].length; i++, j += 4) {
    for (let c = 0; c < 3; c++) {
      const res = (planes[c][i] * blurred[c][i]) / 255;
      data[j + c] += (res - data[j + c]) * k;
    }
  }
  return image;
}

function fxGlow(image, { radius, amount, threshold }) {
  const { width: w, height: h, data } = image;
  const planes = toPlanes(image);
  const span = Math.max(1, 255 - threshold);
  for (let i = 0, j = 0; i < planes[0].length; i++, j += 4) {
    const l = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
    const m = smoothstep((l - threshold) / span + 0.15);
    for (let c = 0; c < 3; c++) planes[c][i] *= m;
  }
  const k = (amount / 100) * 1.5;
  const bright = planes.map((p) => gaussPlane(p, w, h, Math.max(0.5, radius)));
  for (let i = 0, j = 0; i < bright[0].length; i++, j += 4) {
    for (let c = 0; c < 3; c++) data[j + c] = screen(data[j + c], Math.min(255, bright[c][i] * k));
  }
  return image;
}

function fxHalftone(image, { size, angle, color }) {
  const { width: w, height: h, data } = image;
  const s = Math.max(2, size);
  const src = blurredPlanes(image, s / 3);
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const useColor = color >= 0.5;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const u = x * cos + y * sin;
      const v = -x * sin + y * cos;
      const cu = (Math.floor(u / s) + 0.5) * s;
      const cv = (Math.floor(v / s) + 0.5) * s;
      // Cell centre back in image space → its colour.
      const ix = Math.round(range(cu * cos - cv * sin, 0, w - 1));
      const iy = Math.round(range(cu * sin + cv * cos, 0, h - 1));
      const k = iy * w + ix;
      const l = 0.299 * src[0][k] + 0.587 * src[1][k] + 0.114 * src[2][k];
      const dotRadius = s * 0.5 * Math.SQRT2 * Math.sqrt(Math.max(0, 1 - l / 255));
      const dist = Math.sqrt((u - cu) ** 2 + (v - cv) ** 2);
      const ink = clamp01(dotRadius - dist + 0.5);
      const j = i * 4;
      if (useColor) {
        const scale = l > 1 ? Math.min(2, 128 / l) : 1;
        for (let c = 0; c < 3; c++) data[j + c] = 255 + (src[c][k] * scale - 255) * ink;
      } else {
        data[j] = data[j + 1] = data[j + 2] = 255 * (1 - ink);
      }
    }
  }
  return image;
}

function fxOldPhoto(image, { sepia, scratches, noise, vignette, seed }) {
  const { width: w, height: h, data } = image;
  const k = sepia / 100;
  const random = seeded(seed + 1);
  const grainK = noise * 0.8;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
    const sr = 0.393 * r + 0.769 * g + 0.189 * b;
    const sg = 0.349 * r + 0.686 * g + 0.168 * b;
    const sb = 0.272 * r + 0.534 * g + 0.131 * b;
    const n = (random() - 0.5) * grainK;
    // Faded: lifted blacks, lowered whites.
    data[i] = 18 + (r + (sr - r) * k) * 0.86 + n;
    data[i + 1] = 14 + (g + (sg - g) * k) * 0.86 + n;
    data[i + 2] = 10 + (b + (sb - b) * k) * 0.84 + n;
  }
  // Vertical scratches and dust specks.
  const lines = Math.round((scratches / 100) * (4 + w / 60));
  for (let s = 0; s < lines; s++) {
    const x = Math.floor(random() * w);
    const y0 = Math.floor(random() * h * 0.5);
    const y1 = Math.min(h, y0 + Math.floor(h * (0.3 + random() * 0.7)));
    const light = random() < 0.7;
    const strength = 0.25 + random() * 0.45;
    let drift = x;
    for (let y = y0; y < y1; y++) {
      drift += (random() - 0.5) * 0.6;
      const px = Math.round(range(drift, 0, w - 1));
      const i = (y * w + px) * 4;
      for (let c = 0; c < 3; c++) data[i + c] += ((light ? 245 : 30) - data[i + c]) * strength;
    }
  }
  const specks = Math.round((scratches / 100) * (w * h) / 4000);
  for (let s = 0; s < specks; s++) {
    const cx = random() * w;
    const cy = random() * h;
    const r = 0.5 + random() * 1.5;
    const tone = random() < 0.5 ? 25 : 235;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) data[i + c] += (tone - data[i + c]) * 0.6;
      }
    }
  }
  if (vignette) vignetteFx(image, -vignette * 0.8, 30);
  return image;
}

function fxCrossProcess(image, { amount }) {
  const { data } = image;
  const k = amount / 100;
  const rc = sCurve(0.6);
  const gc = sCurve(0.35);
  const lut = [new Float32Array(256), new Float32Array(256), new Float32Array(256)];
  for (let i = 0; i < 256; i++) {
    lut[0][i] = i + (rc[i] - i) * k;
    lut[1][i] = i + (gc[i] * 0.95 + 10 - i) * k;
    lut[2][i] = i + (i * 0.7 + 45 - i) * k;
  }
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[0][data[i]]; data[i + 1] = lut[1][data[i + 1]]; data[i + 2] = lut[2][data[i + 2]];
  }
  return image;
}

function fxDuotone(image, { shadowHue, highlightHue, contrast, amount, dark, light }) {
  const { data } = image;
  const d = Array.isArray(dark) ? dark : hslToRgb(shadowHue, 0.7, 0.18, [0, 0, 0]);
  const l = Array.isArray(light) ? light : hslToRgb(highlightHue, 0.85, 0.82, [0, 0, 0]);
  const curve = sCurve(contrast / 100);
  const k = amount / 100;
  for (let i = 0; i < data.length; i += 4) {
    const t = curve[Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])] / 255;
    for (let c = 0; c < 3; c++) data[i + c] += (d[c] + (l[c] - d[c]) * t - data[i + c]) * k;
  }
  return image;
}

/** Motion blur along `angle` over `distance` pixels: repeated halving pair-averages (≈ box kernel). */
function fxMotionBlur(image, { angle, distance }) {
  const { width: w, height: h } = image;
  if (distance < 1) return image;
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  let planes = toPlanes(image);
  const passes = Math.min(10, Math.ceil(Math.log2(distance)) + 1);
  for (let p = 0; p < passes; p++) {
    const s = distance / 2 ** (p + 1);
    const ox = Math.round((dx * s) / 2);
    const oy = Math.round((dy * s) / 2);
    if (!ox && !oy) continue;
    planes = planes.map((src) => {
      const out = new Float32Array(src.length);
      for (let y = 0; y < h; y++) {
        const ya = range(y - oy, 0, h - 1) * w;
        const yb = range(y + oy, 0, h - 1) * w;
        for (let x = 0; x < w; x++) {
          out[y * w + x] = (src[ya + range(x - ox, 0, w - 1)] + src[yb + range(x + ox, 0, w - 1)]) * 0.5;
        }
      }
      return out;
    });
  }
  return fromPlanes(image, ...planes);
}

/**
 * Zoom (radial) blur toward (cx, cy) (fractions): halving pair-averages of
 * scaled copies on float planes; pixels whose shift is under a third of a pixel
 * in a pass are copied (the late, fine passes only touch the outer parts).
 */
function fxRadialBlur(image, { amount, cx, cy }) {
  const { width: w, height: h } = image;
  const zoom = (amount / 100) * 0.3;
  if (!zoom) return image;
  const px = cx * (w - 1);
  const py = cy * (h - 1);
  const reach = Math.hypot(Math.max(px, w - 1 - px), Math.max(py, h - 1 - py)) * zoom;
  const passes = Math.min(9, Math.ceil(Math.log2(Math.max(1, reach))) + 1);
  let src = toPlanes(image);
  let dst = [new Float32Array(w * h), new Float32Array(w * h), new Float32Array(w * h)];
  const tap = (plane, i00, i10, i01, i11, w00, w10, w01, w11) => plane[i00] * w00 + plane[i10] * w10 + plane[i01] * w01 + plane[i11] * w11;
  for (let p = 0; p < passes; p++) {
    const s = zoom / 2 ** (p + 1) / 2;
    const [R, G, B] = src;
    const [OR, OG, OB] = dst;
    const minDistance = 0.33 / s;
    for (let y = 0, i = 0; y < h; y++) {
      const ey = y - py;
      for (let x = 0; x < w; x++, i++) {
        const ex = x - px;
        if (Math.abs(ex) < minDistance && Math.abs(ey) < minDistance && ex * ex + ey * ey < minDistance * minDistance) {
          OR[i] = R[i]; OG[i] = G[i]; OB[i] = B[i];
          continue;
        }
        let r = 0; let g = 0; let b = 0;
        for (let side = -1; side <= 1; side += 2) {
          let fx = px + ex * (1 + side * s);
          let fy = py + ey * (1 + side * s);
          fx = fx < 0 ? 0 : fx > w - 1 ? w - 1 : fx;
          fy = fy < 0 ? 0 : fy > h - 1 ? h - 1 : fy;
          const x0 = fx | 0;
          const y0 = fy | 0;
          const tx = fx - x0;
          const ty = fy - y0;
          const i00 = y0 * w + x0;
          const i10 = x0 < w - 1 ? i00 + 1 : i00;
          const i01 = y0 < h - 1 ? i00 + w : i00;
          const i11 = x0 < w - 1 ? i01 + 1 : i01;
          const w00 = (1 - tx) * (1 - ty); const w10 = tx * (1 - ty); const w01 = (1 - tx) * ty; const w11 = tx * ty;
          r += tap(R, i00, i10, i01, i11, w00, w10, w01, w11);
          g += tap(G, i00, i10, i01, i11, w00, w10, w01, w11);
          b += tap(B, i00, i10, i01, i11, w00, w10, w01, w11);
        }
        OR[i] = r * 0.5; OG[i] = g * 0.5; OB[i] = b * 0.5;
      }
    }
    [src, dst] = [dst, src];
  }
  return fromPlanes(image, ...src);
}

function fxSwirl(image, { angle, radius, cx, cy }) {
  const { width: w, height: h } = image;
  const R = Math.max(1, (radius / 100) * Math.min(w, h) * 0.5 * 1.4);
  const px = cx * (w - 1);
  const py = cy * (h - 1);
  const turn = (angle * Math.PI) / 180;
  return remap(image, (x, y, pt) => {
    const ex = x - px;
    const ey = y - py;
    const d = Math.sqrt(ex * ex + ey * ey);
    if (d >= R) { pt[0] = x; pt[1] = y; return; }
    const t = 1 - d / R;
    const a = turn * t * t;
    const c = Math.cos(a);
    const s = Math.sin(a);
    pt[0] = px + ex * c - ey * s;
    pt[1] = py + ex * s + ey * c;
  });
}

function fxRipple(image, { amplitude, wavelength, phase }) {
  const k = (2 * Math.PI) / Math.max(1, wavelength);
  const ph = (phase * Math.PI) / 180;
  return remap(image, (x, y, pt) => {
    pt[0] = x + amplitude * Math.sin(y * k + ph);
    pt[1] = y + amplitude * Math.sin(x * k + ph);
  });
}

function fxFisheye(image, { amount }) {
  const { width: w, height: h } = image;
  const k = (amount / 100) * 0.7;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const invR2 = 1 / (cx * cx + cy * cy || 1);
  return remap(image, (x, y, pt) => {
    const ex = x - cx;
    const ey = y - cy;
    const f = 1 + k * ((ex * ex + ey * ey) * invR2 - 1);
    pt[0] = cx + ex * f;
    pt[1] = cy + ey * f;
  });
}

function fxFrostedGlass(image, { radius, seed }) {
  const { width: w, height: h, data } = image;
  const src = new Uint8ClampedArray(data);
  const random = seeded(seed + 7);
  const r = Math.max(0.5, radius);
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      const sx = Math.round(range(x + (random() * 2 - 1) * r, 0, w - 1));
      const sy = Math.round(range(y + (random() * 2 - 1) * r, 0, h - 1));
      const j = (sy * w + sx) * 4;
      data[i] = src[j]; data[i + 1] = src[j + 1]; data[i + 2] = src[j + 2];
    }
  }
  return image;
}

function fxPosterize(image, { levels }) {
  const { data } = image;
  const step = 255 / Math.max(1, Math.round(levels) - 1);
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.round(i / step) * step;
  for (let i = 0; i < data.length; i += 4) { data[i] = lut[data[i]]; data[i + 1] = lut[data[i + 1]]; data[i + 2] = lut[data[i + 2]]; }
  return image;
}

function fxThreshold(image, { level }) {
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] >= level ? 255 : 0;
    data[i] = v; data[i + 1] = v; data[i + 2] = v;
  }
  return image;
}

/** Black-and-white infrared: foliage (green) glows white, skies (blue) go dark, plus halation. */
function fxInfrared(image, { amount, glow }) {
  const { width: w, height: h, data } = image;
  const n = w * h;
  const L = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) L[i] = clamp(0.35 * data[j] + 1.15 * data[j + 1] - 0.5 * data[j + 2]);
  const halo = glow ? gaussPlane(L, w, h, Math.max(1, Math.min(w, h) * 0.015)) : null;
  const k = amount / 100;
  const g = glow / 100;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const v = halo ? L[i] + (screen(L[i], halo[i]) - L[i]) * g * 0.6 : L[i];
    for (let c = 0; c < 3; c++) data[j + c] += (v - data[j + c]) * k;
  }
  return image;
}

/** Technicolor: two-strip (red / cyan) or three-strip (dye mattes) process look. */
function fxTechnicolor(image, { amount, mode }) {
  const { data } = image;
  const k = amount / 100;
  const three = mode >= 0.5;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255; const g = data[i + 1] / 255; const b = data[i + 2] / 255;
    let nr; let ng; let nb;
    if (three) {
      const redMatte = 1 - (r - (g + b) / 2);
      const greenMatte = 1 - (g - (r + b) / 2);
      const blueMatte = 1 - (b - (r + g) / 2);
      nr = greenMatte * blueMatte * r;
      ng = redMatte * blueMatte * g;
      nb = redMatte * greenMatte * b;
    } else {
      nr = r;
      ng = (g + b) / 2;
      nb = (g + b) / 2;
      // A little extra separation between the two dyes.
      const l = 0.3 * nr + 0.59 * ng + 0.11 * nb;
      nr = l + (nr - l) * 1.3; ng = l + (ng - l) * 1.3; nb = l + (nb - l) * 1.3;
    }
    data[i] += (nr * 255 - data[i]) * k;
    data[i + 1] += (ng * 255 - data[i + 1]) * k;
    data[i + 2] += (nb * 255 - data[i + 2]) * k;
  }
  return image;
}

/**
 * Special effects for the UI: { id: { label, params: { key: { min, max, default, px? } }, apply } }.
 * Params with `px: true` are in pixels of the original photo (applyEffect scales them).
 */
export const EFFECTS = Object.freeze({
  oilPaint: { label: 'Oil paint', params: { radius: { min: 1, max: 10, default: 4, px: true }, levels: { min: 4, max: 40, default: 20 } }, apply: fxOilPaint },
  pencilSketch: { label: 'Pencil sketch', params: { radius: { min: 1, max: 40, default: 8, px: true }, contrast: { min: 0, max: 100, default: 30 } }, apply: fxPencilSketch },
  colorSketch: { label: 'Colour sketch', params: { radius: { min: 1, max: 40, default: 8, px: true }, contrast: { min: 0, max: 100, default: 30 }, color: { min: 0, max: 100, default: 70 } }, apply: fxColorSketch },
  cartoon: { label: 'Cartoon', params: { smooth: { min: 1, max: 12, default: 4, px: true }, levels: { min: 2, max: 16, default: 6 }, edges: { min: 0, max: 100, default: 70 }, threshold: { min: 0, max: 100, default: 30 } }, apply: fxCartoon },
  watercolor: { label: 'Watercolour', params: { radius: { min: 1, max: 15, default: 5, px: true }, texture: { min: 0, max: 100, default: 40 }, seed: { min: 1, max: 1000, default: 1 } }, apply: fxWatercolor },
  lomo: { label: 'Lomo', params: { vignette: { min: 0, max: 100, default: 60 }, saturation: { min: 0, max: 100, default: 40 }, contrast: { min: 0, max: 100, default: 50 } }, apply: fxLomo },
  orton: { label: 'Orton glow', params: { blur: { min: 1, max: 60, default: 12, px: true }, glow: { min: 0, max: 100, default: 60 } }, apply: fxOrton },
  glow: { label: 'Glow', params: { radius: { min: 1, max: 100, default: 20, px: true }, amount: { min: 0, max: 100, default: 60 }, threshold: { min: 0, max: 254, default: 150 } }, apply: fxGlow },
  halftone: { label: 'Halftone', params: { size: { min: 3, max: 40, default: 8, px: true }, angle: { min: 0, max: 90, default: 45 }, color: { min: 0, max: 1, default: 0 } }, apply: fxHalftone },
  oldPhoto: { label: 'Old photo', params: { sepia: { min: 0, max: 100, default: 80 }, scratches: { min: 0, max: 100, default: 40 }, noise: { min: 0, max: 100, default: 30 }, vignette: { min: 0, max: 100, default: 50 }, seed: { min: 1, max: 1000, default: 1 } }, apply: fxOldPhoto },
  crossProcess: { label: 'Cross process', params: { amount: { min: 0, max: 100, default: 100 } }, apply: fxCrossProcess },
  duotone: { label: 'Duotone', params: { shadowHue: { min: 0, max: 360, default: 230 }, highlightHue: { min: 0, max: 360, default: 40 }, contrast: { min: 0, max: 100, default: 20 }, amount: { min: 0, max: 100, default: 100 } }, apply: fxDuotone },
  motionBlur: { label: 'Motion blur', params: { angle: { min: -180, max: 180, default: 0 }, distance: { min: 1, max: 200, default: 20, px: true } }, apply: fxMotionBlur },
  radialBlur: { label: 'Zoom blur', params: { amount: { min: 0, max: 100, default: 30 }, cx: { min: 0, max: 1, default: 0.5 }, cy: { min: 0, max: 1, default: 0.5 } }, apply: fxRadialBlur },
  swirl: { label: 'Swirl', params: { angle: { min: -720, max: 720, default: 180 }, radius: { min: 1, max: 100, default: 60 }, cx: { min: 0, max: 1, default: 0.5 }, cy: { min: 0, max: 1, default: 0.5 } }, apply: fxSwirl },
  ripple: { label: 'Ripple', params: { amplitude: { min: 0, max: 50, default: 6, px: true }, wavelength: { min: 4, max: 300, default: 40, px: true }, phase: { min: 0, max: 360, default: 0 } }, apply: fxRipple },
  fisheye: { label: 'Fisheye', params: { amount: { min: -100, max: 100, default: 50 } }, apply: fxFisheye },
  frostedGlass: { label: 'Frosted glass', params: { radius: { min: 1, max: 20, default: 4, px: true }, seed: { min: 1, max: 1000, default: 1 } }, apply: fxFrostedGlass },
  posterize: { label: 'Posterize', params: { levels: { min: 2, max: 16, default: 4 } }, apply: fxPosterize },
  threshold: { label: 'Threshold', params: { level: { min: 0, max: 255, default: 128 } }, apply: fxThreshold },
  infrared: { label: 'Infrared', params: { amount: { min: 0, max: 100, default: 100 }, glow: { min: 0, max: 100, default: 40 } }, apply: fxInfrared },
  technicolor: { label: 'Technicolor', params: { amount: { min: 0, max: 100, default: 100 }, mode: { min: 0, max: 1, default: 1 } }, apply: fxTechnicolor },
});

/** Effect parameters with defaults filled in and values clamped to their range. */
export function effectParams(id, params = {}) {
  const effect = EFFECTS[id];
  if (!effect) throw new Error(`Unknown effect: ${id}`);
  const out = {};
  for (const [key, spec] of Object.entries(effect.params)) {
    const v = Number(params?.[key] ?? spec.default);
    out[key] = range(Number.isFinite(v) ? v : spec.default, spec.min, spec.max);
  }
  return out;
}

/**
 * Applies effect `id` in place. `scale` = size of the image relative to the
 * original photo (preview < 1): pixel-sized params are multiplied by it.
 * Extra keys in params (e.g. duotone `dark` / `light` [r, g, b]) are passed on.
 */
export function applyEffect(image, id, params = {}, scale = 1) {
  const effect = EFFECTS[id];
  const p = effectParams(id, params);
  for (const [key, spec] of Object.entries(effect.params)) if (spec.px) p[key] *= scale;
  const result = effect.apply(image, { ...params, ...p });
  if (result && result !== image) image.data.set(result.data);
  return image;
}

// ───────────────────────── layer blend modes

export const BLEND_MODES = Object.freeze(['normal', 'multiply', 'screen', 'overlay', 'softLight', 'hardLight', 'darken', 'lighten', 'colorDodge', 'colorBurn', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']);

const hardLight = (b, s) => (s <= 0.5 ? b * 2 * s : 1 - (1 - b) * (1 - (2 * s - 1)));
const SEPARABLE = {
  normal: (b, s) => s,
  multiply: (b, s) => b * s,
  screen: (b, s) => b + s - b * s,
  overlay: (b, s) => hardLight(s, b),
  hardLight,
  softLight: (b, s) => {
    if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
    const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
    return b + (2 * s - 1) * (d - b);
  },
  darken: (b, s) => Math.min(b, s),
  lighten: (b, s) => Math.max(b, s),
  colorDodge: (b, s) => (b === 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s))),
  colorBurn: (b, s) => (b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s)),
  difference: (b, s) => Math.abs(b - s),
  exclusion: (b, s) => b + s - 2 * b * s,
};
const lutCache = new Map();

/** 256×256 table of a separable mode (base × 256 + source → result 0…255). */
function blendLut(mode) {
  let lut = lutCache.get(mode);
  if (lut) return lut;
  const fn = SEPARABLE[mode];
  lut = new Float32Array(65536);
  for (let b = 0; b < 256; b++) for (let s = 0; s < 256; s++) lut[b * 256 + s] = fn(b / 255, s / 255) * 255;
  lutCache.set(mode, lut);
  return lut;
}

// Non-separable modes (W3C compositing spec), colours 0…1.
const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
function clipColor(c) {
  const l = lum(c);
  const n = Math.min(c[0], c[1], c[2]);
  const x = Math.max(c[0], c[1], c[2]);
  for (let i = 0; i < 3; i++) {
    if (n < 0) c[i] = l + ((c[i] - l) * l) / (l - n || 1);
    if (x > 1) c[i] = l + ((c[i] - l) * (1 - l)) / (x - l || 1);
  }
  return c;
}
const setLum = (c, l) => { const d = l - lum(c); return clipColor([c[0] + d, c[1] + d, c[2] + d]); };
const sat = (c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
function setSat(c, s) {
  const max = Math.max(c[0], c[1], c[2]);
  const min = Math.min(c[0], c[1], c[2]);
  if (max <= min) return [0, 0, 0];
  return c.map((v) => ((v - min) * s) / (max - min));
}
const NON_SEPARABLE = {
  hue: (b, s) => setLum(setSat(s, sat(b)), lum(b)),
  saturation: (b, s) => setLum(setSat(b, sat(s)), lum(b)),
  color: (b, s) => setLum(s, lum(b)),
  luminosity: (b, s) => setLum(b, lum(s)),
};

/**
 * Blends `layer` onto `base` in place. mode = one of BLEND_MODES, opacity 0…1,
 * (x, y) = top-left of the layer in base pixels, scale = layer size factor.
 * The layer's own alpha is respected; parts outside the base are clipped.
 */
export function blendLayer(base, layer, { mode = 'normal', opacity = 1, x = 0, y = 0, scale = 1 } = {}) {
  const op = range(Number(opacity) || 0, 0, 1);
  if (!op || !layer?.width || !layer?.height) return base;
  const { width: bw, height: bh, data } = base;
  const { width: lw, height: lh, data: ld } = layer;
  const k = scale > 0 ? scale : 1;
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(bw, Math.ceil(x + lw * k));
  const y1 = Math.min(bh, Math.ceil(y + lh * k));
  const direct = k === 1 && Number.isInteger(x) && Number.isInteger(y);
  const lut = SEPARABLE[mode] ? blendLut(mode) : null;
  const nonSep = NON_SEPARABLE[mode];
  if (!lut && !nonSep) throw new Error(`Unknown blend mode: ${mode}`);
  const px = [0, 0, 0, 0];
  for (let py = y0; py < y1; py++) {
    for (let qx = x0; qx < x1; qx++) {
      let lr; let lg; let lb; let la;
      if (direct) {
        const j = ((py - y) * lw + (qx - x)) * 4;
        lr = ld[j]; lg = ld[j + 1]; lb = ld[j + 2]; la = ld[j + 3];
      } else {
        const fx = (qx + 0.5 - x) / k - 0.5;
        const fy = (py + 0.5 - y) / k - 0.5;
        if (fx < -0.5 || fy < -0.5 || fx > lw - 0.5 || fy > lh - 0.5) continue;
        sampleRGBA(ld, lw, lh, fx, fy, px, 0);
        [lr, lg, lb, la] = px;
      }
      const a = (la / 255) * op;
      if (a <= 0) continue;
      const i = (py * bw + qx) * 4;
      const br = data[i]; const bg = data[i + 1]; const bb = data[i + 2];
      const ab = data[i + 3] / 255;
      let rr; let rg; let rb;
      if (lut) {
        rr = lut[br * 256 + Math.round(lr)];
        rg = lut[bg * 256 + Math.round(lg)];
        rb = lut[bb * 256 + Math.round(lb)];
      } else {
        const res = nonSep([br / 255, bg / 255, bb / 255], [lr / 255, lg / 255, lb / 255]);
        rr = res[0] * 255; rg = res[1] * 255; rb = res[2] * 255;
      }
      // W3C: the blend result only applies where the base is opaque, then source-over.
      const mr = (1 - ab) * lr + ab * rr;
      const mg = (1 - ab) * lg + ab * rg;
      const mb = (1 - ab) * lb + ab * rb;
      const ao = a + ab * (1 - a);
      const kb = ab * (1 - a);
      data[i] = (a * mr + kb * br) / ao;
      data[i + 1] = (a * mg + kb * bg) / ao;
      data[i + 2] = (a * mb + kb * bb) / ao;
      data[i + 3] = ao * 255;
    }
  }
  return base;
}

// ───────────────────────── selections and pixel targeting (Float32Array 0…1, w×h)

/** Softens a mask edge: separable box blur, `radius` pixels, run twice (≈ Gaussian). */
export function featherMask(mask, width, height, radius) {
  const r = Math.round(radius);
  if (r < 1) return mask;
  const tmp = new Float32Array(mask.length);
  const pass = (src, dst, horizontal) => {
    const n = horizontal ? width : height;
    const lines = horizontal ? height : width;
    for (let l = 0; l < lines; l++) {
      let sum = 0;
      const at = (k) => (horizontal ? l * width + range(k, 0, n - 1) : range(k, 0, n - 1) * width + l);
      for (let k = -r; k <= r; k++) sum += src[at(k)];
      for (let k = 0; k < n; k++) {
        dst[horizontal ? l * width + k : k * width + l] = sum / (2 * r + 1);
        sum += src[at(k + r + 1)] - src[at(k - r)];
      }
    }
  };
  for (let i = 0; i < 2; i++) { pass(mask, tmp, true); pass(tmp, mask, false); }
  return mask;
}

/** Freehand lasso: inside the polygon (pixels, even–odd rule), feathered by `feather` pixels. */
export function polygonMask(width, height, points, feather = 0) {
  const mask = new Float32Array(width * height);
  if (!points || points.length < 3) return mask;
  for (let y = 0; y < height; y++) {
    const cy = y + 0.5;
    const xs = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if ((yi > cy) !== (yj > cy)) xs.push(xi + ((cy - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5));
      const to = Math.min(width - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = from; x <= to; x++) mask[y * width + x] = 1;
    }
  }
  return featherMask(mask, width, height, feather);
}

/**
 * Magic wand: the connected area around (x, y) whose colour is within
 * `tolerance` (0…255, distance in RGB) of the clicked pixel; feathered edge.
 */
export function wandMask(image, x, y, tolerance = 32, feather = 2) {
  const { width, height, data } = image;
  const mask = new Float32Array(width * height);
  const sx = Math.round(x);
  const sy = Math.round(y);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return mask;
  const s = (sy * width + sx) * 4;
  const r0 = data[s]; const g0 = data[s + 1]; const b0 = data[s + 2];
  const limit = tolerance * tolerance * 3;
  const seen = new Uint8Array(width * height);
  const stack = [sy * width + sx];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop();
    const j = i * 4;
    const dr = data[j] - r0; const dg = data[j + 1] - g0; const db = data[j + 2] - b0;
    if (dr * dr + dg * dg + db * db > limit) continue;
    mask[i] = 1;
    const px = i % width;
    const py = (i / width) | 0;
    if (px > 0 && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
    if (px < width - 1 && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
    if (py > 0 && !seen[i - width]) { seen[i - width] = 1; stack.push(i - width); }
    if (py < height - 1 && !seen[i + width]) { seen[i + width] = 1; stack.push(i + width); }
  }
  return featherMask(mask, width, height, feather);
}

/**
 * Pixel targeting: pixels whose hue is within ±range of `hue` (degrees), with
 * at least `satMin` saturation and lightness between lumMin and lumMax (0…100).
 * The edges of each range fade over `soft` (degrees / percent) so the result
 * blends without banding. `hue` null = any hue (a tonal range only).
 */
export function colorRangeMask(image, { hue = null, range: hueRange = 30, satMin = 0, lumMin = 0, lumMax = 100, soft = 12 } = {}) {
  const { width, height, data } = image;
  const mask = new Float32Array(width * height);
  const fade = (distance, limit) => (distance <= limit ? 1 : distance >= limit + soft ? 0 : 1 - (distance - limit) / soft);
  for (let i = 0, j = 0; i < mask.length; i++, j += 4) {
    const r = data[j] / 255; const g = data[j + 1] / 255; const b = data[j + 2] / 255;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let m = 1;
    if (hue != null) {
      let h = 0;
      if (d) h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
      const dh = Math.abs(((h - hue + 540) % 360) - 180);
      m *= d ? fade(dh, hueRange) : 0;
    }
    m *= satMin > 0 ? (sat * 100 >= satMin ? 1 : Math.max(0, 1 - (satMin - sat * 100) / soft)) : 1;
    const L = l * 100;
    m *= L < lumMin ? Math.max(0, 1 - (lumMin - L) / soft) : L > lumMax ? Math.max(0, 1 - (L - lumMax) / soft) : 1;
    mask[i] = m;
  }
  return mask;
}

// ───────────────────────── colour balance wheels (shadows / midtones / highlights)

/** RGB unit tint (−1…1 per channel, grey-free) for a hue in degrees. */
function hueTint(hue) {
  const h = (((hue % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  const [r, g, b] = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
  const mean = (r + g + b) / 3;
  return [r - mean, g - mean, b - mean];
}

/**
 * Colour balance: { shadows, midtones, highlights } each { hue (deg), amount (0…100) }.
 * Each range pushes its colour into the pixels by luminance weight (shadows
 * fade out by mid-grey, highlights fade in from it, midtones peak there);
 * the average of R, G and B of each pixel is kept.
 */
export function colorBalance(image, balance) {
  if (!balance) return image;
  const ranges = ['shadows', 'midtones', 'highlights'].map((key) => {
    const r = balance[key];
    return r && r.amount ? hueTint(r.hue ?? 0).map((v) => v * (r.amount / 100) * 90) : null;
  });
  if (!ranges.some(Boolean)) return image;
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    const w = [(1 - l) ** 2, 1 - (2 * l - 1) ** 2, l ** 2];
    let r = 0; let g = 0; let b = 0;
    for (let k = 0; k < 3; k++) { const t = ranges[k]; if (!t) continue; r += t[0] * w[k]; g += t[1] * w[k]; b += t[2] * w[k]; }
    d[i] = d[i] + r; d[i + 1] = d[i + 1] + g; d[i + 2] = d[i + 2] + b;
  }
  return image;
}
