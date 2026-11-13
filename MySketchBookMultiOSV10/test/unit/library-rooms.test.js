// The office props (사무실), server room (서버실), computers (컴퓨터) and landscaping (조경) library
// categories: each exists with an icon, holds at least 110 distinct parametric designs (no preset
// variants) with its own id prefix, every one is registered in index.js, and builds at default /
// all-min / all-max params in both qualities: finite geometry, on the floor, centred, inside the
// category's size range and within the mesh / triangle budgets.
// Run: node --test test/unit/library-rooms.test.js
// One area while working on it: ROOMS=serverroom node --test test/unit/library-rooms.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getMaterial, MATERIAL_PRESETS } from '../../src/engine/materials.js';
import { CATEGORIES } from '../../src/library/categories.js';
import { ICONS_3D } from '../../src/icons-3d.js';

const AREAS = [
  { cat: 'officeprops', prefix: 'ofp-', modules: ['office-props', 'office-props2'], max: 3.2 },
  { cat: 'serverroom', prefix: 'srv-', modules: ['server-room', 'server-room2'], max: 4.6 },
  { cat: 'computer', prefix: 'cmp-', modules: ['computers', 'computers2'], max: 2.2 },
  { cat: 'security', prefix: 'sec-', legacy: ['ofp-', 'srv-', 'wpy-'], modules: ['security-moved', 'security', 'security2', 'server-room2', 'workplace-plus2'], max: 14 },
  { cat: 'landscape', prefix: 'lsc-', modules: ['landscape', 'landscape2'], max: 16 },
  { cat: 'appliances', prefix: 'aca-', modules: ['appliances-air'], max: 3.5, min: 25, key: 'air' },
  { cat: 'lighting', prefix: 'lgx-', modules: ['lighting-fixtures'], max: 6, min: 40, key: 'lights' },
];
const only = process.env.ROOMS?.split(',').map((s) => s.trim()).filter(Boolean);
const PRESETS = new Set(MATERIAL_PRESETS.map((p) => p.id));
const ctx = (quality, used) => ({ quality, wallThickness: 0.2, material: (id, o) => { used.add(id); return getMaterial(id, o); } });
const extremes = (entry, pick) => Object.fromEntries(entry.params.filter((p) => ['length', 'number', 'int'].includes(p.type)).map((p) => [p.key, p[pick]]));
const { PARAMETRIC_ITEMS } = only ? { PARAMETRIC_ITEMS: null } : await import('../../src/library/parametric/index.js');

for (const area of AREAS) {
  if (only && !only.includes(area.key ?? area.cat)) continue;
  const ITEMS = (await Promise.all(area.modules.map((m) => import(`../../src/library/parametric/${m}.js`).catch(() => ({ ITEMS: [] }))))).flatMap((m) => m.ITEMS).filter((e) => e.category === area.cat);

  test(`${area.key ?? area.cat}: category with an icon, ≥ ${area.min ?? 110} designs, registered, unique`, () => {
    const cat = CATEGORIES.find((c) => c.id === area.cat);
    assert.ok(cat && cat.ko && cat.en && ICONS_3D[cat.icon], 'category + icon');
    if (!only) assert.ok(ITEMS.length >= (area.min ?? 110), `${ITEMS.length} items`);
    const registered = PARAMETRIC_ITEMS ? new Set(PARAMETRIC_ITEMS.map((e) => e.id)) : null;
    const ids = ITEMS.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate ids');
    const names = ITEMS.map((e) => e.en.toLowerCase());
    assert.equal(new Set(names).size, names.length, `duplicate English names: ${names.filter((n, i) => names.indexOf(n) !== i)}`);
    const kos = ITEMS.map((e) => e.ko);
    assert.equal(new Set(kos).size, kos.length, `duplicate Korean names: ${kos.filter((n, i) => kos.indexOf(n) !== i)}`);
    for (const e of ITEMS) {
      assert.equal(e.category, area.cat, e.id);
      assert.ok(e.id.startsWith(area.prefix) || (area.legacy ?? []).some((pre) => e.id.startsWith(pre)), `${e.id}: prefix`);
      if (registered) assert.ok(registered.has(e.id), `${e.id}: not in PARAMETRIC_ITEMS`);
      assert.ok(!e.variantOf, `${e.id}: designs only`);
      assert.ok(e.params.length >= 1, `${e.id}: no params`);
      if (e.placement === 'wall') assert.ok(e.elevation >= 0 && e.elevation < 2.4, `${e.id}: elevation`);
    }
  });

  for (const entry of ITEMS) {
    test(`${entry.id}: default / min / max builds stay valid`, () => {
      const used = new Set();
      for (const [label, params] of [['default', {}], ['min', extremes(entry, 'min')], ['max', extremes(entry, 'max')]]) {
        for (const q of ['high', 'low']) {
          const root = entry.build(params, ctx(q, used));
          root.updateMatrixWorld(true);
          let meshes = 0, tris = 0, glow = false, lights = 0;
          root.traverse((o) => {
            if (o.userData.light) lights++;
            if (!o.isMesh) return;
            meshes++;
            if (o.userData.part === 'light' && o.name !== 'display') glow = true;
            for (const a of ['position', 'normal', 'uv']) {
              const arr = o.geometry.attributes[a]?.array;
              assert.ok(arr, `${entry.id} ${label} ${q}: ${o.name} has no ${a}`);
              for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) assert.fail(`${entry.id} ${label} ${q}: NaN in ${o.name}.${a}`);
            }
            tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
          });
          if (glow) assert.ok(lights > 0, `${entry.id}: emissive part without a light marker`);
          const b = new THREE.Box3().setFromObject(root);
          assert.ok(meshes > 0 && meshes <= 15, `${entry.id} ${label} ${q}: ${meshes} meshes`);
          assert.ok(tris <= (q === 'high' ? 40000 : 8000) * (label === 'default' ? 1 : 1.5), `${entry.id} ${label} ${q}: ${tris} triangles`);
          assert.ok(Math.abs(b.min.y) <= 0.01, `${entry.id} ${label}: min.y ${b.min.y}`);
          assert.ok(Math.abs(b.min.x + b.max.x) <= 0.04 && Math.abs(b.min.z + b.max.z) <= 0.04, `${entry.id} ${label}: not centred`);
          for (const v of [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z]) assert.ok(v > 0.002 && v < area.max, `${entry.id} ${label}: size ${v.toFixed(3)}`);
        }
      }
      for (const id of used) assert.ok(PRESETS.has(id), `${entry.id}: unknown preset ${id}`);
    });
  }
}
