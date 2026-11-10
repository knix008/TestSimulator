// Application settings: defaults, persistence and the recent-files list.
//
// Everything the user configures lives in one plain object that is written to
// localStorage on every change and mirrored to <config>/settings.json in the
// desktop app, so a restart restores the previous session exactly.
import { PRINT_DEFAULTS, normalizePrintOptions } from './print3d.js';
import { loadPersistedState, writeLocalState, readLocalState } from './platform.js';
import { normalizeStartLayout } from './startlayout.js';
import {
  normalizeStartBg, clampStartOpacity, clampStartSpeed, normalizeStartInterval,
} from './startbg.js';
import {
  applyCustomThemeVars, clearCustomThemeVars, isCustomThemeId, isDarkTheme, normalizeCustomThemes,
} from './themes.js';

export const MAX_RECENT_FILES = 12;
export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 24;
export const PANEL_WIDTH_MIN = 220;
export const PANEL_WIDTH_MAX = 600;
export const LOG_HEIGHT_MIN = 90;
export const LOG_HEIGHT_MAX = 700;
export const DEFAULT_ENGINE_URL = 'http://127.0.0.1:57660';

export function clampPanelWidth(n, fallback = 300) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(PANEL_WIDTH_MAX, Math.max(PANEL_WIDTH_MIN, Math.round(v)));
}

export function clampLogHeight(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 200;
  return Math.min(LOG_HEIGHT_MAX, Math.max(LOG_HEIGHT_MIN, Math.round(v)));
}

export function stepFontSize(size, dir, step = 1) {
  const n = Number(size);
  const base = Number.isFinite(n) ? Math.round(n) : DEFAULT_SETTINGS.fontSize;
  const next = base + (dir < 0 ? -step : step);
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, next));
}

// The three lights a new scene gets: a key light, a cooler fill light and a
// soft sky / ground light. Ids stay stable so dragging one updates it.
export const DEFAULT_LIGHTS = [
  { id: 'key', type: 'directional', name: 'Key', color: '#ffffff', intensity: 2.2, position: [0.9, 1.4, 0.8], castShadow: true, enabled: true },
  { id: 'fill', type: 'point', name: 'Fill', color: '#cfe0ff', intensity: 2, position: [-0.9, 0.9, 0.8], castShadow: false, enabled: true, distance: 0 },
  { id: 'sky', type: 'hemisphere', name: 'Sky', color: '#ffffff', groundColor: '#555555', intensity: 0.6, enabled: true },
];

export const DEFAULT_VIEW = {
  grid: true,
  gridSize: 'auto',          // 'auto' or the major cell size in model units
  gridDivisions: 5,          // each major cell split 5 × 5
  gridOpacity: 1,
  gridColor: '',             // '' = follows the background
  axes: true,
  negativeAxes: true,
  rulers: true,
  rulerY: true,
  rulerCells: 3,             // ruler length in major cells (at least the model)
  rulerColor: '#d0d0d0',
  units: 'm',                // m | cm | mm | in | none
  boundingBox: false,
  bboxColor: '#f0b429',
  viewCube: true,
  background: 'theme',       // theme | color | gradient | environment
  bgColor: '#3a3f4a',
  bgColor2: '#101215',
  environment: true,
  envIntensity: 0.8,
  // Neutral (Khronos PBR Neutral) keeps the model's base colours: ACES pushed
  // orange towards yellow and washed out bright colours.
  toneMapping: 'neutral',    // aces | agx | neutral | none
  colorRev: 2,               // see normalizeView: earlier saves had ACES as the default
  exposure: 1,
  shadows: true,
  shadowOpacity: 0.3,
  material: 'original',      // original | clay | normal | vertex
  clayColor: '#c8c8c8',
  wireframe: false,
  flatShading: false,
  doubleSided: false,
  showLightHelpers: true,
  fov: 45,
  autoRotate: false,
  autoRotateSpeed: 2,
};

export const DEFAULT_SETTINGS = {
  // Appearance
  theme: 'dark',
  customThemes: [],
  lang: 'ko',
  fontFamily: '',
  fontSize: 14,
  fontWeight: 'normal',
  fontStyle: 'normal',
  fontUnderline: false,

  // Layout
  leftPanel: true,
  leftPanelWidth: 290,
  rightPanel: true,
  rightPanelWidth: 330,
  rightTab: 'convert',       // convert | scene | lights | material | model | camera
  logPanel: true,
  logHeight: 200,
  logLevel: 'info',          // debug | info | warn | error — the least shown
  logAutoScroll: true,
  showStatusBar: true,
  showToolbarLabels: false,
  showStartPage: true,
  tutorialAsk: true,         // ask at start-up whether to run the tutorial
  tutorialIndex: 0,          // the step it was left on
  tutorialDone: false,       // played to the end once

  // Start-screen background (lib/startbg.js)
  startBg: 'cubes',          // one of the 21 moving backgrounds
  startBgOpacity: 0.6,       // 0.1–1
  startBgSpeed: 1,           // 0.1–3
  startBgRandom: false,      // automatic changes pick a random one, not the next
  startBgInterval: 0,        // seconds between automatic changes, 0 = never
  startLayout: null,         // start-screen cards placed by hand; null = automatic grid

  // Conversion
  backend: 'local',          // local | remote | stability
  engineUrl: DEFAULT_ENGINE_URL,   // the web build's local engine / a remote one
  remoteUrl: '',
  stabilityKey: '',          // only used when backend === 'stability'
  stabilityConfirmed: false,
  model: 'sf3d',
  device: 'auto',            // auto | gpu | cpu
  convertOptions: {},        // { [modelId]: { key: value } } — per version
  modelVersions: {},         // { [family]: modelId } — the version last picked
  autoSave: false,           // save each result next to its image (desktop)
  autoSaveFormat: 'glb',

  // Viewer
  view: DEFAULT_VIEW,
  lights: DEFAULT_LIGHTS,
  exportFormat: 'glb',

  // Printing (components/PrintDialog.jsx)
  printLayout: 'views4',     // view | views4 | views6 | sheets
  printInfo: true,           // the model's name, size and counts at the top
  printWhite: true,          // white background instead of the view's
  printHelpers: false,       // grid, axes and rulers in the pictures
  printOrientation: 'auto',  // auto | portrait | landscape
  printPrinter: '',          // '' = the system default printer

  // 3D printing (components/Print3DDialog.jsx, lib/print3d.js)
  print3d: { ...PRINT_DEFAULTS },

  // Session
  lastDir: '',
  recentFiles: [],           // [{ path, name, dir, kind: image|model, openedAt }]
};

const VIEW_KEYS = Object.keys(DEFAULT_VIEW);

export function normalizeView(raw) {
  const out = { ...DEFAULT_VIEW };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of VIEW_KEYS) {
    const def = DEFAULT_VIEW[key];
    const val = raw[key];
    if (val === undefined || val === null) continue;
    if (typeof def === 'boolean') out[key] = !!val;
    else if (typeof def === 'number') out[key] = Number.isFinite(Number(val)) ? Number(val) : def;
    else out[key] = typeof val === 'number' ? val : String(val);
  }
  // Saved before colorRev 2, 'aces' was just the old default: move it to the
  // new one once (a later explicit choice of ACES is kept).
  if (!(Number(raw.colorRev) >= 2) && out.toneMapping === 'aces') out.toneMapping = 'neutral';
  out.colorRev = 2;
  if (out.gridSize !== 'auto' && !(Number(out.gridSize) > 0)) out.gridSize = 'auto';
  out.gridDivisions = Math.min(20, Math.max(1, Math.round(out.gridDivisions)));
  out.fov = Math.min(100, Math.max(15, out.fov));
  out.exposure = Math.min(4, Math.max(0.1, out.exposure));
  return out;
}

export function normalizeLights(list) {
  if (!Array.isArray(list)) return DEFAULT_LIGHTS.map((l) => ({ ...l }));
  const seen = new Set();
  const out = [];
  for (const l of list) {
    if (!l || typeof l !== 'object' || !l.id || seen.has(l.id)) continue;
    if (!['directional', 'point', 'spot', 'hemisphere', 'ambient'].includes(l.type)) continue;
    seen.add(l.id);
    const pos = Array.isArray(l.position) && l.position.length === 3 && l.position.every((n) => Number.isFinite(Number(n)))
      ? l.position.map(Number) : [2, 3, 2];
    out.push({
      ...l,
      name: String(l.name || l.id),
      color: /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : '#ffffff',
      intensity: Number.isFinite(Number(l.intensity)) ? Math.max(0, Number(l.intensity)) : 1,
      position: pos,
      enabled: l.enabled !== false,
    });
  }
  return out.slice(0, 12);
}

// Merges persisted values over the defaults, dropping unknown keys so an old
// settings file can never inject junk into the running app.
export function normalize(raw) {
  const out = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return { ...out, view: { ...DEFAULT_VIEW }, lights: normalizeLights(null) };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (raw[key] === undefined || raw[key] === null) continue;
    const def = DEFAULT_SETTINGS[key];
    const val = raw[key];
    if (Array.isArray(def)) out[key] = Array.isArray(val) ? val : def;
    else if (typeof def === 'number') out[key] = Number.isFinite(Number(val)) ? Number(val) : def;
    else if (typeof def === 'boolean') out[key] = !!val;
    else if (def && typeof def === 'object') out[key] = val && typeof val === 'object' ? val : def;
    else out[key] = val;
  }
  out.view = normalizeView(raw.view);
  out.lights = normalizeLights(raw.lights);
  out.recentFiles = out.recentFiles.filter((f) => f && typeof (f.path || f.name) === 'string').slice(0, MAX_RECENT_FILES);
  out.fontSize = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, out.fontSize));
  out.leftPanelWidth = clampPanelWidth(out.leftPanelWidth, 290);
  out.rightPanelWidth = clampPanelWidth(out.rightPanelWidth, 330);
  out.logHeight = clampLogHeight(out.logHeight);
  if (!['view', 'views4', 'views6', 'sheets'].includes(out.printLayout)) out.printLayout = 'views4';
  if (!['auto', 'portrait', 'landscape'].includes(out.printOrientation)) out.printOrientation = 'auto';
  if (!['local', 'remote', 'stability'].includes(out.backend)) out.backend = 'local';
  if (!['auto', 'gpu', 'cpu'].includes(out.device)) out.device = 'auto';
  if (!['debug', 'info', 'warn', 'error'].includes(out.logLevel)) out.logLevel = 'info';
  if (!['convert', 'scene', 'lights', 'material', 'model', 'camera'].includes(out.rightTab)) out.rightTab = 'convert';
  out.print3d = normalizePrintOptions(raw.print3d);
  out.startBg = normalizeStartBg(out.startBg);
  out.startBgOpacity = clampStartOpacity(out.startBgOpacity);
  out.startBgSpeed = clampStartSpeed(out.startBgSpeed);
  out.startBgInterval = normalizeStartInterval(out.startBgInterval);
  out.startLayout = normalizeStartLayout(raw.startLayout);
  out.customThemes = normalizeCustomThemes(out.customThemes);
  if (isCustomThemeId(out.theme) && !out.customThemes.some((t) => t.id === out.theme)) out.theme = 'dark';
  if (typeof out.engineUrl !== 'string' || !/^https?:\/\//i.test(out.engineUrl.trim())) out.engineUrl = DEFAULT_ENGINE_URL;
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
export function addRecentFile(list, entry) {
  const key = entry.path || entry.name;
  const rest = (list || []).filter((f) => (f.path || f.name) !== key);
  return [{ ...entry, openedAt: Date.now() }, ...rest].slice(0, MAX_RECENT_FILES);
}

export function removeRecentFile(list, key) {
  return (list || []).filter((f) => (f.path || f.name) !== key);
}

// ── UI font and theme ─────────────────────────────────────
export function applyFontSettings(s) {
  const root = document.documentElement;
  root.style.setProperty('--ui-font', s.fontFamily ? `'${s.fontFamily}'` : '');
  root.style.setProperty('--ui-size', `${s.fontSize}px`);
  root.style.setProperty('--ui-weight', s.fontWeight);
  root.style.setProperty('--ui-style', s.fontStyle);
  root.style.setProperty('--ui-decoration', s.fontUnderline ? 'underline' : 'none');
}

export function applyTheme(id, customThemes) {
  const root = document.documentElement;
  const custom = normalizeCustomThemes(customThemes).find((t) => t.id === id);
  if (custom) {
    root.setAttribute('data-theme', 'custom');
    applyCustomThemeVars(root, custom);
    return;
  }
  clearCustomThemeVars(root);
  root.setAttribute('data-theme', id || 'dark');
}

// The user's guide (doc/) can't read App.css, so the resolved palette is
// published to localStorage; the guide reads it and follows `storage` events.
export const THEME_PALETTE_KEY = 'my3dobjects-theme-palette';
export const PALETTE_VARS = ['--bg', '--bg-2', '--bg-3', '--panel', '--border', '--text', '--text-dim', '--muted', '--accent'];

export function publishThemePalette(id, customThemes) {
  const dark = isDarkTheme(id, customThemes);
  try {
    const css = getComputedStyle(document.documentElement);
    const vars = {};
    for (const key of PALETTE_VARS) vars[key] = css.getPropertyValue(key).trim();
    const next = JSON.stringify({ id: id || 'dark', dark, vars });
    if (localStorage.getItem(THEME_PALETTE_KEY) !== next) localStorage.setItem(THEME_PALETTE_KEY, next);
  } catch { /* no storage — the guide falls back to the OS colour scheme */ }
  return dark;
}
