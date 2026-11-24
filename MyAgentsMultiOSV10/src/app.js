// MyAgents main window (ARCHITECTURE.md §10): the menu bar (also the title bar), the toolbar, the left panel
// (agents · node palette), the centre (the canvas editor, or the Runs / Knowledge / Models views), the right
// panel (Node inspector · Chat tester), the bottom panel (Run timeline · History · Problems · Messages ·
// Information) and the status bar. The shell (popup windows, toolbar folding into », panels with grips,
// start page of movable cards over a moving background, themes, window memory) is MyBoard's.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import APP_ICON from '../assets/icon-256.png';
import { api } from './api/client.js';
import { ANIMATIONS, loadSettings, PANEL_MIN, SESSION_KEY, STORAGE_KEY, storeSettings } from './domain/settings.js';
import { baseName, fileSafe } from './domain/paths.js';
import { switchFlag } from './flags.js';
import { getLanguage, setLanguage, t, registerTexts } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { PopupHost } from './platform/popups.js';
import { applyFont, applyTheme, customTheme, DARK_THEMES, LIGHT_THEMES, randomThemeId, resolveTheme, SYSTEM, themeName } from './themes.js';
import { escapeHtml, frameThrottle, isMac, keyLabel, pointerDrag } from './ui/dom.js';
import { AnimatedBackground } from './ui/background.js';
import { startPageHtml } from './ui/startpage.js';
import { startBoard } from './ui/startboard.js';
import { DOC_KINDS, docLabel, docWindowTitle } from './domain/helpdocs.js';
import { AGENT_TEXTS } from './i18n/agents.js';
import { createEditor } from './editor/editor.js';
import { createKnowledgeView } from './views/knowledge.js';
import { createModelsView } from './views/models.js';
import { createRunsView } from './views/runs.js';
import { PROVIDERS } from '../core/providers/index.js';
import { CATEGORIES, NODE_TYPES, label as nodeLabel } from '../core/nodes/defs.js';
import { gatherPrintContent } from './print/host.js';
import { startTour } from './ui/tutorial.js';

registerTexts(AGENT_TEXTS);

const SIDE_MIN = 140;
const TREE_MIN = 120;
const root = document.querySelector('#app');
const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const popups = new PopupHost();
const client = api();
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
const lang = () => getLanguage();

const state = {
  settings: loadSettings(globalThis.localStorage),
  core: { status: 'connecting', info: null, error: '' },
  agents: [],
  templates: [],
  providerStatus: [],
  coreSettings: null,
  view: 'editor', // editor | runs | knowledge | models
  showStart: true,
  hasDoc: false,
  agentQuery: '',
  notice: null,
  info: null,
  openMenu: null,
  lastMenuClose: { name: null, at: 0 },
  quitting: false,
  dropActive: false,
  minWidth: 0,
  maximized: false,
  bottomTab: 'run',
  log: [],
  events: 'closed',
};

const coreReady = () => state.core.status === 'ready';
const hasDoc = () => state.hasDoc && !state.showStart;
const onEditor = () => hasDoc() && state.view === 'editor';

// ───────────────────────── notices & errors

let noticeTimer = 0;
function notify(kind, text, detail = '') {
  state.notice = { kind, text, at: Date.now() };
  state.log.unshift({ kind, text, detail, at: new Date() });
  if (state.log.length > 500) state.log.length = 500;
  if (state.bottomTab === 'messages') renderBottom(); else renderBottomTabs();
  renderStatus();
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { state.notice = null; renderStatus(); }, kind === 'error' ? 12000 : 6000);
}

function formatError(error) {
  const code = error?.code;
  const key = code ? `error.code.${String(code).toLowerCase()}` : '';
  if (key && t(key) !== key) return { message: t(key), detail: error.message ?? '' };
  return { message: native.errorText(error), detail: error?.details ? JSON.stringify(error.details, null, 2) : '' };
}

function showError(titleKey, error, context = '') {
  const { message, detail } = formatError(error);
  console.error(titleKey, error);
  notify('error', `${t(titleKey)}: ${message}`, [context, detail].filter(Boolean).join('\n'));
  const info = state.info;
  return popups.open('error', {
    title: t(titleKey), message, detail: detail ?? '', context, time: new Date().toLocaleString(),
    app: info ? `${info.name} ${info.version} (${info.web ? 'web' : `${info.os}/${info.arch}`}, ${info.commit})` : `MyAgents ${VERSION}`,
  });
}

window.addEventListener('error', (event) => { if (/^ResizeObserver loop/.test(String(event.message ?? ''))) return; if (event.error || event.message) showError('error.unexpected', event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}` : ''); });
window.addEventListener('unhandledrejection', (event) => showError('error.unexpected', event.reason));

// ───────────────────────── the editor and the views

const appApi = {
  t, lang, client, popups, notify, showError,
  settings: () => state.settings,
  updateSettings: (patch) => updateSettings(patch),
  docChanged: (o = {}) => { renderTitleProject(); renderToolbarState(); renderLeftAgents(); renderTabs(); if (o.saved) persistSession(); },
  problemsChanged: () => { if (['run', 'history', 'problems'].includes(state.bottomTab)) renderBottom(); else renderBottomTabs(); renderStatus(); },
  bottomTabsChanged: () => renderBottomTabs(),
  selectionChanged: () => renderToolbarState(),
  runChanged: () => { renderToolbarState(); renderStatus(); renderBottomTabs(); },
  showRightTab: (tab) => showRightTab(tab),
  showBottomTab: (tab) => showBottomTab(tab),
  bottomHost: () => root.querySelector('#bottom-panel'),
  bottomTab: () => state.bottomTab,
  refreshAgents: () => refreshAgents(),
  setView: (v) => setView(v),
  view: () => state.view,
  renderPalette: () => renderPalette(),
  showMenu: (...a) => showMenu(...a),
  anchorAt: (x, y) => { const p = toScreen(x, y); return { x: p.x + 1, y: p.y + 1, flipY: p.y }; },
  anchorBelow: (el) => anchorBelow(el),
  copy: (text, { quiet = false } = {}) => native.clipboardWrite(text).catch(() => false).then(() => { if (!quiet) notify('success', t('notice.copiedText')); }),
  form: (params) => popups.open('form', { at: Date.now(), ...params }),
  prompt: async ({ title, value = '' }) => { const r = await popups.open('form', { at: Date.now(), title, icon: 'edit', fields: [{ name: 'value', type: 'text', label: title, value, required: true }] }); return r?.values?.value?.trim() || null; },
  ask: (params) => ask(params),
  run: (id, c) => run(id, c),
  focusInspector: () => root.querySelector('#right-panel .insp-name')?.focus(),
  runFinished: (run) => { if (run?.status === 'failed' && isOllamaProblem(run.error)) offerOllama(run.error); else showRunDone(run); },
  offerOllama: (error, model) => offerOllama(error, model),
  attention: () => { if (desktop) appWindow.requestUserAttention?.(2)?.catch?.(() => {}); },
  catalogsChanged: () => { editor.loadCatalogs(); loadCoreSummary(); },
  agents: () => state.agents,
  openRun: (agentId, runId) => openRun(agentId, runId),
  isWeb: () => !desktop,
  openUrl: (url) => native.openExternal(url),
  pickFiles: (o) => pickTextFiles(o),
};
const editor = createEditor(appApi);
const views = { knowledge: createKnowledgeView(appApi), models: createModelsView(appApi), runs: createRunsView(appApi) };

// ───────────────────────── the core and its event stream

let events = null;
async function connectCore({ quiet = false } = {}) {
  state.core = { status: 'connecting', info: state.core.info, error: '' };
  renderAll();
  try {
    let info = await client.info();
    if (info?.needsLogin) {
      for (let attempt = 0; attempt < 5 && info.needsLogin; attempt += 1) {
        const r = await popups.open('login', { error: attempt ? t('login.failed') : '' });
        if (!r) break;
        try { await client.login(r.password ?? ''); info = await client.info(); } catch { /* ask again */ }
      }
      if (info.needsLogin) { state.core = { status: 'login', info, error: '' }; renderAll(); return false; }
    }
    state.core = { status: 'ready', info, error: '' };
    const catalog = await client.catalog();
    state.templates = catalog.templates;
    await Promise.all([refreshAgents(), loadCoreSummary(), editor.loadCatalogs()]);
    const def = String(state.coreSettings?.defaultModel ?? '');
    if (def.startsWith('ollama:') && !state.ollamaOffered) { state.ollamaOffered = true; setTimeout(() => offerOllama(null, def.slice(7)), 800); }
    connectEvents();
    if (!quiet) notify('success', t('core.connected'));
  } catch (error) {
    state.core = { status: 'error', info: null, error: formatError(error).message, cause: error };
    if (!quiet) notify('error', `${t('core.unreachableTitle')}: ${state.core.error}`);
  }
  renderAll();
  return coreReady();
}

const EVENT_TYPES = ['run.started', 'run.step', 'run.edge', 'run.tool', 'run.log', 'run.notify', 'run.waiting', 'run.status', 'run.finished', 'run.loop', 'agent.created', 'agent.updated', 'agent.removed', 'kb.changed', 'kb.removed'];
async function connectEvents() {
  events?.close();
  try {
    const url = await client.eventsUrl();
    events = new EventSource(url);
    events.onopen = () => { state.events = 'open'; renderStatus(); };
    events.onerror = () => { state.events = events?.readyState === 2 ? 'closed' : 'reconnecting'; renderStatus(); };
    for (const type of EVENT_TYPES) {
      events.addEventListener(type, (e) => {
        let data = {};
        try { data = JSON.parse(e.data); } catch { return; }
        editor.onEvent(type, data);
        if (type === 'run.finished' && state.view === 'runs' && !state.showStart) views.runs.load();
        if (type.startsWith('agent.')) refreshAgentsSoon();
      });
    }
  } catch { state.events = 'closed'; }
}

let agentsTimer = null;
const refreshAgentsSoon = () => { clearTimeout(agentsTimer); agentsTimer = setTimeout(refreshAgents, 300); };
async function refreshAgents() {
  if (!coreReady()) return;
  try { state.agents = await client.agents(); } catch { /* shown by the status */ }
  renderLeftAgents();
  if (state.showStart) renderStartPage();
}

async function loadCoreSummary() {
  try {
    const [creds, settings] = await Promise.all([client.credentials(), client.settings()]);
    state.providerStatus = creds.providers;
    state.coreSettings = settings;
  } catch { /* not reachable */ }
  renderStatus();
  if (state.showStart) renderStartPage();
}

// ───────────────────────── documents (agents)

const docName = () => editor.doc()?.name ?? '';

function setDocOpen(open) {
  state.hasDoc = open;
  state.showStart = !open;
  if (open) state.view = 'editor';
  renderAll();
}

async function confirmDiscard() {
  if (!state.hasDoc || !editor.dirty()) return true;
  const choice = await ask({ icon: 'save', title: t('confirm.unsavedTitle'), message: t('confirm.unsavedText', { name: docName() }), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), danger: true }, { id: 'save', label: t('action.save'), icon: 'save', primary: true }] });
  if (choice === 'save') { try { await editor.save(); return true; } catch (error) { showError('error.save', error); return false; } }
  return choice === 'discard';
}

async function openAgent(id, { quiet = false } = {}) {
  if (!coreReady()) { notify('warning', t('core.notReady')); return null; }
  if (editor.doc()?.id === id && state.hasDoc) { state.showStart = false; state.view = 'editor'; renderAll(); return editor.doc(); }
  if (!(await confirmDiscard())) return null;
  try {
    const agent = await client.agent(id);
    editor.open(agent);
    setDocOpen(true);
    persistSession();
    rememberOpened(agent.id);
    if (!quiet) notify('success', t('notice.opened', { name: agent.name }));
    editor.refreshHook();
    return agent;
  } catch (error) { showError('error.open', error); return null; }
}

/** A new document in the editor: blank, from a template, or a built draft — stored at once. */
async function openNew(doc) {
  if (!(await confirmDiscard())) return;
  try {
    const agent = await client.createAgent(doc);
    editor.open(agent);
    setDocOpen(true);
    rememberOpened(agent.id);
    await refreshAgents();
    persistSession();
    editor.refreshHook();
    notify('success', t('notice.created', { name: agent.name }));
  } catch (error) { showError('error.create', error); }
}

async function newAgent() {
  await openNew({ name: t('agent.newName'), nodes: [{ id: 'n1', type: 'trigger.manual', name: t('node.manual'), x: 120, y: 160, config: {} }], edges: [] });
}

async function fromTemplate(id) {
  try { await openNew(await client.template(id, lang())); } catch (error) { showError('error.create', error); }
}

async function describeAgent() {
  if (!coreReady()) return;
  const ready = (id) => state.providerStatus.find((x) => x.id === id)?.ready;
  const res = await popups.open('form', {
    at: Date.now(), title: t('describe.title'), icon: 'wand', submitLabel: t('describe.build'), intro: t('describe.intro'),
    fields: [
      { name: 'description', type: 'textarea', label: t('describe.label'), required: true, value: '', placeholder: t('describe.placeholder') },
      { name: 'model', type: 'select', label: t('describe.model'), value: '', options: [{ value: '', label: t('describe.modelDefault', { model: state.coreSettings?.defaultModel ?? '' }) }, { value: 'mock:mock-1', label: t('describe.keywords') }, ...PROVIDERS.filter((p) => p.id !== 'mock' && ready(p.id)).map((p) => ({ value: `${p.id}:${p.defaultModel}`, label: `${p.label} · ${p.defaultModel}` }))] },
    ],
  });
  if (!res?.values?.description) return;
  try {
    const out = await withProgress('progress.building', '', () => client.build(res.values.description, lang(), res.values.model || undefined));
    await openNew(out.agent);
    notify(out.via === 'model' ? 'success' : 'info', t(out.via === 'model' ? 'describe.byModel' : 'describe.byKeywords') + (out.note ? ` (${out.note})` : ''));
  } catch (error) { showError('error.create', error); }
}

async function closeAgent() {
  if (!(await confirmDiscard())) return;
  editor.destroyCanvas();
  editor.open({ name: '', nodes: [], edges: [] });
  setDocOpen(false);
  persistSession();
}

/** Start page › History: the agent just opened goes first. */
function rememberOpened(id) {
  if (!id) return;
  updateSettings({ recentOpened: [id, ...(state.settings.recentOpened ?? []).filter((x) => x !== id)].slice(0, 20) }, { quiet: true });
}

function forgetOpened(ids) {
  const drop = new Set(ids);
  updateSettings({ recentOpened: (state.settings.recentOpened ?? []).filter((x) => !drop.has(x)) }, { quiet: true });
}

async function clearHistory() {
  if (!(state.settings.recentOpened ?? []).length) return;
  if (state.settings.confirmDelete) {
    const choice = await ask({ icon: 'trash', title: t('confirm.clearHistoryTitle'), message: t('confirm.clearHistoryText'), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'delete', label: t('start.clearAll'), icon: 'trash', danger: true, primary: true }] });
    if (choice !== 'delete') return;
  }
  updateSettings({ recentOpened: [] }, { quiet: true });
  notify('success', t('notice.historyCleared'));
  renderStartPage();
}

/** Start page › My agents › Delete all: every stored agent (run records stay). */
async function deleteAllAgents() {
  const all = [...(state.agents ?? [])];
  if (!all.length) return;
  const choice = await ask({ icon: 'trash', title: t('confirm.deleteAllTitle'), message: t('confirm.deleteAllText', { n: all.length }), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'delete', label: t('start.deleteAll'), icon: 'trash', danger: true, primary: true }] });
  if (choice !== 'delete') return;
  let failed = 0;
  for (const a of all) { try { await client.deleteAgent(a.id); } catch { failed += 1; } }
  if (state.hasDoc && all.some((a) => a.id === editor.doc()?.id)) { editor.destroyCanvas(); editor.open({ name: '', nodes: [], edges: [] }); setDocOpen(false); persistSession(); }
  forgetOpened(all.map((a) => a.id));
  await refreshAgents();
  if (failed) notify('error', t('notice.deleteAllFailed', { n: failed })); else notify('success', t('notice.deletedAll', { n: all.length }));
}

async function deleteAgent(id = editor.doc()?.id) {
  const a = state.agents.find((x) => x.id === id);
  if (!a) return;
  if (state.settings.confirmDelete) {
    const choice = await ask({ icon: 'trash', title: t('confirm.deleteAgentTitle'), message: t('confirm.deleteAgentText', { name: a.name }), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'delete', label: t('action.delete'), icon: 'trash', danger: true, primary: true }] });
    if (choice !== 'delete') return;
  }
  try {
    await client.deleteAgent(id);
    forgetOpened([id]);
    if (editor.doc()?.id === id) { editor.destroyCanvas(); editor.open({ name: '', nodes: [], edges: [] }); setDocOpen(false); }
    notify('success', t('notice.deleted', { name: a.name }));
    await refreshAgents();
  } catch (error) { showError('error.delete', error); }
}

async function duplicateAgent(id = editor.doc()?.id) {
  try { const out = await client.duplicateAgent(id); await refreshAgents(); await openAgent(out.id); } catch (error) { showError('error.create', error); }
}

async function renameAgent(id = editor.doc()?.id) {
  const current = state.hasDoc && (editor.doc()?.id === id || !id);
  const a = current ? editor.doc() : state.agents.find((x) => x.id === id);
  const name = await appApi.prompt({ title: t('op.rename'), value: a?.name ?? '' });
  if (!name) return;
  if (current) { editor.change(t('op.rename'), (d) => { d.name = name; }); editor.state.inspector?.render(); return; }
  await client.patchAgent(id, { name });
  refreshAgents();
}

async function exportAgent() {
  const d = editor.doc();
  if (!d) return;
  try {
    if (editor.dirty() || !d.id) await editor.save({ quiet: true });
    const text = await client.exportAgent(d.id);
    const name = `${fileSafe(d.name) || 'agent'}.myagent`;
    if (desktop) {
      const path = await native.chooseSavePath(name, ['myagent']);
      if (!path) return;
      await native.writeTextFile(path, text, '');
      notify('success', t('notice.exported', { name: baseName(path) }));
    } else {
      await native.saveFileWeb(text, { name, saveAs: true });
      notify('success', t('notice.exported', { name }));
    }
  } catch (error) { showError('error.export', error); }
}

async function importAgent() {
  try {
    let files = [];
    if (desktop) {
      const paths = await native.chooseFiles(state.settings.lastDirectory, [{ name: 'MyAgents agent (*.myagent)', extensions: ['myagent', 'json'] }], true);
      for (const p of paths) files.push({ name: baseName(p), text: await native.readTextFile(p, '') });
    } else files = await pickTextFiles({ accept: '.myagent,.json', multiple: true });
    for (const f of files) await importText(f.name, f.text);
  } catch (error) { showError('error.import', error); }
}

async function importText(name, text) {
  try {
    const out = await client.importAgent(JSON.parse(text));
    await refreshAgents();
    notify('success', t('notice.imported', { name: out.name }));
    await openAgent(out.id, { quiet: true });
  } catch (error) { showError('error.import', error, name); }
}

async function pickTextFiles({ accept = '', multiple = true } = {}) {
  const files = await native.pickWithInput(accept, multiple);
  return Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
}

async function save() {
  try { await editor.save(); } catch (error) {
    if (error.code === 'REV_CONFLICT') {
      const choice = await ask({ icon: 'warning', title: t('confirm.conflictTitle'), message: t('confirm.conflictText'), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'overwrite', label: t('confirm.overwrite'), danger: true, primary: true }] });
      if (choice === 'overwrite') { editor.state.rev = error.details?.current?.rev ?? null; try { await editor.save(); } catch (e) { showError('error.save', e); } }
      return;
    }
    showError('error.save', error);
  }
}

async function openRun(agentId, runId) {
  if (agentId && agentId !== 'draft' && agentId !== editor.doc()?.id) { const ok = await openAgent(agentId, { quiet: true }); if (!ok) return; }
  if (!state.hasDoc) return;
  setView('editor');
  editor.openHistoryRun(runId);
}

function persistSession() {
  try { globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify({ agent: state.hasDoc ? editor.doc()?.id ?? null : null })); } catch { /* private mode */ }
}
async function restoreSession() {
  if (!state.settings.restoreSession || !coreReady() || state.settings.showStartPage) return;
  let s = null;
  try { s = JSON.parse(globalThis.localStorage?.getItem(SESSION_KEY) ?? 'null'); } catch { s = null; }
  if (s?.agent && state.agents.some((a) => a.id === s.agent)) await openAgent(s.agent, { quiet: true });
}

// ───────────────────────── commands

const toggle = (key) => updateSettings({ [key]: !state.settings[key] });
const viewCommand = (view, glyph) => ({ icon: glyph, label: `view.${view}`, enabled: () => coreReady() && (view !== 'editor' || state.hasDoc), checked: () => !state.showStart && state.view === view, run: () => setView(view) });
const docOpen = () => hasDoc();
const runActive = () => ['running', 'waiting'].includes(editor.live()?.status);

const commands = {
  newAgent: { icon: 'fileNew', label: 'action.newAgent', key: 'Ctrl+N', enabled: coreReady, run: () => newAgent() },
  describe: { icon: 'wand', label: 'action.describe', key: 'Ctrl+Shift+N', enabled: coreReady, run: () => describeAgent() },
  newFromTemplate: { icon: 'template', label: 'action.newFromTemplate', enabled: coreReady, run: (c) => templateMenu(c?.anchor) },
  open: { icon: 'folderOpen', label: 'action.open', key: 'Ctrl+O', enabled: coreReady, run: (c) => openMenu(c?.anchor) },
  save: { icon: 'save', label: 'action.save', key: 'Ctrl+S', enabled: () => docOpen() && (editor.dirty() || !editor.doc()?.id), run: () => save() },
  duplicateAgent: { icon: 'saveAs', label: 'action.duplicateAgent', enabled: () => docOpen() && Boolean(editor.doc()?.id), run: () => duplicateAgent() },
  renameAgent: { icon: 'text', label: 'action.renameAgent', key: 'F2', enabled: docOpen, run: () => renameAgent() },
  import: { icon: 'importFile', label: 'action.import', key: 'Ctrl+I', enabled: coreReady, run: () => importAgent() },
  print: { icon: 'print', label: 'action.print', key: 'Ctrl+P', enabled: docOpen, run: () => popups.open('print', { at: Date.now() }) },
  exportAgent: { icon: 'exportFile', label: 'action.export', key: 'Ctrl+E', enabled: docOpen, run: () => exportAgent() },
  closeAgent: { icon: 'closeTab', label: 'action.closeAgent', key: 'Ctrl+W', enabled: () => state.hasDoc, run: () => closeAgent() },
  deleteAgent: { icon: 'trash', label: 'action.deleteAgent', enabled: () => docOpen() && Boolean(editor.doc()?.id), run: () => deleteAgent() },
  startPage: { icon: 'home', label: 'action.startPage', key: 'Ctrl+Shift+H', checked: () => state.showStart, run: () => showStartPage(!state.showStart) },
  reconnect: { icon: 'refresh', label: 'action.reconnect', run: () => connectCore() },
  logout: { icon: 'user', label: 'action.logout', enabled: () => !desktop && state.core.info?.mode === 'web', run: async () => { await client.logout().catch(() => {}); await connectCore(); } },
  exit: { icon: 'exit', label: 'action.exit', key: isMac ? 'Ctrl+Q' : 'Alt+F4', run: () => requestExit() },
  undo: { icon: 'undo', label: 'action.undo', key: 'Ctrl+Z', enabled: () => onEditor() && editor.canUndo(), run: () => { const l = editor.undo(); if (l) notify('info', t('notice.undone', { label: l })); renderToolbarState(); } },
  redo: { icon: 'redo', label: 'action.redo', key: 'Ctrl+Y', enabled: () => onEditor() && editor.canRedo(), run: () => { const l = editor.redo(); if (l) notify('info', t('notice.redone', { label: l })); renderToolbarState(); } },
  addNode: { icon: 'plus', label: 'action.addNode', key: 'A', enabled: onEditor, run: (c) => nodeMenu(c?.anchor) },
  deleteSelection: { icon: 'trash', label: 'action.deleteSelection', key: 'Del', enabled: () => onEditor() && editor.selection().length > 0, run: () => editor.deleteSelection() },
  duplicate: { icon: 'duplicate', label: 'action.duplicate', key: 'Ctrl+D', enabled: () => onEditor() && editor.selection().length > 0, run: () => editor.duplicateSelection() },
  arrange: { icon: 'autoArrange', label: 'action.arrange', key: 'Ctrl+Shift+A', enabled: onEditor, run: () => editor.arrange() },
  fit: { icon: 'fit', label: 'action.fit', key: 'F', enabled: onEditor, run: () => editor.fit() },
  zoomIn: { icon: 'zoomIn', label: 'action.zoomIn', key: '+', enabled: onEditor, run: () => editor.zoom(1.2) },
  zoomOut: { icon: 'zoomOut', label: 'action.zoomOut', key: '-', enabled: onEditor, run: () => editor.zoom(1 / 1.2) },
  runAgent: { icon: 'play', label: 'action.run', key: 'Ctrl+Enter', enabled: () => docOpen() && coreReady() && !runActive(), run: () => { setView('editor'); return editor.run(); } },
  stopRun: { icon: 'stop', label: 'action.stop', key: 'Shift+F5', enabled: runActive, run: () => editor.stop() },
  chat: { icon: 'chat', label: 'action.chat', key: 'Ctrl+Shift+C', enabled: docOpen, checked: () => state.settings.showRightPanel && state.settings.rightTab === 'chat' && docOpen(), run: () => showRightTab(state.settings.rightTab === 'chat' && state.settings.showRightPanel ? 'node' : 'chat') },
  deploy: { icon: 'deploy', label: 'action.deploy', enabled: () => docOpen() && coreReady(), checked: () => docOpen() && Boolean(editor.doc()?.deployed), run: () => editor.deploy(!editor.doc()?.deployed) },
  'view:editor': viewCommand('editor', 'diagram'),
  'view:runs': viewCommand('runs', 'timeline'),
  'view:knowledge': viewCommand('knowledge', 'book'),
  'view:models': viewCommand('models', 'key'),
  leftPanel: { icon: 'panelLeft', label: 'action.leftPanel', key: 'Ctrl+Shift+1', checked: () => state.settings.showLeftPanel, run: () => toggle('showLeftPanel') },
  rightPanel: { icon: 'panelRight', label: 'action.rightPanel', key: 'Ctrl+Shift+2', checked: () => state.settings.showRightPanel, run: () => toggle('showRightPanel') },
  bottomPanel: { icon: 'panelBottom', label: 'action.bottomPanel', key: 'Ctrl+J', checked: () => state.settings.showBottomPanel, run: () => toggle('showBottomPanel') },
  statusBar: { icon: 'statusBar', label: 'action.statusBar', checked: () => state.settings.showStatusBar, run: () => toggle('showStatusBar') },
  minimap: { icon: 'minimap', label: 'action.minimap', checked: () => state.settings.showMinimap, run: () => toggle('showMinimap') },
  snap: { icon: 'snap', label: 'action.snap', checked: () => state.settings.snapToGrid, run: () => toggle('snapToGrid') },
  animateRuns: { icon: 'activity', label: 'action.animateRuns', checked: () => state.settings.animateRuns, run: () => toggle('animateRuns') },
  followRuns: { icon: 'eye', label: 'action.followRuns', checked: () => state.settings.followRuns, run: () => toggle('followRuns') },
  showProblems: { icon: 'warning', label: 'action.showProblems', run: () => showBottomTab('problems') },
  showRun: { icon: 'timeline', label: 'action.showRun', run: () => showBottomTab('run') },
  showMessages: { icon: 'info', label: 'action.showMessages', run: () => showBottomTab('messages') },
  clearMessages: { icon: 'clearHistory', label: 'action.clearMessages', enabled: () => state.log.length > 0, run: () => { state.log = []; renderBottom(); } },
  copyMessages: { icon: 'copy', label: 'action.copyMessages', enabled: () => state.log.length > 0, run: () => appApi.copy(state.log.map((e) => `${e.at.toLocaleTimeString()} [${e.kind}] ${e.text}`).join('\n')) },
  theme: { icon: 'palette', label: 'action.themeRandom', run: () => updateSettings({ theme: randomThemeId(state.settings.theme) }) },
  themeMenu: { icon: 'chevronDown', label: 'action.themeChoose', run: (c) => openThemePicker(c?.anchor) },
  language: { icon: 'globe', label: 'action.language', key: 'Ctrl+Shift+L', run: () => updateSettings({ language: getLanguage() === 'ko' ? 'en' : 'ko' }) },
  shuffleBackground: { icon: 'dice', label: 'action.shuffleBackground', key: 'Ctrl+Shift+B', run: () => shuffleBackground() },
  backgroundImage: { icon: 'imageBg', label: 'action.backgroundImage', run: () => chooseBackground() },
  clearBackground: { icon: 'imageClear', label: 'action.clearBackground', enabled: () => Boolean(state.settings.backgroundImage) || state.settings.backgroundKind !== 'none', run: () => removeBackground() },
  refresh: { icon: 'refresh', label: 'action.refresh', key: 'F5', run: () => (coreReady() ? (refreshAgents(), editor.loadCatalogs(), loadCoreSummary(), views[state.view]?.load?.()) : connectCore()) },
  welcome: { icon: 'bulb', label: 'action.welcome', run: () => openWelcome() },
  tutorial: { icon: 'graduation', label: 'action.tutorial', enabled: () => coreReady(), run: () => runTutorial() },
  userGuide: { icon: 'userGuide', label: 'action.userGuide', run: () => openDocWindow('guide') },
  shortcuts: { icon: 'keyboard', label: 'action.shortcuts', run: () => popups.open('settings', { tab: 'shortcuts' }) },
  settings: { icon: 'gear', label: 'action.settings', key: 'Ctrl+,', run: () => popups.open('settings', { tab: 'general' }) },
  about: { icon: 'info', label: 'action.about', key: 'F1', run: () => popups.open('about') },
};

function commandEnabled(id) { const c = commands[id]; return Boolean(c) && (c.enabled ? Boolean(c.enabled()) : true); }
function commandTip(id) {
  const c = commands[id];
  if (!c) return id;
  const tip = t(`tip.${id.replace(':', '.')}`, null, '');
  return `${t(c.label)}${c.key ? ` (${keyLabel(c.key)})` : ''}${tip ? ` — ${tip}` : ''}`;
}
async function run(id, context) {
  const c = commands[id];
  if (!c || !commandEnabled(id)) return undefined;
  try { return await c.run(context); } catch (error) { return showError('error.command', error, t(c.label)); }
}

// ───────────────────────── menus

const SUBMENUS = {
  newFrom: { icon: 'fileNew', items: ['newAgent', 'describe', 'newFromTemplate'] },
  views: { icon: 'diagram', items: ['view:editor', 'view:runs', 'view:knowledge', 'view:models'] },
  show: { icon: 'eye', items: ['leftPanel', 'rightPanel', 'bottomPanel', 'statusBar', '-', 'minimap', 'snap', 'animateRuns', 'followRuns', '-', 'showRun', 'showProblems', 'showMessages'] },
  appearance: { icon: 'palette', items: ['theme', 'themeMenu', 'language', '-', 'shuffleBackground', 'backgroundImage', 'clearBackground'] },
};
const sub = (key) => ({ sub: key });
const MENUS = {
  file: [sub('newFrom'), 'open', 'save', 'duplicateAgent', 'renameAgent', '-', 'import', 'exportAgent', '-', 'print', '-', 'startPage', '-', 'closeAgent', 'deleteAgent', '-', 'reconnect', 'logout', 'exit'],
  edit: ['undo', 'redo', '-', 'addNode', 'duplicate', 'deleteSelection', '-', 'arrange', 'fit', 'zoomIn', 'zoomOut'],
  run: ['runAgent', 'stopRun', 'chat', '-', 'deploy', '-', 'view:runs'],
  view: [sub('views'), 'refresh', '-', sub('show'), '-', sub('appearance')],
  help: ['tutorial', 'welcome', 'userGuide', 'shortcuts', '-', 'settings', 'about'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', run: 'play', view: 'eye', help: 'question' };

const TOOLBAR = [
  ['newAgent', 'describe', 'open', 'save', 'import', 'exportAgent', 'print'],
  ['undo', 'redo'],
  ['addNode', 'arrange', 'fit'],
  ['runAgent', 'stopRun', 'chat', 'deploy'],
  ['view:editor', 'view:runs', 'view:knowledge', 'view:models'],
  ['leftPanel', 'bottomPanel', 'rightPanel'],
];
const TOOLBAR_RIGHT = ['themeSplit', 'language', 'settings', 'about'];
const LABELED = new Set(['newAgent', 'describe', 'runAgent', 'chat', 'deploy']);
const TOOLBAR_MAIN = { themeSplit: 'theme' };

const screenOffset = { x: 0, y: 0, measured: false };
function estimateOffset() {
  if (screenOffset.measured) return;
  const border = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
  screenOffset.x = window.screenX + border;
  screenOffset.y = window.screenY + Math.max(0, window.outerHeight - window.innerHeight - border);
}
window.addEventListener('pointermove', (event) => { if (!event.isTrusted) return; screenOffset.x = event.screenX - event.clientX; screenOffset.y = event.screenY - event.clientY; screenOffset.measured = true; }, { passive: true });
function toScreen(x, y) { if (popups.useFrames) return { x: window.screenX + x, y: window.screenY + y }; estimateOffset(); return { x: screenOffset.x + x, y: screenOffset.y + y }; }
function anchorBelow(element) { const rect = element.getBoundingClientRect(); const point = toScreen(rect.left, rect.bottom + 2); return { ...point, flipY: toScreen(rect.left, rect.top - 2).y }; }
const anchorFor = (command) => anchorBelow(root.querySelector(`[data-command="${command}"]`) ?? root.querySelector('#toolbar'));

function menuItems(ids) {
  return ids.map((id) => (id === '-' ? { separator: true } : typeof id === 'object' ? {
    id: `submenu:${id.sub}`, label: t(`submenu.${id.sub}`), icon: SUBMENUS[id.sub].icon, submenu: true,
    disabled: !SUBMENUS[id.sub].items.some((item) => item !== '-' && commandEnabled(item)),
  } : { id, label: t(commands[id].label), icon: commands[id].icon, shortcut: commands[id].key ? keyLabel(commands[id].key) : '', disabled: !commandEnabled(id), checked: commands[id].checked?.() }));
}

function withChildren(items, depth = 0) {
  return items.map((item) => {
    if (!item.submenu || depth > 3) return item;
    if (item.children) return { ...item, children: withChildren(item.children, depth + 1) };
    const key = item.id.slice('submenu:'.length);
    return SUBMENUS[key] ? { ...item, children: withChildren(menuItems(SUBMENUS[key].items), depth + 1) } : item;
  });
}

async function showMenu(items, anchor, name = 'context', context = {}) {
  state.openMenu = name;
  renderMenubar();
  const header = context.header ?? (MENUS[name] ? { icon: MENU_ICONS[name], title: t(`menu.${name}`) } : { icon: 'robot', title: 'MyAgents' });
  const result = await popups.open('menu', { items: withChildren(items), name, header }, { anchor });
  if (state.openMenu === name) { state.openMenu = null; state.lastMenuClose = { name, at: Date.now() }; renderMenubar(); }
  const id = result?.id;
  if (!id || id.startsWith('submenu:')) return undefined;
  if (id.startsWith('custom:')) return context.handlers?.[id]?.();
  return run(id, context);
}
function openMenubarMenu(name) { const el = root.querySelector(`[data-menu="${name}"]`); if (el) showMenu(menuItems(MENUS[name]), anchorBelow(el), name); }

function openMenu(anchor) {
  const handlers = {};
  const items = state.agents.map((a) => { handlers[`custom:open:${a.id}`] = () => openAgent(a.id); return { id: `custom:open:${a.id}`, label: a.name, icon: a.deployed ? 'deploy' : 'robot' }; });
  if (!items.length) items.push({ id: 'custom:none', label: t('start.noAgents'), icon: 'info', disabled: true });
  items.push({ separator: true }, ...menuItems(['newAgent', 'describe', 'import']));
  return showMenu(items, anchor ?? anchorFor('open'), 'context', { handlers, header: { icon: 'folderOpen', title: t('action.open') } });
}

function templateMenu(anchor) {
  const handlers = {};
  const group = (g) => state.templates.filter((x) => x.group === g).map((x) => { handlers[`custom:tpl:${x.id}`] = () => fromTemplate(x.id); return { id: `custom:tpl:${x.id}`, label: x.title[lang()] ?? x.title.en, icon: x.icon }; });
  return showMenu([
    { id: 'submenu:tpl-pipeline', label: t('start.pipelineTemplates'), icon: 'timeline', submenu: true, children: group('pipeline') },
    { id: 'submenu:tpl-dev', label: t('start.devTemplates'), icon: 'code', submenu: true, children: group('dev') },
    { id: 'submenu:tpl-office', label: t('start.officeTemplates'), icon: 'notes', submenu: true, children: group('office') },
  ], anchor ?? anchorFor('newAgent'), 'context', { handlers, header: { icon: 'template', title: t('action.newFromTemplate') } });
}

function nodeMenu(anchor) {
  const handlers = {};
  const items = CATEGORIES.map((c) => ({
    id: `submenu:add-${c.id}`, label: nodeLabel(c.label, lang()), icon: c.icon, submenu: true,
    children: NODE_TYPES.filter((d) => d.category === c.id).map((d) => { handlers[`custom:add:${d.type}`] = () => editor.addNode(d.type); return { id: `custom:add:${d.type}`, label: nodeLabel(d.label, lang()), icon: d.icon }; }),
  }));
  return showMenu(items, anchor ?? anchorFor('addNode'), 'context', { handlers, header: { icon: 'plus', title: t('action.addNode') } });
}

function contextMenu(event, kind, payload = {}) {
  const point = toScreen(event.clientX, event.clientY);
  const anchor = { x: point.x + 1, y: point.y + 1, flipY: point.y };
  if (kind === 'agent') {
    const a = state.agents.find((x) => x.id === payload.id);
    const handlers = {
      'custom:open': () => openAgent(payload.id), 'custom:rename': () => renameAgent(payload.id), 'custom:duplicate': () => duplicateAgent(payload.id),
      'custom:run': async () => { if (await openAgent(payload.id, { quiet: true })) editor.run(); }, 'custom:delete': () => deleteAgent(payload.id),
    };
    return showMenu([
      { id: 'custom:open', label: t('action.openAgent'), icon: 'folderOpen' }, { id: 'custom:run', label: t('action.run'), icon: 'play' },
      { separator: true }, { id: 'custom:rename', label: t('op.rename'), icon: 'text' }, { id: 'custom:duplicate', label: t('action.duplicateAgent'), icon: 'saveAs' },
      { separator: true }, { id: 'custom:delete', label: t('action.deleteAgent'), icon: 'trash', danger: true },
    ], anchor, 'context', { handlers, header: { icon: 'robot', title: a?.name ?? '' } });
  }
  if (kind === 'bottom') return showMenu(menuItems(['showRun', 'showProblems', 'showMessages', '-', 'copyMessages', 'clearMessages', '-', 'bottomPanel']), anchor, 'context', { header: { icon: 'panelBottom', title: t('bottom.title') } });
  if (kind === 'panel') return showMenu(menuItems(['leftPanel', 'rightPanel', 'bottomPanel', 'statusBar', '-', 'settings']), anchor, 'context', { header: { icon: 'panelLeft', title: t('menu.view') } });
  if (kind === 'start') return showMenu(menuItems(['newAgent', 'describe', 'open', 'import', '-', 'view:models', '-', 'shuffleBackground', 'backgroundImage', '-', 'about']), anchor, 'context', { header: { icon: 'home', title: t('action.startPage') } });
  if (kind === 'status') return showMenu(menuItems(['statusBar', 'reconnect', '-', 'theme', 'language']), anchor, 'context', { header: { icon: 'statusBar', title: t('action.statusBar') } });
  return showMenu(menuItems(['newAgent', 'open', '-', 'runAgent', 'chat', '-', 'leftPanel', 'rightPanel', 'statusBar', '-', 'settings', 'about']), anchor, 'context', { header: { icon: 'robot', title: 'MyAgents' } });
}

function textContextMenu(element, event) {
  const point = toScreen(event.clientX, event.clientY);
  const anchor = { x: point.x + 1, y: point.y + 1, flipY: point.y };
  const handlers = {
    'custom:cut': () => { element.focus(); document.execCommand('cut'); },
    'custom:copy': () => { element.focus(); document.execCommand('copy'); },
    'custom:paste': async () => { element.focus(); const text = await native.clipboardRead().catch(() => ''); document.execCommand('insertText', false, text ?? ''); },
    'custom:selectAll': () => { element.focus(); element.select?.(); },
  };
  const hasSel = element.selectionStart !== element.selectionEnd;
  return showMenu([
    { id: 'custom:cut', label: t('action.cut'), icon: 'cut', disabled: !hasSel }, { id: 'custom:copy', label: t('action.copy'), icon: 'copy', disabled: !hasSel },
    { id: 'custom:paste', label: t('action.paste'), icon: 'paste' }, { separator: true }, { id: 'custom:selectAll', label: t('action.selectText'), icon: 'selectAll' },
  ], anchor, 'context', { handlers, header: { icon: 'edit', title: t('menu.edit') } });
}

// ───────────────────────── shell

/** A folded side panel: the unfold button (the toolbar's panel icon), the panel's icon and its title written down the rail. */
function panelRail(command, toggleIcon, glyph, title) {
  return `<button type="button" class="panel-rail" data-command="${command}" title="${escapeHtml(t('panel.expand', { name: title }))}" aria-label="${escapeHtml(t('panel.expand', { name: title }))}">${icon(toggleIcon, 'icon rail-toggle')}${icon(glyph, 'icon rail-icon')}<span class="rail-title">${escapeHtml(title)}</span></button>`;
}

function renderShell() {
  editor.destroyCanvas();
  root.innerHTML = `
    <div class="app-bg" aria-hidden="true"><canvas class="anim-bg"></canvas><div class="image-bg"></div></div>
    <nav id="menubar" role="menubar"></nav>
    <div id="toolbar" role="toolbar"></div>
    <main id="shell">
      <aside id="left-panel" class="side-panel" aria-label="${escapeHtml(t('panel.agents'))}">${panelRail('leftPanel', 'panelLeft', 'robot', t('panel.leftRail'))}<div class="left-tree" id="agents-panel"></div><div class="left-split" title="${escapeHtml(t('panel.splitTip'))}"></div><div class="left-view" id="palette-panel"></div></aside>
      <div class="splitter vertical panel-split" data-split="left" role="separator" aria-orientation="vertical"></div>
      <section id="center">
        <div id="tabs"></div>
        <div id="center-body">
          <div id="workspace" class="workspace" tabindex="-1"></div>
          <div id="start-page" hidden></div>
          <div class="drop-overlay" aria-hidden="true"><div>${icon('drop')}<span>${escapeHtml(t('drop.hint'))}</span></div></div>
        </div>
        <div class="splitter horizontal bottom-split" data-split="bottom" role="separator" aria-orientation="horizontal"></div>
        <section id="bottom-panel" aria-label="${escapeHtml(t('bottom.title'))}"></section>
      </section>
      <div class="splitter vertical panel-split" data-split="right" role="separator" aria-orientation="vertical"></div>
      <aside id="right-panel" class="side-panel" aria-label="${escapeHtml(t('panel.right'))}">${panelRail('rightPanel', 'panelRight', 'edit', t('panel.rightRail'))}<div class="right-tabs"></div><div class="right-body" id="inspector-host"></div><div class="right-body" id="chat-host" hidden></div></aside>
    </main>
    <footer id="statusbar" role="status"></footer>
    ${desktop ? `<div class="resize-grip" data-resize-grip title="${escapeHtml(t('tip.resize'))}" role="separator">${icon('grip')}</div>` : `<div class="resize-grip static" aria-hidden="true">${icon('grip')}</div>`}`;
  editor.bindPalette(root.querySelector('#palette-panel'));
  editor.mountInspector(root.querySelector('#inspector-host'));
  editor.bindChat(root.querySelector('#chat-host'));
  editor.mountChat(root.querySelector('#chat-host'));
  bindShellEvents();
}

function renderMenubar() {
  const menubar = root.querySelector('#menubar');
  const home = `<button class="menubar-item menubar-home ${state.showStart ? 'current' : ''}" data-home title="${escapeHtml(t('tip.home'))}" aria-pressed="${state.showStart}">${icon('home')}<span>${escapeHtml(t('menu.home'))}</span></button><span class="menubar-sep" aria-hidden="true"></span>`;
  const brand = `<div class="app-brand" data-window-drag title="${escapeHtml(`MyAgents v${VERSION}`)}"><img class="app-brand-icon" src="${APP_ICON}" alt="" data-window-drag /><span class="app-brand-name" data-window-drag>MyAgents</span><span class="app-brand-version" data-window-drag>v${escapeHtml(VERSION)}</span></div>`;
  const button = (id, glyph, key) => `<button class="window-button ${id === 'close' ? 'close' : ''}" data-window="${id}" title="${escapeHtml(t(key))}" aria-label="${escapeHtml(t(key))}">${icon(glyph)}</button>`;
  const controls = desktop ? `<div class="window-controls">${button('minimize', 'winMinimize', 'window.minimize')}${state.maximized ? button('maximize', 'winRestore', 'window.restore') : button('maximize', 'winMaximize', 'window.maximize')}${button('close', 'winClose', 'window.close')}</div>` : '';
  const projectName = '<span class="menubar-project" data-window-drag><span class="app-brand-project-name" data-window-drag></span><span class="app-brand-dirty" data-window-drag>●</span></span>';
  menubar.innerHTML = brand + home + Object.keys(MENUS).map((name) => `<button class="menubar-item ${state.openMenu === name ? 'open' : ''}" data-menu="${name}" role="menuitem" aria-haspopup="true">${icon(MENU_ICONS[name])}<span>${escapeHtml(t(`menu.${name}`))}</span></button>`).join('') + projectName + `<div class="menubar-drag" data-window-drag></div>${controls}`;
  renderTitleProject();
}

function renderTitleProject() {
  const box = root.querySelector('.menubar-project');
  if (!box) return;
  const show = hasDoc();
  box.classList.toggle('empty', !show);
  box.classList.toggle('dirty', show && editor.dirty());
  box.querySelector('.app-brand-project-name').textContent = show ? docName() : '';
  box.title = show ? docName() : '';
  document.title = show ? `${docName()}${editor.dirty() ? ' ●' : ''} — MyAgents` : `MyAgents v${VERSION}`;
}

function windowButton(id) {
  if (!desktop) return;
  if (id === 'minimize') appWindow.minimize().catch(() => {});
  else if (id === 'maximize') appWindow.toggleMaximize().catch(() => {});
  else if (id === 'close') requestExit();
}

async function trackMaximized() {
  if (!desktop) return;
  const update = async () => {
    const maximized = await appWindow.isMaximized().catch(() => false);
    if (maximized !== state.maximized) { state.maximized = maximized; renderMenubar(); }
  };
  await update();
  appWindow.onResized(() => update()).catch(() => {});
  const mark = (key) => { try { globalThis.localStorage?.setItem(key, String(Date.now())); } catch { /* private mode */ } };
  for (const type of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(type, () => mark('myagents.main.input'), { capture: true, passive: true });
  window.addEventListener('focus', () => mark('myagents.main.focus'));
}

let toolbarLanguage = null;
function renderToolbar() {
  const toolbar = root.querySelector('#toolbar');
  toolbarLanguage = getLanguage();
  const plain = (id) => {
    const c = commands[id];
    const glyph = id === 'language' ? switchFlag(getLanguage()) : icon(c.icon);
    const labeled = LABELED.has(id);
    return `<button class="tool-button ${labeled ? 'tool-labeled' : ''} ${id === 'runAgent' ? 'tool-run' : ''}" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(c.label))}">${glyph}${labeled ? `<span>${escapeHtml(t(c.label))}</span>` : ''}</button>`;
  };
  const split = (main, arrow, label) => `<span class="split-button">${plain(main)}<button class="tool-button split-arrow" data-command="${arrow}" title="${escapeHtml(commandTip(arrow))}" aria-label="${escapeHtml(t(label))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
  const button = (id) => (id === 'themeSplit' ? split('theme', 'themeMenu', 'action.themeChoose') : plain(id));
  toolbar.innerHTML = `<div class="toolbar-inner">
    <div class="toolbar-left">${TOOLBAR.map((group, i) => `${i ? `<span class="tool-sep" data-group-sep="${i}" aria-hidden="true"></span>` : ''}<div class="tool-group" data-group="${i}">${group.map(button).join('')}</div>`).join('')}<button class="tool-button toolbar-more" data-toolbar-more hidden title="${escapeHtml(t('toolbar.more'))}" aria-label="${escapeHtml(t('toolbar.more'))}" aria-haspopup="true">${icon('toolbarMore')}</button></div>
    <span class="grow"></span>
    <div class="toolbar-right tool-group">${TOOLBAR_RIGHT.map(button).join('')}</div>
  </div>`;
  renderToolbarState();
  updateMinimumWidth();
  fitToolbar();
}

function fitToolbar() {
  const inner = root.querySelector('.toolbar-inner');
  const left = root.querySelector('.toolbar-left');
  const right = root.querySelector('.toolbar-right');
  const more = root.querySelector('[data-toolbar-more]');
  if (!inner || !left || !right || !more) return;
  const groups = [...left.querySelectorAll('[data-group]')];
  for (const el of left.querySelectorAll('[data-group], [data-group-sep]')) el.hidden = false;
  more.hidden = true;
  const room = inner.clientWidth - right.offsetWidth - 12;
  if (left.scrollWidth <= room) { state.toolbarHidden = []; return; }
  more.hidden = false;
  const limit = room - more.offsetWidth - 6;
  const start = left.getBoundingClientRect().left;
  let cut = groups.length;
  for (const [i, g] of groups.entries()) if (g.getBoundingClientRect().right - start > limit) { cut = Math.max(1, i); break; }
  for (const el of left.querySelectorAll('[data-group], [data-group-sep]')) el.hidden = Number(el.dataset.group ?? el.dataset.groupSep) >= cut;
  state.toolbarHidden = TOOLBAR.slice(cut);
}

function showToolbarMore(button) {
  const ids = (state.toolbarHidden ?? []).flatMap((group, i) => [...(i ? ['-'] : []), ...group.map((id) => TOOLBAR_MAIN[id] ?? id)]).filter((id) => id === '-' || commands[id]);
  if (ids.length) showMenu(menuItems(ids), anchorBelow(button));
}

function renderToolbarState() {
  for (const el of root.querySelectorAll('#toolbar [data-command], #tabs [data-command]')) {
    const id = el.dataset.command;
    el.disabled = !commandEnabled(id);
    const checked = commands[id]?.checked?.();
    el.classList.toggle('active', Boolean(checked));
    if (checked !== undefined) el.setAttribute('aria-pressed', String(Boolean(checked)));
  }
  root.querySelector('#toolbar [data-command="runAgent"]')?.classList.toggle('running', runActive());
  const undoBtn = root.querySelector('#toolbar [data-command="undo"]');
  if (undoBtn) undoBtn.title = editor.canUndo() ? `${commandTip('undo')}: ${editor.undoLabel()}` : commandTip('undo');
  const redoBtn = root.querySelector('#toolbar [data-command="redo"]');
  if (redoBtn) redoBtn.title = editor.canRedo() ? `${commandTip('redo')}: ${editor.redoLabel()}` : commandTip('redo');
  renderTitleProject();
}

function updateMinimumWidth() {
  const right = root.querySelector('.toolbar-right');
  if (!right) return;
  requestAnimationFrame(() => {
    const menus = [...root.querySelectorAll('.app-brand, .menubar-item, .window-controls')].reduce((sum, el) => sum + el.offsetWidth + 2, 48);
    const width = Math.ceil(Math.max(menus, right.scrollWidth + 360));
    const min = Math.min(window.screen?.availWidth || Infinity, Math.max(width, 900));
    if (Math.abs(min - state.minWidth) < 1) return;
    state.minWidth = min;
    document.documentElement.style.setProperty('--min-width', `${min}px`);
    native.setMinimumSize(min, 600).catch(() => {});
  });
}

/** Above the workspace: the agent and the view tabs (Editor · Runs · Knowledge · Models & keys). */
function renderTabs() {
  renderTitleProject();
  const tabs = root.querySelector('#tabs');
  if (!tabs) return;
  if (state.showStart) { tabs.innerHTML = ''; return; }
  const d = editor.doc();
  const list = [['view:editor', 'editor'], ['view:runs', 'runs'], ['view:knowledge', 'knowledge'], ['view:models', 'models']];
  tabs.innerHTML = `<div class="tab-strip">${state.hasDoc ? `<span class="ws-crumb" title="${escapeHtml(d?.name ?? '')}">${icon(d?.deployed ? 'deploy' : 'robot')}<b>${escapeHtml(d?.name ?? '')}</b>${d?.deployed ? `<i class="badge on">${escapeHtml(t('agent.deployed'))}</i>` : ''}${editor.dirty() ? `<i class="badge">${escapeHtml(t('agent.unsaved'))}</i>` : ''}</span>` : ''}</div>
    <span class="grow"></span>
    <div class="tabs-right"><span class="seg-toggle" role="tablist">${list.map(([command, view]) => `<button class="${state.view === view ? 'active' : ''}" data-command="${command}" role="tab" aria-selected="${state.view === view}" title="${escapeHtml(commandTip(command))}" ${commandEnabled(command) ? '' : 'disabled'}>${icon(commands[command].icon)}<span>${escapeHtml(t(`view.${view}`))}</span></button>`).join('')}</span></div>`;
}

function setView(view) {
  if (view === 'editor' && !state.hasDoc) return;
  state.view = view;
  state.showStart = false;
  renderAll();
}

// ───────────────────────── left panel: agents + palette

function renderLeft() { renderLeftAgents(); renderPalette(); }

function renderLeftAgents() {
  const host = root.querySelector('#agents-panel');
  if (!host) return;
  const q = state.agentQuery.trim().toLowerCase();
  const list = state.agents.filter((a) => !q || `${a.name} ${a.description}`.toLowerCase().includes(q));
  const current = state.hasDoc ? editor.doc()?.id : null;
  const focused = document.activeElement?.id === 'agent-search';
  const scroll = host.querySelector('.agent-list')?.scrollTop ?? 0;
  const triggerIcon = { manual: 'play', chat: 'chat', webhook: 'webhook', schedule: 'calendarClock' };
  host.innerHTML = `<div class="side-head">${icon('robot')}<b>${escapeHtml(t('panel.agents'))}</b><i class="side-count">${state.agents.length}</i><span class="grow"></span>
      <button class="icon-button" data-command="newAgent" title="${escapeHtml(commandTip('newAgent'))}" ${coreReady() ? '' : 'disabled'}>${icon('fileNew')}</button>
      <button class="icon-button" data-command="describe" title="${escapeHtml(commandTip('describe'))}" ${coreReady() ? '' : 'disabled'}>${icon('wand')}</button>
      <button class="icon-button panel-collapse" data-command="leftPanel" title="${escapeHtml(t('panel.collapse'))}" aria-label="${escapeHtml(t('panel.collapse'))}">${icon('panelLeft')}</button></div>
    <div class="side-search"><input type="search" id="agent-search" placeholder="${escapeHtml(t('panel.searchAgents'))}" value="${escapeHtml(state.agentQuery)}" />${icon('search')}</div>
    <div class="agent-list">${list.map((a) => `<button class="agent-row ${a.id === current ? 'active' : ''}" data-agent-open="${escapeHtml(a.id)}" title="${escapeHtml(a.description || a.name)}">${icon(a.deployed ? 'deploy' : 'robot')}<span class="agent-name">${escapeHtml(a.id === current ? editor.doc()?.name ?? a.name : a.name)}</span>${a.id === current && editor.dirty() ? '<i class="dirty-dot">●</i>' : ''}<span class="agent-tags">${a.triggers.map((k) => icon(triggerIcon[k] ?? 'bolt')).join('')}</span></button>`).join('') || `<p class="muted small side-empty">${escapeHtml(coreReady() ? t('start.noAgents') : t('core.connecting'))}</p>`}</div>`;
  host.querySelector('.agent-list').scrollTop = scroll;
  if (focused) { const s = host.querySelector('#agent-search'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
}

function renderPalette() {
  const host = root.querySelector('#palette-panel');
  if (!host) return;
  const scroll = host.querySelector('.pal-groups')?.scrollTop ?? 0;
  host.innerHTML = `<div class="side-head">${icon('plus')}<b>${escapeHtml(t('panel.palette'))}</b><span class="grow"></span><span class="muted small">${escapeHtml(t('palette.dragHint'))}</span></div>${editor.paletteHtml()}`;
  host.querySelector('.pal-groups').scrollTop = scroll;
}

// ───────────────────────── centre

function renderWorkspace() {
  const ws = root.querySelector('#workspace');
  if (!ws) return;
  ws.dataset.view = state.view;
  if (state.showStart) return;
  if (state.view === 'editor') {
    if (!state.hasDoc) { editor.destroyCanvas(); ws.innerHTML = ''; return; }
    let host = ws.querySelector(':scope > .canvas-mount');
    if (!host) { ws.innerHTML = '<div class="canvas-mount"></div>'; host = ws.querySelector('.canvas-mount'); }
    editor.mountCanvas(host);
    return;
  }
  editor.destroyCanvas();
  ws.innerHTML = '<div class="view-mount"></div>';
  views[state.view]?.mount(ws.querySelector('.view-mount'));
}

// ───────────────────────── right panel: Node · Chat

function showRightTab(tab) {
  const patch = { rightTab: tab };
  if (!state.settings.showRightPanel) patch.showRightPanel = true;
  updateSettings(patch, { quiet: true });
  root.classList.toggle('no-right', !state.settings.showRightPanel);
  renderRight();
  renderToolbarState();
  if (tab === 'chat') setTimeout(() => root.querySelector('#chat-host textarea')?.focus(), 30);
}

function renderRight() {
  const tabs = root.querySelector('.right-tabs');
  if (!tabs) return;
  const tab = state.settings.rightTab;
  tabs.innerHTML = `<span class="right-title">${icon('edit')}<b>${escapeHtml(t('panel.right'))}</b></span><span class="segmented" role="tablist">${[['node', 'edit', t('right.node')], ['chat', 'chat', t('right.chat')]].map(([id, glyph, label]) => `<button class="segment ${tab === id ? 'active' : ''}" data-right-tab="${id}" role="tab" aria-selected="${tab === id}">${icon(glyph)}<span>${escapeHtml(label)}</span></button>`).join('')}</span><span class="grow"></span><button class="icon-button panel-collapse" data-command="rightPanel" title="${escapeHtml(t('panel.collapse'))}" aria-label="${escapeHtml(t('panel.collapse'))}">${icon('panelRight')}</button>`;
  root.querySelector('#inspector-host').hidden = tab !== 'node';
  root.querySelector('#chat-host').hidden = tab !== 'chat';
  if (tab === 'chat') editor.renderChat(); else editor.state.inspector?.render();
}

// ───────────────────────── bottom panel

function showBottomTab(tab) {
  state.bottomTab = tab;
  if (!state.settings.showBottomPanel) updateSettings({ showBottomPanel: true }); else renderBottom();
}

function bottomTabList() {
  const editorTabs = state.hasDoc ? editor.bottomTabs() : [];
  return [...editorTabs, ['messages', 'info', t('bottom.messages'), state.log.length], ['info', 'server', t('bottom.info'), null]];
}

const bottomTabsHtml = () => `<span class="segmented" role="tablist">${bottomTabList().map(([id, glyph, label, n]) => `<button class="segment ${state.bottomTab === id ? 'active' : ''}" data-bottom-tab="${id}" role="tab" aria-selected="${state.bottomTab === id}">${icon(glyph)}<span>${escapeHtml(label)}</span>${n != null ? `<i class="bottom-count">${n}</i>` : ''}</button>`).join('')}</span>`;

function renderBottomTabs() {
  if (!state.settings.showBottomPanel) { renderBottom(); return; }
  const strip = root.querySelector('#bottom-panel .problems-header .segmented');
  if (!strip) return;
  strip.outerHTML = bottomTabsHtml();
}

function renderBottom() {
  const host = root.querySelector('#bottom-panel');
  if (!host) return;
  if (state.showStart) { host.innerHTML = ''; return; }
  if (!state.settings.showBottomPanel) {
    const tip = t('panel.expand', { name: t('bottom.title') });
    host.innerHTML = `<button type="button" class="bottom-rail" data-command="bottomPanel" title="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}">${icon('timeline', 'icon rail-icon')}<b>${escapeHtml(t('bottom.title'))}</b><span class="rail-tabs">${bottomTabList().map(([, glyph, label, count]) => `<span class="rail-tab">${icon(glyph)}<span>${escapeHtml(label)}</span>${count ? `<i>${count}</i>` : ''}</span>`).join('')}</span><span class="grow"></span>${icon('panelBottom', 'icon rail-toggle')}</button>`;
    return;
  }
  if (!bottomTabList().some(([id]) => id === state.bottomTab)) state.bottomTab = 'messages';
  let tools = '<span class="grow"></span>';
  let body = '';
  if (['run', 'history', 'problems', 'progress', 'code'].includes(state.bottomTab)) { tools = editor.bottomTools(state.bottomTab); body = editor.bottomBody(state.bottomTab); }
  else if (state.bottomTab === 'messages') {
    tools = `<span class="grow"></span><button class="small-button" data-command="copyMessages" ${state.log.length ? '' : 'disabled'}>${icon('copy')}<span>${escapeHtml(t('action.copyMessages'))}</span></button><button class="small-button danger" data-command="clearMessages" ${state.log.length ? '' : 'disabled'}>${icon('clearHistory')}<span>${escapeHtml(t('action.clearMessages'))}</span></button>`;
    const SEV = { error: 'error', warning: 'warning', info: 'info', success: 'check' };
    body = state.log.length ? state.log.map((e) => `<div class="problem-row bottom-row log-row ${e.kind}" title="${escapeHtml(e.detail || e.text)}"><span class="cell sev">${icon(SEV[e.kind] ?? 'info')}</span><span class="cell">${escapeHtml(e.text)}</span><span class="cell muted">${escapeHtml(String(e.detail).split('\n')[0] ?? '')}</span><span class="cell muted">${escapeHtml(e.at.toLocaleTimeString())}</span></div>`).join('') : `<p class="problems-empty">${icon('info')}<span>${escapeHtml(t('bottom.noMessages'))}</span></p>`;
  } else {
    const info = state.core.info;
    const rows = [
      ['server', t('bottom.infoMode'), info ? `${t(`mode.${info.mode}`)} · v${info.version}` : t('core.unreachableShort')],
      ['folder', t('bottom.infoData'), info?.dataDir ?? '—'],
      ['star', t('models.defaultModel'), state.coreSettings?.defaultModel ?? '—'],
      ['key', t('bottom.infoProviders'), state.providerStatus.filter((p) => p.ready).map((p) => PROVIDERS.find((x) => x.id === p.id)?.label ?? p.id).join(', ') || '—'],
      ['robot', t('bottom.infoAgents'), String(state.agents.length)],
      ['activity', t('bottom.infoEvents'), t(`events.${state.events}`)],
    ];
    body = rows.map(([glyph, label, value]) => `<div class="problem-row bottom-row info-row"><span class="cell sev">${icon(glyph)}</span><span class="cell"><b>${escapeHtml(label)}</b></span><span class="cell info-value" title="${escapeHtml(value)}">${escapeHtml(value)}</span></div>`).join('');
  }
  host.innerHTML = `<div class="problems-header">${bottomTabsHtml()}${tools}<button class="icon-button panel-collapse" data-command="bottomPanel" title="${escapeHtml(t('panel.collapse'))}" aria-label="${escapeHtml(t('panel.collapse'))}">${icon('panelBottom')}</button></div><div class="problems-list bottom-${state.bottomTab}" tabindex="0">${body}</div>`;
  if (state.bottomTab === 'run') editor.renderRunPanel();
}

// ───────────────────────── status bar

function renderStatus() {
  const bar = root.querySelector('#statusbar');
  if (!bar) return;
  const s = state.settings;
  const notice = state.notice;
  const hint = notice?.text ?? t('status.ready');
  const items = [`<span class="status-notice ${notice?.kind ?? 'hint'}" title="${escapeHtml(hint)}">${icon(notice?.kind === 'error' ? 'error' : notice?.kind === 'success' ? 'check' : 'info')}<span>${escapeHtml(hint)}</span></span>`];
  const core = state.core.status;
  items.push(`<button class="status-item core-state ${core}" data-command="${core === 'ready' ? 'refresh' : 'reconnect'}" title="${escapeHtml(core === 'error' ? state.core.error : t(`core.state.${core}`))}">${icon(core === 'ready' ? 'server' : core === 'error' ? 'error' : 'hourglass')}<span>${escapeHtml(t(`core.state.${core}`))}</span></button>`);
  if (coreReady()) items.push(`<button class="status-item" data-command="view:models" title="${escapeHtml(t('models.defaultModel'))}">${icon('sparkles')}<span>${escapeHtml(state.coreSettings?.defaultModel ?? '')}</span></button>`);
  const live = editor.live();
  if (hasDoc() && live) items.push(`<button class="status-item run-state st-${live.status}" data-command="showRun" title="${escapeHtml(t('action.showRun'))}">${icon(live.status === 'running' ? 'hourglass' : live.status === 'succeeded' ? 'check' : live.status === 'waiting' ? 'approve' : 'error')}<span>${escapeHtml(t(`run.status.${live.status}`))}${live.steps ? ` · ${t('run.steps', { n: live.steps.length })}` : ''}</span></button>`);
  if (hasDoc()) { const errors = editor.problems().filter((p) => p.severity === 'error').length; items.push(`<button class="status-item ${errors ? 'has-errors' : ''}" data-command="showProblems">${icon(errors ? 'error' : 'check')}<span>${escapeHtml(t('status.problems', { n: editor.problems().length }))}</span></button>`); }
  items.push(`<span class="status-item">${icon('palette')}<span>${escapeHtml(themeName(s.theme, getLanguage()))}</span></span>`);
  items.push(`<span class="status-item">${icon('globe')}<span>${escapeHtml(t('status.language'))}</span></span>`);
  if (s.statusClock) items.push(`<span class="status-item clock">${icon('clock')}<span id="status-clock">${escapeHtml(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span></span>`);
  bar.innerHTML = items.join('');
}

function renderAll() {
  root.classList.toggle('no-status', !state.settings.showStatusBar);
  root.classList.toggle('no-left', !state.settings.showLeftPanel);
  root.classList.toggle('no-right', !state.settings.showRightPanel);
  root.classList.toggle('on-start', state.showStart);
  root.classList.toggle('no-bottom', !state.settings.showBottomPanel);
  root.classList.toggle('view-other', !state.showStart && state.view !== 'editor');
  root.style.setProperty('--bottom-height', `${state.settings.bottomHeight}px`);
  root.style.setProperty('--left-width', `${state.settings.leftWidth}px`);
  root.style.setProperty('--right-width', `${state.settings.rightWidth}px`);
  root.style.setProperty('--left-view-height', `${state.settings.leftViewHeight}px`);
  root.style.setProperty('--zoom', String(state.settings.zoom / 100));
  renderMenubar();
  if (toolbarLanguage !== getLanguage()) renderToolbar(); else renderToolbarState();
  renderTabs();
  renderLeft();
  renderRight();
  renderBottom();
  renderStatus();
  const startHost = root.querySelector('#start-page');
  startHost.hidden = !state.showStart;
  root.querySelector('#workspace').hidden = state.showStart;
  renderWorkspace();
  if (state.showStart) renderStartPage(); else { startCards?.destroy(); startCards = null; startHost.innerHTML = ''; }
  updateBackgroundState();
}

// ───────────────────────── start page

let startCards = null;
function renderStartPage() {
  const host = root.querySelector('#start-page');
  if (!host || host.hidden) return;
  const scrollTop = host.querySelector('.start-scroll')?.scrollTop ?? 0;
  startCards?.destroy();
  host.innerHTML = startPageHtml(panelApi);
  startCards = startBoard(host.querySelector('.start-board'), {
    saved: state.settings.startLayout, arrangement: state.settings.startArrange,
    reduced: Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
    onSave: (layout) => { state.settings.startLayout = layout; storeSettings(globalThis.localStorage, state.settings); },
  });
  host.querySelector('.start-scroll').scrollTop = scrollTop;
  const canvas = host.querySelector('.start-bg');
  const carry = startBackground ? { time: startBackground.time, kind: startBackground.kind } : null;
  startBackground?.destroy();
  startBackground = new AnimatedBackground(canvas, { colors: backgroundColors, speed: () => state.settings.animationSpeed / 100, kind: state.settings.animation, vivid: true });
  if (carry && carry.kind === startBackground.kind) startBackground.time = carry.time;
  if (state.settings.backgroundKind === 'animated') startBackground.start(); else startBackground.draw();
  canvas.classList.toggle('static', state.settings.backgroundKind !== 'animated');
  host.querySelector('.start-scroll').style.setProperty('--start-image', state.backgroundUrl && state.settings.backgroundKind === 'image' ? `url("${state.backgroundUrl}")` : 'none');
  host.classList.toggle('with-image', Boolean(state.backgroundUrl) && state.settings.backgroundKind === 'image');
}

function showStartPage(show = true) {
  state.showStart = show;
  if (!show && !state.hasDoc && state.view === 'editor') state.view = 'models';
  renderAll();
}

async function onStartAction(target) {
  const value = target.dataset.value;
  switch (target.dataset.start) {
    case 'new-agent': return newAgent();
    case 'describe': return describeAgent();
    case 'template': return fromTemplate(value);
    case 'open': return openMenu(anchorBelow(target));
    case 'open-agent': return openAgent(value);
    case 'forget-recent': forgetOpened([value]); return renderStartPage();
    case 'clear-history': return clearHistory();
    case 'delete-agent': return deleteAgent(value);
    case 'delete-all-agents': return deleteAllAgents();
    case 'continue': return value ? openAgent(value) : openMenu(anchorBelow(target));
    case 'import': return importAgent();
    case 'view-knowledge': return setView('knowledge');
    case 'view-models': return setView('models');
    case 'view-runs': return setView('runs');
    case 'retry-core': return connectCore();
    case 'arrange': updateSettings({ startArrange: value, startLayout: null }, { quiet: true }); return renderStartPage();
    case 'start-settings': return popups.open('settings', { tab: 'start' });
    case 'settings': return run('settings');
    case 'about': return run('about');
    case 'exit': return run('exit');
    case 'help-menu': return showMenu(menuItems(MENUS.help), anchorBelow(target), 'help');
    case 'guide': return openDocWindow('guide');
    case 'animation': updateSettings({ animation: value, backgroundKind: 'animated' }); return notify('info', t('notice.animation', { name: t(`animation.${value}`) }));
    case 'shuffle': return shuffleBackground();
    case 'background-image': return chooseBackground();
    default: return undefined;
  }
}

// ───────────────────────── background (animated / image)

let appBackground = null;
let startBackground = null;
function backgroundColors() {
  const theme = resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme);
  return { bg: theme.colors.bg, accent: theme.colors.accent, text: theme.colors.text, dark: theme.dark, danger: '#e5484d' };
}
function updateBackgroundState() {
  const s = state.settings;
  const layer = root.querySelector('.app-bg');
  if (!layer) return;
  if (!appBackground) appBackground = new AnimatedBackground(layer.querySelector('.anim-bg'), { colors: backgroundColors, speed: () => s.animationSpeed / 100, kind: s.animation });
  appBackground.setKind(s.animation);
  startBackground?.setKind(s.animation);
  layer.classList.toggle('animated', false);
  appBackground.stop();
  if (state.showStart && startBackground) { if (s.backgroundKind === 'animated') startBackground.start(); else { startBackground.stop(); startBackground.draw(); } }
  else startBackground?.stop();
}
let startBackgroundChangedAt = Date.now();
function randomAnimation(current) { const others = ANIMATIONS.filter((k) => k !== current); return others[Math.floor(Math.random() * others.length)]; }
function tickStartBackground() {
  const s = state.settings;
  const showing = state.showStart && s.backgroundKind === 'animated' && s.animationInterval > 0 && !document.hidden;
  if (!showing) { startBackgroundChangedAt = Date.now(); return; }
  if (Date.now() - startBackgroundChangedAt >= s.animationInterval * 1000) { startBackgroundChangedAt = Date.now(); updateSettings({ animation: randomAnimation(s.animation) }, { quiet: true }); startBackground?.setKind(state.settings.animation); }
}
function shuffleBackground() { const next = (startBackground ?? appBackground)?.shuffle() ?? ANIMATIONS[0]; updateSettings({ animation: next, backgroundKind: 'animated' }); notify('info', t('notice.animation', { name: t(`animation.${next}`) })); }
async function loadBackground() {
  try { state.backgroundUrl = await native.backgroundUrl(state.settings); } catch (error) { state.backgroundUrl = null; showError('error.background', error); }
  updateBackgroundState();
  if (state.showStart) renderStartPage();
}
async function chooseBackground() {
  try {
    if (desktop) { const path = await native.chooseImage(state.settings.lastDirectory); if (path) { const stored = await withProgress('progress.background', baseName(path), (op) => native.importBackground(path, op)); updateSettings({ backgroundImage: stored, backgroundName: baseName(path), backgroundKind: 'image' }); await loadBackground(); } }
    else { const [file] = await native.pickWithInput('image/*'); if (file) { await native.storeWebBackground(file); updateSettings({ backgroundImage: `web:${file.name}:${Date.now()}`, backgroundName: file.name, backgroundKind: 'image' }); await loadBackground(); } }
  } catch (error) { showError('error.background', error); }
}
async function removeBackground() { await native.clearBackground(); state.backgroundUrl = null; updateSettings({ backgroundImage: null, backgroundName: '', backgroundKind: state.settings.backgroundKind === 'image' ? 'animated' : 'none' }); }

// ───────────────────────── settings, theme

function updateSettings(patch, { quiet = false } = {}) {
  const previous = state.settings;
  state.settings = { ...state.settings, ...patch };
  storeSettings(globalThis.localStorage, state.settings);
  if (quiet) return;
  applySettings(previous);
}

function applySettings(previous = {}) {
  const s = state.settings;
  const theme = resolveTheme(s.theme, prefersDark(), s.customTheme);
  applyTheme(theme);
  applyFont(s);
  native.setWindowTheme(theme.dark);
  if (s.language !== getLanguage()) {
    setLanguage(s.language);
    native.setBackendLanguage(s.language);
    renderShell();
    if (previous.language) notify('info', t('notice.language'));
  }
  if (s.backgroundImage !== previous.backgroundImage) loadBackground();
  if (s.theme !== previous.theme && previous.theme) notify('info', t('notice.theme', { name: themeName(s.theme, getLanguage()) }));
  renderAll();
  updateMinimumWidth();
}

async function openThemePicker(anchor) {
  const element = root.querySelector('.split-button [data-command="themeMenu"]')?.closest('.split-button') ?? root.querySelector('[data-command="themeMenu"]');
  const current = state.settings.theme;
  const handlers = {};
  const item = (theme, glyph = null) => {
    const id = `custom:theme:${theme.id ?? theme}`;
    handlers[id] = () => updateSettings({ theme: theme.id ?? theme });
    return { id, label: themeName(theme.id ?? theme, lang()), icon: glyph ?? 'palette', swatch: theme.swatch ?? null, checked: current === (theme.id ?? theme) };
  };
  handlers['custom:theme-edit'] = () => popups.open('settings', { tab: 'appearance', themeGroup: 'custom' });
  handlers['custom:theme-random'] = () => updateSettings({ theme: randomThemeId(current) });
  const items = [
    item(SYSTEM, 'monitor'), item(customTheme(state.settings.customTheme), 'palette'), { separator: true },
    { columns: [DARK_THEMES.map((x) => item(x)), LIGHT_THEMES.map((x) => item(x))], heads: [t('theme.darkGroup', { count: DARK_THEMES.length }), t('theme.lightGroup', { count: LIGHT_THEMES.length })], headIcons: ['moon', 'sun'] },
    { separator: true }, { id: 'custom:theme-edit', label: t('settings.editCustom'), icon: 'edit' }, { id: 'custom:theme-random', label: t('action.themeRandom'), icon: 'dice' },
  ];
  await showMenu(items, anchor ?? anchorBelow(element), 'theme', { handlers, header: { icon: 'palette', title: t('action.themeChoose') } });
}

// ───────────────────────── progress popup

let progressJobs = 0;
async function withProgress(titleKey, name, task, { delay = 250 } = {}) {
  const op = `op-${Date.now().toString(36)}`;
  let shown = false;
  progressJobs += 1;
  const show = (wait = 0) => { shown = true; popups.open('progress', { title: t(titleKey), name, op, delay: wait }, { delay: wait }); };
  let timer = null;
  if (desktop && !popups.useFrames) show(delay); else timer = setTimeout(() => show(0), delay);
  try { return await task(op); } finally {
    clearTimeout(timer);
    progressJobs -= 1;
    if (shown) {
      popups.post('progress', { type: 'done' });
      setTimeout(() => { if (!progressJobs) popups.hide('progress'); }, 400);
    }
  }
}

// ───────────────────────── confirmation & exit

/** The result window when a run started here finishes (Settings › Editor › "Show the result when a run ends"). */
async function showRunDone(run) {
  if (!run || run.status === 'cancelled' || state.settings.runDonePopup === false) return;
  const steps = run.steps ?? [];
  const out = run.output;
  const output = out === undefined || out === null ? '' : typeof out === 'string' ? out : typeof out?.text === 'string' && Object.keys(out).length <= 2 ? out.text : JSON.stringify(out, null, 2);
  const tokens = steps.reduce((n, s) => n + (s.usage?.input ?? 0) + (s.usage?.output ?? 0), 0);
  const ms = run.ms ?? (run.endedAt && run.startedAt ? run.endedAt - run.startedAt : null);
  const res = await popups.open('rundone', {
    at: Date.now(), status: run.status, name: editor.doc()?.name ?? '', steps: steps.length, failed: steps.filter((s) => s.status === 'failed').length,
    time: ms == null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`, tokens: tokens || 0, error: run.error?.message ?? '', output: output.slice(0, 20000),
  });
  if (res?.choice === 'show') showBottomTab('run');
}

// ───────────────────────── local Ollama: install / start / download a model

const ollamaHas = (models, name) => !name || models.some((m) => m === name || m === `${name}:latest` || m.split(':')[0] === name);
/** The model an Ollama error is about ('… model "llava3.3" is not installed …'). */
const ollamaModelOf = (error) => /model "([^"]+)"/.exec(String(error?.message ?? ''))?.[1] ?? '';
const isOllamaProblem = (error) => ['PROVIDER_UNREACHABLE', 'MODEL_NOT_INSTALLED', 'PROVIDER_NOT_FOUND'].includes(error?.code) && /ollama/i.test(String(error?.message ?? ''));

/** Runs an Ollama job (install, start, pull) with the progress window until it ends → the job. */
async function ollamaJob(kind, model = '') {
  const titleKey = { install: 'ollama.installing', start: 'ollama.starting', pull: 'ollama.pulling' }[kind];
  return withProgress(titleKey, kind === 'pull' ? model : 'Ollama', async () => {
    if (kind === 'start') { await client.ollamaStart(); return { status: 'done' }; }
    if (kind === 'install') await client.ollamaInstall(); else await client.ollamaPull(model);
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const job = await client.ollamaJob();
      const text = job.text ? (job.total > 1000 ? '' : job.text) : '';
      popups.post('progress', { type: 'progress', done: job.done, total: job.total, ...(text ? { text } : {}) });
      if (job.kind === kind && job.status !== 'running') return job;
    }
  }, { delay: 0 });
}

/** Local Ollama is missing, stopped or lacks a model: offers to fix it here. → true when fixed. */
async function offerOllama(error = null, model = '') {
  let st;
  try { st = await client.ollamaStatus(); } catch { return false; }
  const name = model || ollamaModelOf(error);
  const cancel = { id: 'cancel', label: t('confirm.cancel') };
  let choice;
  if (!st.installed) {
    choice = await ask({ icon: 'download', title: t('ollama.missingTitle'), message: t(st.canInstall ? 'ollama.missingText' : 'ollama.missingWeb', { via: t(`ollama.via.${st.via}`) }), buttons: [cancel, { id: 'page', label: t('ollama.page'), icon: 'globe' }, ...(st.canInstall ? [{ id: 'install', label: t('ollama.install'), icon: 'download', primary: true }] : [])] });
  } else if (!st.running) {
    choice = await ask({ icon: 'server', title: t('ollama.stoppedTitle'), message: t('ollama.stoppedText'), buttons: [cancel, ...(st.canInstall ? [{ id: 'start', label: t('ollama.start'), icon: 'play', primary: true }] : [])] });
  } else if (name && !ollamaHas(st.models, name)) {
    choice = await ask({ icon: 'download', title: t('ollama.noModelTitle'), message: t('ollama.noModelText', { model: name, models: st.models.join(', ') || '—' }), buttons: [cancel, ...(st.canInstall ? [{ id: 'pull', label: t('ollama.pull', { model: name }), icon: 'download', primary: true }] : [])] });
  } else return false;
  if (choice === 'page') { native.openExternal(st.downloadPage); return false; }
  if (!['install', 'start', 'pull'].includes(choice)) return false;
  try {
    const job = await ollamaJob(choice, name);
    if (job.status === 'failed') throw Object.assign(new Error(job.error || t('ollama.failed')), { code: 'OLLAMA_FAILED' });
    notify('success', t(`ollama.done.${choice}`, { model: name }));
    if (choice !== 'pull' && name) { const again = await client.ollamaStatus(); if (!ollamaHas(again.models, name)) return offerOllama(null, name); }
    loadCoreSummary();
    return true;
  } catch (err) { showError('ollama.failed', err); return false; }
}

async function ask(params) { const result = await popups.open('confirm', params); return result?.choice ?? 'cancel'; }
async function requestExit() { if (desktop) return appWindow.close(); return undefined; }
async function confirmExit() {
  if (!(await confirmDiscard())) return false;
  if (runActive()) {
    const choice = await ask({ kind: 'exit', icon: 'hourglass', title: t('confirm.exitTitle'), message: t('confirm.exitRunning'), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'exit', label: t('action.exit'), icon: 'exit', danger: true, primary: true }] });
    return choice === 'exit';
  }
  return true;
}

// ───────────────────────── documents (help windows)

async function openDocWindow(kind) {
  const info = DOC_KINDS[kind];
  if (!info) return undefined;
  popups.hideMenu();
  const url = `${location.pathname}?viewer=${kind}&lang=${getLanguage() === 'en' ? 'en' : 'ko'}`;
  if (!desktop) { globalThis.open(url, `myagents-${docLabel(kind)}`)?.focus?.(); return undefined; }
  const dark = resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme).dark;
  try { await native.invoke('open_doc_window', { kind, title: docWindowTitle(t(info.title)), width: info.width, height: info.height, dark }); } catch (error) { showError('error.docWindow', error); }
  return undefined;
}

// ───────────────────────── drag & drop of agent files

function setDropActive(active) { if (state.dropActive === active) return; state.dropActive = active; root.classList.toggle('drop-active', active); }
async function handleDroppedFiles(files) {
  for (const file of files) { if (!/\.(myagent|json)$/i.test(file.name)) { notify('warning', t('drop.unsupported', { name: file.name })); continue; } await importText(file.name, await file.text()); }
}
async function handleDroppedPaths(paths) {
  for (const path of paths) {
    if (!/\.(myagent|json)$/i.test(path)) { notify('warning', t('drop.unsupported', { name: baseName(path) })); continue; }
    try { await importText(baseName(path), await native.readTextFile(path, '')); } catch (error) { showError('error.import', error, path); }
  }
}

// ───────────────────────── events

/** Listeners on elements renderShell() makes (they are made again on a language change). */
function bindShellEvents() {
  root.querySelectorAll('[data-split="left"], [data-split="right"]').forEach((splitter) => splitter.addEventListener('pointerdown', (event) => {
    const side = splitter.dataset.split;
    if ((side === 'left' && !state.settings.showLeftPanel) || (side === 'right' && !state.settings.showRightPanel)) return;
    event.preventDefault();
    const key = side === 'left' ? 'leftWidth' : 'rightWidth';
    const startWidth = state.settings[key];
    pointerDrag(event, {
      cursor: 'col-resize',
      move: (dx) => { const width = Math.max(side === 'left' ? PANEL_MIN.left : PANEL_MIN.right, Math.min(800, startWidth + (side === 'left' ? dx : -dx))); root.style.setProperty(side === 'left' ? '--left-width' : '--right-width', `${width}px`); state.settings[key] = width; },
      end: (e, moved) => { if (moved) updateSettings({ [key]: state.settings[key] }, { quiet: true }); },
    });
  }));
  root.querySelector('[data-split="bottom"]')?.addEventListener('pointerdown', (event) => {
    if (!state.settings.showBottomPanel) return;
    event.preventDefault();
    const start = state.settings.bottomHeight;
    pointerDrag(event, {
      cursor: 'row-resize',
      move: (dx, dy) => { const h = Math.max(PANEL_MIN.bottom, Math.min(window.innerHeight * 0.6, start - dy)); root.style.setProperty('--bottom-height', `${h}px`); state.settings.bottomHeight = Math.round(h); },
      end: (e, moved) => { if (moved) updateSettings({ bottomHeight: state.settings.bottomHeight }, { quiet: true }); },
    });
  });
  root.querySelector('#menubar')?.addEventListener('mousedown', (event) => {
    if (!desktop || event.button !== 0 || !event.target.closest?.('[data-window-drag]')) return;
    event.preventDefault();
    if (event.detail === 2) appWindow?.toggleMaximize().catch(() => {});
    else native.invoke('window_drag', {}).catch(() => {});
  });
  root.querySelector('[data-resize-grip]')?.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    native.invoke('window_drag', { edge: 'SouthEast' }).catch(() => appWindow?.startResizeDragging('SouthEast').catch(() => {}));
  });
}

function bindEvents() {
  root.addEventListener('click', (event) => {
    const target = event.target;
    const menu = target.closest('[data-menu]');
    if (menu) { const name = menu.dataset.menu; if (state.lastMenuClose.name === name && Date.now() - state.lastMenuClose.at < 300) return undefined; return openMenubarMenu(name); }
    if (target.closest('[data-home]')) return showStartPage(!state.showStart);
    const start = target.closest('[data-start]');
    if (start && !start.disabled) return onStartAction(start);
    if (target.closest('[data-toolbar-more]')) return showToolbarMore(target.closest('[data-toolbar-more]'));
    const command = target.closest('[data-command]');
    if (command && !command.disabled) {
      const id = command.dataset.command;
      const anchored = ['themeMenu', 'open', 'newFromTemplate', 'addNode'].includes(id);
      return run(id, { anchor: anchored ? anchorBelow(command.closest('.split-button') ?? command) : undefined });
    }
    const windowControl = target.closest('[data-window]');
    if (windowControl) return windowButton(windowControl.dataset.window);
    const agentOpen = target.closest('[data-agent-open]');
    if (agentOpen) return openAgent(agentOpen.dataset.agentOpen);
    const rightTab = target.closest('[data-right-tab]');
    if (rightTab) return showRightTab(rightTab.dataset.rightTab);
    const bottomTab = target.closest('[data-bottom-tab]');
    if (bottomTab) { state.bottomTab = bottomTab.dataset.bottomTab; return renderBottom(); }
    if (target.closest('#bottom-panel')) return editor.bottomClick(event);
    if (target.closest('#workspace .view-mount')) return views[state.view]?.onClick?.(event);
    return undefined;
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if ('startToggle' in target.dataset) return updateSettings({ showStartPage: target.checked }, { quiet: true });
    if ('startSpeed' in target.dataset) return updateSettings({ animationSpeed: Number(target.value) }, { quiet: true });
    if ('startOpacity' in target.dataset) return updateSettings({ startCardOpacity: Number(target.value) }, { quiet: true });
    if ('startRandom' in target.dataset) return updateSettings({ animationRandom: target.checked }, { quiet: true });
    if ('startInterval' in target.dataset) { startBackgroundChangedAt = Date.now(); return updateSettings({ animationInterval: Number(target.value) }, { quiet: true }); }
    if (target.closest('#workspace .view-mount')) return views[state.view]?.onChange?.(event);
    return undefined;
  });

  root.addEventListener('input', (event) => {
    const target = event.target;
    if (target.id === 'agent-search') { state.agentQuery = target.value; clearTimeout(bindEvents.searchTimer); bindEvents.searchTimer = setTimeout(renderLeftAgents, 120); }
    if ('startSpeed' in target.dataset) { target.parentElement.querySelector('output').textContent = `${target.value}%`; state.settings.animationSpeed = Number(target.value); }
    if ('startOpacity' in target.dataset) { target.parentElement.querySelector('output').textContent = `${target.value}%`; root.querySelector('.start-inner')?.style.setProperty('--start-card-alpha', `${target.value}%`); }
  });

  root.addEventListener('keydown', (event) => { if (event.target.closest?.('#workspace .view-mount')) views[state.view]?.onKey?.(event); });

  const sliderStep = (button) => {
    const input = button.parentElement.querySelector('input[type="range"]');
    if (!input) return false;
    const before = input.value;
    input.value = String(Math.max(Number(input.min), Math.min(Number(input.max), Number(input.value) + Number(button.dataset.sliderStep) * Number(input.step || 1))));
    if (input.value === before) return false;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };
  root.addEventListener('pointerdown', (event) => {
    const button = event.target.closest?.('[data-slider-step]');
    if (button && event.button === 0 && !button.disabled) {
      event.preventDefault();
      if (!sliderStep(button)) return;
      let timer = setTimeout(function again() { if (sliderStep(button)) timer = setTimeout(again, 90); }, 420);
      const stop = () => { clearTimeout(timer); window.removeEventListener('pointerup', stop, true); };
      window.addEventListener('pointerup', stop, true);
      return;
    }
    const split = event.target.closest?.('#left-panel > .left-split');
    if (!split || event.button !== 0) return;
    event.preventDefault();
    const panel = split.parentElement;
    const start = Math.round(panel.querySelector(':scope > .left-view')?.getBoundingClientRect().height ?? state.settings.leftViewHeight);
    const max = () => Math.max(SIDE_MIN, panel.getBoundingClientRect().height - TREE_MIN);
    pointerDrag(event, {
      cursor: 'row-resize',
      move: (dx, dy) => { const h = Math.round(Math.max(SIDE_MIN, Math.min(max(), start - dy))); root.style.setProperty('--left-view-height', `${h}px`); state.settings.leftViewHeight = h; },
      end: (e, moved) => { if (moved) updateSettings({ leftViewHeight: state.settings.leftViewHeight }, { quiet: true }); },
    });
  });

  root.addEventListener('contextmenu', (event) => {
    const editable = event.target.closest('input:not([type="range"]):not([type="checkbox"]), textarea');
    if (editable) { event.preventDefault(); return textContextMenu(editable, event); }
    if (event.defaultPrevented) return undefined;
    event.preventDefault();
    const agentRow = event.target.closest('[data-agent-open]');
    if (agentRow) return contextMenu(event, 'agent', { id: agentRow.dataset.agentOpen });
    if (event.target.closest('#bottom-panel')) return contextMenu(event, 'bottom');
    if (event.target.closest('#left-panel, #right-panel')) return contextMenu(event, 'panel');
    if (event.target.closest('#start-page')) return contextMenu(event, 'start');
    if (event.target.closest('#statusbar')) return contextMenu(event, 'status');
    return contextMenu(event, 'default');
  });

  window.addEventListener('resize', frameThrottle(() => { fitToolbar(); if (desktop && state.minWidth && window.innerWidth < state.minWidth - 1) native.setMinimumSize(state.minWidth, 600).catch(() => {}); }));
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('storage', (event) => { if (event.key === STORAGE_KEY) { const previous = state.settings; state.settings = loadSettings(globalThis.localStorage); applySettings(previous); } });
  window.addEventListener('beforeunload', (event) => { if (!desktop && state.hasDoc && editor.dirty()) { event.preventDefault(); event.returnValue = ''; } });

  if (!desktop) {
    let depth = 0;
    const files = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');
    document.addEventListener('dragenter', (event) => { if (files(event)) { depth += 1; setDropActive(true); event.preventDefault(); } });
    document.addEventListener('dragover', (event) => { if (files(event)) event.preventDefault(); });
    document.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) setDropActive(false); });
    document.addEventListener('drop', (event) => { if (!files(event)) return; event.preventDefault(); depth = 0; setDropActive(false); handleDroppedFiles([...(event.dataTransfer?.files ?? [])]); });
  }

  setInterval(() => {
    const clock = root.querySelector('#status-clock');
    if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (['running', 'waiting'].includes(editor.live()?.status) && state.bottomTab === 'run') editor.renderRunPanel();
  }, 1000);
}

const SHORTCUTS = [
  ['n', false, 'newAgent'], ['n', true, 'describe'], ['o', false, 'open'], ['s', false, 'save'], ['w', false, 'closeAgent'], ['i', false, 'import'], ['e', false, 'exportAgent'], ['p', false, 'print'],
  ['z', false, 'undo'], ['y', false, 'redo'], ['z', true, 'redo'], ['enter', false, 'runAgent'], ['c', true, 'chat'], ['a', true, 'arrange'],
  [',', false, 'settings'], ['l', true, 'language'], ['!', true, 'leftPanel'], ['1', true, 'leftPanel'], ['@', true, 'rightPanel'], ['2', true, 'rightPanel'],
  ['q', false, 'exit'], ['h', true, 'startPage'], ['b', true, 'shuffleBackground'], ['j', false, 'bottomPanel'],
];

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  const editing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const mod = event.ctrlKey || event.metaKey;
  const onCanvas = onEditor() && (document.activeElement?.closest?.('.canvas-host') || document.activeElement === document.body);
  if (mod && !event.altKey) {
    if (editing && ['x', 'c', 'v', 'z', 'y', 'a'].includes(key)) return;
    if (!editing && onCanvas && ['c', 'v', 'd', 'a'].includes(key) && !event.shiftKey && editor.onKey(event)) { event.preventDefault(); return; }
    const shortcut = SHORTCUTS.find(([k, shift]) => k === key && shift === event.shiftKey);
    if (shortcut) { event.preventDefault(); event.stopPropagation(); run(shortcut[2]); }
    return;
  }
  if (key === 'f1') { event.preventDefault(); run('about'); return; }
  if (key === 'f2' && !editing) { event.preventDefault(); run('renameAgent'); return; }
  if (key === 'f5') { event.preventDefault(); run(event.shiftKey ? 'stopRun' : 'refresh'); return; }
  if (editing) { if (key === 'escape') event.target.blur(); return; }
  if (onCanvas) {
    if (key === 'a' && !event.shiftKey) { event.preventDefault(); run('addNode'); return; }
    if (editor.onKey(event)) event.preventDefault();
  }
}

function bindPopupActions() {
  popups.on('error', (error) => showError('error.unexpected', error));
  popups.on('report-error', (data) => showError(data.titleKey ?? 'error.unexpected', Object.assign(new Error(data.message), { stack: data.detail ?? '' }), data.context ?? ''));
  popups.on('print-content', () => {
    const content = gatherPrintContent({ doc: () => (state.hasDoc ? editor.doc() : null), run: () => editor.state.shown ?? editor.live(), t, language: lang });
    popups.post('print', { type: 'print-content', content });
  });
  popups.on('choose-background', () => chooseBackground());
  popups.on('clear-background', () => removeBackground());
  popups.on('shuffle-background', () => shuffleBackground());
  popups.on('notice', (data) => notify(data.kind ?? 'info', data.text));
  popups.on('catalogs-changed', () => { appApi.catalogsChanged(); if (state.view === 'models') views.models?.load?.(); });
  popups.on('open-settings', (data) => popups.open('settings', { tab: data.tab ?? 'general', themeGroup: data.themeGroup }));
  popups.on('show-start', () => showStartPage(true));
}

// ───────────────────────── start-up

const panelApi = { state, commands, commandTip, commandEnabled, t, coreReady, providers: PROVIDERS, settings: () => state.settings, version: () => state.info?.version ?? VERSION };

async function start() {
  renderShell();
  bindEvents();
  bindPopupActions();
  await popups.init();
  state.info = await native.appInfo().catch(() => null);
  state.instance = await native.instanceInfo().catch(() => ({ first: true, others: 0 }));
  if (state.settings.animationRandom) updateSettings({ animation: randomAnimation(state.settings.animation) }, { quiet: true });
  setInterval(tickStartBackground, 1000);
  native.setBackendLanguage(state.settings.language);
  applySettings({});
  await loadBackground();
  if (desktop) {
    appWindow.onCloseRequested(async (event) => {
      if (state.quitting) return;
      event.preventDefault();
      if (await confirmExit()) { state.quitting = true; events?.close(); await native.quitApp(); }
    });
    getCurrentWebview().onDragDropEvent((event) => {
      const { type } = event.payload;
      if (type === 'enter' || type === 'over') setDropActive(true);
      else if (type === 'leave') setDropActive(false);
      else if (type === 'drop') { setDropActive(false); handleDroppedPaths(event.payload.paths ?? []); }
    });
    native.listen('fatal-error', (fatal) => { const error = new Error(fatal.message); error.stack = [fatal.location, fatal.backtrace].join('\n'); showError('error.fatal', error, fatal.location); });
    native.listen('core-exited', (info) => { state.core = { status: 'error', info: null, error: info?.message ?? t('core.exited') }; renderAll(); });
  }
  trackMaximized();
  if (desktop) await appWindow.show();
  await connectCore({ quiet: true });
  await restoreSession();
  for (const path of await native.startupFiles().catch(() => [])) await handleDroppedPaths([path]);
  renderAll();
  const welcome = shouldOfferTutorial(state.settings, state.showStart) && !globalThis.__MYAGENTS_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome');
  if (welcome) openWelcome();
  if (desktop) {
    if (!welcome) await appWindow.setFocus();
    setTimeout(() => { popups.prewarm('menu').then(() => popups.prewarm('progress', { warm: true })); }, 400);
  }
}

/** The start offer: run the tutorial? Only while the start page shows (Settings › Start page turns it off). */
export function shouldOfferTutorial(s, showStart) { return Boolean(s.showWelcome) && Boolean(showStart); }

async function openWelcome() {
  const result = await popups.open('welcome', {});
  if (result?.choice === 'tutorial') runTutorial();
  else if (result?.choice === 'describe') describeAgent();
  else if (result?.choice === 'sample') fromTemplate('assistant');
}

/** The guided tour over the real window (ui/tutorial.js). */
function runTutorial() {
  let sample = null;
  return startTour({
    t, icon, escapeHtml,
    showStart: () => { if (!state.showStart) showStartPage(true); },
    openSample: async () => {
      if (state.showStart && state.hasDoc) { showStartPage(false); setView('editor'); return; }
      if (state.hasDoc) { if (state.view !== 'editor') setView('editor'); return; }
      sample = sample ?? (await openNew(await client.template('log-analyzer', lang())), editor.doc()?.id);
    },
    selectSecond: () => { const n = editor.doc()?.nodes?.[1]; if (n) { editor.state.canvas?.setSelection([n.id]); showRightTab('node'); } },
    showBottom: (tab) => { if (!state.settings.showBottomPanel) updateSettings({ showBottomPanel: true }); showBottomTab(tab); },
    onEnd: (done) => { updateSettings({ tutorialDone: state.settings.tutorialDone || done, tutorialOffered: true }, { quiet: true }); if (done) notify('success', t('tour.done')); },
  });
}

// Test hook: E2E suites and the smoke script drive the app through this.
window.__myagents = {
  state, t, commands, popups, run, api: client, editor, views,
  menus: { MENUS, SUBMENUS, enabled: (id) => commandEnabled(id) },
  actions: { openAgent, openNew, newAgent, fromTemplate, closeAgent, deleteAgent, importText, setView, showStartPage, updateSettings, connectCore, refreshAgents, showRightTab, showBottomTab, runTutorial, openWelcome, shouldOfferTutorial },
  startBackground: () => startBackground,
};

start()
  .catch((error) => showError('error.unexpected', error, 'start'))
  .finally(() => { if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {}); });
