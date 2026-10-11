// Rhino .3dm import: rhino3dm (vendored WebAssembly) read in-process, the
// sample model of rhino3dm-fixtures.mjs as a 3D model (units, layer and object
// colours, blocks, hidden layers, tessellation of faces without render
// meshes) and as a plan drawing (top view on CAD layers). Optionally every
// .3dm file in MYARCH_3DM_CORPUS (e.g. the openNURBS example files) is read.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { rhino, sample3dm } from "./rhino3dm-fixtures.mjs";
import { extract3dm, chainSegments } from "../../src/io/rhino3dm-extract.js";
import { read3dm, planFromData, import3dmPlan, joinPolylines } from "../../src/io/rhino3dm.js";
import { loadModelFile } from "../../src/io/models3d.js";

const root = path.resolve(import.meta.dirname, "../..");
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const vendor = (f) => path.join(root, "src/vendor/rhino3dm", f);

test("rhino3dm is vendored: pinned version, MIT licence, module + wasm", () => {
  assert.match(fs.readFileSync(vendor("VERSION"), "utf8"), /^rhino3dm 8\.32\.2 \(npm, sha512-/);
  assert.match(fs.readFileSync(vendor("LICENSE"), "utf8"), /^MIT License[\s\S]*Robert McNeel & Associates/);
  const wasm = fs.readFileSync(vendor("rhino3dm.wasm"));
  assert.deepEqual([...wasm.subarray(0, 4)], [0, 0x61, 0x73, 0x6d]); // \0asm
  assert.ok(wasm.length > 1e6);
  assert.match(fs.readFileSync(vendor("rhino3dm.module.js"), "utf8"), /export default rhino3dm/);
  // Packaged with the app (src/**) and copied to the web build (src).
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.ok(pkg.build.files.includes("src/**/*"));
  assert.match(fs.readFileSync(path.join(root, "scripts/build-web.mjs"), "utf8"), /'src'/);
});

test("3dm model: units, layers, colours, blocks; hidden layer left out", async () => {
  const rh = await rhino();
  const r = extract3dm(rh, await sample3dm(), { mode: "model" });
  assert.equal(r.unitSystem, "Centimeters");
  assert.equal(r.unit, "cm");
  assert.equal(r.metresPerUnit, 0.01);
  assert.deepEqual(r.layers.map((l) => l.path), ["Walls", "Furniture", "Furniture::Table", "Plan", "Hidden"]);
  assert.equal(r.layers.find((l) => l.path === "Hidden").visible, false);
  const by = Object.fromEntries(r.meshes.map((m) => [m.name, m]));
  assert.deepEqual(Object.keys(by).sort(), ["Furniture", "Furniture::Table", "Walls"]);
  // Layer colour (Walls), object colour (table), object colour inside the block (stools).
  assert.deepEqual(by.Walls.color.map((v) => Math.round(v * 255)), [200, 40, 40]);
  assert.deepEqual(by["Furniture::Table"].color.map((v) => Math.round(v * 255)), [20, 160, 60]);
  assert.deepEqual(by.Furniture.color.map((v) => Math.round(v * 255)), [140, 90, 40]);
  // A box without render mesh: six flat faces triangulated exactly.
  assert.equal(by.Walls.index.length / 3, 12);
  // Two stools of the block, translated to x = 50 and x = 350.
  assert.equal(by.Furniture.index.length / 3, 24);
  const xs = [];
  for (let i = 0; i < by.Furniture.positions.length; i += 3) xs.push(by.Furniture.positions[i]);
  assert.deepEqual([Math.min(...xs), Math.max(...xs)], [30, 370]);
  assert.equal(by["Furniture::Table"].index.length / 3, 2);
  assert.ok(r.warnings.some((w) => /1 objects on hidden layers skipped/.test(w)), r.warnings.join("\n"));
  assert.ok(r.warnings.some((w) => /2 curves .*plan drawing/.test(w)));
  assert.ok(!r.warnings.some((w) => /tessellated approximately/.test(w)), "flat faces are exact");
});

test("3dm through loadModelFile: furniture asset in millimetres from the file's centimetres", async () => {
  const res = await loadModelFile({ name: "Sample.3dm", bytes: await sample3dm() }, { glb: false });
  assert.equal(res.format, "3dm");
  assert.equal(res.units, "cm");
  assert.deepEqual(res.size, [4000, 3000, 2500]);
  assert.equal(res.object.children.length, 3);
  for (const m of res.object.children) assert.equal(m.material.side, 2); // DoubleSide: Rhino surfaces are often open
  const forced = await loadModelFile({ name: "Sample.3dm", bytes: await sample3dm() }, { glb: false, units: "mm" });
  assert.deepEqual(forced.size, [400, 300, 250]);
  // GLTFExporter (glb: true) reads its blob with FileReader, which node lacks.
  globalThis.FileReader ??= class { readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; if (this.onloadend) this.onloadend(); }); } };
  const glb = await loadModelFile({ name: "Sample.3dm", bytes: await sample3dm() });
  assert.ok(typeof glb.data === "string" && glb.data.length > 100);
});

test("3dm plan drawing: top view on CAD layers (closed outlines, circle, blocks, point, text)", async () => {
  const res = await import3dmPlan(await sample3dm(), { level: "L1" });
  assert.equal(res.units, "cm");
  assert.equal(res.scale, 10);
  const layer = (n) => res.drawings.filter((d) => d.layer === n);
  // The wall box: its 12 edges → one closed rectangle (vertical edges are points, top = bottom).
  const walls = layer("Walls");
  assert.equal(walls.length, 1);
  assert.equal(walls[0].kind, "polyline");
  assert.ok(walls[0].closed);
  const xs = walls[0].pts.map((p) => p[0]), ys = walls[0].pts.map((p) => p[1]);
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [0, 4000, -3000, 0]); // plan y = −Rhino y
  assert.equal(walls[0].color, "#c82828");
  const plan = layer("Plan");
  const circle = plan.find((d) => d.kind === "circle");
  assert.deepEqual([circle.cx, circle.cy, circle.r], [2000, -1500, 500]);
  assert.ok(plan.some((d) => d.kind === "polyline" && d.pts.length === 3 && !d.closed && d.pts[2][0] === 1500 && d.pts[2][1] === 1000));
  assert.equal(plan.filter((d) => d.kind === "polyline" && d.pts.length === 2).length, 2); // the point's cross
  const stools = layer("Furniture");
  assert.equal(stools.length, 2);
  assert.ok(stools.every((d) => d.closed && d.pts.length === 4));
  const table = layer("Furniture::Table");
  assert.equal(table.length, 1);
  assert.ok(table[0].closed && table[0].color === "#14a03c"); // mesh outline, object colour
  assert.equal(res.texts.length, 1);
  assert.equal(res.texts[0].text, "Room 1");
  assert.equal(res.texts[0].align, "center");
  assert.ok(res.drawings.every((d) => d.level === "L1" && /^g/.test(d.id)));
  const hidden = res.layers.find((l) => l.id === "Hidden");
  assert.ok(hidden && hidden.visible === false);
  assert.ok(layer("Hidden").length === 1); // kept on its hidden layer
  assert.deepEqual(res.bounds, { x1: 0, y1: -5100, x2: 7000, y2: 1000 });
  // Curves only: no surface / mesh edges.
  const curvesOnly = await import3dmPlan(await sample3dm(), { level: "L1", edges: false });
  assert.deepEqual([...new Set(curvesOnly.drawings.map((d) => d.layer))], ["Plan"]);
  // Units override.
  const mm = await import3dmPlan(await sample3dm(), { units: "mm" });
  assert.equal(mm.drawings.find((d) => d.kind === "circle").r, 50);
});

test("3dm plan: arcs keep their direction (Rhino counter-clockwise → canvas anticlockwise in plan y-down)", async () => {
  const rh = await rhino();
  const doc = new rh.File3dm();
  doc.settings().modelUnitSystem = rh.UnitSystem.Millimeters;
  doc.objects().addCurve(rh.ArcCurve.createFromArc(new rh.Arc(new rh.Circle([0, 0, 0], 1000), Math.PI / 2)), new rh.ObjectAttributes());
  const data = await read3dm(new Uint8Array(doc.toByteArray()), { mode: "plan" });
  const arc = planFromData(data, {}).drawings[0];
  assert.equal(arc.kind, "arc");
  assert.deepEqual([arc.cx, arc.cy, arc.r], [0, 0, 1000]);
  assert.ok(near(arc.a1, 0) && near(arc.a2, -90) && arc.ccw === true, JSON.stringify(arc));
});

test("3dm: curved faces without render mesh are tessellated on the surface", async () => {
  const rh = await rhino();
  const doc = new rh.File3dm();
  doc.settings().modelUnitSystem = rh.UnitSystem.Meters;
  doc.objects().addBrep(rh.Brep.createFromSphere(new rh.Sphere([5, 0, 1], 1)), new rh.ObjectAttributes());
  doc.objects().addBrep(rh.Brep.createFromCylinder(new rh.Cylinder(new rh.Circle([0, 0, 0], 0.5), 2), true, true), new rh.ObjectAttributes());
  const r = extract3dm(rh, new Uint8Array(doc.toByteArray()), { mode: "model" });
  assert.equal(r.meshes.length, 1);
  const p = r.meshes[0].positions;
  let onSphere = 0, onCyl = 0, other = 0;
  for (let i = 0; i < p.length; i += 3) {
    const ds = Math.hypot(p[i] - 5, p[i + 1], p[i + 2] - 1), dc = Math.hypot(p[i], p[i + 1]);
    if (near(ds, 1, 1e-6)) onSphere++;
    else if (near(dc, 0.5, 1e-6) || (near(p[i + 2], 0) || near(p[i + 2], 2)) && dc <= 0.5 + 1e-9) onCyl++;
    else other++;
  }
  assert.equal(other, 0);
  assert.ok(onSphere > 100 && onCyl > 50);
  assert.ok(r.meshes[0].index.length / 3 > 200);
  assert.ok(r.warnings.some((w) => /curved surface\(s\) had no render mesh/.test(w)));
});

test("polyline joining helpers", () => {
  assert.deepEqual(joinPolylines([[[0, 0], [1, 0]], [[1, 1], [1, 0]], [[0, 0], [0, 1]]]), [[[1, 1], [1, 0], [0, 0], [0, 1]]]);
  assert.deepEqual(chainSegments([[[0, 0, 0], [1, 0, 0]], [[1, 0, 0], [1, 1, 0]]]), [[[1, 1, 0], [1, 0, 0], [0, 0, 0]]]);
});

test("not a 3dm file is refused", async () => {
  await assert.rejects(read3dm(new TextEncoder().encode("solid cube\nendsolid\n".repeat(4))), /not a Rhino \.3dm file/);
  await assert.rejects(loadModelFile({ name: "x.3dm", bytes: new Uint8Array(64) }, { glb: false }), /not a Rhino/);
});

test("3dm corpus (MYARCH_3DM_CORPUS) reads in both modes", { skip: !process.env.MYARCH_3DM_CORPUS && "MYARCH_3DM_CORPUS is not set" }, async () => {
  const rh = await rhino();
  const dir = process.env.MYARCH_3DM_CORPUS;
  const files = fs.readdirSync(dir, { recursive: true }).filter((f) => /\.3dm$/i.test(f));
  assert.ok(files.length > 0);
  for (const f of files) {
    const bytes = new Uint8Array(fs.readFileSync(path.join(dir, f)));
    if (new TextDecoder().decode(bytes.subarray(0, 23)) !== "3D Geometry File Format") continue;
    for (const mode of ["model", "plan"]) {
      const r = extract3dm(rh, bytes, { mode });
      for (const m of r.meshes) assert.ok(m.positions.every(Number.isFinite), `${f}: finite vertices`);
      if (mode === "plan") planFromData(r, {});
    }
  }
});
