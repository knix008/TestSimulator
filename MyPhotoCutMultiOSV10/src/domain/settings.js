// Application settings: defaults, validation, and persistence in localStorage
// (shared by the main window and the popup windows, which watch it). Loaded
// again on the next start.
import { normalizeCustom, THEME_IDS } from '../themes.js';
import { DEFAULT_STYLE_IDS, STYLE_IDS } from '../engine/styles.js';

export const STORAGE_KEY = 'myphotocut.settings.v1';
export const RECENT_KEY = 'myphotocut.recent.v1';
export const RECENT_DIRS_KEY = 'myphotocut.recentDirs.v1';
export const SESSION_KEY = 'myphotocut.session.v1';

export const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800];
export const FONT_STYLES = ['normal', 'italic'];
export const FONT_SIZE = { min: 9, max: 28 };
export const ZOOM = { min: 50, max: 200, step: 10 };
/** Zoom of the large view in percent (toolbar, status bar, Ctrl+wheel). */
export const VIEW_ZOOM = { min: 10, max: 800, steps: [10, 15, 20, 25, 33, 50, 67, 75, 100, 125, 150, 200, 300, 400, 600, 800] };
/** Both side panels stay at this width. They are not resized, and they match. */
export const PANEL_WIDTH = 320;
export const PANEL_MIN_WIDTH = PANEL_WIDTH;
export const PANEL_MIN = { left: PANEL_WIDTH, right: PANEL_WIDTH };
export const BACKGROUND_KINDS = ['animated', 'image', 'none'];
/** Choices for the start page's automatic background change (seconds; 0 = off). */
export const ANIMATION_INTERVALS = [0, 15, 30, 60, 120, 300];
export const ANIMATIONS = [
  'faces', 'polaroids', 'brushes', 'pencil', 'halftone', 'popart', 'bubbles', 'sparkles',
  'inkdrops', 'palettes', 'film', 'lens', 'crayons', 'confetti', 'stickers', 'pixels',
];
export const BACKGROUND_FITS = ['cover', 'contain', 'tile', 'center', 'stretch'];
/** Longer side of the pictures the caricatures are drawn from on screen (bigger: sharper, slower). */
export const WORK_SIZES = [360, 480, 640, 800, 1024];
/** Longer side of saved pictures. */
export const EXPORT_SIZES = [800, 1200, 1600, 2048, 3000];
/** Picture formats the caricatures are saved in (ui/photo.js encodes them). */
export const IMAGE_TYPES = ['png', 'jpg', 'webp', 'avif', 'gif', 'bmp', 'tiff', 'tga', 'ppm', 'qoi', 'ico', 'pdf', 'svg'];
export const GALLERY_COLUMNS = [0, 2, 3, 4, 5, 6];
/** Minimum width of a gallery tile, in pixels (toolbar slider). */
export const TILE_SIZE = { min: 120, max: 480, step: 10, default: 240 };
/** How the gallery shows the caricatures (toolbar › View). */
export const GALLERY_LAYOUTS = ['grid', 'large', 'compact', 'list', 'strip'];

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
    animation: 'faces',
    animationSpeed: 100,
    animationRandom: true,
    animationInterval: 30,
    animationOnStartOnly: false,
    backgroundImage: null,
    backgroundName: '',
    backgroundOpacity: 18,
    backgroundFit: 'cover',
    showStartPage: true,
    startShowRecent: true,
    startShowFolders: true,
    startShowSamples: true,
    startShowBackground: true,
    startRecentCount: 8,
    startLayout: null,
    startCardOpacity: 80,
    showLeftPanel: true,
    showRightPanel: true,
    showStatusBar: true,
    leftWidth: PANEL_WIDTH,
    rightWidth: PANEL_WIDTH,
    lastDirectory: null,
    restoreSession: false,
    confirmDelete: true,
    statusClock: true,
    showWelcome: true,
    // Caricatures
    /** The styles drawn for a new photo (ten by default). */
    styleSet: [...DEFAULT_STYLE_IDS],
    /** Draw the set at once when a photo is opened. */
    autoGenerate: true,
    /** Frame the head and shoulders when the face is small in the photo. */
    autoCrop: true,
    /** Exaggerate what stands out in this face (features compared with an average face). */
    personalWarp: true,
    /** How strongly the differences are exaggerated (percent). */
    personalGain: 250,
    /** Use the face mesh model (more exact; off: the app's own skin-colour finder). */
    useFaceModel: true,
    /** Separate the person from the background with the segmentation model. */
    usePersonMask: true,
    workSize: 480,
    exportSize: 1600,
    exportType: 'png',
    exportQuality: 92,
    galleryColumns: 0,
    galleryTileSize: TILE_SIZE.default,
    galleryLayout: 'grid',
    showLandmarks: true,
    showNames: true,
    /** How much variations differ from the caricature they come from (percent). */
    varySpread: 12,
  };
}

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};

/** Fills gaps and repairs out-of-range values. */
export function normalizeSettings(raw = {}, language) {
  const base = defaultSettings(raw?.language === 'en' || raw?.language === 'ko' ? raw.language : language === 'en' ? 'en' : 'ko');
  const s = { ...base, ...(raw && typeof raw === 'object' ? raw : {}) };
  s.language = base.language;
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
  s.animationInterval = ANIMATION_INTERVALS.includes(Number(s.animationInterval)) ? Number(s.animationInterval) : base.animationInterval;
  s.backgroundOpacity = clamp(s.backgroundOpacity, 0, 100, base.backgroundOpacity);
  s.backgroundFit = BACKGROUND_FITS.includes(s.backgroundFit) ? s.backgroundFit : base.backgroundFit;
  s.backgroundImage = typeof s.backgroundImage === 'string' && s.backgroundImage ? s.backgroundImage : null;
  s.backgroundName = typeof s.backgroundName === 'string' ? s.backgroundName : '';
  s.lastDirectory = typeof s.lastDirectory === 'string' && s.lastDirectory ? s.lastDirectory : null;
  s.leftWidth = PANEL_WIDTH;
  s.rightWidth = PANEL_WIDTH;
  s.startRecentCount = clamp(s.startRecentCount, 1, 10, 8);
  s.startCardOpacity = clamp(s.startCardOpacity, 20, 100, 80);
  s.startLayout = s.startLayout && typeof s.startLayout === 'object' && !Array.isArray(s.startLayout) ? s.startLayout : null;
  const set = Array.isArray(s.styleSet) ? [...new Set(s.styleSet.filter((id) => STYLE_IDS.includes(id)))] : [];
  s.styleSet = set.length ? set : [...DEFAULT_STYLE_IDS];
  s.workSize = WORK_SIZES.includes(Number(s.workSize)) ? Number(s.workSize) : base.workSize;
  s.exportSize = EXPORT_SIZES.includes(Number(s.exportSize)) ? Number(s.exportSize) : base.exportSize;
  s.exportType = IMAGE_TYPES.includes(s.exportType) ? s.exportType : base.exportType;
  s.exportQuality = clamp(s.exportQuality, 40, 100, base.exportQuality);
  s.galleryColumns = GALLERY_COLUMNS.includes(Number(s.galleryColumns)) ? Number(s.galleryColumns) : 0;
  s.galleryTileSize = clamp(Math.round((clamp(s.galleryTileSize, TILE_SIZE.min, TILE_SIZE.max, base.galleryTileSize) - TILE_SIZE.min) / TILE_SIZE.step) * TILE_SIZE.step + TILE_SIZE.min, TILE_SIZE.min, TILE_SIZE.max, base.galleryTileSize);
  s.galleryLayout = GALLERY_LAYOUTS.includes(s.galleryLayout) ? s.galleryLayout : 'grid';
  s.varySpread = clamp(s.varySpread, 0, 40, base.varySpread);
  s.personalGain = clamp(s.personalGain, 0, 500, base.personalGain);
  for (const key of ['showStartPage', 'showLeftPanel', 'showRightPanel', 'showStatusBar', 'restoreSession', 'confirmDelete', 'statusClock', 'showWelcome', 'animationOnStartOnly',
    'startShowRecent', 'startShowFolders', 'startShowSamples', 'startShowBackground', 'autoGenerate', 'autoCrop', 'personalWarp', 'useFaceModel', 'usePersonMask', 'showLandmarks', 'showNames']) {
    s[key] = typeof s[key] === 'boolean' ? s[key] : base[key];
  }
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

/** The next zoom step in or out from `value`. */
export function zoomStep(value, direction) {
  const steps = VIEW_ZOOM.steps;
  if (direction > 0) return steps.find((step) => step > value) ?? steps[steps.length - 1];
  return [...steps].reverse().find((step) => step < value) ?? steps[0];
}

// ───────────────────────── a new installation

export const INSTALL_RESET_KEY = 'myphotocut.installReset';
/** Stored lists that are the user's own data, kept by a new installation. */
const KEEP_KEYS = [RECENT_KEY, RECENT_DIRS_KEY, SESSION_KEY];
/** Settings that are the user's data rather than preferences. */
const KEEP_SETTINGS = ['backgroundImage', 'backgroundName', 'lastDirectory', 'styleSet'];

/**
 * After the installer ran (it hands over `token`): every preference goes back to its default while
 * recent files and folders, the session and the background image stay. Done once per token.
 */
export function resetForNewInstall(storage, token) {
  if (!storage || !token) return false;
  try {
    if (storage.getItem(INSTALL_RESET_KEY) === String(token)) return false;
    let saved = {};
    try { saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}') ?? {}; } catch { /* unreadable: nothing to keep */ }
    const keys = [];
    for (let i = 0; i < storage.length; i++) keys.push(storage.key(i));
    for (const key of keys) if (key?.startsWith('myphotocut.') && !KEEP_KEYS.includes(key)) storage.removeItem(key);
    const kept = Object.fromEntries(KEEP_SETTINGS.filter((key) => key in saved).map((key) => [key, saved[key]]));
    if (Object.keys(kept).length) storage.setItem(STORAGE_KEY, JSON.stringify(kept));
    storage.setItem(INSTALL_RESET_KEY, String(token));
    return true;
  } catch {
    return false;
  }
}
