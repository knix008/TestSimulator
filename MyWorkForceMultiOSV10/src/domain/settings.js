const KEY = 'myworkforce-settings';

export const DEFAULTS = {
  language: 'ko',
  theme: 'light',
  customTheme: null,
  fontFamily: '',
  fontSize: 13,
  fontWeight: 400,
  fontStyle: 'normal',
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
