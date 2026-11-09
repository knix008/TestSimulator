// Curved walls as a chain of short straight walls (the wall model is straight segments). Pure (no three, no DOM).
//
// The rule is the one user-drawn arc walls use (engine/planedit.js arcWallSegments): pieces of at most
// 0.3 m with a chord error of at most 1 cm, joined end to end; every piece carries
// curve: { id, cx, cz, r, a0, a1 } — the whole arc (centre, radius, start / end angle in radians, plan x / z),
// shared by all pieces of one arc, so selection, the panel and editing treat imported and drawn arcs alike.

export const ARC_MAX_SEGMENT = 0.3;
export const ARC_MAX_ERROR = 0.01;

/** Number of straight pieces for an arc of radius `r` over `sweep` radians. */
export function arcSegmentCount(r, sweep, { maxSegment = ARC_MAX_SEGMENT, maxError = ARC_MAX_ERROR } = {}) {
  const s = Math.abs(sweep);
  if (!(r > 0) || !(s > 0)) return 0;
  const byLength = Math.ceil((r * s) / maxSegment - 1e-9);
  // Chord error of a piece over angle φ: r·(1 − cos(φ / 2)) ≤ maxError.
  const phi = maxError >= r ? Math.PI : 2 * Math.acos(1 - maxError / r);
  const byError = Math.ceil(s / phi - 1e-9);
  return Math.max(1, byLength, byError);
}

/** Point of the circle (centre, r) at plan angle a (x = cx + r·cos a, z = cz + r·sin a). */
export const arcPoint = (center, r, a) => [center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)];

/**
 * The straight pieces of an arc wall from angle a0 to a1 (radians, either direction): [{ a, b, a0, a1 }]
 * (end points and the angles they span), end to end, from a0 towards a1.
 */
export function arcWallSegments(center, r, a0, a1, opts = {}) {
  const n = arcSegmentCount(r, a1 - a0, opts);
  const out = [];
  let prev = arcPoint(center, r, a0);
  for (let i = 1; i <= n; i++) {
    const t = a0 + ((a1 - a0) * i) / n;
    const p = arcPoint(center, r, t);
    out.push({ a: prev, b: p, a0: a0 + ((a1 - a0) * (i - 1)) / n, a1: t });
    prev = p;
  }
  return out;
}
