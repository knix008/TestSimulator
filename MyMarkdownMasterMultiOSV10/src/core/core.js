// The Rust core (crates/mdcore) from the page. Desktop: the Tauri command `core_call` on the backend's
// engine (which also owns the vault on disk). Web: the same crate compiled to WebAssembly
// (crates/mdwasm → public/mdcore.wasm, a tiny JSON ABI), running in this page.
import { invoke, isDesktop } from '../platform/native.js';

let wasm = null;
let loading = null;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Loads the WebAssembly core once (web build). */
export function loadWasm(url = new URL('../../mdcore.wasm', import.meta.url).href) {
  if (wasm) return Promise.resolve(wasm);
  loading ??= (async () => {
    const candidates = [url, './mdcore.wasm', '/mdcore.wasm'];
    let lastError = null;
    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate);
        if (!response.ok) throw new Error(`${candidate}: ${response.status}`);
        const bytes = await response.arrayBuffer();
        const { instance } = await WebAssembly.instantiate(bytes, {});
        wasm = instance.exports;
        return wasm;
      } catch (error) { lastError = error; }
    }
    loading = null;
    throw new Error(`The Rust core (mdcore.wasm) could not be loaded: ${lastError?.message ?? lastError}`);
  })();
  return loading;
}

function callWasm(method, args) {
  const bytes = encoder.encode(JSON.stringify({ method, args: args ?? null }));
  const ptr = wasm.md_alloc(bytes.length);
  new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
  const out = wasm.md_call(ptr, bytes.length);
  wasm.md_free(ptr, bytes.length);
  const len = wasm.md_result_len(out);
  const text = decoder.decode(new Uint8Array(wasm.memory.buffer, out, len));
  wasm.md_free(out, len);
  const reply = JSON.parse(text);
  if ('error' in reply) throw new Error(reply.error);
  return reply.ok;
}

/** True when the core runs inside the desktop backend (it then also holds the vault's files). */
export const coreInBackend = () => isDesktop();

/** Calls one method of the core engine (see crates/mdcore/src/engine.rs). */
export async function call(method, args = {}) {
  if (isDesktop()) return invoke('core_call', { method, args });
  if (!wasm) await loadWasm();
  return callWasm(method, args);
}

/** Synchronous call (web only, after loadWasm): for things the editor needs at once. */
export function callSync(method, args = {}) {
  if (!wasm) return undefined;
  return callWasm(method, args);
}
