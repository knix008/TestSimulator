// Metal, glass, ceramic, plant and "other" material presets (src/engine/materials-hard.js):
// valid values, unique ids, texture sets / procedural patterns that exist, and at least 110 per category.
// Run: node --test test/unit/materials-hard.test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { HARD_PRESETS } from '../../src/engine/materials-hard.js';
import { MATERIAL_CATEGORIES, MATERIAL_PRESETS, getMaterial, presetOf } from '../../src/engine/materials.js';
import { validatePattern } from '../../src/engine/patterns.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MINE = ['metal', 'glass', 'ceramic', 'plant', 'other'];
const HEX = /^#[0-9a-f]{6}$/i;
const unit = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

test('every hard preset is merged into MATERIAL_PRESETS and belongs to one of its categories', () => {
  const all = new Set(MATERIAL_PRESETS);
  const categories = new Set(MATERIAL_CATEGORIES.map((c) => c.id));
  for (const p of HARD_PRESETS) {
    assert.ok(all.has(p), `${p.id} merged`);
    assert.ok(MINE.includes(p.category) && categories.has(p.category), `${p.id} category ${p.category}`);
    assert.equal(presetOf(p.id), p, `${p.id} found by id`);
  }
});

test('preset ids are unique across all presets', () => {
  const seen = new Map();
  for (const p of MATERIAL_PRESETS) {
    assert.match(p.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `id ${p.id}`);
    assert.ok(!seen.has(p.id), `duplicate id ${p.id}`);
    seen.set(p.id, p);
  }
});

test('at least 110 presets in each of metal, glass, ceramic, plant and other', () => {
  for (const category of MINE) {
    const count = MATERIAL_PRESETS.filter((p) => p.category === category).length;
    assert.ok(count >= 110, `${category}: ${count}`);
  }
});

test('names, colours and physical values are sensible', () => {
  const names = new Map();
  for (const p of HARD_PRESETS) {
    assert.ok(typeof p.ko === 'string' && p.ko.trim() && /[가-힣]/.test(p.ko), `${p.id} Korean name`);
    assert.ok(typeof p.en === 'string' && p.en.trim() && /^[\x20-\x7e]+$/.test(p.en), `${p.id} English name`);
    const key = `${p.category}|${p.en.toLowerCase()}`;
    assert.ok(!names.has(key), `${p.id} repeats the English name of ${names.get(key)}`);
    names.set(key, p.id);
    assert.match(p.color, HEX, `${p.id} colour`);
    assert.ok(unit(p.roughness), `${p.id} roughness`);
    assert.ok(unit(p.metalness), `${p.id} metalness`);
    assert.ok(p.repeat > 0 && p.repeat <= 10, `${p.id} repeat`);
    for (const key of ['sheen', 'clearcoat', 'clearcoatRoughness', 'transmission', 'opacity']) if (key in p) assert.ok(unit(p[key]), `${p.id} ${key}`);
    if ('ior' in p) assert.ok(p.ior >= 1 && p.ior <= 2.4, `${p.id} ior`);
    if ('thickness' in p) assert.ok(p.thickness > 0 && p.thickness <= 0.2, `${p.id} thickness`);
    if ('textureSize' in p) assert.ok(p.textureSize > 0.05 && p.textureSize <= 5, `${p.id} textureSize`);
    if ('emissive' in p) { assert.match(p.emissive, HEX, `${p.id} emissive`); assert.ok(p.emissiveIntensity > 0 && p.emissiveIntensity <= 10, `${p.id} emissiveIntensity`); }
    if ('sheenColor' in p) assert.match(p.sheenColor, HEX, `${p.id} sheenColor`);
    if ('side' in p) assert.equal(p.side, 'double', `${p.id} side`);
    if (p.transparent) assert.ok(p.opacity > 0 && p.opacity < 1, `${p.id} transparent needs an opacity`);
  }
});

test('category physics: metals are metallic, glazes have a clear coat, lights glow', () => {
  const metals = HARD_PRESETS.filter((p) => p.category === 'metal' && p.metalness === 1);
  assert.ok(metals.length >= 80, `${metals.length} true metals`);
  for (const p of metals) assert.ok(p.roughness <= 0.75, `${p.id} metal roughness`);
  const mirrors = HARD_PRESETS.filter((p) => p.id.startsWith('mirror-'));
  assert.ok(mirrors.length >= 8);
  for (const p of mirrors) assert.ok(p.metalness === 1 && p.roughness <= 0.25, p.id);
  const glass = HARD_PRESETS.filter((p) => p.category === 'glass');
  const transmissive = glass.filter((p) => p.transmission);
  const alpha = glass.filter((p) => !p.transmission && p.transparent);
  assert.ok(transmissive.length >= 20 && alpha.length >= 30, `glass: ${transmissive.length} transmission, ${alpha.length} alpha`);
  // Tinted / coloured / stained / laminated-colour glass stays on the cheap alpha path.
  for (const p of glass.filter((g) => /^glass-(tint|color|stained|lam-|reflective|bp-)/.test(g.id))) assert.ok(!p.transmission, `${p.id} uses no transmission pass`);
  for (const p of HARD_PRESETS.filter((g) => g.id.startsWith('glass-bp-'))) assert.ok(!p.transparent && p.clearcoat === 1, `${p.id} opaque lacquer behind glass`);
  for (const p of HARD_PRESETS.filter((g) => g.category === 'ceramic' && /gloss|celadon|sanitary-(black|grey)|enamel-(red|blue)/.test(g.id))) assert.ok(p.clearcoat > 0, `${p.id} glaze clear coat`);
  for (const p of HARD_PRESETS.filter((g) => /^(led|neon)-/.test(g.id) || g.id.startsWith('screen-on'))) assert.ok(p.emissive && p.emissiveIntensity >= 1, `${p.id} glows`);
  for (const p of HARD_PRESETS.filter((g) => g.category === 'plant' && g.id.startsWith('plant-petal'))) assert.equal(p.side, 'double', `${p.id} petal is two-sided`);
});

test('texture sets are fetchable Poly Haven ids; in index.json when the library is fetched', () => {
  const indexFile = path.join(root, 'library', 'textures', 'index.json');
  const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : null;
  const sets = new Set(HARD_PRESETS.map((p) => p.textures).filter(Boolean));
  assert.ok(sets.size >= 15 && sets.size <= 30, `${sets.size} sets`);
  for (const set of sets) {
    assert.match(set, /^[a-z0-9_]+$/, set);
    if (index) {
      assert.ok(index[set], `${set} in library/textures/index.json (run npm run assets -- --only textures)`);
      for (const map of ['diff', 'nor', 'rough']) assert.ok(fs.existsSync(path.join(root, 'library', 'textures', set, `${map}.jpg`)), `${set}/${map}.jpg`);
    }
  }
});

test('procedural patterns are valid', () => {
  const patterned = HARD_PRESETS.filter((p) => p.pattern);
  assert.ok(patterned.length >= 40, `${patterned.length} patterned presets`);
  for (const p of patterned) assert.deepEqual(validatePattern(p.pattern), [], `${p.id} pattern`);
});

test('materials build: physical where needed, transparency and emissive applied', () => {
  for (const p of HARD_PRESETS) {
    const m = getMaterial(p.id);
    assert.ok(m instanceof THREE.MeshStandardMaterial, p.id);
    assert.equal(m.userData.preset, p.id);
    if (p.transmission) assert.ok(m.isMeshPhysicalMaterial && m.transmission === p.transmission, `${p.id} transmission`);
    else if (m.isMeshPhysicalMaterial) assert.equal(m.transmission, 0, `${p.id} no transmission pass`);
    if (p.transparent) assert.ok(m.transparent && m.opacity === p.opacity, `${p.id} opacity`);
    if (p.emissive) assert.ok(m.emissiveIntensity === p.emissiveIntensity, `${p.id} emissive`);
  }
});
