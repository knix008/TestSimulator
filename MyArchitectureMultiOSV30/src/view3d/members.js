// 3D of structural members (src/core/members.js). Every straight segment is
// one mesh of a SHARED unit extrusion — the cross-section in millimetres,
// one unit long — placed, turned and stretched by its matrix. A tower of a
// thousand identical braces therefore holds one geometry, and the viewer draws
// all of them in one call (batch.js).

import { memberSection, sectionTriangles, memberPoints, segmentFrame } from "../core/members.js";

const M = 0.001;
// Members this slender (mm, the section's larger side) also get a centre-line
// wire in the viewer (viewer.js buildWires): a cable or rod far away is thinner
// than a pixel and would break up and crawl as the view moves.
export const WIRE_MAX = 200;
// Only round sections: they have no feature edges along them and the
// thinnest silhouettes (cables, hangers, rods). Angles and flats have
// corners of their own, and a wire there shows beside them.
const ROUND = new Set(["cable", "round", "tube"]);
const GEOS = new WeakMap(); // THREE → Map(section key → BufferGeometry)

// The unit extrusion of a member's section: x = u, y = v (mm), z = 0…1 along.
export function memberGeometry(THREE, m) {
  let cache = GEOS.get(THREE);
  if (!cache) GEOS.set(THREE, (cache = new Map()));
  const key = `${m.profile}|${m.w}|${m.h}|${m.t}`;
  if (cache.has(key)) return cache.get(key);
  const sec = memberSection(m);
  const pos = [], nor = [], uv = [];
  const push = (p, n, u) => { pos.push(...p); nor.push(...n); uv.push(...u); };
  // Sides: one quad per edge of each ring, normals out of the material.
  for (const ring of [sec.outer, sec.hole].filter(Boolean)) {
    let s = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const n = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len, 0];
      const s2 = s + len * M;
      const A0 = [a[0], a[1], 0], B0 = [b[0], b[1], 0], B1 = [b[0], b[1], 1], A1 = [a[0], a[1], 1];
      push(A0, n, [s, 0]); push(B0, n, [s2, 0]); push(B1, n, [s2, 1]);
      push(A0, n, [s, 0]); push(B1, n, [s2, 1]); push(A1, n, [s, 1]);
      s = s2;
    }
  }
  // Caps.
  for (const [a, b, c] of sectionTriangles(sec)) {
    const U = (q) => [q[0] * M, q[1] * M];
    push([a[0], a[1], 1], [0, 0, 1], U(a)); push([b[0], b[1], 1], [0, 0, 1], U(b)); push([c[0], c[1], 1], [0, 0, 1], U(c));
    push([a[0], a[1], 0], [0, 0, -1], U(a)); push([c[0], c[1], 0], [0, 0, -1], U(c)); push([b[0], b[1], 0], [0, 0, -1], U(b));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  cache.set(key, g);
  return g;
}

// Where the wire runs in the section (mm): inside the material, so the faces
// hide it whenever the member is wider than a pixel. The middle of the box
// is empty for an angle (L) or a channel (C): theirs runs in the heel / web.
export function wirePoint(m) {
  const w = m.w || 0, h = m.profile === "round" || m.profile === "tube" || m.profile === "cable" ? w : m.h || 0, t = m.t || 0;
  if (m.profile === "L") return [-w / 2 + t / 2, -h / 2 + t / 2];
  if (m.profile === "C") return [-w / 2 + t / 2, 0];
  return [0, 0];
}

// Plan vector (x, y, z up) → world (x, y up, z = plan y).
const Wv = (q) => [q[0], q[2], q[1]];

// One group per member: a mesh per segment.
export function memberGroup(THREE, mats, p, m, material) {
  const g = new THREE.Group();
  g.name = `member ${m.name || m.id}`;
  const geo = memberGeometry(THREE, m);
  const pts = memberPoints(p, m);
  const basis = new THREE.Matrix4();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const f = segmentFrame(a, b, m.roll || 0);
    if (f.length < 1) continue;
    const mesh = new THREE.Mesh(geo, material);
    mesh.userData.sharedGeometry = true;
    basis.makeBasis(new THREE.Vector3(...Wv(f.u)), new THREE.Vector3(...Wv(f.v)), new THREE.Vector3(...Wv(f.t)));
    mesh.quaternion.setFromRotationMatrix(basis);
    mesh.position.set(a[0] * M, a[2] * M, a[1] * M);
    mesh.scale.set(M, M, f.length * M);
    mesh.castShadow = m.profile !== "cable" || m.w > 40;
    if (ROUND.has(m.profile) && (m.w || 0) <= WIRE_MAX) mesh.userData.wire = wirePoint(m);
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}
