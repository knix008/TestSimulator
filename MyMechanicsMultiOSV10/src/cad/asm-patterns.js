// More component patterns (no DOM, no kernel): every instance is a rigid move of its seed, stored in the pattern
// record as { q (quaternion [x, y, z, w]), t } meaning x ↦ q·x + t, so instances follow their seed when it moves.
//   pattern driven — the moves of a part's own linear / circular pattern feature (in assembly coordinates);
//   sketch driven  — the points of a sketch: the seed moved from the sketch's first point to each other point;
//   curve driven   — equally spaced (or every `spacing`) along a curve, turned with its tangent when aligned;
//   chain          — links of a chain along a path: each next pin is `pitch` (straight line, as a link is rigid)
//                    from the previous one along the path, the link turned along that chord.
import { quatFromAxisAngle, quatMultiply, quatNormalize, rotate } from './assembly.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a); return l > 1e-12 ? scale(a, 1 / l) : null; };

export const IDENTITY = { q: [0, 0, 0, 1], t: [0, 0, 0] };

/** A component placement moved by the rigid move T. */
export function movedPlacement(c, T) {
  return { position: add(rotate(T.q, c.position), T.t), rotation: quatNormalize(quatMultiply(T.q, c.rotation)) };
}

/** The rigid move that turns by `q` about `pivot` and then carries `pivot` to `to`. */
export const moveAbout = (q, pivot, to) => ({ q, t: sub(to, rotate(q, pivot)) });

/** The shortest rotation taking unit direction a to unit direction b (a half turn about `fallback` when opposite). */
export function rotationBetween(a, b, fallback = null) {
  const u = unit(a); const v = unit(b);
  if (!u || !v) return [0, 0, 0, 1];
  const c = dot(u, v);
  if (c > 1 - 1e-12) return [0, 0, 0, 1];
  if (c < -1 + 1e-12) {
    const axis = unit(fallback ?? cross(u, Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])) ?? [0, 0, 1];
    return [axis[0], axis[1], axis[2], 0];
  }
  const ax = cross(u, v);
  return quatNormalize([ax[0], ax[1], ax[2], 1 + c]);
}

/**
 * Pattern driven: the moves of a part's pattern feature as assembly moves. `moves` are the feature's own
 * ({ kind: 'translate', v } | { kind: 'rotate', deg, origin, dir }, in part coordinates) and `host` the placement of
 * the component that has the feature: T = H · M · H⁻¹.
 */
export function featureDrivenMoves(moves, host) {
  const Hq = host.rotation; const Ht = host.position;
  const Hinv = [-Hq[0], -Hq[1], -Hq[2], Hq[3]];
  return moves.map((m) => {
    let Mq = [0, 0, 0, 1]; let Mt = [0, 0, 0];
    if (m.kind === 'translate') Mt = m.v;
    else if (m.kind === 'rotate') { Mq = quatFromAxisAngle(m.dir, m.deg); Mt = sub(m.origin, rotate(Mq, m.origin)); }
    // x ↦ H(M(H⁻¹ x)): H⁻¹ x = Hinv (x − Ht).
    const q = quatNormalize(quatMultiply(Hq, quatMultiply(Mq, Hinv)));
    const t = add(Ht, sub(rotate(Hq, Mt), rotate(q, Ht)));
    return { q, t };
  });
}

/** Sketch driven: the seed carried from the first point to each of the others (no turning). */
export function pointDrivenMoves(points) {
  const base = points[0];
  return points.slice(1).map((p) => ({ q: [0, 0, 0, 1], t: sub(p, base) }));
}

/** A polyline's cumulative lengths. */
function arcLengths(pts) { const s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + len(sub(pts[i], pts[i - 1]))); return s; }

/** The point and the unit tangent at arc length `d` along a polyline. */
function along(pts, s, d) {
  let i = 1;
  while (i < pts.length - 1 && s[i] < d) i++;
  const seg = s[i] - s[i - 1] || 1;
  const f = Math.max(0, Math.min(1, (d - s[i - 1]) / seg));
  return { point: add(pts[i - 1], scale(sub(pts[i], pts[i - 1]), f)), tangent: unit(sub(pts[i], pts[i - 1])) ?? [1, 0, 0] };
}

/**
 * Curve driven: `count` instances along the curve (the polyline `pts`, the seed sitting at its start), equally over
 * its length or `spacing` apart; `align` turns each copy with the curve's tangent (as the seed is to the start).
 */
export function curveDrivenMoves(pts, { count = 4, spacing = null, equal = true, align = true, closed = false } = {}) {
  const s = arcLengths(pts); const L = s.at(-1);
  if (!(L > 0)) return [];
  const n = Math.max(1, Math.round(count));
  const step = equal || spacing == null ? (closed ? L / n : L / Math.max(1, n - 1)) : Number(spacing);
  const start = along(pts, s, 0);
  const out = [];
  for (let i = 1; i < n; i++) {
    const d = i * step;
    if (d > L + 1e-9) break;
    const at = along(pts, s, Math.min(d, L));
    const q = align ? rotationBetween(start.tangent, at.tangent) : [0, 0, 0, 1];
    out.push(moveAbout(q, start.point, at.point));
  }
  return out;
}

/**
 * Chain: from the path's start, each next pin is the first point further along the path at straight distance
 * `pitch` from the previous pin; a link's orientation follows its chord. Stops at the path's end (or, on a closed
 * path, before running into the first link) or after `max` links. Returns the moves for the links after the seed.
 */
export function chainMoves(pts, pitch, { closed = false, max = 500 } = {}) {
  const p = Number(pitch);
  if (!(p > 0)) return [];
  const s = arcLengths(pts); const L = s.at(-1);
  // The pin positions by arc length: the next pin is where the chord from the last one reaches p.
  const pins = [{ d: 0, point: along(pts, s, 0).point }];
  for (let k = 0; k < max; k++) {
    const last = pins.at(-1);
    let lo = last.d; let hi = null;
    // March forward in small steps to bracket the crossing of |x − last| = p, then bisect.
    const stepD = Math.max(L / 2000, 1e-6);
    for (let d = last.d + stepD; d <= L + 1e-12; d += stepD) {
      if (len(sub(along(pts, s, d).point, last.point)) >= p) { hi = d; break; }
      lo = d;
    }
    if (hi == null) break;
    for (let it = 0; it < 60; it++) { const m = (lo + hi) / 2; if (len(sub(along(pts, s, m).point, last.point)) >= p) hi = m; else lo = m; }
    const point = along(pts, s, hi).point;
    if (closed && pins.length > 2 && len(sub(point, pins[0].point)) < p * 0.999 && hi > L - p * 1.5) break;
    pins.push({ d: hi, point });
  }
  if (pins.length < 3) return [];
  const chord = (i) => sub(pins[i + 1].point, pins[i].point);
  const out = [];
  for (let i = 1; i + 1 < pins.length; i++) {
    const q = rotationBetween(chord(0), chord(i));
    out.push(moveAbout(q, pins[0].point, pins[i].point));
  }
  return out;
}
