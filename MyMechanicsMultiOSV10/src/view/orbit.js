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
