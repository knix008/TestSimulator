// Unit tests for the interior design tools: wall faces finished by the wall
// or by the room they face, skirting boards (src/view3d/build.js) and the
// material library they draw on (src/lib/materials.js).
// Run: node --test test/unit/interior.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../src/vendor/three/three.module.js";
import { buildBuilding, makeMaterials, wallFinishes } from "../../src/view3d/build.js";
import { newProject, normalizeProject } from "../../src/core/project.js";
import { MATERIALS, materialById } from "../../src/lib/materials.js";

const mats = () => makeMaterials(THREE, { textures: false });
function project(items = {}) {
  const p = newProject("Interior");
  p.levels[0].id = "L";
  p.view.level = "L";
  for (const [k, list] of Object.entries(items)) p[k] = list.map((it) => (k === "openings" ? it : { level: "L", ...it }));
  return normalizeProject(p);
}
const wall = (id, x1, y1, x2, y2, extra = {}) => ({ id, x1, y1, x2, y2, thickness: 200, ...extra });
// A 4 × 3 m room inside four 200 mm walls (room edges on the walls' inner faces).
const box = (extra = {}, roomExtra = {}) => project({
  walls: [wall("n", 0, 0, 4000, 0, extra.n), wall("e", 4000, 0, 4000, 3000), wall("s", 4000, 3000, 0, 3000), wall("w", 0, 3000, 0, 0)],
  rooms: [{ id: "r", name: "Room", pts: [[100, 100], [3900, 100], [3900, 2900], [100, 2900]], ...roomExtra }],
  openings: extra.openings || [],
});
const meshesOf = (root, id) => { const out = []; root.traverse((o) => { if (o.isMesh && o.userData.id === id) out.push(o); }); return out; };
const area = (mesh) => {
  const pos = mesh.geometry.getAttribute("position");
  let s = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) { a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2); s += b.sub(a).cross(c.sub(a)).length() / 2; }
  return s;
};

describe("wall finishes", () => {
  test("a plain wall stays one mesh in its own material", () => {
    const m = meshesOf(buildBuilding(THREE, box(), mats()), "n");
    assert.equal(m.length, 1);
  });

  test("finishR / finishL paint one face each; the rest keeps the wall material", () => {
    const p = box({ n: { finishR: "paint-navy", finishL: "brick" } });
    const m = meshesOf(buildBuilding(THREE, p, mats()), "n");
    const by = new Map(m.map((x) => [x.userData.finish || "core", x]));
    assert.deepEqual([...by.keys()].sort(), ["brick", "core", "paint-navy"]);
    // Wall "n" runs east along y = 0: its right-hand side (finishR) faces +y, into the room.
    const navy = by.get("paint-navy");
    navy.geometry.computeBoundingBox();
    assert.ok(navy.geometry.boundingBox.min.z > 0.09, "navy face is on the room side (z = +0.1 m)");
    assert.equal(navy.material.name, "paint-navy");
    // Each face is length × height (the outline is mitred, so within the thickness).
    const H = 2.8;
    assert.ok(Math.abs(area(navy) - 3.8 * H) < 0.3, `face area ${area(navy)}`);
  });

  test("a room's wall finish covers every wall face that looks into it", () => {
    const p = box({}, { wallFinish: "tile-subway" });
    const root = buildBuilding(THREE, p, mats());
    for (const id of ["n", "e", "s", "w"]) {
      const fin = meshesOf(root, id).filter((x) => x.userData.finish === "tile-subway");
      assert.equal(fin.length, 1, id);
      assert.ok(Math.abs(area(fin[0]) - (id === "n" || id === "s" ? 3.8 : 2.8) * 2.8) < 0.3, `${id} ${area(fin[0])}`);
    }
  });

  test("the wall's own finish wins over the room's", () => {
    const p = box({ n: { finishR: "paint-teal" } }, { wallFinish: "tile-subway" });
    const fins = meshesOf(buildBuilding(THREE, p, mats()), "n").map((x) => x.userData.finish).filter(Boolean);
    assert.deepEqual(fins, ["paint-teal"]);
  });

  test("openings keep their reveals in the wall material", () => {
    const p = box({ openings: [{ id: "d", wall: "n", kind: "door", at: 2000, width: 900, height: 2100, sill: 0 }] }, { wallFinish: "paint-olive" });
    const finished = meshesOf(buildBuilding(THREE, p, mats()), "n").find((x) => x.userData.finish === "paint-olive");
    assert.ok(Math.abs(area(finished) - (3.8 * 2.8 - 0.9 * 2.1)) < 0.3, `area ${area(finished)}`);
  });

  test("wallFinishes is null when nothing is finished", () => {
    assert.equal(wallFinishes({ x1: 0, y1: 0, x2: 1, y2: 0 }, []), null);
  });
});

describe("skirting", () => {
  const skirting = (p) => { const out = []; buildBuilding(THREE, p, mats()).traverse((o) => { if (o.isMesh && /^skirting/.test(o.name)) out.push(o); }); return out; };

  test("no skirting unless the room asks for it", () => {
    assert.equal(skirting(box()).length, 0);
  });

  test("runs round the room at its height, inside the room", () => {
    const [s] = skirting(box({}, { skirting: 80, skirtingMaterial: "walnut" }));
    assert.ok(s);
    s.geometry.computeBoundingBox();
    const bb = s.geometry.boundingBox;
    assert.ok(Math.abs(bb.max.y - 0.08) < 1e-6 && Math.abs(bb.min.y) < 1e-6);
    assert.ok(bb.min.x >= 0.1 - 1e-6 && bb.max.x <= 3.9 + 1e-6, "inside the room");
    assert.equal(s.material.name, "walnut");
    assert.equal(s.userData.kind, "rooms");
  });

  test("stops at a door but runs under a window", () => {
    const len = (p) => { const [s] = skirting(p); const pos = s.geometry.getAttribute("position"); let top = 0; for (let i = 0; i < pos.count; i += 3) { const ys = [0, 1, 2].map((k) => pos.getY(i + k)); if (ys.every((y) => Math.abs(y - 0.08) < 1e-6)) top += area({ geometry: new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([0, 1, 2].flatMap((k) => [pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k)]), 3)) }); } return top / 0.015; };
    const plain = len(box({}, { skirting: 80 }));
    const door = len(box({ openings: [{ id: "d", wall: "n", kind: "door", at: 2000, width: 900, height: 2100, sill: 0 }] }, { skirting: 80 }));
    const win = len(box({ openings: [{ id: "o", wall: "n", kind: "window", at: 2000, width: 900, height: 1200, sill: 900 }] }, { skirting: 80 }));
    assert.ok(Math.abs(plain - 2 * (3.8 + 2.8)) < 0.1, `perimeter ${plain}`);
    assert.ok(Math.abs(plain - door - 0.9) < 0.05, `door gap ${plain - door}`);
    assert.ok(Math.abs(plain - win) < 0.01, "a window does not cut it");
  });

  test("normalize keeps the finishes and clamps the skirting height", () => {
    const p = box({}, { skirting: 9999, wallFinish: "paint-navy", skirtingMaterial: 5 });
    assert.equal(p.rooms[0].skirting, 400);
    assert.equal(p.rooms[0].wallFinish, "paint-navy");
    assert.equal("skirtingMaterial" in p.rooms[0], false);
  });
});

describe("material library", () => {
  test("enough choice for interiors, structures and landscape", () => {
    assert.ok(MATERIALS.length >= 90, `${MATERIALS.length} materials`);
    for (const id of ["paint-navy", "oak-herringbone", "tile-subway", "terrazzo", "corten", "asphalt", "steel-red", "cable"]) assert.ok(materialById(id), id);
  });

  test("surface physics reach the 3D materials", () => {
    const m = mats();
    assert.ok(m.surface("stainless").metalness > 0.9);
    assert.ok(m.surface("marble-black").roughness < 0.3);
    assert.ok(m.surface("carpet-wool").roughness > 0.9);
    assert.equal(m.surface("water").transparent, true);
  });
});

describe("plan", () => {
  test("wall finishes show as bands in their colour along the faces", async () => {
    const { drawPlan, PLAN_THEMES } = await import("../../src/plan/render.js");
    const strokes = new Set();
    const ctx = new Proxy({}, { get(t, k) { if (k === "measureText") return () => ({ width: 10 }); if (k in t) return t[k]; return () => { if (k === "stroke") strokes.add(t.strokeStyle); }; }, set(t, k, v) { t[k] = v; return true; } });
    const th = Object.values(PLAN_THEMES)[0];
    drawPlan(ctx, box({ n: { finishL: "brick" } }, { wallFinish: "paint-navy" }), th, { level: "L", px: 0.05, lw: 10 });
    assert.ok(strokes.has("#2f3d58"), "room finish (navy)");
    assert.ok(strokes.has("#a65a42"), "wall's own finish (brick)");
  });
});
