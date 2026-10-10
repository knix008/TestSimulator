// Unit tests for the 3D building (src/view3d/build.js) and the libraries it
// draws from: furniture (src/lib/furniture.js) and materials
// (src/lib/materials.js). three.js runs in Node for the geometry.
// Run: node --test test/unit/view3d.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "../../src/vendor/three/three.module.js";
import { buildBuilding, makeMaterials, modelExtent, M } from "../../src/view3d/build.js";
import {
  allFurniture, furnitureDef, makeFurniture, furnitureParts, furnitureCorners, drawFurniturePlan, FURNITURE_CATEGORIES, COLORS,
} from "../../src/lib/furniture.js";
import { MATERIALS, materialById, materialsFor, materialColor, paintPattern, DEFAULT_MATERIAL } from "../../src/lib/materials.js";
import { newProject, normalizeProject, newLevel, parseProject } from "../../src/core/project.js";
import { roofModel, roofBase } from "../../src/core/roof.js";
import { buildingOutlines } from "../../src/core/rooms.js";
import { PLAN_THEMES } from "../../src/plan/render.js";

// ---------------------------------------------------------------- helpers

const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a} (tol ${tol})`);
const root = path.resolve(import.meta.dirname, "..", "..");
const sampleIndex = JSON.parse(fs.readFileSync(path.join(root, "sample", "index.json"), "utf8"));
const loadSample = (file) => parseProject(fs.readFileSync(path.join(root, "sample", file), "utf8"));
const mats = () => makeMaterials(THREE, { textures: false });
const build = (p, opts) => buildBuilding(THREE, p, mats(), opts);

const meshes = (obj) => { const out = []; obj.traverse((c) => { if (c.isMesh) out.push(c); }); return out; };
const byName = (obj, name) => obj.getObjectByName(name);
const worldBox = (obj) => { obj.updateMatrixWorld(true); return new THREE.Box3().setFromObject(obj); };
const triCount = (mesh) => mesh.geometry.getAttribute("position").count / 3;

// Triangles of a non-indexed geometry as [[x, y, z] × 3].
function triangles(mesh) {
  const pos = mesh.geometry.getAttribute("position");
  const tris = [];
  for (let i = 0; i < pos.count; i += 3) tris.push([0, 1, 2].map((k) => [pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k)]));
  return tris;
}
// Signed volume by the divergence theorem (positive when faces point outwards).
function volume(mesh) {
  let v = 0;
  for (const [a, b, c] of triangles(mesh)) v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  return v;
}
// How many triangles use each (undirected) edge, keyed by rounded positions.
function edgeUse(mesh) {
  const key = (p) => p.map((v) => v.toFixed(6)).join(",");
  const edges = new Map();
  for (const t of triangles(mesh)) {
    for (let i = 0; i < 3; i++) {
      const a = key(t[i]), b = key(t[(i + 1) % 3]);
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  return edges;
}
const isClosed = (mesh) => [...edgeUse(mesh).values()].every((n) => n === 2);

// A project on level "L" (2800 high, slab 200) with the given items.
function project(items = {}, { twoLevels = false } = {}) {
  const p = newProject("3D");
  p.levels[0].id = "L";
  p.view.level = "L";
  if (twoLevels) p.levels.push({ ...newLevel("2F", 3200, 3000), id: "U" });
  for (const [k, list] of Object.entries(items)) p[k] = list.map((it) => (k === "openings" ? it : { level: "L", ...it }));
  return normalizeProject(p);
}
const wall = (id, x1, y1, x2, y2, thickness = 200, extra = {}) => ({ id, x1, y1, x2, y2, thickness, ...extra });
const rectWalls = (x1, y1, x2, y2, t = 200) => [wall("n", x1, y1, x2, y1, t), wall("e", x2, y1, x2, y2, t), wall("s", x2, y2, x1, y2, t), wall("w", x1, y2, x1, y1, t)];

// A fake 2D canvas that records calls and the fill styles it was given.
function fakeCtx({ roundRect = true } = {}) {
  const calls = {};
  const fills = [];
  const ctx = { calls, fills, strokeStyle: "#000", lineWidth: 1, lineJoin: "miter" };
  let fillStyle = "#000";
  Object.defineProperty(ctx, "fillStyle", { get: () => fillStyle, set: (v) => { fillStyle = v; fills.push(v); } });
  const names = ["beginPath", "moveTo", "lineTo", "arc", "ellipse", "rect", "closePath", "fill", "stroke", "fillRect", "strokeRect", "save", "restore", "translate", "rotate", "scale", "quadraticCurveTo", "bezierCurveTo"];
  if (roundRect) names.push("roundRect");
  for (const m of names) ctx[m] = () => { calls[m] = (calls[m] || 0) + 1; };
  return ctx;
}

// ================================================================ walls
describe("buildBuilding — walls", () => {
  test("a wall without openings is a closed box of L × T × H", () => {
    const p = project({ walls: [wall("a", 0, 0, 4000, 0)] });
    const mesh = byName(build(p), "wall a");
    assert.ok(mesh);
    assert.equal(triCount(mesh), 12);
    assert.ok(isClosed(mesh), "every edge is shared by exactly two triangles");
    near(volume(mesh), 4 * 0.2 * 2.8, 1e-6, "volume (and the faces point outwards)");
    const b = worldBox(mesh);
    near(b.min.x, 0); near(b.max.x, 4);
    near(b.min.y, 0); near(b.max.y, 2.8);
    near(b.min.z, -0.1); near(b.max.z, 0.1);
  });

  test("the mesh carries its id, kind and level", () => {
    const p = project({ walls: [wall("a", 0, 0, 4000, 0)] });
    const mesh = byName(build(p), "wall a");
    assert.deepEqual({ ...mesh.userData }, { id: "a", kind: "walls", level: "L" });
    assert.equal(mesh.castShadow, true);
    assert.equal(mesh.receiveShadow, true);
  });

  test("a window cuts a hole of width × height through the wall", () => {
    const p = project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [{ id: "w", wall: "a", kind: "window", at: 2000, width: 1200, height: 1200, sill: 900 }] });
    const mesh = byName(build(p), "wall a");
    assert.equal(triCount(mesh), 48, "four pieces: left, under the sill, over the head, right");
    near(volume(mesh), 4 * 0.2 * 2.8 - 1.2 * 1.2 * 0.2, 1e-6);
    const b = worldBox(mesh);
    near(b.min.x, 0); near(b.max.x, 4); near(b.max.y, 2.8); near(b.min.z, -0.1); near(b.max.z, 0.1);
  });

  test("a door cuts down to the floor; a full-height opening leaves no head", () => {
    const door = project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [{ id: "d", wall: "a", kind: "door", at: 2000, width: 900, height: 2100, sill: 0 }] });
    const dm = byName(build(door), "wall a");
    assert.equal(triCount(dm), 36, "left, head and right");
    near(volume(dm), 4 * 0.2 * 2.8 - 0.9 * 2.1 * 0.2, 1e-6);
    const full = project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [{ id: "o", wall: "a", kind: "opening", at: 2000, width: 1000, height: 2800, sill: 0 }] });
    const fm = byName(build(full), "wall a");
    assert.equal(triCount(fm), 24);
    near(volume(fm), 3 * 0.2 * 2.8, 1e-6);
  });

  test("two openings remove both holes", () => {
    const p = project({ walls: [wall("a", 0, 0, 6000, 0, 300)], openings: [{ id: "d", wall: "a", kind: "door", at: 1500, width: 1000, height: 2000 }, { id: "w", wall: "a", kind: "window", at: 4500, width: 1500, height: 1000, sill: 1000 }] });
    near(volume(byName(build(p), "wall a")), 6 * 0.3 * 2.8 - 1 * 2 * 0.3 - 1.5 * 1 * 0.3, 1e-6);
  });

  test("a wall's own height and the level elevation place the wall", () => {
    const p = project({ walls: [wall("a", 0, 0, 4000, 0), wall("b", 0, 0, 4000, 0, 200, { level: "U", height: 2500 })] }, { twoLevels: true });
    const b = worldBox(byName(build(p), "wall b"));
    near(b.min.y, 3.2);
    near(b.max.y, 5.7);
  });

  test("mitred corners: the walls of a closed box hold the frame volume", () => {
    const p = project({ walls: rectWalls(0, 0, 6000, 4000) });
    const g = build(p);
    const total = ["n", "e", "s", "w"].reduce((s, id) => s + volume(byName(g, `wall ${id}`)), 0);
    near(total, (6.2 * 4.2 - 5.8 * 3.8) * 2.8, 1e-4, "float32 positions");
    for (const id of ["n", "e", "s", "w"]) assert.ok(isClosed(byName(g, `wall ${id}`)), `wall ${id} is closed`);
  });

  test("demolished walls: hidden by the new-phase filter, red and translucent in the full view", () => {
    const p = project({ walls: [wall("a", 0, 0, 4000, 0, 200, { phase: "demolish" }), wall("b", 0, 2000, 4000, 2000, 200, { phase: "existing" })] });
    assert.equal(byName(build(p, { phase: "new" }), "wall a"), undefined);
    assert.ok(byName(build(p, { phase: "new" }), "wall b"));
    const all = byName(build(p), "wall a");
    assert.equal(all.material.transparent, true);
    assert.equal(all.material.color.getHexString(), "e0524a");
    assert.equal(byName(build(p, { phase: "existing" }), "wall a").material.transparent, false, "red only in the combined view; the existing state shows it normally");
  });

  test("wall materials: the wall's own, else the type's outer layer, else plaster", () => {
    const p = project({ walls: [wall("a", 0, 0, 4000, 0, 200, { material: "brick" }), wall("b", 0, 2000, 4000, 2000, 200, { type: "ext-wood-200" }), wall("c", 0, 4000, 4000, 4000)] });
    const g = build(p);
    assert.equal(byName(g, "wall a").material.name, "brick");
    assert.equal(byName(g, "wall b").material.name, "wood-cladding");
    assert.equal(byName(g, "wall c").material.name, DEFAULT_MATERIAL.wall);
  });
});

// ================================================================ openings
describe("buildBuilding — openings", () => {
  const withDoor = (extra = {}) => project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [{ id: "d", wall: "a", kind: "door", at: 2000, width: 900, height: 2100, sill: 0, side: 1, ...extra }] });

  test("doors and windows become tagged groups with frames", () => {
    const p = project({ walls: [wall("a", 0, 0, 6000, 0)], openings: [{ id: "d", wall: "a", kind: "door", at: 1500 }, { id: "w", wall: "a", kind: "window", at: 4000 }] });
    const g = build(p);
    const door = byName(g, "door d");
    const win = byName(g, "window w");
    assert.deepEqual({ ...door.userData }, { id: "d", kind: "openings", level: "L" });
    for (const m of meshes(door)) assert.deepEqual([m.userData.id, m.userData.kind], ["d", "openings"]);
    assert.ok(meshes(door).length >= 4, "jambs, head, leaf and handle");
    assert.ok(meshes(win).some((m) => m.userData.glass), "the window has glass");
    assert.ok(meshes(win).every((m) => m.userData.id === "w"));
  });

  test("a plain opening has no frame", () => {
    const p = project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [{ id: "o", wall: "a", kind: "opening", at: 2000 }] });
    assert.equal(meshes(byName(build(p), "opening o")).length, 0);
  });

  test("openDoors swings the leaf into the room on its side", () => {
    const closed = worldBox(byName(build(withDoor()), "door d"));
    const open = worldBox(byName(build(withDoor(), { openDoors: true }), "door d"));
    assert.ok(closed.max.z < 0.15, `closed leaf stays in the wall (${closed.max.z})`);
    assert.ok(open.max.z > 0.5, `open leaf swings to +z (${open.max.z})`);
    const other = worldBox(byName(build(withDoor({ side: -1 }), { openDoors: true }), "door d"));
    assert.ok(other.min.z < -0.5, "side −1 swings the other way");
  });

  test("double, sliding and garage doors build their own leaves", () => {
    for (const type of ["double", "sliding", "garage"]) {
      const g = build(withDoor({ type, width: 1800 }), { openDoors: true });
      const d = byName(g, "door d");
      assert.ok(meshes(d).length >= 4, type);
      const b = worldBox(d);
      assert.ok(b.max.y <= 2.1 + 1e-6, `${type} stays under the head`);
    }
    const garage = meshes(byName(build(withDoor({ type: "garage", width: 2400 })), "door d"));
    assert.equal(garage.length, 3 + 4, "frame plus four panels");
  });

  test("windows of every type stay inside their hole", () => {
    for (const type of ["casement", "fixed", "sliding"]) {
      const p = project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [{ id: "w", wall: "a", kind: "window", type, at: 2000, width: 1200, height: 1200, sill: 900 }] });
      const b = worldBox(byName(build(p), "window w"));
      assert.ok(b.min.y >= 0.9 - 0.031, `${type} bottom`);
      assert.ok(b.max.y <= 2.1 + 1e-6, `${type} top`);
      assert.ok(b.min.x >= 1.4 - 0.041 && b.max.x <= 2.6 + 0.041, `${type} width`);
    }
  });

  test("openings of demolished phase are hidden by the new filter", () => {
    const p = withDoor({ phase: "demolish" });
    assert.equal(byName(build(p, { phase: "new" }), "door d"), undefined);
    assert.ok(byName(build(p), "door d"));
  });
});

// ================================================================ floors, columns, stairs
describe("buildBuilding — floors, columns, stairs", () => {
  test("a room floor is a slab under the level, as thick as the slab", () => {
    const p = project({ rooms: [{ id: "r", name: "Hall", pts: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] }] }, { twoLevels: true });
    p.rooms.push({ id: "r2", level: "U", name: "Up", pts: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] });
    p.levels[1].slab = 0;
    const g = build(p);
    const floor = byName(g, "floor Hall");
    assert.deepEqual({ ...floor.userData }, { id: "r", kind: "rooms", level: "L" });
    const b = worldBox(floor);
    near(b.min.y, -0.2); near(b.max.y, 0);
    near(volume(floor), 4 * 3 * 0.2, 1e-6);
    assert.ok(isClosed(floor));
    const up = worldBox(byName(g, "floor Up"));
    near(up.max.y, 3.2);
    near(up.min.y, 3.2 - 0.02, 1e-6, "at least 20 mm thick");
    assert.equal(floor.material.name, "oak", "oak by default");
  });

  test("an L-shaped floor keeps its exact area", () => {
    const pts = [[0, 0], [6000, 0], [6000, 3000], [3000, 3000], [3000, 6000], [0, 6000]];
    const g = build(project({ rooms: [{ id: "r", name: "L", pts, floor: "tile-white" }] }));
    const floor = byName(g, "floor L");
    near(volume(floor), 27 * 0.2, 1e-6);
    assert.ok(isClosed(floor));
    assert.equal(floor.material.name, "tile-white");
  });

  test("columns: square prisms with rotation and round cylinders", () => {
    const p = project({ columns: [{ id: "c1", x: 1000, y: 1000, w: 400, d: 200, rot: 90 }, { id: "c2", x: 3000, y: 1000, w: 500, shape: "round", height: 2000 }] });
    const g = build(p);
    const ms = meshes(g).filter((m) => m.userData.kind === "columns");
    assert.equal(ms.length, 2);
    const c1 = ms.find((m) => m.userData.id === "c1");
    const b1 = worldBox(c1);
    near(b1.max.x - b1.min.x, 0.2, 1e-6, "rotated: the depth runs along x");
    near(b1.max.z - b1.min.z, 0.4, 1e-6);
    near(b1.max.y, 2.8);
    near(volume(c1), 0.4 * 0.2 * 2.8, 1e-6);
    const b2 = worldBox(ms.find((m) => m.userData.id === "c2"));
    near(b2.max.y, 2.0, 1e-6, "a column's own height");
    near(b2.max.x - b2.min.x, 0.5, 1e-6);
  });

  test("a stair has one prism per step and climbs to the level above", () => {
    const p = project({ stairs: [{ id: "s", x: 2000, y: 1000, rot: 0, length: 3600, width: 1000, steps: 18 }] }, { twoLevels: true });
    const mesh = meshes(build(p)).find((m) => m.userData.kind === "stairs");
    assert.deepEqual({ ...mesh.userData }, { id: "s", kind: "stairs", level: "L" });
    assert.equal(triCount(mesh), 18 * 12);
    const b = worldBox(mesh);
    near(b.max.y, 3.2, 1e-6, "the top step reaches the floor above");
    near(b.min.y, 0, 1e-6);
    near(b.max.x - b.min.x, 3.6, 1e-6);
    near(b.max.z - b.min.z, 1.0, 1e-6);
  });

  test("a stair on the top level climbs the level height; rotation turns it", () => {
    const p = project({ stairs: [{ id: "s", x: 0, y: 0, rot: 90, length: 3000, width: 1200, steps: 15 }] });
    const mesh = meshes(build(p)).find((m) => m.userData.kind === "stairs");
    const b = worldBox(mesh);
    near(b.max.y, 2.8, 1e-6);
    near(b.max.x - b.min.x, 1.2, 1e-6);
    near(b.max.z - b.min.z, 3.0, 1e-6);
    // The rise goes towards +plan y (world +z) after a 90° turn.
    const top = triangles(mesh).flat().filter((v) => Math.abs(v[1] - 2.8) < 1e-6);
    assert.ok(top.every((v) => v[2] > 1.2), "the top step is at the far end");
  });
});

// ================================================================ furniture, solids, roofs
describe("buildBuilding — furniture, mass models and roofs", () => {
  test("furniture groups are placed, turned and tagged", () => {
    const p = project({ furniture: [{ id: "f", kind: "box", x: 1000, y: 2000, w: 2000, d: 500, h: 750, rot: 0 }, { id: "g", kind: "box", x: 5000, y: 2000, w: 2000, d: 500, h: 750, rot: 90, elevation: 500 }] });
    const root3 = build(p);
    const f = byName(root3, "box f");
    assert.deepEqual({ ...f.userData }, { id: "f", kind: "furniture", level: "L" });
    for (const m of meshes(f)) assert.equal(m.userData.id, "f");
    const bf = worldBox(f);
    near(bf.max.x - bf.min.x, 2.0, 1e-6);
    near(bf.max.z - bf.min.z, 0.5, 1e-6);
    near(bf.min.x, 0, 1e-6);
    const bg = worldBox(byName(root3, "box g"));
    near(bg.max.x - bg.min.x, 0.5, 1e-6, "a quarter turn swaps the footprint");
    near(bg.max.z - bg.min.z, 2.0, 1e-6);
    near(bg.min.y, 0.5, 1e-6, "elevation lifts it");
    near(bg.max.y, 1.25, 1e-6);
  });

  test("every catalogue item builds one mesh per part", () => {
    const list = allFurniture().map((def, i) => ({ id: `f${i}`, ...makeFurniture(def.kind, i * 3000, 0) }));
    const g = build(project({ furniture: list }));
    for (const it of list) {
      const grp = byName(g, `${it.kind} ${it.id}`);
      assert.ok(grp, it.kind);
      assert.equal(meshes(grp).length, furnitureParts(it).length, it.kind);
    }
  });

  test("opts.furniture: false leaves furniture out; imported models get a placeholder", () => {
    const p = project({ furniture: [{ id: "f", kind: "box", x: 0, y: 0 }, { id: "m", kind: "model", model: "asset1", x: 0, y: 0, w: 800, d: 600, h: 1000 }] });
    assert.equal(meshes(build(p, { furniture: false })).filter((m) => m.userData.kind === "furniture").length, 0);
    const ph = byName(build(p), "model m");
    assert.equal(meshes(ph).length, 1);
    const b = worldBox(ph);
    near(b.max.y, 1.0, 1e-6);
    near(b.max.x - b.min.x, 0.8, 1e-6);
  });

  test("an imported model replaces its placeholder once loaded", async () => {
    const p = project({ furniture: [{ id: "m", kind: "model", model: "asset1", x: 0, y: 0, w: 2000, d: 1000, h: 500 }] });
    p.models.push({ id: "asset1", name: "Thing", size: [1000, 1000, 1000] });
    const loaded = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    let done = 0;
    const g = build(p, { loadModel: async () => loaded, onAsync: () => done++ });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(done, 1);
    const grp = byName(g, "model m");
    const ms = meshes(grp);
    assert.equal(ms.length, 1);
    assert.equal(ms[0].userData.id, "m");
    assert.deepEqual(grp.children[0].scale.toArray(), [2, 0.5, 1]);
  });

  test("mass models are tagged prisms; a taper of 0 makes a pyramid", () => {
    const sq = [[0, 0], [3000, 0], [3000, 3000], [0, 3000]];
    const p = project({ solids: [{ id: "box", pts: sq, height: 3000, z0: 500 }, { id: "pyr", pts: sq.map(([x, y]) => [x + 5000, y]), height: 3000, taper: 0 }, { id: "fru", pts: sq.map(([x, y]) => [x + 10000, y]), height: 3000, taper: 0.5 }] });
    const ms = meshes(build(p)).filter((m) => m.userData.kind === "solids");
    assert.equal(ms.length, 3);
    const box = ms.find((m) => m.userData.id === "box");
    const b = worldBox(box);
    near(b.min.y, 0.5); near(b.max.y, 3.5);
    near(volume(box), 9 * 3, 1e-6);
    const pyr = ms.find((m) => m.userData.id === "pyr");
    near(volume(pyr), (9 * 3) / 3, 1e-6);
    assert.ok(isClosed(pyr));
    const fru = ms.find((m) => m.userData.id === "fru");
    near(volume(fru), (3 / 3) * (9 + 2.25 + Math.sqrt(9 * 2.25)), 1e-6);
    assert.ok(isClosed(fru));
    assert.equal(meshes(build(p, { solids: false })).filter((m) => m.userData.kind === "solids").length, 0);
  });

  test("a gable roof peaks at base + (wid / 2)·tan(pitch), with gable walls", () => {
    const walls = rectWalls(0, 0, 8000, 6000);
    const pts = buildingOutlines(walls.map((w) => ({ ...w, level: "L" })))[0];
    const p = project({ walls, roofs: [{ id: "rf", pts, kind: "gable", pitch: 30, overhang: 500, thickness: 200 }] });
    const ms = meshes(build(p)).filter((m) => m.userData.kind === "roofs");
    assert.equal(ms.length, 2, "roof slab and gable ends");
    for (const m of ms) assert.deepEqual([m.userData.id, m.userData.level], ["rf", "L"]);
    const peak = roofModel(p.roofs[0], roofBase(p, p.roofs[0])).peak;
    near(peak, 2800 + 3100 * Math.tan(Math.PI / 6), 1e-6);
    const slab = worldBox(ms[0]);
    near(slab.max.y, peak * M, 1e-6, "the roof top is the peak in metres");
    near(slab.min.y, (2800 - 500 * Math.tan(Math.PI / 6) - 200) * M, 1e-6, "eaves minus the slab thickness");
    near(slab.max.x - slab.min.x, (8200 + 1000) * M, 1e-6, "outline plus overhang");
    const gable = worldBox(ms[1]);
    assert.ok(gable.max.y < peak * M, "gables stop under the slab");
    near(gable.min.y, 2.8, 1e-6);
  });

  test("flat, hip and shed roofs build; opts.roofs: false leaves them out", () => {
    for (const kind of ["flat", "hip", "shed"]) {
      const p = project({ roofs: [{ id: "rf", pts: [[0, 0], [8000, 0], [8000, 6000], [0, 6000]], kind, pitch: 20, overhang: 300, thickness: 150 }] });
      const ms = meshes(build(p)).filter((m) => m.userData.kind === "roofs");
      assert.equal(ms.length, kind === "shed" ? 2 : 1, kind);
      const top = worldBox(ms[0]).max.y;
      near(top, roofModel(p.roofs[0], 2800).peak * M, 1e-6, `${kind} peak`);
      assert.equal(meshes(build(p, { roofs: false })).filter((m) => m.userData.kind === "roofs").length, 0);
    }
  });

  test("a flat roof slab holds its plan area times thickness", () => {
    const p = project({ roofs: [{ id: "rf", pts: [[0, 0], [8000, 0], [8000, 6000], [0, 6000]], kind: "flat", overhang: 0, thickness: 200 }] });
    const slab = meshes(build(p)).find((m) => m.userData.kind === "roofs");
    near(volume(slab), 48 * 0.2, 1e-4);
    assert.ok(isClosed(slab));
  });
});

// ================================================================ levels, extents, materials
describe("buildBuilding — levels and extent", () => {
  test("one group per level, named and tagged; opts.levels hides the others", () => {
    const p = project({ walls: [wall("a", 0, 0, 4000, 0), wall("b", 0, 0, 4000, 0, 200, { level: "U" })] }, { twoLevels: true });
    const g = build(p, { levels: new Set(["L"]) });
    assert.equal(g.name, "building");
    assert.equal(g.children.length, 2);
    const [lg, ug] = g.children;
    assert.equal(lg.name, "level:1F");
    assert.equal(ug.name, "level:2F");
    assert.deepEqual(lg.userData, { level: "L" });
    assert.equal(lg.visible, true);
    assert.equal(ug.visible, false);
    assert.equal(byName(ug, "wall b").userData.level, "U");
    assert.ok(build(p).children.every((c) => c.visible), "all visible without opts.levels");
  });

  test("an empty project builds an empty level group", () => {
    const g = build(normalizeProject(newProject()));
    assert.equal(g.children.length, 1);
    assert.equal(meshes(g).length, 0);
  });

  test("modelExtent covers walls, rooms, roofs and furniture (plan millimetres) and the top", () => {
    const p = project({ walls: rectWalls(0, 0, 6000, 4000), furniture: [{ id: "f", kind: "box", x: -3000, y: 9000 }] });
    const e = modelExtent(p);
    assert.deepEqual([e.x1, e.y1, e.x2, e.y2], [-3000, 0, 6000, 9000]);
    assert.equal(e.top, 2800);
    p.roofs.push({ id: "rf", level: "L", pts: [[0, 0], [6000, 0], [6000, 4000], [0, 4000]], kind: "gable", pitch: 45, overhang: 0 });
    normalizeProject(p);
    near(modelExtent(p).top, 2800 + 2000, 1e-6);
    p.solids.push({ id: "s", level: "L", pts: [[0, 0], [1000, 0], [1000, 1000]], height: 9000, z0: 100 });
    normalizeProject(p);
    near(modelExtent(p).top, 9100, 1e-6);
  });

  test("modelExtent's top includes tall furniture such as trees", () => {
    const p = project({ walls: [wall("a", 0, 0, 4000, 0)], furniture: [{ id: "t", kind: "tree", x: 0, y: 5000, w: 3000, d: 3000, h: 5500 }] });
    assert.ok(modelExtent(p).top >= 5500, `top ${modelExtent(p).top}`);
  });

  test("modelExtent of an empty project is a default 10 m box", () => {
    assert.deepEqual(modelExtent(normalizeProject(newProject())), { x1: -5000, y1: -5000, x2: 5000, y2: 5000, top: 3000 });
  });

  for (const { file } of sampleIndex) {
    test(`the sample ${file} builds with one tagged mesh per item`, () => {
      const p = loadSample(file);
      const g = build(p);
      const ms = meshes(g);
      for (const m of ms) {
        assert.ok(m.userData.id, `${m.name} has an id`);
        assert.ok(["walls", "openings", "rooms", "columns", "stairs", "furniture", "roofs", "solids"].includes(m.userData.kind), m.userData.kind);
        assert.ok(p.levels.some((l) => l.id === m.userData.level));
        const pos = m.geometry.getAttribute("position");
        for (let i = 0; i < pos.array.length; i++) assert.ok(Number.isFinite(pos.array[i]), `${m.name}: finite positions`);
      }
      const ids = (kind) => new Set(ms.filter((m) => m.userData.kind === kind).map((m) => m.userData.id));
      assert.equal(ids("walls").size, p.walls.length);
      assert.equal(ids("rooms").size, p.rooms.length);
      assert.equal(ids("furniture").size, p.furniture.length);
      assert.equal(ids("stairs").size, p.stairs.length);
      assert.equal(ids("columns").size, p.columns.length);
      assert.equal(ids("roofs").size, p.roofs.length);
      const withFrames = p.openings.filter((o) => o.kind !== "opening").length;
      assert.equal(ids("openings").size, withFrames);
      const wallVol = ms.filter((m) => m.userData.kind === "walls").reduce((s, m) => s + volume(m), 0);
      if (p.walls.length) assert.ok(wallVol > 0, "walls have volume");
      const e = modelExtent(p);
      // Buildings (not furniture such as tall trees) stay under the extent's top.
      const top = Math.max(0, ...ms.filter((m) => m.userData.kind !== "furniture").map((m) => worldBox(m).max.y));
      assert.ok(top * 1000 <= e.top + 1, `building top ${top * 1000} vs extent ${e.top}`);
    });
  }
});

describe("makeMaterials", () => {
  test("surface materials are cached per id and fall back to a colour", () => {
    const m = mats();
    const a = m.surface("brick", "#000000");
    assert.equal(a, m.surface("brick", "#000000"), "cached");
    assert.equal(a.color.getHexString(), "a65a42");
    assert.equal(a.map, null, "no textures in Node / when disabled");
    assert.equal(a.name, "brick");
    assert.equal(a.side, THREE.DoubleSide);
    const raw = m.surface("#123456");
    assert.equal(raw.color.getHexString(), "123456");
    const unknown = m.surface("no-such", "#abcdef");
    assert.equal(unknown.color.getHexString(), "abcdef");
    const glass = m.surface("glass");
    assert.equal(glass.transparent, true);
    assert.ok(glass.opacity < 1);
    const metal = m.surface("roof-metal");
    assert.ok(metal.metalness > 0);
  });

  test("colour, glass, frame and door materials", () => {
    const m = mats();
    const c = m.color("#ff0000", { opacity: 0.5 });
    assert.equal(c.transparent, true);
    assert.equal(c.side, THREE.DoubleSide);
    const solid = m.color("#ff0000");
    assert.notEqual(solid, c);
    assert.equal(solid.transparent, false);
    assert.equal(solid.side, THREE.FrontSide);
    assert.equal(m.color("#ff0000"), solid, "cached by options");
    assert.equal(m.glass().transparent, true);
    assert.equal(m.glass().depthWrite, false);
    assert.equal(m.frame().name, "frame");
    assert.equal(m.door().name, "door");
    m.dispose();
    assert.notEqual(m.frame(), undefined, "materials are rebuilt after dispose");
  });
});

// ================================================================ furniture library
describe("lib/furniture.js", () => {
  // Items with accessories standing on top of the body (TV, lamp, monitor,
  // tap, wall cabinets, headboard).
  const TALL_ACCESSORIES = new Set(["tvUnit", "doubleBed", "singleBed", "nightstand", "desk", "counter", "sinkCounter", "washbasin", "officeDesk"]);

  const extent = (it) => {
    let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity, z1 = Infinity, z2 = -Infinity;
    for (const p of furnitureParts(it)) {
      const [hx, hy, zb, zt] = p.t === "box" ? [p.w / 2, p.d / 2, p.z, p.z + p.h] : p.t === "cyl" ? [p.rx, p.ry, p.z, p.z + p.h] : [p.r, p.r, p.z - p.r, p.z + p.r];
      x1 = Math.min(x1, p.x - hx); x2 = Math.max(x2, p.x + hx); y1 = Math.min(y1, p.y - hy); y2 = Math.max(y2, p.y + hy); z1 = Math.min(z1, zb); z2 = Math.max(z2, zt);
    }
    return { x1, x2, y1, y2, z1, z2 };
  };

  test("the catalogue has unique kinds, categories and sensible sizes", () => {
    const all = allFurniture();
    assert.ok(all.length >= 40);
    assert.equal(new Set(all.map((d) => d.kind)).size, all.length);
    assert.deepEqual(FURNITURE_CATEGORIES, [...new Set(all.map((d) => d.cat))]);
    for (const c of ["Living", "Dining", "Bedroom", "Kitchen", "Bathroom", "Office", "Outdoor", "Other"]) assert.ok(FURNITURE_CATEGORIES.includes(c), c);
    for (const d of all) {
      assert.ok(d.w > 0 && d.d > 0 && d.h > 0, d.kind);
      assert.ok(d.name.length > 1);
      assert.ok(COLORS[d.color], `${d.kind} colour key`);
    }
    all.pop();
    assert.equal(allFurniture().length, all.length + 1, "allFurniture returns a copy");
  });

  for (const def of allFurniture()) {
    test(`catalogue item ${def.kind}: parts are valid and fit its box`, () => {
      const it = makeFurniture(def.kind, 0, 0);
      const parts = furnitureParts(it);
      assert.ok(parts.length > 0);
      for (const p of parts) {
        assert.ok(["box", "cyl", "sph"].includes(p.t));
        assert.match(p.color, /^#[0-9a-f]{6}$/i, `${def.kind} part colour ${p.c}`);
        for (const k of ["x", "y", "z"]) assert.ok(Number.isFinite(p[k]));
        if (p.t === "box") assert.ok(p.w > 0 && p.d > 0 && p.h > 0, `${def.kind} box size`);
        if (p.t === "cyl") assert.ok(p.rx > 0 && p.ry > 0 && p.h > 0, `${def.kind} cylinder size`);
        if (p.t === "sph") assert.ok(p.r > 0);
      }
      const e = extent(it);
      const tol = (s) => s * 0.025 + 1;
      assert.ok(e.z1 >= -0.11 * it.h, `${def.kind}: nothing deep below the floor (${e.z1})`);
      assert.ok(e.z2 <= (TALL_ACCESSORIES.has(def.kind) ? 2.5 : 1.01) * it.h, `${def.kind}: height ${e.z2} vs ${it.h}`);
      assert.ok(-e.x1 <= it.w / 2 + tol(it.w) && e.x2 <= it.w / 2 + tol(it.w), `${def.kind}: width ${e.x1}…${e.x2} vs ${it.w}`);
      if (def.kind !== "washer") assert.ok(-e.y1 <= it.d / 2 + tol(it.d) && e.y2 <= it.d / 2 + tol(it.d), `${def.kind}: depth ${e.y1}…${e.y2} vs ${it.d}`);
    });
  }

  test("the washing machine's door stays within its depth", () => {
    const it = makeFurniture("washer", 0, 0);
    const e = extent(it);
    assert.ok(e.y2 <= it.d / 2 + 20, `front at ${e.y2} for a depth of ${it.d}`);
  });

  test("parts scale with the item size", () => {
    const small = makeFurniture("diningTable4", 0, 0);
    const big = makeFurniture("diningTable4", 0, 0, { w: 2800, d: 1600 });
    const es = extent(small), eb = extent(big);
    near(eb.x2 - eb.x1, 2 * (es.x2 - es.x1), 1e-6);
    near(eb.y2 - eb.y1, 2 * (es.y2 - es.y1), 1e-6);
  });

  test("makeFurniture fills in the catalogue defaults", () => {
    const it = makeFurniture("sofa3", 100, 200);
    assert.deepEqual(it, { kind: "sofa3", x: 100, y: 200, rot: 0, w: 2100, d: 900, h: 800, elevation: 0, color: null });
    const custom = makeFurniture("sofa3", 0, 0, { w: 2400, rot: 90, color: "#ff0000" });
    assert.equal(custom.w, 2400);
    assert.equal(custom.rot, 90);
    assert.equal(custom.color, "#ff0000");
    const unknown = makeFurniture("spaceship", 1, 2);
    assert.equal(unknown.kind, "box");
    assert.equal(unknown.w, 1000);
  });

  test("furnitureDef and furnitureParts for known and unknown kinds", () => {
    assert.equal(furnitureDef("chair").name, "Chair");
    assert.equal(furnitureDef("nope"), null);
    const parts = furnitureParts({ kind: "nope", w: 100, d: 200, h: 300 });
    assert.equal(parts.length, 1);
    assert.deepEqual([parts[0].t, parts[0].w, parts[0].d, parts[0].h], ["box", 100, 200, 300]);
  });

  test("the item colour replaces the main colour only", () => {
    const parts = furnitureParts({ ...makeFurniture("sofa3", 0, 0), color: "#112233" });
    assert.ok(parts.filter((p) => p.c === "main").every((p) => p.color === "#112233"));
    assert.ok(parts.filter((p) => p.c === "cushion").every((p) => p.color === COLORS.cushion));
    const plain = furnitureParts(makeFurniture("sofa3", 0, 0));
    assert.ok(plain.filter((p) => p.c === "main").every((p) => p.color === COLORS.fabric), "the catalogue colour by default");
  });

  test("furnitureCorners follows position and rotation", () => {
    assert.deepEqual(furnitureCorners({ x: 0, y: 0, w: 2000, d: 1000 }), [[-1000, -500], [1000, -500], [1000, 500], [-1000, 500]]);
    const c = furnitureCorners({ x: 100, y: 200, w: 2000, d: 1000, rot: 90 });
    const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
    near(Math.min(...xs), -400, 1e-9); near(Math.max(...xs), 600, 1e-9);
    near(Math.min(...ys), -800, 1e-9); near(Math.max(...ys), 1200, 1e-9);
    const d = furnitureCorners({ x: 0, y: 0, w: 1000, d: 1000, rot: 45 });
    near(Math.max(...d.map((p) => p[0])), 500 * Math.SQRT2, 1e-9);
  });

  test("drawFurniturePlan draws one filled and stroked shape per part", () => {
    const th = PLAN_THEMES.dark;
    for (const def of allFurniture()) {
      const it = makeFurniture(def.kind, 0, 0);
      const n = furnitureParts(it).length;
      const ctx = fakeCtx();
      drawFurniturePlan(ctx, it, th, 10);
      assert.equal(ctx.calls.beginPath, n, def.kind);
      assert.equal(ctx.calls.fill, n);
      assert.equal(ctx.calls.stroke, n);
      assert.equal(ctx.lineWidth, 10);
      assert.equal(ctx.strokeStyle, th.furniture);
      assert.ok(ctx.fills.every((f) => f === th.furnitureFill));
    }
  });

  test("drawFurniturePlan uses rect when roundRect is missing", () => {
    const ctx = fakeCtx({ roundRect: false });
    drawFurniturePlan(ctx, makeFurniture("sofa3", 0, 0), PLAN_THEMES.light);
    assert.ok(ctx.calls.rect > 0);
    assert.equal(ctx.lineWidth, 10, "one pixel defaults to 10 mm");
    const round = fakeCtx();
    drawFurniturePlan(round, makeFurniture("sofa3", 0, 0), PLAN_THEMES.light);
    assert.ok(round.calls.roundRect > 0);
    const cyl = fakeCtx();
    drawFurniturePlan(cyl, makeFurniture("roundTable", 0, 0), PLAN_THEMES.light);
    assert.equal(cyl.calls.ellipse, 3);
    const sph = fakeCtx();
    drawFurniturePlan(sph, makeFurniture("shrub", 0, 0), PLAN_THEMES.light);
    assert.equal(sph.calls.arc, 1);
  });
});

// ================================================================ materials library
describe("lib/materials.js", () => {
  const PATTERNS = [null, "brick", "noise", "stone", "planks", "tiles", "rooftiles", "seams"];

  test("material ids are unique and colours are valid", () => {
    assert.equal(new Set(MATERIALS.map((m) => m.id)).size, MATERIALS.length);
    for (const m of MATERIALS) {
      assert.match(m.color, /^#[0-9a-f]{6}$/i, m.id);
      assert.ok(m.name.length > 1);
      assert.ok(Array.isArray(m.use) && m.use.length > 0);
      assert.ok(PATTERNS.includes(m.pattern), `${m.id} pattern ${m.pattern}`);
      if (m.pattern) assert.ok(m.tile > 0, `${m.id} has a tile size`);
    }
  });

  test("materialsFor filters by use", () => {
    for (const use of ["wall", "floor", "roof", "layer"]) {
      const list = materialsFor(use);
      assert.ok(list.length > 0, use);
      assert.ok(list.every((m) => m.use.includes(use)));
    }
    assert.ok(materialsFor("wall").some((m) => m.id === "brick"));
    assert.ok(materialsFor("floor").some((m) => m.id === "oak"));
    assert.ok(materialsFor("roof").some((m) => m.id === "roof-tiles"));
    assert.deepEqual(materialsFor("ceiling"), []);
  });

  test("the default materials exist with the right use", () => {
    assert.ok(materialById(DEFAULT_MATERIAL.wall).use.includes("wall"));
    assert.ok(materialById(DEFAULT_MATERIAL.exterior).use.includes("wall"));
    assert.ok(materialById(DEFAULT_MATERIAL.floor).use.includes("floor"));
    assert.ok(materialById(DEFAULT_MATERIAL.roof).use.includes("roof"));
  });

  test("every material used by the default wall types exists", async () => {
    const { DEFAULT_WALL_TYPES } = await import("../../src/core/project.js");
    for (const wt of DEFAULT_WALL_TYPES) for (const l of wt.layers) assert.ok(materialById(l.material), `${wt.id}: ${l.material}`);
  });

  test("materialById and materialColor", () => {
    assert.equal(materialById("oak").name, "Oak floor");
    assert.equal(materialById("nope"), null);
    assert.equal(materialById(undefined), null);
    assert.equal(materialColor("oak"), "#c49a6c");
    assert.equal(materialColor("#ABCDEF"), "#ABCDEF", "raw colours pass through");
    assert.equal(materialColor("nope"), "#cccccc");
    assert.equal(materialColor("nope", "#010203"), "#010203");
    assert.equal(materialColor(null, "#010203"), "#010203");
    assert.equal(materialColor("#abc"), "#cccccc", "short hex is not a colour here");
  });

  for (const m of MATERIALS) {
    test(`paintPattern paints ${m.id} (${m.pattern || "plain"}) deterministically`, () => {
      const a = fakeCtx();
      paintPattern(a, m, 256);
      const b = fakeCtx();
      paintPattern(b, m, 256);
      assert.equal(a.fills[0], m.color, "starts with the base colour");
      assert.ok(a.calls.fillRect >= 1);
      assert.deepEqual(a.fills, b.fills, "the same colours every time");
      assert.deepEqual(a.calls, b.calls);
      for (const f of a.fills.slice(1)) assert.match(f, /^rgb\(\d{1,3},\d{1,3},\d{1,3}\)$/);
      if (!m.pattern) assert.equal(a.fills.length, 1, "a plain material is one fill");
      else assert.ok(a.fills.length > 1, "a pattern adds shades");
    });
  }

  test("paintPattern draws each pattern with its own strokes", () => {
    const of = (id) => { const c = fakeCtx(); paintPattern(c, materialById(id), 128); return c.calls; };
    assert.ok(of("tile-white").stroke >= 5, "tile grout lines");
    assert.ok(of("oak").bezierCurveTo > 0, "wood grain");
    assert.ok(of("stone").ellipse === 40, "forty stones");
    assert.ok(of("roof-tiles").quadraticCurveTo > 0, "rounded tiles");
    assert.equal(of("concrete").fillRect, 1801, "noise: base + 1800 specks");
    assert.equal(of("roof-metal").fillRect, 11, "seams: base + 2 × 5");
    assert.equal(of("brick").fillRect, 2 + 8 * 4, "bricks: base, mortar, 8 rows × 4");
  });
});
