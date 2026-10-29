// The layer catalogue and the model graph: shape inference, parameter counts (checked against
// TensorFlow.js itself), editing operations, validation and repair of files.
import { soundsFor } from './sounds.mjs';
import { modelProject, SAMPLE_MODELS } from './models.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as tf from '@tensorflow/tfjs';
import { buildTfModel } from '../../src/engine/tfbuild.js';
import {
  addBlock, addNode, addResidual, canConnect, chain, cleanName, connect, duplicateNodes, emptyModel, inferShapes, insertAfter, insertBefore,
  layoutModel, normalizeModel, outputNodes, removeNodes, replaceType, setParam, topoOrder, totalParams, validateModel,
} from '../../src/domain/graph.js';
import { BLOCK_IDS, convLength, defaultParams, LAYER_GROUPS, LAYER_TYPES, LAYERS, parseShape } from '../../src/domain/layers.js';
import { SAMPLE_IDS, sampleProject } from '../../src/domain/samples.js';
import { fromSource, generate } from '../../src/domain/datasets.js';
import { prepare } from '../../src/domain/preprocess.js';
import { effectiveTask } from '../../src/domain/project.js';

test('every layer type is in exactly one palette group and has valid defaults', () => {
  const grouped = LAYER_GROUPS.flatMap(([, types]) => types);
  assert.deepEqual([...grouped].sort(), [...LAYER_TYPES].sort());
  assert.equal(new Set(grouped).size, grouped.length);
  for (const type of LAYER_TYPES) {
    const params = defaultParams(type);
    for (const param of LAYERS[type].params) assert.ok(param.key in params, `${type}.${param.key}`);
  }
});

test('convolution output lengths follow Keras', () => {
  assert.equal(convLength(16, 3, 1, 'valid'), 14);
  assert.equal(convLength(16, 3, 1, 'same'), 16);
  assert.equal(convLength(16, 3, 2, 'same'), 8);
  assert.equal(convLength(15, 2, 2, 'valid'), 7);
  assert.deepEqual(parseShape('28, 28 ,1'), [28, 28, 1]);
  assert.deepEqual(parseShape('4x4'), [4, 4]);
  assert.equal(parseShape('a, 2'), null);
});

for (const entry of SAMPLE_MODELS) {
  test(`sample ${entry.label}: valid, and its parameter count equals TensorFlow.js's`, () => {
    const project = modelProject(entry);
    const data = fromSource(project.dataset.source, { sounds: soundsFor(project.dataset.source), overrides: { copies: 1, n: 120 } });
    const prepared = prepare(data, project.dataset.steps, project.dataset.split);
    const task = effectiveTask(prepared.task, project.model, prepared.inputShape);
    const problems = validateModel(project.model, task);
    assert.deepEqual(problems.filter((p) => p.level === 'error'), []);
    const shapes = inferShapes(project.model, prepared.inputShape);
    const { model } = buildTfModel(tf, project.model, prepared.inputShape);
    assert.equal(totalParams(shapes).total, model.countParams());
    const out = outputNodes(project.model)[0];
    assert.deepEqual(shapes.get(out.id).shape, model.outputs[0].shape.slice(1));
    model.dispose();
  });
}

test('shape errors name the problem', () => {
  const model = chain([['input', { shape: '8' }], ['conv2d', {}]]);
  const shapes = inferShapes(model);
  assert.equal(shapes.get(model.nodes[1].id).error.code, 'shape.needImage');
  const merged = emptyModel();
  const input = addNode(merged, 'input', { shape: '4' });
  const a = addNode(merged, 'dense', { units: 3 });
  const add = addNode(merged, 'add');
  connect(merged, input.id, a.id);
  connect(merged, a.id, add.id);
  connect(merged, input.id, add.id);
  assert.equal(inferShapes(merged).get(add.id).error.code, 'shape.sameShapes');
});

test('connections refuse loops, self loops and inputs into an input layer; a single-input layer keeps one input', () => {
  const model = chain([['input', { shape: '2' }], ['dense', {}], ['dense', {}]]);
  const [input, d1, d2] = model.nodes;
  assert.equal(canConnect(model, d2.id, d1.id).code, 'edit.cycle');
  assert.equal(canConnect(model, d1.id, d1.id).code, 'edit.selfLoop');
  assert.equal(canConnect(model, d1.id, input.id).code, 'edit.inputHasNoInput');
  connect(model, input.id, d2.id);
  assert.equal(model.edges.filter((e) => e.to === d2.id).length, 1, 'replaced, not added');
  assert.deepEqual(topoOrder(model).slice(0, 1), [input.id]);
});

test('insert, remove (bridged), replace, duplicate', () => {
  const model = chain([['input', { shape: '2' }], ['dense', { units: 8 }], ['dense', { units: 2, activation: 'softmax' }]]);
  const [input, hidden, out] = model.nodes;
  const drop = insertAfter(model, hidden.id, 'dropout');
  assert.deepEqual(topoOrder(model), [input.id, hidden.id, drop.id, out.id]);
  const norm = insertBefore(model, hidden.id, 'batchNorm');
  assert.deepEqual(topoOrder(model), [input.id, norm.id, hidden.id, drop.id, out.id]);
  removeNodes(model, [drop.id]);
  assert.ok(model.edges.some((e) => e.from === hidden.id && e.to === out.id), 'the chain is bridged');
  replaceType(model, hidden.id, 'leakyRelu');
  assert.equal(model.nodes.find((n) => n.id === hidden.id).type, 'leakyRelu');
  const [copy] = duplicateNodes(model, [out.id]);
  assert.equal(copy.type, 'dense');
  assert.equal(copy.params.units, 2);
  assert.notEqual(copy.name, out.name);
});

test('a residual connection adds an Add after the layer, fed by its input and output', () => {
  const model = chain([['input', { shape: '2' }], ['dense', { units: 16 }], ['dense', { units: 16 }], ['dense', { units: 3, activation: 'softmax' }]]);
  const shapes = inferShapes(model);
  const [, , second] = model.nodes;
  const result = addResidual(model, second.id, second.id, shapes);
  assert.ok(result.ok);
  assert.equal(inferShapes(model).get(result.node.id).error, null);
  const bad = chain([['input', { shape: '2' }], ['dense', { units: 16 }]]);
  assert.equal(addResidual(bad, bad.nodes[1].id, bad.nodes[1].id, inferShapes(bad)).code, 'edit.residualShape');
});

test('blocks drop as wired chains', () => {
  for (const id of BLOCK_IDS) {
    const model = chain([['input', { shape: '16,16,1' }]]);
    const nodes = addBlock(model, id, model.nodes[0].id);
    assert.ok(nodes.length >= 2, id);
    topoOrder(model);
  }
});

test('validation: missing input, several outputs, wrong output shape, missing softmax', () => {
  assert.ok(validateModel(emptyModel()).some((p) => p.code === 'valid.empty'));
  const model = chain([['input', { shape: '2' }], ['dense', { units: 4 }]]);
  addNode(model, 'dense');
  connect(model, model.nodes[0].id, model.nodes[2].id);
  assert.ok(validateModel(model).some((p) => p.code === 'valid.manyOutputs'));
  const single = chain([['input', { shape: '2' }], ['dense', { units: 4, activation: 'relu' }]]);
  const problems = validateModel(single, { kind: 'classification', classes: 3, inputShape: [2] });
  assert.ok(problems.some((p) => p.code === 'valid.outputShape'));
  assert.ok(problems.some((p) => p.code === 'valid.wantSoftmax'));
});

test('names stay valid, unique Python identifiers', () => {
  const model = chain([['input', { shape: '2' }], ['dense', {}]]);
  assert.equal(cleanName(model, '1st layer'), 'l_1st_layer');
  assert.equal(cleanName(model, 'class'), 'class_');
  assert.equal(cleanName(model, 'self'), 'self_');
  assert.equal(cleanName(model, model.nodes[1].name), `${model.nodes[1].name}_2`);
  assert.equal(setParam(model, model.nodes[1].id, 'units', 99999), true);
  assert.equal(model.nodes[1].params.units, LAYERS.dense.params[0].max);
});

test('a damaged model from a file is repaired', () => {
  const model = normalizeModel({ nodes: [{ id: 'a', type: 'input', params: { shape: '3' } }, { id: 'b', type: 'nope' }, { id: 'c', type: 'dense', params: { units: 'x' }, name: 'class' }, { id: 'c', type: 'dense' }], edges: [{ from: 'a', to: 'c' }, { from: 'a', to: 'zz' }, { from: 'c', to: 'c' }] });
  assert.equal(model.nodes.length, 2);
  assert.equal(model.edges.length, 1);
  assert.equal(model.nodes[1].params.units, 16);
  assert.equal(model.nodes[1].name, 'class_');
});

test('auto layout puts every layer below its inputs', () => {
  const project = sampleProject('residual', 'en');
  layoutModel(project.model);
  for (const edge of project.model.edges) {
    const from = project.model.nodes.find((n) => n.id === edge.from);
    const to = project.model.nodes.find((n) => n.id === edge.to);
    assert.ok(to.y > from.y);
  }
});
