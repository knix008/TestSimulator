import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOFT_MATERIAL_PRESETS } from '../../src/engine/materials-soft.js';
import { MATERIAL_CATEGORIES, MATERIAL_PRESETS, getMaterial } from '../../src/engine/materials.js';
import { validatePattern } from '../../src/engine/patterns.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HEX = /^#[0-9a-f]{6}$/i;
const SOFT = ['wood', 'fabric', 'leather', 'paint', 'plastic'];
const unit = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

test('soft presets are part of MATERIAL_PRESETS', () => {
  const ids = new Set(MATERIAL_PRESETS.map((p) => p.id));
  for (const p of SOFT_MATERIAL_PRESETS) assert.ok(ids.has(p.id), p.id);
});

test('every soft category has at least 110 materials', () => {
  for (const category of SOFT) {
    const count = MATERIAL_PRESETS.filter((p) => p.category === category).length;
    assert.ok(count >= 110, `${category}: ${count}`);
  }
});

test('preset ids are unique across all presets', () => {
  const seen = new Set();
  for (const p of MATERIAL_PRESETS) { assert.ok(!seen.has(p.id), `duplicate ${p.id}`); seen.add(p.id); }
});

test('soft presets are valid: category, names, colour, physical values', () => {
  const categories = new Set(MATERIAL_CATEGORIES.map((c) => c.id));
  for (const p of SOFT_MATERIAL_PRESETS) {
    assert.match(p.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, p.id);
    assert.ok(SOFT.includes(p.category) && categories.has(p.category), `${p.id} category ${p.category}`);
    assert.ok(typeof p.ko === 'string' && /[가-힣]/.test(p.ko), `${p.id} ko`);
    assert.ok(typeof p.en === 'string' && /^[A-Z0-9]/.test(p.en), `${p.id} en`);
    assert.match(p.color, HEX, `${p.id} colour`);
    assert.ok(unit(p.roughness), `${p.id} roughness ${p.roughness}`);
    assert.ok(unit(p.metalness), `${p.id} metalness ${p.metalness}`);
    assert.ok(Number.isFinite(p.repeat) && p.repeat > 0, `${p.id} repeat`);
    for (const key of ['sheen', 'clearcoat', 'clearcoatRoughness', 'transmission', 'opacity']) if (key in p) assert.ok(unit(p[key]), `${p.id} ${key} ${p[key]}`);
    if ('sheenColor' in p) assert.match(p.sheenColor, HEX, `${p.id} sheenColor`);
    if ('ior' in p) assert.ok(p.ior >= 1 && p.ior <= 2.5, `${p.id} ior`);
    if ('thickness' in p) assert.ok(p.thickness > 0 && p.thickness < 0.2, `${p.id} thickness`);
    if ('textureSize' in p) assert.ok(p.textureSize > 0.05 && p.textureSize <= 3, `${p.id} textureSize`);
    if (p.transmission) assert.equal(p.transparent, true, `${p.id} transmissive presets are transparent`);
    assert.ok(!(p.textures && p.pattern), `${p.id} has either textures or a pattern`);
  }
});

test('surfaces behave like their kind: fabrics have sheen, leathers a coat, gloss is smooth', () => {
  for (const p of SOFT_MATERIAL_PRESETS) {
    if (p.category === 'fabric') assert.ok(p.sheen > 0 && p.roughness >= 0.3, `${p.id} fabric sheen`);
    if (p.category === 'leather') assert.ok(p.clearcoat > 0 || p.sheen > 0, `${p.id} leather coat or nap`);
    if (/gloss/i.test(p.en) && !/matte/i.test(p.en)) assert.ok(p.roughness <= 0.35, `${p.id} gloss roughness ${p.roughness}`);
    if (/\b(flat|matte|chalk)\b/i.test(p.en) && !/gloss/i.test(p.en)) assert.ok(p.roughness >= 0.4, `${p.id} matte roughness ${p.roughness}`);
  }
});

test('texture sets are fetched (library/textures/index.json) and patterns are valid', () => {
  const indexFile = path.join(root, 'library', 'textures', 'index.json');
  const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : null;
  for (const p of SOFT_MATERIAL_PRESETS) {
    if (p.textures) {
      assert.match(p.textures, /^[a-z0-9_]+$/, `${p.id} texture set id`);
      if (index) assert.ok(index[p.textures], `${p.id}: set ${p.textures} missing — run npm run assets -- --only textures`);
    }
    if (p.pattern) assert.deepEqual(validatePattern(p.pattern), [], `${p.id} pattern`);
  }
});

test('soft presets are real variety, not tints of one material', () => {
  for (const category of SOFT) {
    const list = SOFT_MATERIAL_PRESETS.filter((p) => p.category === category);
    const looks = new Set(list.map((p) => `${p.color}|${p.roughness}|${p.textures ?? p.pattern?.kind ?? ''}`));
    assert.equal(looks.size, list.length, `${category}: two presets look the same`);
    const names = new Set(list.map((p) => p.en));
    assert.equal(names.size, list.length, `${category}: duplicate English names`);
  }
});

test('getMaterial builds every soft preset', () => {
  for (const p of SOFT_MATERIAL_PRESETS) {
    const m = getMaterial(p.id);
    assert.equal(m.userData.preset, p.id);
    if (p.sheen || p.clearcoat || p.transmission) assert.equal(m.type, 'MeshPhysicalMaterial', p.id);
  }
});
