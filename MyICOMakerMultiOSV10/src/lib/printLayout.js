// Page setup and layouts of the print window, in millimetres. Pure: tested in Node.
export const PAPERS = {
  A3: [297, 420], A4: [210, 297], A5: [148, 210], B4: [257, 364], B5: [182, 257],
  Letter: [215.9, 279.4], Legal: [215.9, 355.6], Tabloid: [279.4, 431.8],
};
export const PX_PER_MM = 96 / 25.4;
export const MARGIN_PRESETS = { none: 0, narrow: 6, normal: 15, wide: 25 };

export const DEFAULT_PRINT = {
  printer: '', copies: 1,
  paper: 'A4', width: 210, height: 297, orientation: 'portrait',
  margins: { top: 15, right: 15, bottom: 15, left: 15 },
  layout: 'sizes', magnify: 4, largePercent: 100, sheetSize: 32, sheetGap: 6, cutLines: false,
  labels: true, checker: false, title: true, footer: true,
  docFont: 10, // pt, the user's guide (document mode)
};

/** Print options made valid (old saved settings, typed numbers). */
export function normalizePrint(opts) {
  const o = { ...DEFAULT_PRINT, ...(opts ?? {}), margins: { ...DEFAULT_PRINT.margins, ...(opts?.margins ?? {}) } };
  if (o.paper !== 'Custom' && !PAPERS[o.paper]) o.paper = 'A4';
  if (!['portrait', 'landscape'].includes(o.orientation)) o.orientation = 'portrait';
  if (!['sizes', 'large', 'sheet'].includes(o.layout)) o.layout = 'sizes';
  const n = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
  o.width = n(o.width, 50, 1000, 210);
  o.height = n(o.height, 50, 1000, 297);
  o.copies = Math.round(n(o.copies, 1, 999, 1));
  for (const side of ['top', 'right', 'bottom', 'left']) o.margins[side] = n(o.margins[side], 0, 60, 15);
  o.magnify = Math.round(n(o.magnify, 2, 10, 4));
  o.largePercent = n(o.largePercent, 10, 100, 100);
  o.sheetSize = n(o.sheetSize, 8, 150, 32);
  o.sheetGap = n(o.sheetGap, 0, 40, 6);
  o.docFont = Math.round(n(o.docFont, 7, 16, 10));
  return o;
}

/** The page size [width, height] in mm, turned for landscape. */
export function pageSize(opts) {
  const [w, h] = opts.paper === 'Custom' ? [opts.width, opts.height] : PAPERS[opts.paper] ?? PAPERS.A4;
  return opts.orientation === 'landscape' ? [Math.max(w, h), Math.min(w, h)] : [Math.min(w, h), Math.max(w, h)];
}

const HEADER = 14;
const FOOTER = 8;

/** The printable area inside the margins, header and footer. */
export function contentBox(opts) {
  const [pw, ph] = pageSize(opts);
  const m = opts.margins;
  const top = m.top + (opts.title ? HEADER : 0);
  return { x: m.left, y: top, w: Math.max(10, pw - m.left - m.right), h: Math.max(10, ph - top - m.bottom - (opts.footer ? FOOTER : 0)) };
}

/** The icons on the page: [{ x, y, size, label }] in mm, all inside the content box. */
export function layoutItems(input, sizes) {
  const opts = normalizePrint(input);
  const box = contentBox(opts);
  const items = [];
  if (opts.layout === 'large') {
    const size = (Math.min(box.w, box.h - 6) * opts.largePercent) / 100;
    items.push({ x: box.x + (box.w - size) / 2, y: box.y + (box.h - 6 - size) / 2, size, label: `${Math.round(size)} mm` });
    return items;
  }
  if (opts.layout === 'sheet') {
    const size = Math.min(opts.sheetSize, box.w, box.h);
    const cell = size + opts.sheetGap;
    const cols = Math.max(1, Math.floor((box.w + opts.sheetGap) / cell));
    const rows = Math.max(1, Math.floor((box.h + opts.sheetGap) / cell));
    const left = box.x + (box.w - (cols * cell - opts.sheetGap)) / 2;
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) items.push({ x: left + c * cell, y: box.y + r * cell, size, label: '' });
    return items;
  }
  // Every chosen size at its real pixel size (96 px per inch) and magnified.
  const labelRoom = opts.labels ? 5 : 1;
  let x = box.x;
  let y = box.y;
  let rowHeight = 0;
  for (const px of [...new Set(sizes)].sort((a, b) => a - b)) {
    for (const scale of [1, opts.magnify]) {
      const size = Math.min(box.w, box.h - labelRoom, (px * scale) / PX_PER_MM);
      if (x + size > box.x + box.w + 0.01) { x = box.x; y += rowHeight + labelRoom + 3; rowHeight = 0; }
      if (y + size + labelRoom > box.y + box.h + 0.01) return items;
      items.push({ x, y, size, label: scale === 1 ? `${px}×${px}` : `${px}×${px} ×${scale}` });
      x += size + 6;
      rowHeight = Math.max(rowHeight, size);
    }
    x += 3;
  }
  return items;
}
