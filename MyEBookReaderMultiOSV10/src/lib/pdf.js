// pdf.js wrapper: worker setup, document loading, page rendering, the
// selectable text layer and in-page links.
//
// The `legacy` build is transpiled and polyfilled, so the same bundle runs in
// Electron's Chromium and in the older browsers a web deployment has to serve.
// Everything that touches pdfjs-dist lives here; the rest of the app sees a
// PDF through the same book interface as an EPUB (see pdfbook.js).
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

export const { TextLayer, OPS, PixelsPerInch } = pdfjsLib;

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Runtime data files copied into public/pdfjs by scripts/copy-pdfjs-assets.mjs.
// Resolving against BASE_URL keeps them reachable under http://, the packaged
// app:// origin, and a web deployment served from a sub-path.
const assetBase = new URL('./pdfjs/', new URL(import.meta.env.BASE_URL, window.location.href)).href;

const ASSET_OPTIONS = {
  cMapUrl: assetBase + 'cmaps/',
  cMapPacked: true,
  standardFontDataUrl: assetBase + 'standard_fonts/',
};

/**
 * Loads a PDF from raw bytes.
 * `onProgress({loaded,total})` fires while pdf.js parses;
 * `onPassword(retry, reason)` is called for encrypted documents.
 */
export function loadDocument({ data, onProgress, onPassword }) {
  // pdf.js takes ownership of (and detaches) the buffer it is handed, so pass
  // a copy — the caller keeps the original for reload and "save a copy".
  const task = pdfjsLib.getDocument({
    data: data instanceof Uint8Array ? data.slice() : new Uint8Array(data),
    ...ASSET_OPTIONS,
  });
  if (onProgress) task.onProgress = onProgress;
  if (onPassword) task.onPassword = onPassword;
  return task;
}

/**
 * Renders one page into `canvas` at `scale` (CSS px per PDF pt) and `rotation`
 * degrees, honouring the display's device pixel ratio for crisp text.
 */
export async function renderPage({ page, canvas, scale, rotation = 0, dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1 }) {
  const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
  const ctx = canvas.getContext('2d', { alpha: false });

  canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
  canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  const task = page.render({
    canvasContext: ctx,
    viewport,
    transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0],
    background: '#ffffff',
  });
  return { task, viewport, width: viewport.width, height: viewport.height };
}

/**
 * Builds the invisible, selectable text layer that sits on top of the canvas.
 *
 * pdf.js writes each span's size as `font-size: calc(var(--scale-factor)*Npx)`,
 * so the container must carry that variable — without it every span falls back
 * to the inherited size and the selection no longer lines up with the glyphs.
 */
export async function renderTextLayer({ page, container, viewport }) {
  container.replaceChildren();
  container.style.setProperty('--scale-factor', String(viewport.scale));
  container.style.setProperty('--total-scale-factor', String(viewport.scale));
  const textContent = await page.getTextContent();
  const layer = new TextLayer({ textContentSource: textContent, container, viewport });
  await layer.render();
  const end = document.createElement('div');
  end.className = 'endOfContent';
  container.append(end);
  return layer;
}

/** Plain text of a page, with pdf.js's own line breaks preserved. */
export async function getPageText(page) {
  const content = await page.getTextContent();
  let out = '';
  for (const item of content.items) {
    if (typeof item.str === 'string') out += item.str;
    if (item.hasEOL) out += '\n';
  }
  return out;
}

/** Document outline (its own bookmarks) as a tree. */
export async function getOutline(doc) {
  let raw = null;
  try { raw = await doc.getOutline(); } catch { return []; }
  if (!raw) return [];
  let seq = 0;
  const walk = (nodes, level) => nodes.map((n) => ({
    id: `o${seq++}`,
    title: n.title || '',
    level,
    dest: n.dest,
    url: n.url,
    items: n.items?.length ? walk(n.items, level + 1) : [],
  }));
  return walk(raw, 0);
}

/**
 * Resolves a destination (named or explicit) to a 1-based page and, for XYZ /
 * FitH destinations, the PDF-space Y to scroll to (origin at the page bottom).
 */
export async function destToLocation(doc, dest) {
  try {
    if (dest == null) return null;
    const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
    if (!explicit) return null;
    let index;
    if (typeof explicit[0] === 'number') index = explicit[0];
    else index = await doc.getPageIndex(explicit[0]);
    if (!Number.isFinite(index)) return null;
    const spec = explicit[1];
    const name = typeof spec === 'string' ? spec : spec?.name;
    let pdfTop = null;
    if (name === 'XYZ' && Number.isFinite(Number(explicit[3]))) pdfTop = Number(explicit[3]);
    else if ((name === 'FitH' || name === 'FitBH') && Number.isFinite(Number(explicit[2]))) {
      pdfTop = Number(explicit[2]);
    }
    return { page: index + 1, pdfTop, name: name || null };
  } catch { return null; }
}

const LINK_TYPE = 2; // pdf.js AnnotationType.LINK

/** Clickable in-page links (contents entries, cross-refs, URLs), in viewport px. */
export async function getPageLinks(page, viewport) {
  let annots = [];
  try { annots = await page.getAnnotations({ intent: 'display' }); } catch { return []; }
  const links = [];
  for (const a of annots || []) {
    const isLink = a.annotationType === LINK_TYPE || a.subtype === 'Link';
    if (!isLink) continue;
    if (!a.dest && !a.url && !a.unsafeUrl && !a.action) continue;
    const raw = a.rect || [0, 0, 0, 0];
    const vr = typeof viewport.convertToViewportRectangle === 'function'
      ? viewport.convertToViewportRectangle(raw)
      : raw;
    const [x1, y1, x2, y2] = vr;
    links.push({
      id: a.id || `link-${links.length}`,
      dest: a.dest || null,
      url: a.url || a.unsafeUrl || null,
      action: a.action || null,
      title: a.title || a.contentsObj?.str || '',
      rect: {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      },
    });
  }
  return links;
}

/** Title / author / producer, plus what the properties view shows. */
export async function getDocumentInfo(doc) {
  try {
    const { info, metadata } = await doc.getMetadata();
    return {
      title: info?.Title || metadata?.get('dc:title') || '',
      author: info?.Author || '',
      subject: info?.Subject || '',
      keywords: info?.Keywords || '',
      creator: info?.Creator || '',
      producer: info?.Producer || '',
      creationDate: info?.CreationDate || '',
      modDate: info?.ModDate || '',
      version: info?.PDFFormatVersion || '',
      encrypted: !!info?.IsEncrypted,
    };
  } catch { return {}; }
}

/** A PDF starts with %PDF- (possibly after a few junk bytes). */
export function looksLikePdf(data) {
  if (!data || data.length < 5) return false;
  const head = new TextDecoder('latin1').decode(data.subarray(0, 1024));
  return head.includes('%PDF-');
}
