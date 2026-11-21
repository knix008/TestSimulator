// More sketch tools: convert entities (the body's edges lying in the sketch plane become sketch curves),
// intersection curve (where the sketch plane cuts the body), and move / copy / rotate / scale of sketch
// entities. Sketch data only, plus the kernel for reading the body.
import { rep } from './kernel.js';
import { addArc, addCircle, addLine, byId, newSketchId, pointsOf, ORIGIN, DIMENSIONS } from './sketch.js';
import { addSpline } from './sketchtools.js';
import { circleOfEdge } from './advanced.js';
import { sectionOf } from './part-more.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vec = (v) => (Array.isArray(v) ? v : [v.x, v.y, v.z]);
const toUV = (fr, p) => { const d = sub(p, fr.origin); return [dot(d, fr.xDir), dot(d, fr.yDir)]; };
const offPlane = (fr, p) => Math.abs(dot(sub(p, fr.origin), fr.normal));

/** An existing sketch point at (x, y) (so converted loops stay joined), or a new one. */
function pointAt(sketch, x, y) {
  const tol = 1e-6;
  const found = sketch.entities.find((e) => e.type === 'point' && Math.abs(e.x - x) < tol && Math.abs(e.y - y) < tol);
  if (found) return found.id;
  const p = { id: newSketchId('p'), type: 'point', x, y };
  sketch.entities.push(p);
  return p.id;
}

/** Sketch curves from body edges (all of them must lie in the sketch plane); returns the new entities. */
export function edgesToSketch(sketch, fr, edges) {
  const made = [];
  for (const edge of edges) {
    const a = toUV(fr, vec(edge.startPoint)); const b = toUV(fr, vec(edge.endPoint));
    if (edge.geomType === 'LINE') {
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) continue;
      made.push(addLine(sketch, 0, 0, 0, 0, { from: pointAt(sketch, ...a), to: pointAt(sketch, ...b) }));
      continue;
    }
    if (edge.geomType === 'CIRCLE') {
      const c3 = circleOfEdge(edge);
      const c = toUV(fr, c3.centre);
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-7) { made.push(addCircle(sketch, 0, 0, c3.radius, { center: pointAt(sketch, ...c) })); continue; }
      // Counter-clockwise in the sketch from p1 to p2: the edge's middle decides which way round.
      const m = toUV(fr, vec(edge.pointAt(0.5)));
      const ang = (p) => Math.atan2(p[1] - c[1], p[0] - c[0]);
      const span = (from, to) => { let d = to - from; while (d < 0) d += Math.PI * 2; return d; };
      const ccw = span(ang(a), ang(m)) < span(ang(a), ang(b));
      const [p1, p2] = ccw ? [a, b] : [b, a];
      made.push(addArc(sketch, 0, 0, c3.radius, ang(p1), ang(p2), { center: pointAt(sketch, ...c), from: pointAt(sketch, ...p1), to: pointAt(sketch, ...p2) }));
      continue;
    }
    // Any other curve: a spline through points along it.
    const pts = Array.from({ length: 9 }, (_, i) => toUV(fr, vec(edge.pointAt(i / 8))));
    const ids = pts.map((p, i) => (i === 0 || i === pts.length - 1 ? pointAt(sketch, ...p) : undefined));
    made.push(addSpline(sketch, pts, { ids }));
  }
  return made;
}

/**
 * Convert entities: the body's edges lying in the sketch plane (a face the sketch is on, its holes …)
 * become sketch curves. `faces` (optional) limits it to the edges of those faces.
 */
export function convertEntities(sketch, fr, body, { faces = null } = {}) {
  if (!body) return [];
  const pool = faces?.length ? faces.flatMap((f) => f.edges) : body.edges;
  const seen = [];
  const inPlane = pool.filter((e) => {
    if (seen.some((x) => x.isSame(e))) return false;
    seen.push(e);
    return [0, 0.25, 0.5, 0.75, 1].every((t) => offPlane(fr, vec(e.pointAt(t))) < 1e-5);
  });
  return edgesToSketch(sketch, fr, inPlane);
}

/** Intersection curve: where the sketch plane cuts the body, as sketch curves. */
export function intersectionEntities(sketch, fr, body) {
  const R = rep();
  if (!body) return [];
  const [lo, hi] = body.boundingBox.bounds;
  const big = Math.hypot(...sub(hi, lo)) * 4 + Math.hypot(...lo) + Math.hypot(...hi) + 10;
  const plane = R.drawRectangle(big, big).sketchOnPlane(new R.Plane(fr.origin, fr.xDir, fr.normal)).face();
  let edges = [];
  try { edges = sectionOf(body.clone(), plane).edges; } catch { edges = []; }
  return edgesToSketch(sketch, fr, edges.filter((e) => [0, 0.5, 1].every((t) => offPlane(fr, vec(e.pointAt(t))) < 1e-4)));
}

/** The point map of a transform: move (dx, dy), rotate (angle° about cx, cy) or scale (factor about cx, cy). */
function mapper(op) {
  if (op.kind === 'rotate') {
    const a = ((Number(op.angle) || 0) * Math.PI) / 180; const c = Math.cos(a); const s = Math.sin(a);
    const cx = Number(op.cx) || 0; const cy = Number(op.cy) || 0;
    return ([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
  }
  if (op.kind === 'scale') {
    const k = Number(op.factor) || 1; const cx = Number(op.cx) || 0; const cy = Number(op.cy) || 0;
    return ([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k];
  }
  const dx = Number(op.dx) || 0; const dy = Number(op.dy) || 0;
  return ([x, y]) => [x + dx, y + dy];
}

const fixLength = (v) => Math.round(v * 1e9) / 1e9;

/**
 * Moves (or with `copy` copies) sketch entities by a transform `{ kind: 'move'|'rotate'|'scale', … }`.
 * Moved entities lose the relations that tie them to what stays (and their fixes); scaling scales their
 * radii and their own dimensions. Returns the moved entities or the new copies.
 */
export function transformEntities(sketch, ids, op) {
  const fn = mapper(op);
  const k = op.kind === 'scale' ? Number(op.factor) || 1 : 1;
  const rot = op.kind === 'rotate' ? ((Number(op.angle) || 0) * Math.PI) / 180 : 0;
  if (!(k > 0)) return [];
  const src = ids.map((id) => byId(sketch, id)).filter((e) => e && e.id !== ORIGIN);
  const curves = src.filter((e) => e.type !== 'point');
  const pointIds = new Set([...src.filter((e) => e.type === 'point').map((e) => e.id), ...curves.flatMap(pointsOf)]);
  const fixShape = (n, e) => {
    if (n.r != null) n.r = fixLength(e.r * k);
    if (n.rx != null) { n.rx = fixLength(e.rx * k); n.ry = fixLength(e.ry * k); }
    if (n.type === 'ellipse') n.rot = (e.rot ?? 0) + rot;
    if (n.type === 'text') { const [x, y] = fn([e.x, e.y]); n.x = x; n.y = y; n.size = (Number(e.size) || 10) * k; n.rot = (e.rot ?? 0) + rot; }
  };
  if (op.copy) {
    const map = new Map();
    for (const id of pointIds) {
      const p = byId(sketch, id);
      if (!p) continue;
      const [x, y] = fn([p.x, p.y]);
      const q = { id: newSketchId('p'), type: 'point', x: fixLength(x), y: fixLength(y), ...(p.standalone ? { standalone: true } : {}) };
      sketch.entities.push(q);
      map.set(id, q.id);
    }
    const made = [];
    for (const e of curves) {
      const n = { ...JSON.parse(JSON.stringify(e)), id: newSketchId(e.type[0]) };
      for (const key of ['p1', 'p2', 'c']) if (n[key]) n[key] = map.get(n[key]);
      if (n.pts) n.pts = n.pts.map((id) => map.get(id));
      fixShape(n, e);
      delete n.fixed;
      sketch.entities.push(n);
      made.push(n);
    }
    for (const id of pointIds) if (!curves.some((e) => pointsOf(e).includes(id))) made.push(byId(sketch, map.get(id)));
    return made;
  }
  // The origin cannot move: curves on it get a point of their own.
  if (pointIds.has(ORIGIN)) {
    const o = byId(sketch, ORIGIN);
    const q = { id: newSketchId('p'), type: 'point', x: o.x, y: o.y };
    sketch.entities.push(q);
    for (const e of curves) { for (const key of ['p1', 'p2', 'c']) if (e[key] === ORIGIN) e[key] = q.id; if (e.pts) e.pts = e.pts.map((id) => (id === ORIGIN ? q.id : id)); }
    pointIds.delete(ORIGIN); pointIds.add(q.id);
  }
  for (const id of pointIds) {
    const p = byId(sketch, id);
    if (!p) continue;
    const [x, y] = fn([p.x, p.y]);
    p.x = fixLength(x); p.y = fixLength(y);
    delete p.fixed;
  }
  for (const e of curves) fixShape(e, { ...e });
  const moved = new Set([...pointIds, ...curves.map((e) => e.id)]);
  sketch.constraints = sketch.constraints.filter((c) => {
    const refs = [c.a, c.b, c.c].filter((x) => x != null);
    const inside = refs.filter((x) => moved.has(x)).length;
    if (!inside) return true;
    if (c.type === 'fix') return false;
    if (inside < refs.length) return false;
    if (rot && ['horizontal', 'vertical', 'hdistance', 'vdistance'].includes(c.type)) return false;
    if (k !== 1 && DIMENSIONS.includes(c.type) && c.type !== 'angle' && c.value != null) c.value *= k;
    return true;
  });
  return curves.length ? curves : [...pointIds].map((id) => byId(sketch, id));
}
