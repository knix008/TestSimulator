// FEM of solids (FreeCAD FEM with CalculiX, linear static): a solid filled
// with equal brick elements (voxels) of the incompatible-mode kind (C3D8I in
// CalculiX), clamped and loaded on the faces of its bounding box, solved for
// displacements and von Mises stresses. Every element is the same cube, so
// one element stiffness serves them all and the solver needs no global
// matrix. The same model is written as a CalculiX input deck (.inp), whose
// results (.dat) can be read back. No DOM.
import { MATERIALS } from './fem.js';
import { POISSON } from './plate.js';

export const FEM3D_FACES = ['xmin', 'xmax', 'ymin', 'ymax', 'zmin', 'zmax'];
// Densities (kg/m³) of the materials.
const DENSITY = { steel: 7850, aluminium: 2700, timber: 500, concrete: 2400 };

const finite = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Options repaired: material (E, ν, density), elements along the longest side, clamped faces, loads, gravity. */
export function normalizeFem3d(raw = {}) {
  const material = [...Object.keys(MATERIALS), 'custom'].includes(raw.material) ? raw.material : 'steel';
  const fixed = Array.isArray(raw.fixed) ? raw.fixed.filter((f) => FEM3D_FACES.includes(f)) : ['zmin'];
  const loads = (Array.isArray(raw.loads) ? raw.loads : []).filter((l) => FEM3D_FACES.includes(l?.face)).map((l) => ({ face: l.face, fx: finite(l.fx, 0), fy: finite(l.fy, 0), fz: finite(l.fz, 0) })).filter((l) => l.fx || l.fy || l.fz);
  return {
    material,
    E: Math.max(1, finite(raw.E, MATERIALS[material]?.E ?? 210000)),
    nu: Math.min(0.49, Math.max(0, finite(raw.nu, POISSON[material] ?? 0.3))),
    density: Math.max(0, finite(raw.density, DENSITY[material] ?? 7850)),
    resolution: Math.round(Math.min(80, Math.max(4, finite(raw.resolution, 24)))),
    fixed: [...new Set(fixed)],
    loads,
    gravity: Boolean(raw.gravity),
  };
}

// ───────────────────────── the voxel model

/**
 * The solid as voxels: bricks (hx × hy × hz, as near cubes as the box allows) whose centres are inside the mesh (an
 * upward ray through the cell centre crosses the surface an odd number of
 * times below it). Returns { x0, y0, z0, hx, hy, hz, h (the largest), nx, ny, nz, cells: Uint8Array }.
 */
export function voxelize(tris, resolution) {
  let minX = Infinity; let minY = Infinity; let minZ = Infinity; let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (const t of tris) for (const p of t) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
  }
  const h0 = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / resolution;
  const nx = Math.max(1, Math.round((maxX - minX) / h0)); const ny = Math.max(1, Math.round((maxY - minY) / h0)); const nz = Math.max(1, Math.round((maxZ - minZ) / h0));
  // The bricks fill the box exactly: a size of their own along each axis.
  const hx = (maxX - minX) / nx || h0; const hy = (maxY - minY) / ny || h0; const hz = (maxZ - minZ) / nz || h0;
  const h = Math.max(hx, hy, hz);
  const cells = new Uint8Array(nx * ny * nz);
  const hits = Array.from({ length: nx * ny }, () => []);
  for (const [a, b, c] of tris) {
    const det = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(det) < 1e-14) continue;
    const i0 = Math.max(0, Math.ceil((Math.min(a[0], b[0], c[0]) - minX) / hx - 0.5)); const i1 = Math.min(nx - 1, Math.floor((Math.max(a[0], b[0], c[0]) - minX) / hx - 0.5));
    const j0 = Math.max(0, Math.ceil((Math.min(a[1], b[1], c[1]) - minY) / hy - 0.5)); const j1 = Math.min(ny - 1, Math.floor((Math.max(a[1], b[1], c[1]) - minY) / hy - 0.5));
    for (let j = j0; j <= j1; j++) {
      const y = minY + (j + 0.5) * hy + 1e-9 * hy;
      for (let i = i0; i <= i1; i++) {
        const x = minX + (i + 0.5) * hx + 1.3e-9 * hx;
        const u = ((b[0] - x) * (c[1] - y) - (c[0] - x) * (b[1] - y)) / det;
        const v = ((c[0] - x) * (a[1] - y) - (a[0] - x) * (c[1] - y)) / det;
        if (u < 0 || v < 0 || u + v > 1) continue;
        hits[j * nx + i].push(u * a[2] + v * b[2] + (1 - u - v) * c[2]);
      }
    }
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const zs = hits[j * nx + i].sort((p, q) => p - q);
    for (let k = 0; k < nz; k++) {
      const z = minZ + (k + 0.5) * hz;
      let crossings = 0;
      for (const zz of zs) if (zz < z) crossings++;
      if (crossings % 2) cells[(k * ny + j) * nx + i] = 1;
    }
  }
  return { x0: minX, y0: minY, z0: minZ, hx, hy, hz, h, nx, ny, nz, cells };
}

// ───────────────────────── the element

/** Isotropic elasticity matrix (6 × 6, engineering shear strains). */
export function elasticity(E, nu) {
  const k = E / ((1 + nu) * (1 - 2 * nu));
  const a = k * (1 - nu); const b = k * nu; const g = E / (2 * (1 + nu));
  return [[a, b, b, 0, 0, 0], [b, a, b, 0, 0, 0], [b, b, a, 0, 0, 0], [0, 0, 0, g, 0, 0], [0, 0, 0, 0, g, 0], [0, 0, 0, 0, 0, g]];
}

// Corner order (CalculiX C3D8: bottom face counter-clockwise, then the top).
export const CORNERS = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];

/** Strain–displacement rows at (ξ, η, ζ) of a brick [hx, hy, hz]: the 24 corner dofs and the 9 incompatible ones. */
export function strainRows(xi, eta, zeta, [hx, hy, hz]) {
  const sx = 2 / hx; const sy = 2 / hy; const sz = 2 / hz; // d(ξ)/dx …
  const dN = CORNERS.map(([a, b, c]) => [a * (1 + b * eta) * (1 + c * zeta) / 8 * sx, b * (1 + a * xi) * (1 + c * zeta) / 8 * sy, c * (1 + a * xi) * (1 + b * eta) / 8 * sz]);
  // Incompatible modes: 1 − ξ², 1 − η², 1 − ζ² for each displacement (Wilson / Taylor): their derivatives.
  const dP = [[-2 * xi * sx, 0, 0], [0, -2 * eta * sy, 0], [0, 0, -2 * zeta * sz]];
  const rows = (d, count) => {
    const B = Array.from({ length: 6 }, () => new Array(count * 3).fill(0));
    d.forEach(([dx, dy, dz], n) => {
      const c = n * 3;
      B[0][c] = dx; B[1][c + 1] = dy; B[2][c + 2] = dz;
      B[3][c] = dy; B[3][c + 1] = dx;
      B[4][c + 1] = dz; B[4][c + 2] = dy;
      B[5][c] = dz; B[5][c + 2] = dx;
    });
    return B;
  };
  return { Bc: rows(dN, 8), Bi: rows(dP, 3) };
}

/** Solves A x = b (small dense, Gaussian elimination). */
function solveDense(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c || !M[r][c]) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * The stiffness (24 × 24) of a brick (side h, or [hx, hy, hz]) with incompatible modes,
 * condensed: K = Kcc − Kci Kii⁻¹ Kic (2 × 2 × 2 Gauss points). Exact in pure bending.
 */
export function hexStiffness(size, E, nu) {
  const h = Array.isArray(size) ? size : [size, size, size];
  const D = elasticity(E, nu);
  const g = 1 / Math.sqrt(3);
  const w = (h[0] * h[1] * h[2]) / 8;
  const Kcc = Array.from({ length: 24 }, () => new Array(24).fill(0));
  const Kci = Array.from({ length: 24 }, () => new Array(9).fill(0));
  const Kii = Array.from({ length: 9 }, () => new Array(9).fill(0));
  for (const xi of [-g, g]) for (const eta of [-g, g]) for (const zeta of [-g, g]) {
    const { Bc, Bi } = strainRows(xi, eta, zeta, h);
    const DBc = D.map((row) => Bc[0].map((_, col) => row.reduce((s, v, k) => s + v * Bc[k][col], 0)));
    const DBi = D.map((row) => Bi[0].map((_, col) => row.reduce((s, v, k) => s + v * Bi[k][col], 0)));
    for (let a = 0; a < 24; a++) {
      for (let b = 0; b < 24; b++) { let s = 0; for (let k = 0; k < 6; k++) s += Bc[k][a] * DBc[k][b]; Kcc[a][b] += s * w; }
      for (let b = 0; b < 9; b++) { let s = 0; for (let k = 0; k < 6; k++) s += Bc[k][a] * DBi[k][b]; Kci[a][b] += s * w; }
    }
    for (let a = 0; a < 9; a++) for (let b = 0; b < 9; b++) { let s = 0; for (let k = 0; k < 6; k++) s += Bi[k][a] * DBi[k][b]; Kii[a][b] += s * w; }
  }
  // Kii⁻¹ Kic, column by column.
  const X = Array.from({ length: 9 }, () => new Array(24).fill(0));
  for (let c = 0; c < 24; c++) {
    // Column c of Kic (= row c of Kci).
    const col = solveDense(Kii, Kci[c].slice());
    col.forEach((v, i) => { X[i][c] = v; });
  }
  return Kcc.map((row, a) => row.map((v, b) => { let s = 0; for (let i = 0; i < 9; i++) s += Kci[a][i] * X[i][b]; return v - s; }));
}

// ───────────────────────── solving

/**
 * Linear static analysis of a solid's mesh. Returns { ok, error?, grid,
 * nodes: [[x,y,z]], elements: [[8 node indices]], u: Float64Array (3 per node),
 * vm: per element, max: { displacement, vm, utilisation }, reaction: [fx,fy,fz], iterations }.
 */
export function analyzeSolid(tris, rawOptions) {
  const o = normalizeFem3d(rawOptions);
  if (!tris?.length) return { ok: false, error: 'noSolid' };
  const grid = voxelize(tris, o.resolution);
  const { nx, ny, nz, h, hx, hy, hz, cells } = grid;
  const nodeIndex = new Int32Array((nx + 1) * (ny + 1) * (nz + 1)).fill(-1);
  const nodes = [];
  const elements = [];
  const at = (i, j, k) => (k * (ny + 1) + j) * (nx + 1) + i;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!cells[(k * ny + j) * nx + i]) continue;
    elements.push(CORNERS.map(([a, b, c]) => {
      const key = at(i + (a > 0), j + (b > 0), k + (c > 0));
      if (nodeIndex[key] < 0) { nodeIndex[key] = nodes.length; nodes.push([grid.x0 + (i + (a > 0)) * hx, grid.y0 + (j + (b > 0)) * hy, grid.z0 + (k + (c > 0)) * hz]); }
      return nodeIndex[key];
    }));
  }
  if (!elements.length) return { ok: false, error: 'noSolid', grid };
  const n = nodes.length * 3;
  const E = o.material === 'custom' ? o.E : MATERIALS[o.material].E;
  const Ke = hexStiffness([hx, hy, hz], E, o.nu);
  // Faces of the model's box: the nodes on them.
  const lo = [0, 1, 2].map((d) => Math.min(...nodes.map((p) => p[d]))); const hi = [0, 1, 2].map((d) => Math.max(...nodes.map((p) => p[d])));
  const onFace = (face) => {
    const d = { x: 0, y: 1, z: 2 }[face[0]];
    const v = face.endsWith('min') ? lo[d] : hi[d];
    const out = [];
    nodes.forEach((p, i) => { if (Math.abs(p[d] - v) < h * 1e-6) out.push(i); });
    return out;
  };
  const held = new Uint8Array(n);
  for (const face of o.fixed) for (const i of onFace(face)) held[3 * i] = held[3 * i + 1] = held[3 * i + 2] = 1;
  if (!held.some(Boolean)) return { ok: false, error: 'noSupport', grid, nodes, elements };
  // Loads: each face's total force shared by its nodes as the face area they carry.
  const f = new Float64Array(n);
  for (const load of o.loads) {
    const list = onFace(load.face);
    const d = { x: 0, y: 1, z: 2 }[load.face[0]];
    const share = new Map();
    // A node's share: a quarter of each element face (on that side) it is a corner of.
    const v = load.face.endsWith('min') ? lo[d] : hi[d];
    const onIt = new Set(list);
    for (const el of elements) {
      const corners = el.filter((i) => onIt.has(i) && Math.abs(nodes[i][d] - v) < h * 1e-6);
      if (corners.length === 4) for (const i of corners) share.set(i, (share.get(i) ?? 0) + 0.25);
    }
    const total = [...share.values()].reduce((s, x) => s + x, 0) || 1;
    for (const [i, w] of share) { f[3 * i] += (load.fx * w) / total; f[3 * i + 1] += (load.fy * w) / total; f[3 * i + 2] += (load.fz * w) / total; }
  }
  if (o.gravity) {
    // Self weight: ρ g hx hy hz per element, an eighth to each corner (N with mm and kg/m³: ρ × 1e-9 kg/mm³ × 9.81 m/s²).
    const weight = (o.density * 1e-9 * 9.81 * hx * hy * hz) / 8;
    for (const el of elements) for (const i of el) f[3 * i + 2] -= weight;
  }
  // K·u, element by element (one Ke for all).
  const dofs = elements.map((el) => el.flatMap((i) => [3 * i, 3 * i + 1, 3 * i + 2]));
  const Kflat = Float64Array.from(Ke.flat());
  const mul = (x, out) => {
    out.fill(0);
    const ue = new Float64Array(24);
    for (const d of dofs) {
      for (let a = 0; a < 24; a++) ue[a] = x[d[a]];
      for (let a = 0; a < 24; a++) { let s = 0; const row = a * 24; for (let b = 0; b < 24; b++) s += Kflat[row + b] * ue[b]; out[d[a]] += s; }
    }
    for (let i = 0; i < n; i++) if (held[i]) out[i] = x[i];
  };
  const diag = new Float64Array(n);
  for (const d of dofs) for (let a = 0; a < 24; a++) diag[d[a]] += Ke[a][a];
  for (let i = 0; i < n; i++) { if (held[i]) { diag[i] = 1; f[i] = 0; } }
  // Preconditioned conjugate gradients.
  const x = new Float64Array(n); const r = Float64Array.from(f); const z = new Float64Array(n); const p = new Float64Array(n); const q = new Float64Array(n);
  for (let i = 0; i < n; i++) z[i] = r[i] / diag[i];
  p.set(z);
  let rz = 0; for (let i = 0; i < n; i++) rz += r[i] * z[i];
  const norm = Math.sqrt(f.reduce((s, v) => s + v * v, 0)) || 1;
  let it = 0;
  for (; it < 20000; it++) {
    mul(p, q);
    let pq = 0; for (let i = 0; i < n; i++) pq += p[i] * q[i];
    const alpha = rz / (pq || 1e-300);
    let rr = 0;
    for (let i = 0; i < n; i++) { x[i] += alpha * p[i]; r[i] -= alpha * q[i]; rr += r[i] * r[i]; }
    if (Math.sqrt(rr) < 1e-9 * norm) break;
    let next = 0; for (let i = 0; i < n; i++) { z[i] = r[i] / diag[i]; next += r[i] * z[i]; }
    const beta = next / rz; rz = next;
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
  }
  // Stresses at the element centres (where the incompatible modes do not strain).
  const D = elasticity(E, o.nu);
  const { Bc } = strainRows(0, 0, 0, [hx, hy, hz]);
  const vm = new Float64Array(elements.length);
  dofs.forEach((d, e) => {
    const strain = Bc.map((row) => row.reduce((s, v, a) => s + v * x[d[a]], 0));
    const [sx, sy, sz, txy, tyz, txz] = D.map((row) => row.reduce((s, v, k) => s + v * strain[k], 0));
    vm[e] = Math.sqrt(0.5 * ((sx - sy) ** 2 + (sy - sz) ** 2 + (sz - sx) ** 2) + 3 * (txy * txy + tyz * tyz + txz * txz));
  });
  // Reactions: what the supports push back with (K u − f there, as a total).
  const full = new Float64Array(n);
  const ue = new Float64Array(24);
  for (const d of dofs) { for (let a = 0; a < 24; a++) ue[a] = x[d[a]]; for (let a = 0; a < 24; a++) { let s = 0; for (let b = 0; b < 24; b++) s += Ke[a][b] * ue[b]; full[d[a]] += s; } }
  const reaction = [0, 0, 0];
  for (let i = 0; i < n; i++) if (held[i]) reaction[i % 3] += full[i];
  let maxU = 0;
  for (let i = 0; i < nodes.length; i++) maxU = Math.max(maxU, Math.hypot(x[3 * i], x[3 * i + 1], x[3 * i + 2]));
  const vmMax = Math.max(...vm);
  const fy = o.material === 'custom' ? null : MATERIALS[o.material].fy;
  return { ok: true, options: o, grid, nodes, elements, u: x, vm, reaction, iterations: it, max: { displacement: maxU, vm: vmMax, utilisation: fy ? vmMax / fy : 0 } };
}

/** The outer faces of the voxel model (quads shared by one element only), for drawing: [[4 node indices], element]. */
export function boundaryQuads(result) {
  const FACES = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const seen = new Map();
  result.elements.forEach((el, e) => {
    for (const f of FACES) {
      const quad = f.map((c) => el[c]);
      const key = [...quad].sort((a, b) => a - b).join(',');
      if (seen.has(key)) seen.delete(key); else seen.set(key, [quad, e]);
    }
  });
  return [...seen.values()];
}

// ───────────────────────── CalculiX

/** The model as a CalculiX input deck (C3D8I bricks, the same supports, loads and material; mm, N, t/mm³). */
export function toCalculix(result, title = 'MyCAD') {
  const o = result.options;
  const E = o.material === 'custom' ? o.E : MATERIALS[o.material].E;
  const num = (v) => (Math.abs(v) < 1e-12 ? '0' : Number(v.toPrecision(12)).toString());
  const lines = ['*HEADING', `${title} — MyCAD FEM (C3D8I)`, '*NODE, NSET=NALL'];
  result.nodes.forEach((p, i) => lines.push(`${i + 1}, ${p.map(num).join(', ')}`));
  lines.push('*ELEMENT, TYPE=C3D8I, ELSET=EALL');
  result.elements.forEach((el, e) => lines.push(`${e + 1}, ${el.map((i) => i + 1).join(', ')}`));
  const lo = [0, 1, 2].map((d) => Math.min(...result.nodes.map((p) => p[d]))); const hi = [0, 1, 2].map((d) => Math.max(...result.nodes.map((p) => p[d])));
  const faceNodes = (face) => { const d = { x: 0, y: 1, z: 2 }[face[0]]; const v = face.endsWith('min') ? lo[d] : hi[d]; return result.nodes.map((p, i) => (Math.abs(p[d] - v) < result.grid.h * 1e-6 ? i + 1 : 0)).filter(Boolean); };
  const set = (name, ids) => { lines.push(`*NSET, NSET=${name}`); for (let i = 0; i < ids.length; i += 16) lines.push(ids.slice(i, i + 16).join(', ')); };
  const fixed = [...new Set(o.fixed.flatMap(faceNodes))];
  set('NFIX', fixed);
  lines.push('*MATERIAL, NAME=MAT', '*ELASTIC', `${num(E)}, ${num(o.nu)}`, '*DENSITY', `${num(o.density * 1e-12)}`, '*SOLID SECTION, ELSET=EALL, MATERIAL=MAT');
  lines.push('*STEP', '*STATIC', '*BOUNDARY', 'NFIX, 1, 3');
  // The loads: the nodal forces MyCAD put on each node (the same sharing).
  const f = new Map();
  const add = (i, d, v) => { if (v) f.set(`${i},${d}`, (f.get(`${i},${d}`) ?? 0) + v); };
  for (const load of o.loads) {
    const list = new Set(faceNodes(load.face).map((i) => i - 1));
    const d = { x: 0, y: 1, z: 2 }[load.face[0]]; const v = load.face.endsWith('min') ? lo[d] : hi[d];
    const share = new Map();
    for (const el of result.elements) { const c = el.filter((i) => list.has(i) && Math.abs(result.nodes[i][d] - v) < result.grid.h * 1e-6); if (c.length === 4) for (const i of c) share.set(i, (share.get(i) ?? 0) + 0.25); }
    const total = [...share.values()].reduce((s, x) => s + x, 0) || 1;
    for (const [i, w] of share) { add(i + 1, 1, (load.fx * w) / total); add(i + 1, 2, (load.fy * w) / total); add(i + 1, 3, (load.fz * w) / total); }
  }
  if (f.size) { lines.push('*CLOAD'); for (const [key, v] of f) lines.push(`${key}, ${num(v)}`); }
  if (o.gravity) lines.push('*DLOAD', 'EALL, GRAV, 9810., 0., 0., -1.');
  lines.push('*NODE PRINT, NSET=NALL', 'U', '*EL PRINT, ELSET=EALL', 'S', '*END STEP', '');
  return lines.join('\n');
}

/** CalculiX's .dat results: node displacements (by node number) and the stresses at the integration points. */
export function parseCalculixDat(text) {
  const u = new Map();
  const stresses = [];
  let mode = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (/displacements \(vx,vy,vz\)/.test(line)) { mode = 'u'; continue; }
    if (/stresses \(elem, integ\.pnt\./.test(line)) { mode = 's'; continue; }
    const parts = line.trim().split(/\s+/).map(Number);
    if (!line.trim() || parts.some(Number.isNaN)) { if (line.trim()) mode = null; continue; }
    if (mode === 'u' && parts.length === 4) u.set(parts[0], parts.slice(1));
    if (mode === 's' && parts.length === 8) stresses.push({ element: parts[0], point: parts[1], s: parts.slice(2) });
  }
  return { u, stresses };
}
