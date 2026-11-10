// Pixel buffers and the basic operations every style and effect is built from.
// A raster is { width, height, data: Uint8ClampedArray (RGBA) } — the same shape as
// ImageData, so canvases, the worker and the tests (Node) all share it. Single-channel
// images are Float32Array (0…255 for lightness, 0…1 for masks) with the raster's size.
// Everything here is pure: no DOM, no canvas.

export function createRaster(width, height, data = null) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  return { width: w, height: h, data: data ?? new Uint8ClampedArray(w * h * 4) };
}

export const cloneRaster = (r) => createRaster(r.width, r.height, new Uint8ClampedArray(r.data));

export function fillRaster(r, [red, green, blue, alpha = 255]) {
  const d = r.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = red; d[i + 1] = green; d[i + 2] = blue; d[i + 3] = alpha; }
  return r;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Deterministic random numbers (mulberry32): the same seed draws the same caricature. */
export function rng(seed) {
  let a = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────────────── colour

/** Rec. 601 lightness 0…255 of every pixel. */
export function toGray(r) {
  const n = r.width * r.height;
  const out = new Float32Array(n);
  const d = r.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) out[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
  return out;
}

/** A grey raster from one channel (values clamped to 0…255). */
export function grayToRaster(gray, width, height) {
  const r = createRaster(width, height);
  const d = r.data;
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) { const v = gray[i]; d[j] = v; d[j + 1] = v; d[j + 2] = v; d[j + 3] = 255; }
  return r;
}

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

export function hslToRgb(h, s, l) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
}

/** "#rrggbb" → [r, g, b]; anything else → fallback. */
export function parseColor(text, fallback = [0, 0, 0]) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(text ?? '').trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const toHex = ([r, g, b]) => `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;

// ───────────────────────── size

/** Bilinear sample of channel `c` at (x, y) (clamped to the edges). */
export function sample(r, x, y, out, offset = 0) {
  const w = r.width;
  const h = r.height;
  const fx = clamp(x, 0, w - 1);
  const fy = clamp(y, 0, h - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const d = r.data;
  const a = (y0 * w + x0) * 4;
  const b = (y0 * w + x1) * 4;
  const c = (y1 * w + x0) * 4;
  const e = (y1 * w + x1) * 4;
  for (let k = 0; k < 4; k++) {
    const top = d[a + k] + (d[b + k] - d[a + k]) * tx;
    const bottom = d[c + k] + (d[e + k] - d[c + k]) * tx;
    out[offset + k] = top + (bottom - top) * ty;
  }
  return out;
}

/** Resized copy: area averaging when shrinking (no aliasing), bilinear when growing. */
export function resize(r, width, height) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (w === r.width && h === r.height) return cloneRaster(r);
  const out = createRaster(w, h);
  const sx = r.width / w;
  const sy = r.height / h;
  const d = r.data;
  const o = out.data;
  if (sx >= 1.5 || sy >= 1.5) {
    for (let y = 0; y < h; y++) {
      const y0 = Math.floor(y * sy);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      for (let x = 0; x < w; x++) {
        const x0 = Math.floor(x * sx);
        const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
        let rr = 0; let gg = 0; let bb = 0; let aa = 0; let n = 0;
        for (let yy = y0; yy < y1 && yy < r.height; yy++) {
          let i = (yy * r.width + x0) * 4;
          for (let xx = x0; xx < x1 && xx < r.width; xx++, i += 4) { rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; aa += d[i + 3]; n++; }
        }
        const j = (y * w + x) * 4;
        o[j] = rr / n; o[j + 1] = gg / n; o[j + 2] = bb / n; o[j + 3] = aa / n;
      }
    }
    return out;
  }
  const px = new Float32Array(4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      sample(r, (x + 0.5) * sx - 0.5, (y + 0.5) * sy - 0.5, px);
      const j = (y * w + x) * 4;
      o[j] = px[0]; o[j + 1] = px[1]; o[j + 2] = px[2]; o[j + 3] = px[3];
    }
  }
  return out;
}

/** The size that fits `max` on the longer side (never larger than the original). */
export function fitSize(width, height, max) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}

// ───────────────────────── blur

/** One box-blur pass over a single channel (separable, running sums: O(n) whatever the radius). */
function boxPass(src, dst, w, h, radius, horizontal) {
  const r = Math.max(0, Math.round(radius));
  if (r === 0) { dst.set(src); return; }
  const span = 2 * r + 1;
  if (horizontal) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[row + clamp(k, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        dst[row + x] = sum / span;
        sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
      }
    }
  } else {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[clamp(k, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        dst[y * w + x] = sum / span;
        sum += src[Math.min(h - 1, y + r + 1) * w + x] - src[Math.max(0, y - r) * w + x];
      }
    }
  }
}

/** Exact separable Gaussian (small sigmas, where three boxes are too coarse to tell 0.6 from 1). */
function gaussianChannel(channel, w, h, sigma) {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(2 * radius + 1);
  let sum = 0;
  for (let k = -radius; k <= radius; k++) { kernel[k + radius] = Math.exp(-(k * k) / (2 * sigma * sigma)); sum += kernel[k + radius]; }
  for (let k = 0; k < kernel.length; k++) kernel[k] /= sum;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = -radius; k <= radius; k++) v += channel[row + clamp(x + k, 0, w - 1)] * kernel[k + radius];
      tmp[row + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = -radius; k <= radius; k++) v += tmp[clamp(y + k, 0, h - 1) * w + x] * kernel[k + radius];
      out[y * w + x] = v;
    }
  }
  return out;
}

/** Gaussian blur of one channel: exact for small sigmas, three box passes (any radius, O(n)) above. */
export function blurChannel(channel, w, h, sigma) {
  if (sigma <= 0.2) return Float32Array.from(channel);
  if (sigma < 2) return gaussianChannel(channel, w, h, sigma);
  // Box sizes for three passes (Kovesi): the variance of three boxes ≈ sigma².
  const ideal = Math.sqrt((12 * sigma * sigma) / 3 + 1);
  let lower = Math.floor(ideal);
  if (lower % 2 === 0) lower -= 1;
  const upper = lower + 2;
  const m = Math.round((12 * sigma * sigma - 3 * lower * lower - 12 * lower - 9) / (-4 * lower - 4));
  const radii = [0, 1, 2].map((i) => ((i < m ? lower : upper) - 1) / 2);
  let a = Float32Array.from(channel);
  let b = new Float32Array(a.length);
  for (const radius of radii) {
    boxPass(a, b, w, h, radius, true);
    boxPass(b, a, w, h, radius, false);
  }
  return a;
}

/** Splits a raster into its four channels (Float32). */
export function channels(r) {
  const n = r.width * r.height;
  const out = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  const d = r.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) { out[0][i] = d[j]; out[1][i] = d[j + 1]; out[2][i] = d[j + 2]; out[3][i] = d[j + 3]; }
  return out;
}

export function fromChannels(list, width, height) {
  const r = createRaster(width, height);
  const d = r.data;
  const n = width * height;
  const alpha = list[3];
  for (let i = 0, j = 0; i < n; i++, j += 4) { d[j] = list[0][i]; d[j + 1] = list[1][i]; d[j + 2] = list[2][i]; d[j + 3] = alpha ? alpha[i] : 255; }
  return r;
}

export function blurRaster(r, sigma) {
  if (sigma <= 0.2) return cloneRaster(r);
  const list = channels(r).map((c, i) => (i === 3 ? c : blurChannel(c, r.width, r.height, sigma)));
  return fromChannels(list, r.width, r.height);
}

// ───────────────────────── edges

/** Sobel gradient magnitude (0…~1443) and direction of a grey channel. */
export function sobel(gray, w, h) {
  const mag = new Float32Array(w * h);
  const dir = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const ym = Math.max(0, y - 1) * w;
    const y0 = y * w;
    const yp = Math.min(h - 1, y + 1) * w;
    for (let x = 0; x < w; x++) {
      const xm = Math.max(0, x - 1);
      const xp = Math.min(w - 1, x + 1);
      const gx = -gray[ym + xm] - 2 * gray[y0 + xm] - gray[yp + xm] + gray[ym + xp] + 2 * gray[y0 + xp] + gray[yp + xp];
      const gy = -gray[ym + xm] - 2 * gray[ym + x] - gray[ym + xp] + gray[yp + xm] + 2 * gray[yp + x] + gray[yp + xp];
      mag[y0 + x] = Math.hypot(gx, gy);
      dir[y0 + x] = Math.atan2(gy, gx);
    }
  }
  return { mag, dir };
}

/**
 * Ink lines by the extended difference of Gaussians (XDoG, Winnemöller 2012): 1 = paper, 0 = ink,
 * soft in between. `sigma` sets the line width, `tau` how much detail becomes ink, `phi` how hard
 * the lines are, `eps` the lightness threshold.
 */
export function xdog(gray, w, h, { sigma = 1.2, k = 1.6, tau = 0.98, phi = 12, eps = 0.0 } = {}) {
  const g1 = blurChannel(gray, w, h, sigma);
  const g2 = blurChannel(gray, w, h, sigma * k);
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) {
    const d = ((1 + tau) * g1[i] - tau * g2[i]) / 255;
    out[i] = d >= eps ? 1 : 1 + Math.tanh(phi * (d - eps));
  }
  return out;
}

/** Grey-scale dilation (max) or erosion (min) with a square of `radius` (lines thicker / thinner). */
export function morph(channel, w, h, radius, mode = 'min') {
  const r = Math.max(0, Math.round(radius));
  if (!r) return Float32Array.from(channel);
  const pick = mode === 'min' ? Math.min : Math.max;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = channel[y * w + x];
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) v = pick(v, channel[y * w + k]);
      tmp[y * w + x] = v;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = tmp[y * w + x];
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) v = pick(v, tmp[k * w + x]);
      out[y * w + x] = v;
    }
  }
  return out;
}

// ───────────────────────── smoothing that keeps edges

/**
 * Bilateral filter (edge-preserving smoothing): neighbours within `radius` count by distance and by
 * how close their colour is (`range`, 0…255). A few passes give the flat areas of a cartoon.
 */
export function bilateral(r, radius = 3, range = 28, passes = 1) {
  let src = r;
  const w = r.width;
  const h = r.height;
  const rad = Math.max(1, Math.round(radius));
  const sigmaS = rad / 1.6;
  const spatial = [];
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
    const d2 = dx * dx + dy * dy;
    if (d2 <= rad * rad) spatial.push([dx, dy, Math.exp(-d2 / (2 * sigmaS * sigmaS))]);
  }
  const rangeLut = new Float32Array(3 * 256 * 256 / 64 + 1);
  const inv = 1 / (2 * range * range);
  for (let i = 0; i < rangeLut.length; i++) rangeLut[i] = Math.exp(-(i * 64) * inv);
  for (let pass = 0; pass < passes; pass++) {
    const out = createRaster(w, h);
    const s = src.data;
    const o = out.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = (y * w + x) * 4;
        const r0 = s[c]; const g0 = s[c + 1]; const b0 = s[c + 2];
        let sr = 0; let sg = 0; let sb = 0; let sw = 0;
        for (let k = 0; k < spatial.length; k++) {
          const p = spatial[k];
          const xx = x + p[0];
          const yy = y + p[1];
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = (yy * w + xx) * 4;
          const dr = s[j] - r0; const dg = s[j + 1] - g0; const db = s[j + 2] - b0;
          const wgt = p[2] * rangeLut[((dr * dr + dg * dg + db * db) / 64) | 0];
          sr += s[j] * wgt; sg += s[j + 1] * wgt; sb += s[j + 2] * wgt; sw += wgt;
        }
        o[c] = sr / sw; o[c + 1] = sg / sw; o[c + 2] = sb / sw; o[c + 3] = s[c + 3];
      }
    }
    src = out;
  }
  return src;
}

/**
 * Kuwahara filter (oil paint look): each pixel takes the mean of the least varied of its four
 * neighbouring quadrants. Integral images make it O(n) whatever the radius.
 */
export function kuwahara(r, radius = 4) {
  const w = r.width;
  const h = r.height;
  const W = w + 1;
  const sums = [0, 1, 2].map(() => new Float64Array(W * (h + 1)));
  const sq = new Float64Array(W * (h + 1));
  const d = r.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const at = (y + 1) * W + x + 1;
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      for (let c = 0; c < 3; c++) sums[c][at] = d[i + c] + sums[c][at - 1] + sums[c][at - W] - sums[c][at - W - 1];
      sq[at] = lum * lum + sq[at - 1] + sq[at - W] - sq[at - W - 1];
    }
  }
  const lumSum = new Float64Array(W * (h + 1));
  for (let i = 0; i < lumSum.length; i++) lumSum[i] = 0.299 * sums[0][i] + 0.587 * sums[1][i] + 0.114 * sums[2][i];
  const box = (arr, x0, y0, x1, y1) => arr[y1 * W + x1] - arr[y0 * W + x1] - arr[y1 * W + x0] + arr[y0 * W + x0];
  const out = createRaster(w, h);
  const o = out.data;
  const rad = Math.max(1, Math.round(radius));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = Infinity;
      let pick = null;
      for (const [ax, ay] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const x0 = clamp(x + (ax ? -rad : 0), 0, w);
        const y0 = clamp(y + (ay ? -rad : 0), 0, h);
        const x1 = clamp(x + (ax ? 1 : rad + 1), 0, w);
        const y1 = clamp(y + (ay ? 1 : rad + 1), 0, h);
        const n = (x1 - x0) * (y1 - y0);
        if (n <= 0) continue;
        const mean = box(lumSum, x0, y0, x1, y1) / n;
        const variance = box(sq, x0, y0, x1, y1) / n - mean * mean;
        if (variance < best) { best = variance; pick = [x0, y0, x1, y1, n]; }
      }
      const i = (y * w + x) * 4;
      const [x0, y0, x1, y1, n] = pick;
      o[i] = box(sums[0], x0, y0, x1, y1) / n;
      o[i + 1] = box(sums[1], x0, y0, x1, y1) / n;
      o[i + 2] = box(sums[2], x0, y0, x1, y1) / n;
      o[i + 3] = d[i + 3];
    }
  }
  return out;
}

// ───────────────────────── colour reduction

/**
 * k-means palette (k colours) of a raster from a sample of its pixels — the flat colours of
 * cel shading and pixel art. Deterministic for a seed.
 */
export function kmeansPalette(r, k = 8, { seed = 1, iterations = 10, samples = 6000 } = {}) {
  const n = r.width * r.height;
  const random = rng(seed);
  const d = r.data;
  const step = Math.max(1, Math.floor(n / samples));
  const points = [];
  for (let i = Math.floor(random() * step); i < n; i += step) { const j = i * 4; points.push([d[j], d[j + 1], d[j + 2]]); }
  if (!points.length) return [[128, 128, 128]];
  // k-means++ start: spread the first centres.
  const centres = [points[Math.floor(random() * points.length)].slice()];
  while (centres.length < k) {
    const dist = points.map((p) => Math.min(...centres.map((c) => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2)));
    const total = dist.reduce((a, b) => a + b, 0);
    if (total <= 0) break;
    let pick = random() * total;
    let index = 0;
    while (pick > dist[index] && index < dist.length - 1) { pick -= dist[index]; index++; }
    centres.push(points[index].slice());
  }
  const assign = new Int32Array(points.length);
  for (let it = 0; it < iterations; it++) {
    for (let p = 0; p < points.length; p++) assign[p] = nearest(centres, points[p]);
    const acc = centres.map(() => [0, 0, 0, 0]);
    for (let p = 0; p < points.length; p++) { const a = acc[assign[p]]; a[0] += points[p][0]; a[1] += points[p][1]; a[2] += points[p][2]; a[3]++; }
    acc.forEach((a, i) => { if (a[3]) centres[i] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
  }
  return centres;
}

function nearest(palette, [r, g, b]) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const c = palette[i];
    const dist = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
    if (dist < bestD) { bestD = dist; best = i; }
  }
  return best;
}

/** Every pixel replaced by the nearest palette colour (a cache keeps it fast). */
export function mapToPalette(r, palette) {
  const out = createRaster(r.width, r.height);
  const d = r.data;
  const o = out.data;
  const cache = new Map();
  const px = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    const key = ((d[i] >> 2) << 12) | ((d[i + 1] >> 2) << 6) | (d[i + 2] >> 2);
    let index = cache.get(key);
    if (index === undefined) { px[0] = d[i]; px[1] = d[i + 1]; px[2] = d[i + 2]; index = nearest(palette, px); cache.set(key, index); }
    const c = palette[index];
    o[i] = c[0]; o[i + 1] = c[1]; o[i + 2] = c[2]; o[i + 3] = d[i + 3];
  }
  return out;
}

/** `levels` steps per channel. */
export function posterize(r, levels = 5) {
  const out = cloneRaster(r);
  const o = out.data;
  const n = Math.max(2, Math.round(levels)) - 1;
  for (let i = 0; i < o.length; i += 4) for (let c = 0; c < 3; c++) o[i + c] = Math.round((o[i + c] / 255) * n) * (255 / n);
  return out;
}

// ───────────────────────── noise and paper

/** Smooth value noise in 0…1 at (x, y) with feature size `scale` pixels. */
export function valueNoise(seed) {
  const table = new Float32Array(512);
  const random = rng(seed);
  for (let i = 0; i < table.length; i++) table[i] = random();
  const hash = (x, y) => table[((x * 73856093) ^ (y * 19349663)) & 511];
  return (x, y, scale = 8) => {
    const fx = x / scale;
    const fy = y / scale;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = hash(x0, y0); const b = hash(x0 + 1, y0); const c = hash(x0, y0 + 1); const e = hash(x0 + 1, y0 + 1);
    return lerp(lerp(a, b, sx), lerp(c, e, sx), sy);
  };
}

/** Paper grain (0…1, around 0.5) over a w×h area: fine fibres plus a slow wash. */
export function paperTexture(w, h, seed = 7, scale = 1) {
  const noise = valueNoise(seed);
  const random = rng(seed + 11);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const coarse = noise(x, y, 60 * scale);
      const fine = noise(x, y, 2.2 * scale);
      out[y * w + x] = 0.25 * coarse + 0.45 * fine + 0.3 * random();
    }
  }
  return out;
}

/** Blends `top` over `base` (both rasters of one size) with weight 0…1 per pixel or one number. */
export function mix(base, top, weight) {
  const out = createRaster(base.width, base.height);
  const a = base.data;
  const b = top.data;
  const o = out.data;
  const constant = typeof weight === 'number';
  for (let i = 0, p = 0; i < a.length; i += 4, p++) {
    const t = constant ? weight : weight[p];
    o[i] = a[i] + (b[i] - a[i]) * t;
    o[i + 1] = a[i + 1] + (b[i + 1] - a[i + 1]) * t;
    o[i + 2] = a[i + 2] + (b[i + 2] - a[i + 2]) * t;
    o[i + 3] = a[i + 3] + (b[i + 3] - a[i + 3]) * t;
  }
  return out;
}

/** Multiplies every pixel's colour by a 0…1 channel (ink lines, shading). */
export function multiplyBy(r, factor, ink = [0, 0, 0]) {
  const out = cloneRaster(r);
  const o = out.data;
  for (let i = 0, p = 0; i < o.length; i += 4, p++) {
    const t = clamp(factor[p], 0, 1);
    o[i] = ink[0] + (o[i] - ink[0]) * t;
    o[i + 1] = ink[1] + (o[i + 1] - ink[1]) * t;
    o[i + 2] = ink[2] + (o[i + 2] - ink[2]) * t;
  }
  return out;
}

/** Mean colour of the pixels where `mask` (0…1) is above `min`. */
export function meanColor(r, mask = null, min = 0.5) {
  const d = r.data;
  let rr = 0; let gg = 0; let bb = 0; let n = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    if (mask && mask[p] < min) continue;
    rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++;
  }
  return n ? [rr / n, gg / n, bb / n] : [128, 128, 128];
}
