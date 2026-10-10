// Pure view helpers.
//
// Zoom steps, reading typography, window titles, error text and popup geometry
// all live here rather than inside components, so they can be unit-tested
// without mounting React or opening a window.

export const APP_NAME = 'MyEBookReader';

export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 6, 8];

export const FONT_SCALE_MIN = 0.6;
export const FONT_SCALE_MAX = 3;
/** The body size at scale 1. Every readout shows this many pixels, not a percent. */
export const READ_FONT_PX = 17;

/** The reading size in whole pixels. Scale 1 is {@link READ_FONT_PX}. */
export function fontPixels(scale) {
  const n = Number(scale);
  const factor = Number.isFinite(n) && n > 0 ? n : 1;
  return Math.round(READ_FONT_PX * factor);
}

/** The scale a pixel size writes. The ends stay inside the allowed range. */
export function fontScaleOf(pixels) {
  const n = Number(pixels);
  const scale = (Number.isFinite(n) ? n : READ_FONT_PX) / READ_FONT_PX;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, scale));
}

export const READING_WIDTHS = [520, 640, 760, 900, 1100, 0]; // 0 = fill the pane

/**
 * How a file that has just been opened is shown: the whole page, upright, in the
 * window as it is now.
 *
 * Zoom and rotation belong to a file, not to the reader — a page left at 300% or
 * turned on its side for the last file says nothing about this one, and opening a
 * book to a corner of its first page is not what a reader means by "open".
 */
export const FIT_TO_WINDOW = Object.freeze({ zoomMode: 'fit-page', zoom: 1, rotation: 0 });

/**
 * One page of a reflowable book, in CSS pixels.
 *
 * The window scales this page. It does not stretch it: a wider window used to
 * make the page wider and a taller one make it taller, so the same chapter
 * became a different shape in every window.
 *
 * The page stays taller than it is wide, and wide enough that fitting it to
 * the window does not leave a narrow strip. 520 across read as a column.
 *
 * Two facing pages share that width, but each one is a taller page. A spread
 * of two squat pages filled the window sideways, so each page came out wide
 * and short. A facing page is two thirds as wide as it is tall.
 */
export const EBOOK_PAGE_WIDTH = 720;
export const EBOOK_PAGE_HEIGHT = 780;
/** One page of a two-page spread at the ordinary size. Taller than the single page. */
export const EBOOK_SPREAD_PAGE_HEIGHT = 1080;

/** How far a reader may take one side of a page, in CSS pixels. */
export const PAGE_WIDTH_MIN = 400;
export const PAGE_WIDTH_MAX = 1400;
export const PAGE_HEIGHT_MIN = 480;
export const PAGE_HEIGHT_MAX = 1800;

/**
 * Five page sizes for a reflowable book, smallest to largest.
 *
 * Ordinary is the page the reader had before this was a setting. The other
 * four step away from it. A custom size, typed in the detailed settings, is
 * not one of these.
 */
export const PAGE_PRESETS = [
  { id: 'xs', width: 520, height: 560 },
  { id: 'sm', width: 620, height: 670 },
  { id: 'md', width: 720, height: 780 },
  { id: 'lg', width: 840, height: 910 },
  { id: 'xl', width: 960, height: 1040 },
];

export function clampPageWidth(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return EBOOK_PAGE_WIDTH;
  return Math.min(PAGE_WIDTH_MAX, Math.max(PAGE_WIDTH_MIN, Math.round(value)));
}

export function clampPageHeight(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return EBOOK_PAGE_HEIGHT;
  return Math.min(PAGE_HEIGHT_MAX, Math.max(PAGE_HEIGHT_MIN, Math.round(value)));
}

/** The page choice stored in settings: a preset id, or a custom size. */
export function pageChoiceOf(settings) {
  return {
    preset: settings?.pagePreset || 'md',
    width: settings?.pageWidth,
    height: settings?.pageHeight,
  };
}

/**
 * One page, in CSS pixels.
 *
 * A preset keeps the usual shape. Two facing pages of a preset are a taller
 * page — two thirds as wide as they are tall — so a spread is not a short
 * wide band. A custom size is used as the reader typed it, in either view.
 */
export function ebookPageOf(layout, page) {
  const presetId = page?.preset || 'md';
  const preset = presetId === 'custom' ? null : PAGE_PRESETS.find((item) => item.id === presetId);
  if (preset) {
    const height = layout === 'double' ? Math.round(preset.width * 3 / 2) : preset.height;
    return { width: preset.width, height };
  }
  return {
    width: clampPageWidth(page?.width ?? EBOOK_PAGE_WIDTH),
    height: clampPageHeight(page?.height ?? (layout === 'double' ? EBOOK_SPREAD_PAGE_HEIGHT : EBOOK_PAGE_HEIGHT)),
  };
}

/** Settings written when one of the five sizes is chosen. */
export function pagePresetSettings(id) {
  const preset = PAGE_PRESETS.find((item) => item.id === id) || PAGE_PRESETS[2];
  return { pagePreset: preset.id, pageWidth: preset.width, pageHeight: preset.height };
}

/**
 * Settings written when a side is typed. The size is then the reader's own,
 * and the other side stays whatever page is on screen.
 */
export function pageCustomSettings(shown, patch = {}) {
  return {
    pagePreset: 'custom',
    pageWidth: clampPageWidth(patch.width ?? shown?.width),
    pageHeight: clampPageHeight(patch.height ?? shown?.height),
  };
}

/** The sheet a layout draws: one page, or two facing pages of that page. */
export function ebookSheet(layout, page) {
  const one = ebookPageOf(layout, page);
  const across = layout === 'double' ? 2 : 1;
  return {
    pageWidth: one.width,
    pageHeight: one.height,
    width: one.width * across,
    height: one.height,
  };
}

/**
 * How far to enlarge a sheet so it fits a window.
 *
 * The smaller of the two axes wins, so a window that is not the shape of the
 * page leaves a margin instead of pulling the page out of shape.
 */
export function ebookFitScale(sheet, room) {
  const w = Number(room?.width) || 0;
  const h = Number(room?.height) || 0;
  if (w <= 0 || h <= 0 || !sheet?.width || !sheet?.height) return 1;
  return Math.min(w / sheet.width, h / sheet.height);
}

/**
 * Which setting says how a book comes: one screen at a time, or a run to scroll
 * through. Kept so older call sites can still ask. The answer itself now comes
 * from `viewLayoutOf`: one layout for every format.
 */
export function pageModeKey(book) {
  return book && book.reflowable === false ? 'pageFlow' : 'pageMode';
}

export const VIEW_LAYOUTS = ['single', 'double', 'continuous'];

/**
 * How any book is shown. Exactly one of these, for every format:
 *   single     — one page, fitted to the whole window
 *   double     — two facing pages
 *   continuous — a run to scroll through; no page-turn effect
 *
 * A stored `viewLayout` wins. Without one, the older per-format settings still
 * say what they used to, so a saved reading file opens the way it was left.
 */
export function viewLayoutOf(settings, book) {
  const stored = settings?.viewLayout;
  if (VIEW_LAYOUTS.includes(stored)) return stored;
  const reflow = !book || book.reflowable !== false;
  if (reflow) {
    if (settings?.pageMode === 'paged') return settings?.twoColumns ? 'double' : 'single';
    return 'continuous';
  }
  if (settings?.pageFlow === 'scroll') return 'continuous';
  if (settings?.spread === 'double') return 'double';
  return 'single';
}

/**
 * The settings one layout writes.
 *
 * Every other layout's flags are cleared in the same write, which is what
 * keeps a two-page spread and a continuous run from being on together.
 * Single page also fits the whole page into the window.
 */
export function viewLayoutSettings(layout) {
  if (layout === 'double') {
    return {
      viewLayout: 'double',
      pageMode: 'paged',
      pageFlow: 'paged',
      spread: 'double',
    };
  }
  if (layout === 'continuous') {
    return {
      viewLayout: 'continuous',
      pageMode: 'scroll',
      pageFlow: 'scroll',
      spread: 'single',
    };
  }
  return {
    viewLayout: 'single',
    pageMode: 'paged',
    pageFlow: 'paged',
    spread: 'single',
    zoomMode: 'fit-page',
  };
}

/** How many columns of text one page holds. 다단 is two columns, and no more. */
export const TEXT_COLUMNS = [1, 2];

/**
 * The column count to draw.
 *
 * `columns` is the setting. An older file only has `twoColumns`, which meant
 * two columns of text, and that still counts as two when no count was stored.
 */
export function textColumnsOf(settings) {
  const n = Number(settings?.columns);
  if (n >= 2 || settings?.twoColumns) return 2;
  return 1;
}

/** What choosing a column count writes. Two is the most a page holds. */
export function columnSettings(count) {
  const columns = Number(count) >= 2 ? 2 : 1;
  return { columns, twoColumns: columns > 1 };
}

/**
 * How many pages of text the screen shows side by side.
 *
 * One page is one column, or two when that page is set to 다단. Two-page view
 * shows two facing pages, and each of those is a single column — the 다단
 * split is not applied on top. A continuous run stays one column.
 */
export function screenColumnsOf(settings, layout) {
  if (layout === 'double') return 2;
  if (layout === 'single' && textColumnsOf(settings) === 2) return 2;
  return 1;
}

/**
 * A column choice that cannot be reread as a change of view.
 *
 * An empty `viewLayout` still treats the old two-column flag as two pages.
 * Writing the layout that is already on screen keeps a two-column chapter
 * in whichever view the reader picked.
 */
export function columnChoice(settings, book, count) {
  const layout = viewLayoutOf(settings, book);
  // 다단 is one page split into columns. Two facing pages are two sheets, and
  // a continuous run is one scrolling column. Choosing columns in either of
  // those does nothing, and it must not leave that view to become 다단.
  if (layout !== 'single') return {};
  const columns = columnSettings(count);
  return { ...columns, viewLayout: 'single' };
}

/**
 * The fit actually used.
 *
 * Single page always shows the whole page in the window, unless the reader has
 * zoomed in or out — that zoom is kept, and "fit window" puts it back.
 */
export function effectiveZoomMode(settings, layout) {
  const mode = settings?.zoomMode || 'fit-page';
  const shown = layout || viewLayoutOf(settings);
  if (shown === 'single' && mode !== 'custom' && mode !== 'actual') return 'fit-page';
  return mode;
}

/** 'scroll' (continuous) or 'paged' (one screen at a time), for the book in hand. */
export function pageModeOf(settings, book) {
  return viewLayoutOf(settings, book) === 'continuous' ? 'scroll' : 'paged';
}

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
    '--read-size': `${fontPixels(scale)}px`,
    '--read-line': String(settings?.lineHeight || 1.7),
    // The page grows with the text. Enlarging only the letters inside a fixed
    // column is what makes a book look as though it will not zoom: the lines
    // get shorter and shorter while the paper stays the same size. Widening the
    // column by the same amount keeps roughly the same number of words to a
    // line, which is what an e-book reader is expected to do.
    '--read-width': settings?.readingWidth
      ? `${Math.round(settings.readingWidth * scale)}px`
      : '100%',
    '--read-align': settings?.justify ? 'justify' : 'start',
    '--read-indent': settings?.paragraphIndent ? '1.4em' : '0',
    '--read-gap': `${Number(settings?.paragraphGap ?? 0.7)}em`,
    '--read-letter': `${Number(settings?.letterSpacing || 0)}px`,
    '--read-weight': settings?.readerBold ? '600' : 'normal',
    '--read-style': settings?.readerItalic ? 'italic' : 'normal',
    '--read-decoration': settings?.readerUnderline ? 'underline' : 'none',
    // The margin around the page itself, which the reader sets.
    '--read-pad-x': `${Number(settings?.pageMarginX ?? 18)}px`,
    '--read-pad-y': `${Number(settings?.pageMarginY ?? 28)}px`,
  };
}

/** Which panel a keyboard toggle should show next. */
export function nextPanel(panel, fallback = 'contents') {
  return panel === 'none' ? fallback : 'none';
}

/**
 * Page count of a reflowable section once it is laid out in columns.
 *
 * Rounded up, not to the nearest: the columns of a chapter come to whatever
 * width they come to, and a chapter 2.4 screens wide needs three pages to be
 * read to its end. Rounding to the nearest reported two, and the last two fifths
 * of every such chapter could not be reached at all — the reader pressed "next"
 * and went to the following chapter with part of this one unread.
 *
 * `step`, when it is narrower than the screen, is one facing page of a
 * two-page view. The screen shows two of them, and a turn moves both.
 */
export function columnPageCount(scrollWidth, clientWidth, step) {
  const view = Number(clientWidth) || 0;
  if (view <= 0) return 1;
  const total = Number(scrollWidth) || 0;
  const w = Number(step) > 0 ? Number(step) : view;
  // One page per screen: the count the reader already has.
  if (w >= view - 0.5) return Math.max(1, Math.ceil((total - 1) / view));
  const limit = Math.max(0, total - view);
  const whole = Math.floor(limit / w);
  const remainder = limit - whole * w;
  return Math.max(1, whole + 1 + (remainder > 1 ? 1 : 0));
}

/**
 * Which column page a scroll offset is showing.
 *
 * `scrollWidth` is optional, and worth giving: the last page of a chapter starts
 * less than a page from the end, because there is nothing to scroll past, so
 * without knowing where the end is this can only ever report the page before it.
 */
export function columnPageAt(scrollLeft, clientWidth, scrollWidth = 0, step) {
  const view = Number(clientWidth) || 0;
  const w = Number(step) > 0 ? Number(step) : view;
  if (w <= 0) return 0;
  const left = Math.max(0, Number(scrollLeft) || 0);
  const total = Number(scrollWidth) || 0;
  const at = Math.round(left / w);
  if (total <= 0 || view <= 0) return Math.max(0, at);
  const pages = columnPageCount(total, view, w);
  // Scrolled as far as it goes: that is the last page, whatever the arithmetic
  // makes of an offset that stops short of a whole page.
  if (total > view && left >= total - view - 1) return pages - 1;
  return Math.max(0, Math.min(pages - 1, at));
}

/**
 * The column a page turn lands on.
 *
 * One page moves one column. Two facing pages move together, the way one leaf
 * of a book does: the spread on screen is replaced by the next two pages.
 * A short last page is still visited, so the end of a chapter is not skipped.
 * Returns null when the turn leaves the chapter.
 */
export function spreadTurnTarget(here, pageCount, dir, layout) {
  const count = Math.max(1, Number(pageCount) || 1);
  const last = count - 1;
  const page = Math.max(0, Math.min(last, Number(here) || 0));
  const forward = !(dir < 0);
  if (layout !== 'double') {
    const next = page + (forward ? 1 : -1);
    return next < 0 || next > last ? null : next;
  }
  const start = page - (page % 2);
  if (!forward) {
    if (page <= 0) return null;
    // The short last page sits to the right of its spread. Going back from
    // it returns to that spread, rather than skipping it.
    if (page !== start) return start;
    return start - 2;
  }
  const next = start + 2;
  if (next <= last) return next;
  if (page >= last) return null;
  return last;
}

/** Reading progress over the whole book, 0..1. */
export function bookProgress({ section, sectionCount, fracY = 0 }) {
  const count = Math.max(1, Number(sectionCount) || 1);
  const index = clampSection(section, count);
  return clamp01((index + clamp01(fracY)) / count);
}

/**
 * Whether the page before this one, or the page after it, would leave the book.
 *
 * A fixed page is the section itself. A reflowable chapter has pages of its
 * own, so the book ends only when the last of those is on screen.
 */
export function bookPageEdge(section, sectionCount, { atStart = true, atEnd = false, fixed = false } = {}) {
  const last = Math.max(0, (Number(sectionCount) || 1) - 1);
  const index = Math.max(0, Number(section) || 0);
  return {
    atBookStart: index <= 0 && (fixed || atStart !== false),
    atBookEnd: index >= last && (fixed || atEnd === true),
  };
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
