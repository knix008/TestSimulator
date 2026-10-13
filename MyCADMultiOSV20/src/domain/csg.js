// Boolean operations on closed triangle meshes (FreeCAD Part: Union, Cut,
// Common), with BSP trees (after Evan Wallace's csg.js, MIT). Input and output
// are triangles [[x, y, z] × 3] with outward-facing (counter-clockwise) winding.
import { collapseShortEdges, simplifyMesh } from './meshtools.js';

const EPSILON = 1e-5;
const COPLANAR = 0;
const FRONT = 1;
const BACK = 2;
const SPANNING = 3;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

class Plane {
  constructor(normal, w) { this.normal = normal; this.w = w; }
  static from([a, b, c]) {
    const n = cross(sub(b, a), sub(c, a));
    const length = Math.hypot(...n);
    if (length < 1e-14) return null;
    const normal = n.map((v) => v / length);
    return new Plane(normal, dot(normal, a));
  }
  flip() { this.normal = this.normal.map((v) => -v); this.w = -this.w; }
  clone() { return new Plane(this.normal.slice(), this.w); }

  /** Sorts `polygon` into the four lists (splitting it when it spans the plane). */
  split(polygon, coplanarFront, coplanarBack, front, back) {
    let type = 0;
    const types = polygon.points.map((p) => {
      const t = dot(this.normal, p) - this.w;
      const kind = t < -EPSILON ? BACK : t > EPSILON ? FRONT : COPLANAR;
      type |= kind;
      return kind;
    });
    if (type === COPLANAR) (dot(this.normal, polygon.plane.normal) > 0 ? coplanarFront : coplanarBack).push(polygon);
    else if (type === FRONT) front.push(polygon);
    else if (type === BACK) back.push(polygon);
    else {
      const f = [];
      const b = [];
      const n = polygon.points.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ti = types[i];
        const tj = types[j];
        const vi = polygon.points[i];
        const vj = polygon.points[j];
        if (ti !== BACK) f.push(vi);
        if (ti !== FRONT) b.push(ti !== BACK ? vi.slice() : vi);
        if ((ti | tj) === SPANNING) {
          const t = (this.w - dot(this.normal, vi)) / dot(this.normal, sub(vj, vi));
          const v = lerp(vi, vj, t);
          f.push(v);
          b.push(v.slice());
        }
      }
      if (f.length >= 3) front.push(new Polygon(f, polygon.plane.clone()));
      if (b.length >= 3) back.push(new Polygon(b, polygon.plane.clone()));
    }
  }
}

class Polygon {
  constructor(points, plane = Plane.from(points)) { this.points = points; this.plane = plane; }
  clone() { return new Polygon(this.points.map((p) => p.slice()), this.plane.clone()); }
  flip() { this.points.reverse(); this.plane.flip(); }
}

class Node {
  constructor(polygons) {
    this.plane = null;
    this.front = null;
    this.back = null;
    this.polygons = [];
    if (polygons) this.build(polygons);
  }

  invert() {
    for (const polygon of this.polygons) polygon.flip();
    this.plane?.flip();
    this.front?.invert();
    this.back?.invert();
    [this.front, this.back] = [this.back, this.front];
  }

  clipPolygons(polygons) {
    if (!this.plane) return polygons.slice();
    let front = [];
    let back = [];
    for (const polygon of polygons) this.plane.split(polygon, front, back, front, back);
    if (this.front) front = this.front.clipPolygons(front);
    back = this.back ? this.back.clipPolygons(back) : [];
    return front.concat(back);
  }

  clipTo(bsp) {
    this.polygons = bsp.clipPolygons(this.polygons);
    this.front?.clipTo(bsp);
    this.back?.clipTo(bsp);
  }

  allPolygons() {
    const out = [];
    const stack = [this];
    while (stack.length) {
      const node = stack.pop();
      out.push(...node.polygons);
      if (node.front) stack.push(node.front);
      if (node.back) stack.push(node.back);
    }
    return out;
  }

  build(polygons) {
    // Iterative, so deep trees do not overflow the stack.
    const work = [[this, polygons]];
    while (work.length) {
      const [node, list] = work.pop();
      if (!list.length) continue;
      if (!node.plane) node.plane = list[0].plane.clone();
      const front = [];
      const back = [];
      for (const polygon of list) node.plane.split(polygon, node.polygons, node.polygons, front, back);
      if (front.length) { node.front ??= new Node(); work.push([node.front, front]); }
      if (back.length) { node.back ??= new Node(); work.push([node.back, back]); }
    }
  }
}

const toPolygons = (triangles) => triangles.map((tri) => {
  const plane = Plane.from(tri);
  return plane ? new Polygon(tri.map((p) => p.slice()), plane) : null;
}).filter(Boolean);

// T-junctions repaired, then flat regions triangulated again from their outlines (far fewer triangles).
export const CSG_OPTIONS = { simplify: true };
const toTriangles = (polygons) => { const tris = collapseShortEdges(conform(polygons.map((polygon) => polygon.points))); return CSG_OPTIONS.simplify ? simplifyMesh(tris) : tris; };

/**
 * Splitting leaves T-junctions (a corner of one face lying on the edge of its
 * neighbour), so the result would not be one closed shell. Every polygon gets
 * the vertices that lie on its edges, then is fanned from its centre when it
 * gained any (from a corner otherwise). Vertices closer than `tolerance` merge.
 */
export function conform(polygons, tolerance = 1e-6) {
  const keyOf = (p) => `${Math.round(p[0] / tolerance)},${Math.round(p[1] / tolerance)},${Math.round(p[2] / tolerance)}`;
  const unique = new Map();
  const snap = (p) => {
    const key = keyOf(p);
    if (!unique.has(key)) unique.set(key, p.slice());
    return unique.get(key);
  };
  const polys = polygons.map((points) => {
    const out = [];
    for (const p of points.map(snap)) if (out[out.length - 1] !== p) out.push(p);
    if (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
    return out;
  }).filter((points) => points.length >= 3);
  const vertices = [...unique.values()];
  // Only an edge without a matching opposite edge can have a T-junction.
  const ids = new Map(vertices.map((v, i) => [v, i]));
  const directed = new Set();
  for (const points of polys) for (let i = 0; i < points.length; i++) directed.add(`${ids.get(points[i])}>${ids.get(points[(i + 1) % points.length])}`);
  const matched = (a, b) => directed.has(`${ids.get(b)}>${ids.get(a)}`);
  // A grid of cells (about an average edge long) for "which vertices are near this edge".
  let total = 0;
  let count = 0;
  for (const points of polys) for (let i = 0; i < points.length; i++) { total += Math.hypot(...sub(points[(i + 1) % points.length], points[i])); count++; }
  const cell = Math.max(count ? total / count : 1, tolerance * 10);
  const grid = new Map();
  const cellKey = (x, y, z) => `${x},${y},${z}`;
  for (const v of vertices) {
    const k = cellKey(Math.floor(v[0] / cell), Math.floor(v[1] / cell), Math.floor(v[2] / cell));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(v);
  }
  const onEdge = (a, b) => {
    if (matched(a, b)) return [];
    const d = sub(b, a);
    const length2 = dot(d, d);
    if (length2 < tolerance * tolerance) return [];
    const found = [];
    // Walk the cells along the edge (and their neighbours).
    const steps = Math.max(1, Math.ceil(Math.sqrt(length2) / cell));
    const cells = new Set();
    for (let i = 0; i <= steps; i++) {
      const p = [a[0] + (d[0] * i) / steps, a[1] + (d[1] * i) / steps, a[2] + (d[2] * i) / steps].map((v) => Math.floor(v / cell));
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) cells.add(cellKey(p[0] + x, p[1] + y, p[2] + z));
    }
    const seen = new Set();
    for (const key of cells) {
      for (const v of grid.get(key) ?? []) {
        if (seen.has(v)) continue;
        seen.add(v);
        if (v === a || v === b) continue;
        const t = dot(sub(v, a), d) / length2;
        if (t <= 1e-9 || t >= 1 - 1e-9) continue;
        const q = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
        if (Math.hypot(...sub(v, q)) <= tolerance * 4) found.push([t, v]);
      }
    }
    return found.sort((p, q) => p[0] - q[0]).map(([, v]) => v);
  };
  const out = [];
  for (const points of polys) {
    const ring = [];
    for (let i = 0; i < points.length; i++) ring.push(points[i], ...onEdge(points[i], points[(i + 1) % points.length]));
    if (ring.length === points.length) {
      for (let i = 1; i < ring.length - 1; i++) out.push([ring[0], ring[i], ring[i + 1]]);
    } else {
      const c = ring.reduce((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length, s[2] + p[2] / ring.length], [0, 0, 0]);
      for (let i = 0; i < ring.length; i++) out.push([c, ring[i], ring[(i + 1) % ring.length]]);
    }
  }
  // Drop slivers with no area.
  return out.filter(([a, b, c]) => Math.hypot(...cross(sub(b, a), sub(c, a))) > tolerance * tolerance).map((tri) => tri.map((p) => p.slice()));
}

/** A ∪ B */
export function union(a, b) {
  const A = new Node(toPolygons(a));
  const B = new Node(toPolygons(b));
  A.clipTo(B);
  B.clipTo(A);
  B.invert();
  B.clipTo(A);
  B.invert();
  A.build(B.allPolygons());
  return toTriangles(A.allPolygons());
}

/** A − B */
export function subtract(a, b) {
  const A = new Node(toPolygons(a));
  const B = new Node(toPolygons(b));
  A.invert();
  A.clipTo(B);
  B.clipTo(A);
  B.invert();
  B.clipTo(A);
  B.invert();
  A.build(B.allPolygons());
  A.invert();
  return toTriangles(A.allPolygons());
}

/** A ∩ B */
export function intersect(a, b) {
  const A = new Node(toPolygons(a));
  const B = new Node(toPolygons(b));
  A.invert();
  B.clipTo(A);
  B.invert();
  A.clipTo(B);
  B.clipTo(A);
  A.build(B.allPolygons());
  A.invert();
  return toTriangles(A.allPolygons());
}

export const BOOLEAN_OPS = { union, cut: subtract, common: intersect };

/** Runs a boolean over a list of meshes: the first one with each of the others in turn. */
export function booleanOf(op, meshes) {
  const fn = BOOLEAN_OPS[op];
  if (!fn) throw new Error(`unknown boolean ${op}`);
  return meshes.slice(1).reduce((acc, mesh) => fn(acc, mesh), meshes[0] ?? []);
}
