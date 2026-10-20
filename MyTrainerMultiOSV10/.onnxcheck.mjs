// Trains each sample briefly (TF.js), exports ONNX and compares ONNX Runtime with TF.js.
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
import { generateOnnx } from './src/domain/export-onnx.js';
import { soundsFor } from './test/unit/sounds.mjs';
import { ensureVenvTts } from './scripts/venv-tts.mjs';

const RUNNER = 'C:/Users/shkwon/AppData/Local/Temp/claude/c--Home-Projects-TestSimulator-MyTrainerMultiOSV10/4a3311fe-e6d7-4eac-8c76-f231126536e4/scratchpad/ort_run.py';
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
    const x = Array.from(transformInput(prep, rawX, data.inputShape));
    const expected = Array.from(await t.built.model.predict(tf.tensor(x, [1, ...prep.inputShape])).data());
    const { bytes, errors } = generateOnnx({ project: p, prepared: prep, weights, rawShape: data.inputShape });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mto-${id}-`));
    fs.writeFileSync(path.join(dir, 'model.onnx'), bytes);
    fs.writeFileSync(path.join(dir, 'case.json'), JSON.stringify({ x: rawX, shape: [1, ...data.inputShape], expected }));
    let line = '';
    try {
      line = execFileSync(ensureVenvTts(['onnxruntime', 'numpy']), [RUNNER, dir], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    } catch (error) {
      line = `ORT ${String(error.stderr).split(/\r?\n/).filter(Boolean).slice(-2).join(' | ')}`;
    }
    console.log(id.padEnd(16), errors.length ? `ERRORS ${errors.join('; ')}` : '', line, `${(bytes.length / 1024).toFixed(0)}KB`);
    if (!process.env.KEEP) fs.rmSync(dir, { recursive: true, force: true }); else console.log('  kept', dir);
  } catch (error) {
    console.log(id.padEnd(16), 'FAILED', String(error.stderr ?? error.stack ?? error.message).slice(0, 600));
  }
}
