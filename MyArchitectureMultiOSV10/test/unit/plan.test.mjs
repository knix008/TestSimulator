// Unit tests for plan editing: hit-testing, box selection, snapping and the
// edit operations (src/plan/ops.js), typed lengths (parseLength in
// src/plan/editor.js) and plan drawing (src/plan/render.js, also through the
// SVG context in src/ui/svgctx.js).
// Run: node --test test/unit/plan.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  hitTest, boxSelect, snapPoint, moveItems, selectionCentre, rotateItems, mirrorItems, moveWallEnd, copyItems,
  pasteItems, deleteItems, pointAtLength, scaleItems, groupMembers,
} from "../../src/plan/ops.js";
import { parseLength } from "../../src/plan/editor.js";
import {
  PLAN_THEMES, drawPlan, drawWalls, planBounds, stairGeometry, dimensionGeometry, gridBubble, phaseVisible, roomColor,
} from "../../src/plan/render.js";
import { SvgContext } from "../../src/ui/svgctx.js";
import { newProject, normalizeProject, newLevel, parseProject, wallLength } from "../../src/core/project.js";
import { wallOutlines } from "../../src/core/walls.js";
import { polygonArea } from "../../src/core/geom.js";
import { runCheck } from "../../src/core/check.js";

// ---------------------------------------------------------------- helpers

const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a} (tol ${tol})`);
const nearPt = (p, q, tol = 1e-6, msg = "") => { near(p[0], q[0], tol, `${msg} x`); near(p[1], q[1], tol, `${msg} y`); };
const root = path.resolve(import.meta.dirname, "..", "..");
const sampleIndex = JSON.parse(fs.readFileSync(path.join(root, "sample", "index.json"), "utf8"));
const loadSample = (file) => parseProject(fs.readFileSync(path.join(root, "sample", file), "utf8"));

// A project with levels "L" (ground) and "U" (above) and nothing else.
function base() {
  const p = newProject("Plan test");
  p.levels[0].id = "L";
  p.levels.push({ ...newLevel("2F", 2800), id: "U" });
  p.view.level = "L";
  return normalizeProject(p);
}

// A scene with one of everything on level "L" (see the coordinates below).
function scene() {
  const p = base();
  p.walls.push(
    { id: "A", level: "L", x1: 0, y1: 0, x2: 6000, y2: 0, thickness: 200 },
    { id: "B", level: "L", x1: 6000, y1: 0, x2: 6000, y2: 4000, thickness: 200 },
    { id: "UA", level: "U", x1: 0, y1: 0, x2: 6000, y2: 0, thickness: 200 },
  );
  p.openings.push({ id: "D", wall: "A", kind: "door", at: 2000, width: 900, height: 2100, sill: 0, side: 1 });
  p.rooms.push({ id: "R", level: "L", name: "Living", pts: [[100, 100], [5900, 100], [5900, 3900], [100, 3900]] });
  p.rooms.push({ id: "R2", level: "L", name: "Closet", pts: [[4000, 2500], [5500, 2500], [5500, 3500], [4000, 3500]] });
  p.furniture.push({ id: "F", level: "L", kind: "box", x: 3000, y: 2000, w: 1000, d: 1000, h: 750, rot: 0 });
  p.columns.push({ id: "C", level: "L", x: -5000, y: -5000, w: 400, d: 400 });
  p.stairs.push({ id: "S", level: "L", x: -5000, y: 3000, rot: 0, length: 3000, width: 1000, steps: 16 });
  p.dimensions.push({ id: "K", level: "L", x1: 0, y1: -1500, x2: 6000, y2: -1500, offset: 500 });
  p.texts.push({ id: "T", level: "L", x: 8000, y: 0, text: "Hello", size: 300, rot: 0 });
  p.drawings.push(
    { id: "ARC", level: "L", kind: "arc", cx: 10000, cy: 5000, r: 1000, a1: 0, a2: 90, layer: "0" },
    { id: "CIR", level: "L", kind: "circle", cx: 14000, cy: 5000, r: 500, layer: "0" },
    { id: "PL", level: "L", kind: "polyline", pts: [[16000, 0], [17000, 0], [17000, 1000]], layer: "0" },
    { id: "HID", level: "L", kind: "polyline", pts: [[16000, 3000], [17000, 3000]], layer: "hidden" },
  );
  p.underlays.push({ id: "UL", level: "L", x: 20000, y: 0, w: 2000, h: 1000, rot: 0, src: "" });
  p.roofs.push({ id: "RF", level: "L", pts: [[25000, 0], [30000, 0], [30000, 4000], [25000, 4000]], kind: "flat", pitch: 0, overhang: 400 });
  p.grids.push({ id: "G", x1: -2000, y1: 0, x2: -2000, y2: 4000, label: "1" });
  return normalizeProject(p);
}
const hit = (p, x, y, opts, tol = 50, level = "L") => hitTest(p, level, x, y, tol, opts);
const kindOf = (r) => (r ? r.kind : null);
const idOf = (r) => (r ? r.obj.id : null);

// A canvas stand-in that only counts calls.
function fakeCtx() {
  const calls = {};
  const count = (name) => () => { calls[name] = (calls[name] || 0) + 1; };
  const ctx = { calls, canvas: { width: 800, height: 600 }, fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic", globalAlpha: 1, lineJoin: "miter", lineCap: "butt" };
  for (const m of ["beginPath", "moveTo", "lineTo", "arc", "ellipse", "rect", "roundRect", "closePath", "fill", "stroke", "fillRect", "strokeRect", "fillText", "strokeText", "save", "restore", "translate", "rotate", "scale", "setTransform", "setLineDash", "clip", "drawImage", "quadraticCurveTo", "bezierCurveTo", "arcTo", "clearRect"]) ctx[m] = count(m);
  ctx.measureText = (s) => { count("measureText")(); return { width: String(s).length * 6 }; };
  return ctx;
}

// ================================================================ hit test
describe("hitTest", () => {
  test("an opening wins over the wall it sits in", () => {
    const p = scene();
    assert.deepEqual([kindOf(hit(p, 2000, 0)), idOf(hit(p, 2000, 0))], ["openings", "D"]);
    assert.deepEqual([kindOf(hit(p, 4000, 0)), idOf(hit(p, 4000, 0))], ["walls", "A"]);
    assert.equal(hit(p, 4000, 0).handle, undefined, "an unselected wall has no handles");
  });

  test("furniture wins over the room it stands in; the smaller room wins over the bigger", () => {
    const p = scene();
    assert.equal(idOf(hit(p, 3000, 2000)), "F");
    assert.equal(kindOf(hit(p, 1000, 3000)), "rooms");
    assert.equal(idOf(hit(p, 1000, 3000)), "R");
    assert.equal(idOf(hit(p, 4500, 3000)), "R2", "the closet inside the living room");
  });

  test("a wall is hit within half its thickness plus the tolerance", () => {
    const p = scene();
    assert.equal(idOf(hit(p, 4000, 140)), "A");
    assert.equal(kindOf(hit(p, 4000, 160)), "rooms", "beyond the wall the room is hit");
    assert.equal(idOf(hit(p, 6100, 2000, undefined, 10)), "B");
  });

  test("handles of a selected wall come first", () => {
    const p = scene();
    const selected = new Set(["A"]);
    assert.deepEqual([idOf(hit(p, 10, 10, { selected })), hit(p, 10, 10, { selected }).handle], ["A", 0]);
    const end = hit(p, 5990, 20, { selected });
    assert.equal(end.handle, 1);
    assert.equal(end.obj.id, "A", "the selected wall wins over the joined wall B");
    assert.equal(hit(p, 10, 10).handle, undefined, "no handle without the selection");
  });

  test("handles of selected rooms, roofs and dimensions", () => {
    const p = scene();
    const r = hit(p, 5900, 3900, { selected: new Set(["R"]) });
    assert.deepEqual([r.kind, r.obj.id, r.handle], ["rooms", "R", 2]);
    const f = hit(p, 30000, 4000, { selected: new Set(["RF"]) });
    assert.deepEqual([f.kind, f.obj.id, f.handle], ["roofs", "RF", 2]);
    const k = hit(p, 6000, -1500, { selected: new Set(["K"]) });
    assert.deepEqual([k.kind, k.obj.id, k.handle], ["dimensions", "K", 1]);
    const g = hit(p, -2000, 4000, { selected: new Set(["G"]) });
    assert.deepEqual([g.kind, g.handle], ["grids", 1]);
  });

  test("grid bubbles and grid lines are hit on every level", () => {
    const p = scene();
    const [cx, cy, r] = gridBubble(p.grids[0], 0);
    assert.equal(kindOf(hit(p, cx, cy + r * 0.9)), "grids");
    assert.equal(kindOf(hit(p, cx, cy, undefined, 50, "U")), "grids", "also on the upper level");
    assert.equal(kindOf(hit(p, -2000, 2000)), "grids", "the line itself");
    assert.equal(hit(p, -2000, 2000).handle, undefined);
  });

  test("text notes are hit inside their text box", () => {
    const p = scene();
    assert.equal(idOf(hit(p, 8400, 150)), "T");
    assert.equal(idOf(hit(p, 8000 + 5 * 300 * 0.62 - 10, 300)), "T", "the box is as wide as the text");
    assert.equal(hit(p, 8000 + 5 * 300 * 0.62 + 200, 150), null);
    p.texts[0].align = "center";
    assert.equal(idOf(hit(p, 7600, 150)), "T", "centred text extends to the left");
    p.texts[0].align = "right";
    assert.equal(idOf(hit(p, 7200, 150)), "T", "right-aligned text extends further left");
    p.texts[0].align = undefined;
    p.texts[0].rot = 90;
    assert.equal(idOf(hit(p, 7850, 400)), "T", "rotated text is hit in its own frame");
  });

  test("a dimension is hit on its offset line", () => {
    const p = scene();
    assert.equal(idOf(hit(p, 3000, -1000)), "K");
    assert.equal(hit(p, 3000, -1500), null, "not on the measured points' line");
  });

  test("columns and stairs are hit inside their outline", () => {
    const p = scene();
    assert.equal(idOf(hit(p, -5100, -4900)), "C");
    assert.equal(idOf(hit(p, -4000, 3200)), "S");
    assert.equal(hit(p, -4000, 4000), null);
  });

  test("drawings: arcs only along their sweep, circles on the rim, polylines on their segments", () => {
    const p = scene();
    assert.equal(idOf(hit(p, 11000, 5000)), "ARC");
    assert.equal(idOf(hit(p, 10000, 6000)), "ARC");
    assert.equal(idOf(hit(p, 10000 + 1000 * Math.SQRT1_2, 5000 + 1000 * Math.SQRT1_2)), "ARC");
    assert.equal(hit(p, 9000, 5000), null, "outside the sweep");
    assert.equal(hit(p, 10000, 5000), null, "the centre");
    assert.equal(idOf(hit(p, 14500, 5000)), "CIR");
    assert.equal(hit(p, 14000, 5000), null, "inside the circle is empty");
    assert.equal(idOf(hit(p, 16500, 30)), "PL");
    assert.equal(idOf(hit(p, 17000, 500)), "PL");
    assert.equal(hit(p, 16500, 500), null, "an open polyline has no closing segment");
    p.drawings.find((d) => d.id === "PL").closed = true;
    assert.equal(idOf(hit(p, 16500, 500)), "PL", "a closed polyline has");
  });

  test("a counter-clockwise arc covers the other part of the circle", () => {
    const p = scene();
    p.drawings.find((d) => d.id === "ARC").ccw = true;
    assert.equal(idOf(hit(p, 9000, 5000)), "ARC");
    assert.equal(hit(p, 10000 + 1000 * Math.SQRT1_2, 5000 + 1000 * Math.SQRT1_2), null);
  });

  test("drawings on hidden layers are not hit", () => {
    const p = scene();
    assert.equal(idOf(hit(p, 16500, 3000)), "HID");
    assert.equal(hit(p, 16500, 3000, { layersHidden: new Set(["hidden"]) }), null);
  });

  test("underlays and roof overhangs are hit last", () => {
    const p = scene();
    assert.equal(idOf(hit(p, 21000, 500)), "UL");
    assert.equal(idOf(hit(p, 24800, 2000)), "RF", "inside the overhang");
    assert.equal(idOf(hit(p, 27000, 2000)), "RF");
    assert.equal(hit(p, 24500, 2000), null, "outside the overhang");
  });

  test("items on other levels are ignored and empty space hits nothing", () => {
    const p = scene();
    assert.equal(idOf(hit(p, 4000, 0, undefined, 50, "U")), "UA");
    assert.equal(hit(p, 3000, 2000, undefined, 50, "U"), null);
    assert.equal(hit(p, 50000, 50000), null);
  });
});

// ================================================================ box select
describe("boxSelect", () => {
  test("a window selects only what is fully inside", () => {
    const p = scene();
    const ids = boxSelect(p, "L", { x1: -100, y1: -100, x2: 3500, y2: 2600 });
    assert.ok(ids.includes("D"), "the door's centre is inside");
    assert.ok(!ids.includes("A"), "the wall pokes out");
    assert.ok(!ids.includes("R"));
    assert.ok(ids.includes("F"));
  });

  test("a crossing box selects what it touches", () => {
    const p = scene();
    const ids = boxSelect(p, "L", { x1: -100, y1: -100, x2: 3500, y2: 2600 }, true);
    for (const id of ["A", "D", "R", "F"]) assert.ok(ids.includes(id), id);
    assert.ok(!ids.includes("K"), "the dimension lies outside the box");
    assert.ok(!ids.includes("B"), "B has no point in the box");
    assert.ok(!ids.includes("UA"), "other levels are left out");
  });

  test("a big window selects every kind of item on the level", () => {
    const p = scene();
    const ids = boxSelect(p, "L", { x1: -1e6, y1: -1e6, x2: 1e6, y2: 1e6 });
    for (const id of ["A", "B", "D", "R", "R2", "F", "C", "S", "K", "T", "ARC", "CIR", "PL", "HID", "UL", "RF", "G"]) assert.ok(ids.includes(id), id);
    assert.ok(!ids.includes("UA"));
  });

  test("circles and arcs are tested by their bounding square", () => {
    const p = scene();
    assert.ok(boxSelect(p, "L", { x1: 13400, y1: 4400, x2: 14600, y2: 5600 }).includes("CIR"));
    assert.ok(!boxSelect(p, "L", { x1: 13600, y1: 4400, x2: 14600, y2: 5600 }).includes("CIR"));
    assert.ok(boxSelect(p, "L", { x1: 13600, y1: 4400, x2: 14600, y2: 5600 }, true).includes("CIR"));
  });
});

// ================================================================ snapping
describe("snapPoint", () => {
  test("wall ends attract the cursor first", () => {
    const p = scene();
    const s = snapPoint(p, "L", 6050, 40);
    assert.deepEqual([s.x, s.y, s.kind], [6000, 0, "end"]);
  });

  test("room vertices and column centres are snap targets", () => {
    const p = scene();
    const v = snapPoint(p, "L", 5500 + 30, 3500 - 30);
    assert.deepEqual([v.x, v.y, v.kind], [5500, 3500, "vertex"]);
    const c = snapPoint(p, "L", -5040, -4960);
    assert.deepEqual([c.x, c.y, c.kind], [-5000, -5000, "centre"]);
    const d = snapPoint(p, "L", 16990, 10);
    assert.deepEqual([d.x, d.y, d.kind], [17000, 0, "vertex"], "drawing vertices too");
  });

  test("the nearest target wins and excluded items are skipped", () => {
    const p = scene();
    assert.deepEqual([snapPoint(p, "L", 5960, 20).x, snapPoint(p, "L", 5960, 20).kind], [6000, "end"]);
    const s = snapPoint(p, "L", 6050, 40, { exclude: new Set(["A", "B"]) });
    assert.notEqual(s.kind, "end");
  });

  test("with endpoints off the cursor projects onto the wall, on the grid", () => {
    const p = scene();
    const s = snapPoint(p, "L", 2340, 60, { endpoints: false });
    assert.deepEqual([s.x, s.y, s.kind, s.wall.id], [2300, 0, "wall", "A"]);
    const t = snapPoint(p, "L", 2340, 60, { endpoints: false, grid: 0 });
    near(t.x, 2340);
  });

  test("on-wall snapping is clamped to the wall's length", () => {
    const p = base();
    p.walls.push({ id: "W", level: "L", x1: 0, y1: 0, x2: 1050, y2: 0, thickness: 200 });
    const s = snapPoint(p, "L", 1040, 30, { endpoints: false, grid: 100 });
    assert.equal(s.kind, "wall");
    assert.ok(s.x <= 1050);
  });

  test("away from everything the cursor snaps to the grid", () => {
    const p = scene();
    assert.deepEqual(snapPoint(p, "L", 1234, 2345), { x: 1200, y: 2300, kind: "grid" });
    assert.deepEqual(snapPoint(p, "L", 1234, 2345, { grid: 0 }), { x: 1234, y: 2345, kind: "grid" });
    assert.deepEqual(snapPoint(p, "L", 6050, 40, { endpoints: false, onWall: false }), { x: 6100, y: 0, kind: "grid" });
  });

  test("drawing from a point constrains to 45° steps and grid lengths", () => {
    const p = scene();
    const s = snapPoint(p, "L", 2030, 3080, { from: [0, 3000] });
    assert.equal(s.kind, "ortho");
    nearPt([s.x, s.y], [2000, 3000]);
    const d = snapPoint(p, "L", 1000, 3990, { from: [0, 3000] });
    assert.equal(d.kind, "ortho");
    nearPt([d.x, d.y], [1400 * Math.SQRT1_2, 3000 + 1400 * Math.SQRT1_2], 1e-6, "a 45° line of 1400 mm");
    const free = snapPoint(p, "L", 1000, 3990, { from: [0, 3000], grid: 0 });
    near(Math.hypot(free.x, free.y - 3000), (1000 + 990) * Math.SQRT1_2, 1e-6, "no grid: projected length");
  });

  test("ortho never runs backwards past the start point", () => {
    const p = scene();
    const s = snapPoint(p, "L", 10, 3000, { from: [0, 3000] });
    assert.ok(Math.hypot(s.x, s.y - 3000) < 1e-9);
  });

  test("a ray that meets a wall centre line ends exactly on it", () => {
    const p = scene();
    const s = snapPoint(p, "L", 3020, 100, { from: [3000, 3000] });
    assert.equal(s.kind, "wall");
    nearPt([s.x, s.y], [3000, 0]);
  });

  test("ortho lines up with another wall's end and returns the guide", () => {
    const p = base();
    p.walls.push({ id: "B", level: "L", x1: 4000, y1: 1000, x2: 5000, y2: 1000, thickness: 200 });
    const s = snapPoint(p, "L", 3920, 3010, { from: [0, 3000], tol: 200 });
    assert.equal(s.kind, "ortho");
    nearPt([s.x, s.y], [4000, 3000]);
    assert.deepEqual(s.guide, [4000, 1000, 4000, 3000]);
    const v = snapPoint(p, "L", 5010, 1080, { from: [5000, 5000], tol: 200 });
    nearPt([v.x, v.y], [5000, 1000], 1e-6, "vertical: lines up in y");
  });

  test("ortho is off without a start point or with ortho: false", () => {
    const p = scene();
    assert.equal(snapPoint(p, "L", 1234, 2345, { from: [0, 3000], ortho: false }).kind, "grid");
  });
});

// ================================================================ transforms
describe("moveItems", () => {
  test("moving a wall stretches the walls joined to it", () => {
    const p = scene();
    moveItems(p, ["A"], 0, 500);
    const [A, B] = p.walls;
    assert.deepEqual([A.x1, A.y1, A.x2, A.y2], [0, 500, 6000, 500]);
    assert.deepEqual([B.x1, B.y1, B.x2, B.y2], [6000, 500, 6000, 4000]);
  });

  test("with stretch off (Alt) joined walls stay", () => {
    const p = scene();
    moveItems(p, ["A"], 0, 500, { stretch: false });
    const B = p.walls.find((w) => w.id === "B");
    assert.deepEqual([B.x1, B.y1], [6000, 0]);
  });

  test("moving a wall does not drag walls on other levels", () => {
    const p = scene();
    moveItems(p, ["A"], 0, 500);
    const UA = p.walls.find((w) => w.id === "UA");
    assert.deepEqual([UA.x1, UA.y1, UA.x2, UA.y2], [0, 0, 6000, 0]);
  });

  test("openings on a stretched wall are kept inside it", () => {
    const p = scene();
    p.openings.push({ id: "DB", wall: "B", kind: "door", at: 3500, width: 900, height: 2100, sill: 0 });
    normalizeProject(p);
    moveItems(p, ["A"], 0, 1500); // B shrinks to 2500 mm
    near(p.openings.find((o) => o.id === "DB").at, 2500 - 450);
  });

  test("an opening moved on its own slides along its wall, clamped", () => {
    const p = scene();
    moveItems(p, ["D"], 300, 999);
    assert.equal(p.openings[0].at, 2300);
    assert.deepEqual([p.walls[0].y1, p.walls[0].y2], [0, 0], "the wall does not move");
    moveItems(p, ["D"], 99999, 0);
    assert.equal(p.openings[0].at, 6000 - 450);
    moveItems(p, ["D"], -99999, 0);
    assert.equal(p.openings[0].at, 450);
  });

  test("an opening moved with its wall keeps its position on the wall", () => {
    const p = scene();
    moveItems(p, ["A", "D"], 700, 0);
    assert.equal(p.openings[0].at, 2000);
    assert.equal(p.walls[0].x1, 700);
  });

  test("every kind of item moves by the offset", () => {
    const p = scene();
    p.rooms[0].label = [3000, 2000];
    moveItems(p, ["R", "F", "C", "S", "K", "T", "ARC", "PL", "UL", "RF", "G"], 100, -200);
    assert.deepEqual(p.rooms[0].pts[0], [200, -100]);
    assert.deepEqual(p.rooms[0].label, [3100, 1800]);
    assert.deepEqual(p.rooms[1].pts[0], [4000, 2500], "unselected rooms stay");
    assert.deepEqual([p.furniture[0].x, p.furniture[0].y], [3100, 1800]);
    assert.deepEqual([p.columns[0].x, p.columns[0].y], [-4900, -5200]);
    assert.deepEqual([p.stairs[0].x, p.stairs[0].y], [-4900, 2800]);
    const k = p.dimensions[0];
    assert.deepEqual([k.x1, k.y1, k.x2, k.y2], [100, -1700, 6100, -1700]);
    assert.deepEqual([p.texts[0].x, p.texts[0].y], [8100, -200]);
    const arc = p.drawings.find((d) => d.id === "ARC");
    assert.deepEqual([arc.cx, arc.cy, arc.a1, arc.a2], [10100, 4800, 0, 90]);
    assert.deepEqual(p.drawings.find((d) => d.id === "PL").pts[0], [16100, -200]);
    assert.deepEqual([p.underlays[0].x, p.underlays[0].y], [20100, -200]);
    assert.deepEqual(p.roofs[0].pts[0], [25100, -200]);
    assert.deepEqual([p.grids[0].x1, p.grids[0].y1, p.grids[0].x2, p.grids[0].y2], [-1900, -200, -1900, 3800]);
  });
});

describe("rotate, mirror, scale and wall ends", () => {
  test("selectionCentre is the middle of the selection's bounding box", () => {
    const p = scene();
    assert.deepEqual(selectionCentre(p, ["A"]), [3000, 0]);
    assert.deepEqual(selectionCentre(p, ["A", "B"]), [3000, 2000]);
    assert.deepEqual(selectionCentre(p, ["F", "C"]), [-1000, -1500]);
    assert.deepEqual(selectionCentre(p, ["CIR"]), [14000, 5000]);
    assert.deepEqual(selectionCentre(p, ["UL"]), [21000, 500]);
    assert.deepEqual(selectionCentre(p, ["G"]), [-2000, 2000]);
    assert.equal(selectionCentre(p, []), null);
    assert.equal(selectionCentre(p, ["nope"]), null);
  });

  test("rotateItems turns walls about the selection centre", () => {
    const p = base();
    p.walls.push({ id: "W", level: "L", x1: 0, y1: 0, x2: 2000, y2: 0, thickness: 200 });
    rotateItems(p, ["W"], 90);
    const w = p.walls[0];
    nearPt([w.x1, w.y1], [1000, -1000]);
    nearPt([w.x2, w.y2], [1000, 1000]);
  });

  test("rotateItems about a given centre, snapped to the grid", () => {
    const p = base();
    p.walls.push({ id: "W", level: "L", x1: 0, y1: 0, x2: 2000, y2: 0, thickness: 200 });
    rotateItems(p, ["W"], 180, [1040, 30], 100);
    const w = p.walls[0];
    nearPt([w.x1, w.y1], [2000, 0]);
    nearPt([w.x2, w.y2], [0, 0]);
  });

  test("rotateItems turns furniture, columns, stairs, texts, arcs and underlays", () => {
    const p = scene();
    p.furniture[0].rot = 300;
    rotateItems(p, ["F", "C", "S", "T", "ARC", "UL"], 90, [0, 0]);
    assert.equal(p.furniture[0].rot, 30, "rot wraps into 0…360");
    nearPt([p.furniture[0].x, p.furniture[0].y], [-2000, 3000]);
    assert.equal(p.columns[0].rot, 90);
    assert.equal(p.stairs[0].rot, 90);
    assert.equal(p.texts[0].rot, 90);
    const arc = p.drawings.find((d) => d.id === "ARC");
    assert.deepEqual([arc.a1, arc.a2], [90, 180]);
    assert.equal(p.underlays[0].rot, 90);
  });

  test("rotating nothing does nothing", () => {
    const p = scene();
    const before = JSON.stringify(p);
    rotateItems(p, [], 90);
    mirrorItems(p, []);
    scaleItems(p, [], 2);
    assert.equal(JSON.stringify(p), before);
  });

  test("mirroring a wall flips its door to the same physical side", () => {
    const p = scene();
    mirrorItems(p, ["A"], "x");
    const A = p.walls[0];
    assert.deepEqual([A.x1, A.x2], [6000, 0]);
    assert.equal(p.openings[0].side, -1);
    assert.equal(p.openings[0].at, 2000, "the door stays 2 m from the start");
  });

  test("mirroring furniture flips its rotation", () => {
    const p = scene();
    p.furniture[0].rot = 30;
    mirrorItems(p, ["F"], "x");
    assert.equal(p.furniture[0].rot, 150);
    p.furniture[0].rot = 30;
    mirrorItems(p, ["F"], "y");
    assert.equal(p.furniture[0].rot, 330);
  });

  test("mirroring keeps rooms counter-clockwise and flips dimensions and arcs", () => {
    const p = scene();
    const sign = Math.sign(polygonArea(p.rooms[0].pts));
    mirrorItems(p, ["R", "K", "ARC"], "x");
    assert.equal(Math.sign(polygonArea(p.rooms[0].pts)), sign);
    assert.equal(p.dimensions[0].offset, -500);
    const arc = p.drawings.find((d) => d.id === "ARC");
    assert.deepEqual([arc.a1, arc.a2], [90, 180]);
  });

  test("mirroring about y moves points across the horizontal centre line", () => {
    const p = scene();
    mirrorItems(p, ["F", "C"], "y");
    assert.deepEqual([p.furniture[0].x, p.furniture[0].y], [3000, -5000]);
    assert.deepEqual([p.columns[0].x, p.columns[0].y], [-5000, 2000]);
  });

  test("scaleItems scales positions and sizes about the centre", () => {
    const p = scene();
    scaleItems(p, ["F"], 2);
    const f = p.furniture[0];
    assert.deepEqual([f.x, f.y, f.w, f.d, f.h], [3000, 2000, 2000, 2000, 1500]);
    scaleItems(p, ["A"], 0.01);
    assert.equal(p.walls[0].thickness, 10, "walls stay at least 10 mm thick");
    scaleItems(p, ["T", "CIR", "S", "UL"], 0.5);
    assert.equal(p.texts[0].size, 150);
    assert.equal(p.drawings.find((d) => d.id === "CIR").r, 250);
    assert.equal(p.stairs[0].length, 1500);
    assert.equal(p.underlays[0].w, 1000);
    const before = JSON.stringify(p);
    scaleItems(p, ["F"], 0);
    scaleItems(p, ["F"], -1);
    assert.equal(JSON.stringify(p), before, "non-positive factors are ignored");
  });

  test("moveWallEnd moves every wall end joined at that point", () => {
    const p = scene();
    moveWallEnd(p, p.walls[0], 1, 6500, 200);
    const [A, B] = p.walls;
    assert.deepEqual([A.x2, A.y2], [6500, 200]);
    assert.deepEqual([B.x1, B.y1], [6500, 200]);
    const UA = p.walls.find((w) => w.id === "UA");
    assert.deepEqual([UA.x2, UA.y2], [6000, 0], "walls on other levels stay");
  });

  test("moveWallEnd keeps openings inside the shortened wall", () => {
    const p = scene();
    moveWallEnd(p, p.walls[0], 1, 1500, 0);
    near(p.openings[0].at, 1500 - 450);
    near(wallLength(p.walls[0]), 1500);
  });

  test("groupMembers selects a whole group with the openings of its walls", () => {
    const p = scene();
    p.walls[0].group = "g1";
    p.furniture[0].group = "g1";
    p.rooms[1].group = "g2";
    const g = groupMembers(p, "F");
    assert.deepEqual(new Set(g), new Set(["A", "F", "D"]));
    assert.deepEqual(groupMembers(p, "R2"), ["R2"]);
    assert.deepEqual(groupMembers(p, "B"), ["B"], "ungrouped items are their own group");
    assert.deepEqual(groupMembers(p, "nope"), ["nope"]);
  });

  test("pointAtLength walks from a point towards another", () => {
    nearPt(pointAtLength([0, 0], [3, 4], 10), [6, 8]);
    nearPt(pointAtLength([100, 100], [100, 0], 2500), [100, -2400]);
    nearPt(pointAtLength([5, 5], [5, 5], 10), [5, 5], 1e-9, "no direction: stays");
  });
});

// ================================================================ clipboard
describe("copy, paste and delete", () => {
  test("copying a wall brings its openings and the selection centre", () => {
    const p = scene();
    const clip = copyItems(p, ["A"]);
    assert.equal(clip.walls.length, 1);
    assert.deepEqual(clip.openings.map((o) => o.id), ["D"]);
    assert.deepEqual(clip.centre, [3000, 0]);
    clip.walls[0].x1 = 999;
    assert.equal(p.walls[0].x1, 0, "the clipboard is a deep copy");
  });

  test("pasting gives new ids, the target level and the offset", () => {
    const p = scene();
    p.openings[0].tag = "ENTRY";
    const clip = copyItems(p, ["A", "F", "R2"]);
    const added = pasteItems(p, clip, "U", 3000, 6000);
    assert.equal(added.length, 4, "wall, room, furniture and the door");
    for (const id of added) assert.ok(!["A", "F", "R2", "D"].includes(id), "fresh ids");
    const wall = p.walls.find((w) => w.id === added[0]);
    assert.equal(wall.level, "U");
    const dy = 6000 - clip.centre[1];
    const dx = 3000 - clip.centre[0];
    assert.deepEqual([wall.x1, wall.y1, wall.x2, wall.y2], [0 + dx, 0 + dy, 6000 + dx, 0 + dy]);
    const door = p.openings.find((o) => added.includes(o.id));
    assert.equal(door.wall, wall.id, "the opening follows its copied wall");
    assert.equal(door.at, 2000);
    assert.equal(door.tag, undefined, "a pasted opening gets a fresh tag");
    const f = p.furniture.find((x) => added.includes(x.id));
    assert.deepEqual([f.x, f.y, f.level], [3000 + dx, 2000 + dy, "U"]);
    const r = p.rooms.find((x) => added.includes(x.id));
    assert.deepEqual(r.pts[0], [4000 + dx, 2500 + dy]);
    assert.equal(p.openings.find((o) => o.id === "D").wall, "A", "the original is untouched");
  });

  test("pasting dimensions, texts, drawings and labels moves every point", () => {
    const p = scene();
    p.rooms[0].label = [1000, 1000];
    const clip = copyItems(p, ["K", "T", "ARC", "PL", "R"]);
    const added = pasteItems(p, clip, "L", clip.centre[0] + 100, clip.centre[1] + 50);
    const k = p.dimensions.find((x) => added.includes(x.id));
    assert.deepEqual([k.x1, k.y1, k.x2, k.y2], [100, -1450, 6100, -1450]);
    const t = p.texts.find((x) => added.includes(x.id));
    assert.deepEqual([t.x, t.y], [8100, 50]);
    const arc = p.drawings.find((x) => added.includes(x.id) && x.kind === "arc");
    assert.deepEqual([arc.cx, arc.cy], [10100, 5050]);
    const pl = p.drawings.find((x) => added.includes(x.id) && x.kind === "polyline");
    assert.deepEqual(pl.pts[0], [16100, 50]);
    const r = p.rooms.find((x) => added.includes(x.id));
    assert.deepEqual(r.label, [1100, 1050]);
  });

  test("an opening copied without its wall is not pasted", () => {
    const p = scene();
    const clip = copyItems(p, ["D"]);
    assert.equal(clip.openings.length, 1);
    const added = pasteItems(p, clip, "L", 0, 0);
    assert.deepEqual(added, []);
    assert.equal(p.openings.length, 1);
  });

  test("copying nothing gives an empty clipboard centred at the origin", () => {
    const p = scene();
    const clip = copyItems(p, []);
    assert.deepEqual(clip.centre, [0, 0]);
    assert.deepEqual(pasteItems(p, clip, "L", 100, 100), []);
  });

  test("deleting a wall deletes its openings; grids can be deleted", () => {
    const p = scene();
    deleteItems(p, ["A", "G", "F"]);
    assert.deepEqual(p.walls.map((w) => w.id), ["B", "UA"]);
    assert.equal(p.openings.length, 0);
    assert.equal(p.grids.length, 0);
    assert.equal(p.furniture.length, 0);
    assert.equal(p.rooms.length, 2, "other items stay");
  });

  test("deleting only an opening keeps its wall", () => {
    const p = scene();
    deleteItems(p, ["D"]);
    assert.equal(p.openings.length, 0);
    assert.equal(p.walls.length, 3);
  });
});

// ================================================================ typed lengths
describe("parseLength", () => {
  test("plain numbers are millimetres", () => {
    assert.deepEqual(parseLength("3600"), { len: 3600, ang: null });
    assert.deepEqual(parseLength("  1250.5 "), { len: 1250.5, ang: null });
    assert.deepEqual(parseLength("3600mm"), { len: 3600, ang: null });
    assert.deepEqual(parseLength("-500"), { len: -500, ang: null });
    assert.deepEqual(parseLength(2400), { len: 2400, ang: null }, "numbers are accepted too");
  });

  test("metres, centimetres and a decimal comma", () => {
    assert.deepEqual(parseLength("3.6m"), { len: 3600, ang: null });
    assert.deepEqual(parseLength("3.6 M"), { len: 3600, ang: null });
    assert.deepEqual(parseLength("360cm"), { len: 3600, ang: null });
    assert.deepEqual(parseLength("3,6m"), { len: 3600, ang: null });
  });

  test("feet and inches", () => {
    near(parseLength("12'6\"").len, 3810, 1e-9);
    near(parseLength("12'6").len, 3810, 1e-9);
    near(parseLength("12'").len, 12 * 304.8, 1e-9);
    near(parseLength("12' 6.5\"").len, (144 + 6.5) * 25.4, 1e-9);
    near(parseLength("2 in").len, 50.8, 1e-9);
    near(parseLength("5\"").len, 127, 1e-9);
  });

  test("a length with an angle", () => {
    assert.deepEqual(parseLength("3600<90"), { len: 3600, ang: 90 });
    assert.deepEqual(parseLength("3.6m < -45"), { len: 3600, ang: -45 });
    assert.deepEqual(parseLength("1500<22.5"), { len: 1500, ang: 22.5 });
  });

  test("bad input gives null", () => {
    for (const bad of ["", null, undefined, "abc", "3600 km", "m", "<90", "1.2.3", "12'x", "--5"]) assert.equal(parseLength(bad), null, JSON.stringify(bad));
  });
});

// ================================================================ render helpers
describe("render helpers", () => {
  test("stairGeometry gives the outline of a rotated stair", () => {
    const g = stairGeometry({ x: 1000, y: 2000, length: 3000, width: 1000, rot: 90 });
    assert.equal(g.L, 3000);
    assert.equal(g.W, 1000);
    const xs = g.outline.map((p) => p[0]);
    const ys = g.outline.map((p) => p[1]);
    near(Math.min(...xs), 500); near(Math.max(...xs), 1500);
    near(Math.min(...ys), 500); near(Math.max(...ys), 3500);
    nearPt(g.P(1500, 0), [1000, 3500], 1e-9, "the top of the run");
    const flat = stairGeometry({ x: 0, y: 0, length: 3000, width: 1000 });
    assert.deepEqual(flat.outline, [[-1500, -500], [1500, -500], [1500, 500], [-1500, 500]]);
  });

  test("dimensionGeometry offsets the line along its left normal", () => {
    const g = dimensionGeometry({ x1: 0, y1: 0, x2: 4000, y2: 0, offset: 600 });
    assert.equal(g.L, 4000);
    assert.deepEqual([g.ux, g.uy, g.nx, g.ny], [1, 0, -0, 1]);
    assert.deepEqual(g.a, [0, 600]);
    assert.deepEqual(g.b, [4000, 600]);
    const v = dimensionGeometry({ x1: 0, y1: 0, x2: 0, y2: 3000, offset: -200 });
    nearPt(v.a, [200, 0]);
    const z = dimensionGeometry({ x1: 5, y1: 5, x2: 5, y2: 5 });
    assert.equal(z.L, 1, "a zero-length dimension does not divide by zero");
    assert.deepEqual(z.a, [5, 5]);
  });

  test("gridBubble sits beyond each end of the grid line", () => {
    const g = { x1: 0, y1: 0, x2: 0, y2: 8000 };
    assert.deepEqual(gridBubble(g, 0), [0, -380, 380]);
    assert.deepEqual(gridBubble(g, 1), [0, 8380, 380]);
    const h = { x1: 0, y1: 100, x2: 5000, y2: 100 };
    assert.deepEqual(gridBubble(h, 0), [-380, 100, 380]);
  });

  test("phaseVisible for every filter", () => {
    const table = {
      all: { existing: true, new: true, demolish: true },
      new: { existing: true, new: true, demolish: false },
      existing: { existing: true, new: false, demolish: true },
    };
    for (const [filter, row] of Object.entries(table)) {
      for (const [phase, want] of Object.entries(row)) assert.equal(phaseVisible({ phase }, filter), want, `${phase} under ${filter}`);
      assert.equal(phaseVisible({}, filter), row.new, `no phase counts as new under ${filter}`);
    }
    assert.equal(phaseVisible({ phase: "demolish" }), true, "the default filter is all");
  });

  test("planBounds covers a level, every level, or nothing", () => {
    const p = scene();
    const b = planBounds(p, "L");
    assert.ok(b.x1 <= -5500 && b.y1 <= -5200, "the column and stair stretch the box");
    assert.ok(b.x2 >= 30000, "the roof is included");
    const u = planBounds(p, "U");
    assert.deepEqual(u, { x1: -100, y1: -100, x2: 6100, y2: 100 });
    const all = planBounds(p);
    assert.deepEqual(all, b, "the upper level adds nothing new here");
    assert.equal(planBounds(base(), "L"), null);
    assert.equal(planBounds(p, "nope"), null);
  });

  test("planBounds includes circles by their radius and ignores non-finite points", () => {
    const p = base();
    p.drawings.push({ id: "c", level: "L", kind: "circle", cx: 0, cy: 0, r: 500 }, { id: "x", level: "L", kind: "polyline", pts: [[NaN, 5], [100, 100]] });
    assert.deepEqual(planBounds(p, "L"), { x1: -500, y1: -500, x2: 500, y2: 500 });
  });

  test("roomColor uses the room's colour, else its floor material", () => {
    assert.equal(roomColor({ color: "#123456", floor: "oak" }), "#123456");
    assert.equal(roomColor({ floor: "tile-white" }), "#e7e7e3");
    assert.equal(roomColor({}), "#c49a6c", "oak by default");
    assert.equal(roomColor({ floor: "no-such" }), "#c49a6c");
  });

  test("the dark and light plan themes define the same colours", () => {
    assert.deepEqual(Object.keys(PLAN_THEMES.dark).sort(), Object.keys(PLAN_THEMES.light).sort());
    for (const th of Object.values(PLAN_THEMES)) for (const v of Object.values(th)) assert.match(v, /^#[0-9a-f]{6}$/i);
  });
});

// ================================================================ drawing
describe("drawPlan", () => {
  const baseOpts = (level) => ({ level, lw: 10, px: 10, units: "mm", labels: { up: "UP" } });

  for (const { file } of sampleIndex) {
    test(`draws every level of ${file} in every wall style and phase filter`, () => {
      const p = loadSample(file);
      const issues = runCheck(p);
      // Give every level something existing and something to demolish.
      for (const lv of p.levels) {
        const ws = p.walls.filter((w) => w.level === lv.id);
        if (ws.length) ws[0].phase = "existing";
        if (ws.length > 1) ws[ws.length - 1].phase = "demolish";
        const rs = p.rooms.filter((r) => r.level === lv.id);
        if (rs.length) rs[0].phase = "existing";
      }
      for (const lv of p.levels) {
        for (const wallStyle of ["solid", "outline", "hatch"]) {
          for (const phase of ["all", "new", "existing"]) {
            const ctx = fakeCtx();
            const sel = new Set(p.walls.filter((w) => w.level === lv.id).slice(0, 2).map((w) => w.id));
            drawPlan(ctx, p, PLAN_THEMES.dark, { ...baseOpts(lv.id), wallStyle, phase, selected: sel, hover: p.rooms[0] && p.rooms[0].id, issues, view: { x1: -5000, y1: -5000, x2: 20000, y2: 20000 } });
            const on = (k) => (p[k] || []).filter((x) => x.level === lv.id).length;
            const items = on("walls") + on("rooms") + on("solids") + on("furniture");
            const many = phase === "existing" ? 0 : Math.min(10, items);
            assert.ok(ctx.calls.fill >= many, `${lv.name} ${wallStyle}/${phase}: fills`);
            assert.ok(ctx.calls.stroke >= many, `${lv.name} ${wallStyle}/${phase}: strokes`);
            const labelled = on("rooms") + on("solids") + on("dimensions") + on("texts") + p.grids.length;
            if (phase !== "existing" && labelled) assert.ok(ctx.calls.fillText > 0, `${lv.name} ${wallStyle}/${phase}: labels`);
            assert.equal(ctx.calls.save, ctx.calls.restore, "save and restore are balanced");
            if (wallStyle === "hatch" && on("walls")) assert.ok(ctx.calls.clip > 0, "the hatch is clipped to the walls");
          }
        }
        const print = fakeCtx();
        drawPlan(print, p, PLAN_THEMES.light, { ...baseOpts(lv.id), print: true, units: "ft", show: { areas: false, ghost: false } });
        assert.ok(print.calls.stroke > 0);
      }
    });
  }

  test("mass models: hit, selected, moved, scaled and drawn with their taper", () => {
    const p = scene();
    p.solids.push({ id: "SO", level: "L", name: "Tower", pts: [[40000, 0], [44000, 0], [44000, 4000], [40000, 4000]], z0: 0, height: 9000, taper: 0.5 });
    normalizeProject(p);
    assert.equal(kindOf(hit(p, 42000, 2000)), "solids");
    const h = hit(p, 44000, 4000, { selected: new Set(["SO"]) });
    assert.deepEqual([h.kind, h.handle], ["solids", 2]);
    assert.ok(boxSelect(p, "L", { x1: 39000, y1: -100, x2: 45000, y2: 4100 }).includes("SO"));
    assert.deepEqual(selectionCentre(p, ["SO"]), [42000, 2000]);
    moveItems(p, ["SO"], 1000, 0);
    assert.deepEqual(p.solids[0].pts[0], [41000, 0]);
    scaleItems(p, ["SO"], 2);
    assert.equal(p.solids[0].height, 18000);
    assert.deepEqual(p.solids[0].pts[0], [39000, -2000]);
    const ctx = fakeCtx();
    drawPlan(ctx, p, PLAN_THEMES.dark, { level: "L", lw: 10, px: 10, selected: new Set(["SO"]) });
    assert.ok(ctx.calls.setLineDash > 0);
    const hidden = fakeCtx();
    drawPlan(hidden, p, PLAN_THEMES.dark, { level: "L", lw: 10, px: 10, show: { solids: false } });
    assert.ok(hidden.calls.fill < ctx.calls.fill, "show.solids: false leaves them out");
    const b = planBounds(p, "L");
    assert.ok(b.x2 >= 47000, "plan bounds include mass models");
    const clip = copyItems(p, ["SO"]);
    const added = pasteItems(p, clip, "U", 0, 0);
    assert.equal(p.solids.find((s) => s.id === added[0]).level, "U");
    deleteItems(p, ["SO"]);
    assert.equal(p.solids.length, 1);
  });

  test("grids are drawn on every level and can be hidden", () => {
    const p = scene();
    const on = fakeCtx();
    drawPlan(on, p, PLAN_THEMES.dark, { level: "U", lw: 10, px: 10 });
    const off = fakeCtx();
    drawPlan(off, p, PLAN_THEMES.dark, { level: "U", lw: 10, px: 10, show: { grids: false } });
    assert.equal((on.calls.arc || 0) - (off.calls.arc || 0), 2, "two bubbles");
    assert.equal((on.calls.fillText || 0) - (off.calls.fillText || 0), 2, "two grid labels");
  });

  test("drawPlan draws every kind of item of the test scene", () => {
    const p = scene();
    p.walls.push({ id: "X", level: "L", x1: 0, y1: 4000, x2: 6000, y2: 4000, thickness: 300, type: "ext-brick-300", phase: "existing" });
    p.walls.push({ id: "Y", level: "L", x1: 0, y1: 0, x2: 0, y2: 4000, thickness: 200, phase: "demolish" });
    p.openings.push(
      { id: "W1", wall: "B", kind: "window", at: 1000, width: 1200, type: "sliding" },
      { id: "D2", wall: "B", kind: "door", at: 2500, width: 1600, type: "double" },
      { id: "D3", wall: "X", kind: "door", at: 1500, width: 900, hinge: "end", side: -1 },
      { id: "D4", wall: "X", kind: "door", at: 3000, width: 900, type: "sliding" },
      { id: "D5", wall: "X", kind: "door", at: 4800, width: 2400, type: "garage" },
      { id: "O1", wall: "Y", kind: "opening", at: 2000, width: 1000 },
    );
    p.columns.push({ id: "C2", level: "L", x: 1000, y: 1000, w: 300, shape: "round" });
    p.furniture.push({ id: "M", level: "L", kind: "model", model: "m1", x: 2000, y: 3000, w: 500, d: 500, h: 500 });
    p.texts.push({ id: "T2", level: "L", x: 0, y: 6000, text: "two\nlines", size: 200, align: "center", color: "#ff0000" });
    p.layers.push({ id: "hidden", name: "hidden", visible: false, color: "#000000" });
    normalizeProject(p);
    const ctx = fakeCtx();
    drawPlan(ctx, p, PLAN_THEMES.light, { level: "L", lw: 2, px: 2, selected: new Set(["A", "R", "F", "C", "S", "RF", "UL", "ARC", "PL", "D", "T"]), hover: "B", wallStyle: "solid", models: new Map([["m1", { name: "Chair", outline: [[-0.5, -0.5], [0.5, -0.5], [0, 0.5]] }]]) });
    assert.ok(ctx.calls.ellipse > 0, "round column");
    assert.ok(ctx.calls.arc > 0, "door swings, circles");
    assert.ok(ctx.calls.strokeRect > 0, "model box and underlay selection");
    assert.ok(ctx.calls.fillText >= 6, "texts, room labels, tags");
  });

  test("drawWalls returns the outlines and the solid pieces", () => {
    const p = scene();
    const ctx = fakeCtx();
    const walls = p.walls.filter((w) => w.level === "L");
    const { outlines, pieces } = drawWalls(ctx, p, walls, PLAN_THEMES.dark, { lw: 10 });
    assert.equal(outlines.size, 2);
    assert.equal(pieces.length, 3, "the door splits wall A");
    const ref = wallOutlines(walls, { draw: true });
    assert.deepEqual(outlines.get("A").poly, ref.get("A").poly);
  });

  test("a sample plan renders to well-formed SVG through SvgContext", () => {
    const file = sampleIndex[1].file;
    const p = loadSample(file);
    const lv = p.levels[0].id;
    const b = planBounds(p, lv);
    const scale = 0.1;
    const svg = new SvgContext((b.x2 - b.x1) * scale + 40, (b.y2 - b.y1) * scale + 40);
    svg.setTransform(scale, 0, 0, scale, 20 - b.x1 * scale, 20 - b.y1 * scale);
    drawPlan(svg, p, PLAN_THEMES.light, { level: lv, lw: 10, px: 10, print: true, wallStyle: "solid" });
    const out = svg.toString("#ffffff");
    assert.ok(out.startsWith("<svg xmlns=\"http://www.w3.org/2000/svg\""));
    assert.ok(out.endsWith("</svg>"));
    const paths = out.match(/<path /g) || [];
    assert.ok(paths.length > 100, `${paths.length} paths`);
    assert.equal((out.match(/<text /g) || []).length, (out.match(/<\/text>/g) || []).length, "text elements are closed");
    for (const r of p.rooms.filter((x) => x.level === lv)) assert.ok(out.includes(`>${r.name}</text>`), `room name ${r.name}`);
    assert.ok(!/NaN|undefined|Infinity/.test(out), "no broken numbers");
    assert.ok(out.includes('<rect width="100%" height="100%" fill="#ffffff"/>'));
    // Every path's d attribute starts with a move.
    for (const m of out.matchAll(/<path d="([^"]*)"/g)) assert.match(m[1], /^M/);
  });

  test("SvgContext escapes text and keeps the transform stack", () => {
    const svg = new SvgContext(100, 100);
    svg.save();
    svg.translate(10, 20);
    svg.font = "600 12px \"Segoe UI\", sans-serif";
    svg.fillText("a < b & \"c\"", 0, 0);
    svg.restore();
    svg.beginPath();
    svg.moveTo(0, 0);
    svg.lineTo(10, 0);
    svg.stroke();
    const out = svg.toString();
    assert.ok(out.includes("a &lt; b &amp; &quot;c&quot;"));
    assert.ok(out.includes("matrix(1 0 0 1 10 20)"));
    assert.ok(out.includes('d="M0 0L10 0"'), "the path after restore is untransformed");
    assert.deepEqual(svg.getTransform(), { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  });
});
