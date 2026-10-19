// BPMN process simulation (Visual Paradigm's "Animation" / process simulation): tokens leave the
// start events and travel along the sequence flows of a BPMN diagram, one hop per step.
//   - an activity or event passes its token on along every outgoing flow (no outgoing flow:
//     the token ends there, an implicit end);
//   - an exclusive (or event-based, complex) gateway sends it along one flow, an inclusive gateway
//     along one or more, a parallel gateway along all of them;
//   - a parallel join waits for a token from every incoming flow, an inclusive join until no
//     other token can still reach it; an exclusive join lets each token through;
//   - an end event consumes the token.
// A run ends when no token is left (completed), when the only tokens left wait at joins that can
// never fire (deadlock), or after `maxSteps` (a loop that never ends). Choices come from a seeded
// random generator, so a run can be repeated. `analyse` runs it many times: how often each
// element and flow is used, how runs end, and which elements no run reaches. Pure (no DOM).
import { buildIndex, isEdgeView, refId, viewsOf } from './model.js';

const ACTIVITIES = new Set(['BPMNTask', 'BPMNSubProcess', 'BPMNCallActivity']);
const EVENTS = new Set(['BPMNIntermediateEvent', 'BPMNBoundaryEvent']);
const GATEWAYS = {
  BPMNExclusiveGateway: 'exclusive', BPMNEventBasedGateway: 'exclusive', BPMNComplexGateway: 'exclusive',
  BPMNParallelGateway: 'parallel', BPMNInclusiveGateway: 'inclusive',
};

/** The kind of a BPMN element in the simulation, or null when it takes no part. */
export function simKind(type) {
  if (type === 'BPMNStartEvent') return 'start';
  if (type === 'BPMNEndEvent') return 'end';
  if (ACTIVITIES.has(type)) return 'activity';
  if (EVENTS.has(type)) return 'event';
  return GATEWAYS[type] ?? null;
}

/**
 * The flow graph of a BPMN diagram: nodes (view id → { viewId, element, kind }) and the sequence
 * flows between them (out / in: view id → [{ edgeId, from, to, element }]).
 */
export function simulationGraph(project, diagram) {
  const index = buildIndex(project);
  const nodes = new Map();
  for (const view of viewsOf(diagram)) {
    if (isEdgeView(view) || !view.model) continue;
    const element = index.get(refId(view.model));
    const kind = element ? simKind(element._type) : null;
    if (kind) nodes.set(view._id, { viewId: view._id, element, kind });
  }
  const out = new Map([...nodes.keys()].map((id) => [id, []]));
  const into = new Map([...nodes.keys()].map((id) => [id, []]));
  for (const view of viewsOf(diagram)) {
    if (!isEdgeView(view) || !view.model) continue;
    const element = index.get(refId(view.model));
    if (element?._type !== 'BPMNSequenceFlow') continue;
    const from = refId(view.tail); const to = refId(view.head);
    if (!nodes.has(from) || !nodes.has(to)) continue;
    const flow = { edgeId: view._id, from, to, element };
    out.get(from).push(flow);
    into.get(to).push(flow);
  }
  return { nodes, out, in: into };
}

/** A small seeded random generator (mulberry32): the same seed gives the same run. */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A new run: one token on every start event. */
export function createSimulation(graph, { seed = 1, maxSteps = 400 } = {}) {
  const sim = {
    graph, rand: random(seed), maxSteps, step: 0, nextId: 1,
    tokens: [], waiting: new Map(), visits: new Map(), flows: new Map(),
    completed: 0, implicitEnds: 0, status: 'running', stuckAt: [], log: [],
  };
  for (const node of graph.nodes.values()) if (node.kind === 'start') arrive(sim, node.viewId, null);
  if (!sim.tokens.length) sim.status = 'noStart';
  return sim;
}

function arrive(sim, viewId, edgeId) {
  sim.visits.set(viewId, (sim.visits.get(viewId) ?? 0) + 1);
  const node = sim.graph.nodes.get(viewId);
  const incoming = sim.graph.in.get(viewId).length;
  if ((node.kind === 'parallel' || node.kind === 'inclusive') && incoming > 1) {
    // A join: the token waits here (per incoming flow).
    const held = sim.waiting.get(viewId) ?? new Map();
    held.set(edgeId, (held.get(edgeId) ?? 0) + 1);
    sim.waiting.set(viewId, held);
    return;
  }
  sim.tokens.push({ id: sim.nextId++, at: viewId });
}

/** Can a token at `from` still reach `target` (following the flows)? */
function reaches(graph, from, target) {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift();
    if (id === target) return true;
    for (const flow of graph.out.get(id) ?? []) if (!seen.has(flow.to)) { seen.add(flow.to); queue.push(flow.to); }
  }
  return false;
}

/** The flows a token leaves a node along. */
function choose(sim, node) {
  const flows = sim.graph.out.get(node.viewId);
  if (!flows.length) return [];
  if (node.kind === 'exclusive') {
    const plain = flows.filter((flow) => !flow.element.isDefault);
    const pool = plain.length ? plain : flows;
    return [pool[Math.floor(sim.rand() * pool.length)]];
  }
  if (node.kind === 'inclusive' && flows.length > 1) {
    const picked = flows.filter(() => sim.rand() < 0.5);
    return picked.length ? picked : [flows[Math.floor(sim.rand() * flows.length)]];
  }
  return flows;
}

/**
 * One step: every token moves one hop, then joins that can fire do. Returns the moves
 * [{ token, from, to, edgeId }] (for the animation); `sim.status` tells how the run stands.
 */
export function stepSimulation(sim) {
  if (sim.status !== 'running') return [];
  sim.step += 1;
  const moves = [];
  const tokens = sim.tokens;
  sim.tokens = [];
  const arrivals = [];
  for (const token of tokens) {
    const node = sim.graph.nodes.get(token.at);
    if (node.kind === 'end') { sim.completed += 1; continue; }
    const flows = choose(sim, node);
    if (!flows.length) { sim.implicitEnds += 1; continue; }
    for (const flow of flows) {
      sim.flows.set(flow.edgeId, (sim.flows.get(flow.edgeId) ?? 0) + 1);
      moves.push({ token: token.id, from: flow.from, to: flow.to, edgeId: flow.edgeId });
      arrivals.push(flow);
    }
  }
  for (const flow of arrivals) arrive(sim, flow.to, flow.edgeId);
  // Joins: parallel when every incoming flow brought a token; inclusive when nothing else can still come.
  for (const [viewId, held] of sim.waiting) {
    const node = sim.graph.nodes.get(viewId);
    const incoming = sim.graph.in.get(viewId);
    let fire = false;
    if (node.kind === 'parallel') fire = incoming.every((flow) => (held.get(flow.edgeId) ?? 0) > 0);
    else fire = held.size > 0 && !sim.tokens.some((token) => token.at !== viewId && reaches(sim.graph, token.at, viewId))
      && ![...sim.waiting.keys()].some((other) => other !== viewId && reaches(sim.graph, other, viewId) && sim.waiting.get(other).size);
    if (!fire) continue;
    if (node.kind === 'parallel') { for (const flow of incoming) { const left = held.get(flow.edgeId) - 1; if (left > 0) held.set(flow.edgeId, left); else held.delete(flow.edgeId); } } else held.clear();
    if (!held.size) sim.waiting.delete(viewId);
    sim.tokens.push({ id: sim.nextId++, at: viewId });
  }
  const waitingTokens = [...sim.waiting.values()].reduce((sum, held) => sum + [...held.values()].reduce((a, b) => a + b, 0), 0);
  if (!sim.tokens.length && !waitingTokens) sim.status = 'completed';
  else if (!sim.tokens.length) { sim.status = 'deadlock'; sim.stuckAt = [...sim.waiting.keys()]; } else if (sim.step >= sim.maxSteps) sim.status = 'limit';
  return moves;
}

/** Runs to the end. */
export function runSimulation(graph, options = {}) {
  const sim = createSimulation(graph, options);
  while (sim.status === 'running') stepSimulation(sim);
  return sim;
}

/**
 * `runs` runs with seeds 1…runs: how they end, how often each element and flow is used (in how
 * many runs), and the elements and flows no run reached.
 */
export function analyseSimulation(graph, { runs = 100, maxSteps = 400 } = {}) {
  const result = { runs, completed: 0, deadlock: 0, limit: 0, noStart: 0, steps: 0, nodeRuns: new Map(), flowRuns: new Map(), deadlockAt: new Map() };
  for (let seed = 1; seed <= runs; seed++) {
    const sim = runSimulation(graph, { seed, maxSteps });
    result[sim.status] = (result[sim.status] ?? 0) + 1;
    result.steps += sim.step;
    for (const id of sim.visits.keys()) result.nodeRuns.set(id, (result.nodeRuns.get(id) ?? 0) + 1);
    for (const id of sim.flows.keys()) result.flowRuns.set(id, (result.flowRuns.get(id) ?? 0) + 1);
    for (const id of sim.stuckAt) result.deadlockAt.set(id, (result.deadlockAt.get(id) ?? 0) + 1);
  }
  result.averageSteps = runs ? result.steps / runs : 0;
  result.unreached = [...graph.nodes.keys()].filter((id) => !result.nodeRuns.has(id));
  result.unusedFlows = [...graph.out.values()].flat().map((flow) => flow.edgeId).filter((id) => !result.flowRuns.has(id));
  return result;
}
