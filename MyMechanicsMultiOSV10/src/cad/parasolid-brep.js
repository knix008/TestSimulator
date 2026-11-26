// Parasolid XT ↔ OpenCASCADE B-rep (the full build, cad/occt-full.js). Writing walks a solid's faces, loops, edges
// and vertices into XT bodies, regions, shells, faces, loops, fins, edges and vertices with their surfaces, curves
// and points; reading builds faces from the XT surfaces and fin loops, sews them and makes the closed shells
// solids. XT is in metres, the app in millimetres.
//
// The geometry keeps its parameterisation wherever the two kernels agree (format reference §5.2): plane, cylinder,
// sphere, torus, B-spline and swept surface take the same (u, v); a cone needs a left-handed OCCT frame; a spun
// surface swaps u and v, which turns its natural normal over. Each surface mapping returns that sign, and the face
// sense carries it. Topology follows §4: a solid body has an infinite void region and solid regions; every face has
// the solid on its back and void in front (normals out of the material); every edge has two fins of opposite sense,
// the primary (positive) fin pointing at the edge's end vertex; loops run with the face on their left. Parasolid has
// no seam or degenerate edges, so OCCT's are left out on writing and made again by ShapeFix on reading.
import { loadFullKernel, shapeFromBrep, brepOfShape, sewSolids, count } from './occt-full.js';
import { readXt, writeXt, NODE } from './parasolid.js';
import { flatKnots, distinctKnots, unwrapPeriodic, rewrapPeriodic, curvePoint, surfacePoint } from './nurbs-eval.js';

const M = 1e-3; // mm → m
const xtError = (message, code) => Object.assign(new Error(message), { code });

// ———————————————————————————————————————— writing ————————————————————————————————————————

const xyz = (p) => [p.X() * M, p.Y() * M, p.Z() * M];
const dir = (d) => [d.X(), d.Y(), d.Z()];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Allocates node indices and node ids, and keeps the nodes in writing order (the body first). */
class Nodes {
  constructor() { this.list = []; this.nextIndex = 1; this.nextId = 1; }
  add(type, fields = {}, withId = true) {
    const node = { type, index: this.nextIndex++, ...fields };
    if (withId) node[type === NODE.BODY ? 'highest_node_id' : 'node_id'] = type === NODE.BODY ? 0 : this.nextId++;
    this.list.push(node);
    return node;
  }
}
/** Doubly links nodes through `next` / `previous` field names; returns the head's index (or 0). */
function chain(items, next = 'next', previous = 'previous') {
  items.forEach((n, i) => { n[next] = items[i + 1]?.index ?? 0; n[previous] = items[i - 1]?.index ?? 0; });
  return items[0]?.index ?? 0;
}

/**
 * NURBS data of an OCCT B-spline curve as XT (metres): degree, vertices, knots. A periodic curve is unwrapped
 * (pole alignment found by evaluating against the kernel).
 */
function bsplineCurveData(oc, bs) {
  const n = bs.NbPoles(); const p = bs.Degree(); const rational = bs.IsRational();
  const poles = []; const weights = [];
  for (let i = 1; i <= n; i++) { poles.push(xyz(bs.Pole(i))); weights.push(rational ? bs.Weight(i) : 1); }
  const knots = []; const mults = [];
  for (let i = 1; i <= bs.NbKnots(); i++) { knots.push(bs.Knot(i)); mults.push(bs.Multiplicity(i)); }
  let flat; let order = poles.map((_, i) => i);
  if (bs.IsPeriodic()) {
    const t0 = bs.FirstParameter(); const t1 = bs.LastParameter();
    const probe = [0.13, 0.5, 0.87].map((f) => t0 + f * (t1 - t0));
    const want = probe.map((t) => xyz(bs.Value(t)));
    let found = null;
    for (let shift = 0; shift < n && !found; shift++) {
      const u = unwrapPeriodic(knots, mults, p, n, shift);
      const P = u.order.map((i) => poles[i]); const W = u.order.map((i) => weights[i]);
      if (probe.every((t, k) => dist(curvePoint(p, u.flat, P, rational ? W : null, t), want[k]) < 1e-9)) found = u;
    }
    if (!found) throw xtError('a periodic B-spline curve could not be unwrapped', 'xt-write');
    flat = found.flat; order = found.order;
  } else flat = flatKnots(knots, mults);
  const P = order.map((i) => poles[i]); const W = order.map((i) => weights[i]);
  const d = distinctKnots(flat);
  return { degree: p, periodic: bs.IsPeriodic(), closed: bs.IsClosed(), rational, poles: P, weights: W, knots: d.knots, mults: d.mults };
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The B-curve nodes (B_CURVE → NURBS_CURVE → vertices, multiplicities, knots). */
function addBCurve(nodes, data, extra) {
  const dim = data.rational ? 4 : 3;
  const verts = []; data.poles.forEach((pt, i) => { const w = data.weights[i]; if (data.rational) verts.push(pt[0] * w, pt[1] * w, pt[2] * w, w); else verts.push(...pt); });
  const v = nodes.add(NODE.BSPLINE_VERTICES, { vertices: verts }, false);
  const km = nodes.add(NODE.KNOT_MULT, { mult: data.mults }, false);
  const ks = nodes.add(NODE.KNOT_SET, { knots: data.knots }, false);
  const nurbs = nodes.add(NODE.NURBS_CURVE, { degree: data.degree, n_vertices: data.poles.length, vertex_dim: dim, n_knots: data.knots.length, knot_type: 1, periodic: data.periodic, closed: data.closed, rational: data.rational, curve_form: 1, bspline_vertices: v.index, knot_mult: km.index, knots: ks.index }, false);
  return nodes.add(NODE.B_CURVE, { sense: '+', nurbs: nurbs.index, data: 0, ...extra });
}

/**
 * The XT curve node of a curve adaptor (an edge's curve, or the section / profile of a swept or spun surface), in
 * the curve's own parameterisation (sense '+'). `geom` is the Handle_Geom_Curve when there is one, `adHandle` the
 * Handle_Adaptor3d_Curve when there is one: what a type without an XT twin is converted or approximated from.
 */
function addCurveFrom(oc, nodes, ad, { geom = null, adHandle = null, range = null } = {}) {
  const T = oc.GeomAbs_CurveType;
  const type = ad.GetType();
  // Conics: OCCT's gp_Ax2 is right-handed, the XT frame (Y = N × X) too, so the parameterisation is the same.
  if (type === T.GeomAbs_Line) { const l = ad.Line(); return nodes.add(NODE.LINE, { sense: '+', pvec: xyz(l.Location()), direction: dir(l.Direction()) }); }
  if (type === T.GeomAbs_Circle) { const c = ad.Circle(); const a = c.Position(); return nodes.add(NODE.CIRCLE, { sense: '+', centre: xyz(a.Location()), normal: dir(a.Direction()), x_axis: dir(a.XDirection()), radius: c.Radius() * M }); }
  if (type === T.GeomAbs_Ellipse) { const e = ad.Ellipse(); const a = e.Position(); return nodes.add(NODE.ELLIPSE, { sense: '+', centre: xyz(a.Location()), normal: dir(a.Direction()), x_axis: dir(a.XDirection()), major_radius: e.MajorRadius() * M, minor_radius: e.MinorRadius() * M }); }
  let bs = null;
  if (type === T.GeomAbs_BSplineCurve) bs = ad.BSpline();
  else if (type === T.GeomAbs_BezierCurve) bs = oc.GeomConvert.CurveToBSplineCurve(new oc.Handle_Geom_Curve_2(ad.Bezier().get()), oc.Convert_ParameterisationType.Convert_TgtThetaOver2);
  else if (geom) {
    // Anything else (a hyperbola or parabola where a plane cuts a cone, an offset curve …): XT has no such curve, so
    // it is written as a B-spline — exactly for the conics — over the edge's own range (the curve itself may be
    // unbounded, which the conversion refuses).
    const unbounded = (t) => !Number.isFinite(t) || Math.abs(t) > 1e50;
    const trimmed = range && (unbounded(ad.FirstParameter()) || unbounded(ad.LastParameter()) || type === T.GeomAbs_Hyperbola || type === T.GeomAbs_Parabola)
      ? new oc.Handle_Geom_Curve_2(new oc.Geom_TrimmedCurve(geom, range[0], range[1], true, true)) : geom;
    bs = oc.GeomConvert.CurveToBSplineCurve(trimmed, oc.Convert_ParameterisationType.Convert_TgtThetaOver2);
  }
  else if (adHandle) {
    const approx = new oc.GeomConvert_ApproxCurve_2(adHandle, 1e-5, oc.GeomAbs_Shape.GeomAbs_C2, 200, 9);
    if (!approx.HasResult()) throw xtError('a curve could not be converted to a B-spline', 'xt-write');
    bs = approx.Curve();
  }
  if (!bs) throw xtError('a curve could not be written', 'xt-write');
  return addBCurve(nodes, bsplineCurveData(oc, bs.get()), {});
}

/** The XT curve node of an edge (in the edge's own direction: sense '+'). */
function addCurve(oc, nodes, edge) {
  const h = oc.BRep_Tool.Curve_2(edge, 0, 0);
  if (h.IsNull()) throw xtError('an edge without a 3D curve', 'xt-write');
  const ad = new oc.GeomAdaptor_Curve_2(h);
  const ba = new oc.BRepAdaptor_Curve_2(edge); const range = [ba.FirstParameter(), ba.LastParameter()]; ba.delete();
  try { return addCurveFrom(oc, nodes, ad, { geom: h, range }); } finally { ad.delete(); }
}

/** NURBS data of an OCCT B-spline surface (metres), periodic directions unwrapped. */
function bsplineSurfaceData(oc, bs) {
  const nu = bs.NbUPoles(); const nv = bs.NbVPoles(); const rational = bs.IsURational() || bs.IsVRational();
  let poles = []; let weights = [];
  for (let i = 1; i <= nu; i++) { const row = []; const wr = []; for (let j = 1; j <= nv; j++) { row.push(xyz(bs.Pole(i, j))); wr.push(rational ? bs.Weight(i, j) : 1); } poles.push(row); weights.push(wr); }
  const dirData = (u) => {
    const nk = u ? bs.NbUKnots() : bs.NbVKnots(); const knots = []; const mults = [];
    for (let i = 1; i <= nk; i++) { knots.push(u ? bs.UKnot(i) : bs.VKnot(i)); mults.push(u ? bs.UMultiplicity(i) : bs.VMultiplicity(i)); }
    return { knots, mults, degree: u ? bs.UDegree() : bs.VDegree(), periodic: u ? bs.IsUPeriodic() : bs.IsVPeriodic(), closed: u ? bs.IsUClosed() : bs.IsVClosed() };
  };
  const U = dirData(true); const V = dirData(false);
  const bounds = { u0: 0, u1: 0, v0: 0, v1: 0 };
  bounds.u0 = U.knots[0]; bounds.u1 = U.knots.at(-1); bounds.v0 = V.knots[0]; bounds.v1 = V.knots.at(-1);
  let uFlat = flatKnots(U.knots, U.mults); let vFlat = flatKnots(V.knots, V.mults);
  const probe = [[0.21, 0.37], [0.5, 0.5], [0.83, 0.64]].map(([a, c]) => [bounds.u0 + a * (bounds.u1 - bounds.u0), bounds.v0 + c * (bounds.v1 - bounds.v0)]);
  const want = probe.map(([u, v]) => xyz(bs.Value(u, v)));
  const fits = (uf, vf, P, W) => probe.every(([u, v], k) => dist(surfacePoint(U.degree, uf, V.degree, vf, P, rational ? W : null, u, v), want[k]) < 1e-9);
  // The unwrapped knots of a periodic direction (the other direction expanded as it is, or already unwrapped).
  const tryUnwrap = (isU) => {
    const D = isU ? U : V; const n = isU ? poles.length : poles[0].length;
    for (let shift = 0; shift < n; shift++) {
      const w = unwrapPeriodic(D.knots, D.mults, D.degree, n, shift);
      const P = isU ? w.order.map((i) => poles[i]) : poles.map((row) => w.order.map((j) => row[j]));
      const W = isU ? w.order.map((i) => weights[i]) : weights.map((row) => w.order.map((j) => row[j]));
      const uf = isU ? w.flat : uFlat; const vf = isU ? vFlat : w.flat;
      if (fits(uf, vf, P, W)) { poles = P; weights = W; if (isU) uFlat = w.flat; else vFlat = w.flat; return true; }
    }
    return false;
  };
  // Both directions periodic: the alignment of one can only be checked once the other is unwrapped, so the first
  // is tried against each alignment of the second.
  if (U.periodic && V.periodic) {
    const nu0 = poles.length; let ok = false;
    for (let su = 0; su < nu0 && !ok; su++) {
      const w = unwrapPeriodic(U.knots, U.mults, U.degree, nu0, su);
      const saved = { poles, weights, uFlat };
      poles = w.order.map((i) => saved.poles[i]); weights = w.order.map((i) => saved.weights[i]); uFlat = w.flat;
      if (tryUnwrap(false)) ok = true; else ({ poles, weights, uFlat } = saved);
    }
    if (!ok) throw xtError('a doubly periodic B-spline surface could not be unwrapped', 'xt-write');
  } else if (U.periodic) { if (!tryUnwrap(true)) throw xtError('a periodic B-spline surface could not be unwrapped', 'xt-write'); }
  else if (V.periodic) { if (!tryUnwrap(false)) throw xtError('a periodic B-spline surface could not be unwrapped', 'xt-write'); }
  const ud = distinctKnots(uFlat); const vd = distinctKnots(vFlat);
  return { U: { ...U, ...ud }, V: { ...V, ...vd }, rational, poles, weights };
}

function addBSurface(nodes, d) {
  const dim = d.rational ? 4 : 3; const verts = [];
  for (let i = 0; i < d.poles.length; i++) for (let j = 0; j < d.poles[i].length; j++) {
    const p = d.poles[i][j]; const w = d.weights[i][j];
    if (d.rational) verts.push(p[0] * w, p[1] * w, p[2] * w, w); else verts.push(...p);
  }
  const v = nodes.add(NODE.BSPLINE_VERTICES, { vertices: verts }, false);
  const um = nodes.add(NODE.KNOT_MULT, { mult: d.U.mults }, false);
  const vm = nodes.add(NODE.KNOT_MULT, { mult: d.V.mults }, false);
  const uk = nodes.add(NODE.KNOT_SET, { knots: d.U.knots }, false);
  const vk = nodes.add(NODE.KNOT_SET, { knots: d.V.knots }, false);
  const nurbs = nodes.add(NODE.NURBS_SURF, {
    u_periodic: d.U.periodic, v_periodic: d.V.periodic, u_degree: d.U.degree, v_degree: d.V.degree,
    n_u_vertices: d.poles.length, n_v_vertices: d.poles[0].length, u_knot_type: 1, v_knot_type: 1,
    n_u_knots: d.U.knots.length, n_v_knots: d.V.knots.length, rational: d.rational, u_closed: d.U.closed || d.U.periodic,
    v_closed: d.V.closed || d.V.periodic, surface_form: 1, vertex_dim: dim, bspline_vertices: v.index,
    u_knot_mult: um.index, v_knot_mult: vm.index, u_knots: uk.index, v_knots: vk.index,
  }, false);
  return nodes.add(NODE.B_SURFACE, { sense: '+', nurbs: nurbs.index, data: 0 });
}

/**
 * The XT surface node of a surface adaptor, and `sign`: +1 when the XT surface's natural normal is the OCCT
 * surface's, −1 when it is the opposite. `bounds` [u0, u1, v0, v1] (the face's) trims an unbounded surface before
 * it is converted to a B-spline; `geom` is its Handle_Geom_Surface when there is one. Curves and surfaces a
 * surface is made from go into `under` (the body's boundary chains, ownerless: "indirectly attached").
 */
function addSurfaceFrom(oc, nodes, ad, { geom = null, bounds = null, under }) {
  const S = oc.GeomAbs_SurfaceType;
  const type = ad.GetType();
  const frame = (ax) => ({ P: xyz(ax.Location()), Z: dir(ax.Direction()), X: dir(ax.XDirection()), direct: ax.Direct() });
  if (type === S.GeomAbs_Plane) {
    const f = frame(ad.Plane().Position());
    return { node: nodes.add(NODE.PLANE, { sense: '+', pvec: f.P, normal: f.Z, x_axis: f.X }), sign: f.direct ? 1 : -1 };
  }
  if (type === S.GeomAbs_Cylinder) {
    const c = ad.Cylinder(); const f = frame(c.Position());
    return { node: nodes.add(NODE.CYLINDER, { sense: '+', pvec: f.P, axis: f.Z, radius: c.Radius() * M, x_axis: f.X }), sign: f.direct ? 1 : -1 };
  }
  if (type === S.GeomAbs_Cone) {
    // XT: R = P − vA + (X cos u + Y sin u)(r + v tan a), a > 0, Y = A × X; the cone axis points away from the half
    // in use. OCCT: R = P + (r + v sin α)(X cos u + Y sin u) + v cos α Z.
    const c = ad.Cone(); const f = frame(c.Position()); const alpha = c.SemiAngle();
    const A = alpha > 0 ? f.Z.map((x) => -x) : f.Z; const a = Math.abs(alpha);
    return { node: nodes.add(NODE.CONE, { sense: '+', pvec: f.P, axis: A, radius: c.RefRadius() * M, sin_half_angle: Math.sin(a), cos_half_angle: Math.cos(a), x_axis: f.X }), sign: f.direct ? -1 : 1 };
  }
  if (type === S.GeomAbs_Sphere) {
    const s = ad.Sphere(); const f = frame(s.Position());
    return { node: nodes.add(NODE.SPHERE, { sense: '+', centre: f.P, radius: s.Radius() * M, axis: f.Z, x_axis: f.X }), sign: f.direct ? 1 : -1 };
  }
  if (type === S.GeomAbs_Torus) {
    const t = ad.Torus(); const f = frame(t.Position());
    return { node: nodes.add(NODE.TORUS, { sense: '+', centre: f.P, axis: f.Z, major_radius: t.MajorRadius() * M, minor_radius: t.MinorRadius() * M, x_axis: f.X }), sign: f.direct ? 1 : -1 };
  }
  if (type === S.GeomAbs_SurfaceOfExtrusion) {
    // R(u, v) = C(u) + v D in both kernels.
    const basis = ad.BasisCurve();
    const section = addCurveFrom(oc, nodes, basis.get(), { adHandle: basis }); under.curves.push(section);
    return { node: nodes.add(NODE.SWEPT_SURF, { sense: '+', section: section.index, sweep: dir(ad.Direction()), scale: null }), sign: 1 };
  }
  if (type === S.GeomAbs_SurfaceOfRevolution) {
    // XT: u along the profile, v round the axis; OCCT the other way round, so the natural normal turns over.
    const basis = ad.BasisCurve(); const c = basis.get();
    const profile = addCurveFrom(oc, nodes, c, { adHandle: basis }); under.curves.push(profile);
    const axis = ad.AxeOfRevolution(); const base = xyz(axis.Location()); const A = dir(axis.Direction());
    const t0 = c.FirstParameter(); const t1 = c.LastParameter();
    const offAxis = (p) => { const d = [p[0] - base[0], p[1] - base[1], p[2] - base[2]]; const h = d[0] * A[0] + d[1] * A[1] + d[2] * A[2]; return [d[0] - h * A[0], d[1] - h * A[1], d[2] - h * A[2]]; };
    const ends = [t0, t1].map((t) => (Number.isFinite(t) && Math.abs(t) < 1e50 ? { t, p: xyz(c.Value(t)) } : null));
    const onAxis = (e) => e && Math.hypot(...offAxis(e.p)) < 1e-9;
    // x_axis: from the axis to the profile, when the profile lies in one plane with the axis.
    let xAxis = null;
    if (ends[0] && ends[1]) {
      const samples = Array.from({ length: 9 }, (_, k) => xyz(c.Value(t0 + ((t1 - t0) * (k + 0.5)) / 9)));
      const far = samples.map(offAxis).reduce((a, b) => (Math.hypot(...b) > Math.hypot(...a) ? b : a));
      if (Math.hypot(...far) > 1e-9) {
        const X = far.map((x) => x / Math.hypot(...far)); const n = cross(A, X);
        if (samples.every((p) => Math.abs((p[0] - base[0]) * n[0] + (p[1] - base[1]) * n[1] + (p[2] - base[2]) * n[2]) < 1e-9)) xAxis = X;
      }
    }
    return {
      node: nodes.add(NODE.SPUN_SURF, {
        sense: '+', profile: profile.index, base, axis: A,
        start: onAxis(ends[0]) ? ends[0].p : null, end: onAxis(ends[1]) ? ends[1].p : null,
        start_param: onAxis(ends[0]) ? t0 : null, end_param: onAxis(ends[1]) ? t1 : null, x_axis: xAxis, scale: null,
      }),
      sign: -1,
    };
  }
  if (type === S.GeomAbs_OffsetSurface) {
    // Offset along the basis's natural normal in both kernels; XT's natural normal is `sign` times OCCT's.
    const basisH = ad.BasisSurface();
    const basis = addSurfaceFrom(oc, nodes, basisH.get(), { under }); under.surfaces.push(basis.node);
    return { node: nodes.add(NODE.OFFSET_SURF, { sense: '+', check: 'U', true_offset: false, surface: basis.node.index, offset: ad.OffsetValue() * M * basis.sign, scale: null }), sign: basis.sign };
  }
  let bs = null;
  if (type === S.GeomAbs_BSplineSurface) bs = ad.BSpline();
  else if (type === S.GeomAbs_BezierSurface) bs = oc.GeomConvert.SurfaceToBSplineSurface(new oc.Handle_Geom_Surface_2(ad.Bezier().get()));
  else if (geom) {
    // Anything else: converted exactly where OCCT can, approximated otherwise — over the face's own bounds.
    const trimmed = bounds ? new oc.Handle_Geom_Surface_2(new oc.Geom_RectangularTrimmedSurface_1(geom, bounds[0], bounds[1], bounds[2], bounds[3], true, true)) : geom;
    try { bs = oc.GeomConvert.SurfaceToBSplineSurface(trimmed); }
    catch {
      const approx = new oc.GeomConvert_ApproxSurface_1(trimmed, 1e-4, oc.GeomAbs_Shape.GeomAbs_C1, oc.GeomAbs_Shape.GeomAbs_C1, 9, 9, 100, 3);
      if (!approx.HasResult()) throw xtError('a surface could not be converted to a B-spline', 'xt-write');
      bs = approx.Surface();
    }
  }
  if (!bs) throw xtError(`a surface of kind ${type?.value ?? type} could not be written`, 'xt-write');
  return { node: addBSurface(nodes, bsplineSurfaceData(oc, bs.get())), sign: 1 };
}

/** The XT surface node of a face's surface (see addSurfaceFrom). */
function addSurface(oc, nodes, face, under) {
  const h = oc.BRep_Tool.Surface_2(face);
  const ad = new oc.GeomAdaptor_Surface_2(h);
  const bra = new oc.BRepAdaptor_Surface_2(face, true);
  const bounds = [bra.FirstUParameter(), bra.LastUParameter(), bra.FirstVParameter(), bra.LastVParameter()];
  bra.delete();
  try { return addSurfaceFrom(oc, nodes, ad, { geom: h, bounds, under }); } finally { ad.delete(); }
}

const isSeam = (oc, edge, face) => oc.BRep_Tool.IsClosed_2(edge, face);

/**
 * XT nodes of the solids in a shape: one solid body (several solids are disjoint solid regions of it).
 * Returns the node list, the body first.
 */
export function shapeToXtNodes(oc, shape) {
  const TA = oc.TopAbs_ShapeEnum; const OR = oc.TopAbs_Orientation;
  const solids = [];
  for (const ex = new oc.TopExp_Explorer_2(shape, TA.TopAbs_SOLID, TA.TopAbs_SHAPE); ex.More(); ex.Next()) solids.push(oc.TopoDS.Solid_1(ex.Current()));
  if (!solids.length) throw xtError('no solid to write', 'xt-empty');
  const nodes = new Nodes();
  const body = nodes.add(NODE.BODY, { res_size: 1000, res_linear: 1e-8, state: 1, body_type: 1, nom_geom_state: 1 });
  const vertexMap = new oc.TopTools_IndexedMapOfShape_1(); oc.TopExp.MapShapes_1(shape, TA.TopAbs_VERTEX, vertexMap);
  const edgeMap = new oc.TopTools_IndexedMapOfShape_1(); oc.TopExp.MapShapes_1(shape, TA.TopAbs_EDGE, edgeMap);
  const vertices = new Map(); // vertex map index → { node, point }
  const edges = new Map(); // edge map index → { node, curve, start, end, fins: [] }
  const surfaces = []; const curves = []; const points = [];
  // The two ends of a degenerate edge (a pole) are one point: once the edge is left out they are one vertex.
  const same = new Map(); const root = (k) => { while (same.has(k)) k = same.get(k); return k; };
  for (let i = 1; i <= edgeMap.Extent(); i++) {
    const e = oc.TopoDS.Edge_1(edgeMap.FindKey(i));
    if (!oc.BRep_Tool.Degenerated(e)) continue;
    const a = root(vertexMap.FindIndex(oc.TopExp.FirstVertex(e, false))); const b = root(vertexMap.FindIndex(oc.TopExp.LastVertex(e, false)));
    if (a !== b) same.set(b, a);
  }
  const vertexOf = (v) => {
    const k = root(vertexMap.FindIndex(v));
    let rec = vertices.get(k);
    if (!rec) {
      const tol = oc.BRep_Tool.Tolerance_3(v);
      const point = nodes.add(NODE.POINT, { pvec: xyz(oc.BRep_Tool.Pnt(v)) });
      const node = nodes.add(NODE.VERTEX, { point: point.index, tolerance: tol > 1e-5 ? tol * M : null, owner: body.index });
      point.owner = node.index; points.push(point);
      rec = { node, fins: [] }; vertices.set(k, rec);
    }
    return rec;
  };
  const edgeOf = (e) => {
    const k = edgeMap.FindIndex(e);
    let rec = edges.get(k);
    if (!rec) {
      const fwd = oc.TopoDS.Edge_1(e.Oriented(OR.TopAbs_FORWARD));
      const curve = addCurve(oc, nodes, fwd); curves.push(curve);
      const node = nodes.add(NODE.EDGE, { tolerance: null, curve: curve.index, owner: body.index });
      curve.owner = node.index;
      rec = { node, start: vertexOf(oc.TopExp.FirstVertex(fwd, false)), end: vertexOf(oc.TopExp.LastVertex(fwd, false)), fins: [] };
      edges.set(k, rec);
    }
    return rec;
  };
  const faceRecs = [];
  const regions = [];
  const infinite = nodes.add(NODE.REGION, { region_type: 'V', body: body.index }); regions.push(infinite);
  const infiniteShells = [];
  const regionShells = new Map(); // region node → [shell nodes]
  regionShells.set(infinite, infiniteShells);
  let firstSolidShell = null;
  for (const solid of solids) {
    const solidRegion = nodes.add(NODE.REGION, { region_type: 'S', body: body.index }); regions.push(solidRegion);
    const solidShells = []; regionShells.set(solidRegion, solidShells);
    const outer = oc.BRepClass3d.OuterShell(solid);
    for (const sx = new oc.TopExp_Explorer_2(solid, TA.TopAbs_SHELL, TA.TopAbs_SHAPE); sx.More(); sx.Next()) {
      const shell = oc.TopoDS.Shell_1(sx.Current());
      const back = nodes.add(NODE.SHELL, { body: body.index, region: solidRegion.index }); solidShells.push(back);
      firstSolidShell ??= back;
      let front;
      if (!outer.IsNull() && shell.IsSame(outer)) { front = nodes.add(NODE.SHELL, { body: 0, region: infinite.index }); infiniteShells.push(front); }
      else { const cavity = nodes.add(NODE.REGION, { region_type: 'V', body: body.index }); regions.push(cavity); front = nodes.add(NODE.SHELL, { body: 0, region: cavity.index }); regionShells.set(cavity, [front]); }
      const backFaces = []; const frontFaces = [];
      for (const fx = new oc.TopExp_Explorer_2(shell, TA.TopAbs_FACE, TA.TopAbs_SHAPE); fx.More(); fx.Next()) {
        const face = oc.TopoDS.Face_1(fx.Current());
        const { node: surf, sign } = addSurface(oc, nodes, face, { curves, surfaces }); surfaces.push(surf);
        const reversed = face.Orientation_1() === OR.TopAbs_REVERSED;
        const fnode = nodes.add(NODE.FACE, { tolerance: null, shell: back.index, front_shell: front.index, surface: surf.index, sense: (reversed ? -1 : 1) * sign > 0 ? '+' : '-' });
        surf.owner = fnode.index;
        backFaces.push(fnode); frontFaces.push(fnode);
        faceRecs.push({ face, fnode });
      }
      back.face = chain(backFaces); chain(backFaces, 'next', 'previous');
      front.front_face = backFaces[0]?.index ?? 0; chain(frontFaces, 'next_front', 'previous_front');
    }
  }
  // Loops and fins: the wires of each face (orientations composed with the face's), seam and degenerate edges left
  // out, and the fins regrouped into closed chains by their vertices.
  for (const { face, fnode } of faceRecs) {
    const loops = [];
    // A seam is an edge the face's wires use twice (both sides of it belong to this face). OCCT's IsClosed is not
    // enough: two faces split from one surface both report their common edge as closed, and it is not a seam.
    const uses = new Map();
    for (const ex = new oc.TopExp_Explorer_2(face, TA.TopAbs_EDGE, TA.TopAbs_SHAPE); ex.More(); ex.Next()) { const k = edgeMap.FindIndex(ex.Current()); uses.set(k, (uses.get(k) ?? 0) + 1); }
    const seam = (e) => (uses.get(edgeMap.FindIndex(e)) ?? 0) > 1 && isSeam(oc, e, face);
    for (const wx = new oc.TopExp_Explorer_2(face, TA.TopAbs_WIRE, TA.TopAbs_SHAPE); wx.More(); wx.Next()) {
      const wire = oc.TopoDS.Wire_1(wx.Current());
      const fins = [];
      for (const we = new oc.BRepTools_WireExplorer_3(wire, face); we.More(); we.Next()) {
        const e = we.Current();
        if (oc.BRep_Tool.Degenerated(e) || seam(e)) continue;
        const rec = edgeOf(e);
        const plus = e.Orientation_1() === OR.TopAbs_FORWARD;
        fins.push({ rec, plus, from: plus ? rec.start : rec.end, to: plus ? rec.end : rec.start });
      }
      // Regroup: follow each chain from vertex to vertex until it closes.
      const left = fins.slice();
      while (left.length) {
        const loop = [left.shift()];
        while (loop.at(-1).to !== loop[0].from) {
          const k = left.findIndex((f) => f.from === loop.at(-1).to);
          if (k < 0) break;
          loop.push(...left.splice(k, 1));
        }
        loops.push(loop);
      }
    }
    const loopNodes = [];
    for (const loop of loops) {
      const lnode = nodes.add(NODE.LOOP, { face: fnode.index });
      const finNodes = loop.map((f) => {
        const fin = nodes.add(NODE.FIN, { loop: lnode.index, edge: f.rec.node.index, sense: f.plus ? '+' : '-', vertex: f.to.node.index, curve: 0 }, false);
        f.rec.fins.push({ fin, plus: f.plus });
        return fin;
      });
      finNodes.forEach((fin, i) => { fin.forward = finNodes[(i + 1) % finNodes.length].index; fin.backward = finNodes[(i - 1 + finNodes.length) % finNodes.length].index; });
      lnode.halfedge = finNodes[0].index;
      loopNodes.push(lnode);
    }
    fnode.loop = loopNodes[0]?.index ?? 0;
    loopNodes.forEach((l, i) => { l.next = loopNodes[i + 1]?.index ?? 0; });
  }
  // Edges: the positive fin is the edge's primary fin; a missing side gets a dummy fin; fins ring around the edge.
  for (const rec of edges.values()) {
    let plus = rec.fins.find((f) => f.plus)?.fin; let minus = rec.fins.find((f) => !f.plus)?.fin;
    plus ??= nodes.add(NODE.FIN, { loop: 0, edge: rec.node.index, sense: '+', vertex: rec.end.node.index }, false);
    minus ??= nodes.add(NODE.FIN, { loop: 0, edge: rec.node.index, sense: '-', vertex: rec.start.node.index }, false);
    const ring = [plus, ...rec.fins.map((f) => f.fin).filter((f) => f !== plus && f !== minus), minus];
    ring.forEach((f, i) => { f.other = ring[(i + 1) % ring.length].index; });
    rec.node.halfedge = plus.index;
    rec.end.fins.push(plus); rec.start.fins.push(minus);
  }
  for (const rec of vertices.values()) { rec.node.halfedge = rec.fins[0]?.index ?? 0; rec.fins.forEach((f, i) => { f.next_at_vx = rec.fins[i + 1]?.index ?? 0; }); }
  for (const [region, shells] of regionShells) { region.shell = shells[0]?.index ?? 0; shells.forEach((s, i) => { s.next = shells[i + 1]?.index ?? 0; }); }
  body.region = chain(regions);
  body.shell = firstSolidShell?.index ?? 0;
  body.edge = chain([...edges.values()].map((r) => r.node));
  body.vertex = chain([...vertices.values()].map((r) => r.node));
  body.boundary_surface = chain(surfaces);
  body.boundary_curve = chain(curves);
  body.boundary_point = chain(points);
  body.highest_node_id = nodes.nextId - 1;
  vertexMap.delete(); edgeMap.delete();
  return nodes.list;
}

/** XT text (or neutral binary) of a shape given as BREP text; options as writeXt's (binary, file, embedded, …). */
export async function brepToXt(brep, options = {}) {
  const oc = await loadFullKernel();
  const shape = shapeFromBrep(oc, brep);
  try { return writeXt(shapeToXtNodes(oc, shape), options); } finally { shape.delete(); }
}

// ———————————————————————————————————————— reading ————————————————————————————————————————

const MM = 1000; // m → mm

/** Builds OCCT geometry from XT nodes (millimetres). */
class Geometry {
  constructor(oc, nodes) { this.oc = oc; this.nodes = nodes; this.warnings = new Set(); }
  get(i) { return i ? this.nodes.get(i) : null; }
  pnt(v) { return new this.oc.gp_Pnt_3(v[0] * MM, v[1] * MM, v[2] * MM); }
  dir(v) { return new this.oc.gp_Dir_4(v[0], v[1], v[2]); }
  ax3(P, Z, X) { return new this.oc.gp_Ax3_3(this.pnt(P), this.dir(Z), this.dir(X)); }
  ax2(P, Z, X) { return new this.oc.gp_Ax2_2(this.pnt(P), this.dir(Z), this.dir(X)); }

  /** NURBS curve data of a B_CURVE (or a NURBS_CURVE node): { degree, poles, weights, knots, mults }. */
  nurbsCurve(n) {
    const nurbs = n.type === NODE.NURBS_CURVE ? n : this.get(n.nurbs);
    const verts = this.get(nurbs.bspline_vertices).vertices; const dim = nurbs.vertex_dim;
    const poles = []; const weights = [];
    for (let i = 0; i < nurbs.n_vertices; i++) {
      const c = verts.slice(i * dim, i * dim + dim);
      if (nurbs.rational) { const w = c[dim - 1]; weights.push(w); poles.push(c.slice(0, dim - 1).map((x) => x / w)); } else { weights.push(1); poles.push(c); }
    }
    return { degree: nurbs.degree, poles, weights, rational: nurbs.rational, periodic: Boolean(nurbs.periodic), knots: this.get(nurbs.knots).knots, mults: this.get(nurbs.knot_mult).mult, dim: nurbs.rational ? dim - 1 : dim };
  }
  /** An OCCT B-spline curve from poles (metres), weights, distinct knots and multiplicities. */
  makeBCurve(polesM, weights, knotsList, multsList, degree, periodic, rational) {
    const oc = this.oc; const n = polesM.length;
    const poles = new oc.TColgp_Array1OfPnt_2(1, n);
    polesM.forEach((p, i) => poles.SetValue(i + 1, new oc.gp_Pnt_3(p[0] * MM, p[1] * MM, (p[2] ?? 0) * MM)));
    const knots = new oc.TColStd_Array1OfReal_2(1, knotsList.length); knotsList.forEach((k, i) => knots.SetValue(i + 1, k));
    const mults = new oc.TColStd_Array1OfInteger_2(1, multsList.length); multsList.forEach((m, i) => mults.SetValue(i + 1, m));
    if (rational) {
      const w = new oc.TColStd_Array1OfReal_2(1, n); weights.forEach((x, i) => w.SetValue(i + 1, x));
      return new oc.Geom_BSplineCurve_2(poles, w, knots, mults, degree, periodic, true);
    }
    return new oc.Geom_BSplineCurve_1(poles, knots, mults, degree, periodic);
  }
  /**
   * The OCCT curve of XT NURBS data. A periodic XT curve (stored unwrapped) is wound back into OCCT's periodic form,
   * its pole alignment found by comparing points; the unwrapped curve itself is the fallback.
   */
  bsplineCurve(d, periodic = false) {
    const open = this.makeBCurve(d.poles, d.weights, d.knots, d.mults, d.degree, false, d.rational);
    if (!periodic) return open;
    const w = rewrapPeriodic(d.knots, d.mults, d.degree, d.poles.length);
    if (!w) return open;
    const t0 = open.FirstParameter(); const t1 = open.LastParameter();
    const probe = [0.11, 0.47, 0.83].map((f) => t0 + f * (t1 - t0));
    const want = probe.map((t) => open.Value(t));
    for (let shift = 0; shift < w.n; shift++) {
      const idx = Array.from({ length: w.n }, (_, k) => (k + shift) % w.n);
      try {
        const c = this.makeBCurve(idx.map((i) => d.poles[i]), idx.map((i) => d.weights[i]), w.knots, w.mults, d.degree, true, d.rational);
        if (probe.every((t, k) => c.Value(t).Distance(want[k]) < 1e-7)) return c;
      } catch { /* not this alignment */ }
    }
    this.warnings.add('periodic-unwrapped');
    return open;
  }
  /** A Handle_Geom_Curve for an XT curve node (in the curve's own parameterisation), or null. */
  curve(i, depth = 0) {
    const oc = this.oc; const n = this.get(i);
    if (!n || depth > 4) return null;
    const H = (c) => new oc.Handle_Geom_Curve_2(c);
    switch (n.type) {
      case NODE.LINE: return H(new oc.Geom_Line_3(this.pnt(n.pvec), this.dir(n.direction)));
      case NODE.CIRCLE: return H(new oc.Geom_Circle_2(this.ax2(n.centre, n.normal, n.x_axis), n.radius * MM));
      case NODE.ELLIPSE: return H(new oc.Geom_Ellipse_2(this.ax2(n.centre, n.normal, n.x_axis), n.major_radius * MM, n.minor_radius * MM));
      case NODE.B_CURVE: { const d = this.nurbsCurve(n); return H(this.bsplineCurve(d, d.periodic)); }
      case NODE.TRIMMED_CURVE: return this.curve(n.basis_curve, depth + 1);
      case NODE.INTERSECTION: {
        const chart = this.get(n.chart);
        const pts = [this.get(n.start)?.hvec?.[0], ...(chart?.hvec ?? []), this.get(n.end)?.hvec?.[0]].filter(Boolean);
        this.warnings.add('intersection-curve');
        return this.through(pts);
      }
      case NODE.SP_CURVE: {
        const surf = this.surface(n.surface); const bc = this.get(n.b_curve);
        if (!surf || !bc) return null;
        const d = this.nurbsCurve(bc); const flat = flatKnots(d.knots, d.mults);
        const t0 = flat[d.degree]; const t1 = flat[flat.length - 1 - d.degree];
        const pts = [];
        for (let k = 0; k <= 40; k++) {
          const t = t0 + ((t1 - t0) * k) / 40;
          const uv = curvePoint(d.degree, flat, d.poles.map((p) => [p[0], p[1], 0]), d.rational ? d.weights : null, t);
          const p = surf.handle.get().Value(uv[0], uv[1]);
          pts.push([p.X() / MM, p.Y() / MM, p.Z() / MM]);
        }
        this.warnings.add('sp-curve');
        return this.through(pts);
      }
      case NODE.POLYLINE: {
        const data = this.get(n.data); const pv = this.get(data?.pvec)?.values;
        return pv ? this.through(pv, 1) : null;
      }
      default: this.warnings.add(`curve-${n.type}`); return null;
    }
  }
  /** A B-spline through points (metres): degree 1 for polylines, interpolated otherwise. */
  through(pts, degree = 3) {
    const oc = this.oc;
    const uniq = pts.filter((p, i) => i === 0 || dist(p, pts[i - 1]) > 1e-12);
    if (uniq.length < 2) return null;
    const arr = new oc.TColgp_Array1OfPnt_2(1, uniq.length);
    uniq.forEach((p, i) => arr.SetValue(i + 1, this.pnt(p)));
    const fit = new oc.GeomAPI_PointsToBSpline_2(arr, degree === 1 ? 1 : Math.min(3, uniq.length - 1), degree === 1 ? 1 : 8, oc.GeomAbs_Shape.GeomAbs_C2, 1e-6);
    return new oc.Handle_Geom_Curve_2(fit.Curve().get());
  }
  /** { handle: Handle_Geom_Surface, sign } for an XT surface node (sign: XT natural normal vs OCCT's), or null. */
  surface(i, depth = 0) {
    const oc = this.oc; const n = this.get(i);
    if (!n || depth > 4) return null;
    const H = (s, sign = 1) => ({ handle: new oc.Handle_Geom_Surface_2(s), sign });
    switch (n.type) {
      case NODE.PLANE: return H(new oc.Geom_Plane_1(this.ax3(n.pvec, n.normal, n.x_axis)));
      case NODE.CYLINDER: return H(new oc.Geom_CylindricalSurface_1(this.ax3(n.pvec, n.axis, n.x_axis), n.radius * MM));
      case NODE.CONE: {
        // A left-handed frame (Z = −A, Y = A × X) gives OCCT the XT parameterisation exactly.
        const ax = this.ax3(n.pvec, n.axis.map((x) => -x), n.x_axis); ax.YReverse();
        return H(new oc.Geom_ConicalSurface_1(ax, Math.atan2(n.sin_half_angle, n.cos_half_angle), n.radius * MM));
      }
      case NODE.SPHERE: return H(new oc.Geom_SphericalSurface_1(this.ax3(n.centre, n.axis, n.x_axis), n.radius * MM));
      case NODE.TORUS:
        if (!(n.major_radius > 0)) { this.warnings.add('lemon-torus'); return null; }
        return H(new oc.Geom_ToroidalSurface_1(this.ax3(n.centre, n.axis, n.x_axis), n.major_radius * MM, n.minor_radius * MM));
      case NODE.B_SURFACE: return H(this.bsplineSurface(this.get(n.nurbs)));
      case NODE.SWEPT_SURF: {
        const c = this.curve(n.section); if (!c) return null;
        return H(new oc.Geom_SurfaceOfLinearExtrusion(c, this.dir(n.sweep)));
      }
      case NODE.SPUN_SURF: {
        // XT spins with u along the profile and v around the axis; OCCT the other way round: the normal turns over.
        const c = this.curve(n.profile); if (!c) return null;
        return H(new oc.Geom_SurfaceOfRevolution(c, new oc.gp_Ax1_2(this.pnt(n.base), this.dir(n.axis))), -1);
      }
      case NODE.OFFSET_SURF: {
        const basis = this.surface(n.surface, depth + 1); if (!basis) return null;
        return H(new oc.Geom_OffsetSurface(basis.handle, n.offset * MM * basis.sign, false), basis.sign);
      }
      default: this.warnings.add(`surface-${n.type}`); return null;
    }
  }
  /** An OCCT B-spline surface from a pole grid [iu][iv] (metres), weights, and per-direction knot data. */
  makeBSurface(P, W, U, V, rational) {
    const oc = this.oc; const nu = P.length; const nv = P[0].length;
    const poles = new oc.TColgp_Array2OfPnt_2(1, nu, 1, nv);
    const weights = rational ? new oc.TColStd_Array2OfReal_2(1, nu, 1, nv) : null;
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const p = P[i][j]; poles.SetValue(i + 1, j + 1, new oc.gp_Pnt_3(p[0] * MM, p[1] * MM, p[2] * MM));
      weights?.SetValue(i + 1, j + 1, W[i][j]);
    }
    const arr = (values, Int) => { const a = Int ? new oc.TColStd_Array1OfInteger_2(1, values.length) : new oc.TColStd_Array1OfReal_2(1, values.length); values.forEach((x, k) => a.SetValue(k + 1, x)); return a; };
    const args = [arr(U.knots), arr(V.knots), arr(U.mults, true), arr(V.mults, true), U.degree, V.degree, U.periodic, V.periodic];
    return weights ? new oc.Geom_BSplineSurface_2(poles, weights, ...args) : new oc.Geom_BSplineSurface_1(poles, ...args);
  }
  /**
   * The OCCT surface of an XT NURBS surface. Periodic directions (stored unwrapped) are wound back into OCCT's
   * periodic form one at a time, each alignment checked against points of the unwrapped surface.
   */
  bsplineSurface(nurbs) {
    const verts = this.get(nurbs.bspline_vertices).vertices; const dim = nurbs.vertex_dim;
    const nu = nurbs.n_u_vertices; const nv = nurbs.n_v_vertices;
    let P = []; let W = [];
    for (let i = 0; i < nu; i++) {
      const row = []; const wr = [];
      for (let j = 0; j < nv; j++) {
        const c = verts.slice((i * nv + j) * dim, (i * nv + j) * dim + dim);
        const w = nurbs.rational ? c[dim - 1] : 1;
        row.push([c[0] / w, c[1] / w, c[2] / w]); wr.push(w);
      }
      P.push(row); W.push(wr);
    }
    let U = { knots: this.get(nurbs.u_knots).knots, mults: this.get(nurbs.u_knot_mult).mult, degree: nurbs.u_degree, periodic: false };
    let V = { knots: this.get(nurbs.v_knots).knots, mults: this.get(nurbs.v_knot_mult).mult, degree: nurbs.v_degree, periodic: false };
    let surface = this.makeBSurface(P, W, U, V, nurbs.rational);
    const rewind = (isU) => {
      const D = isU ? U : V; const count = isU ? P.length : P[0].length;
      const w = rewrapPeriodic(D.knots, D.mults, D.degree, count);
      if (!w) return false;
      const b = [0, 0, 0, 0];
      const u0 = flatKnots(U.knots, U.mults)[U.degree]; const u1 = flatKnots(U.knots, U.mults).at(-1 - U.degree);
      const v0 = flatKnots(V.knots, V.mults)[V.degree]; const v1 = flatKnots(V.knots, V.mults).at(-1 - V.degree);
      b.splice(0, 4, u0, u1, v0, v1);
      const probe = [[0.13, 0.29], [0.52, 0.61], [0.86, 0.44]].map(([a, c]) => [b[0] + a * (b[1] - b[0]), b[2] + c * (b[3] - b[2])]);
      const want = probe.map(([u, v]) => surface.Value(u, v));
      for (let shift = 0; shift < w.n; shift++) {
        const idx = Array.from({ length: w.n }, (_, k) => (k + shift) % w.n);
        const P2 = isU ? idx.map((i) => P[i]) : P.map((row) => idx.map((j) => row[j]));
        const W2 = isU ? idx.map((i) => W[i]) : W.map((row) => idx.map((j) => row[j]));
        const D2 = { knots: w.knots, mults: w.mults, degree: D.degree, periodic: true };
        try {
          const s = this.makeBSurface(P2, W2, isU ? D2 : U, isU ? V : D2, nurbs.rational);
          if (probe.every(([u, v], k) => s.Value(u, v).Distance(want[k]) < 1e-7)) {
            P = P2; W = W2; if (isU) U = D2; else V = D2; surface = s; return true;
          }
        } catch { /* not this alignment */ }
      }
      return false;
    };
    if (nurbs.u_periodic && !rewind(true)) this.warnings.add('periodic-unwrapped');
    if (nurbs.v_periodic && !rewind(false)) this.warnings.add('periodic-unwrapped');
    return surface;
  }
}

/** The bodies of an XT file with their placements: [{ body, matrix (4×3 rows, metres) | null }]. */
function bodiesOf(x) {
  const out = [];
  const visit = (node, trsf, depth) => {
    if (!node || depth > 32) return;
    if (node.type === NODE.BODY) { out.push({ body: node, trsf }); return; }
    if (node.type === NODE.ASSEMBLY) {
      for (let i = node.sub_instance, guard = 0; i && guard < 100000; guard++) {
        const inst = x.nodes.get(i); if (!inst) break;
        const t = x.nodes.get(inst.transform);
        visit(x.nodes.get(inst.part), compose(trsf, t ? { R: t.rotation_matrix, T: t.translation_vector } : null), depth + 1);
        i = inst.next_in_part;
      }
      return;
    }
    if (node.type === NODE.POINTER_LIS_BLOCK || node.type === NODE.PART_XMT_BLOCK) {
      for (const e of node.entries ?? []) visit(x.nodes.get(e), trsf, depth + 1);
      if (node.next_block) visit(x.nodes.get(node.next_block), trsf, depth + 1);
    }
  };
  visit(x.root, null, 0);
  return out;
}
/** Composition of two XT transforms (rotation rows R[9], translation T) — outer applied last. */
function compose(outer, inner) {
  if (!inner) return outer; if (!outer) return inner;
  const R = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { let s = 0; for (let k = 0; k < 3; k++) s += outer.R[r * 3 + k] * inner.R[k * 3 + c]; R.push(s); }
  const T = [0, 1, 2].map((r) => outer.R[r * 3] * inner.T[0] + outer.R[r * 3 + 1] * inner.T[1] + outer.R[r * 3 + 2] * inner.T[2] + outer.T[r]);
  return { R, T };
}

/** Points of an edge's start and end vertices (metres) — null for a ring edge. */
function edgeEnds(nodes, edge) {
  const primary = nodes.get(edge.halfedge); const secondary = primary ? nodes.get(primary.other) : null;
  const vEnd = primary ? nodes.get(primary.vertex) : null; const vStart = secondary ? nodes.get(secondary.vertex) : null;
  const pt = (v) => (v ? nodes.get(v.point)?.pvec ?? null : null);
  return { start: vStart, end: vEnd, p0: pt(vStart), p1: pt(vEnd) };
}

/**
 * The OCCT faces of one XT body, grouped as the body holds them: for a solid body one group per shell of each
 * solid region (its back faces — outer boundary and cavities alike), each region's groups together; otherwise one
 * group of every face. Returns { regions: [[faces of a shell, …], …], failed, solid }.
 */
function bodyFaces(oc, g, body) {
  const nodes = g.nodes;
  const chainOf = (start, field) => { const out = []; for (let i = start, guard = 0; i && guard < 1e6; guard++) { const f = nodes.get(i); if (!f) break; out.push(f); i = f[field]; } return out; };
  const regions = chainOf(body.region, 'next');
  const solid = body.body_type === 1 && regions.some((r) => r.region_type === 'S');
  const groups = []; // [[face nodes of a shell], …] per region
  if (solid) {
    for (const region of regions.filter((r) => r.region_type === 'S')) groups.push(chainOf(region.shell, 'next').map((sh) => chainOf(sh.face, 'next')));
  } else {
    const all = new Set();
    for (const region of regions) for (const sh of chainOf(region.shell, 'next')) { for (const f of chainOf(sh.face, 'next')) all.add(f); for (const f of chainOf(sh.front_face, 'next_front')) all.add(f); }
    groups.push([[...all]]);
  }
  const vertexShapes = new Map(); const edgeShapes = new Map();
  const vertexOf = (v) => {
    if (!v) return null;
    let s = vertexShapes.get(v.index);
    if (!s) { const p = nodes.get(v.point).pvec; const mk = new oc.BRepBuilderAPI_MakeVertex(g.pnt(p)); s = mk.Vertex(); mk.delete(); vertexShapes.set(v.index, s); }
    return s;
  };
  /** The OCCT edge of an XT edge and whether its natural direction runs against the XT edge's. */
  const edgeOf = (en, fin) => {
    const key = en.index;
    if (edgeShapes.has(key)) return edgeShapes.get(key);
    const curveNode = en.curve ? nodes.get(en.curve) : fin?.curve ? nodes.get(fin.curve) : null;
    let rec = null;
    try {
      const h = curveNode ? g.curve(curveNode.index) : null;
      if (h) {
        const against = curveNode.sense === '-';
        const { start, end, p0, p1 } = edgeEnds(nodes, en);
        const c = h.get();
        const param = (p) => { const pr = new oc.GeomAPI_ProjectPointOnCurve_2(g.pnt(p), h); const t = pr.NbPoints() ? pr.LowerDistanceParameter() : c.FirstParameter(); pr.delete(); return t; };
        if (!p0 || !p1) {
          const mk = new oc.BRepBuilderAPI_MakeEdge_24(h);
          rec = mk.IsDone() ? { edge: mk.Edge(), reversed: against } : null; mk.delete();
        } else {
          // Along the curve from the XT start to end (or, against the curve, from end to start).
          let a = param(against ? p1 : p0); let b = param(against ? p0 : p1);
          if (c.IsPeriodic()) { const T = c.Period(); while (b <= a + 1e-12) b += T; if (start.index === end.index) b = a + T; }
          else if (start.index === end.index && c.IsClosed()) { a = c.FirstParameter(); b = c.LastParameter(); }
          const va = vertexOf(against ? end : start); const vb = vertexOf(against ? start : end);
          let mk = new oc.BRepBuilderAPI_MakeEdge_29(h, va, vb, a, b);
          if (!mk.IsDone()) { mk.delete(); mk = new oc.BRepBuilderAPI_MakeEdge_25(h, a, b); }
          rec = mk.IsDone() ? { edge: mk.Edge(), reversed: against } : null; mk.delete();
        }
      }
    } catch { rec = null; g.warnings.add('edge-failed'); }
    edgeShapes.set(key, rec);
    return rec;
  };
  const built = new Map(); // face node index → TopoDS_Face | null
  let failed = 0;
  const faceOf = (f) => {
    if (built.has(f.index)) return built.get(f.index);
    let face = null;
    try { face = buildFace(oc, g, f, edgeOf); } catch { face = null; }
    if (!face) failed++;
    built.set(f.index, face);
    return face;
  };
  const out = groups.map((region) => region.map((shell) => shell.map(faceOf).filter(Boolean)));
  return { regions: out, failed, solid };
}

/** One OCCT face from an XT face: its surface, its loops as wires, ShapeFix for pcurves and seams. */
function buildFace(oc, g, f, edgeOf) {
  const nodes = g.nodes;
  const surf = g.surface(f.surface);
  // Orientation: the face's normal is the XT surface's natural one × surface sense × face sense.
  const sameAsOcct = (surf?.sign ?? 1) * (nodes.get(f.surface)?.sense === '-' ? -1 : 1) * (f.sense === '-' ? -1 : 1) > 0;
  const wires = [];
  for (let l = f.loop, gl = 0; l && gl < 1e5; gl++) {
    const loop = nodes.get(l); if (!loop) break;
    const builder = new oc.BRep_Builder(); const wire = new oc.TopoDS_Wire(); builder.MakeWire(wire);
    let n = 0;
    for (let h = loop.halfedge, first = loop.halfedge, gf = 0; h && gf < 1e5; gf++) {
      const fin = nodes.get(h); if (!fin) break;
      const en = nodes.get(fin.edge);
      const rec = en ? edgeOf(en, fin) : null;
      if (rec) {
        // XT direction of the edge, then the fin's, then flipped if the face is built against the OCCT normal.
        let along = !rec.reversed; if (fin.sense === '-') along = !along; if (!sameAsOcct) along = !along;
        builder.Add(wire, along ? rec.edge : rec.edge.Reversed()); n++;
      }
      h = fin.forward; if (h === first) break;
    }
    builder.delete();
    if (n) wires.push(wire);
    l = loop.next;
  }
  let face = null;
  if (surf) {
    if (!wires.length) { const mk = new oc.BRepBuilderAPI_MakeFace_8(surf.handle, 1e-7); if (mk.IsDone()) face = mk.Face(); mk.delete(); }
    else {
      const builder = new oc.BRep_Builder(); const raw = new oc.TopoDS_Face(); builder.MakeFace_2(raw, surf.handle, 1e-7);
      for (const w of wires) builder.Add(raw, w);
      const fix = new oc.ShapeFix_Face_2(raw); fix.SetPrecision(1e-7); fix.Perform();
      face = fix.Face(); fix.delete(); builder.delete();
    }
  } else if (wires.length) {
    // A surface this reader does not know (rolling-ball blend, foreign geometry): a filling across the boundary.
    const fill = new oc.BRepOffsetAPI_MakeFilling(3, 15, 2, false, 1e-5, 1e-4, 1e-2, 0.1, 8, 9);
    for (const ex = new oc.TopExp_Explorer_2(wires[0], oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); ex.More(); ex.Next()) fill.Add_1(oc.TopoDS.Edge_1(ex.Current()), oc.GeomAbs_Shape.GeomAbs_C0, true);
    fill.Build(new oc.Message_ProgressRange_1());
    if (fill.IsDone()) face = oc.TopoDS.Face_1(fill.Shape());
    g.warnings.add('filled-face');
  }
  if (!face || face.IsNull()) return null;
  return sameAsOcct ? face : oc.TopoDS.Face_1(face.Reversed());
}

/** Faces sewn into shells (BRepBuilderAPI_Sewing, 1e-3 mm); returns the TopoDS_Shell list. */
function sewShells(oc, faces) {
  const sew = new oc.BRepBuilderAPI_Sewing(1e-3, true, true, true, false);
  try {
    for (const f of faces) sew.Add(f);
    sew.Perform(new oc.Message_ProgressRange_1());
    const out = [];
    const sewn = sew.SewedShape();
    for (const ex = new oc.TopExp_Explorer_2(sewn, oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); ex.More(); ex.Next()) out.push(oc.TopoDS.Shell_1(ex.Current()));
    if (!out.length && sewn.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_FACE) {
      const b = new oc.BRep_Builder(); const sh = new oc.TopoDS_Shell(); b.MakeShell(sh); b.Add(sh, sewn); out.push(sh); b.delete();
    }
    return out;
  } finally { sew.delete(); }
}

/** A solid of a solid region: its shells (outer boundary and cavities) in one solid, oriented by ShapeFix. */
function regionSolid(oc, shellFaces) {
  const shells = shellFaces.flatMap((faces) => sewShells(oc, faces));
  if (!shells.length || !shells.every((s) => oc.BRep_Tool.IsClosed_1(s))) return null;
  const b = new oc.BRep_Builder(); const solid = new oc.TopoDS_Solid(); b.MakeSolid(solid);
  for (const s of shells) b.Add(solid, s);
  b.delete();
  const fix = new oc.ShapeFix_Solid_1();
  try { fix.Init(solid); fix.Perform(new oc.Message_ProgressRange_1()); return fix.Solid(); } finally { fix.delete(); }
}

/** A gp_Trsf (millimetres) from an XT placement. */
function trsfOf(oc, t) {
  const tr = new oc.gp_Trsf_1();
  const R = t.R; const T = t.T;
  tr.SetValues(R[0], R[1], R[2], T[0] * MM, R[3], R[4], R[5], T[1] * MM, R[6], R[7], R[8], T[2] * MM);
  return tr;
}

/**
 * Read XT (text or neutral binary) into a shape: { brep, solids, faces, failed, warnings }. Throws
 * { code: 'xt-read' | 'xt-schema' | 'xt-empty' }.
 */
export async function xtToBrep(data) {
  const x = readXt(data);
  const oc = await loadFullKernel();
  const g = new Geometry(oc, x.nodes);
  const bodies = bodiesOf(x);
  if (!bodies.length) throw xtError('the file holds no body', 'xt-empty');
  const builder = new oc.BRep_Builder(); const all = new oc.TopoDS_Compound(); builder.MakeCompound(all);
  let faces = 0; let failed = 0;
  for (const { body, trsf } of bodies) {
    const r = bodyFaces(oc, g, body);
    failed += r.failed;
    const allFaces = r.regions.flat(2);
    faces += allFaces.length;
    if (!allFaces.length) continue;
    const piece = new oc.TopoDS_Compound(); builder.MakeCompound(piece);
    // A solid body: each solid region one solid with its cavities; what does not close is sewn as it is.
    const loose = [];
    for (const region of r.regions) {
      const solid = r.solid ? (() => { try { return regionSolid(oc, region); } catch { return null; } })() : null;
      if (solid && !solid.IsNull()) builder.Add(piece, solid); else loose.push(...region.flat());
    }
    if (loose.length) {
      const c = new oc.TopoDS_Compound(); builder.MakeCompound(c);
      for (const f of loose) builder.Add(c, f);
      builder.Add(piece, sewSolids(oc, c));
    }
    let shape = piece;
    if (trsf) { const mk = new oc.BRepBuilderAPI_Transform_2(shape, trsfOf(oc, trsf), true); shape = mk.Shape(); }
    builder.Add(all, shape);
  }
  if (!faces) throw xtError('no face of the file could be built', 'xt-empty');
  const solids = count(oc, all, oc.TopAbs_ShapeEnum.TopAbs_SOLID);
  const brep = brepOfShape(oc, all);
  builder.delete();
  return { brep, solids, faces, failed, warnings: [...g.warnings], schema: x.schema.key, bodies: bodies.length };
}

/** For the unit tests: the reader's pieces. */
export const __xtInternals = { Geometry, bodyFaces, buildFace, sewShells, regionSolid };
