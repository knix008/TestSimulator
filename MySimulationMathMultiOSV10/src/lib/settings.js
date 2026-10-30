// GUI settings: defaults, a deep merge with what the host stored
// (/api/settings/get), and a small store with a hook. Changes are written
// back after a short pause (one write for a burst of changes).
import { useEffect, useState } from 'react';
import { loadSettings, storeSettings } from './backend.js';
import { PRINT_DEFAULTS } from '../print/printdoc.js';

export const MONO_FONTS = ['Consolas', 'Cascadia Mono', 'D2Coding', 'JetBrains Mono', 'Fira Code', 'Source Code Pro', 'Courier New', 'monospace'];

export const DEFAULT_LAYOUT = {
  folder: { on: true, w: 250, collapsed: false },
  workspace: { on: true },
  history: { on: true },
  cmd: { on: true },
  rightCollapsed: false,
  rightW: 300,
  cmdH: 260,
  wsRatio: 0.58,
};

export const DEFAULTS = {
  language: 'ko',
  theme: 'midnight',
  customThemes: [],
  startFolder: '',
  restoreFiles: true,
  confirmExit: true,
  cmd: { fontFamily: 'Consolas', fontSize: 13, numericFormat: 'short', compact: false, scrollback: 5000 },
  editor: { fontFamily: 'Consolas', fontSize: 13, tabSize: 4, autosave: false, autosaveSec: 30, wrap: false, lineNumbers: true, spellCheck: true, spellWords: [], indentSize: 4, indentFunctions: true },
  figures: { renderer: 'canvas', grid: false, rulers: false, edges: true },
  sim: { solver: 'ode45', stopTime: 10 },
  keyboard: { ctrlEnterSection: true, tabCompletion: true, ctrlCCopies: true },
  layout: DEFAULT_LAYOUT,
  openFiles: [],
  recentFiles: [],
  showStartOnLaunch: true,
  startBackground: {},
  ribbonTab: 'home',
  // The last print setup (src/print/printdoc.js PRINT_DEFAULTS).
  print: PRINT_DEFAULTS,
  // The launch popup "튜토리얼을 실행할까요?" (askOnLaunch) and whether the tour was played to the end.
  tutorial: { askOnLaunch: true, done: false },
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Deep merge: objects merge, everything else (arrays included) replaces. */
export function merge(base, patch) {
  if (!isObj(base) || !isObj(patch)) return patch === undefined ? base : patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  return out;
}

let current = DEFAULTS;
const subs = new Set();
let timer = null;
let loaded = false;

export const getSettings = () => current;
export const settingsLoaded = () => loaded;

export async function initSettings() {
  const stored = await loadSettings();
  current = merge(DEFAULTS, isObj(stored) ? stored : {});
  loaded = true;
  subs.forEach((fn) => fn(current));
  return current;
}

function scheduleStore() {
  clearTimeout(timer);
  timer = setTimeout(() => { storeSettings(current).catch(() => {}); }, 400);
}

/** Changes settings (deep merge) and stores them. */
export function patchSettings(patch, { store = true } = {}) {
  current = merge(current, patch);
  subs.forEach((fn) => fn(current));
  if (store && loaded) scheduleStore();
  return current;
}

/** Replaces the settings (the settings window saved them elsewhere). */
export function replaceSettings(next, { store = false } = {}) {
  current = merge(DEFAULTS, next || {});
  subs.forEach((fn) => fn(current));
  if (store) scheduleStore();
  return current;
}

export function flushSettings() {
  if (!timer) return Promise.resolve();
  clearTimeout(timer);
  timer = null;
  return storeSettings(current).catch(() => {});
}

export function useSettings() {
  const [s, setS] = useState(current);
  useEffect(() => {
    subs.add(setS);
    setS(current);
    return () => subs.delete(setS);
  }, []);
  return s;
}
