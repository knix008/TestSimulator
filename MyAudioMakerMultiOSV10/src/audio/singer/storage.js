// Where voice banks live. Desktop: `<app data>/voicebanks/<id>/` through the Rust commands of
// src-tauri/src/voicebank.rs (downloads run there, on their own thread). Web: the origin private
// file system (OPFS), or IndexedDB when OPFS cannot write; downloads and imports run in the page
// that calls them (the main window — popups ask it, see index.js). Archives are unpacked as a
// stream (fflate), also a zip inside the zip, so a 550 MB bank never sits in memory at once.
import { Unzip, UnzipInflate } from 'fflate';
import { Sha256 } from './sha256.js';

const framed = Boolean(new URLSearchParams(globalThis.location?.search ?? '').get('popup'));
/** Desktop window (not a popup shown as a frame inside the page). */
export const isDesktop = () => Boolean(globalThis.window?.__TAURI_INTERNALS__) && !framed;
export const isFramed = () => framed;

let tauri = null;
async function core() {
  tauri ??= await import('@tauri-apps/api/core');
  return tauri;
}
const invoke = async (cmd, args) => (await core()).invoke(cmd, args);

export class VoiceError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

// ───────────────────────── desktop

const desktop = {
  async list() {
    const list = await invoke('voicebank_list');
    return list.map((b) => ({ id: b.id, dir: b.dir, prefix: '', files: b.files, meta: b.meta ?? null }));
  },
  async read(entry, path, kind) {
    const buf = await invoke('voicebank_read', { id: entry.id, path });
    const bytes = new Uint8Array(buf);
    return kind === 'text' ? new TextDecoder().decode(bytes) : bytes;
  },
  writeMeta: (entry, meta) => invoke('voicebank_write_meta', { id: entry.id, meta }),
  remove: (id) => invoke('voicebank_remove', { id }),
  async source(entry) {
    const { convertFileSrc } = await core();
    const sep = entry.dir.includes('\\') ? '\\' : '/';
    return { kind: 'asset', base: convertFileSrc(''), dir: entry.dir, sep };
  },
  download: (item, { fresh = false } = {}) => invoke('voicebank_download', { job: { id: item.id, kind: item.kind, url: item.url, size: item.size ?? null, sha256: item.sha256 || null, fresh } }),
  importPath: (id, kind, path) => invoke('voicebank_import', { id, kind, path }),
  cancel: (id) => invoke('voicebank_cancel', { id }),
  jobs: () => invoke('voicebank_jobs'),
  async listen(handler) {
    const { listen } = await import('@tauri-apps/api/event');
    return listen('voicebank-progress', (e) => handler(e.payload));
  },
};

// ───────────────────────── web: OPFS or IndexedDB

const DB = 'myaudiomaker-voice';
function idb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new VoiceError('storage', 'IndexedDB is not available')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('banks'); req.result.createObjectStore('files'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbDo(store, mode, fn) {
  const db = await idb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new VoiceError('storage', 'IndexedDB aborted (disk full?)'));
    });
  } finally { db.close(); }
}
const idbGetAll = async (store) => {
  const db = await idb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const out = [];
      const req = tx.objectStore(store).openCursor();
      req.onsuccess = () => { const c = req.result; if (c) { out.push(c.value); c.continue(); } else resolve(out); };
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
};

let opfsOk = null;
/** Whether OPFS can be written from this page (createWritable). */
async function canOpfs() {
  if (opfsOk != null) return opfsOk;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('voicebanks', { create: true });
    const probe = await dir.getFileHandle('.probe', { create: true });
    if (typeof probe.createWritable !== 'function') throw new Error('no createWritable');
    const w = await probe.createWritable();
    await w.write(new Uint8Array([1]));
    await w.close();
    await dir.removeEntry('.probe');
    opfsOk = true;
  } catch { opfsOk = false; }
  return opfsOk;
}
const opfsBanks = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('voicebanks', { create: true });
async function opfsDir(parts, create = false) {
  let dir = await opfsBanks();
  for (const p of parts) if (p) dir = await dir.getDirectoryHandle(p, { create });
  return dir;
}
async function opfsFile(dirName, rel, create = false) {
  const parts = rel.split('/');
  const name = parts.pop();
  const dir = await opfsDir([dirName, ...parts], create);
  return dir.getFileHandle(name, { create });
}

/** The registry of installed banks (web): IndexedDB store "banks", { id, dir, prefix, files, meta, store }. */
const registry = {
  list: () => idbGetAll('banks'),
  put: (entry) => idbDo('banks', 'readwrite', (s) => s.put(entry, entry.id)),
  del: (id) => idbDo('banks', 'readwrite', (s) => s.delete(id)),
};

/** A file writer for unpacking: OPFS streams, or Blobs into IndexedDB. */
function makeWriter(useOpfs, dirName) {
  if (useOpfs) {
    return {
      async open(rel) {
        const handle = await opfsFile(dirName, rel, true);
        const w = await handle.createWritable();
        return { write: (chunk) => w.write(chunk), close: () => w.close(), abort: () => w.abort?.() };
      },
      remove: async () => { try { await (await opfsBanks()).removeEntry(dirName, { recursive: true }); } catch { /* gone */ } },
    };
  }
  const written = [];
  return {
    async open(rel) {
      const chunks = [];
      return {
        write: (chunk) => { chunks.push(chunk.slice ? chunk.slice() : chunk); },
        close: async () => { const key = `${dirName}/${rel}`; written.push(key); await idbDo('files', 'readwrite', (s) => s.put(new Blob(chunks), key)); chunks.length = 0; },
        abort: () => { chunks.length = 0; },
      };
    },
    remove: async () => { for (const key of written) await idbDo('files', 'readwrite', (s) => s.delete(key)).catch(() => {}); },
  };
}

/**
 * Unpacks a zip (a ReadableStream of bytes) through `writer`; a .zip / .oudep inside it is unpacked
 * into ".inner-N/". Returns [{ path, size }]. `onBytes(n)` counts the outer bytes read.
 */
export async function unzipStream(stream, writer, { onBytes = () => {}, onFile = () => {}, signal = null } = {}) {
  const files = [];
  const pending = [];
  let failure = null;
  let inner = 0;
  const handleEntry = (prefix) => (file) => {
    const name = `${prefix}${file.name}`;
    if (/(^|\/)__MACOSX\//.test(name) || name.endsWith('/')) { file.ondata = () => {}; file.start(); return; }
    if (/\.(?:zip|oudep)$/i.test(file.name) && !prefix) {
      const nested = new Unzip(handleEntry(`.inner-${inner++}/`));
      nested.register(UnzipInflate);
      file.ondata = (err, chunk, final) => { if (err) { failure = err; return; } try { nested.push(chunk, final); } catch (e) { failure = e; } };
      file.start();
      return;
    }
    let size = 0;
    let out = null;
    let chain = writer.open(name).then((w) => { out = w; });
    pending.push(chain);
    onFile(name);
    file.ondata = (err, chunk, final) => {
      if (err) { failure = err; return; }
      size += chunk.length;
      const copy = chunk.slice();
      chain = chain.then(() => out.write(copy));
      if (final) { chain = chain.then(() => out.close()).then(() => files.push({ path: name, size })); }
      pending.push(chain);
    };
    file.start();
  };
  const unzip = new Unzip(handleEntry(''));
  unzip.register(UnzipInflate);
  const reader = stream.getReader();
  for (;;) {
    if (signal?.aborted) throw new VoiceError('cancelled', 'Cancelled');
    const { value, done } = await reader.read();
    if (done) { unzip.push(new Uint8Array(0), true); break; }
    unzip.push(value, false);
    onBytes(value.length);
    if (failure) throw new VoiceError('badZip', String(failure.message ?? failure));
    // Back-pressure: let the writes catch up before reading more.
    if (pending.length > 32) { await Promise.all(pending.splice(0)); }
  }
  await Promise.all(pending.splice(0));
  if (failure) throw new VoiceError('badZip', String(failure.message ?? failure));
  await Promise.all(pending.splice(0));
  return files;
}

/** The bank root inside unpacked files: the shallowest folder with `marker`. */
export function findRoot(files, marker) {
  let best = null;
  for (const f of files) {
    const parts = f.path.split('/');
    if (parts[parts.length - 1].toLowerCase() !== marker) continue;
    const prefix = parts.slice(0, -1).join('/');
    if (best == null || prefix.split('/').length < best.split('/').length) best = prefix;
  }
  return best;
}

const web = {
  async list() {
    return (await registry.list()).map((e) => ({ ...e }));
  },
  async read(entry, path, kind) {
    const rel = entry.prefix ? `${entry.prefix}/${path}` : path;
    let blob;
    if (entry.store === 'idb') blob = await idbDo('files', 'readonly', (s) => s.get(`${entry.dir}/${rel}`));
    else blob = await (await opfsFile(entry.dir, rel)).getFile();
    if (!blob) throw new VoiceError('missing', `${path} is missing`);
    return kind === 'text' ? blob.text() : new Uint8Array(await blob.arrayBuffer());
  },
  async writeMeta(entry, meta) { const list = await registry.list(); const e = list.find((x) => x.id === entry.id); if (e) await registry.put({ ...e, meta }); },
  async remove(id) {
    const e = (await registry.list()).find((x) => x.id === id);
    if (!e) return;
    await registry.del(id);
    if (e.store === 'idb') { for (const f of e.allFiles ?? e.files) await idbDo('files', 'readwrite', (s) => s.delete(`${e.dir}/${e.prefix ? `${e.prefix}/` : ''}${f.path}`)).catch(() => {}); }
    else { try { await (await opfsBanks()).removeEntry(e.dir, { recursive: true }); } catch { /* gone */ } }
  },
  source(entry) { return entry.store === 'idb' ? { kind: 'idb', dir: entry.dir, prefix: entry.prefix } : { kind: 'opfs', dir: entry.dir, prefix: entry.prefix }; },
};

/**
 * Installs an archive in the web build. `stream`: ReadableStream of the zip; `size` its length.
 * Returns the registry entry. Nothing is registered unless the whole archive unpacked and holds the
 * marker file; a failed install removes what it wrote.
 */
export async function webInstall(stream, { id, kind, size = 0, onProgress = () => {}, signal = null }) {
  const useOpfs = await canOpfs();
  const dirName = `${id}-${Date.now().toString(36)}`;
  const writer = makeWriter(useOpfs, dirName);
  let done = 0;
  let file = '';
  try {
    const files = await unzipStream(stream, writer, { signal, onBytes: (n) => { done += n; onProgress({ phase: 'unzip', done, total: size || done, file }); }, onFile: (f) => { file = f; } });
    const marker = kind === 'vocoder' ? 'vocoder.yaml' : 'dsconfig.yaml';
    const prefix = findRoot(files, marker);
    if (prefix == null) {
      const other = findRoot(files, kind === 'vocoder' ? 'dsconfig.yaml' : 'vocoder.yaml');
      throw new VoiceError(other != null ? (kind === 'vocoder' ? 'isBank' : 'isVocoder') : 'notBank', `The archive has no ${marker}.`);
    }
    const inside = files.filter((f) => !prefix || f.path.startsWith(`${prefix}/`)).map((f) => ({ path: prefix ? f.path.slice(prefix.length + 1) : f.path, size: f.size }));
    const old = (await registry.list()).find((e) => e.id === id);
    const entry = { id, dir: dirName, prefix, files: inside, allFiles: files.map((f) => ({ path: f.path, size: f.size })), meta: old?.meta ?? null, store: useOpfs ? 'opfs' : 'idb' };
    if (old) await web.remove(id);
    await registry.put({ ...entry, allFiles: undefined });
    return entry;
  } catch (error) {
    await writer.remove();
    throw error.name === 'AbortError' ? new VoiceError('cancelled', 'Cancelled') : error;
  }
}

/** Reads a stream through SHA-256, reporting progress. */
export async function hashStream(stream, onBytes = () => {}) {
  const h = new Sha256();
  const reader = stream.getReader();
  for (;;) { const { value, done } = await reader.read(); if (done) break; h.update(value); onBytes(value.length); }
  return h.hex();
}

/**
 * Web download of a catalog item with resume (OPFS part file), size and SHA-256 checks, then
 * unpacking. GitHub release files carry no CORS headers, so a plain page cannot fetch them: the
 * Vite dev / preview server forwards them (/__voicebank_proxy); a static web host cannot, and the
 * error (code 'cors') tells the user to download the zip and import it.
 */
export async function webDownload(item, { fresh = false, onProgress = () => {}, signal = null } = {}) {
  const report = (p) => onProgress({ id: item.id, kind: item.kind, speed: 0, file: '', ...p });
  report({ phase: 'queued', done: 0, total: item.size });
  const useOpfs = await canOpfs();
  const partName = `${item.id}.part`;
  let part = null;
  let have = 0;
  if (useOpfs) {
    const dir = await opfsDir(['.downloads'], true);
    if (fresh) { try { await dir.removeEntry(partName); } catch { /* none */ } }
    part = await dir.getFileHandle(partName, { create: true });
    have = (await part.getFile()).size;
    if (item.size && have > item.size) { const w = await part.createWritable(); await w.truncate(0); await w.close(); have = 0; }
  }
  const memory = [];
  if (!item.size || have < item.size) {
    const headers = have ? { Range: `bytes=${have}-` } : {};
    let response = null;
    for (const url of [item.url, `./__voicebank_proxy?url=${encodeURIComponent(item.url)}`]) {
      try { response = await fetch(url, { headers, signal }); if (response.ok || response.status === 206) break; response = null; } catch (error) { if (signal?.aborted) throw new VoiceError('cancelled', 'Cancelled'); response = null; }
    }
    if (!response) throw new VoiceError('cors', 'The browser may not download this file directly. Download the zip from the release page and import it.');
    const resumed = response.status === 206;
    if (!resumed) have = 0;
    const total = item.size || Number(response.headers.get('content-length') || 0) + have;
    const writer = useOpfs ? await part.createWritable({ keepExistingData: resumed }) : null;
    if (writer && resumed) await writer.seek(have);
    if (writer && !resumed) await writer.truncate(0);
    const reader = response.body.getReader();
    let done = have;
    let window = [performance.now(), done];
    let speed = 0;
    try {
      for (;;) {
        if (signal?.aborted) throw new VoiceError('cancelled', 'Cancelled');
        const { value, done: end } = await reader.read();
        if (end) break;
        if (writer) await writer.write(value); else memory.push(value);
        done += value.length;
        const dt = (performance.now() - window[0]) / 1000;
        if (dt >= 0.5) { const rate = (done - window[1]) / dt; speed = speed ? speed * 0.6 + rate * 0.4 : rate; window = [performance.now(), done]; }
        report({ phase: 'download', done, total: Math.max(total, done), speed, file: item.url.split('/').pop() });
      }
    } catch (error) {
      try { await writer?.close(); } catch { /* keep the part */ }
      throw error.code ? error : new VoiceError(signal?.aborted ? 'cancelled' : 'network', error.message);
    }
    await writer?.close();
    have = done;
  }
  const blob = useOpfs ? await part.getFile() : new Blob(memory);
  if (item.size && blob.size !== item.size) {
    if (useOpfs) await (await opfsDir(['.downloads'])).removeEntry(partName).catch(() => {});
    throw new VoiceError('size', `The downloaded size is wrong (${blob.size} of ${item.size} bytes).`);
  }
  if (item.sha256) {
    let done = 0;
    const hex = await hashStream(blob.stream(), (n) => { done += n; report({ phase: 'verify', done, total: blob.size, file: 'SHA-256' }); });
    if (hex !== item.sha256.toLowerCase()) {
      if (useOpfs) await (await opfsDir(['.downloads'])).removeEntry(partName).catch(() => {});
      throw new VoiceError('checksum', 'The file check (SHA-256) failed. Download it again.');
    }
  }
  const entry = await webInstall(blob.stream(), { id: item.id, kind: item.kind, size: blob.size, signal, onProgress: (p) => report({ ...p }) });
  if (useOpfs) await (await opfsDir(['.downloads'])).removeEntry(partName).catch(() => {});
  report({ phase: 'ready', done: blob.size, total: blob.size });
  return entry;
}

/** The storage of this platform. */
export const store = () => (isDesktop() ? desktop : web);
export { desktop as desktopStore, web as webStore };
