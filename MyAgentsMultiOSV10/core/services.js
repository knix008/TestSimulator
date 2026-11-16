// Credentials, settings and agent documents (ARCHITECTURE.md §6).
import { newId } from './ids.js';
import { AppError, NotFoundError } from './errors.js';
import { PROVIDERS, providerInfo } from './providers/index.js';
import { nodeDef, defaultConfig, isTrigger } from './nodes/defs.js';

// ───────────────────────── credentials (API keys)

const mask = (key) => (key ? `${key.slice(0, 4)}…${key.slice(-4)}` : '');

export function createCredentials(store, env = process.env) {
  const all = () => store.credentials.read().items ?? [];
  const save = (items) => store.credentials.write({ items });
  const pub = (c) => ({ id: c.id, provider: c.provider, name: c.name, baseUrl: c.baseUrl ?? '', keyHint: mask(c.apiKey), hasKey: Boolean(c.apiKey), isDefault: Boolean(c.isDefault), createdAt: c.createdAt });
  const envKey = (provider) => {
    const info = providerInfo(provider);
    if (!info?.env) return '';
    return env[info.env] || (provider === 'gemini' ? env.GOOGLE_API_KEY || '' : '');
  };
  return {
    list: () => all().map(pub),
    /** Providers that can be used now (a key stored, from the environment, or none needed). */
    available: () => PROVIDERS.map((p) => ({ id: p.id, ready: !p.needsKey || all().some((c) => c.provider === p.id && c.apiKey) || Boolean(envKey(p.id)), fromEnv: Boolean(envKey(p.id)) && !all().some((c) => c.provider === p.id && c.apiKey) })),
    byId: (id) => all().find((c) => c.id === id) ?? null,
    /** The key for a provider: the chosen credential, else the default one, else the first, else the environment. */
    resolve(provider, id = null) {
      const items = all().filter((c) => c.provider === provider);
      const c = (id && items.find((x) => x.id === id)) || items.find((x) => x.isDefault) || items[0];
      if (c) return { apiKey: c.apiKey || envKey(provider), baseUrl: c.baseUrl || '' };
      return { apiKey: envKey(provider), baseUrl: '' };
    },
    create({ provider, name = '', apiKey = '', baseUrl = '', isDefault = false }) {
      if (!providerInfo(provider) && provider !== 'http') throw new AppError('PROVIDER_UNKNOWN', `Unknown provider "${provider}"`, 400);
      let items = all();
      if (isDefault || !items.some((c) => c.provider === provider)) items = items.map((c) => (c.provider === provider ? { ...c, isDefault: false } : c));
      const c = { id: newId(), provider, name: String(name || providerInfo(provider)?.label || provider).slice(0, 80), apiKey: String(apiKey).trim(), baseUrl: String(baseUrl).trim(), isDefault: isDefault || !items.some((x) => x.provider === provider), createdAt: Date.now() };
      save([...items, c]);
      return pub(c);
    },
    update(id, patch = {}) {
      let items = all();
      const c = items.find((x) => x.id === id);
      if (!c) throw new NotFoundError('CREDENTIAL_NOT_FOUND', 'Credential not found');
      if (patch.name !== undefined) c.name = String(patch.name).slice(0, 80);
      if (patch.apiKey !== undefined && patch.apiKey !== '') c.apiKey = String(patch.apiKey).trim();
      if (patch.baseUrl !== undefined) c.baseUrl = String(patch.baseUrl).trim();
      if (patch.isDefault) items = items.map((x) => (x.provider === c.provider ? { ...x, isDefault: x.id === id } : x));
      save(items.map((x) => (x.id === id ? { ...c, isDefault: patch.isDefault ? true : x.isDefault } : x)));
      return pub(items.find((x) => x.id === id) ?? c);
    },
    remove(id) { save(all().filter((c) => c.id !== id)); },
  };
}

// ───────────────────────── settings (core side)

export const DEFAULT_CORE_SETTINGS = { defaultModel: 'mock:mock-1', allowShell: true, workDir: '' };

export function createSettings(store, { mode }) {
  return {
    get: () => ({ ...DEFAULT_CORE_SETTINGS, ...(mode === 'web' ? { allowShell: false } : {}), ...store.settings.read() }),
    update(patch = {}) {
      const next = { ...store.settings.read() };
      if (patch.defaultModel !== undefined) next.defaultModel = String(patch.defaultModel);
      if (patch.allowShell !== undefined) next.allowShell = Boolean(patch.allowShell);
      if (patch.workDir !== undefined) next.workDir = String(patch.workDir);
      store.settings.write(next);
      return { ...DEFAULT_CORE_SETTINGS, ...next };
    },
  };
}

// ───────────────────────── agents

/** Makes a document safe to store: known fields, ids, numbers. Unknown node types are kept (a newer version). */
export function normalizeAgent(input, { keepId = true } = {}) {
  const a = input && typeof input === 'object' ? input : {};
  const ids = new Set();
  const uid = (prefix, wanted) => { let id = String(wanted || '').replace(/[^\w-]/g, '').slice(0, 40) || `${prefix}${Math.random().toString(36).slice(2, 8)}`; while (ids.has(id)) id = `${prefix}${Math.random().toString(36).slice(2, 8)}`; ids.add(id); return id; };
  const nodes = (Array.isArray(a.nodes) ? a.nodes : []).filter((n) => n && typeof n.type === 'string').map((n) => {
    const def = nodeDef(n.type);
    return {
      id: uid('n', n.id), type: n.type, name: String(n.name ?? def?.label?.en ?? n.type).slice(0, 80),
      x: Math.round(Number(n.x) || 0), y: Math.round(Number(n.y) || 0),
      ...(n.w ? { w: Math.max(120, Math.round(Number(n.w))) } : {}), ...(n.h ? { h: Math.max(60, Math.round(Number(n.h))) } : {}),
      config: { ...(def ? defaultConfig(n.type) : {}), ...(n.config && typeof n.config === 'object' ? n.config : {}) },
      ...(n.disabled ? { disabled: true } : {}), ...(n.pinned !== undefined && n.pinned !== null ? { pinned: n.pinned } : {}),
      ...(n.description ? { description: String(n.description).slice(0, 500) } : {}),
      ...(n.phase ? { phase: String(n.phase).slice(0, 60) } : {}),
    };
  });
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edgeIds = new Set();
  const edges = (Array.isArray(a.edges) ? a.edges : []).filter((e) => e && nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to).map((e) => {
    let id = String(e.id || `e${Math.random().toString(36).slice(2, 8)}`);
    while (edgeIds.has(id)) id = `e${Math.random().toString(36).slice(2, 8)}`;
    edgeIds.add(id);
    return { id, from: e.from, fromPort: String(e.fromPort ?? 'out'), to: e.to, toPort: String(e.toPort ?? 'in') };
  });
  const unique = new Map();
  for (const e of edges) unique.set(`${e.from}|${e.fromPort}|${e.to}`, e);
  return {
    ...(keepId && a.id ? { id: String(a.id) } : {}),
    name: String(a.name ?? 'New agent').slice(0, 120) || 'New agent',
    description: String(a.description ?? '').slice(0, 2000),
    icon: String(a.icon ?? ''),
    color: String(a.color ?? ''),
    tags: (Array.isArray(a.tags) ? a.tags : []).map(String).slice(0, 20),
    nodes,
    edges: [...unique.values()],
    variables: (Array.isArray(a.variables) ? a.variables : []).filter((v) => v?.key).map((v) => ({ key: String(v.key).slice(0, 60), value: v.value ?? '' })),
    deployed: Boolean(a.deployed),
    hookSecret: String(a.hookSecret ?? ''),
    viewport: a.viewport && typeof a.viewport === 'object' ? { x: Number(a.viewport.x) || 0, y: Number(a.viewport.y) || 0, zoom: Math.min(3, Math.max(0.1, Number(a.viewport.zoom) || 1)) } : { x: 0, y: 0, zoom: 1 },
    template: a.template ? String(a.template) : undefined,
  };
}

const secret = () => newId().slice(-12) + Math.random().toString(36).slice(2, 10);

export function createAgents(store, events) {
  const summary = (a) => ({
    id: a.id, name: a.name, description: a.description, icon: a.icon, color: a.color, tags: a.tags, deployed: a.deployed, createdAt: a.createdAt, updatedAt: a.updatedAt, rev: a.rev,
    nodes: a.nodes.length, triggers: [...new Set(a.nodes.filter(isTrigger).map((n) => nodeDef(n.type).trigger))], template: a.template,
  });
  const load = (id) => { const a = store.agents.get(id); if (!a) throw new NotFoundError('AGENT_NOT_FOUND', `Agent "${id}" not found`); return a; };
  const changed = (type, a) => events.emit({ type, data: summary(a) });
  return {
    summary,
    list: () => store.agents.all().map(summary).sort((x, y) => (y.updatedAt ?? 0) - (x.updatedAt ?? 0)),
    get: (id) => load(id),
    create(doc = {}) {
      const now = Date.now();
      const a = { ...normalizeAgent(doc, { keepId: false }), id: newId(), createdAt: now, updatedAt: now, rev: 1 };
      a.hookSecret ||= secret();
      store.agents.put(a);
      changed('agent.created', a);
      return a;
    },
    /** Saves a whole document. `rev` (when given) must match: someone else may have saved in between. */
    save(id, doc = {}) {
      const before = load(id);
      if (doc.rev != null && Number(doc.rev) !== before.rev) throw new AppError('REV_CONFLICT', 'The agent was changed elsewhere since it was opened', 409, { current: before });
      const a = { ...normalizeAgent({ ...doc, hookSecret: doc.hookSecret || before.hookSecret }), id, createdAt: before.createdAt, updatedAt: Date.now(), rev: before.rev + 1 };
      store.agents.put(a);
      changed('agent.updated', a);
      return a;
    },
    patch(id, patch = {}) {
      const a = load(id);
      return this.save(id, { ...a, ...patch, rev: a.rev });
    },
    remove(id) { const a = load(id); store.agents.remove(id); events.emit({ type: 'agent.removed', data: { id, name: a.name } }); },
    duplicate(id) { const a = load(id); return this.create({ ...a, name: `${a.name} (copy)`, deployed: false, hookSecret: '' }); },
    rotateSecret(id) { const a = load(id); return this.save(id, { ...a, hookSecret: secret(), rev: a.rev }); },
    /** The exchange file: { format: 'myagents', version: 1, agent }. */
    exportDoc(id) { const { hookSecret, ...a } = load(id); void hookSecret; return { format: 'myagents', version: 1, exportedAt: new Date().toISOString(), agent: a }; },
    importDoc(data) {
      const doc = data?.format === 'myagents' ? data.agent : data?.nodes ? data : null;
      if (!doc) throw new AppError('BAD_FILE', 'Not a MyAgents agent file', 400);
      return this.create({ ...doc, deployed: false, hookSecret: '' });
    },
  };
}
