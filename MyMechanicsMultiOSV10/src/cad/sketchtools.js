// Sketch editing tools: spline and ellipse entities, sketch fillet and
// chamfer at a corner, offset entities, mirror entities, linear / circular sketch patterns, power trim
// (cut a curve where others cross it and remove the picked piece) and extend (a line to the next curve).
// Plain numbers on the sketch's entities — no DOM, no kernel. Every tool keeps the geometry connected
// (shared points) and adds the expected relations (tangent, symmetric, equal …).
import { addArc, addConstraint, addLine, arcGeometry, byId, newSketchId, pointsOf, polyline, removeEntities, refreshEquation, mapEquationPlace, ORIGIN, POINT_KEYS } from './sketch.js';
import { ellipsePoint, parabolaSegment, equationPieces } from './sketch-curves.js';
import { curveIntersections, trimCurveAt } from './sketch-draw.js';

const pt = (sketch, x, y, extra = {}) => { const p = { id: newSketchId('p'), type: 'point', x, y, ...extra }; sketch.entities.push(p); return p; };
const P = (sketch, id) => { const p = byId(sketch, id); return [p.x, p.y]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (d) => Math.hypot(d[0], d[1]);
const unit = (d) => { const l = len(d) || 1; return [d[0] / l, d[1] / l]; };
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

// ───────────────────────── new entity kinds

/** A spline through points [[x,y], …] (closed when `closed`). `ids` reuses existing points at those places. */
export function addSpline(sketch, points, { closed = false, ids = [], construction = false } = {}) {
  const pts = points.map(([x, y], i) => ids[i] ?? pt(sketch, x, y).id);
  if (closed && pts.length > 2) pts.push(pts[0]);
  const spline = { id: newSketchId('s'), type: 'spline', pts, ...(construction ? { construction: true } : {}) };
  sketch.entities.push(spline);
  return spline;
}

/** An ellipse around (cx,cy) with half axes rx, ry turned by `rot` radians. */
export function addEllipse(sketch, cx, cy, rx, ry, rot = 0, { center = null, construction = false } = {}) {
  const c = center ? byId(sketch, center) : pt(sketch, cx, cy);
  const e = { id: newSketchId('e'), type: 'ellipse', c: c.id, rx: Math.max(1e-3, Math.abs(rx)), ry: Math.max(1e-3, Math.abs(ry)), rot, ...(construction ? { construction: true } : {}) };
  sketch.entities.push(e);
  return e;
}

/**
 * A partial ellipse: centre (cx, cy), half axes rx, ry turned by `rot`, counter-clockwise from parameter angle t0
 * to t1. `from` / `to` / `center` reuse existing points (they are moved onto the ellipse by the solver).
 */
export function addEllipseArc(sketch, cx, cy, rx, ry, rot, t0, t1, { center = null, from = null, to = null, construction = false } = {}) {
  const c = center ? byId(sketch, center) : pt(sketch, cx, cy);
  const at = (t) => ellipsePoint([c.x, c.y], rx, ry, rot, t);
  const p1 = from ? byId(sketch, from) : pt(sketch, ...at(t0));
  const p2 = to ? byId(sketch, to) : pt(sketch, ...at(t1));
  const e = { id: newSketchId('e'), type: 'ellipseArc', c: c.id, p1: p1.id, p2: p2.id, rx: Math.max(1e-3, Math.abs(rx)), ry: Math.max(1e-3, Math.abs(ry)), rot, ...(construction ? { construction: true } : {}) };
  sketch.entities.push(e);
  return e;
}

/** A conic from p0 to p2 whose end tangents meet at pc; rho (0 … 1, 0.5 = parabola) sets its fullness. */
export function addConic(sketch, p0, pc, p2, rho = 0.5, { from = null, to = null, parabola = false, construction = false } = {}) {
  const a = from ? byId(sketch, from) : pt(sketch, ...p0);
  const c = pt(sketch, ...pc, { construction: true });
  const b = to ? byId(sketch, to) : pt(sketch, ...p2);
  const e = { id: newSketchId('n'), type: 'conic', p1: a.id, pc: c.id, p2: b.id, rho: Math.min(0.99, Math.max(0.01, Number(rho) || 0.5)), ...(parabola ? { parabola: true } : {}), ...(construction ? { construction: true } : {}) };
  sketch.entities.push(e);
  return e;
}

/** A parabola from its focus and apex, between the points of it beside `a` and `b`. Null when they do not make one. */
export function addParabola(sketch, focus, apex, a, b, options = {}) {
  const seg = parabolaSegment(focus, apex, a, b);
  if (!seg) return null;
  const e = addConic(sketch, seg.p0, seg.pc, seg.p2, 0.5, { ...options, parabola: true });
  e.focus = [...focus]; e.apex = [...apex];
  return e;
}

/**
 * An equation-driven curve: explicit { fy: 'f(x)', t0: x1, t1: x2 } or parametric { mode: 'parametric', fx, fy,
 * t0, t1 } (angles in radians). Its end points are fixed where the equation puts them. Throws when the equation
 * cannot be evaluated over the range.
 */
export function addEquationCurve(sketch, def, { place = null, construction = false } = {}) {
  const e = { id: newSketchId('q'), type: 'equation', mode: def.mode === 'parametric' ? 'parametric' : 'explicit', fy: String(def.fy ?? ''), ...(def.mode === 'parametric' ? { fx: String(def.fx ?? '') } : {}), t0: Number(def.t0), t1: Number(def.t1), ...(place ? { place: { ...place } } : {}), ...(construction ? { construction: true } : {}) };
  const pieces = equationPieces(e);
  const ends = [pieces[0].P[0], pieces.at(-1).P.at(-1)];
  const pa = pt(sketch, 0, 0, { fixed: true });
  const closed = Math.hypot(ends[0][0] - ends[1][0], ends[0][1] - ends[1][1]) < 1e-9;
  const pb = closed ? pa : pt(sketch, 0, 0, { fixed: true });
  e.p1 = pa.id; e.p2 = pb.id;
  sketch.entities.push(e);
  refreshEquation(sketch, e);
  return e;
}

// ───────────────────────── fillet and chamfer at a corner

/** The two lines that meet at point `id` (a corner), or null. */
function cornerLines(sketch, id) {
  const lines = sketch.entities.filter((e) => e.type === 'line' && !e.construction && (e.p1 === id || e.p2 === id));
  return lines.length === 2 ? lines : null;
}

/**
 * Rounds the corner at point `id` (two lines meeting there) with radius r: both lines are shortened and a
 * tangent arc joins them. Returns the arc, or null (not a corner / radius too big).
 */
export function sketchFillet(sketch, id, r) {
  const lines = cornerLines(sketch, id);
  if (!lines || !(r > 0)) return null;
  const c = P(sketch, id);
  const far = lines.map((l) => P(sketch, l.p1 === id ? l.p2 : l.p1));
  const d1 = unit(sub(far[0], c)); const d2 = unit(sub(far[1], c));
  const half = Math.acos(Math.max(-1, Math.min(1, dot(d1, d2)))) / 2;
  if (half < 1e-4 || half > Math.PI / 2 - 1e-4) return null;
  const t = r / Math.tan(half);
  if (t >= len(sub(far[0], c)) - 1e-9 || t >= len(sub(far[1], c)) - 1e-9) return null;
  const a = [c[0] + d1[0] * t, c[1] + d1[1] * t];
  const b = [c[0] + d2[0] * t, c[1] + d2[1] * t];
  const bis = unit([d1[0] + d2[0], d1[1] + d2[1]]);
  const m = r / Math.sin(half);
  const centre = [c[0] + bis[0] * m, c[1] + bis[1] * m];
  // The lines get new end points at the tangent points; the old corner point stays (as a construction mark, a virtual sharp).
  const pa = pt(sketch, ...a); const pb = pt(sketch, ...b);
  const [l1, l2] = lines;
  if (l1.p1 === id) l1.p1 = pa.id; else l1.p2 = pa.id;
  if (l2.p1 === id) l2.p1 = pb.id; else l2.p2 = pb.id;
  // Arc counter-clockwise from the start angle to the end angle.
  const ang = (p) => Math.atan2(p[1] - centre[1], p[0] - centre[0]);
  const ccw = cross(sub(a, centre), sub(b, centre)) > 0;
  const arc = addArc(sketch, centre[0], centre[1], r, ccw ? ang(a) : ang(b), ccw ? ang(b) : ang(a), { from: ccw ? pa.id : pb.id, to: ccw ? pb.id : pa.id });
  addConstraint(sketch, { type: 'tangent', a: l1.id, b: arc.id });
  addConstraint(sketch, { type: 'tangent', a: l2.id, b: arc.id });
  // Relations on the old corner that no longer make sense go; the corner point is removed if unused.
  sketch.constraints = sketch.constraints.filter((k) => !(k.type === 'coincident' && (k.a === id || k.b === id)));
  if (!sketch.entities.some((e) => e.type !== 'point' && pointsOf(e).includes(id)) && id !== ORIGIN) removeEntities(sketch, [id]);
  return arc;
}

/** Chamfers the corner at point `id` by distance d along both lines (or d along the first, d2 along the second). */
export function sketchChamfer(sketch, id, d, d2 = d) {
  const lines = cornerLines(sketch, id);
  if (!lines || !(d > 0) || !(d2 > 0)) return null;
  const c = P(sketch, id);
  const ends = lines.map((l) => P(sketch, l.p1 === id ? l.p2 : l.p1));
  const dist = [d, d2];
  const news = lines.map((l, i) => {
    const dir = unit(sub(ends[i], c));
    if (dist[i] >= len(sub(ends[i], c)) - 1e-9) return null;
    return pt(sketch, c[0] + dir[0] * dist[i], c[1] + dir[1] * dist[i]);
  });
  if (news.some((x) => !x)) { sketch.entities = sketch.entities.filter((e) => !news.includes(e)); return null; }
  lines.forEach((l, i) => { if (l.p1 === id) l.p1 = news[i].id; else l.p2 = news[i].id; });
  const line = addLine(sketch, 0, 0, 0, 0, { from: news[0].id, to: news[1].id });
  sketch.constraints = sketch.constraints.filter((k) => !(k.type === 'coincident' && (k.a === id || k.b === id)));
  if (!sketch.entities.some((e) => e.type !== 'point' && pointsOf(e).includes(id)) && id !== ORIGIN) removeEntities(sketch, [id]);
  return line;
}

// ───────────────────────── offset entities

/**
 * Offsets curves by `distance` (positive = to the left of a line's direction / outward for circles and arcs).
 * Joined chains stay joined: offset lines are trimmed / extended to meet where the originals met.
 * Returns the new entities.
 */
export function offsetEntities(sketch, ids, distance) {
  const ents = ids.map((id) => byId(sketch, id)).filter((e) => e && ['line', 'circle', 'arc', 'ellipse'].includes(e.type));
  const made = [];
  const lineGeo = new Map();
  for (const e of ents) {
    if (e.type === 'circle') { const c = byId(sketch, e.c); const r = e.r + distance; if (r > 1e-6) { const n = { id: newSketchId('c'), type: 'circle', c: pt(sketch, c.x, c.y).id, r }; sketch.entities.push(n); addConstraint(sketch, { type: 'concentric', a: e.id, b: n.id }); made.push(n); } continue; }
    if (e.type === 'ellipse') { const c = byId(sketch, e.c); made.push(addEllipse(sketch, c.x, c.y, e.rx + distance, e.ry + distance, e.rot)); continue; }
    if (e.type === 'arc') {
      const g = arcGeometry(sketch, e); const r = g.r + distance;
      if (r > 1e-6) { const n = addArc(sketch, g.cx, g.cy, r, g.a0, g.a1); addConstraint(sketch, { type: 'concentric', a: e.id, b: n.id }); made.push(n); }
      continue;
    }
    const a = P(sketch, e.p1); const b = P(sketch, e.p2);
    const dir = unit(sub(b, a)); const nrm = [-dir[1], dir[0]];
    const oa = [a[0] + nrm[0] * distance, a[1] + nrm[1] * distance];
    const ob = [b[0] + nrm[0] * distance, b[1] + nrm[1] * distance];
    lineGeo.set(e.id, { e, oa, ob, dir });
  }
  // Lines that shared an end point: their offsets meet at the intersection of the offset lines.
  const ends = new Map();
  for (const g of lineGeo.values()) { g.na = g.oa; g.nb = g.ob; }
  for (const g of lineGeo.values()) {
    for (const h of lineGeo.values()) {
      if (g === h) continue;
      for (const [gk, gp] of [['na', g.e.p1], ['nb', g.e.p2]]) {
        for (const [, hp] of [['na', h.e.p1], ['nb', h.e.p2]]) {
          if (gp !== hp) continue;
          const x = intersectLines(g.oa, g.dir, h.oa, h.dir);
          if (x) g[gk] = x;
        }
      }
    }
  }
  for (const g of lineGeo.values()) {
    const keyA = `${g.e.p1}`; const keyB = `${g.e.p2}`;
    const pa = ends.get(keyA) ?? pt(sketch, ...g.na); ends.set(keyA, pa);
    const pb = ends.get(keyB) ?? pt(sketch, ...g.nb); ends.set(keyB, pb);
    const n = addLine(sketch, 0, 0, 0, 0, { from: pa.id, to: pb.id });
    addConstraint(sketch, { type: 'parallel', a: g.e.id, b: n.id });
    made.push(n);
  }
  return made;
}

function intersectLines(p, d, q, e) {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-12) return null;
  const t = cross(sub(q, p), e) / den;
  return [p[0] + d[0] * t, p[1] + d[1] * t];
}

// ───────────────────────── mirror and patterns (copies)

/** Copies entities with every point mapped by fn([x,y]) → [x,y]; shared points stay shared. Returns { made, map }. */
function copyEntities(sketch, ids, fn, { reverse = false } = {}) {
  const src = ids.map((id) => byId(sketch, id)).filter((e) => e && e.id !== ORIGIN);
  const curves = src.filter((e) => e.type !== 'point');
  const pointIds = new Set([...src.filter((e) => e.type === 'point').map((e) => e.id), ...curves.flatMap(pointsOf)]);
  const map = new Map();
  for (const id of pointIds) {
    const p = byId(sketch, id);
    if (!p) continue;
    const [x, y] = fn([p.x, p.y]);
    map.set(id, pt(sketch, x, y, p.standalone ? { standalone: true } : {}).id);
  }
  const made = [];
  for (const e of curves) {
    const n = { ...JSON.parse(JSON.stringify(e)), id: newSketchId(e.type[0]) };
    for (const k of POINT_KEYS) if (n[k]) n[k] = map.get(n[k]);
    if (n.pts) n.pts = n.pts.map((id) => map.get(id));
    // A reflection turns an arc's direction around: its ends swap.
    if (reverse && (n.type === 'arc' || n.type === 'ellipseArc')) [n.p1, n.p2] = [n.p2, n.p1];
    if (n.type === 'ellipse' || n.type === 'ellipseArc') {
      const c = byId(sketch, e.c); const ax = fn([c.x + Math.cos(e.rot ?? 0), c.y + Math.sin(e.rot ?? 0)]); const nc = byId(sketch, n.c);
      n.rot = Math.atan2(ax[1] - nc.y, ax[0] - nc.x);
    }
    if (n.type === 'equation') n.place = mapEquationPlace(e, fn);
    if (n.focus) { n.focus = fn(e.focus); n.apex = fn(e.apex); }
    sketch.entities.push(n);
    if (n.type === 'equation') refreshEquation(sketch, n);
    made.push(n);
  }
  for (const id of pointIds) if (!curves.some((e) => pointsOf(e).includes(id))) made.push(byId(sketch, map.get(id)));
  return { made, map };
}

/** Mirrors entities about a line (centerline); the copies' points are symmetric to the originals. */
export function mirrorEntities(sketch, ids, lineId) {
  const line = byId(sketch, lineId);
  if (!line || line.type !== 'line') return [];
  const a = P(sketch, line.p1); const d = unit(sub(P(sketch, line.p2), a));
  const reflect = ([x, y]) => { const v = [x - a[0], y - a[1]]; const k = dot(v, d); return [a[0] + 2 * k * d[0] - v[0], a[1] + 2 * k * d[1] - v[1]]; };
  const { made, map } = copyEntities(sketch, ids.filter((id) => id !== lineId), reflect, { reverse: true });
  for (const [from, to] of map) addConstraint(sketch, { type: 'symmetric', a: from, b: to, c: lineId });
  return made;
}

/** Linear sketch pattern: count copies (the original included) spaced by (dx, dy); optional second direction. */
export function linearSketchPattern(sketch, ids, { dx = 10, dy = 0, count = 3, dx2 = 0, dy2 = 10, count2 = 1 } = {}) {
  const made = [];
  for (let i = 0; i < Math.max(1, count); i++) {
    for (let j = 0; j < Math.max(1, count2); j++) {
      if (!i && !j) continue;
      const ox = i * dx + j * dx2; const oy = i * dy + j * dy2;
      made.push(...copyEntities(sketch, ids, ([x, y]) => [x + ox, y + oy]).made);
    }
  }
  return made;
}

/** Circular sketch pattern about (cx, cy): count copies over `angle` degrees (360 = equally spaced around). */
export function circularSketchPattern(sketch, ids, { cx = 0, cy = 0, count = 6, angle = 360 } = {}) {
  const made = [];
  const n = Math.max(1, Math.round(count));
  const step = ((angle >= 359.999 ? angle / n : angle / Math.max(1, n - 1)) * Math.PI) / 180;
  for (let i = 1; i < n; i++) {
    const c = Math.cos(step * i); const s = Math.sin(step * i);
    made.push(...copyEntities(sketch, ids, ([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]).made);
  }
  return made;
}

// ───────────────────────── trim and extend

/** Where curve `e` is crossed by the other curves: parameters along it (lines: 0..1; circles / arcs: angle). */
function crossings(sketch, e) {
  const out = [];
  const analytic = (x) => ['line', 'circle', 'arc'].includes(x.type);
  const others = sketch.entities.filter((o) => o !== e && !o.construction && o.type !== 'point' && o.type !== 'text');
  // Lines, circles and arcs meet in closed form; any other curve (ellipses, conics, equation curves, splines) numerically.
  for (const o of others) for (const p of analytic(o) ? intersect(sketch, e, o) : curveIntersections(sketch, e, o).map((h) => h.point)) out.push(p);
  return out;
}

/** Intersection points of two curves (lines as segments, arcs only on their span). */
export function intersect(sketch, e, o) {
  const pts = [];
  const seg = (l) => [P(sketch, l.p1), P(sketch, l.p2)];
  const circ = (c) => { if (c.type === 'circle') { const cc = byId(sketch, c.c); return { c: [cc.x, cc.y], r: c.r, arc: null }; } const g = arcGeometry(sketch, c); return { c: [g.cx, g.cy], r: g.r, arc: g }; };
  const onArc = (g, p) => { if (!g) return true; let t = Math.atan2(p[1] - g.cy, p[0] - g.cx); while (t < g.a0 - 1e-9) t += Math.PI * 2; return t <= g.a1 + 1e-9; };
  const onSeg = (a, b, p) => { const d = sub(b, a); const t = dot(sub(p, a), d) / (dot(d, d) || 1); return t >= -1e-9 && t <= 1 + 1e-9; };
  if (e.type === 'line' && o.type === 'line') {
    const [a, b] = seg(e); const [c, d] = seg(o);
    const x = intersectLines(a, sub(b, a), c, sub(d, c));
    if (x && onSeg(a, b, x) && onSeg(c, d, x)) pts.push(x);
    return pts;
  }
  if (e.type === 'line' || o.type === 'line') {
    const l = e.type === 'line' ? e : o; const k = l === e ? o : e;
    const [a, b] = seg(l); const { c, r, arc } = circ(k);
    const d = sub(b, a); const f = sub(a, c);
    const A = dot(d, d); const B = 2 * dot(f, d); const C = dot(f, f) - r * r;
    const disc = B * B - 4 * A * C;
    if (disc < 0 || A < 1e-18) return pts;
    for (const sgn of [-1, 1]) {
      const t = (-B + sgn * Math.sqrt(disc)) / (2 * A);
      const p = [a[0] + d[0] * t, a[1] + d[1] * t];
      if (t >= -1e-9 && t <= 1 + 1e-9 && onArc(arc, p)) pts.push(p);
      if (disc === 0) break;
    }
    return pts;
  }
  const A = circ(e); const B = circ(o);
  const dd = len(sub(B.c, A.c));
  if (dd < 1e-12 || dd > A.r + B.r || dd < Math.abs(A.r - B.r)) return pts;
  const aa = (A.r * A.r - B.r * B.r + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(0, A.r * A.r - aa * aa));
  const m = [A.c[0] + ((B.c[0] - A.c[0]) * aa) / dd, A.c[1] + ((B.c[1] - A.c[1]) * aa) / dd];
  for (const sgn of [-1, 1]) {
    const p = [m[0] + (sgn * h * (B.c[1] - A.c[1])) / dd, m[1] - (sgn * h * (B.c[0] - A.c[0])) / dd];
    if (onArc(A.arc, p) && onArc(B.arc, p)) pts.push(p);
    if (h === 0) break;
  }
  return pts;
}

/**
 * Power trim: the piece of curve `id` around (x, y) between its nearest crossings is removed; the rest stays
 * (a line becomes up to two lines, a circle an arc, an arc up to two arcs). A curve nothing crosses is deleted.
 */
export function trimAt(sketch, id, x, y) {
  const e = byId(sketch, id);
  if (!e || e.id === ORIGIN) return false;
  if (!['line', 'circle', 'arc'].includes(e.type)) return trimCurveAt(sketch, id, x, y, removeEntities);
  const xs = crossings(sketch, e);
  if (e.type === 'line') {
    const a = P(sketch, e.p1); const b = P(sketch, e.p2); const d = sub(b, a); const L2 = dot(d, d) || 1;
    const ts = xs.map((p) => dot(sub(p, a), d) / L2).filter((t) => t > 1e-6 && t < 1 - 1e-6).sort((p, q) => p - q);
    const t0 = dot(sub([x, y], a), d) / L2;
    const lo = Math.max(0, ...ts.filter((t) => t < t0)); const hi = Math.min(1, ...ts.filter((t) => t > t0));
    if (lo <= 0 && hi >= 1) { removeEntities(sketch, [id]); return true; }
    const at = (t) => [a[0] + d[0] * t, a[1] + d[1] * t];
    const p2 = e.p2;
    if (lo > 0) { const q = pt(sketch, ...at(lo)); e.p2 = q.id; }
    if (hi < 1) {
      if (lo > 0) { const q = pt(sketch, ...at(hi)); addLine(sketch, 0, 0, 0, 0, { from: q.id, to: p2 }); }
      else { const q = pt(sketch, ...at(hi)); e.p1 = q.id; }
    }
    return true;
  }
  const g = e.type === 'circle' ? (() => { const c = byId(sketch, e.c); return { cx: c.x, cy: c.y, r: e.r, a0: 0, a1: Math.PI * 2 }; })() : arcGeometry(sketch, e);
  const norm = (t) => { let v = t; while (v < g.a0 - 1e-12) v += Math.PI * 2; while (v > g.a0 + Math.PI * 2) v -= Math.PI * 2; return v; };
  const ts = xs.map((p) => norm(Math.atan2(p[1] - g.cy, p[0] - g.cx))).filter((t) => (e.type === 'circle' ? true : t > g.a0 + 1e-6 && t < g.a1 - 1e-6)).sort((p, q) => p - q);
  const t0 = norm(Math.atan2(y - g.cy, x - g.cx));
  if (e.type === 'circle') {
    if (ts.length < 2) { removeEntities(sketch, [id]); return true; }
    // The removed piece runs from the crossing before the pick to the one after; what is left becomes an arc.
    let after = ts.find((t) => t > t0); let before = [...ts].reverse().find((t) => t < t0);
    if (after == null) after = ts[0] + Math.PI * 2;
    if (before == null) before = ts.at(-1) - Math.PI * 2;
    const centre = e.c; const r = e.r;
    removeEntities(sketch, [id]);
    const c = byId(sketch, centre) ? centre : pt(sketch, g.cx, g.cy).id;
    addArc(sketch, g.cx, g.cy, r, after, before + Math.PI * 2, { center: c });
    return true;
  }
  const lo = Math.max(g.a0, ...ts.filter((t) => t < t0)); const hi = Math.min(g.a1, ...ts.filter((t) => t > t0));
  if (lo <= g.a0 + 1e-9 && hi >= g.a1 - 1e-9) { removeEntities(sketch, [id]); return true; }
  const end = e.p2;
  if (lo > g.a0 + 1e-9) { const q = pt(sketch, g.cx + g.r * Math.cos(lo), g.cy + g.r * Math.sin(lo)); e.p2 = q.id; }
  if (hi < g.a1 - 1e-9) {
    if (lo > g.a0 + 1e-9) { const q = pt(sketch, g.cx + g.r * Math.cos(hi), g.cy + g.r * Math.sin(hi)); sketch.entities.push({ id: newSketchId('a'), type: 'arc', c: e.c, p1: q.id, p2: end }); }
    else { const q = pt(sketch, g.cx + g.r * Math.cos(hi), g.cy + g.r * Math.sin(hi)); e.p1 = q.id; }
  }
  return true;
}

/** Extends a line from its end nearer (x, y) to the first curve it would meet. Returns true when it grew. */
export function extendAt(sketch, id, x, y) {
  const e = byId(sketch, id);
  if (!e || e.type !== 'line') return false;
  const a = P(sketch, e.p1); const b = P(sketch, e.p2);
  const endKey = Math.hypot(x - a[0], y - a[1]) < Math.hypot(x - b[0], y - b[1]) ? 'p1' : 'p2';
  const from = endKey === 'p1' ? b : a; const to = endKey === 'p1' ? a : b;
  const d = unit(sub(to, from));
  const L = len(sub(to, from));
  // A long ray from the end: the nearest crossing beyond the end wins.
  const far = 1e5;
  const probe = { id: '_ray', type: 'line', p1: '_r1', p2: '_r2' };
  const tmp = { ...sketch, entities: [...sketch.entities, { id: '_r1', type: 'point', x: to[0], y: to[1] }, { id: '_r2', type: 'point', x: to[0] + d[0] * far, y: to[1] + d[1] * far }, probe] };
  let best = null;
  for (const o of sketch.entities) {
    if (o.id === e.id || o.construction || o.type === 'point' || o.type === 'text') continue;
    const hits = ['line', 'circle', 'arc'].includes(o.type) ? intersect(tmp, probe, o) : curveIntersections(tmp, probe, o, 2048).map((h) => h.point);
    for (const p of hits) {
      const t = dot(sub(p, from), d);
      if (t > L + 1e-6 && (!best || t < best.t)) best = { t, p };
    }
  }
  if (!best) return false;
  const q = byId(sketch, e[endKey]);
  // A shared end would drag its other curves along: the line gets its own new end instead.
  if (sketch.entities.some((o) => o !== e && o.type !== 'point' && pointsOf(o).includes(q.id))) e[endKey] = pt(sketch, ...best.p).id;
  else { q.x = best.p[0]; q.y = best.p[1]; }
  return true;
}

/** Points along a curve for picking (re-exported for the editor). */
export { polyline };
