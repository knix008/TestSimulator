// pdf.js wrapper: worker setup, document loading, page rendering, the
// selectable text layer, and extraction of the images embedded in a page.
// The `legacy` build is transpiled and polyfilled, so the same bundle runs in
// Electron's Chromium and in the older browsers a web deployment has to serve.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { normalizeComment } from './comments.js';

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

// Loads a PDF from raw bytes. `onProgress({loaded,total})` fires while pdf.js
// parses; `onPassword(retry, reason)` is called for encrypted documents.
export function loadDocument({ data, onProgress, onPassword }) {
  // pdf.js takes ownership of (and detaches) the buffer it is handed, so pass
  // a copy — the caller keeps the original for "save a copy" / reload.
  const task = pdfjsLib.getDocument({
    data: data instanceof Uint8Array ? data.slice() : new Uint8Array(data),
    ...ASSET_OPTIONS,
  });
  if (onProgress) task.onProgress = onProgress;
  if (onPassword) task.onPassword = onPassword;
  return task;
}

// Renders one page into `canvas` at `scale` (CSS px per PDF pt) and `rotation`
// degrees, honouring the display's device pixel ratio for crisp text.
// Returns the CSS size and the viewport used.
export async function renderPage({ page, canvas, scale, rotation = 0, dpr = window.devicePixelRatio || 1 }) {
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

// Builds the invisible, selectable text layer that sits on top of the canvas.
//
// pdf.js writes each span's size as `font-size: calc(var(--scale-factor)*Npx)`,
// so the container must carry that variable — without it every span silently
// falls back to the inherited 14px and the selection no longer lines up with
// the glyphs. `--total-scale-factor` is the name pdf.js 5.x uses; setting both
// keeps this correct across an upgrade.
export async function renderTextLayer({ page, container, viewport }) {
  container.replaceChildren();
  container.style.setProperty('--scale-factor', String(viewport.scale));
  container.style.setProperty('--total-scale-factor', String(viewport.scale));
  const textContent = await page.getTextContent();
  const layer = new TextLayer({ textContentSource: textContent, container, viewport });
  await layer.render();

  // The guard block that keeps a drag from grabbing text elsewhere on the page
  // — see the selection code in components/PdfView.jsx for what drives it.
  // pdf.js's own viewer appends this in TextLayerBuilder; the bare TextLayer
  // class this uses renders the spans and nothing else.
  const end = document.createElement('div');
  end.className = 'endOfContent';
  container.append(end);

  return layer;
}

// Plain text of a page, with pdf.js's own line breaks preserved.
export async function getPageText(page) {
  const content = await page.getTextContent();
  let out = '';
  for (const item of content.items) {
    if (typeof item.str === 'string') out += item.str;
    if (item.hasEOL) out += '\n';
  }
  return out;
}

// Resolves an image object from the page's object stores. pdf.js resolves them
// asynchronously while the page renders, so the callback form is required.
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

// Every bitmap the page paints, as PNG data URLs. Duplicates (the same XObject
// drawn several times) are collapsed. Tiny images — bullets, rules, 1px
// spacers — are filtered out by `minSize`.
export async function extractPageImages(page, { minSize = 24, onProgress } = {}) {
  const ops = await page.getOperatorList();
  const wanted = new Set([OPS.paintImageXObject, OPS.paintImageXObjectRepeat, OPS.paintJpegXObject]);

  const names = [];
  const seen = new Set();
  for (let i = 0; i < ops.fnArray.length; i++) {
    if (!wanted.has(ops.fnArray[i])) continue;
    const name = ops.argsArray[i]?.[0];
    if (typeof name !== 'string' || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }

  const images = [];
  for (let i = 0; i < names.length; i++) {
    onProgress?.({ done: i, total: names.length });
    const obj = await getImageObject(page, names[i]);
    if (!obj || obj.width < minSize || obj.height < minSize) continue;
    let dataUrl = null;
    try { dataUrl = imageObjectToDataURL(obj); } catch { dataUrl = null; }
    if (!dataUrl) continue;
    images.push({ id: names[i], width: obj.width, height: obj.height, dataUrl });
  }
  onProgress?.({ done: names.length, total: names.length });
  return images;
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

// Document outline (bookmarks) as a tree: each node keeps its children, so the
// sidebar can render it as a collapsible tree rather than an indented list.
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

// Resolves a destination (named or explicit) to a 1-based page and, when the
// dest is XYZ / FitH, the PDF-space Y to scroll to (origin at the page bottom).
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

export async function destToPage(doc, dest) {
  const loc = await destToLocation(doc, dest);
  return loc?.page ?? null;
}

const LINK_TYPE = 2; // pdf.js AnnotationType.LINK

// Clickable in-page links (TOC entries, cross-refs, URLs) in viewport pixels.
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
    const x1 = vr[0]; const y1 = vr[1]; const x2 = vr[2]; const y2 = vr[3];
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

// Highlight / underline / sticky-note / FreeText comments in viewport pixels.
export async function getPageComments(page, viewport) {
  let annots = [];
  try { annots = await page.getAnnotations({ intent: 'display' }); } catch { return []; }
  const convert = typeof viewport?.convertToViewportRectangle === 'function'
    ? (r) => viewport.convertToViewportRectangle(r)
    : null;
  const out = [];
  for (const a of annots || []) {
    const comment = normalizeComment(a, { convertRect: convert, id: `c${out.length}` });
    if (comment) out.push(comment);
  }
  return out;
}

// Every comment in the document, with the page and a 0..1 landing so the
// sidebar list can jump to the marked passage.
export async function getDocumentComments(doc, { onProgress, signal } = {}) {
  const total = doc?.numPages || 0;
  const out = [];
  for (let i = 1; i <= total; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const found = await getPageComments(page, viewport);
    const h = Number(viewport?.height) || 1;
    for (const c of found) {
      const y = Number(c.rects?.[0]?.y) || 0;
      out.push({
        ...c,
        page: i,
        fracY: h > 0 ? Math.min(1, Math.max(0, y / h)) : 0,
      });
    }
    onProgress?.({ done: i, total });
  }
  return out;
}

// Title / author / producer, plus the raw info dictionary for the properties view.
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

// Finds every occurrence of `query` and returns { page, index, snippet } hits.
export async function searchDocument(doc, query, { onProgress, signal } = {}) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits = [];
  for (let p = 1; p <= doc.numPages; p++) {
    if (signal?.aborted) break;
    onProgress?.({ done: p - 1, total: doc.numPages });
    const page = await doc.getPage(p);
    const text = (await getPageText(page)).replace(/\s+/g, ' ');
    const hay = text.toLowerCase();
    let pageHit = 0;
    let from = 0;
    for (;;) {
      const at = hay.indexOf(needle, from);
      if (at === -1) break;
      hits.push({
        page: p,
        index: at,
        pageHit,
        snippet: text.slice(Math.max(0, at - 40), at + needle.length + 40).trim(),
        match: text.slice(at, at + needle.length),
      });
      pageHit += 1;
      from = at + needle.length;
      if (hits.length > 2000) break;
    }
    page.cleanup();
    if (hits.length > 2000) break;
  }
  onProgress?.({ done: doc.numPages, total: doc.numPages });
  return hits;
}
