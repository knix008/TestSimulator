// FreeCAD FEM analysis on a solid: one object with the mesh (bricks from the
// solid, mesh regions, boundary layers, groups, node and element sets), the
// material (solid, non-linear, reinforced, fluid), the boundary conditions and
// loads of every physics, the equations to solve and the solver. Solves on
// the brick mesh:
//   elasticity / deformation — linear statics (fem3d.js bricks) with fixed and
//     prescribed displacements, forces, pressure, gravity, centrifugal loads,
//     springs, rigid and plane constraints, bearings, gears and pulleys, ties
//     and contact (penalty), thermal strain, local systems, and an elastic–
//     perfectly plastic material by secant iterations;
//   heat, electrostatic, static current, flow (potential flow), flux — one
//     scalar field −∇·(k∇φ) = s with fixed values, fluxes, film convection
//     and sources;
//   magnetodynamic (vector potential, three scalar solves) and its 2D form.
// Post-processing: fields at nodes and elements, warp, clips, cuts, contours,
// glyphs, data along a line or at a point, stress linearization, a calculator,
// histograms and tables. Input decks for CalculiX, Elmer, Mystran and Z88. No DOM.

import { voxelize, hexStiffness, elasticity, strainRows, CORNERS } from './fem3d.js';
import { fitCylinder } from './points.js';
import { evaluate, setVariables } from './expr.js';

/** Runs fn with these expression variables, then puts the old ones back. */
function withVariables(vars, fn) {
  const before = setVariables(vars);
  try { return fn(); } finally { setVariables(before); }
}
import { closestOnTriangle } from './meshops.js';

export const EQUATIONS = ['elasticity', 'deformation', 'heat', 'electrostatic', 'electricforce', 'staticCurrent', 'flow', 'flux', 'magnetodynamic', 'magnetodynamic2D'];
export const CONSTRAINT_KINDS = [
  'fixed', 'displacement', 'force', 'pressure', 'selfWeight', 'centrif', 'spring', 'rigidBody', 'planeRotation', 'bearing', 'gear', 'pulley', 'contact', 'tie', 'transform', 'sectionPrint',
  'temperature', 'heatflux', 'bodyHeatSource', 'initialTemperature',
  'electrostaticPotential', 'electricChargeDensity', 'currentDensity', 'magnetization',
  'flowVelocity', 'initialFlowVelocity', 'initialPressure', 'fluidBoundary',
];
export const MATERIAL_KINDS = ['solid', 'nonlinear', 'reinforced', 'fluid'];
export const SOLVERS = ['internal', 'calculix', 'elmer', 'mystran', 'z88'];
export const FILTERS = ['warp', 'clipScalar', 'clipRegion', 'cutFunction', 'contours', 'glyph', 'dataAlongLine', 'dataAtPoint', 'linearizedStresses', 'calculator', 'branch'];
export const FUNCTIONS = ['plane', 'sphere', 'box', 'cylinder'];
export const EPS0 = 8.8541878128e-12;
export const MU0 = 4e-7 * Math.PI;

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const vec = (v, d = [0, 0, 0]) => (Array.isArray(v) && v.length === 3 && v.every((x) => Number.isFinite(Number(x))) ? v.map(Number) : d.slice());
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
let counter = 0;
export const femId = (p) => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;

// ───────────────────────── the analysis

/** A face selection: a picked face (signature: centre, normal, area) or a side of the bounding box. */
const normalizeFace = (f) => (f?.box && ['xmin', 'xmax', 'ymin', 'ymax', 'zmin', 'zmax'].includes(f.box) ? { box: f.box }
  : f?.signature?.center && f?.signature?.normal ? { signature: { center: vec(f.signature.center), normal: vec(f.signature.normal), area: num(f.signature.area) }, ...(Array.isArray(f.tris) ? { tris: f.tris.slice(0, 2000) } : {}) } : null);

export function normalizeMaterial(raw = {}) {
  return {
    kind: MATERIAL_KINDS.includes(raw.kind) ? raw.kind : 'solid', name: typeof raw.name === 'string' ? raw.name.slice(0, 80) : 'Steel',
    E: Math.max(1e-6, num(raw.E, 210000)), nu: Math.min(0.49, Math.max(0, num(raw.nu, 0.3))), density: Math.max(0, num(raw.density, 7850)),
    alpha: num(raw.alpha, 1.2e-5), k: Math.max(1e-9, num(raw.k, 50)), cp: Math.max(0, num(raw.cp, 460)),
    eps: Math.max(1e-9, num(raw.eps, 1)), sigma: Math.max(1e-12, num(raw.sigma, 5.8e7)), mu: Math.max(1e-9, num(raw.mu, 1)),
    yield: Math.max(0, num(raw.yield, 235)), hardening: Math.max(0, num(raw.hardening, 0)),
    steelRatio: Math.min(0.5, Math.max(0, num(raw.steelRatio, 0.02))), steelE: Math.max(1, num(raw.steelE, 200000)),
    viscosity: Math.max(1e-12, num(raw.viscosity, 1e-3)),
  };
}

export function normalizeAnalysis(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.solid !== 'string') return null;
  const sets = (list, key) => (Array.isArray(list) ? list : []).filter((s) => typeof s?.name === 'string' && Array.isArray(s[key])).map((s) => ({ name: s.name.slice(0, 60), [key]: s[key].filter(Number.isInteger).slice(0, 200000) }));
  return {
    solid: raw.solid,
    mesher: ['voxel', 'netgen', 'gmsh'].includes(raw.mesher) ? raw.mesher : 'voxel',
    resolution: Math.round(Math.min(64, Math.max(4, num(raw.resolution, 16)))),
    meshed: raw.meshed !== false,
    regions: (Array.isArray(raw.regions) ? raw.regions : []).map((r) => ({ faces: (r.faces ?? []).map(normalizeFace).filter(Boolean), size: Math.max(0.01, num(r.size, 2)) })),
    layers: (Array.isArray(raw.layers) ? raw.layers : []).map((r) => ({ faces: (r.faces ?? []).map(normalizeFace).filter(Boolean), count: Math.max(1, Math.round(num(r.count, 3))), thickness: Math.max(0.001, num(r.thickness, 0.5)) })),
    groups: (Array.isArray(raw.groups) ? raw.groups : []).filter((g) => typeof g?.name === 'string').map((g) => ({ name: g.name.slice(0, 60), faces: (g.faces ?? []).map(normalizeFace).filter(Boolean) })),
    // FEM_CreateElementsSet (erase): the bricks taken out, by grid cell "i,j,k".
    erased: (Array.isArray(raw.erased) ? raw.erased : []).filter((k) => typeof k === 'string' && /^\d+,\d+,\d+$/.test(k)),
    nodeSets: sets(raw.nodeSets, 'nodes'), elementSets: sets(raw.elementSets, 'elements'),
    material: normalizeMaterial(raw.material),
    eps0: Math.max(1e-30, num(raw.eps0, EPS0)),
    constraints: (Array.isArray(raw.constraints) ? raw.constraints : []).filter((c) => CONSTRAINT_KINDS.includes(c?.type)).map((c) => ({ id: typeof c.id === 'string' ? c.id : femId('k'), type: c.type, faces: (c.faces ?? []).map(normalizeFace).filter(Boolean), faces2: (c.faces2 ?? []).map(normalizeFace).filter(Boolean), params: c.params && typeof c.params === 'object' ? { ...c.params } : {} })),
    equations: [...new Set((Array.isArray(raw.equations) ? raw.equations : ['elasticity']).filter((e) => EQUATIONS.includes(e)))],
    equationParams: raw.equationParams && typeof raw.equationParams === 'object' ? { ...raw.equationParams } : {},
    solver: SOLVERS.includes(raw.solver) ? raw.solver : 'internal',
    functions: (Array.isArray(raw.functions) ? raw.functions : []).filter((f) => FUNCTIONS.includes(f?.type)).map((f) => ({ id: typeof f.id === 'string' ? f.id : femId('f'), type: f.type, params: { ...(f.params ?? {}) } })),
    pipeline: (Array.isArray(raw.pipeline) ? raw.pipeline : []).filter((f) => FILTERS.includes(f?.type)).map((f) => ({ id: typeof f.id === 'string' ? f.id : femId('p'), type: f.type, field: typeof f.field === 'string' ? f.field : 'vm', parent: typeof f.parent === 'string' ? f.parent : null, params: { ...(f.params ?? {}) } })),
  };
}

// ───────────────────────── the mesh

/**
 * The analysis mesh: bricks of the solid (the grid as fine as the finest mesh
 * region, the boundary-layer thickness or the netgen / gmsh element size
 * asks), minus erased elements. { nodes, elements, grid, quads: [{ nodes, element, normal, centre, area }] }.
 */
export function buildMesh(tris, analysis) {
  let box = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (const t of tris) for (const p of t) { box = [Math.min(box[0], p[0]), Math.max(box[1], p[0]), Math.min(box[2], p[1]), Math.max(box[3], p[1]), Math.min(box[4], p[2]), Math.max(box[5], p[2])]; }
  const size = Math.max(box[1] - box[0], box[3] - box[2], box[5] - box[4]) || 1;
  let resolution = analysis.resolution;
  // Regions and boundary layers: the finest size asked for sets the whole grid (bricks are all one size).
  for (const r of analysis.regions) resolution = Math.max(resolution, Math.ceil(size / r.size));
  for (const l of analysis.layers) resolution = Math.max(resolution, Math.ceil(size / (l.thickness / l.count)));
  resolution = Math.min(64, resolution);
  const grid = voxelize(tris, resolution);
  const { nx, ny, nz, hx, hy, hz, cells } = grid;
  const nodeIndex = new Int32Array((nx + 1) * (ny + 1) * (nz + 1)).fill(-1);
  const at = (i, j, k) => (k * (ny + 1) + j) * (nx + 1) + i;
  const raw = [];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (cells[(k * ny + j) * nx + i]) raw.push([i, j, k]);
  const erased = new Set(analysis.erased);
  const nodes = [];
  const elements = [];
  const cellOf = [];
  raw.forEach(([i, j, k]) => {
    if (erased.has(`${i},${j},${k}`)) return;
    elements.push(CORNERS.map(([a, b, c]) => {
      const key = at(i + (a > 0), j + (b > 0), k + (c > 0));
      if (nodeIndex[key] < 0) { nodeIndex[key] = nodes.length; nodes.push([grid.x0 + (i + (a > 0)) * hx, grid.y0 + (j + (b > 0)) * hy, grid.z0 + (k + (c > 0)) * hz]); }
      return nodeIndex[key];
    }));
    cellOf.push([i, j, k]);
  });
  // Outer faces (shared by one element): quads with their outward normal.
  const FACES = [[[0, 3, 2, 1], [0, 0, -1]], [[4, 5, 6, 7], [0, 0, 1]], [[0, 1, 5, 4], [0, -1, 0]], [[1, 2, 6, 5], [1, 0, 0]], [[2, 3, 7, 6], [0, 1, 0]], [[3, 0, 4, 7], [-1, 0, 0]]];
  const seen = new Map();
  elements.forEach((el, e) => {
    for (const [f, normal] of FACES) {
      const quad = f.map((c) => el[c]);
      const key = [...quad].sort((a, b) => a - b).join(',');
      if (seen.has(key)) seen.delete(key); else seen.set(key, { nodes: quad, element: e, normal });
    }
  });
  const quads = [...seen.values()].map((q) => {
    const P = q.nodes.map((i) => nodes[i]);
    const centre = mul(P.reduce((s, p) => add(s, p), [0, 0, 0]), 0.25);
    const area = len(cross(sub(P[1], P[0]), sub(P[3], P[0])));
    return { ...q, centre, area };
  });
  return { nodes, elements, grid, quads, cellOf, resolution, h: Math.max(hx, hy, hz), size: [hx, hy, hz] };
}

/** The boundary quads a face selection covers. */
export function quadsOf(mesh, faces) {
  const lo = [0, 1, 2].map((d) => Math.min(...mesh.nodes.map((p) => p[d])));
  const hi = [0, 1, 2].map((d) => Math.max(...mesh.nodes.map((p) => p[d])));
  const out = new Set();
  for (const f of faces) {
    if (f.box) {
      const d = { x: 0, y: 1, z: 2 }[f.box[0]];
      const v = f.box.endsWith('min') ? lo[d] : hi[d];
      mesh.quads.forEach((q, i) => { if (q.nodes.every((n) => Math.abs(mesh.nodes[n][d] - v) < mesh.h * 1e-6)) out.add(i); });
      continue;
    }
    // A picked face: quads facing its way, on its plane (within a brick), over its area.
    const n = unit(f.signature.normal);
    const c = f.signature.center;
    const tris = f.tris ?? null;
    // Within a brick of one of the face's triangles.
    const insideTris = (p) => !tris || tris.some((tri) => len(sub(closestOnTriangle(p, tri), p)) <= mesh.h);
    mesh.quads.forEach((q, i) => {
      if (dot(q.normal, n) < 0.5) return;
      if (Math.abs(dot(sub(q.centre, c), n)) > mesh.h * 0.75) return;
      if (!tris && f.signature.area > 0 && len(sub(q.centre, c)) > Math.sqrt(f.signature.area) * 1.5 + mesh.h) return;
      if (insideTris(q.centre)) out.add(i);
    });
  }
  return [...out].map((i) => mesh.quads[i]);
}

const nodesOf = (quads) => [...new Set(quads.flatMap((q) => q.nodes))];

// ───────────────────────── solving

/** Conjugate gradients, Jacobi preconditioned, with held entries keeping their values. mulK(x, out). */
function cg(n, mulK, f, diag, held, x0) {
  const x = x0 ?? new Float64Array(n);
  const Ax = new Float64Array(n);
  mulK(x, Ax);
  const r = new Float64Array(n);
  for (let i = 0; i < n; i++) r[i] = held[i] ? 0 : f[i] - Ax[i];
  const z = new Float64Array(n); const p = new Float64Array(n); const q = new Float64Array(n);
  for (let i = 0; i < n; i++) z[i] = held[i] ? 0 : r[i] / (diag[i] || 1);
  p.set(z);
  let rz = 0; for (let i = 0; i < n; i++) rz += r[i] * z[i];
  const norm = Math.sqrt(f.reduce((s, v, i) => s + (held[i] ? 0 : v * v), 0)) || Math.sqrt(r.reduce((s, v) => s + v * v, 0)) || 1;
  let it = 0;
  for (; it < 20000 && rz > 0; it++) {
    mulK(p, q);
    for (let i = 0; i < n; i++) if (held[i]) q[i] = 0;
    let pq = 0; for (let i = 0; i < n; i++) pq += p[i] * q[i];
    const alpha = rz / (pq || 1e-300);
    let rr = 0;
    for (let i = 0; i < n; i++) { x[i] += alpha * p[i]; r[i] -= alpha * q[i]; rr += r[i] * r[i]; }
    if (Math.sqrt(rr) < 1e-10 * norm) break;
    let next = 0; for (let i = 0; i < n; i++) { z[i] = held[i] ? 0 : r[i] / (diag[i] || 1); next += r[i] * z[i]; }
    const beta = next / rz; rz = next;
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
  }
  return { x, iterations: it };
}

/** The conduction matrix (8 × 8) of a brick for k = 1. */
function hexConduction([hx, hy, hz]) {
  const g = 1 / Math.sqrt(3);
  const K = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const w = (hx * hy * hz) / 8;
  for (const xi of [-g, g]) for (const eta of [-g, g]) for (const zeta of [-g, g]) {
    const dN = CORNERS.map(([a, b, c]) => [a * (1 + b * eta) * (1 + c * zeta) / 8 * (2 / hx), b * (1 + a * xi) * (1 + c * zeta) / 8 * (2 / hy), c * (1 + a * xi) * (1 + b * eta) / 8 * (2 / hz)]);
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) K[a][b] += dot(dN[a], dN[b]) * w;
  }
  return K;
}

/** Element centre gradient of a nodal field (per brick: the average of the edge differences). */
function gradients(mesh, field) {
  const [hx, hy, hz] = mesh.size;
  return mesh.elements.map((el) => {
    const v = el.map((i) => field[i]);
    // Corners: 0..3 bottom (counter-clockwise from −x−y), 4..7 top.
    const gx = ((v[1] - v[0]) + (v[2] - v[3]) + (v[5] - v[4]) + (v[6] - v[7])) / (4 * hx);
    const gy = ((v[3] - v[0]) + (v[2] - v[1]) + (v[7] - v[4]) + (v[6] - v[5])) / (4 * hy);
    const gz = ((v[4] - v[0]) + (v[5] - v[1]) + (v[6] - v[2]) + (v[7] - v[3])) / (4 * hz);
    return [gx, gy, gz];
  });
}

/**
 * −∇·(k ∇φ) = s on the mesh. bc: { fixed: Map(node → value), flux: [{ quads, q }] (out of the body, per area),
 * film: [{ quads, h, ambient }], source: s per volume (or per element array), k }.
 */
export function solveScalar(mesh, bc) {
  const n = mesh.nodes.length;
  const Ke = hexConduction(mesh.size);
  const k = bc.k ?? 1;
  const f = new Float64Array(n);
  const diag = new Float64Array(n);
  const extra = new Float64Array(n);
  const vol = mesh.size[0] * mesh.size[1] * mesh.size[2];
  mesh.elements.forEach((el, e) => {
    for (let a = 0; a < 8; a++) diag[el[a]] += Ke[a][a] * k;
    const s = Array.isArray(bc.source) ? bc.source[e] : (bc.source ?? 0);
    if (s) for (const i of el) f[i] += (s * vol) / 8;
  });
  for (const { quads, q } of bc.flux ?? []) for (const quad of quads) for (const i of quad.nodes) f[i] -= (q * quad.area) / 4;
  for (const { quads, h, ambient } of bc.film ?? []) for (const quad of quads) for (const i of quad.nodes) { extra[i] += (h * quad.area) / 4; f[i] += (h * ambient * quad.area) / 4; }
  for (let i = 0; i < n; i++) diag[i] += extra[i];
  const held = new Uint8Array(n);
  const x = new Float64Array(n);
  for (const [i, v] of bc.fixed ?? []) { held[i] = 1; x[i] = v; }
  if (!held.some(Boolean) && !extra.some(Boolean)) {
    // Only fluxes: the field is fixed up to a constant — the first node at 0.
    held[0] = 1;
  }
  const mulK = (u, out) => {
    out.fill(0);
    for (const el of mesh.elements) for (let a = 0; a < 8; a++) { let s = 0; for (let b = 0; b < 8; b++) s += Ke[a][b] * u[el[b]]; out[el[a]] += s * k; }
    for (let i = 0; i < n; i++) out[i] += extra[i] * u[i];
  };
  const run = cg(n, mulK, f, diag, held, x);
  const grad = gradients(mesh, run.x);
  return { values: run.x, grad, iterations: run.iterations };
}

/** The 3D stiffness pieces: one brick matrix, its element scale factors, penalty links, node springs. */
function elasticSolve(mesh, { E, nu, scale = null, held, prescribed, f, springs, links }) {
  const n = mesh.nodes.length * 3;
  const Ke = hexStiffness(mesh.size, E, nu);
  const K = Float64Array.from(Ke.flat());
  const dofs = mesh.elements.map((el) => el.flatMap((i) => [3 * i, 3 * i + 1, 3 * i + 2]));
  const diag = new Float64Array(n);
  dofs.forEach((d, e) => { const s = scale ? scale[e] : 1; for (let a = 0; a < 24; a++) diag[d[a]] += Ke[a][a] * s; });
  for (const [i, M] of springs) for (let a = 0; a < 3; a++) diag[3 * i + a] += M[a][a];
  for (const { i, j, M } of links) for (let a = 0; a < 3; a++) { diag[3 * i + a] += M[a][a]; diag[3 * j + a] += M[a][a]; }
  const mulK = (u, out) => {
    out.fill(0);
    const ue = new Float64Array(24);
    dofs.forEach((d, e) => {
      const s = scale ? scale[e] : 1;
      for (let a = 0; a < 24; a++) ue[a] = u[d[a]];
      for (let a = 0; a < 24; a++) { let sum = 0; const row = a * 24; for (let b = 0; b < 24; b++) sum += K[row + b] * ue[b]; out[d[a]] += sum * s; }
    });
    for (const [i, M] of springs) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) out[3 * i + a] += M[a][b] * u[3 * i + b];
    for (const { i, j, M } of links) {
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
        const d = M[a][b] * (u[3 * i + b] - u[3 * j + b]);
        out[3 * i + a] += d; out[3 * j + a] -= d;
      }
    }
  };
  const x = new Float64Array(n);
  for (const [dof, v] of prescribed) x[dof] = v;
  const run = cg(n, mulK, f, diag, held, x);
  // Reactions: K u − f where held.
  const Ku = new Float64Array(n);
  mulK(run.x, Ku);
  return { u: run.x, iterations: run.iterations, residual: Ku, dofs };
}

/** Stresses at element centres (6 components) from displacements, minus the thermal part. */
function elementStresses(mesh, u, { E, nu, scale = null, thermal = null }) {
  const D = elasticity(E, nu);
  const { Bc } = strainRows(0, 0, 0, mesh.size);
  return mesh.elements.map((el, e) => {
    const d = el.flatMap((i) => [3 * i, 3 * i + 1, 3 * i + 2]);
    const strain = Bc.map((row) => row.reduce((s, v, a) => s + v * u[d[a]], 0));
    if (thermal) for (let k = 0; k < 3; k++) strain[k] -= thermal[e];
    const s = scale ? scale[e] : 1;
    return D.map((row) => row.reduce((acc, v, k) => acc + v * strain[k], 0) * s);
  });
}

export const vonMises = ([sx, sy, sz, txy, tyz, txz]) => Math.sqrt(0.5 * ((sx - sy) ** 2 + (sy - sz) ** 2 + (sz - sx) ** 2) + 3 * (txy * txy + tyz * tyz + txz * txz));

/** A local system's rotation (FEM_ConstraintTransform) applied to a direction. */
function rotateBy(v, r) {
  if (!r) return v;
  const rad = (d) => (d * Math.PI) / 180;
  const [cx, sx] = [Math.cos(rad(r[0])), Math.sin(rad(r[0]))]; const [cy, sy] = [Math.cos(rad(r[1])), Math.sin(rad(r[1]))]; const [cz, sz] = [Math.cos(rad(r[2])), Math.sin(rad(r[2]))];
  let [x, y, z] = v;
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  return [x, y, z];
}

const outer = (a, b) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => a[i] * b[j]));
const scaleM = (M, k) => M.map((r) => r.map((v) => v * k));
const addM = (A, B) => A.map((r, i) => r.map((v, j) => v + B[i][j]));
const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/**
 * Solves the analysis's equations on its mesh. Returns { ok, mesh, fields: { name: { at: 'node' | 'element', values (scalars) , vectors? } }, report, … }.
 */
export function solveAnalysis(tris, analysisRaw) {
  const a = normalizeAnalysis(analysisRaw);
  if (!a || !tris?.length) return { ok: false, error: 'noSolid' };
  const mesh = buildMesh(tris, a);
  if (!mesh.elements.length) return { ok: false, error: 'noSolid' };
  const m = a.material;
  const fields = {};
  const report = {};
  const of = (type) => a.constraints.filter((c) => c.type === type);
  const quadsFor = (c, key = 'faces') => quadsOf(mesh, c[key]);
  const transformOf = (c) => {
    const t = of('transform').find((x) => x.faces.some((f) => c.faces.some((g) => JSON.stringify(f) === JSON.stringify(g))));
    return t ? [num(t.params.rx), num(t.params.ry), num(t.params.rz)] : null;
  };
  const vol = mesh.size[0] * mesh.size[1] * mesh.size[2];
  const centreOf = (e) => mul(mesh.elements[e].reduce((s, i) => add(s, mesh.nodes[i]), [0, 0, 0]), 1 / 8);
  // ── heat (first: its temperatures may load the elasticity)
  let temperature = null;
  const scalarBc = ({ fixedType, fluxType, filmFrom = null, sourceType, k, sourceScale = 1, fluxScale = 1, fixedKey = 'value' }) => {
    const fixed = new Map();
    for (const c of of(fixedType)) for (const i of nodesOf(quadsFor(c))) fixed.set(i, num(c.params[fixedKey]));
    const flux = [];
    const film = [];
    for (const c of fluxType ? of(fluxType) : []) {
      if (filmFrom && c.params.mode === 'convection') film.push({ quads: quadsFor(c), h: num(c.params.film) * 1e-6, ambient: num(c.params.ambient, 293.15) });
      else flux.push({ quads: quadsFor(c), q: -num(c.params.flux) * fluxScale });
    }
    let source = 0;
    for (const c of sourceType ? of(sourceType) : []) source += num(c.params.value) * sourceScale;
    return { fixed, flux, film, source, k };
  };
  if (a.equations.includes('heat')) {
    // W/m², W/m³ and W/(m·K) in mm units: ×1e-6, ×1e-9, ×1e-3 (W per mm per K).
    const bc = scalarBc({ fixedType: 'temperature', fluxType: 'heatflux', filmFrom: true, sourceType: 'bodyHeatSource', k: m.k * 1e-3, sourceScale: 1e-9, fluxScale: 1e-6 });
    const initial = of('initialTemperature')[0];
    if (!bc.fixed.size && !bc.film.length && initial) for (const i of [0]) bc.fixed.set(i, num(initial.params.value, 293.15));
    const r = solveScalar(mesh, bc);
    temperature = r.values;
    fields.temperature = { at: 'node', values: Array.from(r.values), unit: 'K' };
    // −k ∇T with ∇T in K/mm: W/m².
    fields.heatFlux = { at: 'element', vectors: r.grad.map((g) => mul(g, -m.k * 1e3)), values: r.grad.map((g) => len(g) * m.k * 1e3), unit: 'W/m²' };
    report.heat = { min: Math.min(...r.values), max: Math.max(...r.values), iterations: r.iterations };
  }
  // ── electrostatics and the electric force
  if (a.equations.includes('electrostatic') || a.equations.includes('electricforce')) {
    const permittivity = a.eps0 * m.eps * 1e-3; // F/mm
    const bc = scalarBc({ fixedType: 'electrostaticPotential', fluxType: null, sourceType: 'electricChargeDensity', k: permittivity, sourceScale: 1e-9 });
    const r = solveScalar(mesh, bc);
    fields.potential = { at: 'node', values: Array.from(r.values), unit: 'V' };
    const E = r.grad.map((g) => mul(g, -1e3)); // V/m
    fields.electricField = { at: 'element', vectors: E, values: E.map(len), unit: 'V/m' };
    if (a.equations.includes('electricforce')) {
      // Maxwell stress on the potential faces: f = ε E² / 2 along the outward normal (N).
      let total = [0, 0, 0];
      for (const c of of('electrostaticPotential')) for (const q of quadsFor(c)) {
        const e2 = dot(E[q.element], E[q.element]);
        total = add(total, mul(q.normal, (a.eps0 * m.eps * e2) / 2 * q.area * 1e-6));
      }
      report.electricForce = total;
    }
  }
  // ── static current
  if (a.equations.includes('staticCurrent')) {
    const conductivity = m.sigma * 1e-3; // S/mm
    // Current densities in A/m² on the faces: A/mm² × 1e-3 in these units (σ in S/mm).
    const bc = scalarBc({ fixedType: 'electrostaticPotential', fluxType: 'currentDensity', sourceType: null, k: conductivity, fluxScale: 1e-6 });
    const r = solveScalar(mesh, bc);
    fields.currentPotential = { at: 'node', values: Array.from(r.values), unit: 'V' };
    const J = r.grad.map((g) => mul(g, -conductivity * 1e6)); // A/m²
    fields.currentDensity = { at: 'element', vectors: J, values: J.map(len), unit: 'A/m²' };
    // The current through each electrode (in at one, out at the other): the largest.
    report.current = Math.max(0, ...of('electrostaticPotential').map((c) => Math.abs(quadsFor(c).reduce((s, q) => s + dot(J[q.element], q.normal) * q.area * 1e-6, 0))));
  }
  // ── potential flow: ∇²φ = 0, v = ∇φ, Bernoulli pressure
  if (a.equations.includes('flow')) {
    const fixed = new Map();
    for (const c of of('initialPressure')) for (const i of nodesOf(quadsFor(c))) fixed.set(i, 0);
    for (const c of of('fluidBoundary')) for (const i of nodesOf(quadsFor(c))) fixed.set(i, num(c.params.potential, 0));
    const flux = of('flowVelocity').map((c) => ({ quads: quadsFor(c), q: num(c.params.velocity) }));
    const r = solveScalar(mesh, { fixed, flux, k: 1 });
    const v = r.grad.map((g) => mul(g, -1));
    const p0 = num(of('initialPressure')[0]?.params.value, 0);
    const vmax = Math.max(...v.map(len));
    fields.velocity = { at: 'element', vectors: v, values: v.map(len), unit: 'mm/s' };
    fields.pressure = { at: 'element', values: v.map((x) => p0 + 0.5 * m.density * 1e-9 * (vmax * vmax - dot(x, x))), unit: 'MPa' };
  }
  // ── magnetics: vector potential, B = ∇ × A
  if (a.equations.includes('magnetodynamic') || a.equations.includes('magnetodynamic2D')) {
    const two = a.equations.includes('magnetodynamic2D') && !a.equations.includes('magnetodynamic');
    const reluctivity = 1 / (MU0 * m.mu); // per H/m
    const J = [0, 0, 0];
    for (const c of of('currentDensity')) for (let d = 0; d < 3; d++) J[d] += num(c.params[['jx', 'jy', 'jz'][d]]);
    const fixed = new Map();
    for (const c of of('electrostaticPotential')) for (const i of nodesOf(quadsFor(c))) fixed.set(i, 0);
    // Magnetization: its surface current M × n on the given faces, as a flux of A.
    const comps = two ? [2] : [0, 1, 2];
    const A = [new Float64Array(mesh.nodes.length), new Float64Array(mesh.nodes.length), new Float64Array(mesh.nodes.length)];
    for (const d of comps) {
      const flux = [];
      for (const c of of('magnetization')) {
        const M = [num(c.params.mx), num(c.params.my), num(c.params.mz)];
        for (const q of quadsFor(c)) flux.push({ quads: [q], q: -cross(M, q.normal)[d] * 1e-3 });
      }
      // ∇·(ν ∇A) = −J: with lengths in mm and J in A/mm², ν ∇²A = −J gives A in Wb/m.
      const r = solveScalar(mesh, { fixed: fixed.size ? fixed : new Map([[0, 0]]), flux, source: J[d], k: reluctivity });
      A[d] = r.values;
    }
    const gradsA = A.map((f) => gradients(mesh, f));
    const B = mesh.elements.map((_, e) => [gradsA[2][e][1] - gradsA[1][e][2], gradsA[0][e][2] - gradsA[2][e][0], gradsA[1][e][0] - gradsA[0][e][1]].map((v) => v * 1e3));
    fields.magneticPotential = { at: 'node', values: Array.from(A[2]), unit: 'Wb/m' };
    fields.magneticFlux = { at: 'element', vectors: B, values: B.map(len), unit: 'T' };
  }
  // ── flux equation: the flux of what was solved (heat, electric, current)
  if (a.equations.includes('flux') && !fields.heatFlux && fields.potential) fields.flux = { at: 'element', vectors: fields.electricField.vectors.map((e) => mul(e, a.eps0 * m.eps)), values: fields.electricField.values.map((e) => e * a.eps0 * m.eps), unit: 'C/m²' };
  // ── elasticity (and the large-deformation "deformation" equation, solved the same way, small steps)
  if (a.equations.includes('elasticity') || a.equations.includes('deformation')) {
    let E = m.E;
    if (m.kind === 'reinforced') E = m.E * (1 - m.steelRatio) + m.steelE * m.steelRatio;
    const n = mesh.nodes.length * 3;
    const held = new Uint8Array(n);
    const prescribed = new Map();
    const f = new Float64Array(n);
    const springs = new Map();
    const links = [];
    const addSpring = (i, M) => springs.set(i, springs.has(i) ? addM(springs.get(i), M) : M);
    const big = E * mesh.h * 10;
    for (const c of of('fixed')) for (const i of nodesOf(quadsFor(c))) for (let d = 0; d < 3; d++) { held[3 * i + d] = 1; prescribed.set(3 * i + d, 0); }
    for (const c of of('displacement')) {
      const R = transformOf(c);
      const values = [c.params.ux, c.params.uy, c.params.uz];
      for (const i of nodesOf(quadsFor(c))) {
        if (R) {
          // In a local system: penalty springs along each held local direction.
          values.forEach((v, d) => { if (v === null || v === undefined || v === '') return; const dir = rotateBy([0, 1, 2].map((k) => (k === d ? 1 : 0)), R); addSpring(i, scaleM(outer(dir, dir), big)); for (let k = 0; k < 3; k++) f[3 * i + k] += big * num(v) * dir[k]; });
        } else values.forEach((v, d) => { if (v === null || v === undefined || v === '') return; held[3 * i + d] = 1; prescribed.set(3 * i + d, num(v)); });
      }
    }
    const spread = (quads, F) => {
      const total = quads.reduce((s, q) => s + q.area, 0) || 1;
      for (const q of quads) for (const i of q.nodes) for (let d = 0; d < 3; d++) f[3 * i + d] += (F[d] * q.area) / total / 4;
    };
    for (const c of of('force')) spread(quadsFor(c), rotateBy([num(c.params.fx), num(c.params.fy), num(c.params.fz)], transformOf(c)));
    for (const c of of('pressure')) for (const q of quadsFor(c)) for (const i of q.nodes) for (let d = 0; d < 3; d++) f[3 * i + d] -= (num(c.params.pressure) * q.area * q.normal[d]) / 4;
    for (const c of of('gear')) {
      // A tangential force at the pitch circle with its radial share by the pressure angle.
      const dir = unit(vec([c.params.dx, c.params.dy, c.params.dz], [1, 0, 0]));
      const Ft = num(c.params.force); const alpha = (num(c.params.angle, 20) * Math.PI) / 180;
      const radial = unit(vec([c.params.rx, c.params.ry, c.params.rz], [0, 1, 0]));
      spread(quadsFor(c), add(mul(dir, Ft), mul(radial, Ft * Math.tan(alpha))));
    }
    for (const c of of('pulley')) {
      const dir = unit(vec([c.params.dx, c.params.dy, c.params.dz], [1, 0, 0]));
      spread(quadsFor(c), mul(dir, num(c.params.force1) + num(c.params.force2)));
    }
    const g = 9.81;
    for (const c of of('selfWeight')) {
      const dirG = unit(vec([c.params.gx, c.params.gy, c.params.gz], [0, 0, -1]));
      const w = (m.density * 1e-9 * g * vol) / 8;
      for (const el of mesh.elements) for (const i of el) for (let d = 0; d < 3; d++) f[3 * i + d] += w * dirG[d];
    }
    for (const c of of('centrif')) {
      const omega = (num(c.params.rpm) * 2 * Math.PI) / 60;
      const axisP = vec([c.params.px, c.params.py, c.params.pz]); const axisD = unit(vec([c.params.ax, c.params.ay, c.params.az], [0, 0, 1]));
      mesh.elements.forEach((el, e) => {
        const p = centreOf(e);
        const rel = sub(p, axisP);
        const r = sub(rel, mul(axisD, dot(rel, axisD)));
        const F = mul(r, (m.density * 1e-9 * vol * omega * omega * 1e-3) / 8);
        for (const i of el) for (let d = 0; d < 3; d++) f[3 * i + d] += F[d];
      });
    }
    for (const c of of('spring')) {
      // The face's whole stiffness (normal and tangential, N/mm) shared by its nodes, each along its own normal.
      const kn = num(c.params.normal); const kt = num(c.params.tangential);
      const quads = quadsFor(c);
      const normals = new Map();
      for (const q of quads) for (const i of q.nodes) normals.set(i, add(normals.get(i) ?? [0, 0, 0], q.normal));
      for (const [i, nn] of normals) {
        const N = outer(unit(nn), unit(nn));
        addSpring(i, scaleM(addM(scaleM(N, kn), scaleM(addM(I3, scaleM(N, -1)), kt)), 1 / (normals.size || 1)));
      }
    }
    for (const c of of('rigidBody')) {
      const nodes = nodesOf(quadsFor(c));
      for (const i of nodes.slice(1)) links.push({ i, j: nodes[0], M: scaleM(I3, big) });
      const ref = nodes[0];
      if (ref !== undefined) [c.params.ux, c.params.uy, c.params.uz].forEach((v, d) => { if (v === null || v === undefined || v === '') return; held[3 * ref + d] = 1; prescribed.set(3 * ref + d, num(v)); });
    }
    for (const c of of('planeRotation')) {
      const quads = quadsFor(c); const nodes = nodesOf(quads);
      const nrm = unit(quads.reduce((s, q) => add(s, q.normal), [0, 0, 0]));
      for (const i of nodes.slice(1)) links.push({ i, j: nodes[0], M: scaleM(outer(nrm, nrm), big) });
    }
    for (const c of of('bearing')) {
      // Radial directions held (stiff), axial free unless asked; the axis fitted to the face.
      const nodes = nodesOf(quadsFor(c));
      const cyl = nodes.length >= 6 ? fitCylinder(nodes.flatMap((i) => mesh.nodes[i])) : null;
      const axis = unit(cyl?.axis ?? [0, 0, 1]); const base = cyl?.base ?? [0, 0, 0];
      for (const i of nodes) {
        const rel = sub(mesh.nodes[i], base);
        const radial = unit(sub(rel, mul(axis, dot(rel, axis))));
        addSpring(i, scaleM(outer(radial, radial), big));
        if (c.params.axialFixed) addSpring(i, scaleM(outer(axis, axis), big));
      }
    }
    for (const c of [...of('tie'), ...of('contact')]) {
      // Each node of the first faces to the nearest node of the second (both directions held for a tie, the normal for contact).
      const A = nodesOf(quadsFor(c)); const Bn = nodesOf(quadsFor(c, 'faces2'));
      const nrm = unit(quadsFor(c).reduce((s, q) => add(s, q.normal), [0, 0, 0]));
      for (const i of A) {
        let best = null;
        for (const j of Bn) { const d = len(sub(mesh.nodes[i], mesh.nodes[j])); if (!best || d < best.d) best = { j, d }; }
        if (!best || best.d > num(c.params.tolerance, mesh.h * 2) || best.j === i) continue;
        links.push({ i, j: best.j, M: c.type === 'tie' ? scaleM(I3, big) : scaleM(outer(nrm, nrm), num(c.params.stiffness, big)) });
      }
    }
    // Thermal strain: α (T − T₀) per element, loading the bricks like an initial strain.
    let thermal = null;
    if (temperature && m.alpha) {
      const T0 = num(of('initialTemperature')[0]?.params.value, 293.15);
      thermal = mesh.elements.map((el) => m.alpha * (el.reduce((s, i) => s + temperature[i], 0) / 8 - T0));
      const D = elasticity(E, m.nu);
      const gp = 1 / Math.sqrt(3);
      mesh.elements.forEach((el, e) => {
        if (!thermal[e]) return;
        const sig = D.map((row) => (row[0] + row[1] + row[2]) * thermal[e]);
        for (const xi of [-gp, gp]) for (const eta of [-gp, gp]) for (const zeta of [-gp, gp]) {
          const { Bc } = strainRows(xi, eta, zeta, mesh.size);
          for (let aa = 0; aa < 24; aa++) { let s = 0; for (let k = 0; k < 6; k++) s += Bc[k][aa] * sig[k]; f[3 * el[Math.floor(aa / 3)] + (aa % 3)] += s * (vol / 8); }
        }
      });
    }
    if (!held.some(Boolean) && !springs.size) return { ok: false, error: 'noSupport', mesh };
    for (const [dof] of prescribed) held[dof] = 1;
    // Non-linear (elastic – perfectly plastic, with hardening): secant stiffness until the stresses settle.
    const nonlinear = m.kind === 'nonlinear' || a.equations.includes('deformation');
    let scale = null;
    let run = null;
    let stresses = null;
    for (let pass = 0; pass < (nonlinear ? 8 : 1); pass++) {
      run = elasticSolve(mesh, { E, nu: m.nu, scale, held, prescribed, f, springs, links });
      stresses = elementStresses(mesh, run.u, { E, nu: m.nu, scale, thermal });
      if (!nonlinear || m.kind !== 'nonlinear') break;
      const next = stresses.map((s, e) => { const vm = vonMises(s.map((v) => v / (scale ? scale[e] : 1))) ; return vm > m.yield ? Math.max(0.01, (m.yield + m.hardening * (vm - m.yield) / E) / vm) : 1; });
      if (scale && next.every((v, e) => Math.abs(v - scale[e]) < 1e-3)) break;
      scale = next;
    }
    const u = run.u;
    const disp = mesh.nodes.map((_, i) => [u[3 * i], u[3 * i + 1], u[3 * i + 2]]);
    fields.displacement = { at: 'node', vectors: disp, values: disp.map(len), unit: 'mm' };
    fields.vm = { at: 'element', values: stresses.map(vonMises), unit: 'MPa' };
    fields.sxx = { at: 'element', values: stresses.map((s) => s[0]), unit: 'MPa' };
    fields.syy = { at: 'element', values: stresses.map((s) => s[1]), unit: 'MPa' };
    fields.szz = { at: 'element', values: stresses.map((s) => s[2]), unit: 'MPa' };
    report.stresses = stresses;
    const reaction = [0, 0, 0];
    for (let i = 0; i < n; i++) if (held[i]) reaction[i % 3] += run.residual[i] - f[i];
    report.reaction = reaction;
    report.maxDisplacement = Math.max(...fields.displacement.values);
    report.maxVm = Math.max(...fields.vm.values);
    report.iterations = run.iterations;
    // Section print: the force carried across each section plane (the elements cut by it).
    report.sections = of('sectionPrint').map((c) => {
      const quads = quadsFor(c);
      if (!quads.length) return [0, 0, 0];
      const nrm = unit(quads.reduce((s, q) => add(s, q.normal), [0, 0, 0]));
      const at = quads[0].centre;
      const offset = num(c.params.offset, mesh.h * 2);
      const plane = add(at, mul(nrm, -offset));
      let F = [0, 0, 0];
      mesh.elements.forEach((_, e) => {
        const p = centreOf(e);
        if (Math.abs(dot(sub(p, plane), nrm)) > mesh.h / 2) return;
        const [sx, sy, sz, txy, tyz, txz] = stresses[e];
        const T = [[sx, txy, txz], [txy, sy, tyz], [txz, tyz, sz]].map((row) => dot(row, nrm));
        const area = nrm[0] ? mesh.size[1] * mesh.size[2] : nrm[1] ? mesh.size[0] * mesh.size[2] : mesh.size[0] * mesh.size[1];
        F = add(F, mul(T, area * Math.max(Math.abs(nrm[0]), Math.abs(nrm[1]), Math.abs(nrm[2]))));
      });
      return F;
    });
  }
  return { ok: true, analysis: a, mesh, fields, report };
}

// ───────────────────────── post-processing

/** A field at the nodes (element fields averaged onto their corners). */
export function nodalValues(result, name) {
  const field = result.fields[name];
  if (!field) return null;
  if (field.at === 'node') return field.values;
  const sum = new Float64Array(result.mesh.nodes.length); const count = new Float64Array(result.mesh.nodes.length);
  result.mesh.elements.forEach((el, e) => { for (const i of el) { sum[i] += field.values[e]; count[i]++; } });
  return Array.from(sum, (s, i) => s / (count[i] || 1));
}

/** The value of a nodal field at a point (trilinear inside its brick), or null outside the mesh. */
export function valueAt(result, name, p) {
  const values = nodalValues(result, name);
  const { grid, cellOf, elements } = result.mesh;
  const ci = Math.floor((p[0] - grid.x0) / grid.hx); const cj = Math.floor((p[1] - grid.y0) / grid.hy); const ck = Math.floor((p[2] - grid.z0) / grid.hz);
  const e = cellOf.findIndex(([i, j, k]) => i === Math.min(ci, grid.nx - 1) && j === Math.min(cj, grid.ny - 1) && k === Math.min(ck, grid.nz - 1));
  if (e < 0 || !values) return null;
  const xi = ((p[0] - grid.x0) / grid.hx - cellOf[e][0]) * 2 - 1; const eta = ((p[1] - grid.y0) / grid.hy - cellOf[e][1]) * 2 - 1; const zeta = ((p[2] - grid.z0) / grid.hz - cellOf[e][2]) * 2 - 1;
  return CORNERS.reduce((s, [a, b, c], k) => s + values[elements[e][k]] * ((1 + a * xi) * (1 + b * eta) * (1 + c * zeta)) / 8, 0);
}

/** FEM_PostFilterDataAlongLine: samples of a field along a line. */
export function dataAlongLine(result, name, from, to, count = 50) {
  return Array.from({ length: count + 1 }, (_, i) => { const t = i / count; const p = add(from, mul(sub(to, from), t)); return { t, distance: len(sub(p, from)), value: valueAt(result, name, p) }; }).filter((s) => s.value !== null);
}

/** FEM_PostFilterLinearizedStresses: membrane and bending stress (von Mises of each) through a section line. */
export function linearizedStresses(result, from, to, count = 40) {
  const stresses = result.report.stresses;
  if (!stresses) return null;
  const at = (p) => { const { grid, cellOf } = result.mesh; const ci = Math.floor((p[0] - grid.x0) / grid.hx); const cj = Math.floor((p[1] - grid.y0) / grid.hy); const ck = Math.floor((p[2] - grid.z0) / grid.hz); const e = cellOf.findIndex(([i, j, k]) => i === ci && j === cj && k === ck); return e >= 0 ? stresses[e] : null; };
  const samples = Array.from({ length: count + 1 }, (_, i) => { const t = i / count; return { t, s: at(add(from, mul(sub(to, from), t))) }; }).filter((x) => x.s);
  if (samples.length < 2) return null;
  const L = len(sub(to, from));
  const membrane = [0, 1, 2, 3, 4, 5].map((k) => samples.reduce((s, x) => s + x.s[k], 0) / samples.length);
  const bending = [0, 1, 2, 3, 4, 5].map((k) => (6 / samples.length) * samples.reduce((s, x) => s + x.s[k] * (0.5 - x.t), 0));
  return { membrane: vonMises(membrane), bending: vonMises(bending), total: vonMises(membrane.map((v, k) => v + bending[k])), length: L };
}

/** FEM_PostFilterCalculator: a new nodal field from an expression of others (their names as variables). */
export function calculatorField(result, expression, names) {
  const fieldsAt = names.map((nm) => [nm, nodalValues(result, nm)]).filter(([, v]) => v);
  return result.mesh.nodes.map((_, i) => withVariables(new Map(fieldsAt.map(([nm, v]) => [nm.toLowerCase(), v[i]])), () => evaluate(expression)));
}

/** A point-in-function test (FEM_PostCreateFunctions: plane, sphere, box, cylinder). Negative inside / below. */
export function functionValue(fn, p) {
  const q = fn.params;
  switch (fn.type) {
    case 'plane': return dot(sub(p, vec([q.px, q.py, q.pz])), unit(vec([q.nx, q.ny, q.nz], [0, 0, 1])));
    case 'sphere': return len(sub(p, vec([q.cx, q.cy, q.cz]))) - num(q.r, 10);
    case 'box': return Math.max(...[0, 1, 2].map((k) => Math.abs(p[k] - num([q.cx, q.cy, q.cz][k])) - num([q.sx, q.sy, q.sz][k], 10) / 2));
    case 'cylinder': { const c = vec([q.cx, q.cy, q.cz]); const d = unit(vec([q.ax, q.ay, q.az], [0, 0, 1])); const r = sub(p, c); return len(sub(r, mul(d, dot(r, d)))) - num(q.r, 5); }
    default: return 0;
  }
}

/**
 * Triangles of the surface of a set of elements (the outer faces of the kept
 * ones), each with the value it is coloured by: { tris, values }.
 */
export function surfaceOf(result, keep, valueOfElement, { warp = 0 } = {}) {
  const { mesh } = result;
  const disp = result.fields.displacement?.vectors;
  const pos = (i) => (warp && disp ? add(mesh.nodes[i], mul(disp[i], warp)) : mesh.nodes[i]);
  const FACES = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const seen = new Map();
  mesh.elements.forEach((el, e) => {
    if (!keep(e)) return;
    for (const f of FACES) { const quad = f.map((c) => el[c]); const key = [...quad].sort((x, y) => x - y).join(','); if (seen.has(key)) seen.delete(key); else seen.set(key, { quad, e }); }
  });
  const tris = []; const values = [];
  for (const { quad, e } of seen.values()) {
    const [p0, p1, p2, p3] = quad.map(pos);
    tris.push([p0, p1, p2], [p0, p2, p3]);
    values.push(valueOfElement(e), valueOfElement(e));
  }
  return { tris, values };
}

/** FEM_PostFilterCutFunction / FEM_PostFilterContours: where a nodal function is 0 inside the elements (marching tetrahedra). */
export function isoSurface(result, nodal, level = 0, valueOfElement = () => 0) {
  const { mesh } = result;
  const TETS = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
  const tris = []; const values = [];
  mesh.elements.forEach((el, e) => {
    const corner = el.map((i) => ({ p: mesh.nodes[i], v: nodal[i] - level }));
    for (const tet of TETS) {
      const q = tet.map((t) => corner[t]);
      const inside = q.filter((x) => x.v < 0); const outside = q.filter((x) => x.v >= 0);
      if (!inside.length || !outside.length) continue;
      const cut = (x, y) => add(x.p, mul(sub(y.p, x.p), x.v / (x.v - y.v)));
      if (inside.length === 1) tris.push(outside.map((o) => cut(inside[0], o)));
      else if (inside.length === 3) tris.push(inside.map((i) => cut(outside[0], i)));
      else { const a = cut(inside[0], outside[0]); const b = cut(inside[0], outside[1]); const c = cut(inside[1], outside[0]); const d = cut(inside[1], outside[1]); tris.push([a, b, d], [a, d, c]); values.push(valueOfElement(e)); }
      values.push(valueOfElement(e));
    }
  });
  return { tris, values };
}

/** FEM_PostVisualizationHistogram: counts of a field's values in equal bins. */
export function histogram(values, bins = 10) {
  const lo = Math.min(...values); const hi = Math.max(...values);
  const w = (hi - lo) / bins || 1;
  const counts = new Array(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
  return counts.map((count, i) => ({ from: lo + i * w, to: lo + (i + 1) * w, count }));
}

// ───────────────────────── 1D elements (FEM_ElementFluid1D, FEM_ElementRotation1D)

/**
 * Pipe network flow (laminar, Hagen–Poiseuille): pipes between points with
 * their diameters, pressures fixed at some nodes, a fluid's viscosity.
 * Returns { pressures (by node key), flows (per pipe, mm³/s), nodes }.
 */
export function pipeNetwork(pipes, fixedPressures, viscosity) {
  const key = (p) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
  const ids = new Map();
  const id = (p) => { const k = key(p); if (!ids.has(k)) ids.set(k, ids.size); return ids.get(k); };
  const edges = pipes.map((pp) => ({ a: id(pp.a), b: id(pp.b), g: (Math.PI * pp.d ** 4) / (128 * viscosity * 1e-9 * Math.max(1e-9, Math.hypot(pp.b.x - pp.a.x, pp.b.y - pp.a.y))) }));
  const n = ids.size;
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const b = new Array(n).fill(0);
  for (const e of edges) { A[e.a][e.a] += e.g; A[e.b][e.b] += e.g; A[e.a][e.b] -= e.g; A[e.b][e.a] -= e.g; }
  for (const [p, value] of fixedPressures) { const i = id(p); A[i] = A[i].map((_, j) => (j === i ? 1 : 0)); b[i] = value; }
  // Gaussian elimination.
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-30) continue;
    for (let r = 0; r < n; r++) { if (r === c || !M[r][c]) continue; const k = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j]; }
  }
  const pressure = M.map((row, i) => (Math.abs(row[i]) > 1e-30 ? row[n] / row[i] : 0));
  return { pressures: pressure, flows: edges.map((e) => e.g * (pressure[e.a] - pressure[e.b])), nodes: [...ids.keys()] };
}

// ───────────────────────── solver input decks

const fmtN = (v) => (Math.abs(v) < 1e-12 ? '0' : Number(v.toPrecision(10)).toString());

/** The fixed and loaded nodes of the mesh for the decks: { fixed: [node], forces: Map(node → [fx, fy, fz]) }. */
function deckBoundary(result) {
  const a = result.analysis; const mesh = result.mesh;
  const fixed = new Set();
  for (const c of a.constraints.filter((x) => x.type === 'fixed')) for (const i of nodesOf(quadsOf(mesh, c.faces))) fixed.add(i);
  const forces = new Map();
  for (const c of a.constraints.filter((x) => x.type === 'force')) {
    const quads = quadsOf(mesh, c.faces); const total = quads.reduce((s, q) => s + q.area, 0) || 1;
    for (const q of quads) for (const i of q.nodes) forces.set(i, add(forces.get(i) ?? [0, 0, 0], mul([num(c.params.fx), num(c.params.fy), num(c.params.fz)], q.area / total / 4)));
  }
  return { fixed: [...fixed], forces };
}

/** FEM_SolverMystran: a Nastran bulk-data deck (CHEXA, MAT1, SPC1, FORCE) for MYSTRAN. */
export function toMystran(result, title = 'MyCAD') {
  const m = result.analysis.material; const { fixed, forces } = deckBoundary(result);
  const L = ['ID MYCAD,FEM', 'SOL 1', 'CEND', `TITLE = ${title}`, 'ECHO = NONE', 'DISPLACEMENT(PRINT) = ALL', 'STRESS(PRINT) = ALL', 'SPC = 1', 'LOAD = 2', 'BEGIN BULK'];
  result.mesh.nodes.forEach((p, i) => L.push(`GRID,${i + 1},,${p.map(fmtN).join(',')}`));
  result.mesh.elements.forEach((el, e) => L.push(`CHEXA,${e + 1},1,${el.slice(0, 6).map((i) => i + 1).join(',')},`, `,${el.slice(6).map((i) => i + 1).join(',')}`));
  L.push('PSOLID,1,1', `MAT1,1,${fmtN(m.E)},,${fmtN(m.nu)},${fmtN(m.density * 1e-12)}`);
  for (let i = 0; i < fixed.length; i += 6) L.push(`SPC1,1,123456,${fixed.slice(i, i + 6).map((n) => n + 1).join(',')}`);
  for (const [i, F] of forces) { const mag = len(F); if (mag > 0) L.push(`FORCE,2,${i + 1},,${fmtN(mag)},${F.map((v) => fmtN(v / mag)).join(',')}`); }
  L.push('ENDDATA', '');
  return L.join('\n');
}

/** FEM_SolverZ88: Z88 input files (z88i1.txt structure, z88i2.txt constraints/loads, z88i5.txt, z88man.txt). */
export function toZ88(result) {
  const m = result.analysis.material; const { fixed, forces } = deckBoundary(result);
  const nodes = result.mesh.nodes; const els = result.mesh.elements;
  const i1 = [`3 ${nodes.length} ${els.length} ${nodes.length * 3} 0`];
  nodes.forEach((p, i) => i1.push(`${i + 1} 3 ${p.map(fmtN).join(' ')}`));
  els.forEach((el, e) => { i1.push(`${e + 1} 1`); i1.push(el.map((i) => i + 1).join(' ')); });
  const conditions = [...fixed.flatMap((i) => [1, 2, 3].map((d) => `${i + 1} ${d} 2 0`)), ...[...forces].flatMap(([i, F]) => F.map((v, d) => (v ? `${i + 1} ${d + 1} 1 ${fmtN(v)}` : null)).filter(Boolean))];
  const i2 = [String(conditions.length), ...conditions];
  const mat = ['1', `1 ${els.length} ${fmtN(m.E)} ${fmtN(m.nu)} 2 0`];
  const man = ['DYNAMIC START', 'GLOBAL START', 'IBFLAG 0', 'IPFLAG 0', 'IHFLAG 0', 'GLOBAL END', 'SOLVER START', 'MAXIT 10000', 'EPS 1e-7', 'SOLVER END', 'DYNAMIC END'];
  return [{ name: 'z88i1.txt', data: `${i1.join('\n')}\n` }, { name: 'z88i2.txt', data: `${i2.join('\n')}\n` }, { name: 'z88i5.txt', data: '0\n' }, { name: 'z88mat.txt', data: `${mat.join('\n')}\n` }, { name: 'z88man.txt', data: `${man.join('\n')}\n` }];
}

/** FEM_SolverElmer: an Elmer case (mesh.header / nodes / elements / boundary and case.sif) for the equations. */
export function toElmer(result, title = 'MyCAD') {
  const a = result.analysis; const m = a.material; const mesh = result.mesh;
  const quads = mesh.quads;
  const bcIndex = new Map();
  const bcs = a.constraints.filter((c) => ['fixed', 'displacement', 'force', 'pressure', 'temperature', 'heatflux', 'electrostaticPotential', 'currentDensity', 'flowVelocity'].includes(c.type));
  bcs.forEach((c, k) => { for (const q of quadsOf(mesh, c.faces)) if (!bcIndex.has(q)) bcIndex.set(q, k + 1); });
  const header = `${mesh.nodes.length} ${mesh.elements.length} ${quads.length}\n2\n808 ${mesh.elements.length}\n404 ${quads.length}\n`;
  const nodes = mesh.nodes.map((p, i) => `${i + 1} -1 ${p.map(fmtN).join(' ')}`).join('\n');
  const elements = mesh.elements.map((el, e) => `${e + 1} 1 808 ${el.map((i) => i + 1).join(' ')}`).join('\n');
  const boundary = quads.map((q, k) => `${k + 1} ${bcIndex.get(q) ?? bcs.length + 1} ${q.element + 1} 0 404 ${q.nodes.map((i) => i + 1).join(' ')}`).join('\n');
  const solvers = a.equations.map((eq, k) => {
    const proc = { elasticity: ['StressSolve', 'StressSolver', 'Linear Elasticity'], deformation: ['ElasticSolve', 'ElasticSolver', 'Nonlinear Elasticity'], heat: ['HeatSolve', 'HeatSolver', 'Heat Equation'], electrostatic: ['StatElecSolve', 'StatElecSolver', 'Electrostatics'], electricforce: ['ElectricForce', 'StatElecForce', 'Electric Force'], staticCurrent: ['StatCurrentSolve', 'StatCurrentSolver', 'Static Current Conduction'], flow: ['FlowSolve', 'FlowSolver', 'Navier-Stokes'], flux: ['FluxSolver', 'FluxSolver', 'Flux Solver'], magnetodynamic: ['MagnetoDynamics', 'WhitneyAVSolver', 'MGDynamics'], magnetodynamic2D: ['MagnetoDynamics2D', 'MagnetoDynamics2D', 'MgDyn2D'] }[eq];
    return `Solver ${k + 1}\n  Equation = "${proc[2]}"\n  Procedure = "${proc[0]}" "${proc[1]}"\n  Linear System Solver = Iterative\n  Linear System Iterative Method = BiCGStab\n  Linear System Max Iterations = 5000\n  Linear System Convergence Tolerance = 1.0e-8\nEnd`;
  });
  const bcText = bcs.map((c, k) => {
    const p = c.params; const lines = [`Boundary Condition ${k + 1}`, `  Target Boundaries(1) = ${k + 1}`, `  Name = "${c.type}"`];
    if (c.type === 'fixed') lines.push('  Displacement 1 = 0', '  Displacement 2 = 0', '  Displacement 3 = 0');
    if (c.type === 'displacement') ['ux', 'uy', 'uz'].forEach((key, d) => { if (p[key] !== undefined && p[key] !== '' && p[key] !== null) lines.push(`  Displacement ${d + 1} = ${fmtN(num(p[key]) * 1e-3)}`); });
    if (c.type === 'force') ['fx', 'fy', 'fz'].forEach((key, d) => lines.push(`  Force ${d + 1} = ${fmtN(num(p[key]))}`));
    if (c.type === 'pressure') lines.push(`  Normal Force = ${fmtN(-num(p.pressure) * 1e6)}`);
    if (c.type === 'temperature') lines.push(`  Temperature = ${fmtN(num(p.value))}`);
    if (c.type === 'heatflux') lines.push(p.mode === 'convection' ? `  Heat Transfer Coefficient = ${fmtN(num(p.film))}\n  External Temperature = ${fmtN(num(p.ambient))}` : `  Heat Flux = ${fmtN(num(p.flux))}`);
    if (c.type === 'electrostaticPotential') lines.push(`  Potential = ${fmtN(num(p.value))}`);
    if (c.type === 'currentDensity') lines.push(`  Current Density = ${fmtN(num(p.flux))}`);
    if (c.type === 'flowVelocity') lines.push(`  Velocity 1 = ${fmtN(num(p.velocity) * 1e-3)}`);
    lines.push('End');
    return lines.join('\n');
  });
  const sif = [`Header\n  CHECK KEYWORDS Warn\n  Mesh DB "." "."\n  Results Directory "results"\nEnd`, `! ${title} — written by MyCAD`, `Simulation\n  Coordinate System = Cartesian 3D\n  Simulation Type = Steady state\n  Steady State Max Iterations = 1\n  Coordinate Scaling = 0.001\nEnd`,
    `Constants\n  Permittivity Of Vacuum = ${fmtN(a.eps0)}\nEnd`,
    `Body 1\n  Target Bodies(1) = 1\n  Equation = 1\n  Material = 1\nEnd`,
    `Material 1\n  Name = "${m.name}"\n  Youngs Modulus = ${fmtN(m.E * 1e6)}\n  Poisson Ratio = ${fmtN(m.nu)}\n  Density = ${fmtN(m.density)}\n  Heat Conductivity = ${fmtN(m.k)}\n  Heat Capacity = ${fmtN(m.cp)}\n  Heat Expansion Coefficient = ${fmtN(m.alpha)}\n  Relative Permittivity = ${fmtN(m.eps)}\n  Electric Conductivity = ${fmtN(m.sigma)}\n  Relative Permeability = ${fmtN(m.mu)}\n  Viscosity = ${fmtN(m.viscosity)}\nEnd`,
    `Equation 1\n  Active Solvers(${a.equations.length}) = ${a.equations.map((_, k) => k + 1).join(' ')}\nEnd`, ...solvers, ...bcText, ''].join('\n\n');
  return [{ name: 'mesh.header', data: header }, { name: 'mesh.nodes', data: `${nodes}\n` }, { name: 'mesh.elements', data: `${elements}\n` }, { name: 'mesh.boundary', data: `${boundary}\n` }, { name: 'case.sif', data: sif }, { name: 'ELMERSOLVER_STARTINFO', data: 'case.sif\n1\n' }];
}

/** FEM_SolverCalculiX (the analysis): a CalculiX deck from the analysis mesh (C3D8I), its fixed faces and forces. */
export function toCalculixDeck(result, title = 'MyCAD') {
  const m = result.analysis.material; const { fixed, forces } = deckBoundary(result);
  const L = ['*HEADING', `${title} — MyCAD FEM analysis`, '*NODE, NSET=NALL'];
  result.mesh.nodes.forEach((p, i) => L.push(`${i + 1}, ${p.map(fmtN).join(', ')}`));
  L.push('*ELEMENT, TYPE=C3D8I, ELSET=EALL');
  result.mesh.elements.forEach((el, e) => L.push(`${e + 1}, ${el.map((i) => i + 1).join(', ')}`));
  for (const s of result.analysis.nodeSets) { L.push(`*NSET, NSET=${s.name.replace(/\W+/g, '_')}`); for (let i = 0; i < s.nodes.length; i += 16) L.push(s.nodes.slice(i, i + 16).map((n) => n + 1).join(', ')); }
  for (const s of result.analysis.elementSets) { L.push(`*ELSET, ELSET=${s.name.replace(/\W+/g, '_')}`); for (let i = 0; i < s.elements.length; i += 16) L.push(s.elements.slice(i, i + 16).map((n) => n + 1).join(', ')); }
  L.push('*NSET, NSET=NFIX'); for (let i = 0; i < fixed.length; i += 16) L.push(fixed.slice(i, i + 16).map((n) => n + 1).join(', '));
  L.push('*MATERIAL, NAME=MAT', '*ELASTIC', `${fmtN(m.E)}, ${fmtN(m.nu)}`, '*DENSITY', fmtN(m.density * 1e-12), '*SOLID SECTION, ELSET=EALL, MATERIAL=MAT', '*STEP', '*STATIC', '*BOUNDARY', 'NFIX, 1, 3');
  if (forces.size) { L.push('*CLOAD'); for (const [i, F] of forces) F.forEach((v, d) => { if (v) L.push(`${i + 1}, ${d + 1}, ${fmtN(v)}`); }); }
  L.push('*NODE PRINT, NSET=NALL', 'U', '*EL PRINT, ELSET=EALL', 'S', '*END STEP', '');
  return L.join('\n');
}
