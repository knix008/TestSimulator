// Print layout: drawings → pages. Each page has the drawing frame and a title
// block (bottom right, like KS/ISO drawing sheets). "Fit" scales the content
// onto one page; a fixed scale (1:2, 2:1, …) tiles it over as many pages as
// it needs. All sizes are millimetres on paper.
import { isVisible } from './drawing.js';
import { boxOfEntities } from './entities.js';
import { boxHeight, boxWidth } from './geometry.js';
import { entitiesSvg, escapeXml } from './svg.js';

export const PAPERS = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A2: { width: 420, height: 594 },
  A1: { width: 594, height: 841 },
  A0: { width: 841, height: 1189 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
};
export const MARGINS = { narrow: 5, normal: 10, wide: 20 };
export const SCALES = ['fit', '10:1', '5:1', '2:1', '1:1', '1:2', '1:5', '1:10', '1:20', '1:50', '1:100'];
export const RANGES = ['all', 'current', 'custom'];
export const TITLE_BLOCK = { width: 170, height: 32 };

export function defaultPrintOptions() {
  return {
    range: 'current',
    layers: null,
    selectedOnly: false,
    paper: 'A4',
    orientation: 'landscape',
    margin: 'normal',
    scale: 'fit',
    frame: true,
    titleBlock: true,
    monochrome: true,
  };
}

export function pageSize(options) {
  const paper = PAPERS[options.paper] ?? PAPERS.A4;
  const landscape = options.orientation === 'landscape';
  return { width: landscape ? paper.height : paper.width, height: landscape ? paper.width : paper.height };
}

/** "1:2" → 0.5 paper mm per drawing mm; "2:1" → 2; anything else → null (fit). */
export function parseScale(text) {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(text ?? '').trim());
  if (!match) return null;
  const value = Number(match[1]) / Number(match[2]);
  return value > 0 && Number.isFinite(value) ? value : null;
}

/** Readable "1:x" or "x:1" for a factor. */
export function scaleLabel(k) {
  if (!(k > 0)) return '-';
  if (k >= 1) return `${Math.round(k * 100) / 100}:1`;
  return `1:${Math.round((1 / k) * 100) / 100}`;
}

/**
 * What to print, from the print window's range choice:
 *   all     — every open drawing
 *   current — the drawing in the active tab
 *   custom  — the active drawing, only the chosen layers and/or the selected entities
 * Returns [{ drawingIndex, drawing, entities }].
 */
export function selectContent(drawings, currentIndex, options, selectedIds = []) {
  const visible = (drawing) => drawing.entities.filter((entity) => isVisible(drawing, entity));
  if (options.range === 'all') return drawings.map((drawing, drawingIndex) => ({ drawingIndex, drawing, entities: visible(drawing) }));
  const index = drawings[currentIndex] ? currentIndex : 0;
  const drawing = drawings[index];
  if (!drawing) return [];
  if (options.range === 'current') return [{ drawingIndex: index, drawing, entities: visible(drawing) }];
  const layers = options.layers ? new Set(options.layers) : null;
  const selected = options.selectedOnly ? new Set(selectedIds) : null;
  const entities = visible(drawing).filter((entity) => (!layers || layers.has(entity.layer)) && (!selected || selected.has(entity.id)));
  return [{ drawingIndex: index, drawing, entities }];
}

/** Pages for the chosen content. */
export function paginate(contents, options) {
  const size = pageSize(options);
  const margin = MARGINS[options.margin] ?? MARGINS.normal;
  const inner = { x: margin, y: margin, width: size.width - margin * 2, height: size.height - margin * 2 };
  const block = options.titleBlock ? { width: Math.min(TITLE_BLOCK.width, inner.width), height: TITLE_BLOCK.height } : { width: 0, height: 0 };
  // Content stays clear of the title block: above it (fit), or the whole sheet minus its strip.
  const area = { x: inner.x + 4, y: inner.y + 4, width: inner.width - 8, height: inner.height - 8 - block.height };
  const fixed = parseScale(options.scale);
  const pages = [];
  for (const content of contents) {
    const box = boxOfEntities(content.entities);
    if (!box) {
      pages.push({ ...content, box: null, k: 1, area, tile: null });
      continue;
    }
    const width = Math.max(boxWidth(box), 1e-6);
    const height = Math.max(boxHeight(box), 1e-6);
    if (!fixed) {
      const k = Math.min(area.width / width, area.height / height);
      const view = {
        minX: box.minX - (area.width / k - width) / 2, maxX: box.maxX + (area.width / k - width) / 2,
        minY: box.minY - (area.height / k - height) / 2, maxY: box.maxY + (area.height / k - height) / 2,
      };
      pages.push({ ...content, box: view, k, area, tile: null });
      continue;
    }
    const k = fixed;
    const columns = Math.max(1, Math.ceil((width * k) / area.width - 1e-9));
    const rows = Math.max(1, Math.ceil((height * k) / area.height - 1e-9));
    // Centre the content inside the tiled area.
    const spanX = (columns * area.width) / k;
    const spanY = (rows * area.height) / k;
    const left = box.minX - (spanX - width) / 2;
    const top = box.maxY + (spanY - height) / 2;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const minX = left + (column * area.width) / k;
        const maxY = top - (row * area.height) / k;
        pages.push({ ...content, box: { minX, maxX: minX + area.width / k, maxY, minY: maxY - area.height / k }, k, area, tile: { row, column, rows, columns } });
      }
    }
  }
  pages.forEach((page, index) => { page.number = index + 1; page.total = pages.length; });
  return { pages, size, margin, inner, block };
}

const n = (value) => (Math.round(value * 100) / 100).toString();

/** Third-angle projection symbol (truncated cone views), at (x, y), `s` mm high. */
function projectionSymbol(x, y, s) {
  const r1 = s / 2;
  const r2 = s / 4;
  return `<g fill="none" stroke="#000" stroke-width="0.25">
    <path d="M${n(x)} ${n(y + s / 2 - r2)}L${n(x + s)} ${n(y)}L${n(x + s)} ${n(y + s)}L${n(x)} ${n(y + s / 2 + r2)}Z"/>
    <circle cx="${n(x + s * 1.9)}" cy="${n(y + s / 2)}" r="${n(r1)}"/><circle cx="${n(x + s * 1.9)}" cy="${n(y + s / 2)}" r="${n(r2)}"/>
  </g>`;
}

/**
 * SVG of one page (width/height in mm).
 * labels: { title, number, scale, material, drawnBy, date, company, sheet, units }
 */
export function pageSvg(page, layout, options, { fonts = {}, labels = {}, date = new Date().toLocaleDateString() } = {}) {
  const { size, inner, block } = layout;
  const drawing = page.drawing;
  const parts = [];
  parts.push(`<rect width="${n(size.width)}" height="${n(size.height)}" fill="#ffffff"/>`);
  const clipId = `clip-${page.number}`;
  parts.push(`<defs><clipPath id="${clipId}"><rect x="${n(inner.x)}" y="${n(inner.y)}" width="${n(inner.width)}" height="${n(inner.height)}"/></clipPath></defs>`);
  if (page.box) {
    parts.push(`<g clip-path="url(#${clipId})" stroke-linecap="round">${entitiesSvg(drawing, {
      entities: page.entities, box: page.box, k: page.k, x0: page.area.x, y0: page.area.y, ink: '#000000', monochrome: options.monochrome, fonts,
    })}</g>`);
  }
  if (options.frame) parts.push(`<rect x="${n(inner.x)}" y="${n(inner.y)}" width="${n(inner.width)}" height="${n(inner.height)}" fill="none" stroke="#000" stroke-width="0.7"/>`);
  if (options.titleBlock) {
    const x = inner.x + inner.width - block.width;
    const y = inner.y + inner.height - block.height;
    const w = block.width;
    const h = block.height;
    const row = h / 4;
    const family = escapeXml(fonts.family || 'sans-serif');
    const text = (tx, ty, value, sizeMm = 2.5, weight = 400, anchor = 'start') => `<text x="${n(tx)}" y="${n(ty)}" font-family="${family}" font-size="${n(sizeMm)}" font-weight="${weight}" text-anchor="${anchor}" fill="#000">${escapeXml(value)}</text>`;
    const c1 = x + w * 0.18;
    const c2 = x + w * 0.62;
    const c3 = x + w * 0.78;
    const sheet = drawing.sheet ?? {};
    const scale = options.scale === 'fit' ? scaleLabel(page.k) : options.scale;
    parts.push(`<g>
      <rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="#ffffff" stroke="#000" stroke-width="0.7"/>
      <path d="M${n(x)} ${n(y + row)}H${n(x + w)}M${n(x)} ${n(y + row * 2)}H${n(x + w)}M${n(x)} ${n(y + row * 3)}H${n(x + w)}M${n(c1)} ${n(y)}V${n(y + h)}M${n(c2)} ${n(y)}V${n(y + h)}M${n(c3)} ${n(y)}V${n(y + h)}" stroke="#000" stroke-width="0.35" fill="none"/>
      ${text(x + 1.5, y + row * 0.68, labels.title ?? 'Title', 2)}${text(c1 + 1.5, y + row * 0.72, drawing.title, 3.2, 700)}
      ${text(c2 + 1.5, y + row * 0.68, labels.scale ?? 'Scale', 2)}${text(c3 + 1.5, y + row * 0.72, scale, 2.8)}
      ${text(x + 1.5, y + row * 1.68, labels.number ?? 'Drawing no.', 2)}${text(c1 + 1.5, y + row * 1.72, sheet.number || '-', 2.8)}
      ${text(c2 + 1.5, y + row * 1.68, labels.sheet ?? 'Sheet', 2)}${text(c3 + 1.5, y + row * 1.72, `${page.number} / ${page.total}`, 2.8)}
      ${text(x + 1.5, y + row * 2.68, labels.material ?? 'Material', 2)}${text(c1 + 1.5, y + row * 2.72, sheet.material || '-', 2.8)}
      ${text(c2 + 1.5, y + row * 2.68, labels.units ?? 'Units', 2)}${text(c3 + 1.5, y + row * 2.72, 'mm', 2.8)}
      ${text(x + 1.5, y + row * 3.68, labels.drawnBy ?? 'Drawn by', 2)}${text(c1 + 1.5, y + row * 3.72, drawing.author || '-', 2.8)}
      ${text(c2 + 1.5, y + row * 3.68, labels.date ?? 'Date', 2)}${text(c3 + 1.5, y + row * 3.72, date, 2.6)}
      ${sheet.company ? text(x + w - 1.5, y - 1.5, sheet.company, 2.6, 700, 'end') : ''}
    </g>`);
    parts.push(projectionSymbol(x - 22, y + h - 9, 7));
  }
  if (page.tile) {
    const family = escapeXml(fonts.family || 'sans-serif');
    parts.push(`<text x="${n(inner.x + 2)}" y="${n(inner.y + 4)}" font-family="${family}" font-size="2.4" fill="#000">${escapeXml(`${labels.tile ?? 'Tile'} ${page.tile.row + 1}-${page.tile.column + 1} (${page.tile.rows}×${page.tile.columns})`)}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(size.width)}mm" height="${n(size.height)}mm" viewBox="0 0 ${n(size.width)} ${n(size.height)}">${parts.join('')}</svg>`;
}
