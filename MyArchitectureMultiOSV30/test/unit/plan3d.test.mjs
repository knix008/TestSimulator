// 2D plan → 3D model: what is drawn on the plan has to come out of
// buildBuilding (src/view3d/build.js) where the plan says, the way the plan
// says. Walls, door and window holes, room floors, furniture position and
// turn, wall-mounted items backing onto a wall, stair wells cut through the
// floor above (headroom over every tread — in every sample too), the swing
// data the walk-through uses to open doors, and the dressed interiors of the
// samples (scripts/sample-dress.mjs). three.js runs in Node for the geometry
// and its Raycaster stands in for the eye.
// Run: node --test test/unit/plan3d.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "../../src/vendor/three/three.module.js";
import { buildBuilding, makeMaterials, M } from "../../src/view3d/build.js";
import { newProject, normalizeProject, newLevel, parseProject, levelAbove } from "../../src/core/project.js";
import { makeFurniture, furnitureDef, furnitureParts, furnitureCorners } from "../../src/lib/furniture.js";
import { stairLayout, stairRise, stairWellParts, stairWellsInto, stairWellsOn, minusConvex } from "../../src/core/elements/geometry.js";
import { OPEN_ANGLE } from "../../src/core/doors.js";
import { polygonArea, pointInPolygon, pointSegDist } from "../../src/core/geom.js";

const root = path.resolve(import.meta.dirname, "..", "..");
const sampleIndex = JSON.parse(fs.readFileSync(path.join(root, "sample", "index.json"), "utf8"));
const loadSample = (file) => parseProject(fs.readFileSync(path.join(root, "sample", file), "utf8"));
const build = (p, opts) => { const g = buildBuilding(THREE, p, makeMaterials(THREE, { textures: false }), opts); g.updateMatrixWorld(true); return g; };
const near = (a, b, tol, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a} (tol ${tol})`);
const area = (pts) => Math.abs(polygonArea(pts));
const areaOf = (polys) => polys.reduce((s, q) => s + area(q), 0);
const meshes = (obj) => { const out = []; obj.traverse((c) => { if (c.isMesh) out.push(c); }); return out; };

// A project on level "L" (2800 high, slab 200), optionally with "U" above at 3200.
function project(items = {}, { twoLevels = false } = {}) {
  const p = newProject("plan3d");
  p.levels[0].id = "L";
  p.view.level = "L";
  if (twoLevels) p.levels.push({ ...newLevel("2F", 3200, 3000), id: "U" });
  for (const [k, list] of Object.entries(items)) p[k] = list.map((it) => (k === "openings" ? it : { level: "L", ...it }));
  return normalizeProject(p);
}
const wall = (id, x1, y1, x2, y2, thickness = 200, extra = {}) => ({ id, x1, y1, x2, y2, thickness, ...extra });
const rect = (x1, y1, x2, y2) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];

// The first thing of the given kinds a ray meets: plan mm in, {kind, id, dist (mm)} out.
function firstHit(g, from, dir, kinds = null, far = 1e6) {
  const rc = new THREE.Raycaster(new THREE.Vector3(from[0] * M, from[2] * M, from[1] * M), new THREE.Vector3(dir[0], dir[2], dir[1]).normalize(), 0, far * M);
  for (const h of rc.intersectObject(g, true)) {
    if (!h.object.isMesh) continue;
    if (kinds && !kinds.includes(h.object.userData.kind)) continue;
    return { kind: h.object.userData.kind, id: h.object.userData.id, dist: h.distance / M };
  }
  return null;
}
// Plan area of a floor mesh's upward faces (mm²).
function upArea(mesh, y) {
  const pos = mesh.geometry.getAttribute("position");
  let s = 0;
  for (let i = 0; i < pos.count; i += 3) {
    const a = [pos.getX(i), pos.getY(i), pos.getZ(i)], b = [pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)], c = [pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2)];
    if ([a, b, c].some((q) => Math.abs(q[1] - y) > 1e-6)) continue;
    s += Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])) / 2;
  }
  return s / (M * M);
}

// ================================================================ walls, openings, floors, furniture
describe("2D plan → 3D: a room drawn on the plan", () => {
  // A 5 × 4 m room: door in the south wall, window in the north wall, a sofa.
  const room = () => project({
    walls: [wall("n", 0, 0, 5000, 0), wall("e", 5000, 0, 5000, 4000), wall("s", 5000, 4000, 0, 4000), wall("w", 0, 4000, 0, 0)],
    openings: [{ id: "d", wall: "s", kind: "door", at: 2500, width: 900, height: 2100, sill: 0, side: 1 }, { id: "win", wall: "n", kind: "window", at: 2500, width: 1500, height: 1200, sill: 900 }],
    rooms: [{ id: "r", name: "Living room", pts: rect(100, 100, 4900, 3900) }],
    furniture: [{ id: "f", ...makeFurniture("sofa3", 2500, 3300), rot: 180 }],
  });

  test("the walls stand on their plan lines, as high as the level", () => {
    const g = build(room());
    for (const w of room().walls) {
      const m = meshes(g).filter((x) => x.userData.kind === "walls" && x.userData.id === w.id);
      assert.ok(m.length, `wall ${w.id} has a mesh`);
      const b = new THREE.Box3();
      for (const x of m) b.expandByObject(x);
      near(b.min.y, 0, 1e-6, `${w.id} bottom`);
      near(b.max.y, 2.8, 1e-6, `${w.id} top`);
      // Its centre line lies inside its box (plan x → world X, plan y → world Z).
      for (const t of [0.25, 0.5, 0.75]) {
        const x = (w.x1 + (w.x2 - w.x1) * t) * M, z = (w.y1 + (w.y2 - w.y1) * t) * M;
        assert.ok(x >= b.min.x - 1e-6 && x <= b.max.x + 1e-6 && z >= b.min.z - 1e-6 && z <= b.max.z + 1e-6, `${w.id} covers its line at ${t}`);
      }
    }
  });

  test("the window and the door are holes the eye can look through; the wall beside them is solid", () => {
    const g = build(room());
    // Across the north wall (y = 0): through the window at sill + 600, beside it at the same height.
    assert.equal(firstHit(g, [2500, 1000, 1500], [0, -1, 0], ["walls"]), null, "through the window");
    assert.equal(firstHit(g, [700, 1000, 1500], [0, -1, 0], ["walls"]).id, "n", "beside the window");
    assert.equal(firstHit(g, [2500, 1000, 500], [0, -1, 0], ["walls"]).id, "n", "under the sill");
    // Across the south wall: through the door at 1 m, above its head at 2.4 m.
    assert.equal(firstHit(g, [2500, 3000, 1000], [0, 1, 0], ["walls"]), null, "through the door");
    assert.equal(firstHit(g, [2500, 3000, 2400], [0, 1, 0], ["walls"]).id, "s", "over the door head");
  });

  test("the floor is the room's polygon at the level's floor", () => {
    const g = build(room());
    const floor = meshes(g).find((m) => m.userData.kind === "rooms");
    near(upArea(floor, 0), 4800 * 3800, 1, "floor area");
    assert.equal(firstHit(g, [2500, 2000, 5000], [0, 0, -1], ["rooms"]).id, "r");
    assert.equal(firstHit(g, [6000, 2000, 5000], [0, 0, -1], ["rooms"]), null, "no floor outside the room");
  });

  test("furniture stands at its plan point and covers its plan outline", () => {
    const p = room();
    const g = build(p);
    const grp = g.getObjectByName("sofa3 f");
    near(grp.position.x, 2.5, 1e-9); near(grp.position.z, 3.3, 1e-9); near(grp.position.y, 0, 1e-9);
    const b = new THREE.Box3().setFromObject(grp);
    const c = furnitureCorners(p.furniture[0]);
    const xs = c.map((q) => q[0] * M), zs = c.map((q) => q[1] * M);
    near(b.min.x, Math.min(...xs), 0.03); near(b.max.x, Math.max(...xs), 0.03);
    near(b.min.z, Math.min(...zs), 0.03); near(b.max.z, Math.max(...zs), 0.03);
  });

  // The plan's turn: an item's back (local −y) ends up towards (sin rot, −cos rot).
  for (const rot of [0, 90, 180, 270]) {
    test(`an item turned ${rot}° on the plan has its back the same way in 3D`, () => {
      const p = project({ furniture: [{ id: "b", ...makeFurniture("doubleBed", 3000, 3000), rot }] });
      const g = build(p);
      const head = furnitureParts(p.furniture[0]).filter((q) => q.t === "box").sort((a, b) => b.z + b.h - (a.z + a.h))[0];
      // The headboard's mesh is the tallest part: find the world point at its height.
      const hit = firstHit(g, [3000 + Math.sin((rot * Math.PI) / 180) * 1500, 3000 - Math.cos((rot * Math.PI) / 180) * 1500, head.h - 50], [-Math.sin((rot * Math.PI) / 180), Math.cos((rot * Math.PI) / 180), 0], ["furniture"]);
      assert.ok(hit, "a ray from behind the bed hits it at headboard height");
      near(hit.dist, 1500 - Math.abs(head.y) - head.d / 2, 30, "the headboard is at the back");
      const front = firstHit(g, [3000 - Math.sin((rot * Math.PI) / 180) * 1500, 3000 + Math.cos((rot * Math.PI) / 180) * 1500, head.h - 50], [Math.sin((rot * Math.PI) / 180), -Math.cos((rot * Math.PI) / 180), 0], ["furniture"]);
      assert.ok(front && front.dist > hit.dist + 1000, "from the front the ray passes over the mattress to the headboard");
    });
  }
});

// ================================================================ stair wells
describe("2D plan → 3D: the floor above a stair is open", () => {
  const SHAPES = [
    ["straight", {}],
    ["L", { shape: "L", length2: 2400 }],
    ["U", { shape: "U", landing: 1000 }],
    ["spiral", { shape: "spiral", radius: 300, sweep: 300, length: 3000 }],
  ];
  const stairProject = (extra, { slab = false, ceiling = false } = {}) => {
    const st = { id: "s", x: 4000, y: 3000, rot: 0, length: 3600, width: 1000, steps: 18, ...extra };
    const items = {
      walls: [wall("n", 0, 0, 8000, 0), wall("e", 8000, 0, 8000, 6000), wall("s", 8000, 6000, 0, 6000), wall("w", 0, 6000, 0, 0)],
      rooms: [{ id: "r1", name: "Hall", pts: rect(100, 100, 7900, 5900) }, { id: "r2", name: "Landing", level: "U", pts: rect(100, 100, 7900, 5900) }],
      stairs: [st],
    };
    if (slab) items.slabs = [{ id: "sl", level: "U", pts: rect(0, 0, 8000, 6000), thickness: 200, kind: "floor" }];
    if (ceiling) items.ceilings = [{ id: "c", pts: rect(100, 100, 7900, 5900), thickness: 20 }];
    return project(items, { twoLevels: true });
  };

  test("minusConvex cuts a convex hole, a corner and an L, and leaves a polygon it misses alone", () => {
    const room = rect(0, 0, 4000, 3000);
    near(areaOf(minusConvex([room], [rect(1000, 1000, 2000, 2000)])), 12e6 - 1e6, 1);
    near(areaOf(minusConvex([room], [rect(3000, -500, 5000, 500)])), 12e6 - 0.5e6, 1);
    assert.deepEqual(minusConvex([room], [rect(5000, 0, 6000, 100)]), [room]);
    const L = [[0, 0], [4000, 0], [4000, 1000], [1000, 1000], [1000, 3000], [0, 3000]];
    near(areaOf(minusConvex([L], [rect(500, 500, 3000, 2500)])), area(L) - (2500 * 500 + 500 * 1500), 1);
    // Every piece lies outside the cutter.
    for (const q of minusConvex([room], [rect(1000, 1000, 2000, 2000)])) {
      const cx = q.reduce((s, v) => s + v[0], 0) / q.length, cy = q.reduce((s, v) => s + v[1], 0) / q.length;
      assert.ok(!pointInPolygon(cx, cy, rect(1001, 1001, 1999, 1999)), "a piece inside the hole");
    }
  });

  for (const [name, extra] of SHAPES) {
    test(`${name} stair: its well covers its plan outline and only the floor it climbs to gets it`, () => {
      const p = stairProject(extra);
      const s = p.stairs[0];
      const parts = stairWellParts(p, s);
      const outline = stairLayout(s, stairRise(p, s)).outline;
      if (name === "spiral") assert.ok(areaOf(parts) >= area(outline) - 1, "the spiral's well takes the pole too");
      else near(areaOf(parts), area(outline), 1, "well = outline");
      assert.equal(stairWellsInto(p, "U").length, parts.length, "the floor above");
      assert.equal(stairWellsInto(p, "L").length, 0, "not the stair's own floor");
      assert.equal(stairWellsOn(p, "L").length, parts.length, "the ceiling of its own storey");
      assert.equal(stairWellsOn(p, "U").length, 0);
    });

    test(`${name} stair: headroom over every tread — no floor, slab or ceiling above it`, () => {
      const p = stairProject(extra, { slab: true, ceiling: true });
      const g = build(p);
      const s = p.stairs[0];
      const lay = stairLayout(s, stairRise(p, s));
      for (const t of [...lay.treads, ...lay.landings]) {
        const cx = t.pts.reduce((a, q) => a + q[0], 0) / t.pts.length, cy = t.pts.reduce((a, q) => a + q[1], 0) / t.pts.length;
        const hit = firstHit(g, [cx, cy, t.z + 10], [0, 0, 1], ["rooms", "slabs", "ceilings"], 6000);
        assert.equal(hit, null, `something over the tread at z ${t.z} (${cx.toFixed(0)}, ${cy.toFixed(0)}): ${hit && hit.kind}`);
      }
      // Looking down from above the stair, the first thing is the stair; beside it, the floor above.
      const mid = lay.treads[Math.floor(lay.treads.length / 2)].pts;
      const cx = mid.reduce((a, q) => a + q[0], 0) / mid.length, cy = mid.reduce((a, q) => a + q[1], 0) / mid.length;
      const down = firstHit(g, [cx, cy, 9000], [0, 0, -1], ["rooms", "slabs", "ceilings", "stairs"]);
      assert.equal(down && down.kind, "stairs", "the stair is seen from above");
      assert.ok(["rooms", "slabs"].includes(firstHit(g, [700, 700, 9000], [0, 0, -1], ["rooms", "slabs", "ceilings", "stairs"]).kind), "the floor above is still there beside the well");
    });
  }

  test("the upper floor loses exactly the stair's footprint, the lower floor nothing", () => {
    const p = stairProject({});
    const g = build(p);
    const up = meshes(g).find((m) => m.userData.kind === "rooms" && m.userData.id === "r2");
    const low = meshes(g).find((m) => m.userData.kind === "rooms" && m.userData.id === "r1");
    near(upArea(up, 3.2), 7800 * 5800 - 3600 * 1000, 2, "upper floor");
    near(upArea(low, 0), 7800 * 5800, 2, "lower floor");
  });

  test("a stair on the top level cuts nothing (there is no floor above)", () => {
    const p = project({ rooms: [{ id: "r", pts: rect(0, 0, 6000, 6000) }], stairs: [{ id: "s", x: 3000, y: 3000, rot: 0, length: 3000, width: 1000, steps: 15 }] });
    assert.equal(stairWellsOn(p, "L").length, 0);
    const g = build(p);
    near(upArea(meshes(g).find((m) => m.userData.kind === "rooms"), 0), 36e6, 1);
  });

  test("a room that lies wholly inside a stair well keeps an (empty) floor mesh", () => {
    const p = stairProject({});
    p.rooms.push({ id: "r3", name: "Stairs", level: "U", pts: rect(2200, 2500, 5800, 3500) });
    const g = build(p);
    assert.ok(meshes(g).some((m) => m.userData.kind === "rooms" && m.userData.id === "r3"));
  });

  test("moving a stair rebuilds the floor above (the per-level cache keys it)", () => {
    const p = stairProject({});
    const g1 = build(p, { reuse: new Map() });
    p.stairs[0].x = 2500;
    const g2 = build(p, { reuse: g1.userData.levels });
    const up = meshes(g2).find((m) => m.userData.kind === "rooms" && m.userData.id === "r2");
    assert.equal(firstHit(g2, [p.stairs[0].x, 3000, 9000], [0, 0, -1], ["rooms", "stairs"]).kind, "stairs", "the well moved with the stair");
    near(upArea(up, 3.2), 7800 * 5800 - 3600 * 1000, 2);
  });

  // Every stair of every sample: nothing of the floors, slabs or ceilings
  // within 2 m over its treads (stacked stairs of the floors above may pass).
  for (const { file } of sampleIndex) {
    const p0 = loadSample(file);
    if (!p0.stairs.some((s) => levelAbove(p0, s.level))) continue;
    test(`sample ${file}: headroom over every stair`, () => {
      const p = p0;
      const g = build(p, { furniture: false });
      const blocked = [];
      for (const s of p.stairs) {
        if (!levelAbove(p, s.level)) continue;
        const lv = p.levels.find((l) => l.id === s.level);
        const lay = stairLayout(s, stairRise(p, s));
        for (const t of lay.treads.filter((_, i) => i % 3 === 1)) {
          const cx = t.pts.reduce((a, q) => a + q[0], 0) / t.pts.length, cy = t.pts.reduce((a, q) => a + q[1], 0) / t.pts.length;
          const hit = firstHit(g, [cx, cy, lv.elevation + t.z + 10], [0, 0, 1], ["rooms", "slabs", "ceilings"], 2000);
          if (hit) blocked.push(`${s.id} tread at ${t.z}: ${hit.kind} ${hit.id} ${hit.dist.toFixed(0)} mm above`);
        }
      }
      assert.deepEqual(blocked, []);
    });
  }
});

// ================================================================ doors for the walk-through
describe("2D plan → 3D: doors the walk-through opens", () => {
  const doorProject = (extra = {}) => project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [{ id: "d", wall: "a", kind: "door", at: 2000, width: 900, height: 2100, sill: 0, side: 1, ...extra }] });
  const boxOf = (o) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); };
  const close = (a, b, tol = 1e-6) => ["min", "max"].every((k) => ["x", "y", "z"].every((c) => Math.abs(a[k][c] - b[k][c]) <= tol));

  for (const [name, extra] of [["single", {}], ["hinged at the end", { hinge: "end" }], ["swinging the other way", { side: -1 }], ["double", { type: "double", width: 1600 }]]) {
    test(`${name} door: turning its leaves by their swing data matches the model built open`, () => {
      const closed = build(doorProject(extra));
      const open = build(doorProject(extra), { forceOpenDoors: true });
      const leaves = [];
      closed.getObjectByName("door d").traverse((c) => { if (c.userData.leaf) leaves.push(c); });
      assert.equal(leaves.length, extra.type === "double" ? 2 : 1, "one pivot per leaf");
      for (const L of leaves) {
        assert.equal(L.userData.leaf.a, 0, "built closed");
        L.rotation.y = L.userData.leaf.y0 + L.userData.leaf.k * ((OPEN_ANGLE * Math.PI) / 180);
        L.updateMatrix();
      }
      assert.ok(close(boxOf(closed.getObjectByName("door d")), boxOf(open.getObjectByName("door d")), 1e-6), "same box as the door built open");
    });
  }

  test("a sliding door's moving panel slides along the wall by its slide data", () => {
    const closed = build(doorProject({ type: "sliding", width: 1800 }));
    const open = build(doorProject({ type: "sliding", width: 1800 }), { forceOpenDoors: true });
    const panel = (g) => { let m = null; g.getObjectByName("door d").traverse((c) => { if (c.userData.slide) m = c; }); return m; };
    const S = panel(closed).userData.slide;
    assert.equal(S.a, 0);
    assert.ok(S.max > 0.5, "slides most of a leaf");
    // forceOpenDoors opens to 75° of 90 → 5/6 of the way.
    const to = S.max * (OPEN_ANGLE / 90);
    panel(closed).position.x += S.d[0] * to;
    panel(closed).position.z += S.d[1] * to;
    panel(closed).updateMatrix();
    assert.ok(close(boxOf(panel(closed)), boxOf(panel(open)), 1e-6), "same place as the door built open");
  });

  test("every door knows its centre (metres) for the walker's reach; windows and garage doors have no leaves to swing", () => {
    const p = project({ walls: [wall("a", 0, 0, 6000, 0)], openings: [{ id: "d", wall: "a", kind: "door", at: 1500, width: 900, height: 2100, sill: 0 }, { id: "w", wall: "a", kind: "window", at: 3500 }, { id: "gar", wall: "a", kind: "door", type: "garage", at: 5000, width: 1500, height: 2100, sill: 0 }] });
    const g = build(p);
    const at = g.getObjectByName("door d").userData.doorAt;
    near(at[0], 1.5, 1e-9); near(at[2], 0, 1e-9); near(at[1], 1.05, 1e-9);
    assert.equal(g.getObjectByName("window w").userData.doorAt, undefined);
    let swings = 0;
    g.getObjectByName("door gar").traverse((c) => { if (c.userData.leaf || c.userData.slide) swings++; });
    assert.equal(swings, 0);
  });

  test("every hinged door of the samples carries its swing data", () => {
    for (const file of ["03-two-storey-house.myarch", "21-interior-design.myarch", "40-penthouse.myarch"]) {
      const p = loadSample(file);
      const g = build(p, { furniture: false });
      for (const o of p.openings.filter((x) => x.kind === "door" && x.type !== "garage")) {
        const grp = g.getObjectByName(`door ${o.id}`);
        if (!grp) continue; // a door of a hidden phase / option
        let n = 0;
        grp.traverse((c) => { if (c.userData.leaf || c.userData.slide) n++; });
        assert.ok(n >= 1, `${file}: door ${o.id} has a leaf the walk can move`);
      }
    }
  });
});

// ================================================================ dressed interiors (scripts/sample-dress.mjs)
describe("2D plan → 3D: the samples' interiors", () => {
  const HOMES = ["01-studio", "02-two-bedroom", "03-two-storey-house", "05-wooden-cabin", "06-renovation-bim", "08-apartment-block", "14-courtyard-house", "16-modern-villa", "17-townhouse", "18-modern-farmhouse", "19-duplex", "20-compact-house", "21-interior-design", "40-penthouse"];
  const DECOR = (f) => { const d = furnitureDef(f.kind) || {}; return ["Decor", "Plants", "Lighting"].includes(d.cat) || d.mount === "wall" || /^(rug|runner|curtain)/.test(f.kind); };

  for (const file of sampleIndex.map((s) => s.file).filter((f) => HOMES.some((h) => f.startsWith(h)))) {
    test(`sample ${file}: living rooms and bedrooms are dressed`, () => {
      const p = loadSample(file);
      const bare = [];
      for (const r of p.rooms.filter((x) => /living|bedroom|lounge/i.test(x.name || "") && area(x.pts) > 6e6)) {
        const n = p.furniture.filter((f) => f.level === r.level && pointInPolygon(f.x, f.y, r.pts) && DECOR(f)).length;
        if (n < 2) bare.push(`${r.name} (${n})`);
      }
      assert.deepEqual(bare, [], "rooms with fewer than two decorative pieces");
    });
  }

  // Beds, sofas, wardrobes, toilets, counters…: the back to the wall, never the front.
  test("every sample: pieces with a back stand with their back, not their front, against a wall", async () => {
    const { BACKED } = await import("../../scripts/sample-dress.mjs");
    const bad = [];
    for (const { file } of sampleIndex) {
      const p = loadSample(file);
      for (const it of p.furniture) {
        if (!BACKED.test(it.kind) || /bench|stool|chair$|^rug/i.test(it.kind) || (it.elevation || 0) > 50) continue;
        const a = ((it.rot || 0) * Math.PI) / 180;
        const gap = (sgn) => Math.min(...p.walls.filter((w) => w.level === it.level).map((w) => pointSegDist(it.x + sgn * Math.sin(a) * (it.d / 2), it.y - sgn * Math.cos(a) * (it.d / 2), w.x1, w.y1, w.x2, w.y2) - w.thickness / 2));
        if (gap(-1) < 120 && gap(1) >= 120) bad.push(`${file}: ${it.kind} at (${it.x}, ${it.y}) rot ${it.rot || 0}`);
      }
    }
    assert.deepEqual(bad.slice(0, 20), [], `${bad.length} pieces face the wall`);
  });

  // Pictures, mirrors, clocks, shelves and wall lights: back on a wall face, front into a room.
  for (const { file } of sampleIndex) {
    const p0 = loadSample(file);
    const items = p0.furniture.filter((f) => (furnitureDef(f.kind) || {}).mount === "wall" && !(furnitureDef(f.kind) || {}).light);
    if (!items.length || !p0.rooms.length) continue;
    test(`sample ${file}: wall-mounted items hang on a wall, facing the room`, () => {
      const p = p0;
      const bad = [];
      for (const f of items) {
        const a = ((f.rot || 0) * Math.PI) / 180, back = [Math.sin(a), -Math.cos(a)];
        const bx = f.x + back[0] * (f.d / 2), by = f.y + back[1] * (f.d / 2);
        const onWall = p.walls.some((w) => w.level === f.level && Math.abs(pointSegDist(bx, by, w.x1, w.y1, w.x2, w.y2) - w.thickness / 2) < 80);
        const fx = f.x - back[0] * (f.d / 2 + 150), fy = f.y - back[1] * (f.d / 2 + 150);
        const faces = p.rooms.some((r) => r.level === f.level && pointInPolygon(fx, fy, r.pts));
        if (!onWall || !faces) bad.push(`${f.kind} ${f.id} at (${f.x}, ${f.y}) rot ${f.rot}: ${onWall ? "" : "not on a wall "}${faces ? "" : "faces no room"}`);
      }
      assert.deepEqual(bad, []);
    });
  }
});
