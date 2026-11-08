// Simulations, baked per frame into obj.cache: rigid bodies, cloth / soft bodies (mass-spring), particles.
import { Matrix4, Vector3 } from 'three';
import { boundingBox, closestOnTriangle, edgeKey, edgeMap, isManifold, v3, vertexNormals } from './mesh.js';
import { noise3 } from './noise.js';
import { evaluatedMesh, getObject, isVisible, sampleSpline, worldMatrix, worldPosition } from './doc.js';
import { simulateRigid } from './rigid.js';

export const RIGID_SHAPES = ['BOX', 'SPHERE', 'CAPSULE', 'CYLINDER', 'CONE', 'CONVEX_HULL', 'MESH'];
export const defaultRigidBody = (type = 'ACTIVE') => ({ type, mass: 1, restitution: 0.4, friction: 0.5, shape: 'BOX', damping: 0.04, angularDamping: 0.1, kinematic: false, enabled: true });
// Cloth: `pressure` inflates a closed mesh (Blender's internal air pressure); loose edges are sewing springs when
// `sewing` is on, pulled shut by up to `sewingForce`; self collision keeps vertices off the sheet's own faces as well.
export const defaultCloth = () => ({ stiffness: 0.9, damping: 0.02, mass: 1, pinGroup: '', iterations: 8, gravityScale: 1, selfCollision: false, selfDistance: 0.02, pressure: 0, sewing: false, sewingForce: 1 });
// Soft body: `aero` pushes the faces against the air they move through (Blender's aerodynamics, simple model);
// `selfCollision` keeps vertices `ballSize` apart from those they are not joined to. Fields act on it.
export const defaultSoftBody = () => ({ stiffness: 0.4, goal: 0.2, damping: 0.05, iterations: 4, pressure: 0, aero: 0, selfCollision: false, ballSize: 0.05 });
export const FIELD_KINDS = ['WIND', 'FORCE', 'VORTEX', 'DRAG', 'MAGNETIC', 'HARMONIC', 'TURBULENCE', 'CHARGE', 'LENNARDJ', 'GUIDE'];
export const defaultField = (kind = 'WIND') => ({ kind, strength: 5, falloff: 0, size: 1, damping: 0.1, charge: 1, curve: null, guideMinDistance: 0, guideFree: 0.5 });
export const defaultParticles = () => ({
  name: 'Particles', count: 500, frameStart: 1, frameEnd: 100, lifetime: 80, velocity: 2, randomVelocity: 0.5, gravity: 1, size: 0.05, seed: 1, kind: 'EMITTER', hairLength: 0.5, hairSegments: 4,
  bounce: 0.4, children: 0, childRadius: 0.1, renderAs: 'POINT', instanceObject: null, charge: 1,
});

function worldAabb(doc, obj) {
  const mesh = obj.type === 'MESH' ? evaluatedMesh(doc, obj) : null;
  const m = worldMatrix(doc, obj);
  if (!mesh?.verts.length) {
    const p = worldPosition(doc, obj);
    return { min: v3.sub(p, [0.5, 0.5, 0.5]), max: v3.add(p, [0.5, 0.5, 0.5]) };
  }
  const q = new Vector3();
  return boundingBox(mesh.verts.map((v) => { q.set(v[0], v[1], v[2]).applyMatrix4(m); return [q.x, q.y, q.z]; }));
}

/** Rigid bodies: rigid.js does the work. Writes obj.cache.transform[frame] for every active body and returns how many frames were baked. */
export function bakeRigidBodies(doc, { start = doc.frameStart, end = doc.frameEnd, substeps = 20 } = {}) {
  return simulateRigid(doc, { start, end, substeps, fieldForce });
}

/**
 * The force of a field object on a unit mass at a point. `charge` is the affected thing's own charge (a CHARGE field
 * pushes like charges apart and pulls unlike ones together, falling off with the square of the distance).
 */
export function fieldForce(doc, obj, point, velocity = [0, 0, 0], charge = 1) {
  const f = obj.field;
  const m = worldMatrix(doc, obj);
  const origin = worldPosition(doc, obj);
  const toPoint = v3.sub(point, origin);
  const dist = v3.len(toPoint) || 1e-6;
  const fall = f.falloff > 0 ? 1 / dist ** f.falloff : 1;
  const zAxis = new Vector3(0, 0, 1).transformDirection(m);
  switch (f.kind) {
    case 'WIND': return v3.mul([zAxis.x, zAxis.y, zAxis.z], f.strength * fall);
    case 'FORCE': return v3.mul(toPoint, (f.strength * fall) / dist);
    case 'VORTEX': return v3.mul(v3.cross([zAxis.x, zAxis.y, zAxis.z], toPoint), (f.strength * fall) / dist);
    case 'DRAG': return v3.mul(velocity, -f.strength * fall);
    case 'MAGNETIC': return v3.mul(v3.cross(velocity, [zAxis.x, zAxis.y, zAxis.z]), f.strength * fall);
    case 'HARMONIC': return v3.sub(v3.mul(toPoint, -f.strength * fall), v3.mul(velocity, f.damping ?? 0.1));
    case 'TURBULENCE': {
      const size = Math.max(1e-3, f.size ?? 1);
      const at = (o) => noise3(point[0] / size + o, point[1] / size + o * 2, point[2] / size + o * 3);
      return v3.mul([at(0), at(11), at(23)], f.strength * fall);
    }
    case 'CHARGE': return v3.mul(toPoint, (f.strength * (f.charge ?? 1) * charge) / dist ** 3);
    // Lennard-Jones: pushes hard inside `size`, pulls a little beyond it, and nothing far away.
    case 'LENNARDJ': { const r = Math.max(dist, 1e-3); const q = Math.max(1e-3, f.size ?? 1) / r; return v3.mul(toPoint, ((f.strength * 24 * (2 * q ** 12 - q ** 6)) / r) / r); }
    case 'GUIDE': return guideForce(doc, obj, point, velocity);
    default: return [0, 0, 0];
  }
}

/**
 * A curve guide: the field's own curve (or the curve object `field.curve`) pushes along itself and pulls things back
 * onto it beyond `guideMinDistance`; `guideFree` (0…1) lets them wander that much.
 */
function guideForce(doc, obj, point, velocity) {
  const f = obj.field;
  const source = f.curve ? getObject(doc, f.curve) : obj;
  if (source?.type !== 'CURVE' || !source.data?.splines?.length) return [0, 0, 0];
  const m = worldMatrix(doc, source);
  const q = new Vector3();
  let best = null;
  for (const spline of source.data.splines) {
    const pts = sampleSpline(spline, source.data.resolution ?? 12).map((p) => { q.set(p[0], p[1], p[2]).applyMatrix4(m); return [q.x, q.y, q.z]; });
    const segs = spline.cyclic ? pts.length : pts.length - 1;
    for (let i = 0; i < segs; i++) {
      const [a, b] = [pts[i], pts[(i + 1) % pts.length]];
      const ab = v3.sub(b, a);
      const len2 = v3.dot(ab, ab) || 1e-12;
      const t = Math.max(0, Math.min(1, v3.dot(v3.sub(point, a), ab) / len2));
      const c = v3.add(a, v3.mul(ab, t));
      const d = v3.dist(point, c);
      if (!best || d < best.d) best = { d, c, tangent: v3.norm(ab) };
    }
  }
  if (!best) return [0, 0, 0];
  const along = v3.mul(best.tangent, f.strength);
  const beyond = Math.max(0, best.d - (f.guideMinDistance ?? 0));
  const back = best.d > 1e-9 ? v3.mul(v3.sub(best.c, point), (f.strength * (1 - (f.guideFree ?? 0.5)) * beyond) / best.d) : [0, 0, 0];
  return v3.sub(v3.add(along, back), v3.mul(velocity, f.damping ?? 0.1));
}

/** Colliders as their real surfaces in world space, each with a coarse grid of its triangles (cloth, soft bodies and particles use these). */
function colliders(doc, exclude) {
  const out = [];
  const q = new Vector3();
  for (const o of doc.objects) {
    if (o === exclude || !(o.collision || o.rigidBody?.type === 'PASSIVE') || !isVisible(doc, o) || o.type !== 'MESH') continue;
    const mesh = evaluatedMesh(doc, o);
    if (!mesh?.faces.length) continue;
    const m = worldMatrix(doc, o);
    const verts = mesh.verts.map((v) => { q.set(v[0], v[1], v[2]).applyMatrix4(m); return [q.x, q.y, q.z]; });
    const tris = [];
    for (const f of mesh.faces) for (let i = 1; i + 1 < f.length; i++) {
      const [x, y, z] = [verts[f[0]], verts[f[i]], verts[f[i + 1]]];
      const n = v3.cross(v3.sub(y, x), v3.sub(z, x));
      const l = v3.len(n);
      if (l > 1e-12) tris.push({ a: x, b: y, c: z, n: v3.mul(n, 1 / l) });
    }
    const box = boundingBox(verts);
    const span = Math.max(...v3.sub(box.max, box.min), 1e-3);
    const cell = Math.max(span / Math.max(1, Math.cbrt(tris.length) * 2), 0.05);
    const grid = new Map();
    tris.forEach((t, id) => {
      const [lo, hi] = [0, 1, 2].map(() => 0).length ? [[0, 1, 2].map((k) => Math.floor(Math.min(t.a[k], t.b[k], t.c[k]) / cell)), [0, 1, 2].map((k) => Math.floor(Math.max(t.a[k], t.b[k], t.c[k]) / cell))] : [];
      for (let z = lo[2]; z <= hi[2]; z++) for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++) {
        const key = `${x},${y},${z}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(id);
      }
    });
    out.push({ box, tris, grid, cell, closed: isManifold(mesh), friction: o.collision?.friction ?? o.rigidBody?.friction ?? 0.5, bounce: o.collision?.bounce ?? 0.3 });
  }
  return out;
}

/**
 * Keeps a point out of the colliders, a margin off their surfaces. `prev` is where it was, which tells crossing a surface from starting behind
 * it; a closed shape has no behind. Returns the surface's normal, or null when nothing was touched. Friction takes away sideways movement.
 */
function pushOut(p, list, margin = 0.01, prev = null) {
  for (const c of list) {
    const reach = margin + (prev ? v3.len(v3.sub(p, prev)) : 0);
    if ([0, 1, 2].some((k) => p[k] < c.box.min[k] - reach || p[k] > c.box.max[k] + reach)) continue;
    const lo = [0, 1, 2].map((k) => Math.floor((p[k] - reach) / c.cell));
    const hi = [0, 1, 2].map((k) => Math.floor((p[k] + reach) / c.cell));
    let best = null;
    let bestDistance = Infinity;
    let bestPoint = null;
    for (let z = lo[2]; z <= hi[2]; z++) for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++) {
      for (const id of c.grid.get(`${x},${y},${z}`) ?? []) {
        const t = c.tris[id];
        const q = closestOnTriangle(p, t.a, t.b, t.c);
        const d = v3.dist(p, q);
        if (d < bestDistance) { bestDistance = d; best = t; bestPoint = q; }
      }
    }
    if (!best || bestDistance > reach) continue;
    const side = v3.dot(v3.sub(p, bestPoint), best.n);
    const prevSide = prev ? v3.dot(v3.sub(prev, bestPoint), best.n) : side;
    let target = null;
    if (side < 0 && (c.closed || prevSide >= 0)) target = 1;
    else if (side >= 0 && bestDistance < margin) target = 1;
    else if (side < 0 && bestDistance < margin) target = -1;
    if (target == null) continue;
    const moved = v3.add(bestPoint, v3.mul(best.n, margin * target));
    p[0] = moved[0]; p[1] = moved[1]; p[2] = moved[2];
    if (prev && c.friction > 0) {
      const delta = v3.sub(p, prev);
      const along = v3.sub(delta, v3.mul(best.n, v3.dot(delta, best.n)));
      const take = Math.min(1, c.friction);
      p[0] -= along[0] * take; p[1] -= along[1] * take; p[2] -= along[2] * take;
    }
    return { normal: v3.mul(best.n, target), bounce: c.bounce, friction: c.friction };
  }
  return null;
}

/**
 * Aerodynamics: each face resists moving through still air along its normal, by its area and the speed it moves at
 * (the part of its velocity across it), shared among its corners. Edges flying sideways feel nothing.
 */
export function aeroForces(faces, pos, vel, aero) {
  const out = pos.map(() => [0, 0, 0]);
  for (const f of faces) {
    for (let i = 1; i + 1 < f.length; i++) {
      const t = [f[0], f[i], f[i + 1]];
      const n0 = v3.cross(v3.sub(pos[t[1]], pos[t[0]]), v3.sub(pos[t[2]], pos[t[0]]));
      const area = v3.len(n0) / 2;
      if (area < 1e-12) continue;
      const n = v3.mul(n0, 1 / (2 * area));
      const v = v3.mul(v3.add(v3.add(vel[t[0]], vel[t[1]]), vel[t[2]]), 1 / 3);
      const across = v3.dot(v, n);
      const force = v3.mul(n, (-aero * area * across * Math.abs(across)) / 3);
      for (const k of t) out[k] = v3.add(out[k], force);
    }
  }
  return out;
}

/**
 * The air inside a closed cloth: one position-based balloon constraint that moves every vertex along the volume's
 * gradient towards `target` (Müller's pressure constraint). Pinned vertices stay. Returns the volume before the step.
 */
export function inflateStep(faces, pos, pinned, target, strength = 1) {
  const grad = pos.map(() => [0, 0, 0]);
  let volume = 0;
  for (const f of faces) {
    for (let i = 1; i + 1 < f.length; i++) {
      const [a, b, c] = [f[0], f[i], f[i + 1]];
      volume += v3.dot(pos[a], v3.cross(pos[b], pos[c])) / 6;
      grad[a] = v3.add(grad[a], v3.mul(v3.cross(pos[b], pos[c]), 1 / 6));
      grad[b] = v3.add(grad[b], v3.mul(v3.cross(pos[c], pos[a]), 1 / 6));
      grad[c] = v3.add(grad[c], v3.mul(v3.cross(pos[a], pos[b]), 1 / 6));
    }
  }
  let sum = 0;
  grad.forEach((g, i) => { if (!pinned[i]) sum += v3.dot(g, g); });
  if (sum < 1e-18) return volume;
  const lambda = ((target - volume) / sum) * strength;
  grad.forEach((g, i) => { if (!pinned[i]) pos[i] = v3.add(pos[i], v3.mul(g, lambda)); });
  return volume;
}

/**
 * Vertices kept off the sheet's own faces (the faces they are not a corner of), on the side they came from: so a coarse
 * sheet folding onto itself cannot pass through, which keeping vertices apart alone does not stop.
 */
export function separateFromFaces(pos, prev, pinned, faces, distance) {
  const tris = [];
  for (const f of faces) for (let i = 1; i + 1 < f.length; i++) tris.push([f[0], f[i], f[i + 1]]);
  let cell = distance * 4;
  for (const [a, b, c] of tris) cell = Math.max(cell, v3.dist(pos[a], pos[b]), v3.dist(pos[b], pos[c]), v3.dist(pos[c], pos[a]));
  const key = (x, y, z) => `${x},${y},${z}`;
  const grid = new Map();
  tris.forEach((t, id) => {
    const lo = [0, 1, 2].map((k) => Math.floor((Math.min(pos[t[0]][k], pos[t[1]][k], pos[t[2]][k]) - distance) / cell));
    const hi = [0, 1, 2].map((k) => Math.floor((Math.max(pos[t[0]][k], pos[t[1]][k], pos[t[2]][k]) + distance) / cell));
    for (let z = lo[2]; z <= hi[2]; z++) for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++) {
      const k = key(x, y, z);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(id);
    }
  });
  let moved = 0;
  for (let i = 0; i < pos.length; i++) {
    if (pinned[i]) continue;
    const p = pos[i];
    for (const id of grid.get(key(...[0, 1, 2].map((k) => Math.floor(p[k] / cell)))) ?? []) {
      const t = tris[id];
      if (t.includes(i)) continue;
      const [a, b, c] = t.map((k) => pos[k]);
      const n0 = v3.cross(v3.sub(b, a), v3.sub(c, a));
      const nl = v3.len(n0);
      if (nl < 1e-12) continue;
      const n = v3.mul(n0, 1 / nl);
      const q = closestOnTriangle(p, a, b, c);
      const before = v3.dot(v3.sub(prev[i], a), n);
      const now = v3.dot(v3.sub(p, a), n);
      const crossed = Math.sign(before) !== Math.sign(now) && before !== 0;
      const d = v3.dist(p, q);
      if (!crossed && d >= distance) continue;
      // Inside the triangle's prism only: off its edges a neighbouring face takes over.
      const inPlane = v3.sub(p, v3.mul(n, now));
      if (v3.dist(closestOnTriangle(inPlane, a, b, c), inPlane) > 1e-6 && !(!crossed && d < distance)) continue;
      const side = before === 0 ? (now >= 0 ? 1 : -1) : Math.sign(before);
      const target = v3.add(q, v3.mul(n, side * distance));
      // The vertex takes the push; the face's corners give way by a third each when they are free.
      const push = v3.sub(target, p);
      const give = t.filter((k) => !pinned[k]).length / 3;
      pos[i] = v3.add(p, v3.mul(push, 1 - give / 2));
      for (const k of t) if (!pinned[k]) pos[k] = v3.sub(pos[k], v3.mul(push, 0.5 / 3));
      moved++;
      break;
    }
  }
  return moved;
}

/** Vertices of a sheet keep apart from those they are not joined to. A hash grid finds who is near. */
function separateSelf(pos, pinned, joined, radius) {
  const cell = radius * 2;
  const grid = new Map();
  pos.forEach((p, i) => {
    const key = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)},${Math.floor(p[2] / cell)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  });
  const least = radius * 2;
  for (let i = 0; i < pos.length; i++) {
    const p = pos[i];
    const [cx, cy, cz] = [Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell)];
    for (let z = cz - 1; z <= cz + 1; z++) for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
      for (const j of grid.get(`${x},${y},${z}`) ?? []) {
        if (j <= i || joined.has(edgeKey(i, j))) continue;
        const d = v3.sub(pos[j], pos[i]);
        const l = v3.len(d);
        if (l >= least || l < 1e-9) continue;
        const push = v3.mul(d, (least - l) / l / (pinned[i] || pinned[j] ? 1 : 2));
        if (!pinned[i]) pos[i] = v3.sub(pos[i], push);
        if (!pinned[j]) pos[j] = v3.add(pos[j], push);
      }
    }
  }
}

/**
 * Position-based cloth: stretch constraints on edges, shear on face diagonals, pinned vertices (a vertex group), wind
 * and collisions. Writes obj.cache.cloth[frame] = vertices in the object's local space.
 */
export function bakeCloth(doc, obj, { start = doc.frameStart, end = doc.frameEnd } = {}) {
  const mesh = obj.data;
  const settings = obj.cloth ?? defaultCloth();
  const m = worldMatrix(doc, obj);
  const inv = new Matrix4().copy(m).invert();
  const q = new Vector3();
  let pos = mesh.verts.map((v) => { q.set(v[0], v[1], v[2]).applyMatrix4(m); return [q.x, q.y, q.z]; });
  let prev = pos.map((p) => [...p]);
  const links = [];
  // Loose edges are sewing threads when sewing is on: they pull their ends together instead of keeping a length.
  const faceEdges = new Set();
  for (const face of mesh.faces) face.forEach((a, i) => faceEdges.add(edgeKey(a, face[(i + 1) % face.length])));
  const seams = [];
  for (const e of edgeMap(mesh).values()) {
    if (settings.sewing && !faceEdges.has(edgeKey(e.a, e.b))) seams.push([e.a, e.b]);
    else links.push([e.a, e.b, v3.dist(pos[e.a], pos[e.b]), 1]);
  }
  for (const [a, b] of mesh.loose ?? []) if (settings.sewing && !seams.some((s) => edgeKey(s[0], s[1]) === edgeKey(a, b))) seams.push([a, b]);
  const seen = new Set();
  for (const face of mesh.faces) {
    if (face.length !== 4) continue;
    for (const [a, b] of [[face[0], face[2]], [face[1], face[3]]]) {
      const key = edgeKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      links.push([a, b, v3.dist(pos[a], pos[b]), 0.5]);
    }
  }
  const pinGroup = mesh.vgroups?.find((g) => g.name === settings.pinGroup);
  const pinned = pos.map((_, i) => (pinGroup?.w[i] ?? 0) > 0.5);
  const anchor = pos.map((p) => [...p]);
  const dt = 1 / doc.fps;
  const g = v3.mul(doc.gravity, settings.gravityScale);
  const fields = doc.objects.filter((o) => o.field);
  const walls = colliders(doc, obj);
  const toLocal = () => pos.map((p) => { q.set(p[0], p[1], p[2]).applyMatrix4(inv); return [q.x, q.y, q.z]; });
  obj.cache.cloth = { [start]: toLocal() };
  const k = settings.stiffness;
  const joined = new Set([...links, ...seams].map(([a, b]) => edgeKey(a, b)));
  const closedCloth = Boolean(settings.pressure) && isManifold(mesh);
  const restVolume = closedCloth ? inflateStep(mesh.faces, pos, pinned, 0, 0) : 0;
  // Points only: they must be close enough together that a neighbouring sheet cannot slip between them.
  const meanEdge = links.reduce((sum, l) => sum + (l[3] === 1 ? l[2] : 0), 0) / Math.max(1, links.filter((l) => l[3] === 1).length);
  const selfRadius = Math.max(settings.selfDistance ?? 0.02, meanEdge * 0.45);
  const substeps = 2;
  const sdt = dt / substeps;
  for (let frame = start + 1; frame <= end; frame++) {
    for (let s = 0; s < substeps; s++) {
      const next = pos.map((p, i) => {
        if (pinned[i]) return [...anchor[i]];
        const vel = v3.mul(v3.sub(p, prev[i]), 1 - settings.damping);
        let force = g;
        for (const f of fields) force = v3.add(force, fieldForce(doc, f, p, v3.mul(vel, 1 / sdt)));
        return v3.add(v3.add(p, vel), v3.mul(force, sdt * sdt));
      });
      prev = pos;
      pos = next;
      for (let it = 0; it < settings.iterations; it++) {
        for (const [a, b, rest, weight] of links) {
          const d = v3.sub(pos[b], pos[a]);
          const len = v3.len(d) || 1e-9;
          const c = v3.mul(d, ((len - rest) / len) * 0.5 * k * weight);
          if (!pinned[a]) pos[a] = v3.add(pos[a], c);
          if (!pinned[b]) pos[b] = v3.sub(pos[b], c);
        }
        // Sewing: each thread closes by at most `sewingForce` of its length per pass.
        for (const [a, b] of seams) {
          const d = v3.sub(pos[b], pos[a]);
          const c = v3.mul(d, 0.5 * Math.min(1, settings.sewingForce ?? 1) * 0.5);
          if (!pinned[a]) pos[a] = v3.add(pos[a], c);
          if (!pinned[b]) pos[b] = v3.sub(pos[b], c);
        }
        // Pressure: the closed cloth holds 10% more air than at rest for every unit (less when negative).
        if (settings.pressure && closedCloth) inflateStep(mesh.faces, pos, pinned, restVolume * Math.max(0.05, 1 + 0.1 * settings.pressure), 0.5);
      }
      for (let i = 0; i < pos.length; i++) if (!pinned[i]) pushOut(pos[i], walls, 0.01, prev[i]);
      if (settings.selfCollision) {
        separateSelf(pos, pinned, joined, selfRadius);
        separateFromFaces(pos, prev, pinned, mesh.faces, settings.selfDistance ?? 0.02);
        for (let i = 0; i < pos.length; i++) if (!pinned[i]) pushOut(pos[i], walls, 0.01, prev[i]);
      }
    }
    obj.cache.cloth[frame] = toLocal();
  }
  return end - start + 1;
}

/** Soft body: like cloth but every vertex is pulled to its rest position by `goal`. */
export function bakeSoftBody(doc, obj, { start = doc.frameStart, end = doc.frameEnd } = {}) {
  const s = obj.softBody ?? defaultSoftBody();
  const mesh = obj.data;
  const links = [...edgeMap(mesh).values()].map((e) => [e.a, e.b, v3.dist(mesh.verts[e.a], mesh.verts[e.b])]);
  const m = worldMatrix(doc, obj);
  const inv = new Matrix4().copy(m).invert();
  const q = new Vector3();
  const rest = mesh.verts.map((v) => { q.set(v[0], v[1], v[2]).applyMatrix4(m); return [q.x, q.y, q.z]; });
  let pos = rest.map((p) => [...p]);
  let vel = pos.map(() => [0, 0, 0]);
  const dt = 1 / doc.fps;
  const walls = colliders(doc, obj);
  const toLocal = () => pos.map((p) => { q.set(p[0], p[1], p[2]).applyMatrix4(inv); return [q.x, q.y, q.z]; });
  obj.cache.cloth = { [start]: toLocal() };
  const fields = doc.objects.filter((o) => o.field);
  const joined = new Set(links.map(([a, b]) => edgeKey(a, b)));
  const free = pos.map(() => false);
  for (let frame = start + 1; frame <= end; frame++) {
    // Pressure: outward along each vertex's normal, as if it were full of air.
    const push = s.pressure ? vertexNormals({ ...mesh, verts: pos }).map((n) => v3.mul(n, s.pressure * dt)) : null;
    const drag = s.aero ? aeroForces(mesh.faces, pos, vel, s.aero) : null;
    vel = vel.map((v, i) => {
      const toRest = v3.mul(v3.sub(rest[i], pos[i]), s.goal);
      let force = doc.gravity;
      for (const f of fields) force = v3.add(force, fieldForce(doc, f, pos[i], v));
      if (drag) force = v3.add(force, drag[i]);
      const moved = v3.add(v, v3.add(v3.mul(force, dt), toRest));
      return v3.mul(push ? v3.add(moved, push[i]) : moved, 1 - s.damping);
    });
    const before = pos;
    pos = pos.map((p, i) => v3.add(p, v3.mul(vel[i], dt)));
    for (let it = 0; it < s.iterations; it++) {
      for (const [a, b, len] of links) {
        const d = v3.sub(pos[b], pos[a]);
        const l = v3.len(d) || 1e-9;
        const c = v3.mul(d, ((l - len) / l) * 0.5 * s.stiffness);
        pos[a] = v3.add(pos[a], c);
        pos[b] = v3.sub(pos[b], c);
      }
    }
    if (s.selfCollision) {
      separateSelf(pos, free, joined, Math.max(1e-4, (s.ballSize ?? 0.05) / 2));
      separateFromFaces(pos, before, free, mesh.faces, Math.max(1e-4, (s.ballSize ?? 0.05) / 2));
      // What the separation moved becomes velocity, as in the edge pass.
      vel = vel.map((v, i) => v3.mul(v3.sub(pos[i], before[i]), 1 / dt));
    }
    pos.forEach((p, i) => {
      const hit = pushOut(p, walls);
      if (hit) vel[i] = v3.mul(v3.sub(vel[i], v3.mul(hit.normal, v3.dot(vel[i], hit.normal))), 1 - hit.friction);
    });
    obj.cache.cloth[frame] = toLocal();
  }
  return end - start + 1;
}

/** Repeatable generator (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Particle positions at a frame, from the emitter's mesh, computed in closed form so any frame can be drawn directly:
 * each particle has a birth frame, a birth point and velocity, then ballistic flight. Hair returns segments instead.
 */
export function particlesAt(doc, obj, system, frame = doc.frame) {
  const baked = obj.cache?.particles?.get?.(system);
  if (baked && system.kind !== 'HAIR') {
    const f = Math.max(baked.start, Math.min(baked.end, Math.round(frame)));
    return withChildren(baked.frames[f - baked.start], system);
  }
  return withChildren(ballistic(doc, obj, system, frame), system);
}

/** Children: several more around each parent, each keeping its own offset. */
function withChildren(list, system) {
  const count = Math.max(0, system.children ?? 0);
  if (!count) return list;
  const out = [...list];
  const random = rng((system.seed ?? 1) + 7);
  const offsets = Array.from({ length: count }, () => {
    const d = v3.norm([random() - 0.5, random() - 0.5, random() - 0.5]);
    return v3.mul(d, random() * (system.childRadius ?? 0.1));
  });
  for (const parent of list) {
    for (const offset of offsets) {
      if (system.kind === 'HAIR') out.push(parent.map((p, i) => v3.add(p, v3.mul(offset, parent.length > 1 ? 1 - (0.5 * i) / (parent.length - 1) : 1))));
      else out.push(v3.add(parent, offset));
    }
  }
  return out;
}

/**
 * Bakes an emitter frame by frame, so its particles feel force fields and hit colliders. Baked systems are kept beside the object and not
 * saved, like the other simulation caches. Returns how many frames were baked.
 */
export function bakeParticles(doc, obj, system, { start = doc.frameStart, end = doc.frameEnd } = {}) {
  const walls = colliders(doc, obj);
  const fields = doc.objects.filter((o) => o.field);
  const dt = 1 / doc.fps;
  const substeps = 3;
  const g = v3.mul(doc.gravity, system.gravity);
  const seeds = spawnList(doc, obj, system);
  const margin = Math.max(0.005, system.size ?? 0.05);
  const state = seeds.map((s) => ({ p: null, v: null, ...s }));
  const frames = [];
  for (let frame = start; frame <= end; frame++) {
    const shown = [];
    for (const b of state) {
      if (frame < b.birth || frame - b.birth > system.lifetime) continue;
      if (!b.p) { b.p = [...b.start]; b.v = [...b.velocity]; }
      if (frame > Math.max(start, Math.ceil(b.birth))) {
        for (let s = 0; s < substeps; s++) {
          const h = dt / substeps;
          let force = g;
          for (const f of fields) force = v3.add(force, fieldForce(doc, f, b.p, b.v, system.charge ?? 1));
          b.v = v3.add(b.v, v3.mul(force, h));
          const before = b.p;
          const next = v3.add(b.p, v3.mul(b.v, h));
          const hit = pushOut(next, walls, margin, before);
          if (hit) {
            const vn = v3.dot(b.v, hit.normal);
            if (vn < 0) {
              const tangent = v3.sub(b.v, v3.mul(hit.normal, vn));
              b.v = v3.add(v3.mul(tangent, 1 - hit.friction), v3.mul(hit.normal, -vn * (system.bounce ?? 0.4)));
            }
          }
          b.p = next;
        }
      }
      shown.push([...b.p]);
    }
    frames.push(shown);
  }
  // By the system itself: indexes change as systems come and go, and the map dies with the object's cache.
  if (!(obj.cache.particles instanceof Map)) obj.cache.particles = new Map();
  obj.cache.particles.set(system, { start, end, frames });
  return end - start + 1;
}

/** Each particle's birth frame, starting point and velocity. */
function spawnList(doc, obj, system) {
  const mesh = obj.type === 'MESH' ? evaluatedMesh(doc, obj) : null;
  const m = worldMatrix(doc, obj);
  const q = new Vector3();
  const random = rng(system.seed);
  const faces = mesh?.faces ?? [];
  const out = [];
  for (let i = 0; i < system.count; i++) {
    const birth = system.frameStart + (i / Math.max(1, system.count)) * (system.frameEnd - system.frameStart);
    const [r1, r2, r3, r4, r5] = [random(), random(), random(), random(), random()];
    let origin = [0, 0, 0];
    let normal = [0, 0, 1];
    if (faces.length) {
      const face = faces[Math.floor(r1 * faces.length)];
      const a = mesh.verts[face[0]];
      const b = mesh.verts[face[1 + Math.floor(r2 * (face.length - 2))]];
      const c = mesh.verts[face[2]];
      const [u, v] = r3 + r4 > 1 ? [1 - r3, 1 - r4] : [r3, r4];
      origin = v3.add(a, v3.add(v3.mul(v3.sub(b, a), u), v3.mul(v3.sub(c, a), v)));
      normal = v3.norm(v3.cross(v3.sub(b, a), v3.sub(c, a)));
    }
    q.set(origin[0], origin[1], origin[2]).applyMatrix4(m);
    const start = [q.x, q.y, q.z];
    q.set(normal[0], normal[1], normal[2]).transformDirection(m);
    const dir = [q.x, q.y, q.z];
    const jitter = [r5 - 0.5, random() - 0.5, random() - 0.5];
    out.push({ birth, start, dir, velocity: v3.add(v3.mul(dir, system.velocity), v3.mul(jitter, system.randomVelocity * 2)) });
  }
  return out;
}

function ballistic(doc, obj, system, frame) {
  const mesh = obj.type === 'MESH' ? evaluatedMesh(doc, obj) : null;
  const m = worldMatrix(doc, obj);
  const q = new Vector3();
  const out = [];
  const random = rng(system.seed);
  const faces = mesh?.faces ?? [];
  const g = v3.mul(doc.gravity, system.gravity);
  for (let i = 0; i < system.count; i++) {
    const birth = system.frameStart + (i / Math.max(1, system.count)) * (system.frameEnd - system.frameStart);
    const [r1, r2, r3, r4, r5] = [random(), random(), random(), random(), random()];
    let origin = [0, 0, 0];
    let normal = [0, 0, 1];
    if (faces.length) {
      const face = faces[Math.floor(r1 * faces.length)];
      const a = mesh.verts[face[0]];
      const b = mesh.verts[face[1 + Math.floor(r2 * (face.length - 2))]];
      const c = mesh.verts[face[(face.length > 3 ? 2 : 2)]];
      const [u, v] = r3 + r4 > 1 ? [1 - r3, 1 - r4] : [r3, r4];
      origin = v3.add(a, v3.add(v3.mul(v3.sub(b, a), u), v3.mul(v3.sub(c, a), v)));
      normal = v3.norm(v3.cross(v3.sub(b, a), v3.sub(c, a)));
    }
    q.set(origin[0], origin[1], origin[2]).applyMatrix4(m);
    const start = [q.x, q.y, q.z];
    q.set(normal[0], normal[1], normal[2]).transformDirection(m);
    const dir = [q.x, q.y, q.z];
    if (system.kind === 'HAIR') {
      const seg = [];
      for (let s = 0; s <= system.hairSegments; s++) {
        const t = (s / system.hairSegments) * system.hairLength;
        seg.push(v3.add(v3.add(start, v3.mul(dir, t)), v3.mul(g, 0.02 * t * t)));
      }
      out.push(seg);
      continue;
    }
    const age = (frame - birth) / doc.fps;
    if (age < 0 || frame - birth > system.lifetime) continue;
    const jitter = [(r5 - 0.5), (random() - 0.5), (random() - 0.5)];
    const vel = v3.add(v3.mul(dir, system.velocity), v3.mul(jitter, system.randomVelocity * 2));
    out.push(v3.add(v3.add(start, v3.mul(vel, age)), v3.mul(g, 0.5 * age * age)));
  }
  return out;
}

export function clearCaches(doc) {
  for (const o of doc.objects) o.cache = {};
}

export { getObject };
