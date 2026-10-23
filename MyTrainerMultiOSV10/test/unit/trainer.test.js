// The TensorFlow.js trainer (the code that runs in the app's Web Worker) and the neuron
// explanations: what the inspector recomputes for a unit must equal what the engine computed.
import { soundsFor } from './sounds.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as tf from '@tensorflow/tfjs';
import { Trainer } from '../../src/engine/trainer-core.js';
import { explainUnit, unitsOf } from '../../src/engine/internals.js';
import { sampleProject } from '../../src/domain/samples.js';
import { fromSource, generate } from '../../src/domain/datasets.js';
import { prepare } from '../../src/domain/preprocess.js';
import { cleanTrain, effectiveTask } from '../../src/domain/project.js';
import { topoOrder, nodeById } from '../../src/domain/graph.js';

tf.env().set('IS_TEST', true);

async function run(id, epochs = 1, edit = null) {
  const project = sampleProject(id, 'en');
  if (edit) edit(project);
  project.train = cleanTrain({ ...project.train, epochs });
  const data = fromSource(project.dataset.source, { sounds: soundsFor(project.dataset.source), overrides: { copies: 1, n: Math.min((project.dataset.source.params?.n ?? 400), 300) } });
  const prepared = prepare(data, project.dataset.steps, project.dataset.split);
  const task = effectiveTask(prepared.task, project.model, prepared.inputShape);
  const messages = [];
  const trainer = new Trainer(tf, (message) => messages.push(message));
  await trainer.handle({ type: 'build', graph: project.model, inputShape: prepared.inputShape, task, train: project.train });
  await trainer.handle({ type: 'data', train: prepared.train, val: prepared.val, test: prepared.test, kind: prepared.kind, task, inputShape: prepared.inputShape });
  await trainer.handle({ type: 'train' });
  return { project, prepared, messages, trainer };
}

test('training XOR reports epochs, snapshots, an evaluation and a done message', async () => {
  const { messages } = await run('xor', 3);
  const errors = messages.filter((m) => m.type === 'error');
  assert.deepEqual(errors, []);
  assert.equal(messages.filter((m) => m.type === 'epoch').length, 3);
  assert.ok(messages.filter((m) => m.type === 'snapshot').length >= 3, 'initial + one per epoch');
  assert.ok(messages.some((m) => m.type === 'boundary'), 'a 2-D dataset gets a decision boundary');
  const done = messages.find((m) => m.type === 'done');
  assert.ok(done && done.history.length === 3);
  assert.ok(messages.some((m) => m.type === 'evaluation'));
});

test('mixup trains on blended batches, learns, and leaves no tensors behind', async () => {
  const { messages, trainer } = await run('blobs', 12, (project) => { project.train.mixup = 0.3; });
  assert.deepEqual(messages.filter((m) => m.type === 'error'), []);
  assert.equal(trainer.mixup, 0.3);
  const epochs = messages.filter((m) => m.type === 'epoch');
  assert.equal(epochs.length, 12);
  assert.ok(epochs.at(-1).valAcc > 0.85, `validation accuracy ${epochs.at(-1).valAcc}`);
  // Another run on the same trainer: the batches made for mixup are all disposed.
  const before = tf.memory().numTensors;
  await trainer.handle({ type: 'train' });
  assert.ok(tf.memory().numTensors - before < 20, `${tf.memory().numTensors - before} tensors more`);
});

test('TensorFlow.js export loads back with tf.loadLayersModel and predicts the same', async () => {
  for (const id of ['blobs', 'bcResNet']) {
    const { messages, trainer, prepared } = await run(id, 1);
    await trainer.handle({ type: 'exportTfjs' });
    const saved = messages.find((m) => m.type === 'tfjsModel');
    assert.ok(saved?.topology && saved.weightData?.byteLength > 0, `${id}: model.json and weights`);
    const loaded = await tf.loadLayersModel(tf.io.fromMemory({ modelTopology: saved.topology, weightSpecs: saved.weightSpecs, weightData: saved.weightData }));
    const s = prepared.inputShape.reduce((a, b) => a * b, 1);
    const x = tf.tensor(prepared.test.x.slice(0, 4 * s), [4, ...prepared.inputShape]);
    const a = await trainer.built.model.predict(x).data();
    const b = await loaded.predict(x).data();
    for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-5, `${id}: output ${i} ${a[i]} vs ${b[i]}`);
    x.dispose(); loaded.dispose();
  }
});

test('a snapshot has the activation of every node, weights and gradients of the weighted layers', async () => {
  const { messages, project } = await run('checker', 1);
  const snapshot = messages.filter((m) => m.type === 'snapshot').at(-1);
  for (const node of project.model.nodes) {
    assert.ok(snapshot.nodes[node.id]?.act?.data, `${node.name} has activations`);
    if (['dense', 'batchNorm'].includes(node.type)) {
      assert.ok(snapshot.nodes[node.id].weights, `${node.name} has weights`);
      assert.ok(snapshot.nodes[node.id].stats, `${node.name} has weight statistics`);
    }
    if (node.type === 'dense') assert.ok(snapshot.nodes[node.id].grads?.kernel?.meanAbs >= 0, `${node.name} has gradients`);
  }
});

/** Every unit (or a sample of positions) the inspector explains must match the engine's value. */
function checkExplanations(project, snapshot, { tolerance = 2e-3 } = {}) {
  const context = { ...snapshot, inputNodeId: project.model.nodes.find((n) => n.type === 'input').id };
  let checked = 0;
  for (const id of topoOrder(project.model)) {
    const node = nodeById(project.model, id);
    const act = snapshot.nodes[id]?.act;
    if (!act?.data || node.type === 'input') continue;
    const units = Math.min(unitsOf(act.shape), 6);
    const positions = act.shape.length === 3 ? [{ row: 0, col: 0 }, { row: Math.floor(act.shape[0] / 2), col: act.shape[1] - 1 }]
      : act.shape.length === 2 ? [{ t: 0 }, { t: act.shape[0] - 1 }] : [{}];
    for (let unit = 0; unit < units; unit++) {
      for (const position of positions) {
        const e = explainUnit(project.model, context, id, unit, position);
        if (!e || e.a == null || e.kind === 'value') continue;
        const actual = e.actual ?? null;
        if (actual == null) continue;
        assert.ok(Math.abs(e.a - actual) <= tolerance * Math.max(1, Math.abs(actual)), `${node.name} (${node.type}) unit ${unit} ${JSON.stringify(position)}: explained ${e.a}, engine ${actual}`);
        checked++;
      }
    }
    if (['simpleRnn', 'lstm', 'gru'].includes(node.type)) {
      // Recurrent layers: the unrolled last hidden state must be the layer's output.
      for (let unit = 0; unit < units; unit++) {
        const e = explainUnit(project.model, context, id, unit, {});
        const engine = act.shape.length === 1 ? act.data[unit] : act.data[(act.shape[0] - 1) * act.shape[1] + unit];
        assert.ok(Math.abs(e.steps.at(-1).h - engine) <= tolerance * Math.max(1, Math.abs(engine)), `${node.name} unit ${unit}: unrolled ${e.steps.at(-1).h}, engine ${engine}`);
        checked++;
      }
    }
  }
  return checked;
}

for (const id of ['spiral', 'checker', 'digitsCnn', 'activityConv1d', 'lstmForecast', 'gruPatterns', 'rnnCounting', 'sentiment', 'residual', 'wideDeep', 'shapesCnn']) {
  test(`the inspector's arithmetic matches TensorFlow.js — ${id}`, async () => {
    const { messages, project } = await run(id, 1, (p) => { if (id === 'shapesCnn') { p.dataset.steps = []; p.dataset.source.params.size = 16; for (const node of p.model.nodes) if (node.type === 'input') node.params.shape = '16,16,1'; } });
    const snapshot = messages.filter((m) => m.type === 'snapshot').at(-1);
    const checked = checkExplanations(project, snapshot);
    assert.ok(checked > 0, 'something was checked');
  });
}

test('pause, step and stop control a running training', async () => {
  const project = sampleProject('xor', 'en');
  project.train = cleanTrain({ ...project.train, epochs: 50, batchSize: 8 });
  const data = generate('xor', { n: 200 });
  const prepared = prepare(data, [], project.dataset.split);
  const task = effectiveTask(prepared.task, project.model, prepared.inputShape);
  const messages = [];
  const trainer = new Trainer(tf, (message) => messages.push(message));
  await trainer.handle({ type: 'build', graph: project.model, inputShape: prepared.inputShape, task, train: project.train });
  await trainer.handle({ type: 'data', train: prepared.train, val: prepared.val, test: prepared.test, kind: prepared.kind, task, inputShape: prepared.inputShape });
  const training = trainer.handle({ type: 'train' });
  await new Promise((resolve) => setTimeout(resolve, 200));
  trainer.handle({ type: 'pause' });
  await new Promise((resolve) => setTimeout(resolve, 150));
  const epochsWhilePaused = messages.filter((m) => m.type === 'epoch').length;
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(messages.filter((m) => m.type === 'epoch').length, epochsWhilePaused, 'no progress while paused');
  assert.ok(messages.some((m) => m.type === 'status' && m.state === 'paused'));
  trainer.handle({ type: 'stop' });
  await training;
  const done = messages.find((m) => m.type === 'done');
  assert.ok(done.stopped, 'reported as stopped');
  assert.ok(done.epochs < 50, 'stopped before the end');
});

test('weights exported from one trainer load into another for the same model', async () => {
  const { trainer, project, prepared } = await run('blobs', 2);
  const messages = [];
  trainer.post = (message) => messages.push(message);
  await trainer.handle({ type: 'exportWeights' });
  const { weights } = messages.find((m) => m.type === 'weights');
  const other = new Trainer(tf, (message) => messages.push(message));
  const task = effectiveTask(prepared.task, project.model, prepared.inputShape);
  await other.handle({ type: 'build', graph: project.model, inputShape: prepared.inputShape, task, train: project.train });
  await other.handle({ type: 'importWeights', weights });
  assert.equal(messages.find((m) => m.type === 'weightsLoaded').layers, 1);
  const x = Array.from(prepared.test.x.slice(0, 2));
  await trainer.handle({ type: 'predict', x, n: 1, requestId: 1 });
  await other.handle({ type: 'predict', x, n: 1, requestId: 2 });
  const [a, b] = messages.filter((m) => m.type === 'prediction');
  assert.deepEqual(Array.from(a.values).map((v) => v.toFixed(5)), Array.from(b.values).map((v) => v.toFixed(5)));
});
