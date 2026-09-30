// Application settings: defaults, validation, persistence and the recent lists.
//
// Everything the user configures lives in one plain object that is written to
// localStorage on every change and mirrored to userData/settings.json in the
// desktop app, so the next launch restores the previous session exactly — the
// theme, the language, the reading typography, the panels, the gallery of books
// that have been read, the folders that were open and where each book was left.
import { loadPersistedState, writeLocalState, readLocalState } from './platform.js';
import { READING_WIDTHS } from './view.js';
import { GALLERY_VIEWS, GALLERY_SORTS, MAX_GALLERY } from './gallery.js';

export const MAX_RECENT_FILES = 10;
export const MAX_RECENT_DIRS = 10;
export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 24;
export const PANEL_WIDTH_MIN = 180;
export const PANEL_WIDTH_MAX = 560;
export const PANEL_WIDTH_DEFAULT = 250;

export function clampPanelWidth(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return PANEL_WIDTH_DEFAULT;
  return Math.min(PANEL_WIDTH_MAX, Math.max(PANEL_WIDTH_MIN, Math.round(value)));
}

export function stepFontSize(size, dir, step = 1) {
  const n = Number(size);
  const base = Number.isFinite(n) ? Math.round(n) : DEFAULT_SETTINGS.fontSize;
  const next = base + (dir < 0 ? -step : step);
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, next));
}

export const DEFAULT_SETTINGS = {
  // ── Appearance (the application chrome) ──
  theme: 'dark',
  lang: 'ko',
  fontFamily: '',            // '' = the app's built-in UI font stack
  fontSize: 14,              // px, UI text
  fontWeight: 'normal',      // normal | bold
  fontStyle: 'normal',       // normal | italic
  fontUnderline: false,
  showMenuBar: true,
  showStatusBar: true,
  showToolbarLabels: false,
  backgroundImage: '',       // data URL shown behind the reading pane
  backgroundOpacity: 25,     // 0..100
  backgroundFit: 'cover',    // cover | contain | tile | center

  // ── Reading (reflowable formats) ──
  readerFont: '',
  fontScale: 1,              // 0.6 .. 3
  lineHeight: 1.7,
  readingWidth: 760,         // px; 0 = fill the pane
  justify: false,
  paragraphIndent: false,
  paragraphGap: 0.7,         // em
  letterSpacing: 0,          // px
  readerBold: false,
  readerItalic: false,
  readerUnderline: false,
  pageMode: 'scroll',        // scroll | paged — kept in step with viewLayout
  columns: 1,                // 1 | 2 — text columns on one page of a reflowable book
  twoColumns: false,         // kept in step with columns > 1, for older files
  // single | double | continuous. Empty means "not chosen yet", and the older
  // pageMode / pageFlow / spread settings still say how the book opens.
  viewLayout: '',
  pageTurn: 'slide',         // none | slide | flip — the page-turning effect

  // ── Viewing (fixed-layout formats: PDF, comics) ──
  zoomMode: 'fit-page',      // fit-page | fit-width | fit-height | actual | custom
  zoom: 1,
  rotation: 0,
  spread: 'single',          // single | double — one page, or two side by side
  // How the pages of a PDF or a comic come: one at a time, or a run to scroll
  // through. It is a setting of its own rather than `pageMode` because a reader
  // wants different things of text and of pages — text reads best as one
  // unbroken column, while a comic is a page at a time until it is asked not to
  // be — and one value could not be the right default for both.
  pageFlow: 'paged',         // paged | scroll — fixed-layout pages
  invertPages: false,

  // ── Panels ──
  leftPanel: 'contents',     // contents | library | history | gallery | bookmarks | notes | highlights | search | none
  rightPanel: 'properties',  // properties | reading | none
  // Highlights stay on the page until the reader hides them from the tools.
  showHighlights: true,
  leftWidth: PANEL_WIDTH_DEFAULT,
  rightWidth: PANEL_WIDTH_DEFAULT,
  folderRoot: '',

  // ── Behaviour ──
  rememberPosition: true,
  confirmOnExit: true,
  printScope: 'all',
  autoSaveLibrary: false,    // write the .ebkr file on every change

  // ── The gallery (every book that has been read) ──
  gallery: [],               // see lib/gallery.js
  galleryView: 'icons',      // large covers, or the detailed list
  gallerySort: 'recent',

  // ── Session ──
  lastDir: '',
  recentFiles: [],           // [{ path, name, dir, size, format, section, openedAt }]
  recentDirs: [],            // [path]
  lastSession: null,         // { path, section }
};

const ENUMS = {
  fontWeight: ['normal', 'bold'],
  fontStyle: ['normal', 'italic'],
  backgroundFit: ['cover', 'contain', 'tile', 'center'],
  pageMode: ['scroll', 'paged'],
  pageFlow: ['paged', 'scroll'],
  viewLayout: ['', 'single', 'double', 'continuous'],
  pageTurn: ['none', 'slide', 'flip'],
  zoomMode: ['fit-width', 'fit-height', 'fit-page', 'actual', 'custom'],
  spread: ['single', 'double'],
  leftPanel: ['contents', 'library', 'history', 'gallery', 'bookmarks', 'notes', 'highlights', 'search', 'none'],
  rightPanel: ['properties', 'reading', 'none'],
  printScope: ['all', 'current', 'custom'],
  galleryView: GALLERY_VIEWS,
  gallerySort: GALLERY_SORTS,
};

/**
 * Merges persisted values over the defaults, dropping unknown keys and
 * out-of-range values so an old — or hand-edited — settings file can never put
 * the app into a state it cannot render.
 */
export function normalize(raw) {
  const out = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return out;

  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const value = raw[key];
    if (value === undefined || value === null) continue;
    const def = DEFAULT_SETTINGS[key];
    if (Array.isArray(def)) out[key] = Array.isArray(value) ? value : def;
    else if (typeof def === 'number') out[key] = Number.isFinite(Number(value)) ? Number(value) : def;
    else if (typeof def === 'boolean') out[key] = !!value;
    else out[key] = value;
  }

  for (const [key, allowed] of Object.entries(ENUMS)) {
    if (!allowed.includes(out[key])) out[key] = DEFAULT_SETTINGS[key];
  }

  out.recentFiles = out.recentFiles
    .filter((f) => f && (typeof f.path === 'string' || typeof f.name === 'string'))
    .slice(0, MAX_RECENT_FILES);
  out.recentDirs = out.recentDirs.filter((d) => typeof d === 'string').slice(0, MAX_RECENT_DIRS);
  out.gallery = out.gallery
    .filter((e) => e && (typeof e.path === 'string' || typeof e.name === 'string'))
    .slice(0, MAX_GALLERY);

  out.fontSize = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(out.fontSize)));
  out.leftWidth = clampPanelWidth(out.leftWidth);
  out.rightWidth = clampPanelWidth(out.rightWidth);
  out.backgroundOpacity = Math.min(100, Math.max(0, Math.round(out.backgroundOpacity)));
  out.fontScale = Math.min(3, Math.max(0.6, Number(out.fontScale) || 1));
  out.lineHeight = Math.min(2.6, Math.max(1.1, Number(out.lineHeight) || 1.7));
  out.paragraphGap = Math.min(2.5, Math.max(0, Number(out.paragraphGap)));
  out.letterSpacing = Math.min(4, Math.max(-1, Number(out.letterSpacing)));
  out.zoom = Math.min(8, Math.max(0.1, Number(out.zoom) || 1));
  // A count wins. A file from before the count existed said "two columns" with
  // a flag, and that opens as two.
  {
    const asked = Number(raw.columns);
    const counted = raw.columns !== undefined && raw.columns !== null && Number.isFinite(asked);
    if (counted) out.columns = asked >= 2 ? 2 : 1;
    else if (out.twoColumns) out.columns = 2;
    else out.columns = 1;
    out.twoColumns = out.columns > 1;
  }
  out.rotation = ((Math.round(out.rotation / 90) * 90) % 360 + 360) % 360;
  if (!READING_WIDTHS.includes(out.readingWidth)) {
    out.readingWidth = Math.min(1400, Math.max(0, Math.round(out.readingWidth)));
  }
  return out;
}

export async function loadSettings() {
  return normalize(await loadPersistedState());
}

export function loadSettingsSync() {
  return normalize(readLocalState());
}

export function persistSettings(settings) {
  writeLocalState(settings);
}

// ── Recent files ──────────────────────────────────────────
export function recentKey(entry) {
  return entry?.path || entry?.name || '';
}

/** Adds (or moves to the front) one entry, keeping at most MAX_RECENT_FILES. */
export function addRecentFile(list, entry) {
  const key = recentKey(entry);
  const rest = (list || []).filter((f) => recentKey(f) !== key);
  return [{ ...entry, openedAt: Date.now() }, ...rest].slice(0, MAX_RECENT_FILES);
}

export function removeRecentFile(list, key) {
  return (list || []).filter((f) => recentKey(f) !== key);
}

export function updateRecentFile(list, key, patch) {
  return (list || []).map((f) => (recentKey(f) === key ? { ...f, ...patch } : f));
}

export function addRecentDir(list, dir) {
  if (!dir) return list || [];
  const rest = (list || []).filter((d) => d !== dir);
  return [dir, ...rest].slice(0, MAX_RECENT_DIRS);
}

export function removeRecentDir(list, dir) {
  return (list || []).filter((d) => d !== dir);
}

// ── Applying settings to the document ─────────────────────
/** Applies the UI font settings to the document root; every panel inherits. */
export function applyFontSettings(s) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--ui-font', s.fontFamily ? `'${s.fontFamily}'` : '');
  root.style.setProperty('--ui-size', `${s.fontSize}px`);
  root.style.setProperty('--ui-weight', s.fontWeight);
  root.style.setProperty('--ui-style', s.fontStyle);
  root.style.setProperty('--ui-decoration', s.fontUnderline ? 'underline' : 'none');
}

export function applyTheme(id) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', id);
}

/** Only the parts of the settings a book's reading file carries with it. */
export function viewSettingsOf(settings) {
  return {
    fontScale: settings.fontScale,
    lineHeight: settings.lineHeight,
    readingWidth: settings.readingWidth,
    pageMode: settings.pageMode,
    pageFlow: settings.pageFlow,
    viewLayout: settings.viewLayout,
    columns: settings.columns,
    twoColumns: settings.twoColumns,
    pageTurn: settings.pageTurn,
    zoomMode: settings.zoomMode,
    zoom: settings.zoom,
    rotation: settings.rotation,
    spread: settings.spread,
    readerFont: settings.readerFont,
    justify: settings.justify,
  };
}
