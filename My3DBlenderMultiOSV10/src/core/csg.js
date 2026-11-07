// Constructive solid geometry by BSP trees: union, difference and intersection of closed meshes.
import { compact, createMesh, faceNormal } from './mesh.js';
import { mergeByDistance } from './meshops.js';

const EPS = 1e-5;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const flipPoly = (p) => ({ pts: [...p.pts].reverse(), n: [-p.n[0], -p.n[1], -p.n[2]], w: -p.w, mat: p.mat });

function splitPolygon(plane, poly, coFront, coBack, front, back) {
  const types = poly.pts.map((p) => {
    const d = dot(plane.n, p) - plane.w;
    return d < -EPS ? 2 : d > EPS ? 1 : 0;
  });
  const whole = types.reduce((a, b) => a | b, 0);
  if (whole === 0) (dot(plane.n, poly.n) > 0 ? coFront : coBack).push(poly);
  else if (whole === 1) front.push(poly);
  else if (whole === 2) back.push(poly);
  else {
    const f = [];
    const b = [];
    for (let i = 0; i < poly.pts.length; i++) {
      const j = (i + 1) % poly.pts.length;
      const [ti, tj, vi, vj] = [types[i], types[j], poly.pts[i], poly.pts[j]];
      if (ti !== 2) f.push(vi);
      if (ti !== 1) b.push(vi);
      if ((ti | tj) === 3) {
        const t = (plane.w - dot(plane.n, vi)) / dot(plane.n, [vj[0] - vi[0], vj[1] - vi[1], vj[2] - vi[2]]);
        const m = lerp(vi, vj, t);
        f.push(m);
        b.push(m);
      }
    }
    if (f.length >= 3) front.push({ ...poly, pts: f });
    if (b.length >= 3) back.push({ ...poly, pts: b });
  }
}

class Node {
  constructor(polys) {
    this.plane = null;
    this.front = null;
    this.back = null;
    this.polys = [];
    if (polys?.length) this.build(polys);
  }

  invert() {
    this.polys = this.polys.map(flipPoly);
    if (this.plane) this.plane = { n: [-this.plane.n[0], -this.plane.n[1], -this.plane.n[2]], w: -this.plane.w };
    this.front?.invert();
    this.back?.invert();
    [this.front, this.back] = [this.back, this.front];
  }

  clip(polys) {
    if (!this.plane) return [...polys];
    let front = [];
    let back = [];
    for (const p of polys) splitPolygon(this.plane, p, front, back, front, back);
    if (this.front) front = this.front.clip(front);
    back = this.back ? this.back.clip(back) : [];
    return front.concat(back);
  }

  clipTo(other) {
    this.polys = other.clip(this.polys);
    this.front?.clipTo(other);
    this.back?.clipTo(other);
  }

  all() {
    let out = [...this.polys];
    if (this.front) out = out.concat(this.front.all());
    if (this.back) out = out.concat(this.back.all());
    return out;
  }

  build(polys) {
    if (!polys.length) return;
    if (!this.plane) this.plane = { n: polys[0].n, w: polys[0].w };
    const front = [];
    const back = [];
    for (const p of polys) splitPolygon(this.plane, p, this.polys, this.polys, front, back);
    if (front.length) { this.front ??= new Node(); this.front.build(front); }
    if (back.length) { this.back ??= new Node(); this.back.build(back); }
  }
}

function toPolys(mesh, verts = mesh.verts, mat = 0) {
  const out = [];
  mesh.faces.forEach((face) => {
    const pts = face.map((i) => [...verts[i]]);
    const n = faceNormal({ verts }, face);
    if (n[0] === 0 && n[1] === 0 && n[2] === 0) return;
    out.push({ pts, n, w: dot(n, pts[0]), mat });
  });
  return out;
}

function fromPolys(polys) {
  const verts = [];
  const faces = [];
  for (const p of polys) {
    const face = [];
    for (const pt of p.pts) { face.push(verts.length); verts.push(pt); }
    faces.push(face);
  }
  const mesh = createMesh(verts, faces);
  mergeByDistance(mesh, 1e-5, true);
  return compact(mesh);
}

/** Boolean of two meshes (vertices already in the same space): 'UNION' | 'DIFFERENCE' | 'INTERSECT'. */
export function booleanMesh(meshA, meshB, operation = 'DIFFERENCE') {
  const a = new Node(toPolys(meshA));
  const b = new Node(toPolys(meshB));
  if (operation === 'UNION') {
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.all());
  } else if (operation === 'DIFFERENCE') {
    a.invert();
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.all());
    a.invert();
  } else {
    a.invert();
    b.clipTo(a);
    b.invert();
    a.clipTo(b);
    b.clipTo(a);
    a.build(b.all());
    a.invert();
  }
  return fromPolys(a.all());
}
