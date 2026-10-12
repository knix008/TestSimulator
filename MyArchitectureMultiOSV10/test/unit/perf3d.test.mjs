// Unit tests for the 3D speed-ups: shared unit geometries (build.js), levels
// carried over between builds (levelKeys / opts.reuse) and draw-call batching
// (src/view3d/batch.js).
// Run: node --test test/unit/perf3d.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "../../src/vendor/three/three.module.js";
import { buildBuilding, makeMaterials, levelKeys, unitGeometry } from "../../src/view3d/build.js";
import { createBatcher, HIDDEN_LAYER } from "../../src/view3d/batch.js";
import { parseProject } from "../../src/core/project.js";
import { measure, batched } from "../../scripts/bench-3d.mjs";

const root = path.resolve(import.meta.dirname, "..", "..");
const load = (file) => parseProject(fs.readFileSync(path.join(root, "sample", file), "utf8"));
const mats = () => makeMaterials(THREE, { textures: false });

// Every mesh as [id, kind, world matrix, geometry vertex count, material name]
// in a stable order: two builds of the same project must agree on all of it.
function signature(obj) {
  obj.updateMatrixWorld(true);
  const out = [];
  obj.traverse((o) => {
    if (!o.isMesh) return;
    out.push([o.userData.id, o.userData.kind, o.matrixWorld.elements.map((v) => +v.toFixed(5)).join(), o.geometry.attributes.position.count, o.material.name].join("|"));
  });
  return out.sort();
}

describe("shared unit geometries", () => {
  test("furniture parts, frames and door leaves share a handful of geometries", () => {
    const p = load("10-office-tower.myarch");
    const m = measure(buildBuilding(THREE, p, mats()));
    assert.ok(m.meshes > 10000, `meshes ${m.meshes}`);
    assert.ok(m.geometries < m.meshes / 10, `${m.geometries} geometries for ${m.meshes} meshes`);
  });

  test("unit primitives are one per kind and flagged as shared", () => {
    assert.equal(unitGeometry(THREE, "box"), unitGeometry(THREE, "box"));
    const p = load("01-studio.myarch");
    let shared = 0;
    buildBuilding(THREE, p, mats()).traverse((o) => {
      if (o.isMesh && o.userData.sharedGeometry) { shared++; assert.ok(["box", "cyl", "cyl32", "ball"].some((k) => unitGeometry(THREE, k) === o.geometry)); }
    });
    assert.ok(shared > 20);
  });
});

describe("levels carried over between builds", () => {
  test("an unchanged project reuses every level group", () => {
    const p = load("03-two-storey-house.myarch");
    const m = mats();
    const a = buildBuilding(THREE, p, m, { reuse: new Map() });
    const groups = [...a.userData.levels.values()].map((l) => l.group);
    const b = buildBuilding(THREE, p, m, { reuse: a.userData.levels });
    assert.deepEqual([...b.userData.levels.values()].map((l) => l.group), groups);
    assert.equal(b.children.length, p.levels.length);
  });

  test("moving furniture rebuilds only its level, and the result equals a fresh build", () => {
    const p = load("10-office-tower.myarch");
    const m = mats();
    const a = buildBuilding(THREE, p, m, { reuse: new Map() });
    const before = new Map([...a.userData.levels].map(([id, l]) => [id, l.group]));
    const f = p.furniture.find((x) => x.level === p.levels[2].id);
    f.x += 500;
    const b = buildBuilding(THREE, p, m, { reuse: a.userData.levels });
    for (const lv of p.levels) {
      const same = b.userData.levels.get(lv.id).group === before.get(lv.id);
      assert.equal(same, lv.id !== f.level, `level ${lv.name}`);
    }
    assert.deepEqual(signature(b), signature(buildBuilding(THREE, p, mats())));
  });

  test("an opening follows its wall's level", () => {
    const p = load("03-two-storey-house.myarch");
    const op = p.openings[0];
    const level = p.walls.find((w) => w.id === op.wall).level;
    const k1 = levelKeys(p);
    op.width += 100;
    const k2 = levelKeys(p);
    for (const lv of p.levels) assert.equal(k1.get(lv.id)[1] === k2.get(lv.id)[1], lv.id !== level, lv.name);
  });

  test("project-wide parts (levels, roofs, materials, options) rebuild every level", () => {
    const p = load("03-two-storey-house.myarch");
    const k1 = levelKeys(p);
    p.levels[1].elevation += 100;
    const k2 = levelKeys(p);
    for (const lv of p.levels) assert.notEqual(k1.get(lv.id)[0], k2.get(lv.id)[0]);
    assert.notEqual(levelKeys(p)[0], levelKeys(p, { openDoors: true }).get(p.levels[0].id)[0]);
    assert.notEqual(levelKeys(p).get(p.levels[0].id)[0], levelKeys(p, { openDoors: true }).get(p.levels[0].id)[0]);
  });

  test("sheets, views and annotations do not touch the 3D", () => {
    const p = load("10-office-tower.myarch");
    const k1 = levelKeys(p);
    p.sheets.push({ id: "x", name: "extra" });
    p.meta.title = "renamed";
    const k2 = levelKeys(p);
    for (const lv of p.levels) assert.deepEqual(k1.get(lv.id), k2.get(lv.id));
  });

  test("a hidden level is carried over but stays hidden", () => {
    const p = load("03-two-storey-house.myarch");
    const m = mats();
    const a = buildBuilding(THREE, p, m, { reuse: new Map() });
    const hide = p.levels[1].id;
    const b = buildBuilding(THREE, p, m, { reuse: a.userData.levels, levels: new Set([p.levels[0].id]) });
    assert.equal(b.userData.levels.get(hide).group.visible, false);
    assert.equal(b.userData.levels.get(hide).group, a.userData.levels.get(hide).group);
  });
});

describe("batch.js", () => {
  test("repeated meshes become instances: far fewer draw calls", () => {
    const r = batched(buildBuilding(THREE, load("10-office-tower.myarch"), mats()));
    assert.ok(r.drawCalls < 1500, `draw calls ${r.drawCalls}`);
  });

  test("batched meshes move to the hidden layer and come back on release", () => {
    const obj = buildBuilding(THREE, load("01-studio.myarch"), mats());
    const b = createBatcher(THREE);
    b.build(obj);
    const hidden = [];
    obj.traverse((o) => { if (o.isMesh && o.layers.isEnabled(HIDDEN_LAYER)) hidden.push(o); });
    assert.ok(hidden.length > 10);
    assert.equal(b.info().instances, hidden.length);
    for (const o of hidden) assert.equal(o.layers.isEnabled(0), false);
    b.release();
    for (const o of hidden) assert.equal(o.layers.isEnabled(0), true);
    assert.equal(b.group.children.length, 0);
  });

  test("the instances sit exactly where the meshes were", () => {
    const obj = buildBuilding(THREE, load("02-two-bedroom.myarch"), mats());
    const b = createBatcher(THREE);
    b.build(obj);
    const m = new THREE.Matrix4();
    let checked = 0;
    obj.traverse((o) => {
      if (!o.isMesh || !o.layers.isEnabled(HIDDEN_LAYER)) return;
      const im = b.group.children.find((x) => x.geometry === o.geometry && x.material === o.material);
      assert.ok(im);
      let found = false;
      // Instance matrices are float32.
      for (let i = 0; i < im.count && !found; i++) { im.getMatrixAt(i, m); found = m.elements.every((v, k) => Math.abs(v - o.matrixWorld.elements[k]) < 1e-5); }
      assert.ok(found);
      checked++;
    });
    assert.ok(checked > 10);
  });

  test("show(ids) draws an item by its own meshes and hides its instances", () => {
    const p = load("01-studio.myarch");
    const obj = buildBuilding(THREE, p, mats());
    const b = createBatcher(THREE);
    b.build(obj);
    const id = p.furniture.find((f) => { let n = 0; obj.traverse((o) => { if (o.isMesh && o.userData.id === f.id && o.layers.isEnabled(HIDDEN_LAYER)) n++; }); return n > 0; }).id;
    const own = [];
    obj.traverse((o) => { if (o.isMesh && o.userData.id === id) own.push(o); });
    const batchedOwn = own.filter((o) => o.layers.isEnabled(HIDDEN_LAYER));
    b.show([id]);
    for (const o of own) assert.ok(o.layers.isEnabled(0));
    const m = new THREE.Matrix4();
    let zeros = 0;
    for (const im of b.group.children) for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); if (m.elements.every((v, k) => (k === 15 ? v === 1 : v === 0))) zeros++; }
    assert.equal(zeros, batchedOwn.length);
    b.show([]);
    for (const o of batchedOwn) assert.equal(o.layers.isEnabled(0), false);
    zeros = 0;
    for (const im of b.group.children) for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); if (m.elements.every((v, k) => (k === 15 ? v === 1 : v === 0))) zeros++; }
    assert.equal(zeros, 0);
  });

  test("glowing lamp parts and see-through parts are never batched", () => {
    const p = load("16-modern-villa.myarch");
    const obj = buildBuilding(THREE, p, mats());
    createBatcher(THREE).build(obj);
    obj.traverse((o) => {
      if (!o.isMesh) return;
      if (o.userData.glow || o.material.transparent) assert.ok(o.layers.isEnabled(0), o.name);
    });
  });

  test("the raycaster still picks batched meshes", () => {
    const p = load("01-studio.myarch");
    const obj = buildBuilding(THREE, p, mats());
    createBatcher(THREE).build(obj);
    const target = [];
    obj.traverse((o) => { if (o.isMesh && o.layers.isEnabled(HIDDEN_LAYER) && o.userData.kind === "furniture") target.push(o); });
    const t = target[0];
    const c = new THREE.Box3().setFromObject(t).getCenter(new THREE.Vector3());
    const rc = new THREE.Raycaster(new THREE.Vector3(c.x, 50, c.z), new THREE.Vector3(0, -1, 0));
    rc.layers.enable(HIDDEN_LAYER);
    const hits = rc.intersectObject(obj, true);
    assert.ok(hits.some((h) => h.object.userData.kind === "furniture"));
    const plain = new THREE.Raycaster(new THREE.Vector3(c.x, 50, c.z), new THREE.Vector3(0, -1, 0));
    assert.ok(!plain.intersectObject(obj, true).some((h) => h.object === t), "layer 0 only misses it");
  });
});

test("a build made without keys can be followed by a keyed one", () => {
  const p = load("01-studio.myarch");
  const m = mats();
  const a = buildBuilding(THREE, p, m);
  const b = buildBuilding(THREE, p, m, { reuse: a.userData.levels });
  assert.equal(b.children.length, p.levels.length);
});
