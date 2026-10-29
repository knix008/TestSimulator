// Training without a GPU: the WASM backend with the gradient kernels MyTrainer adds (wasm-kernels.js)
// gives the same gradients as the CPU backend, and every sample model trains on it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { registerWasmTrainingKernels } from '../../src/engine/wasm-kernels.js';
import { Trainer } from '../../src/engine/trainer-core.js';
import { sampleProject, SAMPLE_IDS } from '../../src/domain/samples.js';
import { fromSource } from '../../src/domain/datasets.js';
import { prepare } from '../../src/domain/preprocess.js';
import { cleanTrain, effectiveTask } from '../../src/domain/project.js';
import { fewClips, soundsFor } from './sounds.mjs';
import { modelProject, SAMPLE_MODELS } from './models.mjs';

// The CommonJS builds, so the WASM backend registers with the same TensorFlow.js as the tests use.
const require = createRequire(import.meta.url);
const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-backend-wasm');
registerWasmTrainingKernels(tf);

/** Gradients of sum(f(params) · weight) for the given backend. */
async function gradsOn(backend, make) {
  await tf.setBackend(backend);
  await tf.ready();
  const { params, f } = make();
  const vars = params.map((p) => tf.tensor(p.data, p.shape));
  const weight = tf.tensor(make.weight.data, make.weight.shape);
  const grads = tf.grads((...xs) => tf.sum(tf.mul(f(...xs), weight)))(vars);
  const out = await Promise.all(grads.map((g) => g.data()));
  tf.dispose([...vars, weight, ...grads]);
  return out;
}

const random = (shape, seed) => {
  let s = seed;
  const n = shape.reduce((a, b) => a * b, 1);
  return { shape, data: Float32Array.from({ length: n }, () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; }) };
};

const CASES = [
  { name: 'conv2d 3×3 same', x: [2, 7, 6, 3], w: [3, 3, 3, 5], strides: 1, pad: 'same', out: [2, 7, 6, 5], f: (x, w, s, p) => tf.conv2d(x, w, s, p) },
  { name: 'conv2d 3×3 stride 2 same', x: [2, 8, 9, 4], w: [3, 3, 4, 6], strides: 2, pad: 'same', out: [2, 4, 5, 6], f: (x, w, s, p) => tf.conv2d(x, w, s, p) },
  { name: 'conv2d 5×5 stride 2 valid', x: [1, 11, 10, 2], w: [5, 5, 2, 3], strides: 2, pad: 'valid', out: [1, 4, 3, 3], f: (x, w, s, p) => tf.conv2d(x, w, s, p) },
  { name: 'depthwise 3×3 same', x: [2, 6, 7, 4], w: [3, 3, 4, 1], strides: 1, pad: 'same', out: [2, 6, 7, 4], f: (x, w, s, p) => tf.depthwiseConv2d(x, w, s, p) },
  { name: 'depthwise 3×1 stride 2 ×2', x: [1, 8, 6, 3], w: [3, 1, 3, 2], strides: 2, pad: 'same', out: [1, 4, 3, 6], f: (x, w, s, p) => tf.depthwiseConv2d(x, w, s, p) },
];

for (const c of CASES) {
  test(`WASM gradients equal the CPU's — ${c.name}`, async () => {
    const make = () => ({ params: [random(c.x, 7), random(c.w, 11)], f: (x, w) => c.f(x, w, c.strides, c.pad) });
    make.weight = random(c.out, 13);
    const [cpu, wasm] = [await gradsOn('cpu', make), await gradsOn('wasm', make)];
    for (const [k, part] of ['input', 'filter'].entries()) {
      const worst = cpu[k].reduce((m, v, i) => Math.max(m, Math.abs(v - wasm[k][i])), 0);
      assert.ok(worst < 1e-4, `${part} gradient differs by ${worst}`);
    }
  });
}

test('WASM gradient of an embedding lookup (UnsortedSegmentSum) equals the CPU\'s', async () => {
  const table = random([10, 4], 3);
  const run = async (backend) => {
    await tf.setBackend(backend);
    const t = tf.tensor(table.data, table.shape);
    const ids = tf.tensor1d([1, 3, 3, 9, 0, 1], 'int32');
    const g = tf.grad((w) => tf.sum(tf.mul(tf.gather(w, ids), tf.range(1, 25).reshape([6, 4]))))(t);
    const out = await g.data();
    tf.dispose([t, ids, g]);
    return out;
  };
  const [cpu, wasm] = [await run('cpu'), await run('wasm')];
  cpu.forEach((v, i) => assert.ok(Math.abs(v - wasm[i]) < 1e-4, `${i}: ${v} vs ${wasm[i]}`));
});

// Every model of every sample (each choice of model too) trains one epoch on the WASM backend (no GPU). A sound
// bank gives a few hundred of its clips, every word kept: enough to build and train, not minutes of spectrograms.
for (const entry of SAMPLE_MODELS) {
  test(`trains one epoch on the WASM backend (no GPU) — ${entry.label}`, { timeout: 300000 }, async () => {
    await tf.setBackend('wasm');
    const project = modelProject(entry);
    project.train = cleanTrain({ ...project.train, epochs: 1 });
    const data = fromSource(project.dataset.source, { sounds: fewClips(soundsFor(project.dataset.source), 300), overrides: { copies: 1, n: Math.min(project.dataset.source.params?.n ?? 400, 200) } });
    const prepared = prepare(data, project.dataset.steps, project.dataset.split);
    const task = effectiveTask(prepared.task, project.model, prepared.inputShape);
    const messages = [];
    const trainer = new Trainer(tf, (m) => messages.push(m));
    try {
      await trainer.handle({ type: 'build', graph: project.model, inputShape: prepared.inputShape, task, train: project.train });
      await trainer.handle({ type: 'data', train: prepared.train, val: prepared.val, test: prepared.test, kind: prepared.kind, task, inputShape: prepared.inputShape });
      await trainer.handle({ type: 'train' });
      const error = messages.find((m) => m.type === 'error');
      assert.equal(error, undefined, error?.message);
      const loss = messages.find((m) => m.type === 'done')?.history?.at(-1)?.loss;
      assert.ok(Number.isFinite(loss), `loss ${loss}`);
    } finally {
      trainer.dispose();
    }
  });
}
