// Closed triangle surfaces like body.mesh() for the finite-element tests (not a test file itself):
// { vertices, triangles, faceGroups: [{ start, count, faceId }] }, counter-clockwise seen from outside.

function builder() {
  const vertices = [], triangles = [], faceGroups = [];
  return {
    vertices, triangles, faceGroups,
    v(x, y, z) { vertices.push(x, y, z); return vertices.length / 3 - 1; },
    tri(a, b, c) { triangles.push(a, b, c); },
    face(id, fn) { const start = triangles.length; fn(); faceGroups.push({ start, count: triangles.length - start, faceId: id }); },
    done() { return { vertices: Float32Array.from(vertices), triangles: Uint32Array.from(triangles), faceGroups }; },
  };
}

/** Box [0,L]×[0,W]×[0,H] + at; faces 0 x=0, 1 x=L, 2 y=0, 3 y=W, 4 z=0, 5 z=H (+firstFace). */
export function boxMesh(L, W, H, div = 2, at = [0, 0, 0], firstFace = 0) {
  const b = builder();
  const faces = [
    [[0, 0, 0], [0, 0, H], [0, W, 0]], [[L, 0, 0], [0, W, 0], [0, 0, H]],
    [[0, 0, 0], [L, 0, 0], [0, 0, H]], [[0, W, 0], [0, 0, H], [L, 0, 0]],
    [[0, 0, 0], [0, W, 0], [L, 0, 0]], [[0, 0, H], [L, 0, 0], [0, W, 0]],
  ];
  faces.forEach(([org, a, c], f) => b.face(firstFace + f, () => {
    const base = b.vertices.length / 3;
    for (let j = 0; j <= div; j++) for (let i = 0; i <= div; i++) b.v(...org.map((o, k) => at[k] + o + (a[k] * i) / div + (c[k] * j) / div));
    for (let j = 0; j < div; j++) for (let i = 0; i < div; i++) { const p = base + j * (div + 1) + i; b.tri(p, p + 1, p + div + 2); b.tri(p, p + div + 2, p + div + 1); }
  }));
  return b.done();
}

/** Ear-clipping triangulation of a simple polygon (2D points, counter-clockwise): index triples. */
function earClip(pts) {
  const idx = pts.map((_, i) => i), out = [];
  const area2 = (a, b, c) => (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[b][1] - pts[a][1]) * (pts[c][0] - pts[a][0]);
  const insideTri = (p, a, b, c) => area2(a, b, p) >= 0 && area2(b, c, p) >= 0 && area2(c, a, p) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 100000) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      if (area2(a, b, c) <= 1e-12) continue;
      if (idx.some((p) => p !== a && p !== b && p !== c && insideTri(p, a, b, c) && !(pts[p][0] === pts[a][0] && pts[p][1] === pts[a][1]) && !(pts[p][0] === pts[c][0] && pts[p][1] === pts[c][1]))) continue;
      out.push([a, b, c]); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push(idx.slice());
  return out;
}

/**
 * Extrusion along z (0…H) of a counter-clockwise outline given as segments [{ pts: [[x,y], …], faceId }] (each
 * segment's points run to the next segment's first point). Bottom face `bottom`, top `top`.
 */
export function extrudeOutline(segments, H, { bottom = 100, top = 101, layers = 1 } = {}) {
  const b = builder();
  const ring = [], faceOfEdge = [];
  for (const s of segments) for (const p of s.pts) { ring.push(p); faceOfEdge.push(s.faceId); }
  const tris = earClip(ring);
  b.face(bottom, () => { const base = ring.map(([x, y]) => b.v(x, y, 0)); for (const [p, q, r] of tris) b.tri(base[p], base[r], base[q]); });
  b.face(top, () => { const base = ring.map(([x, y]) => b.v(x, y, H)); for (const [p, q, r] of tris) b.tri(base[p], base[q], base[r]); });
  const ids = [...new Set(faceOfEdge)];
  for (const id of ids) b.face(id, () => {
    for (let i = 0; i < ring.length; i++) {
      if (faceOfEdge[i] !== id) continue;
      const p = ring[i], q = ring[(i + 1) % ring.length];
      for (let l = 0; l < layers; l++) {
        const z0 = (H * l) / layers, z1 = (H * (l + 1)) / layers;
        const a = b.v(p[0], p[1], z0), c = b.v(q[0], q[1], z0), d = b.v(q[0], q[1], z1), e = b.v(p[0], p[1], z1);
        b.tri(a, c, d); b.tri(a, d, e);
      }
    }
  });
  return b.done();
}

/**
 * Quarter plate with a quarter hole at the origin: x ∈ [0, A], y ∈ [0, B], hole radius r, thickness t.
 * Faces: 0 x = 0 (symmetry), 1 y = 0 (symmetry), 2 x = A (loaded end), 3 y = B (free edge), 4 hole, 100 bottom, 101 top.
 */
export function quarterPlateWithHole(A, B, r, t, arcSegments = 48) {
  // Counter-clockwise outline: (r,0) → (A,0) → (A,B) → (0,B) → (0,r) → the arc (clockwise about the origin) → (r,0).
  const arc = [];
  for (let i = 0; i < arcSegments; i++) { const th = (Math.PI / 2) * (1 - i / arcSegments); arc.push([r * Math.cos(th), r * Math.sin(th)]); }
  return extrudeOutline([
    { pts: [[r, 0]], faceId: 1 },
    { pts: [[A, 0]], faceId: 2 },
    { pts: [[A, B]], faceId: 3 },
    { pts: [[0, B]], faceId: 0 },
    { pts: arc, faceId: 4 },
  ], t, { bottom: 100, top: 101 });
}

/**
 * Half plate with a half hole at the origin: x ∈ [−A, A], y ∈ [0, B], hole radius r, thickness t (the hole's top
 * θ = 90° lies on the smooth hole surface). Faces: 1 y = 0 (symmetry), 2 x = A, 3 y = B, 4 hole, 5 x = −A, 100 bottom, 101 top.
 */
export function halfPlateWithHole(A, B, r, t, arcSegments = 96) {
  const arc = [];
  for (let i = 0; i < arcSegments; i++) { const th = Math.PI * (1 - i / arcSegments); arc.push([r * Math.cos(th), r * Math.sin(th)]); }
  return extrudeOutline([
    { pts: [[-A, 0]], faceId: 1 },
    { pts: arc, faceId: 4 },
    { pts: [[r, 0]], faceId: 1 },
    { pts: [[A, 0]], faceId: 2 },
    { pts: [[A, B]], faceId: 3 },
    { pts: [[-A, B]], faceId: 5 },
  ], t, { bottom: 100, top: 101 });
}

/** Cylinder of radius R along z from 0 to H; faces 0 side, 1 bottom (z = 0), 2 top. */
export function cylinderMesh(R, H, seg = 48, layers = 8, at = [0, 0, 0]) {
  const b = builder();
  const ring = (z) => Array.from({ length: seg }, (_, i) => b.v(at[0] + R * Math.cos((2 * Math.PI * i) / seg), at[1] + R * Math.sin((2 * Math.PI * i) / seg), at[2] + z));
  b.face(0, () => {
    let lo = ring(0);
    for (let l = 1; l <= layers; l++) {
      const hi = ring((H * l) / layers);
      for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; b.tri(lo[i], lo[j], hi[j]); b.tri(lo[i], hi[j], hi[i]); }
      lo = hi;
    }
  });
  b.face(1, () => { const c = b.v(at[0], at[1], at[2]), r = ring(0); for (let i = 0; i < seg; i++) b.tri(c, r[(i + 1) % seg], r[i]); });
  b.face(2, () => { const c = b.v(at[0], at[1], at[2] + H), r = ring(H); for (let i = 0; i < seg; i++) b.tri(c, r[i], r[(i + 1) % seg]); });
  return b.done();
}

/**
 * Quarter of a spherical cap: sphere of radius R centred at (0,0,R), the part z ∈ [0, c] (c ≤ R), x ≥ 0, y ≥ 0.
 * Faces: 0 the sphere, 1 top plane z = c, 2 x = 0, 3 y = 0. The lowest point (0,0,0) touches z = 0.
 */
export function quarterCap(R, c, nTheta = 32, nPhi = 16) {
  const b = builder();
  const th1 = Math.acos((R - c) / R);                    // polar angle from the bottom pole to the top rim
  // Points on the sphere: polar angle θ ∈ [0, th1] from the bottom pole, azimuth φ ∈ [0, π/2].
  const P = (th, ph) => [R * Math.sin(th) * Math.cos(ph), R * Math.sin(th) * Math.sin(ph), R - R * Math.cos(th)];
  const grid = [];
  b.face(0, () => {
    const pole = b.v(0, 0, 0);
    for (let i = 1; i <= nTheta; i++) { const row = []; for (let j = 0; j <= nPhi; j++) row.push(b.v(...P((th1 * i) / nTheta, ((Math.PI / 2) * j) / nPhi))); grid.push(row); }
    for (let j = 0; j < nPhi; j++) b.tri(pole, grid[0][j + 1], grid[0][j]);
    for (let i = 0; i + 1 < nTheta; i++) for (let j = 0; j < nPhi; j++) { b.tri(grid[i][j], grid[i][j + 1], grid[i + 1][j + 1]); b.tri(grid[i][j], grid[i + 1][j + 1], grid[i + 1][j]); }
  });
  const rim = grid[nTheta - 1].map((_, j) => P(th1, ((Math.PI / 2) * j) / nPhi));
  const rc = R * Math.sin(th1);
  b.face(1, () => {             // top: fan from the corner (0,0,c), counter-clockwise from above
    const o = b.v(0, 0, c), r = rim.map((p) => b.v(...p));
    for (let j = 0; j < nPhi; j++) b.tri(o, r[j], r[j + 1]);
  });
  // Side x = 0: the profile in the yz plane (φ = π/2), closed by the axis and the top.
  const profile = (ph) => [[0, 0, 0], ...Array.from({ length: nTheta }, (_, i) => P((th1 * (i + 1)) / nTheta, ph)), [0, 0, c]];
  const sideFan = (ph, flip, id) => b.face(id, () => {
    const pts = profile(ph).map((p) => b.v(...p)), o = pts.at(-1);
    for (let i = 0; i + 2 < pts.length; i++) { if (flip) b.tri(o, pts[i], pts[i + 1]); else b.tri(o, pts[i + 1], pts[i]); }
  });
  sideFan(Math.PI / 2, false, 2);
  sideFan(0, true, 3);
  void rc;
  return b.done();
}

/** Signed volume of a surface. */
export function surfaceVolume(m) {
  const V = m.vertices, T = m.triangles;
  let vol = 0;
  for (let t = 0; t < T.length; t += 3) {
    const [a, b, c] = [3 * T[t], 3 * T[t + 1], 3 * T[t + 2]];
    vol += (V[a] * (V[b + 1] * V[c + 2] - V[b + 2] * V[c + 1]) - V[a + 1] * (V[b] * V[c + 2] - V[b + 2] * V[c]) + V[a + 2] * (V[b] * V[c + 1] - V[b + 1] * V[c])) / 6;
  }
  return vol;
}

/** Tube along z: outer radius Ro, bore Ri, length L. Faces 0 outside, 1 bore, 2 end z = 0, 3 end z = L. */
export function tubeMesh(Ro, Ri, L, seg = 48, layers = 8) {
  const b = builder();
  const ring = (r, z) => Array.from({ length: seg }, (_, i) => b.v(r * Math.cos((2 * Math.PI * i) / seg), r * Math.sin((2 * Math.PI * i) / seg), z));
  const side = (r, id, out) => b.face(id, () => {
    let lo = ring(r, 0);
    for (let l = 1; l <= layers; l++) {
      const hi = ring(r, (L * l) / layers);
      for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; if (out) { b.tri(lo[i], lo[j], hi[j]); b.tri(lo[i], hi[j], hi[i]); } else { b.tri(lo[i], hi[j], lo[j]); b.tri(lo[i], hi[i], hi[j]); } }
      lo = hi;
    }
  });
  side(Ro, 0, true); side(Ri, 1, false);
  const end = (z, id, up) => b.face(id, () => {
    const o = ring(Ro, z), n = ring(Ri, z);
    for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; if (up) { b.tri(n[i], o[i], o[j]); b.tri(n[i], o[j], n[j]); } else { b.tri(n[i], o[j], o[i]); b.tri(n[i], n[j], o[j]); } }
  });
  end(0, 2, false); end(L, 3, true);
  return b.done();
}

/** A ring sector Ri…Ro, 0…L in z, θ from 0 to `angle`: faces 0 outer, 1 inner, 2 z = 0, 3 z = L, 4 θ = 0, 5 θ = angle. */
export function sectorMesh(Ro, Ri, L, angle, seg = 12, layers = 4, rad = 3) {
  const vertices = [], triangles = [], faceGroups = [];
  const v = (r, th, z) => { vertices.push(r * Math.cos(th), r * Math.sin(th), z); return vertices.length / 3 - 1; };
  const grid = (fn, nu, nv) => { const ids = []; for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) ids.push(fn(i / nu, j / nv)); return ids; };
  const face = (id, ids, nu, nv, flip) => {
    const start = triangles.length;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const p = j * (nu + 1) + i, a = ids[p], b = ids[p + 1], c = ids[p + nu + 2], d = ids[p + nu + 1];
      if (flip) triangles.push(a, c, b, a, d, c); else triangles.push(a, b, c, a, c, d);
    }
    faceGroups.push({ start, count: triangles.length - start, faceId: id });
  };
  face(0, grid((s, t) => v(Ro, s * angle, t * L), seg, layers), seg, layers, false);
  face(1, grid((s, t) => v(Ri, s * angle, t * L), seg, layers), seg, layers, true);
  face(2, grid((s, t) => v(Ri + t * (Ro - Ri), s * angle, 0), seg, rad), seg, rad, false);
  face(3, grid((s, t) => v(Ri + t * (Ro - Ri), s * angle, L), seg, rad), seg, rad, true);
  face(4, grid((s, t) => v(Ri + s * (Ro - Ri), 0, t * L), rad, layers), rad, layers, false);
  face(5, grid((s, t) => v(Ri + s * (Ro - Ri), angle, t * L), rad, layers), rad, layers, true);
  // Weld equal points (the shared edges).
  const key = new Map(), map = []; const out = [];
  for (let i = 0; i < vertices.length / 3; i++) { const k = [0, 1, 2].map((c) => Math.round(vertices[3 * i + c] * 1e6)).join(','); if (!key.has(k)) { key.set(k, out.length / 3); out.push(vertices[3 * i], vertices[3 * i + 1], vertices[3 * i + 2]); } map.push(key.get(k)); }
  return { vertices: Float32Array.from(out), triangles: Uint32Array.from(triangles.map((i) => map[i])), faceGroups };
}

