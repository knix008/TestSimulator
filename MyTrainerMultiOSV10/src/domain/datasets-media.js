// Recognition datasets, all generated from a seed (offline, the same every time):
//   speech  — keywords (yes, no, up, down, left, right) made by formant synthesis, turned into
//             log-mel spectrograms (a picture: frequency × time, or a sequence of frames)
//   objects — 32×32 colour pictures of a house, tree, car, sun, boat and fish
//   letters — hand-drawn-style capital letters A–Z; hangul — Korean consonants ㄱ … ㅎ
//   video   — short clips of a moving ball (right, left, up, down, growing, shrinking), as a
//             sequence of frames or with the frames stacked as channels
// A dataset may carry `media` describing how to show / play a sample (audio waves, frames).
import { makeDataset, rasterize, rng } from './datasets-core.js';

const classification = (classes) => ({ kind: 'classification', classes, binaryOutput: classes === 2 ? 1 : classes });

// ───────────────────────── speech

export const SPEECH_WORDS = ['yes', 'no', 'up', 'down', 'left', 'right'];
const RATE = 8000;
const DURATION = 0.6;

/**
 * Each word is a list of segments: v = voiced (formants F1, F2 moving from `from` to `to`),
 * n = nasal (low, quiet voiced), f = fricative (noise band), b = burst (very short noise), s = silence.
 */
const WORDS = {
  yes: [['v', 0.10, [300, 2200], [500, 1850], 0.7], ['v', 0.13, [550, 1800], [550, 1750], 1], ['f', 0.14, [2800, 3800], 0.5]],
  no: [['n', 0.07, [250, 900]], ['v', 0.24, [520, 880], [430, 780], 1]],
  up: [['v', 0.18, [680, 1220], [640, 1180], 1], ['s', 0.05], ['b', 0.025, [500, 3000], 0.8]],
  down: [['b', 0.02, [300, 3500], 0.7], ['v', 0.25, [720, 1180], [430, 850], 1], ['n', 0.07, [250, 1000]]],
  left: [['v', 0.06, [350, 1000], [450, 1500], 0.6], ['v', 0.12, [560, 1800], [560, 1750], 1], ['f', 0.10, [1400, 3400], 0.45], ['b', 0.02, [500, 3000], 0.6]],
  right: [['v', 0.08, [350, 1150], [600, 1300], 0.7], ['v', 0.2, [720, 1200], [350, 2200], 1], ['b', 0.02, [500, 3000], 0.6]],
};

function bandpass(signal, centre, q, rate) {
  // A biquad band-pass filter (RBJ cookbook).
  const w = (2 * Math.PI * centre) / rate;
  const alpha = Math.sin(w) / (2 * q);
  const b0 = alpha; const b2 = -alpha;
  const a0 = 1 + alpha; const a1 = -2 * Math.cos(w); const a2 = 1 - alpha;
  const out = new Float32Array(signal.length);
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  for (let i = 0; i < signal.length; i++) {
    const x = signal[i];
    const y = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    out[i] = y; x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return out;
}

/** One spoken keyword as a waveform (RATE Hz, DURATION s): random pitch, speed, loudness, start and noise. */
export function synthesizeWord(word, r) {
  const n = Math.round(RATE * DURATION);
  const wave = new Float32Array(n);
  const speed = 0.8 + r() * 0.4;
  const pitch = 100 + r() * 140;
  const formantShift = 0.9 + r() * 0.2;
  const total = WORDS[word].reduce((sum, seg) => sum + seg[1] * speed, 0);
  let t = Math.round((0.03 + r() * Math.max(0, DURATION - total - 0.06)) * RATE);
  const phases = new Float64Array(41);
  for (const [type, durationS, a, b, gainRaw] of WORDS[word]) {
    const length = Math.round(durationS * speed * RATE);
    if (type === 's') { t += length; continue; }
    if (type === 'f' || type === 'b') {
      const noise = Float32Array.from({ length }, () => r() * 2 - 1);
      const [lo, hi] = a;
      const filtered = bandpass(noise, (lo + hi) / 2, (lo + hi) / 2 / (hi - lo) + 0.3, RATE);
      const gain = (b ?? 0.5) * (type === 'b' ? 1.2 : 1);
      for (let i = 0; i < length && t + i < n; i++) {
        const env = Math.sin((Math.PI * i) / length);
        wave[t + i] += filtered[i] * gain * env * 2.2;
      }
      t += length;
      continue;
    }
    const nasal = type === 'n';
    const from = (nasal ? a : a).map((f) => f * formantShift);
    const to = (nasal ? a : b).map((f) => f * formantShift);
    const gain = nasal ? 0.35 : gainRaw ?? 1;
    const block = 80;
    for (let start = 0; start < length; start += block) {
      const k = start / Math.max(1, length);
      const f1 = from[0] + (to[0] - from[0]) * k;
      const f2 = from[1] + (to[1] - from[1]) * k;
      const f0 = pitch * (1.05 - 0.15 * ((t + start) / n));
      const harmonics = Math.min(40, Math.floor((RATE / 2 - 100) / f0));
      const weights = new Float64Array(harmonics + 1);
      for (let h = 1; h <= harmonics; h++) {
        const f = h * f0;
        weights[h] = (Math.exp(-(((f - f1) / 110) ** 2)) + 0.6 * Math.exp(-(((f - f2) / 160) ** 2)) + 0.05) / Math.sqrt(h);
      }
      for (let i = start; i < Math.min(length, start + block); i++) {
        if (t + i >= n) break;
        const env = Math.min(1, i / 120, (length - i) / 120);
        let s = 0;
        for (let h = 1; h <= harmonics; h++) {
          phases[h] += (2 * Math.PI * h * f0) / RATE;
          s += weights[h] * Math.sin(phases[h]);
        }
        wave[t + i] += s * gain * env * 0.5;
      }
    }
    t += length;
  }
  const noise = 0.01 + r() * 0.04;
  const loud = 0.5 + r() * 0.5;
  for (let i = 0; i < n; i++) wave[i] = wave[i] * loud + (r() * 2 - 1) * noise;
  let peak = 0;
  for (const v of wave) peak = Math.max(peak, Math.abs(v));
  if (peak > 0.99) for (let i = 0; i < n; i++) wave[i] /= peak / 0.99;
  return wave;
}

/** Bit-reversal order and twiddle factors per FFT size (made once). */
const fftTables = new Map();
function fftTable(n) {
  if (fftTables.has(n)) return fftTables.get(n);
  const reverse = new Uint32Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    reverse[i] = j;
  }
  const cos = new Float64Array(n / 2); const sin = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) { cos[k] = Math.cos((-2 * Math.PI * k) / n); sin[k] = Math.sin((-2 * Math.PI * k) / n); }
  const table = { reverse, cos, sin };
  fftTables.set(n, table);
  return table;
}

/** In-place radix-2 FFT (n a power of two). */
function fft(re, im) {
  const n = re.length;
  const { reverse, cos, sin } = fftTable(n);
  for (let i = 1; i < n; i++) {
    const j = reverse[i];
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1; const step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const c = cos[k * step]; const s = sin[k * step];
        const a = i + k; const b = a + half;
        const ar = re[b] * c - im[b] * s;
        const ai = re[b] * s + im[b] * c;
        re[b] = re[a] - ar; im[b] = im[a] - ai;
        re[a] += ar; im[a] += ai;
      }
    }
  }
}

const mel = (f) => 2595 * Math.log10(1 + f / 700);
const melInverse = (m) => 700 * (10 ** (m / 2595) - 1);

/** Log-mel spectrogram: frames × bands values scaled to 0…1 (frame 256, hop 144 → 32 frames of 0.6 s). */
/** The Hann window and the triangular mel filters (as bin ranges with weights), made once per size. */
const melTables = new Map();
function melTable(bands, size) {
  const key = `${bands}:${size}`;
  if (melTables.has(key)) return melTables.get(key);
  const window = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  const edges = Array.from({ length: bands + 2 }, (_, i) => melInverse(mel(80) + ((mel(RATE / 2 - 80) - mel(80)) * i) / (bands + 1)));
  const filters = Array.from({ length: bands }, (_, b) => {
    const bins = []; const weights = [];
    for (let k = 0; k <= size / 2; k++) {
      const freq = (k * RATE) / size;
      const weight = freq < edges[b] || freq > edges[b + 2] ? 0 : freq <= edges[b + 1] ? (freq - edges[b]) / (edges[b + 1] - edges[b]) : (edges[b + 2] - freq) / (edges[b + 2] - edges[b + 1]);
      if (weight > 0) { bins.push(k); weights.push(weight); }
    }
    return { bins: Int32Array.from(bins), weights: Float64Array.from(weights) };
  });
  const table = { window, filters };
  melTables.set(key, table);
  return table;
}

export function melSpectrogram(wave, { bands = 32, frames = 32, size = 256, hop = 144 } = {}) {
  const { window, filters } = melTable(bands, size);
  const out = new Float32Array(frames * bands);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const power = new Float64Array(size / 2 + 1);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < size; i++) { const at = f * hop + i; re[i] = (at < wave.length ? wave[at] : 0) * window[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k <= size / 2; k++) power[k] = re[k] * re[k] + im[k] * im[k];
    for (let b = 0; b < bands; b++) {
      const { bins, weights } = filters[b];
      let energy = 0;
      for (let j = 0; j < bins.length; j++) energy += weights[j] * power[bins[j]];
      out[f * bands + b] = Math.log(1e-4 + energy);
    }
  }
  let min = Infinity; let max = -Infinity;
  for (const v of out) { if (v < min) min = v; if (v > max) max = v; }
  const floor = Math.max(min, max - 9);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, (out[i] - floor) / ((max - floor) || 1));
  return out;
}

/** layout 'image': [bands (high at the top), frames, 1] for a CNN · 'seq': [frames, bands] for a recurrent layer. */
function speech({ n = 600, seed = 30 }, layout) {
  const r = rng(seed);
  const xs = []; const ys = []; const waves = [];
  const bands = 32; const frames = 32;
  for (let i = 0; i < n; i++) {
    const word = i % SPEECH_WORDS.length;
    const wave = synthesizeWord(SPEECH_WORDS[word], r);
    const spec = melSpectrogram(wave, { bands, frames });
    if (layout === 'image') {
      for (let b = bands - 1; b >= 0; b--) for (let f = 0; f < frames; f++) xs.push(spec[f * bands + b]);
    } else xs.push(...spec);
    ys.push(word);
    waves.push(wave);
  }
  const data = makeDataset({ name: 'Speech commands', kind: 'audio', inputShape: layout === 'image' ? [bands, frames, 1] : [frames, bands], xs, ys, task: classification(SPEECH_WORDS.length), labels: [...SPEECH_WORDS] });
  data.media = { type: 'audio', rate: RATE, waves, layout, bands, frames };
  return data;
}

// ───────────────────────── objects (colour pictures)

export const OBJECT_NAMES = ['house', 'tree', 'car', 'sun', 'boat', 'fish'];

const insidePolygon = (x, y, points) => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]; const [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const ovalPoints = (cx, cy, rx, ry, steps = 18) => Array.from({ length: steps }, (_, i) => [cx + Math.cos((i / steps) * Math.PI * 2) * rx, cy + Math.sin((i / steps) * Math.PI * 2) * ry]);
const hit = (shape, x, y) => {
  if (shape.circle) return (x - shape.circle[0]) ** 2 + (y - shape.circle[1]) ** 2 <= shape.circle[2] ** 2;
  if (shape.rect) return x >= shape.rect[0] && x <= shape.rect[2] && y >= shape.rect[1] && y <= shape.rect[3];
  return insidePolygon(x, y, shape.poly);
};

/** Paints shapes (unit coordinates, later ones on top) over a background into size×size×3 values. */
function paint(shapes, background, size, r) {
  const out = new Float32Array(size * size * 3);
  const sub = [0.25, 0.75];
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const colour = [0, 0, 0];
    for (const sy of sub) for (const sx of sub) {
      const x = (px + sx) / size; const y = (py + sy) / size;
      let c = background(x, y);
      for (const shape of shapes) if (hit(shape, x, y)) c = shape.color;
      for (let k = 0; k < 3; k++) colour[k] += c[k] / 4;
    }
    for (let k = 0; k < 3; k++) out[(py * size + px) * 3 + k] = Math.min(1, Math.max(0, colour[k] + r.normal() * 0.03));
  }
  return out;
}

const jitterColor = (c, r, amount = 0.12) => c.map((v) => Math.min(1, Math.max(0, v + (r() - 0.5) * amount * 2)));

function objectScene(kind, r) {
  const s = 0.8 + r() * 0.35;
  const cx = 0.5 + (r() - 0.5) * 0.25;
  const cy = 0.55 + (r() - 0.5) * 0.2;
  const sky = jitterColor([0.62, 0.78, 0.95], r, 0.15);
  const ground = jitterColor([0.45, 0.7, 0.35], r, 0.15);
  const water = jitterColor([0.2, 0.42, 0.8], r, 0.12);
  let background = (x, y) => (y > 0.78 ? ground : sky);
  const shapes = [];
  const p = (dx, dy) => [cx + dx * s, cy + dy * s];
  switch (kind) {
    case 0: // house
      shapes.push({ rect: [...p(-0.25, -0.05), ...p(0.25, 0.3)], color: jitterColor([0.9, 0.82, 0.62], r) });
      shapes.push({ poly: [p(-0.32, -0.04), p(0, -0.34), p(0.32, -0.04)], color: jitterColor([0.7, 0.2, 0.15], r) });
      shapes.push({ rect: [...p(-0.06, 0.1), ...p(0.06, 0.3)], color: [0.35, 0.22, 0.12] });
      break;
    case 1: // tree
      shapes.push({ rect: [...p(-0.05, 0.05), ...p(0.05, 0.36)], color: jitterColor([0.45, 0.28, 0.12], r) });
      shapes.push({ circle: [...p(0, -0.1), 0.24 * s], color: jitterColor([0.15, 0.55, 0.2], r) });
      break;
    case 2: // car
      shapes.push({ rect: [...p(-0.34, 0.0), ...p(0.34, 0.18)], color: jitterColor([[0.9, 0.15, 0.15], [0.15, 0.35, 0.9], [0.95, 0.75, 0.1]][Math.floor(r() * 3)], r) });
      shapes.push({ rect: [...p(-0.18, -0.14), ...p(0.16, 0.02)], color: jitterColor([0.75, 0.88, 0.95], r) });
      shapes.push({ circle: [...p(-0.2, 0.2), 0.08 * s], color: [0.08, 0.08, 0.08] });
      shapes.push({ circle: [...p(0.2, 0.2), 0.08 * s], color: [0.08, 0.08, 0.08] });
      break;
    case 3: { // sun
      const yellow = jitterColor([1, 0.82, 0.15], r, 0.08);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + r() * 0.2;
        const w = 0.035;
        const near = 0.2; const far = 0.33;
        shapes.push({ poly: [[cx + Math.cos(a - w) * near * s, cy - 0.1 + Math.sin(a - w) * near * s], [cx + Math.cos(a) * far * s, cy - 0.1 + Math.sin(a) * far * s], [cx + Math.cos(a + w) * near * s, cy - 0.1 + Math.sin(a + w) * near * s]], color: yellow });
      }
      shapes.push({ circle: [cx, cy - 0.1, 0.16 * s], color: yellow });
      background = () => sky;
      break;
    }
    case 4: // boat
      background = (x, y) => (y > 0.62 ? water : sky);
      shapes.push({ poly: [p(-0.34, 0.1), p(0.34, 0.1), p(0.22, 0.25), p(-0.22, 0.25)], color: jitterColor([0.5, 0.3, 0.15], r) });
      shapes.push({ rect: [...p(-0.015, -0.3), ...p(0.015, 0.1)], color: [0.3, 0.2, 0.1] });
      shapes.push({ poly: [p(0.02, -0.28), p(0.26, 0.06), p(0.02, 0.06)], color: jitterColor([0.97, 0.97, 0.95], r, 0.05) });
      break;
    default: // fish
      background = () => water;
      shapes.push({ poly: [p(0.18, 0), p(0.38, -0.14), p(0.38, 0.14)], color: jitterColor([0.95, 0.5, 0.1], r) });
      shapes.push({ poly: ovalPoints(cx - 0.03 * s, cy, 0.24 * s, 0.13 * s), color: jitterColor([0.98, 0.6, 0.15], r) });
      shapes.push({ circle: [...p(-0.16, -0.03), 0.025 * s], color: [0.05, 0.05, 0.05] });
      break;
  }
  return { shapes, background };
}

function objects({ n = 900, size = 32, seed = 31 }) {
  const r = rng(seed);
  const xs = []; const ys = [];
  for (let i = 0; i < n; i++) {
    const kind = i % OBJECT_NAMES.length;
    const { shapes, background } = objectScene(kind, r);
    xs.push(...paint(shapes, background, size, r));
    ys.push(kind);
  }
  return makeDataset({ name: 'Objects', kind: 'image', inputShape: [size, size, 3], xs, ys, task: classification(OBJECT_NAMES.length), labels: OBJECT_NAMES });
}

// ───────────────────────── characters (OCR)

// Defined here, not imported: the stroke tables below are built while this module loads.
const E = (cx, cy, rx, ry, from = 0, to = Math.PI * 2, steps = 18) => Array.from({ length: steps + 1 }, (_, i) => {
  const a = from + ((to - from) * i) / steps;
  return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
});
const P = Math.PI;
export const LETTER_STROKES = {
  A: [[[0.2, 0.9], [0.5, 0.1], [0.8, 0.9]], [[0.32, 0.6], [0.68, 0.6]]],
  B: [[[0.25, 0.1], [0.25, 0.9], [0.6, 0.9], [0.75, 0.78], [0.75, 0.62], [0.6, 0.5], [0.25, 0.5]], [[0.25, 0.1], [0.58, 0.1], [0.7, 0.2], [0.7, 0.38], [0.58, 0.5]]],
  C: [E(0.55, 0.5, 0.3, 0.4, 0.3 * P, 1.7 * P)],
  D: [[[0.25, 0.1], [0.25, 0.9]], E(0.25, 0.5, 0.5, 0.4, -P / 2, P / 2)],
  E: [[[0.75, 0.1], [0.25, 0.1], [0.25, 0.9], [0.75, 0.9]], [[0.25, 0.5], [0.65, 0.5]]],
  F: [[[0.75, 0.1], [0.25, 0.1], [0.25, 0.9]], [[0.25, 0.5], [0.65, 0.5]]],
  G: [E(0.52, 0.5, 0.3, 0.4, -0.3 * P, -2 * P), [[0.82, 0.5], [0.56, 0.5]]],
  H: [[[0.25, 0.1], [0.25, 0.9]], [[0.75, 0.1], [0.75, 0.9]], [[0.25, 0.5], [0.75, 0.5]]],
  I: [[[0.5, 0.1], [0.5, 0.9]], [[0.35, 0.1], [0.65, 0.1]], [[0.35, 0.9], [0.65, 0.9]]],
  J: [[[0.7, 0.1], [0.7, 0.7], [0.6, 0.88], [0.45, 0.9], [0.3, 0.8]]],
  K: [[[0.25, 0.1], [0.25, 0.9]], [[0.75, 0.1], [0.25, 0.55]], [[0.4, 0.45], [0.78, 0.9]]],
  L: [[[0.28, 0.1], [0.28, 0.9], [0.75, 0.9]]],
  M: [[[0.18, 0.9], [0.22, 0.1], [0.5, 0.6], [0.78, 0.1], [0.82, 0.9]]],
  N: [[[0.25, 0.9], [0.25, 0.1], [0.75, 0.9], [0.75, 0.1]]],
  O: [E(0.5, 0.5, 0.3, 0.4)],
  P: [[[0.25, 0.9], [0.25, 0.1], [0.6, 0.1], [0.75, 0.22], [0.75, 0.4], [0.6, 0.52], [0.25, 0.52]]],
  Q: [E(0.5, 0.48, 0.3, 0.38), [[0.58, 0.7], [0.82, 0.95]]],
  R: [[[0.25, 0.9], [0.25, 0.1], [0.6, 0.1], [0.75, 0.22], [0.75, 0.4], [0.6, 0.52], [0.25, 0.52]], [[0.48, 0.52], [0.78, 0.9]]],
  S: [[[0.75, 0.18], [0.6, 0.1], [0.38, 0.1], [0.25, 0.22], [0.28, 0.4], [0.5, 0.5], [0.72, 0.6], [0.75, 0.78], [0.62, 0.9], [0.38, 0.9], [0.23, 0.8]]],
  T: [[[0.2, 0.1], [0.8, 0.1]], [[0.5, 0.1], [0.5, 0.9]]],
  U: [[[0.25, 0.1], [0.25, 0.7], [0.35, 0.88], [0.5, 0.92], [0.65, 0.88], [0.75, 0.7], [0.75, 0.1]]],
  V: [[[0.2, 0.1], [0.5, 0.9], [0.8, 0.1]]],
  W: [[[0.12, 0.1], [0.3, 0.9], [0.5, 0.4], [0.7, 0.9], [0.88, 0.1]]],
  X: [[[0.22, 0.1], [0.78, 0.9]], [[0.78, 0.1], [0.22, 0.9]]],
  Y: [[[0.2, 0.1], [0.5, 0.5], [0.8, 0.1]], [[0.5, 0.5], [0.5, 0.9]]],
  Z: [[[0.22, 0.1], [0.78, 0.1], [0.22, 0.9], [0.78, 0.9]]],
};
export const HANGUL_STROKES = {
  ㄱ: [[[0.22, 0.2], [0.75, 0.2], [0.7, 0.85]]],
  ㄴ: [[[0.28, 0.15], [0.28, 0.8], [0.8, 0.8]]],
  ㄷ: [[[0.75, 0.2], [0.25, 0.2], [0.25, 0.8], [0.78, 0.8]]],
  ㄹ: [[[0.22, 0.15], [0.75, 0.15], [0.75, 0.47], [0.25, 0.47], [0.25, 0.82], [0.78, 0.82]]],
  ㅁ: [[[0.25, 0.2], [0.75, 0.2], [0.75, 0.8], [0.25, 0.8], [0.25, 0.2]]],
  ㅂ: [[[0.25, 0.12], [0.25, 0.85], [0.75, 0.85], [0.75, 0.12]], [[0.25, 0.48], [0.75, 0.48]]],
  ㅅ: [[[0.5, 0.15], [0.2, 0.85]], [[0.5, 0.4], [0.8, 0.85]]],
  ㅇ: [E(0.5, 0.5, 0.28, 0.3)],
  ㅈ: [[[0.22, 0.2], [0.78, 0.2]], [[0.55, 0.2], [0.22, 0.85]], [[0.45, 0.45], [0.8, 0.85]]],
  ㅊ: [[[0.4, 0.08], [0.6, 0.12]], [[0.22, 0.3], [0.78, 0.3]], [[0.55, 0.3], [0.22, 0.9]], [[0.45, 0.55], [0.8, 0.9]]],
  ㅋ: [[[0.22, 0.2], [0.75, 0.2], [0.7, 0.85]], [[0.25, 0.5], [0.72, 0.5]]],
  ㅌ: [[[0.75, 0.15], [0.25, 0.15], [0.25, 0.82], [0.78, 0.82]], [[0.25, 0.48], [0.72, 0.48]]],
  ㅍ: [[[0.2, 0.18], [0.8, 0.18]], [[0.2, 0.82], [0.8, 0.82]], [[0.38, 0.18], [0.35, 0.82]], [[0.62, 0.18], [0.65, 0.82]]],
  ㅎ: [[[0.42, 0.08], [0.58, 0.08]], [[0.22, 0.25], [0.78, 0.25]], E(0.5, 0.62, 0.22, 0.22)],
};

function characters({ n, size, noise, seed }, table, name) {
  const r = rng(seed);
  const labels = Object.keys(table);
  const xs = []; const ys = [];
  for (let i = 0; i < n; i++) {
    const c = i % labels.length;
    xs.push(...rasterize(table[labels[c]], size, r, { noise, thickness: 1.3 }));
    ys.push(c);
  }
  return makeDataset({ name, kind: 'image', inputShape: [size, size, 1], xs, ys, task: classification(labels.length), labels });
}

// ───────────────────────── video (moving ball clips)

export const MOTIONS = ['right', 'left', 'up', 'down', 'grow', 'shrink'];

/** layout 'seq': [frames, size·size] (a sequence of flattened frames) · 'stack': [size, size, frames]. */
function video({ n = 900, frames = 8, size = 12, noise = 0.05, seed = 32 }, layout) {
  const r = rng(seed);
  const xs = []; const ys = [];
  for (let i = 0; i < n; i++) {
    const kind = i % MOTIONS.length;
    const speed = (0.6 + r() * 0.5) * (size / 12);
    const travel = speed * (frames - 1);
    const margin = 2.5;
    let x = margin + r() * (size - 2 * margin);
    let y = margin + r() * (size - 2 * margin);
    if (kind === 0) x = margin + r() * Math.max(0.1, size - 2 * margin - travel);
    if (kind === 1) x = size - margin - r() * Math.max(0.1, size - 2 * margin - travel);
    if (kind === 2) y = size - margin - r() * Math.max(0.1, size - 2 * margin - travel);
    if (kind === 3) y = margin + r() * Math.max(0.1, size - 2 * margin - travel);
    const radius = 1.4 + r() * 0.8;
    const clip = new Float32Array(frames * size * size);
    for (let f = 0; f < frames; f++) {
      const k = f / (frames - 1);
      const cx = x + (kind === 0 ? travel * k : kind === 1 ? -travel * k : 0);
      const cy = y + (kind === 3 ? travel * k : kind === 2 ? -travel * k : 0);
      const rad = kind === 4 ? 0.8 + 3.2 * k : kind === 5 ? 4 - 3.2 * k : radius;
      for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
        const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
        clip[(f * size + py) * size + px] = Math.min(1, Math.max(0, rad + 0.5 - d + r.normal() * noise));
      }
    }
    if (layout === 'seq') xs.push(...clip);
    else for (let p = 0; p < size * size; p++) for (let f = 0; f < frames; f++) xs.push(clip[f * size * size + p]);
    ys.push(kind);
  }
  const data = makeDataset({ name: 'Motion clips', kind: 'video', inputShape: layout === 'seq' ? [frames, size * size] : [size, size, frames], xs, ys, task: classification(MOTIONS.length), labels: MOTIONS });
  data.media = { type: 'video', frames, size, layout };
  return data;
}

/** The frames of one video sample (each size·size), whatever its layout. */
export function videoFrames(values, media) {
  const { frames, size, layout } = media;
  return Array.from({ length: frames }, (_, f) => {
    const frame = new Float32Array(size * size);
    for (let p = 0; p < size * size; p++) frame[p] = layout === 'seq' ? values[f * size * size + p] : values[p * frames + f];
    return frame;
  });
}

export const MEDIA_GENERATORS = {
  speech: { fn: (p) => speech(p, 'image'), group: 'speech', params: [['n', 600, 60, 3000, 60], ['seed', 30, 1, 9999, 1]] },
  speechSeq: { fn: (p) => speech(p, 'seq'), group: 'speech', params: [['n', 600, 60, 3000, 60], ['seed', 30, 1, 9999, 1]] },
  objects: { fn: objects, group: 'images', params: [['n', 900, 60, 6000, 60], ['size', 32, 16, 48, 4], ['seed', 31, 1, 9999, 1]] },
  letters: { fn: (p) => characters(p, LETTER_STROKES, 'Letters'), group: 'characters', params: [['n', 2080, 260, 10400, 260], ['size', 20, 12, 32, 4], ['noise', 0.04, 0, 0.3, 0.01], ['seed', 33, 1, 9999, 1]] },
  hangul: { fn: (p) => characters(p, HANGUL_STROKES, 'Hangul'), group: 'characters', params: [['n', 1400, 140, 7000, 140], ['size', 20, 12, 32, 4], ['noise', 0.04, 0, 0.3, 0.01], ['seed', 34, 1, 9999, 1]] },
  video: { fn: (p) => video(p, 'seq'), group: 'video', params: [['n', 900, 60, 6000, 60], ['frames', 8, 4, 16, 1], ['size', 12, 8, 24, 2], ['noise', 0.05, 0, 0.3, 0.01], ['seed', 32, 1, 9999, 1]] },
  videoStack: { fn: (p) => video(p, 'stack'), group: 'video', params: [['n', 900, 60, 6000, 60], ['frames', 8, 4, 16, 1], ['size', 12, 8, 24, 2], ['noise', 0.05, 0, 0.3, 0.01], ['seed', 32, 1, 9999, 1]] },
};

// ───────────────────────── language model text (character tokens)

const EN = {
  det: ['the', 'a', 'my', 'one'],
  adj: ['small', 'big', 'red', 'happy', 'old', 'quiet', 'little', 'bright'],
  noun: ['cat', 'dog', 'bird', 'child', 'robot', 'teacher', 'fox', 'model'],
  verb: ['sees', 'likes', 'finds', 'follows', 'draws', 'helps', 'reads', 'learns'],
  obj: ['ball', 'book', 'tree', 'song', 'apple', 'story', 'river', 'picture'],
  end: ['today', 'again', 'slowly', 'at night', 'in the park', 'every day'],
};
const KO = {
  subject: ['고양이', '강아지', '아이', '학생', '선생님', '할머니', '토끼', '로봇'],
  object: ['공', '책', '사과', '우유', '그림', '노래', '꽃', '물'],
  verb: ['본다', '먹는다', '좋아한다', '읽는다', '그린다', '마신다', '부른다', '찾는다'],
  when: ['오늘', '아침에', '저녁에', '천천히', '즐겁게', '다시'],
};
/** Does a Korean syllable end in a final consonant (받침)? Picks 이/가 and 을/를. */
const hasBatchim = (word) => { const code = word.charCodeAt(word.length - 1) - 0xac00; return code >= 0 && code % 28 !== 0; };

/** A corpus of simple sentences from a small grammar (English or Korean), joined by spaces. */
export function textCorpus(language, sentences, r) {
  const pick = (list) => list[r.int(list.length)];
  const lines = [];
  for (let i = 0; i < sentences; i++) {
    if (language === 'ko') {
      const subject = pick(KO.subject);
      const object = pick(KO.object);
      const when = r() < 0.6 ? `${pick(KO.when)} ` : '';
      lines.push(`${subject}${hasBatchim(subject) ? '이' : '가'} ${when}${object}${hasBatchim(object) ? '을' : '를'} ${pick(KO.verb)}.`);
    } else {
      const adj1 = r() < 0.5 ? `${pick(EN.adj)} ` : '';
      const adj2 = r() < 0.4 ? `${pick(EN.adj)} ` : '';
      const tail = r() < 0.5 ? ` ${pick(EN.end)}` : '';
      lines.push(`${pick(EN.det)} ${adj1}${pick(EN.noun)} ${pick(EN.verb)} ${pick(EN.det)} ${adj2}${pick(EN.obj)}${tail}.`);
    }
  }
  return lines.join(' ');
}

/** Character vocabulary of a corpus: ids 0 <pad> and 1 <unk>, then the characters in order. */
export const charVocab = (corpus) => ['<pad>', '<unk>', ...[...new Set([...corpus])].sort()];

/** Text → ids (unknown characters → 1). */
export const encodeChars = (text, vocab) => [...text].map((c) => { const id = vocab.indexOf(c); return id >= 0 ? id : 1; });

/**
 * Next-character prediction: n windows of `length` characters from the corpus, each labelled with the
 * character that follows. A language model learns words and grammar from this alone.
 */
function languageModel({ n = 3000, length = 24, seed = 40 }, language) {
  const r = rng(seed);
  const corpus = textCorpus(language, 900, r);
  const vocab = charVocab(corpus);
  const ids = encodeChars(corpus, vocab);
  const xs = []; const ys = [];
  for (let i = 0; i < n; i++) {
    const start = r.int(ids.length - length - 1);
    for (let k = 0; k < length; k++) xs.push(ids[start + k]);
    ys.push(ids[start + length]);
  }
  const data = makeDataset({ name: language === 'ko' ? '한국어 문장' : 'English sentences', kind: 'tokens', inputShape: [length], xs, ys, task: { kind: 'classification', classes: vocab.length, binaryOutput: vocab.length }, labels: vocab.map((c) => (c === ' ' ? '␣' : c)), vocab });
  data.media = { type: 'text', charLevel: true, length, corpus: corpus.slice(0, 2000) };
  return data;
}

/** Text → the model's input for a character language model: the last `length` characters, left-padded with spaces. */
export function encodePrompt(text, data) {
  const vocab = data.vocab ?? [];
  const length = data.inputShape[0];
  const space = Math.max(0, vocab.indexOf(' '));
  const ids = encodeChars(String(text), vocab).slice(-length);
  return Float32Array.from({ length }, (_, i) => (i < length - ids.length ? space : ids[i - (length - ids.length)]));
}

/** The tokens of a sample as text: characters joined as they are, words with spaces. */
export function tokensText(ids, data) {
  const words = Array.from(ids).map((id) => data.vocab?.[Math.round(id)] ?? String(id)).filter((w) => w !== '<pad>');
  return data.media?.charLevel ? words.join('') : words.join(' ');
}

/** Picks a token from probabilities at a temperature (0 → always the most likely one). r() in [0, 1). */
export function sampleToken(probs, temperature, r = Math.random, skip = [0, 1]) {
  const p = Array.from(probs, (v, i) => (skip.includes(i) ? 0 : Math.max(1e-12, v)));
  if (temperature <= 0.01) return p.indexOf(Math.max(...p));
  const logits = p.map((v) => Math.log(v) / temperature);
  const top = Math.max(...logits);
  const e = logits.map((l) => Math.exp(l - top));
  const sum = e.reduce((a, b) => a + b, 0);
  let x = r() * sum;
  for (let i = 0; i < e.length; i++) { x -= e[i]; if (x <= 0) return i; }
  return e.length - 1;
}

MEDIA_GENERATORS.charLm = { fn: (p) => languageModel(p, 'en'), group: 'text', params: [['n', 3000, 300, 20000, 100], ['length', 24, 8, 64, 4], ['seed', 40, 1, 9999, 1]] };
MEDIA_GENERATORS.charLmKo = { fn: (p) => languageModel(p, 'ko'), group: 'text', params: [['n', 3000, 300, 20000, 100], ['length', 16, 8, 48, 4], ['seed', 41, 1, 9999, 1]] };

// ───────────────────────── recorded sounds (a folder of clips, or a built-in bank)

/** Built-in banks of recorded clips (public/datasets/<id>.bin, made by scripts/make-kws-ko.py). */
export const SOUND_BANKS = { 'kws-ko': { file: 'datasets/kws-ko.bin', seconds: 1 } };

/** The network input of one wave: a mel spectrogram over media.seconds, laid out like the speech data. */
export function soundFeatures(wave, media) {
  const hop = media.hop ?? 144;
  const spec = melSpectrogram(wave, { bands: media.bands, frames: media.frames, hop });
  if (media.layout !== 'image') return spec;
  const raw = new Float32Array(spec.length);
  let k = 0;
  for (let b = media.bands - 1; b >= 0; b--) for (let f = 0; f < media.frames; f++) raw[k++] = spec[f * media.bands + b];
  return raw;
}

/**
 * Band-limited resampling (windowed sinc, cut off just below the lower Nyquist frequency). The browser's own
 * conversion (an AudioBufferSourceNode in an OfflineAudioContext) does not filter: going from 48 kHz to 8 kHz
 * it folds everything above 4 kHz — the hiss of ㅊ ㅎ, breath, microphone noise — into the speech band, which
 * the training clips (resampled band-limited by scripts/make-kws-ko.py) never have.
 */
export function resampleWave(wave, from, to) {
  if (from === to) return Float32Array.from(wave);
  const ratio = from / to;
  const out = new Float32Array(Math.max(1, Math.round(wave.length / ratio)));
  const cutoff = 0.92 * 0.5 * Math.min(1, 1 / ratio); // cycles per input sample
  const half = Math.ceil(16 / (2 * cutoff)); // 16 zero crossings each side
  for (let i = 0; i < out.length; i++) {
    const t = i * ratio;
    const lo = Math.max(0, Math.ceil(t - half));
    const hi = Math.min(wave.length - 1, Math.floor(t + half));
    let sum = 0; let weight = 0;
    for (let k = lo; k <= hi; k++) {
      const x = k - t;
      const arg = 2 * cutoff * x;
      const sinc = arg === 0 ? 1 : Math.sin(Math.PI * arg) / (Math.PI * arg);
      const w = sinc * (0.5 + 0.5 * Math.cos((Math.PI * x) / half)); // Hann window
      sum += wave[k] * w; weight += w;
    }
    out[i] = weight ? sum / weight : 0;
  }
  return out;
}

/**
 * The `seconds` of a recording the model should hear: centred on the speech, as every training clip is
 * (scripts/make-kws-ko.py centres the words). Speech is where the energy over 50 ms rises clearly above the
 * recording's noise floor. (Taking the window with the most energy instead would put a short word anywhere in
 * it — every window that holds the whole word has about the same energy — mostly at one edge.) A span longer
 * than the window keeps its middle; what lies outside the recording is silence. Peak-normalised to 0.9.
 * Returns { wave, rms } (rms of the window before normalising).
 */
export function speechWindow(recorded, rate, seconds) {
  const n = Math.round(rate * seconds);
  const length = recorded.length;
  const half = Math.max(1, Math.round(rate * 0.025));
  const sums = new Float64Array(length + 1);
  for (let i = 0; i < length; i++) sums[i + 1] = sums[i] + recorded[i] * recorded[i];
  const energy = new Float64Array(length);
  for (let i = 0; i < length; i++) energy[i] = sums[Math.min(length, i + half)] - sums[Math.max(0, i - half)];
  let first = 0; let last = length - 1;
  if (length) {
    const sorted = Float64Array.from(energy).sort();
    const floor = sorted[Math.floor(sorted.length * 0.1)];
    const top = sorted[sorted.length - 1];
    const threshold = floor + 0.05 * (top - floor);
    first = energy.findIndex((e) => e > threshold);
    for (last = length - 1; last > first && energy[last] <= threshold; last--);
    if (first < 0) { first = 0; last = length - 1; }
  }
  const start = Math.round((first + last) / 2 - n / 2);
  const wave = new Float32Array(n);
  let power = 0;
  for (let i = 0; i < n; i++) {
    const j = start + i;
    if (j >= 0 && j < length) { wave[i] = recorded[j]; power += recorded[j] * recorded[j]; }
  }
  let peak = 0;
  for (const v of wave) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < n; i++) wave[i] = (wave[i] / peak) * 0.9;
  return { wave, rms: Math.sqrt(power / n) };
}

/** The hop between spectrogram frames so `frames` frames cover `seconds`. */
export const soundHop = (seconds, frames = 32, size = 256) => Math.max(1, Math.floor((Math.round(RATE * seconds) - size) / (frames - 1)));

/** 8-bit µ-law bytes → wave (−1…1). */
export function fromMulaw(bytes) {
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const y = bytes[i] / 127.5 - 1;
    out[i] = Math.sign(y) * (Math.pow(256, Math.abs(y)) - 1) / 255;
  }
  return out;
}

/** wave (−1…1) → 8-bit µ-law bytes (what a sound folder import keeps in the project). */
export function toMulaw(wave) {
  const out = new Uint8Array(wave.length);
  for (let i = 0; i < wave.length; i++) {
    const x = Math.max(-1, Math.min(1, wave[i]));
    out[i] = Math.round(((Math.sign(x) * Math.log1p(255 * Math.abs(x))) / Math.log1p(255) + 1) * 127.5);
  }
  return out;
}

/** A sound bank file → { index, clips: [{ label, voice, wave }] }. */
export function parseSoundBank(buffer) {
  const view = new DataView(buffer);
  const length = view.getUint32(0, true);
  const index = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, length)));
  const size = Math.round(index.rate * index.seconds);
  const clips = index.clips.map(([label, voice], i) => ({ label, voice, wave: fromMulaw(new Uint8Array(buffer, 4 + length + i * size, size)) }));
  return { index, clips };
}

/** One-pole filters in place: high-pass (a microphone or room with little bass) and low-pass (a dull microphone). */
function highPass(wave, cutoff) {
  const a = 1 / (1 + (2 * Math.PI * cutoff) / RATE);
  let y = 0; let x0 = wave[0];
  for (let i = 0; i < wave.length; i++) { const x = wave[i]; y = a * (y + x - x0); x0 = x; wave[i] = y; }
}
function lowPass(wave, cutoff) {
  const k = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
  let y = 0;
  for (let i = 0; i < wave.length; i++) { y += k * (wave[i] - y); wave[i] = y; }
}

/** A small room in place (Schroeder: four parallel comb filters); rt60 = seconds for the echo to fall by 60 dB. */
function reverb(wave, rt60, wet, size) {
  const delays = [233, 271, 307, 353].map((d) => Math.max(1, Math.round(d * size)));
  const dry = Float32Array.from(wave);
  const sum = new Float32Array(wave.length);
  for (const d of delays) {
    const g = Math.pow(10, (-3 * d) / (rt60 * RATE));
    const line = new Float32Array(wave.length);
    for (let i = 0; i < wave.length; i++) { line[i] = dry[i] + (i >= d ? g * line[i - d] : 0); sum[i] += line[i]; }
  }
  for (let i = 0; i < wave.length; i++) wave[i] = dry[i] + (wet * sum[i]) / delays.length;
}

/**
 * A dataset from recorded clips [{ label, wave (RATE Hz) }]. `copies` augmented copies of each clip and
 * optionally a 'noise' class (background only), as keyword-spotting data sets do. Copies after the first
 * are what a microphone somewhere else would hear: the same words a little faster or slower (and so higher
 * or lower), shifted in time, louder or softer, through another microphone (bass or treble cut), sometimes
 * in an echoing room, sometimes clipped, over background noise of several colours or other people talking,
 * half of them with the frequencies stretched or squeezed a little (VTLP: a longer or shorter vocal tract,
 * i.e. another speaker), and a few with a band of the spectrogram or a moment masked out (SpecAugment).
 */
export function fromSounds(clips, options = {}) {
  const steps = soundSteps(clips, options);
  for (;;) { const step = steps.next(); if (step.done) return step.value; }
}

/**
 * Lets the page draw and answer between steps. A message on a MessageChannel, not setTimeout: browsers slow
 * timers in a hidden or minimised window down to one a minute, which would stall a long build.
 */
function yieldToPage() {
  if (typeof MessageChannel !== 'function') return new Promise((resolve) => setTimeout(resolve, 0));
  return new Promise((resolve) => { const channel = new MessageChannel(); channel.port1.onmessage = () => { channel.port1.close(); resolve(); }; channel.port2.postMessage(0); });
}

/** fromSounds a little at a time: onProgress(0…1) between steps, the page stays responsive. */
export async function fromSoundsAsync(clips, options = {}, onProgress = () => {}) {
  const steps = soundSteps(clips, options);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
    onProgress(step.value);
    await yieldToPage();
  }
}

/** fromSounds as steps: yields the share done (0…1) every few dozen samples, returns the dataset. */
function* soundSteps(clips, { name = 'Sounds', seconds = 1, copies = 3, noiseClass = true, layout = 'image', seed = 1, labels = null, bands = 32, frames = 32, stretch = 1.25, balance = true } = {}) {
  const r = rng(seed);
  const n = Math.round(RATE * seconds);
  const media = { type: 'audio', rate: RATE, layout, bands, frames, seconds, hop: soundHop(seconds, frames) };
  const names = labels ?? [...new Set(clips.map((clip) => clip.label))].sort();
  if (noiseClass && !names.includes('noise')) names.push('noise');
  // Balanced classes: every class gets as many samples as the smallest one has with `copies` copies (a class
  // with more clips gets fewer augmented copies of each; every clip keeps at least its original), and noise
  // as many again. A class with more samples than the others becomes the model's guess whenever it is unsure.
  const counts = new Map();
  for (const clip of clips) counts.set(clip.label, (counts.get(clip.label) ?? 0) + 1);
  const target = copies * Math.min(...counts.values());
  const seen = new Map();
  const plan = clips.map((clip) => {
    if (!balance) return copies;
    const share = Math.max(1, target / counts.get(clip.label));
    const k = seen.get(clip.label) ?? 0;
    seen.set(clip.label, k + 1);
    return Math.floor(share) + (Math.floor((k + 1) * (share % 1)) > Math.floor(k * (share % 1)) ? 1 : 0); // the fraction spread evenly
  });
  const made = plan.reduce((a, b) => a + b, 0);
  const noiseCount = noiseClass ? Math.max(1, balance ? target : Math.round(made / Math.max(1, names.length - 1))) : 0;
  const size = bands * frames;
  // Thousands of samples: the features go straight into one typed array (a plain array of numbers takes many times the memory).
  const xs = new Float32Array((made + noiseCount) * size); const ys = []; const waves = [];
  // The group of every sample (see splitIndices): its speaker, or its recording; each noise sample alone.
  const groupIds = new Map(); const groups = [];
  const groupOf = (key) => { if (!groupIds.has(key)) groupIds.set(key, groupIds.size); return groupIds.get(key); };
  let group = 0;
  const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  // Waves are kept for "play" only: an original is the clip itself, a copy 16-bit (half the memory of floats).
  const push = (wave, label, mask = false, warp = 1, original = null) => {
    waves.push(original ?? Int16Array.from(wave, (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767)));
    const f = soundFeatures(wave, media);
    if (warp !== 1) warpFeatures(f, media, warp);
    if (mask) maskFeatures(f, media, r);
    xs.set(f, ys.length * size);
    groups.push(group);
    ys.push(names.indexOf(label));
  };
  const total = made + noiseCount;
  // Room noise: brown-ish with a little mains hum, pink-ish and white; a few buffers made once, then read
  // from a random offset at a random level for every copy.
  const pool = Array.from({ length: 18 }, (_, k) => {
    const out = new Float32Array(n);
    let last = 0; let pink = 0;
    const hum = r() * 0.3;
    for (let i = 0; i < n; i++) {
      const w = gauss();
      if (k % 3 === 0) { last = 0.97 * last + 0.03 * w; out[i] = last * 3 + 0.3 * gauss() + hum * Math.sin((2 * Math.PI * (k % 2 ? 50 : 60) * 2 * i) / RATE); }
      else if (k % 3 === 1) { pink = 0.85 * pink + 0.15 * w; out[i] = pink * 1.6; }
      else out[i] = 0.5 * w;
    }
    return out;
  });
  const background = (level) => {
    const source = pool[Math.floor(r() * pool.length)];
    const offset = Math.floor(r() * n);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = level * source[(i + offset) % n];
    return out;
  };
  // Other people talking in the background: only clips that are no keyword ('unknown' when there is one).
  const chatter = clips.filter((clip) => clip.label === 'unknown');
  for (const [index, clip] of clips.entries()) {
    group = groupOf(clip.voice ? `voice:${clip.voice}` : `clip:${index}`);
    for (let c = 0; c < plan[index]; c++) {
      const wave = new Float32Array(n);
      const source = clip.wave;
      if (c === 0) wave.set(source.subarray(0, n));
      else {
        const rate = Math.exp((r() * 2 - 1) * Math.log(stretch)); // > 1: faster and higher
        const shift = (r() - 0.5) * 0.24 * RATE;
        const gain = 0.35 + r() * 0.65;
        const middle = source.length / 2;
        for (let i = 0; i < n; i++) {
          const at = middle + (i - n / 2 - shift) * rate;
          const j = Math.floor(at);
          if (j >= 0 && j + 1 < source.length) wave[i] = gain * (source[j] + (at - j) * (source[j + 1] - source[j]));
        }
        if (r() < 0.5) highPass(wave, 80 + r() * 420);
        if (r() < 0.4) lowPass(wave, 1600 + r() * 2200);
        if (r() < 0.35) reverb(wave, 0.15 + r() * 0.55, 0.2 + r() * 0.5, 0.7 + r() * 0.8);
        if (r() < 0.08) { const drive = 2 + r() * 4; for (let i = 0; i < n; i++) wave[i] = Math.tanh(wave[i] * drive) / drive * 1.5; }
        const noise = background(r() < 0.15 ? 0.03 + r() * 0.05 : 0.002 + r() * 0.03);
        for (let i = 0; i < n; i++) wave[i] += noise[i];
        if (chatter.length && clip.label !== 'unknown' && r() < 0.2) {
          const other = chatter[Math.floor(r() * chatter.length)].wave;
          const offset = Math.floor((r() - 0.5) * n);
          const level = 0.08 + r() * 0.17;
          for (let i = 0; i < n; i++) { const j = i + offset; if (j >= 0 && j < other.length) wave[i] += level * other[j]; }
        }
      }
      push(wave, clip.label, c > 0 && r() < 0.25, c > 0 && r() < 0.5 ? 0.88 + r() * 0.24 : 1, c === 0 && clip.wave.length === n ? clip.wave : null);
      if (ys.length % 96 === 0) yield ys.length / total;
    }
  }
  if (noiseClass) {
    for (let i = 0; i < noiseCount; i++) {
      group = groupOf(`noise:${i}`);
      const wave = background(0.005 + r() * 0.1);
      if (r() < 0.3) highPass(wave, 80 + r() * 420);
      if (r() < 0.3) lowPass(wave, 1600 + r() * 2200);
      // A knock or a click now and then: noise is not always steady.
      if (r() < 0.3) { const at = Math.floor(r() * (n - 200)); const level = 0.1 + r() * 0.5; for (let k = 0; k < 200; k++) wave[at + k] += level * gauss() * Math.exp(-k / 30); }
      push(wave, 'noise');
      if (ys.length % 96 === 0) yield ys.length / total;
    }
  }
  const data = makeDataset({ name, kind: 'audio', inputShape: layout === 'image' ? [bands, frames, 1] : [frames, bands], xs, ys, task: classification(names.length), labels: names });
  data.media = { ...media, waves };
  data.groups = Int32Array.from(groups);
  return data;
}

/** VTLP in place: every frame's mel bands read from band·warp (linear interpolation, the top band held). */
function warpFeatures(features, media, warp) {
  const { bands, frames, layout } = media;
  const at = (band, frame) => (layout === 'image' ? (bands - 1 - band) * frames + frame : frame * bands + band);
  const column = new Float32Array(bands);
  for (let f = 0; f < frames; f++) {
    for (let b = 0; b < bands; b++) column[b] = features[at(b, f)];
    for (let b = 0; b < bands; b++) {
      const x = Math.min(bands - 1, b * warp);
      const lo = Math.floor(x);
      const hi = Math.min(bands - 1, lo + 1);
      features[at(b, f)] = column[lo] + (x - lo) * (column[hi] - column[lo]);
    }
  }
}

/** SpecAugment in place: a band of 1–4 mel rows and a stretch of 1–4 frames set to the floor (0). */
function maskFeatures(features, media, r) {
  const { bands, frames, layout } = media;
  const at = (band, frame) => (layout === 'image' ? (bands - 1 - band) * frames + frame : frame * bands + band);
  const width = 1 + Math.floor(r() * 4); const band0 = Math.floor(r() * (bands - width));
  for (let b = band0; b < band0 + width; b++) for (let f = 0; f < frames; f++) features[at(b, f)] = 0;
  const length = 1 + Math.floor(r() * 4); const frame0 = Math.floor(r() * (frames - length));
  for (let f = frame0; f < frame0 + length; f++) for (let b = 0; b < bands; b++) features[at(b, f)] = 0;
}
