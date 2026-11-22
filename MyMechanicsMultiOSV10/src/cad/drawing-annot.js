// More drawing annotations, and how they reach the sheet SVG, the DXF file and the print (no DOM):
//   weld symbols ({ kind: 'drwWeld' }: reference line, arrow, the weld's symbol on the arrow / other side, size,
//     length and pitch, all-round, field weld, tail; ISO 2553 draws a dashed identification line, AWS A2.4 none),
//   general tables ({ kind: 'drwTable' }: rows × columns of editable cells),
//   layers (drawing.layers [{ id, name, color, visible }]; an annotation's `layer` — hidden layers are not drawn,
//     a layer's colour colours its annotations, the DXF gets one layer each),
//   the title block (drawing.title: title, part no., material … override the model's own) and sheet formats
//     (drawing.format: { standard: 'ISO' | 'ANSI', zones }: zone numbers and letters in the border).
// Dimensions and centre marks are in drawing-dims.js; this file assembles everything for one sheet.
import { SHEETS, annotationPrimitives, scaleLabel } from './drawing.js';
import { viewFrames, dimPrimitives, centerPrimitives, dimLabel, resolveLegacyDims } from './drawing-dims.js';
import { primsBox } from './drawing-snap.js';
import { harnessPrimitives } from './harness-sheet.js';
import { textWidth } from './text-metrics.js';

/** The annotation kinds drawn here (the base drawing code draws nothing for them). */
export const DRW_KINDS = new Set(['drwDim', 'drwCenter', 'drwWeld', 'drwTable', 'drwHarness']);
export const WELD_SYMBOLS = ['fillet', 'square', 'vGroove', 'bevel', 'uGroove', 'jGroove', 'flareV', 'plug', 'spot', 'seam'];
export const WELD_SIDES = ['arrow', 'other', 'both'];
export const WELD_CONTOURS = ['none', 'flat', 'convex', 'concave'];
export const STANDARDS = ['ISO', 'ANSI'];
export const ISO_SHEETS = ['A4', 'A3', 'A2', 'A1', 'A0'];
/** ANSI / ASME Y14.1 sizes A–E (A and B are the Letter and Tabloid sheets). */
export const ANSI_SHEETS = [['A', 'Letter'], ['B', 'Tabloid'], ['C', 'ANSI C'], ['D', 'ANSI D'], ['E', 'ANSI E']];
export const DEFAULT_LAYER_COLOR = '#000000';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const n2 = (v) => String(Math.round(v * 1000) / 1000);
const textW = (s, size) => textWidth(s, size);
const add2 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
const unit2 = (a) => { const l = Math.hypot(a[0], a[1]); return l > 1e-12 ? [a[0] / l, a[1] / l] : [1, 0]; };

// ───────────────────────── layers

export const layersOf = (d) => (Array.isArray(d?.layers) ? d.layers : []);
export const layerOf = (d, a) => layersOf(d).find((l) => l.id === a?.layer) ?? null;
/** False when the annotation's layer is switched off. */
export const annotationVisible = (d, a) => layerOf(d, a)?.visible !== false;
const colorOf = (d, a) => (/^#[0-9a-f]{6}$/i.test(layerOf(d, a)?.color ?? '') ? layerOf(d, a).color : DEFAULT_LAYER_COLOR);

/** Adds a layer (made active). Returns it. */
export function addLayer(d, { id, name, color = '#c62828' }) {
  d.layers = [...layersOf(d), { id, name: String(name || id), color, visible: true }];
  d.activeLayer = id;
  return d.layers.at(-1);
}

/** Removes a layer; its annotations go back to the default layer. */
export function removeLayer(d, id) {
  d.layers = layersOf(d).filter((l) => l.id !== id);
  for (const a of d.annotations ?? []) if (a.layer === id) delete a.layer;
  if (d.activeLayer === id) d.activeLayer = null;
}

/** The nearest AutoCAD colour index of an #rrggbb colour (1 red … 7 white/black, 8 grey). */
export function aciOf(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex ?? ''));
  if (!m) return 7;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
  const table = [[1, 255, 0, 0], [2, 255, 255, 0], [3, 0, 255, 0], [4, 0, 255, 255], [5, 0, 0, 255], [6, 255, 0, 255], [7, 0, 0, 0], [8, 128, 128, 128], [30, 255, 127, 0], [7, 255, 255, 255]];
  let best = 7; let bd = Infinity;
  for (const [i, R, G, B] of table) { const dd = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2; if (dd < bd) { bd = dd; best = i; } }
  return best;
}

/** A DXF-safe layer name. */
const RESERVED_LAYERS = new Set(['0', 'VISIBLE', 'HIDDEN', 'BORDER', 'ZONES', 'HATCH', 'NOTES', 'TITLE', 'FORMAT', 'DIMENSIONS', 'CENTER', 'WELDS', 'TABLES']);
/** A DXF-safe layer name of a user layer (never one of the sheet's own layers). */
export const dxfLayerName = (name) => { const s = String(name || 'LAYER').toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 29) || 'LAYER'; return RESERVED_LAYERS.has(s) ? `L_${s}` : s; };

// ───────────────────────── weld symbols

/** Primitives of a weld symbol (sheet mm, y down; `iso`: the ISO 2553 dashed identification line). */
export function weldPrimitives(a, { iso = true } = {}) {
  const x = Number(a.x) || 0; const y = Number(a.y) || 0;
  const L = Number(a.lineLength) > 0 ? Number(a.lineLength) : 24;
  const size = 2.8;
  const out = [];
  const tgt = Array.isArray(a.target) ? a.target.map(Number) : [x - 12, y + 12];
  const toRight = tgt[0] <= x + L / 2;
  const J = toRight ? [x, y] : [x + L, y];
  const E = toRight ? [x + L, y] : [x, y];
  out.push({ t: 'poly', pts: [[x, y], [x + L, y]], cls: 'dx-line' });
  out.push({ t: 'poly', pts: [J, tgt], cls: 'dx-thin' });
  const d = unit2([tgt[0] - J[0], tgt[1] - J[1]]); const n = [-d[1], d[0]];
  out.push({ t: 'fill', pts: [tgt, add2(add2(tgt, d, -2.8), n, 0.9), add2(add2(tgt, d, -2.8), n, -0.9)] });
  if (iso) out.push({ t: 'poly', pts: [[x, y + 1.2], [x + L, y + 1.2]], cls: 'dx-dash' });
  const cx = x + L / 2;
  // Sides: AWS puts the arrow side below the line, the other side above; ISO the arrow side on the solid
  // line (above it here) and the other side on the dashed line (below it).
  const sides = a.side === 'both' ? ['arrow', 'other'] : [a.side === 'other' ? 'other' : 'arrow'];
  for (const side of sides) {
    const below = iso ? side === 'other' : side === 'arrow';
    const s = below ? 1 : -1;
    const y0 = below ? y + (iso ? 1.2 : 0) : y;
    out.push(...weldGlyph(a.symbol, cx, y0, s));
    if (a.contour && a.contour !== 'none' && !['spot', 'seam', 'plug'].includes(a.symbol)) {
      const yc = y0 + s * 5.2;
      if (a.contour === 'flat') out.push({ t: 'poly', pts: [[cx - 2.5, yc], [cx + 2.5, yc]], cls: 'dx-thin' });
      else out.push({ t: 'poly', pts: Array.from({ length: 9 }, (_, i) => { const t = -1 + (2 * i) / 8; return [cx + 2.5 * t, yc + s * (a.contour === 'convex' ? 1 : -1) * 0.8 * (1 - t * t)]; }), cls: 'dx-thin' });
    }
    const ty = below ? y0 + 4.2 : y0 - 1;
    if (a.size) out.push({ t: 'text', x: cx - 3.5, y: ty, text: String(a.size), size, anchor: 'end' });
    const lp = [a.length, a.pitch].filter((v) => v != null && v !== '').join('-');
    if (lp) out.push({ t: 'text', x: cx + 3.5, y: ty, text: lp, size, anchor: 'start' });
  }
  if (a.allAround) out.push({ t: 'circle', c: J, r: 1.6, cls: 'dx-thin' });
  if (a.field) out.push({ t: 'poly', pts: [J, [J[0], J[1] - 6]], cls: 'dx-thin' }, { t: 'fill', pts: [[J[0], J[1] - 6], [J[0] + 3, J[1] - 5], [J[0], J[1] - 4]] });
  if (a.tail) {
    const k = toRight ? 1 : -1;
    out.push({ t: 'poly', pts: [[E[0] + k * 3, E[1] - 3], E, [E[0] + k * 3, E[1] + 3]], cls: 'dx-thin' });
    out.push({ t: 'text', x: E[0] + k * 4, y: E[1] + size * 0.35, text: String(a.tail), size, anchor: toRight ? 'start' : 'end' });
  }
  return out;
}

function weldGlyph(symbol, cx, y, s) {
  const h = 4; const P = (dx, dy) => [cx + dx, y + s * dy];
  switch (symbol) {
    case 'square': return [{ t: 'poly', pts: [P(-1, 0), P(-1, h)], cls: 'dx-thin' }, { t: 'poly', pts: [P(1, 0), P(1, h)], cls: 'dx-thin' }];
    case 'vGroove': return [{ t: 'poly', pts: [P(-2.4, h), P(0, 0), P(2.4, h)], cls: 'dx-thin' }];
    case 'bevel': return [{ t: 'poly', pts: [P(-1.2, h), P(-1.2, 0)], cls: 'dx-thin' }, { t: 'poly', pts: [P(-1.2, 0), P(2, h)], cls: 'dx-thin' }];
    case 'uGroove': return [{ t: 'poly', pts: [P(0, 0), P(0, 1.6)], cls: 'dx-thin' }, { t: 'poly', pts: Array.from({ length: 13 }, (_, i) => { const a = Math.PI + (Math.PI * i) / 12; return P(2.2 * Math.cos(a), 1.6 - 2.2 * Math.sin(a) + 0.0); }).map((p) => p), cls: 'dx-thin' }];
    case 'jGroove': return [{ t: 'poly', pts: [P(-1.2, 0), P(-1.2, h)], cls: 'dx-thin' }, { t: 'poly', pts: Array.from({ length: 9 }, (_, i) => { const a = Math.PI + (Math.PI / 2) * (i / 8); return P(-1.2 + 3 + 3 * Math.cos(a), h - 2 * (1 + Math.sin(a)) + 0.0); }), cls: 'dx-thin' }];
    case 'flareV': return [{ t: 'poly', pts: Array.from({ length: 9 }, (_, i) => { const a = (Math.PI / 2) * (i / 8); return P(-3 + 3 * Math.cos(a), h - h * Math.sin(a)); }), cls: 'dx-thin' }, { t: 'poly', pts: Array.from({ length: 9 }, (_, i) => { const a = (Math.PI / 2) * (i / 8); return P(3 - 3 * Math.cos(a), h - h * Math.sin(a)); }), cls: 'dx-thin' }];
    case 'plug': return [{ t: 'poly', pts: [P(-2.4, 0), P(-2.4, 2.4), P(2.4, 2.4), P(2.4, 0)], cls: 'dx-thin' }];
    case 'spot': return [{ t: 'circle', c: [cx, y], r: 2, cls: 'dx-thin' }];
    case 'seam': return [{ t: 'circle', c: [cx, y], r: 2, cls: 'dx-thin' }, { t: 'poly', pts: [[cx - 3, y - 0.8], [cx + 3, y - 0.8]], cls: 'dx-thin' }, { t: 'poly', pts: [[cx - 3, y + 0.8], [cx + 3, y + 0.8]], cls: 'dx-thin' }];
    default: return [{ t: 'poly', pts: [P(-2, 0), P(-2, h), P(2, 0)], closed: true, cls: 'dx-thin' }];
  }
}

// ───────────────────────── general tables

/** A new table: rows × cols of empty cells. */
export function createTable({ id, x = 20, y = 20, rows = 3, cols = 3, title = '' }) {
  return { id, kind: 'drwTable', x, y, rows, cols, title, cells: Array.from({ length: rows }, () => Array(cols).fill('')), colW: Array(cols).fill(25), rowH: 6 };
}

/** Rows / columns added or removed (cells kept where they are). */
export function resizeTable(a, rows, cols) {
  const R = Math.max(1, Math.min(60, Math.round(rows))); const C = Math.max(1, Math.min(20, Math.round(cols)));
  const cells = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => a.cells?.[r]?.[c] ?? ''));
  const colW = Array.from({ length: C }, (_, c) => Number(a.colW?.[c]) > 0 ? Number(a.colW[c]) : 25);
  Object.assign(a, { rows: R, cols: C, cells, colW });
  return a;
}

export function tablePrimitives(a) {
  const x = Number(a.x) || 0; const y = Number(a.y) || 0;
  const rh = Number(a.rowH) > 0 ? Number(a.rowH) : 6;
  const colW = (a.colW ?? []).map((w) => Number(w) || 25);
  const W = colW.reduce((s, w) => s + w, 0);
  const titleH = a.title ? rh : 0;
  const H = titleH + rh * (a.rows ?? 0);
  const out = [{ t: 'poly', pts: [[x, y], [x + W, y], [x + W, y + H], [x, y + H]], closed: true, cls: 'dx-line' }];
  if (a.title) {
    out.push({ t: 'poly', pts: [[x, y + titleH], [x + W, y + titleH]], cls: 'dx-thin' });
    out.push({ t: 'text', x: x + W / 2, y: y + titleH * 0.7, text: a.title, size: rh * 0.55, anchor: 'middle', bold: true });
  }
  for (let r = 1; r < a.rows; r++) out.push({ t: 'poly', pts: [[x, y + titleH + r * rh], [x + W, y + titleH + r * rh]], cls: 'dx-thin' });
  let cx = x;
  for (let c = 0; c < colW.length; c++) {
    if (c) out.push({ t: 'poly', pts: [[cx, y + titleH], [cx, y + H]], cls: 'dx-thin' });
    for (let r = 0; r < a.rows; r++) {
      const text = String(a.cells?.[r]?.[c] ?? '');
      if (text) out.push({ t: 'text', x: cx + colW[c] / 2, y: y + titleH + r * rh + rh * 0.68, text, size: rh * 0.5, anchor: 'middle', bold: r === 0 && a.header !== false });
    }
    cx += colW[c];
  }
  return out;
}

// ───────────────────────── title block and sheet format

/** The title block fields shown (the drawing's own values win over the model's). */
export function titleFields(d, { info = {}, scale = 1 } = {}) {
  const t = d.title ?? {};
  return {
    name: t.title || info.name || d.name || '', partNo: t.partNo ?? '', material: t.material || info.material || '', mass: info.mass ?? '',
    scale: scaleLabel(scale), sheet: d.sheet ?? 'A3', drawnBy: t.drawnBy ?? '', checkedBy: t.checkedBy ?? '', date: t.date ?? '', revision: t.revision ?? '', company: t.company ?? '',
  };
}

/** The title block as primitives — the same cells as the SVG one, for the DXF. */
export function titleBlockPrimitives(W, H, f, labels = {}) {
  const w = 180; const h = 40; const x = W - 10 - w; const y = H - 10 - h;
  const out = [{ t: 'poly', pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true, cls: 'dx-line' }];
  const L = (k, fb) => labels[`title.${k}`] ?? fb;
  const cell = (cx, cy, cw, ch, label, value, big = false) => {
    out.push({ t: 'poly', pts: [[cx, cy], [cx + cw, cy], [cx + cw, cy + ch], [cx, cy + ch]], closed: true, cls: 'dx-thin' });
    out.push({ t: 'text', x: cx + 1.2, y: cy + 2.8, text: label, size: 2.2 });
    if (value) out.push({ t: 'text', x: cx + 1.2, y: cy + ch - 1.6, text: String(value), size: big ? 5 : 3.4, bold: big });
  };
  cell(x, y, 110, 14, L('name', 'Title'), f.name, true);
  cell(x + 110, y, 70, 14, L('partNo', 'Part no.'), f.partNo);
  cell(x, y + 14, 55, 13, L('material', 'Material'), f.material);
  cell(x + 55, y + 14, 55, 13, L('mass', 'Mass'), f.mass);
  cell(x + 110, y + 14, 35, 13, L('scale', 'Scale'), f.scale);
  cell(x + 145, y + 14, 35, 13, L('sheet', 'Sheet'), f.sheet);
  cell(x, y + 27, 37, 13, L('drawnBy', 'Drawn'), f.drawnBy);
  cell(x + 37, y + 27, 37, 13, L('checkedBy', 'Checked'), f.checkedBy);
  cell(x + 74, y + 27, 36, 13, L('date', 'Date'), f.date);
  cell(x + 110, y + 27, 25, 13, L('revision', 'Rev.'), f.revision);
  out.push({ t: 'poly', pts: [[x + 135, y + 27], [x + 180, y + 27], [x + 180, y + 40], [x + 135, y + 40]], closed: true, cls: 'dx-thin' });
  if (f.company) out.push({ t: 'text', x: x + 2, y: y - 2, text: f.company, size: 2.2 });
  return out;
}

/**
 * Zone numbers and letters in the border (ISO 5457: numbers left → right, letters top → bottom; ASME Y14.1:
 * numbers right → left, letters bottom → top) and the standard's name beside the title block.
 */
export function formatPrimitives(d) {
  const fmt = d.format;
  if (!fmt) return [];
  const [W, H] = SHEETS[d.sheet] ?? SHEETS.A3;
  const out = [];
  const ansi = fmt.standard === 'ANSI';
  if (fmt.zones !== false) {
    const cols = Math.round((W - 20) / 50); const rows = Math.round((H - 20) / 50);
    const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
    for (let i = 0; i < cols; i++) {
      const x = 10 + ((W - 20) * (i + 0.5)) / cols;
      const label = String(ansi ? cols - i : i + 1);
      out.push({ t: 'text', x, y: 7.2, text: label, size: 3, anchor: 'middle' }, { t: 'text', x, y: H - 4.2, text: label, size: 3, anchor: 'middle' });
    }
    for (let j = 0; j < rows; j++) {
      const y = 10 + ((H - 20) * (j + 0.5)) / rows + 1;
      const label = letters[ansi ? rows - 1 - j : j] ?? '';
      out.push({ t: 'text', x: 5, y, text: label, size: 3, anchor: 'middle' }, { t: 'text', x: W - 5, y, text: label, size: 3, anchor: 'middle' });
    }
  }
  out.push({ t: 'text', x: W - 12, y: H - 52, text: ansi ? 'ASME Y14.5 · ANSI' : 'ISO 128 · ISO 129-1', size: 2.4, anchor: 'end' });
  return out;
}

/** Applies a sheet format: size, standard (ISO / ANSI), the projection it uses and the zones. */
export function applySheetFormat(d, { standard = 'ISO', sheet = null, projection = null, zones = true } = {}) {
  const std = standard === 'ANSI' ? 'ANSI' : 'ISO';
  d.format = { standard: std, zones: zones !== false };
  if (sheet && SHEETS[sheet]) d.sheet = sheet;
  d.projection = projection ?? (std === 'ANSI' ? 'third' : 'first');
  return d;
}

// ───────────────────────── one sheet: SVG and DXF

/**
 * Primitives of everything this module draws on the sheet drawing `sd` (sheetDrawing()): per annotation
 * { a, prims, color, layer, visible }, plus the sheet format's. `projections` as drawn (adjusted).
 */
export function drwItems(sd, projections) {
  const { scale, frames } = viewFrames(sd, projections);
  // Dimensions of broken views from older files: into true coordinates before anything uses them (once).
  resolveLegacyDims(sd, frames);
  const iso = (sd.format?.standard ?? 'ISO') !== 'ANSI';
  const items = [];
  for (const a of sd.annotations ?? []) {
    if (!DRW_KINDS.has(a?.kind)) continue;
    let prims = [];
    try {
      if (a.kind === 'drwDim' || a.kind === 'drwCenter') {
        const fr = frames.get(a.view);
        if (!fr) continue;
        prims = a.kind === 'drwDim' ? dimPrimitives(a, fr, { size: Number(a.size) > 0 ? Number(a.size) : 3.2 }) : centerPrimitives(a, fr);
      } else if (a.kind === 'drwWeld') prims = weldPrimitives(a, { iso });
      else if (a.kind === 'drwTable') prims = tablePrimitives(a);
      else if (a.kind === 'drwHarness') prims = harnessPrimitives(a);
    } catch { prims = []; }
    items.push({ a, prims, color: colorOf(sd, a), layer: layerOf(sd, a), visible: annotationVisible(sd, a) });
  }
  return { scale, items, format: formatPrimitives(sd) };
}

const OVERLAY_CSS = `<style>
    .dx-line{fill:none;stroke-width:.25;stroke-linejoin:round;stroke-linecap:round}.dx-thin{fill:none;stroke-width:.18;stroke-linecap:round}
    .dx-center{fill:none;stroke-width:.18;stroke-dasharray:6 1.2 1.2 1.2}.dx-dash{fill:none;stroke-width:.25;stroke-dasharray:1.6 1}
    .dx-text{font-family:Roboto,"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif}.dx-bold{font-weight:bold}.dx-format{font-family:Roboto,"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif;fill:#000}
    .annotation.selected .dx-line,.annotation.selected .dx-thin,.annotation.selected .dx-center,.annotation.selected .dx-dash{stroke:#1e88e5}
    .annotation.selected .dx-fill,.annotation.selected .dx-text{fill:#1e88e5}
  </style>`;

/** Primitives as SVG in one colour. */
export function primsSvg(prims, color = '#000') {
  const out = [];
  for (const p of prims) {
    if (p.t === 'poly') out.push(`<path d="M ${p.pts.map((q) => `${n2(q[0])} ${n2(q[1])}`).join(' L ')}${p.closed ? ' Z' : ''}" class="${p.cls ?? 'dx-line'}" stroke="${color}"/>`);
    else if (p.t === 'circle') out.push(`<circle cx="${n2(p.c[0])}" cy="${n2(p.c[1])}" r="${n2(p.r)}" class="${p.fill ? 'dx-fill' : (p.cls ?? 'dx-line')}" ${p.fill ? `fill="${color}"` : `stroke="${color}"`}/>`);
    else if (p.t === 'fill') out.push(`<path d="M ${p.pts.map((q) => `${n2(q[0])} ${n2(q[1])}`).join(' L ')} Z" class="dx-fill" fill="${color}"/>`);
    else if (p.t === 'text') {
      const rot = p.rot ? ` transform="rotate(${n2(p.rot)} ${n2(p.x)} ${n2(p.y)})"` : '';
      out.push(`<text x="${n2(p.x)}" y="${n2(p.y)}" class="dx-text${p.bold ? ' dx-bold' : ''}" font-size="${n2(p.size)}" text-anchor="${p.anchor ?? 'start'}" fill="${color}"${rot}>${esc(p.text)}</text>`);
    }
  }
  return out.join('');
}

/** CSS that colours the base annotations (notes, balloons …) of coloured layers. */
function layerCss(sd) {
  const rules = [];
  for (const a of sd.annotations ?? []) {
    if (DRW_KINDS.has(a?.kind)) continue;
    const l = layerOf(sd, a);
    if (!l || !/^#[0-9a-f]{6}$/i.test(l.color ?? '') || l.color === DEFAULT_LAYER_COLOR) continue;
    const sel = `[data-annotation="${String(a.id).replace(/[^A-Za-z0-9_-]/g, '')}"]`;
    rules.push(`${sel}:not(.selected) .ann-line,${sel}:not(.selected) .ann-frame{stroke:${l.color}}${sel}:not(.selected) .ann-fill,${sel}:not(.selected) .ann-text{fill:${l.color}}`);
  }
  return rules.length ? `<style>${rules.join('')}</style>` : '';
}

/** The SVG to add to the sheet (before </svg>): our annotations, layer colours and the sheet format. */
export function drwSvg(sd, projections, { selected = null } = {}) {
  const { items, format } = drwItems(sd, projections);
  const parts = [];
  for (const it of items) {
    if (!it.visible || !it.prims.length) continue;
    parts.push(`<g class="annotation dx-ann dx-${esc(it.a.kind)}${selected != null && it.a.id === selected ? ' selected' : ''}" data-annotation="${esc(it.a.id)}"${it.layer ? ` data-layer="${esc(it.layer.id)}"` : ''}>${primsSvg(it.prims, it.color)}</g>`);
  }
  if (format.length) parts.push(`<g class="dx-format">${primsSvg(format, '#000')}</g>`);
  const css = layerCss(sd);
  if (!parts.length && !css) return '';
  return `${OVERLAY_CSS}${css}<g class="drawing-drw">${parts.join('')}</g>`;
}

/** Adds SVG just before the closing </svg>. */
export const injectSvg = (svg, extra) => (extra ? String(svg).replace(/<\/svg>\s*$/, `${extra}\n</svg>`) : svg);

/** DXF text: the drafting symbols as DXF control codes. */
const dxfText = (s) => String(s ?? '').replace(/[\r\n]/g, ' ').replace(/Ø/g, '%%c').replace(/±/g, '%%p').replace(/°/g, '%%d').replace(/−/g, '-').replace(/×/g, 'x');

/** DXF entities of primitives on `layer` (sheet y down → DXF y up). */
export function primsDxf(prims, H, layer) {
  const f = (v) => Number(v).toFixed(4);
  const out = [];
  for (const p of prims) {
    if (p.t === 'poly' || p.t === 'fill') {
      const pts = p.pts; const closed = p.closed || p.t === 'fill';
      const lt = p.linetype ? `\n6\n${p.linetype}` : '';
      const line = (a, b) => out.push(`0\nLINE\n8\n${layer}${lt}\n10\n${f(a[0])}\n20\n${f(H - a[1])}\n30\n0\n11\n${f(b[0])}\n21\n${f(H - b[1])}\n31\n0`);
      for (let k = 1; k < pts.length; k++) line(pts[k - 1], pts[k]);
      if (closed && pts.length > 2) line(pts.at(-1), pts[0]);
      if (p.t === 'fill' && pts.length === 3) out.push(`0\nSOLID\n8\n${layer}\n${[pts[0], pts[1], pts[2], pts[2]].map((v, i) => `1${i}\n${f(v[0])}\n2${i}\n${f(H - v[1])}\n3${i}\n0`).join('\n')}`);
    } else if (p.t === 'circle') out.push(`0\nCIRCLE\n8\n${layer}\n10\n${f(p.c[0])}\n20\n${f(H - p.c[1])}\n30\n0\n40\n${f(p.r)}`);
    else if (p.t === 'text' && p.text !== '') {
      const h = { start: 0, middle: 1, end: 2 }[p.anchor ?? 'start'] ?? 0;
      const X = f(p.x); const Y = f(H - p.y);
      out.push(`0\nTEXT\n8\n${layer}\n10\n${X}\n20\n${Y}\n30\n0\n40\n${f(p.size * 0.72)}\n1\n${dxfText(p.text)}\n50\n${f(-(p.rot ?? 0))}${h ? `\n72\n${h}\n11\n${X}\n21\n${Y}\n31\n0` : ''}`);
    }
  }
  return out;
}

/**
 * Adds to a DXF file (drawingDxf() text): layers in its LAYER table and entities before the end of ENTITIES.
 * layers: [{ name, color (ACI), off, linetype }].
 */
export function injectDxf(dxf, layers, entities) {
  let s = String(dxf);
  const m = /0\nTABLE\n2\nLAYER\n70\n(\d+)\n/.exec(s);
  const have = new Set([...s.matchAll(/0\nLAYER\n2\n([^\n]+)\n/g)].map((x) => x[1]));
  const fresh = layers.filter((l) => !have.has(l.name));
  if (m && fresh.length) {
    const recs = fresh.map((l) => `0\nLAYER\n2\n${l.name}\n70\n0\n62\n${l.off ? -Math.abs(l.color) : l.color}\n6\n${l.linetype ?? 'CONTINUOUS'}`).join('\n');
    s = s.replace(m[0], `0\nTABLE\n2\nLAYER\n70\n${Number(m[1]) + fresh.length}\n`);
    const end = s.indexOf('0\nENDTAB', s.indexOf('0\nTABLE\n2\nLAYER'));
    s = `${s.slice(0, end)}${recs}\n${s.slice(end)}`;
  }
  if (entities.length) {
    const at = s.lastIndexOf('0\nENDSEC\n0\nEOF');
    if (at >= 0) s = `${s.slice(0, at)}${entities.join('\n')}\n${s.slice(at)}`;
  }
  return s;
}

/**
 * The DXF additions of a sheet: our annotations on their layers (or DIMENSIONS / CENTER / WELDS / TABLES), the
 * base annotations that sit on a layer (`layered`: they were left out of the base DXF), the title block (TITLE)
 * and the sheet format (FORMAT). Returns the DXF with them added.
 */
export function drwDxf(dxf, sd, projections, { info = {}, labels = {}, layered = [] } = {}) {
  const [W, H] = SHEETS[sd.sheet] ?? SHEETS.A3;
  const { items, format, scale } = drwItems(sd, projections);
  const DEF = { drwDim: 'DIMENSIONS', drwCenter: 'CENTER', drwWeld: 'WELDS', drwTable: 'TABLES', drwHarness: 'HARNESS' };
  const layers = new Map();
  const ents = [];
  const use = (name, color, off = false, linetype) => { if (!layers.has(name)) layers.set(name, { name, color, off, linetype }); return name; };
  for (const it of items) {
    if (!it.prims.length) continue;
    const name = it.layer ? use(dxfLayerName(it.layer.name), aciOf(it.layer.color), it.layer.visible === false) : use(DEF[it.a.kind], it.a.kind === 'drwCenter' ? 4 : 7, false, it.a.kind === 'drwCenter' ? 'CENTER' : undefined);
    ents.push(...primsDxf(it.prims, H, name));
  }
  for (const a of layered) {
    const l = layerOf(sd, a);
    const name = use(dxfLayerName(l?.name ?? 'NOTES'), aciOf(l?.color), l?.visible === false);
    ents.push(...primsDxf(annotationPrimitives(a, { scale }), H, name));
  }
  ents.push(...primsDxf(titleBlockPrimitives(W, H, titleFields(sd, { info, scale }), labels), H, use('TITLE', 7)));
  if (format.length) ents.push(...primsDxf(format, H, use('FORMAT', 7)));
  return injectDxf(dxf, [...layers.values()], ents);
}

/** One line per annotation of ours (kind, layer, text): the annotations list and the tests. */
export function drwSummary(sd) {
  return (sd.annotations ?? []).filter((a) => DRW_KINDS.has(a?.kind)).map((a) => ({ id: a.id, kind: a.kind, layer: a.layer ?? null, text: a.kind === 'drwDim' ? dimLabel(a) : a.kind === 'drwTable' ? (a.cells ?? []).flat().filter(Boolean).join(' ') : a.kind === 'drwWeld' ? `${a.symbol} ${a.size ?? ''}` : a.ctype }));
}

/**
 * Where every annotation of the sheet drawing is, for dragging and snapping: [{ id, kind, anchor ([x, y] sheet mm:
 * what moves with the drag — a note's (x, y), a smart dimension's text place; null for centre marks, which follow
 * their geometry), box (sheet mm; the text of notes and dimensions, the whole symbol otherwise) }].
 */
export function annotationBoxes(sd, projections) {
  const { scale, frames } = viewFrames(sd, projections ?? new Map());
  resolveLegacyDims(sd, frames);
  const iso = (sd.format?.standard ?? 'ISO') !== 'ANSI';
  const out = [];
  for (const a of sd.annotations ?? []) {
    if (!a?.id) continue;
    let prims = []; let anchor = [Number(a.x) || 0, Number(a.y) || 0];
    try {
      if (a.kind === 'drwDim' || a.kind === 'drwCenter') {
        const fr = frames.get(a.view);
        if (!fr) continue;
        prims = a.kind === 'drwDim' ? dimPrimitives(a, fr, { size: Number(a.size) > 0 ? Number(a.size) : 3.2 }) : centerPrimitives(a, fr);
        anchor = a.kind === 'drwDim' ? [fr.place.cx + (Number(a.x) || 0), fr.place.cy + (Number(a.y) || 0)] : null;
      } else if (a.kind === 'drwWeld') prims = weldPrimitives(a, { iso });
      else if (a.kind === 'drwTable') prims = tablePrimitives(a);
      else if (a.kind === 'drwHarness') prims = harnessPrimitives(a);
      else prims = annotationPrimitives(a, { scale });
    } catch { prims = []; }
    const textOnly = a.kind === 'note' || a.kind === 'drwDim' || a.kind === 'dimension';
    const box = (textOnly ? primsBox(prims, 'text') : null) ?? primsBox(prims);
    if (box) out.push({ id: a.id, kind: a.kind, anchor, box });
  }
  return out;
}
