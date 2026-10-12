// Renderer-side capture: window stills from a media stream, and screen
// recording through MediaRecorder.
//
// Screens are photographed by the main process (electron/capture.js) at their
// exact pixel size. Windows come through getUserMedia instead, because the
// frames of a desktop stream arrive at the window's own resolution, whereas
// desktopCapturer would stretch a small window to the requested size.

import { platform, isElectron } from './platform.js';
import { grabFrameFromStream } from './image.js';

function desktopConstraints(sourceId, { fps, systemAudio } = {}) {
  const video = { mandatory: { chromeMediaSource: 'desktop' } };
  if (sourceId) video.mandatory.chromeMediaSourceId = sourceId;
  if (fps) { video.mandatory.maxFrameRate = fps; video.mandatory.minFrameRate = Math.min(fps, 5); }
  const audio = systemAudio ? { mandatory: { chromeMediaSource: 'desktop' } } : false;
  return { audio, video };
}

function stopStream(stream) {
  if (!stream) return;
  for (const t of stream.getTracks()) { try { t.stop(); } catch { /* ignore */ } }
}

/** One still of a desktop source (window or screen), at native size. */
export async function grabSourceFrame(sourceId) {
  let stream;
  if (isElectron) {
    stream = await navigator.mediaDevices.getUserMedia(desktopConstraints(sourceId));
  } else {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  }
  try {
    return await grabFrameFromStream(stream);
  } finally {
    stopStream(stream);
  }
}

// ── Recording ─────────────────────────────────────────────

export const VIDEO_MIME_CANDIDATES = [
  { id: 'mp4-h264', mime: 'video/mp4;codecs=avc1', ext: 'mp4', label: 'MP4 (H.264)' },
  { id: 'webm-vp9', mime: 'video/webm;codecs=vp9', ext: 'webm', label: 'WebM (VP9)' },
  { id: 'webm-vp8', mime: 'video/webm;codecs=vp8', ext: 'webm', label: 'WebM (VP8)' },
  { id: 'webm', mime: 'video/webm', ext: 'webm', label: 'WebM' },
];

export function supportedVideoFormats() {
  if (typeof MediaRecorder === 'undefined') return [];
  return VIDEO_MIME_CANDIDATES.filter((c) => { try { return MediaRecorder.isTypeSupported(c.mime); } catch { return false; } });
}

/** Resolves the format setting ('auto' or an id) to a supported entry. */
export function pickVideoFormat(pref) {
  const supported = supportedVideoFormats();
  if (!supported.length) return null;
  if (pref && pref !== 'auto') {
    const hit = supported.find((c) => c.id === pref);
    if (hit) return hit;
  }
  // WebM/VP9 records reliably on every platform; MP4 only where Chromium has a muxer.
  return supported.find((c) => c.id === 'webm-vp9') || supported[0];
}

const even = (n) => Math.max(2, n - (n % 2));

/**
 * A video stream of one window, painted from frames the desktop side
 * photographs. The canvas keeps the size of the first frame; later frames
 * (after the user resizes the window) are scaled into it.
 */
async function windowStream(sourceId, fps, onGone) {
  const token = await platform.rec.windowStart(sourceId, fps);
  let first = null;
  try {
    for (let i = 0; i < 10 && !first; i += 1) first = await platform.rec.windowFrame(token, 500);
  } catch (err) {
    platform.rec.windowStop(token);
    throw err;
  }
  if (!first) {
    platform.rec.windowStop(token);
    throw new Error('The selected window could not be captured. It may be minimized.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = even(first.width);
  canvas.height = even(first.height);
  const ctx = canvas.getContext('2d');
  // Frame rate 0: a frame is emitted only on requestFrame(), right after each paint.
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const paint = async (f) => {
    const bmp = await createImageBitmap(new ImageData(f.data, f.width, f.height));
    const s = Math.min(canvas.width / f.width, canvas.height / f.height);
    const w = Math.round(f.width * s);
    const h = Math.round(f.height * s);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, Math.floor((canvas.width - w) / 2), Math.floor((canvas.height - h) / 2), w, h);
    bmp.close();
    if (track && track.requestFrame) track.requestFrame();
  };
  await paint(first);

  let running = true;
  (async () => {
    while (running) {
      try {
        const f = await platform.rec.windowFrame(token, 1000);
        if (running && f) await paint(f);
      } catch (err) {
        if (!running) break;
        running = false;
        if (String(err && (err.message || err)).includes('window-gone')) onGone();
        break;
      }
    }
  })();

  return {
    stream,
    stop() {
      running = false;
      platform.rec.windowStop(token);
    },
  };
}

/**
 * Starts a screen recording. Chunks are delivered to `onChunk` about once per
 * second; `onEnded` fires if the stream is cut from outside (the user stopped
 * sharing from a browser prompt, or the recorded window closed). Returns a
 * controller. `windowSourceId` records one window from desktop-side frames.
 */
export async function startRecording({ sourceId, windowSourceId, fps = 30, systemAudio = false, microphone = false, format, bitrateMbps = 8, onChunk, onEnded, onError }) {
  if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder is not available.');
  const fmt = pickVideoFormat(format);
  if (!fmt) throw new Error('No supported video encoder was found.');

  let screen;
  let feed = null;
  let stopped = false;
  if (windowSourceId) {
    feed = await windowStream(windowSourceId, fps, () => { if (!stopped && onEnded) onEnded(); });
    screen = feed.stream;
  } else if (isElectron) {
    try {
      screen = await navigator.mediaDevices.getUserMedia(desktopConstraints(sourceId, { fps, systemAudio }));
    } catch (err) {
      if (!systemAudio) throw err;
      // System audio is Windows-only; fall back to video alone elsewhere.
      screen = await navigator.mediaDevices.getUserMedia(desktopConstraints(sourceId, { fps, systemAudio: false }));
    }
  } else {
    screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: fps }, audio: systemAudio });
  }

  let mic = null;
  let micWarning = null;
  if (microphone) {
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    } catch (err) {
      micWarning = err;
    }
  }

  // Mix every audio source into one track; MediaRecorder records a single one.
  let audioCtx = null;
  const tracks = [...screen.getVideoTracks()];
  const audioTracks = [...screen.getAudioTracks(), ...(mic ? mic.getAudioTracks() : [])];
  if (audioTracks.length === 1) {
    tracks.push(audioTracks[0]);
  } else if (audioTracks.length > 1) {
    audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    for (const t of audioTracks) audioCtx.createMediaStreamSource(new MediaStream([t])).connect(dest);
    tracks.push(...dest.stream.getAudioTracks());
  }
  const mixed = new MediaStream(tracks);

  const recorder = new MediaRecorder(mixed, {
    mimeType: fmt.mime,
    videoBitsPerSecond: Math.round(bitrateMbps * 1e6),
    audioBitsPerSecond: 128000,
  });

  const stopPromise = new Promise((resolve) => { recorder.onstop = () => resolve(); });
  recorder.ondataavailable = (e) => { if (e.data && e.data.size && onChunk) onChunk(e.data); };
  recorder.onerror = (e) => { if (onError) onError(e.error || new Error('MediaRecorder error')); };

  const videoTrack = screen.getVideoTracks()[0];
  if (videoTrack) videoTrack.onended = () => { if (!stopped && onEnded) onEnded(); };

  recorder.start(1000);
  const startedAt = Date.now();
  const settings = videoTrack ? videoTrack.getSettings() : {};

  return {
    format: fmt,
    startedAt,
    width: settings.width || 0,
    height: settings.height || 0,
    micWarning,
    get state() { return recorder.state; },
    pause() { if (recorder.state === 'recording') recorder.pause(); },
    resume() { if (recorder.state === 'paused') recorder.resume(); },
    async stop() {
      if (stopped) return;
      stopped = true;
      if (recorder.state !== 'inactive') { try { recorder.requestData(); } catch { /* ignore */ } recorder.stop(); await stopPromise; }
      if (feed) feed.stop();
      stopStream(screen);
      stopStream(mic);
      if (audioCtx) { try { await audioCtx.close(); } catch { /* ignore */ } }
    },
  };
}
