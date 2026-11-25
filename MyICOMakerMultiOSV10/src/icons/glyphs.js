// Colour icons (24 × 24). Every button, menu item, tool and card title uses one of these.
// Parts in `currentColor` follow the theme's text colour; everything else is coloured.
import { EMOJI_ART } from '../lib/emoji.js';
import { SHAPE_BY_ID, scalePath } from '../lib/shapes.js';

const B = '#3b82f6'; const BD = '#1d4ed8'; const BL = '#93c5fd';
const G = '#22c55e'; const GD = '#15803d';
const R = '#ef4444'; const RD = '#b91c1c';
const Y = '#facc15'; const YD = '#ca8a04';
const O = '#f97316'; const OD = '#c2410c';
const P = '#a855f7'; const PD = '#7e22ce';
const C = '#06b6d4'; const CD = '#0e7490';
const PK = '#ec4899';
const S = '#94a3b8'; const SD = '#475569';
const W = '#ffffff';
const INK = 'currentColor';

const line = (d, color = INK, width = 2) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const fill = (d, color, stroke = '', width = 1.2) => `<path d="${d}" fill="${color}"${stroke ? ` stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"` : ''}/>`;
const dot = (cx, cy, r, color, stroke = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"${stroke ? ` stroke="${stroke}" stroke-width="1.2"` : ''}/>`;
const rect = (x, y, w, h, rx, color, stroke = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${color}"${stroke ? ` stroke="${stroke}" stroke-width="1.2"` : ''}/>`;

const PAGE = fill('M5 2h9l5 5v15H5z', '#f8fafc', SD) + fill('M14 2v5h5z', '#cbd5e1', SD);
const FOLDER = fill('M2 6h7l2 2h11v12H2z', Y, YD) + fill('M2 10h20v10H2z', '#fde68a', YD);
const DISK = rect(3, 3, 18, 18, 2.5, B, BD) + rect(7, 3, 9, 6, 1, W) + rect(6, 13, 12, 8, 1, BL);
const MAGNIFIER = dot(10, 10, 6.5, '#bae6fd', CD) + line('M15 15l6 6', SD, 3);
const PICTURE = rect(2, 4, 20, 16, 2, '#e0f2fe', CD) + fill('M4 18l5-6 4 4 3-3 4 5z', G) + dot(16, 9, 2, Y);

export const GLYPHS = {
  // ── App and files
  home: fill('M12 3l9 8h-3v10h-5v-6h-2v6H6V11H3z', O, OD),
  newFile: PAGE + dot(17, 17, 5, G, GD) + line('M17 14.5v5M14.5 17h5', W, 1.8),
  open: FOLDER,
  folder: FOLDER,
  save: DISK,
  saveAs: DISK + dot(18, 18, 4.5, Y, YD) + line('M16.5 18h3M18 16.5v3', SD, 1.4),
  design: rect(3, 3, 18, 18, 5, B, BD) + fill('M12 6l1.8 3.8 4.2.5-3.1 2.9.8 4.1L12 15.3 8.3 17.3l.8-4.1L6 10.3l4.2-.5z', Y, YD),
  importImage: PICTURE + dot(19, 5, 4, G, GD) + line('M19 3v4M17 5h4', W, 1.5),
  image: PICTURE,
  recent: dot(12, 12, 9, '#e0e7ff', P) + line('M12 7v5l3 2', PD, 2),
  template: rect(3, 3, 8, 8, 2, B) + rect(13, 3, 8, 8, 2, G) + rect(3, 13, 8, 8, 2, O) + rect(13, 13, 8, 8, 2, P),
  continue: dot(12, 12, 9, G, GD) + fill('M10 8l6 4-6 4z', W),
  exit: fill('M4 3h10v18H4z', '#fecaca', RD) + dot(11, 12, 1.2, RD) + line('M15 12h6M18 9l3 3-3 3', R, 2),
  close: line('M6 6l12 12M18 6L6 18', R, 2.4),
  minimize: line('M5 13h14', YD, 2.4),
  maximize: rect(5, 5, 14, 14, 2, 'none', G) + line('M5 9h14', G, 2),
  restore: rect(4, 8, 12, 12, 2, 'none', G) + line('M8 8V4h12v12h-4', GD, 1.8),
  // ── Edit
  undo: fill('M9 5L3 10l6 5v-3h6a4 4 0 0 1 0 8h-3v3h3a7 7 0 0 0 0-14H9z', B, BD),
  redo: fill('M15 5l6 5-6 5v-3H9a4 4 0 0 0 0 8h3v3H9a7 7 0 0 1 0-14h6z', G, GD),
  copy: rect(8, 8, 13, 13, 2, BL, BD) + rect(3, 3, 13, 13, 2, B, BD),
  paste: rect(4, 4, 16, 18, 2, '#fcd34d', YD) + rect(8, 2, 8, 4, 1.5, SD) + rect(7, 9, 10, 10, 1, W),
  duplicate: rect(8, 8, 13, 13, 2, '#bbf7d0', GD) + rect(3, 3, 13, 13, 2, G, GD) + line('M9.5 7v5M7 9.5h5', W, 1.8),
  trash: fill('M5 7h14l-1.5 14h-11z', R, RD) + rect(3, 4, 18, 3, 1, RD) + rect(9, 2, 6, 2.5, 1, RD) + line('M10 10v8M14 10v8', W, 1.4),
  selectAll: `<rect x="3" y="3" width="18" height="18" rx="2" fill="${BL}" stroke="${BD}" stroke-width="1.6" stroke-dasharray="3 2"/>` + rect(8, 8, 8, 8, 1.5, B),
  deselect: `<rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="${S}" stroke-width="1.6" stroke-dasharray="3 2"/>` + line('M8 8l8 8M16 8l-8 8', R, 2),
  // ── View
  zoomIn: MAGNIFIER + line('M7.5 10h5M10 7.5v5', CD, 1.8),
  zoomOut: MAGNIFIER + line('M7.5 10h5', CD, 1.8),
  fit: rect(3, 3, 18, 18, 3, '#ccfbf1', CD) + line('M7 10V7h3M14 7h3v3M17 14v3h-3M10 17H7v-3', C, 2),
  actual: rect(2, 5, 20, 14, 3, '#ede9fe', PD) + `<text x="12" y="15.5" font-size="8" font-weight="800" text-anchor="middle" fill="${PD}" font-family="Segoe UI, sans-serif">1:1</text>`,
  ruler: rect(2, 7, 20, 10, 1.5, Y, YD) + line('M5 7v4M8 7v2.5M11 7v4M14 7v2.5M17 7v4M20 7v2.5', SD, 1.2) + line('M12 2v20', R, 1.6),
  settings: fill(scalePath(SHAPE_BY_ID.gear.d, 2, 2, 20, 20), B, BD) + dot(12, 12, 3, W),
  grid: rect(3, 3, 18, 18, 2, '#dbeafe', BD) + line('M9 3v18M15 3v18M3 9h18M3 15h18', B, 1.2),
  snap: fill('M5 3h4v9a3 3 0 0 0 6 0V3h4v9a7 7 0 0 1-14 0z', R, RD) + rect(5, 3, 4, 4, 0.5, S) + rect(15, 3, 4, 4, 0.5, S),
  guides: dot(12, 12, 9, 'none', P) + `<rect x="5" y="5" width="14" height="14" rx="3" fill="none" stroke="${PK}" stroke-width="1.6" stroke-dasharray="2.5 2"/>` + line('M12 2v20M2 12h20', S, 0.9),
  preview: rect(2, 13, 6, 6, 1, B) + rect(9, 10, 9, 9, 1.5, G) + rect(18, 7, 4, 12, 1, O) + line('M2 21h20', SD, 1.5),
  eye: fill('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', '#e0f2fe', CD) + dot(12, 12, 3.6, C, CD),
  eyeOff: fill('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', '#f1f5f9', S) + line('M4 4l16 16', R, 2.2),
  lock: rect(5, 10, 14, 11, 2, Y, YD) + line('M8 10V7a4 4 0 0 1 8 0v3', SD, 2) + dot(12, 15.5, 1.6, YD),
  unlock: rect(5, 10, 14, 11, 2, '#fef9c3', YD) + line('M8 10V7a4 4 0 0 1 7.5-2', S, 2) + dot(12, 15.5, 1.6, YD),
  // ── Arrange
  layers: fill('M12 3l9 5-9 5-9-5z', B, BD) + fill('M3 12l9 5 9-5', 'none', G) + line('M3 12l9 5 9-5', G, 1.8) + line('M3 16l9 5 9-5', O, 1.8),
  forward: rect(3, 9, 12, 12, 2, S) + rect(9, 3, 12, 12, 2, B, BD) + line('M15 13V7M12.5 9.5L15 7l2.5 2.5', W, 1.6),
  backward: rect(9, 3, 12, 12, 2, B, BD) + rect(3, 9, 12, 12, 2, S, SD) + line('M9 11v6M6.5 14.5L9 17l2.5-2.5', W, 1.6),
  bringFront: rect(2, 2, 10, 10, 2, S) + rect(12, 12, 10, 10, 2, S) + rect(6, 6, 12, 12, 2, G, GD),
  sendBack: rect(6, 6, 12, 12, 2, S, SD) + rect(2, 2, 10, 10, 2, O, OD) + rect(12, 12, 10, 10, 2, O, OD),
  alignLeft: line('M3 2v20', R, 2) + rect(5, 5, 14, 5, 1.5, B) + rect(5, 14, 9, 5, 1.5, G),
  alignHCenter: line('M12 2v20', R, 2) + rect(4, 5, 16, 5, 1.5, B) + rect(7, 14, 10, 5, 1.5, G),
  alignRight: line('M21 2v20', R, 2) + rect(5, 5, 14, 5, 1.5, B) + rect(10, 14, 9, 5, 1.5, G),
  alignTop: line('M2 3h20', R, 2) + rect(5, 5, 5, 14, 1.5, B) + rect(14, 5, 5, 9, 1.5, G),
  alignVCenter: line('M2 12h20', R, 2) + rect(5, 4, 5, 16, 1.5, B) + rect(14, 7, 5, 10, 1.5, G),
  alignBottom: line('M2 21h20', R, 2) + rect(5, 5, 5, 14, 1.5, B) + rect(14, 10, 5, 9, 1.5, G),
  center: rect(3, 3, 18, 18, 2, '#fef3c7', YD) + dot(12, 12, 4, O, OD) + line('M12 2v4M12 18v4M2 12h4M18 12h4', SD, 1.5),
  flipH: fill('M11 4L3 19h8z', B, BD) + `<path d="M13 4l8 15h-8z" fill="${BL}" stroke="${BD}" stroke-width="1.2" stroke-dasharray="2 1.5"/>`,
  flipV: fill('M4 11L19 3v8z', G, GD) + `<path d="M4 13l15 8v-8z" fill="#bbf7d0" stroke="${GD}" stroke-width="1.2" stroke-dasharray="2 1.5"/>`,
  rotateLeft: line('M4 12a8 8 0 1 0 2.5-5.8', P, 2.4) + fill('M3 3v6h6z', PD),
  rotateRight: line('M20 12a8 8 0 1 1-2.5-5.8', O, 2.4) + fill('M21 3v6h-6z', OD),
  // ── Style and effects
  fx: fill('M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z', P, PD) + dot(19, 4, 2, Y) + dot(5, 19, 1.6, C),
  cube: fill('M12 2l9 5-9 5-9-5z', BL, BD) + fill('M3 7l9 5v10l-9-5z', B, BD) + fill('M21 7l-9 5v10l9-5z', BD, BD),
  shadow: `<rect x="7" y="7" width="14" height="14" rx="3" fill="${SD}" opacity="0.55"/>` + rect(3, 3, 14, 14, 3, O, OD),
  gloss: dot(12, 12, 9.5, B, BD) + fill('M5 10a7 6 0 0 1 14 0c-3-1.5-11-1.5-14 0z', W) + dot(8, 7.5, 1.2, W),
  glow: `<circle cx="12" cy="12" r="10" fill="${Y}" opacity="0.35"/>` + dot(12, 12, 6.5, Y, YD),
  blur: `<circle cx="12" cy="12" r="9.5" fill="${C}" opacity="0.25"/><circle cx="12" cy="12" r="7" fill="${C}" opacity="0.45"/>` + dot(12, 12, 4.5, C),
  fill: fill('M5 11l7-7 7 7-7 7z', B, BD) + fill('M19 15s2.5 3 2.5 4.5a2.5 2.5 0 0 1-5 0C16.5 18 19 15 19 15z', C, CD),
  stroke: rect(4, 4, 16, 16, 3, 'none', O) + `<rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="${O}" stroke-width="3"/>`,
  gradient: `<defs><linearGradient id="gi-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${PK}"/><stop offset="1" stop-color="${B}"/></linearGradient></defs><rect x="3" y="3" width="18" height="18" rx="3" fill="url(#gi-grad)"/>`,
  palette: fill('M12 2a10 10 0 0 0 0 20c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a5 5 0 0 0 5-5c0-5-4.5-9-10-9z', '#fde68a', YD) + dot(7, 11, 1.8, R) + dot(9, 6.5, 1.8, B) + dot(14.5, 6, 1.8, G) + dot(18, 10, 1.8, P),
  font: `<text x="12" y="18" font-size="17" font-weight="800" text-anchor="middle" fill="${B}" font-family="Georgia, serif">A</text>` + line('M4 21h16', O, 2),
  position: line('M12 2v20M2 12h20', S, 1.2) + dot(12, 12, 4, R, RD) + line('M12 2l-2 3h4zM22 12l-3-2v4z', SD, 1),
  size: rect(3, 3, 18, 18, 2, '#dcfce7', GD) + line('M7 17L17 7M12 7h5v5M7 12v5h5', G, 2),
  opacity: `<rect x="3" y="3" width="18" height="18" rx="3" fill="${W}" stroke="${S}"/><path d="M3 21L21 3v15a3 3 0 0 1-3 3z" fill="${SD}"/>`,
  rotate: dot(12, 12, 9, '#fae8ff', P) + line('M12 12l5-5', PD, 2) + line('M12 12h6', S, 1.4),
  corner: line('M4 20V12a8 8 0 0 1 8-8h8', O, 2.6) + dot(7, 7, 1.6, OD),
  dash: line('M3 12h4M10 12h4M17 12h4', B, 2.6),
  // ── Export and print
  export: line('M4 14v6h16v-6', SD, 2) + fill('M12 2l6 6h-4v7h-4V8H6z', G, GD),
  exportIco: rect(2, 2, 20, 20, 4, B, BD) + `<text x="12" y="15.5" font-size="8" font-weight="800" text-anchor="middle" fill="${W}" font-family="Segoe UI, sans-serif">ICO</text>`,
  exportPng: rect(2, 2, 20, 20, 4, G, GD) + `<text x="12" y="15.5" font-size="8" font-weight="800" text-anchor="middle" fill="${W}" font-family="Segoe UI, sans-serif">PNG</text>`,
  exportIcns: rect(2, 2, 20, 20, 4, SD, '#1e293b') + `<text x="12" y="15.2" font-size="6.6" font-weight="800" text-anchor="middle" fill="${W}" font-family="Segoe UI, sans-serif">ICNS</text>`,
  exportSvg: rect(2, 2, 20, 20, 4, O, OD) + `<text x="12" y="15.5" font-size="8" font-weight="800" text-anchor="middle" fill="${W}" font-family="Segoe UI, sans-serif">SVG</text>`,
  exportEach: rect(2, 2, 9, 9, 2, B) + rect(13, 2, 9, 9, 2, B) + rect(2, 13, 9, 9, 2, B) + rect(13, 13, 9, 9, 2, G, GD),
  print: rect(6, 2, 12, 7, 1, W, SD) + rect(2, 8, 20, 10, 2.5, S, SD) + rect(6, 14, 12, 8, 1, W, SD) + dot(18, 11.5, 1.2, G),
  page: PAGE,
  portrait: rect(6, 2, 12, 20, 2, W, B) + line('M9 7h6M9 11h6M9 15h4', BL, 1.6),
  landscape: rect(2, 6, 20, 12, 2, W, G) + line('M5 10h9M5 14h6', '#86efac', 1.6),
  label: fill('M3 6h11l7 6-7 6H3z', O, OD) + dot(7, 12, 1.6, W),
  checker: rect(3, 3, 9, 9, 0, S) + rect(12, 12, 9, 9, 0, S) + rect(12, 3, 9, 9, 0, '#e2e8f0') + rect(3, 12, 9, 9, 0, '#e2e8f0'),
  sizes: rect(2, 14, 6, 6, 1, B) + rect(10, 10, 10, 10, 1.5, G) + line('M3 4h18', O, 2),
  title: `<text x="12" y="13" font-size="11" font-weight="800" text-anchor="middle" fill="${P}" font-family="Segoe UI, sans-serif">T</text>` + line('M4 18h16M7 21h10', S, 1.6),
  calendar: rect(3, 5, 18, 16, 2, W, R) + rect(3, 5, 18, 5, 2, R) + line('M8 3v4M16 3v4', SD, 2) + dot(8, 14, 1.4, R) + dot(12, 14, 1.4, R) + dot(16, 14, 1.4, R),
  // ── Help and settings
  guide: fill('M3 4h7a3 3 0 0 1 2 1 3 3 0 0 1 2-1h7v15h-7a2 2 0 0 0-2 1 2 2 0 0 0-2-1H3z', '#dbeafe', BD) + line('M12 5v15', BD, 1.4) + line('M6 9h3M6 12h3M15 9h3M15 12h3', B, 1.4),
  about: dot(12, 12, 10, B, BD) + dot(12, 7.5, 1.5, W) + line('M12 11v6', W, 2.4),
  question: dot(12, 12, 10, P, PD) + line('M9.3 9a2.8 2.8 0 1 1 3.8 2.6c-.8.4-1.1.9-1.1 1.9', W, 2) + dot(12, 17, 1.3, W),
  globe: dot(12, 12, 10, '#bae6fd', CD) + line('M6.5 5.5c2.5.5 3 2.5 1.8 4.2-1 1.3-3.4 1-3.4 3.2 0 2 2.5 2 2.1 4.6M15 3.5c-.5 2 .8 3.2 2.5 3.3 1.8 0 2.6 1.4 2 3.1-.6 1.6.6 3 1.8 3.2', G, 1.8),
  langKo: rect(1, 3, 22, 18, 4, '#fee2e2', R) + `<text x="12" y="16.5" font-size="11" font-weight="800" text-anchor="middle" fill="${RD}" font-family="Malgun Gothic, sans-serif">가</text>`,
  langEn: rect(1, 3, 22, 18, 4, '#dbeafe', B) + `<text x="12" y="16.5" font-size="11" font-weight="800" text-anchor="middle" fill="${BD}" font-family="Segoe UI, sans-serif">Aa</text>`,
  sun: dot(12, 12, 5, Y, YD) + line('M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1', O, 2),
  moon: fill('M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11z', P, PD) + dot(17, 5, 1.2, Y) + dot(20, 9, 0.9, Y),
  gear: fill(scalePath(SHAPE_BY_ID.gear.d, 2, 2, 20, 20), S, SD) + dot(12, 12, 2.5, W),
  check: dot(12, 12, 10, G, GD) + line('M7 12.5l3.2 3.2L17 9', W, 2.4),
  warning: fill('M12 2l10.5 19h-21z', Y, YD) + line('M12 9v5', SD, 2.4) + dot(12, 17.5, 1.3, SD),
  error: dot(12, 12, 10, R, RD) + line('M8 8l8 8M16 8l-8 8', W, 2.4),
  info: dot(12, 12, 10, C, CD) + dot(12, 7.5, 1.4, W) + line('M12 11v6', W, 2.2),
  external: rect(3, 7, 14, 14, 2, '#e0f2fe', CD) + line('M13 3h8v8M21 3l-9 9', B, 2),
  refresh: line('M20 12a8 8 0 1 1-2.3-5.6', G, 2.4) + fill('M21 3v6h-6z', GD),
  plus: dot(12, 12, 10, G, GD) + line('M12 7v10M7 12h10', W, 2.4),
  minus: dot(12, 12, 10, R, RD) + line('M7 12h10', W, 2.4),
  chevronDown: line('M6 9l6 6 6-6', B, 2.4),
  chevronRight: line('M9 6l6 6-6 6', B, 2.4),
  // ── Start screen
  launcher: rect(3, 3, 7, 7, 2, R) + rect(14, 3, 7, 7, 2, Y) + rect(3, 14, 7, 7, 2, G) + rect(14, 14, 7, 7, 2, B),
  sparkles: fill('M10 3l1.8 5.2L17 10l-5.2 1.8L10 17l-1.8-5.2L3 10l5.2-1.8z', Y, YD) + fill('M18 13l.9 2.1L21 16l-2.1.9L18 19l-.9-2.1L15 16l2.1-.9z', PK) + dot(18, 5, 1.5, C),
  dice: rect(3, 3, 18, 18, 4, W, R) + dot(8, 8, 1.6, R) + dot(16, 8, 1.6, R) + dot(12, 12, 1.6, R) + dot(8, 16, 1.6, R) + dot(16, 16, 1.6, R),
  speed: fill('M2 17a10 10 0 0 1 20 0z', '#dcfce7', GD) + line('M12 17l5-6', R, 2.4) + dot(12, 17, 2, SD),
  arrange: rect(3, 3, 11, 7, 2, B) + rect(16, 3, 5, 7, 2, G) + rect(3, 12, 5, 9, 2, O) + rect(10, 12, 11, 9, 2, P),
  moveHandle: dot(9, 6, 1.6, S) + dot(15, 6, 1.6, S) + dot(9, 12, 1.6, S) + dot(15, 12, 1.6, S) + dot(9, 18, 1.6, S) + dot(15, 18, 1.6, S),
  startup: rect(3, 4, 18, 14, 2, '#e0e7ff', P) + fill('M10 8l5 3-5 3z', P) + line('M8 21h8', SD, 2),
  // ── Tools
  select: fill('M5 3l13 8-6 1.5L9 19z', W, SD) + fill('M12 12.5l4 6-2 1.3-4-6', B, BD),
  hand: fill('M8 11V5a1.5 1.5 0 0 1 3 0v5V4a1.5 1.5 0 0 1 3 0v6V5.5a1.5 1.5 0 0 1 3 0V13l1-2a1.5 1.5 0 0 1 2.6 1.4L17 19a5 5 0 0 1-4.5 3H11a5 5 0 0 1-5-5v-4a1.5 1.5 0 0 1 2-1.4z', '#fed7aa', OD),
  rect: rect(3, 5, 18, 14, 1, B, BD),
  roundRect: rect(3, 4, 18, 16, 5, C, CD),
  ellipse: `<ellipse cx="12" cy="12" rx="9.5" ry="7.5" fill="${G}" stroke="${GD}" stroke-width="1.2"/>`,
  line: line('M4 20L20 4', SD, 2.4) + dot(4, 20, 2, B) + dot(20, 4, 2, B),
  arrowLine: line('M4 20L18 6', O, 2.4) + fill('M21 3l-2 8-6-6z', O, OD),
  poly: fill('M4 18l3-12 9-2 5 9-7 8z', P, PD) + dot(4, 18, 1.6, W, PD) + dot(7, 6, 1.6, W, PD) + dot(16, 4, 1.6, W, PD) + dot(21, 13, 1.6, W, PD) + dot(14, 21, 1.6, W, PD),
  pen: fill('M15 3l6 6-11 11H4v-6z', Y, YD) + fill('M4 14l6 6H4z', '#fde68a', YD) + fill('M15 3l6 6-2 2-6-6z', PK),
  brush: fill('M20 3l1 1-8 9-2-2z', '#a16207') + fill('M11 11l2 2c0 4-4 7-9 7 2-2 1-5 3-7 1-1.5 3-2 4-2z', PK, '#be185d'),
  text: rect(3, 3, 18, 18, 3, '#ede9fe', PD) + `<text x="12" y="17" font-size="14" font-weight="800" text-anchor="middle" fill="${P}" font-family="Georgia, serif">T</text>`,
  eyedropper: fill('M17 3a2.8 2.8 0 0 1 4 4l-3 3-4-4z', SD) + fill('M14 6l4 4-9 9H5v-4z', '#bae6fd', CD) + dot(5, 19, 2, B),
  bucket: fill('M4 10l7-7 8 8-7 7z', S, SD) + fill('M4 10h15l-7 7z', B) + fill('M20 14s2 2.5 2 4a2 2 0 0 1-4 0c0-1.5 2-4 2-4z', B, BD),
  eraser: fill('M14 3l7 7-9 9H7l-4-4z', PK, '#be185d') + fill('M3 15l6-6 7 7-3 3H7z', '#fbcfe8', '#be185d') + line('M12 21h9', SD, 1.6),
  // ── Shape categories
  catBasic: rect(2, 10, 10, 10, 1.5, B) + dot(16, 8, 6, G) + fill('M12 22l5-8 5 8z', O),
  catStars: fill(scalePath(SHAPE_BY_ID.star.d, 2, 2, 20, 20), Y, YD),
  catArrows: fill(scalePath(SHAPE_BY_ID.arrow.d, 2, 4, 20, 16), G, GD),
  catSymbols: fill(scalePath(SHAPE_BY_ID.heart.d, 2, 3, 20, 18), R, RD),
  catCallouts: fill(scalePath(SHAPE_BY_ID.speech.d, 2, 2, 20, 20), C, CD),
  catSolids: fill('M12 2l9 5-9 5-9-5z', '#fdba74', OD) + fill('M3 7l9 5v10l-9-5z', O, OD) + fill('M21 7l-9 5v10l9-5z', OD, OD),
  catTools: fill('M14 3l7 7-3 3-7-7z', S, SD) + fill('M11 6l7 7-9 9-7-7z', O, OD),
  // ── Templates
  tplBlank: PAGE,
  tplApp: rect(2, 2, 20, 20, 5, B, BD) + fill(scalePath(SHAPE_BY_ID.star.d, 6, 6, 12, 12), Y),
  tplBadge: dot(12, 12, 10, G, GD) + line('M7 12.5l3.2 3.2L17 9', W, 2.4),
  tplFolder: FOLDER + fill(scalePath(SHAPE_BY_ID.heart.d, 9, 12, 6, 5.5), R),
  tplDocument: PAGE + rect(10, 14, 10, 6, 1.5, B),
  tplSettings: rect(2, 2, 20, 20, 5, SD) + fill(scalePath(SHAPE_BY_ID.gear.d, 5, 5, 14, 14), '#e2e8f0'),
  tplMail: rect(2, 2, 20, 20, 6, C, CD) + fill(scalePath(SHAPE_BY_ID.envelope.d, 5, 6, 14, 12), W, '', 0) + dot(18.5, 5.5, 2.6, R),
  tplWeather: dot(14, 9, 5, Y, YD) + fill(scalePath(SHAPE_BY_ID.cloud.d, 2, 7, 17, 13), W, S),
  tplMusic: `<defs><linearGradient id="gi-music" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${PK}"/><stop offset="1" stop-color="${PD}"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="5" fill="url(#gi-music)"/>` + fill(scalePath(SHAPE_BY_ID.musicNote.d, 7, 5, 10, 14), W),
  tplShield: fill(scalePath(SHAPE_BY_ID.shield.d, 3, 2, 18, 20), G, GD) + fill(scalePath(SHAPE_BY_ID.lock.d, 9, 7, 6, 9), W),
  tplCube: fill('M12 2l9 5-9 5-9-5z', '#fdba74', OD) + fill('M3 7l9 5v10l-9-5z', O, OD) + fill('M21 7l-9 5v10l9-5z', OD, OD),
  tplLetter: rect(2, 2, 20, 20, 7, '#6366f1', '#312e81') + `<text x="12" y="17" font-size="13" font-weight="800" text-anchor="middle" fill="${W}" font-family="Segoe UI, sans-serif">A</text>`,
  tplPin: fill(scalePath(SHAPE_BY_ID.pin.d, 4, 2, 16, 20), R, RD),
};

// Shape buttons: the shape itself, filled with its category's colours.
const CATEGORY_COLORS = {
  basic: ['#60a5fa', '#1d4ed8'],
  stars: ['#fde047', '#ca8a04'],
  arrows: ['#4ade80', '#15803d'],
  symbols: ['#f87171', '#b91c1c'],
  callouts: ['#22d3ee', '#0e7490'],
};
const SOLID_GLYPHS = {
  cube: GLYPHS.cube,
  cylinder: `<ellipse cx="12" cy="18" rx="8" ry="3.5" fill="${OD}"/><rect x="4" y="6" width="16" height="12" fill="${O}"/><ellipse cx="12" cy="6" rx="8" ry="3.5" fill="#fdba74" stroke="${OD}" stroke-width="1"/>`,
  sphere: `<defs><radialGradient id="gi-sphere" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#fed7aa"/><stop offset="0.55" stop-color="${O}"/><stop offset="1" stop-color="#9a3412"/></radialGradient></defs><circle cx="12" cy="12" r="10" fill="url(#gi-sphere)"/>`,
  cone: `<ellipse cx="12" cy="19" rx="8" ry="3" fill="#9a3412"/>` + fill('M12 2L4 19h8z', O) + fill('M12 2l8 17h-8z', OD),
  pyramid: fill('M12 2L3 18l7 4z', O) + fill('M12 2l-2 20 11-5z', OD),
  prism: fill('M2 21l7-15 7 15z', O) + fill('M9 6l6-3 7 14-6 4z', OD),
  hexPrism: fill('M3 6l4-3h10l4 3-4 3H7z', '#fdba74', OD) + fill('M3 6l4 3v12l-4-3z', OD) + fill('M7 9h10v12H7z', O) + fill('M17 9l4-3v12l-4 3z', '#9a3412'),
  hemisphere: fill('M2 16a10 11 0 0 1 20 0z', O) + `<ellipse cx="12" cy="16" rx="10" ry="3.5" fill="${OD}"/>`,
  torus: `<path d="M2 12a10 7 0 1 1 20 0a10 7 0 1 1-20 0zM8 12a4 2.4 0 1 0 8 0a4 2.4 0 1 0-8 0z" fill="${O}" fill-rule="evenodd" stroke="${OD}" stroke-width="1"/>`,
  coin: `<ellipse cx="12" cy="13.5" rx="9.5" ry="8" fill="#a16207"/><ellipse cx="12" cy="11.5" rx="9.5" ry="8" fill="${Y}" stroke="${YD}" stroke-width="1"/><ellipse cx="12" cy="11.5" rx="6" ry="5" fill="#fef08a"/>`,
  octahedron: fill('M12 2L3 12l8 1z', '#fdba74') + fill('M12 2l-1 11 10-1z', O) + fill('M3 12l9 10-1-9z', OD) + fill('M11 13l1 9 9-10z', '#9a3412'),
  capsule3d: `<defs><linearGradient id="gi-capsule" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fed7aa"/><stop offset="0.45" stop-color="${O}"/><stop offset="1" stop-color="#9a3412"/></linearGradient></defs><rect x="2" y="6" width="20" height="12" rx="6" fill="url(#gi-capsule)"/>`,
};

/** The inner SVG of a shape's button icon. */
export function shapeGlyph(id) {
  if (SOLID_GLYPHS[id]) return SOLID_GLYPHS[id];
  const shape = SHAPE_BY_ID[id];
  if (!shape) return GLYPHS.rect;
  const [light, dark] = CATEGORY_COLORS[shape.cat] ?? CATEGORY_COLORS.basic;
  return `<path d="${scalePath(shape.d, 2.5, 2.5, 19, 19)}" fill="${light}" fill-rule="${shape.rule}" stroke="${dark}" stroke-width="1.1" stroke-linejoin="round"/>`;
}

/** The inner SVG for any icon name ("shape:<id>" for shapes, "emoji:<code>" for emoji). */
export function glyph(name) {
  if (name?.startsWith('shape:')) return shapeGlyph(name.slice(6));
  if (name?.startsWith('emoji:')) return `<svg x="1" y="1" width="22" height="22" viewBox="0 0 36 36">${EMOJI_ART[name.slice(6)] ?? ''}</svg>`;
  return GLYPHS[name] ?? GLYPHS.question;
}
