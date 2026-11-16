// Unit tests for the Lights panel's list (src/core/lightlist.js): every fixture
// once, grouped by level (top first) and by the room it hangs in, with on / off
// counts; the ids of a room's, a level's or all lamps; the samples' lamps.
// Run: node --test test/unit/lightlist.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { lightGroups, lampIds } from "../../src/core/lightlist.js";
import { newProject, newLevel, parseProject } from "../../src/core/project.js";
import { isLight } from "../../src/lib/furniture.js";

function flat() {
  const p = newProject("Lamps");
  p.levels.push({ ...newLevel("2F", 2800), id: "U" });
  const L = p.levels[0].id;
  p.rooms = [
    { id: "living", level: L, name: "Living", pts: [[0, 0], [5000, 0], [5000, 4000], [0, 4000]] },
    { id: "bed", level: L, name: "Bedroom", pts: [[5000, 0], [9000, 0], [9000, 4000], [5000, 4000]] },
  ];
  const lamp = (id, level, x, y, on = true) => ({ id, level, kind: "ceilingLight", x, y, w: 400, d: 400, h: 100, rot: 0, elevation: 2500, light: { on } });
  p.furniture = [lamp("l1", L, 1000, 1000), lamp("l2", L, 3000, 2000, false), lamp("b1", L, 7000, 2000), lamp("out", L, 12000, 2000), lamp("up", "U", 2000, 2000, false),
    { id: "sofa", level: L, kind: "sofa3", x: 2000, y: 3000, w: 2100, d: 900, h: 800, rot: 0 }];
  return parseProject(JSON.stringify(p));
}

describe("lights list", () => {
  test("by level (top first) and room, each lamp once, with counts", () => {
    const g = lightGroups(flat());
    assert.deepEqual(g.map((x) => x.name), ["2F", "1F"]);
    const ground = g[1];
    assert.deepEqual([ground.total, ground.on], [4, 3]);
    assert.deepEqual(ground.rooms.map((r) => [r.name, r.total, r.on]), [["Bedroom", 1, 1], ["Living", 2, 1], ["", 1, 1]], "rooms by name, lamps outside rooms last");
    assert.deepEqual(ground.rooms.find((r) => r.id === "living").lamps.map((l) => [l.id, l.on]), [["l1", true], ["l2", false]]);
    assert.ok(ground.rooms[0].lamps[0].lumens > 0);
    const all = g.flatMap((x) => x.rooms.flatMap((r) => r.lamps.map((l) => l.id)));
    assert.deepEqual(all.sort(), ["b1", "l1", "l2", "out", "up"], "no sofa, every lamp once");
  });

  test("ids of all, a level, a room", () => {
    const g = lightGroups(flat());
    const L = g[1].level;
    assert.equal(lampIds(g).length, 5);
    assert.deepEqual(lampIds(g, { level: "U" }), ["up"]);
    assert.deepEqual(lampIds(g, { level: L, room: "living" }).sort(), ["l1", "l2"]);
    assert.deepEqual(lampIds(g, { level: L, room: "" }), ["out"]);
  });

  test("no lamps: an empty list; every sample's lamps are all listed", () => {
    assert.deepEqual(lightGroups(newProject("none")), []);
    const dir = path.resolve(import.meta.dirname, "..", "..", "sample");
    for (const f of ["02-two-bedroom.myarch", "21-interior-design.myarch", "39-cafe-bistro.myarch"]) {
      const p = parseProject(fs.readFileSync(path.join(dir, f), "utf8"));
      const n = p.furniture.filter(isLight).length;
      assert.equal(lampIds(lightGroups(p)).length, n, f);
    }
  });
});
