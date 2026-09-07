// Printing: which pages, and how they reach the printer.
//
// Both runtimes print the same thing — the chosen pages rendered by pdf.js —
// because Electron's window cannot display a PDF itself (loading one paints a
// blank page, which would print as blank paper). Rendering here also means the
// page selection is applied before anything reaches the print dialog.
import { renderPage } from './pdf.js';

export const PRINT_SCOPES = ['all', 'current', 'custom'];
export const PRINT_DPI = 150;   // good enough for text, small enough to stay responsive

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

// One image per sheet, each on its own piece of paper.
export function buildPrintHtml(sources, title) {
  const body = sources.map((s) => (
    `<div class="sheet"><img src="${s.src}" alt=""></div>`
  )).join('\n');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title || 'Print')}</title>
<style>
  @page { size: auto; margin: 8mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .sheet {
    page-break-after: always; break-after: page;
    display: flex; align-items: center; justify-content: center;
  }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .sheet img { max-width: 100%; display: block; }
  @media screen { .sheet img { max-height: 100vh; } }
</style></head>
<body>${body}</body></html>`;
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
