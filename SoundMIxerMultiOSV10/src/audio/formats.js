/**
 * Supported import formats (Chromium / Electron Web Audio decodeAudioData).
 * WAVE, MP3, OGG/Opus, FLAC, AAC/M4A, AIFF, WebM 등
 */
export const AUDIO_EXTENSIONS = [
  'wav',
  'wave',
  'mp3',
  'mp2',
  'mpga',
  'mpeg',
  'ogg',
  'oga',
  'opus',
  'flac',
  'aac',
  'm4a',
  'm4b',
  'mp4',
  'webm',
  'weba',
  'aiff',
  'aif',
  'aifc',
  'caf',
  '3gp',
  '3g2'
];

export const AUDIO_MIME_PREFIXES = [
  'audio/',
  'video/webm',
  'video/mp4',
  'video/ogg',
  'video/3gpp'
];

const EXT_SET = new Set(AUDIO_EXTENSIONS);

export function getExtension(filename = '') {
  const match = String(filename).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

export function isSupportedAudioFile(fileOrName, mimeType = '') {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName?.name || '';
  const mime = (mimeType || (typeof fileOrName === 'object' ? fileOrName?.type : '') || '').toLowerCase();
  const ext = getExtension(name);

  if (ext && EXT_SET.has(ext)) return true;
  if (mime && AUDIO_MIME_PREFIXES.some((p) => mime.startsWith(p))) return true;
  return false;
}

/** HTML file input accept attribute */
export function getAcceptAttribute() {
  const byExt = AUDIO_EXTENSIONS.map((e) => `.${e}`).join(',');
  return `audio/*,audio/wav,audio/wave,audio/x-wav,audio/mpeg,audio/mp3,audio/ogg,audio/flac,audio/aac,audio/mp4,audio/x-m4a,audio/webm,audio/aiff,audio/x-aiff,${byExt}`;
}

/** Electron dialog filters */
export function getElectronOpenFilters() {
  return [
    {
      name: 'Audio Files',
      extensions: [...AUDIO_EXTENSIONS]
    },
    { name: 'WAVE', extensions: ['wav', 'wave'] },
    { name: 'MP3', extensions: ['mp3', 'mp2', 'mpga', 'mpeg'] },
    { name: 'AAC / M4A', extensions: ['aac', 'm4a', 'm4b', 'mp4'] },
    { name: 'OGG / Opus', extensions: ['ogg', 'oga', 'opus'] },
    { name: 'FLAC', extensions: ['flac'] },
    { name: 'AIFF', extensions: ['aiff', 'aif', 'aifc'] },
    { name: 'WebM', extensions: ['webm', 'weba'] },
    { name: 'All Files', extensions: ['*'] }
  ];
}

export function formatListLabel() {
  return 'WAV, MP3, OGG, FLAC, AAC, M4A, AIFF, WebM…';
}
