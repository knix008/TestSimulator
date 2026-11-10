// Extra checks for the *-plus library modules (office, workplace, lighting, appliances): every item
// builds with all params at their minimum and at their maximum (both qualities), stays on the floor,
// centred, finite and inside the budgets; lamps carry valid light markers and ceiling items an elevation.
// Run: node --test test/unit/library-plus.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getMaterial } from '../../src/engine/materials.js';

const MODULES = ['office-plus', 'workplace-plus', 'workplace-plus2', 'lighting-plus', 'appliances-plus'];
const ITEMS = (await Promise.all(MODULES.map((m) => import(`../../src/library/parametric/${m}.js`)))).flatMap((m) => m.ITEMS);
const ctx = (quality) => ({ quality, wallThickness: 0.2, material: (id, o) => getMaterial(id, o) });

function extreme(entry, which) {
  const out = {};
  for (const p of entry.params) if (['length', 'number', 'int'].includes(p.type)) out[p.key] = p[which];
  return out;
}

function check(entry, root, label) {
  root.updateMatrixWorld(true);
  let meshes = 0, tris = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    for (const a of ['position', 'normal', 'uv']) {
      const arr = o.geometry.attributes[a]?.array;
      assert.ok(arr, `${label}: ${o.name} has no ${a}`);
      for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) assert.fail(`${label}: NaN in ${o.name}.${a}`);
    }
    tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  const box = new THREE.Box3().setFromObject(root);
  assert.ok(meshes > 0 && meshes <= 15, `${label}: ${meshes} meshes`);
  assert.ok(tris <= 60000, `${label}: ${tris} triangles`);
  assert.ok(Math.abs(box.min.y) <= 0.01, `${label}: min.y ${box.min.y.toFixed(3)}`);
  assert.ok(Math.abs(box.min.x + box.max.x) <= 0.04 && Math.abs(box.min.z + box.max.z) <= 0.04, `${label}: not centred`);
  for (const v of [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z]) assert.ok(v > 0.005 && v < 12, `${label}: size ${v}`);
}

test('plus modules: enough items, ids unique and prefixed', () => {
  const ids = ITEMS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  const count = (c) => ITEMS.filter((e) => e.category === c).length;
  assert.ok(count('office') >= 35 && count('workplace') >= 52 && count('lighting') >= 19 && count('appliances') >= 32,
    `office ${count('office')}, workplace ${count('workplace')}, lighting ${count('lighting')}, appliances ${count('appliances')}`);
  for (const e of ITEMS) assert.ok(!e.variantOf, `${e.id}: plus items are designs, not variants`);
});

for (const entry of ITEMS) {
  test(`${entry.id}: builds at min and max params`, () => {
    for (const which of ['min', 'max']) for (const q of ['high', 'low']) check(entry, entry.build(extreme(entry, which), ctx(q)), `${entry.id} ${which} ${q}`);
  });
  if (entry.category === 'lighting') {
    test(`${entry.id}: light markers and placement data`, () => {
      const root = entry.build({}, ctx('high'));
      const box = new THREE.Box3().setFromObject(root);
      const markers = [];
      root.traverse((o) => { if (o.userData.light) markers.push(o); });
      assert.ok(markers.length > 0, 'no light marker');
      for (const m of markers) {
        const l = m.userData.light;
        assert.ok(['point', 'spot'].includes(l.type) && l.intensity > 0 && l.distance > 0 && /^#[0-9a-f]{6}$/i.test(l.color), `${entry.id}: bad light ${JSON.stringify(l)}`);
        if (l.type === 'spot') assert.ok(l.angle > 0 && l.angle < Math.PI / 2, `${entry.id}: spot angle`);
        // the marker sits on (or right next to) the fitting
        assert.ok(box.clone().expandByScalar(0.1).containsPoint(m.position), `${entry.id}: marker outside the fitting`);
      }
      if (entry.placement === 'ceiling' || entry.placement === 'wall') assert.ok(Number.isFinite(entry.elevation) && entry.elevation >= 0 && entry.elevation < 2.4, `${entry.id}: elevation ${entry.elevation}`);
      if (entry.placement === 'ceiling') assert.ok(Math.abs(entry.elevation + entry.size[1] - 2.4) < 0.05 || entry.elevation > 2.3, `${entry.id}: ceiling item does not reach the 2.4 m ceiling`);
    });
  }
}
