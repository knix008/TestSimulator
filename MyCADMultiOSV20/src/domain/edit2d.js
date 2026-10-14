// 2D editing like FreeCAD's Draft / Sketcher: trim, extend, fillet and chamfer.
//   trim     removes the piece of a line, arc, circle or polyline between the
//            nearest cutting edges on either side of the picked point
//   extend   lengthens the end of a line, arc or open polyline nearest the
//            pick up to the next edge it meets
//   fillet   rounds the corner of two lines with an arc of a radius (0 = sharp corner)
//   chamfer  cuts the corner of two lines with a straight edge
// Every function returns raw entity data (or null when it cannot do it); the
// pieces keep the original's layer and style.
import { add, angleOf, angleOnArc, arcPoints, cross, dist, dot, intersectCircles, intersectSegmentCircle, len, mul, norm, normDeg, sub, sweep } from './geometry.js';

const style = (e) => ({ layer: e.layer, color: e.color, lineType: e.lineType, lineWidth: e.lineWidth });
const EPS = 1e-7;

// ───────────────────────── the target as a curve with a parameter

/** A trimmable entity as a curve: seg (t 0…1), path (length along), circle (angle), arc (sweep from start). */
export function curveOf(e) {
  switch (e.type) {
    case 'line': return { kind: 'seg', a: { x: e.x1, y: e.y1 }, b: { x: e.x2, y: e.y2 } };
    case 'polyline': return { kind: 'path', points: e.points, closed: e.closed };
    case 'rect': {
      const c = Math.cos((e.angle * Math.PI) / 180); const s = Math.sin((e.angle * Math.PI) / 180);
      const at = (u, v) => ({ x: e.x + u * c - v * s, y: e.y + u * s + v * c });
      return { kind: 'path', points: [at(0, 0), at(e.width, 0), at(e.width, e.height), at(0, e.height)], closed: true };
    }
    case 'polygon': {
      const pts = Array.from({ length: e.sides }, (_, i) => { const a = ((e.angle + (360 * i) / e.sides) * Math.PI) / 180; return { x: e.cx + e.r * Math.cos(a), y: e.cy + e.r * Math.sin(a) }; });
      return { kind: 'path', points: pts, closed: true };
    }
    case 'circle': return { kind: 'circle', c: { x: e.cx, y: e.cy }, r: e.r };
    case 'arc': return { kind: 'arc', c: { x: e.cx, y: e.cy }, r: e.r, start: e.start, end: e.end };
    default: return null;
  }
}

/** Segments of a path curve with their start parameter. */
function pathSegments(curve) {
  const pts = curve.points;
  const n = curve.closed ? pts.length : pts.length - 1;
  const segs = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i]; const b = pts[(i + 1) % pts.length];
    const l = dist(a, b);
    segs.push({ a, b, s0: s, len: l });
    s += l;
  }
  return { segs, total: s };
}

/** The parameter of a point on the curve (closest). */
export function paramOf(curve, p) {
  switch (curve.kind) {
    case 'seg': { const d = sub(curve.b, curve.a); const l2 = dot(d, d) || 1; return Math.max(0, Math.min(1, dot(sub(p, curve.a), d) / l2)); }
    case 'path': {
      const { segs } = pathSegments(curve);
      let best = 0; let bestD = Infinity;
      for (const seg of segs) {
        const d = sub(seg.b, seg.a); const l2 = dot(d, d) || 1;
        const t = Math.max(0, Math.min(1, dot(sub(p, seg.a), d) / l2));
        const q = add(seg.a, mul(d, t));
        if (dist(q, p) < bestD) { bestD = dist(q, p); best = seg.s0 + t * seg.len; }
      }
      return best;
    }
    case 'circle': return normDeg(angleOf(curve.c, p));
    case 'arc': return sweep(curve.start, angleOf(curve.c, p));
    default: return 0;
  }
}

/** Edges other entities cut with: lines (segments) and circles / arcs, from their primitives. */
export function cuttersOf(prims) {
  const out = [];
  for (const prim of prims) {
    if (prim.kind === 'line') out.push({ kind: 'seg', a: prim.a, b: prim.b });
    else if (prim.kind === 'poly') {
      const pts = prim.points;
      const n = prim.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < n; i++) out.push({ kind: 'seg', a: pts[i], b: pts[(i + 1) % pts.length] });
    } else if (prim.kind === 'circle') out.push({ kind: 'circle', c: prim.c, r: prim.r });
    else if (prim.kind === 'arc') out.push({ kind: 'arc', c: prim.c, r: prim.r, start: prim.start, end: prim.end });
  }
  return out;
}

/** Points where a segment meets a cutter. */
function segHits(a, b, cut) {
  if (cut.kind === 'seg') {
    const r = sub(b, a); const s = sub(cut.b, cut.a);
    const den = cross(r, s);
    if (Math.abs(den) < 1e-12) return [];
    const t = cross(sub(cut.a, a), s) / den;
    const u = cross(sub(cut.a, a), r) / den;
    return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS ? [add(a, mul(r, t))] : [];
  }
  const pts = intersectSegmentCircle(a, b, cut.c, cut.r);
  return cut.kind === 'arc' ? pts.filter((q) => angleOnArc(angleOf(cut.c, q), cut.start, cut.end)) : pts;
}

/** Points where a circle (of the target) meets a cutter. */
function circleHits(c, r, cut) {
  if (cut.kind === 'seg') return intersectSegmentCircle(cut.a, cut.b, c, r);
  const pts = intersectCircles(c, r, cut.c, cut.r);
  return cut.kind === 'arc' ? pts.filter((q) => angleOnArc(angleOf(cut.c, q), cut.start, cut.end)) : pts;
}

/** Parameters where the cutters cross the target curve, sorted. */
export function cutParams(curve, cutters) {
  const ps = [];
  if (curve.kind === 'seg') {
    for (const cut of cutters) for (const q of segHits(curve.a, curve.b, cut)) ps.push(paramOf(curve, q));
  } else if (curve.kind === 'path') {
    const { segs } = pathSegments(curve);
    for (const seg of segs) for (const cut of cutters) for (const q of segHits(seg.a, seg.b, cut)) ps.push(seg.s0 + dist(seg.a, q));
  } else {
    for (const cut of cutters) for (const q of circleHits(curve.c, curve.r, cut)) {
      if (curve.kind === 'arc' && !angleOnArc(angleOf(curve.c, q), curve.start, curve.end)) continue;
      ps.push(paramOf(curve, q));
    }
  }
  return [...new Set(ps.map((v) => Math.round(v * 1e9) / 1e9))].sort((x, y) => x - y);
}

/** The points of a path between two parameters (s0 < s1; a closed path may wrap past its end). */
function pathBetween(curve, s0, s1) {
  const { segs, total } = pathSegments(curve);
  const at = (s) => {
    const v = curve.closed ? ((s % total) + total) % total : s;
    const seg = segs.find((g) => v <= g.s0 + g.len + 1e-9) ?? segs[segs.length - 1];
    const t = seg.len ? (v - seg.s0) / seg.len : 0;
    return add(seg.a, mul(sub(seg.b, seg.a), t));
  };
  const out = [at(s0)];
  const marks = [];
  for (const g of segs) { marks.push(g.s0); if (curve.closed) marks.push(g.s0 + total); }
  for (const m of marks.sort((x, y) => x - y)) if (m > s0 + 1e-9 && m < s1 - 1e-9) out.push(at(m));
  out.push(at(s1));
  return out;
}

// ───────────────────────── trim

/**
 * Trims entity e at the pick point p against cutting entities (their primitives):
 * the piece between the nearest cuts on either side of p goes. Returns the
 * pieces that stay (raw data, possibly none), or null when nothing cuts it.
 */
export function trimEntity(e, p, cutterPrims) {
  const curve = curveOf(e);
  if (!curve) return null;
  const cuts = cutParams(curve, cuttersOf(cutterPrims));
  const at = paramOf(curve, p);
  const st = style(e);
  if (curve.kind === 'seg') {
    const inner = cuts.filter((t) => t > EPS && t < 1 - EPS);
    if (!inner.length) return null;
    const lo = Math.max(0, ...inner.filter((t) => t < at));
    const hi = Math.min(1, ...inner.filter((t) => t > at));
    const P = (t) => add(curve.a, mul(sub(curve.b, curve.a), t));
    const out = [];
    if (lo > EPS) out.push({ type: 'line', ...st, x1: curve.a.x, y1: curve.a.y, x2: P(lo).x, y2: P(lo).y });
    if (hi < 1 - EPS) out.push({ type: 'line', ...st, x1: P(hi).x, y1: P(hi).y, x2: curve.b.x, y2: curve.b.y });
    return out;
  }
  if (curve.kind === 'arc') {
    const total = sweep(curve.start, curve.end);
    const inner = cuts.filter((u) => u > EPS && u < total - EPS);
    if (!inner.length) return null;
    const lo = Math.max(0, ...inner.filter((u) => u < at));
    const hi = Math.min(total, ...inner.filter((u) => u > at));
    const out = [];
    if (lo > EPS) out.push({ type: 'arc', ...st, cx: curve.c.x, cy: curve.c.y, r: curve.r, start: curve.start, end: normDeg(curve.start + lo) });
    if (hi < total - EPS) out.push({ type: 'arc', ...st, cx: curve.c.x, cy: curve.c.y, r: curve.r, start: normDeg(curve.start + hi), end: curve.end });
    return out;
  }
  if (curve.kind === 'circle') {
    if (cuts.length < 2) return null;
    // The neighbours of the pick round the circle; what stays runs from the next cut on to the previous.
    const after = cuts.find((a) => a > at) ?? cuts[0];
    const before = [...cuts].reverse().find((a) => a < at) ?? cuts[cuts.length - 1];
    return [{ type: 'arc', ...st, cx: curve.c.x, cy: curve.c.y, r: curve.r, start: after, end: before }];
  }
  // Paths.
  const { total } = pathSegments(curve);
  if (curve.closed) {
    if (cuts.length < 2) return null;
    const after = cuts.find((s) => s > at) ?? cuts[0] + total;
    let before = [...cuts].reverse().find((s) => s < at) ?? cuts[cuts.length - 1] - total;
    if (before > after) before -= total;
    const from = after; const to = before + total;
    return [{ type: 'polyline', ...st, points: pathBetween(curve, from, to), closed: false }];
  }
  const inner = cuts.filter((s) => s > EPS && s < total - EPS);
  if (!inner.length) return null;
  const lo = Math.max(0, ...inner.filter((s) => s < at));
  const hi = Math.min(total, ...inner.filter((s) => s > at));
  const out = [];
  if (lo > EPS) out.push({ type: 'polyline', ...st, points: pathBetween(curve, 0, lo), closed: false });
  if (hi < total - EPS) out.push({ type: 'polyline', ...st, points: pathBetween(curve, hi, total), closed: false });
  return out;
}

// ───────────────────────── extend

/** First point where a ray (from o along unit d) meets a cutter, beyond a small distance. */
function rayHit(o, d, cutters) {
  let best = null;
  for (const cut of cutters) {
    let cands = [];
    if (cut.kind === 'seg') {
      const s = sub(cut.b, cut.a);
      const den = cross(d, s);
      if (Math.abs(den) < 1e-12) continue;
      const t = cross(sub(cut.a, o), s) / den;
      const u = cross(sub(cut.a, o), d) / den;
      if (u >= -EPS && u <= 1 + EPS) cands = [t];
    } else {
      const f = sub(o, cut.c);
      const b = dot(f, d); const c = dot(f, f) - cut.r * cut.r;
      const disc = b * b - c;
      if (disc < 0) continue;
      for (const t of [-b - Math.sqrt(disc), -b + Math.sqrt(disc)]) {
        if (cut.kind === 'arc' && !angleOnArc(angleOf(cut.c, add(o, mul(d, t))), cut.start, cut.end)) continue;
        cands.push(t);
      }
    }
    for (const t of cands) if (t > 1e-6 && (!best || t < best)) best = t;
  }
  return best === null ? null : add(o, mul(d, best));
}

/** Extends the end of e nearest p up to the next boundary edge. Returns the new raw data or null. */
export function extendEntity(e, p, boundaryPrims) {
  const cutters = cuttersOf(boundaryPrims);
  const st = style(e);
  if (e.type === 'line') {
    const a = { x: e.x1, y: e.y1 }; const b = { x: e.x2, y: e.y2 };
    const atEnd = dist(p, b) <= dist(p, a);
    const from = atEnd ? b : a;
    const d = norm(atEnd ? sub(b, a) : sub(a, b));
    const hit = rayHit(from, d, cutters);
    if (!hit) return null;
    return atEnd ? { type: 'line', ...st, x1: a.x, y1: a.y, x2: hit.x, y2: hit.y } : { type: 'line', ...st, x1: hit.x, y1: hit.y, x2: b.x, y2: b.y };
  }
  if (e.type === 'polyline' && !e.closed && e.points.length >= 2) {
    const pts = e.points.map((q) => ({ ...q }));
    const atEnd = dist(p, pts[pts.length - 1]) <= dist(p, pts[0]);
    const [prev, last] = atEnd ? [pts[pts.length - 2], pts[pts.length - 1]] : [pts[1], pts[0]];
    const hit = rayHit(last, norm(sub(last, prev)), cutters);
    if (!hit) return null;
    if (atEnd) pts[pts.length - 1] = hit; else pts[0] = hit;
    return { type: 'polyline', ...st, points: pts, closed: false };
  }
  if (e.type === 'arc') {
    const c = { x: e.cx, y: e.cy };
    const atEnd = dist(p, { x: c.x + e.r * Math.cos((e.end * Math.PI) / 180), y: c.y + e.r * Math.sin((e.end * Math.PI) / 180) }) <= dist(p, { x: c.x + e.r * Math.cos((e.start * Math.PI) / 180), y: c.y + e.r * Math.sin((e.start * Math.PI) / 180) });
    const hits = cutters.flatMap((cut) => circleHits(c, e.r, cut)).map((q) => normDeg(angleOf(c, q)));
    // The nearest crossing beyond the end (counter-clockwise) or before the start (clockwise).
    const gap = (a) => (atEnd ? sweep(e.end, a) : sweep(a, e.start));
    const ok = hits.filter((a) => gap(a) > 1e-6 && gap(a) < 360 - sweep(e.start, e.end) - 1e-6).sort((x, y) => gap(x) - gap(y));
    if (!ok.length) return null;
    return atEnd ? { type: 'arc', ...st, cx: c.x, cy: c.y, r: e.r, start: e.start, end: ok[0] } : { type: 'arc', ...st, cx: c.x, cy: c.y, r: e.r, start: ok[0], end: e.end };
  }
  return null;
}

// ───────────────────────── fillet and chamfer (two lines)

/**
 * The corner of two lines, each kept on the side its pick point is on:
 * { x (the corner), u1, u2 (unit directions from it along the kept parts), far1, far2 (their far ends) }.
 */
function corner(l1, p1, l2, p2) {
  const a1 = { x: l1.x1, y: l1.y1 }; const b1 = { x: l1.x2, y: l1.y2 };
  const a2 = { x: l2.x1, y: l2.y1 }; const b2 = { x: l2.x2, y: l2.y2 };
  const r = sub(b1, a1); const s = sub(b2, a2);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-12) return null;
  const x = add(a1, mul(r, cross(sub(a2, a1), s) / den));
  const side = (a, b, p) => {
    const d = norm(sub(b, a));
    const u = dot(sub(p, x), d) >= 0 ? d : mul(d, -1);
    // The far end: the end of the line on the kept side, away from the corner.
    const far = dot(sub(a, x), u) > dot(sub(b, x), u) ? a : b;
    return { u, far };
  };
  const one = side(a1, b1, p1);
  const two = side(a2, b2, p2);
  return { x, u1: one.u, u2: two.u, far1: one.far, far2: two.far };
}

/** Fillet of two lines (radius 0: the lines meet at the corner). Returns [line1, line2, arc?] or null. */
export function filletLines(l1, p1, l2, p2, radius) {
  const k = corner(l1, p1, l2, p2);
  if (!k) return null;
  const line = (e, from, to) => ({ type: 'line', ...style(e), x1: from.x, y1: from.y, x2: to.x, y2: to.y });
  if (!(radius > 0)) return [line(l1, k.far1, k.x), line(l2, k.far2, k.x)];
  const cos = Math.max(-1, Math.min(1, dot(k.u1, k.u2)));
  const theta = Math.acos(cos);
  if (theta < 1e-6 || theta > Math.PI - 1e-6) return null;
  const d = radius / Math.tan(theta / 2);
  if (d > dist(k.x, k.far1) + 1e-9 || d > dist(k.x, k.far2) + 1e-9) return null;
  const t1 = add(k.x, mul(k.u1, d));
  const t2 = add(k.x, mul(k.u2, d));
  const bis = norm(add(k.u1, k.u2));
  const c = add(k.x, mul(bis, radius / Math.sin(theta / 2)));
  let start = angleOf(c, t1);
  let end = angleOf(c, t2);
  if (sweep(start, end) > 180) [start, end] = [end, start];
  return [line(l1, k.far1, t1), line(l2, k.far2, t2), { type: 'arc', ...style(l1), cx: c.x, cy: c.y, r: radius, start, end }];
}

/** Chamfer of two lines: d1 along the first, d2 along the second from the corner. */
export function chamferLines(l1, p1, l2, p2, d1, d2 = d1) {
  const k = corner(l1, p1, l2, p2);
  if (!k || !(d1 > 0) || !(d2 > 0)) return null;
  if (d1 > dist(k.x, k.far1) + 1e-9 || d2 > dist(k.x, k.far2) + 1e-9) return null;
  const t1 = add(k.x, mul(k.u1, d1));
  const t2 = add(k.x, mul(k.u2, d2));
  const line = (e, from, to) => ({ type: 'line', ...style(e), x1: from.x, y1: from.y, x2: to.x, y2: to.y });
  return [line(l1, k.far1, t1), line(l2, k.far2, t2), line(l1, t1, t2)];
}

/** Rounds (radius) or cuts (chamfer) one corner of a polyline, the vertex nearest p. */
export function filletPolylineVertex(e, p, radius, chamfer = false) {
  const pts = e.points;
  const n = pts.length;
  let index = -1; let best = Infinity;
  pts.forEach((q, i) => { if ((e.closed || (i > 0 && i < n - 1)) && dist(q, p) < best) { best = dist(q, p); index = i; } });
  if (index < 0 || !(radius > 0)) return null;
  const prev = pts[(index - 1 + n) % n]; const v = pts[index]; const next = pts[(index + 1) % n];
  const u1 = norm(sub(prev, v)); const u2 = norm(sub(next, v));
  const theta = Math.acos(Math.max(-1, Math.min(1, dot(u1, u2))));
  if (theta < 1e-6 || theta > Math.PI - 1e-6) return null;
  const d = chamfer ? radius : radius / Math.tan(theta / 2);
  if (d > len(sub(prev, v)) || d > len(sub(next, v))) return null;
  const t1 = add(v, mul(u1, d)); const t2 = add(v, mul(u2, d));
  let mid = [t1, t2];
  if (!chamfer) {
    const c = add(v, mul(norm(add(u1, u2)), radius / Math.sin(theta / 2)));
    let a0 = angleOf(c, t1); let a1 = angleOf(c, t2);
    const ccw = sweep(a0, a1) <= 180;
    if (!ccw) [a0, a1] = [a1, a0];
    const arc = arcPoints(c.x, c.y, radius, a0, a1, 5);
    mid = ccw ? arc : arc.reverse();
  }
  return { type: 'polyline', ...style(e), points: [...pts.slice(0, index), ...mid, ...pts.slice(index + 1)], closed: e.closed };
}
