// The user's own library (domain/userlibrary.js): folder files grouped into models with their companions and
// sub-folders, stored metadata cleaned on load, and user categories placed before My objects.
// Run: node --test test/unit/userlibrary.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupFolderFiles, normalizeMeta } from '../../src/domain/userlibrary.js';
import { CATEGORIES, setUserCategories } from '../../src/library/categories.js';

const isModel = (n) => /\.(glb|gltf|obj|fbx|stl)$/i.test(n);

test('desktop folder: models with same-folder companions, first sub-folder as the group', () => {
  const root = 'C:\\Models\\Office';
  const files = [
    'C:\\Models\\Office\\chair.obj', 'C:\\Models\\Office\\chair.mtl', 'C:\\Models\\Office\\wood.png',
    'C:\\Models\\Office\\Lamps\\desk-lamp.glb', 'C:\\Models\\Office\\Lamps\\Pendants\\ring.fbx', 'C:\\Models\\Office\\Lamps\\Pendants\\ring.jpg',
    'C:\\Models\\Office\\Plants\\fern.gltf', 'C:\\Models\\Office\\Plants\\fern.bin',
  ].map((p) => ({ name: p.replace(/^.*\\/, ''), path: p }));
  const out = groupFolderFiles(files, isModel, root);
  const by = Object.fromEntries(out.map((e) => [e.file.name, e]));
  assert.deepEqual(Object.keys(by).sort(), ['chair.obj', 'desk-lamp.glb', 'fern.gltf', 'ring.fbx']);
  assert.equal(by['chair.obj'].folder, '');
  assert.deepEqual(by['chair.obj'].related.map((f) => f.name).sort(), ['chair.mtl', 'wood.png']);
  assert.equal(by['desk-lamp.glb'].folder, 'Lamps');
  assert.equal(by['ring.fbx'].folder, 'Lamps', 'deeper folders go with their first sub-folder');
  assert.deepEqual(by['ring.fbx'].related.map((f) => f.name), ['ring.jpg']);
  assert.deepEqual(by['fern.gltf'].related.map((f) => f.name), ['fern.bin']);
});

test('web folder (webkitRelativePath): the chosen folder is the first part of the path', () => {
  const files = ['Props/a.glb', 'Props/Kitchen/pot.obj', 'Props/Kitchen/pot.mtl'].map((p) => ({ name: p.replace(/^.*\//, ''), relativePath: p }));
  const out = groupFolderFiles(files, isModel);
  const by = Object.fromEntries(out.map((e) => [e.file.name, e]));
  assert.equal(by['a.glb'].folder, '');
  assert.equal(by['pot.obj'].folder, 'Kitchen');
  assert.deepEqual(by['pot.obj'].related.map((f) => f.name), ['pot.mtl']);
});

test('stored metadata is cleaned: bad entries dropped, defaults filled, unknown icons replaced', () => {
  const meta = normalizeMeta({ categories: [{ id: 'ucat-1', name: 'Shop', icon: 'nope' }, { name: 'no id' }], items: [{ id: 'ulib-1', name: 'Shelf' }, { id: 'x' }] });
  assert.deepEqual(meta.categories, [{ id: 'ucat-1', name: 'Shop', icon: 'libMine' }]);
  assert.equal(meta.items.length, 1);
  assert.deepEqual(meta.items[0], { id: 'ulib-1', name: 'Shelf', category: 'mine', size: [1, 1, 1], triangles: 0, source: '', placement: 'floor', folder: '' });
  assert.deepEqual(normalizeMeta(undefined), { categories: [], items: [] });
});

test('user categories go before My objects and replace the previous set', () => {
  const builtIn = CATEGORIES.length;
  setUserCategories([{ id: 'ucat-a', name: 'Shop', icon: 'libDecor' }, { id: 'ucat-b', name: 'Factory', icon: 'libMine' }]);
  assert.equal(CATEGORIES.length, builtIn + 2);
  const ids = CATEGORIES.map((c) => c.id);
  assert.deepEqual(ids.slice(-3), ['ucat-a', 'ucat-b', 'mine']);
  assert.equal(CATEGORIES.find((c) => c.id === 'ucat-a').ko, 'Shop');
  setUserCategories([{ id: 'ucat-c', name: 'Garden' }]);
  assert.deepEqual(CATEGORIES.map((c) => c.id).slice(-2), ['ucat-c', 'mine']);
  setUserCategories([]);
  assert.equal(CATEGORIES.length, builtIn);
});
