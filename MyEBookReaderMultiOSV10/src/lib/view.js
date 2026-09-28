// Pure view helpers.
//
// Zoom steps, reading typography, window titles, error text and popup geometry
// all live here rather than inside components, so they can be unit-tested
// without mounting React or opening a window.

export const APP_NAME = 'MyEBookReader';

export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 6, 8];

export const FONT_SCALE_MIN = 0.6;
export const FONT_SCALE_MAX = 3;

export const READING_WIDTHS = [520, 640, 760, 900, 1100, 0]; // 0 = fill the pane

/** Next discrete zoom step. `dir` > 0 zooms in, otherwise out. */
export function nextZoom(current, dir) {
  const idx = ZOOM_STEPS.findIndex((z) => z > current + 0.001);
  return dir > 0
    ? ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, idx === -1 ? ZOOM_STEPS.length - 1 : idx)]
    : ZOOM_STEPS[Math.max(0, (idx === -1 ? ZOOM_STEPS.length : idx) - 2)];
}

/** Ctrl+wheel over reflowable text scales the type rather than the page. */
export function nextFontScale(current, dir, step = 0.1) {
  const base = Number.isFinite(Number(current)) ? Number(current) : 1;
  const next = Math.round((base + (dir > 0 ? step : -step)) * 100) / 100;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, next));
}

export function clampSection(n, count) {
  if (!count || count < 1) return 0;
  const value = Number(n);
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(0, Math.round(value)), count - 1);
}

export function clamp01(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeRotation(deg) {
  return ((Number(deg) || 0) % 360 + 360) % 360;
}

// Electron wraps main-process errors as
// "Error invoking remote method 'fs:readBinary': Error: …"
export function stripRemoteError(raw) {
  return String(raw ?? '').replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, '');
}

export function failMessage(err) {
  return stripRemoteError(err?.message || String(err) || 'Unknown error');
}

/** Builds the copyable text of an error report. */
export function errorReport(error, labels = {}) {
  return [
    `${APP_NAME} — ${labels.title || 'Error'}`,
    error?.context ? `${labels.what || 'While'}: ${error.context}` : '',
    `${labels.message || 'Message'}: ${error?.message || ''}`,
    error?.file ? `File: ${error.file}` : '',
    `Time: ${new Date(error?.at || Date.now()).toISOString()}`,
    error?.details ? `\n${labels.details || 'Details'}:\n${error.details}` : '',
  ].filter(Boolean).join('\n');
}

export function windowTitle(fileName, dirty) {
  if (!fileName) return APP_NAME;
  return `${fileName}${dirty ? ' •' : ''} — ${APP_NAME}`;
}

/**
 * Keeps a popup fully inside a rectangle. If it would hang off the bottom it
 * flips above the anchor; the remaining edges are then clamped.
 */
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

/** How wide a fixed-layout page should be drawn. */
export function computePageScale({ pageSize, viewport, zoomMode, zoom, rotation = 0, padX = 56, padY = 56 }) {
  if (!pageSize?.width || !viewport?.width) return zoomMode === 'custom' ? zoom : 1;
  const rotated = (normalizeRotation(rotation) / 90) % 2 !== 0;
  const w = rotated ? pageSize.height : pageSize.width;
  const h = rotated ? pageSize.width : pageSize.height;
  switch (zoomMode) {
    case 'fit-width': return Math.max(0.1, (viewport.width - padX) / w);
    case 'fit-height': return Math.max(0.1, (viewport.height - padY) / h);
    case 'fit-page': return Math.max(0.1, Math.min((viewport.width - padX) / w, (viewport.height - padY) / h));
    case 'actual': return 1;
    default: return Number(zoom) || 1;
  }
}

/**
 * CSS variables for the reading pane, from the reading settings.
 * Everything the reader can change about text lives in these.
 */
export function readingStyle(settings) {
  const scale = Number(settings?.fontScale) || 1;
  return {
    '--read-font': settings?.readerFont ? `'${settings.readerFont}'` : 'inherit',
    '--read-size': `${Math.round(17 * scale * 100) / 100}px`,
    '--read-line': String(settings?.lineHeight || 1.7),
    '--read-width': settings?.readingWidth ? `${settings.readingWidth}px` : '100%',
    '--read-align': settings?.justify ? 'justify' : 'start',
    '--read-indent': settings?.paragraphIndent ? '1.4em' : '0',
    '--read-gap': `${Number(settings?.paragraphGap ?? 0.7)}em`,
    '--read-letter': `${Number(settings?.letterSpacing || 0)}px`,
    '--read-weight': settings?.readerBold ? '600' : 'normal',
    '--read-style': settings?.readerItalic ? 'italic' : 'normal',
    '--read-decoration': settings?.readerUnderline ? 'underline' : 'none',
  };
}

/** Which panel a keyboard toggle should show next. */
export function nextPanel(panel, fallback = 'contents') {
  return panel === 'none' ? fallback : 'none';
}

/** Page count of a reflowable section once it is laid out in columns. */
export function columnPageCount(scrollWidth, clientWidth) {
  const w = Number(clientWidth) || 0;
  if (w <= 0) return 1;
  return Math.max(1, Math.round((Number(scrollWidth) || 0) / w));
}

/** Which column page a scroll offset is showing. */
export function columnPageAt(scrollLeft, clientWidth) {
  const w = Number(clientWidth) || 0;
  if (w <= 0) return 0;
  return Math.max(0, Math.round((Number(scrollLeft) || 0) / w));
}

/** Reading progress over the whole book, 0..1. */
export function bookProgress({ section, sectionCount, fracY = 0 }) {
  const count = Math.max(1, Number(sectionCount) || 1);
  const index = clampSection(section, count);
  return clamp01((index + clamp01(fracY)) / count);
}

/** First non-empty string among candidates — used for copy / bookmark text. */
export function pickText(...candidates) {
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

/** Parses "1-4, 9, 12-" into a sorted list of page numbers within 1..max. */
export function parseRange(spec, max) {
  const text = String(spec || '').trim();
  if (!text) return { pages: [], error: 'print.rangeEmpty' };
  const pages = new Set();
  for (const part of text.split(',')) {
    const chunk = part.trim();
    if (!chunk) continue;
    const match = /^(\d+)\s*(?:-\s*(\d+)?)?$/.exec(chunk);
    if (!match) return { pages: [], error: 'print.rangeBad' };
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : (/-\s*$/.test(chunk) ? max : from);
    if (!from || from > max || to > max || to < from) return { pages: [], error: 'print.rangeOutside' };
    for (let p = from; p <= to; p++) pages.add(p);
  }
  const list = [...pages].sort((a, b) => a - b);
  return list.length ? { pages: list, error: '' } : { pages: [], error: 'print.rangeEmpty' };
}

/** What "all / current / custom" means for this book. */
export function pagesForScope({ scope, custom, current, count }) {
  const max = Math.max(1, Number(count) || 1);
  if (scope === 'current') return { pages: [Math.min(max, Math.max(1, Number(current) || 1))], error: '' };
  if (scope === 'custom') return parseRange(custom, max);
  return { pages: Array.from({ length: max }, (_, i) => i + 1), error: '' };
}

export function clampPreviewIndex(index, count) {
  if (!count) return 0;
  return Math.min(Math.max(0, Number(index) || 0), count - 1);
}
