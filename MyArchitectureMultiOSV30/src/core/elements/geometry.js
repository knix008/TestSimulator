// Geometry of the BIM elements in model.js, shared by the plan, the 3D model,
// IFC/DXF export, schedules and the model check. Plan millimetres, z up in
// absolute millimetres (level elevation included) unless a name says "rel".

import { polygonArea, pointInPolygon, rotPt, labelPoint, dist } from "../geom.js";
import { levelById, levelAbove, wallLength } from "../project.js";
import { roofModel, roofBase } from "../roof.js";
import { isCurtainType, CURTAIN_DEFAULTS, slabTypeThickness, slabTypeById } from "./model.js";

const lvOf = (p, id) => levelById(p, id) || { id, elevation: 0, height: 2800, slab: 200 };
const area = (pts) => Math.abs(polygonArea(pts));

// ---------------------------------------------------------------- levels and shafts
// Shafts whose level range covers `levelId` (base level ≤ level ≤ top level).
export function shaftsAt(p, levelId) {
  const lv = levelById(p, levelId);
  if (!lv) return [];
  return (p.shafts || []).filter((s) => {
    const a = levelById(p, s.level), b = levelById(p, s.top) || a;
    return a && lv.elevation >= a.elevation - 1 && lv.elevation <= b.elevation + 1;
  });
}

// Every level a shaft passes through.
export function shaftLevels(p, s) {
  const a = levelById(p, s.level), b = levelById(p, s.top) || a;
  if (!a) return [];
  return p.levels.filter((l) => l.elevation >= a.elevation - 1 && l.elevation <= b.elevation + 1);
}

// Openings of a slab-like element: its own holes plus the shafts through its level.
export function cutsOf(p, el) {
  const out = (el.holes || []).map((h) => h.slice());
  // A roof sits on top of its level: a shaft cuts it only when the shaft goes
  // on above that level (a lift shaft that ends at the top floor keeps the roof).
  const isRoof = "pitch" in el || "overhang" in el;
  const lv = levelById(p, el.level);
  for (const s of shaftsAt(p, el.level)) {
    const top = levelById(p, s.top) || levelById(p, s.level);
    if (isRoof && lv && top && top.elevation <= lv.elevation + 1) continue;
    if (s.pts.some(([x, y]) => pointInPolygon(x, y, el.pts)) || el.pts.some(([x, y]) => pointInPolygon(x, y, s.pts))) out.push(s.pts.slice());
  }
  return out;
}

// ---------------------------------------------------------------- slabs
export const slabTypeOf = (p, s) => slabTypeById(p, s.type);

// Top surface of a slab: z(x, y) in absolute mm. A sloped slab rises at
// `slope` degrees in the plan direction `slopeDir` from its lowest corner.
export function slabTop(p, s) {
  const lv = lvOf(p, s.level);
  const z0 = lv.elevation + (s.offset || 0);
  const tan = Math.tan(((s.slope || 0) * Math.PI) / 180);
  if (!(tan > 0)) return () => z0;
  const a = ((s.slopeDir || 0) * Math.PI) / 180;
  const d = [Math.cos(a), Math.sin(a)];
  const dmin = Math.min(...s.pts.map(([x, y]) => x * d[0] + y * d[1]));
  return (x, y) => z0 + (x * d[0] + y * d[1] - dmin) * tan;
}

export function slabArea(p, s) {
  return Math.max(0, area(s.pts) - cutsOf(p, s).reduce((a, h) => a + area(h), 0));
}

// Material of a slab's top (its type's first layer unless painted over).
export function slabMaterial(p, s) {
  const st = slabTypeOf(p, s);
  return s.material || (st ? st.layers[0].material : s.kind === "foundation" ? "concrete" : "concrete");
}

// A room whose floor lies on a slab (same level, top at the floor, centre on
// the slab and not over a hole): its floor is drawn as a thin finish.
export function roomOnSlab(p, r) {
  const [x, y] = labelPoint(r.pts);
  return (p.slabs || []).some((s) => s.level === r.level && Math.abs(s.offset || 0) < 1 && !(s.slope > 0) && pointInPolygon(x, y, s.pts) && !cutsOf(p, s).some((h) => pointInPolygon(x, y, h)));
}

// ---------------------------------------------------------------- ceilings
export function ceilingHeight(p, c) {
  const lv = lvOf(p, c.level);
  return c.height ?? Math.max(100, lv.height - 300);
}
export const ceilingZ = (p, c) => lvOf(p, c.level).elevation + ceilingHeight(p, c);

// ---------------------------------------------------------------- beams
export function beamFrame(b) {
  const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1) || 1;
  const d = [(b.x2 - b.x1) / len, (b.y2 - b.y1) / len];
  return { len, d, n: [-d[1], d[0]] };
}

// Top of the beam at both ends (absolute mm). null = the top of the storey.
export function beamEnds(p, b) {
  const lv = lvOf(p, b.level);
  const z1 = lv.elevation + (b.z1 ?? lv.height);
  const z2 = lv.elevation + (b.z2 ?? b.z1 ?? lv.height);
  return [z1, z2];
}

export const beamLength = (p, b) => { const [z1, z2] = beamEnds(p, b); return Math.hypot(b.x2 - b.x1, b.y2 - b.y1, z2 - z1); };

// Cross-section [v (across), dz (down from the top)], counter-clockwise.
export function beamProfile(b) {
  const w = b.w, h = b.h;
  if (b.profile === "I") {
    const tf = Math.max(6, Math.round(h * 0.08)), tw = Math.max(5, Math.round(w * 0.08));
    return [[-w / 2, -h], [w / 2, -h], [w / 2, -h + tf], [tw / 2, -h + tf], [tw / 2, -tf], [w / 2, -tf], [w / 2, 0], [-w / 2, 0], [-w / 2, -tf], [-tw / 2, -tf], [-tw / 2, -h + tf], [-w / 2, -h + tf]];
  }
  if (b.profile === "T") {
    const tf = Math.max(20, Math.round(h * 0.2)), tw = Math.max(20, Math.round(w * 0.35));
    return [[-tw / 2, -h], [tw / 2, -h], [tw / 2, -tf], [w / 2, -tf], [w / 2, 0], [-w / 2, 0], [-w / 2, -tf], [-tw / 2, -tf]];
  }
  if (b.profile === "round") {
    const r = w / 2;
    return Array.from({ length: 20 }, (_, i) => { const a = (i / 20) * Math.PI * 2; return [r * Math.cos(a), -r + r * Math.sin(a)]; });
  }
  return [[-w / 2, -h], [w / 2, -h], [w / 2, 0], [-w / 2, 0]];
}
export const beamDepth = (b) => (b.profile === "round" ? b.w : b.h);

// Plan outline of a beam (its width along the axis).
export function beamOutline(b) {
  const f = beamFrame(b);
  const hw = b.w / 2;
  return [[b.x1 + f.n[0] * hw, b.y1 + f.n[1] * hw], [b.x2 + f.n[0] * hw, b.y2 + f.n[1] * hw], [b.x2 - f.n[0] * hw, b.y2 - f.n[1] * hw], [b.x1 - f.n[0] * hw, b.y1 - f.n[1] * hw]];
}

// A beam system (Revit): parallel beams across a polygon every `spacing`
// mm in the direction `angle` (deg) → [{x1, y1, x2, y2}].
export function beamSystem(pts, spacing, angle = 0, margin = 0) {
  const a = (angle * Math.PI) / 180;
  const d = [Math.cos(a), Math.sin(a)], n = [-d[1], d[0]];
  const vs = pts.map(([x, y]) => x * n[0] + y * n[1]);
  const v1 = Math.min(...vs), v2 = Math.max(...vs);
  const out = [];
  const count = Math.floor((v2 - v1 - 2 * margin) / spacing);
  const start = v1 + (v2 - v1 - count * spacing) / 2;
  for (let k = 0; k <= count; k++) {
    const v = start + k * spacing;
    if (v <= v1 + 1 || v >= v2 - 1) continue;
    // Intersections of the line {X·n = v} with the polygon edges.
    const ts = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const vp = p[0] * n[0] + p[1] * n[1], vq = q[0] * n[0] + q[1] * n[1];
      if ((vp - v) * (vq - v) > 0 || vp === vq) continue;
      const t = (v - vp) / (vq - vp);
      const x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t;
      ts.push(x * d[0] + y * d[1]);
    }
    ts.sort((x, y) => x - y);
    for (let i = 0; i + 1 < ts.length; i += 2) {
      const u1 = ts[i], u2 = ts[i + 1];
      if (u2 - u1 < 200) continue;
      out.push({ x1: d[0] * u1 + n[0] * v, y1: d[1] * u1 + n[1] * v, x2: d[0] * u2 + n[0] * v, y2: d[1] * u2 + n[1] * v });
    }
  }
  return out;
}

// ---------------------------------------------------------------- polylines
export function pathLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(...pts[i - 1].slice(0, 2), ...pts[i].slice(0, 2));
  return L;
}

// Left (+) / right (−) offset of an open polyline with mitred corners.
export function offsetPath(pts, d) {
  const n = pts.length;
  const dirs = [];
  for (let i = 0; i + 1 < n; i++) {
    const L = dist(...pts[i], ...pts[i + 1]) || 1;
    dirs.push([(pts[i + 1][0] - pts[i][0]) / L, (pts[i + 1][1] - pts[i][1]) / L]);
  }
  return pts.map((q, i) => {
    const a = dirs[Math.max(0, i - 1)], b = dirs[Math.min(dirs.length - 1, i)];
    const na = [-a[1], a[0]], nb = [-b[1], b[0]];
    let m = [na[0] + nb[0], na[1] + nb[1]];
    const ml = Math.hypot(m[0], m[1]);
    if (ml < 1e-6) m = nb; else m = [m[0] / ml, m[1] / ml];
    const k = Math.min(4, 1 / Math.max(0.25, m[0] * nb[0] + m[1] * nb[1]));
    return [q[0] + m[0] * d * k, q[1] + m[1] * d * k];
  });
}

// Points along a 3D polyline every `step` (by plan length), with the ends.
export function samplePath(pts3, step) {
  const out = [];
  let carry = 0;
  for (let i = 0; i + 1 < pts3.length; i++) {
    const a = pts3[i], b = pts3[i + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    let s = carry;
    while (s < L - 1e-6) {
      const t = s / L;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      s += step;
    }
    carry = s - L;
  }
  out.push(pts3[pts3.length - 1].slice());
  return out;
}

// ---------------------------------------------------------------- railings
// The base line of a railing in 3D (absolute mm).
export function railingPath(p, r) {
  const lv = lvOf(p, r.level);
  return r.pts.map(([x, y]) => [x, y, lv.elevation + (r.z || 0)]);
}

// Posts at the corners and ends, balusters every `spacing`, the top rail and
// (glass/panel styles) infill panels between posts → {posts, balusters, rail, panels}.
export function railingParts(base, r) {
  const H = r.height || 1000;
  const posts = base.map((q) => [q[0], q[1], q[2]]);
  const balusters = r.style === "bars" ? samplePath(base, r.spacing || 120).filter((q) => !posts.some((pp) => Math.hypot(pp[0] - q[0], pp[1] - q[1]) < (r.spacing || 120) / 2)) : [];
  const rail = base.map((q) => [q[0], q[1], q[2] + H]);
  const panels = [];
  if (r.style !== "bars") {
    for (let i = 0; i + 1 < base.length; i++) {
      const a = base[i], b = base[i + 1];
      panels.push([[a[0], a[1], a[2] + 100], [b[0], b[1], b[2] + 100], [b[0], b[1], b[2] + H - (r.rail || 50)], [a[0], a[1], a[2] + H - (r.rail || 50)]]);
    }
  }
  return { posts, balusters, rail, panels, height: H };
}

export const railingLength = (r) => pathLength(r.pts);

// ---------------------------------------------------------------- ramps
export function rampRise(p, r) {
  if (r.rise !== null && r.rise !== undefined) return r.rise;
  const lv = lvOf(p, r.level);
  const above = levelAbove(p, r.level);
  return above ? above.elevation - lv.elevation : lv.height;
}

// → {left, right, z (per vertex, absolute), outline, length, rise, slope}
export function rampModel(p, r) {
  const lv = lvOf(p, r.level);
  const length = pathLength(r.pts);
  const rise = rampRise(p, r);
  const z = [];
  let s = 0;
  r.pts.forEach((q, i) => { if (i) s += dist(...r.pts[i - 1], ...q); z.push(lv.elevation + (length > 0 ? (rise * s) / length : 0)); });
  const left = offsetPath(r.pts, r.width / 2), right = offsetPath(r.pts, -r.width / 2);
  return { left, right, z, outline: [...left, ...right.slice().reverse()], length, rise, slope: length > 0 ? rise / length : 0 };
}

export function rampRails(p, r) {
  const m = rampModel(p, r);
  const inset = (pts) => pts.map((q, i) => [q[0], q[1], m.z[i]]);
  const out = [];
  const L = offsetPath(r.pts, r.width / 2 - 50), R = offsetPath(r.pts, -r.width / 2 + 50);
  if (r.railing === "left" || r.railing === "both") out.push(inset(L));
  if (r.railing === "right" || r.railing === "both") out.push(inset(R));
  return out;
}

// ---------------------------------------------------------------- stairs by type
// Layout of a stair of any shape. Straight stairs keep their old geometry
// (steps × tread across `length`, the last one level with the floor above).
// → {outline, treads: [{pts, z}], landings: [{pts, z}], walk, rails: {left, right}, n1, n2, riser}
export function stairRise(p, s) {
  const lv = lvOf(p, s.level);
  const above = levelAbove(p, s.level);
  return above ? above.elevation - lv.elevation : lv.height;
}

export function stairLayout(s, rise) {
  const shape = s.shape || "straight";
  const n = Math.max(2, s.steps);
  const r = rise / n;
  const W = s.width, L = s.length;
  const P = (u, v) => { const [x, y] = rotPt(u, v, s.rot || 0); return [s.x + x, s.y + y]; };
  const quad = (u1, v1, u2, v2) => [P(u1, v1), P(u2, v1), P(u2, v2), P(u1, v2)];
  const treads = [], landings = [];
  const ins = 50; // rail inset from the stair edge
  const t = s.turn === -1 ? -1 : 1;
  let outline, walk, left, right;
  const at3 = (u, v, z) => [...P(u, v), z];
  if (shape === "spiral") {
    const ri = s.radius || 300, ro = ri + W;
    const sweep = ((s.sweep || 270) * Math.PI) / 180 * t;
    const a0 = ((s.rot || 0) * Math.PI) / 180;
    const C = (rad, a) => [s.x + rad * Math.cos(a), s.y + rad * Math.sin(a)];
    for (let i = 0; i < n; i++) {
      const aa = a0 + (sweep * i) / n, ab = a0 + (sweep * (i + 1)) / n, am = (aa + ab) / 2;
      treads.push({ pts: [C(ri, aa), C(ro, aa), C(ro, am), C(ro, ab), C(ri, ab)], z: (i + 1) * r });
    }
    const seg = Math.max(8, Math.round(Math.abs(sweep) / 0.15));
    const arc = (rad) => Array.from({ length: seg + 1 }, (_, k) => C(rad, a0 + (sweep * k) / seg));
    outline = [...arc(ro), ...arc(ri).reverse()];
    walk = arc((ri + ro) / 2);
    const rail3 = (rad) => Array.from({ length: seg + 1 }, (_, k) => [...C(rad, a0 + (sweep * k) / seg), Math.min(rise, r + (rise - r) * (k / seg))]);
    left = rail3(ro - ins);
    right = ri > 120 ? rail3(ri + ins) : null;
    if (t < 0) [left, right] = [right, left];
    return { outline, treads, landings, walk, rails: { left, right }, riser: r, n1: n, n2: 0, shape };
  }
  if (shape === "L" || shape === "U") {
    const n1 = Math.max(1, Math.floor((n - 1) / 2)), n2 = Math.max(1, n - 1 - n1);
    const Ld = shape === "L" ? W : s.landing || W;
    const uL = L / 2 - Ld; // end of flight 1
    const run1 = (uL + L / 2) / n1;
    for (let i = 0; i < n1; i++) treads.push({ pts: quad(-L / 2 + i * run1, -W / 2, -L / 2 + (i + 1) * run1, W / 2), z: (i + 1) * r });
    const zl = (n1 + 1) * r;
    if (shape === "L") {
      const L2 = s.length2 || L;
      const run2 = L2 / n2;
      // Landing at the end of flight 1; flight 2 turns to the +v (t = 1) side.
      landings.push({ pts: quad(uL, -W / 2, L / 2, W / 2), z: zl });
      for (let i = 0; i < n2; i++) {
        const v1 = t * (W / 2 + i * run2), v2 = t * (W / 2 + (i + 1) * run2);
        treads.push({ pts: quad(uL, Math.min(v1, v2), L / 2, Math.max(v1, v2)), z: zl + (i + 1) * r });
      }
      const far = t * (W / 2 + L2);
      outline = [[-L / 2, -t * W / 2], [L / 2, -t * W / 2], [L / 2, far], [uL, far], [uL, t * W / 2], [-L / 2, t * W / 2]].map(([u, v]) => P(u, v));
      walk = [P(-L / 2 + 150, 0), P(L / 2 - W / 2, 0), P(L / 2 - W / 2, far - t * 80)];
      // Outer rail (away from the turn) and inner rail (at the turn).
      const outer = [at3(-L / 2, -t * (W / 2 - ins), r), at3(L / 2 - ins, -t * (W / 2 - ins), zl), at3(L / 2 - ins, far, rise)];
      const inner = [at3(-L / 2, t * (W / 2 - ins), r), at3(uL + ins, t * (W / 2 - ins), zl), at3(uL + ins, far, rise)];
      [left, right] = t > 0 ? [outer, inner] : [inner, outer];
    } else {
      const g = s.gap ?? 100;
      const v2a = t * (W / 2 + g), v2b = t * (W / 2 + g + W); // flight 2 band
      const run2 = (uL + L / 2) / n2;
      landings.push({ pts: quad(uL, Math.min(-t * W / 2, v2b), L / 2, Math.max(-t * W / 2, v2b)), z: zl });
      for (let i = 0; i < n2; i++) {
        const u2 = uL - i * run2, u1 = uL - (i + 1) * run2;
        treads.push({ pts: quad(u1, Math.min(v2a, v2b), u2, Math.max(v2a, v2b)), z: zl + (i + 1) * r });
      }
      outline = [P(-L / 2, -t * W / 2), P(L / 2, -t * W / 2), P(L / 2, v2b), P(-L / 2, v2b)];
      const vm = (v2a + v2b) / 2;
      walk = [P(-L / 2 + 150, 0), P(L / 2 - Ld / 2, 0), P(L / 2 - Ld / 2, vm), P(-L / 2 + 80, vm)];
      const outer = [at3(-L / 2, -t * (W / 2 - ins), r), at3(L / 2 - ins, -t * (W / 2 - ins), zl), at3(L / 2 - ins, v2b - t * ins, zl), at3(-L / 2, v2b - t * ins, rise)];
      const inner = [at3(-L / 2, t * (W / 2 - ins), r), at3(uL, t * (W / 2 - ins), zl), at3(uL, v2a + t * ins, zl), at3(-L / 2, v2a + t * ins, rise)];
      [left, right] = t > 0 ? [outer, inner] : [inner, outer];
    }
    return { outline, treads, landings, walk, rails: { left, right }, riser: r, n1, n2, shape };
  }
  // straight
  const run = L / n;
  for (let i = 0; i < n; i++) treads.push({ pts: quad(-L / 2 + i * run, -W / 2, -L / 2 + (i + 1) * run, W / 2), z: (i + 1) * r });
  outline = [P(-L / 2, -W / 2), P(L / 2, -W / 2), P(L / 2, W / 2), P(-L / 2, W / 2)];
  walk = [P(-L / 2 + 150, 0), P(L / 2 - 80, 0)];
  left = [at3(-L / 2, -(W / 2 - ins), r), at3(L / 2 - run, -(W / 2 - ins), rise), at3(L / 2, -(W / 2 - ins), rise)];
  right = [at3(-L / 2, W / 2 - ins, r), at3(L / 2 - run, W / 2 - ins, rise), at3(L / 2, W / 2 - ins, rise)];
  return { outline, treads, landings, walk, rails: { left, right }, riser: r, n1: n, n2: 0, shape };
}

// Railings a stair carries (`railing`: none / left / right / both) as base
// lines in absolute mm. Stairs from before typed stairs have none.
export function stairRails(p, s) {
  const side = s.railing || "none";
  if (side === "none") return [];
  const lv = lvOf(p, s.level);
  const lay = stairLayout(s, stairRise(p, s));
  const out = [];
  for (const k of ["left", "right"]) if ((side === k || side === "both") && lay.rails[k]) out.push(lay.rails[k].map(([x, y, z]) => [x, y, lv.elevation + z]));
  return out;
}

export const STAIR_RAIL = { height: 900, spacing: 150, baluster: 20, rail: 50, style: "bars", material: "steel" };

// ---------------------------------------------------------------- curtain walls
export const curtainTypeOf = (p, w) => {
  const wt = w.type ? (p.wallTypes || []).find((x) => x.id === w.type) : null;
  return isCurtainType(wt) ? wt : null;
};
export const isCurtainWall = (p, w) => !!curtainTypeOf(p, w);

// Grid lines of a curtain wall: us (along, 0 … L) and zs (up, 0 … H, relative).
export function curtainGrid(p, w, H) {
  const wt = curtainTypeOf(p, w);
  const c = { ...CURTAIN_DEFAULTS, ...(wt ? wt.curtain : {}), ...(w.curtain || {}) };
  const L = wallLength(w);
  const lines = (len, step) => {
    if (c.gridMode === "fixed") { const out = []; for (let x = 0; x < len - 1; x += step) out.push(x); out.push(len); return out; }
    const k = Math.max(1, Math.ceil(len / step - 1e-6));
    return Array.from({ length: k + 1 }, (_, i) => (len * i) / k);
  };
  const us = lines(L, c.u);
  let zs = lines(H, c.v);
  if (c.spandrel > 0 && c.spandrel < H - 200) zs = [...new Set([...zs.filter((z) => z < H - c.spandrel - 100), H - c.spandrel, H])].sort((a, b) => a - b);
  return { us, zs, c, L, H };
}

// ---------------------------------------------------------------- walls: profiles and attachment
export const wallProfiled = (w) => !!(w.baseOffset || w.heightEnd || w.attachTop);

// Underside of a roof or slab above (x, y) in absolute mm, or null.
export function undersideAt(p, id, x, y) {
  if (!id) return null;
  const roofs = id === "roof" ? p.roofs : p.roofs.filter((r) => r.id === id);
  let best = null;
  for (const r of roofs) {
    const m = roofModel(r, roofBase(p, r));
    for (const f of m.faces) {
      const plan = f.pts.map((q) => [q[0], q[1]]);
      if (!pointInPolygon(x, y, plan)) continue;
      const z = planeZ(f.pts, x, y) - (m.flat ? r.thickness || 200 : r.thickness || 200);
      if (best === null || z < best) best = z;
    }
  }
  const s = (p.slabs || []).find((q) => q.id === id);
  if (s && pointInPolygon(x, y, s.pts)) { const z = slabTop(p, s)(x, y) - s.thickness; if (best === null || z < best) best = z; }
  return best;
}

// z of the plane through a planar 3D polygon at (x, y).
export function planeZ(pts, x, y) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  if (Math.abs(nz) < 1e-9) return Math.max(...pts.map((q) => q[2]));
  const a = pts[0];
  return a[2] - (nx * (x - a[0]) + ny * (y - a[1])) / nz;
}

// Bottom and top of a wall (relative to its level floor) at u along it.
export function wallTopRel(p, w, u, H) {
  const lv = lvOf(p, w.level);
  const L = wallLength(w) || 1;
  const h2 = w.heightEnd || H;
  let top = H + (h2 - H) * Math.max(0, Math.min(1, u / L));
  if (w.attachTop) {
    const x = w.x1 + ((w.x2 - w.x1) * u) / L, y = w.y1 + ((w.y2 - w.y1) * u) / L;
    const z = undersideAt(p, w.attachTop, x, y);
    if (z !== null) top = z - lv.elevation;
  }
  return Math.max((w.baseOffset || 0) + 10, top);
}

// ---------------------------------------------------------------- quantities
export function slabVolume(p, s) { return slabArea(p, s) * s.thickness; }
export const ceilingArea = (p, c) => Math.max(0, area(c.pts) - cutsOf(p, c).reduce((a, h) => a + area(h), 0));
export { slabTypeThickness };
