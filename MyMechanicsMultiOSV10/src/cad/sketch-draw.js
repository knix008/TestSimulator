// More ways to draw and edit sketch geometry (no DOM, no kernel): tangent arc from the end of a curve, 3-point
// corner / centre rectangles, parallelogram, perimeter (3-point) circle, split entities at a point, stretch
// entities (the relations are kept, so what is joined to them stretches), and Fully Define Sketch (relations
// and dimensions added until nothing can move). Every tool adds the relations the shape needs.
import {
  addArc, addCircle, addConstraint, addLine, addRelation, analyse, arcGeometry, autoRelationsForLine, byId, curveEnds, curvePieces, dimensionFor,
  endTangent, newSketchId, pointsOf, polyline, solveSketch, splineBeziers, bezierAt, ORIGIN,
} from './sketch.js';
import { ellipseParam, ellipsePoint, pieceAt, equationFunction } from './sketch-curves.js';

const pt = (sketch, x, y, extra = {}) => { const p = { id: newSketchId('p'), type: 'point', x, y, ...extra }; sketch.entities.push(p); return p; };
const P = (sketch, id) => { const p = byId(sketch, id); return [p.x, p.y]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (d) => Math.hypot(d[0], d[1]);
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const lineOf = (sketch, a, b) => { const l = { id: newSketchId('l'), type: 'line', p1: a, p2: b }; sketch.entities.push(l); return l; };

// ───────────────────────── tangent arc

/** The open curves that end at point `id` (the curve a tangent arc would continue). */
export function curvesEndingAt(sketch, id) {
  return sketch.entities.filter((e) => !e.construction && curveEnds(e)?.includes(id));
}

/** The direction a curve leaves through its end `id` (pointing away from the curve). */
export function outwardTangent(sketch, curve, id) {
  const map = new Map(sketch.entities.map((e) => [e.id, e]));
  const d = endTangent(curve, id, (k) => P(sketch, k), map);
  const pts = polyline(sketch, curve, map, 64);
  const at = P(sketch, id);
  const near = len(sub(pts[0], at)) < len(sub(pts.at(-1), at)) ? [pts[0], pts[1]] : [pts.at(-1), pts.at(-2)];
  const away = sub(near[0], near[1]);
  const l = len(d) || 1;
  return dot(d, away) >= 0 ? [d[0] / l, d[1] / l] : [-d[0] / l, -d[1] / l];
}

/**
 * A tangent arc from the end point `from` of a curve to (x, y) (or the existing point `to`): it leaves the end
 * along the curve's own direction, and a tangent relation holds it so. A straight continuation gives a line.
 * Returns { entity, straight } or null when no curve ends at `from`.
 */
export function addTangentArc(sketch, from, [x, y], { to = null, curve = null } = {}) {
  const base = curve ? byId(sketch, curve) : curvesEndingAt(sketch, from)[0];
  if (!base) return null;
  const T = outwardTangent(sketch, base, from);
  const A = P(sketch, from); const B = to ? P(sketch, to) : [x, y];
  const n = [-T[1], T[0]];
  const ab = sub(A, B);
  const den = 2 * dot(n, ab);
  if (len(ab) < 1e-9) return null;
  // Centre C = A + s·n with |C − B| = |C − A| = |s|. Almost straight on: a tangent line.
  if (Math.abs(den) < 1e-9 * len(ab) ** 2 || Math.abs(dot(ab, ab) / den) > 1e6 * len(ab)) {
    const end = to ?? pt(sketch, ...B).id;
    const line = addLine(sketch, 0, 0, 0, 0, { from, to: end });
    if (base.type === 'line') addConstraint(sketch, { type: 'collinear', a: base.id, b: line.id });
    else addRelation(sketch, 'tangent', [base.id, line.id]);
    return { entity: line, straight: true };
  }
  const s = -dot(ab, ab) / den;
  const C = [A[0] + s * n[0], A[1] + s * n[1]];
  const r = Math.abs(s);
  const ang = (p) => Math.atan2(p[1] - C[1], p[0] - C[0]);
  const end = to ?? pt(sketch, ...B).id;
  // Turning left (s > 0) the arc runs counter-clockwise from the start; turning right it runs back from the end.
  const arc = s > 0 ? addArc(sketch, C[0], C[1], r, ang(A), ang(B), { from, to: end }) : addArc(sketch, C[0], C[1], r, ang(B), ang(A), { from: end, to: from });
  addRelation(sketch, 'tangent', [base.id, arc.id]);
  return { entity: arc, straight: false };
}

// ───────────────────────── rectangles, parallelogram, perimeter circle

/**
 * A 3-point corner rectangle: the first side from a to b, the third point sets the width (its distance from that
 * side). The sides are perpendicular and parallel to each other at any angle. Returns the four lines.
 */
export function addRect3(sketch, a, b, c, { from = null, to = null } = {}) {
  const ab = sub(b, a); const L = len(ab);
  if (L < 1e-9) return null;
  const n = [-ab[1] / L, ab[0] / L];
  const w = dot(sub(c, a), n);
  if (Math.abs(w) < 1e-9) return null;
  const p0 = from ?? pt(sketch, ...a).id; const p1 = to ?? pt(sketch, ...b).id;
  const p2 = pt(sketch, b[0] + n[0] * w, b[1] + n[1] * w).id; const p3 = pt(sketch, a[0] + n[0] * w, a[1] + n[1] * w).id;
  const lines = [lineOf(sketch, p0, p1), lineOf(sketch, p1, p2), lineOf(sketch, p2, p3), lineOf(sketch, p3, p0)];
  rectRelations(sketch, lines);
  return lines;
}

/** The relations of a rectangle at any angle: horizontal / vertical when drawn so, else perpendicular + parallel. */
function rectRelations(sketch, lines) {
  autoRelationsForLine(sketch, lines[0]);
  const axis = sketch.constraints.some((k) => k.a === lines[0].id && (k.type === 'horizontal' || k.type === 'vertical'));
  if (axis) {
    const h = sketch.constraints.some((k) => k.a === lines[0].id && k.type === 'horizontal');
    addConstraint(sketch, { type: h ? 'vertical' : 'horizontal', a: lines[1].id });
    addConstraint(sketch, { type: h ? 'horizontal' : 'vertical', a: lines[2].id });
    addConstraint(sketch, { type: h ? 'vertical' : 'horizontal', a: lines[3].id });
    return;
  }
  addConstraint(sketch, { type: 'perpendicular', a: lines[0].id, b: lines[1].id });
  addConstraint(sketch, { type: 'parallel', a: lines[0].id, b: lines[2].id });
  addConstraint(sketch, { type: 'parallel', a: lines[1].id, b: lines[3].id });
}

/**
 * A 3-point centre rectangle: centre m, the middle of one side e (its direction and half length… the side through
 * e is perpendicular to m→e), the third point sets the other half size. Construction diagonals meet at the centre.
 */
export function addRect3Center(sketch, m, e, c, { center = null } = {}) {
  const u = sub(e, m); const hu = len(u);
  if (hu < 1e-9) return null;
  const du = [u[0] / hu, u[1] / hu]; const dv = [-du[1], du[0]];
  const hv = Math.abs(dot(sub(c, m), dv));
  if (hv < 1e-9) return null;
  const corner = (i, j) => [m[0] + du[0] * hu * i + dv[0] * hv * j, m[1] + du[1] * hu * i + dv[1] * hv * j];
  const q = [corner(1, -1), corner(1, 1), corner(-1, 1), corner(-1, -1)].map((p) => pt(sketch, ...p).id);
  const lines = [lineOf(sketch, q[0], q[1]), lineOf(sketch, q[1], q[2]), lineOf(sketch, q[2], q[3]), lineOf(sketch, q[3], q[0])];
  rectRelations(sketch, lines);
  const mid = center ?? pt(sketch, ...m).id;
  const d1 = addLine(sketch, 0, 0, 0, 0, { from: q[0], to: q[2], construction: true });
  const d2 = addLine(sketch, 0, 0, 0, 0, { from: q[1], to: q[3], construction: true });
  addConstraint(sketch, { type: 'midpoint', a: mid, b: d1.id });
  addConstraint(sketch, { type: 'midpoint', a: mid, b: d2.id });
  return { lines, center: mid };
}

/** A parallelogram from three corners a, b, c (the fourth is a + c − b); opposite sides parallel. */
export function addParallelogram(sketch, a, b, c, { from = null } = {}) {
  if (Math.abs(cross(sub(b, a), sub(c, b))) < 1e-9) return null;
  const d = [a[0] + c[0] - b[0], a[1] + c[1] - b[1]];
  const ids = [from ?? pt(sketch, ...a).id, pt(sketch, ...b).id, pt(sketch, ...c).id, pt(sketch, ...d).id];
  const lines = ids.map((id, i) => lineOf(sketch, id, ids[(i + 1) % 4]));
  autoRelationsForLine(sketch, lines[0]);
  addConstraint(sketch, { type: 'parallel', a: lines[0].id, b: lines[2].id });
  addConstraint(sketch, { type: 'parallel', a: lines[1].id, b: lines[3].id });
  return lines;
}

/** The circle through three points: { cx, cy, r } or null (in a line). */
export function circleThrough3(a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return null;
  const s1 = a[0] ** 2 + a[1] ** 2; const s2 = b[0] ** 2 + b[1] ** 2; const s3 = c[0] ** 2 + c[1] ** 2;
  const cx = (s1 * (b[1] - c[1]) + s2 * (c[1] - a[1]) + s3 * (a[1] - b[1])) / d;
  const cy = (s1 * (c[0] - b[0]) + s2 * (a[0] - c[0]) + s3 * (b[0] - a[0])) / d;
  return { cx, cy, r: Math.hypot(a[0] - cx, a[1] - cy) };
}

/** A perimeter circle through three points; existing points among them (`ids[i]`) are held on it. */
export function addCircle3(sketch, a, b, c, ids = []) {
  const g = circleThrough3(a, b, c);
  if (!g) return null;
  const circle = addCircle(sketch, g.cx, g.cy, g.r);
  for (const id of ids) if (id) addConstraint(sketch, { type: 'pointOnCircle', a: id, b: circle.id });
  return circle;
}

// ───────────────────────── split entities

/** The parameter of the point nearest (x, y) on a rational piece list: { index, t, point }. */
function nearestOnPieces(pieces, x, y) {
  let best = null;
  pieces.forEach((pc, index) => {
    for (let i = 0; i <= 64; i++) { const t = i / 64; const p = pieceAt(pc, t); const d = Math.hypot(p[0] - x, p[1] - y); if (!best || d < best.d) best = { index, t, d }; }
  });
  // Refine by golden-section search around the best sample.
  const pc = pieces[best.index];
  let lo = Math.max(0, best.t - 1 / 64); let hi = Math.min(1, best.t + 1 / 64);
  const f = (t) => { const p = pieceAt(pc, t); return Math.hypot(p[0] - x, p[1] - y); };
  for (let k = 0; k < 60; k++) { const m1 = lo + (hi - lo) * 0.382; const m2 = lo + (hi - lo) * 0.618; if (f(m1) < f(m2)) hi = m2; else lo = m1; }
  const t = (lo + hi) / 2;
  return { index: best.index, t, point: pieceAt(pc, t) };
}

/** A rational quadratic split at t: the two halves in standard form (end weights 1), as [p0, pc, p2, w] each. */
export function splitConic(p0, pc, p2, w, t) {
  const H = [[p0[0], p0[1], 1], [pc[0] * w, pc[1] * w, w], [p2[0], p2[1], 1]];
  const L = (a, b) => a.map((v, i) => v + (b[i] - v) * t);
  const a1 = L(H[0], H[1]); const b1 = L(H[1], H[2]); const m = L(a1, b1);
  const std = (q0, q1, q2) => {
    // Weights w0, w1, w2 → standard form w1 / √(w0 w2); the poles are the homogeneous points divided by their weights.
    const pole = (q) => [q[0] / q[2], q[1] / q[2]];
    return [pole(q0), pole(q1), pole(q2), q1[2] / Math.sqrt(q0[2] * q2[2])];
  };
  return [std(H[0], a1, m), std(m, b1, H[2])];
}

/**
 * Splits curve `id` at the point of it nearest (x, y): a line, an arc, a partial ellipse, a conic or an equation
 * curve becomes two joined pieces (the first keeps the curve's relations, the second keeps the far end). A circle
 * or an ellipse needs two split points (`x2`, `y2`) and becomes two arcs. Returns the new point's id or null.
 */
export function splitAt(sketch, id, x, y, second = null) {
  const e = byId(sketch, id);
  if (!e || e.id === ORIGIN) return null;
  if (e.type === 'line') {
    const a = P(sketch, e.p1); const b = P(sketch, e.p2); const d = sub(b, a); const t = dot(sub([x, y], a), d) / (dot(d, d) || 1);
    if (!(t > 1e-6 && t < 1 - 1e-6)) return null;
    const q = pt(sketch, a[0] + d[0] * t, a[1] + d[1] * t);
    const end = e.p2; e.p2 = q.id;
    const n = { ...e, id: newSketchId('l'), p1: q.id, p2: end };
    sketch.entities.push(n);
    addConstraint(sketch, { type: 'collinear', a: e.id, b: n.id });
    moveEndRelations(sketch, e, n, end);
    return q.id;
  }
  if (e.type === 'arc') {
    const g = arcGeometry(sketch, e);
    let t = Math.atan2(y - g.cy, x - g.cx);
    while (t < g.a0) t += Math.PI * 2;
    if (!(t > g.a0 + 1e-6 && t < g.a1 - 1e-6)) return null;
    const q = pt(sketch, g.cx + g.r * Math.cos(t), g.cy + g.r * Math.sin(t));
    const end = e.p2; e.p2 = q.id;
    const n = { ...e, id: newSketchId('a'), p1: q.id, p2: end };
    sketch.entities.push(n);
    moveEndRelations(sketch, e, n, end);
    return q.id;
  }
  if (e.type === 'ellipseArc') {
    const c = P(sketch, e.c); const rot = e.rot ?? 0;
    const t0 = ellipseParam(c, e.rx, e.ry, rot, P(sketch, e.p1)); let t1 = ellipseParam(c, e.rx, e.ry, rot, P(sketch, e.p2));
    while (t1 <= t0) t1 += Math.PI * 2;
    let t = ellipseParam(c, e.rx, e.ry, rot, [x, y]);
    while (t < t0) t += Math.PI * 2;
    if (!(t > t0 + 1e-6 && t < t1 - 1e-6)) return null;
    const q = pt(sketch, ...ellipsePoint(c, e.rx, e.ry, rot, t));
    const end = e.p2; e.p2 = q.id;
    const n = { ...e, id: newSketchId('e'), p1: q.id, p2: end };
    sketch.entities.push(n);
    moveEndRelations(sketch, e, n, end);
    return q.id;
  }
  if (e.type === 'conic') {
    const p0 = P(sketch, e.p1); const pc = P(sketch, e.pc); const p2 = P(sketch, e.p2); const w = (e.rho ?? 0.5) / (1 - (e.rho ?? 0.5));
    const { t } = nearestOnPieces([{ P: [p0, pc, p2], w: [1, w, 1] }], x, y);
    if (!(t > 1e-6 && t < 1 - 1e-6)) return null;
    const [h1, h2] = splitConic(p0, pc, p2, w, t);
    const q = pt(sketch, ...h1[2]);
    const end = e.p2;
    const pcPoint = byId(sketch, e.pc); pcPoint.x = h1[1][0]; pcPoint.y = h1[1][1];
    e.p2 = q.id; e.rho = h1[3] / (1 + h1[3]);
    const n = { ...e, id: newSketchId('n'), p1: q.id, pc: pt(sketch, ...h2[1], { construction: true }).id, p2: end, rho: h2[3] / (1 + h2[3]) };
    delete n.focus; delete n.apex;
    sketch.entities.push(n);
    addConstraint(sketch, { type: 'tangent', a: e.id, b: n.id });
    moveEndRelations(sketch, e, n, end);
    return q.id;
  }
  if (e.type === 'equation') {
    const pieces = curvePieces(sketch, e);
    if (!pieces.length) return null;
    // The equation's own parameter at the pick: searched along the curve itself.
    const { at, t0, t1 } = equationFunction(e);
    const local = (t) => { const [u, v] = at(t); const pl = e.place ?? {}; const k = Number(pl.k) || 1; const r = Number(pl.rot) || 0; const vv = pl.flip ? -v : v; return [(Number(pl.x) || 0) + k * (u * Math.cos(r) - vv * Math.sin(r)), (Number(pl.y) || 0) + k * (u * Math.sin(r) + vv * Math.cos(r))]; };
    let bt = t0; let bd = Infinity;
    for (let i = 0; i <= 400; i++) { const t = t0 + ((t1 - t0) * i) / 400; const p = local(t); const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; bt = t; } }
    let lo = Math.max(t0, bt - (t1 - t0) / 400); let hi = Math.min(t1, bt + (t1 - t0) / 400);
    const f = (t) => { const p = local(t); return Math.hypot(p[0] - x, p[1] - y); };
    for (let k = 0; k < 60; k++) { const m1 = lo + (hi - lo) * 0.382; const m2 = lo + (hi - lo) * 0.618; if (f(m1) < f(m2)) hi = m2; else lo = m1; }
    const t = (lo + hi) / 2;
    if (!(t > t0 + 1e-9 * (t1 - t0) && t < t1 - 1e-9 * (t1 - t0))) return null;
    const q = pt(sketch, ...local(t), { fixed: true });
    const end = e.p2;
    const n = { ...JSON.parse(JSON.stringify(e)), id: newSketchId('q'), t0: t, p1: q.id, p2: end };
    e.t1 = t; e.p2 = q.id;
    sketch.entities.push(n);
    moveEndRelations(sketch, e, n, end);
    return q.id;
  }
  if ((e.type === 'circle' || e.type === 'ellipse') && second) {
    const c = P(sketch, e.c);
    const param = (p) => (e.type === 'circle' ? Math.atan2(p[1] - c[1], p[0] - c[0]) : ellipseParam(c, e.rx, e.ry, e.rot ?? 0, p));
    const at = (t) => (e.type === 'circle' ? [c[0] + e.r * Math.cos(t), c[1] + e.r * Math.sin(t)] : ellipsePoint(c, e.rx, e.ry, e.rot ?? 0, t));
    const ta = param([x, y]); const tb = param(second);
    if (Math.abs(Math.atan2(Math.sin(ta - tb), Math.cos(ta - tb))) < 1e-6) return null;
    const qa = pt(sketch, ...at(ta)); const qb = pt(sketch, ...at(tb));
    const base = { c: e.c, ...(e.construction ? { construction: true } : {}) };
    const made = e.type === 'circle'
      ? [{ id: newSketchId('a'), type: 'arc', ...base, p1: qa.id, p2: qb.id }, { id: newSketchId('a'), type: 'arc', ...base, p1: qb.id, p2: qa.id }]
      : [{ id: newSketchId('e'), type: 'ellipseArc', ...base, rx: e.rx, ry: e.ry, rot: e.rot ?? 0, p1: qa.id, p2: qb.id }, { id: newSketchId('e'), type: 'ellipseArc', ...base, rx: e.rx, ry: e.ry, rot: e.rot ?? 0, p1: qb.id, p2: qa.id }];
    // The circle's relations (equal, tangent, diameter …) carry over to the first arc; the second is held equal to it.
    sketch.entities.splice(sketch.entities.indexOf(e), 1, ...made);
    for (const k of sketch.constraints) for (const key of ['a', 'b', 'c']) if (k[key] === e.id) k[key] = made[0].id;
    if (e.type === 'circle') addConstraint(sketch, { type: 'equal', a: made[0].id, b: made[1].id });
    return qa.id;
  }
  return null;
}

/**
 * After a split the old curve ends at the new point: relations that held its old end (a point on another curve,
 * a coincident end, a dimension to that end) now name the new piece, which kept that end.
 */
function moveEndRelations(sketch, first, second, end) {
  for (const k of sketch.constraints) {
    if (k.type === 'tangent' && (k.a === first.id || k.b === first.id)) {
      const other = byId(sketch, k.a === first.id ? k.b : k.a);
      // A tangent at the far end belongs to the piece that has that end now.
      if (other && curveEnds(other)?.includes(end)) { if (k.a === first.id) k.a = second.id; else k.b = second.id; }
    }
  }
}

// ───────────────────────── intersections of any two curves, trim of the conic curves

/**
 * A curve as a function of one parameter s ∈ [s0, s1] (lines 0…1, arcs and circles their angle, ellipses their
 * parameter angle, piece curves and splines the piece index + local t). Null for points and text.
 */
export function curveParam(sketch, e) {
  const map = new Map(sketch.entities.map((x) => [x.id, x]));
  const Q = (id) => { const p = map.get(id); return [p.x, p.y]; };
  if (e.type === 'line') { const a = Q(e.p1); const b = Q(e.p2); return { at: (s) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s], s0: 0, s1: 1, closed: false }; }
  if (e.type === 'circle') { const c = Q(e.c); return { at: (s) => [c[0] + e.r * Math.cos(s), c[1] + e.r * Math.sin(s)], s0: 0, s1: Math.PI * 2, closed: true }; }
  if (e.type === 'arc') { const g = arcGeometry(sketch, e, map); return { at: (s) => [g.cx + g.r * Math.cos(s), g.cy + g.r * Math.sin(s)], s0: g.a0, s1: g.a1, closed: false }; }
  if (e.type === 'ellipse') { const c = Q(e.c); return { at: (s) => ellipsePoint(c, e.rx, e.ry, e.rot ?? 0, s), s0: 0, s1: Math.PI * 2, closed: true }; }
  if (e.type === 'ellipseArc') {
    const c = Q(e.c); const rot = e.rot ?? 0;
    const t0 = ellipseParam(c, e.rx, e.ry, rot, Q(e.p1)); let t1 = ellipseParam(c, e.rx, e.ry, rot, Q(e.p2));
    while (t1 <= t0 + 1e-12) t1 += Math.PI * 2;
    return { at: (s) => ellipsePoint(c, e.rx, e.ry, rot, s), s0: t0, s1: t1, closed: false };
  }
  if (e.type === 'conic' || e.type === 'equation') {
    const pieces = curvePieces(sketch, e, map);
    if (!pieces.length) return null;
    return { at: (s) => { const i = Math.min(pieces.length - 1, Math.max(0, Math.floor(s))); return pieceAt(pieces[i], Math.min(1, Math.max(0, s - i))); }, s0: 0, s1: pieces.length, closed: false };
  }
  if (e.type === 'spline') {
    const bz = splineBeziers(sketch, e, map);
    const closed = e.pts.length > 3 && e.pts[0] === e.pts.at(-1);
    return { at: (s) => { const i = Math.min(bz.length - 1, Math.max(0, Math.floor(s))); const [p0, c1, c2, p3] = bz[i]; return bezierAt(p0, c1, c2, p3, Math.min(1, Math.max(0, s - i))); }, s0: 0, s1: bz.length, closed };
  }
  return null;
}

/**
 * Where two curves cross: [{ point, sa, sb }] with the parameters on each (curveParam). Found on fine samplings of
 * both, then refined by Newton steps on the two parameters until the points agree to 1e-10 mm.
 */
export function curveIntersections(sketch, a, b, n = 512) {
  const A = curveParam(sketch, a); const B = curveParam(sketch, b);
  if (!A || !B) return [];
  const samples = (C) => Array.from({ length: n + 1 }, (_, i) => { const s = C.s0 + ((C.s1 - C.s0) * i) / n; return { s, p: C.at(s) }; });
  const sa = samples(A); const sb = samples(B);
  const out = [];
  const seen = (p) => out.some((x) => Math.hypot(x.point[0] - p[0], x.point[1] - p[1]) < 1e-7);
  for (let i = 0; i < n; i++) {
    const p = sa[i].p; const q = sa[i + 1].p;
    const minx = Math.min(p[0], q[0]); const maxx = Math.max(p[0], q[0]); const miny = Math.min(p[1], q[1]); const maxy = Math.max(p[1], q[1]);
    for (let j = 0; j < n; j++) {
      const r = sb[j].p; const t = sb[j + 1].p;
      if (Math.max(r[0], t[0]) < minx || Math.min(r[0], t[0]) > maxx || Math.max(r[1], t[1]) < miny || Math.min(r[1], t[1]) > maxy) continue;
      const d1 = sub(q, p); const d2 = sub(t, r); const den = cross(d1, d2);
      if (Math.abs(den) < 1e-18) continue;
      const u = cross(sub(r, p), d2) / den; const v = cross(sub(r, p), d1) / den;
      if (u < -1e-9 || u > 1 + 1e-9 || v < -1e-9 || v > 1 + 1e-9) continue;
      // Newton on (s, w): A(s) − B(w) = 0, derivatives by central differences.
      let s = sa[i].s + (sa[i + 1].s - sa[i].s) * u; let w = sb[j].s + (sb[j + 1].s - sb[j].s) * v;
      const ha = (A.s1 - A.s0) * 1e-7; const hb = (B.s1 - B.s0) * 1e-7;
      for (let k = 0; k < 30; k++) {
        const f = sub(A.at(s), B.at(w));
        if (Math.hypot(f[0], f[1]) < 1e-11) break;
        const da = sub(A.at(s + ha), A.at(s - ha)).map((x) => x / (2 * ha)); const db = sub(B.at(w + hb), B.at(w - hb)).map((x) => -x / (2 * hb));
        const det = da[0] * db[1] - da[1] * db[0];
        if (Math.abs(det) < 1e-18) break;
        s -= (f[0] * db[1] - f[1] * db[0]) / det; w -= (da[0] * f[1] - da[1] * f[0]) / det;
      }
      const inA = A.closed || (s >= A.s0 - 1e-9 && s <= A.s1 + 1e-9); const inB = B.closed || (w >= B.s0 - 1e-9 && w <= B.s1 + 1e-9);
      const point = A.at(s);
      if (inA && inB && Math.hypot(...sub(point, B.at(w))) < 1e-7 && !seen(point)) out.push({ point, sa: s, sb: w });
    }
  }
  return out;
}

/**
 * Power trim on an ellipse, a partial ellipse, a conic or an equation curve: the piece around (x, y) between the
 * nearest crossings with the other curves goes (an ellipse becomes a partial ellipse; a curve crossed nowhere is
 * deleted). Returns true when something changed.
 */
export function trimCurveAt(sketch, id, x, y, removeEntities) {
  const e = byId(sketch, id);
  const C = curveParam(sketch, e);
  if (!C) return false;
  const others = sketch.entities.filter((o) => o !== e && !o.construction && o.type !== 'point' && o.type !== 'text');
  const cuts = others.flatMap((o) => curveIntersections(sketch, e, o).map((h) => h.sa));
  // The pick's own parameter: the nearest point of a fine sampling, refined by golden section.
  let best = C.s0; let bd = Infinity;
  for (let i = 0; i <= 2000; i++) { const s = C.s0 + ((C.s1 - C.s0) * i) / 2000; const p = C.at(s); const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = s; } }
  const span = C.s1 - C.s0;
  if (e.type === 'ellipse') {
    const norm = (s) => { let v = s; while (v < 0) v += Math.PI * 2; while (v >= Math.PI * 2) v -= Math.PI * 2; return v; };
    const ts = [...new Set(cuts.map(norm))].sort((p, q) => p - q);
    if (ts.length < 2) { removeEntities(sketch, [id]); return true; }
    const t0 = norm(best);
    let after = ts.find((t) => t > t0); let before = [...ts].reverse().find((t) => t < t0);
    if (after == null) after = ts[0] + Math.PI * 2;
    if (before == null) before = ts.at(-1) - Math.PI * 2;
    const c = byId(sketch, e.c);
    const p1 = pt(sketch, ...ellipsePoint([c.x, c.y], e.rx, e.ry, e.rot ?? 0, after)); const p2 = pt(sketch, ...ellipsePoint([c.x, c.y], e.rx, e.ry, e.rot ?? 0, before));
    const n = { id: newSketchId('e'), type: 'ellipseArc', c: e.c, p1: p1.id, p2: p2.id, rx: e.rx, ry: e.ry, rot: e.rot ?? 0 };
    sketch.entities.splice(sketch.entities.indexOf(e), 1, n);
    for (const k of sketch.constraints) for (const key of ['a', 'b', 'c']) if (k[key] === e.id) k[key] = n.id;
    return true;
  }
  if (e.type === 'spline') { removeEntities(sketch, [id]); return true; }
  const inner = cuts.filter((s) => s > C.s0 + span * 1e-9 && s < C.s1 - span * 1e-9).sort((p, q) => p - q);
  const lo = inner.filter((s) => s < best).at(-1) ?? null; const hi = inner.find((s) => s > best) ?? null;
  if (lo == null && hi == null) { removeEntities(sketch, [id]); return true; }
  // Cut at the far crossing first (the curve's own end keeps its id), then at the near one, and drop the middle.
  let middle = e;
  if (hi != null) { const q = C.at(hi); if (!splitAt(sketch, middle.id, q[0], q[1])) return false; }
  if (lo != null) {
    const q = C.at(lo);
    const before = new Set(sketch.entities.map((x) => x.id));
    if (!splitAt(sketch, middle.id, q[0], q[1])) return false;
    middle = sketch.entities.find((x) => !before.has(x.id) && x.type === e.type) ?? middle;
  }
  removeEntities(sketch, [middle.id]);
  return true;
}

// ───────────────────────── stretch entities

/**
 * Stretch: the points of the selected entities move by (dx, dy) and the sketch is solved with the relations kept,
 * so curves joined to them stretch (unlike Move, which frees what it moves). Returns false (and leaves the sketch as
 * it was) when the relations do not allow it.
 */
export function stretchEntities(sketch, ids, dx, dy) {
  const ents = ids.map((id) => byId(sketch, id)).filter(Boolean);
  const pts = new Set(ents.flatMap((e) => (e.type === 'point' ? [e.id] : pointsOf(e))));
  pts.delete(ORIGIN);
  const moving = [...pts].map((id) => byId(sketch, id)).filter((p) => p && !p.fixed);
  if (!moving.length) return false;
  const before = sketch.entities.filter((e) => e.type === 'point').map((p) => [p, p.x, p.y]);
  // The moved points are held where they go. Everything else is held too at first; then, nearest first (along the
  // curves and relations that join them to what moved), points are let go until the relations can be met — so only
  // what has to follow moves (a rectangle's far side stays, its centre point follows). None works: refused.
  for (const p of moving) { p.x += dx; p.y += dy; p.fixed = true; }
  const order = followOrder(sketch, moving.map((p) => p.id));
  const held = order.map((id) => byId(sketch, id)).filter((p) => p && !p.fixed);
  for (const p of held) p.fixed = true;
  let ok = false;
  try {
    for (let k = 0; k <= held.length && !ok; k++) {
      if (k) delete held[k - 1].fixed;
      ok = solveSketch(sketch).ok;
      if (!ok) for (const [p, x, y] of before) if (!moving.includes(p)) { p.x = x; p.y = y; }
    }
  } finally { for (const p of [...moving, ...held]) delete p.fixed; }
  if (!ok) { for (const [p, x, y] of before) { p.x = x; p.y = y; } solveSketch(sketch); return false; }
  solveSketch(sketch);
  return true;
}

/** Free points in the order they are reached from the start points through shared curves and relations (nearest first). */
function followOrder(sketch, start) {
  const adj = new Map();
  const link = (a, b) => { if (a === b) return; if (!adj.has(a)) adj.set(a, new Set()); if (!adj.has(b)) adj.set(b, new Set()); adj.get(a).add(b); adj.get(b).add(a); };
  const ptsOf = (id) => { const e = byId(sketch, id); return !e ? [] : e.type === 'point' ? [e.id] : pointsOf(e); };
  for (const e of sketch.entities) { const ps = e.type === 'point' ? [] : pointsOf(e); for (const a of ps) for (const b of ps) link(a, b); }
  for (const c of sketch.constraints) { const ps = [c.a, c.b, c.c].filter(Boolean).flatMap(ptsOf); for (const a of ps) for (const b of ps) link(a, b); }
  const seen = new Set(start); const out = []; let front = [...start];
  while (front.length) {
    const next = [];
    for (const id of front) for (const n of adj.get(id) ?? []) if (!seen.has(n)) { seen.add(n); out.push(n); next.push(n); }
    front = next;
  }
  // Points not joined to what moved never need to move.
  for (const e of sketch.entities) if (e.type === 'point' && !seen.has(e.id) && e.id !== ORIGIN) out.push(e.id);
  return out.filter((id) => id !== ORIGIN);
}

// ───────────────────────── fully define sketch

/**
 * Fully Define Sketch: horizontal / vertical relations for lines drawn so (within `angleTol` degrees), then driving
 * dimensions — line lengths, circle diameters, arc radii, and horizontal / vertical positions of points from the
 * origin (or from the point `datum`) — each kept only when it takes away freedom without over-defining the sketch.
 * Returns { relations, dimensions, dof } (the counts added and the freedom left).
 */
export function fullyDefine(sketch, { relations = true, dimensions = true, angleTol = 1, datum = ORIGIN } = {}) {
  let dof = analyse(sketch).dof;
  const added = { relations: 0, dimensions: 0 };
  const tryAdd = (c, kind) => {
    if (dof <= 0) return false;
    const n = sketch.constraints.length;
    const k = addConstraint(sketch, c);
    if (sketch.constraints.length === n) return false;
    // A relation moves the geometry a little (a line drawn almost level becomes level), and so does a dimension
    // (its value is kept to 1e-6 mm): solve, and put everything back when it does not fit.
    const saved = sketch.entities.filter((e) => e.type === 'point' || e.type === 'circle').map((p) => [p, p.x, p.y, p.r]);
    const solved = solveSketch(sketch).ok;
    const r = analyse(sketch);
    if (!solved || r.over || r.dof >= dof) {
      sketch.constraints = sketch.constraints.filter((x) => x !== k);
      for (const [p, x, y, r0] of saved) { if (p.type === 'point') { p.x = x; p.y = y; } else p.r = r0; }
      return false;
    }
    dof = r.dof;
    added[kind]++;
    return true;
  };
  const curves = sketch.entities.filter((e) => e.type !== 'point' && !e.origin);
  if (relations) {
    for (const l of curves.filter((e) => e.type === 'line')) {
      const a = byId(sketch, l.p1); const b = byId(sketch, l.p2);
      const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      const off = (t) => Math.abs(((ang - t + 540) % 360) - 180);
      if (off(0) < angleTol || off(180) < angleTol) tryAdd({ type: 'horizontal', a: l.id }, 'relations');
      else if (off(90) < angleTol || off(-90) < angleTol) tryAdd({ type: 'vertical', a: l.id }, 'relations');
    }
  }
  if (dimensions) {
    const dim = (ids, kind) => { const c = dimensionFor(sketch, ids, kind); return c ? tryAdd(c, 'dimensions') : false; };
    for (const e of curves) {
      if (e.construction && e.type === 'line') continue;
      if (e.type === 'line') dim([e.id]);
      else if (e.type === 'circle') dim([e.id], 'diameter');
      else if (e.type === 'arc') dim([e.id], 'radius');
    }
    // Positions: every point of the curves (centres first), then standalone points.
    const order = [];
    for (const e of curves) for (const id of (e.c ? [e.c] : []).concat(pointsOf(e))) if (!order.includes(id)) order.push(id);
    for (const p of sketch.entities) if (p.type === 'point' && !order.includes(p.id)) order.push(p.id);
    for (const id of order) {
      if (id === datum || byId(sketch, id)?.fixed) continue;
      dim([datum, id], 'hdistance');
      dim([datum, id], 'vdistance');
    }
    // Lines that can still turn (two free ends held only by a length): an angle to a neighbour line.
    for (const e of curves.filter((x) => x.type === 'line' && !x.construction)) {
      const other = curves.find((o) => o !== e && o.type === 'line' && !o.construction);
      if (other) dim([e.id, other.id]);
    }
  }
  return { ...added, dof };
}
