// Preferences kept in localStorage (shared by every window of the app: same origin).
import { DEFAULT_PRINT } from './printLayout.js';

export const STORAGE_KEY = 'myicomaker.settings';
export const SESSION_KEY = 'myicomaker.session';
export const PRINT_KEY = 'myicomaker.print';
const RESET_KEY = 'myicomaker.installReset';

export const ANIMATIONS = [
  'aurora', 'waves', 'particles', 'constellation', 'bubbles', 'gridflow', 'flowchart', 'starfield', 'rain', 'snow',
  'fireflies', 'ripples', 'coderain', 'hexagons', 'orbits', 'lava', 'spiral', 'confetti', 'nodes', 'ribbons',
];

export const DEFAULTS = {
  language: 'ko',
  theme: 'midnight',
  customTheme: null,
  rulers: true,
  showStartScreen: true,
  animation: 'aurora',
  animationSpeed: 100,
  startCardOpacity: 80,
  startLayout: null,
  recent: [],
  grid: true,
  snap: false,
  guides: true,
  preview: true,
  fill: '#3b82f6',
  fill2: '#1e40af',
  stroke: '#0f172a',
  strokeWidth: 8,
  print: { ...DEFAULT_PRINT },
};

/** Preferences: the parts the user changes and the parts the program remembers (recent files, start layout). */
const PREFERENCE_KEYS = ['theme', 'customTheme', 'rulers', 'showStartScreen', 'animation', 'animationSpeed', 'startCardOpacity', 'startLayout', 'grid', 'snap', 'guides', 'preview', 'fill', 'fill2', 'stroke', 'strokeWidth', 'print'];

export function loadSettings(storage = globalThis.localStorage) {
  let saved = {};
  try { saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '{}') ?? {}; } catch { saved = {}; }
  const merged = { ...DEFAULTS, ...saved, print: { ...DEFAULTS.print, ...(saved.print ?? {}) } };
  if (!ANIMATIONS.includes(merged.animation)) merged.animation = DEFAULTS.animation;
  if (merged.language !== 'en') merged.language = 'ko';
  if (!Array.isArray(merged.recent)) merged.recent = [];
  return merged;
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* storage full or blocked: not kept */ }
}

/**
 * First start after an installation that kept the user data (the installer leaves a token, the
 * backend passes it on): the preferences go back to their defaults once per token; the recent
 * files and the language stay.
 */
export function resetForNewInstall(storage, token) {
  if (!token || !storage) return false;
  if (storage.getItem(RESET_KEY) === String(token)) return false;
  const settings = loadSettings(storage);
  for (const key of PREFERENCE_KEYS) settings[key] = structuredClone(DEFAULTS[key]);
  saveSettings(settings, storage);
  storage.setItem(RESET_KEY, String(token));
  return true;
}

/** The language chosen in the installer becomes the program's language (first start after installing). */
export function applyInstallLanguage(storage, language) {
  if (!storage || (language !== 'ko' && language !== 'en')) return false;
  const settings = loadSettings(storage);
  settings.language = language;
  saveSettings(settings, storage);
  return true;
}
