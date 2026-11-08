// Rigid bodies that tumble: extended position-based dynamics (Müller et al., "Detailed Rigid Body Simulation with XPBD", 2020) over convex
// shapes. Shapes are convex polytopes (a box, a hull, rounded ones as faceted hulls) or exact spheres; a passive mesh is its faces.
// Contacts come from separating axes and face clipping. Joints are corrections of the same kind as contacts.
import { Euler, Quaternion } from 'three';
import { evaluatedMesh, setFrame, worldMatrix } from './doc.js';
import { closestOnTriangle, v3 } from './mesh.js';

const DEG = 180 / Math.PI;
const { add, sub, mul, dot, cross } = v3;
const length = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = length(a); return l > 1e-12 ? mul(a, 1 / l) : [0, 0, 0]; };

// ─────────────── quaternions as [x, y, z, w]

const qrot = (q, v) => {
  const t = mul(cross(q, v), 2);
  return add(add(v, mul(t, q[3])), cross(q, t));
};
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qnorm = (q) => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };
/** The rotation vector taking orientation a to b, for small differences. */
const qdiff = (b, a) => { const d = qmul(b, qinv(a)); const s = d[3] < 0 ? -2 : 2; return [d[0] * s, d[1] * s, d[2] * s]; };

// ─────────────── convex hull

/** The hull of a point cloud: { verts, faces } with coplanar triangles merged into one polygon per plane, outward normals on `n`. */
export function convexHull(points) {
  const scale = Math.max(1e-9, ...points.flat().map(Math.abs));
  const eps = scale * 1e-7;
  const seen = new Map();
  const pts = [];
  for (const p of points) { const key = p.map((x) => Math.round(x / (eps * 100))).join(); if (!seen.has(key)) { seen.set(key, true); pts.push(p); } }
  if (pts.length < 4) return null;
  // A first tetrahedron from points far apart.
  const i0 = 0;
  let i1 = 1;
  for (let i = 1; i < pts.length; i++) if (length(sub(pts[i], pts[i0])) > length(sub(pts[i1], pts[i0]))) i1 = i;
  let i2 = -1;
  let best = eps;
  for (let i = 0; i < pts.length; i++) { const a = length(cross(sub(pts[i1], pts[i0]), sub(pts[i], pts[i0]))); if (a > best) { best = a; i2 = i; } }
  if (i2 < 0) return null;
  const base = cross(sub(pts[i1], pts[i0]), sub(pts[i2], pts[i0]));
  let i3 = -1;
  best = eps * scale;
  for (let i = 0; i < pts.length; i++) { const a = Math.abs(dot(base, sub(pts[i], pts[i0]))); if (a > best) { best = a; i3 = i; } }
  if (i3 < 0) return null;
  const middle = mul(add(add(pts[i0], pts[i1]), add(pts[i2], pts[i3])), 0.25);
  const makeFace = (a, b, c) => {
    let n = unit(cross(sub(pts[b], pts[a]), sub(pts[c], pts[a])));
    let tri = [a, b, c];
    if (dot(n, sub(pts[a], middle)) < 0) { tri = [a, c, b]; n = mul(n, -1); }
    return { tri, n, d: dot(n, pts[tri[0]]) };
  };
  let faces = [makeFace(i0, i1, i2), makeFace(i0, i1, i3), makeFace(i0, i2, i3), makeFace(i1, i2, i3)];
  for (let i = 0; i < pts.length; i++) {
    if (i === i0 || i === i1 || i === i2 || i === i3) continue;
    const seenFaces = faces.filter((f) => dot(f.n, pts[i]) - f.d > eps);
    if (!seenFaces.length) continue;
    const count = new Map();
    for (const f of seenFaces) for (let k = 0; k < 3; k++) {
      const [a, b] = [f.tri[k], f.tri[(k + 1) % 3]];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
    const kept = faces.filter((f) => !seenFaces.includes(f));
    for (const f of seenFaces) for (let k = 0; k < 3; k++) {
      const [a, b] = [f.tri[k], f.tri[(k + 1) % 3]];
      if (count.get(a < b ? `${a}_${b}` : `${b}_${a}`) === 1) kept.push(makeFace(a, b, i));
    }
    faces = kept;
  }
  // One polygon per plane, its corners in order around the normal.
  const planes = [];
  for (const f of faces) {
    const plane = planes.find((p) => dot(p.n, f.n) > 1 - 1e-6 && Math.abs(p.d - f.d) < eps * 100);
    if (plane) f.tri.forEach((v) => plane.ids.add(v));
    else planes.push({ n: f.n, d: f.d, ids: new Set(f.tri) });
  }
  const used = new Map();
  const verts = [];
  const idOf = (v) => { if (!used.has(v)) { used.set(v, verts.length); verts.push(pts[v]); } return used.get(v); };
  const polys = planes.map((plane) => {
    const ids = [...plane.ids];
    const centre = mul(ids.reduce((c, v) => add(c, pts[v]), [0, 0, 0]), 1 / ids.length);
    const u = unit(sub(pts[ids[0]], centre));
    const w = cross(plane.n, u);
    const angle = (v) => { const r = sub(pts[v], centre); return Math.atan2(dot(r, w), dot(r, u)); };
    // Corners that sit in a straight line along a side add nothing.
    const sorted = ids.sort((a, b) => angle(a) - angle(b));
    const corners = sorted.filter((v, i) => {
      const before = pts[sorted[(i + sorted.length - 1) % sorted.length]];
      const after = pts[sorted[(i + 1) % sorted.length]];
      return length(cross(sub(pts[v], before), sub(after, pts[v]))) > eps;
    });
    return { v: corners.map(idOf), n: plane.n };
  });
  return { verts, faces: polys };
}

// ─────────────── shapes

function polytope(verts, faces) {
  const dirs = [];
  const edges = new Set();
  for (const f of faces) f.v.forEach((a, k) => {
    const b = f.v[(k + 1) % f.v.length];
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (edges.has(key)) return;
    edges.add(key);
    const d = unit(sub(verts[b], verts[a]));
    if (!dirs.some((x) => Math.abs(dot(x, d)) > 0.9995)) dirs.push(d);
  });
  const radius = Math.max(...verts.map(length));
  return { kind: 'POLY', verts, faces, dirs, radius };
}

const boxShape = ([x, y, z]) => polytope(
  [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]],
  [{ v: [3, 2, 1, 0], n: [0, 0, -1] }, { v: [4, 5, 6, 7], n: [0, 0, 1] }, { v: [0, 1, 5, 4], n: [0, -1, 0] }, { v: [2, 3, 7, 6], n: [0, 1, 0] }, { v: [1, 2, 6, 5], n: [1, 0, 0] }, { v: [3, 0, 4, 7], n: [-1, 0, 0] }],
);
const hullShape = (points) => { const hull = convexHull(points); return hull ? polytope(hull.verts, hull.faces) : null; };
const ring = (radius, z, count = 16) => Array.from({ length: count }, (_, i) => [Math.cos((i / count) * Math.PI * 2) * radius, Math.sin((i / count) * Math.PI * 2) * radius, z]);

/** The collision parts of a body, and its inertia per unit mass as a box or a sphere would have it. */
function shapeOf(rb, half, localVerts, localFaces) {
  const radius = Math.max(...half);
  const flat = Math.max(half[0], half[1]);
  const boxInertia = [(half[1] ** 2 + half[2] ** 2) / 3, (half[0] ** 2 + half[2] ** 2) / 3, (half[0] ** 2 + half[1] ** 2) / 3];
  switch (rb.shape) {
    case 'SPHERE': return { parts: [{ kind: 'SPHERE', radius }], inertia: [0.4 * radius * radius, 0.4 * radius * radius, 0.4 * radius * radius] };
    case 'CAPSULE': {
      const tip = Math.max(0, half[2] - flat);
      const rings = [[0, 1], [0.5, Math.sqrt(0.75)], [Math.sqrt(0.75), 0.5]].flatMap(([up, wide]) => [...ring(flat * wide, tip + flat * up), ...ring(flat * wide, -tip - flat * up)]);
      const part = hullShape([...rings, [0, 0, tip + flat], [0, 0, -tip - flat]]);
      return { parts: [part ?? boxShape(half)], inertia: boxInertia };
    }
    case 'CYLINDER': {
      const part = hullShape([...ring(flat, half[2]), ...ring(flat, -half[2])]);
      const axial = 0.5 * flat * flat;
      const side = (3 * flat * flat + 4 * half[2] * half[2]) / 12;
      return { parts: [part ?? boxShape(half)], inertia: [side, side, axial] };
    }
    case 'CONE': {
      const part = hullShape([...ring(flat, -half[2]), [0, 0, half[2]]]);
      return { parts: [part ?? boxShape(half)], inertia: boxInertia };
    }
    case 'CONVEX_HULL': return { parts: [(localVerts.length >= 4 && hullShape(localVerts)) || boxShape(half)], inertia: boxInertia };
    case 'MESH': {
      if (rb.type === 'ACTIVE' || !localFaces.length) return { parts: [(localVerts.length >= 4 && hullShape(localVerts)) || boxShape(half)], inertia: boxInertia };
      // A surface: every face on its own, seen from both sides.
      const parts = localFaces.filter((f) => f.length >= 3).map((f) => {
        const verts = f.map((v) => localVerts[v]);
        let n = [0, 0, 0];
        for (let i = 1; i + 1 < verts.length; i++) n = add(n, cross(sub(verts[i], verts[0]), sub(verts[i + 1], verts[0])));
        n = unit(n);
        const ids = verts.map((_, i) => i);
        return polytope(verts, [{ v: ids, n }, { v: [...ids].reverse(), n: mul(n, -1) }]);
      });
      return { parts, inertia: boxInertia };
    }
    default: return { parts: [boxShape(half)], inertia: boxInertia };
  }
}

/** The part's corners and faces where the body is now. Computed once per substep. */
function placed(part, body) {
  if (part.stamp === body.stamp) return part.world;
  part.stamp = body.stamp;
  if (part.kind === 'SPHERE') { part.world = { centre: body.x, radius: part.radius, min: sub(body.x, [part.radius, part.radius, part.radius]), max: add(body.x, [part.radius, part.radius, part.radius]) }; return part.world; }
  const verts = part.verts.map((v) => add(body.x, qrot(body.q, v)));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of verts) for (let k = 0; k < 3; k++) { if (p[k] < min[k]) min[k] = p[k]; if (p[k] > max[k]) max[k] = p[k]; }
  part.world = { verts, normals: part.faces.map((f) => qrot(body.q, f.n)), dirs: part.dirs.map((d) => qrot(body.q, d)), min, max };
  return part.world;
}

const overlapBoxes = (a, b) => a.min[0] <= b.max[0] && a.max[0] >= b.min[0] && a.min[1] <= b.max[1] && a.max[1] >= b.min[1] && a.min[2] <= b.max[2] && a.max[2] >= b.min[2];

// ─────────────── contact: separating axes, then clipping the touching face against the other's sides

function clipPolygon(polygon, origin, normal) {
  const out = [];
  for (let i = 0; i < polygon.length; i++) {
    const [p, q] = [polygon[i], polygon[(i + 1) % polygon.length]];
    const [dp, dq] = [dot(normal, sub(p, origin)), dot(normal, sub(q, origin))];
    if (dp <= 0) out.push(p);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) out.push(add(p, mul(sub(q, p), dp / (dp - dq))));
  }
  return out;
}

const support = (verts, dir) => { let best = -Infinity; for (const v of verts) { const d = dot(v, dir); if (d > best) best = d; } return best; };

function polyPoly(partA, wa, partB, wb) {
  // Least separation over the face normals of each, then over edge pairs.
  let bestA = { sep: -Infinity, face: -1 };
  for (let f = 0; f < wa.normals.length; f++) {
    const sep = -support(wb.verts, mul(wa.normals[f], -1)) - dot(wa.normals[f], wa.verts[partA.faces[f].v[0]]);
    if (sep > 0) return null;
    if (sep > bestA.sep) bestA = { sep, face: f };
  }
  let bestB = { sep: -Infinity, face: -1 };
  for (let f = 0; f < wb.normals.length; f++) {
    const sep = -support(wa.verts, mul(wb.normals[f], -1)) - dot(wb.normals[f], wb.verts[partB.faces[f].v[0]]);
    if (sep > 0) return null;
    if (sep > bestB.sep) bestB = { sep, face: f };
  }
  let bestE = { sep: -Infinity, n: null };
  if (wa.dirs.length * wb.dirs.length <= 400) {
    const centreA = mul(wa.verts.reduce((c, v) => add(c, v), [0, 0, 0]), 1 / wa.verts.length);
    const centreB = mul(wb.verts.reduce((c, v) => add(c, v), [0, 0, 0]), 1 / wb.verts.length);
    for (const da of wa.dirs) for (const db of wb.dirs) {
      const c = cross(da, db);
      const l = length(c);
      if (l < 1e-5) continue;
      let n = mul(c, 1 / l);
      if (dot(n, sub(centreB, centreA)) < 0) n = mul(n, -1);
      const sep = -support(wb.verts, mul(n, -1)) - support(wa.verts, n);
      if (sep > 0) return null;
      if (sep > bestE.sep) bestE = { sep, n };
    }
  }
  const faceSep = Math.max(bestA.sep, bestB.sep);
  // Faces are preferred: their contacts are steadier, and an edge has to be clearly the better answer.
  if (bestE.n && bestE.sep > faceSep + 1e-3) {
    const n = bestE.n;
    const tipA = support(wa.verts, n);
    const tipB = -support(wb.verts, mul(n, -1));
    const ofA = wa.verts.filter((v) => dot(v, n) > tipA - 1e-4);
    const ofB = wb.verts.filter((v) => dot(v, n) < tipB + 1e-4);
    const mean = (list) => mul(list.reduce((c, v) => add(c, v), [0, 0, 0]), 1 / list.length);
    const middle = mul(add(mean(ofA), mean(ofB)), 0.5);
    const depth = -bestE.sep;
    return [{ pa: add(middle, mul(n, depth / 2)), pb: sub(middle, mul(n, depth / 2)), n, depth }];
  }
  const useA = bestA.sep >= bestB.sep - 1e-4;
  const [refPart, refWorld, incPart, incWorld, refFace] = useA ? [partA, wa, partB, wb, bestA.face] : [partB, wb, partA, wa, bestB.face];
  const normal = refWorld.normals[refFace];
  let incident = 0;
  let lowest = Infinity;
  for (let f = 0; f < incWorld.normals.length; f++) { const d = dot(incWorld.normals[f], normal); if (d < lowest) { lowest = d; incident = f; } }
  let polygon = incPart.faces[incident].v.map((v) => incWorld.verts[v]);
  const corners = refPart.faces[refFace].v.map((v) => refWorld.verts[v]);
  for (let i = 0; i < corners.length && polygon.length; i++) {
    const [p, q] = [corners[i], corners[(i + 1) % corners.length]];
    polygon = clipPolygon(polygon, p, cross(sub(q, p), normal));
  }
  const toward = useA ? normal : mul(normal, -1); // from A to B
  const planeAt = corners[0];
  let found = [];
  for (const p of polygon) {
    const height = dot(normal, sub(p, planeAt));
    if (height > 1e-5) continue;
    const onRef = sub(p, mul(normal, height));
    found.push(useA ? { pa: onRef, pb: p, n: toward, depth: -height } : { pa: p, pb: onRef, n: toward, depth: -height });
  }
  // Four points hold a face: the deepest, and those farthest from it and each other.
  if (found.length > 4) {
    const point = (c) => (useA ? c.pb : c.pa);
    const first = found.reduce((m, c) => (c.depth > m.depth ? c : m));
    const second = found.reduce((m, c) => (length(sub(point(c), point(first))) > length(sub(point(m), point(first))) ? c : m));
    const side = sub(point(second), point(first));
    const area = (c) => dot(cross(side, sub(point(c), point(first))), normal);
    const third = found.reduce((m, c) => (area(c) > area(m) ? c : m));
    const fourth = found.reduce((m, c) => (area(c) < area(m) ? c : m));
    found = [...new Set([first, second, third, fourth])];
  }
  return found.length ? found : null;
}

function spherePoly(wa, partB, wb) {
  const c = wa.centre;
  // The closest point on the shape, or, from inside, the nearest face.
  let inside = true;
  let shallow = { sep: -Infinity, face: -1 };
  for (let f = 0; f < wb.normals.length; f++) {
    const sep = dot(wb.normals[f], sub(c, wb.verts[partB.faces[f].v[0]]));
    if (sep > 0) inside = false;
    if (sep > shallow.sep) shallow = { sep, face: f };
  }
  if (inside) {
    const toSphere = wb.normals[shallow.face]; // from the shape towards the sphere
    const n = mul(toSphere, -1);
    const depth = wa.radius - shallow.sep;
    return [{ pa: add(c, mul(n, wa.radius)), pb: sub(c, mul(toSphere, shallow.sep)), n, depth }];
  }
  let nearest = null;
  let nearestDistance = Infinity;
  for (const face of partB.faces) {
    const v = face.v;
    for (let i = 1; i + 1 < v.length; i++) {
      const p = closestOnTriangle(c, wb.verts[v[0]], wb.verts[v[i]], wb.verts[v[i + 1]]);
      const d = length(sub(c, p));
      if (d < nearestDistance) { nearestDistance = d; nearest = p; }
    }
  }
  if (!nearest || nearestDistance >= wa.radius) return null;
  const n = nearestDistance > 1e-9 ? mul(sub(nearest, c), 1 / nearestDistance) : [0, 0, -1];
  return [{ pa: add(c, mul(n, wa.radius)), pb: nearest, n, depth: wa.radius - nearestDistance }];
}

function partContacts(partA, a, partB, b) {
  const [wa, wb] = [placed(partA, a), placed(partB, b)];
  if (!overlapBoxes(wa, wb)) return null;
  if (partA.kind === 'SPHERE' && partB.kind === 'SPHERE') {
    const d = sub(wb.centre, wa.centre);
    const l = length(d);
    if (l >= wa.radius + wb.radius) return null;
    const n = l > 1e-9 ? mul(d, 1 / l) : [0, 0, 1];
    return [{ pa: add(wa.centre, mul(n, wa.radius)), pb: sub(wb.centre, mul(n, wb.radius)), n, depth: wa.radius + wb.radius - l }];
  }
  if (partA.kind === 'SPHERE') return spherePoly(wa, partB, wb);
  if (partB.kind === 'SPHERE') {
    const flipped = spherePoly(wb, partA, wa);
    return flipped && flipped.map((c) => ({ pa: c.pb, pb: c.pa, n: mul(c.n, -1), depth: c.depth }));
  }
  return polyPoly(partA, wa, partB, wb);
}

// ─────────────── corrections

const applyInvI = (b, v) => {
  if (!b.invM) return [0, 0, 0];
  const l = qrot(qinv(b.q), v);
  return qrot(b.q, [l[0] * b.invI[0], l[1] * b.invI[1], l[2] * b.invI[2]]);
};
const generalInverse = (b, r, n) => { if (!b.invM || b.asleep) return 0; const c = cross(r, n); return b.invM + dot(c, applyInvI(b, c)); };

/** Moves a by +p and b by -p at their contact arms, c being how much of n to take up. Returns the multiplier. */
function positional(a, b, ra, rb, n, c, compliance, h) {
  const w = generalInverse(a, ra, n) + generalInverse(b, rb, n);
  const alpha = compliance / (h * h);
  if (w + alpha <= 0) return 0;
  const lambda = c / (w + alpha);
  const p = mul(n, lambda);
  if (a.invM && !a.asleep) {
    a.x = add(a.x, mul(p, a.invM));
    const t = applyInvI(a, cross(ra, p));
    a.q = qnorm([a.q[0] + 0.5 * (t[0] * a.q[3] + t[1] * a.q[2] - t[2] * a.q[1]), a.q[1] + 0.5 * (-t[0] * a.q[2] + t[1] * a.q[3] + t[2] * a.q[0]), a.q[2] + 0.5 * (t[0] * a.q[1] - t[1] * a.q[0] + t[2] * a.q[3]), a.q[3] + 0.5 * (-t[0] * a.q[0] - t[1] * a.q[1] - t[2] * a.q[2])]);
  }
  if (b.invM && !b.asleep) {
    b.x = sub(b.x, mul(p, b.invM));
    const t = mul(applyInvI(b, cross(rb, p)), -1);
    b.q = qnorm([b.q[0] + 0.5 * (t[0] * b.q[3] + t[1] * b.q[2] - t[2] * b.q[1]), b.q[1] + 0.5 * (-t[0] * b.q[2] + t[1] * b.q[3] + t[2] * b.q[0]), b.q[2] + 0.5 * (t[0] * b.q[1] - t[1] * b.q[0] + t[2] * b.q[3]), b.q[3] + 0.5 * (-t[0] * b.q[0] - t[1] * b.q[1] - t[2] * b.q[2])]);
  }
  return lambda;
}

/** Turns a by +turn and b by -turn, as far as their inertia allows. */
function angular(a, b, turn, h, compliance = 0) {
  const theta = length(turn);
  if (theta < 1e-10) return 0;
  const n = mul(turn, 1 / theta);
  const w = (a.invM ? dot(n, applyInvI(a, n)) : 0) + (b.invM ? dot(n, applyInvI(b, n)) : 0);
  const alpha = compliance / (h * h);
  if (w + alpha <= 0) return 0;
  const lambda = theta / (w + alpha);
  const p = mul(n, lambda);
  const spin = (body, sign) => {
    if (!body.invM) return;
    const t = mul(applyInvI(body, p), sign * 0.5);
    body.q = qnorm(add4(body.q, qmul([t[0], t[1], t[2], 0], body.q)));
  };
  spin(a, 1);
  spin(b, -1);
  return lambda;
}
const add4 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];

// ─────────────── joints

export const RIGID_CONSTRAINT_TYPES = ['FIXED', 'POINT', 'HINGE', 'SLIDER', 'PISTON', 'GENERIC', 'GENERIC_SPRING', 'MOTOR'];

export const defaultRigidConstraint = (type = 'FIXED') => ({
  type, enabled: true, object1: null, object2: null, disableCollisions: true, breaking: false, breakingThreshold: 10,
  useLimitLin: false, limitLinLower: -1, limitLinUpper: 1, useLimitAng: false, limitAngLower: -45, limitAngUpper: 45,
  springStiffness: 40, springDamping: 0.5, useMotorLin: false, motorLinVelocity: 1, useMotorAng: true, motorAngVelocity: 90, motorMaxImpulse: 1,
});

/** How the form shows a constraint's settings: the same shape modifiers and constraints use. */
export const RIGID_CONSTRAINT_PROPS = {
  object1: { def: null, object: 'MESH' }, object2: { def: null, object: 'MESH' }, disableCollisions: { def: true },
  breaking: { def: false }, breakingThreshold: { def: 10, min: 0, step: 1 },
  useLimitLin: { def: false }, limitLinLower: { def: -1, step: 0.1 }, limitLinUpper: { def: 1, step: 0.1 },
  useLimitAng: { def: false }, limitAngLower: { def: -45, step: 5 }, limitAngUpper: { def: 45, step: 5 },
  springStiffness: { def: 40, min: 0, step: 1 }, springDamping: { def: 0.5, min: 0, step: 0.1 },
  useMotorLin: { def: false }, motorLinVelocity: { def: 1, step: 0.1 }, useMotorAng: { def: true }, motorAngVelocity: { def: 90, step: 5 }, motorMaxImpulse: { def: 1, min: 0, step: 0.1 },
};

const axisOf = (frame, k) => qrot(frame, k === 0 ? [1, 0, 0] : k === 1 ? [0, 1, 0] : [0, 0, 1]);

function solveJoint(j, h) {
  if (j.broken) return;
  const { a, b } = j;
  const c = j.settings;
  const [ra, rb] = [qrot(a.q, j.la), qrot(b.q, j.lb)];
  const [pa, pb] = [add(a.x, ra), add(b.x, rb)];
  const d = sub(pb, pa);
  const [fa, fb] = [qmul(a.q, j.qa), qmul(b.q, j.qb)];
  let force = 0;
  const closeAll = () => { const l = length(d); if (l > 1e-10) force = Math.max(force, Math.abs(positional(a, b, ra, rb, mul(d, 1 / l), l, 0, h))); };
  const lockTurn = () => { force = Math.max(force, Math.abs(angular(a, b, qdiff(fb, fa), h))); };
  const alignAxis = (k) => { force = Math.max(force, Math.abs(angular(a, b, cross(axisOf(fa, k), axisOf(fb, k)), h))); };
  /** Along a frame's axis only the limits hold; the rest of the offset must go. */
  const slide = (axis) => {
    const along = dot(d, axis);
    const across = sub(d, mul(axis, along));
    const l = length(across);
    if (l > 1e-10) force = Math.max(force, Math.abs(positional(a, b, ra, rb, mul(across, 1 / l), l, 0, h)));
    if (c.useLimitLin) {
      const clamped = Math.min(c.limitLinUpper, Math.max(c.limitLinLower, along));
      if (along !== clamped) positional(a, b, ra, rb, axis, along - clamped, 0, h);
    }
  };
  /** The angle about an axis from a's frame to b's, and its limit. */
  const limitAngle = (axis, xa, xb) => {
    if (!c.useLimitAng) return;
    const angle = Math.atan2(dot(cross(xa, xb), axis), dot(xa, xb));
    const [lo, hi] = [c.limitAngLower / DEG, c.limitAngUpper / DEG];
    const clamped = Math.min(hi, Math.max(lo, angle));
    if (angle !== clamped) angular(a, b, mul(axis, angle - clamped), h);
  };
  switch (c.type) {
    case 'FIXED': closeAll(); lockTurn(); break;
    case 'POINT': closeAll(); break;
    case 'HINGE': closeAll(); alignAxis(2); limitAngle(axisOf(fa, 2), axisOf(fa, 0), axisOf(fb, 0)); break;
    case 'SLIDER': lockTurn(); slide(axisOf(fa, 0)); break;
    case 'PISTON': alignAxis(0); slide(axisOf(fa, 0)); limitAngle(axisOf(fa, 0), axisOf(fa, 1), axisOf(fb, 1)); break;
    case 'GENERIC': {
      // Each linear axis held to its range, each turning axis too; without limits it is free.
      if (c.useLimitLin) for (let k = 0; k < 3; k++) {
        const axis = axisOf(fa, k);
        const along = dot(d, axis);
        const clamped = Math.min(c.limitLinUpper, Math.max(c.limitLinLower, along));
        if (along !== clamped) positional(a, b, ra, rb, axis, along - clamped, 0, h);
      }
      if (c.useLimitAng) for (let k = 0; k < 3; k++) limitAngle(axisOf(fa, k), axisOf(fa, (k + 1) % 3), axisOf(fb, (k + 1) % 3));
      break;
    }
    case 'GENERIC_SPRING': {
      const l = length(d);
      if (l > 1e-10) positional(a, b, ra, rb, mul(d, 1 / l), l, 1 / Math.max(1e-6, c.springStiffness), h);
      break;
    }
    default: break; // A motor works on velocities alone.
  }
  // force / h² is the constraint's force in newtons.
  if (c.breaking && force / (h * h) > c.breakingThreshold) j.broken = true;
}

function jointVelocities(j, h) {
  if (j.broken) return;
  const c = j.settings;
  const { a, b } = j;
  const fa = qmul(a.q, j.qa);
  if (c.type === 'GENERIC_SPRING' && c.springDamping > 0) {
    const [ra, rb] = [qrot(a.q, j.la), qrot(b.q, j.lb)];
    const rel = sub(add(b.v, cross(b.w, rb)), add(a.v, cross(a.w, ra)));
    const factor = Math.min(1, c.springDamping * h);
    const speed = length(rel);
    if (speed > 1e-9) velocityImpulse(a, b, ra, rb, mul(rel, 1 / speed), speed * factor);
  }
  if (c.type !== 'MOTOR') return;
  if (c.useMotorAng) {
    const axis = axisOf(fa, 0);
    const rel = dot(sub(b.w, a.w), axis);
    const want = c.motorAngVelocity / DEG - rel;
    const w = (a.invM ? dot(axis, applyInvI(a, axis)) : 0) + (b.invM ? dot(axis, applyInvI(b, axis)) : 0);
    if (w > 0) {
      const limit = c.motorMaxImpulse * h;
      const impulse = mul(axis, Math.max(-limit, Math.min(limit, want / w)));
      a.w = sub(a.w, applyInvI(a, impulse));
      b.w = add(b.w, applyInvI(b, impulse));
    }
  }
  if (c.useMotorLin) {
    const axis = axisOf(fa, 0);
    const rel = dot(sub(b.v, a.v), axis);
    const w = a.invM + b.invM;
    if (w > 0) {
      const limit = c.motorMaxImpulse * h;
      const impulse = mul(axis, Math.max(-limit, Math.min(limit, (c.motorLinVelocity - rel) / w)));
      a.v = sub(a.v, mul(impulse, a.invM));
      b.v = add(b.v, mul(impulse, b.invM));
    }
  }
}

/** Takes `speed` of relative velocity along n out of b relative to a. */
function velocityImpulse(a, b, ra, rb, n, speed) {
  const w = generalInverse(a, ra, n) + generalInverse(b, rb, n);
  if (w <= 0) return;
  const p = mul(n, speed / w);
  if (a.invM && !a.asleep) { a.v = add(a.v, mul(p, a.invM)); a.w = add(a.w, applyInvI(a, cross(ra, p))); }
  if (b.invM && !b.asleep) { b.v = sub(b.v, mul(p, b.invM)); b.w = sub(b.w, applyInvI(b, cross(rb, p))); }
}

// ─────────────── the simulation

const quatOfMatrix = (m) => { const q = new Quaternion().setFromRotationMatrix(cleanRotation(m)); return [q.x, q.y, q.z, q.w]; };
const cleanRotation = (m) => {
  const e = m.elements;
  const axes = [[e[0], e[1], e[2]], [e[4], e[5], e[6]], [e[8], e[9], e[10]]].map(unit);
  const out = m.clone();
  [0, 1, 2].forEach((k) => { out.elements[k * 4] = axes[k][0]; out.elements[k * 4 + 1] = axes[k][1]; out.elements[k * 4 + 2] = axes[k][2]; });
  return out;
};
const scaleOfMatrix = (m) => { const e = m.elements; return [Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10])]; };

function buildBody(doc, obj) {
  const rb = obj.rigidBody;
  const m = worldMatrix(doc, obj);
  const scale = scaleOfMatrix(m);
  const mesh = obj.type === 'MESH' ? evaluatedMesh(doc, obj) : null;
  const scaled = (mesh?.verts ?? []).map((v) => [v[0] * scale[0], v[1] * scale[1], v[2] * scale[2]]);
  const low = [0, 1, 2].map((k) => (scaled.length ? Math.min(...scaled.map((v) => v[k])) : -0.5));
  const high = [0, 1, 2].map((k) => (scaled.length ? Math.max(...scaled.map((v) => v[k])) : 0.5));
  const centre = [0, 1, 2].map((k) => (low[k] + high[k]) / 2);
  const half = [0, 1, 2].map((k) => (high[k] - low[k]) / 2);
  const local = scaled.map((v) => sub(v, centre));
  const { parts, inertia } = shapeOf(rb, half, local, mesh?.faces ?? []);
  const q = quatOfMatrix(m);
  const origin = [m.elements[12], m.elements[13], m.elements[14]];
  const moving = rb.type === 'ACTIVE' && !rb.kinematic;
  const mass = Math.max(1e-4, rb.mass);
  const invI = inertia.map((x) => (moving ? 1 / Math.max(1e-6, x * mass) : 0));
  return {
    obj, rb, parts, q, x: add(origin, qrot(q, centre)), offset: mul(centre, -1), v: [0, 0, 0], w: [0, 0, 0], xPrev: null, qPrev: null, vPre: [0, 0, 0], wPre: [0, 0, 0],
    invM: moving ? 1 / mass : 0, invI, stamp: 0,
    rotation: [...obj.rotation],
  };
}

function bodyAabb(b) {
  const r = b.parts.length === 1 ? b.parts[0] : null;
  if (r) { const w = placed(r, b); return w; }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const part of b.parts) { const w = placed(part, b); for (let k = 0; k < 3; k++) { if (w.min[k] < min[k]) min[k] = w.min[k]; if (w.max[k] > max[k]) max[k] = w.max[k]; } }
  return { min, max };
}

/** Bakes every rigid body into obj.cache.transform[frame] as { location, rotation in degrees }. */
export function simulateRigid(doc, { start = doc.frameStart, end = doc.frameEnd, substeps = 20, fieldForce = null } = {}) {
  const list = doc.objects.filter((o) => o.rigidBody && o.rigidBody.enabled !== false);
  const visible = list.filter((o) => !o.hide);
  const bodies = visible.map((o) => buildBody(doc, o));
  const byObject = new Map(bodies.map((b) => [b.obj.id, b]));
  const world = { invM: 0, invI: [0, 0, 0], x: [0, 0, 0], q: [0, 0, 0, 1], v: [0, 0, 0], w: [0, 0, 0], parts: [] };
  const joints = [];
  const noCollide = new Set();
  const pairKey = (a, b) => (a.obj.id < b.obj.id ? `${a.obj.id}|${b.obj.id}` : `${b.obj.id}|${a.obj.id}`);
  for (const o of doc.objects) {
    const c = o.rigidConstraint;
    if (!c?.enabled) continue;
    const [a, b] = [byObject.get(c.object1), byObject.get(c.object2)];
    if (!a && !b) continue;
    const [first, second] = [a ?? world, b ?? world];
    const m = worldMatrix(doc, o);
    const anchor = [m.elements[12], m.elements[13], m.elements[14]];
    const frame = quatOfMatrix(m);
    const local = (body) => qrot(qinv(body.q), sub(anchor, body.x));
    joints.push({ settings: c, a: first, b: second, la: local(first), lb: local(second), qa: qmul(qinv(first.q), frame), qb: qmul(qinv(second.q), frame), broken: false });
    if (c.disableCollisions && a && b) noCollide.add(pairKey(a, b));
  }
  const jointed = new Set(joints.flatMap((j) => [j.a, j.b]));
  const h = 1 / doc.fps / substeps;
  const fields = doc.objects.filter((o) => o.field);
  const g = doc.gravity;
  const gravity = length(g);
  for (const b of bodies) if (b.invM || b.rb.kinematic) b.obj.cache.transform = {};
  const record = (frame) => {
    for (const b of bodies) {
      if (!b.invM) continue;
      const e = new Euler().setFromQuaternion(new Quaternion(b.q[0], b.q[1], b.q[2], b.q[3]), 'ZYX');
      const angles = [e.x * DEG, e.y * DEG, e.z * DEG].map((x, k) => x + Math.round((b.rotation[k] - x) / 360) * 360);
      b.rotation = angles;
      b.obj.cache.transform[frame] = { location: add(b.x, qrot(b.q, b.offset)), rotation: angles };
    }
  };
  record(start);
  const kinematic = bodies.filter((b) => b.rb.kinematic);
  const back = doc.frame;
  for (let frame = start + 1; frame <= end; frame++) {
    // Keyed bodies: where they will be at the end of this frame, reached evenly over the substeps.
    const targets = new Map();
    if (kinematic.length) {
      setFrame(doc, frame);
      for (const b of kinematic) {
        const m = worldMatrix(doc, b.obj);
        const q = quatOfMatrix(m);
        targets.set(b, { x: add([m.elements[12], m.elements[13], m.elements[14]], qrot(q, mul(b.offset, -1))), q, fromX: b.x, fromQ: b.q });
      }
    }
    for (let s = 0; s < substeps; s++) {
      const contacts = [];
      const stamp = (frame << 8) + s + 1;
      for (const b of bodies) {
        if (b.invM && !b.asleep) {
          let force = g;
          for (const f of fields) force = add(force, fieldForce(doc, f, b.x, b.v));
          b.xPrev = b.x;
          b.qPrev = b.q;
          b.v = mul(add(b.v, mul(force, h)), Math.max(0, 1 - (b.rb.damping ?? 0.04) * h));
          b.w = mul(b.w, Math.max(0, 1 - (b.rb.angularDamping ?? 0.1) * h));
          b.vPre = b.v;
          b.wPre = b.w;
          b.x = add(b.x, mul(b.v, h));
          b.q = qnorm(add4(b.q, qmul([b.w[0] * h * 0.5, b.w[1] * h * 0.5, b.w[2] * h * 0.5, 0], b.q)));
        } else if (b.asleep) {
          b.xPrev = b.x;
          b.qPrev = b.q;
          b.v = [0, 0, 0];
          b.w = [0, 0, 0];
          b.vPre = b.v;
          b.wPre = b.w;
        } else if (targets.has(b)) {
          const target = targets.get(b);
          const k = (s + 1) / substeps;
          const next = add(target.fromX, mul(sub(target.x, target.fromX), k));
          const dq = qmul(target.q, qinv(target.fromQ));
          const turned = qnorm(add4(target.fromQ, mul4(sub4(target.q, target.fromQ), k)));
          b.v = mul(sub(next, b.x), 1 / h);
          b.w = mul([dq[0], dq[1], dq[2]], (2 / (h * substeps)) * (dq[3] < 0 ? -1 : 1));
          b.x = next;
          b.q = turned;
        }
        b.stamp = stamp;
      }
      // Who touches whom.
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i];
        const boxA = bodyAabb(a);
        for (let k = i + 1; k < bodies.length; k++) {
          const b = bodies[k];
          if (!a.invM && !b.invM) continue;
          if ((a.asleep || !a.invM) && (b.asleep || !b.invM)) continue;
          if (!overlapBoxes(boxA, bodyAabb(b)) || noCollide.has(pairKey(a, b))) continue;
          for (const pa of a.parts) for (const pb of b.parts) {
            const found = partContacts(pa, a, pb, b);
            if (!found) continue;
            // A sleeper stays asleep under something that is itself barely moving.
            for (const [sleeper, other] of [[a, b], [b, a]]) if (sleeper.asleep && length(other.v) + length(other.w) > 1) { sleeper.asleep = false; sleeper.still = 0; }
            for (const c of found) {
              contacts.push({
                a, b, n: c.n, depth: c.depth, ra0: qrot(qinv(a.q), sub(c.pa, a.x)), rb0: qrot(qinv(b.q), sub(c.pb, b.x)), lambdaN: 0,
              });
            }
          }
        }
      }
      // A long arm on a small body answers a position error mostly by turning, and the turn then has to be taken back: joints need several rounds.
      // A spring counts once: each round would stiffen it.
      for (let round = 0; round < 10; round++) for (const j of joints) if (!round || j.settings.type !== 'GENERIC_SPRING') solveJoint(j, h);
      // The points of one touch are solved from the same state and their results averaged. One after the other, each turns the body a
      // little before the next is seen, and a stack walks sideways.
      const manifolds = new Map();
      for (const c of contacts) { const key = `${c.a.obj.id}|${c.b.obj.id}`; if (!manifolds.has(key)) manifolds.set(key, []); manifolds.get(key).push(c); }
      const list = [...manifolds.values()];
      if (s % 2) list.reverse();
      for (const group of list) {
        const [a, b] = [group[0].a, group[0].b];
        for (let iteration = 0; iteration < 3; iteration++) {
          const base = { ax: a.x, aq: a.q, bx: b.x, bq: b.q };
          const sum = { ax: [0, 0, 0], aq: [0, 0, 0, 0], bx: [0, 0, 0], bq: [0, 0, 0, 0] };
          let moved = 0;
          for (const c of group) {
            a.x = base.ax; a.q = base.aq; b.x = base.bx; b.q = base.bq;
            const { n } = c;
            const [ra, rb] = [qrot(a.q, c.ra0), qrot(b.q, c.rb0)];
            const depth = dot(sub(add(a.x, ra), add(b.x, rb)), n);
            if (depth <= 0) continue;
            // b moves along +n, a against it.
            const lambda = positional(b, a, rb, ra, n, depth, 0, h);
            c.lambdaN += lambda;
            // Static friction: the contact points must not have slid.
            const mu = Math.sqrt((a.rb.friction ?? 0.5) * (b.rb.friction ?? 0.5));
            const [ra2, rb2] = [qrot(a.q, c.ra0), qrot(b.q, c.rb0)];
            const moveA = a.invM ? sub(add(a.x, ra2), add(a.xPrev, qrot(a.qPrev, c.ra0))) : mul(a.v, h);
            const moveB = b.invM ? sub(add(b.x, rb2), add(b.xPrev, qrot(b.qPrev, c.rb0))) : mul(b.v, h);
            const slip = sub(moveB, moveA);
            const tangent = sub(slip, mul(n, dot(slip, n)));
            const l = length(tangent);
            if (l > 1e-10) {
              const dir = mul(tangent, 1 / l);
              const w = generalInverse(a, ra2, dir) + generalInverse(b, rb2, dir);
              if (w > 0 && l / w < mu * c.lambdaN) positional(a, b, ra2, rb2, dir, l, 0, h);
            }
            sum.ax = add(sum.ax, sub(a.x, base.ax));
            sum.bx = add(sum.bx, sub(b.x, base.bx));
            sum.aq = add4(sum.aq, sub4Plain(a.q, base.aq));
            sum.bq = add4(sum.bq, sub4Plain(b.q, base.bq));
            moved++;
          }
          a.x = base.ax; a.q = base.aq; b.x = base.bx; b.q = base.bq;
          if (!moved) break;
          const k = 1 / moved;
          a.x = add(a.x, mul(sum.ax, k));
          b.x = add(b.x, mul(sum.bx, k));
          a.q = qnorm(add4(a.q, mul4(sum.aq, k)));
          b.q = qnorm(add4(b.q, mul4(sum.bq, k)));
        }
      }
      for (const b of bodies) {
        if (!b.invM || b.asleep) continue;
        b.v = mul(sub(b.x, b.xPrev), 1 / h);
        b.w = qdiff(b.q, b.qPrev).map((x) => x / h);
      }
      for (const c of contacts) {
        const { a, b, n } = c;
        if (!c.lambdaN) continue;
        const [ra, rb] = [qrot(a.q, c.ra0), qrot(b.q, c.rb0)];
        const rel = sub(add(b.v, cross(b.w, rb)), add(a.v, cross(a.w, ra)));
        const vn = dot(rel, n);
        // Dynamic friction, by the force the contact carried.
        const mu = Math.sqrt((a.rb.friction ?? 0.5) * (b.rb.friction ?? 0.5));
        const vt = sub(rel, mul(n, vn));
        const speed = length(vt);
        if (speed > 1e-9) {
          const pull = Math.min((h * mu * Math.abs(c.lambdaN)) / (h * h), speed);
          velocityImpulse(a, b, ra, rb, mul(vt, 1 / speed), pull);
        }
        // Restitution, from the velocity before this step; slow contacts do not bounce.
        const relPre = sub(add(b.vPre, cross(b.wPre, rb)), add(a.vPre, cross(a.wPre, ra)));
        const vnPre = dot(relPre, n);
        const e = Math.abs(vnPre) <= 2 * gravity * h + 0.05 ? 0 : (a.rb.restitution ?? 0) * (b.rb.restitution ?? 0);
        const target = Math.max(-e * vnPre, 0);
        const now = dot(sub(add(b.v, cross(b.w, rb)), add(a.v, cross(a.w, ra))), n);
        if (now < target) velocityImpulse(a, b, ra, rb, mul(n, -1), target - now);
      }
      for (const j of joints) jointVelocities(j, h);
      // Joints keep things moving on purpose, so only free bodies with contacts sleep.
      for (const b of bodies) {
        if (!b.invM || b.asleep || jointed.has(b)) continue;
        const touching = contacts.some((c) => c.lambdaN && (c.a === b || c.b === b));
        b.still = touching && length(b.v) < 0.08 && length(b.w) < 0.08 ? (b.still ?? 0) + h : 0;
        if (b.still > 0.5) { b.asleep = true; b.v = [0, 0, 0]; b.w = [0, 0, 0]; }
      }
    }
    record(frame);
  }
  if (kinematic.length) setFrame(doc, back);
  return end - start + 1;
}

const sub4Plain = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
const mul4 = (a, k) => [a[0] * k, a[1] * k, a[2] * k, a[3] * k];
const sub4 = (a, b) => {
  // The nearer of the two ways round.
  const flip = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  return [a[0] * flip - b[0], a[1] * flip - b[1], a[2] * flip - b[2], a[3] * flip - b[3]];
};
