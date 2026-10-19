// A trained model → plain C99 (model.h, model.c, example.c): no libraries, no allocation, the
// weights as const float arrays. Works from C and C++ (extern "C"), on desktops and microcontrollers.
// The arithmetic follows the TensorFlow.js engine (channels-last); the preprocessing the model was
// trained with (standardize, min-max, clip, invert, polynomial) is in mt_preprocess().
import { incoming, inferShapes, nodeById, outputNodes, topoOrder } from './graph.js';
import { groupsOf } from './preprocess.js';

const size = (shape) => shape.reduce((a, b) => a * b, 1);
const cName = (name) => String(name).replace(/[^A-Za-z0-9_]/g, '_').replace(/^([0-9])/, '_$1');

/** A float literal that reads back to the same float32. */
function f32(value) {
  const v = Math.fround(Number(value) || 0);
  if (Number.isNaN(v)) return '0.0f';
  if (!Number.isFinite(v)) return v > 0 ? 'INFINITY' : '-INFINITY';
  let text = v.toPrecision(9);
  if (!/[.e]/.test(text)) text += '.0';
  return `${text.replace(/(\.\d*?)0+(e|$)/, '$1$2').replace(/\.(e|$)/, '.0$1')}f`;
}

function floatArray(name, values, comment = '') {
  const lines = [];
  for (let i = 0; i < values.length; i += 8) lines.push(`  ${Array.from(values.slice(i, i + 8), f32).join(', ')},`);
  return `${comment ? `/* ${comment} */\n` : ''}static const float ${name}[${Math.max(1, values.length)}] = {\n${lines.join('\n') || '  0.0f'}\n};`;
}

const ACTIVATIONS = {
  linear: 'z',
  relu: 'z > 0.0f ? z : 0.0f',
  relu6: 'z < 0.0f ? 0.0f : (z > 6.0f ? 6.0f : z)',
  elu: 'z >= 0.0f ? z : expf(z) - 1.0f',
  selu: '1.0507009873554805f * (z >= 0.0f ? z : 1.6732632423543772f * (expf(z) - 1.0f))',
  sigmoid: '1.0f / (1.0f + expf(-z))',
  hardSigmoid: 'z < -2.5f ? 0.0f : (z > 2.5f ? 1.0f : 0.2f * z + 0.5f)',
  tanh: 'tanhf(z)',
  softplus: 'log1pf(expf(z))',
  softsign: 'z / (1.0f + fabsf(z))',
  swish: 'z / (1.0f + expf(-z))',
  mish: 'z * tanhf(log1pf(expf(z)))',
  gelu: '0.5f * z * (1.0f + tanhf(0.7978845608028654f * (z + 0.044715f * z * z * z)))',
};

/** "Same" padding before the first element (TensorFlow's rule: the odd extra pixel goes after). */
function padBefore(length, kernel, stride, padding) {
  if (padding !== 'same') return 0;
  const out = Math.ceil(length / stride);
  return Math.floor(Math.max((out - 1) * stride + kernel - length, 0) / 2);
}

/**
 * options = { project, prepared, weights: { nodeId: { name: { shape, data } } }, labels, task, name }
 * Returns { files: { 'model.h', 'model.c', 'example.c', 'README.md' }, errors: [] }.
 */
export function generateC({ project, prepared, weights, rawShape: rawInputShape = null, labels = null, task = null, name = 'model', example = null }) {
  const graph = project.model;
  const inputShape = prepared.inputShape;
  const shapes = inferShapes(graph, inputShape);
  const order = topoOrder(graph);
  const out = outputNodes(graph)[0];
  const errors = [];
  const data = [];
  const buffers = [];
  const body = [];
  const used = new Set();
  const names = new Map();
  const taken = new Set();
  for (const id of order) {
    let n = cName(nodeById(graph, id).name);
    while (taken.has(n)) n += '_';
    taken.add(n);
    names.set(id, n);
  }
  const buf = (id) => `b_${names.get(id)}`;
  const shapeOf = (id) => shapes.get(id)?.shape;
  const W = (id, key) => {
    const w = weights?.[id]?.[key];
    if (!w?.data) return null;
    const arrayName = `w_${names.get(id)}_${cName(key)}`;
    if (!data.some((d) => d.name === arrayName)) data.push({ name: arrayName, text: floatArray(arrayName, w.data, `${nodeById(graph, id).name}.${key} ${JSON.stringify(w.shape)}`) });
    return arrayName;
  };
  const act = (activation, expr) => {
    if (!activation || activation === 'linear') return expr;
    if (activation === 'softmax') return expr; // applied over the row afterwards
    used.add(activation);
    return `mt_${activation}(${expr})`;
  };
  const softmaxRows = (target, rows, cols) => { used.add('softmaxFn'); return `  for (int r = 0; r < ${rows}; r++) mt_softmax(${target} + r * ${cols}, ${cols});`; };

  for (const id of order) {
    const node = nodeById(graph, id);
    const p = node.params;
    const o = shapeOf(id);
    if (!o) { errors.push(`${node.name}: no shape`); continue; }
    buffers.push(`static float ${buf(id)}[${size(o)}];  /* ${node.name}: (${o.join(', ')}) */`);
    const src = incoming(graph, id).map((e) => e.from);
    const x = src.length ? buf(src[0]) : 'input';
    const s = src.length ? shapeOf(src[0]) : inputShape;
    const y = buf(id);
    const lines = [`  /* ${node.name} — ${node.type} (${(s ?? []).join(', ')}) → (${o.join(', ')}) */`];
    const missing = (what) => { errors.push(`${node.name}: ${what}`); lines.push(`  /* ${what} */`); };
    switch (node.type) {
      case 'input':
        lines.push(`  memcpy(${y}, input, sizeof(${y}));`);
        break;
      case 'dense': {
        const K = W(id, 'kernel'); const B = p.useBias ? W(id, 'bias') : null;
        if (!K) { missing('kernel missing'); break; }
        const I = s.at(-1); const U = p.units; const rows = size(s) / I;
        lines.push(`  for (int r = 0; r < ${rows}; r++) for (int u = 0; u < ${U}; u++) {`,
          `    float z = ${B ? `${B}[u]` : '0.0f'};`,
          `    for (int i = 0; i < ${I}; i++) z += ${x}[r * ${I} + i] * ${K}[i * ${U} + u];`,
          `    ${y}[r * ${U} + u] = ${act(p.activation, 'z')};`, '  }');
        if (p.activation === 'softmax') lines.push(softmaxRows(y, rows, U));
        break;
      }
      case 'activation':
        if (p.activation === 'softmax') { lines.push(`  memcpy(${y}, ${x}, sizeof(${y}));`, softmaxRows(y, size(o) / o.at(-1), o.at(-1))); }
        else lines.push(`  for (int i = 0; i < ${size(o)}; i++) { float z = ${x}[i]; ${y}[i] = ${act(p.activation, 'z')}; }`);
        break;
      case 'leakyRelu':
        lines.push(`  for (int i = 0; i < ${size(o)}; i++) { float z = ${x}[i]; ${y}[i] = z >= 0.0f ? z : ${f32(p.alpha)} * z; }`);
        break;
      case 'dropout': case 'flatten': case 'reshape':
        lines.push(`  memcpy(${y}, ${x}, sizeof(${y}));${node.type === 'dropout' ? '  /* dropout only acts while training */' : ''}`);
        break;
      case 'batchNorm': {
        const G = W(id, 'gamma'); const Bt = W(id, 'beta'); const M = W(id, 'movingMean'); const V = W(id, 'movingVariance');
        if (!M || !V) { missing('moving statistics missing'); break; }
        const C = o.at(-1);
        lines.push(`  for (int i = 0; i < ${size(o)}; i++) { int c = i % ${C}; ${y}[i] = (${x}[i] - ${M}[c]) / sqrtf(${V}[c] + ${f32(p.epsilon)})${G ? ` * ${G}[c]` : ''}${Bt ? ` + ${Bt}[c]` : ''}; }`);
        break;
      }
      case 'layerNorm': {
        const G = W(id, 'gamma'); const Bt = W(id, 'beta');
        const C = o.at(-1); const rows = size(o) / C;
        lines.push(`  for (int r = 0; r < ${rows}; r++) {`,
          `    const float *v = ${x} + r * ${C}; float mean = 0.0f, var = 0.0f;`,
          `    for (int c = 0; c < ${C}; c++) mean += v[c];`,
          `    mean /= ${C}.0f;`,
          `    for (int c = 0; c < ${C}; c++) var += (v[c] - mean) * (v[c] - mean);`,
          `    var /= ${C}.0f;`,
          `    for (int c = 0; c < ${C}; c++) ${y}[r * ${C} + c] = (v[c] - mean) / sqrtf(var + ${f32(p.epsilon)})${G ? ' * ' + G + '[c]' : ''}${Bt ? ' + ' + Bt + '[c]' : ''};`, '  }');
        break;
      }
      case 'conv2d': case 'depthwiseConv2d': {
        const K = W(id, 'kernel'); const B = p.useBias ? W(id, 'bias') : null;
        if (!K) { missing('kernel missing'); break; }
        const [H, Wd, C] = s; const [OH, OW, F] = o;
        const kh = node.type === 'conv2d' ? p.kernelSize : p.kernelH;
        const kw = node.type === 'conv2d' ? p.kernelSize : p.kernelW;
        const top = padBefore(H, kh, p.strides, p.padding); const left = padBefore(Wd, kw, p.strides, p.padding);
        if (node.type === 'conv2d') {
          lines.push(`  for (int oy = 0; oy < ${OH}; oy++) for (int ox = 0; ox < ${OW}; ox++) for (int f = 0; f < ${F}; f++) {`,
            `    float z = ${B ? `${B}[f]` : '0.0f'};`,
            `    for (int ky = 0; ky < ${kh}; ky++) { int iy = oy * ${p.strides} + ky - ${top}; if (iy < 0 || iy >= ${H}) continue;`,
            `      for (int kx = 0; kx < ${kw}; kx++) { int ix = ox * ${p.strides} + kx - ${left}; if (ix < 0 || ix >= ${Wd}) continue;`,
            `        const float *px = ${x} + (iy * ${Wd} + ix) * ${C}; const float *kk = ${K} + ((ky * ${kw} + kx) * ${C}) * ${F} + f;`,
            `        for (int c = 0; c < ${C}; c++) z += px[c] * kk[c * ${F}]; } }`,
            `    ${y}[(oy * ${OW} + ox) * ${F} + f] = ${act(p.activation, 'z')};`, '  }');
        } else {
          const m = p.depthMultiplier;
          lines.push(`  for (int oy = 0; oy < ${OH}; oy++) for (int ox = 0; ox < ${OW}; ox++) for (int f = 0; f < ${F}; f++) {`,
            `    int c = f / ${m}, j = f % ${m}; float z = ${B ? `${B}[f]` : '0.0f'};`,
            `    for (int ky = 0; ky < ${kh}; ky++) { int iy = oy * ${p.strides} + ky - ${top}; if (iy < 0 || iy >= ${H}) continue;`,
            `      for (int kx = 0; kx < ${kw}; kx++) { int ix = ox * ${p.strides} + kx - ${left}; if (ix < 0 || ix >= ${Wd}) continue;`,
            `        z += ${x}[(iy * ${Wd} + ix) * ${C} + c] * ${K}[((ky * ${kw} + kx) * ${C} + c) * ${m} + j]; } }`,
            `    ${y}[(oy * ${OW} + ox) * ${F} + f] = ${act(p.activation, 'z')};`, '  }');
        }
        break;
      }
      case 'conv1d': {
        const K = W(id, 'kernel'); const B = p.useBias ? W(id, 'bias') : null;
        if (!K) { missing('kernel missing'); break; }
        const [L, C] = s; const [OL, F] = o; const k = p.kernelSize;
        const left = padBefore(L, k, p.strides, p.padding);
        lines.push(`  for (int t = 0; t < ${OL}; t++) for (int f = 0; f < ${F}; f++) {`,
          `    float z = ${B ? `${B}[f]` : '0.0f'};`,
          `    for (int kt = 0; kt < ${k}; kt++) { int it = t * ${p.strides} + kt - ${left}; if (it < 0 || it >= ${L}) continue;`,
          `      for (int c = 0; c < ${C}; c++) z += ${x}[it * ${C} + c] * ${K}[(kt * ${C} + c) * ${F} + f]; }`,
          `    ${y}[t * ${F} + f] = ${act(p.activation, 'z')};`, '  }');
        break;
      }
      case 'maxPool2d': case 'avgPool2d': {
        const [, Wd, C] = s; const [OH, OW] = o; const k = p.poolSize; const st = p.strides;
        const max = node.type === 'maxPool2d';
        lines.push(`  for (int oy = 0; oy < ${OH}; oy++) for (int ox = 0; ox < ${OW}; ox++) for (int c = 0; c < ${C}; c++) {`,
          `    float v = ${max ? '-INFINITY' : '0.0f'};`,
          `    for (int ky = 0; ky < ${k}; ky++) for (int kx = 0; kx < ${k}; kx++) { float q = ${x}[((oy * ${st} + ky) * ${Wd} + ox * ${st} + kx) * ${C} + c]; ${max ? 'if (q > v) v = q;' : 'v += q;'} }`,
          `    ${y}[(oy * ${OW} + ox) * ${C} + c] = ${max ? 'v' : `v / ${k * k}.0f`};`, '  }');
        break;
      }
      case 'maxPool1d': {
        const [, C] = s; const [OL] = o; const k = p.poolSize; const st = p.strides;
        lines.push(`  for (int t = 0; t < ${OL}; t++) for (int c = 0; c < ${C}; c++) { float v = -INFINITY; for (int k = 0; k < ${k}; k++) { float q = ${x}[(t * ${st} + k) * ${C} + c]; if (q > v) v = q; } ${y}[t * ${C} + c] = v; }`);
        break;
      }
      case 'globalAvgPool2d': case 'globalAvgPool1d': {
        const C = s.at(-1); const n = size(s) / C;
        lines.push(`  for (int c = 0; c < ${C}; c++) { float v = 0.0f; for (int i = 0; i < ${n}; i++) v += ${x}[i * ${C} + c]; ${y}[c] = v / ${n}.0f; }`);
        break;
      }
      case 'freqAvgPool': {
        const [H, Wd, C] = s;
        lines.push(`  for (int ix = 0; ix < ${Wd}; ix++) for (int c = 0; c < ${C}; c++) { float v = 0.0f; for (int iy = 0; iy < ${H}; iy++) v += ${x}[(iy * ${Wd} + ix) * ${C} + c]; ${y}[ix * ${C} + c] = v / ${H}.0f; }`);
        break;
      }
      case 'upSampling2d': {
        const [, Wd, C] = s; const [OH, OW] = o; const k = p.size;
        lines.push(`  for (int oy = 0; oy < ${OH}; oy++) for (int ox = 0; ox < ${OW}; ox++) for (int c = 0; c < ${C}; c++) ${y}[(oy * ${OW} + ox) * ${C} + c] = ${x}[((oy / ${k}) * ${Wd} + ox / ${k}) * ${C} + c];`);
        break;
      }
      case 'embedding': case 'tokenPositionEmbedding': {
        const E = W(id, 'embeddings'); const P = node.type === 'tokenPositionEmbedding' ? W(id, 'positions') : null;
        if (!E) { missing('embeddings missing'); break; }
        const L = s[0]; const D = o.at(-1); const V = p.inputDim;
        lines.push(`  for (int t = 0; t < ${L}; t++) { int id = (int)${x}[t]; if (id < 0) id = 0; if (id >= ${V}) id = ${V - 1};`,
          `    for (int d = 0; d < ${D}; d++) ${y}[t * ${D} + d] = ${E}[id * ${D} + d]${P ? ` + ${P}[t * ${D} + d]` : ''}; }`);
        break;
      }
      case 'lastStep': {
        const [L, D] = s;
        lines.push(`  memcpy(${y}, ${x} + ${(L - 1) * D}, sizeof(${y}));`);
        break;
      }
      case 'add': {
        const parts = src.map((sid) => ({ b: buf(sid), shape: shapeOf(sid) }));
        const r = o.length;
        const strides = (shape) => shape.map((_, a) => size(shape.slice(a + 1)));
        const oStrides = strides(o);
        const index = (shape) => {
          if (shape.join() === o.join()) return 'i';
          const st = strides(shape);
          return o.map((dim, a) => (shape[a] === 1 ? null : `((i / ${oStrides[a]}) % ${dim}) * ${st[a]}`)).filter(Boolean).join(' + ') || '0';
        };
        void r;
        lines.push(`  for (int i = 0; i < ${size(o)}; i++) ${y}[i] = ${parts.map((part) => `${part.b}[${index(part.shape)}]`).join(' + ')};`);
        break;
      }
      case 'concatenate': {
        const C = o.at(-1); const rows = size(o) / C;
        let offset = 0;
        for (const sid of src) {
          const c = shapeOf(sid).at(-1);
          lines.push(`  for (int r = 0; r < ${rows}; r++) memcpy(${y} + r * ${C} + ${offset}, ${buf(sid)} + r * ${c}, ${c} * sizeof(float));`);
          offset += c;
        }
        break;
      }
      case 'simpleRnn': case 'lstm': case 'gru': {
        const K = W(id, 'kernel'); const R = W(id, 'recurrentKernel'); const B = W(id, 'bias'); const RB = W(id, 'recurrentBias');
        if (!K || !R) { missing('weights missing'); break; }
        const [L, F] = s; const U = p.units;
        const gates = node.type === 'lstm' ? 4 : node.type === 'gru' ? 3 : 1;
        const cols = gates * U;
        const st = `s_${names.get(id)}`;
        buffers.push(`static float ${st}_h[${U}], ${st}_c[${U}], ${st}_xw[${cols}], ${st}_hu[${cols}], ${st}_n[${U}];`);
        used.add('sigmoid');
        if (node.type === 'simpleRnn' && p.activation !== 'linear') used.add(p.activation);
        lines.push(`  memset(${st}_h, 0, sizeof(${st}_h)); memset(${st}_c, 0, sizeof(${st}_c));`,
          `  for (int t = 0; t < ${L}; t++) {`,
          `    for (int j = 0; j < ${cols}; j++) {`,
          `      float a = ${B ? `${B}[j]` : '0.0f'}, b = ${RB ? `${RB}[j]` : '0.0f'};`,
          `      for (int f = 0; f < ${F}; f++) a += ${x}[t * ${F} + f] * ${K}[f * ${cols} + j];`,
          `      for (int k = 0; k < ${U}; k++) b += ${st}_h[k] * ${R}[k * ${cols} + j];`,
          `      ${st}_xw[j] = a; ${st}_hu[j] = b;`, '    }');
        if (node.type === 'simpleRnn') {
          lines.push(`    for (int u = 0; u < ${U}; u++) { float z = ${st}_xw[u] + ${st}_hu[u]; ${st}_h[u] = ${act(p.activation, 'z')}; }`);
        } else if (node.type === 'lstm') {
          lines.push(`    for (int u = 0; u < ${U}; u++) {`,
            `      float ig = mt_sigmoid(${st}_xw[u] + ${st}_hu[u]), fg = mt_sigmoid(${st}_xw[${U} + u] + ${st}_hu[${U} + u]);`,
            `      float g = tanhf(${st}_xw[${2 * U} + u] + ${st}_hu[${2 * U} + u]), og = mt_sigmoid(${st}_xw[${3 * U} + u] + ${st}_hu[${3 * U} + u]);`,
            `      ${st}_c[u] = fg * ${st}_c[u] + ig * g; ${st}_h[u] = og * tanhf(${st}_c[u]);`, '    }');
        } else if (RB) {
          // PyTorch's GRU: the reset gate multiplies the recurrent product (with its own bias).
          lines.push(`    for (int u = 0; u < ${U}; u++) {`,
            `      float zg = mt_sigmoid(${st}_xw[u] + ${st}_hu[u]), rg = mt_sigmoid(${st}_xw[${U} + u] + ${st}_hu[${U} + u]);`,
            `      ${st}_n[u] = zg * ${st}_h[u] + (1.0f - zg) * tanhf(${st}_xw[${2 * U} + u] + rg * ${st}_hu[${2 * U} + u]);`, '    }',
            `    memcpy(${st}_h, ${st}_n, sizeof(${st}_h));`);
        } else {
          // TensorFlow.js's GRU: the reset gate multiplies the state before the recurrent product.
          lines.push(`    for (int u = 0; u < ${U}; u++) ${st}_c[u] = mt_sigmoid(${st}_xw[${U} + u] + ${st}_hu[${U} + u]) * ${st}_h[u];`,
            `    for (int u = 0; u < ${U}; u++) {`,
            `      float zg = mt_sigmoid(${st}_xw[u] + ${st}_hu[u]), a = ${st}_xw[${2 * U} + u];`,
            `      for (int k = 0; k < ${U}; k++) a += ${st}_c[k] * ${R}[k * ${cols} + ${2 * U} + u];`,
            `      ${st}_n[u] = zg * ${st}_h[u] + (1.0f - zg) * tanhf(a);`, '    }',
            `    memcpy(${st}_h, ${st}_n, sizeof(${st}_h));`);
        }
        lines.push(p.returnSequences ? `    memcpy(${y} + t * ${U}, ${st}_h, sizeof(${st}_h));` : '', '  }');
        if (!p.returnSequences) lines.push(`  memcpy(${y}, ${st}_h, sizeof(${st}_h));`);
        break;
      }
      case 'selfAttention': {
        const [L, D] = s; const h = p.heads; const dh = D / h;
        const ws = ['query', 'key', 'value', 'output'].map((k) => [W(id, k), W(id, `${k}Bias`)]);
        if (ws.some(([w]) => !w)) { missing('weights missing'); break; }
        const st = `s_${names.get(id)}`;
        buffers.push(`static float ${st}_q[${L * D}], ${st}_k[${L * D}], ${st}_v[${L * D}], ${st}_mix[${L * D}], ${st}_p[${L}];`);
        const proj = (target, [w, b]) => [`  for (int t = 0; t < ${L}; t++) for (int o = 0; o < ${D}; o++) {`,
          `    float z = ${b ? `${b}[o]` : '0.0f'}; for (int i = 0; i < ${D}; i++) z += ${x}[t * ${D} + i] * ${w}[i * ${D} + o]; ${target}[t * ${D} + o] = z; }`];
        lines.push(...proj(`${st}_q`, ws[0]), ...proj(`${st}_k`, ws[1]), ...proj(`${st}_v`, ws[2]),
          `  memset(${st}_mix, 0, sizeof(${st}_mix));`,
          `  for (int hd = 0; hd < ${h}; hd++) for (int t = 0; t < ${L}; t++) {`,
          `    int visible = ${p.causal ? 't + 1' : L}; float top = -INFINITY, sum = 0.0f;`,
          `    for (int j = 0; j < visible; j++) { float z = 0.0f; for (int e = 0; e < ${dh}; e++) z += ${st}_q[t * ${D} + hd * ${dh} + e] * ${st}_k[j * ${D} + hd * ${dh} + e]; ${st}_p[j] = z / ${f32(Math.sqrt(dh))}; if (${st}_p[j] > top) top = ${st}_p[j]; }`,
          `    for (int j = 0; j < visible; j++) { ${st}_p[j] = expf(${st}_p[j] - top); sum += ${st}_p[j]; }`,
          `    for (int j = 0; j < visible; j++) for (int e = 0; e < ${dh}; e++) ${st}_mix[t * ${D} + hd * ${dh} + e] += ${st}_p[j] / sum * ${st}_v[j * ${D} + hd * ${dh} + e];`, '  }',
          `  for (int t = 0; t < ${L}; t++) for (int o = 0; o < ${D}; o++) {`,
          `    float z = ${ws[3][1] ? `${ws[3][1]}[o]` : '0.0f'}; for (int i = 0; i < ${D}; i++) z += ${st}_mix[t * ${D} + i] * ${ws[3][0]}[i * ${D} + o]; ${y}[t * ${D} + o] = z; }`);
        break;
      }
      default:
        missing(`layer type ${node.type} is not supported by the C export`);
    }
    body.push(lines.filter((line) => line !== '').join('\n'));
  }

  // Preprocessing: the steps the training data went through, per input value.
  const pre = [];
  const rawShape = rawInputShape ?? inputShape;
  let preSize = size(rawShape);
  let shape = [...rawShape];
  pre.push(`  float v[MT_RAW_INPUT_SIZE > MT_INPUT_SIZE ? MT_RAW_INPUT_SIZE : MT_INPUT_SIZE];`, `  memcpy(v, raw, MT_RAW_INPUT_SIZE * sizeof(float));`);
  for (const [k, step] of (prepared.applied ?? []).entries()) {
    const { of } = groupsOf(prepared.kind, shape);
    const n = size(shape);
    if (step.type === 'standardize' || step.type === 'minmax') {
      const scale = []; const offset = [];
      for (let j = 0; j < n; j++) {
        const st = step.stats[of(j)];
        if (step.type === 'standardize') { scale.push(1 / st.std); offset.push(-st.mean / st.std); }
        else { const r = (st.max - st.min) || 1; const a = (step.high - step.low) / r; scale.push(a); offset.push(step.low - st.min * a); }
      }
      data.push({ name: `pre${k}_scale`, text: floatArray(`pre${k}_scale`, scale, `${step.type}: v = v * scale + offset`) });
      data.push({ name: `pre${k}_offset`, text: floatArray(`pre${k}_offset`, offset) });
      pre.push(`  for (int j = 0; j < ${n}; j++) v[j] = v[j] * pre${k}_scale[j] + pre${k}_offset[j];  /* ${step.type} */`);
    } else if (step.type === 'clip') pre.push(`  for (int j = 0; j < ${n}; j++) v[j] = v[j] < ${f32(step.low)} ? ${f32(step.low)} : (v[j] > ${f32(step.high)} ? ${f32(step.high)} : v[j]);  /* clip */`);
    else if (step.type === 'invert') pre.push(`  for (int j = 0; j < ${n}; j++) v[j] = 1.0f - v[j];  /* invert */`);
    else if (step.type === 'polynomial') {
      pre.push(`  { float t[${step.terms.length}];  /* polynomial features */`);
      step.terms.forEach((term, i) => pre.push(`    t[${i}] = ${term.length ? term.map((j) => `v[${j}]`).join(' * ') : '1.0f'};`));
      pre.push(`    memcpy(v, t, sizeof(t)); }`);
      shape = [step.terms.length]; preSize = step.terms.length;
    }
  }
  void preSize;
  pre.push('  memcpy(input, v, MT_INPUT_SIZE * sizeof(float));');

  const outSize = size(shapeOf(out.id) ?? [1]);
  const classification = task?.kind === 'classification';
  const guard = `MT_${cName(name).toUpperCase()}_H`;
  const helpers = [...used].filter((a) => ACTIVATIONS[a]).map((a) => `static inline float mt_${a}(float z) { return ${ACTIVATIONS[a]}; }`);
  if (used.has('softmaxFn')) helpers.push('static void mt_softmax(float *v, int n) {\n  float top = v[0], sum = 0.0f;\n  for (int i = 1; i < n; i++) if (v[i] > top) top = v[i];\n  for (int i = 0; i < n; i++) { v[i] = expf(v[i] - top); sum += v[i]; }\n  for (int i = 0; i < n; i++) v[i] /= sum;\n}');
  const params = Object.values(weights ?? {}).reduce((sum, ws) => sum + Object.values(ws).reduce((s2, w) => s2 + (w.data?.length ?? 0), 0), 0);

  const header = `/* ${project.name} — exported by MyTrainer.
 * Plain C99, no libraries: build model.c with your program (C or C++).
 *   input  (${inputShape.join(', ')}) channels-last, after preprocessing → output (${(shapeOf(out.id) ?? []).join(', ')})
 *   raw    (${rawShape.join(', ')}) as the data source gives it (mt_preprocess turns it into the input)
 * ${params.toLocaleString('en-US')} weights, ${(params * 4 / 1024).toFixed(1)} KB as float32.
 */
#ifndef ${guard}
#define ${guard}

#ifdef __cplusplus
extern "C" {
#endif

#define MT_RAW_INPUT_SIZE ${size(rawShape)}
#define MT_INPUT_SIZE ${size(inputShape)}
#define MT_OUTPUT_SIZE ${outSize}
${classification ? `#define MT_CLASSES ${task.classes}\n/** Class names, in the order of the outputs. */\nextern const char *const mt_labels[MT_CLASSES];\n` : ''}
/** Raw values (as the training data source gives them) → the model's input (the training preprocessing). */
void mt_preprocess(const float *raw, float *input);

/** The model: input (MT_INPUT_SIZE floats) → output (MT_OUTPUT_SIZE floats). Not reentrant (static buffers). */
void mt_predict(const float *input, float *output);
${classification ? `
/** Preprocess + predict; returns the most likely class (output may be NULL). */
int mt_classify(const float *raw, float *output);
` : ''}
#ifdef __cplusplus
}
#endif

#endif /* ${guard} */
`;

  const source = `/* ${project.name} — exported by MyTrainer (see ${name}.h). */
#include <math.h>
#include <string.h>
#include "${name}.h"

/* ───────────────────────── weights */

${data.map((d) => d.text).join('\n\n')}

/* ───────────────────────── layer outputs */

${buffers.join('\n')}

/* ───────────────────────── activations */

${helpers.join('\n') || '/* none */'}
${classification ? `\nconst char *const mt_labels[MT_CLASSES] = { ${(labels ?? Array.from({ length: task.classes }, (_, c) => `class ${c}`)).map((l) => JSON.stringify(String(l))).join(', ')} };\n` : ''}
void mt_preprocess(const float *raw, float *input) {
${pre.join('\n')}
}

void mt_predict(const float *input, float *output) {
${body.join('\n\n')}

  memcpy(output, ${buf(out.id)}, MT_OUTPUT_SIZE * sizeof(float));
}
${classification ? `
int mt_classify(const float *raw, float *output) {
  static float input[MT_INPUT_SIZE], out[MT_OUTPUT_SIZE];
  mt_preprocess(raw, input);
  mt_predict(input, out);
  if (output) memcpy(output, out, sizeof(out));
${outSize === 1 ? '  return out[0] >= 0.5f ? 1 : 0;' : '  int best = 0;\n  for (int i = 1; i < MT_OUTPUT_SIZE; i++) if (out[i] > out[best]) best = i;\n  return best;'}
}
` : ''}`;

  const sample = example ?? null;
  const exampleC = `/* Example: runs ${name}.c on a test sample and compares with what MyTrainer computed.
 *   gcc -O2 -std=c99 example.c ${name}.c -lm -o example && ./example
 *   (MSVC: cl /O2 example.c ${name}.c)
 * Or give your own raw input on stdin:  ./example < input.txt   (MT_RAW_INPUT_SIZE numbers)
 */
#include <math.h>
#include <stdio.h>
#include "${name}.h"

${sample ? `${floatArray('sample_raw', sample.raw, 'a test sample, raw values')}\n\n${floatArray('sample_expected', sample.expected, 'the output MyTrainer computed for it')}\n` : ''}
int main(void) {
  static float raw[MT_RAW_INPUT_SIZE], input[MT_INPUT_SIZE], output[MT_OUTPUT_SIZE];
  int got = 0;
  while (got < MT_RAW_INPUT_SIZE && scanf("%f", &raw[got]) == 1) got++;
  if (got == 0) {
${sample ? `    for (int i = 0; i < MT_RAW_INPUT_SIZE; i++) raw[i] = sample_raw[i];
    printf("No input on stdin: using the built-in test sample.\\n");` : '    printf("Give MT_RAW_INPUT_SIZE numbers on stdin.\\n");\n    return 1;'}
  } else if (got < MT_RAW_INPUT_SIZE) {
    printf("Need %d numbers, got %d.\\n", MT_RAW_INPUT_SIZE, got);
    return 1;
  }
  mt_preprocess(raw, input);
  mt_predict(input, output);
  for (int i = 0; i < MT_OUTPUT_SIZE; i++) printf("output[%d] = %.6f\\n", i, output[i]);
${classification ? `  int best = mt_classify(raw, NULL);\n  printf("class: %d (%s)\\n", best, mt_labels[best]);\n` : ''}${sample ? `  if (got == 0) {
    float worst = 0.0f;
    for (int i = 0; i < MT_OUTPUT_SIZE; i++) { float d = fabsf(output[i] - sample_expected[i]); if (d > worst) worst = d; }
    printf("largest difference from MyTrainer: %g %s\\n", worst, worst < 1e-3f ? "(OK)" : "(CHECK)");
    return worst < 1e-3f ? 0 : 2;
  }
` : ''}  return 0;
}
`;

  const readme = `# ${project.name} — C export

Made by MyTrainer. Plain C99 with no libraries: copy \`${name}.h\` and \`${name}.c\` into your project.

\`\`\`c
#include "${name}.h"

float raw[MT_RAW_INPUT_SIZE];   /* the values as the data source gives them */
float input[MT_INPUT_SIZE], output[MT_OUTPUT_SIZE];
mt_preprocess(raw, input);      /* the training preprocessing */
mt_predict(input, output);${classification ? `
int cls = mt_classify(raw, NULL); /* or both at once: mt_labels[cls] */` : ''}
\`\`\`

- Input: (${inputShape.join(', ')}), channels-last (height, width, channels / time, features), float32.
- Output: (${(shapeOf(out.id) ?? []).join(', ')})${classification ? `, ${task.classes} classes: ${(labels ?? []).slice(0, 20).join(', ')}` : ''}.
- Build and check: \`gcc -O2 -std=c99 example.c ${name}.c -lm -o example && ./example\` — it runs a test sample and compares with MyTrainer.
- C++: include \`${name}.h\` as it is (it has \`extern "C"\`).
- The functions use static buffers: not reentrant, no heap. RAM ≈ the sum of the layer outputs listed in \`${name}.c\`.
${prepared.kind === 'audio' ? `- Speech: the input is a log-mel spectrogram (32 bands × 32 frames over ${prepared.media?.seconds ?? 0.6} s at 8 kHz) normalised to 0…1, like MyTrainer makes it. Compute the same features on the device.\n` : ''}${prepared.kind === 'image' ? '- Pictures: values 0…1, row by row, channels last (RGB).\n' : ''}`;

  return { files: { [`${name}.h`]: header, [`${name}.c`]: source, 'example.c': exampleC, 'README.md': readme }, errors };
}
