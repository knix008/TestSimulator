// The layer catalogue: every layer the visual editor offers, its parameters,
// shape inference (shapes have no batch dimension and are channels-last, as in
// Keras / TensorFlow.js: [features], [steps, features], [height, width, channels]),
// parameter counts and the palette groups. Both engines (TensorFlow.js in the app,
// PyTorch through the Python bridge) and the code generator read this table.

export const ACTIVATIONS = ['linear', 'relu', 'relu6', 'elu', 'selu', 'sigmoid', 'hardSigmoid', 'tanh', 'softmax', 'softplus', 'softsign', 'swish', 'mish', 'gelu'];
export const PADDINGS = ['valid', 'same'];

/** Element-wise activation functions (JS), used to explain what a neuron does. */
export const ACTIVATION_FN = {
  linear: (z) => z,
  relu: (z) => Math.max(0, z),
  relu6: (z) => Math.min(6, Math.max(0, z)),
  elu: (z) => (z >= 0 ? z : Math.exp(z) - 1),
  selu: (z) => 1.0507009873554805 * (z >= 0 ? z : 1.6732632423543772 * (Math.exp(z) - 1)),
  sigmoid: (z) => 1 / (1 + Math.exp(-z)),
  hardSigmoid: (z) => Math.min(1, Math.max(0, 0.2 * z + 0.5)),
  tanh: (z) => Math.tanh(z),
  softplus: (z) => Math.log1p(Math.exp(z)),
  softsign: (z) => z / (1 + Math.abs(z)),
  swish: (z) => z / (1 + Math.exp(-z)),
  mish: (z) => z * Math.tanh(Math.log1p(Math.exp(z))),
  gelu: (z) => 0.5 * z * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (z + 0.044715 * z ** 3))),
  softmax: (z) => z, // needs the whole vector: see softmax()
};

/** The formula shown next to a neuron, per activation. */
export const ACTIVATION_FORMULA = {
  linear: 'a = z', relu: 'a = max(0, z)', relu6: 'a = min(6, max(0, z))', elu: 'a = z (z ≥ 0), eᶻ − 1 (z < 0)', selu: 'a = λ·elu(z)',
  sigmoid: 'a = 1 / (1 + e⁻ᶻ)', hardSigmoid: 'a = clip(0.2z + 0.5, 0, 1)', tanh: 'a = tanh(z)', softmax: 'aᵢ = eᶻⁱ / Σⱼ eᶻʲ',
  softplus: 'a = ln(1 + eᶻ)', softsign: 'a = z / (1 + |z|)', swish: 'a = z·σ(z)', mish: 'a = z·tanh(ln(1 + eᶻ))', gelu: 'a = z·Φ(z)',
};

export function softmax(values) {
  const max = Math.max(...values);
  const exps = values.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((v) => v / sum);
}

// ───────────────────────── parameter kinds

const int = (key, value, min, max) => ({ key, kind: 'int', default: value, min, max });
const num = (key, value, min, max, step) => ({ key, kind: 'number', default: value, min, max, step });
const pick = (key, value, options) => ({ key, kind: 'select', default: value, options });
const bool = (key, value) => ({ key, kind: 'bool', default: value });
const text = (key, value) => ({ key, kind: 'text', default: value });

const activation = (value = 'relu') => pick('activation', value, ACTIVATIONS);

class ShapeError extends Error {
  constructor(code, params = {}) {
    super(code);
    this.code = code;
    this.params = params;
  }
}

const need = (condition, code, params) => { if (!condition) throw new ShapeError(code, params); };
const one = (shapes) => { need(shapes.length === 1, 'shape.oneInput', { count: shapes.length }); return shapes[0]; };
const rank = (shape, wanted, code = 'shape.rank') => need(shape.length === wanted, code, { wanted, got: shape.length, shape: shapeText(shape) });
const product = (shape) => shape.reduce((a, b) => a * b, 1);

/** Output length of a convolution / pooling along one axis. */
export function convLength(length, kernel, stride, padding) {
  if (padding === 'same') return Math.ceil(length / stride);
  return Math.floor((length - kernel) / stride) + 1;
}

/** "28, 28, 1" → [28, 28, 1] (null when it is not a list of positive whole numbers). */
export function parseShape(value) {
  if (Array.isArray(value)) return value.every((n) => Number.isInteger(n) && n > 0) && value.length ? value : null;
  const parts = String(value ?? '').split(/[\s,x×]+/).filter(Boolean).map(Number);
  return parts.length && parts.every((n) => Number.isInteger(n) && n > 0) ? parts : null;
}

export const shapeText = (shape) => (shape ? `(${shape.join(', ')})` : '?');

// ───────────────────────── the catalogue

/**
 * type → { group, icon, params, inputs (0, 1 or 'many'), infer(shapes, p) → shape, count(shapes, p, out) → { total, trainable } }.
 * `torch` is the name of the matching PyTorch module (shown in the palette tip and the code).
 */
export const LAYERS = {
  input: {
    group: 'io', icon: 'lyInput', inputs: 0, torch: 'Tensor',
    params: [text('shape', '2')],
    infer: (_, p) => { const s = parseShape(p.shape); need(s, 'shape.badShape', { value: p.shape }); return s; },
  },
  dense: {
    group: 'core', icon: 'lyDense', inputs: 1, torch: 'nn.Linear',
    params: [int('units', 16, 1, 8192), activation('relu'), bool('useBias', true)],
    infer: (shapes, p) => { const s = one(shapes); need(s.length >= 1, 'shape.rankAtLeast', { wanted: 1 }); return [...s.slice(0, -1), p.units]; },
    count: ([s], p) => { const n = s.at(-1) * p.units + (p.useBias ? p.units : 0); return { total: n, trainable: n }; },
  },
  activation: {
    group: 'core', icon: 'lyActivation', inputs: 1, torch: 'nn.ReLU …',
    params: [activation('relu')],
    infer: (shapes) => one(shapes),
  },
  leakyRelu: {
    group: 'core', icon: 'lyLeaky', inputs: 1, torch: 'nn.LeakyReLU',
    params: [num('alpha', 0.1, 0, 1, 0.01)],
    infer: (shapes) => one(shapes),
  },
  dropout: {
    group: 'regular', icon: 'lyDropout', inputs: 1, torch: 'nn.Dropout',
    params: [num('rate', 0.25, 0, 0.95, 0.05)],
    infer: (shapes) => one(shapes),
  },
  batchNorm: {
    group: 'regular', icon: 'lyBatchNorm', inputs: 1, torch: 'nn.BatchNorm1d/2d',
    params: [num('momentum', 0.99, 0, 1, 0.01), num('epsilon', 0.001, 0, 1, 0.0001)],
    infer: (shapes) => { const s = one(shapes); need(s.length >= 1 && s.length <= 3, 'shape.rankRange', { min: 1, max: 3 }); return s; },
    count: ([s]) => ({ total: 4 * s.at(-1), trainable: 2 * s.at(-1) }),
  },
  layerNorm: {
    group: 'regular', icon: 'lyLayerNorm', inputs: 1, torch: 'nn.LayerNorm',
    params: [num('epsilon', 0.001, 0, 1, 0.0001)],
    infer: (shapes) => { const s = one(shapes); need(s.length >= 1 && s.length <= 2, 'shape.rankRange', { min: 1, max: 2 }); return s; },
    count: ([s]) => ({ total: 2 * s.at(-1), trainable: 2 * s.at(-1) }),
  },
  flatten: {
    group: 'shape', icon: 'lyFlatten', inputs: 1, torch: 'nn.Flatten',
    params: [],
    infer: (shapes) => [product(one(shapes))],
  },
  reshape: {
    group: 'shape', icon: 'lyReshape', inputs: 1, torch: 'Tensor.reshape',
    params: [text('targetShape', '4, 4')],
    infer: (shapes, p) => {
      const s = one(shapes);
      const target = parseShape(p.targetShape);
      need(target, 'shape.badShape', { value: p.targetShape });
      need(product(target) === product(s), 'shape.reshapeSize', { from: product(s), to: product(target) });
      return target;
    },
  },
  conv2d: {
    group: 'conv', icon: 'lyConv2d', inputs: 1, torch: 'nn.Conv2d',
    params: [int('filters', 8, 1, 1024), int('kernelSize', 3, 1, 15), int('strides', 1, 1, 8), pick('padding', 'same', PADDINGS), activation('relu'), bool('useBias', true)],
    infer: (shapes, p) => {
      const s = one(shapes);
      rank(s, 3, 'shape.needImage');
      const h = convLength(s[0], p.kernelSize, p.strides, p.padding);
      const w = convLength(s[1], p.kernelSize, p.strides, p.padding);
      need(h > 0 && w > 0, 'shape.tooSmall', { shape: shapeText(s) });
      return [h, w, p.filters];
    },
    count: ([s], p) => { const n = p.kernelSize * p.kernelSize * s[2] * p.filters + (p.useBias ? p.filters : 0); return { total: n, trainable: n }; },
  },
  depthwiseConv2d: {
    group: 'conv', icon: 'lyDepthwise', inputs: 1, torch: 'nn.Conv2d(groups=C)',
    params: [int('kernelH', 3, 1, 15), int('kernelW', 3, 1, 15), int('strides', 1, 1, 8), int('depthMultiplier', 1, 1, 8), pick('padding', 'same', PADDINGS), activation('linear'), bool('useBias', true)],
    infer: (shapes, p) => {
      const s = one(shapes);
      rank(s, 3, 'shape.needImage');
      const h = convLength(s[0], p.kernelH, p.strides, p.padding);
      const w = convLength(s[1], p.kernelW, p.strides, p.padding);
      need(h > 0 && w > 0, 'shape.tooSmall', { shape: shapeText(s) });
      return [h, w, s[2] * p.depthMultiplier];
    },
    count: ([s], p) => { const n = p.kernelH * p.kernelW * s[2] * p.depthMultiplier + (p.useBias ? s[2] * p.depthMultiplier : 0); return { total: n, trainable: n }; },
  },
  freqAvgPool: {
    group: 'conv', icon: 'lyFreqPool', inputs: 1, torch: 'x.mean(dim=2, keepdim=True)',
    params: [],
    infer: (shapes) => { const s = one(shapes); rank(s, 3, 'shape.needImage'); return [1, s[1], s[2]]; },
  },
  maxPool2d: {
    group: 'conv', icon: 'lyMaxPool', inputs: 1, torch: 'nn.MaxPool2d',
    params: [int('poolSize', 2, 1, 8), int('strides', 2, 1, 8)],
    infer: (shapes, p) => pool2d(one(shapes), p),
  },
  avgPool2d: {
    group: 'conv', icon: 'lyAvgPool', inputs: 1, torch: 'nn.AvgPool2d',
    params: [int('poolSize', 2, 1, 8), int('strides', 2, 1, 8)],
    infer: (shapes, p) => pool2d(one(shapes), p),
  },
  globalAvgPool2d: {
    group: 'conv', icon: 'lyGlobalPool', inputs: 1, torch: 'nn.AdaptiveAvgPool2d',
    params: [],
    infer: (shapes) => { const s = one(shapes); rank(s, 3, 'shape.needImage'); return [s[2]]; },
  },
  upSampling2d: {
    group: 'conv', icon: 'lyUpsample', inputs: 1, torch: 'nn.Upsample',
    params: [int('size', 2, 1, 8)],
    infer: (shapes, p) => { const s = one(shapes); rank(s, 3, 'shape.needImage'); return [s[0] * p.size, s[1] * p.size, s[2]]; },
  },
  conv1d: {
    group: 'seq', icon: 'lyConv1d', inputs: 1, torch: 'nn.Conv1d',
    params: [int('filters', 8, 1, 1024), int('kernelSize', 3, 1, 31), int('strides', 1, 1, 8), pick('padding', 'same', PADDINGS), activation('relu'), bool('useBias', true)],
    infer: (shapes, p) => {
      const s = one(shapes);
      rank(s, 2, 'shape.needSequence');
      const l = convLength(s[0], p.kernelSize, p.strides, p.padding);
      need(l > 0, 'shape.tooSmall', { shape: shapeText(s) });
      return [l, p.filters];
    },
    count: ([s], p) => { const n = p.kernelSize * s[1] * p.filters + (p.useBias ? p.filters : 0); return { total: n, trainable: n }; },
  },
  maxPool1d: {
    group: 'seq', icon: 'lyMaxPool1d', inputs: 1, torch: 'nn.MaxPool1d',
    params: [int('poolSize', 2, 1, 16), int('strides', 2, 1, 16)],
    infer: (shapes, p) => {
      const s = one(shapes);
      rank(s, 2, 'shape.needSequence');
      const l = convLength(s[0], p.poolSize, p.strides, 'valid');
      need(l > 0, 'shape.tooSmall', { shape: shapeText(s) });
      return [l, s[1]];
    },
  },
  globalAvgPool1d: {
    group: 'seq', icon: 'lyGlobalPool1d', inputs: 1, torch: 'Tensor.mean',
    params: [],
    infer: (shapes) => { const s = one(shapes); rank(s, 2, 'shape.needSequence'); return [s[1]]; },
  },
  simpleRnn: {
    group: 'seq', icon: 'lyRnn', inputs: 1, torch: 'nn.RNN',
    params: [int('units', 16, 1, 2048), pick('activation', 'tanh', ['tanh', 'relu']), bool('returnSequences', false)],
    infer: (shapes, p) => recurrent(one(shapes), p),
    count: ([s], p) => { const n = p.units * (s[1] + p.units) + p.units; return { total: n, trainable: n }; },
  },
  lstm: {
    group: 'seq', icon: 'lyLstm', inputs: 1, torch: 'nn.LSTM',
    params: [int('units', 16, 1, 2048), bool('returnSequences', false)],
    infer: (shapes, p) => recurrent(one(shapes), p),
    count: ([s], p) => { const n = 4 * (p.units * (s[1] + p.units) + p.units); return { total: n, trainable: n }; },
  },
  gru: {
    group: 'seq', icon: 'lyGru', inputs: 1, torch: 'nn.GRU',
    params: [int('units', 16, 1, 2048), bool('returnSequences', false)],
    infer: (shapes, p) => recurrent(one(shapes), p),
    count: ([s], p) => { const n = 3 * (p.units * (s[1] + p.units) + p.units); return { total: n, trainable: n }; },
  },
  embedding: {
    group: 'seq', icon: 'lyEmbedding', inputs: 1, torch: 'nn.Embedding',
    params: [int('inputDim', 50, 2, 100000), int('outputDim', 8, 1, 1024)],
    infer: (shapes, p) => { const s = one(shapes); rank(s, 1, 'shape.needTokens'); return [s[0], p.outputDim]; },
    count: (_, p) => ({ total: p.inputDim * p.outputDim, trainable: p.inputDim * p.outputDim }),
  },
  tokenPositionEmbedding: {
    group: 'transformer', icon: 'lyTokenPos', inputs: 1, torch: 'nn.Embedding + positions',
    params: [int('inputDim', 40, 2, 100000), int('outputDim', 32, 2, 1024)],
    infer: (shapes, p) => { const s = one(shapes); rank(s, 1, 'shape.needTokens'); return [s[0], p.outputDim]; },
    count: ([s], p) => { const n = (p.inputDim + s[0]) * p.outputDim; return { total: n, trainable: n }; },
  },
  selfAttention: {
    group: 'transformer', icon: 'lyAttention', inputs: 1, torch: 'SelfAttention (q·kᵀ/√d → softmax → ·v)',
    params: [int('heads', 2, 1, 16), bool('causal', true)],
    infer: (shapes, p) => {
      const s = one(shapes);
      rank(s, 2, 'shape.needSequence');
      need(s[1] % p.heads === 0, 'shape.headsDivide', { dim: s[1], heads: p.heads });
      return s;
    },
    count: ([s]) => { const n = 4 * (s[1] * s[1] + s[1]); return { total: n, trainable: n }; },
  },
  lastStep: {
    group: 'transformer', icon: 'lyLastStep', inputs: 1, torch: 'x[:, -1, :]',
    params: [],
    infer: (shapes) => { const s = one(shapes); rank(s, 2, 'shape.needSequence'); return [s[1]]; },
  },
  add: {
    group: 'merge', icon: 'lyAdd', inputs: 'many', torch: 'a + b',
    params: [],
    infer: (shapes) => {
      need(shapes.length >= 2, 'shape.twoInputs', { count: shapes.length });
      need(shapes.every((s) => s.length === shapes[0].length), 'shape.sameShapes', { shapes: shapes.map(shapeText).join(' · ') });
      // Broadcasting: per axis every size is 1 or the same.
      const out = shapes[0].map((_, axis) => Math.max(...shapes.map((s) => s[axis])));
      need(shapes.every((s) => s.every((d, axis) => d === 1 || d === out[axis])), 'shape.sameShapes', { shapes: shapes.map(shapeText).join(' · ') });
      return out;
    },
  },
  concatenate: {
    group: 'merge', icon: 'lyConcat', inputs: 'many', torch: 'torch.cat',
    params: [],
    infer: (shapes) => {
      need(shapes.length >= 2, 'shape.twoInputs', { count: shapes.length });
      const head = (s) => s.slice(0, -1).join(',');
      need(shapes.every((s) => s.length === shapes[0].length && head(s) === head(shapes[0])), 'shape.concatShapes', { shapes: shapes.map(shapeText).join(' · ') });
      return [...shapes[0].slice(0, -1), shapes.reduce((sum, s) => sum + s.at(-1), 0)];
    },
  },
};

function pool2d(s, p) {
  rank(s, 3, 'shape.needImage');
  const h = convLength(s[0], p.poolSize, p.strides, 'valid');
  const w = convLength(s[1], p.poolSize, p.strides, 'valid');
  need(h > 0 && w > 0, 'shape.tooSmall', { shape: shapeText(s) });
  return [h, w, s[2]];
}

function recurrent(s, p) {
  rank(s, 2, 'shape.needSequence');
  return p.returnSequences ? [s[0], p.units] : [p.units];
}

export const LAYER_TYPES = Object.keys(LAYERS);

/** Palette groups, in order. */
export const LAYER_GROUPS = [
  ['io', ['input']],
  ['core', ['dense', 'activation', 'leakyRelu']],
  ['conv', ['conv2d', 'depthwiseConv2d', 'maxPool2d', 'avgPool2d', 'globalAvgPool2d', 'freqAvgPool', 'upSampling2d']],
  ['seq', ['embedding', 'conv1d', 'maxPool1d', 'globalAvgPool1d', 'simpleRnn', 'lstm', 'gru']],
  ['transformer', ['tokenPositionEmbedding', 'selfAttention', 'lastStep']],
  ['regular', ['dropout', 'batchNorm', 'layerNorm']],
  ['shape', ['flatten', 'reshape']],
  ['merge', ['add', 'concatenate']],
];

/** Ready-made blocks: several layers dropped at once, wired in a chain (the palette's "Blocks" group). */
export const BLOCKS = {
  denseBlock: { icon: 'blkDense', layers: [['dense', { units: 32, activation: 'linear' }], ['batchNorm', {}], ['activation', { activation: 'relu' }], ['dropout', { rate: 0.2 }]] },
  convBlock: { icon: 'blkConv', layers: [['conv2d', { filters: 16, activation: 'linear' }], ['batchNorm', {}], ['activation', { activation: 'relu' }], ['maxPool2d', {}]] },
  convPair: { icon: 'blkConvPair', layers: [['conv2d', { filters: 16 }], ['conv2d', { filters: 16 }], ['maxPool2d', {}]] },
  classifierHead: { icon: 'blkHead', layers: [['flatten', {}], ['dense', { units: 64 }], ['dropout', { rate: 0.3 }], ['dense', { units: 10, activation: 'softmax' }]] },
  lstmStack: { icon: 'blkLstm', layers: [['lstm', { units: 32, returnSequences: true }], ['lstm', { units: 32 }]] },
  upBlock: { icon: 'blkUp', layers: [['upSampling2d', {}], ['conv2d', { filters: 16 }]] },
  dsBlock: { icon: 'blkDs', layers: [['depthwiseConv2d', {}], ['batchNorm', {}], ['activation', { activation: 'relu' }], ['conv2d', { filters: 32, kernelSize: 1, activation: 'linear' }], ['batchNorm', {}], ['activation', { activation: 'relu' }]] },
};
export const BLOCK_IDS = Object.keys(BLOCKS);

/** Default parameter values of a layer type, with `overrides` on top (unknown keys dropped, values coerced). */
export function defaultParams(type, overrides = {}) {
  const def = LAYERS[type];
  if (!def) throw new Error(`unknown layer type ${type}`);
  const out = {};
  for (const param of def.params) out[param.key] = coerceParam(param, overrides[param.key] ?? param.default);
  return out;
}

/** A value for a parameter: numbers clamped, selects kept to their options. */
export function coerceParam(param, value) {
  switch (param.kind) {
    case 'int': {
      const n = Math.round(Number(value));
      return Number.isFinite(n) ? Math.min(param.max, Math.max(param.min, n)) : param.default;
    }
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? Math.min(param.max, Math.max(param.min, n)) : param.default;
    }
    case 'bool': return value === true || value === 'true';
    case 'select': return param.options.includes(value) ? value : param.default;
    default: return String(value ?? param.default);
  }
}

export const paramDef = (type, key) => LAYERS[type]?.params.find((param) => param.key === key) ?? null;

/** Output shape for the given input shapes (throws ShapeError with a message code). */
export function inferLayer(type, shapes, params) {
  return LAYERS[type].infer(shapes, params);
}

export function countParams(type, shapes, params) {
  const def = LAYERS[type];
  return def.count ? def.count(shapes, params) : { total: 0, trainable: 0 };
}

export { ShapeError };

/** Short summary under a layer's name ("16 · relu", "3×3 ×8", …). */
export function layerSummary(type, p) {
  switch (type) {
    case 'input': return shapeText(parseShape(p.shape));
    case 'dense': return `${p.units} · ${p.activation}`;
    case 'activation': return p.activation;
    case 'leakyRelu': return `α ${p.alpha}`;
    case 'dropout': return `${Math.round(p.rate * 100)}%`;
    case 'conv2d': return `${p.kernelSize}×${p.kernelSize} ×${p.filters} · ${p.activation}`;
    case 'conv1d': return `k${p.kernelSize} ×${p.filters} · ${p.activation}`;
    case 'depthwiseConv2d': return `dw ${p.kernelH}×${p.kernelW}${p.strides > 1 ? ` /${p.strides}` : ''}`;
    case 'maxPool2d': case 'avgPool2d': return `${p.poolSize}×${p.poolSize}`;
    case 'maxPool1d': return `${p.poolSize}`;
    case 'upSampling2d': return `×${p.size}`;
    case 'simpleRnn': case 'lstm': case 'gru': return `${p.units}${p.returnSequences ? ' · seq' : ''}`;
    case 'embedding': case 'tokenPositionEmbedding': return `${p.inputDim} → ${p.outputDim}`;
    case 'selfAttention': return `${p.heads} heads${p.causal ? ' · causal' : ''}`;
    case 'reshape': return shapeText(parseShape(p.targetShape));
    default: return '';
  }
}
