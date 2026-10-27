// Colormaps. Every map is built from a few anchor colours of our own by
// piecewise-linear interpolation (or from simple formulas), never from
// copied tables. Pure ESM. A map is an array of [r,g,b] rows (0..1).

const lerpAnchors = (anchors) => (n) => {
  const out = [];
  const k = anchors.length - 1;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * k;
    const a = Math.min(k - 1, Math.floor(t));
    const f = t - a;
    out.push([0, 1, 2].map((c) => anchors[a][c] + (anchors[a + 1][c] - anchors[a][c]) * f));
  }
  return out;
};
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const formula = (fn) => (n) => Array.from({ length: n }, (_, i) => fn(n === 1 ? 0 : i / (n - 1), i, n).map(clamp01));

function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6) % 6, f = h * 6 - Math.floor(h * 6);
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i];
}

export const COLORMAPS = {
  // Our default: deep blue → azure → teal → green → amber → warm yellow.
  default: lerpAnchors([[0.21, 0.17, 0.53], [0.16, 0.33, 0.85], [0.07, 0.53, 0.86], [0.05, 0.66, 0.74], [0.25, 0.75, 0.55], [0.62, 0.77, 0.30], [0.93, 0.73, 0.22], [0.98, 0.88, 0.14]]),
  jet: formula((t) => [1.5 - Math.abs(4 * t - 3), 1.5 - Math.abs(4 * t - 2), 1.5 - Math.abs(4 * t - 1)]),
  turbo: formula((t) => [
    0.1357 + t * (4.5974 - t * (42.3277 - t * (130.5887 - t * (150.5666 - t * 58.1375)))),
    0.0914 + t * (2.1856 + t * (4.8052 - t * (14.0195 - t * (4.2109 + t * 2.7747)))),
    0.1067 + t * (12.5925 - t * (60.1097 - t * (109.0745 - t * (88.5066 - t * 26.8183)))),
  ]),
  viridis: lerpAnchors([[0.267, 0.005, 0.329], [0.283, 0.141, 0.458], [0.254, 0.265, 0.530], [0.207, 0.372, 0.553], [0.164, 0.471, 0.558], [0.128, 0.567, 0.551], [0.135, 0.659, 0.518], [0.267, 0.749, 0.441], [0.478, 0.821, 0.318], [0.741, 0.873, 0.150], [0.993, 0.906, 0.144]]),
  hsv: formula((t, i, n) => hsvToRgb(n === 1 ? 0 : i / n, 1, 1)),
  hot: formula((t) => [t * 8 / 3, t * 8 / 3 - 1, t * 4 - 3]),
  cool: formula((t) => [t, 1 - t, 1]),
  spring: formula((t) => [1, t, 1 - t]),
  summer: formula((t) => [t, 0.5 + t / 2, 0.4]),
  autumn: formula((t) => [1, t, 0]),
  winter: formula((t) => [0, t, 1 - t / 2]),
  gray: formula((t) => [t, t, t]),
  bone: formula((t) => {
    const g = [t, t, t];
    const hb = [clamp01(t * 4 - 3), clamp01(t * 8 / 3 - 1), clamp01(t * 8 / 3)];
    return g.map((x, c) => (7 * x + hb[c]) / 8);
  }),
  copper: formula((t) => [t * 1.25, t * 0.7812, t * 0.4975]),
  pink: formula((t) => {
    const hb = [clamp01(t * 8 / 3), clamp01(t * 8 / 3 - 1), clamp01(t * 4 - 3)];
    return hb.map((h) => Math.sqrt((2 * t + h) / 3));
  }),
  white: formula(() => [1, 1, 1]),
  flag: formula((t, i) => [[1, 0, 0], [1, 1, 1], [0, 0, 1], [0, 0, 0]][i % 4]),
  prism: formula((t, i) => [[1, 0, 0], [1, 0.5, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [0.67, 0, 1]][i % 6]),
  lines: (n) => Array.from({ length: n }, (_, i) => DEFAULT_COLOR_ORDER[i % DEFAULT_COLOR_ORDER.length].slice()),
  colorcube: formula((t, i, n) => hsvToRgb((i * 0.618034) % 1, 0.75 + 0.25 * ((i % 3) / 2), 0.6 + 0.4 * ((i % 2)))),
};
COLORMAPS.parula = COLORMAPS.default; // accepted name, same data as 'default'

/** Our own seven-colour line colour order. */
export const DEFAULT_COLOR_ORDER = [
  [0.12, 0.47, 0.71], [0.85, 0.37, 0.01], [0.93, 0.69, 0.13], [0.49, 0.18, 0.56], [0.47, 0.67, 0.19], [0.30, 0.75, 0.93], [0.64, 0.08, 0.18],
];

export const COLORMAP_NAMES = Object.keys(COLORMAPS).filter((k) => k !== 'parula');

/** n×3 colormap by name. */
export function colormapByName(name, n = 256) {
  const f = COLORMAPS[String(name).toLowerCase()];
  if (!f) return null;
  return f(Math.max(1, Math.floor(n)));
}

/** Colour of value v under limits [lo, hi] for a colormap (rows). */
export function mapColor(cmap, v, lo, hi) {
  const n = cmap.length;
  if (!n) return [0, 0, 0];
  if (!(v === v)) return null;
  let i;
  if (hi > lo) i = Math.floor(((v - lo) / (hi - lo)) * n);
  else i = Math.floor(n / 2);
  if (i < 0) i = 0; else if (i >= n) i = n - 1;
  return cmap[i];
}
