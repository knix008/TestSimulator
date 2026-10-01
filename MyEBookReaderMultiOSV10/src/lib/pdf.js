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
export async function renderTextLayer({ page, container, viewport, isCancelled }) {
  // Straight into the layer the reader selects from, which is where pdf.js
  // expects to lay text out: it measures the container it is given, and one
  // that is not in the document — or one that is a second, hidden copy beside
  // the real one — is not something it will reliably fill.
  //
  // That leaves a window in which the layer is empty, between clearing it and
  // filling it. The caller closes that window by trying again when the layer
  // comes out with no words in it: a render that is overtaken is the only way
  // that happens, and an empty layer left behind is a page whose text cannot be
  // selected at all.
  container.replaceChildren();
  container.style.setProperty('--scale-factor', String(viewport.scale));
  container.style.setProperty('--total-scale-factor', String(viewport.scale));

  const textContent = await page.getTextContent();
  if (isCancelled?.()) return null;
  const layer = new TextLayer({ textContentSource: textContent, container, viewport });
  await layer.render();
  if (isCancelled?.()) return null;

  // The guard block that keeps a drag from reaching for text elsewhere on the
  // page; the reading pane arms and parks it. pdf.js's own viewer appends it in
  // TextLayerBuilder, and the bare TextLayer class used here renders the spans
  // and nothing else.
  const end = document.createElement('div');
  end.className = 'endOfContent';
  container.append(end);
  return layer;
}

/** Whether a page has words on it that a reader could select. */
export function hasSelectableText(container) {
  if (!container) return false;
  return [...container.querySelectorAll('span')].some((s) => (s.textContent || '').trim());
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

// ── The pictures a page paints ─────────────────────────────
//
// A PDF page is one canvas, so there is no element to click for a picture inside it.
// Replaying the operator list while tracking the current transformation matrix
// gives every image's rectangle without rendering anything, which is what lets
// a picture be pointed at, framed and copied on its own. Ported from MyPDFViewer,
// where this reads right.
function getImageObject(page, name) {
  return new Promise((resolve) => {
    const store = name.startsWith('g_') ? page.commonObjs : page.objs;
    try {
      if (store.has(name)) { resolve(store.get(name)); return; }
    } catch { /* fall through to the callback form */ }
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    try { store.get(name, done); } catch { done(null); }
    // Never hang the whole extraction on one unresolvable object.
    setTimeout(() => done(null), 8000);
  });
}

// Converts a pdf.js image object into a PNG data URL.
function imageObjectToDataURL(img) {
  if (!img) return null;
  const width = img.width;
  const height = img.height;
  if (!width || !height) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Newer pdf.js hands back an ImageBitmap / VideoFrame for most images.
  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  }
  if (!img.data) return null;

  const out = ctx.createImageData(width, height);
  const dst = out.data;
  const src = img.data;

  // kind: 1 = 1bpp grayscale, 2 = 24bpp RGB, 3 = 32bpp RGBA
  if (img.kind === 1) {
    const rowBytes = (width + 7) >> 3;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bit = (src[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
        const v = bit ? 255 : 0;
        const i = (y * width + x) * 4;
        dst[i] = dst[i + 1] = dst[i + 2] = v;
        dst[i + 3] = 255;
      }
    }
  } else if (img.kind === 2 || src.length === width * height * 3) {
    for (let p = 0, i = 0; p < width * height; p++) {
      dst[i++] = src[p * 3];
      dst[i++] = src[p * 3 + 1];
      dst[i++] = src[p * 3 + 2];
      dst[i++] = 255;
    }
  } else if (src.length >= width * height * 4) {
    dst.set(src.subarray(0, width * height * 4));
  } else {
    return null;
  }
  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL('image/png');
}

// Matrix helper: `combine(a, b)` applies b first, then a (pdf.js Util.transform).
function combine(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

// Where each image sits on the rendered page, in viewport (CSS pixel)
// coordinates — this is what makes "click the picture to select it" possible.
//
// pdf.js paints an image by transforming the unit square, so replaying the
// operator list while tracking the current transformation matrix gives every
// image's rectangle without rendering anything.
export async function getPageImageRegions(page, viewport, { minSize = 24 } = {}) {
  let ops;
  try { ops = await page.getOperatorList(); } catch { return []; }

  const paintOps = new Set([OPS.paintImageXObject, OPS.paintJpegXObject, OPS.paintInlineImageXObject]);
  const regions = [];
  const stack = [];
  let ctm = [1, 0, 0, 1, 0, 0];

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    if (fn === OPS.save) { stack.push(ctm.slice()); continue; }
    if (fn === OPS.restore) { ctm = stack.pop() || [1, 0, 0, 1, 0, 0]; continue; }
    if (fn === OPS.transform) { ctm = combine(ctm, ops.argsArray[i]); continue; }
    if (!paintOps.has(fn)) continue;

    const m = combine(viewport.transform, ctm);
    const corners = [[0, 0], [1, 0], [0, 1], [1, 1]]
      .map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    const rect = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
    if (rect.width < minSize || rect.height < minSize) continue;

    // One page can paint the same image object more than once, so the object
    // name identifies the *bitmap* while the id identifies this occurrence.
    const arg = ops.argsArray[i][0];
    const named = typeof arg === 'string';
    regions.push({
      id: named ? `${arg}#${i}` : `inline-${i}`,
      name: named ? arg : null,
      inline: !named,
      rect,
    });
  }

  // Later paints sit on top, so search them first when hit-testing a click.
  return regions.reverse();
}

// One embedded image, as a PNG data URL, by the name used in the operator list.
export async function getImageDataUrl(page, id) {
  const obj = await getImageObject(page, id);
  if (!obj) return null;
  try { return imageObjectToDataURL(obj); } catch { return null; }
}

// Crops a rectangle (in canvas CSS pixels) out of a rendered page canvas and
// returns it as a PNG data URL — the "copy this region as an image" tool.
export function cropCanvas(canvas, rect) {
  const scaleX = canvas.width / parseFloat(canvas.style.width || canvas.width);
  const scaleY = canvas.height / parseFloat(canvas.style.height || canvas.height);
  const sx = Math.max(0, Math.round(rect.x * scaleX));
  const sy = Math.max(0, Math.round(rect.y * scaleY));
  const sw = Math.max(1, Math.min(Math.round(rect.width * scaleX), canvas.width - sx));
  const sh = Math.max(1, Math.min(Math.round(rect.height * scaleY), canvas.height - sy));

  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sw, sh);
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return { dataUrl: out.toDataURL('image/png'), width: sw, height: sh };
}
