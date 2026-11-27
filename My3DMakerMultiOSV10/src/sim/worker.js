// The web build's solver: the Rust core compiled to WebAssembly, run off the page's thread.
// Messages in: { id, job } · out: { id, progress: [fraction, key] } | { id, result: ArrayBuffer } | { id, error }.
import init, { run_job } from './pkg/sim_wasm.js';

let ready = null;
let current = null;
globalThis.__simProgress = (fraction, key) => {
  if (current) postMessage({ id: current, progress: [fraction, key] });
  return true;
};

self.onmessage = async (event) => {
  const { id, job } = event.data;
  try {
    ready ??= init();
    await ready;
    current = id;
    const bytes = run_job(typeof job === 'string' ? job : JSON.stringify(job));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    postMessage({ id, result: buffer }, [buffer]);
  } catch (error) {
    postMessage({ id, error: String(error?.message ?? error) });
  } finally {
    current = null;
  }
};
