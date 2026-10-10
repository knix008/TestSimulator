// Reading other architecture programs' files: Sweet Home 3D (.sh3d, a ZIP
// with Home.xml), gbXML (Revit / ArchiCAD / Vectorworks energy-model export)
// and IFC in a ZIP. Every fixture is written here by hand: a Home.xml with
// two levels, round and sloping walls, doors and windows (one stacked above
// another, one outside any wall), rooms, furniture in several languages, a
// group, a staircase, labels and dimensions; a gbXML with two storeys,
// spaces, a wall written from both sides, a wall through both storeys,
// windows, doors (one given only by its rectangle) and a flat roof.
// Imported projects must normalize, pass the model check without errors and
// build in 3D.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../src/vendor/three/three.module.js";
import { makeZip } from "../../src/io/zip.js";
import { deflateZip, HOME_XML, gbxmlFixture, poly, wallRect, floorRect, surface } from "./interop-fixtures.mjs";
import { zipEntries, zipEntryData, readZipText, isZip } from "../../src/io/unzip.js";
import { importSh3d, importSweetHomeXml, arcPoints } from "../../src/io/sh3d.js";
import { importGbxml, decodeXmlBytes } from "../../src/io/gbxml.js";
import { bimKind, readBimFile } from "../../src/io/bimformats.js";
import { furnitureKindFor, argbToHex, floorMaterialFor, resolveWallOverlaps, dropOverlappingOpenings } from "../../src/io/bimkit.js";
import { exportIfc, importIfc } from "../../src/io/ifc.js";
import { normalizeProject, serializeProject, parseProject, wallLength, wallHeight, newProject } from "../../src/core/project.js";
import { wallPoint } from "../../src/core/walls.js";
import { runCheck } from "../../src/core/check.js";
import { roomArea } from "../../src/core/rooms.js";
import { buildBuilding, makeMaterials } from "../../src/view3d/build.js";
import { furnitureDef } from "../../src/lib/furniture.js";
import { materialById } from "../../src/lib/materials.js";

const near = (a, b, tol = 1, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a} (tol ${tol})`);

// Checks every imported project must pass.
function assertSound(p, label) {
  const again = parseProject(serializeProject(p));
  assert.deepEqual(JSON.parse(serializeProject(normalizeProject(JSON.parse(JSON.stringify(p))))), JSON.parse(serializeProject(again)), `${label}: already normalized`);
  const ids = new Set();
  const levels = new Set(p.levels.map((l) => l.id));
  for (const k of ["walls", "openings", "rooms", "stairs", "furniture", "roofs", "dimensions", "texts", "drawings"]) {
    for (const it of p[k]) {
      assert.ok(it.id && !ids.has(it.id), `${label}: unique id ${it.id}`);
      ids.add(it.id);
      if (k !== "openings") assert.ok(levels.has(it.level), `${label}: ${k} on a level`);
    }
  }
  const walls = new Map(p.walls.map((w) => [w.id, w]));
  for (const o of p.openings) {
    const w = walls.get(o.wall);
    assert.ok(w, `${label}: opening on a wall`);
    assert.ok(o.at - o.width / 2 >= -1 && o.at + o.width / 2 <= wallLength(w) + 1, `${label}: opening ${o.id} fits its wall`);
    assert.ok(o.sill + o.height <= wallHeight(p, w) + 1, `${label}: opening ${o.id} under the wall top`);
  }
  for (const f of p.furniture) assert.ok(furnitureDef(f.kind), `${label}: furniture kind ${f.kind}`);
  for (const r of p.rooms) if (r.floor) assert.ok(materialById(r.floor), `${label}: floor ${r.floor}`);
  const errors = runCheck(p).filter((i) => i.severity === "error");
  assert.deepEqual(errors.map((i) => `${i.code}: ${i.message}`), [], `${label}: no model-check errors`);
  const root = buildBuilding(THREE, again, makeMaterials(THREE, { textures: false }), { openDoors: true });
  const tagged = new Set();
  root.traverse((c) => { if (c.isMesh) tagged.add(c.userData.id); });
  for (const w of p.walls) assert.ok(tagged.has(w.id), `${label}: wall ${w.id} in 3D`);
  for (const r of p.rooms) assert.ok(tagged.has(r.id), `${label}: room ${r.id} in 3D`);
  assert.equal(root.children.length, p.levels.length);
}

// ================================================================ ZIP reading
describe("ZIP reader (STORE and DEFLATE)", () => {
  test("reads deflated and stored entries, UTF-8 names", async () => {
    const big = "Home.xml ".repeat(500) + "끝";
    const z = deflateZip([{ name: "Home.xml", data: big }, { name: "가구/model.obj", data: "v 0 0 0" }]);
    assert.ok(isZip(z));
    const list = zipEntries(z);
    assert.deepEqual(list.map((e) => [e.name, e.method]), [["Home.xml", 8], ["가구/model.obj", 8]]);
    assert.ok(list[0].csize < list[0].size, "really compressed");
    assert.equal(await readZipText(z, "Home.xml"), big);
    assert.equal(await readZipText(z, "missing"), null);
    const stored = makeZip([{ name: "a.txt", data: "stored text" }]);
    assert.equal(new TextDecoder().decode(await zipEntryData(stored, zipEntries(stored)[0])), "stored text");
  });
  test("rejects data that is not a ZIP", () => {
    assert.equal(isZip(new TextEncoder().encode("<home/>")), false);
    assert.throws(() => zipEntries(new Uint8Array(40)), /not a ZIP/);
  });
});

// ================================================================ Sweet Home 3D
describe("Sweet Home 3D (.sh3d)", async () => {
  const sh3d = deflateZip([{ name: "Home", data: new Uint8Array([0xac, 0xed, 0, 5]) }, { name: "Home.xml", data: HOME_XML }, { name: "0", data: new Uint8Array(64) }]);
  const res = await importSh3d(sh3d, { name: "TestHome.sh3d" });
  const p = res.project;
  const byName = (list, n) => list.find((x) => x.name === n);

  test("levels: elevations ×10, floor-to-floor heights, layers at one elevation merged", () => {
    assert.equal(p.meta.title, "TestHome");
    assert.deepEqual(p.levels.map((l) => [l.name, l.elevation, l.height, l.slab]), [["Ground", 0, 2620, 120], ["Upstairs", 2620, 2500, 120]]);
    assert.ok(res.warnings.some((w) => /merged/.test(w)));
    // The room of the merged layer lands on the level it was merged into.
    assert.equal(byName(p.rooms, "Attic room").level, p.levels[1].id);
  });

  test("walls in millimetres; full-height walls follow the level; sloping and round walls", () => {
    const ground = p.walls.filter((w) => w.level === p.levels[0].id);
    assert.equal(ground.length, 5);
    const north = ground.find((w) => w.y1 === 0 && w.y2 === 0);
    assert.deepEqual([north.x1, north.x2, north.thickness, north.height, north.material], [0, 8000, 200, null, "#ece8e1"]);
    assert.equal(ground.find((w) => w.x1 === 4000).thickness, 100);
    const up = p.walls.filter((w) => w.level === p.levels[1].id);
    assert.equal(up.find((w) => w.y1 === 0 && w.y2 === 0).height, 3000, "sloping wall takes its higher end");
    assert.equal(up.find((w) => w.x1 === 8000 && w.x2 === 8000).height, null, "no height → the home's wall height");
    // The west wall is a quarter circle bulging out (x < 0): 6 pieces of 15°.
    const arc = up.filter((w) => Math.min(w.x1, w.x2) < 0 || (w.x1 === 0 && w.x2 < 0) || (w.x2 === 0 && w.x1 < 0));
    assert.equal(arc.length, 6);
    for (const w of arc) assert.ok(w.x1 <= 0.1 && w.x2 <= 0.1);
    assert.ok(res.warnings.some((w) => /round walls/.test(w)) && res.warnings.some((w) => /sloping/.test(w)));
  });

  test("arcPoints follows the Sweet Home 3D bulge direction", () => {
    // Example 5 of the Sweet Home 3D site: a rounded corner from (0,150) to (150,0), extent −90°.
    const pts = arcPoints(0, 1500, 1500, 0, -Math.PI / 2);
    const mid = pts[Math.floor(pts.length / 2)];
    near(Math.hypot(mid[0] - 1500, mid[1] - 1500), 1500, 1, "on the circle around (1500, 1500)");
    assert.ok(mid[0] < 750 && mid[1] < 750, "bulges toward the origin");
    const other = arcPoints(0, 1500, 1500, 0, Math.PI / 2);
    assert.ok(other[Math.floor(other.length / 2)][0] > 750, "the other way round");
  });

  test("doors and windows become openings in their walls", () => {
    assert.equal(p.openings.length, 3);
    const front = byName(p.openings, "Front door");
    const south = p.walls.find((w) => w.id === front.wall);
    assert.deepEqual([south.x1, south.y1, south.x2, south.y2], [8000, 6000, 0, 6000]);
    assert.deepEqual([front.kind, front.type, front.at, front.width, front.height, front.sill], ["door", "single", 6000, 900, 2100, 0]);
    // The front (+y) of the door faces outward: away from the wall's left normal.
    assert.equal(front.side, -1);
    const win = byName(p.openings, "Fenêtre double");
    assert.deepEqual([win.kind, win.type, win.at, win.width, win.sill], ["window", "casement", 6000, 1200, 900]);
    assert.equal(win.height, 1550, "the fixed light above it is joined in");
    const french = byName(p.openings, "Porte-fenêtre");
    assert.deepEqual([french.kind, french.type, french.hinge, french.at, french.width], ["door", "double", "end", 3000, 1400]);
    assert.ok(res.warnings.some((w) => /not in a wall/.test(w)));
    assert.ok(res.warnings.some((w) => /stacked/.test(w)));
  });

  test("rooms with names and floor materials", () => {
    assert.equal(p.rooms.length, 3);
    const living = byName(p.rooms, "Living");
    assert.equal(living.floor, "oak");
    near(roomArea(living), 3850 * 5800, 1);
    assert.equal(byName(p.rooms, "Bedroom").floor, "tile-white");
    assert.ok(res.warnings.some((w) => /without a usable outline/.test(w)));
  });

  test("furniture matched to the catalog by name in any language, else a box", () => {
    const kinds = Object.fromEntries(p.furniture.map((f) => [f.name, f.kind]));
    assert.deepEqual(kinds, { "Lit double": "doubleBed", "Canapé 3 places": "sofa3", Frigo: "fridge", Spaceship: "box", "Floor lamp": "floorLamp", Chair: "chair", Chaise: "chair" });
    const sofa = byName(p.furniture, "Canapé 3 places");
    assert.deepEqual([sofa.x, sofa.y, sofa.rot, sofa.w, sofa.d, sofa.h, sofa.color], [600, 3000, 90, 2100, 900, 800, "#6f7f94"]);
    const box = byName(p.furniture, "Spaceship");
    assert.deepEqual([box.w, box.d, box.h, box.color], [1000, 1000, 1000, "#336699"]);
    assert.ok(res.warnings.some((w) => /small accessories/.test(w)) && res.warnings.some((w) => /hidden/.test(w)));
    for (const f of p.furniture) assert.equal(f.level, p.levels[0].id);
  });

  test("staircases become stairs", () => {
    assert.equal(p.stairs.length, 1);
    const s = p.stairs[0];
    assert.deepEqual([s.x, s.y, s.rot, s.length, s.width, s.steps], [3000, 2000, 270, 3000, 1000, 15]);
  });

  test("dimensions, labels, polylines and the compass", () => {
    assert.deepEqual(p.dimensions.map((d) => [d.x1, d.y1, d.x2, d.y2, d.offset]), [[0, -500, 8000, -500, 200]]);
    assert.equal(p.texts.length, 1);
    assert.deepEqual([p.texts[0].text, p.texts[0].size, p.texts[0].rot, p.texts[0].level], ["Étage & combles", 300, 90, p.levels[1].id]);
    assert.equal(p.drawings.length, 1);
    assert.deepEqual(p.drawings[0].pts, [[0, 7000], [4000, 7500], [8000, 7000]]);
    assert.equal(p.drawings[0].color, "#ff0000");
    assert.ok(p.layers.some((l) => l.id === p.drawings[0].layer));
    assert.equal(p.meta.north, 30);
    near(p.meta.latitude, 37.5, 0.01);
    near(p.meta.longitude, 127, 0.01);
  });

  test("the project is sound: normalized, no model-check errors, builds in 3D", () => assertSound(p, "sh3d"));

  test("a bare Home.xml reads the same; .xml files are told apart by their root", async () => {
    const bytes = new TextEncoder().encode(HOME_XML);
    const again = await importSh3d(bytes);
    assert.equal(again.project.walls.length, p.walls.length);
    assert.equal(importSweetHomeXml(HOME_XML).project.openings.length, 3);
    assert.equal(bimKind("Home.xml", bytes), "sh3d");
    assert.equal(bimKind("house.sh3d", sh3d), "sh3d");
    assert.equal(bimKind("other.xml", new TextEncoder().encode("<?xml version='1.0'?><svg/>")), "xml");
    assert.equal(bimKind("m.ifcxml", new Uint8Array(0)), null);
    assert.equal(bimKind("model.xml", new TextEncoder().encode('<?xml version="1.0"?>\n<ifcXML xmlns="http://www.iai-tech.org/ifcXML/IFC2x3/FINAL">')), "ifcxml");
  });

  test("an .sh3d without Home.xml (saved before 5.3) gets a clear error", async () => {
    const old = deflateZip([{ name: "Home", data: new Uint8Array([0xac, 0xed, 0, 5, 1, 2, 3]) }, { name: "0", data: "x" }]);
    await assert.rejects(importSh3d(old), (e) => e.code === "sh3d-old" && /older than 5\.3/.test(e.message));
    await assert.rejects(importSh3d(deflateZip([{ name: "readme.txt", data: "hi" }])), (e) => e.code === "sh3d-not");
    await assert.rejects(importSh3d(new TextEncoder().encode("hello")), (e) => e.code === "sh3d-not");
  });

  test("a home without levels is one level at the home's wall height", () => {
    const r = importSweetHomeXml(`<home wallHeight='300'><wall xStart='0' yStart='0' xEnd='500' yEnd='0' thickness='15'/><wall xStart='500' yStart='0' xEnd='500' yEnd='400' thickness='15' height='200'/></home>`);
    assert.equal(r.project.levels.length, 1);
    assert.equal(r.project.levels[0].height, 3000);
    assert.deepEqual(r.project.walls.map((w) => w.height), [null, 2000]);
  });
});

describe("matching names to our catalog and colours to materials", () => {
  test("furniture names and catalog ids (several languages)", () => {
    const k = (n, s) => furnitureKindFor([n], s);
    assert.equal(k("eTeks#bedsideTable"), "nightstand");
    assert.equal(k("Lit 90x190", { w: 900, d: 1900, h: 500 }), "singleBed");
    assert.equal(k("King size bed", { w: 1900, d: 2100, h: 500 }), furnitureDef("kingBed") ? "kingBed" : "doubleBed");
    assert.equal(k("Lits superposés"), "bunkBed");
    assert.equal(k("Lavabo"), "washbasin");
    assert.equal(k("WC"), "toilet");
    assert.equal(k("Baignoire"), "bathtub");
    assert.equal(k("Lave linge"), "washer");
    assert.equal(k("Réfrigérateur / Congélateur"), "fridge");
    assert.equal(k("Table de nuit"), "nightstand");
    assert.equal(k("Armoire"), "wardrobe");
    assert.equal(k("Bibliothèque", { w: 1000, d: 400, h: 2100 }), "bookshelf");
    assert.equal(k("Plante verte"), "plant");
    assert.equal(k("Puybaret#oak"), "tree");
    assert.equal(k("Voiture"), "car");
    assert.equal(k("Office chair"), "officeChair");
    assert.equal(k("Tabouret"), "barStool");
    assert.equal(k("Divano"), "sofa2");
    assert.equal(k("침대", { w: 1000, d: 2000, h: 500 }), "singleBed");
    assert.equal(k("Escalier droit"), "@stair");
    assert.equal(k("Radiateur électrique"), "box");
    assert.equal(k(""), "box");
  });
  test("colours", () => {
    assert.equal(argbToHex("FF993300"), "#993300");
    assert.equal(argbToHex("00CACACA"), "#cacaca");
    assert.equal(argbToHex(""), null);
    assert.equal(argbToHex("nope"), null);
    assert.equal(floorMaterialFor("English parquet 3", null), "oak");
    assert.equal(floorMaterialFor("", "#7a553a"), "walnut");
    assert.equal(floorMaterialFor("Marbre", null), "marble");
    assert.equal(floorMaterialFor("", null), null);
  });
  test("overlapping walls are merged or shortened, stacked openings joined", () => {
    const walls = [
      { id: "a", level: "L", x1: 0, y1: 0, x2: 5000, y2: 0, thickness: 200, height: null },
      { id: "b", level: "L", x1: 4000, y1: 0, x2: 1000, y2: 0, thickness: 250, height: null },
      { id: "c", level: "L", x1: 4500, y1: 0, x2: 8000, y2: 0, thickness: 200, height: null },
    ];
    const openings = [{ id: "o", wall: "b", kind: "window", at: 1000, width: 1000, height: 1200, sill: 900 }];
    const r = resolveWallOverlaps(walls, openings, () => 2800);
    assert.equal(r.removed, 1);
    assert.equal(r.trimmed, 1);
    assert.deepEqual(walls.map((w) => w.id), ["a", "c"]);
    assert.equal(walls[0].thickness, 250);
    assert.deepEqual([walls[1].x1, walls[1].x2], [5000, 8000]);
    assert.deepEqual([openings[0].wall, openings[0].at], ["a", 3000]);
    const ops = [
      { id: "1", wall: "a", kind: "window", at: 1000, width: 1000, sill: 900, height: 1200 },
      { id: "2", wall: "a", kind: "window", at: 1000, width: 1000, sill: 2100, height: 400 },
      { id: "3", wall: "a", kind: "window", at: 1000, width: 1000, sill: 900, height: 1200 },
      { id: "4", wall: "a", kind: "door", at: 1500, width: 800, sill: 0, height: 2100 },
    ];
    const d = dropOverlappingOpenings(ops);
    assert.deepEqual(d.kept.map((o) => [o.id, o.sill, o.height]), [["1", 900, 1600]]);
    assert.deepEqual([d.stacked, d.twins, d.dropped], [1, 1, 1]);
  });
});

// ================================================================ gbXML
describe("gbXML", () => {
  const res = importGbxml(gbxmlFixture(), { name: "test.xml" });
  const p = res.project;
  const [A, B] = p.levels;
  const byName = (list, n) => list.find((x) => x.name === n);

  test("storeys become levels with heights up to the next one", () => {
    assert.equal(p.meta.title, "Test building");
    assert.deepEqual(p.levels.map((l) => [l.name, l.elevation, l.height]), [["Ground floor", 0, 3000], ["First floor", 3000, 3000]]);
    assert.equal(p.meta.latitude, 37.5);
    assert.equal(p.meta.longitude, 127);
    assert.match(p.meta.comment, /gbXML 6\.01 \(Hand written 1\)/);
  });

  test("vertical wall surfaces become walls; both faces of one wall merge; a two-storey wall splits", () => {
    const onA = p.walls.filter((w) => w.level === A.id), onB = p.walls.filter((w) => w.level === B.id);
    assert.equal(onA.length, 5);
    assert.equal(onB.length, 4);
    const south = onA.find((w) => w.y1 === 0 && w.y2 === 0);
    assert.deepEqual([Math.min(south.x1, south.x2), Math.max(south.x1, south.x2), south.thickness, south.height], [0, 10000, 250, null]);
    // y north in the file is y down in the plan.
    assert.ok(onA.some((w) => w.y1 === -6000 && w.y2 === -6000));
    const inner = onA.filter((w) => w.x1 === 6000 && w.x2 === 6000);
    assert.equal(inner.length, 1, "the interior wall written from both sides is one wall");
    assert.equal(inner[0].thickness, 200, "no construction → default thickness");
    assert.equal(p.walls.filter((w) => w.x1 === 10000 && w.x2 === 10000).length, 2, "east wall split per storey");
    assert.ok(res.warnings.some((w) => /split per storey/.test(w)));
    assert.ok(res.warnings.some((w) => /both sides/.test(w)));
  });

  test("openings: windows, doors (also from RectangularGeometry) and air openings", () => {
    assert.equal(p.openings.length, 5);
    const w = byName(p.openings, "win-a");
    assert.deepEqual([w.kind, w.type, w.width, w.height, w.sill], ["window", "casement", 1200, 1200, 900]);
    const wall = p.walls.find((x) => x.id === w.wall);
    const c = wallPoint(wall, w.at);
    near(c[0], 2600, 1); near(c[1], 0, 1);
    const slide = byName(p.openings, "door-slide");
    assert.deepEqual([slide.kind, slide.type, slide.width, slide.height, slide.sill], ["door", "sliding", 1800, 2100, 0]);
    const rect = p.openings.find((o) => !o.name && o.kind === "door");
    assert.ok(rect, "door from RectangularGeometry");
    const rw = p.walls.find((x) => x.id === rect.wall);
    const rc = wallPoint(rw, rect.at);
    near(rc[0], 8550, 1, "1 m in from the north-east corner, seen from outside"); near(rc[1], -6000, 1);
    near(rect.width, 900, 0.5);
    const air = byName(p.openings, "pass");
    assert.deepEqual([air.kind, air.width, air.height], ["opening", 1000, 2100]);
    const up = byName(p.openings, "win-b");
    assert.equal(p.walls.find((x) => x.id === up.wall).level, B.id);
    assert.deepEqual([up.type, up.sill, up.height, up.width], ["fixed", 900, 1200, 1500]);
    assert.ok(res.warnings.some((x) => /skylight/.test(x)));
  });

  test("spaces become rooms (shell bottom, planar geometry, storey by height)", () => {
    assert.deepEqual(p.rooms.map((r) => [r.name, r.level, Math.round(roomArea(r) / 1e6)]), [["Living", A.id, 36], ["Kitchen", A.id, 24], ["Bedroom", B.id, 60]]);
  });

  test("a flat roof surface becomes a flat roof on the storey below it; floors and shading are not elements", () => {
    assert.equal(p.roofs.length, 1);
    assert.deepEqual([p.roofs[0].kind, p.roofs[0].level, p.roofs[0].offset ?? 0], ["flat", B.id, 0]);
    assert.ok(res.warnings.some((x) => /shading/.test(x)));
  });

  test("the project is sound: normalized, no model-check errors, builds in 3D", () => assertSound(p, "gbxml"));

  test("length units: feet", () => {
    const ft = importGbxml(gbxmlFixture("Feet")).project;
    const south = ft.walls.find((w) => w.y1 === 0 && w.y2 === 0 && w.level === ft.levels[0].id);
    near(Math.abs(south.x2 - south.x1), 3048, 0.5);
    assert.equal(ft.levels[1].elevation, 914.4);
    // Material thicknesses carry their own unit.
    assert.equal(south.thickness, 250);
  });

  test("UTF-16 files (as Revit writes them) and sniffing .xml", () => {
    const text = gbxmlFixture();
    const le = new Uint8Array(2 + text.length * 2);
    le[0] = 0xff; le[1] = 0xfe;
    for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); le[2 + i * 2] = c & 0xff; le[3 + i * 2] = c >> 8; }
    assert.equal(decodeXmlBytes(le).slice(0, 5), "<?xml");
    assert.equal(importGbxml(le).project.walls.length, p.walls.length);
    assert.equal(bimKind("export.xml", le), "gbxml");
    assert.equal(bimKind("export.gbxml", new Uint8Array(0)), "gbxml");
  });

  test("no storeys: levels from the floor heights; not gbXML is refused", () => {
    const flat = gbxmlFixture().replace(/<BuildingStorey[^]*?<\/BuildingStorey>/g, "").replace(/ buildingStoreyIdRef="[^"]*"/g, "");
    const r = importGbxml(flat);
    assert.deepEqual(r.project.levels.map((l) => l.elevation), [0, 3000]);
    assert.ok(r.warnings.some((w) => /No BuildingStorey/.test(w)));
    assert.throws(() => importGbxml("<root/>"), (e) => e.code === "gbxml-not");
  });

  test("a floor in pieces is joined, gable walls stop at the eaves, a survey datum is moved to 0", () => {
    // L-shaped room whose shell bottom is two rectangles; storey at 100 m.
    const z = 100;
    const xml = `<gbXML lengthUnit="Meters"><Campus id="c"><Building id="b"><BuildingStorey id="s"><Level>${z}</Level></BuildingStorey>
      <Space id="L" buildingStoreyIdRef="s"><Name>L room</Name><ShellGeometry><ClosedShell>${poly(floorRect(0, 0, 6, 3, z))}${poly(floorRect(0, 3, 3, 6, z))}${poly(floorRect(0, 0, 6, 6, z + 3))}</ClosedShell></ShellGeometry></Space>
      </Building>
      ${surface("w1", "ExteriorWall", wallRect(0, 0, 6, 0, z, z + 3))}
      ${surface("gable", "ExteriorWall", [[0, 0, z], [0, 6, z], [0, 6, z + 3], [0, 3, z + 5], [0, 0, z + 3]])}
      </Campus></gbXML>`;
    const r = importGbxml(xml);
    const p = r.project;
    assert.equal(p.levels[0].elevation, 0);
    assert.ok(r.warnings.some((w) => /moved down/.test(w)));
    assert.equal(p.rooms.length, 1);
    near(roomArea(p.rooms[0]), 27e6, 1, "6×3 + 3×3 m²");
    assert.equal(p.rooms[0].pts.length, 6);
    const gable = p.walls.find((w) => w.x1 === 0 && w.x2 === 0);
    assert.equal(gable.height ?? p.levels[0].height, 3000, "the gable wall stops at its ends' height");
    assert.ok(r.warnings.some((w) => /gable/.test(w)));
  });
});

// ================================================================ IFC ZIP
describe("IFC ZIP (.ifczip)", () => {
  test("is unzipped and read like .ifc", async () => {
    const src = newProject("Zipped");
    const L = src.levels[0].id;
    src.walls.push({ id: "w1", level: L, x1: 0, y1: 0, x2: 5000, y2: 0, thickness: 200, height: null }, { id: "w2", level: L, x1: 5000, y1: 0, x2: 5000, y2: 4000, thickness: 200, height: null });
    src.openings.push({ id: "d1", wall: "w1", kind: "door", at: 2500, width: 900, height: 2100, sill: 0 });
    normalizeProject(src);
    const ifc = exportIfc(src, { timestamp: "2026-01-02T03:04:05" });
    const zip = deflateZip([{ name: "model/Zipped.ifc", data: ifc }]);
    const res = await readBimFile({ name: "Zipped.ifczip", bytes: zip });
    assert.equal(res.kind, "ifczip");
    const direct = importIfc(ifc).project;
    assert.equal(res.project.walls.length, direct.walls.length);
    assert.equal(res.project.openings.length, 1);
    await assert.rejects(readBimFile({ name: "empty.ifczip", bytes: deflateZip([{ name: "readme.txt", data: "no model" }]) }), (e) => e.code === "ifczip-empty");
  });
});
