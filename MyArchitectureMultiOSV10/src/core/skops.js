// SketchUp-style edits on the project (pure, run inside store.edit): solid
// tools, components (make, place, glue into walls, edit in place, make
// unique, explode, replace), drawing faces and lines in 3D, follow me,
// 3D move / copy arrays / rotate / scale, terrains (sandbox), section planes,
// guides and 3D notes. Data model: src/core/skmodel.js; geometry:
// src/core/mesh.js and src/core/csg.js.
//
// 3D points are plan millimetres with an absolute z (level elevation added);
// mass-model meshes keep z from their level's floor.

import { levelById, findItem, wallLength } from "./project.js";
import { uid, rotPt } from "./geom.js";
import {
  solidMesh, translateMesh, transformMesh, meshBounds, mergeMeshes, cloneMesh, rotatePoint, surfaceMesh, terrainGrid, terrainFromContours,
  smoove, imprintLoop, splitFace, followMe, faceLoops, loopPts, dedupe3, dist3, sub, dot, norm, faceNormal, add, mul,
} from "./mesh.js";
import { union, subtract, intersect, imprint, split as splitSolids, isSolid, pushPull } from "./csg.js";
import { syncMeshSolid, syncDefinition, componentById, instanceScale } from "./skmodel.js";
import { copyItems, pasteItems, moveItems, rotateItems, scaleItems, selectionCentre, deleteItems } from "../plan/ops.js";
import { wallFrame } from "./walls.js";

export const elevationOf = (p, level) => (levelById(p, level) || { elevation: 0 }).elevation;
const named = (it) => it.obj.name || it.obj.id;

// ---------------------------------------------------------------- world meshes
// Faces without their own material take the item's.
function bake(m, material) {
  if (!material) return m;
  const out = cloneMesh(m);
  for (const f of out.f) if (!f.m) f.m = material;
  return out;
}

export function solidWorldMesh(p, s) { return translateMesh(solidMesh(s), 0, 0, elevationOf(p, s.level)); }

export function instanceToWorld(p, f, def, [lx, ly, lz]) {
  const [sx, sy, sz] = instanceScale(def, f);
  const [rx, ry] = rotPt(lx * sx, ly * sy, f.rot || 0);
  return [f.x + rx, f.y + ry, elevationOf(p, f.level) + (f.elevation || 0) + lz * sz];
}

export function worldToInstance(p, f, def, [x, y, z]) {
  const [sx, sy, sz] = instanceScale(def, f);
  const [lx, ly] = rotPt(x - f.x, y - f.y, -(f.rot || 0));
  return [lx / sx, ly / sy, (z - elevationOf(p, f.level) - (f.elevation || 0)) / sz];
}

export function instanceWorldMesh(p, f) {
  const def = componentById(p, f.comp);
  if (!def) return null;
  const [sx, sy, sz] = instanceScale(def, f);
  return bake(transformMesh(def.mesh, (q) => instanceToWorld(p, f, def, q), { mirror: sx * sy * sz < 0 }), f.material);
}

// A solid or a component instance as a closed world mesh with its materials.
function worldOf(p, it) {
  if (it.kind === "solids") return bake(solidWorldMesh(p, it.obj), it.obj.material || "concrete");
  if (it.kind === "furniture" && it.obj.kind === "component") return instanceWorldMesh(p, it.obj);
  return null;
}

// Give a mass model a (local) mesh; a parametric prism becomes a mesh.
export function setSolidMesh(p, s, worldMesh) {
  s.mesh = translateMesh(worldMesh, 0, 0, -elevationOf(p, s.level));
  delete s.taper;
  syncMeshSolid(s);
  return s;
}
export function toMeshSolid(s) {
  if (!s.mesh) { s.mesh = cloneMesh(solidMesh(s)); s.taper = 1; syncMeshSolid(s); }
  return s;
}

function removeIds(p, ids) {
  const set = new Set(ids);
  p.solids = p.solids.filter((s) => !set.has(s.id));
  p.furniture = p.furniture.filter((f) => !set.has(f.id));
}

function newSolid(p, level, mesh, base = {}) {
  const s = { id: uid("v"), level, name: base.name, material: base.material || "concrete", z0: 0, height: 1, pts: [], phase: "new" };
  if (base.group) s.group = base.group;
  if (base.layer) s.layer = base.layer;
  setSolidMesh(p, s, mesh);
  p.solids.push(s);
  return s;
}

// ---------------------------------------------------------------- solid tools
// op: union | outer (outer shell of all) | subtract (the second is cut out of
// the first and goes) | trim (the same, the second stays) | intersect |
// split (three parts). ids in selection order. → {ids: resulting items}
export function solidTool(p, op, ids) {
  const items = ids.map((id) => findItem(p, id)).filter((it) => it && (it.kind === "solids" || (it.kind === "furniture" && it.obj.kind === "component")));
  if (items.length < 2) throw new Error("Select two solids (masses or components).");
  const world = items.map((it) => ({ it, mesh: worldOf(p, it) }));
  for (const w of world) if (!isSolid(w.mesh)) throw new Error(`"${named(w.it)}" is not a closed solid.`);
  const A = world[0], B = world[1];
  const level = A.it.obj.level;
  const base = (w) => ({ name: w.it.obj.name, material: w.it.obj.material || (w.it.kind === "solids" ? "concrete" : undefined), group: w.it.obj.group, layer: w.it.obj.layer });
  const out = [];
  const put = (mesh, w) => { if (mesh && mesh.f.length) out.push(newSolid(p, w.it.obj.level || level, mesh, base(w)).id); };
  if (op === "union" || op === "outer") {
    let acc = A.mesh;
    for (const w of world.slice(1)) acc = union(acc, w.mesh);
    removeIds(p, items.map((x) => x.obj.id));
    put(acc, A);
  } else if (op === "subtract" || op === "trim") {
    const r = subtract(A.mesh, B.mesh);
    removeIds(p, op === "trim" ? [A.it.obj.id] : [A.it.obj.id, B.it.obj.id]);
    put(r, A);
    if (op === "trim") out.push(B.it.obj.id);
  } else if (op === "intersect") {
    const r = intersect(A.mesh, B.mesh);
    removeIds(p, [A.it.obj.id, B.it.obj.id]);
    put(r, A);
  } else if (op === "split") {
    const r = splitSolids(A.mesh, B.mesh);
    removeIds(p, [A.it.obj.id, B.it.obj.id]);
    put(r.aOnly, A); put(r.bOnly, B); put(r.both, A);
  } else throw new Error(`unknown solid tool ${op}`);
  return { ids: out };
}

// Intersect faces: each selected mass gets edges where the others pass
// through it (both sides stay, ready to push or paint).
export function intersectFaces(p, ids) {
  const items = ids.map((id) => findItem(p, id)).filter((it) => it && it.kind === "solids");
  if (items.length < 2) throw new Error("Select two or more masses.");
  const world = items.map((it) => worldOf(p, it));
  let n = 0;
  items.forEach((it, i) => {
    let m = world[i];
    for (let j = 0; j < items.length; j++) if (j !== i && isSolid(world[j])) m = imprint(m, world[j]);
    if (m.f.length !== world[i].f.length) n++;
    setSolidMesh(p, it.obj, m);
  });
  return n;
}

// ---------------------------------------------------------------- components
// Make a component from masses: one definition, one instance where they were.
export function makeComponent(p, ids, { name = "Component", cut = false } = {}) {
  const items = ids.map((id) => findItem(p, id)).filter((it) => it && it.kind === "solids");
  if (!items.length) throw new Error("Select one or more masses to make a component.");
  const world = mergeMeshes(items.map((it) => worldOf(p, it)));
  const b = meshBounds(world);
  const cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2;
  const def = { id: uid("cd"), name, mesh: translateMesh(world, -cx, -cy, -b.z1), cut: !!cut };
  syncDefinition(def);
  p.components.push(def);
  const level = items[0].obj.level;
  const inst = { id: uid("f"), level, kind: "component", comp: def.id, name, x: Math.round(cx), y: Math.round(cy), rot: 0, w: def.size[0], d: def.size[1], h: def.size[2], elevation: Math.round(b.z1 - elevationOf(p, level)), phase: "new" };
  if (items[0].obj.layer) inst.layer = items[0].obj.layer;
  removeIds(p, items.map((it) => it.obj.id));
  p.furniture.push(inst);
  return { def, inst };
}

export function placeComponent(p, defId, level, x, y, { elevation = 0, rot = 0 } = {}) {
  const def = componentById(p, defId);
  if (!def) throw new Error("no such component");
  const inst = { id: uid("f"), level, kind: "component", comp: def.id, name: def.name, x: Math.round(x), y: Math.round(y), rot, w: def.size[0], d: def.size[1], h: def.size[2], elevation: Math.round(elevation), phase: "new" };
  p.furniture.push(inst);
  return inst;
}

// A cutting component glued into a wall: an opening that shows it.
export function glueComponent(p, defId, wallId, at, sill = null) {
  const def = componentById(p, defId);
  const w = p.walls.find((x) => x.id === wallId);
  if (!def || !w) throw new Error("no such component or wall");
  const width = Math.min(def.size[0], wallLength(w) - 20);
  const o = { id: uid("o"), wall: w.id, kind: "opening", comp: def.id, at: Math.max(width / 2, Math.min(wallLength(w) - width / 2, at)), width, height: def.size[2], sill: sill ?? (def.size[2] < 1800 ? 900 : 0), phase: "new", type: "single", hinge: "start", side: 1 };
  p.openings.push(o);
  return o;
}

// Where along a wall (mm from its start) a plan point lies.
export function wallAt(w, x, y) {
  const f = wallFrame(w);
  return (x - w.x1) * f.d[0] + (y - w.y1) * f.d[1];
}

// Edit a definition: every instance follows. Instances keep their scale
// (their w / d / h grow with the definition).
export function updateDefinition(p, defId, mesh) {
  const def = componentById(p, defId);
  if (!def) return null;
  const old = def.size.slice();
  def.mesh = mesh;
  syncDefinition(def);
  for (const f of p.furniture) {
    if (f.kind !== "component" || f.comp !== defId) continue;
    f.w = Math.max(10, (f.w * def.size[0]) / old[0]);
    f.d = Math.max(10, (f.d * def.size[1]) / old[1]);
    f.h = Math.max(1, (f.h * def.size[2]) / old[2]);
  }
  return def;
}

// Make unique: the selected instances get their own copy of the definition
// (imported 3D models: their own copy of the asset).
export function makeUnique(p, ids) {
  const set = new Set(ids);
  const groups = new Map();
  for (const f of p.furniture) {
    if (!set.has(f.id)) continue;
    const key = f.kind === "component" ? `c:${f.comp}` : f.kind === "model" ? `m:${f.model}` : null;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  let n = 0;
  for (const [key, list] of groups) {
    if (key.startsWith("c:")) {
      const def = componentById(p, key.slice(2));
      if (!def) continue;
      const copy = { ...JSON.parse(JSON.stringify(def)), id: uid("cd"), name: uniqueName(p.components.map((c) => c.name), def.name) };
      p.components.push(copy);
      for (const f of list) { f.comp = copy.id; f.name = copy.name; }
    } else {
      const asset = p.models.find((m) => m.id === key.slice(2));
      if (!asset) continue;
      const copy = { ...asset, id: uid("m"), name: uniqueName(p.models.map((m) => m.name), asset.name) };
      p.models.push(copy);
      for (const f of list) f.model = copy.id;
    }
    n += list.length;
  }
  return n;
}

function uniqueName(names, base) {
  const used = new Set(names);
  for (let i = 2; i < 999; i++) { const n = `${base} #${i}`; if (!used.has(n)) return n; }
  return `${base} #${Date.now()}`;
}

// Explode an instance into a mass with its shape.
export function explodeInstance(p, id) {
  const f = p.furniture.find((x) => x.id === id && x.kind === "component");
  if (!f) return null;
  const mesh = instanceWorldMesh(p, f);
  removeIds(p, [id]);
  return newSolid(p, f.level, mesh, { name: f.name, material: f.material || "concrete", group: f.group, layer: f.layer });
}

// Swap instances for another definition: {comp} | {model} | {kind}.
export function replaceInstances(p, ids, target, sizeOf = () => null) {
  const set = new Set(ids);
  let n = 0;
  for (const f of p.furniture) {
    if (!set.has(f.id)) continue;
    delete f.comp; delete f.model;
    if (target.comp) { const def = componentById(p, target.comp); if (!def) continue; f.kind = "component"; f.comp = def.id; f.name = def.name; [f.w, f.d, f.h] = def.size; }
    else if (target.model) { const a = p.models.find((m) => m.id === target.model); if (!a) continue; f.kind = "model"; f.model = a.id; f.name = a.name; [f.w, f.d, f.h] = a.size.map(Math.round); }
    else if (target.kind) { f.kind = target.kind; delete f.name; const s = sizeOf(target.kind); if (s) [f.w, f.d, f.h] = s; }
    n++;
  }
  return n;
}

// The instances that share a definition with `id` (a component, an imported
// model, or the same kind of built-in furniture).
export function sameDefinition(p, id) {
  const f = p.furniture.find((x) => x.id === id);
  if (!f) return [];
  if (f.kind === "component") return p.furniture.filter((x) => x.kind === "component" && x.comp === f.comp).map((x) => x.id);
  if (f.kind === "model") return p.furniture.filter((x) => x.kind === "model" && x.model === f.model).map((x) => x.id);
  return p.furniture.filter((x) => x.kind === f.kind).map((x) => x.id);
}

// Edit the definition of built-in furniture: every instance takes the size
// and colour of this one.
export function applyToInstances(p, id) {
  const f = p.furniture.find((x) => x.id === id);
  if (!f) return 0;
  let n = 0;
  for (const g of p.furniture) {
    if (g === f || !sameDefinition(p, id).includes(g.id)) continue;
    g.w = f.w; g.d = f.d; g.h = f.h;
    if (f.color) g.color = f.color; else delete g.color;
    if (f.material) g.material = f.material;
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- mesh edits
// Run fn(localMesh) → mesh on what a 3D hit points at: a mass (target
// {kind: "solids", id}) or, when editing a component, its definition
// ({kind: "comp", def}). Returns the changed item or null.
export function editMesh(p, target, fn) {
  if (target.kind === "comp") {
    const def = componentById(p, target.def);
    if (!def) return null;
    const m = fn(cloneMesh(def.mesh));
    if (!m) return null;
    return updateDefinition(p, def.id, m);
  }
  const s = p.solids.find((x) => x.id === target.id);
  if (!s) return null;
  toMeshSolid(s);
  const m = fn(cloneMesh(s.mesh));
  if (m === null) { p.solids = p.solids.filter((x) => x !== s); return null; }
  if (!m) return null;
  s.mesh = m;
  syncMeshSolid(s);
  return s;
}

// Push/pull any face of a mass or a component being edited (local mm).
export function pushPullFace(p, target, face, d, { copy = false } = {}) {
  let mode = "none";
  const r = editMesh(p, target, (m) => { const res = pushPull(m, face, d, { copy }); mode = res.mode; return res.mesh; });
  return { item: r, mode };
}

// ---------------------------------------------------------------- drawing in 3D
// A closed loop drawn in 3D (absolute mm): on a face of a mass it becomes a
// face of its own; anywhere else a new surface on `level`.
// hit: {kind: "solids", id, face} | {kind: "comp", def, inst, face} | null.
export function drawLoop(p, loop, { level, hit = null, hits = null, towards = null, material } = {}) {
  const pts = dedupe3(loop);
  if (pts.length < 3) return null;
  for (const h of hits || []) { const r = drawLoop(p, pts, { level, hit: h, onlyOnFace: true }); if (r) return r; }
  if (arguments[2] && arguments[2].onlyOnFace && !hit) return null;
  if (hit && hit.face !== undefined && hit.face !== null) {
    let face = null;
    const local = (q) => (hit.kind === "comp" ? worldToInstance(p, p.furniture.find((f) => f.id === hit.inst), componentById(p, hit.def), q) : sub(q, [0, 0, elevationOf(p, (p.solids.find((s) => s.id === hit.id) || {}).level)]));
    const target = hit.kind === "comp" ? { kind: "comp", def: hit.def } : { kind: "solids", id: hit.id };
    const done = editMesh(p, target, (m) => { const r = imprintLoop(m, hit.face, pts.map(local)); if (!r) return undefined; face = r.face; return r.mesh; });
    if (done) return { id: hit.kind === "comp" ? hit.inst : hit.id, face, imprinted: true };
    if (arguments[2].onlyOnFace) return null;
  }
  const e = elevationOf(p, level);
  const m = surfaceMesh(pts.map((q) => [q[0], q[1], q[2] - e]), { towards, material });
  if (!m) return null;
  const s = { id: uid("v"), level, name: "Face", material: material || "plaster", mesh: m, z0: 0, height: 1, pts: [], phase: "new" };
  syncMeshSolid(s);
  p.solids.push(s);
  return { id: s.id, face: 0, imprinted: false };
}

// An open line drawn in 3D: across a face it splits it; otherwise it stays
// as loose edges (a sketch to snap to, or a path for follow me).
export function drawLine(p, pts3, { level, hit = null, hits = null } = {}) {
  const pts = dedupe3(pts3);
  if (pts.length < 2) return null;
  for (const h of hits || []) {
    if (h.kind !== "solids") continue;
    const r = drawLine(p, pts, { level, hit: h, onlyOnFace: true });
    if (r) return r;
  }
  if (arguments[2] && arguments[2].onlyOnFace && !hit) return null;
  if (hit && hit.face !== undefined && hit.face !== null && hit.kind === "solids") {
    const s = p.solids.find((x) => x.id === hit.id);
    if (s) {
      const e = elevationOf(p, s.level);
      const done = editMesh(p, { kind: "solids", id: s.id }, (m) => { const r = splitFace(m, hit.face, pts.map((q) => [q[0], q[1], q[2] - e])); return r ? r.mesh : undefined; });
      if (done) return { id: s.id, split: true };
    }
    if (arguments[2].onlyOnFace) return null;
  }
  const e = elevationOf(p, level);
  const v = pts.map((q) => [q[0], q[1], q[2] - e]);
  const s = { id: uid("v"), level, name: "Edges", material: "concrete", mesh: { v, f: [], e: v.slice(1).map((_, i) => [i, i + 1]) }, z0: 0, height: 1, pts: [], phase: "new" };
  syncMeshSolid(s);
  p.solids.push(s);
  return { id: s.id, split: false };
}

// The outer loop of a face of a mass, absolute mm (a path for follow me).
export function faceLoopWorld(p, solidId, face) {
  const s = p.solids.find((x) => x.id === solidId);
  if (!s) return null;
  const m = solidWorldMesh(p, s);
  if (!m.f[face]) return null;
  return faceLoops(m.f[face]).map((l) => loopPts(m, l));
}

// The chain of loose edges of an "Edges" mass, absolute mm, and whether it closes.
export function edgeChainWorld(p, solidId) {
  const s = p.solids.find((x) => x.id === solidId);
  if (!s || !s.mesh || !s.mesh.e || !s.mesh.e.length) return null;
  const m = solidWorldMesh(p, s);
  const nb = new Map();
  for (const [a, b] of m.e) { if (!nb.has(a)) nb.set(a, []); if (!nb.has(b)) nb.set(b, []); nb.get(a).push(b); nb.get(b).push(a); }
  let start = m.e[0][0];
  for (const [v, list] of nb) if (list.length === 1) { start = v; break; }
  const chain = [start];
  const seen = new Set([start]);
  for (let cur = start; ;) {
    const next = (nb.get(cur) || []).find((x) => !seen.has(x));
    if (next === undefined) break;
    chain.push(next); seen.add(next); cur = next;
  }
  const closed = chain.length > 2 && (nb.get(chain[chain.length - 1]) || []).includes(start);
  return { pts: chain.map((i) => m.v[i]), closed };
}

// Follow me: sweep a face of a mass along a path (absolute mm) into a new
// mass; a lone profile face is used up.
export function followMeOp(p, profile, path, { closed = false, level } = {}) {
  const loops = faceLoopWorld(p, profile.id, profile.face);
  if (!loops) throw new Error("Pick a face as the profile.");
  const src = p.solids.find((x) => x.id === profile.id);
  const mesh = followMe(loops, path, { closed, material: (src.mesh && src.mesh.f[profile.face] && src.mesh.f[profile.face].m) || src.material });
  const s = newSolid(p, level || src.level, mesh, { name: "Follow me", material: src.material, group: src.group, layer: src.layer });
  if (src.mesh && src.mesh.f.length === 1 && !(src.mesh.e || []).length) removeIds(p, [src.id]);
  return s;
}

// ---------------------------------------------------------------- move, copy, rotate, scale in 3D
// Lift the selection by dz: masses (and their meshes), furniture.
export function liftItems(p, ids, dz) {
  if (!dz) return;
  const set = new Set(ids);
  for (const s of p.solids) if (set.has(s.id)) { s.z0 = (s.z0 || 0) + dz; if (s.mesh) s.mesh.v = s.mesh.v.map(([x, y, z]) => [x, y, z + dz]); }
  for (const f of p.furniture) if (set.has(f.id)) f.elevation = (f.elevation || 0) + dz;
}

export function moveItems3d(p, ids, [dx, dy, dz]) {
  moveItems(p, ids, dx, dy);
  liftItems(p, ids, dz);
}

// Copies at d, 2d … n·d (an array) or, divide, n copies between (d/n, 2d/n … d).
export function copyItems3d(p, ids, d, { n = 1, divide = false } = {}) {
  const items = ids.map((id) => findItem(p, id)).filter(Boolean);
  if (!items.length) return [];
  const clip = copyItems(p, ids);
  const level = items[0].kind === "openings" ? (p.walls.find((w) => w.id === items[0].obj.wall) || {}).level : items[0].obj.level;
  const [cx, cy] = clip.centre;
  const out = [];
  const count = Math.max(1, Math.min(500, Math.round(n)));
  for (let k = 1; k <= count; k++) {
    const t = divide ? k / count : k;
    const added = pasteItems(p, clip, level, cx + d[0] * t, cy + d[1] * t);
    liftItems(p, added, d[2] * t);
    out.push(...added);
  }
  return out;
}

// Rotate about an axis through c (absolute mm) by deg. A vertical axis turns
// everything (plan rotation); any other axis tips masses only (they become
// meshes). copies: rotated copies at deg, 2·deg … (a polar array).
export function rotateItems3d(p, ids, c, axis, deg, { copies = 0 } = {}) {
  const a = norm(axis);
  const vertical = Math.abs(a[2]) > 0.999;
  const turn = (list, ang) => {
    if (vertical) { rotateItems(p, list, ang * Math.sign(a[2]), [c[0], c[1]]); return 0; }
    let skipped = 0;
    for (const id of list) {
      const s = p.solids.find((x) => x.id === id);
      if (!s) { skipped++; continue; }
      setSolidMesh(p, s, transformMesh(solidWorldMesh(p, s), (q) => rotatePoint(q, c, a, ang)));
    }
    return skipped;
  };
  if (!copies) return { skipped: turn(ids, deg), ids };
  const out = [];
  let skipped = 0;
  for (let k = 1; k <= Math.min(360, copies); k++) {
    const added = copyItems3d(p, ids, [0, 0, 0]);
    skipped += turn(added, deg * k);
    out.push(...added);
  }
  return { skipped, ids: out };
}

// Scale about the point o (absolute mm) by k = [kx, ky, kz].
export function scaleItems3d(p, ids, o, k) {
  const [kx, ky, kz] = k.map((v) => (Number.isFinite(v) && Math.abs(v) > 1e-6 ? v : 1));
  const set = new Set(ids);
  const rest = [];
  for (const id of ids) {
    const it = findItem(p, id);
    if (!it) continue;
    if (it.kind === "solids") {
      const s = it.obj;
      setSolidMesh(p, s, transformMesh(solidWorldMesh(p, s), ([x, y, z]) => [o[0] + (x - o[0]) * kx, o[1] + (y - o[1]) * ky, o[2] + (z - o[2]) * kz], { mirror: kx * ky * kz < 0 }));
    } else if (it.kind === "furniture") {
      const f = it.obj;
      const e = elevationOf(p, f.level);
      f.x = o[0] + (f.x - o[0]) * kx;
      f.y = o[1] + (f.y - o[1]) * ky;
      const quarter = Math.round(((f.rot || 0) % 180) / 90) % 2 === 1;
      const [ax, ay] = quarter ? [ky, kx] : [kx, ky];
      f.w = Math.max(10, f.w * Math.abs(ax));
      f.d = Math.max(10, f.d * Math.abs(ay));
      f.h = Math.max(1, f.h * Math.abs(kz));
      f.elevation = o[2] + (e + (f.elevation || 0) - o[2]) * kz - e;
    } else rest.push(id);
  }
  // Walls, rooms … scale in plan (uniformly) about o.
  if (rest.length && Math.abs(kx - ky) < 1e-9 && kx > 0) {
    const c = selectionCentre(p, rest);
    if (c) { scaleItems(p, rest, kx); moveItems(p, rest, (c[0] - o[0]) * (kx - 1), (c[1] - o[1]) * (kx - 1)); }
  }
  void set;
  return rest.length;
}

// ---------------------------------------------------------------- sandbox
export function addTerrain(p, level, mesh, { name = "Terrain", material = "grass" } = {}) {
  const s = { id: uid("v"), level, name, material, terrain: true, mesh, z0: 0, height: 1, pts: [], phase: "new" };
  syncMeshSolid(s);
  p.solids.push(s);
  return s;
}

export function terrainFromScratch(p, level, opts) { return addTerrain(p, level, terrainGrid(opts)); }

// Contours: plan lines (drawings) with a height (z, elevation or the
// "Elevation" property) — or, without one, `interval` × their order.
export function terrainFromDrawings(p, ids, { interval = 1000, cell = 1000, level } = {}) {
  const set = new Set(ids);
  const lines = p.drawings.filter((d) => set.has(d.id) && Array.isArray(d.pts) && d.pts.length >= 2);
  if (!lines.length) throw new Error("Select contour lines (polylines) in the plan first.");
  const zOf = (d, i) => {
    for (const v of [d.z, d.elevation, d.props && d.props.Elevation, d.props && d.props.elevation]) if (Number.isFinite(+v) && v !== null && v !== "") return +v;
    return i * interval;
  };
  const contours = lines.map((d, i) => ({ pts: d.pts, z: zOf(d, i), closed: !!d.closed }));
  return addTerrain(p, level || lines[0].level, terrainFromContours(contours, { cell }));
}

export function smooveTerrain(p, id, x, y, radius, dz) {
  const s = p.solids.find((q) => q.id === id);
  if (!s || !s.mesh) return null;
  s.mesh = smoove(s.mesh, x, y, radius, dz);
  syncMeshSolid(s);
  return s;
}

// ---------------------------------------------------------------- section planes, guides, notes
export function addSection(p, o, n, name) {
  for (const s of p.sections) s.active = false;
  const sp = { id: uid("sp"), name: name || `Section ${p.sections.length + 1}`, o: o.slice(), n: norm(n), active: true };
  p.sections.push(sp);
  return sp;
}
export function activateSection(p, id) { for (const s of p.sections) s.active = s.id === id ? !s.active : false; }
export function flipSection(p, id) { const s = p.sections.find((x) => x.id === id); if (s) s.n = s.n.map((v) => (v ? -v : 0)); }
export function moveSection(p, id, d) { const s = p.sections.find((x) => x.id === id); if (s) s.o = add(s.o, mul(s.n, -d)); }

export function addGuide(p, a, b = null) { const g = { id: uid("gl"), a: a.slice(), ...(b ? { b: b.slice() } : {}) }; p.guides.push(g); return g; }
export function addDim3d(p, a, b, off) { const d = { id: uid("d3"), a: a.slice(), b: b.slice(), off: off.slice() }; p.dims3d.push(d); return d; }
export function addText3d(p, at, text, leader = null) { const t = { id: uid("t3"), at: at.slice(), text: String(text), ...(leader ? { leader: leader.slice() } : {}) }; p.texts3d.push(t); return t; }

// Erase anything by id: model items, guides, 3D dimensions and text, section planes.
export function eraseIds(p, ids) {
  const set = new Set(ids);
  const before = p.guides.length + p.dims3d.length + p.texts3d.length + p.sections.length;
  p.guides = p.guides.filter((g) => !set.has(g.id));
  p.dims3d = p.dims3d.filter((g) => !set.has(g.id));
  p.texts3d = p.texts3d.filter((g) => !set.has(g.id));
  p.sections = p.sections.filter((g) => !set.has(g.id));
  const notes = before - (p.guides.length + p.dims3d.length + p.texts3d.length + p.sections.length);
  const items = ids.filter((id) => findItem(p, id));
  if (items.length) deleteItems(p, items);
  return notes + items.length;
}

// Planar distance helper for tools: signed distance of q along n from o.
export const along = (q, o, n) => dot(sub(q, o), n);
export { dist3, faceNormal };
