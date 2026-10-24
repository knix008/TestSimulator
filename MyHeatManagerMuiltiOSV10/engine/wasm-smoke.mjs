// Smoke test of the wasm ABI: node engine/wasm-smoke.mjs
// Loads public/heat.wasm with stub imports, validates and runs a small model,
// parses the binary result header and prints Tmax.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bytes = readFileSync(join(root, 'public', 'heat.wasm'));

let memory = null;
const dec = new TextDecoder();
const str = (ptr, len) => dec.decode(new Uint8Array(memory.buffer, ptr, len));
let progressCalls = 0;
let lastPhase = '';
const env = {
  hm_progress(pp, pl, fraction, mp, ml) {
    progressCalls++;
    lastPhase = str(pp, pl);
    void fraction;
    void str(mp, ml);
  },
  hm_cancelled() {
    return 0;
  },
};

const { instance } = await WebAssembly.instantiate(bytes, { env });
const ex = instance.exports;
memory = ex.memory;

function call(fn, text) {
  const input = new TextEncoder().encode(text);
  const ptr = ex.hm_alloc(input.length);
  new Uint8Array(memory.buffer, ptr, input.length).set(input);
  const out = ex[fn](ptr, input.length);
  ex.hm_free(ptr, input.length);
  const len = new DataView(memory.buffer).getUint32(out, true);
  const result = new Uint8Array(memory.buffer, out + 4, len).slice(); // copy before freeing
  ex.hm_result_free(out);
  return result;
}

function parseResult(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = dv.getUint32(0, true);
  if (magic !== 0x54484d48) throw new Error('bad magic 0x' + magic.toString(16));
  const hl = dv.getUint32(4, true);
  const header = JSON.parse(dec.decode(buf.subarray(8, 8 + hl)));
  const dataStart = 8 + hl;
  const data = new Float32Array(buf.slice(dataStart).buffer);
  return { header, data };
}

const model = {
  format: 'myheat', version: 1, name: 'wasm smoke',
  domain: { dim: 2, width: 40, height: 20, depth: 10, nx: 40, ny: 20, background: 'al' },
  ambient: 25,
  materials: [{ id: 'al', kind: 'solid', k: 167, rho: 2700, cp: 896 }],
  bodies: [{ id: 'chip', shape: 'rect', x: 15, y: 0, w: 10, h: 4, material: 'al', power: 5 }],
  boundaries: [{ id: 'top', target: 'top', type: 'convection', h: 50, Tinf: 25 }],
  probes: [{ id: 'p', x: 20, y: 2 }],
  study: { type: 'steady' },
};

const problems = JSON.parse(dec.decode(call('hm_validate', JSON.stringify(model))));
if (problems.length) throw new Error('validate: ' + problems.join('; '));
const bad = JSON.parse(dec.decode(call('hm_validate', '{"domain":{"dim":5}}')));
if (!bad.length) throw new Error('validate did not report a bad model');

const { header, data } = parseResult(call('hm_run', JSON.stringify(model)));
if (!header.ok) throw new Error('run failed: ' + header.error);
const T = header.fields.T;
const tField = data.subarray(T.offset, T.offset + T.length);
const tmax = Math.max(...tField);
// Analytic: all 5 W leave through the top: mean surface rise = 5 / (h·A)
const rise = 5 / (50 * 0.04 * 0.01);
console.log(`heat.wasm OK: Tmax = ${header.stats.Tmax.toFixed(3)} °C (field max ${tmax.toFixed(3)}), ` +
  `mean film rise ≈ ${rise.toFixed(1)} K, balance error ${header.balance.error.toExponential(2)}, ` +
  `elapsedMs ${header.elapsedMs}, progress calls ${progressCalls} (last phase "${lastPhase}")`);
if (!(header.stats.Tmax > 25 + rise)) throw new Error('unexpected Tmax');
if (Math.abs(header.stats.Tmax - tmax) > 1e-3) throw new Error('stats/field mismatch');
