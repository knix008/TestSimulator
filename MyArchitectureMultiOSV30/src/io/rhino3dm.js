// Rhino .3dm import (openNURBS through McNeel's rhino3dm, MIT, vendored in
// src/vendor/rhino3dm and loaded only when a .3dm file is imported).
//
//   read3dm(bytes, { mode })         → plain data (rhino3dm-extract.js)
//   rhinoModelRoot(data)             → THREE.Group, file units, Z up — the
//                                      "3dm" parser of models3d.js
//   import3dmPlan(bytes, opts)       → CAD layer drawings like importDxf:
//                                      { drawings, texts, layers, units,
//                                        scale, bounds, warnings, counts }
//
// In the app the file is read in a module worker (rhino3dm-worker.js; the
// rhino3dm bindings need eval, which the page's CSP does not allow); in node
// (unit tests) rhino3dm runs in-process.
//
// The plan drawing is the top view: curves, the edges of surfaces and
// polysurfaces, the creases, open edges and silhouettes of meshes and SubDs,
// points (small crosses) and texts, projected onto the XY plane (the plan's
// y runs the other way: plan y = −Rhino y), one CAD layer per Rhino layer
// with the layer's colour and visibility.

import * as THREE from "../vendor/three/three.module.js";
import { uid } from "../core/geom.js";

const UNIT_MM = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
const POINT_MARK = 100; // mm, half size of the cross drawn for a point

let nodeRhino = null;
async function inProcess(bytes, mode) {
  if (!nodeRhino) {
    nodeRhino = (async () => {
      const fs = await import("node:fs");
      const wasmUrl = new URL("../vendor/rhino3dm/rhino3dm.wasm", import.meta.url);
      const mod = await import("../vendor/rhino3dm/rhino3dm.module.js");
      return mod.default({ wasmBinary: fs.readFileSync(wasmUrl) });
    })();
  }
  const { extract3dm } = await import("./rhino3dm-extract.js");
  return extract3dm(await nodeRhino, bytes, { mode });
}

function inWorker(bytes, mode) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL("./rhino3dm-worker.js", import.meta.url), { type: "module" });
    } catch (e) {
      reject(new Error(`The Rhino reader could not start: ${e.message || e}`));
      return;
    }
    const done = (fn, v) => { worker.terminate(); fn(v); };
    worker.onmessage = (e) => {
      const r = e.data || {};
      if (r.ok) done(resolve, r.data);
      else done(reject, new Error(r.error || "The Rhino reader failed."));
    };
    worker.onerror = (e) => { if (e.preventDefault) e.preventDefault(); done(reject, new Error(`The Rhino reader could not start: ${e.message || "worker error"}`)); };
    worker.onmessageerror = () => done(reject, new Error("The Rhino reader returned unreadable data."));
    const copy = bytes.slice();
    worker.postMessage({ bytes: copy, mode }, [copy.buffer]);
  });
}

const isRhinoFile = (b) => b.length > 32 && String.fromCharCode(...b.subarray(0, 23)) === "3D Geometry File Format";

/** Read a .3dm file into plain data; mode "model" (meshes) or "plan" (curves, edges, texts). */
export async function read3dm(bytes, { mode = "model" } = {}) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  if (!isRhinoFile(data)) throw new Error("This is not a Rhino .3dm file.");
  const useWorker = typeof Worker === "function" && typeof window !== "undefined";
  return useWorker ? inWorker(data, mode) : inProcess(data, mode);
}

// ---------------------------------------------------------------- 3D model

/** THREE.Group of one mesh per layer and colour, in file units with Z up. */
export function rhinoModelRoot(data) {
  const root = new THREE.Group();
  if (!data.meshes.length) return root;
  // Float32 keeps ~7 digits: put the origin in the middle of the model first.
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const m of data.meshes) {
    const p = m.positions;
    for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { if (p[i + k] < min[k]) min[k] = p[i + k]; if (p[i + k] > max[k]) max[k] = p[i + k]; }
  }
  const c = min.map((v, k) => (v + max[k]) / 2);
  const mats = new Map();
  for (const m of data.meshes) {
    const pos = new Float32Array(m.positions.length);
    for (let i = 0; i < pos.length; i += 3) { pos[i] = m.positions[i] - c[0]; pos[i + 1] = m.positions[i + 1] - c[1]; pos[i + 2] = m.positions[i + 2] - c[2]; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    if (m.normals) geo.setAttribute("normal", new THREE.BufferAttribute(m.normals instanceof Float32Array ? m.normals : Float32Array.from(m.normals), 3));
    geo.setIndex(new THREE.BufferAttribute(m.index instanceof Uint32Array ? m.index : Uint32Array.from(m.index), 1));
    if (!m.normals) geo.computeVertexNormals();
    const key = `${m.color.join(",")}|${m.opacity}|${m.material}`;
    let mat = mats.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        name: m.material || m.name || "rhino",
        color: new THREE.Color().setRGB(m.color[0], m.color[1], m.color[2], THREE.SRGBColorSpace),
        roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide,
        opacity: m.opacity, transparent: m.opacity < 1,
      });
      mats.set(key, mat);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = m.name || "";
    root.add(mesh);
  }
  root.position.set(c[0], c[1], c[2]);
  return root;
}

// ---------------------------------------------------------------- plan drawing

function guessUnit(extent) {
  if (!(extent > 0)) return "mm";
  if (extent < 300) return "m";
  if (extent < 3000) return "cm";
  return "mm";
}

const round = (v) => Math.round(v * 1e4) / 1e4 + 0;
const DEG = 180 / Math.PI;

/**
 * Top view of a .3dm file as CAD layer drawings (plan millimetres).
 * opts: { level, units: "auto" | mm | cm | m | in | ft, edges: true }
 * (edges false: curves, points and texts only, no surface / mesh edges).
 */
export async function import3dmPlan(bytes, { level = null, units = "auto", edges = true } = {}) {
  const data = await read3dm(bytes, { mode: "plan" });
  return planFromData(data, { level, units, edges });
}

export function planFromData(data, { level = null, units = "auto", edges = true } = {}) {
  const warnings = [...data.warnings];
  const curves = edges ? data.curves : data.curves.filter((c) => !c.edge);

  let unit, scale;
  if (units && units !== "auto") {
    if (!UNIT_MM[units]) throw new Error(`Unknown unit "${units}"`);
    unit = units; scale = UNIT_MM[units];
  } else if (data.metresPerUnit) {
    unit = data.unit || `${+(data.metresPerUnit * 1000).toPrecision(6)} mm`;
    scale = data.metresPerUnit * 1000;
  } else {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const add = (p) => { if (p[0] < x1) x1 = p[0]; if (p[0] > x2) x2 = p[0]; if (p[1] < y1) y1 = p[1]; if (p[1] > y2) y2 = p[1]; };
    for (const c of curves) for (const p of c.pts) add(p);
    for (const p of data.points) add(p.p);
    const extent = Number.isFinite(x1) ? Math.max(x2 - x1, y2 - y1) : 0;
    unit = guessUnit(extent);
    scale = UNIT_MM[unit];
    if (extent > 0) warnings.push(`The model has no units; ${unit} assumed from its size (${Math.round(extent * 100) / 100} units).`);
  }
  const P = (p) => [round(p[0] * scale), round(-p[1] * scale)];

  const layerOf = new Map(data.layers.map((l) => [l.index, l]));
  const used = new Set();
  const layerName = (i) => {
    const l = layerOf.get(i);
    const name = l ? l.path : "Rhino";
    used.add(name);
    return name;
  };

  const drawings = [];
  const openEdges = new Map(); // layer|colour → open edge polylines to join
  const seen = new Set();
  let dupes = 0, flat = 0;
  const push = (layer, color, item) => {
    const d = { id: uid("g"), level, layer, ...item };
    if (color) d.color = color;
    drawings.push(d);
  };
  for (const c of curves) {
    const a = c.arc;
    const nl = a ? Math.hypot(a.n[0], a.n[1], a.n[2]) : 0;
    if (a && nl > 0 && Math.abs(a.n[2]) / nl > 1 - 1e-9) {
      const [cx, cy] = P(a.c);
      const r = round(a.r * scale);
      const key = `${c.layer}|o|${Math.round(cx)}|${Math.round(cy)}|${Math.round(r)}|${a.full ? "" : `${P(a.p0)}|${P(a.p1)}`}`;
      if (seen.has(key)) { dupes++; continue; }
      seen.add(key);
      if (a.full || !a.p0 || !a.p1) push(layerName(c.layer), c.color, { kind: "circle", cx, cy, r });
      else {
        const ang = (p) => round(-Math.atan2(p[1] - a.c[1], p[0] - a.c[0]) * DEG);
        push(layerName(c.layer), c.color, { kind: "arc", cx, cy, r, a1: ang(a.p0), a2: ang(a.p1), ccw: a.n[2] > 0 });
      }
      continue;
    }
    const pts = [];
    for (const p of c.pts) {
      const q = P(p);
      const last = pts[pts.length - 1];
      if (!last || Math.abs(last[0] - q[0]) > 0.01 || Math.abs(last[1] - q[1]) > 0.01) pts.push(q);
    }
    let closed = c.closed;
    if (pts.length > 2 && Math.abs(pts[0][0] - pts[pts.length - 1][0]) <= 0.01 && Math.abs(pts[0][1] - pts[pts.length - 1][1]) <= 0.01) { pts.pop(); closed = true; }
    if (pts.length < 2) { flat++; continue; } // seen end-on (a vertical line)
    // The top and bottom edges of a vertical face land on each other.
    const k1 = pts.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`);
    const key = `${c.layer}|${closed ? "c" : "o"}|${[k1.join(";"), [...k1].reverse().join(";")].sort()[0]}`;
    if (seen.has(key)) { dupes++; continue; }
    seen.add(key);
    if (c.edge && !closed) { const k = `${c.layer}|${c.color || ""}`; if (!openEdges.has(k)) openEdges.set(k, { layer: c.layer, color: c.color, lines: [] }); openEdges.get(k).lines.push(pts); continue; }
    push(layerName(c.layer), c.color, { kind: "polyline", pts, closed: closed && pts.length > 2 });
  }
  // Edges meeting end to end become one polyline (a box seen from above is one rectangle).
  for (const g of openEdges.values()) {
    for (const pts of joinPolylines(g.lines)) {
      const a = pts[0], b = pts[pts.length - 1];
      const closed = pts.length > 3 && Math.abs(a[0] - b[0]) <= 0.01 && Math.abs(a[1] - b[1]) <= 0.01;
      push(layerName(g.layer), g.color, { kind: "polyline", pts: closed ? pts.slice(0, -1) : pts, closed });
    }
  }
  for (const p of data.points) {
    const [x, y] = P(p.p);
    const L = layerName(p.layer);
    push(L, p.color, { kind: "polyline", pts: [[x - POINT_MARK, y - POINT_MARK], [x + POINT_MARK, y + POINT_MARK]], closed: false });
    push(L, p.color, { kind: "polyline", pts: [[x - POINT_MARK, y + POINT_MARK], [x + POINT_MARK, y - POINT_MARK]], closed: false });
  }

  const texts = [];
  for (const t of data.texts) {
    // Text dots are screen-sized labels in Rhino: a room-label size here.
    const size = !t.dot && t.height > 0 ? round(t.height * scale) : 250;
    const xl = Math.hypot(t.x[0], t.x[1]);
    const dir = xl > 1e-9 ? [t.x[0] / xl, t.x[1] / xl] : [1, 0];
    // Rhino anchors a text at its baseline (a dot at its centre); plan texts hang from their top.
    const lift = t.dot ? size / 2 / scale : size / scale;
    const anchor = [t.p[0] - dir[1] * lift, t.p[1] + dir[0] * lift, t.p[2]];
    const [x, y] = P(anchor);
    const rot = round(-Math.atan2(dir[1], dir[0]) * DEG);
    const tx = { id: uid("t"), level, x, y, text: t.text, size, rot: rot <= -180 ? rot + 360 : rot, align: t.dot ? "center" : "left", layer: layerName(t.layer) };
    if (t.color) tx.color = t.color;
    texts.push(tx);
  }
  if (flat) warnings.push(`${flat} curve(s) or edge(s) seen end-on from above (vertical) were left out.`);
  if (dupes) warnings.push(`${dupes} edge(s) lying on top of another one in the top view were merged.`);
  if (!edges && data.curves.length > curves.length) warnings.push(`${data.curves.length - curves.length} surface and mesh edge(s) were not imported (only curves were asked for).`);

  const layers = [];
  for (const name of used) {
    const l = data.layers.find((x) => x.path === name);
    layers.push({ id: name, name, color: l ? l.color : "#9aa4b5", visible: l ? l.visible : true });
  }
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const add = (x, y) => { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; };
  for (const d of drawings) {
    if (d.kind === "circle" || d.kind === "arc") { add(d.cx - d.r, d.cy - d.r); add(d.cx + d.r, d.cy + d.r); } else for (const [x, y] of d.pts) add(x, y);
  }
  for (const t of texts) add(t.x, t.y);
  const bounds = Number.isFinite(x1) ? { x1, y1, x2, y2 } : null;
  return { drawings, texts, layers, units: unit, scale, bounds, warnings, counts: data.counts };
}

// Join polylines whose ends meet (within 0.01 mm), keeping the point order.
export function joinPolylines(lines) {
  const key = (p) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
  const ends = new Map();
  lines.forEach((l, i) => { for (const p of [l[0], l[l.length - 1]]) { const k = key(p); const e = ends.get(k); if (e) e.push(i); else ends.set(k, [i]); } });
  const used = new Uint8Array(lines.length);
  const out = [];
  const grow = (line) => {
    for (;;) {
      const end = key(line[line.length - 1]);
      const next = (ends.get(end) || []).find((i) => !used[i]);
      if (next === undefined) return;
      used[next] = 1;
      const l = lines[next];
      const seg = key(l[0]) === end ? l : [...l].reverse();
      for (let i = 1; i < seg.length; i++) line.push(seg[i]);
    }
  };
  for (let i = 0; i < lines.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line = [...lines[i]];
    grow(line);
    line.reverse();
    grow(line);
    out.push(line);
  }
  return out;
}
