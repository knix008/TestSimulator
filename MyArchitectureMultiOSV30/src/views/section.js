// 2D drawings generated from the BIM model: sections, elevations, ceiling
// plans (looking up) and axonometric line views.
//
// The generator works on the very triangles the 3D view shows (buildBuilding
// in src/view3d/build.js), so every kind of element the model can hold —
// walls, slabs, roofs, stairs, columns, furniture and whatever kinds are added
// later — is cut and projected without any change here. Each mesh carries
// userData {id, kind, level}; its material name is the material id.
//
//   1. Triangles go into the view frame: x2 along the view to the right, y2
//      down the screen, depth into the screen (millimetres).
//   2. Cut (poché): every triangle crossing the cut plane gives a segment;
//      the segments of one mesh chain into closed loops. Layered walls are
//      split into one strip per layer (detail level "fine").
//   3. Hidden lines: the part of the model behind the cut plane is drawn into
//      a depth buffer (the poché "caps" too, in front of everything). Every
//      triangle edge and loop edge is then walked in steps of under a pixel:
//      a step is drawn when the edge is not behind the buffer and the two
//      sides of it are different surfaces (another material, a crease of more
//      than 20°, a step in depth, or empty space). Seams between coplanar
//      pieces of the same material and triangulation diagonals vanish.
//   4. Collinear pieces are merged into long segments.
//
// Pure: no DOM. Node unit tests run it with the vendored three.js.

import { buildBuilding, makeMaterials } from "../view3d/build.js";
import { clipHalfPlane } from "../core/geom.js";
import { wallFrame } from "../core/walls.js";

const M = 0.001;
const CUT_OFFSET = 0.37; // mm: keeps the cut plane off faces that sit exactly on it
const CREASE = Math.cos((20 * Math.PI) / 180);

let threeP = null;
export function loadThree() { return threeP || (threeP = import("../vendor/three/three.module.js")); }

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// Category of a model element for visibility overrides: the collection name,
// except that openings split into doors / windows and lamps are "lights".
export function categoryOf(p, kind, id) {
  if (kind === "openings") {
    const o = (p.openings || []).find((x) => x.id === id);
    return o ? (o.kind === "window" ? "windows" : o.kind === "door" ? "doors" : "openings") : "openings";
  }
  if (kind === "furniture") {
    const f = (p.furniture || []).find((x) => x.id === id);
    if (f && /light|lamp|pendant|spot|downlight|sconce/i.test(f.kind || "")) return "lights";
  }
  return kind || "other";
}

// ---------------------------------------------------------------- frames
// frame: {o, r (screen right), dn (screen down), d (into the screen), cut
// (depth of the cut plane or null), near, far} — all in plan millimetres
// (x, y plan, z up).
export function sectionFrame(line, flip = false, far = 1e6) {
  let [ax, ay, bx, by] = [line.x1, line.y1, line.x2, line.y2];
  if (flip) [ax, ay, bx, by] = [bx, by, ax, ay];
  const L = Math.hypot(bx - ax, by - ay) || 1;
  const dx = (bx - ax) / L, dy = (by - ay) / L;
  // Looking to the left of A → B (north for a line drawn eastwards).
  return { o: [ax, ay, 0], r: [dx, dy, 0], dn: [0, 0, -1], d: [dy, -dx, 0], cut: 0, near: 0, far, length: L };
}

// An elevation looks along `angle` (degrees, plan atan2 with y down: 0 = east,
// 90 = south, -90 = north) from the marker point.
export function elevationFrame(x, y, angle, far = 1e6, near = 0) {
  const a = (angle * Math.PI) / 180;
  const d = [Math.cos(a), Math.sin(a), 0];
  return { o: [x, y, 0], r: [-d[1], d[0], 0], dn: [0, 0, -1], d, cut: 0, near, far };
}

// Ceiling plan: a horizontal cut at `z` looking up, drawn the way the plan is
// (reflected ceiling plan convention).
export function ceilingFrame(z, far = 4000) {
  return { o: [0, 0, z], r: [1, 0, 0], dn: [0, 1, 0], d: [0, 0, 1], cut: 0, near: 0, far };
}

// A plan seen from above, cut at `z` (used for plan callouts of 3D-only kinds).
export function planFrame(z, far = 1e6) {
  return { o: [0, 0, z], r: [1, 0, 0], dn: [0, 1, 0], d: [0, 0, -1], cut: 0, near: 0, far };
}

// Axonometric from a 3D camera {pos, target} (three.js metres, Y up).
export function axoFrame(camera, centre = [0, 0, 0]) {
  const pos = camera && camera.pos ? camera.pos : [1, 1, 1];
  const tg = camera && camera.target ? camera.target : [0, 0, 0];
  // three (X, Y up, Z) → plan (x = X, y = Z, z = Y)
  const d = norm3([(tg[0] - pos[0]), (tg[2] - pos[2]), (tg[1] - pos[1])]);
  let r = [-d[1], d[0], 0];
  if (Math.hypot(r[0], r[1]) < 1e-6) r = [1, 0, 0];
  r = norm3(r);
  const up = norm3([0 - d[0] * d[2], 0 - d[1] * d[2], 1 - d[2] * d[2]]);
  return { o: centre, r, dn: [-up[0], -up[1], -up[2]], d, cut: null, near: -1e9, far: 1e9 };
}

// ---------------------------------------------------------------- model triangles
// → {pos: Float64Array (9 per triangle, plan mm), tri: Int32Array (item per
//    triangle), items: [{id, kind, cat, level, mat}]}
export function modelTriangles(THREE, p, { phase = "all", furniture = true, hidden = null } = {}) {
  const mats = makeMaterials(THREE, { textures: false });
  const root = buildBuilding(THREE, p, mats, { openDoors: false, furniture, roofs: true, solids: true, phase });
  root.updateMatrixWorld(true);
  const pos = [];
  const tri = [];
  const items = [];
  const v = new THREE.Vector3();
  root.traverseVisible((mesh) => {
    if (!mesh.isMesh || !mesh.geometry) return;
    const ud = mesh.userData || {};
    const cat = categoryOf(p, ud.kind, ud.id);
    if (hidden && hidden.has(cat)) return;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    let name = (mat && mat.name) || "";
    if (/^glow /.test(name)) name = "lamp";
    const item = items.length;
    items.push({ id: ud.id || null, kind: ud.kind || "other", cat, level: ud.level || null, mat: name || ud.kind || "other" });
    const g = mesh.geometry;
    const pa = g.getAttribute("position");
    if (!pa) return;
    const idx = g.index;
    const n = idx ? idx.count : pa.count;
    const m = mesh.matrixWorld;
    const vert = (i) => { v.fromBufferAttribute(pa, i).applyMatrix4(m); pos.push(v.x / M, v.z / M, v.y / M); };
    for (let i = 0; i + 2 < n; i += 3) {
      if (idx) { vert(idx.getX(i)); vert(idx.getX(i + 1)); vert(idx.getX(i + 2)); }
      else { vert(i); vert(i + 1); vert(i + 2); }
      tri.push(item);
    }
  });
  root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  mats.dispose();
  return { pos: Float64Array.from(pos), tri: Int32Array.from(tri), items };
}

// ---------------------------------------------------------------- loops
// Chain segments [ax, ay, bx, by] into closed loops (and open chains).
export function chainSegments(segs) {
  const key = (x, y) => `${Math.round(x * 64)},${Math.round(y * 64)}`;
  const ends = new Map();
  const add = (k, i) => { let l = ends.get(k); if (!l) ends.set(k, (l = [])); l.push(i); };
  segs.forEach((s, i) => { add(key(s[0], s[1]), i); add(key(s[2], s[3]), i); });
  const used = new Uint8Array(segs.length);
  const loops = [], open = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const pts = [[segs[i][0], segs[i][1]], [segs[i][2], segs[i][3]]];
    const startK = key(segs[i][0], segs[i][1]);
    let closed = false;
    for (let guard = 0; guard < segs.length + 2; guard++) {
      const last = pts[pts.length - 1];
      const k = key(last[0], last[1]);
      if (k === startK && pts.length > 2) { pts.pop(); closed = true; break; }
      const next = (ends.get(k) || []).find((j) => !used[j]);
      if (next === undefined) break;
      used[next] = 1;
      const s = segs[next];
      if (key(s[0], s[1]) === k) pts.push([s[2], s[3]]); else pts.push([s[0], s[1]]);
    }
    // Drop repeated and collinear points.
    const clean = [];
    for (const q of pts) { const l = clean[clean.length - 1]; if (!l || Math.abs(l[0] - q[0]) > 1e-6 || Math.abs(l[1] - q[1]) > 1e-6) clean.push(q); }
    if (closed) {
      const out = [];
      for (let k = 0; k < clean.length; k++) {
        const a = clean[(k - 1 + clean.length) % clean.length], b = clean[k], c = clean[(k + 1) % clean.length];
        const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (Math.abs(cr) > 1e-6 * (Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1]) + 1)) out.push(b);
      }
      if (out.length >= 3) loops.push(out);
    } else if (clean.length >= 2) open.push(clean);
  }
  return { loops, open };
}

function clipRect(pts, c) {
  let q = clipHalfPlane(pts, [0, 0], [1, 0], c.x1);
  if (q.length) q = clipHalfPlane(q, [0, 0], [-1, 0], -c.x2);
  if (q.length) q = clipHalfPlane(q, [0, 0], [0, 1], c.y1);
  if (q.length) q = clipHalfPlane(q, [0, 0], [0, -1], -c.y2);
  return q;
}

// Split a cut loop of a layered wall into one polygon per layer.
// v(x2, y2) — the wall's left offset of a point on the cut plane — is linear.
function wallLayerStrips(loop, w, wt, frame, cutD) {
  const f = wallFrame(w);
  const vAt = (x2, y2) => {
    const P = [frame.o[0] + frame.r[0] * x2 + frame.dn[0] * y2 + frame.d[0] * cutD, frame.o[1] + frame.r[1] * x2 + frame.dn[1] * y2 + frame.d[1] * cutD];
    return (P[0] - w.x1) * f.n[0] + (P[1] - w.y1) * f.n[1];
  };
  const v0 = vAt(0, 0);
  const vx = vAt(1, 0) - v0, vy = vAt(0, 1) - v0;
  const out = [];
  let top = w.thickness / 2;
  const flat = Math.hypot(vx, vy) < 1e-9;
  wt.layers.forEach((layer, i) => {
    const bot = top - layer.thickness;
    let q = loop;
    if (flat) { if (!(v0 <= top + 1e-6 && v0 >= bot - 1e-6)) q = []; }
    else {
      if (i > 0) q = clipHalfPlane(q, [0, 0], [-vx, -vy], -(top - v0));
      if (q.length && i < wt.layers.length - 1) q = clipHalfPlane(q, [0, 0], [vx, vy], bot - v0);
    }
    if (q.length >= 3) out.push({ pts: q, mat: layer.material, layer: i, fn: layer.function });
    top = bot;
  });
  return out;
}

// ---------------------------------------------------------------- generator
// generate(p, model, frame, opts) → {
//   frame, bounds {x1, y1, x2, y2}, px,
//   cut: [{pts, mat, kind, cat, id, layer?}]   (poché polygons, view mm)
//   lines: [{x1, y1, x2, y2, cls: "cut" | "proj"}],
//   items: Map id → {x1, y1, x2, y2, kind, cut: bool}   (for tags)
// }
// opts: {crop, res (pixels on the long side, default 2000), detail
// ("coarse" | "medium" | "fine")}
export function generate(p, model, frame, opts = {}) {
  const detail = opts.detail || "medium";
  const res = opts.res || 2000;
  const { pos, tri, items } = model;
  const nT = tri.length;
  const o = frame.o, r = frame.r, dn = frame.dn, d = frame.d;
  // View coordinates of every vertex.
  const V = new Float64Array(nT * 9);
  for (let i = 0; i < nT * 3; i++) {
    const x = pos[i * 3] - o[0], y = pos[i * 3 + 1] - o[1], z = pos[i * 3 + 2] - o[2];
    V[i * 3] = x * r[0] + y * r[1] + z * r[2];
    V[i * 3 + 1] = x * dn[0] + y * dn[1] + z * dn[2];
    V[i * 3 + 2] = x * d[0] + y * d[1] + z * d[2];
  }
  const hasCut = frame.cut !== null && frame.cut !== undefined;
  const cutD = hasCut ? frame.cut + CUT_OFFSET : -Infinity;
  const near = hasCut ? cutD : frame.near ?? -Infinity;
  const far = frame.far ?? Infinity;
  const crop = opts.crop || null;

  // ---- cut segments per item
  const segsBy = new Map();
  if (hasCut) {
    const ip = (i, j) => {
      // Canonical order so both triangles sharing an edge get the same point.
      let a = i, b = j;
      if (V[a * 3] > V[b * 3] || (V[a * 3] === V[b * 3] && (V[a * 3 + 1] > V[b * 3 + 1] || (V[a * 3 + 1] === V[b * 3 + 1] && V[a * 3 + 2] > V[b * 3 + 2])))) [a, b] = [b, a];
      const fa = V[a * 3 + 2] - cutD, fb = V[b * 3 + 2] - cutD;
      const t = fa / (fa - fb);
      return [V[a * 3] + (V[b * 3] - V[a * 3]) * t, V[a * 3 + 1] + (V[b * 3 + 1] - V[a * 3 + 1]) * t];
    };
    for (let k = 0; k < nT; k++) {
      const i0 = k * 3, i1 = i0 + 1, i2 = i0 + 2;
      const s0 = V[i0 * 3 + 2] >= cutD, s1 = V[i1 * 3 + 2] >= cutD, s2 = V[i2 * 3 + 2] >= cutD;
      if (s0 === s1 && s1 === s2) continue;
      const pts = [];
      if (s0 !== s1) pts.push(ip(i0, i1));
      if (s1 !== s2) pts.push(ip(i1, i2));
      if (s2 !== s0) pts.push(ip(i2, i0));
      if (pts.length !== 2) continue;
      const it = tri[k];
      let l = segsBy.get(it);
      if (!l) segsBy.set(it, (l = []));
      l.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
    }
  }
  const wallById = new Map((p.walls || []).map((w) => [w.id, w]));
  const typeById = new Map((p.wallTypes || []).map((t) => [t.id, t]));
  const cut = [];
  const openCut = [];
  for (const [it, segs] of segsBy) {
    const item = items[it];
    const { loops, open } = chainSegments(segs);
    for (const ch of open) openCut.push(ch);
    for (let loop of loops) {
      if (crop) loop = clipRect(loop, crop);
      if (loop.length < 3) continue;
      const w = item.kind === "walls" ? wallById.get(item.id) : null;
      const wt = w && w.type ? typeById.get(w.type) : null;
      if (w && wt && wt.layers.length > 1 && detail === "fine") {
        for (const s of wallLayerStrips(loop, w, wt, frame, cutD)) cut.push({ pts: s.pts, mat: s.mat, layer: s.layer, fn: s.fn, kind: item.kind, cat: item.cat, id: item.id });
      } else {
        // A typed wall reads as its structure layer at medium detail.
        let mat = item.mat;
        if (wt) { const st = wt.layers.find((l) => l.function === "structure") || wt.layers[0]; mat = st.material; }
        cut.push({ pts: loop, mat, kind: item.kind, cat: item.cat, id: item.id });
      }
    }
  }

  // ---- clip triangles to the kept depth range
  const CT = []; // [x0,y0,z0, x1,y1,z1, x2,y2,z2] flattened
  const CTi = []; // triangle index of origin
  const clipZ = (poly, z, keepAbove) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ia = keepAbove ? a[2] >= z : a[2] <= z;
      const ib = keepAbove ? b[2] >= z : b[2] <= z;
      if (ia) out.push(a);
      if (ia !== ib) { const t = (z - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z]); }
    }
    return out;
  };
  for (let k = 0; k < nT; k++) {
    const b = k * 9;
    let poly = [[V[b], V[b + 1], V[b + 2]], [V[b + 3], V[b + 4], V[b + 5]], [V[b + 6], V[b + 7], V[b + 8]]];
    const zmin = Math.min(poly[0][2], poly[1][2], poly[2][2]), zmax = Math.max(poly[0][2], poly[1][2], poly[2][2]);
    if (zmax < near || zmin > far) continue;
    if (zmin < near) poly = clipZ(poly, near, true);
    if (poly.length >= 3 && zmax > far) poly = clipZ(poly, far, false);
    for (let i = 1; i + 1 < poly.length; i++) {
      CT.push(...poly[0], ...poly[i], ...poly[i + 1]);
      CTi.push(k);
    }
  }
  const nC = CTi.length;
  // Per clipped triangle: depth plane z = a x + b y + c (view coords), normal.
  const PA = new Float64Array(nC * 3);
  const NRM = new Float64Array(nC * 3);
  const FLAT = new Uint8Array(nC);
  for (let k = 0; k < nC; k++) {
    const b = k * 9;
    const ux = CT[b + 3] - CT[b], uy = CT[b + 4] - CT[b + 1], uz = CT[b + 5] - CT[b + 2];
    const vx = CT[b + 6] - CT[b], vy = CT[b + 7] - CT[b + 1], vz = CT[b + 8] - CT[b + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    NRM[k * 3] = nx / l; NRM[k * 3 + 1] = ny / l; NRM[k * 3 + 2] = nz / l;
    if (Math.abs(nz) < 1e-9 * l || Math.abs(nz / l) < 1e-6) { FLAT[k] = 1; continue; }
    PA[k * 3] = -nx / nz; PA[k * 3 + 1] = -ny / nz; PA[k * 3 + 2] = CT[b + 2] + (nx * CT[b] + ny * CT[b + 1]) / nz;
  }

  // ---- bounds
  let bx1 = Infinity, by1 = Infinity, bx2 = -Infinity, by2 = -Infinity;
  const grow = (x, y) => { if (x < bx1) bx1 = x; if (x > bx2) bx2 = x; if (y < by1) by1 = y; if (y > by2) by2 = y; };
  for (let k = 0; k < nC * 3; k++) grow(CT[k * 3], CT[k * 3 + 1]);
  for (const c of cut) for (const q of c.pts) grow(q[0], q[1]);
  if (crop) { bx1 = crop.x1; by1 = crop.y1; bx2 = crop.x2; by2 = crop.y2; }
  if (!Number.isFinite(bx1)) return { frame, bounds: crop || { x1: 0, y1: -3000, x2: 10000, y2: 0 }, px: 1, cut: [], lines: [], items: new Map(), empty: true };
  const span = Math.max(bx2 - bx1, by2 - by1, 1);
  const px = opts.px || Math.max(span / res, 0.5);
  const ox = bx1 - 2 * px, oy = by1 - 2 * px;
  const W = Math.ceil((bx2 - bx1) / px) + 4, H = Math.ceil((by2 - by1) / px) + 4;
  const Z = new Float32Array(W * H).fill(Infinity);
  const ID = new Int32Array(W * H).fill(-1);

  // ---- raster: triangles
  for (let k = 0; k < nC; k++) {
    if (FLAT[k]) continue;
    const b = k * 9;
    const x0 = (CT[b] - ox) / px, y0 = (CT[b + 1] - oy) / px;
    const x1 = (CT[b + 3] - ox) / px, y1 = (CT[b + 4] - oy) / px;
    const x2 = (CT[b + 6] - ox) / px, y2 = (CT[b + 7] - oy) / px;
    const area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
    if (Math.abs(area) < 1e-9) continue;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    const a = PA[k * 3], bb = PA[k * 3 + 1], c = PA[k * 3 + 2];
    const s = area > 0 ? 1 : -1;
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const qx = x + 0.5;
        const w0 = ((x1 - qx) * (y2 - py) - (y1 - py) * (x2 - qx)) * s;
        const w1 = ((x2 - qx) * (y0 - py) - (y2 - py) * (x0 - qx)) * s;
        const w2 = ((x0 - qx) * (y1 - py) - (y0 - py) * (x1 - qx)) * s;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = a * (ox + qx * px) + bb * (oy + py * px) + c;
        const i = y * W + x;
        if (z < Z[i]) { Z[i] = z; ID[i] = k; }
      }
    }
  }
  // ---- raster: poché caps (in front of everything), even-odd per item+material
  const capMat = [];
  if (cut.length) {
    const groups = new Map();
    cut.forEach((c) => { const key = `${c.mat}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(c); });
    for (const [mat, list] of groups) {
      const gi = capMat.length;
      capMat.push(mat);
      for (const c of list) {
        // Scanline fill of this polygon (even-odd within itself).
        const pts = c.pts.map((q) => [(q[0] - ox) / px, (q[1] - oy) / px]);
        let y0 = Infinity, y1 = -Infinity;
        for (const q of pts) { y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
        for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) {
          const py = y + 0.5;
          const xs = [];
          for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            if ((a[1] <= py) !== (b[1] <= py)) xs.push(a[0] + ((py - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
          }
          xs.sort((u, v) => u - v);
          for (let i = 0; i + 1 < xs.length; i += 2) {
            for (let x = Math.max(0, Math.ceil(xs[i] - 0.5)); x <= Math.min(W - 1, Math.floor(xs[i + 1] - 0.5)); x++) {
              const ii = y * W + x;
              Z[ii] = cutD - 1;
              ID[ii] = -2 - gi;
            }
          }
        }
      }
    }
  }

  // ---- candidate edges
  const cand = [];
  const seen = new Map(); // edge key → candidate index
  const inc = []; // candidate index → clipped triangles using it
  const q = (v) => Math.round(v * 20);
  const addEdge = (ax, ay, az, bx, by, bz, t = -1) => {
    if (Math.abs(ax - bx) < 1e-6 && Math.abs(ay - by) < 1e-6) return;
    const k1 = `${q(ax)},${q(ay)},${q(az)}`, k2 = `${q(bx)},${q(by)},${q(bz)}`;
    const k = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
    let ci = seen.get(k);
    if (ci === undefined) {
      ci = cand.length / 6;
      seen.set(k, ci);
      cand.push(ax, ay, az, bx, by, bz);
      inc.push(t >= 0 ? [t] : null);
    } else if (t >= 0 && inc[ci]) inc[ci].push(t);
    else if (t < 0) inc[ci] = null;
  };
  for (let k = 0; k < nC; k++) {
    const b = k * 9;
    addEdge(CT[b], CT[b + 1], CT[b + 2], CT[b + 3], CT[b + 4], CT[b + 5], k);
    addEdge(CT[b + 3], CT[b + 4], CT[b + 5], CT[b + 6], CT[b + 7], CT[b + 8], k);
    addEdge(CT[b + 6], CT[b + 7], CT[b + 8], CT[b], CT[b + 1], CT[b + 2], k);
  }
  // An edge whose triangles all lie in one plane of one material is inside a
  // face (a triangulation diagonal): never a line.
  const inFace = (list) => {
    if (!list || list.length < 2) return false;
    const a = list[0];
    const ma = items[tri[CTi[a]]].mat;
    const ca = NRM[a * 3] * CT[a * 9] + NRM[a * 3 + 1] * CT[a * 9 + 1] + NRM[a * 3 + 2] * CT[a * 9 + 2];
    for (let i = 1; i < list.length; i++) {
      const b = list[i];
      if (items[tri[CTi[b]]].mat !== ma) return false;
      const dd = NRM[a * 3] * NRM[b * 3] + NRM[a * 3 + 1] * NRM[b * 3 + 1] + NRM[a * 3 + 2] * NRM[b * 3 + 2];
      if (Math.abs(dd) < 1 - 1e-6) return false;
      const cb = NRM[a * 3] * CT[b * 9] + NRM[a * 3 + 1] * CT[b * 9 + 1] + NRM[a * 3 + 2] * CT[b * 9 + 2];
      if (Math.abs(cb - ca) > 0.5) return false;
    }
    return true;
  };
  const cz = hasCut ? cutD - 1 : 0;
  for (const c of cut) for (let i = 0; i < c.pts.length; i++) { const a = c.pts[i], b = c.pts[(i + 1) % c.pts.length]; addEdge(a[0], a[1], cz, b[0], b[1], cz); }
  for (const ch of openCut) for (let i = 0; i + 1 < ch.length; i++) addEdge(ch[i][0], ch[i][1], cz, ch[i + 1][0], ch[i + 1][1], cz);

  // ---- classify samples
  const pix = (x, y) => {
    const ix = Math.floor((x - ox) / px), iy = Math.floor((y - oy) / px);
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return -1;
    return iy * W + ix;
  };
  const idAt = (x, y) => { const i = pix(x, y); return i < 0 ? -1 : ID[i]; };
  const matOf = (id) => (id >= 0 ? items[tri[CTi[id]]].mat : capMat[-2 - id]);
  const depthAt = (id, x, y) => (id >= 0 ? PA[id * 3] * x + PA[id * 3 + 1] * y + PA[id * 3 + 2] : cutD - 1);
  const tolC = 1 + px * 0.6;
  const sameSurface = (A, B, ex, ey) => {
    if (A === B) return true;
    if (A === -1 || B === -1) return false;
    if (A <= -2 || B <= -2) return A <= -2 && B <= -2 && capMat[-2 - A] === capMat[-2 - B];
    if (matOf(A) !== matOf(B)) return false;
    const c = Math.abs(NRM[A * 3] * NRM[B * 3] + NRM[A * 3 + 1] * NRM[B * 3 + 1] + NRM[A * 3 + 2] * NRM[B * 3 + 2]);
    if (c < CREASE) return false;
    return Math.abs(depthAt(A, ex, ey) - depthAt(B, ex, ey)) <= tolC + px * 0.5 * (Math.hypot(PA[A * 3], PA[A * 3 + 1]) + Math.hypot(PA[B * 3], PA[B * 3 + 1]));
  };
  const step = px * 0.75, side = px * 1.6;
  const out = []; // [x1, y1, x2, y2, cls]
  const nE = cand.length / 6;
  const cropOk = (x, y) => !crop || (x >= crop.x1 - 1e-6 && x <= crop.x2 + 1e-6 && y >= crop.y1 - 1e-6 && y <= crop.y2 + 1e-6);
  for (let e = 0; e < nE; e++) {
    const b = e * 6;
    if (inFace(inc[e])) continue;
    const ax = cand[b], ay = cand[b + 1], az = cand[b + 2], bx = cand[b + 3], by = cand[b + 4], bz = cand[b + 5];
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 1e-6) continue;
    const n = Math.max(1, Math.ceil(L / step));
    const nx = -(by - ay) / L * side, ny = (bx - ax) / L * side;
    let runStart = -1, runCls = 0;
    const flush = (endIdx) => {
      if (runStart < 0) return;
      const t0 = runStart === 0 ? 0 : runStart / n;
      const t1 = endIdx >= n ? 1 : endIdx / n;
      if (t1 > t0) out.push(ax + (bx - ax) * t0, ay + (by - ay) * t0, ax + (bx - ax) * t1, ay + (by - ay) * t1, runCls);
      runStart = -1;
    };
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      let cls = 0;
      if (cropOk(x, y)) {
        const pi = pix(x, y);
        let visible = true;
        if (pi >= 0 && ID[pi] !== -1) {
          const id = ID[pi];
          const slope = id >= 0 ? Math.hypot(PA[id * 3], PA[id * 3 + 1]) : 0;
          visible = z <= Z[pi] + 1 + px * 1.5 * Math.min(slope, 50);
        }
        if (visible) {
          const A = idAt(x + nx, y + ny), B = idAt(x - nx, y - ny);
          if (!sameSurface(A, B, x, y)) cls = A <= -2 || B <= -2 ? 2 : 1;
        }
      }
      if (cls !== runCls || runStart < 0) {
        if (runStart >= 0 && cls !== runCls) flush(i);
        if (cls && runStart < 0) { runStart = i; runCls = cls; }
      }
    }
    flush(n);
  }

  // ---- merge collinear pieces (per class; projection lines under cut lines go)
  const lines = mergeCollinear(out, px);

  // ---- item extents (for tags)
  const itemBounds = new Map();
  const growItem = (id, kind, x, y, isCut) => {
    if (!id) return;
    let bb = itemBounds.get(id);
    if (!bb) itemBounds.set(id, (bb = { x1: x, y1: y, x2: x, y2: y, kind, cut: false }));
    bb.x1 = Math.min(bb.x1, x); bb.y1 = Math.min(bb.y1, y); bb.x2 = Math.max(bb.x2, x); bb.y2 = Math.max(bb.y2, y);
    if (isCut) bb.cut = true;
  };
  for (let k = 0; k < nC; k++) {
    const it = items[tri[CTi[k]]];
    for (let j = 0; j < 3; j++) { const x = CT[k * 9 + j * 3], y = CT[k * 9 + j * 3 + 1]; if (cropOk(x, y)) growItem(it.id, it.kind, x, y, false); }
  }
  for (const c of cut) for (const q2 of c.pts) growItem(c.id, c.kind, q2[0], q2[1], true);
  return { frame, bounds: { x1: bx1, y1: by1, x2: bx2, y2: by2 }, px, cut, lines, items: itemBounds };
}

// Merge collinear overlapping segments. Input flat [x1,y1,x2,y2,cls,…];
// output [{x1, y1, x2, y2, cls: "cut" | "proj"}].
export function mergeCollinear(flat, px = 1) {
  const groups = new Map();
  const angTol = 1e-3;
  for (let i = 0; i < flat.length; i += 5) {
    let x1 = flat[i], y1 = flat[i + 1], x2 = flat[i + 2], y2 = flat[i + 3];
    const cls = flat[i + 4];
    let ang = Math.atan2(y2 - y1, x2 - x1);
    if (ang < 0) ang += Math.PI;
    if (ang >= Math.PI - angTol / 2) ang -= Math.PI;
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const off = -x1 * uy + y1 * ux; // signed distance of the line from the origin
    const k = `${Math.round(ang / angTol)}|${Math.round(off / Math.max(0.5, px * 0.3))}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { ux, uy, off, cut: [], proj: [] }));
    let t1 = x1 * ux + y1 * uy, t2 = x2 * ux + y2 * uy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    (cls === 2 ? g.cut : g.proj).push([t1, t2]);
  }
  const merge = (iv, gap) => {
    iv.sort((a, b) => a[0] - b[0]);
    const res = [];
    for (const s of iv) {
      const l = res[res.length - 1];
      if (l && s[0] <= l[1] + gap) l[1] = Math.max(l[1], s[1]);
      else res.push(s.slice());
    }
    return res;
  };
  const subtract = (iv, cut) => {
    const res = [];
    for (const s of iv) {
      let parts = [s];
      for (const c of cut) {
        const next = [];
        for (const pp of parts) {
          if (c[1] <= pp[0] || c[0] >= pp[1]) { next.push(pp); continue; }
          if (c[0] > pp[0]) next.push([pp[0], c[0]]);
          if (c[1] < pp[1]) next.push([c[1], pp[1]]);
        }
        parts = next;
      }
      res.push(...parts);
    }
    return res;
  };
  const lines = [];
  const gap = px * 1.2;
  for (const g of groups.values()) {
    const cut = merge(g.cut, gap);
    const proj = subtract(merge(g.proj, gap), cut).filter((s) => s[1] - s[0] > px * 0.8);
    const nx = -g.uy, ny = g.ux;
    for (const [list, cls] of [[cut, "cut"], [proj, "proj"]]) {
      for (const [t1, t2] of list) {
        if (t2 - t1 < 1e-6) continue;
        lines.push({ x1: g.ux * t1 + nx * g.off, y1: g.uy * t1 + ny * g.off, x2: g.ux * t2 + nx * g.off, y2: g.uy * t2 + ny * g.off, cls });
      }
    }
  }
  return lines;
}

export const _internal = { clipRect, wallLayerStrips };
