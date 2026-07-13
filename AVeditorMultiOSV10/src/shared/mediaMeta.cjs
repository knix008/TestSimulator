'use strict';
/**
 * Shared MediaInfo → File Info normalization (Electron main + web shim).
 * Keep field names / semantics identical across platforms.
 */

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getTrackCodec(track) {
  if (!track) return null;
  const parts = [track.Format, track.Format_Profile || track.Format_AdditionalFeatures].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

/** Parse MediaInfo date strings like "UTC 2012-03-13 08:58:06". */
function parseMediaInfoDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const cleaned = raw.replace(/^UTC\s+/i, '').replace(/\s+UTC$/i, '');
  const ms = Date.parse(cleaned.includes('T') ? cleaned : cleaned.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

const VIDEO_EXTS = new Set([
  '.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv', '.m4v', '.ts', '.mts',
]);
const AUDIO_EXTS = new Set([
  '.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.wma', '.opus', '.aiff',
]);

/**
 * @param {object} raw MediaInfo object result
 * @param {object} meta { name, path, size, extension, modified?, created? }
 */
function normalizeMediaInfo(raw, meta = {}) {
  const tracks = raw?.media?.track || [];
  const general = tracks.find((track) => track['@type'] === 'General') || null;
  const video = tracks.find((track) => track['@type'] === 'Video') || null;
  const audioTracks = tracks.filter((track) => track['@type'] === 'Audio');
  const audio = audioTracks[0] || null;

  const ext = String(meta.extension || '').toLowerCase()
    || (() => {
      const n = String(meta.name || meta.path || '');
      const i = n.lastIndexOf('.');
      return i >= 0 ? n.slice(i).toLowerCase() : '';
    })();

  const fileSize = toFiniteNumber(general?.FileSize) || toFiniteNumber(meta.size) || 0;
  const hasVideo = !!video;
  const hasAudio = !!audio;
  const isVideo = hasVideo || (VIDEO_EXTS.has(ext) && !hasAudio);
  const isAudio = (!hasVideo && hasAudio) || (AUDIO_EXTS.has(ext) && !hasVideo);

  return {
    name: meta.name || null,
    path: meta.path || null,
    size: fileSize || meta.size || 0,
    extension: ext,
    isVideo,
    isAudio,
    containerFormat: general?.Format || null,
    duration: toFiniteNumber(video?.Duration ?? audio?.Duration ?? general?.Duration),
    width: toFiniteNumber(video?.Width),
    height: toFiniteNumber(video?.Height),
    fps: toFiniteNumber(video?.FrameRate ?? general?.FrameRate),
    sampleRate: toFiniteNumber(audio?.SamplingRate),
    channels: toFiniteNumber(audio?.Channels),
    bitrate: toFiniteNumber(video?.BitRate ?? audio?.BitRate ?? general?.OverallBitRate),
    overallBitrate: toFiniteNumber(general?.OverallBitRate),
    codec: getTrackCodec(video || audio),
    videoCodec: getTrackCodec(video),
    audioCodec: getTrackCodec(audio),
    modified: meta.modified
      || parseMediaInfoDate(general?.File_Modified_Date)
      || parseMediaInfoDate(general?.Tagged_Date)
      || null,
    created: meta.created
      || parseMediaInfoDate(general?.Encoded_Date)
      || parseMediaInfoDate(general?.File_Created_Date)
      || null,
  };
}

module.exports = {
  toFiniteNumber,
  getTrackCodec,
  parseMediaInfoDate,
  normalizeMediaInfo,
  VIDEO_EXTS,
  AUDIO_EXTS,
};
