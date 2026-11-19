import { CHART_THEME_IDS } from './chart/palettes.js';
// Application settings: defaults, validation, and persistence in localStorage
// (shared by the main window and the popup windows, which watch it). Loaded
// again on the next start.
import { normalizeCustom, THEME_IDS } from '../themes.js';

export const STORAGE_KEY = 'mychartmaster.settings.v1';
export const RECENT_KEY = 'mychartmaster.recent.v1';
export const RECENT_DIRS_KEY = 'mychartmaster.recentDirs.v1';
export const SESSION_KEY = 'mychartmaster.session.v1';
export const PRINT_KEY = 'mychartmaster.print.v1';
/** The export window's last choices (format, size, scale, background). */
export const EXPORT_KEY = 'mychartmaster.export.v1';

export const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800];
export const FONT_STYLES = ['normal', 'italic'];
export const FONT_SIZE = { min: 9, max: 28 };
export const ZOOM = { min: 50, max: 200, step: 10 };
/** Chart view zoom (View › Zoom), percent; 0 = fit to the window. */
export const TEXT_ZOOM = { min: 25, max: 400, steps: [25, 33, 50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400] };
/** Narrowest panes that still show their content. */
export const PANEL_MIN = { gallery: 180, inspector: 260, grid: 90 };
export const BACKGROUND_KINDS = ['animated', 'image', 'none'];
/** Choices for the start page's automatic background change (seconds; 0 = off). */
export const ANIMATION_INTERVALS = [0, 15, 30, 60, 120, 300];
/** Twenty moving backgrounds, all of them charts (ui/background.js draws them). */
export const ANIMATIONS = [
  'bars', 'lines', 'pies', 'scatter', 'areas', 'candles', 'radar', 'heatmap', 'bubbles', 'gauges',
  'treemap', 'sankey', 'histogram', 'boxplot', 'spreadsheet', 'sparklines', 'funnel', 'waterfall', 'polar', 'dashboard',
];
export const BACKGROUND_FITS = ['cover', 'contain', 'tile', 'center', 'stretch'];
export const DATE_FORMATS = ['iso', 'ko', 'us', 'eu'];
export const PAPERS = ['A3', 'A4', 'A5', 'B4', 'B5', 'Letter', 'Legal', 'Tabloid'];
/** Where the data grid sits: under the chart, or beside it. */
export const PANE_LAYOUTS = ['grid-bottom', 'grid-right', 'chart-only'];
/** Default size of a new chart's picture (pixels) — the export window starts from it. */
export const CHART_SIZES = [[800, 500], [1024, 640], [1280, 720], [1600, 900], [1920, 1080], [600, 600], [1080, 1080], [1200, 630]];

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
    animation: 'bars',
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
    defaultOrientation: 'landscape',
    tutorialOffered: false,
    /** The welcome popup at every start (its own check box and Settings › Start page). */
    showWelcome: true,
    tutorialDone: false,
    // ── chart workspace (View menu, Settings › Layout)
    paneLayout: 'grid-bottom',
    showLeftPanel: true,
    showRightPanel: true,
    showBottomPanel: true,
    leftWidth: 220,
    rightWidth: 330,
    bottomHeight: 230,
    gridWidth: 420,
    textZoom: 0,
    rowHeight: 26,
    showChartGrid: false,
    animateCharts: true,
    showTooltips: true,
    // ── a new chart's defaults (Settings › Charts)
    chartPalette: 'vivid',
    chartFont: '',
    chartWidth: 1024,
    chartHeight: 640,
    chartTheme: 'classic',
    chartBackground: 'theme',
    chartLegend: 'bottom',
    chartDataLabels: false,
    chartRounded: 4,
    // ── import (Settings › Data)
    importHeader: 'auto',
    importDelimiter: 'auto',
    importEncoding: 'auto',
    importDecimal: 'auto',
    importMaxRows: 100000,
    // ── export
    exportFormat: 'png',
    exportScale: 2,
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
  s.lastDirectory = typeof s.lastDirectory === 'string' && s.lastDirectory ? s.lastDirectory : null;
  s.dateFormat = DATE_FORMATS.includes(s.dateFormat) ? s.dateFormat : base.dateFormat;
  s.startRecentCount = Math.round(clamp(s.startRecentCount, 1, 10, 8));
  s.startCardOpacity = Math.round(clamp(s.startCardOpacity, 20, 100, 80));
  s.startLayout = s.startLayout && typeof s.startLayout === 'object' && !Array.isArray(s.startLayout) ? s.startLayout : null;
  s.defaultPaper = PAPERS.includes(s.defaultPaper) ? s.defaultPaper : base.defaultPaper;
  s.defaultOrientation = s.defaultOrientation === 'portrait' ? 'portrait' : 'landscape';
  s.paneLayout = PANE_LAYOUTS.includes(s.paneLayout) ? s.paneLayout : base.paneLayout;
  s.leftWidth = clamp(s.leftWidth, PANEL_MIN.gallery, 800, base.leftWidth);
  s.rightWidth = clamp(s.rightWidth, PANEL_MIN.inspector, 900, base.rightWidth);
  s.bottomHeight = clamp(s.bottomHeight, PANEL_MIN.grid, 2000, base.bottomHeight);
  s.gridWidth = clamp(s.gridWidth, 240, 2000, base.gridWidth);
  s.textZoom = s.textZoom === 0 ? 0 : clamp(s.textZoom, TEXT_ZOOM.min, TEXT_ZOOM.max, 0);
  s.rowHeight = clamp(s.rowHeight, 20, 44, base.rowHeight);
  s.chartPalette = typeof s.chartPalette === 'string' && s.chartPalette ? s.chartPalette : base.chartPalette;
  s.chartFont = typeof s.chartFont === 'string' ? s.chartFont : '';
  s.chartWidth = clamp(s.chartWidth, 200, 8000, base.chartWidth);
  s.chartHeight = clamp(s.chartHeight, 150, 8000, base.chartHeight);
  s.chartBackground = ['theme', 'chart', 'white', 'transparent'].includes(s.chartBackground) ? s.chartBackground : base.chartBackground;
  // Settings from before chart themes kept 'white' as the default: new charts now follow the program's theme.
  if (raw && typeof raw === 'object' && !('chartTheme' in raw) && raw.chartBackground === 'white') s.chartBackground = 'theme';
  s.chartTheme = CHART_THEME_IDS.includes(s.chartTheme) ? s.chartTheme : base.chartTheme;
  s.chartLegend = ['top', 'bottom', 'left', 'right', 'none'].includes(s.chartLegend) ? s.chartLegend : base.chartLegend;
  s.chartRounded = clamp(s.chartRounded, 0, 20, base.chartRounded);
  s.importHeader = ['auto', 'yes', 'no'].includes(s.importHeader) ? s.importHeader : 'auto';
  s.importDelimiter = ['auto', ',', ';', '\t', '|', ' '].includes(s.importDelimiter) ? s.importDelimiter : 'auto';
  s.importEncoding = ['auto', 'utf-8', 'euc-kr', 'utf-16le', 'windows-1252'].includes(s.importEncoding) ? s.importEncoding : 'auto';
  s.importDecimal = ['auto', '.', ','].includes(s.importDecimal) ? s.importDecimal : 'auto';
  s.importMaxRows = clamp(s.importMaxRows, 100, 1000000, base.importMaxRows);
  s.exportFormat = ['png', 'jpg', 'webp', 'gif', 'avif', 'svg', 'pdf', 'html', 'docx', 'markdown'].includes(s.exportFormat) ? s.exportFormat : 'png';
  s.exportScale = clamp(s.exportScale, 1, 4, 2);
  for (const key of ['showStartPage', 'showStatusBar', 'restoreSession', 'confirmDelete', 'statusClock', 'tutorialOffered', 'showWelcome', 'tutorialDone', 'animationOnStartOnly',
    'startShowRecent', 'startShowFolders', 'startShowSamples', 'startShowBackground', 'startShowTutorialBanner',
    'showLeftPanel', 'showRightPanel', 'showBottomPanel', 'showChartGrid', 'animateCharts', 'showTooltips', 'chartDataLabels']) {
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

/** The next zoom step in or out from `value` (0 = fit: starts from 100). */
export function zoomStep(value, direction) {
  const steps = TEXT_ZOOM.steps;
  const from = value || 100;
  if (direction > 0) return steps.find((step) => step > from) ?? steps[steps.length - 1];
  return [...steps].reverse().find((step) => step < from) ?? steps[0];
}

// ───────────────────────── a new installation

/** Remembers which installation's reset was done (the installer leaves a new token each time). */
export const INSTALL_RESET_KEY = 'mychartmaster.installReset';
/** Stored lists that are the user's own data, kept by a new installation. */
const KEEP_KEYS = [RECENT_KEY, RECENT_DIRS_KEY, SESSION_KEY];
/** Settings that are the user's data rather than preferences. */
const KEEP_SETTINGS = ['backgroundImage', 'backgroundName', 'lastDirectory', 'tutorialOffered', 'tutorialDone'];

/**
 * After the installer ran (it hands over `token`): every preference goes back to its default while
 * recent files and folders stay. Done once per token.
 */
export function resetForNewInstall(storage, token) {
  if (!storage || !token) return false;
  try {
    if (storage.getItem(INSTALL_RESET_KEY) === String(token)) return false;
    let saved = {};
    try { saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}') ?? {}; } catch { /* unreadable: nothing to keep */ }
    const keys = [];
    for (let i = 0; i < storage.length; i++) keys.push(storage.key(i));
    for (const key of keys) if (key?.startsWith('mychartmaster.') && !KEEP_KEYS.includes(key)) storage.removeItem(key);
    const kept = Object.fromEntries(KEEP_SETTINGS.filter((key) => key in saved).map((key) => [key, saved[key]]));
    if (Object.keys(kept).length) storage.setItem(STORAGE_KEY, JSON.stringify(kept));
    storage.setItem(INSTALL_RESET_KEY, String(token));
    return true;
  } catch {
    return false;
  }
}
