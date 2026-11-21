// 2D sketches: points, lines, circles and arcs on a plane, held by geometric
// relations (coincident, horizontal, parallel, tangent, …) and driving dimensions (distance, radius,
// angle). solveSketch() moves the geometry until every relation holds and reports what is fully
// defined (black), under defined (blue) or over defined (red). profiles() finds the closed regions a
// feature (extrude, revolve, cut) turns into a solid. No DOM, no kernel: plain numbers.
import { jacobian, levenbergMarquardt, nullSpaceInfo } from './solver.js';

export const ORIGIN = 'O';
export const ENTITY_TYPES = ['point', 'line', 'circle', 'arc', 'spline', 'ellipse', 'text'];
/** Geometric relations (no value) and dimensions (a value). */
export const RELATIONS = ['coincident', 'horizontal', 'vertical', 'parallel', 'perpendicular', 'tangent', 'equal', 'concentric', 'midpoint', 'pointOnLine', 'pointOnCircle', 'fix', 'symmetric', 'collinear'];
export const DIMENSIONS = ['distance', 'hdistance', 'vdistance', 'radius', 'diameter', 'angle'];

let counter = 0;
export const newSketchId = (prefix) => `${prefix}${Date.now().toString(36).slice(-4)}${(counter++).toString(36)}`;

/** An empty sketch with its fixed origin point. */
export function createSketchGeometry() {
  return { entities: [{ id: ORIGIN, type: 'point', x: 0, y: 0, fixed: true, origin: true }], constraints: [] };
}

// ───────────────────────── access

export const byId = (sketch, id) => sketch.entities.find((e) => e.id === id) ?? null;
const idx = (sketch) => new Map(sketch.entities.map((e) => [e.id, e]));

/** Point ids an entity is made of. */
export function pointsOf(e) {
  if (!e) return [];
  if (e.type === 'point') return [e.id];
  if (e.type === 'line') return [e.p1, e.p2];
  if (e.type === 'circle') return [e.c];
  if (e.type === 'arc') return [e.c, e.p1, e.p2];
  if (e.type === 'spline') return [...new Set(e.pts)];
  if (e.type === 'ellipse') return [e.c];
  return [];
}

/** Arc geometry: centre, radius, start and end angle (counter-clockwise from start to end). */
export function arcGeometry(sketch, arc, map = idx(sketch)) {
  const c = map.get(arc.c); const a = map.get(arc.p1); const b = map.get(arc.p2);
  const r = Math.hypot(a.x - c.x, a.y - c.y);
  const a0 = Math.atan2(a.y - c.y, a.x - c.x);
  let a1 = Math.atan2(b.y - c.y, b.x - c.x);
  while (a1 <= a0 + 1e-12) a1 += Math.PI * 2;
  return { cx: c.x, cy: c.y, r, a0, a1 };
}

/** Points along an entity for drawing and hit testing (sketch coordinates). */
export function polyline(sketch, e, map = idx(sketch), segments = 48) {
  if (e.type === 'line') { const a = map.get(e.p1); const b = map.get(e.p2); return [[a.x, a.y], [b.x, b.y]]; }
  if (e.type === 'circle') { const c = map.get(e.c); return Array.from({ length: segments + 1 }, (_, i) => { const t = (i / segments) * Math.PI * 2; return [c.x + e.r * Math.cos(t), c.y + e.r * Math.sin(t)]; }); }
  if (e.type === 'arc') {
    const g = arcGeometry(sketch, e, map);
    const n = Math.max(6, Math.ceil(((g.a1 - g.a0) / (Math.PI * 2)) * segments));
    return Array.from({ length: n + 1 }, (_, i) => { const t = g.a0 + ((g.a1 - g.a0) * i) / n; return [g.cx + g.r * Math.cos(t), g.cy + g.r * Math.sin(t)]; });
  }
  if (e.type === 'spline') {
    const out = [];
    for (const [p0, c1, c2, p3] of splineBeziers(sketch, e, map)) {
      for (let i = out.length ? 1 : 0; i <= 16; i++) out.push(bezierAt(p0, c1, c2, p3, i / 16));
    }
    return out;
  }
  if (e.type === 'ellipse') {
    const c = map.get(e.c); const cr = Math.cos(e.rot ?? 0); const sr = Math.sin(e.rot ?? 0);
    return Array.from({ length: segments + 1 }, (_, i) => { const t = (i / segments) * Math.PI * 2; const u = e.rx * Math.cos(t); const v = e.ry * Math.sin(t); return [c.x + u * cr - v * sr, c.y + u * sr + v * cr]; });
  }
  if (e.type === 'point') return [[e.x, e.y]];
  if (e.type === 'text') {
    // The text's box (for picking and bounds; the glyph outlines come from the font, see textOutline in features.js).
    const w = textWidth(e); const h = Number(e.size) || 10; const c = Math.cos(e.rot ?? 0); const s = Math.sin(e.rot ?? 0);
    return [[0, 0], [w, 0], [w, h], [0, h], [0, 0]].map(([u, v]) => [e.x + u * c - v * s, e.y + u * s + v * c]);
  }
  return [];
}

/** A text's approximate width (the box used for picking before the font measures it exactly). */
export const textWidth = (e) => (Number(e.size) || 10) * 0.62 * Math.max(1, String(e.text ?? '').length);

/** Whether a sketch has something a feature can turn into a solid: closed regions or text. */
export const hasRegions = (sketch) => sketch.entities.some((e) => e.type === 'text' && !e.construction && String(e.text ?? '').trim()) || profiles(sketch).length > 0;

/** A text entity (sketch text): its lower-left corner at (x, y), letters `size` high. */
export function addText(sketch, x, y, text, size = 10, rot = 0) {
  const e = { id: newSketchId('t'), type: 'text', x, y, text: String(text), size, rot };
  sketch.entities.push(e);
  return e;
}

/**
 * A spline through its points (Catmull-Rom, so it passes through every point) as cubic Bézier pieces
 * [[p0, c1, c2, p3], …]. The kernel draws the same pieces, so what is seen is what is built. A spline whose
 * first and last point are the same is closed (smooth through the join).
 */
export function splineBeziers(sketch, e, map = idx(sketch)) {
  const P = e.pts.map((id) => { const p = map.get(id); return [p.x, p.y]; });
  const closed = e.pts.length > 3 && e.pts[0] === e.pts[e.pts.length - 1];
  const n = P.length;
  const at = (i) => {
    if (closed) { const m = n - 1; return P[((i % m) + m) % m]; }
    return P[Math.max(0, Math.min(n - 1, i))];
  };
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i); const p1 = at(i + 1); const pm = at(i - 1); const p2 = at(i + 2);
    const c1 = [p0[0] + (p1[0] - pm[0]) / 6, p0[1] + (p1[1] - pm[1]) / 6];
    const c2 = [p1[0] - (p2[0] - p0[0]) / 6, p1[1] - (p2[1] - p0[1]) / 6];
    out.push([p0, c1, c2, p1]);
  }
  return out;
}

export function bezierAt(p0, c1, c2, p3, t) {
  const u = 1 - t;
  return [u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1]];
}

/** Bounding box of the sketch's geometry (origin included). */
export function sketchBounds(sketch) {
  const map = idx(sketch);
  let x0 = 0; let y0 = 0; let x1 = 0; let y1 = 0;
  for (const e of sketch.entities) for (const [x, y] of polyline(sketch, e, map, 16)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}

// ───────────────────────── building geometry

function point(sketch, x, y, extra = {}) {
  const p = { id: newSketchId('p'), type: 'point', x, y, ...extra };
  sketch.entities.push(p);
  return p;
}

/** Adds a constraint (unless the same one exists) and returns it. */
export function addConstraint(sketch, c) {
  const same = sketch.constraints.find((k) => k.type === c.type && !DIMENSIONS.includes(c.type) && ((k.a === c.a && k.b === c.b && k.c === c.c) || (k.a === c.b && k.b === c.a && !c.c)));
  if (same) return same;
  const constraint = { id: newSketchId('k'), ...c };
  sketch.constraints.push(constraint);
  return constraint;
}

/** A line from (x1,y1) to (x2,y2); `from` reuses an existing point as its start. Returns the line. */
export function addLine(sketch, x1, y1, x2, y2, { from = null, to = null, construction = false } = {}) {
  const a = from ? byId(sketch, from) : point(sketch, x1, y1);
  const b = to ? byId(sketch, to) : point(sketch, x2, y2);
  const line = { id: newSketchId('l'), type: 'line', p1: a.id, p2: b.id, ...(construction ? { construction: true } : {}) };
  sketch.entities.push(line);
  return line;
}

export function addCircle(sketch, cx, cy, r, { center = null, construction = false } = {}) {
  const c = center ? byId(sketch, center) : point(sketch, cx, cy);
  const circle = { id: newSketchId('c'), type: 'circle', c: c.id, r: Math.max(1e-3, r), ...(construction ? { construction: true } : {}) };
  sketch.entities.push(circle);
  return circle;
}

/** An arc around (cx,cy) from angle a0 to a1 (radians, counter-clockwise). */
export function addArc(sketch, cx, cy, r, a0, a1, { center = null, from = null, to = null, construction = false } = {}) {
  const c = center ? byId(sketch, center) : point(sketch, cx, cy);
  const p1 = from ? byId(sketch, from) : point(sketch, c.x + r * Math.cos(a0), c.y + r * Math.sin(a0));
  const p2 = to ? byId(sketch, to) : point(sketch, c.x + r * Math.cos(a1), c.y + r * Math.sin(a1));
  const arc = { id: newSketchId('a'), type: 'arc', c: c.id, p1: p1.id, p2: p2.id, ...(construction ? { construction: true } : {}) };
  sketch.entities.push(arc);
  return arc;
}

/** Arc through three points (start, a point on it, end). Null when they are in a line. */
export function arcThrough(sketch, [x1, y1], [xm, ym], [x2, y2], options = {}) {
  const d = 2 * (x1 * (ym - y2) + xm * (y2 - y1) + x2 * (y1 - ym));
  if (Math.abs(d) < 1e-12) return null;
  const s1 = x1 * x1 + y1 * y1; const sm = xm * xm + ym * ym; const s2 = x2 * x2 + y2 * y2;
  const cx = (s1 * (ym - y2) + sm * (y2 - y1) + s2 * (y1 - ym)) / d;
  const cy = (s1 * (x2 - xm) + sm * (x1 - x2) + s2 * (xm - x1)) / d;
  const r = Math.hypot(x1 - cx, y1 - cy);
  const ccw = (xm - x1) * (y2 - y1) - (ym - y1) * (x2 - x1) > 0;
  const ang = (x, y) => Math.atan2(y - cy, x - cx);
  // The arc runs counter-clockwise; drawn clockwise its ends swap.
  return ccw ? addArc(sketch, cx, cy, r, ang(x1, y1), ang(x2, y2), options) : addArc(sketch, cx, cy, r, ang(x2, y2), ang(x1, y1), { ...options, from: options.to ?? null, to: options.from ?? null });
}

/** A corner rectangle: four lines, joined, two horizontal and two vertical. Returns the lines. */
export function addRectangle(sketch, x1, y1, x2, y2, { construction = false } = {}) {
  const p = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].map(([x, y]) => point(sketch, x, y));
  const lines = p.map((a, i) => {
    const b = p[(i + 1) % 4];
    const line = { id: newSketchId('l'), type: 'line', p1: a.id, p2: b.id, ...(construction ? { construction: true } : {}) };
    sketch.entities.push(line);
    return line;
  });
  addConstraint(sketch, { type: 'horizontal', a: lines[0].id });
  addConstraint(sketch, { type: 'vertical', a: lines[1].id });
  addConstraint(sketch, { type: 'horizontal', a: lines[2].id });
  addConstraint(sketch, { type: 'vertical', a: lines[3].id });
  return lines;
}

/** A centre rectangle: a rectangle whose diagonals (construction) meet at (cx,cy). */
export function addCenterRectangle(sketch, cx, cy, hx, hy) {
  const lines = addRectangle(sketch, cx - hx, cy - hy, cx + hx, cy + hy);
  const c = point(sketch, cx, cy);
  const d = addLine(sketch, 0, 0, 0, 0, { from: lines[0].p1, to: lines[1].p2, construction: true });
  addConstraint(sketch, { type: 'midpoint', a: c.id, b: d.id });
  return { lines, center: c };
}

/** A regular polygon of `sides` around (cx,cy) through radius r (inscribed circle as construction). */
export function addPolygon(sketch, cx, cy, r, sides = 6, rotation = Math.PI / 2) {
  const n = Math.max(3, Math.min(64, Math.round(sides)));
  const circle = addCircle(sketch, cx, cy, r, { construction: true });
  const pts = Array.from({ length: n }, (_, i) => { const t = rotation + (i / n) * Math.PI * 2; return point(sketch, cx + r * Math.cos(t), cy + r * Math.sin(t)); });
  const lines = pts.map((a, i) => { const line = { id: newSketchId('l'), type: 'line', p1: a.id, p2: pts[(i + 1) % n].id }; sketch.entities.push(line); return line; });
  for (const p of pts) addConstraint(sketch, { type: 'pointOnCircle', a: p.id, b: circle.id });
  for (let i = 1; i < n; i++) addConstraint(sketch, { type: 'equal', a: lines[0].id, b: lines[i].id });
  return { circle, lines };
}

/** A straight slot between centres (x1,y1) and (x2,y2), width 2r: two lines and two end arcs. */
export function addSlot(sketch, x1, y1, x2, y2, r) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const nx = -Math.sin(ang) * r; const ny = Math.cos(ang) * r;
  const c1 = point(sketch, x1, y1); const c2 = point(sketch, x2, y2);
  const a = point(sketch, x1 + nx, y1 + ny); const b = point(sketch, x2 + nx, y2 + ny);
  const c = point(sketch, x2 - nx, y2 - ny); const d = point(sketch, x1 - nx, y1 - ny);
  const top = { id: newSketchId('l'), type: 'line', p1: d.id, p2: c.id };
  const bottom = { id: newSketchId('l'), type: 'line', p1: b.id, p2: a.id };
  const end = { id: newSketchId('a'), type: 'arc', c: c2.id, p1: c.id, p2: b.id };
  const start = { id: newSketchId('a'), type: 'arc', c: c1.id, p1: a.id, p2: d.id };
  sketch.entities.push(top, end, bottom, start);
  const axis = addLine(sketch, 0, 0, 0, 0, { from: c1.id, to: c2.id, construction: true });
  addConstraint(sketch, { type: 'tangent', a: top.id, b: end.id });
  addConstraint(sketch, { type: 'tangent', a: bottom.id, b: end.id });
  addConstraint(sketch, { type: 'tangent', a: top.id, b: start.id });
  addConstraint(sketch, { type: 'tangent', a: bottom.id, b: start.id });
  addConstraint(sketch, { type: 'equal', a: start.id, b: end.id });
  addConstraint(sketch, { type: 'parallel', a: top.id, b: axis.id });
  return { lines: [top, bottom], arcs: [start, end], axis };
}

/** Removes entities (and what is built on them: the lines of a deleted point, their relations). */
export function removeEntities(sketch, ids) {
  const gone = new Set(ids.filter((id) => id !== ORIGIN));
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of sketch.entities) if (!gone.has(e.id) && e.type !== 'point' && pointsOf(e).some((p) => gone.has(p))) { gone.add(e.id); grew = true; }
  }
  // Points no longer used by any remaining curve go too (unless they were standalone points not asked for).
  for (const e of sketch.entities) {
    if (gone.has(e.id) || e.type === 'point') continue;
  }
  const used = new Set(sketch.entities.filter((e) => !gone.has(e.id) && e.type !== 'point').flatMap(pointsOf));
  for (const id of [...gone]) {
    const e = byId(sketch, id);
    if (e && e.type !== 'point') for (const p of pointsOf(e)) if (!used.has(p) && !sketch.entities.some((x) => x.id === p && x.standalone)) gone.add(p);
  }
  sketch.entities = sketch.entities.filter((e) => !gone.has(e.id));
  sketch.constraints = sketch.constraints.filter((c) => ![c.a, c.b, c.c].some((x) => x && gone.has(x)));
  return gone;
}

// ───────────────────────── relations as equations

const v2 = (a, b) => [b[0] - a[0], b[1] - a[1]];
const len = (d) => Math.hypot(d[0], d[1]);
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

/** The kind of geometry for relation checks: 'point', 'line', 'circle' (also arcs), or null. */
export const geomKind = (e) => (!e ? null : e.type === 'arc' ? 'circle' : e.type);

/** Residuals of one constraint, given accessors P(id) → [x,y], R(id) → radius of a circle/arc. */
function constraintResiduals(c, s, P, R, map, K = 10) {
  const ea = map.get(c.a); const eb = c.b ? map.get(c.b) : null;
  const L = (e) => [P(e.p1), P(e.p2)];
  const center = (e) => P(e.c);
  switch (c.type) {
    case 'coincident': {
      if (geomKind(ea) === 'point' && geomKind(eb) === 'point') { const a = P(ea.id); const b = P(eb.id); return [a[0] - b[0], a[1] - b[1]]; }
      return constraintResiduals({ ...c, type: geomKind(eb) === 'line' || geomKind(ea) === 'line' ? 'pointOnLine' : 'pointOnCircle', ...(geomKind(ea) !== 'point' ? { a: c.b, b: c.a } : {}) }, s, P, R, map, K);
    }
    case 'horizontal': {
      if (ea.type === 'line') { const [a, b] = L(ea); return [b[1] - a[1]]; }
      return [P(c.a)[1] - P(c.b)[1]];
    }
    case 'vertical': {
      if (ea.type === 'line') { const [a, b] = L(ea); return [b[0] - a[0]]; }
      return [P(c.a)[0] - P(c.b)[0]];
    }
    case 'parallel': case 'collinear': {
      const [a1, a2] = L(ea); const [b1, b2] = L(eb);
      const da = v2(a1, a2); const db = v2(b1, b2);
      // Angular equations use the sine of the angle times a fixed length (the sketch's size): scaled by the
      // lines' own lengths the solver could shrink a line instead of turning it.
      const out = [(cross(da, db) / ((len(da) * len(db)) || 1)) * K];
      if (c.type === 'collinear') out.push(cross(da, v2(a1, b1)) / (len(da) || 1));
      return out;
    }
    case 'perpendicular': {
      const [a1, a2] = L(ea); const [b1, b2] = L(eb);
      const da = v2(a1, a2); const db = v2(b1, b2);
      return [(dot(da, db) / ((len(da) * len(db)) || 1)) * K];
    }
    case 'equal': {
      if (ea.type === 'line' && eb.type === 'line') { const [a1, a2] = L(ea); const [b1, b2] = L(eb); return [len(v2(a1, a2)) - len(v2(b1, b2))]; }
      return [R(ea.id) - R(eb.id)];
    }
    case 'tangent': {
      const line = ea.type === 'line' ? ea : eb.type === 'line' ? eb : null;
      if (line) {
        const curve = line === ea ? eb : ea;
        const [a, b] = L(line); const d = v2(a, b); const o = center(curve);
        return [Math.abs(cross(d, v2(a, o))) / (len(d) || 1) - R(curve.id)];
      }
      const d = len(v2(center(ea), center(eb)));
      return [c.internal ? d - Math.abs(R(ea.id) - R(eb.id)) : d - (R(ea.id) + R(eb.id))];
    }
    case 'concentric': { const a = center(ea); const b = center(eb); return [a[0] - b[0], a[1] - b[1]]; }
    case 'midpoint': {
      const p = P(c.a); const [a, b] = L(eb);
      return [p[0] - (a[0] + b[0]) / 2, p[1] - (a[1] + b[1]) / 2];
    }
    case 'pointOnLine': {
      const p = P(c.a); const [a, b] = L(eb); const d = v2(a, b);
      return [cross(d, v2(a, p)) / (len(d) || 1)];
    }
    case 'pointOnCircle': { const p = P(c.a); return [len(v2(center(eb), p)) - R(eb.id)]; }
    case 'fix': { const p = P(c.a); return [p[0] - c.x, p[1] - c.y]; }
    case 'symmetric': {
      const a = P(c.a); const b = P(c.b); const line = map.get(c.c);
      const [l1, l2] = L(line); const d = v2(l1, l2);
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      return [cross(d, v2(l1, m)) / (len(d) || 1), dot(v2(a, b), d) / (len(d) || 1)];
    }
    case 'distance': {
      const value = Number(c.value);
      if (!eb) {
        if (ea.type === 'line') { const [a, b] = L(ea); return [len(v2(a, b)) - value]; }
        return [0];
      }
      const ka = geomKind(ea); const kb = geomKind(eb);
      if (ka === 'point' && kb === 'point') return [len(v2(P(ea.id), P(eb.id))) - value];
      if (ka === 'line' && kb === 'line') { const [a1, a2] = L(ea); const [b1] = L(eb); const d = v2(a1, a2); return [Math.abs(cross(d, v2(a1, b1))) / (len(d) || 1) - value]; }
      if ((ka === 'point' && kb === 'line') || (ka === 'line' && kb === 'point')) {
        const p = P((ka === 'point' ? ea : eb).id); const [a, b] = L(ka === 'line' ? ea : eb); const d = v2(a, b);
        return [Math.abs(cross(d, v2(a, p))) / (len(d) || 1) - value];
      }
      if (ka === 'circle' && kb === 'circle') return [len(v2(center(ea), center(eb))) - value];
      if (ka === 'circle' || kb === 'circle') {
        const circle = ka === 'circle' ? ea : eb; const other = circle === ea ? eb : ea;
        if (geomKind(other) === 'point') return [len(v2(center(circle), P(other.id))) - value];
        const [a, b] = L(other); const d = v2(a, b);
        return [Math.abs(cross(d, v2(a, center(circle)))) / (len(d) || 1) - value];
      }
      return [0];
    }
    case 'hdistance': case 'vdistance': {
      const axis = c.type === 'hdistance' ? 0 : 1;
      const pa = eb ? P(anchorPoint(ea, map)) : P(ea.p1);
      const pb = eb ? P(anchorPoint(eb, map)) : P(ea.p2);
      return [(c.sign ?? 1) * (pb[axis] - pa[axis]) - Number(c.value)];
    }
    case 'radius': return [R(ea.id) - Number(c.value)];
    case 'diameter': return [2 * R(ea.id) - Number(c.value)];
    case 'angle': {
      const [a1, a2] = L(ea); const [b1, b2] = L(eb);
      const da = v2(a1, a2); const db = v2(b1, b2);
      let diff = Math.atan2(cross(da, db), dot(da, db)) - (Number(c.value) * Math.PI) / 180 * (c.sign ?? 1);
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      // Scaled to a length (the sketch's size) so it weighs like the other equations.
      return [diff * K];
    }
    default: return [];
  }
}

/** The point a horizontal/vertical dimension measures from: the point itself, a circle's centre, a line's start. */
function anchorPoint(e, map) {
  if (e.type === 'point') return e.id;
  if (e.type === 'circle' || e.type === 'arc') return e.c;
  return e.p1;
}

/** Implicit equations of the geometry itself: an arc's ends are at the same distance from its centre. */
function implicitResiduals(sketch, P) {
  const out = [];
  for (const e of sketch.entities) {
    if (e.type !== 'arc') continue;
    const c = P(e.c); const a = P(e.p1); const b = P(e.p2);
    out.push(Math.hypot(a[0] - c[0], a[1] - c[1]) - Math.hypot(b[0] - c[0], b[1] - c[1]));
  }
  return out;
}

/** The unknowns: x and y of every free point, and the radius of every circle. */
function unknowns(sketch) {
  const vars = [];
  for (const e of sketch.entities) {
    if (e.type === 'point' && !e.fixed) { vars.push({ id: e.id, key: 'x' }, { id: e.id, key: 'y' }); }
    else if (e.type === 'circle') vars.push({ id: e.id, key: 'r' });
  }
  return vars;
}

function system(sketch, { skip = null } = {}) {
  const map = idx(sketch);
  const vars = unknowns(sketch);
  const slot = new Map(vars.map((v, i) => [`${v.id}.${v.key}`, i]));
  const x0 = vars.map((v) => map.get(v.id)[v.key]);
  // A fixed length for angular equations: a tenth of the sketch's extent (at least 1 mm).
  const ext = sketch.entities.reduce((m, e) => (e.type === 'point' ? Math.max(m, Math.abs(e.x), Math.abs(e.y)) : e.type === 'circle' ? Math.max(m, e.r) : m), 0);
  const K = Math.max(1, ext / 5);
  const active = sketch.constraints.filter((c) => c !== skip && !c.driven && !c.suppressed && [c.a, c.b, c.c].every((id) => !id || map.has(id)));
  const residuals = (x) => {
    const P = (id) => { const e = map.get(id); const ix = slot.get(`${id}.x`); return ix == null ? [e.x, e.y] : [x[ix], x[ix + 1]]; };
    const R = (id) => {
      const e = map.get(id);
      if (e.type === 'circle') { const ir = slot.get(`${id}.r`); return ir == null ? e.r : x[ir]; }
      const c = P(e.c); const a = P(e.p1); return Math.hypot(a[0] - c[0], a[1] - c[1]);
    };
    const out = implicitResiduals(sketch, P);
    for (const c of active) for (const r of constraintResiduals(c, sketch, P, R, map, K)) out.push(Number.isFinite(r) ? r : 1e6);
    return out;
  };
  const apply = (x) => vars.forEach((v, i) => { map.get(v.id)[v.key] = x[i]; });
  return { vars, x0, residuals, apply, active, map };
}

/**
 * Solves the sketch in place. `drag` = { id (point), x, y }: that point is moved there first and the rest
 * follows (the point stays as close as the relations allow). Returns { ok, dof, status }:
 * status maps entity id → 'defined' | 'under' | 'over'.
 */
export function solveSketch(sketch, { drag = null } = {}) {
  const sys = system(sketch);
  let x0 = sys.x0;
  let weights = null;
  if (drag) {
    const ix = sys.vars.findIndex((v) => v.id === drag.id && v.key === 'x');
    if (ix >= 0) {
      x0 = x0.slice(); x0[ix] = drag.x; x0[ix + 1] = drag.y;
      weights = new Array(x0.length).fill(0); weights[ix] = 1e4; weights[ix + 1] = 1e4;
    }
  }
  const result = levenbergMarquardt(sys.residuals, x0, { maxIter: 200, tol: 1e-9, weights });
  // Never leave the geometry in a broken state: an unsolvable drag keeps the old positions.
  if (result.ok || !drag) sys.apply(result.x);
  else sys.apply(sys.x0);
  return { ...analyse(sketch), ok: result.ok, error: result.error };
}

/** Degrees of freedom and the state of every entity (black / blue / red in the view). */
export function analyse(sketch) {
  const sys = system(sketch);
  const r0 = sys.residuals(sys.x0);
  const status = {};
  const over = !(Math.sqrt(r0.reduce((s, v) => s + v * v, 0)) < 1e-6);
  if (!sys.vars.length) {
    for (const e of sketch.entities) status[e.id] = over ? 'over' : 'defined';
    return { dof: 0, status, over, redundant: [] };
  }
  const J = jacobian(sys.residuals, sys.x0, r0);
  const info = nullSpaceInfo(J, sys.vars.length);
  const fixedVar = new Map(sys.vars.map((v, i) => [`${v.id}.${v.key}`, info.fixed[i]]));
  const pointFixed = (id) => { const e = sys.map.get(id); if (!e || e.fixed) return true; return fixedVar.get(`${id}.x`) !== false && fixedVar.get(`${id}.y`) !== false; };
  for (const e of sketch.entities) {
    let defined = pointsOf(e).every(pointFixed);
    if (e.type === 'circle') defined = defined && fixedVar.get(`${e.id}.r`) !== false;
    status[e.id] = over ? 'over' : defined ? 'defined' : 'under';
  }
  const equations = r0.length;
  const dof = sys.vars.length - info.rank;
  return { dof, status, over, redundant: equations > info.rank ? equations - info.rank : 0 };
}

/** The current value a dimension would have (its measured value): for a new dimension and reference dimensions. */
export function measure(sketch, c) {
  const sys = system(sketch, { skip: null });
  const map = sys.map;
  const P = (id) => [map.get(id).x, map.get(id).y];
  const R = (id) => { const e = map.get(id); if (e.type === 'circle') return e.r; const cc = P(e.c); const a = P(e.p1); return Math.hypot(a[0] - cc[0], a[1] - cc[1]); };
  if (c.type === 'angle') {
    const ea = map.get(c.a); const eb = map.get(c.b);
    const da = v2(P(ea.p1), P(ea.p2)); const db = v2(P(eb.p1), P(eb.p2));
    return (Math.atan2(cross(da, db), dot(da, db)) * 180) / Math.PI;
  }
  const [r] = constraintResiduals({ ...c, value: 0, sign: c.sign ?? 1 }, sketch, P, R, map);
  return r;
}

/**
 * A new dimension on the picked entities with its measured value (so nothing moves until it is edited).
 * kind: 'auto' picks from the selection (one line → its length, a circle → its diameter, two points → distance …).
 */
export function dimensionFor(sketch, ids, kind = 'auto') {
  const map = idx(sketch);
  const ents = ids.map((id) => map.get(id)).filter(Boolean);
  const [a, b] = ents;
  if (!a) return null;
  let c = null;
  if (ents.length === 1) {
    if (a.type === 'line') c = { type: kind === 'auto' ? 'distance' : kind, a: a.id };
    else if (a.type === 'circle') c = { type: kind === 'radius' ? 'radius' : 'diameter', a: a.id };
    else if (a.type === 'arc') c = { type: kind === 'diameter' ? 'diameter' : 'radius', a: a.id };
    else return null;
  } else if (a.type === 'line' && b.type === 'line') {
    const da = v2([map.get(a.p1).x, map.get(a.p1).y], [map.get(a.p2).x, map.get(a.p2).y]);
    const db = v2([map.get(b.p1).x, map.get(b.p1).y], [map.get(b.p2).x, map.get(b.p2).y]);
    const parallel = Math.abs(cross(da, db)) / ((len(da) * len(db)) || 1) < 1e-3;
    c = parallel ? { type: 'distance', a: a.id, b: b.id } : { type: 'angle', a: a.id, b: b.id };
  } else {
    c = { type: kind === 'auto' ? 'distance' : kind, a: a.id, b: b.id };
  }
  if (c.type === 'hdistance' || c.type === 'vdistance') c.sign = 1;
  if (c.type === 'angle') c.sign = 1;
  let value = measure(sketch, c);
  if ((c.type === 'hdistance' || c.type === 'vdistance' || c.type === 'angle') && value < 0) { c.sign = -1; value = -value; }
  c.value = round(Math.abs(value));
  return c;
}

const round = (v) => Math.round(v * 1e6) / 1e6;

/**
 * Which relation can join the picked entities (for the Add Relations list): relation types that make sense
 * for the selection, in the usual order.
 */
export function relationsFor(sketch, ids) {
  const kinds = ids.map((id) => geomKind(byId(sketch, id)));
  const count = (k) => kinds.filter((x) => x === k).length;
  const n = kinds.length;
  const out = [];
  if (n === 1 && kinds[0] === 'line') out.push('horizontal', 'vertical');
  if (n === 1 && kinds[0] === 'point') out.push('fix');
  if (n === 2 && count('point') === 2) out.push('coincident', 'horizontal', 'vertical');
  if (n === 2 && count('line') === 2) out.push('parallel', 'perpendicular', 'equal', 'collinear');
  if (n === 2 && count('circle') === 2) out.push('equal', 'concentric', 'tangent');
  if (n === 2 && count('line') === 1 && count('circle') === 1) out.push('tangent');
  if (n === 2 && count('point') === 1 && count('line') === 1) out.push('coincident', 'midpoint');
  if (n === 2 && count('point') === 1 && count('circle') === 1) out.push('coincident', 'concentric');
  if (n === 3 && count('point') === 2 && count('line') === 1) out.push('symmetric');
  return out;
}

/** Adds a relation between picked entities (normalising the order the equations expect). */
export function addRelation(sketch, type, ids) {
  const map = idx(sketch);
  const ents = ids.map((id) => map.get(id));
  if (type === 'fix') { const p = ents[0]; return addConstraint(sketch, { type, a: p.id, x: p.x, y: p.y }); }
  if (type === 'horizontal' || type === 'vertical') return addConstraint(sketch, { type, a: ids[0], ...(ids[1] ? { b: ids[1] } : {}) });
  if (type === 'symmetric') {
    const pts = ents.filter((e) => e.type === 'point'); const line = ents.find((e) => e.type === 'line');
    return addConstraint(sketch, { type, a: pts[0].id, b: pts[1].id, c: line.id });
  }
  if (type === 'midpoint' || type === 'coincident') {
    const p = ents.find((e) => e.type === 'point'); const other = ents.find((e) => e !== p);
    if (type === 'coincident' && other.type !== 'point') return addConstraint(sketch, { type: geomKind(other) === 'line' ? 'pointOnLine' : 'pointOnCircle', a: p.id, b: other.id });
    return addConstraint(sketch, { type, a: p.id, b: other.id });
  }
  if (type === 'concentric') {
    const [a, b] = ents;
    if (a.type === 'point') return addConstraint(sketch, { type: 'coincident', a: a.id, b: b.c });
    if (b.type === 'point') return addConstraint(sketch, { type: 'coincident', a: b.id, b: a.c });
    return addConstraint(sketch, { type, a: a.id, b: b.id });
  }
  if (type === 'tangent') {
    const [a, b] = ents;
    let internal = false;
    if (a.type !== 'line' && b.type !== 'line') {
      const ca = map.get(a.c); const cb = map.get(b.c);
      const ra = a.type === 'circle' ? a.r : Math.hypot(map.get(a.p1).x - ca.x, map.get(a.p1).y - ca.y);
      const rb = b.type === 'circle' ? b.r : Math.hypot(map.get(b.p1).x - cb.x, map.get(b.p1).y - cb.y);
      const d = Math.hypot(ca.x - cb.x, ca.y - cb.y);
      internal = Math.abs(d - Math.abs(ra - rb)) < Math.abs(d - (ra + rb));
    }
    return addConstraint(sketch, { type, a: a.id, b: b.id, ...(internal ? { internal: true } : {}) });
  }
  return addConstraint(sketch, { type, a: ids[0], b: ids[1] });
}

// ───────────────────────── automatic relations while drawing (inference)

/** A new line's relations: horizontal or vertical when drawn so (within `tol` radians). */
export function autoRelationsForLine(sketch, line, tol = 0.035) {
  const a = byId(sketch, line.p1); const b = byId(sketch, line.p2);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const near = (t) => Math.abs(Math.atan2(Math.sin(ang - t), Math.cos(ang - t))) < tol;
  if (near(0) || near(Math.PI)) addConstraint(sketch, { type: 'horizontal', a: line.id });
  else if (near(Math.PI / 2) || near(-Math.PI / 2)) addConstraint(sketch, { type: 'vertical', a: line.id });
}

/** Merges point `from` into point `into` (a coincident end: the curves of `from` now use `into`). */
export function mergePoints(sketch, from, into) {
  if (from === into || from === ORIGIN) return;
  for (const e of sketch.entities) for (const k of ['p1', 'p2', 'c']) if (e[k] === from) e[k] = into;
  for (const c of sketch.constraints) for (const k of ['a', 'b', 'c']) if (c[k] === from) c[k] = into;
  sketch.entities = sketch.entities.filter((e) => e.id !== from);
  sketch.constraints = sketch.constraints.filter((c) => !(c.type === 'coincident' && c.a === c.b));
}

// ───────────────────────── hit testing (sketch coordinates)

function distToSegment(p, a, b) {
  const d = v2(a, b); const l2 = dot(d, d);
  const t = l2 ? Math.max(0, Math.min(1, dot(v2(a, p), d) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + d[0] * t), p[1] - (a[1] + d[1] * t));
}

/** The entity nearest (x,y) within `tol` (points win over curves). Returns { id, distance } or null. */
export function hitTest(sketch, x, y, tol, { skip = null } = {}) {
  const map = idx(sketch);
  let best = null;
  for (const e of sketch.entities) {
    if (skip?.has?.(e.id)) continue;
    let d;
    if (e.type === 'point') d = Math.hypot(e.x - x, e.y - y) - tol * 0.45;
    else {
      const pts = polyline(sketch, e, map, 64);
      d = Infinity;
      for (let i = 1; i < pts.length; i++) d = Math.min(d, distToSegment([x, y], pts[i - 1], pts[i]));
    }
    if (d <= tol && (!best || d < best.distance)) best = { id: e.id, distance: d };
  }
  return best;
}

// ───────────────────────── closed regions (profiles)

/**
 * The closed regions of the sketch: [{ outer, holes }], each loop { segs, area, points } where segs are
 * { kind: 'line', a: [x,y], b: [x,y] } | { kind: 'arc', c, r, a0, a1, from, to, mid } | { kind: 'circle', c, r }.
 * Construction geometry is ignored. Open chains and loose lines do not count.
 */
export function profiles(sketch) {
  const map = idx(sketch);
  const curves = sketch.entities.filter((e) => !e.construction && ['line', 'arc', 'circle', 'spline', 'ellipse'].includes(e.type));
  const loops = [];
  // Circles and ellipses are closed by themselves.
  for (const e of curves.filter((x) => x.type === 'circle')) {
    const c = map.get(e.c);
    loops.push({ segs: [{ kind: 'circle', c: [c.x, c.y], r: e.r }], area: Math.PI * e.r * e.r, points: polyline(sketch, e, map, 64).slice(0, -1) });
  }
  for (const e of curves.filter((x) => x.type === 'ellipse')) {
    const c = map.get(e.c);
    loops.push({ segs: [{ kind: 'ellipse', c: [c.x, c.y], rx: e.rx, ry: e.ry, rot: e.rot ?? 0 }], area: Math.PI * e.rx * e.ry, points: polyline(sketch, e, map, 64).slice(0, -1) });
  }
  // A closed spline is a loop of its own.
  for (const e of curves.filter((x) => x.type === 'spline' && x.pts[0] === x.pts[x.pts.length - 1])) {
    const bez = splineBeziers(sketch, e, map);
    const points = polyline(sketch, e, map).slice(0, -1);
    let area = polygonArea(points);
    let seg = { kind: 'spline', beziers: bez, from: bez[0][0], to: bez.at(-1)[3] };
    if (area < 0) { seg = reverseSpline(seg); area = -area; points.reverse(); }
    loops.push({ segs: [seg], area, points });
  }
  // Vertices: the curves' end points, merged by position.
  const size = Math.max(1, ...curves.flatMap((e) => pointsOf(e).map((id) => Math.max(Math.abs(map.get(id).x), Math.abs(map.get(id).y)))));
  const tol = size * 1e-7 + 1e-9;
  const verts = [];
  const vertexOf = (id) => {
    const p = map.get(id);
    let v = verts.find((q) => Math.hypot(q.x - p.x, q.y - p.y) < tol);
    if (!v) { v = { x: p.x, y: p.y, out: [] }; verts.push(v); }
    return v;
  };
  const edges = [];
  for (const e of curves) {
    if (e.type === 'line') {
      const a = vertexOf(e.p1); const b = vertexOf(e.p2);
      if (a === b) continue;
      edges.push({ e, a, b, kind: 'line' });
    } else if (e.type === 'arc') {
      const g = arcGeometry(sketch, e, map);
      const a = vertexOf(e.p1); const b = vertexOf(e.p2);
      if (a === b) continue;
      edges.push({ e, a, b, kind: 'arc', g });
    } else if (e.type === 'spline' && e.pts.length >= 2) {
      const a = vertexOf(e.pts[0]); const b = vertexOf(e.pts[e.pts.length - 1]);
      if (a === b) continue;
      edges.push({ e, a, b, kind: 'spline', bez: splineBeziers(sketch, e, map) });
    }
  }
  // Loose ends never close a region: drop edges with an end used once, again and again.
  let alive = edges.slice();
  for (;;) {
    const degree = new Map();
    for (const ed of alive) { degree.set(ed.a, (degree.get(ed.a) ?? 0) + 1); degree.set(ed.b, (degree.get(ed.b) ?? 0) + 1); }
    const next = alive.filter((ed) => degree.get(ed.a) > 1 && degree.get(ed.b) > 1);
    if (next.length === alive.length) break;
    alive = next;
  }
  // Half edges with the direction they leave their start vertex.
  const halves = [];
  for (const ed of alive) {
    const h1 = { ed, from: ed.a, to: ed.b, fwd: true };
    const h2 = { ed, from: ed.b, to: ed.a, fwd: false };
    h1.twin = h2; h2.twin = h1;
    for (const h of [h1, h2]) { h.angle = leaveAngle(h); h.from.out.push(h); halves.push(h); }
  }
  for (const v of verts) v.out.sort((p, q) => p.angle - q.angle);
  const used = new Set();
  for (const start of halves) {
    if (used.has(start)) continue;
    const cycle = [];
    let h = start;
    let guard = 0;
    while (h && !used.has(h) && guard++ < 10000) {
      used.add(h);
      cycle.push(h);
      // At the end vertex, the next edge clockwise after the way back: the face stays on the left.
      const out = h.to.out;
      const back = out.indexOf(h.twin);
      h = out[(back - 1 + out.length) % out.length];
    }
    if (h !== start) continue;
    const segs = cycle.map(segmentOf);
    const points = segs.flatMap(segmentPoints);
    const area = polygonArea(points);
    if (area > tol) loops.push({ segs, area, points });
  }
  // Nesting: a loop inside another (an odd number of times) is a hole of the smallest loop around it.
  loops.sort((p, q) => q.area - p.area);
  for (const loop of loops) {
    const probe = interiorPoint(loop);
    loop.parent = null;
    for (const other of loops) {
      if (other === loop || other.area <= loop.area + tol) continue;
      if (pointInPolygon(probe, other.points) && (!loop.parent || other.area < loop.parent.area)) loop.parent = other;
    }
  }
  const depth = (loop) => (loop.parent ? 1 + depth(loop.parent) : 0);
  const regions = [];
  for (const loop of loops) {
    if (depth(loop) % 2) continue;
    regions.push({ outer: loop, holes: loops.filter((h) => h.parent === loop) });
  }
  return regions;
}

function leaveAngle(h) {
  const { ed } = h;
  if (ed.kind === 'line') return Math.atan2(h.to.y - h.from.y, h.to.x - h.from.x);
  if (ed.kind === 'spline') {
    // Leaves along its first control leg (forward) or its last one (backward).
    const b = h.fwd ? ed.bez[0] : ed.bez.at(-1);
    const [p, q] = h.fwd ? [b[0], b[1][0] === b[0][0] && b[1][1] === b[0][1] ? b[2] : b[1]] : [b[3], b[2][0] === b[3][0] && b[2][1] === b[3][1] ? b[1] : b[2]];
    return Math.atan2(q[1] - p[1], q[0] - p[0]);
  }
  // An arc leaves along its tangent: counter-clockwise from its start, clockwise from its end.
  const { cx, cy } = ed.g;
  const t = Math.atan2(h.from.y - cy, h.from.x - cx);
  return h.fwd ? Math.atan2(Math.cos(t), -Math.sin(t)) : Math.atan2(-Math.cos(t), Math.sin(t));
}

function segmentOf(h) {
  const { ed } = h;
  const a = [h.from.x, h.from.y]; const b = [h.to.x, h.to.y];
  if (ed.kind === 'line') return { kind: 'line', a, b };
  if (ed.kind === 'spline') { const seg = { kind: 'spline', beziers: ed.bez, from: ed.bez[0][0], to: ed.bez.at(-1)[3] }; return h.fwd ? seg : reverseSpline(seg); }
  const { cx, cy, r, a0, a1 } = ed.g;
  const m = (a0 + a1) / 2;
  return { kind: 'arc', c: [cx, cy], r, a0, a1, ccw: h.fwd, from: a, to: b, mid: [cx + r * Math.cos(m), cy + r * Math.sin(m)] };
}

function reverseSpline(s) {
  const beziers = s.beziers.slice().reverse().map(([p0, c1, c2, p3]) => [p3, c2, c1, p0]);
  return { kind: 'spline', beziers, from: beziers[0][0], to: beziers.at(-1)[3] };
}

function segmentPoints(s) {
  if (s.kind === 'line') return [s.a];
  if (s.kind === 'spline') { const out = []; for (const [p0, c1, c2, p3] of s.beziers) for (let i = 0; i < 12; i++) out.push(bezierAt(p0, c1, c2, p3, i / 12)); return out; }
  const n = 24;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = s.ccw ? s.a0 + ((s.a1 - s.a0) * i) / n : s.a1 - ((s.a1 - s.a0) * i) / n;
    out.push([s.c[0] + s.r * Math.cos(t), s.c[1] + s.r * Math.sin(t)]);
  }
  return out;
}

export function polygonArea(points) {
  let s = 0;
  for (let i = 0; i < points.length; i++) { const [x1, y1] = points[i]; const [x2, y2] = points[(i + 1) % points.length]; s += x1 * y2 - x2 * y1; }
  return s / 2;
}

export function pointInPolygon([x, y], pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]; const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A point just inside a loop (left of its first edge, which runs counter-clockwise). */
function interiorPoint(loop) {
  const pts = loop.points;
  const [a, b] = [pts[0], pts[1 % pts.length]];
  const d = v2(a, b); const l = len(d) || 1;
  const eps = Math.max(1e-6, Math.sqrt(Math.abs(loop.area)) * 1e-4);
  return [(a[0] + b[0]) / 2 - (d[1] / l) * eps, (a[1] + b[1]) / 2 + (d[0] / l) * eps];
}

/** Standalone points (not the ends of any curve, not the origin): hole positions. */
export function standalonePoints(sketch) {
  const used = new Set(sketch.entities.filter((e) => e.type !== 'point' && !e.construction).flatMap(pointsOf));
  const usedAny = new Set(sketch.entities.filter((e) => e.type !== 'point').flatMap(pointsOf));
  return sketch.entities.filter((e) => e.type === 'point' && !e.origin && (!usedAny.has(e.id) || (e.standalone && !used.has(e.id))));
}

/** Construction lines (for a revolve axis or a mirror line). */
export const constructionLines = (sketch) => sketch.entities.filter((e) => e.type === 'line' && e.construction);

/** A deep copy (sketches are edited on a copy; Cancel drops it). */
export const cloneSketch = (sketch) => JSON.parse(JSON.stringify(sketch));
