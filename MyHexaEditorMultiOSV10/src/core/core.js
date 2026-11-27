// The Rust core (crates/hexcore) from the page. Desktop: the Tauri command `core_call` on the backend's engine
// (which also owns the files, disks and process memory documents read from); long work reports `io-progress`.
// Web: the same crate compiled to WebAssembly (crates/hexwasm → public/hexcore.wasm) in a Web Worker
// (core-worker.js), so the page stays alive during long work and can show its progress.
//
// Long calls: the app installs a hook (setLongCallHook) that runs them with a progress popup; `call` routes the
// methods in LONG_METHODS through it unless the caller already gave a progress id (`op`).
import { invoke, isDesktop } from '../platform/native.js';

/** Methods that can take long on a big document (they get a progress popup after a short delay). */
export const LONG_METHODS = new Set(['search', 'findAll', 'replaceAll', 'hash', 'stats', 'strings', 'carve', 'template', 'disasm', 'export', 'import', 'compare',
  'operation', 'transform', 'fill', 'yara', 'fsPartitions', 'fsInfo', 'fsList', 'fsFile', 'fsRead', 'detect', 'extract', 'slice', 'replace', 'gotoHistory']);

let worker = null;
let loading = null;
let seq = 0;
const waiting = new Map();
const progressListeners = new Set();
let longCallHook = null;

/** The app's handler for long calls: (method, args, run(op) → Promise) → Promise. */
export function setLongCallHook(fn) { longCallHook = fn; }

/** Web: progress of a long call ({ op, done, total }) for the progress popup. */
export function onCoreProgress(fn) { progressListeners.add(fn); return () => progressListeners.delete(fn); }

function request(message, transfer = []) {
  seq += 1;
  const id = seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker.postMessage({ ...message, seq: id }, transfer);
  });
}

/** Starts the WebAssembly core worker once (web build). */
export function loadWasm() {
  if (isDesktop()) return Promise.resolve(null);
  loading ??= (async () => {
    worker = new Worker(new URL('./core-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      const m = event.data;
      if (m.type === 'progress') { for (const fn of progressListeners) fn(m); return; }
      const w = waiting.get(m.seq);
      if (!w) return;
      waiting.delete(m.seq);
      if ('error' in m) w.reject(new Error(m.error)); else w.resolve(m.ok);
    };
    worker.onerror = (event) => { for (const w of waiting.values()) w.reject(new Error(event.message || 'core worker failed')); waiting.clear(); };
    const candidates = [new URL('../../hexcore.wasm', import.meta.url).href, new URL('./hexcore.wasm', location.href).href, new URL('/hexcore.wasm', location.href).href];
    let lastError = null;
    for (const url of candidates) {
      try {
        const head = await fetch(url, { method: 'HEAD' });
        if (!head.ok) throw new Error(`${url}: ${head.status}`);
        await request({ type: 'init', url });
        return worker;
      } catch (error) { lastError = error; }
    }
    loading = null;
    throw new Error(`The Rust core (hexcore.wasm) could not be loaded: ${lastError?.message ?? lastError}`);
  })();
  return loading;
}

async function rawCall(method, args, op) {
  if (isDesktop()) return invoke('core_call', { method, args, op });
  await loadWasm();
  return request({ type: 'call', method, args, op });
}

/** True when the core runs inside the desktop backend. */
export const coreInBackend = () => isDesktop();

/** Calls one method of the core engine (crates/hexcore/src/engine.rs). `op` names the progress of a long call. */
export async function call(method, args = {}, op = '') {
  if (!op && longCallHook && LONG_METHODS.has(method)) return longCallHook(method, args, (id) => rawCall(method, args, id));
  return rawCall(method, args, op);
}

/** Web: a new document over these bytes (moved into the core worker). Returns its info. */
export async function openBytes(bytes, name) {
  await loadWasm();
  const buffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;
  return request({ type: 'open', bytes: buffer, name }, [buffer]);
}

/** Web: the raw bytes of a document range (saving, downloads). */
export async function rawBytes(id, offset, length) {
  await loadWasm();
  return new Uint8Array(await request({ type: 'bytes', id, offset, length }));
}

const b64chunk = 0x8000;
/** Uint8Array → base64. */
export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += b64chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + b64chunk));
  return btoa(s);
}
/** base64 → Uint8Array. */
export function fromBase64(text) {
  const s = atob(text ?? '');
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
}
