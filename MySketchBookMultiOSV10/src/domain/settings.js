// Application settings: defaults, validation, and persistence in localStorage
// (shared by the main window and the popup windows, which watch it). Loaded
// again on the next start.
import { normalizeCustom, THEME_IDS } from '../themes.js';
import { normalizePrintSetup } from '../print/layout.js';

export const STORAGE_KEY = 'mysketchbook.settings.v1';
export const RECENT_KEY = 'mysketchbook.recent.v1';
export const RECENT_DIRS_KEY = 'mysketchbook.recentDirs.v1';
export const SESSION_KEY = 'mysketchbook.session.v1';
/** The user's own library objects (imported 3D models): ids and names; the bytes live in IndexedDB / app data. */
export const MY_OBJECTS_KEY = 'mysketchbook.myObjects.v1';
export const PRINT_KEY = 'mysketchbook.print.v1';

export const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800];
export const FONT_STYLES = ['normal', 'italic'];
export const FONT_SIZE = { min: 9, max: 28 };
export const ZOOM = { min: 50, max: 200, step: 10 };
/** Drawing zoom in percent (toolbar, status bar, Ctrl+wheel). */
export const CANVAS_ZOOM = { min: 10, max: 800, steps: [10, 15, 20, 25, 33, 50, 67, 75, 100, 125, 150, 200, 300, 400, 600, 800] };
/** Narrowest side panels that still show all of their content. */
export const PANEL_MIN = { left: 240, right: 300, bottom: 90 };
/** The bottom (Problems) panel is never taller than this share of the window. */
export const BOTTOM_MAX_SHARE = 0.6;
export const BACKGROUND_KINDS = ['animated', 'image', 'none'];
/** Choices for the start page's automatic background change (seconds; 0 = off). */
export const ANIMATION_INTERVALS = [0, 15, 30, 60, 120, 300];
export const ANIMATIONS = [
  'blueprint', 'floorplan', 'isometric', 'wireframe', 'sunlight', 'dust', 'fabric', 'woodgrain', 'tiles', 'dimensions',
  'swatches', 'lamps', 'curtains', 'leaves', 'perspective', 'bricks', 'furniture', 'sunpath', 'parquet', 'contours',
];
export const BACKGROUND_FITS = ['cover', 'contain', 'tile', 'center', 'stretch'];
export const DATE_FORMATS = ['iso', 'ko', 'us', 'eu'];
export const UNITS = ['mm', 'cm', 'm', 'in', 'ft'];
export const RENDER_QUALITIES = ['fast', 'balanced', 'high'];
export const SHADOW_QUALITIES = ['low', 'medium', 'high'];
export const PAPERS = ['A3', 'A4', 'A5', 'B4', 'B5', 'Letter', 'Legal', 'Tabloid'];

/**
 * The first start after the installer: the program opens in the language chosen there, also when
 * earlier settings are kept. Later the user's own choice counts: the installer hands this over once.
 */
export function applyInstallLanguage(storage, language) {
  if (!storage || (language !== 'ko' && language !== 'en')) return false;
  try {
    let saved = {};
    try { saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}') ?? {}; } catch { /* unreadable: start over */ }
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, language }));
    return true;
  } catch {
    return false;
  }
}

export function defaultSettings(language = 'ko') {
  return {
    language,
    theme: 'light',
    customTheme: normalizeCustom(null),
    fontFamily: '',
    fontSize: 13,
    fontWeight: 400,
    fontStyle: 'normal',
    zoom: 100,
    backgroundKind: 'animated',
    animation: 'blueprint',
    animationSpeed: 100,
    animationRandom: true,
    animationInterval: 30,
    animationOnStartOnly: false,
    backgroundImage: null,
    backgroundName: '',
    backgroundOpacity: 18,
    backgroundFit: 'cover',
    showStartPage: true,
    // Settings › Start page: which parts the start page shows.
    startShowRecent: true,
    startShowFolders: true,
    startShowSamples: true,
    startShowPlanSamples: true,
    startShowBackground: true,
    startShowTutorialBanner: true,
    startRecentCount: 8,
    // The start page's cards: where the user moved them (null: the default arrangement), and how opaque they are.
    startLayout: null,
    startCardOpacity: 80,
    showLeftPanel: true,
    showRightPanel: true,
    showStatusBar: true,
    // The bottom panel (Problems: background model check, IDE style).
    showBottomPanel: true,
    bottomHeight: 170,
    leftWidth: 240,
    rightWidth: 340,
    lastDirectory: null,
    restoreSession: false,
    confirmDelete: true,
    dateFormat: language === 'ko' ? 'iso' : 'us',
    showTime: false,
    statusClock: true,
    // 3D view
    units: language === 'ko' ? 'mm' : 'mm',
    showGrid: true,
    showAxes: true,
    showLampMarkers: true,
    showSunMarker: true,
    // The dashed line from the model to the sun marker (the marker itself stays).
    showSunLine: true,
    showRulers: true,
    showScaleBar: true,
    // 2D plan: walls (and columns) cut by the plan are filled with a colour ('color', black by default) or
    // their 3D finish ('material').
    planWallFill: 'color',
    planWallColor: '#000000',
    // Wall dimensions of the active level in the 2D plan and 3D (toolbar: Dimensions).
    showPlanDims: true,
    // Where the user dragged the scale bar (fractions of the view; null = bottom left).
    scaleBarPos: null,
    // Left-button drag on empty space: 'orbit' (interior-design apps) or 'select' (a selection box, SketchUp).
    leftDrag: 'orbit',
    gridSize: 0.5,
    snapToGrid: false,
    inference: true,
    renderQuality: 'balanced',
    antialias: true,
    ambientOcclusion: true,
    shadows: true,
    shadowQuality: 'medium',
    environment: 'room',
    pixelRatio: 0,
    maxFps: 60,
    showFps: true,
    showEdges: true,
    showProfiles: false,
    fieldOfView: 50,
    orbitSpeed: 100,
    zoomSpeed: 100,
    invertZoom: false,
    panelView: 'library',
    librarySize: 'medium',
    defaultWallHeight: 2.4,
    defaultWallThickness: 0.15,
    renderWidth: 1920,
    renderHeight: 1080,
    renderSamples: 256,
    imageFormat: 'png',
    imageQuality: 0.92,
    explorerHeight: 45,
    autoSaveMinutes: 0,
    rowHeight: 26,
    tutorialOffered: false,
    /** The welcome popup at every start (its own check box and Settings › Start page). */
    showWelcome: true,
    tutorialDone: false,
  };
}

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};

/** Fills gaps and repairs out-of-range values. */
export function normalizeSettings(raw = {}, language) {
  // Only 'en' or 'ko' (a missing language gave Korean settings with the US date format).
  const base = defaultSettings(raw?.language === 'en' || raw?.language === 'ko' ? raw.language : language === 'en' ? 'en' : 'ko');
  const s = { ...base, ...(raw && typeof raw === 'object' ? raw : {}) };
  s.language = base.language; // an unknown stored language falls back like the defaults did (not always to 'ko')
  s.theme = THEME_IDS.includes(s.theme) ? s.theme : base.theme;
  s.customTheme = normalizeCustom(s.customTheme);
  s.fontFamily = typeof s.fontFamily === 'string' ? s.fontFamily : '';
  s.fontSize = clamp(s.fontSize, FONT_SIZE.min, FONT_SIZE.max, base.fontSize);
  s.fontWeight = FONT_WEIGHTS.includes(Number(s.fontWeight)) ? Number(s.fontWeight) : base.fontWeight;
  s.fontStyle = FONT_STYLES.includes(s.fontStyle) ? s.fontStyle : base.fontStyle;
  s.zoom = clamp(s.zoom, ZOOM.min, ZOOM.max, 100);
  s.backgroundKind = BACKGROUND_KINDS.includes(s.backgroundKind) ? s.backgroundKind : base.backgroundKind;
  s.animation = ANIMATIONS.includes(s.animation) ? s.animation : base.animation;
  s.animationSpeed = clamp(s.animationSpeed, 0, 300, 100);
  s.animationRandom = s.animationRandom !== false;
  // Seconds between automatic changes on the start page; 0 = never.
  s.animationInterval = ANIMATION_INTERVALS.includes(Number(s.animationInterval)) ? Number(s.animationInterval) : base.animationInterval;
  s.backgroundOpacity = clamp(s.backgroundOpacity, 0, 100, base.backgroundOpacity);
  s.backgroundFit = BACKGROUND_FITS.includes(s.backgroundFit) ? s.backgroundFit : base.backgroundFit;
  s.backgroundImage = typeof s.backgroundImage === 'string' && s.backgroundImage ? s.backgroundImage : null;
  s.lastDirectory = typeof s.lastDirectory === 'string' && s.lastDirectory ? s.lastDirectory : null;
  s.leftWidth = clamp(s.leftWidth, PANEL_MIN.left, 600, base.leftWidth);
  s.rightWidth = clamp(s.rightWidth, PANEL_MIN.right, 700, base.rightWidth);
  s.bottomHeight = clamp(s.bottomHeight, PANEL_MIN.bottom, 2000, base.bottomHeight);
  s.dateFormat = DATE_FORMATS.includes(s.dateFormat) ? s.dateFormat : base.dateFormat;
  s.rowHeight = clamp(s.rowHeight, 20, 44, 26);
  s.startRecentCount = Math.round(clamp(s.startRecentCount, 1, 10, 8));
  s.startCardOpacity = Math.round(clamp(s.startCardOpacity, 20, 100, 80));
  s.startLayout = s.startLayout && typeof s.startLayout === 'object' && !Array.isArray(s.startLayout) ? s.startLayout : null;
  s.units = UNITS.includes(s.units) ? s.units : base.units;
  s.leftDrag = s.leftDrag === 'select' ? 'select' : 'orbit';
  const sp = s.scaleBarPos;
  s.scaleBarPos = sp && Number.isFinite(sp.x) && Number.isFinite(sp.y) ? { x: Math.max(0, Math.min(1, sp.x)), y: Math.max(0, Math.min(1, sp.y)) } : null;
  s.gridSize = Number.isFinite(Number(s.gridSize)) && Number(s.gridSize) > 0 ? Number(s.gridSize) : base.gridSize;
  s.renderQuality = RENDER_QUALITIES.includes(s.renderQuality) ? s.renderQuality : base.renderQuality;
  s.shadowQuality = SHADOW_QUALITIES.includes(s.shadowQuality) ? s.shadowQuality : base.shadowQuality;
  s.environment = typeof s.environment === 'string' && s.environment ? s.environment : base.environment;
  s.pixelRatio = [0, 0.5, 0.75, 1, 1.5, 2].includes(Number(s.pixelRatio)) ? Number(s.pixelRatio) : 0;
  s.maxFps = [30, 60, 120, 0].includes(Number(s.maxFps)) ? Number(s.maxFps) : 60;
  s.fieldOfView = clamp(s.fieldOfView, 20, 100, base.fieldOfView);
  s.orbitSpeed = clamp(s.orbitSpeed, 20, 300, 100);
  s.zoomSpeed = clamp(s.zoomSpeed, 20, 300, 100);
  s.panelView = ['library', 'tools', 'materials'].includes(s.panelView) ? s.panelView : base.panelView;
  s.librarySize = ['small', 'medium', 'large'].includes(s.librarySize) ? s.librarySize : base.librarySize;
  s.defaultWallHeight = Math.min(10, Math.max(1, Number(s.defaultWallHeight) || base.defaultWallHeight));
  s.defaultWallThickness = Math.min(1, Math.max(0.03, Number(s.defaultWallThickness) || base.defaultWallThickness));
  s.renderWidth = clamp(s.renderWidth, 320, 7680, base.renderWidth);
  s.renderHeight = clamp(s.renderHeight, 240, 4320, base.renderHeight);
  s.renderSamples = clamp(s.renderSamples, 16, 4096, base.renderSamples);
  s.imageFormat = ['png', 'jpg', 'webp', 'avif', 'bmp', 'tiff', 'tga', 'pdf'].includes(s.imageFormat) ? s.imageFormat : base.imageFormat;
  s.imageQuality = clamp(s.imageQuality, 0.4, 1, base.imageQuality);
  s.explorerHeight = clamp(s.explorerHeight, 20, 85, base.explorerHeight);
  s.autoSaveMinutes = [0, 1, 5, 10, 30].includes(Number(s.autoSaveMinutes)) ? Number(s.autoSaveMinutes) : 0;
  for (const key of ['showStartPage', 'showLeftPanel', 'showRightPanel', 'showBottomPanel', 'showStatusBar', 'restoreSession', 'confirmDelete', 'showTime', 'statusClock', 'showGrid', 'showAxes', 'showLampMarkers', 'showSunMarker', 'showSunLine', 'showRulers', 'showScaleBar',
    'snapToGrid', 'inference', 'antialias', 'ambientOcclusion', 'shadows', 'showFps', 'showEdges', 'showProfiles', 'invertZoom', 'explorerSort', 'toolboxCompact', 'tutorialOffered', 'showWelcome', 'tutorialDone', 'animationOnStartOnly',
    'startShowRecent', 'startShowFolders', 'startShowSamples', 'startShowPlanSamples', 'startShowBackground', 'startShowTutorialBanner']) {
    s[key] = typeof s[key] === 'boolean' ? s[key] : base[key];
  }
  // The bottom panel was off by default in early builds: shown once for everybody, then the user decides.
  if (raw?.bottomPanelRev !== 1) s.showBottomPanel = true;
  s.bottomPanelRev = 1;
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

/** The print window's page setup (paper, scale, title block, pages …), remembered apart from the settings. */
export function loadPrintSetup(storage) {
  try {
    const raw = storage?.getItem(PRINT_KEY);
    return normalizePrintSetup(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizePrintSetup({});
  }
}

export function storePrintSetup(storage, setup) {
  try {
    storage?.setItem(PRINT_KEY, JSON.stringify(normalizePrintSetup(setup)));
    return true;
  } catch {
    return false;
  }
}

/** The next drawing zoom step in or out from `value`. */
export function zoomStep(value, direction) {
  const steps = CANVAS_ZOOM.steps;
  if (direction > 0) return steps.find((step) => step > value) ?? steps[steps.length - 1];
  return [...steps].reverse().find((step) => step < value) ?? steps[0];
}

// ───────────────────────── a new installation

/** Remembers which installation's reset was done (the installer leaves a new token each time). */
export const INSTALL_RESET_KEY = 'mysketchbook.installReset';
/** Stored lists that are the user's own data, kept by a new installation. */
const KEEP_KEYS = [RECENT_KEY, RECENT_DIRS_KEY, SESSION_KEY, MY_OBJECTS_KEY];
/** Settings that are the user's data rather than preferences: database connection, background image, tutorial history. */
const KEEP_SETTINGS = ['backgroundImage', 'backgroundName', 'lastDirectory', 'tutorialOffered', 'tutorialDone'];

/**
 * After the installer ran (it hands over `token`): every preference goes back to its default —
 * theme, fonts, zoom, panels, view options, popup places, column widths, print choices — while
 * recent files and folders, the open-plan session, the database connection and the background
 * image stay. Done once per token. Returns whether anything was reset.
 */
export function resetForNewInstall(storage, token) {
  if (!storage || !token) return false;
  try {
    if (storage.getItem(INSTALL_RESET_KEY) === String(token)) return false;
    let saved = {};
    try { saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}') ?? {}; } catch { /* unreadable: nothing to keep */ }
    const keys = [];
    for (let i = 0; i < storage.length; i++) keys.push(storage.key(i));
    for (const key of keys) if (key?.startsWith('mysketchbook.') && !KEEP_KEYS.includes(key)) storage.removeItem(key);
    const kept = Object.fromEntries(KEEP_SETTINGS.filter((key) => key in saved).map((key) => [key, saved[key]]));
    if (Object.keys(kept).length) storage.setItem(STORAGE_KEY, JSON.stringify(kept));
    storage.setItem(INSTALL_RESET_KEY, String(token));
    return true;
  } catch {
    return false;
  }
}
