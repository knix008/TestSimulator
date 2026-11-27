// Turntable orbit about the world up axis (+Z): a drag sideways turns the view about Z, a drag up or down
// changes the elevation about the camera's right axis, clamped short of the poles so the view never goes over
// the top (the scene, grid included, never turns upside down) and no roll builds up. Plain arrays, no three.js.

export const WORLD_UP = [0, 0, 1];
/** How close to straight up / down a drag may take the view (radians from the pole). */
export const POLE_MARGIN = (1 * Math.PI) / 180;
export const ORBIT_SPEED = 0.006;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-15 ? a.map((v) => v / l) : null; };
const turnZ = (v, a) => { const c = Math.cos(a); const s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; };

/** Elevation of a view direction (model → eye) above the XY plane, radians (−π/2 … π/2). */
export const elevationOf = (dir) => Math.asin(Math.max(-1, Math.min(1, dot(unit(dir) ?? WORLD_UP, WORLD_UP))));

/**
 * One orbit step: `dir` (unit, model → eye) and `up` of the camera now, a drag of (dx, dy) px →
 * { dir, up } after it (up · Z ≥ 0, up ⊥ dir, no roll). A view straight down or up (a standard top / bottom view,
 * or one normal to a plane) takes its turntable heading from its own up, so the next drag carries on from it
 * without a jump; a view that is already past the clamp is not pushed back, only kept from going further.
 */
export function orbitStep(dir, up, dx, dy, speed = ORBIT_SPEED) {
  const W = WORLD_UP;
  const d = unit(dir) ?? [0, -1, 0];
  let right;
  if (Math.abs(dot(d, W)) < 0.999) right = unit(cross(W, d));
  else {
    // Looking along Z: the heading comes from the camera's own right (up × dir), laid flat.
    const r = cross(up ?? [0, 1, 0], d);
    right = unit([r[0], r[1], 0]) ?? [1, 0, 0];
  }
  const h = cross(right, W); // flat, toward the eye
  let phi = Math.atan2(dot(d, W), dot(d, h));
  const limit = Math.min(Math.PI / 2, Math.max(Math.PI / 2 - POLE_MARGIN, Math.abs(phi)));
  phi = Math.max(-limit, Math.min(limit, phi + dy * speed));
  const yaw = -dx * speed;
  const r2 = turnZ(right, yaw); const h2 = turnZ(h, yaw);
  const nd = unit(h2.map((v, i) => v * Math.cos(phi) + W[i] * Math.sin(phi)));
  const nu = unit(cross(nd, r2));
  return { dir: nd, up: nu };
}

/** `v` turned by `angle` (radians, right hand) about the unit axis `k` (Rodrigues). */
export function rotateVector(v, k, angle) {
  const c = Math.cos(angle); const s = Math.sin(angle); const kv = cross(k, v); const kd = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
}

/** `up` made exactly perpendicular to `dir` (both unit), so a long run of steps never drifts. */
function squareUp(dir, up) {
  const u = unit(up.map((v, i) => v - dir[i] * dot(up, dir)));
  if (u) return u;
  return unit(cross(dir, Math.abs(dir[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
}

/**
 * Free rotation about the screen axes: a drag sideways turns the model about the screen's vertical, a drag up or
 * down about the screen's horizontal, with no clamp — the model can be laid down on its side or turned over,
 * and the view may roll. For small steps from an upright view it moves exactly like the turntable.
 */
export function freeOrbitStep(dir, up, dx, dy, speed = ORBIT_SPEED) {
  let d = unit(dir) ?? [0, -1, 0];
  let u = squareUp(d, up ?? WORLD_UP);
  const right = unit(cross(u, d));
  // Up / down: about the screen's horizontal (a drag down raises the eye, as in the turntable).
  if (dy) { d = rotateVector(d, right, -dy * speed); u = rotateVector(u, right, -dy * speed); }
  // Sideways: about the screen's vertical.
  if (dx) { d = rotateVector(d, u, -dx * speed); }
  d = unit(d); u = squareUp(d, u);
  return { dir: d, up: u };
}

/** Roll: the view turned about the line of sight by `angle` radians (positive = the model turns anticlockwise). */
export function rollStep(dir, up, angle) {
  const d = unit(dir) ?? [0, -1, 0];
  return { dir: d, up: squareUp(d, rotateVector(squareUp(d, up ?? WORLD_UP), d, -angle)) };
}

/**
 * The camera turned about a line in space (an edge, an axis): the view direction, up and the orbit target all
 * turn by `angle` radians about `axisDir` through `axisPoint`. The model appears to turn by −angle about it.
 */
export function orbitAboutAxis({ dir, up, target }, axisPoint, axisDir, angle) {
  const k = unit(axisDir);
  if (!k) return { dir, up, target };
  const rel = target.map((v, i) => v - axisPoint[i]);
  const t2 = rotateVector(rel, k, angle).map((v, i) => v + axisPoint[i]);
  const d = unit(rotateVector(dir, k, angle));
  return { dir: d, up: squareUp(d, rotateVector(up, k, angle)), target: t2 };
}

/**
 * The line an edge lies on (or turns about): its polyline points → { point, dir, kind: 'line' | 'circle' } or null.
 * A straight edge gives itself; a circular arc or circle gives its axis through the centre.
 */
export function edgeAxis(points) {
  if (!points || points.length < 2) return null;
  const a = points[0]; const b = points[points.length - 1];
  let far = null; let farD = -1;
  for (const p of points) { const d = Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2]); if (d > farD) { farD = d; far = p; } }
  if (farD < 1e-9) return null;
  const line = unit(far.map((v, i) => v - a[i]));
  let off = 0; let mid = null;
  for (const p of points) {
    const w = p.map((v, i) => v - a[i]); const along = dot(w, line);
    const dist = Math.hypot(w[0] - line[0] * along, w[1] - line[1] * along, w[2] - line[2] * along);
    if (dist > off) { off = dist; mid = p; }
  }
  if (off <= farD * 1e-4) return { kind: 'line', point: [...a], dir: line };
  // Three points far apart on the arc: the circle through them.
  const p1 = a; const p2 = mid; const p3 = far === mid ? b : far;
  const u = p2.map((v, i) => v - p1[i]); const v = p3.map((x, i) => x - p1[i]);
  const n = cross(u, v); const nn = dot(n, n);
  if (nn < 1e-18) return { kind: 'line', point: [...a], dir: line };
  const uu = dot(u, u); const vv = dot(v, v);
  const t1 = cross(n, u).map((x) => x * vv); const t2 = cross(v, n).map((x) => x * uu);
  const centre = p1.map((x, i) => x + (t1[i] + t2[i]) / (2 * nn));
  return { kind: 'circle', point: centre, dir: unit(n), radius: Math.hypot(...p1.map((x, i) => x - centre[i])) };
}
