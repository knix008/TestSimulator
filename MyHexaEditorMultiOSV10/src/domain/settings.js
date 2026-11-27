// Application settings: defaults, validation, and persistence in localStorage (shared by the main window
// and the popup windows, which watch it): appearance, the hex view (bytes per row, grouping, number bases,
// character set, colours), editing, the tools' defaults (search, hashes, strings, disassembler, compare) and
// the start page. Per-file state (bookmarks, last caret, template) is kept per file under FILE_PREFS_KEY.
import { DISASM_ARCH_IDS } from './archs.js';
import { normalizeCustom, THEME_IDS } from '../themes.js';

export const STORAGE_KEY = 'myhexa.settings.v1';
/** Recently opened files: [{ path, title, kind: 'file'|'disk'|'process'|'web', size, at }]. */
export const RECENT_KEY = 'myhexa.recentFiles.v1';
/** Unused (kept for the shared recent-list helpers). */
export const RECENT_DIRS_KEY = 'myhexa.recentDirs.v1';
/** The files open when the app was closed (reopened on the next start). */
export const SESSION_KEY = 'myhexa.session.v1';
/** Per-file state: { [path]: { bookmarks: [{offset, length, name, color}], caret, template, at } }. */
export const FILE_PREFS_KEY = 'myhexa.filePrefs.v1';
/** User templates: [{ id, name, source }]. */
export const TEMPLATES_KEY = 'myhexa.templates.v1';

export const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800];
export const FONT_STYLES = ['normal', 'italic'];
export const FONT_SIZE = { min: 9, max: 28 };
export const ZOOM = { min: 50, max: 200, step: 10 };
/** Narrowest side panels that still show all of their content. */
export const PANEL_MIN = { left: 300, right: 320, bottom: 90 };
/** The hex view's own text size (px). */
export const HEX_FONT = { min: 9, max: 32 };
// The left panel is the explorer; the right one shows the document's properties; the bottom one the log and
// information. Tools (find, strings, disassembler, calculator, recovery, devices…) are toolbar buttons that open
// windows of their own.
export const LEFT_TABS = ['explorer'];
export const RIGHT_TABS = ['inspector', 'structure', 'info', 'hashes', 'stats', 'bookmarks'];
export const BOTTOM_TABS = ['messages', 'info'];
export const BYTES_PER_ROW = [0, 4, 8, 12, 16, 20, 24, 32, 48, 64];
export const GROUP_SIZES = [1, 2, 4, 8, 16];
export const OFFSET_BASES = ['hex', 'dec', 'oct'];
export const VALUE_BASES = ['hex', 'dec', 'oct', 'bin'];
export const CHARSETS = ['ascii', 'latin1', 'cp1252', 'cp437', 'ebcdic', 'utf8', 'utf16le', 'utf16be', 'euc-kr', 'shift_jis'];
export const COPY_FORMATS = ['hex', 'hexSpaced', 'text', 'c', 'python', 'base64', 'escaped'];
export const PASTE_MODES = ['auto', 'hex', 'text'];
/** The bottom panel is never taller than this share of the window. */
export const BOTTOM_MAX_SHARE = 0.6;
export const BACKGROUND_KINDS = ['animated', 'image', 'none'];
/** Choices for the start page's automatic background change (seconds; 0 = off). */
export const ANIMATION_INTERVALS = [0, 15, 30, 60, 120, 300];
/** The moving backgrounds of the start page (ui/background.js draws each). */
export const ANIMATIONS = [
  'hexRain', 'byteGrid', 'bitStream', 'nibbleWaves', 'entropyBars', 'memoryMap',
  'linkGraph', 'typewriter', 'outlineTree', 'markRain', 'pageStack', 'numbering',
  'tocLeaders', 'inkLines', 'tableCells', 'codeFence', 'figureFrames', 'quoteMarks',
  'letterDrift', 'bookPages', 'mergeStreams', 'cursorBlink',
];
export const BACKGROUND_FITS = ['cover', 'contain', 'tile', 'center', 'stretch'];
export const DATE_FORMATS = ['iso', 'ko', 'us', 'eu'];
/** The speed slider (0–100) times this is the scenes' pace factor: 100 → 3×, 33 → about their own pace. */
export const SPEED_MAX = 3;
export const animationPace = (speed) => (Math.max(0, Math.min(100, Number(speed) || 0)) / 100) * SPEED_MAX;
export const DEFAULT_HASHES = ['crc32', 'md5', 'sha1', 'sha256'];

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
    animation: 'hexRain',
    /** 0–100: 100 is the fastest (3× the scenes' own pace), 33 their own pace; see SPEED_MAX. */
    animationSpeed: 33,
    animationSpeedScale: 100,
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
    startShowTools: true,
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
    bottomHeight: 190,
    leftWidth: 320,
    rightWidth: 360,
    leftTab: 'explorer',
    rightTab: 'inspector',
    bottomTab: 'messages',
    // ── the hex view
    bytesPerRow: 16,
    groupSize: 1,
    offsetBase: 'hex',
    valueBase: 'hex',
    uppercase: true,
    charset: 'cp1252',
    showText: true,
    showOffsets: true,
    showHeader: true,
    byteColors: true,
    highlightModified: true,
    crosshair: true,
    hexFontSize: 14,
    hexFontFamily: '',
    hexLineHeight: 1.45,
    offsetPrefix: false,
    /** Shown offsets start at this address (a memory dump's load address). */
    baseAddress: 0,
    // ── editing
    insertMode: false,
    endian: 'le',
    copyFormat: 'hex',
    pasteMode: 'auto',
    undoLimit: 0,
    confirmResize: true,
    openReadonly: false,
    autoTemplate: true,
    rememberCaret: true,
    // ── tools
    searchHistory: [],
    searchKind: 'hex',
    searchEncoding: 'utf8',
    searchCase: true,
    searchWrap: true,
    findAllLimit: 10000,
    hashAlgorithms: DEFAULT_HASHES,
    stringsMin: 5,
    stringsEncodings: ['ascii', 'utf16le'],
    disasmArch: 'x86-64',
    disasmSyntax: 'intel',
    compareMode: 'bytes',
    statsBlocks: 256,
    // Explorer tab: favorites ({ path, dir, name }), shown file kinds, hidden files, folded sections
    favorites: [],
    explorerAllFiles: true,
    explorerHidden: false,
    explorerFolded: [],
    // print
    print: null,
    lastDirectory: null,
    restoreSession: true,
    dateFormat: language === 'ko' ? 'iso' : 'us',
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

const BOOLEAN_KEYS = ['showStartPage', 'showLeftPanel', 'showRightPanel', 'showBottomPanel', 'showStatusBar', 'restoreSession', 'statusClock',
  'tutorialOffered', 'showWelcome', 'tutorialDone', 'animationOnStartOnly', 'animationRandom',
  'startShowRecent', 'startShowSamples', 'startShowTools', 'startShowBackground', 'startShowTutorialBanner',
  'uppercase', 'showText', 'showOffsets', 'showHeader', 'byteColors', 'highlightModified', 'crosshair', 'offsetPrefix', 'insertMode',
  'confirmResize', 'openReadonly', 'autoTemplate', 'rememberCaret', 'searchCase', 'searchWrap', 'explorerAllFiles', 'explorerHidden'];
const oneOf = (value, list, fallback) => (list.includes(value) ? value : fallback);
const str = (value, fallback = '') => (typeof value === 'string' ? value : fallback);

/** Fills gaps and repairs out-of-range values. */
export function normalizeSettings(raw = {}, language) {
  const base = defaultSettings(raw?.language === 'en' || raw?.language === 'ko' ? raw.language : language === 'en' ? 'en' : 'ko');
  const s = { ...base, ...(raw && typeof raw === 'object' ? raw : {}) };
  s.language = base.language;
  s.theme = THEME_IDS.includes(s.theme) ? s.theme : base.theme;
  s.customTheme = normalizeCustom(s.customTheme);
  s.fontFamily = str(s.fontFamily);
  s.fontSize = clamp(s.fontSize, FONT_SIZE.min, FONT_SIZE.max, base.fontSize);
  s.fontWeight = FONT_WEIGHTS.includes(Number(s.fontWeight)) ? Number(s.fontWeight) : base.fontWeight;
  s.fontStyle = FONT_STYLES.includes(s.fontStyle) ? s.fontStyle : base.fontStyle;
  s.zoom = clamp(s.zoom, ZOOM.min, ZOOM.max, 100);
  s.backgroundKind = BACKGROUND_KINDS.includes(s.backgroundKind) ? s.backgroundKind : base.backgroundKind;
  s.animation = ANIMATIONS.includes(s.animation) ? s.animation : base.animation;
  // Before 1.0.0 final the speed was 0–300 %: converted once, keeping the ratio (300 → 100, 100 → 33).
  if (raw && typeof raw === 'object' && raw.animationSpeedScale !== 100 && raw.animationSpeed != null) s.animationSpeed = Math.round(Number(raw.animationSpeed) / 3);
  s.animationSpeedScale = 100;
  s.animationSpeed = clamp(s.animationSpeed, 0, 100, base.animationSpeed);
  s.animationInterval = ANIMATION_INTERVALS.includes(Number(s.animationInterval)) ? Number(s.animationInterval) : base.animationInterval;
  s.backgroundOpacity = clamp(s.backgroundOpacity, 0, 100, base.backgroundOpacity);
  s.backgroundFit = BACKGROUND_FITS.includes(s.backgroundFit) ? s.backgroundFit : base.backgroundFit;
  s.backgroundImage = typeof s.backgroundImage === 'string' && s.backgroundImage ? s.backgroundImage : null;
  s.lastDirectory = typeof s.lastDirectory === 'string' && s.lastDirectory ? s.lastDirectory : null;
  s.leftWidth = clamp(s.leftWidth, PANEL_MIN.left, 900, base.leftWidth);
  s.rightWidth = clamp(s.rightWidth, PANEL_MIN.right, 900, base.rightWidth);
  s.bottomHeight = clamp(s.bottomHeight, PANEL_MIN.bottom, 2000, base.bottomHeight);
  s.leftTab = oneOf(s.leftTab, LEFT_TABS, base.leftTab);
  s.rightTab = oneOf(s.rightTab, RIGHT_TABS, base.rightTab);
  s.bottomTab = oneOf(s.bottomTab, BOTTOM_TABS, base.bottomTab);
  s.favorites = Array.isArray(s.favorites) ? s.favorites.filter((f) => f && typeof f.path === 'string' && f.path).slice(0, 200) : [];
  s.explorerFolded = Array.isArray(s.explorerFolded) ? s.explorerFolded.filter((x) => typeof x === 'string') : [];
  s.bytesPerRow = BYTES_PER_ROW.includes(Number(s.bytesPerRow)) ? Number(s.bytesPerRow) : clamp(s.bytesPerRow, 1, 128, 16);
  s.groupSize = GROUP_SIZES.includes(Number(s.groupSize)) ? Number(s.groupSize) : 1;
  s.offsetBase = oneOf(s.offsetBase, OFFSET_BASES, 'hex');
  s.valueBase = oneOf(s.valueBase, VALUE_BASES, 'hex');
  s.charset = oneOf(s.charset, CHARSETS, 'cp1252');
  s.hexFontSize = clamp(s.hexFontSize, HEX_FONT.min, HEX_FONT.max, base.hexFontSize);
  s.hexFontFamily = str(s.hexFontFamily);
  s.hexLineHeight = Math.min(2.4, Math.max(1, Number(s.hexLineHeight) || base.hexLineHeight));
  s.baseAddress = Math.max(0, Math.floor(Number(s.baseAddress) || 0));
  s.endian = oneOf(s.endian, ['le', 'be'], 'le');
  s.copyFormat = oneOf(s.copyFormat, COPY_FORMATS, 'hex');
  s.pasteMode = oneOf(s.pasteMode, PASTE_MODES, 'auto');
  s.undoLimit = clamp(s.undoLimit, 0, 100000, 0);
  s.searchHistory = Array.isArray(s.searchHistory) ? s.searchHistory.filter((x) => x && typeof x.value === 'string').slice(0, 30) : [];
  s.searchKind = oneOf(s.searchKind, ['hex', 'text', 'regex', 'int', 'float'], 'hex');
  s.searchEncoding = oneOf(s.searchEncoding, ['ascii', 'latin1', 'cp1252', 'cp437', 'ebcdic', 'utf8', 'utf16le', 'utf16be', 'utf32le', 'utf32be', 'euc-kr', 'shift_jis', 'gb18030', 'big5'], 'utf8');
  s.findAllLimit = clamp(s.findAllLimit, 10, 1000000, 10000);
  s.hashAlgorithms = Array.isArray(s.hashAlgorithms) && s.hashAlgorithms.length ? s.hashAlgorithms.filter((x) => typeof x === 'string') : DEFAULT_HASHES;
  s.stringsMin = clamp(s.stringsMin, 2, 256, 5);
  s.stringsEncodings = Array.isArray(s.stringsEncodings) && s.stringsEncodings.length ? s.stringsEncodings.filter((x) => ['ascii', 'utf8', 'utf16le', 'utf16be'].includes(x)) : ['ascii', 'utf16le'];
  s.disasmArch = oneOf(s.disasmArch, DISASM_ARCH_IDS, 'x86-64');
  s.disasmSyntax = oneOf(s.disasmSyntax, ['intel', 'nasm', 'gas', 'masm'], 'intel');
  s.compareMode = oneOf(s.compareMode, ['bytes', 'sync'], 'bytes');
  s.statsBlocks = clamp(s.statsBlocks, 16, 4096, 256);
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
export const INSTALL_RESET_KEY = 'myhexa.installReset';
/** Stored lists that are the user's own data, kept by a new installation. */
const KEEP_KEYS = [RECENT_KEY, RECENT_DIRS_KEY, SESSION_KEY, FILE_PREFS_KEY, TEMPLATES_KEY];
/** Settings that are the user's data rather than preferences. */
const KEEP_SETTINGS = ['backgroundImage', 'backgroundName', 'lastDirectory', 'tutorialOffered', 'tutorialDone', 'favorites', 'searchHistory'];

/**
 * After the installer ran (it hands over `token`): every preference goes back to its default while
 * the recent files, the session, bookmarks, templates and the background image stay. Done once per token.
 */
export function resetForNewInstall(storage, token) {
  if (!storage || !token) return false;
  try {
    if (storage.getItem(INSTALL_RESET_KEY) === String(token)) return false;
    let saved = {};
    try { saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}') ?? {}; } catch { /* unreadable: nothing to keep */ }
    const keys = [];
    for (let i = 0; i < storage.length; i++) keys.push(storage.key(i));
    for (const key of keys) if (key?.startsWith('myhexa.') && !KEEP_KEYS.includes(key)) storage.removeItem(key);
    const kept = Object.fromEntries(KEEP_SETTINGS.filter((key) => key in saved).map((key) => [key, saved[key]]));
    if (Object.keys(kept).length) storage.setItem(STORAGE_KEY, JSON.stringify(kept));
    storage.setItem(INSTALL_RESET_KEY, String(token));
    return true;
  } catch {
    return false;
  }
}
