// Relations and dimensions of a 3D sketch (its points joined in order by segments: segment i runs from point i to
// point i + 1, the last back to the first when closed). Relations: a segment along X / Y / Z, a segment parallel
// to the XY / YZ / ZX plane, two segments parallel / perpendicular / equal, a fixed point, two points coincident;
// dimensions: a segment's length, the distance between two points, the angle between two segments, a point's X /
// Y / Z. Solved by least squares from where the points are (the smallest move that satisfies them all), with
// the degrees of freedom left counted from the equations' rank.
//   f.relations3d = [{ id, type, a, b?, value? }]  (a, b: segment or point indices)
import { levenbergMarquardt, jacobian, nullSpaceInfo } from './solver.js';

export const REL3D = {
  alongX: { on: 'seg', n: 1 }, alongY: { on: 'seg', n: 1 }, alongZ: { on: 'seg', n: 1 },
  parallelXY: { on: 'seg', n: 1 }, parallelYZ: { on: 'seg', n: 1 }, parallelZX: { on: 'seg', n: 1 },
  parallel: { on: 'seg', n: 2 }, perpendicular: { on: 'seg', n: 2 }, equal: { on: 'seg', n: 2 },
  fix: { on: 'pt', n: 1 }, coincident: { on: 'pt', n: 2 },
  length: { on: 'seg', n: 1, dim: true }, distance: { on: 'pt', n: 2, dim: true }, angle: { on: 'seg', n: 2, dim: true },
  pointX: { on: 'pt', n: 1, dim: true }, pointY: { on: 'pt', n: 1, dim: true }, pointZ: { on: 'pt', n: 1, dim: true },
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

/** The number of segments of a 3D sketch with n points. */
export const segmentCount = (n, closed) => (closed && n > 2 ? n : Math.max(0, n - 1));
/** The point indices of segment i. */
export const segEnds = (i, n) => [i, (i + 1) % n];

/** The current value of a dimension (for a new one: nothing moves). */
export function measure3d(points, r, closed = false) {
  const n = points.length;
  const seg = (i) => { const [a, b] = segEnds(i, n); return sub(points[b], points[a]); };
  switch (r.type) {
    case 'length': return len(seg(r.a));
    case 'distance': return len(sub(points[r.b], points[r.a]));
    case 'angle': { const u = seg(r.a), v = seg(r.b); return (Math.atan2(len(cross(u, v)), dot(u, v)) * 180) / Math.PI; }
    case 'pointX': return points[r.a][0];
    case 'pointY': return points[r.a][1];
    case 'pointZ': return points[r.a][2];
    default: void closed; return 0;
  }
}

/** The residuals of the relations for points `P` (flat [x0, y0, z0, x1 …]); `scale` weighs the angular ones. */
function residualsOf(rels, n, P, scale) {
  const pt = (i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
  const seg = (i) => { const [a, b] = segEnds(i, n); return sub(pt(b), pt(a)); };
  const unit = (v) => { const l = len(v) || 1e-12; return [v[0] / l, v[1] / l, v[2] / l]; };
  const out = [];
  for (const r of rels) {
    switch (r.type) {
      case 'alongX': { const d = seg(r.a); out.push(d[1], d[2]); break; }
      case 'alongY': { const d = seg(r.a); out.push(d[0], d[2]); break; }
      case 'alongZ': { const d = seg(r.a); out.push(d[0], d[1]); break; }
      case 'parallelXY': out.push(seg(r.a)[2]); break;
      case 'parallelYZ': out.push(seg(r.a)[0]); break;
      case 'parallelZX': out.push(seg(r.a)[1]); break;
      case 'parallel': { const c = cross(unit(seg(r.a)), unit(seg(r.b))); out.push(c[0] * scale, c[1] * scale, c[2] * scale); break; }
      case 'perpendicular': out.push(dot(unit(seg(r.a)), unit(seg(r.b))) * scale); break;
      case 'equal': out.push(len(seg(r.a)) - len(seg(r.b))); break;
      case 'fix': { const p = pt(r.a); out.push(p[0] - r.at[0], p[1] - r.at[1], p[2] - r.at[2]); break; }
      case 'coincident': { const d = sub(pt(r.a), pt(r.b)); out.push(...d); break; }
      case 'length': out.push(len(seg(r.a)) - Number(r.value)); break;
      case 'distance': out.push(len(sub(pt(r.b), pt(r.a))) - Number(r.value)); break;
      case 'angle': { const u = unit(seg(r.a)), v = unit(seg(r.b)); const ang = Math.atan2(len(cross(u, v)), dot(u, v)); out.push((ang - (Number(r.value) * Math.PI) / 180) * scale); break; }
      case 'pointX': out.push(pt(r.a)[0] - Number(r.value)); break;
      case 'pointY': out.push(pt(r.a)[1] - Number(r.value)); break;
      case 'pointZ': out.push(pt(r.a)[2] - Number(r.value)); break;
      default: break;
    }
  }
  return out;
}

/**
 * Solves the 3D sketch's relations: { points, ok, dof, over } — `points` the solved positions (the old ones when
 * it cannot be solved). Driven dimensions (`driven: true`) only show their value.
 */
export function solve3d(points, relations, { closed = false } = {}) {
  const n = points.length;
  const rels = (relations ?? []).filter((r) => !r.driven && REL3D[r.type]);
  const x0 = points.flat();
  let ext = 1; for (const p of points) ext = Math.max(ext, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
  const scale = Math.max(1, ext / 5);
  const f = (x) => residualsOf(rels, n, x, scale);
  const r0 = f(x0);
  const result = rels.length ? levenbergMarquardt(f, x0, { maxIter: 200, tol: 1e-10 }) : { x: x0, ok: true };
  const x = result.ok ? result.x : x0;
  const J = rels.length ? jacobian(f, x, f(x)) : [];
  const info = J.length ? nullSpaceInfo(J, x.length) : { rank: 0 };
  const P = Array.from({ length: n }, (_, i) => [x[3 * i], x[3 * i + 1], x[3 * i + 2]].map((v) => Math.round(v * 1e9) / 1e9));
  void r0; void closed;
  return { points: P, ok: Boolean(result.ok), dof: 3 * n - info.rank, over: !result.ok, redundant: Math.max(0, (J.length || 0) - info.rank) };
}

/** Adds a relation or dimension to a 3D sketch feature (a dimension takes its measured value). Returns it. */
export function addRelation3d(f, type, a, b = undefined, newId = () => `r${Math.random().toString(36).slice(2, 8)}`) {
  const spec = REL3D[type];
  if (!spec) return null;
  const r = { id: newId(), type, a, ...(b !== undefined ? { b } : {}) };
  if (type === 'fix') r.at = [...f.points[a]];
  // The measured value as it is (rounding it would make it disagree with the geometry by that much).
  if (spec.dim) r.value = measure3d(f.points, r, f.closed);
  f.relations3d = [...(f.relations3d ?? []), r];
  return r;
}

/** After points were added or removed: relations naming points or segments that no longer exist go. */
export function pruneRelations3d(f) {
  const n = f.points?.length ?? 0; const s = segmentCount(n, f.closed);
  f.relations3d = (f.relations3d ?? []).filter((r) => { const lim = REL3D[r.type]?.on === 'seg' ? s : n; return r.a < lim && (r.b === undefined || r.b < lim); });
  if (!f.relations3d.length) delete f.relations3d;
}
