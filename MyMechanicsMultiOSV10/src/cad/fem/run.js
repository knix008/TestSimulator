// Runs a simulation study by name — in a Web Worker when the page can start one (the UI stays responsive, with
// progress and cancel), on the calling thread otherwise (node tests, or when workers are unavailable).
//
//   runStudy(kind, input, { onProgress(fraction, info), signal (AbortSignal), worker: true }) → Promise<result>
//   runStudyDirect(kind, input, { onProgress, cancel }) → result
//
// kinds: static, thermal, modal, buckling, nonlinear, drop, flow, combination.
// Results cross the worker boundary by structured clone: functions and caches are dropped (sanitize), typed arrays
// are transferred. A sanitized result still supports probes and line plots (model.js locate() rebuilds its hash).

import { linearStatic } from './static.js';
import { heatStudy } from './thermal.js';
import { modalStudy, bucklingStudy } from './modal.js';
import { nonlinearStudy } from './nonlinear.js';
import { dropStudy } from './explicit.js';
import { combineStudy } from './combine.js';
import { flowStudy } from '../cfd/lbm.js';

export const STUDY_KINDS = ['static', 'thermal', 'modal', 'buckling', 'nonlinear', 'drop', 'flow', 'combination'];

/** Runs a study on this thread. */
export function runStudyDirect(kind, input, { onProgress = null, cancel = null } = {}) {
  const args = { ...input, onProgress, cancel };
  switch (kind) {
    case 'static': return linearStatic(args);
    case 'thermal': return heatStudy(args);
    case 'modal': return modalStudy(args);
    case 'buckling': return bucklingStudy(args);
    case 'nonlinear': return nonlinearStudy(args);
    case 'drop': return dropStudy(args);
    case 'combination': return combineStudy(args);
    case 'flow': return flowStudy(input.mesh ?? input.bodies?.[0]?.mesh, args);
    default: return { ok: false, error: 'unknown-study' };
  }
}

const DROP_KEYS = new Set(['surfaceModel', '_locator', '_graph', '_nodeFacets', '_local', 'onProgress', 'cancel']);

/** A structured-clone-safe copy of a result (functions, caches and cyclic references dropped; typed arrays kept). */
export function sanitize(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return typeof value === 'function' ? undefined : value;
  if (ArrayBuffer.isView(value)) return value;
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) { const out = []; seen.set(value, out); for (const v of value) out.push(sanitize(v, seen)); return out; }
  if (value instanceof Map) { const out = new Map(); seen.set(value, out); for (const [k, v] of value) if (typeof v !== 'function') out.set(k, sanitize(v, seen)); return out; }
  if (value instanceof Set) return new Set(value);
  const out = {};
  seen.set(value, out);
  for (const [k, v] of Object.entries(value)) {
    if (DROP_KEYS.has(k) || typeof v === 'function') continue;
    out[k] = sanitize(v, seen);
  }
  return out;
}

/** Distinct ArrayBuffers of the typed arrays in a value (for postMessage transfer). */
export function transferables(value, out = new Set(), seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return out;
  seen.add(value);
  if (ArrayBuffer.isView(value)) { if (!(typeof SharedArrayBuffer !== 'undefined' && value.buffer instanceof SharedArrayBuffer) && value.byteLength === value.buffer.byteLength) out.add(value.buffer); return out; }
  if (value instanceof Map) { for (const v of value.values()) transferables(v, out, seen); return out; }
  for (const v of Array.isArray(value) ? value : Object.values(value)) transferables(v, out, seen);
  return out;
}

let workerFactory = null;
/** Sets how to start the worker (the app passes () => new Worker(new URL('./sim-worker.js', import.meta.url), { type: 'module' }), which the bundler resolves). */
export function setWorkerFactory(fn) { workerFactory = fn; }

/** Runs a study, in a worker when possible. Rejects never: errors come back as { ok: false, error }. */
export function runStudy(kind, input, { onProgress = null, signal = null, worker = true } = {}) {
  const canWorker = worker && workerFactory && typeof Worker !== 'undefined';
  if (!canWorker) {
    return new Promise((resolve) => {
      setTimeout(() => {
        try { resolve(runStudyDirect(kind, input, { onProgress, cancel: () => Boolean(signal?.aborted) })); }
        catch (error) { resolve({ ok: false, error: 'exception', message: String(error?.message ?? error) }); }
      }, 0);
    });
  }
  return new Promise((resolve) => {
    let w;
    try { w = workerFactory(); } catch { worker = false; resolve(runStudy(kind, input, { onProgress, signal, worker: false })); return; }
    const done = (r) => { try { w.terminate(); } catch { /* gone */ } signal?.removeEventListener?.('abort', abort); resolve(r); };
    const abort = () => done({ ok: false, error: 'cancelled' });
    signal?.addEventListener?.('abort', abort);
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') onProgress?.(m.f, m.info);
      else if (m.type === 'done') done(m.result);
      else if (m.type === 'error') done({ ok: false, error: 'exception', message: m.error });
    };
    w.onerror = (e) => { e.preventDefault?.(); done({ ok: false, error: 'exception', message: String(e.message ?? 'worker error') }); };
    const clean = sanitize(input);
    w.postMessage({ kind, input: clean });
  });
}
