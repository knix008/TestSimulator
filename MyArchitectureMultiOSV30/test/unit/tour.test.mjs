// Unit tests for the automatic walk-through route (src/core/tour.js): a small
// plan built here, then every sample in sample/ — every room is visited once,
// walks keep clear of the walls, stairs are climbed to the floors above.
// Run: node --test test/unit/tour.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseProject, newProject } from "../../src/core/project.js";
import { planTour, levelObstacles, clearPath, standSpot, isPassable, roomStandPoint, EYE_HEIGHT } from "../../src/core/tour.js";
import { pointInPolygon } from "../../src/core/geom.js";

const dir = path.resolve(import.meta.dirname, "..", "..", "sample");
const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
const load = (file) => parseProject(fs.readFileSync(path.join(dir, file), "utf8"));

// Two 4 × 4 m rooms side by side, a door between them and a front door into
// the hall (wall c runs from x = 8000 back to 0: at 2000 is x = 6000).
function twoRooms() {
  const p = newProject("Tour");
  const lv = p.levels[0].id;
  const W = (id, x1, y1, x2, y2) => ({ id, level: lv, x1, y1, x2, y2, thickness: 200, height: null });
  p.walls = [W("a", 0, 0, 8000, 0), W("b", 8000, 0, 8000, 4000), W("c", 8000, 4000, 0, 4000), W("d", 0, 4000, 0, 0), W("e", 4000, 0, 4000, 4000)];
  p.openings = [
    { id: "front", wall: "c", kind: "door", type: "single", at: 2000, width: 900, height: 2100, sill: 0 },
    { id: "inner", wall: "e", kind: "door", type: "single", at: 2000, width: 900, height: 2100, sill: 0 },
    { id: "win", wall: "a", kind: "window", type: "casement", at: 2000, width: 1200, height: 1200, sill: 900 },
  ];
  p.rooms = [
    { id: "r1", level: lv, name: "Living", pts: [[100, 100], [3900, 100], [3900, 3900], [100, 3900]] },
    { id: "r2", level: lv, name: "Hall", pts: [[4100, 100], [7900, 100], [7900, 3900], [4100, 3900]] },
  ];
  return parseProject(JSON.stringify(p));
}

describe("walk-through route", () => {
  test("only doors and full-height floor openings are passable", () => {
    assert.ok(isPassable({ kind: "door" }));
    assert.ok(!isPassable({ kind: "window", sill: 0, height: 2400 }));
    assert.ok(isPassable({ kind: "opening", sill: 0, height: 2100 }));
    assert.ok(!isPassable({ kind: "opening", sill: 0, height: 1000 }));
  });

  test("walls are cut at the doors; each door gives a crossing with a point either side", () => {
    const p = twoRooms();
    const { solids, doors } = levelObstacles(p, p.levels[0].id);
    assert.equal(doors.length, 2);
    assert.equal(solids.length, 5 + 2); // five walls, two of them split by a door
    for (const d of doors) {
      // Straight through the gap is clear; the same crossing 1.2 m along the wall is not.
      assert.ok(clearPath(d.sides[0], d.sides[1], solids, 0.05), `door ${d.id}`);
      const u = [-d.normal[1] * 1.2, d.normal[0] * 1.2];
      assert.ok(!clearPath([d.sides[0][0] + u[0], d.sides[0][1] + u[1]], [d.sides[1][0] + u[0], d.sides[1][1] + u[1]], solids, 0.05), `wall beside ${d.id}`);
    }
  });

  test("starts outside the front door, visits both rooms once and never walks through a wall", () => {
    const p = twoRooms();
    const moves = planTour(p);
    const looks = moves.filter((m) => m.type === "look");
    assert.deepEqual(looks.map((m) => m.room).sort(), ["r1", "r2"]);
    assert.ok(looks.every((m) => !m.glide));
    assert.deepEqual(looks.map((m) => [m.index, m.total]), [[1, 2], [2, 2]]);
    // The first walk starts outside (y > 4 m: the front door is on the y = 4000 wall).
    assert.equal(moves[0].type, "walk");
    assert.ok(moves[0].points[0][1] > 4.5, `start ${moves[0].points[0]}`);
    // The hall (behind the front door) comes first, then the living room through the inner door.
    assert.deepEqual(looks.map((m) => m.room), ["r2", "r1"]);
    const { solids } = levelObstacles(p, p.levels[0].id);
    for (const m of moves.filter((x) => x.type === "walk")) {
      for (let i = 1; i < m.points.length; i++) assert.ok(clearPath(m.points[i - 1], m.points[i], solids, 0.02), `segment ${i} of a walk crosses a wall`);
    }
    // Stand points are inside their rooms, in metres.
    for (const m of looks) {
      const r = p.rooms.find((x) => x.id === m.room);
      assert.ok(pointInPolygon(m.at[0] * 1000, m.at[1] * 1000, r.pts));
    }
  });

  test("a room no door reaches is still shown (the camera glides in)", () => {
    const p = twoRooms();
    p.openings = p.openings.filter((o) => o.id !== "inner");
    const looks = planTour(p).filter((m) => m.type === "look");
    assert.equal(looks.length, 2);
    assert.deepEqual(looks.filter((m) => m.glide).map((m) => m.room), ["r1"]);
  });

  test("no rooms: no tour; hidden levels are left out", () => {
    const empty = newProject("Empty");
    assert.deepEqual(planTour(empty), []);
    const p = twoRooms();
    assert.deepEqual(planTour(p, { levels: [] }), []);
  });

  test("a stand spot moves off a wall to the nearest clear place", () => {
    const solids = [{ a: [0, 0], b: [4, 0], half: 0.1 }];
    const q = standSpot([2, 0.05], solids);
    assert.ok(Math.abs(q[1]) >= 0.33 - 1e-9 && Math.abs(q[1]) < 0.6, `moved to ${q}`);
    assert.deepEqual(standSpot([2, 1], solids), [2, 1]);
    // In an L-shaped room the stand point is in the larger part, clear of the walls.
    const L = [[0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]];
    const sp = roomStandPoint(L, []);
    assert.ok(pointInPolygon(sp[0], sp[1], L));
  });

  test("the eye is at a person's height", () => assert.ok(EYE_HEIGHT > 1.4 && EYE_HEIGHT < 1.8));
});

// Rooms a walk cannot reach in the samples — reached only through openings too
// low to walk through (the atrium bridges of sample 33) — and the floors whose
// stair foot no walk reaches (sample 32, 8F). Anything else is a regression.
const KNOWN_GLIDES = { "33-atrium-office.myarch": 5 };
const KNOWN_MISSED_CLIMBS = { "32-residential-complex.myarch": 1 };

describe("walk-through of every sample", () => {
  for (const s of index) {
    test(s.file, () => {
      const p = load(s.file);
      const t0 = performance.now();
      const moves = planTour(p);
      const ms = performance.now() - t0;
      assert.ok(ms < 5000, `planning took ${ms.toFixed(0)} ms`);
      const looks = moves.filter((m) => m.type === "look");
      // Every room (that has room to stand in) is visited exactly once, numbered 1…n.
      const ids = looks.map((m) => m.room);
      assert.equal(new Set(ids).size, ids.length, "a room is visited twice");
      assert.equal(looks.length, p.rooms.length, "rooms left out of the tour");
      looks.forEach((m, i) => { assert.equal(m.index, i + 1); assert.equal(m.total, looks.length); });
      assert.equal(looks.filter((m) => m.glide).length, KNOWN_GLIDES[s.file] ?? 0, "rooms no walk reaches");
      // One climb per floor above the ground floor (for samples with stairs).
      const climbs = moves.filter((m) => m.type === "climb");
      const levelsWithStairs = new Set(p.stairs.map((x) => x.level));
      const expected = [...p.levels].sort((a, b) => a.elevation - b.elevation).slice(0, -1).filter((l) => levelsWithStairs.has(l.id)).length;
      assert.equal(climbs.length, expected - (KNOWN_MISSED_CLIMBS[s.file] ?? 0), "floors not climbed to");
      for (const c of climbs) {
        const from = p.levels.find((l) => l.id === c.from); const to = p.levels.find((l) => l.id === c.to);
        assert.ok(c.points.length >= 3);
        assert.ok(Math.abs(c.points.at(-1)[1] - (to.elevation - from.elevation) / 1000) < 1e-9, "a climb ends on the floor above");
        for (let i = 1; i < c.points.length; i++) assert.ok(c.points[i][1] >= c.points[i - 1][1] - 1e-9, "a climb goes down");
      }
      // Every coordinate is a finite number in metres within the building's reach.
      const xs = p.walls.flatMap((w) => [w.x1, w.x2]).map((v) => v / 1000); const zs = p.walls.flatMap((w) => [w.y1, w.y2]).map((v) => v / 1000);
      const box = xs.length ? [Math.min(...xs) - 5, Math.max(...xs) + 5, Math.min(...zs) - 5, Math.max(...zs) + 5] : null;
      for (const m of moves) {
        const pts = m.type === "look" ? [m.at] : m.type === "walk" ? m.points : m.points.map((q) => [q[0], q[2]]);
        for (const q of pts) {
          assert.ok(Number.isFinite(q[0]) && Number.isFinite(q[1]));
          if (box) assert.ok(q[0] >= box[0] && q[0] <= box[1] && q[1] >= box[2] && q[1] <= box[3], `point ${q} far outside the building`);
        }
      }
      // Walks never pass through a wall (a little slack: corners are rounded by the player's curve).
      const solidsOf = new Map();
      for (const m of moves.filter((x) => x.type === "walk")) {
        if (!solidsOf.has(m.level)) solidsOf.set(m.level, levelObstacles(p, m.level).solids);
        const solids = solidsOf.get(m.level);
        for (let i = 1; i < m.points.length; i++) assert.ok(clearPath(m.points[i - 1], m.points[i], solids, 0), `walk on ${m.level} crosses a wall at ${m.points[i - 1]} → ${m.points[i]}`);
      }
    });
  }
});
