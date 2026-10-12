// Renderer-side capture: window stills from a media stream, and screen
// recording through MediaRecorder.
//
// Screens are photographed by the main process (electron/capture.js) at their
// exact pixel size. Windows come through getUserMedia instead, because the
// frames of a desktop stream arrive at the window's own resolution, whereas
// desktopCapturer would stretch a small window to the requested size.

import { platform, isElectron, isTauri } from './platform.js';
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

// The audio codec only matters when sound is recorded; MP4 gets AAC for
// players that do not know Opus in MP4.
export const VIDEO_MIME_CANDIDATES = [
  { id: 'mp4-h264', mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4', label: 'MP4 (H.264 · AAC)' },
  { id: 'mp4-vp9', mime: 'video/mp4;codecs=vp9,opus', ext: 'mp4', label: 'MP4 (VP9 · Opus)' },
  { id: 'mp4-av1', mime: 'video/mp4;codecs=av01,opus', ext: 'mp4', label: 'MP4 (AV1 · Opus)' },
  { id: 'webm-vp9', mime: 'video/webm;codecs=vp9,opus', ext: 'webm', label: 'WebM (VP9 · Opus)' },
  { id: 'webm-vp8', mime: 'video/webm;codecs=vp8,opus', ext: 'webm', label: 'WebM (VP8 · Opus)' },
  { id: 'webm-av1', mime: 'video/webm;codecs=av1,opus', ext: 'webm', label: 'WebM (AV1 · Opus)' },
  { id: 'mkv-h264', mime: 'video/x-matroska;codecs=avc1,opus', ext: 'mkv', label: 'MKV (H.264 · Opus)' },
  { id: 'mkv-vp9', mime: 'video/x-matroska;codecs=vp9,opus', ext: 'mkv', label: 'MKV (VP9 · Opus)' },
  { id: 'mkv-av1', mime: 'video/x-matroska;codecs=av1,opus', ext: 'mkv', label: 'MKV (AV1 · Opus)' },
  { id: 'webm', mime: 'video/webm', ext: 'webm', label: 'WebM' },
];

/** Recorded and encoded on the desktop side; no sound. */
export const GIF_FORMAT = { id: 'gif', mime: 'image/gif', ext: 'gif', label: 'GIF', labelKey: 'format.gifAnimated', gif: true };
export const GIF_MAX_FPS = 20;
export const GIF_MAX_WIDTH = 1280;

export function supportedVideoFormats() {
  const list = typeof MediaRecorder === 'undefined' ? []
    : VIDEO_MIME_CANDIDATES.filter((c) => { try { return MediaRecorder.isTypeSupported(c.mime); } catch { return false; } });
  return isTauri ? [...list, GIF_FORMAT] : list;
}

/** Resolves the format setting ('auto' or an id) to a supported entry. */
export function pickVideoFormat(pref) {
  const supported = supportedVideoFormats();
  if (pref && pref !== 'auto') {
    const hit = supported.find((c) => c.id === pref);
    if (hit) return hit;
  }
  // WebM/VP9 records reliably on every platform; MP4 only where Chromium has a muxer.
  return supported.find((c) => c.id === 'webm-vp9') || supported.find((c) => !c.gif) || null;
}

/** An animated GIF recording of a screen or window ("screen:<id>" / "window:<id>"). */
export async function startGifRecording({ sourceId, path, fps, onEnded }) {
  const token = await platform.rec.gifStart(sourceId, path, Math.min(fps, GIF_MAX_FPS), GIF_MAX_WIDTH);
  let stopped = false;
  let ended = false;
  const watch = setInterval(async () => {
    if (stopped || ended) return;
    if (await platform.rec.gifGone(token).catch(() => false)) {
      ended = true;
      if (!stopped && onEnded) onEnded();
    }
  }, 1000);
  const controller = {
    format: GIF_FORMAT,
    startedAt: Date.now(),
    width: 0,
    height: 0,
    micWarning: null,
    result: null,
    pause() { platform.rec.gifPause(token, true); },
    resume() { platform.rec.gifPause(token, false); },
    async stop() {
      if (stopped) return controller.result;
      stopped = true;
      clearInterval(watch);
      controller.result = await platform.rec.gifStop(token, path);
      controller.width = controller.result.width;
      controller.height = controller.result.height;
      return controller.result;
    },
  };
  return controller;
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
 * The part of a desktop stream that shows one monitor. Without the browser's
 * picker the desktop side hands over the whole desktop; when that spans
 * several monitors, the chosen one is cut out on a canvas. `display` is
 * `{ bounds, screens: [bounds…] }` in physical pixels.
 */
async function monitorStream(stream, display, fps) {
  const track = stream.getVideoTracks()[0];
  const set = track ? track.getSettings() : {};
  if (!display || !display.bounds || !display.screens || display.screens.length < 2 || !set.width) return { stream, stop() {} };
  const b = display.bounds;
  const minX = Math.min(...display.screens.map((s) => s.x));
  const minY = Math.min(...display.screens.map((s) => s.y));
  const vw = Math.max(...display.screens.map((s) => s.x + s.width)) - minX;
  const vh = Math.max(...display.screens.map((s) => s.y + s.height)) - minY;
  // Only a stream of the whole desktop can be cropped; anything else is used as it is.
  if (Math.abs(set.width / set.height - vw / vh) > 0.01 || (set.width === b.width && set.height === b.height)) return { stream, stop() {} };
  const k = set.width / vw;
  const src = { x: (b.x - minX) * k, y: (b.y - minY) * k, w: b.width * k, h: b.height * k };

  const video = document.createElement('video');
  video.muted = true;
  video.srcObject = new MediaStream([track]);
  await video.play();
  const canvas = document.createElement('canvas');
  canvas.width = even(Math.round(src.w));
  canvas.height = even(Math.round(src.h));
  const ctx = canvas.getContext('2d');
  const out = canvas.captureStream(fps);
  let running = true;
  const paint = () => {
    if (!running) return;
    ctx.drawImage(video, src.x, src.y, src.w, src.h, 0, 0, canvas.width, canvas.height);
    video.requestVideoFrameCallback(paint);
  };
  video.requestVideoFrameCallback(paint);
  for (const a of stream.getAudioTracks()) out.addTrack(a);
  return {
    stream: out,
    stop() { running = false; video.srcObject = null; out.getVideoTracks().forEach((t) => t.stop()); },
  };
}

/**
 * Opens a microphone. A remembered device that is no longer there falls back
 * to the default one (`ideal`, not `exact`).
 */
export function openMicrophone({ deviceId = '', echoCancellation = true, noiseSuppression = true, autoGainControl = false } = {}) {
  const audio = { echoCancellation, noiseSuppression, autoGainControl };
  if (deviceId) audio.deviceId = { ideal: deviceId };
  return navigator.mediaDevices.getUserMedia({ audio, video: false });
}

/**
 * Audio inputs: `{ devices: [{ deviceId, label }], defaultLabel }`. Labels
 * need one granted request first.
 */
export async function listMicrophones() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return { devices: [], defaultLabel: '' };
  const inputs = async () => (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  let list = await inputs();
  if (list.length && list.every((d) => !d.label)) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      s.getTracks().forEach((t) => t.stop());
      list = await inputs();
    } catch { /* leave the labels empty */ }
  }
  // 'default' / 'communications' are aliases of real devices; the empty id stands for the default.
  const alias = (id) => id === 'default' || id === 'communications';
  const def = list.find((d) => d.deviceId === 'default');
  return {
    devices: list.filter((d) => d.deviceId && !alias(d.deviceId)).map((d) => ({ deviceId: d.deviceId, label: d.label })),
    defaultLabel: def ? def.label.replace(/^[^-]*-\s*/, '') : '',
  };
}

/** System sound alone: for a window recording, whose picture comes from elsewhere, and for the settings test. */
export async function systemAudioStream() {
  const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  for (const v of s.getVideoTracks()) v.stop();
  if (!s.getAudioTracks().length) throw new Error('No system sound track was offered.');
  return new MediaStream(s.getAudioTracks());
}

/**
 * Starts a screen recording. Chunks are delivered to `onChunk` about once per
 * second; `onEnded` fires if the stream is cut from outside (the user stopped
 * sharing from a browser prompt, or the recorded window closed). Returns a
 * controller. `windowSourceId` records one window from desktop-side frames.
 */
export async function startRecording({ sourceId, windowSourceId, display, fps = 30, systemAudio = false, systemAudioGain = 1, microphone = false, format, bitrateMbps = 8, onChunk, onEnded, onError }) {
  if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder is not available.');
  const fmt = pickVideoFormat(format);
  if (!fmt) throw new Error('No supported video encoder was found.');

  let screen;
  let raw = null;       // the desktop stream before cropping (its video track tells when sharing ends)
  let feed = null;
  let crop = null;
  let sound = null;     // system sound for a window recording
  let audioWarning = null;
  let stopped = false;
  if (windowSourceId) {
    feed = await windowStream(windowSourceId, fps, () => { if (!stopped && onEnded) onEnded(); });
    screen = feed.stream;
    if (systemAudio) {
      try { sound = await systemAudioStream(); } catch (err) { audioWarning = err; }
    }
  } else if (isTauri) {
    try {
      raw = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: fps }, audio: systemAudio });
      if (systemAudio && !raw.getAudioTracks().length) audioWarning = new Error('No system sound track was offered.');
    } catch (err) {
      if (!systemAudio) throw err;
      audioWarning = err;
      raw = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: fps }, audio: false });
    }
    crop = await monitorStream(raw, display, fps);
    screen = crop.stream;
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
  const micOpts = microphone === true ? {} : microphone || null;
  if (micOpts) {
    try {
      mic = await openMicrophone(micOpts);
    } catch (err) {
      micWarning = err;
    }
  }
  const micGain = micOpts && Number.isFinite(micOpts.gain) ? micOpts.gain : 1;

  // Mix every audio source into one track; MediaRecorder records a single one.
  let audioCtx = null;
  const tracks = [...screen.getVideoTracks()];
  const sysGain = Number.isFinite(systemAudioGain) ? systemAudioGain : 1;
  const sources = [...screen.getAudioTracks(), ...(sound ? sound.getAudioTracks() : [])].map((t) => ({ t, gain: sysGain }));
  if (mic) sources.push(...mic.getAudioTracks().map((t) => ({ t, gain: micGain })));
  if (sources.length === 1 && sources[0].gain === 1) {
    tracks.push(sources[0].t);
  } else if (sources.length) {
    audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {});
    const dest = audioCtx.createMediaStreamDestination();
    for (const { t, gain } of sources) {
      const node = audioCtx.createGain();
      node.gain.value = gain;
      audioCtx.createMediaStreamSource(new MediaStream([t])).connect(node).connect(dest);
    }
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
  const sourceTrack = raw ? raw.getVideoTracks()[0] : videoTrack;
  if (sourceTrack) sourceTrack.onended = () => { if (!stopped && onEnded) onEnded(); };

  recorder.start(1000);
  const startedAt = Date.now();
  const settings = videoTrack ? videoTrack.getSettings() : {};

  return {
    format: fmt,
    startedAt,
    width: settings.width || 0,
    height: settings.height || 0,
    micWarning,
    audioWarning,
    get state() { return recorder.state; },
    pause() { if (recorder.state === 'recording') recorder.pause(); },
    resume() { if (recorder.state === 'paused') recorder.resume(); },
    async stop() {
      if (stopped) return;
      stopped = true;
      if (recorder.state !== 'inactive') { try { recorder.requestData(); } catch { /* ignore */ } recorder.stop(); await stopPromise; }
      if (feed) feed.stop();
      if (crop) crop.stop();
      stopStream(screen);
      stopStream(raw);
      stopStream(sound);
      stopStream(mic);
      if (audioCtx) { try { await audioCtx.close(); } catch { /* ignore */ } }
    },
  };
}
