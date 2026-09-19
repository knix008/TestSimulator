import { persistGetItem, persistSetItem } from "./persist.js";

const STORAGE_KEY = "myvideoplayer.settings.v1";

export const DEFAULT_SETTINGS = {
  locale: "auto",
  theme: "dark",
  rate: 1,
  seekStep: 10,
  autoplay: true,
  loop: false,
  showSpectrum: true,
  /** Auto-hide toolbar / control overlays until mouse approaches edges */
  autoHideChrome: true,
  spectrumStyle: "rainbow",
  showSubtitles: true,
  subSize: 28,
  startVolume: 80,
  windowOpacity: 100,
  /** Separate opacity for the spectrum BrowserWindow (20–100) */
  spectrumOpacity: 100,
  /** Separate opacity for the play-history BrowserWindow (20–100) */
  historyOpacity: 100,
  /** Open play-history as a right-side panel in the main window */
  showHistoryPanel: false,
  /** Compact / mini player chrome */
  compactMode: false,
  /** @type {'contain' | 'cover' | 'actual'} */
  videoFit: "contain",
  /**
   * Rotation applied when a file opens, in degrees. The toolbar / hotkeys turn
   * the current video without touching this; only Settings changes the default.
   * @type {0 | 90 | 180 | 270}
   */
  videoRotation: 0,
};

const VIDEO_FIT_MODES = new Set(["contain", "cover", "actual"]);
const VIDEO_ROTATIONS = [0, 90, 180, 270];

export function normalizeVideoFit(mode) {
  return VIDEO_FIT_MODES.has(mode) ? mode : DEFAULT_SETTINGS.videoFit;
}

export function normalizeVideoRotation(deg) {
  const n = ((Math.round(Number(deg) || 0) % 360) + 360) % 360;
  return VIDEO_ROTATIONS.includes(n) ? n : DEFAULT_SETTINGS.videoRotation;
}

export function loadSettings() {
  try {
    const raw = persistGetItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const merged = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    if (!merged.spectrumStyle)
      merged.spectrumStyle = DEFAULT_SETTINGS.spectrumStyle;
    if (merged.windowOpacity == null)
      merged.windowOpacity = DEFAULT_SETTINGS.windowOpacity;
    if (merged.spectrumOpacity == null)
      merged.spectrumOpacity = DEFAULT_SETTINGS.spectrumOpacity;
    if (merged.historyOpacity == null)
      merged.historyOpacity = DEFAULT_SETTINGS.historyOpacity;
    if (merged.autoHideChrome == null)
      merged.autoHideChrome = DEFAULT_SETTINGS.autoHideChrome;
    merged.videoFit = normalizeVideoFit(merged.videoFit);
    merged.videoRotation = normalizeVideoRotation(merged.videoRotation);
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
