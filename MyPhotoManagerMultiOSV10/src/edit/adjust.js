// Pixel algorithms of the editor. Every function works on an ImageData-like
// object { data: Uint8ClampedArray (RGBA), width, height } in place, so the
// same code runs in the page, in a worker and in Node (unit tests).

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Neutral adjustment settings (every slider at its middle / off). */
export const DEFAULT_ADJUST = Object.freeze({
  exposure: 0, // EV, -3 … 3
  brightness: 0, // -100 … 100
  contrast: 0, // -100 … 100
  highlights: 0, // -100 … 100 (negative = recover)
  shadows: 0, // -100 … 100 (positive = lift)
  whites: 0,
  blacks: 0,
  temperature: 0, // -100 (cool) … 100 (warm)
  tint: 0, // -100 (green) … 100 (magenta)
  saturation: 0,
  vibrance: 0,
  hue: 0, // degrees
  levels: null, // { black, white, gamma }
  curves: null, // { rgb: [[x,y]…], r, g, b }
  effect: 'none', // grayscale | sepia | invert | posterize | solarize | threshold
  effectAmount: 100,
});

export const isNeutral = (adjust) => Object.entries(DEFAULT_ADJUST).every(([key, value]) => {
  const current = adjust?.[key];
  if (key === 'levels') return !current || (current.black === 0 && current.white === 255 && current.gamma === 1);
  if (key === 'curves') return !current || Object.values(current).every((points) => !points || isIdentityCurve(points));
  if (key === 'effectAmount') return true;
  return current == null || current === value;
});

const isIdentityCurve = (points) => points.length === 2 && points[0][0] === 0 && points[0][1] === 0 && points[1][0] === 255 && points[1][1] === 255;

/** Monotone cubic interpolation through control points → 256-entry table. */
export function curveTable(points) {
  const table = new Float64Array(256);
  const pts = [...(points ?? [[0, 0], [255, 255]])].sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) { for (let i = 0; i < 256; i++) table[i] = i; return table; }
  const n = pts.length;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const d = [];
  const m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  for (let x = 0; x < 256; x++) {
    if (x <= xs[0]) { table[x] = ys[0]; continue; }
    if (x >= xs[n - 1]) { table[x] = ys[n - 1]; continue; }
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    table[x] = (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  }
  return table;
}

/** Tone tables for R, G, B: exposure, brightness, contrast, whites/blacks, levels, curves. */
export function toneTables(adjust) {
  const a = { ...DEFAULT_ADJUST, ...adjust };
  const gain = 2 ** a.exposure;
  const contrast = a.contrast / 100;
  const k = contrast >= 0 ? 1 + contrast * 2 : 1 + contrast; // slope at mid grey
  const black = (a.levels?.black ?? 0) - a.blacks * 0.5;
  const white = (a.levels?.white ?? 255) - a.whites * 0.5;
  const gamma = a.levels?.gamma ?? 1;
  const master = a.curves?.rgb ? curveTable(a.curves.rgb) : null;
  const tables = ['r', 'g', 'b'].map((channel) => {
    const own = a.curves?.[channel] ? curveTable(a.curves[channel]) : null;
    const table = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      let v = i * gain + a.brightness * 1.28;
      // Contrast as an S-curve around mid grey (keeps black and white in place for positive values).
      let x = v / 255;
      if (contrast > 0) {
        const s = (t) => 1 / (1 + Math.exp(-k * 4 * (t - 0.5)));
        x = (s(Math.min(1, Math.max(0, x))) - s(0)) / (s(1) - s(0));
      } else if (contrast < 0) {
        x = 0.5 + (x - 0.5) * k;
      }
      v = x * 255;
      v = ((v - black) / Math.max(1, white - black)) * 255;
      if (gamma !== 1) v = 255 * Math.pow(Math.min(1, Math.max(0, v / 255)), 1 / gamma);
      v = clamp(v);
      if (own) v = clamp(own[Math.round(v)]);
      if (master) v = clamp(master[Math.round(v)]);
      table[i] = Math.round(v);
    }
    return table;
  });
  return tables;
}

/** Colour and tone adjustments (everything except spatial filters). */
export function applyAdjustments(image, adjust) {
  const a = { ...DEFAULT_ADJUST, ...adjust };
  const { data } = image;
  const [tr, tg, tb] = toneTables(a);
  // White balance as channel gains.
  const warm = a.temperature / 100;
  const tint = a.tint / 100;
  const wr = 1 + warm * 0.25;
  const wb = 1 - warm * 0.25;
  const wg = 1 - tint * 0.2;
  const balance = wr !== 1 || wb !== 1 || wg !== 1;
  const sat = 1 + a.saturation / 100;
  const vib = a.vibrance / 100;
  const shadows = a.shadows / 100;
  const highlights = a.highlights / 100;
  const hue = (a.hue * Math.PI) / 180;
  const cosH = Math.cos(hue);
  const sinH = Math.sin(hue);
  // Hue rotation matrix (luma-preserving, about the grey axis).
  const hm = hue ? [
    0.299 + 0.701 * cosH + 0.168 * sinH, 0.587 - 0.587 * cosH + 0.330 * sinH, 0.114 - 0.114 * cosH - 0.497 * sinH,
    0.299 - 0.299 * cosH - 0.328 * sinH, 0.587 + 0.413 * cosH + 0.035 * sinH, 0.114 - 0.114 * cosH + 0.292 * sinH,
    0.299 - 0.300 * cosH + 1.250 * sinH, 0.587 - 0.588 * cosH - 1.050 * sinH, 0.114 + 0.886 * cosH - 0.203 * sinH,
  ] : null;
  const effect = a.effect;
  const effectMix = (a.effectAmount ?? 100) / 100;
  const doColor = sat !== 1 || vib !== 0;
  const doLocal = shadows !== 0 || highlights !== 0;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    if (balance) { r *= wr; g *= wg; b *= wb; }
    if (doLocal) {
      const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      // Shadows: lift dark tones; highlights: pull bright tones down (or up).
      const shadowWeight = (1 - l) * (1 - l);
      const highlightWeight = l * l;
      const lift = 1 + shadows * shadowWeight * 1.2 + highlights * highlightWeight * 0.6;
      r *= lift; g *= lift; b *= lift;
    }
    r = tr[r > 255 ? 255 : r < 0 ? 0 : r | 0];
    g = tg[g > 255 ? 255 : g < 0 ? 0 : g | 0];
    b = tb[b > 255 ? 255 : b < 0 ? 0 : b | 0];
    if (hm) {
      const nr = hm[0] * r + hm[1] * g + hm[2] * b;
      const ng = hm[3] * r + hm[4] * g + hm[5] * b;
      const nb = hm[6] * r + hm[7] * g + hm[8] * b;
      r = nr; g = ng; b = nb;
    }
    if (doColor) {
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const current = max === 0 ? 0 : (max - min) / max;
      const s = sat * (1 + vib * (1 - current));
      r = l + (r - l) * s;
      g = l + (g - l) * s;
      b = l + (b - l) * s;
    }
    if (effect !== 'none') {
      let er = r; let eg = g; let eb = b;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      switch (effect) {
        case 'grayscale': er = l; eg = l; eb = l; break;
        case 'sepia': er = 0.393 * r + 0.769 * g + 0.189 * b; eg = 0.349 * r + 0.686 * g + 0.168 * b; eb = 0.272 * r + 0.534 * g + 0.131 * b; break;
        case 'invert': er = 255 - r; eg = 255 - g; eb = 255 - b; break;
        case 'posterize': { const step = 255 / 4; er = Math.round(r / step) * step; eg = Math.round(g / step) * step; eb = Math.round(b / step) * step; break; }
        case 'solarize': er = r > 128 ? 255 - r : r; eg = g > 128 ? 255 - g : g; eb = b > 128 ? 255 - b : b; break;
        case 'threshold': er = eg = eb = l >= 128 ? 255 : 0; break;
        case 'cool': er = r * 0.9; eg = g; eb = Math.min(255, b * 1.15 + 10); break;
        case 'warm': er = Math.min(255, r * 1.12 + 8); eg = g * 1.03; eb = b * 0.85; break;
        case 'vintage': er = 0.5 * l + 0.5 * r + 30; eg = 0.45 * l + 0.5 * g + 15; eb = 0.4 * l + 0.4 * b; break;
        default: break;
      }
      r += (er - r) * effectMix;
      g += (eg - g) * effectMix;
      b += (eb - b) * effectMix;
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  return image;
}

// ───────────────────────── spatial filters

/** Box blur of every channel (one pass horizontal + one vertical), radius in pixels. */
export function boxBlur(image, radius) {
  const r = Math.max(0, Math.round(radius));
  if (!r) return image;
  const { width: w, height: h, data } = image;
  const temp = new Float32Array(data.length);
  const size = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += data[(y * w + Math.min(w - 1, Math.max(0, k))) * 4 + c];
      for (let x = 0; x < w; x++) {
        temp[(y * w + x) * 4 + c] = sum / size;
        const add = Math.min(w - 1, x + r + 1);
        const sub = Math.max(0, x - r);
        sum += data[(y * w + add) * 4 + c] - data[(y * w + sub) * 4 + c];
      }
    }
  }
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += temp[(Math.min(h - 1, Math.max(0, k)) * w + x) * 4 + c];
      for (let y = 0; y < h; y++) {
        data[(y * w + x) * 4 + c] = sum / size;
        const add = Math.min(h - 1, y + r + 1);
        const sub = Math.max(0, y - r);
        sum += temp[(add * w + x) * 4 + c] - temp[(sub * w + x) * 4 + c];
      }
    }
  }
  return image;
}

/** Approximate Gaussian blur: three box blurs. */
export function gaussianBlur(image, sigma) {
  if (sigma <= 0.3) return image;
  // Box sizes for 3 passes (Kovesi).
  const n = 3;
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let lower = Math.floor(ideal);
  if (lower % 2 === 0) lower -= 1;
  const upper = lower + 2;
  const m = Math.round((12 * sigma * sigma - n * lower * lower - 4 * n * lower - 3 * n) / (-4 * lower - 4));
  for (let i = 0; i < n; i++) boxBlur(image, ((i < m ? lower : upper) - 1) / 2);
  return image;
}

const copyOf = (image) => ({ width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) });

/** Unsharp mask: image + amount × (image − blurred). `threshold` skips small differences (noise). */
export function unsharpMask(image, { amount = 100, radius = 1, threshold = 0 } = {}) {
  if (!amount) return image;
  const blurred = gaussianBlur(copyOf(image), radius);
  const k = amount / 100;
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const diff = data[i + c] - blurred.data[i + c];
      if (Math.abs(diff) >= threshold) data[i + c] = data[i + c] + diff * k;
    }
  }
  return image;
}

/** Local contrast ("clarity"): a wide, gentle unsharp mask on mid-tones. */
export function clarity(image, amount, scale = 1) {
  if (!amount) return image;
  const radius = Math.max(2, Math.min(image.width, image.height) * 0.02 * scale + 4 * scale);
  return unsharpMask(image, { amount: amount * 0.6, radius });
}

/** Noise reduction: edge-aware blend toward a small blur. */
export function denoise(image, strength, scale = 1) {
  if (!strength) return image;
  const blurred = gaussianBlur(copyOf(image), Math.max(0.6, 1.2 * scale * (0.5 + strength / 100)));
  const { data } = image;
  const limit = 6 + strength * 0.5;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const diff = Math.abs(data[i + c] - blurred.data[i + c]);
      const weight = diff < limit ? (strength / 100) * (1 - diff / limit) : 0;
      data[i + c] = data[i + c] + (blurred.data[i + c] - data[i + c]) * Math.min(1, weight * 1.5);
    }
  }
  return image;
}

/** Darkens (amount < 0) or lightens (amount > 0) the corners. */
export function vignette(image, amount, midpoint = 50) {
  if (!amount) return image;
  const { width: w, height: h, data } = image;
  const cx = w / 2;
  const cy = h / 2;
  const maxDistance = Math.sqrt(cx * cx + cy * cy);
  const start = 0.2 + (midpoint / 100) * 0.6;
  const strength = amount / 100;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDistance;
      if (d <= start) continue;
      const t = Math.min(1, (d - start) / (1 - start));
      const f = t * t * (3 - 2 * t);
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = data[i + c];
        data[i + c] = strength < 0 ? v * (1 + strength * f) : v + (255 - v) * strength * f;
      }
    }
  }
  return image;
}

/** Film grain with a fixed seed (the preview and the saved file look the same). */
export function grain(image, amount, seed = 1) {
  if (!amount) return image;
  let state = seed >>> 0 || 1;
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return ((state >>> 0) / 4294967296) - 0.5; };
  const { data } = image;
  const k = amount * 0.6;
  for (let i = 0; i < data.length; i += 4) {
    const n = random() * k;
    data[i] += n; data[i + 1] += n; data[i + 2] += n;
  }
  return image;
}

/** 3×3 convolution effects: emboss, edges. */
export function convolve(image, kernel, offset = 0) {
  const { width: w, height: h } = image;
  const source = new Uint8ClampedArray(image.data);
  const { data } = image;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const sx = Math.min(w - 1, Math.max(0, x + kx));
            const sy = Math.min(h - 1, Math.max(0, y + ky));
            sum += source[(sy * w + sx) * 4 + c] * kernel[(ky + 1) * 3 + kx + 1];
          }
        }
        data[(y * w + x) * 4 + c] = sum + offset;
      }
    }
  }
  return image;
}

export const EMBOSS = [-2, -1, 0, -1, 1, 1, 0, 1, 2];
export const EDGES = [-1, -1, -1, -1, 8, -1, -1, -1, -1];

/** Pixelate (mosaic) with blocks of `size` pixels. */
export function pixelate(image, size) {
  const s = Math.max(2, Math.round(size));
  const { width: w, height: h, data } = image;
  for (let by = 0; by < h; by += s) {
    for (let bx = 0; bx < w; bx += s) {
      const sums = [0, 0, 0];
      let n = 0;
      for (let y = by; y < Math.min(h, by + s); y++) for (let x = bx; x < Math.min(w, bx + s); x++) { const i = (y * w + x) * 4; sums[0] += data[i]; sums[1] += data[i + 1]; sums[2] += data[i + 2]; n++; }
      for (let y = by; y < Math.min(h, by + s); y++) for (let x = bx; x < Math.min(w, bx + s); x++) { const i = (y * w + x) * 4; data[i] = sums[0] / n; data[i + 1] = sums[1] / n; data[i + 2] = sums[2] / n; }
    }
  }
  return image;
}

// ───────────────────────── repair

/** Red-eye removal inside a circle: strongly red pixels lose their red. */
export function redEye(image, cx, cy, radius) {
  const { width: w, height: h, data } = image;
  const r2 = radius * radius;
  for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(h - 1, Math.ceil(cy + radius)); y++) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(w - 1, Math.ceil(cx + radius)); x++) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 > r2) continue;
      const i = (y * w + x) * 4;
      const red = data[i];
      const others = (data[i + 1] + data[i + 2]) / 2;
      if (red > 60 && red > others * 1.4) {
        const edge = Math.min(1, (1 - Math.sqrt(d2) / radius) * 3);
        data[i] = red + (others * 0.9 - red) * edge;
      }
    }
  }
  return image;
}

/** Mean absolute difference between the rings around two circles (to pick a heal source). */
function ringDifference(data, w, h, ax, ay, bx, by, radius) {
  let sum = 0;
  let n = 0;
  for (let k = 0; k < 24; k++) {
    const angle = (k / 24) * Math.PI * 2;
    const dx = Math.cos(angle) * radius * 1.15;
    const dy = Math.sin(angle) * radius * 1.15;
    const pa = [Math.round(ax + dx), Math.round(ay + dy)];
    const pb = [Math.round(bx + dx), Math.round(by + dy)];
    if (pa[0] < 0 || pa[1] < 0 || pa[0] >= w || pa[1] >= h || pb[0] < 0 || pb[1] < 0 || pb[0] >= w || pb[1] >= h) return Infinity;
    const ia = (pa[1] * w + pa[0]) * 4;
    const ib = (pb[1] * w + pb[0]) * 4;
    sum += Math.abs(data[ia] - data[ib]) + Math.abs(data[ia + 1] - data[ib + 1]) + Math.abs(data[ia + 2] - data[ib + 2]);
    n += 1;
  }
  return sum / n;
}

/** Best nearby source spot for healing (x, y) — the neighbour whose surroundings match best. */
export function healSource(image, x, y, radius) {
  const { width: w, height: h, data } = image;
  let best = null;
  for (const distance of [2.2, 3, 4]) {
    for (let k = 0; k < 12; k++) {
      const angle = (k / 12) * Math.PI * 2;
      const sx = x + Math.cos(angle) * radius * distance;
      const sy = y + Math.sin(angle) * radius * distance;
      if (sx - radius < 0 || sy - radius < 0 || sx + radius >= w || sy + radius >= h) continue;
      const score = ringDifference(data, w, h, x, y, sx, sy, radius);
      if (!best || score < best.score) best = { x: sx, y: sy, score };
    }
    if (best) break;
  }
  return best ?? { x: Math.min(w - 1, x + radius * 2.2), y };
}

/**
 * Heals a spot: copies the source circle over the target with a soft edge and
 * matches its average colour to the target's surroundings (like a healing brush).
 */
export function heal(image, x, y, radius, source = null) {
  const { width: w, height: h, data } = image;
  const src = source ?? healSource(image, x, y, radius);
  const before = new Uint8ClampedArray(data);
  // Colour offset: ring around target minus ring around source.
  const ringMean = (cx, cy) => {
    const sums = [0, 0, 0];
    let n = 0;
    for (let k = 0; k < 32; k++) {
      const angle = (k / 32) * Math.PI * 2;
      const px = Math.round(cx + Math.cos(angle) * radius * 1.1);
      const py = Math.round(cy + Math.sin(angle) * radius * 1.1);
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const i = (py * w + px) * 4;
      sums[0] += before[i]; sums[1] += before[i + 1]; sums[2] += before[i + 2]; n++;
    }
    return n ? sums.map((s) => s / n) : [0, 0, 0];
  };
  const target = ringMean(x, y);
  const origin = ringMean(src.x, src.y);
  const offset = target.map((t, c) => t - origin[c]);
  for (let py = Math.max(0, Math.floor(y - radius)); py <= Math.min(h - 1, Math.ceil(y + radius)); py++) {
    for (let px = Math.max(0, Math.floor(x - radius)); px <= Math.min(w - 1, Math.ceil(x + radius)); px++) {
      const d = Math.sqrt((px - x) ** 2 + (py - y) ** 2) / radius;
      if (d > 1) continue;
      const sx = Math.round(px - x + src.x);
      const sy = Math.round(py - y + src.y);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const alpha = d < 0.6 ? 1 : 1 - (d - 0.6) / 0.4;
      const i = (py * w + px) * 4;
      const j = (sy * w + sx) * 4;
      for (let c = 0; c < 3; c++) data[i + c] = before[i + c] + (before[j + c] + offset[c] - before[i + c]) * alpha;
    }
  }
  return src;
}

// ───────────────────────── analysis

/** Histograms of R, G, B and luminance (256 bins each). */
export function histogram(image, step = 1) {
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const l = new Uint32Array(256);
  const { data } = image;
  const stride = 4 * Math.max(1, step);
  for (let i = 0; i < data.length; i += stride) {
    if (data[i + 3] === 0) continue;
    r[data[i]]++;
    g[data[i + 1]]++;
    b[data[i + 2]]++;
    l[Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])]++;
  }
  return { r, g, b, l };
}

/** Levels that stretch the luminance range, clipping `clip` (fraction) at each end. */
export function autoLevels(image, clip = 0.005) {
  const { l } = histogram(image, 2);
  const total = l.reduce((sum, v) => sum + v, 0);
  if (!total) return { black: 0, white: 255, gamma: 1 };
  let black = 0;
  let acc = 0;
  while (black < 254 && acc + l[black] <= total * clip) acc += l[black++];
  let white = 255;
  acc = 0;
  while (white > black + 1 && acc + l[white] <= total * clip) acc += l[white--];
  // Mid-tone gamma that moves the mean luminance toward the middle.
  let mean = 0;
  for (let i = 0; i < 256; i++) mean += i * l[i];
  mean /= total;
  const normalized = Math.min(0.95, Math.max(0.05, (mean - black) / Math.max(1, white - black)));
  const gamma = Math.min(1.8, Math.max(0.6, Math.log(normalized) / Math.log(0.47)));
  return { black, white, gamma: Math.round(gamma * 100) / 100 };
}
