// Conversation memory: the messages of one chat session of one agent (ARCHITECTURE.md §7).
// <data>/memory/<agentId>/<session>.json → { messages: [{ role, content, at }] }, the newest 200 kept.
import fs from 'node:fs';
import path from 'node:path';

const MAX = 200;
const safe = (s) => String(s ?? 'default').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'default';

export function createMemory(dir) {
  const mem = new Map();
  const fileOf = (agentId, session) => (dir ? path.join(dir, safe(agentId), `${safe(session)}.json`) : null);
  const keyOf = (agentId, session) => `${safe(agentId)}/${safe(session)}`;

  function read(agentId, session) {
    const key = keyOf(agentId, session);
    if (mem.has(key)) return mem.get(key);
    let messages = [];
    const file = fileOf(agentId, session);
    if (file && fs.existsSync(file)) { try { messages = JSON.parse(fs.readFileSync(file, 'utf8')).messages ?? []; } catch { messages = []; } }
    mem.set(key, messages);
    return messages;
  }

  function write(agentId, session, messages) {
    const key = keyOf(agentId, session);
    const kept = messages.slice(-MAX);
    mem.set(key, kept);
    const file = fileOf(agentId, session);
    if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ messages: kept }, null, 1)); }
  }

  return {
    /** The last `window` messages. */
    get: (agentId, session, window = 20) => read(agentId, session).slice(-Math.max(0, window)),
    append(agentId, session, ...entries) { write(agentId, session, [...read(agentId, session), ...entries.map((e) => ({ ...e, at: e.at ?? Date.now() }))]); },
    sessions(agentId) {
      const d = dir ? path.join(dir, safe(agentId)) : null;
      const fromDisk = d && fs.existsSync(d) ? fs.readdirSync(d).filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)) : [];
      const fromMem = [...mem.keys()].filter((k) => k.startsWith(`${safe(agentId)}/`)).map((k) => k.split('/')[1]);
      return [...new Set([...fromDisk, ...fromMem])].map((session) => ({ session, messages: read(agentId, session).length, last: read(agentId, session).at(-1)?.at ?? 0 })).sort((a, b) => b.last - a.last);
    },
    clear(agentId, session = null) {
      if (session) { mem.delete(keyOf(agentId, session)); const f = fileOf(agentId, session); if (f) fs.rmSync(f, { force: true }); return; }
      for (const k of [...mem.keys()]) if (k.startsWith(`${safe(agentId)}/`)) mem.delete(k);
      if (dir) fs.rmSync(path.join(dir, safe(agentId)), { recursive: true, force: true });
    },
  };
}
