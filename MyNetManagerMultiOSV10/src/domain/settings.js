// Application settings: defaults, validation, and persistence in localStorage
// (shared by the main window and the popup windows, which watch it). Loaded
// again on the next start.
import { normalizeCustom, THEME_IDS } from '../themes.js';

export const STORAGE_KEY = 'mynetmanager.settings.v1';
export const RECENT_KEY = 'mynetmanager.recent.v1';
export const RECENT_DIRS_KEY = 'mynetmanager.recentDirs.v1';
export const SESSION_KEY = 'mynetmanager.session.v1';
export const PRINT_KEY = 'mynetmanager.print.v1';
/** Saved display filters (bookmarks) and capture filters. */
export const FILTERS_KEY = 'mynetmanager.filters.v1';
/** The user's colouring rules (null: Wireshark's defaults). */
export const COLORING_KEY = 'mynetmanager.coloring.v1';

export const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800];
export const FONT_STYLES = ['normal', 'italic'];
export const FONT_SIZE = { min: 9, max: 28 };
export const ZOOM = { min: 50, max: 200, step: 10 };
/** Packet list / details / bytes text zoom (View › Zoom), percent. */
export const TEXT_ZOOM = { min: 60, max: 250, steps: [60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 250] };
/** Narrowest panes that still show their content. */
export const PANEL_MIN = { list: 120, details: 80, bytes: 60, map: 260 };
export const BACKGROUND_KINDS = ['animated', 'image', 'none'];
/** Choices for the start page's automatic background change (seconds; 0 = off). */
export const ANIMATION_INTERVALS = [0, 15, 30, 60, 120, 300];
export const ANIMATIONS = [
  'packetflow', 'topology', 'hexdump', 'waveform', 'fiber', 'wifi', 'radar', 'throughput', 'globe', 'datacenter',
  'circuit', 'bitstream', 'sequence', 'layers', 'pings', 'satellites', 'heatmap', 'packetlist', 'spectrum', 'mesh',
];
export const BACKGROUND_FITS = ['cover', 'contain', 'tile', 'center', 'stretch'];
export const DATE_FORMATS = ['iso', 'ko', 'us', 'eu'];
export const PAPERS = ['A3', 'A4', 'A5', 'B4', 'B5', 'Letter', 'Legal', 'Tabloid'];
/** View › Time Display Format (Wireshark's choices). */
export const TIME_FORMATS = ['abs_ymd', 'abs_ydoy', 'abs', 'epoch', 'relative', 'delta', 'delta_displayed', 'utc_ymd', 'utc_ydoy', 'utc'];
export const TIME_PRECISIONS = ['auto', 0, 1, 2, 3, 4, 5, 6, 9];
/** Pane layouts: list / details / bytes stacked, or details and bytes beside each other. */
export const PANE_LAYOUTS = ['stack', 'details-right', 'bytes-right'];
export const BYTES_VIEWS = ['hex', 'bits'];
export const BYTES_ENCODINGS = ['ascii', 'ebcdic'];
/** Default packet list columns (Wireshark's). */
export const DEFAULT_COLUMNS = [
  { id: 'no', kind: 'no', width: 70, visible: true },
  { id: 'time', kind: 'time', width: 110, visible: true },
  { id: 'src', kind: 'src', width: 170, visible: true },
  { id: 'dst', kind: 'dst', width: 170, visible: true },
  { id: 'protocol', kind: 'protocol', width: 90, visible: true },
  { id: 'length', kind: 'length', width: 70, visible: true },
  { id: 'info', kind: 'info', width: 640, visible: true },
];
export const COLUMN_KINDS = ['no', 'time', 'abs_time', 'delta', 'src', 'dst', 'hw_src', 'hw_dst', 'net_src', 'net_dst', 'srcport', 'dstport', 'protocol', 'length', 'caplen', 'info', 'iface', 'comment', 'expert', 'stream', 'field'];

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
    animation: 'packetflow',
    animationSpeed: 100,
    animationRandom: true,
    animationInterval: 30,
    animationOnStartOnly: true,
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
    showStatusBar: true,
    lastDirectory: null,
    restoreSession: false,
    confirmDelete: true,
    dateFormat: language === 'ko' ? 'iso' : 'us',
    statusClock: true,
    defaultPaper: language === 'ko' ? 'A4' : 'Letter',
    defaultOrientation: 'portrait',
    tutorialOffered: false,
    /** The welcome popup at every start (its own check box and Settings › Start page). */
    showWelcome: true,
    tutorialDone: false,
    // ── packet views (View menu, Settings › Layout)
    paneLayout: 'stack',
    showFilterBar: true,
    showPacketList: true,
    showDetails: true,
    showBytes: true,
    showNetMap: false,
    showLeftPanel: true,
    showBottomPanel: true,
    leftWidth: 250,
    bottomHeight: 170,
    bottomTab: 'problems',
    listShare: 42,
    detailsShare: 58,
    mapWidth: 560,
    textZoom: 100,
    rowHeight: 22,
    timeFormat: 'relative',
    timePrecision: 'auto',
    colorize: true,
    autoScroll: true,
    resolveMac: true,
    resolveTransport: true,
    resolveNetwork: false,
    bytesView: 'hex',
    bytesEncoding: 'ascii',
    columns: DEFAULT_COLUMNS.map((c) => ({ ...c })),
    // ── capture (Capture › Options)
    captureInterface: '',
    captureSnaplen: 262144,
    capturePromisc: true,
    captureMonitor: false,
    captureBufferMb: 2,
    captureFilter: '',
    captureStopPackets: 0,
    captureStopSeconds: 0,
    captureStopMegabytes: 0,
    captureUpdateList: true,
    demoRate: 40,
    // ── analysis
    tcpRelativeSeq: true,
    tcpAnalyze: true,
    expertEnabled: true,
    decodeAs: [],
    disabledProtocols: [],
    recentDisplayFilters: [],
    recentCaptureFilters: [],
    // ── network map
    netmapLayout: 'subnet',
    netmapLabels: 'name',
    netmapShowExternal: true,
    netmapShowMulticast: false,
  };
}

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};

/** Packet list columns made valid; unknown kinds dropped, the defaults when none are left. */
export function normalizeColumns(list) {
  if (!Array.isArray(list)) return DEFAULT_COLUMNS.map((c) => ({ ...c }));
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object' || !COLUMN_KINDS.includes(raw.kind)) continue;
    if (raw.kind === 'field' && (typeof raw.field !== 'string' || !raw.field.trim())) continue;
    let id = typeof raw.id === 'string' && raw.id ? raw.id : `${raw.kind}-${out.length}`;
    while (seen.has(id)) id = `${id}_`;
    seen.add(id);
    out.push({
      id, kind: raw.kind, field: raw.kind === 'field' ? raw.field.trim() : undefined,
      title: typeof raw.title === 'string' ? raw.title : '', width: clamp(raw.width, 30, 3000, 100), visible: raw.visible !== false,
    });
  }
  return out.length ? out : DEFAULT_COLUMNS.map((c) => ({ ...c }));
}

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
  s.lastDirectory = typeof s.lastDirectory === 'string' && s.lastDirectory ? s.lastDirectory : null;
  s.dateFormat = DATE_FORMATS.includes(s.dateFormat) ? s.dateFormat : base.dateFormat;
  s.startRecentCount = Math.round(clamp(s.startRecentCount, 1, 10, 8));
  s.startCardOpacity = Math.round(clamp(s.startCardOpacity, 20, 100, 80));
  s.startLayout = s.startLayout && typeof s.startLayout === 'object' && !Array.isArray(s.startLayout) ? s.startLayout : null;
  s.defaultPaper = PAPERS.includes(s.defaultPaper) ? s.defaultPaper : base.defaultPaper;
  s.defaultOrientation = s.defaultOrientation === 'landscape' ? 'landscape' : 'portrait';
  s.paneLayout = PANE_LAYOUTS.includes(s.paneLayout) ? s.paneLayout : base.paneLayout;
  s.listShare = clamp(s.listShare, 10, 85, base.listShare);
  s.detailsShare = clamp(s.detailsShare, 8, 80, base.detailsShare);
  s.mapWidth = clamp(s.mapWidth, PANEL_MIN.map, 3000, base.mapWidth);
  s.leftWidth = clamp(s.leftWidth, 180, 1200, base.leftWidth);
  s.bottomHeight = clamp(s.bottomHeight, 90, 2000, base.bottomHeight);
  s.bottomTab = ['problems', 'log', 'analysis'].includes(s.bottomTab) ? s.bottomTab : 'problems';
  s.textZoom = clamp(s.textZoom, TEXT_ZOOM.min, TEXT_ZOOM.max, 100);
  s.rowHeight = clamp(s.rowHeight, 16, 40, base.rowHeight);
  s.timeFormat = TIME_FORMATS.includes(s.timeFormat) ? s.timeFormat : base.timeFormat;
  s.timePrecision = s.timePrecision !== 'auto' && TIME_PRECISIONS.includes(Number(s.timePrecision)) ? Number(s.timePrecision) : 'auto';
  s.bytesView = BYTES_VIEWS.includes(s.bytesView) ? s.bytesView : 'hex';
  s.bytesEncoding = BYTES_ENCODINGS.includes(s.bytesEncoding) ? s.bytesEncoding : 'ascii';
  s.columns = normalizeColumns(s.columns);
  s.captureInterface = typeof s.captureInterface === 'string' ? s.captureInterface : '';
  s.captureFilter = typeof s.captureFilter === 'string' ? s.captureFilter : '';
  s.captureSnaplen = clamp(s.captureSnaplen, 64, 262144, base.captureSnaplen);
  s.captureBufferMb = clamp(s.captureBufferMb, 1, 1024, base.captureBufferMb);
  s.captureStopPackets = clamp(s.captureStopPackets, 0, 1e9, 0);
  s.captureStopSeconds = clamp(s.captureStopSeconds, 0, 1e7, 0);
  s.captureStopMegabytes = clamp(s.captureStopMegabytes, 0, 1e6, 0);
  s.demoRate = clamp(s.demoRate, 1, 2000, base.demoRate);
  for (const key of ['decodeAs', 'disabledProtocols', 'recentDisplayFilters', 'recentCaptureFilters']) s[key] = Array.isArray(s[key]) ? s[key] : base[key];
  s.recentDisplayFilters = s.recentDisplayFilters.filter((f) => typeof f === 'string' && f.trim()).slice(0, 30);
  s.recentCaptureFilters = s.recentCaptureFilters.filter((f) => typeof f === 'string' && f.trim()).slice(0, 30);
  s.disabledProtocols = s.disabledProtocols.filter((f) => typeof f === 'string');
  s.decodeAs = s.decodeAs.filter((d) => d && typeof d.table === 'string' && d.proto && d.value != null);
  s.netmapLayout = ['force', 'subnet', 'radial'].includes(s.netmapLayout) ? s.netmapLayout : base.netmapLayout;
  s.netmapLabels = ['name', 'ip', 'mac'].includes(s.netmapLabels) ? s.netmapLabels : base.netmapLabels;
  for (const key of ['showStartPage', 'showStatusBar', 'restoreSession', 'confirmDelete', 'statusClock', 'tutorialOffered', 'showWelcome', 'tutorialDone', 'animationOnStartOnly',
    'startShowRecent', 'startShowFolders', 'startShowSamples', 'startShowBackground', 'startShowTutorialBanner',
    'showFilterBar', 'showPacketList', 'showDetails', 'showBytes', 'showNetMap', 'showLeftPanel', 'showBottomPanel', 'colorize', 'autoScroll', 'resolveMac', 'resolveTransport', 'resolveNetwork',
    'capturePromisc', 'captureMonitor', 'captureUpdateList', 'tcpRelativeSeq', 'tcpAnalyze', 'expertEnabled', 'netmapShowExternal', 'netmapShowMulticast']) {
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

/** The next text zoom step in or out from `value`. */
export function zoomStep(value, direction) {
  const steps = TEXT_ZOOM.steps;
  if (direction > 0) return steps.find((step) => step > value) ?? steps[steps.length - 1];
  return [...steps].reverse().find((step) => step < value) ?? steps[0];
}

/** Adds a filter to the front of a recent list (no duplicates, at most `max`). */
export function pushRecentFilter(list, text, max = 30) {
  const value = String(text ?? '').trim();
  if (!value) return list;
  return [value, ...list.filter((item) => item !== value)].slice(0, max);
}

// ───────────────────────── a new installation

/** Remembers which installation's reset was done (the installer leaves a new token each time). */
export const INSTALL_RESET_KEY = 'mynetmanager.installReset';
/** Stored lists that are the user's own data, kept by a new installation. */
const KEEP_KEYS = [RECENT_KEY, RECENT_DIRS_KEY, SESSION_KEY, FILTERS_KEY, COLORING_KEY];
/** Settings that are the user's data rather than preferences. */
const KEEP_SETTINGS = ['backgroundImage', 'backgroundName', 'lastDirectory', 'tutorialOffered', 'tutorialDone', 'captureInterface', 'decodeAs', 'recentDisplayFilters', 'recentCaptureFilters'];

/**
 * After the installer ran (it hands over `token`): every preference goes back to its default while
 * recent files and folders, saved filters and colouring rules stay. Done once per token.
 */
export function resetForNewInstall(storage, token) {
  if (!storage || !token) return false;
  try {
    if (storage.getItem(INSTALL_RESET_KEY) === String(token)) return false;
    let saved = {};
    try { saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}') ?? {}; } catch { /* unreadable: nothing to keep */ }
    const keys = [];
    for (let i = 0; i < storage.length; i++) keys.push(storage.key(i));
    for (const key of keys) if (key?.startsWith('mynetmanager.') && !KEEP_KEYS.includes(key)) storage.removeItem(key);
    const kept = Object.fromEntries(KEEP_SETTINGS.filter((key) => key in saved).map((key) => [key, saved[key]]));
    if (Object.keys(kept).length) storage.setItem(STORAGE_KEY, JSON.stringify(kept));
    storage.setItem(INSTALL_RESET_KEY, String(token));
    return true;
  } catch {
    return false;
  }
}
