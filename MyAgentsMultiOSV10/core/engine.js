// The run engine (ARCHITECTURE.md §3): runs an agent's graph from a trigger and reports every step as it
// happens, so the canvas can show the run live.
//
// Semantics
// - A run starts at the trigger node that matches the trigger kind (else the first trigger node).
// - A node runs once per arriving input; its result goes out on one or more ports to the connected nodes.
// - A Merge node waits for one input on each incoming edge; when nothing else is left to run it goes on with
//   what arrived.
// - A Loop node runs its "item" branch to the end for each item, then sends { items, count } out of "done".
// - An AI agent's "tools" port does not run on its own: each connected node is a tool the model may call; a
//   call runs that node (and what follows it) and the last output is the tool's answer.
// - Human nodes pause the run (status "waiting") until resume() answers them.
//
// Events (core.events): run.started · run.step (start / end, with the step) · run.edge (data went along an
// edge) · run.tool (an agent's tool call started / ended) · run.log · run.notify · run.waiting · run.finished.
import { newId } from './ids.js';
import { AppError, NotFoundError } from './errors.js';
import { render, toText } from './expr.js';
import { nodeDef, outputPorts, isTrigger } from './nodes/defs.js';
import { EXECUTORS } from './nodes/runtime.js';
import { chat as providerChat, parseModelRef, providerInfo } from './providers/index.js';

const MAX_STEPS = 2000;
const MAX_VISITS = 500;
const MAX_DEPTH = 5;
const MAX_STRING = 20000;

/** A copy small enough to keep and send (long strings shortened, depth limited). */
export function snapshot(value, depth = 0) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value ?? null;
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… (+${value.length - MAX_STRING} chars)` : value;
  if (depth > 12) return '[…]';
  if (Array.isArray(value)) return (value.length > 500 ? value.slice(0, 500) : value).map((v) => snapshot(v, depth + 1));
  if (typeof value === 'object') {
    if (value instanceof Date) return value.toISOString();
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 300)) if (typeof v !== 'function') out[k] = snapshot(v, depth + 1);
    return out;
  }
  return String(value);
}

class StopRun extends Error { constructor(status, message) { super(message); this.status = status; } }

export function createEngine(core) {
  const { store, events } = core;
  /** runId → { run, agent, controller, waiters: Map<stepId, resolve>, done } */
  const active = new Map();
  const saveTimers = new Map();

  const emit = (type, run, data = {}) => events.emit({ type, data: { runId: run.id, agentId: run.agentId, ...data } });
  const publicRun = (run) => run;

  function persist(run, { now = false } = {}) {
    if (run.ephemeral) return;
    clearTimeout(saveTimers.get(run.id));
    if (now) { saveTimers.delete(run.id); store.runs.put(run); return; }
    saveTimers.set(run.id, setTimeout(() => { saveTimers.delete(run.id); store.runs.put(run); }, 400));
  }

  function loadAgent(agentOrId) {
    if (agentOrId && typeof agentOrId === 'object') return agentOrId;
    const agent = store.agents.get(agentOrId);
    if (!agent) throw new NotFoundError('AGENT_NOT_FOUND', `Agent "${agentOrId}" not found`);
    return agent;
  }

  function startNode(agent, trigger) {
    const nodes = agent.nodes ?? [];
    if (trigger.nodeId) {
      const n = nodes.find((x) => x.id === trigger.nodeId);
      if (!n) throw new AppError('NODE_NOT_FOUND', `No node "${trigger.nodeId}"`, 400);
      return n;
    }
    const triggers = nodes.filter((n) => isTrigger(n) && !n.disabled);
    const match = triggers.find((n) => nodeDef(n.type).trigger === trigger.kind) ?? triggers[0];
    if (!match) throw new AppError('NO_TRIGGER', 'The agent has no trigger node (add Manual trigger, Chat message, Webhook or Schedule)', 400);
    return match;
  }

  function defaultPayload(node, trigger) {
    if (trigger.payload !== undefined && trigger.payload !== null && !(typeof trigger.payload === 'object' && !Object.keys(trigger.payload).length && node.type === 'trigger.manual')) return trigger.payload;
    if (node.type === 'trigger.manual') {
      try { return JSON.parse(String(node.config?.sample ?? '{}') || '{}'); } catch { return { text: String(node.config?.sample ?? '') }; }
    }
    if (node.type === 'trigger.schedule') return { firedAt: new Date().toISOString() };
    return trigger.payload ?? {};
  }

  /** Resolves "provider:model" (or '' = the default model) and its key, and calls the model. */
  async function callModel(ctl, step, req) {
    const ref = parseModelRef(req.model) ?? parseModelRef(core.settings.get().defaultModel) ?? { provider: 'mock', model: 'mock-1' };
    const credential = core.credentials.resolve(ref.provider, req.credentialId);
    const started = Date.now();
    log(ctl, step, 'info', `→ ${providerInfo(ref.provider)?.label ?? ref.provider} · ${ref.model}`);
    const res = await providerChat({ ...req, provider: ref.provider, model: ref.model, credential, signal: ctl.controller.signal, mockDelay: core.mockDelay });
    const run = ctl.run;
    run.usage.calls += 1;
    run.usage.input += res.usage?.input ?? 0;
    run.usage.output += res.usage?.output ?? 0;
    step.usage = { input: (step.usage?.input ?? 0) + (res.usage?.input ?? 0), output: (step.usage?.output ?? 0) + (res.usage?.output ?? 0), calls: (step.usage?.calls ?? 0) + 1 };
    step.model = `${ref.provider}:${res.model ?? ref.model}`;
    log(ctl, step, 'info', `← ${res.toolCalls?.length ? `${res.toolCalls.length} tool call(s)` : `${(res.text ?? '').length} chars`} · ${res.usage?.input ?? 0}/${res.usage?.output ?? 0} tokens · ${Date.now() - started} ms`);
    return res;
  }

  function log(ctl, step, level, text) {
    const entry = { at: Date.now(), level, text: String(text).slice(0, 2000) };
    if (step) { step.logs.push(entry); if (step.logs.length > 200) step.logs.shift(); }
    emit('run.log', ctl.run, { stepId: step?.id ?? null, nodeId: step?.nodeId ?? null, ...entry });
  }

  function newStep(ctl, node, input, scope) {
    const run = ctl.run;
    ctl.seq += 1;
    const step = {
      id: `s${ctl.seq}`, nodeId: node.id, name: node.name || nodeDef(node.type)?.label?.en || node.type, type: node.type,
      status: 'running', startedAt: Date.now(), endedAt: null, ms: 0, input: snapshot(input), output: null, port: null, error: null, logs: [],
      ...(scope.loop ? { loop: { ...scope.loop } } : {}), ...(scope.toolOf ? { toolOf: scope.toolOf } : {}),
    };
    run.steps.push(step);
    if (run.steps.length > MAX_STEPS) throw new AppError('TOO_MANY_STEPS', `The run went over ${MAX_STEPS} steps (a loop without an end?)`, 400);
    emit('run.step', run, { phase: 'start', step });
    return step;
  }

  function endStep(ctl, step, patch) {
    Object.assign(step, patch, { endedAt: Date.now() });
    step.ms = step.endedAt - step.startedAt;
    emit('run.step', ctl.run, { phase: 'end', step });
    persist(ctl.run);
  }

  async function withTimeout(promise, seconds, signal) {
    if (!seconds) return promise;
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new AppError('NODE_TIMEOUT', `The node ran longer than ${seconds} s`, 408)), seconds * 1000); })]);
    } finally { clearTimeout(timer); void signal; }
  }

  /** Runs one node (retries, timeout, error handling) → { output, ports, step } (throws StopRun / errors). */
  async function runNode(ctl, node, input, scope) {
    const def = nodeDef(node.type);
    if (!def) throw new AppError('UNKNOWN_NODE', `Unknown node type "${node.type}"`, 400);
    ctl.visits.set(node.id, (ctl.visits.get(node.id) ?? 0) + 1);
    if (ctl.visits.get(node.id) > MAX_VISITS) throw new AppError('TOO_MANY_VISITS', `"${node.name}" ran more than ${MAX_VISITS} times`, 400);
    const step = newStep(ctl, node, input, scope);
    const ports = outputPorts(node);
    if (node.disabled) {
      endStep(ctl, step, { status: 'skipped', output: snapshot(input), port: ports[0] ?? null });
      return { output: input, ports: ports.slice(0, 1), step };
    }
    if (ctl.options.usePins !== false && node.pinned !== undefined && node.pinned !== null) {
      log(ctl, step, 'info', 'Pinned output used (the node did not run)');
      endStep(ctl, step, { status: 'succeeded', output: snapshot(node.pinned), port: ports[0] ?? null, pinned: true });
      return { output: node.pinned, ports: ports.slice(0, 1), step };
    }
    const cfg = node.config ?? {};
    const retries = Math.max(0, Number(cfg.retries) || 0);
    const local = { ...scope, input };
    const ctx = {
      node, config: cfg, input, scope: local, run: ctl.run, step, signal: ctl.controller.signal, def,
      render: (v) => render(v, local),
      value: (key) => render(cfg[key], local),
      log: (level, text) => log(ctl, step, level, text),
      notify: (level, message) => { log(ctl, step, level, message); emit('run.notify', ctl.run, { level, message, nodeId: node.id }); },
      chat: (req) => callModel(ctl, step, req),
      tool: (phase, info) => emit('run.tool', ctl.run, { phase, stepId: step.id, nodeId: node.id, ...info }),
      graphTools: () => (ctl.agent.edges ?? []).filter((e) => e.from === node.id && e.fromPort === 'tools').map((e) => ctl.nodes.get(e.to)).filter(Boolean).map((n) => ({ node: n, def: nodeDef(n.type) })),
      callTool: async (nodeId, args) => {
        const target = ctl.nodes.get(nodeId);
        emit('run.edge', ctl.run, { from: node.id, port: 'tools', to: nodeId });
        const res = await runGraph(ctl, [{ nodeId, input: args, edgeKey: `tool:${nodeId}` }], { ...scope, input: args, toolOf: node.id });
        if (target) log(ctl, step, 'info', `Tool "${target.name}" answered`);
        return res.leaves.length === 1 ? res.leaves[0] : res.leaves.length ? res.leaves : res.last;
      },
      waitHuman: (request) => waitHuman(ctl, step, request),
      respond: (value, status) => { ctl.run.output = snapshot(value); ctl.run.response = { status, value: snapshot(value) }; ctl.responded = true; },
      services: core.nodeServices,
    };
    for (let attempt = 0; ; attempt += 1) {
      try {
        if (ctl.controller.signal.aborted) throw new AppError('CANCELLED', 'Cancelled', 499);
        const executor = EXECUTORS[node.type];
        if (!executor) throw new AppError('NO_EXECUTOR', `"${node.type}" cannot run`, 400);
        const res = (await withTimeout(Promise.resolve(executor(ctx)), Number(cfg.timeout) || 0)) ?? {};
        if (res.stop) {
          endStep(ctl, step, { status: res.stop.status === 'failed' ? 'failed' : 'succeeded', output: snapshot({ stop: res.stop.status, message: res.stop.message }), error: res.stop.status === 'failed' ? { code: 'STOPPED', message: res.stop.message || 'Stopped' } : null });
          throw new StopRun(res.stop.status, res.stop.message);
        }
        if (res.items) return { items: res.items, step };
        const out = res.output === undefined ? null : res.output;
        const chosen = res.port == null ? ports.slice(0, 1) : (Array.isArray(res.port) ? res.port : [res.port]);
        endStep(ctl, step, { status: 'succeeded', output: snapshot(out), port: chosen.join(', '), attempt });
        return { output: out, ports: chosen, step };
      } catch (err) {
        if (err instanceof StopRun) throw err;
        const cancelled = err?.code === 'CANCELLED' || ctl.controller.signal.aborted;
        if (!cancelled && attempt < retries) {
          log(ctl, step, 'warning', `Attempt ${attempt + 1} failed: ${err.message} — trying again`);
          await new Promise((r) => setTimeout(r, (Number(cfg.retryDelay) || 0) * 1000));
          continue;
        }
        const error = { code: err?.code ?? 'ERROR', message: err?.message ?? String(err), ...(err?.details ? { details: snapshot(err.details) } : {}) };
        if (!cancelled && cfg.onError === 'continue') {
          log(ctl, step, 'warning', `Error ignored: ${error.message}`);
          endStep(ctl, step, { status: 'succeeded', output: { error }, error, port: ports[0] ?? null, attempt });
          return { output: { error }, ports: ports.slice(0, 1), step };
        }
        if (!cancelled && cfg.onError === 'branch') {
          log(ctl, step, 'warning', `Error sent to the error port: ${error.message}`);
          endStep(ctl, step, { status: 'failed', output: { error, input: snapshot(input) }, error, port: 'error', attempt, handled: true });
          return { output: { error, input }, ports: ['error'], step };
        }
        endStep(ctl, step, { status: cancelled ? 'cancelled' : 'failed', error, attempt });
        err.nodeId ??= node.id;
        err.nodeName ??= node.name;
        throw err;
      }
    }
  }

  function waitHuman(ctl, step, request) {
    const run = ctl.run;
    step.status = 'waiting';
    run.status = 'waiting';
    run.waiting = { stepId: step.id, nodeId: step.nodeId, nodeName: step.name, kind: request.kind, message: request.message ?? '', fields: request.fields ?? [], since: Date.now(), timeoutMs: request.timeoutMs || 0 };
    emit('run.step', run, { phase: 'waiting', step });
    emit('run.waiting', run, { waiting: run.waiting });
    persist(run, { now: true });
    return new Promise((resolve) => {
      let timer = null;
      const finish = (answer) => {
        clearTimeout(timer);
        ctl.waiters.delete(step.id);
        step.status = 'running';
        step.human = snapshot(answer);
        run.status = 'running';
        run.waiting = null;
        emit('run.status', run, { status: run.status });
        persist(run, { now: true });
        resolve(answer);
      };
      ctl.waiters.set(step.id, finish);
      if (request.timeoutMs) timer = setTimeout(() => finish({ timeout: true }), request.timeoutMs);
      ctl.controller.signal.addEventListener('abort', () => finish({ cancelled: true }), { once: true });
    });
  }

  /** Runs from the given starts until nothing is left → { last, leaves } (leaves: outputs that went nowhere). */
  async function runGraph(ctl, starts, scope) {
    const queue = [...starts];
    const merges = new Map();
    const leaves = [];
    let last;
    const edges = ctl.agent.edges ?? [];
    while (queue.length || merges.size) {
      if (!queue.length) {
        // Nothing else will arrive: a Merge node goes on with what it has.
        const [id, m] = merges.entries().next().value;
        merges.delete(id);
        queue.push({ nodeId: id, input: combine(ctl, ctl.nodes.get(id), m), merged: true });
        continue;
      }
      if (ctl.controller.signal.aborted) throw new AppError('CANCELLED', 'Cancelled', 499);
      const item = queue.shift();
      const node = ctl.nodes.get(item.nodeId);
      const def = node ? nodeDef(node.type) : null;
      if (!node || !def || def.note) continue;
      if (def.multiInput && !item.merged) {
        const incoming = edges.filter((e) => e.to === node.id && e.fromPort !== 'tools');
        const m = merges.get(node.id) ?? new Map();
        m.set(item.edgeKey ?? `${m.size}`, { from: item.from, input: item.input });
        if (m.size < incoming.length) { merges.set(node.id, m); continue; }
        merges.delete(node.id);
        item.input = combine(ctl, node, m);
      }
      const result = await runNode(ctl, node, item.input, scope);
      if (result.items) {
        last = await runLoop(ctl, node, result, scope, queue);
        continue;
      }
      const output = result.output;
      scope.nodes[node.id] = { output };
      if (node.name) scope.nodes[node.name] = { output };
      last = output;
      const targets = edges.filter((e) => e.from === node.id && result.ports.includes(e.fromPort ?? 'out'));
      if (!targets.length) leaves.push(output);
      for (const e of targets) {
        emit('run.edge', ctl.run, { edgeId: e.id, from: e.from, port: e.fromPort, to: e.to });
        queue.push({ nodeId: e.to, input: output, edgeKey: e.id, from: node.id });
      }
    }
    return { last, leaves };
  }

  async function runLoop(ctl, node, result, scope, queue) {
    const step = result.step;
    const edges = ctl.agent.edges ?? [];
    const body = edges.filter((e) => e.from === node.id && e.fromPort === 'item');
    const results = [];
    const items = result.items;
    for (const [index, item] of items.entries()) {
      log(ctl, step, 'info', `Item ${index + 1} / ${items.length}`);
      emit('run.loop', ctl.run, { nodeId: node.id, stepId: step.id, index, total: items.length });
      const child = { ...scope, item, index, input: item, loop: { nodeId: node.id, index, total: items.length } };
      for (const e of body) emit('run.edge', ctl.run, { edgeId: e.id, from: e.from, port: 'item', to: e.to });
      const res = await runGraph(ctl, body.map((e) => ({ nodeId: e.to, input: item, edgeKey: e.id, from: node.id })), child);
      results.push(res.leaves.length === 1 ? res.leaves[0] : res.leaves.length ? res.leaves : res.last ?? null);
    }
    const output = { items: results, count: results.length };
    step.output = snapshot(output);
    step.status = 'succeeded';
    step.port = 'done';
    step.endedAt = Date.now();
    step.ms = step.endedAt - step.startedAt;
    emit('run.step', ctl.run, { phase: 'end', step });
    scope.nodes[node.id] = { output };
    if (node.name) scope.nodes[node.name] = { output };
    for (const e of edges.filter((x) => x.from === node.id && x.fromPort === 'done')) {
      emit('run.edge', ctl.run, { edgeId: e.id, from: e.from, port: 'done', to: e.to });
      queue.push({ nodeId: e.to, input: output, edgeKey: e.id, from: node.id });
    }
    return output;
  }

  function combine(ctl, node, arrivals) {
    const list = [...arrivals.values()];
    const mode = node.config?.mode ?? 'object';
    if (mode === 'array') return list.map((a) => a.input);
    if (mode === 'text') return { text: list.map((a) => toText(a.input?.text ?? a.input)).join('\n\n') };
    const out = {};
    for (const a of list) out[ctl.nodes.get(a.from)?.name || a.from || `input${Object.keys(out).length + 1}`] = a.input;
    return out;
  }

  async function execute(ctl, start, payload) {
    const run = ctl.run;
    const scope = {
      trigger: payload, input: payload, vars: Object.fromEntries((ctl.agent.variables ?? []).filter((v) => v?.key).map((v) => [v.key, v.value])), nodes: {},
      run: { id: run.id, agentId: run.agentId, session: run.sessionId, startedAt: new Date(run.startedAt).toISOString() },
      env: { now: new Date().toISOString(), mode: core.mode, node: process.execPath, platform: process.platform },
    };
    try {
      const res = await runGraph(ctl, [{ nodeId: start.id, input: payload }], scope);
      if (!ctl.responded) run.output = snapshot(res.leaves.length === 1 ? res.leaves[0] : res.leaves.length ? res.leaves : res.last ?? null);
      run.status = 'succeeded';
    } catch (err) {
      if (err instanceof StopRun) {
        run.status = err.status === 'failed' ? 'failed' : 'succeeded';
        if (err.status === 'failed') run.error = { code: 'STOPPED', message: err.message || 'Stopped by a Stop node' };
        else if (!ctl.responded && err.message) run.output = err.message;
      } else if (err?.code === 'CANCELLED' || ctl.controller.signal.aborted) {
        run.status = 'cancelled';
        run.error = { code: 'CANCELLED', message: 'Cancelled' };
      } else {
        run.status = 'failed';
        run.error = { code: err?.code ?? 'ERROR', message: err?.message ?? String(err), nodeId: err?.nodeId ?? null, nodeName: err?.nodeName ?? null };
        if (!(err instanceof AppError)) console.error('[engine]', err);
      }
    }
    run.endedAt = Date.now();
    run.ms = run.endedAt - run.startedAt;
    run.waiting = null;
    for (const s of run.steps) if (s.status === 'running' || s.status === 'waiting') { s.status = run.status === 'cancelled' ? 'cancelled' : 'failed'; s.endedAt = run.endedAt; s.ms = s.endedAt - s.startedAt; }
    active.delete(run.id);
    persist(run, { now: true });
    emit('run.finished', run, { status: run.status, run: summary(run) });
    return run;
  }

  const summary = (run) => ({
    id: run.id, agentId: run.agentId, agentName: run.agentName, status: run.status, trigger: { kind: run.trigger.kind }, sessionId: run.sessionId,
    startedAt: run.startedAt, endedAt: run.endedAt, ms: run.ms, steps: run.steps.length, usage: run.usage, error: run.error, draft: run.draft, parentRunId: run.parentRunId,
    waiting: run.waiting ? { kind: run.waiting.kind, nodeName: run.waiting.nodeName } : null,
  });

  /**
   * Starts a run → the run (running). `agent`: an id, or an agent document (a draft from the editor).
   * trigger: { kind: 'manual' | 'chat' | 'webhook' | 'schedule', payload, nodeId? }
   */
  function start(agentOrId, trigger = { kind: 'manual' }, options = {}) {
    const agent = structuredClone(loadAgent(agentOrId));
    if ((options.depth ?? 0) > MAX_DEPTH) throw new AppError('TOO_DEEP', `Agents called each other more than ${MAX_DEPTH} levels deep`, 400);
    const first = startNode(agent, trigger);
    const payload = defaultPayload(first, trigger);
    const run = {
      id: newId(), agentId: agent.id ?? 'draft', agentName: agent.name ?? '', status: 'running', trigger: { kind: trigger.kind ?? 'manual', nodeId: first.id, payload: snapshot(payload) },
      sessionId: options.sessionId ?? (trigger.kind === 'chat' ? 'default' : null), startedAt: Date.now(), endedAt: null, ms: 0,
      steps: [], output: null, response: null, error: null, usage: { input: 0, output: 0, calls: 0 }, waiting: null,
      draft: Boolean(options.draft), parentRunId: options.parentRunId ?? null, depth: options.depth ?? 0, ephemeral: Boolean(options.ephemeral),
    };
    const controller = new AbortController();
    options.signal?.addEventListener?.('abort', () => controller.abort(), { once: true });
    const ctl = { run, agent, controller, waiters: new Map(), seq: 0, visits: new Map(), nodes: new Map((agent.nodes ?? []).map((n) => [n.id, n])), options, responded: false };
    active.set(run.id, ctl);
    persist(run, { now: true });
    emit('run.started', run, { run: summary(run) });
    ctl.done = execute(ctl, first, payload);
    return run;
  }

  async function runAndWait(agentOrId, trigger, options) {
    const run = start(agentOrId, trigger, options);
    return active.get(run.id)?.done ?? run;
  }

  return {
    start,
    runAndWait,
    summary,
    publicRun,
    /** Resolves when the run has finished (or at once if it is not running). */
    wait: (runId) => active.get(runId)?.done ?? Promise.resolve(store.runs.get(runId)),
    isActive: (runId) => active.has(runId),
    activeRuns: () => [...active.values()].map((c) => summary(c.run)),
    get: (runId) => active.get(runId)?.run ?? store.runs.get(runId),
    cancel(runId) {
      const ctl = active.get(runId);
      if (!ctl) throw new AppError('RUN_NOT_ACTIVE', 'The run is not running', 409);
      ctl.controller.abort();
      return summary(ctl.run);
    },
    /** Answers a waiting human step: { approved, comment } (approval) or { values } (input). */
    resume(runId, answer = {}) {
      const ctl = active.get(runId);
      if (!ctl || ctl.run.status !== 'waiting') throw new AppError('RUN_NOT_WAITING', 'The run is not waiting for an answer', 409);
      const stepId = answer.stepId ?? ctl.run.waiting?.stepId;
      const finish = ctl.waiters.get(stepId);
      if (!finish) throw new AppError('STEP_NOT_WAITING', 'That step is not waiting', 409);
      finish({ approved: Boolean(answer.approved), comment: String(answer.comment ?? ''), values: answer.values ?? {}, by: answer.by ?? null });
      return summary(ctl.run);
    },
    /** Marks runs left "running" by an earlier process as interrupted (called at start-up). */
    recover() {
      for (const run of store.runs.all()) {
        if (['running', 'waiting'].includes(run.status) && !active.has(run.id)) {
          run.status = 'interrupted';
          run.error = { code: 'INTERRUPTED', message: 'The app was closed while the run was going on' };
          run.waiting = null;
          store.runs.put(run);
        }
      }
    },
    async close() {
      for (const ctl of active.values()) ctl.controller.abort();
      await Promise.allSettled([...active.values()].map((c) => c.done));
      for (const [id, t] of saveTimers) { clearTimeout(t); const run = store.runs.get(id); if (run) store.runs.put(run); }
    },
  };
}
