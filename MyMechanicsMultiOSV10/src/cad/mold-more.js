// More mold tools, on top of the parting line and tooling split of advanced.js:
//   shut-off surfaces — every opening of the part (an inner loop on any face: a hole along the pull, a window in a
//     side wall, a hole through a curved wall) whose mould material would join core and cavity gets a patch
//     (planar, or a filling surface when the loop is not flat). Whether an opening needs one is decided on the
//     kernel: the mould space (block − part) is split by the parting surface and the patches chosen so far, and
//     a patch is kept when it lessens the volume that still reaches both the top and the bottom of the block;
//   parting surface — from the parting line (mold-brep.js: the faces split at their draft-zero curves, the loop
//     between what the core forms and the rest) outward: a plane with the part's outline cut out when the line is
//     level; otherwise strips that follow it — 'normal' (square to the pull, out along the wall), 'tangent' (on
//     the tangent plane of the face most square to the pull) or 'ruled' (out from the part's middle) — with
//     corner fans at convex corners and mitred side lines at concave ones, so stepped parts part too;
//   core / cavity by surfaces — the tooling block minus the part split by the parting surface and the shut-offs
//     (toolingSplit uses it when the part has a parting surface); the pieces touching the top of the block are the
//     cavity, the bottom the core;
//   undercut warning — the faces neither mould half can release (mold-brep.js, on the B-rep).
import { rep } from './kernel.js';
import { codeError } from './features.js';
import { partingLoops, undercutBrep, rayCaster, faceSamples } from './mold-brep.js';

const AXIS_DIRS = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], '-x': [-1, 0, 0], '-y': [0, -1, 0], '-z': [0, 0, -1] };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a); return l > 1e-15 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
const vec = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Parting surface modes: how the surface runs out from a parting line that is not level. */
export const PARTING_MODES = ['normal', 'tangent', 'ruled'];

/** The pull direction of a mold feature: its own, else the parting line's, else up (+Z). */
export function pullOf(f, ctx) {
  const key = f.dir || ctx.parting?.key || 'z';
  return { key, dir: AXIS_DIRS[key] ?? ctx.parting?.dir ?? AXIS_DIRS.z };
}

function basis(dir) {
  const a = Math.abs(dir[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit(cross(a, dir)); return { u, v: cross(dir, u) };
}

const sizeOf = (shape) => { const [lo, hi] = shape.boundingBox.bounds; return Math.max(1e-6, Math.hypot(...sub(hi, lo))); };

/** Splits `shape` with the tools (shapes) by the kernel's splitter. */
export function splitWith(shape, tools) {
  const R = rep(); const oc = R.getOC();
  const args = new oc.NCollection_List_TopoDS_Shape(); args.Append(shape.wrapped);
  const list = new oc.NCollection_List_TopoDS_Shape(); for (const t of tools) list.Append(t.wrapped);
  const sp = new oc.BRepAlgoAPI_Splitter();
  try {
    sp.SetArguments(args); sp.SetTools(list); sp.Build(new oc.Message_ProgressRange());
    if (sp.HasErrors()) throw codeError('kernel');
    return R.cast(sp.Shape());
  } finally { sp.delete(); args.delete(); list.delete(); }
}

/** How many faces of the body neither mould half can release along `dir` (the undercut warning); 0 when unknown. */
export function undercutCount(body, dir) {
  try { return undercutBrep(body, dir).undercut; } catch { return 0; }
}

/** The same edge, oriented forward (its wire then runs the way its parameter does, like pointAt). */
function forward(e) {
  const R = rep(); const oc = R.getOC();
  return e.wrapped.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED ? R.cast(e.wrapped.Oriented(oc.TopAbs_Orientation.TopAbs_FORWARD)) : e.clone();
}

// ───────────────────────── tooling block helpers

/** The tooling block around the body (`m` on every side) with its top and bottom along the pull. */
function blockOf(body, dir, m) {
  const R = rep();
  const [lo, hi] = body.boundingBox.bounds;
  const block = R.makeBox(lo.map((x) => x - m), hi.map((x) => x + m));
  const ws = [];
  for (const x of [lo[0] - m, hi[0] + m]) for (const y of [lo[1] - m, hi[1] + m]) for (const z of [lo[2] - m, hi[2] + m]) ws.push(dot([x, y, z], dir));
  return { block, top: Math.max(...ws), bottom: Math.min(...ws) };
}

/** Which end of the block a piece reaches: 'top', 'bottom', 'both' or 'none'. */
function reach(solid, dir, top, bottom) {
  const span = top - bottom;
  const [a, b] = solid.boundingBox.bounds;
  const ws = [];
  for (const x of [a[0], b[0]]) for (const y of [a[1], b[1]]) for (const z of [a[2], b[2]]) ws.push(dot([x, y, z], dir));
  const t = Math.abs(Math.max(...ws) - top) < span * 1e-6; const bt = Math.abs(Math.min(...ws) - bottom) < span * 1e-6;
  return t && bt ? 'both' : t ? 'top' : bt ? 'bottom' : 'none';
}

/**
 * Volume of the mould space split by `tools` that is not clearly core or cavity: all of it but the pieces that
 * reach only the top or only the bottom of the block (a piece reaching both, or neither, cannot be moulded).
 */
function unpartedVolume(mould, tools, dir, top, bottom, total) {
  const R = rep();
  let split;
  try { split = splitWith(mould, tools); } catch { return Infinity; }
  let good = 0;
  for (const s of split.solids ?? []) { const r = reach(s, dir, top, bottom); if (r === 'top' || r === 'bottom') good += Math.abs(R.measureVolume(s)); }
  return Math.max(0, total - good);
}

// ───────────────────────── shut-off surfaces

/** A patch over a loop: the planar face when the loop is flat, else a filling surface through its edges. */
export function patchOf(wire, size) {
  const R = rep();
  const pts = wire.edges.flatMap((e) => [0, 0.2, 0.4, 0.6, 0.8].map((t) => vec(e.pointAt(t))));
  try {
    const face = R.makeFace(wire.clone());
    if (face.geomType === 'PLANE') {
      const n = unit(vec(face.normalAt(face.center))); const c = vec(face.center);
      if (pts.every((p) => Math.abs(dot(sub(p, c), n)) < size * 1e-7 + 1e-9)) return { patch: face, planar: true };
    }
  } catch { /* not flat */ }
  return { patch: R.makeNonPlanarFace(wire.clone()), planar: false };
}

/** A level plane across the whole block at height `h` along the pull (when no parting surface can be made). */
function levelPlane(body, dir, h, m) {
  const R = rep();
  const { u, v } = basis(dir);
  const S = sizeOf(body) + 4 * m;
  const [lo, hi] = body.boundingBox.bounds; const c = mul(add(lo, hi), 0.5);
  const o = add(sub(c, mul(dir, dot(c, dir))), mul(dir, h));
  const P = (a, b) => add(o, add(mul(u, a), mul(v, b)));
  return R.makePolygon([P(-S, -S), P(S, -S), P(S, S), P(-S, S)]);
}

/**
 * The openings that need a shut-off for a pull along `dir`: inner loops of any face (planar or curved, square to
 * the pull or not), patched flat or by a filling surface. With every opening patched, the patches are dropped
 * again while the mould space (split by the parting surface `surface`, made here when not given) parts no worse
 * without them; patches the mould cannot pull off (a pocket's mouth under a roof) are tried first, those nearer
 * the parting height (`height`, along dir; default the top) last, so
 * one patch per opening is kept and blind pockets get none. Returns [{ patch, area, w, uv, planar }].
 */
export function throughOpenings(body, dir, { height = null, surface = null, margin = null } = {}) {
  const R = rep();
  const d = unit(dir); const size = sizeOf(body);
  const { u, v } = basis(d);
  const cands = [];
  for (const face of body.faces) {
    for (const wire of face.clone().innerWires()) {
      let p;
      try { p = patchOf(wire, size); } catch { continue; }
      let area = 0; try { area = R.measureArea(p.patch); } catch { continue; }
      if (!(area > 1e-9)) continue;
      const c = vec(p.patch.center);
      cands.push({ patch: p.patch, planar: p.planar, area, w: dot(c, d), uv: [dot(c, u), dot(c, v)] });
    }
  }
  if (!cands.length) return [];
  // A patch across the pull must let the mould pull off both its sides (a hole's pin, not the mouth of a pocket
  // under a roof): the others go first when patches are dropped.
  const rays = rayCaster(body, d);
  try {
    for (const c of cands) {
      const pts = faceSamples(c.patch, 3, size);
      const across = pts.filter((r) => Math.abs(dot(r.n, d)) > 0.5);
      c.releases = !across.length || across.every((r) => !rays.blocked(add(r.p, mul(d, rays.eps)), 1) && !rays.blocked(sub(r.p, mul(d, rays.eps)), -1));
    }
  } finally { rays.delete(); }
  const m = margin ?? Math.max(2, size * 0.1);
  let surf = surface;
  if (!surf) { try { surf = partingSurfaceOf(body, d, m * 2 + 10).surface; } catch { surf = null; } }
  const target = height ?? Math.max(...cands.map((x) => x.w));
  if (!surf) surf = levelPlane(body, d, height ?? (() => { const [lo, hi] = body.boundingBox.bounds; return dot(mul(add(lo, hi), 0.5), d); })(), m);
  const { block, top, bottom } = blockOf(body, d, m);
  const mould = block.cut(body.clone());
  const total = Math.abs(R.measureVolume(mould));
  const tol = total * 1e-6;
  const bad = (list) => unpartedVolume(mould, [surf, ...list.map((c) => c.patch)], d, top, bottom, total);
  // The parting surface alone parts the block: no opening needs a patch.
  if (bad([]) <= tol) return [];
  // Every opening patched, then patches dropped (farthest from the parting height first) while the mould space
  // parts no worse without them: what is left is one patch per opening that joins core and cavity.
  const keep = [...cands].sort((a, b) => Number(b.releases) - Number(a.releases) || Math.abs(a.w - target) - Math.abs(b.w - target) || b.area - a.area);
  let cur = bad(keep);
  for (const c of [...keep].reverse()) {
    const rest = keep.filter((x) => x !== c);
    const next = bad(rest);
    if (next <= cur + tol) { keep.splice(keep.indexOf(c), 1); cur = next; }
  }
  const out = keep;
  return out;
}

function buildShutOff(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const { dir } = pullOf(f, ctx);
  const height = f.at === 'top' ? null : ctx.parting?.height ?? null;
  const openings = throughOpenings(ctx.body, dir, { height });
  if (!openings.length) throw codeError('no-openings');
  ctx.shutOff = openings.map((o) => o.patch);
  const surface = openings.length === 1 ? openings[0].patch.clone() : R.makeCompound(openings.map((o) => o.patch.clone()));
  return { surface, shutOff: { count: openings.length, area: openings.reduce((s, o) => s + o.area, 0), filled: openings.filter((o) => !o.planar).length } };
}

// ───────────────────────── parting surface

/** The edges grouped into connected loops (by their end points). */
export function edgeLoops(edges, tol = 1e-6) {
  const key = (p) => p.map((x) => Math.round(x / tol)).join(',');
  const ends = edges.map((e) => [key(vec(e.startPoint)), key(vec(e.endPoint))]);
  const seen = new Set(); const loops = [];
  for (let i = 0; i < edges.length; i++) {
    if (seen.has(i)) continue;
    const loop = []; const stack = [i]; seen.add(i);
    while (stack.length) {
      const k = stack.pop(); loop.push(edges[k]);
      for (let j = 0; j < edges.length; j++) if (!seen.has(j) && ends[j].some((p) => ends[k].includes(p))) { seen.add(j); stack.push(j); }
    }
    loops.push(loop);
  }
  return loops;
}

/** Sews faces into a shell (shared side lines become one edge); the plain compound when sewing fails. */
function sewn(faces, tol) {
  const R = rep(); const oc = R.getOC();
  if (faces.length === 1) return faces[0];
  const sw = new oc.BRepBuilderAPI_Sewing(tol, true, true, true, false);
  try {
    for (const f of faces) sw.Add(f.wrapped);
    sw.Perform(new oc.Message_ProgressRange());
    const out = R.cast(sw.SewedShape());
    if (out.faces.length >= faces.length) return out;
  } catch { /* the compound */ } finally { sw.delete(); }
  return R.makeCompound(faces);
}

const rotateAbout = (p, axis, a) => {
  const c = Math.cos(a); const s = Math.sin(a);
  return add(add(mul(p, c), mul(cross(axis, p), s)), mul(axis, dot(axis, p) * (1 - c)));
};

/**
 * Strips that follow a parting loop (records { edge, core, other } from partingLoops) outward by `D`: each edge
 * joined to its copy pushed along its outward direction — 'normal': square to the pull, along the other face's
 * normal (the wall the line runs on); 'tangent': on the tangent plane of the face most square to the pull,
 * square to the edge. At a convex corner a fan of flat triangles closes the gap between the two strips; at a
 * concave one both strips share a mitred side line. Returns { faces, fans }.
 */
export function followingStrips(recs, dir, D, mode = 'normal', { centre = null } = {}) {
  const R = rep(); const oc = R.getOC();
  const d = unit(dir);
  const all = recs.flatMap((r) => [vec(r.edge.startPoint), vec(r.edge.endPoint)]);
  const size = Math.max(1e-6, ...all.flatMap((p) => all.map((q) => len(sub(p, q)))));
  const ctr = centre ?? mul(all.reduce((a, p) => add(a, p), [0, 0, 0]), 1 / Math.max(1, all.length));
  const across = (n) => unit(sub(n, mul(d, dot(n, d))));
  const nOf = (face, p) => { try { return unit(vec(face.normalAt(p))); } catch { return [0, 0, 0]; } };
  const nonzero = (a) => len(a) > 1e-6;
  const outward = (r, e, p, t) => {
    const nO = nOf(r.other, p); const nC = nOf(r.core, p);
    let o = across(nO);
    if (!nonzero(o)) o = across(nC);
    if (!nonzero(o)) o = across(sub(p, ctr));
    if (mode === 'tangent') {
      const f = Math.abs(dot(nC, d)) >= Math.abs(dot(nO, d)) ? nC : nO;
      let tg = [0, 0, 0]; try { tg = unit(vec(e.tangentAt(t))); } catch { /* none */ }
      let ot = unit(cross(tg, f));
      if (dot(ot, add(nC, nO)) < 0 || (Math.abs(dot(add(nC, nO), ot)) < 1e-9 && dot(ot, o) < 0)) ot = mul(ot, -1);
      if (nonzero(ot) && Math.abs(dot(ot, d)) < 0.98) o = ot;
    }
    return o;
  };
  const items = recs.map((r) => {
    const e = forward(r.edge);
    const K = e.geomType === 'LINE' ? 1 : 16;
    const ts = Array.from({ length: K + 1 }, (_, k) => k / K);
    const pts = ts.map((t) => vec(e.pointAt(t)));
    // Normals a hair inside the edge: at an end the face may be singular (a cone's apex has no normal).
    const os = ts.map((t) => { const tt = Math.min(1 - 1e-4, Math.max(1e-4, t)); return outward(r, e, vec(e.pointAt(tt)), tt); });
    let tg0 = [0, 0, 0]; let tg1 = [0, 0, 0];
    try { tg0 = unit(vec(e.tangentAt(0))); tg1 = unit(vec(e.tangentAt(1))); } catch { /* none */ }
    return { e, pts, os, tg0, tg1 };
  });
  // Corners: edge ends within a small distance are one vertex (the kernel's fuzzy split leaves ends ~1e-7 apart).
  const tolV = size * 1e-5;
  const corners = [];
  items.forEach((it, i) => {
    for (const end of [0, 1]) {
      const p = end ? it.pts.at(-1) : it.pts[0];
      let c = corners.find((x) => len(sub(x.p, p)) < tolV);
      if (!c) { c = { p, list: [] }; corners.push(c); }
      c.list.push({ i, end });
    }
  });
  const at = new Map(corners.map((c, k) => [k, c.list]));
  const fans = [];
  for (const list of at.values()) {
    if (list.length !== 2) continue;
    const [A, B] = list;
    const a = items[A.i]; const b = items[B.i];
    const oA = A.end ? a.os.at(-1) : a.os[0]; const oB = B.end ? b.os.at(-1) : b.os[0];
    const theta = Math.acos(Math.max(-1, Math.min(1, dot(oA, oB))));
    if (theta < 1e-6) continue;
    // Convex when each outward direction points back along the other edge (works when an edge arrives across the pull).
    const arriveA = A.end ? a.tg1 : mul(a.tg0, -1); const leaveB = B.end ? mul(b.tg1, -1) : b.tg0;
    const V = A.end ? a.pts.at(-1) : a.pts[0];
    if (dot(oB, arriveA) - dot(oA, leaveB) > 1e-9) fans.push({ V, oA, oB, theta });
    else {
      const miter = mul(unit(add(oA, oB)), 1 / Math.max(0.25, Math.cos(theta / 2)));
      if (A.end) a.os[a.os.length - 1] = miter; else a.os[0] = miter;
      if (B.end) b.os[b.os.length - 1] = miter; else b.os[0] = miter;
    }
  }
  const faces = [];
  for (const it of items) {
    const q = it.pts.map((p, k) => add(p, mul(it.os[k], D)));
    const offset = q.length === 2 ? R.makeLine(q[0], q[1]) : R.makeBSplineApproximation(q, { tolerance: size * 1e-7 + 1e-9, smoothing: null, degMax: 3, degMin: 1 });
    const ts = new oc.BRepOffsetAPI_ThruSections(false, true, 1e-6);
    try {
      ts.AddWire(R.assembleWire([it.e]).wrapped);
      ts.AddWire(R.assembleWire([offset]).wrapped);
      ts.Build(new oc.Message_ProgressRange());
      if (ts.IsDone()) faces.push(...R.cast(ts.Shape()).faces);
    } finally { ts.delete(); }
  }
  for (const { V, oA, oB, theta } of fans) {
    let axis = unit(cross(oA, oB));
    if (!nonzero(axis)) axis = d;
    const m = Math.max(1, Math.ceil(theta / (Math.PI / 6)));
    const dirs = Array.from({ length: m + 1 }, (_, i) => rotateAbout(oA, axis, (theta * i) / m));
    for (let i = 0; i < m; i++) faces.push(R.makePolygon([V, add(V, mul(dirs[i], D)), add(V, mul(dirs[i + 1], D))]));
  }
  return { faces, fans: fans.length };
}

/**
 * The parting surface of the body for a pull along `dir`: from the outer parting loop, `distance` outward. Level
 * parting line → one planar face (a rectangle around the part with its outline cut out); otherwise strips that
 * follow the line (`mode`: 'normal' | 'tangent' | 'ruled'). Returns { surface, planar, height, loop (edges),
 * mode, faces (count), split (faces split at their silhouette) }.
 */
export function partingSurfaceOf(body, dir, distance = 30, { mode = 'normal' } = {}) {
  const R = rep();
  const d = unit(dir);
  const pl = partingLoops(body, d);
  if (pl.outer < 0) throw codeError('no-edges');
  const recs = pl.loops[pl.outer];
  const outer = recs.map((r) => r.edge);
  const { u, v } = basis(d);
  const ws = outer.flatMap((e) => [0, 0.25, 0.5, 0.75, 1].map((t) => dot(vec(e.pointAt(t)), d)));
  const height = ws.reduce((s, x) => s + x, 0) / ws.length;
  const size = sizeOf(body);
  const planar = Math.max(...ws) - Math.min(...ws) < size * 1e-6;
  const D = Math.max(1, num(distance, 30));
  const ctr = (() => { const [lo, hi] = body.boundingBox.bounds; return mul(add(lo, hi), 0.5); })();
  if (planar) {
    const pts = outer.flatMap((e) => [0, 0.5, 1].map((t) => vec(e.pointAt(t))));
    const us = pts.map((p) => dot(p, u)); const vs = pts.map((p) => dot(p, v));
    const u0 = Math.min(...us) - D; const u1 = Math.max(...us) + D; const v0 = Math.min(...vs) - D; const v1 = Math.max(...vs) + D;
    const P = (a, b) => add(add(mul(u, a), mul(v, b)), mul(d, height));
    const c = [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)];
    const rect = R.assembleWire(c.map((p, i) => R.makeLine(p, c[(i + 1) % 4])));
    const hole = R.assembleWire(outer.map((e) => e.clone()));
    return { surface: R.addHolesInFace(R.makeFace(rect), [hole]), planar, height, loop: outer, mode: 'planar', faces: 1, split: pl.split };
  }
  const m = PARTING_MODES.includes(mode) ? mode : 'normal';
  const faces = m === 'ruled' ? ruledStrips(outer, d, ctr, D) : followingStrips(recs, d, D, m, { centre: ctr }).faces;
  if (!faces.length) throw codeError('kernel');
  return { surface: sewn(faces, size * 1e-5), planar, height, loop: outer, mode: m, faces: faces.length, split: pl.split };
}

/**
 * Ruled strips from edges outward: each edge joined to the straight line between its ends pushed `D` away from
 * `ctr` across the pull `dir` (edges that share an end share the side line there). Returns the strip faces.
 */
export function ruledStrips(edges, dir, ctr, D) {
  const R = rep(); const oc = R.getOC();
  const { u } = basis(dir);
  const push = (p) => { const r = sub(p, ctr); const acr = sub(r, mul(dir, dot(r, dir))); const o = unit(acr); return add(p, mul(o.some(Boolean) ? o : u, D)); };
  const strips = [];
  for (const edge of edges) {
    const e = forward(edge);
    const a = vec(e.startPoint); const b = vec(e.endPoint);
    const ts = new oc.BRepOffsetAPI_ThruSections(false, true, 1e-6);
    try {
      ts.AddWire(R.assembleWire([e]).wrapped);
      ts.AddWire(R.assembleWire([R.makeLine(push(a), push(b))]).wrapped);
      ts.Build(new oc.Message_ProgressRange());
      if (ts.IsDone()) strips.push(...R.cast(ts.Shape()).faces);
    } finally { ts.delete(); }
  }
  return strips;
}

function buildPartingSurface(f, ctx) {
  if (!ctx.body) throw codeError('no-body');
  const { dir, key } = pullOf(f, ctx);
  const mode = PARTING_MODES.includes(f.mode) ? f.mode : 'normal';
  const ps = partingSurfaceOf(ctx.body, dir, num(f.distance, 30), { mode });
  ctx.partingSurface = { shape: ps.surface, dir, key, height: ps.height, planar: ps.planar, distance: num(f.distance, 30), mode };
  ctx.parting ??= { dir, height: ps.height, key };
  const undercuts = undercutCount(ctx.body, dir);
  return { surface: ps.surface, partingSurface: { planar: ps.planar, height: ps.height, edges: ps.loop.length, mode: ps.mode, faces: ps.faces, split: ps.split }, undercuts };
}

// ───────────────────────── core and cavity by surfaces

/**
 * Core and cavity: the tooling block (`margin` around the part) minus the part, split by the parting surface and
 * the shut-off patches; pieces reaching the block's top (along the pull) are the cavity, those reaching its bottom
 * the core. Returns { cavity, core, pieces }. Throws when the surfaces do not part the block.
 */
export function coreCavity(body, { dir, surface, shutOffs = [], margin = 10 }) {
  const R = rep();
  const m = Math.max(1, num(margin, 10));
  const { block, top, bottom } = blockOf(body, dir, m);
  const mould = block.cut(body.clone());
  const split = splitWith(mould, [surface.clone(), ...shutOffs.map((s) => s.clone())]);
  const solids = split.solids ?? [];
  if (solids.length < 2) throw codeError('not-parted');
  const cav = []; const cor = [];
  for (const s of solids) {
    const r = reach(s, dir, top, bottom);
    if (r === 'top') cav.push(s);
    else if (r === 'bottom') cor.push(s);
    else throw codeError('not-parted');
  }
  if (!cav.length || !cor.length) throw codeError('not-parted');
  const join = (list) => (list.length === 1 ? list[0] : list.slice(1).reduce((acc, s) => { try { return acc.fuse(s); } catch { return R.makeCompound([acc, s]); } }, list[0]));
  return { cavity: join(cav), core: join(cor), pieces: solids.length };
}

/** toolingSplit with the part's parting surface and shut-offs (advanced.js hands over to this when they exist). */
export function toolingSplitBySurfaces(f, ctx) {
  const R = rep();
  const ps = ctx.partingSurface;
  const { dir } = ps ?? pullOf(f, ctx);
  const surface = ps?.shape ?? partingSurfaceOf(ctx.body, dir, num(f.margin, 10) * 2 + 10).surface;
  // The strips' outer border (corner fans) lies at least cos 15° of the distance out: the block stays inside it.
  const margin = Math.max(1, Math.min(num(f.margin, 10), (ps?.distance ?? Infinity) * 0.95 - 0.5));
  // Openings without shut-off patches would join core and cavity: patch them here.
  const shutOffs = ctx.shutOff ?? throughOpenings(ctx.body, dir, { height: ps?.height ?? ctx.parting?.height ?? null, surface, margin }).map((o) => o.patch);
  const { cavity, core, pieces } = coreCavity(ctx.body, { dir, surface, shutOffs, margin });
  const gap = Math.max(0, num(f.gap, 30));
  const show = f.show ?? 'both';
  const out = [];
  if (show !== 'core') out.push(cavity.translate(mul(dir, gap)));
  if (show !== 'cavity') out.push(core.translate(mul(dir, -gap)));
  if (f.keepPart) out.push(ctx.body.clone());
  const undercuts = undercutCount(ctx.body, dir);
  return { body: out.length === 1 ? out[0] : R.makeCompound(out), tooling: { dir, bySurface: true, pieces, shutOffs: shutOffs.length }, undercuts };
}

export function buildMoldMore(f, ctx) {
  if (f.type === 'shutOff') return buildShutOff(f, ctx);
  if (f.type === 'partingSurface') return buildPartingSurface(f, ctx);
  throw codeError('unknown-feature', { type: f.type });
}
