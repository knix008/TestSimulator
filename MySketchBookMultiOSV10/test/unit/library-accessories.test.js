// The accessories (소품) library category (accessories-plus.js, accessories-plus2.js): it exists with an
// icon, holds at least 110 distinct parametric designs (no preset variants), every one is registered in
// index.js, and builds at default / all-min / all-max params in both qualities: finite geometry, on the
// floor, centred, inside a sensible prop size and within the mesh / triangle budgets.
// Run: node --test test/unit/library-accessories.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getMaterial, MATERIAL_PRESETS } from '../../src/engine/materials.js';
import { CATEGORIES } from '../../src/library/categories.js';
import { ICONS_3D } from '../../src/icons-3d.js';
import { PARAMETRIC_ITEMS } from '../../src/library/parametric/index.js';
import { ITEMS as A } from '../../src/library/parametric/accessories-plus.js';
import { ITEMS as B } from '../../src/library/parametric/accessories-plus2.js';

const ITEMS = [...A, ...B];
const PRESETS = new Set(MATERIAL_PRESETS.map((p) => p.id));
const ctx = (quality, used) => ({ quality, wallThickness: 0.2, material: (id, o) => { used.add(id); return getMaterial(id, o); } });
const extremes = (entry, pick) => Object.fromEntries(entry.params.filter((p) => ['length', 'number', 'int'].includes(p.type)).map((p) => [p.key, p[pick]]));

test('accessories: category with an icon, ≥ 110 designs, registered, unique', () => {
  const cat = CATEGORIES.find((c) => c.id === 'accessories');
  assert.ok(cat && cat.ko && cat.en && ICONS_3D[cat.icon], 'category + icon');
  assert.ok(ITEMS.length >= 110, `${ITEMS.length} items`);
  const registered = new Set(PARAMETRIC_ITEMS.map((e) => e.id));
  const ids = ITEMS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate ids');
  const names = new Set(ITEMS.map((e) => e.en.toLowerCase()));
  assert.equal(names.size, ITEMS.length, 'duplicate English names');
  for (const e of ITEMS) {
    assert.equal(e.category, 'accessories', e.id);
    assert.ok(e.id.startsWith('acc-'), `${e.id}: prefix`);
    assert.ok(registered.has(e.id), `${e.id}: not in PARAMETRIC_ITEMS`);
    assert.ok(!e.variantOf, `${e.id}: designs only`);
    assert.ok(e.params.length >= 1, `${e.id}: no params`);
    if (e.placement === 'wall') assert.ok(e.elevation > 0.3 && e.elevation < 2.2, `${e.id}: elevation`);
  }
});

for (const entry of ITEMS) {
  test(`${entry.id}: default / min / max builds stay valid`, () => {
    const used = new Set();
    for (const [label, params] of [['default', {}], ['min', extremes(entry, 'min')], ['max', extremes(entry, 'max')]]) {
      for (const q of ['high', 'low']) {
        const root = entry.build(params, ctx(q, used));
        root.updateMatrixWorld(true);
        let meshes = 0, tris = 0;
        root.traverse((o) => {
          if (!o.isMesh) return;
          meshes++;
          for (const a of ['position', 'normal', 'uv']) {
            const arr = o.geometry.attributes[a]?.array;
            assert.ok(arr, `${entry.id} ${label} ${q}: ${o.name} has no ${a}`);
            for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) assert.fail(`${entry.id} ${label} ${q}: NaN in ${o.name}.${a}`);
          }
          tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
        });
        const b = new THREE.Box3().setFromObject(root);
        assert.ok(meshes > 0 && meshes <= 15, `${entry.id} ${label} ${q}: ${meshes} meshes`);
        assert.ok(tris <= (q === 'high' ? 40000 : 8000), `${entry.id} ${label} ${q}: ${tris} triangles`);
        assert.ok(Math.abs(b.min.y) <= 0.01, `${entry.id} ${label}: min.y ${b.min.y}`);
        assert.ok(Math.abs(b.min.x + b.max.x) <= 0.04 && Math.abs(b.min.z + b.max.z) <= 0.04, `${entry.id} ${label}: not centred`);
        // props: bigger than a coin, smaller than a drying rack
        for (const v of [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z]) assert.ok(v > 0.004 && v < 1.8, `${entry.id} ${label}: size ${v.toFixed(3)}`);
      }
    }
    for (const id of used) assert.ok(PRESETS.has(id), `${entry.id}: unknown preset ${id}`);
  });
}
