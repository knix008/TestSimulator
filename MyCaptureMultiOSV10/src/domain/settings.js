import { defaultCustom, isThemeId, sanitizeCustom, SYSTEM } from '../themes.js';

export const STORAGE_KEY = 'mycapture.settings.v1';

export const IMAGE_FORMATS = ['jpg', 'png', 'gif', 'tiff', 'bmp', 'webp'];
export const VIDEO_FORMATS = ['mp4', 'webm'];

/** Bumped when a default changes in a way existing settings should pick up. */
export const SETTINGS_VERSION = 2;

export const defaultSettings = Object.freeze({
  settingsVersion: SETTINGS_VERSION,
  language: null, // null = follow the system (ko on Korean systems, otherwise en)
  theme: SYSTEM, // a theme id from themes.js, 'custom', or 'system' (OS light/dark)
  customTheme: defaultCustom(),
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
  askPath: false, // false = save straight into the folder; true = ask every time
  copyToClipboard: false,
  selfMode: false, // true = the capture/record button takes MyCapture's own window
  micDeviceId: null, // null = system default input
  micGain: 100, // percent, 0–200
  sidebarCollapsed: false,
  historyCollapsed: false,
  leftWidth: null, // px; null = default
  rightWidth: null,
});

const oneOf = (value, options, fallback) => (options.includes(value) ? value : fallback);
const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const uint = (value) => Number.isInteger(value) && value >= 0;
const width = (value) => (Number.isFinite(value) && value >= 120 && value <= 2000 ? Math.round(value) : null);

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
    theme: isThemeId(value.theme) ? value.theme : SYSTEM,
    customTheme: sanitizeCustom(value.customTheme),
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
    // Version 2 made saving automatic; older settings start from that too.
    askPath: value.settingsVersion >= 2 ? bool(value.askPath, d.askPath) : d.askPath,
    settingsVersion: SETTINGS_VERSION,
    copyToClipboard: bool(value.copyToClipboard, d.copyToClipboard),
    selfMode: bool(value.selfMode, d.selfMode),
    micDeviceId: typeof value.micDeviceId === 'string' && value.micDeviceId ? value.micDeviceId : null,
    micGain: Number.isFinite(Number(value.micGain)) ? Math.min(200, Math.max(0, Math.round(Number(value.micGain)))) : d.micGain,
    sidebarCollapsed: bool(value.sidebarCollapsed, d.sidebarCollapsed),
    historyCollapsed: bool(value.historyCollapsed, d.historyCollapsed),
    leftWidth: width(value.leftWidth),
    rightWidth: width(value.rightWidth),
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
