// Small vector helpers on plain {x, y, z} objects.
// The kernel works on plain objects (not THREE.Vector3) because it creates and
// stores hundreds of thousands of points: plain objects are cheaper and serialise as-is.

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const vcopy = (a) => ({ x: a.x, y: a.y, z: a.z });
// Accepts {x,y,z}, THREE.Vector3 or [x, y, z].
export const toV = (p) => (Array.isArray(p) ? { x: +p[0], y: +p[1], z: +p[2] } : { x: +p.x, y: +p.y, z: +p.z });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const addScaled = (a, b, s) => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s });
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const len = (a) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const len2 = (a) => a.x * a.x + a.y * a.y + a.z * a.z;
export const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
export const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
export const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
export const neg = (a) => ({ x: -a.x, y: -a.y, z: -a.z });
export function norm(a) {
  const l = len(a);
  return l > 1e-300 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 0, z: 0 };
}
export const maxAbs = (a) => Math.max(Math.abs(a.x), Math.abs(a.y), Math.abs(a.z));

// Newell's method: robust normal (and twice the area as its length) of a 3D polygon.
export function newell(points) {
  let x = 0, y = 0, z = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    x += (a.y - b.y) * (a.z + b.z);
    y += (a.z - b.z) * (a.x + b.x);
    z += (a.x - b.x) * (a.y + b.y);
  }
  return { x, y, z };
}

// An orthonormal (u, v) basis of the plane with normal n, with u × v = n.
// World-aligned so planar UVs are stable: horizontal faces use world X for u,
// vertical faces keep v pointing up (textures stand upright on walls).
export function planeBasis(n) {
  let u;
  if (Math.abs(n.y) > 0.9) u = { x: 1, y: 0, z: 0 };
  else u = norm(cross({ x: 0, y: 1, z: 0 }, n));
  // project u onto the plane (needed for the horizontal case when n is slightly tilted)
  u = norm(sub(u, scale(n, dot(u, n))));
  const v = cross(n, u);
  return { u, v };
}

// Canonical sign for a plane normal so the same plane gets the same key twice.
export function canonicalNormal(n) {
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  const s = ax >= ay && ax >= az ? Math.sign(n.x) : ay >= az ? Math.sign(n.y) : Math.sign(n.z);
  return s < 0 ? neg(n) : n;
}

// Closest points between segment p0-p1 and segment q0-q1. Returns params s (on p) and t (on q).
export function closestSegSeg(p0, p1, q0, q1) {
  const d1 = sub(p1, p0), d2 = sub(q1, q0), r = sub(p0, q0);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  const EPS = 1e-30;
  if (a <= EPS && e <= EPS) return { s: 0, t: 0, d2: dist2(p0, q0), parallel: true };
  if (a <= EPS) { s = 0; t = clamp01(f / e); }
  else {
    const c = dot(d1, r);
    if (e <= EPS) { t = 0; s = clamp01(-c / a); }
    else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > 1e-14 * a * e ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp01(-c / a); }
      else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
    }
  }
  const cp = addScaled(p0, d1, s), cq = addScaled(q0, d2, t);
  const denom = a * e - dot(d1, d2) ** 2;
  return { s, t, d2: dist2(cp, cq), parallel: denom <= 1e-12 * a * e, cp, cq };
}
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Parameter of point p projected on line a-b (0 at a, 1 at b) and the squared distance to the line.
export function projectOnSegment(p, a, b) {
  const d = sub(b, a);
  const l2 = len2(d);
  const t = l2 > 0 ? dot(sub(p, a), d) / l2 : 0;
  const c = addScaled(a, d, t);
  return { t, d2: dist2(p, c), point: c };
}

// Apply a THREE.Matrix4-like (has .elements, column major) or a 16-array to a point.
export function applyMatrix(m, p) {
  const e = m.elements || m;
  const x = p.x, y = p.y, z = p.z;
  const w = e[3] * x + e[7] * y + e[11] * z + e[15] || 1;
  return {
    x: (e[0] * x + e[4] * y + e[8] * z + e[12]) / w,
    y: (e[1] * x + e[5] * y + e[9] * z + e[13]) / w,
    z: (e[2] * x + e[6] * y + e[10] * z + e[14]) / w,
  };
}
export function matrixDeterminant(m) {
  const e = m.elements || m;
  // upper 3x3 determinant is enough to know whether the transform mirrors
  return e[0] * (e[5] * e[10] - e[9] * e[6]) - e[4] * (e[1] * e[10] - e[9] * e[2]) + e[8] * (e[1] * e[6] - e[5] * e[2]);
}
