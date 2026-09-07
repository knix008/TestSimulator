// Application settings: defaults, persistence and the recent-files list.
//
// Everything the user configures lives in one plain object that is written to
// localStorage on every change and mirrored to userData/settings.json in the
// desktop app, so a restart restores the previous session exactly.
import { loadPersistedState, writeLocalState, readLocalState } from './platform.js';

export const MAX_RECENT_FILES = 10;
export const MAX_RECENT_DIRS = 10;

export const DEFAULT_SETTINGS = {
  // Appearance
  theme: 'dark',
  lang: 'ko',
  fontFamily: '',            // '' = the app's built-in UI font stack
  fontSize: 14,              // px, UI text
  fontWeight: 'normal',      // normal | bold
  fontStyle: 'normal',       // normal | italic
  fontUnderline: false,

  // Viewer
  zoomMode: 'fit-width',     // fit-width | fit-page | actual | custom
  zoom: 1,                   // used when zoomMode === 'custom'
  pageLayout: 'continuous',  // single | continuous — continuous scrolling by default
  rotation: 0,
  sidebar: 'thumbnails',     // thumbnails | outline | images | search | none
  tool: 'text',              // text | image | region
  showStatusBar: true,
  showToolbarLabels: false,
  invertPages: false,        // render pages dark-inverted in dark themes

  // Copying
  minImageSize: 24,          // ignore images smaller than this when extracting
  captureFormat: 'png',      // png | jpeg | webp | gif | bmp — for saved captures
  captureQuality: 0.92,      // JPEG / WebP quality, 0..1
  captureAction: 'ask',      // ask = show the capture dialog, copy = copy at once
  printScope: 'all',         // all | current | custom — remembered between prints
  rememberLastPage: true,

  // Session
  lastDir: '',
  recentFiles: [],           // [{ path, name, dir, size, page, openedAt }]
  recentDirs: [],            // [path]
  lastSession: null,         // { path, page, zoomMode, zoom, rotation }
};

// Merges persisted values over the defaults, dropping unknown keys so an old
// settings file can never inject junk into the running app.
export function normalize(raw) {
  const out = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (raw[key] === undefined || raw[key] === null) continue;
    const def = DEFAULT_SETTINGS[key];
    const val = raw[key];
    if (Array.isArray(def)) out[key] = Array.isArray(val) ? val : def;
    else if (typeof def === 'number') out[key] = Number.isFinite(Number(val)) ? Number(val) : def;
    else if (typeof def === 'boolean') out[key] = !!val;
    else out[key] = val;
  }
  out.recentFiles = out.recentFiles.filter((f) => f && typeof f.path === 'string').slice(0, MAX_RECENT_FILES);
  out.recentDirs = out.recentDirs.filter((d) => typeof d === 'string').slice(0, MAX_RECENT_DIRS);
  out.fontSize = Math.min(24, Math.max(10, out.fontSize));
  out.captureQuality = Math.min(1, Math.max(0.1, out.captureQuality));
  if (!['text', 'image', 'region'].includes(out.tool)) out.tool = 'text';
  out.minImageSize = Math.min(512, Math.max(1, out.minImageSize));
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

// Adds (or moves to the front) one entry, keeping at most MAX_RECENT_FILES.
export function addRecentFile(list, entry) {
  const key = entry.path || entry.name;
  const rest = (list || []).filter((f) => (f.path || f.name) !== key);
  return [{ ...entry, openedAt: Date.now() }, ...rest].slice(0, MAX_RECENT_FILES);
}

export function removeRecentFile(list, key) {
  return (list || []).filter((f) => (f.path || f.name) !== key);
}

export function addRecentDir(list, dir) {
  if (!dir) return list || [];
  const rest = (list || []).filter((d) => d !== dir);
  return [dir, ...rest].slice(0, MAX_RECENT_DIRS);
}

// ── UI font ───────────────────────────────────────────────
// Applies the font settings to the document root; every panel inherits them.
export function applyFontSettings(s) {
  const root = document.documentElement;
  root.style.setProperty('--ui-font', s.fontFamily ? `'${s.fontFamily}'` : '');
  root.style.setProperty('--ui-size', `${s.fontSize}px`);
  root.style.setProperty('--ui-weight', s.fontWeight);
  root.style.setProperty('--ui-style', s.fontStyle);
  root.style.setProperty('--ui-decoration', s.fontUnderline ? 'underline' : 'none');
}

export function applyTheme(id) {
  document.documentElement.setAttribute('data-theme', id);
}
