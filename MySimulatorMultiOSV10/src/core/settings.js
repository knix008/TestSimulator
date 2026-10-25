// User preferences, kept in localStorage (the WebView2 profile on the desktop).
const KEY = 'mysimulator.settings';
const RESET_KEY = 'mysimulator.installReset';

export const DEFAULT_SETTINGS = {
  language: 'ko',
  theme: 'dark',
  customTheme: null,
  fontFamily: 'Segoe UI',
  fontSize: 13,
  colormap: 'turbo',
  showGrid: true, // graph canvas grid
  showRulers: true, // rulers along the top and left of the graph canvas
  chartGrid: true, // grid lines in the charts
  grid3d: true, // the 5 x 5 grids of the 3D view
  axes3d: true, // the 3D view's axes and tick labels
  snap: false, // nodes on a 20-unit grid
  showPreviews: true, // small charts inside the nodes
  showHelp: true, // the help text of a node open in the property panel
  showToolPanel: true,
  showPropertyPanel: true,
  showChartPanel: true,
  leftCollapsed: false, // folded to a strip with the icon and the title
  rightCollapsed: false,
  bottomCollapsed: false,
  panelSize: 320,
  chartHeight: 230,
  folds: {},
  recentFiles: [],
  autoRun: false,
  confirmClose: true,
  workbench: 'pipeline',
  // Start page
  showStartPage: true,
  animation: 'oscilloscope',
  animationSpeed: 100, // %
  animationRandom: false, // a different background at every start
  startBgTransparency: 0, // % — 0 shows the moving background fully
  tutorialDone: false,
  startLayout: null, // { order: [...], span: { id: 1..3 }, height: { id: px } } — the start page cards
};

/** The moving backgrounds of the start page (src/ui/background.js). */
export const ANIMATIONS = ['oscilloscope', 'spectrum', 'lorenz', 'network', 'montecarlo', 'pipeline', 'histogram', 'phase', 'descent', 'spring',
  'isotherms', 'convection', 'heatmap', 'streamlines', 'waves', 'aurora', 'particles', 'circuit', 'diffusion', 'vortex'];

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
  out.chartHeight = Math.max(120, Math.min(560, Math.round(out.chartHeight)));
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
