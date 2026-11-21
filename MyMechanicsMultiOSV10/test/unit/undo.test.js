// Undo / redo (document.js History: whole-project snapshots, as the app's change() → commit() and undo() /
// redo() use it). For every feature type (FEATURE_TYPES, built from the shared feature fixtures):
//   add → undo gives back the exact feature list and the geometry before; redo the one after;
//   editing a number → undo gives back the old value; delete → undo puts the feature back where it was.
// Plus the History mechanics themselves (labels, limits, branches, unchanged commits).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { FEATURE_TYPES, FEATURE_DEFAULTS, regenerate } from '../../src/cad/features.js';
import { History, createProject, createPart, createAssembly, addDrawing } from '../../src/cad/document.js';
import { fixtureOf } from '../fixtures/feature-fixtures.js';

await loadKernel();
const R = rep();
const json = (v) => JSON.stringify(v);
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
/** Volume of the part's body (null when there is none). */
const volumeOf = (project) => { const part = project.parts[0]; const body = regenerate(part, { project }).body; return body ? R.measureVolume(body) : null; };
const sameVolume = (a, b) => { if (a == null || b == null) assert.equal(a, b); else near(a, b); };

/**
 * A project whose part holds the fixture's base, committed ('base'), then the feature added ('add').
 * Returns the history, the snapshots' feature lists and volumes, and the added feature.
 */
function scenario(type) {
  const project = createProject({ name: type });
  const part = project.parts[0];
  part.id = 'p';
  project.active = { kind: 'part', id: 'p' };
  const f = fixtureOf(type).make(part, {});
  const h = new History(project);
  const base = { features: json(part.features), volume: volumeOf(project) };
  part.features.push(f);
  assert.equal(h.commit(project, `add ${type}`), true, 'the add is recorded');
  const added = { features: json(part.features), volume: volumeOf(project) };
  return { project, h, f, base, added };
}

const cache = new Map();
const once = (type) => { if (!cache.has(type)) cache.set(type, scenario(type)); return cache.get(type); };
/** A numeric setting of the type (its defaults), to edit. */
const numericKey = (type, f) => Object.keys(FEATURE_DEFAULTS[type]?.() ?? {}).find((k) => typeof f[k] === 'number' && Number.isFinite(f[k]));

for (const type of FEATURE_TYPES) {
  test(`${type}: add → undo gives back the exact feature list`, () => {
    const { h, base } = once(type);
    const back = h.undo();
    assert.ok(back, 'something to undo');
    assert.equal(json(back.project.parts[0].features), base.features);
    h.redo();
  });
  test(`${type}: add → undo gives back the geometry before`, () => {
    const { h, base } = once(type);
    const back = h.undo();
    sameVolume(volumeOf(back.project), base.volume);
    h.redo();
  });
  test(`${type}: undo → redo gives back the feature and the geometry after`, () => {
    const { h, added, f } = once(type);
    h.undo();
    const again = h.redo();
    assert.ok(again, 'something to redo');
    const features = again.project.parts[0].features;
    assert.equal(json(features), added.features);
    assert.equal(features.at(-1).id, f.id);
    sameVolume(volumeOf(again.project), added.volume);
  });
  test(`${type}: the undo label names the change`, () => {
    const { h } = once(type);
    assert.equal(h.undoLabel, `add ${type}`);
    const back = h.undo();
    assert.equal(back.label, `add ${type}`);
    assert.equal(h.redoLabel, `add ${type}`);
    h.redo();
  });
  test(`${type}: editing a setting → undo gives back the old value`, () => {
    const { project, h, f } = once(type);
    const live = project.parts[0].features.find((x) => x.id === f.id);
    const key = numericKey(type, live);
    const field = key ?? 'name';
    const old = live[field];
    live[field] = key ? old + 1.5 : `${old} (edited)`;
    assert.equal(h.commit(project, 'edit'), true, `the edit of ${field} is recorded`);
    const back = h.undo();
    assert.equal(back.project.parts[0].features.find((x) => x.id === f.id)[field], old, field);
    const again = h.redo();
    assert.equal(again.project.parts[0].features.find((x) => x.id === f.id)[field], live[field], `${field} after redo`);
    h.undo(); live[field] = old; // back to the 'add' state (history and live project) for the other tests
    assert.equal(h.undoLabel, `add ${type}`);
  });
  test(`${type}: delete → undo puts the feature back in its place`, () => {
    const { project, h, f, added } = once(type);
    const snapshot = JSON.parse(added.features);
    const features = project.parts[0].features;
    features.splice(0, features.length, ...JSON.parse(added.features));
    const index = features.findIndex((x) => x.id === f.id);
    features.splice(index, 1);
    assert.equal(h.commit(project, 'delete'), true, 'the delete is recorded');
    assert.equal(features.some((x) => x.id === f.id), false);
    const back = h.undo();
    const list = back.project.parts[0].features;
    assert.equal(list.findIndex((x) => x.id === f.id), index);
    assert.equal(json(list), json(snapshot));
  });
}

// ───────────────────────── History mechanics

const tiny = () => { const p = createProject({ name: 'H' }); p.parts[0].id = 'p'; p.active = { kind: 'part', id: 'p' }; return p; };

test('a new history has nothing to undo or redo and empty labels', () => {
  const h = new History(tiny());
  assert.equal(h.canUndo, false); assert.equal(h.canRedo, false);
  assert.equal(h.undoLabel, ''); assert.equal(h.redoLabel, '');
  assert.equal(h.undo(), null); assert.equal(h.redo(), null);
});

test('a commit without a change is ignored', () => {
  const p = tiny(); const h = new History(p);
  assert.equal(h.commit(p, 'nothing'), false);
  assert.equal(h.canUndo, false);
});

test('undo returns a copy: changing it does not change the history', () => {
  const p = tiny(); const h = new History(p);
  p.name = 'B'; h.commit(p, 'rename');
  const back = h.undo();
  back.project.name = 'tampered';
  assert.equal(h.redo().project.name, 'B');
  assert.equal(h.undo().project.name, 'H');
});

test('several steps undo in reverse order and redo forward', () => {
  const p = tiny(); const h = new History(p);
  for (const n of ['A', 'B', 'C']) { p.name = n; h.commit(p, `to ${n}`); }
  assert.deepEqual([h.undo(), h.undo(), h.undo()].map((r) => r.project.name), ['B', 'A', 'H']);
  assert.equal(h.undo(), null);
  assert.deepEqual([h.redo(), h.redo(), h.redo()].map((r) => r.project.name), ['A', 'B', 'C']);
  assert.equal(h.redo(), null);
});

test('labels: undo names the last change, redo the next one', () => {
  const p = tiny(); const h = new History(p);
  p.name = 'A'; h.commit(p, 'first');
  p.name = 'B'; h.commit(p, 'second');
  assert.equal(h.undoLabel, 'second');
  assert.equal(h.undo().label, 'second');
  assert.equal(h.undoLabel, 'first');
  assert.equal(h.redoLabel, 'second');
  assert.equal(h.redo().label, 'second');
});

test('a new change after undo drops the redo branch', () => {
  const p = tiny(); const h = new History(p);
  p.name = 'A'; h.commit(p, 'a');
  p.name = 'B'; h.commit(p, 'b');
  const back = h.undo();
  back.project.name = 'C';
  h.commit(back.project, 'c');
  assert.equal(h.canRedo, false);
  assert.equal(h.undo().project.name, 'A');
});

test('the history keeps at most its limit of states, dropping the oldest', () => {
  const p = tiny(); const h = new History(p, 5);
  for (let i = 0; i < 12; i++) { p.name = `N${i}`; h.commit(p, `n${i}`); }
  let steps = 0;
  let last = null;
  while (h.canUndo) { last = h.undo(); steps += 1; }
  assert.equal(steps, 4);
  assert.equal(last.project.name, 'N7');
});

test('the default limit is 150 states', () => {
  const p = tiny(); const h = new History(p);
  for (let i = 0; i < 200; i++) { p.name = `N${i}`; h.commit(p, 'x'); }
  let steps = 0;
  while (h.canUndo) { h.undo(); steps += 1; }
  assert.equal(steps, 149);
});

test('undo restores a part material change', () => {
  const p = tiny(); const h = new History(p);
  const before = p.parts[0].material;
  p.parts[0].material = 'aluminum-6061'; h.commit(p, 'material');
  assert.equal(h.undo().project.parts[0].material, before);
});

test('undo restores a removed part, assembly and drawing', () => {
  const p = tiny();
  p.parts.push(createPart('Second'));
  p.assemblies.push(createAssembly('A'));
  addDrawing(p, { kind: 'part', id: 'p' }, 'D');
  const h = new History(p);
  const before = json(p);
  p.parts.pop(); p.assemblies.pop(); p.drawings.pop();
  h.commit(p, 'remove');
  assert.equal(json(h.undo().project), before);
});

test('undo restores an assembly component move and a mate value', () => {
  const p = tiny();
  const a = createAssembly('A');
  a.components.push({ id: 'c1', part: 'p', position: [0, 0, 0], rotation: [0, 0, 0, 1], fixed: false });
  a.mates.push({ id: 'm', type: 'distance', value: 5, a: { comp: 'c1' }, b: { comp: 'c1' } });
  p.assemblies.push(a);
  const h = new History(p);
  a.components[0].position = [10, 20, 30]; h.commit(p, 'move');
  a.mates[0].value = 12; h.commit(p, 'mate');
  const one = h.undo().project.assemblies[0];
  assert.equal(one.mates[0].value, 5); assert.deepEqual(one.components[0].position, [10, 20, 30]);
  const two = h.undo().project.assemblies[0];
  assert.deepEqual(two.components[0].position, [0, 0, 0]);
});

test('undo restores the active document after a tab switch committed with a change', () => {
  const p = tiny();
  const second = createPart('Second'); p.parts.push(second);
  const h = new History(p);
  p.active = { kind: 'part', id: second.id }; second.name = 'Renamed';
  h.commit(p, 'rename');
  const back = h.undo().project;
  assert.deepEqual(back.active, { kind: 'part', id: 'p' });
  assert.equal(back.parts[1].name, 'Second');
});

test('undo restores a feature reorder and a rollback position', () => {
  const p = tiny();
  p.parts[0].features = [{ id: 'a', type: 'sketch' }, { id: 'b', type: 'extrude' }, { id: 'c', type: 'fillet' }];
  const h = new History(p);
  p.parts[0].features.reverse(); p.parts[0].rollback = 'b';
  h.commit(p, 'reorder');
  const back = h.undo().project.parts[0];
  assert.deepEqual(back.features.map((f) => f.id), ['a', 'b', 'c']);
  assert.equal(back.rollback, null);
});

test('undo restores a suppressed feature', () => {
  const p = tiny();
  p.parts[0].features = [{ id: 'a', type: 'sketch' }];
  const h = new History(p);
  p.parts[0].features[0].suppressed = true; h.commit(p, 'suppress');
  assert.equal(h.undo().project.parts[0].features[0].suppressed, undefined);
  assert.equal(h.redo().project.parts[0].features[0].suppressed, true);
});
