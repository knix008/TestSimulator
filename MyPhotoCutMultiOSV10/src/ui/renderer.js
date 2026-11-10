// A few workers (engine/worker.js) draw the caricatures at the same time. Each caricature always
// goes to the same worker, which keeps its style drawing, so an effect change is redrawn quickly.
// Only the newest request of a caricature counts: an older one still running is ignored when done.
export class RenderPool {
  constructor(size = Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 4) - 1))) {
    this.workers = Array.from({ length: size }, () => new Worker(new URL('../engine/worker.js', import.meta.url), { type: 'module' }));
    this.pending = new Map();
    this.latest = new Map();
    this.job = 0;
    this.busy = 0;
    this.onBusy = null;
    for (const worker of this.workers) worker.onmessage = (event) => this.receive(event.data);
  }

  get size() { return this.workers.length; }

  /** Sends a picture (and its person mask) under a name: 'work' (on screen) or 'export' (saving). */
  setSource(key, raster, mask = null) {
    for (const worker of this.workers) {
      const pixels = raster.data.buffer.slice(0);
      const maskBuffer = mask ? mask.buffer.slice(0) : null;
      worker.postMessage({ type: 'source', key, width: raster.width, height: raster.height, pixels, mask: maskBuffer }, maskBuffer ? [pixels, maskBuffer] : [pixels]);
    }
  }

  forget(key) {
    for (const worker of this.workers) worker.postMessage({ type: 'forget', key });
  }

  workerFor(id) {
    let h = 0;
    for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return this.workers[h % this.workers.length];
  }

  /**
   * Draws one caricature: resolves { image: ImageData-like, features, mask, ms }, or null when a newer
   * request for the same caricature replaced it.
   */
  render(key, features, item) {
    const job = ++this.job;
    const tag = `${key}:${item.id}`;
    this.latest.set(tag, job);
    this.setBusy(1);
    return new Promise((resolve, reject) => {
      this.pending.set(job, { resolve, reject, tag });
      this.workerFor(item.id).postMessage({ type: 'render', job, key, features, item: structuredClone(item) });
    });
  }

  receive(message) {
    const entry = this.pending.get(message.job);
    if (!entry) return;
    this.pending.delete(message.job);
    this.setBusy(-1);
    if (this.latest.get(entry.tag) !== message.job) { entry.resolve(null); return; }
    if (message.type === 'error') {
      const error = new Error(message.message);
      error.stack = message.stack;
      entry.reject(error);
      return;
    }
    entry.resolve({
      image: { width: message.width, height: message.height, data: new Uint8ClampedArray(message.pixels) },
      features: message.features,
      mask: message.mask ? new Float32Array(message.mask) : null,
      ms: message.ms,
    });
  }

  setBusy(delta) {
    this.busy = Math.max(0, this.busy + delta);
    this.onBusy?.(this.busy);
  }

  destroy() {
    for (const worker of this.workers) worker.terminate();
    this.workers = [];
  }
}
