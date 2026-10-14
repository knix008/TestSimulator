// User settings: kept in localStorage (read before the first paint) and, in the
// desktop app, also in settings.json in the app data folder (survives a killed
// WebView, which can lose its latest localStorage writes).
import { fs } from './platform/fs.js';
import { isDesktop } from './platform/native.js';

const KEY = 'myphotomanager.settings';

export const DEFAULTS = Object.freeze({
  language: 'system',
  theme: 'system', // system | a theme id (src/themes.js) | custom
  customTheme: { mode: 'dark', bg: '#1b1e26', panel: '', text: '#e8e6e3', accent: '#e0a030' },
  thumbSize: 168,
  view: 'thumbs', // thumbs | details | list | filmstrip
  sort: { key: 'name', desc: false },
  groupBy: 'none',
  showHidden: false,
  showAllFiles: false,
  showFolders: true,
  caption: { name: true, size: false, date: false, dims: false, overlay: true },
  confirmDelete: true,
  useTrash: true,
  viewer: { wheel: 'navigate', enlarge: false, background: 'theme', info: false, histogram: false, filmstrip: true, smooth: true, navigator: true, zoomLock: false, faces: false, loupe: 3 },
  xmpEmbed: false,
  analysis: { auto: true }, // analyse opened folders in the background (src/analysis)
  dicom: { rulers: true, scaleBar: true, corners: true, grid: true, scaleBarAt: null, fps: 10 }, // DICOM overlays shown (ui/dicomview.js)
  measureUnit: 'mm', // lengths of measurements and rulers: mm | cm | inch
  colorManagement: true, // convert embedded ICC profiles to sRGB (formats/icc.js)
  importer: { pattern: 'YYYY/YYYY-MM-DD', rename: '', deleteAfter: false, skipDuplicates: true, destination: null },
  keys: {},
  // Video in the viewer: playback and how it fills the screen (fit | actual | fill).
  video: { autoplay: true, loop: false, muted: false, volume: 100, speed: 1, controls: true, fit: 'fit', resume: true, nextAtEnd: false },
  slideshow: { interval: 4, transition: 'fade', shuffle: false, loop: true, caption: true, music: '', musicVolume: 80 },
  jpegQuality: 92,
  xmpSidecar: false,
  mapTiles: true,
  startup: 'last',
  lastFolder: null,
  recentFolders: [],
  recentFiles: [],
  print: {}, // last print settings (ui/print.js DEFAULT_PRINT)
  keywordSets: [{ name: '', keywords: [] }], // quick keywords (ui/quickmeta.js)
  keywordSet: 0,
  actions: [], // batch actions [{ name, steps: [{ kind, … }] }] (ui/actions.js)
  externalEditors: [], // [{ name, program }] (ui/external.js)
  workspaces: [], // saved window layouts [{ name, layout }] (app.js workspaceMenu)
  luts: [], // imported colour LUTs [{ id, name }] (edit/lut.js; tables in the data folder)
  metadataTemplates: [], // [{ name, fields: { headline, copyright, … }, keywords }]
  favorites: [],
  panes: { left: true, right: true, leftTab: 'folders', rightTab: 'properties', leftWidth: 260, rightWidth: 300, basket: false, leftCollapsed: false, rightCollapsed: false, drive: null },
  catalogMatch: 'all',
  renameTemplate: '{date:YYYYMMDD}_###',
});

const clone = (value) => JSON.parse(JSON.stringify(value));

/** Defaults filled in for anything missing or of the wrong type (nested one level). */
export function normalize(raw) {
  const out = clone(DEFAULTS);
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in DEFAULTS)) continue;
    const base = DEFAULTS[key];
    if (key === 'print') {
      if (value && typeof value === 'object' && !Array.isArray(value)) out.print = { ...value };
    } else if (key === 'keys') {
      // Custom shortcuts: { commandId: 'Ctrl+Shift+K' }.
      if (value && typeof value === 'object') for (const [id, combo] of Object.entries(value)) if (typeof combo === 'string') out.keys[id] = combo;
    } else if (base && typeof base === 'object' && !Array.isArray(base)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [inner, innerValue] of Object.entries(value)) {
          if (inner in base && (typeof innerValue === typeof base[inner] || (base[inner] === null && (innerValue === null || typeof innerValue === 'string')))) out[key][inner] = innerValue;
        }
      }
    } else if (Array.isArray(base)) {
      if (Array.isArray(value)) out[key] = value;
    } else if (base === null || typeof value === typeof base) {
      out[key] = value;
    }
  }
  out.thumbSize = Math.max(64, Math.min(400, out.thumbSize));
  out.jpegQuality = Math.max(10, Math.min(100, out.jpegQuality));
  return out;
}

export function loadSettings(storage = globalThis.localStorage) {
  try {
    return normalize(JSON.parse(storage?.getItem(KEY) ?? 'null'));
  } catch {
    return normalize(null);
  }
}

/** Desktop: the settings file wins over localStorage when they differ. */
export async function loadSettingsFile() {
  if (!isDesktop()) return null;
  try {
    const text = await fs.readData('settings.json');
    return text ? normalize(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

let timer = null;
export function saveSettings(settings, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify(settings)); } catch { /* storage full or blocked */ }
  if (!isDesktop()) return;
  clearTimeout(timer);
  timer = setTimeout(() => { fs.writeData('settings.json', JSON.stringify(settings, null, 2)).catch(() => {}); }, 400);
}

export const RECENT_MAX = 10;

/** Puts `folder` first in the recent list (max 10). */
export function rememberFolder(settings, folder) {
  settings.lastFolder = folder;
  settings.recentFolders = [folder, ...settings.recentFolders.filter((f) => f !== folder)].slice(0, RECENT_MAX);
}

/** Puts a viewed file first in the recent files (max 10). */
export function rememberFile(settings, file) {
  settings.recentFiles = [file, ...settings.recentFiles.filter((f) => f !== file)].slice(0, RECENT_MAX);
}
