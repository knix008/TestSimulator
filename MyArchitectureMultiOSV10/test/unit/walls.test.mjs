// Unit tests for wall geometry (src/core/walls.js): joins and outlines,
// the wall frame, openings along a wall, splitting and merging.
// Run: node --test test/unit/walls.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  wallFrame, wallUV, wallPoint, wallOutlines, openingSpans, slicePoly, wallPieces, wallAt, fitOpening, wallSnapPoints,
  endsAt, splitWall, mergeCollinear,
} from "../../src/core/walls.js";
import { newProject, normalizeProject, wallLength } from "../../src/core/project.js";
import { polygonArea, pointInPolygon, dist } from "../../src/core/geom.js";

// ---------------------------------------------------------------- helpers

const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a} (tol ${tol})`);
const nearPt = (p, q, tol = 1e-6, msg = "") => { near(p[0], q[0], tol, `${msg} x`); near(p[1], q[1], tol, `${msg} y`); };
const nearPoly = (ps, qs, tol = 1e-6, msg = "") => {
  assert.equal(ps.length, qs.length, `${msg} point count`);
  ps.forEach((p, i) => nearPt(p, qs[i], tol, `${msg} #${i}`));
};
const area = (pts) => Math.abs(polygonArea(pts));

let n = 0;
const W = (x1, y1, x2, y2, thickness = 200, extra = {}) => ({ id: extra.id || `w${++n}`, level: "L", x1, y1, x2, y2, thickness, height: null, ...extra });

// A project with the given walls and openings on one level "L".
function project(walls, openings = []) {
  const p = newProject();
  p.levels[0].id = "L";
  p.view.level = "L";
  p.walls = walls;
  p.openings = openings;
  return normalizeProject(p);
}
const door = (wall, at, width = 900, extra = {}) => ({ id: extra.id || `o${++n}`, wall: wall.id, kind: "door", at, width, height: 2100, sill: 0, ...extra });

// ================================================================ frame
describe("wall frame", () => {
  test("wallFrame gives the length, the unit direction and the left normal", () => {
    const f = wallFrame(W(100, 200, 100 + 3000, 200 + 4000));
    near(f.len, 5000);
    nearPt(f.d, [0.6, 0.8]);
    nearPt(f.n, [-0.8, 0.6]);
    assert.deepEqual(f.o, [100, 200]);
  });

  test("wallFrame of a zero-length wall does not divide by zero", () => {
    const f = wallFrame(W(5, 5, 5, 5));
    assert.equal(f.len, 1);
    assert.deepEqual(f.d, [0, 0]);
  });

  test("wallUV measures along the wall and to its left", () => {
    const w = W(0, 0, 4000, 0);
    assert.deepEqual(wallUV(w, 1000, 0), { u: 1000, v: 0 });
    assert.deepEqual(wallUV(w, 1000, 300), { u: 1000, v: 300 });
    assert.deepEqual(wallUV(w, -500, -100), { u: -500, v: -100 });
  });

  test("wallPoint and wallUV round-trip on a slanted wall", () => {
    const w = W(-700, 300, 2100, -1900);
    for (const [u, v] of [[0, 0], [1000, 0], [1500, 120], [3000, -250], [-200, 50]]) {
      const [x, y] = wallPoint(w, u, v);
      const back = wallUV(w, x, y);
      near(back.u, u, 1e-9);
      near(back.v, v, 1e-9);
    }
    nearPt(wallPoint(w, 0), [-700, 300]);
    nearPt(wallPoint(w, wallLength(w)), [2100, -1900], 1e-9);
  });

  test("wallSnapPoints lists both ends and the middle of every wall", () => {
    const a = W(0, 0, 4000, 0, 200, { id: "a" });
    const b = W(0, 0, 0, 3000, 200, { id: "b" });
    const pts = wallSnapPoints([a, b]);
    assert.equal(pts.length, 6);
    assert.deepEqual(pts.filter((p) => p.kind === "mid").map((p) => [p.x, p.y, p.id]), [[2000, 0, "a"], [0, 1500, "b"]]);
    assert.equal(pts.filter((p) => p.kind === "end").length, 4);
  });
});

// ================================================================ outlines
describe("wallOutlines — joins", () => {
  test("a free wall is a rectangle with square ends", () => {
    const w = W(0, 0, 4000, 0);
    const o = wallOutlines([w]).get(w.id);
    nearPoly(o.poly, [[0, 100], [4000, 100], [4000, -100], [0, -100]]);
    assert.deepEqual(o.tee, [false, false]);
    near(area(o.poly), 4000 * 200);
  });

  test("a slanted free wall keeps its thickness", () => {
    const w = W(0, 0, 3000, 4000, 300);
    const o = wallOutlines([w]).get(w.id);
    near(area(o.poly), 5000 * 300, 1e-6);
    nearPt(o.poly[0], [-120, 90], 1e-9, "start left = start + n·150");
  });

  test("an L corner is mitred to the exact outer and inner corners", () => {
    const a = W(0, 0, 4000, 0);
    const b = W(4000, 0, 4000, 3000);
    const out = wallOutlines([a, b]);
    nearPoly(out.get(a.id).poly, [[0, 100], [3900, 100], [4100, -100], [0, -100]]);
    nearPoly(out.get(b.id).poly, [[3900, 100], [3900, 3000], [4100, 3000], [4100, -100]]);
    assert.deepEqual(out.get(a.id).tee, [false, false]);
    // No gap and no overlap: the two outlines tile the L.
    near(area(out.get(a.id).poly) + area(out.get(b.id).poly), 4100 * 200 + 2900 * 200, 1e-6);
  });

  test("the mitre does not depend on the drawing direction of the walls", () => {
    const a = W(4000, 0, 0, 0); // reversed
    const b = W(4000, 3000, 4000, 0); // reversed
    const out = wallOutlines([a, b]);
    const pa = out.get(a.id).poly;
    const pb = out.get(b.id).poly;
    for (const q of [[3900, 100], [4100, -100]]) {
      assert.ok(pa.some((p) => dist(...p, ...q) < 1e-6), `wall a has corner ${q}`);
      assert.ok(pb.some((p) => dist(...p, ...q) < 1e-6), `wall b has corner ${q}`);
    }
  });

  test("a T junction is trimmed to the face of the through wall (3D, draw: false)", () => {
    const main = W(0, 0, 6000, 0);
    const stem = W(3000, 0, 3000, 3000, 100);
    const out = wallOutlines([main, stem]);
    nearPoly(out.get(stem.id).poly, [[2950, 100], [2950, 3000], [3050, 3000], [3050, 100]]);
    assert.deepEqual(out.get(stem.id).tee, [true, false]);
    nearPoly(out.get(main.id).poly, [[0, 100], [6000, 100], [6000, -100], [0, -100]], 1e-6, "the through wall is not cut");
    assert.deepEqual(out.get(main.id).tee, [false, false]);
  });

  test("a T junction reaches the centre line of the through wall (plan, draw: true)", () => {
    const main = W(0, 0, 6000, 0);
    const stem = W(3000, 0, 3000, 3000, 100);
    const out = wallOutlines([main, stem], { draw: true });
    nearPoly(out.get(stem.id).poly, [[2950, 0], [2950, 3000], [3050, 3000], [3050, 0]]);
    assert.deepEqual(out.get(stem.id).tee, [true, false]);
  });

  test("a T at the end of the stem is trimmed too", () => {
    const main = W(0, 3000, 6000, 3000);
    const stem = W(2000, 0, 2000, 3000);
    const out = wallOutlines([main, stem]);
    assert.deepEqual(out.get(stem.id).tee, [false, true]);
    const ys = out.get(stem.id).poly.map((p) => p[1]);
    near(Math.max(...ys), 2900, 1e-6, "the stem stops at the near face");
  });

  test("a T from a slanted through wall ends on that wall's face", () => {
    const main = W(0, 0, 6000, 6000); // 45°
    const stem = W(3000, 3000, 3000, 6000);
    const out = wallOutlines([main, stem]);
    const poly = out.get(stem.id).poly;
    // The two start corners lie on the main wall's face (offset 100 from its centre line).
    for (const p of [poly[0], poly[3]]) {
      const d = Math.abs(p[0] - p[1]) / Math.SQRT2;
      near(d, 100, 1e-6, "distance from the centre line");
    }
  });

  test("two walls crossing in the middle stay full rectangles", () => {
    const a = W(0, 2000, 4000, 2000);
    const b = W(2000, 0, 2000, 4000);
    const out = wallOutlines([a, b]);
    nearPoly(out.get(a.id).poly, [[0, 2100], [4000, 2100], [4000, 1900], [0, 1900]]);
    nearPoly(out.get(b.id).poly, [[1900, 0], [1900, 4000], [2100, 4000], [2100, 0]]);
    assert.deepEqual(out.get(a.id).tee, [false, false]);
  });

  test("a three-way joint mitres the two corners, keeps the straight face and reaches the joint point", () => {
    const east = W(0, 0, 3000, 0);
    const south = W(0, 0, 0, 3000);
    const west = W(0, 0, -3000, 0);
    const out = wallOutlines([east, south, west]);
    // Each outline gains the joint point (0, 0) so the wedges fill the hub.
    nearPoly(out.get(east.id).poly, [[100, 100], [3000, 100], [3000, -100], [0, -100], [0, 0]]);
    nearPoly(out.get(south.id).poly, [[-100, 100], [-100, 3000], [100, 3000], [100, 100], [0, 0]]);
    nearPoly(out.get(west.id).poly, [[0, -100], [-3000, -100], [-3000, 100], [-100, 100], [0, 0]]);
  });

  test("a three-way joint leaves no hole between the three outlines", () => {
    const east = W(0, 0, 3000, 0);
    const south = W(0, 0, 0, 3000);
    const west = W(0, 0, -3000, 0);
    const out = wallOutlines([east, south, west]);
    // The union is a 6000 × 200 bar plus a 2900 × 200 stem: 1.78 m² of wall.
    const total = [east, south, west].reduce((s, w) => s + area(out.get(w.id).poly), 0);
    near(total, 6000 * 200 + 2900 * 200, 1e-6, "outline area");
    // The point just above the joint's straight face must be inside some outline.
    assert.ok([east, south, west].some((w) => pointInPolygon(0, 50, out.get(w.id).poly)), "(0, 50) is covered");
  });

  test("a four-way joint meets in a square of the wall thickness", () => {
    const arms = [W(0, 0, 3000, 0), W(0, 0, 0, 3000), W(0, 0, -3000, 0), W(0, 0, 0, -3000)];
    const out = wallOutlines(arms);
    for (const w of arms) {
      const poly = out.get(w.id).poly;
      // Start corners (index 0 and 3) sit on the corners of the 200 × 200
      // crossing square; the fifth point is the joint centre.
      for (const p of [poly[0], poly[3]]) {
        near(Math.abs(p[0]), 100, 1e-6);
        near(Math.abs(p[1]), 100, 1e-6);
      }
      nearPoly([poly[4]], [[0, 0]]);
      // 2900 × 200 arm plus a quarter of the crossing square.
      near(area(poly), 2900 * 200 + 100 * 100, 1e-6);
    }
  });

  test("a four-way joint leaves no hole in the crossing square", () => {
    const arms = [W(0, 0, 3000, 0), W(0, 0, 0, 3000), W(0, 0, -3000, 0), W(0, 0, 0, -3000)];
    const out = wallOutlines(arms);
    assert.ok(arms.some((w) => pointInPolygon(0, 0, out.get(w.id).poly)), "the joint centre is covered");
  });

  test("a T made of three wall ends after splitting the through wall stays closed", () => {
    const p = project([W(0, 0, 6000, 0, 200, { id: "main" }), W(3000, 0, 3000, 3000, 200, { id: "stem" })]);
    const before = [...wallOutlines(p.walls).values()].reduce((s, o) => s + area(o.poly), 0);
    splitWall(p, p.walls[0], 3000, () => "main-b");
    const after = [...wallOutlines(p.walls).values()].reduce((s, o) => s + area(o.poly), 0);
    near(after, before, 1e-6, "splitting does not change the wall area");
  });

  test("walls of different thickness meet at the corner of both faces", () => {
    const a = W(0, 0, 4000, 0, 300);
    const b = W(4000, 0, 4000, 3000, 100);
    const out = wallOutlines([a, b]);
    nearPoly(out.get(a.id).poly, [[0, 150], [3950, 150], [4050, -150], [0, -150]]);
    nearPoly(out.get(b.id).poly, [[3950, 150], [3950, 3000], [4050, 3000], [4050, -150]]);
  });

  test("a collinear continuation is cut square at the shared point", () => {
    const a = W(0, 0, 3000, 0);
    const b = W(3000, 0, 6000, 0);
    const out = wallOutlines([a, b]);
    nearPoly(out.get(a.id).poly, [[0, 100], [3000, 100], [3000, -100], [0, -100]]);
    nearPoly(out.get(b.id).poly, [[3000, 100], [6000, 100], [6000, -100], [3000, -100]]);
  });

  test("ends within the 2 mm joint tolerance are joined", () => {
    const a = W(0, 0, 4000, 0);
    const b = W(4001, 1, 4000, 3000);
    const out = wallOutlines([a, b]);
    const pa = out.get(a.id).poly;
    assert.ok(Math.max(...pa.map((p) => p[0])) > 4050, "the outer corner is mitred past the end");
  });

  test("a very sharp angle falls back to square ends instead of a long spike", () => {
    const a = W(0, 0, 4000, 0);
    const b = W(4000, 0, 0, 100);
    const out = wallOutlines([a, b]);
    for (const w of [a, b]) {
      const poly = out.get(w.id).poly;
      for (const p of poly) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]));
    }
    const pa = out.get(a.id).poly;
    // End corners stay next to the joint (no mitre thousands of mm away).
    assert.ok(dist(...pa[1], 4000, 0) <= 200 + 1e-6, `end right corner ${pa[1]}`);
    assert.ok(dist(...pa[2], 4000, 0) <= 200 + 1e-6, `end left corner ${pa[2]}`);
    near(area(pa), 4000 * 200, 1e-6, "the sharp wall keeps its full rectangle");
  });

  test("a closed rectangle of walls tiles the exact frame area", () => {
    const ws = [W(0, 0, 6000, 0), W(6000, 0, 6000, 4000), W(6000, 4000, 0, 4000), W(0, 4000, 0, 0)];
    const out = wallOutlines(ws);
    const total = ws.reduce((s, w) => s + area(out.get(w.id).poly), 0);
    near(total, 6200 * 4200 - 5800 * 3800, 1e-6);
    for (const w of ws) assert.equal(out.get(w.id).poly.length, 4);
  });

  test("every wall gets an outline and the map is keyed by id", () => {
    const ws = [W(0, 0, 6000, 0), W(3000, 0, 3000, 2000), W(10000, 0, 12000, 0)];
    const out = wallOutlines(ws);
    assert.equal(out.size, 3);
    for (const w of ws) assert.ok(out.has(w.id));
    assert.equal(wallOutlines([]).size, 0);
  });
});

// ================================================================ openings
describe("openings along a wall", () => {
  test("openingSpans clamps to the wall and sorts by position", () => {
    const w = W(0, 0, 4000, 0, 200, { id: "w" });
    const p = project([w], [door(w, 3000, 900, { id: "late" }), door(w, 100, 900, { id: "early" }), door(w, 3900, 600, { id: "end" })]);
    const spans = openingSpans(p, w);
    assert.deepEqual(spans.map((s) => s.o.id), ["early", "late", "end"]);
    assert.deepEqual([spans[0].u1, spans[0].u2], [0, 550]);
    assert.deepEqual([spans[1].u1, spans[1].u2], [2550, 3450]);
    assert.deepEqual([spans[2].u1, spans[2].u2], [3600, 4000]);
  });

  test("openingSpans drops openings entirely past the wall end", () => {
    const w = W(0, 0, 4000, 0, 200, { id: "w" });
    const p = project([w], [door(w, 5000, 900), door(w, -800, 900), door(w, 2000)]);
    assert.equal(openingSpans(p, w).length, 1);
  });

  test("openingSpans only lists the openings of that wall", () => {
    const a = W(0, 0, 4000, 0, 200, { id: "a" });
    const b = W(0, 3000, 4000, 3000, 200, { id: "b" });
    const p = project([a, b], [door(a, 1000), door(b, 2000), door(b, 3000)]);
    assert.equal(openingSpans(p, a).length, 1);
    assert.equal(openingSpans(p, b).length, 2);
  });

  test("slicePoly cuts the outline between two positions along the wall", () => {
    const w = W(0, 0, 4000, 0);
    const poly = wallOutlines([w]).get(w.id).poly;
    const mid = slicePoly(w, poly, 1000, 2500);
    near(area(mid), 1500 * 200);
    for (const [x] of mid) assert.ok(x >= 1000 - 1e-9 && x <= 2500 + 1e-9);
    near(area(slicePoly(w, poly, -1e9, 1000)), 1000 * 200, 1e-6, "open start");
    near(area(slicePoly(w, poly, 3000, 1e9)), 1000 * 200, 1e-6, "open end");
    assert.deepEqual(slicePoly(w, poly, -1e9, 1e9), poly, "no limits = the whole outline");
  });

  test("slicePoly works on a slanted wall", () => {
    const w = W(100, 100, 3100, 4100);
    const poly = wallOutlines([w]).get(w.id).poly;
    near(area(slicePoly(w, poly, 1000, 3000)), 2000 * 200, 1e-6);
  });

  test("wallPieces: no opening gives one piece", () => {
    const w = W(0, 0, 4000, 0, 200, { id: "w" });
    const p = project([w]);
    const pieces = wallPieces(p, w, wallOutlines([w]).get(w.id).poly);
    assert.equal(pieces.length, 1);
    near(area(pieces[0]), 4000 * 200);
  });

  test("wallPieces: one opening gives two pieces with a gap of its width", () => {
    const w = W(0, 0, 4000, 0, 200, { id: "w" });
    const p = project([w], [door(w, 2000, 900)]);
    const pieces = wallPieces(p, w, wallOutlines([w]).get(w.id).poly);
    assert.equal(pieces.length, 2);
    near(area(pieces[0]) + area(pieces[1]), (4000 - 900) * 200, 1e-6);
  });

  test("wallPieces: two openings give three pieces", () => {
    const w = W(0, 0, 6000, 0, 200, { id: "w" });
    const p = project([w], [door(w, 4500, 900), door(w, 1500, 1200)]);
    const pieces = wallPieces(p, w, wallOutlines([w]).get(w.id).poly);
    assert.equal(pieces.length, 3);
    near(pieces.reduce((s, pc) => s + area(pc), 0), (6000 - 2100) * 200, 1e-6);
  });

  test("wallPieces: overlapping openings make one gap", () => {
    const w = W(0, 0, 6000, 0, 200, { id: "w" });
    const p = project([w], [door(w, 2000, 1000), door(w, 2600, 1000)]);
    const pieces = wallPieces(p, w, wallOutlines([w]).get(w.id).poly);
    assert.equal(pieces.length, 2);
    near(pieces.reduce((s, pc) => s + area(pc), 0), (6000 - 1600) * 200, 1e-6);
  });

  test("wallPieces: an opening at the very end leaves one solid piece", () => {
    const w = W(0, 0, 4000, 0, 200, { id: "w" });
    const p = project([w], [door(w, 4000 - 450, 900)]);
    const pieces = wallPieces(p, w, wallOutlines([w]).get(w.id).poly);
    for (const pc of pieces) assert.ok(area(pc) > 1, `piece of area ${area(pc)}`);
    assert.equal(pieces.length, 1);
    near(area(pieces[0]), 3100 * 200, 1e-6);
  });

  test("wallPieces: an opening at the very start leaves one solid piece", () => {
    const w = W(0, 0, 4000, 0, 200, { id: "w" });
    const p = project([w], [door(w, 450, 900)]);
    const pieces = wallPieces(p, w, wallOutlines([w]).get(w.id).poly);
    for (const pc of pieces) assert.ok(area(pc) > 1, `piece of area ${area(pc)}`);
    assert.equal(pieces.length, 1);
  });

  test("wallPieces: the solid area is right even when an opening reaches the end", () => {
    const w = W(0, 0, 4000, 0, 200, { id: "w" });
    const p = project([w], [door(w, 4000 - 450, 900), door(w, 450, 900)]);
    const pieces = wallPieces(p, w, wallOutlines([w]).get(w.id).poly);
    near(pieces.reduce((s, pc) => s + area(pc), 0), (4000 - 1800) * 200, 1e-6);
  });

  test("fitOpening keeps an opening inside its wall", () => {
    const w = W(0, 0, 4000, 0);
    assert.equal(fitOpening(w, 2000, 900), 2000);
    assert.equal(fitOpening(w, 100, 900), 450);
    assert.equal(fitOpening(w, -500, 900), 450);
    assert.equal(fitOpening(w, 3900, 900), 3550);
    assert.equal(fitOpening(w, 9999, 1200), 3400);
    assert.equal(fitOpening(w, 100, 6000), 2000, "an opening wider than the wall is centred");
  });
});

// ================================================================ queries
describe("wall queries", () => {
  test("wallAt returns the nearest wall under the point with its position", () => {
    const a = W(0, 0, 4000, 0, 200, { id: "a" });
    const b = W(0, 150, 4000, 150, 200, { id: "b" });
    const hit = wallAt([a, b], 1000, 50);
    assert.equal(hit.wall, a);
    near(hit.d, 50);
    near(hit.t, 0.25);
    near(hit.u, 1000);
    assert.deepEqual([hit.x, hit.y], [1000, 0]);
    assert.equal(wallAt([a, b], 1000, 110).wall, b);
  });

  test("wallAt honours the thickness and the margin", () => {
    const a = W(0, 0, 4000, 0, 200);
    assert.equal(wallAt([a], 1000, 150), null);
    assert.equal(wallAt([a], 1000, 150, 60).wall, a);
    assert.equal(wallAt([a], 5000, 0), null, "past the end");
    assert.equal(wallAt([], 0, 0), null);
  });

  test("endsAt finds every wall end at a point", () => {
    const a = W(0, 0, 4000, 0, 200, { id: "a" });
    const b = W(4000, 0, 4000, 3000, 200, { id: "b" });
    const c = W(4001, 1, 8000, 0, 200, { id: "c" });
    const d = W(0, 3000, 4000, 3000, 200, { id: "d" });
    const ends = endsAt([a, b, c, d], 4000, 0);
    assert.deepEqual(ends.map((e) => [e.wall.id, e.end]), [["a", 1], ["b", 0], ["c", 0]]);
    assert.deepEqual(endsAt([a, b, c, d], 4000, 0, 0.5).map((e) => e.wall.id), ["a", "b"], "a tighter tolerance");
    assert.deepEqual(endsAt([a], 2000, 0), []);
  });
});

// ================================================================ edits
describe("splitWall and mergeCollinear", () => {
  test("splitWall cuts a wall in two and moves later openings to the new part", () => {
    const w = W(0, 0, 6000, 0, 250, { id: "w", type: "ext-render-250", material: "brick" });
    const p = project([w], [door(w, 1000, 900, { id: "first" }), door(w, 4000, 900, { id: "second" })]);
    const wall = p.walls[0];
    const res = splitWall(p, wall, 3000, () => "w-b");
    assert.ok(res);
    const [a, b] = res;
    assert.equal(a, wall);
    assert.deepEqual([a.x1, a.y1, a.x2, a.y2], [0, 0, 3000, 0]);
    assert.deepEqual([b.x1, b.y1, b.x2, b.y2], [3000, 0, 6000, 0]);
    assert.equal(b.id, "w-b");
    assert.equal(b.thickness, 250);
    assert.equal(b.type, "ext-render-250");
    assert.equal(b.material, "brick");
    assert.equal(b.level, "L");
    assert.equal(p.walls.length, 2);
    const first = p.openings.find((o) => o.id === "first");
    const second = p.openings.find((o) => o.id === "second");
    assert.equal(first.wall, "w");
    assert.equal(first.at, 1000);
    assert.equal(second.wall, "w-b");
    assert.equal(second.at, 1000, "at is re-based on the new part");
  });

  test("splitWall on a slanted wall puts the cut point on the centre line", () => {
    const w = W(0, 0, 3000, 4000, 200, { id: "w" });
    const p = project([w]);
    const [a, b] = splitWall(p, p.walls[0], 2500, () => "nb");
    near(a.x2, 1500);
    near(a.y2, 2000);
    assert.equal(b.x1, a.x2);
    assert.equal(b.y1, a.y2);
    near(wallLength(a) + wallLength(b), 5000);
  });

  test("splitWall refuses a cut at or near either end", () => {
    const w = W(0, 0, 6000, 0, 200, { id: "w" });
    const p = project([w]);
    assert.equal(splitWall(p, p.walls[0], 0, () => "x"), null);
    assert.equal(splitWall(p, p.walls[0], 1, () => "x"), null);
    assert.equal(splitWall(p, p.walls[0], 5999, () => "x"), null);
    assert.equal(splitWall(p, p.walls[0], 6000, () => "x"), null);
    assert.equal(p.walls.length, 1);
  });

  test("mergeCollinear joins two walls end to end and re-bases the openings", () => {
    const a = W(0, 0, 3000, 0, 200, { id: "a" });
    const b = W(3000, 0, 6000, 0, 200, { id: "b" });
    const p = project([a, b], [door(a, 1000, 900, { id: "oa" }), door(b, 1000, 900, { id: "ob" })]);
    assert.equal(mergeCollinear(p, "L"), 1);
    assert.equal(p.walls.length, 1);
    const w = p.walls[0];
    assert.equal(w.id, "a");
    assert.deepEqual([w.x1, w.y1, w.x2, w.y2], [0, 0, 6000, 0]);
    assert.equal(p.openings.find((o) => o.id === "oa").at, 1000);
    const ob = p.openings.find((o) => o.id === "ob");
    assert.equal(ob.wall, "a");
    assert.equal(ob.at, 4000);
  });

  test("mergeCollinear merges a chain of three walls into one", () => {
    const p = project([W(0, 0, 1000, 0, 200, { id: "a" }), W(1000, 0, 2500, 0, 200, { id: "b" }), W(2500, 0, 4000, 0, 200, { id: "c" })]);
    assert.equal(mergeCollinear(p, "L"), 2);
    assert.equal(p.walls.length, 1);
    assert.equal(p.walls[0].x2, 4000);
  });

  test("mergeCollinear does not merge across a T", () => {
    const p = project([W(0, 0, 3000, 0, 200, { id: "a" }), W(3000, 0, 6000, 0, 200, { id: "b" }), W(3000, 0, 3000, 3000, 200, { id: "c" })]);
    assert.equal(mergeCollinear(p, "L"), 0);
    assert.equal(p.walls.length, 3);
  });

  test("mergeCollinear does not merge walls of different thickness or height", () => {
    const p1 = project([W(0, 0, 3000, 0, 200), W(3000, 0, 6000, 0, 150)]);
    assert.equal(mergeCollinear(p1, "L"), 0);
    const p2 = project([W(0, 0, 3000, 0, 200, { height: 2400 }), W(3000, 0, 6000, 0, 200)]);
    assert.equal(mergeCollinear(p2, "L"), 0);
  });

  test("mergeCollinear does not merge walls at an angle or running back", () => {
    const p1 = project([W(0, 0, 3000, 0), W(3000, 0, 6000, 100)]);
    assert.equal(mergeCollinear(p1, "L"), 0);
    const p2 = project([W(0, 0, 3000, 0), W(3000, 0, 1000, 0)]);
    assert.equal(mergeCollinear(p2, "L"), 0);
  });

  test("mergeCollinear only looks at the requested level", () => {
    const p = project([W(0, 0, 3000, 0), W(3000, 0, 6000, 0)]);
    assert.equal(mergeCollinear(p, "other-level"), 0);
    assert.equal(p.walls.length, 2);
  });

  test("a merged wall still makes a clean outline", () => {
    const p = project([W(0, 0, 3000, 0, 200, { id: "a" }), W(3000, 0, 6000, 0, 200, { id: "b" })]);
    mergeCollinear(p, "L");
    const o = wallOutlines(p.walls).get("a");
    near(area(o.poly), 6000 * 200);
    assert.ok(pointInPolygon(4500, 0, o.poly));
  });
});
