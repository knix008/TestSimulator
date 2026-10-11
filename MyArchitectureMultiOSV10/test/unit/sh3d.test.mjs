// Sweet Home 3D beyond Home.xml basics: the 3D models and textures packed in
// a .sh3d (as model furniture and project materials), roofs, files saved
// before 5.3 (a Java Object Serialization Stream, built here byte by byte),
// and the .sh3d writer (re-read, checked against the Home.xml DTD's element
// order and attribute lists). All fixtures are written by hand.
//
// SH3D_CORPUS=<folder of .sh3d files> also imports every real file in it.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "../../src/vendor/three/three.module.js";
import { deflateZip } from "./interop-fixtures.mjs";
import { importSh3d, wallMaterialFor } from "../../src/io/sh3d.js";
import { defaultMtl, isDefaultMaterial, sniffModel, pieceModelKey, pieceModelColors } from "../../src/io/sh3d-models.js";
import { JavaObjectReader, readJavaObject, javaValue, decodeModifiedUtf8 } from "../../src/io/javaser.js";
import { sh3dJavaHome } from "../../src/io/sh3d-java.js";
import { exportSh3d, glbMeshes, meshesToObj } from "../../src/io/sh3d-export.js";
import { loadModelFile } from "../../src/io/models3d.js";
import { zipEntries, zipEntryData } from "../../src/io/unzip.js";
import { parseXml } from "../../src/io/svgimport.js";
import { normalizeProject, newProject, serializeProject, parseProject } from "../../src/core/project.js";
import { buildBuilding, makeMaterials, recolorModel } from "../../src/view3d/build.js";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} ${a} ≈ ${b}`);
const opts = { glb: false, textures: false };
const quiet = (fn) => async (...a) => { const w = console.warn; console.warn = () => {}; try { return await fn(...a); } finally { console.warn = w; } };

// ---------------------------------------------------------------- fixtures
// A wedge (not symmetric), 100 × 50 × 20 cm, with the Java 3D default material "flyellow".
const WEDGE_OBJ = `# wedge
v 0 0 0
v 100 0 0
v 0 0 50
v 0 20 0
v 100 20 0
v 0 20 50
usemtl flyellow
f 1 2 3
f 4 6 5
f 1 4 5 2
f 1 3 6 4
f 2 5 6 3
`;
const CHAIR_OBJ = `mtllib chair.mtl
v -20 0 -20
v 20 0 -20
v 20 0 20
v -20 0 20
v 0 90 0
vt 0 0
vt 1 0
vt 1 1
vt 0 1
usemtl seat
f 1/1 2/2 3/3 4/4
usemtl leg
f 1/1 2/2 5/3
f 2/2 3/3 5/3
f 3/3 4/4 5/3
f 4/4 1/1 5/3
`;
const CHAIR_MTL = `newmtl seat
Kd 0.8 0.2 0.2
map_Kd seat.png

newmtl leg
Kd 0.3 0.3 0.3
`;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

const MODEL_HOME = `<?xml version='1.0'?>
<home version='7200' name='Models.sh3d' wallHeight='250'>
  <level id='l0' name='Ground' elevation='0' floorThickness='12' height='250' elevationIndex='0'/>
  <level id='l1' name='Roof' elevation='262' floorThickness='12' height='250' elevationIndex='0'/>
  <pieceOfFurniture level='l0' name='Wedge' model='1' x='100' y='100' width='100' depth='50' height='20'/>
  <pieceOfFurniture level='l0' name='Wedge' model='1' x='300' y='100' width='200' depth='100' height='40' modelMirrored='true' color='FF336699'/>
  <pieceOfFurniture level='l0' name='Turned wedge' model='1' x='300' y='300' width='50' depth='100' height='20' modelRotation='0 0 1 0 1 0 -1 0 0'/>
  <pieceOfFurniture level='l0' catalogId='eTeks#chair' name='Chair' model='2/chair.obj' x='500' y='100' angle='1.5707964' width='40' depth='40' height='90'>
    <material name='leg' color='FF00FF00'/>
  </pieceOfFurniture>
  <pieceOfFurniture level='l0' catalogId='eTeks#chair' name='Chair' model='2/chair.obj' x='560' y='100' width='40' depth='40' height='90'/>
  <light level='l0' name='Lamp' model='9' x='50' y='50' width='30' depth='30' height='150' power='0.5'><lightSource x='0.5' y='0.5' z='0.9' color='FFFFFF'/></light>
  <pieceOfFurniture level='l0' name='Missing' model='404' x='50' y='300' width='60' depth='60' height='80'/>
  <pieceOfFurniture level='l1' catalogId='eTeks#roof' name='Red slate roof' model='1' x='300' y='200' elevation='0' width='600' depth='400' height='150'/>
  <wall id='w0' level='l0' xStart='0' yStart='0' xEnd='600' yEnd='0' thickness='20' height='250'>
    <texture attribute='leftSideTexture' name='Red bricks' width='60' height='60' image='5'/>
    <texture attribute='rightSideTexture' name='Roughcast' width='20' height='20' image='6'/>
  </wall>
  <wall id='w1' level='l0' xStart='600' yStart='0' xEnd='600' yEnd='400' thickness='20' rightSideColor='FFAA0000'/>
  <room level='l0' name='Living' areaVisible='true'>
    <texture attribute='floorTexture' name='Oak parquet' width='50' height='50' image='7'/>
    <point x='10' y='10'/><point x='590' y='10'/><point x='590' y='390'/><point x='10' y='390'/>
  </room>
</home>`;

const modelZip = () => deflateZip([
  { name: "Home.xml", data: MODEL_HOME },
  { name: "1", data: WEDGE_OBJ },
  { name: "2/", data: new Uint8Array(0) },
  { name: "2/chair.obj", data: CHAIR_OBJ },
  { name: "2/chair.mtl", data: CHAIR_MTL },
  { name: "2/seat.png", data: PNG },
  { name: "9", data: "v 0 0 0\nv 1 0 0\nv 0 1 0\nl 1 2 3\n" },
  { name: "5", data: JPG }, { name: "6", data: PNG }, { name: "7", data: JPG },
]);

// ================================================================ models and textures
describe("Sweet Home 3D: the file's 3D models and textures", async () => {
  const res = await quiet(importSh3d)(modelZip(), { name: "Models.sh3d", ...opts });
  const p = res.project;
  const byName = (n) => p.furniture.filter((f) => f.name === n);

  test("pieces with a packed model become model furniture of their size; shared models are one asset", () => {
    const wedges = byName("Wedge");
    assert.equal(wedges.length, 2);
    for (const f of wedges) assert.equal(f.kind, "model");
    assert.equal(wedges[0].model, wedges[1].model, "mirroring and colour do not make a second asset");
    assert.deepEqual([wedges[1].w, wedges[1].d, wedges[1].h, wedges[1].mirrored], [2000, 1000, 400, true]);
    assert.deepEqual(wedges[1].modelColors, { "": "#336699" });
    const asset = p.models.find((m) => m.id === wedges[0].model);
    assert.deepEqual(asset.size, [1000, 500, 200], "baked at the first piece's size");
    assert.equal(asset.format, "obj");
    const chairs = byName("Chair");
    assert.equal(chairs[0].model, chairs[1].model, "a material colour is an item override, not a new asset");
    assert.deepEqual(chairs[0].modelColors, { leg: "#00ff00" });
    assert.equal(chairs[0].rot, 90);
    assert.ok(res.warnings.some((w) => /came in as the 3D models packed in the file/.test(w)));
  });

  test("the model rotation is baked: a turned wedge gets its own asset with a turned outline", () => {
    const [turned] = byName("Turned wedge");
    const plain = byName("Wedge")[0];
    assert.notEqual(turned.model, plain.model);
    const a = p.models.find((m) => m.id === plain.model).outline, b = p.models.find((m) => m.id === turned.model).outline;
    // The plain wedge's footprint is a triangle with its right angle at -x/-z; the turned one differs.
    assert.notDeepEqual(a.map((q) => q.map((v) => Math.round(v * 10))).sort(), b.map((q) => q.map((v) => Math.round(v * 10))).sort());
  });

  test("an empty model (a light source) is skipped; a missing one falls back to a catalog shape", () => {
    assert.equal(byName("Lamp").length, 0);
    assert.ok(res.warnings.some((w) => /shows nothing/.test(w)));
    const [missing] = byName("Missing");
    assert.ok(missing && missing.kind !== "model");
  });

  test("roofs are models on their level", () => {
    const [roof] = byName("Red slate roof");
    assert.equal(roof.kind, "model");
    assert.equal(roof.level, p.levels[1].id);
    assert.ok(res.warnings.some((w) => /roofs came in as 3D models/.test(w)));
    assert.equal(p.roofs.length, 0);
  });

  test("wall and floor textures become project materials with their image; colours stay colours", () => {
    const w0 = p.walls.find((w) => w.y1 === 0 && w.y2 === 0);
    const mat = p.materials.find((m) => m.id === w0.material);
    assert.ok(mat, "a project material");
    // The room lies to the right of w0 (y > 0, the right side on screen): the left side faces out.
    assert.match(mat.name, /Red bricks/);
    assert.equal(mat.tile, 600);
    assert.match(mat.src, /^data:image\/jpeg;base64,/);
    assert.equal(mat.color, "#a65a42", "the brick colour until the image is decoded");
    const w1 = p.walls.find((w) => w.x1 === 6000 && w.x2 === 6000);
    assert.equal(w1.material, "#aa0000");
    const floor = p.materials.find((m) => m.id === p.rooms[0].floor);
    assert.match(floor.name, /Oak parquet/);
    assert.equal(floor.color, "#c49a6c");
    assert.ok(res.warnings.some((w) => /textures of walls and floors/.test(w)));
  });

  test("the project normalizes, survives save / load and builds in 3D", () => {
    const again = parseProject(serializeProject(p));
    assert.equal(again.models.length, p.models.length);
    assert.equal(again.materials.length, p.materials.length);
    const root = buildBuilding(THREE, p, makeMaterials(THREE, { textures: false }), {});
    let meshes = 0;
    root.traverse((o) => { if (o.isMesh) meshes++; });
    assert.ok(meshes > 5);
  });

  test("catalog shapes on request: roofs become roofs of ours, no assets", async () => {
    const r = await quiet(importSh3d)(modelZip(), { name: "Models.sh3d", models: "catalog", ...opts });
    assert.equal(r.project.models.length, 0);
    assert.ok(r.project.furniture.every((f) => f.kind !== "model"));
    assert.equal(r.project.roofs.length, 1);
    const roof = r.project.roofs[0];
    assert.deepEqual([roof.kind, roof.material, roof.level], ["shed", "roof-slate", r.project.levels[1].id]);
    near(roof.pitch, Math.round(Math.atan(1500 / 4000) * 180 / Math.PI), 0.5, "pitch from height over depth");
    assert.ok(r.warnings.some((w) => /roofs generated from their outline/.test(w)));
  });
});

describe("Sweet Home 3D model helpers", () => {
  test("Java 3D default materials fill in OBJ files without an MTL", () => {
    assert.ok(isDefaultMaterial("flyellow") && isDefaultMaterial("bone2") && !isDefaultMaterial("nonsense"));
    const mtl = defaultMtl(["flyellow", "smoked_glass", "nonsense"]);
    assert.match(mtl, /newmtl flyellow\nKd 1\.0000 0\.6667 0\.0000/);
    assert.match(mtl, /newmtl smoked_glass[^]*\nd 0\.02/);
    assert.doesNotMatch(mtl, /nonsense/);
  });

  test("single-file model entries are recognised by their first bytes", () => {
    const e = new TextEncoder();
    assert.equal(sniffModel(e.encode(WEDGE_OBJ)), "obj");
    assert.equal(sniffModel(e.encode("<?xml version='1.0'?><COLLADA xmlns='x'>")), "dae");
    assert.equal(sniffModel(new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0])), "glb");
    assert.equal(sniffModel(new Uint8Array([0x4d, 0x4d, 0x10, 0, 0, 0])), "3ds");
    assert.equal(sniffModel(deflateZip([{ name: "a.obj", data: "v 0 0 0" }])), "zip");
  });

  test("what makes pieces share a model, and their colour overrides", () => {
    const el = (attrs, children = []) => ({ name: "pieceOfFurniture", attrs, children });
    const m = (name, color) => ({ name: "material", attrs: color ? { name, color } : { name }, children: [] });
    assert.equal(pieceModelKey(el({ model: "1" })), pieceModelKey(el({ model: "1", color: "FF112233", modelMirrored: "true" })));
    assert.notEqual(pieceModelKey(el({ model: "1" })), pieceModelKey(el({ model: "1", modelRotation: "0 0 1 0 1 0 -1 0 0" })));
    assert.deepEqual(pieceModelColors(el({ model: "1" }, [m("a", "FF0000FF"), m("b")])), { a: "#0000ff" });
    assert.equal(pieceModelColors(el({ model: "1" })), null);
  });

  test("loadModelFile: pre-rotation and fitting to a size", async () => {
    const pre = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    const r = await loadModelFile({ name: "w.obj", bytes: new TextEncoder().encode(WEDGE_OBJ) }, { glb: false, pre, fit: [500, 1000, 200] });
    assert.deepEqual(r.size, [500, 1000, 200]);
    const box = new THREE.Box3().setFromObject(r.object);
    near(box.max.x - box.min.x, 0.5, 1e-6); near(box.max.z - box.min.z, 1, 1e-6); near(box.min.y, 0, 1e-9);
  });

  test("recolorModel paints a whole model or one material, leaving the shared asset alone", () => {
    const shared = new THREE.MeshStandardMaterial({ name: "leg", color: 0xffffff });
    const other = new THREE.MeshStandardMaterial({ name: "seat", color: 0xffffff });
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(), shared), new THREE.Mesh(new THREE.BoxGeometry(), other));
    const inst = g.clone();
    recolorModel(inst, { leg: "#00ff00" });
    assert.equal(inst.children[0].material.color.getHexString(), "00ff00");
    assert.equal(inst.children[1].material, other);
    assert.equal(shared.color.getHexString(), "ffffff");
    recolorModel(inst, { "": "#ff0000" });
    assert.equal(inst.children[1].material.color.getHexString(), "ff0000");
  });

  test("wall textures map to our materials by name", () => {
    assert.equal(wallMaterialFor("Briques rouges", null), "brick");
    assert.equal(wallMaterialFor("Pierre de taille", "#ffffff"), "stone");
    assert.equal(wallMaterialFor("Lambris", null), "wood-cladding");
    assert.equal(wallMaterialFor("Roughcast", "#eeeeee"), "#eeeeee");
    assert.equal(wallMaterialFor("Roughcast", null), "plaster");
    assert.equal(wallMaterialFor("", "#123456"), "#123456");
    assert.equal(wallMaterialFor("", null), null);
  });
});

// ================================================================ Java serialization
// A tiny ObjectOutputStream: class descriptions, objects, strings, arrays, back references.
class JavaWriter {
  constructor() { this.b = []; this.next = 0x7e0000; this.strings = new Map(); this.b.push(0xac, 0xed, 0, 5); }
  u8(v) { this.b.push(v & 255); }
  u16(v) { this.b.push((v >> 8) & 255, v & 255); }
  i32(v) { this.b.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); }
  i64(v) { const x = BigInt.asUintN(64, BigInt(v)); for (let s = 56n; s >= 0n; s -= 8n) this.b.push(Number((x >> s) & 255n)); }
  f32(v) { const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, v); for (let i = 0; i < 4; i++) this.b.push(d.getUint8(i)); }
  utf(s) { const e = new TextEncoder().encode(s); this.u16(e.length); this.b.push(...e); }
  handle() { return this.next++; }
  ref(h) { this.u8(0x71); this.i32(h); }
  str(s) { if (this.strings.has(s)) return this.ref(this.strings.get(s)); this.u8(0x74); this.utf(s); this.strings.set(s, this.handle()); }
  desc(d) {
    if (!d) { this.u8(0x70); return; }
    if (d.h !== undefined) { this.ref(d.h); return; }
    this.u8(0x72); this.utf(d.name); this.i64(1); d.h = this.handle(); this.u8(d.flags ?? 2);
    const fields = d.fields || [];
    this.u16(fields.length);
    for (const [type, name, cls] of fields) { this.u8(type.charCodeAt(0)); this.utf(name); if (type === "L" || type === "[") this.str(cls); }
    this.u8(0x78);
    this.desc(d.sup || null);
  }
  value(type, v) {
    if (type === "F") this.f32(v); else if (type === "I") this.i32(v); else if (type === "Z") this.u8(v ? 1 : 0); else if (type === "J") this.i64(v);
    else this.any(v);
  }
  any(v) {
    if (v === null || v === undefined) this.u8(0x70);
    else if (typeof v === "string") this.str(v);
    else if (typeof v === "function") v(this);
    else throw new Error("unsupported value");
  }
  // obj(desc, {className: {field: value}}, {className: [items]}) — items: Uint8Array block data or values.
  obj(d, values = {}, annotations = {}) {
    return (w) => {
      if (d.instance !== undefined && values.$same) { w.ref(d.instance); return; }
      w.u8(0x73); w.desc(d); w.lastObj = w.handle();
      const chain = [];
      for (let x = d; x; x = x.sup) chain.unshift(x);
      for (const c of chain) {
        const vals = values[c.name] || {};
        for (const [type, name] of c.fields || []) w.value(type, vals[name] ?? (type === "L" || type === "[" ? null : 0));
        if ((c.flags ?? 2) & 1) {
          for (const it of annotations[c.name] || []) { if (it instanceof Uint8Array) { w.u8(0x77); w.u8(it.length); w.b.push(...it); } else w.any(it); }
          w.u8(0x78);
        }
      }
    };
  }
  floats(d, arr) { return (w) => { w.u8(0x75); w.desc(d); w.handle(); w.i32(arr.length); for (const v of arr) w.f32(v); }; }
  objects(d, arr) { return (w) => { w.u8(0x75); w.desc(d); w.handle(); w.i32(arr.length); for (const v of arr) w.any(v); }; }
  bytes() { return new Uint8Array(this.b); }
}

const M = "com.eteks.sweethome3d.model.";
const intBlock = (n) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
function homeStream({ withLevels = true } = {}) {
  const w = new JavaWriter();
  const D = {
    home: { name: `${M}Home`, flags: 3, fields: [["F", "wallHeight"], ["J", "version"], ["L", "name", "Ljava/lang/String;"], ["L", "walls", "Ljava/util/List;"], ["L", "furniture", "Ljava/util/List;"], ["L", "levels", "Ljava/util/List;"], ["L", "rooms", "Ljava/util/List;"], ["L", "labels", "Ljava/util/List;"], ["L", "compass", `L${M}Compass;`]] },
    list: { name: "java.util.ArrayList", flags: 3, fields: [["I", "size"]] },
    number: { name: "java.lang.Number", fields: [] },
    level: { name: `${M}Level`, fields: [["F", "elevation"], ["F", "floorThickness"], ["F", "height"], ["I", "elevationIndex"], ["L", "name", "Ljava/lang/String;"]] },
    wall: { name: `${M}Wall`, fields: [["F", "thickness"], ["F", "xEnd"], ["F", "xStart"], ["F", "yEnd"], ["F", "yStart"], ["L", "height", "Ljava/lang/Float;"], ["L", "leftSideColor", "Ljava/lang/Integer;"], ["L", "level", `L${M}Level;`], ["L", "wallAtEnd", `L${M}Wall;`]] },
    piece: { name: `${M}HomePieceOfFurniture`, fields: [["F", "angle"], ["F", "depth"], ["F", "elevation"], ["F", "height"], ["Z", "modelMirrored"], ["Z", "visible"], ["F", "width"], ["F", "x"], ["F", "y"], ["L", "color", "Ljava/lang/Integer;"], ["L", "level", `L${M}Level;`], ["L", "model", `L${M}Content;`], ["L", "modelRotation", "[[F"], ["L", "name", "Ljava/lang/String;"]] },
    content: { name: "com.eteks.sweethome3d.tools.URLContent", fields: [["L", "url", "Ljava/net/URL;"]] },
    url: { name: "java.net.URL", flags: 3, fields: [["I", "hashCode"], ["I", "port"], ["L", "authority", "Ljava/lang/String;"], ["L", "file", "Ljava/lang/String;"], ["L", "host", "Ljava/lang/String;"], ["L", "protocol", "Ljava/lang/String;"], ["L", "ref", "Ljava/lang/String;"]] },
    room: { name: `${M}Room`, fields: [["L", "floorColor", "Ljava/lang/Integer;"], ["L", "name", "Ljava/lang/String;"], ["L", "points", "[[F"]] },
    label: { name: `${M}Label`, fields: [["F", "x"], ["F", "y"], ["L", "text", "Ljava/lang/String;"]] },
    compass: { name: `${M}Compass`, fields: [["F", "latitude"], ["F", "longitude"], ["F", "northDirection"]] },
    ff: { name: "[[F", fields: [] }, f: { name: "[F", fields: [] },
  };
  D.float = { name: "java.lang.Float", fields: [["F", "value"]], sup: D.number };
  D.integer = { name: "java.lang.Integer", fields: [["I", "value"]], sup: D.number };
  const list = (items) => w.obj(D.list, { "java.util.ArrayList": { size: items.length } }, { "java.util.ArrayList": [intBlock(items.length), ...items] });
  const F = (v) => w.obj(D.float, { "java.lang.Float": { value: v } });
  const I = (v) => w.obj(D.integer, { "java.lang.Integer": { value: v } });
  // Level objects are written once and referenced afterwards (handles).
  let levelHandle = null;
  const level0 = (wr) => { if (levelHandle !== null) { wr.ref(levelHandle); return; } w.obj(D.level, { [`${M}Level`]: { elevation: 0, floorThickness: 12, height: 250, name: "Rez-de-chaussée" } })(wr); levelHandle = wr.lastObj; };
  const lv = withLevels ? level0 : null;
  let wall2Handle = null;
  const wall = (x1, y1, x2, y2, extra = {}) => (wr) => {
    w.obj(D.wall, { [`${M}Wall`]: { thickness: 20, xStart: x1, yStart: y1, xEnd: x2, yEnd: y2, level: lv, ...extra } })(wr);
  };
  const url = (file) => w.obj(D.url, { "java.net.URL": { hashCode: -1, port: -1, file, host: "", protocol: "jar", authority: null } }, { "java.net.URL": [] });
  const piece = (vals) => w.obj(D.piece, { [`${M}HomePieceOfFurniture`]: { visible: true, level: lv, ...vals } });
  const rows = (...r) => w.objects(D.ff, r.map((row) => w.floats(D.f, row)));
  const home = w.obj(D.home, { [`${M}Home`]: {
    wallHeight: 250, version: 5200, name: "Ancienne maison.sh3d",
    levels: list(withLevels ? [level0] : []),
    walls: list([wall(0, 0, 800, 0, { height: F(260), leftSideColor: I(0xffece8e1 | 0) }), (wr) => { wall2Handle = wr.next; wall(800, 0, 800, 600)(wr); }]),
    furniture: list([
      piece({ name: "Wedge", x: 100, y: 100, width: 100, depth: 50, height: 20, model: w.obj(D.content, { "com.eteks.sweethome3d.tools.URLContent": { url: url("file:/C:/temp/home.sh3d!/1") } }), modelRotation: rows([0, 0, 1], [0, 1, 0], [-1, 0, 0]) }),
      piece({ name: "Lit double", x: 400, y: 300, width: 160, depth: 200, height: 50, angle: Math.PI / 2, color: I(0xff336699 | 0), modelMirrored: true }),
    ]),
    rooms: list([w.obj(D.room, { [`${M}Room`]: { name: "Séjour", floorColor: I(0xffc49a6c | 0), points: rows([10, 10], [790, 10], [790, 590], [10, 590]) } })]),
    labels: list([w.obj(D.label, { [`${M}Label`]: { x: 400, y: 300, text: "Étage ✓ \u0000 fin" } })]),
    compass: w.obj(D.compass, { [`${M}Compass`]: { latitude: 0.6544985, longitude: 2.2165682, northDirection: Math.PI / 6 } }),
  } });
  home(w);
  void wall2Handle;
  return w.bytes();
}

describe("Java Object Serialization Stream reader", () => {
  test("strings, boxed numbers, collections, arrays, enums, back references, reset", () => {
    const w = new JavaWriter();
    const list = { name: "java.util.ArrayList", flags: 3, fields: [["I", "size"]] };
    const map = { name: "java.util.HashMap", flags: 3, fields: [["F", "loadFactor"], ["I", "threshold"]] };
    const integer = { name: "java.lang.Integer", fields: [["I", "value"]], sup: { name: "java.lang.Number", fields: [] } };
    const I = (v) => w.obj(integer, { "java.lang.Integer": { value: v } });
    // [ "a", 7, {"k": 8}, float[] {1.5, 2}, Enum.B, "a" (back reference) ]
    const enumVal = (wr) => { wr.u8(0x7e); wr.desc({ name: "pkg.Kind", flags: 0x12, fields: [], sup: { name: "java.lang.Enum", flags: 0x12, fields: [] } }); wr.handle(); wr.str("B"); };
    w.obj(list, { "java.util.ArrayList": { size: 6 } }, { "java.util.ArrayList": [intBlock(6), "a", I(7), w.obj(map, { "java.util.HashMap": { loadFactor: 0.75, threshold: 12 } }, { "java.util.HashMap": [new Uint8Array([0, 0, 0, 16, 0, 0, 0, 1]), "k", I(8)] }), w.floats({ name: "[F", fields: [] }, [1.5, 2]), enumVal, "a"] })(w);
    w.u8(0x79); // TC_RESET, then a new object
    w.strings.clear(); w.next = 0x7e0000;
    w.str("after reset");
    const r = new JavaObjectReader(w.bytes());
    const v = r.readObject();
    assert.equal(v.$class, "java.util.ArrayList");
    const items = javaValue(v);
    assert.equal(items.length, 6);
    assert.equal(items[0], "a");
    assert.equal(javaValue(items[1]), 7);
    const m = javaValue(items[2]);
    assert.ok(m instanceof Map);
    assert.equal(javaValue(m.get("k")), 8);
    assert.deepEqual(Array.from(items[3]), [1.5, 2]);
    assert.deepEqual([items[4].$enum, items[4].name], ["pkg.Kind", "B"]);
    assert.equal(items[5], "a");
    assert.equal(r.readObject(), "after reset");
  });

  test("modified UTF-8 and errors", () => {
    assert.equal(decodeModifiedUtf8(new Uint8Array([0x41, 0xc0, 0x80, 0xc3, 0xa9, 0xe2, 0x9c, 0x93])), "A\u0000é✓");
    assert.throws(() => readJavaObject(new Uint8Array([1, 2, 3, 4])), /ACED/);
    assert.throws(() => readJavaObject(new Uint8Array([0xac, 0xed, 0, 5, 0x73, 0x72])), /end of stream/);
  });

  test("a Sweet Home 3D Home object maps onto the Home.xml element tree", () => {
    const home = sh3dJavaHome(homeStream());
    assert.equal(home.name, "home");
    assert.deepEqual([home.attrs.version, home.attrs.name, home.attrs.wallHeight], ["5200", "Ancienne maison.sh3d", "250"]);
    const kinds = home.children.map((c) => c.name);
    assert.deepEqual(kinds, ["level", "compass", "pieceOfFurniture", "pieceOfFurniture", "wall", "wall", "room", "label"]);
    const [w0] = home.children.filter((c) => c.name === "wall");
    assert.deepEqual([w0.attrs.xEnd, w0.attrs.height, w0.attrs.leftSideColor, w0.attrs.level], ["800", "260", "FFECE8E1", "level0"]);
    const w1 = home.children.filter((c) => c.name === "wall")[1];
    assert.equal(w1.attrs.height, "250", "no height → the home's wall height");
    const wedge = home.children.find((c) => c.attrs && c.attrs.name === "Wedge");
    assert.deepEqual([wedge.attrs.model, wedge.attrs.modelRotation], ["1", "0 0 1 0 1 0 -1 0 0"]);
    const bed = home.children.find((c) => c.attrs && c.attrs.name === "Lit double");
    assert.deepEqual([bed.attrs.color, bed.attrs.modelMirrored, bed.attrs.angle], ["FF336699", "true", String(Math.fround(Math.PI / 2).toPrecision(8) * 1)]);
    const room = home.children.find((c) => c.name === "room");
    assert.equal(room.children.filter((c) => c.name === "point").length, 4);
    assert.equal(home.children.find((c) => c.name === "label").children.find((c) => c.name === "text").children[0].text, "Étage ✓ \u0000 fin");
  });

  test("an .sh3d with only the serialized Home imports like a Home.xml one", quiet(async () => {
    const zip = deflateZip([{ name: "Home", data: homeStream() }, { name: "1", data: WEDGE_OBJ }]);
    const r = await importSh3d(zip, { name: "old.sh3d", ...opts });
    const p = r.project;
    assert.equal(p.meta.title, "Ancienne maison");
    assert.deepEqual([p.levels.length, p.levels[0].name], [1, "Rez-de-chaussée"]);
    assert.equal(p.walls.length, 2);
    assert.deepEqual([p.walls[0].x2, p.walls[0].height, p.walls[0].material], [8000, 2600, "#ece8e1"]);
    assert.equal(p.rooms[0].name, "Séjour");
    const wedge = p.furniture.find((f) => f.name === "Wedge");
    assert.equal(wedge.kind, "model");
    assert.equal(p.models.length, 1);
    const bed = p.furniture.find((f) => f.name === "Lit double");
    assert.deepEqual([bed.kind, bed.rot, bed.color], ["doubleBed", 90, "#336699"]);
    assert.equal(p.texts[0].text, "Étage ✓ \u0000 fin");
    near(p.meta.north, 30, 0.01);
    assert.ok(r.warnings.some((w) => /Java-serialized/.test(w)));
    // Sweet Home 3D 1.x had no levels at all.
    const noLevels = await importSh3d(deflateZip([{ name: "Home", data: homeStream({ withLevels: false }) }]), opts);
    assert.equal(noLevels.project.levels.length, 1);
    assert.equal(noLevels.project.walls.length, 2);
  }));
});

// ================================================================ export
// Element order and attributes of the Home.xml DTD (HomeXMLHandler) for the elements we write.
const PIECE_ATTRS = "id name angle visible movable description information license creator modelMirrored nameVisible nameAngle nameXOffset nameYOffset price level catalogId x y elevation width depth height dropOnTopElevation model icon planIcon modelRotation modelCenteredAtOrigin backFaceShown modelFlags modelSize doorOrWindow resizable deformable texturable staircaseCutOutShape color shininess valueAddedTaxPercentage currency";
const DTD = {
  home: { attrs: "version name camera selectedLevel wallHeight basePlanLocked furnitureSortedProperty furnitureDescendingSorted", order: ["property", "furnitureVisibleProperty", "environment", "backgroundImage", "print", "compass", "camera|observerCamera", "level", "pieceOfFurniture|doorOrWindow|furnitureGroup|light", "wall", "room", "polyline", "dimensionLine", "label"] },
  environment: { attrs: "groundColor backgroundImageVisibleOnGround3D skyColor lightColor wallsAlpha allLevelsVisible observerCameraElevationAdjusted ceillingLightColor drawingMode subpartSizeUnderLight photoWidth photoHeight photoAspectRatio photoQuality videoWidth videoAspectRatio videoQuality videoSpeed videoFrameRate" },
  compass: { attrs: "x y diameter northDirection longitude latitude timeZone visible", required: "x y diameter" },
  level: { attrs: "id name elevation floorThickness height elevationIndex visible viewable", required: "id name elevation floorThickness height" },
  pieceOfFurniture: { attrs: `${PIECE_ATTRS} horizontallyRotatable pitch roll widthInPlan depthInPlan heightInPlan`, required: "name x y width depth height" },
  light: { attrs: `${PIECE_ATTRS} horizontallyRotatable pitch roll widthInPlan depthInPlan heightInPlan power`, required: "name x y width depth height" },
  doorOrWindow: { attrs: `${PIECE_ATTRS} wallThickness wallDistance wallWidth wallLeft wallHeight wallTop wallCutOutOnBothSides widthDepthDeformable cutOutShape boundToWall`, required: "name x y width depth height" },
  lightSource: { attrs: "x y z color diameter", required: "x y z color" },
  material: { attrs: "name key color shininess", required: "name" },
  wall: { attrs: "id level wallAtStart wallAtEnd xStart yStart xEnd yEnd height heightAtEnd thickness arcExtent pattern topColor leftSideColor leftSideShininess rightSideColor rightSideShininess", required: "id xStart yStart xEnd yEnd thickness" },
  texture: { attrs: "attribute catalogId name width height xOffset yOffset angle scale creator fittingArea leftToRightOriented image", required: "name width height image" },
  room: { attrs: "id level name nameAngle nameXOffset nameYOffset areaVisible areaAngle areaXOffset areaYOffset floorVisible floorColor floorShininess ceilingVisible ceilingColor ceilingShininess ceilingFlat" },
  point: { attrs: "x y", required: "x y" },
  polyline: { attrs: "id level thickness capStyle joinStyle dashStyle dashPattern dashOffset startArrowStyle endArrowStyle elevation color closedPath" },
  dimensionLine: { attrs: "id level xStart yStart elevationStart xEnd yEnd elevationEnd offset endMarkSize angle color visibleIn3D", required: "xStart yStart xEnd yEnd offset" },
  label: { attrs: "id level x y angle elevation pitch color outlineColor", required: "x y" },
  textStyle: { attrs: "attribute fontName fontSize bold italic alignment", required: "fontSize" },
  text: { attrs: "" },
};
function checkDtd(el, ids = new Set(), refs = []) {
  const spec = DTD[el.name];
  assert.ok(spec, `element <${el.name}> is in the DTD`);
  const allowed = new Set(spec.attrs.split(/\s+/).filter(Boolean));
  for (const k of Object.keys(el.attrs)) assert.ok(allowed.has(k), `<${el.name} ${k}> is allowed`);
  for (const k of (spec.required || "").split(/\s+/).filter(Boolean)) assert.ok(k in el.attrs, `<${el.name}> has ${k}`);
  if (el.attrs.id) { assert.ok(!ids.has(el.attrs.id), `unique id ${el.attrs.id}`); ids.add(el.attrs.id); }
  for (const k of ["level", "wallAtStart", "wallAtEnd"]) if (el.attrs[k]) refs.push(el.attrs[k]);
  const kids = (el.children || []).filter((c) => c.name);
  if (spec.order) {
    let at = 0;
    for (const c of kids) {
      const i = spec.order.findIndex((o) => o.split("|").includes(c.name));
      assert.ok(i >= at, `<${c.name}> in DTD order inside <${el.name}>`);
      at = i;
    }
  }
  for (const c of kids) checkDtd(c, ids, refs);
  return { ids, refs };
}

function sampleProject() {
  const p = normalizeProject(newProject("Export test"));
  const l0 = p.levels[0];
  l0.height = 2700;
  const l1 = { id: "up", name: "2F", elevation: 2900, height: 2600, slab: 200 };
  p.levels.push(l1);
  const W = (id, x1, y1, x2, y2, extra = {}) => ({ id, level: l0.id, x1, y1, x2, y2, thickness: 200, height: null, ...extra });
  p.walls.push(W("a", 0, 0, 6000, 0, { material: "brick" }), W("b", 6000, 0, 6000, 4000), W("c", 6000, 4000, 0, 4000), W("d", 0, 4000, 0, 0, { material: "#123456" }));
  p.walls.push({ id: "u", level: "up", x1: 0, y1: 0, x2: 6000, y2: 0, thickness: 150, height: 2400 });
  p.openings.push({ id: "o1", wall: "a", kind: "window", type: "casement", at: 3000, width: 1200, height: 1200, sill: 900, side: 1 });
  p.openings.push({ id: "o2", wall: "c", kind: "door", type: "double", at: 2000, width: 1400, height: 2100, sill: 0, side: -1, hinge: "end" });
  p.rooms.push({ id: "r", level: l0.id, name: "Living", pts: [[100, 100], [5900, 100], [5900, 3900], [100, 3900]], floor: "walnut" });
  p.furniture.push({ id: "f1", level: l0.id, kind: "sofa3", name: "Sofa", x: 3000, y: 2000, rot: 90, w: 2100, d: 900, h: 800, elevation: 0 });
  p.furniture.push({ id: "f2", level: l0.id, kind: "chair", x: 1000, y: 1000, rot: 0, w: 450, d: 500, h: 900, elevation: 0 });
  p.stairs.push({ id: "s", level: l0.id, x: 5000, y: 3000, rot: 0, length: 3000, width: 1000, steps: 16 });
  p.roofs.push({ id: "rf", level: "up", kind: "gable", pitch: 30, overhang: 300, thickness: 200, pts: [[0, 0], [6000, 0], [6000, 4000], [0, 4000]] });
  p.dimensions.push({ id: "k", level: l0.id, x1: 0, y1: -600, x2: 6000, y2: -600, offset: 200 });
  p.texts.push({ id: "t", level: l0.id, x: 3000, y: 2000, text: "Séjour & <cuisine>", size: 300, rot: 0 });
  p.drawings.push({ id: "g", level: l0.id, layer: "0", kind: "polyline", pts: [[0, 5000], [3000, 5500], [6000, 5000]], color: "#ff0000" });
  p.meta.north = 30;
  return normalizeProject(p);
}

describe("Sweet Home 3D export (.sh3d)", async () => {
  const p = sampleProject();
  const res = await quiet(exportSh3d)(p, { name: "Export test" });
  const entries = zipEntries(res.bytes);
  const xml = new TextDecoder().decode(await zipEntryData(res.bytes, entries.find((e) => e.name === "Home.xml")));
  const home = parseXml(xml).children.find((c) => c.name === "home");

  test("a ZIP with Home.xml and an OBJ model folder per shape", async () => {
    assert.equal(entries[0].name, "Home.xml");
    assert.ok(!entries.some((e) => e.name === "Home"), "Sweet Home 3D 5.3+ reads Home.xml alone");
    const objs = entries.filter((e) => /\/model\.obj$/.test(e.name));
    assert.equal(objs.length, res.stats.models);
    for (const e of objs) {
      const text = new TextDecoder().decode(await zipEntryData(res.bytes, e));
      assert.match(text, /^mtllib model\.mtl$/m);
      assert.ok(entries.some((x) => x.name === e.name.replace(/obj$/, "mtl")));
      assert.match(text, /^f \d/m);
    }
    assert.deepEqual([res.stats.walls, res.stats.rooms, res.stats.doorsWindows, res.stats.levels], [5, 1, 2, 2]);
  });

  test("Home.xml follows the DTD: element order, attribute lists, required attributes, ids", () => {
    const { ids, refs } = checkDtd(home);
    for (const r of refs) assert.ok(ids.has(r), `reference ${r} resolves`);
    const pieces = home.children.filter((c) => ["pieceOfFurniture", "doorOrWindow", "light"].includes(c.name));
    for (const pc of pieces) assert.ok(entries.some((e) => e.name === pc.attrs.model), `model ${pc.attrs.model} is in the archive`);
  });

  test("units and angles: centimetres and radians; walls joined at their corners", () => {
    const walls = home.children.filter((c) => c.name === "wall");
    const a = walls[0];
    assert.deepEqual([a.attrs.xEnd, a.attrs.thickness, a.attrs.height, a.attrs.leftSideColor, a.attrs.wallAtEnd, a.attrs.wallAtStart], ["600", "20", "270", "FFA65A42", walls[1].attrs.id, walls[3].attrs.id]);
    assert.equal(walls[3].attrs.leftSideColor, "FF123456");
    const sofa = home.children.find((c) => c.attrs && c.attrs.name === "Sofa");
    near(+sofa.attrs.angle, Math.PI / 2, 1e-6);
    near(+home.children.find((c) => c.name === "compass").attrs.northDirection, Math.PI / 6, 1e-6);
  });

  test("re-imported, the home comes back", quiet(async () => {
    const back = (await importSh3d(res.bytes, { name: "x.sh3d", models: "catalog", ...opts })).project;
    assert.equal(back.levels.length, 2);
    assert.deepEqual(back.levels.map((l) => [l.elevation, l.slab]), [[0, 200], [2900, 200]]);
    assert.equal(back.walls.length, 5);
    assert.deepEqual(back.walls.find((w) => w.y1 === 0 && w.y2 === 0 && w.level === back.levels[0].id).material, "#a65a42");
    assert.equal(back.openings.length, 2);
    const win = back.openings.find((o) => o.kind === "window"), door = back.openings.find((o) => o.kind === "door");
    assert.deepEqual([win.at, win.width, win.height, win.sill, win.side], [3000, 1200, 1200, 900, 1]);
    assert.deepEqual([door.type, door.width, door.side, door.hinge], ["double", 1400, -1, "end"]);
    assert.equal(back.rooms[0].name, "Living");
    assert.equal(back.rooms[0].floor, "walnut");
    const sofa = back.furniture.find((f) => f.name === "Sofa");
    assert.deepEqual([sofa.kind, sofa.x, sofa.y, sofa.rot, sofa.w, sofa.d, sofa.h], ["sofa3", 3000, 2000, 90, 2100, 900, 800]);
    assert.equal(back.stairs.length, 1);
    assert.deepEqual([back.stairs[0].x, back.stairs[0].rot, back.stairs[0].length, back.stairs[0].width], [5000, 0, 3000, 1000]);
    assert.equal(back.roofs.length, 1, "the roof comes back as a roof of ours (catalog shapes)");
    assert.deepEqual(back.dimensions.map((d) => [d.x1, d.y1, d.x2, d.offset]), [[0, -600, 6000, 200]]);
    assert.equal(back.texts[0].text, "Séjour & <cuisine>");
    assert.deepEqual(back.drawings[0].pts, [[0, 5000], [3000, 5500], [6000, 5000]]);
    near(back.meta.north, 30, 0.01);
    // With the file's models, every exported piece is model furniture.
    const withModels = (await importSh3d(res.bytes, { name: "x.sh3d", ...opts })).project;
    assert.equal(withModels.furniture.filter((f) => f.kind === "model").length, 4, "sofa, chair, stair and roof as models");
  }));

  test("model furniture is written from its GLB: geometry, colours and textures", async () => {
    const glb = tinyGlb();
    const meshes = glbMeshes(glb);
    assert.equal(meshes.length, 1);
    const m = meshes[0];
    near(m.positions[0], 100 + 0, 1e-4, "node translation 1 m → 100 cm");
    assert.deepEqual(Array.from(m.index), [0, 1, 2]);
    near(m.material.color[0], 1, 1e-6);
    near(m.uvs[1], 1, 1e-6, "glTF v=0 is OBJ v=1");
    assert.deepEqual(Array.from(m.material.image.bytes.slice(0, 4)), [0x89, 0x50, 0x4e, 0x47]);
    const { obj, mtl, images } = meshesToObj(meshes, { name: "m" });
    assert.match(obj, /^vt 0 1$/m);
    assert.match(mtl, /^map_Kd texture0\.png$/m);
    assert.equal(images.length, 1);
    const q = sampleProject();
    const { bytesToBase64 } = await import("../../src/io/models3d.js");
    q.models.push({ id: "m1", name: "Thing", format: "glb", size: [1000, 1000, 1000], outline: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5]], data: bytesToBase64(glb) });
    q.furniture.push({ id: "fm", level: q.levels[0].id, kind: "model", model: "m1", name: "Thing", x: 500, y: 500, rot: 0, w: 1000, d: 1000, h: 1000, elevation: 0, mirrored: true, modelColors: { mat: "#00ff00" } });
    const r = await quiet(exportSh3d)(q);
    const es = zipEntries(r.bytes);
    assert.ok(es.some((e) => /\/texture0\.png$/.test(e.name)));
    const x = new TextDecoder().decode(await zipEntryData(r.bytes, es[0]));
    assert.match(x, /<pieceOfFurniture [^>]*name='Thing'[^>]*modelMirrored='true'[^>]*>\s*<material name='mat' color='FF00FF00'\/>/);
  });
});

// One textured triangle in a GLB, as GLTFExporter lays it out.
function tinyGlb() {
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const uv = new Float32Array([0, 0, 1, 0, 0, 1]);
  const idx = new Uint16Array([0, 1, 2, 0]);
  const img = PNG;
  const parts = [pos, uv, idx, img].map((a) => new Uint8Array(a.buffer ? a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) : a));
  const views = [];
  let off = 0;
  for (const b of parts) { views.push({ buffer: 0, byteOffset: off, byteLength: b.length }); off += Math.ceil(b.length / 4) * 4; }
  const bin = new Uint8Array(off);
  let o = 0;
  for (const b of parts) { bin.set(b, o); o += Math.ceil(b.length / 4) * 4; }
  const json = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, translation: [1, 0, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    materials: [{ name: "mat", pbrMetallicRoughness: { baseColorFactor: [1, 0.5, 0.25, 1], baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }], images: [{ bufferView: 3, mimeType: "image/png" }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }, { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" }, { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" }],
    bufferViews: views, buffers: [{ byteLength: off }],
  };
  let jb = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - (jb.length % 4)) % 4;
  jb = new Uint8Array([...jb, ...new Array(pad).fill(0x20)]);
  const out = new Uint8Array(12 + 8 + jb.length + 8 + bin.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true);
  dv.setUint32(12, jb.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(jb, 20);
  dv.setUint32(20 + jb.length, bin.length, true); dv.setUint32(24 + jb.length, 0x004e4942, true); out.set(bin, 28 + jb.length);
  return out;
}

// ================================================================ real files (optional)
const corpus = process.env.SH3D_CORPUS;
describe("real Sweet Home 3D files (SH3D_CORPUS)", { skip: !corpus || !fs.existsSync(corpus) }, () => {
  const files = corpus && fs.existsSync(corpus) ? fs.readdirSync(corpus).filter((f) => /\.sh3d$/i.test(f)) : [];
  for (const f of files) {
    test(f, quiet(async () => {
      const bytes = new Uint8Array(fs.readFileSync(path.join(corpus, f)));
      const r = await importSh3d(bytes, { name: f, ...opts });
      assert.ok(r.project.walls.length > 0 && r.project.furniture.length > 0);
      assert.ok(r.project.furniture.some((x) => x.kind === "model"));
      const e = await exportSh3d(r.project, { name: f });
      const back = await importSh3d(e.bytes, { name: f, models: "catalog", ...opts });
      assert.equal(back.project.walls.length, r.project.walls.length);
    }));
  }
});
