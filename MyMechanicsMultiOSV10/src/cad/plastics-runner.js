// Runners and multi-cavity / family moulds for the injection moulding flow (no DOM).
//
// The cavities (copies of one part, or different parts for a family mould) are laid out in two rows on either side
// of a primary runner along x through the sprue; a branch runner runs along y from the primary runner to each
// cavity's gate, ending in a gate land. Runners are round channels discretised into nodes of the same flow graph
// as the cavities (cad/plastics.js): node volume π r² Δ, wall "thickness" its diameter, edge conductance
// π r⁴ / (8 Δ) (Hagen–Poiseuille, so the flow through an edge is that over the melt viscosity times the pressure
// drop — the same form as the cavities' Hele-Shaw edges). The whole system fills from the sprue node.
//
// Results per cavity: fill time (its last node), filled share, volume; the imbalance (max − min) / max of the
// cavities' fill times; the runner's volume and its share of the shot (scrap); the sprue pressure.
// balanceRunners() resizes the branches and their gates (d ← d · (t_i / t̄)^0.4, clamped) until the cavities fill together.
import { partDomain, suggestGate, nearestNode, fillSimulation } from './plastics.js';

const translateMesh = (mesh, o) => ({ ...mesh, vertices: Float32Array.from(mesh.vertices, (v, i) => v + o[i % 3]) });

function bounds(mesh) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.vertices.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], mesh.vertices[i + k]); hi[k] = Math.max(hi[k], mesh.vertices[i + k]); }
  return { lo, hi };
}

/**
 * Cavity placement: alternately above (+y) and below (−y) the runner line y = 0, columns along x centred on the
 * sprue at x = 0, each part centred on its column with a clearance `gap` (mm) from the runner and between columns.
 * cavities: [{ mesh }] → [offset [dx, dy, dz]] (the parts' tops brought to z = 0, the parting plane).
 */
export function layoutCavities(cavities, { gap = 10 } = {}) {
  const B = cavities.map((c) => bounds(c.mesh));
  const cols = Math.ceil(cavities.length / 2);
  const colWidth = Array.from({ length: cols }, (_, j) => Math.max(...[2 * j, 2 * j + 1].filter((i) => i < cavities.length).map((i) => B[i].hi[0] - B[i].lo[0])));
  const total = colWidth.reduce((s, w) => s + w, 0) + gap * (cols - 1);
  const xs = []; let x = -total / 2;
  for (const w of colWidth) { xs.push(x + w / 2); x += w + gap; }
  return cavities.map((c, i) => {
    const b = B[i], col = Math.floor(i / 2), up = i % 2 === 0;
    const cx = (b.lo[0] + b.hi[0]) / 2;
    const dy = up ? gap - b.lo[1] : -gap - b.hi[1];
    return [xs[col] - cx, dy, -b.hi[2]];
  });
}

/** Runner nodes along a polyline (points), spacing ≤ step; returns the node indices (first = the start point). */
function addChannel(d, points, r, step, startNode = -1) {
  const ids = [];
  const addNode = (c, V) => { d.nodes.push({ c, V, h: 2 * r, runner: true, cols: [] }); return d.nodes.length - 1; };
  let prev = startNode >= 0 ? startNode : addNode(points[0].slice(), Math.PI * r * r * step / 2);
  ids.push(prev);
  for (let s = 1; s < points.length; s++) {
    const a = points[s - 1], b = points[s], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (L < 1e-9) continue;
    const n = Math.max(1, Math.ceil(L / step)), dl = L / n;
    for (let k = 1; k <= n; k++) {
      const c = [0, 1, 2].map((q) => a[q] + ((b[q] - a[q]) * k) / n);
      const id = addNode(c, Math.PI * r * r * dl);
      d.edges.push([prev, id, (Math.PI * r ** 4) / (8 * dl)]);
      prev = id; ids.push(id);
    }
  }
  return ids;
}

/**
 * The mould's flow graph: the cavities' domains (translated by their offsets) and the runner system.
 * cavities: [{ mesh, gate: [x,y,z] in the part's own coordinates (or null: suggested), offset }]
 * runner: { diameter (primary, mm), branch (diameter, or per cavity: branches[i]), gateDiameter, gateLength }
 * → { domain, sprue, cavities: [{ start, end (node range), gateNode, branchDiameter, branchLength }], runner: { start, end, volume, length } }
 */
export function mouldDomain(cavities, runner = {}, { cells = 30, mode = 'auto', budget = 30000 } = {}) {
  const D = runner.diameter ?? 6, rP = D / 2;
  const d = { kind: null, nodes: [], edges: [], cell: Infinity };
  const out = [];
  for (const [i, c] of cavities.entries()) {
    const m = translateMesh(c.mesh, c.offset ?? [0, 0, 0]);
    // One kind for all the cavities (the first one's, unless given): the fill's conductance law is per domain.
    const cd = partDomain(m, { cells, mode: d.kind ?? mode, budget });
    d.kind ??= cd.kind;
    d.cell = Math.min(d.cell, cd.cell); d.hz = cd.hz; d.partingZ = cd.partingZ;
    const start = d.nodes.length;
    for (const n of cd.nodes) d.nodes.push({ ...n, cavity: i });
    for (const [a, b, g] of cd.edges) d.edges.push([a + start, b + start, g]);
    const gp = c.gate ? c.gate.map((v, k) => v + (c.offset?.[k] ?? 0)) : null;
    const gateNode = gp ? start + nearestNode(cd, gp) : start + suggestGate(cd);
    out.push({ start, end: d.nodes.length, gateNode, name: c.name ?? `#${i + 1}` });
  }
  // Runners at the parting plane (z = 0 after the layout), the primary along y = 0.
  const zR = 0, step = Math.max(d.cell, D / 2);
  const rStart = d.nodes.length;
  const sprueP = [0, 0, zR];
  const attach = out.map((c) => d.nodes[c.gateNode].c[0]);
  // Primary runner: from the sprue to the farthest attach point on each side, nodes at every attach point.
  const sprue = addChannel(d, [sprueP], rP, step)[0];
  const primaryAt = new Map();        // attach x → node
  for (const side of [1, -1]) {
    const xs = [...new Set(attach.filter((x) => Math.sign(x || 1) === side || (side === 1 && x === 0)))].sort((a, b) => side * (a - b));
    let from = sprue, fromX = 0;
    for (const x of xs) {
      if (Math.abs(x - fromX) < 1e-9) { primaryAt.set(x, from); continue; }
      const ids = addChannel(d, [[fromX, 0, zR], [x, 0, zR]], rP, step, from);
      from = ids.at(-1); fromX = x; primaryAt.set(x, from);
    }
  }
  let runnerLength = 0;
  out.forEach((c, i) => {
    const g = d.nodes[c.gateNode].c, x = g[0];
    const dB = runner.branches?.[i] ?? runner.branch ?? D, rB = dB / 2;
    const root = primaryAt.get(x) ?? sprue;
    // Branch: from the primary runner along y to the gate's y, then down to the gate (at the part's face).
    const pts = [[x, 0, zR], [x, g[1], zR]];
    const ids = addChannel(d, pts, rB, step, root);
    const last = ids.at(-1);
    // Gate: given, or 0.6 × its branch (so resizing a branch for balance resizes its gate too).
    const rg = (runner.gateDiameter ?? 0.6 * dB) / 2, Lg = Math.max(0.5, runner.gateLength ?? 1, Math.abs(g[2] - zR));
    d.edges.push([last, c.gateNode, (Math.PI * rg ** 4) / (8 * Lg)]);
    c.branchDiameter = dB; c.branchLength = Math.abs(g[1]);
    runnerLength += Math.abs(g[1]);
  });
  runnerLength += Math.max(0, ...attach) - Math.min(0, ...attach);
  const rEnd = d.nodes.length;
  let rv = 0; for (let n = rStart; n < rEnd; n++) rv += d.nodes[n].V;
  // Finish the graph as plastics.js expects.
  const n = d.nodes.length;
  d.adj = Array.from({ length: n }, () => []);
  d.edges.forEach(([a, b], e) => { d.adj[a].push(e); d.adj[b].push(e); });
  d.ea = Int32Array.from(d.edges, (e) => e[0]); d.eb = Int32Array.from(d.edges, (e) => e[1]);
  d.volume = d.nodes.reduce((s, x) => s + x.V, 0);
  return { domain: d, sprue, cavities: out, runner: { start: rStart, end: rEnd, volume: rv, length: runnerLength } };
}

/** Per-cavity results of a fill on a mould domain. */
function perCavity(md, r) {
  return md.cavities.map((c) => {
    let last = 0, vol = 0, filledVol = 0, all = true;
    for (let i = c.start; i < c.end; i++) {
      const V = md.domain.nodes[i].V; vol += V;
      const t = r.fillTime[i];
      if (Number.isFinite(t)) { filledVol += V; last = Math.max(last, t); } else all = false;
    }
    return { name: c.name, fillTime: last, filled: filledVol / vol, complete: all, volume: vol, branchDiameter: c.branchDiameter, gateNode: c.gateNode };
  });
}

/**
 * The fill of a multi-cavity mould: { cavities: [{ mesh, gate, name }], runner, process, domain: { cells, mode },
 * gap } → { result (fillSimulation on the whole graph), mould (the graph), cavities: per cavity, imbalance,
 * runnerVolume, runnerShare, spruePressure (MPa), offsets }.
 */
export function multiCavityStudy({ cavities, runner = {}, process = {}, domain: dOpts = {}, gap = 10, offsets = null, signal = null }) {
  if (!cavities?.length) return { ok: false, error: 'noCavities' };
  const offs = offsets ?? layoutCavities(cavities, { gap });
  const md = mouldDomain(cavities.map((c, i) => ({ ...c, offset: offs[i] })), runner, dOpts);
  const r = fillSimulation(md.domain, { ...process, gates: [md.sprue], signal });
  const per = perCavity(md, r);
  const times = per.map((c) => c.fillTime), tMax = Math.max(...times), tMin = Math.min(...times);
  const imbalance = per.every((c) => c.complete) && tMax > 0 ? (tMax - tMin) / tMax : 1;
  const cavVol = per.reduce((s, c) => s + c.volume, 0);
  return {
    ok: true, result: r, mould: md, cavities: per, imbalance, offsets: offs,
    runnerVolume: md.runner.volume, runnerLength: md.runner.length, runnerShare: md.runner.volume / (md.runner.volume + cavVol),
    spruePressure: r.summary?.gatePressure ?? null, shortShot: per.some((c) => !c.complete),
  };
}

/**
 * Balances the branches: repeated fills, each cavity's branch diameter scaled by (its fill time / the mean)^0.4
 * (a late cavity gets a wider branch), within 0.35…2 × the primary diameter, until the imbalance is under `target`.
 * Returns the last study with { branches, iterations, history: [imbalance …] }.
 */
export function balanceRunners(input, { target = 0.03, maxIterations = 8 } = {}) {
  const D = input.runner?.diameter ?? 6;
  let branches = input.cavities.map((_, i) => input.runner?.branches?.[i] ?? input.runner?.branch ?? D);
  const offsets = input.offsets ?? layoutCavities(input.cavities, { gap: input.gap ?? 10 });
  const history = [];
  let s = null;
  for (let it = 0; it < maxIterations; it++) {
    s = multiCavityStudy({ ...input, offsets, runner: { ...input.runner, branches } });
    history.push(s.imbalance);
    if (s.imbalance <= target) break;
    const times = s.cavities.map((c) => (c.complete ? c.fillTime : Infinity));
    const finite = times.filter(Number.isFinite), mean = finite.reduce((a, v) => a + v, 0) / Math.max(1, finite.length);
    branches = branches.map((dB, i) => {
      const ratio = Number.isFinite(times[i]) ? times[i] / mean : 1.5;
      return Math.min(2 * D, Math.max(0.35 * D, dB * ratio ** 0.4));
    });
  }
  return { ...s, branches: s.cavities.map((c) => c.branchDiameter), iterations: history.length, history };
}
