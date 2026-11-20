// 2D drawings (SolidWorks' drawing documents): a sheet with standard views (front, top, right …,
// isometric) of a part or an assembly, made by the kernel's hidden-line removal, with overall
// dimensions, view labels and a title block. Rendered as SVG (screen, print, SVG export) and as DXF.
import { rep } from './kernel.js';

export const SHEETS = {
  A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841], Letter: [279.4, 215.9], Tabloid: [431.8, 279.4],
};
export const STANDARD_SCALES = [10, 5, 4, 2, 1, 1 / 2, 1 / 2.5, 1 / 4, 1 / 5, 1 / 10, 1 / 20, 1 / 50, 1 / 100];
export const VIEW_TYPES = ['front', 'top', 'right', 'left', 'back', 'bottom', 'iso', 'dimetric'];

/** Camera for each view (Y up): dir points from the model toward the viewer; up = dir × xAxis. */
export const VIEW_CAMERAS = {
  front: { dir: [0, 0, 1], x: [1, 0, 0] },
  back: { dir: [0, 0, -1], x: [-1, 0, 0] },
  top: { dir: [0, 1, 0], x: [1, 0, 0] },
  bottom: { dir: [0, -1, 0], x: [1, 0, 0] },
  right: { dir: [1, 0, 0], x: [0, 0, -1] },
  left: { dir: [-1, 0, 0], x: [0, 0, 1] },
  iso: { dir: [1, 1, 1], x: [1, 0, -1] },
  dimetric: { dir: [1, 0.6, 1.6], x: [1.6, 0, -1] },
};

export const scaleLabel = (s) => (s >= 1 ? `${round(s)}:1` : `1:${round(1 / s)}`);
const round = (v) => Math.round(v * 100) / 100;

/** A new drawing of a part or assembly with the usual three views and an isometric one. */
export function createDrawing({ id, name, source, sheet = 'A3', projection = 'third', title = {} }) {
  return {
    id, name, source, sheet, projection, scale: 1, autoScale: true, showHidden: true, showDims: true,
    views: [
      { id: 'v-front', type: 'front' }, { id: 'v-top', type: 'top' }, { id: 'v-right', type: 'right' }, { id: 'v-iso', type: 'iso', hidden: false },
    ],
    title: { company: '', drawnBy: '', checkedBy: '', date: new Date().toISOString().slice(0, 10), partNo: '', revision: 'A', ...title },
    notes: [],
  };
}

/** Projects a shape for one view: { visible: [path], hidden: [path], box: { x0, y0, x1, y1 } } (model units, y up). */
export function projectView(shape, type) {
  const R = rep();
  const cam = VIEW_CAMERAS[type] ?? VIEW_CAMERAS.front;
  const camera = new R.ProjectionCamera([0, 0, 0], cam.dir, cam.x);
  const { visible, hidden } = R.drawProjection(shape, camera);
  const paths = (d) => { try { return [d.toSVGPaths()].flat(3).filter(Boolean); } catch { return []; } };
  let box = null;
  try {
    const [[x0, y0], [x1, y1]] = visible.boundingBox.bounds;
    box = { x0, y0, x1, y1 };
  } catch { box = { x0: -1, y0: -1, x1: 1, y1: 1 }; }
  return { visible: paths(visible), hidden: paths(hidden), box };
}

/**
 * Lays out the views on the sheet and picks a standard scale so they fit (third-angle: top above the front,
 * right to its right; first-angle: the other way). `projections`: view id → projectView() result.
 * Returns { scale, places: Map viewId → { cx, cy } in sheet mm (y down) }.
 */
export function layoutViews(drawing, projections) {
  const [W, H] = SHEETS[drawing.sheet] ?? SHEETS.A3;
  const margin = 20; const titleH = 40; const gap = 22;
  const size = (id) => { const p = projections.get(id); return p ? { w: p.box.x1 - p.box.x0, h: p.box.y1 - p.box.y0 } : { w: 0, h: 0 }; };
  const byType = (t) => drawing.views.find((v) => v.type === t);
  const front = byType('front'); const top = byType('top'); const right = byType('right'); const iso = drawing.views.find((v) => v.type === 'iso' || v.type === 'dimetric');
  const fw = size(front?.id).w; const fh = size(front?.id).h;
  const tw = top ? size(top.id).w : 0; const th = top ? size(top.id).h : 0;
  const rw = right ? size(right.id).w : 0; const rh = right ? size(right.id).h : 0;
  const iw = iso ? size(iso.id).w : 0; const ih = iso ? size(iso.id).h : 0;
  const totalW = Math.max(fw, tw) + rw + iw * 0.8 + 1e-9;
  const totalH = fh + th + 1e-9;
  const availW = W - 2 * margin - gap * 3; const availH = H - 2 * margin - titleH - gap * 2;
  let scale = drawing.scale || 1;
  if (drawing.autoScale !== false) {
    const fit = Math.min(availW / totalW, availH / totalH);
    scale = STANDARD_SCALES.find((s) => s <= fit) ?? STANDARD_SCALES.at(-1);
  }
  const places = new Map();
  const third = drawing.projection !== 'first';
  const left = margin + gap + (Math.max(fw, tw) * scale) / 2;
  const usedH = (fh + th) * scale + gap;
  const topBand = margin + Math.max(gap, (H - titleH - 2 * margin - usedH) / 2);
  const frontCy = third ? topBand + th * scale + gap + (fh * scale) / 2 : topBand + (fh * scale) / 2;
  const topCy = third ? topBand + (th * scale) / 2 : frontCy + (fh * scale) / 2 + gap + (th * scale) / 2;
  const rightCx = third ? left + (Math.max(fw, tw) * scale) / 2 + gap + (rw * scale) / 2 : left;
  const frontCx = third ? left : left + (rw * scale) / 2 + gap + (Math.max(fw, tw) * scale) / 2;
  if (front) places.set(front.id, { cx: frontCx, cy: frontCy });
  if (top) places.set(top.id, { cx: frontCx, cy: topCy });
  if (right) places.set(right.id, { cx: third ? rightCx : left, cy: frontCy });
  if (iso) places.set(iso.id, { cx: W - margin - gap - (iw * scale) / 2, cy: margin + gap + (ih * scale) / 2 + 6 });
  // Other views (left, back, bottom) go in a row along the bottom.
  let x = margin + gap;
  for (const v of drawing.views) {
    if (places.has(v.id)) continue;
    const s = size(v.id);
    places.set(v.id, { cx: x + (s.w * scale) / 2, cy: H - margin - titleH - gap - (s.h * scale) / 2 });
    x += s.w * scale + gap;
  }
  // A view moved by hand keeps its place.
  for (const v of drawing.views) if (Number.isFinite(v.x) && Number.isFinite(v.y)) places.set(v.id, { cx: v.x, cy: v.y });
  return { scale, places };
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (v) => { const r = Math.round(v * 100) / 100; return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, ''); };

/** Overall dimensions of a (non-isometric) view: width under it, height left of it. */
function viewDimensions(p, place, scale) {
  const w = p.box.x1 - p.box.x0; const h = p.box.y1 - p.box.y0;
  const x0 = place.cx - (w * scale) / 2; const x1 = place.cx + (w * scale) / 2;
  const y0 = place.cy - (h * scale) / 2; const y1 = place.cy + (h * scale) / 2;
  const out = [];
  const arrow = (x, y, dx, dy) => `<path d="M ${x} ${y} l ${-dx * 2.5 - dy * 0.8} ${-dy * 2.5 + dx * 0.8} l ${dy * 1.6} ${-dx * 1.6} z" class="dim-arrow"/>`;
  if (w > 1e-6) {
    const y = y1 + 9;
    out.push(`<line x1="${x0}" y1="${y1 + 1.5}" x2="${x0}" y2="${y + 2}" class="dim-ext"/><line x1="${x1}" y1="${y1 + 1.5}" x2="${x1}" y2="${y + 2}" class="dim-ext"/>`);
    out.push(`<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" class="dim-line"/>${arrow(x0, y, -1, 0)}${arrow(x1, y, 1, 0)}`);
    out.push(`<text x="${(x0 + x1) / 2}" y="${y - 1.2}" class="dim-text" text-anchor="middle">${fmt(w)}</text>`);
  }
  if (h > 1e-6) {
    const x = x0 - 9;
    out.push(`<line x1="${x0 - 1.5}" y1="${y0}" x2="${x - 2}" y2="${y0}" class="dim-ext"/><line x1="${x0 - 1.5}" y1="${y1}" x2="${x - 2}" y2="${y1}" class="dim-ext"/>`);
    out.push(`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" class="dim-line"/>${arrow(x, y0, 0, -1)}${arrow(x, y1, 0, 1)}`);
    out.push(`<text x="${x - 1.2}" y="${(y0 + y1) / 2}" class="dim-text" text-anchor="middle" transform="rotate(-90 ${x - 1.2} ${(y0 + y1) / 2})">${fmt(h)}</text>`);
  }
  return out.join('');
}

/**
 * The drawing sheet as SVG (units: mm). `projections` (view id → projectView()), `labels` (texts in the UI
 * language: view names, title block field names), `info` (part name, material, mass …).
 */
export function drawingSvg(drawing, projections, { labels = {}, info = {}, selected = null } = {}) {
  const [W, H] = SHEETS[drawing.sheet] ?? SHEETS.A3;
  const { scale, places } = layoutViews(drawing, projections);
  const views = [];
  for (const v of drawing.views) {
    const p = projections.get(v.id);
    const place = places.get(v.id);
    if (!p || !place) continue;
    const cx = (p.box.x0 + p.box.x1) / 2; const cy = (p.box.y0 + p.box.y1) / 2;
    // Paths are y-down already: the view's centre (cx, −cy) goes to the place.
    const t = `translate(${place.cx} ${place.cy}) scale(${scale}) translate(${-cx} ${cy})`;
    const hiddenOn = drawing.showHidden !== false && v.hidden !== false && v.type !== 'iso' && v.type !== 'dimetric';
    const w = (p.box.x1 - p.box.x0) * scale; const h = (p.box.y1 - p.box.y0) * scale;
    views.push(`<g class="view ${selected === v.id ? 'selected' : ''}" data-view="${esc(v.id)}">
      <rect x="${place.cx - w / 2 - 4}" y="${place.cy - h / 2 - 4}" width="${w + 8}" height="${h + 8}" class="view-box"/>
      <g transform="${t}">
        ${hiddenOn ? p.hidden.map((d) => `<path d="${d}" class="hidden-line" vector-effect="non-scaling-stroke"/>`).join('') : ''}
        ${p.visible.map((d) => `<path d="${d}" class="visible-line" vector-effect="non-scaling-stroke"/>`).join('')}
      </g>
      ${drawing.showDims !== false && v.type !== 'iso' && v.type !== 'dimetric' ? viewDimensions(p, place, scale) : ''}
      <text x="${place.cx}" y="${place.cy + h / 2 + (v.type === 'iso' || v.type === 'dimetric' || drawing.showDims === false ? 9 : 19)}" class="view-label" text-anchor="middle">${esc(labels[`view.${v.type}`] ?? v.type)}</text>
    </g>`);
  }
  const title = drawing.title ?? {};
  const tb = titleBlock(W, H, { ...title, name: info.name ?? drawing.name, material: info.material ?? '', mass: info.mass ?? '', scale: scaleLabel(scale), sheet: drawing.sheet, projection: drawing.projection }, labels);
  return `<svg xmlns="http://www.w3.org/2000/svg" class="drawing-sheet" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm">
  <style>
    .sheet-bg{fill:#fff}.frame{fill:none;stroke:#000;stroke-width:.7}.frame-thin{fill:none;stroke:#000;stroke-width:.25}
    .visible-line{fill:none;stroke:#000;stroke-width:.5;stroke-linejoin:round;stroke-linecap:round}
    .hidden-line{fill:none;stroke:#555;stroke-width:.3;stroke-dasharray:2 1.2}
    .view-box{fill:transparent;stroke:none}.view.selected .view-box{stroke:#1e88e5;stroke-width:.4;stroke-dasharray:2 1}
    .view-label{font:3.2px sans-serif;fill:#000}.dim-line,.dim-ext{stroke:#000;stroke-width:.18;fill:none}.dim-arrow{fill:#000}
    .dim-text{font:3.2px sans-serif;fill:#000}.tb-label{font:2.2px sans-serif;fill:#444}.tb-value{font:3.4px sans-serif;fill:#000}.tb-title{font:bold 5px sans-serif;fill:#000}
  </style>
  <rect class="sheet-bg" x="0" y="0" width="${W}" height="${H}"/>
  <rect class="frame" x="10" y="10" width="${W - 20}" height="${H - 20}"/>
  ${zoneMarks(W, H)}
  ${views.join('\n')}
  ${tb}
</svg>`;
}

function zoneMarks(W, H) {
  const out = [];
  const cols = Math.round((W - 20) / 50); const rows = Math.round((H - 20) / 50);
  for (let i = 1; i < cols; i++) { const x = 10 + ((W - 20) * i) / cols; out.push(`<line x1="${x}" y1="10" x2="${x}" y2="13" class="frame-thin"/><line x1="${x}" y1="${H - 13}" x2="${x}" y2="${H - 10}" class="frame-thin"/>`); }
  for (let i = 1; i < rows; i++) { const y = 10 + ((H - 20) * i) / rows; out.push(`<line x1="10" y1="${y}" x2="13" y2="${y}" class="frame-thin"/><line x1="${W - 13}" y1="${y}" x2="${W - 10}" y2="${y}" class="frame-thin"/>`); }
  return out.join('');
}

function titleBlock(W, H, t, labels) {
  const w = 180; const h = 40; const x = W - 10 - w; const y = H - 10 - h;
  const L = (k, fallback) => esc(labels[`title.${k}`] ?? fallback);
  const cell = (cx, cy, cw, ch, label, value, big = false) => `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" class="frame-thin"/><text x="${cx + 1.2}" y="${cy + 2.8}" class="tb-label">${label}</text><text x="${cx + 1.2}" y="${cy + ch - 1.6}" class="${big ? 'tb-title' : 'tb-value'}">${esc(value)}</text>`;
  // Projection symbol (truncated cone): third angle has the circles on the right.
  const sx = x + 150; const sy = y + 28;
  const cone = `<g transform="translate(${sx} ${sy})"><path d="M 0 -3 L 9 -5 L 9 5 L 0 3 Z" class="frame-thin"/><circle cx="${t.projection === 'first' ? -6 : 18}" cy="0" r="5" class="frame-thin"/><circle cx="${t.projection === 'first' ? -6 : 18}" cy="0" r="2.6" class="frame-thin"/></g>`;
  return `<g class="title-block">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" class="frame"/>
    ${cell(x, y, 110, 14, L('name', 'Title'), t.name, true)}
    ${cell(x + 110, y, 70, 14, L('partNo', 'Part no.'), t.partNo)}
    ${cell(x, y + 14, 55, 13, L('material', 'Material'), t.material)}
    ${cell(x + 55, y + 14, 55, 13, L('mass', 'Mass'), t.mass)}
    ${cell(x + 110, y + 14, 35, 13, L('scale', 'Scale'), t.scale)}
    ${cell(x + 145, y + 14, 35, 13, L('sheet', 'Sheet'), t.sheet)}
    ${cell(x, y + 27, 37, 13, L('drawnBy', 'Drawn'), t.drawnBy)}
    ${cell(x + 37, y + 27, 37, 13, L('checkedBy', 'Checked'), t.checkedBy)}
    ${cell(x + 74, y + 27, 36, 13, L('date', 'Date'), t.date)}
    ${cell(x + 110, y + 27, 25, 13, L('revision', 'Rev.'), t.revision)}
    <rect x="${x + 135}" y="${y + 27}" width="45" height="13" class="frame-thin"/>${cone}
    ${t.company ? `<text x="${x + 2}" y="${y - 2}" class="tb-label">${esc(t.company)}</text>` : ''}
  </g>`;
}

// ───────────────────────── DXF

/** SVG path data (M, L, H, V, C, Q, A, Z — absolute) → polylines [[x, y], …]. Curves are flattened. */
export function pathPolylines(d) {
  const tokens = String(d).match(/[MLHVCQAZmlhvcqaz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const out = [];
  let cur = null; let x = 0; let y = 0; let sx = 0; let sy = 0; let cmd = null; let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    switch (cmd) {
      case 'M': x = num(); y = num(); sx = x; sy = y; cur = [[x, y]]; out.push(cur); cmd = 'L'; break;
      case 'L': x = num(); y = num(); cur?.push([x, y]); break;
      case 'H': x = num(); cur?.push([x, y]); break;
      case 'V': y = num(); cur?.push([x, y]); break;
      case 'C': {
        const [x1, y1, x2, y2, x3, y3] = [num(), num(), num(), num(), num(), num()];
        for (let k = 1; k <= 12; k++) { const t = k / 12; const u = 1 - t; cur?.push([u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3]); }
        x = x3; y = y3; break;
      }
      case 'Q': {
        const [x1, y1, x2, y2] = [num(), num(), num(), num()];
        for (let k = 1; k <= 8; k++) { const t = k / 8; const u = 1 - t; cur?.push([u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2]); }
        x = x2; y = y2; break;
      }
      case 'A': {
        const rx = num(); num(); num(); num(); num(); const ex = num(); const ey = num();
        void rx; cur?.push([ex, ey]); x = ex; y = ey; break;
      }
      case 'Z': case 'z': cur?.push([sx, sy]); x = sx; y = sy; cmd = null; break;
      default: i++;
    }
  }
  return out.filter((p) => p.length > 1);
}

/** The sheet's views as a DXF file (LINE entities on VISIBLE / HIDDEN layers, sheet mm, y up). */
export function drawingDxf(drawing, projections) {
  const [, H] = SHEETS[drawing.sheet] ?? SHEETS.A3;
  const { scale, places } = layoutViews(drawing, projections);
  const lines = [];
  const add = (layer, a, b) => lines.push(`0\nLINE\n8\n${layer}\n10\n${a[0].toFixed(4)}\n20\n${a[1].toFixed(4)}\n30\n0\n11\n${b[0].toFixed(4)}\n21\n${b[1].toFixed(4)}\n31\n0`);
  for (const v of drawing.views) {
    const p = projections.get(v.id); const place = places.get(v.id);
    if (!p || !place) continue;
    const cx = (p.box.x0 + p.box.x1) / 2; const cy = (p.box.y0 + p.box.y1) / 2;
    // SVG (y down) → sheet (y up): X = place.cx + (x − cx)·s, Y = H − (place.cy + (y + cy)·s).
    const map = ([x, y]) => [place.cx + (x - cx) * scale, H - (place.cy + (y + cy) * scale)];
    const emit = (layer, list) => { for (const d of list) for (const poly of pathPolylines(d)) for (let k = 1; k < poly.length; k++) add(layer, map(poly[k - 1]), map(poly[k])); };
    emit('VISIBLE', p.visible);
    if (drawing.showHidden !== false && v.type !== 'iso') emit('HIDDEN', p.hidden);
  }
  const [W] = SHEETS[drawing.sheet] ?? SHEETS.A3;
  for (const [a, b] of [[[10, 10], [W - 10, 10]], [[W - 10, 10], [W - 10, H - 10]], [[W - 10, H - 10], [10, H - 10]], [[10, H - 10], [10, 10]]]) add('BORDER', a, b);
  const layers = ['VISIBLE', 'HIDDEN', 'BORDER'].map((name, i) => `0\nLAYER\n2\n${name}\n70\n0\n62\n${[7, 8, 7][i]}\n6\n${name === 'HIDDEN' ? 'HIDDEN' : 'CONTINUOUS'}`).join('\n');
  return `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n3\n${layers}\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${lines.join('\n')}\n0\nENDSEC\n0\nEOF\n`;
}
