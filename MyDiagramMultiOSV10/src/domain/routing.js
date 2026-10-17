// Connector routes. An end glued to a connection point leaves the shape
// straight out of the side the point is on; an end glued to the whole shape
// ("dynamic glue", pt 'auto') picks the pair of points that face each other.
// Right-angle connectors are routed around the shapes in the way (A* over a
// sparse grid built from the shapes' edges, with a penalty per bend), straight
// connectors join the ends, curved ones are cubic Béziers. Manual bends
// (waypoints) override the automatic route. Line jumps mark where a connector
// crosses one drawn before it. Pure (unit-tested).
import { boxExit, center, dist, inflate, pointAlong, polylineLength, rectContains, rotatePoint, sampleCubic, segmentIntersection, shapeBounds, sideOfNormalized, SIDE_DIR } from './geometry.js';
import { findShape, isConnector, isGroup, layerState, pagePoints, topLevel } from './diagram.js';
import { masterById } from './stencils.js';

const STUB = 16;
const MARGIN = 12;
const BEND = 30;

/** Outward direction of a connection point of a shape (rotation included), or null at the centre. */
export function pointDirection(shape, nx, ny) {
  if (Math.abs(nx - 0.5) < 0.01 && Math.abs(ny - 0.5) < 0.01) return null;
  const side = sideOfNormalized(nx, ny);
  const dir = SIDE_DIR[side];
  if (!shape.angle) return dir;
  const r = rotatePoint(dir, { x: 0, y: 0 }, shape.angle);
  // Snap to the nearest axis for right-angle routing.
  return Math.abs(r.x) >= Math.abs(r.y) ? { x: Math.sign(r.x), y: 0 } : { x: 0, y: Math.sign(r.y) };
}

/** A glued end resolved to a point and direction; `toward` is where the other end is. */
function resolveEnd(page, end, toward) {
  if (!end) return { x: 0, y: 0, dir: null, shape: null };
  if (!end.id) return { x: end.x ?? 0, y: end.y ?? 0, dir: null, shape: null };
  const shape = findShape(page, end.id);
  if (!shape) return { x: end.x ?? 0, y: end.y ?? 0, dir: null, shape: null };
  if (isGroup(shape)) {
    const b = shapeBounds(shape);
    const exit = toward ? boxExit(b, toward) : center(b);
    return { ...exit, dir: null, shape };
  }
  const points = pagePoints(shape);
  if (typeof end.pt === 'number' && points[end.pt]) {
    const p = points[end.pt];
    return { x: p.x, y: p.y, dir: pointDirection(shape, p.nx, p.ny), shape };
  }
  // Dynamic glue: the connection point nearest to the other end (or the box edge when there are none).
  if (!points.length) {
    const exit = toward ? boxExit(shapeBounds(shape), toward) : center(shape);
    return { ...exit, dir: null, shape };
  }
  const target = toward ?? center(shape);
  let best = points[0];
  let bestScore = Infinity;
  for (const p of points) {
    const dir = pointDirection(shape, p.nx, p.ny);
    // Prefer points that face the other end.
    const facing = dir ? (target.x - p.x) * dir.x + (target.y - p.y) * dir.y : 0;
    const score = dist(p, target) - Math.max(0, facing) * 0.35;
    if (score < bestScore) { bestScore = score; best = p; }
  }
  return { x: best.x, y: best.y, dir: pointDirection(shape, best.nx, best.ny), shape };
}

/** Where a dynamic end looks for the other end: its glued point, its shape centre, or its free position. */
function roughEnd(page, end) {
  if (!end) return null;
  if (!end.id) return { x: end.x, y: end.y };
  const shape = findShape(page, end.id);
  if (!shape) return { x: end.x ?? 0, y: end.y ?? 0 };
  if (typeof end.pt === 'number' && !isGroup(shape)) {
    const p = pagePoints(shape)[end.pt];
    if (p) return p;
  }
  return center(shape);
}

/** Both ends of a connector on the page: { start, end } with directions. */
export function connectorEnds(page, connector) {
  const roughFrom = roughEnd(page, connector.from);
  const roughTo = roughEnd(page, connector.to);
  const firstBend = connector.waypoints?.[0];
  const lastBend = connector.waypoints?.at(-1);
  const start = resolveEnd(page, connector.from, firstBend ?? roughTo);
  const end = resolveEnd(page, connector.to, lastBend ?? roughFrom);
  // Two dynamic ends: settle each against the other's chosen point.
  if (connector.from?.id && connector.from.pt === 'auto' && connector.to?.id && connector.to.pt === 'auto' && !firstBend) {
    const s2 = resolveEnd(page, connector.from, end);
    const e2 = resolveEnd(page, connector.to, s2);
    return { start: s2, end: e2 };
  }
  return { start, end };
}

// ───────────────────────── right-angle routing

const EPS = 0.5;
const strictlyInside = (b, p) => p.x > b.x + EPS && p.x < b.x + b.w - EPS && p.y > b.y + EPS && p.y < b.y + b.h - EPS;
function segmentHitsBox(a, b, box) {
  if (a.x === b.x) {
    if (!(a.x > box.x + EPS && a.x < box.x + box.w - EPS)) return false;
    const y1 = Math.min(a.y, b.y); const y2 = Math.max(a.y, b.y);
    return y2 > box.y + EPS && y1 < box.y + box.h - EPS;
  }
  if (!(a.y > box.y + EPS && a.y < box.y + box.h - EPS)) return false;
  const x1 = Math.min(a.x, b.x); const x2 = Math.max(a.x, b.x);
  return x2 > box.x + EPS && x1 < box.x + box.w - EPS;
}

/** Removes points on a straight line between their neighbours, and repeats. */
export function simplify(points) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push({ x: p.x, y: p.y });
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3);
      const collinear = (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) || (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01);
      if (!collinear) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

/**
 * A right-angle path from s (leaving in direction sd) to e (arriving from direction ed),
 * avoiding the boxes `obstacles` (already padded). Returns the points.
 */
export function orthogonalRoute(s, sd, e, ed, obstacles = []) {
  const s1 = sd ? { x: s.x + sd.x * STUB, y: s.y + sd.y * STUB } : { x: s.x, y: s.y };
  const e1 = ed ? { x: e.x + ed.x * STUB, y: e.y + ed.y * STUB } : { x: e.x, y: e.y };
  const boxes = obstacles.filter((b) => !strictlyInside(b, s1) && !strictlyInside(b, e1));
  const xs = new Set([s1.x, e1.x, (s1.x + e1.x) / 2]);
  const ys = new Set([s1.y, e1.y, (s1.y + e1.y) / 2]);
  for (const b of boxes) { xs.add(b.x); xs.add(b.x + b.w); ys.add(b.y); ys.add(b.y + b.h); }
  const X = [...xs].sort((a, b) => a - b);
  const Y = [...ys].sort((a, b) => a - b);
  const key = (i, j) => i * Y.length + j;
  const blocked = (p) => boxes.some((b) => strictlyInside(b, p));
  const si = X.indexOf(s1.x); const sj = Y.indexOf(s1.y);
  const ei = X.indexOf(e1.x); const ej = Y.indexOf(e1.y);
  // A*: state = (node, incoming direction 0..3); 4 = none.
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startDir = sd ? dirs.findIndex(([dx, dy]) => dx === Math.sign(sd.x) && dy === Math.sign(sd.y)) : 4;
  const endDir = ed ? dirs.findIndex(([dx, dy]) => dx === -Math.sign(ed.x) && dy === -Math.sign(ed.y)) : 4;
  const open = [{ i: si, j: sj, d: startDir, g: 0, f: 0, prev: null }];
  const best = new Map();
  best.set(`${key(si, sj)}:${startDir}`, 0);
  const h = (i, j) => Math.abs(X[i] - X[ei]) + Math.abs(Y[j] - Y[ej]);
  let found = null;
  let guard = 0;
  while (open.length && guard++ < 20000) {
    let k = 0;
    for (let n = 1; n < open.length; n++) if (open[n].f < open[k].f) k = n;
    const cur = open.splice(k, 1)[0];
    if (cur.i === ei && cur.j === ej) {
      const extra = endDir !== 4 && cur.d !== 4 && cur.d !== endDir ? BEND : 0;
      if (!found || cur.g + extra < found.g) found = { ...cur, g: cur.g + extra };
      continue;
    }
    if (found && cur.f >= found.g) break;
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = dirs[d];
      if (cur.d !== 4 && dx === -dirs[cur.d][0] && dy === -dirs[cur.d][1]) continue; // no U-turn in place
      const ni = cur.i + dx; const nj = cur.j + dy;
      if (ni < 0 || nj < 0 || ni >= X.length || nj >= Y.length) continue;
      const a = { x: X[cur.i], y: Y[cur.j] };
      const b = { x: X[ni], y: Y[nj] };
      if (blocked(b) || boxes.some((box) => segmentHitsBox(a, b, box))) continue;
      const g = cur.g + Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + (cur.d !== 4 && cur.d !== d ? BEND : 0);
      const id = `${key(ni, nj)}:${d}`;
      if (best.has(id) && best.get(id) <= g) continue;
      best.set(id, g);
      open.push({ i: ni, j: nj, d, g, f: g + h(ni, nj), prev: cur });
    }
  }
  let middle;
  if (found) {
    middle = [];
    for (let node = found; node; node = node.prev) middle.unshift({ x: X[node.i], y: Y[node.j] });
  } else {
    // No way around: a plain elbow.
    middle = Math.abs(s1.x - e1.x) > Math.abs(s1.y - e1.y) ? [s1, { x: (s1.x + e1.x) / 2, y: s1.y }, { x: (s1.x + e1.x) / 2, y: e1.y }, e1] : [s1, { x: s1.x, y: (s1.y + e1.y) / 2 }, { x: e1.x, y: (s1.y + e1.y) / 2 }, e1];
  }
  return simplify([{ x: s.x, y: s.y }, ...middle, { x: e.x, y: e.y }]);
}

/** Right angles through manual bends: an elbow between each pair of points. */
function orthogonalThrough(points) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    if (Math.abs(a.x - b.x) > 0.01 && Math.abs(a.y - b.y) > 0.01) out.push({ x: b.x, y: a.y });
    out.push(b);
  }
  return simplify(out);
}

/** The boxes a right-angle connector goes around. */
function obstaclesFor(doc, page, connector, start, end) {
  const own = new Set([connector.id]);
  const list = [];
  const span = { x: Math.min(start.x, end.x) - 200, y: Math.min(start.y, end.y) - 200, w: Math.abs(start.x - end.x) + 400, h: Math.abs(start.y - end.y) + 400 };
  const glued = new Set([start.shape?.id, end.shape?.id].filter(Boolean));
  for (const shape of page.shapes) {
    if (own.has(shape.id) || isConnector(shape) || isGroup(shape)) continue;
    const master = masterById(shape.master);
    if (master.kind === 'container' || master.kind === 'text' || master.kind === 'lineShape' || master.kind === 'annotation') continue;
    if (!layerState(page, shape).visible) continue;
    if (!glued.has(shape.id) && !doc?.options?.avoidShapes) continue;
    const b = inflate(shapeBounds(shape), MARGIN);
    if (!glued.has(shape.id) && !(b.x < span.x + span.w && span.x < b.x + b.w && b.y < span.y + span.h && span.y < b.y + b.h)) continue;
    // A shape that holds the other end's shape (a group) is not in the way.
    if (!glued.has(shape.id) && (rectContains(b, start) || rectContains(b, end))) continue;
    list.push(b);
  }
  return list;
}

/**
 * The route of a connector: { points, curve?, start, end, label }.
 * `points` is the polyline (for curves: sampled), `curve` the Bézier controls.
 */
export function routeConnector(doc, page, connector) {
  const { start, end } = connectorEnds(page, connector);
  const way = (connector.waypoints ?? []).map((p) => ({ x: p.x, y: p.y }));
  const route = connector.route ?? 'orthogonal';
  let points;
  let curve = null;
  if (route === 'straight') {
    points = [start, ...way, end].map((p) => ({ x: p.x, y: p.y }));
  } else if (route === 'curved') {
    if (way.length) {
      // A smooth curve through the bends (Catmull-Rom as Béziers).
      const all = [start, ...way, end].map((p) => ({ x: p.x, y: p.y }));
      const segments = [];
      for (let i = 0; i < all.length - 1; i++) {
        const p0 = all[i - 1] ?? all[i]; const p1 = all[i]; const p2 = all[i + 1]; const p3 = all[i + 2] ?? p2;
        segments.push([p1, { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }, p2]);
      }
      curve = segments;
      points = segments.flatMap((seg, i) => sampleCubic(...seg, 16).slice(i ? 1 : 0));
    } else {
      const d = Math.max(40, dist(start, end) / 2.4);
      const dirS = start.dir ?? unit(start, end);
      const dirE = end.dir ?? unit(end, start);
      const c1 = { x: start.x + dirS.x * d, y: start.y + dirS.y * d };
      const c2 = { x: end.x + dirE.x * d, y: end.y + dirE.y * d };
      curve = [[{ x: start.x, y: start.y }, c1, c2, { x: end.x, y: end.y }]];
      points = sampleCubic(start, c1, c2, end, 28);
    }
  } else if (way.length) {
    const s1 = start.dir ? { x: start.x + start.dir.x * STUB, y: start.y + start.dir.y * STUB } : start;
    const e1 = end.dir ? { x: end.x + end.dir.x * STUB, y: end.y + end.dir.y * STUB } : end;
    points = orthogonalThrough([{ x: start.x, y: start.y }, s1, ...way, e1, { x: end.x, y: end.y }].map((p) => ({ x: p.x, y: p.y })));
  } else {
    points = orthogonalRoute(start, start.dir, end, end.dir, obstaclesFor(doc, page, connector, start, end));
  }
  const at = pointAlong(points, connector.textPos ?? 0.5);
  return { points, curve, start, end, label: at, length: polylineLength(points) };
}

const unit = (a, b) => { const d = dist(a, b) || 1; return { x: (b.x - a.x) / d, y: (b.y - a.y) / d }; };

/** Routes of every connector on a page, in z-order, with the crossings each one jumps over. */
export function routePage(doc, page) {
  const routes = new Map();
  const drawn = [];
  const jumps = doc?.options?.lineJumps !== false;
  for (const shape of page.shapes) {
    if (!isConnector(shape)) continue;
    const route = routeConnector(doc, page, shape);
    route.jumps = [];
    if (jumps && !route.curve && shape.style?.lineJumps !== false) {
      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1];
        const b = route.points[i];
        for (const other of drawn) {
          for (let k = 1; k < other.length; k++) {
            const hit = segmentIntersection(a, b, other[k - 1], other[k]);
            if (hit && dist(hit, a) > 6 && dist(hit, b) > 6) route.jumps.push({ segment: i, t: hit.t, x: hit.x, y: hit.y });
          }
        }
      }
    }
    if (!route.curve) drawn.push(route.points);
    routes.set(shape.id, route);
  }
  return routes;
}

/** Which shape (top-level) and connection point is under a page point, for gluing. */
export function glueTarget(page, p, { exclude = new Set(), radius = 10 } = {}) {
  let pointHit = null;
  let shapeHit = null;
  for (let i = page.shapes.length - 1; i >= 0; i--) {
    const shape = page.shapes[i];
    if (isConnector(shape) || isGroup(shape) || exclude.has(shape.id)) continue;
    if (!layerState(page, shape).visible) continue;
    const points = pagePoints(shape);
    for (let k = 0; k < points.length; k++) {
      const d = dist(points[k], p);
      if (d <= radius && (!pointHit || d < pointHit.d)) pointHit = { id: shape.id, pt: k, d, x: points[k].x, y: points[k].y };
    }
    if (!shapeHit) {
      const local = rotatePoint(p, center(shape), -(shape.angle ?? 0));
      if (local.x >= shape.x && local.x <= shape.x + shape.w && local.y >= shape.y && local.y <= shape.y + shape.h) shapeHit = { id: topLevel(page, shape.id)?.groupId ? shape.id : shape.id, pt: 'auto' };
    }
  }
  return pointHit ?? shapeHit;
}
