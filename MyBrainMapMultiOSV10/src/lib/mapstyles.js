// Map styles: how a map looks — background, the central / main / sub topic
// boxes, the connecting lines, branch colours. A map names its style
// (map.style) and may override the background, the line style and branch
// colouring; a topic's own format (topic.style) wins over all of it.
//
// 'auto' follows the app theme (src/themes.js tokens), so a new map looks at
// home in every theme. The others are fixed palettes and look the same
// everywhere — also in exported pictures.

const RAINBOW = ['#e8505b', '#f5a623', '#2bb673', '#2d9cdb', '#9b51e0', '#f06292', '#00a8a8', '#8d6e63'];
const RAINBOW_DARK = ['#ff6b6b', '#ffb547', '#3ddc84', '#4cc9f0', '#b388ff', '#ff80ab', '#26d0ce', '#bcaaa4'];
const PASTEL = ['#f4a6a6', '#f7c59f', '#b5e3a1', '#a0d2eb', '#cdb4f2', '#f6b8d1', '#9ee0d8', '#e6ccb2'];

// shapes: src/lib/shapes.js (basic, flowchart and symbol shapes)
export { SHAPES, SHAPE_GROUPS, SHAPE_DEFS } from './shapes.js';
export const LINE_STYLES = ['curve', 'straight', 'elbow', 'rounded'];

const P = (o) => o;

export const MAP_STYLES = [
  P({ id: 'auto', label: ['앱 테마 따라가기', 'Follow app theme'], auto: true }),
  P({
    id: 'classic', label: ['클래식', 'Classic'], dark: false, bg: '#ffffff', grid: '#e3e8ef',
    root: { shape: 'rounded', fill: '#2c5aa0', color: '#ffffff', border: '#1d3f75', borderWidth: 2, bold: true },
    main: { shape: 'rounded', fill: '#e8f0fb', color: '#1b2a41', border: '#2c5aa0', borderWidth: 1.5 },
    sub: { shape: 'rounded', fill: '#ffffff', color: '#24303f', border: '#9fb2cc', borderWidth: 1 },
    callout: { shape: 'rounded', fill: '#fff8d6', color: '#3d3410', border: '#d9b84a', borderWidth: 1 },
    line: { style: 'curve', color: '#6f86a6', width: 2, taper: true }, branch: null, branchMode: 'border',
    rel: '#d9534f', boundary: '#2c5aa0',
  }),
  P({
    id: 'rainbow', label: ['무지개', 'Rainbow'], dark: false, bg: '#ffffff', grid: '#eceff3',
    root: { shape: 'capsule', fill: '#2f3542', color: '#ffffff', border: '#2f3542', borderWidth: 0, bold: true },
    main: { shape: 'capsule', fill: '$branch', color: '#ffffff', border: '$branch', borderWidth: 0, bold: true },
    sub: { shape: 'underline', fill: 'none', color: '#2f3542', border: '$branch', borderWidth: 2 },
    callout: { shape: 'rounded', fill: '#fffbe6', color: '#3d3410', border: '#f5a623', borderWidth: 1 },
    line: { style: 'curve', color: '#9aa5b1', width: 2.4, taper: true }, branch: RAINBOW, branchMode: 'solid',
    rel: '#e8505b', boundary: '#2d9cdb',
  }),
  P({
    id: 'pastel', label: ['파스텔', 'Pastel'], dark: false, bg: '#fbfaf7', grid: '#ece9e2',
    root: { shape: 'ellipse', fill: '#ffe7a3', color: '#4a3b16', border: '#e8c766', borderWidth: 2, bold: true },
    main: { shape: 'rounded', fill: '$branch', color: '#3b3b46', border: '$branch', borderWidth: 0 },
    sub: { shape: 'rounded', fill: '$tint', color: '#40404c', border: '$branch', borderWidth: 1 },
    callout: { shape: 'rounded', fill: '#fff6d8', color: '#4a3b16', border: '#e8c766', borderWidth: 1 },
    line: { style: 'curve', color: '#b8b4ac', width: 2.4, taper: true }, branch: PASTEL, branchMode: 'solid',
    rel: '#c97b84', boundary: '#a0b9d9',
  }),
  P({
    id: 'midnight', label: ['미드나이트', 'Midnight'], dark: true, bg: '#11151c', grid: '#1f2632',
    root: { shape: 'rounded', fill: '#4cc9f0', color: '#06202b', border: '#4cc9f0', borderWidth: 0, bold: true },
    main: { shape: 'rounded', fill: '#1b2230', color: '#e4e9f0', border: '$branch', borderWidth: 2 },
    sub: { shape: 'underline', fill: 'none', color: '#d5dce6', border: '$branch', borderWidth: 1.6 },
    callout: { shape: 'rounded', fill: '#2b2a1b', color: '#f5e7a8', border: '#c9a227', borderWidth: 1 },
    line: { style: 'curve', color: '#4d5b70', width: 2.2, taper: true }, branch: RAINBOW_DARK, branchMode: 'border',
    rel: '#ff6b6b', boundary: '#4cc9f0',
  }),
  P({
    id: 'neon', label: ['네온', 'Neon'], dark: true, bg: '#07070c', grid: '#16161f',
    root: { shape: 'capsule', fill: '#0d0d16', color: '#f8f8ff', border: '#ff2fd6', borderWidth: 2.5, bold: true },
    main: { shape: 'capsule', fill: '#0d0d16', color: '$branch', border: '$branch', borderWidth: 2 },
    sub: { shape: 'none', fill: 'none', color: '#d9d9f2', border: '$branch', borderWidth: 0 },
    callout: { shape: 'rounded', fill: '#141420', color: '#fff27a', border: '#fff27a', borderWidth: 1 },
    line: { style: 'curve', color: '#3d3d5c', width: 2, taper: false }, branch: ['#ff2fd6', '#20e3ff', '#b6ff3b', '#ffb020', '#8f6bff', '#ff4f6d', '#00ffa3', '#ffd600'], branchMode: 'line',
    rel: '#fff27a', boundary: '#20e3ff',
  }),
  P({
    id: 'blueprint', label: ['청사진', 'Blueprint'], dark: true, bg: '#123a6b', grid: '#1d4c86',
    root: { shape: 'rect', fill: '#0f3260', color: '#ffffff', border: '#e6f0ff', borderWidth: 2, bold: true },
    main: { shape: 'rect', fill: '#0f3260', color: '#ffffff', border: '#cfe1ff', borderWidth: 1.5 },
    sub: { shape: 'underline', fill: 'none', color: '#e6f0ff', border: '#9cc0f0', borderWidth: 1 },
    callout: { shape: 'rect', fill: '#174a85', color: '#fff6c4', border: '#fff6c4', borderWidth: 1 },
    line: { style: 'elbow', color: '#cfe1ff', width: 1.5, taper: false }, branch: null, branchMode: 'border',
    rel: '#ffd166', boundary: '#e6f0ff',
  }),
  P({
    id: 'paper', label: ['종이', 'Paper'], dark: false, bg: '#f6f1e6', grid: '#e7dfcc', font: "Georgia, 'Noto Serif KR', 'Batang', serif",
    root: { shape: 'ellipse', fill: '#fffaf0', color: '#3a2e1f', border: '#3a2e1f', borderWidth: 2, bold: true },
    main: { shape: 'none', fill: 'none', color: '#3a2e1f', border: '#3a2e1f', borderWidth: 0, bold: true },
    sub: { shape: 'none', fill: 'none', color: '#4a3d2c', border: '#7a6a52', borderWidth: 0 },
    callout: { shape: 'rounded', fill: '#fffaf0', color: '#3a2e1f', border: '#a08c6a', borderWidth: 1 },
    line: { style: 'curve', color: '#7a6a52', width: 1.6, taper: true }, branch: null, branchMode: 'border',
    rel: '#a33b2a', boundary: '#7a6a52',
  }),
  P({
    id: 'mono', label: ['흑백', 'Monochrome'], dark: false, bg: '#ffffff', grid: '#ededed',
    root: { shape: 'rounded', fill: '#111111', color: '#ffffff', border: '#111111', borderWidth: 0, bold: true },
    main: { shape: 'rounded', fill: '#ffffff', color: '#111111', border: '#111111', borderWidth: 1.6 },
    sub: { shape: 'underline', fill: 'none', color: '#222222', border: '#555555', borderWidth: 1 },
    callout: { shape: 'rounded', fill: '#f2f2f2', color: '#111111', border: '#888888', borderWidth: 1 },
    line: { style: 'straight', color: '#555555', width: 1.4, taper: false }, branch: null, branchMode: 'border',
    rel: '#111111', boundary: '#555555',
  }),
  P({
    id: 'forest', label: ['숲', 'Forest'], dark: false, bg: '#f3f7f0', grid: '#e1eadb',
    root: { shape: 'capsule', fill: '#2e5e3a', color: '#ffffff', border: '#1f4128', borderWidth: 0, bold: true },
    main: { shape: 'rounded', fill: '$tint', color: '#1f3324', border: '$branch', borderWidth: 1.5 },
    sub: { shape: 'underline', fill: 'none', color: '#2b3b2e', border: '$branch', borderWidth: 1.4 },
    callout: { shape: 'rounded', fill: '#fbf7e6', color: '#3a3415', border: '#a9a05a', borderWidth: 1 },
    line: { style: 'curve', color: '#7b9a80', width: 2.2, taper: true }, branch: ['#2e7d32', '#558b2f', '#00796b', '#827717', '#6d4c41', '#33691e', '#00695c', '#9e9d24'], branchMode: 'border',
    rel: '#b5542e', boundary: '#2e7d32',
  }),
  P({
    id: 'sunset', label: ['노을', 'Sunset'], dark: false, bg: '#fff7f0', grid: '#f6e4d6',
    root: { shape: 'ellipse', fill: '#e0563a', color: '#ffffff', border: '#b93a22', borderWidth: 0, bold: true },
    main: { shape: 'capsule', fill: '$branch', color: '#ffffff', border: '$branch', borderWidth: 0, bold: true },
    sub: { shape: 'rounded', fill: '$tint', color: '#4a2a1f', border: '$branch', borderWidth: 1 },
    callout: { shape: 'rounded', fill: '#fff1d6', color: '#4a2a1f', border: '#e0a33a', borderWidth: 1 },
    line: { style: 'curve', color: '#d9a58c', width: 2.4, taper: true }, branch: ['#e0563a', '#f08a24', '#d6336c', '#b85c38', '#f2a541', '#a23b72', '#e76f51', '#c44536'], branchMode: 'solid',
    rel: '#7a2e8f', boundary: '#e0563a',
  }),
  P({
    id: 'ocean', label: ['바다', 'Ocean'], dark: true, bg: '#0d2230', grid: '#163345',
    root: { shape: 'circle', fill: '#2ee6c5', color: '#03211c', border: '#14b8a6', borderWidth: 2, bold: true },
    main: { shape: 'rounded', fill: '#123447', color: '#e2f1f8', border: '$branch', borderWidth: 2 },
    sub: { shape: 'rounded', fill: '#0f2b3b', color: '#cfe6f1', border: '$branch', borderWidth: 1 },
    callout: { shape: 'rounded', fill: '#1d3a2a', color: '#d9ffe9', border: '#5ee0a0', borderWidth: 1 },
    line: { style: 'curve', color: '#33607a', width: 2.2, taper: true }, branch: ['#2ee6c5', '#5ed7ff', '#7aa2ff', '#a78bfa', '#4ade80', '#38bdf8', '#22d3ee', '#94e2d5'], branchMode: 'border',
    rel: '#ffb86c', boundary: '#5ed7ff',
  }),
  P({
    id: 'business', label: ['비즈니스', 'Business'], dark: false, bg: '#f7f8fa', grid: '#e6e9ee',
    root: { shape: 'rect', fill: '#1f3b5c', color: '#ffffff', border: '#1f3b5c', borderWidth: 0, bold: true },
    main: { shape: 'rect', fill: '#3b6ea5', color: '#ffffff', border: '#2d5a8a', borderWidth: 0, bold: true },
    sub: { shape: 'rect', fill: '#ffffff', color: '#1f2d3d', border: '#b9c6d6', borderWidth: 1 },
    callout: { shape: 'rect', fill: '#fff9e0', color: '#3d3410', border: '#d4b106', borderWidth: 1 },
    line: { style: 'elbow', color: '#7f8fa4', width: 1.6, taper: false }, branch: null, branchMode: 'border',
    rel: '#c0392b', boundary: '#3b6ea5',
  }),
  P({
    id: 'candy', label: ['캔디', 'Candy'], dark: false, bg: '#fff5fb', grid: '#f8e3f0',
    root: { shape: 'circle', fill: '#ff5fa2', color: '#ffffff', border: '#e0458a', borderWidth: 3, bold: true },
    main: { shape: 'capsule', fill: '$tint', color: '#4a2340', border: '$branch', borderWidth: 2.4, bold: true },
    sub: { shape: 'capsule', fill: '#ffffff', color: '#4a2340', border: '$branch', borderWidth: 1.4 },
    callout: { shape: 'rounded', fill: '#fffbe0', color: '#4a3b10', border: '#ffc94d', borderWidth: 1 },
    line: { style: 'curve', color: '#e9a8c9', width: 3, taper: true }, branch: ['#ff5fa2', '#7c5cff', '#22c3a6', '#ff9f43', '#4aa8ff', '#e056fd', '#2ecc71', '#ff6b6b'], branchMode: 'border',
    rel: '#7c5cff', boundary: '#ff5fa2',
  }),
  P({
    id: 'graphite', label: ['그래파이트', 'Graphite'], dark: true, bg: '#1e1e1e', grid: '#2a2a2a',
    root: { shape: 'rounded', fill: '#ffb347', color: '#1e1200', border: '#f28c28', borderWidth: 0, bold: true },
    main: { shape: 'rounded', fill: '#2b2b2b', color: '#ececec', border: '#5a5a5a', borderWidth: 1.5 },
    sub: { shape: 'underline', fill: 'none', color: '#d6d6d6', border: '#6a6a6a', borderWidth: 1 },
    callout: { shape: 'rounded', fill: '#33301f', color: '#ffe8b0', border: '#a88b3d', borderWidth: 1 },
    line: { style: 'rounded', color: '#6a6a6a', width: 1.8, taper: false }, branch: null, branchMode: 'border',
    rel: '#ffb347', boundary: '#8a8a8a',
  }),
  P({
    id: 'sketch', label: ['스케치', 'Sketch'], dark: false, bg: '#fdfdfb', grid: '#ecece6', font: "'Comic Sans MS', 'Segoe Print', 'Nanum Pen Script', cursive",
    root: { shape: 'ellipse', fill: '#fff59d', color: '#263238', border: '#263238', borderWidth: 2.2, bold: true },
    main: { shape: 'rounded', fill: '#ffffff', color: '#263238', border: '$branch', borderWidth: 2 },
    sub: { shape: 'none', fill: 'none', color: '#37474f', border: '#37474f', borderWidth: 0 },
    callout: { shape: 'rounded', fill: '#e1f5fe', color: '#263238', border: '#0288d1', borderWidth: 1.4 },
    line: { style: 'curve', color: '#455a64', width: 2, taper: false }, branch: ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00897b', '#6d4c41', '#d81b60'], branchMode: 'line',
    rel: '#e53935', boundary: '#455a64',
  }),
];

export function mapStyleById(id) { return MAP_STYLES.find((s) => s.id === id) || MAP_STYLES[0]; }

// ── colour helpers ──

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

// a blended toward b by k (0..1); non-hex colours come back unchanged.
export function mix(a, b, k) {
  const x = hexToRgb(a), y = hexToRgb(b);
  if (!x || !y) return a;
  return toHex(x.map((v, i) => v + (y[i] - v) * k));
}
export function luminance(c) {
  const rgb = hexToRgb(c);
  if (!rgb) return 0.5;
  const [r, g, b] = rgb.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// Black or white, whichever reads better on `bg`.
export function readableOn(bg, dark = '#1b1f24', light = '#ffffff') {
  return luminance(bg) > 0.42 ? dark : light;
}

// Turns any CSS colour the theme gives (hex, rgb(), color-mix()) into a hex
// the map can use; an unreadable value falls back.
function cssHex(value, fallback) {
  const s = String(value || '').trim();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(s)) return toHex(hexToRgb(s));
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(s);
  if (m) return toHex([m[1], m[2], m[3]].map(Number));
  return fallback;
}

const DEFAULT_TOKENS = { '--bg': '#12161c', '--bg-panel': '#161b23', '--bg-elev': '#1a2029', '--fg': '#e4e9f0', '--fg-muted': '#97a3b4', '--border': '#2a3441', '--border-strong': '#3b4859', '--accent': '#4cc9f0', '--accent-strong': '#4361ee', '--accent-text': '#06202b', '--danger': '#ff6b6b' };

// The app theme as a concrete map style.
function autoStyle(tokens = {}) {
  const tk = (k) => cssHex(tokens[k], DEFAULT_TOKENS[k]);
  const bg = tk('--bg');
  const dark = luminance(bg) < 0.4;
  const fg = tk('--fg');
  const accent = tk('--accent');
  return {
    id: 'auto', label: MAP_STYLES[0].label, auto: true, dark, bg, grid: mix(bg, fg, dark ? 0.08 : 0.1),
    root: { shape: 'rounded', fill: accent, color: readableOn(accent, '#0b1220', '#ffffff'), border: tk('--accent-strong'), borderWidth: 0, bold: true },
    main: { shape: 'rounded', fill: tk('--bg-elev'), color: fg, border: '$branch', borderWidth: 2 },
    sub: { shape: 'underline', fill: 'none', color: fg, border: '$branch', borderWidth: 1.6 },
    callout: { shape: 'rounded', fill: mix(bg, '#f5c451', dark ? 0.18 : 0.22), color: fg, border: '#d9a521', borderWidth: 1 },
    line: { style: 'curve', color: tk('--border-strong'), width: 2.2, taper: true },
    branch: dark ? RAINBOW_DARK : RAINBOW, branchMode: 'border',
    rel: tk('--danger'), boundary: accent,
  };
}

// The style a map is drawn with: its preset (or the app theme) plus the map's own overrides.
export function resolveMapStyle(map, tokens) {
  const base = map && map.style && map.style !== 'auto' ? mapStyleById(map.style) : autoStyle(tokens);
  const s = base.auto ? base : { ...base };
  const out = { ...s, line: { ...s.line } };
  if (map && map.background) { out.bg = map.background; out.dark = luminance(map.background) < 0.4; out.grid = mix(map.background, out.dark ? '#ffffff' : '#000000', 0.08); }
  if (map && map.lineStyle) out.line.style = map.lineStyle;
  if (map && map.branchColors === false) out.branch = null;
  if (map && map.branchColors === true && !out.branch) out.branch = out.dark ? RAINBOW_DARK : RAINBOW;
  return out;
}

// level: 0 root, 1 main, 2+ sub. kind: root | child | callout | floating.
// branch: the branch colour of the topic (main topic's palette colour) or null.
export function topicStyle(ms, topic, { level, kind, branch, baseSize = 14, mapFont = '' }) {
  const role = kind === 'root' ? 'root' : kind === 'callout' ? 'callout' : kind === 'floating' ? 'main' : level === 1 ? 'main' : 'sub';
  const preset = ms[role] || ms.sub;
  const own = topic.style || {};
  const branchColor = own.line || branch || ms.line.color;
  const sub = (v) => {
    if (v === '$branch') return branch || (role === 'sub' ? ms.line.color : ms.line.color);
    if (v === '$tint') return branch ? mix(branch, ms.bg, ms.dark ? 0.72 : 0.82) : (ms.dark ? mix(ms.bg, '#ffffff', 0.06) : '#ffffff');
    return v;
  };
  const fill = own.fill || sub(preset.fill) || 'none';
  let color = own.color || sub(preset.color);
  if (!own.color) {
    // A branch-coloured or user-chosen fill keeps its text readable whatever the colour.
    if (fill !== 'none' && (preset.fill === '$branch' || own.fill)) color = readableOn(fill);
    else if (fill === 'none' && color === '#ffffff' && !ms.dark) color = '#1b1f24';
  }
  const scale = role === 'root' ? 1.6 : role === 'main' ? 1.2 : role === 'callout' ? 0.95 : 1;
  const fontSize = Number(own.fontSize) || Math.round(baseSize * scale * 10) / 10;
  const shape = own.shape || preset.shape || 'rounded';
  const bw = own.borderWidth != null ? Number(own.borderWidth) : preset.borderWidth != null ? preset.borderWidth : 1;
  return {
    role,
    shape,
    fill,
    color,
    border: own.border || sub(preset.border) || ms.line.color,
    borderWidth: bw,
    fontSize,
    bold: own.bold != null ? !!own.bold : !!preset.bold,
    italic: !!own.italic,
    underline: !!own.underline,
    strike: !!own.strike,
    font: own.font || mapFont || ms.font || '',
    align: own.align || (shape === 'underline' || shape === 'none' ? 'left' : 'center'),
    width: Number(own.width) || 0,
    branch: branchColor,
    lineWidth: Number(own.lineWidth) || 0,
  };
}
