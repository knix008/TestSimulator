// A trained model → ONNX (opset 13), for ONNX Runtime (C, C++, C#, Java, Python, mobile, web) and
// every tool that reads ONNX. The input is channels-last like MyTrainer's data: (N, ...input shape);
// convolutions and pooling are wrapped in transposes to ONNX's channels-first and back.
// Written with a small protobuf encoder (no libraries).
import { incoming, inferShapes, nodeById, outputNodes, topoOrder } from './graph.js';
import { groupsOf } from './preprocess.js';

const size = (shape) => shape.reduce((a, b) => a * b, 1);

// ───────────────────────── protobuf

class Writer {
  constructor() { this.parts = []; this.length = 0; }
  bytes(b) { this.parts.push(b); this.length += b.length; }
  varint(value) {
    let v = BigInt.asUintN(64, BigInt(value));
    const out = [];
    do { let byte = Number(v & 0x7fn); v >>= 7n; if (v) byte |= 0x80; out.push(byte); } while (v);
    this.bytes(Uint8Array.from(out));
  }
  key(field, wire) { this.varint((field << 3) | wire); }
  int(field, value) { this.key(field, 0); this.varint(value); }
  float(field, value) { this.key(field, 5); const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, value, true); this.bytes(b); }
  blob(field, data) { this.key(field, 2); this.varint(data.length); this.bytes(data); }
  string(field, text) { this.blob(field, new TextEncoder().encode(text)); }
  message(field, build) { const inner = new Writer(); build(inner); this.blob(field, inner.finish()); }
  finish() { const out = new Uint8Array(this.length); let at = 0; for (const p of this.parts) { out.set(p, at); at += p.length; } return out; }
}

const FLOAT = 1; const INT64 = 7;

function tensorProto(w, { name, dims, data, type = FLOAT }) {
  for (const d of dims) w.int(1, d);
  w.int(2, type);
  w.string(8, name);
  const raw = type === INT64 ? new Uint8Array(BigInt64Array.from(data.map((v) => BigInt(v))).buffer) : new Uint8Array(Float32Array.from(data).buffer);
  w.blob(9, raw);
}

function attribute(w, name, value) {
  w.string(1, name);
  // Numbers are INT attributes; floats are written { f: value } (JavaScript cannot tell 1.0 from 1).
  if (typeof value === 'number') { w.int(3, value); w.int(20, 2); }
  else if (value?.f != null) { w.float(2, value.f); w.int(20, 1); }
  else if (typeof value === 'string') { w.string(4, value); w.int(20, 3); }
  else if (value?.floats) { for (const f of value.floats) w.float(7, f); w.int(20, 6); }
  else if (Array.isArray(value)) { for (const i of value) w.int(8, i); w.int(20, 7); }
}

function valueInfo(w, name, dims) {
  w.string(1, name);
  w.message(2, (type) => type.message(1, (tensor) => {
    tensor.int(1, FLOAT);
    tensor.message(2, (shape) => { for (const d of dims) shape.message(1, (dim) => (typeof d === 'string' ? dim.string(2, d) : dim.int(1, d))); });
  }));
}

// ───────────────────────── graph building

/**
 * options = { project, prepared, weights: { nodeId: { name: { shape, data } } } }
 * Returns { bytes: Uint8Array (.onnx), errors: [] , inputName, outputName }.
 */
export function generateOnnx({ project, prepared, weights, rawShape = null }) {
  const graph = project.model;
  const inputShape = prepared.inputShape;
  const shapes = inferShapes(graph, inputShape);
  const order = topoOrder(graph);
  const out = outputNodes(graph)[0];
  const errors = [];
  const nodes = [];
  const inits = [];
  let counter = 0;
  const fresh = (base) => `${base}_${++counter}`;
  const init = (name, dims, data, type = FLOAT) => { inits.push({ name, dims, data, type }); return name; };
  const constF = (values, dims = [values.length]) => init(fresh('c'), dims, values);
  const constI = (values, dims = [values.length]) => init(fresh('i'), dims, values, INT64);
  const op = (type, inputs, attrs = {}, outputs = 1) => {
    const names = Array.from({ length: outputs }, () => fresh(type.toLowerCase()));
    nodes.push({ type, inputs, outputs: names, attrs, name: fresh(`n_${type}`) });
    return outputs === 1 ? names[0] : names;
  };
  const W = (id, key) => weights?.[id]?.[key] ?? null;
  const toNchw = (x) => op('Transpose', [x], { perm: [0, 3, 1, 2] });
  const toNhwc = (x) => op('Transpose', [x], { perm: [0, 2, 3, 1] });
  const activation = (x, a) => {
    switch (a) {
      case 'linear': case undefined: case null: return x;
      case 'relu': return op('Relu', [x]);
      case 'relu6': return op('Clip', [x, constF([0], []), constF([6], [])]);
      case 'elu': return op('Elu', [x], { alpha: { f: 1 } });
      case 'selu': return op('Selu', [x]);
      case 'sigmoid': return op('Sigmoid', [x]);
      case 'hardSigmoid': return op('HardSigmoid', [x], { alpha: { f: 0.2 }, beta: { f: 0.5 } });
      case 'tanh': return op('Tanh', [x]);
      case 'softmax': return op('Softmax', [x], { axis: -1 });
      case 'softplus': return op('Softplus', [x]);
      case 'softsign': return op('Softsign', [x]);
      case 'swish': return op('Mul', [x, op('Sigmoid', [x])]);
      case 'mish': return op('Mul', [x, op('Tanh', [op('Softplus', [x])])]);
      case 'gelu': {
        // 0.5·x·(1 + tanh(√(2/π)·(x + 0.044715·x³)))
        const cube = op('Mul', [op('Mul', [x, x]), x]);
        const inner = op('Mul', [op('Add', [x, op('Mul', [cube, constF([0.044715], [])])]), constF([0.7978845608028654], [])]);
        return op('Mul', [op('Mul', [x, constF([0.5], [])]), op('Add', [op('Tanh', [inner]), constF([1], [])])]);
      }
      default: errors.push(`activation ${a}`); return x;
    }
  };
  const pads = (length, kernel, stride, padding) => {
    if (padding !== 'same') return [0, 0];
    const o = Math.ceil(length / stride);
    const total = Math.max((o - 1) * stride + kernel - length, 0);
    return [Math.floor(total / 2), total - Math.floor(total / 2)];
  };
  const values = new Map();

  // The training preprocessing, so the model takes the raw values (like mt_preprocess in the C export).
  const raw = rawShape ?? inputShape;
  let pre = 'input';
  let shape = [...raw];
  for (const step of prepared.applied ?? []) {
    const { of } = groupsOf(prepared.kind, shape);
    const n = size(shape);
    if (step.type === 'standardize' || step.type === 'minmax') {
      const scale = []; const offset = [];
      for (let j = 0; j < n; j++) {
        const st = step.stats[of(j)];
        if (step.type === 'standardize') { scale.push(1 / st.std); offset.push(-st.mean / st.std); }
        else { const r = (st.max - st.min) || 1; const a = (step.high - step.low) / r; scale.push(a); offset.push(step.low - st.min * a); }
      }
      pre = op('Add', [op('Mul', [pre, init(fresh('pre_scale'), shape, scale)]), init(fresh('pre_offset'), shape, offset)]);
    } else if (step.type === 'clip') pre = op('Clip', [pre, constF([step.low], []), constF([step.high], [])]);
    else if (step.type === 'invert') pre = op('Sub', [constF([1], []), pre]);
    else if (step.type === 'polynomial') {
      // Every term is a product of up to three inputs; a column of ones stands in for missing factors.
      const ones = op('Add', [op('Mul', [op('Gather', [pre, constI([0])], { axis: 1 }), constF([0], [])]), constF([1], [])]);
      const padded = op('Concat', [pre, ones], { axis: 1 });
      const degree = Math.max(1, ...step.terms.map((term) => term.length));
      let product = null;
      for (let f = 0; f < degree; f++) {
        const factor = op('Gather', [padded, constI(step.terms.map((term) => term[f] ?? n))], { axis: 1 });
        product = product ? op('Mul', [product, factor]) : factor;
      }
      pre = product;
      shape = [step.terms.length];
    }
  }

  for (const id of order) {
    const node = nodeById(graph, id);
    const p = node.params;
    const src = incoming(graph, id).map((e) => e.from);
    const x = src.length ? values.get(src[0]) : pre;
    const s = src.length ? shapes.get(src[0])?.shape : inputShape;
    const o = shapes.get(id)?.shape;
    const prefix = `${node.name}.`;
    const wInit = (key, dims, data) => init(prefix + key, dims, data);
    let y = x;
    switch (node.type) {
      case 'input': y = pre; break;
      case 'dense': {
        const K = W(id, 'kernel'); const B = W(id, 'bias');
        if (!K) { errors.push(`${node.name}: kernel`); break; }
        y = op('MatMul', [x, wInit('kernel', K.shape, K.data)]);
        if (B && p.useBias) y = op('Add', [y, wInit('bias', B.shape, B.data)]);
        y = activation(y, p.activation);
        break;
      }
      case 'activation': y = activation(x, p.activation); break;
      case 'leakyRelu': y = op('LeakyRelu', [x], { alpha: { f: p.alpha } }); break;
      case 'dropout': y = op('Identity', [x]); break;
      case 'flatten': y = op('Flatten', [x], { axis: 1 }); break;
      case 'reshape': y = op('Reshape', [x, constI([-1, ...o])]); break;
      case 'batchNorm': {
        const g = W(id, 'gamma')?.data; const b = W(id, 'beta')?.data; const m = W(id, 'movingMean')?.data; const v = W(id, 'movingVariance')?.data;
        if (!m || !v) { errors.push(`${node.name}: moving statistics`); break; }
        const scale = m.map((_, c) => (g ? g[c] : 1) / Math.sqrt(v[c] + p.epsilon));
        const shift = m.map((mean, c) => (b ? b[c] : 0) - mean * scale[c]);
        y = op('Add', [op('Mul', [x, wInit('scale', [scale.length], scale)]), wInit('shift', [shift.length], shift)]);
        break;
      }
      case 'layerNorm': {
        const mean = op('ReduceMean', [x], { axes: [-1], keepdims: 1 });
        const d = op('Sub', [x, mean]);
        const variance = op('ReduceMean', [op('Mul', [d, d])], { axes: [-1], keepdims: 1 });
        y = op('Div', [d, op('Sqrt', [op('Add', [variance, constF([p.epsilon], [])])])]);
        const G = W(id, 'gamma'); const B = W(id, 'beta');
        if (G) y = op('Mul', [y, wInit('gamma', G.shape, G.data)]);
        if (B) y = op('Add', [y, wInit('beta', B.shape, B.data)]);
        break;
      }
      case 'conv2d': case 'depthwiseConv2d': {
        const K = W(id, 'kernel'); const B = W(id, 'bias');
        if (!K) { errors.push(`${node.name}: kernel`); break; }
        const [H, Wd, C] = s;
        const depthwise = node.type === 'depthwiseConv2d';
        const kh = depthwise ? p.kernelH : p.kernelSize; const kw = depthwise ? p.kernelW : p.kernelSize;
        const F = o[2];
        // TF kernel (kh, kw, C, F) / depthwise (kh, kw, C, m) → ONNX (F, C or 1, kh, kw)
        const m = depthwise ? p.depthMultiplier : 0;
        const cin = depthwise ? 1 : C;
        const data = new Float32Array(F * cin * kh * kw);
        for (let f = 0; f < F; f++) for (let c = 0; c < cin; c++) for (let ky = 0; ky < kh; ky++) for (let kx = 0; kx < kw; kx++) {
          data[((f * cin + c) * kh + ky) * kw + kx] = depthwise ? K.data[((ky * kw + kx) * C + Math.floor(f / m)) * m + (f % m)] : K.data[((ky * kw + kx) * C + c) * F + f];
        }
        const [top, bottom] = pads(H, kh, p.strides, p.padding); const [left, right] = pads(Wd, kw, p.strides, p.padding);
        const inputs = [toNchw(x), wInit('kernel', [F, cin, kh, kw], Array.from(data))];
        if (B && p.useBias) inputs.push(wInit('bias', B.shape, B.data));
        y = toNhwc(op('Conv', inputs, { kernel_shape: [kh, kw], strides: [p.strides, p.strides], pads: [top, left, bottom, right], group: depthwise ? C : 1 }));
        y = activation(y, p.activation);
        break;
      }
      case 'conv1d': {
        const K = W(id, 'kernel'); const B = W(id, 'bias');
        if (!K) { errors.push(`${node.name}: kernel`); break; }
        const [L, C] = s; const F = o[1]; const k = p.kernelSize;
        const data = new Float32Array(F * C * k);
        for (let f = 0; f < F; f++) for (let c = 0; c < C; c++) for (let t = 0; t < k; t++) data[(f * C + c) * k + t] = K.data[(t * C + c) * F + f];
        const [left, right] = pads(L, k, p.strides, p.padding);
        const inputs = [op('Transpose', [x], { perm: [0, 2, 1] }), wInit('kernel', [F, C, k], Array.from(data))];
        if (B && p.useBias) inputs.push(wInit('bias', B.shape, B.data));
        y = op('Transpose', [op('Conv', inputs, { kernel_shape: [k], strides: [p.strides], pads: [left, right] })], { perm: [0, 2, 1] });
        y = activation(y, p.activation);
        break;
      }
      case 'maxPool2d': case 'avgPool2d':
        y = toNhwc(op(node.type === 'maxPool2d' ? 'MaxPool' : 'AveragePool', [toNchw(x)], { kernel_shape: [p.poolSize, p.poolSize], strides: [p.strides, p.strides] }));
        break;
      case 'maxPool1d':
        y = op('Transpose', [op('MaxPool', [op('Transpose', [x], { perm: [0, 2, 1] })], { kernel_shape: [p.poolSize], strides: [p.strides] })], { perm: [0, 2, 1] });
        break;
      case 'globalAvgPool2d': y = op('ReduceMean', [x], { axes: [1, 2], keepdims: 0 }); break;
      case 'globalAvgPool1d': y = op('ReduceMean', [x], { axes: [1], keepdims: 0 }); break;
      case 'freqAvgPool': y = op('ReduceMean', [x], { axes: [1], keepdims: 1 }); break;
      case 'upSampling2d': y = op('Resize', [x, constF([], [0]), constF([1, p.size, p.size, 1])], { mode: 'nearest', coordinate_transformation_mode: 'asymmetric', nearest_mode: 'floor' }); break;
      case 'embedding': case 'tokenPositionEmbedding': {
        const E = W(id, 'embeddings');
        if (!E) { errors.push(`${node.name}: embeddings`); break; }
        const ids = op('Cast', [op('Clip', [x, constF([0], []), constF([p.inputDim - 1], [])])], { to: INT64 });
        y = op('Gather', [wInit('embeddings', E.shape, E.data), ids], { axis: 0 });
        const P = node.type === 'tokenPositionEmbedding' ? W(id, 'positions') : null;
        if (P) y = op('Add', [y, wInit('positions', P.shape, P.data)]);
        break;
      }
      case 'lastStep': y = op('Gather', [x, constI([s[0] - 1], [])], { axis: 1 }); break;
      case 'add': y = op('Sum', src.map((sid) => values.get(sid))); break;
      case 'concatenate': y = op('Concat', src.map((sid) => values.get(sid)), { axis: -1 }); break;
      case 'simpleRnn': case 'lstm': case 'gru': {
        const K = W(id, 'kernel'); const R = W(id, 'recurrentKernel'); const B = W(id, 'bias'); const RB = W(id, 'recurrentBias');
        if (!K || !R) { errors.push(`${node.name}: weights`); break; }
        const [, I] = s; const U = p.units;
        const gates = node.type === 'lstm' ? 4 : node.type === 'gru' ? 3 : 1;
        // Keras gate blocks: LSTM i f c o → ONNX i o f c; GRU z r h → z r h; RNN as is.
        const map = node.type === 'lstm' ? [0, 3, 1, 2] : Array.from({ length: gates }, (_, g) => g);
        const cols = gates * U;
        const w = new Float32Array(gates * U * I); const r = new Float32Array(gates * U * U); const b = new Float32Array(2 * gates * U);
        for (let g = 0; g < gates; g++) for (let u = 0; u < U; u++) {
          const col = map[g] * U + u;
          for (let f = 0; f < I; f++) w[(g * U + u) * I + f] = K.data[f * cols + col];
          for (let k = 0; k < U; k++) r[(g * U + u) * U + k] = R.data[k * cols + col];
          b[g * U + u] = B ? B.data[col] : 0;
          b[gates * U + g * U + u] = RB ? RB.data[col] : 0;
        }
        const seq = op('Transpose', [x], { perm: [1, 0, 2] }); // (L, N, I)
        const attrs = { hidden_size: U };
        if (node.type === 'gru') attrs.linear_before_reset = RB ? 1 : 0;
        if (node.type === 'simpleRnn') {
          const names = { tanh: 'Tanh', relu: 'Relu', sigmoid: 'Sigmoid', softsign: 'Softsign', softplus: 'Softplus', elu: 'Elu', hardSigmoid: 'HardSigmoid', linear: 'Affine' };
          if (!names[p.activation]) errors.push(`${node.name}: RNN activation ${p.activation}`);
          attrs.activations = [names[p.activation] ?? 'Tanh'];
          if (p.activation === 'linear') { attrs.activation_alpha = { floats: [1] }; attrs.activation_beta = { floats: [0] }; }
          if (p.activation === 'hardSigmoid') { attrs.activation_alpha = { floats: [0.2] }; attrs.activation_beta = { floats: [0.5] }; }
        }
        const [all, last] = op(node.type === 'lstm' ? 'LSTM' : node.type === 'gru' ? 'GRU' : 'RNN', [seq, wInit('W', [1, gates * U, I], Array.from(w)), wInit('R', [1, gates * U, U], Array.from(r)), wInit('B', [1, 2 * gates * U], Array.from(b))], attrs, node.type === 'lstm' ? 3 : 2);
        y = p.returnSequences
          ? op('Transpose', [op('Squeeze', [all, constI([1])])], { perm: [1, 0, 2] })
          : op('Squeeze', [last, constI([0])]);
        break;
      }
      case 'selfAttention': {
        const [L, D] = s; const h = p.heads; const dh = D / h;
        const proj = (key) => { const Wk = W(id, key); const Bk = W(id, `${key}Bias`); let t = op('MatMul', [x, wInit(key, Wk.shape, Wk.data)]); if (Bk) t = op('Add', [t, wInit(`${key}Bias`, Bk.shape, Bk.data)]); return t; };
        if (!W(id, 'query')) { errors.push(`${node.name}: weights`); break; }
        const heads = (t, perm) => op('Transpose', [op('Reshape', [t, constI([0, 0, h, dh])])], { perm });
        const q = heads(proj('query'), [0, 2, 1, 3]);   // (N, h, L, dh)
        const k = heads(proj('key'), [0, 2, 3, 1]);     // (N, h, dh, L)
        const v = heads(proj('value'), [0, 2, 1, 3]);
        let scores = op('Mul', [op('MatMul', [q, k]), constF([1 / Math.sqrt(dh)], [])]);
        if (p.causal) {
          const mask = new Float32Array(L * L);
          for (let i = 0; i < L; i++) for (let j = i + 1; j < L; j++) mask[i * L + j] = -1e9;
          scores = op('Add', [scores, constF(Array.from(mask), [L, L])]);
        }
        const mixed = op('Reshape', [op('Transpose', [op('MatMul', [op('Softmax', [scores], { axis: -1 }), v])], { perm: [0, 2, 1, 3] }), constI([0, 0, D])]);
        const Wo = W(id, 'output'); const Bo = W(id, 'outputBias');
        y = op('MatMul', [mixed, wInit('output', Wo.shape, Wo.data)]);
        if (Bo) y = op('Add', [y, wInit('outputBias', Bo.shape, Bo.data)]);
        break;
      }
      default:
        errors.push(`${node.name}: ${node.type} is not supported by the ONNX export`);
    }
    values.set(id, y);
  }
  const final = op('Identity', [values.get(out.id)]);
  nodes.at(-1).outputs = ['output'];
  void final;
  const outShape = shapes.get(out.id)?.shape ?? [1];

  const w = new Writer();
  w.int(1, 8); // ir_version
  w.string(2, 'MyTrainer');
  w.string(3, '1.0');
  w.message(7, (g) => {
    for (const n of nodes) g.message(1, (nd) => {
      for (const i of n.inputs) nd.string(1, i);
      for (const o of n.outputs) nd.string(2, o);
      nd.string(3, n.name);
      nd.string(4, n.type);
      for (const [key, value] of Object.entries(n.attrs)) nd.message(5, (a) => attribute(a, key, value));
    });
    g.string(2, (project.name || 'model').slice(0, 100));
    for (const t of inits) g.message(5, (tp) => tensorProto(tp, t));
    g.message(11, (vi) => valueInfo(vi, 'input', ['N', ...raw]));
    g.message(12, (vi) => valueInfo(vi, 'output', ['N', ...outShape]));
  });
  w.message(8, (opset) => { opset.string(1, ''); opset.int(2, 13); });
  return { bytes: w.finish(), errors, inputName: 'input', outputName: 'output', inputShape: raw, outputShape: outShape };
}
