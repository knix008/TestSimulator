import { defaultCustom, isThemeId, sanitizeCustom, SYSTEM } from '../themes.js';

export const STORAGE_KEY = 'mycapture.settings.v1';

export const IMAGE_FORMATS = ['jpg', 'png', 'gif', 'avif', 'webp', 'tiff', 'bmp'];
/** Lossy formats: the quality slider applies to them. */
export const LOSSY_FORMATS = ['jpg', 'avif'];
export const VIDEO_FORMATS = ['mp4', 'webm'];

/**
 * The start screen's background (startbg.js): which scene, whether it moves, how fast
 * and how strongly it is drawn (percent).
 */
export const START_BG_KINDS = [
  // MyCapture's own capture scenes (startbg.js) …
  'studio', 'region', 'film', 'lens',
  // … and twenty general ones, as in MyUMLMaker (startscenes.js).
  'aurora', 'waves', 'particles', 'constellation', 'bubbles', 'gridflow', 'flowchart', 'starfield', 'rain', 'snow',
  'fireflies', 'ripples', 'coderain', 'hexagons', 'orbits', 'lava', 'spiral', 'confetti', 'nodes', 'ribbons',
];
export const START_BG_MOTIONS = ['animated', 'still', 'off'];
export const START_BG_SPEED = { min: 25, max: 300, step: 25 };
/** How see-through the moving background is, and the cards over it (percent). */
export const START_BG_TRANSPARENCY = { min: 0, max: 90, step: 5 };
export const START_CARD_TRANSPARENCY = { min: 0, max: 80, step: 5 };
/** Change the scene by itself every n seconds (0 = never). */
export const START_BG_SHUFFLE = [0, 30, 60, 300];
/** Every start screen background setting (reset puts these back). */
export const START_BG_SETTINGS = ['startBgKind', 'startBgMotion', 'startBgSpeed', 'startBgTransparency', 'startCardTransparency', 'startBgShuffle'];

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
  showStartScreen: true, // the start screen opens with the program
  startBgKind: 'studio',
  startBgMotion: 'animated',
  startBgSpeed: 100, // percent
  startBgTransparency: 0, // percent
  startCardTransparency: 15, // percent
  startBgShuffle: 0, // seconds, 0 = off
  leftWidth: null, // px; null = default
  rightWidth: null,
});

const oneOf = (value, options, fallback) => (options.includes(value) ? value : fallback);
const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const uint = (value) => Number.isInteger(value) && value >= 0;
/** A number in [min, max], rounded to the step; anything else → fallback. */
const percent = (value, { min, max, step }, fallback) => {
  const number = typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number / step) * step));
};
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
    showStartScreen: bool(value.showStartScreen, d.showStartScreen),
    startBgKind: oneOf(value.startBgKind, START_BG_KINDS, d.startBgKind),
    startBgMotion: oneOf(value.startBgMotion, START_BG_MOTIONS, d.startBgMotion),
    startBgSpeed: percent(value.startBgSpeed, START_BG_SPEED, d.startBgSpeed),
    startBgTransparency: percent(value.startBgTransparency, START_BG_TRANSPARENCY, d.startBgTransparency),
    startCardTransparency: percent(value.startCardTransparency, START_CARD_TRANSPARENCY, d.startCardTransparency),
    startBgShuffle: oneOf(Number(value.startBgShuffle), START_BG_SHUFFLE, d.startBgShuffle),
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
