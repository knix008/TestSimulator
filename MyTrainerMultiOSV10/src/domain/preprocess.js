// Preprocessing: shuffle and split a dataset into train / validation / test,
// then run the user's pipeline of steps. Statistics (means, ranges) are fitted
// on the training part only and applied to all three, as they should be.
// Augmentation steps add transformed copies to the training part only.
import { rng } from './datasets.js';

const size = (shape) => shape.reduce((a, b) => a * b, 1);

/** Step types: id → { params: [[key, default, min, max, step]], kinds (data kinds it applies to; null = all) }. */
export const STEPS = {
  standardize: { icon: 'ppStandardize', params: [], kinds: null },
  minmax: { icon: 'ppMinmax', params: [['low', 0, -10, 10, 0.5], ['high', 1, -10, 10, 0.5]], kinds: null },
  polynomial: { icon: 'ppPolynomial', params: [['degree', 2, 2, 3, 1]], kinds: ['points2d', 'function1d', 'vector'] },
  clip: { icon: 'ppClip', params: [['low', -3, -100, 100, 0.5], ['high', 3, -100, 100, 0.5]], kinds: null },
  noise: { icon: 'ppNoise', params: [['copies', 1, 1, 5, 1], ['std', 0.05, 0.001, 1, 0.01]], kinds: ['points2d', 'function1d', 'vector', 'image', 'sequence', 'audio', 'video'] },
  flipH: { icon: 'ppFlip', params: [], kinds: ['image'] },
  shift: { icon: 'ppShift', params: [['copies', 1, 1, 4, 1], ['pixels', 2, 1, 6, 1]], kinds: ['image'] },
  invert: { icon: 'ppInvert', params: [], kinds: ['image'] },
};
export const STEP_IDS = Object.keys(STEPS);

export const stepApplies = (type, kind) => !STEPS[type].kinds || STEPS[type].kinds.includes(kind);

export function newStep(type) {
  return { type, params: Object.fromEntries(STEPS[type].params.map(([key, value]) => [key, value])) };
}

export function cleanSteps(steps) {
  return (Array.isArray(steps) ? steps : []).filter((step) => STEPS[step?.type]).map((step) => {
    const params = {};
    for (const [key, value, min, max, s] of STEPS[step.type].params) {
      let v = Number(step.params?.[key] ?? value);
      if (!Number.isFinite(v)) v = value;
      v = Math.min(max, Math.max(min, v));
      if (Number.isInteger(s)) v = Math.round(v);
      params[key] = v;
    }
    return { type: step.type, params, enabled: step.enabled !== false };
  });
}

export const defaultSplit = () => ({ val: 0.15, test: 0.15, seed: 42, shuffle: true, stratify: true });

export function cleanSplit(split = {}) {
  const base = defaultSplit();
  const clamp = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
  const out = {
    val: clamp(split.val, 0, 0.5, base.val),
    test: clamp(split.test, 0, 0.5, base.test),
    seed: Math.round(clamp(split.seed, 1, 99999, base.seed)),
    shuffle: split.shuffle !== false,
    stratify: split.stratify !== false,
  };
  if (out.val + out.test > 0.8) out.test = Math.max(0, 0.8 - out.val);
  return out;
}

/** Index lists for the three parts. Stratified: each class is split in the same proportions. */
export function splitIndices(data, split) {
  const s = cleanSplit(split);
  const r = rng(s.seed);
  const shuffle = (list) => {
    if (!s.shuffle) return list;
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  const groups = [];
  if (s.stratify && data.task.kind === 'classification') {
    const byClass = Array.from({ length: data.task.classes }, () => []);
    for (let i = 0; i < data.n; i++) byClass[data.y[i]]?.push(i);
    groups.push(...byClass);
  } else groups.push(Array.from({ length: data.n }, (_, i) => i));
  const train = []; const val = []; const test = [];
  for (const group of groups) {
    const list = shuffle([...group]);
    const nTest = Math.round(list.length * s.test);
    const nVal = Math.round(list.length * s.val);
    test.push(...list.slice(0, nTest));
    val.push(...list.slice(nTest, nTest + nVal));
    train.push(...list.slice(nTest + nVal));
  }
  return { train: shuffle(train), val: shuffle(val), test: shuffle(test) };
}

function take(data, indices) {
  const sx = size(data.inputShape);
  const sy = data.task.kind === 'classification' ? 1 : size(data.task.outputShape);
  const x = new Float32Array(indices.length * sx);
  const y = new Float32Array(indices.length * sy);
  indices.forEach((index, i) => {
    x.set(data.x.subarray(index * sx, (index + 1) * sx), i * sx);
    y.set(data.y.subarray(index * sy, (index + 1) * sy), i * sy);
  });
  return { x, y, n: indices.length, index: Int32Array.from(indices) };
}

/** Per-feature (vectors) or per-channel (images, sequences) statistic groups. */
export function groupsOf(kind, inputShape) {
  // Spectrograms and video clips: one set of statistics for all values.
  if (kind === 'audio' || kind === 'video') return { count: 1, of: () => 0 };
  if (kind === 'image' || kind === 'sequence') return { count: inputShape.at(-1), of: (j) => j % inputShape.at(-1) };
  return { count: size(inputShape), of: (j) => j };
}

function fitStats(part, inputShape, kind) {
  const s = size(inputShape);
  const { count, of } = groupsOf(kind, inputShape);
  const stats = Array.from({ length: count }, () => ({ sum: 0, sq: 0, min: Infinity, max: -Infinity, n: 0 }));
  for (let i = 0; i < part.n; i++) {
    for (let j = 0; j < s; j++) {
      const v = part.x[i * s + j];
      const st = stats[of(j)];
      st.sum += v; st.sq += v * v; st.n++;
      if (v < st.min) st.min = v;
      if (v > st.max) st.max = v;
    }
  }
  return stats.map((st) => {
    const mean = st.sum / Math.max(1, st.n);
    const std = Math.sqrt(Math.max(0, st.sq / Math.max(1, st.n) - mean * mean)) || 1;
    return { mean, std, min: st.n ? st.min : 0, max: st.n ? st.max : 1 };
  });
}

function mapValues(parts, inputShape, kind, fn) {
  const s = size(inputShape);
  const { of } = groupsOf(kind, inputShape);
  for (const part of parts) {
    for (let i = 0; i < part.n; i++) for (let j = 0; j < s; j++) part.x[i * s + j] = fn(part.x[i * s + j], of(j));
  }
}

function polynomialFeatures(part, inputShape, degree) {
  const d = inputShape[0];
  const terms = [];
  for (let a = 0; a < d; a++) terms.push([a]);
  for (let a = 0; a < d; a++) for (let b = a; b < d; b++) terms.push([a, b]);
  if (degree >= 3) for (let a = 0; a < d; a++) for (let b = a; b < d; b++) for (let c = b; c < d; c++) terms.push([a, b, c]);
  const out = new Float32Array(part.n * terms.length);
  for (let i = 0; i < part.n; i++) {
    terms.forEach((term, t) => { out[i * terms.length + t] = term.reduce((p, j) => p * part.x[i * d + j], 1); });
  }
  return { part: { ...part, x: out }, terms };
}

function appendCopies(part, inputShape, copies, transform) {
  const s = size(inputShape);
  const sy = part.y.length / Math.max(1, part.n);
  const n = part.n * (copies + 1);
  const x = new Float32Array(n * s);
  const y = new Float32Array(n * sy);
  x.set(part.x);
  y.set(part.y);
  for (let c = 1; c <= copies; c++) {
    for (let i = 0; i < part.n; i++) {
      const sample = part.x.slice(i * s, (i + 1) * s);
      x.set(transform(sample, c), (c * part.n + i) * s);
      y.set(part.y.subarray(i * sy, (i + 1) * sy), (c * part.n + i) * sy);
    }
  }
  return { x, y, n, index: Int32Array.from({ length: n }, (_, i) => part.index[i % part.n]) };
}

function shiftImage(sample, [h, w, ch], dx, dy) {
  const out = new Float32Array(sample.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x - dx;
    const sy = y - dy;
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
    for (let c = 0; c < ch; c++) out[(y * w + x) * ch + c] = sample[(sy * w + sx) * ch + c];
  }
  return out;
}

/**
 * Split + pipeline. Returns { train, val, test (each { x, y, n, index }), inputShape, featureNames, applied: [{ type, note }], stats }.
 * Reconstruction targets follow the input (they are re-derived from x after the steps).
 */
export function prepare(data, steps = [], split = defaultSplit()) {
  const indices = splitIndices(data, split);
  let parts = { train: take(data, indices.train), val: take(data, indices.val), test: take(data, indices.test) };
  let inputShape = [...data.inputShape];
  let featureNames = data.featureNames ? [...data.featureNames] : null;
  const applied = [];
  const r = rng((cleanSplit(split).seed * 31) + 7);
  const reconstruct = data.task.kind === 'reconstruction';
  for (const step of cleanSteps(steps)) {
    if (!step.enabled || !stepApplies(step.type, data.kind)) continue;
    const p = step.params;
    const all = [parts.train, parts.val, parts.test];
    switch (step.type) {
      case 'standardize': {
        const stats = fitStats(parts.train, inputShape, data.kind);
        mapValues(all, inputShape, data.kind, (v, g) => (v - stats[g].mean) / stats[g].std);
        applied.push({ type: step.type, stats, inputShape: [...inputShape] });
        break;
      }
      case 'minmax': {
        const stats = fitStats(parts.train, inputShape, data.kind);
        mapValues(all, inputShape, data.kind, (v, g) => p.low + ((v - stats[g].min) / ((stats[g].max - stats[g].min) || 1)) * (p.high - p.low));
        applied.push({ type: step.type, stats, low: p.low, high: p.high, inputShape: [...inputShape] });
        break;
      }
      case 'clip':
        mapValues(all, inputShape, data.kind, (v) => Math.min(p.high, Math.max(p.low, v)));
        applied.push({ type: step.type, low: p.low, high: p.high });
        break;
      case 'polynomial': {
        if (inputShape.length !== 1) break;
        let terms = null;
        for (const key of ['train', 'val', 'test']) ({ part: parts[key], terms } = polynomialFeatures(parts[key], inputShape, p.degree));
        const names = featureNames ?? Array.from({ length: inputShape[0] }, (_, i) => `x${i + 1}`);
        featureNames = terms.map((term) => term.map((j) => names[j]).join('·'));
        inputShape = [terms.length];
        applied.push({ type: step.type, features: terms.length, terms, inputShape: [terms[0] ? Math.max(...terms.flat()) + 1 : 0] });
        break;
      }
      case 'noise':
        parts.train = appendCopies(parts.train, inputShape, p.copies, (sample) => sample.map((v) => v + r.normal() * p.std));
        applied.push({ type: step.type, samples: parts.train.n });
        break;
      case 'flipH': {
        const [h, w, ch] = inputShape;
        parts.train = appendCopies(parts.train, inputShape, 1, (sample) => {
          const out = new Float32Array(sample.length);
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) out[(y * w + x) * ch + c] = sample[(y * w + (w - 1 - x)) * ch + c];
          return out;
        });
        applied.push({ type: step.type, samples: parts.train.n });
        break;
      }
      case 'shift':
        parts.train = appendCopies(parts.train, inputShape, p.copies, (sample) => shiftImage(sample, inputShape, Math.round((r() * 2 - 1) * p.pixels), Math.round((r() * 2 - 1) * p.pixels)));
        applied.push({ type: step.type, samples: parts.train.n });
        break;
      case 'invert': {
        mapValues(all, inputShape, data.kind, (v) => 1 - v);
        applied.push({ type: step.type });
        break;
      }
      default: break;
    }
  }
  if (reconstruct) {
    for (const part of Object.values(parts)) part.y = Float32Array.from(part.x);
  }
  parts = { ...parts };
  const task = reconstruct ? { ...data.task, outputShape: [size(inputShape)] } : data.task;
  return { ...parts, inputShape, featureNames, applied, task, kind: data.kind, labels: data.labels, vocab: data.vocab, media: data.media ?? null };
}

/** Targets as the network wants them: one-hot rows (classification with several outputs), or the values. */
export function targetsFor(part, task) {
  if (task.kind !== 'classification') return { values: part.y, shape: [part.n, part.y.length / Math.max(1, part.n)] };
  const outputs = task.binaryOutput === 1 ? 1 : task.classes;
  if (outputs === 1) return { values: Float32Array.from(part.y), shape: [part.n, 1] };
  const values = new Float32Array(part.n * outputs);
  for (let i = 0; i < part.n; i++) values[i * outputs + part.y[i]] = 1;
  return { values, shape: [part.n, outputs] };
}

/**
 * Applies the fitted, non-augmenting steps of a prepared dataset to one raw sample (a drawn picture,
 * typed values): the same scaling the network saw while training.
 */
export function transformInput(prepared, rawInput, rawShape) {
  let x = Float32Array.from(rawInput);
  let shape = [...rawShape];
  for (const step of prepared.applied ?? []) {
    const { of } = groupsOf(prepared.kind, shape);
    if (step.type === 'standardize') x = x.map((v, j) => (v - step.stats[of(j)].mean) / step.stats[of(j)].std);
    else if (step.type === 'minmax') x = x.map((v, j) => { const st = step.stats[of(j)]; return step.low + ((v - st.min) / ((st.max - st.min) || 1)) * (step.high - step.low); });
    else if (step.type === 'clip') x = x.map((v) => Math.min(step.high, Math.max(step.low, v)));
    else if (step.type === 'invert') x = x.map((v) => 1 - v);
    else if (step.type === 'polynomial') {
      x = Float32Array.from(step.terms.map((term) => term.reduce((p, j) => p * x[j], 1)));
      shape = [step.terms.length];
    }
  }
  return x;
}
