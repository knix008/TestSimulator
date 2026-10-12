// Measures how heavy the 3D model of each sample is: build time, meshes
// (≈ draw calls), distinct geometries and materials, triangles. Runs in Node
// (three.js without a GPU), so it shows the CPU side of a rebuild and the size
// of the scene the GPU gets; frame rates come from the GUI smoke test.
//
//   npm run bench:3d                 every sample
//   npm run bench:3d -- tower 08     only samples whose file name contains one of these
//   npm run bench:3d -- --json f     also write the numbers as JSON
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "../src/vendor/three/three.module.js";
import { buildBuilding, makeMaterials } from "../src/view3d/build.js";
import { createBatcher } from "../src/view3d/batch.js";
import { parseProject } from "../src/core/project.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const jsonIdx = args.indexOf("--json");
const jsonOut = jsonIdx >= 0 ? args.splice(jsonIdx, 2)[1] : null;
const filters = args;

export function measure(object) {
  let meshes = 0, instances = 0, triangles = 0;
  const geos = new Set(), mats = new Set();
  object.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const n = o.isInstancedMesh ? o.count : 1;
    instances += n;
    geos.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
    const g = o.geometry;
    triangles += ((g.index ? g.index.count : g.attributes.position.count) / 3) * n;
  });
  return { meshes, instances, geometries: geos.size, materials: mats.size, triangles: Math.round(triangles) };
}

// Draw calls once the viewer has batched the repeats (batch.js): meshes still
// drawn on their own plus one per batch, and how long batching took.
export function batched(root) {
  const b = createBatcher(THREE);
  const t0 = performance.now();
  b.build(root);
  const ms = performance.now() - t0;
  let own = 0;
  root.traverseVisible((o) => { if (o.isMesh && o.layers.isEnabled(0)) own++; });
  const info = b.info();
  b.release();
  return { drawCalls: own + info.batches, batchMs: +ms.toFixed(1) };
}

// A rebuild after moving one item on the first level: the other levels are
// carried over (build.js levelKeys).
export function timeEdit(p, runs = 5) {
  const mats = makeMaterials(THREE, { textures: false });
  let prev = buildBuilding(THREE, p, mats, { reuse: new Map() });
  const lv = p.levels[0] && p.levels[0].id;
  const item = p.furniture.find((f) => f.level === lv) || p.walls.find((w) => w.level === lv);
  if (!item) return null;
  const times = [];
  for (let i = 0; i < runs + 1; i++) {
    if ("x" in item) item.x += 10; else item.x1 += 10;
    const t0 = performance.now();
    prev = buildBuilding(THREE, p, mats, { reuse: prev.userData.levels });
    if (i) times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return +times[Math.floor(times.length / 2)].toFixed(1);
}

// Median of `runs` builds (the first warms up the JIT).
export function timeBuild(p, runs = 5) {
  const times = [];
  let last = null;
  for (let i = 0; i < runs + 1; i++) {
    const mats = makeMaterials(THREE, { textures: false });
    const t0 = performance.now();
    last = buildBuilding(THREE, p, mats, {});
    const ms = performance.now() - t0;
    if (i) times.push(ms);
  }
  times.sort((a, b) => a - b);
  return { ms: times[Math.floor(times.length / 2)], root: last };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dir = path.join(root, "sample");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".myarch")).filter((f) => !filters.length || filters.some((x) => f.includes(x))).sort();
  const rows = [];
  for (const f of files) {
    const p = parseProject(fs.readFileSync(path.join(dir, f), "utf8"));
    const { ms, root: obj } = timeBuild(p);
    rows.push({ file: f, buildMs: +ms.toFixed(1), ...measure(obj), ...batched(obj), editMs: timeEdit(p) });
  }
  const cols = [["file", 26], ["buildMs", 8], ["editMs", 7], ["meshes", 7], ["geometries", 11], ["materials", 10], ["triangles", 10], ["drawCalls", 10], ["batchMs", 8]];
  console.log(cols.map(([k, w]) => k.padStart(k === "file" ? 0 : w).padEnd(k === "file" ? w : 0)).join(" "));
  for (const r of rows) console.log(cols.map(([k, w]) => (k === "file" ? String(r[k]).padEnd(w) : String(r[k]).padStart(w))).join(" "));
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  console.log(`total: build ${sum("buildMs").toFixed(0)} ms, edit ${sum("editMs").toFixed(0)} ms, ${sum("meshes")} meshes → ${sum("drawCalls")} draw calls, ${sum("geometries")} geometries, ${sum("triangles")} triangles`);
  if (jsonOut) fs.writeFileSync(path.resolve(root, jsonOut), JSON.stringify(rows, null, 2));
}
