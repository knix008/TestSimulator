// Unit tests for the model check (src/core/check.js): every check code has a
// minimal project that triggers it and a near miss that does not.
// Run: node --test test/unit/check.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CHECKS, runCheck } from "../../src/core/check.js";
import { newProject, normalizeProject, newLevel } from "../../src/core/project.js";

// ---------------------------------------------------------------- helpers

// A project with level "L" (and "U" above it when twoLevels).
function project({ walls = [], openings = [], rooms = [], furniture = [], stairs = [], columns = [], twoLevels = false } = {}) {
  const p = newProject("Check");
  p.levels[0].id = "L";
  p.view.level = "L";
  if (twoLevels) p.levels.push({ ...newLevel("2F", 2800), id: "U" });
  const lvl = (it) => ({ level: "L", ...it });
  p.walls = walls.map(lvl);
  p.openings = openings;
  p.rooms = rooms.map(lvl);
  p.furniture = furniture.map(lvl);
  p.stairs = stairs.map(lvl);
  p.columns = columns.map(lvl);
  return normalizeProject(p);
}
const wall = (id, x1, y1, x2, y2, thickness = 200, extra = {}) => ({ id, x1, y1, x2, y2, thickness, ...extra });
const door = (id, wallId, at, width = 900, extra = {}) => ({ id, wall: wallId, kind: "door", type: "single", at, width, height: 2100, sill: 0, side: 1, hinge: "start", ...extra });
const win = (id, wallId, at, width = 1200, extra = {}) => ({ id, wall: wallId, kind: "window", type: "casement", at, width, height: 1200, sill: 900, side: 1, ...extra });
const box = (id, x, y, w = 400, d = 400, extra = {}) => ({ id, kind: "box", x, y, w, d, h: 750, rot: 0, elevation: 0, ...extra });
const room = (id, x1, y1, x2, y2, name = "") => ({ id, name, pts: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]] });
const rectWalls = (x1, y1, x2, y2, t = 200) => [wall("n", x1, y1, x2, y1, t), wall("e", x2, y1, x2, y2, t), wall("s", x2, y2, x1, y2, t), wall("w", x1, y2, x1, y1, t)];
const stair = (id, x, y, extra = {}) => ({ id, x, y, rot: 0, length: 3000, width: 1000, steps: 16, ...extra });

const codes = (p) => runCheck(p).map((i) => i.code);
const issuesOf = (p, code) => runCheck(p).filter((i) => i.code === code);

// For every check: [project that triggers it, project that does not].
const FIXTURES = {
  "wall-short": () => [project({ walls: [wall("a", 0, 0, 100, 0)] }), project({ walls: [wall("a", 0, 0, 1000, 0)] })],
  "wall-duplicate": () => [
    project({ walls: [wall("a", 0, 0, 4000, 0), wall("b", 1000, 0, 3000, 0)] }),
    project({ walls: [wall("a", 0, 0, 4000, 0), wall("b", 4000, 0, 8000, 0)] }),
  ],
  "opening-outside": () => [
    project({ walls: [wall("a", 0, 0, 3000, 0)], openings: [door("d", "a", 100)] }),
    project({ walls: [wall("a", 0, 0, 3000, 0)], openings: [door("d", "a", 1500)] }),
  ],
  "opening-overlap": () => [
    project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [door("d1", "a", 1000), door("d2", "a", 1500)] }),
    project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [door("d1", "a", 1000), door("d2", "a", 2500)] }),
  ],
  "opening-tall": () => [
    project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [win("w", "a", 2000, 1200, { height: 2000 })] }),
    project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [win("w", "a", 2000)] }),
  ],
  "door-blocked": () => [
    project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [door("d", "a", 2000)], furniture: [box("f", 1700, 600)] }),
    project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [door("d", "a", 2000)], furniture: [box("f", 1700, -600)] }),
  ],
  "furniture-wall": () => [
    project({ walls: [wall("a", 0, 0, 4000, 0)], furniture: [box("f", 2000, 0, 1000, 600)] }),
    project({ walls: [wall("a", 0, 0, 4000, 0)], furniture: [box("f", 2000, 400, 1000, 600)] }),
  ],
  "room-small": () => [project({ rooms: [room("r", 0, 0, 1000, 1000, "WC")] }), project({ rooms: [room("r", 0, 0, 2000, 2000, "WC")] })],
  "room-overlap": () => [
    project({ rooms: [room("r1", 0, 0, 3000, 3000, "A"), room("r2", 2000, 2000, 5000, 5000, "B")] }),
    project({ rooms: [room("r1", 0, 0, 3000, 3000, "A"), room("r2", 3000, 0, 6000, 3000, "B")] }),
  ],
  "room-no-door": () => [
    project({ walls: rectWalls(0, 0, 4000, 3000), rooms: [room("r", 100, 100, 3900, 2900, "Hall")] }),
    project({ walls: rectWalls(0, 0, 4000, 3000), openings: [door("d", "n", 2000)], rooms: [room("r", 100, 100, 3900, 2900, "Hall")] }),
  ],
  "stair-top": () => [project({ stairs: [stair("s", 0, 0)] }), project({ stairs: [stair("s", 0, 0)], twoLevels: true })],
  "clash-furniture": () => [
    project({ furniture: [box("f1", 0, 0, 1000, 1000), box("f2", 600, 0, 1000, 1000)] }),
    project({ furniture: [box("f1", 0, 0, 1000, 1000), box("f2", 1000, 0, 1000, 1000)] }),
  ],
  "clash-stair": () => [
    project({ walls: [wall("a", 0, 0, 6000, 0)], stairs: [stair("s", 3000, 200)], twoLevels: true }),
    project({ walls: [wall("a", 0, 0, 6000, 0)], stairs: [stair("s", 3000, 1500)], twoLevels: true }),
  ],
  "clash-column": () => [
    project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [door("d", "a", 2000)], columns: [{ id: "c", x: 2000, y: 0, w: 300, d: 300 }] }),
    project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [door("d", "a", 2000)], columns: [{ id: "c", x: 500, y: 0, w: 300, d: 300 }] }),
  ],
};

// ================================================================ coverage
describe("check list", () => {
  test("CHECKS lists unique codes with descriptions", () => {
    assert.ok(CHECKS.length >= 14);
    assert.equal(new Set(CHECKS.map(([c]) => c)).size, CHECKS.length);
    for (const [code, label] of CHECKS) {
      assert.match(code, /^[a-z]+(-[a-z]+)*$/);
      assert.ok(label.length > 5);
    }
  });

  test("every check code has a test fixture", () => {
    for (const [code] of CHECKS) assert.ok(FIXTURES[code], `missing fixture for ${code}`);
  });

  test("an empty project has no issues", () => {
    assert.deepEqual(runCheck(project()), []);
    assert.deepEqual(runCheck(normalizeProject(newProject())), []);
  });

  for (const [code] of CHECKS) {
    test(`${code}: the trigger fixture raises it and the near miss does not`, () => {
      assert.ok(FIXTURES[code], `no fixture for ${code}`);
      const [bad, good] = FIXTURES[code]();
      assert.ok(codes(bad).includes(code), `${code} expected in ${JSON.stringify(codes(bad))}`);
      assert.ok(!codes(good).includes(code), `${code} not expected in ${JSON.stringify(codes(good))}`);
      for (const is of runCheck(bad)) {
        assert.ok(["error", "warning"].includes(is.severity));
        assert.ok(CHECKS.some(([c]) => c === is.code), `known code ${is.code}`);
        assert.ok(Array.isArray(is.ids) && is.ids.length >= 1);
        assert.equal(is.level, "L");
        assert.ok(Number.isFinite(is.x) && Number.isFinite(is.y));
        assert.ok(!/\{\w+\}/.test(is.message), `placeholders filled: ${is.message}`);
        assert.equal(typeof is.key, "string");
        assert.equal(typeof is.vars, "object");
      }
    });
  }
});

// ================================================================ details
describe("walls", () => {
  test("wall-short is a warning with the length, at the wall's middle", () => {
    const [is] = issuesOf(FIXTURES["wall-short"]()[0], "wall-short");
    assert.equal(is.severity, "warning");
    assert.equal(is.key, "Wall is only {len} mm long.");
    assert.deepEqual(is.vars, { len: 100 });
    assert.equal(is.message, "Wall is only 100 mm long.");
    assert.deepEqual([is.x, is.y], [50, 0]);
    assert.deepEqual(is.ids, ["a"]);
  });

  test("wall-short scales with the thickness (75 %) and has a 50 mm floor", () => {
    assert.ok(codes(project({ walls: [wall("a", 0, 0, 220, 0, 300)] })).includes("wall-short"));
    assert.ok(!codes(project({ walls: [wall("a", 0, 0, 230, 0, 300)] })).includes("wall-short"));
    assert.ok(codes(project({ walls: [wall("a", 0, 0, 40, 0, 20)] })).includes("wall-short"));
    assert.ok(!codes(project({ walls: [wall("a", 0, 0, 60, 0, 20)] })).includes("wall-short"));
  });

  test("wall-duplicate is an error with the overlap length at its middle", () => {
    const [is] = issuesOf(FIXTURES["wall-duplicate"]()[0], "wall-duplicate");
    assert.equal(is.severity, "error");
    assert.equal(is.message, "Two walls overlap for 2000 mm.");
    assert.deepEqual(is.ids, ["a", "b"]);
    assert.deepEqual([is.x, is.y], [2000, 0]);
  });

  test("wall-duplicate also finds walls drawn the other way", () => {
    const p = project({ walls: [wall("a", 0, 0, 4000, 0), wall("b", 3500, 0, 500, 0)] });
    const [is] = issuesOf(p, "wall-duplicate");
    assert.equal(is.vars.len, 3000);
  });

  test("wall-duplicate ignores parallel walls apart and short overlaps", () => {
    assert.ok(!codes(project({ walls: [wall("a", 0, 0, 4000, 0), wall("b", 0, 1000, 4000, 1000)] })).includes("wall-duplicate"));
    assert.ok(!codes(project({ walls: [wall("a", 0, 0, 4000, 0), wall("b", 3850, 0, 8000, 0)] })).includes("wall-duplicate"), "150 mm < thickness");
    assert.ok(!codes(project({ walls: [wall("a", 0, 0, 4000, 0), wall("b", 2000, -2000, 2000, 2000)] })).includes("wall-duplicate"), "crossing walls");
  });

  test("walls on different levels never overlap each other", () => {
    const p = project({ walls: [wall("a", 0, 0, 4000, 0), wall("b", 0, 0, 4000, 0, 200, { level: "U" })], twoLevels: true });
    assert.ok(!codes(p).includes("wall-duplicate"));
  });
});

describe("openings", () => {
  test("opening-outside names the opening by its tag", () => {
    const [is] = issuesOf(FIXTURES["opening-outside"]()[0], "opening-outside");
    assert.equal(is.severity, "error");
    assert.equal(is.message, "D01 runs past the end of its wall.");
    assert.deepEqual(is.ids, ["d"]);
    assert.deepEqual([is.x, is.y], [100, 0]);
  });

  test("opening-outside at the far end and within the 1 mm slack", () => {
    assert.ok(codes(project({ walls: [wall("a", 0, 0, 3000, 0)], openings: [door("d", "a", 2800)] })).includes("opening-outside"));
    assert.ok(!codes(project({ walls: [wall("a", 0, 0, 3000, 0)], openings: [door("d", "a", 2550.5)] })).includes("opening-outside"));
  });

  test("opening-overlap names both openings", () => {
    const [is] = issuesOf(FIXTURES["opening-overlap"]()[0], "opening-overlap");
    assert.equal(is.severity, "error");
    assert.equal(is.message, "D01 and D02 overlap.");
    assert.deepEqual(is.ids, ["d1", "d2"]);
    assert.deepEqual([is.x, is.y], [1250, 0]);
  });

  test("opening-overlap between a door and a window, in any order", () => {
    const p = project({ walls: [wall("a", 0, 0, 5000, 0)], openings: [win("w", "a", 2600), door("d", "a", 1800)] });
    const [is] = issuesOf(p, "opening-overlap");
    assert.equal(is.message, "D01 and W01 overlap.");
  });

  test("openings that just touch do not overlap", () => {
    assert.ok(!codes(project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [door("d1", "a", 1000), door("d2", "a", 1900)] })).includes("opening-overlap"));
  });

  test("opening-tall reports the head height and the wall height", () => {
    const [is] = issuesOf(FIXTURES["opening-tall"]()[0], "opening-tall");
    assert.equal(is.severity, "error");
    assert.deepEqual(is.vars, { tag: "W01", h: 2900, wh: 2800 });
    assert.equal(is.message, "W01 is taller than the wall (2900 mm > 2800 mm).");
  });

  test("opening-tall uses the wall's own height", () => {
    assert.ok(!codes(project({ walls: [wall("a", 0, 0, 4000, 0, 200, { height: 3200 })], openings: [win("w", "a", 2000, 1200, { height: 2000 })] })).includes("opening-tall"));
    const low = project({ walls: [wall("a", 0, 0, 4000, 0, 200, { height: 2000 })], openings: [door("d", "a", 2000)] });
    assert.equal(issuesOf(low, "opening-tall")[0].vars.wh, 2000);
  });
});

describe("furniture and doors", () => {
  test("door-blocked names the door and points at the furniture", () => {
    const [is] = issuesOf(FIXTURES["door-blocked"]()[0], "door-blocked");
    assert.equal(is.severity, "warning");
    assert.equal(is.message, "D01 cannot open fully: furniture is in its swing.");
    assert.deepEqual(is.ids, ["d", "f"]);
    assert.deepEqual([is.x, is.y], [1700, 600]);
  });

  test("door-blocked follows the hinge side", () => {
    // Hinges at u = 1550 (start) and u = 2450 (end); a box right in front of each.
    const at = (hinge, fx) => codes(project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [door("d", "a", 2000, 900, { hinge })], furniture: [box("f", fx, 700)] })).includes("door-blocked");
    assert.equal(at("start", 1450), true);
    assert.equal(at("end", 1450), false);
    assert.equal(at("end", 2550), true);
    assert.equal(at("start", 2550), false);
  });

  test("door-blocked follows the swing side", () => {
    const p = project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [door("d", "a", 2000, 900, { side: -1 })], furniture: [box("f", 1700, -600)] });
    assert.ok(codes(p).includes("door-blocked"));
  });

  test("sliding and garage doors, rugs and low furniture never block a swing", () => {
    const mk = (doorExtra, furnExtra) => codes(project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [door("d", "a", 2000, 900, doorExtra)], furniture: [box("f", 1700, 600, 400, 400, furnExtra)] }));
    assert.ok(!mk({ type: "sliding" }, {}).includes("door-blocked"));
    assert.ok(!mk({ type: "garage" }, {}).includes("door-blocked"));
    assert.ok(!mk({}, { kind: "rug" }).includes("door-blocked"));
    assert.ok(!mk({}, { h: 100 }).includes("door-blocked"));
    assert.ok(!mk({ kind: "opening" }, {}).includes("door-blocked"), "an opening has no leaf");
    assert.ok(!mk({}, { elevation: 2200 }).includes("door-blocked"), "furniture hung above 2 m is ignored");
  });

  test("furniture-wall is a warning with the furniture and the wall", () => {
    const [is] = issuesOf(FIXTURES["furniture-wall"]()[0], "furniture-wall");
    assert.equal(is.severity, "warning");
    assert.equal(is.message, "Furniture overlaps a wall.");
    assert.deepEqual(is.ids, ["f", "a"]);
    assert.deepEqual(is.vars, {});
  });

  test("furniture touching a wall face is fine", () => {
    const p = project({ walls: [wall("a", 0, 0, 4000, 0)], furniture: [box("f", 2000, 400, 1000, 600)] });
    assert.ok(!codes(p).includes("furniture-wall"));
  });

  test("furniture in a wall is reported once even across several walls", () => {
    const p = project({ walls: [wall("a", 0, 0, 4000, 0), wall("b", 0, 0, 0, 4000)], furniture: [box("f", 0, 0, 1000, 1000)] });
    assert.equal(issuesOf(p, "furniture-wall").length, 1);
  });

  test("rugs, high furniture and furniture in an opening are not in a wall", () => {
    const mk = (furn, openings = []) => codes(project({ walls: [wall("a", 0, 0, 4000, 0)], openings, furniture: [furn] }));
    assert.ok(!mk(box("f", 2000, 0, 1000, 600, { kind: "rug" })).includes("furniture-wall"));
    assert.ok(!mk(box("f", 2000, 0, 1000, 600, { elevation: 2100 })).includes("furniture-wall"));
    assert.ok(!mk(box("f", 2000, 0, 600, 300), [door("d", "a", 2000)]).includes("furniture-wall"), "standing in the door opening");
  });

  test("rotated furniture is tested by its rotated footprint", () => {
    const w = [wall("a", 0, 0, 4000, 0)];
    assert.ok(!codes(project({ walls: w, furniture: [box("f", 2000, 600, 2000, 400)] })).includes("furniture-wall"));
    assert.ok(codes(project({ walls: w, furniture: [box("f", 2000, 600, 2000, 400, { rot: 90 })] })).includes("furniture-wall"));
  });
});

describe("rooms", () => {
  test("room-small reports the name and the area in m²", () => {
    const [is] = issuesOf(FIXTURES["room-small"]()[0], "room-small");
    assert.equal(is.severity, "warning");
    assert.deepEqual(is.vars, { name: "WC", a: "1.00" });
    assert.equal(is.message, "Room \"WC\" is only 1.00 m².");
    assert.deepEqual([is.x, is.y], [500, 500]);
  });

  test("an unnamed room is called —", () => {
    const [is] = issuesOf(project({ rooms: [room("r", 0, 0, 1000, 1000)] }), "room-small");
    assert.equal(is.vars.name, "—");
  });

  test("room-small stops at 1.5 m²", () => {
    assert.ok(codes(project({ rooms: [room("r", 0, 0, 1000, 1499)] })).includes("room-small"));
    assert.ok(!codes(project({ rooms: [room("r", 0, 0, 1000, 1500)] })).includes("room-small"));
  });

  test("room-overlap names both rooms at the second room's centre", () => {
    const [is] = issuesOf(FIXTURES["room-overlap"]()[0], "room-overlap");
    assert.equal(is.message, "Rooms \"A\" and \"B\" overlap.");
    assert.deepEqual(is.ids, ["r1", "r2"]);
    assert.deepEqual([is.x, is.y], [3500, 3500]);
  });

  test("room-overlap finds a room inside another", () => {
    assert.ok(codes(project({ rooms: [room("r1", 0, 0, 6000, 6000), room("r2", 2000, 2000, 3000, 3000)] })).includes("room-overlap"));
  });

  test("rooms on different levels do not overlap", () => {
    const p = project({ rooms: [room("r1", 0, 0, 3000, 3000), { ...room("r2", 0, 0, 3000, 3000), level: "U" }], twoLevels: true });
    assert.ok(!codes(p).includes("room-overlap"));
  });

  test("room-no-door names the room", () => {
    const [is] = issuesOf(FIXTURES["room-no-door"]()[0], "room-no-door");
    assert.equal(is.severity, "warning");
    assert.equal(is.message, "Room \"Hall\" has no door or opening.");
    assert.deepEqual([is.x, is.y], [2000, 1500]);
  });

  test("a window is not a way in, but an opening is", () => {
    const mk = (o) => codes(project({ walls: rectWalls(0, 0, 4000, 3000), openings: [o], rooms: [room("r", 100, 100, 3900, 2900)] }));
    assert.ok(mk(win("w", "n", 2000)).includes("room-no-door"));
    assert.ok(!mk({ ...door("o", "e", 1500), kind: "opening" }).includes("room-no-door"));
  });

  test("a door far from the room does not count", () => {
    const p = project({ walls: [...rectWalls(0, 0, 4000, 3000), wall("x", 10000, 0, 14000, 0)], openings: [door("d", "x", 2000)], rooms: [room("r", 100, 100, 3900, 2900)] });
    assert.ok(codes(p).includes("room-no-door"));
  });

  test("a stair inside the room is a way in", () => {
    const p = project({ walls: rectWalls(0, 0, 6000, 4000), rooms: [room("r", 100, 100, 5900, 3900)], stairs: [stair("s", 3000, 2000)], twoLevels: true });
    assert.ok(!codes(p).includes("room-no-door"));
  });

  test("room-no-door needs walls on the level", () => {
    assert.ok(!codes(project({ rooms: [room("r", 0, 0, 4000, 3000)] })).includes("room-no-door"));
  });
});

describe("stairs and clashes", () => {
  test("stair-top is a warning on the top level", () => {
    const [is] = issuesOf(FIXTURES["stair-top"]()[0], "stair-top");
    assert.equal(is.severity, "warning");
    assert.equal(is.message, "A stair on the top level leads nowhere.");
    assert.deepEqual(is.ids, ["s"]);
  });

  test("a stair on the upper of two levels leads nowhere either", () => {
    const p = project({ stairs: [{ ...stair("s", 0, 0), level: "U" }], twoLevels: true });
    const [is] = issuesOf(p, "stair-top");
    assert.equal(is.level, "U");
  });

  test("clash-furniture is a warning at the midpoint of the two pieces", () => {
    const [is] = issuesOf(FIXTURES["clash-furniture"]()[0], "clash-furniture");
    assert.equal(is.severity, "warning");
    assert.deepEqual(is.ids, ["f1", "f2"]);
    assert.deepEqual([is.x, is.y], [300, 0]);
  });

  test("chairs tucked under a table are not a clash", () => {
    for (const seat of ["chair", "barStool", "officeChair"]) {
      const p = project({ furniture: [box("t", 0, 0, 1400, 800, { kind: "diningTable4" }), box("c", 0, 300, 450, 500, { kind: seat, h: 900 })] });
      assert.ok(!codes(p).includes("clash-furniture"), seat);
    }
    const sofa = project({ furniture: [box("t", 0, 0, 1400, 800, { kind: "diningTable4" }), box("c", 0, 300, 450, 500, { kind: "armchair" })] });
    assert.ok(codes(sofa).includes("clash-furniture"), "an armchair under a table is a clash");
  });

  test("furniture at different heights, rugs and low items do not clash", () => {
    const mk = (b) => codes(project({ furniture: [box("f1", 0, 0, 1000, 1000), b] }));
    assert.ok(!mk(box("f2", 300, 0, 1000, 1000, { elevation: 800, h: 300 })).includes("clash-furniture"));
    assert.ok(!mk(box("f2", 300, 0, 1000, 1000, { kind: "rug", h: 10 })).includes("clash-furniture"));
    assert.ok(!mk(box("f2", 300, 0, 1000, 1000, { h: 100 })).includes("clash-furniture"));
    assert.ok(mk(box("f2", 300, 0, 1000, 1000, { elevation: 500, h: 300 })).includes("clash-furniture"), "overlapping heights");
  });

  test("clash-stair is an error naming the stair and the wall", () => {
    const [is] = issuesOf(FIXTURES["clash-stair"]()[0], "clash-stair");
    assert.equal(is.severity, "error");
    assert.deepEqual(is.ids, ["s", "a"]);
    assert.deepEqual([is.x, is.y], [3000, 200]);
  });

  test("clash-stair follows the stair's rotation", () => {
    const w = [wall("a", 0, 0, 6000, 0)];
    assert.ok(!codes(project({ walls: w, stairs: [stair("s", 3000, 1500)], twoLevels: true })).includes("clash-stair"));
    assert.ok(codes(project({ walls: w, stairs: [stair("s", 3000, 1500, { rot: 90 })], twoLevels: true })).includes("clash-stair"));
  });

  test("clash-column names the blocked opening", () => {
    const [is] = issuesOf(FIXTURES["clash-column"]()[0], "clash-column");
    assert.equal(is.severity, "error");
    assert.equal(is.message, "Clash: a column blocks D01.");
    assert.deepEqual(is.ids, ["c", "d"]);
  });

  test("a column in a window is a clash too", () => {
    const p = project({ walls: [wall("a", 0, 0, 4000, 0)], openings: [win("w", "a", 2000)], columns: [{ id: "c", x: 2400, y: 50, w: 300, d: 300 }] });
    assert.equal(issuesOf(p, "clash-column")[0].message, "Clash: a column blocks W01.");
  });
});

describe("issue records", () => {
  test("every issue has the documented fields", () => {
    const p = project({
      walls: [wall("a", 0, 0, 100, 0), wall("b", 0, 3000, 4000, 3000), wall("c", 1000, 3000, 3000, 3000)],
      openings: [door("d", "b", 100)],
      rooms: [room("r", 10000, 0, 11000, 1000, "Tiny")],
      stairs: [stair("s", 20000, 0)],
    });
    const issues = runCheck(p);
    assert.ok(issues.length >= 5);
    for (const is of issues) {
      assert.deepEqual(Object.keys(is).sort(), ["code", "ids", "key", "level", "message", "severity", "vars", "x", "y"]);
      const expected = is.key.replace(/\{(\w+)\}/g, (_, k) => is.vars[k] ?? "");
      assert.equal(is.message, expected);
    }
  });

  test("issues are reported per level", () => {
    const p = project({ walls: [wall("a", 0, 0, 100, 0), wall("b", 0, 0, 100, 0, 200, { level: "U" })], twoLevels: true });
    const levels = issuesOf(p, "wall-short").map((i) => i.level).sort();
    assert.deepEqual(levels, ["L", "U"]);
  });

  test("runCheck does not change the project", () => {
    const [p] = FIXTURES["door-blocked"]();
    const before = JSON.stringify(p);
    runCheck(p);
    assert.equal(JSON.stringify(p), before);
  });
});
