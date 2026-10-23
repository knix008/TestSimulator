// Preferences (localStorage, shared by every window of the app): language,
// theme, fonts, panels, start page and its moving background, the PyTorch
// environment, editor and training defaults.

export const STORAGE_KEY = 'mytrainer.settings.v1';
export const RECENT_KEY = 'mytrainer.recent.v1';
export const SESSION_KEY = 'mytrainer.session.v1';
export const INSTALL_RESET_KEY = 'mytrainer.installReset';

export const FONT_WEIGHTS = [300, 400, 500, 600, 700];
export const FONT_STYLES = ['normal', 'italic'];
export const FONT_SIZE = { min: 10, max: 22 };
export const CODE_FONT_SIZE = { min: 10, max: 28 };
export const PANEL_LIMITS = { left: [200, 460], right: [280, 560], bottom: [90, 520] };
export const ANIMATION_INTERVALS = [0, 15, 30, 60, 120, 300];
/** The twenty AI-themed moving backgrounds of the start page (ui/background.js). */
export const ANIMATIONS = ['neural', 'gradient', 'attention', 'convolution', 'embedding', 'tensors', 'activation', 'backprop', 'decision', 'loss',
  'dropout', 'tokens', 'diffusion', 'clusters', 'tree', 'brain', 'weights', 'latent', 'recurrent', 'gan'];
export const VIEW_TABS = ['data', 'model', 'neurons', 'code', 'train', 'test'];
export const COLOR_MAPS = ['diverging', 'viridis', 'magma', 'gray'];

export function defaultSettings(language = 'ko') {
  return {
    language,
    theme: 'system',
    customTheme: null,
    fontFamily: '',
    fontSize: 13,
    fontWeight: 400,
    fontStyle: 'normal',
    codeFontSize: 14,
    codeWrap: false,
    codeHooks: true,
    showLeftPanel: true,
    showRightPanel: true,
    showBottomPanel: true,
    showStatusBar: true,
    leftWidth: 248,
    rightWidth: 340,
    bottomHeight: 170,
    showStartPage: true,
    animation: 'neural',
    animationSpeed: 100,
    animationRandom: false,
    animationInterval: 0,
    colorMap: 'diverging',
    autoSnapshot: true,
    maxNeurons: 24,
    animateFlow: true,
    showLinks: true,
    // Model canvas: cards top to bottom or left to right, and the 5×5 grid under them.
    graphDirection: 'vertical',
    showGrid: true,
    // Microphone (Test tab): input gain ×, and the loudness (RMS) below which nothing counts as speech.
    micGain: 1,
    micThreshold: 0.012,
    pythonPath: '',
    torchVariant: 'auto',
    // Where TensorFlow trains (auto: WebGPU → WebGL → WASM → CPU) and whether PyTorch may use a GPU.
    tfBackend: 'auto',
    torchDevice: 'auto',
    // The first start installs Python / PyTorch when there are none (once; the Python window can do it again).
    pythonAutoSetup: true,
    saveWeights: true,
    confirmExit: true,
    // A popup when training has finished.
    notifyTrainDone: true,
    startRecentCount: 8,
  };
}

const clamp = (value, [min, max], fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

export function normalizeSettings(raw = {}, language = 'ko') {
  const base = defaultSettings(language);
  const s = { ...base, ...(raw && typeof raw === 'object' ? raw : {}) };
  return {
    ...base,
    language: s.language === 'en' ? 'en' : 'ko',
    theme: typeof s.theme === 'string' ? s.theme : base.theme,
    customTheme: s.customTheme && typeof s.customTheme === 'object' ? s.customTheme : null,
    fontFamily: typeof s.fontFamily === 'string' ? s.fontFamily.slice(0, 100) : '',
    fontSize: clamp(s.fontSize, [FONT_SIZE.min, FONT_SIZE.max], base.fontSize),
    fontWeight: FONT_WEIGHTS.includes(Number(s.fontWeight)) ? Number(s.fontWeight) : base.fontWeight,
    fontStyle: FONT_STYLES.includes(s.fontStyle) ? s.fontStyle : base.fontStyle,
    codeFontSize: clamp(s.codeFontSize, [CODE_FONT_SIZE.min, CODE_FONT_SIZE.max], base.codeFontSize),
    codeWrap: s.codeWrap === true,
    codeHooks: s.codeHooks !== false,
    showLeftPanel: s.showLeftPanel !== false,
    showRightPanel: s.showRightPanel !== false,
    showBottomPanel: s.showBottomPanel !== false,
    showStatusBar: s.showStatusBar !== false,
    leftWidth: clamp(s.leftWidth, PANEL_LIMITS.left, base.leftWidth),
    rightWidth: clamp(s.rightWidth, PANEL_LIMITS.right, base.rightWidth),
    bottomHeight: clamp(s.bottomHeight, PANEL_LIMITS.bottom, base.bottomHeight),
    showStartPage: s.showStartPage !== false,
    animation: ANIMATIONS.includes(s.animation) ? s.animation : base.animation,
    animationSpeed: clamp(s.animationSpeed, [0, 300], base.animationSpeed),
    animationRandom: s.animationRandom === true,
    animationInterval: ANIMATION_INTERVALS.includes(Number(s.animationInterval)) ? Number(s.animationInterval) : 0,
    colorMap: COLOR_MAPS.includes(s.colorMap) ? s.colorMap : base.colorMap,
    autoSnapshot: s.autoSnapshot !== false,
    maxNeurons: clamp(s.maxNeurons, [4, 64], base.maxNeurons),
    animateFlow: s.animateFlow !== false,
    showLinks: s.showLinks !== false,
    graphDirection: s.graphDirection === 'horizontal' ? 'horizontal' : 'vertical',
    showGrid: s.showGrid !== false,
    micGain: Number.isFinite(Number(s.micGain)) ? Math.min(8, Math.max(0.25, Number(s.micGain))) : base.micGain,
    micThreshold: Number.isFinite(Number(s.micThreshold)) ? Math.min(0.2, Math.max(0.001, Number(s.micThreshold))) : base.micThreshold,
    pythonPath: typeof s.pythonPath === 'string' ? s.pythonPath : '',
    torchVariant: ['auto', 'cpu', 'cuda', 'default'].includes(s.torchVariant) ? s.torchVariant : 'auto',
    tfBackend: ['auto', 'webgpu', 'webgl', 'wasm', 'cpu'].includes(s.tfBackend) ? s.tfBackend : 'auto',
    torchDevice: s.torchDevice === 'cpu' ? 'cpu' : 'auto',
    pythonAutoSetup: s.pythonAutoSetup !== false,
    saveWeights: s.saveWeights !== false,
    confirmExit: s.confirmExit !== false,
    notifyTrainDone: s.notifyTrainDone !== false,
    startRecentCount: clamp(s.startRecentCount, [0, 10], base.startRecentCount),
  };
}

const systemLanguage = () => (String(globalThis.navigator?.language ?? 'ko').toLowerCase().startsWith('ko') ? 'ko' : 'en');

export function loadSettings(storage) {
  try {
    return normalizeSettings(JSON.parse(storage?.getItem(STORAGE_KEY) ?? '{}'), systemLanguage());
  } catch {
    return defaultSettings(systemLanguage());
  }
}

export function storeSettings(storage, settings) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* storage full or blocked */ }
}

/** Kept when a new installation resets the preferences: the user's data, not their looks. */
const KEEP_KEYS = [RECENT_KEY, SESSION_KEY, INSTALL_RESET_KEY];
const KEEP_SETTINGS = ['language', 'pythonPath'];

/** First start after the installer ran (token from the backend): preferences back to defaults, data kept. */
export function resetForNewInstall(storage, token) {
  if (!storage || !token) return false;
  try {
    if (storage.getItem(INSTALL_RESET_KEY) === String(token)) return false;
    let saved = {};
    try { saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}') ?? {}; } catch { /* unreadable */ }
    const keys = [];
    for (let i = 0; i < storage.length; i++) keys.push(storage.key(i));
    for (const key of keys) if (key?.startsWith('mytrainer.') && !KEEP_KEYS.includes(key)) storage.removeItem(key);
    const kept = Object.fromEntries(KEEP_SETTINGS.filter((key) => key in saved).map((key) => [key, saved[key]]));
    if (Object.keys(kept).length) storage.setItem(STORAGE_KEY, JSON.stringify(kept));
    storage.setItem(INSTALL_RESET_KEY, String(token));
    return true;
  } catch {
    return false;
  }
}

// ───────────────────────── recent files

export const MAX_RECENT = 10;
const samePath = (a, b) => String(a).replace(/\\/g, '/').toLowerCase() === String(b).replace(/\\/g, '/').toLowerCase();

export function addRecent(list, entry, max = MAX_RECENT) {
  const item = { path: entry.path, title: entry.title ?? '', web: Boolean(entry.web), at: entry.at ?? Date.now() };
  return [item, ...list.filter((other) => !samePath(other.path, item.path))].slice(0, max);
}

export const removeRecent = (list, path) => list.filter((item) => !samePath(item.path, path));

export function loadRecent(storage) {
  try {
    const list = JSON.parse(storage?.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((item) => item && typeof item.path === 'string' && item.path).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function storeRecent(storage, list) {
  try {
    storage?.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch { /* storage full or blocked */ }
}

// ───────────────────────── undo / redo

/** Snapshot history: push(state) after a change; undo()/redo() return the state to restore. */
export class History {
  constructor(limit = 100) {
    this.limit = limit;
    this.past = [];
    this.future = [];
  }

  reset(state) {
    this.past = [state];
    this.future = [];
  }

  push(state) {
    const last = this.past.at(-1);
    if (last !== undefined && JSON.stringify(last) === JSON.stringify(state)) return false;
    this.past.push(state);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    return true;
  }

  get canUndo() { return this.past.length > 1; }
  get canRedo() { return this.future.length > 0; }

  undo() {
    if (!this.canUndo) return null;
    this.future.push(this.past.pop());
    return structuredClone(this.past.at(-1));
  }

  redo() {
    if (!this.canRedo) return null;
    const state = this.future.pop();
    this.past.push(state);
    return structuredClone(state);
  }
}
