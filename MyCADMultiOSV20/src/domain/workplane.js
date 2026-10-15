// Draft working plane: a user coordinate system on the drawing — an origin, a
// rotation of its X axis, and an elevation Z that new solids are placed at — or
// a solid's face (frame): the canvas is then that face, and solids made there stand on it.
// Typed coordinates, the grid, grid snap, ortho and the cursor readout follow it.

const finite = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export const GLOBAL_PLANE = Object.freeze({ x: 0, y: 0, angle: 0, z: 0 });

/** A working plane read from a file; null when it is the global plane. */
export function normalizeWorkPlane(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const frame = normalizeFrame(raw.frame);
  const wp = { x: finite(raw.x), y: finite(raw.y), angle: ((finite(raw.angle) % 360) + 360) % 360, z: finite(raw.z), ...(frame ? { frame } : {}) };
  return isGlobal(wp) ? null : wp;
}

export const isGlobal = (wp) => !wp || (!wp.x && !wp.y && !wp.angle && !wp.z && !wp.frame);

const trig = (wp) => {
  const a = ((wp?.angle ?? 0) * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
};

/** Drawing point → working-plane coordinates. */
export function toPlane(p, wp) {
  if (!wp) return { x: p.x, y: p.y };
  const [c, s] = trig(wp);
  const dx = p.x - wp.x;
  const dy = p.y - wp.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

/** Working-plane coordinates → drawing point. */
export function fromPlane(q, wp) {
  if (!wp) return { x: q.x, y: q.y };
  const [c, s] = trig(wp);
  return { x: wp.x + q.x * c - q.y * s, y: wp.y + q.x * s + q.y * c };
}

/** A direction (vector) in working-plane terms turned into the drawing. */
export function vectorFromPlane(v, wp) {
  if (!wp) return { x: v.x, y: v.y };
  const [c, s] = trig(wp);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/** The plane through `origin` whose X axis points at `toward`. */
export function planeFrom(origin, toward, z = 0) {
  const angle = (Math.atan2(toward.y - origin.y, toward.x - origin.x) * 180) / Math.PI;
  return normalizeWorkPlane({ x: origin.x, y: origin.y, angle, z });
}

// ───────────────────────── a working plane on a solid's face (FreeCAD: sketch attached to a face)

const unit = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * The frame of a plane through `point` with normal `normal`: x level (along the
 * face, square to the world's Z) unless the face is level, where x is the world's X.
 */
export function frameOnFace(point, normal) {
  const z = unit(normal);
  const x = Math.abs(z[2]) > 0.9 ? unit([1 - z[0] * z[0], -z[0] * z[1], -z[0] * z[2]]) : unit(cross([0, 0, 1], z));
  const y = cross(z, x);
  const round = (v) => v.map((c) => Math.round(c * 1e9) / 1e9 + 0); // (+ 0: no −0)
  return { origin: round(point), x: round(x), y: round(y), z: round(z) };
}

/** A frame read from a file (three unit axes and an origin), or null. */
export function normalizeFrame(raw) {
  const vec = (v) => (Array.isArray(v) && v.length === 3 && v.every((c) => Number.isFinite(Number(c))) ? v.map(Number) : null);
  if (!raw) return null;
  const f = { origin: vec(raw.origin), x: vec(raw.x), y: vec(raw.y), z: vec(raw.z) };
  return f.origin && f.x && f.y && f.z ? f : null;
}

/** The frame as a rigid move (3×4 row-major): plane coordinates → the drawing's 3D. */
export const frameMatrix = (f) => [f.x[0], f.y[0], f.z[0], f.origin[0], f.x[1], f.y[1], f.z[1], f.origin[1], f.x[2], f.y[2], f.z[2], f.origin[2]];
