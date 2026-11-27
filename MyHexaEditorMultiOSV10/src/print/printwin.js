// The print window (popup kind "print"): page setup and the printer on the left, the document laid out
// in pages (paged.js, the same layout as the PDF) on the right, and a Print button that prints at once —
// straight to the chosen printer on Windows (no system dialog), a PDF file for "Microsoft Print to PDF"
// and the like, the system dialog elsewhere. The main window supplies the document (print-content) and
// does the printing (print-run → render window, src/render.js).
import { fillIndexPages, runPaged } from '../lib/paginate.js';

/** Paper sizes in millimetres (portrait). */
export const PAPERS = {
  A4: [210, 297], A3: [297, 420], A5: [148, 210], B5: [176, 250], Letter: [215.9, 279.4], Legal: [215.9, 355.6],
};
/** Margins: [top/bottom, left/right] in millimetres. */
export const MARGINS = { normal: [18, 16], narrow: [10, 10], wide: [25, 25] };
export const DEFAULT_PRINT = { printer: '', copies: 1, paper: 'A4', orientation: 'portrait', margins: 'normal', range: 'all', rangeText: '', color: 'color' };

export function normalizePrint(raw) {
  const p = { ...DEFAULT_PRINT, ...(raw && typeof raw === 'object' ? raw : {}) };
  p.copies = Math.max(1, Math.min(99, Math.round(Number(p.copies) || 1)));
  if (!PAPERS[p.paper]) p.paper = 'A4';
  if (!['portrait', 'landscape'].includes(p.orientation)) p.orientation = 'portrait';
  if (!MARGINS[p.margins]) p.margins = 'normal';
  if (!['all', 'range'].includes(p.range)) p.range = 'all';
  if (!['color', 'gray'].includes(p.color)) p.color = 'color';
  p.printer = typeof p.printer === 'string' ? p.printer : '';
  p.rangeText = typeof p.rangeText === 'string' ? p.rangeText.slice(0, 80) : '';
  return p;
}

/** The sheet in millimetres, oriented. */
export function sheetOf(p) {
  const [w, h] = PAPERS[p.paper] ?? PAPERS.A4;
  return p.orientation === 'landscape' ? [h, w] : [w, h];
}

/** "1-3, 5" → sorted page numbers within 1…total (null: not valid). */
export function parseRanges(text, total) {
  const pages = new Set();
  const parts = String(text ?? '').split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return null;
  for (const part of parts) {
    const m = /^(\d+)\s*(?:-\s*(\d*))?$/.exec(part);
    if (!m) return null;
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : m[2] === '' ? total : Number(m[2]);
    if (!from || !to || from > to) return null;
    for (let n = from; n <= Math.min(to, total); n++) pages.add(n);
  }
  return pages.size ? [...pages].sort((a, b) => a - b) : null;
}

/** The pages as the print dialog takes them ("1-3,5"). */
export function rangesText(pages) {
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    out.push(i === j ? `${pages[i]}` : `${pages[i]}-${pages[j]}`);
    i = j;
  }
  return out.join(',');
}

/** The page setup as CSS after the document's own (later @page rules win), and grey printing. */
export function pageCss(p) {
  const [w, h] = sheetOf(p);
  const [mv, mh] = MARGINS[p.margins];
  return `<style data-print-setup>@page{size:${w}mm ${h}mm;margin:${mv}mm ${mh}mm}${p.color === 'gray' ? 'html{filter:grayscale(1)}' : ''}</style>`;
}

export const withPageCss = (html, p) => (html.includes('</head>') ? html.replace('</head>', `${pageCss(p)}</head>`) : pageCss(p) + html);

const PREVIEW_CSS = `<style data-print-preview>
  html,body{background:#d9dce2 !important;margin:0 !important;padding:0 !important}
  .pagedjs_pages{display:flex !important;flex-direction:column !important;align-items:center !important;gap:20px !important;padding:24px 0 40px !important}
  .pagedjs_page{background:#fff !important;box-shadow:0 1px 2px rgba(0,0,0,.18),0 10px 26px -8px rgba(0,0,0,.35) !important;margin:0 !important;transition:opacity .15s}
  .pagedjs_page.out-of-range{opacity:.28}
</style>`;

/** Lays the document out in `frame` and returns the number of pages. */
export async function layoutPreview(frame, html, p) {
  const doc = frame.contentDocument;
  doc.open();
  doc.write(withPageCss(html, p));
  doc.close();
  // Pictures first (a help page has many): the layout needs their heights to break the pages right.
  await Promise.race([
    Promise.all([...doc.images].map((img) => (img.complete ? null : new Promise((done) => { img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }); })))),
    new Promise((done) => setTimeout(done, 15000)),
  ]);
  await runPaged(frame.contentWindow);
  fillIndexPages(doc);
  doc.head.insertAdjacentHTML('beforeend', PREVIEW_CSS);
  return doc.querySelectorAll('.pagedjs_page').length;
}

/** Fits the pages to the frame's width and greys out the pages that will not print. */
export function fitPreview(frame, p, pages) {
  const doc = frame.contentDocument;
  if (!doc?.documentElement) return;
  const [w] = sheetOf(p);
  const px = (w * 96) / 25.4;
  const scale = Math.max(0.2, Math.min(1.2, (frame.clientWidth - 56) / px));
  doc.documentElement.style.zoom = String(scale);
  const keep = new Set(pages ?? []);
  doc.querySelectorAll('.pagedjs_page').forEach((page, i) => page.classList.toggle('out-of-range', pages != null && !keep.has(i + 1)));
}

/** Scrolls the preview to page n (1-based) and returns the page shown at the top. */
export function showPage(frame, n) {
  const page = frame.contentDocument?.querySelectorAll('.pagedjs_page')[n - 1];
  page?.scrollIntoView({ block: 'start' });
}

export function pageAtTop(frame) {
  const doc = frame.contentDocument;
  if (!doc) return 1;
  const pages = [...doc.querySelectorAll('.pagedjs_page')];
  const zoom = Number(doc.documentElement.style.zoom) || 1;
  const top = (doc.scrollingElement?.scrollTop ?? 0) / zoom + 40;
  let current = 1;
  pages.forEach((page, i) => { if (page.offsetTop <= top) current = i + 1; });
  return current;
}
