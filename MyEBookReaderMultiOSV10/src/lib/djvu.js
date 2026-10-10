// DjVu, decoded in the browser.
//
// A DjVu file is a fixed-layout document: each page is a picture, sometimes
// with a hidden text layer from OCR. The bytes are decoded by djvu-rs
// (MIT, no GPL code) compiled to WebAssembly. The library is loaded the
// first time a DjVu is opened, the same way pdf.js is kept out of the
// bundle until a PDF is opened.
import { computePageScale, normalizeRotation } from './view.js';
export { looksLikeDjvu } from './djvumagic.js';

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

/** Parses a bundled DjVu. The document is what the reading pane paints from. */
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

function quartersOf(rotation) {
  return Math.round(normalizeRotation(rotation) / 90) % 4;
}

/** A box on the page, turned the same way the picture was. */
function turnBox(box, pageW, pageH, quarters) {
  const x = Number(box.x) || 0;
  const y = Number(box.y) || 0;
  const w = Number(box.w) || 0;
  const h = Number(box.h) || 0;
  if (quarters === 1) return { x: pageH - y - h, y: x, w: h, h: w, t: box.t };
  if (quarters === 2) return { x: pageW - x - w, y: pageH - y - h, w, h, t: box.t };
  if (quarters === 3) return { x: y, y: pageW - x - w, w: h, h: w, t: box.t };
  return { x, y, w, h, t: box.t };
}

/**
 * Paints one page onto `canvas`.
 *
 * `scale` is the same factor a PDF page is fitted with: 1 is the page's own
 * size. The canvas the reader is looking at is not this one when a turn is
 * in flight — the caller paints here and copies across when the paint is
 * finished, so the page already on screen is not cleared first.
 *
 * @returns {{width: number, height: number, zones: Array}}
 */
export async function paintDjvuPage({
  doc, pageNumber, canvas, scale = 1, rotation = 0, dpr = 1,
}) {
  const page = doc.page(Math.max(0, (pageNumber || 1) - 1));
  try {
    const nativeDpi = page.dpi() || 96;
    const factor = Math.max(0.1, Number(scale) || 1);
    const targetDpi = Math.max(24, Math.min(600, nativeDpi * factor));
    const paintDpi = targetDpi * (dpr > 0 ? dpr : 1);
    // Copied out at once: a later call into the decoder can move its memory,
    // and a view into that memory would then paint the wrong bytes.
    const pixels = new Uint8ClampedArray(page.render(paintDpi));
    const srcW = page.width_at(paintDpi);
    const srcH = page.height_at(paintDpi);
    const cssW = page.width_at(targetDpi);
    const cssH = page.height_at(targetDpi);
    let zones = [];
    try {
      const raw = page.text_zones_json(targetDpi);
      if (raw) zones = JSON.parse(raw);
    } catch { zones = []; }
    const quarters = quartersOf(rotation);
    drawPage(canvas, pixels, srcW, srcH, cssW, cssH, quarters);
    return {
      width: quarters % 2 ? cssH : cssW,
      height: quarters % 2 ? cssW : cssH,
      zones: (Array.isArray(zones) ? zones : []).map((zone) => turnBox(zone, cssW, cssH, quarters)),
    };
  } finally {
    try { page.free(); } catch { /* already released */ }
  }
}

function drawPage(canvas, pixels, srcW, srcH, cssW, cssH, quarters) {
  const scratch = document.createElement('canvas');
  scratch.width = srcW;
  scratch.height = srcH;
  const source = scratch.getContext('2d');
  source.putImageData(new ImageData(new Uint8ClampedArray(pixels), srcW, srcH), 0, 0);

  const turned = quarters % 2 === 1;
  canvas.width = turned ? srcH : srcW;
  canvas.height = turned ? srcW : srcH;
  canvas.style.width = `${Math.max(1, Math.round(turned ? cssH : cssW))}px`;
  canvas.style.height = `${Math.max(1, Math.round(turned ? cssW : cssH))}px`;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  if (quarters === 1) { ctx.translate(canvas.width, 0); ctx.rotate(Math.PI / 2); }
  else if (quarters === 2) { ctx.translate(canvas.width, canvas.height); ctx.rotate(Math.PI); }
  else if (quarters === 3) { ctx.translate(0, canvas.height); ctx.rotate(-Math.PI / 2); }
  ctx.drawImage(scratch, 0, 0);
  ctx.restore();
}

/** The page's own pixel size, which "100%" means. */
export function djvuPageSize(doc, pageNumber) {
  const page = doc.page(Math.max(0, (pageNumber || 1) - 1));
  try {
    const dpi = page.dpi() || 96;
    return { width: page.width_at(dpi), height: page.height_at(dpi), dpi };
  } finally {
    try { page.free(); } catch { /* already released */ }
  }
}

/** How large to paint a page so that it fits `room`, the same way a PDF page does. */
export function djvuFitScale(size, { room, zoomMode, zoom, rotation }) {
  return computePageScale({
    pageSize: size,
    viewport: room,
    zoomMode,
    zoom,
    rotation,
    padX: 0,
    padY: 0,
  });
}

/** Pages as JPEG data URLs, for the print preview and the printer. */
export async function renderDjvuPagesToImages({
  doc, pages, rotation = 0, scale = 1.5, quality = 0.92, onProgress,
}) {
  const out = [];
  for (let i = 0; i < pages.length; i += 1) {
    onProgress?.({ done: i, total: pages.length });
    const canvas = document.createElement('canvas');
    await paintDjvuPage({
      doc, pageNumber: pages[i], canvas, scale, rotation, dpr: 1,
    });
    out.push(canvas.toDataURL('image/jpeg', quality));
  }
  onProgress?.({ done: pages.length, total: pages.length });
  return out;
}

/** The words on a page, when the file carries a text layer. */
export function djvuPageText(doc, pageNumber) {
  const page = doc.page(Math.max(0, (pageNumber || 1) - 1));
  try {
    return page.text() || '';
  } catch {
    return '';
  } finally {
    try { page.free(); } catch { /* already released */ }
  }
}
