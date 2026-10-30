// Figure colours from the app theme (CSS variables), or a paper look for
// printing / export. Colours that a node lists in `auto` (still default) are
// drawn with these instead of the stored value.

const css = (name, fallback) => {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

function parseCssColor(s) {
  s = String(s).trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [0, 1, 2].map((i) => parseInt(m[1][i] + m[1][i], 16) / 255);
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) return m[1].split(/[ ,/]+/).slice(0, 3).map((x) => Number(x) / 255);
  return null;
}
const luminance = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
export const rgbCss = (c, a = 1) => {
  if (!Array.isArray(c)) return typeof c === 'string' ? c : '#000';
  const [r, g, b] = c.map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255));
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};
export const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

/** Paper look (white figure, black axes) — print, saveas, copy for documents. */
export const PAPER = {
  name: 'paper', dark: false,
  figure: [1, 1, 1], axes: [1, 1, 1], fg: [0.15, 0.15, 0.15], muted: [0.4, 0.4, 0.4],
  grid: [0.15, 0.15, 0.15], gridAlpha: 0.15, gridMajorAlpha: 0.3, accent: [0.0, 0.45, 0.85],
  ruler: [0.95, 0.95, 0.95], rulerText: [0.3, 0.3, 0.3], rulerLine: [0.75, 0.75, 0.75],
};

/** Theme colours for figures, read from the app's CSS variables. */
export function readTheme() {
  const bg = parseCssColor(css('--bg', '#12161c')) || [0.07, 0.09, 0.11];
  const panel = parseCssColor(css('--bg-panel', '#161b23')) || bg;
  const elev = parseCssColor(css('--bg-elev', '#1a2029')) || panel;
  const fg = parseCssColor(css('--fg', '#e4e9f0')) || [0.9, 0.9, 0.9];
  const muted = parseCssColor(css('--fg-muted', '#97a3b4')) || fg;
  const accent = parseCssColor(css('--accent', '#4cc9f0')) || [0.3, 0.8, 0.95];
  const border = parseCssColor(css('--border', '#2a3441')) || muted;
  const dark = luminance(bg) < 0.45;
  return {
    name: 'theme', dark,
    figure: panel, axes: bg, fg, muted, grid: fg, gridAlpha: dark ? 0.12 : 0.13, gridMajorAlpha: dark ? 0.26 : 0.3,
    accent, ruler: elev, rulerText: muted, rulerLine: border,
  };
}

/**
 * Props of a surface / patch drawn with the Edges toggle off. A mesh keeps its
 * colours in the edges (EdgeColor 'flat' / 'interp' over a solid face), so the
 * faces take that colouring instead of turning into a plain white sheet.
 */
export function faceColoured(p, edgesOn) {
  if (edgesOn !== false || !Array.isArray(p.FaceColor) || (p.EdgeColor !== 'flat' && p.EdgeColor !== 'interp')) return p;
  return { ...p, FaceColor: p.EdgeColor, EdgeColor: 'none' };
}
