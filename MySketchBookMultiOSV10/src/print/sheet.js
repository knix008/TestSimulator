// One printed sheet as an SVG string (pure: the print window previews and
// prints it, tests read it). Drawn in millimetres on white paper: the border,
// the picture (3D view, plan or scene, rendered by the main window), a scale bar
// on plans, and the title block — project, page, scale, date, sheet n / total.
import { scaleBarLength, scaleLabel } from './layout.js';
import { DIM_ROW_MM, dimensionChains, placeLabels, textWidth, wallCorners } from './dimensions.js';
import { formatLength } from '../engine/document.js';

export const MM_PX = 96 / 25.4;
export const SHEET_FONT = "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Segoe UI', sans-serif";
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const n = (v) => Number(v).toFixed(2);

/**
 * Cuts text to about `maxMm` wide at font size `size` (mm; CJK counts as wide), with "…". A cut falls
 * between words when a word break is near (not inside a word), and drops the dangling separators.
 */
export function fitText(text, size, maxMm) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (textWidth(s, size) <= maxMm) return s;
  const room = maxMm - textWidth('…', size);
  const chars = [...s];
  let i = 0;
  let width = 0;
  while (i < chars.length && width + textWidth(chars[i], size) <= room) { width += textWidth(chars[i], size); i++; }
  let head = chars.slice(0, i).join('');
  const space = head.lastIndexOf(' ');
  if (space > 0 && space >= head.length * 0.6) head = head.slice(0, space);
  head = head.replace(/[\s\-–—_,.:;·/|(]+$/u, '');
  return `${head}…`;
}

/**
 * A line in a cell: its own size when it fits, else a smaller size down to `minSize`, and only then
 * cut (fitText). { text, size }.
 */
export function fitLine(text, size, maxMm, minSize = size) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  for (let k = size; k >= minSize - 1e-9; k -= 0.2) if (textWidth(s, k) <= maxMm) return { text: s, size: Math.round(k * 100) / 100 };
  return { text: fitText(s, minSize, maxMm), size: minSize };
}

/** The page's title: "Floor plan — 1F", "3D view", the scene's name, "Summary". */
export function pageTitle(page, t) {
  if (page.type === 'view') return t('print3d.page.view');
  if (page.type === 'plan') return t('print3d.page.plan', { name: page.name ?? '' });
  if (page.type === 'scene') return t('print3d.page.scene', { name: page.name ?? '' });
  return t('print3d.page.summary');
}

function scaleBar(area, scale, t) {
  const metres = scaleBarLength(scale, Math.min(50, area.w / 3));
  const len = (metres * 1000) / scale;
  const x = area.x + 4;
  const y = area.y + area.h - 7;
  const parts = 4;
  const seg = len / parts;
  let bars = '';
  for (let i = 0; i < parts; i++) bars += `<rect x="${n(x + i * seg)}" y="${n(y)}" width="${n(seg)}" height="1.6" fill="${i % 2 ? '#ffffff' : '#222222'}" stroke="#222222" stroke-width="0.2"/>`;
  const label = metres >= 1 ? `${metres} m` : `${Math.round(metres * 1000)} mm`;
  return `<g class="scale-bar"><rect x="${n(x - 2)}" y="${n(y - 4.2)}" width="${n(len + 16)}" height="8" fill="#ffffff" fill-opacity="0.85"/>${bars}`
    + `<text x="${n(x)}" y="${n(y - 1)}" font-size="2.4" fill="#222">0</text><text x="${n(x + len)}" y="${n(y - 1)}" font-size="2.4" fill="#222" text-anchor="middle">${esc(label)}</text>`
    + `<text x="${n(x + len + 3)}" y="${n(y + 1.5)}" font-size="2.6" font-weight="700" fill="#222">${esc(scaleLabel(scale))}</text><title>${esc(t('print3d.scaleBar'))}</title></g>`;
}

// ───────────────────────── plan overlay: dimensions, opening widths, room labels

const DIM_INK = '#1d2a3a';
const DIM_FONT = 2.2;
const OPEN_FONT = 1.9;

/** Paper mm ↔ plan metres for a plan sheet: the picture covers the tile's camera rectangle exactly. */
export function planToPaper(camera, area) {
  const { cx, cz, halfW, halfH } = camera;
  const kx = area.w / (2 * halfW);
  const ky = area.h / (2 * halfH);
  return { x: (x) => area.x + (x - (cx - halfW)) * kx, y: (z) => area.y + (z - (cz - halfH)) * ky, mmPerM: kx };
}

/** A length as dimension text: whole millimetres ("3,600") or the document's other units, no suffix. */
export function dimText(metres, units = 'mm') {
  const u = units === 'cm' || units === 'm' ? 'mm' : units;
  return formatLength(metres, u, { suffix: false });
}

/** One dimension line (a chain or the overall) on paper. */
function dimensionLine(dim, map, units) {
  const off = DIM_ROW_MM[dim.row] ?? DIM_ROW_MM[0];
  const horizontal = dim.side === 'top' || dim.side === 'bottom';
  const outward = dim.side === 'top' || dim.side === 'left' ? -1 : 1;
  const face = horizontal ? map.y(dim.base) : map.x(dim.base);
  const line = face + outward * off;
  const along = dim.ticks.map((v) => (horizontal ? map.x(v) : map.y(v)));
  const pt = (a, b) => (horizontal ? [a, b] : [b, a]);
  const seg = (a1, b1, a2, b2, w = 0.18) => { const [x1, y1] = pt(a1, b1); const [x2, y2] = pt(a2, b2); return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${DIM_INK}" stroke-width="${w}"/>`; };
  let g = seg(along[0] - 1.2, line, along[along.length - 1] + 1.2, line);
  for (const a of along) {
    g += seg(a, face + outward * 1.5, a, line + outward * 1.2, 0.13);
    // Architectural tick: a short slash across the line.
    const [x, y] = pt(a, line);
    g += `<line x1="${n(x - 0.7)}" y1="${n(y + 0.7)}" x2="${n(x + 0.7)}" y2="${n(y - 0.7)}" stroke="${DIM_INK}" stroke-width="0.32"/>`;
  }
  let lift = 0;
  for (let i = 0; i + 1 < along.length; i++) {
    const text = dimText(dim.ticks[i + 1] - dim.ticks[i], units);
    const span = Math.abs(along[i + 1] - along[i]);
    const tw = textWidth(text, DIM_FONT);
    // Short segments: the figure steps out of the line (alternately) so neighbours do not run together.
    lift = tw + 0.6 > span ? (lift ? 0 : 2.6) : 0;
    const mid = (along[i] + along[i + 1]) / 2;
    // The figure sits on the line's paper-top (or, rotated, its left); stepped out it moves away from the building.
    const off = lift ? (outward < 0 ? -lift : lift + 0.4) : 0;
    const [x, y] = pt(mid, line - 0.7 + off);
    g += horizontal
      ? `<text x="${n(x)}" y="${n(y)}" font-size="${DIM_FONT}" fill="${DIM_INK}" text-anchor="middle">${esc(text)}</text>`
      : `<text x="${n(x)}" y="${n(y)}" font-size="${DIM_FONT}" fill="${DIM_INK}" text-anchor="middle" transform="rotate(-90 ${n(x)} ${n(y)})">${esc(text)}</text>`;
  }
  return `<g class="dim dim-${dim.kind}" data-side="${dim.side}">${g}</g>`;
}

/**
 * Everything drawn over a plan picture, clipped to the drawing area: the dimension lines, in detailed
 * mode the opening widths and room sizes, and the room labels (nudged off walls and each other).
 */
export function planOverlay(sheet, area, index = 0) {
  const plan = sheet.plan;
  const map = planToPaper(sheet.request.camera, area);
  const units = plan.units ?? 'mm';
  const detailed = sheet.dims === 'detailed';
  let g = '';
  for (const dim of dimensionChains(plan.walls ?? [], sheet.dims ?? 'none')) g += dimensionLine(dim, map, units);
  const toPaper = ([x, z]) => [map.x(x), map.y(z)];
  const obstacles = (plan.walls ?? []).map((w) => wallCorners(w).map(toPaper));
  if (detailed) {
    const box = (plan.walls ?? []).reduce((b, w) => [b[0] + w.a[0] + w.b[0], b[1] + w.a[1] + w.b[1], b[2] + 2], [0, 0, 0]);
    const centre = box[2] ? [box[0] / box[2], box[1] / box[2]] : [0, 0];
    for (const o of plan.openings ?? []) {
      // The width beside the opening; windows: on the side away from the middle of the plan (outside on façades).
      // Doors: on the face the leaf does not open to (clear of the swing arc).
      let nx = -o.uz; let nz = o.ux;
      if (o.swing ? o.swing > 0 : (o.x - centre[0]) * nx + (o.z - centre[1]) * nz < 0) { nx = -nx; nz = -nz; }
      const d = ((o.t ?? 0.15) / 2) * map.mmPerM + 1.9;
      const [px, py] = toPaper([o.x, o.z]);
      const x = px + nx * d; const y = py + nz * d;
      let angle = (Math.atan2(o.uz, o.ux) * 180) / Math.PI;
      // Readable from the bottom or the right of the sheet, as drawings are read.
      if (angle >= 90) angle -= 180; if (angle < -90) angle += 180;
      const text = dimText(o.width, units);
      g += `<text class="opening-width" x="${n(x)}" y="${n(y + OPEN_FONT * 0.35)}" font-size="${OPEN_FONT}" fill="#2b5b8a" text-anchor="middle" transform="rotate(${n(angle)} ${n(x)} ${n(y)})">${esc(text)}</text>`;
      const hw = textWidth(text, OPEN_FONT) / 2 + 0.3; const hh = OPEN_FONT * 0.6;
      const c = Math.cos((angle * Math.PI) / 180); const s = Math.sin((angle * Math.PI) / 180);
      obstacles.push([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([u, v]) => [x + u * c - v * s, y + u * s + v * c]));
    }
  }
  const labels = [];
  for (const room of plan.rooms ?? []) {
    const lines = [];
    if (room.name) lines.push({ text: room.name, size: 2.8, weight: 600, fill: '#111' });
    if (room.area) lines.push({ text: room.area, size: 2.3, weight: 400, fill: '#333' });
    if (detailed && room.size) lines.push({ text: `${dimText(room.size[0], units)} × ${dimText(room.size[1], units)}`, size: 2, weight: 400, fill: '#2b5b8a' });
    if (!lines.length) continue;
    const [x, y] = toPaper(room.centre);
    const w = Math.max(...lines.map((l) => textWidth(l.text, l.size))) + 1.6;
    const h = lines.reduce((sum, l) => sum + l.size * 1.18, 0) + 1;
    labels.push({ x, y, w, h, lines, region: room.points.map(toPaper) });
  }
  const spots = placeLabels(labels, obstacles);
  labels.forEach((l, i) => {
    const { x, y } = spots[i];
    const top = y - l.h / 2;
    let out = `<rect x="${n(x - l.w / 2)}" y="${n(top)}" width="${n(l.w)}" height="${n(l.h)}" rx="0.6" fill="#ffffff" fill-opacity="0.8"/>`;
    let ty = top + 0.5;
    for (const line of l.lines) {
      ty += line.size * 1.18;
      out += `<text x="${n(x)}" y="${n(ty - line.size * 0.26)}" font-size="${line.size}" font-weight="${line.weight}" fill="${line.fill}" text-anchor="middle">${esc(line.text)}</text>`;
    }
    g += `<g class="room-label" data-moved="${spots[i].moved}">${out}</g>`;
  });
  const id = `plan-clip-${index}`;
  return `<clipPath id="${id}"><rect x="${n(area.x)}" y="${n(area.y)}" width="${n(area.w)}" height="${n(area.h)}"/></clipPath><g class="plan-overlay" clip-path="url(#${id})">${g}</g>`;
}

function titleBlock(block, cells) {
  const total = cells.reduce((sum, c) => sum + c.weight, 0);
  let x = block.x;
  let out = `<rect x="${n(block.x)}" y="${n(block.y)}" width="${n(block.w)}" height="${n(block.h)}" fill="#ffffff" stroke="#222" stroke-width="0.35"/>`;
  cells.forEach((cell, i) => {
    const w = (block.w * cell.weight) / total;
    if (i) out += `<line x1="${n(x)}" y1="${n(block.y)}" x2="${n(x)}" y2="${n(block.y + block.h)}" stroke="#222" stroke-width="0.25"/>`;
    const size = cell.big ? 5 : 3.6;
    // Long values shrink a little first (to 70 %), then are cut between words.
    const line = fitLine(cell.value, size, w - 4, size * 0.7);
    out += `<text x="${n(x + 2)}" y="${n(block.y + 4)}" font-size="2.2" fill="#666">${esc(cell.label)}</text>`;
    out += `<text x="${n(x + 2)}" y="${n(block.y + (cell.sub ? 9.6 : 11.4))}" font-size="${n(line.size)}" font-weight="${cell.big ? 700 : 500}" fill="#111">${esc(line.text)}<title>${esc(cell.value)}</title></text>`;
    if (cell.sub) out += `<text x="${n(x + 2)}" y="${n(block.y + 13.8)}" font-size="2.5" fill="#555">${esc(fitText(cell.sub, 2.5, w - 4))}</text>`;
    x += w;
  });
  return out;
}

function summaryBody(area, summary, t) {
  const s = summary ?? {};
  const line = 5.2;
  let out = `<text x="${n(area.x)}" y="${n(area.y + 7)}" font-size="6" font-weight="700" fill="#111">${esc(fitText(s.name || t('print3d.untitled'), 6, area.w))}</text>`;
  const facts = s.facts ?? [];
  facts.forEach(([label, value], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = area.x + (area.w / 3) * col;
    const y = area.y + 15 + row * 9;
    out += `<text x="${n(x)}" y="${n(y)}" font-size="2.5" fill="#666">${esc(label)}</text><text x="${n(x)}" y="${n(y + 4.4)}" font-size="3.8" font-weight="600" fill="#111">${esc(fitText(value, 3.8, area.w / 3 - 3))}</text>`;
  });
  const top = area.y + 15 + Math.ceil(facts.length / 3) * 9 + 4;
  const table = (x, w, title, head, rows) => {
    let g = `<text x="${n(x)}" y="${n(top)}" font-size="3.6" font-weight="700" fill="#111">${esc(title)}</text>`;
    g += `<line x1="${n(x)}" y1="${n(top + 2)}" x2="${n(x + w)}" y2="${n(top + 2)}" stroke="#222" stroke-width="0.3"/>`;
    const cols = head.length;
    const colX = (c) => (c === 0 ? x : x + w * (cols === 3 ? [0, 0.56, 1][c] : [0, 1][c]));
    head.forEach((h, c) => { g += `<text x="${n(colX(c) + (c ? -0.5 : 0.5))}" y="${n(top + 6.5)}" font-size="2.5" fill="#666" ${c ? 'text-anchor="end"' : ''}>${esc(h)}</text>`; });
    const room = Math.max(1, Math.floor((area.y + area.h - (top + 8)) / line));
    const shown = rows.length > room ? rows.slice(0, room - 1) : rows;
    shown.forEach((r, i) => {
      const y = top + 8 + (i + 1) * line - 1.2;
      if (i % 2 === 0) g += `<rect x="${n(x)}" y="${n(y - 3.8)}" width="${n(w)}" height="${n(line)}" fill="#f2f4f7"/>`;
      r.forEach((v, c) => {
        const anchor = c && (cols === 2 || c === 2) ? 'text-anchor="end"' : '';
        const xx = c === 0 ? x + 0.8 : cols === 3 && c === 1 ? x + w * 0.56 + 1 : x + w - 0.8;
        g += `<text x="${n(xx)}" y="${n(y)}" font-size="3" fill="#111" ${anchor}>${esc(fitText(v, 3, c === 0 ? w * 0.54 : w * 0.4))}</text>`;
      });
    });
    if (shown.length < rows.length) g += `<text x="${n(x + 0.8)}" y="${n(top + 8 + (shown.length + 1) * line - 1.2)}" font-size="3" fill="#666">${esc(t('print3d.more', { n: rows.length - shown.length }))}</text>`;
    if (!rows.length) g += `<text x="${n(x + 0.8)}" y="${n(top + 8 + line - 1.2)}" font-size="3" fill="#888">${esc(t('print3d.none'))}</text>`;
    return g;
  };
  const gap = 8;
  const w = (area.w - gap) / 2;
  out += table(area.x, w, t('print3d.rooms'), [t('print3d.room'), t('print3d.level'), t('print3d.area')], (s.rooms ?? []).map((r) => [r.name, r.level, r.area]));
  out += table(area.x + w + gap, w, t('print3d.furniture'), [t('print3d.item'), t('print3d.count.col')], (s.furniture ?? []).map((f) => [f.name, String(f.count)]));
  return out;
}

/**
 * The SVG of one sheet. `sheet` = a layoutSheets() entry, `geometry` = sheetGeometry(), `image` = the
 * picture's data URL (or null while it is rendered), `ctx` = { t, index, total, project, date, author,
 * titleText, scaleBar, titleBlock, summary }.
 */
export function sheetSvg(sheet, geometry, image, ctx) {
  const { t } = ctx;
  const { width, height, frame, area, block } = geometry;
  const title = pageTitle(sheet.page, t) + (sheet.tile && sheet.tile.rows * sheet.tile.cols > 1 ? ` (${sheet.tile.row + 1}-${sheet.tile.col + 1})` : '');
  let body = '';
  if (sheet.page.type === 'summary') body = summaryBody(area, ctx.summary, t);
  else if (sheet.empty) body = `<text x="${n(area.x + area.w / 2)}" y="${n(area.y + area.h / 2)}" font-size="4" fill="#888" text-anchor="middle">${esc(t('print3d.emptyLevel'))}</text>`;
  else if (image) body = `<image href="${esc(image)}" x="${n(area.x)}" y="${n(area.y)}" width="${n(area.w)}" height="${n(area.h)}" preserveAspectRatio="xMidYMid meet"/>`;
  else body = `<rect x="${n(area.x)}" y="${n(area.y)}" width="${n(area.w)}" height="${n(area.h)}" fill="#eef0f3"/><text x="${n(area.x + area.w / 2)}" y="${n(area.y + area.h / 2)}" font-size="4" fill="#889" text-anchor="middle" class="sheet-pending">${esc(t('print3d.rendering'))}</text>`;
  if (sheet.plan && sheet.request?.camera && image) body += planOverlay(sheet, area, ctx.index ?? 0);
  if (sheet.scale && ctx.scaleBar !== false && image) body += scaleBar(area, sheet.scale, t);
  const border = ctx.titleBlock !== false ? `<rect x="${n(frame.x)}" y="${n(frame.y)}" width="${n(frame.w)}" height="${n(frame.h)}" fill="none" stroke="#222" stroke-width="0.5"/>` : '';
  const scaleText = sheet.scale ? scaleLabel(sheet.scale) : sheet.page.type === 'summary' ? '—' : t('print3d.noScale');
  const tb = block ? titleBlock(block, [
    { label: t('print3d.tb.project'), value: ctx.titleText || ctx.project || t('print3d.untitled'), sub: ctx.author, weight: 34, big: true },
    { label: t('print3d.tb.drawing'), value: title, weight: 30 },
    { label: t('print3d.tb.scale'), value: scaleText, weight: 12 },
    { label: t('print3d.tb.date'), value: ctx.date ?? '', weight: 12 },
    { label: t('print3d.tb.sheet'), value: `${ctx.index + 1} / ${ctx.total}`, weight: 12 },
  ]) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width * MM_PX)}" height="${Math.round(height * MM_PX)}" viewBox="0 0 ${n(width)} ${n(height)}" font-family="${esc(SHEET_FONT)}"><rect width="${n(width)}" height="${n(height)}" fill="#ffffff"/>${body}${border}${tb}</svg>`;
}
