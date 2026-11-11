// Application settings: defaults, validation, and persistence in localStorage (shared by the
// main window and the popup windows, which watch it). Loaded again on the next start.
import { normalizeCustom, THEME_IDS } from '../themes.js';
import { DESIGN_IDS, normalizeCustomDesigns } from './designs.js';

export const STORAGE_KEY = 'myhomemaker.settings.v1';
export const RECENT_KEY = 'myhomemaker.recent.v1';
export const RECENT_DIRS_KEY = 'myhomemaker.recentDirs.v1';
export const SESSION_KEY = 'myhomemaker.session.v1';

export const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800];
export const FONT_STYLES = ['normal', 'italic'];
export const FONT_SIZE = { min: 9, max: 28 };
export const ZOOM = { min: 50, max: 200, step: 10 };
/** Canvas zoom in percent (toolbar, status bar, Ctrl+wheel). */
export const CANVAS_ZOOM = { min: 10, max: 200, steps: [10, 15, 20, 25, 33, 40, 50, 60, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200] };
/** Narrowest side panels that still show all of their content. */
export const PANEL_MIN = { left: 230, right: 320, bottom: 90 };
/** The Problems panel takes at most this share of the window's height. */
export const BOTTOM_MAX_SHARE = 0.6;
/** The user's dictionary holds at most this many words. */
export const USER_WORDS_MAX = 5000;
export const BACKGROUND_KINDS = ['animated', 'image', 'none'];
/** Choices for the start page's automatic background change (seconds; 0 = off). */
export const ANIMATION_INTERVALS = [0, 15, 30, 60, 120, 300];
export const ANIMATIONS = [
  'aurora', 'waves', 'particles', 'constellation', 'bubbles', 'gridflow', 'flowchart', 'starfield', 'rain', 'snow',
  'fireflies', 'ripples', 'coderain', 'hexagons', 'orbits', 'lava', 'spiral', 'confetti', 'nodes', 'ribbons',
];
export const BACKGROUND_FITS = ['cover', 'contain', 'tile', 'center', 'stretch'];
/** Where bulletin boards keep their posts when they use a database (Settings › Database; desktop app). SQLite3 is the default. */
export const DB_KINDS = ['sqlite', 'mysql', 'mariadb', 'postgres', 'mssql'];
/** The language of the board server written next to a published site. Node stays the default. */
export const BOARD_BACKENDS = ['node', 'go', 'rust', 'python'];
export const DB_DEFAULT_PORTS = { mariadb: 3306, mysql: 3306, postgres: 5432, mssql: 1433 };
export const usesDbServer = (kind) => kind === 'mariadb' || kind === 'mysql' || kind === 'postgres' || kind === 'mssql';
/** The names the UI shows for each database kind. */
export const DB_NAMES = { sqlite: 'SQLite3', mysql: 'MySQL', mariadb: 'MariaDB', postgres: 'PostgreSQL', mssql: 'MSSQL' };

/** The port used: the one set, or the usual one of the server kind. */
export const dbPortOf = (settings) => settings.dbPort ?? DB_DEFAULT_PORTS[settings.dbKind] ?? null;

/** Problems that stop a connection (i18n keys), [] when the settings are complete. An empty SQLite file means the app's own. */
export function dbProblems(settings) {
  const problems = [];
  if (!DB_KINDS.includes(settings.dbKind)) problems.push('db.needKind');
  if (usesDbServer(settings.dbKind)) {
    if (!String(settings.dbHost ?? '').trim()) problems.push('db.needHost');
    const name = String(settings.dbName ?? '').trim();
    if (!name) problems.push('db.needName');
    else if (!/^[A-Za-z0-9_$-]+$/.test(name)) problems.push('db.badName');
  }
  return problems;
}

/** Connection settings for the backend (db.rs DbConfig). `password` = the one for this run when it is not saved. */
export function dbConfig(settings, password = '') {
  const server = usesDbServer(settings.dbKind);
  return {
    kind: settings.dbKind,
    host: server ? settings.dbHost : null,
    port: server ? dbPortOf(settings) : null,
    database: server ? settings.dbName : null,
    user: server ? settings.dbUser : null,
    password: server ? (settings.dbSavePassword ? settings.dbPassword : password) || '' : null,
    file: settings.dbKind === 'sqlite' ? settings.dbFile : null,
  };
}

/** "MariaDB · me@localhost:3306/myhomemaker" / "SQLite3 · C:\…\board.db" (never the password). */
export function dbDescribe(settings, defaultFile = '') {
  if (settings.dbKind === 'sqlite') return `SQLite3 · ${settings.dbFile || defaultFile}`;
  return `${DB_NAMES[settings.dbKind] ?? settings.dbKind} · ${settings.dbUser ? `${settings.dbUser}@` : ''}${settings.dbHost}:${dbPortOf(settings)}/${settings.dbName}`;
}

/** Canvas widths (views/canvas.js DEVICES). */
export const DEVICE_IDS = ['desktop', 'tablet', 'mobile'];

/** The first start after the installer: the program opens in the language chosen there (once). */
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
    animation: 'aurora',
    animationSpeed: 100,
    animationRandom: true,
    animationInterval: 30,
    animationOnStartOnly: true,
    backgroundImage: null,
    backgroundName: '',
    backgroundOpacity: 18,
    backgroundFit: 'cover',
    showStartPage: true,
    startShowRecent: true,
    startShowFolders: true,
    startShowSamples: true,
    startShowBackground: true,
    startShowTutorialBanner: true,
    startRecentCount: 8,
    startLayout: null,
    startBgOpacity: 80,
    showLeftPanel: true,
    showRightPanel: true,
    showStatusBar: true,
    showBottomPanel: true,
    bottomHeight: 170,
    // Spelling (the Problems panel)
    spellCheck: true,
    spellEnglish: true,
    spellKorean: true,
    userWords: [],
    leftWidth: 250,
    rightWidth: 360,
    explorerHeight: 38,
    lastDirectory: null,
    lastPublishDirectory: null,
    restoreSession: false,
    confirmDelete: true,
    statusClock: true,
    // The editor
    defaultDesign: 'ocean',
    defaultDevice: 'desktop',
    autoFit: true,
    wordWrap: false,
    showHover: true,
    toolboxCompact: false,
    confirmPublish: true,
    publishExtractImages: true,
    autoSaveMinutes: 0,
    autoDownloadPackages: true,
    customDesigns: [],
    dbKind: 'sqlite',
    boardBackend: 'node',
    dbHost: 'localhost',
    dbPort: null,
    dbName: 'myhomemaker',
    dbUser: '',
    dbFile: '',
    dbSavePassword: false,
    dbPassword: '',
    rowHeight: 26,
    tutorialOffered: false,
    showWelcome: true,
    tutorialDone: false,
  };
}

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};

const BOOLEANS = ['autoDownloadPackages', 'showStartPage', 'showLeftPanel', 'showRightPanel', 'showStatusBar', 'showBottomPanel', 'spellCheck', 'spellEnglish', 'spellKorean', 'restoreSession', 'confirmDelete', 'statusClock', 'autoFit', 'wordWrap', 'showHover', 'toolboxCompact',
  'confirmPublish', 'publishExtractImages', 'tutorialOffered', 'showWelcome', 'tutorialDone', 'animationOnStartOnly', 'animationRandom',
  'startShowRecent', 'startShowFolders', 'startShowSamples', 'startShowBackground', 'startShowTutorialBanner'];

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
  s.lastPublishDirectory = typeof s.lastPublishDirectory === 'string' && s.lastPublishDirectory ? s.lastPublishDirectory : null;
  s.leftWidth = clamp(s.leftWidth, PANEL_MIN.left, 600, base.leftWidth);
  s.rightWidth = clamp(s.rightWidth, PANEL_MIN.right, 700, base.rightWidth);
  s.bottomHeight = clamp(s.bottomHeight, PANEL_MIN.bottom, 2000, base.bottomHeight);
  s.userWords = normalizeUserWords(s.userWords);
  s.explorerHeight = clamp(s.explorerHeight, 15, 80, base.explorerHeight);
  s.rowHeight = clamp(s.rowHeight, 20, 44, 26);
  s.startRecentCount = clamp(s.startRecentCount, 1, 10, 8);
  if (raw && typeof raw === 'object' && raw.startBgOpacity == null && raw.startCardOpacity != null) s.startBgOpacity = raw.startCardOpacity;
  s.startBgOpacity = clamp(s.startBgOpacity, 0, 100, 80);
  delete s.startCardOpacity;
  s.startLayout = s.startLayout && typeof s.startLayout === 'object' && !Array.isArray(s.startLayout) ? s.startLayout : null;
  s.defaultDesign = DESIGN_IDS.includes(s.defaultDesign) ? s.defaultDesign : base.defaultDesign;
  s.customDesigns = normalizeCustomDesigns(s.customDesigns);
  s.dbKind = DB_KINDS.includes(s.dbKind) ? s.dbKind : 'sqlite';
  s.boardBackend = BOARD_BACKENDS.includes(s.boardBackend) ? s.boardBackend : 'node';
  s.dbHost = typeof s.dbHost === 'string' && s.dbHost.trim() ? s.dbHost.trim() : 'localhost';
  const port = Number(s.dbPort);
  s.dbPort = s.dbPort != null && s.dbPort !== '' && Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
  s.dbName = typeof s.dbName === 'string' ? s.dbName.trim() : 'myhomemaker';
  s.dbUser = typeof s.dbUser === 'string' ? s.dbUser : '';
  s.dbFile = typeof s.dbFile === 'string' ? s.dbFile.trim() : '';
  s.dbSavePassword = s.dbSavePassword === true;
  s.dbPassword = s.dbSavePassword && typeof s.dbPassword === 'string' ? s.dbPassword : '';
  s.defaultDevice = DEVICE_IDS.includes(s.defaultDevice) ? s.defaultDevice : base.defaultDevice;
  s.autoSaveMinutes = [0, 1, 5, 10, 30].includes(Number(s.autoSaveMinutes)) ? Number(s.autoSaveMinutes) : 0;
  for (const key of BOOLEANS) s[key] = typeof s[key] === 'boolean' ? s[key] : base[key];
  return s;
}

/** The user's dictionary: valid words only (letters; Hangul or Latin), each once, sorted, at most USER_WORDS_MAX. */
export function normalizeUserWords(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const word = raw.trim().normalize('NFC').replace(/’/g, "'");
    if (!word || word.length > 40 || !/^(?:[가-힣]+|[A-Za-z]+(?:['-][A-Za-z]+)*)$/.test(word)) continue;
    seen.add(/[가-힣]/.test(word) ? word : word.toLowerCase());
  }
  return [...seen].sort((a, b) => a.localeCompare(b)).slice(0, USER_WORDS_MAX);
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

/** The next canvas zoom step in or out from `value`. */
export function zoomStep(value, direction) {
  const steps = CANVAS_ZOOM.steps;
  if (direction > 0) return steps.find((step) => step > value) ?? steps[steps.length - 1];
  return [...steps].reverse().find((step) => step < value) ?? steps[0];
}

// ───────────────────────── a new installation

export const INSTALL_RESET_KEY = 'myhomemaker.installReset';
/** Stored lists that are the user's own data, kept by a new installation. */
const KEEP_KEYS = [RECENT_KEY, RECENT_DIRS_KEY, SESSION_KEY];
/** Settings that are the user's data rather than preferences. */
const KEEP_SETTINGS = ['customDesigns', 'userWords', 'backgroundImage', 'backgroundName', 'lastDirectory', 'lastPublishDirectory', 'tutorialOffered', 'tutorialDone'];

/** After the installer ran (it hands over `token`): preferences go back to their defaults, the user's data stays. Once per token. */
export function resetForNewInstall(storage, token) {
  if (!storage || !token) return false;
  try {
    if (storage.getItem(INSTALL_RESET_KEY) === String(token)) return false;
    let saved = {};
    try { saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}') ?? {}; } catch { /* unreadable: nothing to keep */ }
    const keys = [];
    for (let i = 0; i < storage.length; i++) keys.push(storage.key(i));
    for (const key of keys) if (key?.startsWith('myhomemaker.') && !KEEP_KEYS.includes(key)) storage.removeItem(key);
    const kept = Object.fromEntries(KEEP_SETTINGS.filter((key) => key in saved).map((key) => [key, saved[key]]));
    if (Object.keys(kept).length) storage.setItem(STORAGE_KEY, JSON.stringify(kept));
    storage.setItem(INSTALL_RESET_KEY, String(token));
    return true;
  } catch {
    return false;
  }
}
