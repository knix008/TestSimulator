// Application settings: defaults and normalisation.
//
// Everything the user can change lives in one object that is persisted as a
// whole (userData/settings.json in Electron, localStorage on the web) and
// reloaded on the next start. `normalizeSettings` makes any stored shape —
// an older version, a hand-edited file, nothing at all — safe to use.

export const SETTINGS_VERSION = 1;
export const MAX_RECENT = 10;

export const IMAGE_FORMATS = [
  { id: 'png', ext: 'png', mime: 'image/png', lossy: false },
  { id: 'jpeg', ext: 'jpg', mime: 'image/jpeg', lossy: true },
  { id: 'webp', ext: 'webp', mime: 'image/webp', lossy: true },
  { id: 'bmp', ext: 'bmp', mime: 'image/bmp', lossy: false },
];

export const VIDEO_FPS = [15, 24, 30, 60];

export const DEFAULT_SETTINGS = Object.freeze({
  version: SETTINGS_VERSION,
  language: 'ko',
  theme: 'midnight',
  opacity: 100,
  font: { family: '', size: 13, bold: false, italic: false },
  annotation: { color: '#ff3d3d', strokeWidth: 4, fill: false, fontFamily: '', fontSize: 24, bold: true, italic: false },
  capture: { delay: 0, hideWindow: true, copyToClipboard: false, showCountdown: true },
  image: { format: 'png', quality: 92 },
  video: { format: 'auto', fps: 30, systemAudio: false, microphone: false, minimizeWhileRecording: true, askPath: false, bitrateMbps: 8 },
  paths: { lastOpenDir: '', lastSaveDir: '', lastExportDir: '', videoDir: '' },
  editor: { checkerboard: true, showRulers: false },
  recent: [],
});

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(v, fallback) { return typeof v === 'boolean' ? v : fallback; }
function str(v, fallback) { return typeof v === 'string' ? v : fallback; }

function oneOf(v, list, fallback) { return list.includes(v) ? v : fallback; }

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
    opacity: clampNum(s.opacity, 0, 100, d.opacity),
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
      copyToClipboard: bool(cap.copyToClipboard, d.capture.copyToClipboard),
      showCountdown: bool(cap.showCountdown, d.capture.showCountdown),
    },
    image: {
      format: oneOf(img.format, IMAGE_FORMATS.map((f) => f.id), d.image.format),
      quality: clampNum(img.quality, 10, 100, d.image.quality),
    },
    video: {
      format: str(vid.format, d.video.format),
      fps: oneOf(Number(vid.fps), VIDEO_FPS, d.video.fps),
      systemAudio: bool(vid.systemAudio, d.video.systemAudio),
      microphone: bool(vid.microphone, d.video.microphone),
      minimizeWhileRecording: bool(vid.minimizeWhileRecording, d.video.minimizeWhileRecording),
      askPath: bool(vid.askPath, d.video.askPath),
      bitrateMbps: clampNum(vid.bitrateMbps, 1, 50, d.video.bitrateMbps),
    },
    paths: {
      lastOpenDir: str(paths.lastOpenDir, ''),
      lastSaveDir: str(paths.lastSaveDir, ''),
      lastExportDir: str(paths.lastExportDir, ''),
      videoDir: str(paths.videoDir, ''),
    },
    editor: { checkerboard: bool(ed.checkerboard, d.editor.checkerboard), showRulers: bool(ed.showRulers, d.editor.showRulers) },
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
  if (e === 'jpg' || e === 'jpeg') return IMAGE_FORMATS[1];
  return IMAGE_FORMATS.find((f) => f.ext === e) || null;
}
