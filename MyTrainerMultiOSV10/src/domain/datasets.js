// Datasets. A dataset is
//   { x: Float32Array, y: Float32Array, n, inputShape, kind, task, labels, featureNames, vocab, name }
// where x holds n samples of inputShape (channels-last), y holds class indices
// (classification: one value per sample) or n samples of task.outputShape
// (regression / reconstruction). `kind` says how the data view draws a sample:
// 'points2d', 'function1d', 'vector', 'image', 'sequence', 'tokens'.
//
// Every built-in dataset is generated here from a seed, so the samples work
// offline and give the same data every time. CSV files and image folders
// become datasets through fromTable() / fromImages().

import { makeDataset, rasterize, rng } from './datasets-core.js';
import { fromMulaw, fromSounds, fromSoundsAsync, MEDIA_GENERATORS } from './datasets-media.js';

export { makeDataset, rasterize, rng };
const make = makeDataset;

// ───────────────────────── random numbers


const size = (shape) => shape.reduce((a, b) => a * b, 1);


const classification = (classes, binaryOutput = classes === 2 ? 1 : classes) => ({ kind: 'classification', classes, binaryOutput });
const regression = (outputShape = [1]) => ({ kind: 'regression', outputShape });

// ───────────────────────── 2-D point sets

function xor({ n = 240, noise = 0.12, seed = 1 }) {
  const r = rng(seed);
  const xs = []; const ys = [];
  for (let i = 0; i < n; i++) {
    const a = r() < 0.5 ? 0 : 1;
    const b = r() < 0.5 ? 0 : 1;
    xs.push(a * 2 - 1 + r.normal() * noise * 2, b * 2 - 1 + r.normal() * noise * 2);
    ys.push(a ^ b);
  }
  return make({ name: 'XOR', kind: 'points2d', inputShape: [2], xs, ys, task: classification(2), labels: ['0', '1'], featureNames: ['x1', 'x2'] });
}

function circles({ n = 400, noise = 0.08, factor = 0.5, seed = 2 }) {
  const r = rng(seed);
  const xs = []; const ys = [];
  for (let i = 0; i < n; i++) {
    const label = i % 2;
    const angle = r() * Math.PI * 2;
    const radius = label ? factor : 1;
    xs.push(Math.cos(angle) * radius + r.normal() * noise, Math.sin(angle) * radius + r.normal() * noise);
    ys.push(label);
  }
  return make({ name: 'Circles', kind: 'points2d', inputShape: [2], xs, ys, task: classification(2), labels: ['outer', 'inner'], featureNames: ['x1', 'x2'] });
}

function moons({ n = 400, noise = 0.1, seed = 3 }) {
  const r = rng(seed);
  const xs = []; const ys = [];
  for (let i = 0; i < n; i++) {
    const label = i % 2;
    const t = r() * Math.PI;
    const x = label ? 1 - Math.cos(t) : Math.cos(t);
    const y = label ? 0.5 - Math.sin(t) : Math.sin(t);
    xs.push((x - 0.5) + r.normal() * noise, (y - 0.25) * 1.4 + r.normal() * noise);
    ys.push(label);
  }
  return make({ name: 'Moons', kind: 'points2d', inputShape: [2], xs, ys, task: classification(2), labels: ['A', 'B'], featureNames: ['x1', 'x2'] });
}

function spiral({ n = 450, classes = 3, noise = 0.18, turns = 1.5, seed = 4 }) {
  const r = rng(seed);
  const xs = []; const ys = [];
  const per = Math.floor(n / classes);
  for (let c = 0; c < classes; c++) {
    for (let i = 0; i < per; i++) {
      const t = i / per;
      const radius = t;
      const angle = t * turns * Math.PI * 2 + (c * 2 * Math.PI) / classes + r.normal() * noise * 0.6;
      xs.push(radius * Math.cos(angle), radius * Math.sin(angle));
      ys.push(c);
    }
  }
  return make({ name: 'Spiral', kind: 'points2d', inputShape: [2], xs, ys, task: classification(classes), labels: Array.from({ length: classes }, (_, c) => `C${c}`), featureNames: ['x1', 'x2'] });
}

function blobs({ n = 400, classes = 4, spread = 0.35, seed = 5 }) {
  const r = rng(seed);
  const centres = Array.from({ length: classes }, (_, c) => [Math.cos((c / classes) * Math.PI * 2) * 0.75, Math.sin((c / classes) * Math.PI * 2) * 0.75]);
  const xs = []; const ys = [];
  for (let i = 0; i < n; i++) {
    const c = i % classes;
    xs.push(centres[c][0] + r.normal() * spread * 0.5, centres[c][1] + r.normal() * spread * 0.5);
    ys.push(c);
  }
  return make({ name: 'Blobs', kind: 'points2d', inputShape: [2], xs, ys, task: classification(classes), labels: Array.from({ length: classes }, (_, c) => `C${c}`), featureNames: ['x1', 'x2'] });
}

function checker({ n = 600, cells = 3, noise = 0.0, seed = 6 }) {
  const r = rng(seed);
  const xs = []; const ys = [];
  for (let i = 0; i < n; i++) {
    const x = r() * 2 - 1;
    const y = r() * 2 - 1;
    const cx = Math.floor(((x + 1) / 2) * cells);
    const cy = Math.floor(((y + 1) / 2) * cells);
    xs.push(x + r.normal() * noise, y + r.normal() * noise);
    ys.push((cx + cy) % 2);
  }
  return make({ name: 'Checkerboard', kind: 'points2d', inputShape: [2], xs, ys, task: classification(2), labels: ['black', 'white'], featureNames: ['x1', 'x2'] });
}

// ───────────────────────── 1-D functions (regression)

function line({ n = 200, slope = 2, intercept = 0.5, noise = 0.15, seed = 7 }) {
  const r = rng(seed);
  const xs = []; const ys = [];
  for (let i = 0; i < n; i++) {
    const x = r() * 2 - 1;
    xs.push(x);
    ys.push(slope * x + intercept + r.normal() * noise);
  }
  return make({ name: 'Line', kind: 'function1d', inputShape: [1], xs, ys, task: regression(), featureNames: ['x'] });
}

function sine({ n = 300, frequency = 3, noise = 0.1, seed = 8 }) {
  const r = rng(seed);
  const xs = []; const ys = [];
  for (let i = 0; i < n; i++) {
    const x = r() * 2 - 1;
    xs.push(x);
    ys.push(Math.sin(frequency * x * Math.PI * 0.5 * 2) + r.normal() * noise);
  }
  return make({ name: 'Sine', kind: 'function1d', inputShape: [1], xs, ys, task: regression(), featureNames: ['x'] });
}

function friedman({ n = 500, noise = 0.2, seed = 9 }) {
  // Friedman #1: y = 10 sin(π x1 x2) + 20 (x3 − 0.5)² + 10 x4 + 5 x5 (+ 5 noise features), scaled.
  const r = rng(seed);
  const xs = []; const ys = [];
  for (let i = 0; i < n; i++) {
    const v = Array.from({ length: 8 }, () => r());
    xs.push(...v);
    ys.push((10 * Math.sin(Math.PI * v[0] * v[1]) + 20 * (v[2] - 0.5) ** 2 + 10 * v[3] + 5 * v[4] + r.normal() * noise) / 10);
  }
  return make({ name: 'Friedman', kind: 'vector', inputShape: [8], xs, ys, task: regression(), featureNames: Array.from({ length: 8 }, (_, i) => `x${i + 1}`) });
}

// ───────────────────────── images

/** Digit strokes in a unit box (x right, y down); each digit is a list of polylines. */
const ellipse = (cx, cy, rx, ry, steps = 18, from = 0, to = Math.PI * 2) => Array.from({ length: steps + 1 }, (_, i) => {
  const a = from + ((to - from) * i) / steps;
  return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
});
export const DIGIT_STROKES = [
  [ellipse(0.5, 0.5, 0.26, 0.38)],
  [[[0.34, 0.26], [0.52, 0.12], [0.52, 0.88]], [[0.34, 0.88], [0.7, 0.88]]],
  [[[0.26, 0.3], [0.34, 0.15], [0.5, 0.1], [0.66, 0.15], [0.73, 0.3], [0.67, 0.46], [0.26, 0.88], [0.76, 0.88]]],
  [[[0.27, 0.14], [0.72, 0.14], [0.46, 0.44], [0.64, 0.5], [0.73, 0.66], [0.66, 0.83], [0.5, 0.89], [0.27, 0.83]]],
  [[[0.63, 0.88], [0.63, 0.12], [0.22, 0.64], [0.8, 0.64]]],
  [[[0.72, 0.12], [0.33, 0.12], [0.29, 0.45], [0.5, 0.4], [0.68, 0.48], [0.73, 0.66], [0.66, 0.83], [0.5, 0.89], [0.27, 0.83]]],
  [[[0.66, 0.13], [0.46, 0.18], [0.33, 0.35], [0.27, 0.6], [0.33, 0.82], [0.5, 0.89], [0.67, 0.82], [0.72, 0.65], [0.65, 0.52], [0.5, 0.47], [0.33, 0.56]]],
  [[[0.25, 0.12], [0.76, 0.12], [0.44, 0.88]], [[0.38, 0.5], [0.66, 0.5]]],
  [ellipse(0.5, 0.29, 0.19, 0.17), ellipse(0.5, 0.68, 0.24, 0.21)],
  [ellipse(0.5, 0.33, 0.2, 0.2), [[0.7, 0.33], [0.67, 0.62], [0.46, 0.88]]],
];

const SHAPE_NAMES = ['circle', 'square', 'triangle', 'cross'];
function shapeStrokes(kind) {
  if (kind === 0) return [ellipse(0.5, 0.5, 0.3, 0.3, 24)];
  if (kind === 1) return [[[0.22, 0.22], [0.78, 0.22], [0.78, 0.78], [0.22, 0.78], [0.22, 0.22]]];
  if (kind === 2) return [[[0.5, 0.18], [0.82, 0.78], [0.18, 0.78], [0.5, 0.18]]];
  return [[[0.5, 0.18], [0.5, 0.82]], [[0.18, 0.5], [0.82, 0.5]]];
}



function digits({ n = 1500, size: px = 16, noise = 0.04, seed = 10, reconstruct = false }) {
  const r = rng(seed);
  const xs = []; const ys = [];
  for (let i = 0; i < n; i++) {
    const digit = i % 10;
    const image = rasterize(DIGIT_STROKES[digit], px, r, { noise });
    xs.push(...image);
    if (reconstruct) ys.push(...image);
    else ys.push(digit);
  }
  const task = reconstruct ? { kind: 'reconstruction', outputShape: [px * px] } : classification(10);
  return make({ name: reconstruct ? 'Digits (autoencoder)' : 'Digits', kind: 'image', inputShape: [px, px, 1], xs, ys, task, labels: reconstruct ? null : Array.from({ length: 10 }, (_, d) => String(d)) });
}

/** Denoising: the input is a digit picture under grey noise with a few blocks wiped out, the target the clean picture. */
function digitsNoisy({ n = 1200, size: px = 16, noise = 0.03, corrupt = 0.35, seed = 18 }) {
  const r = rng(seed);
  const xs = []; const ys = [];
  for (let i = 0; i < n; i++) {
    const image = rasterize(DIGIT_STROKES[i % 10], px, r, { noise });
    const dirty = image.map((v) => Math.min(1, Math.max(0, v + r.normal() * corrupt)));
    for (let k = r.int(3); k > 0; k--) {
      const w = 2 + r.int(px / 4); const x0 = r.int(px - w); const y0 = r.int(px - w);
      for (let y = y0; y < y0 + w; y++) for (let x = x0; x < x0 + w; x++) dirty[y * px + x] = r() < 0.5 ? 0 : 1;
    }
    xs.push(...dirty); ys.push(...image);
  }
  return make({ name: 'Noisy digits (denoising)', kind: 'image', inputShape: [px, px, 1], xs, ys, task: { kind: 'reconstruction', outputShape: [px * px] }, labels: null });
}

/**
 * Anomaly detection: digit pictures, and a share of `anomalies` that are no digit at all (an inverted digit,
 * a smudge, a grid). The target is the picture itself; `anomaly` flags the odd ones (the model never sees it).
 */
function digitsAnomaly({ n = 1500, size: px = 16, anomalies = 0.06, noise = 0.03, seed = 19 }) {
  const r = rng(seed);
  const xs = []; const flags = [];
  for (let i = 0; i < n; i++) {
    const odd = r() < anomalies;
    let image;
    if (!odd) image = rasterize(DIGIT_STROKES[i % 10], px, r, { noise });
    else if (i % 3 === 0) image = Array.from(rasterize(DIGIT_STROKES[i % 10], px, r, { noise }), (v) => 1 - v);
    else if (i % 3 === 1) {
      const cx = r() * px; const cy = r() * px; const radius = px * (0.2 + r() * 0.25);
      image = Array.from({ length: px * px }, (_, k) => Math.min(1, Math.max(0, Math.exp(-(((k % px) - cx) ** 2 + (Math.floor(k / px) - cy) ** 2) / (2 * radius * radius)) + r.normal() * noise)));
    } else {
      const step = 3 + r.int(3);
      image = Array.from({ length: px * px }, (_, k) => ((k % px) % step === 0 || Math.floor(k / px) % step === 0 ? 0.9 : 0) + r() * noise);
    }
    xs.push(...image); flags.push(odd ? 1 : 0);
  }
  const data = make({ name: 'Digits with anomalies', kind: 'image', inputShape: [px, px, 1], xs, ys: xs, task: { kind: 'reconstruction', outputShape: [px * px] }, labels: null });
  data.anomaly = Uint8Array.from(flags);
  return data;
}

function shapes({ n = 1200, size: px = 24, noise = 0.05, seed = 11 }) {
  const r = rng(seed);
  const xs = []; const ys = [];
  for (let i = 0; i < n; i++) {
    const kind = i % 4;
    xs.push(...rasterize(shapeStrokes(kind), px, r, { noise, jitter: 1.4, thickness: 1.6 }));
    ys.push(kind);
  }
  return make({ name: 'Shapes', kind: 'image', inputShape: [px, px, 1], xs, ys, task: classification(4), labels: SHAPE_NAMES });
}

/** Coloured squares and circles on a background (3 channels): classify by colour and shape at once. */
function colorShapes({ n = 1200, size: px = 20, seed = 12 }) {
  const r = rng(seed);
  const palette = [[0.9, 0.2, 0.2], [0.2, 0.75, 0.3], [0.25, 0.4, 0.95]];
  const xs = []; const ys = [];
  for (let i = 0; i < n; i++) {
    const colour = i % 3;
    const kind = Math.floor(i / 3) % 2;
    const mask = rasterize(shapeStrokes(kind), px, r, { noise: 0, jitter: 1.3, thickness: 2.2 });
    for (let p = 0; p < px * px; p++) {
      for (let c = 0; c < 3; c++) xs.push(Math.max(0, Math.min(1, mask[p] * palette[colour][c] + 0.08 + r.normal() * 0.04)));
    }
    ys.push(colour * 2 + kind);
  }
  const labels = ['red circle', 'red square', 'green circle', 'green square', 'blue circle', 'blue square'];
  return make({ name: 'Colour shapes', kind: 'image', inputShape: [px, px, 3], xs, ys, task: classification(6), labels });
}

// ───────────────────────── sequences

function sineForecast({ n = 800, steps = 24, noise = 0.05, seed = 13 }) {
  const r = rng(seed);
  const xs = []; const ys = [];
  for (let i = 0; i < n; i++) {
    const frequency = 0.15 + r() * 0.35;
    const phase = r() * Math.PI * 2;
    const amplitude = 0.5 + r() * 0.5;
    for (let t = 0; t < steps; t++) xs.push(amplitude * Math.sin(frequency * t + phase) + r.normal() * noise);
    ys.push(amplitude * Math.sin(frequency * steps + phase));
  }
  return make({ name: 'Sine forecast', kind: 'sequence', inputShape: [steps, 1], xs, ys, task: regression(), featureNames: ['value'] });
}

const PATTERNS = ['rising', 'falling', 'peak', 'valley'];
function patterns({ n = 800, steps = 30, noise = 0.12, seed = 14 }) {
  const r = rng(seed);
  const xs = []; const ys = [];
  for (let i = 0; i < n; i++) {
    const kind = i % 4;
    const centre = 0.3 + r() * 0.4;
    const width = 0.08 + r() * 0.12;
    for (let t = 0; t < steps; t++) {
      const u = t / (steps - 1);
      let v = kind === 0 ? u : kind === 1 ? 1 - u : Math.exp(-((u - centre) ** 2) / (2 * width * width));
      if (kind === 3) v = 1 - v;
      xs.push(v * 2 - 1 + r.normal() * noise);
    }
    ys.push(kind);
  }
  return make({ name: 'Patterns', kind: 'sequence', inputShape: [steps, 1], xs, ys, task: classification(4), labels: PATTERNS, featureNames: ['value'] });
}

function counting({ n = 800, steps = 12, seed = 15 }) {
  const r = rng(seed);
  const xs = []; const ys = [];
  for (let i = 0; i < n; i++) {
    let ones = 0;
    for (let t = 0; t < steps; t++) {
      const bit = r() < 0.5 ? 1 : 0;
      ones += bit;
      xs.push(bit);
    }
    ys.push(ones / steps);
  }
  return make({ name: 'Counting', kind: 'sequence', inputShape: [steps, 1], xs, ys, task: regression(), featureNames: ['bit'] });
}

/** Two-channel sensor sequences (accelerometer-like): walk, run, still. */
function activity({ n = 900, steps = 40, seed = 16 }) {
  const r = rng(seed);
  const xs = []; const ys = [];
  for (let i = 0; i < n; i++) {
    const kind = i % 3;
    const f = [0.35, 0.8, 0][kind] * (0.85 + r() * 0.3);
    const a = [0.6, 1, 0.05][kind];
    const phase = r() * Math.PI * 2;
    for (let t = 0; t < steps; t++) {
      xs.push(a * Math.sin(f * t + phase) + r.normal() * 0.1, a * 0.5 * Math.cos(2 * f * t + phase) + r.normal() * 0.1);
    }
    ys.push(kind);
  }
  return make({ name: 'Activity', kind: 'sequence', inputShape: [steps, 2], xs, ys, task: classification(3), labels: ['walk', 'run', 'still'], featureNames: ['ax', 'ay'] });
}

// ───────────────────────── tokens (text)

export const SENTIMENT_VOCAB = ['<pad>', '<unk>', 'not', 'very', 'the', 'movie', 'film', 'story', 'acting', 'music', 'was', 'is', 'and', 'but', 'really', 'quite',
  'good', 'great', 'excellent', 'fun', 'lovely', 'brilliant', 'happy', 'enjoyable', 'bad', 'awful', 'boring', 'terrible', 'dull', 'sad', 'poor', 'weak', 'plot', 'ending', 'cast', 'scene'];
const POSITIVE = ['good', 'great', 'excellent', 'fun', 'lovely', 'brilliant', 'happy', 'enjoyable'];
const NEGATIVE = ['bad', 'awful', 'boring', 'terrible', 'dull', 'sad', 'poor', 'weak'];
const SUBJECTS = ['movie', 'film', 'story', 'acting', 'music', 'plot', 'ending', 'cast', 'scene'];

function sentiment({ n = 1000, length = 8, seed = 17 }) {
  const r = rng(seed);
  const id = (word) => SENTIMENT_VOCAB.indexOf(word);
  const pick = (list) => list[r.int(list.length)];
  const xs = []; const ys = [];
  for (let i = 0; i < n; i++) {
    let positive = r() < 0.5;
    const words = ['the', pick(SUBJECTS), pick(['was', 'is'])];
    if (r() < 0.4) words.push(pick(['very', 'really', 'quite']));
    const negated = r() < 0.3;
    if (negated) words.push('not');
    words.push(pick(positive ? POSITIVE : NEGATIVE));
    if (negated) positive = !positive;
    if (r() < 0.3 && words.length < length - 2) words.push('and', pick(positive !== negated ? POSITIVE : NEGATIVE));
    const tokens = words.slice(0, length).map(id);
    while (tokens.length < length) tokens.push(0);
    xs.push(...tokens);
    ys.push(positive ? 1 : 0);
  }
  return make({ name: 'Sentiment', kind: 'tokens', inputShape: [length], xs, ys, task: classification(2), labels: ['negative', 'positive'], vocab: SENTIMENT_VOCAB });
}

// ───────────────────────── registry

/** Built-in generators: id → { fn, group, kind, params: [[key, default, min, max, step]] } */
export const GENERATORS = {
  xor: { fn: xor, group: 'points', params: [['n', 240, 40, 4000, 20], ['noise', 0.12, 0, 1, 0.01], ['seed', 1, 1, 9999, 1]] },
  circles: { fn: circles, group: 'points', params: [['n', 400, 40, 4000, 20], ['noise', 0.08, 0, 1, 0.01], ['factor', 0.5, 0.1, 0.9, 0.05], ['seed', 2, 1, 9999, 1]] },
  moons: { fn: moons, group: 'points', params: [['n', 400, 40, 4000, 20], ['noise', 0.1, 0, 1, 0.01], ['seed', 3, 1, 9999, 1]] },
  spiral: { fn: spiral, group: 'points', params: [['n', 450, 60, 6000, 30], ['classes', 3, 2, 6, 1], ['noise', 0.18, 0, 1, 0.01], ['turns', 1.5, 0.5, 3, 0.25], ['seed', 4, 1, 9999, 1]] },
  blobs: { fn: blobs, group: 'points', params: [['n', 400, 40, 4000, 20], ['classes', 4, 2, 8, 1], ['spread', 0.35, 0.05, 1.5, 0.05], ['seed', 5, 1, 9999, 1]] },
  checker: { fn: checker, group: 'points', params: [['n', 600, 60, 6000, 30], ['cells', 3, 2, 6, 1], ['seed', 6, 1, 9999, 1]] },
  line: { fn: line, group: 'functions', params: [['n', 200, 20, 4000, 20], ['slope', 2, -5, 5, 0.1], ['intercept', 0.5, -3, 3, 0.1], ['noise', 0.15, 0, 1, 0.01], ['seed', 7, 1, 9999, 1]] },
  sine: { fn: sine, group: 'functions', params: [['n', 300, 20, 4000, 20], ['frequency', 3, 0.5, 8, 0.5], ['noise', 0.1, 0, 1, 0.01], ['seed', 8, 1, 9999, 1]] },
  friedman: { fn: friedman, group: 'functions', params: [['n', 500, 50, 5000, 50], ['noise', 0.2, 0, 2, 0.05], ['seed', 9, 1, 9999, 1]] },
  digits: { fn: digits, group: 'images', params: [['n', 1500, 100, 6000, 100], ['size', 16, 8, 32, 4], ['noise', 0.04, 0, 0.3, 0.01], ['seed', 10, 1, 9999, 1]] },
  digitsAuto: { fn: (p) => digits({ ...p, reconstruct: true }), group: 'images', params: [['n', 1200, 100, 6000, 100], ['size', 16, 8, 32, 4], ['noise', 0.03, 0, 0.3, 0.01], ['seed', 10, 1, 9999, 1]] },
  digitsNoisy: { fn: digitsNoisy, group: 'images', params: [['n', 1200, 100, 6000, 100], ['size', 16, 8, 32, 4], ['corrupt', 0.35, 0, 1, 0.05], ['seed', 18, 1, 9999, 1]] },
  digitsAnomaly: { fn: digitsAnomaly, group: 'images', params: [['n', 1500, 100, 6000, 100], ['size', 16, 8, 32, 4], ['anomalies', 0.06, 0, 0.3, 0.01], ['seed', 19, 1, 9999, 1]] },
  shapes: { fn: shapes, group: 'images', params: [['n', 1200, 100, 6000, 100], ['size', 24, 12, 40, 4], ['noise', 0.05, 0, 0.3, 0.01], ['seed', 11, 1, 9999, 1]] },
  colorShapes: { fn: colorShapes, group: 'images', params: [['n', 1200, 120, 6000, 60], ['size', 20, 12, 40, 4], ['seed', 12, 1, 9999, 1]] },
  sineForecast: { fn: sineForecast, group: 'sequences', params: [['n', 800, 100, 6000, 100], ['steps', 24, 8, 100, 4], ['noise', 0.05, 0, 0.5, 0.01], ['seed', 13, 1, 9999, 1]] },
  patterns: { fn: patterns, group: 'sequences', params: [['n', 800, 100, 6000, 100], ['steps', 30, 10, 100, 5], ['noise', 0.12, 0, 0.6, 0.01], ['seed', 14, 1, 9999, 1]] },
  counting: { fn: counting, group: 'sequences', params: [['n', 800, 100, 6000, 100], ['steps', 12, 4, 40, 1], ['seed', 15, 1, 9999, 1]] },
  activity: { fn: activity, group: 'sequences', params: [['n', 900, 90, 6000, 90], ['steps', 40, 10, 120, 5], ['seed', 16, 1, 9999, 1]] },
  sentiment: { fn: sentiment, group: 'text', params: [['n', 1000, 100, 6000, 100], ['length', 8, 6, 16, 1], ['seed', 17, 1, 9999, 1]] },
  ...MEDIA_GENERATORS,
};
export const GENERATOR_IDS = Object.keys(GENERATORS);
export const GENERATOR_GROUPS = ['points', 'functions', 'images', 'characters', 'speech', 'video', 'sequences', 'text'];

export function generatorDefaults(id) {
  return Object.fromEntries(GENERATORS[id].params.map(([key, value]) => [key, value]));
}

/** Parameter values clamped to the generator's ranges. */
export function cleanGeneratorParams(id, params = {}) {
  const out = {};
  for (const [key, value, min, max, step] of GENERATORS[id].params) {
    let v = Number(params[key] ?? value);
    if (!Number.isFinite(v)) v = value;
    v = Math.min(max, Math.max(min, v));
    if (Number.isInteger(step)) v = Math.round(v);
    out[key] = v;
  }
  return out;
}

export function generate(id, params = {}) {
  const generator = GENERATORS[id];
  if (!generator) throw new Error(`unknown dataset ${id}`);
  const data = generator.fn(cleanGeneratorParams(id, params));
  data.source = { kind: 'generator', id };
  return data;
}

// ───────────────────────── CSV / tables

/** Splits CSV text into rows (quotes, doubled quotes, CRLF). Delimiter: comma, semicolon or tab (guessed). */
export function parseCsv(text, delimiter = null) {
  const source = String(text ?? '').replace(/^﻿/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
  const sep = delimiter ?? ([',', ';', '\t'].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0]);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return { rows, delimiter: sep };
}

const isNumber = (value) => value.trim() !== '' && Number.isFinite(Number(value));
const isMissing = (value) => ['', 'na', 'nan', 'null', 'none', '?'].includes(String(value).trim().toLowerCase());

/**
 * Describes the columns of a table: [{ name, numeric, unique, missing, values (categories) }].
 * The first row is the header when any of its cells is not a number.
 */
export function describeTable(rows) {
  if (!rows.length) return { header: [], body: [], columns: [] };
  const hasHeader = rows[0].some((cell) => !isNumber(cell) && !isMissing(cell));
  const header = hasHeader ? rows[0].map((cell, i) => cell.trim() || `col${i + 1}`) : rows[0].map((_, i) => `col${i + 1}`);
  const body = (hasHeader ? rows.slice(1) : rows).filter((row) => row.length >= header.length - 1);
  const columns = header.map((name, i) => {
    const cells = body.map((row) => row[i] ?? '');
    const present = cells.filter((cell) => !isMissing(cell));
    const numeric = present.length > 0 && present.every(isNumber);
    const unique = [...new Set(present.map((cell) => cell.trim()))];
    return { name, index: i, numeric, unique: unique.length, missing: cells.length - present.length, values: numeric ? null : unique.sort() };
  });
  return { header, body, columns };
}

/** Is a column best treated as class labels? (text, or few distinct whole numbers) */
export function looksCategorical(column) {
  return !column.numeric || column.unique <= Math.min(20, column.uniqueLimit ?? 20);
}

/**
 * A dataset from a parsed table. options = { target (column name), features (names; default: all others),
 * task: 'auto'|'classification'|'regression' }. Text features become one-hot columns; missing numbers
 * get the column mean.
 */
export function fromTable(rows, { target, features = null, task = 'auto', name = 'CSV' } = {}) {
  const { body, columns } = describeTable(rows);
  const targetColumn = columns.find((column) => column.name === target) ?? columns.at(-1);
  if (!targetColumn) throw new Error('data.noColumns');
  const featureColumns = columns.filter((column) => column !== targetColumn && (!features || features.includes(column.name)));
  if (!featureColumns.length) throw new Error('data.noFeatures');
  const kind = task === 'auto' ? (looksCategorical(targetColumn) ? 'classification' : 'regression') : task;
  const featureNames = [];
  const columnsSpec = featureColumns.map((column) => {
    if (column.numeric) {
      const values = body.map((row) => row[column.index]).filter((cell) => !isMissing(cell)).map(Number);
      featureNames.push(column.name);
      return { name: column.name, mean: values.reduce((a, b) => a + b, 0) / Math.max(1, values.length) };
    }
    featureNames.push(...column.values.map((value) => `${column.name}=${value}`));
    return { name: column.name, categories: column.values };
  });
  const encoders = columnsSpec.map((spec, k) => (row) => encodeCell(spec, row[featureColumns[k].index]));
  const labels = kind === 'classification'
    ? [...new Set(body.map((row) => (row[targetColumn.index] ?? '').trim()).filter((value) => !isMissing(value)))].sort((a, b) => (isNumber(a) && isNumber(b) ? Number(a) - Number(b) : a.localeCompare(b)))
    : null;
  const xs = []; const ys = [];
  for (const row of body) {
    const raw = (row[targetColumn.index] ?? '').trim();
    if (isMissing(raw)) continue;
    if (kind === 'regression' && !isNumber(raw)) continue;
    for (const encode of encoders) xs.push(...encode(row));
    ys.push(kind === 'classification' ? labels.indexOf(raw) : Number(raw));
  }
  if (!ys.length) throw new Error('data.noRows');
  const taskInfo = kind === 'classification' ? classification(labels.length) : regression();
  const data = make({ name, kind: featureNames.length === 2 && kind === 'classification' ? 'points2d' : featureNames.length === 1 && kind === 'regression' ? 'function1d' : 'vector', inputShape: [featureNames.length], xs, ys, task: taskInfo, labels, featureNames });
  data.source = { kind: 'table', target: targetColumn.name };
  data.columnsSpec = columnsSpec;
  return data;
}

/**
 * A dataset from decoded pictures: items = [{ label, pixels: Float32Array (size·size·channels, 0…1) }].
 */
export function fromImages(items, { size: px, channels = 1, name = 'Images' } = {}) {
  const labels = [...new Set(items.map((item) => item.label))].sort();
  const xs = []; const ys = [];
  for (const item of items) {
    xs.push(...item.pixels);
    ys.push(labels.indexOf(item.label));
  }
  const data = make({ name, kind: 'image', inputShape: [px, px, channels], xs, ys, task: classification(labels.length), labels });
  data.source = { kind: 'images' };
  return data;
}

/** One sample's input values (a view, not a copy). */
export function sampleX(data, i) {
  const s = size(data.inputShape);
  return data.x.subarray(i * s, (i + 1) * s);
}

/** One sample's target: a class index, or the values. */
export function sampleY(data, i) {
  if (data.task.kind === 'classification') return data.y[i];
  const s = size(data.task.outputShape);
  return data.y.subarray(i * s, (i + 1) * s);
}

/** How many samples each class has. */
export function classCounts(data) {
  if (data.task.kind !== 'classification') return null;
  const counts = new Array(data.task.classes).fill(0);
  for (let i = 0; i < data.n; i++) counts[data.y[i]]++;
  return counts;
}

/** Min, max, mean, std of each feature (vector data) or of all values (images, sequences). */
export function featureStats(data, limit = 64) {
  const s = size(data.inputShape);
  const perFeature = data.kind === 'vector' || data.kind === 'points2d' || data.kind === 'function1d';
  const media = data.kind === 'audio' || data.kind === 'video';
  const groups = perFeature ? Math.min(limit, s) : media ? 1 : (data.inputShape.at(-1) ?? 1);
  const stats = Array.from({ length: groups }, () => ({ min: Infinity, max: -Infinity, sum: 0, sq: 0, count: 0 }));
  for (let i = 0; i < data.n; i++) {
    for (let j = 0; j < s; j++) {
      const g = perFeature ? j : j % groups;
      if (g >= groups) continue;
      const v = data.x[i * s + j];
      const st = stats[g];
      st.min = Math.min(st.min, v); st.max = Math.max(st.max, v); st.sum += v; st.sq += v * v; st.count++;
    }
  }
  return stats.map((st, g) => {
    const mean = st.sum / Math.max(1, st.count);
    return { name: perFeature ? (data.featureNames?.[g] ?? `x${g + 1}`) : !media && data.inputShape.length > 1 ? `ch${g}` : 'x', min: st.min, max: st.max, mean, std: Math.sqrt(Math.max(0, st.sq / Math.max(1, st.count) - mean * mean)) };
  });
}

/**
 * The dataset a project's data source describes: a generator (params, `overrides` on top — tests
 * shrink n), a CSV table (`rows` reuses parsed rows) or pictures (base64 bytes per item).
 */
// Spectrograms of a few thousand clips take a while: the last result per clip set is kept.
const soundMemo = new WeakMap();

function soundRecipe(source, overrides = {}) {
  const p = { ...source, ...overrides };
  return { key: JSON.stringify([source.name, p.seconds, p.copies, p.noiseClass, p.seed, p.layout]), options: { name: source.name, seconds: p.seconds, copies: p.copies, noiseClass: p.noiseClass, seed: p.seed, layout: p.layout } };
}

/** Is the dataset of these clips for this source made already (fromSource would return at once)? */
export const soundsReady = (source, clips) => soundMemo.get(clips)?.key === soundRecipe(source).key;

/** Makes the dataset of a sounds source in the background (onProgress 0…1); fromSource then returns it at once. */
export async function prepareSounds(source, clips, onProgress) {
  const { key, options } = soundRecipe(source);
  if (soundMemo.get(clips)?.key === key) return;
  const data = await fromSoundsAsync(clips, options, onProgress);
  soundMemo.set(clips, { key, data });
}

export function fromSource(source, { overrides = {}, rows = null, decode = null, sounds = null } = {}) {
  if (source.kind === 'generator') return generate(source.id, { ...source.params, ...overrides });
  if (source.kind === 'table') return fromTable(rows ?? parseCsv(source.text).rows, { target: source.target, features: source.features, task: source.task, name: source.name });
  if (source.kind === 'images') {
    const items = source.items.map((item) => ({ label: item.label, pixels: Float32Array.from(decode(item.data), (v) => v / 255) }));
    return fromImages(items, { size: source.size, channels: source.channels, name: source.name });
  }
  if (source.kind === 'sounds') {
    // The clips: a built-in bank (loaded by the app, passed in) or the project's own µ-law items.
    const clips = sounds ?? (source.items?.length && decode ? source.items.map((item) => ({ label: item.label, wave: fromMulaw(decode(item.data)) })) : null);
    if (!clips) throw new Error('data.loadingSounds');
    const { key, options } = soundRecipe(source, overrides);
    const memo = soundMemo.get(clips);
    if (memo?.key === key) return memo.data;
    const data = fromSounds(clips, options);
    soundMemo.set(clips, { key, data });
    return data;
  }
  throw new Error(`unknown data source ${source.kind}`);
}

/** One cell as the network sees it: the number (missing → the column mean) or one-hot categories. */
export function encodeCell(spec, cell) {
  const text = String(cell ?? '').trim();
  if (spec.categories) return spec.categories.map((value) => (text === value ? 1 : 0));
  return [isMissing(text) || !isNumber(text) ? spec.mean : Number(text)];
}

/**
 * New rows of a CSV (with a header) encoded like the training table: columns are matched by name,
 * a missing column counts as missing values. Returns { values: [Float32Array per row], missing: [column names] }.
 */
export function encodeTableRows(columnsSpec, rows) {
  const { header, body } = describeTable(rows);
  const index = new Map(header.map((name, i) => [name.trim(), i]));
  const missing = columnsSpec.filter((spec) => !index.has(spec.name)).map((spec) => spec.name);
  const values = body.map((row) => Float32Array.from(columnsSpec.flatMap((spec) => encodeCell(spec, index.has(spec.name) ? row[index.get(spec.name)] : ''))));
  return { values, missing, header };
}
