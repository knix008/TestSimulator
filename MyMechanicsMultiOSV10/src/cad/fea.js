// Voxel finite elements (linear static, thermal and modal studies), without the kernel:
// linear static stress (analyse), steady-state heat conduction (thermal) and natural frequencies (modal).
//
// Method: the part's triangle mesh is voxelized on a uniform grid of cubes of side h (resolution
// cubes along the longest side). A voxel is solid when its centre is inside the mesh, decided by
// ray parity along +x per voxel column (the ray is jittered off the voxel centre so it never runs
// exactly through mesh edges or vertices). Every solid voxel is an 8-node trilinear hexahedron;
// since all elements are the same cube, one element matrix (2×2×2 Gauss) serves them all: a 24×24
// stiffness (isotropic linear elastic) or an 8×8 conductivity. Systems are solved by Jacobi-
// preconditioned conjugate gradients, matrix-free: no global matrix is stored; K·p is formed node by
// node from 27-point stencils summed from that one element matrix, so memory stays linear in the mesh.
// thermal and modal precondition CG with a geometric multigrid V-cycle (Galerkin coarse grids, see multigrid());
// analyse keeps plain Jacobi.
//
// Boundary conditions come from mesh faces (faceGroups): grid nodes within ~0.75 h of a face's
// triangles belong to that face. Fixture nodes are clamped in x, y and z; a force is shared
// equally by the face's nodes; a pressure acts on each triangle (p × area along the inward
// normal, so triangles must wind counter-clockwise seen from outside), cut into pieces of
// about h/2 whose forces go to the nearest face node (tributary area). Gravity is a body force density·g on every element.
// Stresses are von Mises at element centres, averaged to the nodes; factor of safety = yield / σvm.
// Heat fluxes and convection use the same tributary areas; a fixed temperature is a Dirichlet node.
// Modal analysis uses a lumped (diagonal) mass and subspace iteration (see modal()).
//
// Units
//   static:  mm, N, MPa (= N/mm²); density kg/m³, gravity m/s². Note that materials.js keeps E in GPa.
//   thermal: mm, W, °C (= K for differences); k in W/(m·K) → 1e-3 W/(mm·K) inside; convection h in
//            W/(m²·K) → 1e-6 W/(mm²·K) inside; a heat flux is the total power in W through the face.
//   modal:   mm, N, MPa, s; density kg/m³ → 1e-12 t/mm³ inside (t·mm/s² = N), so ω² is in (rad/s)².
// mesh = { vertices: xyz…, triangles: index triples, faceGroups: [{ start, count, faceId }] }, with
// start/count counted in entries of the triangles array (multiples of 3, as body.mesh() returns them).

const VOIGT = 6;
const GAUSS = [0.5 - 0.5 / Math.sqrt(3), 0.5 + 0.5 / Math.sqrt(3)];

/** Isotropic elasticity matrix D (6×6, engineering shear strains xx yy zz xy yz zx). */
function elasticity(E, nu) {
  const c = E / ((1 + nu) * (1 - 2 * nu));
  const D = new Float64Array(36);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) D[i * 6 + j] = i === j ? c * (1 - nu) : c * nu;
  for (let i = 3; i < 6; i++) D[i * 6 + i] = (c * (1 - 2 * nu)) / 2;
  return D;
}

/** Shape-function gradients of the unit cube at (ξ, η, ζ) ∈ [0,1]³: G[3a + c] = ∂N_a/∂x_c. Local node a = dx + 2dy + 4dz. */
function shapeGradients(xi, eta, zeta, G = new Float64Array(24)) {
  for (let a = 0; a < 8; a++) {
    const dx = a & 1, dy = (a >> 1) & 1, dz = (a >> 2) & 1;
    const fx = dx ? xi : 1 - xi, fy = dy ? eta : 1 - eta, fz = dz ? zeta : 1 - zeta;
    const gx = dx ? 1 : -1, gy = dy ? 1 : -1, gz = dz ? 1 : -1;
    G[3 * a] = gx * fy * fz; G[3 * a + 1] = fx * gy * fz; G[3 * a + 2] = fx * fy * gz;
  }
  return G;
}

/** Strain-displacement matrix B (6×24) of the unit cube at (ξ, η, ζ) ∈ [0,1]³. */
function strainMatrix(xi, eta, zeta, B = new Float64Array(VOIGT * 24)) {
  B.fill(0);
  const G = shapeGradients(xi, eta, zeta);
  for (let a = 0; a < 8; a++) {
    const Nx = G[3 * a], Ny = G[3 * a + 1], Nz = G[3 * a + 2], c = 3 * a;
    B[0 * 24 + c] = Nx; B[1 * 24 + c + 1] = Ny; B[2 * 24 + c + 2] = Nz;
    B[3 * 24 + c] = Ny; B[3 * 24 + c + 1] = Nx;
    B[4 * 24 + c + 1] = Nz; B[4 * 24 + c + 2] = Ny;
    B[5 * 24 + c] = Nz; B[5 * 24 + c + 2] = Nx;
  }
  return B;
}

/** Element stiffness of a cube of side h: h × (∫ Bᵀ D B over the unit cube), 2×2×2 Gauss. */
export function elementStiffness(E, nu, h) {
  const D = elasticity(E, nu), K = new Float64Array(576), B = new Float64Array(VOIGT * 24), DB = new Float64Array(VOIGT * 24);
  for (const xi of GAUSS) for (const eta of GAUSS) for (const zeta of GAUSS) {
    strainMatrix(xi, eta, zeta, B);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 24; j++) { let s = 0; for (let k = 0; k < 6; k++) s += D[i * 6 + k] * B[k * 24 + j]; DB[i * 24 + j] = s; }
    for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) { let s = 0; for (let k = 0; k < 6; k++) s += B[k * 24 + i] * DB[k * 24 + j]; K[i * 24 + j] += (s / 8) * h; }
  }
  return K;
}

/** Element conductivity of a cube of side h (k in W/(mm·K) → W/K): k·h × ∫ ∇Naᵀ∇Nb over the unit cube, 2×2×2 Gauss. */
export function elementConduction(k, h) {
  const K = new Float64Array(64), G = new Float64Array(24);
  for (const xi of GAUSS) for (const eta of GAUSS) for (const zeta of GAUSS) {
    shapeGradients(xi, eta, zeta, G);
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) K[a * 8 + b] += ((G[3 * a] * G[3 * b] + G[3 * a + 1] * G[3 * b + 1] + G[3 * a + 2] * G[3 * b + 2]) / 8) * k * h;
  }
  return K;
}

const vonMises = (s) => Math.sqrt(0.5 * ((s[0] - s[1]) ** 2 + (s[1] - s[2]) ** 2 + (s[2] - s[0]) ** 2) + 3 * (s[3] ** 2 + s[4] ** 2 + s[5] ** 2));

// ───────────────────────── voxelization and grid

/** Uniform grid around the mesh and its solid voxels (Uint8Array nx·ny·nz, index i + nx(j + ny k)). */
function voxelize(V, T, resolution) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < V.length; i += 3) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], V[i + c]); hi[c] = Math.max(hi[c], V[i + c]); }
  const ext = hi.map((v, c) => v - lo[c]), h = Math.max(...ext) / Math.max(1, Math.round(resolution));
  if (!(h > 0)) return null;
  const n = ext.map((e) => Math.max(1, Math.ceil(e / h - 1e-9)));
  const o = lo.map((v, c) => v + (ext[c] - n[c] * h) / 2);           // grid origin, centred on the part
  const [nx, ny, nz] = n;
  const jy = h * 0.0123457, jz = h * 0.0071234;                     // ray jitter (keeps rays off edges)
  const hits = new Map();                                            // column j + ny k → [x…]
  for (let t = 0; t < T.length; t += 3) {
    const a = 3 * T[t], b = 3 * T[t + 1], c = 3 * T[t + 2];
    const ay = V[a + 1], az = V[a + 2], by = V[b + 1], bz = V[b + 2], cy = V[c + 1], cz = V[c + 2];
    const area = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    if (Math.abs(area) < 1e-14) continue;                            // triangle parallel to the rays
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - o[1] - jy) / h - 0.5)), j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - o[1] - jy) / h - 0.5));
    const k0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - o[2] - jz) / h - 0.5)), k1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - o[2] - jz) / h - 0.5));
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) {
      const y = o[1] + (j + 0.5) * h + jy, z = o[2] + (k + 0.5) * h + jz;
      const w0 = ((by - y) * (cz - z) - (bz - z) * (cy - y)) / area, w1 = ((cy - y) * (az - z) - (cz - z) * (ay - y)) / area, w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const key = j + ny * k, x = w0 * V[a] + w1 * V[b] + w2 * V[c];
      const list = hits.get(key); if (list) list.push(x); else hits.set(key, [x]);
    }
  }
  const solid = new Uint8Array(nx * ny * nz);
  for (const [key, xs] of hits) {
    xs.sort((p, q) => p - q);
    for (let m = 0; m + 1 < xs.length; m += 2) {                    // inside between entry and exit (odd tail ignored)
      const i0 = Math.max(0, Math.ceil((xs[m] - o[0]) / h - 0.5)), i1 = Math.min(nx - 1, Math.floor((xs[m + 1] - o[0]) / h - 0.5));
      for (let i = i0; i <= i1; i++) solid[i + nx * key] = 1;
    }
  }
  return { nx, ny, nz, h, o, solid };
}

/**
 * Voxelize the mesh and number its nodes: active nodes (corners of solid voxels) in grid order, their
 * coordinates, the grid index of each node and the element connectivity. null when nothing is solid.
 */
function buildGrid(mesh, resolution) {
  const V = mesh?.vertices, T = mesh?.triangles;
  if (!V?.length || !T?.length) return null;
  const G = voxelize(V, T, resolution);
  if (!G) return null;
  const { nx, ny, nz, h, o, solid } = G, sx = nx + 1, sxy = sx * (ny + 1);
  const nodeId = new Int32Array(sxy * (nz + 1)).fill(-1);
  let ne = 0;
  for (let v = 0; v < solid.length; v++) if (solid[v]) ne++;
  if (!ne) return null;
  const corner = (i, j, k, a) => i + (a & 1) + sx * (j + ((a >> 1) & 1)) + sxy * (k + ((a >> 2) & 1));
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (solid[i + nx * (j + ny * k)]) for (let a = 0; a < 8; a++) nodeId[corner(i, j, k, a)] = 0;
  let nn = 0;
  for (let g = 0; g < nodeId.length; g++) if (nodeId[g] === 0) nodeId[g] = ++nn;   // 1-based for now
  const nodes = new Float64Array(3 * nn), nodeGrid = new Int32Array(nn);
  for (let g = 0; g < nodeId.length; g++) {
    if (nodeId[g] === -1) continue;
    const n = --nodeId[g], i = g % sx, j = Math.floor(g / sx) % (ny + 1), k = Math.floor(g / sxy);
    nodeGrid[n] = g;
    nodes[3 * n] = o[0] + i * h; nodes[3 * n + 1] = o[1] + j * h; nodes[3 * n + 2] = o[2] + k * h;
  }
  const conn = new Int32Array(8 * ne);
  let e = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (solid[i + nx * (j + ny * k)]) { for (let a = 0; a < 8; a++) conn[8 * e + a] = nodeId[corner(i, j, k, a)]; e++; }
  return { ...G, sx, sxy, corner, nodeId, nn, nodes, nodeGrid, ne, conn };
}

// ───────────────────────── face → grid nodes

/** Closest-point distance² from p to triangle abc (Ericson, Real-Time Collision Detection 5.1.5). */
function distTri2(px, py, pz, V, ia, ib, ic) {
  const ax = V[ia], ay = V[ia + 1], az = V[ia + 2];
  const abx = V[ib] - ax, aby = V[ib + 1] - ay, abz = V[ib + 2] - az, acx = V[ic] - ax, acy = V[ic + 1] - ay, acz = V[ic + 2] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  const at = (s, t) => { const x = apx - s * abx - t * acx, y = apy - s * aby - t * acy, z = apz - s * abz - t * acz; return x * x + y * y + z * z; };
  if (d1 <= 0 && d2 <= 0) return at(0, 0);
  const bpx = apx - abx, bpy = apy - aby, bpz = apz - abz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return at(1, 0);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(d1 / (d1 - d3), 0);
  const cpx = apx - acx, cpy = apy - acy, cpz = apz - acz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return at(0, 1);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(0, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return at(1 - w, w); }
  const den = 1 / (va + vb + vc);
  return at(vb * den, vc * den);
}

/** The face's triangles (first index of each) and the solid-grid nodes near them: Map node → nearest triangle. */
function faceNodes(mesh, faceId, grid) {
  const V = mesh.vertices, T = mesh.triangles, tris = [];
  for (const g of mesh.faceGroups ?? []) if (g.faceId === faceId) for (let t = g.start; t < g.start + g.count; t += 3) tris.push(t);
  const { nx, ny, nz, h, o, sx, sxy, nodeId } = grid;
  for (const r of [0.75 * h, 1.5 * h]) {                             // widen once when nothing is that close
    const near = new Map(), r2 = r * r;
    for (const t of tris) {
      const ia = 3 * T[t], ib = 3 * T[t + 1], ic = 3 * T[t + 2], range = [];
      for (let c = 0; c < 3; c++) {
        const lo = Math.min(V[ia + c], V[ib + c], V[ic + c]) - r, hi = Math.max(V[ia + c], V[ib + c], V[ic + c]) + r, top = [nx, ny, nz][c];
        range.push(Math.max(0, Math.ceil((lo - o[c]) / h)), Math.min(top, Math.floor((hi - o[c]) / h)));
      }
      for (let k = range[4]; k <= range[5]; k++) for (let j = range[2]; j <= range[3]; j++) for (let i = range[0]; i <= range[1]; i++) {
        const node = nodeId[i + sx * j + sxy * k];
        if (node < 0) continue;
        const d = distTri2(o[0] + i * h, o[1] + j * h, o[2] + k * h, V, ia, ib, ic);
        if (d <= r2 && !(near.get(node)?.d <= d)) near.set(node, { d, t });
      }
    }
    if (near.size) return { tris, near };
  }
  return { tris, near: new Map() };
}

/**
 * Tributary areas of a face: each triangle is cut into m² small triangles (side ≲ h/2) and each piece's
 * outward area vector (mm², ‖A‖ = piece area) goes to the face node nearest its centre: visit(node, A).
 */
function tributary(mesh, tris, near, grid, visit) {
  const V = mesh.vertices, T = mesh.triangles, { nx, ny, nz, h, o, sx, sxy, nodeId, nodes } = grid;
  const nearest = (x, y, z) => {
    let best = -1, bd = Infinity;
    const ci = Math.round((x - o[0]) / h), cj = Math.round((y - o[1]) / h), ck = Math.round((z - o[2]) / h);
    for (let k = ck - 1; k <= ck + 1; k++) for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      if (i < 0 || j < 0 || k < 0 || i > nx || j > ny || k > nz) continue;
      const n = nodeId[i + sx * j + sxy * k];
      if (n < 0 || !near.has(n)) continue;
      const d = (nodes[3 * n] - x) ** 2 + (nodes[3 * n + 1] - y) ** 2 + (nodes[3 * n + 2] - z) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    if (best < 0) for (const n of near.keys()) { const d = (nodes[3 * n] - x) ** 2 + (nodes[3 * n + 1] - y) ** 2 + (nodes[3 * n + 2] - z) ** 2; if (d < bd) { bd = d; best = n; } }
    return best;
  };
  for (const t of tris) {
    const ia = 3 * T[t], ib = 3 * T[t + 1], ic = 3 * T[t + 2];
    const u = [V[ib] - V[ia], V[ib + 1] - V[ia + 1], V[ib + 2] - V[ia + 2]], w = [V[ic] - V[ia], V[ic + 1] - V[ia + 1], V[ic + 2] - V[ia + 2]];
    const m = Math.min(64, Math.max(1, Math.ceil((2 * Math.max(Math.hypot(...u), Math.hypot(...w), Math.hypot(u[0] - w[0], u[1] - w[1], u[2] - w[2]))) / h)));
    const A = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]].map((x) => (0.5 * x) / (m * m));   // area vector per piece
    for (let i = 0; i < m; i++) for (let j = 0; i + j < m; j++) for (const flip of [0, 1]) {
      if (flip && i + j + 1 >= m) continue;                          // pieces: m(m+1)/2 upright + m(m−1)/2 flipped
      const s = (i + (flip ? 2 : 1) / 3) / m, r = (j + (flip ? 2 : 1) / 3) / m;
      visit(nearest(V[ia] + s * u[0] + r * w[0], V[ia + 1] + s * u[1] + r * w[1], V[ia + 2] + s * u[2] + r * w[2]), A);
    }
  }
}

/** Tributary area (mm²) per face node: Map node → area. */
function nodeAreas(mesh, faceId, grid) {
  const { tris, near } = faceNodes(mesh, faceId, grid), areas = new Map();
  if (near.size) tributary(mesh, tris, near, grid, (n, A) => areas.set(n, (areas.get(n) ?? 0) + Math.hypot(A[0], A[1], A[2])));
  return areas;
}

// ───────────────────────── matrix-free operator and solver

/**
 * Matrix-free global matrix from one element matrix Ke ((8d)×(8d), d dofs per node, local node a = dx + 2dy + 4dz).
 * A node's row is a 27-point stencil of d×d blocks that depends only on which of its 8 surrounding voxels are
 * solid, so each such pattern (≤ 256) is summed from Ke once. apply(p, out, mask) sets out = K·p, with out = 0
 * on the dofs where mask is set (mask may be null). diag holds K's diagonal.
 */
function buildOperator(grid, Ke, d) {
  const { nx, ny, nz, solid, sx, sxy, nodeId, nn, nodeGrid } = grid, w = 8 * d, bs = d * d;
  const stencils = new Array(256).fill(null), pattern = new Uint8Array(nn), nbr = new Int32Array(27 * nn);
  for (let n = 0; n < nn; n++) {
    const g = nodeGrid[n], i = g % sx, j = Math.floor(g / sx) % (ny + 1), k = Math.floor(g / sxy);
    let mask = 0;
    for (let bit = 0; bit < 8; bit++) {
      const ei = i - 1 + (bit & 1), ej = j - 1 + ((bit >> 1) & 1), ek = k - 1 + ((bit >> 2) & 1);
      if (ei >= 0 && ej >= 0 && ek >= 0 && ei < nx && ej < ny && ek < nz && solid[ei + nx * (ej + ny * ek)]) mask |= 1 << bit;
    }
    pattern[n] = mask;
    for (let q = 0; q < 27; q++) {
      const a = i + (q % 3) - 1, b = j + (Math.floor(q / 3) % 3) - 1, c = k + Math.floor(q / 9) - 1;
      nbr[27 * n + q] = a < 0 || b < 0 || c < 0 || a > nx || b > ny || c > nz ? -1 : nodeId[a + sx * b + sxy * c];
    }
    if (stencils[mask]) continue;
    const S = (stencils[mask] = new Float64Array(27 * bs));
    for (let bit = 0; bit < 8; bit++) {
      if (!(mask & (1 << bit))) continue;
      const ex = (bit & 1) - 1, ey = ((bit >> 1) & 1) - 1, ez = ((bit >> 2) & 1) - 1;   // element corner = node + e
      const la = -ex + 2 * -ey + 4 * -ez;                                                   // the node's local index
      for (let lb = 0; lb < 8; lb++) {
        const q = ex + (lb & 1) + 1 + 3 * (ey + ((lb >> 1) & 1) + 1) + 9 * (ez + ((lb >> 2) & 1) + 1);
        for (let r = 0; r < d; r++) for (let c = 0; c < d; c++) S[bs * q + d * r + c] += Ke[(d * la + r) * w + d * lb + c];
      }
    }
  }
  const diag = new Float64Array(d * nn);
  for (let n = 0; n < nn; n++) for (let c = 0; c < d; c++) diag[d * n + c] = stencils[pattern[n]][bs * 13 + (d + 1) * c];
  const apply = d === 3 ? (p, out, fixed) => {
    for (let n = 0; n < nn; n++) {
      const S = stencils[pattern[n]], base = 27 * n;
      let s0 = 0, s1 = 0, s2 = 0;
      for (let q = 0; q < 27; q++) {
        const m = nbr[base + q];
        if (m < 0) continue;
        const b = 9 * q, dd = 3 * m, x = p[dd], y = p[dd + 1], z = p[dd + 2];
        s0 += S[b] * x + S[b + 1] * y + S[b + 2] * z;
        s1 += S[b + 3] * x + S[b + 4] * y + S[b + 5] * z;
        s2 += S[b + 6] * x + S[b + 7] * y + S[b + 8] * z;
      }
      if (fixed) { out[3 * n] = fixed[3 * n] ? 0 : s0; out[3 * n + 1] = fixed[3 * n + 1] ? 0 : s1; out[3 * n + 2] = fixed[3 * n + 2] ? 0 : s2; }
      else { out[3 * n] = s0; out[3 * n + 1] = s1; out[3 * n + 2] = s2; }
    }
  } : d === 1 ? (p, out, fixed) => {
    for (let n = 0; n < nn; n++) {
      const S = stencils[pattern[n]], base = 27 * n;
      let s = 0;
      for (let q = 0; q < 27; q++) { const m = nbr[base + q]; if (m >= 0) s += S[q] * p[m]; }
      out[n] = fixed && fixed[n] ? 0 : s;
    }
  } : null;
  return { apply, diag, nbr, nodeStencil: Array.from(pattern, (m) => stencils[m]) };
}

/**
 * Jacobi-preconditioned conjugate gradients for A x = b on the dofs where mask is not set (x holds the start
 * guess and, on the masked dofs, the prescribed values; it is overwritten with the solution). Converged when
 * ‖r‖ ≤ tol·ref (ref defaults to the initial residual). inv = 1/diag (0 on masked dofs), or a preconditioner
 * function (r, z) that writes z = M⁻¹r (symmetric positive definite, z = 0 on masked dofs), e.g. multigrid().
 * deflate = { W, AW, E }: optional deflation space (Saad, Yeung, Erhel & Guyomarc'h 2000) — vectors W with A·W and
 * the diagonal of WᵀAW (W A-orthogonal, e.g. Ritz vectors); the iterates are kept A-orthogonal to W, which takes
 * the slow low-eigenvalue components out of CG.
 */
function pcg(apply, inv, b, x, { mask = null, maxIter = 4000, tol = 1e-6, ref = 0, onIter = null, deflate = null } = {}) {
  const N = b.length, r = new Float64Array(N), z = new Float64Array(N), p = new Float64Array(N), q = new Float64Array(N);
  const W = deflate?.W ?? [], AW = deflate?.AW ?? [], E = deflate?.E ?? [], nw = W.length;
  const removeW = (v) => {                                           // p −= W E⁻¹ (AW)ᵀ v
    for (let k = 0; k < nw; k++) { const a = AW[k], w = W[k]; let s = 0; for (let d = 0; d < N; d++) s += a[d] * v[d]; s /= E[k]; if (s) for (let d = 0; d < N; d++) p[d] -= s * w[d]; }
  };
  let start = false;
  for (let d = 0; d < N; d++) if (x[d]) { start = true; break; }
  if (start) apply(x, q, mask);
  for (let d = 0; d < N; d++) r[d] = mask && mask[d] ? 0 : b[d] - q[d];
  for (let k = 0; k < nw; k++) {                                     // x += W E⁻¹ Wᵀ r (Galerkin start on W)
    const w = W[k], a = AW[k];
    let s = 0;
    for (let d = 0; d < N; d++) s += w[d] * r[d];
    s /= E[k];
    if (s) for (let d = 0; d < N; d++) { x[d] += s * w[d]; r[d] -= s * a[d]; }
  }
  let r0 = 0;
  for (let d = 0; d < N; d++) r0 += r[d] * r[d];
  if (!(ref > 0)) ref = Math.sqrt(r0);
  if (!(ref > 0) || Math.sqrt(r0) <= tol * ref) return { it: 0, rel: 0, converged: true };
  let rz = 0;
  const precond = typeof inv === 'function' ? inv : null;
  if (precond) { precond(r, z); for (let d = 0; d < N; d++) { p[d] = z[d]; rz += r[d] * z[d]; } }
  else for (let d = 0; d < N; d++) { z[d] = inv[d] * r[d]; p[d] = z[d]; rz += r[d] * z[d]; }
  if (nw) removeW(z);
  let it = 0, rel = 1, converged = false;
  for (; it < maxIter; it++) {
    apply(p, q, mask);
    let pq = 0;
    for (let d = 0; d < N; d++) pq += p[d] * q[d];
    const alpha = rz / pq;
    let rr = 0;
    for (let d = 0; d < N; d++) { x[d] += alpha * p[d]; r[d] -= alpha * q[d]; rr += r[d] * r[d]; }
    rel = Math.sqrt(rr) / ref;
    if (rel <= tol) { converged = true; it++; break; }
    let rzNew = 0;
    if (precond) { precond(r, z); for (let d = 0; d < N; d++) rzNew += r[d] * z[d]; }
    else for (let d = 0; d < N; d++) { z[d] = inv[d] * r[d]; rzNew += r[d] * z[d]; }
    const beta = rzNew / rz; rz = rzNew;
    for (let d = 0; d < N; d++) p[d] = z[d] + beta * p[d];
    if (nw) removeW(z);
    if (onIter && it % 25 === 0) onIter(it, rel);
  }
  return { it, rel, converged };
}

// ───────────────────────── multigrid preconditioner

/**
 * Geometric multigrid V-cycle on the voxel node grid, as a CG preconditioner (r, z) ⇒ z ≈ A⁻¹r.
 * Coarse grids take every other node per direction (a direction with fewer than 2 cells is not coarsened);
 * prolongation is trilinear and coarse operators are Galerkin products Pᵀ A P stored as explicit 27-point stencils,
 * so voxel holes and fixed dofs are respected exactly. Smoother: one forward block Gauss–Seidel sweep before and
 * one backward sweep after the coarse correction (symmetric); the coarsest level is solved by dense Cholesky.
 * extra: optional diagonal added to the fine operator (thermal convection).
 */
function multigrid(grid, op, d, mask, extra = null) {
  const bs = d * d, limit = d === 3 ? 150 : 600;
  const coords = new Int32Array(3 * grid.nn);
  for (let n = 0; n < grid.nn; n++) { const g = grid.nodeGrid[n]; coords[3 * n] = g % grid.sx; coords[3 * n + 1] = Math.floor(g / grid.sx) % (grid.ny + 1); coords[3 * n + 2] = Math.floor(g / grid.sxy); }
  const levels = [{ nn: grid.nn, S: op.nodeStencil, nbr: op.nbr, mask, extra, coords, dims: [grid.nx + 1, grid.ny + 1, grid.nz + 1] }];
  while (levels.at(-1).nn > limit) {
    const C = coarsen(levels.at(-1), d);
    if (!C || C.nn > 0.75 * levels.at(-1).nn) break;
    levels.push(C);
  }
  for (const L of levels) {
    const N = L.nn * d;
    L.res = new Float64Array(N); L.x = new Float64Array(N); L.b = new Float64Array(N);
    L.Dinv = new Float64Array(L.nn * bs);
    const B = new Float64Array(bs);
    for (let n = 0; n < L.nn; n++) {
      const S = L.S[n];
      for (let r = 0; r < d; r++) for (let c = 0; c < d; c++) {
        const off = L.mask?.[n * d + r] || L.mask?.[n * d + c];
        B[r * d + c] = off ? (r === c ? 1 : 0) : S[13 * bs + r * d + c] + (r === c && L.extra ? L.extra[n * d + r] : 0);
      }
      const I = d === 1 ? [1 / B[0]] : inv3(B);
      for (let r = 0; r < d; r++) for (let c = 0; c < d; c++) L.Dinv[n * bs + r * d + c] = L.mask?.[n * d + r] || L.mask?.[n * d + c] ? 0 : I[r * d + c];
    }
  }
  const last = levels.at(-1), denseN = last.nn * d;
  let chol = null;
  if (denseN <= (d === 3 ? 600 : 800)) {
    const A = new Float64Array(denseN * denseN);
    for (let n = 0; n < last.nn; n++) for (let q = 0; q < 27; q++) {
      const m = last.nbr[27 * n + q];
      if (m < 0) continue;
      for (let r = 0; r < d; r++) for (let c = 0; c < d; c++) A[(n * d + r) * denseN + m * d + c] += last.S[n][q * bs + r * d + c];
    }
    for (let i = 0; i < denseN; i++) {
      if (last.extra) A[i * denseN + i] += last.extra[i];
      if (last.mask?.[i]) { for (let j = 0; j < denseN; j++) A[i * denseN + j] = A[j * denseN + i] = 0; A[i * denseN + i] = 1; }
    }
    chol = cholesky(A, denseN);
  }

  const apply = (L, x, out) => {
    for (let n = 0; n < L.nn; n++) {
      const S = L.S[n];
      for (let r = 0; r < d; r++) {
        if (L.mask?.[n * d + r]) { out[n * d + r] = 0; continue; }
        let s = L.extra ? L.extra[n * d + r] * x[n * d + r] : 0;
        for (let q = 0; q < 27; q++) { const m = L.nbr[27 * n + q]; if (m < 0) continue; const o = q * bs + r * d, xm = m * d; for (let c = 0; c < d; c++) s += S[o + c] * x[xm + c]; }
        out[n * d + r] = s;
      }
    }
  };
  const res = new Float64Array(d);
  const sweep3 = (L, b, x, forward) => {                            // d = 3, no extra diagonal (unrolled)
    const { nn, S: SS, nbr, Dinv } = L;
    for (let t = 0; t < nn; t++) {
      const n = forward ? t : nn - 1 - t, S = SS[n], base = 27 * n;
      let s0 = b[3 * n], s1 = b[3 * n + 1], s2 = b[3 * n + 2];
      for (let q = 0; q < 27; q++) {
        const m = nbr[base + q];
        if (m < 0) continue;
        const o = 9 * q, xm = 3 * m, x0 = x[xm], x1 = x[xm + 1], x2 = x[xm + 2];
        s0 -= S[o] * x0 + S[o + 1] * x1 + S[o + 2] * x2;
        s1 -= S[o + 3] * x0 + S[o + 4] * x1 + S[o + 5] * x2;
        s2 -= S[o + 6] * x0 + S[o + 7] * x1 + S[o + 8] * x2;
      }
      const D = 9 * n;
      x[3 * n] += Dinv[D] * s0 + Dinv[D + 1] * s1 + Dinv[D + 2] * s2;
      x[3 * n + 1] += Dinv[D + 3] * s0 + Dinv[D + 4] * s1 + Dinv[D + 5] * s2;
      x[3 * n + 2] += Dinv[D + 6] * s0 + Dinv[D + 7] * s1 + Dinv[D + 8] * s2;
    }
  };
  const sweep = (L, b, x, forward) => {
    if (d === 3 && !L.extra) return sweep3(L, b, x, forward);
    for (let t = 0; t < L.nn; t++) {
      const n = forward ? t : L.nn - 1 - t, S = L.S[n];
      for (let r = 0; r < d; r++) {
        let s = b[n * d + r] - (L.extra ? L.extra[n * d + r] * x[n * d + r] : 0);
        for (let q = 0; q < 27; q++) { const m = L.nbr[27 * n + q]; if (m < 0) continue; const o = q * bs + r * d, xm = m * d; for (let c = 0; c < d; c++) s -= S[o + c] * x[xm + c]; }
        res[r] = s;
      }
      for (let r = 0; r < d; r++) { let s = 0; for (let c = 0; c < d; c++) s += L.Dinv[n * bs + r * d + c] * res[c]; x[n * d + r] += s; }
    }
  };
  const vcycle = (l, b, x) => {
    const L = levels[l];
    x.fill(0);
    if (l === levels.length - 1) {
      if (chol) { cholSolve(chol, denseN, b, x); if (L.mask) for (let i = 0; i < denseN; i++) if (L.mask[i]) x[i] = 0; }
      else for (let s = 0; s < 4; s++) { sweep(L, b, x, true); sweep(L, b, x, false); }
      return;
    }
    sweep(L, b, x, true);
    apply(L, x, L.res);
    for (let i = 0; i < L.nn * d; i++) L.res[i] = b[i] - L.res[i];
    const C = levels[l + 1];
    C.b.fill(0);
    for (let n = 0; n < L.nn; n++) for (let k = 0; k < 8; k++) {
      const I = L.par[8 * n + k];
      if (I < 0) continue;
      const w = L.pw[8 * n + k];
      for (let c = 0; c < d; c++) if (!L.mask?.[n * d + c]) C.b[I * d + c] += w * L.res[n * d + c];
    }
    if (C.mask) for (let i = 0; i < C.nn * d; i++) if (C.mask[i]) C.b[i] = 0;
    vcycle(l + 1, C.b, C.x);
    for (let n = 0; n < L.nn; n++) for (let k = 0; k < 8; k++) {
      const I = L.par[8 * n + k];
      if (I < 0) continue;
      const w = L.pw[8 * n + k];
      for (let c = 0; c < d; c++) if (!L.mask?.[n * d + c]) x[n * d + c] += w * C.x[I * d + c];
    }
    sweep(L, b, x, false);
  };
  const precond = (r, z) => vcycle(0, r, z);
  precond.levels = levels.map((L) => L.nn);
  return precond;
}

/** Next coarser level of a multigrid hierarchy (sets L.par / L.pw, the trilinear parents of each node of L). */
function coarsen(L, d) {
  const bs = d * d, dims = L.dims, coarse = dims.map((G) => G - 1 >= 2), cd = dims.map((G, c) => (coarse[c] ? Math.ceil((G - 1) / 2) + 1 : G));
  const par1 = (i, c) => (!coarse[c] ? [[i, 1]] : i % 2 === 0 ? [[i / 2, 1]] : [[(i - 1) / 2, 0.5], [(i + 1) / 2, 0.5]]);
  const cid = new Int32Array(cd[0] * cd[1] * cd[2]).fill(-1), pg = new Int32Array(8 * L.nn).fill(-1), par = new Int32Array(8 * L.nn).fill(-1), pw = new Float64Array(8 * L.nn);
  for (let n = 0; n < L.nn; n++) {
    let free = !L.mask;
    if (!free) for (let c = 0; c < d; c++) if (!L.mask[n * d + c]) free = true;
    if (!free) continue;
    let k = 0;
    for (const [I, wx] of par1(L.coords[3 * n], 0)) for (const [J, wy] of par1(L.coords[3 * n + 1], 1)) for (const [K, wz] of par1(L.coords[3 * n + 2], 2)) {
      const g = I + cd[0] * (J + cd[1] * K);
      pg[8 * n + k] = g; pw[8 * n + k] = wx * wy * wz; cid[g] = 0; k++;
    }
  }
  let nc = 0;
  for (let g = 0; g < cid.length; g++) if (cid[g] === 0) cid[g] = nc++;
  if (!nc) return null;
  for (let i = 0; i < pg.length; i++) if (pg[i] >= 0) par[i] = cid[pg[i]];
  const coords = new Int32Array(3 * nc), nbr = new Int32Array(27 * nc).fill(-1);
  for (let g = 0; g < cid.length; g++) {
    const n = cid[g];
    if (n < 0) continue;
    coords[3 * n] = g % cd[0]; coords[3 * n + 1] = Math.floor(g / cd[0]) % cd[1]; coords[3 * n + 2] = Math.floor(g / (cd[0] * cd[1]));
  }
  for (let n = 0; n < nc; n++) for (let q = 0; q < 27; q++) {
    const a = coords[3 * n] + (q % 3) - 1, b = coords[3 * n + 1] + (Math.floor(q / 3) % 3) - 1, c = coords[3 * n + 2] + Math.floor(q / 9) - 1;
    if (a >= 0 && b >= 0 && c >= 0 && a < cd[0] && b < cd[1] && c < cd[2]) nbr[27 * n + q] = cid[a + cd[0] * (b + cd[1] * c)];
  }
  // Galerkin Pᵀ A P, block by block (free fine dofs only).
  const Sc = new Float64Array(27 * bs * nc), has = new Uint8Array(nc * d);
  for (let a = 0; a < L.nn; a++) {
    const Sa = L.S[a];
    for (let ka = 0; ka < 8; ka++) {
      const I = par[8 * a + ka];
      if (I < 0) continue;
      const wa = pw[8 * a + ka];
      for (let r = 0; r < d; r++) if (!L.mask?.[a * d + r]) has[I * d + r] = 1;
      for (let q = 0; q < 27; q++) {
        const b = L.nbr[27 * a + q];
        if (b < 0) continue;
        for (let kb = 0; kb < 8; kb++) {
          const J = par[8 * b + kb];
          if (J < 0) continue;
          const w = wa * pw[8 * b + kb];
          const slot = coords[3 * J] - coords[3 * I] + 1 + 3 * (coords[3 * J + 1] - coords[3 * I + 1] + 1) + 9 * (coords[3 * J + 2] - coords[3 * I + 2] + 1);
          const o = (27 * I + slot) * bs;
          for (let r = 0; r < d; r++) {
            if (L.mask?.[a * d + r]) continue;
            for (let c = 0; c < d; c++) {
              if (L.mask?.[b * d + c]) continue;
              let v = Sa[q * bs + r * d + c];
              if (q === 13 && r === c && L.extra) v += L.extra[a * d + r];
              Sc[o + r * d + c] += w * v;
            }
          }
        }
      }
    }
  }
  L.par = par; L.pw = pw;
  const mask = new Uint8Array(nc * d);
  let anyMask = false;
  for (let i = 0; i < nc * d; i++) if (!has[i]) { mask[i] = 1; anyMask = true; }
  const S = Array.from({ length: nc }, (_, n) => Sc.subarray(27 * bs * n, 27 * bs * (n + 1)));
  return { nn: nc, S, nbr, mask: anyMask ? mask : null, extra: null, coords, dims: cd };
}

function inv3(B) {
  const [a, b, c, d, e, f, g, h, i] = B, A = e * i - f * h, Bq = -(d * i - f * g), C = d * h - e * g, det = a * A + b * Bq + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, Bq / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

/** In-place dense Cholesky (lower triangle) of an n×n SPD matrix; returns it. */
function cholesky(A, n) {
  for (let j = 0; j < n; j++) {
    let s = A[j * n + j];
    for (let k = 0; k < j; k++) s -= A[j * n + k] * A[j * n + k];
    const djj = (A[j * n + j] = Math.sqrt(Math.max(s, 1e-300)));
    for (let i = j + 1; i < n; i++) {
      let t = A[i * n + j];
      for (let k = 0; k < j; k++) t -= A[i * n + k] * A[j * n + k];
      A[i * n + j] = t / djj;
    }
  }
  return A;
}

/** Solve L Lᵀ x = b with the factor from cholesky(). */
function cholSolve(L, n, b, x) {
  for (let i = 0; i < n; i++) { let t = b[i]; for (let k = 0; k < i; k++) t -= L[i * n + k] * x[k]; x[i] = t / L[i * n + i]; }
  for (let i = n - 1; i >= 0; i--) { let t = x[i]; for (let k = i + 1; k < n; k++) t -= L[k * n + i] * x[k]; x[i] = t / L[i * n + i]; }
}

// ───────────────────────── grid → mesh vertices

/**
 * Per input vertex: up to 8 (node, weight) pairs — trilinear over the cell's solid corners, normalized — and
 * the nearest solid node (best, −1 when none within 3 cells). Vertices outside the voxel solid take the nearest node.
 */
function vertexMap(V, grid) {
  const { nx, ny, nz, h, o, sx, sxy, nodeId, nodes, corner } = grid;
  const nv = V.length / 3, idx = new Int32Array(8 * nv).fill(-1), wt = new Float64Array(8 * nv), best = new Int32Array(nv).fill(-1);
  for (let v = 0; v < nv; v++) {
    const cell = [0, 0, 0], t = [0, 0, 0];
    for (let c = 0; c < 3; c++) { const x = (V[3 * v + c] - o[c]) / h, top = [nx, ny, nz][c]; cell[c] = Math.min(top - 1, Math.max(0, Math.floor(x))); t[c] = Math.min(1, Math.max(0, x - cell[c])); }
    let wSum = 0, b = -1, bestW = -1;
    for (let a = 0; a < 8; a++) {
      const n = nodeId[corner(cell[0], cell[1], cell[2], a)];
      if (n < 0) continue;
      const w = (a & 1 ? t[0] : 1 - t[0]) * ((a >> 1) & 1 ? t[1] : 1 - t[1]) * ((a >> 2) & 1 ? t[2] : 1 - t[2]);
      idx[8 * v + a] = n; wt[8 * v + a] = w;
      wSum += w;
      if (w > bestW) { bestW = w; b = n; }
    }
    if (b < 0) {                                                      // vertex outside the voxel solid: search outwards
      let bd = Infinity;
      for (let rad = 1; rad <= 3 && b < 0; rad++) {
        for (let k = cell[2] - rad; k <= cell[2] + 1 + rad; k++) for (let j = cell[1] - rad; j <= cell[1] + 1 + rad; j++) for (let i = cell[0] - rad; i <= cell[0] + 1 + rad; i++) {
          if (i < 0 || j < 0 || k < 0 || i > nx || j > ny || k > nz) continue;
          const n = nodeId[i + sx * j + sxy * k];
          if (n < 0) continue;
          const d = (nodes[3 * n] - V[3 * v]) ** 2 + (nodes[3 * n + 1] - V[3 * v + 1]) ** 2 + (nodes[3 * n + 2] - V[3 * v + 2]) ** 2;
          if (d < bd) { bd = d; b = n; }
        }
      }
      if (b < 0) continue;
      wSum = 0;
    }
    best[v] = b;
    if (wSum < 1e-12) { for (let a = 0; a < 8; a++) { idx[8 * v + a] = -1; wt[8 * v + a] = 0; } idx[8 * v] = b; wt[8 * v] = 1; }
    else for (let a = 0; a < 8; a++) wt[8 * v + a] /= wSum;
  }
  return { nv, idx, wt, best };
}

/** Interpolate a nodal field with d components per node to the mesh vertices. */
function interpolate(map, field, d) {
  const { nv, idx, wt } = map, out = new Float32Array(d * nv), acc = new Float64Array(d);
  for (let v = 0; v < nv; v++) {
    acc.fill(0);
    for (let a = 0; a < 8; a++) { const n = idx[8 * v + a]; if (n < 0) continue; const w = wt[8 * v + a]; for (let c = 0; c < d; c++) acc[c] += w * field[d * n + c]; }
    for (let c = 0; c < d; c++) out[d * v + c] = acc[c];
  }
  return out;
}

// ───────────────────────── static analysis

function failed(error) {
  return { ok: false, error, nodes: new Float64Array(0), displacement: new Float64Array(0), nodeStress: new Float64Array(0), elements: 0, maxDisplacement: 0, maxDisplacementAt: [0, 0, 0], maxStress: 0, maxStressAt: [0, 0, 0], minFactorOfSafety: Infinity, iterations: 0, vertexDisplacement: new Float32Array(0), vertexStress: new Float32Array(0) };
}

/** Clamp every node of the fixture faces in x, y and z: dof mask and the number of clamped nodes. */
function clamp(mesh, fixtures, grid) {
  const fixed = new Uint8Array(3 * grid.nn);
  let nFixed = 0;
  for (const id of fixtures) for (const n of faceNodes(mesh, id, grid).near.keys()) { if (!fixed[3 * n]) nFixed++; fixed[3 * n] = fixed[3 * n + 1] = fixed[3 * n + 2] = 1; }
  return { fixed, nFixed };
}

/**
 * Linear static analysis of a solid part. See the header for the method and units.
 * Returns displacements and von Mises stresses on the grid nodes and interpolated to the mesh vertices.
 */
export function analyse(mesh, { material, fixtures = [], loads = [], gravity = null, resolution = 24, maxIter = 4000, tol = 1e-6, onProgress = null } = {}) {
  if (!fixtures.length) return failed('no-fixtures');
  if (!loads.length && !gravity) return failed('no-loads');
  const grid = buildGrid(mesh, resolution);
  if (!grid) return failed('empty');
  const V = mesh.vertices, { h, nn, nodes, ne, conn } = grid;
  onProgress?.(0.05);

  // Boundary conditions.
  const ndof = 3 * nn, f = new Float64Array(ndof), { fixed, nFixed } = clamp(mesh, fixtures, grid);
  if (!nFixed) return failed('no-fixtures');
  for (const load of loads) {
    const { tris, near } = faceNodes(mesh, load.faceId, grid);
    if (!near.size) continue;
    if (load.force) {
      for (const n of near.keys()) for (let c = 0; c < 3; c++) f[3 * n + c] += load.force[c] / near.size;
    } else if (load.pressure) {
      tributary(mesh, tris, near, grid, (n, A) => { for (let c = 0; c < 3; c++) f[3 * n + c] -= load.pressure * A[c]; });   // −p·A·n̂
    }
  }
  if (gravity) {
    const share = (material.density * 1e-9 * h ** 3) / 8;            // kg/m³·m/s² = N/m³ = 1e-9 N/mm³
    for (let q = 0; q < 8 * ne; q++) for (let c = 0; c < 3; c++) f[3 * conn[q] + c] += share * gravity[c];
  }
  for (let d = 0; d < ndof; d++) if (fixed[d]) f[d] = 0;
  let fNorm = 0;
  for (let d = 0; d < ndof; d++) fNorm += f[d] * f[d];
  fNorm = Math.sqrt(fNorm);
  if (!(fNorm > 0)) return failed('no-loads');

  const op = buildOperator(grid, elementStiffness(material.E, material.nu, h), 3);
  const inv = new Float64Array(ndof);
  for (let d = 0; d < ndof; d++) inv[d] = fixed[d] ? 0 : 1 / op.diag[d];
  const u = new Float64Array(ndof), goal = Math.log(1 / tol);
  const { it, rel, converged } = pcg(op.apply, inv, f, u, {
    mask: fixed, maxIter, tol, ref: fNorm,
    onIter: onProgress && ((i, r) => onProgress(0.05 + 0.9 * Math.min(1, Math.max(i / maxIter, Math.log(1 / Math.max(r, tol)) / goal)))),
  });

  // Von Mises at element centres, averaged to the nodes.
  const Bc = strainMatrix(0.5, 0.5, 0.5).map((x) => x / h), D = elasticity(material.E, material.nu), ue = new Float64Array(24);
  const nodeStress = new Float64Array(nn), count = new Uint8Array(nn), eps = new Float64Array(6), sig = new Float64Array(6);
  for (let el = 0, b = 0; el < ne; el++, b += 8) {
    for (let a = 0; a < 8; a++) { const d = 3 * conn[b + a]; ue[3 * a] = u[d]; ue[3 * a + 1] = u[d + 1]; ue[3 * a + 2] = u[d + 2]; }
    for (let i = 0; i < 6; i++) { let s = 0; for (let m = 0; m < 24; m++) s += Bc[i * 24 + m] * ue[m]; eps[i] = s; }
    for (let i = 0; i < 6; i++) { let s = 0; for (let m = 0; m < 6; m++) s += D[i * 6 + m] * eps[m]; sig[i] = s; }
    const vm = vonMises(sig);
    for (let a = 0; a < 8; a++) { nodeStress[conn[b + a]] += vm; count[conn[b + a]]++; }
  }
  let maxDisp = 0, maxDispNode = 0, maxStress = 0, maxStressNode = 0;
  for (let n = 0; n < nn; n++) {
    nodeStress[n] /= count[n];
    if (nodeStress[n] > maxStress) { maxStress = nodeStress[n]; maxStressNode = n; }
    const m = Math.hypot(u[3 * n], u[3 * n + 1], u[3 * n + 2]);
    if (m > maxDisp) { maxDisp = m; maxDispNode = n; }
  }

  // Mesh vertices: trilinear displacement over the cell's solid corners, stress of the nearest solid node.
  const map = vertexMap(V, grid), vertexDisplacement = interpolate(map, u, 3), vertexStress = new Float32Array(map.nv);
  for (let v = 0; v < map.nv; v++) if (map.best[v] >= 0) vertexStress[v] = nodeStress[map.best[v]];
  onProgress?.(1);

  const at = (n) => [nodes[3 * n], nodes[3 * n + 1], nodes[3 * n + 2]];
  return {
    ok: converged, error: converged ? null : 'not-converged',
    nodes, displacement: u, nodeStress, elements: ne,
    maxDisplacement: maxDisp, maxDisplacementAt: at(maxDispNode),
    maxStress, maxStressAt: at(maxStressNode),
    minFactorOfSafety: maxStress > 0 ? material.yield / maxStress : Infinity,
    iterations: it, residual: rel, elementSize: h,
    vertexDisplacement, vertexStress,
  };
}

// ───────────────────────── steady-state heat conduction

/**
 * Typical thermal properties at room temperature per material id of materials.js:
 * k = thermal conductivity W/(m·K), cp = specific heat J/(kg·K). GENERIC is used for unknown ids.
 */
export const THERMAL = {
  'steel-1020': { k: 51.9, cp: 486 },
  'steel-4340': { k: 44.5, cp: 475 },
  'stainless-304': { k: 16.2, cp: 500 },
  'cast-iron': { k: 46, cp: 490 },
  'al-6061': { k: 167, cp: 896 },
  'al-7075': { k: 130, cp: 960 },
  brass: { k: 109, cp: 380 },
  copper: { k: 391, cp: 385 },
  titanium: { k: 6.7, cp: 526 },
  abs: { k: 0.17, cp: 1400 },
  pc: { k: 0.2, cp: 1200 },
  nylon: { k: 0.25, cp: 1670 },
  pom: { k: 0.31, cp: 1470 },
  rubber: { k: 0.16, cp: 2010 },
  oak: { k: 0.17, cp: 2380 },
  glass: { k: 1.05, cp: 840 },
};
export const THERMAL_GENERIC = { k: 50, cp: 500 };

/** Thermal properties of a material id string or object ({ k } or { id }), falling back to THERMAL_GENERIC. */
export function thermalProperties(material) {
  if (typeof material === 'string') return THERMAL[material] ?? THERMAL_GENERIC;
  if (material && Number.isFinite(material.k) && material.k > 0) return { cp: THERMAL[material.id]?.cp ?? THERMAL_GENERIC.cp, ...material };
  return THERMAL[material?.id] ?? THERMAL_GENERIC;
}

function failedThermal(error) {
  return { ok: false, error, nodes: new Float64Array(0), nodeTemperature: new Float64Array(0), vertexTemperature: new Float32Array(0), min: 0, max: 0, minAt: [0, 0, 0], maxAt: [0, 0, 0], heatFlowOut: 0, heatFlowIn: 0, faceHeatFlow: [], fluxIn: 0, convectionOut: 0, elements: 0, elementSize: 0, iterations: 0 };
}

/**
 * Steady-state heat conduction −∇·(k∇T) = 0 on the voxelized part. Units: mm, W, °C (see the header).
 *   temperatures: [{ faceId, value °C }]       fixed temperature (Dirichlet) on the face's nodes
 *   fluxes:       [{ faceId, power W }]         total power into the body, spread over the face by tributary area
 *   convections:  [{ faceId, h W/(m²K), ambient °C }]   Robin: heat leaving = h·A·(T − ambient), lumped per node
 * Heat balance: heatFlowIn + fluxIn = heatFlowOut + convectionOut (up to solver tolerance), where
 * faceHeatFlow[i].value is the net heat leaving the body through temperatures[i]'s face (W, negative = entering).
 */
export function thermal(mesh, { material = null, temperatures = [], fluxes = [], convections = [], resolution = 24, maxIter = 4000, tol = 1e-8, precond = true, onProgress = null } = {}) {
  if (!temperatures.length && !convections.length) return failedThermal('no-temperature');
  const grid = buildGrid(mesh, resolution);
  if (!grid) return failedThermal('empty');
  const V = mesh.vertices, { h, nn, nodes, ne } = grid;
  const k = thermalProperties(material).k * 1e-3;                   // W/(m·K) → W/(mm·K)
  onProgress?.(0.05);

  const fixed = new Uint8Array(nn), owner = new Int32Array(nn).fill(-1), T = new Float64Array(nn), b = new Float64Array(nn), robin = new Float64Array(nn);
  let nFixed = 0, nRobin = 0, guess = 0, guesses = 0, fluxIn = 0;
  temperatures.forEach((bc, i) => {
    const near = faceNodes(mesh, bc.faceId, grid).near;
    for (const n of near.keys()) { if (!fixed[n]) nFixed++; fixed[n] = 1; T[n] = bc.value; owner[n] = i; }
    if (near.size) { guess += bc.value; guesses++; }
  });
  for (const bc of convections) {
    const areas = nodeAreas(mesh, bc.faceId, grid), hc = bc.h * 1e-6;                 // W/(m²K) → W/(mm²K)
    if (!areas.size || !(hc > 0)) continue;
    for (const [n, a] of areas) { robin[n] += hc * a; b[n] += hc * a * bc.ambient; }
    nRobin += areas.size; guess += bc.ambient; guesses++;
  }
  if (!nFixed && !nRobin) return failedThermal('no-temperature');
  for (const bc of fluxes) {
    const areas = nodeAreas(mesh, bc.faceId, grid);
    let total = 0;
    for (const a of areas.values()) total += a;
    if (!(total > 0) || !bc.power) continue;
    for (const [n, a] of areas) b[n] += (bc.power * a) / total;
    fluxIn += bc.power;
  }
  for (let n = 0; n < nn; n++) if (!fixed[n]) T[n] = guess / guesses;

  const op = buildOperator(grid, elementConduction(k, h), 1);
  const apply = (p, out, mask) => { op.apply(p, out, mask); for (let n = 0; n < nn; n++) if (!(mask && mask[n])) out[n] += robin[n] * p[n]; };
  const inv = new Float64Array(nn);
  for (let n = 0; n < nn; n++) inv[n] = fixed[n] ? 0 : 1 / (op.diag[n] + robin[n]);
  const goal = Math.log(1 / tol);
  const { it, converged } = pcg(apply, precond === false ? inv : multigrid(grid, op, 1, fixed, robin), b, T, {
    mask: fixed, maxIter, tol,
    onIter: onProgress && ((i, r) => onProgress(0.05 + 0.9 * Math.min(1, Math.max(i / maxIter, Math.log(1 / Math.max(r, tol)) / goal)))),
  });

  // Reactions: what each fixed node must inject to hold its temperature = (K T + robin T − b) there.
  const KT = new Float64Array(nn);
  apply(T, KT, null);
  const faceHeatFlow = temperatures.map((bc) => ({ faceId: bc.faceId, value: 0 }));
  for (let n = 0; n < nn; n++) if (fixed[n]) faceHeatFlow[owner[n]].value -= KT[n] - b[n];
  let heatFlowOut = 0, heatFlowIn = 0, convectionOut = 0;
  for (const f of faceHeatFlow) if (f.value > 0) heatFlowOut += f.value; else heatFlowIn -= f.value;
  for (const bc of convections) for (const [n, a] of nodeAreas(mesh, bc.faceId, grid)) convectionOut += bc.h * 1e-6 * a * (T[n] - bc.ambient);

  let min = Infinity, max = -Infinity, minN = 0, maxN = 0;
  for (let n = 0; n < nn; n++) { if (T[n] < min) { min = T[n]; minN = n; } if (T[n] > max) { max = T[n]; maxN = n; } }
  const vertexTemperature = interpolate(vertexMap(V, grid), T, 1);
  onProgress?.(1);
  const at = (n) => [nodes[3 * n], nodes[3 * n + 1], nodes[3 * n + 2]];
  return {
    ok: converged, error: converged ? null : 'not-converged',
    nodes, nodeTemperature: T, vertexTemperature,
    min, max, minAt: at(minN), maxAt: at(maxN),
    heatFlowOut, heatFlowIn, faceHeatFlow, fluxIn, convectionOut,
    elements: ne, elementSize: h, iterations: it, conductivity: k * 1e3,
  };
}

// ───────────────────────── natural frequencies

/** Cyclic Jacobi eigen-decomposition of a symmetric n×n matrix (row-major, copied): eigenvalues and column eigenvectors. */
function jacobiEigen(A0, n) {
  const A = Float64Array.from(A0), Z = new Float64Array(n * n);
  for (let i = 0; i < n; i++) Z[i * n + i] = 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0, diag = 0;
    for (let i = 0; i < n; i++) { diag += A[i * n + i] ** 2; for (let j = i + 1; j < n; j++) off += A[i * n + j] ** 2; }
    if (off <= 1e-30 * diag) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const apq = A[p * n + q];
      if (Math.abs(apq) < 1e-300) continue;
      const theta = (A[q * n + q] - A[p * n + p]) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {                                   // A ← Jᵀ A J
        const akp = A[k * n + p], akq = A[k * n + q];
        A[k * n + p] = c * akp - s * akq; A[k * n + q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = A[p * n + k], aqk = A[q * n + k];
        A[p * n + k] = c * apk - s * aqk; A[q * n + k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const zkp = Z[k * n + p], zkq = Z[k * n + q];
        Z[k * n + p] = c * zkp - s * zkq; Z[k * n + q] = s * zkp + c * zkq;
      }
    }
  }
  return { values: Array.from({ length: n }, (_, i) => A[i * n + i]), vectors: Z };
}

/** Kr q = λ Mr q (n×n, symmetric, Mr positive definite): ascending eigenvalues and Mr-orthonormal columns Q. null when Mr is singular. */
function generalizedEigen(Kr, Mr, n) {
  const L = new Float64Array(n * n);
  let scale = 0;
  for (let i = 0; i < n; i++) scale = Math.max(scale, Mr[i * n + i]);
  for (let j = 0; j < n; j++) {
    let s = Mr[j * n + j];
    for (let k = 0; k < j; k++) s -= L[j * n + k] ** 2;
    if (!(s > 1e-13 * scale)) return { failedAt: j };
    L[j * n + j] = Math.sqrt(s);
    for (let i = j + 1; i < n; i++) { let t = Mr[i * n + j]; for (let k = 0; k < j; k++) t -= L[i * n + k] * L[j * n + k]; L[i * n + j] = t / L[j * n + j]; }
  }
  const solveL = (B) => {                                             // L⁻¹ B, column by column (B row-major n×n)
    const X = new Float64Array(n * n);
    for (let c = 0; c < n; c++) for (let i = 0; i < n; i++) { let t = B[i * n + c]; for (let k = 0; k < i; k++) t -= L[i * n + k] * X[k * n + c]; X[i * n + c] = t / L[i * n + i]; }
    return X;
  };
  const W = solveL(Kr), Wt = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) Wt[i * n + j] = W[j * n + i];
  const A = solveL(Wt);                                               // L⁻¹ Kr L⁻ᵀ
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) A[i * n + j] = A[j * n + i] = (A[i * n + j] + A[j * n + i]) / 2;
  const { values, vectors } = jacobiEigen(A, n);
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const Q = new Float64Array(n * n);                                  // L⁻ᵀ Z, back substitution
  order.forEach((src, c) => {
    for (let i = n - 1; i >= 0; i--) { let t = vectors[i * n + src]; for (let k = i + 1; k < n; k++) t -= L[k * n + i] * Q[k * n + c]; Q[i * n + c] = t / L[i * n + i]; }
  });
  return { values: order.map((i) => values[i]), Q };
}

function failedModal(error) {
  return { ok: false, error, frequencies: [], modes: [], nodes: new Float64Array(0), nodeModes: [], elements: 0, elementSize: 0, iterations: 0, solverIterations: 0 };
}

/**
 * Natural frequencies and mode shapes of the fixed part: K φ = ω² M φ with the voxel stiffness and a lumped mass
 * (each element's ρh³ shared equally by its 8 nodes), fixture dofs removed. Units: mm, N, MPa, tonne/mm³
 * (density kg/m³ × 1e-12), s → ω in rad/s, frequencies f = ω/2π in Hz.
 * Lowest `modes` eigenpairs by subspace iteration (Bathe): q = min(2·modes, modes + 8) vectors (option subspace); each step solves
 * K Y = M X per column with PCG (multigrid-preconditioned, or Jacobi with precond: false; deflated by the current Ritz
 * vectors, so it starts at X/λ; loose tolerance while the frequencies still move, solverTol at the end), then
 * Rayleigh–Ritz on the q×q projected problem (Cholesky + Jacobi, with Kr = YᵀKY from true products), X ← Y Q
 * (M-orthonormal); stops when the wanted frequencies change by < tol relative. iterations = subspace steps,
 * solverIterations = total CG iterations. On 'not-converged' the latest estimates are still returned.
 * modes[i] is the per-input-vertex displacement xyz of mode i, scaled to max |u| = 1 (sign: largest component > 0).
 */
export function modal(mesh, { material, fixtures = [], modes = 4, resolution = 20, maxIter = 60, tol = 1e-4, solverTol = 1e-5, subspace = null, precond: usePrecond = true, onProgress = null } = {}) {
  if (!fixtures.length) return failedModal('no-fixtures');
  const grid = buildGrid(mesh, resolution);
  if (!grid) return failedModal('empty');
  const V = mesh.vertices, { h, nn, nodes, ne, conn } = grid, ndof = 3 * nn;
  const { fixed, nFixed } = clamp(mesh, fixtures, grid);
  if (!nFixed) return failedModal('no-fixtures');
  let nFree = 0;
  for (let d = 0; d < ndof; d++) if (!fixed[d]) nFree++;
  if (!nFree) return failedModal('no-fixtures');
  const p = Math.max(1, Math.min(Math.round(modes), nFree)), q = Math.min(nFree, Math.max(p + 1, Math.round(subspace ?? Math.min(2 * p, p + 8))));
  onProgress?.(0.03);

  const op = buildOperator(grid, elementStiffness(material.E, material.nu, h), 3);
  const md = new Float64Array(ndof), inv = new Float64Array(ndof), share = (material.density * 1e-12 * h ** 3) / 8;   // t per node per element
  for (let e = 0; e < 8 * ne; e++) for (let c = 0; c < 3; c++) md[3 * conn[e] + c] += share;
  for (let d = 0; d < ndof; d++) { if (fixed[d]) md[d] = 0; inv[d] = fixed[d] ? 0 : 1 / op.diag[d]; }
  const precond = usePrecond === false ? inv : multigrid(grid, op, 3, fixed);

  // Start vectors: the three translations, then pseudo-random (deterministic) fields.
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
  const randomize = (x) => { for (let d = 0; d < ndof; d++) x[d] = fixed[d] ? 0 : rand(); };
  const X = Array.from({ length: q }, (_, j) => {
    const x = new Float64Array(ndof);
    if (j < 3) { for (let n = 0; n < nn; n++) x[3 * n + j] = fixed[3 * n + j] ? 0 : 1; } else randomize(x);
    return x;
  });
  const Y = Array.from({ length: q }, () => new Float64Array(ndof)), R = Array.from({ length: q }, () => new Float64Array(ndof));
  const KX = Array.from({ length: q }, () => new Float64Array(ndof));
  let lambda = null, prevFreq = null, iter = 0, solverIterations = 0, converged = false, solvedAll = true, restarts = 0;
  const dot = (a, b) => { let s = 0; for (let d = 0; d < ndof; d++) s += a[d] * b[d]; return s; };

  let change = 1;
  for (; iter < maxIter; iter++) {
    // Inexact inverse iteration: loose solves while the frequencies still move, solverTol near the end.
    const innerTol = Math.max(solverTol, Math.min(1e-2, 0.1 * change));
    for (let j = 0; j < q; j++) {
      const x = X[j], r = R[j], y = Y[j];
      let rn = 0;
      for (let d = 0; d < ndof; d++) { r[d] = md[d] * x[d]; rn += r[d] * r[d]; }
      // Deflated by the current Ritz vectors (XᵀKX = Λ, XᵀMX = I): starts at X_j/λ_j and keeps CG off the low modes.
      y.fill(0);
      const deflate = lambda && lambda.every((l) => l > 0) ? { W: X, AW: KX, E: lambda } : null;
      const s = pcg(op.apply, precond, r, y, { mask: fixed, tol: innerTol, ref: Math.sqrt(rn), maxIter: 4000, deflate });
      solverIterations += s.it;
      if (!s.converged) solvedAll = false;
    }
    // Projected matrices with the true K (R is reused for K·Y), so loosely solved Y only cost convergence speed.
    const Kr = new Float64Array(q * q), Mr = new Float64Array(q * q), MY = new Float64Array(ndof);
    for (let j = 0; j < q; j++) op.apply(Y[j], R[j], fixed);
    for (let j = 0; j < q; j++) {
      for (let d = 0; d < ndof; d++) MY[d] = md[d] * Y[j][d];
      for (let i = 0; i <= j; i++) { Kr[i * q + j] = Kr[j * q + i] = (dot(Y[i], R[j]) + dot(Y[j], R[i])) / 2; Mr[i * q + j] = Mr[j * q + i] = dot(Y[i], MY); }
    }
    const eig = generalizedEigen(Kr, Mr, q);
    if (!eig.values) {                                                // dependent vectors: replace one and repeat
      if (++restarts > 3 * q) break;
      randomize(X[eig.failedAt]); lambda = null; iter--;
      continue;
    }
    for (let j = 0; j < q; j++) {                                     // X ← Y Q, K X ← (K Y) Q
      const x = X[j], kx = KX[j];
      x.fill(0); kx.fill(0);
      for (let i = 0; i < q; i++) { const c = eig.Q[i * q + j]; if (c) { const yi = Y[i], ki = R[i]; for (let d = 0; d < ndof; d++) { x[d] += c * yi[d]; kx[d] += c * ki[d]; } } }
    }
    lambda = eig.values;
    const freq = lambda.slice(0, p).map((l) => Math.sqrt(Math.max(0, l)) / (2 * Math.PI));
    onProgress?.(0.05 + 0.9 * Math.min(1, (iter + 1) / Math.min(maxIter, 15)));
    change = prevFreq ? Math.max(...freq.map((f, i) => Math.abs(f - prevFreq[i]) / Math.max(f, 1e-30))) : 1;
    if (prevFreq && change <= tol && innerTol <= Math.max(solverTol, 0.1 * tol)) { converged = solvedAll; iter++; prevFreq = freq; break; }
    prevFreq = freq;
    solvedAll = true;
  }

  const map = vertexMap(V, grid), out = [], nodeModes = [];
  for (let i = 0; i < p && lambda; i++) {
    const vert = interpolate(map, X[i], 3);
    let big = 0, sign = 1, nodeBig = 0;
    for (let v = 0; v < map.nv; v++) { const m = Math.hypot(vert[3 * v], vert[3 * v + 1], vert[3 * v + 2]); if (m > big) big = m; }
    for (let d = 0; d < ndof; d++) if (Math.abs(X[i][d]) > Math.abs(nodeBig)) nodeBig = X[i][d];
    if (!(big > 0)) for (let n = 0; n < nn; n++) big = Math.max(big, Math.hypot(X[i][3 * n], X[i][3 * n + 1], X[i][3 * n + 2]));
    if (nodeBig < 0) sign = -1;
    const s = big > 0 ? sign / big : 0;
    for (let k = 0; k < vert.length; k++) vert[k] *= s;
    out.push(vert);
    nodeModes.push(X[i].map((x) => x * s));
  }
  onProgress?.(1);
  return {
    ok: converged, error: converged ? null : 'not-converged',
    frequencies: prevFreq ?? [], modes: out, nodes, nodeModes,
    elements: ne, elementSize: h, iterations: iter, solverIterations,
  };
}

/** Rainbow colour of a result value like a stress legend: blue (min) → cyan → green → yellow → red (max). */
export function stressColor(value, min, max) {
  const t = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  const hue = (1 - t) * 4;                                           // 4 = blue … 0 = red, in 60° sextants
  const x = 1 - Math.abs((hue % 2) - 1);
  if (hue >= 3) return [0, x, 1];
  if (hue >= 2) return [0, 1, x];
  if (hue >= 1) return [x, 1, 0];
  return [1, x, 0];
}

/** Colour of a temperature on the same rainbow legend: blue (coldest) → red (hottest). */
export function temperatureColor(value, min, max) {
  return stressColor(value, min, max);
}

/** The solver's building blocks, for the studies built on top of the static one (fea-more.js: buckling, fatigue). */
export const FEA_INTERNALS = { buildGrid, buildOperator, pcg, clamp, multigrid, vertexMap, interpolate, generalizedEigen, elasticity, strainMatrix, shapeGradients, GAUSS, faceNodes, tributary, vonMises };
