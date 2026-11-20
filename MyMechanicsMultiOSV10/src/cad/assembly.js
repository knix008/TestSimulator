// Assemblies: part instances (components) placed by a rigid transform, held together by mates
// (coincident, distance, concentric, parallel, perpendicular, angle). solveMates() moves the free
// components until every mate holds — all at once, with the same least-squares solver as the sketches —
// and tells which components are fully positioned. Interference detection intersects the parts.
import { levenbergMarquardt, jacobian, nullSpaceInfo } from './solver.js';
import { crossV, isCylinder, normalize } from './refs.js';

export const MATE_TYPES = ['coincident', 'concentric', 'distance', 'parallel', 'perpendicular', 'angle'];

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

/** Which mate types fit two references (planes ↔ planes, axes ↔ axes …), SolidWorks' order. */
export function matesFor(a, b) {
  if (!a || !b) return [];
  if (a.kind === 'plane' && b.kind === 'plane') return ['coincident', 'parallel', 'perpendicular', 'distance', 'angle'];
  if (a.kind === 'axis' && b.kind === 'axis') return ['concentric', 'parallel', 'perpendicular', 'distance', 'angle'];
  if ((a.kind === 'axis' && b.kind === 'plane') || (a.kind === 'plane' && b.kind === 'axis')) return ['coincident', 'parallel', 'perpendicular', 'distance'];
  return [];
}

function worldEntity(ent, comp) {
  return { kind: ent.kind, point: placePoint(comp, ent.point), dir: normalize(placeDir(comp, ent.dir)) };
}

/** Residuals of one mate (world entities a, b). K: a length so angular parts weigh like distances. */
function mateResiduals(m, a, b, K) {
  const flip = m.aligned === 'aligned' ? 1 : -1;
  if (m.type === 'coincident' || m.type === 'distance') {
    const d = m.type === 'distance' ? Number(m.value) || 0 : 0;
    if (a.kind === 'plane' && b.kind === 'plane') {
      // Faces against each other (anti-aligned normals) by default; "aligned" makes them face the same way.
      const n = addV(a.dir, scale(b.dir, -flip));
      return [n[0] * K, n[1] * K, n[2] * K, dot(sub(b.point, a.point), a.dir) - d * (m.flip ? -1 : 1)];
    }
    if (a.kind === 'axis' && b.kind === 'axis') {
      const c = crossV(a.dir, b.dir); const off = crossV(sub(b.point, a.point), a.dir);
      if (m.type === 'distance') return [c[0] * K, c[1] * K, c[2] * K, Math.hypot(...off) - d];
      return [c[0] * K, c[1] * K, c[2] * K, ...off];
    }
    const plane = a.kind === 'plane' ? a : b; const axis = plane === a ? b : a;
    // An axis lying in a plane (or at a distance from it).
    return [dot(axis.dir, plane.dir) * K, dot(sub(axis.point, plane.point), plane.dir) - d];
  }
  if (m.type === 'concentric') {
    const c = crossV(a.dir, b.dir); const off = crossV(sub(b.point, a.point), a.dir);
    return [c[0] * K, c[1] * K, c[2] * K, ...off];
  }
  if (m.type === 'parallel') {
    if (a.kind !== b.kind) return [dot(a.dir, b.dir) * K];
    const c = crossV(a.dir, b.dir); return [c[0] * K, c[1] * K, c[2] * K];
  }
  if (m.type === 'perpendicular') {
    if (a.kind !== b.kind) { const c = crossV(a.dir, b.dir); return [c[0] * K, c[1] * K, c[2] * K]; }
    return [dot(a.dir, b.dir) * K];
  }
  if (m.type === 'angle') {
    const target = Math.cos(((Number(m.value) || 0) * Math.PI) / 180);
    return [(dot(a.dir, b.dir) - target) * K];
  }
  return [];
}

/**
 * Moves the free components so the mates hold. `refs(mateRef)` gives a mate reference's current local entity
 * (re-read from the rebuilt part); `sizes` a typical length. Returns { ok, error, status: Map compId → 'defined' | 'under' | 'fixed', failed: [mateId] }.
 */
export function solveMates(assembly, { entity = (r) => r, size = 100 } = {}) {
  const comps = assembly.components;
  const free = comps.filter((c) => !c.fixed);
  const index = new Map(free.map((c, i) => [c.id, i]));
  const mates = assembly.mates.filter((m) => !m.suppressed && comps.some((c) => c.id === m.a.comp) && comps.some((c) => c.id === m.b.comp) && entity(m.a) && entity(m.b));
  const K = Math.max(1, size / 4);
  const base = new Map(comps.map((c) => [c.id, { position: [...c.position], rotation: [...c.rotation] }]));
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
      const a = worldEntity(entity(m.a), placementOf(m.a.comp, x));
      const b = worldEntity(entity(m.b), placementOf(m.b.comp, x));
      for (const r of mateResiduals(m, a, b, K)) out.push(Number.isFinite(r) ? r : 1e6);
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
    for (const c of free) Object.assign(c, placementOf(c.id, result.x));
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

/** "Part<2>": the instance name for the next copy of a part in the assembly. */
export function instanceName(assembly, partName, partId) {
  const count = assembly.components.filter((c) => c.part === partId).length;
  return `${partName}<${count + 1}>`;
}
