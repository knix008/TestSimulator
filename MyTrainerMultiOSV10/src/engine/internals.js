// What happens inside one node: from a snapshot (the probe input's activations
// of every layer plus the weights), recompute a single neuron / channel / cell
// step by step — inputs × weights + bias = z, activation(z) = a — so the
// inspector can show the arithmetic. Recurrent layers are unrolled over time
// with their gates (LSTM: input, forget, candidate, output; GRU: update, reset,
// candidate). Everything works on the engine-neutral snapshot format, so both
// TensorFlow.js and PyTorch runs can be explained.
import { incoming, nodeById } from '../domain/graph.js';
import { ACTIVATION_FN, ACTIVATION_FORMULA, convLength, softmax } from '../domain/layers.js';

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/** Number of "units" a node shows: features / channels / hidden units (last dimension). */
export const unitsOf = (shape) => (shape?.length ? shape.at(-1) : 0);

/** Value at a channels-last position. */
export function valueAt(act, position, unit) {
  if (!act?.data) return null;
  const shape = act.shape;
  // A size-1 axis is broadcast (BC-ResNet's frequency average added back to the full picture).
  const at = (value, size) => (size === 1 ? 0 : value);
  const u = at(unit, shape.at(-1));
  if (shape.length === 1) return act.data[u];
  if (shape.length === 2) return act.data[at(position.t ?? shape[0] - 1, shape[0]) * shape[1] + u];
  if (shape.length === 3) return act.data[(at(position.row ?? 0, shape[0]) * shape[1] + at(position.col ?? 0, shape[1])) * shape[2] + u];
  return null;
}

/** All values of one unit (a channel's feature map, a feature over time, or the single value). */
export function unitValues(act, unit) {
  if (!act?.data) return null;
  const shape = act.shape;
  const c = shape.at(-1);
  const count = act.data.length / c;
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = act.data[i * c + unit];
  return out;
}

function sourceAct(graph, snapshot, id, index = 0) {
  const edge = incoming(graph, id)[index];
  return edge ? { id: edge.from, act: snapshot.nodes[edge.from]?.act ?? (snapshot.inputNodeId === edge.from ? snapshot.input : null), node: nodeById(graph, edge.from) } : null;
}

function samePad(length, kernel, stride, padding) {
  if (padding !== 'same') return 0;
  const out = Math.ceil(length / stride);
  return Math.floor(Math.max((out - 1) * stride + kernel - length, 0) / 2);
}

const fn = (activation) => ACTIVATION_FN[activation] ?? ACTIVATION_FN.linear;

/** Most influential contributions first, at most `limit`, plus the sum of the rest. */
function topContributions(items, limit = 16) {
  const sorted = [...items].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const shown = sorted.slice(0, limit);
  const rest = sorted.slice(limit).reduce((sum, item) => sum + item.contribution, 0);
  return { shown, rest, hidden: Math.max(0, sorted.length - limit) };
}

/**
 * Explains unit `unit` of node `id` at `position` ({ t } for sequences, { row, col } for pictures).
 * Returns { kind, unit, inputs, bias, z, activation, formula, a, actual, ... } or null when the snapshot lacks data.
 */
export function explainUnit(graph, snapshot, id, unit, position = {}) {
  const node = nodeById(graph, id);
  if (!node || !snapshot) return null;
  const entry = snapshot.nodes[id];
  const act = entry?.act;
  const p = node.params;
  const actual = act ? valueAt(act, position, unit) : null;
  const weights = entry?.weights ?? {};
  const src = sourceAct(graph, snapshot, id);
  switch (node.type) {
    case 'input':
      return { kind: 'value', unit, a: actual, actual };
    case 'dense': {
      const kernel = weights.kernel;
      const x = src?.act;
      if (!kernel?.data || !x?.data) return { kind: 'value', unit, a: actual, actual };
      const [inputs, units] = kernel.shape;
      const offset = x.shape.length === 2 ? (position.t ?? x.shape[0] - 1) * inputs : 0;
      const items = [];
      for (let i = 0; i < inputs; i++) {
        const xi = x.data[offset + i];
        const wi = kernel.data[i * units + unit];
        items.push({ index: i, label: inputLabel(src, i, snapshot), x: xi, w: wi, contribution: xi * wi });
      }
      const bias = weights.bias?.data ? weights.bias.data[unit] : 0;
      const z = items.reduce((sum, item) => sum + item.contribution, bias);
      let a;
      if (p.activation === 'softmax') {
        const zs = [];
        for (let u = 0; u < units; u++) {
          let s = weights.bias?.data ? weights.bias.data[u] : 0;
          for (let i = 0; i < inputs; i++) s += x.data[offset + i] * kernel.data[i * units + u];
          zs.push(s);
        }
        a = softmax(zs)[unit];
        return { kind: 'neuron', unit, ...topContributions(items), count: items.length, bias, z, activation: p.activation, formula: ACTIVATION_FORMULA.softmax, a, actual, zs };
      }
      a = fn(p.activation)(z);
      return { kind: 'neuron', unit, ...topContributions(items), count: items.length, bias, z, activation: p.activation, formula: ACTIVATION_FORMULA[p.activation], a, actual, weightsIn: Array.from({ length: inputs }, (_, i) => kernel.data[i * units + unit]) };
    }
    case 'conv2d': {
      const kernel = weights.kernel;
      const x = src?.act;
      if (!kernel?.data || !x?.data) return { kind: 'value', unit, a: actual, actual };
      const [k, , cin, filters] = kernel.shape;
      const [h, w] = x.shape;
      const row = position.row ?? 0;
      const col = position.col ?? 0;
      const top = samePad(h, k, p.strides, p.padding);
      const left = samePad(w, k, p.strides, p.padding);
      const items = [];
      const patch = [];
      for (let ky = 0; ky < k; ky++) for (let kx = 0; kx < k; kx++) {
        const iy = row * p.strides + ky - top;
        const ix = col * p.strides + kx - left;
        for (let c = 0; c < cin; c++) {
          const inside = iy >= 0 && ix >= 0 && iy < h && ix < w;
          const xi = inside ? x.data[(iy * w + ix) * cin + c] : 0;
          const wi = kernel.data[((ky * k + kx) * cin + c) * filters + unit];
          items.push({ index: items.length, label: `(${iy},${ix})·c${c}`, x: xi, w: wi, contribution: xi * wi });
          if (c === 0) patch.push({ ky, kx, iy, ix, inside });
        }
      }
      const bias = weights.bias?.data ? weights.bias.data[unit] : 0;
      const z = items.reduce((sum, item) => sum + item.contribution, bias);
      const kernelSlices = Array.from({ length: cin }, (_, c) => Array.from({ length: k * k }, (__, i) => kernel.data[(i * cin + c) * filters + unit]));
      return { kind: 'conv', unit, row, col, kernelSize: k, inChannels: cin, patch, kernelSlices, ...topContributions(items), count: items.length, bias, z, activation: p.activation, formula: ACTIVATION_FORMULA[p.activation], a: fn(p.activation)(z), actual };
    }
    case 'conv1d': {
      const kernel = weights.kernel;
      const x = src?.act;
      if (!kernel?.data || !x?.data) return { kind: 'value', unit, a: actual, actual };
      const [k, cin, filters] = kernel.shape;
      const length = x.shape[0];
      const t = position.t ?? 0;
      const left = samePad(length, k, p.strides, p.padding);
      const items = [];
      for (let kt = 0; kt < k; kt++) {
        const it = t * p.strides + kt - left;
        for (let c = 0; c < cin; c++) {
          const xi = it >= 0 && it < length ? x.data[it * cin + c] : 0;
          const wi = kernel.data[(kt * cin + c) * filters + unit];
          items.push({ index: items.length, label: `t${it}·c${c}`, x: xi, w: wi, contribution: xi * wi });
        }
      }
      const bias = weights.bias?.data ? weights.bias.data[unit] : 0;
      const z = items.reduce((sum, item) => sum + item.contribution, bias);
      return { kind: 'neuron', unit, t, ...topContributions(items), count: items.length, bias, z, activation: p.activation, formula: ACTIVATION_FORMULA[p.activation], a: fn(p.activation)(z), actual };
    }
    case 'activation':
    case 'leakyRelu': {
      const x = src?.act ? valueAt(src.act, position, unit) : null;
      if (x == null) return { kind: 'value', unit, a: actual, actual };
      if (node.type === 'leakyRelu') return { kind: 'elementwise', unit, x, formula: `a = z (z ≥ 0), ${p.alpha}·z (z < 0)`, a: x >= 0 ? x : p.alpha * x, actual };
      if (p.activation === 'softmax') return { kind: 'elementwise', unit, x, formula: ACTIVATION_FORMULA.softmax, a: actual, actual };
      return { kind: 'elementwise', unit, x, formula: ACTIVATION_FORMULA[p.activation], a: fn(p.activation)(x), actual };
    }
    case 'dropout': {
      const x = src?.act ? valueAt(src.act, position, unit) : null;
      return { kind: 'dropout', unit, x, rate: p.rate, a: x, actual };
    }
    case 'batchNorm': {
      const x = src?.act ? valueAt(src.act, position, unit) : null;
      const g = weights.gamma?.data?.[unit] ?? 1;
      const b = weights.beta?.data?.[unit] ?? 0;
      const mean = weights.movingMean?.data?.[unit] ?? 0;
      const variance = weights.movingVariance?.data?.[unit] ?? 1;
      if (x == null) return { kind: 'value', unit, a: actual, actual };
      const normalized = (x - mean) / Math.sqrt(variance + p.epsilon);
      return { kind: 'batchNorm', unit, x, mean, variance, gamma: g, beta: b, normalized, a: normalized * g + b, actual };
    }
    case 'maxPool2d':
    case 'avgPool2d': {
      const x = src?.act;
      if (!x?.data) return { kind: 'value', unit, a: actual, actual };
      const [h, w, c] = x.shape;
      const row = position.row ?? 0;
      const col = position.col ?? 0;
      const values = [];
      for (let py = 0; py < p.poolSize; py++) for (let px = 0; px < p.poolSize; px++) {
        const iy = row * p.strides + py;
        const ix = col * p.strides + px;
        if (iy < h && ix < w) values.push({ iy, ix, value: x.data[(iy * w + ix) * c + unit] });
      }
      const a = node.type === 'maxPool2d' ? Math.max(...values.map((v) => v.value)) : values.reduce((s, v) => s + v.value, 0) / Math.max(1, values.length);
      return { kind: 'pool', unit, row, col, mode: node.type === 'maxPool2d' ? 'max' : 'avg', values, a, actual };
    }
    case 'embedding': {
      const x = src?.act;
      const table = weights.embeddings;
      const t = position.t ?? 0;
      if (!x?.data || !table?.data) return { kind: 'value', unit, a: actual, actual };
      const token = Math.round(x.data[t]);
      const vector = Array.from({ length: table.shape[1] }, (_, d) => table.data[token * table.shape[1] + d]);
      return { kind: 'embedding', unit, t, token, word: snapshot.vocab?.[token] ?? null, vector, a: vector[unit], actual };
    }
    case 'simpleRnn':
    case 'lstm':
    case 'gru':
      return explainRecurrent(node, entry, src, unit, position);
    case 'depthwiseConv2d': {
      // Output channel f looks only at input channel ⌊f / m⌋ (m = depth multiplier).
      const kernel = weights.kernel;
      const x = src?.act;
      if (!kernel?.data || !x?.data) return { kind: 'value', unit, a: actual, actual };
      const [kh, kw, cin, m] = kernel.shape;
      const [h, w] = x.shape;
      const c = Math.floor(unit / m);
      const j = unit % m;
      const row = position.row ?? 0;
      const col = position.col ?? 0;
      const top = samePad(h, kh, p.strides, p.padding);
      const left = samePad(w, kw, p.strides, p.padding);
      const items = [];
      const patch = [];
      for (let ky = 0; ky < kh; ky++) for (let kx = 0; kx < kw; kx++) {
        const iy = row * p.strides + ky - top;
        const ix = col * p.strides + kx - left;
        const inside = iy >= 0 && ix >= 0 && iy < h && ix < w;
        const xi = inside ? x.data[(iy * w + ix) * cin + c] : 0;
        const wi = kernel.data[((ky * kw + kx) * cin + c) * m + j];
        items.push({ index: items.length, label: `(${iy},${ix})·c${c}`, x: xi, w: wi, contribution: xi * wi });
        patch.push({ ky, kx, iy, ix, inside });
      }
      const bias = weights.bias?.data ? weights.bias.data[unit] : 0;
      const z = items.reduce((sum, item) => sum + item.contribution, bias);
      const slice = Array.from({ length: kh * kw }, (_, i) => kernel.data[(i * cin + c) * m + j]);
      return { kind: 'conv', unit, row, col, kernelSize: kh === kw ? kh : `${kh}×${kw}`, kernelH: kh, kernelW: kw, inChannels: 1, depthwiseChannel: c, patch, kernelSlices: [slice], ...topContributions(items), count: items.length, bias, z, activation: p.activation, formula: ACTIVATION_FORMULA[p.activation], a: fn(p.activation)(z), actual };
    }
    case 'freqAvgPool': {
      const x = src?.act;
      if (!x?.data) return { kind: 'value', unit, a: actual, actual };
      const [h, w, c] = x.shape;
      const col = position.col ?? 0;
      const values = Array.from({ length: h }, (_, iy) => ({ iy, ix: col, value: x.data[(iy * w + col) * c + unit] }));
      return { kind: 'pool', unit, row: 0, col, mode: 'avg', values, a: values.reduce((sum, v) => sum + v.value, 0) / Math.max(1, h), actual };
    }
    case 'tokenPositionEmbedding': {
      const x = src?.act;
      const table = weights.embeddings;
      const positions = weights.positions;
      const t = position.t ?? 0;
      if (!x?.data || !table?.data || !positions?.data) return { kind: 'value', unit, a: actual, actual };
      const d = table.shape[1];
      const token = Math.round(x.data[t]);
      const vector = Array.from({ length: d }, (_, k) => table.data[token * d + k] + positions.data[t * d + k]);
      const tokenPart = table.data[token * d + unit];
      const positionPart = positions.data[t * d + unit];
      return { kind: 'embedding', unit, t, token, word: snapshot.vocab?.[token] ?? null, vector, tokenPart, positionPart, a: tokenPart + positionPart, actual };
    }
    case 'lastStep': {
      const x = src?.act;
      if (!x?.data) return { kind: 'value', unit, a: actual, actual };
      const last = x.shape[0] - 1;
      return { kind: 'elementwise', unit, x: x.data[last * x.shape[1] + unit], formula: `a = x[t = ${last}]`, a: x.data[last * x.shape[1] + unit], actual };
    }
    case 'selfAttention':
      return explainAttention(node, entry, src, unit, position, snapshot);
    case 'add':
    case 'concatenate': {
      const sources = incoming(graph, id).map((edge, i) => sourceAct(graph, snapshot, id, i));
      if (node.type === 'add') {
        const parts = sources.map((s) => ({ name: s?.node?.name ?? '?', value: s?.act ? valueAt(s.act, position, unit) : null }));
        return { kind: 'add', unit, parts, a: parts.reduce((sum, part) => sum + (part.value ?? 0), 0), actual };
      }
      let offset = unit;
      for (const s of sources) {
        const c = unitsOf(s?.act?.shape);
        if (offset < c) return { kind: 'concat', unit, from: s.node?.name ?? '?', fromUnit: offset, a: actual, actual };
        offset -= c;
      }
      return { kind: 'value', unit, a: actual, actual };
    }
    default:
      return { kind: 'value', unit, a: actual, actual };
  }
}

function inputLabel(src, i, snapshot) {
  if (src?.node?.type === 'input' && snapshot.featureNames?.[i]) return snapshot.featureNames[i];
  return `${src?.node?.name ?? 'x'}[${i}]`;
}

/**
 * Unrolls a recurrent layer over the probe sequence for one unit:
 * steps = [{ t, h, c?, gates: { i, f, g, o } | { z, r, n } | { z } }].
 */
export function explainRecurrent(node, entry, src, unit, position = {}) {
  const w = entry?.weights ?? {};
  const x = src?.act;
  if (!w.kernel?.data || !w.recurrentKernel?.data || !x?.data) return { kind: 'value', unit, a: null, actual: null };
  const [steps, features] = x.shape;
  const kernel = w.kernel.data;
  const recurrent = w.recurrentKernel.data;
  const bias = w.bias?.data ?? null;
  const recurrentBias = w.recurrentBias?.data ?? null;
  const units = node.params.units;
  const gates = node.type === 'lstm' ? 4 : node.type === 'gru' ? 3 : 1;
  const cols = gates * units;
  let h = new Float64Array(units);
  let c = new Float64Array(units);
  const out = [];
  const activation = node.type === 'simpleRnn' ? fn(node.params.activation) : Math.tanh;
  const resetAfter = Boolean(entry.resetAfter);
  for (let t = 0; t < steps; t++) {
    const xw = new Float64Array(cols);
    const hu = new Float64Array(cols);
    for (let j = 0; j < cols; j++) {
      let s = bias ? bias[j] : 0;
      for (let f = 0; f < features; f++) s += x.data[t * features + f] * kernel[f * cols + j];
      xw[j] = s;
      let r = recurrentBias ? recurrentBias[j] : 0;
      for (let k = 0; k < units; k++) r += h[k] * recurrent[k * cols + j];
      hu[j] = r;
    }
    const nextH = new Float64Array(units);
    const nextC = new Float64Array(units);
    let record = null;
    for (let u = 0; u < units; u++) {
      if (node.type === 'simpleRnn') {
        nextH[u] = activation(xw[u] + hu[u]);
        if (u === unit) record = { t, h: nextH[u], gates: { z: xw[u] + hu[u] } };
      } else if (node.type === 'lstm') {
        const i = sigmoid(xw[u] + hu[u]);
        const f = sigmoid(xw[units + u] + hu[units + u]);
        const g = Math.tanh(xw[2 * units + u] + hu[2 * units + u]);
        const o = sigmoid(xw[3 * units + u] + hu[3 * units + u]);
        nextC[u] = f * c[u] + i * g;
        nextH[u] = o * Math.tanh(nextC[u]);
        if (u === unit) record = { t, h: nextH[u], c: nextC[u], gates: { i, f, g, o } };
      } else if (resetAfter) {
        // GRU, Keras gate order z, r, h; PyTorch applies the reset gate after the recurrent product.
        const z = sigmoid(xw[u] + hu[u]);
        const r = sigmoid(xw[units + u] + hu[units + u]);
        const n = Math.tanh(xw[2 * units + u] + r * hu[2 * units + u]);
        nextH[u] = z * h[u] + (1 - z) * n;
        if (u === unit) record = { t, h: nextH[u], gates: { z, r, n } };
      }
    }
    // GRU with the reset gate before the product (TensorFlow.js): every unit's reset gate is needed first.
    if (node.type === 'gru' && !resetAfter) {
      const rs = new Float64Array(units);
      const zs = new Float64Array(units);
      for (let u = 0; u < units; u++) {
        zs[u] = sigmoid(xw[u] + hu[u]);
        rs[u] = sigmoid(xw[units + u] + hu[units + u]);
      }
      for (let u = 0; u < units; u++) {
        let s = xw[2 * units + u];
        for (let k = 0; k < units; k++) s += rs[k] * h[k] * recurrent[k * cols + 2 * units + u];
        const n = Math.tanh(s);
        nextH[u] = zs[u] * h[u] + (1 - zs[u]) * n;
        if (u === unit) record = { t, h: nextH[u], gates: { z: zs[u], r: rs[u], n } };
      }
    }
    h = nextH;
    c = nextC;
    out.push(record);
  }
  const t = position.t ?? steps - 1;
  return { kind: 'recurrent', type: node.type, unit, steps: out, a: out[Math.min(t, out.length - 1)]?.h ?? null, actual: null };
}

/** Output size of a conv / pool layer along an axis (re-exported for the views). */
export { convLength };

/**
 * Self-attention for the token at position t: per head, the query of t against the keys of every
 * (visible) token → softmax weights → the weighted mix of their values → the output projection.
 * Returns { kind: 'attention', t, heads, weights: [head][token], tokens, mixed, ... , a }.
 */
export function explainAttention(node, entry, src, unit, position = {}, snapshot = {}) {
  const w = entry?.weights ?? {};
  const x = src?.act;
  const actual = entry?.act ? valueAt(entry.act, position, unit) : null;
  if (!x?.data || !w.query?.data || !w.output?.data) return { kind: 'value', unit, a: actual, actual };
  const [length, d] = x.shape;
  const heads = node.params.heads;
  const dh = d / heads;
  const t = position.t ?? length - 1;
  const project = (name, i) => {
    const out = new Float64Array(d);
    const W = w[name].data;
    const b = w[`${name}Bias`]?.data;
    for (let o = 0; o < d; o++) {
      let sum = b ? b[o] : 0;
      for (let k = 0; k < d; k++) sum += x.data[i * d + k] * W[k * d + o];
      out[o] = sum;
    }
    return out;
  };
  const q = project('query', t);
  const keys = []; const values = [];
  const visible = node.params.causal ? t + 1 : length;
  for (let i = 0; i < visible; i++) { keys.push(project('key', i)); values.push(project('value', i)); }
  const weights = [];
  const mixed = new Float64Array(d);
  for (let hd = 0; hd < heads; hd++) {
    const scores = keys.map((k) => { let s = 0; for (let e = 0; e < dh; e++) s += q[hd * dh + e] * k[hd * dh + e]; return s / Math.sqrt(dh); });
    const p = softmax(scores);
    weights.push(Array.from({ length }, (_, i) => (i < visible ? p[i] : 0)));
    for (let i = 0; i < visible; i++) for (let e = 0; e < dh; e++) mixed[hd * dh + e] += p[i] * values[i][hd * dh + e];
  }
  const items = [];
  for (let k = 0; k < d; k++) {
    const wi = w.output.data[k * d + unit];
    items.push({ index: k, label: `h${Math.floor(k / dh)}·v${k % dh}`, x: mixed[k], w: wi, contribution: mixed[k] * wi });
  }
  const bias = w.outputBias?.data ? w.outputBias.data[unit] : 0;
  const a = items.reduce((sum, item) => sum + item.contribution, bias);
  // The tokens (when the layer reads token ids through an embedding, show the characters).
  const ids = snapshot.input?.data;
  const tokens = Array.from({ length }, (_, i) => {
    const id = ids && ids.length === length ? Math.round(ids[i]) : null;
    const word = id != null ? snapshot.vocab?.[id] : null;
    return word != null ? (word === ' ' ? '␣' : word) : String(i);
  });
  return { kind: 'attention', unit, t, heads, causal: node.params.causal, weights, tokens, ...topContributions(items), count: items.length, bias, z: a, a, actual };
}
