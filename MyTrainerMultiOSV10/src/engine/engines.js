// The two training engines behind one interface, so the UI does not care which
// one runs:
//   TfEngine    — TensorFlow.js in a Web Worker (web and desktop)
//   TorchEngine — the PyTorch script (generated or edited) run by the desktop app's Python
// Both emit the same events: ready, built, status, batch, epoch, snapshot,
// boundary, curve, evaluation, done, error, log, output (console text), exit.
import { float32ToBase64, isDesktop, listen, pyRun, pySend, pyStop } from '../platform/native.js';

class Emitter {
  constructor() { this.handlers = new Map(); }
  on(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }
  emit(type, data) {
    for (const handler of this.handlers.get(type) ?? []) {
      try { handler(data); } catch (error) { console.error(error); }
    }
    for (const handler of this.handlers.get('*') ?? []) {
      try { handler({ type, ...data }); } catch (error) { console.error(error); }
    }
  }
}

let requestCounter = 0;

export class TfEngine extends Emitter {
  constructor() {
    super();
    this.kind = 'tfjs';
    this.worker = null;
    this.backend = null;
    this.state = 'idle';
    this.pending = new Map();
  }

  /** Another backend: the worker is started again (the model is built again on the next run). */
  restart(backend) {
    this.worker?.terminate();
    this.worker = null;
    this.backend = null;
    this.state = 'idle';
    this.pending.clear();
    return this.start(backend);
  }

  start(backend = 'auto') {
    if (this.worker) return this.readyPromise;
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.readyPromise = new Promise((resolve) => {
      this.worker.onmessage = (event) => {
        const message = event.data;
        if (message.type === 'ready') {
          this.backend = message.backend;
          this.version = message.version;
          resolve(message);
        }
        if (message.type === 'status') this.state = message.state;
        if (message.type === 'prediction' && this.pending.has(message.requestId)) {
          this.pending.get(message.requestId)(message);
          this.pending.delete(message.requestId);
          return;
        }
        if (message.type === 'weights' && this.pending.has('weights')) {
          this.pending.get('weights')(message.weights);
          this.pending.delete('weights');
        }
        if (message.type === 'tfjsModel' && this.pending.has('tfjsModel')) {
          this.pending.get('tfjsModel')(message);
          this.pending.delete('tfjsModel');
        }
        this.emit(message.type, message);
      };
      this.worker.onerror = (event) => this.emit('error', { message: event.message || 'worker error', during: 'worker' });
    });
    this.worker.postMessage({ type: 'init', backend });
    return this.readyPromise;
  }

  post(message) {
    this.worker?.postMessage(message);
  }

  /** Builds the model and hands over the prepared data. */
  async prepare({ graph, inputShape, task, train, prepared }) {
    await this.start();
    this.post({ type: 'build', graph, inputShape, task, train });
    const part = (p) => ({ x: p.x, y: p.y, n: p.n, index: p.index });
    this.post({ type: 'data', train: part(prepared.train), val: part(prepared.val), test: part(prepared.test), kind: prepared.kind, task, inputShape });
  }

  train() { this.state = 'training'; this.post({ type: 'train' }); }
  pause() { this.post({ type: 'pause' }); }
  resume() { this.post({ type: 'resume' }); }
  step() { this.post({ type: 'step' }); }
  stop() { this.post({ type: 'stop' }); }
  probe(x, label = null, reason = 'probe') { this.post({ type: 'probe', x, label, reason }); }
  /** Another probe input that takes effect at once, also while training (index: the training sample). */
  setProbe(x, label = null, index = null) { this.post({ type: 'setProbe', x, label, index }); }
  evaluate() { this.post({ type: 'evaluate' }); }
  importWeights(weights) { this.post({ type: 'importWeights', weights }); }

  predict(x, n) {
    const requestId = ++requestCounter;
    return new Promise((resolve) => {
      this.pending.set(requestId, resolve);
      this.post({ type: 'predict', x, n, requestId });
    });
  }

  exportWeights() {
    return new Promise((resolve) => {
      this.pending.set('weights', resolve);
      this.post({ type: 'exportWeights' });
      setTimeout(() => { if (this.pending.has('weights')) { this.pending.delete('weights'); resolve(null); } }, 15000);
    });
  }

  /** The built model as TensorFlow.js files: { topology, weightSpecs, weightData } (or null). */
  exportTfjs() {
    return new Promise((resolve) => {
      this.pending.set('tfjsModel', resolve);
      this.post({ type: 'exportTfjs' });
      setTimeout(() => { if (this.pending.has('tfjsModel')) { this.pending.delete('tfjsModel'); resolve(null); } }, 30000);
    });
  }

  get canServe() { return true; }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
  }
}

/**
 * The run folder's files for the PyTorch bridge: meta.json plus x_/y_<part>.f32 (raw little-endian float32).
 */
export function torchRunFiles({ prepared, task, inputShape, train, probe, kind }) {
  const parts = {};
  const files = [];
  for (const name of ['train', 'val', 'test']) {
    const part = prepared[name];
    parts[name] = { n: part.n, index: Array.from(part.index ?? []) };
    if (part.n) {
      files.push({ name: `x_${name}.f32`, data: float32ToBase64(part.x), base64: true });
      files.push({ name: `y_${name}.f32`, data: float32ToBase64(part.y), base64: true });
    }
  }
  const meta = {
    input_shape: inputShape,
    task,
    kind,
    parts,
    epochs: train.epochs,
    snapshot_every: train.snapshotEvery,
    probe: probe ? Array.from(probe) : null,
  };
  files.push({ name: 'meta.json', data: JSON.stringify(meta), base64: false });
  return files;
}

export class TorchEngine extends Emitter {
  constructor() {
    super();
    this.kind = 'torch';
    this.run = null;
    this.state = 'idle';
    this.pending = new Map();
    this.unlisten = [];
    this.nameToId = new Map();
  }

  async start() {
    if (!isDesktop()) throw new Error('web.desktopOnly');
    if (this.unlisten.length) return;
    this.unlisten.push(await listen('py-message', (payload) => this.message(payload)));
    this.unlisten.push(await listen('py-output', (payload) => { if (payload.run === this.run) this.emit('output', { stream: payload.stream, text: payload.text }); }));
    this.unlisten.push(await listen('py-exit', (payload) => {
      if (payload.run !== this.run) return;
      const wasTraining = this.state === 'training' || this.state === 'paused';
      this.run = null;
      this.state = 'idle';
      this.emit('status', { state: 'idle' });
      this.emit('exit', { code: payload.code, wasTraining });
    }));
  }

  message({ run, text }) {
    if (run !== this.run) return;
    let message;
    try { message = JSON.parse(text); } catch { return; }
    if (message.type === 'status') this.state = message.state;
    if (message.type === 'snapshot' && message.byName) {
      const nodes = {};
      for (const [name, value] of Object.entries(message.nodes ?? {})) {
        const id = this.nameToId.get(name);
        if (id) nodes[id] = value;
      }
      message.nodes = nodes;
    }
    if (message.type === 'prediction' && this.pending.has(message.requestId)) {
      this.pending.get(message.requestId)({ ...message, values: Float32Array.from(message.values) });
      this.pending.delete(message.requestId);
      return;
    }
    if (message.type === 'weights' && this.pending.has(message.requestId)) {
      const nodes = {};
      for (const [name, value] of Object.entries(message.nodes ?? {})) { const id = this.nameToId.get(name); if (id) nodes[id] = value; }
      this.pending.get(message.requestId)(nodes);
      this.pending.delete(message.requestId);
      return;
    }
    if (message.type === 'hello') {
      this.version = message.torch;
      this.backend = message.device;
      this.emit('built', { params: message.params, backend: `torch · ${message.device}`, torch: message.torch, python: message.python });
      return;
    }
    if (message.type === 'done') this.state = 'serving';
    this.emit(message.type, message);
  }

  async prepare({ graph, inputShape, task, train, prepared, python, code, probe }) {
    await this.start();
    this.prepared = { graph, inputShape, task, train, prepared, python, code, probe };
    this.nameToId = new Map(graph.nodes.map((node) => [node.name, node.id]));
  }

  async train() {
    const p = this.prepared;
    if (!p) throw new Error('prepare first');
    if (this.run) { await pyStop(this.run); this.run = null; }
    const files = torchRunFiles({ prepared: p.prepared, task: p.task, inputShape: p.inputShape, train: p.train, probe: p.probe, kind: p.prepared.kind });
    this.state = 'training';
    this.emit('status', { state: 'training', epochs: p.train.epochs, from: 0 });
    this.run = await pyRun(p.python, p.code, files);
    this.emit('log', { level: 'info', code: 'torch.started', params: { run: this.run } });
    return this.run;
  }

  send(command) {
    if (!this.run) return Promise.resolve();
    return pySend(this.run, JSON.stringify(command)).catch(() => {});
  }

  pause() { this.send({ cmd: 'pause' }); }
  resume() { this.send({ cmd: 'resume' }); }
  step() { this.send({ cmd: 'step' }); }
  stop() {
    if (this.state === 'serving') { this.end(); return; }
    this.send({ cmd: 'stop' });
  }
  end() {
    if (this.run) pyStop(this.run);
  }
  probe(x, label = null, reason = 'probe') { this.send({ cmd: 'probe', x: x ? Array.from(x) : null, label, reason }); }
  evaluate() { this.send({ cmd: 'evaluate' }); }
  importWeights() {}

  predict(x, n) {
    const requestId = ++requestCounter;
    return new Promise((resolve) => {
      if (!this.run) { resolve(null); return; }
      this.pending.set(requestId, resolve);
      this.send({ cmd: 'predict', x: Array.from(x), n, requestId });
      setTimeout(() => { if (this.pending.has(requestId)) { this.pending.delete(requestId); resolve(null); } }, 20000);
    });
  }

  /** The trained weights in full, by node id, with canonical names ({ kernel: { shape, data } … }). */
  exportWeights() {
    const requestId = ++requestCounter;
    return new Promise((resolve) => {
      if (!this.run) { resolve(null); return; }
      this.pending.set(requestId, resolve);
      this.send({ cmd: 'weights', requestId });
      setTimeout(() => { if (this.pending.has(requestId)) { this.pending.delete(requestId); resolve(null); } }, 30000);
    });
  }

  get canServe() { return Boolean(this.run); }

  dispose() {
    this.end();
    for (const off of this.unlisten) off?.();
    this.unlisten = [];
  }
}
