// MyProductionFlow main window: menu bar (also the title bar), toolbar, the
// library (left), the 2D editor and the 3D view (centre, alone or side by
// side) with the run bar, the model explorer and properties (right), the
// bottom panel (statistics, charts, problems, event log, experiments) and the
// status bar.
//
// The shell (menus as popup windows, toolbar, panels, start page, settings,
// themes, progress popups, tutorial) follows MySketchBook; the simulation is in
// sim/, the 2D editor in editor/, the 3D view in view3d/.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import APP_ICON from '../assets/icon-256.png';
import { BLOCK_TYPES, CATEGORIES, baseOf, isPathType, isSd, typesIn, blockBounds } from './sim/blocks.js';
import { addLink, blockById, checkModel, clockText, cloneBlocks, countBySeverity, History, linkProblem, makeBlock, newId, normalizeModel, parseModel, referenceNames, removeBlocks, renameBlock, serializeModel, createModel } from './sim/model.js';
import { Simulation, resultValue, runModel } from './sim/engine.js';
import { compile } from './sim/expr.js';
import { createRandom, defaultDist, distMean, DISTRIBUTIONS } from './sim/random.js';
import { gridValues, patternSearch, scenarioFrom, sensitivityPlan, tornadoRows } from './sim/experiments.js';
import { AnimationRecorder, recordingSupported } from './ui/recorder.js';
import { buildReport, pickSections, REPORT_SECTIONS } from './report/content.js';
import { toDocx, toHtml, toMarkdown, toPdf } from './report/writers.js';
import { TEMPLATES, buildTemplate, SAMPLE_GROUPS, SAMPLE_PROJECTS, buildSample } from './sim/samples.js';
import { Canvas2D, fmt } from './editor/canvas2d.js';
import { View3D } from './view3d/view3d.js';
import { ANIMATIONS, loadSettings, PANEL_MIN, RECENT_DIRS_KEY, RECENT_KEY, SESSION_KEY, STORAGE_KEY, storeSettings } from './domain/settings.js';
import { addRecent, loadRecent, loadRecentDirs, removeRecent, storeRecent, storeRecentDirs } from './domain/recent.js';
import { baseName, directoryOf, fileSafe, withExtension } from './domain/paths.js';
import { switchFlag } from './flags.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { PopupHost } from './platform/popups.js';
import { applyFont, applyTheme, CUSTOM, DARK_THEMES, LIGHT_THEMES, resolveTheme, SYSTEM, themeName } from './themes.js';
import { escapeHtml, frameThrottle, isMac, keyLabel, pointerDrag } from './ui/dom.js';
import { AnimatedBackground } from './ui/background.js';
import { startPageHtml } from './ui/startpage.js';
import { startBoard } from './ui/startboard.js';
import { STEPS as TUTORIAL_STEPS, Tutorial } from './ui/tutorial.js';
import { PROGRESS_ICONS, PROGRESS_NAME_ICONS } from './ui/progressicons.js';
import { DOC_KINDS, docLabel, docWindowTitle } from './domain/helpdocs.js';
import { BOTTOM_TABS, adviceHtml, bottomTabsHtml, chartsHtml, diagnosisHtml, experimentsHtml, explorerHtml, libraryHtml, liveHtml, logHtml, problemsHtml, propertiesHtml, refNamesDatalist, statsHtml, typeName } from './ui/panels.js';
import { diagnose } from './sim/diagnose.js';
import { fmtNum, lineChart, pct } from './ui/charts.js';

const root = document.querySelector('#app');
const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const popups = new PopupHost();
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
const lang = () => (getLanguage() === 'en' ? 'en' : 'ko');

const state = {
  settings: loadSettings(globalThis.localStorage),
  recent: loadRecent(globalThis.localStorage),
  recentDirs: loadRecentDirs(globalThis.localStorage),
  doc: null,
  showStart: false,
  selection: [],
  tool: 'select',
  placing: null,
  notice: null,
  info: null,
  openMenu: null,
  lastMenuClose: { name: null, at: 0 },
  quitting: false,
  untitled: 0,
  minWidth: 0,
  maximized: false,
  clipboard: null,
  dynamicMenus: new Map(),
  libraryCategory: 'all',
  libraryQuery: '',
  explorerQuery: '',
  collapsed: new Set(),
  closedSections: new Set(),
  problems: [],
  problemFilter: 'all',
  log: [],
  sim: null,
  simStatus: 'idle', // idle | running | paused | finished
  speed: 4,
  results: null,
  issues: null,
  appliedFixes: new Set(),
  experiment: null,
  lastExperiment: null,
  pointer: null,
  bottomTab: 'stats',
};

const doc = () => state.doc;
const model = () => state.doc?.model ?? null;
const hasDoc = () => Boolean(state.doc) && !state.showStart;
const running = () => state.simStatus === 'running' || state.simStatus === 'paused';
/** Structure can be edited when no run is going on (a finished run is discarded by the first edit). */
const canEdit = () => hasDoc() && !running();

// ───────────────────────── notices & errors

let noticeTimer = 0;
function notify(kind, text, detail = '') {
  state.notice = { kind, text, at: Date.now() };
  state.log.push({ kind: kind === 'error' ? 'error' : 'note', text, detail, at: new Date().toLocaleTimeString() });
  if (state.log.length > 500) state.log.splice(0, 100);
  if (state.bottomTab === 'log') renderBottom();
  renderStatus();
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { state.notice = null; renderStatus(); }, kind === 'error' ? 12000 : 6000);
}

function formatError(error) {
  const text = native.errorText(error);
  return { message: text, detail: error?.stack && !String(error.stack).startsWith(text) ? error.stack : error?.stack?.split('\n').slice(1).join('\n') ?? '' };
}

function showError(titleKey, error, context = '') {
  const { message, detail } = formatError(error);
  console.error(titleKey, error);
  notify('error', `${t(titleKey)}: ${message}`, [context, detail].filter(Boolean).join('\n'));
  const info = state.info;
  return popups.open('error', {
    title: t(titleKey), message, detail: detail ?? '', context, time: new Date().toLocaleString(),
    app: info ? `${info.name} ${info.version} (${info.web ? 'web' : `${info.os}/${info.arch}`}, ${info.commit})` : `MyProductionFlow ${VERSION}`,
  });
}

window.addEventListener('error', (event) => { if (event.error || event.message) showError('error.unexpected', event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}` : ''); });
window.addEventListener('unhandledrejection', (event) => showError('error.unexpected', event.reason));

// ───────────────────────── documents (one model at a time)

class Doc {
  constructor(m, { path = null, name = null, handle = null } = {}) {
    this.id = newId('doc');
    this.model = m;
    this.history = new History(m);
    this.path = path; this.name = name; this.handle = handle;
    this.revision = 0; this.savedRevision = 0;
  }
  get dirty() { return this.revision !== this.savedRevision; }
  markSaved() { this.savedRevision = this.revision; }
}

const docName = (d = doc()) => (d ? (d.path ? baseName(d.path) : d.name ?? (d.model.name || t('tabs.untitled', { n: 1 }))) : '');
function untitledName() { state.untitled += 1; return t('tabs.untitled', { n: state.untitled }); }

function setDoc(d) {
  stopRun({ quiet: true });
  state.doc = d;
  state.selection = [];
  state.results = null;
  state.issues = null;
  state.appliedFixes = new Set();
  state.experiment = null;
  state.showStart = !d;
  state.speed = d?.model.settings.speed ?? state.settings.defaultSpeed;
  renderAll();
  if (d) {
    view3d?.setModel(d.model);
    requestAnimationFrame(() => {
      layoutViews();
      // Once the panes have their size: frame the model in both views.
      setTimeout(() => { if (state.doc !== d) return; canvas?.resize(); view3d?.resize(); canvas?.fit(); view3d?.fit(); }, 80);
    });
    runProblems();
  }
  persistSession();
}

function newProject(templateId = 'blank') {
  const m = templateId === 'blank' ? createModel('') : buildTemplate(templateId, '');
  if (templateId === 'blank') m.settings.timeUnit = state.settings.defaultTimeUnit;
  const d = new Doc(m, { name: untitledName() });
  setDoc(d);
  return d;
}

async function confirmReplace() {
  if (!doc()?.dirty) return true;
  const choice = await ask({ icon: 'save', title: t('confirm.replaceTitle'), message: t('confirm.replaceMessage'), items: [docName()], buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }] });
  if (choice === 'save') return saveDoc();
  return choice === 'discard';
}
async function newProjectAsk(templateId = 'blank') { if (await confirmReplace()) newProject(templateId); }
async function openSampleAsk(id) {
  if (!(await confirmReplace())) return null;
  const s = SAMPLE_PROJECTS.find((x) => x.id === id);
  const m = buildSample(id);
  if (!m) return null;
  m.name = s[lang()][0];
  const d = new Doc(m, { name: `${s[lang()][0]}.mpf` });
  setDoc(d);
  notify('success', t('notice.sampleOpened', { name: s[lang()][0] }));
  return d;
}

function persistSession() {
  try { globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify({ files: doc()?.path ? [doc().path] : [] })); } catch { /* private mode */ }
}

// ───────────────────────── changes (undo / redo)

/** Applies `mutate(model)` as one undo step. Ends a finished run first (its results stay in the panels). */
function change(labelKey, mutate) {
  const d = doc();
  if (!d) return;
  if (running()) { notify('warning', t('notice.stopToEdit')); return; }
  if (state.simStatus === 'finished') stopRun({ quiet: true, keepResults: true });
  mutate(d.model);
  commit(labelKey);
}
/** Live changes while dragging (no undo step until commit). */
function live(mutate) {
  const d = doc();
  if (!d || running()) return;
  if (state.simStatus === 'finished') stopRun({ quiet: true, keepResults: true });
  mutate(d.model);
  canvas.dirty = true;
  view3d?.setModel(d.model);
}
function commit(labelKey = 'op.edit') {
  const d = doc();
  if (!d) return;
  if (d.history.push(d.model, labelKey)) { d.revision += 1; }
  afterChange();
}
function afterChange() {
  const m = model();
  if (!m) return;
  state.selection = state.selection.filter((id) => m.blocks.some((b) => b.id === id) || m.links.some((l) => l.id === id));
  canvas.dirty = true;
  view3d?.setModel(m);
  view3d?.setSelection(state.selection);
  scheduleProblems();
  renderTitleProject();
  renderRight();
  renderToolbarState();
  renderStatus();
}
function undo() { const d = doc(); if (!d || running()) return; const m = d.history.undo(); if (!m) return; d.model = normalizeModel(m); d.revision += 1; afterChange(); notify('info', t('notice.undo', { op: t(d.history.labels[d.history.index + 1] || 'op.edit') })); }
function redo() { const d = doc(); if (!d || running()) return; const m = d.history.redo(); if (!m) return; d.model = normalizeModel(m); d.revision += 1; afterChange(); notify('info', t('notice.redo', { op: t(d.history.undoLabel || 'op.edit') })); }

// ───────────────────────── selection and editing

function setSelection(ids) {
  state.selection = [...new Set(ids)];
  if (canvas) canvas.dirty = true;
  view3d?.setSelection(state.selection);
  renderRight();
  renderToolbarState();
  renderStatus();
}
const selectedBlocks = () => state.selection.map((id) => blockById(model(), id)).filter(Boolean);
const sel = () => hasDoc() && state.selection.length > 0;

function placeBlock(type, x, y, extra = {}) {
  if (!canEdit()) { notify('warning', t('notice.stopToEdit')); return null; }
  const before = selectedBlocks();
  let created = null;
  change('op.add', (m) => {
    created = makeBlock(m, type, x, y, extra);
    if (isSd(type)) created.name = created.name.replace(/\s+/g, '');
    m.blocks.push(created);
    // Quick connect: placing next to one selected block links its free output to the new block.
    const prev = before.length === 1 ? m.blocks.find((b) => b.id === before[0].id) : null;
    if (prev && !isSd(prev.type) && !isSd(type) && BLOCK_TYPES[type].ins && state.settings.showPorts) {
      const outs = typeof BLOCK_TYPES[prev.type].outs === 'string' ? Number(prev.props[BLOCK_TYPES[prev.type].outs]) : BLOCK_TYPES[prev.type].outs;
      for (let port = 0; port < outs; port++) {
        if (BLOCK_TYPES[prev.type].optionalOuts?.includes(port)) continue;
        if (m.links.some((l) => l.from.block === prev.id && l.from.port === port)) continue;
        if (!linkProblem(m, { block: prev.id, port }, { block: created.id, port: 0 })) { addLink(m, { block: prev.id, port }, { block: created.id, port: 0 }); state.autoLinked = prev.name; }
        break;
      }
    }
  });
  if (created) {
    setSelection([created.id]);
    if (state.autoLinked) { notify('success', t('notice.autoLinked', { from: state.autoLinked, to: created.name })); state.autoLinked = null; }
    else notify('info', t('notice.placed', { name: created.name }));
  }
  renderLeft();
  return created;
}

function startPlacing(type) {
  if (!hasDoc()) { notify('info', t('notice.openFirst')); return; }
  if (!canEdit()) { notify('warning', t('notice.stopToEdit')); return; }
  if (state.settings.viewMode === '3d') setViewMode('split');
  state.placing = type;
  canvas.startPlace(type);
  notify('info', t(isPathType(type) ? 'notice.placePath' : 'notice.place', { name: typeName(type) }));
  renderLeft();
}

/** Connects two blocks (from the canvas: a port drag or the connect tool). */
function connect(from, to) {
  const m = model();
  const a = blockById(m, from.block); const b = blockById(m, to.block);
  if (!a || !b) return;
  let kind = 'flow'; let fromRef = { ...from }; let toRef = { ...to };
  const ba = baseOf(a.type); const bb = baseOf(b.type);
  if (isSd(a.type) || isSd(b.type) || bb === 'display') {
    if ((ba === 'stock' && bb === 'flow') || (ba === 'flow' && bb === 'stock')) { fromRef = { block: a.id, port: ba === 'flow' ? 0 : -1 }; toRef = { block: b.id, port: bb === 'flow' ? 0 : -1 }; }
    else { kind = 'influence'; fromRef = { block: a.id, port: -1 }; toRef = { block: b.id, port: -1 }; }
  } else {
    if (fromRef.port < 0) {
      const outs = typeof BLOCK_TYPES[a.type].outs === 'string' ? Number(a.props[BLOCK_TYPES[a.type].outs]) : BLOCK_TYPES[a.type].outs;
      let port = 0;
      for (let p = 0; p < outs; p++) if (!m.links.some((l) => l.from.block === a.id && l.from.port === p) && !BLOCK_TYPES[a.type].optionalOuts?.includes(p)) { port = p; break; }
      fromRef.port = outs ? port : 0;
    }
    if (toRef.port < 0) {
      const ins = typeof BLOCK_TYPES[b.type].ins === 'string' ? Number(b.props[BLOCK_TYPES[b.type].ins]) : BLOCK_TYPES[b.type].ins;
      let port = 0;
      for (let p = 0; p < ins; p++) if (!m.links.some((l) => l.to.block === b.id && l.to.port === p)) { port = p; break; }
      toRef.port = port;
    }
  }
  const problem = linkProblem(m, fromRef, toRef, kind);
  if (problem) { notify('warning', t(problem)); return; }
  let link = null;
  change('op.connect', (mm) => { link = addLink(mm, fromRef, toRef, kind); });
  if (link) { setSelection([link.id]); notify('success', t('notice.connected', { from: a.name, to: b.name })); }
}

async function deleteSelection() {
  if (!state.selection.length || !canEdit()) return;
  const n = state.selection.length;
  change('op.delete', (m) => removeBlocks(m, state.selection));
  setSelection([]);
  notify('info', t('notice.deleted', { n }));
}

function duplicateSelection() {
  const blocks = selectedBlocks();
  if (!blocks.length || !canEdit()) return;
  let copies = [];
  change('op.duplicate', (m) => { copies = cloneBlocks(m, blocks, m.links.filter((l) => blocks.some((b) => b.id === l.from.block) && blocks.some((b) => b.id === l.to.block)), 2, 2); });
  setSelection(copies.map((b) => b.id));
}

function copySelection() {
  const m = model();
  const blocks = selectedBlocks();
  if (!blocks.length) return;
  const ids = new Set(blocks.map((b) => b.id));
  state.clipboard = JSON.parse(JSON.stringify({ blocks, links: m.links.filter((l) => ids.has(l.from.block) && ids.has(l.to.block)) }));
  native.clipboardWrite?.(JSON.stringify({ myproductionflow: state.clipboard })).catch(() => {});
  notify('info', t('notice.copied', { n: blocks.length }));
}
function pasteClipboard() {
  const clip = state.clipboard;
  if (!clip || !canEdit()) return;
  const cx = clip.blocks.reduce((s, b) => s + b.x, 0) / clip.blocks.length; const cy = clip.blocks.reduce((s, b) => s + b.y, 0) / clip.blocks.length;
  const at = state.pointer ?? [cx + 3, cy + 3];
  let copies = [];
  change('op.paste', (m) => { copies = cloneBlocks(m, clip.blocks, clip.links, Math.round(at[0] - cx), Math.round(at[1] - cy)); });
  setSelection(copies.map((b) => b.id));
}

function rotateSelection(deg = 90) {
  const blocks = selectedBlocks().filter((b) => !isPathType(b.type));
  if (!blocks.length || !canEdit()) return;
  change('op.rotate', (m) => { for (const b of blocks) { const x = blockById(m, b.id); x.rot = (((x.rot ?? 0) + deg) % 360 + 360) % 360; } });
}

function nudge(dx, dy) {
  const blocks = selectedBlocks();
  if (!blocks.length || !canEdit()) return;
  change('op.move', (m) => { for (const b of blocks) { const x = blockById(m, b.id); x.x += dx; x.y += dy; } });
}

function align(kind) {
  const blocks = selectedBlocks();
  if (blocks.length < 2 || !canEdit()) return;
  const boxes = blocks.map((b) => ({ b, q: blockBounds(b) }));
  const x0 = Math.min(...boxes.map((x) => x.q.x0)); const x1 = Math.max(...boxes.map((x) => x.q.x1));
  const y0 = Math.min(...boxes.map((x) => x.q.y0)); const y1 = Math.max(...boxes.map((x) => x.q.y1));
  change('op.align', (m) => {
    const sorted = [...boxes].sort((a, b) => (kind === 'distributeV' ? a.b.y - b.b.y : a.b.x - b.b.x));
    sorted.forEach(({ b, q }, i) => {
      const x = blockById(m, b.id); const hw = (q.x1 - q.x0) / 2; const hh = (q.y1 - q.y0) / 2;
      if (kind === 'alignLeft') x.x = x0 + hw; if (kind === 'alignRight') x.x = x1 - hw; if (kind === 'alignCenter') x.x = (x0 + x1) / 2;
      if (kind === 'alignTop') x.y = y0 + hh; if (kind === 'alignBottom') x.y = y1 - hh; if (kind === 'alignMiddle') x.y = (y0 + y1) / 2;
      if (kind === 'distributeH' && sorted.length > 2) x.x = sorted[0].b.x + ((sorted[sorted.length - 1].b.x - sorted[0].b.x) * i) / (sorted.length - 1);
      if (kind === 'distributeV' && sorted.length > 2) x.y = sorted[0].b.y + ((sorted[sorted.length - 1].b.y - sorted[0].b.y) * i) / (sorted.length - 1);
    });
  });
}

async function renameSelected() {
  const b = selectedBlocks()[0];
  if (!b || !canEdit()) return;
  const value = await prompt({ title: t('action.rename'), label: t('prop.name'), value: b.name });
  if (value != null) renameTo(b, value);
}
function renameTo(b, value) {
  const m = model();
  const name = String(value).trim();
  if (!name || name === b.name) return;
  if (m.blocks.some((x) => x !== b && x.name === name)) { notify('warning', t('notice.nameTaken', { name })); renderRight(); return; }
  if (isSd(b.type) && !/^[A-Za-z_À-￿][A-Za-z0-9_À-￿]*$/.test(name)) { notify('warning', t('notice.sdName')); renderRight(); return; }
  change('op.rename', (mm) => renameBlock(mm, b.id, name));
}

async function prompt({ title, label, value = '' }) {
  const result = await popups.open('prompt', { title, label, value });
  return result?.value ?? null;
}
async function ask(params) { const result = await popups.open('confirm', params); return result?.choice ?? 'cancel'; }

// ───────────────────────── problems (model check)

let problemsTimer = 0;
function scheduleProblems(delay = 300) {
  clearTimeout(problemsTimer);
  if (!state.settings.autoCheck) return;
  problemsTimer = setTimeout(runProblems, delay);
}
function runProblems() {
  const m = model();
  state.problems = m ? checkModel(m) : [];
  if (state.bottomTab === 'problems') renderBottom();
  renderBottomTabs();
  renderStatus();
}

// ───────────────────────── running the model

let canvas = null;
let view3d = null;
let lastFrame = 0;
let lastPanelUpdate = 0;

function ensureSim() {
  if (state.sim && state.simStatus !== 'finished') return state.sim;
  const m = model();
  const errors = checkModel(m).filter((p) => p.severity === 'error');
  state.problems = checkModel(m);
  if (errors.length) {
    state.bottomTab = 'problems';
    if (!state.settings.showBottomPanel) updateSettings({ showBottomPanel: true }, { quiet: true });
    renderAll();
    notify('error', t('notice.modelErrors', { n: errors.length }));
    return null;
  }
  const sim = new Simulation(normalizeModel(JSON.parse(JSON.stringify(m))), { onLog: (entry) => { state.log.push(entry); if (state.log.length > 800) state.log.splice(0, 200); } });
  sim.cycleSamples = [];
  state.sim = sim;
  state.results = null;
  state.log = state.log.filter((l) => l.kind === 'note' || l.kind === 'error');
  sim.start();
  view3d?.setModel(m);
  return sim;
}

function setStatus(status) {
  state.simStatus = status;
  root.classList.toggle('sim-running', status === 'running' || status === 'paused');
  renderToolbarState();
  renderRunBar();
  renderLeft();
  renderRight();
  renderStatus();
}

function runPause() {
  if (!hasDoc()) return;
  if (state.simStatus === 'running') { setStatus('paused'); notify('info', t('notice.paused')); return; }
  if (!ensureSim()) return;
  lastFrame = performance.now();
  setStatus('running');
  if (state.settings.showBottomPanel && !['stats', 'charts'].includes(state.bottomTab)) { state.bottomTab = 'stats'; renderBottomTabs(); }
}

function stepOnce() {
  if (!hasDoc()) return;
  const sim = ensureSim();
  if (!sim) return;
  if (state.simStatus !== 'paused') setStatus('paused');
  const next = sim.events.peek();
  if (next) sim.runUntil(next.time, 1);
  updateLive(true);
}

function stopRun({ quiet = false, keepResults = false } = {}) {
  const had = Boolean(state.sim);
  if (state.sim && !keepResults) state.results = state.simStatus === 'finished' ? state.results : state.sim.results();
  state.sim = null;
  state.simStatus = 'idle';
  root.classList.remove('sim-running');
  if (canvas) canvas.dirty = true;
  view3d?.update(null);
  if (!quiet && had) notify('info', t('notice.stopped'));
  renderToolbarState(); renderRunBar(); renderLeft(); renderRight(); renderStatus();
}

/** Runs to the end as fast as possible, in slices so the window stays alive, with a progress window for long runs. */
async function runToEnd() {
  if (!hasDoc()) return;
  const sim = ensureSim();
  if (!sim) return;
  setStatus('paused');
  const started = performance.now();
  await withProgress('progress.run', model().name || docName(), async (op, report, signal) => {
    while (!sim.done && !signal.cancelled) {
      const until = performance.now() + 40;
      while (!sim.done && performance.now() < until) sim.runUntil(Math.min(sim.end, sim.now + sim.end / 200), 20000);
      report({ fraction: sim.now / sim.end, text: t('progress.runText', { time: fmtNum(sim.now), end: fmtNum(sim.end), unit: model().settings.timeUnit, events: sim.eventCount.toLocaleString() }) });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }, { delay: 400, cancellable: true });
  if (sim.done) finishRun(); else updateLive(true);
  notify('success', t('notice.ranToEnd', { s: ((performance.now() - started) / 1000).toFixed(1) }));
}

function finishRun() {
  const sim = state.sim;
  if (!sim) return;
  sim.record();
  state.results = sim.results();
  state.issues = diagnose(model(), state.results);
  // After a run the diagnosis is what the user wants: the problems found and how to fix them.
  state.bottomTab = 'diagnosis';
  if (!state.settings.showBottomPanel) updateSettings({ showBottomPanel: true }, { quiet: true });
  setStatus('finished');
  renderAll();
  layoutViews();
  updateLive(true);
  notify('success', t('notice.finished', { completed: state.results.kpi.completed, throughput: fmtNum(state.results.kpi.throughput, 3), unit: model().settings.timeUnit }));
}

function setSpeed(v) {
  state.speed = Math.max(0.01, Math.min(100000, Number(v) || 1));
  if (model()) model().settings.speed = state.speed;
  renderRunBar();
  renderSpeedLabel();
}
/** The toolbar's current speed (between its − and + buttons). */
function renderSpeedLabel() {
  const el = root.querySelector('#toolbar [data-command="speedMenu"] [data-speed-label]');
  if (el) el.textContent = speedText(state.speed);
}
const speedText = (v) => `×${+Number(v).toFixed(2)}`;
/** Every speed in a menu below the toolbar's speed button. */
function speedMenu(anchor) {
  const handlers = {};
  const items = SPEEDS.map((v) => { handlers[`custom:speed:${v}`] = () => setSpeed(v); return { id: `custom:speed:${v}`, label: speedText(v), icon: 'speed', checked: Math.abs(v - state.speed) < 1e-9 }; });
  return showMenu(items, anchor ?? anchorBelow(root.querySelector('#toolbar [data-command="speedMenu"]') ?? root.querySelector('#toolbar')), 'context', { handlers, header: { icon: 'speed', title: t('action.speedMenu') } });
}
const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 4, 10, 30, 100, 300, 1000, 5000];
function speedStep(dir) { const i = SPEEDS.findIndex((s) => s >= state.speed - 1e-9); setSpeed(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? SPEEDS.length - 1 : i) + dir))]); }

/** The animation loop: advances a running model by real time × speed and draws both views. */
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!hasDoc()) return;
  const sim = state.sim;
  if (sim && state.simStatus === 'running') {
    sim.runUntil(sim.now + dt * state.speed, 400000);
    if (sim.done) finishRun();
  }
  const show2d = state.settings.viewMode !== '3d';
  const show3d = state.settings.viewMode !== '2d';
  if (show2d && canvas && (canvas.dirty || sim)) canvas.render(sim);
  if (show3d && view3d) { view3d.update(sim); view3d.render(); }
  if (sim && now - lastPanelUpdate > 400) { lastPanelUpdate = now; updateLive(false); }
}

/** Refreshes the run bar, the properties' live numbers and the bottom panel while a model runs. */
function updateLive(force) {
  renderRunBar();
  const sim = state.sim;
  if (!sim) return;
  if (sim.cycleSamples && sim.cycleSamples.length < 4000) {
    for (const n of sim.nodes.values()) if (n.base === 'sink' && n.cycle.n > (n.sampled ?? 0)) { sim.cycleSamples.push(n.cycle.mean); n.sampled = n.cycle.n; }
  }
  const timeEl = root.querySelector('#status-simtime');
  if (timeEl) timeEl.textContent = simTimeText();
  // Panels redraw only when the user is not typing in them.
  const active = document.activeElement;
  if (force || !root.querySelector('#right-panel')?.contains(active) || active === document.body) {
    const liveBox = root.querySelector('[data-live-box]');
    if (liveBox && state.selection.length === 1) liveBox.innerHTML = liveHtml(sim.nodes.get(state.selection[0])?.summary(sim.now), model());
    else if (force) renderRight();
    const tree = root.querySelector('.explorer-tree');
    if (tree && (force || Math.random() < 0.4)) renderExplorer();
  }
  if (state.settings.showBottomPanel && ['stats', 'charts', 'diagnosis'].includes(state.bottomTab)) {
    state.results = sim.results();
    if (state.bottomTab === 'diagnosis') state.issues = diagnose(model(), state.results);
    renderBottom();
  }
}

const simTimeText = () => {
  const sim = state.sim; const m = model();
  if (!m) return '';
  const now = sim?.now ?? 0;
  return `${fmtNum(now)} / ${fmtNum(m.settings.duration)} ${m.settings.timeUnit} · ${clockText(now, m.settings.timeUnit)}`;
};

// ───────────────────────── experiments

/** Numeric things an experiment can vary: block properties, distribution parameters, SD parameters, model settings. */
/** A property unit (time, length …) as text in the model's time unit. */
const unitOf = (unit, m) => ({ time: m.settings.timeUnit, length: 'm', speed: `m/${m.settings.timeUnit}`, perTime: `/${m.settings.timeUnit}` }[unit] ?? '');
function experimentParameters() {
  const m = model();
  const out = [];
  for (const b of m.blocks) {
    if (BLOCK_TYPES[b.type].cat === 'layout') continue;
    for (const p of BLOCK_TYPES[b.type].props) {
      if (p.when && !p.when(b.props)) continue;
      if (['digits', 'priority', 'opacity', 'min', 'max', 'firstAt', 'maxArrivals', 'outputs', 'inputs', 'period'].includes(p.key)) continue;
      if (p.type === 'number' || p.type === 'int') out.push({ key: `${b.id}|${p.key}`, label: `${b.name} · ${t(`prop.${p.key}`, null, p.key)}`, value: b.props[p.key], integer: p.type === 'int', min: p.min, unit: unitOf(p.unit, m) });
      if (p.type === 'dist' && b.props[p.key]?.type !== 'expression') for (const k of DISTRIBUTIONS[b.props[p.key].type] ?? []) if (k !== 'values' && k !== 'weights') out.push({ key: `${b.id}|${p.key}.${k}`, label: `${b.name} · ${t(`prop.${p.key}`, null, p.key)} · ${t(`dist.${k}`, null, k)}`, value: b.props[p.key][k], unit: ['shape', 'k', 'alpha', 'beta'].includes(k) ? '' : unitOf(p.unit, m) });
    }
  }
  return out;
}
function experimentMetrics() {
  const m = model();
  const out = ['throughput', 'completed', 'cycleMean', 'wipMean', 'cost', 'lost'].map((k) => ({ key: k, label: t(`metric.${k}`) }));
  for (const [name, kind] of referenceNames(m)) if (kind !== 'time' && name !== 't') out.push({ key: name, label: name });
  return out;
}
function setParam(m, key, value) {
  const [id, path] = key.split('|');
  const b = m.blocks.find((x) => x.id === id);
  if (!b) return;
  const [prop, sub] = path.split('.');
  const spec = BLOCK_TYPES[b.type].props.find((p) => p.key === prop);
  if (sub) b.props[prop] = { ...b.props[prop], [sub]: value };
  else b.props[prop] = spec?.type === 'int' ? Math.round(value) : value;
}

async function openExperiment() {
  if (!hasDoc()) return;
  if (running()) stopRun({ quiet: true });
  const errors = checkModel(model()).filter((p) => p.severity === 'error');
  const result = await popups.open('experiment', { parameters: experimentParameters(), metrics: experimentMetrics(), last: state.lastExperiment, notice: errors.length ? t('notice.modelErrors', { n: errors.length }) : '' });
  if (result?.config) runExperiment(result.config);
}

async function runExperiment(config) {
  const m = model();
  if (checkModel(m).some((p) => p.severity === 'error')) { notify('error', t('notice.modelErrors', { n: checkModel(m).filter((p) => p.severity === 'error').length })); return; }
  state.lastExperiment = config;
  if (config.kind === 'sensitivity' || config.kind === 'multiopt') { await runSearchExperiment(config); return; }
  const base = JSON.stringify(m);
  const xs = [];
  if (config.kind !== 'montecarlo') for (let x = config.from; x <= config.to + 1e-9 && xs.length < 200; x += Math.max(1e-9, config.step || 1)) xs.push(+x.toFixed(6));
  const jobs = config.kind === 'montecarlo' ? Array.from({ length: Math.max(2, config.runs) }, (_, i) => ({ x: null, rep: i })) : xs.flatMap((x) => Array.from({ length: Math.max(1, config.replications) }, (_, rep) => ({ x, rep })));
  const params = experimentParameters();
  const paramLabel = params.find((p) => p.key === config.parameter)?.label ?? '';
  const objLabel = experimentMetrics().find((x) => x.key === config.objective)?.label ?? config.objective;
  const runs = [];
  const started = performance.now();
  const ok = await withProgress('progress.experiment', model().name || docName(), async (op, report, signal) => {
    for (const [i, job] of jobs.entries()) {
      if (signal.cancelled) return false;
      const mm = normalizeModel(JSON.parse(base));
      if (job.x != null) setParam(mm, config.parameter, job.x);
      const { results } = runModel(mm, { seed: (mm.settings.seed || 1) + job.rep * 7919 });
      runs.push({ x: job.x, rep: job.rep, value: resultValue(results, config.objective) });
      report({ fraction: (i + 1) / jobs.length, text: t('progress.experimentText', { i: i + 1, n: jobs.length }) });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return true;
  }, { delay: 0, cancellable: true });
  if (!ok || !runs.length) { notify('warning', t('notice.experimentCancelled')); return; }
  const values = runs.map((r) => r.value).filter(Number.isFinite);
  const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, values.length - 1));
  let best = null;
  if (config.kind !== 'montecarlo') {
    for (const x of xs) { const v = runs.filter((r) => r.x === x).map((r) => r.value); const avg = v.reduce((a, b) => a + b, 0) / v.length; if (!best || (config.goal === 'minimize' ? avg < best.value : avg > best.value)) best = { x, value: avg }; }
    if (config.kind === 'variation') best = config.goal ? best : best;
  }
  state.experiment = { kind: config.kind, parameter: paramLabel, parameterKey: config.parameter, objective: objLabel, runs, mean, ci: (1.96 * sd) / Math.sqrt(values.length || 1), best: config.kind === 'optimize' ? best : config.kind === 'variation' ? best : null, seconds: (performance.now() - started) / 1000, goal: config.goal };
  state.bottomTab = 'experiments';
  if (!state.settings.showBottomPanel) updateSettings({ showBottomPanel: true }, { quiet: true });
  renderAll();
  notify('success', t('notice.experimentDone', { n: runs.length }));
}

/**
 * Sensitivity analysis (each chosen parameter low/high by ±percent: a tornado of the objective) and
 * multi-parameter optimization (pattern search over the grid of up to 4 parameters, within a run budget).
 */
async function runSearchExperiment(config) {
  const base = JSON.stringify(model());
  const params = experimentParameters();
  const objLabel = experimentMetrics().find((x) => x.key === config.objective)?.label ?? config.objective;
  const reps = Math.max(1, Math.round(Number(config.replications) || 1));
  const started = performance.now();
  let count = 0;
  // Mean of the objective over the replications with the given parameter values.
  const evaluate = (assign) => {
    const vals = [];
    for (let rep = 0; rep < reps; rep++) {
      const mm = normalizeModel(JSON.parse(base));
      for (const [key, v] of assign) setParam(mm, key, v);
      const { results } = runModel(mm, { seed: (mm.settings.seed || 1) + rep * 7919 });
      vals.push(resultValue(results, config.objective));
      count += 1;
    }
    const fin = vals.filter(Number.isFinite);
    return fin.length ? fin.reduce((a, b) => a + b, 0) / fin.length : NaN;
  };
  let exp = null;
  const ok = await withProgress('progress.experiment', model().name || docName(), async (op, report, signal) => {
    const tick = async (i, n) => { report({ fraction: i / n, text: t('progress.experimentText', { i, n }) }); await new Promise((resolve) => setTimeout(resolve, 0)); };
    if (config.kind === 'sensitivity') {
      const chosen = params.filter((p) => (config.sens ?? []).includes(p.key));
      if (!chosen.length) return false;
      const plan = sensitivityPlan(chosen, config.percent);
      const n = 1 + plan.length * 2; let i = 0;
      const baseValue = evaluate([]); await tick(++i, n);
      const rows = [];
      for (const r of plan) {
        if (signal.cancelled) return false;
        const lowValue = evaluate([[r.key, r.low]]); await tick(++i, n);
        const highValue = evaluate([[r.key, r.high]]); await tick(++i, n);
        rows.push({ ...r, lowValue, highValue });
      }
      exp = { kind: 'sensitivity', objective: objLabel, baseValue, percent: Number(config.percent) || 20, rows: tornadoRows(rows, baseValue) };
      return true;
    }
    const chosen = (config.multi ?? []).filter((a) => params.some((p) => p.key === a.parameter));
    if (!chosen.length) return false;
    const axes = chosen.map((a) => gridValues(a));
    const rnd = createRandom(model().settings.seed || 1);
    const res = await patternSearch({
      axes, goal: config.goal, budget: Math.max(2, Math.round(Number(config.budget) || 40)), random: () => rnd.next(),
      evaluate: async (values) => { const v = evaluate(values.map((x, k) => [chosen[k].parameter, x])); await new Promise((resolve) => setTimeout(resolve, 0)); return v; },
      onProgress: (i, n) => report({ fraction: i / n, text: t('progress.experimentText', { i, n }) }),
      cancelled: () => signal.cancelled,
    });
    if (!res.best) return false;
    exp = { kind: 'multiopt', objective: objLabel, goal: config.goal, params: chosen.map((a) => ({ key: a.parameter, label: params.find((p) => p.key === a.parameter)?.label ?? a.parameter })), best: res.best, history: res.history, evaluations: res.evaluations, space: res.space };
    return !signal.cancelled || Boolean(exp);
  }, { delay: 0, cancellable: true });
  if (!ok || !exp) { notify('warning', t('notice.experimentCancelled')); return; }
  state.experiment = { ...exp, runs: [], runCount: count, seconds: (performance.now() - started) / 1000 };
  state.bottomTab = 'experiments';
  if (!state.settings.showBottomPanel) updateSettings({ showBottomPanel: true }, { quiet: true });
  renderAll();
  notify('success', t('notice.experimentDone', { n: count }));
}

// ───────────────────────── recording and follow camera

let recorder = null;
/** Starts recording the visible views (2D and/or 3D, as laid out) or stops and saves the WebM video. */
async function toggleRecording() {
  if (recorder?.active) {
    const seconds = recorder.seconds;
    const blob = await recorder.stop();
    recorder = null;
    renderToolbarState(); renderRunBar();
    root.classList.remove('recording');
    if (!blob) { notify('warning', t('notice.recordEmpty')); return null; }
    notify('info', t('notice.recordStopped', { s: fmtNum(seconds, 1) }));
    await saveExport(`${safeName()}-animation.webm`, 'webm', new Uint8Array(await blob.arrayBuffer()), 'video/webm');
    return blob;
  }
  if (!recordingSupported()) { notify('error', t('notice.recordUnsupported')); return null; }
  const host = root.querySelector('#views');
  recorder = new AnimationRecorder({
    host,
    background: getComputedStyle(document.body).backgroundColor || '#ffffff',
    sources: () => {
      const mode = state.settings.viewMode; const out = [];
      if (mode !== '3d') out.push({ canvas: canvas.canvas, before: () => { if (canvas.dirty) canvas.render(state.sim); } });
      if (mode !== '2d' && view3d) out.push({ canvas: view3d.canvas, before: () => view3d.render() });
      return out;
    },
  });
  recorder.start();
  root.classList.add('recording');
  renderToolbarState(); renderRunBar();
  notify('info', t('notice.recordStarted'));
  if (state.simStatus === 'idle' || state.simStatus === 'paused') runPause();
  return true;
}

function toggleFollow() {
  if (!view3d) return;
  const on = view3d.setFollow(!view3d.follow);
  if (on && state.settings.viewMode === '2d') setViewMode('split');
  if (on && state.simStatus !== 'running') runPause();
  renderToolbarState(); renderRunBar();
  notify('info', t(on ? 'notice.followOn' : 'notice.followOff'));
}

/** Saves the finished run's KPIs as a scenario of this document (Simulation › Save scenario), to compare runs. */
function saveScenario() {
  const results = state.results;
  if (!results || !doc()) return;
  const list = (doc().scenarios ??= []);
  if (list.length >= 12) list.shift();
  const name = t('scenario.name', { n: (doc().scenarioCount = (doc().scenarioCount ?? 0) + 1) });
  list.push(scenarioFrom(name, results, model()));
  showBottom('experiments');
  notify('success', t('notice.scenarioSaved', { name }));
}

/** A fix from the diagnosis tab: changes the block's property (one undo step); the user runs again to see the effect. */
function applyFix(ref) {
  const [i, j] = ref.split(':').map(Number);
  const issue = state.issues?.[i]; const fix = issue?.fixes[j];
  if (!fix?.action) return;
  if (running()) { notify('warning', t('notice.stopToEdit')); return; }
  const { block, prop, value } = fix.action;
  change('op.applyFix', (m) => { const b = m.blocks.find((x) => x.name === block); if (b) b.props[prop] = structuredClone(value); });
  state.appliedFixes.add(`${issue.id}:${issue.block ?? ''}:${fix.key}`);
  notify('success', t('notice.fixApplied', { fix: t(`fix.${fix.key}`, fix.params) }));
  renderBottom();
}

function applyBest() {
  const ex = state.experiment;
  if (ex?.kind === 'multiopt' && ex.best) {
    change('op.applyBest', (m) => ex.params.forEach((p, k) => setParam(m, p.key, ex.best.values[k])));
    notify('success', t('notice.appliedBest', { param: ex.params.map((p) => p.label).join(', '), x: ex.best.values.map((v) => fmtNum(v, 4)).join(', ') }));
    return;
  }
  if (!ex?.best || !ex.parameterKey) return;
  change('op.applyBest', (m) => setParam(m, ex.parameterKey, ex.best.x));
  notify('success', t('notice.appliedBest', { param: ex.parameter, x: fmtNum(ex.best.x, 4) }));
}

// ───────────────────────── report

function reportHtml() {
  const m = model();
  const results = state.results ?? state.sim?.results();
  const sim = state.sim;
  const s = m.settings;
  const parts = [`<header class="report-title"><img src="${APP_ICON}" alt=""/><div><h1>${escapeHtml(m.name || docName())}</h1><p>${escapeHtml(t('report.generated', { date: new Date().toLocaleString() }))}</p></div></header>`];
  parts.push(`<section><h2>${escapeHtml(t('report.settings'))}</h2><table class="report-table"><tbody>
    <tr><th>${escapeHtml(t('model.duration'))}</th><td>${fmtNum(s.duration)} ${escapeHtml(s.timeUnit)}</td><th>${escapeHtml(t('model.warmup'))}</th><td>${fmtNum(s.warmup)} ${escapeHtml(s.timeUnit)}</td></tr>
    <tr><th>${escapeHtml(t('model.seed'))}</th><td>${results?.seed ?? s.seed}</td><th>${escapeHtml(t('report.blocks'))}</th><td>${m.blocks.length} · ${escapeHtml(t('explorer.links'))} ${m.links.length}</td></tr>
  </tbody></table>${m.description ? `<p>${escapeHtml(m.description)}</p>` : ''}</section>`);
  if (results) {
    parts.push(`<section><h2>${escapeHtml(t('report.results'))}</h2>${statsHtml(results, m)}</section>`);
    if (sim && sim.series.t.length > 1) {
      const charts = [...m.charts.map((c) => ({ title: c.title || c.series.join(', '), series: c.series })), ...(m.blocks.some((b) => b.type === 'sink') ? [{ title: t('charts.wip'), series: ['wip', 'completed'] }] : [])];
      parts.push(`<section><h2>${escapeHtml(t('report.charts'))}</h2>${charts.map((c) => `<div class="report-chart"><h3>${escapeHtml(c.title)}</h3>${lineChart(sim.series.t, c.series.map((k) => ({ name: k === 'wip' ? t('kpi.wip') : k === 'completed' ? t('kpi.completed') : k, values: sim.series.data.get(k) ?? [] })), { width: 760, height: 220, xLabel: s.timeUnit })}</div>`).join('')}</section>`);
    }
  } else parts.push(`<p>${escapeHtml(t('report.noRun'))}</p>`);
  if (state.experiment) parts.push(`<section><h2>${escapeHtml(t('bottom.experiments'))}</h2>${experimentsHtml(state.experiment, m)}</section>`);
  void adviceHtml;
  return parts.join('');
}

// ───────────────────────── report generator and print window (src/report/)

/** A picture of the 2D layout: the whole model fitted, without rulers or selection, on the canvas's paper colour. */
function layoutPicture() {
  if (!canvas) return null;
  const sel = state.selection;
  try { state.selection = []; return { src: canvas.capture(1600, 1000, state.sim, 'image/jpeg'), w: 1600, h: 1000 }; } catch { return null; } finally { state.selection = sel; }
}
function view3dPicture() {
  if (!view3d) return null;
  try { return { src: view3d.capture(1600, 1000, 'image/jpeg'), w: 1600, h: 1000 }; } catch { return null; }
}
/** A line chart of time series as a PNG (for the report). */
function chartPicture(title, times, series) {
  const W = 1100; const H = 420; const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  const L = 70; const R = W - 20; const T = 40; const B = H - 60;
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  if (!all.length || times.length < 2) return null;
  let lo = Math.min(0, ...all); let hi = Math.max(...all); if (hi === lo) hi = lo + 1;
  const t0 = times[0]; const t1 = times[times.length - 1] || 1;
  const X = (v) => L + ((v - t0) / (t1 - t0 || 1)) * (R - L); const Y = (v) => B - ((v - lo) / (hi - lo)) * (B - T);
  g.font = '600 18px system-ui, "Malgun Gothic", sans-serif'; g.fillStyle = '#111827'; g.fillText(title, L, 26);
  g.font = '13px system-ui, sans-serif'; g.strokeStyle = '#e5e7eb'; g.fillStyle = '#6b7280';
  for (let i = 0; i <= 4; i++) { const v = lo + ((hi - lo) * i) / 4; g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(R, Y(v)); g.stroke(); g.fillText(fmtNum(v, 2), 8, Y(v) + 4); }
  for (let i = 0; i <= 5; i++) { const v = t0 + ((t1 - t0) * i) / 5; g.fillText(fmtNum(v, 0), X(v) - 10, B + 18); }
  const colors = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#db2777'];
  series.forEach((s, k) => {
    g.strokeStyle = colors[k % colors.length]; g.lineWidth = 2.2; g.beginPath();
    s.values.forEach((v, i) => { if (!Number.isFinite(v)) return; const x = X(times[i]); const y = Y(v); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
    g.stroke();
    g.fillStyle = colors[k % colors.length]; g.fillRect(L + k * 180, H - 26, 14, 10); g.fillStyle = '#374151'; g.fillText(String(s.name).slice(0, 22), L + 20 + k * 180, H - 17);
  });
  g.fillStyle = '#6b7280'; g.fillText(model().settings.timeUnit, R - 30, B + 36);
  return { title, src: c.toDataURL('image/png'), w: W, h: H };
}
/** The report model with its pictures (content.js). */
function reportDocument() {
  const m = model();
  const results = state.results ?? state.sim?.results() ?? null;
  const sim = state.sim;
  const charts = [];
  if (sim && sim.series.t.length > 1) {
    const list = [...m.charts.map((c) => ({ title: c.title || c.series.join(', '), series: c.series })), ...(m.blocks.some((b) => b.type === 'sink') ? [{ title: t('charts.wip'), series: ['wip', 'completed'] }] : [])];
    for (const c of list.slice(0, 8)) {
      const pic = chartPicture(c.title, sim.series.t, c.series.map((k) => ({ name: k === 'wip' ? t('kpi.wip') : k === 'completed' ? t('kpi.completed') : k, values: sim.series.data.get(k) ?? [] })));
      if (pic) charts.push(pic);
    }
  }
  return buildReport({
    model: m, results, issues: results ? state.issues ?? diagnose(m, results) : null, experiment: state.experiment,
    images: { layout2d: layoutPicture(), view3d: view3dPicture() }, charts,
    t: (key, params) => t(key, params), fmt: (v, d = 2) => (Number.isFinite(Number(v)) ? fmtNum(Number(v), d) : '—'),
    docName: docName(), date: new Date().toLocaleString(),
  });
}

/**
 * The report for a window's opening parameters: pictures replaced by ids (img1, img2 …). Parameters travel through
 * localStorage, which holds a few megabytes; the pictures go to the window as a message when it asks ('report-images').
 */
function reportParams(doc) {
  const images = {}; let n = 0;
  const blocks = doc.blocks.map((b) => { if (b.t !== 'image') return b; n += 1; images[`img${n}`] = b.src; return { ...b, src: `img${n}` }; });
  state.reportImages = images;
  return { ...doc, blocks };
}

/** Simulation › Report (Ctrl+R): the report window — sections, preview, and saving as Markdown / HTML / Word / PDF / CSV. */
async function openReport() {
  if (!hasDoc()) return;
  if (!state.results && !state.sim) notify('info', t('notice.runFirst'));
  state.reportDoc = reportDocument();
  popups.open('report', { doc: reportParams(state.reportDoc), name: m0name(), sections: REPORT_SECTIONS });
}
/** Saves the report in a format: md | html | docx | pdf. */
async function saveReport(format, sections) {
  const doc = pickSections(state.reportDoc ?? reportDocument(), sections);
  const base = `${safeName()}-report`;
  try {
    if (format === 'md') return saveExport(`${base}.md`, 'md', toMarkdown(doc), 'text/markdown');
    if (format === 'html') return saveExport(`${base}.html`, 'html', toHtml(doc, lang()), 'text/html');
    if (format === 'docx') return saveExport(`${base}.docx`, 'docx', toDocx(doc), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    if (format === 'pdf') return saveExport(`${base}.pdf`, 'pdf', await toPdf(doc, state.settings.printSetup ?? {}), 'application/pdf');
  } catch (error) { showError('error.export', error, format); }
  return false;
}
/** File › Print (Ctrl+P): the print window — its own window with the printer, paper, pages and a preview. */
function openPrint() {
  if (!hasDoc()) return;
  state.reportDoc = reportDocument();
  popups.open('print', { doc: reportParams(state.reportDoc), name: m0name(), sections: REPORT_SECTIONS, setup: state.settings.printSetup ?? null });
}
const m0name = () => model()?.name || docName();

function resultsCsv() {
  const results = state.results ?? state.sim?.results();
  if (!results) return '';
  const keys = [...new Set(Object.values(results.blocks).flatMap((b) => Object.keys(b).filter((k) => typeof b[k] === 'number')))];
  const rows = [['block', 'type', ...keys].join(',')];
  for (const [name, b] of Object.entries(results.blocks)) rows.push([csv(name), b.type, ...keys.map((k) => (typeof b[k] === 'number' ? +b[k].toFixed(6) : ''))].join(','));
  rows.push('');
  rows.push('kpi,value');
  for (const [k, v] of Object.entries(results.kpi)) rows.push(`${k},${typeof v === 'number' ? +v.toFixed(6) : csv(v?.name ?? '')}`);
  for (const [k, v] of Object.entries(results.sd)) rows.push(`${csv(k)},${+v.value.toFixed(6)}`);
  return rows.join('\n');
}
const csv = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

function seriesCsv() {
  const sim = state.sim;
  if (!sim) return '';
  const keys = [...sim.series.data.keys()];
  const rows = [['time', ...keys.map(csv)].join(',')];
  sim.series.t.forEach((time, i) => rows.push([+time.toFixed(6), ...keys.map((k) => { const v = sim.series.data.get(k)[i]; return Number.isFinite(v) ? +v.toFixed(6) : ''; })].join(',')));
  return rows.join('\n');
}

function experimentCsv() {
  const ex = state.experiment;
  if (!ex) return '';
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  if (ex.kind === 'sensitivity') return [['parameter', 'base', 'low', 'high', 'objective at low', 'objective at high', 'swing'].join(','), ...ex.rows.map((r) => [q(r.label), r.base, r.low, r.high, r.lowValue, r.highValue, r.swing].join(','))].join('\n');
  if (ex.kind === 'multiopt') return [[...ex.params.map((p) => q(p.label)), q(ex.objective), 'best so far'].join(','), ...ex.history.map((h) => [...h.values, h.value, h.best].join(','))].join('\n');
  return [['x', 'replication', 'value'].join(','), ...ex.runs.map((r) => [r.x ?? '', r.rep, r.value].join(','))].join('\n');
}

// ───────────────────────── files

const safeName = () => fileSafe(model()?.name || docName().replace(/\.mpf$/i, '') || 'model');

function rememberRecent(entry) {
  state.recent = addRecent(loadRecent(globalThis.localStorage), entry);
  storeRecent(globalThis.localStorage, state.recent);
  if (!entry.web) rememberDirectory(directoryOf(entry.path));
}
function rememberDirectory(dir) {
  if (!dir) return;
  state.recentDirs = addRecent(loadRecentDirs(globalThis.localStorage), { path: dir });
  storeRecentDirs(globalThis.localStorage, state.recentDirs);
  if (state.settings.lastDirectory !== dir) updateSettings({ lastDirectory: dir }, { quiet: true });
}

async function openPath(path) {
  if (!(await confirmReplace())) return null;
  try {
    const text = await withProgress('progress.open', baseName(path), (op) => native.readTextFile(path, op));
    const m = parseModel(text);
    const d = new Doc(m, { path });
    setDoc(d);
    rememberRecent({ path, title: m.name });
    notify('success', t('notice.opened', { name: baseName(path) }));
    return d;
  } catch (error) { showError('error.open', error, path); return null; }
}

async function openContent(name, content, handle = null) {
  if (!(await confirmReplace())) return null;
  try {
    const text = typeof content === 'string' ? content : new TextDecoder().decode(content);
    const m = parseModel(text);
    const d = new Doc(m, { name, handle });
    setDoc(d);
    if (handle) native.storeWebHandle(name, handle);
    rememberRecent({ path: name, title: m.name, web: true });
    notify('success', t('notice.opened', { name }));
    return d;
  } catch (error) { showError('error.open', error, name); return null; }
}

async function openWithDialog(directory = null) {
  try {
    if (desktop) {
      const paths = await native.chooseDiagramsToOpen(directory ?? state.settings.lastDirectory);
      if (paths.length) await openPath(paths[0]);
    } else {
      const files = await native.pickDiagramFilesWeb();
      if (files[0]) await openContent(files[0].name, files[0].content, files[0].handle);
    }
  } catch (error) { showError('error.open', error); }
}

async function openRecent(path) {
  const item = state.recent.find((entry) => entry.path === path);
  if (item?.web || !desktop) {
    const handle = await native.loadWebHandle(path);
    if (handle?.getFile) {
      try { if ((await handle.queryPermission?.({ mode: 'read' })) !== 'granted') await handle.requestPermission?.({ mode: 'read' }); const file = await handle.getFile(); return openContent(file.name, await file.text(), handle); } catch (error) { return showError('error.open', error, path); }
    }
    return notify('info', t('notice.webRecent'));
  }
  const [exists] = await native.pathsExist([path]);
  if (!exists) {
    const choice = await ask({ icon: 'warning', title: t('recent.missingTitle'), message: t('recent.missingMessage', { path }), buttons: [{ id: 'keep', label: t('recent.keep') }, { id: 'remove', label: t('recent.removeEntry'), icon: 'trash', primary: true }] });
    if (choice === 'remove') { state.recent = removeRecent(state.recent, path); storeRecent(globalThis.localStorage, state.recent); renderAll(); }
    return null;
  }
  return openPath(path);
}

async function saveDoc({ saveAs = false } = {}) {
  const d = doc();
  if (!d) return false;
  const suggested = `${safeName()}.mpf`;
  try {
    const text = serializeModel(d.model);
    if (desktop) {
      let path = d.path;
      if (!path || saveAs) {
        const dir = d.path ? directoryOf(d.path) : state.settings.lastDirectory;
        path = await native.chooseSavePath(dir ? `${dir}/${suggested}` : suggested, ['mpf']);
        if (!path) return false;
        path = withExtension(path, 'mpf');
      }
      await withProgress('progress.save', baseName(path), (op) => native.writeTextFile(path, text, op));
      d.path = path; d.name = null;
      rememberRecent({ path, title: d.model.name });
    } else {
      const saved = await native.saveFileWeb(text, { name: d.name?.endsWith('.mpf') ? d.name : suggested, handle: d.handle, saveAs: saveAs || !d.handle, mime: 'application/json' });
      if (!saved) return false;
      d.handle = saved.handle; d.name = saved.name;
      if (saved.handle) native.storeWebHandle(saved.name, saved.handle);
      rememberRecent({ path: saved.name, title: d.model.name, web: true });
    }
    d.markSaved();
    persistSession();
    renderAll();
    notify('success', t('notice.saved', { name: docName(d) }));
    return true;
  } catch (error) { showError('error.save', error, d.path ?? docName(d)); return false; }
}

async function closeProject({ force = false } = {}) {
  if (!state.doc) return true;
  if (!force && !(await confirmReplace())) return false;
  stopRun({ quiet: true });
  state.doc = null;
  state.selection = [];
  state.showStart = true;
  persistSession();
  renderAll();
  return true;
}

/** Saves bytes or text the user exports (picture, CSV, HTML). */
async function saveExport(name, type, content, mime) {
  try {
    if (desktop) {
      const dir = doc()?.path ? directoryOf(doc().path) : state.settings.lastDirectory;
      const path = await native.chooseSavePath(dir ? `${dir}/${name}` : name, [type]);
      if (!path) return false;
      if (typeof content === 'string') await native.writeTextFile(withExtension(path, type), content, 'export');
      else await native.writeBase64File(withExtension(path, type), bytesToBase64(content), 'export');
      notify('success', t('notice.exported', { name: baseName(path) }));
    } else {
      await native.saveFileWeb(typeof content === 'string' ? new Blob([content], { type: mime }) : new Blob([content], { type: mime }), { name, saveAs: true, mime });
      notify('success', t('notice.exported', { name }));
    }
    return true;
  } catch (error) { showError('error.export', error, name); return false; }
}

function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const dataUrlBytes = (url) => { const bin = atob(url.split(',')[1]); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };

async function exportImage(which = null) {
  if (!hasDoc()) return;
  const use3d = which === '3d' || (which == null && state.settings.viewMode === '3d');
  const url = use3d ? view3d?.screenshot() : canvas.snapshot(state.sim);
  if (!url) return;
  await saveExport(`${safeName()}${use3d ? '-3d' : ''}.png`, 'png', dataUrlBytes(url), 'image/png');
}

function standaloneReport() {
  const css = [...document.styleSheets].map((sheet) => { try { return [...sheet.cssRules].map((r) => r.cssText).join('\n'); } catch { return ''; } }).join('\n');
  return `<!doctype html><html lang="${lang()}" data-theme="light"><head><meta charset="utf-8"><title>${escapeHtml(m0name())}</title><style>${css}\nbody{overflow:auto;background:#fff;color:#0f172a;padding:24px;user-select:text}</style></head><body><div class="report-page">${reportHtml()}</div></body></html>`;
}

// ───────────────────────── views (2D / 3D / split)

function setViewMode(mode) {
  updateSettings({ viewMode: mode }, { quiet: true });
  layoutViews();
  renderToolbarState();
  renderRunBar();
}

function layoutViews() {
  const host = root.querySelector('#views');
  if (!host) return;
  const mode = state.settings.viewMode;
  host.dataset.mode = mode;
  host.style.setProperty('--split', `${state.settings.splitRatio}%`);
  requestAnimationFrame(() => { canvas?.resize(); view3d?.resize(); if (canvas) canvas.dirty = true; });
}

function mountViews() {
  const host2d = root.querySelector('#view2d');
  canvas = new Canvas2D(host2d, {
    model, selection: () => state.selection, setSelection, canEdit: () => canEdit() || (state.simStatus === 'finished'),
    live, commit, change: (label, fn) => change(label, fn),
    placeBlock: (type, x, y, extra) => { placeBlock(type, x, y, extra); },
    connect, notify: (kind, key) => notify(kind, t(key)),
    onDropType: (type, x, y) => { if (!hasDoc()) return; placeBlock(type, x, y, isPathType(type) ? {} : {}); },
    onDoubleClick: (b) => { setSelection([b.id]); const input = root.querySelector('[data-rename]'); input?.focus(); input?.select(); },
    onContext: (event, hit) => canvasContextMenu(event, hit),
    onHover: () => {},
    onPointer: (x, y) => { state.pointer = [x, y]; const el = root.querySelector('#status-pointer'); if (el) el.textContent = `${x.toFixed(1)}, ${y.toFixed(1)} m`; },
    onView: () => { const el = root.querySelector('#status-zoom'); if (el) el.textContent = `${canvas.zoomPercent}%`; },
    onToolChange: (tool) => { state.tool = tool; state.placing = null; renderToolbarState(); renderLeft(); },
    tipFor: (b) => blockTip(b),
  });
  applyCanvasOptions();
  try {
    view3d = new View3D(root.querySelector('#view3d'), {
      onSelect: (ids, additive) => setSelection(additive ? [...state.selection, ...ids] : ids),
      onMove: (id, x, y) => change('op.move', (m) => { const b = blockById(m, id); if (b) { b.x = x; b.y = y; } }),
      onHover: () => {},
      canEdit: () => canEdit(),
    });
    applyViewOptions();
  } catch (error) {
    console.error('3D view', error);
    root.querySelector('#view3d').innerHTML = `<div class="bottom-empty">${icon('warning')}<span>${escapeHtml(t('error.webgl'))}: ${escapeHtml(error.message)}</span></div>`;
  }
  requestAnimationFrame((now) => { lastFrame = now; frame(now); });
}

function applyCanvasOptions() {
  if (!canvas) return;
  const s = state.settings;
  Object.assign(canvas.options, { grid: s.showGrid, rulers: s.showRulers, snap: s.snapStep, ports: s.showPorts, labels: s.showLabels, links: s.showLinks, heat: s.heatmap });
  canvas.readTheme();
  canvas.dirty = true;
}
function applyViewOptions() {
  if (!view3d) return;
  const s = state.settings;
  const theme = resolveTheme(s.theme, prefersDark(), s.customTheme);
  view3d.setTheme({ dark: theme.dark, background: theme.dark ? '#1f2329' : '#dfe6ee', accent: theme.colors.accent });
  view3d.setOptions({ shadows: s.view3dShadows, labels: s.view3dLabels, grid: s.showGrid, quality: s.view3dQuality });
}

function blockTip(b) {
  const sim = state.sim;
  const head = `<b>${escapeHtml(b.name)}</b> <span class="muted">${escapeHtml(typeName(b.type))}</span>`;
  if (!sim) return `${head}<br><span class="muted">${escapeHtml(t('tip.blockEdit'))}</span>`;
  const st = sim.blockState(b.id);
  if (!st) return head;
  const parts = [];
  if (st.state) parts.push(`${t('tip.state')}: ${t(`state.${st.state}`, null, st.state)}`);
  if (st.contents != null) parts.push(`${t('tip.contents')}: ${fmtNum(st.contents)}${st.capacity != null ? ` / ${st.capacity === Infinity ? '∞' : st.capacity}` : ''}`);
  if (st.count != null) parts.push(`${t('tip.count')}: ${st.count}`);
  if (st.utilization != null) parts.push(`${t('stat.statUtilization')}: ${pct(st.utilization)}`);
  if (st.value != null) parts.push(`${t('col.value')}: ${fmt(st.value)}`);
  if (st.counts) parts.push(st.states.map((s, i) => `${s.name}: ${st.counts[i]}`).join(' · '));
  return `${head}<br>${parts.map(escapeHtml).join('<br>')}`;
}

function zoomToSelection() {
  const blocks = selectedBlocks();
  if (!blocks.length) return canvas.fit();
  const q = blocks.map(blockBounds).reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }));
  canvas.fit({ x0: q.x0 - 6, y0: q.y0 - 6, x1: q.x1 + 6, y1: q.y1 + 6 });
  return undefined;
}

function canvasContextMenu(event, hit) {
  const point = toScreen(event.clientX, event.clientY);
  const anchor = { x: point.x + 1, y: point.y + 1, flipY: point.y };
  const handlers = {};
  const items = [];
  const add = (id, label, glyph, fn, disabled = false) => { handlers[`custom:${id}`] = fn; items.push({ id: `custom:${id}`, label, icon: glyph, disabled }); };
  if (hit.handle?.kind === 'vertex' && hit.handle.block.points.length > 2) {
    add('delVertex', t('action.deleteVertex'), 'trash', () => change('op.reshape', (m) => { const b = blockById(m, hit.handle.block.id); b.points.splice(hit.handle.index, 1); }), !canEdit());
  } else if (hit.handle?.kind === 'bend') {
    add('delBend', t('action.deleteBend'), 'trash', () => change('op.reshape', (m) => { const l = m.links.find((x) => x.id === hit.handle.link.id); l.points.splice(hit.handle.index, 1); }), !canEdit());
  }
  if (hit.block) {
    if (!state.selection.includes(hit.block.id)) setSelection([hit.block.id]);
    items.push(...menuItems(['rename', 'duplicate', 'copy', 'rotate90', '-', 'zoomSelection', '-', 'delete']));
    return showMenu(items, anchor, 'context', { handlers, header: { icon: BLOCK_TYPES[hit.block.type].icon, title: hit.block.name } });
  }
  if (hit.link) {
    setSelection([hit.link.id]);
    items.push(...menuItems(['straighten', 'delete']));
    return showMenu(items, anchor, 'context', { handlers, header: { icon: 'connectTool', title: t('props.link') } });
  }
  if (!items.length) items.push(...menuItems(['paste', 'selectAll', '-', 'fit', 'zoomIn', 'zoomOut', '-', 'grid', 'rulers', 'heatmap']));
  return showMenu(items, anchor, 'context', { handlers, header: { icon: 'fProcess', title: m0name() } });
}

// ───────────────────────── commands

const tool = (id, glyph, key) => ({ icon: glyph, label: `tool.${id}`, key, enabled: hasDoc, checked: () => state.tool === id && !state.placing, run: () => setTool(id) });
function setTool(id) {
  state.tool = id;
  state.placing = null;
  canvas?.setTool(id);
  renderToolbarState();
  renderLeft();
  if (id === 'connect') notify('info', t('notice.connectTool'));
}
const toggleSetting = (key, after = applyCanvasOptions) => () => { updateSettings({ [key]: !state.settings[key] }, { quiet: true }); after(); renderToolbarState(); };
const runningOrPaused = () => running();

const commands = {
  // file
  new: { icon: 'fileNew', label: 'action.new', key: 'Ctrl+N', run: () => newProjectAsk('blank') },
  newFromTemplate: { icon: 'template', label: 'action.newFromTemplate', run: (c) => templateMenu(c?.anchor) },
  openExample: { icon: 'samples', label: 'action.openExample', run: (c) => examplesMenu(c?.anchor) },
  open: { icon: 'folderOpen', label: 'action.open', key: 'Ctrl+O', run: () => openWithDialog() },
  startPage: { icon: 'home', label: 'action.startPage', key: 'Ctrl+Shift+H', checked: () => state.showStart || !state.doc, run: () => showStartPage(!state.showStart || !state.doc) },
  recent: { icon: 'recent', label: 'action.recent', run: () => popups.open('recent', {}) },
  recentFolders: { icon: 'recentFolder', label: 'action.recentFolders', run: (c) => recentFoldersMenu(c?.anchor) },
  clearRecent: { icon: 'clearHistory', label: 'action.clearRecent', enabled: () => state.recent.length > 0 || state.recentDirs.length > 0, run: () => { state.recent = []; state.recentDirs = []; storeRecent(globalThis.localStorage, []); storeRecentDirs(globalThis.localStorage, []); notify('success', t('notice.recentCleared')); renderAll(); } },
  save: { icon: 'save', label: 'action.save', key: 'Ctrl+S', enabled: hasDoc, run: () => saveDoc() },
  saveAs: { icon: 'saveAs', label: 'action.saveAs', key: 'Ctrl+Shift+S', enabled: hasDoc, run: () => saveDoc({ saveAs: true }) },
  exportImage: { icon: 'exportImage', label: 'action.exportImage', key: 'Ctrl+Shift+E', enabled: hasDoc, run: () => exportImage('2d') },
  exportImage3d: { icon: 'view3dBox', label: 'action.exportImage3d', enabled: () => hasDoc() && Boolean(view3d), run: () => exportImage('3d') },
  exportStatsCsv: { icon: 'csvFile', label: 'action.exportStatsCsv', enabled: () => hasDoc() && Boolean(state.results || state.sim), run: () => saveExport(`${safeName()}-statistics.csv`, 'csv', resultsCsv(), 'text/csv') },
  exportSeriesCsv: { icon: 'csvFile', label: 'action.exportSeriesCsv', enabled: () => hasDoc() && Boolean(state.sim), run: () => saveExport(`${safeName()}-time-series.csv`, 'csv', seriesCsv(), 'text/csv') },
  exportExperimentCsv: { icon: 'csvFile', label: 'action.exportExperimentCsv', enabled: () => Boolean(state.experiment), run: () => saveExport(`${safeName()}-experiment.csv`, 'csv', experimentCsv(), 'text/csv') },
  exportReportHtml: { icon: 'htmlFile', label: 'action.exportReportHtml', enabled: hasDoc, run: () => saveExport(`${safeName()}-report.html`, 'html', standaloneReport(), 'text/html') },
  exportMenu: { icon: 'chevronDown', label: 'action.exportMenu', enabled: hasDoc, run: (c) => showMenu(menuItems(SUBMENUS.exportTo.items), c?.anchor ?? anchorFor('exportMenu'), 'context', { header: { icon: 'exportFile', title: t('submenu.exportTo') } }) },
  print: { icon: 'print', label: 'action.print', key: 'Ctrl+P', enabled: hasDoc, run: () => openPrint() },
  closeProject: { icon: 'closeTab', label: 'action.closeProject', key: 'Ctrl+W', enabled: () => Boolean(state.doc), run: () => closeProject() },
  exitProject: { icon: 'exitProject', label: 'action.exitProject', enabled: () => Boolean(state.doc) && !state.showStart, run: () => closeProject() },
  exit: { icon: 'exit', label: 'action.exit', key: isMac ? 'Ctrl+Q' : 'Alt+F4', run: () => requestExit() },
  // edit
  undo: { icon: 'undo', label: 'action.undo', key: 'Ctrl+Z', enabled: () => Boolean(doc()?.history.canUndo) && !running(), run: () => undo() },
  redo: { icon: 'redo', label: 'action.redo', key: 'Ctrl+Y', enabled: () => Boolean(doc()?.history.canRedo) && !running(), run: () => redo() },
  cut: { icon: 'cut', label: 'action.cut', key: 'Ctrl+X', enabled: () => sel() && !running(), run: () => { copySelection(); deleteSelection(); } },
  copy: { icon: 'copy', label: 'action.copy', key: 'Ctrl+C', enabled: () => selectedBlocks().length > 0, run: () => copySelection() },
  paste: { icon: 'paste', label: 'action.paste', key: 'Ctrl+V', enabled: () => hasDoc() && Boolean(state.clipboard) && !running(), run: () => pasteClipboard() },
  duplicate: { icon: 'duplicate', label: 'action.duplicate', key: 'Ctrl+D', enabled: () => selectedBlocks().length > 0 && !running(), run: () => duplicateSelection() },
  delete: { icon: 'trash', label: 'action.delete', key: 'Delete', enabled: () => sel() && !running(), run: () => deleteSelection() },
  selectAll: { icon: 'selectAll', label: 'action.selectAll', key: 'Ctrl+A', enabled: hasDoc, run: () => setSelection(model().blocks.map((b) => b.id)) },
  clearSelection: { icon: 'deselect', label: 'action.clearSelection', key: 'Esc', enabled: sel, run: () => setSelection([]) },
  rotate90: { icon: 'rotateRight', label: 'action.rotate90', key: 'R', enabled: () => selectedBlocks().some((b) => !isPathType(b.type)) && !running(), run: () => rotateSelection(90) },
  rename: { icon: 'textTool', label: 'action.rename', key: 'F2', enabled: () => selectedBlocks().length === 1 && !running(), run: () => renameSelected() },
  straighten: { icon: 'routeStraight', label: 'action.straighten', enabled: () => state.selection.some((id) => model()?.links.find((l) => l.id === id)?.points?.length) && !running(), run: () => change('op.reshape', (m) => { for (const l of m.links) if (state.selection.includes(l.id)) l.points = []; }) },
  ...Object.fromEntries(['alignLeft', 'alignCenter', 'alignRight', 'alignTop', 'alignMiddle', 'alignBottom', 'distributeH', 'distributeV'].map((a) => [a, { icon: a, label: `action.${a}`, enabled: () => selectedBlocks().length > 1 && !running(), run: () => align(a) }])),
  // tools
  'tool:select': tool('select', 'pointer', 'V'),
  'tool:connect': tool('connect', 'connectTool', 'C'),
  'tool:pan': tool('pan', 'hand', 'H'),
  addChart: { icon: 'fChart', label: 'action.addChart', enabled: hasDoc, run: () => addChart() },
  checkNow: { icon: 'problems', label: 'action.checkNow', key: 'F8', enabled: hasDoc, run: () => { runProblems(); showBottom('problems'); const c = countBySeverity(state.problems); notify(c.error ? 'error' : c.warning ? 'warning' : 'success', t('notice.checked', c)); } },
  // view
  'viewMode:2d': { icon: 'view2d', label: 'view.mode2d', key: 'Ctrl+1', enabled: hasDoc, checked: () => state.settings.viewMode === '2d', run: () => setViewMode('2d') },
  'viewMode:3d': { icon: 'view3dBox', label: 'view.mode3d', key: 'Ctrl+2', enabled: hasDoc, checked: () => state.settings.viewMode === '3d', run: () => setViewMode('3d') },
  'viewMode:split': { icon: 'viewSplit', label: 'view.modeSplit', key: 'Ctrl+3', enabled: hasDoc, checked: () => state.settings.viewMode === 'split', run: () => setViewMode('split') },
  fit: { icon: 'zoomExtents', label: 'action.fit', key: 'Ctrl+0', enabled: hasDoc, run: () => { canvas.fit(); view3d?.fit(); } },
  zoomIn: { icon: 'zoomIn', label: 'action.zoomIn', key: '+', enabled: hasDoc, run: () => canvas.zoomBy(1.25) },
  zoomOut: { icon: 'zoomOut', label: 'action.zoomOut', key: '-', enabled: hasDoc, run: () => canvas.zoomBy(0.8) },
  zoomSelection: { icon: 'zoomSelection', label: 'action.zoomSelection', enabled: sel, run: () => zoomToSelection() },
  grid: { icon: 'grid', label: 'action.grid', key: 'G', checked: () => state.settings.showGrid, run: toggleSetting('showGrid', () => { applyCanvasOptions(); applyViewOptions(); }) },
  rulers: { icon: 'rulers', label: 'action.rulers', checked: () => state.settings.showRulers, run: toggleSetting('showRulers', applyCanvasOptions) },
  ports: { icon: 'connectionPoints', label: 'action.ports', checked: () => state.settings.showPorts, run: toggleSetting('showPorts') },
  labels: { icon: 'textTool', label: 'action.labels', checked: () => state.settings.showLabels, run: toggleSetting('showLabels', () => { applyCanvasOptions(); updateSettings({ view3dLabels: state.settings.showLabels }, { quiet: true }); applyViewOptions(); }) },
  links: { icon: 'polyline', label: 'action.links', checked: () => state.settings.showLinks, run: toggleSetting('showLinks') },
  heatmap: { icon: 'heatmap', label: 'action.heatmap', checked: () => state.settings.heatmap, run: toggleSetting('heatmap') },
  snap: { icon: 'snap', label: 'action.snap', checked: () => state.settings.snapStep > 0, run: () => { updateSettings({ snapStep: state.settings.snapStep > 0 ? 0 : 0.5 }, { quiet: true }); applyCanvasOptions(); renderToolbarState(); } },
  shadows3d: { icon: 'shadow', label: 'action.shadows3d', checked: () => state.settings.view3dShadows, run: toggleSetting('view3dShadows', applyViewOptions) },
  ...Object.fromEntries(['iso', 'top', 'front', 'side'].map((v) => [`view3d:${v}`, { icon: { iso: 'viewIso', top: 'viewTop', front: 'viewFront', side: 'viewRight' }[v], label: `view3d.${v}`, enabled: () => hasDoc() && Boolean(view3d), run: () => { if (state.settings.viewMode === '2d') setViewMode('split'); view3d.setView(v); } }])),
  leftPanel: { get icon() { return state.settings.showLeftPanel ? 'foldLeft' : 'unfoldLeft'; }, label: 'action.leftPanel', enabled: () => panelsUsable(), checked: () => state.settings.showLeftPanel, run: () => { updateSettings({ showLeftPanel: !state.settings.showLeftPanel }); layoutViews(); } },
  rightPanel: { get icon() { return state.settings.showRightPanel ? 'foldRight' : 'unfoldRight'; }, label: 'action.rightPanel', enabled: () => panelsUsable(), checked: () => state.settings.showRightPanel, run: () => { updateSettings({ showRightPanel: !state.settings.showRightPanel }); layoutViews(); } },
  bottomPanel: { get icon() { return state.settings.showBottomPanel ? 'foldBottom' : 'unfoldBottom'; }, label: 'action.bottomPanel', enabled: () => panelsUsable(), key: 'Ctrl+J', checked: () => state.settings.showBottomPanel, run: () => { updateSettings({ showBottomPanel: !state.settings.showBottomPanel }); layoutViews(); } },
  statusBar: { icon: 'statusBar', label: 'action.statusBar', checked: () => state.settings.showStatusBar, run: () => updateSettings({ showStatusBar: !state.settings.showStatusBar }) },
  theme: { icon: 'palette', label: 'action.theme', run: () => { const order = ['light', 'dark']; updateSettings({ theme: resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme).dark ? 'light' : 'dark' }); void order; } },
  themeMenu: { icon: 'palette', label: 'action.themeChoose', run: (c) => openThemePicker(c?.anchor) },
  themeRandom: { icon: 'palette', label: 'action.themeRandom', run: () => randomTheme() },
  language: { icon: 'globe', label: 'action.language', key: 'Ctrl+Shift+L', run: () => updateSettings({ language: getLanguage() === 'ko' ? 'en' : 'ko' }) },
  shuffleBackground: { icon: 'dice', label: 'action.shuffleBackground', run: () => shuffleBackground() },
  backgroundImage: { icon: 'imageBg', label: 'action.backgroundImage', run: () => chooseBackground() },
  clearBackground: { icon: 'imageClear', label: 'action.clearBackground', enabled: () => Boolean(state.settings.backgroundImage), run: () => removeBackground() },
  // simulation
  runPause: { icon: 'runPlay', label: 'action.runPause', key: 'F5', enabled: hasDoc, checked: () => state.simStatus === 'running', run: () => runPause() },
  step: { icon: 'runStep', label: 'action.step', key: 'F6', enabled: () => hasDoc() && state.simStatus !== 'running' && state.simStatus !== 'finished', run: () => stepOnce() },
  stop: { icon: 'runStop', label: 'action.stop', key: 'Shift+F5', enabled: () => Boolean(state.sim), run: () => stopRun() },
  runToEnd: { icon: 'runToEnd', label: 'action.runToEnd', key: 'F7', enabled: () => hasDoc() && state.simStatus !== 'finished', run: () => runToEnd() },
  restart: { icon: 'runReset', label: 'action.restart', enabled: hasDoc, run: () => { stopRun({ quiet: true }); runPause(); } },
  speedUp: { icon: 'speedUp', label: 'action.speedUp', key: ']', enabled: hasDoc, run: () => speedStep(1) },
  speedDown: { icon: 'speedDown', label: 'action.speedDown', key: '[', enabled: hasDoc, run: () => speedStep(-1) },
  speedMenu: { icon: 'speed', label: 'action.speedMenu', enabled: hasDoc, run: (ctx) => speedMenu(ctx?.anchor) },
  experiment: { icon: 'experiment', label: 'action.experiment', key: 'Ctrl+Shift+X', enabled: () => hasDoc() && !runningOrPaused(), run: () => openExperiment() },
  applyBest: { icon: 'star', label: 'action.applyBest', enabled: () => Boolean(state.experiment?.best) && !running(), run: () => applyBest() },
  report: { icon: 'report', label: 'action.report', key: 'Ctrl+R', enabled: hasDoc, run: () => openReport() },
  showDiagnosis: { icon: 'bottleneck', label: 'bottom.diagnosis', run: () => showBottom('diagnosis') },
  showStats: { icon: 'statistics', label: 'bottom.stats', run: () => showBottom('stats') },
  showCharts: { icon: 'fChart', label: 'bottom.charts', run: () => showBottom('charts') },
  showProblems: { icon: 'problems', label: 'bottom.problems', run: () => showBottom('problems') },
  showLog: { icon: 'trace', label: 'bottom.log', run: () => showBottom('log') },
  showExperiments: { icon: 'experiment', label: 'bottom.experiments', run: () => showBottom('experiments') },
  recordVideo: { icon: 'fRecord', label: 'action.recordVideo', enabled: hasDoc, checked: () => Boolean(recorder?.active), run: () => toggleRecording() },
  follow3d: { icon: 'fFollow', label: 'action.follow3d', enabled: () => hasDoc() && Boolean(view3d), checked: () => Boolean(view3d?.follow), run: () => toggleFollow() },
  saveScenario: { icon: 'fScenario', label: 'action.saveScenario', enabled: () => Boolean(state.results) && hasDoc(), run: () => saveScenario() },
  compareScenarios: { icon: 'fCompare', label: 'action.compareScenarios', enabled: () => (doc()?.scenarios?.length ?? 0) > 0, run: () => showBottom('experiments') },
  // help
  // The welcome popup (it asks whether to run the tutorial) belongs to the start page: from elsewhere this goes there first.
  welcome: { icon: 'bulb', label: 'action.welcome', run: () => { if (!state.showStart) showStartPage(true); return openWelcome(); } },
  tutorial: { icon: 'tutorial', label: 'action.tutorial', key: 'F11', run: () => startTutorial() },
  tutorialDoc: { icon: 'tutorialDoc', label: 'action.tutorialDoc', run: () => openDocWindow('tutorial') },
  tutorialVideo: { icon: 'tutorialVideo', label: 'action.tutorialVideo', run: () => openDocWindow('video') },
  userGuide: { icon: 'userGuide', label: 'action.userGuide', run: () => openDocWindow('guide') },
  shortcuts: { icon: 'keyboard', label: 'action.shortcuts', run: () => popups.open('settings', { tab: 'shortcuts' }) },
  settings: { icon: 'gear', label: 'action.settings', key: 'Ctrl+,', run: () => popups.open('settings', { tab: 'general' }) },
  about: { icon: 'info', label: 'action.about', key: 'F1', run: () => popups.open('about', {}) },
};
// Placing blocks: one command per type (menus "Model", "Process" …).
for (const type of Object.keys(BLOCK_TYPES)) commands[`place:${type}`] = { icon: BLOCK_TYPES[type].icon, label: `block.${type}`, enabled: () => canEdit(), checked: () => state.placing === type, run: () => startPlacing(type) };

function commandEnabled(id) { const c = commands[id]; return Boolean(c) && (c.enabled ? Boolean(c.enabled()) : true); }
function commandTip(id) {
  const c = commands[id];
  if (!c) return '';
  return c.key ? `${t(c.label)} (${keyLabel(c.key)})` : t(c.label);
}
async function run(id, context) {
  const c = commands[id];
  if (!c || !commandEnabled(id)) return undefined;
  try { return await c.run(context); } catch (error) { return showError('error.command', error, id); }
}

function showBottom(tab) {
  state.bottomTab = tab;
  if (!state.settings.showBottomPanel) updateSettings({ showBottomPanel: true }, { quiet: true });
  renderAll();
  layoutViews();
}

async function addChart() {
  const names = [...referenceNames(model()).keys()].filter((n) => n !== 't' && n !== 'time');
  const suggestion = names.filter((n) => /\.(length|utilization|count|Infected)$/.test(n) || !n.includes('.')).slice(0, 3).join(', ');
  const value = await prompt({ title: t('action.addChart'), label: t('charts.seriesPrompt', { names: names.slice(0, 12).join(', ') }), value: suggestion });
  if (value == null) return;
  const series = value.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  if (!series.length) return;
  change('op.addChart', (m) => m.charts.push({ id: newId('c'), title: series.join(', '), kind: 'line', series }));
  if (state.sim) state.sim.keys = null;
  showBottom('charts');
}
async function editChart(i) {
  const c = model().charts[i];
  if (!c) return;
  const value = await prompt({ title: t('charts.edit'), label: t('charts.seriesPrompt', { names: '' }), value: c.series.join(', ') });
  if (value == null) return;
  change('op.editChart', (m) => { m.charts[i].series = value.split(/[,;]+/).map((s) => s.trim()).filter(Boolean); m.charts[i].title = m.charts[i].series.join(', '); });
  renderBottom();
}

// ───────────────────────── menus and toolbar

const SUBMENUS = {
  exportTo: { icon: 'exportFile', items: ['exportImage', 'exportImage3d', '-', 'exportStatsCsv', 'exportSeriesCsv', 'exportExperimentCsv', '-', 'exportReportHtml'] },
  ...Object.fromEntries(CATEGORIES.map((c) => [`cat:${c.id}`, { icon: c.icon, items: typesIn(c.id).map((type) => `place:${type}`) }])),
  align: { icon: 'alignLeft', items: ['alignLeft', 'alignCenter', 'alignRight', '-', 'alignTop', 'alignMiddle', 'alignBottom', '-', 'distributeH', 'distributeV'] },
  views3d: { icon: 'view3dBox', items: ['view3d:iso', 'view3d:top', 'view3d:front', 'view3d:side', '-', 'follow3d', 'shadows3d'] },
  show: { icon: 'eye', items: ['grid', 'rulers', 'snap', 'ports', 'labels', 'links', 'heatmap', '-', 'leftPanel', 'rightPanel', 'bottomPanel', 'statusBar'] },
  appearance: { icon: 'palette', items: ['theme', 'themeRandom', 'themeMenu', 'language', '-', 'shuffleBackground', 'backgroundImage', 'clearBackground'] },
  bottom: { icon: 'panelBottom', items: ['showDiagnosis', 'showStats', 'showCharts', 'showProblems', 'showLog', 'showExperiments'] },
};
const sub = (key) => ({ sub: key });
const MENUS = {
  file: ['new', 'newFromTemplate', 'openExample', 'open', 'startPage', 'recent', 'recentFolders', 'clearRecent', '-', 'save', 'saveAs', '-', sub('exportTo'), 'print', '-', 'closeProject', 'exit'],
  edit: ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'duplicate', 'delete', '-', 'selectAll', 'clearSelection', '-', 'rename', 'rotate90', 'straighten', sub('align')],
  view: ['viewMode:2d', 'viewMode:3d', 'viewMode:split', '-', 'fit', 'zoomIn', 'zoomOut', 'zoomSelection', '-', sub('views3d'), sub('show'), sub('bottom'), '-', sub('appearance')],
  model: ['tool:select', 'tool:connect', 'tool:pan', '-', ...CATEGORIES.map((c) => sub(`cat:${c.id}`)), '-', 'addChart', 'checkNow'],
  simulation: ['runPause', 'step', 'stop', 'runToEnd', 'restart', '-', 'speedUp', 'speedDown', '-', 'showDiagnosis', 'experiment', 'applyBest', '-', 'saveScenario', 'compareScenarios', '-', 'recordVideo', 'follow3d', '-', 'report', 'exportStatsCsv'],
  help: ['welcome', 'tutorial', 'tutorialDoc', 'tutorialVideo', 'userGuide', 'shortcuts', '-', 'settings', 'about'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', view: 'eye', model: 'fProcess', simulation: 'runPlay', help: 'question' };

const TOOLBAR = [
  ['new', 'open', 'save', 'print', 'exitProject', 'exportSplit'],
  ['undo', 'redo'],
  ['tool:select', 'tool:connect', 'tool:pan'],
  ['duplicate', 'rotate90', 'delete'],
  ['fit', 'zoomIn', 'zoomOut', 'grid', 'snap', 'heatmap'],
  ['viewMode:2d', 'viewMode:3d', 'viewMode:split'],
  ['runPause', 'step', 'stop', 'runToEnd'],
  ['speedDown', 'speedMenu', 'speedUp'],
  ['experiment', 'report', 'checkNow'],
];
/** Panel buttons: on the menu bar, left of the window buttons (minimize · maximize · close). */
/** The side and bottom panels exist only with a model open (not on the start page). */
const panelsUsable = () => hasDoc() && !state.showStart;
const MENUBAR_PANELS = ['leftPanel', 'bottomPanel', 'rightPanel'];
const TOOLBAR_RIGHT = ['tutorial', 'themeSplit', 'language', 'settings', 'about'];
/** Toolbar buttons that show a name next to the icon. */
const TOOLBAR_LABELS = { 'viewMode:2d': 'view.tool.2d', 'viewMode:3d': 'view.tool.3d', 'viewMode:split': 'view.tool.split', report: 'report.button' };
const TOOLBAR_MAIN = { exportSplit: 'exportImage', themeSplit: 'themeRandom' };

function renderShell() {
  root.innerHTML = `
    <div class="app-bg" aria-hidden="true"><canvas class="anim-bg"></canvas><div class="image-bg"></div></div>
    <nav id="menubar" role="menubar"></nav>
    <div id="toolbar" role="toolbar"></div>
    <main id="workspace">
      <aside id="left-panel" class="side-panel" aria-label="${escapeHtml(t('panel.library'))}"></aside>
      <div class="splitter vertical panel-split" data-split="left" role="separator" aria-orientation="vertical"></div>
      <section id="center">
        <div id="run-bar"></div>
        <div id="center-body">
          <div id="views" data-mode="split">
            <div id="view2d" class="view-pane"></div>
            <div class="splitter vertical view-split" data-split="views" role="separator" aria-orientation="vertical"></div>
            <div id="view3d" class="view-pane"></div>
          </div>
          <div id="start-page" hidden></div>
          <div class="drop-overlay" aria-hidden="true"><div>${icon('drop')}<span></span></div></div>
        </div>
        <div class="splitter horizontal bottom-split" data-split="bottom" role="separator" aria-orientation="horizontal"></div>
        <section id="bottom-panel"><div id="bottom-tabs"></div><div id="bottom-body"></div></section>
      </section>
      <div class="splitter vertical panel-split" data-split="right" role="separator" aria-orientation="vertical"></div>
      <aside id="right-panel" class="side-panel" aria-label="${escapeHtml(t('panel.explorer'))}"><div id="explorer"></div><div class="splitter horizontal explorer-split" data-split="explorer"></div><div id="properties"></div></aside>
    </main>
    <footer id="statusbar" role="status"></footer>
    ${desktop ? `<div class="resize-grip" data-resize-grip title="${escapeHtml(t('tip.resize'))}" role="separator">${icon('grip')}</div>` : `<div class="resize-grip static" aria-hidden="true">${icon('grip')}</div>`}
    <div id="tutorial-layer"></div>
    <div id="datalists"></div>`;
}

function renderMenubar() {
  const menubar = root.querySelector('#menubar');
  const onStart = state.showStart || !state.doc;
  const home = `<button class="menubar-item menubar-home ${onStart ? 'current' : ''}" data-home title="${escapeHtml(t('tip.home'))}" aria-pressed="${onStart}">${icon('home')}<span>${escapeHtml(t('menu.home'))}</span></button><span class="menubar-sep" aria-hidden="true"></span>`;
  const brand = `<div class="app-brand" data-window-drag title="${escapeHtml(`MyProductionFlow v${VERSION}`)}"><img class="app-brand-icon" src="${APP_ICON}" alt="" data-window-drag /><span class="app-brand-name" data-window-drag>MyProductionFlow</span><span class="app-brand-version" data-window-drag>v${escapeHtml(VERSION)}</span></div>`;
  const button = (id, glyph, key) => `<button class="window-button ${id === 'close' ? 'close' : ''}" data-window="${id}" title="${escapeHtml(t(key))}" aria-label="${escapeHtml(t(key))}">${icon(glyph)}</button>`;
  const controls = desktop ? `<div class="window-controls">${button('minimize', 'winMinimize', 'window.minimize')}${state.maximized ? button('maximize', 'winRestore', 'window.restore') : button('maximize', 'winMaximize', 'window.maximize')}${button('close', 'winClose', 'window.close')}</div>` : '';
  const panels = `<div class="menubar-panels" role="group">${MENUBAR_PANELS.map((id) => `<button class="tool-button menubar-panel ${commands[id].checked?.() ? 'active' : ''}" data-command="${id}" ${commandEnabled(id) ? '' : 'disabled'} title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(commands[id].label))}" aria-pressed="${Boolean(commands[id].checked?.())}">${icon(commands[id].icon)}</button>`).join('')}</div>`;
  const projectName = '<span class="menubar-project" data-window-drag><span class="app-brand-project-name" data-window-drag></span><span class="app-brand-dirty" data-window-drag>●</span></span>';
  menubar.innerHTML = brand + home + Object.keys(MENUS).map((name) => `<button class="menubar-item ${state.openMenu === name ? 'open' : ''}" data-menu="${name}" role="menuitem" aria-haspopup="true" title="${escapeHtml(t(`menu.${name}`))}">${icon(MENU_ICONS[name])}<span>${escapeHtml(t(`menu.${name}`))}</span></button>`).join('') + projectName + `<div class="menubar-drag" data-window-drag></div>${panels}${controls}`;
  renderTitleProject();
}

function renderTitleProject() {
  const box = root.querySelector('.menubar-project');
  if (!box) return;
  const d = state.showStart ? null : state.doc;
  box.classList.toggle('empty', !d);
  box.classList.toggle('dirty', Boolean(d?.dirty));
  box.querySelector('.app-brand-project-name').textContent = d ? docName(d) : '';
  box.title = d ? `${d.path ?? docName(d)}${d.dirty ? ` (${t('status.modified')})` : ''}` : '';
  if (desktop) appWindow.setTitle(`${d ? `${docName(d)}${d.dirty ? ' •' : ''} — ` : ''}MyProductionFlow v${VERSION}`).catch(() => {});
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
  for (const type of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(type, () => mark('myproductionflow.main.input'), { capture: true, passive: true });
  window.addEventListener('focus', () => mark('myproductionflow.main.focus'));
}

let toolbarLanguage = null;
function renderToolbar() {
  const toolbar = root.querySelector('#toolbar');
  toolbarLanguage = getLanguage();
  const plain = (id, extra = '') => {
    const c = commands[id];
    const glyph = id === 'language' ? switchFlag(getLanguage()) : icon(c.icon);
    // The view switches carry their name (2D / 3D / 2D+3D): they are the way to show each view on its own.
    const label = TOOLBAR_LABELS[id];
    return `<button class="tool-button ${label ? 'tool-labeled view-mode-button' : ''} ${extra}" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(c.label))}">${glyph}${label ? `<span>${escapeHtml(t(label))}</span>` : ''}</button>`;
  };
  const split = (main, arrow, label) => `<span class="split-button">${plain(main)}<button class="tool-button split-arrow" data-command="${arrow}" title="${escapeHtml(commandTip(arrow))}" aria-label="${escapeHtml(t(label))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
  const button = (id) => {
    if (id === 'exportSplit') return split('exportImage', 'exportMenu', 'action.exportMenu');
    // Theme: the button picks a random theme; the ▾ on its right is the theme dropdown menu.
    if (id === 'themeSplit') return split('themeRandom', 'themeMenu', 'action.themeChoose');
    // The current speed between − and +; a click lists every speed.
    if (id === 'speedMenu') return `<button class="tool-button tool-labeled tool-speed" data-command="speedMenu" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(commands[id].label))}" aria-haspopup="true"><span data-speed-label>${escapeHtml(speedText(state.speed))}</span></button>`;
    return plain(id, id === 'runPause' ? 'run-button' : '');
  };
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
  for (const el of root.querySelectorAll('#toolbar [data-command], #menubar [data-command], #run-bar [data-command], #properties [data-command]')) {
    const id = el.dataset.command;
    if (!commands[id]) continue;
    el.disabled = !commandEnabled(id);
    const checked = commands[id]?.checked?.();
    el.classList.toggle('active', Boolean(checked));
    if (checked !== undefined) el.setAttribute('aria-pressed', String(Boolean(checked)));
  }
  renderSpeedLabel();
  for (const id of ['leftPanel', 'rightPanel', 'bottomPanel']) { const b = root.querySelector(`#menubar [data-command="${id}"]`); if (b && b.dataset.glyph !== commands[id].icon) { b.innerHTML = icon(commands[id].icon); b.dataset.glyph = commands[id].icon; } }
  const runBtn = root.querySelector('#toolbar [data-command="runPause"]');
  if (runBtn) { runBtn.innerHTML = icon(state.simStatus === 'running' ? 'runPause' : 'runPlay'); runBtn.title = commandTip('runPause'); }
}

function updateMinimumWidth() {
  const left = root.querySelector('.toolbar-left');
  const right = root.querySelector('.toolbar-right');
  if (!left || !right) return;
  requestAnimationFrame(() => {
    const toolbar = root.querySelector('#toolbar');
    const style = getComputedStyle(toolbar);
    const menus = [...root.querySelectorAll('.app-brand, .menubar-item, .menubar-panels, .window-controls')].reduce((sum, el) => sum + el.offsetWidth + 2, 48);
    const folded = [...left.querySelectorAll('[data-group], [data-group-sep]')].filter((el) => el.hidden);
    const more = left.querySelector('[data-toolbar-more]');
    const moreHidden = more?.hidden;
    for (const el of folded) el.hidden = false;
    if (more) more.hidden = true;
    const full = left.scrollWidth + right.scrollWidth + 24 + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 2;
    for (const el of folded) el.hidden = true;
    if (more) more.hidden = moreHidden;
    const screenWidth = window.screen?.availWidth || Infinity;
    const width = Math.ceil(Math.min(screenWidth - 16, Math.max(menus, full)));
    if (Math.abs(width - state.minWidth) < 1) return;
    state.minWidth = width;
    document.documentElement.style.setProperty('--min-width', `${width}px`);
    native.setMinimumSize(width, 640).catch(() => {});
  });
}

/** The run bar above the views: run controls, model time, progress, speed, the 2D / 3D / split switch. */
function renderRunBar() {
  const bar = root.querySelector('#run-bar');
  if (!bar) return;
  const m = model();
  if (!m || state.showStart) { bar.innerHTML = ''; return; }
  const sim = state.sim;
  const progress = sim ? Math.min(1, sim.now / sim.end) : state.simStatus === 'finished' ? 1 : 0;
  const statusKey = `run.${state.simStatus}`;
  const existing = bar.querySelector('.run-progress');
  if (existing && bar.dataset.status === state.simStatus && bar.dataset.lang === getLanguage() && bar.dataset.mode === state.settings.viewMode && bar.dataset.speed === String(state.speed) && bar.dataset.rec === String(Boolean(recorder?.active)) && bar.dataset.follow === String(Boolean(view3d?.follow))) {
    existing.querySelector('i').style.width = `${progress * 100}%`;
    bar.querySelector('.run-time').textContent = simTimeText();
    bar.querySelector('.run-events').textContent = sim ? t('run.events', { n: sim.eventCount.toLocaleString(), wip: sim.entities.size - sim.hidden.size }) : '';
    return;
  }
  Object.assign(bar.dataset, { status: state.simStatus, lang: getLanguage(), mode: state.settings.viewMode, speed: String(state.speed), rec: String(Boolean(recorder?.active)), follow: String(Boolean(view3d?.follow)) });
  const btn = (id, extra = '') => `<button class="tool-button ${extra}" data-command="${id}" title="${escapeHtml(commandTip(id))}">${icon(id === 'runPause' && state.simStatus === 'running' ? 'runPause' : commands[id].icon)}</button>`;
  const speeds = SPEEDS.includes(state.speed) ? SPEEDS : [...SPEEDS, state.speed].sort((a, b) => a - b);
  bar.innerHTML = `<div class="run-controls">${btn('runPause', 'run-button')}${btn('step')}${btn('stop')}${btn('runToEnd')}<span class="run-sep"></span>${btn('recordVideo', recorder?.active ? 'active recording' : '')}${state.settings.viewMode !== '2d' ? btn('follow3d', view3d?.follow ? 'active' : '') : ''}</div>
    <span class="run-status status-${state.simStatus}">${icon(state.simStatus === 'running' ? 'runPlay' : state.simStatus === 'paused' ? 'runPause' : state.simStatus === 'finished' ? 'check' : 'runStop')}<span>${escapeHtml(t(statusKey))}</span></span>
    <span class="run-time" title="${escapeHtml(t('run.timeTip'))}">${escapeHtml(simTimeText())}</span>
    <span class="run-progress" title="${escapeHtml(t('run.progressTip'))}"><i style="width:${progress * 100}%"></i></span>
    <span class="run-events muted">${sim ? escapeHtml(t('run.events', { n: sim.eventCount.toLocaleString(), wip: sim.entities.size - sim.hidden.size })) : ''}</span>
    <span class="grow"></span>
    <label class="run-speed" title="${escapeHtml(t('run.speedTip', { unit: m.settings.timeUnit }))}">${icon('speed')}<button class="icon-button" data-command="speedDown" title="${escapeHtml(commandTip('speedDown'))}">${icon('minus')}</button><select data-run-speed aria-label="${escapeHtml(t('run.speed'))}">${speeds.map((v) => `<option value="${v}" ${v === state.speed ? 'selected' : ''}>×${v}</option>`).join('')}</select><button class="icon-button" data-command="speedUp" title="${escapeHtml(commandTip('speedUp'))}">${icon('plus')}</button></label>
    <span class="segmented view-switch" role="radiogroup">${['2d', 'split', '3d'].map((mode) => `<button class="segment ${state.settings.viewMode === mode ? 'active' : ''}" data-command="viewMode:${mode}" title="${escapeHtml(commandTip(`viewMode:${mode}`))}">${icon(commands[`viewMode:${mode}`].icon)}<span>${escapeHtml(t(`view.short.${mode}`))}</span></button>`).join('')}</span>`;
}

// ───────────────────────── panels

function renderLeft() {
  const panel = root.querySelector('#left-panel');
  if (!panel) return;
  const scroll = panel.querySelector('.lib-body')?.scrollTop ?? 0;
  const focusSearch = document.activeElement?.matches?.('[data-lib-search]');
  panel.innerHTML = libraryHtml({ ...state, placing: state.placing });
  panel.classList.toggle('locked', running());
  const body = panel.querySelector('.lib-body');
  if (body) body.scrollTop = scroll;
  if (focusSearch) { const input = panel.querySelector('[data-lib-search]'); input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
}

function renderExplorer() {
  const host = root.querySelector('#explorer');
  const m = model();
  if (!host) return;
  if (!m) { host.innerHTML = ''; return; }
  const scroll = host.querySelector('.explorer-tree')?.scrollTop ?? 0;
  const focus = document.activeElement?.matches?.('[data-explorer-search]');
  host.innerHTML = explorerHtml(m, state, state.sim ? (id) => state.sim.blockState(id) : null);
  const tree = host.querySelector('.explorer-tree');
  if (tree) tree.scrollTop = scroll;
  if (focus) { const input = host.querySelector('[data-explorer-search]'); input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
}

function renderProperties() {
  const host = root.querySelector('#properties');
  const m = model();
  if (!host) return;
  if (!m) { host.innerHTML = ''; return; }
  const scroll = host.querySelector('.props')?.scrollTop ?? host.scrollTop;
  const sim = state.sim;
  const one = state.selection.length === 1 ? state.selection[0] : null;
  const summary = one ? (sim?.nodes.get(one)?.summary(sim.now) ?? (state.simStatus === 'idle' && state.results ? state.results.blocks[blockById(m, one)?.name] : null)) : null;
  host.innerHTML = propertiesHtml(m, state, {
    running: running(),
    liveHtml: summary ? `<div data-live-box>${liveHtml(summary, m)}</div>` : '',
    exprError: (text) => { const c = compile(text); if (String(text ?? '').trim() === '') return ''; if (!c.ok) return c.error; const names = referenceNames(m); const bad = [...c.refs].find((r) => !names.has(r)); return bad ? t('check.unknownName', { ref: bad }) : ''; },
  });
  host.scrollTop = scroll;
  root.querySelector('#datalists').innerHTML = refNamesDatalist(m);
  renderToolbarState();
}

function renderRight() { renderExplorer(); renderProperties(); }

function renderBottomTabs() {
  const host = root.querySelector('#bottom-tabs');
  if (!host) return;
  host.innerHTML = bottomTabsHtml(state, { problems: countBySeverity(state.problems), log: state.log.length, issues: state.issues });
}
function renderBottom() {
  const host = root.querySelector('#bottom-body');
  const m = model();
  if (!host || !m) { if (host) host.innerHTML = ''; return; }
  const scroll = host.scrollTop;
  switch (state.bottomTab) {
    case 'diagnosis': host.innerHTML = diagnosisHtml(state.issues, state.appliedFixes, { running: running() }); break;
    case 'stats': host.innerHTML = statsHtml(state.results ?? (state.sim ? state.sim.results() : null), m); break;
    case 'charts': host.innerHTML = chartsHtml(state.sim, m); break;
    case 'problems': host.innerHTML = problemsHtml(state.problems, state); break;
    case 'log': host.innerHTML = logHtml(state.log, m); break;
    case 'experiments': host.innerHTML = experimentsHtml(state.experiment, m, doc()?.scenarios ?? []) + (state.experiment?.best ? `<div class="exp-apply"><button class="button small" data-command="applyBest">${icon('star')}<span>${escapeHtml(t('action.applyBest'))}</span></button></div>` : ''); break;
    default: host.innerHTML = '';
  }
  host.scrollTop = scroll;
  renderBottomTabs();
}

function renderStatus() {
  const bar = root.querySelector('#statusbar');
  if (!bar) return;
  const s = state.settings;
  const notice = state.notice;
  const hint = notice?.text ?? (state.placing ? t(isPathType(state.placing) ? 'notice.placePath' : 'notice.place', { name: typeName(state.placing) }) : hasDoc() ? t(`hint.${state.tool}`, null, t('status.ready')) : t('status.ready'));
  const items = [`<span class="status-notice ${notice?.kind ?? 'hint'}" title="${escapeHtml(hint)}">${icon(notice?.kind === 'error' ? 'error' : notice?.kind === 'success' ? 'check' : notice?.kind === 'warning' ? 'warning' : 'info')}<span>${escapeHtml(hint)}</span></span>`];
  if (hasDoc()) {
    if (state.selection.length) items.push(`<span class="status-item">${icon('selectAll')}<span>${escapeHtml(t('status.selected', { count: state.selection.length }))}</span></span>`);
    items.push(`<span class="status-item" title="${escapeHtml(t('status.pointerTip'))}">${icon('position')}<span id="status-pointer">—</span></span>`);
    items.push(`<span class="status-item" title="${escapeHtml(t('status.zoomTip'))}">${icon('zoomIn')}<span id="status-zoom">${canvas?.zoomPercent ?? 100}%</span></span>`);
    items.push(`<span class="status-item" title="${escapeHtml(t('run.timeTip'))}">${icon('clock')}<span id="status-simtime">${escapeHtml(simTimeText())}</span></span>`);
    const counts = countBySeverity(state.problems);
    items.push(`<button class="status-item ${counts.error ? 'error-count' : ''}" data-command="showProblems" title="${escapeHtml(t('status.problemsTip'))}">${icon(counts.error ? 'error' : counts.warning ? 'warning' : 'check')}<span>${escapeHtml(t('status.problems', counts))}</span></button>`);
  }
  items.push(`<span class="status-item">${icon('palette')}<span>${escapeHtml(themeName(s.theme, getLanguage()))}</span></span>`);
  items.push(`<span class="status-item">${icon('globe')}<span>${escapeHtml(t('status.language'))}</span></span>`);
  if (s.statusClock) items.push(`<span class="status-item clock">${icon('clock')}<span id="status-clock">${escapeHtml(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span></span>`);
  bar.innerHTML = items.join('');
}

function renderAll() {
  root.classList.toggle('no-status', !state.settings.showStatusBar);
  root.classList.toggle('no-left', !state.settings.showLeftPanel);
  root.classList.toggle('no-right', !state.settings.showRightPanel);
  const onStart = state.showStart || !state.doc;
  root.classList.toggle('on-start', onStart);
  root.classList.toggle('no-bottom', !state.settings.showBottomPanel);
  root.style.setProperty('--bottom-height', `${state.settings.bottomHeight}px`);
  root.style.setProperty('--left-width', `${state.settings.leftWidth}px`);
  root.style.setProperty('--right-width', `${state.settings.rightWidth}px`);
  root.style.setProperty('--explorer-height', `${state.settings.explorerHeight}%`);
  renderMenubar();
  if (toolbarLanguage !== getLanguage()) renderToolbar(); else renderToolbarState();
  renderRunBar();
  renderLeft();
  renderRight();
  renderBottom();
  renderStatus();
  const startHost = root.querySelector('#start-page');
  startHost.hidden = !onStart;
  root.querySelector('#views').hidden = onStart;
  if (onStart) renderStartPage(); else { startCards?.destroy(); startCards = null; startHost.innerHTML = ''; layoutViews(); }
  updateBackgroundState();
}

// ───────────────────────── start page

let startCards = null;
const panelApi = { state, settings: () => state.settings, version: () => state.info?.version ?? VERSION };
function renderStartPage() {
  const host = root.querySelector('#start-page');
  const scrollTop = host.querySelector('.start-scroll')?.scrollTop ?? 0;
  startCards?.destroy();
  host.innerHTML = startPageHtml(panelApi);
  startCards = startBoard(host.querySelector('.start-board'), {
    saved: state.settings.startLayout,
    reduced: Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
    onSave: (layout) => { state.settings.startLayout = layout; storeSettings(globalThis.localStorage, state.settings); },
  });
  host.querySelector('.start-scroll').scrollTop = scrollTop;
  const bg = host.querySelector('.start-bg');
  startBackground?.destroy();
  startBackground = new AnimatedBackground(bg, { colors: backgroundColors, speed: () => state.settings.animationSpeed / 100, kind: state.settings.animation, vivid: true });
  if (state.settings.backgroundKind === 'animated') startBackground.start(); else startBackground.draw();
  bg.classList.toggle('static', state.settings.backgroundKind !== 'animated');
  host.querySelector('.start-scroll').style.setProperty('--start-image', state.backgroundUrl && state.settings.backgroundKind === 'image' ? `url("${state.backgroundUrl}")` : 'none');
  host.classList.toggle('with-image', Boolean(state.backgroundUrl) && state.settings.backgroundKind === 'image');
}

function showStartPage(show = true) {
  state.showStart = show;
  if (!state.doc) state.showStart = true;
  if (state.showStart && running()) setStatus('paused');
  // Leaving the start page closes the welcome popup (it is shown only over the start page).
  if (!state.showStart) popups.close('welcome');
  renderAll();
}

async function onStartAction(target) {
  const value = target.dataset.value;
  switch (target.dataset.start) {
    case 'template': return newProjectAsk(value);
    case 'new': return newProjectAsk('blank');
    case 'open': return openWithDialog();
    case 'open-recent': return openRecent(value);
    case 'remove-recent': state.recent = removeRecent(state.recent, value); storeRecent(globalThis.localStorage, state.recent); return renderStartPage();
    case 'clear-recent': state.recent = []; storeRecent(globalThis.localStorage, []); notify('success', t('notice.recentCleared')); return renderStartPage();
    case 'open-folder': return openWithDialog(value);
    case 'remove-folder': state.recentDirs = removeRecent(state.recentDirs, value); storeRecentDirs(globalThis.localStorage, state.recentDirs); return renderStartPage();
    case 'clear-folders': state.recentDirs = []; storeRecentDirs(globalThis.localStorage, []); return renderStartPage();
    case 'sample': return openSampleAsk(value);
    case 'arrange': return startCards?.arrange();
    case 'start-settings': return popups.open('settings', { tab: 'start' });
    case 'settings': return run('settings');
    case 'continue': return value ? openRecent(value) : run('open');
    case 'about': return run('about');
    case 'exit': return run('exit');
    case 'help-menu': return showMenu(menuItems(MENUS.help), anchorBelow(target), 'help');
    case 'tutorial': return startTutorial();
    case 'guide': return openDocWindow('guide');
    case 'tutorial-doc': return openDocWindow('tutorial');
    case 'tutorial-video': return openDocWindow('video');
    case 'animation': updateSettings({ animation: value, backgroundKind: 'animated' }); return notify('info', t('notice.animation', { name: t(`animation.${value}`) }));
    case 'shuffle': return shuffleBackground();
    case 'background-image': return chooseBackground();
    default: return undefined;
  }
}

function examplesMenu(anchor, group = null) {
  const at = anchor ?? anchorBelow(root.querySelector('[data-menu="file"]'));
  const handlers = {};
  if (!group) {
    const items = SAMPLE_GROUPS.map((g) => { handlers[`custom:group:${g.id}`] = () => examplesMenu(at, g.id); return { id: `custom:group:${g.id}`, label: `${g[lang()]} (${SAMPLE_PROJECTS.filter((x) => x.group === g.id).length})`, icon: g.icon }; });
    return showMenu(items, at, 'context', { handlers, header: { icon: 'samples', title: t('action.openExample') } });
  }
  const g = SAMPLE_GROUPS.find((x) => x.id === group);
  const items = SAMPLE_PROJECTS.filter((x) => x.group === group).map((x) => { handlers[`custom:sample:${x.id}`] = () => openSampleAsk(x.id); return { id: `custom:sample:${x.id}`, label: x[lang()][0], icon: x.icon }; });
  return showMenu(items, at, 'context', { handlers, header: { icon: g?.icon ?? 'samples', title: g?.[lang()] ?? t('action.openExample') } });
}

function templateMenu(anchor) {
  const handlers = Object.fromEntries(TEMPLATES.map(([id]) => [`custom:${id}`, () => newProjectAsk(id)]));
  return showMenu(TEMPLATES.map(([id, glyph]) => ({ id: `custom:${id}`, label: t(`template.${id}`), icon: glyph })), anchor ?? anchorBelow(root.querySelector('[data-menu="file"]')), 'context', { handlers, header: { icon: 'template', title: t('action.newFromTemplate') } });
}

async function recentFoldersMenu(anchor) {
  const handlers = {};
  const items = state.recentDirs.slice(0, 10).map((d, i) => { handlers[`custom:dir:${i}`] = () => openWithDialog(d.path); return { id: `custom:dir:${i}`, label: d.path, icon: 'folder' }; });
  if (!items.length) items.push({ id: 'custom:none', label: t('recent.noFolders'), icon: 'info', disabled: true });
  return showMenu(items, anchor ?? anchorBelow(root.querySelector('[data-menu="file"]')), 'context', { handlers, header: { icon: 'recentFolder', title: t('action.recentFolders') } });
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
  const showStart = state.showStart || !state.doc;
  if (showStart && startBackground) { if (s.backgroundKind === 'animated') startBackground.start(); else { startBackground.stop(); startBackground.draw(); } }
  else startBackground?.stop();
}
let startBackgroundChangedAt = Date.now();
function randomAnimation(current) { const others = ANIMATIONS.filter((k) => k !== current); return others[Math.floor(Math.random() * others.length)]; }
function tickStartBackground() {
  const s = state.settings;
  const showing = (state.showStart || !state.doc) && s.backgroundKind === 'animated' && s.animationInterval > 0 && !document.hidden && !tutorial?.state().active;
  if (!showing) { startBackgroundChangedAt = Date.now(); return; }
  if (Date.now() - startBackgroundChangedAt >= s.animationInterval * 1000) { startBackgroundChangedAt = Date.now(); updateSettings({ animation: randomAnimation(s.animation) }, { quiet: true }); startBackground?.setKind(state.settings.animation); }
}
function shuffleBackground() { const next = (startBackground ?? appBackground)?.shuffle() ?? ANIMATIONS[0]; updateSettings({ animation: next, backgroundKind: 'animated' }); notify('info', t('notice.animation', { name: t(`animation.${next}`) })); }
async function loadBackground() {
  try { state.backgroundUrl = await native.backgroundUrl(state.settings); } catch (error) { state.backgroundUrl = null; showError('error.background', error); }
  updateBackgroundState();
  if (state.showStart || !state.doc) renderStartPage();
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
  document.documentElement.dataset.dark = String(theme.dark);
  native.setWindowTheme(theme.dark);
  if (s.language !== getLanguage()) {
    setLanguage(s.language);
    native.setBackendLanguage(s.language);
    if (previous.language) notify('info', t('notice.language'));
  }
  if (s.backgroundImage !== previous.backgroundImage && previous.backgroundImage !== undefined) loadBackground();
  if (s.theme !== previous.theme && previous.theme) notify('info', t('notice.theme', { name: themeName(s.theme, getLanguage()) }));
  applyCanvasOptions();
  applyViewOptions();
  renderAll();
  updateMinimumWidth();
}

/**
 * The toolbar's theme button: a dropdown menu (not a window) — system, the light and the dark themes (each with
 * its colour swatch, the current one checked), custom, and the theme settings.
 */
/** A random light or dark theme other than the current one. */
function randomTheme() {
  const list = [...LIGHT_THEMES, ...DARK_THEMES].filter((x) => x.id !== state.settings.theme);
  const pick = list[Math.floor(Math.random() * list.length)];
  if (pick) updateSettings({ theme: pick.id });
  return pick?.id;
}

function showThemeDropdown(anchor) {
  const handlers = {};
  const current = state.settings.theme;
  const item = (theme) => { handlers[`custom:theme:${theme.id}`] = () => updateSettings({ theme: theme.id }); return { id: `custom:theme:${theme.id}`, label: themeName(theme.id, lang()), swatch: theme.swatch, checked: current === theme.id }; };
  const group = (key, glyph, list) => ({ id: `custom:group:${key}`, label: t(`theme.group.${key}`), icon: glyph, submenu: true, checked: list.some((x) => x.id === current), children: list.map(item) });
  handlers[`custom:theme:${SYSTEM}`] = () => updateSettings({ theme: SYSTEM });
  handlers[`custom:theme:${CUSTOM}`] = () => updateSettings({ theme: CUSTOM });
  handlers['custom:theme:settings'] = () => popups.open('settings', { tab: 'theme' });
  const items = [
    { id: `custom:theme:${SYSTEM}`, label: themeName(SYSTEM, lang()), icon: 'fullscreen', checked: current === SYSTEM },
    { separator: true },
    group('light', 'sun', LIGHT_THEMES),
    group('dark', 'moon', DARK_THEMES),
    { id: `custom:theme:${CUSTOM}`, label: themeName(CUSTOM, lang()), icon: 'palette', checked: current === CUSTOM },
    { separator: true },
    { id: 'custom:theme:settings', label: t('theme.settings'), icon: 'gear' },
  ];
  const button = root.querySelector('#toolbar [data-command="themeMenu"]');
  return showMenu(items, anchor ?? anchorBelow(button ?? root.querySelector('#toolbar')), 'context', { handlers, header: { icon: 'palette', title: t('action.themeChoose') } });
}

async function openThemePicker(anchor) {
  const element = root.querySelector('.split-button [data-command="themeMenu"]')?.closest('.split-button') ?? root.querySelector('[data-command="themeMenu"]');
  const result = await popups.open('theme', { current: state.settings.theme }, { anchor: anchor ?? anchorBelow(element) });
  if (result?.theme) updateSettings({ theme: result.theme });
}

// ───────────────────────── progress popup

const progressJobs = [];
async function withProgress(titleKey, name, task, { delay = 250, cancellable = false } = {}) {
  const op = `op-${newId()}`;
  let shown = false;
  let last = null;
  const signal = { cancelled: false };
  const job = { op, reopen: null };
  const show = (wait = 0) => { shown = true; popups.open('progress', { title: t(titleKey), icon: PROGRESS_ICONS[titleKey] ?? (titleKey === 'progress.run' ? 'runPlay' : titleKey === 'progress.experiment' ? 'experiment' : 'hourglass'), nameIcon: PROGRESS_NAME_ICONS[titleKey] ?? 'file', name, op, last, cancellable, delay: wait }, { delay: wait }).then((r) => { if (r?.cancel) signal.cancelled = true; }); };
  job.reopen = () => show(0);
  progressJobs.push(job);
  let timer = null;
  if (delay <= 0) { const drawn = popups.whenDrawn('progress'); show(0); await drawn; }
  else if (desktop && !popups.useFrames) show(delay);
  else if (popups.useFrames) { const drawn = popups.whenDrawn('progress', 400); show(delay); await drawn; await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))); }
  else timer = setTimeout(() => show(0), delay);
  const unlisten = await native.listen('io-progress', (progress) => { if (progress.op !== op) return; last = progress; if (shown) popups.post('progress', { type: 'progress', ...progress }); });
  popups.on(`cancel:${op}`, () => { signal.cancelled = true; });
  try {
    return await task(op, (progress) => {
      last = { op, done: Math.round((progress.fraction ?? 0) * 1000), total: 1000, text: progress.text ?? '', icon: progress.icon ?? last?.icon ?? null };
      if (shown) popups.post('progress', { type: 'progress', ...last });
    }, signal);
  } finally {
    clearTimeout(timer);
    unlisten();
    progressJobs.splice(progressJobs.indexOf(job), 1);
    if (shown) {
      popups.post('progress', { type: 'done' });
      const outer = progressJobs.at(-1);
      setTimeout(() => { if (progressJobs.at(-1) !== outer) return; if (outer) outer.reopen(); else popups.hide('progress'); }, 500);
    }
  }
}

// ───────────────────────── menus (popup windows)

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
function withChildren(items, handlers, depth = 0) {
  return items.map((item) => {
    if (!item.submenu || item.children || depth > 3) return item;
    const key = item.id.slice('submenu:'.length);
    const children = SUBMENUS[key] ? menuItems(SUBMENUS[key].items) : null;
    return children ? { ...item, children: withChildren(children, handlers, depth + 1) } : item;
  });
}
async function showMenu(items, anchor, name = 'context', context = {}) {
  state.openMenu = name;
  renderMenubar();
  const header = context.header ?? (MENUS[name] ? { icon: MENU_ICONS[name], title: t(`menu.${name}`) } : { icon: 'fProcess', title: 'MyProductionFlow' });
  context = { ...context, handlers: { ...context.handlers } };
  items = withChildren(items, context.handlers);
  const result = await popups.open('menu', { items, name, header }, { anchor });
  if (state.openMenu === name) { state.openMenu = null; state.lastMenuClose = { name, at: Date.now() }; renderMenubar(); }
  const id = result?.id;
  if (!id) return undefined;
  if (id.startsWith('submenu:')) {
    const key = id.slice('submenu:'.length);
    const at = result.at ?? anchor;
    return showMenu(menuItems(SUBMENUS[key].items), { x: at.x, y: at.y, flipY: at.flipY ?? at.y }, name, { ...context, header: { icon: SUBMENUS[key].icon, title: t(`submenu.${key}`) } });
  }
  if (id.startsWith('custom:')) return context.handlers?.[id]?.();
  return run(id, context);
}
function openMenubarMenu(name) { const el = root.querySelector(`[data-menu="${name}"]`); if (el) showMenu(menuItems(MENUS[name]), anchorBelow(el), name); }

async function openDocWindow(kind) {
  const info = DOC_KINDS[kind];
  if (!info) return undefined;
  popups.hideMenu();
  const url = `${location.pathname}?viewer=${kind}&lang=${lang()}`;
  if (popups.inline) return openDocFrame(kind, url);
  if (!desktop) { globalThis.open(url, `myproductionflow-${docLabel(kind)}`)?.focus?.(); return undefined; }
  const dark = resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme).dark;
  try { await native.invoke('open_doc_window', { kind, title: docWindowTitle(t(info.title)), width: info.width, height: info.height, dark }); } catch (error) { showError('error.docWindow', error); }
  return undefined;
}
function openDocFrame(kind, url) {
  const key = docLabel(kind);
  let f = popups.frames.get(key);
  if (!f) { f = document.createElement('div'); f.className = `web-popup web-popup-doc web-popup-${key}`; f.dataset.kind = key; f.innerHTML = `<iframe title="${escapeHtml(key)}" src="${escapeHtml(url)}"></iframe>`; document.body.append(f); popups.frames.set(key, f); }
  return f;
}
function closeDocFrames() { for (const kind of Object.keys(DOC_KINDS)) if (popups.frames.has(docLabel(kind))) popups.close(docLabel(kind)); }

async function requestExit() { if (desktop) return appWindow.close(); return undefined; }
async function confirmExit() {
  if (!doc()?.dirty) return true;
  const choice = await ask({ kind: 'exit', icon: 'save', title: t('confirm.exitTitle'), message: t('confirm.exitMessage'), items: [docName()], buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }] });
  if (choice === 'save') return saveDoc();
  return choice === 'discard';
}

// ───────────────────────── events

function propValue(b, key, input) {
  const spec = BLOCK_TYPES[b.type].props.find((p) => p.key === key);
  if (!spec) return undefined;
  if (spec.type === 'bool') return input.checked;
  if (spec.type === 'number') { const v = Number(input.value); return Number.isFinite(v) ? Math.max(spec.min ?? -Infinity, Math.min(spec.max ?? Infinity, v)) : spec.def; }
  if (spec.type === 'int') { const v = Math.round(Number(input.value)); return Number.isFinite(v) ? Math.max(spec.min ?? -Infinity, Math.min(spec.max ?? Infinity, v)) : spec.def; }
  return input.value;
}

function bindPanelEvents() {
  const right = root.querySelector('#right-panel');
  right.addEventListener('change', (event) => {
    const el = event.target;
    const m = model();
    if (!m) return;
    const b = state.selection.length === 1 ? blockById(m, state.selection[0]) : null;
    if (el.matches('[data-rename]') && b) { renameTo(b, el.value); return; }
    if (el.dataset.prop && b) { const v = propValue(b, el.dataset.prop, el); change('op.edit', (mm) => { blockById(mm, b.id).props[el.dataset.prop] = v; }); return; }
    if (el.dataset.pos && b) { const v = Number(el.value); if (!Number.isFinite(v)) return; change('op.move', (mm) => { const x = blockById(mm, b.id); x[el.dataset.pos] = el.dataset.pos === 'w' || el.dataset.pos === 'h' ? Math.max(0.5, v) : v; }); return; }
    if (el.dataset.distKind && b) { const key = el.dataset.distKind; change('op.edit', (mm) => { const x = blockById(mm, b.id); x.props[key] = defaultDist(el.value, distMean(x.props[key]) || 10); }); return; }
    if (el.dataset.dist && b) { const [key, param] = el.dataset.dist.split(':'); const text = ['values', 'weights', 'expr'].includes(param); change('op.edit', (mm) => { const x = blockById(mm, b.id); x.props[key] = { ...x.props[key], [param]: text ? el.value : Number(el.value) || 0 }; }); return; }
    if (el.dataset.list && b) {
      const [key, i, field] = el.dataset.list.split(':');
      const numeric = el.type === 'number';
      change('op.edit', (mm) => { const x = blockById(mm, b.id); const rows = structuredClone(x.props[key] ?? []); rows[Number(i)][field] = numeric ? Number(el.value) : el.value; x.props[key] = rows; });
      return;
    }
    if (el.dataset.model) { const key = el.dataset.model; const v = el.type === 'checkbox' ? el.checked : key === 'timeUnit' || key === 'sdMethod' ? el.value : Number(el.value); if (typeof v === 'number' && !Number.isFinite(v)) return; change('op.settings', (mm) => { mm.settings[key] = v; }); return; }
    if (el.dataset.modelText) { change('op.settings', (mm) => { mm[el.dataset.modelText] = el.value; }); renderTitleProject(); }
  });
  right.addEventListener('input', (event) => {
    const el = event.target;
    if (el.dataset.liveParam !== undefined && state.sim) {
      state.sim.setParameter(el.dataset.liveParam, Number(el.value));
      const b = blockById(model(), state.selection[0]);
      if (b) b.props.value = Number(el.value);
      const out = el.parentElement.querySelector('output'); if (out) out.textContent = fmtNum(el.value, 4);
    }
    if (el.matches('[data-explorer-search]')) { state.explorerQuery = el.value; renderExplorer(); }
  });
  right.addEventListener('click', (event) => {
    const target = event.target;
    const m = model();
    const rowSel = target.closest('[data-select-block]');
    if (rowSel) { const id = rowSel.dataset.selectBlock; setSelection(event.ctrlKey || event.metaKey ? [...state.selection, id] : [id]); if (event.detail === 2) zoomToSelection(); return; }
    const group = target.closest('[data-toggle-group]');
    if (group) { const g = group.dataset.toggleGroup; if (state.collapsed.has(g)) state.collapsed.delete(g); else state.collapsed.add(g); renderExplorer(); return; }
    const sec = target.closest('[data-toggle-section]');
    if (sec) { const s = sec.dataset.toggleSection; if (state.closedSections.has(s)) state.closedSections.delete(s); else state.closedSections.add(s); renderProperties(); return; }
    const b = state.selection.length === 1 ? blockById(m, state.selection[0]) : null;
    const add = target.closest('[data-list-add]');
    if (add && b) {
      const key = add.dataset.listAdd;
      const states = (b.props.states ?? []).map((s) => s.name);
      const fresh = { types: { name: `Type${(b.props.types?.length ?? 0) + 1}`, color: '#64748b', weight: 1 }, schedule: { start: 0, end: 60, value: 1 }, states: { name: `State${(b.props.states?.length ?? 0) + 1}`, color: '#94a3b8' }, transitions: { from: states[0] ?? '', to: states[1] ?? states[0] ?? '', kind: 'rate', value: 0.1, trigger: states[0] ?? '', radius: 1 } }[key];
      change('op.edit', (mm) => { const x = blockById(mm, b.id); x.props[key] = [...(x.props[key] ?? []), fresh]; });
      return;
    }
    const del = target.closest('[data-list-del]');
    if (del && b) { const [key, i] = del.dataset.listDel.split(':'); change('op.edit', (mm) => { const x = blockById(mm, b.id); x.props[key] = (x.props[key] ?? []).filter((_, k) => k !== Number(i)); }); }
  });
  const left = root.querySelector('#left-panel');
  left.addEventListener('click', (event) => {
    const cat = event.target.closest('[data-lib-cat]');
    if (cat) { state.libraryCategory = cat.dataset.libCat; renderLeft(); return; }
    const card = event.target.closest('[data-lib-type]');
    if (card) { if (state.placing === card.dataset.libType) { canvas.cancelPlace(); state.placing = null; renderLeft(); } else startPlacing(card.dataset.libType); }
  });
  left.addEventListener('input', (event) => { if (event.target.matches('[data-lib-search]')) { state.libraryQuery = event.target.value; renderLeft(); } });
  left.addEventListener('dragstart', (event) => {
    const card = event.target.closest('[data-lib-type]');
    if (!card) return;
    if (!canEdit()) { event.preventDefault(); notify('warning', t(hasDoc() ? 'notice.stopToEdit' : 'notice.openFirst')); return; }
    if (state.settings.viewMode === '3d') setViewMode('split');
    event.dataTransfer.setData('application/x-mpf-block', card.dataset.libType);
    event.dataTransfer.effectAllowed = 'copy';
  });
  const bottom = root.querySelector('#bottom-panel');
  bottom.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-bottom-tab]');
    if (tab) { state.bottomTab = tab.dataset.bottomTab; updateSettings({ bottomTab: state.bottomTab }, { quiet: true }); renderBottom(); return; }
    const apply = event.target.closest('[data-apply]');
    if (apply && !apply.disabled) { applyFix(apply.dataset.apply); return; }
    const scen = event.target.closest('[data-scenario-remove]');
    if (scen) { doc()?.scenarios?.splice(Number(scen.dataset.scenarioRemove), 1); renderBottom(); return; }
    if (event.target.closest('[data-scenario-clear]')) { if (doc()) doc().scenarios = []; renderBottom(); return; }
    const f = event.target.closest('[data-problem-filter]');
    if (f) { state.problemFilter = f.dataset.problemFilter; renderBottom(); return; }
    const pick = event.target.closest('[data-select-block]');
    if (pick) { setSelection([pick.dataset.selectBlock]); zoomToSelection(); return; }
    const byName = event.target.closest('[data-select-name]');
    if (byName) { const b = model()?.blocks.find((x) => x.name === byName.dataset.selectName); if (b) { setSelection([b.id]); } return; }
    const del = event.target.closest('[data-chart-del]');
    if (del) { const i = Number(del.dataset.chartDel); change('op.delete', (m) => m.charts.splice(i, 1)); renderBottom(); return; }
    const edit = event.target.closest('[data-chart-edit]');
    if (edit) editChart(Number(edit.dataset.chartEdit));
  });
  root.querySelector('#run-bar').addEventListener('change', (event) => { if (event.target.matches('[data-run-speed]')) setSpeed(event.target.value); });
}

function bindEvents() {
  root.addEventListener('click', (event) => {
    const target = event.target;
    const menu = target.closest('[data-menu]');
    if (menu) { const name = menu.dataset.menu; if (state.lastMenuClose.name === name && Date.now() - state.lastMenuClose.at < 300) return undefined; return openMenubarMenu(name); }
    if (target.closest('[data-home]')) return showStartPage(!state.showStart || !state.doc);
    const start = target.closest('[data-start]');
    if (start && !start.disabled) return onStartAction(start);
    const more = target.closest('[data-toolbar-more]');
    if (more) return showToolbarMore(more);
    const command = target.closest('[data-command]');
    if (command && !command.disabled) {
      const id = command.dataset.command;
      const anchored = ['themeMenu', 'exportMenu', 'recentFolders', 'newFromTemplate', 'openExample', 'speedMenu'].includes(id);
      return run(id, { anchor: anchored ? anchorBelow(command.closest('.split-button') ?? command) : undefined });
    }
    const windowControl = target.closest('[data-window]');
    if (windowControl) return windowButton(windowControl.dataset.window);
    return undefined;
  });
  root.addEventListener('change', (event) => {
    const el = event.target;
    if (el.matches('[data-start-toggle]')) updateSettings({ showStartPage: el.checked }, { quiet: true });
    if (el.matches('[data-start-random]')) updateSettings({ animationRandom: el.checked }, { quiet: true });
    if (el.matches('[data-start-interval]')) updateSettings({ animationInterval: Number(el.value) }, { quiet: true });
  });
  root.addEventListener('input', (event) => {
    const el = event.target;
    if (el.matches('[data-start-speed]')) { state.settings.animationSpeed = Number(el.value); el.nextElementSibling.textContent = `${el.value}%`; storeSettings(globalThis.localStorage, state.settings); }
    if (el.matches('[data-start-opacity]')) { state.settings.startCardOpacity = Number(el.value); el.nextElementSibling.textContent = `${el.value}%`; root.querySelector('.start-inner')?.style.setProperty('--start-card-alpha', `${el.value}%`); storeSettings(globalThis.localStorage, state.settings); }
  });
  bindPanelEvents();

  root.querySelectorAll('[data-split="left"], [data-split="right"]').forEach((splitter) => splitter.addEventListener('pointerdown', (event) => {
    const side = splitter.dataset.split;
    if ((side === 'left' && !state.settings.showLeftPanel) || (side === 'right' && !state.settings.showRightPanel)) return;
    event.preventDefault();
    const key = side === 'left' ? 'leftWidth' : 'rightWidth';
    const startWidth = state.settings[key];
    pointerDrag(event, {
      cursor: 'col-resize',
      move: (dx) => { const width = Math.max(side === 'left' ? PANEL_MIN.left : PANEL_MIN.right, Math.min(700, startWidth + (side === 'left' ? dx : -dx))); root.style.setProperty(side === 'left' ? '--left-width' : '--right-width', `${width}px`); state.settings[key] = width; layoutViews(); },
      end: (e, moved) => { if (moved) updateSettings({ [key]: state.settings[key] }, { quiet: true }); },
    });
  }));
  root.querySelector('[data-split="bottom"]')?.addEventListener('pointerdown', (event) => {
    if (!state.settings.showBottomPanel) return;
    event.preventDefault();
    const start = state.settings.bottomHeight;
    pointerDrag(event, {
      cursor: 'row-resize',
      move: (dx, dy) => { const h = Math.max(PANEL_MIN.bottom, Math.min(window.innerHeight * 0.6, start - dy)); root.style.setProperty('--bottom-height', `${h}px`); state.settings.bottomHeight = Math.round(h); layoutViews(); },
      end: (e, moved) => { if (moved) updateSettings({ bottomHeight: state.settings.bottomHeight }, { quiet: true }); },
    });
  });
  root.querySelector('[data-split="views"]')?.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const host = root.querySelector('#views');
    const width = host.getBoundingClientRect().width;
    const start = state.settings.splitRatio;
    pointerDrag(event, {
      cursor: 'col-resize',
      move: (dx) => { state.settings.splitRatio = Math.max(20, Math.min(80, start + (dx / width) * 100)); layoutViews(); },
      end: (e, moved) => { if (moved) updateSettings({ splitRatio: Math.round(state.settings.splitRatio) }, { quiet: true }); },
    });
  });
  root.querySelector('[data-split="explorer"]')?.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const panel = root.querySelector('#right-panel').getBoundingClientRect();
    const start = state.settings.explorerHeight;
    pointerDrag(event, {
      cursor: 'row-resize',
      move: (dx, dy) => { state.settings.explorerHeight = Math.max(15, Math.min(80, start + (dy / panel.height) * 100)); root.style.setProperty('--explorer-height', `${state.settings.explorerHeight}%`); },
      end: (e, moved) => { if (moved) updateSettings({ explorerHeight: Math.round(state.settings.explorerHeight) }, { quiet: true }); },
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
  window.addEventListener('resize', frameThrottle(() => { fitToolbar(); layoutViews(); /* the OS keeps the minimum (setMinimumSize); resizing it here again fought the drag and shook the right edge */ }));
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) { const previous = state.settings; state.settings = loadSettings(globalThis.localStorage); applySettings(previous); }
    else if (event.key === RECENT_KEY || event.key === RECENT_DIRS_KEY) { state.recent = loadRecent(globalThis.localStorage); state.recentDirs = loadRecentDirs(globalThis.localStorage); if (state.showStart || !state.doc) renderStartPage(); }
  });
  if (!desktop) {
    document.addEventListener('dragover', (event) => { if ([...(event.dataTransfer?.types ?? [])].includes('Files')) event.preventDefault(); });
    document.addEventListener('drop', (event) => { const file = event.dataTransfer?.files?.[0]; if (!file) return; event.preventDefault(); file.text().then((text) => openContent(file.name, text)); });
    window.addEventListener('beforeunload', (event) => { if (doc()?.dirty) { event.preventDefault(); event.returnValue = ''; } });
  }
  setInterval(() => { const clock = root.querySelector('#status-clock'); if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 15000);
}

/** Ctrl+key shortcuts: [key, shift, command]. */
const SHORTCUTS = [
  ['n', false, 'new'], ['o', false, 'open'], ['s', false, 'save'], ['s', true, 'saveAs'], ['p', false, 'print'], ['w', false, 'closeProject'],
  ['z', false, 'undo'], ['y', false, 'redo'], ['z', true, 'redo'], ['x', false, 'cut'], ['c', false, 'copy'], ['v', false, 'paste'], ['d', false, 'duplicate'],
  ['a', false, 'selectAll'], ['e', true, 'exportImage'], ['r', false, 'report'], ['x', true, 'experiment'], ['0', false, 'fit'], ['1', false, 'viewMode:2d'], ['2', false, 'viewMode:3d'], ['3', false, 'viewMode:split'],
  [',', false, 'settings'], ['l', true, 'language'], ['h', true, 'startPage'], ['j', false, 'bottomPanel'], ['q', false, 'exit'],
];
const LETTERS = { v: 'tool:select', c: 'tool:connect', h: 'tool:pan', r: 'rotate90', g: 'grid', '+': 'zoomIn', '=': 'zoomIn', '-': 'zoomOut', ']': 'speedUp', '[': 'speedDown' };

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  if (tutorial?.active && key === 'escape') { event.preventDefault(); tutorial.stop(); return; }
  const editing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const mod = event.ctrlKey || event.metaKey;
  if (mod && !event.altKey) {
    if (editing && ['x', 'c', 'v', 'z', 'y', 'a'].includes(key)) return;
    const shortcut = SHORTCUTS.find(([k, shift]) => k === key && shift === event.shiftKey);
    if (shortcut) { event.preventDefault(); event.stopPropagation(); run(shortcut[2]); }
    return;
  }
  const fkeys = { f1: 'about', f2: 'rename', f6: 'step', f7: 'runToEnd', f8: 'checkNow', f11: 'tutorial' };
  if (key === 'f5') { event.preventDefault(); run(event.shiftKey ? 'stop' : 'runPause'); return; }
  if (fkeys[key]) { event.preventDefault(); run(fkeys[key]); return; }
  if (editing) { if (key === 'escape') event.target.blur(); return; }
  if (!hasDoc()) return;
  if (key === 'delete' || key === 'backspace') { event.preventDefault(); run('delete'); return; }
  if (key === 'escape') { event.preventDefault(); if (state.placing) { canvas.cancelPlace(); state.placing = null; renderLeft(); } else if (state.tool !== 'select') setTool('select'); else setSelection([]); return; }
  if (key.startsWith('arrow') && state.selection.length) {
    event.preventDefault();
    const step = event.shiftKey ? 5 : state.settings.snapStep || 0.5;
    nudge(key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0, key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0);
    return;
  }
  if (key === ' ' && !event.target.closest?.('.flow-canvas')) { event.preventDefault(); run('runPause'); return; }
  const id = LETTERS[key];
  if (id && !event.altKey) { event.preventDefault(); run(id); }
}

function bindPopupActions() {
  popups.on('error', (error) => showError('error.unexpected', error));
  popups.on('report-error', (data) => showError(data.titleKey ?? 'error.unexpected', Object.assign(new Error(data.message), { stack: data.detail ?? '' }), data.context ?? ''));
  popups.on('choose-background', () => chooseBackground());
  popups.on('clear-background', () => removeBackground());
  popups.on('shuffle-background', () => shuffleBackground());
  popups.on('open-recent', (data) => openRecent(data.path));
  popups.on('open-folder', (data) => openWithDialog(data.path));
  popups.on('notice', (data) => notify(data.kind ?? 'info', data.text));
  popups.on('open-settings', (data) => popups.open('settings', { tab: data.tab ?? 'general', themeGroup: data.themeGroup }));
  popups.on('start-tutorial', () => startTutorial());
  popups.on('show-start', () => showStartPage(true));
  popups.on('progress-cancel', (data) => { popups.actions.get(`cancel:${data.op}`)?.(); });
  popups.on('raise-test-panic', () => native.invoke('raise_test_panic').catch((error) => showError('error.unexpected', error)));
  popups.on('report-save-html', () => saveReport('html'));
  popups.on('report-save', (data) => saveReport(data.format, data.sections));
  popups.on('open-print', () => openPrint());
  popups.on('report-images', (data) => popups.post(data.kind, { type: 'report-images', images: state.reportImages ?? {} }));
  popups.on('print-setup', (data) => updateSettings({ printSetup: data.setup }, { quiet: true }));
  popups.on('print-save-pdf', async (data) => { state.settings.printSetup = data.setup; await saveReport('pdf', data.sections); });
  popups.on('report-save-csv', () => run('exportStatsCsv'));
}

// ───────────────────────── tutorial

let tutorial = null;
async function startTutorial(options = {}) {
  tutorial ??= new Tutorial(appApi, root.querySelector('#tutorial-layer'));
  updateSettings({ tutorialOffered: true }, { quiet: true });
  await tutorial.start(options);
}

// ───────────────────────── start-up

async function restoreSession() {
  if (!desktop || !state.settings.restoreSession) return;
  if (state.instance && !state.instance.first) return;
  let files = [];
  try { files = JSON.parse(globalThis.localStorage?.getItem(SESSION_KEY) ?? '{}').files ?? []; } catch { /* none */ }
  if (!files.length) return;
  const exists = await native.pathsExist(files);
  if (exists[0]) await openPath(files[0]);
}

/** What the tutorial and tests use. */
const appApi = {
  state, t, run, commands, popups, notify, showError, change, setSelection, setTool, startPlacing, placeBlock, connect, newProject, showStartPage, updateSettings, renderAll,
  settings: () => state.settings, model, anchorBelow, openMenubarMenu, openDocWindow, closeDocFrames, closeProject, ask, setViewMode, runPause, stopRun, runToEnd, stepOnce,
  version: () => state.info?.version ?? VERSION,
  get canvas() { return canvas; }, get view3d() { return view3d; },
  takeDoc: () => state.doc, putDoc: (d) => { if (d) setDoc(d); else closeProject({ force: true }); },
  openSample: (id) => { const s = SAMPLE_PROJECTS.find((x) => x.id === id); const m = buildSample(id); m.name = s[lang()][0]; setDoc(new Doc(m, { name: `${s[lang()][0]}.mpf` })); return state.doc; },
  openTemplate: (id) => newProject(id),
};

async function start() {
  renderShell();
  mountViews();
  bindEvents();
  bindPopupActions();
  await popups.init();
  const welcomeLikely = desktop && state.settings.showWelcome && state.settings.showStartPage !== false && !globalThis.__MYPRODUCTIONFLOW_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome');
  if (welcomeLikely) popups.prewarm('welcome');
  state.info = await native.appInfo().catch(() => null);
  state.instance = await native.instanceInfo().catch(() => ({ first: true, others: 0 }));
  state.bottomTab = state.settings.bottomTab;
  if (state.settings.animationRandom) updateSettings({ animation: randomAnimation(state.settings.animation) }, { quiet: true });
  setInterval(tickStartBackground, 1000);
  document.title = `MyProductionFlow v${state.info?.version ?? VERSION}`;
  native.setBackendLanguage(state.settings.language);
  applySettings({});
  await loadBackground();
  if (desktop) {
    appWindow.onCloseRequested(async (event) => {
      if (state.quitting) return;
      event.preventDefault();
      if (await confirmExit()) { state.quitting = true; await native.quitApp(); }
    });
    getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') { const path = (event.payload.paths ?? []).find((p) => /\.(mpf|json)$/i.test(p)); if (path) openPath(path); }
    });
    native.listen('fatal-error', (fatal) => { const error = new Error(fatal.message); error.stack = [fatal.location, fatal.backtrace].join('\n'); showError('error.fatal', error, fatal.location); });
  }
  await restoreSession();
  trackMaximized();
  for (const path of await native.startupFiles().catch(() => [])) await openPath(path);
  const sampleParam = new URLSearchParams(location.search).get('sample');
  if (sampleParam && SAMPLE_PROJECTS.some((s) => s.id === sampleParam)) appApi.openSample(sampleParam);
  if (!state.doc && !state.settings.showStartPage) newProject('flow');
  state.showStart = !state.doc;
  renderAll();
  const welcome = state.settings.showWelcome && state.showStart && !globalThis.__MYPRODUCTIONFLOW_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome');
  // The window opens at its minimum width (measured from the menu bar and the toolbar).
  if (desktop) {
    for (let i = 0; i < 30 && !state.minWidth; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
    if (state.minWidth) await native.startAtWidth(state.minWidth).catch(() => {});
  }
  if (desktop) await appWindow.show();
  if (welcome) openWelcome();
  else if (welcomeLikely) popups.close('welcome');
  if (desktop) {
    if (!welcome) await appWindow.setFocus();
    const warm = () => { popups.prewarm('menu').then(() => popups.prewarm('progress', { warm: true })); };
    if (welcome) popups.whenDrawn('welcome', 1500).then(() => setTimeout(warm, 200)); else setTimeout(warm, 400);
  } else {
    const warm = () => setTimeout(() => popups.prewarm('progress', { warm: true }), 300);
    if (welcome) popups.whenDrawn('welcome', 3000).then(warm); else warm();
  }
}

async function openWelcome() {
  // Only over the start page (never over a model or the tutorial).
  if (!state.showStart || tutorial?.state().active) return;
  updateSettings({ tutorialOffered: true }, { quiet: true });
  const result = await popups.open('welcome', {});
  if (!state.showStart) return;
  if (result?.choice === 'tutorial') startTutorial();
  else if (result?.choice === 'sample') openSampleAsk('line');
}

// Test hook: E2E suites and the smoke script drive the app through this.
window.__myproductionflow = {
  state, t, commands, popups, run,
  menus: { MENUS, SUBMENUS, enabled: (id) => commandEnabled(id) },
  api: appApi,
  get canvas() { return canvas; },
  get view3d() { return view3d; },
  actions: { newProject, openSampleAsk, openContent, saveDoc, closeProject, setSelection, change, undo, redo, setTool, startPlacing, placeBlock, connect, runPause, stopRun, runToEnd, stepOnce, setSpeed, runExperiment, experimentCsv, saveScenario, toggleRecording, toggleFollow, recorder: () => recorder, reportDocument, saveReport, showStartPage, updateSettings, setViewMode, deleteSelection, duplicateSelection, reportHtml, resultsCsv, seriesCsv },
  domain: { BLOCK_TYPES, SAMPLE_PROJECTS, TEMPLATES, tutorialSteps: () => TUTORIAL_STEPS.length },
  tutorial: () => tutorial,
};

start()
  .catch((error) => showError('error.unexpected', error, 'start'))
  .finally(() => { if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {}); });
