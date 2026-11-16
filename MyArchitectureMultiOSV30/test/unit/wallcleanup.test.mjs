// Unit tests for Build → Clean up walls (src/core/wallcleanup.js, the cleanup
// of MySketchBook's 2D workbench in src/io/plan-draft.js): a messy plan —
// gaps at corners, a crooked wall, a crumb, a wall in two pieces — comes out
// closed and square; doors stay where they were; walls keep their settings
// (and differently set walls are not merged); rooms are found again with their
// names; no sample gets worse.
// Run: node --test test/unit/wallcleanup.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseProject, newProject } from "../../src/core/project.js";
import { cleanupLevel, applyCleanup, wallProblems, sameSettings } from "../../src/core/wallcleanup.js";
import { pointInPolygon } from "../../src/core/geom.js";

const dir = path.resolve(import.meta.dirname, "..", "..", "sample");

/** 8 × 5 m: the top wall in two pieces (one with a door), 150 mm gaps at two corners, the right wall 2° off, an 80 mm crumb. */
function messy() {
  const p = newProject("Messy");
  const lv = p.levels[0].id;
  const W = (id, x1, y1, x2, y2, extra = {}) => ({ id, level: lv, x1, y1, x2, y2, thickness: 200, height: null, ...extra });
  const tilt = Math.tan((2 * Math.PI) / 180) * 5000;
  p.walls = [
    W("top1", 0, 0, 4000, 0, { height: 3000 }), W("top2", 4000, 0, 8000, 0, { height: 3000 }),
    W("right", 8000, 0, 8000 + tilt, 5000), W("bottom", 7850, 5000, 0, 5000), W("left", 0, 5150, 0, 150),
    W("crumb", 3000, 2500, 3080, 2500),
  ];
  p.openings = [{ id: "door", wall: "top2", kind: "door", at: 2000, width: 900, height: 2100, sill: 0, type: "single", hinge: "start", side: 1 }];
  p.rooms = [{ id: "living", level: lv, name: "Living", pts: [[100, 100], [7900, 100], [7900, 4900], [100, 4900]] }];
  return parseProject(JSON.stringify(p));
}
const doorPoint = (p) => { const o = p.openings.find((x) => x.id === "door"); const w = p.walls.find((x) => x.id === o.wall); const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1); return [w.x1 + ((w.x2 - w.x1) * o.at) / L, w.y1 + ((w.y2 - w.y1) * o.at) / L]; };

describe("clean up walls", () => {
  test("a messy plan comes out closed, square and merged; the door stays put; settings and room names are kept", () => {
    const p = messy();
    const lv = p.levels[0].id;
    const before = wallProblems(p, lv);
    assert.ok(before.some((x) => x.kind === "open-end"), "open ends before");
    const door0 = doorPoint(p);
    const res = cleanupLevel(p, lv);
    assert.ok(res.changed);
    assert.ok(res.report.removed >= 1 && res.report.joined >= 2 && res.report.squared >= 1 && res.report.merged >= 1, JSON.stringify(res.report));
    assert.equal(res.after, 0, "nothing left to check");
    applyCleanup(p, lv, res);
    assert.deepEqual(wallProblems(p, lv), []);
    assert.equal(p.walls.length, 4, "four walls: the crumb is gone, the top is one wall");
    for (const w of p.walls) assert.ok(Math.abs(w.x1 - w.x2) < 1 || Math.abs(w.y1 - w.y2) < 1, `${w.id} square`);
    const top = p.walls.find((w) => w.id === "top1");
    assert.equal(top.height, 3000, "the merged wall keeps its own height");
    const d1 = doorPoint(p);
    assert.ok(Math.hypot(d1[0] - door0[0], d1[1] - door0[1]) < 2, `door moved ${door0} → ${d1}`);
    assert.equal(p.openings[0].type, "single");
    // One room, the old one (name kept), its outline from the cleaned walls.
    assert.equal(p.rooms.length, 1);
    assert.equal(p.rooms[0].name, "Living");
    assert.ok(pointInPolygon(4000, 2500, p.rooms[0].pts));
    // The project still loads as it is.
    assert.equal(parseProject(JSON.stringify(p)).walls.length, 4);
  });

  test("walls set differently are not merged; a clean level changes nothing", () => {
    const p = messy();
    p.walls.find((w) => w.id === "top2").material = "brick";
    const res = cleanupLevel(p, p.levels[0].id);
    assert.ok(res.walls.some((w) => w.id === "top1") && res.walls.some((w) => w.id === "top2"), "both kept");
    assert.ok(!sameSettings({ material: "brick", x1: 0 }, { material: "plaster", x1: 9 }));
    assert.ok(sameSettings({ material: "brick", x1: 0, id: "a" }, { material: "brick", x1: 9, id: "b" }));
    // Applied once, a second run finds nothing more.
    const q = messy(); const lv = q.levels[0].id;
    applyCleanup(q, lv, cleanupLevel(q, lv));
    assert.equal(cleanupLevel(q, lv).changed, false);
  });

  test("options: nothing squared or merged when switched off; rooms left alone on request", () => {
    const p = messy(); const lv = p.levels[0].id;
    const res = cleanupLevel(p, lv, { squareDeg: 0, merge: false, rooms: false });
    assert.equal(res.report.squared, 0);
    assert.equal(res.report.merged, 0);
    assert.equal(res.rooms, null);
  });

  test("every sample: no problems added, no door or window lost, no room lost", () => {
    const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
    for (const s of index) {
      const p = parseProject(fs.readFileSync(path.join(dir, s.file), "utf8"));
      for (const lv of p.levels) {
        if (!p.walls.some((w) => w.level === lv.id)) continue;
        const ids = new Set(p.walls.filter((w) => w.level === lv.id).map((w) => w.id));
        const res = cleanupLevel(p, lv.id);
        assert.ok(res.after <= res.before, `${s.file} ${lv.name}: ${res.before} → ${res.after}`);
        assert.equal(res.openings.length, p.openings.filter((o) => ids.has(o.wall)).length, `${s.file} ${lv.name}: openings`);
        assert.ok(res.rooms.length >= p.rooms.filter((r) => r.level === lv.id).length, `${s.file} ${lv.name}: rooms`);
      }
    }
  });
});
