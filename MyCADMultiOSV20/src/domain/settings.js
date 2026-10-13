// Application settings: defaults, validation, and persistence in localStorage
// (shared by the main window and the popup windows, which watch it).
import { normalizeCustom, THEME_IDS } from '../themes.js';
import { LENGTH_UNITS } from './units.js';

export const STORAGE_KEY = 'mycad.settings.v1';
export const RECENT_KEY = 'mycad.recent.v1';
export const SESSION_KEY = 'mycad.session.v1';

export const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800];
export const FONT_STYLES = ['normal', 'italic'];
/** Text height of new texts and dimensions, mm on paper/drawing. */
export const TEXT_HEIGHT = { min: 1, max: 50 };
export const ZOOM = { min: 1, max: 20000 };
export const BACKGROUND_FITS = ['cover', 'contain', 'tile', 'center', 'stretch'];
export const SNAP_MODES = ['endpoint', 'midpoint', 'center', 'quadrant', 'intersection', 'nearest'];
export const GRID_SIZES = [0.5, 1, 2, 5, 10, 20, 25, 50, 100];
/** Length of the scale bar on screen (px). */
export const SCALE_BAR = { min: 30, max: 2000 };

export function defaultSettings(language = 'ko') {
  return {
    language,
    theme: 'light',
    customTheme: normalizeCustom(null),
    fontFamily: '',
    fontWeight: 400,
    fontStyle: 'normal',
    textHeight: 3.5,
    dimTextHeight: 3.5,
    dimPrecision: 1,
    backgroundImage: null,
    backgroundName: '',
    backgroundOpacity: 30,
    backgroundFit: 'cover',
    showLeftPanel: true,
    showRightPanel: true,
    showStatusBar: true,
    lastDirectory: null,
    confirmDelete: true,
    restoreSession: true,
    // The start page shows when the program starts (not when it opens files).
    showStartPage: true,
    statusClock: true,
    showGrid: true,
    showRulers: true,
    // Scale bar on the 2D canvas: shown, where (px from the bottom-left corner) and how long (px).
    showScaleBar: true,
    scaleBar: { x: 36, y: 14, width: 120 },
    extrudeHeight: 10,
    // 3D view: closed 2D outlines shown as plates of extrudeHeight (solids are always shown).
    extrude2d: true,
    // Toolbar in one row or two (when the window is narrow).
    toolbarRows: 1,
    // Left panel sections that are folded.
    collapsedSections: [],
    // The 3D view's light (the sun): on/off, direction, strength, colour, shadows.
    light: { on: true, azimuth: 135, elevation: 55, intensity: 1, color: '#ffffff', shadows: true },
    // Unit lengths are shown and typed in (drawings always store mm).
    units: 'mm',
    gridSize: 10,
    snapGrid: false,
    snapObject: true,
    ortho: false,
    snapModes: Object.fromEntries(SNAP_MODES.map((mode) => [mode, mode !== 'nearest'])),
    showLineWeights: true,
    crosshair: true,
    author: '',
  };
}

const clamp = (value, min, max, fallback, round = true) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const bounded = Math.min(max, Math.max(min, number));
  return round ? Math.round(bounded) : bounded;
};

/** Fills gaps and repairs out-of-range values. */
export function normalizeSettings(raw = {}, language) {
  const base = defaultSettings(raw?.language === 'en' || raw?.language === 'ko' ? raw.language : language);
  const s = { ...base, ...(raw && typeof raw === 'object' ? raw : {}) };
  s.language = s.language === 'en' ? 'en' : 'ko';
  s.theme = THEME_IDS.includes(s.theme) ? s.theme : base.theme;
  s.customTheme = normalizeCustom(s.customTheme);
  s.fontFamily = typeof s.fontFamily === 'string' ? s.fontFamily : '';
  s.fontWeight = FONT_WEIGHTS.includes(Number(s.fontWeight)) ? Number(s.fontWeight) : base.fontWeight;
  s.fontStyle = FONT_STYLES.includes(s.fontStyle) ? s.fontStyle : base.fontStyle;
  s.textHeight = clamp(s.textHeight, TEXT_HEIGHT.min, TEXT_HEIGHT.max, base.textHeight, false);
  s.dimTextHeight = clamp(s.dimTextHeight, TEXT_HEIGHT.min, TEXT_HEIGHT.max, base.dimTextHeight, false);
  s.dimPrecision = clamp(s.dimPrecision, 0, 4, base.dimPrecision);
  delete s.transparency;
  s.backgroundOpacity = clamp(s.backgroundOpacity, 0, 100, base.backgroundOpacity);
  s.backgroundFit = BACKGROUND_FITS.includes(s.backgroundFit) ? s.backgroundFit : base.backgroundFit;
  s.backgroundImage = typeof s.backgroundImage === 'string' && s.backgroundImage ? s.backgroundImage : null;
  s.backgroundName = typeof s.backgroundName === 'string' ? s.backgroundName : '';
  s.lastDirectory = typeof s.lastDirectory === 'string' && s.lastDirectory ? s.lastDirectory : null;
  s.units = LENGTH_UNITS.includes(s.units) ? s.units : 'mm';
  {
    const b = s.scaleBar && typeof s.scaleBar === 'object' ? s.scaleBar : {};
    s.scaleBar = { x: clamp(b.x, 0, 8000, 36), y: clamp(b.y, 0, 8000, 14), width: clamp(b.width, SCALE_BAR.min, SCALE_BAR.max, 120) };
  }
  s.gridSize = clamp(s.gridSize, 0.1, 1000, base.gridSize, false);
  s.extrudeHeight = clamp(s.extrudeHeight, 0.1, 1000, base.extrudeHeight, false);
  s.toolbarRows = s.toolbarRows === 2 ? 2 : 1;
  {
    const l = s.light && typeof s.light === 'object' ? s.light : {};
    const n = (v, d, lo, hi) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
    s.light = {
      on: l.on !== false, azimuth: ((n(l.azimuth, 135, -1e6, 1e6) % 360) + 360) % 360, elevation: n(l.elevation, 55, 3, 89),
      intensity: n(l.intensity, 1, 0, 5), color: /^#[0-9a-f]{6}$/i.test(l.color ?? '') ? l.color.toLowerCase() : '#ffffff', shadows: l.shadows !== false,
    };
  }
  s.collapsedSections = Array.isArray(s.collapsedSections) ? [...new Set(s.collapsedSections.filter((id) => typeof id === 'string' && /^[a-zA-Z]{1,20}$/.test(id)))] : [];
  for (const key of ['showLeftPanel', 'showRightPanel', 'showStatusBar', 'confirmDelete', 'restoreSession', 'showStartPage', 'statusClock', 'showGrid', 'showRulers', 'showScaleBar', 'snapGrid', 'snapObject', 'ortho', 'showLineWeights', 'crosshair', 'extrude2d']) {
    s[key] = typeof s[key] === 'boolean' ? s[key] : base[key];
  }
  s.snapModes = Object.fromEntries(SNAP_MODES.map((mode) => [mode, typeof s.snapModes?.[mode] === 'boolean' ? s.snapModes[mode] : base.snapModes[mode]]));
  s.author = typeof s.author === 'string' ? s.author.slice(0, 80) : '';
  return s;
}

const systemLanguage = () => (String(globalThis.navigator?.language ?? 'ko').toLowerCase().startsWith('ko') ? 'ko' : 'en');

export function loadSettings(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : {}, systemLanguage());
  } catch {
    return normalizeSettings({}, systemLanguage());
  }
}

export function storeSettings(storage, settings) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
