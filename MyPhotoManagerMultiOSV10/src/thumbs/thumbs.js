// Thumbnails: memory → IndexedDB cache → worker (or the page for SVG and video).
// Visible items jump the queue; results also feed the catalog (metadata
// summary, pixel size, similarity hash).
import { kindOf } from '../formats/types.js';
import { idbClear, idbCount, idbGet, idbSet } from '../platform/idb.js';
import { fs } from '../platform/fs.js';
import { assetUrl, invoke, isDesktop } from '../platform/native.js';

// ───────── thumbnails stored per directory (desktop): <data>/thumbnails/<folder>/
// index.json + images. A folder's index is read once when it opens; matching
// thumbnails show at once from disk, the rest are made in the background.

const dirOf = (path) => path.slice(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')));
const usesDirStore = (path) => isDesktop() && !path.startsWith('@');
function hashName(text) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export const THUMB_SIZE = 384;
const MEMORY_LIMIT = 4000;

const keyOf = (item) => `${item.path}|${item.size ?? 0}|${Math.round(item.modified ?? 0)}`;

async function videoThumbnail(url, size) {
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.src = url;
  await new Promise((resolve, reject) => {
    video.onloadeddata = resolve;
    video.onerror = () => reject(new Error('video cannot be played'));
    setTimeout(() => reject(new Error('video timeout')), 15000);
  });
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  video.currentTime = Math.min(1, duration / 3);
  await new Promise((resolve) => { video.onseeked = resolve; setTimeout(resolve, 3000); });
  const { videoWidth: width, videoHeight: height } = video; // read before the element is reset below
  const k = Math.min(1, size / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(video.videoWidth * k));
  canvas.height = Math.max(1, Math.round(video.videoHeight * k));
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.8));
  video.removeAttribute('src');
  video.load();
  return { blob, width, height, hash: null, meta: { duration: Math.round(duration * 10) / 10 } };
}

class ThumbService {
  constructor() {
    this.memory = new Map();
    this.pending = new Map();
    this.queue = [];
    this.running = 0;
    this.max = Math.max(2, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 4) - 1));
    this.workers = [];
    this.idle = [];
    this.jobs = new Map();
    this.nextJob = 1;
    this.onInfo = null; // (path, { meta, width, height, hash }) → void
    this.onProgress = null; // (remaining) → void
    this.workerBroken = false;
    this.dirs = new Map(); // dir → { entries: Map(name → record), loading, timer, dirty }
    this.done = 0; // finished since the queue was last empty (for done / total in the status bar)
  }

  /** Index of a directory's stored thumbnails (loaded once). */
  dirStore(dir) {
    let store = this.dirs.get(dir);
    if (!store) {
      store = { entries: new Map(), timer: null, dirty: false };
      store.loading = invoke('thumb_index', { dir }).then((text) => {
        const data = text ? JSON.parse(text) : null;
        if (data?.v === 1) for (const record of data.entries ?? []) store.entries.set(record.name, record);
      }).catch(() => {});
      this.dirs.set(dir, store);
    }
    return store;
  }

  /**
   * A folder opens: its stored thumbnails go to memory at once (and their
   * metadata to the catalog); everything else is made in the background.
   */
  async useFolder(dir, items) {
    if (!usesDirStore(dir)) return 0;
    const store = this.dirStore(dir);
    await store.loading;
    let ready = 0;
    for (const item of items) {
      if (item.isDir) continue;
      const record = store.entries.get(item.name);
      if (!record || record.size !== item.size || Math.abs(record.modified - item.modified) > 2000) continue;
      const key = keyOf(item);
      if (!this.memory.has(key)) {
        this.remember(key, { url: `${assetUrl(record.file)}?v=${Math.round(record.modified)}`, width: record.width, height: record.height, hash: record.hash, meta: record.meta, stored: true });
        this.onInfo?.(item.path, record, true);
      }
      ready += 1;
    }
    return ready;
  }

  /** Writes a new thumbnail into its directory's store. */
  async storeInDir(item, result) {
    const dir = dirOf(item.path);
    const store = this.dirStore(dir);
    await store.loading;
    const ext = result.blob.type === 'image/jpeg' ? 'jpg' : result.blob.type === 'image/png' ? 'png' : 'webp';
    const name = `${hashName(`${item.name}|${item.size}|${Math.round(item.modified)}`)}.${ext}`;
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    const file = await invoke('thumb_put', bytes, { headers: { 'x-dir': encodeURIComponent(dir), 'x-name': encodeURIComponent(name) } });
    store.entries.set(item.name, { name: item.name, size: item.size, modified: item.modified, width: result.width, height: result.height, hash: result.hash ?? null, meta: result.meta ?? {}, file });
    store.dirty = true;
    clearTimeout(store.timer);
    store.timer = setTimeout(() => this.saveDir(dir), 1500);
  }

  async saveDir(dir) {
    const store = this.dirs.get(dir);
    if (!store?.dirty) return;
    store.dirty = false;
    const json = JSON.stringify({ v: 1, dir, entries: [...store.entries.values()] });
    await invoke('thumb_index_save', { dir, json }).catch(() => { store.dirty = true; });
  }

  /** Writes every pending index now (before quitting, and in tests). */
  async flush() {
    for (const [dir, store] of this.dirs) { clearTimeout(store.timer); if (store.dirty) await this.saveDir(dir); }
  }

  peek(item) {
    const entry = this.memory.get(keyOf(item));
    if (entry) { this.memory.delete(keyOf(item)); this.memory.set(keyOf(item), entry); }
    return entry ?? null;
  }

  /** Thumbnail { url, width, height, hash, error } of an item ({ path, name, size, modified }). */
  get(item, priority = 0) {
    const key = keyOf(item);
    const cached = this.memory.get(key);
    if (cached) return Promise.resolve(cached);
    const waiting = this.pending.get(key);
    if (waiting) { waiting.priority = Math.max(waiting.priority, priority); return waiting.promise; }
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    const job = { key, item, priority, promise, resolve, order: this.nextJob++ };
    this.pending.set(key, job);
    this.queue.push(job);
    this.pump();
    return promise;
  }

  /** Items on screen go first (call with the visible items after every scroll). */
  prioritize(items) {
    const visible = new Set(items.map(keyOf));
    for (const job of this.queue) job.priority = visible.has(job.key) ? 10 : Math.min(job.priority, 1);
  }

  /** Drops queued jobs that are not wanted any more (left folder). */
  cancelExcept(items) {
    const keep = new Set(items.map(keyOf));
    this.queue = this.queue.filter((job) => {
      if (keep.has(job.key)) return true;
      this.pending.delete(job.key);
      job.resolve({ url: null, cancelled: true });
      return false;
    });
    this.onProgress?.(this.queue.length + this.running);
  }

  invalidate(path) {
    for (const [key, entry] of [...this.memory]) {
      if (key.startsWith(`${path}|`)) { if (entry.url) URL.revokeObjectURL(entry.url); this.memory.delete(key); }
    }
  }

  async clearCache() {
    for (const entry of this.memory.values()) if (entry.url) URL.revokeObjectURL(entry.url);
    this.memory.clear();
    this.dirs.clear();
    await idbClear('thumbs').catch(() => {});
    if (isDesktop()) await invoke('thumb_clear').catch(() => {});
  }

  cacheCount() {
    return isDesktop() ? invoke('thumb_stats').catch(() => 0) : idbCount('thumbs').catch(() => 0);
  }

  remember(key, entry) {
    this.memory.set(key, entry);
    while (this.memory.size > MEMORY_LIMIT) {
      const [oldKey, oldEntry] = this.memory.entries().next().value;
      if (oldEntry.url) URL.revokeObjectURL(oldEntry.url);
      this.memory.delete(oldKey);
    }
  }

  pump() {
    while (this.running < this.max && this.queue.length) {
      let best = 0;
      for (let i = 1; i < this.queue.length; i++) {
        const a = this.queue[i];
        const b = this.queue[best];
        if (a.priority > b.priority || (a.priority === b.priority && a.order < b.order)) best = i;
      }
      const [job] = this.queue.splice(best, 1);
      this.running += 1;
      this.run(job).finally(() => {
        this.running -= 1;
        this.pending.delete(job.key);
        this.done += 1;
        this.onProgress?.(this.queue.length + this.running, this.done + this.queue.length + this.running);
        this.pump();
        if (!this.queue.length && !this.running) { this.done = 0; this.flush().catch(() => {}); }
      });
    }
    this.onProgress?.(this.queue.length + this.running);
  }

  async run(job) {
    const { item, key } = job;
    try {
      if (usesDirStore(item.path)) {
        await this.useFolder(dirOf(item.path), [item]);
        const fromDir = this.memory.get(key);
        if (fromDir) { job.resolve(fromDir); return; }
      }
      const stored = usesDirStore(item.path) ? null : await idbGet(key, 'thumbs').catch(() => null);
      if (stored?.blob) {
        const entry = { url: URL.createObjectURL(stored.blob), width: stored.width, height: stored.height, hash: stored.hash, meta: stored.meta };
        this.remember(key, entry);
        this.onInfo?.(item.path, stored, true);
        job.resolve(entry);
        return;
      }
      const result = await this.make(item);
      if (usesDirStore(item.path)) await this.storeInDir(item, result).catch(() => {});
      else await idbSet(key, { blob: result.blob, width: result.width, height: result.height, hash: result.hash, meta: result.meta }, 'thumbs').catch(() => {});
      const entry = { url: URL.createObjectURL(result.blob), width: result.width, height: result.height, hash: result.hash, meta: result.meta };
      this.remember(key, entry);
      this.onInfo?.(item.path, result, false);
      job.resolve(entry);
    } catch (error) {
      const entry = { url: null, error: error?.message ?? String(error) };
      this.remember(key, entry);
      job.resolve(entry);
    }
  }

  async make(item) {
    const kind = kindOf(item.name);
    if (kind === 'video') return videoThumbnail(await fs.url(item.path), THUMB_SIZE);
    const bytes = await fs.read(item.path);
    if (kind === 'svg' || kind === 'pdf' || kind === 'dicom' || this.workerBroken || typeof Worker === 'undefined') return this.inPage(bytes, item.name);
    try {
      return await this.inWorker(bytes, item.name);
    } catch (error) {
      if (error?.workerFailure) { this.workerBroken = true; return this.inPage(await fs.read(item.path), item.name); }
      // Some engines decode a format only in the page (no OffscreenCanvas codecs): try once there.
      return this.inPage(await fs.read(item.path), item.name);
    }
  }

  async inPage(bytes, name) {
    const { makeThumbnail } = await import('./worker.js');
    return makeThumbnail(bytes, name, THUMB_SIZE);
  }

  worker() {
    if (this.idle.length) return this.idle.pop();
    if (this.workers.length >= this.max) return null;
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const job = this.jobs.get(data.id);
      if (!job) return;
      this.jobs.delete(data.id);
      this.idle.push(worker);
      if (data.ok) job.resolve(data);
      else job.reject(new Error(data.error));
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      for (const [id, job] of this.jobs) {
        if (job.worker === worker) { this.jobs.delete(id); job.reject(Object.assign(new Error('worker failed'), { workerFailure: true })); }
      }
      this.workers = this.workers.filter((w) => w !== worker);
      worker.terminate();
    };
    this.workers.push(worker);
    return worker;
  }

  inWorker(bytes, name) {
    return new Promise((resolve, reject) => {
      const worker = this.worker();
      if (!worker) { reject(Object.assign(new Error('no worker'), { workerFailure: false })); return; }
      const id = this.nextJob++;
      this.jobs.set(id, { resolve, reject, worker });
      const buffer = bytes.buffer.byteLength === bytes.byteLength ? bytes.buffer : bytes.slice().buffer;
      worker.postMessage({ id, bytes: buffer, name, size: THUMB_SIZE, meta: true }, [buffer]);
    });
  }
}

export const thumbs = new ThumbService();
