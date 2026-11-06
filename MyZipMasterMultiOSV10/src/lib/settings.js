// Preferences live in localStorage, where every window sees them, with a copy on disk on the desktop
// (WebView storage can be lost when a program is killed).
import { isDesktop, invoke } from './host';

const KEY = 'zm-settings';

export const DEFAULT_SETTINGS = {
  format: 'zip',
  level: 5,
  split: 'none',
  splitText: '100',
  splitUnit: 'MB',
  zipStyle: 'span',
  cipher: 'aes256',
  smartStore: true,
  overwrite: 'ask',
  extractSubfolder: true,
  openAfterExtract: false,
  confirmDelete: true,
  encoding: 'auto',
  showHidden: false,
  showStart: true,
  startBg: 'zipper',
  startBgTransparency: '25',
  startBgSpeed: '100',
  startLayout: null,
  keepBroken: false,
  solid: false,
  uiScale: '100',
  recent: [],
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* unreadable or blocked: fall through to defaults */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings) {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* blocked storage */ }
  mirrorToDisk();
}

export function mirrorToDisk() {
  if (!isDesktop) return;
  const snapshot = { settings: loadSettings() };
  for (const k of ['zm-theme', 'zm-theme-auto', 'zm-custom-theme', 'zm-lang', 'zm-theme-dark', 'zm-theme-light', 'zm-side-width', 'zm-info-width', 'zm-left-open', 'zm-right-open']) {
    const v = localStorage.getItem(k);
    if (v != null) snapshot[k] = v;
  }
  invoke('save_settings', { settings: snapshot }).catch(() => {});
}

// At start: disk wins, because it survives what localStorage may not.
export async function restoreFromDisk() {
  if (!isDesktop) return;
  try {
    const disk = await invoke('load_settings');
    if (disk?.settings) localStorage.setItem(KEY, JSON.stringify(disk.settings));
    for (const [k, v] of Object.entries(disk ?? {})) {
      if (k !== 'settings' && typeof v === 'string') localStorage.setItem(k, v);
    }
  } catch { /* first run */ }
}

const MAX_RECENT = 12;

export function pushRecent(list, path) {
  return [path, ...list.filter((p) => p !== path)].slice(0, MAX_RECENT);
}
