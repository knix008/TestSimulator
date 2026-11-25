// More surface features (no DOM): swept surface (an open or closed profile swept as a skin), cut with surface (the
// body's material on one side of a surface goes), delete hole (a surface's inner loops filled back), untrim (a
// surface back to its natural bounds or with its holes closed), mid-surface (half way between facing faces of a
// thin body), radiate surface (outward from edges in a plane, e.g. for a parting surface), flatten surface (a face
// developed exactly when it can be — plane, cylinder, cone — else laid out by least-squares conformal mapping).
import { rep } from './kernel.js';
import { findEdges, findFace, normalize, crossV, faceWires } from './refs.js';
import { codeError, sketchOf, resolvePlane, frame as makeFrame, STD_PLANES } from './features.js';
import { sketchWire, pathOf, squareToPath } from './advanced.js';
import { sweepMoreTool } from './sweep-more.js';
import { profiles } from './sketch.js';

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vec = (v) => (Array.isArray(v) ? v : [v.x, v.y, v.z]);

export function buildSurfaceMore(f, ctx) {
  switch (f.type) {
    case 'surfaceSweep': return buildSurfaceSweep(f, ctx);
    case 'cutWithSurface': return buildCutWithSurface(f, ctx);
    case 'deleteHole': return buildDeleteHole(f, ctx);
    case 'untrimSurface': return buildUntrim(f, ctx);
    case 'midSurface': return buildMidSurface(f, ctx);
    case 'radiateSurface': return buildRadiate(f, ctx);
    case 'flattenSurface': return buildFlattenSurface(f, ctx);
    default: throw codeError('unknown-feature', { type: f.type });
  }
}

const facesOf = (shape) => { const R = rep(); return [...R.iterTopo(shape.wrapped, 'face')].map((x) => R.cast(x)); };

/** Faces sewn into one shell (or the single face). */
function sewn(faces) {
  const R = rep(); const oc = R.getOC();
  if (faces.length === 1) return faces[0];
  const sew = new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false);
  for (const fc of faces) sew.Add(fc.wrapped);
  sew.Perform(new oc.Message_ProgressRange());
  const out = R.cast(sew.SewedShape());
  sew.delete();
  return out;
}

// ───────────────────────── swept surface

/** A swept surface: the profile sketch's curves (an open chain or a closed loop) swept along the path as a skin. */
function buildSurfaceSweep(f, ctx) {
  const R = rep();
  if (!f.path) throw codeError('no-path');
  const path = ctx.curves.has(f.path) ? ctx.curves.get(f.path) : (() => { const p = sketchOf({ sketch: f.path }, ctx, f.path); return sketchWire(p.sketch, p.frame); })();
  const circular = Boolean(f.circular);
  const prof = circular ? {} : sketchOf(f, ctx);
  // Start tangency: the profile turned square to the path at its start.
  const frame = prof.frame && f.startTangent === 'path' ? squareToPath(prof.frame, path) : prof.frame;
  const config = { transitionMode: f.transition === 'round' ? 'round' : f.transition === 'transformed' ? 'transformed' : 'right', frenet: Boolean(f.frenet) };
  const guideIds = [f.guide, ...(f.guides ?? [])].filter((x, i, all) => x && x !== f.path && all.indexOf(x) === i);
  const more = circular || Number(f.twist) || guideIds.length;
  if (!more) {
    const [skin] = R.genericSweep(sketchWire(prof.sketch, frame), path, config, true);
    return { surface: skin };
  }
  // Twist, guide curves (one: scale, more: through every one), circular profile — as the solid sweep, as a sheet;
  // an open profile is swept as it is (sweep-more.js).
  const openWire = circular || profiles(prof.sketch).length ? null : sketchWire(prof.sketch, frame);
  const skin = sweepMoreTool({ ...f, guide: guideIds[0] ?? null, guideWire: guideIds[0] ? pathOf(guideIds[0], ctx) : null, guideWires: guideIds.map((id) => pathOf(id, ctx)) }, path, config, prof.sketch, frame, { shell: true, openWire });
  return { surface: skin };
}

// ───────────────────────── cut with surface

/** The nearest point of a shape to p, and the outward normal of the face it lies on there. */
function nearestOnSurface(surface, p) {
  const R = rep(); const oc = R.getOC();
  const v = R.makeVertex(p);
  const ds = new oc.BRepExtrema_DistShapeShape(v.wrapped, surface.wrapped);
  try {
    if (!ds.IsDone() || ds.NbSolution() < 1) throw codeError('kernel');
    const q = ds.PointOnShape2(1);
    const at = [q.X(), q.Y(), q.Z()];
    const support = ds.SupportOnShape2(1);
    let n = null;
    if (support.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_FACE) n = normalize(vec(R.cast(support).normalAt(at)));
    else {
      // On an edge or a corner: the normal of a face of the surface through that point.
      for (const fc of facesOf(surface)) { try { const d = R.measureDistanceBetween(R.makeVertex(at), fc); if (d < 1e-7) { n = normalize(vec(fc.normalAt(at))); break; } } catch { /* next */ } }
    }
    return { at, n };
  } finally { ds.delete(); v.delete(); }
}

/**
 * Cut with surface: the body is split by the surface and the pieces on the side its normal points to are removed
 * (Flip keeps those and removes the others). The surface must cut the body through.
 */
function buildCutWithSurface(f, ctx) {
  const R = rep(); const oc = R.getOC();
  if (!ctx.body) throw codeError('no-body');
  const surface = ctx.surfaces.get(f.surface);
  if (!surface) throw codeError('no-surfaces');
  const args = new oc.NCollection_List_TopoDS_Shape(); args.Append(ctx.body.wrapped);
  const tools = new oc.NCollection_List_TopoDS_Shape(); tools.Append(surface.wrapped);
  const sp = new oc.BRepAlgoAPI_Splitter();
  sp.SetArguments(args); sp.SetTools(tools); sp.Build(new oc.Message_ProgressRange());
  if (sp.HasErrors()) { sp.delete(); throw codeError('kernel'); }
  const split = R.cast(sp.Shape());
  sp.delete();
  const pieces = [...R.iterTopo(split.wrapped, 'solid')].map((x) => R.cast(x));
  if (pieces.length < 2) throw codeError('surface-misses');
  const keep = [];
  for (const piece of pieces) {
    const props = R.measureShapeVolumeProperties(piece);
    const c = [...props.centerOfMass];
    props.delete?.();
    // The side of a piece: a point well inside it (its centroid when that is inside, else a point of a face).
    const { at, n } = nearestOnSurface(surface, c);
    if (!n) throw codeError('kernel');
    const side = dot(sub(c, at), n);
    if ((side < 0) !== Boolean(f.flip)) keep.push(piece);
  }
  if (!keep.length) throw codeError('cut-everything');
  return { body: keep.length === 1 ? keep[0] : R.makeCompound(keep) };
}

// ───────────────────────── delete hole, untrim

/** A face rebuilt on its own surface inside `wire` only (no holes). */
function faceOnSurface(face, wire) {
  const R = rep(); const oc = R.getOC();
  const surf = oc.BRep_Tool.Surface(face.wrapped);
  const mk = new oc.BRepBuilderAPI_MakeFace(surf, wire.wrapped, true);
  if (!mk.IsDone()) { mk.delete(); throw codeError('kernel'); }
  let out = mk.Face();
  mk.delete();
  const fix = new oc.ShapeFix_Face(out);
  fix.Perform();
  out = fix.Face();
  fix.delete();
  const made = R.cast(out);
  // Keep the face's side: the rebuilt face points the way the original did.
  try {
    const p = vec(face.pointOnSurface(0.5, 0.5));
    if (dot(vec(made.normalAt(p)), vec(face.normalAt(p))) < 0) return R.cast(made.wrapped.Reversed());
  } catch { /* kept as made */ }
  return made;
}

/**
 * Delete hole: the surface's holes (inner loops of its faces) are filled back with the faces' own surfaces. With
 * `edges` picked, only the holes those edges bound; otherwise all of them.
 */
function buildDeleteHole(f, ctx) {
  const surface = ctx.surfaces.get(f.surface);
  if (!surface) throw codeError('no-surfaces');
  const picked = (f.edges ?? []).length ? findEdges(surface, f.edges) : null;
  let filled = 0;
  const faces = facesOf(surface).map((fc) => {
    const { outer, inner: holes } = faceWires(fc);
    if (!holes.length) return fc;
    const R = rep();
    const remove = picked ? holes.filter((w) => w.edges.some((e) => picked.some((p) => p.isSame(e)))) : holes;
    if (!remove.length) return fc;
    filled += remove.length;
    let out = faceOnSurface(fc, outer);
    // Holes not picked are cut back in.
    const oc = R.getOC();
    for (const w of holes.filter((x) => !remove.includes(x))) { const mk = new oc.BRepBuilderAPI_MakeFace(out.wrapped, w.wrapped); out = R.cast(mk.Face()); mk.delete(); }
    return out;
  });
  if (!filled) throw codeError('no-holes');
  return { surface: sewn(faces), filled };
}

/** Untrim: `natural` — each face of the surface out to its surface's natural bounds; `holes` — its holes closed. */
function buildUntrim(f, ctx) {
  const R = rep(); const oc = R.getOC();
  const surface = ctx.surfaces.get(f.surface);
  if (!surface) throw codeError('no-surfaces');
  if (f.mode === 'holes') return buildDeleteHole({ surface: f.surface }, ctx);
  const faces = facesOf(surface).map((fc) => {
    const surf = oc.BRep_Tool.Surface(fc.wrapped);
    const s = surf;
    // A bounded surface (B-spline, Bézier) to its own parameter range; an unbounded one (plane, cylinder …) to the
    // parameter box of the face itself.
    const b = oc.BRepTools.UVBounds(fc.wrapped, 0, 0, 0, 0);
    let [u0, u1, v0, v1] = [b.UMin, b.UMax, b.VMin, b.VMax];
    try {
      const r = s.Bounds(0, 0, 0, 0);
      const [a0, a1, c0, c1] = r && typeof r === 'object' ? [r.U1, r.U2, r.V1, r.V2] : [NaN, NaN, NaN, NaN];
      if ([a0, a1].every(Number.isFinite) && Math.abs(a1 - a0) < 1e50) { u0 = a0; u1 = a1; }
      if ([c0, c1].every(Number.isFinite) && Math.abs(c1 - c0) < 1e50) { v0 = c0; v1 = c1; }
    } catch { /* the face's own box */ }
    const mk = new oc.BRepBuilderAPI_MakeFace(surf, u0, u1, v0, v1, 1e-7);
    if (!mk.IsDone()) { mk.delete(); throw codeError('kernel'); }
    const out = R.cast(mk.Face());
    mk.delete();
    return fc.wrapped.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED ? R.cast(out.wrapped.Reversed()) : out;
  });
  return { surface: sewn(faces) };
}

// ───────────────────────── mid-surface

/**
 * The facing pairs of a thin body: planar faces with opposite normals, parallel, at most `maxThickness` apart and
 * overlapping when one is projected onto the other. Returns [{ a, b, gap }].
 */
export function facingPairs(body, maxThickness) {
  const faces = body.faces.filter((fc) => fc.geomType === 'PLANE');
  const info = faces.map((fc) => ({ fc, n: normalize(vec(fc.normalAt(fc.center))), c: vec(fc.center) }));
  const pairs = []; const used = new Set();
  for (let i = 0; i < info.length; i++) {
    for (let j = i + 1; j < info.length; j++) {
      const A = info[i]; const B = info[j];
      if (used.has(i) || used.has(j)) continue;
      if (dot(A.n, B.n) > -1 + 1e-9) continue;
      const gap = dot(sub(B.c, A.c), A.n);
      // B lies behind A (inside the material): the wall between them is gap thick.
      if (!(gap < -1e-9 && -gap <= maxThickness + 1e-9)) continue;
      pairs.push({ a: A.fc, b: B.fc, gap: -gap, n: A.n });
      used.add(i); used.add(j);
    }
  }
  return pairs;
}

/**
 * Mid-surface: for each facing pair (picked as faces [a1, b1, a2, b2 …], or found automatically up to
 * `maxThickness`), face a moved half the wall thickness into the material and trimmed to where b lies behind it;
 * the pieces are sewn into one surface.
 */
function buildMidSurface(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  let pairs;
  const picked = (f.faces ?? []).map((sig) => findFace(ctx.body, sig)).filter(Boolean);
  if (picked.length >= 2) {
    pairs = [];
    for (let i = 0; i + 1 < picked.length; i += 2) {
      const a = picked[i]; const b = picked[i + 1];
      const n = normalize(vec(a.normalAt(a.center)));
      const gap = -dot(sub(vec(b.center), vec(a.center)), n);
      if (!(gap > 1e-9)) throw codeError('mid-not-facing');
      pairs.push({ a, b, gap, n });
    }
  } else pairs = facingPairs(ctx.body, Math.max(0.01, num(f.maxThickness, 10)));
  if (!pairs.length) throw codeError('mid-no-pairs');
  const faces = [];
  for (const { a, b, gap, n } of pairs) {
    const mid = a.clone().translate(mul(n, -gap / 2));
    // b's outline swept across the wall: the mid face keeps only what lies over b.
    const prism = R.basicFaceExtrusion(b.clone(), new R.Vector(mul(n, gap + 2))).translate(mul(n, -1));
    // A face is not a solid: the common part is taken with the kernel's boolean directly.
    const oc = R.getOC();
    const common = new oc.BRepAlgoAPI_Common(mid.wrapped, prism.wrapped, new oc.Message_ProgressRange());
    if (common.HasErrors()) { common.delete(); throw codeError('kernel'); }
    const piece = R.cast(common.Shape());
    common.delete();
    faces.push(...facesOf(piece));
  }
  if (!faces.length) throw codeError('mid-no-pairs');
  return { surface: sewn(faces), pairs: pairs.length };
}

// ───────────────────────── radiate surface

/**
 * Radiate surface: from edges lying in a plane parallel to the reference plane, a surface `distance` wide in that
 * plane, going away from the body (Flip: toward it). Closed edge loops give a flat ring; open chains a flat band.
 */
function buildRadiate(f, ctx) {
  const R = rep(); const oc = R.getOC();
  if (!ctx.body) throw codeError('no-body');
  const edges = findEdges(ctx.body, f.edges ?? []);
  if (!edges.length) throw codeError('edge-missing');
  const plane = String(f.plane ?? 'std:top');
  const fr = plane.startsWith('ref:') ? resolvePlane({ kind: 'ref', id: plane.slice(4) }, ctx) : makeFrame(STD_PLANES[plane.slice(4)] ?? STD_PLANES.top);
  const n = fr.normal;
  // All the edges must lie in one plane parallel to the reference plane.
  const level = dot(vec(edges[0].startPoint), n);
  for (const e of edges) for (const t of [0, 0.5, 1]) if (Math.abs(dot(vec(e.pointAt(t)), n) - level) > 1e-6) throw codeError('radiate-not-planar');
  const d = Math.max(0.01, num(f.distance, 5));
  let wire;
  try { wire = R.assembleWire(edges.map((e) => e.clone())); } catch { throw codeError('radiate-chain'); }
  const ends = [vec(edges[0].startPoint), vec(edges.at(-1).endPoint)];
  const closed = edges.length > 1 && Math.hypot(...sub(ends[0], ends[1])) < 1e-7 || (edges.length === 1 && Math.hypot(...sub(vec(edges[0].startPoint), vec(edges[0].endPoint))) < 1e-7);
  const offsetOf = (dist) => {
    const mk = new oc.BRepOffsetAPI_MakeOffset(wire.wrapped, oc.GeomAbs_JoinType.GeomAbs_Arc, !closed);
    mk.Perform(dist, 0);
    const ok = mk.IsDone();
    const s = ok ? R.cast(mk.Shape()) : null;
    mk.delete();
    if (!s) throw codeError('radiate-offset');
    const ws = [...R.iterTopo(s.wrapped, 'wire')].map((x) => R.cast(x));
    if (!ws.length) throw codeError('radiate-offset');
    return ws[0];
  };
  // Outward: the side where the body is not (tested a little way out from the middle of the first edge).
  const mid = vec(edges[0].pointAt(0.5)); const tan = normalize(vec(edges[0].tangentAt(0.5)));
  const side = normalize(crossV(n, tan));
  const eps = Math.min(d, 0.5) * 0.2;
  const inside = (p) => isInside(ctx.body, p, eps / 4);
  const probe = add(add(mid, mul(side, eps)), mul(n, -eps));
  const probe2 = add(add(mid, mul(side, -eps)), mul(n, -eps));
  let dir = inside(probe) && !inside(probe2) ? -1 : 1;
  if (f.flip) dir = -dir;
  // The offset's sign follows the wire's own direction: try one side, check the side it went to.
  let other = offsetOf(d);
  const pOther = vec(other.edges[0].pointAt(0.5));
  const went = Math.sign(dot(sub(pOther, mid), side)) || 1;
  if (went !== dir) other = offsetOf(-d);
  const ts = new oc.BRepOffsetAPI_ThruSections(false, true, 1e-6);
  ts.AddWire(wire.wrapped); ts.AddWire(other.wrapped);
  ts.Build(new oc.Message_ProgressRange());
  if (!ts.IsDone()) { ts.delete(); throw codeError('kernel'); }
  const surf = R.cast(ts.Shape());
  ts.delete();
  return { surface: surf };
}

/** Whether a point is inside a solid: a small cube around it is mostly material. */
function isInside(body, p, r) {
  const R = rep();
  try { return R.measureVolume(body.clone().intersect(R.makeBox(sub(p, [r, r, r]), add(p, [r, r, r])))) > 8 * r ** 3 * 0.5; } catch { return false; }
}

// ───────────────────────── flatten surface

/**
 * Flatten surface: one face laid out flat. A plane stays as it is; a cylinder or a cone is developed exactly (every
 * boundary point keeps its distances along the surface); any other face (a sphere, a torus, a B-spline …) is laid
 * out by least-squares conformal mapping of a fine mesh, scaled to keep its area. The flat face lies in the plane
 * tangent to the face at its middle, centred there. `distortion`: the range of triangle area ratios (1 = none).
 */
export function flattenFace(face, { meshTolerance = null } = {}) {
  const R = rep(); const oc = R.getOC();
  const ad = new oc.BRepAdaptor_Surface(face.wrapped, true);
  try {
    const type = face.geomType;
    const uv = oc.BRepTools.UVBounds(face.wrapped, 0, 0, 0, 0);
    const um = (uv.UMin + uv.UMax) / 2; const vm = (uv.VMin + uv.VMax) / 2;
    const P = (u, v) => { const p = ad.EvalD0(u, v); const out = [p.X(), p.Y(), p.Z()]; p.delete(); return out; };
    const at = P(um, vm);
    const d = 1e-6 * Math.max(1, Math.abs(uv.UMax - uv.UMin));
    const du = normalize(sub(P(um + d, vm), P(um - d, vm)));
    const nrm = normalize(vec(face.normalAt(at)));
    const xDir = du; const yDir = normalize(crossV(nrm, xDir));
    const fr = { origin: at, xDir, yDir, normal: nrm };
    if (type === 'PLANE') return { face: face.clone(), exact: true, distortion: [1, 1], frame: fr };
    let develop = null;
    if (type === 'CYLINDRE') {
      const r = ad.Cylinder().Radius();
      // (u, v) → (r·u, v): arc length round the axis and length along it.
      develop = (u, v) => [r * (u - um), v - vm];
    } else if (type === 'CONE') {
      // The cone from its own points: circles at v = 0 and v = 1 give the radius at the reference and the half angle.
      const ring = (v) => { const a = P(0, v); const b = P(Math.PI / 2, v); const c = P(Math.PI, v); const cen = mul(add(a, c), 0.5); return { r: Math.hypot(...sub(b, cen)) }; };
      const c0 = ring(0); const c1 = ring(1);
      const sinA = c1.r - c0.r; // v is the length along a generator
      if (Math.abs(sinA) < 1e-12) { const r = c0.r; develop = (u, v) => [r * (u - um), v - vm]; } else {
        // Polar development about the apex: radius = distance from the apex along a generator, angle = u·sin(half
        // angle); the middle of the face at the origin, its u direction along x.
        const s0 = c0.r / sinA; const sm = s0 + vm;
        develop = (u, v) => { const s = s0 + v; const phi = (u - um) * sinA; return [s * Math.sin(phi), s * Math.cos(phi) - sm]; };
      }
    }
    if (develop) return { ...developByPcurves(face, develop, fr), exact: true, distortion: [1, 1] };
    return lscmFlatten(face, fr, meshTolerance);
  } finally { ad.delete(); }
}

/** A face developed by mapping each boundary edge's (u, v) curve through `develop`, rebuilt as a planar face. */
function developByPcurves(face, develop, fr) {
  const R = rep(); const oc = R.getOC();
  const toW = ([x, y]) => add(fr.origin, add(mul(fr.xDir, x), mul(fr.yDir, y)));
  // Every occurrence of every edge, with its orientation: a closed cylinder's seam edge is in the wire twice (once
  // as u = 0, once as u = 2π), and each occurrence has its own (u, v) curve.
  const edgesOf = (wire) => {
    const out = [];
    const ex = new oc.TopExp_Explorer(wire.wrapped, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    for (; ex.More(); ex.Next()) out.push(oc.TopoDS.Edge(ex.Current()));
    ex.delete();
    return out;
  };
  const wires = faceWires(face);
  const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
  const loops = [wires.outer, ...wires.inner].map((wire) => {
    const pieces = edgesOf(wire).map((e) => {
      const c2 = new oc.BRepAdaptor_Curve2d(e, face.wrapped);
      const t0 = c2.FirstParameter(); const t1 = c2.LastParameter();
      const pts = [];
      const n = 256;
      for (let i = 0; i <= n; i++) { const p = c2.Value(t0 + ((t1 - t0) * i) / n); pts.push(develop(p.X(), p.Y())); p.delete(); }
      c2.delete();
      return pts;
    }).filter((pts) => !close(pts[0], pts.at(-1)) || pts.some((p) => !close(p, pts[0])));
    // Chain the pieces end to start (their order and direction in the wire are not known).
    const chain = [pieces.shift()];
    while (pieces.length) {
      const end = chain.at(-1).at(-1);
      let k = pieces.findIndex((p) => close(p[0], end));
      if (k >= 0) { chain.push(pieces.splice(k, 1)[0]); continue; }
      k = pieces.findIndex((p) => close(p.at(-1), end));
      if (k >= 0) { chain.push(pieces.splice(k, 1)[0].reverse()); continue; }
      throw codeError('flatten-boundary');
    }
    return chain.map((pts) => {
      // A straight developed edge stays a line; a curved one becomes a smooth curve through its points.
      const a = pts[0]; const b = pts.at(-1);
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const straight = L > 1e-12 && pts.every((p) => Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / L < 1e-9);
      if (straight) return R.makeLine(toW(a), toW(b));
      return R.makeBSplineApproximation(pts.map(toW), { tolerance: 1e-7, smoothing: null, degMax: 5 });
    });
  });
  const [outer, ...holes] = loops.map((edges) => R.assembleWire(edges));
  return { face: R.makeFace(outer, holes), frame: fr };
}

/** Least-squares conformal flattening of a face's mesh, scaled to the face's area, as a planar face. */
function lscmFlatten(face, fr, meshTolerance) {
  const R = rep();
  const size = (() => { try { const [lo, hi] = face.boundingBox.bounds; return Math.hypot(...sub(hi, lo)); } catch { return 10; } })();
  const m = face.mesh({ tolerance: meshTolerance ?? size / 400, angularTolerance: 0.05 });
  const V = []; for (let i = 0; i < m.vertices.length; i += 3) V.push([m.vertices[i], m.vertices[i + 1], m.vertices[i + 2]]);
  const T = []; for (let i = 0; i < m.triangles.length; i += 3) T.push([m.triangles[i], m.triangles[i + 1], m.triangles[i + 2]]);
  // Weld coincident vertices (the mesh repeats them along seams of the triangulation).
  const key = (p) => p.map((v) => Math.round(v * 1e7)).join(',');
  const idx = new Map(); const map = []; const P3 = [];
  V.forEach((p, i) => { const k = key(p); if (!idx.has(k)) { idx.set(k, P3.length); P3.push(p); } map[i] = idx.get(k); });
  const tris = T.map((t) => t.map((i) => map[i])).filter((t) => t[0] !== t[1] && t[1] !== t[2] && t[0] !== t[2]);
  const n = P3.length;
  // Boundary: edges used by one triangle, chained into loops; the outer loop is the longest.
  const edgeKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  const edgeUse = new Map();
  for (const t of tris) for (let k = 0; k < 3; k++) { const e = edgeKey(t[k], t[(k + 1) % 3]); edgeUse.set(e, (edgeUse.get(e) ?? 0) + 1); }
  const next = new Map();
  for (const t of tris) for (let k = 0; k < 3; k++) { const a = t[k]; const b = t[(k + 1) % 3]; if (edgeUse.get(edgeKey(a, b)) === 1) next.set(a, b); }
  const loops = []; const seen = new Set();
  for (const s of next.keys()) {
    if (seen.has(s)) continue;
    const loop = []; let c = s;
    while (c != null && !seen.has(c)) { seen.add(c); loop.push(c); c = next.get(c); }
    if (loop.length > 2) loops.push(loop);
  }
  if (!loops.length) throw codeError('flatten-boundary');
  const loopLen = (l) => l.reduce((acc, v, i) => acc + Math.hypot(...sub(P3[v], P3[l[(i + 1) % l.length]])), 0);
  loops.sort((a, b) => loopLen(b) - loopLen(a));
  // Two pinned vertices: the outer loop's two points farthest apart.
  const outer = loops[0];
  let pa = outer[0]; let pb = outer[0]; let best = -1;
  for (const a of outer) for (const b of outer) { const dd = Math.hypot(...sub(P3[a], P3[b])); if (dd > best) { best = dd; pa = a; pb = b; } }
  // LSCM rows (two per triangle): Re and Im of Σ W_j (u_j + i v_j) / √(2A) = 0, W_j from the triangle's own 2D frame.
  const rows = [];
  let area3 = 0;
  for (const t of tris) {
    const [p1, p2, p3] = t.map((i) => P3[i]);
    const e1 = sub(p2, p1); const L1 = Math.hypot(...e1); if (L1 < 1e-15) continue;
    const ex = mul(e1, 1 / L1); const nn = crossV(e1, sub(p3, p1)); const A2 = Math.hypot(...nn); if (A2 < 1e-15) continue;
    area3 += A2 / 2;
    const ey = normalize(crossV(normalize(nn), ex));
    const q = [[0, 0], [L1, 0], [dot(sub(p3, p1), ex), dot(sub(p3, p1), ey)]];
    const s = 1 / Math.sqrt(A2);
    const W = [0, 1, 2].map((j) => { const k = (j + 1) % 3; const l = (j + 2) % 3; return [(q[l][0] - q[k][0]) * s, (q[l][1] - q[k][1]) * s]; });
    rows.push({ t, W });
  }
  // Unknowns: u and v of every vertex but the two pinned ones. Normal equations solved by CG (matrix-free).
  const pinned = new Map([[pa, [0, 0]], [pb, [best, 0]]]);
  const slot = new Int32Array(n).fill(-1); let free = 0;
  for (let i = 0; i < n; i++) if (!pinned.has(i)) slot[i] = free++;
  const N = 2 * free;
  const AtA = (p, out) => {
    out.fill(0);
    for (const { t, W } of rows) {
      let re = 0; let im = 0;
      for (let j = 0; j < 3; j++) { const i = t[j]; if (pinned.has(i)) continue; const [a, b] = W[j]; const u = p[2 * slot[i]]; const v = p[2 * slot[i] + 1]; re += a * u - b * v; im += a * v + b * u; }
      for (let j = 0; j < 3; j++) { const i = t[j]; if (pinned.has(i)) continue; const [a, b] = W[j]; out[2 * slot[i]] += a * re + b * im; out[2 * slot[i] + 1] += -b * re + a * im; }
    }
  };
  // Right-hand side: −Aᵀ (A x) with only the pinned values in x.
  const rhs = new Float64Array(N);
  for (const { t, W } of rows) {
    let re = 0; let im = 0;
    for (let j = 0; j < 3; j++) { const i = t[j]; if (!pinned.has(i)) continue; const [a, b] = W[j]; const [u, v] = pinned.get(i); re += a * u - b * v; im += a * v + b * u; }
    if (!re && !im) continue;
    for (let j = 0; j < 3; j++) { const i = t[j]; if (pinned.has(i)) continue; const [a, b] = W[j]; rhs[2 * slot[i]] -= a * re + b * im; rhs[2 * slot[i] + 1] -= -b * re + a * im; }
  }
  const x = new Float64Array(N);
  const diag = new Float64Array(N);
  for (const { t, W } of rows) for (let j = 0; j < 3; j++) { const i = t[j]; if (pinned.has(i)) continue; const [a, b] = W[j]; diag[2 * slot[i]] += a * a + b * b; diag[2 * slot[i] + 1] += a * a + b * b; }
  const Mj = (r, z) => { for (let i = 0; i < N; i++) z[i] = r[i] / (diag[i] || 1); };
  cgSolve(AtA, Mj, rhs, x);
  const UV = (i) => (pinned.has(i) ? pinned.get(i) : [x[2 * slot[i]], x[2 * slot[i] + 1]]);
  // Scale to the face's own area; report the area ratio range per triangle.
  let area2 = 0;
  const ratios = [];
  for (const t of tris) {
    const [a, b, c] = t.map(UV);
    const A2d = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    const A3d = Math.hypot(...crossV(sub(P3[t[1]], P3[t[0]]), sub(P3[t[2]], P3[t[0]]))) / 2;
    area2 += A2d;
    if (A3d > 1e-15) ratios.push(A2d / A3d);
  }
  const k = Math.sqrt(area3 / (area2 || 1));
  // Centred on the middle of the layout, in the tangent plane at the face's middle.
  let cx = 0; let cy = 0; for (let i = 0; i < n; i++) { const [u, v] = UV(i); cx += u; cy += v; } cx /= n; cy /= n;
  const toW = (i) => { const [u, v] = UV(i); return add(fr.origin, add(mul(fr.xDir, (u - cx) * k), mul(fr.yDir, (v - cy) * k))); };
  const loopWire = (loop) => R.assembleWire(loop.map((v, i) => R.makeLine(toW(v), toW(loop[(i + 1) % loop.length]))));
  const [o, ...holes] = loops.map(loopWire);
  const scaled = ratios.map((r) => r * k * k);
  return { face: R.makeFace(o, holes), frame: fr, exact: false, distortion: [Math.min(...scaled), Math.max(...scaled)] };
}

/** Jacobi-preconditioned conjugate gradients (A symmetric positive definite, given as apply(p, out)). */
function cgSolve(apply, M, b, x, { tol = 1e-12, maxIter = 20000 } = {}) {
  const n = b.length; const r = new Float64Array(n); const z = new Float64Array(n); const p = new Float64Array(n); const q = new Float64Array(n);
  apply(x, q); for (let i = 0; i < n; i++) r[i] = b[i] - q[i];
  M(r, z); p.set(z);
  let rz = 0; for (let i = 0; i < n; i++) rz += r[i] * z[i];
  let bn = 0; for (let i = 0; i < n; i++) bn += b[i] * b[i];
  bn = Math.sqrt(bn) || 1;
  for (let it = 0; it < maxIter; it++) {
    apply(p, q);
    let pq = 0; for (let i = 0; i < n; i++) pq += p[i] * q[i];
    if (!(pq > 0)) break;
    const alpha = rz / pq;
    let rn = 0;
    for (let i = 0; i < n; i++) { x[i] += alpha * p[i]; r[i] -= alpha * q[i]; rn += r[i] * r[i]; }
    if (Math.sqrt(rn) <= tol * bn) break;
    M(r, z);
    let rz2 = 0; for (let i = 0; i < n; i++) rz2 += r[i] * z[i];
    const beta = rz2 / rz; rz = rz2;
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
  }
  return x;
}

/** Flatten surface (feature): one face of a surface (or of the body) laid out flat; see flattenFace. */
function buildFlattenSurface(f, ctx) {
  let face = null;
  const surface = f.surface ? ctx.surfaces.get(f.surface) : null;
  if (f.surface && !surface) throw codeError('no-surfaces');
  if (surface) {
    const faces = facesOf(surface);
    if (!f.face && faces.length > 1) throw codeError('flatten-one-face');
    face = f.face ? findFace(surface, f.face) : faces[0];
  } else if (f.face && ctx.body) face = findFace(ctx.body, f.face);
  if (!face) throw codeError('face-missing');
  const out = flattenFace(face);
  return { surface: out.face, exact: out.exact, distortion: out.distortion };
}
