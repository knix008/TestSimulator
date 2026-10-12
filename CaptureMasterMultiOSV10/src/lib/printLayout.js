// Page layout for printing, in millimetres. The print dialog draws its preview
// and the printed page from the same layout, so the preview is what prints.

export const PAPERS = [
  { id: 'a4', label: 'A4', w: 210, h: 297 },
  { id: 'a3', label: 'A3', w: 297, h: 420 },
  { id: 'a5', label: 'A5', w: 148, h: 210 },
  { id: 'b4', label: 'B4 (JIS)', w: 257, h: 364 },
  { id: 'b5', label: 'B5 (JIS)', w: 182, h: 257 },
  { id: 'letter', label: 'Letter', w: 215.9, h: 279.4 },
  { id: 'legal', label: 'Legal', w: 215.9, h: 355.6 },
];

export const MARGINS = { none: 0, narrow: 6.35, normal: 12.7, wide: 25.4 };
export const HEADER_MM = 7;
/** Screen pixels are taken as 96 per inch. */
export const MM_PER_PX = 25.4 / 96;

export const DEFAULT_PRINT_SETTINGS = {
  printer: null,          // null = the system default
  copies: 1,
  paper: 'a4',
  orientation: 'auto',    // auto | portrait | landscape
  layout: 'fit',          // fit | fill | actual | custom
  scale: 100,
  margin: 'normal',
  color: 'color',         // color | gray
  duplex: 'one',          // one | long | short
  header: false,
};

/** The documents a scope selects, in tab order. */
export function docsInScope(docs, scope, currentId, picked) {
  if (scope === 'current') return docs.filter((d) => d.id === currentId);
  if (scope === 'custom') return docs.filter((d) => picked.has(d.id));
  return docs;
}

/** The part of a document that goes on paper, in image pixels. */
export function sourceRect(doc, selectionOnly, currentId) {
  const sel = selectionOnly && doc.id === currentId ? doc.selection : null;
  if (sel && sel.w > 0 && sel.h > 0) return { x: sel.x, y: sel.y, w: sel.w, h: sel.h };
  return { x: 0, y: 0, w: doc.width || 1, h: doc.height || 1 };
}

/**
 * One print job has one sheet size. "auto" turns the sheet the way most of
 * the pictures face.
 */
export function sheetSize(settings, rects) {
  const paper = PAPERS.find((p) => p.id === settings.paper) || PAPERS[0];
  let landscape = settings.orientation === 'landscape';
  if (settings.orientation === 'auto') {
    const wide = rects.filter((r) => r.w > r.h).length;
    landscape = wide * 2 > rects.length;
  }
  return landscape ? { w: paper.h, h: paper.w, landscape, paper } : { w: paper.w, h: paper.h, landscape, paper };
}

/**
 * Lays out one page per document. Each page: the sheet, the content area
 * (inside margins and header) and where the picture sits within it — `box` is
 * the visible crop of the picture, `img` the whole picture relative to `box`.
 */
export function layoutPages(docs, settings, { selectionOnly = false, currentId = null } = {}) {
  const rects = docs.map((d) => sourceRect(d, selectionOnly, currentId));
  const sheet = sheetSize(settings, rects);
  const m = MARGINS[settings.margin] ?? MARGINS.normal;
  const header = settings.header ? HEADER_MM : 0;
  const content = { x: m, y: m + header, w: Math.max(1, sheet.w - 2 * m), h: Math.max(1, sheet.h - 2 * m - header) };
  const pages = docs.map((doc, i) => {
    const r = rects[i];
    let s;
    if (settings.layout === 'fill') s = Math.max(content.w / r.w, content.h / r.h);
    else if (settings.layout === 'actual') s = MM_PER_PX;
    else if (settings.layout === 'custom') s = MM_PER_PX * Math.max(1, Number(settings.scale) || 100) / 100;
    else s = Math.min(content.w / r.w, content.h / r.h);
    const w = r.w * s;
    const h = r.h * s;
    return {
      doc,
      index: i,
      box: { x: (content.w - w) / 2, y: (content.h - h) / 2, w, h },
      img: { x: -r.x * s, y: -r.y * s, w: (doc.width || r.w) * s, h: (doc.height || r.h) * s },
    };
  });
  return { sheet, content, header, margin: m, pages };
}
