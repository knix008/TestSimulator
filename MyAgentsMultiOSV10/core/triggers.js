// Triggers that start deployed agents by themselves, besides the schedule (core/scheduler.js):
//   Folder watch (trigger.file)  — a new file in a work-folder folder (checked on every scheduler tick)
//   After another agent (trigger.agent) — a run of the chosen agent ended (the run.finished event)
import fs from 'node:fs';
import path from 'node:path';
import { fileEvent } from './nodes/runtime-more.js';

const glob = (pattern) => new RegExp(`^${String(pattern || '*').trim().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');

/** Folder watch: the first look only notes what is there; later looks start a run for each new or changed file. */
export function createFileWatch(core) {
  const seen = new Map(); // `${agentId}:${nodeId}` → { sig, files: Map(name → mtime) }
  function tick() {
    const workDir = core.nodeServices.workDir();
    const started = [];
    const live = new Set();
    for (const agent of core.store.agents.all()) {
      if (!agent.deployed) continue;
      for (const node of agent.nodes ?? []) {
        if (node.type !== 'trigger.file' || node.disabled) continue;
        const key = `${agent.id}:${node.id}`;
        live.add(key);
        const sig = JSON.stringify(node.config ?? {});
        const dir = path.resolve(workDir, String(node.config?.folder ?? 'inbox').replace(/^[\\/]+/, ''));
        if (!dir.startsWith(path.resolve(workDir))) continue;
        const re = glob(node.config?.pattern);
        const now = new Map();
        if (fs.existsSync(dir)) for (const d of fs.readdirSync(dir, { withFileTypes: true })) if (d.isFile() && re.test(d.name)) now.set(d.name, fs.statSync(path.join(dir, d.name)).mtimeMs);
        const before = seen.get(key);
        seen.set(key, { sig, files: now });
        if (!before || before.sig !== sig) continue;
        for (const [name, mtime] of now) {
          if (before.files.get(name) === mtime) continue;
          try {
            const payload = fileEvent(path.join(dir, name), workDir, node.config?.read !== false);
            started.push(core.engine.start(agent.id, { kind: 'file', nodeId: node.id, payload }));
          } catch (err) { console.error('[folder watch]', err.message); }
        }
      }
    }
    for (const key of [...seen.keys()]) if (!live.has(key)) seen.delete(key);
    return started;
  }
  return { tick };
}

/** After another agent: chains stop at 5 agents and never come back to an agent already in the chain. */
export function watchAgentRuns(core) {
  return core.events.on('run.finished', (ev) => {
    const { agentId, runId, status } = ev.data ?? {};
    if (!agentId || agentId === 'draft' || status === 'waiting') return;
    const run = core.engine.get(runId);
    const chain = [...(Array.isArray(run?.trigger?.payload?.chain) ? run.trigger.payload.chain : []), agentId];
    if (chain.length > 5) return;
    for (const agent of core.store.agents.all()) {
      if (!agent.deployed || chain.includes(agent.id)) continue;
      for (const node of agent.nodes ?? []) {
        if (node.type !== 'trigger.agent' || node.disabled || node.config?.agent !== agentId) continue;
        const when = node.config?.status ?? 'succeeded';
        if (when !== 'any' && when !== status) continue;
        try {
          core.engine.start(agent.id, { kind: 'agent', nodeId: node.id, payload: { agentId, agentName: run?.agentName ?? '', status, runId, output: run?.output ?? null, error: run?.error?.message ?? '', chain } });
        } catch (err) { console.error('[after agent]', err.message); }
      }
    }
  });
}
