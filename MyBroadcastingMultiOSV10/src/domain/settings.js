// Application settings: defaults, validation, and persistence in localStorage (shared by the main window and
// the popup windows, which watch it). The user's preferences on this computer / in this browser: look,
// panels, the preview (snapping, safe areas, lock), confirmations, studio-mode options, the mixer layout.
// What the program broadcasts with lives in profiles (studio/profile.js), what it shows in scene
// collections (studio/studio.js).
import { normalizeCustom, THEME_IDS } from '../themes.js';

export const STORAGE_KEY = 'mybroadcasting.settings.v1';
/** Recently opened scene collection files: [{ path, title, kind: 'file', at }]. */
export const RECENT_KEY = 'mybroadcasting.recent.v1';
/** Recently used recording folders: [{ path, title, kind: 'folder', at }]. */
export const RECENT_DIRS_KEY = 'mybroadcasting.recentDirs.v1';
/** What was on screen when the app was closed (restored on the next start). */
export const SESSION_KEY = 'mybroadcasting.session.v1';

export const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800];
export const FONT_STYLES = ['normal', 'italic'];
export const FONT_SIZE = { min: 9, max: 28 };
export const ZOOM = { min: 50, max: 200, step: 10 };
/** Narrowest side panels that still show all of their content. */
export const PANEL_MIN = { left: 300, right: 300, bottom: 90 };
export const RIGHT_TABS = ['props', 'filters', 'transform', 'audio'];
export const BOTTOM_TABS = ['mixer', 'transitions', 'controls', 'media', 'stats', 'messages', 'problems'];
export const SNAP_DISTANCE = { min: 1, max: 60 };
/** The bottom panel is never taller than this share of the window. */
export const BOTTOM_MAX_SHARE = 0.6;
export const BACKGROUND_KINDS = ['animated', 'image', 'none'];
/** Choices for the start page's automatic background change (seconds; 0 = off). */
export const ANIMATION_INTERVALS = [0, 15, 30, 60, 120, 300];
/** The moving backgrounds of the start page (ui/background.js draws each). */
export const ANIMATIONS = [
  'onAir', 'signalWaves', 'equalizer', 'studioLights', 'filmStrip', 'broadcastTower', 'pixelGrid', 'scanLines',
  'colorBars', 'chatBubbles', 'cameraLens', 'waveform', 'starStream', 'liveDots', 'tvStatic', 'neonFrames',
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
    animation: 'onAir',
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
    showBottomPanel: true,
    bottomHeight: 230,
    leftWidth: 320,
    rightWidth: 330,
    rightTab: 'props',
    bottomTab: 'mixer',
    // The preview: snapping, safe areas, lock, and whether it is drawn at all (it can be switched off).
    snap: { enabled: true, distance: 10, edges: true, center: true, sources: true },
    safeAreas: false,
    previewLocked: false,
    previewEnabled: true,
    multiview: false,
    multiviewClickTransition: false,
    // Studio mode (Settings › General): what the Transition button does to the scenes.
    duplicateScene: false,
    swapScenes: false,
    // Outputs (Settings › General): ask first, start / stop together.
    confirmStartStream: true,
    confirmStopStream: true,
    confirmStopRecord: false,
    recordWhenStreaming: false,
    keepRecordingWhenStreamStops: true,
    replayWhenStreaming: false,
    keepReplayWhenStreamStops: true,
    // The audio mixer: strips side by side ('horizontal': each a row) or upright ('vertical').
    mixerLayout: 'horizontal',
    mixerShowHidden: false,
    // Accessibility: the colour of the selection in the preview.
    selectionColor: '#ff3b3b',
    projectorsOnTop: true,
    hideFromCapture: true,
    quickAddOpen: true,
    globalHotkeys: true,
    // The printed reports: which one, and whether scenes come with pictures.
    report: 'scenes',
    reportThumbnails: true,
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
  };
}

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};

const BOOLEAN_KEYS = ['showStartPage', 'showLeftPanel', 'showRightPanel', 'showBottomPanel', 'showStatusBar', 'restoreSession', 'confirmDelete', 'showTime', 'statusClock',
  'tutorialOffered', 'showWelcome', 'tutorialDone', 'animationOnStartOnly', 'animationRandom', 'safeAreas', 'previewLocked', 'previewEnabled', 'multiview', 'multiviewClickTransition',
  'duplicateScene', 'swapScenes', 'confirmStartStream', 'confirmStopStream', 'confirmStopRecord', 'recordWhenStreaming', 'keepRecordingWhenStreamStops', 'replayWhenStreaming', 'keepReplayWhenStreamStops', 'mixerShowHidden', 'projectorsOnTop', 'hideFromCapture', 'quickAddOpen', 'globalHotkeys', 'reportThumbnails',
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
  s.rightTab = RIGHT_TABS.includes(s.rightTab) ? s.rightTab : base.rightTab;
  s.bottomTab = BOTTOM_TABS.includes(s.bottomTab) ? s.bottomTab : base.bottomTab;
  s.snap = { ...base.snap, ...(s.snap && typeof s.snap === 'object' ? s.snap : {}) };
  s.snap.distance = clamp(s.snap.distance, SNAP_DISTANCE.min, SNAP_DISTANCE.max, 10);
  for (const k of ['enabled', 'edges', 'center', 'sources']) s.snap[k] = s.snap[k] !== false;
  s.mixerLayout = ['horizontal', 'vertical'].includes(s.mixerLayout) ? s.mixerLayout : 'horizontal';
  s.selectionColor = /^#[0-9a-f]{6}$/i.test(String(s.selectionColor)) ? s.selectionColor : base.selectionColor;
  s.report = ['scenes', 'sources', 'audio', 'hotkeys', 'output', 'session', 'features'].includes(s.report) ? s.report : 'scenes';
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
export const INSTALL_RESET_KEY = 'mybroadcasting.installReset';
/** Stored lists that are the user's own data, kept by a new installation. */
const KEEP_KEYS = [RECENT_KEY, RECENT_DIRS_KEY, SESSION_KEY];
/** The user's work: scene collections and profiles are never reset. */
const KEEP_PREFIXES = ['collection', 'profiles'].map((name) => `mybroadcasting.${name}`);
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
    for (const key of keys) if (key?.startsWith('mybroadcasting.') && !KEEP_KEYS.includes(key) && !KEEP_PREFIXES.some((p) => key.startsWith(p))) storage.removeItem(key);
    const kept = Object.fromEntries(KEEP_SETTINGS.filter((key) => key in saved).map((key) => [key, saved[key]]));
    if (Object.keys(kept).length) storage.setItem(STORAGE_KEY, JSON.stringify(kept));
    storage.setItem(INSTALL_RESET_KEY, String(token));
    return true;
  } catch {
    return false;
  }
}
