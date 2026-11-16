// Unit tests for parametric towers and bridges (src/core/structures.js): the
// members they make, the alignment, editing / moving / pasting them, and the
// 3D they build (batched: one geometry per section).
// Run: node --test test/unit/structures.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../src/vendor/three/three.module.js";
import { towerMembers, bridgeMembers, alignment, bridgeSpans, addStructure, updateStructure, removeStructure, BRIDGE_TYPES, TOWER_DEFAULTS, BRIDGE_DEFAULTS } from "../../src/core/structures.js";
import { normalizeMember, memberValid } from "../../src/core/members.js";
import { newProject, normalizeProject, serializeProject, parseProject } from "../../src/core/project.js";
import { buildBuilding, makeMaterials, modelExtent } from "../../src/view3d/build.js";
import { createBatcher } from "../../src/view3d/batch.js";
import { transformElements } from "../../src/plan/elements.js";
import { copyItems, pasteItems } from "../../src/plan/ops.js";

const near = (a, b, tol, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a}`);
const fresh = () => { const p = newProject("S"); p.levels[0].id = "L"; return normalizeProject(p); };
const allFinite = (list) => list.every((m) => m.pts.every((q) => q.every(Number.isFinite)));

describe("towers", () => {
  test("legs, ring struts, X bracing on every face, platforms and a mast", () => {
    const n = 4, panels = 10;
    const ms = towerMembers({ sides: n, panels });
    assert.ok(allFinite(ms));
    assert.equal(ms.filter((m) => m.role === "column").length, n);
    assert.equal(ms.filter((m) => m.role === "chord").length, n * panels);
    assert.equal(ms.filter((m) => m.role === "brace").length, n * panels * 2 + n, "X: two per face per panel, plus the mast struts");
    assert.ok(ms.some((m) => m.name === "Mast"));
    assert.equal(ms.filter((m) => m.role === "deck").length, 2 * n, "two walkway rings");
  });

  test("the legs taper from the base width to the top width and reach the height", () => {
    const ms = towerMembers({ sides: 4, baseWidth: 10000, topWidth: 2000, height: 50000, mast: 0, platforms: [] });
    const leg = ms.find((m) => m.role === "column");
    const [b, top] = [leg.pts[0], leg.pts[leg.pts.length - 1]];
    near(Math.abs(b[0]), 5000, 1e-6); near(Math.abs(b[1]), 5000, 1e-6);
    near(Math.abs(top[0]), 1000, 1e-6); near(top[2], 50000, 1e-6);
  });

  test("K and single-diagonal bracing", () => {
    const k = towerMembers({ bracing: "K", panels: 5, sides: 3, mast: 0 }).filter((m) => m.role === "brace").length;
    const z = towerMembers({ bracing: "Z", panels: 5, sides: 3, mast: 0 }).filter((m) => m.role === "brace").length;
    assert.equal(k, 5 * 3 * 4);
    assert.equal(z, 5 * 3);
  });
});

describe("bridges", () => {
  test("every type makes valid members", () => {
    for (const type of BRIDGE_TYPES) {
      const ms = bridgeMembers({ type, length: 200000, spans: 3 }).map((m) => normalizeMember({ ...m, level: "L" }));
      assert.ok(ms.length > 20, type);
      assert.ok(allFinite(ms), type);
      assert.ok(ms.every(memberValid), type);
    }
  });

  test("a straight alignment climbs with the grade; a crest rises in the middle", () => {
    const at = alignment({ ...BRIDGE_DEFAULTS, x: 0, y: 0, angle: 0, length: 100000, deckZ: 5000, grade: 2, crest: 1000 });
    near(at(0).z, 5000, 1e-9);
    near(at(100000).z, 7000, 1e-9);
    near(at(50000).z, 6000 + 1000, 1e-9, "grade + crest");
    near(at(50000).x, 50000, 1e-9);
  });

  test("a curved alignment keeps its radius", () => {
    const R = 200000;
    const at = alignment({ ...BRIDGE_DEFAULTS, x: 0, y: 0, angle: 0, length: 150000, radius: R });
    for (const s of [0, 40000, 150000]) { const a = at(s); near(Math.hypot(a.x, a.y - R), R, 1e-6, `s ${s}`); }
  });

  test("piers stand at the inner stations, down to the ground", () => {
    const ms = bridgeMembers({ type: "beam", length: 90000, spans: 3, deckZ: 10000, deckDepth: 2000, width: 8000 });
    const piers = ms.filter((m) => m.name === "Pier");
    assert.equal(piers.length, 2);
    for (const p of piers) { near(p.pts[0][2], 0, 1e-9); near(p.pts[1][2], 8000, 1e-9); }
    assert.deepEqual(bridgeSpans({ ...BRIDGE_DEFAULTS, type: "beam", length: 90000, spans: 3 }), [0, 30000, 60000, 90000]);
  });

  test("a suspension bridge: two towers, two main cables, hangers between them", () => {
    const ms = bridgeMembers({ type: "suspension", length: 450000, spans: 3 });
    assert.equal(ms.filter((m) => m.name === "Tower").length, 4);
    const cables = ms.filter((m) => m.name === "Main cable");
    assert.equal(cables.length, 2);
    // The cable sags below the tower tops in the middle of the main span.
    const c = cables[0], zs = c.pts.map((q) => q[2]);
    assert.ok(Math.min(...zs.slice(2, -2)) < Math.max(...zs) - 10000);
    assert.ok(ms.filter((m) => m.role === "hanger").length >= 20);
  });

  test("cable-stayed stays stay on the deck", () => {
    const L = 300000;
    const ms = bridgeMembers({ type: "cableStayed", length: L, spans: 3 });
    for (const m of ms.filter((x) => x.role === "cable")) { const s = m.pts[0][0]; assert.ok(s >= -1 && s <= L + 1, `stay foot at ${s}`); }
  });
});

describe("in the project", () => {
  test("add, edit (members made again) and remove a structure", () => {
    const p = fresh();
    const st = addStructure(p, "bridge", "L", { type: "truss", length: 60000, spans: 2 }, "Truss");
    const n1 = p.members.filter((m) => m.structure === st.id).length;
    assert.ok(n1 > 50);
    assert.ok(p.members.every((m) => m.group === st.id));
    updateStructure(p, st.id, { type: "beam" });
    const n2 = p.members.filter((m) => m.structure === st.id).length;
    assert.ok(n2 < n1);
    removeStructure(p, st.id);
    assert.equal(p.members.length, 0);
    assert.equal(p.structures.length, 0);
  });

  test("saved and read back; a structure without members is dropped", () => {
    const p = fresh();
    const st = addStructure(p, "tower", "L", { panels: 4 });
    const back = parseProject(serializeProject(p));
    assert.equal(back.structures.length, 1);
    assert.equal(back.members.length, p.members.length);
    back.members = [];
    assert.equal(normalizeProject(back).structures.length, 0);
    void st;
  });

  test("moving a bridge moves its parameters, so an edit rebuilds it in place", () => {
    const p = fresh();
    const st = addStructure(p, "bridge", "L", { type: "beam", length: 40000, spans: 2, x: 0, y: 0, angle: 0 });
    const ids = new Set(p.members.map((m) => m.id));
    transformElements(p, ids, (x, y) => [x + 1000, y + 2000]);
    assert.deepEqual([st.params.x, st.params.y], [1000, 2000]);
    const before = JSON.stringify(p.members.map((m) => m.pts));
    updateStructure(p, st.id, {});
    assert.equal(JSON.stringify(p.members.map((m) => m.pts)), before);
    // A quarter turn about the origin.
    transformElements(p, new Set(p.members.map((m) => m.id)), (x, y) => [-y, x]);
    near(st.params.angle, 90, 1e-6);
  });

  test("a pasted structure is a new one", () => {
    const p = fresh();
    const st = addStructure(p, "tower", "L", { panels: 3, x: 0, y: 0 });
    const clip = copyItems(p, p.members.map((m) => m.id));
    pasteItems(p, clip, "L", clip.centre[0] + 20000, clip.centre[1]);
    assert.equal(p.structures.length, 2);
    const other = p.structures.find((s) => s.id !== st.id);
    near(other.params.x, 20000, 1e-6);
    assert.equal(p.members.filter((m) => m.structure === other.id).length, p.members.filter((m) => m.structure === st.id).length);
  });

  test("3D: a tower builds with a handful of geometries and few draw calls", () => {
    const p = fresh();
    addStructure(p, "tower", "L", { ...TOWER_DEFAULTS, panels: 20 });
    addStructure(p, "bridge", "L", { type: "suspension", length: 400000, spans: 3, y: 60000 });
    const root = buildBuilding(THREE, p, makeMaterials(THREE, { textures: false }));
    const geos = new Set();
    let meshes = 0;
    root.traverse((o) => { if (o.isMesh) { meshes++; geos.add(o.geometry); } });
    assert.ok(meshes > 500);
    assert.ok(geos.size < 40, `${geos.size} geometries`);
    const b = createBatcher(THREE);
    b.build(root);
    let own = 0;
    root.traverse((o) => { if (o.isMesh && o.layers.isEnabled(0)) own++; });
    assert.ok(own + b.info().batches < 60, `${own + b.info().batches} draw calls for ${meshes} meshes`);
    assert.ok(modelExtent(p).top > 60000);
  });
});

describe("exchange", () => {
  test("IFC: members export as their classes and come back with their bridge", async () => {
    const { exportIfc, importIfc } = await import("../../src/io/ifc.js");
    for (const schema of ["IFC4", "IFC2X3"]) {
      const p = fresh();
      const st = addStructure(p, "bridge", "L", { type: "arch", length: 80000, spans: 1, deckZ: 6000 });
      p.members.push(normalizeMember({ id: "solo", level: "L", pts: [[0, 0, 0], [0, 0, 3000]], profile: "tube", w: 300, t: 10, role: "column" }));
      const text = exportIfc(normalizeProject(p), { schema });
      assert.ok(/IFCMEMBER\(/.test(text) && /IFCCOLUMN\(/.test(text) && /IFCBEAM\(/.test(text), schema);
      const back = normalizeProject(importIfc(text).project || importIfc(text));
      assert.equal(back.members.length, p.members.length, `${schema} members`);
      assert.equal(back.structures.length, 1, `${schema} structures`);
      assert.equal(back.structures[0].params.type, "arch");
      const solo = back.members.find((m) => !m.structure);
      assert.equal(solo.profile, "tube");
      assert.ok(back.members.filter((m) => m.structure).every((m) => m.structure === back.structures[0].id && m.group === m.structure));
      void st;
    }
  });

  test("IFC4.3: a bridge is an IfcBridge holding its members, and reads back", async () => {
    const { exportIfc, importIfc } = await import("../../src/io/ifc.js");
    const p = fresh();
    addStructure(p, "bridge", "L", { type: "suspension", length: 300000, spans: 3 }, "Big bridge");
    addStructure(p, "tower", "L", { panels: 3, x: 0, y: 80000 });
    const text = exportIfc(normalizeProject(p), { schema: "IFC4.3" });
    assert.match(text, /FILE_SCHEMA\(\('IFC4X3_ADD2'\)\);/);
    const bridge = /#(\d+)=IFCBRIDGE\('[^']*',#\d+,'Big bridge',.*\.SUSPENSION\.\);/.exec(text);
    assert.ok(bridge, "an IfcBridge of the suspension kind");
    assert.ok(text.split("\n").some((l) => l.includes("IFCRELCONTAINEDINSPATIALSTRUCTURE(") && l.endsWith(`,#${bridge[1]});`)), "its members are contained in it");
    assert.match(text, /\.SUSPENSION_CABLE\./);
    assert.match(text, /\.SUSPENDER\./);
    assert.ok(/IFCRELAGGREGATES\([^;]*#\d+,\(#\d+,#\d+\)\);/.test(text), "the site aggregates the building and the bridge");
    const back = normalizeProject(importIfc(text).project || importIfc(text));
    assert.equal(back.members.length, p.members.length);
    assert.equal(back.structures.length, 2);
    assert.equal(back.structures.find((s) => s.kind === "bridge").params.type, "suspension");
  });

  test("DXF: members on S-MEMB", async () => {
    const { exportDxf } = await import("../../src/io/dxf.js");
    const p = fresh();
    addStructure(p, "tower", "L", { panels: 3 });
    const text = exportDxf(p, { level: "L" });
    assert.ok(/\nS-MEMB\r?\n/.test(text));
  });
});
