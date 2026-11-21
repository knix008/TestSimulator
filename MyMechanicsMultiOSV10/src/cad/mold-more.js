// More mold tools, on top of the parting line and tooling split of advanced.js:
//   shut-off surfaces — the openings that go right through the part along the pull direction (a hole in a plate,
//     a window in a lid) filled with patches, so the parting surface is closed and core and cavity meet there;
//   parting surface — from the parting line outward: a plane with the part's outline cut out when the parting line
//     is flat, otherwise ruled strips running out from every parting edge (neighbours share their side lines);
//   core / cavity by surfaces — the tooling block minus the part split by the parting surface and the shut-offs
//     (toolingSplit uses it when the part has a parting surface), so stepped parting lines and through openings
//     come apart properly; the pieces touching the top of the block are the cavity, the bottom the core;
//   undercut warning — the faces neither mould half can release (evaluate-more.js), counted on each of them.
import { rep } from './kernel.js';
import { codeError } from './features.js';
import { partingEdges } from './advanced.js';
import { undercutAnalysis } from './evaluate-more.js';

const AXIS_DIRS = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], '-x': [-1, 0, 0], '-y': [0, -1, 0], '-z': [0, 0, -1] };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-15 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
const vec = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

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

/** A shape swept along a vector (faces → solids, edges → faces). */
function prism(shape, v) {
  const R = rep(); const oc = R.getOC();
  const vv = new R.Vector(v);
  const mk = new oc.BRepPrimAPI_MakePrism(shape.wrapped, vv.wrapped, false, true);
  const out = R.cast(mk.Shape());
  mk.delete(); vv.delete?.();
  return out;
}

/** Splits `shape` with the tools (shapes) by the kernel's splitter. */
export function splitWith(shape, tools) {
  const R = rep(); const oc = R.getOC();
  const args = new oc.NCollection_List_TopoDS_Shape(); args.Append(shape.wrapped);
  const list = new oc.NCollection_List_TopoDS_Shape(); for (const t of tools) list.Append(t.wrapped);
  const sp = new oc.BRepAlgoAPI_Splitter();
  sp.SetArguments(args); sp.SetTools(list); sp.Build(new oc.Message_ProgressRange());
  if (sp.HasErrors()) { sp.delete(); throw codeError('kernel'); }
  const out = R.cast(sp.Shape());
  sp.delete();
  return out;
}

/** How many faces of the body neither mould half can release along `dir` (the undercut warning); 0 when unknown. */
export function undercutCount(body, dir) {
  try { return undercutAnalysis(body.mesh({ tolerance: Math.max(0.02, sizeOf(body) * 0.003), angularTolerance: 0.4 }), dir).undercut; } catch { return 0; }
}

// ───────────────────────── shut-off surfaces

/**
 * The openings that go right through the body along `dir`: inner loops of the faces square to the pull whose
 * footprint, swept across the whole part, meets no material. One patch per opening, on the face nearest the
 * parting height (`height`, along dir; default the top). Returns [{ patch (face), area, w (height along dir) }].
 */
export function throughOpenings(body, dir, { height = null } = {}) {
  const R = rep();
  const size = sizeOf(body);
  const [lo, hi] = body.boundingBox.bounds;
  const span = Math.hypot(...sub(hi, lo)) * 2 + 10;
  const { u, v } = basis(dir);
  const found = [];
  for (const face of body.faces) {
    if (face.geomType !== 'PLANE') continue;
    let n;
    try { n = unit(vec(face.normalAt(face.center))); } catch { continue; }
    if (Math.abs(dot(n, dir)) < 0.999) continue;
    for (const wire of face.clone().innerWires()) {
      let patch;
      try { patch = R.makeFace(wire); } catch { continue; }
      const area = R.measureArea(patch);
      if (!(area > 1e-9)) continue;
      const c = vec(patch.center);
      // Through: the opening's footprint swept from below the part to above it holds none of it.
      let through = false;
      try {
        const tool = prism(patch.clone().translate(mul(dir, -span / 2)), mul(dir, span));
        const common = R.measureVolume(body.clone().intersect(tool));
        through = common < area * size * 1e-6;
      } catch { through = false; }
      if (!through) continue;
      found.push({ patch, area, w: dot(c, dir), uv: [dot(c, u), dot(c, v)] });
    }
  }
  // An opening shows on both faces it goes through: keep one per opening.
  const target = height ?? Math.max(...found.map((x) => x.w), -Infinity);
  const out = [];
  for (const x of found.sort((a, b) => Math.abs(a.w - target) - Math.abs(b.w - target))) {
    if (out.some((y) => Math.hypot(y.uv[0] - x.uv[0], y.uv[1] - x.uv[1]) < size * 1e-5 && Math.abs(y.area - x.area) < x.area * 1e-4)) continue;
    out.push(x);
  }
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
  return { surface, shutOff: { count: openings.length, area: openings.reduce((s, o) => s + o.area, 0) } };
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

/** Area of the loop's footprint across the pull (its bounding rectangle in u, v): picks the outer loop. */
function footprint(loop, u, v) {
  const pts = loop.flatMap((e) => [0, 0.25, 0.5, 0.75, 1].map((t) => vec(e.pointAt(t))));
  const us = pts.map((p) => dot(p, u)); const vs = pts.map((p) => dot(p, v));
  return (Math.max(...us) - Math.min(...us)) * (Math.max(...vs) - Math.min(...vs));
}

/**
 * The parting surface of the body for a pull along `dir`: from the outer loop of its parting line, `distance`
 * outward. Flat parting line → one planar face (a rectangle around the part with its outline cut out); otherwise
 * ruled strips from each parting edge out along the line from the part's middle through its ends.
 * Returns { surface, planar, height, loop (edges) }.
 */
export function partingSurfaceOf(body, dir, distance = 30) {
  const R = rep(); const oc = R.getOC();
  const edges = partingEdges(body, dir);
  if (!edges.length) throw codeError('no-edges');
  const { u, v } = basis(dir);
  const loops = edgeLoops(edges, sizeOf(body) * 1e-7);
  const outer = loops.reduce((m, l) => (footprint(l, u, v) > footprint(m, u, v) ? l : m), loops[0]);
  const ws = outer.flatMap((e) => [0, 0.5, 1].map((t) => dot(vec(e.pointAt(t)), dir)));
  const height = ws.reduce((s, x) => s + x, 0) / ws.length;
  const planar = Math.max(...ws) - Math.min(...ws) < sizeOf(body) * 1e-6;
  const D = Math.max(1, num(distance, 30));
  if (planar) {
    const pts = outer.flatMap((e) => [0, 0.5, 1].map((t) => vec(e.pointAt(t))));
    const us = pts.map((p) => dot(p, u)); const vs = pts.map((p) => dot(p, v));
    const u0 = Math.min(...us) - D; const u1 = Math.max(...us) + D; const v0 = Math.min(...vs) - D; const v1 = Math.max(...vs) + D;
    const P = (a, b) => add(add(mul(u, a), mul(v, b)), mul(dir, height));
    const c = [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)];
    const rect = R.assembleWire(c.map((p, i) => R.makeLine(p, c[(i + 1) % 4])));
    const hole = R.assembleWire(outer.map((e) => e.clone()));
    return { surface: R.addHolesInFace(R.makeFace(rect), [hole]), planar, height, loop: outer };
  }
  // Ruled strips: each parting edge to its copy pushed out (the push at a shared end is the same for both edges).
  const ctr = (() => { const [lo, hi] = body.boundingBox.bounds; return mul(add(lo, hi), 0.5); })();
  const strips = ruledStrips(outer, dir, ctr, D);
  if (!strips.length) throw codeError('kernel');
  return { surface: strips.length === 1 ? strips[0] : R.makeCompound(strips), planar, height, loop: outer };
}

/**
 * Ruled strips from edges outward: each edge joined to the straight line between its ends pushed `D` away from
 * `ctr` across the pull `dir` (edges that share an end share the side line there). Returns the strip faces.
 */
export function ruledStrips(edges, dir, ctr, D) {
  const R = rep(); const oc = R.getOC();
  const { u } = basis(dir);
  const push = (p) => { const r = sub(p, ctr); const across = sub(r, mul(dir, dot(r, dir))); const o = unit(across); return add(p, mul(o.some(Boolean) ? o : u, D)); };
  const strips = [];
  for (const e of edges) {
    const a = vec(e.startPoint); const b = vec(e.endPoint);
    const ts = new oc.BRepOffsetAPI_ThruSections(false, true, 1e-6);
    try {
      ts.AddWire(R.assembleWire([e.clone()]).wrapped);
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
  const ps = partingSurfaceOf(ctx.body, dir, num(f.distance, 30));
  ctx.partingSurface = { shape: ps.surface, dir, key, height: ps.height, planar: ps.planar, distance: num(f.distance, 30) };
  ctx.parting ??= { dir, height: ps.height, key };
  const undercuts = undercutCount(ctx.body, dir);
  return { surface: ps.surface, partingSurface: { planar: ps.planar, height: ps.height, edges: ps.loop.length }, undercuts };
}

// ───────────────────────── core and cavity by surfaces

/**
 * Core and cavity: the tooling block (`margin` around the part) minus the part, split by the parting surface and
 * the shut-off patches; pieces reaching the block's top (along the pull) are the cavity, those reaching its bottom
 * the core. Returns { cavity, core, pieces, undercuts }. Throws when the surfaces do not part the block.
 */
export function coreCavity(body, { dir, surface, shutOffs = [], margin = 10 }) {
  const R = rep();
  const [lo, hi] = body.boundingBox.bounds;
  const m = Math.max(1, num(margin, 10));
  const block = R.makeBox(lo.map((x) => x - m), hi.map((x) => x + m));
  const mould = block.cut(body.clone());
  const split = splitWith(mould, [surface.clone(), ...shutOffs.map((s) => s.clone())]);
  const solids = split.solids ?? [];
  if (solids.length < 2) throw codeError('not-parted');
  const top = Math.max(...[lo, hi].flatMap((p) => [-m, m].map((k) => dot(p, dir) + k)));
  const bottom = Math.min(...[lo, hi].flatMap((p) => [-m, m].map((k) => dot(p, dir) + k)));
  const span = top - bottom;
  const cav = []; const cor = [];
  for (const s of solids) {
    const [a, b] = s.boundingBox.bounds;
    const ws = [];
    for (const x of [a[0], b[0]]) for (const y of [a[1], b[1]]) for (const z of [a[2], b[2]]) ws.push(dot([x, y, z], dir));
    const wMax = Math.max(...ws); const wMin = Math.min(...ws);
    const touchTop = Math.abs(wMax - top) < span * 1e-6; const touchBottom = Math.abs(wMin - bottom) < span * 1e-6;
    if (touchTop && !touchBottom) cav.push(s);
    else if (touchBottom && !touchTop) cor.push(s);
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
  // Through openings without shut-off patches would join core and cavity: patch them here.
  const shutOffs = ctx.shutOff ?? throughOpenings(ctx.body, dir, { height: ps?.height ?? ctx.parting?.height ?? null }).map((o) => o.patch);
  const margin = Math.min(num(f.margin, 10), (ps?.distance ?? Infinity) - 0.5);
  const { cavity, core, pieces } = coreCavity(ctx.body, { dir, surface, shutOffs, margin: Math.max(1, margin) });
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
