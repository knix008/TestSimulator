// Automatic arrangement of a graph (the editor's "Arrange" and new templates): columns by distance from the
// triggers, nodes of a column stacked and centred; nodes hanging on an agent's tools port go below the agent.
// Pure (the editor imports it too).
import { nodeDef } from './nodes/defs.js';

export const NODE_W = 220;
export const COL_GAP = 90;
export const ROW_GAP = 46;
export const BAND_GAP = 90;
/** The shape new documents (templates, built agents) are laid out for: a wide screen. */
export const SCREEN_ASPECT = 1.7;

export const nodeHeight = (node) => (node.h ? node.h : nodeDef(node.type)?.note ? 120 : 76);

/** Edges that close a cycle (a retry or "another round" going back): found depth first from the triggers. */
export function backEdges(nodes, edges) {
  const flow = edges.filter((e) => e.fromPort !== 'tools');
  const out = new Map();
  for (const e of flow) { if (!out.has(e.from)) out.set(e.from, []); out.get(e.from).push(e); }
  const state = new Map();
  const back = new Set();
  const visit = (id) => {
    state.set(id, 1);
    for (const e of out.get(id) ?? []) {
      const st = state.get(e.to);
      if (st === 1) back.add(e.id);
      else if (!st) visit(e.to);
    }
    state.set(id, 2);
  };
  const hasIn = new Set(flow.map((e) => e.to));
  for (const n of nodes) if (!hasIn.has(n.id) || nodeDef(n.type)?.trigger) if (!state.get(n.id)) visit(n.id);
  for (const n of nodes) if (!state.get(n.id)) visit(n.id);
  return back;
}

/** aspect: the width / height to aim for (0: one long row of columns). */
export function autoLayout(nodes, edges, { x0 = 80, y0 = 80, aspect = 0 } = {}) {
  const back = backEdges(nodes, edges);
  const flow = edges.filter((e) => e.fromPort !== 'tools' && !back.has(e.id));
  const toolEdges = edges.filter((e) => e.fromPort === 'tools');
  const toolNodes = new Set(toolEdges.map((e) => e.to));
  const incoming = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of flow) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
  const rank = new Map();
  const queue = nodes.filter((n) => !incoming.get(n.id) && !toolNodes.has(n.id) && !nodeDef(n.type)?.note).map((n) => n.id);
  for (const id of queue) rank.set(id, 0);
  // longest path, guarded against cycles
  for (let guard = 0; queue.length && guard < 10000; guard += 1) {
    const id = queue.shift();
    for (const e of flow.filter((x) => x.from === id)) {
      const r = (rank.get(id) ?? 0) + 1;
      if ((rank.get(e.to) ?? -1) < r && r < nodes.length + 1) { rank.set(e.to, r); queue.push(e.to); }
    }
  }
  const columns = new Map();
  for (const n of nodes) {
    if (toolNodes.has(n.id) || nodeDef(n.type)?.note) continue;
    const r = rank.get(n.id) ?? 0;
    if (!columns.has(r)) columns.set(r, []);
    columns.get(r).push(n);
  }
  // Columns go left to right. With an aspect (width / height of the screen or the paper) a long flow wraps
  // into bands, read like lines of text: the band count whose box comes closest to that shape wins.
  const ranks = [...columns.keys()].sort((a, b) => a - b);
  const colHeight = (r) => columns.get(r).reduce((h, n) => h + nodeHeight(n) + ROW_GAP, -ROW_GAP);
  const byAgent = new Map();
  for (const e of toolEdges) { if (!byAgent.has(e.from)) byAgent.set(e.from, []); byAgent.get(e.from).push(e.to); }
  const toolRow = (r) => columns.get(r).some((n) => byAgent.has(n.id));
  const bandsOf = (per) => {
    const out = [];
    for (let i = 0; i < ranks.length; i += per) {
      const rs = ranks.slice(i, i + per);
      const tallest = Math.max(0, ...rs.map(colHeight));
      out.push({ ranks: rs, tallest, height: tallest + (rs.some(toolRow) ? 60 + 80 : 0) });
    }
    return out;
  };
  let per = Math.max(1, ranks.length);
  // a flow that fits a screen as it is (up to 5 columns) stays one row; a row keeps at least 4 columns
  if (aspect > 0 && ranks.length > 5) {
    let best = Infinity;
    for (let p = ranks.length; p >= 4; p -= 1) {
      const bands = bandsOf(p);
      const w = Math.min(p, ranks.length) * (NODE_W + COL_GAP) - COL_GAP;
      const h = bands.reduce((sum, b) => sum + b.height, 0) + (bands.length - 1) * BAND_GAP;
      const miss = Math.abs(Math.log(w / Math.max(1, h)) - Math.log(aspect));
      if (miss < best - 1e-9) { best = miss; per = p; }
    }
  }
  const pos = new Map();
  let top = y0;
  let bottom = y0;
  for (const band of bandsOf(per)) {
    band.ranks.forEach((r, i) => {
      const list = columns.get(r);
      let y = top + (band.tallest - colHeight(r)) / 2;
      for (const n of list) { pos.set(n.id, { x: x0 + i * (NODE_W + COL_GAP), y: Math.round(y) }); y += nodeHeight(n) + ROW_GAP; }
    });
    // tools under their agent, side by side, below the band's columns
    for (const r of band.ranks) {
      for (const n of columns.get(r)) {
        const tools = byAgent.get(n.id);
        if (!tools) continue;
        const a = pos.get(n.id);
        const startX = a.x - ((tools.length - 1) * (NODE_W + 30)) / 2;
        tools.forEach((id, i) => { if (!pos.has(id)) pos.set(id, { x: Math.round(startX + i * (NODE_W + 30)), y: Math.max(a.y + 170, top + band.tallest + 60) }); });
      }
    }
    bottom = Math.max(bottom, top + band.tallest, ...[...pos.values()].map((p) => p.y + 80));
    top = bottom + BAND_GAP;
  }
  // tools of an agent that is itself a tool (or not placed): under everything
  for (const [agentId, tools] of byAgent) {
    const a = pos.get(agentId) ?? { x: x0, y: bottom };
    const startX = a.x - ((tools.length - 1) * (NODE_W + 30)) / 2;
    tools.forEach((id, i) => { if (!pos.has(id)) pos.set(id, { x: Math.round(startX + i * (NODE_W + 30)), y: Math.max(a.y + 170, bottom + 60) }); });
  }
  bottom = Math.max(bottom, ...[...pos.values()].map((p) => p.y + 80));
  let noteX = x0;
  for (const n of nodes) if (!pos.has(n.id)) { pos.set(n.id, { x: noteX, y: bottom + 70 }); noteX += NODE_W + 40; }
  return nodes.map((n) => ({ ...n, ...pos.get(n.id) }));
}
