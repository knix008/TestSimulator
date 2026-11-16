// IFC export / import: STEP validity, round trips through IFC4 and IFC2X3
// (geometry and BIM data: wall types, phases, classifications, properties,
// room numbers, grids, site location, mass solids, groups), an old untyped
// project, proxies from other programs, a
// hand-written IFC2X3 file in metres, and STEP string decoding.

import { test } from "node:test";
import assert from "node:assert/strict";
import { exportIfc, importIfc, parseStep } from "../../src/io/ifc.js";
import { newProject, normalizeProject, wallHeight, wallLength } from "../../src/core/project.js";
import { wallPoint } from "../../src/core/walls.js";
import { polygonArea } from "../../src/core/geom.js";
import { makeFurniture } from "../../src/lib/furniture.js";

const TS = "2026-01-02T03:04:05";

function sampleProject() {
  const p = newProject("Test House");
  const L1 = p.levels[0];
  L1.id = "lvBase";
  p.view.level = L1.id;
  L1.height = 3000;
  const L2 = { id: "lvTop", name: "2F", elevation: 3000, height: 3000, slab: 200 };
  p.levels.push(L2);
  p.meta.classificationSystem = "Uniclass 2015 (test)";
  p.meta.latitude = 37.566535;
  p.meta.longitude = -122.419416;
  // A type with an air layer and a Korean name next to the default library.
  p.wallTypes.push({ id: "cavity", name: "중공 벽 Cavity", exterior: true, layers: [
    { material: "brick", thickness: 100, function: "finish" }, { material: "air", thickness: 50, function: "air" },
    { material: "concrete", thickness: 150, function: "structure" }, { material: "plaster", thickness: 15, function: "finish" }] });
  p.grids.push(
    { id: "g1", x1: 0, y1: -1000, x2: 0, y2: 7000, label: "1" },
    { id: "g2", x1: 8000, y1: -1000, x2: 8000, y2: 7000, label: "2" },
    { id: "gA", x1: -1000, y1: 0, x2: 9000, y2: 0, label: "A" },
    { id: "gB", x1: -1000, y1: 6000, x2: 9000, y2: 6000, label: "B" },
  );
  const wall = (id, x1, y1, x2, y2, thickness, level = L1.id, height = null) => ({ id, level, x1, y1, x2, y2, thickness, height });
  p.walls.push(
    { ...wall("wN", 0, 0, 8000, 0, 250), type: "ext-brick-300", phase: "existing", classification: "EF_25_10", group: "north-east",
      props: { FireRating: "REI 60", UValue: 0.28, LoadBearing: true, 비고: "한국어 메모 'quoted'" } },
    { ...wall("wE", 8000, 0, 8000, 6000, 250), group: "north-east" },
    { ...wall("wS", 8000, 6000, 0, 6000, 250), type: "ext-brick-300", classification: "EF_25_10" },
    { ...wall("wW", 0, 6000, 0, 0, 250), type: "cavity" },
    { ...wall("wI", 4000, 0, 4000, 3500, 100), type: "int-drywall-100", phase: "demolish" },
    wall("wTop", 0, 0, 5000, 0, 200, L2.id, 2500),
  );
  p.openings.push(
    { id: "d1", wall: "wN", kind: "door", type: "single", at: 2000, width: 900, height: 2100, sill: 0, phase: "existing", classification: "Pr_30_59_24", props: { Hardware: "Lever", Count: 2 } },
    { id: "d2", wall: "wI", kind: "door", type: "double", hinge: "end", at: 1500, width: 800, height: 2000, sill: 0 },
    { id: "n1", wall: "wE", kind: "window", type: "casement", at: 3000, width: 1200, height: 1200, sill: 900 },
    { id: "n2", wall: "wS", kind: "window", type: "fixed", at: 5000, width: 1500, height: 1000, sill: 1000, phase: "demolish" },
  );
  p.rooms.push(
    { id: "r1", level: L1.id, name: "거실", number: "101", department: "주거", classification: "SL_45_10", pts: [[125, 125], [3950, 125], [3950, 5875], [125, 5875]] },
    { id: "r2", level: L1.id, name: "Bed's room \\ 2", number: "102", phase: "demolish", props: { Finish: "Oak" }, pts: [[4050, 125], [7875, 125], [7875, 3500], [6000, 5875], [4050, 5875]] },
  );
  p.columns.push(
    { id: "c1", level: L1.id, x: 2000, y: 3000, w: 300, d: 300, shape: "round" },
    { id: "c2", level: L1.id, x: 6000, y: 3000, w: 400, d: 300, rot: 30, shape: "rect", phase: "existing", classification: "Ss_20_05" },
  );
  p.stairs.push({ id: "s1", level: L1.id, x: 2000, y: 4500, rot: 180, width: 1000, length: 3200, steps: 16, phase: "existing" });
  p.roofs.push({ id: "rf1", level: L2.id, kind: "gable", pts: [[0, 0], [8000, 0], [8000, 6000], [0, 6000]], pitch: 30, overhang: 400, thickness: 200, phase: "existing", classification: "Ss_30_10" });
  p.furniture.push({ id: "f1", level: L1.id, ...makeFurniture("sofa3", 2000, 2000, { rot: 30 }), phase: "demolish", props: { Supplier: "이케아", Price: 1290000, Assembled: false } });
  const circle = Array.from({ length: 32 }, (_, i) => [15000 + 1500 * Math.cos((i * Math.PI) / 16), 3000 + 1500 * Math.sin((i * Math.PI) / 16)]);
  p.solids = [
    { id: "m1", level: L1.id, name: "창고 Block", pts: [[10000, 0], [13000, 0], [13000, 2000], [10000, 2000]], z0: 0, height: 3000, taper: 1, material: "brick",
      phase: "existing", classification: "Ss_25_10", props: { Use: "창고" } },
    { id: "m2", level: L1.id, pts: [[10000, 4000], [12000, 4000], [12000, 6000], [10000, 6000]], z0: 500, height: 4000, taper: 0, material: "glass" },
    { id: "m3", level: L2.id, name: "Drum", pts: circle, z0: 250, height: 2000, taper: 0.5, material: "concrete", phase: "demolish" },
  ];
  return normalizeProject(p);
}

// Every point of polygon a lies on a point of b (any order), same count.
function samePolygon(a, b, tol = 0.01) {
  return a.length === b.length && a.every((q) => b.some((r) => near(q[0], r[0], tol) && near(q[1], r[1], tol)));
}

// Every {ref} anywhere in an argument tree.
function refsIn(v, out = []) {
  if (Array.isArray(v)) for (const x of v) refsIn(x, out);
  else if (v && typeof v === "object") {
    if ("ref" in v) out.push(v.ref);
    else if ("typed" in v) refsIn(v.value, out);
  }
  return out;
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;
const levelElevation = (p, id) => p.levels.find((l) => l.id === id).elevation;

for (const schema of ["IFC4", "IFC2X3"]) {
  test(`the exported ${schema} file is valid STEP with resolvable references and unique GlobalIds`, () => {
    const text = exportIfc(sampleProject(), { schema, author: "Tester", organization: "Org", timestamp: TS });
    assert.ok(text.startsWith("ISO-10303-21;\nHEADER;\n"));
    assert.ok(text.trimEnd().endsWith("END-ISO-10303-21;"));
    assert.match(text, /FILE_DESCRIPTION\(\('ViewDefinition \[(ReferenceView_V1\.2|CoordinationView_V2\.0)\]'\),'2;1'\);/);
    assert.ok(text.includes(schema === "IFC4" ? "ViewDefinition [ReferenceView_V1.2]" : "ViewDefinition [CoordinationView_V2.0]"));
    assert.ok(text.includes(`FILE_NAME('Test House.ifc','${TS}',('Tester'),('Org'),'MyArchitecture','MyArchitecture','');`));
    assert.ok(text.includes(`FILE_SCHEMA(('${schema}'));`));
    assert.ok(text.includes("IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)"));

    const ents = parseStep(text);
    assert.ok(ents.size > 300 && ents.size < 5000, `entity count ${ents.size}`);
    for (const [id, e] of ents) {
      for (const r of refsIn(e.args)) assert.ok(ents.has(r), `#${id} ${e.type} refers to undefined #${r}`);
    }
    const types = new Set([...ents.values()].map((e) => e.type));
    for (const t of ["IFCPROJECT", "IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY", "IFCOWNERHISTORY", "IFCGEOMETRICREPRESENTATIONSUBCONTEXT", "IFCOPENINGELEMENT", "IFCRELVOIDSELEMENT", "IFCRELFILLSELEMENT", "IFCDOOR", "IFCWINDOW", "IFCSPACE", "IFCSLAB", "IFCCOLUMN", "IFCSTAIR", "IFCSTAIRFLIGHT", "IFCROOF", "IFCFACETEDBREP", "IFCSTYLEDITEM", "IFCPROPERTYSET"]) {
      assert.ok(types.has(t), `missing ${t}`);
    }
    assert.ok(types.has(schema === "IFC4" ? "IFCWALL" : "IFCWALLSTANDARDCASE"));
    assert.ok(types.has(schema === "IFC4" ? "IFCFURNITURE" : "IFCFURNISHINGELEMENT"));
    if (schema === "IFC2X3") assert.ok(types.has("IFCPRESENTATIONSTYLEASSIGNMENT"));

    const guids = [...ents.values()].filter((e) => typeof e.args[0] === "string" && e.type !== "IFCCOLOURRGB" && /^IFC(REL|PROJECT|SITE|BUILDING|WALL|DOOR|WINDOW|OPENING|SPACE|SLAB|COLUMN|STAIR|ROOF|FURN|PROPERTYSET|ELEMENTQUANTITY)/.test(e.type)).map((e) => e.args[0]);
    assert.ok(guids.length > 50);
    for (const g of guids) assert.match(g, /^[0-3][0-9A-Za-z_$]{21}$/);
    assert.equal(new Set(guids).size, guids.length, "GlobalIds are unique");

    // Deterministic: the same project exports to the same text.
    assert.equal(exportIfc(sampleProject(), { schema, author: "Tester", organization: "Org", timestamp: TS }), text);
  });

  test(`a project survives a round trip through ${schema}`, () => {
    const src = sampleProject();
    const { project: p, warnings, stats } = importIfc(exportIfc(src, { schema, timestamp: TS }));
    assert.deepEqual(warnings.filter((w) => /skipped|could not/.test(w)), []);
    assert.equal(stats.IfcBuildingStorey, 2);
    assert.equal(p.meta.title, "Test House");
    assert.equal(p.view.level, p.levels[0].id);

    // Levels.
    assert.equal(p.levels.length, src.levels.length);
    src.levels.forEach((l, i) => {
      assert.ok(near(p.levels[i].elevation, l.elevation, 1));
      assert.ok(near(p.levels[i].height, l.height, 1));
    });
    const levelMap = new Map(src.levels.map((l, i) => [l.id, p.levels[i].id]));

    // Walls: endpoints (either direction), thickness, height.
    assert.equal(p.walls.length, src.walls.length);
    const wallMap = new Map();
    for (const w of src.walls) {
      const m = p.walls.find((x) => x.level === levelMap.get(w.level) && (
        (near(x.x1, w.x1, 2) && near(x.y1, w.y1, 2) && near(x.x2, w.x2, 2) && near(x.y2, w.y2, 2)) ||
        (near(x.x1, w.x2, 2) && near(x.y1, w.y2, 2) && near(x.x2, w.x1, 2) && near(x.y2, w.y1, 2))));
      assert.ok(m, `wall ${w.id} not found`);
      assert.ok(near(m.thickness, w.thickness, 0.5), `wall ${w.id} thickness ${m.thickness}`);
      assert.ok(near(wallHeight(p, m), wallHeight(src, w), 0.5), `wall ${w.id} height ${wallHeight(p, m)}`);
      wallMap.set(w.id, m);
    }

    // Openings: kind, position, size, sill, door/window type.
    assert.equal(p.openings.length, src.openings.length);
    for (const o of src.openings) {
      const w = src.walls.find((x) => x.id === o.wall);
      const [ox, oy] = wallPoint(w, o.at);
      const m = p.openings.find((x) => {
        const iw = p.walls.find((y) => y.id === x.wall);
        const [ix, iy] = wallPoint(iw, x.at);
        return x.kind === o.kind && near(ix, ox, 2) && near(iy, oy, 2);
      });
      assert.ok(m, `opening ${o.id} not found`);
      assert.equal(m.wall, wallMap.get(o.wall).id);
      const iw = wallMap.get(o.wall);
      const at = near(iw.x1, w.x1, 2) && near(iw.y1, w.y1, 2) ? o.at : wallLength(w) - o.at;
      assert.ok(near(m.at, at, 2), `opening ${o.id} at ${m.at}`);
      assert.ok(near(m.width, o.width, 2), `opening ${o.id} width ${m.width}`);
      assert.ok(near(m.height, o.height, 2), `opening ${o.id} height ${m.height}`);
      assert.ok(near(m.sill, o.sill, 2), `opening ${o.id} sill ${m.sill}`);
      assert.equal(m.type, o.type);
    }
    assert.equal(p.openings.find((o) => o.type === "double").hinge, "start", "double doors keep the default hinge");

    // Rooms: names (Korean, apostrophes, backslashes) and areas.
    assert.equal(p.rooms.length, src.rooms.length);
    for (const r of src.rooms) {
      const m = p.rooms.find((x) => x.name === r.name);
      assert.ok(m, `room ${JSON.stringify(r.name)} not found`);
      const a0 = Math.abs(polygonArea(r.pts)), a1 = Math.abs(polygonArea(m.pts));
      assert.ok(Math.abs(a1 - a0) / a0 < 0.005, `room ${r.name} area ${a1} vs ${a0}`);
    }

    // Columns: shapes, sizes, positions.
    assert.equal(p.columns.length, 2);
    const round = p.columns.find((c) => c.shape === "round");
    const rect = p.columns.find((c) => c.shape === "rect");
    assert.ok(round && rect);
    assert.ok(near(round.x, 2000, 1) && near(round.y, 3000, 1) && near(round.w, 300, 1));
    assert.ok(near(rect.x, 6000, 1) && near(rect.y, 3000, 1) && near(rect.w, 400, 1) && near(rect.d, 300, 1));
    assert.ok(near(((rect.rot % 180) + 180) % 180, 30, 0.01), `column rot ${rect.rot}`);

    // Stair: footprint, direction and steps.
    assert.equal(p.stairs.length, 1);
    const s = p.stairs[0];
    assert.ok(near(s.x, 2000, 1) && near(s.y, 4500, 1), `stair at ${s.x},${s.y}`);
    assert.ok(near(s.length, 3200, 1) && near(s.width, 1000, 1));
    assert.ok(near(((s.rot % 360) + 360) % 360, 180, 0.01), `stair rot ${s.rot}`);
    assert.equal(s.steps, 16);

    // Roof: kind and parameters come back from the custom property set.
    assert.equal(p.roofs.length, 1);
    const rf = p.roofs[0];
    assert.equal(rf.kind, "gable");
    assert.equal(rf.level, p.levels[1].id);
    assert.ok(near(rf.pitch, 30, 0.01) && near(rf.overhang, 400, 0.5) && near(rf.thickness, 200, 0.5));
    assert.ok(near(Math.abs(polygonArea(rf.pts)), 48e6, 48e6 * 0.001));
    assert.ok(!rf.offset || Math.abs(rf.offset) < 1, `roof offset ${rf.offset}`);

    // Furniture.
    assert.equal(p.furniture.length, 1);
    const f = p.furniture[0];
    const sf = src.furniture[0];
    assert.equal(f.kind, "sofa3");
    assert.ok(near(f.x, sf.x, 1) && near(f.y, sf.y, 1) && near(f.w, sf.w, 1) && near(f.d, sf.d, 1) && near(f.h, sf.h, 1));
    assert.ok(near(((f.rot % 180) + 180) % 180, 30, 0.01), `furniture rot ${f.rot}`);

    // Floor slab thickness comes back on the level.
    assert.equal(p.levels[0].slab, 200);
    assert.ok(levelElevation(p, p.walls.find((w) => w.thickness === 200).level) === 3000);

    // ---- BIM data
    const pick = (wt) => ({ id: wt.id, name: wt.name, exterior: !!wt.exterior, layers: wt.layers });
    assert.deepEqual(p.wallTypes.map(pick), src.wallTypes.map(pick), "wall types with their layers");
    for (const w of src.walls) {
      const m = wallMap.get(w.id);
      assert.equal(m.type, w.type, `wall ${w.id} type`);
      assert.equal(m.phase, w.phase, `wall ${w.id} phase`);
      assert.equal(m.classification, w.classification, `wall ${w.id} classification`);
      if (w.type) {
        // Layers run from the wall's left: the direction is kept.
        assert.ok(near(m.x1, w.x1, 2) && near(m.y1, w.y1, 2), `typed wall ${w.id} keeps its direction`);
        assert.equal(m.thickness, src.wallTypes.find((t) => t.id === w.type).layers.reduce((a, l) => a + l.thickness, 0));
      }
    }
    assert.deepEqual(wallMap.get("wN").props, { FireRating: "REI 60", UValue: 0.28, LoadBearing: true, 비고: "한국어 메모 'quoted'" });
    assert.equal(wallMap.get("wE").props, undefined, "no stray properties");
    const opening = (id) => {
      const o = src.openings.find((x) => x.id === id);
      const [ox, oy] = wallPoint(src.walls.find((x) => x.id === o.wall), o.at);
      return p.openings.find((x) => { const [ix, iy] = wallPoint(p.walls.find((y) => y.id === x.wall), x.at); return near(ix, ox, 2) && near(iy, oy, 2); });
    };
    assert.equal(opening("d1").phase, "existing");
    assert.equal(opening("d1").classification, "Pr_30_59_24");
    assert.deepEqual(opening("d1").props, { Hardware: "Lever", Count: 2 });
    assert.equal(opening("n2").phase, "demolish");
    assert.equal(opening("n1").phase, "new");
    const r1 = p.rooms.find((r) => r.name === "거실"), r2 = p.rooms.find((r) => r.name === "Bed's room \\ 2");
    assert.equal(r1.number, "101");
    assert.equal(r1.department, "주거");
    assert.equal(r1.classification, "SL_45_10");
    assert.equal(r1.phase, "new");
    assert.equal(r2.number, "102");
    assert.equal(r2.phase, "demolish");
    assert.deepEqual(r2.props, { Finish: "Oak" });
    assert.equal(rect.phase, "existing");
    assert.equal(rect.classification, "Ss_20_05");
    assert.equal(round.phase, "new");
    assert.equal(s.phase, "existing");
    assert.equal(rf.phase, "existing");
    assert.equal(rf.classification, "Ss_30_10");
    assert.equal(f.phase, "demolish");
    assert.deepEqual(f.props, { Supplier: "이케아", Price: 1290000, Assembled: false });
    assert.equal(p.meta.classificationSystem, "Uniclass 2015 (test)");

    // Mass solids: shape and parameters come back exactly.
    assert.equal(p.solids.length, 3);
    for (const m of src.solids) {
      const c = polygonArea(m.pts);
      const im = p.solids.find((x) => samePolygon(x.pts, m.pts));
      assert.ok(im, `solid ${m.id} not found`);
      assert.ok(near(Math.abs(polygonArea(im.pts)), Math.abs(c), Math.abs(c) * 1e-6));
      assert.equal(im.level, levelMap.get(m.level));
      for (const k of ["z0", "height", "taper", "material", "name", "phase", "classification"]) assert.equal(im[k], m[k], `solid ${m.id} ${k}`);
      assert.deepEqual(im.props, m.props);
    }

    // Groups.
    assert.equal(wallMap.get("wN").group, "north-east");
    assert.equal(wallMap.get("wE").group, "north-east");
    assert.equal(wallMap.get("wS").group, undefined);

    // Grids and site location.
    assert.equal(p.grids.length, 4);
    for (const g of src.grids) {
      const m = p.grids.find((x) => x.label === g.label);
      assert.ok(m, `grid ${g.label}`);
      assert.ok(near(m.x1, g.x1, 0.01) && near(m.y1, g.y1, 0.01) && near(m.x2, g.x2, 0.01) && near(m.y2, g.y2, 0.01), `grid ${g.label} position`);
    }
    assert.ok(near(p.meta.latitude, 37.566535, 1e-8), `latitude ${p.meta.latitude}`);
    assert.ok(near(p.meta.longitude, -122.419416, 1e-8), `longitude ${p.meta.longitude}`);
  });

  test(`the ${schema} export carries the BIM data in standard IFC entities`, () => {
    const ents = [...parseStep(exportIfc(sampleProject(), { schema, timestamp: TS })).values()];
    const of = (t) => ents.filter((e) => e.type === t);
    // One IfcWallType per wall type, each with its own layer set.
    assert.equal(of("IFCWALLTYPE").length, sampleProject().wallTypes.length);
    const sets = of("IFCMATERIALLAYERSET");
    const brick = sets.find((x) => x.args[1] === "Exterior brick cavity 300");
    assert.equal(brick.args[0].length, 4);
    assert.ok(of("IFCRELDEFINESBYTYPE").length >= 3);
    // Classification: one reference per code.
    assert.equal(of("IFCCLASSIFICATION").length, 1);
    assert.equal(of("IFCCLASSIFICATIONREFERENCE").length, 6);
    assert.equal(of("IFCRELASSOCIATESCLASSIFICATION").length, 6);
    // IFC4: Status in the common property sets.
    const status = of("IFCPROPERTYENUMERATEDVALUE").filter((x) => x.args[0] === "Status");
    if (schema === "IFC4") assert.deepEqual([...new Set(status.map((x) => x.args[2][0].value))].sort(), ["DEMOLISH", "EXISTING", "NEW"]);
    else assert.equal(status.length, 0);
    // Grid with 2 + 2 axes and the site location.
    const grid = of("IFCGRID")[0];
    assert.equal(grid.args[7].length, 2);
    assert.equal(grid.args[8].length, 2);
    const site = of("IFCSITE")[0];
    assert.deepEqual(site.args[9], [37, 33, 59, 526000]);
    assert.deepEqual(site.args[10], [-122, -25, -9, -897600]);
    assert.equal(site.args[11], 0);
  });

  test(`${schema} mass solids are an extrusion or a closed faceted Brep, and groups are IfcGroups`, () => {
    const ents = [...parseStep(exportIfc(sampleProject(), { schema, timestamp: TS })).values()];
    const proxies = ents.filter((e) => e.type === "IFCBUILDINGELEMENTPROXY" && e.args[4] === "Mass");
    assert.equal(proxies.length, 3);
    if (schema === "IFC4") for (const x of proxies) assert.deepEqual(x.args[8], { enum: "USERDEFINED" });
    const shells = ents.filter((e) => e.type === "IFCCLOSEDSHELL").map((e) => e.args[0].length);
    assert.ok(shells.includes(5), "pyramid: base + 4 triangles");
    assert.ok(shells.includes(34), "32-gon frustum: base + top + 32 sides");    const groups = ents.filter((e) => e.type === "IFCGROUP");
    assert.deepEqual(groups.map((g) => g.args[2]), ["north-east"]);
    const assign = ents.find((e) => e.type === "IFCRELASSIGNSTOGROUP");
    assert.equal(assign.args[4].length, 2);
  });

  test(`${schema} proxies from other programs: plain extrusions become solids, other bodies are skipped`, () => {
    const text = exportIfc(sampleProject(), { schema, timestamp: TS }).replace(/'MyArchitecture_Mass'/g, "'Other_Mass'");
    const { project: p, warnings } = importIfc(text);
    // Only the straight box is a single extrusion; the two Breps are skipped.
    assert.equal(p.solids.length, 1);
    const m = p.solids[0];
    assert.ok(samePolygon(m.pts, [[10000, 0], [13000, 0], [13000, 2000], [10000, 2000]]));
    assert.equal(m.taper, 1);
    assert.equal(m.height, 3000);
    assert.equal(m.z0, 0);
    assert.equal(m.props["Other_Mass.Material"], "brick", "unknown sets land in props");
    assert.ok(warnings.includes("2 IfcBuildingElementProxy skipped"), JSON.stringify(warnings));
  });

  test(`an old project without BIM data still exports to ${schema} and reads back untyped`, () => {
    const old = { meta: { title: "Old" }, levels: [{ id: "L", name: "1F", elevation: 0, height: 2800 }], walls: [
      { id: "a", level: "L", x1: 0, y1: 0, x2: 4000, y2: 0, thickness: 200 },
      { id: "b", level: "L", x1: 4000, y1: 0, x2: 4000, y2: 3000, thickness: 150 },
    ], openings: [{ id: "o", wall: "a", kind: "door", at: 1000 }] };
    const text = exportIfc(old, { schema, timestamp: TS });
    assert.equal(old.wallTypes, undefined, "the input is not modified");
    const ents = parseStep(text);
    for (const [id, e] of ents) for (const r of refsIn(e.args)) assert.ok(ents.has(r), `#${id} refers to undefined #${r}`);
    assert.equal([...ents.values()].filter((e) => e.type === "IFCGRID").length, 0);
    const { project: p, warnings } = importIfc(text);
    assert.deepEqual(warnings, []);
    assert.equal(p.walls.length, 2);
    for (const w of p.walls) {
      assert.equal(w.type, undefined);
      assert.equal(w.phase, "new");
      assert.equal(w.props, undefined);
      assert.ok([200, 150].includes(w.thickness));
    }
    assert.equal(p.openings.length, 1);
    assert.deepEqual(p.grids, []);
  });
}

test("a hand-written IFC2X3 file in metres with a rotated wall placement imports in millimetres", () => {
  const text = String.raw`ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'),'2;1');
FILE_NAME('hand.ifc','2020-01-01T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('IFC2X3'));
ENDSEC;
DATA;
/* units and contexts */
#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'Hand Made',$,$,'Hand made project',$,(#20),#10);
#10=IFCUNITASSIGNMENT((#11,#12));
#11=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#12=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);
#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#21,$);
#21=IFCAXIS2PLACEMENT3D(#22,$,$);
#22=IFCCARTESIANPOINT((0.,0.,0.));
#30=IFCBUILDINGSTOREY('2YvctVUKr0kugbFTf53O9L',$,'Level 2',$,$,#31,$,$,.ELEMENT.,3.);
#31=IFCLOCALPLACEMENT($,#32);
#32=IFCAXIS2PLACEMENT3D(#33,$,$);
#33=IFCCARTESIANPOINT((0.,0.,3.));
#40=IFCWALLSTANDARDCASE('3YvctVUKr0kugbFTf53O9L',$,'W1',$,$,#41,#50,
  $);
#41=IFCLOCALPLACEMENT(#31,#42);
#42=IFCAXIS2PLACEMENT3D(#43,#44,#45);
#43=IFCCARTESIANPOINT((1.,2.,0.));
#44=IFCDIRECTION((0.,0.,1.));
#45=IFCDIRECTION((0.,1.,0.));
#50=IFCPRODUCTDEFINITIONSHAPE($,$,(#51,#52));
#51=IFCSHAPEREPRESENTATION(#20,'Axis','Curve2D',(#53));
#53=IFCPOLYLINE((#54,#55));
#54=IFCCARTESIANPOINT((0.,0.));
#55=IFCCARTESIANPOINT((4.,0.));
#52=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#56));
#56=IFCEXTRUDEDAREASOLID(#57,#60,#44,2.5);
#57=IFCRECTANGLEPROFILEDEF(.AREA.,$,#58,4.,0.2);
#58=IFCAXIS2PLACEMENT2D(#59,$);
#59=IFCCARTESIANPOINT((2.,0.));
#60=IFCAXIS2PLACEMENT3D(#22,$,$);
#70=IFCRELCONTAINEDINSPATIALSTRUCTURE('4YvctVUKr0kugbFTf53O9L',$,$,$,(#40,#80),#30);
#90=IFCPROPERTYSET('6YvctVUKr0kugbFTf53O9L',$,'Pset_WallCommon',$,(#91,#92,#93));
#91=IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.T.),$);
#92=IFCPROPERTYSINGLEVALUE('LoadBearing',$,IFCBOOLEAN(.F.),$);
#93=IFCPROPERTYENUMERATEDVALUE('Status',$,(IFCLABEL('EXISTING')),$);
#94=IFCPROPERTYSET('7YvctVUKr0kugbFTf53O9L',$,'Custom_Data',$,(#95,#96,#97));
#95=IFCPROPERTYSINGLEVALUE('Note',$,IFCTEXT('\X2\BA54BAA8\X0\'),$);
#96=IFCPROPERTYSINGLEVALUE('Fire',$,IFCINTEGER(90),$);
#97=IFCPROPERTYLISTVALUE('List',$,(IFCLABEL('a'),IFCLABEL('b')),$);
#98=IFCRELDEFINESBYPROPERTIES('8YvctVUKr0kugbFTf53O9L',$,$,$,(#40),#90);
#99=IFCRELDEFINESBYPROPERTIES('9YvctVUKr0kugbFTf53O9L',$,$,$,(#40),#94);
#80=IFCBEAM('5YvctVUKr0kugbFTf53O9L',$,'B1',$,$,#41,$,$);
ENDSEC;
END-ISO-10303-21;
`;
  const { project: p, warnings, stats } = importIfc(text);
  assert.equal(p.meta.title, "Hand Made");
  assert.equal(p.levels.length, 1);
  assert.equal(p.levels[0].elevation, 3000);
  assert.equal(p.walls.length, 1);
  const w = p.walls[0];
  // Local x of the wall is world +y: (1, 2) → (1, 6) m, i.e. plan y = −2000 → −6000.
  assert.ok(near(w.x1, 1000, 0.01) && near(w.y1, -2000, 0.01), `start ${w.x1},${w.y1}`);
  assert.ok(near(w.x2, 1000, 0.01) && near(w.y2, -6000, 0.01), `end ${w.x2},${w.y2}`);
  assert.ok(near(w.thickness, 200, 0.01));
  assert.ok(near(wallHeight(p, w), 2500, 0.01));
  // Foreign property sets: Status gives the phase, IsExternal is interpreted,
  // other simple values land in props under "Pset.Property".
  assert.equal(w.phase, "existing");
  assert.deepEqual(w.props, { "Pset_WallCommon.LoadBearing": false, "Custom_Data.Note": "메모", "Custom_Data.Fire": 90 });
  assert.equal(stats.IfcWallStandardCase, 1);
  assert.ok(warnings.includes("1 IfcBeam skipped"), JSON.stringify(warnings));
});

test("STEP strings decode '' escapes, backslashes and \\X2\\ Unicode", () => {
  const ents = parseStep(String.raw`DATA;
#1=IFCSTRINGS('it''s','\X2\AC00\X0\','a\\b','\X2\AC00AC01\X0\ok','\S\D', IFCLABEL('x'), 1.E-5, -2.5E+3, .T., $, *, (#2, 3, ()));
ENDSEC;`);
  const { type, args } = ents.get(1);
  assert.equal(type, "IFCSTRINGS");
  assert.equal(args[0], "it's");
  assert.equal(args[1], "가");
  assert.equal(args[2], "a\\b");
  assert.equal(args[3], "가각ok");
  assert.equal(args[4], "Ä");
  assert.deepEqual(args[5], { typed: "IFCLABEL", value: "x" });
  assert.equal(args[6], 1e-5);
  assert.equal(args[7], -2500);
  assert.deepEqual(args[8], { enum: "T" });
  assert.equal(args[9], null);
  assert.deepEqual(args[11], [{ ref: 2 }, 3, []]);
});
