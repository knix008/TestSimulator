// Application settings: defaults, validation, and persistence in localStorage
// (shared by the main window and the popup windows, which watch it). Loaded
// again on the next start.
import { normalizeCustom, THEME_IDS } from '../themes.js';
import { normalizePrintSetup } from '../print/layout.js';

export const STORAGE_KEY = 'myaudiomaker.settings.v1';
export const RECENT_KEY = 'myaudiomaker.recent.v1';
export const RECENT_DIRS_KEY = 'myaudiomaker.recentDirs.v1';
export const SESSION_KEY = 'myaudiomaker.session.v1';
/** The user's own library objects (imported 3D models): ids and names; the bytes live in IndexedDB / app data. */
export const MY_OBJECTS_KEY = 'myaudiomaker.myObjects.v1';
export const PRINT_KEY = 'myaudiomaker.print.v1';
/** The user's AI key: kept apart from the settings (a settings reset or a new installation keeps it). */
export const AI_KEY = 'myaudiomaker.aiKey.v1';

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
  'waveform', 'equalizer', 'notes', 'staff', 'vinyl', 'keys', 'spectrum', 'ripples', 'strings', 'metronome',
  'sequencer', 'oscilloscope', 'speakers', 'cassette', 'confetti', 'lyrics', 'circle', 'mixer', 'aurora', 'stars',
];
export const BACKGROUND_FITS = ['cover', 'contain', 'tile', 'center', 'stretch'];
export const DATE_FORMATS = ['iso', 'ko', 'us', 'eu'];
export const SAMPLE_RATES = [44100, 48000];
export const BIT_DEPTHS = [16, 24, 32];
export const AI_PROVIDERS = ['builtin', 'claude', 'ollama'];
export const SNAP_VALUES = [1, 0.5, 0.25, 0.125, 1 / 3, 1 / 6, 0];
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
    animation: 'waveform',
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
    leftWidth: 300,
    rightWidth: 340,
    lastDirectory: null,
    restoreSession: false,
    confirmDelete: true,
    dateFormat: language === 'ko' ? 'iso' : 'us',
    showTime: false,
    statusClock: true,
    // Playback
    masterVolume: 85,
    metronome: false,
    followPlayhead: true,
    previewNotes: true,
    // Editing
    rollSnap: 0.25,
    rollGhosts: true,
    rollChordTones: true,
    autoFitMelody: true,
    sheetZoom: 100,
    /** The Lyrics view shows each section's melody on a staff above its words. */
    lyricsStaff: true,
    /** The arrangement's vocal lane shows notes and syllables (when there is room). */
    vocalLaneLyrics: true,
    /** While playing, a sing-along strip shows the line being sung (notes and lyrics). */
    karaoke: true,
    lyricLanguage: language === 'en' ? 'en' : 'ko',
    defaultVocal: 'auto',
    // Export
    exportSampleRate: 44100,
    exportBits: 16,
    exportNormalize: true,
    // AI: the built-in writer works offline; Claude needs the user's key; Ollama runs on this computer.
    aiProvider: 'builtin',
    aiModel: 'claude-opus-5-5',
    /** The model id when aiModel is 'custom' (a newer Claude model, say). */
    aiModelCustom: '',
    /** Claude's thinking depth: low · medium · high. */
    aiEffort: 'medium',
    /** focused · balanced · creative (prompt wording; Ollama temperature). */
    aiCreativity: 'balanced',
    /** Seconds before an AI request is given up. */
    aiTimeout: 180,
    /** When Claude or Ollama fails, write the song with the built-in writer instead (with a notice). */
    aiFallback: true,
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.1',
    /** The models Ollama listed last time (for the model menus). */
    ollamaModels: [],
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
  s.masterVolume = clamp(s.masterVolume, 0, 150, base.masterVolume);
  s.rollSnap = SNAP_VALUES.some((v) => Math.abs(v - Number(s.rollSnap)) < 1e-6) ? Number(s.rollSnap) : base.rollSnap;
  s.sheetZoom = clamp(s.sheetZoom, 50, 200, 100);
  s.lyricsStaff = s.lyricsStaff !== false;
  s.vocalLaneLyrics = s.vocalLaneLyrics !== false;
  s.karaoke = s.karaoke !== false;
  s.lyricLanguage = s.lyricLanguage === 'en' ? 'en' : 'ko';
  s.defaultVocal = ['auto', 'voiceFemale', 'voiceMale', 'voiceChoir', 'none'].includes(s.defaultVocal) ? s.defaultVocal : 'auto';
  s.exportSampleRate = SAMPLE_RATES.includes(Number(s.exportSampleRate)) ? Number(s.exportSampleRate) : base.exportSampleRate;
  s.exportBits = BIT_DEPTHS.includes(Number(s.exportBits)) ? Number(s.exportBits) : base.exportBits;
  s.aiProvider = AI_PROVIDERS.includes(s.aiProvider) ? s.aiProvider : 'builtin';
  s.aiModel = typeof s.aiModel === 'string' && s.aiModel ? s.aiModel : base.aiModel;
  s.aiModelCustom = typeof s.aiModelCustom === 'string' ? s.aiModelCustom.trim().slice(0, 100) : '';
  s.aiEffort = ['low', 'medium', 'high'].includes(s.aiEffort) ? s.aiEffort : base.aiEffort;
  s.aiCreativity = ['focused', 'balanced', 'creative'].includes(s.aiCreativity) ? s.aiCreativity : base.aiCreativity;
  s.aiTimeout = [60, 120, 180, 300, 600].includes(Number(s.aiTimeout)) ? Number(s.aiTimeout) : base.aiTimeout;
  s.aiFallback = s.aiFallback !== false;
  s.ollamaModels = Array.isArray(s.ollamaModels) ? s.ollamaModels.filter((m) => typeof m === 'string' && m).slice(0, 100) : [];
  s.ollamaUrl = typeof s.ollamaUrl === 'string' && /^https?:[/][/]/.test(s.ollamaUrl) ? s.ollamaUrl : base.ollamaUrl;
  s.ollamaModel = typeof s.ollamaModel === 'string' && s.ollamaModel.trim() ? s.ollamaModel.trim() : base.ollamaModel;
  // The key is not a setting: it lives under AI_KEY (loadSettings fills it in).
  delete s.aiApiKey;
  s.explorerHeight = clamp(s.explorerHeight, 20, 85, base.explorerHeight);
  s.autoSaveMinutes = [0, 1, 5, 10, 30].includes(Number(s.autoSaveMinutes)) ? Number(s.autoSaveMinutes) : 0;
  for (const key of ['showStartPage', 'showLeftPanel', 'showRightPanel', 'showBottomPanel', 'showStatusBar', 'restoreSession', 'confirmDelete', 'showTime', 'statusClock',
    'metronome', 'followPlayhead', 'previewNotes', 'rollGhosts', 'rollChordTones', 'autoFitMelody', 'exportNormalize', 'tutorialOffered', 'showWelcome', 'tutorialDone', 'animationOnStartOnly',
    'startShowRecent', 'startShowFolders', 'startShowSamples', 'startShowBackground', 'startShowTutorialBanner']) {
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
    return { ...normalizeSettings(raw ? JSON.parse(raw) : {}, systemLanguage()), aiApiKey: loadAiKey(storage) };
  } catch {
    return { ...normalizeSettings({}, systemLanguage()), aiApiKey: loadAiKey(storage) };
  }
}

/** The AI key (Settings › AI), or ''. */
export function loadAiKey(storage) {
  try { return storage?.getItem(AI_KEY) ?? ''; } catch { return ''; }
}

export function storeAiKey(storage, key) {
  try { if (key) storage?.setItem(AI_KEY, String(key).trim()); else storage?.removeItem(AI_KEY); return true; } catch { return false; }
}

export function storeSettings(storage, settings) {
  try {
    const { aiApiKey, ...rest } = settings ?? {};
    void aiApiKey;
    storage?.setItem(STORAGE_KEY, JSON.stringify(rest));
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
export const INSTALL_RESET_KEY = 'myaudiomaker.installReset';
/** Stored lists that are the user's own data, kept by a new installation. */
const KEEP_KEYS = [RECENT_KEY, RECENT_DIRS_KEY, SESSION_KEY, MY_OBJECTS_KEY, AI_KEY];
/** Settings that are the user's data rather than preferences: database connection, background image, tutorial history. */
const KEEP_SETTINGS = ['backgroundImage', 'backgroundName', 'lastDirectory', 'tutorialOffered', 'tutorialDone', 'aiProvider', 'aiModel', 'aiModelCustom', 'ollamaUrl', 'ollamaModel', 'ollamaModels'];

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
    for (const key of keys) if (key?.startsWith('myaudiomaker.') && !KEEP_KEYS.includes(key)) storage.removeItem(key);
    const kept = Object.fromEntries(KEEP_SETTINGS.filter((key) => key in saved).map((key) => [key, saved[key]]));
    if (Object.keys(kept).length) storage.setItem(STORAGE_KEY, JSON.stringify(kept));
    storage.setItem(INSTALL_RESET_KEY, String(token));
    return true;
  } catch {
    return false;
  }
}
