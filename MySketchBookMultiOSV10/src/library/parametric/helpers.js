// Shared building blocks for the parametric furniture library.
//
// Every item builds through a `Kit`: parts are added by role (a mesh name the user
// can repaint, e.g. 'fabric', 'frame', 'legs') with a material preset id; at the end
// the kit merges all geometry of one role+material into one mesh, so an item stays at
// a handful of draw calls. All geometry is converted to the same layout (indexed,
// position + normal + uv) and gets box-projected UVs in metres, so tiled textures
// keep their real-world scale whatever the part's size.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export { THREE };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);

/** Small deterministic PRNG (items must look the same every rebuild). */
export function rng(seed = 1) {
  let s = (Math.floor(seed * 9973) ^ 0x9e3779b9) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Moves/rotates a geometry in place: rotation (radians, XYZ order) first, then translation. */
export function T(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, scale = null) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  if (scale) _s.set(scale[0], scale[1], scale[2]); else _s.set(1, 1, 1);
  _m.compose(_v.set(x, y, z), _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

/**
 * Box-projected UVs in metres: each vertex takes the two coordinates of the plane
 * its normal faces most (x/z → (z|x, y), y → (x, z)). Call after the geometry is in
 * item space so neighbouring parts share the texture scale.
 */
export function boxUV(geo) {
  const pos = geo.attributes.position;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (ny >= nx && ny >= nz) { uv[i * 2] = x; uv[i * 2 + 1] = z; }
    else if (nx >= nz) { uv[i * 2] = z; uv[i * 2 + 1] = y; }
    else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Normalises a geometry for merging: indexed, only position/normal/uv, no groups. */
function prepare(geo, uv) {
  let g = geo;
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (uv !== 'keep' || !g.attributes.uv) boxUV(g);
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  g.clearGroups();
  g.morphAttributes = {};
  return g;
}

const partOf = (mat) => (mat.startsWith('glass') || mat === 'water' ? 'glass' : mat.startsWith('light-') ? 'light' : null);

/**
 * Collects the parts of one item and turns them into a THREE.Group.
 *   const k = new Kit(ctx);  k.rbox('frame', 'wood-oak', w, h, d, x, y, z);  return k.group();
 * Positions of box-like helpers are centres; cylinders/lathes/legs take their bottom y.
 */
export class Kit {
  constructor(ctx) {
    this.ctx = ctx;
    this.hi = ctx.quality !== 'low';
    this.parts = new Map();
    this.lights = [];
    this.userData = {};
  }

  /** Segment count for the quality: high = n, low = about n/2.5 (never below `min`). */
  seg(n, min = 3) { return this.hi ? Math.max(min, Math.round(n)) : Math.max(min, Math.round(n / 2.5)); }

  /** Adds a ready geometry (already in item space). */
  add(role, mat, geo, { overrides, uv } = {}) {
    if (!geo) return null;
    const key = `${role}|${mat}|${overrides ? JSON.stringify(overrides) : ''}`;
    let part = this.parts.get(key);
    if (!part) { part = { role, mat, overrides, geos: [] }; this.parts.set(key, part); }
    part.geos.push(prepare(geo, uv));
    return geo;
  }

  /** Sharp-ish box with a tiny bevel (2 mm by default) so edges catch highlights. */
  box(role, mat, w, h, d, x = 0, y = 0, z = 0, o = {}) {
    const r = o.r ?? 0.002;
    const geo = r > 0 && this.hi ? roundedBox(w, h, d, o.segs ?? 1, Math.min(r, w / 2.01, h / 2.01, d / 2.01)) : new THREE.BoxGeometry(w, h, d);
    return this.add(role, mat, T(geo, x, y, z, o.rx ?? 0, o.ry ?? 0, o.rz ?? 0), o);
  }

  /** Soft rounded box (cushions, upholstered panels). */
  rbox(role, mat, w, h, d, r, x = 0, y = 0, z = 0, o = {}) {
    const segs = o.segs ?? this.seg(4, 1);
    const geo = roundedBox(w, h, d, segs, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
    if (o.puff) puff(geo, w, h, d, o.puff);
    return this.add(role, mat, T(geo, x, y, z, o.rx ?? 0, o.ry ?? 0, o.rz ?? 0), o);
  }

  /**
   * Upholstery box: rounded edges plus interior subdivisions so `puff` can bulge the faces
   * (RoundedBoxGeometry has no vertices in the middle of a face). Centred at (x, y, z).
   */
  soft(role, mat, w, h, d, r, x = 0, y = 0, z = 0, o = {}) {
    const geo = softBoxGeo(w, h, d, r, { round: this.hi ? 3 : 1, flat: this.hi ? (o.flat ?? 5) : 2, puff: o.puff ?? 0, sag: o.sag ?? 0 });
    return this.add(role, mat, T(geo, x, y, z, o.rx ?? 0, o.ry ?? 0, o.rz ?? 0), o);
  }

  /** Cylinder / cone, bottom at y. */
  cyl(role, mat, rTop, rBot, h, x = 0, y = 0, z = 0, o = {}) {
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, o.segs ?? this.seg(24, 6), 1, o.open ?? false);
    geo.translate(0, h / 2, 0);
    return this.add(role, mat, T(geo, x, y, z, o.rx ?? 0, o.ry ?? 0, o.rz ?? 0), o);
  }

  /** Cylinder between two points (struts, rails, rods). */
  rod(role, mat, a, b, r, o = {}) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const geo = new THREE.CylinderGeometry(o.r2 ?? r, r, len, o.segs ?? this.seg(12, 5), 1, o.open ?? false);
    geo.translate(0, len / 2, 0);
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    geo.applyMatrix4(_m.compose(A, _q, _s.set(1, 1, 1)));
    return this.add(role, mat, geo, o);
  }

  sphere(role, mat, r, x = 0, y = 0, z = 0, o = {}) {
    const geo = new THREE.SphereGeometry(r, o.segs ?? this.seg(24, 8), o.rings ?? this.seg(16, 6), 0, Math.PI * 2, 0, o.thetaLength ?? Math.PI);
    if (o.scale) geo.scale(...o.scale);
    return this.add(role, mat, T(geo, x, y, z, o.rx ?? 0, o.ry ?? 0, o.rz ?? 0), o);
  }

  /** Lathe from a profile [[radius, y], …] (bottom → top), at (x, y, z). `smooth` resamples it as a spline. */
  lathe(role, mat, profile, x = 0, y = 0, z = 0, o = {}) {
    let pts = profile.map(([r, py]) => new THREE.Vector2(Math.max(0, r), py));
    if (o.smooth) pts = new THREE.SplineCurve(pts).getSpacedPoints(this.seg(o.smooth, 6));
    const geo = new THREE.LatheGeometry(pts, o.segs ?? this.seg(32, 8));
    if (o.scale) geo.scale(...o.scale);
    return this.add(role, mat, T(geo, x, y, z, o.rx ?? 0, o.ry ?? 0, o.rz ?? 0), o);
  }

  /** Tube along a smooth curve through points (metal frames, hairpins, arcs). */
  tube(role, mat, points, r, o = {}) {
    const curve = o.curve ?? new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), o.closed ?? false, 'catmullrom', o.tension ?? 0.5);
    const geo = new THREE.TubeGeometry(curve, o.segs ?? this.seg(Math.max(8, Math.round(curve.getLength() * 60)), 4), r, o.radial ?? this.seg(10, 5), o.closed ?? false);
    this.add(role, mat, geo, o);
    if (o.caps && !o.closed) {
      for (const t of [0, 1]) {
        const p = curve.getPointAt(t);
        this.sphere(role, mat, r, p.x, p.y, p.z, { segs: this.seg(10, 5), rings: this.seg(6, 3) });
      }
    }
    return geo;
  }

  /** Tube through straight segments with rounded bends (bent-tube frames). */
  bentTube(role, mat, points, r, bend = 0.04, o = {}) {
    return this.tube(role, mat, null, r, { ...o, curve: roundedPath(points, bend, this.hi ? 6 : 2) });
  }

  /** Horizontal slab from a plan shape (THREE.Shape in x / z, z drawn as shape y), bottom at y0, bevelled edges. */
  slab(role, mat, shape, thick, y0 = 0, o = {}) {
    const bevel = Math.min(o.bevel ?? 0.004, thick / 2.2);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.0005, thick - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel,
      bevelSegments: this.hi ? (o.bevelSegs ?? 3) : 1, curveSegments: this.seg(o.curveSegs ?? 24, 4),
    });
    geo.translate(0, 0, bevel);
    // rotateX(+90°): shape y → plan +z, extrusion depth → −y; the translate puts the slab at y ∈ [0, thick].
    geo.rotateX(Math.PI / 2);
    geo.translate(0, thick, 0);
    geo.computeVertexNormals();
    return this.add(role, mat, T(geo, o.x ?? 0, y0, o.z ?? 0, 0, o.ry ?? 0, 0), o);
  }

  /** Vertical panel from a shape in x / y, extruded `thick` along z, centred on z. */
  panel(role, mat, shape, thick, x = 0, y = 0, z = 0, o = {}) {
    const bevel = Math.min(o.bevel ?? 0.002, thick / 2.2);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.0005, thick - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel,
      bevelSegments: this.hi ? (o.bevelSegs ?? 2) : 1, curveSegments: this.seg(o.curveSegs ?? 24, 4),
    });
    geo.translate(0, 0, bevel - thick / 2);
    return this.add(role, mat, T(geo, x, y, z, o.rx ?? 0, o.ry ?? 0, o.rz ?? 0), o);
  }

  /** A point light marker (CONTRACT: the scene builder turns it into a real light). */
  light(x, y, z, { color = '#ffe2b0', intensity = 1, distance = 6, type = 'point', angle } = {}) {
    this.lights.push({ x, y, z, light: { color, intensity, distance, type, ...(angle ? { angle } : {}) } });
  }

  /** Merges everything into a Group (one mesh per role + material). */
  group(name = '') {
    const g = new THREE.Group();
    g.name = name;
    for (const part of this.parts.values()) {
      const geo = part.geos.length === 1 ? part.geos[0] : mergeGeometries(part.geos, false);
      if (!geo) throw new Error(`merge failed for ${part.role}`);
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      const material = part.overrides ? this.ctx.material(part.mat, part.overrides) : this.ctx.material(part.mat);
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = part.role;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.role = part.role;
      mesh.userData.preset = part.mat;
      const p = partOf(part.mat);
      if (p) mesh.userData.part = p;
      if (p === 'glass') mesh.castShadow = false;
      g.add(mesh);
    }
    for (const l of this.lights) {
      const o = new THREE.Object3D();
      o.name = 'light';
      o.position.set(l.x, l.y, l.z);
      o.userData.light = l.light;
      g.add(o);
    }
    Object.assign(g.userData, this.userData);
    return g;
  }
}

/* ------------------------------------------------------------------ shapes */

/** Rounded rectangle centred at the origin (w along x, d along shape y). */
export function roundRect(w, d, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  r = Math.min(r, w / 2 - 0.0001, d / 2 - 0.0001);
  if (r < 0.001) { s.moveTo(x, y); s.lineTo(x + w, y); s.lineTo(x + w, y + d); s.lineTo(x, y + d); s.lineTo(x, y); return s; }
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Rounded rectangle with an offset origin (x0, y0 = lower-left corner). */
export function roundRectAt(x0, y0, w, h, r) {
  const s = roundRect(w, h, r);
  const pts = s.getPoints(8).map((p) => new THREE.Vector2(p.x + x0 + w / 2, p.y + y0 + h / 2));
  return new THREE.Shape(pts);
}

export function ellipse(w, d) {
  const s = new THREE.Shape();
  s.absellipse(0, 0, w / 2, d / 2, 0, Math.PI * 2, false, 0);
  return s;
}

/** Superellipse ("squircle"/racetrack-like) outline, n = 2 ellipse, 4+ boxier. */
export function superEllipse(w, d, n = 4, steps = 64) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    pts.push(new THREE.Vector2((w / 2) * Math.sign(c) * Math.abs(c) ** (2 / n), (d / 2) * Math.sign(s) * Math.abs(s) ** (2 / n)));
  }
  return new THREE.Shape(pts);
}

/** Rectangle with a rectangular hole (frames, passe-partouts). */
export function frameShape(w, h, bw, bh = bw, r = 0) {
  // plain corners when r = 0: near-zero arcs make near-duplicate points that break triangulation
  const s = r > 0.001 ? roundRect(w, h, r) : new THREE.Shape([new THREE.Vector2(-w / 2, -h / 2), new THREE.Vector2(w / 2, -h / 2), new THREE.Vector2(w / 2, h / 2), new THREE.Vector2(-w / 2, h / 2)]);
  const hole = new THREE.Path();
  const iw = w - 2 * bw, ih = h - 2 * bh;
  hole.moveTo(-iw / 2, -ih / 2); hole.lineTo(-iw / 2, ih / 2); hole.lineTo(iw / 2, ih / 2); hole.lineTo(iw / 2, -ih / 2); hole.lineTo(-iw / 2, -ih / 2);
  s.holes.push(hole);
  return s;
}

/** Polyline with rounded corners as a 3D curve (for bent-tube frames). */
export function roundedPath(points, r, steps = 6) {
  const P = points.map((p) => new THREE.Vector3(...p));
  const path = new THREE.CurvePath();
  let cur = P[0].clone();
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    const da = a.clone().sub(b), dc = c.clone().sub(b);
    const rr = Math.min(r, da.length() / 2.01, dc.length() / 2.01);
    const p1 = b.clone().add(da.normalize().multiplyScalar(rr));
    const p2 = b.clone().add(dc.normalize().multiplyScalar(rr));
    if (cur.distanceTo(p1) > 1e-6) path.add(new THREE.LineCurve3(cur.clone(), p1));
    path.add(new THREE.QuadraticBezierCurve3(p1, b.clone(), p2));
    cur = p2;
  }
  path.add(new THREE.LineCurve3(cur, P[P.length - 1].clone()));
  void steps;
  return path;
}

/* ------------------------------------------------------- soft geometry */

// Furniture repeats the same pieces (cushions, panels, bevelled boards): rounded and soft boxes are built
// once per size and copied after that (a copy is far cheaper than building and welding the vertices again).
const GEOMETRY_CACHE = new Map();
const GEOMETRY_CACHE_MAX = 600;
function cachedGeometry(key, build) {
  let geo = GEOMETRY_CACHE.get(key);
  if (!geo) {
    geo = build();
    if (GEOMETRY_CACHE.size >= GEOMETRY_CACHE_MAX) GEOMETRY_CACHE.delete(GEOMETRY_CACHE.keys().next().value);
    GEOMETRY_CACHE.set(key, geo);
  }
  return geo.clone();
}
const roundedBox = (w, h, d, segs, r) => cachedGeometry(`rbox|${w}|${h}|${d}|${segs}|${r}`, () => new RoundedBoxGeometry(w, h, d, segs, r));


/**
 * Rounded box with `round` segments across each rounded edge and `flat` segments across the
 * flat part of each face; smooth normals across the face seams. `puff` bulges the faces,
 * `sag` dips the top centre (a sat-in seat).
 */
export function softBoxGeo(w, h, d, r, { round = 3, flat = 5, puff: amount = 0, sag = 0 } = {}) {
  return cachedGeometry(`soft|${w}|${h}|${d}|${r}|${round}|${flat}|${amount}|${sag}`, () => buildSoftBox(w, h, d, r, round, flat, amount, sag));
}

function buildSoftBox(w, h, d, r, round, flat, amount, sag) {
  r = Math.max(0.0005, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
  const n = 2 * round + flat;
  const g = new THREE.BoxGeometry(2, 2, 2, n, n, n);
  const half = [w / 2, h / 2, d / 2];
  const pos = g.attributes.position;
  const map = (c, hh) => {
    const i = ((c + 1) / 2) * n;
    if (i <= round) return -hh + r * (i / round);
    if (i >= n - round) return hh - r * ((n - i) / round);
    return -(hh - r) + ((i - round) / flat) * 2 * (hh - r);
  };
  const P = new THREE.Vector3(), C = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    P.set(map(pos.getX(i), half[0]), map(pos.getY(i), half[1]), map(pos.getZ(i), half[2]));
    C.set(clamp(P.x, -half[0] + r, half[0] - r), clamp(P.y, -half[1] + r, half[1] - r), clamp(P.z, -half[2] + r, half[2] - r));
    const D = P.clone().sub(C);
    if (D.lengthSq() > 1e-12) P.copy(C).addScaledVector(D.normalize(), r);
    pos.setXYZ(i, P.x, P.y, P.z);
  }
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-6);
  if (amount) puff(m, w, h, d, amount);
  if (sag) {
    const p = m.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y <= 0) continue;
      const u = p.getX(i) / (w / 2), v = p.getZ(i) / (d / 2);
      p.setY(i, y - sag * Math.max(0, 1 - u * u) * Math.max(0, 1 - v * v) * (y / (h / 2)));
    }
  }
  m.computeVertexNormals();
  return m;
}

/** Bulges a (centred, subdivided) box: the middle of the top / front faces rises like a filled cushion. */
export function puff(geo, w, h, d, amount = 0.02) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const u = clamp(x / (w / 2), -1, 1), v = clamp(z / (d / 2), -1, 1), t = clamp(y / (h / 2), -1, 1);
    const fx = 1 - u * u, fz = 1 - v * v, fy = 1 - t * t;
    // top & bottom bulge vertically, sides bow out a little
    pos.setY(i, y + Math.sign(y) * amount * fx * fz * Math.abs(t));
    pos.setX(i, x + Math.sign(x) * amount * 0.35 * fy * fz * Math.abs(u));
    pos.setZ(i, z + Math.sign(z) * amount * 0.35 * fy * fx * Math.abs(v));
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * A single-sided grid surface: fn(u, v) → [x, y, z] for u, v ∈ [0, 1].
 * Face normals point along dv × du.
 */
export function gridGeo(nu, nv, fn) {
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3);
  let p = 0;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const q = fn(i / nu, j / nv); pos[p++] = q[0]; pos[p++] = q[1]; pos[p++] = q[2]; }
  const idx = [];
  const at = (i, j) => j * (nu + 1) + i;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    idx.push(a, c, b, c, d, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * A grid surface with real thickness (cloth, curtains, duvets): the surface is offset
 * by `thick` against its normal and the rim is closed, so it reads solid from both sides.
 */
export function shellGeo(nu, nv, fn, thick) {
  const top = gridGeo(nu, nv, fn);
  const n = top.attributes.normal, p = top.attributes.position;
  const bot = top.clone();
  const bp = bot.attributes.position;
  for (let i = 0; i < bp.count; i++) bp.setXYZ(i, p.getX(i) - n.getX(i) * thick, p.getY(i) - n.getY(i) * thick, p.getZ(i) - n.getZ(i) * thick);
  const bi = bot.index.array;
  for (let i = 0; i < bi.length; i += 3) { const t = bi[i + 1]; bi[i + 1] = bi[i + 2]; bi[i + 2] = t; }
  bot.index.needsUpdate = true;
  bot.computeVertexNormals();
  // Rim: a strip between the two surfaces along each border, emitted with both windings
  // (cheap and orientation-proof; the back copy is culled).
  const rim = [];
  const at = (i, j) => j * (nu + 1) + i;
  const border = [];
  for (let i = 0; i < nu; i++) border.push([at(i, 0), at(i + 1, 0)], [at(i + 1, nv), at(i, nv)]);
  for (let j = 0; j < nv; j++) border.push([at(nu, j), at(nu, j + 1)], [at(0, j + 1), at(0, j)]);
  const P = (geo, i) => [geo.attributes.position.getX(i), geo.attributes.position.getY(i), geo.attributes.position.getZ(i)];
  for (const [a, b] of border) {
    const A = P(top, a), B = P(top, b), C = P(bot, a), D = P(bot, b);
    rim.push(...A, ...C, ...B, ...B, ...C, ...D, ...A, ...B, ...C, ...B, ...D, ...C);
  }
  const rimGeo = new THREE.BufferGeometry();
  rimGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rim), 3));
  rimGeo.computeVertexNormals();
  return mergeGeometries([top, bot, rimGeo].map((g) => prepare(g, 'box')), false);
}

/**
 * Pillow: two bulging faces meeting at a thin seam, corners slightly pinched.
 * w × h is the face (x, y), d the thickness at the centre (z). Centred at the origin.
 */
export function pillowGeo(w, h, d, segs = 16, { seam = 0.012, pinch = 0.06 } = {}) {
  const f = (u, v) => {
    const a = Math.max(0, 1 - Math.abs(u) ** 2.6) ** 0.5, b = Math.max(0, 1 - Math.abs(v) ** 2.6) ** 0.5;
    return seam / 2 + (d / 2 - seam / 2) * a * b;
  };
  const surf = (side) => gridGeo(segs, segs, (s, t) => {
    const u = s * 2 - 1, v = t * 2 - 1;
    // corners pull inwards (stuffing tension) → the classic pillow outline
    const px = u * (w / 2) * (1 - pinch * v * v), py = v * (h / 2) * (1 - pinch * u * u);
    return side > 0 ? [px, py, f(u, v)] : [px, -py, -f(u, -v)];
  });
  const g1 = surf(1), g2 = surf(-1);
  // gridGeo normal = dv × du: for side +1 (u→x, v→y) that is −z, so flip windings of the front face.
  const flip = (g) => { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.computeVertexNormals(); return g; };
  flip(g1);
  flip(g2);
  return mergeGeometries([g1, g2].map((g) => prepare(g, 'box')), false);
}

/**
 * Draped cloth over a box top (duvets, bedspreads, tablecloths): a plan grid that is
 * flat over w × l and rolls over the edges (radius r) and hangs `drop` down on the
 * left, right and foot (+z) sides, with soft vertical folds in the hanging part.
 * Returns a shell geometry; `top` = y of the surface it lies on.
 */
export function drapeGeo({ w, l, top, drop = 0.25, r = 0.05, thick = 0.04, folds = 0.012, foldPitch = 0.22, nu = 40, nv = 40, sides = { left: true, right: true, foot: true }, puffy = 0.012, seed = 3 }) {
  const dl = sides.left ? drop : 0, dr = sides.right ? drop : 0, df = sides.foot ? drop : 0;
  const quarter = (Math.PI / 2) * r;
  const bend = (s) => {
    // arc length s past the edge → [outward, down]
    if (s <= 0) return [s, 0];
    if (s < quarter) { const a = s / r; return [r * Math.sin(a), r * (1 - Math.cos(a))]; }
    return [r, r + (s - quarter)];
  };
  const W = w + dl + dr + quarter * 0;
  const rand = rng(seed);
  const ph = [rand() * 6, rand() * 6, rand() * 6];
  const fn = (u, v) => {
    const cx = -w / 2 - dl + u * (w + dl + dr);
    const cz = -l / 2 + v * (l + df);
    const ox = cx > w / 2 ? cx - w / 2 : cx < -w / 2 ? -w / 2 - cx : 0;
    const oz = cz > l / 2 ? cz - l / 2 : 0;
    const [bx, dx] = bend(ox), [bz, dz] = bend(oz);
    let X = clamp(cx, -w / 2, w / 2) + (cx < 0 ? -bx : bx);
    let Z = Math.min(cz, l / 2) + bz;
    let Y = top + thick - dx - dz;
    // the quilted top puffs a little; the hanging part gets vertical folds that grow downwards
    const flat = ox === 0 && oz === 0;
    if (flat) Y += puffy * (0.5 + 0.5 * Math.sin(cx * 9 + ph[0]) * Math.sin(cz * 7 + ph[1]));
    const hangX = Math.max(0, dx - r) / Math.max(drop, 1e-3), hangZ = Math.max(0, dz - r) / Math.max(drop, 1e-3);
    if (hangX > 0) X += Math.sign(cx) * folds * hangX * (0.6 + 0.4 * Math.sin((cz / foldPitch) * Math.PI * 2 + ph[2]));
    if (hangZ > 0) Z += folds * hangZ * (0.6 + 0.4 * Math.sin((cx / foldPitch) * Math.PI * 2 + ph[0]));
    void W;
    return [X, Y, Z];
  };
  return shellGeo(nu, nv, fn, thick);
}

/* ------------------------------------------------------------------ legs */

/** Tapered round leg (wood), bottom at 0: rTop at the top, rBot at the floor. */
export function taperedLegGeo(h, rTop, rBot, segs = 16) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, segs, 1);
  g.translate(0, h / 2, 0);
  return g;
}

/**
 * Four legs under a w × d footprint whose tops are at y = h. Styles:
 *  'tapered' (splayed round wood), 'square' (straight square wood), 'metal' (slim round),
 *  'hairpin' (bent rod), 'block' (low block feet), 'cone' (short cone feet), 'sled' (U frame).
 */
export function addLegs(k, role, mat, style, w, d, h, { inset = 0.05, r = 0.022, splay = 0.035 } = {}) {
  const xs = w / 2 - inset, zs = d / 2 - inset;
  const corners = [[-xs, -zs], [xs, -zs], [-xs, zs], [xs, zs]];
  if (style === 'sled') {
    for (const sx of [-1, 1]) {
      const x = sx * xs;
      k.bentTube(role, mat, [[x, h, -zs], [x, 0.008, -zs], [x, 0.008, zs], [x, h, zs]], r * 0.6, 0.03, { radial: k.seg(10, 5) });
    }
    return;
  }
  for (const [x, z] of corners) {
    if (style === 'tapered') {
      const g = taperedLegGeo(h, r, r * 0.55, k.seg(14, 6));
      // splay outwards: tilt the leg so its foot moves away from the centre
      const ax = -Math.atan2(splay, h) * Math.sign(z), az = Math.atan2(splay, h) * Math.sign(x);
      g.translate(0, -h, 0);
      T(g, 0, 0, 0, ax, 0, az);
      g.translate(x, h, z);
      // after the tilt the foot sits slightly above 0; clamp by a tiny scale on y
      const bb = new THREE.Box3().setFromBufferAttribute(g.attributes.position);
      g.translate(0, -bb.min.y, 0);
      k.add(role, mat, g);
    } else if (style === 'square') {
      k.box(role, mat, r * 1.8, h, r * 1.8, x, h / 2, z, { r: 0.003 });
    } else if (style === 'metal') {
      k.cyl(role, mat, r * 0.55, r * 0.5, h, x, 0, z, { segs: k.seg(12, 6) });
    } else if (style === 'hairpin') {
      const dx = Math.sign(x) * 0.0, s = 0.035;
      // Two rods meeting at the foot: a curve's end points are exact, so the foot touches the floor at any segment count.
      k.tube(role, mat, [[x - s * Math.sign(x), h, z - s], [x - 0.002, h * 0.35, z - 0.004], [x, 0.005, z]], 0.005, { radial: k.seg(8, 4), segs: k.seg(14, 4) });
      k.tube(role, mat, [[x, 0.005, z], [x + 0.002 * Math.sign(x), h * 0.35, z + 0.004], [x - s * Math.sign(x) + dx, h, z + s]], 0.005, { radial: k.seg(8, 4), segs: k.seg(14, 4) });
    } else if (style === 'block') {
      k.box(role, mat, 0.05, h, 0.05, x, h / 2, z, { r: 0.006, segs: 2 });
    } else if (style === 'cone') {
      k.cyl(role, mat, r, r * 0.6, h, x, 0, z, { segs: k.seg(16, 6) });
    }
  }
}

/* --------------------------------------------------------------- handles */

/**
 * Handle on a front face whose surface is at z = zf (facing +z), centred at (x, y).
 * Styles: 'bar' (tube with standoffs), 'knob', 'edge' (slim profile along the top edge),
 * 'cup', 'none'. `vertical` turns the bar upright (doors).
 */
export function addHandle(k, role, mat, style, x, y, zf, { len = 0.16, vertical = false } = {}) {
  if (style === 'none') return;
  if (style === 'knob') {
    k.lathe(role, mat, [[0, 0], [0.007, 0], [0.006, 0.012], [0.014, 0.022], [0.015, 0.028], [0.01, 0.033], [0, 0.034]], x, y, zf, { rx: Math.PI / 2, segs: k.seg(16, 6) });
    return;
  }
  if (style === 'edge') {
    // thin aluminium profile sitting on the top edge of the front
    if (vertical) k.box(role, mat, 0.016, len, 0.022, x, y, zf + 0.009, { r: 0.002 });
    else k.box(role, mat, len, 0.016, 0.022, x, y, zf + 0.009, { r: 0.002 });
    return;
  }
  if (style === 'cup') {
    k.cyl(role, mat, 0.022, 0.022, 0.01, x, y, zf, { rx: Math.PI / 2, segs: k.seg(16, 6), thetaLength: Math.PI });
    k.box(role, mat, 0.05, 0.004, 0.018, x, y - 0.012, zf + 0.009, { r: 0.0015 });
    return;
  }
  // bar: round bar with two posts
  const half = len / 2, off = 0.032, r = 0.006;
  if (vertical) {
    k.rod(role, mat, [x, y - half, zf + off], [x, y + half, zf + off], r, { segs: k.seg(12, 5) });
    for (const s of [-1, 1]) k.rod(role, mat, [x, y + s * (half - 0.02), zf], [x, y + s * (half - 0.02), zf + off], r * 0.8, { segs: k.seg(10, 5) });
  } else {
    k.rod(role, mat, [x - half, y, zf + off], [x + half, y, zf + off], r, { segs: k.seg(12, 5) });
    for (const s of [-1, 1]) k.rod(role, mat, [x + s * (half - 0.02), y, zf], [x + s * (half - 0.02), y, zf + off], r * 0.8, { segs: k.seg(10, 5) });
  }
}

/* ------------------------------------------------------------- cabinets */

/**
 * A cabinet: carcass + fronts with real reveals (3 mm), plinth recess or legs, handles.
 *   rows: bottom → top, each { h: fraction | metres, n: columns, type: 'drawer'|'door'|'open'|'glass', hinge }
 * Returns { top } (y of the top surface). Origin: bottom centre at (x, z).
 */
export function addCabinet(k, o) {
  const {
    w, h, d, x = 0, z = 0, y0 = 0, rows = [{ h: 1, n: 2, type: 'door' }],
    body = 'wood-white', front = body, handle = 'bar', handleMat = 'metal-black',
    base = 'plinth', plinth = 0.08, legH = 0.12, legStyle = 'tapered', legMat = 'wood-oak',
    top = null, topThick = 0.02, topOverhang = 0.0, gap = 0.003, frontT = 0.019, roles = {},
  } = o;
  const rBody = roles.body ?? 'body', rFront = roles.front ?? 'fronts', rHandle = roles.handle ?? 'handles', rTop = roles.top ?? 'top';
  let yb = y0;
  if (base === 'plinth') {
    k.box(rBody, body, w - 0.02, plinth, d - frontT - 0.05, x, y0 + plinth / 2, z - frontT / 2 - 0.02, { r: 0.001 });
    yb = y0 + plinth;
  } else if (base === 'legs') {
    addLegsAt(k, 'legs', legMat, legStyle, w - 0.02, d - 0.04, legH, x, y0, z - 0.01);
    yb = y0 + legH;
  } else if (base === 'none') {
    yb = y0;
  }
  const hasTop = !!top;
  const bodyH = h - (yb - y0) - (hasTop ? topThick : 0);
  const cd = d - frontT; // carcass depth behind the fronts
  const cz = z - frontT / 2;
  // carcass shell: sides, top, bottom, back as one rounded box (the fronts hide its face)
  k.box(rBody, body, w, bodyH, cd, x, yb + bodyH / 2, cz, { r: 0.0025 });
  if (hasTop) {
    const tw = w + 2 * topOverhang, td = d + topOverhang;
    k.box(rTop, top, tw, topThick, td, x, yb + bodyH + topThick / 2, z + topOverhang / 2, { r: Math.min(0.003, topThick / 3) });
  }
  // fronts
  const fz = z + d / 2 - frontT / 2;
  let y = yb;
  for (const row of rows) {
    const rh = row.h <= 1.0001 && !row.abs ? row.h * bodyH : row.h;
    const n = Math.max(1, row.n ?? 1);
    const cw = w / n;
    for (let c = 0; c < n; c++) {
      const cx = x - w / 2 + cw * (c + 0.5);
      const fw = cw - gap, fh = rh - gap;
      const fy = y + rh / 2;
      if (row.type === 'open') {
        // recessed open niche: darker back is just the carcass; add a shelf edge
        k.box(rBody, body, cw - 0.018, 0.018, cd - 0.02, cx, y + 0.009, cz + 0.01, { r: 0.001 });
        continue;
      }
      if (row.type === 'glass') {
        const fr = 0.022;
        k.panel(rFront, front, frameShape(fw, fh, fr), frontT, cx, fy, fz, { bevel: 0.002 });
        k.box('glass', 'glass-clear', fw - 2 * fr + 0.004, fh - 2 * fr + 0.004, 0.004, cx, fy, fz - 0.002, { r: 0 });
      } else {
        k.box(rFront, front, fw, fh, frontT, cx, fy, fz, { r: 0.0025, segs: 1 });
      }
      const zf = fz + frontT / 2;
      if (row.type === 'drawer') {
        addHandle(k, rHandle, handleMat, handle, cx, handle === 'edge' ? fy + fh / 2 - 0.008 : fh > 0.25 ? fy + fh / 2 - 0.07 : fy, zf, { len: Math.min(0.32, Math.max(0.1, fw * 0.4)) });
      } else {
        const hinge = row.hinge ?? (n === 1 ? 'left' : c % 2 === 0 ? 'left' : 'right');
        const hx = hinge === 'left' ? cx + fw / 2 - 0.04 : cx - fw / 2 + 0.04;
        const hy = row.handleY != null ? row.handleY : fy + (fh > 1.2 ? 0 : fh / 2 - 0.09);
        if (handle === 'edge') {
          // keep the pull inside the door
          const len = Math.min(0.3, fh * 0.5);
          const ey = clamp(hy, y + gap + len / 2 + 0.01, y + rh - gap - len / 2 - 0.01);
          addHandle(k, rHandle, handleMat, 'edge', hx + (hinge === 'left' ? 0.03 : -0.03), ey, zf, { len, vertical: true });
        }
        else addHandle(k, rHandle, handleMat, handle, hx, hy, zf, { len: Math.min(0.2, fh * 0.35), vertical: true });
      }
    }
    y += rh;
  }
  return { top: yb + bodyH + (hasTop ? topThick : 0), bodyTop: yb + bodyH, yb };
}

/** addLegs at an offset (x, y0, z). */
export function addLegsAt(k, role, mat, style, w, d, h, x, y0, z, opts) {
  transformAdded(k, () => addLegs(k, role, mat, style, w, d, h, opts), x, y0, z);
}

/** Runs `fn(k)` and moves/rotates only the parts it added (for sub-assemblies such as a chair around a table). */
export function transformAdded(k, fn, x = 0, y = 0, z = 0, ry = 0) {
  const before = new Map([...k.parts].map(([key, p]) => [key, p.geos.length]));
  const lightsBefore = k.lights.length;
  fn(k);
  _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(1, 1, 1));
  for (const [key, p] of k.parts) {
    const from = before.get(key) ?? 0;
    for (let i = from; i < p.geos.length; i++) { p.geos[i].applyMatrix4(_m); boxUV(p.geos[i]); }
  }
  for (let i = lightsBefore; i < k.lights.length; i++) {
    const l = k.lights[i];
    const v = new THREE.Vector3(l.x, l.y, l.z).applyMatrix4(_m);
    l.x = v.x; l.y = v.y; l.z = v.z;
  }
}

/* --------------------------------------------------------------- plants */

/**
 * A leaf as a bent, V-folded surface. Local frame: grows along +z from the origin,
 * width across x, face normal ≈ +y. `outline(t)` → half width factor (0..1) along t.
 */
export function leafGeo(len, width, { nu = 4, nv = 8, droop = 0.25, fold = 0.25, twist = 0, curl = 0, outline = (t) => Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.8 } = {}) {
  return gridGeo(nu, nv, (s, t) => {
    const u = s * 2 - 1;
    const hw = (width / 2) * outline(t);
    let x = u * hw;
    const z = t * len;
    let y = -droop * len * t * t + fold * Math.abs(x) + curl * len * t * t * t;
    if (twist) { const a = twist * t, c = Math.cos(a), sn = Math.sin(a); const nx = x * c - y * sn; y = x * sn + y * c; x = nx; }
    return [x, y, z];
  });
}

/** Places a leaf geometry: base at p, pointing at yaw (around y) and pitch (up from horizontal), rolled by roll. */
export function placeLeaf(geo, p, yaw, pitch, roll = 0) {
  const m = new THREE.Matrix4().makeRotationZ(roll);
  m.premultiply(new THREE.Matrix4().makeRotationX(-pitch));
  m.premultiply(new THREE.Matrix4().makeRotationY(yaw));
  m.premultiply(new THREE.Matrix4().makeTranslation(p[0], p[1], p[2]));
  geo.applyMatrix4(m);
  return geo;
}

/** Plant pot (lathe) with soil; returns the soil height. Origin bottom centre. */
export function addPot(k, { r = 0.16, h = 0.3, style = 'taper', mat = 'ceramic-matte', overrides, soil = true, x = 0, z = 0, y0 = 0 } = {}) {
  let prof;
  if (style === 'bowl') prof = [[0, 0], [r * 0.55, 0], [r * 0.62, 0.01], [r * 0.92, h * 0.45], [r, h * 0.92], [r * 0.99, h], [r * 0.93, h], [r * 0.9, h * 0.94], [0, h * 0.94]];
  else if (style === 'cylinder') prof = [[0, 0], [r * 0.96, 0], [r, 0.01], [r, h - 0.005], [r * 0.985, h], [r * 0.93, h], [r * 0.93, h * 0.08], [0, h * 0.08]];
  else if (style === 'belly') prof = [[0, 0], [r * 0.6, 0], [r * 0.7, 0.01], [r * 0.98, h * 0.4], [r * 0.95, h * 0.8], [r * 0.82, h * 0.98], [r * 0.84, h], [r * 0.76, h], [r * 0.74, h * 0.95], [0, h * 0.95]];
  else prof = [[0, 0], [r * 0.72, 0], [r * 0.76, 0.012], [r, h - 0.012], [r * 1.02, h], [r * 0.94, h], [r * 0.9, h * 0.15], [0, h * 0.15]];
  k.lathe('pot', mat, prof, x, y0, z, { overrides, segs: k.seg(40, 10) });
  const sy = y0 + h * 0.9;
  if (soil) {
    const sr = style === 'bowl' ? r * 0.92 : style === 'belly' ? r * 0.76 : style === 'cylinder' ? r * 0.93 : r * 0.94;
    k.cyl('soil', 'soil', sr * 0.995, sr * 0.97, 0.012, x, sy - 0.012, z, { segs: k.seg(32, 8) });
  }
  return sy;
}

/* -------------------------------------------------------------- params */

/** Param helpers keep entries short. */
export const P = {
  len: (key, ko, en, def, min, max, step = 0.01) => ({ key, ko, en, type: 'length', default: def, min, max, step }),
  int: (key, ko, en, def, min, max) => ({ key, ko, en, type: 'int', default: def, min, max }),
  num: (key, ko, en, def, min, max, step = 0.01) => ({ key, ko, en, type: 'number', default: def, min, max, step }),
  mat: (key, ko, en, def, filter) => ({ key, ko, en, type: 'material', default: def, filter }),
  pick: (key, ko, en, def, options) => ({ key, ko, en, type: 'enum', default: def, options }),
  bool: (key, ko, en, def) => ({ key, ko, en, type: 'bool', default: def }),
  color: (key, ko, en, def) => ({ key, ko, en, type: 'color', default: def }),
};

/** Common option lists. */
export const OPT = {
  legs: [['tapered', '원목 테이퍼', 'Tapered wood'], ['metal', '금속', 'Metal'], ['hairpin', '헤어핀', 'Hairpin'], ['block', '블록', 'Block'], ['sled', '썰매형', 'Sled']],
  handle: [['bar', '바', 'Bar'], ['knob', '노브', 'Knob'], ['edge', '엣지', 'Edge pull'], ['none', '없음(푸시)', 'None (push)']],
  hinge: [['left', '왼쪽', 'Left'], ['right', '오른쪽', 'Right']],
};

/** Fills defaults so build(params) can be called with a partial object. */
export function withDefaults(entry, params = {}) {
  const out = {};
  for (const p of entry.params) out[p.key] = params[p.key] ?? p.default;
  return out;
}

/**
 * Declares a catalog entry: fills kind/placement defaults and wraps build so missing
 * params take their defaults (the Properties panel may pass a partial object).
 */
export function item(def) {
  const entry = { kind: 'parametric', placement: 'floor', params: [], tags: [], ...def };
  const build = def.build;
  entry.build = (params, ctx) => {
    const g = build(withDefaults(entry, params), ctx);
    g.name = g.name || entry.id;
    g.userData.item = entry.id;
    return g;
  };
  return entry;
}

/* ------------------------------------------------------------- variants */

const SIZE_CTX = { quality: 'high', wallThickness: 0.2, material: () => SIZE_MAT };
const SIZE_MAT = new THREE.MeshBasicMaterial();

/**
 * A preset variant of an existing entry: its own id (`<base.id>-<suffix>`), names, tags and
 * default params, built by the base's build. `size` is measured from a default build when not
 * given (computed lazily, once). Variants carry `variantOf: base.id` (the catalog test limits
 * them to 35 % of a category). Extra fields in the last argument (e.g. `seats: 2`) are copied onto the entry.
 *   variant(sofa, 'velvet-green', '벨벳 그린 소파', 'Green velvet sofa', { fabric: 'fabric-velvet-green', legs: 'tapered' }, { tags: ['velvet', '벨벳'] })
 */
export function variant(base, suffix, ko, en, defaults = {}, { size, tags = [], category, ...extra } = {}) {
  for (const key of Object.keys(defaults)) if (!base.params.some((p) => p.key === key)) throw new Error(`variant ${base.id}-${suffix}: no param ${key}`);
  const params = base.params.map((p) => (p.key in defaults ? { ...p, default: defaults[p.key] } : p));
  const entry = item({
    ...base, id: `${base.id}-${suffix}`, ko, en, params, category: category ?? base.category,
    tags: [...new Set([...tags, ...base.tags])], variantOf: base.id, ...extra,
    build: (q, ctx) => base.build(q, ctx),
  });
  delete entry.size;
  let cached = size ?? null;
  Object.defineProperty(entry, 'size', {
    enumerable: true, configurable: true,
    get() {
      if (!cached) {
        const b = new THREE.Box3().setFromObject(entry.build({}, SIZE_CTX));
        cached = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => Math.round(Math.max(0.01, v) * 1000) / 1000);
      }
      return cached;
    },
    set(v) { cached = v; },
  });
  return entry;
}
