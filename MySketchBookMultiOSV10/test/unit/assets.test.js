// Asset library (library/, filled by `npm run assets`): the manifest, every file it names, the
// texture sets the material presets use, the HDRIs, the licence list, and the catalog/texture helpers.
// Run: node --test test/unit/assets.test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as THREE from 'three';
import { MATERIAL_PRESETS } from '../../src/engine/materials.js';
import { CATEGORIES } from '../../src/library/categories.js';
import { assetCatalogItems, guessPlacement, textureTint } from '../../src/library/assets.js';
import { ENVIRONMENTS } from '../../src/library/environments.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lib = path.join(root, 'library');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(lib, rel), 'utf8'));
const exists = (rel) => fs.existsSync(path.join(lib, rel));
const size = (rel) => fs.statSync(path.join(lib, rel)).size;
const categoryIds = new Set(CATEGORIES.map((c) => c.id));

const manifest = readJson('models/manifest.json');

test('model manifest: valid entries, files present, sizes sane', () => {
  assert.ok(Array.isArray(manifest));
  assert.ok(manifest.length >= 280 && manifest.length <= 400, `${manifest.length} models`);
  const ids = new Set();
  for (const e of manifest) {
    assert.ok(!ids.has(e.id), `duplicate ${e.id}`);
    ids.add(e.id);
    assert.ok(e.ko && e.en, `${e.id} names`);
    assert.match(e.ko, /[가-힣]/, `${e.id} has a Korean name`);
    assert.ok(categoryIds.has(e.category), `${e.id} category ${e.category}`);
    assert.ok(['floor', 'surface', 'wall', 'ceiling'].includes(e.placement), `${e.id} placement`);
    assert.equal(e.license, 'CC0');
    assert.ok(e.author, `${e.id} author`);
    assert.ok(Array.isArray(e.tags) && e.tags.length > 2, `${e.id} tags`);
    assert.ok(e.tags.some((t) => /[가-힣]/.test(t)) && e.tags.some((t) => /[a-z]/.test(t)), `${e.id} ko + en tags`);
    assert.ok(exists(`models/${e.file}`), `${e.file} exists`);
    assert.equal(size(`models/${e.file}`), e.bytes, `${e.id} bytes`);
    assert.ok(e.bytes < 15 * 1048576, `${e.id} is ${e.bytes} bytes`);
    assert.ok(exists(`models/${e.thumb}`) && size(`models/${e.thumb}`) > 1000, `${e.id} thumbnail`);
    assert.equal(e.size.length, 3);
    // Flat things (a watch, a hammer lying down) can be a few mm thin; nothing is a speck or a building.
    for (const v of e.size) assert.ok(v > 0.002 && v < 5, `${e.id} size ${e.size}`);
    assert.ok(Math.max(...e.size) > 0.03, `${e.id} size ${e.size}`);
    assert.ok(Number.isInteger(e.tris) && e.tris > 0 && e.tris < 300000, `${e.id} tris ${e.tris}`);
  }
  // Every library category that props belong to is represented.
  for (const id of ['living', 'dining', 'bedroom', 'storage', 'lighting', 'decor', 'kitchen', 'plants', 'appliances', 'office', 'kids', 'outdoor', 'bathroom']) {
    assert.ok(manifest.some((e) => e.category === id), `a model in ${id}`);
  }
});

test('model GLBs: valid glTF 2.0, bottom centre at the origin, bounds match the manifest', async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  for (const e of manifest) {
    const bytes = fs.readFileSync(path.join(lib, 'models', e.file));
    assert.equal(bytes.toString('latin1', 0, 4), 'glTF', e.id);
    const doc = await io.readBinary(new Uint8Array(bytes));
    const used = new Set(doc.getRoot().listExtensionsUsed().map((x) => x.extensionName));
    // GLTFLoader reads these natively; Draco/KTX2 would need decoders the app does not wire.
    for (const name of used) assert.ok(!['KHR_draco_mesh_compression', 'KHR_texture_basisu'].includes(name), `${e.id} uses ${name}`);
    for (const texture of doc.getRoot().listTextures()) {
      const s = texture.getSize();
      if (s) assert.ok(Math.max(...s) <= 1024, `${e.id} texture ${s}`);
    }
    const { min, max } = getBounds(doc.getRoot().getDefaultScene());
    const tol = 0.002;
    assert.ok(Math.abs(min[1]) < tol, `${e.id} bottom at y=0 (${min[1]})`);
    assert.ok(Math.abs((min[0] + max[0]) / 2) < tol && Math.abs((min[2] + max[2]) / 2) < tol, `${e.id} centred`);
    [max[0] - min[0], max[1] - min[1], max[2] - min[2]].forEach((v, i) => assert.ok(Math.abs(v - e.size[i]) < 0.005, `${e.id} size[${i}]`));
  }
});

test('material presets: every texture set exists with diff/nor/rough and an index entry', () => {
  const index = readJson('textures/index.json');
  const textured = MATERIAL_PRESETS.filter((p) => p.textures);
  assert.ok(textured.length >= 30, `${textured.length} textured presets`);
  for (const p of textured) {
    const info = index[p.textures];
    assert.ok(info, `${p.id} → ${p.textures} in index.json`);
    for (const map of ['diff', 'nor', 'rough']) {
      assert.ok(exists(`textures/${p.textures}/${map}.jpg`), `${p.textures}/${map}.jpg`);
      assert.ok(size(`textures/${p.textures}/${map}.jpg`) > 10000, `${p.textures}/${map}.jpg size`);
      assert.ok(info.maps.includes(map));
    }
    assert.match(info.avg, /^#[0-9a-f]{6}$/);
    assert.ok(info.size.length === 2 && info.size.every((v) => v > 0.05 && v < 10), `${p.textures} real size ${info.size}`);
    assert.ok(info.roughAvg > 0 && info.roughAvg <= 1);
  }
  // Floors, walls, woods and fabrics are covered.
  for (const category of ['wood', 'floor', 'fabric', 'leather', 'tile', 'wall', 'carpet']) {
    assert.ok(textured.some((p) => p.category === category), `a textured ${category} preset`);
  }
});

test('environments: HDRI files present (1k, and 2k for the main ones) with thumbnails', () => {
  assert.ok(ENVIRONMENTS.length >= 6 && ENVIRONMENTS.length <= 8);
  for (const kind of ['interior', 'exterior', 'studio']) assert.ok(ENVIRONMENTS.some((e) => e.kind === kind), kind);
  for (const env of ENVIRONMENTS) {
    assert.ok(env.ko && env.en);
    assert.ok(exists(env.file) && size(env.file) > 200000, env.file);
    assert.equal(fs.readFileSync(path.join(lib, env.file)).toString('latin1', 0, 2), '#?', `${env.file} is Radiance HDR`);
    if (env.main) assert.ok(exists(env.file2k) && size(env.file2k) > size(env.file), env.file2k);
    assert.ok(exists(env.thumb), env.thumb);
  }
  assert.ok(ENVIRONMENTS.filter((e) => e.main).length >= 2);
});

test('LICENSES.md lists every asset as CC0 with its Poly Haven URL', () => {
  const text = fs.readFileSync(path.join(lib, 'LICENSES.md'), 'utf8');
  assert.match(text, /CC0/);
  for (const e of manifest) assert.ok(text.includes(`https://polyhaven.com/a/${e.id}`), e.id);
  for (const set of new Set(MATERIAL_PRESETS.map((p) => p.textures).filter(Boolean))) assert.ok(text.includes(`https://polyhaven.com/a/${set}`), set);
  for (const env of ENVIRONMENTS) assert.ok(text.includes(`https://polyhaven.com/a/${env.polyhaven}`), env.id);
});

test('assetCatalogItems: CONTRACT entries with kind asset, unique kebab ids, thumbnails', () => {
  const items = assetCatalogItems(manifest);
  assert.equal(items.length, manifest.length);
  const ids = new Set(items.map((i) => i.id));
  assert.equal(ids.size, items.length);
  for (const item of items) {
    assert.match(item.id, /^asset-[a-z0-9-]+$/);
    assert.equal(item.kind, 'asset');
    assert.ok(categoryIds.has(item.category));
    assert.ok(['floor', 'surface', 'wall', 'ceiling'].includes(item.placement));
    assert.deepEqual(item.params, []);
    assert.ok(manifest.some((e) => e.id === item.asset));
    assert.match(item.thumb, /library\/models\/thumbs\/.+\.webp$/);
  }
  assert.equal(items.find((i) => i.asset === 'Chandelier_01')?.placement, 'ceiling');
  assert.equal(items.find((i) => i.asset === 'ornate_mirror_01')?.placement, 'wall');
});

test('guessPlacement: heuristics when the manifest has no placement', () => {
  assert.equal(guessPlacement({ category: 'lighting', tags: ['chandelier'], size: [0.8, 0.8, 0.8] }), 'ceiling');
  assert.equal(guessPlacement({ category: 'decor', tags: ['frame', 'painting'], size: [0.6, 0.8, 0.05] }), 'wall');
  assert.equal(guessPlacement({ category: 'decor', tags: ['frame', 'standing'], size: [0.2, 0.25, 0.1] }), 'surface');
  assert.equal(guessPlacement({ category: 'living', tags: ['sofa'], size: [2, 0.8, 0.9] }), 'floor');
  assert.equal(guessPlacement({ category: 'kitchen', tags: ['bowl'], size: [0.2, 0.1, 0.2] }), 'surface');
  assert.equal(guessPlacement({ placement: 'wall', size: [2, 2, 2] }), 'wall');
});

test('textureTint: preset colour ÷ texture average (linear), capped', () => {
  const tint = textureTint('#808080', '#808080');
  for (const c of tint.toArray()) assert.ok(Math.abs(c - 1) < 1e-6);
  const avg = new THREE.Color('#404040');
  const t = textureTint('#606060', '#404040');
  const target = new THREE.Color('#606060');
  assert.ok(Math.abs(t.r * avg.r - target.r) < 1e-6);
  assert.ok(textureTint('#ffffff', '#000000').r <= 4);
});
