// Video / audio files: recognised by extension (the same list as core/fsops.js
// MEDIA_TYPES) and played from a URL the host streams with Range support —
// the file is never read into the page.
//
//   electron — cc-media://file/?p=<path>   (only if window.commandCenter is present)
//   tauri/web — /api/media?path=<path>[&token=…]   (server/server.js streamMedia)
import { isElectron, apiUrl } from './backend';

export const VIDEO_EXTS = ['mp4', 'm4v', 'webm', 'mkv', 'mov', 'ogv', 'avi', 'mpg', 'mpeg', '3gp', 'ts', 'wmv'];
export const AUDIO_EXTS = ['mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'weba', 'wma', 'aif', 'aiff', 'mid', 'midi'];
const VIDEO = new Set(VIDEO_EXTS), AUDIO = new Set(AUDIO_EXTS);

const extOf = (name) => { const i = String(name || '').lastIndexOf('.'); return i < 0 ? '' : name.slice(i + 1).toLowerCase(); };
export function isVideoName(name) { return VIDEO.has(extOf(name)); }
export function isAudioName(name) { return AUDIO.has(extOf(name)); }
export function isMediaName(name) { return isVideoName(name) || isAudioName(name); }

// The URL the <video> / <audio> element plays (and the PDF frame shows).
export function mediaUrl(path) {
  if (isElectron) return `cc-media://file/?p=${encodeURIComponent(path)}`;
  // Web and Tauri both stream from the Node core (Tauri's origin is the sidecar, not the page).
  return apiUrl('api/media', { path });
}

// m:ss / h:mm:ss for a duration in seconds.
export function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '–:––';
  const s = Math.floor(sec % 60), m = Math.floor(sec / 60) % 60, h = Math.floor(sec / 3600);
  const two = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}
