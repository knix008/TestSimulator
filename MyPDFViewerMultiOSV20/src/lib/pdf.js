// pdf.js wrapper: worker setup, document loading, page rendering, the
// selectable text layer, and extraction of the images embedded in a page.
// The `legacy` build is transpiled and polyfilled, so the same bundle runs in
// every desktop webview (WebView2, WKWebView, WebKitGTK) and in the older
// browsers a web deployment has to serve.
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
  if (typeof ctx.fillRect === 'function') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

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

// Axis-aligned bounds of the box [x0, y0, x1, y1] after the matrix m.
function boxToViewport(m, [ax, ay, bx, by]) {
  const pts = [[ax, ay], [bx, ay], [ax, by], [bx, by]]
    .map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function intersectBox(a, b) {
  return {
    x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0),
    x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1),
  };
}

// Bounds of a constructPath in its own space, from the coordinates themselves.
// pdf.js's precomputed min/max skips curve points, so a circle drawn with
// curves came back as a single point. Control points bound the curve.
function pathBounds(args) {
  const [pathOps, coords, minMax] = args || [];
  if (!pathOps || !coords) {
    return minMax && minMax.length >= 4 && Number.isFinite(minMax[0]) ? Array.from(minMax).slice(0, 4) : null;
  }
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  const add = (x, y) => {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  };
  let j = 0;
  for (const op of pathOps) {
    if (op === OPS.rectangle) {
      const [x, y, w, h] = [coords[j], coords[j + 1], coords[j + 2], coords[j + 3]];
      add(x, y); add(x + w, y + h);
      j += 4;
      continue;
    }
    const n = op === OPS.moveTo || op === OPS.lineTo ? 2
      : op === OPS.curveTo ? 6
        : op === OPS.curveTo2 || op === OPS.curveTo3 ? 4 : 0;
    for (let k = 0; k < n; k += 2) add(coords[j + k], coords[j + k + 1]);
    j += n;
  }
  return x0 <= x1 && y0 <= y1 ? [x0, y0, x1, y1] : null;
}

// Joins boxes that overlap or sit within `gap` of each other, so the many
// paths of one drawing become one figure.
function clusterBoxes(boxes, gap) {
  let list = boxes.map((b) => ({ ...b }));
  for (let changed = true; changed;) {
    changed = false;
    const out = [];
    for (const b of list) {
      const hit = out.find((o) => b.x0 - gap <= o.x1 && o.x0 - gap <= b.x1 && b.y0 - gap <= o.y1 && o.y0 - gap <= b.y1);
      if (hit) {
        hit.x0 = Math.min(hit.x0, b.x0); hit.y0 = Math.min(hit.y0, b.y0);
        hit.x1 = Math.max(hit.x1, b.x1); hit.y1 = Math.max(hit.y1, b.y1);
        changed = true;
      } else {
        out.push(b);
      }
    }
    list = out;
  }
  return list;
}

// Where each image sits on the rendered page, in viewport (CSS pixel)
// coordinates — this is what makes "click the picture to select it" possible.
//
// pdf.js paints an image by transforming the unit square, so replaying the
// operator list while tracking the current transformation matrix gives every
// image's rectangle without rendering anything.
//
// Slides often crop a large bitmap through a clip path (or a form / group
// bbox), so the clip is tracked too and each rectangle is cut down to what is
// actually visible — otherwise the outline covers the uncropped bitmap, far
// from the picture the user sees.
//
// Many books draw their figures as vector paths rather than embedding a
// bitmap. The filled / stroked paths are gathered and joined into figures
// (`vector: true`), so those pictures can be pointed at and picked as well.
export async function getPageImageRegions(page, viewport, { minSize = 24 } = {}) {
  let ops;
  try { ops = await page.getOperatorList(); } catch { return []; }

  const paintOps = new Set([OPS.paintImageXObject, OPS.paintJpegXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject]);
  const clipOps = new Set([OPS.clip, OPS.eoClip]);
  const drawOps = new Set([
    OPS.fill, OPS.eoFill, OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke,
    OPS.closeFillStroke, OPS.closeEOFillStroke,
  ]);
  const regions = [];
  const drawn = [];      // visible bounds of every painted path / shading
  const stack = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  // Visible area in viewport pixels; the page itself is the outermost clip.
  let clip = viewport.width > 0 && viewport.height > 0
    ? { x0: 0, y0: 0, x1: viewport.width, y1: viewport.height }
    : null;
  let pathBox = null;    // bounds of the last path, for a clip that follows it

  const toView = (box) => boxToViewport(combine(viewport.transform, ctm), box);
  const push = () => stack.push({ ctm: ctm.slice(), clip });
  const pop = () => {
    const s = stack.pop();
    ctm = s ? s.ctm : [1, 0, 0, 1, 0, 0];
    clip = s ? s.clip : clip;
  };
  const clipTo = (box) => { if (box) clip = clip ? intersectBox(clip, box) : box; };

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.save) { push(); continue; }
    if (fn === OPS.restore) { pop(); continue; }
    if (fn === OPS.transform) { ctm = combine(ctm, args); continue; }
    if (fn === OPS.constructPath) {
      const b = pathBounds(args);
      pathBox = b ? toView(b) : null;
      continue;
    }
    if (clipOps.has(fn)) { clipTo(pathBox); continue; }
    if (drawOps.has(fn) || fn === OPS.shadingFill) {
      // A shading fills whatever the clip leaves open.
      const b = fn === OPS.shadingFill ? clip : (pathBox && clip ? intersectBox(pathBox, clip) : pathBox);
      if (b && b.x1 > b.x0 && b.y1 > b.y0) drawn.push(b);
      continue;
    }
    // A form XObject or transparency group: its own matrix, clipped to its bbox.
    if (fn === OPS.paintFormXObjectBegin || fn === OPS.beginGroup) {
      push();
      const matrix = fn === OPS.beginGroup ? args?.[0]?.matrix : args?.[0];
      const bbox = fn === OPS.beginGroup ? args?.[0]?.bbox : args?.[1];
      if (matrix && matrix.length === 6) ctm = combine(ctm, Array.from(matrix));
      if (bbox && bbox.length === 4) clipTo(toView(bbox));
      continue;
    }
    if (fn === OPS.paintFormXObjectEnd || fn === OPS.endGroup) { pop(); continue; }
    if (!paintOps.has(fn)) continue;

    let box = toView([0, 0, 1, 1]);
    if (clip) box = intersectBox(box, clip);
    const rect = {
      x: box.x0,
      y: box.y0,
      width: Math.max(0, box.x1 - box.x0),
      height: Math.max(0, box.y1 - box.y0),
    };
    if (rect.width < minSize || rect.height < minSize) continue;

    // When the clip hides part of the bitmap, `crop` says which part of the
    // original is visible (fractions from its top-left), so copying gives
    // exactly the picture on the page. Only an upright, unmirrored placement
    // maps that simply; any other is cut from a fresh render instead (null).
    const full = toView([0, 0, 1, 1]);
    const clipped = box.x0 - full.x0 > 0.5 || box.y0 - full.y0 > 0.5 || full.x1 - box.x1 > 0.5 || full.y1 - box.y1 > 0.5;
    let crop = null;
    if (clipped) {
      const m = combine(viewport.transform, ctm);
      const upright = Math.abs(m[1]) < 1e-6 && Math.abs(m[2]) < 1e-6 && m[0] > 0 && m[3] < 0;
      const fw = full.x1 - full.x0;
      const fh = full.y1 - full.y0;
      if (upright && fw > 0 && fh > 0) {
        crop = { x: (box.x0 - full.x0) / fw, y: (box.y0 - full.y0) / fh, w: rect.width / fw, h: rect.height / fh };
      }
    }

    // One page can paint the same image object more than once, so the object
    // name identifies the *bitmap* while the id identifies this occurrence.
    const arg = args[0];
    const named = typeof arg === 'string';
    regions.push({
      id: named ? `${arg}#${i}` : `inline-${i}`,
      name: named ? arg : null,
      inline: !named,
      rect,
      frac: toFrac(rect),
      clipped,
      crop,
    });
  }

  // Later paints sit on top, so search them first when hit-testing a click.
  regions.reverse();

  // Vector figures. Page-sized fills are backgrounds and thin boxes are rules
  // or underlines, so neither counts; a figure that sits inside a bitmap
  // already listed, or is mostly that bitmap plus a frame, adds nothing — it
  // would only draw a second box around the same picture.
  const pageArea = viewport.width > 0 && viewport.height > 0 ? viewport.width * viewport.height : Infinity;
  const gap = 6 * (viewport.scale || 1);
  const figures = clusterBoxes(drawn.filter((b) => (b.x1 - b.x0) * (b.y1 - b.y0) < pageArea * 0.8), gap)
    .filter((b) => b.x1 - b.x0 >= minSize && b.y1 - b.y0 >= minSize)
    .filter((b) => !regions.some((r) => {
      const o = intersectBox(b, { x0: r.rect.x, y0: r.rect.y, x1: r.rect.x + r.rect.width, y1: r.rect.y + r.rect.height });
      const shared = Math.max(0, o.x1 - o.x0) * Math.max(0, o.y1 - o.y0);
      return shared >= 0.7 * (b.x1 - b.x0) * (b.y1 - b.y0);
    }));
  figures.forEach((b, k) => {
    const rect = { x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 };
    regions.push({
      id: `figure-${k}`,
      name: null,
      inline: false,
      vector: true,
      rect,
      frac: toFrac(rect),
    });
  });
  return regions;

  // The rectangle as fractions of the page, so it can be cut from a render at
  // any zoom — the copy does not depend on how far the view is zoomed.
  function toFrac(r) {
    if (!(viewport.width > 0 && viewport.height > 0)) return null;
    return { x: r.x / viewport.width, y: r.y / viewport.height, w: r.width / viewport.width, h: r.height / viewport.height };
  }
}

// Renders the page off screen at a high resolution and cuts out `frac` (the
// area as fractions of the page) — a picture exactly as it appears on the
// page, sharp whatever the current zoom. `rotation` is the view's rotation,
// since the fractions were measured on the rotated page.
export async function renderPageArea(page, frac, { rotation = 0, scale = 3 } = {}) {
  const unit = page.getViewport({ scale: 1, rotation: (page.rotate + rotation) % 360 });
  // Stay well inside the browser's canvas size limit.
  const s = Math.max(0.5, Math.min(scale, Math.sqrt(16e6 / (unit.width * unit.height))));
  const canvas = document.createElement('canvas');
  const { task, viewport } = await renderPage({ page, canvas, scale: s, rotation, dpr: 1 });
  await task.promise;
  const w = Math.floor(viewport.width);
  const h = Math.floor(viewport.height);
  return cropCanvas(canvas, { x: frac.x * w, y: frac.y * h, width: frac.w * w, height: frac.h * h });
}

// Cuts `crop` (fractions from the top-left) out of an image data URL.
export async function cropDataUrl(dataUrl, crop) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const sx = Math.round(crop.x * img.naturalWidth);
  const sy = Math.round(crop.y * img.naturalHeight);
  const sw = Math.max(1, Math.min(Math.round(crop.w * img.naturalWidth), img.naturalWidth - sx));
  const sh = Math.max(1, Math.min(Math.round(crop.h * img.naturalHeight), img.naturalHeight - sy));
  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  out.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return { dataUrl: out.toDataURL('image/png'), width: sw, height: sh };
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
