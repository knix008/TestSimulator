// The Rust core (crates/hexcore) in Node tests: public/hexcore.wasm (npm run build:wasm / setup), one engine per
// `createCore()`, the same JSON API the app uses (src/core/core.js).
import { readFileSync } from 'node:fs';

const module = await WebAssembly.compile(readFileSync(new URL('../../../public/hexcore.wasm', import.meta.url)));
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const b64 = (bytes) => Buffer.from(bytes).toString('base64');
export const unb64 = (text) => new Uint8Array(Buffer.from(text, 'base64'));

export function createCore() {
  const wasm = new WebAssembly.Instance(module, { env: { hx_progress: () => 1 } }).exports;
  const put = (bytes) => { const ptr = wasm.hx_alloc(bytes.length); new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes); return ptr; };
  const take = (ptr) => { const len = wasm.hx_result_len(ptr); const out = new Uint8Array(wasm.memory.buffer, ptr, len).slice(); wasm.hx_free(ptr, len); return out; };
  function call(method, args = {}) {
    const bytes = encoder.encode(JSON.stringify({ method, args }));
    const ptr = put(bytes);
    const out = wasm.hx_call(ptr, bytes.length);
    wasm.hx_free(ptr, bytes.length);
    const reply = JSON.parse(decoder.decode(take(out)));
    if ('error' in reply) throw new Error(reply.error);
    return reply.ok;
  }
  /** A document over these bytes (the raw path the web build uses); returns its info. */
  call.open = (bytes, name = 'test.bin') => {
    const ptr = put(bytes);
    const nameBytes = encoder.encode(name);
    const namePtr = put(nameBytes);
    const id = wasm.hx_open(ptr, bytes.length, namePtr, nameBytes.length);
    wasm.hx_free(namePtr, nameBytes.length);
    return call('info', { id });
  };
  call.bytes = (id, offset, length) => take(wasm.hx_bytes(id, offset, length));
  return call;
}
