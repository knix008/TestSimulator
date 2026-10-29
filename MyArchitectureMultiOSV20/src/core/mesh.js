// General polyhedral meshes for SketchUp-style modelling (src/core/csg.js has
// the boolean solid tools). A mass model (project.solids) is either the
// parametric prism it always was ({pts, z0, height, taper}) or, once it has
// been reshaped in 3D, a mesh:
//
//   mesh = { v: [[x, y, z], …]            vertices, mm — plan x, plan y, z up
//                                           from the level floor
//            f: [{ l: [i, …],              outer loop, counter-clockwise seen
//                  h: [[i, …], …]?,        from outside (right-hand rule in
//                  m: "brick"? }, …]        plan coordinates); holes run the
//                                           other way; m = the face's material
//            e: [[i, j], …]? }             loose edges (lines drawn in 3D)
//
// Plan coordinates (x, y, z) map to the three.js world as (x, z, y), which
// swaps the handedness: the 3D builder reverses every triangle (see
// src/view3d/skbuild.js), exactly as build.js does for its prisms.
//
// Everything here is pure and runs in Node (test/unit/mesh.test.mjs).

import { earcut } from "./earcut.js";
import { offsetPolygon, polygonArea, convexHull, pointInPolygon } from "./geom.js";

export const TOL = 1e-3; // mm: points closer than this are the same point

// ---------------------------------------------------------------- vectors
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export function norm(a) { const l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; }

// Newell's normal of a polygon (length = twice its area; counter-clockwise
// about the result by the right-hand rule).
export function newell(pts) {
  let x = 0, y = 0, z = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [x / 2, y / 2, z / 2];
}

// Orthonormal (u, w) in the plane with normal n, u × w = n, so a loop that
// is counter-clockwise about n stays counter-clockwise in (u, w).
export function planeBasis(n) {
  const a = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const u = norm(cross(a, n));
  return { u, w: cross(n, u) };
}
export const to2 = (p, b) => [dot(p, b.u), dot(p, b.w)];

// ---------------------------------------------------------------- mesh basics
export const cloneMesh = (m) => ({ v: m.v.map((p) => p.slice()), f: m.f.map((f) => ({ ...f, l: f.l.slice(), ...(f.h ? { h: f.h.map((x) => x.slice()) } : {}) })), ...(m.e && m.e.length ? { e: m.e.map((x) => x.slice()) } : {}) });
export const loopPts = (m, loop) => loop.map((i) => m.v[i]);
export const faceLoops = (f) => [f.l, ...(f.h || [])];

export function faceNormal(m, fi) {
  const f = typeof fi === "number" ? m.f[fi] : fi;
  return norm(newell(loopPts(m, f.l)));
}
export function faceArea(m, fi) {
  const f = typeof fi === "number" ? m.f[fi] : fi;
  let a = len(newell(loopPts(m, f.l)));
  for (const h of f.h || []) a -= len(newell(loopPts(m, h)));
  return Math.max(0, a);
}
export function faceCentroid(m, fi) {
  const f = typeof fi === "number" ? m.f[fi] : fi;
  const pts = loopPts(m, f.l);
  return mul(pts.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / pts.length);
}

// Clean a mesh read from a file: finite vertices, valid loops; null when
// nothing is left.
export function normalizeMesh(m) {
  if (!m || typeof m !== "object" || !Array.isArray(m.v)) return null;
  const v = m.v.map((p) => (Array.isArray(p) ? [+p[0] || 0, +p[1] || 0, +p[2] || 0] : [0, 0, 0]));
  const ok = (i) => Number.isInteger(i) && i >= 0 && i < v.length;
  const loop = (l) => {
    if (!Array.isArray(l)) return null;
    const out = [];
    for (const i of l) if (ok(i) && out[out.length - 1] !== i) out.push(i);
    while (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
    return out.length >= 3 ? out : null;
  };
  const f = [];
  for (const face of Array.isArray(m.f) ? m.f : []) {
    const l = loop(face && face.l);
    if (!l) continue;
    const g = { l };
    const h = (Array.isArray(face.h) ? face.h : []).map(loop).filter(Boolean);
    if (h.length) g.h = h;
    if (typeof face.m === "string" && face.m) g.m = face.m;
    f.push(g);
  }
  const e = (Array.isArray(m.e) ? m.e : []).filter((x) => Array.isArray(x) && ok(x[0]) && ok(x[1]) && x[0] !== x[1]).map((x) => [x[0], x[1]]);
  if (!f.length && !e.length) return null;
  const out = { v, f };
  if (e.length) out.e = e;
  return compact(out);
}

// Drop vertices nothing uses (indices renumbered).
export function compact(m) {
  const used = new Map();
  const map = (i) => { if (!used.has(i)) used.set(i, used.size); return used.get(i); };
  const f = m.f.map((face) => ({ ...face, l: face.l.map(map), ...(face.h ? { h: face.h.map((h) => h.map(map)) } : {}) }));
  const e = (m.e || []).map(([a, b]) => [map(a), map(b)]);
  const v = new Array(used.size);
  for (const [old, i] of used) v[i] = m.v[old].slice();
  const out = { v, f };
  if (e.length) out.e = e;
  return out;
}

export function meshBounds(m) {
  const b = { x1: Infinity, y1: Infinity, z1: Infinity, x2: -Infinity, y2: -Infinity, z2: -Infinity };
  for (const [x, y, z] of m.v) {
    if (x < b.x1) b.x1 = x; if (y < b.y1) b.y1 = y; if (z < b.z1) b.z1 = z;
    if (x > b.x2) b.x2 = x; if (y > b.y2) b.y2 = y; if (z > b.z2) b.z2 = z;
  }
  if (!m.v.length) return { x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0 };
  return b;
}

// ---------------------------------------------------------------- triangulation
// Triangles of planar loops (outer + holes) as index triples into `pts`
// (every loop concatenated), counter-clockwise about n.
export function triangulateLoops(loops, n) {
  const b = planeBasis(n);
  const flat = [];
  const holes = [];
  const all = [];
  loops.forEach((loop, k) => {
    if (k > 0) holes.push(all.length);
    for (const p of loop) { const q = to2(p, b); flat.push(q[0], q[1]); all.push(p); }
  });
  const idx = earcut(flat, holes);
  const out = [];
  for (let i = 0; i < idx.length; i += 3) {
    let [a, c, d] = [idx[i], idx[i + 1], idx[i + 2]];
    const nn = cross(sub(all[c], all[a]), sub(all[d], all[a]));
    if (dot(nn, n) < 0) [c, d] = [d, c];
    out.push([a, c, d]);
  }
  return out;
}

// Triangles of one face as mesh vertex indices.
export function triangulateFace(m, fi) {
  const f = typeof fi === "number" ? m.f[fi] : fi;
  const loops = faceLoops(f);
  const idx = loops.flat();
  if (f.l.length === 3 && !f.h) return [f.l.slice()];
  const n = faceNormal(m, f);
  if (len(n) === 0) return [];
  return triangulateLoops(loops.map((l) => loopPts(m, l)), n).map((t) => t.map((k) => idx[k]));
}

export function meshTriangles(m) {
  const out = [];
  m.f.forEach((f, fi) => { for (const t of triangulateFace(m, f)) out.push({ t, fi }); });
  return out;
}

// Signed volume (positive when the faces point outwards).
export function meshVolume(m) {
  let vol = 0;
  for (const { t } of meshTriangles(m)) {
    const [a, b, c] = t.map((i) => m.v[i]);
    vol += dot(a, cross(b, c)) / 6;
  }
  return vol;
}

export function meshArea(m) { return m.f.reduce((s, _, i) => s + faceArea(m, i), 0); }

// Directed edge "a,b" → face index (every loop, holes too).
export function directedEdges(m) {
  const map = new Map();
  m.f.forEach((f, fi) => { for (const loop of faceLoops(f)) for (let i = 0; i < loop.length; i++) map.set(`${loop[i]},${loop[(i + 1) % loop.length]}`, fi); });
  return map;
}

// Undirected edges with the faces on them: [{a, b, faces: [fi …]}].
export function meshEdges(m) {
  const map = new Map();
  const put = (a, b, fi) => {
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    let e = map.get(k);
    if (!e) { e = { a: Math.min(a, b), b: Math.max(a, b), faces: [] }; map.set(k, e); }
    if (fi !== null) e.faces.push(fi);
  };
  m.f.forEach((f, fi) => { for (const loop of faceLoops(f)) for (let i = 0; i < loop.length; i++) put(loop[i], loop[(i + 1) % loop.length], fi); });
  for (const [a, b] of m.e || []) put(a, b, null);
  return [...map.values()];
}

// Closed (watertight): every face edge has exactly one opposite edge.
export function isClosed(m) {
  if (!m || !m.f.length) return false;
  const d = directedEdges(m);
  let count = 0;
  for (const f of m.f) for (const loop of faceLoops(f)) count += loop.length;
  if (d.size !== count) return false; // an edge used twice the same way
  for (const k of d.keys()) { const [a, b] = k.split(","); if (!d.has(`${b},${a}`)) return false; }
  return true;
}

// ---------------------------------------------------------------- building meshes
// The parametric mass model as a mesh (same vertices as the 3D prism).
export function prismMesh(pts, z0, z1, taper = 1, material) {
  let ring = dedupe2(pts);
  if (ring.length < 3) return { v: [], f: [] };
  if (polygonArea(ring) < 0) ring = ring.slice().reverse();
  const n = ring.length;
  const v = ring.map(([x, y]) => [x, y, z0]);
  const f = [{ l: [...Array(n).keys()].reverse() }];
  const t = Math.max(0, Math.min(1, taper ?? 1));
  if (t <= 0.001) {
    const cx = ring.reduce((s, q) => s + q[0], 0) / n, cy = ring.reduce((s, q) => s + q[1], 0) / n;
    v.push([cx, cy, z1]);
    for (let i = 0; i < n; i++) f.push({ l: [i, (i + 1) % n, n] });
  } else {
    const cx = ring.reduce((s, q) => s + q[0], 0) / n, cy = ring.reduce((s, q) => s + q[1], 0) / n;
    for (const [x, y] of ring) v.push(t >= 0.999 ? [x, y, z1] : [cx + (x - cx) * t, cy + (y - cy) * t, z1]);
    f.push({ l: [...Array(n).keys()].map((i) => n + i) });
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; f.push({ l: [i, j, n + j, n + i] }); }
  }
  if (material) for (const face of f) face.m = material;
  return { v, f };
}

export const boxMesh = (x, y, z, w, d, h) => prismMesh([[x, y], [x + w, y], [x + w, y + d], [x, y + d]], z, z + h);

function dedupe2(pts) {
  const out = [];
  for (const p of pts || []) {
    const q = [+p[0] || 0, +p[1] || 0];
    const last = out[out.length - 1];
    if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > TOL) out.push(q);
  }
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= TOL) out.pop();
  return out;
}

// The mesh of a mass model (its own mesh, or its prism).
export function solidMesh(s) {
  if (s.mesh && s.mesh.v) return s.mesh;
  return prismMesh(s.pts, s.z0 || 0, (s.z0 || 0) + (s.height || 0), s.taper ?? 1);
}

// One planar face (a surface with no thickness yet) from a 3D loop; it faces
// `towards` when given (else up for horizontal loops).
export function surfaceMesh(loop, { towards = null, material } = {}) {
  const pts = dedupe3(loop);
  if (pts.length < 3) return null;
  let n = newell(pts);
  if (len(n) < TOL) return null;
  const want = towards || (Math.abs(n[2]) > 1e-9 ? [0, 0, 1] : null);
  if (want && dot(n, want) < 0) pts.reverse();
  const f = { l: pts.map((_, i) => i) };
  if (material) f.m = material;
  return { v: pts.map((p) => p.slice()), f: [f] };
}

export function dedupe3(pts) {
  const out = [];
  for (const p of pts || []) {
    const q = [+p[0] || 0, +p[1] || 0, +p[2] || 0];
    if (!out.length || dist3(out[out.length - 1], q) > TOL) out.push(q);
  }
  while (out.length > 1 && dist3(out[0], out[out.length - 1]) <= TOL) out.pop();
  return out;
}

// Join meshes into one (no welding).
export function mergeMeshes(list) {
  const out = { v: [], f: [], e: [] };
  for (const m of list) {
    if (!m) continue;
    const o = out.v.length;
    out.v.push(...m.v.map((p) => p.slice()));
    for (const f of m.f) out.f.push({ ...f, l: f.l.map((i) => i + o), ...(f.h ? { h: f.h.map((h) => h.map((i) => i + o)) } : {}) });
    for (const [a, b] of m.e || []) out.e.push([a + o, b + o]);
  }
  if (!out.e.length) delete out.e;
  return out;
}

// Apply fn([x, y, z]) → [x, y, z] to every vertex; `mirror` reverses the
// loops so faces keep pointing outwards.
export function transformMesh(m, fn, { mirror = false } = {}) {
  const out = cloneMesh(m);
  out.v = out.v.map((p) => fn(p));
  if (mirror) for (const f of out.f) { f.l.reverse(); if (f.h) f.h.forEach((h) => h.reverse()); }
  return out;
}
export const translateMesh = (m, dx, dy, dz) => transformMesh(m, ([x, y, z]) => [x + dx, y + dy, z + dz]);

// Rotate about the axis through `o` along unit `axis` by `deg` degrees
// (right-hand rule in plan coordinates).
export function rotatePoint(p, o, axis, deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const k = norm(axis);
  const v = sub(p, o);
  const r = add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
  return add(o, r);
}
export const rotateMesh = (m, o, axis, deg) => transformMesh(m, (p) => rotatePoint(p, o, axis, deg));

// Weld vertices closer than eps (faces renumbered, degenerate loops dropped).
export function weld(m, eps = TOL) {
  const grid = new Map();
  const v = [];
  const key = (x, y, z) => `${Math.round(x / eps)},${Math.round(y / eps)},${Math.round(z / eps)}`;
  const find = (p) => {
    const cx = Math.round(p[0] / eps), cy = Math.round(p[1] / eps), cz = Math.round(p[2] / eps);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const list = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
      if (list) for (const i of list) if (dist3(v[i], p) <= eps) return i;
    }
    const i = v.length;
    v.push(p.slice());
    const k = key(...p);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
    return i;
  };
  const map = m.v.map(find);
  const loop = (l) => { const out = []; for (const i of l) { const j = map[i]; if (out[out.length - 1] !== j) out.push(j); } while (out.length > 1 && out[0] === out[out.length - 1]) out.pop(); return out; };
  const f = [];
  for (const face of m.f) {
    const l = loop(face.l);
    if (l.length < 3) continue;
    const g = { ...face, l };
    if (face.h) { const h = face.h.map(loop).filter((x) => x.length >= 3); if (h.length) g.h = h; else delete g.h; }
    f.push(g);
  }
  const e = (m.e || []).map(([a, b]) => [map[a], map[b]]).filter(([a, b]) => a !== b);
  const out = { v, f };
  if (e.length) out.e = e;
  return compact(out);
}

// Insert every vertex that lies on a face edge into that edge, so neighbouring
// faces share their edges exactly (no T-junctions).
export function fixTJunctions(m, eps = TOL) {
  const order = m.v.map((_, i) => i).sort((a, b) => m.v[a][0] - m.v[b][0]);
  const xs = order.map((i) => m.v[i][0]);
  const lower = (x) => { let lo = 0, hi = xs.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid] < x) lo = mid + 1; else hi = mid; } return lo; };
  const splitLoop = (loop) => {
    const out = [];
    for (let k = 0; k < loop.length; k++) {
      const ia = loop[k], ib = loop[(k + 1) % loop.length];
      out.push(ia);
      const a = m.v[ia], b = m.v[ib];
      const d = sub(b, a);
      const L2 = dot(d, d);
      if (L2 < eps * eps) continue;
      const hits = [];
      for (let j = lower(Math.min(a[0], b[0]) - eps); j < order.length && xs[j] <= Math.max(a[0], b[0]) + eps; j++) {
        const ic = order[j];
        if (ic === ia || ic === ib) continue;
        const c = m.v[ic];
        if (c[1] < Math.min(a[1], b[1]) - eps || c[1] > Math.max(a[1], b[1]) + eps || c[2] < Math.min(a[2], b[2]) - eps || c[2] > Math.max(a[2], b[2]) + eps) continue;
        const t = dot(sub(c, a), d) / L2;
        if (t <= 1e-9 || t >= 1 - 1e-9) continue;
        if (dist3(c, add(a, mul(d, t))) <= eps) hits.push([t, ic]);
      }
      hits.sort((x, y) => x[0] - y[0]);
      for (const [, ic] of hits) if (out[out.length - 1] !== ic) out.push(ic);
    }
    return out;
  };
  return { ...m, f: m.f.map((f) => ({ ...f, l: splitLoop(f.l), ...(f.h ? { h: f.h.map(splitLoop) } : {}) })) };
}

// Remove vertices that only sit in the middle of a straight edge (two
// neighbours, in line), wherever they are used.
export function simplifyCollinear(m, eps = TOL) {
  let out = m;
  for (let pass = 0; pass < 4; pass++) {
    const nb = new Map();
    const link = (a, b) => { if (!nb.has(a)) nb.set(a, new Set()); nb.get(a).add(b); };
    for (const f of out.f) for (const loop of faceLoops(f)) for (let i = 0; i < loop.length; i++) { const a = loop[i], b = loop[(i + 1) % loop.length]; link(a, b); link(b, a); }
    const pinned = new Set((out.e || []).flat());
    const drop = new Set();
    for (const [v, set] of nb) {
      if (set.size !== 2 || pinned.has(v)) continue;
      const [a, b] = [...set];
      if (drop.has(a) || drop.has(b)) continue;
      const pa = out.v[a], pb = out.v[b], pv = out.v[v];
      const d = sub(pb, pa);
      const L2 = dot(d, d);
      if (L2 < eps * eps) continue;
      const t = dot(sub(pv, pa), d) / L2;
      if (t > 0 && t < 1 && dist3(pv, add(pa, mul(d, t))) <= eps) drop.add(v);
    }
    if (!drop.size) break;
    const strip = (l) => l.filter((i) => !drop.has(i));
    out = { ...out, f: out.f.map((f) => ({ ...f, l: strip(f.l), ...(f.h ? { h: f.h.map(strip) } : {}) })).filter((f) => f.l.length >= 3) };
  }
  return compact(out);
}

// ---------------------------------------------------------------- polygons → mesh
// Polygon soup ({pts, n, m, tag}) to a mesh: weld, then merge coplanar
// neighbours with the same material (and tag) into faces with holes.
export function meshFromPolygons(polys, { eps = TOL } = {}) {
  const soup = { v: [], f: [] };
  for (const p of polys) {
    const o = soup.v.length;
    soup.v.push(...p.pts.map((q) => q.slice()));
    soup.f.push({ l: p.pts.map((_, i) => o + i), n: p.n, m: p.m, tag: p.tag });
  }
  const w = weld(soup, eps);
  const groups = new Map();
  for (const f of w.f) {
    const n = f.n ? norm(f.n) : faceNormal(w, f);
    if (len(n) === 0) continue;
    const d = dot(n, w.v[f.l[0]]);
    const k = `${n.map((x) => Math.round(x * 1e4)).join(",")}|${Math.round(d / (eps * 10))}|${f.m || ""}|${f.tag || ""}`;
    if (!groups.has(k)) groups.set(k, { n, m: f.m, faces: [] });
    groups.get(k).faces.push(f);
  }
  const faces = [];
  for (const g of groups.values()) faces.push(...mergeGroup(w, g, eps));
  let out = compact({ v: w.v, f: faces });
  out = fixTJunctions(out, eps);
  out = simplifyCollinear(out, eps);
  return out;
}

function mergeGroup(m, g, eps) {
  if (g.faces.length === 1) { const f = g.faces[0]; return [{ l: f.l, ...(f.m ? { m: f.m } : {}) }]; }
  // T-junctions inside the group first, so shared edges cancel exactly.
  const local = fixTJunctions({ v: m.v, f: g.faces.map((f) => ({ l: f.l })) }, eps);
  const count = new Map();
  for (const f of local.f) {
    for (let i = 0; i < f.l.length; i++) {
      const a = f.l[i], b = f.l[(i + 1) % f.l.length];
      const rev = `${b},${a}`;
      if ((count.get(rev) || 0) > 0) count.set(rev, count.get(rev) - 1);
      else count.set(`${a},${b}`, (count.get(`${a},${b}`) || 0) + 1);
    }
  }
  const out = new Map();
  for (const [k, c] of count) {
    if (c <= 0) continue;
    const [a, b] = k.split(",").map(Number);
    for (let i = 0; i < c; i++) { if (!out.has(a)) out.set(a, []); out.get(a).push(b); }
  }
  const b2 = planeBasis(g.n);
  const P = (i) => to2(m.v[i], b2);
  const loops = [];
  let guard = 0;
  for (const start of [...out.keys()]) {
    while (out.get(start) && out.get(start).length && guard++ < 100000) {
      const loop = [start];
      let prev = start, cur = out.get(start).pop();
      let safety = 0;
      while (cur !== start && safety++ < 100000) {
        loop.push(cur);
        const cand = out.get(cur);
        if (!cand || !cand.length) break;
        let pick = 0;
        if (cand.length > 1) {
          // Most left turn keeps touching loops apart.
          const [px, py] = P(prev), [cx, cy] = P(cur);
          const din = Math.atan2(cy - py, cx - px);
          let best = -Infinity;
          cand.forEach((nx, i) => {
            const [qx, qy] = P(nx);
            let turn = Math.atan2(qy - cy, qx - cx) - din;
            while (turn <= -Math.PI) turn += 2 * Math.PI;
            while (turn > Math.PI) turn -= 2 * Math.PI;
            if (turn > best) { best = turn; pick = i; }
          });
        }
        const next = cand.splice(pick, 1)[0];
        prev = cur;
        cur = next;
      }
      if (loop.length >= 3) loops.push(loop);
    }
  }
  const area2 = (loop) => polygonArea(loop.map(P));
  const outers = [], holes = [];
  for (const l of loops) { const a = area2(l); if (Math.abs(a) < eps * eps) continue; (a > 0 ? outers : holes).push({ l, a: Math.abs(a), pts: l.map(P) }); }
  const faces = outers.map((o) => ({ l: o.l, h: [], o }));
  for (const h of holes) {
    let best = null;
    for (const f of faces) {
      const inside = h.pts.filter(([x, y]) => pointInPolygon(x, y, f.o.pts)).length;
      if (inside * 2 >= h.pts.length && f.o.a > h.a && (!best || f.o.a < best.o.a)) best = f;
    }
    if (best) best.h.push(h.l);
  }
  return faces.map((f) => ({ l: f.l, ...(f.h.length ? { h: f.h } : {}), ...(g.m ? { m: g.m } : {}) }));
}

// ---------------------------------------------------------------- plan footprint
// The outline of a mesh seen from above: the upward faces when they tile it
// without overlapping, else the convex hull of every vertex.
export function footprint(m) {
  const pts2 = m.v.map((p) => [p[0], p[1]]);
  const hull = () => {
    if (!pts2.length) return [[-5, -5], [5, -5], [5, 5], [-5, 5]];
    const h = convexHull(pts2);
    if (h.length >= 3 && Math.abs(polygonArea(h)) > 1) return h;
    // A vertical surface or a line: a thin box round it.
    const xs = pts2.map((p) => p[0]), ys = pts2.map((p) => p[1]);
    const x1 = Math.min(...xs) - 5, x2 = Math.max(...xs) + 5, y1 = Math.min(...ys) - 5, y2 = Math.max(...ys) + 5;
    return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
  };
  const ups = [];
  let sum = 0;
  for (const f of m.f) {
    const n = newell(loopPts(m, f.l));
    if (n[2] <= 1e-6 * Math.max(1, len(n))) continue;
    const loops = faceLoops(f).map((l) => l.map((i) => [m.v[i][0], m.v[i][1], 0]));
    for (const t of triangulateLoops(loops, [0, 0, 1])) {
      const flat = loops.flat();
      const tri = t.map((k) => flat[k]);
      const a = polygonArea(tri);
      if (a <= 1e-6) continue;
      ups.push({ pts: tri, n: [0, 0, 1] });
      sum += a;
    }
  }
  if (!ups.length) return hull();
  const flat = meshFromPolygons(ups);
  let best = null, total = 0;
  for (const f of flat.f) {
    const a = Math.abs(polygonArea(f.l.map((i) => [flat.v[i][0], flat.v[i][1]])));
    total += a - (f.h || []).reduce((s, h) => s + Math.abs(polygonArea(h.map((i) => [flat.v[i][0], flat.v[i][1]]))), 0);
    if (!best || a > best.a) best = { a, f };
  }
  if (!best || Math.abs(total - sum) > Math.max(1, sum * 1e-4)) return hull();
  const ring = best.f.l.map((i) => [flat.v[i][0], flat.v[i][1]]);
  return polygonArea(ring) < 0 ? ring.reverse() : ring;
}

// ---------------------------------------------------------------- push / pull
// Faces that use vertex i (index → list of face indices).
function vertexFaces(m) {
  const map = new Map();
  m.f.forEach((f, fi) => { for (const loop of faceLoops(f)) for (const i of loop) { if (!map.has(i)) map.set(i, new Set()); map.get(i).add(fi); } });
  return map;
}

// Can the face be pushed by just moving its vertices (every other face that
// touches it is perpendicular, so it only stretches)? → {ok, depth}: depth
// is how far it can be pushed in before the solid collapses.
export function stretchInfo(m, fi) {
  const f = m.f[fi];
  const n = faceNormal(m, fi);
  const own = new Set(faceLoops(f).flat());
  const vf = vertexFaces(m);
  const d = directedEdges(m);
  for (const loop of faceLoops(f)) for (let i = 0; i < loop.length; i++) if (!d.has(`${loop[(i + 1) % loop.length]},${loop[i]}`)) return { ok: false };
  const p0 = m.v[f.l[0]];
  let depth = Infinity;
  for (const i of own) {
    for (const gi of vf.get(i) || []) {
      if (gi === fi) continue;
      if (Math.abs(dot(faceNormal(m, gi), n)) > 1e-6) return { ok: false };
      for (const loop of faceLoops(m.f[gi])) for (const j of loop) if (!own.has(j)) depth = Math.min(depth, dot(sub(p0, m.v[j]), n));
    }
  }
  return { ok: true, depth };
}

// A face with none of its edges shared (a lone surface).
export function isLoneFace(m, fi) {
  const d = directedEdges(m);
  for (const loop of faceLoops(m.f[fi])) for (let i = 0; i < loop.length; i++) if (d.has(`${loop[(i + 1) % loop.length]},${loop[i]}`)) return false;
  return true;
}

// Move a face's vertices by d along its normal (the neighbours stretch).
export function stretchFace(m, fi, d) {
  const out = cloneMesh(m);
  const n = faceNormal(m, fi);
  for (const i of new Set(faceLoops(m.f[fi]).flat())) out.v[i] = add(out.v[i], mul(n, d));
  return out;
}

// Extrude a face by d along its normal with new side faces. The face is
// replaced by its moved copy; a lone face also keeps itself (turned over) as
// the bottom, so a drawn rectangle becomes a closed box.
export function extrudeFace(m, fi, d) {
  if (!d) return cloneMesh(m);
  const out = cloneMesh(m);
  const f = out.f[fi];
  const n = faceNormal(m, fi);
  const lone = isLoneFace(m, fi);
  const off = mul(n, d);
  const moved = new Map();
  const mv = (i) => { if (!moved.has(i)) { moved.set(i, out.v.length); out.v.push(add(out.v[i], off)); } return moved.get(i); };
  const top = { ...f, l: f.l.map(mv), ...(f.h ? { h: f.h.map((h) => h.map(mv)) } : {}) };
  const sides = [];
  for (const loop of faceLoops(f)) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      // Outwards for a bump (d > 0) and into the hole for a recess (d < 0).
      sides.push({ l: [a, b, mv(b), mv(a)], ...(f.m ? { m: f.m } : {}) });
    }
  }
  const flip = (g) => ({ ...g, l: g.l.slice().reverse(), ...(g.h ? { h: g.h.map((h) => h.slice().reverse()) } : {}) });
  const faces = out.f.filter((_, i) => i !== fi);
  if (lone) {
    const orig = { ...f, l: f.l.slice(), ...(f.h ? { h: f.h.map((h) => h.slice()) } : {}) };
    // Pulled out: the original turns over into the bottom. Pushed back: the
    // original stays the front and the moved copy is the back.
    if (d > 0) faces.push(flip(orig), top, ...sides);
    else faces.push(orig, flip(top), ...sides.map(flip));
  } else faces.push(top, ...sides);
  out.f = faces;
  // Fix the winding of a closed result that came out inside out.
  if (isClosed(out) && meshVolume(out) < 0) for (const g of out.f) { g.l.reverse(); if (g.h) g.h.forEach((h) => h.reverse()); }
  return out;
}

// ---------------------------------------------------------------- offset
// A loop inside a face, d inwards (d < 0 outwards, only on a lone face): the
// face becomes a ring around a new inner face.
export function offsetFace(m, fi, d) {
  const f = m.f[fi];
  if (!d) return null;
  const n = faceNormal(m, fi);
  const b = planeBasis(n);
  const outer = loopPts(m, f.l);
  const p0 = outer[0];
  const h0 = dot(p0, n);
  const ring2 = outer.map((p) => to2(p, b));
  const inner2 = offsetPolygon(ring2, d);
  if (!validOffset(ring2, inner2, d)) return null;
  if (d > 0 && (f.h || []).some((h) => h.some((i) => !pointInPolygon(...to2(m.v[i], b), inner2)))) return null;
  if (d < 0 && !isLoneFace(m, fi)) return null;
  const from2 = ([x, y]) => add(add(mul(b.u, x), mul(b.w, y)), mul(n, h0));
  const out = cloneMesh(m);
  const idx = inner2.map((q) => { out.v.push(from2(q)); return out.v.length - 1; });
  const g = out.f[fi];
  if (d > 0) {
    const inner = { l: idx, ...(g.h ? { h: g.h } : {}), ...(g.m ? { m: g.m } : {}) };
    out.f[fi] = { ...g, h: [idx.slice().reverse()] };
    out.f.push(inner);
    return { mesh: out, face: out.f.length - 1 };
  }
  // Outwards round a lone face: a ring outside it.
  out.f.push({ l: idx, h: [g.l.slice().reverse()], ...(g.m ? { m: g.m } : {}) });
  return { mesh: out, face: out.f.length - 1 };
}

function validOffset(ring, inner, d) {
  if (inner.length !== ring.length) return false;
  const a0 = polygonArea(ring), a1 = polygonArea(inner);
  if (Math.sign(a0) !== Math.sign(a1) || Math.abs(a1) < 1) return false;
  if (d > 0 && Math.abs(a1) >= Math.abs(a0)) return false;
  if (d < 0 && Math.abs(a1) <= Math.abs(a0)) return false;
  const n = inner.length;
  // Every edge keeps its direction (an offset past the middle turns them round).
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = ring[j][0] - ring[i][0], ey = ring[j][1] - ring[i][1];
    const fx = inner[j][0] - inner[i][0], fy = inner[j][1] - inner[i][1];
    if (ex * fx + ey * fy <= 0) return false;
  }
  // No self-intersection of the new loop.
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segCross(inner[i], inner[(i + 1) % n], inner[j], inner[(j + 1) % n])) return false;
    }
  }
  if (d > 0) return inner.every(([x, y]) => pointInPolygon(x, y, ring));
  return ring.every(([x, y]) => pointInPolygon(x, y, inner));
}

function segCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b) && o(a, b, c) !== 0 && o(a, b, d) !== 0;
}

// ---------------------------------------------------------------- drawing on faces
// Distance of p from the face's plane.
export function planeDistance(m, fi, p) {
  const n = faceNormal(m, fi);
  return dot(sub(p, m.v[m.f[fi].l[0]]), n);
}

// Is p (on the plane) inside the face (outer loop, outside its holes)?
export function insideFace(m, fi, p, tol = TOL) {
  const f = m.f[fi];
  const n = faceNormal(m, fi);
  const b = planeBasis(n);
  const q = to2(p, b);
  const ring = loopPts(m, f.l).map((x) => to2(x, b));
  if (!pointInPolygon(q[0], q[1], ring) && !onRing(q, ring, tol)) return false;
  for (const h of f.h || []) { const hr = loopPts(m, h).map((x) => to2(x, b)); if (pointInPolygon(q[0], q[1], hr) && !onRing(q, hr, tol)) return false; }
  return true;
}

function onRing(q, ring, tol) {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], c = ring[(i + 1) % ring.length];
    const dx = c[0] - a[0], dy = c[1] - a[1];
    const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2));
    if (Math.hypot(q[0] - a[0] - dx * t, q[1] - a[1] - dy * t) <= tol) return true;
  }
  return false;
}

// Draw a closed loop inside a face: it becomes a new face and a hole in the
// old one (so it can be pushed or pulled on its own). → {mesh, face} or null.
export function imprintLoop(m, fi, loop, tol = 1) {
  const pts = dedupe3(loop);
  if (pts.length < 3) return null;
  const n = faceNormal(m, fi);
  if (pts.some((p) => Math.abs(planeDistance(m, fi, p)) > tol)) return null;
  const f = m.f[fi];
  const b = planeBasis(n);
  const ring = loopPts(m, f.l).map((x) => to2(x, b));
  const loop2 = pts.map((p) => to2(p, b));
  if (!loop2.every(([x, y]) => pointInPolygon(x, y, ring)) || loop2.some((q) => onRing(q, ring, tol))) return null;
  for (const h of f.h || []) { const hr = loopPts(m, h).map((x) => to2(x, b)); if (loop2.some(([x, y]) => pointInPolygon(x, y, hr))) return null; }
  if (polygonArea(loop2) < 0) { pts.reverse(); loop2.reverse(); }
  const out = cloneMesh(m);
  const h0 = dot(m.v[f.l[0]], n);
  const idx = pts.map((p) => { out.v.push(add(p, mul(n, h0 - dot(p, n)))); return out.v.length - 1; });
  const g = out.f[fi];
  // Old holes that fall inside the new loop move to the new face.
  const keep = [], move = [];
  for (const h of g.h || []) (loopPts(out, h).every((x) => { const q = to2(x, b); return pointInPolygon(q[0], q[1], loop2); }) ? move : keep).push(h);
  out.f[fi] = { ...g, h: [...keep, idx.slice().reverse()] };
  out.f.push({ l: idx, ...(move.length ? { h: move } : {}), ...(g.m ? { m: g.m } : {}) });
  return { mesh: out, face: out.f.length - 1 };
}

// Split a face along a path whose two ends lie on its outer edge (a line
// drawn across a face). → {mesh, faces: [a, b]} or null.
export function splitFace(m, fi, path, tol = 1) {
  const pts = dedupe3(path);
  if (pts.length < 2) return null;
  if (pts.some((p) => Math.abs(planeDistance(m, fi, p)) > tol)) return null;
  let out = cloneMesh(m);
  const n = faceNormal(m, fi);
  const h0 = dot(m.v[m.f[fi].l[0]], n);
  const onPlane = (p) => add(p, mul(n, h0 - dot(p, n)));
  // Put an end point into the outer loop (and into the neighbour on that edge).
  const attach = (p) => {
    const f = out.f[fi];
    for (const i of f.l) if (dist3(out.v[i], p) <= tol) return i;
    for (let k = 0; k < f.l.length; k++) {
      const ia = f.l[k], ib = f.l[(k + 1) % f.l.length];
      const a = out.v[ia], c = out.v[ib];
      const d = sub(c, a);
      const t = dot(sub(p, a), d) / (dot(d, d) || 1);
      if (t <= 0 || t >= 1 || dist3(add(a, mul(d, t)), p) > tol) continue;
      const ni = out.v.length;
      out.v.push(add(a, mul(d, t)));
      for (const g of out.f) {
        for (const loop of faceLoops(g)) {
          for (let j = 0; j < loop.length; j++) {
            const x = loop[j], y = loop[(j + 1) % loop.length];
            if ((x === ia && y === ib) || (x === ib && y === ia)) { loop.splice(j + 1, 0, ni); break; }
          }
        }
      }
      return ni;
    }
    return -1;
  };
  const ia = attach(pts[0]);
  const ib = attach(pts[pts.length - 1]);
  if (ia < 0 || ib < 0 || ia === ib) return null;
  const mid = pts.slice(1, -1).map((p) => { out.v.push(onPlane(p)); return out.v.length - 1; });
  const f = out.f[fi];
  if (mid.some((i) => !insideFace(out, fi, out.v[i], tol))) return null;
  const L = f.l;
  const pa = L.indexOf(ia), pb = L.indexOf(ib);
  const arc = (from, to) => { const r = []; for (let k = from; ; k = (k + 1) % L.length) { r.push(L[k]); if (k === to) break; } return r; };
  const loopA = [...arc(pa, pb), ...mid.slice().reverse()];
  const loopB = [...arc(pb, pa), ...mid];
  if (loopA.length < 3 || loopB.length < 3) return null;
  const b = planeBasis(n);
  const holesA = [], holesB = [];
  for (const h of f.h || []) {
    const q = to2(out.v[h[0]], b);
    (pointInPolygon(q[0], q[1], loopA.map((i) => to2(out.v[i], b))) ? holesA : holesB).push(h);
  }
  const fa = { ...f, l: loopA, ...(holesA.length ? { h: holesA } : {}) };
  const fb = { ...f, l: loopB, ...(holesB.length ? { h: holesB } : {}) };
  if (!holesA.length) delete fa.h;
  if (!holesB.length) delete fb.h;
  out.f[fi] = fa;
  out.f.push(fb);
  if (faceArea(out, fi) < tol || faceArea(out, out.f.length - 1) < tol) return null;
  return { mesh: out, faces: [fi, out.f.length - 1] };
}

// ---------------------------------------------------------------- follow me
// Sweep a profile (outer loop, then holes; 3D points) along a path of 3D
// points (closed: back to the start). Corners are mitred: each ring is the
// previous one slid along the segment onto the bisecting plane, so nothing
// twists. → closed mesh (throws on a path that doubles back on itself).
export function followMe(profile, path, { closed = false, material } = {}) {
  let loops = (Array.isArray(profile[0][0]) ? profile : [profile]).map(dedupe3).filter((l) => l.length >= 3);
  if (!loops.length) throw new Error("profile needs three points");
  let P = dedupe3(path);
  if (!closed && path.length >= 2 && dist3(path[0], path[path.length - 1]) <= TOL) closed = true;
  if (P.length < (closed ? 3 : 2)) throw new Error("path too short");
  // Drop path points where the path runs straight on.
  const straight = (a, b, c) => len(cross(norm(sub(b, a)), norm(sub(c, b)))) < 1e-9 && dot(sub(b, a), sub(c, b)) > 0;
  P = P.filter((p, i) => {
    if (!closed && (i === 0 || i === P.length - 1)) return true;
    return !straight(P[(i - 1 + P.length) % P.length], p, P[(i + 1) % P.length]);
  });
  const nSeg = closed ? P.length : P.length - 1;
  const dir = [];
  for (let i = 0; i < nSeg; i++) dir.push(norm(sub(P[(i + 1) % P.length], P[i])));
  const d0 = dir[0];
  // Outer loop counter-clockwise about the first direction, holes the other way.
  loops = loops.map((l, k) => { const s = dot(newell(l), d0); if (Math.abs(s) < 1e-9) throw new Error("the profile is edge-on to the path"); return (k === 0) === (s > 0) ? l : l.slice().reverse(); });
  const slide = (ring, d, at, nrm) => ring.map((q) => {
    const den = dot(d, nrm);
    if (Math.abs(den) < 1e-6) throw new Error("the path turns back on itself");
    return add(q, mul(d, dot(sub(at, q), nrm) / den));
  });
  const mitre = (i) => { const a = dir[(i - 1 + nSeg) % nSeg], b = dir[i % nSeg]; const s = add(a, b); if (len(s) < 1e-6) throw new Error("the path turns back on itself"); return norm(s); };
  const ringsOf = (loop) => {
    const rings = [];
    rings.push(slide(loop, d0, P[0], closed ? mitre(0) : d0));
    for (let i = 1; i < P.length; i++) {
      const nrm = !closed && i === P.length - 1 ? dir[nSeg - 1] : mitre(i);
      rings.push(slide(rings[i - 1], dir[i - 1], P[i], nrm));
    }
    return rings;
  };
  const all = loops.map(ringsOf);
  const v = [];
  const index = all.map((rings) => rings.map((r) => r.map((p) => { v.push(p); return v.length - 1; })));
  const f = [];
  const fm = material ? { m: material } : {};
  for (const rings of index) {
    const count = rings.length;
    const segs = closed ? count : count - 1;
    for (let s = 0; s < segs; s++) {
      const A = rings[s], B = rings[(s + 1) % count];
      for (let j = 0; j < A.length; j++) { const k = (j + 1) % A.length; f.push({ l: [A[j], A[k], B[k], B[j]], ...fm }); }
    }
  }
  if (!closed) {
    const first = index.map((rings) => rings[0]);
    const last = index.map((rings) => rings[rings.length - 1]);
    f.push({ l: first[0].slice().reverse(), ...(first.length > 1 ? { h: first.slice(1).map((h) => h.slice().reverse()) } : {}), ...fm });
    f.push({ l: last[0].slice(), ...(last.length > 1 ? { h: last.slice(1).map((h) => h.slice()) } : {}), ...fm });
  }
  let out = { v, f };
  // Quads that came out twisted or flat are split into triangles.
  out.f = out.f.flatMap((g) => {
    if (g.l.length !== 4 || g.h) return [g];
    const p = loopPts(out, g.l);
    const nn = norm(newell(p));
    const flat = p.every((q) => Math.abs(dot(sub(q, p[0]), nn)) < 1e-6 * Math.max(1, dist3(p[0], p[2])));
    if (flat) return [g];
    return [{ ...g, l: [g.l[0], g.l[1], g.l[2]] }, { ...g, l: [g.l[0], g.l[2], g.l[3]] }];
  }).filter((g) => len(newell(loopPts(out, g.l))) > 1e-9);
  out = weld(out);
  if (meshVolume(out) < 0) for (const g of out.f) { g.l.reverse(); if (g.h) g.h.forEach((h) => h.reverse()); }
  return out;
}

// ---------------------------------------------------------------- sandbox (terrain)
// A triangulated grid: nx × ny cells over w × d from (x0, y0); z(i, j) or a
// flat list of (nx + 1)(ny + 1) heights, row by row.
export function terrainGrid({ x0 = 0, y0 = 0, w = 20000, d = 20000, nx = 20, ny = 20, z = 0, material = "grass" } = {}) {
  nx = Math.max(1, Math.min(200, Math.round(nx)));
  ny = Math.max(1, Math.min(200, Math.round(ny)));
  const v = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = x0 + (w * i) / nx, y = y0 + (d * j) / ny;
      const h = typeof z === "function" ? z(x, y, i, j) : Array.isArray(z) ? +z[j * (nx + 1) + i] || 0 : +z || 0;
      v.push([x, y, h]);
    }
  }
  const at = (i, j) => j * (nx + 1) + i;
  const f = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), e = at(i, j + 1);
      f.push({ l: [a, b, c], m: material }, { l: [a, c, e], m: material });
    }
  }
  return { v, f };
}

// Terrain from contour lines [{pts: [[x, y] …], z}]: each grid point takes the
// height between the two nearest contours of different heights, weighted by
// how close it is to each.
export function terrainFromContours(contours, { cell = 1000, margin = 2000, material = "grass" } = {}) {
  const lines = contours.filter((c) => c && Array.isArray(c.pts) && c.pts.length >= 2 && Number.isFinite(+c.z));
  if (!lines.length) throw new Error("no contour lines");
  const xs = lines.flatMap((c) => c.pts.map((p) => p[0])), ys = lines.flatMap((c) => c.pts.map((p) => p[1]));
  const x0 = Math.min(...xs) - margin, y0 = Math.min(...ys) - margin;
  const w = Math.max(...xs) + margin - x0, d = Math.max(...ys) + margin - y0;
  const nx = Math.max(2, Math.min(120, Math.round(w / cell))), ny = Math.max(2, Math.min(120, Math.round(d / cell)));
  const segDist = (x, y, pts, closed) => {
    let best = Infinity;
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
      best = Math.min(best, Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t));
    }
    return best;
  };
  const z = (x, y) => {
    const ds = lines.map((c) => ({ d: segDist(x, y, c.pts, !!c.closed), z: +c.z })).sort((a, b) => a.d - b.d);
    const a = ds[0];
    if (a.d < 1e-6) return a.z;
    const b = ds.find((q) => q.z !== a.z);
    if (!b) return a.z;
    return (a.z * b.d + b.z * a.d) / (a.d + b.d);
  };
  return terrainGrid({ x0, y0, w, d, nx, ny, z, material });
}

// Smoove: raise (dz > 0) or lower the vertices within `radius` of (x, y) on a
// smooth bell, full at the centre and nothing at the edge.
export function smoove(m, x, y, radius, dz) {
  const out = cloneMesh(m);
  if (!(radius > 0) || !dz) return out;
  for (const p of out.v) {
    const r = Math.hypot(p[0] - x, p[1] - y);
    if (r < radius) p[2] += (dz * (1 + Math.cos((Math.PI * r) / radius))) / 2;
  }
  return out;
}

// Height of a terrain (or any mesh seen from above) at (x, y), or null.
export function heightAt(m, x, y) {
  let best = null;
  for (const { t } of meshTriangles(m)) {
    const [a, b, c] = t.map((i) => m.v[i]);
    const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(den) < 1e-9) continue;
    const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den;
    const l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / den;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    const z = l1 * a[2] + l2 * b[2] + l3 * c[2];
    if (best === null || z > best) best = z;
  }
  return best;
}
