// Gas-assisted injection and insert moulding (no DOM), on the flow graph of cad/plastics.js.
//
// Gas assist: a short shot of melt (`shot`, a share of the cavity) is injected, then gas at the gas pin pushes
// through the still-molten core. The gas takes the path of least resistance — the thick channels (conductance
// ∝ h²–h³): from the gas node it advances over the melt-filled nodes by a Dijkstra cost Δ/h² , entering only walls
// thicker than `minThick` × the nominal wall (thin walls freeze shut). In each node it reaches it hollows the core
// between the frozen skins: core share 1 − 2·s/h with the skin s = max(skin × h, the frozen layer when the gas
// arrives), freeing that volume, which pushes the melt on into the unfilled nodes in the order the melt front would
// reach them. The gas stops when the cavity is full (or when it would break through the melt front: a blow-
// through, or runs out of thick channel: a short shot).
//   → { ok, gas (Uint8 per node), core (hollow share per node), residualWall (mm per node), filled (per node),
//       summary: { shot, gasVolume (share of the part), weightSaving, penetration (mm along the channel), filled,
//       blowThrough, shortShot } }
//
// Insert moulding: nodes next to an insert (points of its faces, within one cell) take the insert's temperature as
// their wall temperature (fillSimulation's `wallTemp`): a cold insert freezes the melt there sooner (higher fill
// pressure, a short shot risk), a preheated one later. insertWallTemp() builds that array.
import { fillSimulation, nearestNode } from './plastics.js';

/** Wall temperatures for inserts: nodes within `reach` (default: 1.5 cells) of any insert face point take its temperature. */
export function insertWallTemp(domain, inserts, { mould = 50, reach = null } = {}) {
  const n = domain.nodes.length, out = new Float64Array(n).fill(mould);
  const R = reach ?? 1.5 * (domain.cell ?? 1);
  let count = 0;
  for (const ins of inserts ?? []) {
    for (let i = 0; i < n; i++) {
      const c = domain.nodes[i].c;
      for (const p of ins.points) if (Math.hypot(c[0] - p[0], c[1] - p[1], domain.kind === 'midplane' ? 0 : c[2] - p[2]) <= R) { if (out[i] === mould) count++; out[i] = ins.temperature; break; }
    }
  }
  return { wallTemp: out, nodes: count };
}

/** Gas-assisted filling (see the header). process: as fillSimulation; gas: { node | point, shot, minThick, skin }. */
export function gasAssistStudy(domain, { gates = [], process = {}, gas = {} } = {}) {
  const n = domain.nodes.length;
  const shot = Math.max(0.3, Math.min(0.99, gas.shot ?? 0.85));
  const gasNode = gas.node ?? (gas.point ? nearestNode(domain, gas.point) : gates[0]);
  if (gasNode == null) return { ok: false, error: 'noGasPin' };
  // The melt: a full fill tells the order the front reaches the nodes; the short shot is its first `shot` share.
  const full = fillSimulation(domain, { ...process, gates });
  const order = [...Array(n).keys()].filter((i) => Number.isFinite(full.fillTime[i])).sort((a, b) => full.fillTime[a] - full.fillTime[b]);
  const V = domain.nodes.map((x) => x.V), Vt = V.reduce((s, v) => s + v, 0);
  const filled = new Uint8Array(n);
  let vol = 0, k = 0;
  while (k < order.length && vol + V[order[k]] <= shot * Vt + 1e-9) { filled[order[k]] = 1; vol += V[order[k]]; k++; }
  const tShot = k > 0 ? full.fillTime[order[k - 1]] : 0;
  // Nominal wall: the area-weighted (volume-weighted) median thickness.
  const hs = domain.nodes.map((x) => x.h).sort((a, b) => a - b), nominal = hs[Math.floor(hs.length / 2)] ?? 1;
  const minH = (gas.minThick ?? 1.3) * nominal, skin = gas.skin ?? 0.2;
  const frozen = full.frozenLayer;                       // % of the half-gap frozen at the end of filling
  const gasSet = new Uint8Array(n), core = new Float64Array(n), resid = new Float64Array(n);
  for (let i = 0; i < n; i++) resid[i] = domain.nodes[i].h;
  // Dijkstra over the melt from the gas pin, through thick walls.
  const dist = new Float64Array(n).fill(Infinity); dist[gasNode] = 0;
  const done = new Uint8Array(n);
  const heap = [[0, gasNode]];
  const pop = () => { let b = 0; for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[b][0]) b = i; return heap.splice(b, 1)[0]; };
  const melt = vol;                                       // the melt injected (fixed from here)
  let need = Vt - vol, freed = 0, penetration = 0, blowThrough = false;
  let frontNext = k;                                      // the next node the displaced melt fills
  while (heap.length && freed < need - 1e-9) {
    const [d, i] = pop();
    if (done[i]) continue;
    done[i] = 1;
    if (!filled[i] || domain.nodes[i].h < minH) continue;
    // The gas reaches a node at the melt front: it would blow through (the melt there has nowhere to go but out).
    if (domain.adj[i].some((e) => { const j = domain.ea[e] === i ? domain.eb[e] : domain.ea[e]; return !filled[j] && domain.nodes[j].h >= minH; }) && frontNext >= order.length) { blowThrough = true; break; }
    const h = domain.nodes[i].h, s = Math.max(skin * h, ((frozen?.[i] ?? 0) / 100) * h / 2);
    const share = Math.max(0, 1 - (2 * s) / h);
    gasSet[i] = 1; core[i] = share; resid[i] = s;
    freed += share * V[i]; penetration = Math.max(penetration, d);
    // The melt pushed out of the cores fills on where the front would go next: the cavity filled up to the melt
    // injected plus the gas cores.
    while (frontNext < order.length && vol + V[order[frontNext]] <= melt + freed + 1e-9) { const j = order[frontNext]; filled[j] = 1; vol += V[j]; frontNext++; }
    for (const e of domain.adj[i]) {
      const j = domain.ea[e] === i ? domain.eb[e] : domain.ea[e];
      if (done[j]) continue;
      const L = Math.hypot(...[0, 1, 2].map((q) => domain.nodes[j].c[q] - domain.nodes[i].c[q])) || domain.cell || 1;
      const hh = Math.min(domain.nodes[i].h, domain.nodes[j].h);
      const nd = d + L / (hh * hh);
      if (nd < dist[j]) { dist[j] = nd; heap.push([nd, j]); }
    }
  }
  // Penetration as a length: the longest straight-line reach of the gas from the pin.
  let reach = 0; const g0 = domain.nodes[gasNode].c;
  for (let i = 0; i < n; i++) if (gasSet[i]) reach = Math.max(reach, Math.hypot(...[0, 1, 2].map((q) => domain.nodes[i].c[q] - g0[q])));
  const gasVol = core.reduce((s, c, i) => s + c * V[i], 0);
  const allFilled = order.every((i) => filled[i]);
  return {
    ok: true, gas: gasSet, core, residualWall: resid, filled, fillTime: full.fillTime, melt: full, gasNode,
    summary: { shot, tShot, gasVolume: gasVol / Vt, weightSaving: gasVol / Vt, penetration: reach, filled: filled.reduce((s, f, i) => s + (f ? V[i] : 0), 0) / Vt, complete: allFilled && !blowThrough, blowThrough, shortShot: !allFilled, nominalWall: nominal, gasNodes: gasSet.reduce((s, x) => s + x, 0) },
  };
}
