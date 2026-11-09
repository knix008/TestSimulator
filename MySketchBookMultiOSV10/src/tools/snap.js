// Plan snapping for the interior tools (walls, rooms, placing): SketchUp-like
// inference on the active level's floor plane — wall endpoints, midpoints,
// points on walls, axis directions from the last point, alignment with other
// points, then the grid. Pure math on [x, z] pairs plus a pixel size.
import { projectOnSegment } from '../engine/walls.js';

const AXIS_TOL_DEG = 3.5;

/**
 * @param {[number, number]} p      cursor on the plan
 * @param {object} o
 * @param {Array} o.walls           walls of the level
 * @param {Array} o.points          extra snap points [[x, z], kind]
 * @param {[number,number]|null} o.from  last point (axis inference)
 * @param {number} o.pixel          metres per screen pixel at the cursor
 * @param {number|null} o.grid      grid step when grid snapping is on
 * @param {[number,number]|null} o.lockDir  locked direction (Shift / arrow keys)
 * @returns {{ point: [x, z], kind, ref?, guideFrom?: [x, z] }}
 */
export function snapPlan(p, { walls = [], points = [], from = null, pixel = 0.01, grid = null, lockDir = null, tolerancePx = 12 } = {}) {
  const tol = tolerancePx * pixel;
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  if (lockDir && from) {
    const len = (p[0] - from[0]) * lockDir[0] + (p[1] - from[1]) * lockDir[1];
    return { point: [from[0] + lockDir[0] * len, from[1] + lockDir[1] * len], kind: lockDir.axis ?? 'locked' };
  }
  // 1. endpoints, 2. midpoints, extra points
  let best = null;
  const consider = (q, kind, ref, weight = 1) => {
    const dist = d(p, q);
    if (dist <= tol * weight && (!best || dist < best.dist)) best = { point: [q[0], q[1]], kind, ref, dist };
  };
  for (const w of walls) { consider(w.a, 'endpoint', w.id); consider(w.b, 'endpoint', w.id); }
  for (const [q, kind] of points) consider(q, kind ?? 'endpoint');
  if (best) return best;
  for (const w of walls) consider([(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2], 'midpoint', w.id, 0.8);
  if (best) return best;

  // 3. axis directions from the last point (red = x, green = z), and alignment with known points.
  let axisHit = null;
  if (from) {
    const dx = p[0] - from[0]; const dz = p[1] - from[1];
    const dist = Math.hypot(dx, dz);
    if (dist > tol) {
      const angle = (Math.atan2(dz, dx) * 180) / Math.PI;
      for (const a of [0, 90, 180, -90, -180]) {
        if (Math.abs(angle - a) < AXIS_TOL_DEG) {
          const ux = Math.round(Math.cos((a * Math.PI) / 180)); const uz = Math.round(Math.sin((a * Math.PI) / 180));
          const len = dx * ux + dz * uz;
          axisHit = { point: [from[0] + ux * len, from[1] + uz * len], kind: ux ? 'axisX' : 'axisZ', dir: [ux, uz] };
        }
      }
    }
  }
  // Alignment: the cursor lines up with another endpoint in x or z ("from point" inference).
  const anchors = [...walls.flatMap((w) => [w.a, w.b]), ...points.map(([q]) => q)];
  const aligned = (q) => {
    for (const a of anchors) {
      if (from && d(a, from) < 1e-6) continue;
      if (Math.abs(q[0] - a[0]) < tol * 0.8 && Math.abs(q[1] - a[1]) > tol) return { point: [a[0], q[1]], from: a };
      if (Math.abs(q[1] - a[1]) < tol * 0.8 && Math.abs(q[0] - a[0]) > tol) return { point: [q[0], a[1]], from: a };
    }
    return null;
  };
  if (axisHit) {
    // Axis + alignment: the axis line where it lines up with another point.
    for (const a of anchors) {
      if (from && d(a, from) < 1e-6) continue;
      if (axisHit.kind === 'axisX' && Math.abs(axisHit.point[0] - a[0]) < tol) return { point: [a[0], axisHit.point[1]], kind: 'axisX', guideFrom: a };
      if (axisHit.kind === 'axisZ' && Math.abs(axisHit.point[1] - a[1]) < tol) return { point: [axisHit.point[0], a[1]], kind: 'axisZ', guideFrom: a };
    }
    return axisHit;
  }
  // 4. on a wall's centre line
  for (const w of walls) {
    const pr = projectOnSegment(p, w.a, w.b);
    if (pr.t > 0 && pr.t < 1 && pr.distance < tol * 0.7 && (!best || pr.distance < best.dist)) best = { point: pr.point, kind: 'onEdge', ref: w.id, dist: pr.distance };
  }
  if (best) return best;
  const al = aligned(p);
  if (al) return { point: al.point, kind: 'aligned', guideFrom: al.from };
  // 5. grid
  if (grid) return { point: [Math.round(p[0] / grid) * grid, Math.round(p[1] / grid) * grid], kind: 'grid' };
  return { point: p, kind: 'free' };
}

/** Rounds a length to a sensible step for live feedback (1 mm). */
export const roundLength = (v) => Math.round(v * 1000) / 1000;
