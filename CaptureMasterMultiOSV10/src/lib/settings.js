// Application settings: defaults and normalisation.
//
// Everything the user can change lives in one object that is persisted as a
// whole (userData/settings.json in Electron, localStorage on the web) and
// reloaded on the next start. `normalizeSettings` makes any stored shape —
// an older version, a hand-edited file, nothing at all — safe to use.

import { SELECTION_SHAPES } from './selection.js';

export const SETTINGS_VERSION = 1;
export const MAX_RECENT = 10;

// `native`: the webview cannot encode it, so the desktop side writes the file
// (not offered on the web). `quality`: the quality setting applies.
export const IMAGE_FORMATS = [
  { id: 'png', ext: 'png', mime: 'image/png', lossy: false },
  { id: 'jpeg', ext: 'jpg', mime: 'image/jpeg', lossy: true, quality: true },
  { id: 'webp', ext: 'webp', mime: 'image/webp', lossy: true, quality: true },
  { id: 'avif', ext: 'avif', mime: 'image/avif', lossy: true, quality: true, native: true },
  { id: 'bmp', ext: 'bmp', mime: 'image/bmp', lossy: false },
  { id: 'gif', ext: 'gif', mime: 'image/gif', lossy: true, native: true },
  { id: 'tiff', ext: 'tif', mime: 'image/tiff', lossy: false, native: true },
  { id: 'ico', ext: 'ico', mime: 'image/x-icon', lossy: false, native: true },
  { id: 'tga', ext: 'tga', mime: 'image/x-tga', lossy: false, native: true },
  { id: 'qoi', ext: 'qoi', mime: 'image/qoi', lossy: false, native: true },
];

/** The formats this build can write. */
export function imageFormatsFor(nativeEncoding) {
  return IMAGE_FORMATS.filter((f) => nativeEncoding || !f.native);
}

export const VIDEO_FPS = [15, 24, 30, 60];

export const DEFAULT_SETTINGS = Object.freeze({
  version: SETTINGS_VERSION,
  language: 'ko',
  theme: 'midnight',
  font: { family: '', size: 13, bold: false, italic: false },
  annotation: { color: '#ff3d3d', strokeWidth: 4, fill: false, fontFamily: '', fontSize: 24, bold: true, italic: false },
  capture: { delay: 0, hideWindow: true, allowSelf: true, copyToClipboard: false, showCountdown: true },
  customThemes: [],
  image: { format: 'png', quality: 92 },
  video: { format: 'auto', fps: 30, systemAudio: false, systemAudioGain: 100, microphone: false, minimizeWhileRecording: true, askPath: false, bitrateMbps: 8 },
  mic: { deviceId: '', label: '', gain: 100, echoCancellation: true, noiseSuppression: true, autoGainControl: false },
  paths: { lastOpenDir: '', lastSaveDir: '', lastExportDir: '', videoDir: '', captureDir: '' },
  editor: { showRulers: false, selectionShape: 'rect' },
  history: { open: true, width: 260 },
  toolPanel: { open: true, width: 210 },
  recent: [],
});

/** Scrollbar gutter the side panels always reserve (`scrollbar-width: thin`). */
export const SCROLLBAR_W = 10;
export const HISTORY_WIDTH = { min: 200 + SCROLLBAR_W, max: 480 };
/** The tool panel on the left shares the capture history's limits. */
export const TOOL_PANEL_WIDTH = { min: HISTORY_WIDTH.min, max: HISTORY_WIDTH.max };
/** Recording volume of the microphone and of system sound, in percent. */
export const AUDIO_GAIN = { min: 0, max: 300 };

/** The microphone part of `startRecording` options, or false when it is off. */
export function micOptions(s) {
  if (!s.video.microphone) return false;
  const m = s.mic;
  return { deviceId: m.deviceId, gain: m.gain / 100, echoCancellation: m.echoCancellation, noiseSuppression: m.noiseSuppression, autoGainControl: m.autoGainControl };
}

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(v, fallback) { return typeof v === 'boolean' ? v : fallback; }
function str(v, fallback) { return typeof v === 'string' ? v : fallback; }

function oneOf(v, list, fallback) { return list.includes(v) ? v : fallback; }

function hexColor(v, fallback) {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
}

function normalizeCustomThemes(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    let id = typeof item.id === 'string' && /^custom-[a-z0-9_-]+$/i.test(item.id) ? item.id : '';
    let n = out.length;
    while (!id || seen.has(id)) {
      id = `custom-n${n}`;
      n += 1;
    }
    seen.add(id);
    const label = str(item.label, 'Custom').trim().slice(0, 40) || 'Custom';
    out.push({
      id,
      label,
      mode: item.mode === 'light' ? 'light' : 'dark',
      bg: hexColor(item.bg, item.mode === 'light' ? '#f6f7f9' : '#12161c'),
      panel: hexColor(item.panel, item.mode === 'light' ? '#eef1f5' : '#161b23'),
      text: hexColor(item.text, item.mode === 'light' ? '#1c2530' : '#e4e9f0'),
      accent: hexColor(item.accent, item.mode === 'light' ? '#1565c0' : '#4cc9f0'),
      titlebar: hexColor(item.titlebar, item.mode === 'light' ? '#e9edf2' : '#0e1217'),
    });
    if (out.length >= 24) break;
  }
  return out;
}

export function normalizeSettings(raw) {
  const d = DEFAULT_SETTINGS;
  const s = raw && typeof raw === 'object' ? raw : {};
  const font = s.font || {};
  const ann = s.annotation || {};
  const cap = s.capture || {};
  const img = s.image || {};
  const vid = s.video || {};
  const paths = s.paths || {};
  const ed = s.editor || {};
  const hist = s.history || {};
  const tp = s.toolPanel || {};
  const mic = s.mic || {};

  const recent = Array.isArray(s.recent)
    ? s.recent
      .filter((r) => r && typeof r.path === 'string' && r.path)
      .map((r) => ({
        path: r.path,
        name: str(r.name, r.path.split(/[\\/]/).pop()),
        kind: oneOf(r.kind, ['capture', 'image', 'video'], 'capture'),
        openedAt: Number(r.openedAt) || Date.now(),
      }))
      .slice(0, MAX_RECENT)
    : [];

  return {
    version: SETTINGS_VERSION,
    language: oneOf(s.language, ['ko', 'en'], d.language),
    theme: str(s.theme, d.theme),
    font: {
      family: str(font.family, d.font.family),
      size: clampNum(font.size, 9, 24, d.font.size),
      bold: bool(font.bold, d.font.bold),
      italic: bool(font.italic, d.font.italic),
    },
    annotation: {
      color: /^#[0-9a-f]{6}$/i.test(ann.color) ? ann.color : d.annotation.color,
      strokeWidth: clampNum(ann.strokeWidth, 1, 40, d.annotation.strokeWidth),
      fill: bool(ann.fill, d.annotation.fill),
      fontFamily: str(ann.fontFamily, d.annotation.fontFamily),
      fontSize: clampNum(ann.fontSize, 8, 200, d.annotation.fontSize),
      bold: bool(ann.bold, d.annotation.bold),
      italic: bool(ann.italic, d.annotation.italic),
    },
    capture: {
      delay: clampNum(cap.delay, 0, 30, d.capture.delay),
      hideWindow: bool(cap.hideWindow, d.capture.hideWindow),
      allowSelf: bool(cap.allowSelf, d.capture.allowSelf),
      copyToClipboard: bool(cap.copyToClipboard, d.capture.copyToClipboard),
      showCountdown: bool(cap.showCountdown, d.capture.showCountdown),
    },
    customThemes: normalizeCustomThemes(s.customThemes),
    image: {
      format: oneOf(img.format, IMAGE_FORMATS.map((f) => f.id), d.image.format),
      quality: clampNum(img.quality, 10, 100, d.image.quality),
    },
    video: {
      format: str(vid.format, d.video.format),
      fps: oneOf(Number(vid.fps), VIDEO_FPS, d.video.fps),
      systemAudio: bool(vid.systemAudio, d.video.systemAudio),
      systemAudioGain: Math.round(clampNum(vid.systemAudioGain, AUDIO_GAIN.min, AUDIO_GAIN.max, d.video.systemAudioGain)),
      microphone: bool(vid.microphone, d.video.microphone),
      minimizeWhileRecording: bool(vid.minimizeWhileRecording, d.video.minimizeWhileRecording),
      askPath: bool(vid.askPath, d.video.askPath),
      bitrateMbps: clampNum(vid.bitrateMbps, 1, 50, d.video.bitrateMbps),
    },
    mic: {
      deviceId: str(mic.deviceId, d.mic.deviceId),
      label: str(mic.label, d.mic.label),
      gain: Math.round(clampNum(mic.gain, AUDIO_GAIN.min, AUDIO_GAIN.max, d.mic.gain)),
      echoCancellation: bool(mic.echoCancellation, d.mic.echoCancellation),
      noiseSuppression: bool(mic.noiseSuppression, d.mic.noiseSuppression),
      autoGainControl: bool(mic.autoGainControl, d.mic.autoGainControl),
    },
    paths: {
      lastOpenDir: str(paths.lastOpenDir, ''),
      lastSaveDir: str(paths.lastSaveDir, ''),
      lastExportDir: str(paths.lastExportDir, ''),
      videoDir: str(paths.videoDir, ''),
      captureDir: str(paths.captureDir, ''),
    },
    editor: {
      showRulers: bool(ed.showRulers, d.editor.showRulers),
      selectionShape: SELECTION_SHAPES.includes(ed.selectionShape) ? ed.selectionShape : d.editor.selectionShape,
    },
    history: {
      open: bool(hist.open, d.history.open),
      width: Math.round(clampNum(hist.width, HISTORY_WIDTH.min, HISTORY_WIDTH.max, d.history.width)),
    },
    toolPanel: {
      open: bool(tp.open, d.toolPanel.open),
      width: Math.round(clampNum(tp.width, TOOL_PANEL_WIDTH.min, TOOL_PANEL_WIDTH.max, d.toolPanel.width)),
    },
    recent,
  };
}

/** Adds (or bumps) a recent entry, keeping the list at MAX_RECENT. */
export function addRecent(recent, entry) {
  const rest = recent.filter((r) => r.path !== entry.path);
  return [{ ...entry, openedAt: Date.now() }, ...rest].slice(0, MAX_RECENT);
}

export function removeRecent(recent, path) {
  return recent.filter((r) => r.path !== path);
}

export function imageFormatById(id) {
  return IMAGE_FORMATS.find((f) => f.id === id) || IMAGE_FORMATS[0];
}

export function imageFormatByExt(ext) {
  const e = String(ext || '').toLowerCase().replace(/^\./, '');
  const alias = { jpeg: 'jpg', tiff: 'tif' }[e] || e;
  return IMAGE_FORMATS.find((f) => f.ext === alias) || null;
}
