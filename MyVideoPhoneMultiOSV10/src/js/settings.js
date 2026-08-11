import { persistGetItem, persistSetItem } from './persist.js';

const STORAGE_KEY = 'myvideophone.settings.v1';

export const DEFAULT_SETTINGS = {
  locale: 'auto',
  theme: 'dark',
  rate: 1,
  seekStep: 10,
  autoplay: true,
  loop: false,
  startVolume: 80,
  /** Outgoing microphone level (0–100). */
  micVolume: 100,
  windowOpacity: 100,
  /**
   * Local PIP shows the outgoing publish stream (same fMP4 as peers),
   * not a second getUserMedia camera open.
   */
  showLocalPreview: true,
  /** Marks stream-mirror preview (migrates legacy forced-off getUserMedia PIP). */
  previewSource: 'publish',
  /** @type {'contain' | 'cover' | 'actual'} */
  videoFit: 'cover',
  /** Recently dialed addresses (most-recent first, max 10). @type {string[]} */
  recentCalls: []
};

/** Max entries kept in the recent-calls history. */
export const MAX_RECENT_CALLS = 10;

/** Sanitize a persisted recent-calls list: strings only, trimmed, deduped, capped. */
export function normalizeRecentCalls(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const s = String(item || '').trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= MAX_RECENT_CALLS) break;
  }
  return out;
}

const VIDEO_FIT_MODES = new Set(['contain', 'cover', 'actual']);

export function normalizeVideoFit(mode) {
  return VIDEO_FIT_MODES.has(mode) ? mode : DEFAULT_SETTINGS.videoFit;
}

export function loadSettings() {
  try {
    const raw = persistGetItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const merged = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    if (merged.windowOpacity == null) merged.windowOpacity = DEFAULT_SETTINGS.windowOpacity;
    if (merged.micVolume == null) merged.micVolume = DEFAULT_SETTINGS.micVolume;
    merged.micVolume = Math.min(100, Math.max(0, Math.round(Number(merged.micVolume) || 100)));
    merged.videoFit = normalizeVideoFit(merged.videoFit);
    merged.recentCalls = normalizeRecentCalls(merged.recentCalls);
    // Older builds forced showLocalPreview=false (getUserMedia PIP stole the camera).
    // One-time migrate to the publish-mirror preview default, then persist the marker.
    let migrated = false;
    if (merged.previewSource !== 'publish') {
      merged.showLocalPreview = DEFAULT_SETTINGS.showLocalPreview;
      merged.previewSource = 'publish';
      migrated = true;
    } else {
      merged.showLocalPreview = merged.showLocalPreview !== false;
    }
    // uiPort was removed from user settings — ignore legacy persisted values.
    delete merged.uiPort;
    if (migrated) saveSettings(merged);
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  persistSetItem(STORAGE_KEY, JSON.stringify(settings));
}

/**
 * Reset to defaults. Pass overrides (e.g. `{ locale }`) to keep selected fields.
 * @param {Partial<typeof DEFAULT_SETTINGS>} [overrides]
 */
export function resetSettings(overrides = {}) {
  const next = { ...DEFAULT_SETTINGS, ...overrides };
  next.videoFit = normalizeVideoFit(next.videoFit);
  delete next.uiPort;
  saveSettings(next);
  return next;
}
