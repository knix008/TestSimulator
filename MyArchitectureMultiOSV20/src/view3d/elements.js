// 3D geometry of the BIM elements (src/core/elements): slabs and ceilings with
// openings and shafts cut out, beams swept along their axis, railings
// (balusters, posts, top rail, glass infill), ramps, stairs by type (L, U,
// spiral, with landings and railings), curtain walls (mullions, transoms and
// panels; doors and windows replace panels), walls with a sloped top or
// attached to the roof / slab above, and roofs with openings.
//
// World frame as in build.js: metres, X = plan x, Z = plan y, Y = up.

import { triangulate, polygonArea, clipHalfPlane } from "../core/geom.js";
import { slicePoly, wallFrame } from "../core/walls.js";
import { levelById } from "../core/project.js";
import { optionHidden } from "../core/elements/model.js";
import {
  cutsOf, slabTop, slabMaterial, ceilingZ, beamEnds, beamProfile, railingPath, railingParts, rampModel, rampRails,
  stairLayout, stairRise, stairRails, STAIR_RAIL, curtainGrid, isCurtainWall, wallProfiled, wallTopRel, slabTypeOf,
} from "../core/elements/geometry.js";
import { DEFAULT_MATERIAL } from "../lib/materials.js";

const M = 0.001;
const W = (x, y, z) => [x * M, z * M, y * M];

// The same triangle accumulator as build.js (normals + metre UVs).
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
      else { const tx = -nz, tz = nx; const tl = Math.hypot(tx, tz) || 1; this.uv.push((p[0] * tx + p[2] * tz) / tl, p[1]); }
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
export { Geo as ElementGeo };

const ccw = (ring) => (polygonArea(ring) < 0 ? ring.slice().reverse() : ring);
const cw = (ring) => (polygonArea(ring) > 0 ? ring.slice().reverse() : ring);

// Plan triangles of a polygon with holes (earcut through three.js when there
// are holes, the ear clipper otherwise) → [[a, b, c]] of plan points.
function planTriangles(THREE, outer, holes = []) {
  const ring = ccw(outer);
  if (!holes.length || !THREE || !THREE.ShapeUtils) return triangulate(ring).map(([i, j, k]) => [ring[i], ring[j], ring[k]]);
  const hs = holes.map(cw);
  const V = (q) => new THREE.Vector2(q[0], q[1]);
  const all = [...ring, ...hs.flat()];
  const faces = THREE.ShapeUtils.triangulateShape(ring.map(V), hs.map((h) => h.map(V)));
  return faces.map(([i, j, k]) => [all[i], all[j], all[k]]);
}

// A solid between a top surface z = top(x, y) and the same `th` lower, over a
// polygon with holes (slabs, ceilings, ramps' straight pieces).
function slabSolid(geo, THREE, outer, holes, top, th) {
  for (const [a, b, c] of planTriangles(THREE, outer, holes)) {
    // Plan clockwise ↔ world up (the plan → world map flips handedness).
    const flip = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0;
    const [p, q, r] = flip ? [a, c, b] : [a, b, c];
    geo.tri(W(p[0], p[1], top(...p)), W(q[0], q[1], top(...q)), W(r[0], r[1], top(...r)));
    geo.tri(W(p[0], p[1], top(...p) - th), W(r[0], r[1], top(...r) - th), W(q[0], q[1], top(...q) - th));
  }
  const side = (ring) => {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      geo.quad(W(...b, top(...b) - th), W(...a, top(...a) - th), W(...a, top(...a)), W(...b, top(...b)));
    }
  };
  side(ccw(outer));
  for (const h of holes) side(cw(h));
}

// Vertical prism between flat heights (mm).
function prism(geo, pts, z0, z1) {
  if (pts.length < 3 || z1 - z0 < 0.01) return;
  slabSolid(geo, null, pts, [], () => z1, z1 - z0);
}

// Sweep a cross-section [v, dz] along a 3D segment a → b (plan + top z).
function sweep(geo, a, b, profile) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  const n = [-dy / L, dx / L];
  const at = (end, [v, dz]) => W(end[0] + n[0] * v, end[1] + n[1] * v, end[2] + dz);
  const prof = polygonArea(profile) < 0 ? profile.slice().reverse() : profile;
  for (let i = 0; i < prof.length; i++) {
    const p = prof[i], q = prof[(i + 1) % prof.length];
    geo.quad(at(a, p), at(b, p), at(b, q), at(a, q));
  }
  for (const [i, j, k] of triangulate(prof)) {
    geo.tri(at(a, prof[i]), at(a, prof[k]), at(a, prof[j]));
    geo.tri(at(b, prof[i]), at(b, prof[j]), at(b, prof[k]));
  }
}
const rectProfile = (w, h) => [[-w / 2, -h], [w / 2, -h], [w / 2, 0], [-w / 2, 0]];

// A box in plan frame: centre (x, y), along direction d, sizes (along, across), z0..z1.
function boxAlong(geo, x, y, d, su, sv, z0, z1) {
  const a = [x - d[0] * su / 2, y - d[1] * su / 2, z1], b = [x + d[0] * su / 2, y + d[1] * su / 2, z1];
  sweep(geo, a, b, rectProfile(sv, z1 - z0));
}

// ---------------------------------------------------------------- railings
function railingMeshes(THREE, mats, base, r, mat) {
  const parts = railingParts(base, r);
  const geo = new Geo();
  const H = parts.height;
  const post = Math.max(40, r.baluster * 2);
  for (const q of parts.posts) prism(geo, square(q, post), q[2], q[2] + H);
  for (const q of parts.balusters) prism(geo, square(q, r.baluster), q[2], q[2] + H - r.rail / 2);
  for (let i = 0; i + 1 < parts.rail.length; i++) {
    const a = parts.rail[i], b = parts.rail[i + 1];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) continue;
    sweep(geo, a, b, [[-r.rail / 2, -r.rail], [r.rail / 2, -r.rail], [r.rail / 2, 0], [-r.rail / 2, 0]]);
  }
  const out = [];
  if (!geo.empty) out.push(new THREE.Mesh(geo.build(THREE), mat));
  if (parts.panels.length) {
    const g2 = new Geo();
    for (const [a, b, c, d] of parts.panels) { g2.quad(W(...a), W(...b), W(...c), W(...d)); g2.quad(W(...a), W(...d), W(...c), W(...b)); }
    const m = new THREE.Mesh(g2.build(THREE), r.style === "glass" ? mats.glass() : mats.surface(r.material || "steel", "#9aa0a6"));
    m.userData.glass = r.style === "glass";
    out.push(m);
  }
  return out;
}
const square = (q, s) => [[q[0] - s / 2, q[1] - s / 2], [q[0] + s / 2, q[1] - s / 2], [q[0] + s / 2, q[1] + s / 2], [q[0] - s / 2, q[1] + s / 2]];

// ---------------------------------------------------------------- one level
// ctx: {vis, phaseMat, tag, shadow, opts}
export function buildLevelElements(THREE, p, mats, lg, lv, ctx) {
  const { tag, shadow, phaseMat } = ctx;
  const vis = (it) => ctx.vis(it) && !optionHidden(it);
  const base = lv.elevation;
  const add = (mesh, it, kind, name) => { mesh.name = name; lg.add(tag(mesh, it.id, kind, lv.id)); return mesh; };
  // ---- slabs (floors, foundations)
  for (const s of (p.slabs || []).filter((x) => x.level === lv.id && vis(x))) {
    const geo = new Geo();
    slabSolid(geo, THREE, s.pts, cutsOf(p, s), slabTop(p, s), s.thickness);
    if (geo.empty) continue;
    const mesh = shadow(new THREE.Mesh(geo.build(THREE), phaseMat(s, mats.surface(slabMaterial(p, s), "#a7a7a2"))));
    add(mesh, s, "slabs", `${s.kind === "foundation" ? "foundation" : "slab"} ${s.id}`);
  }
  // ---- ceilings
  for (const c of (p.ceilings || []).filter((x) => x.level === lv.id && vis(x))) {
    const geo = new Geo();
    const z = ceilingZ(p, c);
    slabSolid(geo, THREE, c.pts, cutsOf(p, c), () => z + c.thickness, c.thickness);
    if (geo.empty) continue;
    const st = slabTypeOf(p, c);
    const mesh = new THREE.Mesh(geo.build(THREE), phaseMat(c, mats.surface(c.material || (st ? st.layers[0].material : "gypsum"), "#efeeea")));
    mesh.receiveShadow = true;
    add(mesh, c, "ceilings", `ceiling ${c.id}`);
  }
  // ---- beams and braces
  for (const b of (p.beams || []).filter((x) => x.level === lv.id && vis(x))) {
    const geo = new Geo();
    const [z1, z2] = beamEnds(p, b);
    sweep(geo, [b.x1, b.y1, z1], [b.x2, b.y2, z2], beamProfile(b));
    add(shadow(new THREE.Mesh(geo.build(THREE), phaseMat(b, mats.surface(b.material || "concrete", "#a7a7a2")))), b, "beams", `beam ${b.id}`);
  }
  // ---- railings
  for (const r of (p.railings || []).filter((x) => x.level === lv.id && vis(x))) {
    const g = new THREE.Group();
    for (const m of railingMeshes(THREE, mats, railingPath(p, r), r, phaseMat(r, mats.surface(r.material || "steel", "#9aa0a6")))) { if (!m.userData.glass) shadow(m); g.add(m); }
    add(g, r, "railings", `railing ${r.id}`);
  }
  // ---- ramps
  for (const r of (p.ramps || []).filter((x) => x.level === lv.id && vis(x))) {
    const m = rampModel(p, r);
    const geo = new Geo();
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const ring = [m.left[i], m.left[i + 1], m.right[i + 1], m.right[i]];
      const zs = [m.z[i], m.z[i + 1], m.z[i + 1], m.z[i]];
      const top = (x, y) => { const k = ring.findIndex((q) => Math.abs(q[0] - x) < 1e-6 && Math.abs(q[1] - y) < 1e-6); return zs[Math.max(0, k)]; };
      slabSolid(geo, null, ring, [], top, r.thickness);
    }
    const g = new THREE.Group();
    g.add(shadow(new THREE.Mesh(geo.build(THREE), phaseMat(r, mats.surface(r.material || "concrete", "#a7a7a2")))));
    for (const rail of rampRails(p, r)) for (const mm of railingMeshes(THREE, mats, rail, STAIR_RAIL, mats.surface("steel", "#9aa0a6"))) g.add(mm);
    add(g, r, "ramps", `ramp ${r.id}`);
  }
  // ---- stairs by type (L, U, spiral) and the railings of every stair
  for (const s of p.stairs.filter((x) => x.level === lv.id && vis(x) && (x.shape || (x.railing && x.railing !== "none")))) {
    const g = new THREE.Group();
    if (s.shape) {
      const rise = stairRise(p, s);
      const lay = stairLayout(s, rise);
      const geo = new Geo();
      for (const tr of lay.treads) prism(geo, tr.pts, base + Math.max(0, tr.z - Math.max(180, lay.riser) - 120), base + tr.z);
      for (const ld of lay.landings) prism(geo, ld.pts, base + ld.z - 200, base + ld.z);
      g.add(shadow(new THREE.Mesh(geo.build(THREE), phaseMat(s, mats.surface(s.material || "oak", "#c49a6c")))));
    }
    for (const rail of stairRails(p, s)) for (const mm of railingMeshes(THREE, mats, rail, STAIR_RAIL, mats.surface("steel", "#9aa0a6"))) g.add(mm);
    if (g.children.length) add(g, s, "stairs", `stair ${s.id}`);
  }
}

// ---------------------------------------------------------------- walls
// Body of a curtain wall or a wall with a profile (sloped top, base offset,
// attached top) → a mesh/group, or null for an ordinary wall (build.js then
// makes its prism pieces). `spans` are its openings.
export function specialWallBody(THREE, p, w, poly, spans, base, H, mats, phaseMat) {
  if (isCurtainWall(p, w)) return curtainWallBody(THREE, p, w, spans, base + (w.baseOffset || 0), H - (w.baseOffset || 0), mats, phaseMat);
  if (!wallProfiled(w)) return null;
  const geo = new Geo();
  const z0 = base + (w.baseOffset || 0);
  const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
  const top = (u) => base + wallTopRel(p, w, u, H);
  const f = wallFrame(w);
  const uOf = (x, y) => (x - w.x1) * f.d[0] + (y - w.y1) * f.d[1];
  const STEP = w.attachTop ? 300 : 1e9;
  // A piece between u = a and b from bottom z(u) to top z(u), in strips.
  const us = poly.map(([x, y]) => uOf(x, y));
  const uMin = Math.min(...us), uMax = Math.max(...us);
  const piece = (a0, b0, bot, topFn) => {
    const a = Math.max(a0, uMin), b = Math.min(b0, uMax);
    for (let u = a; u < b - 0.5; u += STEP) {
      const ring = slicePoly(w, poly, u, Math.min(b, u + STEP));
      if (ring.length < 3 || Math.abs(polygonArea(ring)) < 1) continue;
      const tp = (x, y) => topFn(uOf(x, y));
      const bt = (x, y) => bot(uOf(x, y));
      // Bottom flat at bt, top following tp.
      const rr = ccw(ring);
      for (const [i, j, k] of triangulate(rr)) {
        geo.tri(W(...rr[i], tp(...rr[i])), W(...rr[k], tp(...rr[k])), W(...rr[j], tp(...rr[j])));
        geo.tri(W(...rr[i], bt(...rr[i])), W(...rr[j], bt(...rr[j])), W(...rr[k], bt(...rr[k])));
      }
      for (let i = 0; i < rr.length; i++) {
        const A = rr[i], B = rr[(i + 1) % rr.length];
        geo.quad(W(...B, bt(...B)), W(...A, bt(...A)), W(...A, tp(...A)), W(...B, tp(...B)));
      }
    }
  };
  const flat = (z) => () => z;
  let from = -1e9;
  for (const s of spans) {
    piece(Math.max(from, -1e6), s.u1, flat(z0), top);
    if (s.o.sill > 0) piece(s.u1, s.u2, flat(z0), (u) => Math.min(top(u), base + s.o.sill));
    const head = base + s.o.sill + s.o.height;
    piece(s.u1, s.u2, (u) => Math.min(top(u), head), (u) => top(u));
    from = s.u2;
  }
  piece(from === -1e9 ? -1e6 : from, L + 1e6, flat(z0), top);
  if (geo.empty) return null;
  const wt = w.type ? (p.wallTypes || []).find((x) => x.id === w.type) : null;
  const mat = w.material || (wt ? wt.layers[0].material : DEFAULT_MATERIAL.wall);
  const mesh = new THREE.Mesh(geo.build(THREE), phaseMat(mats.surface(mat, "#ece8e1")));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function curtainWallBody(THREE, p, w, spans, z0, H, mats, phaseMat) {
  const g = new THREE.Group();
  const { us, zs, c, L } = curtainGrid(p, w, H);
  const f = wallFrame(w);
  const at = (u) => [w.x1 + f.d[0] * u, w.y1 + f.d[1] * u];
  const frame = new Geo(), glass = new Geo(), solid = new Geo();
  const m = c.mullion, dp = c.depth;
  // Mullions (vertical) and transoms (horizontal).
  for (const u of us) { const [x, y] = at(Math.min(L - m / 2, Math.max(m / 2, u))); boxAlong(frame, x, y, f.d, m, dp, z0, z0 + H); }
  for (const z of zs) {
    const zz = Math.min(H - m / 2, Math.max(m / 2, z));
    const [x, y] = at(L / 2);
    boxAlong(frame, x, y, f.d, L, dp * 0.8, z0 + zz - m / 2, z0 + zz + m / 2);
  }
  // Panels, except where a door or window takes their place.
  const covered = (u1, u2, za, zb) => spans.some((s) => s.u1 < u2 - 1 && s.u2 > u1 + 1 && s.o.sill < zb - 1 && s.o.sill + s.o.height > za + 1);
  const pt = 24;
  for (let i = 0; i + 1 < us.length; i++) {
    for (let j = 0; j + 1 < zs.length; j++) {
      const u1 = us[i] + m / 2, u2 = us[i + 1] - m / 2, za = zs[j] + m / 2, zb = zs[j + 1] - m / 2;
      if (u2 - u1 < 5 || zb - za < 5 || covered(us[i], us[i + 1], zs[j], zs[j + 1])) continue;
      const [x, y] = at((u1 + u2) / 2);
      const spandrel = c.spandrel > 0 && zs[j] >= H - c.spandrel - 1;
      boxAlong(spandrel ? solid : glass, x, y, f.d, u2 - u1, pt, z0 + za, z0 + zb);
    }
  }
  const fm = new THREE.Mesh(frame.build(THREE), phaseMat(mats.surface(c.frame || "aluminium", "#8d949b")));
  fm.castShadow = fm.receiveShadow = true;
  g.add(fm);
  if (!glass.empty) {
    const gm = new THREE.Mesh(glass.build(THREE), c.panel === "glass" ? phaseMat(mats.glass()) : phaseMat(mats.surface(c.panel, "#9fcde3")));
    gm.userData.glass = c.panel === "glass";
    g.add(gm);
  }
  if (!solid.empty) { const sm = new THREE.Mesh(solid.build(THREE), phaseMat(mats.surface("aluminium", "#8d949b"))); sm.castShadow = true; g.add(sm); }
  return g;
}

// ---------------------------------------------------------------- roofs with openings
// Roof faces with the roof's own openings and the shafts through its level cut
// out → true when it built the faces into `geo` (build.js does it otherwise).
export function roofFacesCut(THREE, p, r, model, geo, th) {
  const cuts = cutsOf(p, r);
  if (!cuts.length) return false;
  const g2 = geo;
  for (const f of model.faces) {
    const plan = ccw(f.pts.map((q) => [q[0], q[1]]));
    const zf = planeFn(f.pts);
    // The part of every opening inside this face (faces are convex).
    const holes = [];
    for (const h of cuts) {
      let hh = ccw(h);
      for (let i = 0; i < plan.length && hh.length; i++) {
        const a = plan[i], b = plan[(i + 1) % plan.length];
        const n = [-(b[1] - a[1]), b[0] - a[0]];
        hh = clipHalfPlane(hh, a, n, 0);
      }
      if (hh.length >= 3 && Math.abs(polygonArea(hh)) > 100) holes.push(hh);
    }
    slabSolid(g2, THREE, plan, holes, zf, th);
  }
  return true;
}

function planeFn(pts) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const a = pts[0];
  if (Math.abs(nz) < 1e-9) return () => a[2];
  return (x, y) => a[2] - (nx * (x - a[0]) + ny * (y - a[1])) / nz;
}

export { levelById };
