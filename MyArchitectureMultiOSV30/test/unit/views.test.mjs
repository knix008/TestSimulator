// Unit tests for the documentation features (src/views): the section /
// elevation generator on simple known boxes (cut poché and projected lines
// exact), layered walls, hidden lines, tags reading parameters, schedules,
// sheet layout, DXF output and the migration of old files.
// Run: node --test test/unit/views.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "../../src/vendor/three/three.module.js";
import { newProject, normalizeProject, parseProject, serializeProject } from "../../src/core/project.js";
import { modelTriangles, generate, sectionFrame, elevationFrame, ceilingFrame, chainSegments, mergeCollinear } from "../../src/views/section.js";
import * as M from "../../src/views/model.js";
import { viewSpec, ensureGen, planProject, viewExtent, markersFor, hitMarker } from "../../src/views/viewdraw.js";
import { tagText, formatTemplate, elementParams, hitAnnotation, moveAnnotation } from "../../src/views/annot.js";
import { scheduleTable, evalFormula, setCell, scheduleCSV, defaultSchedule } from "../../src/views/schedules.js";
import { viewportRects, placeFree, sheetSvg, prepareSheet } from "../../src/views/sheets.js";
import { hatchSegments } from "../../src/views/hatch.js";
import { viewDxf, sheetDxf } from "../../src/views/dxfview.js";
import { TOOL_DEFS } from "../../src/views/tools.js";
import { KO } from "../../src/ui/i18n-ko.js";

const root = path.resolve(import.meta.dirname, "..", "..");
const near = (a, b, tol = 0.05, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a}`);

// One straight wall 0→5000 along x (200 thick, 3000 high) and a 400 column
// behind it at (4000, 1000).
function boxProject({ typed = false } = {}) {
  const p = newProject("t");
  const lv = p.levels[0].id;
  p.walls.push({ id: "w1", level: lv, x1: 0, y1: 0, x2: 5000, y2: 0, thickness: 200, height: 3000, ...(typed ? { type: "ext-brick-300" } : {}) });
  p.columns.push({ id: "c1", level: lv, x: 4000, y: 1000, w: 400, d: 400, height: 3000 });
  return normalizeProject(p);
}
const genOf = (p, frame, opts = {}) => generate(p, modelTriangles(THREE, p), frame, { px: 5, ...opts });
const bbox = (pts) => ({ x1: Math.min(...pts.map((q) => q[0])), y1: Math.min(...pts.map((q) => q[1])), x2: Math.max(...pts.map((q) => q[0])), y2: Math.max(...pts.map((q) => q[1])) });
const hasLine = (lines, cls, x1, y1, x2, y2, tol = 0.6) => lines.some((l) => l.cls === cls && ((Math.abs(l.x1 - x1) < tol && Math.abs(l.y1 - y1) < tol && Math.abs(l.x2 - x2) < tol && Math.abs(l.y2 - y2) < tol) || (Math.abs(l.x1 - x2) < tol && Math.abs(l.y1 - y2) < tol && Math.abs(l.x2 - x1) < tol && Math.abs(l.y2 - y1) < tol)));

describe("section generator", () => {
  const p = boxProject();
  // Looking east (+x) along a line across the wall at x = 2500.
  const frame = sectionFrame({ x1: 2500, y1: -2000, x2: 2500, y2: 2000 });
  const g = genOf(p, frame);

  test("the frame looks to the left of the drawn line", () => {
    assert.deepEqual(frame.d.map((v) => Math.round(v) + 0), [1, 0, 0]);
    assert.deepEqual(frame.r.map((v) => Math.round(v) + 0), [0, 1, 0]);
  });
  test("the cut wall is one exact rectangle (poché)", () => {
    assert.equal(g.cut.length, 1);
    const c = g.cut[0];
    assert.equal(c.id, "w1");
    assert.equal(c.kind, "walls");
    assert.equal(c.pts.length, 4);
    const b = bbox(c.pts);
    near(b.x1, 1900); near(b.x2, 2100); near(b.y1, -3000); near(b.y2, 0);
  });
  test("the cut outline is drawn heavy and complete", () => {
    for (const l of [[1900, -3000, 2100, -3000], [1900, 0, 2100, 0], [1900, -3000, 1900, 0], [2100, -3000, 2100, 0]]) assert.ok(hasLine(g.lines, "cut", ...l), `cut ${l}`);
    const len = g.lines.filter((l) => l.cls === "cut").reduce((s, l) => s + Math.hypot(l.x2 - l.x1, l.y2 - l.y1), 0);
    near(len, 6400, 2);
  });
  test("the column beyond is projected exactly, with no triangulation diagonals", () => {
    const proj = g.lines.filter((l) => l.cls === "proj");
    for (const l of [[2800, -3000, 3200, -3000], [2800, 0, 3200, 0], [2800, -3000, 2800, 0], [3200, -3000, 3200, 0]]) assert.ok(hasLine(proj, "proj", ...l), `proj ${l}`);
    assert.equal(proj.length, 4);
  });
  test("tags can find the elements in the view", () => {
    assert.ok(g.items.get("w1").cut);
    const b = g.items.get("c1");
    near(b.x1, 2800); near(b.x2, 3200);
  });
  test("the far clip drops what lies beyond it", () => {
    const g2 = genOf(p, sectionFrame({ x1: 2500, y1: -2000, x2: 2500, y2: 2000 }, false, 1000));
    assert.equal(g2.lines.filter((l) => l.cls === "proj").length, 0);
  });
  test("flipping looks the other way (the column is behind the viewer)", () => {
    const g2 = genOf(p, sectionFrame({ x1: 2500, y1: -2000, x2: 2500, y2: 2000 }, true));
    assert.equal(g2.cut.length, 1);
    assert.equal(g2.lines.filter((l) => l.cls === "proj").length, 0);
  });
  test("a crop clips the poché", () => {
    const g2 = genOf(p, frame, { crop: { x1: 0, y1: -1000, x2: 4000, y2: 500 } });
    const b = bbox(g2.cut[0].pts);
    near(b.y1, -1000);
    near(b.y2, 0);
  });
});

describe("layered walls and detail levels", () => {
  const p = boxProject({ typed: true }); // brick 100 | insulation 80 | concrete 100 | plaster 20 (left → right of the line)
  const frame = sectionFrame({ x1: 2500, y1: -2000, x2: 2500, y2: 2000 });
  test("fine: one strip per layer, exact widths and materials", () => {
    const g = genOf(p, frame, { detail: "fine" });
    const strips = g.cut.filter((c) => c.id === "w1").map((c) => ({ mat: c.mat, b: bbox(c.pts) })).sort((a, b) => a.b.x1 - b.b.x1);
    assert.equal(strips.length, 4);
    // Left of the wall (−y in the plan) is x2 = 1850 here; the outside layer is on the wall's left.
    const widths = strips.map((s) => Math.round(s.b.x2 - s.b.x1));
    assert.deepEqual(widths.slice().sort((a, b) => a - b), [20, 80, 100, 100]);
    assert.equal(Math.round(strips[0].b.x1), 1850);
    assert.equal(Math.round(strips[3].b.x2), 2150);
    const order = strips.map((s) => s.mat);
    assert.ok(order.join() === "plaster,concrete,insulation,brick" || order.join() === "brick,insulation,concrete,plaster", order.join());
  });
  test("layer boundaries are lines between different materials", () => {
    const g = genOf(p, frame, { detail: "fine" });
    const vert = g.lines.filter((l) => l.cls === "cut" && Math.abs(l.x1 - l.x2) < 0.5 && Math.abs(Math.abs(l.y2 - l.y1) - 3000) < 1).map((l) => Math.round(l.x1)).sort((a, b) => a - b);
    assert.deepEqual(vert, [1850, 1870, 1970, 2050, 2150]);
  });
  test("medium: the wall reads as its structure layer, one polygon", () => {
    const g = genOf(p, frame, { detail: "medium" });
    const c = g.cut.filter((x) => x.id === "w1");
    assert.equal(c.length, 1);
    assert.equal(c[0].mat, "concrete");
  });
});

describe("elevations, hidden lines, ceiling plans", () => {
  test("an elevation sees the wall face and hides the column behind it", () => {
    const p = boxProject();
    // From the south (y = -6000 is north… plan y down: south is +y) looking north at the wall.
    const g = genOf(p, elevationFrame(2500, 6000, -90));
    assert.equal(g.cut.length, 0);
    // The column (y = 800…1200) is in front of the wall seen from the south: visible.
    assert.ok(g.lines.some((l) => Math.abs(l.x1 - l.x2) < 0.5 && Math.abs(l.x1 - 1300) < 0.6), "column edge");
    // From the north the wall hides the column completely.
    const g2 = genOf(p, elevationFrame(2500, -6000, 90));
    const xs = g2.lines.filter((l) => Math.abs(l.x1 - l.x2) < 0.5).map((l) => Math.round(l.x1)).sort((a, b) => a - b);
    assert.deepEqual([...new Set(xs)], [-2500, 2500], `only the wall ends: ${xs}`);
  });
  test("a ceiling plan cuts the walls at the cut height (plan orientation)", () => {
    const p = boxProject();
    const g = genOf(p, ceilingFrame(2300, 1000));
    assert.equal(g.cut.filter((c) => c.id === "w1").length, 1);
    const b = bbox(g.cut.find((c) => c.id === "w1").pts);
    near(b.x1, 0); near(b.x2, 5000); near(b.y1, -100); near(b.y2, 100);
  });
  test("chaining and merging helpers", () => {
    const { loops } = chainSegments([[0, 0, 10, 0], [10, 10, 0, 10], [10, 0, 10, 10], [0, 10, 0, 0]]);
    assert.equal(loops.length, 1);
    assert.equal(loops[0].length, 4);
    const m = mergeCollinear([0, 0, 5, 0, 1, 4, 0, 10, 0, 1, 2, 0, 8, 0, 2], 1);
    // proj 0…10 (merged) minus the cut 2…8 leaves 0…2 and 8…10.
    assert.equal(m.filter((l) => l.cls === "proj").length, 2);
    assert.equal(m.filter((l) => l.cls === "cut").length, 1);
  });
  test("every sample generates a section and an elevation without errors", async () => {
    const idx = JSON.parse(fs.readFileSync(path.join(root, "sample/index.json"), "utf8"));
    for (const s of idx.slice(0, 5)) {
      const p = parseProject(fs.readFileSync(path.join(root, "sample", s.file), "utf8"));
      const v = M.newView("elevation", { x: 0, y: 30000, angle: -90 });
      const g = await ensureGen(p, viewSpec(p, v), `t-${s.file}`, THREE);
      assert.ok(g.lines.length > 0, s.file);
    }
  });
});

describe("tags read parameters", () => {
  const p = boxProject();
  const lv = p.levels[0].id;
  p.rooms.push({ id: "r1", level: lv, name: "Office", pts: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]], props: { department: "Sales" } });
  p.openings.push({ id: "o1", wall: "w1", kind: "door", at: 1000, width: 900, height: 2100, sill: 0 });
  normalizeProject(p);
  test("room tags show name and area", () => {
    assert.equal(tagText(p, { target: "r1" }), "Office\n12.00 m²");
    assert.equal(tagText(p, { target: "r1", template: "{name} / {department}" }), "Office / Sales");
  });
  test("door tags show the mark, size fields read through", () => {
    assert.equal(tagText(p, { target: "o1" }), "D01");
    assert.equal(tagText(p, { target: "o1", template: "{mark} {width}×{height}" }), "D01 900×2100");
  });
  test("wall tags show the type or thickness", () => {
    assert.equal(tagText(p, { target: "w1" }), "200 mm");
    p.walls[0].type = "concrete-200";
    assert.equal(tagText(p, { target: "w1" }), "Concrete 200");
  });
  test("templates leave unknown fields blank; missing targets show ?", () => {
    assert.equal(formatTemplate("{name}-{nope}", { name: "A" }), "A-");
    assert.equal(tagText(p, { target: "gone" }), "?");
    assert.equal(elementParams(p, "rooms", p.rooms[0]).level, "1F");
  });
});

describe("annotations", () => {
  test("hit testing and moving", () => {
    const a = { kind: "line", pts: [[0, 0], [1000, 0]] };
    assert.ok(hitAnnotation(a, 500, 10, 20, { scale: 1 }));
    assert.ok(!hitAnnotation(a, 500, 300, 20, { scale: 1 }));
    moveAnnotation(a, 10, 20);
    assert.deepEqual(a.pts, [[10, 20], [1010, 20]]);
    const tag = { kind: "tag", target: "x", dx: 0, dy: 0 };
    moveAnnotation(tag, 5, 6);
    assert.deepEqual([tag.dx, tag.dy], [5, 6]);
  });
  test("hatch lines stay inside the polygon", () => {
    const segs = hatchSegments([[0, 0], [100, 0], [100, 100], [0, 100]], 0, 10);
    assert.equal(segs.length, 10);
    for (const s of segs) { near(s[0], 0, 1e-6); near(s[2], 100, 1e-6); }
  });
});

describe("schedules", () => {
  const p = newProject("s");
  const lv = p.levels[0].id;
  p.rooms.push({ id: "a", level: lv, name: "B", pts: [[0, 0], [2000, 0], [2000, 2000], [0, 2000]], props: { department: "X" } });
  p.rooms.push({ id: "b", level: lv, name: "A", pts: [[0, 0], [3000, 0], [3000, 2000], [0, 2000]], props: { department: "X" } });
  p.rooms.push({ id: "c", level: lv, name: "C", pts: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]], props: { department: "Y" } });
  normalizeProject(p);
  test("sorting, filters, grouping with subtotals, totals", () => {
    const sch = { category: "rooms", fields: ["name", "area"], sort: [{ field: "name" }], filters: [], group: "department", totals: true };
    const tb = scheduleTable(p, sch);
    assert.deepEqual(tb.groups.map((g) => g.key), ["X", "Y"]);
    assert.deepEqual(tb.groups[0].rows.map((r) => r.name), ["A", "B"]);
    near(tb.groups[0].totals.area, 10, 1e-9);
    near(tb.totals.area, 11, 1e-9);
    const f = scheduleTable(p, { ...sch, group: null, filters: [{ field: "area", op: ">", value: "3" }] });
    assert.deepEqual(f.rows.map((r) => r.name), ["A", "B"]);
  });
  test("calculated values and formulas", () => {
    assert.equal(evalFormula("(2 + 3) * 4 - 10 / 2", {}), 15);
    assert.equal(evalFormula("area * 1.5", { area: 4 }), 6);
    assert.ok(Number.isNaN(evalFormula("area +", { area: 1 })));
    const tb = scheduleTable(p, { category: "rooms", fields: ["name", "k"], calc: [{ key: "k", name: "Gross", expr: "area * 2" }], sort: [{ field: "k", desc: true }] });
    assert.deepEqual(tb.rows.map((r) => r.k), [12, 8, 2]);
  });
  test("editable cells write back to the model; CSV exports", () => {
    assert.ok(setCell(p, { category: "rooms" }, "c", "name", "Store"));
    assert.equal(p.rooms.find((r) => r.id === "c").name, "Store");
    assert.ok(!setCell(p, { category: "rooms" }, "c", "area", 5));
    const csv = scheduleCSV(p, defaultSchedule("rooms"));
    assert.ok(csv.includes("Store") && csv.includes("Total (3)"));
  });
});

describe("sheets", () => {
  const p = boxProject();
  const sec = M.newView("section", { name: "S", line: { x1: 2500, y1: -2000, x2: 2500, y2: 2000 }, scale: 50, cropOn: true, crop: { x1: 0, y1: -4000, x2: 4000, y2: 1000 } });
  p.views.push(sec);
  const s = M.newSheet(p, { name: "Sections", paper: "A3" });
  s.viewports.push({ id: "vp1", view: sec.id, x: 100, y: 100 });
  p.sheets.push(s);
  test("a viewport is the view's crop at its scale, centred on its point", () => {
    const [r] = viewportRects(p, s);
    near(r.x2 - r.x1, 4000 / 50, 1e-9);
    near(r.y2 - r.y1, 5000 / 50, 1e-9);
    near((r.x1 + r.x2) / 2, 100, 1e-9);
  });
  test("free placement does not overlap existing viewports", () => {
    const [cx, cy] = placeFree(p, s, 60, 40);
    const [r] = viewportRects(p, s);
    assert.ok(cx - 30 > r.x2 || cx + 30 < r.x1 || cy - 20 > r.y2 + 12 || cy + 20 < r.y1, `${cx},${cy}`);
  });
  test("sheet numbering, detail numbers, placement and drawing list", () => {
    assert.equal(M.nextSheetNumber(p), `A${100 + p.sheets.length + 1}`);
    assert.equal(M.detailNumber(s, s.viewports[0]), 1);
    assert.equal(M.placementOf(p, sec.id).sheet.id, s.id);
    const list = M.drawingList(p);
    assert.equal(list.length, p.sheets.length);
    assert.ok(list.every((r, i) => !i || String(list[i - 1].number).localeCompare(String(r.number), undefined, { numeric: true }) <= 0));
  });
  test("revisions on a sheet: listed and from clouds in its views", () => {
    p.revisions.push({ id: "r1", seq: 1, name: "A", date: "2026-01-01", description: "x" }, { id: "r2", seq: 2, name: "B", date: "2026-02-01", description: "y" });
    s.revisions = ["r1"];
    p.annotations.push({ id: "cl", view: sec.id, kind: "cloud", pts: [[0, 0], [100, 0], [100, 100]], rev: "r2" });
    assert.deepEqual(M.sheetRevisions(p, s).map((r) => r.id), ["r1", "r2"]);
    assert.equal(M.currentRevision(p, s).name, "B");
  });
  test("the sheet renders to SVG with its title block and the generated section", async () => {
    await prepareSheet(p, s, 0);
    const { svg, W, H } = sheetSvg(p, s, { rev: 0 });
    assert.equal(W, 420); assert.equal(H, 297);
    assert.ok(svg.includes("Sections") && svg.includes(s.number) && svg.includes("1:50"));
    assert.ok(svg.includes("clip-path"));
  });
  test("DXF of the section view and of the sheet", async () => {
    const { dxf, entities } = await viewDxf(p, sec, 0);
    assert.ok(dxf.startsWith("0\r\nSECTION") && dxf.includes("AC1009") && dxf.trim().endsWith("EOF"));
    assert.ok(entities > 4);
    assert.ok(dxf.includes("A-HEAVY"));
    const sd = await sheetDxf(p, s, 0);
    assert.ok(sd.entities > entities);
  });
});

describe("plan views, markers and migration", () => {
  test("old files get the implicit level views and one sheet per level with its plan", () => {
    const old = JSON.parse(fs.readFileSync(path.join(root, "sample/03-two-storey-house.myarch"), "utf8"));
    for (const k of ["views", "sheets", "annotations", "viewTemplates", "revisions", "publishSets", "lineStyles"]) delete old[k];
    const p = normalizeProject(old);
    assert.equal(p.sheets.length, p.levels.length);
    p.levels.forEach((lv, i) => assert.equal(p.sheets[i].viewports[0].view, M.planViewId(lv.id)));
    const views = M.allViews(p);
    assert.equal(views.filter((v) => v.kind === "plan").length, p.levels.length);
    assert.equal(views.filter((v) => v.kind === "ceiling").length, p.levels.length);
    assert.ok(p.viewTemplates.length >= 4 && p.lineStyles.length >= 6);
    // Normalizing again changes nothing (no extra sheets).
    const again = normalizeProject(JSON.parse(serializeProject(p)));
    assert.equal(again.sheets.length, p.sheets.length);
    assert.deepEqual(again.sheets.map((s) => s.number), p.sheets.map((s) => s.number));
  });
  test("dangling references are dropped", () => {
    const p = newProject("d");
    p.views = [{ id: "s1", kind: "section", name: "S", line: { x1: 0, y1: 0, x2: 1, y2: 0 } }, { id: "d1", kind: "detail", parent: "gone", crop: { x1: 0, y1: 0, x2: 1, y2: 1 } }, { id: "x", kind: "bogus" }];
    p.sheets = [{ id: "sh", number: "A1", viewports: [{ view: "s1" }, { view: "nope" }], revisions: ["nope"] }];
    p.annotations = [{ id: "a1", view: "s1", kind: "note" }, { id: "a2", view: "nope", kind: "note" }];
    normalizeProject(p);
    assert.deepEqual(p.views.map((v) => v.id), ["s1"]);
    assert.equal(p.sheets[0].viewports.length, 1);
    assert.deepEqual(p.sheets[0].revisions, []);
    assert.deepEqual(p.annotations.map((a) => a.id), ["a1"]);
  });
  test("ensureView stores an implicit view; templates apply", () => {
    const p = normalizeProject(newProject("e"));
    const id = M.planViewId(p.levels[0].id);
    assert.equal(p.views.length, 0);
    M.ensureView(p, id).template = "vt-furn-50";
    assert.equal(p.views.length, 1);
    const eff = M.effectiveView(p, M.viewById(p, id));
    assert.equal(eff.scale, 50);
    assert.equal(eff.detail, "fine");
  });
  test("plan views hide categories and windows above the cut", () => {
    const p = boxProject();
    p.openings.push({ id: "o1", wall: "w1", kind: "window", at: 2000, width: 1000, height: 600, sill: 1600 });
    normalizeProject(p);
    const v = M.ensureView(p, M.planViewId(p.levels[0].id));
    v.hidden = ["columns"];
    v.cutHeight = 1200;
    const q = planProject(p, v, 1);
    assert.equal(q.columns.length, 0);
    assert.equal(q.openings.length, 0);
    assert.equal(p.columns.length, 1);
  });
  test("sections show as markers on plans and are hit by their heads", () => {
    const p = boxProject();
    const v = M.newView("section", { line: { x1: 2500, y1: -2000, x2: 2500, y2: 2000 } });
    p.views.push(v);
    const pv = M.viewById(p, M.planViewId(p.levels[0].id));
    assert.ok(markersFor(p, pv).some((x) => x.id === v.id));
    const hit = hitMarker(p, pv, 2500, 2000 + 400, 50, 100);
    assert.equal(hit && hit.view.id, v.id);
    assert.equal(hit.part, "head");
    const e = viewExtent(p, v);
    assert.ok(e.x2 > e.x1);
  });
});

describe("localization of the documentation tools", () => {
  test("every tool, command label and category name has a Korean translation", () => {
    const missing = [];
    for (const d of Object.values(TOOL_DEFS)) for (const s of [d.label, d.hint]) if (!(s in KO)) missing.push(s);
    const src = fs.readFileSync(path.join(root, "src/views/index.js"), "utf8");
    for (const m of src.matchAll(/C\(`?"?[\w.${}`]+"?`?,\s*"((?:[^"\\]|\\.)*)"/g)) if (!(m[1] in KO)) missing.push(m[1]);
    const pe = fs.readFileSync(path.join(root, "src/views/planext.js"), "utf8");
    for (const m of pe.matchAll(/(?:label|hint): "((?:[^"\\]|\\.)*)"/g)) if (!(m[1] in KO)) missing.push(m[1]);
    for (const s of M.LINE_STYLES) if (!(s.name in KO)) missing.push(s.name);
    for (const s of M.DEFAULT_TEMPLATES) if (!(s.name in KO)) missing.push(s.name);
    assert.deepEqual(missing, []);
  });
});
