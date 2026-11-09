// Downloading, keeping and loading the packages (domain/packages.js).
//
// The main window downloads (one download at a time, all files of a package, each checked
// against its SHA-256; a file that fails or comes back different is fetched from the second
// address). The files are kept in IndexedDB, which every window of the app shares, so the
// code editor window loads them from there. The state of every package — progress, error,
// installed version — is in localStorage, which the popups (Settings › Packages, the packages
// window) watch to draw their progress bars; they ask the main window to start, stop or retry.
import { fileUrls, packageById, packageState, PACKAGES, sha256Hex } from '../domain/packages.js';
import { idbDelete, idbGet, idbSet } from './idb.js';

export const PACKAGES_STATE_KEY = 'myhomemaker.packages.v1';
/** Tests point the downloads at a local server (the checksums still have to match). */
export const PACKAGES_BASE_KEY = 'myhomemaker.packages.base';
/** No byte for this long: the download is given up (and can be tried again). */
export const STALL_MS = 30000;

const metaKey = (id) => `pkg:${id}`;
const fileKey = (id, name) => `pkgfile:${id}:${name}`;

export function readPackageStates(storage = globalThis.localStorage) {
  try { return JSON.parse(storage?.getItem(PACKAGES_STATE_KEY) ?? '{}') ?? {}; } catch { return {}; }
}

function writePackageState(id, patch, storage = globalThis.localStorage) {
  const all = readPackageStates(storage);
  all[id] = { ...(all[id] ?? {}), ...patch, at: Date.now() };
  try { storage?.setItem(PACKAGES_STATE_KEY, JSON.stringify(all)); } catch { /* not shown, still works */ }
  return all[id];
}

/** What a window shows for a package: { phase, received, total, error, installed (version or null), state }. */
export function packageView(id, storage = globalThis.localStorage) {
  const pkg = packageById(id);
  const saved = readPackageStates(storage)[id] ?? {};
  const state = saved.installed === pkg?.version ? 'installed' : saved.installed ? 'outdated' : 'missing';
  return { phase: saved.phase ?? 'idle', received: saved.received ?? 0, total: saved.total ?? 0, error: saved.error ?? null, installed: saved.installed ?? null, state };
}

/** The installed state from IndexedDB (the truth), copied into localStorage for the popups. */
export async function refreshInstalled(storage = globalThis.localStorage) {
  const result = {};
  for (const pkg of PACKAGES) {
    let meta = null;
    try { meta = await idbGet(metaKey(pkg.id)); } catch { meta = null; }
    const state = packageState(pkg, meta);
    result[pkg.id] = state;
    const current = readPackageStates(storage)[pkg.id] ?? {};
    const installed = state === 'installed' ? pkg.version : meta?.version ?? null;
    if (current.installed !== installed) writePackageState(pkg.id, { installed }, storage);
  }
  return result;
}

export const missingPackages = async () => Object.entries(await refreshInstalled()).filter(([, state]) => state !== 'installed').map(([id]) => id);

/** Reads a response's body with progress, giving up when nothing arrives for STALL_MS. */
async function fetchBytes(url, { signal, onBytes, fetchImpl = globalThis.fetch }) {
  const stall = new AbortController();
  const both = signal ? AbortSignal.any?.([signal, stall.signal]) ?? signal : stall.signal;
  let timer = setTimeout(() => stall.abort(new Error('stalled')), STALL_MS);
  const poke = () => { clearTimeout(timer); timer = setTimeout(() => stall.abort(new Error('stalled')), STALL_MS); };
  try {
    const response = await fetchImpl(url, { signal: both, cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.body?.getReader) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      onBytes(bytes.length);
      return bytes;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      poke();
      onBytes(received);
    }
    const bytes = new Uint8Array(received);
    let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
    return bytes;
  } catch (error) {
    if (stall.signal.aborted && !signal?.aborted) throw new Error(`no data for ${STALL_MS / 1000} s`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export class PackageManager {
  constructor({ storage = globalThis.localStorage, fetchImpl = globalThis.fetch?.bind(globalThis), store = { get: idbGet, set: idbSet, delete: idbDelete }, onChange = () => {}, lookup = packageById } = {}) {
    this.lookup = lookup;
    this.storage = storage;
    this.fetchImpl = fetchImpl;
    this.store = store;
    this.onChange = onChange;
    this.running = null;
    this.queue = [];
  }

  get busy() { return Boolean(this.running); }

  /** Downloads the packages (ids) one after another; resolves to { ok: [ids], failed: [ids], cancelled }. */
  async install(ids) {
    const list = [...new Set(ids)].filter((id) => this.lookup(id));
    for (const id of list) if (!this.queue.includes(id) && this.running?.id !== id) this.queue.push(id);
    for (const id of list) if (this.running?.id !== id) writePackageState(id, { phase: 'queued', received: 0, error: null }, this.storage);
    this.onChange();
    if (this.running) return this.running.all;
    const outcome = { ok: [], failed: [], cancelled: false };
    this.running = { id: this.queue[0], controller: null, all: null };
    const all = (async () => {
      await null;
      while (this.queue.length) {
        const id = this.queue.shift();
        const controller = new AbortController();
        this.running = { id, controller, all };
        try {
          await this.installOne(id, controller.signal);
          outcome.ok.push(id);
        } catch (error) {
          if (controller.signal.aborted) {
            outcome.cancelled = true;
            writePackageState(id, { phase: 'cancelled', error: null }, this.storage);
            for (const rest of this.queue.splice(0)) writePackageState(rest, { phase: 'cancelled', error: null }, this.storage);
          } else {
            outcome.failed.push(id);
            writePackageState(id, { phase: 'failed', error: String(error?.message ?? error) }, this.storage);
          }
        }
        this.onChange();
      }
      this.running = null;
      this.onChange();
      return outcome;
    })();
    if (this.running) this.running.all = all;
    return all;
  }

  /** Stops the download that runs (and the ones waiting). */
  cancel() {
    if (this.running?.controller) this.running.controller.abort();
    else for (const id of this.queue.splice(0)) writePackageState(id, { phase: 'cancelled' }, this.storage);
    this.onChange();
  }

  async installOne(id, signal) {
    const pkg = this.lookup(id);
    const total = pkg.files.reduce((sum, file) => sum + file.size, 0);
    const received = {};
    let shown = 0;
    const report = (force = false) => {
      const now = Date.now();
      if (!force && now - shown < 120) return;
      shown = now;
      writePackageState(id, { phase: 'download', received: Object.values(received).reduce((a, b) => a + b, 0), total, error: null }, this.storage);
      this.onChange();
    };
    report(true);
    let base = null;
    try { base = this.storage?.getItem(PACKAGES_BASE_KEY) || null; } catch { base = null; }
    const texts = [];
    for (const file of pkg.files) {
      let lastError = null;
      let text = null;
      for (const url of fileUrls(file, base)) {
        if (signal.aborted) throw new Error('cancelled');
        try {
          received[file.name] = 0;
          const bytes = await fetchBytes(url, { signal, fetchImpl: this.fetchImpl, onBytes: (n) => { received[file.name] = Math.min(n, file.size); report(); } });
          const hash = await sha256Hex(bytes);
          if (hash !== file.sha256) throw new Error(`${file.name}: checksum mismatch (${url})`);
          text = new TextDecoder().decode(bytes);
          break;
        } catch (error) {
          if (signal.aborted) throw error;
          lastError = error;
        }
      }
      if (text == null) throw lastError ?? new Error(`${file.name}: download failed`);
      received[file.name] = file.size;
      texts.push([file.name, text]);
      report(true);
    }
    writePackageState(id, { phase: 'saving' }, this.storage);
    for (const [name, text] of texts) await this.store.set(fileKey(id, name), text);
    await this.store.set(metaKey(id), { version: pkg.version, files: pkg.files.map((file) => file.name), at: Date.now() });
    writePackageState(id, { phase: 'done', received: total, total, error: null, installed: pkg.version }, this.storage);
  }

  /** Removes a package (its files and its record). */
  async remove(id) {
    const pkg = this.lookup(id);
    if (!pkg || this.running?.id === id) return;
    for (const file of pkg.files) await this.store.delete(fileKey(id, file.name)).catch(() => {});
    await this.store.delete(metaKey(id)).catch(() => {});
    writePackageState(id, { phase: 'idle', received: 0, total: 0, error: null, installed: null }, this.storage);
    this.onChange();
  }
}

const loaded = new Map();

/**
 * Runs a package's files in this window (in order, at global scope, as <script> tags would) and returns its globals.
 * Null when it is not installed. The files were checked against their SHA-256 when they were downloaded.
 */
export function loadPackage(id) {
  if (loaded.has(id)) return loaded.get(id);
  const pkg = packageById(id);
  const promise = (async () => {
    const meta = await idbGet(metaKey(id)).catch(() => null);
    if (packageState(pkg, meta) !== 'installed') return null;
    for (const file of pkg.files) {
      const text = await idbGet(fileKey(id, file.name));
      if (typeof text !== 'string') return null;
      // Indirect eval: global scope, like a classic script (the UMD builds put their names on globalThis).
      (0, eval)(`${text}\n//# sourceURL=package/${id}/${file.name}`);
    }
    return Object.fromEntries(pkg.globals.map((name) => [name, globalThis[name]]));
  })().catch((error) => { loaded.delete(id); throw error; });
  loaded.set(id, promise);
  promise.then((value) => { if (!value) loaded.delete(id); });
  return promise;
}
