// Move Face: offset, translate or rotate faces of a solid; the faces around them extend or trim to follow.
//   planar face   its plane replaced by the moved one (offset along its normal, translated by a vector — only the
//                 move across the plane changes it — or turned about an axis by an angle). The material changes
//                 only in the face's column (the region on the face's side of every neighbouring face's plane):
//                 added where the new plane lies outside the old one, taken away where it lies inside.
//   cylinder      offset: the radius changed by the distance (a hole bigger or smaller, a boss thicker or
//                 thinner), the tube between the two radii added or taken away within the face's column.
// The neighbours bounding a column must be planar (a face beside a curved one is reported).
import { rep } from './kernel.js';
import { findFace, normalize, crossV } from './refs.js';
import { codeError, sizeAround, resolveDirection } from './features.js';
import { planeFace } from './extrude-more.js';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vec = (v) => (Array.isArray(v) ? v : [v.x, v.y, v.z]);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Rodrigues: v turned about unit axis k by angle a (radians). */
function turn(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const kv = crossV(k, v); const kd = dot(k, v);
  return [0, 1, 2].map((i) => v[i] * c + kv[i] * s + k[i] * kd * (1 - c));
}

/** The half-space on the side of `normal` of the plane through `origin`, as a big slab (size L). */
function halfSpace(origin, normal, L) {
  const R = rep();
  return R.basicFaceExtrusion(planeFace(origin, normal, L), new R.Vector(mul(normalize(normal), L)));
}

/** A face's plane: { origin, normal } (outward). */
function planeOf(face) {
  const c = vec(face.center);
  return { origin: c, normal: normalize(vec(face.normalAt(c))) };
}

/**
 * The column of a face: the region on the face's side of each neighbouring face's plane, within a box of size L.
 * Neighbours: the faces sharing an edge with it (all planar).
 */
function columnOf(body, face, L) {
  const R = rep();
  const c = vec(face.center);
  let col = null;
  for (const other of body.faces) {
    if (other.isSame(face)) continue;
    if (!other.edges.some((e) => face.edges.some((g) => g.isSame(e)))) continue;
    // Another piece of the same surface (a cylinder split at its seam) is part of the face, not a neighbour.
    if (other.geomType === face.geomType && face.geomType !== 'PLANE' && sameSurface(other, face)) continue;
    if (other.geomType !== 'PLANE') throw codeError('profile-unsupported');
    const p = planeOf(other);
    // The side of that plane the face lies on (its centre, a little off the shared edge).
    const side = dot(sub(c, p.origin), p.normal) > 0 ? p.normal : mul(p.normal, -1);
    const hs = halfSpace(p.origin, side, L);
    col = col ? col.intersect(hs) : hs;
  }
  if (!col) col = R.makeBox(c.map((v) => v - L), c.map((v) => v + L));
  return col;
}

/** Whether two faces lie on the same surface (cylinders: the same axis and radius). */
function sameSurface(a, b) {
  const oc = rep().getOC();
  const cyl = (f) => { const ad = new oc.BRepAdaptor_Surface(f.wrapped, true); try { const c = ad.Cylinder(); const l = c.Location(); const d = c.Axis().Direction(); return { at: [l.X(), l.Y(), l.Z()], dir: [d.X(), d.Y(), d.Z()], r: c.Radius() }; } catch { return null; } finally { ad.delete?.(); } };
  const p = cyl(a); const q = cyl(b);
  if (!p || !q) return false;
  const off = sub(q.at, p.at); const along = dot(off, p.dir);
  return Math.abs(p.r - q.r) < 1e-7 && Math.abs(Math.abs(dot(p.dir, q.dir)) - 1) < 1e-9 && Math.hypot(...sub(off, mul(p.dir, along))) < 1e-7;
}

/** The new plane of a moved planar face, or null when it does not move. */
function movedPlane(f, plane, ctx) {
  const mode = f.mode ?? 'offset';
  if (mode === 'translate') {
    const v = f.vector?.length === 3 ? f.vector.map(Number) : mul(normalize(resolveDirection(f.direction ?? { kind: 'axis', axis: 'z' }, ctx)), num(f.distance, 2));
    return { origin: add(plane.origin, v), normal: plane.normal };
  }
  if (mode === 'rotate') {
    const axis = f.axis?.kind === 'line' ? { at: f.axis.at.map(Number), dir: normalize(f.axis.dir.map(Number)) } : { at: plane.origin, dir: normalize(resolveDirection(f.axis ?? { kind: 'axis', axis: 'x' }, ctx)) };
    const a = (num(f.angle, 10) * Math.PI) / 180;
    return { origin: add(axis.at, turn(sub(plane.origin, axis.at), axis.dir, a)), normal: turn(plane.normal, axis.dir, a) };
  }
  return { origin: add(plane.origin, mul(plane.normal, num(f.distance, 2))), normal: plane.normal };
}

/** Builds a Move Face feature on ctx.body: { body }. */
export function buildMoveFaceMore(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const faces = (f.faces ?? []).map((sig) => findFace(ctx.body, sig)).filter(Boolean);
  if (!faces.length) throw codeError('no-faces');
  const L = sizeAround(ctx) * 4 + 10;
  let body = ctx.body;
  // Each face's change is worked out on the body as it was (the faces are found there).
  const adds = []; const cuts = [];
  for (const face of faces) {
    if (face.geomType === 'PLANE') {
      const old = planeOf(face);
      const neu = movedPlane(f, old, ctx);
      const col = columnOf(ctx.body, face, L);
      // Material side of a plane: against its outward normal.
      const inOld = halfSpace(old.origin, mul(old.normal, -1), L); const outOld = halfSpace(old.origin, old.normal, L);
      const inNew = halfSpace(neu.origin, mul(neu.normal, -1), L); const outNew = halfSpace(neu.origin, neu.normal, L);
      adds.push(col.clone().intersect(outOld).intersect(inNew));
      cuts.push(col.clone().intersect(inOld).intersect(outNew));
      continue;
    }
    if (/CYL/.test(face.geomType) && (f.mode ?? 'offset') === 'offset') {
      const oc = R.getOC();
      const ad = new oc.BRepAdaptor_Surface(face.wrapped, true);
      const cy = ad.Cylinder(); const loc = cy.Location(); const ax = cy.Axis().Direction(); const r = cy.Radius();
      ad.delete?.();
      const at = [loc.X(), loc.Y(), loc.Z()]; const dir = [ax.X(), ax.Y(), ax.Z()];
      // Outward normal at the face: away from the axis (a boss) or toward it (a hole).
      const c = vec(face.center);
      const probe = (() => { const e = face.edges[0]; const q = vec(e.pointAt(0.5)); return q; })();
      const radial = normalize(sub(sub(probe, at), mul(dir, dot(sub(probe, at), dir))));
      const n = normalize(vec(face.normalAt(probe)));
      const hole = dot(n, radial) < 0;
      const d = num(f.distance, 2);
      // The face moves along its normal by d: a hole's radius shrinks by d, a boss's grows by d.
      const r2 = hole ? r - d : r + d;
      if (!(r2 > 1e-6)) throw codeError('zero-size');
      const base = sub(at, mul(dir, L)); const tube = (ra, rb) => R.makeCylinder(Math.max(ra, rb), 2 * L, base, dir).cut(R.makeCylinder(Math.min(ra, rb), 2 * L, base, dir));
      const col = columnOf(ctx.body, face, L);
      const ring = col.intersect(tube(r, r2));
      // Outward (d > 0): material added (a boss grows; a hole shrinks); inward: taken away.
      (d > 0 ? adds : cuts).push(ring);
      void c;
      continue;
    }
    throw codeError('profile-unsupported');
  }
  for (const a of adds) if (R.measureVolume(a) > 1e-12) body = body.fuse(a);
  for (const c of cuts) if (R.measureVolume(c) > 1e-12) body = body.cut(c);
  return { body };
}
