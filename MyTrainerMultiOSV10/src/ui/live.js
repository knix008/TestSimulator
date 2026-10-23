// Live input for the Test tab: the microphone (speech models), the webcam (picture and motion-clip
// models) and video files. Every source becomes a raw input made exactly like the training data
// (speech: the loudest second at 8 kHz → mel spectrogram; pictures: the model's size and channels;
// clips: frames × size × size grey), so the app can preprocess it and ask the engine.
import { resampleWave, soundFeatures, speechWindow } from '../domain/datasets-media.js';

const mean = (values) => { let s = 0; for (const v of values) s += v; return s / Math.max(1, values.length); };

// ───────────────────────── microphone

/** The microphone: the last two seconds kept in a ring buffer, the current level in 0…1. */
export class LiveMicrophone {
  constructor() { this.stream = null; this.context = null; this.level = 0; this.gainValue = 1; }

  /** Input gain (sensitivity): the recording is multiplied by it before anything else. */
  setGain(value) {
    this.gainValue = value;
    if (this.gain) this.gain.gain.value = value;
  }

  get on() { return Boolean(this.stream); }

  async start() {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('live.noDevices');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
    this.context = new AudioContext();
    this.rate = this.context.sampleRate;
    this.ring = new Float32Array(Math.round(this.rate * 2));
    this.pos = 0;
    const source = this.context.createMediaStreamSource(this.stream);
    // A ScriptProcessor is enough here (and needs no extra module file); its output stays silent.
    this.node = this.context.createScriptProcessor(2048, 1, 1);
    this.node.onaudioprocess = (event) => {
      const data = event.inputBuffer.getChannelData(0);
      let energy = 0;
      for (let i = 0; i < data.length; i++) { this.ring[this.pos] = data[i]; this.pos = (this.pos + 1) % this.ring.length; energy += data[i] * data[i]; }
      this.level = Math.min(1, Math.sqrt(energy / data.length) * 6);
      this.onLevel?.(this.level);
    };
    this.gain = this.context.createGain();
    this.gain.gain.value = this.gainValue;
    source.connect(this.gain);
    this.gain.connect(this.node);
    this.node.connect(this.context.destination);
  }

  stop() {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.context?.close().catch(() => {});
    this.stream = null; this.context = null; this.node = null; this.gain = null; this.level = 0;
  }

  /** Loudness (RMS, after the gain) of the last `seconds`. */
  rms(seconds = 0.05) {
    const n = Math.min(this.ring.length, Math.round(this.rate * seconds));
    let sum = 0;
    for (let i = 0; i < n; i++) { const v = this.ring[(this.pos - n + i + this.ring.length) % this.ring.length]; sum += v * v; }
    return Math.sqrt(sum / n);
  }

  /**
   * Waits for one spoken word: sound louder than `threshold`, then `silence` seconds of quiet (or `longest`
   * seconds of sound). Returns how many seconds back the word began (plus a margin), or null when nothing was
   * said within `timeout` seconds or `cancelled()` turns true. A word is judged whole, never half of it.
   */
  async utterance(threshold, { timeout = 4, silence = 0.3, longest = 1.6, cancelled = () => false } = {}) {
    const started = performance.now();
    let onset = null; let quietSince = null;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 40));
      if (cancelled() || !this.stream) return null;
      const now = performance.now();
      // The ring holds the signal after the gain; the threshold is for the 8 kHz window (the same scale).
      if (this.rms(0.05) > threshold) { onset ??= now; quietSince = null; } else if (onset != null) quietSince ??= now;
      if (onset != null && ((quietSince != null && now - quietSince >= silence * 1000) || now - onset >= longest * 1000)) return (now - onset) / 1000 + 0.25;
      if (onset == null && timeout && now - started > timeout * 1000) return null;
    }
  }

  /** The last `seconds` of sound resampled (band-limited, like the training clips) to `rate` Hz. */
  async last(seconds, rate) {
    const n = Math.min(this.ring.length, Math.round(this.rate * seconds));
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) raw[i] = this.ring[(this.pos - n + i + this.ring.length) % this.ring.length];
    return resampleWave(raw, this.rate, rate);
  }
}

/**
 * A recording → the model's input: the `seconds` window centred on the speech (peak-normalised, as the
 * training clips are made), its features, and whether it is loud enough to be speech at all.
 */
export function speechInput(recorded, media, threshold = 0.012) {
  const { wave, rms } = speechWindow(recorded, media.rate, media.seconds ?? 0.6);
  return { raw: soundFeatures(wave, media), wave, rms, loud: rms > threshold };
}

// ───────────────────────── webcam

/** The webcam on a <video> element kept by the app (it survives re-rendering of the Test tab). */
export class LiveCamera {
  constructor() {
    this.video = document.createElement('video');
    this.video.className = 'live-video';
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.autoplay = true;
    this.stream = null;
  }

  get on() { return Boolean(this.stream); }

  async start() {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('live.noDevices');
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
  }

  stop() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.video.srcObject = null;
    this.stream = null;
  }

  /** The current frame, or null before the first one arrived. */
  frame() {
    return this.video.videoWidth ? this.video : null;
  }
}

/**
 * Any drawable (bitmap, video, canvas) → the model's picture input: height × width × channels in 0…1.
 * fit 'contain' keeps the whole picture (files), 'cover' crops the middle square (webcam).
 * Grey pictures are inverted when their background is the opposite of the training pictures'.
 */
export function pictureFrom(drawable, srcW, srcH, data, { fit = 'contain', background = '#fff' } = {}) {
  const [h, w, channels] = data.inputShape;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  const scale = fit === 'cover' ? Math.max(w / srcW, h / srcH) : Math.min(w / srcW, h / srcH);
  const dw = srcW * scale; const dh = srcH * scale;
  ctx.drawImage(drawable, (w - dw) / 2, (h - dh) / 2, dw, dh);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const out = new Float32Array(h * w * channels);
  for (let p = 0; p < h * w; p++) {
    if (channels === 3) for (let c = 0; c < 3; c++) out[p * 3 + c] = rgba[p * 4 + c] / 255;
    else {
      const grey = (0.299 * rgba[p * 4] + 0.587 * rgba[p * 4 + 1] + 0.114 * rgba[p * 4 + 2]) / 255;
      for (let c = 0; c < channels; c++) out[p * channels + c] = grey;
    }
  }
  let inverted = false;
  if (channels === 1) {
    const trainingMean = mean(data.x.subarray(0, Math.min(data.x.length, 200000)));
    if ((mean(out) > 0.5) !== (trainingMean > 0.5)) {
      for (let i = 0; i < out.length; i++) out[i] = 1 - out[i];
      inverted = true;
    }
  }
  return { raw: out, inverted };
}

// ───────────────────────── motion clips (webcam or video file)

/** Frames (drawables with their sizes) → a clip in the training layout ('seq' or 'stack'). */
export function clipFrom(frames, data) {
  const { frames: count, size, layout } = data.media;
  const greys = frames.slice(0, count).map(({ image, width, height }) => {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const scale = Math.max(size / width, size / height);
    ctx.drawImage(image, (size - width * scale) / 2, (size - height * scale) / 2, width * scale, height * scale);
    const rgba = ctx.getImageData(0, 0, size, size).data;
    return Float32Array.from({ length: size * size }, (_, p) => (0.299 * rgba[p * 4] + 0.587 * rgba[p * 4 + 1] + 0.114 * rgba[p * 4 + 2]) / 255);
  });
  while (greys.length < count) greys.push(greys.at(-1) ?? new Float32Array(size * size));
  // Training clips are a bright shape on a dark background: a mostly bright camera picture is inverted.
  const trainingMean = mean(data.x.subarray(0, Math.min(data.x.length, 200000)));
  const invert = (mean(greys.flatMap((g) => Array.from(g))) > 0.5) !== (trainingMean > 0.5);
  const raw = new Float32Array(count * size * size);
  greys.forEach((grey, f) => {
    for (let p = 0; p < size * size; p++) {
      const v = invert ? 1 - grey[p] : grey[p];
      if (layout === 'seq') raw[f * size * size + p] = v; else raw[p * count + f] = v;
    }
  });
  return { raw, inverted: invert };
}

/** `count` frames spread over a video file (bytes) → [{ image, width, height }]. */
export async function videoFileFrames(bytes, count) {
  const url = URL.createObjectURL(new Blob([bytes]));
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(new Error('live.videoUnreadable')); });
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const frames = [];
    for (let i = 0; i < count; i++) {
      video.currentTime = Math.min(duration - 0.01, ((i + 0.5) / count) * duration);
      await new Promise((resolve) => { video.onseeked = resolve; });
      frames.push({ image: await createImageBitmap(video), width: video.videoWidth, height: video.videoHeight });
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}
