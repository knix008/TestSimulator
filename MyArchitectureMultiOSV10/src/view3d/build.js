// Builds the 3D building from the project with three.js.
//
// World frame: metres. X = plan x, Z = plan y (so the top view looks like the
// plan with −Z up the screen), Y = up. Plan values are millimetres, hence the
// 0.001 factor (M) everywhere below.
//
// Walls are solid prisms of their mitred outline, cut into pieces around
// openings (below the sill, above the head), so the walls really have holes.
// Every mesh carries userData {id, kind, level} for picking and selection.

import { wallOutlines, slicePoly, openingSpans, wallFrame } from "../core/walls.js";
import { wallLength, wallHeight, levelById, levelAbove } from "../core/project.js";
import { triangulate, polygonArea, rotPt } from "../core/geom.js";
import { roofModel, roofBase } from "../core/roof.js";
import { furnitureParts, lightOf } from "../lib/furniture.js";
import { materialById, materialColor, paintPattern, DEFAULT_MATERIAL } from "../lib/materials.js";
import { phaseVisible } from "../plan/render.js";

export const M = 0.001;

// ---------------------------------------------------------------- geometry accumulator
// Collects triangles with normals and world-planar UVs (metres), then makes
// one BufferGeometry. UVs: horizontal faces use (x, z); vertical faces use
// (along the face, y), so patterns keep their real size on every surface.
class Geo {
  constructor() { this.pos = []; this.nor = []; this.uv = []; }
  tri(a, b, c) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) return;
    nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      if (Math.abs(ny) > 0.7) this.uv.push(p[0], p[2]);
      else {
        // Along the face: project on the horizontal tangent.
        const tx = -nz, tz = nx;
        const tl = Math.hypot(tx, tz) || 1;
        this.uv.push((p[0] * tx + p[2] * tz) / tl, p[1]);
      }
    }
  }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
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

// Plan point (mm) + height (mm) → world [x, y, z] (m).
const W = (x, y, z) => [x * M, z * M, y * M];

// Vertical prism of a plan polygon between heights z0 and z1 (mm).
function prism(geo, pts, z0, z1) {
  if (pts.length < 3 || z1 - z0 < 0.01) return;
  let ring = pts;
  // Counter-clockwise in plan maths axes (x, y) ↔ outward side normals below.
  if (polygonArea(ring) < 0) ring = ring.slice().reverse();
  const tris = triangulate(ring);
  for (const [i, j, k] of tris) {
    // Top faces up (+Y): plan (x, y) ↦ world (x, z) flips the handedness.
    geo.tri(W(...ring[i], z1), W(...ring[k], z1), W(...ring[j], z1));
    geo.tri(W(...ring[i], z0), W(...ring[j], z0), W(...ring[k], z0));
  }
  // Sides wound so their normals point out of the counter-clockwise ring.
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    geo.quad(W(...b, z0), W(...a, z0), W(...a, z1), W(...b, z1));
  }
}

// A prism whose top is the base scaled about its centroid by `taper`
// (1 = straight, 0 = a pyramid / cone).
function taperedPrism(geo, pts, z0, z1, taper) {
  if (taper >= 0.999) { prism(geo, pts, z0, z1); return; }
  let ring = pts;
  if (polygonArea(ring) < 0) ring = ring.slice().reverse();
  const n = ring.length;
  const cx = ring.reduce((s, q) => s + q[0], 0) / n, cy = ring.reduce((s, q) => s + q[1], 0) / n;
  const top = ring.map(([x, y]) => [cx + (x - cx) * taper, cy + (y - cy) * taper]);
  for (const [i, j, k] of triangulate(ring)) {
    geo.tri(W(...ring[i], z0), W(...ring[j], z0), W(...ring[k], z0));
    if (taper > 0.001) geo.tri(W(...top[i], z1), W(...top[k], z1), W(...top[j], z1));
  }
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n], ta = top[i], tb = top[(i + 1) % n];
    if (taper > 0.001) geo.quad(W(...b, z0), W(...a, z0), W(...ta, z1), W(...tb, z1));
    else geo.tri(W(...b, z0), W(...a, z0), W(cx, cy, z1));
  }
}

// A slab under a sloped / arbitrary planar polygon of 3D points (mm): the top
// is the polygon itself, the bottom the same shifted down by `th`.
function slab3d(geo, pts, th) {
  if (pts.length < 3) return;
  // Triangulate in plan, keep the given z values.
  const plan = pts.map((p) => [p[0], p[1]]);
  let order = pts;
  if (polygonArea(plan) < 0) order = pts.slice().reverse();
  const tris = triangulate(order.map((p) => [p[0], p[1]]));
  const top = (p) => W(p[0], p[1], p[2]);
  const bot = (p) => W(p[0], p[1], p[2] - th);
  for (const [i, j, k] of tris) {
    geo.tri(top(order[i]), top(order[k]), top(order[j]));
    geo.tri(bot(order[i]), bot(order[j]), bot(order[k]));
  }
  for (let i = 0; i < order.length; i++) {
    const a = order[i], b = order[(i + 1) % order.length];
    geo.quad(bot(b), bot(a), top(a), top(b));
  }
}

// A vertical planar polygon (gable end) extruded across `th` along its normal.
function planarWall(geo, pts, th) {
  const a = pts[0], b = pts[1];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  const nx = (-dy / L) * th / 2, ny = (dx / L) * th / 2;
  const f = pts.map((p) => [p[0] + nx, p[1] + ny, p[2]]);
  const k = pts.map((p) => [p[0] - nx, p[1] - ny, p[2]]);
  const n = pts.length;
  for (let i = 1; i + 1 < n; i++) {
    geo.tri(W(...f[0]), W(...f[i]), W(...f[i + 1]));
    geo.tri(W(...k[0]), W(...k[i + 1]), W(...k[i]));
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    geo.quad(W(...f[i]), W(...k[i]), W(...k[j]), W(...f[j]));
  }
}

// ---------------------------------------------------------------- materials
export function makeMaterials(THREE, { textures = true } = {}) {
  const cache = new Map();
  const texCache = new Map();
  const texture = (m) => {
    if (!textures || !m || !m.pattern || typeof document === "undefined") return null;
    if (texCache.has(m.id)) return texCache.get(m.id);
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    paintPattern(c.getContext("2d"), m, 256);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    // UVs are in metres; one tile covers m.tile millimetres.
    tx.repeat.set(1000 / (m.tile || 1000), 1000 / (m.tile || 1000));
    tx.anisotropy = 4;
    texCache.set(m.id, tx);
    return tx;
  };
  const get = (key, make) => {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
  };
  return {
    surface(id, fallback) {
      const m = materialById(id);
      const color = materialColor(id, fallback);
      return get(`s:${id}:${color}`, () => {
        if (id === "glass") return new THREE.MeshStandardMaterial({ color, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.35, side: THREE.DoubleSide, name: "glass" });
        const mat = new THREE.MeshStandardMaterial({ color: texture(m) ? 0xffffff : color, map: texture(m), roughness: m && m.pattern === "seams" ? 0.45 : 0.85, metalness: m && m.pattern === "seams" ? 0.4 : 0, side: THREE.DoubleSide, name: id || color });
        return mat;
      });
    },
    color(hex, opts = {}) {
      return get(`c:${hex}:${opts.rough ?? ""}:${opts.metal ?? ""}:${opts.opacity ?? ""}`, () => new THREE.MeshStandardMaterial({
        color: hex, roughness: opts.rough ?? 0.7, metalness: opts.metal ?? 0, transparent: (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1, side: (opts.opacity ?? 1) < 1 ? THREE.DoubleSide : THREE.FrontSide, name: hex,
      }));
    },
    // A lit lamp part: its own colour glowing in the light's colour.
    glow(hex, light, strength = 1) {
      return get(`g:${hex}:${light}:${strength}`, () => new THREE.MeshStandardMaterial({ color: hex, emissive: light, emissiveIntensity: GLOW * strength, roughness: 0.4, name: `glow ${light}` }));
    },
    glass() { return get("glass", () => new THREE.MeshStandardMaterial({ color: 0xa9d4e8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, name: "glass" })); },
    frame() { return get("frame", () => new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.5, name: "frame" })); },
    door() { return get("door", () => new THREE.MeshStandardMaterial({ color: 0xb0835a, roughness: 0.6, name: "door" })); },
    dispose() { for (const m of cache.values()) m.dispose(); for (const t of texCache.values()) t.dispose(); cache.clear(); texCache.clear(); },
  };
}

// ---------------------------------------------------------------- pieces
function boxInWall(THREE, w, mat, u, v, z, su, sv, sz) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1e-4, su * M), Math.max(1e-4, sz * M), Math.max(1e-4, sv * M)), mat);
  const f = wallFrame(w);
  const x = w.x1 + f.d[0] * u + f.n[0] * v;
  const y = w.y1 + f.d[1] * u + f.n[1] * v;
  mesh.position.set(x * M, (z + sz / 2) * M, y * M);
  mesh.rotation.y = -Math.atan2(f.d[1], f.d[0]);
  return mesh;
}

function openingMeshes(THREE, mats, w, s, base, opts) {
  const o = s.o;
  const g = new THREE.Group();
  const t = w.thickness;
  const fw = 60; // frame member width
  const z0 = base + o.sill;
  const z1 = z0 + o.height;
  const uc = (s.u1 + s.u2) / 2;
  const width = s.u2 - s.u1;
  const frame = mats.frame();
  if (o.kind === "opening") return g;
  // Frame: jambs and head (and a sill for windows).
  const depth = Math.min(t, o.kind === "window" ? 90 : t);
  g.add(boxInWall(THREE, w, frame, s.u1 + fw / 2, 0, z0, fw, depth, o.height));
  g.add(boxInWall(THREE, w, frame, s.u2 - fw / 2, 0, z0, fw, depth, o.height));
  g.add(boxInWall(THREE, w, frame, uc, 0, z1 - fw, width, depth, fw));
  if (o.kind === "window") {
    g.add(boxInWall(THREE, w, frame, uc, 0, z0, width, depth, fw));
    // Outside sill on the face opposite to the opening side.
    g.add(boxInWall(THREE, w, mats.color("#d9d6cf", { rough: 0.8 }), uc, -(o.side || 1) * (t / 2 + 10), z0 - 30, width + 80, 60, 30));
    const glass = boxInWall(THREE, w, mats.glass(), uc, 0, z0 + fw, width - 2 * fw, 12, o.height - 2 * fw);
    glass.userData.glass = true;
    g.add(glass);
    if (o.type !== "fixed" && width > 900) g.add(boxInWall(THREE, w, frame, uc, 0, z0 + fw, 50, depth * 0.8, o.height - 2 * fw));
    if (o.type === "sliding") g.add(boxInWall(THREE, w, frame, uc, 25, z0 + fw, 40, depth * 0.6, o.height - 2 * fw));
    return g;
  }
  // Doors.
  const leafT = 40;
  const leafH = o.height - fw;
  const leafMat = o.type === "garage" ? mats.color("#c7ccd2", { rough: 0.5, metal: 0.3 }) : mats.door();
  if (o.type === "garage") {
    for (let k = 0; k < 4; k++) g.add(boxInWall(THREE, w, leafMat, uc, 0, z0 + (k * leafH) / 4 + 5, width - 2 * fw, leafT, leafH / 4 - 10));
    return g;
  }
  if (o.type === "sliding") {
    const half = (width - 2 * fw) / 2;
    const glassLeaf = (u, v) => {
      g.add(boxInWall(THREE, w, frame, u, v, z0, half + 40, 50, leafH));
      const gl = boxInWall(THREE, w, mats.glass(), u, v, z0 + 60, half - 80, 14, leafH - 120);
      g.add(gl);
    };
    glassLeaf(s.u1 + fw + half / 2, 25);
    glassLeaf(s.u2 - fw - half / 2, -25);
    return g;
  }
  const open = opts.openDoors ? (75 * Math.PI) / 180 : 0;
  const leaf = (hingeU, len, dir) => {
    // Pivot at the hinge on the swing-side face, leaf closed along ±u.
    const f = wallFrame(w);
    const side = o.side || 1;
    const v = side * (t / 2 - leafT / 2);
    const hx = w.x1 + f.d[0] * hingeU + f.n[0] * v;
    const hy = w.y1 + f.d[1] * hingeU + f.n[1] * v;
    const pivot = new THREE.Group();
    pivot.position.set(hx * M, z0 * M, hy * M);
    pivot.rotation.y = -Math.atan2(f.d[1], f.d[0]);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len * M, leafH * M, leafT * M), leafMat);
    m.position.set((dir * len * M) / 2, (leafH * M) / 2, 0);
    // Door handle.
    const hdl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.07), mats.color("#9aa0a6", { rough: 0.3, metal: 0.8 }));
    hdl.position.set(dir * (len - 70) * M, 1.0, 0); // 1 m above the threshold
    pivot.add(m, hdl);
    // Local +z is the wall's left normal; a positive turn about y swings +x
    // towards −z, so the sign makes the leaf open towards `side`.
    pivot.rotateY(-open * dir * side);
    g.add(pivot);
  };
  const inner = width - 2 * fw;
  if (o.type === "double") { leaf(s.u1 + fw, inner / 2, 1); leaf(s.u2 - fw, inner / 2, -1); }
  else if (o.hinge === "end") leaf(s.u2 - fw, inner, -1);
  else leaf(s.u1 + fw, inner, 1);
  return g;
}

// Material of a lamp part that glows when the lamp is on (shared with the
// viewer, which swaps it on a switch without rebuilding the model).
export const GLOW = 2.2;
export function glowMaterial(mats, part, light) {
  if (light && light.on) return mats.glow(part.color, light.color, part.g);
  return mats.color(part.c === "bulb" ? "#9a968c" : part.color, { rough: 0.6 });
}

// A lamp's light source is not a three.js light here: an empty "lamp" anchor
// at the bulb carries what the viewer needs ({id, type, lumens, colour, on,
// beam, dir}), and the viewer lights only the nearest few (see lamps.js).
function furnitureGroup(THREE, mats, f) {
  const g = new THREE.Group();
  const light = lightOf(f);
  for (const part of furnitureParts(f)) {
    const glassy = part.c === "glass";
    const metal = part.c === "metal";
    let mat = glassy ? mats.color(part.color, { opacity: 0.35, rough: 0.1 }) : mats.color(part.color, { rough: metal ? 0.35 : 0.75, metal: metal ? 0.7 : 0 });
    if (light && part.g) mat = glowMaterial(mats, part, light);
    let mesh;
    if (part.t === "box") {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1e-4, part.w * M), Math.max(1e-4, part.h * M), Math.max(1e-4, part.d * M)), mat);
      mesh.position.set(part.x * M, (part.z + part.h / 2) * M, part.y * M);
    } else if (part.t === "cyl") {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 28), mat);
      mesh.scale.set(Math.max(1e-4, part.rx * M), Math.max(1e-4, part.h * M), Math.max(1e-4, part.ry * M));
      mesh.position.set(part.x * M, (part.z + part.h / 2) * M, part.y * M);
    } else {
      mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(part.r * M, 2), mat);
      mesh.position.set(part.x * M, part.z * M, part.y * M);
    }
    mesh.castShadow = !glassy && !part.g;
    mesh.receiveShadow = true;
    if (light && part.g) mesh.userData.glow = { color: part.color, c: part.c, g: part.g };
    g.add(mesh);
  }
  if (light) {
    const a = new THREE.Object3D();
    a.name = "lamp";
    const [x, y, z] = light.at;
    a.position.set(x * M, z * M, y * M);
    const [dx, dy, dz] = light.dir;
    a.userData.lamp = { id: f.id, type: light.type, on: light.on, lumens: light.lumens, color: light.color, beam: light.beam, dir: [dx, dz, dy] };
    g.add(a);
  }
  return g;
}

// ---------------------------------------------------------------- whole model
// opts: {openDoors, furniture, roofs, levels: Set|null (visible), phase:
// "all"|"new"|"existing", loadModel(asset) → Promise<Object3D>}
export function buildBuilding(THREE, p, mats, opts = {}) {
  const vis = (it) => phaseVisible(it, opts.phase || "all");
  // Demolished elements in the "all" view: translucent red.
  const demolish = mats.color("#e0524a", { opacity: 0.35, rough: 0.8 });
  const phaseMat = (it, m) => (it.phase === "demolish" && (opts.phase || "all") === "all" ? demolish : m);
  const root = new THREE.Group();
  root.name = "building";
  const tag = (obj, id, kind, level) => { obj.userData = { ...obj.userData, id, kind, level }; obj.traverse((c) => { if (c.isMesh) { c.userData.id = id; c.userData.kind = kind; c.userData.level = level; } }); return obj; };
  const shadow = (mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; return mesh; };
  for (const lv of p.levels) {
    const lg = new THREE.Group();
    lg.name = `level:${lv.name}`;
    lg.userData = { level: lv.id };
    root.add(lg);
    const base = lv.elevation;
    const walls = p.walls.filter((w) => w.level === lv.id && vis(w));
    const outlines = wallOutlines(walls);
    // ---- walls (with openings cut out)
    for (const w of walls) {
      const ol = outlines.get(w.id);
      if (!ol) continue;
      const H = wallHeight(p, w);
      const geo = new Geo();
      const spans = openingSpans(p, w);
      let from = -1e9;
      for (const s of spans) {
        prism(geo, slicePoly(w, ol.poly, from, s.u1), base, base + H);
        const piece = slicePoly(w, ol.poly, s.u1, s.u2);
        if (s.o.sill > 0) prism(geo, piece, base, base + Math.min(H, s.o.sill));
        const head = s.o.sill + s.o.height;
        if (head < H) prism(geo, piece, base + head, base + H);
        from = s.u2;
      }
      prism(geo, slicePoly(w, ol.poly, from, 1e9), base, base + H);
      if (geo.empty) continue;
      // A typed wall shows its outside finish (the first layer) unless painted over.
      const wt = w.type ? (p.wallTypes || []).find((x) => x.id === w.type) : null;
      const mat = w.material || (wt ? wt.layers[0].material : DEFAULT_MATERIAL.wall);
      const mesh = shadow(new THREE.Mesh(geo.build(THREE), phaseMat(w, mats.surface(mat, "#ece8e1"))));
      mesh.name = `wall ${w.id}`;
      lg.add(tag(mesh, w.id, "walls", lv.id));
      for (const s of spans) {
        if (!vis(s.o)) continue;
        const og = openingMeshes(THREE, mats, w, s, base, opts);
        og.name = `${s.o.kind} ${s.o.id}`;
        og.traverse((c) => { if (c.isMesh && !c.userData.glass) { c.castShadow = true; c.receiveShadow = true; } });
        lg.add(tag(og, s.o.id, "openings", lv.id));
      }
    }
    // ---- floors under rooms
    for (const r of p.rooms.filter((x) => x.level === lv.id && vis(x))) {
      const geo = new Geo();
      prism(geo, r.pts, base - Math.max(20, lv.slab || 0), base);
      const mesh = new THREE.Mesh(geo.build(THREE), mats.surface(r.floor || DEFAULT_MATERIAL.floor, "#c49a6c"));
      mesh.receiveShadow = true;
      mesh.name = `floor ${r.name || r.id}`;
      lg.add(tag(mesh, r.id, "rooms", lv.id));
    }
    // ---- columns
    for (const c of p.columns.filter((x) => x.level === lv.id && vis(x))) {
      const H = c.height || lv.height;
      let mesh;
      if (c.shape === "round") {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 32), mats.surface(c.material || "concrete", "#a7a7a2"));
        mesh.scale.set((c.w / 2) * M, H * M, (c.d / 2) * M);
        mesh.position.set(c.x * M, (base + H / 2) * M, c.y * M);
      } else {
        const geo = new Geo();
        const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const [x, y] = rotPt((a * c.w) / 2, (b * c.d) / 2, c.rot || 0); return [c.x + x, c.y + y]; });
        prism(geo, pts, base, base + H);
        mesh = new THREE.Mesh(geo.build(THREE), mats.surface(c.material || "concrete", "#a7a7a2"));
      }
      lg.add(tag(shadow(mesh), c.id, "columns", lv.id));
    }
    // ---- stairs
    for (const s of p.stairs.filter((x) => x.level === lv.id && vis(x))) {
      const above = levelAbove(p, lv.id);
      const rise = above ? above.elevation - lv.elevation : lv.height;
      const geo = new Geo();
      const run = s.length / s.steps;
      for (let i = 0; i < s.steps; i++) {
        const u0 = -s.length / 2 + i * run;
        const pts = [[u0, -s.width / 2], [u0 + run, -s.width / 2], [u0 + run, s.width / 2], [u0, s.width / 2]].map(([u, v]) => { const [x, y] = rotPt(u, v, s.rot || 0); return [s.x + x, s.y + y]; });
        const top = ((i + 1) * rise) / s.steps;
        prism(geo, pts, base + Math.max(0, top - Math.max(180, rise / s.steps) - 120), base + top);
      }
      const mesh = shadow(new THREE.Mesh(geo.build(THREE), mats.surface(s.material || "oak", "#c49a6c")));
      lg.add(tag(mesh, s.id, "stairs", lv.id));
    }
    // ---- furniture
    if (opts.furniture !== false) {
      for (const f of p.furniture.filter((x) => x.level === lv.id && vis(x))) {
        let g;
        if (f.kind === "model") {
          g = new THREE.Group();
          const asset = p.models.find((m) => m.id === f.model);
          const ph = new THREE.Mesh(new THREE.BoxGeometry(f.w * M, f.h * M, f.d * M), mats.color("#8a9bb0", { opacity: 0.4 }));
          ph.position.y = (f.h * M) / 2;
          g.add(ph);
          if (asset && opts.loadModel) {
            opts.loadModel(asset).then((obj) => {
              if (!obj) return;
              const inst = obj.clone();
              const sz = asset.size || [1000, 1000, 1000];
              inst.scale.set(f.w / sz[0], f.h / sz[2], f.d / sz[1]);
              g.remove(ph);
              ph.geometry.dispose();
              g.add(inst);
              tag(g, f.id, "furniture", lv.id);
              inst.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
              if (opts.onAsync) opts.onAsync();
            }).catch(() => {});
          }
        } else g = furnitureGroup(THREE, mats, f);
        const lamp = g.getObjectByName("lamp");
        if (lamp) lamp.userData.lamp.floor = base * M; // the section cut keeps lamps whose floor is below it
        g.position.set(f.x * M, (base + (f.elevation || 0)) * M, f.y * M);
        g.rotation.y = (-(f.rot || 0) * Math.PI) / 180;
        g.name = `${f.kind} ${f.id}`;
        lg.add(tag(g, f.id, "furniture", lv.id));
      }
    }
    // ---- mass models (solids)
    if (opts.solids !== false) {
      for (const s of (p.solids || []).filter((x) => x.level === lv.id && vis(x))) {
        const geo = new Geo();
        taperedPrism(geo, s.pts, base + (s.z0 || 0), base + (s.z0 || 0) + s.height, s.taper ?? 1);
        const mesh = shadow(new THREE.Mesh(geo.build(THREE), phaseMat(s, mats.surface(s.material || "concrete", "#a7a7a2"))));
        mesh.name = `mass ${s.name || s.id}`;
        lg.add(tag(mesh, s.id, "solids", lv.id));
      }
    }
    // ---- roofs
    if (opts.roofs !== false) {
      for (const r of p.roofs.filter((x) => x.level === lv.id && vis(x))) {
        const m = roofModel(r, roofBase(p, r));
        const geo = new Geo();
        for (const f of m.faces) slab3d(geo, f.pts, r.thickness || 200);
        const mesh = shadow(new THREE.Mesh(geo.build(THREE), mats.surface(r.material || DEFAULT_MATERIAL.roof, "#9b4a3a")));
        mesh.name = `roof ${r.id}`;
        lg.add(tag(mesh, r.id, "roofs", lv.id));
        if (m.gables.length) {
          const gg = new Geo();
          const wallT = Math.max(150, ...p.walls.filter((w) => w.level === lv.id).map((w) => w.thickness), 0);
          // The gable stops under the roof slab instead of cutting through it.
          const base = roofBase(p, r);
          for (const gb of m.gables) planarWall(gg, gb.pts.map(([x, y, z]) => [x, y, z > base + 1 ? z - (r.thickness || 200) : z]), wallT);
          const gm = shadow(new THREE.Mesh(gg.build(THREE), mats.surface(r.gableMaterial || DEFAULT_MATERIAL.wall, "#ece8e1")));
          lg.add(tag(gm, r.id, "roofs", lv.id));
        }
      }
    }
    if (opts.levels && !opts.levels.has(lv.id)) lg.visible = false;
  }
  return root;
}

// Size of the whole model in metres (for framing, ground plane, sun).
export function modelExtent(p) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, top = 0;
  const add = (x, y) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); };
  for (const w of p.walls) { add(w.x1, w.y1); add(w.x2, w.y2); const lv = levelById(p, w.level); top = Math.max(top, (lv ? lv.elevation : 0) + wallHeight(p, w)); }
  for (const r of [...p.rooms, ...p.roofs]) for (const [x, y] of r.pts) add(x, y);
  for (const f of [...p.furniture, ...p.columns, ...p.stairs]) {
    add(f.x, f.y);
    const lv = levelById(p, f.level);
    const z = (lv ? lv.elevation : 0) + (f.elevation || 0) + (f.h || f.height || (lv ? lv.height : 0));
    top = Math.max(top, z);
  }
  for (const r of p.roofs) top = Math.max(top, roofModel(r, roofBase(p, r)).peak);
  for (const s of p.solids || []) {
    for (const [x, y] of s.pts) add(x, y);
    const lv = levelById(p, s.level);
    top = Math.max(top, (lv ? lv.elevation : 0) + (s.z0 || 0) + s.height);
  }
  if (!Number.isFinite(x1)) return { x1: -5000, y1: -5000, x2: 5000, y2: 5000, top: 3000 };
  return { x1, y1, x2, y2, top };
}

export { wallLength };
