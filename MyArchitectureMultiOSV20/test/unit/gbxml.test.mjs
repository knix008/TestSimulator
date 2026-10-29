// gbXML export (src/io/gbxmlwrite.js) and the pitched-roof reconstruction of
// the gbXML import (src/io/roofrebuild.js): the structure of the written
// model (spaces, surfaces with their types and adjacent spaces, outward
// polygons, openings, constructions, site), the round trip through our own
// importer for a hand-made house and for every sample, gable / hip / shed
// roofs rebuilt from their faces at any angle, faces that fit none of them
// kept as a mass solid, and — when xmllint and the gbXML schemas are at hand
// (MYARCH_XSD_DIR with GreenBuildingXML_Ver7.03.xsd and _Ver6.01.xsd) —
// validity against the official XSD.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import * as THREE from "../../src/vendor/three/three.module.js";
import { exportGbxml, gbxmlModel } from "../../src/io/gbxmlwrite.js";
import { importGbxml } from "../../src/io/gbxml.js";
import { rebuildRoofs, fitRoof, groupFaces } from "../../src/io/roofrebuild.js";
import { parseXml, kids, kid, kidText, textOf, descendants, rootElement } from "../../src/io/bimkit.js";
import { newProject, normalizeProject, parseProject } from "../../src/core/project.js";
import { roofModel } from "../../src/core/roof.js";
import { buildBuilding, makeMaterials } from "../../src/view3d/build.js";

const TS = "2026-01-02T03:04:05";
const root = path.resolve(import.meta.dirname, "..", "..");
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≈ ${b}`);

// Two rooms on the ground floor split by a drywall partition, a room above
// the west one under a gable roof, the east one with a flat top.
function house() {
  const p = newProject("Test house");
  const L1 = p.levels[0];
  Object.assign(L1, { id: "L1", height: 3000 });
  p.levels.push({ id: "L2", name: "2F", elevation: 3000, height: 2800, slab: 200 });
  Object.assign(p.meta, { latitude: 37.5665, longitude: 126.978, address: "Seoul", north: 30 });
  const ext = (id, x1, y1, x2, y2, level = "L1") => ({ id, level, x1, y1, x2, y2, thickness: 300, height: null, type: "ext-brick-300" });
  p.walls.push(ext("wN", 0, 0, 8000, 0), ext("wE", 8000, 0, 8000, 6000), ext("wS", 8000, 6000, 0, 6000), ext("wW", 0, 6000, 0, 0),
    { id: "wI", level: "L1", x1: 4000, y1: 0, x2: 4000, y2: 6000, thickness: 100, height: null, type: "int-drywall-100" },
    ext("uN", 0, 0, 4000, 0, "L2"), ext("uE", 4000, 0, 4000, 6000, "L2"), ext("uS", 4000, 6000, 0, 6000, "L2"), ext("uW", 0, 6000, 0, 0, "L2"));
  p.openings.push(
    { id: "d1", wall: "wI", kind: "door", type: "single", at: 3000, width: 900, height: 2100, sill: 0 },
    { id: "d2", wall: "wS", kind: "door", type: "sliding", at: 6000, width: 1800, height: 2100, sill: 0 },
    { id: "n1", wall: "wS", kind: "window", type: "casement", at: 2000, width: 1200, height: 1200, sill: 900 },
    { id: "n2", wall: "uN", kind: "window", type: "fixed", at: 2000, width: 1000, height: 1000, sill: 1000 },
  );
  p.rooms.push(
    { id: "r1", level: "L1", name: "Living", number: "101", pts: [[150, 150], [3950, 150], [3950, 5850], [150, 5850]] },
    { id: "r2", level: "L1", name: "Kitchen", pts: [[4050, 150], [7850, 150], [7850, 5850], [4050, 5850]] },
    { id: "r3", level: "L2", name: "Bedroom", pts: [[150, 150], [3850, 150], [3850, 5850], [150, 5850]] },
  );
  p.roofs.push({ id: "rf1", level: "L2", kind: "gable", pts: [[0, 0], [4000, 0], [4000, 6000], [0, 6000]], pitch: 35, overhang: 400, thickness: 200 });
  return normalizeProject(p);
}

// The written file as data: spaces, surfaces (type, adjacency, polygon), constructions.
function readBack(xml) {
  const g = rootElement(parseXml(xml));
  const loop = (el) => kids(kid(kid(el, "PlanarGeometry"), "PolyLoop"), "CartesianPoint").map((cp) => kids(cp, "Coordinate").map((c) => +textOf(c)));
  const campus = kid(g, "Campus");
  const spaces = new Map(descendants(campus, "Space").map((s) => [s.attrs.id, s]));
  const surfaces = kids(campus, "Surface").map((s) => ({
    el: s, id: s.attrs.id, type: s.attrs.surfaceType, con: s.attrs.constructionIdRef,
    adj: kids(s, "AdjacentSpaceId").map((a) => [a.attrs.spaceIdRef, a.attrs.surfaceType]), loop: loop(s),
    openings: kids(s, "Opening").map((o) => ({ type: o.attrs.openingType, loop: loop(o) })),
  }));
  return { g, campus, spaces, surfaces };
}
function newell(pts) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]); }
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
const mean = (pts) => pts.reduce((s, q) => [s[0] + q[0] / pts.length, s[1] + q[1] / pts.length, s[2] + q[2] / pts.length], [0, 0, 0]);
// Centre of a space's closed shell.
const shellCentre = (sp) => mean(descendants(kid(sp, "ShellGeometry"), "CartesianPoint").map((cp) => kids(cp, "Coordinate").map((c) => +textOf(c))));

describe("gbXML export", () => {
  const p = house();
  const xml = exportGbxml(p, { timestamp: TS });
  const { g, campus, spaces, surfaces } = readBack(xml);

  test("header, site, building, storeys and spaces", () => {
    assert.equal(g.attrs.version, "7.03");
    assert.equal(g.attrs.lengthUnit, "Meters");
    const loc = kid(campus, "Location");
    assert.equal(+kidText(loc, "Latitude"), 37.5665);
    assert.equal(+kidText(loc, "Longitude"), 126.978);
    assert.equal(kidText(loc, "Name"), "Seoul");
    assert.equal(+kidText(loc, "CADModelAzimuth"), 330, "the model's y axis is 330° from true north when north is 30° clockwise of up");
    const b = kid(campus, "Building");
    assert.deepEqual(kids(b, "BuildingStorey").map((s) => [kidText(s, "Name"), +kidText(s, "Level")]), [["1F", 0], ["2F", 3]]);
    assert.equal(spaces.size, 3);
    const living = spaces.get("sp-r1");
    assert.equal(kidText(living, "Name"), "Living");
    near(+kidText(living, "Area"), 3.8 * 5.7, 1e-3, "area m²");
    near(+kidText(living, "Volume"), 3.8 * 5.7 * 3, 1e-3, "volume m³");
    assert.equal(living.attrs.buildingStoreyIdRef, "st-1");
    assert.equal(kids(kid(kid(living, "ShellGeometry"), "ClosedShell"), "PolyLoop").length, 6, "a box: floor, top and four sides");
    near(+kidText(b, "Area"), (3.8 * 5.7) * 2 + 3.7 * 5.7, 1e-3, "building area");
  });

  test("closed shells face outwards (positive volume by the divergence theorem)", () => {
    for (const sp of spaces.values()) {
      let vol = 0;
      for (const pl of kids(kid(kid(sp, "ShellGeometry"), "ClosedShell"), "PolyLoop")) {
        const q = kids(pl, "CartesianPoint").map((cp) => kids(cp, "Coordinate").map((c) => +textOf(c)));
        for (let i = 1; i + 1 < q.length; i++) { const a = q[0], b2 = q[i], c = q[i + 1]; vol += (a[0] * (b2[1] * c[2] - b2[2] * c[1]) - a[1] * (b2[0] * c[2] - b2[2] * c[0]) + a[2] * (b2[0] * c[1] - b2[1] * c[0])) / 6; }
      }
      near(vol, +kidText(sp, "Volume"), 1e-3, `${sp.attrs.id} shell volume`);
    }
  });

  test("surface types and the spaces on either side", () => {
    const types = (t) => surfaces.filter((s) => s.type === t);
    const inner = types("InteriorWall");
    assert.equal(inner.length, 1, "the partition");
    assert.deepEqual(inner[0].adj.map((a) => a[0]).sort(), ["sp-r1", "sp-r2"]);
    assert.ok(inner[0].loop.every((q) => Math.abs(q[0] - 4) < 1e-6), "on the wall centre line x = 4 m");
    // The north and south walls are split where the room beside them changes.
    const ext = types("ExteriorWall").filter((s) => !/Gable/.test(kidText(s.el, "Name")));
    assert.equal(ext.length, 2 + 2 + 1 + 1 + 4, "north and south in two pieces, east, west, four upstairs walls");
    for (const s of ext) assert.equal(s.adj.length, 1);
    assert.equal(types("SlabOnGrade").length, 2);
    const floor = types("InteriorFloor");
    assert.equal(floor.length, 1, "the bedroom floor is the living room ceiling");
    assert.deepEqual(floor[0].adj, [["sp-r3", "InteriorFloor"], ["sp-r1", "Ceiling"]]);
    const roofs = types("Roof");
    assert.equal(roofs.length, 3, "two gable slopes and the kitchen's flat top");
    assert.equal(roofs.filter((s) => Math.abs(newell(s.loop)[2]) > 0.999).length, 1);
    assert.equal(types("ExteriorWall").filter((s) => /Gable/.test(kidText(s.el, "Name"))).length, 2, "two gable ends");
    for (const s of surfaces) assert.ok(kid(s.el, "RectangularGeometry"), `${s.id} has a RectangularGeometry`);
  });

  test("every polygon is counter-clockwise from outside its first space", () => {
    for (const s of surfaces) {
      if (!s.adj.length) continue;
      const n = newell(s.loop);
      const c = mean(s.loop), o = shellCentre(spaces.get(s.adj[0][0]));
      const out = [c[0] - o[0], c[1] - o[1], c[2] - o[2]];
      assert.ok(n[0] * out[0] + n[1] * out[1] + n[2] * out[2] > 0, `${s.id} (${s.type}) faces away from ${s.adj[0][0]}`);
    }
    for (const s of surfaces.filter((x) => x.type === "SlabOnGrade")) assert.ok(newell(s.loop)[2] < -0.999, "slab normals point down");
  });

  test("doors and windows are openings in their wall surface, in its plane", () => {
    const all = surfaces.flatMap((s) => s.openings.map((o) => ({ ...o, s })));
    assert.deepEqual(all.map((o) => o.type).sort(), ["FixedWindow", "NonSlidingDoor", "OperableWindow", "SlidingDoor"]);
    assert.equal(all.find((o) => o.type === "NonSlidingDoor").s.type, "InteriorWall");
    for (const o of all) {
      const n = newell(o.s.loop), m = newell(o.loop);
      assert.ok(n[0] * m[0] + n[1] * m[1] + n[2] * m[2] > 0.999, "same orientation as the wall");
      const d0 = n[0] * o.s.loop[0][0] + n[1] * o.s.loop[0][1] + n[2] * o.s.loop[0][2];
      for (const q of o.loop) near(n[0] * q[0] + n[1] * q[1] + n[2] * q[2], d0, 1e-6, "coplanar");
    }
    const win = all.find((o) => o.type === "OperableWindow");
    const zs = win.loop.map((q) => q[2]);
    near(Math.min(...zs), 0.9, 1e-6, "sill");
    near(Math.max(...zs), 2.1, 1e-6, "head");
  });

  test("constructions, layers and materials from the wall types", () => {
    const con = kids(g, "Construction").find((c) => c.attrs.id === "con-ext-brick-300");
    assert.ok(con);
    assert.equal(kidText(con, "Name"), "Exterior brick cavity 300");
    const layer = kids(g, "Layer").find((l) => l.attrs.id === kid(con, "LayerId").attrs.layerIdRef);
    const mats = kids(layer, "MaterialId").map((m) => kids(g, "Material").find((x) => x.attrs.id === m.attrs.materialIdRef));
    assert.deepEqual(mats.map((m) => +kidText(m, "Thickness")), [0.1, 0.08, 0.1, 0.02], "outside to inside");
    assert.equal(kid(mats[1], "Conductivity").attrs.unit, "WPerMeterK");
    for (const s of surfaces) assert.ok(kids(g, "Construction").some((c) => c.attrs.id === s.con), `${s.id} construction exists`);
    const ids = [...xml.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, "ids are unique");
  });

  test("reads back through our importer: levels, walls, openings, rooms, the gable roof, north", () => {
    const back = importGbxml(xml).project;
    assert.equal(back.levels.length, 2);
    assert.equal(back.walls.length, p.walls.length, "pieces of one wall join again (CADObjectId)");
    assert.equal(back.openings.length, p.openings.length);
    assert.deepEqual(back.rooms.map((r) => r.name).sort(), ["Bedroom", "Kitchen", "Living"]);
    const thick = back.walls.map((w) => w.thickness).sort((a, b) => a - b);
    assert.deepEqual([thick[0], thick[thick.length - 1]], [100, 300], "thickness from the constructions");
    const gable = back.roofs.find((r) => r.kind === "gable");
    assert.ok(gable, "the gable roof is a gable roof again");
    near(gable.pitch, 35, 0.05, "pitch");
    const m0 = roofModel(p.roofs[0], 5800), m1 = roofModel(gable, 5800 + (gable.offset || 0));
    near(m1.peak, m0.peak, 1, "ridge height");
    assert.equal(back.meta.north, 30);
    assert.equal(back.solids.length, 0);
  });

  test("demolished elements are left out; mass models become shading", () => {
    const q = house();
    q.walls.find((w) => w.id === "wE").phase = "demolish";
    q.solids.push({ id: "m1", level: "L1", pts: [[20000, 0], [25000, 0], [25000, 5000], [20000, 5000]], z0: 0, height: 12000, taper: 1, material: "concrete" });
    const s = readBack(exportGbxml(normalizeProject(q), { timestamp: TS })).surfaces;
    assert.equal(s.filter((x) => x.type === "Shade").length, 6, "a box of shading");
    assert.ok(!s.some((x) => /\[wE\]/.test(kidText(x.el, "CADObjectId"))));
  });

  test("gbXML 6.01 on request", () => {
    const x6 = exportGbxml(p, { schemaVersion: "6.01", timestamp: TS });
    assert.match(x6, /version="6\.01"/);
    assert.match(x6, /GreenBuildingXML_Ver6\.01\.xsd/);
  });
});

describe("gbXML export of every sample", () => {
  const dir = path.join(root, "sample");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".myarch"))) {
    test(`${f}: walls, openings, rooms and levels survive the round trip`, () => {
      const p = parseProject(readFileSync(path.join(dir, f), "utf8"));
      const xml = exportGbxml(p, { timestamp: TS });
      const back = importGbxml(xml).project;
      const live = (x) => x.phase !== "demolish";
      const walls = p.walls.filter(live);
      const ids = new Set(walls.map((w) => w.id));
      assert.equal(back.levels.length, p.levels.length, "levels");
      assert.equal(back.walls.length, walls.length, "walls");
      assert.equal(back.openings.length, p.openings.filter((o) => live(o) && ids.has(o.wall)).length, "openings");
      assert.equal(back.rooms.length, p.rooms.filter(live).length, "rooms");
      for (const r of p.roofs.filter((x) => x.kind !== "flat")) assert.ok(back.roofs.some((b) => b.kind === r.kind && Math.abs(b.pitch - r.pitch) < 0.1), `${r.kind} roof rebuilt`);
      const m = gbxmlModel(p);
      assert.equal(m.spaces.length, p.rooms.filter(live).length);
    });
  }
});

// ---------------------------------------------------------------- roofs
describe("pitched roofs rebuilt from sloped faces", () => {
  const lv = { elevation: 0, height: 3000 };
  const rot = (pts, a) => pts.map(([x, y]) => { const c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180); return [x * c - y * s + 1000, x * s + y * c - 500]; });
  for (const kind of ["gable", "hip", "shed"]) {
    for (const angle of [0, 30, 90, 217]) {
      test(`${kind} at ${angle}°`, () => {
        const pts = rot([[0, 0], [10000, 0], [10000, 6000], [0, 6000]], angle);
        const src = { kind, pts, pitch: 30, overhang: 500, thickness: 200 };
        const faces = roofModel(src, 3000).faces.map((f) => ({ pts: f.pts, th: 200 }));
        const walls = pts.map((a, i) => ({ x1: a[0], y1: a[1], x2: pts[(i + 1) % 4][0], y2: pts[(i + 1) % 4][1] }));
        const { roofs, solids } = rebuildRoofs(faces, lv, walls);
        assert.equal(solids.length, 0);
        assert.equal(roofs.length, 1);
        const r = roofs[0];
        assert.equal(r.kind, kind);
        near(r.pitch, 30, 0.05, "pitch");
        near(r.overhang, 500, 1, "overhang from the walls");
        // The same roof surface: every source vertex lies on the rebuilt faces.
        const m = roofModel(r, 3000 + (r.offset || 0));
        const all = m.faces.flatMap((f) => f.pts);
        for (const f of faces) for (const q of f.pts) assert.ok(all.some((v) => Math.hypot(v[0] - q[0], v[1] - q[1], v[2] - q[2]) < 2), `vertex ${q.map(Math.round)}`);
      });
    }
  }

  test("faces that are no gable, hip or shed become a mass solid of those faces", () => {
    // An asymmetric gable: 2 m rise over 3 m on one side, over 1 m on the other.
    const faces = [
      { pts: [[0, 0, 3000], [10000, 0, 3000], [10000, 3000, 5000], [0, 3000, 5000]], th: 150 },
      { pts: [[0, 3000, 5000], [10000, 3000, 5000], [10000, 4000, 3000], [0, 4000, 3000]], th: 150 },
    ];
    assert.equal(fitRoof(faces, lv), null);
    const { roofs, solids } = rebuildRoofs(faces, lv);
    assert.equal(roofs.length, 0);
    assert.equal(solids.length, 1);
    const s = solids[0];
    assert.equal(s.faces.length, 2);
    assert.deepEqual([s.z0, s.height, s.thickness], [3000, 2000, 150]);
    assert.equal(s.pts.length, 4, "plan outline: the hull of the faces");
    // It builds in 3D as the sloped slabs.
    const p = newProject("Faces");
    p.solids.push({ id: "m1", level: p.levels[0].id, ...s });
    normalizeProject(p);
    const root3 = buildBuilding(THREE, p, makeMaterials(THREE, { textures: false }));
    let tris = 0;
    root3.traverse((c) => { if (c.isMesh && c.userData.id === "m1") tris += c.geometry.index ? c.geometry.index.count / 3 : c.geometry.attributes.position.count / 3; });
    assert.ok(tris >= 2 * 12, "two slabs (top, bottom, four sides each)");
  });

  test("separate roofs that only meet at their eaves stay separate", () => {
    const a = roofModel({ kind: "gable", pts: [[0, 0], [6000, 0], [6000, 4000], [0, 4000]], pitch: 30, overhang: 0 }, 3000).faces;
    const b = roofModel({ kind: "gable", pts: [[6000, 0], [12000, 0], [12000, 4000], [6000, 4000]], pitch: 30, overhang: 0, rot: 90 }, 3000).faces;
    const groups = groupFaces([...a, ...b].map((f) => ({ pts: f.pts })));
    assert.equal(groups.length, 2);
    const { roofs } = rebuildRoofs([...a, ...b].map((f) => ({ pts: f.pts })), lv);
    assert.deepEqual(roofs.map((r) => r.kind), ["gable", "gable"]);
  });

  test("a gbXML file: one roof split per space, a mansard-like roof kept as faces, flat pieces joined", () => {
    const P = (pts) => `<PlanarGeometry><PolyLoop>${pts.map((q) => `<CartesianPoint>${q.map((c) => `<Coordinate>${c}</Coordinate>`).join("")}</CartesianPoint>`).join("")}</PolyLoop></PlanarGeometry>`;
    const S = (id, type, pts) => `<Surface id="${id}" surfaceType="${type}" constructionIdRef="c">${P(pts)}</Surface>`;
    // A gable over x 0..8 m, y 0..6 m, ridge along x at y = 3, 30°; the
    // south slope is split in two pieces at x = 4 (two rooms under it).
    const t = Math.tan(Math.PI / 6), top = 3 + 3 * t;
    const xml = `<?xml version="1.0"?><gbXML xmlns="http://www.gbxml.org/schema" lengthUnit="Meters" version="7.03"><Campus id="c1"><Location><ZipcodeOrPostalCode/></Location>
      <Building id="b" buildingType="Unknown"><Area>1</Area><BuildingStorey id="s1"><Level>0</Level></BuildingStorey></Building>
      ${S("w1", "ExteriorWall", [[0, 0, 0], [8, 0, 0], [8, 0, 3], [0, 0, 3]])}
      ${S("r1", "Roof", [[0, 0, 3], [4, 0, 3], [4, 3, top], [0, 3, top]])}
      ${S("r2", "Roof", [[4, 0, 3], [8, 0, 3], [8, 3, top], [4, 3, top]])}
      ${S("r3", "Roof", [[8, 6, 3], [0, 6, 3], [0, 3, top], [8, 3, top]])}
      ${S("g1", "ExteriorWall", [[0, 0, 3], [0, 6, 3], [0, 3, top]])}
      ${S("m1", "Roof", [[20, 0, 3], [30, 0, 3], [30, 3, 5], [20, 3, 5]])}
      ${S("m2", "Roof", [[20, 3, 5], [30, 3, 5], [30, 4, 3], [20, 4, 3]])}
      ${S("f1", "Roof", [[40, 0, 3], [44, 0, 3], [44, 4, 3], [40, 4, 3]])}
      ${S("f2", "Roof", [[44, 0, 3], [48, 0, 3], [48, 4, 3], [44, 4, 3]])}
      </Campus></gbXML>`;
    const r = importGbxml(xml);
    const p = r.project;
    const gable = p.roofs.find((x) => x.kind === "gable");
    assert.ok(gable, "the three pieces are one gable roof");
    near(gable.pitch, 30, 0.05, "pitch");
    const flat = p.roofs.filter((x) => x.kind === "flat");
    assert.equal(flat.length, 1, "the two flat pieces are one roof");
    near(Math.abs(flat[0].pts.reduce((s, q, i, a) => s + (q[0] * a[(i + 1) % a.length][1] - a[(i + 1) % a.length][0] * q[1]) / 2, 0)), 32e6, 1, "8 × 4 m");
    assert.equal(p.solids.length, 1, "the asymmetric roof is a mass of its faces");
    assert.equal(p.solids[0].faces.length, 2);
    assert.equal(p.walls.length, 1, "the gable triangle is left to the roof");
    assert.ok(r.warnings.some((w) => /mass solids with their sloped faces/.test(w)));
    assert.ok(r.warnings.some((w) => /gable surfaces/.test(w)));
  });
});

// ---------------------------------------------------------------- XSD
const xsdDir = process.env.MYARCH_XSD_DIR || "";
const lint = spawnSync("xmllint", ["--version"], { encoding: "utf8" });
const haveLint = !lint.error && lint.status === 0;
const x7 = path.join(xsdDir, "GreenBuildingXML_Ver7.03.xsd"), x6 = path.join(xsdDir, "GreenBuildingXML_Ver6.01.xsd");
const skip = !haveLint ? "xmllint is not installed" : !xsdDir || !existsSync(x7) || !existsSync(x6) ? "set MYARCH_XSD_DIR to a folder with GreenBuildingXML_Ver7.03.xsd and GreenBuildingXML_Ver6.01.xsd" : false;

describe("gbXML against the official XSD", { skip }, () => {
  const tmp = skip ? "" : mkdtempSync(path.join(os.tmpdir(), "myarch-gbxml-"));
  const errors = (xml, xsd, name) => {
    const f = path.join(tmp, name);
    writeFileSync(f, xml);
    const r = spawnSync("xmllint", ["--noout", "--schema", xsd, f], { encoding: "utf8", maxBuffer: 64 << 20 });
    return (r.stderr || "").split(/\r?\n/).filter((l) => /error/i.test(l));
  };
  test("the test house validates against 7.03 and 6.01", () => {
    assert.deepEqual(errors(exportGbxml(house(), { timestamp: TS }), x7, "house7.xml"), []);
    assert.deepEqual(errors(exportGbxml(house(), { timestamp: TS, schemaVersion: "6.01" }), x6, "house6.xml"), []);
  });
  test("every sample validates against 7.03", () => {
    for (const f of readdirSync(path.join(root, "sample")).filter((x) => x.endsWith(".myarch"))) {
      const p = parseProject(readFileSync(path.join(root, "sample", f), "utf8"));
      assert.deepEqual(errors(exportGbxml(p, { timestamp: TS }), x7, f.replace(".myarch", ".xml")), [], f);
    }
  });
});
