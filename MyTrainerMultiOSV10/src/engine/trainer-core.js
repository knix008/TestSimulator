// The TensorFlow.js trainer. It runs in a Web Worker in the app (worker.js) and
// directly in Node for the tests. It speaks the same messages as the PyTorch
// bridge (python/mytrainer_bridge.py), so the UI does not care which engine runs:
//
//   in : build · data · train · pause · resume · step · stop · probe · predict · evaluate · exportWeights · importWeights
//   out: ready · built · status · batch · epoch · snapshot · boundary · curve · evaluation · weights · done · error · log
import { canonicalWeights, buildTfModel } from './tfbuild.js';
import { nodeById } from '../domain/graph.js';
import { resolveLoss, scheduledRate } from '../domain/project.js';
import { targetsFor } from '../domain/preprocess.js';

/** Largest tensor sent whole in a snapshot; bigger ones are summarized. */
export const MAX_VALUES = 300_000;
const HIST_BINS = 30;

const size = (shape) => shape.reduce((a, b) => a * b, 1);

export function histogram(values, bins = HIST_BINS) {
  let min = Infinity; let max = -Infinity; let sum = 0; let sq = 0;
  for (const v of values) { if (v < min) min = v; if (v > max) max = v; sum += v; sq += v * v; }
  const n = values.length || 1;
  if (!Number.isFinite(min)) { min = 0; max = 0; }
  const width = (max - min) || 1;
  const counts = new Array(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.floor(((v - min) / width) * bins))]++;
  const mean = sum / n;
  return { min, max, mean, std: Math.sqrt(Math.max(0, sq / n - mean * mean)), counts };
}

function meanAbs(values) {
  let s = 0;
  for (const v of values) s += Math.abs(v);
  return values.length ? s / values.length : 0;
}

const tensorInfo = (shape, data) => (data.length <= MAX_VALUES ? { shape, data } : { shape, data: null, stats: histogram(data) });

function optimizerFor(tf, train) {
  const lr = train.learningRate;
  switch (train.optimizer) {
    case 'sgd': return tf.train.sgd(lr);
    case 'momentum': return tf.train.momentum(lr, train.momentum ?? 0.9, train.nesterov === true);
    case 'rmsprop': return tf.train.rmsprop(lr, train.rho ?? 0.9, 0, train.epsilon ?? 1e-7);
    case 'adagrad': return tf.train.adagrad(lr);
    case 'adadelta': return tf.train.adadelta(lr, train.rho ?? 0.95, train.epsilon ?? 1e-7);
    case 'adamax': return tf.train.adamax(lr, train.beta1 ?? 0.9, train.beta2 ?? 0.999, train.epsilon ?? 1e-7);
    default: return tf.train.adam(lr, train.beta1 ?? 0.9, train.beta2 ?? 0.999, train.epsilon ?? 1e-7);
  }
}

function lossFor(tf, name) {
  switch (name) {
    case 'binaryCrossentropy': return 'binaryCrossentropy';
    case 'categoricalCrossentropy': return 'categoricalCrossentropy';
    case 'meanAbsoluteError': return 'meanAbsoluteError';
    case 'huber': return (yTrue, yPred) => tf.losses.huberLoss(yTrue, yPred);
    default: return 'meanSquaredError';
  }
}

export class Trainer {
  constructor(tf, post) {
    this.tf = tf;
    this.post = post;
    this.built = null;
    this.data = null;
    this.state = 'idle';
    this.paused = false;
    this.resumeWaiters = [];
    this.stepMode = false;
    this.history = [];
    this.probe = null;
    this.lastBatchPost = 0;
  }

  send(type, data = {}, transfer = []) {
    this.post({ type, ...data }, transfer);
  }

  async handle(message) {
    try {
      switch (message.type) {
        case 'build': return this.build(message);
        case 'data': return this.setData(message);
        case 'train': return await this.train();
        case 'pause': this.paused = true; return this.status('paused');
        case 'resume': this.stepMode = false; return this.resume();
        case 'step': this.stepMode = true; return this.resume();
        case 'stop': this.stopRequested = true; return this.resume();
        case 'probe': return await this.snapshot(message.x, message.label ?? null, message.reason ?? 'probe');
        case 'predict': return this.predict(message);
        case 'evaluate': return await this.evaluate();
        case 'exportWeights': return this.exportWeights();
        case 'importWeights': return this.importWeights(message.weights);
        case 'dispose': return this.dispose();
        default: return undefined;
      }
    } catch (error) {
      this.send('error', { message: String(error?.message ?? error), stack: String(error?.stack ?? ''), during: message.type });
      if (message.type === 'train') this.status('idle');
      return undefined;
    }
  }

  status(state, extra = {}) {
    this.state = state;
    this.send('status', { state, ...extra });
  }

  dispose() {
    this.built?.model.dispose();
    this.built = null;
  }

  build({ graph, inputShape, task, train }) {
    this.dispose();
    this.graph = graph;
    this.task = task;
    this.trainConfig = train;
    this.inputShape = inputShape;
    const built = buildTfModel(this.tf, graph, inputShape, { weightDecay: train.weightDecay });
    this.built = built;
    this.lossName = resolveLoss(train, task);
    // Label smoothing (categorical): the targets become (1 − ε)·onehot + ε / classes.
    const smoothing = this.lossName === 'categoricalCrossentropy' && train.labelSmoothing > 0 ? train.labelSmoothing : 0;
    const tf = this.tf;
    const loss = smoothing
      ? (yTrue, yPred) => tf.tidy(() => {
        const classes = yTrue.shape.at(-1);
        const target = tf.add(tf.mul(yTrue, 1 - smoothing), smoothing / classes);
        return tf.mean(tf.neg(tf.sum(tf.mul(target, tf.log(tf.clipByValue(yPred, 1e-7, 1))), -1)));
      })
      : lossFor(tf, this.lossName);
    built.model.compile({
      optimizer: optimizerFor(tf, train),
      loss,
      metrics: task.kind === 'classification' ? [smoothing ? 'categoricalAccuracy' : 'accuracy'] : [],
    });
    this.history = [];
    this.epoch = 0;
    this.probe = null;
    const params = built.model.countParams();
    this.send('built', { params, layers: built.order.length, loss: this.lossName, backend: this.tf.getBackend() });
  }

  setData({ train, val, test, kind, task, inputShape }) {
    this.data?.tensors?.forEach((t) => t.dispose());
    const tf = this.tf;
    const shapeOf = (part) => [part.n, ...inputShape];
    const pack = (part) => {
      const targets = targetsFor(part, task);
      return { x: tf.tensor(part.x, shapeOf(part)), y: tf.tensor(targets.values, targets.shape), n: part.n, raw: part };
    };
    const parts = { train: pack(train), val: val.n ? pack(val) : null, test: test.n ? pack(test) : null };
    this.probe = null;
    this.data = { ...parts, kind, task, inputShape, tensors: [parts.train.x, parts.train.y, parts.val?.x, parts.val?.y, parts.test?.x, parts.test?.y].filter(Boolean) };
    this.send('dataReady', { train: train.n, val: val.n, test: test.n });
  }

  resume() {
    this.paused = false;
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    for (const resolve of waiters) resolve();
    if (this.state === 'paused') this.status('training');
  }

  waitIfPaused() {
    if (!this.paused) return Promise.resolve();
    return new Promise((resolve) => this.resumeWaiters.push(resolve));
  }

  async train() {
    if (!this.built || !this.data) throw new Error('build the model and load the data first');
    if (this.state === 'training' || this.state === 'paused') return;
    const { model } = this.built;
    const train = this.trainConfig;
    const data = this.data;
    const startEpoch = this.epoch;
    const endEpoch = startEpoch + train.epochs;
    this.stopRequested = false;
    this.paused = false;
    this.status('training', { epochs: train.epochs, from: startEpoch });
    let best = Infinity;
    let since = 0;
    const started = Date.now();
    const batches = Math.ceil(data.train.n / train.batchSize);
    if (startEpoch === 0) await this.snapshot(null, null, 'epoch');
    const self = this;
    await model.fit(data.train.x, data.train.y, {
      epochs: endEpoch,
      initialEpoch: startEpoch,
      batchSize: train.batchSize,
      shuffle: train.shuffle !== false,
      validationData: data.val ? [data.val.x, data.val.y] : undefined,
      verbose: 0,
      callbacks: {
        onEpochBegin: async (epoch) => {
          const rate = scheduledRate(train, epoch - startEpoch);
          model.optimizer.learningRate = rate;
          self.rate = rate;
        },
        onBatchEnd: async (batch, logs) => {
          const now = Date.now();
          if (now - self.lastBatchPost > 120 || batch === batches - 1) {
            self.lastBatchPost = now;
            self.send('batch', { epoch: self.epoch, batch: batch + 1, batches, loss: logs.loss, acc: logs.acc });
          }
          if (self.stepMode) { self.paused = true; self.status('paused', { step: true }); }
          await self.waitIfPaused();
          if (self.stopRequested) model.stopTraining = true;
          await new Promise((resolve) => setTimeout(resolve, 0));
        },
        onEpochEnd: async (epoch, logs) => {
          self.epoch = epoch + 1;
          const entry = { epoch: epoch + 1, loss: logs.loss, acc: logs.acc ?? logs.categoricalAccuracy ?? null, valLoss: logs.val_loss ?? null, valAcc: logs.val_acc ?? logs.val_categoricalAccuracy ?? null, lr: self.rate, time: Date.now() - started };
          self.history.push(entry);
          self.send('epoch', { ...entry, epochs: endEpoch });
          if ((epoch + 1 - startEpoch) % train.snapshotEvery === 0 || epoch + 1 === endEpoch) await self.snapshot(null, null, 'epoch');
          // Early stopping watches one figure (lower loss / higher accuracy is better), by at least minDelta.
          const pick = { val_loss: entry.valLoss ?? entry.loss, loss: entry.loss, val_acc: entry.valAcc ?? entry.acc, acc: entry.acc }[train.monitor ?? 'val_loss'] ?? entry.loss;
          const watched = (train.monitor ?? 'val_loss').endsWith('acc') ? -(pick ?? 0) : pick;
          if (watched < best - Math.max(1e-6, train.minDelta ?? 0)) {
            best = watched; since = 0;
            if (train.earlyStop && train.restoreBest) { self.bestWeights?.forEach((w) => w.dispose()); self.bestWeights = model.getWeights().map((w) => w.clone()); self.bestEpoch = epoch + 1; }
          } else since++;
          if (train.earlyStop && since >= train.patience) {
            self.send('log', { level: 'info', code: 'train.earlyStopped', params: { epoch: epoch + 1 } });
            model.stopTraining = true;
          }
          if (self.stopRequested) model.stopTraining = true;
        },
      },
    });
    if (this.bestWeights) {
      // Restore the best epoch's weights (early stopping with "restore best").
      model.setWeights(this.bestWeights);
      this.bestWeights.forEach((w) => w.dispose());
      this.bestWeights = null;
      this.send('log', { level: 'info', code: 'train.restoredBest', params: { epoch: this.bestEpoch } });
      await this.snapshot(null, null, 'epoch');
    }
    const evaluation = await this.evaluate();
    this.status('idle');
    this.send('done', { epochs: this.epoch, stopped: Boolean(this.stopRequested), history: this.history, evaluation: evaluation?.summary ?? null, time: Date.now() - started });
  }

  /** The input for a snapshot: the given values, or the chosen probe sample of the data. */
  probeInput(x) {
    const tf = this.tf;
    const size_ = size(this.inputShape);
    if (x && x.length === size_) {
      this.probe = Float32Array.from(x);
    } else if ((!this.probe || this.probe.length !== size_) && this.data) {
      const s = size(this.inputShape);
      const index = Math.min(this.trainConfig.probeIndex, this.data.train.n - 1);
      this.probe = this.data.train.raw.x.slice(index * s, (index + 1) * s);
    }
    return this.probe ? tf.tensor(this.probe, [1, ...this.inputShape]) : null;
  }

  /** Activations of every node for one input, plus weights, gradients and weight statistics. */
  async snapshot(x, label, reason) {
    if (!this.built) return;
    const tf = this.tf;
    const input = this.probeInput(x);
    if (!input) return;
    const { probeModel, layers, order } = this.built;
    const outputs = tf.tidy(() => {
      const result = probeModel.predict(input);
      return Array.isArray(result) ? result : [result];
    });
    const nodes = {};
    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      const tensor = outputs[i];
      nodes[id] = { act: tensorInfo(tensor.shape.slice(1), await tensor.data()) };
    }
    outputs.forEach((t) => t.dispose());
    const grads = this.gradients();
    for (const [id, layer] of layers) {
      const node = nodeById(this.graph, id);
      const values = layer.getWeights();
      if (!values.length) continue;
      const arrays = await Promise.all(values.map(async (w) => ({ shape: w.shape, data: await w.data() })));
      const named = canonicalWeights(node.type, arrays);
      nodes[id].weights = Object.fromEntries(Object.entries(named).map(([key, w]) => [key, tensorInfo(w.shape, w.data)]));
      nodes[id].stats = Object.fromEntries(Object.entries(named).map(([key, w]) => [key, histogram(w.data)]));
      if (grads?.has(id)) nodes[id].grads = grads.get(id);
    }
    input.dispose();
    this.send('snapshot', { reason, epoch: this.epoch, input: { shape: this.inputShape, data: this.probe }, label, nodes });
    await this.visualExtras();
  }

  /** Mean |gradient| of each weight on a training batch (how strongly each layer is learning). */
  gradients() {
    if (!this.data?.train) return null;
    const tf = this.tf;
    const { model, layers } = this.built;
    const n = Math.min(64, this.data.train.n);
    const out = new Map();
    // A training-mode pass updates batch normalization's moving statistics: keep them as they were.
    const kept = [...layers].filter(([id]) => nodeById(this.graph, id)?.type === 'batchNorm').map(([, layer]) => [layer, layer.getWeights().map((w) => w.clone())]);
    try {
      tf.tidy(() => {
        const xb = this.data.train.x.slice(0, n);
        const yb = this.data.train.y.slice(0, n);
        const lossFn = typeof model.loss === 'function' ? model.loss : null;
        const { grads } = tf.variableGrads(() => {
          const pred = model.apply(xb, { training: true });
          if (lossFn) return lossFn(yb, pred).mean();
          if (this.lossName === 'binaryCrossentropy') return tf.metrics.binaryCrossentropy(yb, pred).mean();
          if (this.lossName === 'categoricalCrossentropy') return tf.metrics.categoricalCrossentropy(yb, pred).mean();
          if (this.lossName === 'meanAbsoluteError') return tf.losses.absoluteDifference(yb, pred);
          if (this.lossName === 'huber') return tf.losses.huberLoss(yb, pred);
          return tf.losses.meanSquaredError(yb, pred);
        });
        for (const [id, layer] of layers) {
          const node = nodeById(this.graph, id);
          const values = layer.trainableWeights.map((w) => grads[w.originalName] ?? grads[w.name]).filter(Boolean);
          if (!values.length) continue;
          const named = canonicalWeights(node.type, values.map((g) => ({ shape: g.shape, data: g.dataSync() })));
          out.set(id, Object.fromEntries(Object.entries(named).map(([key, g]) => [key, { meanAbs: meanAbs(g.data), ...(g.data.length <= 20000 ? { shape: g.shape, data: g.data } : {}) }])));
        }
      });
    } catch (error) {
      this.send('log', { level: 'warning', code: 'train.gradFailed', params: { message: String(error?.message ?? error) } });
      return null;
    } finally {
      for (const [layer, values] of kept) {
        layer.setWeights(values);
        values.forEach((w) => w.dispose());
      }
    }
    return out;
  }

  /** Decision boundary (2-D points) or fitted curve (1-D functions) for the training view. */
  async visualExtras() {
    const tf = this.tf;
    const data = this.data;
    if (!data || !this.built) return;
    if (data.kind === 'points2d' && this.inputShape.length === 1 && this.inputShape[0] === 2) {
      const raw = data.train.raw.x;
      let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
      for (let i = 0; i < raw.length; i += 2) {
        minX = Math.min(minX, raw[i]); maxX = Math.max(maxX, raw[i]);
        minY = Math.min(minY, raw[i + 1]); maxY = Math.max(maxY, raw[i + 1]);
      }
      const padX = (maxX - minX) * 0.1 || 1;
      const padY = (maxY - minY) * 0.1 || 1;
      const bounds = { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
      const grid = 48;
      const points = new Float32Array(grid * grid * 2);
      for (let gy = 0; gy < grid; gy++) for (let gx = 0; gx < grid; gx++) {
        points[(gy * grid + gx) * 2] = bounds.minX + ((gx + 0.5) / grid) * (bounds.maxX - bounds.minX);
        points[(gy * grid + gx) * 2 + 1] = bounds.maxY - ((gy + 0.5) / grid) * (bounds.maxY - bounds.minY);
      }
      const values = await tf.tidy(() => this.built.model.predict(tf.tensor(points, [grid * grid, 2]))).data();
      this.send('boundary', { grid, bounds, outputs: values.length / (grid * grid), values });
    } else if (data.kind === 'function1d' && this.inputShape[0] === 1) {
      const raw = data.train.raw.x;
      let min = Infinity; let max = -Infinity;
      for (const v of raw) { min = Math.min(min, v); max = Math.max(max, v); }
      const steps = 160;
      const xs = Float32Array.from({ length: steps }, (_, i) => min + ((max - min) * i) / (steps - 1));
      const ys = await tf.tidy(() => this.built.model.predict(tf.tensor(xs, [steps, 1]))).data();
      this.send('curve', { xs, ys });
    }
  }

  async predict({ x, n, requestId }) {
    const tf = this.tf;
    const values = await tf.tidy(() => this.built.model.predict(tf.tensor(x, [n, ...this.inputShape]))).data();
    this.send('prediction', { requestId, values, n });
  }

  /** Test-set evaluation: loss / accuracy, every prediction (confusion matrix, error views). */
  async evaluate() {
    const tf = this.tf;
    const part = this.data?.test ?? this.data?.val;
    if (!part || !this.built) return null;
    const result = this.built.model.evaluate(part.x, part.y, { batchSize: 256 });
    const scalars = Array.isArray(result) ? result : [result];
    const [loss, acc] = await Promise.all(scalars.map((s) => s.data().then((d) => d[0])));
    scalars.forEach((s) => s.dispose());
    const predictions = await tf.tidy(() => this.built.model.predict(part.x)).data();
    const summary = { loss, acc: acc ?? null, n: part.n, part: this.data.test ? 'test' : 'val' };
    const payload = { summary, predictions, targets: part.raw.y, index: part.raw.index, outputs: predictions.length / part.n };
    this.send('evaluation', payload);
    return payload;
  }

  /** Trained weights by node id (each a list of { shape, data }) — kept in the project file. */
  async exportWeights() {
    if (!this.built) return;
    const out = {};
    for (const [id, layer] of this.built.layers) {
      const values = layer.getWeights();
      if (values.length) out[id] = await Promise.all(values.map(async (w) => ({ shape: w.shape, data: Array.from(await w.data()) })));
    }
    this.send('weights', { weights: out, epoch: this.epoch });
  }

  importWeights(weights) {
    if (!this.built || !weights) return;
    const tf = this.tf;
    let loaded = 0;
    for (const [id, layer] of this.built.layers) {
      const saved = weights[id];
      const current = layer.getWeights();
      if (!saved || saved.length !== current.length) continue;
      if (saved.some((w, i) => w.shape.join(',') !== current[i].shape.join(','))) continue;
      layer.setWeights(saved.map((w) => tf.tensor(w.data, w.shape)));
      loaded++;
    }
    this.send('weightsLoaded', { layers: loaded });
  }
}
