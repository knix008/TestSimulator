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
export const SNAP_MODES = ['endpoint', 'midpoint', 'center', 'quadrant', 'intersection', 'nearest', 'perpendicular', 'parallel', 'extension', 'angle', 'special'];
/** Widths (px) the cursor's cross-hair can be drawn with. */
export const CROSSHAIR_WIDTHS = [1, 1.5, 2, 3];
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
    showProblems: true,
    showConsole: false,
    macros: [],
    consoleLanguage: 'js',
    scaleBar: { x: 36, y: 14, width: 120 },
    extrudeHeight: 10,
    // Size of the numbers on the 3D axes (% of the normal size).
    axisLabelSize: 100,
    // 3D view: closed 2D outlines shown as plates of extrudeHeight (solids are always shown).
    extrude2d: true,
    // Draw style of the 3D view (view3d.js VIEW_STYLES).
    view3dStyle: 'asis',
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
    // Draft_Snap_WorkingPlane (grid on the working plane) and Draft_Snap_Dimensions (live sizes at the cursor).
    snapWorkingPlane: true,
    snapDimensions: false,
    snapObject: true,
    ortho: false,
    // The Draft snaps that follow lines away from objects start off (as FreeCAD's snap toolbar).
    snapModes: Object.fromEntries(SNAP_MODES.map((mode) => [mode, !['nearest', 'perpendicular', 'parallel', 'extension', 'angle', 'special'].includes(mode)])),
    showLineWeights: true,
    crosshair: true,
    // Cross-hair of the 2D cursor: colour and line width (px).
    crosshairColor: '#e5484d',
    crosshairWidth: 1,
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
  // Saved macros (script console): [{ name, code, language: 'js' | 'python', source? (where an addon came from) }].
  s.macros = Array.isArray(s.macros) ? s.macros.filter((m) => m && typeof m.name === 'string' && typeof m.code === 'string').slice(0, 200).map((m) => ({ name: m.name.slice(0, 80), code: m.code.slice(0, 200000), language: m.language === 'python' ? 'python' : 'js', ...(typeof m.source === 'string' ? { source: m.source.slice(0, 500) } : {}) })) : [];
  s.consoleLanguage = s.consoleLanguage === 'python' ? 'python' : 'js';
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
  s.axisLabelSize = clamp(s.axisLabelSize, 40, 250, 100);
  {
    const b = s.scaleBar && typeof s.scaleBar === 'object' ? s.scaleBar : {};
    s.scaleBar = { x: clamp(b.x, 0, 8000, 36), y: clamp(b.y, 0, 8000, 14), width: clamp(b.width, SCALE_BAR.min, SCALE_BAR.max, 120) };
  }
  s.gridSize = clamp(s.gridSize, 0.1, 1000, base.gridSize, false);
  s.extrudeHeight = clamp(s.extrudeHeight, 0.1, 1000, base.extrudeHeight, false);
  s.toolbarRows = s.toolbarRows === 2 ? 2 : 1;
  s.crosshairColor = /^#[0-9a-f]{6}$/i.test(s.crosshairColor ?? '') ? s.crosshairColor.toLowerCase() : base.crosshairColor;
  s.crosshairWidth = CROSSHAIR_WIDTHS.includes(Number(s.crosshairWidth)) ? Number(s.crosshairWidth) : base.crosshairWidth;
  s.view3dStyle = ['asis', 'shaded', 'flat', 'clay', 'hidden', 'xray', 'sketch', 'wireframe', 'mesh', 'points'].includes(s.view3dStyle) ? s.view3dStyle : 'asis';
  {
    const l = s.light && typeof s.light === 'object' ? s.light : {};
    const n = (v, d, lo, hi) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
    s.light = {
      on: l.on !== false, azimuth: ((n(l.azimuth, 135, -1e6, 1e6) % 360) + 360) % 360, elevation: n(l.elevation, 55, -89.9, 89.9), distance: n(l.distance, 0, 0, 1e9),
      intensity: n(l.intensity, 1, 0, 5), color: /^#[0-9a-f]{6}$/i.test(l.color ?? '') ? l.color.toLowerCase() : '#ffffff', shadows: l.shadows !== false,
    };
  }
  // BIM_Library: pieces saved from drawings [{ name, entities }].
  s.bimLibrary = Array.isArray(s.bimLibrary) ? s.bimLibrary.filter((item) => item && typeof item.name === 'string' && Array.isArray(item.entities)).slice(-50).map((item) => ({ name: item.name.slice(0, 60), entities: item.entities.slice(0, 500) })) : [];
  s.collapsedSections = Array.isArray(s.collapsedSections) ? [...new Set(s.collapsedSections.filter((id) => typeof id === 'string' && /^[a-zA-Z]{1,20}$/.test(id)))] : [];
  for (const key of ['showLeftPanel', 'showRightPanel', 'showStatusBar', 'confirmDelete', 'restoreSession', 'showStartPage', 'statusClock', 'showGrid', 'showRulers', 'showScaleBar', 'showProblems', 'showConsole', 'snapGrid', 'snapObject', 'ortho', 'showLineWeights', 'crosshair', 'extrude2d']) {
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
