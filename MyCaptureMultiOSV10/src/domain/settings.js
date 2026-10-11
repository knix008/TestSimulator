export const STORAGE_KEY = 'mycapture.settings.v1';

export const IMAGE_FORMATS = ['jpg', 'png', 'gif', 'tiff', 'bmp', 'webp'];
export const VIDEO_FORMATS = ['mp4', 'webm'];

export const defaultSettings = Object.freeze({
  language: null, // null = follow the system (ko on Korean systems, otherwise en)
  mode: 'capture', // capture | record
  target: 'monitor', // monitor | window | region
  monitorId: null, // null = all monitors (capture only)
  windowId: null,
  region: null, // { monitorId, x, y, width, height } in physical pixels
  imageFormat: 'jpg',
  jpegQuality: 92,
  videoFormat: 'mp4',
  engine: 'display', // display = system picker (getDisplayMedia), native = frames from the app
  fps: 30,
  systemAudio: false,
  microphone: false,
  imageDirectory: null,
  videoDirectory: null,
  askPath: true,
  copyToClipboard: false,
  micDeviceId: null, // null = system default input
  micGain: 100, // percent, 0–200
  sidebarCollapsed: false,
});

const oneOf = (value, options, fallback) => (options.includes(value) ? value : fallback);
const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const uint = (value) => Number.isInteger(value) && value >= 0;

function sanitizeRegion(region) {
  if (!region || typeof region !== 'object') return null;
  const { monitorId, x, y, width, height } = region;
  if (![monitorId, x, y, width, height].every(uint) || width === 0 || height === 0) return null;
  return { monitorId, x, y, width, height };
}

/** Accepts anything (old or hand-edited storage) and returns valid settings. */
export function sanitizeSettings(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const d = defaultSettings;
  const quality = Number(value.jpegQuality);
  return {
    language: oneOf(value.language, ['ko', 'en'], null),
    mode: oneOf(value.mode, ['capture', 'record'], d.mode),
    target: oneOf(value.target, ['monitor', 'window', 'region'], d.target),
    monitorId: uint(value.monitorId) ? value.monitorId : null,
    windowId: uint(value.windowId) ? value.windowId : null,
    region: sanitizeRegion(value.region),
    imageFormat: oneOf(value.imageFormat, IMAGE_FORMATS, d.imageFormat),
    jpegQuality: Number.isFinite(quality) ? Math.min(100, Math.max(40, Math.round(quality))) : d.jpegQuality,
    videoFormat: oneOf(value.videoFormat, VIDEO_FORMATS, d.videoFormat),
    engine: oneOf(value.engine, ['display', 'native'], d.engine),
    fps: oneOf(Number(value.fps), [15, 30, 60], d.fps),
    systemAudio: bool(value.systemAudio, d.systemAudio),
    microphone: bool(value.microphone, d.microphone),
    imageDirectory: typeof value.imageDirectory === 'string' && value.imageDirectory ? value.imageDirectory : null,
    videoDirectory: typeof value.videoDirectory === 'string' && value.videoDirectory ? value.videoDirectory : null,
    askPath: bool(value.askPath, d.askPath),
    copyToClipboard: bool(value.copyToClipboard, d.copyToClipboard),
    micDeviceId: typeof value.micDeviceId === 'string' && value.micDeviceId ? value.micDeviceId : null,
    micGain: Number.isFinite(Number(value.micGain)) ? Math.min(200, Math.max(0, Math.round(Number(value.micGain)))) : d.micGain,
    sidebarCollapsed: bool(value.sidebarCollapsed, d.sidebarCollapsed),
  };
}

export function loadSettings(storage) {
  try {
    return sanitizeSettings(JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return sanitizeSettings(null);
  }
}

export function storeSettings(storage, settings) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private profile, quota); settings then last for this run.
  }
}

/** The capture source the backend understands, or null when nothing usable is selected. */
export function captureSource(settings) {
  if (settings.target === 'window') return settings.windowId == null ? null : { kind: 'window', id: settings.windowId };
  if (settings.target === 'region') return settings.region ? { kind: 'region', ...settings.region } : null;
  return settings.monitorId == null ? { kind: 'allMonitors' } : { kind: 'monitor', id: settings.monitorId };
}
