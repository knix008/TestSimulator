// The Rust core (crates/mdcore) in Node tests: public/mdcore.wasm (npm run build:wasm), one engine per
// `createCore()`, the same JSON API the app uses (core/core.js).
import { readFileSync } from 'node:fs';
import { VaultIndex } from '../../../src/vault/index.js';

const module = await WebAssembly.compile(readFileSync(new URL('../../../public/mdcore.wasm', import.meta.url)));
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function createCore() {
  const wasm = new WebAssembly.Instance(module, {}).exports;
  return function call(method, args = {}) {
    const bytes = encoder.encode(JSON.stringify({ method, args }));
    const ptr = wasm.md_alloc(bytes.length);
    new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
    const out = wasm.md_call(ptr, bytes.length);
    wasm.md_free(ptr, bytes.length);
    const len = wasm.md_result_len(out);
    const reply = JSON.parse(decoder.decode(new Uint8Array(wasm.memory.buffer, out, len)));
    wasm.md_free(out, len);
    if ('error' in reply) throw new Error(reply.error);
    return reply.ok;
  };
}

/** A VaultIndex fed the way the app feeds it: texts go to the core, the snapshot comes back. */
export class TestIndex extends VaultIndex {
  constructor() { super(); this.core = createCore(); }
  setFiles(files) { this.core('setFiles', { files: files.map((f) => ({ kind: 'file', size: 0, mtime: 0, ctime: 0, ...f })) }); this.load(this.core('snapshot')); }
  setText(path, text) { this.core('setText', { path, text }); this.load(this.core('snapshot')); }
}
