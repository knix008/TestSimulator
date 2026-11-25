// Extrude options beyond a plain blind / through extrusion:
//   end conditions   up to next, up to vertex, up to surface, offset from surface, up to body (each direction)
//   start conditions sketch plane, offset, surface (a face or plane the extrusion starts from), vertex
//   thin feature     a wall of thickness along open or closed sketch curves: one direction, mid-plane or two
//                    directions; closed thin features can have end caps
//   selected contours only some of the sketch's closed regions
//
// Every condition is exact: a long prism of the profile is cut by the bounding geometry with the kernel's splitter
// (the extended surface, the body, a plane through the vertex) and the pieces that start at the profile are kept.
import { rep } from './kernel.js';
import { profiles } from './sketch.js';
import { findFace, normalize } from './refs.js';
import { codeError, loopDrawing, textDrawing, replicadPlane, resolvePlane, sizeAround, resolveDirection } from './features.js';
import { sketchWire } from './advanced.js';

export const END_KINDS = ['blind', 'through', 'throughBoth', 'midplane', 'upToNext', 'upToVertex', 'upToSurface', 'offsetFromSurface', 'upToBody'];
/** End conditions that need geometry: the extrusion is trimmed (see endTrim). */
export const BOUNDED_ENDS = ['upToNext', 'upToVertex', 'upToSurface', 'offsetFromSurface', 'upToBody'];
export const START_KINDS = ['sketchPlane', 'offset', 'surface', 'vertex'];
const MITER = { lineJoinType: 'miter' };
export const THIN_KINDS = ['oneDir', 'mid', 'twoDir'];

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const vec = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);

/** True when the extrude needs this module (anything a plain prism of the whole sketch does not give). */
export function needsExtrudeMore(f) {
  return BOUNDED_ENDS.includes(f.end) || BOUNDED_ENDS.includes(f.end2) || (f.start && f.start !== 'sketchPlane') || Boolean(f.thin) || Array.isArray(f.contours) || Boolean(f.dirVector);
}

// ───────────────────────── kernel helpers

export function solids(shape) {
  const R = rep();
  if (!shape) return [];
  try { return [...R.iterTopo(shape.wrapped, 'solid')].map((s) => R.cast(s)); } catch { return [shape]; }
}

export function fuseAll(list) {
  const R = rep();
  const ok = list.filter(Boolean);
  if (!ok.length) return null;
  let out = ok[0];
  for (const s of ok.slice(1)) out = out.fuse(s);
  return out ?? R.makeCompound(ok);
}

export function splitBy(shape, tool) {
  const R = rep(); const oc = R.getOC();
  const args = new oc.NCollection_List_TopoDS_Shape(); args.Append(shape.wrapped);
  const tools = new oc.NCollection_List_TopoDS_Shape(); tools.Append(tool.wrapped);
  const sp = new oc.BRepAlgoAPI_Splitter();
  sp.SetArguments(args); sp.SetTools(tools); sp.Build(new oc.Message_ProgressRange());
  if (sp.HasErrors()) { sp.delete(); throw codeError('kernel'); }
  const out = R.cast(sp.Shape());
  sp.delete();
  return solids(out);
}

export const volume = (s) => { try { return Math.abs(rep().measureVolume(s)); } catch { return 0; } };
const distance = (a, b) => { try { return rep().measureDistanceBetween(a, b); } catch { return Infinity; } };

/**
 * A face's surface made large enough to cut anything in `size`: an unbounded surface (plane, cylinder, cone …)
 * over ±size around the face, a periodic direction over its full period, a bounded one (B-spline) over its own
 * parameter range.
 */
export function extendedFace(face, size) {
  const R = rep(); const oc = R.getOC();
  const surf = oc.BRep_Tool.Surface(face.wrapped);
  const b = oc.BRepTools.UVBounds(face.wrapped, 0, 0, 0, 0);
  let [u0, u1, v0, v1] = [b.UMin, b.UMax, b.VMin, b.VMax];
  let bounds = [NaN, NaN, NaN, NaN];
  try { const r = surf.Bounds(0, 0, 0, 0); if (r && typeof r === 'object') bounds = [r.U1, r.U2, r.V1, r.V2]; } catch { /* the face's box */ }
  const finite = (a, c) => [a, c].every(Number.isFinite) && Math.abs(c - a) < 1e50;
  const periodic = ['CYLINDRE', 'CONE', 'REVOLUTION', 'SPHERE', 'TORUS'].includes(face.geomType);
  if (finite(bounds[0], bounds[1])) [u0, u1] = [bounds[0], bounds[1]];
  else if (periodic) [u0, u1] = [b.UMin, b.UMin + 2 * Math.PI];
  else { const m = (b.UMin + b.UMax) / 2; [u0, u1] = [m - size, m + size]; }
  if (finite(bounds[2], bounds[3])) [v0, v1] = [bounds[2], bounds[3]];
  else { const m = (b.VMin + b.VMax) / 2; [v0, v1] = [m - size, m + size]; }
  const mk = new oc.BRepBuilderAPI_MakeFace(surf, u0, u1, v0, v1, 1e-7);
  if (!mk.IsDone()) { mk.delete(); throw codeError('kernel'); }
  const out = R.cast(mk.Face());
  mk.delete();
  return out;
}

/** A plane as a square face of half-size `size` (an extended plane to cut with). */
export function planeFace(origin, normal, size) {
  const R = rep();
  const x = Math.abs(normal[2]) < 0.9 ? normalize([-normal[1], normal[0], 0]) : normalize([0, -normal[2], normal[1]]);
  const y = [normal[1] * x[2] - normal[2] * x[1], normal[2] * x[0] - normal[0] * x[2], normal[0] * x[1] - normal[1] * x[0]];
  const P = (a, c) => add(origin, add(mul(x, a), mul(y, c)));
  return R.makeFace(R.assembleWire([R.makeLine(P(-size, -size), P(size, -size)), R.makeLine(P(size, -size), P(size, size)), R.makeLine(P(size, size), P(-size, size)), R.makeLine(P(-size, size), P(-size, -size))]));
}

/**
 * The face a reference names: a standard or reference plane ({ kind: 'std' | 'ref' }), or a face of the body or of
 * a surface body (a picked face: { kind: 'face', sig } or a bare signature). Returns { face } or { plane: frame }.
 */
export function resolveTarget(ref, ctx) {
  if (!ref) throw codeError('no-end-face');
  if (ref.kind === 'std' || ref.kind === 'ref') return { plane: resolvePlane(ref, ctx) };
  const sig = ref.sig ?? ref;
  const face = (ctx.body && findFace(ctx.body, sig)) || [...(ctx.surfaces?.values() ?? [])].map((s) => findFace(s, sig)).find(Boolean);
  if (!face) throw codeError('face-missing');
  return { face };
}

/** The body's vertices (edge ends, without repeats). */
export function vertices(shape) {
  const out = [];
  for (const e of shape.edges) {
    for (const p of [e.startPoint, e.endPoint]) {
      const q = vec(p.toTuple ? p.toTuple() : p);
      if (!out.some((x) => Math.hypot(...sub(x, q)) < 1e-7)) out.push(q);
    }
  }
  return out;
}

/** A stored vertex point, moved to the body's nearest vertex when it is that vertex (up to / start vertices follow the model). */
export function resolveVertex(p, ctx) {
  if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) throw codeError('no-vertex');
  if (!ctx.body) return p;
  let best = p; let d = Infinity;
  try { for (const q of vertices(ctx.body)) { const e = Math.hypot(...sub(q, p)); if (e < d) { d = e; best = q; } } } catch { return p; }
  return d < 0.05 ? best : p;
}

/** The body vertex nearest a picked point (for the vertex pick boxes). */
export function nearestVertex(shape, p) {
  let best = null; let d = Infinity;
  for (const q of vertices(shape)) { const e = Math.hypot(...sub(q, p)); if (e < d) { d = e; best = q; } }
  return best;
}

// ───────────────────────── profiles

/** The closed regions to extrude: all, or the selected contours (indices into profiles(sketch)). */
function regionsOf(sketch, f) {
  const all = profiles(sketch);
  if (!Array.isArray(f.contours)) return all;
  const pick = all.filter((_, k) => f.contours.includes(k));
  if (!pick.length) throw codeError('no-contours');
  return pick;
}

const isOpenSketch = (sketch) => !profiles(sketch).length && sketch.entities.some((e) => !e.construction && ['line', 'arc', 'spline', 'ellipse', 'conic', 'parabola', 'equation', 'partialEllipse'].includes(e.type));

/** An open wire offset to one side (`d` signed) — the kernel's exact offset curve, square at the ends. */
function offsetOpen(wire, d, open = true) {
  const R = rep(); const oc = R.getOC();
  const mk = new oc.BRepOffsetAPI_MakeOffset();
  mk.Init(oc.GeomAbs_JoinType.GeomAbs_Intersection, open);
  mk.AddWire(wire.wrapped);
  mk.Perform(d, 0);
  if (!mk.IsDone()) { mk.delete(); throw codeError('thin-failed'); }
  const out = R.cast(mk.Shape());
  mk.delete();
  return out;
}

/** The two free ends of an open wire (the points used by one edge only), whatever order its edges are listed in. */
function wireEnds(w) {
  const pts = [];
  for (const e of w.edges) for (const p of [e.startPoint, e.endPoint]) pts.push(vec(p.toTuple ? p.toTuple() : p));
  const ends = pts.filter((p) => pts.filter((q) => Math.hypot(...sub(p, q)) < 1e-7).length === 1);
  if (ends.length !== 2) throw codeError('thin-failed');
  return ends;
}

/** The edges of an open wire in chain order, starting from its end at `from` (the wire builder joins them in turn). */
function chainFrom(w, from) {
  const P = (p) => vec(p.toTuple ? p.toTuple() : p);
  const left = [...w.edges];
  const out = [];
  let at = from;
  while (left.length) {
    const i = left.findIndex((e) => Math.hypot(...sub(P(e.startPoint), at)) < 1e-7 || Math.hypot(...sub(P(e.endPoint), at)) < 1e-7);
    if (i < 0) throw codeError('thin-failed');
    const [e] = left.splice(i, 1);
    out.push(e);
    at = Math.hypot(...sub(P(e.startPoint), at)) < 1e-7 ? P(e.endPoint) : P(e.startPoint);
  }
  return out;
}

/** The band between an open chain and its offset by `d` (one side), as a planar face. */
function openBand(wire, d) {
  const R = rep();
  const off = offsetOpen(wire, d, true);
  // Pair the offset's ends with the chain's: the end nearer the chain's start goes with it.
  const [a0, a1] = wireEnds(wire);
  let [b0, b1] = wireEnds(off);
  if (Math.hypot(...sub(b0, a0)) + Math.hypot(...sub(b1, a1)) > Math.hypot(...sub(b1, a0)) + Math.hypot(...sub(b0, a1))) [b0, b1] = [b1, b0];
  const edges = [...chainFrom(wire.clone(), a0), R.makeLine(a1, b1), ...chainFrom(off, b1), R.makeLine(b0, a0)];
  return R.makeFace(R.assembleWire(edges));
}

/** Planar faces (on the sketch plane) of the thin wall: open chains or each loop of the closed regions. */
function thinFaces(sketch, fr, f) {
  const R = rep();
  const kind = THIN_KINDS.includes(f.thinKind) ? f.thinKind : 'oneDir';
  const t1 = Math.max(1e-3, num(f.thinT1, 1));
  const t2 = Math.max(1e-3, num(f.thinT2, t1));
  const side = f.thinReverse ? -1 : 1;
  if (isOpenSketch(sketch)) {
    const wire = sketchWire(sketch, fr);
    if (kind === 'mid') return [openBand(wire, t1 / 2), openBand(wire, -t1 / 2)];
    if (kind === 'twoDir') return [openBand(wire, side * t1), openBand(wire, -side * t2)];
    return [openBand(wire, side * t1)];
  }
  // Closed: a wall along every loop (outer and holes); one direction goes into the loop (Reverse: out of it).
  const plane = replicadPlane(fr);
  let all = null;
  for (const region of regionsOf(sketch, f)) {
    for (const loop of [region.outer, ...region.holes]) {
      const d = loopDrawing(loop);
      let band;
      if (kind === 'mid') band = d.offset(t1 / 2, MITER).cut(loopDrawing(loop).offset(-t1 / 2, MITER));
      else if (kind === 'twoDir') band = d.offset(t2, MITER).cut(loopDrawing(loop).offset(-t1, MITER));
      else band = side > 0 ? d.cut(loopDrawing(loop).offset(-t1, MITER)) : d.offset(t1, MITER).cut(loopDrawing(loop));
      all = all ? all.fuse(band) : band;
    }
  }
  if (!all) throw codeError('no-profile');
  return facesOfSketch(all.sketchOnPlane(plane));
}

function facesOfSketch(sk) {
  if (typeof sk.face === 'function') return [sk.face()];
  return sk.sketches.map((x) => x.face());
}

/** The profile faces on the sketch plane: thin wall, selected contours or the whole sketch. */
export function profileFaces(sketch, fr, f) {
  if (f.thin) return thinFaces(sketch, fr, f);
  const regions = regionsOf(sketch, f);
  let all = null;
  for (const region of regions) {
    let d = loopDrawing(region.outer);
    for (const hole of region.holes) d = d.cut(loopDrawing(hole));
    all = all ? all.fuse(d) : d;
  }
  if (!Array.isArray(f.contours)) for (const e of sketch.entities.filter((x) => x.type === 'text' && !x.construction && String(x.text ?? '').trim())) { const d = textDrawing(e); all = all ? all.fuse(d) : d; }
  if (!all) throw codeError('no-profile');
  return facesOfSketch(all.sketchOnPlane(replicadPlane(fr)));
}

/** The profile faces swept along `d` from s = a to s = b (a < b, distances along d from the sketch plane). */
function prism(faces, d, a, b) {
  const R = rep();
  const out = faces.map((face) => R.basicFaceExtrusion(face.clone().translate(mul(d, a)), R.Vector ? new R.Vector(mul(d, b - a)) : mul(d, b - a)));
  return fuseAll(out);
}

/** Faces of a prism (profile moved s along d) lying where its cap s is: parallel to the sketch plane (frame fr). */
export function capsAt(shape, fr, d, s) {
  const h = s * dot(d, fr.normal);
  return shape.faces.filter((fc) => fc.geomType === 'PLANE' && Math.abs(dot(sub(vec(fc.center), fr.origin), fr.normal) - h) < 1e-6 * Math.max(1, Math.abs(h)));
}

// ───────────────────────── trimming

export const touching = (pieces, refs) => pieces.filter((p) => refs.some((c) => distance(p, c) < 1e-6));

/**
 * `solid` split by `cutter`, keeping the pieces that touch `refs` (the profile's start). Throws end-not-reached
 * when the cutter does not cut the part that starts there (the end would never be met).
 */
export function keepFrom(solid, cutter, refs) {
  const total = volume(solid);
  const keep = touching(splitBy(solid, cutter), refs);
  const kept = keep.reduce((s, p) => s + volume(p), 0);
  if (!keep.length || kept > total * (1 - 1e-6)) throw codeError('end-not-reached');
  return fuseAll(keep);
}

/** The face an up-to-surface / offset-from-surface end stops at (extended over the model). */
function endFace(f, ctx, suffix, d, big) {
  const R = rep();
  const kind = suffix ? f.end2 : f.end;
  const key = (k) => `${k}${suffix}`;
  const tg = resolveTarget(f[key('endFace')], ctx);
  let face = tg.face ? extendedFace(tg.face, big) : planeFace(tg.plane.origin, tg.plane.normal, big);
  if (kind === 'offsetFromSurface') {
    // Short of the surface by the offset (Reverse offset: past it): the surface moved along the extrusion
    // ("translate surface", and always for a plane) or offset along its own normal.
    const off = Math.abs(num(f[key('endOffset')], 5)) * (f[key('reverseOffset')] ? 1 : -1);
    if (f[key('translateSurface')] || tg.plane || face.geomType === 'PLANE') face = face.translate(mul(d, off));
    else {
      const p = face.pointOnSurface(0.5, 0.5);
      const nrm = normalize(vec(face.normalAt(p)));
      face = R.makeOffset(face, dot(nrm, d) > 0 ? off : -off);
    }
  }
  return face;
}

/**
 * `long` (a prism running far past any geometry from its start `refs`) ended as the direction's condition says:
 * up to vertex (a plane through it, square to the extrusion), up to / offset from surface, up to body, up to next.
 */
export function endCondition(long, refs, f, ctx, fr, d, suffix, big, cut) {
  const kind = (suffix ? f.end2 : f.end) ?? 'blind';
  if (kind === 'through') return long;
  if (kind === 'blind') throw codeError('bad-end', { end: kind });
  if (kind === 'upToVertex') {
    const v = resolveVertex(f[`endVertex${suffix}`], ctx);
    // The end plane is parallel to the sketch plane, through the vertex.
    return keepFrom(long, planeFace(v, fr.normal, big), refs);
  }
  if (kind === 'upToSurface' || kind === 'offsetFromSurface') return keepFrom(long, endFace(f, ctx, suffix, d, big), refs);
  let target;
  if (kind === 'upToBody') {
    target = solids(ctx.body)[Math.max(0, Math.round(num(f[`endBody${suffix}`], 0)))];
    if (!target) throw codeError('body-missing');
  } else if (kind === 'upToNext') {
    if (!ctx.body) throw codeError('no-body');
    target = ctx.body;
  } else throw codeError('bad-end', { end: kind });
  // The prism split by the body, its pieces in order along the extrusion (by where each begins). A boss keeps
  // what comes before the body is first met; a cut keeps everything up to where it first leaves the material
  // (air before the material included — cutting air changes nothing).
  const inside = (p) => { const v = volume(p); if (!v) return false; try { return volume(p.clone().intersect(target.clone())) > 0.5 * v; } catch { return false; } };
  const pieces = splitBy(long, target).map((p) => ({ p, s: Math.min(...vertices(p).map((q) => dot(sub(q, fr.origin), d))), inside: inside(p) }));
  const eps = 1e-6 * big;
  const firstIn = Math.min(...pieces.filter((x) => x.inside).map((x) => x.s));
  if (!Number.isFinite(firstIn)) throw codeError('end-not-reached');
  let limit = firstIn;
  if (cut) {
    limit = Math.min(...pieces.filter((x) => !x.inside && x.s > firstIn + eps).map((x) => x.s));
    if (!Number.isFinite(limit)) return long; // never leaves the material: through
  }
  const keep = pieces.filter((x) => x.s < limit - eps).map((x) => x.p);
  if (!keep.length) throw codeError('end-not-reached');
  void refs;
  return fuseAll(keep);
}

/** One direction (d) from the sketch-parallel start s0. */
function directionSolid(faces, f, ctx, fr, d, s0, suffix, big, cut) {
  const kind = (suffix ? f.end2 : f.end) ?? 'blind';
  const depth = Math.abs(num(suffix ? f.depth2 : f.depth, 10));
  if (kind === 'blind') return prism(faces, d, s0, s0 + depth);
  if (kind === 'through') return prism(faces, d, s0, s0 + big);
  const long = prism(faces, d, s0, s0 + big);
  return endCondition(long, capsAt(long, fr, d, s0), f, ctx, fr, d, suffix, big, cut);
}

/**
 * The extruded tool of an extrude feature with any of the options above (`sketch`, `fr` its frame).
 */
export function extrudeMoreTool(f, ctx, sketch, fr) {
  const cut = f.op === 'cut';
  let dir = cut ? -1 : 1;
  if (f.reverse) dir = -dir;
  let d = mul(fr.normal, dir);
  // Direction of extrusion: along a picked edge or an axis instead of the sketch normal (Reverse flips it).
  if (f.dirVector) {
    let v = normalize(resolveDirection(f.dirVector, ctx));
    if (dot(v, fr.normal) < 0) v = mul(v, -1);
    if (Math.abs(dot(v, fr.normal)) < 1e-6) throw codeError('direction-in-plane');
    d = mul(v, dir);
  }
  const big = sizeAround(ctx, 200) * 2;
  const faces = profileFaces(sketch, fr, f);
  const start = START_KINDS.includes(f.start) ? f.start : 'sketchPlane';
  let s0 = 0;
  // The start offset is a distance from the sketch plane (along its normal, whatever the direction of extrusion).
  if (start === 'offset') s0 = (Math.abs(num(f.startOffset, 5)) * (f.startReverse ? -1 : 1)) / Math.abs(dot(d, fr.normal));
  else if (start === 'vertex') s0 = dot(sub(resolveVertex(f.startVertex, ctx), fr.origin), fr.normal) / dot(d, fr.normal);

  let tool;
  const end = END_KINDS.includes(f.end) ? f.end : 'blind';
  if (end === 'throughBoth') tool = prism(faces, d, -big, big);
  else if (end === 'midplane') { const h = Math.abs(num(f.depth, 10)) / 2; tool = prism(faces, d, s0 - h, s0 + h); }
  else if (start === 'surface') {
    // From a surface: the profile carried along the extrusion onto it (the prism cut there), then a blind depth
    // measured from the surface (the surface moved by the depth) or the other end conditions.
    const tg = resolveTarget(f.startFace, ctx);
    const from = tg.face ? extendedFace(tg.face, big * 2) : planeFace(tg.plane.origin, tg.plane.normal, big * 2);
    const long = prism(faces, d, -big, big);
    const beyond = keepFrom(long, from, capsAt(long, fr, d, big));
    if (end === 'blind') tool = keepFrom(beyond, from.clone().translate(mul(d, Math.abs(num(f.depth, 10)))), [from]);
    else tool = endCondition(beyond, [from], f, ctx, fr, d, '', big * 2, cut);
  } else tool = directionSolid(faces, f, ctx, fr, d, s0, '', big, cut);

  // Direction 2: the other way from the start.
  if (f.end2 && f.end2 !== 'none' && !['throughBoth', 'midplane'].includes(end)) {
    tool = tool.fuse(directionSolid(faces, f, ctx, fr, mul(d, -1), -s0, '2', big, cut));
  }
  // A closed thin feature with end caps: the full regions over the cap thickness at both ends.
  if (f.thin && f.capEnds && !isOpenSketch(sketch) && end === 'blind' && start !== 'surface') {
    const depth = Math.abs(num(f.depth, 10));
    const tc = Math.min(Math.max(1e-3, num(f.capThickness, num(f.thinT1, 1))), depth / 2);
    const full = profileFaces(sketch, fr, { ...f, thin: false });
    tool = tool.fuse(prism(full, d, s0, s0 + tc)).fuse(prism(full, d, s0 + depth - tc, s0 + depth));
  }
  if (!(volume(tool) > 0)) throw codeError('zero-depth');
  return tool;
}

/** The closed regions of a sketch for the Selected Contours list: [{ index, area }]. */
export function contourList(sketch) {
  return profiles(sketch).map((r, index) => ({ index, area: r.area ?? null }));
}
