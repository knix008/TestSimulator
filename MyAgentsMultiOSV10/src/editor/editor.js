// The agent editor (ARCHITECTURE.md §10): the open document with Undo/Redo, the canvas, the inspector, the
// chat tester, the palette, live runs drawn on the canvas, the run timeline, the run history and problems.
// The shell (app.js) gives it the window's helpers and hosts; it never touches the shell's DOM itself.
import { NODE_TYPES, CATEGORIES, nodeDef, defaultConfig, outputPorts, isTrigger, label as L } from '../../core/nodes/defs.js';
import { autoLayout, NODE_W, SCREEN_ASPECT } from '../../core/layout.js';
import { progressModel, codeModel, progressHtml, codeHtml } from './progress.js';
import { findProblems } from '../../core/validate.js';
import { toText } from '../../core/expr.js';
import { PROVIDERS } from '../../core/providers/index.js';
import { createCanvas, nodeBox } from './canvas.js';
import { createInspector } from './inspector.js';
import { runHeaderHtml, waitingHtml, stepsHtml, stepDetailHtml, historyHtml, problemRowHtml, fmtMs } from './runpanel.js';
import { icon } from '../icons.js';
import { escapeHtml } from '../ui/dom.js';
import './editor.css';

const CORE_KEYS = ['name', 'description', 'icon', 'nodes', 'edges', 'variables'];
const coreJson = (d) => JSON.stringify(Object.fromEntries(CORE_KEYS.map((k) => [k, d?.[k]])));
const clone = (v) => JSON.parse(JSON.stringify(v));
const uid = (p) => `${p}${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`;

export function createEditor(app) {
  const { t } = app;
  const lang = () => app.lang();
  const state = {
    doc: null, saved: '', rev: null,
    undo: [], redo: [],
    canvas: null, inspector: null,
    live: null, // the run being followed (live)
    shown: null, // the run whose states the canvas and timeline show (live or from history)
    selectedStep: null,
    history: [], historyLoaded: null,
    problems: [],
    chat: { session: 'default', messages: [], busy: false },
    catalogs: { kbs: [], agents: [], credentials: [], providerStatus: [], defaultModel: 'mock:mock-1', models: {} },
    clipboard: null,
    openSections: new Set(['lastrun']),
    paletteQuery: '',
    paletteCollapsed: new Set(),
  };
  const doc = () => state.doc;
  const agentKey = () => state.doc?.id ?? 'draft';

  // ───────────────────────── document & history

  function open(agent, { saved = true } = {}) {
    state.doc = clone(agent);
    state.doc.nodes ??= [];
    state.doc.edges ??= [];
    state.doc.variables ??= [];
    state.saved = saved ? coreJson(state.doc) : '';
    state.rev = agent.rev ?? null;
    state.undo = [];
    state.redo = [];
    state.live = null;
    state.shown = null;
    state.selectedStep = null;
    state.history = [];
    state.historyLoaded = null;
    state.chat = { session: `s${Date.now().toString(36)}`, messages: greeting(), busy: false };
    state.canvas?.clearRun();
    renderDoc({ fit: true });
    refreshProblems();
    if (state.doc.id) loadHistory();
  }

  function greeting() {
    const chat = state.doc?.nodes.find((n) => n.type === 'trigger.chat');
    return chat?.config?.greeting ? [{ role: 'assistant', text: chat.config.greeting, at: Date.now() }] : [];
  }

  const dirty = () => Boolean(state.doc) && coreJson(state.doc) !== state.saved;

  /** Changes the document as one undo step (consecutive edits of the same field within 1.5 s join). */
  function change(label, mutate, { coalesce = null, quiet = false } = {}) {
    if (!state.doc) return;
    const before = coreJson(state.doc);
    mutate(state.doc);
    const after = coreJson(state.doc);
    if (before === after) return;
    const last = state.undo.at(-1);
    if (coalesce && last?.coalesce === coalesce && Date.now() - last.at < 1500) { last.after = after; last.at = Date.now(); } else state.undo.push({ label, before, after, coalesce, at: Date.now() });
    if (state.undo.length > 300) state.undo.shift();
    state.redo = [];
    if (!coalesce) { state.canvas?.render(state.doc); } else { for (const id of state.canvas?.selection() ?? []) state.canvas.renderNode(id); }
    if (!quiet && !coalesce) state.inspector?.render();
    refreshProblems();
    app.docChanged();
    if (app.settings().autoSave && state.doc.id) scheduleAutoSave();
  }

  function restore(json) {
    const data = JSON.parse(json);
    for (const k of CORE_KEYS) state.doc[k] = data[k];
    state.canvas?.render(state.doc);
    state.inspector?.render();
    refreshProblems();
    app.docChanged();
  }

  function undo() { const e = state.undo.pop(); if (!e) return null; state.redo.push(e); restore(e.before); return e.label; }
  function redo() { const e = state.redo.pop(); if (!e) return null; state.undo.push(e); restore(e.after); return e.label; }

  let autoTimer = null;
  function scheduleAutoSave() { clearTimeout(autoTimer); autoTimer = setTimeout(() => { if (dirty()) save({ quiet: true }).catch(() => {}); }, 1500); }

  async function save({ quiet = false } = {}) {
    if (!state.doc) return null;
    const body = { ...state.doc, viewport: state.canvas?.viewport() };
    let out;
    if (state.doc.id) out = await app.client.saveAgent(state.doc.id, { ...body, rev: state.rev ?? undefined });
    else out = await app.client.createAgent(body);
    state.doc.id = out.id;
    state.doc.hookSecret = out.hookSecret;
    state.doc.deployed = out.deployed;
    state.doc.createdAt = out.createdAt;
    state.rev = out.rev;
    state.saved = coreJson(state.doc);
    if (!quiet) app.notify('success', t('notice.saved', { name: out.name }));
    app.docChanged({ saved: true });
    await app.refreshAgents();
    return out;
  }

  // ───────────────────────── catalogs (knowledge bases, agents, keys)

  async function loadCatalogs() {
    try {
      const [kbs, agents, creds, settings] = await Promise.all([app.client.kbs(), app.client.agents(), app.client.credentials(), app.client.settings()]);
      state.catalogs = { ...state.catalogs, kbs, agents, credentials: creds.items, providerStatus: creds.providers, defaultModel: settings.defaultModel, settings };
    } catch { /* the core is not reachable: the shell says so */ }
    refreshProblems();
    state.inspector?.render();
  }

  async function loadModels(provider, { force = false } = {}) {
    if (!force && state.catalogs.models[provider]) return;
    try {
      const out = await app.client.models(provider);
      state.catalogs.models = { ...state.catalogs.models, [provider]: out.models };
      state.inspector?.render();
      if (force) app.notify('info', t('models.loaded', { n: out.models.length, provider }));
    } catch (error) { app.notify('warning', `${t('models.loadFailed')}: ${error.message}`); }
  }

  // ───────────────────────── problems

  let problemTimer = null;
  function refreshProblems() {
    clearTimeout(problemTimer);
    problemTimer = setTimeout(() => {
      const c = state.catalogs;
      state.problems = state.doc ? findProblems(state.doc, {
        ready: Object.fromEntries((c.providerStatus ?? []).map((p) => [p.id, p.ready])), defaultModel: c.defaultModel,
        kbIds: new Set(c.kbs.map((k) => k.id)), agentIds: new Set(c.agents.map((a) => a.id)), allowShell: c.settings?.allowShell,
      }) : [];
      app.problemsChanged();
    }, 200);
  }

  // ───────────────────────── node operations

  function addNode(type, at = null, connectFrom = null) {
    const def = nodeDef(type);
    if (!def) return null;
    const id = uid('n');
    const used = new Set(state.doc.nodes.map((n) => n.name));
    let name = L(def.label, lang());
    for (let i = 2; used.has(name); i += 1) name = `${L(def.label, lang())} ${i}`;
    let pos = at;
    if (!pos) {
      const sel = state.doc.nodes.find((n) => n.id === (connectFrom?.from ?? state.canvas?.selection()[0]));
      if (sel) { pos = { x: sel.x + NODE_W + 90, y: sel.y }; connectFrom ??= { from: sel.id, port: outputPorts(sel)[0] }; } else { const c = state.canvas?.center() ?? { x: 200, y: 200 }; pos = { x: c.x - NODE_W / 2, y: c.y - 38 }; }
    }
    const node = { id, type, name, x: Math.round(pos.x / 10) * 10, y: Math.round(pos.y / 10) * 10, config: defaultConfig(type) };
    change(t('op.addNode', { name }), (d) => {
      // avoid landing exactly on another card
      while (d.nodes.some((n) => Math.abs(n.x - node.x) < 30 && Math.abs(n.y - node.y) < 30)) node.y += 100;
      d.nodes.push(node);
      const from = connectFrom ? d.nodes.find((n) => n.id === connectFrom.from) : null;
      if (from && def.inputs && connectFrom.port && from.id !== id) d.edges.push({ id: uid('e'), from: from.id, fromPort: connectFrom.port, to: id, toPort: 'in' });
    });
    state.canvas?.setSelection([id]);
    selectNodes([id]);
    state.canvas?.reveal(id);
    return id;
  }

  function deleteSelection() {
    const ids = new Set(state.canvas?.selection() ?? []);
    const edge = state.canvas?.selectedEdge();
    if (!ids.size && !edge) return;
    change(ids.size ? t('op.deleteNodes', { n: ids.size }) : t('op.deleteEdge'), (d) => {
      d.nodes = d.nodes.filter((n) => !ids.has(n.id));
      d.edges = d.edges.filter((e) => e.id !== edge && !ids.has(e.from) && !ids.has(e.to));
    });
    state.canvas?.setSelection([]);
    selectNodes([]);
  }

  function copySelection() {
    const ids = new Set(state.canvas?.selection() ?? []);
    if (!ids.size) return false;
    state.clipboard = { nodes: clone(state.doc.nodes.filter((n) => ids.has(n.id))), edges: clone(state.doc.edges.filter((e) => ids.has(e.from) && ids.has(e.to))) };
    const text = JSON.stringify({ format: 'myagents-nodes', ...state.clipboard }, null, 2);
    app.copy(text, { quiet: true });
    return true;
  }

  function paste(data = state.clipboard, at = null) {
    if (!data?.nodes?.length) return;
    const map = new Map();
    const minX = Math.min(...data.nodes.map((n) => n.x));
    const minY = Math.min(...data.nodes.map((n) => n.y));
    const target = at ?? { x: minX + 40, y: minY + 40 };
    const used = new Set(state.doc.nodes.map((n) => n.name));
    const nodes = data.nodes.map((n) => {
      const id = uid('n');
      map.set(n.id, id);
      let name = n.name;
      for (let i = 2; used.has(name); i += 1) name = `${n.name} ${i}`;
      used.add(name);
      return { ...clone(n), id, name, x: Math.round(target.x + n.x - minX), y: Math.round(target.y + n.y - minY) };
    });
    const edges = data.edges.filter((e) => map.has(e.from) && map.has(e.to)).map((e) => ({ ...e, id: uid('e'), from: map.get(e.from), to: map.get(e.to) }));
    change(t('op.paste', { n: nodes.length }), (d) => { d.nodes.push(...nodes); d.edges.push(...edges); });
    state.canvas?.setSelection(nodes.map((n) => n.id));
    selectNodes(nodes.map((n) => n.id));
  }

  function duplicateSelection() { if (copySelection()) paste(); }

  function arrange() {
    // laid out for the canvas's own shape: a long flow wraps into rows instead of running off to the right
    const box = host.canvas?.getBoundingClientRect?.();
    const aspect = box?.width && box?.height ? box.width / box.height : SCREEN_ASPECT;
    change(t('op.arrange'), (d) => { const laid = autoLayout(d.nodes, d.edges, { aspect }); for (const n of d.nodes) { const p = laid.find((x) => x.id === n.id); n.x = p.x; n.y = p.y; } });
    setTimeout(() => state.canvas?.fit(undefined, { all: true }), 30);
  }

  function selectNodes(ids) {
    state.inspector?.show(ids.length === 1 ? ids[0] : null);
    if (ids.length === 1 && app.settings().rightTab !== 'node') app.showRightTab('node');
    app.selectionChanged(ids);
  }

  function togglePin(id) {
    const n = state.doc.nodes.find((x) => x.id === id);
    if (!n) return;
    const step = lastStep(id);
    change(n.pinned != null ? t('inspector.unpin') : t('inspector.pin'), (d) => {
      const x = d.nodes.find((y) => y.id === id);
      if (x.pinned != null) delete x.pinned; else if (step?.output !== undefined) x.pinned = clone(step.output);
    });
  }

  // ───────────────────────── runs

  function lastStep(nodeId) {
    const steps = state.shown?.steps ?? [];
    for (let i = steps.length - 1; i >= 0; i -= 1) if (steps[i].nodeId === nodeId) return steps[i];
    return null;
  }

  /** What the expressions of a node would see now: the shown run's trigger, node outputs and the node's input. */
  function previewScope(nodeId) {
    const run = state.shown;
    if (!run) return null;
    const nodes = {};
    for (const s of run.steps ?? []) { if (s.output !== undefined) { nodes[s.name] = { output: s.output }; nodes[s.nodeId] = { output: s.output }; } }
    const own = lastStep(nodeId);
    return { trigger: run.trigger?.payload ?? {}, input: own?.input ?? run.trigger?.payload ?? {}, nodes, vars: Object.fromEntries((state.doc?.variables ?? []).map((v) => [v.key, v.value])), run: { id: run.id }, env: { now: new Date().toISOString() }, item: own?.input, index: own?.loop?.index ?? 0 };
  }

  /** Draws a whole run on the canvas (a run from the history, or the live one when it finishes). */
  function showRun(run) {
    state.shown = run;
    state.canvas?.clearRun();
    if (!run) { renderRunPanel(); return; }
    const per = new Map();
    for (const s of run.steps ?? []) {
      const p = per.get(s.nodeId) ?? { count: 0, ports: {} };
      p.count += 1;
      p.status = s.status;
      p.ms = s.ms;
      p.title = s.error?.message ?? '';
      p.note = s.error ? s.error.message : '';
      for (const port of String(s.port ?? '').split(', ').filter(Boolean)) p.ports[port] = (p.ports[port] ?? 0) + 1;
      per.set(s.nodeId, p);
    }
    for (const [id, p] of per) state.canvas?.markNode(id, p);
    // edges that carried data: from a node's used port to a node that ran after it
    const ran = new Set(per.keys());
    for (const e of state.doc?.edges ?? []) if (ran.has(e.from) && ran.has(e.to) && (per.get(e.from).ports[e.fromPort] || e.fromPort === 'tools')) state.canvas?.markEdge(e.id, { count: per.get(e.from).ports[e.fromPort] ?? 1, active: false });
    state.inspector?.render();
    renderRunPanel();
  }

  function triggerOf(kind) {
    const triggers = (state.doc?.nodes ?? []).filter((n) => isTrigger(n) && !n.disabled);
    return triggers.find((n) => nodeDef(n.type).trigger === kind) ?? null;
  }

  /** Runs the agent: the document as it is now (a draft when it has unsaved changes). */
  async function run({ kind = null, payload, nodeId, onlyTo = null } = {}) {
    if (!state.doc) return null;
    const triggers = state.doc.nodes.filter((n) => isTrigger(n) && !n.disabled);
    if (!triggers.length) { app.notify('warning', t('problem.noTrigger')); return null; }
    let start = nodeId ? state.doc.nodes.find((n) => n.id === nodeId) : (kind ? triggerOf(kind) : null) ?? triggers.find((n) => n.type === 'trigger.manual') ?? triggers[0];
    if (!start) start = triggers[0];
    const k = nodeDef(start.type).trigger;
    if (k === 'chat' && payload === undefined) { app.showRightTab('chat'); app.notify('info', t('chat.useChat')); return null; }
    if (k === 'webhook' && payload === undefined) {
      const res = await app.form({ title: t('run.webhookTest'), icon: 'webhook', submitLabel: t('action.run'), fields: [{ name: 'body', type: 'textarea', label: t('run.webhookBody'), value: '{\n  "title": "Crash on start",\n  "body": "The app crashes when it starts."\n}' }] });
      if (!res) return null;
      let body = res.values.body;
      try { body = JSON.parse(body); } catch { /* text body */ }
      payload = { method: 'POST', query: {}, headers: {}, body };
    }
    if (k === 'form' && payload === undefined) {
      const names = (Array.isArray(start.config?.fields) ? start.config.fields : []).map(String).filter(Boolean);
      const res = await app.form({ title: String(start.config?.title || start.name), icon: 'form', submitLabel: t('action.run'), fields: names.map((name) => ({ name, type: /message|request|내용|요청|설명|본문/i.test(name) ? 'textarea' : 'text', label: name, value: '' })) });
      if (!res) return null;
      payload = { ...res.values };
    }
    let docToRun = state.doc;
    if (onlyTo) docToRun = { ...state.doc, nodes: upstream(onlyTo).map((id) => state.doc.nodes.find((n) => n.id === id)) };
    docToRun = { ...docToRun, edges: state.doc.edges.filter((e) => docToRun.nodes.some((n) => n.id === e.from) && docToRun.nodes.some((n) => n.id === e.to)) };
    beginFollow();
    try {
      const summary = !dirty() && state.doc.id && !onlyTo ? await app.client.run(state.doc.id, { kind: k, payload, nodeId: start.id }) : await app.client.runDraft({ ...docToRun, id: state.doc.id ?? undefined }, { kind: k, payload, nodeId: start.id });
      app.notify('info', t('notice.runStarted'));
      return summary;
    } catch (error) {
      state.following = false;
      app.showError('error.run', error);
      return null;
    }
  }

  /** The node and every node it depends on (for "run up to here"). */
  function upstream(id) {
    const out = new Set([id]);
    const stack = [id];
    while (stack.length) { const x = stack.pop(); for (const e of state.doc.edges) if (e.to === x && !out.has(e.from)) { out.add(e.from); stack.push(e.from); } }
    // tools of included agents
    for (const e of state.doc.edges) if (e.fromPort === 'tools' && out.has(e.from)) out.add(e.to);
    return [...out];
  }

  function beginFollow() {
    state.following = true;
    state.canvas?.clearRun();
    // the Progress and Code tabs follow a run themselves: stay on them
    if (!['progress', 'code'].includes(app.bottomTab())) app.showBottomTab('run');
  }

  async function stop() {
    const r = state.live;
    if (!r || !['running', 'waiting'].includes(r.status)) return;
    try { await app.client.cancelRun(r.id); app.notify('info', t('notice.runStopped')); } catch (error) { app.showError('error.run', error); }
  }

  async function answer(approved) {
    const r = state.live ?? state.shown;
    if (!r?.waiting) return;
    const host = app.bottomHost();
    const values = {};
    for (const el of host?.querySelectorAll('[data-wait-field]') ?? []) values[el.dataset.waitField] = el.value;
    const comment = host?.querySelector('[data-wait-comment]')?.value ?? '';
    try { await app.client.resumeRun(r.id, { approved, comment, values }); } catch (error) { app.showError('error.run', error); }
  }

  // live events from the core (app.js forwards the event stream)
  let panelFrame = 0;
  const schedulePanel = () => { if (panelFrame) return; panelFrame = requestAnimationFrame(() => { panelFrame = 0; renderRunPanel(); }); };

  function onEvent(type, data) {
    if (type === 'kb.changed' || type === 'kb.removed' || type.startsWith('agent.')) { loadCatalogs(); return; }
    if (!type.startsWith('run.') || !state.doc) return;
    const mine = data.agentId === agentKey() || (state.live && data.runId === state.live.id);
    if (type === 'run.started') {
      if (!mine || data.run?.parentRunId) return;
      if (!state.following && !app.settings().followRuns) return;
      state.following = false;
      state.live = { ...data.run, steps: [], trigger: data.run.trigger, usage: { input: 0, output: 0, calls: 0 } };
      state.shown = state.live;
      state.selectedStep = null;
      state.canvas?.clearRun();
      app.runChanged(state.live);
      schedulePanel();
      return;
    }
    const live = state.live;
    if (!live || data.runId !== live.id) return;
    if (type === 'run.step') {
      const s = data.step;
      const i = live.steps.findIndex((x) => x.id === s.id);
      if (i >= 0) live.steps[i] = s; else live.steps.push(s);
      const prev = state.canvas?.runState(s.nodeId) ?? { count: 0, ports: {} };
      const ports = { ...(prev.ports ?? {}) };
      if (data.phase === 'end') for (const p of String(s.port ?? '').split(', ').filter(Boolean)) ports[p] = (ports[p] ?? 0) + 1;
      state.canvas?.markNode(s.nodeId, { status: s.status, count: data.phase === 'start' ? (prev.count ?? 0) + 1 : prev.count, ms: s.ms, ports, note: s.status === 'failed' ? s.error?.message ?? '' : s.status === 'waiting' ? t('run.waitingNote') : s.type === 'ai.agent' && data.phase === 'end' ? prev.note ?? '' : '', title: s.error?.message ?? s.status });
      if (data.phase === 'start' && app.settings().followRuns) state.canvas?.reveal(s.nodeId);
      if (data.phase === 'waiting') { live.status = 'waiting'; app.runChanged(live); }
      if (state.inspector?.current() === s.nodeId) state.inspector.render();
      schedulePanel();
    } else if (type === 'run.edge') {
      state.canvas?.flow(data.edgeId ?? { from: data.from, to: data.to, port: data.port });
    } else if (type === 'run.tool') {
      const prev = state.canvas?.runState(data.nodeId);
      state.canvas?.markNode(data.nodeId, { note: data.phase === 'start' ? `🔧 ${data.name}(${short(JSON.stringify(data.args ?? {}), 40)})` : `${data.error ? '✗' : '✓'} ${data.name} · ${fmtMs(data.ms)}`, status: prev?.status ?? 'running' });
    } else if (type === 'run.log') {
      const s = live.steps.find((x) => x.id === data.stepId);
      if (s) { s.logs = [...(s.logs ?? []), { at: data.at, level: data.level, text: data.text }].slice(-200); schedulePanel(); }
    } else if (type === 'run.waiting') {
      live.status = 'waiting';
      live.waiting = data.waiting;
      app.runChanged(live);
      app.notify('warning', t('run.waitingNotice', { name: data.waiting.nodeName }));
      app.attention?.();
      schedulePanel();
    } else if (type === 'run.status') {
      live.status = data.status;
      live.waiting = null;
      app.runChanged(live);
      schedulePanel();
    } else if (type === 'run.notify') {
      app.notify(data.level === 'warning' ? 'warning' : data.level === 'success' ? 'success' : 'info', `${t('run.notifyFrom')}: ${data.message}`);
    } else if (type === 'run.finished') {
      Object.assign(live, data.run, { steps: live.steps });
      app.runChanged(live);
      app.client.runDetail(live.id).then((full) => {
        if (state.live?.id !== full.id) return;
        state.live = full;
        state.shown = full;
        state.inspector?.render();
        schedulePanel();
        loadHistory();
        app.runFinished?.(full);
      }).catch(() => app.runFinished?.(live));
      const ok = data.status === 'succeeded';
      app.notify(ok ? 'success' : data.status === 'cancelled' ? 'info' : 'error', t(`notice.run.${data.status}`, { ms: fmtMs(data.run.ms), error: data.run.error?.message ?? '' }));
      schedulePanel();
    }
  }
  const short = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

  async function loadHistory() {
    const id = state.doc?.id;
    if (!id) { state.history = []; return; }
    try { state.history = await app.client.runs({ agentId: id, limit: 100 }); state.historyLoaded = id; } catch { state.history = []; }
    app.problemsChanged();
  }

  async function openHistoryRun(id) {
    try {
      const run = await app.client.runDetail(id);
      state.live = ['running', 'waiting'].includes(run.status) ? run : state.live;
      state.selectedStep = null;
      showRun(run);
      app.showBottomTab('run');
    } catch (error) { app.showError('error.run', error); }
  }

  // ───────────────────────── chat tester

  async function sendChat(text) {
    const message = String(text ?? '').trim();
    if (!message || state.chat.busy || !state.doc) return;
    if (!state.doc.nodes.some((n) => n.type === 'trigger.chat' && !n.disabled)) { app.notify('warning', t('chat.noChatTrigger')); return; }
    state.chat.messages.push({ role: 'user', text: message, at: Date.now() });
    state.chat.busy = true;
    renderChat();
    beginFollow();
    try {
      const out = await app.client.chat(state.doc.id ?? 'draft', { message, sessionId: state.chat.session, agent: { ...state.doc, id: state.doc.id ?? undefined } });
      const reply = out.status === 'succeeded' ? toText(out.reply) : `${t(`run.status.${out.status}`)}: ${out.error?.message ?? ''}`;
      state.chat.messages.push({ role: out.status === 'succeeded' ? 'assistant' : 'error', text: reply || '…', runId: out.runId, at: Date.now() });
    } catch (error) {
      state.chat.messages.push({ role: 'error', text: error.message, at: Date.now() });
    }
    state.chat.busy = false;
    renderChat();
    host.chat?.querySelector('textarea')?.focus();
  }

  async function newChat({ clearMemory = false } = {}) {
    if (clearMemory && state.doc?.id) { try { await app.client.clearMemory(state.doc.id); } catch { /* none */ } }
    state.chat = { session: `s${Date.now().toString(36)}`, messages: greeting(), busy: false };
    renderChat();
  }

  // ───────────────────────── rendering

  const host = { canvas: null, inspector: null, chat: null };

  function mountCanvas(el) {
    if (host.canvas === el && state.canvas) { state.canvas.render(state.doc); return; }
    state.canvas?.destroy();
    host.canvas = el;
    state.canvas = createCanvas(el, {
      lang, t,
      snap: () => app.settings().snapToGrid,
      minimap: () => app.settings().showMinimap,
      animate: () => app.settings().animateRuns,
      onChange: (kind, mutate) => change(t(`op.${kind}`), mutate),
      onSelect: ({ nodes }) => selectNodes(nodes),
      onOpenNode: (id) => { app.showRightTab('node'); state.inspector?.show(id); app.focusInspector?.(); },
      onQuickAdd: (point, connectFrom, at) => quickAdd(point, connectFrom, at),
      onDropType: (type, point) => addNode(type, point),
      onContextMenu: (kind, event, payload) => contextMenu(kind, event, payload),
      onViewport: () => {},
      summaryExtra: (node) => ({
        defaultModelText: (state.catalogs.defaultModel ?? '').replace(/^[^:]+:/, '') || t('inspector.defaultShort'),
        toolCount: state.doc.edges.filter((e) => e.from === node.id && e.fromPort === 'tools').length,
        agentName: (id) => state.catalogs.agents.find((a) => a.id === id)?.name ?? '',
      }),
      emptyHtml: () => `<div class="canvas-empty-card">${icon('wand')}<b>${escapeHtml(t('canvas.emptyTitle'))}</b><span>${escapeHtml(t('canvas.emptyText'))}</span><div class="canvas-empty-actions"><button class="button" data-editor-action="add-trigger">${icon('play')}<span>${escapeHtml(t('canvas.addTrigger'))}</span></button><button class="button primary" data-editor-action="describe">${icon('wand')}<span>${escapeHtml(t('action.describe'))}</span></button></div></div>`,
    });
    if (!el.dataset.editorBound) el.addEventListener('click', (event) => {
      const a = event.target.closest('[data-editor-action]');
      if (!a) return;
      if (a.dataset.editorAction === 'add-trigger') addNode('trigger.manual');
      if (a.dataset.editorAction === 'describe') app.run('describe');
    });
    el.dataset.editorBound = '1';
    renderDoc({ fit: !state.doc?.viewport || (state.doc.viewport.x === 0 && state.doc.viewport.y === 0 && state.doc.viewport.zoom === 1) });
    if (state.shown) showRun(state.shown);
  }

  function renderDoc({ fit = false } = {}) {
    if (!state.canvas || !state.doc) return;
    state.canvas.render(state.doc);
    if (fit) requestAnimationFrame(() => state.canvas?.fit());
    else if (state.doc.viewport) state.canvas.setViewport(state.doc.viewport);
    state.inspector?.show(null);
  }

  function mountInspector(el) {
    host.inspector = el;
    state.inspector = createInspector(el, {
      expand: async ({ title, value, mono, hint }) => { const res = await app.form({ title, icon: 'fullscreen', submitLabel: t('action.apply'), intro: hint, fields: [{ name: 'value', type: 'textarea', label: t('inspector.content'), value, rows: 22, mono }] }); return res ? res.values.value : null; },
      t, lang,
      getDoc: () => state.doc,
      onChange: (label, mutate, o) => change(label, mutate, { ...o, quiet: true }),
      catalogs: () => state.catalogs,
      previewScope, lastStep,
      openSections: state.openSections,
      onPin: togglePin,
      onRunTo: (id) => run({ onlyTo: id }),
      loadModels,
      openView: (v) => app.setView(v),
      onRename: () => { app.docChanged(); },
      onDeploy: (on) => deploy(on),
      onRotateSecret: () => rotateSecret(),
      hookUrl: () => state.hookUrl ?? '',
      nextRuns: () => state.nextRuns ?? '',
      copy: (text) => app.copy(text),
      chooseVariable: async (items, button) => {
        const handlers = {};
        const menu = items.map((p, i) => { handlers[`custom:var${i}`] = () => p; return { id: `custom:var${i}`, label: p, icon: p.startsWith('nodes.') ? 'robot' : p.startsWith('trigger') ? 'bolt' : p.startsWith('vars') ? 'variable' : 'braces' }; });
        return app.showMenu(menu, app.anchorBelow(button), 'context', { handlers, header: { icon: 'braces', title: t('inspector.insertVariable') } });
      },
    });
    state.inspector.show(state.canvas?.selection().length === 1 ? state.canvas.selection()[0] : null);
    updateHookUrl();
  }

  async function updateHookUrl() {
    if (state.doc?.id && state.doc.hookSecret) { try { state.hookUrl = await app.client.hookUrl(state.doc); } catch { state.hookUrl = ''; } }
    if (state.doc?.nodes.some((n) => n.type === 'trigger.schedule')) {
      try {
        const list = (await app.client.schedules()).filter((s) => s.agentId === state.doc.id);
        state.nextRuns = list.length ? list.map((s) => (s.error ? s.error : new Date(s.at).toLocaleString())).join(' · ') : t('inspector.notDeployed');
      } catch { state.nextRuns = ''; }
    }
    if (!state.inspector?.current()) state.inspector?.render();
  }

  async function deploy(on) {
    if (!state.doc) return;
    try {
      if (dirty() || !state.doc.id) await save({ quiet: true });
      const out = await app.client.deploy(state.doc.id, on);
      state.doc.deployed = out.deployed;
      state.rev = out.rev;
      app.notify('success', t(on ? 'notice.deployed' : 'notice.undeployed', { name: out.name }));
      app.docChanged({ saved: true });
      await app.refreshAgents();
      updateHookUrl();
    } catch (error) {
      if (error.code === 'HAS_PROBLEMS') { app.showBottomTab('problems'); app.notify('error', error.message); } else app.showError('error.deploy', error);
      state.inspector?.render();
    }
  }

  async function rotateSecret() {
    if (!state.doc?.id) return;
    const out = await app.client.rotateSecret(state.doc.id);
    state.doc.hookSecret = out.hookSecret;
    state.rev = out.rev;
    await updateHookUrl();
    app.notify('success', t('notice.secretRotated'));
  }

  function mountChat(el) {
    host.chat = el;
    renderChat();
  }

  function renderChat() {
    const el = host.chat;
    if (!el) return;
    const has = state.doc?.nodes.some((n) => n.type === 'trigger.chat' && !n.disabled);
    const msgs = state.chat.messages.map((m) => `<div class="chat-msg ${m.role}">${m.role === 'assistant' ? `<span class="chat-avatar">${icon('robot')}</span>` : m.role === 'error' ? `<span class="chat-avatar">${icon('error')}</span>` : ''}<div class="chat-bubble">${escapeHtml(m.text)}${m.runId ? `<button class="chat-run" data-chat-run="${escapeHtml(m.runId)}" title="${escapeHtml(t('chat.showRun'))}">${icon('timeline')}</button>` : ''}</div></div>`).join('');
    const scroll = el.querySelector('.chat-list');
    const atBottom = !scroll || scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 10;
    const draftText = el.querySelector('textarea')?.value ?? '';
    el.innerHTML = `<div class="chat-panel">
      <div class="chat-tools"><span class="muted small" title="${escapeHtml(state.chat.session)}">${icon('chat')} ${escapeHtml(t('chat.session'))}: ${escapeHtml(state.chat.session)}</span><span class="grow"></span>
        <button class="small-button" data-chat="new" title="${escapeHtml(t('chat.newTip'))}">${icon('plus')}<span>${escapeHtml(t('chat.new'))}</span></button>
        <button class="small-button danger" data-chat="forget" title="${escapeHtml(t('chat.forgetTip'))}" ${state.doc?.id ? '' : 'disabled'}>${icon('trash')}<span>${escapeHtml(t('chat.forget'))}</span></button></div>
      <div class="chat-list">${has ? msgs || `<p class="muted chat-hint">${icon('info')} ${escapeHtml(t('chat.hint'))}</p>` : `<p class="muted chat-hint">${icon('warning')} ${escapeHtml(t('chat.noChatTrigger'))}</p><button class="small-button" data-chat="add-trigger">${icon('chat')}<span>${escapeHtml(t('chat.addTrigger'))}</span></button>`}${state.chat.busy ? `<div class="chat-msg assistant typing"><span class="chat-avatar">${icon('robot')}</span><div class="chat-bubble"><i></i><i></i><i></i></div></div>` : ''}</div>
      <div class="chat-input"><textarea rows="2" placeholder="${escapeHtml(t('chat.placeholder'))}" ${has ? '' : 'disabled'}>${escapeHtml(draftText)}</textarea><button class="button primary" data-chat="send" ${has && !state.chat.busy ? '' : 'disabled'} title="${escapeHtml(t('chat.sendTip'))}">${icon('send')}<span>${escapeHtml(t('chat.send'))}</span></button></div>
    </div>`;
    const list = el.querySelector('.chat-list');
    if (atBottom) list.scrollTop = list.scrollHeight;
  }

  function bindChat(el) {
    el.addEventListener('click', (event) => {
      const b = event.target.closest('[data-chat], [data-chat-run]');
      if (!b) return;
      if (b.dataset.chatRun) { openHistoryRun(b.dataset.chatRun); return; }
      const a = b.dataset.chat;
      if (a === 'send') sendChat(el.querySelector('textarea')?.value).then(() => {});
      if (a === 'send') { const ta = el.querySelector('textarea'); if (ta) ta.value = ''; }
      if (a === 'new') newChat();
      if (a === 'forget') newChat({ clearMemory: true });
      if (a === 'add-trigger') addNode('trigger.chat');
    });
    el.addEventListener('keydown', (event) => {
      if (event.target.matches('.chat-input textarea') && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        const text = event.target.value;
        event.target.value = '';
        sendChat(text);
      }
    });
  }

  // bottom panel
  function bottomTabs() {
    const errors = state.problems.filter((p) => p.severity === 'error').length;
    const run = state.shown;
    return [
      ['run', run && ['running', 'waiting'].includes(run.status) ? 'hourglass' : 'timeline', t('bottom.run'), run?.steps?.length ?? null],
      ['history', 'recent', t('bottom.history'), state.history.length],
      ['problems', errors ? 'error' : 'warning', t('bottom.problems'), state.problems.length],
      ['progress', 'gauge', t('bottom.progress'), run ? `${progressModel(state.doc, run, lang()).percent}%` : null],
      ['code', 'code', t('bottom.code'), run ? codeModel(run).length || null : null],
    ];
  }

  /** Progress and Code follow the run as it goes (the strip's counts too). */
  function renderLiveTab() {
    const el = app.bottomHost();
    const tab = app.bottomTab();
    if (!el || !['progress', 'code'].includes(tab)) return false;
    const list = el.querySelector('.problems-list');
    if (!list) return true;
    const keep = list.querySelector('.code-body')?.scrollTop ?? 0;
    list.innerHTML = bottomBody(tab);
    const body = list.querySelector('.code-body');
    if (body) body.scrollTop = keep;
    app.bottomTabsChanged?.();
    return true;
  }

  function renderRunPanel() {
    const el = app.bottomHost();
    if (renderLiveTab()) return;
    if (!el || app.bottomTab() !== 'run') return;
    const list = el.querySelector('.problems-list');
    if (!list) return;
    const run = state.shown;
    const keep = list.querySelector('.steps')?.scrollTop ?? 0;
    const step = run?.steps?.find((s) => s.id === state.selectedStep) ?? null;
    list.innerHTML = run ? `${runHeaderHtml(run, t, { live: run === state.live })}${waitingHtml(run, t)}<div class="run-split"><div class="steps">${stepsHtml(run, t, lang(), state.selectedStep)}</div>${stepDetailHtml(step, t)}</div>`
      : `<p class="problems-empty">${icon('info')}<span>${escapeHtml(t('run.none'))}</span></p>`;
    const steps = list.querySelector('.steps');
    if (steps) steps.scrollTop = run?.status === 'running' && !state.selectedStep ? steps.scrollHeight : keep;
  }

  function bottomBody(tab) {
    if (tab === 'run') return '';
    if (tab === 'history') return historyHtml(state.history, t, state.shown?.id);
    if (tab === 'problems') return state.problems.length ? state.problems.map((p, i) => problemRowHtml(p, i, t, state.doc, lang())).join('') : `<p class="problems-empty">${icon('check')}<span>${escapeHtml(t('bottom.noProblems'))}</span></p>`;
    if (tab === 'progress') return progressHtml(progressModel(state.doc, state.shown, lang()), t);
    if (tab === 'code') {
      const files = codeModel(state.shown);
      // while a run writes, the newest file is shown unless one was picked
      const pick = state.codeFile && files.some((f) => f.file === state.codeFile) ? state.codeFile : files.at(-1)?.file;
      return codeHtml(files, pick, t);
    }
    return '';
  }

  function bottomTools(tab) {
    if (tab === 'history') return `<span class="grow"></span><button class="small-button" data-editor-bottom="refresh-history">${icon('refresh')}<span>${escapeHtml(t('action.refresh'))}</span></button><button class="small-button danger" data-editor-bottom="clear-history" ${state.history.length ? '' : 'disabled'}>${icon('clearHistory')}<span>${escapeHtml(t('run.clearHistory'))}</span></button>`;
    if (tab === 'problems') { const c = (k) => state.problems.filter((p) => p.severity === k).length; return `<span class="problems-counts"><span class="problems-chip sev-error">${icon('error')}<span>${c('error')}</span></span><span class="problems-chip sev-warning">${icon('warning')}<span>${c('warning')}</span></span><span class="problems-chip sev-info">${icon('info')}<span>${c('info')}</span></span></span><span class="grow"></span>`; }
    return '<span class="grow"></span>';
  }

  function bottomClick(event) {
    const el = event.target;
    const action = el.closest('[data-run-action]')?.dataset.runAction;
    if (action === 'stop') return stop();
    if (action === 'approve') return answer(true);
    if (action === 'reject') return answer(false);
    if (action === 'submit') return answer(true);
    if (action === 'rerun') return run({ payload: state.shown?.trigger?.payload, kind: state.shown?.trigger?.kind });
    if (action === 'clear') { state.shown = null; state.selectedStep = null; state.canvas?.clearRun(); app.problemsChanged(); return undefined; }
    if (action === 'copy-output') { const s = state.shown?.steps?.find((x) => x.id === state.selectedStep); return app.copy(JSON.stringify(s?.output ?? null, null, 2)); }
    const stepRow = el.closest('[data-step]');
    if (stepRow) { state.selectedStep = stepRow.dataset.step; state.canvas?.setSelection([stepRow.dataset.nodeRef], { quiet: true }); state.canvas?.reveal(stepRow.dataset.nodeRef); state.inspector?.show(stepRow.dataset.nodeRef); renderRunPanel(); return undefined; }
    const codeFile = el.closest('[data-code-file]');
    if (codeFile) { state.codeFile = codeFile.dataset.codeFile; renderLiveTab(); app.bottomHost()?.querySelector('.code-line.changed')?.scrollIntoView({ block: 'center' }); return undefined; }
    const codeCopy = el.closest('[data-code-copy]');
    if (codeCopy) { const f = codeModel(state.shown).find((x) => x.file === codeCopy.dataset.codeCopy); return app.copy(f?.versions.at(-1).text ?? ''); }
    const phase = el.closest('[data-phase]');
    if (phase) { const p = progressModel(state.doc, state.shown, lang()).phases[Number(phase.dataset.phase)]; if (p) { state.canvas?.setSelection(p.nodes, { quiet: true }); state.canvas?.reveal(p.nodes[0]); } return undefined; }
    const testRow = el.closest('[data-test-row]');
    if (testRow) { state.canvas?.setSelection([testRow.dataset.testRow], { quiet: true }); state.canvas?.reveal(testRow.dataset.testRow); selectNodes([testRow.dataset.testRow]); return undefined; }
    const hist = el.closest('[data-history]');
    if (hist) return openHistoryRun(hist.dataset.history);
    const prob = el.closest('[data-problem]');
    if (prob) { const p = state.problems[Number(prob.dataset.problem)]; if (p?.nodeId) { state.canvas?.setSelection([p.nodeId]); state.canvas?.reveal(p.nodeId); selectNodes([p.nodeId]); } if (p?.code === 'noKey') app.setView('models'); return undefined; }
    const b = el.closest('[data-editor-bottom]')?.dataset.editorBottom;
    if (b === 'refresh-history') return loadHistory();
    if (b === 'clear-history') return app.client.clearRuns(state.doc?.id).then(loadHistory);
    return undefined;
  }

  // ───────────────────────── palette (the left panel's lower part)

  function paletteHtml() {
    const q = state.paletteQuery.trim().toLowerCase();
    const groups = CATEGORIES.map((c) => {
      const items = NODE_TYPES.filter((d) => d.category === c.id && (!q || `${L(d.label, 'ko')} ${L(d.label, 'en')} ${L(d.desc, lang())} ${d.type}`.toLowerCase().includes(q)));
      if (!items.length) return '';
      const collapsed = !q && state.paletteCollapsed.has(c.id);
      return `<div class="pal-group ${collapsed ? 'collapsed' : ''}" style="--cat:${c.color}"><button class="pal-head" data-pal-toggle="${c.id}" aria-expanded="${!collapsed}">${icon(collapsed ? 'caretRight' : 'caretDown')}${icon(c.icon)}<span>${escapeHtml(L(c.label, lang()))}</span><i>${items.length}</i></button>
        ${collapsed ? '' : `<div class="pal-items">${items.map((d) => `<button class="pal-item" draggable="true" data-pal-type="${d.type}" title="${escapeHtml(L(d.desc, lang()))}"><span class="pal-icon">${icon(d.icon)}</span><span class="pal-text"><b>${escapeHtml(L(d.label, lang()))}</b><small>${escapeHtml(L(d.desc, lang()))}</small></span></button>`).join('')}</div>`}</div>`;
    }).join('');
    return `<div class="palette"><div class="pal-search"><input type="search" id="palette-search" placeholder="${escapeHtml(t('palette.search'))}" value="${escapeHtml(state.paletteQuery)}" />${icon('search')}</div><div class="pal-all"><button type="button" class="small-button" data-pal-all="open" title="${escapeHtml(t('palette.openAll'))}" ${q || !state.paletteCollapsed.size ? 'disabled' : ''}>${icon('caretDown')}<span>${escapeHtml(t('palette.openAll'))}</span></button><button type="button" class="small-button" data-pal-all="close" title="${escapeHtml(t('palette.closeAll'))}" ${q || state.paletteCollapsed.size >= CATEGORIES.length ? 'disabled' : ''}>${icon('caretRight')}<span>${escapeHtml(t('palette.closeAll'))}</span></button></div><div class="pal-groups">${groups || `<p class="muted">${escapeHtml(t('palette.none'))}</p>`}</div><p class="pal-hint muted small">${icon('info')} ${escapeHtml(t('palette.hint'))}</p></div>`;
  }

  function bindPalette(el) {
    el.addEventListener('dragstart', (event) => {
      const item = event.target.closest('[data-pal-type]');
      if (!item) return;
      event.dataTransfer.setData('application/x-myagents-node', item.dataset.palType);
      event.dataTransfer.effectAllowed = 'copy';
    });
    el.addEventListener('click', (event) => {
      const item = event.target.closest('[data-pal-type]');
      if (item && state.doc) { if (app.view() !== 'editor') app.setView('editor'); addNode(item.dataset.palType); return; }
      const all = event.target.closest('[data-pal-all]');
      if (all && !all.disabled) { if (all.dataset.palAll === 'open') state.paletteCollapsed.clear(); else for (const c of CATEGORIES) state.paletteCollapsed.add(c.id); app.renderPalette(); return; }
      const tog = event.target.closest('[data-pal-toggle]');
      if (tog) { const id = tog.dataset.palToggle; if (state.paletteCollapsed.has(id)) state.paletteCollapsed.delete(id); else state.paletteCollapsed.add(id); app.renderPalette(); }
    });
    el.addEventListener('input', (event) => {
      if (event.target.id !== 'palette-search') return;
      state.paletteQuery = event.target.value;
      clearTimeout(bindPalette.timer);
      bindPalette.timer = setTimeout(() => { app.renderPalette(); const s = document.getElementById('palette-search'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 120);
    });
  }

  // ───────────────────────── menus

  async function quickAdd(point, connectFrom, at) {
    const handlers = {};
    const fromDef = connectFrom ? nodeDef(state.doc.nodes.find((n) => n.id === connectFrom.from)?.type) : null;
    const items = CATEGORIES.filter((c) => !(connectFrom && (c.id === 'trigger' || c.id === 'note'))).map((c) => ({
      id: `submenu:qa-${c.id}`, label: L(c.label, lang()), icon: c.icon, submenu: true,
      children: NODE_TYPES.filter((d) => d.category === c.id).map((d) => { const id = `custom:add:${d.type}`; handlers[id] = () => addNode(d.type, { x: point.x - (connectFrom ? 0 : NODE_W / 2), y: point.y - 30 }, connectFrom); return { id, label: L(d.label, lang()), icon: d.icon }; }),
    }));
    // likely next steps first
    const suggested = (fromDef?.category === 'trigger' ? ['ai.agent', 'ai.llm', 'kb.search', 'ai.classify'] : fromDef?.category === 'ai' ? ['out.respond', 'logic.if', 'human.approval', 'tool.http'] : ['ai.llm', 'logic.if', 'out.respond', 'tool.http']).map((type) => { const d = nodeDef(type); const id = `custom:add:${type}`; handlers[id] = () => addNode(type, { x: point.x - (connectFrom ? 0 : NODE_W / 2), y: point.y - 30 }, connectFrom); return { id, label: L(d.label, lang()), icon: d.icon }; });
    const anchor = app.anchorAt(at?.clientX ?? 200, at?.clientY ?? 200);
    await app.showMenu([...suggested, { separator: true }, ...items, ...(state.clipboard ? [{ separator: true }, { id: 'custom:paste', label: t('action.paste'), icon: 'paste' }] : [])], anchor, 'context', { handlers: { ...handlers, 'custom:paste': () => paste(state.clipboard, point) }, header: { icon: 'plus', title: t('canvas.addNode') } });
  }

  function contextMenu(kind, event, payload) {
    const anchor = app.anchorAt(event.clientX, event.clientY);
    if (kind === 'node') {
      const n = state.doc.nodes.find((x) => x.id === payload.id);
      const many = state.canvas.selection().length > 1;
      const handlers = {
        'custom:open': () => { app.showRightTab('node'); state.inspector.show(n.id); },
        'custom:runto': () => run({ onlyTo: n.id }),
        'custom:disable': () => change(t(n.disabled ? 'inspector.enable' : 'inspector.disable'), (d) => { for (const id of state.canvas.selection()) { const x = d.nodes.find((y) => y.id === id); if (x) x.disabled = !n.disabled; } }),
        'custom:pin': () => togglePin(n.id),
        'custom:rename': async () => { const name = await app.prompt({ title: t('op.rename'), value: n.name }); if (name) change(t('op.rename'), (d) => { d.nodes.find((x) => x.id === n.id).name = name; }); },
        'custom:duplicate': () => duplicateSelection(),
        'custom:copy': () => copySelection(),
        'custom:delete': () => deleteSelection(),
      };
      return app.showMenu([
        { id: 'custom:open', label: t('canvas.openNode'), icon: 'edit', disabled: many },
        { id: 'custom:runto', label: t('inspector.runToHere'), icon: 'play', disabled: many },
        { separator: true },
        { id: 'custom:rename', label: t('op.rename'), icon: 'text', disabled: many },
        { id: 'custom:disable', label: n.disabled ? t('inspector.enable') : t('inspector.disable'), icon: 'powerOff' },
        { id: 'custom:pin', label: n.pinned != null ? t('inspector.unpin') : t('inspector.pin'), icon: 'pin', disabled: many || (n.pinned == null && lastStep(n.id)?.output === undefined) },
        { separator: true },
        { id: 'custom:copy', label: t('action.copy'), icon: 'copy', shortcut: 'Ctrl+C' },
        { id: 'custom:duplicate', label: t('action.duplicate'), icon: 'duplicate', shortcut: 'Ctrl+D' },
        { id: 'custom:delete', label: t('action.delete'), icon: 'trash', shortcut: 'Del', danger: true },
      ], anchor, 'context', { handlers, header: { icon: nodeDef(n.type)?.icon ?? 'dot', title: many ? t('canvas.selected', { n: state.canvas.selection().length }) : n.name } });
    }
    if (kind === 'edge') {
      return app.showMenu([{ id: 'custom:delete', label: t('canvas.deleteEdge'), icon: 'trash', danger: true }], anchor, 'context', { handlers: { 'custom:delete': () => deleteSelection() }, header: { icon: 'link', title: t('canvas.edge') } });
    }
    return app.showMenu([
      { id: 'custom:add', label: t('canvas.addNode'), icon: 'plus' },
      { id: 'custom:paste', label: t('action.paste'), icon: 'paste', disabled: !state.clipboard },
      { separator: true },
      { id: 'custom:all', label: t('action.selectAll'), icon: 'selectAll', shortcut: 'Ctrl+A' },
      { id: 'custom:arrange', label: t('action.arrange'), icon: 'autoArrange' },
      { id: 'custom:fit', label: t('action.fit'), icon: 'fit', shortcut: 'F' },
    ], anchor, 'context', { handlers: {
      'custom:add': () => quickAdd(payload.point, null, { clientX: event.clientX, clientY: event.clientY }),
      'custom:paste': () => paste(state.clipboard, payload.point),
      'custom:all': () => { state.canvas.setSelection(state.doc.nodes.map((n) => n.id)); },
      'custom:arrange': () => arrange(),
      'custom:fit': () => state.canvas.fit(undefined, { all: true }),
    }, header: { icon: 'diagram', title: t('canvas.title') } });
  }

  /** Keys while the canvas has the focus. Returns true when handled. */
  function onKey(event) {
    if (!state.doc || !state.canvas) return false;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (!mod && (key === 'delete' || key === 'backspace')) { deleteSelection(); return true; }
    if (mod && key === 'c') return copySelection();
    if (mod && key === 'v') { paste(); return true; }
    if (mod && key === 'd') { duplicateSelection(); return true; }
    if (mod && key === 'a') { state.canvas.setSelection(state.doc.nodes.map((n) => n.id)); return true; }
    if (!mod && key === 'f') { state.canvas.fit(undefined, { all: true }); return true; }
    if (!mod && (key === '+' || key === '=')) { state.canvas.zoomAt(1.2); return true; }
    if (!mod && key === '-') { state.canvas.zoomAt(1 / 1.2); return true; }
    if (!mod && key === 'escape') { state.canvas.setSelection([]); return true; }
    if (!mod && key.startsWith('arrow') && state.canvas.selection().length) {
      const d = (event.shiftKey ? 50 : 10) * (key === 'arrowleft' || key === 'arrowup' ? -1 : 1);
      const horizontal = key === 'arrowleft' || key === 'arrowright';
      const ids = new Set(state.canvas.selection());
      change(t('op.move'), (doc2) => { for (const n of doc2.nodes) if (ids.has(n.id)) { if (horizontal) n.x += d; else n.y += d; } }, { coalesce: 'nudge' });
      state.canvas.render(state.doc);
      return true;
    }
    return false;
  }

  return {
    state, open, save, dirty, undo, redo, change,
    doc, canUndo: () => state.undo.length > 0, canRedo: () => state.redo.length > 0, undoLabel: () => state.undo.at(-1)?.label ?? '', redoLabel: () => state.redo.at(-1)?.label ?? '',
    mountCanvas, mountInspector, mountChat, bindChat, renderChat, paletteHtml, bindPalette,
    bottomTabs, bottomBody, bottomTools, renderRunPanel, bottomClick,
    addNode, deleteSelection, copySelection, paste, duplicateSelection, arrange, run, stop, deploy, loadCatalogs, loadModels, onEvent, onKey,
    fit: () => state.canvas?.fit(undefined, { all: true }), zoom: (f) => state.canvas?.zoomAt(f), selection: () => state.canvas?.selection() ?? [],
    live: () => state.live, problems: () => state.problems, history: () => state.history, catalogs: () => state.catalogs,
    refreshHook: updateHookUrl, newChat, sendChat, showRun, openHistoryRun, loadHistory,
    destroyCanvas() { state.canvas?.destroy(); state.canvas = null; host.canvas = null; },
  };
}

export { PROVIDERS, nodeBox };
