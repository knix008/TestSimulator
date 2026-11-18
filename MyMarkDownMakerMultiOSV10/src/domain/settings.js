// Application settings: defaults, validation, and persistence in localStorage
// (shared by the main window and the popup windows, which watch it). Loaded
// again on the next start. `doc` holds the document's merge and export settings
// (domain/docsettings.js); the rest are the user's preferences on this computer /
// in this browser.
import { normalizeCustom, THEME_IDS } from '../themes.js';
import { normalizeDocSettings } from './docsettings.js';

export const STORAGE_KEY = 'mymarkdownmaker.settings.v1';
/** Recently used Markdown files and saved documents: [{ path, title, kind: 'file', at }]. */
export const RECENT_KEY = 'mymarkdownmaker.recent.v1';
/** Recently added folders: [{ path, title, kind: 'folder', at }]. */
export const RECENT_DIRS_KEY = 'mymarkdownmaker.recentDirs.v1';
/** The file list open when the app was closed (restored on the next start, desktop). */
export const SESSION_KEY = 'mymarkdownmaker.session.v1';

export const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800];
export const FONT_STYLES = ['normal', 'italic'];
export const FONT_SIZE = { min: 9, max: 28 };
export const ZOOM = { min: 50, max: 200, step: 10 };
/** Narrowest side panels that still show all of their content. */
export const PANEL_MIN = { left: 300, right: 300, bottom: 90 };
/** Zoom of the document (editor and preview), percent; never reaches an export. */
export const DOC_ZOOM = { min: 50, max: 300, step: 10 };
/** The editor's own text size (px at 100 % zoom). */
export const EDITOR_FONT = { min: 9, max: 28 };
export const LEFT_TABS = ['files', 'structure', 'figures'];
export const CENTER_TABS = ['edit', 'preview', 'split'];
/** The bottom panel is never taller than this share of the window. */
export const BOTTOM_MAX_SHARE = 0.6;
export const BACKGROUND_KINDS = ['animated', 'image', 'none'];
/** Choices for the start page's automatic background change (seconds; 0 = off). */
export const ANIMATION_INTERVALS = [0, 15, 30, 60, 120, 300];
/** The moving backgrounds of the start page (ui/background.js draws each). */
export const ANIMATIONS = [
  'typewriter', 'mergeStreams', 'outlineTree', 'markRain', 'pageStack', 'numbering',
  'tocLeaders', 'inkLines', 'tableCells', 'codeFence', 'figureFrames', 'quoteMarks',
  'letterDrift', 'bookPages', 'linkGraph', 'cursorBlink',
];
export const BACKGROUND_FITS = ['cover', 'contain', 'tile', 'center', 'stretch'];
export const DATE_FORMATS = ['iso', 'ko', 'us', 'eu'];

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
    theme: 'paper',
    customTheme: normalizeCustom(null),
    fontFamily: '',
    fontSize: 13,
    fontWeight: 400,
    fontStyle: 'normal',
    zoom: 100,
    backgroundKind: 'animated',
    animation: 'typewriter',
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
    startShowSamples: true,
    startShowBackground: true,
    startShowTutorialBanner: true,
    startRecentCount: 8,
    // The start page's cards: where the user moved them (null: the default arrangement), and how opaque they are.
    startLayout: null,
    startCardOpacity: 80,
    showLeftPanel: true,
    showRightPanel: true,
    showStatusBar: true,
    showBottomPanel: false,
    bottomHeight: 170,
    leftWidth: 320,
    rightWidth: 330,
    leftTab: 'files',
    centerTab: 'preview',
    docZoom: 100,
    editorFontSize: 14,
    // The preview: one continuous sheet ('flow'), real pages one under another ('pages') or two side by side ('spread').
    previewMode: 'flow',
    // Split view: the editor's share of the width (percent).
    splitShare: 50,
    // The Markdown marks bar above the editor.
    showMarkBar: true,
    // Pictures shown as pictures in the editor (off: their Markdown text).
    showPictures: true,
    lastDirectory: null,
    restoreSession: true,
    confirmDelete: true,
    dateFormat: language === 'ko' ? 'iso' : 'us',
    showTime: false,
    statusClock: true,
    rowHeight: 26,
    explorerHeight: 45,
    tutorialOffered: false,
    /** The welcome popup at every start (its own check box and Settings › Start page). */
    showWelcome: true,
    tutorialDone: false,
    /** The document's merge and export settings (domain/docsettings.js). */
    doc: normalizeDocSettings(null),
  };
}

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};

const BOOLEAN_KEYS = ['showStartPage', 'showLeftPanel', 'showRightPanel', 'showBottomPanel', 'showStatusBar', 'restoreSession', 'confirmDelete', 'showTime', 'statusClock',
  'tutorialOffered', 'showWelcome', 'tutorialDone', 'animationOnStartOnly', 'animationRandom', 'showMarkBar', 'showPictures',
  'startShowRecent', 'startShowSamples', 'startShowBackground', 'startShowTutorialBanner'];

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
  s.leftTab = LEFT_TABS.includes(s.leftTab) ? s.leftTab : base.leftTab;
  s.centerTab = CENTER_TABS.includes(s.centerTab) ? s.centerTab : base.centerTab;
  s.docZoom = clamp(s.docZoom, DOC_ZOOM.min, DOC_ZOOM.max, 100);
  s.editorFontSize = clamp(s.editorFontSize, EDITOR_FONT.min, EDITOR_FONT.max, base.editorFontSize);
  s.doc = normalizeDocSettings(s.doc);
  s.splitShare = clamp(s.splitShare, 20, 80, 50);
  s.previewMode = ['flow', 'pages', 'spread'].includes(s.previewMode) ? s.previewMode : 'flow';
  s.rightWidth = clamp(s.rightWidth, PANEL_MIN.right, 800, base.rightWidth);
  s.bottomHeight = clamp(s.bottomHeight, PANEL_MIN.bottom, 2000, base.bottomHeight);
  s.dateFormat = DATE_FORMATS.includes(s.dateFormat) ? s.dateFormat : base.dateFormat;
  s.rowHeight = clamp(s.rowHeight, 20, 44, 26);
  s.explorerHeight = clamp(s.explorerHeight, 20, 85, base.explorerHeight);
  s.startRecentCount = clamp(s.startRecentCount, 1, 10, 8);
  s.startCardOpacity = clamp(s.startCardOpacity, 20, 100, 80);
  s.startLayout = s.startLayout && typeof s.startLayout === 'object' && !Array.isArray(s.startLayout) ? s.startLayout : null;
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
export const INSTALL_RESET_KEY = 'mymarkdownmaker.installReset';
/** Stored lists that are the user's own data, kept by a new installation. */
const KEEP_KEYS = [RECENT_KEY, RECENT_DIRS_KEY, SESSION_KEY];
/** Settings that are the user's data rather than preferences. */
const KEEP_SETTINGS = ['backgroundImage', 'backgroundName', 'lastDirectory', 'tutorialOffered', 'tutorialDone'];

/**
 * After the installer ran (it hands over `token`): every preference goes back to its default while
 * the recent files and folders, the session and the background image stay. Done once per token.
 */
export function resetForNewInstall(storage, token) {
  if (!storage || !token) return false;
  try {
    if (storage.getItem(INSTALL_RESET_KEY) === String(token)) return false;
    let saved = {};
    try { saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}') ?? {}; } catch { /* unreadable: nothing to keep */ }
    const keys = [];
    for (let i = 0; i < storage.length; i++) keys.push(storage.key(i));
    for (const key of keys) if (key?.startsWith('mymarkdownmaker.') && !KEEP_KEYS.includes(key)) storage.removeItem(key);
    const kept = Object.fromEntries(KEEP_SETTINGS.filter((key) => key in saved).map((key) => [key, saved[key]]));
    if (Object.keys(kept).length) storage.setItem(STORAGE_KEY, JSON.stringify(kept));
    storage.setItem(INSTALL_RESET_KEY, String(token));
    return true;
  } catch {
    return false;
  }
}
