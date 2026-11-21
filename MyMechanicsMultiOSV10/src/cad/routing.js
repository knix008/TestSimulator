// Routing: pipes, tubes and cables along a chain of 3D points (a route's own points, or a 3D sketch / XYZ
// curve of the part).
//   pipe   a standard pipe size (PIPES: outside diameter, wall). Corners are either bent (one pipe, bend
//          radius) or get butt-weld elbows of the size (the pipe is cut into straight lengths between them);
//          weld-neck flanges can end the route.
//   tube   any outside diameter and wall, bent at the corners with the bend radius.
//   cable  a solid round cable (diameter, colour) along a smooth spline through the points.
// The centre line (straights and arcs), its length and the bill of materials are plain maths (routePath,
// routeBom); buildRoute() sweeps the hollow circular profile (outer sweep minus inner sweep) on the kernel.
import { rep } from './kernel.js';
import { PIPES } from './stdparts.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return mul(a, 1 / l); };
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const code = (c, params = {}) => Object.assign(new Error(c), { code: c, params });

/** The points of a route: its own list, or the points of the 3D sketch / XYZ curve it follows (`path`). */
export function routePoints(f, features = []) {
  const src = f.path ? features.find((x) => x.id === f.path && Array.isArray(x.points)) : null;
  const pts = (src ? src.points : f.points ?? []).filter((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite));
  // Repeated points add nothing.
  return pts.filter((p, i) => i === 0 || len(sub(p, pts[i - 1])) > 1e-9);
}

/** Outside / inside radius of a pipe or tube route. */
export function routeSection(f) {
  if (f.kind === 'pipe') { const p = PIPES[f.dn] ?? PIPES.DN25; return { ro: p.od / 2, ri: p.od / 2 - p.wall, od: p.od, wall: p.wall }; }
  if (f.kind === 'cable') { const d = Math.max(0.1, Number(f.diameter) || 6); return { ro: d / 2, ri: 0, od: d, wall: d / 2 }; }
  const od = Math.max(0.1, Number(f.od) || 12); const wall = Math.min(od / 2 - 1e-3, Math.max(0.01, Number(f.wall) || 1));
  return { ro: od / 2, ri: od / 2 - wall, od, wall };
}

/** The bend radius used: the elbow's for a pipe with elbows, the route's otherwise (never below the tube's radius). */
export function bendRadiusOf(f) {
  const { ro } = routeSection(f);
  if (f.kind === 'pipe' && f.fittings === 'elbows') return (PIPES[f.dn] ?? PIPES.DN25).elbow;
  return Math.max(ro * 1.0001, Number(f.bendRadius) || ro * 3);
}

/**
 * The centre line through `points` with arcs of `radius` at the corners: { pieces, length, bends }.
 * pieces: { type: 'line', a, b, length } and { type: 'arc', a, mid, b, centre, radius, angle (°), length,
 * corner (index of the point) } in order. Collinear corners need no arc; a corner whose arcs do not fit
 * between its neighbours throws 'bend-too-large', a U-turn 'route-reversal'.
 */
export function routePath(points, radius) {
  if (points.length < 2) throw code('no-path');
  const n = points.length;
  const corners = new Map();
  for (let i = 1; i < n - 1; i++) {
    const d1 = unit(sub(points[i], points[i - 1])); const d2 = unit(sub(points[i + 1], points[i]));
    const c = Math.max(-1, Math.min(1, dot(d1, d2)));
    const theta = Math.acos(c);
    if (theta < 1e-7 || radius <= 0) continue;
    if (Math.PI - theta < 1e-4) throw code('route-reversal', { index: i + 1 });
    const T = radius * Math.tan(theta / 2);
    const a = sub(points[i], mul(d1, T)); const b = add(points[i], mul(d2, T));
    const bis = unit(sub(d2, d1));
    const centre = add(points[i], mul(bis, radius / Math.cos(theta / 2)));
    const mid = add(centre, mul(unit(sub(points[i], centre)), radius));
    corners.set(i, { T, a, b, centre, mid, theta });
  }
  const pieces = [];
  let start = points[0];
  for (let i = 1; i < n; i++) {
    const c = corners.get(i);
    const end = c ? c.a : points[i];
    const segLen = len(sub(points[i], points[i - 1]));
    const used = (corners.get(i - 1)?.T ?? 0) + (c?.T ?? 0);
    if (used > segLen + 1e-6) throw code('bend-too-large', { index: i });
    const l = len(sub(end, start));
    if (l > 1e-9) pieces.push({ type: 'line', a: start, b: end, length: l });
    if (c) {
      pieces.push({ type: 'arc', a: c.a, mid: c.mid, b: c.b, centre: c.centre, radius, angle: deg(c.theta), length: radius * c.theta, corner: i });
      start = c.b;
    } else start = points[i];
  }
  const length = pieces.reduce((s, p) => s + p.length, 0);
  return { pieces, length, bends: pieces.filter((p) => p.type === 'arc') };
}

/** Length of the straight polyline through the points (a lower bound for a cable's spline). */
export const polylineLength = (pts) => pts.slice(1).reduce((s, p, i) => s + len(sub(p, pts[i])), 0);

/** Trims a centre line at its ends by `start` / `end` (the hub of a flange): only straight end pieces can be trimmed. */
export function trimEnds(pieces, start = 0, end = 0) {
  const out = pieces.map((p) => ({ ...p }));
  const trim = (p, atStart, by) => {
    if (!by) return;
    if (!p || p.type !== 'line' || p.length <= by + 1e-6) throw code('route-end-short');
    const dir = unit(sub(p.b, p.a));
    if (atStart) p.a = add(p.a, mul(dir, by)); else p.b = sub(p.b, mul(dir, by));
    p.length -= by;
  };
  trim(out[0], true, start);
  trim(out.at(-1), false, end);
  return out;
}

const flangeEnds = (f) => (f.kind === 'pipe' ? { start: ['start', 'both'].includes(f.flanges), end: ['end', 'both'].includes(f.flanges) } : { start: false, end: false });

/** Rounds a length for the cut list (0.1 mm). */
const cut = (l) => Math.round(l * 10) / 10;

/**
 * The route's bill of materials: { kind, length (centre line, flanges included), rows: [{ item, size, qty,
 * length (each, mm) | null, angle }] }. Pipe with elbows: one row per straight length (cut lengths) and the
 * elbows grouped by angle; bent pipe / tube: one length (developed) and the bends; cable: its length
 * (`measured`, the kernel's spline length, when known — else the polyline through its points).
 */
export function routeBom(f, features = [], { measured = null } = {}) {
  const pts = routePoints(f, features);
  const sec = routeSection(f);
  if (f.kind === 'cable') {
    const length = measured ?? polylineLength(pts);
    return { kind: 'cable', length, rows: [{ item: 'cable', size: `Ø${sec.od}`, color: f.color ?? '#d23c3c', qty: 1, length: cut(length) }] };
  }
  const path = routePath(pts, bendRadiusOf(f));
  const ends = flangeEnds(f);
  const hub = (PIPES[f.dn] ?? PIPES.DN25).flange.H;
  const pieces = trimEnds(path.pieces, ends.start ? hub : 0, ends.end ? hub : 0);
  const size = f.kind === 'pipe' ? f.dn : `Ø${sec.od}×${sec.wall}`;
  const rows = [];
  if (f.kind === 'pipe' && f.fittings === 'elbows') {
    for (const p of pieces) if (p.type === 'line') rows.push({ item: 'pipe', size, qty: 1, length: cut(p.length) });
    const byAngle = new Map();
    for (const p of pieces) if (p.type === 'arc') { const a = Math.round(p.angle * 10) / 10; byAngle.set(a, (byAngle.get(a) ?? 0) + 1); }
    for (const [angle, qty] of byAngle) rows.push({ item: 'elbow', size, qty, length: null, angle });
  } else {
    const developed = pieces.reduce((s, p) => s + p.length, 0);
    rows.push({ item: f.kind, size, qty: 1, length: cut(developed) });
    const bends = pieces.filter((p) => p.type === 'arc');
    if (bends.length) rows.push({ item: 'bend', size: `R${cut(bendRadiusOf(f))}`, qty: bends.length, length: null, angle: null });
  }
  const flanges = Number(ends.start) + Number(ends.end);
  if (flanges) rows.push({ item: 'flange', size: `${f.dn} PN16`, qty: flanges, length: null });
  return { kind: f.kind, length: path.length, rows, bends: path.bends.length };
}

// ───────────────────────── kernel

const edgeOf = (p) => (p.type === 'line' ? rep().makeLine(p.a, p.b) : rep().makeThreePointArc(p.a, p.mid, p.b));

/** A hollow (ri > 0) or solid round section swept along the pieces. */
function sweepSection(pieces, ro, ri) {
  const R = rep();
  const first = pieces[0];
  // The start tangent of the first edge (for an arc it is not the chord toward its middle).
  const tg = edgeOf(first).tangentAt(0);
  const t0 = unit([tg.x, tg.y, tg.z]);
  const tube = (r) => {
    const spine = R.assembleWire(pieces.map(edgeOf));
    const profile = R.assembleWire([R.makeCircle(r, first.a, t0)]);
    return R.genericSweep(profile, spine, { frenet: true }, false);
  };
  const outer = tube(ro);
  return ri > 0 ? outer.cut(tube(ri)) : outer;
}

/** A standard flange at a route end: its face at `at`, its hub toward `dir` (into the route). */
function placedFlange(dn, at, dir, stdShape) {
  let s = stdShape({ kind: 'flange', dn });
  const z = [0, 0, 1];
  const axis = [z[1] * dir[2] - z[2] * dir[1], z[2] * dir[0] - z[0] * dir[2], z[0] * dir[1] - z[1] * dir[0]];
  const c = Math.max(-1, Math.min(1, dot(z, dir)));
  if (len(axis) > 1e-9) s = s.rotate(deg(Math.acos(c)), [0, 0, 0], unit(axis));
  else if (c < 0) s = s.rotate(180, [0, 0, 0], [1, 0, 0]);
  return s.translate(at);
}

/**
 * The route's solid and its data: { shape, length (centre line), measured (cable spline length), pieces }.
 * `stdShape` (stdparts.js) builds the flanges.
 */
export function routeSolid(f, features, stdShape) {
  const R = rep();
  const pts = routePoints(f, features);
  if (pts.length < 2) throw code('no-path');
  const { ro, ri } = routeSection(f);
  if (f.kind === 'cable') {
    const edge = pts.length === 2 ? R.makeLine(pts[0], pts[1]) : R.makeBSplineApproximation(pts, { tolerance: 1e-3, smoothing: null, degMax: 3, degMin: 2 });
    const spine = R.assembleWire([edge]);
    const t = edge.tangentAt(0); const st = edge.startPoint;
    const profile = R.assembleWire([R.makeCircle(ro, [st.x, st.y, st.z], unit([t.x, t.y, t.z]))]);
    const shape = R.genericSweep(profile, spine, { frenet: false }, false);
    const measured = R.measureLength(edge);
    return { shape, length: measured, measured, pieces: [] };
  }
  const path = routePath(pts, bendRadiusOf(f));
  const ends = flangeEnds(f);
  const hub = (PIPES[f.dn] ?? PIPES.DN25).flange.H;
  const pieces = trimEnds(path.pieces, ends.start ? hub : 0, ends.end ? hub : 0);
  const solids = [];
  if (f.kind === 'pipe' && f.fittings === 'elbows') {
    // Straight lengths and elbows: separate solids (welded joints), like the cut list.
    for (const p of pieces) solids.push(sweepSection([p], ro, ri));
  } else {
    try { solids.push(sweepSection(pieces, ro, ri)); } catch { for (const p of pieces) solids.push(sweepSection([p], ro, ri)); }
  }
  if (ends.start) solids.push(placedFlange(f.dn, pts[0], unit(sub(pts[1], pts[0])), stdShape));
  if (ends.end) { const k = pts.length - 1; solids.push(placedFlange(f.dn, pts[k], unit(sub(pts[k - 1], pts[k])), stdShape)); }
  const shape = solids.length === 1 ? solids[0] : R.makeCompound(solids);
  return { shape, length: path.length, measured: null, pieces };
}

/** Volume of a straight / bent hollow section by Pappus (for checks): π (ro² − ri²) · centre-line length. */
export const sectionVolume = (ro, ri, length) => Math.PI * (ro * ro - ri * ri) * length;
