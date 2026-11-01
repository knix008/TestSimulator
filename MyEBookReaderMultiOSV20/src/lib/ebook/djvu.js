// DjVu, decoded in the browser.
//
// A DjVu file is a fixed-layout document: each page is a picture, sometimes
// with a hidden text layer from OCR. The bytes are decoded by djvu-rs (MIT,
// no GPL code) compiled to WebAssembly, which is loaded the first time a DjVu
// is opened, the same way the rest of the e-book code stays out of the way of
// a reader that only opens PDFs.
export { looksLikeDjvu } from './djvumagic.js';

// Page units are points (1/72 inch), the same as a PDF page's, so a DjVu
// scanned from a letter-size book comes up the same size as a PDF of it.
export const DJVU_UNIT_DPI = 72;

let wasmBytes = null;
let started = null;

/**
 * The WebAssembly module, as bytes.
 *
 * Vite serves it for the app. Node and the test runner cannot fetch a
 * `file:` URL, so a test hands the bytes in before the first open.
 */
export function setDjvuWasmBytes(bytes) {
  wasmBytes = bytes;
}

function ensureDjvu() {
  if (!started) started = start();
  return started;
}

async function start() {
  const djvu = await import('djvu-rs');
  if (wasmBytes) await djvu.default(wasmBytes);
  else await djvu.default();
  return djvu;
}

/** Parses a bundled DjVu. */
export async function openDjvuDocument(data) {
  const djvu = await ensureDjvu();
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data || []);
  try {
    return djvu.WasmDocument.from_bytes(bytes);
  } catch (err) {
    const detail = err?.message ? ` ${err.message}` : '';
    throw new Error(`This DjVu file could not be opened.${detail}`);
  }
}

function withPage(doc, index, fn) {
  const page = doc.page(Math.max(0, index));
  try {
    return fn(page);
  } finally {
    try { page.free(); } catch { /* already released */ }
  }
}

/** The page's size in points. */
export function djvuPageSize(doc, index) {
  return withPage(doc, index, (page) => ({
    width: Math.max(1, page.width_at(DJVU_UNIT_DPI)),
    height: Math.max(1, page.height_at(DJVU_UNIT_DPI)),
    dpi: page.dpi() || 300,
  }));
}

/**
 * The page's pixels at `dpi`, copied out at once: a later call into the
 * decoder can move its memory, and a view into that memory would then paint
 * the wrong bytes.
 */
export function djvuPagePixels(doc, index, dpi) {
  return withPage(doc, index, (page) => {
    const native = page.dpi() || 300;
    // Never ask for more than the scan has, or for a canvas the browser refuses.
    let target = Math.max(12, Math.min(native, dpi));
    const w72 = page.width_at(DJVU_UNIT_DPI);
    const h72 = page.height_at(DJVU_UNIT_DPI);
    const area = (w72 * h72 * target * target) / (DJVU_UNIT_DPI * DJVU_UNIT_DPI);
    if (area > 40e6) target *= Math.sqrt(40e6 / area);
    const data = new Uint8ClampedArray(page.render(target));
    return { data, width: page.width_at(target), height: page.height_at(target) };
  });
}

/**
 * The words of the OCR layer, in points from the page's top-left corner:
 * [{ x, y, w, h, t }]. Empty when the file carries no text.
 */
export function djvuPageWords(doc, index) {
  return withPage(doc, index, (page) => {
    try {
      const raw = page.text_zones_json(DJVU_UNIT_DPI);
      const zones = raw ? JSON.parse(raw) : [];
      return (Array.isArray(zones) ? zones : [])
        .filter((z) => z && String(z.t || '').trim())
        .map((z) => ({ x: Number(z.x) || 0, y: Number(z.y) || 0, w: Number(z.w) || 0, h: Number(z.h) || 0, t: String(z.t) }));
    } catch {
      return [];
    }
  });
}

/** The page's text, when the file carries a text layer. */
export function djvuPageText(doc, index) {
  return withPage(doc, index, (page) => {
    try { return page.text() || ''; } catch { return ''; }
  });
}

/** A DjVu document, presented as a book whose sections are its pages. */
export async function openDjvuBook(data, { name = '' } = {}) {
  const doc = await openDjvuDocument(data);
  const count = doc.page_count();
  if (!count) {
    try { doc.free(); } catch { /* nothing was opened */ }
    throw new Error('This DjVu file has no pages.');
  }

  const sections = Array.from({ length: count }, (_, index) => ({
    index,
    id: `page-${index + 1}`,
    href: `#page-${index + 1}`,
    kind: 'djvu',
    label: `${index + 1}`,
  }));

  return {
    format: 'djvu',
    formatLabel: 'DjVu',
    meta: {
      title: String(name || '').replace(/\.[^.]+$/, ''),
      author: '',
      pages: count,
    },
    sections,
    // A DjVu has no contents list worth showing: every entry would be a page
    // number, which the thumbnails already are.
    toc: [],
    coverPath: '',
    resource() { return null; },
    loadSection(index) {
      if (index < 0 || index >= count) throw new Error(`This document has no page ${index + 1}.`);
      return { kind: 'djvu', index, html: '', headings: [], title: `${index + 1}`, text: '' };
    },
    sectionText(index) {
      return djvuPageText(doc, index);
    },
    djvu: doc,
    destroy() {
      try { doc.free(); } catch { /* already gone */ }
    },
  };
}
