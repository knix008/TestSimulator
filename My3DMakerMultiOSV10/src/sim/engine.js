// Runs solver jobs: on the desktop natively in the Rust backend (Tauri command run_simulation,
// progress as "sim-progress" events), in the browser in a Web Worker with the same Rust code
// compiled to WebAssembly. Either way the result is the container decoded by decode.js.
import { decodeResult } from './decode.js';
import * as native from '../platform/native.js';

let seq = 0;
let worker = null;
const waiting = new Map();

function webWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (event) => {
    const { id, progress, result, error } = event.data;
    const w = waiting.get(id);
    if (!w) return;
    if (progress) { w.onProgress?.(progress[0], progress[1]); return; }
    waiting.delete(id);
    if (error) w.reject(new Error(error)); else w.resolve(result);
  };
  worker.onerror = (event) => {
    for (const w of waiting.values()) w.reject(new Error(event.message || 'worker.failed'));
    waiting.clear();
    worker = null;
  };
  return worker;
}

/**
 * Runs `job` (an object). onProgress(fraction 0…1, message key). `signal.cancel()` stops it.
 * Resolves with the decoded result; rejects with an Error whose message is a key ("cancelled", "mesh.tooLarge" …).
 */
export function runJob(job, { onProgress = null, signal = null } = {}) {
  const op = `sim-${Date.now().toString(36)}-${(++seq).toString(36)}`;
  const text = JSON.stringify(job);
  if (native.isDesktop()) {
    let unlisten = null;
    const done = (async () => {
      unlisten = await native.listen('sim-progress', (p) => { if (p.op === op) onProgress?.(p.fraction, p.key); });
      if (signal) signal.cancel = () => native.invoke('cancel_simulation', { op }).catch(() => {});
      try {
        const bytes = await native.invoke('run_simulation', { job: text, op });
        return decodeResult(bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes).buffer);
      } catch (error) {
        throw new Error(native.errorText(error));
      } finally {
        unlisten?.();
      }
    })();
    return done;
  }
  return new Promise((resolve, reject) => {
    const w = webWorker();
    const id = op;
    waiting.set(id, { resolve: (buf) => { try { resolve(decodeResult(buf)); } catch (e) { reject(e); } }, reject, onProgress });
    if (signal) {
      // A WebAssembly job cannot be interrupted from outside: the worker is replaced.
      signal.cancel = () => {
        const p = waiting.get(id);
        waiting.delete(id);
        worker?.terminate();
        worker = null;
        p?.reject(new Error('cancelled'));
      };
    }
    w.postMessage({ id, job: text });
  });
}

export async function solverInfo() {
  if (native.isDesktop()) return native.invoke('solver_info').catch(() => ({ version: '?', threads: 1, native: true }));
  return { version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0', threads: navigator.hardwareConcurrency || 1, native: false };
}
