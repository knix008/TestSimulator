import { persistGetItem, persistSetItem } from './persist.js';

const STORAGE_KEY = 'myvideoplayer.settings.v1';

export const DEFAULT_SETTINGS = {
  locale: 'auto',
  theme: 'dark',
  rate: 1,
  seekStep: 10,
  autoplay: true,
  loop: false,
  showSpectrum: true,
  /** Auto-hide toolbar / control overlays until mouse approaches edges */
  autoHideChrome: true,
  spectrumStyle: 'rainbow',
  showSubtitles: true,
  subSize: 28,
  startVolume: 80,
  windowOpacity: 100,
  /** Separate opacity for the spectrum BrowserWindow (20–100) */
  spectrumOpacity: 100,
  /** Separate opacity for the play-history BrowserWindow (20–100) */
  historyOpacity: 100,
  /** Open play-history as a separate window */
  showHistoryPanel: false,
  /** Compact / mini player chrome */
  compactMode: false,
  /** @type {'contain' | 'cover' | 'actual'} */
  videoFit: 'contain'
};

const VIDEO_FIT_MODES = new Set(['contain', 'cover', 'actual']);

export function normalizeVideoFit(mode) {
  return VIDEO_FIT_MODES.has(mode) ? mode : DEFAULT_SETTINGS.videoFit;
}

export function loadSettings() {
  try {
    const raw = persistGetItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const merged = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    if (!merged.spectrumStyle) merged.spectrumStyle = DEFAULT_SETTINGS.spectrumStyle;
    if (merged.windowOpacity == null) merged.windowOpacity = DEFAULT_SETTINGS.windowOpacity;
    if (merged.spectrumOpacity == null) merged.spectrumOpacity = DEFAULT_SETTINGS.spectrumOpacity;
    if (merged.historyOpacity == null) merged.historyOpacity = DEFAULT_SETTINGS.historyOpacity;
    if (merged.autoHideChrome == null) merged.autoHideChrome = DEFAULT_SETTINGS.autoHideChrome;
    merged.videoFit = normalizeVideoFit(merged.videoFit);
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  persistSetItem(STORAGE_KEY, JSON.stringify(settings));
}

export function resetSettings() {
  saveSettings(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS };
}
