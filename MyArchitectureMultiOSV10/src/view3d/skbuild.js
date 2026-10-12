// three.js objects for the SketchUp-style model (src/core/skmodel.js):
// mass models from their mesh (one mesh per material, each with a face map so
// the 3D tools know which face was hit), loose edges, component instances
// and components glued into walls. Used by build.js.
//
// Plan (x, y, z mm) → world (x, z, y m), which swaps the handedness, so every
// triangle is emitted reversed (as build.js does for its prisms).

import { pullForward } from "./depth.js";
import { solidMesh, triangulateFace, isClosed } from "../core/mesh.js";
import { componentById, instanceScale, tagOf } from "../core/skmodel.js";
import { wallFrame } from "../core/walls.js";

const M = 0.001;
const Wz = (p, base) => [p[0] * M, (p[2] + base) * M, p[1] * M];

// Triangles with normals and world-planar UVs in metres (as build.js's Geo).
class Geo {
  constructor() { this.pos = []; this.nor = []; this.uv = []; }
  tri(a, b, c) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) return false;
    nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      if (Math.abs(ny) > 0.7) this.uv.push(p[0], p[2]);
      else { const tx = -nz, tz = nx, tl = Math.hypot(tx, tz) || 1; this.uv.push((p[0] * tx + p[2] * tz) / tl, p[1]); }
    }
    return true;
  }
  get empty() { return this.pos.length === 0; }
  build(THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

// Hidden items and items on a tag the view switches off are left out.
export function skVisible(it, opts = {}) {
  if (!it || it.hidden) return false;
  const h = opts.hiddenTags; // an array of tag ids (or a Set)
  if (!h) return true;
  return !(Array.isArray(h) ? h.includes(tagOf(it)) : h.has(tagOf(it)));
}

// A mesh as three.js meshes, one per material; userData.faceMap[triangle] =
// face index, userData.material = the material id.
export function meshObjects(THREE, mats, mesh, { base = 0, material = "concrete", matFn = null } = {}) {
  const groups = new Map();
  mesh.f.forEach((f, fi) => {
    const key = f.m || material;
    if (!groups.has(key)) groups.set(key, { geo: new Geo(), faces: [] });
    const g = groups.get(key);
    for (const [a, b, c] of triangulateFace(mesh, fi)) if (g.geo.tri(Wz(mesh.v[a], base), Wz(mesh.v[c], base), Wz(mesh.v[b], base))) g.faces.push(fi);
  });
  const out = [];
  for (const [key, g] of groups) {
    if (g.geo.empty) continue;
    const m = new THREE.Mesh(g.geo.build(THREE), matFn ? matFn(key) : mats.surface(key, "#a7a7a2"));
    m.userData.faceMap = g.faces;
    m.userData.material = key;
    out.push(m);
  }
  return out;
}

// Loose edges (lines drawn in 3D): visible, never picked (the 3D tools snap to them).
function edgeLines(THREE, mesh, base) {
  if (!mesh.e || !mesh.e.length) return null;
  const pos = [];
  for (const [a, b] of mesh.e) pos.push(...Wz(mesh.v[a], base), ...Wz(mesh.v[b], base));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const l = new THREE.LineSegments(g, pullForward(new THREE.LineBasicMaterial({ color: 0x1d2128 })));
  l.raycast = () => {};
  l.userData.looseEdges = true;
  return l;
}

// A mass model (prism or mesh) at the level floor `base` (mm).
export function buildSolid(THREE, mats, s, base, phaseMat = (_, m) => m) {
  const mesh = solidMesh(s);
  const g = new THREE.Group();
  g.name = `mass ${s.name || s.id}`;
  const open = !!s.mesh && !isClosed(mesh); // a surface or a terrain: no inside to fill in a section
  for (const m of meshObjects(THREE, mats, mesh, { base, material: s.material || "concrete", matFn: (k) => phaseMat(s, mats.surface(k, "#a7a7a2")) })) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.name = `mass ${s.name || s.id}`;
    if (open) m.userData.open = true;
    g.add(m);
  }
  const lines = edgeLines(THREE, mesh, base);
  if (lines) g.add(lines);
  return g;
}

// A component instance in local metres, scaled; the caller places it like
// any furniture group (position, turn).
// `cache` (a Map for one level of one build): instances of the same definition
// and material share their geometries, so the viewer can draw them as
// instances. Within one build only: the store edits definitions in place.
export function buildComponent(THREE, mats, p, f, cache = null) {
  const g = new THREE.Group();
  const def = componentById(p, f.comp);
  if (!def) {
    const ph = new THREE.Mesh(new THREE.BoxGeometry(f.w * M, f.h * M, f.d * M), mats.color("#8a9bb0", { opacity: 0.4 }));
    ph.position.y = (f.h * M) / 2;
    g.add(ph);
    return g;
  }
  const [sx, sy, sz] = instanceScale(def, f);
  const inner = new THREE.Group();
  inner.scale.set(sx, sz, sy);
  inner.userData.comp = def.id;
  const ck = `${def.id}|${f.material || "plaster"}`;
  let parts = cache && cache.get(ck);
  if (parts) parts = parts.map((s) => { const m = new THREE.Mesh(s.geometry, s.material); m.userData = { ...s.userData }; return m; });
  else {
    parts = meshObjects(THREE, mats, def.mesh, { material: f.material || "plaster" });
    if (cache) cache.set(ck, parts.map((m) => ({ geometry: m.geometry, material: m.material, userData: { ...m.userData } })));
  }
  for (const m of parts) { m.castShadow = true; m.receiveShadow = true; m.userData.comp = def.id; inner.add(m); }
  g.add(inner);
  g.userData.comp = def.id;
  return g;
}

// A component glued into a wall (an opening with comp): fills the hole.
export function buildOpeningComponent(THREE, mats, p, w, span, base) {
  const o = span.o;
  const def = componentById(p, o.comp);
  const g = new THREE.Group();
  if (!def) return g;
  const f = wallFrame(w);
  const uc = (span.u1 + span.u2) / 2;
  g.position.set((w.x1 + f.d[0] * uc) * M, (base + (o.sill || 0)) * M, (w.y1 + f.d[1] * uc) * M);
  g.rotation.y = -Math.atan2(f.d[1], f.d[0]);
  const inner = new THREE.Group();
  inner.scale.set((span.u2 - span.u1) / def.size[0], o.height / def.size[2], 1);
  if (o.side === -1) inner.rotation.y = Math.PI; // faces the other side of the wall
  for (const m of meshObjects(THREE, mats, def.mesh, { material: "plaster" })) { m.castShadow = true; m.receiveShadow = true; m.userData.comp = def.id; inner.add(m); }
  g.add(inner);
  g.userData.comp = def.id;
  return g;
}
