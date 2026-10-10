// Unit tests for room detection and areas (src/core/rooms.js) and roof
// geometry (src/core/roof.js).
// Run: node --test test/unit/rooms.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  roomArea, roomPerimeter, roomLabelPoint, wallGraph, graphFaces, detectRooms, buildingOutlines, roomAtPoint, cleanup,
  suggestRoomName,
} from "../../src/core/rooms.js";
import { roofModel, roofBase } from "../../src/core/roof.js";
import { newProject, normalizeProject, newLevel } from "../../src/core/project.js";
import { polygonArea, pointInPolygon, bounds, dist } from "../../src/core/geom.js";

// ---------------------------------------------------------------- helpers

const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a} (tol ${tol})`);
const area = (pts) => Math.abs(polygonArea(pts));
const sortedAreas = (rooms) => rooms.map((r) => Math.round(area(r.pts))).sort((a, b) => a - b);

let n = 0;
const W = (x1, y1, x2, y2, thickness = 200) => ({ id: `w${++n}`, level: "L", x1, y1, x2, y2, thickness });
// Closed loop of walls through the points.
const loop = (pts, t = 200) => pts.map((a, i) => W(a[0], a[1], pts[(i + 1) % pts.length][0], pts[(i + 1) % pts.length][1], t));
const rect = (x1, y1, x2, y2, t = 200) => loop([[x1, y1], [x2, y1], [x2, y2], [x1, y2]], t);

// ================================================================ graph
describe("wall graph", () => {
  test("a closed rectangle has four nodes and four edges (eight half-edges)", () => {
    const g = wallGraph(rect(0, 0, 4000, 3000));
    assert.equal(g.nodes.length, 4);
    assert.equal(g.edges.length, 8);
    for (const nd of g.nodes) assert.equal(nd.edges.length, 2);
    for (const e of g.edges) {
      assert.equal(e.twin.twin, e);
      assert.equal(e.twin.from, e.to);
    }
  });

  test("a T splits the through walls: six nodes, seven edges", () => {
    const walls = [...rect(0, 0, 6000, 3000), W(3000, 0, 3000, 3000)];
    const g = wallGraph(walls);
    assert.equal(g.nodes.length, 6);
    assert.equal(g.edges.length, 14);
    const degrees = g.nodes.map((nd) => nd.edges.length).sort();
    assert.deepEqual(degrees, [2, 2, 2, 2, 3, 3]);
  });

  test("a cross splits every wall at the centre: nine nodes, twelve edges", () => {
    const walls = [...rect(0, 0, 6000, 4000), W(3000, 0, 3000, 4000), W(0, 2000, 6000, 2000)];
    const g = wallGraph(walls);
    assert.equal(g.nodes.length, 9);
    assert.equal(g.edges.length, 24);
    const centre = g.nodes.find((nd) => nd.x === 3000 && nd.y === 2000);
    assert.ok(centre);
    assert.equal(centre.edges.length, 4);
  });

  test("two walls crossing without ends at the crossing are split there", () => {
    const g = wallGraph([W(0, 0, 4000, 4000), W(0, 4000, 4000, 0)]);
    assert.equal(g.nodes.length, 5);
    assert.equal(g.edges.length, 8);
  });

  test("a wall end 1 mm short of another wall still connects", () => {
    const walls = [...rect(0, 0, 6000, 3000), W(3000, 1, 3000, 3000)];
    const g = wallGraph(walls);
    assert.equal(g.edges.length, 14);
  });

  test("the half-edges around a node are sorted by angle", () => {
    const g = wallGraph([...rect(0, 0, 6000, 4000), W(3000, 0, 3000, 4000), W(0, 2000, 6000, 2000)]);
    for (const nd of g.nodes) for (let i = 1; i < nd.edges.length; i++) assert.ok(nd.edges[i].ang >= nd.edges[i - 1].ang);
  });

  test("graphFaces of a rectangle: one bounded face (positive) and the outer face (negative)", () => {
    const faces = graphFaces(rect(0, 0, 4000, 3000));
    assert.equal(faces.length, 2);
    const areas = faces.map((f) => f.area).sort((a, b) => a - b);
    assert.deepEqual(areas, [-12e6, 12e6]);
    for (const f of faces) assert.equal(f.walls.length, f.pts.length);
  });

  test("graphFaces of a T: two bounded faces and one outer face", () => {
    const faces = graphFaces([...rect(0, 0, 6000, 3000), W(3000, 0, 3000, 3000)]);
    const pos = faces.filter((f) => f.area > 0).map((f) => f.area);
    const neg = faces.filter((f) => f.area < 0).map((f) => f.area);
    assert.deepEqual(pos, [9e6, 9e6]);
    assert.deepEqual(neg, [-18e6]);
  });

  test("graphFaces of an open chain has no bounded face", () => {
    const faces = graphFaces([W(0, 0, 4000, 0), W(4000, 0, 4000, 3000), W(4000, 3000, 0, 3000)]);
    assert.equal(faces.filter((f) => f.area > 1e-6).length, 0);
  });
});

// ================================================================ detection
describe("detectRooms", () => {
  test("one rectangle makes one room bounded by the inner wall faces", () => {
    const rooms = detectRooms(rect(0, 0, 4000, 3000));
    assert.equal(rooms.length, 1);
    const r = rooms[0];
    assert.equal(r.area, 3800 * 2800);
    near(area(r.pts), 3800 * 2800);
    assert.deepEqual(bounds(r.pts), { x1: 100, y1: 100, x2: 3900, y2: 2900 });
    assert.equal(r.pts.length, 4);
    assert.equal(area(r.centre), 4000 * 3000, "centre is the centre-line face");
  });

  test("a dividing wall (T) makes two rooms", () => {
    const rooms = detectRooms([...rect(0, 0, 6000, 3000), W(3000, 0, 3000, 3000)]);
    assert.equal(rooms.length, 2);
    assert.deepEqual(sortedAreas(rooms), [2800 * 2800, 2800 * 2800]);
  });

  test("a cross makes four rooms", () => {
    const rooms = detectRooms([...rect(0, 0, 6000, 4000), W(3000, 0, 3000, 4000), W(0, 2000, 6000, 2000)]);
    assert.equal(rooms.length, 4);
    assert.deepEqual(sortedAreas(rooms), Array(4).fill(2800 * 1800));
  });

  test("an L-shaped house makes one six-cornered room", () => {
    const rooms = detectRooms(loop([[0, 0], [6000, 0], [6000, 3000], [3000, 3000], [3000, 6000], [0, 6000]]));
    assert.equal(rooms.length, 1);
    assert.equal(rooms[0].pts.length, 6);
    near(rooms[0].area, 5800 * 2800 + 2800 * 3000);
    assert.ok(pointInPolygon(1000, 5000, rooms[0].pts));
    assert.ok(!pointInPolygon(5000, 5000, rooms[0].pts));
  });

  test("room areas follow walls of different thickness exactly", () => {
    const walls = [...rect(0, 0, 6000, 4000, 300), W(3000, 0, 3000, 4000, 100)];
    const rooms = detectRooms(walls);
    assert.equal(rooms.length, 2);
    // Left: x 150…2950, y 150…3850. Right: x 3050…5850.
    assert.deepEqual(sortedAreas(rooms), [2800 * 3700, 2800 * 3700]);
    const left = rooms.find((r) => pointInPolygon(1000, 1000, r.pts));
    assert.deepEqual(bounds(left.pts), { x1: 150, y1: 150, x2: 2950, y2: 3850 });
  });

  test("the drawing direction of the walls does not matter", () => {
    const walls = rect(0, 0, 4000, 3000).map((w) => ({ ...w, x1: w.x2, y1: w.y2, x2: w.x1, y2: w.y1 }));
    const rooms = detectRooms(walls);
    assert.equal(rooms.length, 1);
    assert.equal(rooms[0].area, 3800 * 2800);
  });

  test("walls that do not close make no room", () => {
    assert.deepEqual(detectRooms([W(0, 0, 4000, 0), W(4000, 0, 4000, 3000), W(4000, 3000, 0, 3000)]), []);
    assert.deepEqual(detectRooms([]), []);
    assert.deepEqual(detectRooms([W(0, 0, 4000, 0)]), []);
  });

  test("a gap larger than the tolerance keeps the outline open", () => {
    const walls = [W(0, 0, 4000, 0), W(4000, 0, 4000, 3000), W(4000, 3000, 0, 3000), W(0, 3000, 0, 50)];
    assert.deepEqual(detectRooms(walls), []);
  });

  test("minArea filters out small spaces", () => {
    const small = rect(0, 0, 1000, 1000); // 800 × 800 inside = 0.64 m²
    assert.equal(detectRooms(small).length, 1);
    assert.equal(detectRooms(small, { minArea: 1e6 }).length, 0);
    const tiny = rect(0, 0, 800, 800); // 600 × 600 = 0.36 m² < default 0.5 m²
    assert.equal(detectRooms(tiny).length, 0);
    assert.equal(detectRooms(tiny, { minArea: 0 }).length, 1);
  });

  test("two separate buildings make separate rooms", () => {
    const rooms = detectRooms([...rect(0, 0, 4000, 3000), ...rect(10000, 0, 13000, 3000)]);
    assert.equal(rooms.length, 2);
    assert.deepEqual(sortedAreas(rooms), [2800 * 2800, 3800 * 2800]);
  });

  test("room polygons are cleaned: no repeated or collinear corners", () => {
    // The T node on the bottom wall would be a collinear corner of the left room.
    const rooms = detectRooms([...rect(0, 0, 6000, 3000), W(3000, 0, 3000, 1500), W(3000, 1500, 3000, 3000)]);
    for (const r of rooms) assert.equal(r.pts.length, 4);
  });

  test("buildingOutlines gives the outside faces of each block", () => {
    const outs = buildingOutlines(rect(0, 0, 4000, 3000));
    assert.equal(outs.length, 1);
    assert.equal(area(outs[0]), 4200 * 3200);
    assert.deepEqual(bounds(outs[0]), { x1: -100, y1: -100, x2: 4100, y2: 3100 });
  });

  test("buildingOutlines ignores inner walls and handles several blocks", () => {
    const outs = buildingOutlines([...rect(0, 0, 6000, 3000, 300), W(3000, 0, 3000, 3000, 100), ...rect(10000, 0, 12000, 2000)]);
    assert.equal(outs.length, 2);
    const areas = outs.map(area).sort((a, b) => a - b);
    assert.deepEqual(areas, [2200 * 2200, 6300 * 3300]);
  });

  test("buildingOutlines of an L follows the re-entrant corner", () => {
    const outs = buildingOutlines(loop([[0, 0], [6000, 0], [6000, 3000], [3000, 3000], [3000, 6000], [0, 6000]]));
    assert.equal(outs.length, 1);
    assert.equal(outs[0].length, 6);
    near(area(outs[0]), 6200 * 3200 + 3200 * 3000);
  });

  test("buildingOutlines drops lone walls (less than 1 m² enclosed)", () => {
    assert.deepEqual(buildingOutlines([W(0, 0, 5000, 0)]), []);
  });

  test("roomAtPoint picks the smallest room containing the point", () => {
    const walls = [...rect(0, 0, 10000, 10000), ...rect(3000, 3000, 6000, 6000)];
    const inner = roomAtPoint(walls, 4500, 4500);
    assert.ok(inner);
    near(inner.area, 2800 * 2800);
    const outer = roomAtPoint(walls, 1000, 1000);
    near(outer.area, 9800 * 9800);
    assert.equal(roomAtPoint(walls, -500, -500), null);
  });

  test("roomAtPoint finds small rooms below the normal minimum area", () => {
    const walls = rect(0, 0, 800, 800);
    const r = roomAtPoint(walls, 400, 400);
    assert.ok(r);
    near(r.area, 600 * 600);
  });

  test("roomAtPoint picks the right room of a T", () => {
    const walls = [...rect(0, 0, 6000, 3000), W(3000, 0, 3000, 3000)];
    const r = roomAtPoint(walls, 4500, 1500);
    assert.deepEqual(bounds(r.pts), { x1: 3100, y1: 100, x2: 5900, y2: 2900 });
  });
});

// ================================================================ helpers
describe("room helpers", () => {
  test("cleanup drops repeated and collinear points and rounds to 0.1 mm", () => {
    const out = cleanup([[0, 0], [0.2, 0], [500, 0], [1000, 0], [1000, 1000.04], [0, 1000]]);
    assert.deepEqual(out, [[0.2, 0], [1000, 0], [1000, 1000], [0, 1000]]);
    for (const [x, y] of out) {
      assert.equal(Math.round(x * 10) / 10, x);
      assert.equal(Math.round(y * 10) / 10, y);
    }
    near(area(out), 1e6, 300);
  });

  test("cleanup keeps a triangle and real corners", () => {
    assert.deepEqual(cleanup([[0, 0], [1000, 0], [0, 1000]]), [[0, 0], [1000, 0], [0, 1000]]);
    const L = [[0, 0], [2000, 0], [2000, 1000], [1000, 1000], [1000, 2000], [0, 2000]];
    assert.deepEqual(cleanup(L), L);
  });

  test("cleanup removes a point in the middle of a straight edge", () => {
    assert.deepEqual(cleanup([[0, 0], [1000, 0], [2000, 0], [2000, 1000], [0, 1000]]), [[0, 0], [2000, 0], [2000, 1000], [0, 1000]]);
  });

  test("roomArea, roomPerimeter and roomLabelPoint", () => {
    const r = { pts: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] };
    assert.equal(roomArea(r), 12e6);
    assert.equal(roomArea({ pts: r.pts.slice().reverse() }), 12e6, "area is unsigned");
    assert.equal(roomPerimeter(r), 14000);
    assert.deepEqual(roomLabelPoint(r), [2000, 1500]);
    const U = { pts: [[0, 0], [3000, 0], [3000, 3000], [2000, 3000], [2000, 1000], [1000, 1000], [1000, 3000], [0, 3000]] };
    const [x, y] = roomLabelPoint(U);
    assert.ok(pointInPolygon(x, y, U.pts));
  });

  test("suggestRoomName goes by size", () => {
    assert.equal(suggestRoomName(2e6, 0), "Storage");
    assert.equal(suggestRoomName(2.99e6, 0), "Storage");
    assert.equal(suggestRoomName(3e6, 0), "Bathroom");
    assert.equal(suggestRoomName(5.9e6, 3), "Bathroom");
    assert.equal(suggestRoomName(6e6, 0), "Room");
    assert.equal(suggestRoomName(8.9e6, 0), "Room");
    assert.equal(suggestRoomName(9e6, 0), "Bedroom", "the first mid-size room is the bedroom");
    assert.equal(suggestRoomName(12e6, 1), "Room");
    assert.equal(suggestRoomName(16e6, 0), "Living room");
    assert.equal(suggestRoomName(40e6, 5), "Living room");
  });

  test("suggestRoomName passes the name through the translator", () => {
    const ko = { Storage: "창고", Bedroom: "침실", "Living room": "거실" };
    const t = (s) => ko[s] || s;
    assert.equal(suggestRoomName(1e6, 0, t), "창고");
    assert.equal(suggestRoomName(10e6, 0, t), "침실");
    assert.equal(suggestRoomName(20e6, 0, t), "거실");
  });
});

// ================================================================ roofs
describe("roof.js", () => {
  const TAN30 = Math.tan(Math.PI / 6);
  const box = [[0, 0], [10000, 0], [10000, 8000], [0, 8000]];
  const roof = (kind, extra = {}) => ({ id: "f", level: "L", pts: box, kind, pitch: 30, overhang: 500, thickness: 200, ...extra });
  const zs = (m) => m.faces.flatMap((f) => f.pts.map((p) => p[2]));

  test("roofBase is the top of the level's walls plus the roof offset", () => {
    const p = newProject();
    p.levels[0].id = "L";
    p.levels.push({ ...newLevel("2F", 2800, 3000), id: "U" });
    normalizeProject(p);
    assert.equal(roofBase(p, { level: "L" }), 2800);
    assert.equal(roofBase(p, { level: "U" }), 5800);
    assert.equal(roofBase(p, { level: "U", offset: 150 }), 5950);
    assert.equal(roofBase(p, { level: "gone" }), 2800);
  });

  test("a flat roof follows the polygon grown by the overhang", () => {
    const m = roofModel(roof("flat"), 2800);
    assert.equal(m.flat, true);
    assert.deepEqual(bounds(m.outline), { x1: -500, y1: -500, x2: 10500, y2: 8500 });
    assert.equal(m.faces.length, 1);
    for (const z of zs(m)) assert.equal(z, 2800 + 200, "the slab sits on top of the walls");
    assert.equal(m.peak, 3000);
    assert.deepEqual(m.lines, []);
    assert.deepEqual(m.gables, []);
  });

  test("a flat roof keeps the polygon's own orientation (clockwise input)", () => {
    const m = roofModel(roof("flat", { pts: box.slice().reverse() }), 0);
    near(area(m.outline), 11000 * 9000);
  });

  test("a pitched roof with zero pitch is flat", () => {
    const m = roofModel(roof("gable", { pitch: 0 }), 1000);
    assert.equal(m.flat, true);
    assert.equal(m.peak, 1200, "base + the slab thickness");
  });

  test("a flat roof's top follows its own thickness, 200 mm by default", () => {
    assert.equal(roofModel(roof("flat", { thickness: 350 }), 2800).peak, 3150);
    assert.equal(roofModel({ pts: box, kind: "flat" }, 2800).peak, 3000);
  });

  test("a gable roof: overhang outline, ridge height, eaves and two gables", () => {
    const base = 5600;
    const m = roofModel(roof("gable"), base);
    const b = bounds(m.outline);
    near(b.x1, -500); near(b.x2, 10500); near(b.y1, -500); near(b.y2, 8500);
    near(m.peak, base + 4000 * TAN30, 1e-6, "ridge = base + (wid / 2)·tan(pitch)");
    assert.equal(m.faces.length, 2);
    assert.equal(m.gables.length, 2);
    assert.equal(m.lines.length, 1);
    const [x1, y1, x2, y2] = m.lines[0];
    near(y1, 4000, 1e-6, "the ridge runs along the long side");
    near(y2, 4000, 1e-6);
    near(Math.abs(x2 - x1), 11000, 1e-6, "the ridge spans the length plus both overhangs");
    near(Math.min(...zs(m)), base - 500 * TAN30, 1e-6, "eaves hang below the base by overhang·tan(pitch)");
    near(Math.max(...zs(m)), m.peak, 1e-6);
    // Gable triangles stand on the wall line at both ends.
    for (const g of m.gables) {
      assert.equal(g.pts.length, 3);
      const xs = g.pts.map((p) => p[0]);
      near(Math.min(...xs), Math.max(...xs), 1e-6, "a gable is vertical");
      assert.ok(Math.abs(xs[0]) < 1e-6 || Math.abs(xs[0] - 10000) < 1e-6);
      near(Math.max(...g.pts.map((p) => p[2])), m.peak, 1e-6);
    }
    near(m.rect.len, 10000, 1e-6);
    near(m.rect.wid, 8000, 1e-6);
  });

  test("a gable roof surface passes through the wall line at the base height", () => {
    const base = 3000;
    const m = roofModel(roof("gable"), base);
    // On the long-side face the slope runs from the eave (y = −500) to the ridge (y = 4000).
    const face = m.faces[0].pts;
    const eave = face.find((p) => Math.abs(p[1] + 500) < 1e-6);
    const ridge = face.find((p) => Math.abs(p[1] - 4000) < 1e-6);
    const zAtWall = eave[2] + ((ridge[2] - eave[2]) * (0 - -500)) / (4000 - -500);
    near(zAtWall, base, 1e-6);
  });

  test("a hip roof: four faces, ridge length = length − width", () => {
    const m = roofModel(roof("hip"), 2800);
    assert.equal(m.faces.length, 4);
    assert.equal(m.lines.length, 5, "ridge plus four hips");
    assert.equal(m.gables.length, 0);
    const [x1, y1, x2, y2] = m.lines[0];
    near(Math.hypot(x2 - x1, y2 - y1), 10000 - 8000, 1e-6);
    near(m.peak, 2800 + 4000 * TAN30, 1e-6);
    assert.equal(m.faces.filter((f) => f.pts.length === 3).length, 2, "two hip ends are triangles");
  });

  test("a hip roof on a square comes to a point", () => {
    const m = roofModel(roof("hip", { pts: [[0, 0], [6000, 0], [6000, 6000], [0, 6000]] }), 0);
    const [x1, y1, x2, y2] = m.lines[0];
    near(Math.hypot(x2 - x1, y2 - y1), 0, 1e-6);
  });

  test("a shed roof: one sloped face rising across the width", () => {
    const base = 2800;
    const m = roofModel(roof("shed", { pitch: 15 }), base);
    const tan = Math.tan((15 * Math.PI) / 180);
    assert.equal(m.faces.length, 1);
    assert.equal(m.gables.length, 2);
    assert.equal(m.lines.length, 1);
    near(m.peak, base + 8000 * tan + 500 * tan, 1e-6);
    near(Math.min(...zs(m)), base - 500 * tan, 1e-6);
    for (const g of m.gables) near(Math.max(...g.pts.map((p) => p[2])), base + 8000 * tan, 1e-6);
  });

  test("rot 90 swaps the ridge to the short side", () => {
    const base = 0;
    const m = roofModel(roof("gable", { rot: 90 }), base);
    const [x1, y1, x2, y2] = m.lines[0];
    near(x1, 5000, 1e-6, "the ridge now runs across the box");
    near(x2, 5000, 1e-6);
    near(Math.abs(y2 - y1), 9000, 1e-6, "short side plus both overhangs");
    near(m.peak, base + 5000 * TAN30, 1e-6, "the half span is now half the long side");
    const b = bounds(m.outline);
    near(b.x2 - b.x1, 11000, 1e-6, "the outline still covers the box");
    near(b.y2 - b.y1, 9000, 1e-6);
  });

  test("rot 180 keeps the ridge direction", () => {
    const a = roofModel(roof("gable"), 0);
    const b = roofModel(roof("gable", { rot: 180 }), 0);
    near(a.peak, b.peak, 1e-6);
    near(Math.abs(b.lines[0][1] - b.lines[0][3]), 0, 1e-6);
  });

  test("pitched roofs on a rotated box follow the box", () => {
    const c = Math.cos(Math.PI / 4), s = Math.sin(Math.PI / 4);
    const pts = box.map(([x, y]) => [x * c - y * s, x * s + y * c]);
    const m = roofModel(roof("gable", { pts }), 0);
    near(m.peak, 4000 * TAN30, 1e-6);
    const [x1, y1, x2, y2] = m.lines[0];
    near(Math.hypot(x2 - x1, y2 - y1), 11000, 1e-6);
    near(Math.abs(Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI) % 180, 45, 1e-6);
    for (const p of pts) assert.ok(pointInPolygon(p[0] * 0.999, p[1] * 0.999, m.outline) || dist(...p, 0, 0) < 1);
  });

  test("a roof without overhang or pitch fields still builds", () => {
    const m = roofModel({ pts: box, kind: "gable" }, 0);
    assert.equal(m.flat, true, "no pitch means flat");
    near(area(m.outline), 10000 * 8000);
  });
});
