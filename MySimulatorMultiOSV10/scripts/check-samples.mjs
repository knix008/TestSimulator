// Runs every sample pipeline through the WebAssembly engine (public/sim.wasm) in both
// languages and checks that every node succeeds — except the desktop-only nodes
// (Python, external programs, files), which the web engine refuses by design.
// Then every preset of every node type runs on its own (fed by a signal generator
// when the node needs an input or the preset reads one with INPUT(…)).
//   node scripts/check-samples.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_IDS, sampleModel } from '../src/core/samples.js';
import { engineModel } from '../src/core/model.js';
import { decodeResult } from '../src/core/result.js';
import { NODES, nodeSpec, defaultParams } from '../src/core/catalog.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let memory = null;
const { instance } = await WebAssembly.instantiate(readFileSync(join(root, 'public', 'sim.wasm')), { env: { sm_progress() {}, sm_cancelled: () => 0 } });
const ex = instance.exports;
memory = ex.memory;

function run(text) {
  const input = new TextEncoder().encode(text);
  const ptr = ex.sm_alloc(input.length);
  new Uint8Array(memory.buffer, ptr, input.length).set(input);
  const out = ex.sm_run(ptr, input.length);
  ex.sm_free(ptr, input.length);
  const len = new DataView(memory.buffer).getUint32(out, true);
  const bytes = new Uint8Array(memory.buffer, out + 4, len).slice();
  ex.sm_result_free(out);
  return decodeResult(bytes);
}

let failures = 0;
let passes = 0;
for (const lang of ['ko', 'en']) {
  for (const id of SAMPLE_IDS) {
    const model = sampleModel(id, lang);
    const started = performance.now();
    const result = run(JSON.stringify(engineModel(model)));
    const ms = performance.now() - started;
    const bad = [];
    for (const node of model.nodes) {
      const out = result.nodes.get(node.id);
      if (nodeSpec(node.type)?.desktopOnly) continue;
      const upstreamDesktop = model.links.some((l) => l.to === node.id && nodeSpec(model.nodes.find((n) => n.id === l.from)?.type)?.desktopOnly);
      if (upstreamDesktop) continue;
      if (!out?.ok) bad.push(`${node.name}: ${out?.error ?? 'no output'}`);
    }
    if (!result.header.ok) bad.push(result.header.error);
    // The node:test spec layout, so npm test lays these lines out like the other results.
    if (bad.length) {
      failures++;
      console.log(`✖ sample ${id} (${lang}), ${model.nodes.length} nodes (${ms.toFixed(2)}ms)`);
      for (const line of bad) console.log(`    ${line}`);
    } else {
      passes++;
      console.log(`✔ sample ${id} (${lang}), ${model.nodes.length} nodes (${ms.toFixed(2)}ms)`);
    }
  }
}
for (const spec of NODES) {
  if (spec.desktopOnly || !spec.presets) continue;
  for (const preset of spec.presets) {
    const params = { ...defaultParams(spec.type), ...preset.params };
    const needsInput = spec.inputs.some((p) => !p.optional) || JSON.stringify(params).includes('INPUT(') || preset.input === 'signal';
    const nodes = [{ id: 'n', type: spec.type, name: preset.en, params }];
    const links = [];
    if (preset.input === 'triangles') {
      // A 10 mm cube as an STL triangle table.
      const f = [[0, 0, 0, 0, 1, 0, 1, 1, 0], [0, 0, 0, 1, 1, 0, 1, 0, 0], [0, 0, 1, 1, 0, 1, 1, 1, 1], [0, 0, 1, 1, 1, 1, 0, 1, 1], [0, 0, 0, 1, 0, 0, 1, 0, 1], [0, 0, 0, 1, 0, 1, 0, 0, 1],
        [0, 1, 0, 0, 1, 1, 1, 1, 1], [0, 1, 0, 1, 1, 1, 1, 1, 0], [0, 0, 0, 0, 0, 1, 0, 1, 1], [0, 0, 0, 0, 1, 1, 0, 1, 0], [1, 0, 0, 1, 1, 0, 1, 1, 1], [1, 0, 0, 1, 1, 1, 1, 0, 1]];
      const data = ['x1,y1,z1,x2,y2,z2,x3,y3,z3', ...f.map((r) => r.map((v) => v * 10).join(','))].join('\n');
      nodes.unshift({ id: 'src', type: 'source.table', name: 'cube', params: { data } });
      links.push({ from: 'src', to: 'n', toPort: 'in' });
    } else if (needsInput && spec.inputs.length) {
      nodes.unshift({ id: 'src', type: 'source.signal', name: 'signal', params: { ...defaultParams('source.signal'), noise: 0.1 } });
      links.push({ from: 'src', to: 'n', toPort: spec.inputs[0].port });
    }
    const started = performance.now();
    const result = run(JSON.stringify(engineModel({ name: preset.en, nodes, links, settings: {} })));
    const ms = performance.now() - started;
    const out = result.nodes.get('n');
    const label = `preset ${spec.type} › ${preset.id}`;
    if (!out?.ok) {
      failures++;
      console.log(`✖ ${label} (${ms.toFixed(2)}ms)`);
      console.log(`    ${out?.error ?? result.header.error ?? 'no output'}`);
    } else {
      passes++;
      console.log(`✔ ${label} (${ms.toFixed(2)}ms)`);
    }
  }
}
console.log(`ℹ pass ${passes}`);
console.log(`ℹ fail ${failures}`);
if (failures) process.exit(1);
