// Assemblies: part instances (components) placed by a rigid transform, held together by mates
// (standard: coincident, distance, concentric, parallel, perpendicular, angle, lock; advanced: width, symmetric,
// limit distance / angle; mechanical: gear, rack and pinion, screw, hinge). solveMates() moves the free
// components until every mate holds — all at once, with the same least-squares solver as the sketches —
// and tells which components are fully positioned. Also: exploded views, motion studies (motors drive
// components, the mates move the rest), sub-assemblies (flattenAssembly) and interference detection.
import { levenbergMarquardt, jacobian, nullSpaceInfo } from './solver.js';
import { crossV, isCylinder, normalize } from './refs.js';

export const STANDARD_MATES = ['coincident', 'concentric', 'distance', 'parallel', 'perpendicular', 'angle', 'lock'];
export const ADVANCED_MATES = ['width', 'symmetric', 'limitDistance', 'limitAngle'];
export const MECHANICAL_MATES = ['gear', 'rackPinion', 'screw', 'hinge', 'cam'];
export const MATE_TYPES = ['coincident', 'concentric', 'distance', 'parallel', 'perpendicular', 'angle', 'lock', ...ADVANCED_MATES, ...MECHANICAL_MATES];

/**
 * Which references each mate type takes and of which kind. A missing optional ref is null.
 *   any = plane | axis | point. lock only needs the refs' components.
 */
export const MATE_REFS = {
  coincident: { a: 'any', b: 'any' },
  concentric: { a: 'axis', b: 'axis' },
  distance: { a: 'any', b: 'any' },
  parallel: { a: 'plane|axis', b: 'plane|axis' },
  perpendicular: { a: 'plane|axis', b: 'plane|axis' },
  angle: { a: 'plane|axis', b: 'plane|axis' },
  lock: { a: 'comp', b: 'comp' },
  width: { a: 'plane', b: 'plane', c: 'plane', d: 'plane' },
  symmetric: { a: 'plane|axis|point', b: 'plane|axis|point', c: 'plane' },
  limitDistance: { a: 'plane|axis|point', b: 'plane|axis|point' },
  limitAngle: { a: 'plane|axis', b: 'plane|axis' },
  gear: { a: 'axis', b: 'axis' },
  rackPinion: { a: 'axis', b: 'axis|plane' },
  screw: { a: 'axis', b: 'axis' },
  hinge: { a: 'axis', b: 'axis', c: 'plane', d: 'plane' },
  cam: { a: 'plane', b: 'plane|axis|point' },
};

/** Default numeric fields of the mates that have them (the UI fills these in a new mate). */
export const MATE_DEFAULTS = {
  limitDistance: { min: 0, max: 50 },
  limitAngle: { min: 0, max: 90 },
  gear: { ratio: 1, reverse: false },
  rackPinion: { radius: 10, reverse: false },
  screw: { pitch: 1, reverse: false },
};

const REF_KEYS = ['a', 'b', 'c', 'd'];
/** The refs a mate holds (a, b and the optional c, d), in order. */
export const mateRefs = (m) => REF_KEYS.map((k) => m?.[k]).filter(Boolean);
/** The component ids a mate touches (use this instead of m.a.comp / m.b.comp when deleting components). */
export const mateComps = (m) => [...new Set(mateRefs(m).map((r) => r.comp))];
/** True when the mate touches the component. */
export const mateTouches = (m, compId) => mateRefs(m).some((r) => r.comp === compId);

// ───────────────────────── quaternions and transforms

export const quatIdentity = () => [0, 0, 0, 1];

export function quatMultiply(a, b) {
  const [ax, ay, az, aw] = a; const [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}

/** Rotation vector (axis × angle in radians) → quaternion. */
export function quatFromRotvec([x, y, z]) {
  const angle = Math.hypot(x, y, z);
  if (angle < 1e-12) return [x / 2, y / 2, z / 2, 1];
  const s = Math.sin(angle / 2) / angle;
  return [x * s, y * s, z * s, Math.cos(angle / 2)];
}

export function quatFromAxisAngle(axis, degrees) {
  const a = normalize(axis); const r = (degrees * Math.PI) / 180;
  return quatFromRotvec(a.map((v) => v * r));
}

export function quatNormalize(q) { const l = Math.hypot(...q) || 1; return q.map((v) => v / l); }

export const quatConjugate = (q) => [-q[0], -q[1], -q[2], q[3]];

/** Signed rotation (radians) about unit axis u of the rotation that takes `from` to `to` (swing–twist). */
export function twistAngle(to, from, u) {
  const r = quatMultiply(to, quatConjugate(from));
  return 2 * Math.atan2(r[0] * u[0] + r[1] * u[1] + r[2] * u[2], r[3]);
}

/** parent ∘ child placement: the child's placement given in the parent's frame → world. */
export function composePlacement(parent, child) {
  return { position: addV(parent.position, rotate(parent.rotation, child.position)), rotation: quatNormalize(quatMultiply(parent.rotation, child.rotation)) };
}

/** b's placement expressed in a's frame. */
export function relativePlacement(a, b) {
  const inv = quatConjugate(a.rotation);
  return { position: rotate(inv, sub(b.position, a.position)), rotation: quatNormalize(quatMultiply(inv, b.rotation)) };
}

export function rotate(q, v) {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}

/** Axis (unit) and angle (degrees) of a quaternion: what the kernel's rotate() takes. */
export function quatToAxisAngle(q) {
  const [x, y, z, w] = quatNormalize(q);
  const s = Math.hypot(x, y, z);
  if (s < 1e-12) return { axis: [0, 0, 1], angle: 0 };
  return { axis: [x / s, y / s, z / s], angle: (2 * Math.atan2(s, w) * 180) / Math.PI };
}

/** Local point → world for a component placement { position, rotation }. */
export const placePoint = (c, p) => { const r = rotate(c.rotation, p); return [r[0] + c.position[0], r[1] + c.position[1], r[2] + c.position[2]]; };
export const placeDir = (c, d) => rotate(c.rotation, d);

/** A part's body moved to a component's place (rotation about the part's origin, then translation). */
export function placeShape(shape, c) {
  let s = shape.clone();
  const { axis, angle } = quatToAxisAngle(c.rotation);
  if (Math.abs(angle) > 1e-9) s = s.rotate(angle, [0, 0, 0], axis);
  if (c.position.some((v) => Math.abs(v) > 1e-12)) s = s.translate(c.position);
  return s;
}

// ───────────────────────── mate entities

/**
 * A mate's reference, kept in the part's own coordinates: { comp, kind: 'plane' | 'axis' | 'point', point, dir, sig }.
 * Planes come from planar faces (point on it, outward normal), axes from cylindrical / conical faces and
 * circular edges, points from vertices.
 */
export function mateEntityOfFace(face, sigOf) {
  const sig = sigOf(face);
  if (face.geomType === 'PLANE') {
    const c = face.center; const n = normalize(vec(face.normalAt(c)));
    return { kind: 'plane', point: [c.x, c.y, c.z], dir: n, sig };
  }
  if (isCylinder(face.geomType) || face.geomType === 'CONE') {
    const axis = axisOfFace(face);
    if (axis) return { kind: 'axis', ...axis, sig };
  }
  const c = face.center; const n = face.normalAt(c);
  return { kind: 'plane', point: [c.x, c.y, c.z], dir: [n.x, n.y, n.z], sig };
}

/** A cylinder's axis from its circular edges (or its seam lines). */
export function axisOfFace(face) {
  for (const edge of face.edges ?? []) {
    if (edge.geomType !== 'CIRCLE') continue;
    const p = [0, 0.25, 0.5].map((t) => { const v = edge.pointAt(t); return [v.x, v.y, v.z]; });
    const centre = circumcentre(...p);
    const dir = normalize(crossV(sub(p[1], p[0]), sub(p[2], p[0])));
    if (dir.every(Number.isFinite)) return { point: centre, dir };
  }
  // No circle (a cut cylinder): the direction of its straight seam edges.
  for (const edge of face.edges ?? []) {
    if (edge.geomType !== 'LINE') continue;
    const s = edge.startPoint; const e = edge.endPoint;
    const c = face.center;
    return { point: [c.x, c.y, c.z], dir: normalize([e.x - s.x, e.y - s.y, e.z - s.z]) };
  }
  return null;
}

const vec = (v) => (Array.isArray(v) ? v : [v.x, v.y, v.z]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addV = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function circumcentre(a, b, c) {
  const ab = sub(b, a); const ac = sub(c, a);
  const n = crossV(ab, ac);
  const d = 2 * dot(n, n);
  if (d < 1e-18) return a;
  return addV(a, scale(addV(scale(crossV(n, ab), dot(ac, ac)), scale(crossV(ac, n), dot(ab, ab))), 1 / d));
}

// ───────────────────────── solving

/**
 * Which mate types fit two references (planes ↔ planes, axes ↔ axes …), in the usual order.
 * `group`: 'standard' (default, the original list), 'advanced', 'mechanical' or 'all' (all three, in that order).
 * Width, symmetric and hinge also need refs c (and d) — chosen after a and b.
 */
export function matesFor(a, b, group = 'standard') {
  if (!a || !b) return [];
  if (group === 'all') return [...matesFor(a, b), ...matesFor(a, b, 'advanced'), ...matesFor(a, b, 'mechanical')];
  const pp = a.kind === 'plane' && b.kind === 'plane';
  const aa = a.kind === 'axis' && b.kind === 'axis';
  const ap = (a.kind === 'axis' && b.kind === 'plane') || (a.kind === 'plane' && b.kind === 'axis');
  const pt = a.kind === 'point' && b.kind === 'point';
  if (group === 'advanced') {
    if (pp) return ['width', 'symmetric', 'limitDistance', 'limitAngle'];
    if (aa) return ['symmetric', 'limitDistance', 'limitAngle'];
    if (ap) return ['limitDistance', 'limitAngle'];
    if (pt) return ['symmetric', 'limitDistance'];
    return [];
  }
  if (group === 'mechanical') {
    if (aa) return ['gear', 'screw', 'hinge', 'rackPinion'];
    if (a.kind === 'axis' && b.kind === 'plane') return ['rackPinion'];
    // Cam: a is the cam's flat face (its outline is the cam profile), b the follower.
    if (a.kind === 'plane' && (b.kind === 'plane' || b.kind === 'axis' || b.kind === 'point')) return ['cam'];
    return [];
  }
  if (pp) return ['coincident', 'parallel', 'perpendicular', 'distance', 'angle'];
  if (aa) return ['concentric', 'parallel', 'perpendicular', 'distance', 'angle'];
  if (ap) return ['coincident', 'parallel', 'perpendicular', 'distance'];
  return [];
}

function worldEntity(ent, comp) {
  return { kind: ent.kind, point: placePoint(comp, ent.point), dir: normalize(placeDir(comp, ent.dir)) };
}

const crossK = (u, v, K) => { const c = crossV(u, v); return [c[0] * K, c[1] * K, c[2] * K]; };
const num = (v, d) => (v == null || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
/** Penalty outside [lo, hi]: 0 inside. */
const outside = (v, lo, hi) => (v < lo ? v - lo : v > hi ? v - hi : 0);

function reflectEntity(e, plane) {
  const n = plane.dir;
  return { kind: e.kind, point: sub(e.point, scale(n, 2 * dot(sub(e.point, plane.point), n))), dir: sub(e.dir, scale(n, 2 * dot(e.dir, n))) };
}

function midPlane(p, q) {
  const n = normalize(dot(p.dir, q.dir) < 0 ? sub(p.dir, q.dir) : addV(p.dir, q.dir));
  return { kind: 'plane', point: scale(addV(p.point, q.point), 0.5), dir: n };
}

/** Distance-like measure of a limit-distance mate and the residuals that keep its refs aligned. */
function limitMeasure(m, a, b, K) {
  if (a.kind === 'plane' && b.kind === 'plane') {
    const flip = m.aligned === 'aligned' ? 1 : -1;
    const n = addV(a.dir, scale(b.dir, -flip));
    return { align: [n[0] * K, n[1] * K, n[2] * K], v: dot(sub(b.point, a.point), a.dir) * (m.flip ? -1 : 1) };
  }
  if (a.kind === 'axis' && b.kind === 'axis') return { align: crossK(a.dir, b.dir, K), v: Math.hypot(...crossV(sub(b.point, a.point), a.dir)) };
  if (a.kind === 'point' && b.kind === 'point') return { align: [], v: Math.hypot(...sub(b.point, a.point)) };
  if (a.kind === 'point' || b.kind === 'point') {
    const pt = a.kind === 'point' ? a : b; const o = pt === a ? b : a;
    if (o.kind === 'plane') return { align: [], v: dot(sub(pt.point, o.point), o.dir) };
    return { align: [], v: Math.hypot(...crossV(sub(pt.point, o.point), o.dir)) };
  }
  const plane = a.kind === 'plane' ? a : b; const axis = plane === a ? b : a;
  return { align: [dot(axis.dir, plane.dir) * K], v: dot(sub(axis.point, plane.point), plane.dir) };
}

/** Rack travel direction (world): the ref's direction for an axis / edge, in the plane ⊥ pinion axis for a plane. */
function rackDirection(pinion, rack) {
  if (rack.kind === 'plane') return normalize(crossV(pinion.dir, rack.dir));
  return rack.dir;
}

/**
 * Residuals of one mate. `e` = { a, b, c, d } world entities (null when a ref is absent or not geometric),
 * `K` a length so angular parts weigh like distances, `place` = { a, b, c, d } the placements of the refs'
 * components, `start` = { a, b } the placements before the solve (used when a mate has no captured base / relative).
 * The old call form mateResiduals(m, a, b, K) still works.
 */
export function mateResiduals(m, e, K, place = {}, start = place) {
  if (e && e.kind) { e = { a: e, b: K }; K = place; place = {}; start = place; } // (m, a, b, K)
  const { a, b, c, d } = e;
  const flip = m.aligned === 'aligned' ? 1 : -1;
  switch (m.type) {
    case 'coincident':
    case 'distance': {
      const dv = m.type === 'distance' ? Number(m.value) || 0 : 0;
      if (a.kind === 'plane' && b.kind === 'plane') {
        // Faces against each other (anti-aligned normals) by default; "aligned" makes them face the same way.
        const n = addV(a.dir, scale(b.dir, -flip));
        return [n[0] * K, n[1] * K, n[2] * K, dot(sub(b.point, a.point), a.dir) - dv * (m.flip ? -1 : 1)];
      }
      if (a.kind === 'axis' && b.kind === 'axis') {
        const cr = crossK(a.dir, b.dir, K); const off = crossV(sub(b.point, a.point), a.dir);
        if (m.type === 'distance') return [...cr, Math.hypot(...off) - dv];
        return [...cr, ...off];
      }
      if (a.kind === 'point' && b.kind === 'point') {
        if (m.type === 'distance') return [Math.hypot(...sub(b.point, a.point)) - dv];
        return sub(b.point, a.point);
      }
      if (a.kind === 'point' || b.kind === 'point') {
        const pt = a.kind === 'point' ? a : b; const o = pt === a ? b : a;
        if (o.kind === 'plane') return [dot(sub(pt.point, o.point), o.dir) - dv];
        const off = crossV(sub(pt.point, o.point), o.dir);
        return m.type === 'distance' ? [Math.hypot(...off) - dv] : off;
      }
      const plane = a.kind === 'plane' ? a : b; const axis = plane === a ? b : a;
      // An axis lying in a plane (or at a distance from it).
      return [dot(axis.dir, plane.dir) * K, dot(sub(axis.point, plane.point), plane.dir) - dv];
    }
    case 'concentric': return [...crossK(a.dir, b.dir, K), ...crossV(sub(b.point, a.point), a.dir)];
    case 'parallel':
      if (a.kind !== b.kind) return [dot(a.dir, b.dir) * K];
      return crossK(a.dir, b.dir, K);
    case 'perpendicular':
      if (a.kind !== b.kind) return crossK(a.dir, b.dir, K);
      return [dot(a.dir, b.dir) * K];
    case 'angle': {
      const target = Math.cos(((Number(m.value) || 0) * Math.PI) / 180);
      return [(dot(a.dir, b.dir) - target) * K];
    }
    case 'lock': {
      const rel = m.relative ?? relativePlacement(start.a, start.b);
      const now = relativePlacement(place.a, place.b);
      let q = quatMultiply(quatConjugate(rel.rotation), now.rotation);
      if (q[3] < 0) q = q.map((v) => -v);
      return [...sub(now.position, rel.position), 2 * q[0] * K, 2 * q[1] * K, 2 * q[2] * K];
    }
    case 'width': {
      // The mid-plane of c/d (the tab) coincides with the mid-plane of a/b (the groove).
      const g = midPlane(a, b); const t = midPlane(c, d);
      return [...crossK(g.dir, t.dir, K), dot(sub(t.point, g.point), g.dir)];
    }
    case 'symmetric': {
      // b is a's mirror image in plane c.
      const r = reflectEntity(a, c);
      if (a.kind === 'point') return sub(b.point, r.point);
      if (a.kind === 'plane') return [...crossK(r.dir, b.dir, K), dot(sub(b.point, r.point), b.dir)];
      return [...crossK(r.dir, b.dir, K), ...crossV(sub(b.point, r.point), r.dir)];
    }
    case 'limitDistance': {
      const { align, v } = limitMeasure(m, a, b, K);
      return [...align, outside(v, num(m.min, 0), num(m.max, Infinity))];
    }
    case 'limitAngle': {
      // Range on the cosine (smooth): angle in [min, max] ⇔ cos in [cos max, cos min].
      const lo = Math.cos((Math.min(180, num(m.max, 180)) * Math.PI) / 180);
      const hi = Math.cos((Math.max(0, num(m.min, 0)) * Math.PI) / 180);
      return [outside(dot(a.dir, b.dir), lo, hi) * K];
    }
    case 'cam': {
      // The follower touches the cam's outline (m.profile, points in the cam component's frame), seen along
      // the cam's axis (the normal of its flat face). A flat follower: the outline's nearest point lies on
      // its face; a roller / point follower: its centre is `followerRadius` from the outline.
      const pts = (m.profile ?? []).map((q) => placePoint(place.a, q));
      if (pts.length < 3) return [0];
      const ax = a.dir;
      const flat = (v) => sub(v, scale(ax, dot(v, ax)));
      if (b.kind === 'plane') {
        let lo = Infinity;
        for (const q of pts) lo = Math.min(lo, dot(sub(q, b.point), b.dir) * (m.flip ? -1 : 1));
        return [lo, dot(ax, b.dir) * K];
      }
      const c = b.point;
      let best = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const p = flat(sub(pts[i], c)); const q = flat(sub(pts[(i + 1) % pts.length], c));
        const dd = sub(q, p); const l2 = dot(dd, dd) || 1;
        const tt = Math.max(0, Math.min(1, -dot(p, dd) / l2));
        best = Math.min(best, Math.hypot(...addV(p, scale(dd, tt))));
      }
      return [best - num(m.followerRadius, 0)];
    }
    case 'gear': {
      // θb = −ratio·θa (reverse: +ratio), each about its own axis, measured from the captured base rotations.
      const base = m.base ?? { a: start.a.rotation, b: start.b.rotation };
      const ta = twistAngle(place.a.rotation, base.a, a.dir);
      const tb = twistAngle(place.b.rotation, base.b, b.dir);
      const phi = tb + (m.reverse ? -1 : 1) * num(m.ratio, 1) * ta;
      return [Math.sin(phi) * K, (1 - Math.cos(phi)) * K];
    }
    case 'rackPinion': {
      // Rack travel along its direction = radius × pinion rotation (reverse: the other way).
      const base = m.base ?? { a: start.a.rotation, pb: start.b.position };
      const ta = twistAngle(place.a.rotation, base.a, a.dir);
      const s = dot(sub(place.b.position, base.pb), rackDirection(a, b));
      return [s - (m.reverse ? -1 : 1) * num(m.radius, 10) * ta];
    }
    case 'screw': {
      // Concentric, and b moves along the axis by pitch per turn of b relative to a.
      const base = m.base ?? { a: start.a.rotation, b: start.b.rotation, pa: start.a.position, pb: start.b.position };
      const u = a.dir;
      const turns = (twistAngle(place.b.rotation, base.b, u) - twistAngle(place.a.rotation, base.a, u)) / (2 * Math.PI);
      const t = dot(sub(sub(place.b.position, place.a.position), sub(base.pb, base.pa)), u);
      return [...crossK(a.dir, b.dir, K), ...crossV(sub(b.point, a.point), a.dir), t - (m.reverse ? -1 : 1) * num(m.pitch, 1) * turns];
    }
    case 'hinge':
      return [...mateResiduals({ type: 'concentric' }, { a, b }, K), ...mateResiduals({ type: 'coincident', aligned: m.aligned, flip: m.flip }, { a: c, b: d }, K)];
    default: return [];
  }
}

/** Refs a mate type needs (a, b always; c / d for width, symmetric and hinge). */
const requiredRefs = (type) => Object.keys(MATE_REFS[type] ?? { a: 1, b: 1 });
/** Whether a mate type reads the refs' geometry (lock does not; gear-like ones also read the placements). */
const needsGeometry = (type) => type !== 'lock';

/**
 * Stores the current relative transform of a lock mate's components (b's component in a's frame) in
 * `mate.relative`. Returns the mate.
 */
export function captureLock(assembly, mate) {
  const ca = assembly.components.find((c) => c.id === mate.a?.comp);
  const cb = assembly.components.find((c) => c.id === mate.b?.comp);
  if (ca && cb) mate.relative = relativePlacement(ca, cb);
  return mate;
}

/**
 * Stores the reference pose of a gear, rack-and-pinion or screw mate: `mate.base = { a, b, pa, pb }`
 * (the components' rotations and positions now). Angles and travel are measured from it. Returns the mate.
 */
export function captureGear(assembly, mate) {
  const ca = assembly.components.find((c) => c.id === mate.a?.comp);
  const cb = assembly.components.find((c) => c.id === mate.b?.comp);
  if (ca && cb) mate.base = { a: [...ca.rotation], b: [...cb.rotation], pa: [...ca.position], pb: [...cb.position] };
  return mate;
}

/** Captures whatever a new mate keeps from the current pose (lock → relative; gear, rackPinion, screw → base). */
export function captureMate(assembly, mate) {
  if (mate.type === 'lock') return captureLock(assembly, mate);
  if (mate.type === 'gear' || mate.type === 'rackPinion' || mate.type === 'screw') return captureGear(assembly, mate);
  return mate;
}

/**
 * Moves the free components so the mates hold. `refs(mateRef)` gives a mate reference's current local entity
 * (re-read from the rebuilt part); `sizes` a typical length. Returns { ok, error, status: Map compId → 'defined' | 'under' | 'fixed', failed: [mateId] }.
 */
export function solveMates(assembly, { entity = (r) => r, size = 100 } = {}) {
  const comps = assembly.components;
  const compIds = new Set(comps.map((c) => c.id));
  const free = comps.filter((c) => !c.fixed);
  const index = new Map(free.map((c, i) => [c.id, i]));
  const cache = new Map();
  const ent = (r) => { if (!cache.has(r)) cache.set(r, entity(r)); return cache.get(r); };
  const mates = assembly.mates.filter((m) => !m.suppressed && requiredRefs(m.type).every((k) => m[k] && compIds.has(m[k].comp) && (!needsGeometry(m.type) || ent(m[k]))));
  const K = Math.max(1, size / 4);
  const base = new Map(comps.map((c) => [c.id, { position: [...c.position], rotation: [...c.rotation] }]));
  const start = new Map(base);
  const placementOf = (id, x) => {
    const b = base.get(id);
    const i = index.get(id);
    if (i == null) return b;
    const o = i * 6;
    return { position: [b.position[0] + x[o], b.position[1] + x[o + 1], b.position[2] + x[o + 2]], rotation: quatNormalize(quatMultiply(quatFromRotvec([x[o + 3], x[o + 4], x[o + 5]]), b.rotation)) };
  };
  const residualsOf = (x, only = null) => {
    const out = [];
    for (const m of only ?? mates) {
      const e = {}; const place = {}; const st = {};
      for (const k of REF_KEYS) {
        const r = m[k];
        if (!r || !compIds.has(r.comp)) { e[k] = null; continue; }
        place[k] = placementOf(r.comp, x);
        st[k] = start.get(r.comp);
        const local = needsGeometry(m.type) ? ent(r) : null;
        e[k] = local ? worldEntity(local, place[k]) : null;
      }
      for (const r of mateResiduals(m, e, K, place, st)) out.push(Number.isFinite(r) ? r : 1e6);
    }
    return out;
  };
  const x0 = new Array(free.length * 6).fill(0);
  const result = levenbergMarquardt((x) => residualsOf(x), x0, { maxIter: 300, tol: 1e-8 });
  for (const c of free) Object.assign(c, placementOf(c.id, result.x));
  // Which mates do not hold (over defined or impossible).
  const failed = mates.filter((m) => Math.hypot(...residualsOf(result.x, [m])) > 1e-5).map((m) => m.id);
  // Fully positioned components: none of their six unknowns can move.
  const status = new Map(comps.map((c) => [c.id, c.fixed ? 'fixed' : 'under']));
  if (free.length && mates.length) {
    const sys = (x) => residualsOf(x);
    const xs = new Array(free.length * 6).fill(0);
    // Linearised about the solution (unknowns are offsets from it).
    for (const c of free) base.set(c.id, { position: [...c.position], rotation: [...c.rotation] });
    const J = jacobian(sys, xs);
    const info = nullSpaceInfo(J, xs.length, 1e-6);
    for (const c of free) {
      const o = index.get(c.id) * 6;
      if (info.fixed.slice(o, o + 6).every(Boolean)) status.set(c.id, 'defined');
    }
  }
  return { ok: result.ok, error: result.error, status, failed };
}

// ───────────────────────── exploded views

/**
 * A component's exploded placement: every step of `assembly.explode.steps` that lists it moves it by
 * dir·distance·factor (factor 0 → assembled, 1 → fully exploded). Rotation is unchanged.
 * `comp` is the component or its id. Applied whether or not `explode.on` is set (the caller decides).
 */
export function explodedPlacement(assembly, comp, factor = 1) {
  const c = typeof comp === 'string' ? assembly.components.find((x) => x.id === comp) : comp;
  if (!c) return null;
  let position = [...c.position];
  for (const step of assembly.explode?.steps ?? []) {
    if (!step.comps?.includes(c.id)) continue;
    const dir = normalize(step.dir ?? [0, 0, 0]);
    position = addV(position, scale(dir, (Number(step.distance) || 0) * factor));
  }
  return { position, rotation: [...c.rotation] };
}

/**
 * Generates explode steps: components sorted along the dominant axis of the assembly's box are pushed outward
 * from the one nearest the centre (which stays) until consecutive boxes are `spacing` apart.
 * `bodyBoxes`: Map compId → [[lo], [hi]] (world, as placed). Sets and returns `assembly.explode = { steps, on: true }`.
 */
export function autoExplode(assembly, bodyBoxes, spacing = 10) {
  const items = assembly.components.filter((c) => bodyBoxes.has(c.id) && !c.suppressed).map((c) => ({ id: c.id, box: bodyBoxes.get(c.id) }));
  const steps = [];
  if (items.length > 1) {
    const lo = [0, 1, 2].map((i) => Math.min(...items.map((t) => t.box[0][i])));
    const hi = [0, 1, 2].map((i) => Math.max(...items.map((t) => t.box[1][i])));
    const ext = [0, 1, 2].map((i) => hi[i] - lo[i]);
    const k = ext.indexOf(Math.max(...ext));
    const centre = (lo[k] + hi[k]) / 2;
    for (const t of items) t.mid = (t.box[0][k] + t.box[1][k]) / 2;
    items.sort((p, q) => p.mid - q.mid);
    let pivot = 0;
    items.forEach((t, i) => { if (Math.abs(t.mid - centre) < Math.abs(items[pivot].mid - centre)) pivot = i; });
    const shift = new Array(items.length).fill(0);
    for (let i = pivot + 1; i < items.length; i++) shift[i] = Math.max(shift[i - 1], items[i - 1].box[1][k] + shift[i - 1] + spacing - items[i].box[0][k]);
    for (let i = pivot - 1; i >= 0; i--) shift[i] = Math.min(shift[i + 1], items[i + 1].box[0][k] + shift[i + 1] - spacing - items[i].box[1][k]);
    items.forEach((t, i) => {
      if (Math.abs(shift[i]) < 1e-9) return;
      const dir = [0, 0, 0]; dir[k] = Math.sign(shift[i]);
      steps.push({ id: `explode-${steps.length + 1}`, comps: [t.id], dir, distance: Math.abs(shift[i]) });
    });
  }
  assembly.explode = { steps, on: true };
  return assembly.explode;
}

// ───────────────────────── motion study

const RPM = (2 * Math.PI) / 60;
const clonePlacement = (c) => ({ position: [...c.position], rotation: [...c.rotation] });

/** A motor's placement of its component at time t from its placement at t = 0 (`p0`) and local ref entity. */
function motorPlacement(motor, p0, local, t) {
  const point = placePoint(p0, local.point);
  const dir = normalize(placeDir(p0, local.dir));
  const speed = Number(motor.speed) || 0;
  if (motor.kind === 'linear') return { position: addV(p0.position, scale(dir, speed * t)), rotation: [...p0.rotation] };
  const q = quatFromRotvec(scale(dir, speed * RPM * t));
  return { position: addV(point, rotate(q, sub(p0.position, point))), rotation: quatNormalize(quatMultiply(q, p0.rotation)) };
}

/**
 * Runs a motion study on a clone of the assembly, forward in time. Each sub-step drives the motors' components
 * (held fixed), re-captures the gear-like mates' bases at the previous pose and solves the other components,
 * so gears, racks and screws follow over any number of turns.
 */
function motionRunner(assembly, { entity = (r) => r, size = 100 } = {}) {
  const asm = structuredClone(assembly);
  const motors = (asm.motion?.motors ?? []).map((m) => ({ m, comp: asm.components.find((c) => c.id === m.comp), local: m.ref ? entity(m.ref) : null })).filter((x) => x.comp && x.local);
  const p0 = new Map(motors.map((x) => [x.comp.id, clonePlacement(x.comp)]));
  for (const x of motors) x.comp.fixed = true;
  const coupled = asm.mates.filter((m) => !m.suppressed && (m.type === 'gear' || m.type === 'rackPinion' || m.type === 'screw'));
  const ratio = Math.max(1, ...coupled.filter((m) => m.type === 'gear').map((m) => { const r = Math.abs(num(m.ratio, 1)) || 1; return Math.max(r, 1 / r); }));
  const step = Math.PI / 12;
  const linStep = Math.min(size / 20, ...coupled.filter((m) => m.type === 'rackPinion').map((m) => Math.abs(num(m.radius, 10)) * step || Infinity), ...coupled.filter((m) => m.type === 'screw').map((m) => Math.abs(num(m.pitch, 1)) / 24 || Infinity));
  let time = 0;
  let last = { ok: true, error: 0, failed: [], status: new Map() };
  const advanceTo = (t) => {
    const dt = t - time;
    let n = 1;
    for (const x of motors) {
      const v = Math.abs(Number(x.m.speed) || 0) * Math.abs(dt);
      n = Math.max(n, x.m.kind === 'linear' ? Math.ceil(v / linStep) : Math.ceil((v * RPM * ratio) / step));
    }
    n = Math.min(n, 5000);
    for (let i = 1; i <= n; i++) {
      for (const m of coupled) captureGear(asm, m);
      const ti = time + (dt * i) / n;
      for (const x of motors) Object.assign(x.comp, motorPlacement(x.m, p0.get(x.comp.id), x.local, ti));
      if (asm.mates.length) last = solveMates(asm, { entity, size });
    }
    time = t;
    return last;
  };
  const placements = () => new Map(asm.components.map((c) => [c.id, clonePlacement(c)]));
  return { asm, advanceTo, placements };
}

/**
 * The assembly at time `time` (s) of its motion study (`assembly.motion.motors`; speeds in rpm or mm/s,
 * relative to the placement at t = 0). The assembly itself is not changed. Returns
 * { assembly (the moved clone), components, placements: Map compId → { position, rotation }, ok, failed }.
 */
export function motionFrame(assembly, time, opts = {}) {
  const run = motionRunner(assembly, opts);
  const r = run.advanceTo(Number(time) || 0);
  return { assembly: run.asm, components: run.asm.components, placements: run.placements(), ok: r.ok, failed: r.failed };
}

/** Every frame of the motion study: [Map compId → { position, rotation }], frame i at time i / fps, 0 … duration. */
export function motionFrames(assembly, { fps = 30, entity, size } = {}) {
  const duration = num(assembly.motion?.duration, 5);
  const count = Math.max(1, Math.floor(duration * fps + 1e-9) + 1);
  const run = motionRunner(assembly, { entity, size });
  const frames = [];
  for (let i = 0; i < count; i++) { run.advanceTo(i / fps); frames.push(run.placements()); }
  return frames;
}

// ───────────────────────── sub-assemblies

/**
 * Every part instance of an assembly in world placement, through sub-assemblies (components with `sub:
 * assemblyId`): [{ path: [compId, …], part, comp (the leaf component), placement: { position, rotation } }].
 * A sub-assembly that contains itself (directly or not) is not entered again; suppressed components are left out.
 */
export function flattenAssembly(project, assembly, parent = { position: [0, 0, 0], rotation: quatIdentity() }, path = [], stack = new Set()) {
  const out = [];
  if (!assembly || stack.has(assembly.id)) return out;
  stack.add(assembly.id);
  for (const c of assembly.components ?? []) {
    if (c.suppressed) continue;
    const placement = composePlacement(parent, c);
    const p = [...path, c.id];
    if (c.sub) {
      const sub = project.assemblies?.find((a) => a.id === c.sub);
      if (sub && !stack.has(sub.id)) out.push(...flattenAssembly(project, sub, placement, p, stack));
    } else if (c.part) out.push({ path: p, part: c.part, comp: c, placement });
  }
  stack.delete(assembly.id);
  return out;
}

/** Pairs of components whose solids overlap: [{ a, b, volume }]. `bodyOf(comp)` → the placed shape. */
export function interferences(assembly, bodyOf, measureVolume, minVolume = 1e-3) {
  const comps = assembly.components.filter((c) => !c.hidden && !c.suppressed);
  const placed = comps.map((c) => ({ c, s: bodyOf(c) }));
  const out = [];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]; const b = placed[j];
      if (!a.s || !b.s) continue;
      if (!boxesOverlap(a.s.boundingBox.bounds, b.s.boundingBox.bounds)) continue;
      let v = 0;
      try { v = measureVolume(a.s.intersect(b.s)); } catch { v = 0; }
      if (v > minVolume) out.push({ a: a.c.id, b: b.c.id, volume: v });
    }
  }
  return out;
}

function boxesOverlap([alo, ahi], [blo, bhi]) {
  return [0, 1, 2].every((i) => alo[i] <= bhi[i] + 1e-9 && blo[i] <= ahi[i] + 1e-9);
}

/** "Part<2>": the instance name for the next copy of a part (or sub-assembly, by its id) in the assembly. */
export function instanceName(assembly, partName, partId) {
  const count = assembly.components.filter((c) => (c.sub ? c.sub === partId : c.part === partId)).length;
  return `${partName}<${count + 1}>`;
}
