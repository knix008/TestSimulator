// Unit tests for the 3D speed-ups: shared unit geometries (build.js), levels
// carried over between builds (levelKeys / opts.reuse) and draw-call batching
// (src/view3d/batch.js: instances, merged one-off meshes, per-instance
// culling and far copies from simplify.js).
// Run: node --test test/unit/perf3d.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "../../src/vendor/three/three.module.js";
import { buildBuilding, makeMaterials, levelKeys, unitGeometry } from "../../src/view3d/build.js";
import { createBatcher, HIDDEN_LAYER, LOD_RADIUS_PX, MIN_RADIUS_PX } from "../../src/view3d/batch.js";
import { simplified, LOD_MIN_TRIANGLES } from "../../src/view3d/simplify.js";
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
      if (o.isMesh && o.userData.sharedGeometry) { shared++; assert.ok(o.geometry.userData.furniturePart || ["box", "cyl", "cyl32", "ball"].some((k) => unitGeometry(THREE, k) === o.geometry)); }
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
    // Repeats become instances, the one-off rest merges per material.
    assert.equal(b.info().instances + b.info().mergedMeshes, hidden.length);
    assert.ok(b.info().merged > 0, "some one-off meshes merged");
    for (const o of hidden) assert.equal(o.matrixAutoUpdate, false, "a batched original is static");
    for (const o of hidden) assert.equal(o.layers.isEnabled(0), false);
    b.release();
    for (const o of hidden) { assert.equal(o.layers.isEnabled(0), true); assert.equal(o.matrixAutoUpdate, true); assert.equal(o.userData.merged, undefined); }
    assert.equal(b.group.children.length, 0);
  });

  test("the instances sit exactly where the meshes were", () => {
    const obj = buildBuilding(THREE, load("02-two-bedroom.myarch"), mats());
    const b = createBatcher(THREE);
    b.build(obj);
    const m = new THREE.Matrix4();
    let checked = 0;
    let merged = 0;
    // Instance matrices are float32.
    const same = (o) => m.elements.every((v, k) => Math.abs(v - o.matrixWorld.elements[k]) < 1e-5);
    obj.traverse((o) => {
      if (!o.isMesh || !o.layers.isEnabled(HIDDEN_LAYER)) return;
      let found = false;
      if (o.userData.merged) {
        const bm = b.group.children.find((x) => x.isBatchedMesh && x.material === o.material);
        assert.ok(bm, "its merged batch");
        for (let i = 0; i < bm.instanceCount && !found; i++) { bm.getMatrixAt(i, m); found = same(o); }
        merged++;
      } else {
        const im = b.group.children.find((x) => x.isInstancedMesh && !x.userData.batchLod && x.geometry === o.geometry && x.material === o.material);
        assert.ok(im, "its instanced batch");
        for (let i = 0; i < im.count && !found; i++) { im.getMatrixAt(i, m); found = same(o); }
      }
      assert.ok(found);
      checked++;
    });
    assert.ok(checked > 10);
    assert.ok(merged > 0);
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
    // What the batches draw: instances (left out while shown) and visible merged parts.
    const drawn = () => {
      let n = 0;
      for (const x of b.group.children) {
        if (x.isBatchedMesh) { for (let i = 0; i < x.instanceCount; i++) if (x.getVisibleAt(i)) n++; }
        else if (!x.userData.batchLod) n += x.count;
      }
      return n;
    };
    const before = drawn();
    b.show([id]);
    for (const o of own) { assert.ok(o.layers.isEnabled(0)); assert.equal(o.matrixAutoUpdate, true, "a shown part can be moved"); }
    assert.equal(drawn(), before - batchedOwn.length);
    b.show([]);
    for (const o of batchedOwn) assert.equal(o.layers.isEnabled(0), false);
    assert.equal(drawn(), before);
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

describe("per-instance culling and far copies (batch.js cull, simplify.js)", () => {
  // A perspective camera looking at the building's centre from `dist` metres.
  const camAt = (obj, dist) => {
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const cam = new THREE.PerspectiveCamera(45, 1.6, 0.1, 5000);
    cam.position.set(c.x + dist, c.y + dist * 0.6, c.z + dist);
    cam.lookAt(c);
    cam.updateMatrixWorld();
    return cam;
  };
  const counts = (b) => {
    let full = 0, far = 0, all = 0;
    for (const x of b.group.children) {
      if (!x.isInstancedMesh) continue;
      if (x.userData.batchLod) far += x.count;
      else { full += x.count; all += x.userData.cull.radius.length; }
    }
    return { full, far, all };
  };
  const tower = () => { const obj = buildBuilding(THREE, load("10-office-tower.myarch"), mats()); const b = createBatcher(THREE); b.build(obj); return { obj, b }; };

  test("seen whole from afar: hardly anything left out, most drawn with the coarse copy", () => {
    const { obj, b } = tower();
    b.cull(camAt(obj, 60), 600);
    const c = counts(b);
    assert.ok(c.far > c.full, `far ${c.far}, full ${c.full}`);
    assert.ok(c.full + c.far > c.all * 0.9, `${c.full + c.far} of ${c.all}`);
  });

  test("close up: what is out of view is not drawn, what is near is drawn in full", () => {
    const { obj, b } = tower();
    b.cull(camAt(obj, 4), 600);
    const c = counts(b);
    assert.ok(c.full + c.far < c.all * 0.8, `${c.full + c.far} of ${c.all}`);
    assert.ok(c.full > 0);
  });

  test("a shadow frame draws every instance in full; the next frame culls again", () => {
    const { obj, b } = tower();
    const cam = camAt(obj, 4);
    b.cull(cam, 600);
    b.cull(cam, 600, { all: true });
    let c = counts(b);
    assert.equal(c.full, c.all);
    assert.equal(c.far, 0);
    b.cull(cam, 600);
    c = counts(b);
    assert.ok(c.full + c.far < c.all);
  });

  test("the drawn instances carry the matrices of the meshes they stand for", () => {
    const obj = buildBuilding(THREE, load("02-two-bedroom.myarch"), mats());
    const b = createBatcher(THREE);
    b.build(obj);
    b.cull(camAt(obj, 25), 600);
    const m = new THREE.Matrix4();
    let checked = 0;
    for (const x of b.group.children) {
      if (!x.isInstancedMesh) continue;
      const src = x.userData.batchLod ? b.group.children.find((y) => y.userData.cull && y.userData.cull.lod === x) : x;
      const c = src.userData.cull, kept = x.userData.batchLod ? c.lkept : c.kept;
      for (let i = 0; i < x.count; i++) {
        x.getMatrixAt(i, m);
        const want = c.all.subarray(kept[i] * 16, kept[i] * 16 + 16);
        assert.ok(m.elements.every((v, k) => Math.abs(v - want[k]) < 1e-6));
        checked++;
      }
    }
    assert.ok(checked > 10);
  });

  test("thresholds: under about a pixel left out, under the far radius coarse", () => {
    assert.ok(MIN_RADIUS_PX > 0 && MIN_RADIUS_PX < 1);
    assert.ok(LOD_RADIUS_PX > MIN_RADIUS_PX);
  });

  test("simplify.js: fewer triangles, the same attribute layout, cached per geometry", () => {
    const g = new THREE.TorusKnotGeometry(1, 0.3, 128, 16);
    const s = simplified(THREE, g);
    assert.ok(s);
    const tris = (x) => (x.index ? x.index.count : x.attributes.position.count) / 3;
    assert.ok(tris(s) < tris(g) * 0.6, `${tris(s)} of ${tris(g)}`);
    assert.deepEqual(Object.keys(s.attributes).sort(), Object.keys(g.attributes).sort());
    for (const k of Object.keys(g.attributes)) assert.equal(s.attributes[k].itemSize, g.attributes[k].itemSize);
    assert.equal(simplified(THREE, g), s);
    g.computeBoundingBox(); s.computeBoundingBox();
    assert.ok(g.boundingBox.clone().expandByScalar(1e-6).containsBox(s.boundingBox), "within the source's bounds");
    const box = new THREE.BoxGeometry(1, 1, 1);
    assert.ok(box.index.count / 3 < LOD_MIN_TRIANGLES);
    assert.equal(simplified(THREE, box), null, "small geometry is drawn as it is");
  });
});

describe("batches across edits (batch.js keeps and patches them)", () => {
  // Every mesh on the hidden layer is drawn by exactly one batch instance at
  // its own place, nothing else is, and the rest stay on layer 0.
  function check(obj, b) {
    obj.updateMatrixWorld(true);
    const hidden = [];
    obj.traverse((o) => { if (o.isMesh && o.layers.isEnabled(HIDDEN_LAYER)) hidden.push(o); });
    let instanced = 0, merged = 0;
    const m = new THREE.Matrix4();
    const near = (o) => m.elements.every((v, k) => Math.abs(v - o.matrixWorld.elements[k]) < 1e-5);
    const free = new Map(); // batch → its active instance ids not yet matched
    for (const x of b.group.children) {
      if (x.isBatchedMesh) { const ids = []; x._instanceInfo.forEach((info, i) => { if (info.active) ids.push(i); }); free.set(x, ids); merged += ids.length; }
      else if (x.userData.cull) instanced += x.userData.cull.radius.length;
    }
    assert.equal(instanced + merged, hidden.length, "one instance per hidden mesh");
    for (const o of hidden) {
      assert.equal(o.layers.isEnabled(0), false);
      if (o.userData.merged) {
        let hit = null;
        for (const bm of b.group.children) {
          if (hit || !bm.isBatchedMesh || bm.material !== o.material) continue;
          const ids = free.get(bm);
          const k = ids.findIndex((i) => { bm.getMatrixAt(i, m); return near(o); });
          if (k >= 0) { hit = bm; assert.ok(bm.getVisibleAt(ids[k])); ids.splice(k, 1); }
        }
        assert.ok(hit, "its merged instance is where it is");
      } else {
        let found = false;
        for (const im of b.group.children) {
          if (found || !im.userData.cull || im.geometry !== o.geometry || im.material !== o.material) continue;
          const c = im.userData.cull;
          for (let i = 0; i < c.radius.length && !found; i++) { m.fromArray(c.all, i * 16); found = near(o); }
        }
        assert.ok(found, "its instance is where it is");
      }
    }
    for (const ids of free.values()) assert.equal(ids.length, 0, "no instance left over");
  }

  test("moving furniture again and again: kept and patched batches stay exact", () => {
    const p = load("11-mixed-use.myarch");
    const m = mats();
    let obj = buildBuilding(THREE, p, m, { reuse: new Map() });
    const b = createBatcher(THREE);
    b.build(obj);
    check(obj, b);
    const lv = p.levels[0].id;
    const items = p.furniture.filter((x) => x.level === lv);
    let reused = 0;
    // Enough edits to use up the merged batches' room and make them again.
    for (let i = 0; i < 40; i++) {
      const it = items[i % items.length];
      it.x += 120;
      obj = buildBuilding(THREE, p, m, { reuse: obj.userData.levels });
      b.build(obj);
      reused += b.info().reused;
      check(obj, b);
    }
    assert.ok(reused > 0, "batches of untouched levels are kept");
  });

  test("a wall deleted and drawn again: the merged batches follow", () => {
    const p = load("03-two-storey-house.myarch");
    const m = mats();
    let obj = buildBuilding(THREE, p, m, { reuse: new Map() });
    const b = createBatcher(THREE);
    b.build(obj);
    const wall = p.walls.pop();
    obj = buildBuilding(THREE, p, m, { reuse: obj.userData.levels });
    b.build(obj);
    check(obj, b);
    p.walls.push(wall);
    obj = buildBuilding(THREE, p, m, { reuse: obj.userData.levels });
    b.build(obj);
    check(obj, b);
  });

  test("a shown item stays shown across a rebuild that keeps its batch", () => {
    const p = load("11-mixed-use.myarch");
    const m = mats();
    let obj = buildBuilding(THREE, p, m, { reuse: new Map() });
    const b = createBatcher(THREE);
    b.build(obj);
    // An item on the top level, then an edit on the ground level.
    const top = p.levels[p.levels.length - 1].id;
    const id = p.furniture.find((f) => f.level === top && (() => { let n = 0; obj.traverse((o) => { if (o.isMesh && o.userData.id === f.id && o.layers.isEnabled(HIDDEN_LAYER)) n++; }); return n > 0; })()).id;
    b.show([id]);
    p.furniture.find((f) => f.level === p.levels[0].id).x += 100;
    obj = buildBuilding(THREE, p, m, { reuse: obj.userData.levels });
    b.build(obj);
    obj.traverse((o) => { if (o.isMesh && o.userData.id === id) assert.ok(o.layers.isEnabled(0), "still drawn by itself"); });
    b.show([]);
    check(obj, b);
  });
});

test("a build made without keys can be followed by a keyed one", () => {
  const p = load("01-studio.myarch");
  const m = mats();
  const a = buildBuilding(THREE, p, m);
  const b = buildBuilding(THREE, p, m, { reuse: a.userData.levels });
  assert.equal(b.children.length, p.levels.length);
});
