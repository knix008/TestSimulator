// The doors / windows / structure / outdoor *-plus.js library modules: every item builds with
// default / all-min / all-max params in both qualities without NaN and matches its declared size,
// and the openings behave like the others: a door or window placed in a wall cuts the wall
// (reveals), its frame follows the hole, and every door says how it moves (userData.swing) —
// hinged doors open their leaf where the plan swing (doorswing.js) says it goes.
// Run: node --test test/unit/library-plus-architecture.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as THREE from 'three';
import { getMaterial, MATERIAL_PRESETS } from '../../src/engine/materials.js';
import { wallCorners, wallMesh, openingSpans, wallDir, wallNormal } from '../../src/engine/walls.js';
import { swingMeta, swingKind, planLeaves } from '../../src/engine/doorswing.js';
import { PARAMETRIC_ITEMS } from '../../src/library/parametric/index.js';

const MODULES = ['doors-plus', 'windows-plus', 'structure-plus', 'outdoor-plus'];
const here = new URL('../../src/library/parametric/', import.meta.url);
const loaded = [];
for (const m of MODULES) {
  if (!existsSync(new URL(`${m}.js`, here))) continue;
  const mod = await import(new URL(`${m}.js`, here).href);
  loaded.push([m, mod.ITEMS]);
}
const PRESETS = new Set(MATERIAL_PRESETS.map((p) => p.id));
const REGISTERED = new Set(PARAMETRIC_ITEMS.map((e) => e.id));
const ctx = (quality, used = new Set(), wallThickness = 0.2) => ({ quality, wallThickness, material: (id, o) => { used.add(id); return getMaterial(id, o); }, THREE });

function finite(root, label) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const a of ['position', 'normal', 'uv']) {
      const arr = o.geometry.attributes[a]?.array;
      assert.ok(arr, `${label}: ${o.name} has no ${a}`);
      for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) assert.fail(`${label}: NaN in ${o.name}.${a}`);
    }
  });
}
const extremes = (entry, pick) => Object.fromEntries(entry.params.filter((p) => ['length', 'number', 'int'].includes(p.type)).map((p) => [p.key, p[pick]]));
const defOf = (entry, key) => entry.params.find((p) => p.key === key).default;

for (const [mod, items] of loaded) {
  test(`${mod}: items are registered in index.js with unique ids`, () => {
    for (const e of items) assert.ok(REGISTERED.has(e.id), `${e.id} is not in PARAMETRIC_ITEMS`);
    const ids = PARAMETRIC_ITEMS.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate ids in the catalog');
    for (const e of items) assert.ok(!e.variantOf, `${e.id}: new designs only, no preset variants`);
  });

  for (const entry of items) {
    test(`${mod} ${entry.id}: default / min / max builds, size`, () => {
      const used = new Set();
      for (const [label, params] of [['default', {}], ['min', extremes(entry, 'min')], ['max', extremes(entry, 'max')]]) {
        for (const q of ['high', 'low']) {
          const root = entry.build(params, ctx(q, used));
          finite(root, `${entry.id} ${label} ${q}`);
          const b = new THREE.Box3().setFromObject(root);
          for (const v of [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]) assert.ok(Number.isFinite(v), `${entry.id} ${label}: bbox`);
        }
      }
      for (const id of used) assert.ok(PRESETS.has(id), `${entry.id}: unknown preset ${id}`);
      const b = new THREE.Box3().setFromObject(entry.build({}, ctx('high')));
      const got = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
      const slack = entry.bboxSlack ?? [0, 0, 0];
      got.forEach((g, i) => assert.ok(Math.abs(g - entry.size[i]) <= entry.size[i] * 0.1 + 0.01 + slack[i], `${entry.id}: size[${i}] ${g.toFixed(3)} vs ${entry.size[i]}`));
      if (entry.placement === 'opening') {
        assert.ok(entry.size[0] >= defOf(entry, 'width') - 0.001 && entry.size[1] >= defOf(entry, 'height') - 0.001, `${entry.id}: size covers the hole`);
      }
    });

    if (entry.placement !== 'opening') continue;

    test(`${mod} ${entry.id}: placed in a wall it cuts the wall and fills the hole`, () => {
      const W = defOf(entry, 'width'), H = defOf(entry, 'height');
      const wall = { id: 'w', level: 'L', a: [0, 0], b: [Math.max(6, W + 2), 0], thickness: 0.2 };
      const corners = wallCorners([wall]);
      const height = Math.max(2.7, (entry.defaultSill ?? 0) + H + 0.2);
      const opening = { id: 'o', wall: 'w', item: entry.id, offset: wall.b[0] / 2, width: W, height: H, sill: entry.category === 'windows' ? entry.defaultSill : 0, flip: false, side: 'left', params: {} };
      assert.equal(openingSpans(wall, [opening], height).length, 1);
      const plain = wallMesh(wall, { corners, height });
      const cut = wallMesh(wall, { corners, height, openings: [opening] });
      assert.ok(cut.groups.some((g) => g.slot === 'reveal'), `${entry.id}: no reveal`);
      assert.ok(cut.indices.length > plain.indices.length, `${entry.id}: wall not cut`);
      // the model spans the hole (frames fill the reveal)
      const b = new THREE.Box3().setFromObject(entry.build({}, ctx('low')));
      const slack = entry.bboxSlack ?? [0, 0, 0];
      if (!entry.anchor?.asymmetricX) assert.ok(b.max.x - b.min.x >= W - 0.02 && b.max.x - b.min.x <= W + 2 * slack[0] + 0.03, `${entry.id}: width ${(b.max.x - b.min.x).toFixed(3)}`);
      assert.ok(b.min.y >= -0.011 && b.max.y >= H - 0.03, `${entry.id}: height ${b.min.y.toFixed(3)}..${b.max.y.toFixed(3)}`);
      if (entry.category === 'windows') assert.equal(swingMeta(entry, {}, 0.2), null);
    });

    if (entry.category !== 'doors') continue;

    test(`${mod} ${entry.id}: door swing data is valid and matches the 3D leaf`, () => {
      const W = defOf(entry, 'width'), H = defOf(entry, 'height');
      const g = entry.build({}, ctx('low'));
      const s = g.userData.swing;
      assert.ok(s && ['left', 'right', 'both', 'none'].includes(s.hinge) && s.radius >= 0, `${entry.id}: userData.swing`);
      const meta = swingMeta(entry, { width: W }, 0.2);
      const kind = swingKind(meta);
      assert.ok(['swing', 'slide', 'fold', 'none'].includes(kind));
      if (kind !== 'swing') return;
      assert.ok(meta.radius > 0.15 && meta.radius <= W, `${entry.id}: radius ${meta.radius}`);
      const openP = entry.params.find((p) => p.key === 'open');
      if (!openP || openP.max < 90 || meta.pivot || meta.doubleActing) return;
      // like doors.test.js: build at 90° in a wall (both sides, flipped or not) and compare the leaf box with the plan leaves
      const wall = { id: 'w', level: 'L', a: [0, 0], b: [4, 0], thickness: 0.2 };
      for (const side of ['left', 'right']) for (const flip of [false, true]) {
        const opening = { id: 'o', wall: 'w', item: entry.id, offset: 2, width: W, height: H, sill: 0, flip, side, params: { open: 90 } };
        const leaves = planLeaves(opening, wall, swingMeta(entry, { open: 90, width: W, height: H }, 0.2));
        const pred = new THREE.Box3();
        for (const l of leaves) {
          pred.expandByPoint(new THREE.Vector3(l.hinge[0], 0, l.hinge[1]));
          pred.expandByPoint(new THREE.Vector3(l.hinge[0] + l.v[0] * l.r, 0, l.hinge[1] + l.v[1] * l.r));
        }
        const content = entry.build({ open: 90, width: W, height: H }, ctx('low'));
        if (flip) content.scale.x = -1;
        const group = new THREE.Group();
        group.add(content);
        const d = wallDir(wall); const n = wallNormal(wall);
        group.position.set(wall.a[0] + d[0] * 2, 0, wall.a[1] + d[1] * 2);
        group.rotation.y = Math.atan2(n[0], n[1]) + (side === 'right' ? Math.PI : 0);
        group.updateMatrixWorld(true);
        const box = new THREE.Box3();
        content.traverse((o) => { if (o.isMesh && o.userData.role === 'leaf') box.union(new THREE.Box3().setFromObject(o)); });
        assert.ok(!box.isEmpty(), `${entry.id}: swinging doors keep their leaf geometry in role 'leaf'`);
        const tol = 0.1;
        const near = (a, b2) => Math.abs(a - b2) <= tol;
        const label = `${entry.id} side=${side} flip=${flip}`;
        assert.ok(near(box.min.x, pred.min.x) && near(box.max.x, pred.max.x), `${label}: x ${box.min.x.toFixed(3)}..${box.max.x.toFixed(3)} vs ${pred.min.x.toFixed(3)}..${pred.max.x.toFixed(3)}`);
        assert.ok(near(box.min.z, pred.min.z) && near(box.max.z, pred.max.z), `${label}: z ${box.min.z.toFixed(3)}..${box.max.z.toFixed(3)} vs ${pred.min.z.toFixed(3)}..${pred.max.z.toFixed(3)}`);
      }
    });
  }
}
