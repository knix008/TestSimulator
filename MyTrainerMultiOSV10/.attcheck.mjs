// The attention / depthwise / BC-ResNet explanations agree with TensorFlow.js.
import * as tf from '@tensorflow/tfjs';
import { Trainer } from './src/engine/trainer-core.js';
import { sampleProject } from './src/domain/samples.js';
import { fromSource } from './src/domain/datasets.js';
import { prepare } from './src/domain/preprocess.js';
import { cleanTrain, effectiveTask } from './src/domain/project.js';
import { topoOrder, nodeById } from './src/domain/graph.js';
import { explainUnit, unitsOf } from './src/engine/internals.js';
for (const id of process.argv.slice(2)) {
  const p = sampleProject(id, 'en');
  const data = fromSource(p.dataset.source, { overrides: { n: 300 } });
  const prep = prepare(data, p.dataset.steps, p.dataset.split);
  const task = effectiveTask(prep.task, p.model, prep.inputShape);
  const msgs = []; const t = new Trainer(tf, (m) => msgs.push(m));
  await t.handle({ type: 'build', graph: p.model, inputShape: prep.inputShape, task, train: cleanTrain({ ...p.train, epochs: 1 }) });
  await t.handle({ type: 'data', train: prep.train, val: prep.val, test: prep.test, kind: prep.kind, task, inputShape: prep.inputShape });
  await t.handle({ type: 'train' });
  const snap = msgs.filter((m) => m.type === 'snapshot').at(-1);
  const ctx = { ...snap, vocab: data.vocab, inputNodeId: p.model.nodes.find((n) => n.type === 'input').id };
  const bad = []; let checked = 0;
  for (const nid of topoOrder(p.model)) {
    const node = nodeById(p.model, nid); const act = snap.nodes[nid]?.act;
    if (!act?.data || node.type === 'input') continue;
    const positions = act.shape.length === 3 ? [{ row: 0, col: 0 }, { row: act.shape[0] - 1, col: act.shape[1] - 1 }] : act.shape.length === 2 ? [{ t: 0 }, { t: act.shape[0] - 1 }] : [{}];
    for (let u = 0; u < Math.min(unitsOf(act.shape), 4); u++) for (const pos of positions) {
      const e = explainUnit(p.model, ctx, nid, u, pos);
      if (!e || e.kind === 'value' || e.a == null || e.actual == null) continue;
      checked++;
      if (Math.abs(e.a - e.actual) > 2e-3 * Math.max(1, Math.abs(e.actual))) bad.push(`${node.name}(${node.type}) u${u} ${JSON.stringify(pos)} ${e.a} vs ${e.actual}`);
    }
  }
  console.log(id, 'checked', checked, bad.length ? 'MISMATCH\n  ' + bad.slice(0, 8).join('\n  ') : 'all match');
}
