// Smoke test of the wasm ABI: node engine/wasm-smoke.mjs
// Loads public/sim.wasm with stub imports, validates and runs a small pipeline
// (a sine → FFT), parses the binary result and checks the dominant frequency.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bytes = readFileSync(join(root, 'public', 'sim.wasm'));

let memory = null;
const dec = new TextDecoder();
const str = (ptr, len) => dec.decode(new Uint8Array(memory.buffer, ptr, len));
let progressCalls = 0;
let lastPhase = '';
const env = {
  sm_progress(pp, pl, fraction, mp, ml) {
    progressCalls++;
    lastPhase = str(pp, pl);
    void fraction;
    void str(mp, ml);
  },
  sm_cancelled() {
    return 0;
  },
};

const { instance } = await WebAssembly.instantiate(bytes, { env });
const ex = instance.exports;
memory = ex.memory;

function call(fn, text) {
  const input = new TextEncoder().encode(text);
  const ptr = ex.sm_alloc(input.length);
  new Uint8Array(memory.buffer, ptr, input.length).set(input);
  const out = ex[fn](ptr, input.length);
  ex.sm_free(ptr, input.length);
  const len = new DataView(memory.buffer).getUint32(out, true);
  const result = new Uint8Array(memory.buffer, out + 4, len).slice(); // copy before freeing
  ex.sm_result_free(out);
  return result;
}

function parseResult(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = dv.getUint32(0, true);
  if (magic !== 0x4d49534d) throw new Error('bad magic 0x' + magic.toString(16));
  const hl = dv.getUint32(4, true);
  const header = JSON.parse(dec.decode(buf.subarray(8, 8 + hl)));
  const dataStart = Math.ceil((8 + hl) / 8) * 8;
  const data = new Float64Array(buf.slice(dataStart).buffer);
  return { header, data };
}

const model = {
  format: 'mysim', version: 1, name: 'wasm smoke',
  nodes: [
    { id: 'sig', type: 'source.signal', params: { waveform: 'sine', frequency: 37, amplitude: 1.5, fs: 1000, duration: 1 } },
    { id: 'fft', type: 'signal.fft', params: { window: 'hann' } },
  ],
  links: [{ from: 'sig', to: 'fft' }],
};

const problems = JSON.parse(dec.decode(call('sm_validate', JSON.stringify(model))));
if (problems.length) throw new Error('validate: ' + problems.join('; '));
const bad = JSON.parse(dec.decode(call('sm_validate', '{"nodes":[{"id":"a","type":"nope"}]}')));
if (!bad.length) throw new Error('validate did not report a bad model');

const { header, data } = parseResult(call('sm_run', JSON.stringify(model)));
if (!header.ok) throw new Error('run failed: ' + header.error);
const fft = header.nodes.find((n) => n.id === 'fft');
if (!fft.ok) throw new Error('fft failed: ' + fft.error);
const f0 = fft.scalars.find((s) => s.name === 'dominant frequency').value;
const amp = fft.tables[0].columns.find((c) => c.name === 'amplitude');
const peak = Math.max(...data.subarray(amp.offset, amp.offset + amp.length));
console.log(`sim.wasm OK: dominant ${f0.toFixed(3)} Hz, peak amplitude ${peak.toFixed(3)}, ` +
  `${header.nodes.length} nodes, progress calls ${progressCalls} (last phase "${lastPhase}")`);
if (Math.abs(f0 - 37) > 0.1) throw new Error('unexpected dominant frequency');
if (Math.abs(peak - 1.5) > 0.1) throw new Error('unexpected amplitude');
