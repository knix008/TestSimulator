// The MATLAB session bridge: the command window and the editor send code with the
// workspace the last reply returned (sim_core::mlang::session). Desktop: a Tauri
// command on the native engine (files work). Browser: its own Web Worker running
// sim.wasm, so a long command never blocks a pipeline run; stopping replaces the worker.
import { invoke, isTauri } from './native.js';

let worker = null;
let pending = null;

/** Runs a request { code, files, state, seed }; resolves to the reply object. */
export async function evalMatlab(request, baseDir = null) {
  if (pending) throw new Error('a command is already running');
  const text = JSON.stringify(request);
  if (isTauri) {
    pending = { cancel: () => invoke('cancel_matlab').catch(() => {}) };
    try {
      return JSON.parse(await invoke('matlab_eval', { request: text, baseDir }));
    } finally {
      pending = null;
    }
  }
  return new Promise((resolve, reject) => {
    worker ??= new Worker(new URL('./sim-worker.js', import.meta.url), { type: 'module' });
    const current = worker;
    pending = {
      cancel: () => {
        current.terminate();
        worker = null;
        pending = null;
        reject(new Error('cancelled'));
      },
    };
    current.onmessage = (event) => {
      const message = event.data;
      if (message.type === 'matlab') {
        pending = null;
        try {
          resolve(JSON.parse(message.reply));
        } catch (error) {
          reject(error);
        }
      } else if (message.type === 'error') {
        pending = null;
        reject(new Error(message.message));
      }
    };
    current.onerror = (event) => {
      pending = null;
      worker = null;
      reject(new Error(event.message || 'the engine worker failed'));
    };
    current.postMessage({ type: 'matlab', request: text, wasmUrl: new URL('sim.wasm', document.baseURI).href });
  });
}

export function cancelMatlab() {
  pending?.cancel();
}

export function matlabBusy() {
  return Boolean(pending);
}

/** base64 of little-endian f64 → numbers. */
export function f64(b64) {
  if (!b64) return [];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return Array.from(new Float64Array(bytes.buffer, 0, Math.floor(bytes.length / 8)));
}
