// Page setup for printing: paper, orientation, margins, scale, pages per sheet,
// odd/even pages and colour. Pure geometry in millimetres, so the print
// dialog's preview and the printed sheets come from the same numbers: the
// renderer draws each sheet exactly as the preview shows it (print.js) and the
// host only has to put that picture on the paper.

export const PAPERS = {
  a4: { w: 210, h: 297 },
  a3: { w: 297, h: 420 },
  a5: { w: 148, h: 210 },
  b5: { w: 182, h: 257 },        // JIS B5
  letter: { w: 215.9, h: 279.4 },
  legal: { w: 215.9, h: 355.6 },
};
export const PAPER_IDS = Object.keys(PAPERS);

export const MARGINS = { none: 0, narrow: 5, normal: 10, wide: 20 };   // mm, every side
export const MARGIN_IDS = Object.keys(MARGINS);

export const PAGES_PER_SHEET = [1, 2, 4, 6, 9];
export const SCALE_MODES = ['fit', 'actual', 'custom'];
export const SCALE_MIN = 10;
export const SCALE_MAX = 400;
export const SUBSETS = ['all', 'odd', 'even'];
export const COLOR_MODES = ['color', 'gray'];
export const PRINT_ORIENTATIONS = ['auto', 'portrait', 'landscape'];

// Space between pages on one sheet.
export const CELL_GAP_MM = 4;
export const MM_PER_PT = 25.4 / 72;

export const PRINT_OPTION_DEFAULTS = Object.freeze({
  paper: 'a4',
  margin: 'normal',
  perSheet: 1,
  scaleMode: 'fit',
  scalePercent: 100,
  subset: 'all',
  color: 'color',
});

const pick = (v, list, def) => (list.includes(v) ? v : def);

export function clampScalePercent(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, v)) : 100;
}

/** Saved page-setup values made safe: anything unknown falls back to the default. */
export function normalizePrintOptions(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const d = PRINT_OPTION_DEFAULTS;
  return {
    paper: pick(o.paper, PAPER_IDS, d.paper),
    margin: pick(o.margin, MARGIN_IDS, d.margin),
    perSheet: pick(Number(o.perSheet), PAGES_PER_SHEET, d.perSheet),
    scaleMode: pick(o.scaleMode, SCALE_MODES, d.scaleMode),
    scalePercent: clampScalePercent(o.scalePercent ?? d.scalePercent),
    subset: pick(o.subset, SUBSETS, d.subset),
    color: pick(o.color, COLOR_MODES, d.color),
  };
}

/** Only the odd or even page numbers of a selection. */
export function applySubset(pages, subset) {
  if (subset === 'odd') return pages.filter((p) => p % 2 === 1);
  if (subset === 'even') return pages.filter((p) => p % 2 === 0);
  return pages.slice();
}

/** The paper in mm, turned for landscape. */
export function paperSize(paper, landscape = false) {
  const p = PAPERS[paper] || PAPERS.a4;
  return landscape ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}

/** The printable box inside the margins. */
export function contentBox(paper, landscape, margin) {
  const { w, h } = paperSize(paper, landscape);
  const m = MARGINS[margin] ?? MARGINS.normal;
  return { x: m, y: m, w: Math.max(1, w - 2 * m), h: Math.max(1, h - 2 * m) };
}

// The column × row split of a sheet: of the ways to lay out n pages, the one
// where a page of this shape comes out largest.
export function gridFor(n, box, aspect = 210 / 297) {
  const count = Math.max(1, n);
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 210 / 297;
  let best = { cols: 1, rows: count, size: -1 };
  for (let cols = 1; cols <= count; cols++) {
    if (count % cols) continue;
    const rows = count / cols;
    const cw = (box.w - CELL_GAP_MM * (cols - 1)) / cols;
    const ch = (box.h - CELL_GAP_MM * (rows - 1)) / rows;
    // The page's area when fitted into one cell.
    const s = Math.min(cw / a, ch);
    const size = s * s * a;
    if (size > best.size + 1e-9) best = { cols, rows, size };
  }
  return { cols: best.cols, rows: best.rows };
}

/** The cells of one sheet, in reading order (mm). */
export function sheetCells({ paper, landscape, margin, perSheet, aspect }) {
  const box = contentBox(paper, landscape, margin);
  const n = pick(Number(perSheet), PAGES_PER_SHEET, 1);
  const { cols, rows } = gridFor(n, box, aspect);
  const cw = (box.w - CELL_GAP_MM * (cols - 1)) / cols;
  const ch = (box.h - CELL_GAP_MM * (rows - 1)) / rows;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ x: box.x + c * (cw + CELL_GAP_MM), y: box.y + r * (ch + CELL_GAP_MM), w: cw, h: ch });
    }
  }
  return { cols, rows, cells, box };
}

/**
 * Where a page of `pw`×`ph` mm lands in a cell: fit = as large as fits,
 * actual = its real size, custom = its real size × percent. Always centred;
 * a page larger than the cell is cut at the cell's edge (clip).
 */
export function placePage(cell, pw, ph, { scaleMode = 'fit', scalePercent = 100 } = {}) {
  const fit = Math.min(cell.w / Math.max(0.01, pw), cell.h / Math.max(0.01, ph));
  const s = scaleMode === 'actual' ? 1 : scaleMode === 'custom' ? clampScalePercent(scalePercent) / 100 : fit;
  const w = pw * s;
  const h = ph * s;
  return { x: cell.x + (cell.w - w) / 2, y: cell.y + (cell.h - h) / 2, w, h, scale: s, clip: { ...cell } };
}

/** "auto" orientation: whichever puts the pages on the paper larger. */
export function resolveOrientation(orientation, { paper = 'a4', margin = 'normal', perSheet = 1, aspect = 210 / 297 } = {}) {
  if (orientation === 'landscape') return true;
  if (orientation === 'portrait') return false;
  const size = (landscape) => {
    const box = contentBox(paper, landscape, margin);
    const { cols, rows } = gridFor(perSheet, box, aspect);
    const cw = (box.w - CELL_GAP_MM * (cols - 1)) / cols;
    const ch = (box.h - CELL_GAP_MM * (rows - 1)) / rows;
    return Math.min(cw / aspect, ch);
  };
  return size(true) > size(false) + 1e-6;
}

/** The pages split into sheets: [[1,2],[3,4],[5]] for two per sheet. */
export function planSheets(pages, perSheet = 1) {
  const n = Math.max(1, Number(perSheet) || 1);
  const out = [];
  for (let i = 0; i < pages.length; i += n) out.push(pages.slice(i, i + n));
  return out;
}

/**
 * Everything the dialog, the preview and the printer need: the pages that
 * print (after odd/even), how they fall on sheets, the paper and its turn.
 * `aspect` is the first page's width / height.
 */
export function printPlan({ pages, options, orientation = 'auto', aspect = 210 / 297 }) {
  const o = normalizePrintOptions(options);
  const list = applySubset(pages || [], o.subset);
  const landscape = resolveOrientation(orientation, { ...o, aspect });
  return {
    options: o,
    pages: list,
    sheets: planSheets(list, o.perSheet),
    landscape,
    paper: paperSize(o.paper, landscape),
    aspect,
  };
}

/** One sheet's pictures: each page's rectangle (mm) from its size in points. */
export function layoutSheet(plan, sheetPages, sizesPt) {
  const { options: o, landscape, aspect } = plan;
  const { cells } = sheetCells({ paper: o.paper, landscape, margin: o.margin, perSheet: o.perSheet, aspect });
  return sheetPages.map((page, i) => {
    const size = sizesPt[i] || { w: 595, h: 842 };
    return { page, ...placePage(cells[i], size.w * MM_PER_PT, size.h * MM_PER_PT, o) };
  });
}

/** CSS page size for the browser's print window, e.g. "210mm 297mm". */
export function cssPageSize(paper) {
  const r = (n) => Math.round(n * 10) / 10;
  return `${r(paper.w)}mm ${r(paper.h)}mm`;
}
