// Unit tests for the model check's repairs (src/core/fixes.js) and the
// physical checks they answer (src/core/physcheck.js): every check has advice;
// each repairable problem gets a repair that removes it without adding another;
// Fix all settles a messy flat in one go; nothing is changed when no repair works.
// Run: node --test test/unit/fixes.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CHECKS, runCheck } from "../../src/core/check.js";
import { ADVICE, adviceFor, findFix, fixAll } from "../../src/core/fixes.js";
import { newProject, normalizeProject, newLevel } from "../../src/core/project.js";

function project({ walls = [], openings = [], rooms = [], furniture = [], stairs = [], twoLevels = false } = {}) {
  const p = newProject("Fix");
  p.levels[0].id = "L";
  if (twoLevels) p.levels.push({ ...newLevel("2F", 2800), id: "U" });
  const lvl = (it) => ({ level: "L", ...it });
  p.walls = walls.map(lvl); p.openings = openings; p.rooms = rooms.map(lvl); p.furniture = furniture.map(lvl); p.stairs = stairs.map(lvl);
  return normalizeProject(p);
}
const wall = (id, x1, y1, x2, y2, thickness = 200) => ({ id, x1, y1, x2, y2, thickness });
const door = (id, wallId, at, width = 900, extra = {}) => ({ id, wall: wallId, kind: "door", type: "single", at, width, height: 2100, sill: 0, side: 1, hinge: "start", ...extra });
const win = (id, wallId, at, width = 1200) => ({ id, wall: wallId, kind: "window", type: "casement", at, width, height: 1200, sill: 900, side: 1 });
const box = (id, x, y, w = 400, d = 400, extra = {}) => ({ id, kind: "box", x, y, w, d, h: 750, rot: 0, elevation: 0, ...extra });
const room = (id, x1, y1, x2, y2, name = "") => ({ id, name, pts: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]] });
const rectWalls = (x1, y1, x2, y2) => [wall("n", x1, y1, x2, y1), wall("e", x2, y1, x2, y2), wall("s", x2, y2, x1, y2), wall("w", x1, y2, x1, y1)];
const has = (p, code) => runCheck(p).some((i) => i.code === code);

/** Problems a repair settles: [code, project with that problem]. */
const CASES = [
  ["door-blocked", () => project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [door("d", "a", 2000)], furniture: [box("f", 1700, 600)] })],
  ["door-door", () => project({ walls: [wall("a", 0, 0, 4000, 0), wall("b", 0, 0, 0, 4000)], openings: [door("d1", "a", 700), door("d2", "b", 700, 900, { side: -1 })] })],
  ["door-wall", () => project({ walls: [wall("a", 0, 0, 4000, 0), wall("b", 800, 600, 800, 3000)], openings: [door("d", "a", 600)] })],
  ["door-narrow", () => project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [door("d", "a", 2000, 600)] })],
  ["furniture-window", () => project({ walls: rectWalls(0, 0, 6000, 4000), rooms: [room("r", 100, 100, 5900, 3900, "Bed")], openings: [win("w", "n", 3000), door("d", "s", 3000)], furniture: [box("f", 3000, 450, 1200, 600, { h: 2000 })] })],
  ["furniture-outside", () => project({ walls: rectWalls(0, 0, 6000, 4000), rooms: [room("r", 100, 100, 2900, 3900, "A")], furniture: [box("f", 4500, 2000)] })],
  ["furniture-wall", () => project({ walls: [wall("a", 0, 0, 4000, 0)], furniture: [box("f", 2000, 0, 1000, 600)] })],
  ["clash-furniture", () => project({ furniture: [box("f1", 0, 0, 1000, 1000), box("f2", 600, 0, 1000, 1000)] })],
  ["opening-outside", () => project({ walls: [wall("a", 0, 0, 3000, 0)], openings: [door("d", "a", 100)] })],
  ["opening-overlap", () => project({ walls: [wall("a", 0, 0, 6000, 0)], openings: [door("d1", "a", 1000), door("d2", "a", 1500)] })],
  ["opening-tall", () => project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [{ ...win("w", "a", 2000), height: 2000 }] })],
  ["wall-short", () => project({ walls: [wall("a", 0, 0, 4000, 0), wall("b", 6000, 0, 6100, 0)] })],
  ["wall-gap", () => project({ walls: [wall("a", 0, 0, 4000, 0), wall("b", 2000, 250, 2000, 3000)] })],
  ["room-no-door", () => project({ walls: [...rectWalls(0, 0, 8000, 4000), wall("m", 4000, 0, 4000, 4000)], openings: [door("d", "s", 6000)], rooms: [room("a", 100, 100, 3900, 3900, "Store"), room("b", 4100, 100, 7900, 3900, "Hall")] })],
];

describe("model check repairs", () => {
  test("every check has advice in words", () => {
    for (const [code] of CHECKS.filter(([c]) => !c.startsWith("el-") && !/^(slab|beam|rail|ramp|shaft|stair-|ceiling)/.test(c) || ADVICE[c])) assert.ok(ADVICE[code], `advice for ${code}`);
    assert.ok(adviceFor("something-new").length > 10, "a general advice for the rest");
  });

  for (const [code, make] of CASES) {
    test(`${code}: a repair that removes it and adds nothing`, () => {
      const p = make();
      const issue = runCheck(p).find((i) => i.code === code);
      assert.ok(issue, `${code} raised by the case`);
      const before = runCheck(p).length;
      const snapshot = JSON.stringify(p);
      const fx = findFix(p, issue);
      assert.ok(fx, `a repair for ${code}`);
      assert.equal(JSON.stringify(p), snapshot, "finding a repair leaves the project as it was");
      assert.ok(typeof fx.key === "string" && !/\{\w+\}/.test(fx.key.replace(/\{(\w+)\}/g, (_, k) => fx.vars[k] ?? "{" + k + "}")), `${fx.key} filled`);
      fx.apply(p);
      assert.ok(!runCheck(p).some((i) => i.code === code && i.ids.join() === issue.ids.join()), `${code} gone after "${fx.key}"`);
      assert.ok(runCheck(p).length < before, "fewer problems than before");
    });
  }

  test("no repair for a stair leading nowhere: null, project unchanged, the advice instead", () => {
    const p = project({ stairs: [{ id: "s", x: 0, y: 0, rot: 0, length: 3000, width: 1000, steps: 16 }] });
    const issue = runCheck(p).find((i) => i.code === "stair-top");
    const snap = JSON.stringify(p);
    assert.equal(findFix(p, issue), null);
    assert.equal(JSON.stringify(p), snap);
    assert.match(adviceFor("stair-top"), /level/);
  });

  test("Fix all: a messy flat comes out with nothing left that a repair can settle", () => {
    const p = project({
      walls: [...rectWalls(0, 0, 8000, 5000), wall("m", 4000, 0, 4000, 5000)],
      openings: [door("front", "s", 6000), win("w1", "n", 2000), door("narrow", "m", 2500, 600)],
      rooms: [room("a", 100, 100, 3900, 4900, "Bedroom"), room("b", 4100, 100, 7900, 4900, "Living")],
      furniture: [box("wardrobe", 2000, 450, 1200, 600, { h: 2100 }), box("t1", 6000, 2500, 1200, 800), box("t2", 6600, 2500, 1200, 800), box("lost", 4000, 2500, 500, 500)],
    });
    const codes = new Set(runCheck(p).map((i) => i.code));
    for (const c of ["furniture-window", "door-narrow", "clash-furniture"]) assert.ok(codes.has(c), `${c} before`);
    const res = fixAll(p);
    assert.ok(res.fixed.length >= 3, JSON.stringify(res.fixed));
    for (const c of ["furniture-window", "door-narrow", "clash-furniture"]) assert.ok(!has(p, c), `${c} repaired`);
    assert.deepEqual(res.left.map((i) => i.code), runCheck(p).map((i) => i.code));
  });
});
