// Reference planes beyond "offset from a plane": at an angle about an edge or axis, through three points,
// parallel to a plane through a point, normal to a curve at a point, mid-way between two planes (or bisecting
// them), tangent to a cylinder or cone at a point, and through a line and a point.
import { findEdges, findFace, normalize } from './refs.js';
import { codeError, frame, resolvePlane, AXES } from './features.js';

export const PLANE_MODES = ['offset', 'angle', 'threePoints', 'parallelAtPoint', 'normalToCurve', 'mid', 'tangent', 'linePoint'];

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const vec = (p) => (Array.isArray(p) ? p : p.toTuple ? p.toTuple() : [p.x, p.y, p.z]);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** v turned by `deg` about the unit axis k (Rodrigues). */
function rotate(v, k, deg) {
  const a = (deg * Math.PI) / 180; const c = Math.cos(a); const s = Math.sin(a);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}

/** An x direction in a plane of normal n (kept from `prefer` when it lies in the plane). */
function xIn(n, prefer) {
  if (prefer && Math.abs(dot(prefer, n)) < 1e-9 && len(prefer) > 0.5) return normalize(prefer);
  const seed = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  return normalize(cross(seed, n));
}

/** A line reference: a straight edge of the body ({ kind: 'edge', sig }) or a world axis ({ kind: 'axis', axis }). */
function lineOf(ref, ctx) {
  if (!ref || ref.kind === 'axis') return { p: [0, 0, 0], d: AXES[ref?.axis ?? 'z'] ?? AXES.z };
  const [edge] = findEdges(ctx.body, [ref.sig ?? ref]);
  if (!edge) throw codeError('edge-missing');
  const a = vec(edge.startPoint); const b = vec(edge.endPoint);
  if (len(sub(b, a)) < 1e-9) throw codeError('edge-not-straight');
  return { p: a, d: normalize(sub(b, a)), edge };
}

const point = (p) => { if (!Array.isArray(p) || p.length !== 3) throw codeError('no-vertex'); return p; };

/** The frame of a reference plane feature in any of the modes. */
export function planeMoreFrame(f, ctx) {
  const mode = PLANE_MODES.includes(f.mode) ? f.mode : 'offset';
  let fr;
  if (mode === 'angle') {
    const base = resolvePlane(f.base, ctx);
    const { p, d } = lineOf(f.axisRef, ctx);
    const n = normalize(rotate(base.normal, d, num(f.angle, 45)));
    fr = { origin: p, normal: n, xDir: xIn(n, d) };
  } else if (mode === 'threePoints') {
    const [a, b, c] = (f.points ?? []).map(point);
    if (!c) throw codeError('need-three-points');
    const n = cross(sub(b, a), sub(c, a));
    if (len(n) < 1e-9) throw codeError('points-in-line');
    fr = { origin: a, normal: normalize(n), xDir: normalize(sub(b, a)) };
  } else if (mode === 'parallelAtPoint') {
    const base = resolvePlane(f.base, ctx);
    fr = { origin: point(f.point), normal: base.normal, xDir: base.xDir };
  } else if (mode === 'normalToCurve') {
    const [edge] = findEdges(ctx.body, [f.edge]);
    if (!edge) throw codeError('edge-missing');
    const t = Math.max(0, Math.min(1, num(f.at, 0)));
    const o = vec(edge.pointAt(t));
    const n = normalize(vec(edge.tangentAt(t)));
    fr = { origin: o, normal: n, xDir: xIn(n) };
  } else if (mode === 'mid') {
    const a = resolvePlane(f.base, ctx); const b = resolvePlane(f.base2, ctx);
    if (Math.abs(Math.abs(dot(a.normal, b.normal)) - 1) < 1e-9) {
      // Parallel: half way between, facing like the first.
      const gap = dot(sub(b.origin, a.origin), a.normal);
      fr = { origin: add(a.origin, mul(a.normal, gap / 2)), normal: a.normal, xDir: a.xDir };
    } else {
      // Not parallel: the bisector through their line of intersection.
      const dir = normalize(cross(a.normal, b.normal));
      const n = normalize(add(a.normal, mul(b.normal, -Math.sign(dot(a.normal, b.normal)) || -1)));
      // A point on both planes: solve on the line through a.origin along the in-plane direction square to dir.
      const u = normalize(cross(dir, a.normal));
      const s = dot(sub(b.origin, a.origin), b.normal) / dot(u, b.normal);
      fr = { origin: add(a.origin, mul(u, s)), normal: n, xDir: dir };
    }
  } else if (mode === 'tangent') {
    const face = findFace(ctx.body, f.face);
    if (!face || !/CYL|CONE/.test(face.geomType)) throw codeError('face-not-cylinder');
    // The point picked on the face: the plane touches the face there.
    const p = point(f.point);
    const n = normalize(vec(face.normalAt(p)));
    fr = { origin: p, normal: n, xDir: xIn(n) };
  } else if (mode === 'linePoint') {
    const { p, d } = lineOf(f.axisRef, ctx);
    const q = point(f.point);
    const n = cross(d, sub(q, p));
    if (len(n) < 1e-9) throw codeError('points-in-line');
    fr = { origin: p, normal: normalize(n), xDir: d };
  } else throw codeError('bad-plane-mode');
  if (f.flip) fr = { ...fr, normal: mul(fr.normal, -1) };
  return frame(fr);
}
