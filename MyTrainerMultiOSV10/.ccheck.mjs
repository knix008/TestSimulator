// Trains each sample briefly (TF.js), exports C, compiles it with gcc and compares with TF.js.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as tf from '@tensorflow/tfjs';
import { Trainer } from './src/engine/trainer-core.js';
import { canonicalWeights } from './src/engine/tfbuild.js';
import { sampleProject, SAMPLE_IDS } from './src/domain/samples.js';
import { fromSource, sampleX } from './src/domain/datasets.js';
import { prepare, transformInput } from './src/domain/preprocess.js';
import { cleanTrain, effectiveTask } from './src/domain/project.js';
import { nodeById } from './src/domain/graph.js';
import { generateC } from './src/domain/export-c.js';
import { soundsFor } from './test/unit/sounds.mjs';
const ids = process.argv.slice(2).length ? process.argv.slice(2) : SAMPLE_IDS;
for (const id of ids) {
  try {
    const p = sampleProject(id, 'en');
    const data = fromSource(p.dataset.source, { sounds: soundsFor(p.dataset.source), overrides: { n: 200, copies: 1 } });
    const prep = prepare(data, p.dataset.steps, p.dataset.split);
    const task = effectiveTask(prep.task, p.model, prep.inputShape);
    const msgs = []; const t = new Trainer(tf, (m) => msgs.push(m));
    await t.handle({ type: 'build', graph: p.model, inputShape: prep.inputShape, task, train: cleanTrain({ ...p.train, epochs: 1 }) });
    await t.handle({ type: 'data', train: prep.train, val: prep.val, test: prep.test, kind: prep.kind, task, inputShape: prep.inputShape });
    await t.handle({ type: 'train' });
    await t.handle({ type: 'exportWeights' });
    const raw = msgs.find((m) => m.type === 'weights').weights;
    const weights = Object.fromEntries(Object.entries(raw).map(([nid, list]) => [nid, canonicalWeights(nodeById(p.model, nid).type, list)]));
    const rawX = Array.from(sampleX(data, 3));
    const x = transformInput(prep, rawX, data.inputShape);
    const expected = Array.from(await t.built.model.predict(tf.tensor(x, [1, ...prep.inputShape])).data());
    const { files, errors } = generateC({ project: p, prepared: prep, weights, rawShape: data.inputShape, labels: data.labels, task, example: { raw: rawX, expected } });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mtc-${id}-`));
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
    execFileSync('C:/Msys64/ucrt64/bin/gcc.exe', ['-O2', '-std=c99', '-Wall', '-Wextra', '-Wno-unused-parameter', 'example.c', 'model.c', '-lm', '-o', 'example.exe'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: `C:/Msys64/ucrt64/bin;${process.env.PATH}` } });
    let output = '';
    try { output = execFileSync(path.join(dir, 'example.exe'), { cwd: dir, input: '', env: { ...process.env, PATH: `C:/Msys64/ucrt64/bin;${process.env.PATH}` } }).toString(); } catch (e) { output = String(e.stdout ?? '') + ' EXIT ' + e.status; }
    const line = output.split('\n').find((l) => l.includes('largest difference')) ?? output.slice(-200);
    console.log(id.padEnd(16), errors.length ? 'ERRORS ' + errors.join('; ') : '', line.trim(), `${(fs.statSync(path.join(dir, 'model.c')).size / 1024).toFixed(0)}KB`);
    if (!process.env.KEEP) fs.rmSync(dir, { recursive: true, force: true }); else console.log('  kept', dir);
  } catch (error) { console.log(id.padEnd(16), 'FAILED', String(error.stderr ?? error.message).slice(0, 600)); }
}
