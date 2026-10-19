// Model graph → TensorFlow.js functional model. Each graph node becomes one
// Keras-style layer named after the node, so activations, weights and gradients
// can be reported per node (the engines speak in node ids).
import { incoming, nodeById, outputNodes, topoOrder } from '../domain/graph.js';
import { parseShape } from '../domain/layers.js';

/**
 * Layers TensorFlow.js does not have (made once per tf instance): token + position embedding,
 * multi-head self-attention (optionally causal), the last time step, and the average over the
 * frequency axis of a spectrogram (BC-ResNet).
 */
const customCache = new WeakMap();
export function customLayers(tf) {
  if (customCache.has(tf)) return customCache.get(tf);
  const glorot = () => tf.initializers.glorotUniform({});
  const normal = () => tf.initializers.randomNormal({ mean: 0, stddev: 0.02 });
  const zeros = () => tf.initializers.zeros();

  class TokenPositionEmbedding extends tf.layers.Layer {
    constructor(config) { super(config); this.inputDim = config.inputDim; this.outputDim = config.outputDim; }
    build(inputShape) {
      this.length = inputShape[1];
      this.embeddings = this.addWeight('embeddings', [this.inputDim, this.outputDim], 'float32', normal());
      this.positions = this.addWeight('positions', [this.length, this.outputDim], 'float32', normal());
      this.built = true;
    }
    computeOutputShape(inputShape) { return [inputShape[0], inputShape[1], this.outputDim]; }
    call(inputs) {
      return tf.tidy(() => {
        const ids = tf.cast(Array.isArray(inputs) ? inputs[0] : inputs, 'int32');
        return tf.add(tf.gather(this.embeddings.read(), ids), this.positions.read());
      });
    }
    getConfig() { return { ...super.getConfig(), inputDim: this.inputDim, outputDim: this.outputDim }; }
    static get className() { return 'MyTrainerTokenPositionEmbedding'; }
  }

  class SelfAttention extends tf.layers.Layer {
    constructor(config) { super(config); this.heads = config.heads; this.causal = config.causal; }
    build(inputShape) {
      const d = inputShape[2];
      this.dim = d;
      this.w = {};
      for (const name of ['query', 'key', 'value', 'output']) {
        // Kept in this.w: Layer already has an 'output' getter.
        this.w[name] = this.addWeight(name, [d, d], 'float32', glorot());
        this.w[`${name}Bias`] = this.addWeight(`${name}Bias`, [d], 'float32', zeros());
      }
      this.built = true;
    }
    computeOutputShape(inputShape) { return inputShape; }
    call(inputs) {
      return tf.tidy(() => {
        const x = Array.isArray(inputs) ? inputs[0] : inputs;
        const [n, length, d] = x.shape;
        const h = this.heads;
        const dh = d / h;
        const project = (w, b) => tf.add(tf.matMul(tf.reshape(x, [-1, d]), w.read()), b.read());
        const split = (t) => tf.transpose(tf.reshape(t, [n, length, h, dh]), [0, 2, 1, 3]);
        const q = split(project(this.w.query, this.w.queryBias));
        const k = split(project(this.w.key, this.w.keyBias));
        const v = split(project(this.w.value, this.w.valueBias));
        let scores = tf.div(tf.matMul(q, k, false, true), Math.sqrt(dh));
        if (this.causal) {
          // A token sees itself and the tokens before it, never the ones after.
          const mask = tf.sub(1, tf.linalg.bandPart(tf.ones([length, length]), -1, 0));
          scores = tf.sub(scores, tf.mul(mask, 1e9));
        }
        const weights = tf.softmax(scores, -1);
        const mixed = tf.reshape(tf.transpose(tf.matMul(weights, v), [0, 2, 1, 3]), [-1, d]);
        return tf.reshape(tf.add(tf.matMul(mixed, this.w.output.read()), this.w.outputBias.read()), [n, length, d]);
      });
    }
    getConfig() { return { ...super.getConfig(), heads: this.heads, causal: this.causal }; }
    static get className() { return 'MyTrainerSelfAttention'; }
  }

  class LastStep extends tf.layers.Layer {
    computeOutputShape(inputShape) { return [inputShape[0], inputShape[2]]; }
    call(inputs) {
      return tf.tidy(() => {
        const x = Array.isArray(inputs) ? inputs[0] : inputs;
        return tf.squeeze(tf.slice(x, [0, x.shape[1] - 1, 0], [-1, 1, -1]), [1]);
      });
    }
    static get className() { return 'MyTrainerLastStep'; }
  }

  class FreqAvgPool extends tf.layers.Layer {
    computeOutputShape(inputShape) { return [inputShape[0], 1, inputShape[2], inputShape[3]]; }
    call(inputs) { return tf.tidy(() => tf.mean(Array.isArray(inputs) ? inputs[0] : inputs, 1, true)); }
    static get className() { return 'MyTrainerFreqAvgPool'; }
  }

  for (const cls of [TokenPositionEmbedding, SelfAttention, LastStep, FreqAvgPool]) tf.serialization.registerClass(cls);
  const classes = { TokenPositionEmbedding, SelfAttention, LastStep, FreqAvgPool };
  customCache.set(tf, classes);
  return classes;
}

/** One TensorFlow.js layer for a node. `weightDecay` adds an L2 penalty to kernels. */
export function makeLayer(tf, node, weightDecay = 0) {
  const p = node.params;
  const name = `${node.name}__${Math.random().toString(36).slice(2, 7)}`;
  const reg = weightDecay > 0 ? { kernelRegularizer: tf.regularizers.l2({ l2: weightDecay }) } : {};
  const act = (value) => (value === 'linear' ? 'linear' : value);
  switch (node.type) {
    case 'dense': return tf.layers.dense({ name, units: p.units, activation: act(p.activation), useBias: p.useBias, ...reg });
    case 'activation': return tf.layers.activation({ name, activation: act(p.activation) });
    case 'leakyRelu': return tf.layers.leakyReLU({ name, alpha: p.alpha });
    case 'dropout': return tf.layers.dropout({ name, rate: p.rate });
    case 'batchNorm': return tf.layers.batchNormalization({ name, momentum: p.momentum, epsilon: p.epsilon });
    case 'layerNorm': return tf.layers.layerNormalization({ name, epsilon: p.epsilon });
    case 'flatten': return tf.layers.flatten({ name });
    case 'reshape': return tf.layers.reshape({ name, targetShape: parseShape(p.targetShape) });
    case 'conv2d': return tf.layers.conv2d({ name, filters: p.filters, kernelSize: p.kernelSize, strides: p.strides, padding: p.padding, activation: act(p.activation), useBias: p.useBias, ...reg });
    case 'maxPool2d': return tf.layers.maxPooling2d({ name, poolSize: p.poolSize, strides: p.strides, padding: 'valid' });
    case 'avgPool2d': return tf.layers.averagePooling2d({ name, poolSize: p.poolSize, strides: p.strides, padding: 'valid' });
    case 'globalAvgPool2d': return tf.layers.globalAveragePooling2d({ name });
    case 'upSampling2d': return tf.layers.upSampling2d({ name, size: [p.size, p.size] });
    case 'conv1d': return tf.layers.conv1d({ name, filters: p.filters, kernelSize: p.kernelSize, strides: p.strides, padding: p.padding, activation: act(p.activation), useBias: p.useBias, ...reg });
    case 'maxPool1d': return tf.layers.maxPooling1d({ name, poolSize: p.poolSize, strides: p.strides, padding: 'valid' });
    case 'globalAvgPool1d': return tf.layers.globalAveragePooling1d({ name });
    case 'simpleRnn': return tf.layers.simpleRNN({ name, units: p.units, activation: p.activation, returnSequences: p.returnSequences, ...reg });
    case 'lstm': return tf.layers.lstm({ name, units: p.units, returnSequences: p.returnSequences, recurrentActivation: 'sigmoid', ...reg });
    case 'gru': return tf.layers.gru({ name, units: p.units, returnSequences: p.returnSequences, recurrentActivation: 'sigmoid', ...reg });
    case 'embedding': return tf.layers.embedding({ name, inputDim: p.inputDim, outputDim: p.outputDim });
    case 'depthwiseConv2d': return tf.layers.depthwiseConv2d({ name, kernelSize: [p.kernelH, p.kernelW], strides: p.strides, depthMultiplier: p.depthMultiplier, padding: p.padding, activation: act(p.activation), useBias: p.useBias });
    case 'freqAvgPool': return new (customLayers(tf).FreqAvgPool)({ name });
    case 'tokenPositionEmbedding': return new (customLayers(tf).TokenPositionEmbedding)({ name, inputDim: p.inputDim, outputDim: p.outputDim });
    case 'selfAttention': return new (customLayers(tf).SelfAttention)({ name, heads: p.heads, causal: p.causal });
    case 'lastStep': return new (customLayers(tf).LastStep)({ name });
    case 'add': return tf.layers.add({ name });
    case 'concatenate': return tf.layers.concatenate({ name });
    default: throw new Error(`layer ${node.type} is not supported by TensorFlow.js`);
  }
}

/**
 * Builds the model. Returns { model, probeModel (outputs every node's tensor), layers: Map(nodeId → layer),
 * order: [nodeIds] (the probe model's outputs, same order) }.
 */
export function buildTfModel(tf, graph, inputShape, { weightDecay = 0 } = {}) {
  const order = topoOrder(graph);
  const tensors = new Map();
  const layers = new Map();
  let input = null;
  for (const id of order) {
    const node = nodeById(graph, id);
    if (node.type === 'input') {
      if (input) throw new Error('only one input is supported');
      input = tf.input({ shape: inputShape, name: `${node.name}__${Math.random().toString(36).slice(2, 7)}` });
      tensors.set(id, input);
      continue;
    }
    const sources = incoming(graph, id).map((edge) => tensors.get(edge.from));
    if (!sources.length || sources.some((t) => !t)) throw new Error(`${node.name}: no input`);
    const layer = makeLayer(tf, node, weightDecay);
    layers.set(id, layer);
    tensors.set(id, layer.apply(sources.length === 1 ? sources[0] : sources));
  }
  const outputs = outputNodes(graph);
  if (!input) throw new Error('the model has no input layer');
  if (outputs.length !== 1) throw new Error('the model needs exactly one output');
  const model = tf.model({ inputs: input, outputs: tensors.get(outputs[0].id) });
  const reachable = order.filter((id) => tensors.has(id));
  const probeModel = tf.model({ inputs: input, outputs: reachable.map((id) => tensors.get(id)) });
  return { model, probeModel, layers, order: reachable, outputId: outputs[0].id, inputId: order.find((id) => nodeById(graph, id).type === 'input') };
}

/** Canonical weight names per layer type (the PyTorch bridge sends the same names). */
export function canonicalWeights(type, values) {
  const names = {
    dense: ['kernel', 'bias'],
    conv2d: ['kernel', 'bias'],
    conv1d: ['kernel', 'bias'],
    batchNorm: ['gamma', 'beta', 'movingMean', 'movingVariance'],
    layerNorm: ['gamma', 'beta'],
    embedding: ['embeddings'],
    depthwiseConv2d: ['kernel', 'bias'],
    tokenPositionEmbedding: ['embeddings', 'positions'],
    selfAttention: ['query', 'queryBias', 'key', 'keyBias', 'value', 'valueBias', 'output', 'outputBias'],
    simpleRnn: ['kernel', 'recurrentKernel', 'bias'],
    lstm: ['kernel', 'recurrentKernel', 'bias'],
    gru: ['kernel', 'recurrentKernel', 'bias'],
  }[type] ?? [];
  const out = {};
  values.forEach((value, i) => { out[names[i] ?? `w${i}`] = value; });
  return out;
}
