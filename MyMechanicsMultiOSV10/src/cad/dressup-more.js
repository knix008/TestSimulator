// Fillet, chamfer and shell options beyond one size on picked edges / faces:
//   fillet   items: edges, faces (all their edges), features (the edges of their faces); tangent propagation;
//            multiple radii (a radius per edge); chord width instead of radius; profile circular, conic (rho) or
//            curvature continuous (G2, a quintic Bézier) — the last two for straight edges between planar faces
//            and circular edges between a plane and a coaxial cylinder / plane, built exactly as a swept or
//            revolved cross-section
//   chamfer  distance (equal), distance-distance, angle-distance (each with Flip direction), offset face (planar
//            faces), vertex (three distances along the edges of a corner)
//   shell    inward or outward, a different thickness on chosen planar faces, or no face removed (a hollow body)
import { rep } from './kernel.js';
import { findEdges, findFace, faceSignature, edgeSignature, normalize, crossV } from './refs.js';
import { codeError, sizeAround } from './features.js';
import { planeFace } from './extrude-more.js';

export const FILLET_PROFILES = ['circular', 'conic', 'curvature'];
export const CHAMFER_KINDS = ['distance', 'distDist', 'angleDist', 'offsetFace', 'vertex', 'faceFace'];

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const vec = (p) => (Array.isArray(p) ? p : p.toTuple ? p.toTuple() : [p.x, p.y, p.z]);
const distance = (a, b) => { try { return rep().measureDistanceBetween(a, b); } catch { return Infinity; } };
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const volume = (s) => { try { return Math.abs(rep().measureVolume(s)); } catch { return 0; } };

/** True when a fillet / chamfer / shell needs this module. */
export function needsDressUpMore(f, kind) {
  if (kind === 'fillet') return Boolean(f.radii?.length || f.mode === 'chord' || (f.profile && f.profile !== 'circular') || f.faceItems?.length || f.featureItems?.length || f.propagate === false || f.propagate === true);
  if (kind === 'chamfer') return Boolean(f.kind && f.kind !== 'distance') || Boolean(f.faceItems?.length);
  if (kind === 'shell') return Boolean(f.outward || f.multi?.length || !(f.faces ?? []).length);
  return false;
}

// ───────────────────────── geometry of an edge

/** The faces of `body` that hold `edge`. */
function facesOfEdge(body, edge) {
  return body.faces.filter((fc) => fc.edges.some((e) => e.isSame(edge)));
}

/** A point of the edge at parameter t (0 … 1) and its unit tangent there. */
function edgeFrame(edge, t = 0.5) {
  const p = vec(edge.pointAt(t));
  const d = normalize(vec(edge.tangentAt(t)));
  return { p, d };
}

/** Is the point inside the solid (a tiny cube there shares volume with it)? */
function inside(body, p, h = 1e-3) {
  const R = rep();
  try { return volume(body.clone().intersect(R.makeBox(sub(p, [h, h, h]), add(p, [h, h, h])))) > 0.5 * (2 * h) ** 3; } catch { return false; }
}

/**
 * The cross-section of an edge between two faces at a point: the unit directions along each face away from the
 * edge (u1, u2, in the faces, square to the edge) and whether the edge is convex (material between u1 and u2
 * is inside the angle smaller than 180°).
 */
function section(body, edge, t = 0.5) {
  const faces = facesOfEdge(body, edge);
  if (faces.length !== 2) throw codeError('edge-not-between-faces');
  const { p, d } = edgeFrame(edge, t);
  const dirs = faces.map((fc) => {
    const n = normalize(vec(fc.normalAt(p)));
    let u = normalize(cross(d, n));
    // u must point into the face: a point a little along u lies on the face (distance ~0).
    const probe = add(p, mul(u, 1e-3));
    try { if (rep().measureDistanceBetween(fc, rep().makeVertex(probe)) > 1e-5) u = mul(u, -1); } catch { /* keep */ }
    return { face: fc, n, u };
  });
  // Convex or concave, judged in the middle of the edge (its ends may sit on other faces).
  const convex = t === 0.5 ? inside(body, add(p, mul(normalize(add(dirs[0].u, dirs[1].u)), 1e-2)), 1e-3) : section(body, edge, 0.5).convex;
  const cosA = Math.max(-1, Math.min(1, dot(dirs[0].u, dirs[1].u)));
  return { p, d, faces: dirs, alpha: Math.acos(cosA), convex };
}

// ───────────────────────── fillet

/** Edges that continue `edges` with the same tangent through a shared vertex (tangent propagation). */
function propagate(body, edges) {
  const out = [...edges];
  const all = body.edges;
  const ends = (e) => [[vec(e.startPoint), normalize(vec(e.tangentAt(0)))], [vec(e.endPoint), normalize(vec(e.tangentAt(1)))]];
  for (let k = 0; k < out.length; k++) {
    for (const [p, t] of ends(out[k])) {
      for (const e of all) {
        if (out.some((x) => x.isSame(e))) continue;
        for (const [q, s] of ends(e)) if (len(sub(p, q)) < 1e-6 && Math.abs(Math.abs(dot(t, s)) - 1) < 1e-6) { out.push(e); break; }
      }
    }
  }
  return out;
}

/** The edges a fillet / chamfer works on: picked edges, all edges of picked faces and of picked features' faces. */
export function itemEdges(f, ctx) {
  const body = ctx.body;
  let edges = findEdges(body, f.edges ?? []);
  for (const sig of f.faceItems ?? []) { const fc = findFace(body, sig); if (fc) for (const e of fc.edges) if (!edges.some((x) => x.isSame(e))) edges.push(e); }
  for (const id of f.featureItems ?? []) {
    const tool = ctx.results.get(id)?.tool;
    if (!tool) continue;
    for (const fc of body.faces) {
      let on = false;
      try { on = rep().measureDistanceBetween(tool, fc) < 1e-6 && tool.faces.some((tf) => faceSignature(tf).type === faceSignature(fc).type && len(sub(vec(tf.center), vec(fc.center))) < 1e-4); } catch { on = false; }
      if (on) for (const e of fc.edges) if (!edges.some((x) => x.isSame(e))) edges.push(e);
    }
  }
  if (f.propagate !== false) edges = propagate(body, edges);
  return edges;
}

/** The radius of an edge: its own (multiple radii) or the feature's; chord width turned into the radius there. */
function radiusOf(f, body, edge) {
  const own = (f.radii ?? []).find((x) => { const m = findEdges(body, [x.sig])[0]; return m && m.isSame(edge); });
  const size = num(own ? own.r : f.radius, 2);
  if (f.mode !== 'chord') return size;
  // Chord width w between the tangent lines: w = 2 r cos(α / 2), α the angle between the faces.
  const s = section(body, edge);
  return size / (2 * Math.cos(s.alpha / 2));
}

/** A 2D point list of a quadratic rational (conic) or a quintic (G2) blend from a to b with corner c. */
function blendPoles(a, c, b, profile, rho) {
  if (profile === 'conic') { const r = Math.max(0.01, Math.min(0.99, rho)); return { poles: [a, c, b], weights: [1, r / (1 - r), 1] }; }
  // Curvature continuous: three poles on each tangent line (zero curvature where it meets the flat faces).
  const along = (p, q, k) => add(p, mul(sub(q, p), k));
  return { poles: [a, along(a, c, 0.4), along(a, c, 0.75), along(b, c, 0.75), along(b, c, 0.4), b], weights: [1, 1, 1, 1, 1, 1] };
}

/** A 3D Bézier edge (rational when the weights differ). */
function bezierEdge(poles, weights) {
  const R = rep(); const oc = R.getOC();
  const n = poles.length;
  const arr = new oc.NCollection_Array1_gp_Pnt(1, n); const w = new oc.NCollection_Array1_double(1, n);
  poles.forEach((p, i) => { arr.SetValue(i + 1, new oc.gp_Pnt(p[0], p[1], p[2])); w.SetValue(i + 1, weights[i]); });
  const curve = weights.some((x) => Math.abs(x - 1) > 1e-12) ? new oc.Geom_BezierCurve(arr, w) : new oc.Geom_BezierCurve(arr);
  const mk = new oc.BRepBuilderAPI_MakeEdge(curve);
  const edge = new R.Edge(mk.Edge());
  mk.delete();
  return edge;
}

/**
 * The corner piece between the edge and a conic / G2 blend at one cross-section (a planar face square to the edge):
 * the material a convex fillet removes, or a concave one adds.
 */
function cornerFace(s, r, profile, rho) {
  const R = rep();
  const [f1, f2] = s.faces;
  // The tangent points of the circular fillet of radius r (the same setback for the other profiles).
  const back = r / Math.tan(s.alpha / 2);
  const a = add(s.p, mul(f1.u, back)); const b = add(s.p, mul(f2.u, back));
  const { poles, weights } = blendPoles(a, s.p, b, profile, rho);
  const curve = bezierEdge(poles, weights);
  return R.makeFace(R.assembleWire([R.makeLine(b, s.p), R.makeLine(s.p, a), curve]));
}

/** The centre of the circle through three points. */
function circumcentre(a, b, c) {
  const ab = sub(b, a); const ac = sub(c, a);
  const n = cross(ab, ac);
  const k = 2 * dot(n, n);
  const t = add(mul(cross(n, ab), dot(ac, ac)), mul(cross(ac, n), dot(ab, ab)));
  return add(a, mul(t, 1 / k));
}

/** The cross-section tool of a conic / curvature-continuous fillet on one edge: swept along a straight edge between planes, revolved about a circular one. */
function profileFillet(body, edge, r, profile, rho) {
  const R = rep();
  const faces = facesOfEdge(body, edge);
  const kinds = faces.map((fc) => fc.geomType);
  if (edge.geomType === 'LINE' && kinds.every((k) => k === 'PLANE')) {
    const s = section(body, edge, 0);
    const corner = cornerFace(s, r, profile, rho);
    const L = len(sub(vec(edge.endPoint), vec(edge.startPoint)));
    const dir = normalize(sub(vec(edge.endPoint), vec(edge.startPoint)));
    const tool = R.basicFaceExtrusion(corner, new R.Vector(mul(dir, L)));
    return { tool, convex: s.convex, key: null };
  }
  if (edge.geomType === 'CIRCLE' && kinds.every((k) => k === 'PLANE' || /CYL/.test(k))) {
    const s = section(body, edge, 0);
    const corner = cornerFace(s, r, profile, rho);
    // The circle's axis: its centre and the normal of its plane.
    const c = vec(edge.pointAt(0)); const q = vec(edge.pointAt(0.25)); const w = vec(edge.pointAt(0.5));
    const centre = circumcentre(c, q, w);
    const axis = normalize(cross(sub(q, c), sub(w, c)));
    const tool = R.revolution(corner, centre, axis, 360);
    const key = [...centre, ...axis.map(Math.abs)].map((x) => Math.round(x * 1e4)).join(',') + ':' + Math.round(len(sub(c, centre)) * 1e4);
    return { tool, convex: s.convex, key };
  }
  throw codeError('profile-unsupported');
}

/** The fillet with the options above. */
export function filletMore(f, ctx) {
  if (!ctx.body) throw codeError('no-body');
  const edges = itemEdges(f, ctx);
  if (!edges.length) throw codeError('no-edges');
  const profile = FILLET_PROFILES.includes(f.profile) ? f.profile : 'circular';
  if (profile === 'circular') {
    const radii = edges.map((e) => radiusOf(f, ctx.body, e));
    if (radii.some((r) => !(r > 0))) throw codeError('zero-size');
    const body = ctx.body.fillet((e) => { const i = edges.findIndex((m) => m.isSame(e)); return i >= 0 ? radii[i] : null; });
    return { body, matched: edges.length };
  }
  let body = ctx.body;
  // Every edge's cross-section tool from the body as it is (the arcs of one circle share one revolved tool),
  // then the convex ones taken away and the concave ones added.
  const seen = new Set();
  const tools = [];
  for (const edge of edges) {
    const t = profileFillet(body, edge, radiusOf(f, body, edge), profile, num(f.rho, 0.5));
    if (t.key && seen.has(t.key)) continue;
    if (t.key) seen.add(t.key);
    tools.push(t);
  }
  for (const t of tools.filter((x) => x.convex)) body = body.cut(t.tool);
  for (const t of tools.filter((x) => !x.convex)) body = body.fuse(t.tool);
  return { body, matched: edges.length };
}

// ───────────────────────── chamfer

/** Distances along face 1 and face 2 of an offset-face chamfer (offsets h1, h2 measured square to the faces). */
/** Whether a cylinder or cone face has the axis of a circular edge (through its centre, along its normal). */
function coaxial(face, edge) {
  const oc = rep().getOC();
  const ad = new oc.BRepAdaptor_Surface(face.wrapped, true);
  try {
    const ax = /CYL/.test(face.geomType) ? ad.Cylinder().Axis() : ad.Cone().Axis();
    const l = ax.Location(); const d = ax.Direction();
    const at = [l.X(), l.Y(), l.Z()]; const dir = [d.X(), d.Y(), d.Z()];
    const ce = new oc.BRepAdaptor_Curve(oc.TopoDS.Edge(edge.wrapped));
    try {
      const c = ce.Circle(); const cl = c.Location(); const cn = c.Axis().Direction();
      const centre = [cl.X(), cl.Y(), cl.Z()]; const n = [cn.X(), cn.Y(), cn.Z()];
      const off = sub(centre, at); const along = dot(off, dir);
      return Math.abs(Math.abs(dot(n, dir)) - 1) < 1e-9 && len(sub(off, mul(dir, along))) < 1e-7;
    } finally { ce.delete?.(); }
  } catch { return false; } finally { ad.delete?.(); }
}

function offsetFaceDistances(s, h1, h2) {
  // Q = p + a u1 + b u2 with its distance to face 1 = h1, to face 2 = h2; distances along the faces are Q's
  // projections onto u1 and u2 (u1 ⟂ n1, u2 ⟂ n2).
  const [f1, f2] = s.faces;
  const dist1 = (v) => Math.abs(dot(v, f1.n)); const dist2 = (v) => Math.abs(dot(v, f2.n));
  // a u1 + b u2: distance to face 1 comes from b u2 only, to face 2 from a u1 only.
  const b = h1 / Math.max(1e-12, dist1(f2.u));
  const a = h2 / Math.max(1e-12, dist2(f1.u));
  const Q = add(mul(f1.u, a), mul(f2.u, b));
  return [dot(Q, f1.u), dot(Q, f2.u)];
}

/**
 * Face-face chamfer: between two planar faces (next to each other or not — faces between them are taken away):
 * the chamfer plane runs through the lines on each face at distance d1 (first face) and d2 (second face) from
 * the line where their planes meet, and all material beyond it in that corner goes (exact).
 */
function faceFaceChamfer(f, ctx) {
  const R = rep();
  const A = f.faceA ? findFace(ctx.body, f.faceA) : null; const B = f.faceB ? findFace(ctx.body, f.faceB) : null;
  if (!A || !B) throw codeError('face-missing');
  if (A.geomType !== 'PLANE' || B.geomType !== 'PLANE') throw codeError('profile-unsupported');
  let d1 = num(f.distance, 1); let d2 = num(f.distance2, d1);
  if (!(d1 > 0) || !(d2 > 0)) throw codeError('zero-size');
  if (f.flip) [d1, d2] = [d2, d1];
  const ca = vec(A.center); const cb = vec(B.center);
  const na = normalize(vec(A.normalAt(ca))); const nb = normalize(vec(B.normalAt(cb)));
  const u = crossV(na, nb);
  if (len(u) < 1e-6) throw codeError('profile-unsupported');
  const ud = normalize(u);
  // A point on the line where the planes meet: solve na·x = na·ca, nb·x = nb·cb, ud·x = ud·ca.
  const M = [na, nb, ud]; const rhs = [dot(na, ca), dot(nb, cb), dot(ud, ca)];
  const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det3(M);
  const L0 = [0, 1, 2].map((k) => det3(M.map((row, i) => row.map((v, j) => (j === k ? rhs[i] : v)))) / D);
  // Into each face from the line (toward its centre, across the line).
  const across = (c) => { const w = sub(c, L0); return normalize(sub(w, mul(ud, dot(w, ud)))); };
  const pa = add(L0, mul(across(ca), d1)); const pb = add(L0, mul(across(cb), d2));
  let nc = normalize(crossV(sub(pb, pa), ud));
  if (dot(nc, add(na, nb)) < 0) nc = mul(nc, -1);
  const size = sizeAround(ctx) * 4 + 10;
  const half = (o, n) => R.basicFaceExtrusion(planeFace(o, n, size), new R.Vector(mul(normalize(n), size)));
  // The corner beyond the chamfer plane, inside both faces' planes.
  const tool = half(pa, nc).intersect(half(ca, mul(na, -1))).intersect(half(cb, mul(nb, -1)));
  const before = R.measureVolume(ctx.body);
  const body = ctx.body.cut(tool);
  if (!(before - R.measureVolume(body) > 1e-9)) throw codeError('chamfer-nothing');
  return { body, matched: 1 };
}

/** The chamfer with the options above. */
export function chamferMore(f, ctx) {
  const R = rep(); const oc = R.getOC();
  if (!ctx.body) throw codeError('no-body');
  const kind = CHAMFER_KINDS.includes(f.kind) ? f.kind : 'distance';
  if (kind === 'vertex') return vertexChamfer(f, ctx);
  if (kind === 'faceFace') return faceFaceChamfer(f, ctx);
  const edges = itemEdges({ ...f, propagate: f.propagate }, ctx);
  if (!edges.length) throw codeError('no-edges');
  const d1 = num(f.distance, 1); const d2 = num(f.distance2, d1); const ang = num(f.angle, 45);
  if (!(d1 > 0) || !(d2 > 0)) throw codeError('zero-size');
  const mk = new oc.BRepFilletAPI_MakeChamfer(ctx.body.wrapped);
  const varying = [];
  let added = 0;
  try {
    for (const edge of edges) {
      const faces = facesOfEdge(ctx.body, edge);
      if (faces.length !== 2) throw codeError('edge-not-between-faces');
      const face = (f.flip ? faces[1] : faces[0]).wrapped;
      const E = oc.TopoDS.Edge(edge.wrapped); const F = oc.TopoDS.Face(face);
      if (kind === 'distance') mk.Add(d1, E);
      else if (kind === 'distDist') mk.Add(d1, d2, E, F);
      else if (kind === 'angleDist') mk.AddDA(d1, (ang * Math.PI) / 180, E, F);
      else if (kind === 'offsetFace') {
        const s = section(ctx.body, edge);
        // Exact where the cross-section is the same all along the edge: straight edges between planes, and circular
        // edges between a plane and a coaxial cylinder or cone (their sections through the axis are straight lines).
        // Elsewhere the distances along the faces change along the edge: that edge is chamfered on its own
        // (variableOffsetChamfer) after the others.
        if (!s.faces.every((x) => x.face.geomType === 'PLANE' || (edge.geomType === 'CIRCLE' && /CYL|CONE/.test(x.face.geomType) && coaxial(x.face, edge)))) { varying.push(edge); continue; }
        const first = f.flip ? 1 : 0;
        const [s1, s2] = offsetFaceDistances(s, first ? d2 : d1, first ? d1 : d2);
        const Fs = oc.TopoDS.Face(s.faces[0].face.wrapped);
        mk.Add(s1, s2, E, Fs);
      }
      added++;
    }
    let body = ctx.body;
    if (added > 0) {
      mk.Build(new oc.Message_ProgressRange());
      if (!mk.IsDone()) throw codeError('kernel');
      body = R.cast(mk.Shape());
    }
    for (const edge of varying) body = variableOffsetChamfer(body, ctx.body, edge, f.flip ? num(f.distance2, d1) : d1, f.flip ? d1 : num(f.distance2, d1));
    return { body, matched: edges.length };
  } finally { mk.delete(); }
}

/**
 * Offset-face chamfer on an edge whose cross-section changes along it (curved faces met at an angle that varies):
 * at points along the edge, the point Q at distance h1 from face 1 and h2 from face 2 (inside the corner, in the
 * plane square to the edge) is found on the faces themselves (Newton on the true distances), its feet on the two
 * faces are the chamfer's edges there, and the triangles (feet, a point well outside the corner) are lofted into
 * the tool that cuts the corner off. `orig`: the body the edge and its faces belong to.
 */
function variableOffsetChamfer(body, orig, edge, h1, h2) {
  const R = rep(); const oc = R.getOC();
  const faces = facesOfEdge(orig, edge);
  if (faces.length !== 2) throw codeError('edge-not-between-faces');
  const closest = (face, q) => {
    const v = R.makeVertex(q);
    const ex = new oc.BRepExtrema_DistShapeShape(v.wrapped, face.wrapped);
    try { const p = ex.PointOnShape2(1); return { d: ex.Value(), p: [p.X(), p.Y(), p.Z()] }; } finally { ex.delete(); }
  };
  const closed = len(sub(vec(edge.startPoint), vec(edge.endPoint))) < 1e-7;
  const n = 32;
  const sections = [];
  let convex = true;
  for (let i = 0; i <= (closed ? n - 1 : n); i++) {
    // A closed edge: sampled between its seam points (its vertex, often on a face's seam, troubles the booleans).
    const t = closed ? (i + 0.5) / n : i / n;
    const s = section(orig, edge, t);
    const [f1, f2] = s.faces;
    // Start from the flat answer (the faces' tangent planes), then correct on the real faces.
    let a = h2 / Math.max(1e-12, Math.abs(dot(f1.u, f2.n)));
    let b = h1 / Math.max(1e-12, Math.abs(dot(f2.u, f1.n)));
    const Q = (x, y) => add(s.p, add(mul(f1.u, x), mul(f2.u, y)));
    const F = (x, y) => { const q = Q(x, y); return [closest(f1.face, q).d - h1, closest(f2.face, q).d - h2]; };
    for (let it = 0; it < 12; it++) {
      const r = F(a, b);
      if (Math.abs(r[0]) < 1e-9 && Math.abs(r[1]) < 1e-9) break;
      const e = 1e-6 * Math.max(1, Math.abs(a) + Math.abs(b));
      const ra = F(a + e, b); const rb = F(a, b + e);
      const J = [[(ra[0] - r[0]) / e, (rb[0] - r[0]) / e], [(ra[1] - r[1]) / e, (rb[1] - r[1]) / e]];
      const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
      if (Math.abs(det) < 1e-14) break;
      a -= (J[1][1] * r[0] - J[0][1] * r[1]) / det; b -= (-J[1][0] * r[0] + J[0][0] * r[1]) / det;
    }
    const q = Q(a, b);
    const p1 = closest(f1.face, q).p; const p2 = closest(f2.face, q).p;
    // Convex: a point well outside the corner (the tool cuts the corner off); concave: the edge itself (the tool is
    // the material the chamfer adds).
    // (A few chamfer sizes out: far enough to hold the corner, near enough that the tool never crosses itself.)
    const reach = 4 * Math.max(len(sub(p1, s.p)), len(sub(p2, s.p)), 1e-3);
    const out = s.convex ? add(s.p, mul(normalize(add(f1.n, f2.n)), reach)) : s.p;
    sections.push([p1, p2, out]);
    convex = s.convex;
  }
  const tri = ([p1, p2, out]) => R.assembleWire([R.makeLine(p1, p2), R.makeLine(p2, out), R.makeLine(out, p1)]);
  const loft = (list) => {
    const mk = new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6);
    for (const sec of list) mk.AddWire(tri(sec).wrapped);
    mk.Build(new oc.Message_ProgressRange());
    if (!mk.IsDone()) { mk.delete(); throw codeError('kernel'); }
    let t = R.cast(mk.Shape()); mk.delete();
    if (R.measureVolume(t) < 0) t = R.cast(t.wrapped.Reversed());
    return t;
  };
  // The tool in eight lofted pieces (a closed edge: round to its first section again), applied one after another:
  // one loft round a whole closed edge, or over half of it, is not taken reliably by the kernel's booleans.
  const list = closed ? [...sections, sections[0]] : sections;
  const parts = 8; const step = (list.length - 1) / parts;
  let out = body;
  for (let i = 0; i < parts; i++) {
    const piece = loft(list.slice(Math.round(i * step), Math.round((i + 1) * step) + 1));
    out = convex ? out.cut(piece) : out.fuse(piece);
  }
  return out;
}

/** A vertex chamfer: the corner cut off by the plane through the points d1, d2, d3 along its three edges. */
function vertexChamfer(f, ctx) {
  const R = rep();
  const body = ctx.body;
  const v = f.vertex;
  if (!Array.isArray(v)) throw codeError('no-vertex');
  const at = body.edges.filter((e) => [e.startPoint, e.endPoint].some((p) => len(sub(vec(p), v)) < 1e-6));
  if (at.length !== 3) throw codeError('vertex-not-corner');
  const ds = [num(f.distance, 1), num(f.distance2, num(f.distance, 1)), num(f.distance3, num(f.distance, 1))];
  const pts = at.map((e, i) => {
    const s = vec(e.startPoint); const t = len(sub(s, v)) < 1e-6;
    const L = e.length ?? len(sub(vec(e.endPoint), s));
    const u = Math.min(0.999, ds[i] / L);
    return vec(e.pointAt(t ? u : 1 - u));
  });
  // The tetrahedron (the vertex and the three points), sewn from its four triangles.
  const tri = (p, q, r) => R.makeFace(R.assembleWire([R.makeLine(p, q), R.makeLine(q, r), R.makeLine(r, p)]));
  const oc = R.getOC();
  const sew = new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false);
  for (const fc of [tri(pts[0], pts[1], pts[2]), tri(v, pts[0], pts[1]), tri(v, pts[1], pts[2]), tri(v, pts[2], pts[0])]) sew.Add(fc.wrapped);
  sew.Perform(new oc.Message_ProgressRange());
  let tet = R.makeSolid([R.cast(sew.SewedShape())]);
  sew.delete();
  if (rep().measureVolume(tet) < 0) tet = R.cast(tet.wrapped.Reversed());
  return { body: body.cut(tet), matched: 3 };
}

// ───────────────────────── shell

/**
 * Multi-thickness on a curved face: its inner wall in the shelled body (the face of it at the shell thickness
 * from the original face) thickened into the hollow (a thicker wall) or into the wall (a thinner one) by the
 * difference — the kernel's offset of that one face, exact for cylinders, cones, spheres and tori.
 */
function curvedWall(body, original, face, t, ti) {
  const R = rep(); const oc = R.getOC();
  const tol = 1e-5 * Math.max(1, t);
  const fresh = body.faces.filter((fc) => !original.faces.some((o) => o.isSame(fc)) && fc.geomType === face.geomType);
  const c = vec(face.center); const n = normalize(vec(face.normalAt(c)));
  const target = sub(c, mul(n, t));
  // Every face of the inner wall (a full turn may come as several faces).
  const near = fresh.filter((fc) => Math.abs(distance(fc, face) - t) < tol);
  if (!near.length) throw codeError('face-missing');
  void target;
  let out = body;
  for (const inner of near) {
    const mk = new oc.BRepOffsetAPI_MakeThickSolid();
    // The inner wall's normal points out of the material (into the hollow): + grows the wall, − eats into it.
    mk.MakeThickSolidBySimple(inner.wrapped, ti - t);
    mk.Build(new oc.Message_ProgressRange());
    if (!mk.IsDone()) { mk.delete(); throw codeError('kernel'); }
    let slab = R.cast(mk.Shape()); mk.delete();
    try { if (R.measureVolume(slab) < 0) slab = R.cast(slab.wrapped.Reversed()); } catch { /* keep */ }
    out = ti > t ? out.fuse(slab) : out.cut(slab);
  }
  return out;
}

/** The shell with the options above. */
export function shellMore(f, ctx) {
  const R = rep(); const oc = R.getOC();
  if (!ctx.body) throw codeError('no-body');
  const t = num(f.thickness, 1.5);
  if (!(t > 0)) throw codeError('zero-size');
  const removed = (f.faces ?? []).map((sig) => findFace(ctx.body, sig)).filter(Boolean);
  // The kernel offset grows the body for a positive value; replicad's shell() takes the inward thickness.
  const offset = f.outward ? t : -t;
  let body;
  if (!removed.length) {
    // No face removed: a hollow body (the inside offset by the thickness taken out), or a skin outside it.
    const mk = new oc.BRepOffsetAPI_MakeOffsetShape();
    mk.PerformByJoin(ctx.body.wrapped, offset, 1e-6, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, oc.GeomAbs_JoinType.GeomAbs_Intersection, false, new oc.Message_ProgressRange());
    if (!mk.IsDone()) { mk.delete(); throw codeError('kernel'); }
    let other = R.cast(mk.Shape());
    mk.delete();
    if (other.wrapped.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_SHELL) other = R.makeSolid([other]);
    body = f.outward ? other.cut(ctx.body.clone()) : ctx.body.clone().cut(other);
  } else {
    // The kernel's thick solid with intersection joins: the walls meet in sharp edges, inward or outward.
    const list = new oc.NCollection_List_TopoDS_Shape();
    for (const fc of removed) list.Append(fc.wrapped);
    const mk = new oc.BRepOffsetAPI_MakeThickSolid();
    mk.MakeThickSolidByJoin(ctx.body.wrapped, list, offset, 1e-6, oc.BRepOffset_Mode.BRepOffset_Skin, true, false, oc.GeomAbs_JoinType.GeomAbs_Intersection, false, new oc.Message_ProgressRange());
    if (!mk.IsDone()) { mk.delete(); throw codeError('kernel'); }
    body = R.cast(mk.Shape());
    mk.delete();
    if (rep().measureVolume(body) < 0) body = R.cast(body.wrapped.Reversed());
  }
  if (volume(body) < 1e-9) throw codeError('kernel');
  // Multi-thickness: planar faces with their own wall (inward shells): the inner wall moved to that thickness.
  for (const item of f.multi ?? []) {
    if (f.outward) throw codeError('multi-outward');
    const face = findFace(ctx.body, item.sig);
    if (!face) throw codeError('face-missing');
    const ti = num(item.t, t);
    if (!(ti > 0) || Math.abs(ti - t) < 1e-9) continue;
    if (face.geomType !== 'PLANE') { body = curvedWall(body, ctx.body, face, t, ti); continue; }
    const p = vec(face.center);
    const out = normalize(vec(face.normalAt(p)));
    // The inner wall of that face lies at depth t: find it in the shelled body (parallel, facing inward).
    const inner = body.faces.find((fc) => fc.geomType === 'PLANE' && Math.abs(dot(normalize(vec(fc.normalAt(vec(fc.center)))), out) + 1) < 1e-6 && Math.abs(dot(sub(vec(fc.center), p), out) + t) < 1e-6);
    if (!inner) throw codeError('face-missing');
    const slab = R.basicFaceExtrusion(inner.clone(), new R.Vector(mul(out, -(ti - t))));
    body = ti > t ? body.fuse(slab) : body.cut(R.basicFaceExtrusion(inner.clone(), new R.Vector(mul(out, t - ti))));
  }
  return { body };
}
