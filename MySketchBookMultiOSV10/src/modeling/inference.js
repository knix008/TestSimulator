// SketchUp-style inference engine as pure math. The UI gathers candidates near the cursor
// (BVH picking etc.) and calls infer(); this module never touches the scene graph.
import { toV, add, sub, scale, addScaled, dot, cross, len, len2, norm, dist, closestSegSeg } from './math.js';

// Lower rank wins; inside one rank the closest to the cursor (pixels) wins.
export const PRIORITY = {
  endpoint: 0, midpoint: 1, center: 2, guidePoint: 3, intersection: 4, onEdge: 5, onGuide: 6,
  axisX: 7, axisY: 7, axisZ: 7, parallel: 8, perpendicular: 9, onFace: 10, ground: 11, free: 12,
};
const AXIS_KIND = { x: 'axisX', y: 'axisY', z: 'axisZ' };
const DEFAULT_AXES = { x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: 1 } };

function normRay(ray) {
  return { origin: toV(ray.origin), direction: norm(toV(ray.direction)) };
}

// Closest points between a ray and the segment a-b.
// → { pointOnRay, pointOnSegment, rayT, segT, distance }
export function closestPointsRaySegment(ray, a, b) {
  const r = normRay(ray);
  const A = toV(a), B = toV(b);
  // a long finite stand-in for the ray keeps the segment/segment math exact enough
  const far = addScaled(r.origin, r.direction, 1e7);
  const c = closestSegSeg(r.origin, far, A, B);
  const pointOnRay = addScaled(r.origin, r.direction, c.s * 1e7);
  const pointOnSegment = add(A, scale(sub(B, A), c.t));
  return { pointOnRay, pointOnSegment, rayT: c.s * 1e7, segT: c.t, distance: dist(pointOnRay, pointOnSegment) };
}

// Point on the infinite line origin + t·direction closest to the ray.
// → { point, t, rayT, distance } (null when the ray is parallel to the line)
export function projectRayToAxis(ray, origin, direction) {
  const r = normRay(ray);
  const O = toV(origin), D = norm(toV(direction));
  const w = sub(r.origin, O);
  const b = dot(r.direction, D);
  const den = 1 - b * b;
  if (den < 1e-12) return null;
  const d = dot(r.direction, w), e = dot(D, w);
  const rayT = (b * e - d) / den;
  const t = (e - b * d) / den;
  const point = addScaled(O, D, t);
  const onRay = addScaled(r.origin, r.direction, rayT);
  return { point, t, rayT, distance: dist(point, onRay) };
}

// Ray/plane intersection. plane: { normal, constant } (THREE.Plane layout: n·p + c = 0)
// or { normal, point }. → point or null (parallel / behind the ray origin).
export function projectRayToPlane(ray, plane, allowBehind = false) {
  const r = normRay(ray);
  const n = norm(toV(plane.normal));
  const c = plane.point ? -dot(n, toV(plane.point)) : plane.constant ?? 0;
  const den = dot(n, r.direction);
  if (Math.abs(den) < 1e-12) return null;
  const t = -(dot(n, r.origin) + c) / den;
  if (t < 0 && !allowBehind) return null;
  return addScaled(r.origin, r.direction, t);
}

function projectPointOnLine(p, O, D) {
  return addScaled(O, D, dot(sub(p, O), D));
}
function projectPointOnPlane(p, n, c) {
  return sub(p, scale(n, dot(n, p) + c));
}

// Cursor distance in pixels for a world point.
function makeMeasure(input, r) {
  if (typeof input.toScreen === 'function') {
    const cursor = input.cursor ?? input.toScreen(addScaled(r.origin, r.direction, 1));
    return (p) => {
      const s = input.toScreen(p);
      return Math.hypot(s.x - cursor.x, s.y - cursor.y);
    };
  }
  const ps = input.pixelSize;
  return (p) => {
    const t = Math.max(0, dot(sub(p, r.origin), r.direction));
    const onRay = addScaled(r.origin, r.direction, t);
    const size = typeof ps === 'function' ? ps(p) : typeof ps === 'number' ? ps : 0.002 * Math.max(t, 1e-3);
    return dist(p, onRay) / Math.max(size, 1e-12);
  };
}

// infer(input) → { point, kind, ref, lineFrom?, tooltipKey, snap?, px }
// input: { ray, toScreen? | pixelSize?, cursor?, candidates: { points, edges, faces, guides, refEdges },
//          from, axes, lock, tolerancePx = 10, groundY = 0, ground = true, drawPlane?, defaultDepth = 10 }
export function infer(input) {
  const r = normRay(input.ray);
  const tol = input.tolerancePx ?? 10;
  const px = makeMeasure(input, r);
  const cand = input.candidates || {};
  const axes = { ...DEFAULT_AXES, ...(input.axes || {}) };
  for (const k of ['x', 'y', 'z']) axes[k] = norm(toV(axes[k]));
  const from = input.from ? toV(input.from) : null;
  const depthOf = (p) => dot(sub(p, r.origin), r.direction);
  const found = [];
  const consider = (point, kind, ref, extra = {}) => {
    const d = depthOf(point);
    if (d < 0) return; // behind the camera
    const dpx = extra.px ?? px(point);
    if (dpx > tol && !extra.always) return;
    found.push({ point, kind, ref: ref ?? null, px: dpx, depth: d, ...extra });
  };

  // ── point-like snaps
  let snapped = false;
  const pointSnaps = () => {
    if (snapped) return;
    snapped = true;
    for (const c of cand.points || []) consider(toV(c.p), c.kind || 'endpoint', c.ref);
    const nearEdges = [];
    for (const e of cand.edges || []) {
      const A = toV(e.a), B = toV(e.b);
      consider(A, 'endpoint', e.ref, { edge: e });
      consider(B, 'endpoint', e.ref, { edge: e });
      consider(scale(add(A, B), 0.5), 'midpoint', e.ref, { edge: e });
      const c = closestPointsRaySegment(r, A, B);
      if (c.rayT < 0) continue;
      const dpx = px(c.pointOnSegment);
      if (dpx <= tol) {
        nearEdges.push({ A, B, ref: e.ref });
        consider(c.pointOnSegment, 'onEdge', e.ref, { px: dpx });
      }
    }
    const guides = (cand.guides || []).map((g) => {
      const O = toV(g.origin ?? g.a), D = norm(g.direction ? toV(g.direction) : sub(toV(g.b), toV(g.a)));
      return { O, D, ref: g.ref ?? g };
    });
    for (const g of guides) {
      const pr = projectRayToAxis(r, g.O, g.D);
      if (pr && pr.rayT >= 0) consider(pr.point, 'onGuide', g.ref);
    }
    // intersections of edges near the cursor (and edges with guides)
    const big = 1e6;
    for (let i = 0; i < nearEdges.length; i++) {
      for (let j = i + 1; j < nearEdges.length; j++) {
        const a = nearEdges[i], b = nearEdges[j];
        const c = closestSegSeg(a.A, a.B, b.A, b.B);
        const scaleLen = Math.max(1, len(a.A), len(b.A));
        if (c.d2 > (1e-6 * scaleLen) ** 2 || c.parallel) continue;
        if ((c.s <= 1e-9 || c.s >= 1 - 1e-9) && (c.t <= 1e-9 || c.t >= 1 - 1e-9)) continue; // shared endpoint
        consider(c.cp, 'intersection', [a.ref, b.ref]);
      }
      for (const g of guides) {
        const a = nearEdges[i];
        const c = closestSegSeg(a.A, a.B, addScaled(g.O, g.D, -big), addScaled(g.O, g.D, big));
        if (c.d2 > 1e-10 || c.parallel) continue;
        consider(c.cp, 'intersection', [a.ref, g.ref]);
      }
    }
    for (let i = 0; i < guides.length; i++) for (let j = i + 1; j < guides.length; j++) {
      const a = guides[i], b = guides[j];
      const c = closestSegSeg(addScaled(a.O, a.D, -big), addScaled(a.O, a.D, big), addScaled(b.O, b.D, -big), addScaled(b.O, b.D, big));
      if (c.d2 > 1e-10 || c.parallel) continue;
      consider(c.cp, 'intersection', [a.ref, b.ref]);
    }
  };

  const faceHit = () => {
    let best = null;
    for (const f of cand.faces || []) {
      const p = projectRayToPlane(r, f.plane);
      if (!p) continue;
      if (f.contains && !f.contains(p)) continue;
      const d = depthOf(p);
      if (!best || d < best.depth) best = { point: p, depth: d, ref: f.ref ?? null };
    }
    return best;
  };

  const pick = () => {
    if (!found.length) return null;
    found.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.px - b.px || a.depth - b.depth);
    return found[0];
  };
  const result = (f, extra = {}) => ({
    point: f.point, kind: f.kind, ref: f.ref ?? null, px: f.px ?? 0,
    ...(f.lineFrom ? { lineFrom: f.lineFrom } : {}), ...extra, tooltipKey: 'inference.' + (extra.kind || f.kind),
  });

  // ── inference lock (Shift / arrow keys)
  const lock = input.lock;
  if (lock) {
    pointSnaps();
    const snap = pick();
    if ((typeof lock === 'string' || lock.direction) && from) {
      const D = typeof lock === 'string' ? axes[lock] : norm(toV(lock.direction));
      const kind = typeof lock === 'string' ? AXIS_KIND[lock] : 'parallel';
      let point;
      if (snap) point = projectPointOnLine(snap.point, from, D);
      else {
        const pr = projectRayToAxis(r, from, D);
        point = pr ? pr.point : from;
      }
      return { point, kind, ref: snap ? snap.ref : null, lineFrom: from, locked: true, ...(snap ? { snap: { kind: snap.kind, point: snap.point } } : {}), tooltipKey: 'inference.' + kind, px: 0 };
    }
    if (lock.plane) {
      const n = norm(toV(lock.plane.normal));
      const c = lock.plane.point ? -dot(n, toV(lock.plane.point)) : lock.plane.constant ?? 0;
      let point = snap ? projectPointOnPlane(snap.point, n, c) : projectRayToPlane(r, { normal: n, constant: c }, true);
      if (!point) point = from || r.origin;
      return { point, kind: 'onFace', ref: snap ? snap.ref : lock.plane.ref ?? null, locked: true, ...(snap ? { snap: { kind: snap.kind, point: snap.point } } : {}), tooltipKey: 'inference.onFace', px: 0 };
    }
  }

  pointSnaps();
  const hit = faceHit();
  if (input.occlude && hit) {
    // ignore snaps clearly hidden behind the face under the cursor
    const limit = hit.depth * 1.02 + 1e-3;
    for (let i = found.length - 1; i >= 0; i--) if (found[i].depth > limit) found.splice(i, 1);
  }

  // ── directions from the last point
  if (from) {
    for (const k of ['x', 'y', 'z']) {
      const pr = projectRayToAxis(r, from, axes[k]);
      if (pr && pr.rayT >= 0) consider(pr.point, AXIS_KIND[k], null, { lineFrom: from });
    }
    const up = axes.y;
    for (const e of cand.refEdges || []) {
      const D = norm(sub(toV(e.b), toV(e.a)));
      if (len2(D) === 0) continue;
      const isAxis = ['x', 'y', 'z'].some((k) => Math.abs(dot(D, axes[k])) > 1 - 1e-9);
      if (!isAxis) {
        const pr = projectRayToAxis(r, from, D);
        if (pr && pr.rayT >= 0) consider(pr.point, 'parallel', e.ref, { lineFrom: from, direction: D });
      }
      const pn = input.drawPlane ? norm(toV(input.drawPlane.normal)) : up;
      let P = norm(cross(pn, D));
      if (len2(P) === 0) P = norm(cross(D, axes.x));
      const pAxis = ['x', 'y', 'z'].some((k) => Math.abs(dot(P, axes[k])) > 1 - 1e-9);
      if (!pAxis) {
        const pr = projectRayToAxis(r, from, P);
        if (pr && pr.rayT >= 0) consider(pr.point, 'perpendicular', e.ref, { lineFrom: from, direction: P });
      }
    }
  }
  const best = pick();
  if (best) {
    // an axis snap while hovering a face: stay on the axis but report the face too
    return result(best, hit && best.kind.startsWith('axis') ? { onFace: hit.ref } : {});
  }
  if (hit) return { point: hit.point, kind: 'onFace', ref: hit.ref, px: 0, tooltipKey: 'inference.onFace' };
  if (input.ground !== false) {
    const g = projectRayToPlane(r, { normal: { x: 0, y: 1, z: 0 }, constant: -(input.groundY ?? 0) });
    if (g) return { point: g, kind: 'ground', ref: null, px: 0, tooltipKey: 'inference.ground' };
  }
  const depth = from ? Math.max(0, dot(sub(from, r.origin), r.direction)) : input.defaultDepth ?? 10;
  return { point: addScaled(r.origin, r.direction, depth), kind: 'free', ref: null, px: 0, tooltipKey: 'inference.free' };
}

// Builds inference candidates from a GeoMesh (handy for tests and simple scenes; a big
// scene should pick nearby entities with a BVH first and pass only those ids).
export function candidatesFromMesh(mesh, options = {}) {
  const edgeIds = options.edges ?? [...mesh.edges.keys()];
  const faceIds = options.faces ?? [...mesh.faces.keys()];
  const xf = options.matrix ? (p) => {
    const e = options.matrix.elements || options.matrix;
    return { x: e[0] * p.x + e[4] * p.y + e[8] * p.z + e[12], y: e[1] * p.x + e[5] * p.y + e[9] * p.z + e[13], z: e[2] * p.x + e[6] * p.y + e[10] * p.z + e[14] };
  } : (p) => p;
  const edges = [];
  for (const id of edgeIds) {
    const e = mesh.edges.get(id);
    if (!e || e.hidden) continue;
    edges.push({ a: xf(mesh.pos(e.a)), b: xf(mesh.pos(e.b)), ref: id });
  }
  const points = [];
  for (const c of mesh.curves.values()) points.push({ p: xf(c.center), kind: 'center', ref: c });
  const faces = [];
  for (const id of faceIds) {
    if (!mesh.faces.has(id)) continue;
    if (options.matrix) continue; // transformed containment needs the inverse; the UI handles instances
    faces.push({ plane: mesh.plane(id), contains: (p) => mesh.classifyPoint(id, p) !== 'out', ref: id });
  }
  return { points, edges, faces };
}
