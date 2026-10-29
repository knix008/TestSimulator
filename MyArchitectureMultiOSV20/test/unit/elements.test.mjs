// Unit tests for the BIM elements (src/core/elements and the plan / 3D / IFC /
// DXF / schedule hooks): slabs, ceilings, beams, railings, ramps, shafts,
// stairs by type, curtain walls, wall profiles, per-edge roofs, types,
// design options and arrays.
// Run: node --test test/unit/elements.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../src/vendor/three/three.module.js";
import { newProject, newLevel, normalizeProject, parseProject, serializeProject, LEVEL_COLLECTIONS } from "../../src/core/project.js";
import { roofModel } from "../../src/core/roof.js";
import {
  DEFAULT_CURTAIN_TYPES, DEFAULT_TYPES, allTypes, typeById, typeInstances, applyTypes, activeModel, syncOptions, optionHidden, allSlabTypes,
} from "../../src/core/elements/model.js";
import {
  slabTop, slabArea, cutsOf, shaftsAt, beamEnds, beamProfile, beamSystem, beamLength, rampModel, stairLayout, stairRails, railingParts, railingPath,
  curtainGrid, wallTopRel, undersideAt, roomOnSlab, ceilingHeight,
} from "../../src/core/elements/geometry.js";
import { elementSchedule, typeSchedule, thermalSchedule } from "../../src/core/elements/schedule.js";
import { costEstimate } from "../../src/core/schedule.js";
import { runCheck } from "../../src/core/check.js";
import { buildBuilding, makeMaterials } from "../../src/view3d/build.js";
import { exportIfc, importIfc } from "../../src/io/ifc.js";
import { exportDxf } from "../../src/io/dxf.js";
import { hitTest, boxSelect, moveItems, rotateItems, copyItems, pasteItems } from "../../src/plan/ops.js";
import { drawPlan, PLAN_THEMES, planBounds } from "../../src/plan/render.js";
import { arrayItems } from "../../src/ui/elements.js";
import { uValue } from "../../src/lib/materials.js";

const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a}`);
const rect = (x1, y1, x2, y2) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];

function sample() {
  const p = newProject("Elements");
  p.levels[0].id = "L";
  p.levels.push({ ...newLevel("2F", 3000, 3000), id: "U" });
  p.wallTypes.push(...JSON.parse(JSON.stringify(DEFAULT_CURTAIN_TYPES)));
  p.walls.push({ id: "cw", level: "L", x1: 0, y1: 0, x2: 9000, y2: 0, thickness: 150, type: "curtain-1500" });
  p.walls.push({ id: "ws", level: "L", x1: 9000, y1: 0, x2: 9000, y2: 6000, thickness: 200, heightEnd: 3600 });
  p.walls.push({ id: "wa", level: "U", x1: 0, y1: 6000, x2: 0, y2: 0, thickness: 200, attachTop: "roof" });
  p.openings.push({ id: "d1", wall: "cw", kind: "door", at: 3000, width: 1500, height: 2100, sill: 0, typeId: "door-double-1600" });
  p.slabs.push({ id: "s1", level: "L", pts: rect(0, 0, 9000, 6000), type: "floor-concrete-250", holes: [rect(1000, 1000, 2000, 2000)] });
  p.slabs.push({ id: "s2", level: "U", pts: rect(0, 0, 9000, 6000), thickness: 200, slope: 5, slopeDir: 0 });
  p.ceilings.push({ id: "c1", level: "L", pts: rect(0, 0, 9000, 6000), type: "ceil-gypsum-15" });
  p.beams.push({ id: "b1", level: "L", x1: 0, y1: 3000, x2: 9000, y2: 3000, typeId: "beam-steel-i200x400" });
  p.beams.push({ id: "b2", level: "L", x1: 0, y1: 4000, x2: 6000, y2: 4000, w: 200, h: 200, z1: 0, z2: 3000 });
  p.railings.push({ id: "r1", level: "L", pts: [[0, 7000], [5000, 7000], [5000, 9000]], typeId: "rail-glass-1100" });
  p.ramps.push({ id: "rp", level: "L", pts: [[10000, 0], [10000, 7200]], width: 1500, rise: 600 });
  p.shafts.push({ id: "sh", level: "L", top: "U", pts: rect(6000, 1000, 7000, 2000) });
  p.stairs.push({ id: "st1", level: "L", x: 4000, y: 10000, rot: 0, length: 4000, width: 1000, steps: 17, shape: "L", railing: "both" });
  p.stairs.push({ id: "st2", level: "L", x: 4000, y: 14000, rot: 0, length: 4000, width: 1000, steps: 17, shape: "U", railing: "both" });
  p.stairs.push({ id: "st3", level: "L", x: 12000, y: 14000, rot: 0, length: 3000, width: 1000, steps: 17, shape: "spiral", railing: "both" });
  p.roofs.push({ id: "rf", level: "U", pts: rect(0, 0, 9000, 6000), kind: "edges", pitch: 30, overhang: 400, thickness: 200, edges: [{}, { slope: false }, {}, { slope: false }], holes: [rect(2000, 1000, 3000, 2000)] });
  return normalizeProject(p);
}

describe("model and migration", () => {
  test("new collections exist and are level collections", () => {
    const p = newProject();
    for (const k of ["slabs", "ceilings", "beams", "railings", "ramps", "shafts"]) { assert.deepEqual(p[k], []); assert.ok(LEVEL_COLLECTIONS.includes(k)); }
  });
  test("an old file without any element fields loads unchanged in its old parts", () => {
    const old = { levels: [{ id: "L", name: "1F", elevation: 0, height: 2800 }], walls: [{ id: "w", level: "L", x1: 0, y1: 0, x2: 4000, y2: 0, thickness: 200 }], stairs: [{ id: "s", level: "L", x: 0, y: 0, rot: 0, length: 3000, width: 1000, steps: 16 }], roofs: [{ id: "r", level: "L", pts: rect(0, 0, 4000, 3000), kind: "hip" }] };
    const p = normalizeProject(JSON.parse(JSON.stringify(old)));
    assert.equal(p.stairs[0].shape, undefined, "old stairs stay straight");
    assert.equal(p.stairs[0].railing, undefined, "and keep no railings");
    assert.equal(p.walls[0].heightEnd, undefined);
    assert.deepEqual(p.types, [], "the built-in catalogue is not copied into files");
    assert.deepEqual(p.slabTypes, []);
    assert.deepEqual(p.designOptions, []);
    assert.equal(p.roofs[0].kind, "hip");
  });
  test("normalize is idempotent and survives a save round trip", () => {
    const p = sample();
    const again = parseProject(serializeProject(p));
    assert.deepEqual(JSON.parse(serializeProject(again)), JSON.parse(serializeProject(p)));
  });
  test("bad values are clamped or dropped", () => {
    const p = normalizeProject({ levels: [{ id: "L", elevation: 0, height: 2800 }], slabs: [{ pts: [[0, 0]] }, { pts: rect(0, 0, 10, 10), slope: 99, type: "nope" }], beams: [{ x1: 0, y1: 0, x2: 0, y2: 0 }], railings: [{ pts: [[0, 0], [1000, 0]], height: -5, style: "x" }], shafts: [{ pts: rect(0, 0, 10, 10), top: "missing" }], stairs: [{ shape: "zigzag" }] });
    assert.equal(p.slabs.length, 1);
    assert.equal(p.slabs[0].slope, 60);
    assert.equal(p.slabs[0].type, undefined);
    assert.equal(p.beams.length, 0);
    assert.equal(p.railings[0].height, 100);
    assert.equal(p.railings[0].style, "bars");
    assert.equal(p.shafts[0].top, "L");
    assert.equal(p.stairs[0].shape, undefined);
  });
  test("type parameters are copied onto their instances; a missing type unlinks", () => {
    const p = sample();
    const d = p.openings.find((o) => o.id === "d1");
    assert.equal(d.width, 1600);
    assert.equal(d.type, "double");
    const b = p.beams.find((x) => x.id === "b1");
    assert.equal(b.profile, "I");
    assert.equal(b.material, "steel");
    p.types.push({ ...JSON.parse(JSON.stringify(DEFAULT_TYPES.find((t) => t.id === "door-double-1600"))), params: { type: "double", width: 1800, height: 2200, frameWidth: 70, frameDepth: 0 } });
    applyTypes(p);
    assert.equal(d.width, 1800, "an edited built-in wins by id");
    d.typeId = "gone";
    applyTypes(p);
    assert.equal(d.typeId, undefined);
    assert.equal(typeInstances(p, "beam-steel-i200x400").length, 1);
    assert.ok(allTypes(p).length >= DEFAULT_TYPES.length);
    assert.ok(typeById(p, "rail-glass-1100"));
  });
});

describe("geometry", () => {
  test("slabs: area without the openings and shafts, sloped tops", () => {
    const p = sample();
    const s1 = p.slabs[0];
    assert.equal(s1.thickness, 250, "thickness from the slab type");
    assert.equal(cutsOf(p, s1).length, 2, "own opening + the shaft");
    near(slabArea(p, s1), 54e6 - 2e6, 1);
    const top = slabTop(p, p.slabs[1]);
    near(top(0, 0), 3000, 1e-6);
    near(top(9000, 0), 3000 + 9000 * Math.tan((5 * Math.PI) / 180), 1e-6);
    assert.equal(shaftsAt(p, "U").length, 1);
  });
  test("ceilings default to 300 mm under the next floor", () => {
    const p = sample();
    assert.equal(ceilingHeight(p, p.ceilings[0]), 2500);
  });
  test("beams: ends, profiles, systems", () => {
    const p = sample();
    assert.deepEqual(beamEnds(p, p.beams[0]), [2800, 2800], "top of the storey");
    assert.deepEqual(beamEnds(p, p.beams[1]), [0, 3000]);
    near(beamLength(p, p.beams[1]), Math.hypot(6000, 3000), 1e-6);
    assert.equal(beamProfile(p.beams[0]).length, 12, "I-section outline");
    const sys = beamSystem(rect(0, 0, 6000, 4000), 1000, 0);
    assert.equal(sys.length, 3);
    for (const b of sys) near(Math.abs(b.x2 - b.x1), 6000, 1e-6);
  });
  test("railings: posts at corners, balusters between", () => {
    const p = sample();
    const r = { ...p.railings[0], style: "bars", spacing: 200 };
    const parts = railingParts(railingPath(p, r), r);
    assert.equal(parts.posts.length, 3);
    assert.ok(parts.balusters.length > 30);
    assert.ok(parts.rail.every((q) => q[2] === r.height));
  });
  test("ramps rise along their path", () => {
    const p = sample();
    const m = rampModel(p, p.ramps[0]);
    near(m.slope, 600 / 7200);
    assert.equal(m.z[1], 600);
    assert.equal(m.outline.length, 4);
  });
  test("stairs by type: every riser equal, landing between the flights, rails", () => {
    const p = sample();
    for (const s of p.stairs) {
      const lay = stairLayout(s, 3000);
      near(lay.riser, 3000 / 17, 1e-9, s.shape);
      const zs = [...lay.treads.map((t) => t.z), ...lay.landings.map((l) => l.z)].sort((a, b) => a - b);
      near(zs[zs.length - 1], 3000, 1e-6, `${s.shape} reaches the floor above`);
      assert.equal(stairRails(p, s).length, 2);
      if (s.shape !== "spiral") assert.equal(lay.landings.length, 1);
    }
  });
  test("curtain wall grid: equal cells no wider than the spacing", () => {
    const p = sample();
    const g = curtainGrid(p, p.walls[0], 3000);
    assert.equal(g.us.length, 7);
    near(g.us[1], 1500);
    assert.equal(g.zs[g.zs.length - 1], 3000);
  });
  test("wall profiles: sloped top and a top attached to the roof", () => {
    const p = sample();
    const ws = p.walls.find((w) => w.id === "ws");
    near(wallTopRel(p, ws, 0, 3000), 3000);
    near(wallTopRel(p, ws, 6000, 3000), 3600);
    const wa = p.walls.find((w) => w.id === "wa");
    const top = wallTopRel(p, wa, 3000, 3000);
    assert.ok(top > 3000, `attached top rises under the gable (${top})`);
    assert.ok(undersideAt(p, "roof", 0, 3000) !== null);
  });
  test("per-edge roofs: gables on flat edges, hips on sloped ones, openings", () => {
    const p = sample();
    const r = p.roofs[0];
    const m = roofModel(r, 6000);
    assert.equal(m.faces.length, 2);
    assert.equal(m.gables.length, 2);
    near(m.peak, 6000 + 3000 * Math.tan(Math.PI / 6), 1e-6);
    r.edges = r.edges.map(() => ({ slope: true }));
    assert.equal(roofModel(r, 6000).faces.length, 4);
    r.edges = r.edges.map(() => ({ slope: false }));
    assert.ok(roofModel(r, 6000).flat);
  });
  test("a room on a slab keeps only its finish", () => {
    const p = sample();
    p.rooms.push({ id: "r", level: "L", pts: rect(3000, 3000, 5000, 5000), name: "A" });
    assert.ok(roomOnSlab(p, p.rooms[0]));
  });
});

describe("design options, arrays, plan edits", () => {
  test("only the active option is shown, built and checked", () => {
    const p = sample();
    p.designOptions = [{ id: "ds", name: "Lobby", options: [{ id: "a", name: "A" }, { id: "b", name: "B" }], active: "a" }];
    p.beams[0].option = "a";
    p.beams[1].option = "b";
    normalizeProject(p);
    const m = activeModel(p);
    assert.deepEqual(m.beams.map((b) => b.id), ["b1"]);
    syncOptions(p);
    assert.ok(optionHidden(p.beams[1]));
    assert.ok(!optionHidden(p.beams[0]));
    p.designOptions[0].active = "b";
    assert.deepEqual(activeModel(p).beams.map((b) => b.id), ["b2"]);
  });
  test("linear and radial arrays copy the selection", () => {
    const p = sample();
    const made = arrayItems(p, ["b1"], "L", { mode: "linear", count: 4, dx: 0, dy: 500 });
    assert.equal(made.length, 3);
    assert.equal(p.beams.filter((b) => b.typeId === "beam-steel-i200x400").length, 4);
    const before = p.railings.length;
    arrayItems(p, ["r1"], "L", { mode: "radial", count: 4, angle: 360, cx: 0, cy: 0, group: true });
    assert.equal(p.railings.length, before + 3);
  });
  test("hit test, box select, move, rotate, copy / paste", () => {
    const p = sample();
    const h = hitTest(p, "L", 4500, 3000, 50);
    assert.equal(h.kind, "beams");
    const ids = boxSelect(p, "L", { x1: 9500, y1: -100, x2: 10500, y2: 7300 });
    assert.ok(ids.includes("rp"));
    moveItems(p, ["s1"], 100, 0);
    assert.equal(p.slabs[0].pts[0][0], 100);
    assert.equal(p.slabs[0].holes[0][0][0], 1100, "holes move with the slab");
    rotateItems(p, ["b1"], 90, [4500, 3000]);
    near(p.beams.find((b) => b.id === "b1").x1, 4500, 1e-6);
    const clip = copyItems(p, ["r1", "b2"]);
    const added = pasteItems(p, clip, "U", 0, 0);
    assert.equal(added.length, 2);
    assert.ok(p.beams.some((b) => b.level === "U"));
  });
  test("plan drawing runs for every element and extends the bounds", () => {
    const p = sample();
    const calls = [];
    const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push(k); return a; }), set: (t, k, v) => { t[k] = v; return true; } });
    drawPlan(ctx, p, PLAN_THEMES.light, { level: "L", lw: 10, px: 10, selected: new Set(["s1", "b1", "r1", "rp", "sh", "c1", "cw"]) });
    assert.ok(calls.length > 200);
    const b = planBounds(p, "L");
    assert.ok(b.x2 >= 10750 && b.y2 >= 14000);
  });
});

describe("3D, schedules, check, exchange", () => {
  test("every element builds 3D meshes without NaN", () => {
    const p = sample();
    const root = buildBuilding(THREE, p, makeMaterials(THREE, { textures: false }), {});
    const kinds = new Set();
    root.traverse((o) => { if (o.isMesh) { kinds.add(o.userData.kind); for (const v of o.geometry.attributes.position.array) assert.ok(Number.isFinite(v), o.name); } });
    for (const k of ["walls", "slabs", "ceilings", "beams", "railings", "ramps", "stairs", "roofs", "openings"]) assert.ok(kinds.has(k), k);
  });
  test("schedules, U-values and the cost estimate include the elements", () => {
    const p = sample();
    const rows = elementSchedule(p);
    for (const c of ["Floor slab", "Ceiling", "Beam", "Brace", "Railing", "Stair railing", "Ramp", "Shaft", "Curtain wall"]) assert.ok(rows.some((r) => r.category === c), c);
    assert.ok(typeSchedule(p).some((r) => r.type === "Steel I-beam 200 × 400" && r.count === 1));
    const th = thermalSchedule(p);
    assert.ok(th.length >= allSlabTypes(p).length);
    near(uValue([{ material: "insulation", thickness: 100 }]), 1 / (0.17 + 0.1 / 0.035), 1e-9);
    const est = costEstimate(p);
    for (const it of ["Floor slabs", "Ceilings", "Beams", "Railings", "Ramps", "Curtain walls"]) assert.ok(est.lines.some((l) => l.item === it), it);
  });
  test("model check rules see the elements", () => {
    const p = sample();
    p.railings[0].height = 800;
    assert.ok(runCheck(p).some((i) => i.code === "railing-low"));
  });
  test("IFC: exported as their IFC classes and read back exactly (IFC4 and IFC2X3)", () => {
    const p = sample();
    for (const schema of ["IFC4", "IFC2X3"]) {
      const txt = exportIfc(p, { schema, timestamp: 0 });
      for (const e of ["IFCSLAB(", "IFCCOVERING(", "IFCBEAM(", "IFCRAILING(", "IFCRAMP(", "IFCCURTAINWALL(", "IFCPLATE(", "IFCMEMBER(", "IFCSTAIRFLIGHT(", "IFCOPENINGELEMENT(", "IFCARBITRARYPROFILEDEFWITHVOIDS("]) assert.ok(txt.includes(e), `${schema} ${e}`);
      const { project: q, warnings } = importIfc(txt);
      assert.deepEqual(warnings, [], schema);
      for (const k of ["slabs", "ceilings", "beams", "railings", "ramps", "shafts"]) assert.equal(q[k].length, p[k].length, `${schema} ${k}`);
      const sl = q.slabs.find((s) => s.holes.length);
      assert.deepEqual(sl.holes, p.slabs[0].holes);
      assert.deepEqual(q.stairs.map((s) => s.shape).sort(), ["L", "U", "spiral"]);
      assert.ok(q.walls.some((w) => w.type === "curtain-1500"), "curtain wall keeps its type");
      assert.ok(q.openings.some((o) => o.kind === "door"), "the door in the curtain wall");
      assert.equal(q.roofs[0].kind, "edges");
      assert.equal(q.roofs[0].holes.length, 1);
      assert.ok(q.walls.some((w) => w.heightEnd === 3600));
      assert.ok(q.shafts[0].top !== q.shafts[0].level, "shaft keeps its level range");
    }
  });
  test("IFC: a foreign floor slab becomes a slab element", () => {
    const p = newProject("x");
    p.slabs.push({ id: "s", level: p.levels[0].id, pts: rect(0, 0, 5000, 4000), thickness: 180 });
    normalizeProject(p);
    const txt = exportIfc(p, { timestamp: 0 }).replace(/MyArchitecture/g, "OtherApp");
    const { project: q } = importIfc(txt);
    assert.equal(q.slabs.length, 1);
    assert.equal(q.slabs[0].thickness, 180);
  });
  test("DXF puts every element on its layer", () => {
    const p = sample();
    const txt = exportDxf(p, { level: "L" });
    for (const l of ["A-FLOR-SLAB", "A-CLNG", "S-BEAM", "A-FLOR-HRAL", "A-FLOR-RAMP", "A-SHFT", "A-GLAZ-CWMG"]) assert.ok(txt.includes(l), l);
  });
});

describe("shafts and roofs", () => {
  test("a shaft that ends at the top floor leaves the roof whole; one that goes on above cuts it", () => {
    const p = newProject("shaft roof");
    const G = p.levels[0];
    const U = newLevel("2F", G.elevation + G.height, 3000);
    const R = newLevel("Roof", U.elevation + U.height, 2600);
    p.levels.push(U, R);
    const sq = [[0, 0], [8000, 0], [8000, 8000], [0, 8000]];
    const roof = { id: "f1", level: U.id, pts: sq, kind: "flat", pitch: 0, overhang: 300, thickness: 200 };
    const slab = { id: "sl1", level: U.id, pts: sq, holes: [] };
    const shaft = { id: "sh1", level: G.id, top: U.id, pts: [[3000, 3000], [5000, 3000], [5000, 5000], [3000, 5000]] };
    p.shafts.push(shaft);
    assert.equal(cutsOf(p, slab).length, 1, "the top floor's slab is cut");
    assert.equal(cutsOf(p, roof).length, 0, "the roof on the top floor stays closed");
    shaft.top = R.id;
    assert.equal(cutsOf(p, roof).length, 1, "a shaft through to the roof level cuts the roof");
  });
});
