// Pure viewer helpers extracted so zoom, tools, selection and page geometry
// can be unit-tested without mounting the React tree.

export const HIGHLIGHT_COLOR = 'rgba(255, 214, 0, 0.42)';

export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 6, 8];

export const TOOLS = ['text', 'image', 'region'];

export const MIN_CAPTURE = 6;

export const PAGE_PAD_X = 56;
export const PAGE_PAD_Y = 48;
export const SPREAD_GAP = 0; // facing pages meet at the binding, as in a printed book

export const PAGE_LAYOUTS = ['single', 'continuous', 'spread'];

export const ZOOM_MODES = ['fit-page', 'fit-width', 'fit-height', 'actual', 'custom'];
export const FIT_ZOOM_MODES = ['fit-page', 'fit-width', 'fit-height', 'actual'];

export function normalizePageLayout(layout) {
  return PAGE_LAYOUTS.includes(layout) ? layout : 'continuous';
}

export function normalizeZoomMode(mode) {
  return ZOOM_MODES.includes(mode) ? mode : 'fit-width';
}

export function zoomModeLabelKey(mode) {
  switch (mode) {
    case 'fit-width': return 'fitWidth';
    case 'fit-page': return 'fitPage';
    case 'fit-height': return 'fitHeight';
    default: return 'actual';
  }
}

export function isPagedLayout(layout) {
  return layout === 'single' || layout === 'spread';
}

// Single / spread only mount the current sheet, so those pages must paint
// even if an IntersectionObserver frame thinks they sit outside the viewport
// (two facing pages can leave only the gutter in view while they overflow).
export function paintsEagerly(layout) {
  return isPagedLayout(layout);
}

// Single / spread mount one sheet, but the scrollbar still represents the
// whole document — the same way continuous view does.
export function usesDocumentScroll(layout) {
  return layout === 'single' || layout === 'spread';
}

export function sheetCountForScroll(layout, numPages) {
  const n = Math.max(0, Number(numPages) || 0);
  return layout === 'spread' ? Math.ceil(n / 2) : n;
}

export function sheetIndexForScroll(layout, page, numPages) {
  if (layout === 'spread') return Math.floor((spreadStart(page, numPages) - 1) / 2);
  return clampPage(page, numPages) - 1;
}

export function sheetSlotHeight({
  pageHeight, viewportHeight = 0, fillViewport = false, gap = SPREAD_GAP,
} = {}) {
  const page = Math.max(1, Number(pageHeight) || 0);
  const slot = page + gap;
  if (!fillViewport) return slot;
  return Math.max(slot, Number(viewportHeight) || 0);
}

export function pageFromDocumentScroll(scrollTop, {
  slot, sheets, layout, numPages,
} = {}) {
  if (!(slot > 0) || !(sheets > 0)) return 1;
  const index = Math.min(sheets - 1, Math.max(0, Math.floor((Number(scrollTop) || 0) / slot)));
  if (layout === 'spread') return clampPage(index * 2 + 1, numPages);
  return clampPage(index + 1, numPages);
}

export function documentScrollTopForPage(page, { slot, layout, numPages } = {}) {
  return Math.max(0, sheetIndexForScroll(layout, page, numPages) * (Number(slot) || 0));
}

export function pinDocumentScrollTop(page, metrics, fracY = 0) {
  const base = documentScrollTopForPage(page, metrics);
  const slot = Number(metrics?.slot) || 0;
  const ratio = Math.min(1, Math.max(0, Number(fracY) || 0));
  return Math.max(0, base + ratio * slot);
}

// Keep the middle of the current sheet on the middle of the pane, so zooming
// in or out grows around the centre of the window instead of the top edge.
export function centerDocumentSheetTop(page, metrics, viewportHeight) {
  const base = documentScrollTopForPage(page, metrics);
  const slot = Number(metrics?.slot) || 0;
  const view = Math.max(0, Number(viewportHeight) || 0);
  const extra = slot - view;
  return Math.max(0, base + (extra > 0 ? extra / 2 : 0));
}

// Where to pin a paged sheet: the top (or foot, after scrolling up off the
// previous page). A sheet that still fits the pane stays centred.
export function documentSheetScrollTop(page, metrics, viewportHeight, edge) {
  const base = documentScrollTopForPage(page, metrics);
  const slot = Number(metrics?.slot) || 0;
  const view = Math.max(0, Number(viewportHeight) || 0);
  if (edge === 'bottom') return Math.max(0, base + Math.max(0, slot - view));
  if (edge === 'top') return base;
  if (slot > view + 1) return base;
  return centerDocumentSheetTop(page, metrics, view);
}

// Keep the same offset inside the slot when the spacers move with the page
// number. Re-centring independently of the old scrollTop is what made a turn
// hitch upward before the leaf moved.
export function shiftDocumentScrollTop(fromPage, toPage, scrollTop, metrics) {
  const from = documentScrollTopForPage(fromPage, metrics);
  const to = documentScrollTopForPage(toPage, metrics);
  return Math.max(0, (Number(scrollTop) || 0) + (to - from));
}

// Wheel in a paged view: turn the page when this sheet fits, or when the
// pane is already at that edge of the sheet. The document scrollbar is
// taller than one page, so overflow must be judged against the slot, not
// the whole scrollHeight.
export function wheelPageStep(deltaY, {
  scrollTop = 0, scrollHeight = 0, clientHeight = 0, slot = 0, pageTop = 0,
} = {}) {
  const dy = Number(deltaY) || 0;
  if (dy === 0) return 0;
  const view = Number(clientHeight) || 0;
  const base = Number(pageTop) || 0;
  const sheet = Number(slot) > 0
    ? Number(slot)
    : Math.max(0, (Number(scrollHeight) || 0) - base);
  if (!(sheet > view + 1)) return dy > 0 ? 1 : -1;
  const top = Number(scrollTop) || 0;
  const maxOnSheet = Math.max(base, base + sheet - view);
  if (dy > 0 && top >= maxOnSheet - 1) return 1;
  if (dy < 0 && top <= base + 1) return -1;
  return 0;
}

export function documentScrollTail(page, { slot, sheets, layout, numPages } = {}) {
  const index = sheetIndexForScroll(layout, page, numPages);
  return Math.max(0, ((Number(sheets) || 0) - 1 - index) * (Number(slot) || 0));
}

// Pair pages as 1–2, 3–4, … so an even page stays with the one before it.
export function spreadStart(page, numPages) {
  const n = clampPage(page, numPages);
  return n % 2 === 0 ? n - 1 : n;
}

export function pagesForLayout(layout, pageNumber, numPages) {
  if (!numPages || numPages < 1) return [];
  if (layout === 'single') return [clampPage(pageNumber, numPages)];
  if (layout === 'spread') {
    const start = spreadStart(pageNumber, numPages);
    return start + 1 <= numPages ? [start, start + 1] : [start];
  }
  return Array.from({ length: numPages }, (_, i) => i + 1);
}

export function spreadLonePage(layout, pages) {
  return layout === 'spread' && Array.isArray(pages) && pages.length === 1;
}

export function sameSheet(layout, a, b, numPages) {
  if (layout === 'spread') return spreadStart(a, numPages) === spreadStart(b, numPages);
  return clampPage(a, numPages) === clampPage(b, numPages);
}

export function stepPage(layout, page, dir, numPages) {
  const current = clampPage(page, numPages);
  if (layout !== 'spread') {
    return clampPage(current + (dir < 0 ? -1 : 1), numPages);
  }
  const from = spreadStart(current, numPages);
  const next = from + (dir < 0 ? -2 : 2);
  // Stay on this pair: there is no facing sheet before page 1 or after the last page.
  if (next < 1 || next > numPages) return current;
  return next;
}

export const PAGE_EFFECTS = ['none', 'fade', 'slide', 'flip'];
export const PAGE_TURN_MS = 640;
export const TURN_SETTLE_MS = 120;

export function isTurnBusy(pageTurn, busyUntil, now = Date.now()) {
  if (pageTurn) return true;
  return (Number(now) || 0) < (Number(busyUntil) || 0);
}

export function normalizePageEffect(id) {
  return PAGE_EFFECTS.includes(id) ? id : 'none';
}

export function nextPageEffect(id) {
  const cur = normalizePageEffect(id);
  return PAGE_EFFECTS[(PAGE_EFFECTS.indexOf(cur) + 1) % PAGE_EFFECTS.length];
}

export function pageTurnDir(fromPage, toPage) {
  return Number(toPage) > Number(fromPage) ? 'next' : 'prev';
}

// CSS class on the turning leaf: next = the right leaf coming over, prev = the left.
export function pageTurnLeafDir(dir) {
  return dir === 'prev' ? 'back' : 'forward';
}

export function prefersReducedMotion(media = globalThis.matchMedia) {
  try {
    return typeof media === 'function' && !!media('(prefers-reduced-motion: reduce)')?.matches;
  } catch {
    return false;
  }
}

export function shouldPlayPageTurn({ effect, layout, fromPage, toPage, reducedMotion = false } = {}) {
  if (reducedMotion || normalizePageEffect(effect) === 'none') return false;
  // Fade / slide / flip only make sense when one sheet replaces another.
  if (!isPagedLayout(layout)) return false;
  const from = Number(fromPage);
  const to = Number(toPage);
  return Number.isFinite(from) && Number.isFinite(to) && from !== to;
}

// The sheet that leaves the screen: one page, or a facing pair.
export function outgoingSheetPages(layout, page, numPages) {
  if (layout === 'spread') return pagesForLayout('spread', page, numPages);
  const n = clampPage(page, numPages);
  return numPages > 0 ? [n] : [];
}

export function sheetIsPainted(pageMap, nums) {
  const list = Array.isArray(nums) ? nums : [];
  return list.length > 0 && list.every((n) => pageMap?.get?.(n)?.painted === true);
}

// Decide whether to keep the last painted sheet over the incoming one.
export function planPageTurn({
  effect, layout, fromPage, toPage, reducedMotion = false,
  fromScroll = false, hasShots = false, incomingPainted = false,
} = {}) {
  if (fromScroll || !hasShots) return null;
  if (!isPagedLayout(layout)) return null;
  const play = shouldPlayPageTurn({ effect, layout, fromPage, toPage, reducedMotion });
  if (!play && incomingPainted) return null;
  return {
    effect: play ? normalizePageEffect(effect) : 'none',
    dir: pageTurnDir(fromPage, toPage),
    ready: !!incomingPainted,
  };
}

// Document spacers stay on the page being left until the overlay is gone.
// Moving them with pageNumber is what popped the sheet up before a turn.
export function turnSpacerPage(pageTurn, pageNumber, holdPage) {
  const hold = Number(holdPage);
  if (Number.isFinite(hold) && hold > 0) return hold;
  const from = Number(pageTurn?.fromPage);
  if (Number.isFinite(from) && from > 0) return from;
  return pageNumber;
}

export function overlayBoxForSheet(stage, wrap) {
  if (!stage || typeof stage.getBoundingClientRect !== 'function') return null;
  const wraps = (Array.isArray(wrap) ? wrap : [wrap])
    .filter((el) => el && typeof el.getBoundingClientRect === 'function');
  if (!wraps.length) return null;
  const s = stage.getBoundingClientRect();
  let top = Infinity;
  let left = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const el of wraps) {
    const b = el.getBoundingClientRect();
    top = Math.min(top, b.top);
    left = Math.min(left, b.left);
    right = Math.max(right, b.right);
    bottom = Math.max(bottom, b.bottom);
  }
  return {
    top: top - s.top,
    left: left - s.left,
    width: right - left,
    height: bottom - top,
  };
}

export function applyOverlayBox(el, box) {
  if (!el?.style) return;
  if (!box) {
    el.style.inset = '';
    el.style.top = '';
    el.style.left = '';
    el.style.width = '';
    el.style.height = '';
    el.style.padding = '';
    el.style.alignItems = '';
    el.style.justifyContent = '';
    return;
  }
  el.style.inset = 'auto';
  el.style.padding = '0px';
  el.style.alignItems = 'stretch';
  el.style.justifyContent = 'stretch';
  el.style.top = `${box.top}px`;
  el.style.left = `${box.left}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
}

export function sheetOverlapsViewport(root, wrap, pad = 8) {
  if (!root || !wrap || typeof root.getBoundingClientRect !== 'function') return false;
  if (typeof wrap.getBoundingClientRect !== 'function') return false;
  const a = root.getBoundingClientRect();
  const b = wrap.getBoundingClientRect();
  const gap = Number(pad) || 0;
  return b.bottom > a.top + gap && b.top < a.bottom - gap
    && b.right > a.left + gap && b.left < a.right - gap;
}

export function captureOutgoingSheet(pageMap, layout, page, numPages) {
  return snapshotPageCanvases(pageMap, outgoingSheetPages(layout, page, numPages));
}

// The page that swings over: the right leaf going forward, the left going back.
export function leafFrontShot(shots, dir) {
  if (!Array.isArray(shots) || !shots.length) return null;
  return dir === 'prev' ? shots[0] : shots[shots.length - 1];
}

// The facing page that does not swing: old left going forward, old right
// going back. Without it the live sheet is already the incoming pair.
export function leafStayShot(shots, dir) {
  if (!Array.isArray(shots) || shots.length < 2) return null;
  return dir === 'prev' ? shots[shots.length - 1] : shots[0];
}

export function leafStayBlank(layout, shots, dir) {
  return layout === 'spread' && !leafStayShot(shots, dir);
}

export function leafStaySide(dir) {
  return dir === 'prev' ? 'right' : 'left';
}

// Two-page view: the other side of the turning half (new left going forward,
// new right going back). One-page view keeps the new sheet still underneath —
// putting it on the leaf made the page being turned show the incoming content.
export function leafBackPage(layout, dir, toPage, numPages) {
  if (layout !== 'spread') return 0;
  const incoming = pagesForLayout(layout, toPage, numPages);
  if (!incoming.length) return 0;
  return dir === 'prev' ? incoming[incoming.length - 1] : incoming[0];
}

export function leafBackShot(pageMap, layout, dir, toPage, numPages) {
  const num = leafBackPage(layout, dir, toPage, numPages);
  if (!num) return null;
  return snapshotPageCanvases(pageMap, [num])[0] || null;
}

export function turnLeafSize(layout, shotCount) {
  return layout === 'spread' ? 'half' : 'whole';
}

export function sheetShotBox(shots) {
  const list = Array.isArray(shots) ? shots : [];
  if (!list.length) return null;
  const width = list.reduce((sum, s) => sum + (Number(s.width) || 0), 0);
  const height = Math.max(0, ...list.map((s) => Number(s.height) || 0));
  if (!(width > 0 && height > 0)) return null;
  return { width, height };
}

// JPEG snapshot of already-rasterized pages so a turn can keep the old sheet
// on screen while the new pages mount.
export function snapshotPageCanvases(pageMap, nums) {
  const list = Array.isArray(nums) ? nums : [];
  const out = [];
  for (const num of list) {
    const entry = pageMap?.get?.(num);
    const canvas = entry?.canvas;
    if (!canvas || canvas.width < 2 || canvas.height < 2) return [];
    let src = '';
    try { src = canvas.toDataURL('image/jpeg', 0.92); } catch { return []; }
    if (!src) return [];
    out.push({
      num,
      src,
      width: entry.wrapper?.offsetWidth || parseFloat(canvas.style.width) || canvas.width,
      height: entry.wrapper?.offsetHeight || parseFloat(canvas.style.height) || canvas.height,
    });
  }
  return out;
}

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

// When the sheet is wider than the viewport, keep the visible slice on the
// middle of the page. A left-aligned overflow looks off-centre after a resize.
export function centerOverflowX(el) {
  if (!el) return 0;
  const extra = (el.scrollWidth || 0) - (el.clientWidth || 0);
  const left = extra > 0 ? extra / 2 : 0;
  if (Math.abs((el.scrollLeft || 0) - left) > 0.5) el.scrollLeft = left;
  return left;
}

export function centerOverflowY(el) {
  if (!el) return 0;
  const extra = (el.scrollHeight || 0) - (el.clientHeight || 0);
  const top = extra > 0 ? extra / 2 : 0;
  if (Math.abs((el.scrollTop || 0) - top) > 0.5) el.scrollTop = top;
  return top;
}

export function shouldCenterSheet({ layout } = {}) {
  return isPagedLayout(layout);
}

export function computeScale({ baseSize, viewport, zoomMode, zoom, rotation, layout }) {
  if (!baseSize || !viewport?.width) return zoomMode === 'custom' ? zoom : 1;
  const rotated = (rotation / 90) % 2 !== 0;
  const w = rotated ? baseSize.height : baseSize.width;
  const h = rotated ? baseSize.width : baseSize.height;
  const cols = layout === 'spread' ? 2 : 1;
  const rowW = cols * w + (cols - 1) * SPREAD_GAP;
  const fitWidth = Math.max(0.1, (viewport.width - PAGE_PAD_X) / rowW);
  const fitHeight = Math.max(0.1, (viewport.height - PAGE_PAD_Y) / h);
  const fitPage = Math.max(0.1, Math.min(fitWidth, fitHeight));
  // Two facing pages always fill the pane. A single page starts fitted too,
  // but the user can zoom — computeScale then follows zoomMode.
  if (layout === 'spread') return fitPage;
  switch (zoomMode) {
    case 'fit-width': return fitWidth;
    case 'fit-page': return fitPage;
    case 'fit-height': return fitHeight;
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

// A finished region lives as a 0..1 box on its page so zoom / layout
// changes do not wipe the rectangle the user just drew.
export function regionToFrac(rect, pageW, pageH) {
  const w = Number(pageW) || 0;
  const h = Number(pageH) || 0;
  if (w <= 0 || h <= 0 || !rect) return null;
  return {
    x: rect.x / w,
    y: rect.y / h,
    w: rect.width / w,
    h: rect.height / h,
  };
}

export function regionMarkStyle(mark) {
  if (!mark || mark.w == null || mark.h == null) return null;
  return {
    left: `${mark.x * 100}%`,
    top: `${mark.y * 100}%`,
    width: `${mark.w * 100}%`,
    height: `${mark.h * 100}%`,
  };
}

// What the page paints: the live drag, or the committed mark after release.
export function visibleRegionBox(drag, mark) {
  if (drag) {
    const r = normalizeDragRect(drag);
    return { left: r.x, top: r.y, width: r.width, height: r.height };
  }
  return regionMarkStyle(mark);
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
