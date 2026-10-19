import * as tf from '@tensorflow/tfjs';
import { Trainer } from './src/engine/trainer-core.js';
import { sampleProject } from './src/domain/samples.js';
import { fromSource } from './src/domain/datasets.js';
import { prepare } from './src/domain/preprocess.js';
import { cleanTrain, effectiveTask } from './src/domain/project.js';
import { validateModel, inferShapes, totalParams } from './src/domain/graph.js';
for (const id of process.argv.slice(2)) {
  const p = sampleProject(id, 'en');
  const data = fromSource(p.dataset.source, { overrides: { n: 600 } });
  const prep = prepare(data, p.dataset.steps, p.dataset.split);
  const task = effectiveTask(prep.task, p.model, prep.inputShape);
  const problems = validateModel(p.model, task).filter((x) => x.level === 'error');
  const msgs = []; const t = new Trainer(tf, (m) => msgs.push(m));
  await t.handle({ type: 'build', graph: p.model, inputShape: prep.inputShape, task, train: cleanTrain({ ...p.train, epochs: 2 }) });
  await t.handle({ type: 'data', train: prep.train, val: prep.val, test: prep.test, kind: prep.kind, task, inputShape: prep.inputShape });
  const t0 = Date.now();
  await t.handle({ type: 'train' });
  const err = msgs.find((m) => m.type === 'error'); const done = msgs.find((m) => m.type === 'done');
  const built = msgs.find((m) => m.type === 'built');
  console.log(id, JSON.stringify(problems.map((x) => x.code)), err ? 'ERROR ' + err.message : '', done ? `loss ${done.history.at(-1).loss.toFixed(3)} acc ${done.history.at(-1).acc?.toFixed(3)}` : '', 'params', built?.params, totalParams(inferShapes(p.model, prep.inputShape)).total, `${Date.now() - t0}ms`);
}
