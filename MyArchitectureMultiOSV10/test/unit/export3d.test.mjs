// 3D exchange: OBJ/MTL, COLLADA and 3MF writers on a small baked scene, and
// model import (OBJ, STL ASCII/binary, PLY, glTF/GLB) with unit and up-axis
// normalisation. Runs in plain Node; the read-backs through three's
// ColladaLoader / ThreeMFLoader use @xmldom/xmldom when it is installed.

import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../src/vendor/three/three.module.js";
import { exportObjMtl } from "../../src/io/objmtl.js";
import { exportCollada, escapeXml } from "../../src/io/collada.js";
import { export3MF } from "../../src/io/threemf.js";
import { readZip } from "../../src/io/zip.js";
import { loadModelFile, bytesToBase64, base64ToBytes, MODEL_FORMATS, collectMeshes } from "../../src/io/models3d.js";

const near = (a, b, eps = 1e-4) => Math.abs(a - b) <= eps;
const enc = new TextEncoder();
const dec = new TextDecoder();

// Like viewer.exportRoot(): a group of meshes with world transforms.
// Box 1 × 2 × 3 m turned 90° about X → 1 (X) × 3 (Y, height) × 2 (Z), standing on Y = 0.
function makeScene() {
  const root = new THREE.Group();
  root.name = "Test house";
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3), new THREE.MeshStandardMaterial({ color: 0xff0000, name: "red brick", roughness: 0.7 }));
  box.name = "box";
  box.position.set(5, 1.5, 0);
  box.rotation.x = Math.PI / 2;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial({ color: 0x88aacc, name: "glass", transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
  glass.name = "glass pane";
  glass.position.set(0, 1, 3);
  root.add(box, glass);
  root.updateMatrixWorld(true);
  return root;
}
const BOX_MIN = [4.5, 0, -1], BOX_MAX = [5.5, 3, 1];
const ALL_MIN = [-1, 0, -1], ALL_MAX = [5.5, 3, 3];

function bboxOf(points) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  return { min, max };
}
function assertBox(b, min, max, eps = 1e-4) {
  for (let k = 0; k < 3; k++) {
    assert.ok(near(b.min[k], min[k], eps), `min[${k}] ${b.min[k]} ≠ ${min[k]}`);
    assert.ok(near(b.max[k], max[k], eps), `max[${k}] ${b.max[k]} ≠ ${max[k]}`);
  }
}

// Minimal XML well-formedness: balanced tags, quoted attributes, legal entities.
function checkXml(xml) {
  const body = xml.replace(/^<\?xml[^?]*\?>/, "").replace(/<!--[\s\S]*?-->/g, "");
  const stack = [];
  const tagRe = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/g;
  let last = 0, m, roots = 0;
  while ((m = tagRe.exec(body))) {
    const text = body.slice(last, m.index);
    assert.ok(!/[<>]/.test(text), `stray markup near ${JSON.stringify(text.slice(0, 40))}`);
    assert.ok(!/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(text + m[3]), "bad entity");
    last = tagRe.lastIndex;
    const [, close, name, , self] = m;
    if (close) assert.equal(stack.pop(), name, `mismatched </${name}>`);
    else if (!self) { if (!stack.length) roots++; stack.push(name); }
    else if (!stack.length) roots++;
  }
  assert.equal(body.slice(last).trim(), "", "trailing content");
  assert.equal(stack.length, 0, `unclosed: ${stack.join(", ")}`);
  assert.equal(roots, 1, "exactly one root element");
}

// Optional real DOMParser (xmldom ships with electron-builder) to run three's
// own ColladaLoader / ThreeMFLoader / AMFLoader on the output. xmldom has no
// selectors, so tag and descendant selectors ("vertices vertex") and
// .children are added — all ThreeMFLoader asks for.
async function domParser() {
  if (globalThis.DOMParser) return globalThis.DOMParser;
  let DOMParser;
  try {
    ({ DOMParser } = await import("@xmldom/xmldom"));
  } catch {
    return null;
  }
  const doc = new DOMParser().parseFromString("<a><b/></a>", "application/xml");
  const nameOf = (n) => n.localName || n.nodeName;
  function queryAll(sel) {
    const parts = sel.trim().split(/\s+/);
    const out = [];
    const walk = (node) => {
      for (let c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType !== 1) continue;
        if (nameOf(c) === parts[parts.length - 1]) {
          let k = parts.length - 2;
          for (let a = c.parentNode; a && k >= 0; a = a.parentNode) if (a.nodeType === 1 && nameOf(a) === parts[k]) k--;
          if (k < 0) out.push(c);
        }
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  for (const proto of [Object.getPrototypeOf(doc), Object.getPrototypeOf(doc.documentElement)]) {
    if (!proto.querySelectorAll) proto.querySelectorAll = queryAll;
    if (!proto.querySelector) proto.querySelector = function (sel) { return queryAll.call(this, sel)[0] || null; };
  }
  const elProto = Object.getPrototypeOf(doc.documentElement);
  if (!("children" in elProto)) {
    Object.defineProperty(elProto, "children", { get() { return Array.from(this.childNodes).filter((n) => n.nodeType === 1); } });
  }
  return DOMParser;
}

async function withDom(fn) {
  const DOMParser = await domParser();
  if (!DOMParser) return false;
  const prev = globalThis.DOMParser;
  globalThis.DOMParser = DOMParser;
  try {
    await fn();
  } finally {
    globalThis.DOMParser = prev;
  }
  return true;
}

// GLTFExporter needs FileReader and FileLoader (data: URIs in .gltf) needs
// ProgressEvent; Node has Blob, fetch and Event but neither of these.
function installFileReader() {
  if (!globalThis.ProgressEvent) {
    globalThis.ProgressEvent = class extends Event {
      constructor(type, init = {}) {
        super(type);
        this.lengthComputable = !!init.lengthComputable;
        this.loaded = init.loaded || 0;
        this.total = init.total || 0;
      }
    };
  }
  if (globalThis.FileReader) return;
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((b) => { this.result = b; if (this.onloadend) this.onloadend(); });
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((b) => {
        this.result = `data:${blob.type || "application/octet-stream"};base64,${bytesToBase64(new Uint8Array(b))}`;
        if (this.onloadend) this.onloadend();
      });
    }
  };
}

// ---------------------------------------------------------------- OBJ / MTL
test("OBJ/MTL: counts, world positions, materials", () => {
  const { obj, mtl } = exportObjMtl(makeScene(), { name: "house" });
  const lines = obj.split("\n");
  const v = lines.filter((l) => l.startsWith("v ")).map((l) => l.split(/\s+/).slice(1).map(Number));
  const vn = lines.filter((l) => l.startsWith("vn "));
  const vt = lines.filter((l) => l.startsWith("vt "));
  const f = lines.filter((l) => l.startsWith("f "));
  assert.equal(v.length, 24 + 4);
  assert.equal(vn.length, 28);
  assert.equal(vt.length, 28);
  assert.equal(f.length, 12 + 2);
  assert.ok(lines.includes("mtllib house.mtl"));
  assert.equal(lines.filter((l) => l.startsWith("o ")).length, 2);
  assert.ok(lines.includes("o box") && lines.includes("g glass_pane"));
  assertBox(bboxOf(v.slice(0, 24)), BOX_MIN, BOX_MAX);
  assertBox(bboxOf(v), ALL_MIN, ALL_MAX);

  // Every face index refers to an existing v/vt/vn.
  for (const l of f) {
    for (const ref of l.split(/\s+/).slice(1)) {
      const [a, b, c] = ref.split("/").map(Number);
      assert.ok(a >= 1 && a <= 28 && b >= 1 && b <= 28 && c >= 1 && c <= 28, ref);
    }
  }
  // Box faces point outward: the face normal agrees with the written vn.
  for (const l of f.slice(0, 12)) {
    const idx = l.split(/\s+/).slice(1).map((r) => +r.split("/")[0] - 1);
    const [a, b, c] = idx.map((i) => new THREE.Vector3(...v[i]));
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const centre = new THREE.Vector3(5, 1.5, 0);
    assert.ok(n.dot(a.clone().sub(centre)) > 0, "outward winding");
  }

  const used = lines.filter((l) => l.startsWith("usemtl ")).map((l) => l.slice(7));
  const defined = mtl.split("\n").filter((l) => l.startsWith("newmtl ")).map((l) => l.slice(7));
  assert.deepEqual(used, ["red_brick", "glass"]);
  assert.deepEqual(defined.sort(), [...used].sort());
  const block = (name) => mtl.split(/\n(?=newmtl )/).find((b) => b.startsWith(`newmtl ${name}\n`));
  assert.match(block("red_brick"), /^Kd 1\.000000 0\.000000 0\.000000$/m);
  assert.match(block("red_brick"), /^d 1$/m);
  assert.match(block("red_brick"), /^illum 2$/m);
  assert.match(block("glass"), /^d 0\.3$/m);
  assert.match(block("glass"), /^Tr 0\.7$/m);
  assert.match(block("glass"), /^Ns \d/m);
});

test("OBJ: scale 1000 writes millimetres", () => {
  const { obj } = exportObjMtl(makeScene(), { scale: 1000 });
  const v = obj.split("\n").filter((l) => l.startsWith("v ")).map((l) => l.split(/\s+/).slice(1).map(Number));
  assertBox(bboxOf(v), ALL_MIN.map((x) => x * 1000), ALL_MAX.map((x) => x * 1000), 0.01);
  assert.match(obj, /^mtllib model\.mtl$/m);
});

test("OBJ: non-indexed geometry and mirrored transforms", () => {
  const root = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), new THREE.MeshStandardMaterial());
  m.scale.set(-1, 1, 1);
  root.add(m);
  const meshes = collectMeshes(root);
  assert.equal(meshes.length, 1);
  assert.equal(meshes[0].index.length, 36);
  // Signed volume stays positive although the mirror flips handedness.
  const p = meshes[0].positions, ix = meshes[0].index;
  let vol = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const a = new THREE.Vector3().fromArray(p, ix[t] * 3), b = new THREE.Vector3().fromArray(p, ix[t + 1] * 3), c = new THREE.Vector3().fromArray(p, ix[t + 2] * 3);
    vol += a.dot(b.clone().cross(c)) / 6;
  }
  assert.ok(near(vol, 1), `volume ${vol}`);
  const { obj } = exportObjMtl(root);
  assert.equal(obj.split("\n").filter((l) => l.startsWith("f ")).length, 12);
});

// ---------------------------------------------------------------- COLLADA
test("COLLADA: well-formed 1.4.1 with geometry, materials and world positions", () => {
  const dae = exportCollada(makeScene(), { title: "Haus & <Garten>", author: "Tester \"Q\"" });
  checkXml(dae);
  assert.match(dae, /<COLLADA xmlns="http:\/\/www\.collada\.org\/2005\/11\/COLLADASchema" version="1\.4\.1">/);
  assert.match(dae, /<up_axis>Y_UP<\/up_axis>/);
  assert.match(dae, /<unit name="meter" meter="1"\/>/);
  assert.match(dae, /<title>Haus &amp; &lt;Garten&gt;<\/title>/);
  assert.match(dae, /<author>Tester &quot;Q&quot;<\/author>/);
  assert.match(dae, /<created>\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ<\/created>/);
  assert.equal((dae.match(/<geometry /g) || []).length, 2);
  assert.equal((dae.match(/<material /g) || []).length, 2);
  assert.equal((dae.match(/<effect /g) || []).length, 2);
  assert.equal((dae.match(/<instance_geometry /g) || []).length, 2);
  assert.equal((dae.match(/<instance_material /g) || []).length, 2);
  assert.match(dae, /<transparency><float sid="transparency">0\.3<\/float><\/transparency>/);
  assert.match(dae, /<diffuse><color sid="diffuse">1 0 0 1<\/color><\/diffuse>/);

  // float_array counts match their content; accessors match the arrays.
  for (const [, count, body] of dae.matchAll(/<float_array id="[^"]+" count="(\d+)">([^<]*)<\/float_array>/g)) {
    assert.equal(body.trim().split(/\s+/).length, +count);
  }
  // <p> lengths: triangles × 3 × inputs.
  for (const [, count, inner] of dae.matchAll(/<triangles material="[^"]+" count="(\d+)">([\s\S]*?)<\/triangles>/g)) {
    const inputs = (inner.match(/<input /g) || []).length;
    const p = /<p>([^<]*)<\/p>/.exec(inner)[1].trim().split(/\s+/);
    assert.equal(p.length, +count * 3 * inputs);
  }
  const posArrays = [...dae.matchAll(/<float_array id="geometry-\d+-positions-array" count="\d+">([^<]*)<\/float_array>/g)].map((m) => m[1].trim().split(/\s+/).map(Number));
  assert.equal(posArrays.length, 2);
  const pts = (arr) => Array.from({ length: arr.length / 3 }, (_, i) => arr.slice(i * 3, i * 3 + 3));
  assertBox(bboxOf(pts(posArrays[0])), BOX_MIN, BOX_MAX);
  assertBox(bboxOf(posArrays.flatMap(pts)), ALL_MIN, ALL_MAX);

});

test("COLLADA: three's ColladaLoader reads the export back (needs xmldom)", async (t) => {
  const ran = await withDom(async () => {
    const { ColladaLoader } = await import("../../src/vendor/three/addons/ColladaLoader.js");
    const res = new ColladaLoader().parse(exportCollada(makeScene(), { title: "x" }), "");
    const box = new THREE.Box3().setFromObject(res.scene);
    assertBox({ min: box.min.toArray(), max: box.max.toArray() }, ALL_MIN, ALL_MAX);
    const mats = [];
    res.scene.traverse((o) => { if (o.isMesh) mats.push(...[o.material].flat()); });
    const glass = mats.find((m) => m.name === "glass");
    const red = mats.find((m) => m.name === "red_brick");
    assert.ok(glass && near(glass.opacity, 0.3) && glass.transparent);
    assert.equal(red.color.getHexString(THREE.SRGBColorSpace), "ff0000");
    // Millimetre export declares its unit, so the import is still 6.5 × 4 × 3 m.
    const r = await loadModelFile({ name: "house.dae", bytes: enc.encode(exportCollada(makeScene(), { scale: 1000 })) }, { glb: false });
    assert.equal(r.units, "mm");
    assert.deepEqual(r.size, [6500, 4000, 3000]);
  });
  if (!ran) t.skip("no DOMParser available");
});

test("COLLADA: scale declares the matching unit", () => {
  const dae = exportCollada(makeScene(), { scale: 1000 });
  assert.match(dae, /<unit name="millimeter" meter="0\.001"\/>/);
  assert.equal(escapeXml("a<b>&'\"\u0001"), "a&lt;b&gt;&amp;&apos;&quot;");
});

// ---------------------------------------------------------------- 3MF
function parse3mfModel(xml) {
  const objects = [];
  for (const [, attrs, body] of xml.matchAll(/<object ([^>]*)>([\s\S]*?)<\/object>/g)) {
    const verts = [...body.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)].map((m) => [+m[1], +m[2], +m[3]]);
    const tris = [...body.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)].map((m) => [+m[1], +m[2], +m[3]]);
    objects.push({ attrs, verts, tris });
  }
  return objects;
}
function signedVolume({ verts, tris }) {
  let vol = 0;
  for (const [a, b, c] of tris) {
    const [ax, ay, az] = verts[a], [bx, by, bz] = verts[b], [cx, cy, cz] = verts[c];
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return vol;
}

test("3MF: package parts, millimetres, Z up, merged vertices, outward triangles", () => {
  const zip = export3MF(makeScene(), { title: "Test & house" });
  const files = readZip(zip);
  assert.deepEqual(files.map((f) => f.name).sort(), ["3D/3dmodel.model", "[Content_Types].xml", "_rels/.rels"]);
  for (const f of files) checkXml(dec.decode(f.data));
  const rels = dec.decode(files.find((f) => f.name === "_rels/.rels").data);
  assert.match(rels, /Target="\/3D\/3dmodel\.model"/);
  const xml = dec.decode(files.find((f) => f.name === "3D/3dmodel.model").data);
  assert.match(xml, /<model unit="millimeter"/);
  assert.match(xml, /<metadata name="Title">Test &amp; house<\/metadata>/);
  assert.match(xml, /<metadata name="Application">MyArchitecture<\/metadata>/);
  assert.match(xml, /<base name="red_brick" displaycolor="#FF0000FF"\/>/);
  assert.match(xml, /<base name="glass" displaycolor="#[0-9A-F]{6}4D"\/>/);
  assert.equal((xml.match(/<item objectid=/g) || []).length, 2);

  const [box, glass] = parse3mfModel(xml);
  assert.equal(box.verts.length, 8);
  assert.equal(box.tris.length, 12);
  assert.equal(glass.verts.length, 4);
  assert.equal(glass.tris.length, 2);
  // (x, y, z)3mf = (X, −Z, Y) × 1000: the 3 m height runs along z.
  assertBox(bboxOf(box.verts), [4500, -1000, 0], [5500, 1000, 3000], 1e-6);
  assertBox(bboxOf(glass.verts), [-1000, -3000, 0], [1000, -3000, 2000], 1e-6);
  const vol = signedVolume(box);
  assert.ok(near(vol, 1000 * 3000 * 2000, 1), `signed volume ${vol}`);
});

test("3MF: three's ThreeMFLoader reads the export back; import restores Y-up metres (needs xmldom)", async (t) => {
  const ran = await withDom(async () => {
    const zip = export3MF(makeScene());
    const { ThreeMFLoader } = await import("../../src/vendor/three/addons/3MFLoader.js");
    const group = new ThreeMFLoader().parse(zip.slice().buffer);
    const b = new THREE.Box3().setFromObject(group);
    assertBox({ min: b.min.toArray(), max: b.max.toArray() }, [-1000, -3000, 0], [5500, 1000, 3000], 1e-3);
    const r = await loadModelFile({ name: "house.3mf", bytes: zip }, { glb: false });
    assert.equal(r.units, "mm");
    assert.deepEqual(r.size, [6500, 4000, 3000]);
    // The glass pane (plan y = 3 m, the largest Z) ends up at +Z again.
    let glassZ = null;
    r.object.traverse((o) => { if (o.isMesh && /glass/.test(o.name)) { o.geometry.computeBoundingBox(); glassZ = o.geometry.boundingBox.max.z; } });
    assert.ok(near(glassZ, 2), `glass at z ${glassZ}`);
  });
  if (!ran) t.skip("no DOMParser available");
});

test("3MF: mirrored mesh stays outward, other units", () => {
  const root = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial());
  m.scale.set(1, 1, -1);
  root.add(m);
  const xml = dec.decode(readZip(export3MF(root, { unit: "meter" })).find((f) => f.name === "3D/3dmodel.model").data);
  assert.match(xml, /unit="meter"/);
  const [obj] = parse3mfModel(xml);
  assert.ok(near(signedVolume(obj), 2, 1e-6));
  assert.throws(() => export3MF(new THREE.Group()), /no surfaces/);
});

// ---------------------------------------------------------------- import
const CUBE_OBJ_CM = `# 100 cm cube, corner at the origin
mtllib cube.mtl
o cube
v 0 0 0
v 100 0 0
v 100 100 0
v 0 100 0
v 0 0 100
v 100 0 100
v 100 100 100
v 0 100 100
usemtl wood
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`;
const CUBE_MTL = "newmtl wood\nKd 0.6 0.4 0.2\nNs 50\nd 1\n";
const file = (name, text) => ({ name, bytes: enc.encode(text) });

test("import OBJ: centimetres guessed, normalised, outline, MTL applied", async () => {
  const r = await loadModelFile(file("Chair.obj", CUBE_OBJ_CM), { glb: false, mtlText: CUBE_MTL });
  assert.equal(r.format, "obj");
  assert.equal(r.name, "Chair");
  assert.equal(r.units, "cm");
  assert.equal(r.data, null);
  assert.deepEqual(r.size, [1000, 1000, 1000]);
  const box = new THREE.Box3().setFromObject(r.object);
  assert.ok(near(box.min.y, 0) && near(box.max.y, 1));
  assert.ok(near(box.min.x, -0.5) && near(box.max.x, 0.5) && near(box.min.z, -0.5) && near(box.max.z, 0.5));
  const sorted = r.outline.map(([x, y]) => `${x},${y}`).sort();
  assert.deepEqual(sorted, ["-0.5,-0.5", "-0.5,0.5", "0.5,-0.5", "0.5,0.5"]);
  // Phong from MTLLoader → MeshStandardMaterial, colour kept.
  let mat = null;
  r.object.traverse((o) => { if (o.isMesh) mat = o.material; });
  assert.ok(mat.isMeshStandardMaterial);
  assert.equal(mat.name, "wood");
  assert.equal(mat.color.getHexString(THREE.SRGBColorSpace), "996633");
  assert.ok(r.warnings.some((w) => /guessed as cm/.test(w)));
});

test("import OBJ: missing MTL warns, unit override, Z-up override", async () => {
  const r = await loadModelFile(file("box.obj", CUBE_OBJ_CM), { glb: false, units: "mm" });
  assert.equal(r.units, "mm");
  assert.deepEqual(r.size, [100, 100, 100]);
  assert.ok(r.warnings.some((w) => /cube\.mtl/.test(w)));
  const flat = CUBE_OBJ_CM.replace(/^v (\S+) (\S+) (\S+)$/gm, (_, x, y, z) => `v ${x} ${y * 2} ${z * 3}`); // 100 × 200 × 300
  const y = await loadModelFile(file("b.obj", flat), { glb: false, units: "cm" });
  assert.deepEqual(y.size, [1000, 3000, 2000]); // w (X), d (Z), h (Y)
  const z = await loadModelFile(file("b.obj", flat), { glb: false, units: "cm", upAxis: "z" });
  assert.deepEqual(z.size, [1000, 2000, 3000]); // file Z (300) becomes the height
});

const TETRA_STL = `solid tetra
facet normal 0 0 -1
 outer loop
  vertex 0 0 0
  vertex 0 1000 0
  vertex 1000 0 0
 endloop
endfacet
facet normal 0 -1 0
 outer loop
  vertex 0 0 0
  vertex 1000 0 0
  vertex 0 0 2000
 endloop
endfacet
facet normal -1 0 0
 outer loop
  vertex 0 0 0
  vertex 0 0 2000
  vertex 0 1000 0
 endloop
endfacet
facet normal 1 1 1
 outer loop
  vertex 1000 0 0
  vertex 0 1000 0
  vertex 0 0 2000
 endloop
endfacet
endsolid tetra
`;

test("import STL (ASCII): Z-up converted to Y-up, millimetres guessed", async () => {
  const r = await loadModelFile(file("tetra.stl", TETRA_STL), { glb: false });
  assert.equal(r.units, "mm");
  assert.deepEqual(r.size, [1000, 1000, 2000]);
  const box = new THREE.Box3().setFromObject(r.object);
  assert.ok(near(box.min.y, 0) && near(box.max.y, 2), "height along Y");
  assert.equal(r.outline.length, 3); // triangular footprint
  for (const [x, y] of r.outline) assert.ok(Math.abs(x) <= 0.5 && Math.abs(y) <= 0.5);
  // The apex of a Z-up file stands up; its footprint is the XY triangle with
  // file +Y mapped to −Z (north stays north).
  const ys = r.outline.map((p) => p[1]).sort((a, b) => a - b);
  assert.deepEqual(ys, [-0.5, 0.5, 0.5]);
});

function binaryStl(tris) {
  const buf = new ArrayBuffer(84 + tris.length * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, tris.length, true);
  tris.forEach((t, i) => {
    const o = 84 + i * 50;
    t.flat().forEach((v, k) => dv.setFloat32(o + 12 + k * 4, v, true));
  });
  return new Uint8Array(buf);
}

test("import STL (binary) and up-axis override", async () => {
  const tris = [
    [[0, 0, 0], [0, 1, 0], [1, 0, 0]],
    [[0, 0, 0], [1, 0, 0], [0, 0, 1.5]],
    [[0, 0, 0], [0, 0, 1.5], [0, 1, 0]],
    [[1, 0, 0], [0, 1, 0], [0, 0, 1.5]],
  ];
  const r = await loadModelFile({ name: "part.STL", bytes: binaryStl(tris) }, { glb: false });
  assert.equal(r.format, "stl");
  assert.equal(r.units, "m");
  assert.deepEqual(r.size, [1000, 1000, 1500]);
  const y = await loadModelFile({ name: "part.stl", bytes: binaryStl(tris) }, { glb: false, upAxis: "y", units: "m" });
  assert.deepEqual(y.size, [1000, 1500, 1000]);
  let mesh = null;
  r.object.traverse((o) => { if (o.isMesh) mesh = o; });
  assert.ok(mesh.geometry.attributes.normal);
  assert.ok(mesh.material.isMeshStandardMaterial);
});

test("import PLY (ASCII)", async () => {
  const ply = `ply
format ascii 1.0
element vertex 4
property float x
property float y
property float z
element face 2
property list uchar int vertex_indices
end_header
0 0 0
4 0 0
4 2 0
0 2 0
3 0 1 2
3 0 2 3
`;
  const r = await loadModelFile(file("floor.ply", ply), { glb: false, units: "m" });
  assert.equal(r.format, "ply");
  // Flat in the file's XY plane (Z-up) → lies on the ground: 4 m × 2 m, no height.
  assert.equal(r.size[0], 4000);
  assert.equal(r.size[1], 2000);
  assert.equal(r.size[2], 1);
  let normalY = 0;
  r.object.traverse((o) => { if (o.isMesh) normalY = o.geometry.attributes.normal.getY(0); });
  assert.ok(near(Math.abs(normalY), 1));
});

test("import VRML: backdrop dropped, Phong replaced, metres guessed", async () => {
  const wrl = `#VRML V2.0 utf8
Background { skyColor [0.2 0.3 0.8] }
Transform { translation 1 0 0 children [
  Shape {
    appearance Appearance { material Material { diffuseColor 0 0.5 1 transparency 0.25 } }
    geometry Box { size 0.8 1.6 0.4 }
  }
] }
`;
  const r = await loadModelFile(file("cabinet.wrl", wrl), { glb: false });
  assert.equal(r.units, "m");
  assert.deepEqual(r.size, [800, 400, 1600]);
  const mats = [];
  r.object.traverse((o) => { if (o.isMesh) mats.push(o.material); });
  assert.equal(mats.length, 1);
  assert.ok(mats[0].isMeshStandardMaterial && near(mats[0].opacity, 0.75) && mats[0].transparent);
});

test("import: errors", async () => {
  await assert.rejects(loadModelFile(file("model.xyz", "1 2 3"), { glb: false }), /Unsupported 3D model format "\.xyz"/);
  await assert.rejects(loadModelFile(file("noext", "1 2 3"), { glb: false }), /Unsupported/);
  await assert.rejects(loadModelFile(file("empty.obj", "# nothing\n"), { glb: false }), /no surfaces/);
  await assert.rejects(loadModelFile(file("lines.obj", "v 0 0 0\nv 1 0 0\nl 1 2\n"), { glb: false }), /no surfaces/);
  await assert.rejects(loadModelFile(file("a.obj", CUBE_OBJ_CM), { glb: false, units: "furlong" }), /Unknown unit/);
  await assert.rejects(loadModelFile({ name: "a.stl", bytes: new Uint8Array(0) }, { glb: false }), /empty/);
  await assert.rejects(loadModelFile(file("ext.gltf", JSON.stringify({ asset: { version: "2.0" }, buffers: [{ uri: "ext.bin", byteLength: 8 }] })), { glb: false }), /external buffers \(ext\.bin\)/);
  assert.deepEqual(MODEL_FORMATS.map((f) => f.ext), ["obj", "stl", "ply", "glb", "gltf", "fbx", "dae", "3mf", "3ds", "wrl", "amf"]);
});

test("import GLB / glTF round trip through GLTFExporter (glb: true)", async () => {
  installFileReader();
  const r = await loadModelFile(file("Chair.obj", CUBE_OBJ_CM), { mtlText: CUBE_MTL });
  assert.ok(typeof r.data === "string" && r.data.length > 100);
  const glbBytes = base64ToBytes(r.data);
  assert.equal(dec.decode(glbBytes.subarray(0, 4)), "glTF");
  // The stored asset reads back as metres (by spec) with the same size.
  const back = await loadModelFile({ name: "chair.glb", bytes: glbBytes }, { glb: false });
  assert.equal(back.units, "m");
  assert.deepEqual(back.size, [1000, 1000, 1000]);

  const { GLTFExporter } = await import("../../src/vendor/three/addons/GLTFExporter.js");
  const json = await new GLTFExporter().parseAsync(makeScene(), { binary: false });
  const g = await loadModelFile(file("house.gltf", JSON.stringify(json)), { glb: false });
  assert.deepEqual(g.size, [6500, 4000, 3000]);
  const box = new THREE.Box3().setFromObject(g.object);
  assert.ok(near(box.min.y, 0) && near(box.min.x + box.max.x, 0) && near(box.min.z + box.max.z, 0));
});

test("base64 helpers", () => {
  for (const n of [0, 1, 2, 3, 4, 5, 255, 70000]) {
    const bytes = new Uint8Array(n).map((_, i) => (i * 37 + 11) & 255);
    const b64 = bytesToBase64(bytes);
    assert.equal(b64, Buffer.from(bytes).toString("base64"));
    assert.deepEqual(base64ToBytes(b64), bytes);
  }
  assert.deepEqual(base64ToBytes("data:application/octet-stream;base64,AQID"), new Uint8Array([1, 2, 3]));
  assert.throws(() => base64ToBytes("**"), /invalid base64/);
});
