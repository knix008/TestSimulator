// Loads the solver's WebAssembly build in Node (the same file the web build uses).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initSync, run_job } from '../../src/sim/pkg/sim_wasm.js';
import { decodeResult } from '../../src/sim/decode.js';

let ready = false;
export function solve(job) {
  if (!ready) {
    const bytes = fs.readFileSync(fileURLToPath(new URL('../../src/sim/pkg/sim_wasm_bg.wasm', import.meta.url)));
    globalThis.__simProgress = () => true;
    initSync({ module: bytes });
    ready = true;
  }
  const out = run_job(JSON.stringify(job));
  return decodeResult(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength));
}
