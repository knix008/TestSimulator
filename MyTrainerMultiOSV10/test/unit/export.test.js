// Model export: every sample becomes C (compiled with gcc when there is one) and ONNX (run with
// ONNX Runtime when a Python has it); both must give what TensorFlow.js gives for a test sample.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { soundsFor } from './sounds.mjs';
import { fromSource, sampleX } from '../../src/domain/datasets.js';
import { generateC } from '../../src/domain/export-c.js';
import { generateOnnx } from '../../src/domain/export-onnx.js';
import { modelBudget } from '../../src/domain/budget.js';
import { inferShapes, nodeById } from '../../src/domain/graph.js';
import { prepare, transformInput } from '../../src/domain/preprocess.js';
import { cleanTrain, effectiveTask } from '../../src/domain/project.js';
import { SAMPLE_IDS, sampleProject } from '../../src/domain/samples.js';
import { canonicalWeights } from '../../src/engine/tfbuild.js';
import { Trainer } from '../../src/engine/trainer-core.js';
import { registerWasmTrainingKernels } from '../../src/engine/wasm-kernels.js';
import { zipBlob } from '../../src/platform/zip.js';
import { ensureVenvTts } from '../../scripts/venv-tts.mjs';

// The WASM backend with MyTrainer's gradient kernels (they match the CPU's, wasm.test.js): the large keyword
// models train in seconds instead of minutes on the plain JavaScript CPU backend. CommonJS builds, so the WASM
// backend registers with the same TensorFlow.js.
const require = createRequire(import.meta.url);
const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-backend-wasm');
registerWasmTrainingKernels(tf);
await tf.setBackend('wasm');

const gcc = ['gcc', 'C:/Msys64/ucrt64/bin/gcc.exe', 'C:/msys64/mingw64/bin/gcc.exe', '/usr/bin/gcc', '/usr/bin/cc'].find((candidate) => spawnSync(candidate, ['--version'], { stdio: 'ignore' }).status === 0);
// ONNX Runtime: MYTRAINER_ORT_PYTHON, else .venv-tts (made / completed now when it is missing), else a Python on PATH.
// Absolute paths: the check runs from the project folder, the export from a temporary one.
const hasOrt = (candidate) => spawnSync(candidate, ['-c', 'import onnxruntime, numpy'], { stdio: 'ignore' }).status === 0;
const venvOrt = () => { try { return ensureVenvTts(['onnxruntime', 'numpy'], { log: (line) => console.log(line) }); } catch (error) { console.log(`.venv-tts: ${error.message}`); return null; } };
const ortPython = [process.env.MYTRAINER_ORT_PYTHON].filter(Boolean).find(hasOrt) ?? venvOrt() ?? ['python', 'python3'].find(hasOrt);
const ORT_RUN = `import json, sys
import numpy as np, onnxruntime as ort
case = json.load(open(sys.argv[1]))
session = ort.InferenceSession(sys.argv[2], providers=["CPUExecutionProvider"])
y = session.run(None, {"input": np.array(case["x"], dtype=np.float32).reshape(case["shape"])})[0].reshape(-1)
print(float(np.abs(y - np.array(case["expected"], dtype=np.float32)).max()))
`;

/** At most about `n` clips of a sound bank, every label kept (like `n: 160` for generated data). */
function fewClips(clips, n = 160) {
  if (!clips) return clips;
  const byLabel = Map.groupBy(clips, (clip) => clip.label);
  const each = Math.max(1, Math.ceil(n / byLabel.size));
  return [...byLabel.values()].flatMap((list) => list.filter((_, i) => i % Math.max(1, Math.floor(list.length / each)) === 0).slice(0, each));
}

/** A briefly trained sample: weights (canonical), a raw test input and TF.js's output for it. */
async function trained(id) {
  const project = sampleProject(id, 'en');
  const data = fromSource(project.dataset.source, { sounds: fewClips(soundsFor(project.dataset.source)), overrides: { n: 160, copies: 1 } });
  const prepared = prepare(data, project.dataset.steps, project.dataset.split);
  const task = effectiveTask(prepared.task, project.model, prepared.inputShape);
  const messages = [];
  const trainer = new Trainer(tf, (m) => messages.push(m));
  await trainer.handle({ type: 'build', graph: project.model, inputShape: prepared.inputShape, task, train: cleanTrain({ ...project.train, epochs: 1, batchSize: 64 }) });
  await trainer.handle({ type: 'data', train: prepared.train, val: prepared.val, test: prepared.test, kind: prepared.kind, task, inputShape: prepared.inputShape });
  await trainer.handle({ type: 'train' });
  await trainer.handle({ type: 'exportWeights' });
  const raw = messages.find((m) => m.type === 'weights').weights;
  const weights = Object.fromEntries(Object.entries(raw).map(([nid, list]) => [nid, canonicalWeights(nodeById(project.model, nid).type, list)]));
  const rawX = Array.from(sampleX(data, 1));
  const x = transformInput(prepared, rawX, data.inputShape);
  const expected = Array.from(await trainer.built.model.predict(tf.tensor(x, [1, ...prepared.inputShape])).data());
  return { project, data, prepared, task, weights, rawX, expected };
}

for (const id of SAMPLE_IDS) {
  test(`C and ONNX export match TensorFlow.js — ${id}`, { timeout: 600000 }, async () => {
    const t = await trained(id);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mt-export-${id}-`));
    try {
      const c = generateC({ project: t.project, prepared: t.prepared, weights: t.weights, rawShape: t.data.inputShape, labels: t.data.labels, task: t.task, example: { raw: t.rawX, expected: t.expected } });
      assert.deepEqual(c.errors, []);
      for (const [name, text] of Object.entries(c.files)) fs.writeFileSync(path.join(dir, name), text);
      if (gcc) {
        const env = { ...process.env, PATH: `${path.dirname(gcc)}${path.delimiter}${process.env.PATH}` };
        execFileSync(gcc, ['-O1', '-std=c99', '-Wall', '-Werror', '-Wno-unused-variable', 'example.c', 'model.c', '-lm', '-o', 'example'], { cwd: dir, env, stdio: 'pipe' });
        const run = spawnSync(path.join(dir, process.platform === 'win32' ? 'example.exe' : 'example'), { cwd: dir, env, input: '' });
        assert.equal(run.status, 0, `the C model differs from TensorFlow.js:\n${run.stdout}`);
      }
      const onnx = generateOnnx({ project: t.project, prepared: t.prepared, weights: t.weights, rawShape: t.data.inputShape });
      assert.deepEqual(onnx.errors, []);
      if (ortPython) {
        fs.writeFileSync(path.join(dir, 'model.onnx'), onnx.bytes);
        fs.writeFileSync(path.join(dir, 'case.json'), JSON.stringify({ x: t.rawX, shape: [1, ...t.data.inputShape], expected: t.expected }));
        fs.writeFileSync(path.join(dir, 'run.py'), ORT_RUN);
        const out = execFileSync(ortPython, ['run.py', 'case.json', 'model.onnx'], { cwd: dir }).toString().trim();
        assert.ok(Number(out) < 1e-3, `ONNX Runtime differs from TensorFlow.js by ${out}`);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('the export ZIP (web build) is a valid archive', async () => {
  const blob = zipBlob({ 'a.txt': 'hello', 'b/c.bin': Uint8Array.from([1, 2, 3]) });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), 2);
});

test('the model budget counts MACs and memory', () => {
  const project = sampleProject('dsCnn', 'en');
  const budget = modelBudget(project.model, inferShapes(project.model, [32, 32, 1]));
  // conv 3×3×1→32 on 16×16 = 73 728 MACs, plus the depthwise / pointwise blocks.
  assert.ok(budget.macs > 73728 && budget.macs < 5e6, String(budget.macs));
  assert.equal(budget.weightBytes8 * 4, budget.weightBytes32);
  assert.ok(budget.peakBytes >= 32 * 32 * 4);
});
