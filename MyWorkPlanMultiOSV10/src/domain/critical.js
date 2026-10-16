// The critical path: the driving chains that run to the project finish.
//
// schedule() marks a task critical when its total slack is gone (finished work
// included) and records which predecessor actually sets each task's start.
// Tracing walks backward from the tasks that finish the project, along those
// driving links only, so the chains run from the opening critical task to the
// project finish. A link that does not move its successor is not a step.

const MAX_CHAINS = 20;

/**
 * Returns { ids: Set of critical leaf task ids on a chain that reaches the project
 * finish, summaries: Set of summary ids that contain one, chains: [[id, …], …] in
 * row order, starts, ends, links: Set of "from>to" driving link keys, start, finish }.
 */
export function criticalPath(project, sched) {
  const graph = sched.graph;
  const info = (id) => sched.info(id);
  const critical = new Set((graph?.leaves ?? []).filter((id) => info(id)?.critical && !info(id)?.summary));
  const preds = new Map([...critical].map((id) => [id, []]));
  const succs = new Map([...critical].map((id) => [id, []]));
  for (const to of critical) {
    for (const from of graph.driving?.get(to) ?? []) {
      if (!critical.has(from) || from === to) continue;
      if (!preds.get(to).includes(from)) preds.get(to).push(from);
      if (!succs.get(from).includes(to)) succs.get(from).push(to);
    }
  }
  const rowOf = (id) => info(id)?.row ?? 0;
  const byRow = (a, b) => rowOf(a) - rowOf(b);
  const reachable = (from, next) => {
    const seen = new Set(from);
    const queue = [...from];
    while (queue.length) for (const id of next.get(queue.shift()) ?? []) if (!seen.has(id)) { seen.add(id); queue.push(id); }
    return seen;
  };
  // Backward from whatever finishes the project: those tasks, and the driving
  // critical work in front of them, are the path from its opening task to the end.
  const finishers = [...critical].filter((id) => info(id).finish === sched.finish);
  const ids = reachable(finishers, preds);
  const starts = [...ids].filter((id) => !(preds.get(id) ?? []).some((pred) => ids.has(pred))).sort(byRow);
  const ends = [...ids].filter((id) => !(succs.get(id) ?? []).some((succ) => ids.has(succ))).sort(byRow);
  // Start-to-finish chains (depth first, in row order; capped for huge plans).
  const chains = [];
  const extend = (path) => {
    if (chains.length >= MAX_CHAINS) return;
    const last = path[path.length - 1];
    const next = (succs.get(last) ?? []).filter((id) => ids.has(id) && !path.includes(id)).sort(byRow);
    if (!next.length) {
      if (info(last).finish === sched.finish) chains.push(path);
      return;
    }
    for (const id of next) extend([...path, id]);
  };
  for (const id of starts) extend([id]);
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
