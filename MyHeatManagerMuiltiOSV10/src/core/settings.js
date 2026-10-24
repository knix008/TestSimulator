// User preferences, kept in localStorage (the WebView2 profile on the desktop).
const KEY = 'myheatmanager.settings';
const RESET_KEY = 'myheatmanager.installReset';

export const DEFAULT_SETTINGS = {
  language: 'ko',
  theme: 'dark',
  customTheme: null,
  fontFamily: 'Segoe UI',
  fontSize: 13,
  colormap: 'turbo',
  colorSteps: 0, // 0 = smooth, else banded colours
  isoCount: 12,
  temperatureUnit: 'C', // C | K | F
  snap: 0.5, // mm, 0 = off
  showGrid: true, // drawing grid (mm)
  showMesh: false, // computational cells
  showAxes: true, // 3D view: x, y, z axes with ticks and labels
  lengthUnit: 'mm', // mm | cm | m | in — rulers, axis ticks, cursor
  showRulers: true,
  showLabels: true,
  showToolPanel: true,
  showPropertyPanel: true,
  showChartPanel: true,
  leftCollapsed: false, // folded to a strip with the icon and the title
  rightCollapsed: false,
  bottomCollapsed: false,
  panelSize: 300,
  chartHeight: 190,
  folds: {},
  recentFiles: [],
  autoRun: false,
  confirmClose: true,
  workbench: 'geometry',
  // Start page
  showStartPage: true,
  animation: 'plume',
  animationSpeed: 100, // %
  animationRandom: false, // a different background at every start
  startBgTransparency: 0, // % — 0 shows the moving background fully
  tutorialDone: false,
  startLayout: null, // { order: [...], span: { id: 1..3 }, height: { id: px } } — the start page cards
};

/** The moving backgrounds of the start page (src/ui/background.js). */
export const ANIMATIONS = ['plume', 'isotherms', 'convection', 'embers', 'heatmap', 'streamlines', 'waves', 'aurora', 'particles', 'circuit',
  'infrared', 'diffusion', 'flames', 'steam', 'sunrays', 'vortex', 'boiling', 'melting', 'heatpipe', 'thermometer'];

/** First start after a new installation: preferences go back to defaults; recent files stay. */
export function resetForNewInstall(storage, token) {
  if (!token || !storage) return;
  try {
    if (storage.getItem(RESET_KEY) === token) return;
    const old = JSON.parse(storage.getItem(KEY) || '{}');
    storage.setItem(KEY, JSON.stringify({ recentFiles: Array.isArray(old.recentFiles) ? old.recentFiles : [] }));
    storage.setItem(RESET_KEY, token);
  } catch { /* storage unavailable */ }
}

export function loadSettings(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(KEY) || '{}');
    return sanitizeSettings(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function sanitizeSettings(raw) {
  const out = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (raw?.[key] === undefined) continue;
    const type = typeof DEFAULT_SETTINGS[key];
    if (DEFAULT_SETTINGS[key] === null || type === typeof raw[key] || (key === 'recentFiles' && Array.isArray(raw[key]))) out[key] = raw[key];
  }
  if (!['ko', 'en'].includes(out.language)) out.language = 'ko';
  if (!ANIMATIONS.includes(out.animation)) out.animation = DEFAULT_SETTINGS.animation;
  out.animationSpeed = Math.max(0, Math.min(300, Math.round(out.animationSpeed)));
  out.startBgTransparency = Math.max(0, Math.min(95, Math.round(out.startBgTransparency)));
  out.fontSize = Math.max(10, Math.min(20, Math.round(out.fontSize)));
  out.panelSize = Math.max(220, Math.min(520, Math.round(out.panelSize)));
  out.chartHeight = Math.max(120, Math.min(420, Math.round(out.chartHeight)));
  out.recentFiles = out.recentFiles.filter((f) => f && typeof f.path === 'string').slice(0, 12);
  return out;
}

export function saveSettings(storage, settings) {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch { /* quota or private mode */ }
}

export function addRecent(settings, path) {
  const name = path.split(/[\\/]/).pop();
  return { ...settings, recentFiles: [{ path, name }, ...settings.recentFiles.filter((f) => f.path !== path)].slice(0, 12) };
}

/** Temperature conversions for display (the model is always °C). */
export function toDisplayT(celsius, unit) {
  if (unit === 'K') return celsius + 273.15;
  if (unit === 'F') return celsius * 1.8 + 32;
  return celsius;
}

export function fromDisplayT(value, unit) {
  if (unit === 'K') return value - 273.15;
  if (unit === 'F') return (value - 32) / 1.8;
  return value;
}

export const LENGTH_UNITS = { mm: 1, cm: 10, m: 1000, in: 25.4 };

/** A length in mm shown in the chosen unit. */
export function toDisplayLength(mm, unit) {
  return mm / (LENGTH_UNITS[unit] ?? 1);
}

export function tUnitLabel(unit) {
  return unit === 'K' ? 'K' : unit === 'F' ? '°F' : '°C';
}
