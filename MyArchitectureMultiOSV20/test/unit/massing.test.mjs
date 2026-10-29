// Unit tests for mass → building (src/core/massing.js): slicing a mesh into
// plan outlines, the levels a mass takes, and the walls, slabs, rooms,
// openings and roof made from a box, a stepped mass, a courtyard block, a
// face and a closed line.
// Run: node --test test/unit/massing.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { newProject, normalizeProject, wallTypeThickness } from "../../src/core/project.js";
import { prismMesh, mergeMeshes } from "../../src/core/mesh.js";
import { polygonArea } from "../../src/core/geom.js";
import { syncMeshSolid } from "../../src/core/skmodel.js";
import { sliceMesh, chainLoops, nestLoops, massSource, massLevels, massToBuilding } from "../../src/core/massing.js";
import { runCheck } from "../../src/core/check.js";
import * as sk from "../../src/core/skops.js";

const rect = (x, y, w, d) => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
function proj() {
  const p = normalizeProject(newProject("massing"));
  return { p, L: p.levels[0].id };
}
const box = (p, L, pts, h, z0 = 0) => { const s = { id: `m${p.solids.length + 1}`, level: L, pts, z0, height: h, taper: 1, material: "concrete" }; p.solids.push(s); return s; };
const meshMass = (p, L, mesh) => { const s = { id: `m${p.solids.length + 1}`, level: L, name: "Mass", material: "concrete", mesh, z0: 0, height: 1, pts: [] }; syncMeshSolid(s); p.solids.push(s); return s; };
const area = (pts) => Math.abs(polygonArea(pts));

describe("slicing", () => {
  test("a box cut at mid-height gives its footprint", () => {
    const loops = sliceMesh(prismMesh(rect(0, 0, 10000, 6000), 0, 9000), 4500);
    assert.equal(loops.length, 1);
    assert.ok(Math.abs(area(loops[0]) - 60e6) < 1);
  });
  test("the plane above or below the mass cuts nothing", () => {
    assert.equal(sliceMesh(prismMesh(rect(0, 0, 1000, 1000), 0, 3000), 4000).length, 0);
  });
  test("segments chain into a closed loop whatever their direction", () => {
    const loops = chainLoops([[[0, 0], [10, 0]], [[10, 10], [10, 0]], [[10, 10], [0, 10]], [[0, 0], [0, 10]]]);
    assert.equal(loops.length, 1);
    assert.equal(loops[0].length, 4);
  });
  test("a loop inside another is its courtyard; slivers are dropped", () => {
    const shapes = nestLoops([rect(0, 0, 20000, 20000), rect(6000, 6000, 8000, 8000), rect(30000, 0, 500, 500)]);
    assert.equal(shapes.length, 1);
    assert.equal(shapes[0].holes.length, 1);
    assert.ok(polygonArea(shapes[0].outer) > 0 && polygonArea(shapes[0].holes[0]) > 0, "both counter-clockwise");
  });
});

describe("levels", () => {
  test("a 9.5 m box over 3 m levels takes three levels (new ones added); 10 m takes four", () => {
    const { p, L } = proj();
    p.levels[0].height = 3000;
    const a = massLevels(p, massSource(p, box(p, L, rect(0, 0, 8000, 8000), 9500).id));
    assert.equal(a.length, 3);
    assert.deepEqual(a.map((x) => x.elevation), [0, 3000, 6000]);
    assert.equal(a.filter((x) => !x.level).length, 2, "two new levels");
    const b = massLevels(p, massSource(p, box(p, L, rect(0, 0, 8000, 8000), 10600).id));
    assert.equal(b.length, 4);
  });
  test("existing levels are used with their own heights", () => {
    const { p, L } = proj();
    p.levels[0].height = 4000;
    p.levels.push({ id: "lv2", name: "2F", elevation: 4000, height: 3000, slab: 200 });
    const a = massLevels(p, massSource(p, box(p, L, rect(0, 0, 8000, 8000), 7000).id));
    assert.deepEqual(a.map((x) => x.level && x.level.id), [L, "lv2"]);
  });
});

describe("mass → building", () => {
  test("a box becomes walls, slabs, a room and windows per level, a door and a flat roof; the mass is gone", () => {
    const { p, L } = proj();
    p.levels[0].height = 3000;
    const s = box(p, L, rect(0, 0, 12000, 8000), 9000);
    const r = massToBuilding(p, s.id, { wallType: "ext-render-250" });
    assert.equal(r.levels.length, 3);
    assert.equal(p.levels.length, 3);
    assert.equal(r.created, 2);
    assert.equal(r.walls.length, 12);
    assert.equal(r.slabs.length, 3);
    assert.equal(r.rooms.length, 3);
    assert.equal(r.roofs.length, 1);
    assert.equal(p.roofs[0].kind, "flat");
    assert.equal(p.roofs[0].level, p.levels[2].id);
    assert.ok(!p.solids.some((x) => x.id === s.id));
    // Walls sit half a wall inside the mass: their outside faces are its faces.
    const t = wallTypeThickness(p.wallTypes.find((w) => w.id === "ext-render-250"));
    for (const w of p.walls) { assert.equal(w.thickness, t); assert.equal(w.type, "ext-render-250"); }
    const xs = p.walls.flatMap((w) => [w.x1, w.x2]);
    assert.equal(Math.min(...xs), t / 2);
    assert.equal(Math.max(...xs), 12000 - t / 2);
    // Rooms are the inside of the walls.
    assert.ok(Math.abs(area(p.rooms[0].pts) - (12000 - 2 * t) * (8000 - 2 * t)) < 10);
    assert.equal(p.openings.filter((o) => o.kind === "door").length, 1);
    assert.ok(p.openings.filter((o) => o.kind === "window").length >= 3 * 4);
    // The model check finds nothing wrong on the ground floor (the door is there).
    const issues = runCheck(p).filter((i) => i.level === L);
    assert.deepEqual(issues.map((i) => i.code), []);
    assert.ok(!runCheck(p).some((i) => i.severity === "error"), "no errors anywhere");
  });
  test("a stepped mass (a podium and a tower) gives smaller floors higher up", () => {
    const { p, L } = proj();
    p.levels[0].height = 3000;
    const m = mergeMeshes([prismMesh(rect(0, 0, 20000, 12000), 0, 6000), prismMesh(rect(4000, 2000, 8000, 8000), 6000, 15000)]);
    const s = meshMass(p, L, m);
    const r = massToBuilding(p, s.id, { roof: "hip" });
    assert.equal(r.levels.length, 5);
    const slabArea = (lvId) => area(p.slabs.find((x) => x.level === lvId).pts);
    assert.ok(Math.abs(slabArea(r.levels[0]) - 240e6) < 10);
    assert.ok(Math.abs(slabArea(r.levels[4]) - 64e6) < 10);
    assert.equal(p.roofs.length, 1);
    assert.equal(p.roofs[0].kind, "hip");
    assert.equal(p.roofs[0].level, r.levels[4]);
  });
  test("a courtyard block: walls around the courtyard too, the slab has a hole", () => {
    const { p, L } = proj();
    const outer = prismMesh(rect(0, 0, 24000, 24000), 0, 2800);
    const s = meshMass(p, L, outer);
    // Cut the courtyard with the solid tools.
    const c = box(p, L, rect(8000, 8000, 8000, 8000), 4000, -500);
    sk.solidTool(p, "subtract", [s.id, c.id]);
    const block = p.solids.find((x) => x.mesh && x.mesh.f.length > 6);
    const r = massToBuilding(p, block.id, { roof: "none" });
    assert.equal(r.walls.length, 8);
    assert.equal(p.slabs[0].holes.length, 1);
    assert.equal(r.roofs.length, 0);
    assert.equal(r.rooms.length, 2, "the ring is cut in two rooms across the courtyard");
    const ring = 24000 * 24000 - 8000 * 8000;
    const roomArea = r.rooms.reduce((sum, id) => sum + area(p.rooms.find((x) => x.id === id).pts), 0);
    assert.ok(roomArea < ring && roomArea > ring * 0.85, `room area ${roomArea}`);
    assert.equal(p.openings.filter((o) => o.kind === "door").length, 2, "a door for each room");
    assert.deepEqual(runCheck(p).map((i) => i.code), []);
  });
  test("a face drawn on the ground becomes as many levels as asked for", () => {
    const { p, L } = proj();
    const f = sk.drawLoop(p, [[0, 0, 0], [9000, 0, 0], [9000, 7000, 0], [0, 7000, 0]], { level: L });
    const r = massToBuilding(p, f.id, { count: 2, roof: "gable" });
    assert.equal(r.levels.length, 2);
    assert.equal(r.walls.length, 8);
    assert.equal(p.roofs[0].kind, "gable");
    assert.equal(p.roofs[0].pitch, 30);
  });
  test("lines drawn in 3D that close together work too; lines that do not close do not", () => {
    const { p, L } = proj();
    const a = sk.drawLine(p, [[0, 0, 0], [8000, 0, 0], [8000, 6000, 0]], { level: L });
    const b = sk.drawLine(p, [[8000, 6000, 0], [0, 6000, 0], [0, 0, 0]], { level: L });
    const r = massToBuilding(p, [a.id, b.id], { count: 1 });
    assert.equal(r.walls.length, 4);
    assert.ok(!p.solids.some((x) => x.id === a.id || x.id === b.id), "the lines are used up");
    const open = sk.drawLine(p, [[20000, 0, 0], [28000, 0, 0], [28000, 6000, 0]], { level: L });
    assert.throws(() => massToBuilding(p, open.id), /close into an outline/);
  });
  test("keep the mass: it stays, hidden", () => {
    const { p, L } = proj();
    const s = box(p, L, rect(0, 0, 8000, 8000), 2800);
    massToBuilding(p, s.id, { keepMass: true });
    assert.equal(p.solids.find((x) => x.id === s.id).hidden, true);
  });
});
