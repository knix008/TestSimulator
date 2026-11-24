// Rib: an open sketch (lines, arcs, splines — one chain) grows into a wall that runs until it meets the body:
//   direction   parallel to the sketch (the wall lies in the sketch plane, thickness across it) or normal to it
//               (the wall stands on the sketch curve, growing along the plane's normal)
//   thickness   first side, both sides (centred) or second side
//   extension   linear: the chain's ends carried on along their tangents, so the wall reaches the body
//   draft       a normal rib's side walls taper by the angle (narrower away from the sketch)
// The wall is a long band cut by the body with the splitter; the pieces that touch the sketch curve and lie
// outside the body are kept — they end exactly on the body's faces.
import { rep } from './kernel.js';
import { normalize } from './refs.js';
import { codeError, sketchOf, sizeAround } from './features.js';
import { sketchWire } from './advanced.js';
import { splitBy, fuseAll, volume } from './extrude-more.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const vec = (p) => (Array.isArray(p) ? p : p.toTuple ? p.toTuple() : [p.x, p.y, p.z]);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** True when a rib needs this module (curves, normal direction, one-sided thickness, extension, draft). */
export function needsRibMore(f) {
  return Boolean(f.direction === 'normal' || (f.side && f.side !== 'both') || f.extension === 'linear' || num(f.draft) || f.curves);
}

/** The free ends of an open wire with their outward tangents. */
function ends(wire) {
  const pts = [];
  for (const e of wire.edges) for (const [p, t] of [[e.startPoint, 0], [e.endPoint, 1]]) pts.push({ p: vec(p), e, t });
  return pts.filter((x) => pts.filter((y) => len(sub(x.p, y.p)) < 1e-7).length === 1).map(({ p, e, t }) => {
    let d = normalize(vec(e.tangentAt(t)));
    // Outward: away from the edge's other end.
    const other = vec(t ? e.startPoint : e.endPoint);
    if (dot(d, sub(p, other)) < 0) d = mul(d, -1);
    return { p, d };
  });
}

/** The chain extended by `big` along its end tangents (linear extension). */
function extended(wire, big) {
  const R = rep();
  const extra = ends(wire).map(({ p, d }) => R.makeLine(p, add(p, mul(d, big))));
  return R.assembleWire([...wire.clone().edges, ...extra]);
}

/** An open wire offset to one side (signed): the exact offset curve, square at its ends. */
function offsetOpen(wire, d) {
  const R = rep(); const oc = R.getOC();
  const mk = new oc.BRepOffsetAPI_MakeOffset();
  mk.Init(oc.GeomAbs_JoinType.GeomAbs_Intersection, true);
  mk.AddWire(wire.wrapped);
  mk.Perform(d, 0);
  if (!mk.IsDone()) { mk.delete(); throw codeError('rib-failed'); }
  const out = R.cast(mk.Shape());
  mk.delete();
  return out;
}

/** The free ends of a wire, in any edge order. */
function wireEnds(w) {
  const pts = [];
  for (const e of w.edges) for (const p of [e.startPoint, e.endPoint]) pts.push(vec(p));
  return pts.filter((p) => pts.filter((q) => len(sub(p, q)) < 1e-7).length === 1);
}

/** The edges of a wire in chain order from its end at `from`. */
function chainFrom(w, from) {
  const left = [...w.edges]; const out = []; let at = from;
  while (left.length) {
    const i = left.findIndex((e) => len(sub(vec(e.startPoint), at)) < 1e-7 || len(sub(vec(e.endPoint), at)) < 1e-7);
    if (i < 0) throw codeError('rib-failed');
    const [e] = left.splice(i, 1); out.push(e);
    at = len(sub(vec(e.startPoint), at)) < 1e-7 ? vec(e.endPoint) : vec(e.startPoint);
  }
  return out;
}

/** The planar band between a chain and its offset by d (one side, in the plane of normal n). */
function band(wire, d, n) {
  const R = rep();
  // A straight chain gives the offset no plane of its own: the band is the rectangle square to it in the sketch plane.
  const [e0, e1] = wireEnds(wire);
  const dir = normalize(sub(e1, e0));
  if (wire.edges.every((e) => e.geomType === 'LINE' && len(sub(normalize(sub(vec(e.endPoint), vec(e.startPoint))), mul(dir, Math.sign(dot(sub(vec(e.endPoint), vec(e.startPoint)), dir)) || 1))) < 1e-9)) {
    const side = normalize([n[1] * dir[2] - n[2] * dir[1], n[2] * dir[0] - n[0] * dir[2], n[0] * dir[1] - n[1] * dir[0]]);
    const o = mul(side, d);
    return R.makeFace(R.assembleWire([R.makeLine(e0, e1), R.makeLine(e1, add(e1, o)), R.makeLine(add(e1, o), add(e0, o)), R.makeLine(add(e0, o), e0)]));
  }
  const off = offsetOpen(wire, d);
  const [a0, a1] = wireEnds(wire); let [b0, b1] = wireEnds(off);
  if (len(sub(b0, a0)) + len(sub(b1, a1)) > len(sub(b1, a0)) + len(sub(b0, a1))) [b0, b1] = [b1, b0];
  return R.makeFace(R.assembleWire([...chainFrom(wire.clone(), a0), R.makeLine(a1, b1), ...chainFrom(off, b1), R.makeLine(b0, a0)]));
}

/** The pieces of `slab` (split by the body) that touch the sketch curve, lie outside the body and reach it. */
function untilBody(slab, body, curve) {
  const pieces = splitBy(slab, body).filter((p) => {
    try {
      if (rep().measureDistanceBetween(p, curve) > 1e-6) return false;
      const v = volume(p);
      if (volume(p.clone().intersect(body.clone())) > 0.5 * v) return false;
      return rep().measureDistanceBetween(p, body) < 1e-6;
    } catch { return false; }
  });
  if (!pieces.length) throw codeError('rib-no-body');
  return fuseAll(pieces);
}

/** The rib tool and the body with it. */
export function ribMore(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const { sketch, frame } = sketchOf(f, ctx);
  let curve = sketchWire(sketch, frame);
  const big = sizeAround(ctx) * 2;
  const t = Math.max(0.01, num(f.thickness, 3));
  const side = f.side ?? 'both';
  const [s0, s1] = side === 'first' ? [0, t] : side === 'second' ? [-t, 0] : [-t / 2, t / 2];
  const path = f.extension === 'linear' ? extended(curve, big) : curve;
  let tool;
  if (f.direction === 'normal') {
    // The wall stands on the curve: the band across the curve (thickness in the plane), swept along the normal.
    const faces = [];
    if (s0 < 0) faces.push(band(path, s0, frame.normal));
    if (s1 > 0) faces.push(band(path, s1, frame.normal));
    const n = f.flip ? mul(frame.normal, -1) : frame.normal;
    // As far along the normal as the body reaches (a long wall would collapse under its draft).
    const [lo, hi] = ctx.body.boundingBox.bounds;
    let reach = 0;
    for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) reach = Math.max(reach, dot(sub([x, y, z], frame.origin), n));
    if (!(reach > 0)) throw codeError('rib-no-body');
    let slab = fuseAll(faces.map((fc) => R.basicFaceExtrusion(fc, new R.Vector(mul(n, reach + 1)))));
    if (num(f.draft)) {
      // The side walls lean in by the draft angle: a draft about the sketch plane on the faces along the growth.
      const oc = R.getOC();
      const endCaps = ends(path);
      const mk = new oc.BRepOffsetAPI_DraftAngle(slab.wrapped);
      const o = new oc.gp_Pnt(...frame.origin); const dn = new oc.gp_Dir(...n); const pln = new oc.gp_Pln(o, dn);
      for (const fc of slab.faces) {
        const fn = normalize(vec(fc.normalAt(vec(fc.center))));
        // Only the thickness walls: not the ends (square to the chain's end tangents, at its ends).
        const isEnd = endCaps.some(({ p, d }) => Math.abs(Math.abs(dot(fn, d)) - 1) < 1e-6 && Math.abs(dot(sub(vec(fc.center), p), d)) < 1e-6);
        if (Math.abs(dot(fn, n)) < 1e-6 && !isEnd) mk.Add(fc.wrapped, dn, (num(f.draft) * Math.PI) / 180, pln, true);
      }
      mk.Build(new oc.Message_ProgressRange());
      if (!mk.IsDone()) { mk.delete(); throw codeError('draft-failed'); }
      slab = R.cast(mk.ModifiedShape(slab.wrapped));
      mk.delete(); o.delete(); dn.delete(); pln.delete();
    }
    tool = untilBody(slab, ctx.body, curve);
  } else {
    // Parallel to the sketch: the band from the curve out to one side (toward the body, or the other with Flip),
    // thickness across the plane.
    const tryBand = (d) => { const fc = band(path, d, frame.normal); const slab = R.basicFaceExtrusion(fc.translate(mul(frame.normal, s0)), new R.Vector(mul(frame.normal, s1 - s0))); try { return untilBody(slab, ctx.body, curve); } catch { return null; } };
    const a = tryBand(big); const b = tryBand(-big);
    const pickA = a && (!b || volume(a) <= volume(b));
    tool = f.flip ? (pickA ? b : a) : (pickA ? a : b);
    if (!tool) throw codeError('rib-no-body');
  }
  curve = null;
  return { tool, body: ctx.body.fuse(tool) };
}
