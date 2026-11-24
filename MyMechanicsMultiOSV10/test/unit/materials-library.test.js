// The material library: every material has its mechanical, thermal and machining data, ids are unique, every
// family has a name; thermal studies and CAM read the library's own values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MATERIALS, MATERIAL_FAMILIES, familyOf, massOf } from '../../src/cad/materials.js';
import { thermalProperties } from '../../src/cad/fea.js';
import { cutMaterialOf } from '../../src/cad/cam-tools.js';
import { DICTIONARIES } from '../../src/i18n.js';

test('more than 150 materials, unique ids, every value there and sensible', () => {
  assert.ok(MATERIALS.length >= 150, `${MATERIALS.length}`);
  assert.equal(new Set(MATERIALS.map((m) => m.id)).size, MATERIALS.length);
  for (const m of MATERIALS) {
    for (const key of ['density', 'E', 'nu', 'yield', 'ultimate', 'k', 'cp', 'alpha']) assert.ok(Number.isFinite(m[key]), `${m.id}.${key}`);
    assert.ok(m.density > 100 && m.density < 25000, m.id);
    assert.ok(m.nu > 0 && m.nu < 0.5, m.id);
    assert.ok(m.ultimate >= m.yield - 1e-9, `${m.id}: ultimate below yield`);
    assert.ok(m.ko && m.en && m.color && m.cut, m.id);
  }
});

test('every material belongs to a named family, in Korean and English', () => {
  for (const m of MATERIALS) assert.ok(MATERIAL_FAMILIES.includes(familyOf(m)), `${m.id}: ${familyOf(m)}`);
  for (const fam of MATERIAL_FAMILIES) for (const lang of ['ko', 'en']) assert.ok(DICTIONARIES[lang][`matFamily.${fam}`], `${lang} matFamily.${fam}`);
});

test('thermal studies and CAM use the library values; mass from the density', () => {
  assert.deepEqual(thermalProperties('ni-inconel718'), { k: 11.4, cp: 435 });
  assert.deepEqual(thermalProperties('steel-1020'), { k: 51.9, cp: 486 });
  assert.equal(cutMaterialOf('stainless-316'), 'stainless');
  assert.equal(cutMaterialOf('wood-pine'), 'wood');
  assert.equal(cutMaterialOf('tool-d2'), 'alloySteel');
  assert.ok(Math.abs(massOf(1e6, 'ti-grade2') - 4.51) < 1e-9);
});
