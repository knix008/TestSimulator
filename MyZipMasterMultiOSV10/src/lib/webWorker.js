// Kept apart so that only the web build ever sees the worker and its .wasm.
export function createEngineWorker() {
  return new Worker(new URL('./engine.worker.js', import.meta.url), { type: 'module' });
}
