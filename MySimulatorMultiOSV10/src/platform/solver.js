// Runs a pipeline on the Rust engine: as a Tauri command on the desktop
// (native, with files and external programs), or in a Web Worker running
// sim.wasm in the browser. Both return the same result bytes
// (ARCHITECTURE.md), decoded here.
import { decodeResult } from '../core/result.js';
import { invoke, isTauri, listen } from './native.js';

let worker = null;
let running = null;

export const engineKind = isTauri ? 'native' : 'wasm';

/**
 * Runs the pipeline. `onProgress({ phase, fraction, message })`. Resolves to { header, nodes }.
 * `baseDir` (desktop): the folder relative file paths start from. Rejects with Error('cancelled') when stopped.
 */
export async function runStudy(model, onProgress = () => {}, baseDir = null) {
  if (running) throw new Error('a run is already going');
  const json = JSON.stringify(model);
  if (isTauri) {
    const unlisten = await listen('study-progress', onProgress);
    running = { cancel: () => invoke('cancel_study').catch(() => {}) };
    try {
      const bytes = await invoke('run_study', { model: json, baseDir });
      return check(decodeResult(bytes));
    } finally {
      unlisten();
      running = null;
    }
  }
  return new Promise((resolve, reject) => {
    worker ??= new Worker(new URL('./sim-worker.js', import.meta.url), { type: 'module' });
    const current = worker;
    running = {
      cancel: () => {
        // A WASM call cannot be interrupted from outside: the worker is replaced.
        current.terminate();
        worker = null;
        running = null;
        reject(new Error('cancelled'));
      },
    };
    current.onmessage = (event) => {
      const message = event.data;
      if (message.type === 'progress') onProgress(message.progress);
      else if (message.type === 'result') {
        running = null;
        try {
          resolve(check(decodeResult(message.bytes)));
        } catch (error) {
          reject(error);
        }
      } else if (message.type === 'error') {
        running = null;
        reject(new Error(message.message));
      }
    };
    current.onerror = (event) => {
      running = null;
      worker = null;
      reject(new Error(event.message || 'the engine worker failed'));
    };
    // public/sim.wasm sits next to index.html in development and in the build.
    current.postMessage({ type: 'run', model: json, wasmUrl: new URL('sim.wasm', document.baseURI).href });
  });
}

function check(result) {
  if (!result.header.ok) {
    const error = new Error(result.header.error || 'the run failed');
    error.result = result;
    throw error;
  }
  return result;
}

export function cancelStudy() {
  running?.cancel();
}

export function isRunning() {
  return Boolean(running);
}
