// Printing: which pages, and how they reach the printer.
//
// Both runtimes print the same thing — the chosen pages rendered by pdf.js —
// because the desktop webview cannot display a PDF itself (loading one paints
// a blank page, which would print as blank paper). Rendering here also means
// the page selection is applied before anything reaches the print dialog.
import { renderPage } from './pdf.js';
import { buildPrintHtml } from './print-html.js';
import { layoutSheet, printPlan, cssPageSize, contentBox, PRINT_ORIENTATIONS } from './print-layout.js';

export { buildPrintHtml, PRINT_ORIENTATIONS };

export const PRINT_SCOPES = ['all', 'current', 'custom'];
export const PRINT_DPI = 150;   // good enough for text, small enough to stay responsive
export const PREVIEW_MAX_WIDTH = 240;
export const PREVIEW_MAX_HEIGHT = 300;

// Which page of the current selection the preview should show.
export function clampPreviewIndex(index, count) {
  if (!count) return 0;
  const n = Number(index);
  const i = Number.isFinite(n) ? Math.trunc(n) : 0;
  return Math.min(Math.max(0, i), count - 1);
}

// Parses "1-5, 8, 11-13" into a sorted, de-duplicated list of page numbers.
// Returns { pages, error }: `error` is a message key when the text is unusable.
export function parsePageList(text, numPages) {
  const raw = String(text || '').trim();
  if (!raw) return { pages: [], error: 'print.rangeEmpty' };

  const pages = new Set();
  for (const part of raw.split(/[,\s]+/).filter(Boolean)) {
    const m = /^(\d+)(?:\s*[-~]\s*(\d+))?$/.exec(part);
    if (!m) return { pages: [], error: 'print.rangeInvalid' };
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : Number(m[2]);
    if (!from || !to) return { pages: [], error: 'print.rangeInvalid' };
    if (from > numPages || to > numPages) return { pages: [], error: 'print.rangeOutside' };
    for (let p = Math.min(from, to); p <= Math.max(from, to); p++) pages.add(p);
  }
  const list = [...pages].sort((a, b) => a - b);
  return list.length ? { pages: list } : { pages: [], error: 'print.rangeEmpty' };
}

// The pages a scope selects, as a sorted list of page numbers.
export function pagesForScope({ scope, custom, pageNumber, numPages }) {
  if (scope === 'current') return { pages: [pageNumber] };
  if (scope === 'custom') return parsePageList(custom, numPages);
  return { pages: Array.from({ length: numPages }, (_, i) => i + 1) };
}

// Collapses [1,2,3,7,8] into [{from:1,to:3},{from:7,to:8}] (1-based, inclusive).
export function toContiguousRanges(pages) {
  const out = [];
  for (const p of pages) {
    const last = out[out.length - 1];
    if (last && p === last.to + 1) last.to = p;
    else out.push({ from: p, to: p });
  }
  return out;
}

// Renders the chosen pages as JPEGs. Each canvas is released as soon as it is
// encoded, so printing a long document does not hold every page in memory.
export async function renderPagesForPrint({ doc, pages, rotation = 0, dpi = PRINT_DPI, onProgress }) {
  const sheets = [];
  for (let i = 0; i < pages.length; i++) {
    onProgress?.({ done: i, total: pages.length });
    const page = await doc.getPage(pages[i]);
    const canvas = document.createElement('canvas');
    const res = await renderPage({ page, canvas, scale: dpi / 72, rotation, dpr: 1 });
    await res.task.promise;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    sheets.push({
      bytes: new Uint8Array(await blob.arrayBuffer()),
      landscape: res.viewport.width > res.viewport.height,
      page: pages[i],
    });
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
  }
  onProgress?.({ done: pages.length, total: pages.length });
  return sheets;
}

// Paper orientation for a direct print: "auto" follows the pages — landscape
// when most of them are wider than tall.
export function resolveLandscape(orientation, sheets) {
  if (orientation === 'landscape') return true;
  if (orientation === 'portrait') return false;
  const list = Array.isArray(sheets) ? sheets : [];
  const wide = list.filter((s) => s?.landscape).length;
  return list.length > 0 && wide * 2 > list.length;
}

// The printer to use: the one picked, if it still exists, else the system
// default, else the first one there is.
export function choosePrinter(picked, { printers = [], default: def } = {}) {
  if (picked && printers.includes(picked)) return picked;
  if (def && printers.includes(def)) return def;
  return printers[0] || def || '';
}

export function clampCopies(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(99, Math.max(1, v)) : 1;
}

// One page, scaled to fit the print-dialog preview pane.
export async function renderPreviewPage({
  doc, pageNumber, canvas, rotation = 0,
  maxWidth = PREVIEW_MAX_WIDTH, maxHeight = PREVIEW_MAX_HEIGHT,
}) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1, rotation: (page.rotate + rotation) % 360 });
  const scale = Math.min(maxWidth / Math.max(1, base.width), maxHeight / Math.max(1, base.height), 1);
  const res = await renderPage({ page, canvas, scale, rotation, dpr: 1 });
  await res.task.promise;
  return { page: pageNumber, width: res.viewport.width, height: res.viewport.height };
}

// ── Whole sheets (page setup applied) ───────────────────────
// A page's size in points as it shows (view rotation included).
export async function pageSizePt(doc, pageNumber, rotation = 0) {
  const page = await doc.getPage(pageNumber);
  const v = page.getViewport({ scale: 1, rotation: ((page.rotate || 0) + rotation) % 360 });
  return { w: v.width, h: v.height };
}

/** printPlan() for a document: the first page decides the shape used for "auto". */
export async function planForDoc({ doc, pages, options, orientation = 'auto', rotation = 0 }) {
  let aspect = 210 / 297;
  if (doc && pages?.length) {
    try {
      const first = await pageSizePt(doc, pages[0], rotation);
      if (first.w > 0 && first.h > 0) aspect = first.w / first.h;
    } catch { /* keep A4's shape */ }
  }
  return printPlan({ pages, options, orientation, aspect });
}

// Grey made from the picture's own luminance.
function toGray(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = y; d[i + 1] = y; d[i + 2] = y;
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Draws one sheet — white paper, each page in its place — on `canvas` at
 * `pxPerMm`. `guides` adds the dashed margin line the preview shows (never on
 * paper).
 */
export async function renderSheet({ doc, plan, sheetIndex, canvas, pxPerMm, rotation = 0, guides = false }) {
  const sheetPages = plan.sheets[sheetIndex] || [];
  const W = Math.max(1, Math.round(plan.paper.w * pxPerMm));
  const H = Math.max(1, Math.round(plan.paper.h * pxPerMm));
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: plan.options.color === 'gray' });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const sizes = [];
  for (const n of sheetPages) sizes.push(await pageSizePt(doc, n, rotation));
  const placed = layoutSheet(plan, sheetPages, sizes);
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    const page = await doc.getPage(p.page);
    // Always this page's own document: pdf.js registers the PDF's fonts there,
    // and a canvas of another document (the print window) cannot see them —
    // its text came out in fallback glyphs.
    const tmp = document.createElement('canvas');
    // Render at the size it will be drawn, so nothing is scaled twice.
    const scale = Math.max(0.05, (p.w * pxPerMm) / Math.max(1, sizes[i].w));
    const res = await renderPage({ page, canvas: tmp, scale, rotation, dpr: 1 });
    await res.task.promise;
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.clip.x * pxPerMm, p.clip.y * pxPerMm, p.clip.w * pxPerMm, p.clip.h * pxPerMm);
    ctx.clip();
    ctx.drawImage(tmp, p.x * pxPerMm, p.y * pxPerMm, p.w * pxPerMm, p.h * pxPerMm);
    ctx.restore();
    tmp.width = 0;
    tmp.height = 0;
    page.cleanup?.();
  }
  if (plan.options.color === 'gray') toGray(ctx, W, H);
  if (guides) {
    if (plan.options.margin !== 'none') {
      const box = contentBox(plan.options.paper, plan.landscape, plan.options.margin);
      ctx.save();
      ctx.setLineDash?.([4, 3]);
      ctx.strokeStyle = 'rgba(80, 120, 220, 0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(box.x * pxPerMm + 0.5, box.y * pxPerMm + 0.5, box.w * pxPerMm - 1, box.h * pxPerMm - 1);
      ctx.restore();
    }
  }
  return { width: W, height: H, pages: sheetPages };
}

/**
 * The preview: one sheet scaled to fit a box of maxWidth × maxHeight CSS px,
 * drawn at `pixelRatio` device pixels per CSS px so its text stays sharp.
 * Returns the CSS size to show it at.
 */
export async function renderPreviewSheet({
  doc, plan, sheetIndex, canvas, maxWidth = 360, maxHeight = 400, rotation = 0, pixelRatio = 1,
}) {
  const cssPerMm = Math.min(maxWidth / plan.paper.w, maxHeight / plan.paper.h);
  const ratio = Math.max(1, Math.min(4, Number(pixelRatio) || 1));
  const res = await renderSheet({ doc, plan, sheetIndex, canvas, pxPerMm: cssPerMm * ratio, rotation, guides: true });
  return { ...res, cssWidth: Math.round(plan.paper.w * cssPerMm), cssHeight: Math.round(plan.paper.h * cssPerMm) };
}

/** Every sheet as a JPEG for the printer, released as soon as it is encoded. */
export async function renderSheetsForPrint({ doc, plan, rotation = 0, dpi = PRINT_DPI, onProgress }) {
  const out = [];
  const pxPerMm = dpi / 25.4;
  for (let i = 0; i < plan.sheets.length; i++) {
    onProgress?.({ done: i, total: plan.sheets.length });
    const canvas = document.createElement('canvas');
    await renderSheet({ doc, plan, sheetIndex: i, canvas, pxPerMm, rotation });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    out.push({ bytes: new Uint8Array(await blob.arrayBuffer()), pages: plan.sheets[i] });
    canvas.width = 0;
    canvas.height = 0;
  }
  onProgress?.({ done: plan.sheets.length, total: plan.sheets.length });
  return out;
}

/** Web: the sheets go to the browser's print window on paper of their size. */
export async function printSheetsViaBrowser({ doc, plan, rotation = 0, title, onProgress }) {
  const sheets = await renderSheetsForPrint({ doc, plan, rotation, onProgress });
  const sources = sheets.map((s) => ({ src: bytesToDataUrl(s.bytes) }));
  const html = buildPrintHtml(sources, title, { pageSize: cssPageSize(plan.paper) });
  const win = window.open('', '_blank');
  if (!win) throw new Error('The print window was blocked by the browser. Allow pop-ups for this page and try again.');
  win.document.open();
  win.document.write(html);
  win.document.close();
  const start = () => { try { win.focus(); win.print(); } catch { /* the user can print manually */ } };
  win.onload = start;
  setTimeout(start, 800);
  return sheets.length;
}

// Web: print from a new window, since a browser gives no other handle on the
// printer. The page selection is already baked into the images.
export async function printViaBrowser({ doc, pages, rotation = 0, title, onProgress }) {
  const sheets = await renderPagesForPrint({ doc, pages, rotation, onProgress });
  const sources = sheets.map((s) => ({ src: bytesToDataUrl(s.bytes) }));
  const html = buildPrintHtml(sources, title);

  const win = window.open('', '_blank');
  if (!win) throw new Error('The print window was blocked by the browser. Allow pop-ups for this page and try again.');
  win.document.open();
  win.document.write(html);
  win.document.close();
  const start = () => { try { win.focus(); win.print(); } catch { /* the user can print manually */ } };
  win.onload = start;
  setTimeout(start, 800);
  return sheets.length;
}

function bytesToDataUrl(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}
