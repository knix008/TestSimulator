// Tetrahedral meshing of a closed triangle surface (no kernel, no DOM).
//
// Method (lattice cutting with vertex warping, after the isosurface-stuffing idea of Labelle & Shewchuk):
//  1. A background lattice of boxes of about the requested element size, aligned to the part's bounding box
//     (so axis-aligned faces fall on lattice planes), padded by one box; every box is split into the 6 Kuhn
//     tetrahedra around its main diagonal (conforming from box to box).
//  2. Each lattice node gets a signed distance φ to the surface: |φ| from the nearest triangle, the sign from ray
//     parity along +x (inside > 0). |φ| below 1e-9·h counts as on the surface (φ = 0).
//  3. Warping: where the surface cuts a lattice edge within α = 0.25 of its length from an end, that end moves
//     onto the cut point and becomes a surface node (φ = 0) — this keeps cut points away from nodes so no slivers
//     appear (the stencils below only ever cut edges near their middle).
//  4. Every lattice tet is cut by φ = 0 into the part inside: whole (no negative node), a tet (1 positive), a
//     prism (2 or 3 positive) or a pyramid (2 positive + 1 surface node); prisms and pyramids are split into tets
//     with quad diagonals chosen from the smallest global node id, so neighbours always agree. Cut points are shared
//     by lattice edge and projected onto the true surface.
//  5. Optional sharp-feature snapping (surface nodes near a CAD edge / corner move onto it), local refinement by
//     conforming longest-edge bisection (Rivara closure) near chosen faces / points with a graded size, then
//     quadratic (T10) mid-edge nodes, the ones on the boundary projected onto the surface (curved elements) unless
//     that would fold an element.
//  6. Boundary faces (T3 / T6) are tagged with the CAD face id of the nearest surface triangle (loads, fixtures);
//     every surface vertex is located in an element (barycentric coordinates) for the colour plots.
//
// surface = { vertices, triangles, faceGroups: [{ start, count, faceId }] } like body.mesh() (start / count in
// index entries); triangles wound counter-clockwise seen from outside.

import { TET_EDGES, FACES, FACE_NODES10, edgeNode, tetVolume, shapeValues, shapeDerivatives, gradients, GAUSS4 } from './elements.js';

const ALPHA = 0.25;

// ───────────────────────── surface queries

/** Closest point on triangle abc to p (Ericson): returns [x, y, z]. */
function closestOnTriangle(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz, out) {
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { out[0] = ax; out[1] = ay; out[2] = az; return out; }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { out[0] = bx; out[1] = by; out[2] = bz; return out; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); out[0] = ax + v * abx; out[1] = ay + v * aby; out[2] = az + v * abz; return out; }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { out[0] = cx; out[1] = cy; out[2] = cz; return out; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); out[0] = ax + w * acx; out[1] = ay + w * acy; out[2] = az + w * acz; return out; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); out[0] = bx + w * (cx - bx); out[1] = by + w * (cy - by); out[2] = bz + w * (cz - bz); return out; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  out[0] = ax + abx * v + acx * w; out[1] = ay + aby * v + acy * w; out[2] = az + abz * v + acz * w;
  return out;
}

/** The surface with a uniform triangle hash: closest point, inside test, face of each triangle. */
export function surfaceModel(surface) {
  const V = Float64Array.from(surface.vertices), T = Int32Array.from(surface.triangles), nt = T.length / 3;
  const faceOf = new Int32Array(nt).fill(-1);
  for (const g of surface.faceGroups ?? []) for (let t = g.start / 3; t < (g.start + g.count) / 3; t++) faceOf[t] = g.faceId;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < V.length; i += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], V[i + a]); hi[a] = Math.max(hi[a], V[i + a]); }
  let volume = 0, area = 0;
  const faceArea = new Map();
  for (let t = 0; t < nt; t++) {
    const a = 3 * T[3 * t], b = 3 * T[3 * t + 1], c = 3 * T[3 * t + 2];
    volume += (V[a] * (V[b + 1] * V[c + 2] - V[b + 2] * V[c + 1]) - V[a + 1] * (V[b] * V[c + 2] - V[b + 2] * V[c]) + V[a + 2] * (V[b] * V[c + 1] - V[b + 1] * V[c])) / 6;
    const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
    const A = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    area += A; faceArea.set(faceOf[t], (faceArea.get(faceOf[t]) ?? 0) + A);
  }
  const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
  // Hash: cells of about (volume of the box / 20000)^(1/3), at least size/64.
  const cell = Math.max(size / 64, Math.cbrt(Math.max(1e-30, (hi[0] - lo[0] + 1e-9) * (hi[1] - lo[1] + 1e-9) * (hi[2] - lo[2] + 1e-9)) / 20000));
  const dims = [0, 1, 2].map((a) => Math.max(1, Math.ceil((hi[a] - lo[a]) / cell) + 1));
  const buckets = new Map();
  const key = (i, j, k) => i + dims[0] * (j + dims[1] * k);
  const cellOf = (x, a) => Math.min(dims[a] - 1, Math.max(0, Math.floor((x - lo[a]) / cell)));
  for (let t = 0; t < nt; t++) {
    const p = [3 * T[3 * t], 3 * T[3 * t + 1], 3 * T[3 * t + 2]];
    const c0 = [0, 1, 2].map((a) => cellOf(Math.min(V[p[0] + a], V[p[1] + a], V[p[2] + a]), a));
    const c1 = [0, 1, 2].map((a) => cellOf(Math.max(V[p[0] + a], V[p[1] + a], V[p[2] + a]), a));
    for (let k = c0[2]; k <= c1[2]; k++) for (let j = c0[1]; j <= c1[1]; j++) for (let i = c0[0]; i <= c1[0]; i++) {
      const kk = key(i, j, k); let b = buckets.get(kk); if (!b) buckets.set(kk, (b = [])); b.push(t);
    }
  }
  const stamp = new Int32Array(nt);
  let stampId = 0;
  const tmp = [0, 0, 0];
  /** Closest surface point within maxDist (optionally only triangles whose face passes filter): { d2, point, tri } or null. */
  function closest(px, py, pz, maxDist = size, filter = null) {
    const r = Math.ceil(maxDist / cell);
    const ci = cellOf(px, 0), cj = cellOf(py, 1), ck = cellOf(pz, 2);
    let best = maxDist * maxDist, bt = -1;
    const bp = [px, py, pz];
    stampId++;
    // Search shells outwards so a near hit stops the search early.
    for (let ring = 0; ring <= r; ring++) {
      if (bt >= 0 && (ring - 1) * cell > Math.sqrt(best)) break;
      for (let k = ck - ring; k <= ck + ring; k++) {
        if (k < 0 || k >= dims[2]) continue;
        for (let j = cj - ring; j <= cj + ring; j++) {
          if (j < 0 || j >= dims[1]) continue;
          const shell = Math.abs(j - cj) === ring || Math.abs(k - ck) === ring, step = shell || ring === 0 ? 1 : 2 * ring;
          for (let i = ci - ring; i <= ci + ring; i += step) {
            if (i < 0 || i >= dims[0]) continue;
            const b = buckets.get(key(i, j, k));
            if (!b) continue;
            for (const t of b) {
              if (stamp[t] === stampId) continue;
              stamp[t] = stampId;
              if (filter && !filter(faceOf[t])) continue;
              const a = 3 * T[3 * t], bb = 3 * T[3 * t + 1], c = 3 * T[3 * t + 2];
              closestOnTriangle(px, py, pz, V[a], V[a + 1], V[a + 2], V[bb], V[bb + 1], V[bb + 2], V[c], V[c + 1], V[c + 2], tmp);
              const d2 = (tmp[0] - px) ** 2 + (tmp[1] - py) ** 2 + (tmp[2] - pz) ** 2;
              if (d2 < best) { best = d2; bt = t; bp[0] = tmp[0]; bp[1] = tmp[1]; bp[2] = tmp[2]; }
            }
          }
        }
      }
    }
    return bt < 0 ? null : { d2: best, point: bp, tri: bt, faceId: faceOf[bt] };
  }
  /** Ray parity along +x (jittered off lattice-aligned edges). */
  function inside(px, py, pz) {
    const y = py + 1.37e-7 * size, z = pz + 2.71e-7 * size;
    const cj = cellOf(y, 1), ck = cellOf(z, 2);
    let count = 0;
    stampId++;
    for (let i = cellOf(px, 0); i < dims[0]; i++) {
      const b = buckets.get(key(i, cj, ck));
      if (!b) continue;
      for (const t of b) {
        if (stamp[t] === stampId) continue;
        stamp[t] = stampId;
        const x = rayX(t, y, z);
        if (x !== null && x > px) count++;
      }
    }
    return (count & 1) === 1;
  }
  /** x where the line (y, z) ∥ x crosses triangle t, or null. */
  function rayX(t, y, z) {
    const a = 3 * T[3 * t], b = 3 * T[3 * t + 1], c = 3 * T[3 * t + 2];
    const ay = V[a + 1], az = V[a + 2], by = V[b + 1], bz = V[b + 2], cy = V[c + 1], cz = V[c + 2];
    const d = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    if (Math.abs(d) < 1e-300) return null;
    const u = ((y - ay) * (cz - az) - (z - az) * (cy - ay)) / d, v = ((by - ay) * (z - az) - (bz - az) * (y - ay)) / d;
    if (u < 0 || v < 0 || u + v > 1) return null;
    return V[a] + u * (V[b] - V[a]) + v * (V[c] - V[a]);
  }
  /** Unit normal of surface triangle t. */
  function triNormal(t) {
    const a = 3 * T[3 * t], b = 3 * T[3 * t + 1], c = 3 * T[3 * t + 2];
    const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx], l = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  }
  /**
   * CAD face of a boundary triangle (corner points P, 9 numbers): among the faces nearest to its centre and corners,
   * the one whose triangle normal agrees best with the triangle's, so chamfer facets at an edge go to the right side.
   */
  function classify(Pt, reach) {
    const ux = Pt[3] - Pt[0], uy = Pt[4] - Pt[1], uz = Pt[5] - Pt[2], vx = Pt[6] - Pt[0], vy = Pt[7] - Pt[1], vz = Pt[8] - Pt[2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx], nl = Math.hypot(n[0], n[1], n[2]) || 1;
    const e = Math.max(Math.hypot(ux, uy, uz), Math.hypot(vx, vy, vz));
    const pts = [[(Pt[0] + Pt[3] + Pt[6]) / 3, (Pt[1] + Pt[4] + Pt[7]) / 3, (Pt[2] + Pt[5] + Pt[8]) / 3], [Pt[0], Pt[1], Pt[2]], [Pt[3], Pt[4], Pt[5]], [Pt[6], Pt[7], Pt[8]]];
    const cands = [];
    for (const p of pts) { const h = closest(p[0], p[1], p[2], reach); if (h) cands.push(h); }
    if (!cands.length) return -1;
    const dmin = Math.min(...cands.map((h) => Math.sqrt(h.d2)));
    let best = -1, score = -Infinity;
    for (const h of cands) {
      if (Math.sqrt(h.d2) > dmin + 0.35 * e) continue;
      const tn = triNormal(h.tri), sc = (tn[0] * n[0] + tn[1] * n[1] + tn[2] * n[2]) / nl - Math.sqrt(h.d2) / (e || 1) * 0.2;
      if (sc > score) { score = sc; best = h.faceId; }
    }
    return best;
  }
  /** First crossing of the segment p0→p1 with the surface: the fraction t ∈ [0, 1] along it, or −1 (Möller–Trumbore). */
  function segmentHit(p0, p1) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    const i0 = [0, 1, 2].map((a) => cellOf(Math.min(p0[a], p1[a]), a)), i1 = [0, 1, 2].map((a) => cellOf(Math.max(p0[a], p1[a]), a));
    let best = -1;
    stampId++;
    for (let k = i0[2]; k <= i1[2]; k++) for (let j = i0[1]; j <= i1[1]; j++) for (let i = i0[0]; i <= i1[0]; i++) {
      const b = buckets.get(key(i, j, k));
      if (!b) continue;
      for (const t of b) {
        if (stamp[t] === stampId) continue;
        stamp[t] = stampId;
        const a = 3 * T[3 * t], bb = 3 * T[3 * t + 1], c = 3 * T[3 * t + 2];
        const e1x = V[bb] - V[a], e1y = V[bb + 1] - V[a + 1], e1z = V[bb + 2] - V[a + 2], e2x = V[c] - V[a], e2y = V[c + 1] - V[a + 1], e2z = V[c + 2] - V[a + 2];
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-300) continue;
        const inv = 1 / det, sx = p0[0] - V[a], sy = p0[1] - V[a + 1], sz = p0[2] - V[a + 2];
        const u = (sx * px + sy * py + sz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (tt >= 0 && tt <= 1 && (best < 0 || tt < best)) best = tt;
      }
    }
    return best;
  }
  /** CAD faces with a triangle within tol of p (a node on a CAD edge gets both faces). */
  function facesNear(px, py, pz, tol) {
    const out = new Set(), q = [0, 0, 0];
    const i0 = cellOf(px - tol, 0), i1 = cellOf(px + tol, 0), j0 = cellOf(py - tol, 1), j1 = cellOf(py + tol, 1), k0 = cellOf(pz - tol, 2), k1 = cellOf(pz + tol, 2);
    stampId++;
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const b = buckets.get(key(i, j, k));
      if (!b) continue;
      for (const t of b) {
        if (stamp[t] === stampId) continue;
        stamp[t] = stampId;
        if (out.has(faceOf[t])) continue;
        const a = 3 * T[3 * t], bb = 3 * T[3 * t + 1], c = 3 * T[3 * t + 2];
        closestOnTriangle(px, py, pz, V[a], V[a + 1], V[a + 2], V[bb], V[bb + 1], V[bb + 2], V[c], V[c + 1], V[c + 2], q);
        if ((q[0] - px) ** 2 + (q[1] - py) ** 2 + (q[2] - pz) ** 2 <= tol * tol) out.add(faceOf[t]);
      }
    }
    return out;
  }
  return { V, T, nt, faceOf, lo, hi, size, volume, area, faceArea, closest, inside, rayX, triNormal, classify, segmentHit, facesNear };
}

// ───────────────────────── quality

/** Normalised volume quality 6√2·V / l_rms³ (1 = regular tet, 0 = flat) of corners p0…p3 (12 numbers). */
export function tetQuality(X) {
  const v = tetVolume(X);
  let s = 0;
  for (const [a, b] of TET_EDGES) s += (X[3 * a] - X[3 * b]) ** 2 + (X[3 * a + 1] - X[3 * b + 1]) ** 2 + (X[3 * a + 2] - X[3 * b + 2]) ** 2;
  const lr = Math.sqrt(s / 6);
  return lr > 0 ? (6 * Math.SQRT2 * v) / lr ** 3 : 0;
}

/** Smallest dihedral angle (degrees) of a tet. */
export function minDihedral(X) {
  const P = (i) => [X[3 * i], X[3 * i + 1], X[3 * i + 2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = FACES.map(([a, b, c]) => { const n = cross(sub(P(b), P(a)), sub(P(c), P(a))); const l = Math.hypot(...n) || 1; return n.map((x) => x / l); });
  let best = 180;
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const c = -(nrm[i][0] * nrm[j][0] + nrm[i][1] * nrm[j][1] + nrm[i][2] * nrm[j][2]);
    best = Math.min(best, (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI);
  }
  return best;
}

// ───────────────────────── the mesher

const KEYM = 67108864;                          // edge key = a·KEYM + b (a < b)
const ekey = (a, b) => (a < b ? a * KEYM + b : b * KEYM + a);
const faceKey = (a, b, c) => { let x = a, y = b, z = c, t; if (x > y) { t = x; x = y; y = t; } if (y > z) { t = y; y = z; z = t; } if (x > y) { t = x; x = y; y = t; } return `${x},${y},${z}`; };

/**
 * Mesh improvement of a T4 list (corner nodes, before the mid-edge nodes): the cutting, feature snapping and edge
 * recovery above leave slivers (near-flat tets, dihedral angles near 0°) that make the stiffness matrix badly
 * conditioned (an iterative solve took 10× the iterations) and the stresses in them wrong. Rounds of
 *   – flips: 2-3 (an interior face swapped for the edge between the two opposite nodes) and 3-2 (an interior edge
 *     with three tets around it removed), kept when the worst quality of the tets involved improves;
 *   – smoothing: a node of a poor tet moves toward the centre of its neighbours (a surface node within its own CAD
 *     face and projected back onto it; nodes on CAD edges and corners stay), kept when its worst tet improves;
 *   – boundary slivers: a flat tet with two or more faces on the boundary is dropped (it only fills a crease of the
 *     surface triangulation; its volume is negligible).
 * tets: node ids (4 per tet, positive volume); nodes: Float64Array (3 per node), changed in place; surf: 1 for surface
 * nodes. Returns { tets, flips, moves, removed }.
 */
export function improveMesh(tets, nodes, surf, S, { h = S.size / 16, rounds = 4, target = 0.3 } = {}) {
  const nn = nodes.length / 3;
  let T = Array.from(tets);
  const C = new Float64Array(12);
  const qualityOf = (a, b, c, d) => {
    for (let k = 0; k < 3; k++) { C[k] = nodes[3 * a + k]; C[3 + k] = nodes[3 * b + k]; C[6 + k] = nodes[3 * c + k]; C[9 + k] = nodes[3 * d + k]; }
    const v = tetVolume(C);
    return v > 1e-14 * h * h * h ? tetQuality(C) : -1;
  };
  const tq = (t) => qualityOf(T[4 * t], T[4 * t + 1], T[4 * t + 2], T[4 * t + 3]);
  // Surface nodes: the CAD faces they touch (from the boundary facets); one face → may slide in it, more → fixed.
  const faceSets = new Map();
  const tagFaces = () => {
    faceSets.clear();
    for (const [t, f] of boundaryOf(T).values()) {
      const ids = FACES[f].map((a) => T[4 * t + a]);
      const c = [0, 1, 2].map((ax) => (nodes[3 * ids[0] + ax] + nodes[3 * ids[1] + ax] + nodes[3 * ids[2] + ax]) / 3);
      const hit = S.closest(c[0], c[1], c[2], 1.5 * h);
      for (const id of ids) { let s = faceSets.get(id); if (!s) faceSets.set(id, (s = new Set())); if (hit) s.add(hit.faceId); else s.add(-1); }
    }
  };
  let flips = 0, moves = 0, removed = 0, collapses = 0;
  for (let round = 0; round < rounds; round++) {
    let changed = 0;
    // ── flips (interior faces and edges)
    {
      const ne = T.length / 4, dead = new Uint8Array(ne), add = [];
      const faceMap = new Map(), edgeMap = new Map();
      for (let t = 0; t < ne; t++) {
        for (let f = 0; f < 4; f++) { const [a, b, c] = FACES[f]; const kk = faceKey(T[4 * t + a], T[4 * t + b], T[4 * t + c]); const l = faceMap.get(kk); if (l) l.push(t); else faceMap.set(kk, [t]); }
        for (const [i, j] of TET_EDGES) { const kk = ekey(T[4 * t + i], T[4 * t + j]); const l = edgeMap.get(kk); if (l) l.push(t); else edgeMap.set(kk, [t]); }
      }
      const q = new Float64Array(ne); for (let t = 0; t < ne; t++) q[t] = tq(t);
      const orient = (a, b, c, d) => { for (let k = 0; k < 3; k++) { C[k] = nodes[3 * a + k]; C[3 + k] = nodes[3 * b + k]; C[6 + k] = nodes[3 * c + k]; C[9 + k] = nodes[3 * d + k]; } return tetVolume(C) > 0 ? [a, b, c, d] : [a, c, b, d]; };
      // 3-2: an edge with exactly three tets around it, the ring closed (an interior edge).
      for (const [kk, list] of edgeMap) {
        if (list.length !== 3 || list.some((t) => dead[t])) continue;
        if (Math.min(q[list[0]], q[list[1]], q[list[2]]) >= target) continue;
        const a = Math.floor(kk / KEYM), b = kk % KEYM;
        const ring = list.map((t) => [0, 1, 2, 3].map((i) => T[4 * t + i]).filter((n) => n !== a && n !== b));
        const others = [...new Set(ring.flat())];
        if (others.length !== 3) continue;
        const [c, d, e] = others;
        const t1 = orient(c, d, e, a), t2 = orient(c, d, e, b);
        const q1 = qualityOf(...t1), q2 = qualityOf(...t2);
        const old = Math.min(q[list[0]], q[list[1]], q[list[2]]);
        // Both new tets positive and the edge interior (the three old tets fill the same volume: volumes add up).
        if (!(Math.min(q1, q2) > old + 1e-3)) continue;
        let vOld = 0; for (const t of list) { for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) C[3 * i + k] = nodes[3 * T[4 * t + i] + k]; vOld += tetVolume(C); }
        let vNew = 0; for (const tt of [t1, t2]) { for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) C[3 * i + k] = nodes[3 * tt[i] + k]; vNew += tetVolume(C); }
        if (Math.abs(vNew - vOld) > 1e-9 * Math.max(vOld, h * h * h)) continue;
        for (const t of list) dead[t] = 1;
        add.push(...t1, ...t2); flips++; changed++;
      }
      // 2-3: an interior face shared by two tets.
      for (const [, list] of faceMap) {
        if (list.length !== 2 || dead[list[0]] || dead[list[1]]) continue;
        const [s, t] = list;
        const old = Math.min(q[s], q[t]);
        if (old >= target) continue;
        const A = [0, 1, 2, 3].map((i) => T[4 * s + i]), B = [0, 1, 2, 3].map((i) => T[4 * t + i]);
        const shared = A.filter((n) => B.includes(n));
        if (shared.length !== 3) continue;
        const a = A.find((n) => !shared.includes(n)), b = B.find((n) => !shared.includes(n));
        const [c, d, e] = shared;
        const nt = [orient(a, b, c, d), orient(a, b, d, e), orient(a, b, e, c)];
        const qs = nt.map((x) => qualityOf(...x));
        if (!(Math.min(...qs) > old + 1e-3)) continue;
        // The segment a–b must pass through the shared face (else the three new tets overlap the neighbours).
        let vOld = 0; for (const tt of [A, B]) { for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) C[3 * i + k] = nodes[3 * tt[i] + k]; vOld += Math.abs(tetVolume(C)); }
        let vNew = 0; for (const tt of nt) { for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) C[3 * i + k] = nodes[3 * tt[i] + k]; vNew += tetVolume(C); }
        if (Math.abs(vNew - vOld) > 1e-9 * Math.max(vOld, h * h * h)) continue;
        dead[s] = 1; dead[t] = 1;
        for (const x of nt) add.push(...x);
        flips++; changed++;
      }
      if (add.length) { const keep = []; for (let t = 0; t < ne; t++) if (!dead[t]) keep.push(T[4 * t], T[4 * t + 1], T[4 * t + 2], T[4 * t + 3]); T = keep.concat(add); }
    }
    // ── smoothing of the nodes of poor tets
    {
      tagFaces();
      const ne = T.length / 4, elemsOf = Array.from({ length: nn }, () => []);
      for (let t = 0; t < ne; t++) for (let a = 0; a < 4; a++) elemsOf[T[4 * t + a]].push(t);
      const worstAt = (n) => { let w = Infinity; for (const t of elemsOf[n]) w = Math.min(w, tq(t)); return w; };
      const cand = new Set();
      for (let t = 0; t < ne; t++) if (tq(t) < target) for (let a = 0; a < 4; a++) cand.add(T[4 * t + a]);
      for (const n of cand) {
        let fid = null;
        if (surf[n]) { const fs = faceSets.get(n); if (!fs || fs.size !== 1 || fs.has(-1)) continue; fid = [...fs][0]; }
        const w0 = worstAt(n);
        if (w0 >= target) continue;
        const nb = new Set(); for (const t of elemsOf[n]) for (let a = 0; a < 4; a++) nb.add(T[4 * t + a]); nb.delete(n);
        const m = [0, 0, 0]; for (const q2 of nb) for (let k = 0; k < 3; k++) m[k] += nodes[3 * q2 + k] / nb.size;
        const old = [nodes[3 * n], nodes[3 * n + 1], nodes[3 * n + 2]];
        let best = w0, bestP = null;
        for (const s of [1, 0.6, 0.3, 0.12]) {
          let p = [0, 1, 2].map((k) => old[k] + s * (m[k] - old[k]));
          if (fid != null) { const hit = S.closest(p[0], p[1], p[2], 2 * h, (f) => f === fid); if (!hit) continue; p = hit.point.slice(); }
          for (let k = 0; k < 3; k++) nodes[3 * n + k] = p[k];
          const w = worstAt(n);
          if (w > best + 1e-4) { best = w; bestP = p; }
        }
        const fin = bestP ?? old;
        for (let k = 0; k < 3; k++) nodes[3 * n + k] = fin[k];
        if (bestP) { moves++; changed++; }
      }
    }
    // ── short edges of poor tets collapsed (b into a): what remains is a valid, better mesh. A node may go into one
    // whose constraints include its own (interior → anything; a face node → a node on that face or its edges; an
    // edge / corner node → one on all its faces), the link condition holds (no tet folded flat over the edge).
    {
      tagFaces();
      const ne = T.length / 4, elemsOf = Array.from({ length: nn }, () => []);
      for (let t = 0; t < ne; t++) for (let a = 0; a < 4; a++) elemsOf[T[4 * t + a]].push(t);
      const gone = new Uint8Array(ne), touched = new Uint8Array(nn);
      const facesOf = (n) => (surf[n] ? faceSets.get(n) ?? new Set([-1]) : null);
      const canMerge = (b, a) => {
        const fb = facesOf(b), fa = facesOf(a);
        if (!fb) return true;                                   // interior b: anywhere
        if (!fa || fb.has(-1) || fa.has(-1)) return false;
        for (const f of fb) if (!fa.has(f)) return false;
        return true;
      };
      const nbrs = (n) => { const s = new Set(); for (const t of elemsOf[n]) if (!gone[t]) for (let a = 0; a < 4; a++) s.add(T[4 * t + a]); s.delete(n); return s; };
      for (let t = 0; t < ne; t++) {
        if (gone[t]) continue;
        const q0 = tq(t); if (q0 >= target) continue;
        const ids = [0, 1, 2, 3].map((a) => T[4 * t + a]);
        if (ids.some((n) => touched[n])) continue;
        // Edges of this tet, shortest first.
        const edges = TET_EDGES.map(([i, j]) => [ids[i], ids[j], Math.hypot(nodes[3 * ids[i]] - nodes[3 * ids[j]], nodes[3 * ids[i] + 1] - nodes[3 * ids[j] + 1], nodes[3 * ids[i] + 2] - nodes[3 * ids[j] + 2])]).sort((x, y) => x[2] - y[2]);
        let done = false;
        for (const [p0, p1, len] of edges.slice(0, 3)) {
          for (const [b, a] of [[p0, p1], [p1, p0]]) {
            if (!canMerge(b, a)) continue;
            // A node on a CAD edge or corner goes only into a node on the same edge (same faces), and only when the
            // step between them is far shorter than the edges around it — the near-duplicates the feature snapping
            // leaves (most needle tets), not the ordinary steps along the edge.
            if ((facesOf(b)?.size ?? 0) > 1) {
              const fa = facesOf(a), fb = facesOf(b);
              if (fa.size !== fb.size) continue;
              let sum = 0, cnt = 0;
              for (const x of elemsOf[b]) if (!gone[x]) for (const [i, j] of TET_EDGES) { const u = T[4 * x + i], v = T[4 * x + j]; sum += Math.hypot(nodes[3 * u] - nodes[3 * v], nodes[3 * u + 1] - nodes[3 * v + 1], nodes[3 * u + 2] - nodes[3 * v + 2]); cnt++; }
              if (!(len < 0.35 * (sum / Math.max(1, cnt)))) continue;
            }
            // Link condition: the common neighbours of a and b are exactly the other nodes of the tets on edge a–b.
            const around = elemsOf[b].filter((x) => !gone[x] && [0, 1, 2, 3].some((k) => T[4 * x + k] === a));
            const opp = new Set(); for (const x of around) for (let k = 0; k < 4; k++) { const n = T[4 * x + k]; if (n !== a && n !== b) opp.add(n); }
            const na = nbrs(a), nb = nbrs(b); let common = 0; for (const n of nb) if (na.has(n)) common++;
            if (common !== opp.size) continue;
            // The tets of b that stay, with b → a: all positive, and the worst better than before.
            let worstOld = Infinity, worstNew = Infinity, ok = true;
            for (const x of elemsOf[b]) if (!gone[x]) worstOld = Math.min(worstOld, tq(x));
            for (const x of elemsOf[a]) if (!gone[x]) worstOld = Math.min(worstOld, tq(x));
            for (const x of elemsOf[b]) {
              if (gone[x] || around.includes(x)) continue;
              const v = [0, 1, 2, 3].map((k) => (T[4 * x + k] === b ? a : T[4 * x + k]));
              const qn = qualityOf(v[0], v[1], v[2], v[3]);
              if (!(qn > 0)) { ok = false; break; }
              worstNew = Math.min(worstNew, qn);
            }
            if (!ok) continue;
            for (const x of elemsOf[a]) if (!gone[x] && !around.includes(x)) worstNew = Math.min(worstNew, tq(x));
            if (!(worstNew > worstOld + 1e-3)) continue;
            for (const x of around) gone[x] = 1;
            for (const x of elemsOf[b]) if (!gone[x]) for (let k = 0; k < 4; k++) if (T[4 * x + k] === b) T[4 * x + k] = a;
            for (const n of [a, b, ...nb]) touched[n] = 1;
            collapses++; changed++; done = true; break;
          }
          if (done) break;
        }
      }
      if (collapses) { const keep = []; for (let t = 0; t < ne; t++) if (!gone[t]) keep.push(T[4 * t], T[4 * t + 1], T[4 * t + 2], T[4 * t + 3]); T = keep; }
    }
    // ── flat tets on the boundary
    {
      const ne = T.length / 4, bnd = boundaryOf(T), onB = new Uint8Array(ne);
      for (const [t] of bnd.values()) onB[t]++;
      const keep = [];
      for (let t = 0; t < ne; t++) {
        if (onB[t] >= 2 && tq(t) < 0.02 && [0, 1, 2, 3].every((a) => surf[T[4 * t + a]])) { removed++; changed++; continue; }
        keep.push(T[4 * t], T[4 * t + 1], T[4 * t + 2], T[4 * t + 3]);
      }
      T = keep;
    }
    if (!changed) break;
  }
  return { tets: T, flips, moves, removed, collapses };
}

/** Boundary faces of a T4 list: Map faceKey → [elem, localFace]. */
function boundaryOf(list) {
  const m = new Map(), ne = list.length / 4;
  for (let t = 0; t < ne; t++) for (let f = 0; f < 4; f++) {
    const [a, b, c] = FACES[f], kk = faceKey(list[4 * t + a], list[4 * t + b], list[4 * t + c]);
    if (m.has(kk)) m.delete(kk); else m.set(kk, [t, f]);
  }
  return m;
}

/**
 * Conforming longest-edge bisection of the marked edges of a T4 list (Rivara closure: every element with a marked
 * edge gets its longest edge marked too, so each element is first split along its longest edge). midpoint(a, b)
 * returns the new node id. Returns the new list.
 */
function bisect(tets, marked, len, midpoint, closure = true) {
  const ne = tets.length / 4;
  const longest = (t) => {
    let best = -1, bk = 0;
    for (const [i, j] of TET_EDGES) {
      const a = tets[4 * t + i], b = tets[4 * t + j], l = len(a, b), kk = ekey(a, b);
      if (l > best * (1 + 1e-12) || (l >= best * (1 - 1e-12) && kk < bk)) { best = l; bk = kk; }
    }
    return bk;
  };
  const edgeElems = new Map();
  for (let t = 0; t < ne; t++) for (const [i, j] of TET_EDGES) { const kk = ekey(tets[4 * t + i], tets[4 * t + j]); let l = edgeElems.get(kk); if (!l) edgeElems.set(kk, (l = [])); l.push(t); }
  const stack = closure ? [...marked] : [], lgOf = new Int32Array(0);
  void lgOf;
  const lg = new Map();
  while (stack.length) {
    const kk = stack.pop();
    for (const t of edgeElems.get(kk) ?? []) {
      let k2 = lg.get(t); if (k2 === undefined) lg.set(t, (k2 = longest(t)));
      if (!marked.has(k2)) { marked.add(k2); stack.push(k2); }
    }
  }
  const mids = new Map(), out = [];
  const mid = (a, b) => { const kk = ekey(a, b); let m = mids.get(kk); if (m === undefined) { m = midpoint(a, b); mids.set(kk, m); } return m; };
  const split = (v) => {
    let best = null;
    for (const [i, j] of TET_EDGES) {
      const a = v[i], b = v[j], kk = ekey(a, b);
      if (!marked.has(kk)) continue;
      const l = len(a, b);
      if (!best || l > best.l * (1 + 1e-12) || (l >= best.l * (1 - 1e-12) && kk < best.kk)) best = { l, kk, i, j };
    }
    if (!best) { out.push(v[0], v[1], v[2], v[3]); return; }
    const m = mid(v[best.i], v[best.j]);
    const c1 = v.slice(), c2 = v.slice();
    c1[best.j] = m; c2[best.i] = m;
    split(c1); split(c2);
  };
  for (let t = 0; t < ne; t++) split([tets[4 * t], tets[4 * t + 1], tets[4 * t + 2], tets[4 * t + 3]]);
  return out;
}

/**
 * Tet mesh of a closed surface. options:
 *   size       target element edge (mm); default longest side / resolution
 *   resolution elements along the longest side when size is not given (default 16)
 *   order      1 (T4) or 2 (T10, default)
 *   refine     [{ faceIds: [...], size } | { point: [x,y,z], radius, size }] local refinement, graded by `grading`
 *   grading    size growth per unit distance from a refinement region (default 0.4)
 *   thin       refine where walls are thinner than the lattice (default true)
 *   features   snap surface nodes onto sharp CAD edges / corners (default true)
 *   curved     project boundary mid-edge nodes onto the surface (default true)
 *   maxNodes   bound on the lattice nodes (the size grows to stay under it; default 400 000)
 * Returns { ok, error, order, nodes (Float64Array xyz), nn, ncorner, elements (Int32Array, npe per element), ne, npe,
 *   surfaceNodes, faces: { nodes (npf per face), faceId, elem, local, nf, npf }, size, quality, volume,
 *   surfaceVolume, vertexMap: { elem, L, nv }, surfaceModel }.
 */
export function tetMesh(surface, { size = null, resolution = 16, order = 2, refine = [], grading = 0.4, thin = true, features = true, curved = true, improve = true, maxNodes = 400000, onProgress = null } = {}) {
  if (!surface?.triangles?.length) return { ok: false, error: 'empty' };
  const S = surfaceModel(surface);
  if (!(S.volume > 0)) return { ok: false, error: 'empty' };
  const ext = [0, 1, 2].map((a) => S.hi[a] - S.lo[a]);
  let h = size > 0 ? size : S.size / Math.max(2, resolution);
  const divisions = (hh) => {
    let n = ext.map((e) => Math.max(1, Math.round(e / hh)));
    for (let pass = 0; pass < 3; pass++) {
      const hs = ext.map((e, a) => e / n[a]), hmin = Math.min(...hs.filter((x) => x > 0));
      n = n.map((v, a) => (hs[a] > 3 * hmin ? Math.ceil(ext[a] / (3 * hmin)) : v));
    }
    return n;
  };
  let n = divisions(h);
  while ((n[0] + 3) * (n[1] + 3) * (n[2] + 3) > maxNodes) { h *= 1.15; n = divisions(h); }
  const hs = ext.map((e, a) => e / n[a] || h);
  const N = n.map((v) => v + 3);
  const org = [0, 1, 2].map((a) => S.lo[a] - hs[a]);
  const NV = N[0] * N[1] * N[2];
  const hmax = Math.max(...hs), hmin = Math.min(...hs);
  const lid = (i, j, k) => i + N[0] * (j + N[1] * k);

  // Lattice φ: sign by ray parity per lattice line along x, magnitude from the triangles near each node.
  const phiL = new Float64Array(NV).fill(Infinity), sign = new Int8Array(NV).fill(-1);
  {
    const lines = new Map();
    const jy = 1.37e-7 * S.size, jz = 2.71e-7 * S.size;
    for (let t = 0; t < S.nt; t++) {
      const a = 3 * S.T[3 * t], b = 3 * S.T[3 * t + 1], c = 3 * S.T[3 * t + 2];
      const ymin = Math.min(S.V[a + 1], S.V[b + 1], S.V[c + 1]), ymax = Math.max(S.V[a + 1], S.V[b + 1], S.V[c + 1]);
      const zmin = Math.min(S.V[a + 2], S.V[b + 2], S.V[c + 2]), zmax = Math.max(S.V[a + 2], S.V[b + 2], S.V[c + 2]);
      const j0 = Math.max(0, Math.ceil((ymin - org[1] - jy) / hs[1])), j1 = Math.min(N[1] - 1, Math.floor((ymax - org[1] - jy) / hs[1]));
      const k0 = Math.max(0, Math.ceil((zmin - org[2] - jz) / hs[2])), k1 = Math.min(N[2] - 1, Math.floor((zmax - org[2] - jz) / hs[2]));
      for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) {
        const x = S.rayX(t, org[1] + j * hs[1] + jy, org[2] + k * hs[2] + jz);
        if (x === null) continue;
        const kk = j + N[1] * k; let l = lines.get(kk); if (!l) lines.set(kk, (l = [])); l.push(x);
      }
    }
    for (const [kk, xs] of lines) {
      xs.sort((p, q) => p - q);
      const j = kk % N[1], k = (kk - j) / N[1];
      let c = 0;
      for (let i = 0; i < N[0]; i++) {
        const x = org[0] + i * hs[0];
        while (c < xs.length && xs[c] < x) c++;
        if ((xs.length - c) & 1) sign[lid(i, j, k)] = 1;
      }
    }
    const reach = 1.6 * hmax, q = [0, 0, 0];
    for (let t = 0; t < S.nt; t++) {
      const a = 3 * S.T[3 * t], b = 3 * S.T[3 * t + 1], c = 3 * S.T[3 * t + 2];
      const i0 = [0, 1, 2].map((ax) => Math.max(0, Math.ceil((Math.min(S.V[a + ax], S.V[b + ax], S.V[c + ax]) - reach - org[ax]) / hs[ax])));
      const i1 = [0, 1, 2].map((ax) => Math.min(N[ax] - 1, Math.floor((Math.max(S.V[a + ax], S.V[b + ax], S.V[c + ax]) + reach - org[ax]) / hs[ax])));
      for (let k = i0[2]; k <= i1[2]; k++) for (let j = i0[1]; j <= i1[1]; j++) for (let i = i0[0]; i <= i1[0]; i++) {
        const px = org[0] + i * hs[0], py = org[1] + j * hs[1], pz = org[2] + k * hs[2];
        closestOnTriangle(px, py, pz, S.V[a], S.V[a + 1], S.V[a + 2], S.V[b], S.V[b + 1], S.V[b + 2], S.V[c], S.V[c + 1], S.V[c + 2], q);
        const d = Math.hypot(q[0] - px, q[1] - py, q[2] - pz), id = lid(i, j, k);
        if (d < phiL[id]) phiL[id] = d;
      }
    }
    for (let id = 0; id < NV; id++) {
      if (!Number.isFinite(phiL[id])) phiL[id] = 4 * hmax;
      phiL[id] = phiL[id] <= 1e-9 * hmin ? 0 : sign[id] * phiL[id];
    }
  }
  onProgress?.(0.1);

  // Background tets (Kuhn, 6 per box) of the boxes with a corner inside or on the surface; nodes compacted.
  const P = [], phi = [], remap = new Int32Array(NV).fill(-1);
  const bnode = (id) => {
    let m = remap[id];
    if (m >= 0) return m;
    m = phi.length; remap[id] = m;
    const i = id % N[0], r = (id - i) / N[0], j = r % N[1], k = (r - j) / N[1];
    P.push(org[0] + i * hs[0], org[1] + j * hs[1], org[2] + k * hs[2]); phi.push(phiL[id]);
    return m;
  };
  let tets = [];
  {
    const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]], c = [0, 0, 0];
    for (let k = 0; k < N[2] - 1; k++) for (let j = 0; j < N[1] - 1; j++) for (let i = 0; i < N[0] - 1; i++) {
      let anyIn = false;
      for (let b = 0; b < 8 && !anyIn; b++) if (phiL[lid(i + (b & 1), j + ((b >> 1) & 1), k + ((b >> 2) & 1))] > -1.8 * hmax) anyIn = true;
      if (!anyIn) continue;
      for (const pm of PERMS) {
        c[0] = i; c[1] = j; c[2] = k;
        const v0 = lid(c[0], c[1], c[2]); c[pm[0]]++;
        const v1 = lid(c[0], c[1], c[2]); c[pm[1]]++;
        const v2 = lid(c[0], c[1], c[2]); c[pm[2]]++;
        const v3 = lid(c[0], c[1], c[2]);
        tets.push(bnode(v0), bnode(v1), bnode(v2), bnode(v3));
      }
    }
  }
  // |φ| only matters up to the length of the edges around the point (no sign change farther away).
  const evalPhi = (x, y, z, cap = 2 * hmax) => {
    const c = S.closest(x, y, z, cap);
    const d = c ? Math.sqrt(c.d2) : cap;
    return d <= 1e-9 * hmin ? 0 : S.inside(x, y, z) ? d : -d;
  };
  const len = (a, b) => Math.hypot(P[3 * a] - P[3 * b], P[3 * a + 1] - P[3 * b + 1], P[3 * a + 2] - P[3 * b + 2]);
  const midpoint = (a, b) => {
    const x = 0.5 * (P[3 * a] + P[3 * b]), y = 0.5 * (P[3 * a + 1] + P[3 * b + 1]), z = 0.5 * (P[3 * a + 2] + P[3 * b + 2]);
    P.push(x, y, z); phi.push(evalPhi(x, y, z, 1.05 * len(a, b)));
    return phi.length - 1;
  };
  const centroid = (t, out) => { out[0] = out[1] = out[2] = 0; for (let a = 0; a < 4; a++) { const p = 3 * tets[4 * t + a]; out[0] += P[p] / 4; out[1] += P[p + 1] / 4; out[2] += P[p + 2] / 4; } return out; };
  const longestEdge = (t) => {
    let best = -1, bk = 0;
    for (const [i, j] of TET_EDGES) { const a = tets[4 * t + i], b = tets[4 * t + j], l = len(a, b), kk = ekey(a, b); if (l > best * (1 + 1e-12) || (l >= best * (1 - 1e-12) && kk < bk)) { best = l; bk = kk; } }
    return [best, bk];
  };

  // Local refinement regions: distance functions (a separate triangle hash for the chosen faces).
  const regions = (refine ?? []).filter((r) => r && r.size > 0).map((r) => {
    if (r.point) return { size: r.size, dist: (p) => Math.max(0, Math.hypot(p[0] - r.point[0], p[1] - r.point[1], p[2] - r.point[2]) - (r.radius ?? 0)) };
    const set = new Set(r.faceIds ?? []), tris = [];
    for (let t = 0; t < S.nt; t++) if (set.has(S.faceOf[t])) tris.push(S.T[3 * t], S.T[3 * t + 1], S.T[3 * t + 2]);
    if (!tris.length) return null;
    const R = surfaceModel({ vertices: S.V, triangles: tris, faceGroups: [] });
    return { size: r.size, dist: (p, cap) => { const c = R.closest(p[0], p[1], p[2], cap); return c ? Math.sqrt(c.d2) : Infinity; } };
  }).filter(Boolean);
  const minSize = Math.min(hmin / 8, ...regions.map((r) => r.size * 0.9));
  const ctr = [0, 0, 0];
  for (let round = 0; round < 14; round++) {
    const ne = tets.length / 4, marked = new Set();
    let thinMarks = 0;
    for (let t = 0; t < ne; t++) {
      const [L, kk] = longestEdge(t);
      if (L < 1.25 * minSize) continue;
      centroid(t, ctr);
      let want = false;
      for (const r of regions) {
        if (L <= 1.3 * r.size) continue;
        const cap = (L / 1.3 - r.size) / grading;
        if (r.dist(ctr, cap) <= cap) { want = true; break; }
      }
      if (!want && thin && round < 6) {
        // Unresolved: material inside an element that has no inside node (thin walls), or a gap inside one that has no outside node.
        let pos = 0, neg = 0, zero = 0, minAbs = Infinity;
        for (let a = 0; a < 4; a++) { const f = phi[tets[4 * t + a]]; minAbs = Math.min(minAbs, Math.abs(f)); if (f > 0) pos++; else if (f < 0) neg++; else zero++; }
        if (!pos && minAbs < L && S.inside(ctr[0], ctr[1], ctr[2])) want = true;
        else if (!neg && zero >= 2 && !S.inside(ctr[0], ctr[1], ctr[2])) want = true;
        if (want) thinMarks++;
      }
      if (want) marked.add(kk);
    }
    if (!marked.size) break;
    tets = bisect(tets, marked, len, midpoint);
    onProgress?.(Math.min(0.3, 0.1 + 0.02 * round));
    if (phi.length > 4 * maxNodes) break;
    void thinMarks;
  }
  onProgress?.(0.3);

  // Warping: element ends within α of a cut move onto the cut (closest cut wins).
  const warpTo = new Map();
  {
    const seen = new Set(), ne = tets.length / 4;
    for (let t = 0; t < ne; t++) for (const [ea, eb] of TET_EDGES) {
      const a = tets[4 * t + ea], b = tets[4 * t + eb], fa = phi[a], fb = phi[b];
      if (!(fa * fb < 0)) continue;
      const kk = ekey(a, b);
      if (seen.has(kk)) continue;
      seen.add(kk);
      const s = fa / (fa - fb);
      const end = s < ALPHA ? a : s > 1 - ALPHA ? b : -1;
      if (end < 0) continue;
      const dist = end === a ? s : 1 - s, prev = warpTo.get(end);
      if (prev && prev[0] <= dist) continue;
      warpTo.set(end, [dist, P[3 * a] + s * (P[3 * b] - P[3 * a]), P[3 * a + 1] + s * (P[3 * b + 1] - P[3 * a + 1]), P[3 * a + 2] + s * (P[3 * b + 2] - P[3 * a + 2])]);
    }
    for (const id of warpTo.keys()) phi[id] = 0;
  }
  onProgress?.(0.35);

  // Cutting: mesh nodes are background nodes used and cut points per background edge.
  const nodeOf = new Map(), cutOf = new Map(), X = [], onSurf = [];
  const proj = (x, y, z) => { const c = S.closest(x, y, z, 1.5 * hmax); return c ? c.point : [x, y, z]; };
  const L = (id) => {
    let m = nodeOf.get(id);
    if (m !== undefined) return m;
    m = X.length / 3;
    const w = warpTo.get(id);
    if (w) { const q = proj(w[1], w[2], w[3]); X.push(q[0], q[1], q[2]); onSurf.push(1); }
    else if (phi[id] === 0) { const q = proj(P[3 * id], P[3 * id + 1], P[3 * id + 2]); X.push(q[0], q[1], q[2]); onSurf.push(1); }
    else { X.push(P[3 * id], P[3 * id + 1], P[3 * id + 2]); onSurf.push(0); }
    nodeOf.set(id, m);
    return m;
  };
  const cut = (a, b) => {
    const kk = ekey(a, b);
    let m = cutOf.get(kk);
    if (m !== undefined) return m;
    const s = phi[a] / (phi[a] - phi[b]);
    const q = proj(P[3 * a] + s * (P[3 * b] - P[3 * a]), P[3 * a + 1] + s * (P[3 * b + 1] - P[3 * a + 1]), P[3 * a + 2] + s * (P[3 * b + 2] - P[3 * a + 2]));
    m = X.length / 3;
    X.push(q[0], q[1], q[2]); onSurf.push(1);
    cutOf.set(kk, m);
    return m;
  };
  let out = [];
  const emit = (a, b, c, d) => out.push(a, b, c, d);
  const prism = (A, B) => {
    let a = A.slice(), b = B.slice(), mn = Infinity, at = 0;
    for (let i = 0; i < 3; i++) { if (a[i] < mn) { mn = a[i]; at = i; } if (b[i] < mn) { mn = b[i]; at = 3 + i; } }
    if (at >= 3) { [a, b] = [b, a]; at -= 3; }
    a = [a[at], a[(at + 1) % 3], a[(at + 2) % 3]]; b = [b[at], b[(at + 1) % 3], b[(at + 2) % 3]];
    emit(a[0], b[0], b[1], b[2]);
    const q = Math.min(a[1], a[2], b[1], b[2]);
    if (q === a[1] || q === b[2]) { emit(a[0], a[1], a[2], b[2]); emit(a[0], a[1], b[2], b[1]); }
    else { emit(a[0], a[1], a[2], b[1]); emit(a[0], a[2], b[2], b[1]); }
  };
  const pyramid = (z, q) => {
    const mn = Math.min(...q);
    if (mn === q[0] || mn === q[2]) { emit(z, q[0], q[1], q[2]); emit(z, q[0], q[2], q[3]); }
    else { emit(z, q[1], q[2], q[3]); emit(z, q[1], q[3], q[0]); }
  };
  {
    const ne = tets.length / 4, v = [0, 0, 0, 0];
    for (let t = 0; t < ne; t++) {
      for (let a = 0; a < 4; a++) v[a] = tets[4 * t + a];
      const Pp = [], Z = [], Nn = [];
      for (const id of v) { const f = phi[id]; if (f > 0) Pp.push(id); else if (f < 0) Nn.push(id); else Z.push(id); }
      if (!Pp.length) {
        if (Z.length === 4 && (centroid(t, ctr), S.inside(ctr[0], ctr[1], ctr[2]))) emit(L(v[0]), L(v[1]), L(v[2]), L(v[3]));
        continue;
      }
      if (!Nn.length) {
        if (Z.length >= 2 && (centroid(t, ctr), !S.inside(ctr[0], ctr[1], ctr[2]))) continue;
        emit(L(v[0]), L(v[1]), L(v[2]), L(v[3]));
        continue;
      }
      if (Pp.length === 1) {
        const p = Pp[0];
        if (Z.length === 0) emit(L(p), cut(p, Nn[0]), cut(p, Nn[1]), cut(p, Nn[2]));
        else if (Z.length === 1) emit(L(p), L(Z[0]), cut(p, Nn[0]), cut(p, Nn[1]));
        else emit(L(p), L(Z[0]), L(Z[1]), cut(p, Nn[0]));
      } else if (Pp.length === 2) {
        const [p1, p2] = Pp;
        if (Z.length === 0) prism([L(p1), cut(p1, Nn[0]), cut(p1, Nn[1])], [L(p2), cut(p2, Nn[0]), cut(p2, Nn[1])]);
        else pyramid(L(Z[0]), [L(p1), L(p2), cut(p2, Nn[0]), cut(p1, Nn[0])]);
      } else {
        const [p1, p2, p3] = Pp, nn = Nn[0];
        prism([L(p1), L(p2), L(p3)], [cut(p1, nn), cut(p2, nn), cut(p3, nn)]);
      }
    }
  }
  tets = out; out = null;
  onProgress?.(0.45);
  if (!tets.length) return { ok: false, error: 'too-thin' };

  let nodes = Float64Array.from(X);
  let surf = Uint8Array.from(onSurf);
  const corners = new Float64Array(12);
  const loadCorners = (t) => { for (let a = 0; a < 4; a++) { const p = 3 * tets[4 * t + a]; corners[3 * a] = nodes[p]; corners[3 * a + 1] = nodes[p + 1]; corners[3 * a + 2] = nodes[p + 2]; } return corners; };
  {
    const kept = [], ne = tets.length / 4;
    for (let t = 0; t < ne; t++) {
      loadCorners(t);
      const v = tetVolume(corners), q = tetQuality(corners);
      if (Math.abs(q) < 1e-3) continue;
      if (v > 0) kept.push(tets[4 * t], tets[4 * t + 1], tets[4 * t + 2], tets[4 * t + 3]);
      else kept.push(tets[4 * t], tets[4 * t + 2], tets[4 * t + 1], tets[4 * t + 3]);
    }
    tets = kept;
  }

  // Sharp features: surface nodes on a boundary between CAD faces snap onto the CAD edge / corner.
  if (features) {
    const feat = featureGraph(S);
    if (feat.segments.length) {
      const bnd = boundaryOf(tets), nn0 = nodes.length / 3;
      const faces = Array.from({ length: nn0 }, () => new Set()), elemsOf = Array.from({ length: nn0 }, () => []);
      for (let t = 0; t < tets.length / 4; t++) for (let a = 0; a < 4; a++) elemsOf[tets[4 * t + a]].push(t);
      for (const [t, f] of bnd.values()) {
        const ids = FACES[f].map((a) => tets[4 * t + a]);
        const c = [0, 1, 2].map((ax) => (nodes[3 * ids[0] + ax] + nodes[3 * ids[1] + ax] + nodes[3 * ids[2] + ax]) / 3);
        const hit = S.closest(c[0], c[1], c[2], 1.5 * hmax);
        if (hit) for (const id of ids) faces[id].add(hit.faceId);
      }
      const ok = (node) => elemsOf[node].every((t) => { loadCorners(t); return tetVolume(corners) > 0 && tetQuality(corners) > 0.05; });
      for (let id = 0; id < nn0; id++) {
        if (faces[id].size < 2) continue;
        const fs = [...faces[id]], p = [nodes[3 * id], nodes[3 * id + 1], nodes[3 * id + 2]];
        const reach = 0.6 * Math.min(hmax, ...elemsOf[id].map((t) => { let s = Infinity; for (const [i, j] of TET_EDGES) { const a = tets[4 * t + i], b = tets[4 * t + j]; s = Math.min(s, Math.hypot(nodes[3 * a] - nodes[3 * b], nodes[3 * a + 1] - nodes[3 * b + 1], nodes[3 * a + 2] - nodes[3 * b + 2])); } return 2 * s; }));
        let target = fs.length >= 3 ? feat.nearestCorner(p, fs, reach) : null;
        if (!target) target = feat.nearestOnEdge(p, fs, reach);
        if (!target) continue;
        nodes[3 * id] = target[0]; nodes[3 * id + 1] = target[1]; nodes[3 * id + 2] = target[2];
        if (!ok(id)) { nodes[3 * id] = p[0]; nodes[3 * id + 1] = p[1]; nodes[3 * id + 2] = p[2]; }
      }
    }
  }
  // Edge recovery: a boundary edge whose ends lie on two different CAD faces without a face in common cuts across a
  // sharp CAD edge (a chamfer facet). It is split with the new node placed on the CAD edge itself (between those two
  // faces), and a facet spanning three faces at a corner gets the corner point; repeated until every boundary facet
  // lies in one CAD face, so the boundary contains the CAD edges and vertices exactly.
  if (features) {
    const feat = featureGraph(S);
    if (feat.segments.length) {
      const tol = 1e-6 * S.size + 1e-4 * hmin;
      let X = Array.from(nodes);
      const tagCache = new Map();
      const tag = (n) => { let t = tagCache.get(n); if (!t) { t = S.facesNear(X[3 * n], X[3 * n + 1], X[3 * n + 2], tol); tagCache.set(n, t); } return t; };
      const common = (a, b) => { for (const f of a) if (b.has(f)) return true; return false; };
      for (let round = 0; round < 8; round++) {
        const bnd = boundaryOf(tets), targets = new Map();
        const len = (a, b) => Math.hypot(X[3 * a] - X[3 * b], X[3 * a + 1] - X[3 * b + 1], X[3 * a + 2] - X[3 * b + 2]);
        for (const [t, f] of bnd.values()) {
          const ids = FACES[f].map((a) => tets[4 * t + a]), tg = ids.map(tag);
          if (tg.some((x) => !x.size)) continue;
          // Straddling edges.
          for (let q = 0; q < 3; q++) {
            const a = ids[q], b = ids[(q + 1) % 3], ta = tg[q], tb = tg[(q + 1) % 3];
            if (common(ta, tb)) continue;
            const kk = ekey(a, b);
            if (targets.has(kk)) continue;
            const mid = [0, 1, 2].map((ax) => 0.5 * (X[3 * a + ax] + X[3 * b + ax]));
            let best = null;
            for (const A of ta) for (const B of tb) {
              const p = feat.nearestOnEdge(mid, [A, B], len(a, b));
              if (p) { const d = Math.hypot(p[0] - mid[0], p[1] - mid[1], p[2] - mid[2]); if (!best || d < best.d) best = { p, d, faces: new Set([A, B]) }; }
            }
            if (best) targets.set(kk, best);
          }
          // Corner facets: pairwise sharing but no face common to all three.
          if (common(tg[0], tg[1]) && common(tg[1], tg[2]) && common(tg[2], tg[0])) {
            const all = [...tg[0]].filter((x) => tg[1].has(x) && tg[2].has(x));
            if (!all.length) {
              const faces = [...new Set([...tg[0], ...tg[1], ...tg[2]])];
              const c = [0, 1, 2].map((ax) => (X[3 * ids[0] + ax] + X[3 * ids[1] + ax] + X[3 * ids[2] + ax]) / 3);
              let lq = -1, la = 0, lb = 0;
              for (let q = 0; q < 3; q++) { const l = len(ids[q], ids[(q + 1) % 3]); if (l > lq) { lq = l; la = ids[q]; lb = ids[(q + 1) % 3]; } }
              const p = feat.nearestCorner(c, faces, 2 * lq);
              if (p && !targets.has(ekey(la, lb))) targets.set(ekey(la, lb), { p, d: 0, faces: new Set(faces) });
            }
          }
        }
        if (!targets.size) break;
        const before = tets.slice(), Xbefore = X.slice();
        const created = [];
        tets = bisect(tets, new Set(targets.keys()), len, (a, b) => {
          const tgt = targets.get(ekey(a, b));
          const id = X.length / 3;
          X.push(tgt.p[0], tgt.p[1], tgt.p[2]);
          tagCache.set(id, tgt.faces);
          created.push({ id, mid: [0, 1, 2].map((ax) => 0.5 * (X[3 * a + ax] + X[3 * b + ax])), p: tgt.p });
          return id;
        }, false);
        // Every element must stay positive: a new node that folds one moves back toward the straight midpoint
        // (a partial recovery, finished in the next round); if even the midpoint folds, the round is undone.
        const elemsOf = new Map();
        for (let t = 0; t < tets.length / 4; t++) for (let a = 0; a < 4; a++) { const n = tets[4 * t + a]; let l = elemsOf.get(n); if (!l) elemsOf.set(n, (l = [])); l.push(t); }
        const okAt = (n, qmin = 0.01) => (elemsOf.get(n) ?? []).every((t) => { const C = []; for (let a = 0; a < 4; a++) { const p = 3 * tets[4 * t + a]; C.push(X[p], X[p + 1], X[p + 2]); } return tetVolume(C) > 1e-12 * hmin ** 3 && tetQuality(C) > qmin; });
        let bad = false, partial = 0;
        const level = new Map(created.map((c) => [c.id, 1]));
        const place = (c, sft) => { for (let ax = 0; ax < 3; ax++) X[3 * c.id + ax] = c.mid[ax] + sft * (c.p[ax] - c.mid[ax]); level.set(c.id, sft); tagCache.delete(c.id); };
        // First make room: smooth the interior nodes around a folded new node (they are free to move).
        const isSurf = (n) => n < surf.length ? surf[n] === 1 : true;
        const smoothAround = (c) => {
          const ring = new Set();
          for (const t of elemsOf.get(c.id) ?? []) for (let k = 0; k < 4; k++) { const n = tets[4 * t + k]; if (!isSurf(n)) ring.add(n); }
          for (let pass = 0; pass < 6; pass++) for (const n of ring) {
            const nb = new Set(); for (const t of elemsOf.get(n) ?? []) for (let k = 0; k < 4; k++) nb.add(tets[4 * t + k]);
            nb.delete(n);
            const old = [X[3 * n], X[3 * n + 1], X[3 * n + 2]], m = [0, 0, 0];
            for (const q of nb) for (let ax = 0; ax < 3; ax++) m[ax] += X[3 * q + ax] / nb.size;
            for (let ax = 0; ax < 3; ax++) X[3 * n + ax] = m[ax];
            if (!okAt(n, 0.005)) for (let ax = 0; ax < 3; ax++) X[3 * n + ax] = old[ax];
          }
        };
        for (const c of created) if (!okAt(c.id, 0.01)) smoothAround(c);
        for (const sft of [0.75, 0.5, 0.25, 0]) {
          const worse = created.filter((c) => !okAt(c.id, 0.01));
          if (!worse.length) break;
          // Every new node of a folded element retreats together (they may share elements).
          const ids = new Set();
          for (const c of worse) for (const t of elemsOf.get(c.id) ?? []) for (let k = 0; k < 4; k++) ids.add(tets[4 * t + k]);
          for (const c of created) if (ids.has(c.id) && level.get(c.id) > sft) { place(c, sft); partial++; }
        }
        for (const c of created) if (!okAt(c.id, 0)) bad = true;
        if (bad) { tets = before; X = Xbefore; break; }
      }
      nodes = Float64Array.from(X);
      const extra = new Uint8Array(nodes.length / 3); extra.set(surf);
      for (let i = surf.length; i < extra.length; i++) extra[i] = 1;
      surf = extra;
    }
  }
  onProgress?.(0.55);

  // Slivers out (flips, smoothing, flat boundary tets) before the mid-edge nodes.
  if (improve) {
    const imp = improveMesh(tets, nodes, surf, S, { h: hmin });
    tets = imp.tets;
  }

  // Drop unused nodes, renumber.
  let surfN;
  {
    const used = new Int32Array(nodes.length / 3).fill(-1);
    let m = 0;
    for (const id of tets) if (used[id] < 0) used[id] = m++;
    const nx = new Float64Array(3 * m);
    surfN = new Uint8Array(m);
    for (let id = 0; id < used.length; id++) if (used[id] >= 0) { const q = used[id]; nx[3 * q] = nodes[3 * id]; nx[3 * q + 1] = nodes[3 * id + 1]; nx[3 * q + 2] = nodes[3 * id + 2]; surfN[q] = surf[id]; }
    tets = tets.map((id) => used[id]);
    nodes = nx;
  }
  const ne = tets.length / 4, ncorner = nodes.length / 3;
  onProgress?.(0.65);

  let qmin = Infinity, qsum = 0, dmin = 180, poor = 0, vol4 = 0;
  const hist = new Array(10).fill(0);
  for (let t = 0; t < ne; t++) {
    loadCorners(t);
    const q = tetQuality(corners), d = minDihedral(corners);
    vol4 += tetVolume(corners);
    qmin = Math.min(qmin, q); qsum += q; dmin = Math.min(dmin, d); if (q < 0.1) poor++;
    hist[Math.min(9, Math.floor(q * 10))]++;
  }
  let emin = Infinity, emax = 0;
  for (let t = 0; t < ne; t++) for (const [i, j] of TET_EDGES) { const a = tets[4 * t + i], b = tets[4 * t + j], l = Math.hypot(nodes[3 * a] - nodes[3 * b], nodes[3 * a + 1] - nodes[3 * b + 1], nodes[3 * a + 2] - nodes[3 * b + 2]); emin = Math.min(emin, l); emax = Math.max(emax, l); }

  // Elements of the requested order.
  const npe = order === 2 ? 10 : 4;
  let elements;
  const X2 = Array.from(nodes), isSurf = Array.from(surfN);
  const bnd4 = boundaryOf(tets);
  if (order === 2) {
    elements = new Int32Array(10 * ne);
    const bEdges = new Set();
    for (const [t, f] of bnd4.values()) { const ids = FACES[f].map((a) => tets[4 * t + a]); for (let q = 0; q < 3; q++) bEdges.add(ekey(ids[q], ids[(q + 1) % 3])); }
    const midOf = new Map(), straight = new Map();
    for (let t = 0; t < ne; t++) {
      for (let a = 0; a < 4; a++) elements[10 * t + a] = tets[4 * t + a];
      TET_EDGES.forEach(([i, j], e) => {
        const a = tets[4 * t + i], b = tets[4 * t + j], kk = ekey(a, b);
        let m = midOf.get(kk);
        if (m === undefined) {
          m = X2.length / 3;
          const p = [0, 1, 2].map((ax) => 0.5 * (nodes[3 * a + ax] + nodes[3 * b + ax]));
          let s = 0;
          if (bEdges.has(kk)) {
            s = 1;
            if (curved) {
              const el = Math.hypot(nodes[3 * a] - nodes[3 * b], nodes[3 * a + 1] - nodes[3 * b + 1], nodes[3 * a + 2] - nodes[3 * b + 2]);
              const c = S.closest(p[0], p[1], p[2], 0.3 * el);
              if (c) { straight.set(m, p.slice()); p[0] = c.point[0]; p[1] = c.point[1]; p[2] = c.point[2]; }
            }
          }
          X2.push(p[0], p[1], p[2]); isSurf.push(s);
          midOf.set(kk, m);
        }
        elements[10 * t + 4 + e] = m;
      });
    }
    if (straight.size) {
      const Xe = new Float64Array(30), dN = new Float64Array(30), G = new Float64Array(30);
      const pts = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1], ...GAUSS4.points];
      for (let pass = 0; pass < 3; pass++) {
        let changed = false;
        for (let t = 0; t < ne; t++) {
          let curvedEl = false;
          for (let a = 4; a < 10; a++) if (straight.has(elements[10 * t + a])) curvedEl = true;
          if (!curvedEl) continue;
          for (let a = 0; a < 10; a++) { const p = 3 * elements[10 * t + a]; Xe[3 * a] = X2[p]; Xe[3 * a + 1] = X2[p + 1]; Xe[3 * a + 2] = X2[p + 2]; }
          loadCorners(t);
          const v0 = 6 * tetVolume(corners);
          let bad = false;
          for (const Lp of pts) { shapeDerivatives(2, Lp, dN); if (gradients(10, Xe, dN, G) < 0.25 * v0) { bad = true; break; } }
          if (!bad) continue;
          for (let a = 4; a < 10; a++) {
            const m = elements[10 * t + a], s = straight.get(m);
            if (s) { X2[3 * m] = s[0]; X2[3 * m + 1] = s[1]; X2[3 * m + 2] = s[2]; straight.delete(m); changed = true; }
          }
        }
        if (!changed) break;
      }
    }
  } else elements = Int32Array.from(tets);
  const allNodes = Float64Array.from(X2), nn = allNodes.length / 3;
  onProgress?.(0.8);

  // Boundary faces tagged with CAD face ids.
  const nf = bnd4.size, npf = order === 2 ? 6 : 3;
  const fNodes = new Int32Array(npf * nf), fId = new Int32Array(nf), fElem = new Int32Array(nf), fLocal = new Uint8Array(nf);
  {
    let q = 0;
    for (const [t, f] of bnd4.values()) {
      const loc = order === 2 ? FACE_NODES10[f] : FACES[f];
      for (let a = 0; a < npf; a++) fNodes[npf * q + a] = elements[npe * t + loc[a]];
      const ids = FACES[f].map((a) => elements[npe * t + a]);
      const Pt = []; for (const id of ids) Pt.push(allNodes[3 * id], allNodes[3 * id + 1], allNodes[3 * id + 2]);
      fId[q] = S.classify(Pt, 2 * hmax); fElem[q] = t; fLocal[q] = f;
      q++;
    }
  }
  const vertexMap = locateVertices(surface.vertices, { nodes: allNodes, elements, ne, order, npe, hmax });
  onProgress?.(1);
  return {
    ok: true, error: null, order, nodes: allNodes, nn, ncorner, elements, ne, npe,
    surfaceNodes: Uint8Array.from(isSurf),
    faces: { nodes: fNodes, faceId: fId, elem: fElem, local: fLocal, nf, npf },
    size: hmax, minEdge: emin, maxEdge: emax, lattice: { dims: n, spacing: hs },
    quality: { min: qmin, mean: qsum / ne, minDihedral: dmin, poor, histogram: hist },
    volume: vol4, surfaceVolume: S.volume, surfaceArea: S.area, faceAreas: S.faceArea,
    vertexMap, surfaceModel: S,
  };
}

// ───────────────────────── sharp features

/** Feature segments (surface edges between different CAD faces at a dihedral angle above 20°) and corners. */
function featureGraph(S) {
  const tol = 1e-7 * S.size, inv = 1 / tol;
  const weld = new Map(), wid = new Int32Array(S.V.length / 3);
  const wpos = [];
  for (let v = 0; v < wid.length; v++) {
    const kk = `${Math.round(S.V[3 * v] * inv)},${Math.round(S.V[3 * v + 1] * inv)},${Math.round(S.V[3 * v + 2] * inv)}`;
    let w = weld.get(kk);
    if (w === undefined) { w = wpos.length / 3; weld.set(kk, w); wpos.push(S.V[3 * v], S.V[3 * v + 1], S.V[3 * v + 2]); }
    wid[v] = w;
  }
  const normal = (t) => {
    const a = 3 * S.T[3 * t], b = 3 * S.T[3 * t + 1], c = 3 * S.T[3 * t + 2];
    const ux = S.V[b] - S.V[a], uy = S.V[b + 1] - S.V[a + 1], uz = S.V[b + 2] - S.V[a + 2], vx = S.V[c] - S.V[a], vy = S.V[c + 1] - S.V[a + 1], vz = S.V[c + 2] - S.V[a + 2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx], l = Math.hypot(...n) || 1;
    return n.map((x) => x / l);
  };
  const edges = new Map();
  for (let t = 0; t < S.nt; t++) for (let q = 0; q < 3; q++) {
    const a = wid[S.T[3 * t + q]], b = wid[S.T[3 * t + (q + 1) % 3]];
    if (a === b) continue;
    const kk = a < b ? `${a},${b}` : `${b},${a}`;
    let e = edges.get(kk); if (!e) edges.set(kk, (e = { a: Math.min(a, b), b: Math.max(a, b), tris: [] })); e.tris.push(t);
  }
  const segments = [], vertFaces = new Map();
  for (const e of edges.values()) {
    if (e.tris.length !== 2) continue;
    const [t1, t2] = e.tris, f1 = S.faceOf[t1], f2 = S.faceOf[t2];
    if (f1 === f2) continue;
    const n1 = normal(t1), n2 = normal(t2);
    if (n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2] > Math.cos((20 * Math.PI) / 180)) continue;
    segments.push({ a: e.a, b: e.b, f1, f2 });
    for (const v of [e.a, e.b]) { let s = vertFaces.get(v); if (!s) vertFaces.set(v, (s = new Set())); s.add(f1); s.add(f2); }
  }
  const corners = [...vertFaces].filter(([, s]) => s.size >= 3).map(([v, s]) => ({ v, faces: s }));
  const P = (w) => [wpos[3 * w], wpos[3 * w + 1], wpos[3 * w + 2]];
  return {
    segments,
    nearestCorner(p, fs, maxD) {
      let best = maxD, out = null;
      for (const c of corners) {
        let shared = 0; for (const f of fs) if (c.faces.has(f)) shared++;
        if (shared < 3) continue;
        const q = P(c.v), d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
        if (d < best) { best = d; out = q; }
      }
      return out;
    },
    nearestOnEdge(p, fs, maxD) {
      let best = maxD, out = null;
      const set = new Set(fs);
      for (const s of segments) {
        if (!set.has(s.f1) || !set.has(s.f2)) continue;
        const a = P(s.a), b = P(s.b), ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2)) : 0;
        const q = [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]], d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
        if (d < best) { best = d; out = q; }
      }
      return out;
    },
  };
}

// ───────────────────────── locating points in the mesh

/** A uniform hash of element corner boxes for point location. */
export function elementLocator(mesh) {
  const { nodes, elements, ne } = mesh, npe = mesh.npe ?? (mesh.order === 2 ? 10 : 4);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nodes.length; i += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], nodes[i + a]); hi[a] = Math.max(hi[a], nodes[i + a]); }
  const cell = Math.max(1e-9, (mesh.hmax ?? mesh.size ?? Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 20) * 1.0);
  const dims = [0, 1, 2].map((a) => Math.max(1, Math.ceil((hi[a] - lo[a]) / cell) + 1));
  const buckets = new Map();
  const cellOf = (x, a) => Math.min(dims[a] - 1, Math.max(0, Math.floor((x - lo[a]) / cell)));
  for (let e = 0; e < ne; e++) {
    const c0 = [Infinity, Infinity, Infinity], c1 = [-Infinity, -Infinity, -Infinity];
    for (let a = 0; a < 4; a++) { const p = 3 * elements[npe * e + a]; for (let ax = 0; ax < 3; ax++) { c0[ax] = Math.min(c0[ax], nodes[p + ax]); c1[ax] = Math.max(c1[ax], nodes[p + ax]); } }
    const i0 = c0.map(cellOf), i1 = c1.map(cellOf);
    for (let k = i0[2]; k <= i1[2]; k++) for (let j = i0[1]; j <= i1[1]; j++) for (let i = i0[0]; i <= i1[0]; i++) { const kk = i + dims[0] * (j + dims[1] * k); let b = buckets.get(kk); if (!b) buckets.set(kk, (b = [])); b.push(e); }
  }
  const bary = (e, p, L) => {
    const P = (a) => 3 * elements[npe * e + a];
    const x0 = nodes[P(0)], y0 = nodes[P(0) + 1], z0 = nodes[P(0) + 2];
    const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let a = 1; a < 4; a++) { m[a - 1] = nodes[P(a)] - x0; m[3 + a - 1] = nodes[P(a) + 1] - y0; m[6 + a - 1] = nodes[P(a) + 2] - z0; }
    const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
    if (!(Math.abs(det) > 0)) return -Infinity;
    const r = [p[0] - x0, p[1] - y0, p[2] - z0];
    const l1 = (r[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (r[1] * m[8] - m[5] * r[2]) + m[2] * (r[1] * m[7] - m[4] * r[2])) / det;
    const l2 = (m[0] * (r[1] * m[8] - m[5] * r[2]) - r[0] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * r[2] - r[1] * m[6])) / det;
    const l3 = (m[0] * (m[4] * r[2] - r[1] * m[7]) - m[1] * (m[3] * r[2] - r[1] * m[6]) + r[0] * (m[3] * m[7] - m[4] * m[6])) / det;
    L[0] = 1 - l1 - l2 - l3; L[1] = l1; L[2] = l2; L[3] = l3;
    return Math.min(L[0], L[1], L[2], L[3]);
  };
  /** { elem, L, inside } of the element containing p (or the nearest by barycentric margin within `reach` cells). */
  function locate(p, reach = 2) {
    const L = [0, 0, 0, 0], best = { elem: -1, L: [0.25, 0.25, 0.25, 0.25], score: -Infinity };
    const ci = [0, 1, 2].map((a) => cellOf(p[a], a));
    for (let ring = 0; ring <= reach; ring++) {
      for (let k = ci[2] - ring; k <= ci[2] + ring; k++) for (let j = ci[1] - ring; j <= ci[1] + ring; j++) for (let i = ci[0] - ring; i <= ci[0] + ring; i++) {
        if (i < 0 || j < 0 || k < 0 || i >= dims[0] || j >= dims[1] || k >= dims[2]) continue;
        if (Math.max(Math.abs(i - ci[0]), Math.abs(j - ci[1]), Math.abs(k - ci[2])) !== ring) continue;
        const b = buckets.get(i + dims[0] * (j + dims[1] * k));
        if (!b) continue;
        for (const e of b) { const s = bary(e, p, L); if (s > best.score) { best.score = s; best.elem = e; best.L = L.slice(); } }
      }
      if (best.score >= -1e-9) break;
    }
    if (best.elem >= 0 && best.score < 0) {          // outside: clamp into the element
      const c = best.L.map((x) => Math.max(0, x)), s = c.reduce((a, b) => a + b, 0) || 1;
      best.L = c.map((x) => x / s);
    }
    return { elem: best.elem, L: best.L, inside: best.score >= -1e-6 };
  }
  return { locate };
}

/** Element + barycentric coordinates of every surface vertex (for colour plots). */
export function locateVertices(vertices, mesh) {
  const nv = vertices.length / 3, elem = new Int32Array(nv), L = new Float32Array(4 * nv);
  const loc = elementLocator(mesh);
  for (let v = 0; v < nv; v++) {
    const r = loc.locate([vertices[3 * v], vertices[3 * v + 1], vertices[3 * v + 2]], 3);
    elem[v] = r.elem;
    for (let a = 0; a < 4; a++) L[4 * v + a] = r.L[a];
  }
  return { elem, L, nv };
}

/** Interpolates a nodal field (d per node) at the located vertices with the element's shape functions. */
export function interpolateField(mesh, map, field, d, out = new Float32Array(d * map.nv)) {
  const npe = mesh.npe, N = new Float64Array(npe), Lv = [0, 0, 0, 0];
  for (let v = 0; v < map.nv; v++) {
    const e = map.elem[v];
    if (e < 0) continue;
    for (let a = 0; a < 4; a++) Lv[a] = map.L[4 * v + a];
    shapeValues(mesh.order, Lv, N);
    for (let c = 0; c < d; c++) { let s = 0; for (let a = 0; a < npe; a++) s += N[a] * field[d * mesh.elements[npe * e + a] + c]; out[d * v + c] = s; }
  }
  return out;
}

export { edgeNode };
