// Application settings: defaults, validation, and persistence in localStorage
// (shared by the main window and the popup windows, which watch it).
import { normalizeCustom, THEME_IDS } from '../themes.js';

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
    statusClock: true,
    showGrid: true,
    showRulers: true,
    extrudeHeight: 10,
    // 3D view: closed 2D outlines shown as plates of extrudeHeight (solids are always shown).
    extrude2d: true,
    // Toolbar in one row or two (when the window is narrow).
    toolbarRows: 1,
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
  s.gridSize = clamp(s.gridSize, 0.1, 1000, base.gridSize, false);
  s.extrudeHeight = clamp(s.extrudeHeight, 0.1, 1000, base.extrudeHeight, false);
  s.toolbarRows = s.toolbarRows === 2 ? 2 : 1;
  for (const key of ['showLeftPanel', 'showRightPanel', 'showStatusBar', 'confirmDelete', 'restoreSession', 'statusClock', 'showGrid', 'showRulers', 'snapGrid', 'snapObject', 'ortho', 'showLineWeights', 'crosshair', 'extrude2d']) {
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
