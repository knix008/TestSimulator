// The HTTP API (ARCHITECTURE.md §5): the same routes for the desktop core and the web server.
import { AppError } from '../core/errors.js';
import { CATEGORIES, NODE_TYPES, COMMON_FIELDS, BUILTIN_TOOLS } from '../core/nodes/defs.js';
import { PROVIDERS, listModels, parseModelRef } from '../core/providers/index.js';
import { templateList, buildTemplate } from '../core/templates.js';
import { buildFromDescription } from '../core/builder.js';
import { findProblems } from '../core/validate.js';
import { OPERATORS, FILTER_NAMES } from '../core/expr.js';
import { Raw } from './router.js';

/** Catalogue for the editor (functions dropped; dynamic ports are worked out in the editor from defs.js). */
const catalog = () => ({
  categories: CATEGORIES, commonFields: COMMON_FIELDS, builtinTools: BUILTIN_TOOLS, operators: OPERATORS, filters: FILTER_NAMES,
  providers: PROVIDERS, templates: templateList(), nodeTypes: NODE_TYPES.length,
});

function problemContext(core) {
  const ready = Object.fromEntries(core.credentials.available().map((p) => [p.id, p.ready]));
  return { ready, defaultModel: core.settings.get().defaultModel, kbIds: new Set(core.store.kbs.all().map((k) => k.id)), agentIds: new Set(core.store.agents.all().map((a) => a.id)), allowShell: core.nodeServices.allowShell() };
}

/**
 * Server-Sent Events: every engine / agent / kb event (optionally only one run's). Keeps the response open
 * until the client leaves; a comment line every 20 s keeps proxies from closing it.
 */
function sse(core, req, res, filter) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(': connected\n\n');
  const off = core.events.on('*', (event) => {
    if (filter && !filter(event)) return;
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data ?? {})}\n\n`);
  });
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  return new Promise((resolve) => {
    const done = () => { clearInterval(ping); off(); resolve(); };
    req.on('close', done);
    res.on('close', done);
  });
}

const webhookPayload = (req, query, body) => ({
  method: req.method, query, headers: Object.fromEntries(Object.entries(req.headers).filter(([k]) => !/^(authorization|cookie)$/i.test(k))),
  body: Buffer.isBuffer(body) ? body.toString('utf8') : body ?? {},
});

/**
 * @param {ReturnType<import('./router.js').createRouter>} router
 * @param {object} core
 * @param {{ info: (ctx) => object }} hooks
 */
export function registerApi(router, core, hooks) {
  const { agents, engine, knowledge, credentials, settings, memory } = core;

  router.get('/api/info', ({ ctx }) => hooks.info(ctx), { public: true });
  router.get('/api/catalog', () => catalog());

  // ── settings (core side: default model, commands, work folder)
  router.get('/api/settings', () => ({ ...settings.get(), workDirResolved: core.nodeServices.workDir() }));
  router.put('/api/settings', ({ body }) => settings.update(body));

  // ── agents
  router.get('/api/agents', () => agents.list());
  router.post('/api/agents', ({ body }) => agents.create(body));
  router.post('/api/agents/import', ({ body }) => agents.importDoc(body));
  router.get('/api/agents/:id', ({ params }) => agents.get(params.id));
  router.put('/api/agents/:id', ({ params, body }) => agents.save(params.id, body));
  router.patch('/api/agents/:id', ({ params, body }) => agents.patch(params.id, body));
  router.delete('/api/agents/:id', ({ params }) => { agents.remove(params.id); memory.clear(params.id); });
  router.post('/api/agents/:id/duplicate', ({ params }) => agents.duplicate(params.id));
  router.post('/api/agents/:id/secret', ({ params }) => agents.rotateSecret(params.id));
  router.get('/api/agents/:id/export', ({ params }) => {
    const doc = agents.exportDoc(params.id);
    const name = `${doc.agent.name.replace(/[^\w가-힣 -]+/g, '_') || 'agent'}.myagent`;
    return new Raw(JSON.stringify(doc, null, 2), { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}` });
  });
  router.post('/api/agents/:id/deploy', ({ params, body }) => {
    const a = agents.get(params.id);
    const on = body?.deployed !== false;
    if (on) {
      const errors = findProblems(a, problemContext(core)).filter((p) => p.severity === 'error');
      if (errors.length) throw new AppError('HAS_PROBLEMS', `The agent has ${errors.length} problem(s) to fix first`, 400, { problems: errors });
    }
    return agents.patch(params.id, { deployed: on });
  });
  router.post('/api/problems', ({ body }) => findProblems(body?.agent ?? body, problemContext(core)));

  // ── runs
  router.post('/api/agents/:id/run', async ({ params, body }) => {
    const options = { sessionId: body?.sessionId ?? null, usePins: body?.usePins };
    const run = engine.start(params.id, { kind: body?.kind ?? 'manual', payload: body?.payload, nodeId: body?.nodeId }, options);
    return body?.wait ? engine.wait(run.id) : engine.summary(run);
  });
  // Runs the editor's document as it is now (not saved yet).
  router.post('/api/run-draft', async ({ body }) => {
    const doc = body?.agent;
    if (!doc || !Array.isArray(doc.nodes)) throw new AppError('BAD_AGENT', 'An agent document is required', 400);
    const run = engine.start(doc, { kind: body.kind ?? 'manual', payload: body.payload, nodeId: body.nodeId }, { draft: true, sessionId: body.sessionId ?? null, usePins: body.usePins });
    return body.wait ? engine.wait(run.id) : engine.summary(run);
  });
  // Chat: one message → the agent's reply (the run waits; human steps are answered from the app).
  router.post('/api/agents/:id/chat', async ({ params, body }) => {
    const message = String(body?.message ?? '');
    const run = engine.start(body?.agent ?? params.id, { kind: 'chat', payload: { message, session: body?.sessionId ?? 'default', ...(body?.payload ?? {}) } }, { sessionId: body?.sessionId ?? 'default', draft: Boolean(body?.agent) });
    const done = await engine.wait(run.id);
    return { runId: done.id, status: done.status, reply: done.output, error: done.error };
  });
  router.get('/api/runs', ({ query }) => {
    let list = core.store.runs.all();
    if (query.agentId) list = list.filter((r) => r.agentId === query.agentId);
    if (query.status) list = list.filter((r) => r.status === query.status);
    list.sort((a, b) => b.startedAt - a.startedAt);
    return list.slice(0, Math.min(500, Number(query.limit) || 100)).map(engine.summary);
  });
  router.get('/api/runs/active', () => engine.activeRuns());
  router.get('/api/runs/:id', ({ params }) => { const run = engine.get(params.id); if (!run) throw new AppError('RUN_NOT_FOUND', 'Run not found', 404); return run; });
  router.post('/api/runs/:id/cancel', ({ params }) => engine.cancel(params.id));
  router.post('/api/runs/:id/resume', ({ params, body, ctx }) => engine.resume(params.id, { ...body, by: ctx.user?.username ?? null }));
  router.delete('/api/runs/:id', ({ params }) => { if (engine.isActive(params.id)) throw new AppError('RUN_ACTIVE', 'Stop the run first', 409); core.store.runs.remove(params.id); });
  router.delete('/api/runs', ({ query }) => {
    for (const r of core.store.runs.all()) if ((!query.agentId || r.agentId === query.agentId) && !engine.isActive(r.id)) core.store.runs.remove(r.id);
  });
  router.get('/api/events', ({ req, res, query }) => sse(core, req, res, query.runId ? (e) => e.data?.runId === query.runId : null));

  // ── webhooks: /api/hooks/<agentId>/<secret> (no token: the secret in the URL is the key)
  const hook = async ({ req, params, query, body }) => {
    const agent = core.store.agents.get(params.id);
    if (!agent || !agent.hookSecret || agent.hookSecret !== params.secret) throw new AppError('HOOK_NOT_FOUND', 'Unknown webhook', 404);
    const trigger = agent.nodes.find((n) => n.type === 'trigger.webhook' && !n.disabled);
    if (!trigger) throw new AppError('NO_WEBHOOK', 'The agent has no Webhook trigger', 404);
    const method = trigger.config?.method ?? 'POST';
    if (method !== 'ANY' && method !== req.method) throw new AppError('METHOD_NOT_ALLOWED', `This webhook takes ${method}`, 405);
    const run = engine.start(agent.id, { kind: 'webhook', nodeId: trigger.id, payload: webhookPayload(req, query, body) });
    if (trigger.config?.respond === 'accepted') return new Raw(JSON.stringify({ runId: run.id, status: 'running' }), { 'Content-Type': 'application/json; charset=utf-8' }, 202);
    const done = await engine.wait(run.id);
    if (done.status !== 'succeeded') throw new AppError('RUN_FAILED', done.error?.message ?? done.status, 500, { runId: done.id });
    const status = done.response?.status ?? 200;
    const value = done.response ? done.response.value : done.output;
    if (typeof value === 'string') return new Raw(value, { 'Content-Type': /^\s*[[{]/.test(value) ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'X-Run-Id': done.id }, status);
    return new Raw(JSON.stringify(value ?? null), { 'Content-Type': 'application/json; charset=utf-8', 'X-Run-Id': done.id }, status);
  };
  for (const m of ['get', 'post', 'put', 'patch', 'delete']) router[m]('/api/hooks/:id/:secret', hook, { public: true, rawBody: true, hook: true });

  // ── models & keys
  router.get('/api/credentials', () => ({ items: credentials.list(), providers: credentials.available() }));
  router.post('/api/credentials', ({ body }) => credentials.create(body ?? {}));
  router.put('/api/credentials/:id', ({ params, body }) => credentials.update(params.id, body ?? {}));
  router.delete('/api/credentials/:id', ({ params }) => credentials.remove(params.id));
  router.get('/api/models', async ({ query }) => ({ provider: query.provider, models: await listModels(query.provider, credentials.resolve(query.provider, query.credential || null)) }));
  // Local Ollama: status, install (+ start), start, pull a model; the job's progress (ARCHITECTURE.md §5.3)
  router.get('/api/ollama', () => core.ollama.status());
  router.get('/api/ollama/job', () => core.ollama.job());
  router.post('/api/ollama/install', () => { core.ollama.check(); core.ollama.install().catch(() => {}); return core.ollama.job(); });
  router.post('/api/ollama/start', () => core.ollama.start());
  router.post('/api/ollama/pull', ({ body }) => { core.ollama.check(); const p = core.ollama.pull(body?.model); p.catch(() => {}); return core.ollama.job(); });
  // A short call to check a model and key: { model: "provider:model" } → { ok, text, ms }
  router.post('/api/models/test', async ({ body }) => {
    const started = Date.now();
    const draft = { id: 'model-test', name: 'Model test', nodes: [
      { id: 't', type: 'trigger.manual', name: 'Test', config: {} },
      { id: 'l', type: 'ai.llm', name: 'Ask', config: { model: body?.model ?? '', prompt: 'Reply with the single word: pong', maxTokens: 64 } },
    ], edges: [{ id: 'e', from: 't', fromPort: 'out', to: 'l', toPort: 'in' }] };
    const run = await engine.runAndWait(draft, { kind: 'manual', payload: {} }, { ephemeral: true });
    if (run.status !== 'succeeded') throw new AppError(run.error?.code ?? 'MODEL_TEST_FAILED', run.error?.message ?? 'The model did not answer', 502);
    return { ok: true, text: run.output?.text ?? '', ms: Date.now() - started, model: run.steps[1]?.model ?? '' };
  });

  // ── knowledge bases
  router.get('/api/kbs', () => knowledge.list());
  router.post('/api/kbs', ({ body }) => knowledge.create(body ?? {}));
  router.get('/api/kbs/:id', ({ params }) => knowledge.get(params.id));
  router.patch('/api/kbs/:id', ({ params, body }) => knowledge.update(params.id, body ?? {}));
  router.delete('/api/kbs/:id', ({ params }) => knowledge.remove(params.id));
  router.post('/api/kbs/:id/docs', ({ params, body }) => {
    const text = body?.base64 ? Buffer.from(String(body.base64), 'base64').toString('utf8') : body?.text;
    return knowledge.addDocument(params.id, { name: body?.name, text });
  });
  router.get('/api/kbs/:id/docs/:docId', ({ params }) => ({ text: knowledge.documentText(params.id, params.docId) }));
  router.delete('/api/kbs/:id/docs/:docId', ({ params }) => knowledge.removeDocument(params.id, params.docId));
  router.post('/api/kbs/:id/search', ({ params, body }) => knowledge.search([params.id], String(body?.query ?? ''), Number(body?.k) || 8));

  // ── memory (chat sessions)
  router.get('/api/agents/:id/memory', ({ params, query }) => (query.session ? { messages: memory.get(params.id, query.session, 200) } : { sessions: memory.sessions(params.id) }));
  router.delete('/api/agents/:id/memory', ({ params, query }) => memory.clear(params.id, query.session || null));

  // ── templates and the description builder
  router.get('/api/templates', () => templateList());
  router.get('/api/templates/:id', ({ params, query }) => { const doc = buildTemplate(params.id, query.lang); if (!doc) throw new AppError('TEMPLATE_NOT_FOUND', 'No such template', 404); return doc; });
  router.post('/api/build', async ({ body }) => {
    const model = body?.model || settings.get().defaultModel;
    const chat = async (req) => {
      const ref = parseModelRef(req.model);
      const { chat: providerChat } = await import('../core/providers/index.js');
      return providerChat({ ...req, provider: ref.provider, model: ref.model, credential: credentials.resolve(ref.provider) });
    };
    return buildFromDescription(String(body?.description ?? ''), { lang: body?.lang ?? 'ko', chat, model });
  });

  // ── schedules
  router.get('/api/schedules', () => core.scheduler.upcoming());
}
