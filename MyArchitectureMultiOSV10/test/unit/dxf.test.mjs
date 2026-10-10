// Unit tests for DXF import/export (src/io/dxf.js) and SVG import
// (src/io/svgimport.js). Run: node --test test/unit/dxf.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { importDxf, exportDxf, DXF_LAYERS, stripMtext, guessUnits } from "../../src/io/dxf.js";
import { importSvg } from "../../src/io/svgimport.js";
import { newProject, normalizeProject, wallTypeOf } from "../../src/core/project.js";
import { wallOutlines, wallPieces } from "../../src/core/walls.js";
import { makeFurniture, furnitureParts } from "../../src/lib/furniture.js";

// ---------------------------------------------------------------- helpers

const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a} (tol ${tol})`);
const nearPt = (p, q, tol = 1e-6, msg = "") => { near(p[0], q[0], tol, `${msg} x`); near(p[1], q[1], tol, `${msg} y`); };
const hasPt = (pts, q, tol = 1e-6) => pts.some((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol);

// A DXF document from {header, tables, blocks, entities}: each a list of
// records ["TYPE", [[code, value], …]] (header: [[code, value], …]).
function dxfDoc({ header = [], tables = [], blocks = [], entities = [] } = {}) {
  const out = [];
  const g = (c, v) => out.push(String(c), String(v));
  const recs = (list) => { for (const [type, tags] of list) { g(0, type); for (const [c, v] of tags) g(c, v); } };
  if (header.length) { g(0, "SECTION"); g(2, "HEADER"); for (const [c, v] of header) g(c, v); g(0, "ENDSEC"); }
  if (tables.length) { g(0, "SECTION"); g(2, "TABLES"); recs(tables); g(0, "ENDSEC"); }
  if (blocks.length) { g(0, "SECTION"); g(2, "BLOCKS"); recs(blocks); g(0, "ENDSEC"); }
  g(0, "SECTION"); g(2, "ENTITIES"); recs(entities); g(0, "ENDSEC");
  g(0, "EOF");
  return out.join("\r\n") + "\r\n";
}
const line = (x1, y1, x2, y2, layer = "0", extra = []) => ["LINE", [[8, layer], ...extra, [10, x1], [20, y1], [30, 0], [11, x2], [21, y2], [31, 0]]];

// Point on a plan arc as canvas draws ctx.arc(cx, cy, r, a1°, a2°, ccw), t ∈ [0, 1].
function arcAt(d, t) {
  const TAU = Math.PI * 2;
  const a1 = (d.a1 * Math.PI) / 180, a2 = (d.a2 * Math.PI) / 180;
  const raw = d.ccw ? a1 - a2 : a2 - a1;
  const span = raw >= TAU ? TAU : ((raw % TAU) + TAU) % TAU;
  const a = a1 + (d.ccw ? -span : span) * t;
  return [d.cx + d.r * Math.cos(a), d.cy + d.r * Math.sin(a)];
}

// Same set of points on both arcs: the two ends (either order) and the middle.
function assertSameArc(a, b, tol = 1e-3) {
  nearPt([a.cx, a.cy], [b.cx, b.cy], tol, "centre");
  near(a.r, b.r, tol, "radius");
  const ends = [arcAt(b, 0), arcAt(b, 1)];
  for (const q of [arcAt(a, 0), arcAt(a, 1)]) assert.ok(hasPt(ends, q, tol), `arc end ${q} not found in ${JSON.stringify(ends)}`);
  nearPt(arcAt(a, 0.5), arcAt(b, 0.5), tol, "arc midpoint");
  // The quarter point matches the other arc's quarter or three-quarter point
  // (the two may be drawn in opposite directions).
  assert.ok(hasPt([arcAt(b, 0.25), arcAt(b, 0.75)], arcAt(a, 0.25), tol), "arc quarter point");
}

function boundsOf(drawings) {
  let b = null;
  for (const d of drawings) {
    const pts = d.kind === "circle" ? [[d.cx - d.r, d.cy - d.r], [d.cx + d.r, d.cy + d.r]] : d.kind === "arc" ? Array.from({ length: 33 }, (_, i) => arcAt(d, i / 32)) : d.pts;
    for (const [x, y] of pts) {
      if (!b) b = { x1: x, y1: y, x2: x, y2: y };
      b = { x1: Math.min(b.x1, x), y1: Math.min(b.y1, y), x2: Math.max(b.x2, x), y2: Math.max(b.y2, y) };
    }
  }
  return b;
}

// A one-room house with every kind of plan item.
function sampleProject() {
  const p = normalizeProject(newProject("DXF test"));
  const L = p.view.level;
  const wall = (id, x1, y1, x2, y2) => ({ id, level: L, x1, y1, x2, y2, thickness: 200, height: null });
  p.walls.push(wall("w1", 0, 0, 6000, 0), wall("w2", 6000, 0, 6000, 4000), wall("w3", 6000, 4000, 0, 4000), wall("w4", 0, 4000, 0, 0));
  p.openings.push({ id: "d1", wall: "w1", kind: "door", at: 1500, width: 900, height: 2100, hinge: "start", side: 1, type: "single" });
  p.openings.push({ id: "n1", wall: "w3", kind: "window", at: 3000, width: 1200, height: 1200, sill: 900, type: "casement" });
  p.rooms.push({ id: "r1", level: L, name: "거실", pts: [[100, 100], [5900, 100], [5900, 3900], [100, 3900]] });
  p.furniture.push({ id: "f1", level: L, ...makeFurniture("sofa3", 3000, 2000) });
  p.dimensions.push({ id: "m1", level: L, x1: 0, y1: 0, x2: 6000, y2: 0, offset: -800 });
  p.stairs.push({ id: "s1", level: L, x: 1500, y: 2500, rot: 0, width: 1000, length: 2400, steps: 12 });
  p.texts.push({ id: "t1", level: L, x: 500, y: 500, text: "Hello", size: 300, rot: 0, align: "left" });
  p.texts.push({ id: "t2", level: L, x: 4000, y: 3000, text: "Turned", size: 200, rot: 30, align: "left" });
  p.drawings.push({ id: "g1", level: L, layer: "0", kind: "arc", cx: 3000, cy: 2000, r: 500, a1: 30, a2: 120, ccw: false });
  p.drawings.push({ id: "g2", level: L, layer: "0", kind: "arc", cx: 1000, cy: 1000, r: 300, a1: 200, a2: 10, ccw: true });
  return normalizeProject(p);
}

// ================================================================ round trip

test("Exporting a project and importing it back keeps every semantic layer", () => {
  const p = sampleProject();
  const text = exportDxf(p);
  const r = importDxf(text, { level: p.view.level });
  const byLayer = (name) => r.drawings.filter((d) => d.layer === name);
  const textsOn = (name) => r.texts.filter((t) => t.layer === name);

  const outlines = wallOutlines(p.walls, { draw: false });
  const pieces = p.walls.reduce((n, w) => n + wallPieces(p, w, outlines.get(w.id).poly).length, 0);
  assert.equal(pieces, 6);
  assert.equal(byLayer("A-WALL").length, pieces);
  assert.ok(byLayer("A-WALL").every((d) => d.kind === "polyline" && d.closed));

  assert.equal(byLayer("A-DOOR").filter((d) => d.kind === "arc").length, 1, "door swing");
  assert.equal(byLayer("A-DOOR").filter((d) => d.kind === "polyline").length, 1, "door leaf");
  assert.equal(byLayer("A-GLAZ").length, 4, "window lines");
  assert.deepEqual(textsOn("A-DOOR").map((t) => t.text), ["D01"]);
  assert.deepEqual(textsOn("A-GLAZ").map((t) => t.text), ["W01"]);
  assert.equal(byLayer("A-AREA").length, 1);
  assert.equal(byLayer("A-AREA")[0].pts.length, 4);
  assert.equal(byLayer("A-FURN").length, furnitureParts(p.furniture[0]).length);
  assert.equal(byLayer("A-FLOR-STRS").length, 1 + 11 + 1 + 1 + 1, "outline, treads, walking line, arrow, start dot");
  assert.deepEqual(textsOn("A-FLOR-STRS").map((t) => t.text), ["UP"]);
  assert.equal(byLayer("A-ANNO-DIMS").length, 5, "two extension lines, the dimension line and two ticks");
  assert.deepEqual(textsOn("A-ANNO-DIMS").map((t) => t.text), ["6000"]);
  assert.deepEqual(textsOn("A-ANNO-TEXT").map((t) => t.text).sort(), ["Hello", "Turned"]);
  assert.equal(byLayer("0").length, 2);
  assert.equal(r.units, "mm");
  assert.equal(r.scale, 1);
  assert.deepEqual(r.warnings, []);
  const used = ["A-WALL", "A-DOOR", "A-GLAZ", "A-AREA", "A-AREA-IDEN", "A-FURN", "A-FLOR-STRS", "A-ANNO-DIMS", "A-ANNO-TEXT"];
  for (const name of used) {
    assert.ok(DXF_LAYERS.some((l) => l.name === name), `${name} is a semantic layer`);
    assert.ok(r.layers.some((x) => x.id === name), `layer ${name} imported`);
  }
});

test("Korean room names survive the round trip as \\U+ escapes in pure ASCII", () => {
  const p = sampleProject();
  const text = exportDxf(p);
  assert.ok(!/[^\x00-\x7f]/.test(text), "the DXF file is plain ASCII");
  assert.ok(text.includes("\\U+AC70\\U+C2E4"), "거실 is written as \\U+AC70\\U+C2E4");
  const r = importDxf(text);
  const name = r.texts.find((t) => t.text === "거실");
  assert.ok(name, "room name imported");
  assert.equal(name.layer, "A-AREA-IDEN");
  assert.equal(name.align, "center");
  near(name.size, 250, 1e-6);
  // Centred on the label point, middle-aligned 0.45 · size above it.
  near(name.x, 3000, 1e-3);
  near(name.y + name.size / 2, 2000 - 250 * 0.45, 1e-3);
  const area = r.texts.find((t) => t.layer === "A-AREA-IDEN" && t !== name);
  assert.equal(area.text, "22.04 m²");
});

test("Imported wall outlines span the wall extents within one millimetre", () => {
  const p = sampleProject();
  const r = importDxf(exportDxf(p));
  const b = boundsOf(r.drawings.filter((d) => d.layer === "A-WALL"));
  near(b.x1, -100, 1); near(b.y1, -100, 1); near(b.x2, 6100, 1); near(b.y2, 4100, 1);
  assert.ok(r.bounds.x1 <= b.x1 && r.bounds.y1 <= b.y1 && r.bounds.x2 >= b.x2 && r.bounds.y2 >= b.y2);
  // The extension lines reach 120 mm past the dimension line 800 mm above the wall.
  near(boundsOf(r.drawings.filter((d) => d.layer === "A-ANNO-DIMS")).y1, -800 - 120, 1);
});

test("Arcs keep their orientation through export and import", () => {
  const p = sampleProject();
  const r = importDxf(exportDxf(p));
  const arcs = r.drawings.filter((d) => d.layer === "0");
  for (const id of ["g1", "g2"]) {
    const orig = p.drawings.find((d) => d.id === id);
    const back = arcs.find((d) => Math.abs(d.cx - orig.cx) < 1e-6 && Math.abs(d.cy - orig.cy) < 1e-6);
    assert.ok(back && back.kind === "arc", `arc ${id} imported`);
    assertSameArc(orig, back);
  }
});

test("Texts come back at the same top-left anchor, size and rotation", () => {
  const p = sampleProject();
  const r = importDxf(exportDxf(p));
  const hello = r.texts.find((t) => t.text === "Hello");
  nearPt([hello.x, hello.y], [500, 500]);
  near(hello.size, 300);
  assert.equal(hello.rot, 0);
  assert.equal(hello.align, "left");
  const turned = r.texts.find((t) => t.text === "Turned");
  nearPt([turned.x, turned.y], [4000, 3000]);
  near(turned.rot, 30, 1e-9);
});

test("Percent signs and multi-line texts survive the round trip", () => {
  const p = sampleProject();
  p.texts = [{ id: "t5", level: p.view.level, x: 0, y: 0, text: "100%% sure\n50% °", size: 200, rot: 90, align: "right" }];
  const text = exportDxf(p);
  assert.ok(text.includes("100%%%%%% sure"), "a literal %% is escaped as %%%%%%");
  const r = importDxf(text);
  const lines = r.texts.filter((t) => t.layer === "A-ANNO-TEXT");
  assert.deepEqual(lines.map((t) => t.text), ["100%% sure", "50% °"]);
  // The second line sits one line pitch (1.25 · size) "below" along the rotated text.
  nearPt([lines[1].x, lines[1].y], [-250, 0], 1e-6);
  assert.ok(lines.every((t) => t.align === "right" && Math.abs(t.rot - 90) < 1e-9));
});

test("The door swing arc ends at the open leaf tip and the closed position", () => {
  const p = sampleProject();
  const r = importDxf(exportDxf(p));
  const swing = r.drawings.find((d) => d.layer === "A-DOOR" && d.kind === "arc");
  const leaf = r.drawings.find((d) => d.layer === "A-DOOR" && d.kind === "polyline");
  // Hinge at u = 1050 on the wall face v = +100 (left of w1 is +y), leaf 900 long.
  nearPt([swing.cx, swing.cy], [1050, 100], 1e-6);
  near(swing.r, 900, 1e-6);
  const ends = [arcAt(swing, 0), arcAt(swing, 1)];
  assert.ok(hasPt(ends, [1050, 1000], 1e-3), "open tip");
  assert.ok(hasPt(ends, [1950, 100], 1e-3), "closed position");
  assert.ok(hasPt(leaf.pts, [1050, 1000], 1e-6));
  const mid = arcAt(swing, 0.5);
  assert.ok(mid[0] > 1050 && mid[1] > 100, "the swing bulges into the room");
});

test("The exported file is R12 with header, tables, entities and EOF", () => {
  const p = sampleProject();
  p.roofs.push({ id: "rf", level: p.view.level, kind: "hip", pts: [[0, 0], [6000, 0], [6000, 4000], [0, 4000]], pitch: 30, overhang: 400, thickness: 200 });
  p.columns.push({ id: "c1", level: p.view.level, x: 3000, y: 1000, w: 400, d: 400, rot: 0, shape: "round" });
  const text = exportDxf(normalizeProject(p));
  const lines = text.split("\n");
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([+lines[i], lines[i + 1]]);
  const idx = (c, v) => pairs.findIndex(([a, b]) => a === c && b === v);
  assert.equal(pairs[idx(9, "$ACADVER") + 1][1], "AC1009");
  assert.equal(pairs[idx(9, "$INSUNITS") + 1][1], "4");
  assert.equal(pairs[idx(9, "$MEASUREMENT") + 1][1], "1");
  for (const name of ["CONTINUOUS", "DASHED", "HIDDEN"]) assert.ok(idx(2, name) > 0, `linetype ${name}`);
  assert.ok(idx(2, "STANDARD") > 0);
  for (const s of ["HEADER", "TABLES", "BLOCKS", "ENTITIES"]) assert.ok(idx(2, s) > 0, `section ${s}`);
  assert.deepEqual(pairs[pairs.length - 1], [0, "EOF"]);
  assert.ok(idx(0, "LWPOLYLINE") < 0, "R12 has no LWPOLYLINE");
  const roofLayer = pairs.findIndex(([c, v], i) => c === 2 && v === "A-ROOF" && pairs[i - 1][1] === "LAYER");
  assert.ok(pairs.slice(roofLayer, roofLayer + 6).some(([c, v]) => c === 6 && v === "DASHED"), "roof layer is dashed");
  const r = importDxf(text);
  assert.equal(r.drawings.filter((d) => d.layer === "A-ROOF").length, 1 + 5, "outline + ridge + four hips");
  assert.equal(r.drawings.filter((d) => d.layer === "A-COLS" && d.kind === "circle").length, 1);
  // The header extents (y-up) contain all geometry.
  const ext = (name) => [+pairs[idx(9, name) + 1][1], +pairs[idx(9, name) + 2][1]];
  const b = boundsOf(r.drawings);
  const [x1, y1] = ext("$EXTMIN"), [x2, y2] = ext("$EXTMAX");
  assert.ok(x1 <= b.x1 + 1e-3 && x2 >= b.x2 - 1e-3 && y1 <= -b.y2 + 1e-3 && y2 >= -b.y1 - 1e-3, "extents contain the drawing");
  near(x1, b.x1, 1e-3, "the left edge is the roof overhang");
  assert.ok(r.counts.POLYLINE > 0 && r.counts.LINE > 0 && r.counts.ARC > 0 && r.counts.CIRCLE > 0 && r.counts.TEXT > 0);
});

// Typed and phased walls, a mass model and a structural grid.
function bimProject() {
  const p = normalizeProject(newProject("BIM"));
  const L = p.view.level;
  const wall = (id, x1, y1, x2, y2, extra) => ({ id, level: L, x1, y1, x2, y2, thickness: 200, ...extra });
  p.walls.push(
    wall("w1", 0, 0, 6000, 0, { type: "ext-brick-300" }),
    wall("w2", 6000, 0, 6000, 4000, { type: "int-block-150" }),
    wall("w3", 6000, 4000, 0, 4000, { phase: "demolish" }),
    wall("w4", 0, 4000, 0, 0, { type: "concrete-200", phase: "existing" }),
  );
  p.openings.push({ id: "d1", wall: "w1", kind: "door", at: 1500, width: 900 });
  p.openings.push({ id: "n1", wall: "w2", kind: "window", at: 2000, width: 1200, phase: "demolish" });
  p.solids.push({ id: "s1", level: L, pts: [[10000, 0], [12000, 0], [12000, 1000], [10000, 1000]], height: 3000 });
  p.grids.push({ id: "gA", x1: 0, y1: -2000, x2: 0, y2: 6000, label: "A" }, { id: "g1", x1: -2000, y1: 0, x2: 8000, y2: 0, label: "1" });
  return normalizeProject(p);
}

test("Typed walls get one layer boundary line per inner layer and piece on A-WALL-PATT", () => {
  const p = bimProject();
  const r = importDxf(exportDxf(p));
  const outlines = wallOutlines(p.walls, { draw: false });
  let expected = 0;
  for (const w of p.walls) {
    const wt = wallTypeOf(p, w);
    if (wt) expected += (wt.layers.length - 1) * wallPieces(p, w, outlines.get(w.id).poly).length;
  }
  assert.equal(expected, 3 * 2 + 2 * 2 + 0, "brick wall: 3 lines × 2 pieces; block wall: 2 × 2; concrete: none");
  const patt = r.drawings.filter((d) => d.layer === "A-WALL-PATT");
  assert.equal(patt.length, expected);
  // w1 runs along +x, so its left face is y = +150: boundaries after 100, 180 and 280 mm.
  const ys = [...new Set(patt.filter((d) => d.pts[0][1] === d.pts[1][1] && d.pts[0][0] < 6000 && d.pts[1][0] < 6000).map((d) => d.pts[0][1]))].sort((a, b) => a - b);
  assert.deepEqual(ys, [-130, -30, 50]);
  // Every boundary line stays inside the wall outline (no overshoot past the mitres or the door).
  for (const d of patt.filter((x) => x.pts[0][1] === 50)) for (const [x] of d.pts) assert.ok(x >= -150 - 1e-6 && x <= 6150 + 1e-6 && (x <= 1050 + 1e-6 || x >= 1950 - 1e-6));
});

test("Wall and opening phases select the existing and demolition layers", () => {
  const r = importDxf(exportDxf(bimProject()));
  const on = (name) => r.drawings.filter((d) => d.layer === name);
  assert.equal(on("A-WALL-DEMO").length, 1, "the demolished wall");
  assert.equal(on("A-WALL-EXST").length, 1, "the existing wall");
  assert.equal(on("A-WALL").length, 2 + 2, "the door and window walls, two pieces each");
  assert.equal(on("A-GLAZ-DEMO").length, 4, "demolished window lines");
  assert.equal(on("A-GLAZ").length, 0);
  assert.equal(on("A-DOOR").length, 2, "the new door keeps A-DOOR");
  assert.deepEqual(r.texts.filter((t) => t.layer === "A-GLAZ-DEMO").map((t) => t.text), ["W01"]);
  assert.equal(r.layers.find((l) => l.id === "A-WALL-DEMO").visible, true);
});

test("Mass models export their outline and height on A-MASS", () => {
  const r = importDxf(exportDxf(bimProject()));
  const [mass] = r.drawings.filter((d) => d.layer === "A-MASS");
  assert.equal(mass.closed, true);
  let area = 0;
  mass.pts.forEach(([x1, y1], i) => { const [x2, y2] = mass.pts[(i + 1) % mass.pts.length]; area += x1 * y2 - x2 * y1; });
  near(Math.abs(area) / 2, 2e6, 1e-6);
  const label = r.texts.find((t) => t.layer === "A-MASS");
  assert.equal(label.text, "H=3000");
  near(label.size, 180);
  nearPt([label.x, label.y + label.size / 2], [11000, 500], 1e-6);
});

test("Structural grids export a centre line with labelled bubbles on every level", () => {
  const p = bimProject();
  p.levels.push({ id: "lv2", name: "2F", elevation: 3000, height: 2800, slab: 200 });
  normalizeProject(p);
  const text = exportDxf(p, { level: "lv2" });
  const r = importDxf(text);
  const lines = r.drawings.filter((d) => d.layer === "S-GRID");
  assert.equal(lines.length, 2);
  assert.ok(lines.some((d) => d.pts[0][0] === 0 && d.pts[0][1] === -2000 && d.pts[1][1] === 6000));
  const bubbles = r.drawings.filter((d) => d.layer === "S-GRID-IDEN");
  assert.equal(bubbles.length, 4);
  assert.ok(bubbles.every((b) => b.kind === "circle" && b.r === 380));
  for (const c of [[0, -2380], [0, 6380], [-2380, 0], [8380, 0]]) assert.ok(hasPt(bubbles.map((b) => [b.cx, b.cy]), c), `bubble at ${c}`);
  const labels = r.texts.filter((t) => t.layer === "S-GRID-IDEN");
  assert.deepEqual(labels.map((t) => t.text).sort(), ["1", "1", "A", "A"]);
  for (const t of labels) {
    assert.equal(t.align, "center");
    near(t.size, 300);
    assert.ok(hasPt(bubbles.map((b) => [b.cx, b.cy]), [t.x, t.y + 150], 1e-6), "label centred in its bubble");
  }
  // CENTER (dash-dot) linetype is defined and used by the grid layer.
  assert.match(text, /\n  2\nCENTER\n 70\n0\n  3\n[^\n]*\n 72\n65\n 73\n4\n/);
  assert.match(text, /\n  2\nS-GRID\n 70\n0\n 62\n-?\d+\n  6\nCENTER\n/);
  assert.equal(r.drawings.filter((d) => d.layer.startsWith("A-")).length, 0, "nothing else is on the empty level");
});

test("Only the requested level is exported", () => {
  const p = sampleProject();
  const up = { id: "lv2", name: "2F", elevation: 3000, height: 2800, slab: 200 };
  p.levels.push(up);
  p.texts.push({ id: "t9", level: "lv2", x: 0, y: 0, text: "Upstairs", size: 300, rot: 0 });
  normalizeProject(p);
  assert.ok(!importDxf(exportDxf(p)).texts.some((t) => t.text === "Upstairs"));
  const r2 = importDxf(exportDxf(p, { level: "lv2" }));
  assert.deepEqual(r2.texts.map((t) => t.text), ["Upstairs"]);
  assert.equal(r2.drawings.length, 0);
});

test("Project drawing layers keep their name, colour and visibility", () => {
  const p = sampleProject();
  p.layers.push({ id: "L2", name: "Site β", color: "#ff0000", visible: false });
  p.drawings.push({ id: "g7", level: p.view.level, layer: "L2", kind: "polyline", pts: [[0, 0], [10, 0], [10, 10]], closed: true, color: "#00ff00" });
  p.drawings.push({ id: "g8", level: p.view.level, layer: "L2", kind: "circle", cx: 5, cy: 5, r: 3 });
  const r = importDxf(exportDxf(p));
  assert.deepEqual(r.layers.find((l) => l.id === "Site β"), { id: "Site β", name: "Site β", color: "#ff0000", visible: false });
  const [poly, circle] = r.drawings.filter((d) => d.layer === "Site β");
  assert.deepEqual(poly.pts, [[0, 0], [10, 0], [10, 10]]);
  assert.equal(poly.closed, true);
  assert.equal(poly.color, "#00ff00");
  assert.deepEqual([circle.kind, circle.cx, circle.cy, circle.r, circle.color], ["circle", 5, 5, 3, undefined]);
});

// ================================================================ hand-written DXF

test("An LWPOLYLINE bulge of 1 becomes a semicircle through the expected midpoint", () => {
  const text = dxfDoc({ entities: [["LWPOLYLINE", [[8, "P"], [90, 2], [70, 0], [10, 0], [20, 0], [42, 1], [10, 10], [20, 0]]]] });
  const r = importDxf(text, { units: "mm" });
  const d = r.drawings[0];
  assert.equal(d.kind, "polyline");
  assert.equal(d.closed, false);
  nearPt(d.pts[0], [0, 0]);
  nearPt(d.pts[d.pts.length - 1], [10, 0]);
  // Counter-clockwise in y-up from (0,0) to (10,0) passes (5,-5); flipped → (5, 5).
  assert.ok(hasPt(d.pts, [5, 5], 1e-3), "semicircle midpoint");
  for (const q of d.pts) near(Math.hypot(q[0] - 5, q[1]), 5, 1e-3, "on the circle");
});

test("A closed LWPOLYLINE keeps its closed flag without repeating the first vertex", () => {
  const text = dxfDoc({ entities: [["LWPOLYLINE", [[8, "P"], [90, 4], [70, 1], [10, 0], [20, 0], [10, 10], [20, 0], [10, 10], [20, 10], [10, 0], [20, 10]]]] });
  const d = importDxf(text, { units: "mm" }).drawings[0];
  assert.equal(d.closed, true);
  assert.deepEqual(d.pts, [[0, 0], [10, 0], [10, -10], [0, -10]]);
});

test("An old-style POLYLINE with VERTEX records and a bulge is read", () => {
  const v = (x, y, b = 0) => ["VERTEX", [[8, "P"], [10, x], [20, y], [30, 0], [42, b]]];
  const text = dxfDoc({ entities: [["POLYLINE", [[8, "P"], [66, 1], [10, 0], [20, 0], [30, 0], [70, 1]]], v(0, 0), v(10, 0, 1), v(10, 10), v(0, 10), ["SEQEND", [[8, "P"]]]] });
  const r = importDxf(text, { units: "mm" });
  assert.equal(r.counts.POLYLINE, 1);
  assert.equal(r.drawings.length, 1);
  const d = r.drawings[0];
  assert.equal(d.closed, true);
  // The bulged edge from (10,0) to (10,10) bows out to x = 15.
  assert.ok(hasPt(d.pts, [15, -5], 1e-3));
});

test("An INSERT rotated 90 degrees and scaled 2 maps block geometry through its base point", () => {
  const text = dxfDoc({
    blocks: [["BLOCK", [[8, "0"], [2, "B"], [70, 0], [10, 1], [20, 1], [30, 0], [3, "B"]]], line(1, 1, 3, 1), ["ENDBLK", [[8, "0"]]]],
    entities: [["INSERT", [[8, "0"], [2, "B"], [10, 10], [20, 10], [30, 0], [41, 2], [42, 2], [43, 1], [50, 90]]]],
  });
  const r = importDxf(text, { units: "mm" });
  assert.equal(r.drawings.length, 1);
  const [a, b] = r.drawings[0].pts;
  // (1,1)-(3,1) → base-relative (0,0)-(2,0) → ×2 → (0,0)-(4,0) → 90° → (0,0)-(0,4) → +(10,10).
  nearPt(a, [10, -10], 1e-9);
  nearPt(b, [10, -14], 1e-9);
  assert.equal(r.counts.INSERT, 1);
});

test("Mirrored, arrayed and nested INSERTs are expanded", () => {
  const text = dxfDoc({
    blocks: [
      ["BLOCK", [[8, "0"], [2, "B"], [70, 0], [10, 1], [20, 1], [30, 0]]], line(1, 1, 3, 1), ["ENDBLK", [[8, "0"]]],
      ["BLOCK", [[8, "0"], [2, "OUTER"], [70, 0], [10, 0], [20, 0], [30, 0]]], ["INSERT", [[8, "0"], [2, "B"], [10, 0], [20, 0], [30, 0]]], ["ENDBLK", [[8, "0"]]],
    ],
    entities: [
      ["INSERT", [[8, "0"], [2, "B"], [10, 10], [20, 10], [30, 0], [41, -1]]],
      ["INSERT", [[8, "0"], [2, "B"], [10, 0], [20, 50], [30, 0], [70, 3], [71, 2], [44, 5], [45, 7]]],
      ["INSERT", [[8, "0"], [2, "OUTER"], [10, 100], [20, 0], [30, 0]]],
    ],
  });
  const r = importDxf(text, { units: "mm" });
  assert.equal(r.drawings.length, 1 + 6 + 1);
  assert.deepEqual(r.drawings[0].pts, [[10, -10], [8, -10]], "x scale −1 mirrors");
  const grid = r.drawings.slice(1, 7).map((d) => d.pts[0]);
  for (const c of [0, 1, 2]) for (const row of [0, 1]) assert.ok(hasPt(grid, [c * 5, -(50 + row * 7)]), `array cell ${c},${row}`);
  assert.deepEqual(r.drawings[7].pts, [[100, 0], [102, 0]], "nested block");
});

test("A DXF ARC maps to a1 = -start, a2 = -end, ccw = true and keeps its points", () => {
  const text = dxfDoc({ entities: [["ARC", [[8, "A"], [10, 0], [20, 0], [30, 0], [40, 10], [50, 0], [51, 90]]]] });
  const d = importDxf(text, { units: "mm" }).drawings[0];
  assert.equal(d.kind, "arc");
  assert.equal(d.a1, 0);
  assert.equal(d.a2, -90);
  assert.equal(d.ccw, true);
  // In y-up the arc runs from (10,0) through (7.07,7.07) to (0,10); flipped:
  nearPt(arcAt(d, 0), [10, 0], 1e-9);
  nearPt(arcAt(d, 0.5), [Math.SQRT1_2 * 10, -Math.SQRT1_2 * 10], 1e-9);
  nearPt(arcAt(d, 1), [0, -10], 1e-9);
});

test("An arc that wraps through 0 degrees keeps its short sweep", () => {
  const text = dxfDoc({ entities: [["ARC", [[8, "A"], [10, 0], [20, 0], [30, 0], [40, 10], [50, 350], [51, 10]]]] });
  const d = importDxf(text, { units: "mm" }).drawings[0];
  nearPt(arcAt(d, 0.5), [10, 0], 1e-9);
  nearPt(arcAt(d, 0), [10 * Math.cos((350 * Math.PI) / 180), -10 * Math.sin((350 * Math.PI) / 180)], 1e-9);
});

test("$INSUNITS 5 scales centimetres to millimetres", () => {
  const text = dxfDoc({ header: [[9, "$ACADVER"], [1, "AC1027"], [9, "$INSUNITS"], [70, 5]], entities: [line(0, 0, 100, 0), ["CIRCLE", [[8, "0"], [10, 10], [20, 10], [30, 0], [40, 5]]]] });
  const r = importDxf(text);
  assert.equal(r.units, "cm");
  assert.equal(r.scale, 10);
  assert.deepEqual(r.drawings[0].pts, [[0, 0], [1000, 0]]);
  assert.deepEqual([r.drawings[1].cx, r.drawings[1].cy, r.drawings[1].r], [100, -100, 50]);
  assert.deepEqual(r.bounds, { x1: 0, y1: -150, x2: 1000, y2: 0 });
});

test("The units option overrides the header and unitless drawings are guessed from their extent", () => {
  const withMm = dxfDoc({ header: [[9, "$INSUNITS"], [70, 4]], entities: [line(0, 0, 10, 0)] });
  assert.equal(importDxf(withMm, { units: "m" }).drawings[0].pts[1][0], 10000);
  assert.equal(importDxf(withMm, { units: "in" }).drawings[0].pts[1][0], 254);
  const guess = (len) => importDxf(dxfDoc({ entities: [line(0, 0, len, 0)] }));
  const m = guess(12);
  assert.equal(m.units, "m");
  assert.equal(m.drawings[0].pts[1][0], 12000);
  assert.ok(m.warnings.some((w) => /no units/.test(w)));
  assert.equal(guess(1200).units, "cm");
  assert.equal(guess(12000).units, "mm");
  assert.equal(guessUnits(0), "mm");
  assert.throws(() => importDxf(withMm, { units: "furlong" }), /Unknown unit/);
});

test("MTEXT formatting codes are stripped and paragraphs become new lines", () => {
  assert.equal(stripMtext("{\\fArial|b0|i0|c0|p34;Hello}\\PWorld\\~\\A1;x \\S1/2;"), "Hello\nWorld x 1/2");
  assert.equal(stripMtext("\\H2.5x;\\C1;Red \\Lunder\\l \\\\ \\{braces\\} %%d"), "Red under \\ {braces} °");
  assert.equal(stripMtext("\\U+AC70\\U+C2E4"), "거실");
  const text = dxfDoc({ entities: [["MTEXT", [[8, "T"], [10, 0], [20, 0], [30, 0], [40, 2.5], [71, 1], [3, "{\\fArial|b0;First "], [1, "part}\\Psecond"]]]] });
  const r = importDxf(text, { units: "mm" });
  assert.equal(r.texts.length, 1);
  const t = r.texts[0];
  assert.equal(t.text, "First part\nsecond");
  nearPt([t.x, t.y], [0, 0]);
  assert.equal(t.align, "left");
  near(t.size, 2.5);
});

test("MTEXT attachment points place the text block", () => {
  const mt = (att) => importDxf(dxfDoc({ entities: [["MTEXT", [[8, "T"], [10, 0], [20, 0], [30, 0], [40, 2], [71, att], [1, "A\\PB"]]]] }), { units: "mm" }).texts[0];
  // Bottom-right: the block (2 lines, 2 · (1 + 1.25)) sits above and to the left.
  const br = mt(9);
  assert.equal(br.align, "right");
  near(br.y, -2 * 2.25, 1e-9);
  const mc = mt(5);
  assert.equal(mc.align, "center");
  near(mc.y, -2.25, 1e-9);
});

test("TEXT baseline insertion becomes the top anchor and DXF rotation is negated", () => {
  const text = dxfDoc({ entities: [
    ["TEXT", [[8, "T"], [10, 0], [20, 0], [30, 0], [40, 2.5], [1, "plain"]]],
    ["TEXT", [[8, "T"], [10, 0], [20, 0], [30, 0], [40, 2], [1, "turned %%c50"], [50, 30]]],
    ["TEXT", [[8, "T"], [10, 0], [20, 0], [30, 0], [40, 2], [1, "centred"], [72, 1], [11, 100], [21, 0], [31, 0], [73, 2]]],
  ] });
  const [a, b, c] = importDxf(text, { units: "mm" }).texts;
  nearPt([a.x, a.y], [0, -2.5]);
  assert.equal(a.rot, 0);
  assert.equal(b.text, "turned \u230050");
  near(b.rot, -30, 1e-9);
  nearPt([b.x, b.y], [-2 * Math.sin(Math.PI / 6), -2 * Math.cos(Math.PI / 6)], 1e-4); // coordinates are rounded to 0.1 µm
  assert.equal(c.align, "center");
  nearPt([c.x, c.y], [100, -1]);
});

test("A full ELLIPSE is a closed polyline and a partial one starts and ends on its parameters", () => {
  const ell = (t0, t1) => ["ELLIPSE", [[8, "E"], [10, 0], [20, 0], [30, 0], [11, 10], [21, 0], [31, 0], [210, 0], [220, 0], [230, 1], [40, 0.5], [41, t0], [42, t1]]];
  const r = importDxf(dxfDoc({ entities: [ell(0, 2 * Math.PI), ell(0, Math.PI / 2)] }), { units: "mm" });
  const [full, part] = r.drawings;
  assert.equal(full.closed, true);
  const b = boundsOf([full]);
  near(b.x1, -10, 1e-9); near(b.x2, 10, 1e-9); near(b.y1, -5, 1e-9); near(b.y2, 5, 1e-9);
  assert.equal(part.closed, false);
  nearPt(part.pts[0], [10, 0], 1e-9);
  nearPt(part.pts[part.pts.length - 1], [0, -5], 1e-9);
});

test("A SPLINE is evaluated from its control points and knots", () => {
  const ctrl = [[0, 0], [10, 10], [20, 10], [30, 0]];
  const tags = [[8, "S"], [70, 8], [71, 3], [72, 8], [73, 4], [74, 0], ...[0, 0, 0, 0, 1, 1, 1, 1].map((k) => [40, k]), ...ctrl.flatMap(([x, y]) => [[10, x], [20, y], [30, 0]])];
  const fit = [[0, 0], [5, 5], [10, 0], [15, 5]];
  const fitTags = [[8, "S"], [70, 8], [71, 3], [74, 4], ...fit.flatMap(([x, y]) => [[11, x], [21, y], [31, 0]])];
  const r = importDxf(dxfDoc({ entities: [["SPLINE", tags], ["SPLINE", fitTags]] }), { units: "mm" });
  const [s, f] = r.drawings;
  nearPt(s.pts[0], [0, 0], 1e-9);
  nearPt(s.pts[s.pts.length - 1], [30, 0], 1e-9);
  // The cubic Bézier midpoint: (P0 + 3P1 + 3P2 + P3) / 8 = (15, 7.5).
  assert.ok(hasPt(s.pts, [15, -7.5], 1e-9));
  nearPt(f.pts[0], [0, 0], 1e-9);
  nearPt(f.pts[f.pts.length - 1], [15, -5], 1e-9);
  for (const q of fit) assert.ok(hasPt(f.pts, [q[0], -q[1]], 1e-9), "passes through every fit point");
});

test("HATCH boundary paths become closed polylines", () => {
  const tags = [
    [8, "H"], [10, 0], [20, 0], [30, 0], [210, 0], [220, 0], [230, 1], [2, "SOLID"], [70, 1], [71, 0], [91, 2],
    [92, 2], [72, 0], [73, 1], [93, 4], [10, 0], [20, 0], [10, 10], [20, 0], [10, 10], [20, 10], [10, 0], [20, 10], [97, 0],
    [92, 1], [93, 3], [72, 1], [10, 20], [20, 0], [11, 30], [21, 0], [72, 1], [10, 30], [20, 0], [11, 25], [21, 5], [72, 1], [10, 25], [20, 5], [11, 20], [21, 0], [97, 0],
    [75, 0], [76, 1], [98, 1], [10, 5], [20, 5],
  ];
  const r = importDxf(dxfDoc({ entities: [["HATCH", tags]] }), { units: "mm" });
  assert.equal(r.drawings.length, 2);
  assert.ok(r.drawings.every((d) => d.closed));
  assert.deepEqual(r.drawings[0].pts, [[0, 0], [10, 0], [10, -10], [0, -10]]);
  assert.deepEqual(r.drawings[1].pts, [[20, 0], [30, 0], [25, -5]]);
});

test("A HATCH arc edge is flattened along the right side", () => {
  // Counter-clockwise half circle from 0° to 180° around (0,0), closed by a line.
  const tags = [[8, "H"], [10, 0], [20, 0], [30, 0], [2, "SOLID"], [70, 1], [71, 0], [91, 1],
    [92, 1], [93, 2], [72, 2], [10, 0], [20, 0], [40, 10], [50, 0], [51, 180], [73, 1], [72, 1], [10, -10], [20, 0], [11, 10], [21, 0], [97, 0]];
  const d = importDxf(dxfDoc({ entities: [["HATCH", tags]] }), { units: "mm" }).drawings[0];
  assert.ok(hasPt(d.pts, [0, -10], 1e-9), "passes the top of the circle (y-up), i.e. plan y = -10");
});

test("An extrusion direction of (0,0,-1) mirrors entities in x", () => {
  const ex = [[210, 0], [220, 0], [230, -1]];
  const r = importDxf(dxfDoc({ entities: [
    ["CIRCLE", [[8, "X"], [10, 5], [20, 2], [30, 0], [40, 1], ...ex]],
    ["ARC", [[8, "X"], [10, 0], [20, 0], [30, 0], [40, 10], [50, 0], [51, 90], ...ex]],
    ["LWPOLYLINE", [[8, "X"], [90, 2], [70, 0], [10, 1], [20, 2], [10, 3], [20, 4], ...ex]],
    ["LINE", [[8, "X"], [10, 1], [20, 1], [30, 0], [11, 2], [21, 1], [31, 0], ...ex]],
  ] }), { units: "mm" });
  const [c, a, pl, ln] = r.drawings;
  assert.deepEqual([c.cx, c.cy, c.r], [-5, -2, 1]);
  // OCS arc (10,0)→(0,10) counter-clockwise becomes world (-10,0)→(0,10) clockwise.
  const ends = [arcAt(a, 0), arcAt(a, 1)];
  assert.ok(hasPt(ends, [-10, 0], 1e-9) && hasPt(ends, [0, -10], 1e-9));
  nearPt(arcAt(a, 0.5), [-10 * Math.SQRT1_2, -10 * Math.SQRT1_2], 1e-9);
  assert.deepEqual(pl.pts, [[-1, -2], [-3, -4]]);
  assert.deepEqual(ln.pts, [[1, -1], [2, -1]], "LINE is in world coordinates and not mirrored");
});

test("Layer colours, frozen and off layers and entity colours are imported", () => {
  const layer = (name, color, flags = 0) => ["LAYER", [[2, name], [70, flags], [62, color], [6, "CONTINUOUS"]]];
  const text = dxfDoc({
    tables: [["TABLE", [[2, "LAYER"], [70, 3]]], layer("WALLS", 1), layer("FROZEN", 3, 1), layer("OFF", -5), layer("SEVEN", 7), ["ENDTAB", []]],
    blocks: [["BLOCK", [[8, "0"], [2, "BB"], [70, 0], [10, 0], [20, 0], [30, 0]]], line(0, 0, 1, 0, "0", [[62, 0]]), ["ENDBLK", [[8, "0"]]]],
    entities: [
      line(0, 0, 1, 0, "walls"),
      line(0, 0, 1, 0, "FROZEN", [[62, 3]]),
      line(0, 0, 1, 0, "OFF", [[62, 256]]),
      line(0, 0, 1, 0, "NEW", [[420, 0x123456]]),
      line(0, 0, 1, 0, "SEVEN"),
      ["INSERT", [[8, "WALLS"], [62, 5], [2, "BB"], [10, 0], [20, 0], [30, 0]]],
    ],
  });
  const r = importDxf(text, { units: "mm" });
  const L = Object.fromEntries(r.layers.map((l) => [l.id, l]));
  assert.deepEqual(L.WALLS, { id: "WALLS", name: "WALLS", color: "#ff0000", visible: true });
  assert.equal(L.FROZEN.visible, false);
  assert.equal(L.OFF.visible, false);
  assert.equal(L.OFF.color, "#0000ff");
  assert.equal(L.NEW.visible, true);
  assert.equal(L.SEVEN.color, "#9aa4b5", "ACI 7 (foreground) becomes the neutral plan colour");
  const [walls, frozen, off, fresh, , byblock] = r.drawings;
  assert.equal(walls.layer, "WALLS", "layer names match case-insensitively");
  assert.equal(walls.color, undefined, "BYLAYER has no own colour");
  assert.equal(frozen.color, "#00ff00");
  assert.equal(off.color, undefined);
  assert.equal(fresh.color, "#123456", "true colour wins");
  assert.equal(byblock.layer, "WALLS", "layer 0 inside a block takes the insert's layer");
  assert.equal(byblock.color, "#0000ff", "BYBLOCK takes the insert's colour");
});

test("A DIMENSION draws its anonymous block", () => {
  const text = dxfDoc({
    blocks: [["BLOCK", [[8, "0"], [2, "*D1"], [70, 1], [10, 0], [20, 0], [30, 0]]], line(0, 0, 50, 0), ["TEXT", [[8, "0"], [10, 20], [20, 1], [30, 0], [40, 2.5], [1, "50"]]], ["ENDBLK", [[8, "0"]]]],
    entities: [["DIMENSION", [[8, "DIMS"], [2, "*D1"], [10, 50], [20, 5], [30, 0], [70, 32], [13, 0], [23, 0], [33, 0], [14, 50], [24, 0], [34, 0]]]],
  });
  const r = importDxf(text, { units: "mm" });
  assert.equal(r.counts.DIMENSION, 1);
  assert.equal(r.drawings.length, 1);
  assert.equal(r.drawings[0].layer, "DIMS");
  assert.deepEqual(r.texts.map((t) => t.text), ["50"]);
});

test("SOLID and 3DFACE become outlines and POINT is only counted", () => {
  const r = importDxf(dxfDoc({ entities: [
    ["SOLID", [[8, "S"], [10, 0], [20, 0], [30, 0], [11, 10], [21, 0], [31, 0], [12, 0], [22, 10], [32, 0], [13, 10], [23, 10], [33, 0]]],
    ["3DFACE", [[8, "S"], [10, 0], [20, 0], [30, 0], [11, 10], [21, 0], [31, 0], [12, 10], [22, 10], [32, 5], [13, 10], [23, 10], [33, 5]]],
    ["POINT", [[8, "S"], [10, 1], [20, 1], [30, 0]]],
  ] }), { units: "mm" });
  assert.deepEqual(r.drawings[0].pts, [[0, 0], [10, 0], [10, -10], [0, -10]], "SOLID corners 3 and 4 are swapped");
  assert.deepEqual(r.drawings[1].pts, [[0, 0], [10, 0], [10, -10]], "a triangular 3DFACE");
  assert.equal(r.counts.POINT, 1);
  assert.equal(r.drawings.length, 2);
});

test("Unknown entities are counted with one warning per type", () => {
  const w = ["WIPEOUT", [[8, "0"], [10, 0], [20, 0]]];
  const r = importDxf(dxfDoc({ entities: [w, w, line(0, 0, 1, 0)] }), { units: "mm" });
  assert.equal(r.counts.WIPEOUT, 2);
  assert.equal(r.counts.LINE, 1);
  assert.equal(r.warnings.filter((s) => s.includes("WIPEOUT")).length, 1);
});

test("Paper space entities are skipped", () => {
  const r = importDxf(dxfDoc({ entities: [line(0, 0, 1, 0, "0", [[67, 1]]), line(0, 0, 2, 0)] }), { units: "mm" });
  assert.equal(r.drawings.length, 1);
  assert.ok(r.warnings.some((s) => /paper space/.test(s)));
});

test("Binary and non-DXF input is rejected with a clear error", () => {
  assert.throws(() => importDxf("AutoCAD Binary DXF\r\n\u001a\u0000"), /Binary DXF/);
  const bytes = new TextEncoder().encode("AutoCAD Binary DXF\r\n\u001a\u0000rest");
  assert.throws(() => importDxf(bytes), /Binary DXF/);
  assert.throws(() => importDxf("hello world\nthis is not dxf\n"), /Not a DXF/);
});

test("DXF bytes in a legacy code page are decoded from $DWGCODEPAGE", () => {
  const text = dxfDoc({ header: [[9, "$DWGCODEPAGE"], [3, "ANSI_1252"]], entities: [["TEXT", [[8, "0"], [10, 0], [20, 0], [30, 0], [40, 1], [1, "caf\u00e9"]]]] });
  const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0)); // latin-1 bytes: not valid UTF-8
  assert.equal(importDxf(bytes, { units: "mm" }).texts[0].text, "café");
});

// ================================================================ SVG

const svg = (body, attrs = "") => `<?xml version="1.0" encoding="UTF-8"?>\n<!-- test -->\n<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

test("SVG viewBox and millimetre width scale user units to millimetres", () => {
  const r = importSvg(svg(`<line x1="0" y1="0" x2="200" y2="100" stroke="#000"/>`, `width="100mm" height="50mm" viewBox="0 0 200 100"`));
  assert.deepEqual(r.drawings[0].pts, [[0, 0], [100, 50]]);
  assert.deepEqual(r.layers, [{ id: "SVG", name: "SVG", color: "#9aa4b5", visible: true }]);
  assert.equal(r.drawings[0].layer, "SVG");
  const px = importSvg(svg(`<line x1="0" y1="0" x2="96" y2="0"/>`, `viewBox="0 0 100 100"`));
  near(px.drawings[0].pts[1][0], 25.4, 1e-9, "96 px = 1 in");
  const offset = importSvg(svg(`<line x1="10" y1="10" x2="20" y2="10"/>`, `width="10cm" height="10cm" viewBox="10 10 100 100"`));
  assert.deepEqual(offset.drawings[0].pts, [[0, 0], [10, 0]], "viewBox origin maps to the viewport corner");
  const fixed = importSvg(svg(`<line x1="0" y1="0" x2="1" y2="0"/>`, `width="100mm" viewBox="0 0 10 10"`), { mmPerUnit: 1000 });
  assert.deepEqual(fixed.drawings[0].pts, [[0, 0], [1000, 0]], "explicit mmPerUnit wins");
});

test("SVG group transforms are inherited and composed", () => {
  const r = importSvg(svg(`
    <g transform="translate(10,0)"><g transform="scale(2)"><line x1="0" y1="0" x2="5" y2="0"/></g></g>
    <g transform="rotate(90)"><line x1="0" y1="0" x2="10" y2="0"/></g>
    <g transform="matrix(1 0 0 1 3 4) rotate(90 5 5)"><line x1="5" y1="5" x2="6" y2="5"/></g>
    <g transform="skewX(45)"><line x1="0" y1="10" x2="0" y2="20"/></g>`), { mmPerUnit: 1 });
  const [a, b, c, d] = r.drawings.map((x) => x.pts);
  assert.deepEqual(a, [[10, 0], [20, 0]]);
  nearPt(b[1], [0, 10], 1e-9);
  nearPt(c[0], [8, 9], 1e-9);
  nearPt(c[1], [8, 10], 1e-9);
  nearPt(d[0], [10, 10], 1e-9);
  nearPt(d[1], [20, 20], 1e-9);
});

test("SVG paths with curves and arcs keep exact segment end points", () => {
  const abs = "M10 10 C 20 0 30 0 40 10 S 60 20 70 10 Q 80 0 90 10 T 110 10 A 10 10 0 0 1 130 10 L 130 30 H 10 V 10 Z";
  const rel = "m10 10 c10 -10 20 -10 30 0 s20 10 30 0 q10 -10 20 0 t20 0 a10 10 0 0 1 20 0 l0 20 h-120 v-20 z";
  const r = importSvg(svg(`<path d="${abs}"/><path d="${rel}"/>`), { mmPerUnit: 1 });
  assert.equal(r.drawings.length, 2);
  for (const d of r.drawings) {
    assert.equal(d.closed, true);
    nearPt(d.pts[0], [10, 10], 1e-9);
    for (const q of [[40, 10], [70, 10], [90, 10], [110, 10], [130, 10], [130, 30], [10, 30]]) assert.ok(hasPt(d.pts, q, 1e-9), `end point ${q}`);
    // The arc's top (sweep-flag 1 runs through y = 0 on screen) and the curve bulges.
    const arcTop = Math.min(...d.pts.filter(([x]) => x > 119 && x < 121).map(([, y]) => y));
    near(arcTop, 0, 0.02);
    assert.ok(hasPt(d.pts, [25, 2.5], 0.05), "cubic midpoint (25, 2.5)");
  }
  assert.equal(r.drawings[0].pts.length, r.drawings[1].pts.length);
  r.drawings[0].pts.forEach((p, i) => nearPt(p, r.drawings[1].pts[i], 1e-9));
});

test("SVG arc flags may be written without separators", () => {
  const r = importSvg(svg(`<path d="M0 0a5 5 0 1010 0"/>`), { mmPerUnit: 1 });
  const d = r.drawings[0];
  nearPt(d.pts[d.pts.length - 1], [10, 0], 1e-12);
  assert.ok(hasPt(d.pts, [5, 5], 0.02), "sweep-flag 0 runs through y = +5");
});

test("SVG rect, circle, ellipse and polygon become CAD geometry", () => {
  const r = importSvg(svg(`
    <rect x="1" y="2" width="3" height="4" rx="1"/>
    <circle cx="10" cy="10" r="5" stroke="#0f0"/>
    <ellipse cx="20" cy="0" rx="4" ry="2"/>
    <polygon points="0,0 10,0 5,8"/>
    <polyline points="0 0 1 1 2 0"/>
    <circle cx="0" cy="0" r="1" transform="skewX(30)"/>
    <circle cx="0" cy="0" r="1" transform="rotate(30) scale(3)"/>`), { mmPerUnit: 1 });
  const [rect, circ, ell, poly, pl, skewed, turned] = r.drawings;
  assert.deepEqual(rect.pts, [[1, 2], [4, 2], [4, 6], [1, 6]]);
  assert.equal(rect.closed, true);
  assert.deepEqual([circ.kind, circ.cx, circ.cy, circ.r, circ.color], ["circle", 10, 10, 5, "#00ff00"]);
  assert.equal(ell.kind, "polyline");
  assert.equal(ell.closed, true);
  const b = boundsOf([ell]);
  near(b.x1, 16, 1e-6); near(b.x2, 24, 1e-6); near(b.y1, -2, 1e-6); near(b.y2, 2, 1e-6);
  for (const [x, y] of ell.pts) near(((x - 20) / 4) ** 2 + (y / 2) ** 2, 1, 2e-3);
  assert.deepEqual(poly.pts, [[0, 0], [10, 0], [5, 8]]);
  assert.equal(poly.closed, true);
  assert.equal(pl.closed, false);
  assert.equal(skewed.kind, "polyline", "a skewed circle is not a circle");
  assert.equal(turned.kind, "circle");
  near(turned.r, 3, 1e-9);
});

test("SVG text and tspan lines become texts with size, anchor and colour", () => {
  const r = importSvg(svg(`<text x="10" y="20" font-size="5" text-anchor="middle" fill="#00ff00">Hello <tspan x="10" dy="6">World</tspan></text>
    <g transform="rotate(90)" style="font-size:10px"><text x="0" y="0">Down</text></g>`), { mmPerUnit: 1 });
  const [a, b, c] = r.texts;
  assert.equal(a.text, "Hello");
  nearPt([a.x, a.y], [10, 16], 1e-9);
  assert.equal(a.size, 5);
  assert.equal(a.align, "center");
  assert.equal(a.color, "#00ff00");
  assert.equal(b.text, "World");
  nearPt([b.x, b.y], [10, 22], 1e-9);
  assert.equal(c.text, "Down");
  near(c.rot, 90, 1e-9);
  assert.equal(c.size, 10);
});

test("SVG stroke colours come from attributes, style and CSS classes", () => {
  const r = importSvg(svg(`<style>.k { stroke: #123456; fill: none }</style>
    <line x1="0" y1="0" x2="1" y2="0" style="stroke:rgb(255,0,0)"/>
    <g stroke="#0f0"><line x1="0" y1="0" x2="1" y2="0"/></g>
    <line class="k" x1="0" y1="0" x2="1" y2="0"/>
    <line x1="0" y1="0" x2="1" y2="0" stroke="url(#grad)" fill="none"/>
    <rect x="0" y="0" width="1" height="1" fill="blue" stroke="none"/>`), { mmPerUnit: 1 });
  assert.deepEqual(r.drawings.map((d) => d.color), ["#ff0000", "#00ff00", "#123456", undefined, "#0000ff"]);
});

test("SVG hidden content, defs, use references and unsupported elements are handled", () => {
  const r = importSvg(svg(`
    <defs><line id="ln" x1="0" y1="0" x2="1" y2="0"/></defs>
    <use href="#ln" x="5" y="5"/>
    <g display="none"><line x1="0" y1="0" x2="9" y2="9"/></g>
    <line x1="0" y1="0" x2="9" y2="9" style="visibility:hidden"/>
    <image href="a.png" width="10" height="10"/>
    <sodipodi:namedview/>`), { mmPerUnit: 1 });
  assert.equal(r.drawings.length, 1);
  assert.deepEqual(r.drawings[0].pts, [[5, 5], [6, 5]]);
  assert.ok(r.warnings.some((w) => /images/.test(w)));
  assert.deepEqual(r.bounds, { x1: 5, y1: 5, x2: 6, y2: 5 });
  assert.throws(() => importSvg("<html></html>"), /Not an SVG/);
});
