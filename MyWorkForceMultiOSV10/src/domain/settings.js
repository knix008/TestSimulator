const KEY = 'myworkforce-settings';

/** Both side panels share one minimum. The separator cannot drag them narrower than this. */
export const PANEL_MIN = 280;
export const PANEL_MAX = 640;

const panelWidth = (value) => {
  const width = Math.round(Number(value));
  if (!Number.isFinite(width)) return PANEL_MIN;
  return Math.max(PANEL_MIN, Math.min(PANEL_MAX, width));
};

export const DEFAULTS = {
  language: 'ko',
  theme: 'light',
  customTheme: null,
  fontFamily: '',
  fontSize: 13,
  fontWeight: 400,
  fontStyle: 'normal',
  showLeftPanel: true,
  /** Sections of the left navigation that are folded shut: { company, spaces, work, project, admin }. */
  navFolded: {},
  /** Sections of the right panel that are folded shut, by section id. */
  sideFolded: {},
  showRightPanel: true,
  leftWidth: PANEL_MIN,
  rightWidth: PANEL_MIN,
  showStartPage: true,
  showWelcome: true,
  startShowProjects: true,
  startShowExamples: true,
  startShowBackground: true,
  background: 'board',
  backgroundSpeed: 100,
  backgroundRandom: false,
  backgroundInterval: 0,
  launchAtStartup: false,
  autoLogin: false,
  recent: [],
};

let current = null;

export function loadSettings() {
  if (current) return current;
  let stored = {};
  try {
    stored = JSON.parse(globalThis.localStorage?.getItem(KEY) || '{}') || {};
  } catch {
    stored = {};
  }
  current = {
    ...DEFAULTS,
    ...stored,
    recent: Array.isArray(stored.recent) ? stored.recent.filter((item) => typeof item === 'string').slice(0, 8) : [],
    fontSize: Number(stored.fontSize) || DEFAULTS.fontSize,
    navFolded: stored.navFolded && typeof stored.navFolded === 'object' && !Array.isArray(stored.navFolded) ? { ...stored.navFolded } : {},
    sideFolded: stored.sideFolded && typeof stored.sideFolded === 'object' && !Array.isArray(stored.sideFolded) ? { ...stored.sideFolded } : {},
    leftWidth: panelWidth(stored.leftWidth),
    rightWidth: panelWidth(stored.rightWidth),
    showStartPage: stored.showStartPage !== false,
    showWelcome: stored.showWelcome !== false,
    startShowProjects: stored.startShowProjects !== false,
    startShowExamples: stored.startShowExamples !== false,
    startShowBackground: stored.startShowBackground !== false,
    backgroundSpeed: Number.isFinite(Number(stored.backgroundSpeed)) ? Math.max(0, Math.min(300, Number(stored.backgroundSpeed))) : DEFAULTS.backgroundSpeed,
    backgroundRandom: stored.backgroundRandom === true,
    launchAtStartup: stored.launchAtStartup === true,
    autoLogin: stored.autoLogin === true,
    // List views (the audit log…): column order, widths and sort, per list.
    listViews: stored.listViews && typeof stored.listViews === 'object' ? stored.listViews : {},
    backgroundInterval: [0, 15, 30, 60, 120, 300].includes(Number(stored.backgroundInterval)) ? Number(stored.backgroundInterval) : 0,
  };
  return current;
}

export function saveSettings() {
  const settings = loadSettings();
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* the workspace itself still lives in IndexedDB */
  }
}

/** First launch after an installer reset marker: preferences return to defaults once per token. */
/** Applies the installer's language once (by its token), over the language kept from an earlier install. */
export function applyInstallLanguage(language, token) {
  const settings = loadSettings();
  if (language !== 'ko' && language !== 'en') return settings;
  const seen = globalThis.localStorage?.getItem('myworkforce-install-language');
  if (token && seen === token) return settings;
  settings.language = language;
  saveSettings();
  if (token) globalThis.localStorage?.setItem('myworkforce-install-language', token);
  return settings;
}

export function applyInstall(token, language) {
  const settings = loadSettings();
  if (token && globalThis.localStorage?.getItem('myworkforce-install') !== token) {
    globalThis.localStorage?.setItem('myworkforce-install', token);
    Object.assign(settings, DEFAULTS, { language: language === 'en' ? 'en' : 'ko' });
    saveSettings();
  } else if ((language === 'ko' || language === 'en') && !globalThis.localStorage?.getItem(KEY)) {
    settings.language = language;
    saveSettings();
  }
  return settings;
}

export function rememberPath(path) {
  if (!path) return;
  const settings = loadSettings();
  settings.recent = [path, ...settings.recent.filter((item) => item !== path)].slice(0, 8);
  saveSettings();
}
