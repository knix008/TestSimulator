// The critical path, traced both ways over the scheduled plan.
//
// schedule() already runs the forward pass (earliest start/finish, top → bottom)
// and the backward pass (latest start/finish, bottom → top); a task is critical
// when its total slack is gone. Here the critical tasks are linked into chains:
//   - top → bottom: from the tasks that open a chain (no critical predecessor),
//     follow critical successors;
//   - bottom → top: from the tasks that close a chain (no critical successor,
//     normally the ones that finish the project), follow critical predecessors.
// A task reached both ways lies on a complete start-to-finish critical chain.

const MAX_CHAINS = 20;

/**
 * Returns { ids: Set of critical leaf task ids on a full chain, summaries: Set of
 * summary ids that contain one, chains: [[id, …], …] from start to finish (rows
 * order), starts, ends, links: Set of "from>to" critical link keys, finish, duration }.
 */
export function criticalPath(project, sched) {
  const graph = sched.graph;
  const info = (id) => sched.info(id);
  const critical = new Set((graph?.leaves ?? []).filter((id) => info(id)?.critical && !info(id)?.summary));
  const preds = new Map([...critical].map((id) => [id, []]));
  const succs = new Map([...critical].map((id) => [id, []]));
  for (const to of critical) {
    for (const edge of graph.incoming.get(to) ?? []) {
      for (const from of edge.from) {
        if (!critical.has(from) || from === to) continue;
        if (!preds.get(to).includes(from)) preds.get(to).push(from);
        if (!succs.get(from).includes(to)) succs.get(from).push(to);
      }
    }
  }
  const rowOf = (id) => info(id)?.row ?? 0;
  const byRow = (a, b) => rowOf(a) - rowOf(b);
  const starts = [...critical].filter((id) => !preds.get(id).length).sort(byRow);
  const ends = [...critical].filter((id) => !succs.get(id).length).sort(byRow);
  const walk = (from, next) => {
    const seen = new Set(from);
    const queue = [...from];
    while (queue.length) for (const id of next.get(queue.shift())) if (!seen.has(id)) { seen.add(id); queue.push(id); }
    return seen;
  };
  const down = walk(starts, succs); // top → bottom
  const up = walk(ends, preds); // bottom → top
  const ids = new Set([...critical].filter((id) => down.has(id) && up.has(id)));
  // Start-to-finish chains (depth first, in row order; capped for huge plans).
  const chains = [];
  const extend = (path) => {
    if (chains.length >= MAX_CHAINS) return;
    const last = path[path.length - 1];
    const next = succs.get(last).filter((id) => ids.has(id) && !path.includes(id)).sort(byRow);
    if (!next.length) { chains.push(path); return; }
    for (const id of next) extend([...path, id]);
  };
  for (const id of starts) if (ids.has(id)) extend([id]);
  const links = new Set();
  for (const chain of chains) for (let i = 1; i < chain.length; i++) links.add(`${chain[i - 1]}>${chain[i]}`);
  const summaries = new Set();
  for (const id of ids) for (let up2 = sched.outline?.parent.get(id); up2; up2 = sched.outline.parent.get(up2)) summaries.add(up2);
  const startMin = Math.min(...[...ids].map((id) => info(id).start));
  const finishMin = Math.max(...[...ids].map((id) => info(id).finish));
  return {
    ids, summaries, chains, links,
    starts: starts.filter((id) => ids.has(id)),
    ends: ends.filter((id) => ids.has(id)),
    start: ids.size ? startMin : null,
    finish: ids.size ? finishMin : null,
  };
}
