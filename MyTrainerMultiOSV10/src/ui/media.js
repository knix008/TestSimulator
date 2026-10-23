// Speech and video samples in the views: a spectrogram picture (frequency up, time right) with
// playback of the sample's sound, and a strip of a clip's frames.
import { videoFrames } from '../domain/datasets-media.js';
import { drawHeatmap, drawPicture, range } from './charts.js';

let audioContext = null;
let playing = null;

/** Plays a waveform (Float32Array) at its sample rate; a new sound stops the one playing. */
export function playWave(wave, rate) {
  if (!wave) return;
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume();
    playing?.stop();
    const buffer = audioContext.createBuffer(1, wave.length, rate);
    buffer.copyToChannel(wave instanceof Int16Array ? Float32Array.from(wave, (v) => v / 32767) : Float32Array.from(wave), 0);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start();
    playing = source;
  } catch { /* no audio output */ }
}

/** A spectrogram sample: [bands, frames, 1] (picture layout) or [frames, bands] (sequence layout). */
export function drawSpectrogram(ctx, values, shape, x, y, w, h, dark = false) {
  if (shape.length === 3) {
    drawPicture(ctx, values, shape, x, y, w, h, { map: 'magma', dark });
    return;
  }
  const [frames, bands] = shape;
  const picture = new Float32Array(frames * bands);
  for (let f = 0; f < frames; f++) for (let b = 0; b < bands; b++) picture[(bands - 1 - b) * frames + f] = values[f * bands + b];
  const r = range(picture);
  drawHeatmap(ctx, picture, bands, frames, x, y, w, h, { min: r.min, max: r.max, map: 'magma', dark });
}

/** A clip's frames side by side in a row. Returns the width used. */
export function drawFrameStrip(ctx, values, media, x, y, frameSize, gap = 2, dark = false) {
  const frames = videoFrames(values, media);
  const r = range(values);
  frames.forEach((frame, f) => {
    drawHeatmap(ctx, frame, media.size, media.size, x + f * (frameSize + gap), y, frameSize, frameSize, { min: r.min, max: r.max, map: 'gray', dark });
  });
  return frames.length * (frameSize + gap) - gap;
}

/** Draws a small "play" triangle in a corner of a tile. */
export function drawPlayBadge(ctx, x, y, size = 14) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(x + size * 0.38, y + size * 0.28); ctx.lineTo(x + size * 0.74, y + size / 2); ctx.lineTo(x + size * 0.38, y + size * 0.72); ctx.closePath(); ctx.fill();
  ctx.restore();
}
