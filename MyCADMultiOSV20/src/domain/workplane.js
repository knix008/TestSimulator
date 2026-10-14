// Draft working plane: a user coordinate system on the drawing — an origin, a
// rotation of its X axis, and an elevation Z that new solids are placed at.
// Typed coordinates, the grid, grid snap, ortho and the cursor readout follow it.

const finite = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export const GLOBAL_PLANE = Object.freeze({ x: 0, y: 0, angle: 0, z: 0 });

/** A working plane read from a file; null when it is the global plane. */
export function normalizeWorkPlane(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const wp = { x: finite(raw.x), y: finite(raw.y), angle: ((finite(raw.angle) % 360) + 360) % 360, z: finite(raw.z) };
  return isGlobal(wp) ? null : wp;
}

export const isGlobal = (wp) => !wp || (!wp.x && !wp.y && !wp.angle && !wp.z);

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
