// The PyTorch engine: the generated script for every sample runs with this computer's PyTorch
// through the bridge (python/mytrainer_bridge.py), trains, sends snapshots of every node, evaluates,
// answers predictions while serving — and the inspector's arithmetic matches PyTorch too.
import { soundsFor } from './sounds.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { generatePytorch } from '../../src/domain/codegen.js';
import { fromSource, generate } from '../../src/domain/datasets.js';
import { nodeById, topoOrder } from '../../src/domain/graph.js';
import { prepare } from '../../src/domain/preprocess.js';
import { cleanTrain, effectiveTask } from '../../src/domain/project.js';
import { SAMPLE_IDS, sampleProject } from '../../src/domain/samples.js';
import { explainUnit, unitsOf } from '../../src/engine/internals.js';
import { torchPython } from './python-env.mjs';
import { modelProject, SAMPLE_MODELS } from './models.mjs';

const python = torchPython();
const skip = python ? false : 'no Python with PyTorch on this computer (set MYTRAINER_PYTHON)';
const f32 = (values) => Buffer.from(Float32Array.from(values).buffer);

/** Runs a sample's generated script like the app does; returns the bridge messages (by name → id). */
async function runSample(id, { epochs = 2, edit = null, variant = null } = {}) {
  const project = modelProject({ id, variant });
  if (edit) edit(project);
  project.train = cleanTrain({ ...project.train, epochs });
  const data = fromSource(project.dataset.source, { sounds: soundsFor(project.dataset.source), overrides: { copies: 1, n: Math.min((project.dataset.source.params?.n ?? 400), 400) } });
  const prepared = prepare(data, project.dataset.steps, project.dataset.split);
  const task = effectiveTask(prepared.task, project.model, prepared.inputShape);
  const { code, errors } = generatePytorch({ project, task, inputShape: prepared.inputShape });
  assert.deepEqual(errors, []);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mytrainer-${id}-`));
  fs.writeFileSync(path.join(dir, 'train.py'), code);
  fs.copyFileSync(path.join('python', 'mytrainer_bridge.py'), path.join(dir, 'mytrainer_bridge.py'));
  const parts = {};
  for (const name of ['train', 'val', 'test']) {
    parts[name] = { n: prepared[name].n, index: Array.from(prepared[name].index) };
    fs.writeFileSync(path.join(dir, `x_${name}.f32`), f32(prepared[name].x));
    fs.writeFileSync(path.join(dir, `y_${name}.f32`), f32(prepared[name].y));
  }
  const size = prepared.inputShape.reduce((a, b) => a * b, 1);
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ input_shape: prepared.inputShape, task, kind: prepared.kind, parts, epochs, snapshot_every: 1, probe: Array.from(prepared.train.x.slice(0, size)) }));
  const nameToId = new Map(project.model.nodes.map((node) => [node.name, node.id]));
  const messages = await new Promise((resolve, reject) => {
    const child = spawn(python, ['-u', 'train.py'], { cwd: dir, env: { ...process.env, MYTRAINER_RUN_DIR: dir, PYTHONIOENCODING: 'utf-8', PYTHONPATH: dir } });
    const list = [];
    let buffer = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        if (!line.startsWith('@@MT ')) continue;
        const message = JSON.parse(line.slice(5));
        if (message.type === 'snapshot') message.nodes = Object.fromEntries(Object.entries(message.nodes).map(([name, value]) => [nameToId.get(name), value]));
        list.push(message);
        if (message.type === 'done') {
          child.stdin.write(`${JSON.stringify({ cmd: 'predict', x: Array.from(prepared.test.x.slice(0, size * 2)), n: 2, requestId: 9 })}\n`);
          child.stdin.write(`${JSON.stringify({ cmd: 'probe' })}\n`);
          setTimeout(() => child.stdin.write(`${JSON.stringify({ cmd: 'exit' })}\n`), 2500);
        }
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('exit', (code) => (list.some((m) => m.type === 'done') ? resolve(list) : reject(new Error(`exit ${code}: ${stderr.slice(-1500)}`))));
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return { project, prepared, messages };
}

function checkExplanations(project, snapshot, tolerance = 2e-3) {
  const context = { ...snapshot, inputNodeId: project.model.nodes.find((n) => n.type === 'input').id };
  let checked = 0;
  for (const id of topoOrder(project.model)) {
    const node = nodeById(project.model, id);
    const act = snapshot.nodes[id]?.act;
    if (!act?.data || node.type === 'input') continue;
    const units = Math.min(unitsOf(act.shape), 5);
    const positions = act.shape.length === 3 ? [{ row: 0, col: 0 }, { row: Math.floor(act.shape[0] / 2), col: act.shape[1] - 1 }] : act.shape.length === 2 ? [{ t: 0 }, { t: act.shape[0] - 1 }] : [{}];
    for (let unit = 0; unit < units; unit++) {
      if (['simpleRnn', 'lstm', 'gru'].includes(node.type)) {
        const e = explainUnit(project.model, context, id, unit, {});
        const engine = act.shape.length === 1 ? act.data[unit] : act.data[(act.shape[0] - 1) * act.shape[1] + unit];
        assert.ok(Math.abs(e.steps.at(-1).h - engine) <= tolerance * Math.max(1, Math.abs(engine)), `${node.name} unit ${unit}: unrolled ${e.steps.at(-1).h}, PyTorch ${engine}`);
        checked++;
        continue;
      }
      for (const position of positions) {
        const e = explainUnit(project.model, context, id, unit, position);
        if (!e || e.kind === 'value' || e.a == null || e.actual == null) continue;
        assert.ok(Math.abs(e.a - e.actual) <= tolerance * Math.max(1, Math.abs(e.actual)), `${node.name} (${node.type}) unit ${unit} ${JSON.stringify(position)}: explained ${e.a}, PyTorch ${e.actual}`);
        checked++;
      }
    }
  }
  return checked;
}

for (const { id, variant, label } of SAMPLE_MODELS) {
  test(`PyTorch trains the generated code — ${label}`, { skip, timeout: 240000 }, async () => {
    const { project, messages } = await runSample(id, { variant });
    assert.equal(messages.filter((m) => m.type === 'epoch').length, 2);
    const done = messages.find((m) => m.type === 'done');
    assert.ok(done.evaluation && Number.isFinite(done.evaluation.loss), 'test loss reported');
    const snapshots = messages.filter((m) => m.type === 'snapshot');
    assert.ok(snapshots.length >= 4, 'untrained + 2 epochs + the probe while serving');
    const last = snapshots.at(-1);
    for (const node of project.model.nodes) assert.ok(last.nodes[node.id]?.act?.data, `${node.name} traced`);
    const prediction = messages.find((m) => m.type === 'prediction');
    assert.ok(prediction && prediction.requestId === 9 && prediction.values.length >= 2, 'answers predictions while serving');
    assert.ok(messages.some((m) => m.type === 'evaluation'));
  });
}

for (const id of ['spiral', 'checker', 'digitsCnn', 'activityConv1d', 'lstmForecast', 'gruPatterns', 'rnnCounting', 'sentiment', 'residual']) {
  test(`the inspector's arithmetic matches PyTorch — ${id}`, { skip, timeout: 240000 }, async () => {
    const { project, messages } = await runSample(id, { epochs: 1 });
    const checked = checkExplanations(project, messages.filter((m) => m.type === 'snapshot').at(-1));
    assert.ok(checked > 0);
  });
}
