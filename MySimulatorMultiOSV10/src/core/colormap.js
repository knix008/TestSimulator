// Colour maps for result fields. Each map is a list of RGB stops sampled
// evenly; `colorAt` interpolates and `lut` builds a 256-entry table for fast
// per-cell painting.

export const COLORMAPS = {
  // MATLAB's default.
  parula: [[53, 42, 135], [15, 92, 221], [18, 125, 216], [7, 156, 207], [21, 177, 180], [89, 189, 140], [165, 190, 107], [225, 185, 82], [252, 206, 46], [249, 251, 14]],
  // Google "turbo": perceptually smoother than jet, the usual thermal look.
  turbo: [[48, 18, 59], [70, 107, 227], [41, 187, 236], [49, 242, 153], [163, 253, 61], [237, 208, 58], [251, 128, 34], [208, 47, 5], [122, 4, 3]],
  inferno: [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]],
  viridis: [[68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142], [31, 158, 137], [53, 183, 121], [110, 206, 88], [181, 222, 43], [253, 231, 37]],
  coolwarm: [[59, 76, 192], [98, 130, 234], [141, 176, 254], [184, 208, 249], [221, 221, 221], [245, 196, 173], [244, 154, 123], [222, 96, 77], [180, 4, 38]],
  ironbow: [[0, 0, 0], [40, 0, 110], [120, 0, 150], [190, 30, 120], [230, 80, 40], [250, 150, 0], [255, 215, 60], [255, 255, 220]],
  grey: [[20, 20, 20], [235, 235, 235]],
};

export const COLORMAP_NAMES = { parula: 'Parula (MATLAB)', turbo: 'Turbo', inferno: 'Inferno', viridis: 'Viridis', coolwarm: 'Cool–warm', ironbow: 'Ironbow (IR)', grey: 'Grey' };

export function colorAt(name, t) {
  const stops = COLORMAPS[name] ?? COLORMAPS.turbo;
  const x = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

const cache = new Map();
/** 256 × RGB lookup table (Uint8ClampedArray, 768 entries). */
export function lut(name, steps = 0) {
  const key = `${name}:${steps}`;
  if (cache.has(key)) return cache.get(key);
  const table = new Uint8ClampedArray(256 * 3);
  for (let n = 0; n < 256; n++) {
    let t = n / 255;
    // Banded maps ("steps" colours) read like the contour fills of commercial tools.
    if (steps > 1) t = Math.min(steps - 1, Math.floor(t * steps)) / (steps - 1);
    const [r, g, b] = colorAt(name, t);
    table[n * 3] = r;
    table[n * 3 + 1] = g;
    table[n * 3 + 2] = b;
  }
  cache.set(key, table);
  return table;
}

export function cssColor(name, t) {
  const [r, g, b] = colorAt(name, t);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/** "Nice" tick values between lo and hi (about `count` of them). */
export function niceTicks(lo, hi, count = 6) {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / Math.max(1, count - 1);
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return ticks;
}

/** A compact number for labels: 3–4 significant digits, exponent for very large/small. */
export function formatValue(value, digits = 4) {
  if (!Number.isFinite(value)) return '—';
  const a = Math.abs(value);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) return value.toExponential(2);
  return Number(value.toPrecision(digits)).toString();
}
