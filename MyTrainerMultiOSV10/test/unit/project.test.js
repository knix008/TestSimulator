// Project files, settings, undo history, PyTorch code generation, metrics, the Python dictionary
// and the UI dictionaries.
import { soundsFor } from './sounds.mjs';
import { modelProject, SAMPLE_MODELS } from './models.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { generatePytorch } from '../../src/domain/codegen.js';
import { fromSource, generate } from '../../src/domain/datasets.js';
import { classificationReport, regressionReport } from '../../src/domain/metrics.js';
import { prepare } from '../../src/domain/preprocess.js';
import { cleanTrain, effectiveTask, newProject, normalizeProject, parseProject, resolveLoss, scheduledRate, serializeProject } from '../../src/domain/project.js';
import { lookupWord, PY_DICTIONARY, searchDictionary } from '../../src/domain/pydict.js';
import { SAMPLE_IDS, sampleProject } from '../../src/domain/samples.js';
import { addRecent, History, normalizeSettings, removeRecent, resetForNewInstall } from '../../src/domain/settings.js';
import ko from '../../src/i18n/ko.js';
import en from '../../src/i18n/en.js';

test('a project survives saving and opening', () => {
  const project = sampleProject('digitsCnn', 'ko');
  project.code = { text: 'print(1)\n', custom: true };
  const again = parseProject(serializeProject(project));
  assert.equal(again.name, project.name);
  assert.deepEqual(again.model, project.model);
  assert.deepEqual(again.dataset, project.dataset);
  assert.deepEqual(again.train, project.train);
  assert.deepEqual(again.code, project.code);
  assert.throws(() => parseProject('{"format":"other"}'), /project.notProject/);
  assert.throws(() => parseProject('not json'), /badJson/);
});

test('anything odd in a project file falls back to safe values', () => {
  const p = normalizeProject({ name: '', dataset: { source: { kind: 'generator', id: 'nope' }, split: { val: 5 } }, train: { epochs: -3, optimizer: 'magic', learningRate: 'x' }, engine: 'tpu', code: { text: 3, custom: true } });
  assert.equal(p.name, newProject().name);
  assert.equal(p.dataset.source.id, 'spiral');
  assert.equal(p.dataset.split.val, 0.5);
  assert.equal(p.train.epochs, 1);
  assert.equal(p.train.optimizer, 'adam');
  assert.equal(p.engine, 'tfjs');
  assert.equal(p.code.custom, false);
});

test('the loss and the binary output follow the model', () => {
  const project = sampleProject('wideDeep', 'en');
  const data = generate('moons', { n: 50 });
  const task = effectiveTask(data.task, project.model, data.inputShape);
  assert.equal(task.binaryOutput, 1);
  assert.equal(resolveLoss(project.train, task), 'binaryCrossentropy');
  assert.equal(resolveLoss(cleanTrain({ loss: 'huber' }), task), 'huber');
  assert.equal(resolveLoss(project.train, { kind: 'regression' }), 'meanSquaredError');
  const train = cleanTrain({ learningRate: 0.1, epochs: 8, schedule: 'step' });
  assert.equal(scheduledRate(train, 0), 0.1);
  assert.equal(scheduledRate(train, 2), 0.05);
  assert.ok(scheduledRate(cleanTrain({ learningRate: 0.1, epochs: 10, schedule: 'cosine' }), 10) < 1e-9);
});

/** The first Python found on PATH (no PyTorch needed: only the syntax is checked). */
function anyPython() {
  for (const name of process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python']) {
    const result = spawnSync(name, ['-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8' });
    if (result.status === 0 && result.stdout.trim() === '3') return name;
  }
  return null;
}

test('the generated PyTorch code of every sample model is valid Python, with a model class and a settings dictionary', () => {
  const python = anyPython();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytrainer-codegen-'));
  for (const entry of SAMPLE_MODELS) {
    const id = entry.label.replace('/', '_');
    const project = modelProject(entry);
    const data = fromSource(project.dataset.source, { sounds: soundsFor(project.dataset.source), overrides: { copies: 1, n: 60 } });
    const prepared = prepare(data, project.dataset.steps, project.dataset.split);
    const task = effectiveTask(prepared.task, project.model, prepared.inputShape);
    for (const hooks of [true, false]) {
      const { code, errors } = generatePytorch({ project, task, inputShape: prepared.inputShape, hooks });
      assert.deepEqual(errors, [], id);
      assert.match(code, /class Net\(nn\.Module\):/);
      assert.match(code, /CONFIG = \{/);
      assert.equal(code.includes('= mt.trace('), hooks, `${id}: hooks ${hooks}`);
      for (const node of project.model.nodes) if (node.type !== 'input' && !['activation', 'leakyRelu', 'flatten', 'add', 'concatenate', 'globalAvgPool2d', 'globalAvgPool1d', 'reshape', 'freqAvgPool', 'lastStep'].includes(node.type)) assert.ok(code.includes(`self.${node.name}`), `${id}: ${node.name}`);
      fs.writeFileSync(path.join(dir, `${id}_${hooks}.py`), code);
    }
  }
  if (python) {
    const check = spawnSync(python, ['-c', 'import ast, pathlib, sys\nfor f in sorted(pathlib.Path(sys.argv[1]).glob("*.py")):\n    ast.parse(f.read_text(encoding="utf-8"), str(f))\nprint("ok")', dir], { encoding: 'utf8' });
    assert.equal(check.stdout.trim(), 'ok', check.stderr);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('metrics: confusion matrix, per-class scores, regression errors', () => {
  const report = classificationReport(Float32Array.from([0.9, 0.1, 0.2, 0.8, 0.6, 0.4]), Float32Array.from([0, 1, 1]), 2, 2);
  assert.deepEqual(report.matrix, [[1, 0], [1, 1]]);
  assert.equal(report.accuracy, 2 / 3);
  assert.deepEqual(report.wrong, [2]);
  assert.equal(report.perClass[1].recall, 0.5);
  const sigmoid = classificationReport(Float32Array.from([0.7, 0.2]), Float32Array.from([1, 0]), 1, 2);
  assert.equal(sigmoid.accuracy, 1);
  const r = regressionReport(Float32Array.from([1, 2, 3]), Float32Array.from([1, 2, 5]));
  assert.ok(Math.abs(r.mae - 2 / 3) < 1e-9);
  assert.ok(r.r2 < 1);
});

test('the Python dictionary finds grammar, dictionary methods and PyTorch APIs', () => {
  assert.equal(searchDictionary('items')[0].label, 'items');
  assert.ok(searchDictionary('딕셔너리', 'ko').some((e) => e.kind === 'dict' || e.label === 'dict literal'));
  assert.equal(lookupWord('Linear', 'nn.').label, 'nn.Linear');
  assert.equal(lookupWord('relu', 'torch.').label, 'torch.relu');
  assert.equal(lookupWord('for').kind, 'syntax');
  assert.ok(PY_DICTIONARY.every((e) => e.ko && e.en && e.signature), 'every entry is described in both languages');
  for (const kind of ['syntax', 'dict', 'torch', 'nn', 'mt']) assert.ok(searchDictionary('', 'en', kind).length > 3, kind);
});

test('the Korean and English dictionaries have the same keys and placeholders', () => {
  assert.deepEqual(Object.keys(ko).sort(), Object.keys(en).sort());
  for (const key of Object.keys(ko)) {
    const names = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    assert.equal(names(ko[key]), names(en[key]), key);
  }
});

test('settings are clamped; recent files keep 10 without duplicates; undo / redo', () => {
  const s = normalizeSettings({ fontSize: 99, theme: 'dark', language: 'en', leftWidth: 5, animation: 'nope' });
  assert.equal(s.fontSize, 22);
  assert.equal(s.leftWidth, 200);
  assert.equal(s.animation, 'neural');
  let list = [];
  for (let i = 0; i < 12; i++) list = addRecent(list, { path: `C:/f${i}.mytrain` });
  list = addRecent(list, { path: 'c:/F5.mytrain' });
  assert.equal(list.length, 10);
  assert.equal(list.filter((item) => item.path.toLowerCase() === 'c:/f5.mytrain').length, 1);
  assert.equal(removeRecent(list, 'C:/F5.MYTRAIN').length, 9);
  const history = new History();
  history.reset({ v: 1 });
  history.push({ v: 2 });
  history.push({ v: 2 });
  history.push({ v: 3 });
  assert.deepEqual(history.undo(), { v: 2 });
  assert.deepEqual(history.undo(), { v: 1 });
  assert.equal(history.undo(), null);
  assert.deepEqual(history.redo(), { v: 2 });
});

test('a new installation resets the preferences once and keeps the user\'s data', () => {
  const store = new Map([['mytrainer.settings.v1', JSON.stringify({ language: 'en', theme: 'dark', pythonPath: 'C:/py.exe' })], ['mytrainer.recent.v1', '[]'], ['mytrainer.popup.x', '{}']]);
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k), key: (i) => [...store.keys()][i], get length() { return store.size; } };
  assert.equal(resetForNewInstall(storage, 'token-1'), true);
  assert.deepEqual(JSON.parse(store.get('mytrainer.settings.v1')), { language: 'en', pythonPath: 'C:/py.exe' });
  assert.ok(store.has('mytrainer.recent.v1'));
  assert.ok(!store.has('mytrainer.popup.x'));
  assert.equal(resetForNewInstall(storage, 'token-1'), false);
});
