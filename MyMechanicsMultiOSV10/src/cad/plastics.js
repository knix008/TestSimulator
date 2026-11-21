// Injection moulding flow (no DOM): filling a part from its gates with a Hele-Shaw (generalized Newtonian,
// thin-gap) model on a control-volume graph of the cavity, viscosity from a Cross-WLF resin database, a bulk
// melt temperature carried with the flow and lost to the mould, and the results moulders look at: fill time,
// pressure at the end of filling, flow-front temperature, weld lines, air traps, short shots, cooling time,
// sink marks and clamp force.
//
// The cavity becomes a graph of nodes (volume V, wall thickness h, centre) and edges with a geometric
// conductance g, the flow conductance being g / η:
//   midplane (thin, flat parts): an XY grid of columns, h the material length of the column, g = h³ / 12
//     (gap-integrated Hele-Shaw: q = −h³/(12η) ∇p per unit width);
//   3D (other parts): voxels, h the local wall thickness (smallest chord through the voxel), g = Δ · h² / 12
//     (Darcy flow with the permeability h²/12 of the gap, which integrates to the Hele-Shaw flow over a wall
//     several voxels thick).
// Filling: the pressure is solved on the filled nodes (front nodes at p = 0, the flow rate entering at the
// gates) by conjugate gradients; the flow into the front nodes fills them; time steps end when a node fills.
// The flow rate falls when the gate pressure would pass the machine's limit; a front whose melt has cooled
// below the no-flow temperature stops — both can leave a short shot.
import { weldMesh, meshBounds, TriangleGrid } from './cam-geom.js';

/**
 * Resins: Cross-WLF (n, τ* Pa, D1 Pa·s, D2 K, D3 K/Pa, A1, A2 K), melt density kg/m³, solid density, specific
 * heat J/(kg·K), conductivity W/(m·K), and process temperatures °C (melt, mould, ejection, no-flow) and the
 * linear mould shrinkage (%). Representative grade data, not a particular supplier's grade.
 */
export const RESINS = {
  pp: { n: 0.2774, tau: 2.4e4, D1: 1.6e14, D2: 263.15, D3: 0, A1: 29.8, A2: 51.6, rho: 750, rhoSolid: 905, cp: 2800, k: 0.17, melt: 230, mould: 40, eject: 90, noFlow: 130, shrink: 1.5, maxShear: 100000 },
  abs: { n: 0.2911, tau: 3.12e4, D1: 3.9e11, D2: 373.15, D3: 0, A1: 26.8, A2: 51.6, rho: 950, rhoSolid: 1040, cp: 2300, k: 0.18, melt: 240, mould: 60, eject: 95, noFlow: 130, shrink: 0.5, maxShear: 50000 },
  pc: { n: 0.1689, tau: 4e5, D1: 4.6e11, D2: 417.15, D3: 0, A1: 27, A2: 51.6, rho: 1080, rhoSolid: 1200, cp: 2000, k: 0.2, melt: 300, mould: 85, eject: 130, noFlow: 170, shrink: 0.6, maxShear: 40000 },
  pa66: { n: 0.35, tau: 1.5e5, D1: 8e12, D2: 323.15, D3: 0, A1: 30, A2: 51.6, rho: 970, rhoSolid: 1140, cp: 2900, k: 0.23, melt: 290, mould: 80, eject: 160, noFlow: 240, shrink: 1.4, maxShear: 60000 },
  pom: { n: 0.25, tau: 2.4e5, D1: 2e13, D2: 223.15, D3: 0, A1: 30, A2: 51.6, rho: 1150, rhoSolid: 1410, cp: 2500, k: 0.23, melt: 205, mould: 90, eject: 140, noFlow: 150, shrink: 2, maxShear: 40000 },
  hdpe: { n: 0.39, tau: 3e4, D1: 1e15, D2: 153.15, D3: 0, A1: 32, A2: 51.6, rho: 760, rhoSolid: 955, cp: 2900, k: 0.25, melt: 230, mould: 40, eject: 95, noFlow: 120, shrink: 2.5, maxShear: 40000 },
  ps: { n: 0.25, tau: 3e4, D1: 6e10, D2: 373.15, D3: 0, A1: 25, A2: 51.6, rho: 950, rhoSolid: 1050, cp: 2100, k: 0.16, melt: 220, mould: 40, eject: 80, noFlow: 110, shrink: 0.5, maxShear: 40000 },
  pmma: { n: 0.25, tau: 1e5, D1: 4e12, D2: 378.15, D3: 0, A1: 30, A2: 51.6, rho: 1080, rhoSolid: 1180, cp: 2200, k: 0.19, melt: 250, mould: 60, eject: 90, noFlow: 135, shrink: 0.5, maxShear: 40000 },
  pbt: { n: 0.3, tau: 1.5e5, D1: 5e12, D2: 323.15, D3: 0, A1: 30, A2: 51.6, rho: 1100, rhoSolid: 1310, cp: 2000, k: 0.21, melt: 250, mould: 70, eject: 140, noFlow: 200, shrink: 1.7, maxShear: 50000 },
  pcabs: { n: 0.25, tau: 1e5, D1: 5e11, D2: 393.15, D3: 0, A1: 27, A2: 51.6, rho: 1050, rhoSolid: 1150, cp: 2100, k: 0.19, melt: 265, mould: 75, eject: 110, noFlow: 150, shrink: 0.6, maxShear: 40000 },
};
export const RESIN_IDS = Object.keys(RESINS);
/** The resin for an app material id (cad/materials.js) when there is one. */
export const resinOf = (id) => ({ abs: 'abs', pc: 'pc', nylon: 'pa66', pom: 'pom' }[id] ?? null);

/** Cross-WLF viscosity (Pa·s) at T (°C), shear rate (1/s) and pressure (Pa). `newtonian` resins: { eta }. */
export function viscosity(resin, T, shear, p = 0) {
  if (resin.newtonian) return resin.eta;
  const Tk = T + 273.15;
  const Ts = resin.D2 + (resin.D3 ?? 0) * p;
  const A2 = resin.A2 + (resin.D3 ?? 0) * p;
  const d = A2 + Tk - Ts;
  const eta0 = d > 1e-6 ? resin.D1 * Math.exp((-resin.A1 * (Tk - Ts)) / d) : 1e12;
  return eta0 / (1 + (eta0 * Math.max(0, shear) / resin.tau) ** (1 - resin.n));
}

export const PROCESS_DEFAULTS = { melt: null, mould: null, fillTime: 0, maxPressure: 180, switchover: 99, packFactor: 0.8 };

// ───────────────────────── domains

/** A domain from explicit nodes: { nodes: [{ c: [x,y,z], V, h, boundary }], edges: [[i, j, g]], kind, cell }. */
function finishDomain(d) {
  const n = d.nodes.length;
  const adj = Array.from({ length: n }, () => []);
  d.edges.forEach(([i, j], e) => { adj[i].push(e); adj[j].push(e); });
  d.adj = adj;
  d.ea = Int32Array.from(d.edges, (e) => e[0]); d.eb = Int32Array.from(d.edges, (e) => e[1]);
  d.volume = d.nodes.reduce((s, x) => s + x.V, 0);
  return d;
}

/** A flat plate on a grid (for checks): nx × ny cells of size Δ, thickness h(x, y) (0 = no cavity there). */
export function plateDomain(nx, ny, cell, h = () => 2) {
  const index = new Int32Array(nx * ny).fill(-1);
  const nodes = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = (i + 0.5) * cell; const y = (j + 0.5) * cell; const hh = h(x, y);
    if (hh > 0) { index[j * nx + i] = nodes.length; nodes.push({ c: [x, y, hh / 2], V: hh * cell * cell, h: hh, ij: [i, j] }); }
  }
  return gridEdges({ kind: 'midplane', cell, nx, ny, index, nodes, lo: [0, 0, 0], hx: cell, hy: cell, partingZ: Infinity });
}

function gridEdges(d) {
  const { nx, ny, index, nodes } = d;
  const edges = [];
  const g = (a, b) => 2 / (1 / a.h ** 3 + 1 / b.h ** 3) / 12; // harmonic mean of h³: the thin side limits
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = index[j * nx + i]; if (a < 0) continue;
    let neighbours = 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di; const jj = j + dj;
      const b = ii >= 0 && jj >= 0 && ii < nx && jj < ny ? index[jj * nx + ii] : -1;
      if (b >= 0) { neighbours++; if (di + dj > 0) edges.push([a, b, g(nodes[a], nodes[b])]); }
    }
    nodes[a].boundary = neighbours < 4;
  }
  d.edges = edges;
  return finishDomain(d);
}

/** Crossings of the vertical line at (x, y) with the mesh: material intervals [[z0, z1]] from the bottom up. */
function columnIntervals(grid, x, y) {
  const hits = [];
  const V = grid.V; const T = grid.T;
  grid.each(x, y, x, y, (t) => {
    const a = 3 * T[3 * t]; const b = 3 * T[3 * t + 1]; const c = 3 * T[3 * t + 2];
    const d = (V[b + 1] - V[c + 1]) * (V[a] - V[c]) + (V[c] - V[b]) * (V[a + 1] - V[c + 1]);
    if (Math.abs(d) < 1e-14) return true;
    const l1 = ((V[b + 1] - V[c + 1]) * (x - V[c]) + (V[c] - V[b]) * (y - V[c + 1])) / d;
    const l2 = ((V[c + 1] - V[a + 1]) * (x - V[c]) + (V[a] - V[c]) * (y - V[c + 1])) / d;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-12 || l2 < -1e-12 || l3 < -1e-12) return true;
    hits.push({ z: l1 * V[a + 2] + l2 * V[b + 2] + l3 * V[c + 2], up: d > 0 });
    return true;
  });
  hits.sort((p, q) => p.z - q.z);
  // Merge duplicates (a crossing on an edge shared by two triangles) and pair entry / exit.
  const zs = [];
  for (const h of hits) { const last = zs.at(-1); if (last && Math.abs(last.z - h.z) < 1e-7 && last.up === h.up) continue; zs.push(h); }
  const out = []; let depth = 0; let start = 0;
  for (const h of zs) {
    // Entering material through a down-facing triangle (normal −Z), leaving through an up-facing one.
    if (!h.up) { if (depth++ === 0) start = h.z; } else if (depth > 0 && --depth === 0) out.push([start, h.z]);
  }
  return out;
}

/**
 * The cavity of a part mesh as a domain: 'midplane' for thin flat parts (the part's height under 15 % of its
 * smaller plan size), else '3d' voxels. `cells`: grid cells along the longest side.
 */
export function partDomain(mesh, { cells = 60, mode = 'auto' } = {}) {
  const welded = weldMesh(mesh);
  const { lo, hi } = meshBounds(welded);
  const grid = new TriangleGrid(welded);
  const sx = hi[0] - lo[0]; const sy = hi[1] - lo[1]; const sz = hi[2] - lo[2];
  const flat = sz <= 0.15 * Math.min(sx, sy);
  const kind = mode === 'auto' ? (flat ? 'midplane' : '3d') : mode;
  const cell = Math.max(sx, sy, kind === '3d' ? sz : 0) / cells;
  const nx = Math.max(1, Math.round(sx / cell)); const ny = Math.max(1, Math.round(sy / cell));
  const hx = sx / nx; const hy = sy / ny;
  if (kind === 'midplane') {
    const index = new Int32Array(nx * ny).fill(-1);
    const nodes = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = lo[0] + (i + 0.5) * hx; const y = lo[1] + (j + 0.5) * hy;
      const iv = columnIntervals(grid, x, y);
      const h = iv.reduce((s, [a, b]) => s + (b - a), 0);
      if (h > 1e-6) { index[j * nx + i] = nodes.length; nodes.push({ c: [x, y, (iv[0][0] + iv.at(-1)[1]) / 2], V: h * hx * hy, h, ij: [i, j] }); }
    }
    const d = gridEdges({ kind, cell: Math.sqrt(hx * hy), nx, ny, index, nodes, lo, hx, hy });
    d.partingZ = hi[2];
    return d;
  }
  // Voxels: a cell's centre inside a column interval is cavity.
  const nz = Math.max(1, Math.round(sz / cell)); const hz = sz / nz;
  const solid = new Uint8Array(nx * ny * nz); const chordZ = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => (k * ny + j) * nx + i;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = lo[0] + (i + 0.5) * hx; const y = lo[1] + (j + 0.5) * hy;
    for (const [a, b] of columnIntervals(grid, x, y)) {
      for (let k = Math.max(0, Math.floor((a - lo[2]) / hz)); k < nz && lo[2] + k * hz < b; k++) {
        const zc = lo[2] + (k + 0.5) * hz;
        if (zc >= a && zc <= b) { solid[id(i, j, k)] = 1; chordZ[id(i, j, k)] = b - a; }
      }
    }
  }
  // A wall thinner than a voxel still gets one voxel (its chord in Z keeps the true thickness there).
  const run = (i, j, k, di, dj, dk) => { let n = 0; for (let s = -1; s <= 1; s += 2) { let a = i + s * di; let b = j + s * dj; let c = k + s * dk; while (a >= 0 && b >= 0 && c >= 0 && a < nx && b < ny && c < nz && solid[id(a, b, c)]) { n++; a += s * di; b += s * dj; c += s * dk; } } return n + 1; };
  const index = new Int32Array(nx * ny * nz).fill(-1);
  const nodes = [];
  const vol = hx * hy * hz;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const q = id(i, j, k);
    if (!solid[q]) continue;
    const h = Math.min(chordZ[q], run(i, j, k, 1, 0, 0) * hx, run(i, j, k, 0, 1, 0) * hy);
    index[q] = nodes.length;
    nodes.push({ c: [lo[0] + (i + 0.5) * hx, lo[1] + (j + 0.5) * hy, lo[2] + (k + 0.5) * hz], V: vol, h: Math.max(h, 1e-3), ijk: [i, j, k] });
  }
  const edges = [];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = index[id(i, j, k)]; if (a < 0) continue;
    let neighbours = 0;
    for (const [di, dj, dk, A, L] of [[1, 0, 0, hy * hz, hx], [0, 1, 0, hx * hz, hy], [0, 0, 1, hx * hy, hz], [-1, 0, 0, 0, 0], [0, -1, 0, 0, 0], [0, 0, -1, 0, 0]]) {
      const ii = i + di; const jj = j + dj; const kk = k + dk;
      const b = ii >= 0 && jj >= 0 && kk >= 0 && ii < nx && jj < ny && kk < nz ? index[id(ii, jj, kk)] : -1;
      if (b < 0) continue;
      neighbours++;
      if (A > 0) { const hh = 2 / (1 / nodes[a].h ** 2 + 1 / nodes[b].h ** 2); edges.push([a, b, (A * hh) / (12 * L)]); }
    }
    nodes[a].boundary = neighbours < 6;
  }
  const d = finishDomain({ kind, cell, nx, ny, nz, index, nodes, edges, lo, hx, hy, hz });
  d.partingZ = hi[2];
  return d;
}

/** The node nearest a point. */
export function nearestNode(domain, p) {
  let best = 0; let bd = Infinity;
  domain.nodes.forEach((n, i) => { const d = (n.c[0] - p[0]) ** 2 + (n.c[1] - p[1]) ** 2 + (domain.kind === 'midplane' ? 0 : (n.c[2] - p[2]) ** 2); if (d < bd) { bd = d; best = i; } });
  return best;
}

/** Graph distances (edge count) from a node. */
function hops(domain, from) {
  const dist = new Int32Array(domain.nodes.length).fill(-1);
  const queue = [from]; dist[from] = 0;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    for (const e of domain.adj[i]) { const [a, b] = domain.edges[e]; const j = a === i ? b : a; if (dist[j] < 0) { dist[j] = dist[i] + 1; queue.push(j); } }
  }
  return dist;
}

/**
 * A gate that balances the flow lengths: the node whose farthest flow length to the cavity's extremities
 * (found by farthest-point sampling over the graph) is shortest; ties go to the smaller total.
 */
export function suggestGate(domain, samples = 8) {
  const n = domain.nodes.length;
  if (!n) return 0;
  const far = (d) => { let bi = 0; for (let i = 0; i < d.length; i++) if (d[i] > d[bi]) bi = i; return bi; };
  const dists = [];
  const minD = new Float64Array(n).fill(Infinity);
  let pick = far(hops(domain, 0));
  for (let k = 0; k < samples; k++) {
    const d = hops(domain, pick); dists.push(d);
    for (let i = 0; i < n; i++) if (d[i] >= 0) minD[i] = Math.min(minD[i], d[i]);
    let bi = 0; for (let i = 0; i < n; i++) if (minD[i] > minD[bi] && Number.isFinite(minD[i])) bi = i;
    if (minD[bi] === 0) break;
    pick = bi;
  }
  let best = 0; let bv = Infinity;
  for (let i = 0; i < n; i++) {
    let mx = 0; let sum = 0;
    for (const d of dists) { if (d[i] < 0) { mx = Infinity; break; } mx = Math.max(mx, d[i]); sum += d[i]; }
    const v = mx + sum * 1e-6;
    if (v < bv) { bv = v; best = i; }
  }
  return best;
}

// ───────────────────────── filling

/** Jacobi-preconditioned conjugate gradients on the filled nodes (matrix-free). Returns iterations. */
function solvePressure(domain, G, filled, rhs, p, { tol = 1e-7, maxIter = 3000 } = {}) {
  const n = domain.nodes.length; const EA = domain.ea; const EB = domain.eb; const m = EA.length;
  const diag = new Float64Array(n);
  for (let e = 0; e < m; e++) { const g = G[e]; if (g === 0) continue; diag[EA[e]] += g; diag[EB[e]] += g; }
  // Unknowns: the filled nodes; the others are held at 0 (their rows are not used).
  const act = []; for (let i = 0; i < n; i++) if (filled[i]) act.push(i); else p[i] = 0;
  const apply = (x, out) => {
    for (const i of act) out[i] = 0;
    for (let e = 0; e < m; e++) {
      const g = G[e]; if (g === 0) continue;
      const a = EA[e]; const b = EB[e];
      const xa = filled[a] ? x[a] : 0; const xb = filled[b] ? x[b] : 0;
      const f = g * (xa - xb);
      if (filled[a]) out[a] += f;
      if (filled[b]) out[b] -= f;
    }
  };
  const r = new Float64Array(n); const z = new Float64Array(n); const d = new Float64Array(n); const q = new Float64Array(n);
  apply(p, q);
  let bnorm = 0;
  for (const i of act) { r[i] = rhs[i] - q[i]; bnorm += rhs[i] * rhs[i]; }
  bnorm = Math.sqrt(bnorm) || 1;
  let rz = 0;
  for (const i of act) { z[i] = diag[i] > 0 ? r[i] / diag[i] : r[i]; d[i] = z[i]; rz += r[i] * z[i]; }
  let it = 0;
  for (; it < maxIter; it++) {
    let rn = 0; for (const i of act) rn += r[i] * r[i];
    if (Math.sqrt(rn) <= tol * bnorm) break;
    apply(d, q);
    let dq = 0; for (const i of act) dq += d[i] * q[i];
    if (!(dq > 0)) break;
    const alpha = rz / dq;
    let rz2 = 0;
    for (const i of act) { p[i] += alpha * d[i]; r[i] -= alpha * q[i]; z[i] = diag[i] > 0 ? r[i] / diag[i] : r[i]; rz2 += r[i] * z[i]; }
    const beta = rz2 / rz; rz = rz2;
    for (const i of act) d[i] = z[i] + beta * d[i];
  }
  return it;
}

/**
 * Fills the domain from the gate nodes. Units: lengths mm in the domain, results in SI-friendly units (s, MPa,
 * °C, kN). options: { resin (RESINS entry or id), melt, mould (°C), fillTime (s; 0 = from the volume),
 * maxPressure (MPa), maxSteps }. Returns per-node fillTime, pressure (MPa, end of fill), temperature (°C, when
 * the front got there), plus the summary (see `summary`).
 */
export function fillSimulation(domain, { gates = [], resin: resinIn = 'abs', melt = null, mould = null, fillTime = 0, maxPressure = 180, maxSteps = 4000, onProgress = null } = {}) {
  const resin = typeof resinIn === 'string' ? RESINS[resinIn] : resinIn;
  const Tm = melt ?? resin.melt ?? 230; const Tw = mould ?? resin.mould ?? 50;
  const nodes = domain.nodes; const E = domain.edges; const n = nodes.length;
  if (!n || !gates.length) throw Object.assign(new Error('no cavity or gate'), { code: 'noGate' });
  // SI inside: m, m³, Pa, s.
  const mm = 1e-3;
  const Vtot = domain.volume * mm ** 3;
  const tFill = fillTime > 0 ? fillTime : Math.max(0.2, Math.min(5, (Vtot * 1e6) ** (1 / 3) * 0.25)); // ~ 1 s for 60 cm³
  const Q0 = Vtot / tFill;
  const geo = Float64Array.from(E, (e) => e[2] * (domain.kind === 'midplane' ? mm ** 3 : mm ** 3)); // g in m³ (h³ or Δ·h²)
  const V = Float64Array.from(nodes, (x) => x.V * mm ** 3);
  const H = Float64Array.from(nodes, (x) => x.h * mm);
  const alpha = (resin.k ?? 0.2) / ((resin.rho ?? 1000) * (resin.cp ?? 2000));
  const f = new Float64Array(n); const filled = new Uint8Array(n); const frozen = new Uint8Array(n);
  const tF = new Float64Array(n).fill(Infinity); const T = new Float64Array(n).fill(Tm); const Tfront = new Float64Array(n).fill(NaN);
  const shear = new Float64Array(n); const eta = new Float64Array(n).fill(viscosity(resin, Tm, 1000));
  const p = new Float64Array(n); const rhs = new Float64Array(n); const G = new Float64Array(E.length);
  const inflow = new Float64Array(n); const from = new Int32Array(n).fill(-1);
  const gateSet = new Set(gates);
  let t = 0; let Q = Q0; let filledVol = 0; let steps = 0; let shortShot = false; let reason = null;
  let pGate = 0; const history = [];
  // The gate nodes fill first.
  for (const g of gates) { filled[g] = 1; f[g] = 1; tF[g] = 0; Tfront[g] = Tm; filledVol += V[g]; }
  const flux = new Float64Array(E.length);
  while (filledVol < Vtot * (1 - 1e-9) && steps < maxSteps) {
    steps++;
    // Conductances with the viscosity of the upstream (filled) side.
    const EA = domain.ea; const EB = domain.eb;
    for (let e = 0; e < E.length; e++) {
      const a = EA[e]; const b = EB[e];
      if (!filled[a] && !filled[b]) { G[e] = 0; continue; }
      if (frozen[a] || frozen[b]) { G[e] = 0; continue; }
      const et = filled[a] && filled[b] ? (eta[a] + eta[b]) / 2 : eta[filled[a] ? a : b];
      G[e] = geo[e] / et;
    }
    rhs.fill(0);
    for (const g of gates) rhs[g] = Q / gates.length;
    solvePressure(domain, G, filled, rhs, p);
    pGate = gates.reduce((m, g) => Math.max(m, p[g]), 0);
    // Pressure limited: the same flow pattern at a lower rate.
    if (pGate > maxPressure * 1e6) {
      const k = (maxPressure * 1e6) / pGate;
      Q *= k; for (let i = 0; i < n; i++) p[i] *= k; pGate = maxPressure * 1e6;
    }
    // Flow into the front.
    inflow.fill(0);
    let frontQ = 0;
    for (let e = 0; e < E.length; e++) {
      const a = EA[e]; const b = EB[e];
      const q = G[e] * ((filled[a] ? p[a] : 0) - (filled[b] ? p[b] : 0));
      flux[e] = q;
      if (filled[a] && !filled[b] && q > 0) { inflow[b] += q; frontQ += q; if (from[b] < 0 || q > 0) from[b] = from[b] < 0 ? a : from[b]; }
      else if (filled[b] && !filled[a] && q < 0) { inflow[a] -= q; frontQ -= q; if (from[a] < 0) from[a] = b; }
    }
    if (!(frontQ > Q0 * 1e-6)) { shortShot = true; reason = frozen.some((x) => x) ? 'frozen' : 'pressure'; break; }
    // Step to the next node that fills (at least a small fraction of the shot, so big parts do not crawl).
    let dt = Infinity;
    for (let i = 0; i < n; i++) if (!filled[i] && inflow[i] > 0) dt = Math.min(dt, ((1 - f[i]) * V[i]) / inflow[i]);
    dt = Math.max(dt, Math.min(Vtot / Q0 / 250, Vtot / frontQ / 250));
    // Melt temperature: carried in with the flow, lost to the mould across the gap, raised by shear heating.
    for (let i = 0; i < n; i++) {
      if (!filled[i] || frozen[i]) continue;
      let qin = 0; let Tin = 0; let sh = 0;
      for (const e of domain.adj[i]) {
        const a = EA[e]; const j = a === i ? EB[e] : a; const q = a === i ? -flux[e] : flux[e]; // > 0 into i
        if (q > 0 && filled[j]) { qin += q; Tin += q * T[j]; }
        sh += Math.abs(flux[e]);
      }
      if (gateSet.has(i)) { qin += Q / gates.length; Tin += (Q / gates.length) * Tm; }
      // Shear rate at the wall from the mean velocity through the node: 6 ū / h.
      const width = domain.kind === 'midplane' ? domain.cell * mm : (domain.cell * mm) ** 2 / H[i];
      shear[i] = Math.min(1e6, (6 * (sh / 2)) / (width * H[i] * H[i]) * (domain.kind === 'midplane' ? 1 : 1));
      const a = qin / V[i]; const b = (Math.PI ** 2 * alpha) / (H[i] * H[i]);
      const heat = (eta[i] * shear[i] * shear[i]) / ((resin.rho ?? 1000) * (resin.cp ?? 2000)) / 3;
      const Teq = (a * (qin > 0 ? Tin / qin : T[i]) + b * Tw + heat) / Math.max(1e-12, a + b);
      T[i] = Teq + (T[i] - Teq) * Math.exp(-(a + b) * dt);
      eta[i] = viscosity(resin, T[i], shear[i]);
    }
    // Advance the front.
    t += dt;
    for (let i = 0; i < n; i++) {
      if (filled[i] || !(inflow[i] > 0)) continue;
      // The melt arriving here: the upstream node's temperature; below the no-flow temperature the front stops.
      const up = from[i] >= 0 ? T[from[i]] : Tm;
      if (up < (resin.noFlow ?? -Infinity)) { frozen[i] = 1; continue; }
      const before = f[i];
      f[i] += (inflow[i] * dt) / V[i];
      // Fill time: when the front passed the node's centre (half its volume in), linear within the step.
      if (before < 0.5 && f[i] >= 0.5) tF[i] = t - dt + ((0.5 - before) * V[i]) / Math.max(1e-30, inflow[i]);
      if (f[i] >= 1 - 1e-9) {
        // Filled within this step: the overflow is handed to its empty neighbours.
        const over = (f[i] - 1) * V[i];
        f[i] = 1; filled[i] = 1; filledVol += V[i]; Tfront[i] = up; T[i] = up; eta[i] = viscosity(resin, up, shear[from[i]] || 1000);
        const empty = domain.adj[i].map((e) => (E[e][0] === i ? E[e][1] : E[e][0])).filter((j) => !filled[j] && !frozen[j]);
        if (over > 0 && empty.length) for (const j of empty) { f[j] += over / empty.length / V[j]; if (from[j] < 0) from[j] = i; }
      }
    }
    // Overflow can complete neighbours (and take them past half full).
    for (let i = 0; i < n; i++) if (!Number.isFinite(tF[i]) && f[i] >= 0.5) tF[i] = t;
    for (let i = 0; i < n; i++) if (!filled[i] && f[i] >= 1 - 1e-9) { f[i] = 1; filled[i] = 1; filledVol += V[i]; if (!Number.isFinite(tF[i])) tF[i] = t; const up = from[i] >= 0 ? T[from[i]] : Tm; Tfront[i] = up; T[i] = up; }
    history.push({ t, pGate: pGate / 1e6, filled: filledVol / Vtot, Q });
    if (onProgress && steps % 20 === 0) onProgress(filledVol / Vtot);
    if (Q < Q0 * 1e-4) { shortShot = true; reason = 'pressure'; break; }
  }
  if (filledVol < Vtot * (1 - 1e-6)) { shortShot = true; reason ??= 'steps'; }
  return analyse(domain, { resin, Tm, Tw, tF, p, T: Tfront, filled, frozen, shortShot, reason, history, Q0, tFill, pGate, steps, maxPressure });
}

/** Results: weld lines, air traps, cooling, sink, clamp force. */
function analyse(domain, r) {
  const { nodes, edges: E, adj } = domain;
  const n = nodes.length;
  const pressure = Float64Array.from(r.p, (x) => x / 1e6);
  const fillT = r.tF;
  // Flow direction at each node: from the neighbours that filled before it.
  const dir = nodes.map((nd, i) => {
    const v = [0, 0, 0];
    for (const e of adj[i]) { const [a, b] = E[e]; const j = a === i ? b : a; if (fillT[j] < fillT[i]) for (let k = 0; k < 3; k++) v[k] += nd.c[k] - nodes[j].c[k]; }
    const l = Math.hypot(...v); return l > 0 ? v.map((x) => x / l) : v;
  });
  // Weld lines: neighbours whose fronts met head on.
  const weld = new Uint8Array(n);
  for (const [a, b] of E) {
    if (!Number.isFinite(fillT[a]) || !Number.isFinite(fillT[b])) continue;
    const d = dir[a][0] * dir[b][0] + dir[a][1] * dir[b][1] + dir[a][2] * dir[b][2];
    if (d < -0.5) { weld[a] = 1; weld[b] = 1; }
  }
  // Air traps: last to fill locally (every neighbour filled earlier) away from the vents at the parting line.
  const vented = (i) => nodes[i].boundary && (domain.kind === 'midplane' || Math.abs(nodes[i].c[2] - domain.partingZ) <= (domain.hz ?? domain.cell) * 1.01);
  const trap = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(fillT[i]) || vented(i)) continue;
    let last = true;
    for (const e of adj[i]) { const [a, b] = E[e]; const j = a === i ? b : a; if (!(fillT[j] < fillT[i])) { last = false; break; } }
    if (last && adj[i].length) trap[i] = 1;
  }
  // Wall thickness: nominal = median, the thickest for cooling.
  const hs = nodes.map((x) => x.h).sort((a, b) => a - b);
  const hNom = hs[Math.floor(hs.length / 2)] ?? 0; const hMax = hs[Math.floor(hs.length * 0.98)] ?? hNom;
  const resin = r.resin;
  const alpha = (resin.k ?? 0.2) / ((resin.rho ?? 1000) * (resin.cp ?? 2000));
  const coolTime = (h) => { const hm = h * 1e-3; const ratio = (4 / Math.PI) * ((r.Tm - r.Tw) / Math.max(1, (resin.eject ?? r.Tw + 30) - r.Tw)); return ratio > 1 ? ((hm * hm) / (Math.PI ** 2 * alpha)) * Math.log(ratio) : 0; };
  // Sink: thick spots against the nominal wall; depth from the volumetric shrinkage the packing cannot make up.
  const sv = 3 * ((resin.shrink ?? 1) / 100);
  const sink = new Float64Array(n);
  let sinkMax = 0;
  for (let i = 0; i < n; i++) {
    const h = nodes[i].h;
    if (h > hNom * 1.25) { sink[i] = sv * (h - hNom) * 0.5; sinkMax = Math.max(sinkMax, sink[i]); } // half the shrinkage of the extra wall is not packed out
  }
  // Clamp force: pressure over the projected area (one value per XY column).
  const cols = new Map();
  const cellArea = domain.kind === 'midplane' ? (domain.hx ?? domain.cell) * (domain.hy ?? domain.cell) : domain.hx * domain.hy;
  nodes.forEach((nd, i) => { const k = nd.ij ? `${nd.ij[0]},${nd.ij[1]}` : `${nd.ijk[0]},${nd.ijk[1]}`; cols.set(k, Math.max(cols.get(k) ?? 0, Number.isFinite(fillT[i]) ? pressure[i] : 0)); });
  let clamp = 0; for (const pv of cols.values()) clamp += pv * cellArea; // MPa · mm² = N
  const filledCount = r.filled.reduce((s, x) => s + x, 0);
  let endTime = 0; let tMin = Infinity; let tMax = -Infinity;
  for (const v of fillT) if (Number.isFinite(v) && v > endTime) endTime = v;
  for (const v of r.T) if (Number.isFinite(v)) { tMin = Math.min(tMin, v); tMax = Math.max(tMax, v); }
  const cooling = coolTime(hMax);
  return {
    kind: domain.kind, nodes: n, fillTime: fillT, pressure, temperature: r.T, weld, trap, sink, frozen: r.frozen, filled: r.filled,
    summary: {
      fillTime: endTime, injectionTime: r.tFill, maxPressure: pressure.reduce((m, v) => Math.max(m, v), 0), gatePressure: r.pGate / 1e6, pressureLimited: r.pGate / 1e6 >= r.maxPressure * 0.999,
      shortShot: r.shortShot, reason: r.shortShot ? r.reason : null, filledFraction: filledCount / n,
      weldNodes: weld.reduce((s, x) => s + x, 0), airTraps: trap.reduce((s, x) => s + x, 0),
      frontTempMin: tMin, frontTempMax: tMax, nominalWall: hNom, maxWall: hMax, coolingTime: cooling, cycleTime: endTime + cooling + 4,
      sinkMax, sinkNodes: sink.reduce((s, x) => s + (x > 0.005 ? 1 : 0), 0),
      clampForce: clamp / 1000, clampTonnes: clamp / 9806.65, volume: domain.volume / 1000, mass: (domain.volume * 1e-9) * (resin.rhoSolid ?? 1000) * 1000,
      flowRate: (r.Q0 * 1e6), steps: r.steps, melt: r.Tm, mould: r.Tw,
    },
    history: r.history,
  };
}

/** Value → colour, blue (low) to red (high) through green and yellow. */
export function rampColour(t) {
  const x = Math.max(0, Math.min(1, t));
  const stops = [[0.15, 0.3, 0.95], [0.1, 0.8, 0.9], [0.25, 0.8, 0.3], [0.95, 0.85, 0.15], [0.9, 0.2, 0.15]];
  const s = x * (stops.length - 1); const i = Math.min(stops.length - 2, Math.floor(s)); const f = s - i;
  return stops[i].map((v, k) => v + (stops[i + 1][k] - v) * f);
}

/**
 * Per-vertex colours of a part mesh for a node result: the node of each vertex (its column / voxel, or the
 * nearest one around). quantity: 'fillTime' | 'pressure' | 'temperature' | 'weld' | 'trap' | 'sink'.
 */
export function resultColours(mesh, domain, result, quantity = 'fillTime') {
  const V = mesh.vertices; const out = new Float32Array(V.length);
  const values = result[quantity];
  let lo = Infinity; let hi = -Infinity;
  for (const v of values) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
  const flags = quantity === 'weld' || quantity === 'trap';
  for (let v = 0; v < V.length / 3; v++) {
    const i = nodeAt(domain, [V[3 * v], V[3 * v + 1], V[3 * v + 2]]);
    let c;
    if (i < 0) c = [0.6, 0.6, 0.6];
    else if (!Number.isFinite(values[i])) c = [0.45, 0.45, 0.45]; // not filled (short shot)
    else if (flags) c = values[i] ? (quantity === 'weld' ? [0.85, 0.1, 0.6] : [0.95, 0.4, 0.05]) : [0.75, 0.78, 0.82];
    else c = rampColour((values[i] - lo) / (hi - lo || 1));
    out.set(c, 3 * v);
  }
  return { colors: out, min: lo, max: hi };
}

/** The node at a point (the cell / voxel containing it, else the nearest filled neighbour cell), or −1. */
export function nodeAt(domain, p) {
  if (domain.kind === 'midplane') {
    const i = Math.max(0, Math.min(domain.nx - 1, Math.floor((p[0] - domain.lo[0]) / domain.hx)));
    const j = Math.max(0, Math.min(domain.ny - 1, Math.floor((p[1] - domain.lo[1]) / domain.hy)));
    for (let r = 0; r <= 2; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const a = i + di; const b = j + dj;
      if (a >= 0 && b >= 0 && a < domain.nx && b < domain.ny && domain.index[b * domain.nx + a] >= 0) return domain.index[b * domain.nx + a];
    }
    return -1;
  }
  const { nx, ny, nz, hx, hy, hz, lo } = domain;
  const i = Math.max(0, Math.min(nx - 1, Math.floor((p[0] - lo[0]) / hx)));
  const j = Math.max(0, Math.min(ny - 1, Math.floor((p[1] - lo[1]) / hy)));
  const k = Math.max(0, Math.min(nz - 1, Math.floor((p[2] - lo[2]) / hz)));
  for (let r = 0; r <= 2; r++) for (let dk = -r; dk <= r; dk++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const a = i + di; const b = j + dj; const c = k + dk;
    if (a >= 0 && b >= 0 && c >= 0 && a < nx && b < ny && c < nz) { const q = domain.index[(c * ny + b) * nx + a]; if (q >= 0) return q; }
  }
  return -1;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The flow report (a printable HTML page). labels: translated texts by key. */
export function plasticsReportHtml({ name, resinId, result, gates = [], labels = {}, date = '', lang = 'en' }) {
  const s = result.summary;
  const L = (k, d) => esc(labels[k] ?? d);
  const row = (k, d, v) => `<tr><td>${L(k, d)}</td><td>${esc(v)}</td></tr>`;
  const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><title>${L('pl.report', 'Flow report')} — ${esc(name)}</title>
<style>body{font:13px/1.45 system-ui,sans-serif;margin:24px;color:#111}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 6px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:4px 6px;text-align:left}td:first-child{width:40%;font-weight:600}.bad{color:#b71c1c;font-weight:700}.ok{color:#1b5e20;font-weight:700}</style></head><body>
<h1>${L('pl.report', 'Flow report')}: ${esc(name)}</h1><div>${esc(date)}</div>
<p class="${s.shortShot ? 'bad' : 'ok'}">${s.shortShot ? L('pl.shortShot', 'Short shot') : L('pl.filled', 'The part fills')}</p>
<h2>${L('pl.inputs', 'Inputs')}</h2><table>
${row('pl.resin', 'Resin', `${labels[`pl.resin.${resinId}`] ?? resinId}`)}
${row('pl.melt', 'Melt temperature', `${f(s.melt, 0)} °C`)}${row('pl.mould', 'Mould temperature', `${f(s.mould, 0)} °C`)}
${row('pl.gates', 'Gates', String(gates.length))}${row('pl.model', 'Model', labels[`pl.kind.${result.kind}`] ?? result.kind)}${row('pl.nodes', 'Nodes', String(result.nodes))}
</table>
<h2>${L('pl.results', 'Results')}</h2><table>
${row('pl.fillTime', 'Fill time', `${f(s.fillTime, 3)} s`)}${row('pl.gatePressure', 'Pressure at the end of fill (gate)', `${f(s.gatePressure, 1)} MPa`)}
${row('pl.frontTemp', 'Flow front temperature', `${f(s.frontTempMin, 0)} – ${f(s.frontTempMax, 0)} °C`)}
${row('pl.weld', 'Weld line nodes', String(s.weldNodes))}${row('pl.traps', 'Air traps', String(s.airTraps))}
${row('pl.coolingTime', 'Cooling time', `${f(s.coolingTime, 1)} s`)}${row('pl.cycleTime', 'Cycle time (estimate)', `${f(s.cycleTime, 1)} s`)}
${row('pl.sink', 'Sink mark depth (max, estimate)', `${f(s.sinkMax, 3)} mm`)}${row('pl.clamp', 'Clamp force', `${f(s.clampForce, 1)} kN (${f(s.clampTonnes, 1)} t)`)}
${row('pl.wall', 'Nominal / thickest wall', `${f(s.nominalWall, 2)} / ${f(s.maxWall, 2)} mm`)}${row('pl.mass', 'Part mass', `${f(s.mass, 1)} g`)}
</table></body></html>`;
}
