// Surfaces of IGES B-reps and trimmed surfaces, and their faces as triangles:
// planes (108, 190), cylinders (192), cones (194), spheres (196), tori (198),
// surfaces of revolution (120), tabulated cylinders (122) and B-spline
// surfaces (128). A face is bounded by loops of points on the surface (its
// edges, in 3D): planar faces are triangulated as polygons; curved ones in
// their (u, v) parameters — the loops mapped there, a grid inside, Delaunay —
// and mapped back. No DOM.
import { curvePoint } from './nurbs.js';
import { delaunay } from './points.js';
import { triangulate } from './triangulate.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a) || 1; return mul(a, 1 / l); };
const TAU = 2 * Math.PI;

/** A frame from an axis and a reference direction (any when there is none). */
function frame(axis, ref = null) {
  const z = unit(axis);
  let x = ref ? sub(ref, mul(z, dot(ref, z))) : null;
  if (!x || Math.hypot(...x) < 1e-9) x = Math.abs(z[2]) < 0.9 ? cross([0, 0, 1], z) : cross([0, 1, 0], z);
  x = unit(x);
  return { z, x, y: cross(z, x) };
}

/** Points on a polyline nearest a point: its parameter (0 … 1 along the length) and the point. */
function nearestOnPolyline(pts, cum, p) {
  let best = { d: Infinity, t: 0 };
  for (let i = 0; i + 1 < pts.length; i++) {
    const ab = sub(pts[i + 1], pts[i]);
    const l2 = dot(ab, ab) || 1e-30;
    const k = Math.max(0, Math.min(1, dot(sub(p, pts[i]), ab) / l2));
    const q = add(pts[i], mul(ab, k));
    const d = Math.hypot(...sub(p, q));
    if (d < best.d) best = { d, t: (cum[i] + k * (cum[i + 1] - cum[i])) / cum[cum.length - 1] };
  }
  return best.t;
}
const cumulative = (pts) => { const out = [0]; for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + Math.hypot(...sub(pts[i], pts[i - 1]))); return out; };
const along = (pts, cum, t) => {
  const target = t * cum[cum.length - 1];
  let i = 0;
  while (i < pts.length - 2 && cum[i + 1] < target) i++;
  const k = (target - cum[i]) / ((cum[i + 1] - cum[i]) || 1e-30);
  return add(pts[i], mul(sub(pts[i + 1], pts[i]), Math.max(0, Math.min(1, k))));
};

/**
 * A surface: { kind, planar, at(u, v) → point, uv(p) → [u, v], uPeriod, vPeriod, uRange, vRange }.
 * `spec` comes from the IGES entity, already in model space.
 */
export function makeSurface(spec) {
  switch (spec.kind) {
    case 'plane': {
      const f = frame(spec.normal, spec.ref);
      return { kind: 'plane', planar: true, normal: f.z, at: (u, v) => add(add(spec.origin, mul(f.x, u)), mul(f.y, v)), uv: (p) => { const d = sub(p, spec.origin); return [dot(d, f.x), dot(d, f.y)]; } };
    }
    case 'cylinder': {
      const f = frame(spec.axis, spec.ref);
      return { kind: 'cylinder', uPeriod: TAU, at: (u, v) => add(spec.origin, add(add(mul(f.x, spec.radius * Math.cos(u)), mul(f.y, spec.radius * Math.sin(u))), mul(f.z, v))), uv: (p) => { const d = sub(p, spec.origin); return [Math.atan2(dot(d, f.y), dot(d, f.x)), dot(d, f.z)]; } };
    }
    case 'cone': {
      const f = frame(spec.axis, spec.ref);
      const k = Math.tan(spec.angle);
      const r = (v) => spec.radius + v * k;
      return { kind: 'cone', uPeriod: TAU, at: (u, v) => add(spec.origin, add(add(mul(f.x, r(v) * Math.cos(u)), mul(f.y, r(v) * Math.sin(u))), mul(f.z, v))), uv: (p) => { const d = sub(p, spec.origin); return [Math.atan2(dot(d, f.y), dot(d, f.x)), dot(d, f.z)]; } };
    }
    case 'sphere': {
      const f = frame(spec.axis, spec.ref);
      return { kind: 'sphere', uPeriod: TAU, vRange: [-Math.PI / 2, Math.PI / 2], at: (u, v) => add(spec.center, mul(add(add(mul(f.x, Math.cos(v) * Math.cos(u)), mul(f.y, Math.cos(v) * Math.sin(u))), mul(f.z, Math.sin(v))), spec.radius)), uv: (p) => { const d = unit(sub(p, spec.center)); return [Math.atan2(dot(d, f.y), dot(d, f.x)), Math.asin(Math.max(-1, Math.min(1, dot(d, f.z))))]; } };
    }
    case 'torus': {
      const f = frame(spec.axis, spec.ref);
      return { kind: 'torus', uPeriod: TAU, vPeriod: TAU, at: (u, v) => { const ring = add(mul(f.x, Math.cos(u)), mul(f.y, Math.sin(u))); return add(spec.center, add(mul(ring, spec.major + spec.minor * Math.cos(v)), mul(f.z, spec.minor * Math.sin(v)))); }, uv: (p) => { const d = sub(p, spec.center); const u = Math.atan2(dot(d, f.y), dot(d, f.x)); const ring = add(mul(f.x, Math.cos(u)), mul(f.y, Math.sin(u))); return [u, Math.atan2(dot(d, f.z), dot(d, ring) - spec.major)]; } };
    }
    case 'revolution': {
      // The generatrix (sampled) turned about the axis: u along it (0 … 1), v the angle.
      const f = frame(spec.axisDir);
      const pts = spec.generatrix; const cum = cumulative(pts);
      const turn = (p, a) => { const d = sub(p, spec.axisPoint); const h = dot(d, f.z); const r = sub(d, mul(f.z, h)); return add(add(spec.axisPoint, mul(f.z, h)), add(mul(r, Math.cos(a)), mul(cross(f.z, r), Math.sin(a)))); };
      const base = (p) => Math.atan2(dot(sub(p, spec.axisPoint), f.y), dot(sub(p, spec.axisPoint), f.x));
      return {
        kind: 'revolution', vPeriod: TAU, uRange: [0, 1], vRange: [spec.start, spec.end],
        at: (u, v) => turn(along(pts, cum, u), v),
        // A point: its angle about the axis; then, turned back onto the generatrix's plane, where it is along it.
        uv: (p) => {
          const g0 = along(pts, cum, 0.5);
          const a = base(p) - base(g0);
          const back = turn(p, -a);
          return [nearestOnPolyline(pts, cum, back), a];
        },
      };
    }
    case 'tabulated': {
      const pts = spec.directrix; const cum = cumulative(pts);
      const dir = sub(spec.end, pts[0]); const len2 = dot(dir, dir) || 1e-30;
      return { kind: 'tabulated', uRange: [0, 1], at: (u, v) => add(along(pts, cum, u), mul(dir, v)), uv: (p) => { const v = dot(sub(p, pts[0]), dir) / len2; return [nearestOnPolyline(pts, cum, sub(p, mul(dir, v))), v]; } };
    }
    case 'bspline': {
      // Homogeneous control points, rows along u; a coarse grid seeds the inverse (then Newton steps).
      const { nu, nv, uDegree, vDegree, uKnots, vKnots, poles, weights } = spec;
      const H = poles.map((p, i) => [p[0] * weights[i], p[1] * weights[i], p[2] * weights[i], weights[i]]);
      const at0 = (u, v) => {
        const col = Array.from({ length: nv }, (_, j) => curvePoint({ degree: uDegree, points: H.slice(j * nu, (j + 1) * nu), knots: uKnots }, u));
        const h = curvePoint({ degree: vDegree, points: col, knots: vKnots }, v);
        return [h[0] / h[3], h[1] / h[3], h[2] / h[3]];
      };
      const [u0, u1] = spec.uRange; const [v0, v1] = spec.vRange;
      // Closed in u or v (a cone's or torus's surface made into a B-spline): periodic there.
      const near3 = (a, b) => Math.hypot(...sub(a, b)) < 1e-6 * (1 + Math.hypot(...a));
      const closedU = [0, 0.37, 0.71, 1].every((t) => near3(at0(u0, v0 + (v1 - v0) * t), at0(u1, v0 + (v1 - v0) * t)));
      const closedV = [0, 0.37, 0.71, 1].every((t) => near3(at0(u0 + (u1 - u0) * t, v0), at0(u0 + (u1 - u0) * t, v1)));
      const wrap = (x, a, b, closed) => (closed ? a + ((((x - a) % (b - a)) + (b - a)) % (b - a)) : Math.max(a, Math.min(b, x)));
      const at = (u, v) => at0(wrap(u, u0, u1, closedU), wrap(v, v0, v1, closedV));
      const seeds = [];
      for (let j = 0; j <= 16; j++) for (let i = 0; i <= 16; i++) { const u = u0 + ((u1 - u0) * i) / 16; const v = v0 + ((v1 - v0) * j) / 16; seeds.push([u, v, at(u, v)]); }
      const clampU = (u) => Math.max(u0, Math.min(u1, u)); const clampV = (v) => Math.max(v0, Math.min(v1, v));
      return {
        kind: 'bspline', uRange: [u0, u1], vRange: [v0, v1], at, ...(closedU ? { uPeriod: u1 - u0 } : {}), ...(closedV ? { vPeriod: v1 - v0 } : {}),
        uv: (p) => {
          let [u, v] = seeds.reduce((best, s) => { const d = Math.hypot(...sub(s[2], p)); return d < best[2] ? [s[0], s[1], d] : best; }, [u0, v0, Infinity]);
          const hu = (u1 - u0) * 1e-5; const hv = (v1 - v0) * 1e-5;
          for (let it = 0; it < 20; it++) {
            const s = at(u, v);
            const su = mul(sub(at(clampU(u + hu), v), at(clampU(u - hu), v)), 1 / (2 * hu));
            const sv = mul(sub(at(u, clampV(v + hv)), at(u, clampV(v - hv))), 1 / (2 * hv));
            const r = sub(s, p);
            const a = dot(su, su); const b = dot(su, sv); const c = dot(sv, sv);
            const g1 = dot(r, su); const g2 = dot(r, sv);
            const det = a * c - b * b;
            if (Math.abs(det) < 1e-30) break;
            const du = (c * g1 - b * g2) / det; const dv = (a * g2 - b * g1) / det;
            u = clampU(u - du); v = clampV(v - dv);
            if (Math.abs(du) < hu * 1e-3 && Math.abs(dv) < hv * 1e-3) break;
          }
          return [u, v];
        },
      };
    }
    default: return null;
  }
}

const inside = (p, loop) => {
  let hit = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i]; const b = loop[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
};
const area2 = (loop) => loop.reduce((s, p, i) => { const q = loop[(i + 1) % loop.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

/** (u, v) of a loop's points, the periodic directions unwrapped along it (no jumps across the seam). */
function unwrap(surface, loop) {
  const uv = loop.map((p) => surface.uv(p));
  for (const [k, period] of [[0, surface.uPeriod], [1, surface.vPeriod]]) {
    if (!period) continue;
    for (let i = 1; i < uv.length; i++) {
      while (uv[i][k] - uv[i - 1][k] > period / 2) uv[i][k] -= period;
      while (uv[i][k] - uv[i - 1][k] < -period / 2) uv[i][k] += period;
    }
  }
  return uv;
}

/**
 * Triangles of a face: `loops` are closed point lists (3D, the outer one
 * first) on the surface. Returns [[a, b, c]] (winding not settled).
 */
export function faceTriangles(surface, loops, { cells = 56 } = {}) {
  const rings = loops.filter((l) => l.length >= 2);
  if (!rings.length) return [];
  if (surface.planar) {
    const flat = rings.map((l) => l.map((p) => { const [x, y] = surface.uv(p); return { x, y, p }; }));
    if (flat[0].length < 3) return [];
    return triangulate(flat[0], flat.slice(1)).map((tri) => tri.map((q) => q.p));
  }
  const uvLoops = rings.map((l) => unwrap(surface, l));
  let outer = uvLoops[0];
  const holes = uvLoops.slice(1);
  // A loop that encloses nothing in (u, v) (a sphere's seam alone, a torus's two seams …): the whole period.
  const ext = (k) => [Math.min(...outer.map((q) => q[k])), Math.max(...outer.map((q) => q[k]))];
  let [uMin, uMax] = ext(0); let [vMin, vMax] = ext(1);
  let boundary3d = rings[0];
  if (Math.abs(area2(outer)) < 1e-9 * Math.max(1e-9, (uMax - uMin + 1e-9) * (vMax - vMin + 1e-9)) || Math.abs(area2(outer)) < 1e-12) {
    if (surface.uPeriod && uMax - uMin < surface.uPeriod * 0.99) { uMax = uMin + surface.uPeriod; }
    if (surface.vPeriod && vMax - vMin < surface.vPeriod * 0.99) { vMax = vMin + surface.vPeriod; }
    if (surface.vRange && vMax - vMin < 1e-9) [vMin, vMax] = surface.vRange;
    if (surface.uRange && uMax - uMin < 1e-9) [uMin, uMax] = surface.uRange;
    const side = (a, b) => Array.from({ length: cells }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / cells, a[1] + ((b[1] - a[1]) * i) / cells]);
    outer = [...side([uMin, vMin], [uMax, vMin]), ...side([uMax, vMin], [uMax, vMax]), ...side([uMax, vMax], [uMin, vMax]), ...side([uMin, vMax], [uMin, vMin])];
    boundary3d = null;
  }
  // Boundary points (kept as they are in 3D, so neighbouring faces meet) and a grid inside.
  const pts = []; const xyz = [];
  outer.forEach((q, i) => { pts.push(q); xyz.push(boundary3d ? boundary3d[i] : surface.at(q[0], q[1])); });
  holes.forEach((h, k) => h.forEach((q, i) => { pts.push(q); xyz.push(rings[k + 1][i]); }));
  const du = (uMax - uMin) / cells; const dv = (vMax - vMin) / cells;
  const nearBoundary = (q) => [outer, ...holes].some((loop) => loop.some((b) => Math.abs(b[0] - q[0]) < du * 0.35 && Math.abs(b[1] - q[1]) < dv * 0.35));
  for (let j = 1; j < cells; j++) for (let i = 1; i < cells; i++) {
    const q = [uMin + du * i, vMin + dv * j];
    if (!inside(q, outer) || holes.some((h) => inside(q, h)) || nearBoundary(q)) continue;
    pts.push(q); xyz.push(surface.at(q[0], q[1]));
  }
  // Delaunay in (u, v) scaled to a square (cells long and thin otherwise).
  const su = 1 / (uMax - uMin || 1); const sv = 1 / (vMax - vMin || 1);
  const tris = delaunay(pts.map(([u, v]) => [u * su, v * sv]));
  return tris.filter((t) => {
    const c = [(pts[t[0]][0] + pts[t[1]][0] + pts[t[2]][0]) / 3, (pts[t[0]][1] + pts[t[1]][1] + pts[t[2]][1]) / 3];
    return inside(c, outer) && !holes.some((h) => inside(c, h));
  }).map((t) => t.map((i) => xyz[i]));
}
