// Application settings: defaults, validation, and persistence in localStorage (shared by the main window
// and the popup windows, which watch it). The user's preferences on this computer / in this browser:
// appearance, the editor and reading view, files and links, daily notes and templates, the writing tools,
// AI providers (`ai`, src/ai/settings.js) and exports. Per-vault state (expanded folders, bookmarks,
// workspaces, pinned notes, goals) is kept per vault under VAULT_PREFS_KEY.
import { normalizeCustom, THEME_IDS } from '../themes.js';
import { defaultAiSettings, normalizeAiSettings } from '../ai/settings.js';

export const STORAGE_KEY = 'mymarkdown.settings.v1';
/** Recently opened vaults: [{ path, title, kind: 'desktop'|'browser'|'folder', at }]. */
export const RECENT_KEY = 'mymarkdown.recentVaults.v1';
/** Unused (kept for the shared recent-list helpers). */
export const RECENT_DIRS_KEY = 'mymarkdown.recentDirs.v1';
/** The vault open when the app was closed (reopened on the next start). */
export const SESSION_KEY = 'mymarkdown.session.v1';
/** Per-vault state: { [vaultId]: { expanded, sort, bookmarks, workspaces, pinned, goals, layout, ... } }. */
export const VAULT_PREFS_KEY = 'mymarkdown.vaultPrefs.v1';

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
export const LEFT_TABS = ['files', 'explorer', 'search', 'bookmarks', 'tags', 'notes'];
export const RIGHT_TABS = ['outline', 'backlinks', 'outgoing', 'properties', 'localgraph', 'ai', 'stats'];
export const NOTE_MODES = ['live', 'source', 'reading', 'split'];
export const READING_THEMES = ['app', 'original', 'dark', 'creamy', 'solarized', 'contrast'];
export const READING_FONTS = ['system', 'inter', 'open-sans', 'lora', 'roboto-slab', 'serif', 'mono'];
export const FOCUS_MODES = ['off', 'line', 'sentence', 'paragraph'];
/** The bottom panel is never taller than this share of the window. */
export const BOTTOM_MAX_SHARE = 0.6;
export const BACKGROUND_KINDS = ['animated', 'image', 'none'];
/** Choices for the start page's automatic background change (seconds; 0 = off). */
export const ANIMATION_INTERVALS = [0, 15, 30, 60, 120, 300];
/** The moving backgrounds of the start page (ui/background.js draws each). */
export const ANIMATIONS = [
  'linkGraph', 'typewriter', 'outlineTree', 'markRain', 'pageStack', 'numbering',
  'tocLeaders', 'inkLines', 'tableCells', 'codeFence', 'figureFrames', 'quoteMarks',
  'letterDrift', 'bookPages', 'mergeStreams', 'cursorBlink',
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
    startShowTemplates: true,
    startTemplateCategory: 'all',
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
    showRibbon: true,
    bottomHeight: 170,
    leftWidth: 300,
    rightWidth: 320,
    leftTab: 'files',
    rightTab: 'outline',
    bottomTab: 'problems',
    // the note view
    defaultMode: 'live',
    splitShare: 50,
    syncScroll: true,
    showProperties: true,
    showInlineTitle: true,
    // the editor
    editorFontSize: 15,
    editorFontFamily: '',
    lineHeight: 1.65,
    readableLineLength: true,
    maxWidth: 760,
    lineNumbers: false,
    foldGutter: true,
    spellcheck: false,
    focusMode: 'off',
    typewriter: false,
    smartPunctuation: false,
    autoPair: true,
    tabSize: 4,
    indentWithTabs: false,
    codeWrap: true,
    showStyleCheck: false,
    highlightSyntax: false,
    styleLanguage: 'auto',
    longSentence: 35,
    autosave: true,
    autosaveDelay: 1200,
    // the reading view (Markdific: themes, fonts, padding)
    readingTheme: 'app',
    readingFont: 'system',
    readingPadding: 'normal',
    readingWidth: 760,
    readingFontSize: 16,
    hoverNeedsMod: true,
    // files and links
    newNoteLocation: 'current',
    newNoteFolder: '',
    attachmentLocation: 'subfolder',
    attachmentSubfolder: 'attachments',
    attachmentFolder: 'attachments',
    updateLinks: true,
    useWikiLinks: true,
    deleteMode: 'system',
    showAllFiles: true,
    // Explorer tab: favorites ({ path, dir, name, vault }), shown file kinds, hidden files, folded sections
    favorites: [],
    explorerAllFiles: false,
    explorerHidden: false,
    explorerFolded: [],
    // daily notes, unique notes, templates
    dailyFolder: '',
    dailyFormat: 'YYYY-MM-DD',
    dailyTemplate: '',
    openDailyOnStart: false,
    uniqueFormat: 'YYYYMMDDHHmm',
    uniqueFolder: '',
    uniqueTemplate: '',
    templateFolder: 'Templates',
    templateDateFormat: 'YYYY-MM-DD',
    templateTimeFormat: 'HH:mm',
    // file recovery
    recoveryInterval: 5,
    recoveryKeep: 50,
    // exports
    lastExport: null,
    exportOptions: { toc: false, numberHeadings: false, embedImages: true, pageSize: 'A4', fontFamily: '', fontSizePt: 11 },
    // AI providers and keys (stored on this computer only)
    ai: defaultAiSettings(),
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
  'tutorialOffered', 'showWelcome', 'tutorialDone', 'animationOnStartOnly', 'animationRandom', 'showMarkBar', 'showRibbon',
  'startShowRecent', 'startShowSamples', 'startShowTemplates', 'startShowBackground', 'startShowTutorialBanner',
  'syncScroll', 'showProperties', 'showInlineTitle', 'readableLineLength', 'lineNumbers', 'foldGutter', 'spellcheck', 'typewriter', 'smartPunctuation', 'autoPair',
  'indentWithTabs', 'codeWrap', 'showStyleCheck', 'highlightSyntax', 'autosave', 'hoverNeedsMod', 'updateLinks', 'useWikiLinks', 'showAllFiles', 'openDailyOnStart', 'explorerAllFiles', 'explorerHidden'];
const oneOf = (value, list, fallback) => (list.includes(value) ? value : fallback);
const str = (value, fallback = '') => (typeof value === 'string' ? value : fallback);

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
  s.leftTab = oneOf(s.leftTab, LEFT_TABS, base.leftTab);
  s.rightTab = oneOf(s.rightTab, RIGHT_TABS, base.rightTab);
  s.bottomTab = oneOf(s.bottomTab, ['problems', 'messages', 'info'], 'problems');
  s.favorites = Array.isArray(s.favorites) ? s.favorites.filter((f) => f && typeof f.path === 'string' && f.path).slice(0, 200) : [];
  s.explorerFolded = Array.isArray(s.explorerFolded) ? s.explorerFolded.filter((x) => typeof x === 'string') : [];
  s.defaultMode = oneOf(s.defaultMode, NOTE_MODES, 'live');
  s.editorFontSize = clamp(s.editorFontSize, EDITOR_FONT.min, EDITOR_FONT.max, base.editorFontSize);
  s.editorFontFamily = str(s.editorFontFamily);
  s.lineHeight = Math.min(3, Math.max(1, Number(s.lineHeight) || base.lineHeight));
  s.maxWidth = clamp(s.maxWidth, 480, 1600, base.maxWidth);
  s.focusMode = oneOf(s.focusMode, FOCUS_MODES, 'off');
  s.tabSize = clamp(s.tabSize, 1, 8, 4);
  s.styleLanguage = oneOf(s.styleLanguage, ['auto', 'ko', 'en'], 'auto');
  s.longSentence = clamp(s.longSentence, 10, 200, 35);
  s.autosaveDelay = clamp(s.autosaveDelay, 300, 30000, 1200);
  s.splitShare = clamp(s.splitShare, 15, 85, 50);
  s.readingTheme = oneOf(s.readingTheme, READING_THEMES, 'app');
  s.readingFont = oneOf(s.readingFont, READING_FONTS, 'system');
  s.readingPadding = oneOf(s.readingPadding, ['compact', 'normal', 'roomy'], 'normal');
  s.readingWidth = clamp(s.readingWidth, 480, 1600, 760);
  s.readingFontSize = clamp(s.readingFontSize, 10, 32, 16);
  s.newNoteLocation = oneOf(s.newNoteLocation, ['current', 'root', 'folder'], 'current');
  s.attachmentLocation = oneOf(s.attachmentLocation, ['subfolder', 'same', 'root', 'folder'], 'subfolder');
  s.deleteMode = oneOf(s.deleteMode, ['system', 'vault', 'permanent'], 'system');
  for (const key of ['newNoteFolder', 'attachmentSubfolder', 'attachmentFolder', 'dailyFolder', 'dailyFormat', 'dailyTemplate', 'uniqueFormat', 'uniqueFolder', 'uniqueTemplate', 'templateFolder', 'templateDateFormat', 'templateTimeFormat']) s[key] = str(s[key], base[key]);
  if (!s.dailyFormat) s.dailyFormat = base.dailyFormat;
  if (!s.uniqueFormat) s.uniqueFormat = base.uniqueFormat;
  s.recoveryInterval = clamp(s.recoveryInterval, 0, 120, 5);
  s.recoveryKeep = clamp(s.recoveryKeep, 1, 500, 50);
  s.exportOptions = { ...base.exportOptions, ...(s.exportOptions && typeof s.exportOptions === 'object' ? s.exportOptions : {}) };
  s.lastExport = s.lastExport && typeof s.lastExport === 'object' ? s.lastExport : null;
  s.ai = normalizeAiSettings(s.ai);
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
export const INSTALL_RESET_KEY = 'mymarkdown.installReset';
/** Stored lists that are the user's own data, kept by a new installation. */
const KEEP_KEYS = [RECENT_KEY, RECENT_DIRS_KEY, SESSION_KEY, VAULT_PREFS_KEY];
/** Settings that are the user's data rather than preferences. */
const KEEP_SETTINGS = ['backgroundImage', 'backgroundName', 'lastDirectory', 'tutorialOffered', 'tutorialDone', 'ai'];

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
    for (const key of keys) if (key?.startsWith('mymarkdown.') && !KEEP_KEYS.includes(key)) storage.removeItem(key);
    const kept = Object.fromEntries(KEEP_SETTINGS.filter((key) => key in saved).map((key) => [key, saved[key]]));
    if (Object.keys(kept).length) storage.setItem(STORAGE_KEY, JSON.stringify(kept));
    storage.setItem(INSTALL_RESET_KEY, String(token));
    return true;
  } catch {
    return false;
  }
}
