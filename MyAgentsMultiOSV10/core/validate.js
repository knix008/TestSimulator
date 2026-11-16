// Problems of an agent before it runs (the editor's Problems tab; also checked on deploy). Pure.
//   findProblems(agent, { ready: { anthropic: true … }, defaultModel, kbIds: Set, agentIds: Set })
//   → [{ severity: 'error' | 'warning' | 'info', code, nodeId?, params }]
import { nodeDef, outputPorts, isTrigger } from './nodes/defs.js';
import { references } from './expr.js';
import { parseModelRef } from './providers/index.js';

const SCOPES = new Set(['input', 'trigger', 'vars', 'nodes', 'item', 'index', 'run', 'env']);

export function findProblems(agent, context = {}) {
  const out = [];
  const add = (severity, code, nodeId = null, params = {}) => out.push({ severity, code, nodeId, params });
  const nodes = agent?.nodes ?? [];
  const edges = agent?.edges ?? [];
  const runnable = nodes.filter((n) => !nodeDef(n.type)?.note);
  if (!runnable.length) { add('info', 'empty'); return out; }
  const triggers = runnable.filter(isTrigger);
  if (!triggers.length) add('error', 'noTrigger');
  const names = new Map();
  for (const n of nodes) names.set(n.name, (names.get(n.name) ?? 0) + 1);

  // reachable from a trigger (flow edges and tool edges)
  const reach = new Set(triggers.map((n) => n.id));
  const stack = [...reach];
  while (stack.length) { const id = stack.pop(); for (const e of edges) if (e.from === id && !reach.has(e.to)) { reach.add(e.to); stack.push(e.to); } }
  const nameSet = new Set(nodes.map((n) => n.name));
  const ready = context.ready ?? {};
  const modelReady = (value) => {
    const ref = parseModelRef(value) ?? parseModelRef(context.defaultModel);
    if (!ref) return true;
    return ready[ref.provider] !== false;
  };

  for (const n of runnable) {
    const def = nodeDef(n.type);
    if (!def) { add('error', 'unknownType', n.id, { type: n.type }); continue; }
    if (n.disabled) continue;
    if ((names.get(n.name) ?? 0) > 1) add('warning', 'duplicateName', n.id, { name: n.name });
    if (!isTrigger(n) && !reach.has(n.id)) add('warning', 'unreachable', n.id, { name: n.name });
    if (isTrigger(n) && edges.some((e) => e.to === n.id)) add('warning', 'intoTrigger', n.id, { name: n.name });
    const ports = outputPorts(n);
    if (ports.length && !edges.some((e) => e.from === n.id) && !['out.respond', 'human.notify', 'logic.stop', 'tool.file'].includes(n.type) && !edges.some((e) => e.to === n.id && e.fromPort === 'tools')) add('info', 'deadEnd', n.id, { name: n.name });
    const c = n.config ?? {};
    if ('model' in c && ['ai.agent', 'ai.llm', 'ai.classify', 'ai.extract'].includes(n.type) && !modelReady(c.model)) {
      const ref = parseModelRef(c.model) ?? parseModelRef(context.defaultModel);
      add('error', 'noKey', n.id, { name: n.name, provider: ref?.provider ?? '' });
    }
    if (n.type === 'kb.search' && !(c.kbs ?? []).length) add('error', 'noKb', n.id, { name: n.name });
    if (n.type === 'kb.add' && !c.kb) add('error', 'noKb', n.id, { name: n.name });
    if (n.type === 'ai.agent' && (c.tools ?? []).includes('knowledge') && !(c.kbs ?? []).length) add('warning', 'agentNoKb', n.id, { name: n.name });
    for (const id of [...(Array.isArray(c.kbs) ? c.kbs : []), ...(c.kb ? [c.kb] : [])]) if (context.kbIds && !context.kbIds.has(id)) add('error', 'missingKb', n.id, { name: n.name });
    if (n.type === 'tool.subagent') {
      if (!c.agent) add('error', 'noAgent', n.id, { name: n.name });
      else if (context.agentIds && !context.agentIds.has(c.agent)) add('error', 'missingAgent', n.id, { name: n.name });
      else if (c.agent === agent.id) add('warning', 'selfCall', n.id, { name: n.name });
    }
    if (n.type === 'ai.classify' && !(c.categories ?? []).filter(Boolean).length) add('error', 'noCategories', n.id, { name: n.name });
    if (n.type === 'tool.http' && !String(c.url ?? '').trim()) add('error', 'noUrl', n.id, { name: n.name });
    if (n.type === 'tool.shell' && context.allowShell === false) add('warning', 'shellOff', n.id, { name: n.name });
    if (n.type === 'logic.loop' && !edges.some((e) => e.from === n.id && e.fromPort === 'item')) add('warning', 'loopNoBody', n.id, { name: n.name });
    if (n.type === 'logic.code') {
      try { new Function(`return (async () => {\n${c.code ?? ''}\n})`); } catch (err) { add('error', 'codeSyntax', n.id, { name: n.name, message: err.message }); }
    }
    if (n.type === 'trigger.schedule' && c.mode === 'cron' && String(c.cron ?? '').trim().split(/\s+/).length !== 5) add('error', 'badCron', n.id, { name: n.name });
    if (n.type === 'trigger.manual' && String(c.sample ?? '').trim()) { try { JSON.parse(c.sample); } catch { add('warning', 'badSample', n.id, { name: n.name }); } }
    // expressions naming nodes that do not exist
    for (const [key, value] of Object.entries(c)) {
      const texts = typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap((v) => (v && typeof v === 'object' ? Object.values(v).filter((x) => typeof x === 'string') : typeof v === 'string' ? [v] : [])) : [];
      for (const text of texts) {
        for (const ref of references(text)) {
          const head = ref.split(/[.[]/)[0].trim();
          if (!SCOPES.has(head)) { add('warning', 'unknownScope', n.id, { name: n.name, field: key, ref: head }); continue; }
          if (head === 'nodes') {
            const nodeName = ref.slice(ref.indexOf('.') + 1).split('.')[0].trim();
            if (nodeName && !nameSet.has(nodeName) && !nodes.some((x) => x.id === nodeName)) {
              // "a || b" alternatives (bilingual templates): only a problem when none of them exists
              const alts = text.match(/nodes\.([^.}|]+)\./g)?.map((m) => m.slice(6, -1).trim()) ?? [];
              if (!alts.some((a) => nameSet.has(a))) add('warning', 'unknownNode', n.id, { name: n.name, field: key, ref: nodeName });
            }
          }
        }
      }
    }
  }
  return out;
}
