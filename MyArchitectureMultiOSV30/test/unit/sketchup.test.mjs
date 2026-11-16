// Unit tests for the SketchUp-style project features: the data model
// (src/core/skmodel.js — components, tags, materials, section planes, guides,
// style; old files keep loading) and the edits (src/core/skops.js — solid
// tools, components, drawing and push/pull on faces, follow me, 3D move /
// copy arrays / rotate / scale, terrain, sections) and how plan edits
// (src/plan/ops.js) carry meshes along.
// Run: node --test test/unit/sketchup.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { newProject, normalizeProject, parseProject, serializeProject, newLevel, findItem } from "../../src/core/project.js";
import { meshVolume, isClosed, prismMesh, faceNormal, solidMesh, meshBounds } from "../../src/core/mesh.js";
import { componentById, instancesOf, STYLE_DEFAULTS, syncMeshSolid } from "../../src/core/skmodel.js";
import * as sk from "../../src/core/skops.js";
import { moveItems, rotateItems, mirrorItems, copyItems, pasteItems, scaleItems } from "../../src/plan/ops.js";
import { materialById, setProjectMaterials } from "../../src/lib/materials.js";

const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a} (tol ${tol})`);
const rect = (x, y, w, d) => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
function proj() {
  const p = normalizeProject(newProject("sk"));
  const L = p.levels[0].id;
  return { p, L };
}
const box = (p, L, x, y, w, d, h, extra = {}) => { const s = { id: `s${p.solids.length + 1}`, level: L, pts: rect(x, y, w, d), z0: 0, height: h, taper: 1, material: "concrete", ...extra }; p.solids.push(s); return s; };
const vol = (p, s) => meshVolume(solidMesh(p.solids.find((x) => x.id === s.id || x === s) || s));
const topOf = (m) => m.f.findIndex((_, i) => faceNormal(m, i)[2] > 0.99);

describe("data model", () => {
  test("an old project (no SketchUp data) loads with every new list and the default style", () => {
    const p = normalizeProject({ levels: [{ id: "L", name: "1F", elevation: 0 }], solids: [{ id: "s", level: "L", pts: rect(0, 0, 1000, 1000), height: 3000 }] });
    for (const k of ["components", "materials", "sections", "guides", "dims3d", "texts3d"]) assert.deepEqual(p[k], [], k);
    assert.deepEqual(p.style3d, STYLE_DEFAULTS);
    assert.equal(p.solids[0].mesh, undefined, "a prism stays a prism");
  });
  test("a mass with a mesh takes its footprint, base and height from the mesh; bad meshes are dropped", () => {
    const p = normalizeProject({ levels: [{ id: "L" }], solids: [
      { id: "m", level: "L", mesh: prismMesh(rect(0, 0, 2000, 1000), 500, 3500) },
      { id: "bad", level: "L", pts: rect(0, 0, 1000, 1000), height: 2000, mesh: { v: [[0, 0, 0]], f: [{ l: [0, 9, 3] }] } },
    ] });
    const m = p.solids.find((s) => s.id === "m");
    near(m.z0, 500); near(m.height, 3000);
    assert.equal(m.pts.length, 4);
    const bad = p.solids.find((s) => s.id === "bad");
    assert.equal(bad.mesh, undefined);
    near(bad.height, 2000);
  });
  test("components, materials, sections and notes are cleaned; one active section; lost definitions fall back", () => {
    const p = normalizeProject({ levels: [{ id: "L" }], components: [{ id: "c1", name: "Win", mesh: prismMesh(rect(-500, -50, 1000, 100), 0, 1200) }, { name: "Broken" }],
      materials: [{ id: "mat-1", color: "red", tile: -5, opacity: 9 }, { nope: 1 }],
      sections: [{ o: [0, 0, 1000], n: [0, 0, 5], active: true }, { o: [1, 2, 3], n: [1, 0, 0], active: true }],
      guides: [{ a: [0, 0, 0], b: [1000, 0, 0] }, { b: [1, 1, 1] }], dims3d: [{ a: [0, 0, 0], b: [1, 0, 0] }], texts3d: [{ at: [0, 0, 0], text: 42 }],
      furniture: [{ id: "f", level: "L", kind: "component", comp: "gone", x: 0, y: 0 }], style3d: { edges: true, edgeColor: "nope", profileWidth: 99 } });
    assert.equal(p.components.length, 2);
    assert.deepEqual(componentById(p, "c1").size, [1000, 100, 1200]);
    assert.equal(p.materials.length, 1);
    assert.equal(p.materials[0].color, "#cccccc");
    assert.equal(p.materials[0].tile, 10);
    assert.equal(p.materials[0].opacity, 1);
    assert.deepEqual(p.sections.map((s) => s.active), [true, false]);
    assert.deepEqual(p.sections[0].n, [0, 0, 1]);
    assert.equal(p.guides.length, 1);
    assert.equal(p.texts3d[0].text, "42");
    assert.equal(p.furniture[0].kind, "box");
    assert.equal(p.style3d.edges, true);
    assert.equal(p.style3d.edgeColor, STYLE_DEFAULTS.edgeColor);
    assert.equal(p.style3d.profileWidth, 12);
  });
  test("a project's own materials are looked up before the library (and can edit a library material)", () => {
    normalizeProject({ levels: [{ id: "L" }], materials: [{ id: "mat-red", name: "Red", color: "#ff0000", tile: 500 }, { id: "brick", color: "#00ff00", tile: 2000 }] });
    assert.equal(materialById("mat-red").color, "#ff0000");
    assert.equal(materialById("brick").color, "#00ff00");
    assert.equal(materialById("brick").pattern, "brick", "an edited library material keeps its pattern");
    setProjectMaterials([]);
    assert.equal(materialById("brick").color, "#a65a42");
  });
  test("everything survives save and load", () => {
    const { p, L } = proj();
    const s = box(p, L, 0, 0, 2000, 2000, 2000);
    sk.makeComponent(p, [s.id], { name: "Cube" });
    sk.addSection(p, [0, 0, 1000], [0, 0, -1]);
    sk.addGuide(p, [0, 0, 0], [1000, 0, 0]);
    p.layers.push({ id: "t1", name: "Trees", color: "#00aa00", visible: true });
    p.furniture[0].layer = "t1";
    const q = parseProject(serializeProject(p));
    assert.equal(q.components.length, 1);
    assert.equal(q.furniture[0].comp, q.components[0].id);
    assert.equal(q.furniture[0].layer, "t1");
    assert.equal(q.sections.length, 1);
    assert.equal(q.guides.length, 1);
  });
});

describe("solid tools on the project", () => {
  test("union, subtract (cutter goes), trim (cutter stays), intersect and split", () => {
    const run = (op) => { const { p, L } = proj(); const a = box(p, L, 0, 0, 2000, 1000, 1000, { material: "brick" }); const b = box(p, L, 1000, 0, 2000, 1000, 1000, { material: "glass" }); return { p, r: sk.solidTool(p, op, [a.id, b.id]) }; };
    let { p, r } = run("union");
    assert.equal(p.solids.length, 1); near(vol(p, p.solids[0]), 3e9, 10);
    assert.ok(isClosed(p.solids[0].mesh));
    ({ p, r } = run("subtract"));
    assert.equal(p.solids.length, 1); near(vol(p, p.solids[0]), 1e9, 10);
    ({ p, r } = run("trim"));
    assert.equal(p.solids.length, 2); near(vol(p, p.solids.find((s) => s.id === r.ids[0])), 1e9, 10);
    ({ p, r } = run("intersect"));
    assert.equal(p.solids.length, 1); near(vol(p, p.solids[0]), 1e9, 10);
    ({ p, r } = run("split"));
    assert.equal(p.solids.length, 3);
    for (const s of p.solids) near(vol(p, s), 1e9, 10);
  });
  test("solids on an upper level keep their height (meshes are stored from the level floor)", () => {
    const { p } = proj();
    const up = newLevel("2F", 3000);
    p.levels.push(up);
    const a = box(p, up.id, 0, 0, 1000, 1000, 1000), b = box(p, up.id, 500, 0, 1000, 1000, 1000);
    sk.solidTool(p, "union", [a.id, b.id]);
    near(p.solids[0].z0, 0); near(p.solids[0].height, 1000);
  });
  test("an open surface is refused by the solid tools", () => {
    const { p, L } = proj();
    const a = box(p, L, 0, 0, 1000, 1000, 1000);
    const f = sk.drawLoop(p, [[0, 0, 500], [2000, 0, 500], [2000, 2000, 500], [0, 2000, 500]], { level: L });
    assert.throws(() => sk.solidTool(p, "union", [a.id, f.id]), /closed solid/);
  });
  test("intersect faces imprints the edges on both masses", () => {
    const { p, L } = proj();
    const a = box(p, L, 0, 0, 2000, 2000, 2000), b = box(p, L, 1000, 1000, 2000, 2000, 2000);
    assert.equal(sk.intersectFaces(p, [a.id, b.id]), 2);
    assert.ok(p.solids[0].mesh.f.length > 6);
    near(vol(p, p.solids[0]), 8e9, 10);
  });
});

describe("components", () => {
  test("make a component from masses: one definition, one instance in their place", () => {
    const { p, L } = proj();
    const a = box(p, L, 1000, 1000, 2000, 1000, 1000, { material: "brick" }), b = box(p, L, 1000, 2000, 1000, 1000, 3000);
    const { def, inst } = sk.makeComponent(p, [a.id, b.id], { name: "Block" });
    assert.equal(p.solids.length, 0);
    assert.deepEqual(def.size, [2000, 2000, 3000]);
    assert.deepEqual([inst.x, inst.y, inst.elevation], [2000, 2000, 0]);
    near(meshVolume(sk.instanceWorldMesh(p, inst)), 2e9 + 3e9, 10);
    assert.ok(def.mesh.f.every((f) => f.m), "materials baked into the definition");
  });
  test("editing the definition updates every instance; make unique splits one off", () => {
    const { p, L } = proj();
    const { def, inst } = sk.makeComponent(p, [box(p, L, 0, 0, 1000, 1000, 1000).id], { name: "C" });
    const i2 = sk.placeComponent(p, def.id, L, 5000, 0);
    i2.w = 2000; // a stretched instance
    const m = def.mesh;
    const r = sk.pushPullFace(p, { kind: "comp", def: def.id }, topOf(m), 1000);
    assert.equal(r.mode, "stretch");
    assert.equal(componentById(p, def.id).size[2], 2000);
    assert.equal(inst.h, 2000);
    assert.equal(i2.w, 2000, "stretched instance keeps its stretch");
    near(meshVolume(sk.instanceWorldMesh(p, i2)), 2000 * 1000 * 2000, 10);
    assert.equal(sk.makeUnique(p, [i2.id]), 1);
    assert.notEqual(i2.comp, inst.comp);
    assert.equal(p.components.length, 2);
    assert.equal(instancesOf(p, def.id).length, 1);
  });
  test("explode, replace and the furniture definitions (same kind = same definition)", () => {
    const { p, L } = proj();
    const { inst } = sk.makeComponent(p, [box(p, L, 0, 0, 1000, 1000, 1000).id]);
    inst.rot = 90;
    const s = sk.explodeInstance(p, inst.id);
    near(meshVolume(s.mesh), 1e9, 10);
    assert.equal(p.furniture.length, 0);
    p.furniture.push({ id: "a", level: L, kind: "sofa3", x: 0, y: 0, w: 2000, d: 900, h: 800 }, { id: "b", level: L, kind: "sofa3", x: 3000, y: 0, w: 2100, d: 900, h: 800 }, { id: "c", level: L, kind: "bed", x: 0, y: 0, w: 1, d: 1, h: 1 });
    assert.deepEqual(sk.sameDefinition(p, "a").sort(), ["a", "b"]);
    p.furniture[0].color = "#112233";
    assert.equal(sk.applyToInstances(p, "a"), 1);
    assert.equal(p.furniture[1].w, 2000);
    assert.equal(p.furniture[1].color, "#112233");
    const def = sk.makeComponent(p, [box(p, L, 0, 0, 500, 500, 500).id]).def;
    assert.equal(sk.replaceInstances(p, ["c"], { comp: def.id }), 1);
    assert.equal(p.furniture.find((f) => f.id === "c").kind, "component");
  });
  test("a cutting component glues into a wall as an opening", () => {
    const { p, L } = proj();
    p.walls.push({ id: "w", level: L, x1: 0, y1: 0, x2: 6000, y2: 0, thickness: 200 });
    const { def } = sk.makeComponent(p, [box(p, L, 0, 0, 1200, 100, 1500).id], { name: "Window", cut: true });
    const o = sk.glueComponent(p, def.id, "w", sk.wallAt(p.walls[0], 3000, 50));
    assert.equal(o.kind, "opening");
    assert.equal(o.comp, def.id);
    assert.deepEqual([o.at, o.width, o.height, o.sill], [3000, 1200, 1500, 900]);
    assert.equal(instancesOf(p, def.id).length, 2);
    const q = normalizeProject(JSON.parse(JSON.stringify(p)));
    assert.equal(q.openings[0].comp, def.id);
  });
  test("copy and paste carry the definition along to another drawing", () => {
    const { p, L } = proj();
    const { inst } = sk.makeComponent(p, [box(p, L, 0, 0, 1000, 1000, 1000).id]);
    const clip = copyItems(p, [inst.id]);
    const { p: q, L: L2 } = proj();
    const ids = pasteItems(q, clip, L2, 5000, 5000);
    assert.equal(q.components.length, 1);
    assert.equal(findItem(q, ids[0]).obj.comp, q.components[0].id);
  });
});

describe("drawing, push/pull and follow me in 3D", () => {
  test("a rectangle drawn on top of a mass becomes a face that pulls up into a tower", () => {
    const { p, L } = proj();
    const s = box(p, L, 0, 0, 6000, 6000, 3000);
    const r = sk.drawLoop(p, [[2000, 2000, 3000], [4000, 2000, 3000], [4000, 4000, 3000], [2000, 4000, 3000]], { level: L, hit: { kind: "solids", id: s.id, face: topOf(solidMesh(s)) } });
    assert.equal(r.imprinted, true);
    assert.ok(s.mesh, "the prism became a mesh");
    const pp = sk.pushPullFace(p, { kind: "solids", id: s.id }, r.face, 6000);
    assert.equal(pp.mode, "extrude");
    near(meshVolume(s.mesh), 6000 * 6000 * 3000 + 2000 * 2000 * 6000, 100);
    near(s.height, 9000);
    assert.ok(isClosed(s.mesh));
  });
  test("a rectangle drawn on the ground is a face; pulled up it is a closed box", () => {
    const { p, L } = proj();
    const r = sk.drawLoop(p, [[0, 0, 0], [3000, 0, 0], [3000, 2000, 0], [0, 2000, 0]], { level: L });
    assert.equal(r.imprinted, false);
    const s = p.solids.find((x) => x.id === r.id);
    sk.pushPullFace(p, { kind: "solids", id: s.id }, 0, 2500);
    assert.ok(isClosed(s.mesh));
    near(meshVolume(s.mesh), 3000 * 2000 * 2500, 10);
  });
  test("pushing a face of a mass in carves a recess; a line across a face splits it", () => {
    const { p, L } = proj();
    const s = box(p, L, 0, 0, 4000, 1000, 3000);
    const front = solidMesh(s).f.findIndex((_, i) => faceNormal(solidMesh(s), i)[1] < -0.99);
    const r = sk.drawLoop(p, [[1000, 0, 1000], [3000, 0, 1000], [3000, 0, 2000], [1000, 0, 2000]], { level: L, hit: { kind: "solids", id: s.id, face: front } });
    const pp = sk.pushPullFace(p, { kind: "solids", id: s.id }, r.face, -300);
    assert.equal(pp.mode, "carve");
    near(meshVolume(s.mesh), 12e9 - 2000 * 1000 * 300, 100);
    const t = sk.drawLine(p, [[0, 500, 3000], [4000, 500, 3000]], { level: L, hit: { kind: "solids", id: s.id, face: topOf(s.mesh) } });
    assert.equal(t.split, true);
    assert.ok(isClosed(s.mesh));
  });
  test("an open line is kept as loose edges; follow me sweeps a face along them", () => {
    const { p, L } = proj();
    const path = sk.drawLine(p, [[0, 0, 0], [5000, 0, 0], [5000, 3000, 0]], { level: L });
    const chain = sk.edgeChainWorld(p, path.id);
    assert.equal(chain.pts.length, 3);
    assert.equal(chain.closed, false);
    const prof = sk.drawLoop(p, [[0, -100, 0], [0, 100, 0], [0, 100, 300], [0, -100, 300]], { level: L, towards: [-1, 0, 0] });
    const s = sk.followMeOp(p, { id: prof.id, face: 0 }, chain.pts);
    assert.ok(isClosed(s.mesh));
    assert.ok(Math.abs(meshVolume(s.mesh)) > 200 * 300 * 7000, "swept along both segments");
    assert.equal(p.solids.some((x) => x.id === prof.id), false, "the lone profile face is used up");
  });
  test("follow me around the top face of a mass (a cornice)", () => {
    const { p, L } = proj();
    const s = box(p, L, 0, 0, 10000, 6000, 3000);
    const loop = sk.faceLoopWorld(p, s.id, topOf(solidMesh(s)))[0];
    const prof = sk.drawLoop(p, [[0, 0, 3000], [0, -300, 3000], [0, -300, 3300], [0, 0, 3300]], { level: L, towards: [-1, 0, 0] });
    const c = sk.followMeOp(p, { id: prof.id, face: 0 }, loop, { closed: true });
    assert.ok(isClosed(c.mesh));
    near(meshVolume(c.mesh), 300 * 300 * (2 * (10300 + 6300)), 1e3);
  });
});

describe("move, copy, rotate and scale in 3D", () => {
  test("move lifts masses (and their meshes) and furniture", () => {
    const { p, L } = proj();
    const a = box(p, L, 0, 0, 1000, 1000, 1000);
    const b = box(p, L, 3000, 0, 1000, 1000, 1000);
    sk.toMeshSolid(b);
    p.furniture.push({ id: "f", level: L, kind: "sofa3", x: 0, y: 0, w: 2000, d: 900, h: 800, elevation: 0 });
    sk.moveItems3d(p, [a.id, b.id, "f"], [100, 200, 500]);
    assert.deepEqual([a.pts[0], a.z0], [[100, 200], 500]);
    near(meshBounds(b.mesh).z1, 500); near(meshBounds(b.mesh).x1, 3100);
    assert.equal(p.furniture[0].elevation, 500);
  });
  test("copy arrays: ×4 at the distance, /4 between", () => {
    const { p, L } = proj();
    const a = box(p, L, 0, 0, 1000, 1000, 1000);
    const ids = sk.copyItems3d(p, [a.id], [2000, 0, 0], { n: 4 });
    assert.equal(ids.length, 4);
    assert.deepEqual(ids.map((id) => findItem(p, id).obj.pts[0][0]), [2000, 4000, 6000, 8000]);
    const ids2 = sk.copyItems3d(p, [a.id], [0, 8000, 1000], { n: 4, divide: true });
    assert.deepEqual(ids2.map((id) => findItem(p, id).obj.pts[0][1]), [2000, 4000, 6000, 8000]);
    assert.deepEqual(ids2.map((id) => findItem(p, id).obj.z0), [250, 500, 750, 1000]);
  });
  test("rotate about a vertical axis (polar array), and tip a mass about a horizontal axis", () => {
    const { p, L } = proj();
    const a = box(p, L, 4000, -500, 1000, 1000, 1000);
    const r = sk.rotateItems3d(p, [a.id], [0, 0, 0], [0, 0, 1], 90, { copies: 3 });
    assert.equal(r.ids.length, 3);
    const c = findItem(p, r.ids[0]).obj;
    near(Math.min(...c.pts.map((q) => q[1])), 4000, 1e-6);
    const b = box(p, L, 0, 0, 1000, 1000, 3000);
    sk.rotateItems3d(p, [b.id], [0, 0, 0], [1, 0, 0], 90);
    assert.ok(b.mesh);
    near(meshVolume(b.mesh), 3e9, 10);
    near(b.height, 1000, 1e-6);
  });
  test("scale masses about a point, non-uniformly, and furniture by its own axes", () => {
    const { p, L } = proj();
    const a = box(p, L, 1000, 0, 1000, 1000, 1000);
    sk.scaleItems3d(p, [a.id], [0, 0, 0], [2, 1, 3]);
    near(meshVolume(a.mesh), 6e9, 10);
    near(meshBounds(a.mesh).x1, 2000);
    p.furniture.push({ id: "f", level: L, kind: "sofa3", x: 1000, y: 0, w: 2000, d: 900, h: 800, rot: 90, elevation: 0 });
    sk.scaleItems3d(p, ["f"], [0, 0, 0], [2, 1, 1]);
    const f = p.furniture[0];
    assert.deepEqual([f.x, f.w, f.d], [2000, 2000, 1800]);
  });
  test("plan move / rotate / mirror / scale keep a mesh mass closed and in step with its footprint", () => {
    const { p, L } = proj();
    const a = sk.toMeshSolid(box(p, L, 0, 0, 2000, 1000, 1000));
    moveItems(p, [a.id], 500, 0);
    rotateItems(p, [a.id], 30, [0, 0]);
    mirrorItems(p, [a.id], "x");
    scaleItems(p, [a.id], 2);
    assert.ok(isClosed(a.mesh));
    near(meshVolume(a.mesh), 2e9 * 8, 1e3);
    const q = JSON.parse(JSON.stringify(a));
    syncMeshSolid(q);
    for (let i = 0; i < 4; i++) near(Math.min(...q.pts.map((x) => Math.hypot(x[0] - a.pts[i][0], x[1] - a.pts[i][1]))), 0, 1);
  });
});

describe("terrain, sections, guides and the eraser", () => {
  test("terrain from contour lines in the plan, then smoove a hill", () => {
    const { p, L } = proj();
    p.drawings.push({ id: "c1", level: L, kind: "polyline", layer: "0", pts: [[0, 0], [20000, 0]], z: 0 }, { id: "c2", level: L, kind: "polyline", layer: "0", pts: [[0, 10000], [20000, 10000]], z: 3000 });
    const t = sk.terrainFromDrawings(p, ["c1", "c2"], { cell: 1000 });
    assert.equal(t.terrain, true);
    near(t.height, 3000, 1);
    const h0 = meshBounds(t.mesh).z2;
    sk.smooveTerrain(p, t.id, 10000, 5000, 4000, 2000);
    assert.ok(meshBounds(t.mesh).z2 >= h0, "raised");
    assert.throws(() => sk.terrainFromDrawings(p, []));
  });
  test("section planes: one active at a time, flip and move", () => {
    const { p } = proj();
    const a = sk.addSection(p, [0, 0, 1200], [0, 0, -1]);
    const b = sk.addSection(p, [0, 0, 0], [1, 0, 0]);
    assert.deepEqual(p.sections.map((s) => s.active), [false, true]);
    sk.activateSection(p, a.id);
    assert.deepEqual(p.sections.map((s) => s.active), [true, false]);
    sk.activateSection(p, a.id);
    assert.ok(p.sections.every((s) => !s.active), "clicking the active one switches it off");
    sk.flipSection(p, b.id);
    assert.deepEqual(b.n, [-1, 0, 0]);
    sk.moveSection(p, a.id, 300);
    assert.deepEqual(a.o, [0, 0, 1500]);
  });
  test("guides, 3D dimensions and text are erased like any item", () => {
    const { p, L } = proj();
    const g = sk.addGuide(p, [0, 0, 0], [1, 0, 0]);
    const d = sk.addDim3d(p, [0, 0, 0], [1000, 0, 0], [0, -500, 0]);
    const t = sk.addText3d(p, [0, 0, 0], "Entrance");
    const s = box(p, L, 0, 0, 1000, 1000, 1000);
    assert.equal(sk.eraseIds(p, [g.id, d.id, t.id, s.id]), 4);
    assert.equal(p.guides.length + p.dims3d.length + p.texts3d.length + p.solids.length, 0);
  });
});

describe("exchange", () => {
  test("IFC: a mesh mass (with a hole in a face) is a faceted Brep and comes back exactly", async () => {
    const { exportIfc, importIfc } = await import("../../src/io/ifc.js");
    const { p, L } = proj();
    const s = box(p, L, 0, 0, 4000, 4000, 1000, { name: "Slab with a hole" });
    const r = sk.drawLoop(p, [[1000, 1000, 1000], [3000, 1000, 1000], [3000, 3000, 1000], [1000, 3000, 1000]], { level: L, hit: { kind: "solids", id: s.id, face: topOf(solidMesh(s)) } });
    sk.pushPullFace(p, { kind: "solids", id: s.id }, r.face, -1000);
    const text = exportIfc(p, { schema: "IFC4" });
    assert.match(text, /IFCFACETEDBREP/);
    const q = importIfc(text).project || importIfc(text);
    const m = (q.solids || []).find((x) => x.name === "Slab with a hole");
    assert.ok(m && m.mesh, "mesh read back");
    near(meshVolume(m.mesh), 16e9 - 4e9, 100);
  });
  test("DXF export of a project with mesh masses, components and terrain works", async () => {
    const { exportDxf } = await import("../../src/io/dxf.js");
    const { p, L } = proj();
    sk.makeComponent(p, [box(p, L, 0, 0, 1000, 1000, 1000).id]);
    sk.terrainFromScratch(p, L, { w: 10000, d: 10000, nx: 5, ny: 5 });
    sk.drawLine(p, [[0, 0, 0], [1000, 0, 0]], { level: L });
    assert.ok(exportDxf(normalizeProject(p), { level: L }).length > 1000);
  });
});
