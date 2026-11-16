// Unit tests for the 3D formats added to the model importer and My library
// (src/io/models3d.js): OFF, VTK (legacy and XML), USD text / USDZ, KMZ and
// LightWave — small files made here are read through the real importer and come
// out at the right size; broken files give a clear message; every format is in
// the file dialogs and My library's list; a model's folder names its category.
// Run: node --test test/unit/modelformats.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../src/vendor/three/three.module.js";
import { loadModelFile, MODEL_FORMATS, parseOff } from "../../src/io/models3d.js";
import { exportCollada } from "../../src/io/collada.js";
import { zipSync, strToU8 } from "../../src/vendor/three/addons/libs/fflate.module.js";

const enc = (s) => new TextEncoder().encode(s);
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;

// A unit cube 2 × 1 × 3 (x, y up, z), as OFF.
const OFF_BOX = `OFF
# a box 2 m wide, 1 m high, 3 m deep
8 6 0
0 0 0  2 0 0  2 1 0  0 1 0
0 0 3  2 0 3  2 1 3  0 1 3
4 0 1 2 3
4 4 7 6 5
4 0 4 5 1
4 3 2 6 7
4 0 3 7 4
4 1 5 6 2
`;

const VTK_TRI = `# vtk DataFile Version 3.0
a triangle
ASCII
DATASET POLYDATA
POINTS 4 float
0 0 0  4 0 0  4 0 2  0 0 2
POLYGONS 2 8
3 0 1 2
3 0 2 3
`;

const USDA_BOX = `#usda 1.0
(
    metersPerUnit = 1
    upAxis = "Y"
)
def Xform "Root"
{
    def Mesh "Floor"
    {
        int[] faceVertexCounts = [4, 4]
        int[] faceVertexIndices = [0, 1, 2, 3, 4, 5, 6, 7]
        point3f[] points = [(0, 0, 0), (5, 0, 0), (5, 0, 4), (0, 0, 4), (0, 2, 0), (5, 2, 0), (5, 2, 4), (0, 2, 4)]
    }
}
`;

// An XML DOM for the COLLADA inside a KMZ (xmldom with the selectors three's loaders ask for).
async function withDom(fn) {
  if (globalThis.DOMParser) return fn();
  let DOMParser;
  try { ({ DOMParser } = await import("@xmldom/xmldom")); } catch { return false; }
  const doc = new DOMParser().parseFromString("<a><b/></a>", "application/xml");
  const nameOf = (n) => n.localName || n.nodeName;
  function queryAll(sel) {
    const parts = sel.trim().split(/\s+/); const out = [];
    const walk = (node) => { for (let c = node.firstChild; c; c = c.nextSibling) { if (c.nodeType !== 1) continue; if (nameOf(c) === parts[parts.length - 1]) { let k = parts.length - 2; for (let a = c.parentNode; a && k >= 0; a = a.parentNode) if (a.nodeType === 1 && nameOf(a) === parts[k]) k--; if (k < 0) out.push(c); } walk(c); } };
    walk(this); return out;
  }
  for (const proto of [Object.getPrototypeOf(doc), Object.getPrototypeOf(doc.documentElement)]) {
    if (!proto.querySelectorAll) proto.querySelectorAll = queryAll;
    if (!proto.querySelector) proto.querySelector = function (sel) { return queryAll.call(this, sel)[0] || null; };
  }
  const elProto = Object.getPrototypeOf(doc.documentElement);
  if (!("children" in elProto)) Object.defineProperty(elProto, "children", { get() { return Array.from(this.childNodes).filter((n) => n.nodeType === 1); } });
  globalThis.DOMParser = DOMParser;
  try { await fn(); } finally { delete globalThis.DOMParser; }
  return true;
}

describe("more 3D formats", () => {
  test("the new formats are listed (file dialogs and My library use this list)", () => {
    const exts = MODEL_FORMATS.map((f) => f.ext);
    for (const e of ["usdz", "usd", "usda", "usdc", "kmz", "lwo", "vtk", "vtp", "off", "obj", "glb", "fbx", "dae", "3dm"]) assert.ok(exts.includes(e), e);
    assert.equal(new Set(exts).size, exts.length);
    assert.ok(MODEL_FORMATS.length >= 21);
  });

  test("OFF: a box comes in at its size (m → mm), quads fanned into triangles", async () => {
    const geo = parseOff(OFF_BOX);
    assert.equal(geo.index.count, 6 * 2 * 3);
    const res = await loadModelFile({ name: "box.off", bytes: enc(OFF_BOX) }, { units: "m", glb: false });
    assert.ok(near(res.size[0], 2000) && near(res.size[1], 3000) && near(res.size[2], 1000), `size ${res.size}`);
    await assert.rejects(loadModelFile({ name: "bad.off", bytes: enc("PLY\n1 2 3") }, { glb: false }), /OFF/);
  });

  test("VTK legacy poly data: polygons in, size right; a points-only file is refused", async () => {
    const res = await loadModelFile({ name: "t.vtk", bytes: enc(VTK_TRI) }, { units: "m", glb: false });
    assert.ok(near(res.size[0], 4000) && near(res.size[1], 2000), `size ${res.size}`);
    const points = VTK_TRI.replace(/POLYGONS[\s\S]*$/, "");
    await assert.rejects(loadModelFile({ name: "p.vtk", bytes: enc(points) }, { units: "m", glb: false }));
  });

  test("USD text and USDZ: the mesh at its size, the stage's metres per unit", async () => {
    const usda = await loadModelFile({ name: "room.usda", bytes: enc(USDA_BOX) }, { units: "auto", glb: false });
    assert.ok(near(usda.size[0], 5000, 5) && near(usda.size[1], 4000, 5) && near(usda.size[2], 2000, 5), `usda size ${usda.size}`);
    const usdz = zipSync({ "room.usda": strToU8(USDA_BOX) }, { level: 0 });
    const z = await loadModelFile({ name: "room.usdz", bytes: usdz }, { units: "auto", glb: false });
    assert.ok(near(z.size[0], 5000, 5) && near(z.size[1], 4000, 5), `usdz size ${z.size}`);
    await assert.rejects(loadModelFile({ name: "x.usda", bytes: enc("#usda 1.0\n") }), /no meshes|could not/i);
  });

  test("KMZ: the COLLADA model inside a zip (as SketchUp's 3D Warehouse gives it)", async () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.6), new THREE.MeshStandardMaterial({ color: 0x884422 }));
    box.position.y = 0.4;
    const root = new THREE.Group(); root.add(box);
    const dae = exportCollada(root, { title: "Cabinet" });
    const kmz = zipSync({ "doc.kml": strToU8("<kml/>"), "models/cabinet.dae": strToU8(dae) });
    const ran = await withDom(async () => {
      const res = await loadModelFile({ name: "cabinet.kmz", bytes: kmz }, { units: "m", glb: false });
      const s = [...res.size].sort((a, b) => a - b);
      assert.ok(near(s[0], 600, 5) && near(s[1], 800, 5) && near(s[2], 1500, 5), `kmz size ${res.size}`);
    });
    assert.notEqual(ran, false, "an XML parser is installed (@xmldom/xmldom)");
    await assert.rejects(loadModelFile({ name: "e.kmz", bytes: zipSync({ "doc.kml": strToU8("<kml/>") }) }), /COLLADA/);
    await assert.rejects(loadModelFile({ name: "z.kmz", bytes: enc("not a zip") }), /zip/);
  });

  test("LightWave: the loader is there; a broken file gives a message, not a crash", async () => {
    const { LWOLoader } = await import("../../src/vendor/three/addons/LWOLoader.js");
    assert.equal(typeof LWOLoader, "function");
    await assert.rejects(loadModelFile({ name: "x.lwo", bytes: enc("FORM....LWO2 nonsense") }));
  });

  test("My library: a model's folder names its category", async () => {
    const { categoryFromPath } = await import("../../src/ui/userlib.js");
    assert.equal(categoryFromPath("C:\\Assets\\Kitchen\\fridge.glb"), "Kitchen");
    assert.equal(categoryFromPath("/home/me/models/Garden lamps/lamp.usdz"), "Garden lamps");
    assert.equal(categoryFromPath("C:\\Users\\me\\Downloads\\chair.fbx"), "Other");
    assert.equal(categoryFromPath("chair.obj"), "Other");
    assert.equal(categoryFromPath("D:\\living\\sofa.dae"), "Living", "a built-in category, its own spelling");
  });
});
