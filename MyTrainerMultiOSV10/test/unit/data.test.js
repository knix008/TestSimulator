// Datasets, CSV tables, preprocessing and the train / validation / test split.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classCounts, describeTable, featureStats, fromImages, fromTable, generate, GENERATOR_IDS, GENERATORS, parseCsv, sampleX } from '../../src/domain/datasets.js';
import { cleanSplit, newStep, prepare, splitIndices, STEP_IDS, stepApplies, targetsFor, transformInput } from '../../src/domain/preprocess.js';

const size = (shape) => shape.reduce((a, b) => a * b, 1);

for (const id of GENERATOR_IDS) {
  test(`generator ${id}: consistent sizes, same data for the same seed`, () => {
    const a = generate(id, { n: 120 });
    const b = generate(id, { n: 120 });
    assert.equal(a.x.length, a.n * size(a.inputShape));
    const ySize = a.task.kind === 'classification' ? 1 : size(a.task.outputShape);
    assert.equal(a.y.length, a.n * ySize);
    assert.deepEqual(Array.from(a.x.slice(0, 50)), Array.from(b.x.slice(0, 50)));
    assert.ok(a.x.every(Number.isFinite));
    if (a.task.kind === 'classification') {
      const counts = classCounts(a);
      assert.equal(counts.length, a.task.classes);
      assert.ok(counts.every((c) => c > 0), `every class present: ${counts}`);
      if (a.labels) assert.equal(a.labels.length, a.task.classes);
    }
    assert.equal(GENERATORS[id].group.length > 0, true);
  });
}

test('digit pictures stay within 0…1 and every digit differs from the others', () => {
  const data = generate('digits', { n: 20, noise: 0 });
  assert.ok(data.x.every((v) => v >= 0 && v <= 1));
  const means = Array.from({ length: 10 }, (_, d) => sampleX(data, d).reduce((s, v) => s + v, 0));
  assert.equal(new Set(means.map((m) => m.toFixed(2))).size, 10);
});

test('CSV: quotes, delimiters, header detection, text columns one-hot, missing values filled', () => {
  const { rows, delimiter } = parseCsv('a;b;color;y\n1;"2,5";red;yes\n3;;blue;no\n5;6;red;yes\n');
  assert.equal(delimiter, ';');
  assert.equal(rows[1][1], '2,5');
  const table = describeTable(rows);
  assert.deepEqual(table.header, ['a', 'b', 'color', 'y']);
  assert.equal(table.columns[2].numeric, false);
  const tsv = parseCsv('x\ty\n1\t2\n3\t4\n');
  assert.equal(tsv.delimiter, '\t');
  const iris = 'sepal,petal,species\n5.1,1.4,setosa\n7.0,4.7,versicolor\n6.3,6.0,virginica\n4.9,1.4,setosa\n';
  const data = fromTable(parseCsv(iris).rows, { target: 'species' });
  assert.equal(data.task.kind, 'classification');
  assert.equal(data.task.classes, 3);
  assert.deepEqual(data.labels, ['setosa', 'versicolor', 'virginica']);
  const reg = fromTable(parseCsv('x,y,c\n1,2.5,a\n2,,b\n3,7.25,a\n4,9.5,b\n5,1.5,a\n6,2,b\n7,3,a\n8,4,b\n9,5,a\n10,6,b\n11,7,a\n12,8,b\n13,9,a\n14,10,b\n15,11,a\n16,12,b\n17,13,a\n18,14,b\n19,15,a\n20,16,b\n21,17.5,a\n').rows, { target: 'x', task: 'regression' });
  assert.equal(reg.task.kind, 'regression');
  assert.equal(reg.inputShape[0], 3, 'y + one-hot c (a, b)');
  assert.ok(reg.x.every(Number.isFinite), 'the missing value got the column mean');
});

test('pictures become a classification dataset', () => {
  const items = [{ label: 'cat', pixels: new Float32Array(16).fill(0.2) }, { label: 'dog', pixels: new Float32Array(16).fill(0.8) }];
  const data = fromImages(items, { size: 4, channels: 1 });
  assert.deepEqual(data.inputShape, [4, 4, 1]);
  assert.deepEqual(data.labels, ['cat', 'dog']);
});

test('the split is stratified and covers every sample once', () => {
  const data = generate('blobs', { n: 400, classes: 4 });
  const parts = splitIndices(data, cleanSplit({ val: 0.2, test: 0.1 }));
  const all = [...parts.train, ...parts.val, ...parts.test].sort((a, b) => a - b);
  assert.deepEqual(all, Array.from({ length: 400 }, (_, i) => i));
  for (let c = 0; c < 4; c++) assert.equal(parts.val.filter((i) => data.y[i] === c).length, 20);
});

test('statistics are fitted on the training part only, and augmentation grows only the training part', () => {
  const data = generate('friedman', { n: 300 });
  const prepared = prepare(data, [newStep('standardize'), { ...newStep('noise'), params: { copies: 2, std: 0.01 } }], { val: 0.2, test: 0.2 });
  assert.equal(prepared.train.n, 180 * 3);
  assert.equal(prepared.val.n, 60);
  const stats = featureStats({ ...data, x: prepared.train.x.slice(0, 180 * 8), n: 180 });
  for (const st of stats) {
    assert.ok(Math.abs(st.mean) < 1e-4, 'training mean 0');
    assert.ok(Math.abs(st.std - 1) < 1e-3, 'training std 1');
  }
});

test('polynomial features and transformInput reproduce the prepared values', () => {
  const data = generate('circles', { n: 100 });
  const prepared = prepare(data, [newStep('polynomial'), newStep('standardize')], { val: 0.1, test: 0.1 });
  assert.deepEqual(prepared.inputShape, [5]);
  const index = prepared.train.index[0];
  const again = transformInput(prepared, sampleX(data, index), data.inputShape);
  assert.deepEqual(Array.from(again).map((v) => v.toFixed(4)), Array.from(prepared.train.x.slice(0, 5)).map((v) => v.toFixed(4)));
});

test('image steps apply to pictures only; reconstruction targets follow the input', () => {
  assert.equal(stepApplies('flipH', 'image'), true);
  assert.equal(stepApplies('flipH', 'vector'), false);
  for (const id of STEP_IDS) assert.equal(typeof stepApplies(id, 'image'), 'boolean');
  const data = generate('digitsAuto', { n: 60 });
  const prepared = prepare(data, [newStep('invert')], { val: 0.1, test: 0.1 });
  assert.deepEqual(Array.from(prepared.train.y.slice(0, 20)), Array.from(prepared.train.x.slice(0, 20)));
});

test('targets: one-hot for several classes, one column for a sigmoid output', () => {
  const part = { n: 3, y: Float32Array.from([0, 2, 1]) };
  assert.deepEqual(Array.from(targetsFor(part, { kind: 'classification', classes: 3, binaryOutput: 3 }).values), [1, 0, 0, 0, 0, 1, 0, 1, 0]);
  assert.deepEqual(targetsFor({ n: 2, y: Float32Array.from([1, 0]) }, { kind: 'classification', classes: 2, binaryOutput: 1 }).shape, [2, 1]);
});
