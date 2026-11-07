// Simulations, baked per frame into obj.cache: rigid bodies, cloth / soft bodies (mass-spring), particles.
import { Matrix4, Vector3 } from 'three';
import { boundingBox, edgeKey, edgeMap, v3 } from './mesh.js';
import { evaluatedMesh, getObject, isVisible, worldMatrix, worldPosition } from './doc.js';

export const defaultRigidBody = (type = 'ACTIVE') => ({ type, mass: 1, restitution: 0.4, friction: 0.5, shape: 'BOX', damping: 0.04 });
export const defaultCloth = () => ({ stiffness: 0.9, damping: 0.02, mass: 1, pinGroup: '', iterations: 8, gravityScale: 1 });
export const defaultSoftBody = () => ({ stiffness: 0.4, goal: 0.2, damping: 0.05, iterations: 4 });
export const defaultField = (kind = 'WIND') => ({ kind, strength: 5, falloff: 0 });
export const defaultParticles = () => ({
  name: 'Particles', count: 500, frameStart: 1, frameEnd: 100, lifetime: 80, velocity: 2, randomVelocity: 0.5, gravity: 1, size: 0.05, seed: 1, kind: 'EMITTER', hairLength: 0.5, hairSegments: 4,
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

/**
 * Rigid bodies as axis-aligned boxes or spheres with impulse response: gravity, restitution, friction and collisions
 * with passive bodies and each other. Rotation comes from the tangential velocity at contacts (spheres only).
 * Writes obj.cache.transform[frame] for every active body. Returns how many frames were baked.
 */
export function bakeRigidBodies(doc, { start = doc.frameStart, end = doc.frameEnd, substeps = 4 } = {}) {
  const bodies = doc.objects.filter((o) => o.rigidBody && isVisible(doc, o)).map((obj) => {
    const box = worldAabb(doc, obj);
    const half = v3.mul(v3.sub(box.max, box.min), 0.5);
    const center = v3.lerp(box.min, box.max, 0.5);
    const origin = worldPosition(doc, obj);
    return {
      obj, rb: obj.rigidBody, half, radius: Math.max(...half), pos: center, offset: v3.sub(origin, center), vel: [0, 0, 0], spin: [0, 0, 0], angle: [...obj.rotation],
      invMass: obj.rigidBody.type === 'ACTIVE' ? 1 / Math.max(1e-4, obj.rigidBody.mass) : 0,
    };
  });
  const dt = 1 / doc.fps / substeps;
  const g = doc.gravity;
  const fields = doc.objects.filter((o) => o.field);
  for (const body of bodies) if (body.invMass) body.obj.cache.transform = {};
  const record = (frame) => {
    for (const b of bodies) {
      if (!b.invMass) continue;
      b.obj.cache.transform[frame] = { location: v3.add(b.pos, b.offset), rotation: [...b.angle] };
    }
  };
  record(start);
  for (let frame = start + 1; frame <= end; frame++) {
    for (let s = 0; s < substeps; s++) {
      for (const b of bodies) {
        if (!b.invMass) continue;
        let force = g;
        for (const f of fields) force = v3.add(force, fieldForce(doc, f, b.pos, b.vel));
        b.vel = v3.mul(v3.add(b.vel, v3.mul(force, dt)), 1 - b.rb.damping * dt);
        b.pos = v3.add(b.pos, v3.mul(b.vel, dt));
        b.angle = b.angle.map((a, k) => a + b.spin[k] * dt);
      }
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) collide(bodies[i], bodies[j]);
      }
    }
    record(frame);
  }
  return end - start + 1;
}

function collide(a, b) {
  if (!a.invMass && !b.invMass) return;
  const d = v3.sub(b.pos, a.pos);
  let normal;
  let depth;
  if (a.rb.shape === 'SPHERE' && b.rb.shape === 'SPHERE') {
    const dist = v3.len(d);
    depth = a.radius + b.radius - dist;
    if (depth <= 0) return;
    normal = dist > 1e-9 ? v3.mul(d, 1 / dist) : [0, 0, 1];
  } else {
    // Boxes (a sphere is its bounding box here): the axis of least overlap.
    const over = [0, 1, 2].map((k) => a.half[k] + b.half[k] - Math.abs(d[k]));
    if (over.some((x) => x <= 0)) return;
    const axis = over[0] < over[1] ? (over[0] < over[2] ? 0 : 2) : (over[1] < over[2] ? 1 : 2);
    depth = over[axis];
    normal = [0, 0, 0];
    normal[axis] = d[axis] >= 0 ? 1 : -1;
  }
  const total = a.invMass + b.invMass;
  a.pos = v3.sub(a.pos, v3.mul(normal, (depth * a.invMass) / total));
  b.pos = v3.add(b.pos, v3.mul(normal, (depth * b.invMass) / total));
  const rel = v3.sub(b.vel, a.vel);
  const vn = v3.dot(rel, normal);
  if (vn > 0) return;
  // Slow contacts do not bounce, so resting bodies settle.
  const e = Math.abs(vn) < 0.5 ? 0 : Math.min(a.rb.restitution, b.rb.restitution);
  const j = (-(1 + e) * vn) / total;
  const impulse = v3.mul(normal, j);
  a.vel = v3.sub(a.vel, v3.mul(impulse, a.invMass));
  b.vel = v3.add(b.vel, v3.mul(impulse, b.invMass));
  const tangent = v3.sub(rel, v3.mul(normal, vn));
  const tLen = v3.len(tangent);
  if (tLen > 1e-6) {
    const mu = Math.sqrt(a.rb.friction * b.rb.friction);
    const jt = Math.min(tLen / total, mu * Math.abs(j));
    const ti = v3.mul(tangent, jt / tLen);
    a.vel = v3.add(a.vel, v3.mul(ti, a.invMass));
    b.vel = v3.sub(b.vel, v3.mul(ti, b.invMass));
  }
}

/** The force of a field object on a unit mass at a point. */
export function fieldForce(doc, obj, point, velocity = [0, 0, 0]) {
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
    default: return [0, 0, 0];
  }
}

/** Colliders as spheres and boxes in world space (cloth and particles use these). */
function colliders(doc, exclude) {
  const out = [];
  for (const o of doc.objects) {
    if (o === exclude || !(o.collision || o.rigidBody?.type === 'PASSIVE') || !isVisible(doc, o)) continue;
    const box = worldAabb(doc, o);
    out.push({ box, friction: o.collision?.friction ?? 0.5 });
  }
  return out;
}

function pushOut(p, list, margin = 0.01) {
  for (const { box } of list) {
    const inside = [0, 1, 2].every((k) => p[k] > box.min[k] - margin && p[k] < box.max[k] + margin);
    if (!inside) continue;
    let best = Infinity;
    let axis = 2;
    let side = 1;
    for (let k = 0; k < 3; k++) {
      const up = box.max[k] + margin - p[k];
      const down = p[k] - (box.min[k] - margin);
      if (up < best) { best = up; axis = k; side = 1; }
      if (down < best) { best = down; axis = k; side = -1; }
    }
    p[axis] += best * side;
    return true;
  }
  return false;
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
  for (const e of edgeMap(mesh).values()) links.push([e.a, e.b, v3.dist(pos[e.a], pos[e.b]), 1]);
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
        for (let i = 0; i < pos.length; i++) if (!pinned[i]) pushOut(pos[i], walls);
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
  for (let frame = start + 1; frame <= end; frame++) {
    vel = vel.map((v, i) => {
      const toRest = v3.mul(v3.sub(rest[i], pos[i]), s.goal);
      return v3.mul(v3.add(v, v3.add(v3.mul(doc.gravity, dt), toRest)), 1 - s.damping);
    });
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
    pos.forEach((p, i) => { if (pushOut(p, walls)) vel[i] = [0, 0, 0]; });
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
