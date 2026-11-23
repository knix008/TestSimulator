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
import { taitVolume, taitDensity, compressibility, fitTait, conductLayers, layerScratch, frozenFraction, meanLayers, coolingTimeLayers } from './plastics-pvt.js';
import { solveGraph } from './plastics-solver.js';

/**
 * Resins: Cross-WLF (n, τ* Pa, D1 Pa·s, D2 K, D3 K/Pa, A1, A2 K), melt density kg/m³, solid density, specific
 * heat J/(kg·K), conductivity W/(m·K), and process temperatures °C (melt, mould, ejection, no-flow) and the
 * linear mould shrinkage (%). FAMILY FALLBACKS: these entries are representative values for each resin family,
 * not a particular supplier's grade (Cross-WLF typical of published family data, Tait fitted to the family's
 * densities, not a measured PVT set); each is marked `fallback: true`. Named grades with published, cited
 * coefficients follow in GRADES below and are listed first.
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
// Tait coefficients for each family fallback, fitted to its solid density (25 °C), melt density (at its melt
// temperature) and transition (glass transition for amorphous, crystallisation for semi-crystalline resins).
const PVT = {
  pp: { transition: 120, crystalline: true }, abs: { transition: 105 }, pc: { transition: 145 }, pa66: { transition: 240, crystalline: true },
  pom: { transition: 160, crystalline: true }, hdpe: { transition: 125, crystalline: true }, ps: { transition: 100 }, pmma: { transition: 105 },
  pbt: { transition: 205, crystalline: true }, pcabs: { transition: 125 },
};
for (const [id, r] of Object.entries(RESINS)) {
  r.family = id; r.fallback = true;
  r.source = 'family fallback: representative values, not a measured grade';
  r.tait = fitTait({ rhoSolid: r.rhoSolid, rhoMelt: r.rho, melt: r.melt, ...PVT[id] });
}

/**
 * Named commercial grades with published CAE coefficients. Each entry names its family (whose values fill in
 * what the source does not give: thermal data, ejection and no-flow temperatures, shrinkage, shear limit) and
 * cites where its Cross-WLF (or Cross-Arrhenius) and Tait coefficients come from. Tait sets are SI (m³/kg, K,
 * Pa); where a grade has a published Tait set its densities are taken from it, otherwise the Tait set is fitted
 * to the family's densities as for the fallbacks (`taitFitted: true`). An amorphous grade's published solid
 * branch is joined to the melt at the pressure-shifted glass transition (see plastics-pvt.js), so its own b1s
 * and b3s only enter through the solid slopes b2s and b4s.
 */
const GRADES = {
  // CHI MEI Polylac PA-757 (ABS). Kastelic, Šturm, Huskić, Gregorc et al., "Polymers" 2026, 18, 1310,
  // doi:10.3390/polym18111310, Appendix A, Tables A1–A4 (Cross-WLF, two-domain Tait, cp, k).
  abs_pa757: { family: 'abs', n: 0.21124, tau: 1e5, D1: 3.2711e15, D2: 363.15, D3: 0, A1: 37.737, A2: 51.6, cp: 2370, k: 0.237, melt: 240, mould: 50,
    tait: { b1m: 9.7578e-4, b2m: 4.8067e-7, b3m: 1.6916e8, b4m: 0.003364, b1s: 9.7587e-4, b2s: 1.4467e-7, b3s: 2.153e8, b4s: 1.922e-3, b5: 361.15, b6: 2.2222e-7, b7: 0, b8: 0, b9: 0 },
    source: 'Kastelic et al., Polymers 2026, 18, 1310, doi:10.3390/polym18111310 (App. A)' },
  // INEOS Styrolution Lustran PG 298 (ABS). Ma et al., "Polymers" 2022, 14, 4085, doi:10.3390/polym14194085
  // (Cross-WLF; process window mould 80 °C, melt 260 °C, ejection 93 °C).
  abs_pg298: { family: 'abs', n: 0.3046, tau: 52540, D1: 2.3e14, D2: 373.15, D3: 0, A1: 34.66, A2: 51.6, melt: 260, mould: 80, eject: 93,
    source: 'Ma et al., Polymers 2022, 14, 4085, doi:10.3390/polym14194085' },
  // Lukoil Buplen 6331 (PP homopolymer). Giusti & Lucchetta, "Polymers" 2020, 12, 2063,
  // doi:10.3390/polym12092063, Table 5 (Cross-WLF; D3 not given, taken as 0).
  pp_buplen6331: { family: 'pp', n: 0.251, tau: 3273.59, D1: 5.15e7, D2: 384.45, D3: 0, A1: 16.41, A2: 51.6,
    source: 'Giusti & Lucchetta, Polymers 2020, 12, 2063, doi:10.3390/polym12092063 (Table 5)' },
  // LCY Globalene 6331 (PP). Wen et al., "Polymers" 2021, 13, 4094, doi:10.3390/polym13234094, Table 2.
  pp_globalene6331: { family: 'pp', n: 0.299, tau: 1.59e4, D1: 3.92e19, D2: 263.15, D3: 0, A1: 46.48, A2: 51.57,
    source: 'Wen et al., Polymers 2021, 13, 4094, doi:10.3390/polym13234094 (Table 2)' },
  // CHI MEI POLYREX PG-33 (GPPS) and PH-60 (HIPS). Wen et al., "Polymers" 2021, 13, 4094, Table 2.
  gpps_pg33: { family: 'ps', n: 0.246, tau: 2.42e4, D1: 1.94e13, D2: 363.15, D3: 0, A1: 31.29, A2: 51.57,
    source: 'Wen et al., Polymers 2021, 13, 4094, doi:10.3390/polym13234094 (Table 2)' },
  hips_ph60: { family: 'ps', n: 0.272, tau: 2.3e4, D1: 5.94e11, D2: 373.15, D3: 0, A1: 26.86, A2: 51.57,
    source: 'Wen et al., Polymers 2021, 13, 4094, doi:10.3390/polym13234094 (Table 2)' },
  // Trinseo Styron 478 (HIPS). Kazmer et al., "Polymers" 2018, 10, 823, doi:10.3390/polym10080823, Table 2
  // (Cross-WLF; k 0.175 W/(m·K) at 199 °C, cp 2394 J/(kg·K) at 210 °C).
  hips_styron478: { family: 'ps', n: 0.335, tau: 10300, D1: 1e12, D2: 373.15, D3: 0, A1: 25.29, A2: 51.6, cp: 2394, k: 0.175,
    source: 'Kazmer et al., Polymers 2018, 10, 823, doi:10.3390/polym10080823 (Table 2)' },
  // SABIC HDPE M80064. Krebelj et al., "Polymers" 2021, 13, 138, doi:10.3390/polym13010138, Tables 2–3
  // (Cross-WLF with D3, two-domain Tait). The paper prints b7 = 1.872e-3; the step b1m − b1s ≈ 2e-4 m³/kg and
  // Park & Kim, "Polymers" 2024, 16, 424, doi:10.3390/polym16030424 give 1.872e-4, used here.
  hdpe_m80064: { family: 'hdpe', n: 0.394, tau: 64570, D1: 3.76e15, D2: 153.15, D3: 1.5e-7, A1: 33.21, A2: 51.6,
    tait: { b1m: 12.74e-4, b2m: 10.26e-7, b3m: 9.263e7, b4m: 4.941e-3, b1s: 10.75e-4, b2s: 2.077e-7, b3s: 33.24e7, b4s: 2.46e-6, b5: 414.5, b6: 1.543e-7, b7: 1.872e-4, b8: 5.158e-2, b9: 1.023e-8 },
    source: 'Krebelj et al., Polymers 2021, 13, 138, doi:10.3390/polym13010138 (Tables 2-3); b7 per Park & Kim, Polymers 2024, 16, 424' },
  // DuPont Delrin 500P (POM). He & Wu, "Polymers" 2021, 13, 2092, doi:10.3390/polym13132092 (Cross-WLF;
  // melt density 1102.7, solid 1387 kg/m³, k 0.29 W/(m·K)).
  pom_delrin500p: { family: 'pom', n: 0.1958, tau: 378000, D1: 7.29e11, D2: 223.15, D3: 0, A1: 25.44, A2: 51.6, rho: 1102.7, rhoSolid: 1387, k: 0.29,
    source: 'He & Wu, Polymers 2021, 13, 2092, doi:10.3390/polym13132092' },
  // SABIC Valox 337 (PBT). Wilczyński & Narowski, "Polymers" 2019, 11, 639, doi:10.3390/polym11040639
  // (Cross-WLF; solid density 1204, melt 1016 kg/m³, cp melt 2110 J/(kg·K), k 0.24, melt 252 °C, mould 63 °C).
  pbt_valox337: { family: 'pbt', n: 0.2139, tau: 353100, D1: 5.32e23, D2: 323, D3: 0, A1: 59.833, A2: 51.6, rho: 1016, rhoSolid: 1204, cp: 2110, k: 0.24, melt: 252, mould: 63,
    source: 'Wilczyński & Narowski, Polymers 2019, 11, 639, doi:10.3390/polym11040639' },
  // Covestro Makrolon 2405 (PC). Turk & Svenšek, "Polymers" 2023, 15, 2841, doi:10.3390/polym15132841, Table A1
  // (two-domain Tait). The paper gives no Cross-WLF set, so the viscosity is the PC family fallback's.
  pc_makrolon2405: { family: 'pc', viscosityFallback: true,
    tait: { b1m: 8.649e-4, b2m: 6.028e-7, b3m: 1.6934e8, b4m: 4.343e-3, b1s: 8.649e-4, b2s: 2.034e-7, b3s: 2.76286e8, b4s: 2.373e-3, b5: 412.17, b6: 4.239e-7, b7: 0, b8: 0, b9: 0 },
    source: 'Tait: Turk & Svenšek, Polymers 2023, 15, 2841, doi:10.3390/polym15132841 (Table A1); viscosity: PC family fallback' },
  // Evonik Plexiglas RV825 (PMMA). Liu et al., J. Manuf. Sci. Eng. 2019, 141(8), 081011, doi:10.1115/1.4043980,
  // Table 1: Cross-Arrhenius viscosity η0 = B·exp(Tb/T) and Tait (converted to SI; b3s is not printed and is
  // inferred from the solid-branch fit). Tg 101 °C, melt 250 °C, mould 75 °C.
  pmma_rv825: { family: 'pmma', model: 'arrhenius', n: 0.21, tau: 1.48e5, B: 1e-17, Tb: 24294, melt: 250, mould: 75,
    tait: { b1m: 8.5982e-4, b2m: 5.697e-7, b3m: 2.09e8, b4m: 0.0049083, b1s: 8.60702e-4, b2s: 1.995e-7, b3s: 2.73e8, b4s: 0.003394, b5: 383, b6: 2e-7, b7: 0, b8: 0, b9: 0 },
    source: 'Liu et al., J. Manuf. Sci. Eng. 2019, 141(8), 081011, doi:10.1115/1.4043980 (Table 1)' },
};
for (const [id, g] of Object.entries(GRADES)) {
  const fam = RESINS[g.family];
  const r = { ...fam, ...g, fallback: false };
  if (g.viscosityFallback) for (const key of ['n', 'tau', 'D1', 'D2', 'D3', 'A1', 'A2']) r[key] = fam[key];
  if (g.tait) {
    // Densities from the published state equation (solid at 25 °C, melt at the grade's melt temperature).
    r.rhoSolid = taitDensity(g.tait, 25, 0); r.rho = taitDensity(g.tait, r.melt, 0);
  } else {
    r.taitFitted = true;
    r.tait = fitTait({ rhoSolid: r.rhoSolid, rhoMelt: r.rho, melt: r.melt, ...PVT[g.family] });
  }
  RESINS[id] = r;
}
/** Named grades first, the family fallbacks after them. */
export const RESIN_IDS = [...Object.keys(GRADES), ...Object.keys(PVT)];
export const GRADE_IDS = Object.keys(GRADES);
export { taitVolume, taitDensity, compressibility } from './plastics-pvt.js';
/** The resin for an app material id (cad/materials.js) when there is one. */
export const resinOf = (id) => ({ abs: 'abs', pc: 'pc', nylon: 'pa66', pom: 'pom' }[id] ?? null);

/** Cross-WLF (or Cross-Arrhenius, `model: 'arrhenius'`) viscosity (Pa·s) at T (°C), shear rate (1/s) and pressure (Pa). `newtonian` resins: { eta }. */
export function viscosity(resin, T, shear, p = 0) {
  if (resin.newtonian) return resin.eta;
  const Tk = T + 273.15;
  if (resin.model === 'arrhenius') {
    // Cross-Arrhenius: η0 = B · exp(Tb / T) · exp(β p) (β = 0 unless given).
    const eta0 = resin.B * Math.exp(resin.Tb / Tk) * Math.exp((resin.beta ?? 0) * p);
    return eta0 / (1 + (eta0 * Math.max(0, shear) / resin.tau) ** (1 - resin.n));
  }
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
export function partDomain(mesh, { cells = 60, mode = 'auto', adaptive = true, coarse = 4, budget = 60000 } = {}) {
  // A cavity with more nodes than the budget is built again a little coarser.
  for (let c = cells, k = 0; k < 8; k++, c *= 0.8) {
    const d = buildDomain(mesh, { cells: c, mode, adaptive, coarse });
    if (d.nodes.length <= budget || k === 7) return d;
  }
  return null;
}

function buildDomain(mesh, { cells, mode, adaptive, coarse }) {
  const welded = weldMesh(mesh);
  const { lo, hi } = meshBounds(welded);
  const grid = new TriangleGrid(welded);
  const sx = hi[0] - lo[0]; const sy = hi[1] - lo[1]; const sz = hi[2] - lo[2];
  const flat = sz <= 0.15 * Math.min(sx, sy);
  const kind = mode === 'auto' ? (flat ? 'midplane' : '3d') : mode;
  const along = Math.max(8, Math.round(cells));
  const cell = Math.max(sx, sy, kind === '3d' ? sz : 0) / along;
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
  // Local wall thickness of every voxel.
  const thick = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const q = id(i, j, k);
    if (solid[q]) thick[q] = Math.max(1e-3, Math.min(chordZ[q], run(i, j, k, 1, 0, 0) * hx, run(i, j, k, 0, 1, 0) * hy));
  }
  // Adaptive refinement: where the wall is thick (at least `coarse` voxels across) a 2 × 2 × 2 block of voxels
  // becomes one node; thin walls, corners and the surface keep the fine voxels.
  const index = new Int32Array(nx * ny * nz).fill(-1);
  const nodes = [];
  const vol = hx * hy * hz;
  if (adaptive) {
    for (let k = 0; k + 1 < nz; k += 2) for (let j = 0; j + 1 < ny; j += 2) for (let i = 0; i + 1 < nx; i += 2) {
      let ok = true; let hmin = Infinity;
      for (let dk = 0; dk < 2 && ok; dk++) for (let dj = 0; dj < 2 && ok; dj++) for (let di = 0; di < 2 && ok; di++) {
        const q = id(i + di, j + dj, k + dk);
        if (!solid[q]) ok = false; else hmin = Math.min(hmin, thick[q]);
      }
      if (!ok || hmin < coarse * Math.max(hx, hy, hz)) continue;
      const nid = nodes.length;
      for (let dk = 0; dk < 2; dk++) for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) index[id(i + di, j + dj, k + dk)] = nid;
      nodes.push({ c: [lo[0] + (i + 1) * hx, lo[1] + (j + 1) * hy, lo[2] + (k + 1) * hz], V: 8 * vol, h: hmin, ijk: [i, j, k], cols: [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]], coarse: true });
    }
  }
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const q = id(i, j, k);
    if (!solid[q] || index[q] >= 0) continue;
    index[q] = nodes.length;
    nodes.push({ c: [lo[0] + (i + 0.5) * hx, lo[1] + (j + 0.5) * hy, lo[2] + (k + 0.5) * hz], V: vol, h: thick[q], ijk: [i, j, k] });
  }
  // Edges from the voxel faces between different nodes: face areas summed, the distance between the nodes'
  // centres along the face's axis (fine-fine Δ, fine-coarse 1.5 Δ, coarse-coarse 2 Δ).
  const pairs = new Map();
  const exposed = new Uint8Array(nodes.length);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = index[id(i, j, k)]; if (a < 0) continue;
    for (const [di, dj, dk, A, ax] of [[1, 0, 0, hy * hz, 0], [0, 1, 0, hx * hz, 1], [0, 0, 1, hx * hy, 2], [-1, 0, 0, 0, 0], [0, -1, 0, 0, 1], [0, 0, -1, 0, 2]]) {
      const ii = i + di; const jj = j + dj; const kk = k + dk;
      const b = ii >= 0 && jj >= 0 && kk >= 0 && ii < nx && jj < ny && kk < nz ? index[id(ii, jj, kk)] : -1;
      if (b < 0) { exposed[a] = 1; continue; }
      if (A === 0 || b === a) continue;
      const key = a < b ? `${a},${b},${ax}` : `${b},${a},${ax}`;
      const e = pairs.get(key);
      if (e) e.A += A; else pairs.set(key, { a, b, ax, A });
    }
  }
  const edges = [];
  for (const { a, b, ax, A } of pairs.values()) {
    const L = Math.abs(nodes[a].c[ax] - nodes[b].c[ax]) || [hx, hy, hz][ax];
    const hh = 2 / (1 / nodes[a].h ** 2 + 1 / nodes[b].h ** 2);
    edges.push([a, b, (A * hh) / (12 * L)]);
  }
  nodes.forEach((nd, i) => { nd.boundary = Boolean(exposed[i]); });
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

/**
 * The pressure solves: conjugate gradients preconditioned by the aggregation multigrid of plastics-solver.js (a
 * handful of iterations however fine the cavity); should it not converge, the Jacobi-preconditioned solve below
 * from the same start. Same arguments as solveSPD. Returns iterations.
 */
function solveFast(domain, G, active, diagExtra, rhs, p, { tol = 1e-7, signal = null } = {}) {
  const start = Float64Array.from(p);
  let it = -1;
  try { it = solveGraph(domain, G, active, diagExtra, rhs, p, { tol, maxIter: 500, signal }); } catch { it = -1; }
  if (it >= 0 && (it < 500 || signal?.cancelled)) return it;
  p.set(start);
  return solveSPD(domain, G, active, diagExtra, rhs, p, { tol, signal });
}

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
 * Conjugate gradients on the nodes in `active` (Jacobi preconditioned, matrix-free) for
 * (diag + Σ G (p_i − p_j)) p = rhs, nodes outside `active` held at their value in p (Dirichlet). Returns iterations.
 */
function solveSPD(domain, G, active, diagExtra, rhs, p, { tol = 1e-7, maxIter = 3000, signal = null } = {}) {
  const n = domain.nodes.length; const EA = domain.ea; const EB = domain.eb; const m = EA.length;
  const diag = new Float64Array(n);
  const b = new Float64Array(n);
  for (let i = 0; i < n; i++) if (active[i]) { diag[i] = diagExtra ? diagExtra[i] : 0; b[i] = rhs[i]; }
  for (let e = 0; e < m; e++) {
    const g = G[e]; if (g === 0) continue;
    const a = EA[e]; const c = EB[e];
    if (active[a]) { diag[a] += g; if (!active[c]) b[a] += g * p[c]; }
    if (active[c]) { diag[c] += g; if (!active[a]) b[c] += g * p[a]; }
  }
  const act = []; for (let i = 0; i < n; i++) if (active[i]) act.push(i);
  const apply = (x, out) => {
    for (const i of act) out[i] = diagExtra ? diagExtra[i] * x[i] : 0;
    for (let e = 0; e < m; e++) {
      const g = G[e]; if (g === 0) continue;
      const a = EA[e]; const c = EB[e];
      if (active[a] && active[c]) { const f = g * (x[a] - x[c]); out[a] += f; out[c] -= f; }
      else if (active[a]) out[a] += g * x[a];
      else if (active[c]) out[c] += g * x[c];
    }
  };
  const r = new Float64Array(n); const z = new Float64Array(n); const d = new Float64Array(n); const q = new Float64Array(n);
  apply(p, q);
  let bn = 0; for (const i of act) { r[i] = b[i] - q[i]; bn += b[i] * b[i]; }
  bn = Math.sqrt(bn) || 1;
  let rz = 0; for (const i of act) { z[i] = diag[i] > 0 ? r[i] / diag[i] : r[i]; d[i] = z[i]; rz += r[i] * z[i]; }
  let it = 0;
  for (; it < maxIter; it++) {
    let rn = 0; for (const i of act) rn += r[i] * r[i];
    if (Math.sqrt(rn) <= tol * bn || signal?.cancelled) break;
    apply(d, q);
    let dq = 0; for (const i of act) dq += d[i] * q[i];
    if (!(dq > 0)) break;
    const al = rz / dq; let rz2 = 0;
    for (const i of act) { p[i] += al * d[i]; r[i] -= al * q[i]; z[i] = diag[i] > 0 ? r[i] / diag[i] : r[i]; rz2 += r[i] * z[i]; }
    const be = rz2 / rz; rz = rz2;
    for (const i of act) d[i] = z[i] + be * d[i];
  }
  return it;
}

/**
 * Fills the domain from the gate nodes, then packs it. Units: lengths mm in the domain, results in s, MPa, °C,
 * kN. options: { resin (RESINS entry or id), melt, mould (°C), fillTime (s; 0 = from the volume), maxPressure
 * (MPa), packPressure (MPa; null = 80 % of the gate pressure at the end of filling), packTime (s; null = until
 * the gate freezes), layers (gapwise), maxSteps, onProgress(fraction, phase), signal ({ cancelled }) }.
 *
 * Filling: the pressure on the filled nodes (the front at 0, the flow rate at the gates), the conductances from
 * the viscosity and the still-molten gap (the frozen skins narrow it); every wall's gapwise temperature is
 * carried with the flow, heated by shear and cooled to the mould. Packing (when the resin has Tait data): the
 * gate held at the packing pressure, the melt compressible (Tait), each step's mass balance solved implicitly;
 * the mass in each node when it is sealed gives its volumetric shrinkage, the core still molten then its sink.
 */
export function fillSimulation(domain, { gates = [], resin: resinIn = 'abs', melt = null, mould = null, fillTime = 0, maxPressure = 180, packPressure = null, packTime = null, layers = 10, switchover = 99, maxSteps = 4000, onProgress = null, signal = null } = {}) {
  const resin = typeof resinIn === 'string' ? RESINS[resinIn] : resinIn;
  const Tm = melt ?? resin.melt ?? 230; const Tw = mould ?? resin.mould ?? 50;
  const noFlow = resin.noFlow ?? -Infinity;
  const nodes = domain.nodes; const E = domain.edges; const n = nodes.length; const EA = domain.ea; const EB = domain.eb;
  if (!n || !gates.length) throw Object.assign(new Error('no cavity or gate'), { code: 'noGate' });
  const mm = 1e-3; const L = Math.max(1, Math.round(layers));
  const Vtot = domain.volume * mm ** 3;
  const tFill = fillTime > 0 ? fillTime : Math.max(0.2, Math.min(5, (Vtot * 1e6) ** (1 / 3) * 0.25));
  const Q0 = Vtot / tFill;
  const geo = Float64Array.from(E, (e) => e[2] * mm ** 3);
  const V = Float64Array.from(nodes, (x) => x.V * mm ** 3);
  const H = Float64Array.from(nodes, (x) => x.h * mm);
  const rhoC = resin.rho ?? 1000; const cp = resin.cp ?? 2000;
  const alpha = (resin.k ?? 0.2) / (rhoC * cp);
  const expo = domain.kind === 'midplane' ? 3 : 2; // conductance ∝ (open gap)^3 (Hele-Shaw) or ^2 (3D)
  const TL = new Float64Array(n * L).fill(Tm); const sc = layerScratch(L);
  const ff = new Float64Array(n); // frozen share of each wall
  const f = new Float64Array(n); const filled = new Uint8Array(n); const frozen = new Uint8Array(n);
  const tF = new Float64Array(n).fill(Infinity); const Tfront = new Float64Array(n).fill(NaN);
  const shear = new Float64Array(n); const eta = new Float64Array(n).fill(viscosity(resin, Tm, 1000));
  const p = new Float64Array(n); const rhs = new Float64Array(n); const G = new Float64Array(E.length);
  const inflow = new Float64Array(n); const from = new Int32Array(n).fill(-1);
  const gateSet = new Set(gates);
  const flowLayers = (i) => Math.max(1, Math.round(L * (1 - ff[i])));
  const bulk = (i) => meanLayers(TL.subarray(i * L, i * L + L), L);
  const flowMean = (i) => { const k = flowLayers(i); let s = 0; for (let j = 0; j < k; j++) s += TL[i * L + j]; return s / k; };
  const open = (i) => Math.max(0, 1 - ff[i]) ** expo;
  let t = 0; let Q = Q0; let filledVol = 0; let steps = 0; let shortShot = false; let reason = null;
  let pGate = 0; const history = [];
  let pSwitch = null; let pGateSwitch = 0;
  for (const g of gates) { filled[g] = 1; f[g] = 1; tF[g] = 0; Tfront[g] = Tm; filledVol += V[g]; }
  const flux = new Float64Array(E.length);
  const TinL = new Float64Array(L);
  while (filledVol < Vtot * (1 - 1e-9) && steps < maxSteps) {
    if (signal?.cancelled) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
    steps++;
    for (let e = 0; e < E.length; e++) {
      const a = EA[e]; const b = EB[e];
      if ((!filled[a] && !filled[b]) || frozen[a] || frozen[b]) { G[e] = 0; continue; }
      const et = filled[a] && filled[b] ? (eta[a] + eta[b]) / 2 : eta[filled[a] ? a : b];
      G[e] = (geo[e] / et) * Math.min(filled[a] ? open(a) : 1, filled[b] ? open(b) : 1);
    }
    rhs.fill(0);
    for (const g of gates) rhs[g] = Q / gates.length;
    for (let i = 0; i < p.length; i++) if (!filled[i]) p[i] = 0;
    solveFast(domain, G, filled, null, rhs, p);
    pGate = gates.reduce((mx, g) => Math.max(mx, p[g]), 0);
    if (pGate > maxPressure * 1e6) { const k = (maxPressure * 1e6) / pGate; Q *= k; for (let i = 0; i < n; i++) p[i] *= k; pGate = maxPressure * 1e6; }
    inflow.fill(0);
    let frontQ = 0;
    for (let e = 0; e < E.length; e++) {
      const a = EA[e]; const b = EB[e];
      const q = G[e] * ((filled[a] ? p[a] : 0) - (filled[b] ? p[b] : 0));
      flux[e] = q;
      if (filled[a] && !filled[b] && q > 0) { inflow[b] += q; frontQ += q; if (from[b] < 0) from[b] = a; }
      else if (filled[b] && !filled[a] && q < 0) { inflow[a] -= q; frontQ -= q; if (from[a] < 0) from[a] = b; }
    }
    if (!(frontQ > Q0 * 1e-6)) { shortShot = true; reason = frozen.some((x) => x) || ff.some((x) => x > 0.95) ? 'frozen' : 'pressure'; break; }
    let dt = Infinity;
    for (let i = 0; i < n; i++) if (!filled[i] && inflow[i] > 0) dt = Math.min(dt, ((1 - f[i]) * V[i]) / inflow[i]);
    dt = Math.max(dt, Math.min(Vtot / Q0 / 250, Vtot / frontQ / 250));
    // Gapwise temperatures of the filled walls: the flowing core renewed by the melt coming in, shear heating
    // across the gap (∝ the square of the shear rate, which grows linearly from the mid-plane), conduction.
    for (let i = 0; i < n; i++) {
      if (!filled[i] || frozen[i]) continue;
      let qin = 0; let sh = 0; TinL.fill(0);
      for (const e of domain.adj[i]) {
        const a = EA[e]; const j = a === i ? EB[e] : a; const q = a === i ? -flux[e] : flux[e];
        if (q > 0 && filled[j]) { qin += q; for (let l = 0; l < L; l++) TinL[l] += q * TL[j * L + l]; }
        sh += Math.abs(flux[e]);
      }
      if (gateSet.has(i)) { const qg = Q / gates.length; qin += qg; for (let l = 0; l < L; l++) TinL[l] += qg * Tm; }
      const kf = flowLayers(i); const hOpen = H[i] * (kf / L);
      const width = domain.kind === 'midplane' ? domain.cell * mm : (domain.cell * mm) ** 2 / H[i];
      shear[i] = Math.min(1e6, (6 * (sh / 2)) / (width * hOpen * hOpen));
      const renew = qin > 0 ? 1 - Math.exp(-(qin / (V[i] * (kf / L))) * dt) : 0;
      const base = i * L;
      for (let l = 0; l < kf; l++) {
        if (qin > 0) TL[base + l] += renew * (TinL[l] / qin - TL[base + l]);
        const z = (l + 0.5) / kf; const gr = shear[i] * z;
        TL[base + l] += (eta[i] * gr * gr * dt) / (rhoC * cp);
      }
      conductLayers(TL.subarray(base, base + L), L, H[i], alpha, Tw, dt, sc);
      ff[i] = frozenFraction(TL.subarray(base, base + L), L, noFlow);
      eta[i] = viscosity(resin, flowMean(i), shear[i]);
    }
    t += dt;
    for (let i = 0; i < n; i++) {
      if (filled[i] || !(inflow[i] > 0)) continue;
      const up = from[i] >= 0 ? flowMean(from[i]) : Tm;
      if (up < noFlow) { frozen[i] = 1; continue; }
      const before = f[i];
      f[i] += (inflow[i] * dt) / V[i];
      if (before < 0.5 && f[i] >= 0.5) tF[i] = t - dt + ((0.5 - before) * V[i]) / Math.max(1e-30, inflow[i]);
      if (f[i] >= 1 - 1e-9) {
        const over = (f[i] - 1) * V[i];
        f[i] = 1; filled[i] = 1; filledVol += V[i]; Tfront[i] = up;
        if (from[i] >= 0) TL.copyWithin(i * L, from[i] * L, from[i] * L + L); else TL.fill(Tm, i * L, i * L + L);
        eta[i] = viscosity(resin, up, shear[from[i]] || 1000);
        const empty = domain.adj[i].map((e) => (EA[e] === i ? EB[e] : EA[e])).filter((j) => !filled[j] && !frozen[j]);
        if (over > 0 && empty.length) for (const j of empty) { f[j] += over / empty.length / V[j]; if (from[j] < 0) from[j] = i; }
      }
    }
    for (let i = 0; i < n; i++) if (!Number.isFinite(tF[i]) && f[i] >= 0.5) tF[i] = t;
    for (let i = 0; i < n; i++) {
      if (!filled[i] && f[i] >= 1 - 1e-9) {
        f[i] = 1; filled[i] = 1; filledVol += V[i];
        const up = from[i] >= 0 ? flowMean(from[i]) : Tm; Tfront[i] = up;
        if (from[i] >= 0) TL.copyWithin(i * L, from[i] * L, from[i] * L + L); else TL.fill(Tm, i * L, i * L + L);
      }
    }
    history.push({ t, pGate: pGate / 1e6, filled: filledVol / Vtot, Q });
    // Velocity / pressure switch-over: the pressures reported "at the end of filling" are those at 99 % full
    // (the last few nodes of a discrete front funnel the flow and would spike the gate pressure).
    if (!pSwitch && filledVol >= Vtot * (switchover / 100)) { pSwitch = Float64Array.from(p); pGateSwitch = pGate; }
    if (onProgress && steps % 20 === 0) onProgress(0.7 * (filledVol / Vtot), 'fill');
    if (Q < Q0 * 1e-4) { shortShot = true; reason = 'pressure'; break; }
  }
  if (filledVol < Vtot * (1 - 1e-6)) { shortShot = true; reason ??= 'steps'; }
  const pFill = pSwitch ?? Float64Array.from(p);
  if (pSwitch) pGate = pGateSwitch;
  const ffFill = Float64Array.from(ff);
  // ── packing
  let pack = null;
  if (resin.tait && !shortShot) pack = packPhase();
  function packPhase() {
    const tait = resin.tait;
    const Pp = (packPressure ?? Math.max(10, 0.8 * (pGate / 1e6))) * 1e6;
    const tau = (H.reduce((m, h) => Math.max(m, h), 0) ** 2) / (Math.PI * Math.PI * alpha);
    const limit = packTime ?? Math.min(60, 4 * tau);
    const dtp = Math.max(1e-3, Math.min(limit, 4 * tau) / 150);
    const m = new Float64Array(n);
    const pk = Float64Array.from(pFill);
    for (let i = 0; i < n; i++) { if (gateSet.has(i)) pk[i] = Pp; m[i] = V[i] * taitDensity(tait, bulk(i), pk[i]); }
    const pMax = Float64Array.from(pk);
    const active = new Uint8Array(n); const diagX = new Float64Array(n); const rhsP = new Float64Array(n);
    let tp = 0; let gateFreeze = null; let k = 0; let coreAtSeal = null;
    const gateFrozen = () => gates.every((g) => ff[g] > 0.9);
    while (tp < limit - 1e-12 && k < 2000) {
      if (signal?.cancelled) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
      k++;
      const Told = new Float64Array(n); for (let i = 0; i < n; i++) Told[i] = bulk(i);
      for (let i = 0; i < n; i++) { const base = i * L; conductLayers(TL.subarray(base, base + L), L, H[i], alpha, Tw, dtp, sc); ff[i] = frozenFraction(TL.subarray(base, base + L), L, noFlow); }
      for (let e = 0; e < E.length; e++) {
        const a = EA[e]; const b = EB[e];
        const etaE = (viscosity(resin, flowMean(a), 10) + viscosity(resin, flowMean(b), 10)) / 2;
        const rho = (taitDensity(tait, Told[a], pk[a]) + taitDensity(tait, Told[b], pk[b])) / 2;
        G[e] = ((geo[e] / etaE) * Math.min(open(a), open(b))) * rho;
      }
      const sealed = gateFrozen();
      // Newton iterations on each node's mass balance: V ρ(T, p) = m + Δt Σ flows, linearised about the last
      // iterate (ρ and its compressibility there), so a node crossing its transition does not jump.
      for (const g of gates) if (!sealed) pk[g] = Pp;
      for (let it = 0; it < 3; it++) {
        for (let i = 0; i < n; i++) {
          const Tn = bulk(i);
          const rho = taitDensity(tait, Tn, Math.max(0, pk[i])); const beta = compressibility(tait, Tn, Math.max(0, pk[i]));
          active[i] = gateSet.has(i) && !sealed ? 0 : 1;
          diagX[i] = (V[i] * rho * beta) / dtp;
          rhsP[i] = diagX[i] * pk[i] - (V[i] * rho - m[i]) / dtp;
        }
        solveFast(domain, G, active, diagX, rhsP, pk, { tol: 1e-9, signal });
      }
      // Mass moved by the flows; cavity pressure cannot pull below zero (the part leaves the wall).
      const dm = new Float64Array(n);
      for (let e = 0; e < E.length; e++) { const a = EA[e]; const b = EB[e]; const q = G[e] * (pk[a] - pk[b]) * dtp; dm[a] -= q; dm[b] += q; }
      for (let i = 0; i < n; i++) {
        if (!active[i]) { m[i] = Math.max(m[i], V[i] * taitDensity(tait, bulk(i), pk[i])); continue; }
        m[i] += dm[i];
        if (pk[i] < 0) pk[i] = 0;
        pMax[i] = Math.max(pMax[i], pk[i]);
      }
      tp += dtp;
      if (gateFreeze == null && sealed) { gateFreeze = tp; coreAtSeal = Float64Array.from(ff, (x) => 1 - x); }
      if (onProgress && k % 10 === 0) onProgress(0.7 + 0.3 * Math.min(1, tp / limit), 'pack');
      if (sealed && tp > (gateFreeze ?? 0) + 10 * dtp) break;
    }
    const vRoom = taitVolume(tait, 25, 0);
    const shrink = Float64Array.from(m, (mi, i) => 1 - (mi * vRoom) / V[i]);
    // Sink: once the gate has sealed no melt makes up for the core that is still molten; it shrinks by the
    // volumetric shrinkage worked out from the PVT state, drawing the surface in.
    const core = coreAtSeal ?? Float64Array.from(ff, (x) => 1 - x);
    const sink = Float64Array.from(shrink, (s, i) => Math.max(0, s) * nodes[i].h * Math.max(0, core[i]));
    return { pressure: pMax, mass: m, shrink, sink, packPressure: Pp / 1e6, gateFreeze, packTime: tp };
  }
  onProgress?.(1, 'done');
  return analyse(domain, { resin, Tm, Tw, tF, p: pFill, T: Tfront, ff: ffFill, filled, frozen, shortShot, reason, history, Q0, tFill, pGate, steps, maxPressure, pack, alpha });
}

/** Results: weld lines, air traps, frozen skins, shrinkage and sink (from the packing), cooling, clamp force. */
function analyse(domain, r) {
  const { nodes, edges: E, adj } = domain;
  const n = nodes.length;
  const pressure = Float64Array.from(r.p, (x) => x / 1e6);
  const fillT = r.tF;
  const dir = nodes.map((nd, i) => {
    const v = [0, 0, 0];
    for (const e of adj[i]) { const [a, b] = E[e]; const j = a === i ? b : a; if (fillT[j] < fillT[i]) for (let k = 0; k < 3; k++) v[k] += nd.c[k] - nodes[j].c[k]; }
    const l = Math.hypot(...v); return l > 0 ? v.map((x) => x / l) : v;
  });
  const weld = new Uint8Array(n);
  for (const [a, b] of E) {
    if (!Number.isFinite(fillT[a]) || !Number.isFinite(fillT[b])) continue;
    if (dir[a][0] * dir[b][0] + dir[a][1] * dir[b][1] + dir[a][2] * dir[b][2] < -0.5) { weld[a] = 1; weld[b] = 1; }
  }
  const vented = (i) => nodes[i].boundary && (domain.kind === 'midplane' || Math.abs(nodes[i].c[2] - domain.partingZ) <= (domain.hz ?? domain.cell) * 1.01);
  const trap = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(fillT[i]) || vented(i)) continue;
    let last = true;
    for (const e of adj[i]) { const [a, b] = E[e]; const j = a === i ? b : a; if (!(fillT[j] < fillT[i])) { last = false; break; } }
    if (last && adj[i].length) trap[i] = 1;
  }
  const hs = nodes.map((x) => x.h).sort((a, b) => a - b);
  const hNom = hs[Math.floor(hs.length / 2)] ?? 0; const hMax = hs[Math.floor(hs.length * 0.98)] ?? hNom;
  const resin = r.resin;
  const cooling = coolingTimeLayers(hMax * 1e-3, r.alpha, r.Tm, r.Tw, resin.eject ?? r.Tw + 30);
  const pack = r.pack;
  const shrink = pack?.shrink ?? new Float64Array(n);
  const sink = pack?.sink ?? new Float64Array(n);
  let sinkMax = 0; let sinkNodes = 0; let shrinkSum = 0; let shrinkMax = -Infinity; let massPacked = 0;
  for (let i = 0; i < n; i++) { sinkMax = Math.max(sinkMax, sink[i]); if (sink[i] > 0.005) sinkNodes++; shrinkSum += shrink[i] * nodes[i].V; shrinkMax = Math.max(shrinkMax, shrink[i]); massPacked += pack ? pack.mass[i] : 0; }
  const cols = new Map();
  const cellArea = (domain.hx ?? domain.cell) * (domain.hy ?? domain.cell);
  const clampP = pack ? pack.pressure.map((x) => x / 1e6) : pressure;
  nodes.forEach((nd, i) => { for (const c of nd.cols ?? [nd.ij ?? nd.ijk]) { const k = `${c[0]},${c[1]}`; cols.set(k, Math.max(cols.get(k) ?? 0, Number.isFinite(fillT[i]) ? Math.max(pressure[i], clampP[i]) : 0)); } });
  let clamp = 0; for (const pv of cols.values()) clamp += pv * cellArea;
  const filledCount = r.filled.reduce((s, x) => s + x, 0);
  let endTime = 0; let tMin = Infinity; let tMax = -Infinity;
  for (const v of fillT) if (Number.isFinite(v) && v > endTime) endTime = v;
  for (const v of r.T) if (Number.isFinite(v)) { tMin = Math.min(tMin, v); tMax = Math.max(tMax, v); }
  const frozenEnd = r.ff;
  return {
    kind: domain.kind, nodes: n, fillTime: fillT, pressure, temperature: r.T, weld, trap, sink, shrinkage: Float64Array.from(shrink, (s) => s * 100), frozenLayer: Float64Array.from(frozenEnd, (x) => x * 100), frozen: r.frozen, filled: r.filled,
    packPressure: pack ? Float64Array.from(pack.pressure, (x) => x / 1e6) : null,
    summary: {
      fillTime: endTime, injectionTime: r.tFill, maxPressure: pressure.reduce((m, v) => Math.max(m, v), 0), gatePressure: r.pGate / 1e6, pressureLimited: r.pGate / 1e6 >= r.maxPressure * 0.999,
      shortShot: r.shortShot, reason: r.shortShot ? r.reason : null, filledFraction: filledCount / n,
      weldNodes: weld.reduce((s, x) => s + x, 0), airTraps: trap.reduce((s, x) => s + x, 0),
      frontTempMin: tMin, frontTempMax: tMax, nominalWall: hNom, maxWall: hMax, coolingTime: cooling,
      packPressure: pack?.packPressure ?? null, gateFreezeTime: pack?.gateFreeze ?? null, packTime: pack?.packTime ?? 0,
      cycleTime: endTime + (pack?.packTime ?? 0) + Math.max(0, cooling - (pack?.packTime ?? 0)) + 4,
      shrinkageAvg: pack ? (100 * shrinkSum) / Math.max(1e-12, domain.volume) : null, shrinkageMax: pack ? 100 * shrinkMax : null,
      sinkMax, sinkNodes, frozenAtFillEnd: (100 * frozenEnd.reduce((s, x) => s + x, 0)) / n,
      clampForce: clamp / 1000, clampTonnes: clamp / 9806.65, volume: domain.volume / 1000,
      mass: pack ? massPacked * 1000 : (domain.volume * 1e-9) * (resin.rhoSolid ?? 1000) * 1000,
      flowRate: r.Q0 * 1e6, steps: r.steps, melt: r.Tm, mould: r.Tw,
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

/** The fiber, cooling and warpage sections of the report (when the study had them). */
function extraReport(r, labels, f, row, L) {
  let html = '';
  if (r.fibers) html += `<h2>${L('pl.fiberGroup', 'Fiber orientation')}</h2><table>${row('pl.fiberMean', 'Mean alignment (1/3 random … 1 aligned)', f(r.fibers.mean, 3))}${row('pl.fiberSkin', 'Skin / core along the flow', `${f(r.fibers.skinMean, 3)} / ${f(r.fibers.coreMean, 3)}`)}${row('pl.fiberCI', 'Interaction coefficient C_I', f(r.fibers.CI, 4))}</table>`;
  if (r.cooling?.summary) {
    const c = r.cooling.summary;
    html += `<h2>${L('pl.coolGroup', 'Mould cooling')}</h2><table>${row('pl.wallTemp', 'Mould wall temperature (min / mean / max)', `${f(c.wallMin, 1)} / ${f(c.wallMean, 1)} / ${f(c.wallMax, 1)} °C`)}${row('pl.coolNeeded', 'Cooling time (largest)', `${f(c.coolTimeMax, 1)} s`)}${row('pl.cycleCooled', 'Cycle time with this cooling', `${f(c.cycleWithCooling, 1)} s`)}${row('pl.heat', 'Heat removed', `${f(c.heat, 1)} W`)}</table><table><tr><th>${L('pl.circuit', 'Circuit')}</th><th>Re</th><th>${L('pl.heatW', 'Heat W')}</th><th>${L('pl.inOut', 'In → out °C')}</th><th>Δp kPa</th></tr>${r.cooling.circuits.map((k) => `<tr><td>${esc(k.name)}</td><td>${f(k.Re, 0)}</td><td>${f(k.heat, 1)}</td><td>${f(k.inlet, 1)} → ${f(k.outlet, 2)}</td><td>${f(k.pressureDrop, 2)}</td></tr>`).join('')}</table>`;
  }
  if (r.warp?.cases) {
    const w = r.warp.cases;
    html += `<h2>${L('pl.warpGroup', 'Warpage')}</h2><table>${row('pl.warpTotal', 'Warpage (total, after the even shrinkage)', `${f(w.total.warpMax, 3)} mm`)}${['shrinkage', 'cooling', 'orientation'].map((c) => row(`pl.cause.${c}`, c, `${f(w[c].warpMax, 3)} mm`)).join('')}${row('pl.warpDominantRow', 'Main cause', labels[`pl.cause.${r.warp.dominant}`] ?? r.warp.dominant)}</table>`;
  }
  return html;
}

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
${s.packPressure != null ? row('pl.pack', 'Packing pressure / gate freeze', `${f(s.packPressure, 1)} MPa / ${f(s.gateFreezeTime ?? s.packTime, 1)} s`) : ''}${s.shrinkageAvg != null ? row('pl.shrinkage', 'Volumetric shrinkage (mean / max)', `${f(s.shrinkageAvg, 2)} / ${f(s.shrinkageMax, 2)} %`) : ''}
${row('pl.sink', 'Sink mark depth (max)', `${f(s.sinkMax, 3)} mm`)}${row('pl.clamp', 'Clamp force', `${f(s.clampForce, 1)} kN (${f(s.clampTonnes, 1)} t)`)}
${row('pl.wall', 'Nominal / thickest wall', `${f(s.nominalWall, 2)} / ${f(s.maxWall, 2)} mm`)}${row('pl.mass', 'Part mass', `${f(s.mass, 1)} g`)}
</table>${extraReport(result, labels, f, row, L)}</body></html>`;
}

/**
 * A whole study from plain data (what the worker receives): { mesh: { vertices, triangles }, gates (points),
 * domain: { cells, mode }, process: fillSimulation options }. post(message) gets { type: 'progress', fraction,
 * phase } while it runs and { type: 'result', domain, result } at the end ({ type: 'error', code, message } on
 * failure). Returns the result. signal: { cancelled } stops it between steps.
 */
export function runStudy({ mesh, gates = [], domain: dOpts = {}, process = {} }, post = () => {}, signal = null) {
  try {
    post({ type: 'progress', fraction: 0, phase: 'mesh' });
    const domain = partDomain(mesh, dOpts);
    if (!domain?.nodes.length) throw Object.assign(new Error('no cavity'), { code: 'noCavity' });
    let gateNodes = gates.map((g) => nearestNode(domain, g));
    if (!gateNodes.length) gateNodes = [suggestGate(domain)];
    const result = fillSimulation(domain, { ...process, gates: [...new Set(gateNodes)], signal, onProgress: (fraction, phase) => post({ type: 'progress', fraction, phase }) });
    const plainDomain = { kind: domain.kind, cell: domain.cell, nx: domain.nx, ny: domain.ny, nz: domain.nz, hx: domain.hx, hy: domain.hy, hz: domain.hz, lo: domain.lo, index: domain.index, volume: domain.volume, partingZ: domain.partingZ, nodes: domain.nodes.map((nd) => ({ c: nd.c, h: nd.h })) };
    post({ type: 'result', domain: plainDomain, result, gates: gateNodes });
    return { domain: plainDomain, result, gates: gateNodes, full: domain };
  } catch (error) {
    post({ type: 'error', code: error.code ?? 'failed', message: error.message });
    return null;
  }
}
