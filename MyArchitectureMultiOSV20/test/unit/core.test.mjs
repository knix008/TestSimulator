// Unit tests for the core model: plane geometry (src/core/geom.js), the
// project model (src/core/project.js), the undo store (src/ui/store.js), the
// colour themes (src/ui/themes.js) and the sun position (src/core/sun.js).
// Run: node --test test/unit/core.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  EPS, uid, dist, clamp, snap, deg, rad, normAngle, rotPt, toWorld, toLocal, closestOnSegment, pointSegDist,
  lineIntersect, segIntersect, polygonArea, polygonPerimeter, polygonCentroid, labelPoint, pointInPolygon, bounds,
  unionBounds, clipHalfPlane, offsetPolygon, convexHull, orientedRect, triangulate, snapAngle, fmtLen, fmtArea,
} from "../../src/core/geom.js";
import {
  FORMAT, FORMAT_VERSION, LEVEL_COLLECTIONS, COLLECTIONS, DEFAULTS, DEFAULT_WALL_TYPES, PHASES, DEFAULT_COSTS,
  newLevel, newProject, normalizeProject, parseProject, serializeProject, levelById, levelIndex, onLevel, wallById,
  openingsOf, levelOfItem, wallHeight, wallTypeThickness, wallTypeOf, wallLength, levelAbove, findItem, openingTags,
} from "../../src/core/project.js";
import { Store } from "../../src/ui/store.js";
import {
  THEMES, DEFAULT_THEME, allThemes, themeById, randomTheme, setCustomThemes, customThemes, mix, contrast, uiTokens,
  canvasColors,
} from "../../src/ui/themes.js";
import { sunPosition, daylight } from "../../src/core/sun.js";

// ---------------------------------------------------------------- helpers

const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a} (tol ${tol})`);
const nearPt = (p, q, tol = 1e-6, msg = "") => { near(p[0], q[0], tol, `${msg} x`); near(p[1], q[1], tol, `${msg} y`); };
const nearPts = (ps, qs, tol = 1e-6, msg = "") => {
  assert.equal(ps.length, qs.length, `${msg} point count`);
  ps.forEach((p, i) => nearPt(p, qs[i], tol, `${msg} #${i}`));
};
const triArea = (pts, [i, j, k]) => Math.abs(polygonArea([pts[i], pts[j], pts[k]]));
const HEX = /^#[0-9a-f]{6}$/i;

const SQUARE = [[0, 0], [10, 0], [10, 10], [0, 10]];
const L_SHAPE = [[0, 0], [6000, 0], [6000, 3000], [3000, 3000], [3000, 6000], [0, 6000]];
const U_SHAPE = [[0, 0], [3000, 0], [3000, 3000], [2000, 3000], [2000, 1000], [1000, 1000], [1000, 3000], [0, 3000]];

// A project with two levels and a few walls, normalized.
function twoLevelProject() {
  const p = newProject("Test");
  const l1 = p.levels[0];
  const l2 = newLevel("2F", 2800, 3000);
  p.levels.push(l2);
  p.walls.push(
    { id: "w1", level: l1.id, x1: 0, y1: 0, x2: 5000, y2: 0, thickness: 200 },
    { id: "w2", level: l1.id, x1: 0, y1: 4000, x2: 5000, y2: 4000, thickness: 200 },
    { id: "w3", level: l2.id, x1: 0, y1: 0, x2: 5000, y2: 0, thickness: 200, height: 2400 },
  );
  return normalizeProject(p);
}

// ================================================================ geom.js
describe("geom.js — small helpers", () => {
  test("dist, clamp, snap, deg, rad and normAngle behave like their maths", () => {
    assert.equal(dist(0, 0, 3, 4), 5);
    assert.equal(dist(1, 1, 1, 1), 0);
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(-5, 0, 10), 0);
    assert.equal(clamp(15, 0, 10), 10);
    assert.equal(snap(149, 100), 100);
    assert.equal(snap(151, 100), 200);
    assert.equal(snap(-151, 100), -200);
    assert.equal(snap(123.4, 0), 123.4, "a zero step does not snap");
    assert.equal(snap(123.4, -5), 123.4, "a negative step does not snap");
    near(deg(Math.PI), 180);
    near(rad(90), Math.PI / 2);
    near(deg(rad(37.5)), 37.5);
    assert.equal(normAngle(370), 10);
    assert.equal(normAngle(-90), 270);
    assert.equal(normAngle(720), 0);
    assert.equal(normAngle(0), 0);
    assert.ok(EPS > 0 && EPS < 1e-3);
  });

  test("uid makes distinct ids with the requested prefix", () => {
    const ids = new Set();
    for (let i = 0; i < 2000; i++) ids.add(uid("w"));
    assert.equal(ids.size, 2000);
    for (const id of ids) assert.match(id, /^w[0-9a-z]+$/);
    assert.match(uid(), /^x/);
  });
});

describe("geom.js — rotation and frames", () => {
  test("rotPt turns a point counter-clockwise in maths axes", () => {
    nearPt(rotPt(1, 0, 90), [0, 1]);
    nearPt(rotPt(0, 1, 90), [-1, 0]);
    nearPt(rotPt(1, 0, 180), [-1, 0]);
    nearPt(rotPt(1, 0, -90), [0, -1]);
    nearPt(rotPt(2, 3, 360), [2, 3]);
    nearPt(rotPt(1, 1, 45), [0, Math.SQRT2]);
  });

  test("rotPt with a zero or missing angle returns the point unchanged", () => {
    assert.deepEqual(rotPt(3, 4, 0), [3, 4]);
    assert.deepEqual(rotPt(3, 4, undefined), [3, 4]);
  });

  test("rotPt keeps the distance from the origin", () => {
    for (const a of [13, 77, 145, 211, 333]) {
      const [x, y] = rotPt(300, -400, a);
      near(Math.hypot(x, y), 500, 1e-9);
    }
  });

  test("toWorld and toLocal are inverse to each other", () => {
    const item = { x: 1200, y: -300, rot: 37 };
    for (const [lx, ly] of [[0, 0], [100, 0], [-250, 400], [1234.5, -987.6]]) {
      const w = toWorld(item, lx, ly);
      nearPt(toLocal(item, ...w), [lx, ly], 1e-9);
    }
    nearPt(toWorld(item, 0, 0), [1200, -300]);
  });

  test("toWorld of an item without rot only translates", () => {
    assert.deepEqual(toWorld({ x: 10, y: 20 }, 5, 6), [15, 26]);
    assert.deepEqual(toLocal({ x: 10, y: 20 }, 15, 26), [5, 6]);
  });

  test("toWorld applies a quarter turn about the item origin", () => {
    nearPt(toWorld({ x: 100, y: 100, rot: 90 }, 50, 0), [100, 150]);
  });
});

describe("geom.js — segments and lines", () => {
  test("closestOnSegment clamps to the start before the segment", () => {
    const c = closestOnSegment(-5, 3, 0, 0, 10, 0);
    assert.equal(c.t, 0);
    nearPt([c.x, c.y], [0, 0]);
    near(c.d, Math.hypot(5, 3));
  });

  test("closestOnSegment clamps to the end past the segment", () => {
    const c = closestOnSegment(15, -4, 0, 0, 10, 0);
    assert.equal(c.t, 1);
    nearPt([c.x, c.y], [10, 0]);
    near(c.d, Math.hypot(5, 4));
  });

  test("closestOnSegment projects onto the middle of the segment", () => {
    const c = closestOnSegment(5, 7, 0, 0, 10, 0);
    near(c.t, 0.5);
    nearPt([c.x, c.y], [5, 0]);
    near(c.d, 7);
    const d = closestOnSegment(0, 10, 0, 0, 10, 10);
    near(d.t, 0.5);
    nearPt([d.x, d.y], [5, 5]);
    near(d.d, Math.hypot(5, 5));
  });

  test("closestOnSegment of a degenerate segment returns its single point", () => {
    const c = closestOnSegment(3, 4, 0, 0, 0, 0);
    assert.equal(c.t, 0);
    near(c.d, 5);
  });

  test("pointSegDist is the distance part of closestOnSegment", () => {
    near(pointSegDist(5, 7, 0, 0, 10, 0), 7);
    near(pointSegDist(13, 4, 0, 0, 10, 0), 5);
  });

  test("lineIntersect finds the crossing of two infinite lines", () => {
    nearPt(lineIntersect([0, 0], [1, 0], [5, -3], [0, 1]), [5, 0]);
    nearPt(lineIntersect([0, 0], [1, 1], [10, 0], [-1, 1]), [5, 5]);
    // The lines are infinite: the crossing may lie behind either start.
    nearPt(lineIntersect([10, 0], [1, 0], [0, 5], [0, 1]), [0, 0]);
  });

  test("lineIntersect returns null for parallel and coincident lines", () => {
    assert.equal(lineIntersect([0, 0], [1, 0], [0, 5], [2, 0]), null);
    assert.equal(lineIntersect([0, 0], [1, 1], [3, 3], [-1, -1]), null);
  });

  test("segIntersect reports a proper crossing with both parameters", () => {
    const x = segIntersect(0, 0, 10, 10, 0, 10, 10, 0);
    nearPt([x.x, x.y], [5, 5]);
    near(x.t, 0.5);
    near(x.u, 0.5);
  });

  test("segIntersect reports touching segments (T and shared end)", () => {
    const tee = segIntersect(0, 0, 10, 0, 5, 0, 5, 5);
    assert.ok(tee);
    nearPt([tee.x, tee.y], [5, 0]);
    near(tee.t, 0.5);
    near(tee.u, 0);
    const corner = segIntersect(0, 0, 10, 0, 10, 0, 10, 10);
    assert.ok(corner);
    near(corner.t, 1);
    near(corner.u, 0);
  });

  test("segIntersect returns null when segments miss or are parallel", () => {
    assert.equal(segIntersect(0, 0, 10, 0, 5, 1, 5, 5), null, "stops short");
    assert.equal(segIntersect(0, 0, 10, 0, 11, -5, 11, 5), null, "beyond the end");
    assert.equal(segIntersect(0, 0, 10, 0, 0, 1, 10, 1), null, "parallel");
    assert.equal(segIntersect(0, 0, 10, 0, 2, 0, 8, 0), null, "collinear overlap counts as parallel");
  });
});

describe("geom.js — polygons", () => {
  test("polygonArea is positive counter-clockwise and negative clockwise", () => {
    assert.equal(polygonArea(SQUARE), 100);
    assert.equal(polygonArea(SQUARE.slice().reverse()), -100);
    assert.equal(polygonArea(L_SHAPE), 27e6);
    assert.equal(polygonArea(U_SHAPE), 7e6);
    assert.equal(polygonArea([[0, 0], [1, 1]]), 0);
    assert.equal(polygonArea([]), 0);
  });

  test("polygonPerimeter of closed and open outlines", () => {
    assert.equal(polygonPerimeter(SQUARE), 40);
    assert.equal(polygonPerimeter(SQUARE, false), 30);
    assert.equal(polygonPerimeter(L_SHAPE), 24000);
  });

  test("polygonCentroid of a rectangle, a triangle and an L", () => {
    nearPt(polygonCentroid([[0, 0], [4, 0], [4, 2], [0, 2]]), [2, 1]);
    nearPt(polygonCentroid([[0, 0], [3, 0], [0, 3]]), [1, 1]);
    nearPt(polygonCentroid(SQUARE.slice().reverse()), [5, 5], 1e-9, "orientation does not matter");
    // L: 6000×3000 block (centre 3000,1500) + 3000×3000 block (1500,4500).
    const [cx, cy] = polygonCentroid(L_SHAPE);
    near(cx, (18e6 * 3000 + 9e6 * 1500) / 27e6, 1e-6);
    near(cy, (18e6 * 1500 + 9e6 * 4500) / 27e6, 1e-6);
  });

  test("polygonCentroid of a degenerate polygon falls back to the vertex average", () => {
    nearPt(polygonCentroid([[0, 0], [10, 0], [20, 0]]), [10, 0]);
    nearPt(polygonCentroid([]), [0, 0]);
  });

  test("labelPoint returns the centroid when it lies inside", () => {
    nearPt(labelPoint(SQUARE), [5, 5]);
  });

  test("labelPoint finds a point inside a U-shaped polygon whose centroid is in the notch", () => {
    const c = polygonCentroid(U_SHAPE);
    assert.equal(pointInPolygon(c[0], c[1], U_SHAPE), false, "the centroid falls in the notch");
    const [x, y] = labelPoint(U_SHAPE);
    assert.ok(pointInPolygon(x, y, U_SHAPE), `label point ${x},${y} is inside`);
  });

  test("labelPoint stays inside a C-shaped polygon opening to the side", () => {
    const C = [[0, 0], [4000, 0], [4000, 1000], [1000, 1000], [1000, 3000], [4000, 3000], [4000, 4000], [0, 4000]];
    const [x, y] = labelPoint(C);
    assert.ok(pointInPolygon(x, y, C));
  });

  test("pointInPolygon distinguishes inside, outside and the notch", () => {
    assert.equal(pointInPolygon(5, 5, SQUARE), true);
    assert.equal(pointInPolygon(15, 5, SQUARE), false);
    assert.equal(pointInPolygon(-1, -1, SQUARE), false);
    assert.equal(pointInPolygon(1000, 1000, L_SHAPE), true);
    assert.equal(pointInPolygon(5000, 5000, L_SHAPE), false);
    assert.equal(pointInPolygon(1500, 2000, U_SHAPE), false);
    assert.equal(pointInPolygon(500, 2000, U_SHAPE), true);
    assert.equal(pointInPolygon(5, 5, SQUARE.slice().reverse()), true, "orientation does not matter");
  });

  test("bounds and unionBounds", () => {
    assert.deepEqual(bounds(L_SHAPE), { x1: 0, y1: 0, x2: 6000, y2: 6000 });
    assert.deepEqual(bounds([[3, -2], [-1, 7]]), { x1: -1, y1: -2, x2: 3, y2: 7 });
    const a = { x1: 0, y1: 0, x2: 5, y2: 5 };
    const b = { x1: -3, y1: 2, x2: 4, y2: 9 };
    assert.deepEqual(unionBounds(a, b), { x1: -3, y1: 0, x2: 5, y2: 9 });
    assert.equal(unionBounds(null, b), b);
    assert.equal(unionBounds(a, null), a);
    assert.equal(unionBounds(null, null), null);
    const empty = bounds([]);
    assert.equal(empty.x1, Infinity);
    assert.equal(empty.x2, -Infinity);
  });

  test("clipHalfPlane keeps the part on the positive side", () => {
    const right = clipHalfPlane(SQUARE, [0, 0], [1, 0], 5);
    near(Math.abs(polygonArea(right)), 50);
    for (const [x] of right) assert.ok(x >= 5 - 1e-9);
    const left = clipHalfPlane(SQUARE, [0, 0], [-1, 0], -5);
    near(Math.abs(polygonArea(left)), 50);
    for (const [x] of left) assert.ok(x <= 5 + 1e-9);
    const diag = clipHalfPlane(SQUARE, [0, 0], [Math.SQRT1_2, Math.SQRT1_2], Math.hypot(5, 5));
    near(Math.abs(polygonArea(diag)), 50, 1e-9, "the diagonal halves the square");
  });

  test("clipHalfPlane keeps everything or nothing when the line misses", () => {
    assert.deepEqual(clipHalfPlane(SQUARE, [0, 0], [1, 0], -100), SQUARE);
    assert.deepEqual(clipHalfPlane(SQUARE, [0, 0], [1, 0], 100), []);
  });

  test("offsetPolygon insets a counter-clockwise square by one distance", () => {
    nearPts(offsetPolygon(SQUARE, 1), [[1, 1], [9, 1], [9, 9], [1, 9]]);
  });

  test("offsetPolygon insets a clockwise square into the polygon too", () => {
    const cw = SQUARE.slice().reverse(); // [0,10] [10,10] [10,0] [0,0]
    nearPts(offsetPolygon(cw, 1), [[1, 9], [9, 9], [9, 1], [1, 1]]);
  });

  test("offsetPolygon applies per-edge distances (counter-clockwise)", () => {
    // Edges: bottom y=0 → 1, right x=10 → 2, top y=10 → 3, left x=0 → 4.
    nearPts(offsetPolygon(SQUARE, [1, 2, 3, 4]), [[4, 1], [8, 1], [8, 7], [4, 7]]);
  });

  test("offsetPolygon applies per-edge distances (clockwise)", () => {
    // Edges: top y=10 → 1, right x=10 → 2, bottom y=0 → 3, left x=0 → 4.
    nearPts(offsetPolygon(SQUARE.slice().reverse(), [1, 2, 3, 4]), [[4, 9], [8, 9], [8, 3], [4, 3]]);
  });

  test("offsetPolygon with a negative distance grows the polygon", () => {
    nearPts(offsetPolygon(SQUARE, -2), [[-2, -2], [12, -2], [12, 12], [-2, 12]]);
    const grown = offsetPolygon(L_SHAPE, -100);
    near(polygonArea(grown), 6200 * 3200 + 3200 * 3000, 1e-6);
  });

  test("offsetPolygon of an L keeps the re-entrant corner exact", () => {
    nearPts(offsetPolygon(L_SHAPE, 100), [[100, 100], [5900, 100], [5900, 2900], [2900, 2900], [2900, 5900], [100, 5900]]);
  });

  test("offsetPolygon bevels a very sharp corner instead of spiking", () => {
    const spike = [[0, 0], [10000, 0], [0, 100]];
    const out = offsetPolygon(spike, 20);
    assert.equal(out.length, 3);
    // The mitre at (10000, 0) would land thousands of mm away; the bevel stays by the corner.
    assert.ok(dist(...out[1], 10000, 0) <= 20 * 6, `sharp corner moved ${dist(...out[1], 10000, 0)}`);
  });

  test("offsetPolygon leaves fewer than three points alone", () => {
    assert.deepEqual(offsetPolygon([[0, 0], [5, 5]], 3), [[0, 0], [5, 5]]);
  });

  test("convexHull drops interior and collinear points and runs counter-clockwise", () => {
    const pts = [[0, 0], [10, 0], [10, 10], [0, 10], [5, 5], [3, 7], [5, 0], [10, 5]];
    const hull = convexHull(pts);
    assert.equal(hull.length, 4);
    assert.ok(polygonArea(hull) > 0);
    near(polygonArea(hull), 100);
    for (const q of [[0, 0], [10, 0], [10, 10], [0, 10]]) assert.ok(hull.some((h) => h[0] === q[0] && h[1] === q[1]));
  });

  test("convexHull of fewer than three points returns them sorted", () => {
    assert.deepEqual(convexHull([[5, 1], [2, 3]]), [[2, 3], [5, 1]]);
    assert.deepEqual(convexHull([]), []);
  });

  test("convexHull does not modify its input", () => {
    const pts = [[3, 3], [0, 0], [6, 0], [0, 6]];
    const copy = JSON.parse(JSON.stringify(pts));
    convexHull(pts);
    assert.deepEqual(pts, copy);
  });

  test("orientedRect fits an axis-aligned rectangle", () => {
    const r = orientedRect([[0, 0], [4000, 0], [4000, 1000], [0, 1000]]);
    near(r.len, 4000, 1e-6);
    near(r.wid, 1000, 1e-6);
    near(r.cx, 2000, 1e-6);
    near(r.cy, 500, 1e-6);
    near(r.angle % 180, 0, 1e-6);
  });

  test("orientedRect fits a rotated rectangle and reports its angle", () => {
    const pts = [[-2000, -500], [2000, -500], [2000, 500], [-2000, 500]].map(([x, y]) => {
      const [rx, ry] = rotPt(x, y, 30);
      return [rx + 500, ry + 300];
    });
    const r = orientedRect(pts);
    near(r.len, 4000, 1e-6);
    near(r.wid, 1000, 1e-6);
    near(r.cx, 500, 1e-6);
    near(r.cy, 300, 1e-6);
    near(((r.angle % 180) + 180) % 180, 30, 1e-6);
  });

  test("orientedRect swaps length and width so the long side wins", () => {
    const r = orientedRect([[0, 0], [1000, 0], [1000, 4000], [0, 4000]]);
    near(r.len, 4000, 1e-6);
    near(r.wid, 1000, 1e-6);
    near(r.angle % 180, 90, 1e-6);
  });

  test("orientedRect of nothing is an empty rectangle", () => {
    assert.deepEqual(orientedRect([]), { cx: 0, cy: 0, len: 0, wid: 0, angle: 0, area: 0 });
  });

  for (const [name, pts] of [
    ["convex square", SQUARE],
    ["convex hexagon", [...Array(6).keys()].map((i) => rotPt(1000, 0, i * 60))],
    ["concave L", L_SHAPE],
    ["concave U", U_SHAPE],
    ["clockwise L", L_SHAPE.slice().reverse()],
    ["clockwise U", U_SHAPE.slice().reverse()],
  ]) {
    test(`triangulate covers the ${name} exactly with n − 2 triangles`, () => {
      const tris = triangulate(pts);
      assert.equal(tris.length, pts.length - 2);
      const sum = tris.reduce((s, t) => s + triArea(pts, t), 0);
      near(sum, Math.abs(polygonArea(pts)), 1e-6 * Math.abs(polygonArea(pts)));
      for (const t of tris) {
        assert.equal(new Set(t).size, 3, "three distinct corners");
        for (const i of t) assert.ok(i >= 0 && i < pts.length);
        // Every triangle's centroid is inside the polygon (no triangle in a notch).
        const cx = (pts[t[0]][0] + pts[t[1]][0] + pts[t[2]][0]) / 3;
        const cy = (pts[t[0]][1] + pts[t[1]][1] + pts[t[2]][1]) / 3;
        assert.ok(pointInPolygon(cx, cy, pts), `triangle ${t} lies inside`);
      }
    });
  }

  test("triangulate of fewer than three points is empty", () => {
    assert.deepEqual(triangulate([[0, 0], [1, 1]]), []);
    assert.deepEqual(triangulate([]), []);
  });

  test("triangulate of a triangle is that triangle", () => {
    const tris = triangulate([[0, 0], [10, 0], [0, 10]]);
    assert.equal(tris.length, 1);
    assert.deepEqual([...tris[0]].sort(), [0, 1, 2]);
  });
});

describe("geom.js — angles and formatting", () => {
  test("snapAngle rounds to the nearest step", () => {
    assert.equal(snapAngle(44), 45);
    assert.equal(snapAngle(-44), -45);
    assert.equal(snapAngle(100), 90);
    assert.equal(snapAngle(170, 90), 180);
    assert.equal(snapAngle(22, 15), 15);
    assert.equal(snapAngle(0), 0);
  });

  test("snapAngle leaves an angle alone outside the tolerance", () => {
    assert.equal(snapAngle(20, 45, 10), 20);
    assert.equal(snapAngle(40, 45, 10), 45);
    assert.equal(snapAngle(52, 45, 5), 52);
  });

  test("fmtLen in millimetres rounds to whole millimetres", () => {
    assert.equal(fmtLen(3600), "3600 mm");
    assert.equal(fmtLen(1234.6), "1235 mm");
    assert.equal(fmtLen(0), "0 mm");
    assert.equal(fmtLen(-250), "-250 mm");
  });

  test("fmtLen in centimetres and metres", () => {
    assert.equal(fmtLen(3600, "cm"), "360.0 cm");
    assert.equal(fmtLen(1234, "cm"), "123.4 cm");
    assert.equal(fmtLen(3600, "m"), "3.60 m");
    assert.equal(fmtLen(1234, "m"), "1.23 m");
  });

  test("fmtLen in feet and inches", () => {
    assert.equal(fmtLen(3810, "ft"), "12' 6.0\"");
    assert.equal(fmtLen(12 * 25.4 * 13, "ft"), "13' 0.0\"");
    assert.equal(fmtLen(35 * 25.4, "ft"), "2' 11\"");
    assert.equal(fmtLen(25.4, "ft"), "0' 1.0\"");
    assert.equal(fmtLen(304.8, "ft"), "1' 0.0\"");
  });

  test("fmtLen in feet never shows 12 inches", () => {
    // 2 ft 11.96 in rounds to 3' 0", not 2' 12".
    assert.equal(fmtLen((24 + 11.96) * 25.4, "ft"), "3' 0.0\"");
  });

  test("fmtLen of a non-finite value is a dash", () => {
    assert.equal(fmtLen(NaN), "—");
    assert.equal(fmtLen(Infinity, "m"), "—");
    assert.equal(fmtLen(undefined), "—");
  });

  test("fmtArea in square metres and square feet", () => {
    assert.equal(fmtArea(12.5e6), "12.50 m²");
    assert.equal(fmtArea(0), "0.00 m²");
    assert.equal(fmtArea(12.5e6, "m"), "12.50 m²");
    assert.equal(fmtArea(929030.4, "ft"), "10.0 ft²");
  });
});

// ================================================================ project.js
describe("project.js — new projects", () => {
  test("constants describe the format and the collections", () => {
    assert.equal(FORMAT, "myarch");
    assert.equal(FORMAT_VERSION, 1);
    for (const k of ["walls", "rooms", "columns", "stairs", "furniture", "roofs", "dimensions", "texts", "drawings", "underlays"]) assert.ok(LEVEL_COLLECTIONS.includes(k), k);
    assert.equal(LEVEL_COLLECTIONS.includes("openings"), false, "openings ride on their wall");
    assert.equal(LEVEL_COLLECTIONS[0], "walls");
    assert.deepEqual(COLLECTIONS, ["walls", "openings", ...LEVEL_COLLECTIONS.slice(1)]);
    assert.deepEqual(PHASES, ["existing", "new", "demolish"]);
    assert.equal(DEFAULTS.wallThickness, 200);
    assert.equal(DEFAULTS.wallHeight, 2800);
    assert.equal(DEFAULT_COSTS.currency, "KRW");
  });

  test("newLevel has an id, a name, an elevation, a height and a slab", () => {
    const l = newLevel("B1", -3000, 3200);
    assert.match(l.id, /^lv/);
    assert.equal(l.name, "B1");
    assert.equal(l.elevation, -3000);
    assert.equal(l.height, 3200);
    assert.equal(l.slab, DEFAULTS.slab);
    const d = newLevel();
    assert.equal(d.name, "1F");
    assert.equal(d.elevation, 0);
    assert.equal(d.height, DEFAULTS.wallHeight);
  });

  test("newProject has the expected shape", () => {
    const p = newProject("House");
    assert.equal(p.format, "myarch");
    assert.equal(p.version, 1);
    assert.equal(p.meta.title, "House");
    assert.equal(p.meta.scale, 100);
    assert.equal(p.meta.north, 0);
    assert.match(p.meta.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(p.levels.length, 1);
    assert.equal(p.levels[0].name, "1F");
    assert.equal(p.view.level, p.levels[0].id);
    assert.deepEqual(p.defaults, DEFAULTS);
    assert.notEqual(p.defaults, DEFAULTS, "defaults are a copy");
    assert.equal(p.wallTypes.length, DEFAULT_WALL_TYPES.length);
    assert.notEqual(p.wallTypes[0], DEFAULT_WALL_TYPES[0], "wall types are deep copies");
    assert.deepEqual(p.wallTypes, DEFAULT_WALL_TYPES);
    assert.deepEqual(p.costs, DEFAULT_COSTS);
    assert.deepEqual(p.grids, []);
    assert.deepEqual(p.models, []);
    assert.equal(p.layers.length, 1);
    for (const k of COLLECTIONS) assert.deepEqual(p[k], [], `${k} is empty`);
    assert.equal(newProject().meta.title, "Untitled");
  });

  test("two new projects do not share wall types or levels", () => {
    const a = newProject();
    const b = newProject();
    a.wallTypes[0].layers[0].thickness = 1;
    assert.notEqual(b.wallTypes[0].layers[0].thickness, 1);
    assert.notEqual(a.levels[0].id, b.levels[0].id);
  });

  test("the default wall types are as thick as their layers say", () => {
    const want = { "ext-brick-300": 300, "ext-render-250": 250, "ext-wood-200": 200, "int-block-150": 150, "int-drywall-100": 100, "concrete-200": 200 };
    for (const wt of DEFAULT_WALL_TYPES) assert.equal(wallTypeThickness(wt), want[wt.id], wt.id);
  });
});

describe("project.js — normalizeProject", () => {
  test("a missing or non-object input becomes a fresh project", () => {
    for (const bad of [null, undefined, 42, "text"]) {
      const p = normalizeProject(bad);
      assert.equal(p.format, "myarch");
      assert.equal(p.levels.length, 1);
      assert.equal(p.view.level, p.levels[0].id);
    }
  });

  test("an empty object gets every collection and default", () => {
    const p = normalizeProject({});
    assert.equal(p.format, "myarch");
    assert.equal(p.version, 1);
    assert.equal(p.levels.length, 1);
    for (const k of [...COLLECTIONS, "models", "grids"]) assert.ok(Array.isArray(p[k]), k);
    assert.equal(p.wallTypes.length, DEFAULT_WALL_TYPES.length);
    assert.deepEqual(p.costs, DEFAULT_COSTS);
    assert.deepEqual(p.defaults, DEFAULTS);
    assert.equal(p.meta.latitude, 37.57);
    assert.equal(p.layers[0].id, "0");
  });

  test("unknown fields on the project and on items survive", () => {
    const p = normalizeProject({ custom: { a: 1 }, walls: [{ id: "w1", x1: 0, y1: 0, x2: 1000, y2: 0, note: "keep me" }], meta: { title: "T", extra: 5 } });
    assert.deepEqual(p.custom, { a: 1 });
    assert.equal(p.walls[0].note, "keep me");
    assert.equal(p.meta.extra, 5);
    assert.equal(p.meta.title, "T");
    assert.equal(p.meta.scale, 100, "missing meta fields are filled");
  });

  test("defaults are merged over the built-in ones", () => {
    const p = normalizeProject({ defaults: { wallThickness: 250 } });
    assert.equal(p.defaults.wallThickness, 250);
    assert.equal(p.defaults.wallHeight, 2800);
  });

  test("levels are cleaned, clamped and sorted by elevation", () => {
    const p = normalizeProject({
      levels: [
        { id: "up", name: "2F", elevation: "3000", height: 50, slab: -5 },
        { id: "down", name: 1, elevation: 0, height: "abc" },
        { name: null, elevation: -2800 },
      ],
    });
    assert.deepEqual(p.levels.map((l) => l.elevation), [-2800, 0, 3000]);
    const up = levelById(p, "up");
    assert.equal(up.height, 100, "height is at least 100");
    assert.equal(up.slab, 0, "slab is not negative");
    assert.equal(up.elevation, 3000, "numeric strings become numbers");
    const down = levelById(p, "down");
    assert.equal(down.name, "1");
    assert.equal(down.height, DEFAULTS.wallHeight);
    assert.equal(down.slab, DEFAULTS.slab);
    assert.equal(p.levels[0].name, "", "a null name becomes an empty string");
    assert.match(p.levels[0].id, /^lv/, "a missing id is generated");
  });

  test("items on a missing level move to the first (lowest) level", () => {
    const p = normalizeProject({
      levels: [{ id: "b", elevation: 3000 }, { id: "a", elevation: 0 }],
      walls: [{ id: "w1", level: "gone", x1: 0, y1: 0, x2: 1, y2: 0 }, { id: "w2", level: "b", x1: 0, y1: 0, x2: 1, y2: 0 }],
      rooms: [{ id: "r1", level: "nope", pts: [[0, 0], [1000, 0], [1000, 1000]] }],
      furniture: [{ id: "f1", kind: "box", x: 0, y: 0 }],
      texts: [{ id: "t1", level: "zzz", x: 0, y: 0, text: "hi" }],
    });
    assert.equal(p.walls[0].level, "a");
    assert.equal(p.walls[1].level, "b", "items on an existing level stay");
    assert.equal(p.rooms[0].level, "a");
    assert.equal(p.furniture[0].level, "a");
    assert.equal(p.texts[0].level, "a");
    assert.equal(p.view.level, "a", "an unknown view level falls back to the first");
  });

  test("items without ids get ids from their collection letter", () => {
    const p = normalizeProject({ walls: [{ x1: 0, y1: 0, x2: 1000, y2: 0 }], stairs: [{ x: 0, y: 0 }], openings: [] });
    assert.match(p.walls[0].id, /^w/);
    assert.match(p.stairs[0].id, /^s/);
  });

  test("openings of missing walls are dropped and the rest are cleaned", () => {
    const p = normalizeProject({
      walls: [{ id: "w1", x1: 0, y1: 0, x2: 4000, y2: 0 }],
      openings: [
        { id: "o1", wall: "w1", kind: "window", at: "1500" },
        { id: "o2", wall: "missing", kind: "door", at: 500 },
        { id: "o3", wall: "w1", kind: "weird", width: 20, height: 5, sill: -10, at: 3000, hinge: "end", side: -1 },
        { id: "o4", wall: "w1", kind: "opening" },
      ],
    });
    assert.deepEqual(p.openings.map((o) => o.id), ["o1", "o3", "o4"]);
    const [win, door, gap] = p.openings;
    assert.equal(win.kind, "window");
    assert.equal(win.width, DEFAULTS.windowWidth);
    assert.equal(win.height, DEFAULTS.windowHeight);
    assert.equal(win.sill, DEFAULTS.windowSill);
    assert.equal(win.at, 1500);
    assert.equal(win.hinge, "start");
    assert.equal(win.side, 1);
    assert.equal(win.type, "casement");
    assert.equal(door.kind, "door", "an unknown kind becomes a door");
    assert.equal(door.width, 100, "width is at least 100");
    assert.equal(door.height, 100, "height is at least 100");
    assert.equal(door.sill, 0, "sill is not negative");
    assert.equal(door.hinge, "end");
    assert.equal(door.side, -1);
    assert.equal(door.type, "single");
    assert.equal(gap.kind, "opening");
    assert.equal(gap.width, DEFAULTS.doorWidth);
    assert.equal(gap.height, DEFAULTS.doorHeight);
    assert.equal(gap.sill, 0);
    assert.equal(gap.at, 0);
  });

  test("walls are clamped and get the default thickness", () => {
    const p = normalizeProject({
      defaults: { wallThickness: 180 },
      walls: [
        { id: "a", x1: "10", y1: null, x2: 1000, y2: "x" },
        { id: "b", x1: 0, y1: 0, x2: 1000, y2: 0, thickness: 3 },
        { id: "c", x1: 0, y1: 0, x2: 1000, y2: 0, thickness: 240, height: 0 },
        { id: "d", x1: 0, y1: 0, x2: 1000, y2: 0, height: 50 },
        { id: "e", x1: 0, y1: 0, x2: 1000, y2: 0, height: "3200" },
        { id: "f", x1: 0, y1: 0, x2: 1000, y2: 0, height: "" },
      ],
    });
    const [a, b, c, d, e, f] = p.walls;
    assert.equal(a.x1, 10);
    assert.equal(a.y1, 0);
    assert.equal(a.y2, 0);
    assert.equal(a.thickness, 180, "the project default thickness");
    assert.equal(a.height, null);
    assert.equal(b.thickness, 10, "thickness is at least 10");
    assert.equal(c.thickness, 240);
    assert.equal(c.height, null, "a zero height means the level height");
    assert.equal(d.height, 100, "a wall is at least 100 high");
    assert.equal(e.height, 3200);
    assert.equal(f.height, null);
  });

  test("typed walls take their thickness from the layers and unknown types are removed", () => {
    const p = normalizeProject({
      walls: [
        { id: "t1", x1: 0, y1: 0, x2: 1000, y2: 0, thickness: 120, type: "ext-brick-300" },
        { id: "t2", x1: 0, y1: 0, x2: 1000, y2: 0, thickness: 120, type: "no-such-type" },
        { id: "t3", x1: 0, y1: 0, x2: 1000, y2: 0, type: "mine" },
      ],
      wallTypes: [...DEFAULT_WALL_TYPES.map((w) => JSON.parse(JSON.stringify(w))), { id: "mine", layers: [{ material: "brick", thickness: 90 }, { thickness: 35 }] }],
    });
    const [t1, t2, t3] = p.walls;
    assert.equal(t1.thickness, 300);
    assert.equal(t1.type, "ext-brick-300");
    assert.equal(t2.thickness, 120);
    assert.equal("type" in t2, false);
    assert.equal(t3.thickness, 125);
    const mine = p.wallTypes.find((w) => w.id === "mine");
    assert.equal(mine.name, "mine", "a missing name falls back to the id");
    assert.deepEqual(mine.layers[1], { material: "concrete", thickness: 35, function: "structure" });
    assert.equal(mine.layers[0].function, "structure");
  });

  test("wall types are cleaned: empty layers become concrete 200, thin layers 1 mm", () => {
    const p = normalizeProject({ wallTypes: [{ name: "Empty" }, { id: "thin", layers: [{ material: "glass", thickness: 0 }] }] });
    assert.equal(p.wallTypes.length, 2);
    assert.match(p.wallTypes[0].id, /^wt/);
    assert.deepEqual(p.wallTypes[0].layers, [{ material: "concrete", thickness: 200, function: "structure" }]);
    assert.equal(p.wallTypes[1].layers[0].thickness, 1);
    assert.equal(p.wallTypes[1].layers[0].material, "glass");
  });

  test("phases default to new and keep valid values", () => {
    const p = normalizeProject({
      walls: [{ id: "a", x1: 0, y1: 0, x2: 1, y2: 0 }, { id: "b", x1: 0, y1: 0, x2: 1, y2: 0, phase: "existing" }, { id: "c", x1: 0, y1: 0, x2: 1, y2: 0, phase: "demolish" }, { id: "d", x1: 0, y1: 0, x2: 1, y2: 0, phase: "bogus" }],
      openings: [{ id: "o", wall: "a" }],
      furniture: [{ id: "f", kind: "box", x: 0, y: 0, props: "not an object" }],
    });
    assert.deepEqual(p.walls.map((w) => w.phase), ["new", "existing", "demolish", "new"]);
    assert.equal(p.openings[0].phase, "new");
    assert.equal(p.furniture[0].phase, "new");
    assert.deepEqual(p.furniture[0].props, {}, "non-object props are reset");
  });

  test("costs, grids and wall types get defaults", () => {
    const p = normalizeProject({ costs: { wall: 1, currency: "USD" }, grids: [{ x1: "100", y1: 0, x2: 100, y2: "y", label: 1 }, { id: "g2", x1: 0, y1: 0, x2: 0, y2: 1000 }] });
    assert.equal(p.costs.wall, 1);
    assert.equal(p.costs.currency, "USD");
    assert.equal(p.costs.door, DEFAULT_COSTS.door);
    assert.match(p.grids[0].id, /^g/);
    assert.equal(p.grids[0].x1, 100);
    assert.equal(p.grids[0].y2, 0);
    assert.equal(p.grids[0].label, "1");
    assert.equal(p.grids[1].label, "");
    assert.equal(p.grids[1].id, "g2");
  });

  test("rooms and roofs with fewer than three points are dropped; points are cleaned", () => {
    const p = normalizeProject({
      rooms: [{ id: "r1", pts: [[0, 0], [1, 0]] }, { id: "r2", pts: [[0, 0], ["1000", 0], [1000, 1000], "junk", [5]] }, { id: "r3" }],
      roofs: [{ id: "f1", pts: [[0, 0], [1, 0]] }, { id: "f2", pts: [[0, 0], [1000, 0], [1000, 1000]], kind: "dome", pitch: 99, overhang: -5, thickness: 1 }],
    });
    assert.deepEqual(p.rooms.map((r) => r.id), ["r2"]);
    assert.deepEqual(p.rooms[0].pts, [[0, 0], [1000, 0], [1000, 1000]]);
    assert.equal(p.rooms[0].name, "");
    assert.deepEqual(p.roofs.map((r) => r.id), ["f2"]);
    const roof = p.roofs[0];
    assert.equal(roof.kind, "gable", "an unknown roof kind becomes gable");
    assert.equal(roof.pitch, 75, "pitch is at most 75°");
    assert.equal(roof.overhang, 0);
    assert.equal(roof.thickness, 20);
    const flat = normalizeProject({ roofs: [{ pts: [[0, 0], [1, 0], [1, 1]], kind: "flat", pitch: -10 }] }).roofs[0];
    assert.equal(flat.kind, "flat");
    assert.equal(flat.pitch, 0);
    assert.equal(flat.overhang, 400);
    assert.equal(flat.thickness, 200);
  });

  test("furniture, stairs, columns and texts are clamped", () => {
    const p = normalizeProject({
      furniture: [{ id: "f", kind: "box", x: 0, y: 0, w: 1, d: "x", h: 0, rot: "45" }],
      stairs: [{ id: "s", x: 0, y: 0, width: 10, length: "5000", steps: 1.4 }, { id: "s2", x: 0, y: 0, steps: 12.6 }],
      columns: [{ id: "c", x: 0, y: 0, w: 5, shape: "hex" }, { id: "c2", x: 0, y: 0, shape: "round" }],
      texts: [{ id: "t", x: 0, y: 0, size: 1, text: null }],
    });
    const f = p.furniture[0];
    assert.equal(f.w, 10);
    assert.equal(f.d, 600);
    assert.equal(f.h, 1);
    assert.equal(f.rot, 45);
    assert.equal(f.elevation, 0);
    const [s, s2] = p.stairs;
    assert.equal(s.width, 300);
    assert.equal(s.length, 5000);
    assert.equal(s.steps, 2);
    assert.equal(s.rot, 0);
    assert.equal(s2.steps, 13);
    assert.equal(s2.width, DEFAULTS.stairWidth);
    assert.equal(s2.length, 3000);
    const [c, c2] = p.columns;
    assert.equal(c.w, 20);
    assert.equal(c.d, 20, "depth defaults to the width");
    assert.equal(c.shape, "rect");
    assert.equal(c2.shape, "round");
    assert.equal(c2.w, DEFAULTS.columnSize);
    const t = p.texts[0];
    assert.equal(t.size, 10);
    assert.equal(t.text, "");
    assert.equal(t.rot, 0);
  });

  test("mass-model solids are cleaned and clamped", () => {
    const p = normalizeProject({ solids: [{ id: "s1", pts: [[0, 0], ["1000", 0], [1000, 1000]], height: 0, taper: 3, z0: "x" }, { id: "s2", pts: [[0, 0]] }] });
    assert.deepEqual(p.solids.map((s) => s.id), ["s1"]);
    const s = p.solids[0];
    assert.deepEqual(s.pts, [[0, 0], [1000, 0], [1000, 1000]]);
    assert.equal(s.height, 1);
    assert.equal(s.taper, 1);
    assert.equal(s.z0, 0);
    assert.equal(s.material, "concrete");
    assert.equal(s.level, p.levels[0].id);
    assert.deepEqual(p.scenes, [], "scenes default to an empty list");
    assert.deepEqual(normalizeProject({ scenes: [{ id: "v1" }] }).scenes, [{ id: "v1" }]);
  });

  test("group, props and classification on elements survive normalization", () => {
    const p = normalizeProject({ walls: [{ id: "w", x1: 0, y1: 0, x2: 1, y2: 0, group: "g1", props: { fire: "EI60" }, classification: { system: "Uniclass", code: "Ss_25" } }] });
    assert.equal(p.walls[0].group, "g1");
    assert.deepEqual(p.walls[0].props, { fire: "EI60" });
    assert.deepEqual(p.walls[0].classification, { system: "Uniclass", code: "Ss_25" });
  });

  test("drawings on unknown layers create those layers", () => {
    const p = normalizeProject({ drawings: [{ id: "d1", pts: [[0, 0], [1, 1]], layer: "A-WALL" }, { id: "d2", pts: [] }] });
    assert.equal(p.drawings[0].layer, "A-WALL");
    assert.equal(p.drawings[1].layer, "0");
    assert.equal(p.drawings[1].kind, "polyline");
    assert.deepEqual(p.layers.map((l) => l.id), ["0", "A-WALL"]);
    assert.equal(p.layers[1].visible, true);
  });

  test("normalizeProject is idempotent", () => {
    const p = twoLevelProject();
    const once = JSON.parse(JSON.stringify(p));
    normalizeProject(p);
    assert.deepEqual(JSON.parse(JSON.stringify(p)), once);
  });
});

describe("project.js — parse and serialize", () => {
  test("parseProject rejects text that is not JSON", () => {
    assert.throws(() => parseProject("{not json"), SyntaxError);
    assert.throws(() => parseProject(""), SyntaxError);
  });

  test("parseProject rejects JSON that is not a project", () => {
    assert.throws(() => parseProject("null"), /not a project file/);
    assert.throws(() => parseProject("42"), /not a project file/);
    assert.throws(() => parseProject('{"format":"mycircuit","levels":[]}'), /unknown format "mycircuit"/);
    assert.throws(() => parseProject('{"title":"x"}'), /not a MyArchitecture project/);
  });

  test("parseProject accepts a file with only walls or only levels", () => {
    const a = parseProject('{"walls":[{"id":"w","x1":0,"y1":0,"x2":1000,"y2":0}]}');
    assert.equal(a.walls.length, 1);
    assert.equal(a.walls[0].level, a.levels[0].id);
    const b = parseProject('{"format":"myarch","levels":[{"id":"L","name":"G"}]}');
    assert.equal(b.levels[0].id, "L");
  });

  test("serialize → parse round-trips a project unchanged", () => {
    const p = twoLevelProject();
    p.openings.push({ id: "o1", wall: "w1", kind: "door", at: 1000, width: 900, height: 2100, sill: 0, hinge: "start", side: 1, type: "single", phase: "new" });
    p.rooms.push({ id: "r1", level: p.levels[0].id, name: "방", pts: [[0, 0], [5000, 0], [5000, 4000], [0, 4000]], phase: "new" });
    normalizeProject(p);
    const text = serializeProject(p);
    assert.equal(typeof text, "string");
    assert.ok(text.startsWith("{"));
    const back = parseProject(text);
    assert.deepEqual(back, JSON.parse(text));
    assert.deepEqual(JSON.parse(serializeProject(back)), JSON.parse(text));
    assert.equal(back.rooms[0].name, "방");
  });
});

describe("project.js — accessors", () => {
  test("levelById, levelIndex and levelAbove", () => {
    const p = twoLevelProject();
    const [l1, l2] = p.levels;
    assert.equal(levelById(p, l1.id), l1);
    assert.equal(levelById(p, "nope"), null);
    assert.equal(levelIndex(p, l2.id), 1);
    assert.equal(levelIndex(p, "nope"), -1);
    assert.equal(levelAbove(p, l1.id), l2);
    assert.equal(levelAbove(p, l2.id), null);
    assert.equal(levelAbove(p, "nope"), null);
  });

  test("onLevel, wallById, openingsOf, wallLength and levelOfItem", () => {
    const p = twoLevelProject();
    p.openings.push({ id: "o1", wall: "w3", kind: "window", at: 2000 });
    normalizeProject(p);
    assert.deepEqual(onLevel(p.walls, p.levels[0].id).map((w) => w.id), ["w1", "w2"]);
    assert.equal(wallById(p, "w2").y1, 4000);
    assert.equal(wallById(p, "zz"), null);
    assert.deepEqual(openingsOf(p, "w3").map((o) => o.id), ["o1"]);
    assert.deepEqual(openingsOf(p, "w1"), []);
    assert.equal(wallLength({ x1: 0, y1: 0, x2: 3000, y2: 4000 }), 5000);
    assert.equal(levelOfItem(p, "openings", p.openings[0]), p.levels[1].id);
    assert.equal(levelOfItem(p, "openings", { wall: "nope" }), null);
    assert.equal(levelOfItem(p, "walls", p.walls[0]), p.levels[0].id);
  });

  test("findItem finds items of every collection, including grids", () => {
    const p = twoLevelProject();
    p.openings.push({ id: "o1", wall: "w1", kind: "door", at: 1000 });
    p.grids.push({ id: "g1", x1: 0, y1: 0, x2: 0, y2: 1000, label: "1" });
    p.furniture.push({ id: "f1", level: p.levels[0].id, kind: "box", x: 0, y: 0 });
    normalizeProject(p);
    assert.equal(findItem(p, "w2").kind, "walls");
    assert.equal(findItem(p, "w2").obj, p.walls[1]);
    assert.equal(findItem(p, "o1").kind, "openings");
    assert.equal(findItem(p, "f1").kind, "furniture");
    assert.deepEqual(findItem(p, "g1"), { kind: "grids", obj: p.grids[0] });
    assert.equal(findItem(p, "missing"), null);
    assert.equal(findItem({ ...p, grids: undefined }, "missing"), null, "a project without grids still works");
  });

  test("wallHeight uses the wall's own height, else its level's", () => {
    const p = twoLevelProject();
    assert.equal(wallHeight(p, p.walls[0]), 2800);
    assert.equal(wallHeight(p, p.walls[2]), 2400);
    p.levels[0].height = 3100;
    assert.equal(wallHeight(p, p.walls[0]), 3100);
    assert.equal(wallHeight(p, { level: "nowhere", height: null }), DEFAULTS.wallHeight);
  });

  test("wallTypeThickness and wallTypeOf", () => {
    const p = normalizeProject({ walls: [{ id: "a", x1: 0, y1: 0, x2: 1, y2: 0, type: "int-block-150" }, { id: "b", x1: 0, y1: 0, x2: 1, y2: 0 }] });
    assert.equal(wallTypeThickness({ layers: [{ thickness: 10 }, { thickness: 15.5 }] }), 25.5);
    assert.equal(wallTypeThickness({ layers: [] }), 0);
    assert.equal(wallTypeOf(p, p.walls[0]).id, "int-block-150");
    assert.equal(wallTypeOf(p, p.walls[1]), null);
    assert.equal(wallTypeOf(p, { type: "gone" }), null);
    assert.equal(wallTypeOf({}, { type: "int-block-150" }), null, "a project without wall types");
  });

  test("openingTags number doors and windows in plan order per level", () => {
    const p = twoLevelProject();
    const [l1, l2] = p.levels;
    p.walls.push({ id: "w4", level: l1.id, x1: 0, y1: 0, x2: 0, y2: 4000, thickness: 200 });
    normalizeProject(p);
    p.openings.push(
      { id: "dUpper", wall: "w3", kind: "door", at: 500 }, // level 2
      { id: "dBottomRight", wall: "w2", kind: "door", at: 4000 }, // y 4000, x 4000
      { id: "dTopRight", wall: "w1", kind: "door", at: 3000 }, // y 0, x 3000
      { id: "dTopLeft", wall: "w1", kind: "door", at: 1000 }, // y 0, x 1000
      { id: "dBottomLeft", wall: "w2", kind: "door", at: 1000 }, // y 4000, x 1000
      { id: "wSide", wall: "w4", kind: "window", at: 2000 }, // y 2000
      { id: "wTop", wall: "w1", kind: "window", at: 2000 }, // y 0
      { id: "gap", wall: "w1", kind: "opening", at: 4500 },
    );
    normalizeProject(p);
    void l2;
    const tags = openingTags(p);
    assert.equal(tags.get("dTopLeft"), "D01");
    assert.equal(tags.get("dTopRight"), "D02");
    assert.equal(tags.get("dBottomLeft"), "D03");
    assert.equal(tags.get("dBottomRight"), "D04");
    assert.equal(tags.get("dUpper"), "D05", "upper level after the lower one");
    assert.equal(tags.get("wTop"), "W01");
    assert.equal(tags.get("wSide"), "W02");
    assert.equal(tags.get("gap"), "O01");
    assert.equal(tags.size, 8);
  });

  test("openingTags keeps a tag the user typed", () => {
    const p = twoLevelProject();
    p.openings.push({ id: "a", wall: "w1", kind: "door", at: 1000, tag: "ENTRY" }, { id: "b", wall: "w1", kind: "door", at: 3000 });
    normalizeProject(p);
    const tags = openingTags(p);
    assert.equal(tags.get("a"), "ENTRY");
    assert.equal(tags.get("b"), "D02");
  });
});

// ================================================================ store.js
describe("store.js — undo and redo", () => {
  const addWall = (id) => (p) => { p.walls.push({ id, level: p.levels[0].id, x1: 0, y1: 0, x2: 1000, y2: 0, thickness: 200 }); };

  test("a new store holds a normalized empty project and no history", () => {
    const s = new Store();
    assert.equal(s.project.format, "myarch");
    assert.equal(s.canUndo(), false);
    assert.equal(s.canRedo(), false);
    assert.equal(s.dirty, false);
    assert.equal(s.revision, 0);
    assert.deepEqual(s.history(), { undo: [], redo: [] });
    assert.equal(s.undo(), null);
    assert.equal(s.redo(), null);
  });

  test("edit records a step that undo and redo replay", () => {
    const s = new Store();
    const ret = s.edit("Add wall", (p) => { addWall("w1")(p); return "done"; });
    assert.equal(ret, "done", "edit returns the function's result");
    assert.equal(s.project.walls.length, 1);
    assert.equal(s.canUndo(), true);
    assert.equal(s.undo(), "Add wall");
    assert.equal(s.project.walls.length, 0);
    assert.equal(s.canRedo(), true);
    assert.equal(s.redo(), "Add wall");
    assert.equal(s.project.walls.length, 1);
    assert.equal(s.project.walls[0].id, "w1");
  });

  test("history lists undo labels oldest first and redo labels next first", () => {
    const s = new Store();
    s.edit("one", addWall("a"));
    s.edit("two", addWall("b"));
    s.edit("three", addWall("c"));
    assert.deepEqual(s.history(), { undo: ["one", "two", "three"], redo: [] });
    s.undo();
    s.undo();
    assert.deepEqual(s.history(), { undo: ["one"], redo: ["two", "three"] });
    assert.deepEqual(s.project.walls.map((w) => w.id), ["a"]);
  });

  test("a new edit clears the redo stack", () => {
    const s = new Store();
    s.edit("one", addWall("a"));
    s.undo();
    assert.equal(s.canRedo(), true);
    s.edit("two", addWall("b"));
    assert.equal(s.canRedo(), false);
    assert.deepEqual(s.history().undo, ["two"]);
  });

  test("an edit function returning false vetoes the step", () => {
    const s = new Store();
    let changes = 0;
    s.on("change", () => changes++);
    const r = s.edit("nothing", () => false);
    assert.equal(r, false);
    assert.equal(s.canUndo(), false);
    assert.equal(s.dirty, false);
    assert.equal(s.revision, 0);
    assert.equal(changes, 0);
  });

  test("an edit returning undefined still counts", () => {
    const s = new Store();
    s.edit("noop", () => undefined);
    assert.equal(s.canUndo(), true);
  });

  test("begin and commit make one drag one undo step", () => {
    const s = new Store();
    s.begin("Drag");
    s.project.walls.push({ id: "w", level: s.project.levels[0].id, x1: 0, y1: 0, x2: 1000, y2: 0, thickness: 200 });
    s.preview();
    s.project.walls[0].x2 = 2000;
    s.preview();
    s.project.walls[0].x2 = 3000;
    s.commit();
    assert.deepEqual(s.history().undo, ["Drag"]);
    assert.equal(s.project.walls[0].x2, 3000);
    s.undo();
    assert.equal(s.project.walls.length, 0);
  });

  test("begin twice keeps the first snapshot and label", () => {
    const s = new Store();
    s.begin("First");
    addWall("a")(s.project);
    s.begin("Second");
    addWall("b")(s.project);
    s.commit();
    assert.deepEqual(s.history().undo, ["First"]);
    s.undo();
    assert.equal(s.project.walls.length, 0);
  });

  test("edits during a pending drag fold into the drag step", () => {
    const s = new Store();
    s.begin("Drag");
    s.edit("inner", addWall("a"));
    assert.equal(s.canUndo(), false, "nothing is recorded while pending");
    s.commit();
    assert.deepEqual(s.history().undo, ["Drag"]);
  });

  test("commit without a change records nothing", () => {
    const s = new Store();
    s.begin("Drag");
    s.commit();
    assert.equal(s.canUndo(), false);
    s.begin("Drag");
    addWall("a")(s.project);
    s.commit({ changed: false });
    assert.equal(s.canUndo(), false, "changed: false skips the step");
    s.commit();
    assert.equal(s.canUndo(), false, "commit without begin does nothing");
  });

  test("cancel restores the snapshot taken by begin", () => {
    const s = new Store();
    s.edit("one", addWall("a"));
    const events = [];
    s.on("change", (e) => events.push(e.label));
    s.begin("Drag");
    s.project.walls[0].x2 = 9999;
    addWall("b")(s.project);
    s.cancel();
    assert.equal(s.project.walls.length, 1);
    assert.equal(s.project.walls[0].x2, 1000);
    assert.equal(s.pending, null);
    assert.deepEqual(events, ["cancel"]);
    assert.deepEqual(s.history().undo, ["one"]);
    s.cancel(); // no-op
    assert.deepEqual(events, ["cancel"]);
  });

  test("3D model assets are kept out of the undo snapshots", () => {
    const s = new Store();
    const asset = { id: "m1", name: "chair", data: "QUJD".repeat(1000) };
    s.project.models.push(asset);
    s.edit("Add wall", addWall("a"));
    assert.equal(s.undoStack[0].json.includes("QUJD"), false, "the snapshot has no model data");
    assert.equal(s.snapshot().includes("models"), false);
    s.undo();
    assert.equal(s.project.models.length, 1, "undo keeps the current assets");
    assert.equal(s.project.models[0], asset);
    s.project.models.push({ id: "m2" });
    s.redo();
    assert.deepEqual(s.project.models.map((m) => m.id), ["m1", "m2"], "redo keeps the current assets too");
    assert.equal(s.project.walls.length, 1);
  });

  test("revision counts every change, preview and load", () => {
    const s = new Store();
    s.edit("a", addWall("a"));
    assert.equal(s.revision, 1);
    s.preview();
    assert.equal(s.revision, 2);
    s.undo();
    assert.equal(s.revision, 3);
    s.redo();
    assert.equal(s.revision, 4);
    s.load(newProject());
    assert.equal(s.revision, 5);
  });

  test("dirty is set by edits and undo and cleared by markSaved", () => {
    const s = new Store();
    let saved = 0;
    s.on("saved", () => saved++);
    s.edit("a", addWall("a"));
    assert.equal(s.dirty, true);
    s.markSaved({ fileName: "house.myarch", filePath: "C:/x/house.myarch" });
    assert.equal(s.dirty, false);
    assert.equal(s.fileName, "house.myarch");
    assert.equal(s.filePath, "C:/x/house.myarch");
    assert.equal(saved, 1);
    s.undo();
    assert.equal(s.dirty, true);
    s.markSaved();
    assert.equal(s.fileName, "house.myarch", "a missing file name keeps the old one");
    assert.equal(s.filePath, "C:/x/house.myarch");
    s.markSaved({ filePath: null });
    assert.equal(s.filePath, null, "filePath can be cleared explicitly");
  });

  test("load replaces the project and clears history and dirty", () => {
    const s = new Store();
    const events = [];
    s.on("load", () => events.push("load"));
    s.on("change", (e) => events.push(e.label));
    s.edit("a", addWall("a"));
    s.load({ walls: [{ id: "x", x1: 0, y1: 0, x2: 1, y2: 0 }] }, { fileName: "f.myarch", filePath: "/f.myarch" });
    assert.equal(s.project.walls[0].id, "x");
    assert.equal(s.project.format, "myarch", "loaded projects are normalized");
    assert.equal(s.canUndo(), false);
    assert.equal(s.dirty, false);
    assert.equal(s.fileName, "f.myarch");
    assert.equal(s.filePath, "/f.myarch");
    assert.deepEqual(events, ["a", "load", "load"]);
  });

  test("listeners can unsubscribe and a throwing listener does not stop the others", () => {
    const s = new Store();
    const seen = [];
    const off = s.on("change", () => seen.push("first"));
    s.on("change", () => { throw new Error("boom"); });
    s.on("change", () => seen.push("third"));
    const orig = console.error;
    const logged = [];
    console.error = (e) => logged.push(e);
    try {
      s.edit("a", addWall("a"));
      off();
      s.edit("b", addWall("b"));
    } finally {
      console.error = orig;
    }
    assert.deepEqual(seen, ["first", "third", "third"]);
    assert.equal(logged.length, 2);
  });

  test("the undo history is capped at 200 steps", () => {
    const s = new Store();
    for (let i = 0; i < 205; i++) s.edit(`step ${i}`, (p) => { p.meta.title = `t${i}`; });
    assert.equal(s.undoStack.length, 200);
    assert.equal(s.history().undo[0], "step 5", "the oldest steps are dropped");
    assert.equal(s.history().undo[199], "step 204");
    let n = 0;
    while (s.undo()) n++;
    assert.equal(n, 200);
    assert.equal(s.project.meta.title, "t4", "undo stops at the oldest kept snapshot");
  });

  test("serialize writes the current project", () => {
    const s = new Store();
    s.edit("a", addWall("a"));
    const back = JSON.parse(s.serialize());
    assert.equal(back.walls[0].id, "a");
  });
});

// ================================================================ themes.js
describe("themes.js", () => {
  test("there are 40 themes, 20 dark and 20 light, with unique ids and valid colours", () => {
    assert.equal(THEMES.length, 40);
    assert.equal(THEMES.filter((t) => t.mode === "dark").length, 20);
    assert.equal(THEMES.filter((t) => t.mode === "light").length, 20);
    assert.equal(new Set(THEMES.map((t) => t.id)).size, 40);
    for (const t of THEMES) {
      for (const k of ["bg", "panel", "text", "accent"]) assert.match(t[k], HEX, `${t.id}.${k}`);
      for (const k of ["sch", "pcb"]) if (t[k] !== undefined) assert.match(t[k], HEX, `${t.id}.${k}`);
      assert.ok(t.name.ko && t.name.en, `${t.id} has names`);
    }
  });

  test("the default dark and light themes exist", () => {
    assert.equal(themeById("dark").id, DEFAULT_THEME.dark);
    assert.equal(themeById("light").id, DEFAULT_THEME.light);
    assert.equal(themeById("dark").mode, "dark");
    assert.equal(themeById("light").mode, "light");
    assert.equal(themeById("nord").name.en, "Nord");
    assert.equal(themeById("no-such-theme"), null);
  });

  test("contrast and mix follow the WCAG and linear-blend formulas", () => {
    near(contrast("#000000", "#ffffff"), 21, 1e-9);
    near(contrast("#ffffff", "#000000"), 21, 1e-9);
    near(contrast("#777777", "#777777"), 1, 1e-9);
    near(contrast("#fff", "#000"), 21, 1e-9, "three-digit colours");
    assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
    assert.equal(mix("#102030", "#102030", 0.3), "#102030");
    assert.equal(mix("#ff0000", "#0000ff", 0), "#ff0000");
    assert.equal(mix("#ff0000", "#0000ff", 1), "#0000ff");
  });

  for (const th of THEMES) {
    test(`theme ${th.id}: body text is readable on the background (contrast ≥ 4.5)`, () => {
      assert.ok(contrast(th.text, th.bg) >= 4.5, `${th.id}: ${contrast(th.text, th.bg).toFixed(2)}`);
      assert.ok(contrast(th.text, th.panel) >= 4.5, `${th.id} panel: ${contrast(th.text, th.panel).toFixed(2)}`);
    });
  }

  test("uiTokens has every token for every theme", () => {
    const keys = ["--bg", "--panel", "--panel2", "--panel3", "--line", "--line2", "--text", "--muted", "--faint", "--accent", "--accent-text", "--accent-soft", "--hover", "--press", "--input", "--shadow"];
    for (const th of THEMES) {
      const tk = uiTokens(th);
      assert.deepEqual(Object.keys(tk).sort(), [...keys].sort(), th.id);
      for (const k of ["--bg", "--panel", "--panel2", "--panel3", "--line", "--line2", "--text", "--muted", "--faint", "--accent", "--input"]) assert.match(tk[k], HEX, `${th.id} ${k}`);
      assert.match(tk["--accent-soft"], /^rgba\(\d+,\d+,\d+,0\.1[26]\)$/);
      assert.ok(["#ffffff", "#111111"].includes(tk["--accent-text"]));
      assert.equal(tk["--bg"], th.bg);
      assert.equal(tk["--text"], th.text);
      assert.ok(contrast(tk["--muted"], th.bg) > 1.5, `${th.id}: muted text stays visible`);
    }
  });

  test("uiTokens picks white accent text on dark accents and dark text on light accents", () => {
    assert.equal(uiTokens({ mode: "dark", bg: "#000000", panel: "#111111", text: "#ffffff", accent: "#1d4ed8" })["--accent-text"], "#ffffff");
    assert.equal(uiTokens({ mode: "dark", bg: "#000000", panel: "#111111", text: "#ffffff", accent: "#ffd400" })["--accent-text"], "#111111");
  });

  test("canvasColors gives a plan palette for every theme", () => {
    for (const th of THEMES) {
      const { plan } = canvasColors(th);
      for (const k of ["bg", "grid", "gridMajor", "select", "hover", "furnitureFill", "ruler", "text", "roomLabel", "ghost"]) assert.match(plan[k], HEX, `${th.id} plan.${k}`);
      assert.equal(plan.select, th.accent);
      assert.equal(plan.text, th.text);
      if (th.sch) assert.equal(plan.bg, th.sch, `${th.id} uses its canvas colour`);
      assert.ok(contrast(plan.text, plan.bg) >= 4.5, `${th.id}: plan labels readable`);
    }
  });

  test("randomTheme never returns the current theme", () => {
    for (const th of THEMES) {
      for (const r of [0, 0.25, 0.5, 0.75, 0.9999]) {
        const next = randomTheme(th.id, () => r);
        assert.notEqual(next.id, th.id);
      }
    }
    assert.ok(randomTheme("midnight").id !== "midnight");
  });

  test("custom themes are registered, looked up and reset", () => {
    try {
      setCustomThemes([
        { id: "mine", name: "Mine", bg: "#101010", panel: "#202020", text: "#f0f0f0", accent: "#ff8800" },
        { id: "mine-light", name: { ko: "내 테마", en: "My light" }, mode: "light", bg: "#fafafa", panel: "#ffffff", text: "#111111", accent: "#0055aa" },
        { id: "broken", bg: "#000000" },
        null,
      ]);
      const list = customThemes();
      assert.equal(list.length, 2, "incomplete themes are skipped");
      assert.deepEqual(list[0].name, { ko: "Mine", en: "Mine" });
      assert.equal(list[0].mode, "dark", "mode defaults to dark");
      assert.equal(list[0].custom, true);
      assert.equal(list[1].mode, "light");
      assert.equal(allThemes().length, 42);
      assert.equal(themeById("mine").accent, "#ff8800");
      assert.equal(themeById("broken"), null);
      list.pop();
      assert.equal(customThemes().length, 2, "customThemes returns a copy");
      // Only the custom theme left besides the current one when the pool is the whole list.
      const pick = randomTheme("midnight", () => 0.99999);
      assert.equal(pick.id, "mine-light");
    } finally {
      setCustomThemes([]);
    }
    assert.equal(allThemes().length, 40);
    assert.equal(themeById("mine"), null);
  });
});

// ================================================================ sun.js
describe("sun.js", () => {
  const SEOUL = [37.57, 126.98];
  // Scan a day for the highest sun: → {altitude, azimuth, hour}.
  const solarNoon = (lat, lon, y, m, d, tz = 9) => {
    let best = null;
    for (let min = 9 * 60; min <= 15 * 60; min++) {
      const s = sunPosition(lat, lon, new Date(y, m, d, 0, min), tz);
      if (!best || s.altitude > best.altitude) best = { ...s, hour: min / 60 };
    }
    return best;
  };

  test("Seoul at the summer solstice: noon altitude ≈ 75.9°", () => {
    const n = solarNoon(...SEOUL, 2026, 5, 21);
    near(n.altitude, 90 - 37.57 + 23.44, 0.5);
    near(n.declination, 23.44, 0.3);
  });

  test("Seoul at the winter solstice: noon altitude ≈ 29°", () => {
    const n = solarNoon(...SEOUL, 2026, 11, 21);
    near(n.altitude, 90 - 37.57 - 23.44, 0.5);
    near(n.declination, -23.44, 0.3);
  });

  test("solar noon in Seoul is about half an hour after 12:00 and the sun is due south", () => {
    for (const [m, d] of [[2, 20], [5, 21], [8, 22], [11, 21]]) {
      const n = solarNoon(...SEOUL, 2026, m, d);
      assert.ok(n.hour > 12.1 && n.hour < 12.9, `solar noon at ${n.hour}`);
      near(n.azimuth, 180, 1.5, `azimuth at solar noon (month ${m + 1})`);
    }
  });

  test("the equinox noon altitude is the co-latitude", () => {
    const n = solarNoon(...SEOUL, 2026, 2, 20);
    near(n.altitude, 90 - 37.57, 1);
  });

  test("the morning sun is in the east and the afternoon sun in the west", () => {
    const am = sunPosition(...SEOUL, new Date(2026, 5, 21, 8, 0), 9);
    const pm = sunPosition(...SEOUL, new Date(2026, 5, 21, 17, 0), 9);
    assert.ok(am.azimuth > 45 && am.azimuth < 135, `morning azimuth ${am.azimuth}`);
    assert.ok(pm.azimuth > 225 && pm.azimuth < 315, `afternoon azimuth ${pm.azimuth}`);
    assert.ok(am.altitude > 0 && pm.altitude > 0);
  });

  test("the sun is below the horizon at midnight and azimuths stay in 0…360", () => {
    const night = sunPosition(...SEOUL, new Date(2026, 5, 21, 0, 30), 9);
    assert.ok(night.altitude < 0);
    for (let h = 0; h < 24; h++) {
      const s = sunPosition(...SEOUL, new Date(2026, 2, 1, h, 15), 9);
      assert.ok(s.azimuth >= 0 && s.azimuth < 360, `azimuth ${s.azimuth} at ${h}h`);
      assert.ok(s.altitude >= -90 && s.altitude <= 90);
    }
  });

  test("sunPosition accepts a timestamp as well as a Date", () => {
    const d = new Date(2026, 5, 21, 10, 0);
    assert.deepEqual(sunPosition(...SEOUL, d.getTime()), sunPosition(...SEOUL, d));
    assert.deepEqual(sunPosition(...SEOUL, d), sunPosition(...SEOUL, d, 9), "the time zone defaults to 9 h");
  });

  test("daylight in Seoul: long days in June, short days in December", () => {
    const summer = daylight(...SEOUL, new Date(2026, 5, 21), 9);
    const winter = daylight(...SEOUL, new Date(2026, 11, 21), 9);
    assert.ok(summer.sunrise > 4.9 && summer.sunrise < 5.5, `summer sunrise ${summer.sunrise}`);
    assert.ok(summer.sunset > 19.6 && summer.sunset < 20.2, `summer sunset ${summer.sunset}`);
    assert.ok(winter.sunrise > 7.4 && winter.sunrise < 8.0, `winter sunrise ${winter.sunrise}`);
    assert.ok(winter.sunset > 17.0 && winter.sunset < 17.6, `winter sunset ${winter.sunset}`);
    near(summer.sunset - summer.sunrise, 14.75, 0.4, "summer day length");
    near(winter.sunset - winter.sunrise, 9.6, 0.4, "winter day length");
  });

  test("daylight near the pole: midnight sun in June and polar night in December", () => {
    assert.deepEqual(daylight(80, 0, new Date(2026, 5, 21), 0), { sunrise: null, sunset: null });
    assert.deepEqual(daylight(80, 0, new Date(2026, 11, 21), 0), { sunrise: null, sunset: null });
    assert.ok(sunPosition(80, 0, new Date(2026, 5, 21, 0, 0), 0).altitude > 0, "the June sun stays up");
    assert.ok(sunPosition(80, 0, new Date(2026, 11, 21, 12, 0), 0).altitude < 0, "the December sun stays down");
  });

  test("the southern hemisphere mirrors the northern one", () => {
    const north = solarNoon(37.57, 126.98, 2026, 5, 21);
    const south = solarNoon(-37.57, 126.98, 2026, 11, 21);
    near(south.altitude, north.altitude, 0.6);
    assert.ok(south.azimuth < 2 || south.azimuth > 358, `southern noon sun is due north (${south.azimuth})`);
    const sDay = daylight(-37.57, 126.98, new Date(2026, 11, 21), 9);
    const nDay = daylight(37.57, 126.98, new Date(2026, 5, 21), 9);
    near(sDay.sunset - sDay.sunrise, nDay.sunset - nDay.sunrise, 0.3, "same day length");
    const winterSouth = solarNoon(-37.57, 126.98, 2026, 5, 21);
    near(winterSouth.altitude, 90 - 37.57 - 23.44, 0.6);
  });
});
