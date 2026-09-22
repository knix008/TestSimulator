// Pure viewer helpers extracted so zoom, tools, selection and page geometry
// can be unit-tested without mounting the React tree.

export const HIGHLIGHT_COLOR = 'rgba(255, 214, 0, 0.42)';

export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 6, 8];

export const TOOLS = ['text', 'image', 'region'];

export const MIN_CAPTURE = 6;

export const PAGE_PAD_X = 56;
export const PAGE_PAD_Y = 48;

// Next discrete zoom step. `dir` > 0 zooms in, otherwise out.
export function nextZoom(current, dir) {
  const idx = ZOOM_STEPS.findIndex((z) => z > current + 0.001);
  return dir > 0
    ? ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, idx === -1 ? ZOOM_STEPS.length - 1 : idx)]
    : ZOOM_STEPS[Math.max(0, (idx === -1 ? ZOOM_STEPS.length : idx) - 2)];
}

export function clampPage(n, numPages) {
  if (!numPages || numPages < 1) return 1;
  const page = Number(n);
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.round(page)), numPages);
}

export function normalizeRotation(deg) {
  return ((Number(deg) || 0) % 360 + 360) % 360;
}

export function cycleTool(tool) {
  if (tool === 'text') return 'image';
  if (tool === 'image') return 'region';
  return 'text';
}

// Electron wraps main-process errors as
// "Error invoking remote method 'fs:readBinary': Error: …"
export function stripRemoteError(raw) {
  return String(raw ?? '').replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, '');
}

export function failMessage(err) {
  const raw = err?.message || String(err) || 'Unknown error';
  return stripRemoteError(raw);
}

export function windowTitle(fileName, dirty) {
  if (!fileName) return 'MyPDFViewer';
  return `${fileName}${dirty ? ' •' : ''} — MyPDFViewer`;
}

export function bookmarkLabel(selectionText, pageFallback) {
  return (selectionText || '').trim().slice(0, 60) || pageFallback;
}

export function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

// A bookmark remembers where on the page it was taken: selection rectangles
// when the user had text selected, otherwise the current reading position.
export function bookmarkRecord({ page, label, selection, viewY } = {}) {
  const rects = (selection?.rects || []).filter((r) => r && Number.isFinite(r.x) && Number.isFinite(r.y));
  const y = rects[0] ? clamp01(rects[0].y) : clamp01(viewY);
  return {
    page,
    label,
    y,
    ...(rects.length ? { rects } : {}),
    ...(selection?.text ? { text: String(selection.text).slice(0, 200) } : {}),
  };
}

export function bookmarkAnchorY(bookmark) {
  return clamp01(bookmark?.rects?.[0]?.y ?? bookmark?.y);
}

// Line boxes to paint behind bookmarked text — a fill only, like Acrobat's
// selected-text highlight, never a framed rectangle.
export function bookmarkPaintRects(bookmark) {
  return (bookmark?.rects || []).map((r) => ({
    x: Number(r.x) || 0,
    y: Number(r.y) || 0,
    w: Number(r.w ?? r.width) || 0,
    h: Number(r.h ?? r.height) || 0,
  })).filter((r) => r.w > 0 && r.h > 0);
}

// Vertical landing on a page: fracY is 0 at the top (used by bookmarks);
// pdfTop is PDF user-space from the bottom (used by destinations).
export function locFromTop(loc, pdfHeight) {
  if (loc?.fracY != null && Number.isFinite(Number(loc.fracY))) return clamp01(loc.fracY);
  if (loc?.pdfTop != null && pdfHeight > 0) {
    return 1 - clamp01(loc.pdfTop / pdfHeight);
  }
  return null;
}

export function hasPageLoc(loc) {
  return loc?.fracY != null || loc?.pdfTop != null;
}

// First non-empty string among clipboard / menu candidates. Clicking a
// context menu collapses the live window selection, so callers snapshot
// stored text before the click and pass it first.
export function pickCopyText(...candidates) {
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

// Painted line blocks (CSS px on the page) → normalised highlight rects.
export function paintedSelectionToRects(lines, box) {
  const w = Number(box?.width) || 0;
  const h = Number(box?.height) || 0;
  if (!lines?.length || w <= 0 || h <= 0) return [];
  return lines.map((l) => ({
    x: l.left / w,
    y: l.top / h,
    w: l.width / w,
    h: l.height / h,
  }));
}

export function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

export function computeScale({ baseSize, viewport, zoomMode, zoom, rotation }) {
  if (!baseSize || !viewport?.width) return zoomMode === 'custom' ? zoom : 1;
  const rotated = (rotation / 90) % 2 !== 0;
  const w = rotated ? baseSize.height : baseSize.width;
  const h = rotated ? baseSize.width : baseSize.height;
  switch (zoomMode) {
    case 'fit-width': return Math.max(0.1, (viewport.width - PAGE_PAD_X) / w);
    case 'fit-page': return Math.max(0.1, Math.min((viewport.width - PAGE_PAD_X) / w, (viewport.height - PAGE_PAD_Y) / h));
    case 'actual': return 1;
    default: return zoom;
  }
}

export function pagePlaceholderSize({ size, baseSize, scale, rotation }) {
  const src = size || baseSize;
  if (!src) return { width: 600, height: 850 };
  const rotated = (rotation / 90) % 2 !== 0;
  return {
    width: Math.round((rotated ? src.height : src.width) * scale),
    height: Math.round((rotated ? src.width : src.height) * scale),
  };
}

// Merge client rectangles that sit on the same visual line.
export function mergeRectsIntoLines(rects) {
  const items = [...rects]
    .filter((r) => r.width > 0.5 && r.height > 0.5)
    .map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }))
    .sort((a, b) => a.top - b.top || a.left - b.left);

  const lines = [];
  for (const r of items) {
    const mid = (r.top + r.bottom) / 2;
    const line = lines.find((l) => mid >= l.top - 1 && mid <= l.bottom + 1);
    if (line) {
      line.left = Math.min(line.left, r.left);
      line.right = Math.max(line.right, r.right);
      line.top = Math.min(line.top, r.top);
      line.bottom = Math.max(line.bottom, r.bottom);
    } else {
      lines.push({ ...r });
    }
  }
  return lines;
}

export function hitTestRegion(regions, pt) {
  return (regions || []).find((r) => (
    pt.x >= r.rect.x && pt.x <= r.rect.x + r.rect.width
    && pt.y >= r.rect.y && pt.y <= r.rect.y + r.rect.height
  )) || null;
}

export function normalizeDragRect(drag) {
  return {
    x: Math.min(drag.x0, drag.x1),
    y: Math.min(drag.y0, drag.y1),
    width: Math.abs(drag.x1 - drag.x0),
    height: Math.abs(drag.y1 - drag.y0),
  };
}

export function isMeaningfulCapture(rect) {
  return !!rect && rect.width >= MIN_CAPTURE && rect.height >= MIN_CAPTURE;
}

export function nextSidebar(sidebar) {
  return sidebar === 'none' ? 'thumbnails' : 'none';
}

// Keep a popup (context menu, dropdown) fully inside the window. If it would
// hang off the bottom, flip it above the anchor; then clamp remaining edges.
export function clampPopupPos({ x, y, width, height, viewW, viewH, pad = 6 }) {
  const vw = Math.max(0, Number(viewW) || 0);
  const vh = Math.max(0, Number(viewH) || 0);
  const w = Math.max(0, Number(width) || 0);
  const h = Math.max(0, Number(height) || 0);
  const p = Math.max(0, Number(pad) || 0);

  let left = Number(x) || 0;
  let top = Number(y) || 0;

  if (left + w > vw - p) left = vw - w - p;
  if (left < p) left = p;

  if (top + h > vh - p) top = top - h;
  if (top < p) top = p;
  if (top + h > vh - p) top = Math.max(p, vh - h - p);

  return { x: Math.round(left), y: Math.round(top) };
}
