// Application settings: defaults, validation, and persistence in localStorage
// (shared by the main window and the popup windows, which watch it). Loaded
// again on the next start. Board data itself lives in the database (the core);
// these are the user's preferences on this computer / in this browser.
import { normalizeCustom, THEME_IDS } from '../themes.js';

export const STORAGE_KEY = 'myboard.settings.v1';
/** Recently opened projects and boards: [{ path: '<kind>:<id>', name, kind, project, at }]. */
export const RECENT_KEY = 'myboard.recent.v1';
/** Recently used databases (desktop: connection labels). */
export const RECENT_DIRS_KEY = 'myboard.recentDbs.v1';
/** The board open when the app was closed (restored on the next start). */
export const SESSION_KEY = 'myboard.session.v1';

export const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800];
export const FONT_STYLES = ['normal', 'italic'];
export const FONT_SIZE = { min: 9, max: 28 };
export const ZOOM = { min: 50, max: 200, step: 10 };
/** Narrowest side panels that still show all of their content. */
export const PANEL_MIN = { left: 300, right: 300, bottom: 90 };
/** The bottom panel is never taller than this share of the window. */
export const BOTTOM_MAX_SHARE = 0.6;
export const BACKGROUND_KINDS = ['animated', 'image', 'none'];
/** Choices for the start page's automatic background change (seconds; 0 = off). */
export const ANIMATION_INTERVALS = [0, 15, 30, 60, 120, 300];
/** The moving backgrounds of the start page (ui/background.js draws each). */
export const ANIMATIONS = [
  'blueprint', 'floorplan', 'isometric', 'wireframe', 'sunlight', 'dust', 'fabric', 'woodgrain', 'tiles', 'dimensions',
  'swatches', 'lamps', 'curtains', 'leaves', 'perspective', 'bricks', 'furniture', 'sunpath', 'parquet', 'contours',
];
export const BACKGROUND_FITS = ['cover', 'contain', 'tile', 'center', 'stretch'];
export const DATE_FORMATS = ['iso', 'ko', 'us', 'eu'];
/** Board card density (the UI agent's board view reads it). */
export const CARD_DENSITIES = ['compact', 'normal', 'comfortable'];

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
    startShowTemplates: true,
    startShowSamples: true,
    startShowDatabase: true,
    startShowBackground: true,
    startShowTutorialBanner: true,
    startRecentCount: 8,
    // The start page's cards: where the user moved them (null: the default arrangement), and how opaque they are.
    startLayout: null,
    startCardOpacity: 80,
    showLeftPanel: true,
    showRightPanel: true,
    showStatusBar: true,
    showBottomPanel: true,
    bottomHeight: 170,
    leftWidth: 380,
    // The left panel's lower section (the current view's own navigation): height in px, shown or not.
    leftViewHeight: 240,
    showViewSide: true,
    rightWidth: 380,
    lastDirectory: null,
    restoreSession: true,
    confirmDelete: true,
    dateFormat: language === 'ko' ? 'iso' : 'us',
    showTime: false,
    statusClock: true,
    // Board view preferences (the board view reads these).
    cardDensity: 'normal',
    showCardAvatars: true,
    showCardKeys: true,
    showEmptySwimlanes: false,
    realtimePresence: true,
    rowHeight: 26,
    explorerHeight: 45,
    tutorialOffered: false,
    /** The welcome popup at every start (its own check box and Settings › Start page). */
    showWelcome: true,
    tutorialDone: false,
    /** Icons the user picked lately (icon picker "Recent" row), newest first. */
    recentIcons: [],
  };
}

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};

const BOOLEAN_KEYS = ['showStartPage', 'showLeftPanel', 'showRightPanel', 'showBottomPanel', 'showStatusBar', 'restoreSession', 'confirmDelete', 'showTime', 'statusClock',
  'tutorialOffered', 'showWelcome', 'tutorialDone', 'animationOnStartOnly', 'animationRandom', 'showCardAvatars', 'showCardKeys', 'showEmptySwimlanes', 'realtimePresence',
  'startShowRecent', 'startShowTemplates', 'startShowSamples', 'startShowDatabase', 'startShowBackground', 'startShowTutorialBanner'];

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
  s.animationInterval = ANIMATION_INTERVALS.includes(Number(s.animationInterval)) ? Number(s.animationInterval) : base.animationInterval;
  s.backgroundOpacity = clamp(s.backgroundOpacity, 0, 100, base.backgroundOpacity);
  s.backgroundFit = BACKGROUND_FITS.includes(s.backgroundFit) ? s.backgroundFit : base.backgroundFit;
  s.backgroundImage = typeof s.backgroundImage === 'string' && s.backgroundImage ? s.backgroundImage : null;
  s.lastDirectory = typeof s.lastDirectory === 'string' && s.lastDirectory ? s.lastDirectory : null;
  s.leftWidth = clamp(s.leftWidth, PANEL_MIN.left, 800, base.leftWidth);
  s.leftViewHeight = clamp(s.leftViewHeight, 120, 2000, base.leftViewHeight);
  s.showViewSide = s.showViewSide !== false;
  s.rightWidth = clamp(s.rightWidth, PANEL_MIN.right, 800, base.rightWidth);
  s.bottomHeight = clamp(s.bottomHeight, PANEL_MIN.bottom, 2000, base.bottomHeight);
  s.dateFormat = DATE_FORMATS.includes(s.dateFormat) ? s.dateFormat : base.dateFormat;
  s.rowHeight = clamp(s.rowHeight, 20, 44, 26);
  s.explorerHeight = clamp(s.explorerHeight, 20, 85, base.explorerHeight);
  s.startRecentCount = clamp(s.startRecentCount, 1, 10, 8);
  s.startCardOpacity = clamp(s.startCardOpacity, 20, 100, 80);
  s.startLayout = s.startLayout && typeof s.startLayout === 'object' && !Array.isArray(s.startLayout) ? s.startLayout : null;
  s.cardDensity = CARD_DENSITIES.includes(s.cardDensity) ? s.cardDensity : base.cardDensity;
  s.recentIcons = Array.isArray(s.recentIcons) ? s.recentIcons.filter((x) => typeof x === 'string' && x.length < 200).slice(0, 24) : [];
  for (const key of BOOLEAN_KEYS) s[key] = typeof s[key] === 'boolean' ? s[key] : base[key];
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

// ───────────────────────── a new installation

/** Remembers which installation's reset was done (the installer leaves a new token each time). */
export const INSTALL_RESET_KEY = 'myboard.installReset';
/** Stored lists that are the user's own data, kept by a new installation. */
const KEEP_KEYS = [RECENT_KEY, RECENT_DIRS_KEY, SESSION_KEY];
/** Settings that are the user's data rather than preferences. */
const KEEP_SETTINGS = ['backgroundImage', 'backgroundName', 'lastDirectory', 'tutorialOffered', 'tutorialDone', 'recentIcons'];

/**
 * After the installer ran (it hands over `token`): every preference goes back to its default while
 * recent projects, the session and the background image stay. The database (and its connection,
 * kept by the core in <dataDir>/database.json) is never touched. Done once per token.
 */
export function resetForNewInstall(storage, token) {
  if (!storage || !token) return false;
  try {
    if (storage.getItem(INSTALL_RESET_KEY) === String(token)) return false;
    let saved = {};
    try { saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}') ?? {}; } catch { /* unreadable: nothing to keep */ }
    const keys = [];
    for (let i = 0; i < storage.length; i++) keys.push(storage.key(i));
    for (const key of keys) if (key?.startsWith('myboard.') && !KEEP_KEYS.includes(key)) storage.removeItem(key);
    const kept = Object.fromEntries(KEEP_SETTINGS.filter((key) => key in saved).map((key) => [key, saved[key]]));
    if (Object.keys(kept).length) storage.setItem(STORAGE_KEY, JSON.stringify(kept));
    storage.setItem(INSTALL_RESET_KEY, String(token));
    return true;
  } catch {
    return false;
  }
}
