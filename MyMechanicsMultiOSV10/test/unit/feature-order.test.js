// Feature order and folders (feature-order.js): a feature moved before another (its own sketch with it), a move
// refused when a feature would come before what it refers to, folders of adjacent features.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createSketchGeometry, addRectangle, addCircle } from '../../src/cad/sketch.js';
import { moveFeature, checkOrder, makeFolder, moveIntoFolder, dissolveFolder, folderOf } from '../../src/cad/feature-order.js';

await loadKernel();
const R = rep();
let n = 0; const newId = () => `g${++n}`;

function part() {
  const p = { id: 'p', name: 'P', features: [] };
  const s1 = createFeature(p, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addRectangle(s1, -20, -20, 20, 20); p.features.push(s1);
  const e1 = createFeature(p, 'extrude', { sketch: s1.id, depth: 10 }); p.features.push(e1);
  const s2 = createFeature(p, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addCircle(s2, 0, 0, 5); p.features.push(s2);
  const cut = createFeature(p, 'extrude', { sketch: s2.id, depth: 10, op: 'cut' }); p.features.push(cut);
  const s3 = createFeature(p, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addCircle(s3, 15, 15, 2); p.features.push(s3);
  const boss = createFeature(p, 'extrude', { sketch: s3.id, depth: 20 }); p.features.push(boss);
  return { p, s1, e1, s2, cut, s3, boss };
}

test('a feature moves with its own sketch; the model is rebuilt in the new order', () => {
  const { p, e1, cut, s3, boss } = part();
  const v0 = R.measureVolume(regenerate(p).body);
  // The boss (its sketch with it) before the cut: the hole now goes through the boss too where they overlap? (no: apart) — volume the same.
  const r = moveFeature(p, boss.id, cut.id);
  assert.ok(r.ok, JSON.stringify(r));
  assert.deepEqual(p.features.map((f) => f.id).slice(2, 4), [s3.id, boss.id]);
  assert.ok(Math.abs(R.measureVolume(regenerate(p).body) - v0) < 1e-6);
  assert.ok(checkOrder(p.features).ok);
  void e1;
});

test('a move that puts a feature before what it refers to is refused, the order unchanged', () => {
  const { p, e1, s1 } = part();
  const before = p.features.map((f) => f.id);
  // A fillet on the base's edges refers to nothing by id, but a pattern of the cut seeds it: move the pattern first.
  const pat = createFeature(p, 'linearPattern', { seeds: [p.features[3].id], count: 2, spacing: 10 }); p.features.push(pat);
  const r = moveFeature(p, pat.id, s1.id);
  assert.equal(r.ok, false); assert.equal(r.reason, 'dependency');
  assert.deepEqual(p.features.map((f) => f.id), [...before, pat.id]);
  void e1;
});

test('folders: adjacent features only; dropping a feature on a folder moves it to the folder\'s end; dissolve', () => {
  const { p, e1, cut, boss } = part();
  assert.equal(makeFolder(p, [e1.id, boss.id], 'Gap', newId), null);
  const g = makeFolder(p, [e1.id, cut.id], 'Body', newId);
  assert.ok(g);
  assert.equal(g.members.length, 4); // the two features and their sketches
  assert.ok(moveIntoFolder(p, boss.id, g.id).ok);
  assert.equal(folderOf(p, boss.id)?.id, g.id);
  assert.equal(p.folders[0].members.at(-1), boss.id);
  dissolveFolder(p, g.id);
  assert.equal(p.folders, undefined);
});
