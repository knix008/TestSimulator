// Boolean solid tools on meshes (src/core/mesh.js): union, subtract,
// intersect, split, imprint ("intersect faces") and the general push/pull.
//
// Constructive solid geometry with BSP trees (after Evan Wallace's csg.js,
// MIT): each solid's triangles are split by the other's planes and the parts
// inside / outside kept as the operation asks. Every fragment keeps the plane
// of the face it came from, so coplanar faces stay exactly coplanar and the
// result is merged back into clean faces (with holes) by meshFromPolygons.
// Trees are built and walked iteratively, so big models do not overflow
// the stack.

import {
  dot, sub, mul, lerp3, norm, newell, len, faceLoops, loopPts, triangulateFace, faceNormal, meshFromPolygons,
  isClosed, isLoneFace, stretchInfo, stretchFace, extrudeFace, cloneMesh, add, meshVolume, TOL,
} from "./mesh.js";

const EPS = 1e-5; // mm: thickness of a plane

class Plane {
  constructor(n, w) { this.n = n; this.w = w; }
  flip() { return new Plane(mul(this.n, -1), -this.w); }
}

const COPLANAR = 0, FRONT = 1, BACK = 2, SPANNING = 3;

function splitPolygon(plane, poly, coFront, coBack, front, back) {
  let type = 0;
  const types = [];
  for (const p of poly.pts) {
    const t = dot(plane.n, p) - plane.w;
    const ty = t < -EPS ? BACK : t > EPS ? FRONT : COPLANAR;
    type |= ty;
    types.push(ty);
  }
  if (type === COPLANAR) { (dot(plane.n, poly.plane.n) > 0 ? coFront : coBack).push(poly); return; }
  if (type === FRONT) { front.push(poly); return; }
  if (type === BACK) { back.push(poly); return; }
  const f = [], b = [];
  const n = poly.pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ti = types[i], tj = types[j], vi = poly.pts[i], vj = poly.pts[j];
    if (ti !== BACK) f.push(vi);
    if (ti !== FRONT) b.push(vi);
    if ((ti | tj) === SPANNING) {
      const t = (plane.w - dot(plane.n, vi)) / dot(plane.n, sub(vj, vi));
      const v = lerp3(vi, vj, t);
      f.push(v);
      b.push(v);
    }
  }
  if (f.length >= 3) front.push({ ...poly, pts: f });
  if (b.length >= 3) back.push({ ...poly, pts: b });
}

const flipPoly = (p) => ({ ...p, pts: p.pts.slice().reverse(), plane: p.plane.flip() });

class Node {
  constructor(polys) { this.plane = null; this.front = null; this.back = null; this.polygons = []; if (polys) this.build(polys); }
  nodes() { const out = []; const st = [this]; while (st.length) { const n = st.pop(); out.push(n); if (n.front) st.push(n.front); if (n.back) st.push(n.back); } return out; }
  invert() {
    for (const n of this.nodes()) {
      n.polygons = n.polygons.map(flipPoly);
      if (n.plane) n.plane = n.plane.flip();
      [n.front, n.back] = [n.back, n.front];
    }
  }
  // Polygons outside this solid (front of every leaf); `inside` collects the rest.
  clipPolygons(polys, inside = null) {
    if (!this.plane) return polys.slice();
    const out = [];
    const st = [[this, polys]];
    while (st.length) {
      const [n, ps] = st.pop();
      if (!ps.length) continue;
      const front = [], back = [];
      for (const p of ps) splitPolygon(n.plane, p, front, back, front, back);
      if (n.front) st.push([n.front, front]); else out.push(...front);
      if (n.back) st.push([n.back, back]); else if (inside) inside.push(...back);
    }
    return out;
  }
  clipTo(bsp) { for (const n of this.nodes()) n.polygons = bsp.clipPolygons(n.polygons); }
  allPolygons() { return this.nodes().flatMap((n) => n.polygons); }
  build(polys) {
    const st = [[this, polys]];
    while (st.length) {
      const [n, ps] = st.pop();
      if (!ps.length) continue;
      if (!n.plane) n.plane = ps[0].plane;
      const front = [], back = [];
      for (const p of ps) splitPolygon(n.plane, p, n.polygons, n.polygons, front, back);
      if (front.length) { if (!n.front) n.front = new Node(); st.push([n.front, front]); }
      if (back.length) { if (!n.back) n.back = new Node(); st.push([n.back, back]); }
    }
  }
}

// Mesh → triangles carrying their face's plane, material and a tag.
export function toPolygons(m, { material, tag } = {}) {
  const out = [];
  m.f.forEach((f, fi) => {
    const n = faceNormal(m, fi);
    if (len(n) === 0) return;
    const plane = new Plane(n, dot(n, m.v[f.l[0]]));
    for (const t of triangulateFace(m, fi)) out.push({ pts: t.map((i) => m.v[i].slice()), plane, m: f.m || material, tag });
  });
  return out;
}

const fromPolygons = (polys) => meshFromPolygons(polys.map((p) => ({ pts: p.pts, n: p.plane.n, m: p.m, tag: p.tag })));

// ma / mb: the solids' own materials, kept on the faces of the result.
export function union(a, b, { ma, mb } = {}) {
  const A = new Node(toPolygons(a, { material: ma })), B = new Node(toPolygons(b, { material: mb }));
  A.clipTo(B); B.clipTo(A); B.invert(); B.clipTo(A); B.invert();
  A.build(B.allPolygons());
  return fromPolygons(A.allPolygons());
}

export function subtract(a, b, { ma, mb } = {}) {
  const A = new Node(toPolygons(a, { material: ma })), B = new Node(toPolygons(b, { material: mb }));
  A.invert(); A.clipTo(B); B.clipTo(A); B.invert(); B.clipTo(A); B.invert();
  A.build(B.allPolygons()); A.invert();
  return fromPolygons(A.allPolygons());
}

export function intersect(a, b, { ma, mb } = {}) {
  const A = new Node(toPolygons(a, { material: ma })), B = new Node(toPolygons(b, { material: mb }));
  A.invert(); B.clipTo(A); B.invert(); A.clipTo(B); B.clipTo(A);
  A.build(B.allPolygons()); A.invert();
  return fromPolygons(A.allPolygons());
}

// A's surface cut along where it passes through B (both sides kept, so the
// intersection shows as edges and each part can be pushed or painted).
export function imprint(a, b, { ma } = {}) {
  const B = new Node(toPolygons(b));
  const inside = [];
  const outside = B.clipPolygons(toPolygons(a, { material: ma, tag: "o" }), inside);
  return fromPolygons([...outside, ...inside.map((p) => ({ ...p, tag: "i" }))]);
}

// SketchUp's Split: A − B, B − A and A ∩ B.
export function split(a, b, opts = {}) {
  return { aOnly: subtract(a, b, opts), bOnly: subtract(b, a, { ma: opts.mb, mb: opts.ma }), both: intersect(a, b, opts) };
}

// The face swept by d along its normal (a closed prism), starting just
// outside the face so it cuts the face away cleanly.
export function sweptFace(m, fi, d) {
  const f = m.f[fi];
  const n = faceNormal(m, fi);
  const lift = 0.5 * Math.sign(-d || 1);
  const loops = faceLoops(f).map((l) => loopPts(m, l).map((p) => add(p, mul(n, lift))));
  const v = loops.flat();
  let k = 0;
  const idx = loops.map((l) => l.map(() => k++));
  const face = { l: idx[0], ...(idx.length > 1 ? { h: idx.slice(1) } : {}), ...(f.m ? { m: f.m } : {}) };
  return extrudeFace({ v, f: [face] }, 0, d - lift);
}

// Push/pull a face by d mm along its normal (> 0 out of the solid):
//  · every neighbour perpendicular → the face just moves and they stretch;
//  · pushed into a closed solid → the swept face is carved out (a recess,
//    or a hole when it goes right through);
//  · otherwise → extruded with new side faces (a lone face becomes a box).
// copy: always start a new extrusion (SketchUp's Ctrl).
// → {mesh, mode: "stretch" | "carve" | "extrude"}; mesh null = nothing left.
export function pushPull(m, fi, d, { copy = false } = {}) {
  if (!d || !m.f[fi]) return { mesh: cloneMesh(m), mode: "none" };
  if (!copy) {
    const st = stretchInfo(m, fi);
    if (st.ok && (d > 0 || -d < st.depth - TOL)) return { mesh: stretchFace(m, fi, d), mode: "stretch" };
    if (st.ok) return { mesh: stretchFace(m, fi, -(st.depth - 1)), mode: "stretch" };
  }
  if (d < 0 && isClosed(m) && !isLoneFace(m, fi)) {
    const out = subtract(m, sweptFace(m, fi, d));
    return { mesh: out.f.length ? out : null, mode: "carve" };
  }
  return { mesh: extrudeFace(m, fi, d), mode: "extrude" };
}

// Is the mesh a proper closed solid the boolean tools can use?
export function isSolid(m) { return !!m && isClosed(m) && meshVolume(m) > 0; }

export { norm, newell };
