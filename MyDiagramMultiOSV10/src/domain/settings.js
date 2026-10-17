// Application settings: defaults, validation, and persistence in localStorage
// (shared by the main window and the popup windows, which watch it). Loaded
// again on the next start.
import { normalizeCustom, THEME_IDS } from '../themes.js';

export const STORAGE_KEY = 'mydiagram.settings.v1';
export const RECENT_KEY = 'mydiagram.recent.v1';
export const RECENT_DIRS_KEY = 'mydiagram.recentDirs.v1';
export const SESSION_KEY = 'mydiagram.session.v1';
/** The user's own shapes (My Shapes): saved selections, shared by all windows. */
export const MY_SHAPES_KEY = 'mydiagram.myShapes.v1';
export const PRINT_KEY = 'mydiagram.print.v1';

export const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800];
export const FONT_STYLES = ['normal', 'italic'];
export const FONT_SIZE = { min: 9, max: 28 };
export const ZOOM = { min: 50, max: 200, step: 10 };
/** Drawing zoom in percent (toolbar, status bar, Ctrl+wheel). */
export const CANVAS_ZOOM = { min: 10, max: 800, steps: [10, 15, 20, 25, 33, 50, 67, 75, 100, 125, 150, 200, 300, 400, 600, 800] };
/** Narrowest side panels that still show all of their content. */
export const PANEL_MIN = { left: 240, right: 300 };
export const BACKGROUND_KINDS = ['animated', 'image', 'none'];
/** Choices for the start page's automatic background change (seconds; 0 = off). */
export const ANIMATION_INTERVALS = [0, 15, 30, 60, 120, 300];
export const ANIMATIONS = [
  'aurora', 'waves', 'particles', 'constellation', 'bubbles', 'gridflow', 'flowchart', 'starfield', 'rain', 'snow',
  'fireflies', 'ripples', 'coderain', 'hexagons', 'orbits', 'lava', 'spiral', 'confetti', 'nodes', 'ribbons',
];
export const BACKGROUND_FITS = ['cover', 'contain', 'tile', 'center', 'stretch'];
export const DATE_FORMATS = ['iso', 'ko', 'us', 'eu'];
export const VIEWS = ['drawing', 'pages', 'shapeSheet', 'shapeData', 'reports'];
/** Grid spacing on the page: fine / normal / coarse (Visio "variable grid"). */
export const GRID_SIZES = { fine: 10, normal: 20, coarse: 40 };
export const STENCIL_SIZES = ['small', 'medium', 'large'];
export const DESIGN_IDS = ['office', 'linear', 'facet', 'integral', 'ion', 'retrospect', 'slice', 'whisp', 'organic', 'bubble', 'sequence', 'radiance', 'monochrome', 'blueprint', 'midnight', 'chalkboard'];
export const PAPERS = ['A3', 'A4', 'A5', 'B4', 'B5', 'Letter', 'Legal', 'Tabloid', 'Ledger', 'Screen', 'Wide'];
export const UNIT_IDS = ['mm', 'cm', 'in', 'pt', 'px'];
export const ROUTE_IDS = ['orthogonal', 'straight', 'curved'];
/** Where "Save to database" stores plans (desktop app; Settings › Database). */
export const DB_KINDS = ['none', 'sqlite', 'mariadb', 'mysql', 'postgres'];
export const DB_DEFAULT_PORTS = { mariadb: 3306, mysql: 3306, postgres: 5432 };
export const usesDbServer = (kind) => kind === 'mariadb' || kind === 'mysql' || kind === 'postgres';

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
    showLeftPanel: true,
    showRightPanel: true,
    showStatusBar: true,
    leftWidth: 268,
    rightWidth: 300,
    lastDirectory: null,
    restoreSession: false,
    confirmDelete: true,
    dateFormat: language === 'ko' ? 'iso' : 'us',
    showTime: false,
    statusClock: true,
    defaultView: 'drawing',
    showRulers: true,
    showGrid: true,
    showGuides: true,
    showPageBreaks: true,
    showConnectionPoints: true,
    showMinimap: false,
    snapToGrid: true,
    snapToShapes: true,
    smartGuides: true,
    autoConnect: true,
    gridSize: 'normal',
    stencilSize: 'medium',
    defaultDesign: 'office',
    defaultPaper: language === 'ko' ? 'A4' : 'Letter',
    defaultOrientation: 'landscape',
    defaultUnits: language === 'ko' ? 'mm' : 'in',
    defaultRoute: 'orthogonal',
    wheelZoom: false,
    openStencils: ['basic', 'flowchart', 'arrows'],
    rowHeight: 26,
    tutorialOffered: false,
    tutorialDone: false,
    // Database (Settings › Database). The password is stored only with dbSavePassword;
    // otherwise it is kept for this run of the app only.
    dbKind: 'none',
    dbHost: 'localhost',
    dbPort: null,
    dbName: 'mydiagram',
    dbUser: '',
    dbFile: '',
    dbSavePassword: false,
    dbPassword: '',
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
  s.dateFormat = DATE_FORMATS.includes(s.dateFormat) ? s.dateFormat : base.dateFormat;
  s.defaultView = VIEWS.includes(s.defaultView) ? s.defaultView : 'drawing';
  s.rowHeight = clamp(s.rowHeight, 20, 44, 26);
  s.startRecentCount = Math.round(clamp(s.startRecentCount, 1, 10, 8));
  s.gridSize = s.gridSize in GRID_SIZES ? s.gridSize : 'normal';
  s.stencilSize = STENCIL_SIZES.includes(s.stencilSize) ? s.stencilSize : 'medium';
  s.defaultDesign = DESIGN_IDS.includes(s.defaultDesign) ? s.defaultDesign : 'office';
  s.defaultPaper = PAPERS.includes(s.defaultPaper) ? s.defaultPaper : base.defaultPaper;
  s.defaultOrientation = s.defaultOrientation === 'portrait' ? 'portrait' : 'landscape';
  s.defaultUnits = UNIT_IDS.includes(s.defaultUnits) ? s.defaultUnits : base.defaultUnits;
  s.defaultRoute = ROUTE_IDS.includes(s.defaultRoute) ? s.defaultRoute : 'orthogonal';
  s.openStencils = Array.isArray(s.openStencils) ? s.openStencils.filter((id) => typeof id === 'string').slice(0, 30) : base.openStencils;
  for (const key of ['showStartPage', 'showLeftPanel', 'showRightPanel', 'showStatusBar', 'restoreSession', 'confirmDelete', 'showTime', 'statusClock', 'showRulers', 'showGrid',
    'showGuides', 'showPageBreaks', 'showConnectionPoints', 'showMinimap', 'snapToGrid', 'snapToShapes', 'smartGuides', 'autoConnect', 'wheelZoom', 'tutorialOffered', 'tutorialDone', 'animationOnStartOnly',
    'startShowRecent', 'startShowFolders', 'startShowSamples', 'startShowBackground', 'startShowTutorialBanner']) {
    s[key] = typeof s[key] === 'boolean' ? s[key] : base[key];
  }
  s.dbKind = DB_KINDS.includes(s.dbKind) ? s.dbKind : 'none';
  s.dbHost = typeof s.dbHost === 'string' && s.dbHost.trim() ? s.dbHost.trim() : base.dbHost;
  const port = Number(s.dbPort);
  s.dbPort = s.dbPort != null && s.dbPort !== '' && Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
  s.dbName = typeof s.dbName === 'string' ? s.dbName.trim() : base.dbName;
  s.dbUser = typeof s.dbUser === 'string' ? s.dbUser : '';
  s.dbFile = typeof s.dbFile === 'string' ? s.dbFile.trim() : '';
  s.dbSavePassword = s.dbSavePassword === true;
  s.dbPassword = s.dbSavePassword && typeof s.dbPassword === 'string' ? s.dbPassword : '';
  return s;
}

/** The port used: the one set, or the usual one of the server kind. */
export const dbPortOf = (settings) => settings.dbPort ?? DB_DEFAULT_PORTS[settings.dbKind] ?? null;

/** Problems that stop a connection (i18n keys), [] when the settings are complete. */
export function dbProblems(settings) {
  const problems = [];
  if (!DB_KINDS.includes(settings.dbKind) || settings.dbKind === 'none') problems.push('db.needKind');
  if (settings.dbKind === 'sqlite' && !String(settings.dbFile ?? '').trim()) problems.push('db.needFile');
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

/** "MariaDB · me@localhost:3306/mydiagram" / "SQLite · C:\…\plans.db" (no password). */
export function dbDescribe(settings) {
  const names = { sqlite: 'SQLite', mariadb: 'MariaDB', mysql: 'MySQL', postgres: 'PostgreSQL' };
  if (settings.dbKind === 'sqlite') return `SQLite · ${settings.dbFile}`;
  if (!usesDbServer(settings.dbKind)) return '';
  return `${names[settings.dbKind]} · ${settings.dbUser ? `${settings.dbUser}@` : ''}${settings.dbHost}:${dbPortOf(settings)}/${settings.dbName}`;
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

/** The next drawing zoom step in or out from `value`. */
export function zoomStep(value, direction) {
  const steps = CANVAS_ZOOM.steps;
  if (direction > 0) return steps.find((step) => step > value) ?? steps[steps.length - 1];
  return [...steps].reverse().find((step) => step < value) ?? steps[0];
}

// ───────────────────────── a new installation

/** Remembers which installation's reset was done (the installer leaves a new token each time). */
export const INSTALL_RESET_KEY = 'mydiagram.installReset';
/** Stored lists that are the user's own data, kept by a new installation. */
const KEEP_KEYS = [RECENT_KEY, RECENT_DIRS_KEY, SESSION_KEY, MY_SHAPES_KEY];
/** Settings that are the user's data rather than preferences: database connection, background image, tutorial history. */
const KEEP_SETTINGS = ['dbKind', 'dbHost', 'dbPort', 'dbName', 'dbUser', 'dbFile', 'dbSavePassword', 'dbPassword', 'backgroundImage', 'backgroundName', 'lastDirectory', 'tutorialOffered', 'tutorialDone'];

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
    for (const key of keys) if (key?.startsWith('mydiagram.') && !KEEP_KEYS.includes(key)) storage.removeItem(key);
    const kept = Object.fromEntries(KEEP_SETTINGS.filter((key) => key in saved).map((key) => [key, saved[key]]));
    if (Object.keys(kept).length) storage.setItem(STORAGE_KEY, JSON.stringify(kept));
    storage.setItem(INSTALL_RESET_KEY, String(token));
    return true;
  } catch {
    return false;
  }
}
