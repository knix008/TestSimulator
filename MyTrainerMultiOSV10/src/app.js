// The main window: menu bar (with the window buttons — there is no system title
// bar), toolbar, the layer palette (left), the five work tabs — Data, Model,
// Code, Train, Test — with the start page in front, the inspector (right), the
// bottom panel (console, model summary, problems) and the status bar.
//
// The project (dataset recipe, model graph, training settings, code) is the one
// source of truth; every change goes through commit() (undo history, dirty flag,
// shapes and problems recomputed, generated code refreshed). The engines (engine/
// engines.js) train and answer probes; their messages update `state.run`,
// `state.snapshot` (what the probe input does in every node) and the views.
import { getCurrentWindow } from '@tauri-apps/api/window';
import appIcon from '../assets/icon-256.png';
import { generatePytorch } from './domain/codegen.js';
import { describeTable, fromSource, generatorDefaults, parseCsv, prepareSounds, sampleX, sampleY, soundsReady } from './domain/datasets.js';
import {
  addBlock, addNode, addResidual, canConnect, cleanName, cloneModel, connect, duplicateNodes, incoming, inferShapes, insertAfter, insertBefore,
  layoutModel, NODE_H, nodeById, outputNodes, removeEdge, removeNodes, replaceType, setParam, topoOrder, totalParams, validateModel,
} from './domain/graph.js';
import { BLOCK_IDS, BLOCKS, LAYER_GROUPS, LAYERS, parseShape, shapeText } from './domain/layers.js';
import { evaluationReport } from './domain/metrics.js';
import { cleanSplit, cleanSteps, newStep, prepare, transformInput } from './domain/preprocess.js';
import { baseName, cleanTrain, effectiveTask, newProject, normalizeProject, parseProject, serializeProject, stripExtension } from './domain/project.js';
import { sampleProject } from './domain/samples.js';
import { addRecent, ANIMATIONS, History, loadRecent, loadSettings, removeRecent, SESSION_KEY, storeRecent, storeSettings, VIEW_TABS } from './domain/settings.js';
import { TfEngine, TorchEngine } from './engine/engines.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { PopupHost, popupKey, POPUPS, themesPopupSize } from './platform/popups.js';
import { bindSteppers } from './stepper.js';
import { applyFont, applyTheme, CUSTOM, customFrom, DARK_THEMES, DOC_THEME_KEY, docTheme, LIGHT_THEMES, randomThemeId, resolveTheme, SYSTEM } from './themes.js';
import { AnimatedBackground } from './ui/background.js';
import { CodeView } from './ui/codeview.js';
import { dataViewHtml, drawDataView } from './ui/dataview.js';
import { escapeHtml, dragPointer } from './ui/dom.js';
import { drawFrameStrip, drawSpectrogram, playWave } from './ui/media.js';
import { barChart, CLASS_COLORS, drawPicture, setupCanvas } from './ui/charts.js';
import { textMenuItems } from './ui/contextmenu.js';
import { describeOutput, exampleFile, examplesFor, inputKindFor, inputsFromFiles, resultsCsv } from './ui/batchrun.js';
import { GraphView } from './ui/graphview.js';
import { drawInspector, inspectorHtml } from './ui/inspector.js';
import { NeuronView } from './ui/neuronview.js';
import { encodePrompt, parseSoundBank, sampleToken, SOUND_BANKS, tokensText, toMulaw } from './domain/datasets-media.js';
import { decodeSound, loudestWindow } from './ui/batchrun.js';
import { generateC } from './domain/export-c.js';
import { modelBudget, shortBytes, shortCount } from './domain/budget.js';
import { generateOnnx } from './domain/export-onnx.js';
import { zipBlob } from './platform/zip.js';
import { defaultReportSettings, renderPages, toCsv, toDocx, toMarkdown, toPdf } from './report/report.js';
import { confusionChart, lineChart, SERIES } from './ui/charts.js';
import { canonicalWeights } from './engine/tfbuild.js';
import { decodePicture, IMAGE_ACCEPT, IMAGE_EXTENSIONS, isImageName } from './ui/imagedecode.js';
import { clipFrom, LiveCamera, LiveMicrophone, pictureFrom, speechInput } from './ui/live.js';

const AUDIO_EXTENSIONS = ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'webm'];
import { startPageHtml } from './ui/startpage.js';
import { drawTestView, testViewHtml } from './ui/testview.js';
import { drawTrainView, statusText, trainViewHtml } from './ui/trainview.js';

const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const root = document.querySelector('#app');
const popups = new PopupHost();
const storage = globalThis.localStorage;
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);

const state = {
  settings: loadSettings(storage),
  recent: loadRecent(storage),
  project: newProject(t('project.untitled')),
  path: null,
  webHandle: null,
  dirty: false,
  history: new History(120),
  showStart: true,
  view: { tab: 'model', dataStage: 'raw', dataPage: 0, bottomTab: 'console' },
  data: null,
  dataError: null,
  prepared: null,
  tableRows: null,
  shapes: new Map(),
  problems: [],
  task: null,
  selectedUnit: null,
  engine: null,
  engineKey: null,
  run: { state: 'idle', epoch: 0, epochs: 0, from: 0, history: [], canContinue: false },
  live: { mode: null, camera: false, busy: false, result: null, preview: null, level: 0, error: null, recent: [] },
  snapshot: null,
  visual: { boundary: null, curve: null },
  evaluation: null,
  report: null,
  test: { mode: 'sample', index: 0, errorsOnly: false, cell: null, brush: 2, sentence: '', values: [], point: null },
  batch: { items: [], running: false, selected: null, message: null },
  console: [],
  python: null,
  openMenu: null,
  notice: null,
  maximized: false,
  backend: null,
};
const engines = { tfjs: new TfEngine(), torch: desktop ? new TorchEngine() : null };

// ───────────────────────── small helpers

const lang = () => getLanguage();
const isDark = () => resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme).dark;
const model = () => state.project.model;
const selectedNodes = () => [...(graphView?.selection ?? [])];
const outputId = () => outputNodes(model())[0]?.id ?? null;
const inputId = () => model().nodes.find((node) => node.type === 'input')?.id ?? null;
const busy = () => state.run.state === 'training' || state.run.state === 'paused' || state.run.state === 'preparing';

function notify(text, kind = 'info') {
  state.notice = { text, kind, at: Date.now() };
  renderStatus();
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { state.notice = null; renderStatus(); }, kind === 'error' ? 12000 : 6000);
}

function log(text, level = 'info') {
  state.console.push({ time: new Date(), level, text: String(text) });
  if (state.console.length > 3000) state.console.splice(0, state.console.length - 3000);
  if (state.view.bottomTab === 'console') renderConsole(true);
}

function problemText(problem) {
  const params = { ...problem.params };
  const node = problem.nodeId ? nodeById(model(), problem.nodeId) : null;
  return `${node ? `${node.name}: ` : ''}${t(problem.code, params, problem.code)}`;
}

function updateSettings(patch, { quiet = false } = {}) {
  state.settings = { ...state.settings, ...patch };
  storeSettings(storage, state.settings);
  if ('language' in patch) { setLanguage(state.settings.language); native.setBackendLanguage(state.settings.language); }
  if ('theme' in patch || 'customTheme' in patch) applyLook();
  if (['fontFamily', 'fontSize', 'fontWeight', 'fontStyle'].some((key) => key in patch)) applyFont(state.settings);
  if (!quiet) renderAll();
}

function applyLook() {
  const theme = resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme);
  applyTheme(theme);
  // The user's guide follows the app's theme (it reads this, also while open).
  try { localStorage.setItem(DOC_THEME_KEY, JSON.stringify(docTheme(theme))); } catch { /* storage unavailable */ }
  native.setWindowTheme(theme.dark);
  codeView?.applyLook();
}

// ───────────────────────── the project: data, shapes, problems, code

function signature() {
  const m = model();
  return JSON.stringify({ n: m.nodes.map((node) => [node.id, node.type, node.params]), e: m.edges.map((edge) => [edge.from, edge.to]), i: state.prepared?.inputShape ?? null });
}

/** Builds the dataset and runs the preprocessing pipeline. */
/** Built-in sound banks, loaded once (public/datasets/*.bin). */
const soundBanks = new Map();
/** Per bank: { voices, counts {label: clips}, total } for the Data tab. */
const bankInfo = new Map();
function loadSoundBank(id) {
  if (soundBanks.has(id)) return;
  soundBanks.set(id, null);
  fetch(SOUND_BANKS[id].file)
    .then((response) => { if (!response.ok) throw new Error(`${SOUND_BANKS[id].file}: HTTP ${response.status}`); return response.arrayBuffer(); })
    .then((buffer) => {
      const bank = parseSoundBank(buffer);
      soundBanks.set(id, bank.clips);
      const counts = {};
      for (const clip of bank.clips) counts[clip.label] = (counts[clip.label] ?? 0) + 1;
      bankInfo.set(id, { voices: bank.index.voices?.length ?? new Set(bank.clips.map((clip) => clip.voice)).size, counts, total: bank.clips.length });
      if (state.project.dataset.source.bank === id) { rebuildData(); renderAll(); }
    })
    .catch((error) => { soundBanks.delete(id); reportError(error, 'sounds'); });
}

/**
 * Work that may take a while, with a progress popup: shown only if it is still running after 400 ms.
 * update(share 0…1, message) moves the bar; done() closes it.
 */
function progressTask(title, message = '') {
  let shown = false; let closed = false;
  let params = { title, message, percent: 0 };
  const write = () => { try { localStorage.setItem(popupKey('progress'), JSON.stringify(params)); } catch { /* the popup shows its defaults */ } };
  const timer = setTimeout(() => { if (closed) return; shown = true; popups.open('progress', params); }, 400);
  let last = 0;
  return {
    update(share, text = params.message) {
      params = { ...params, message: text, percent: Math.round(Math.max(0, Math.min(1, share)) * 100) };
      if (!shown || Date.now() - last < 120) return;
      last = Date.now();
      write();
      popups.post('progress', { type: 'refresh' });
    },
    done() { closed = true; clearTimeout(timer); if (shown) popups.close('progress'); },
  };
}

/** A sounds dataset is made in the background (with a progress popup); rebuildData then finds it ready. */
let soundsBuild = null;
function buildSoundsInBackground(source, clips) {
  if (soundsBuild?.clips === clips && soundsBuild.key === JSON.stringify(source)) return;
  const task = progressTask(t('progress.dataTitle'), t('progress.dataMessage', { n: clips.length }));
  const build = { clips, key: JSON.stringify(source) };
  soundsBuild = build;
  prepareSounds(source, clips, (share) => task.update(share))
    .then(() => { if (soundsBuild !== build) return; soundsBuild = null; rebuildData(); renderAll(); })
    .catch((error) => { if (soundsBuild === build) soundsBuild = null; reportError(error, 'sounds'); })
    .finally(() => task.done());
}

function rebuildData() {
  const ds = state.project.dataset;
  state.dataError = null;
  try {
    if (ds.source.kind === 'table') state.tableRows ??= parseCsv(ds.source.text).rows;
    let sounds = null;
    if (ds.source.kind === 'sounds' && ds.source.bank) {
      sounds = soundBanks.get(ds.source.bank) ?? null;
      if (!sounds) loadSoundBank(ds.source.bank);
      else if (!soundsReady(ds.source, sounds)) {
        buildSoundsInBackground(ds.source, sounds);
        throw new Error('data.preparingSounds');
      }
    }
    const data = fromSource(ds.source, { rows: state.tableRows, decode: native.base64ToBytes, sounds });
    state.data = data;
    state.prepared = prepare(data, ds.steps, ds.split);
    if (!state.prepared.train.n) throw new Error(t('data.noTrain'));
  } catch (error) {
    state.data = null;
    state.prepared = null;
    state.dataError = t(String(error.message), null, String(error.message));
  }
  // The input layer follows the data.
  const input = model().nodes.find((node) => node.type === 'input');
  if (input && state.prepared) input.params.shape = state.prepared.inputShape.join(', ');
  state.test.index = Math.min(state.test.index, Math.max(0, (state.prepared?.test.n || state.prepared?.val.n || 1) - 1));
  state.test.values = state.data && state.data.inputShape.length === 1 ? Array.from(sampleX(state.data, 0)).map((v) => Number(v.toFixed(3))) : [];
  state.test.sentence = state.data?.kind === 'tokens' ? tokensText(sampleX(state.data, 0), state.data) : '';
  state.test.generation = null;
  analyse();
}

/** Shapes, problems, the task as the model sees it, and the generated code. */
function analyse() {
  const inputShape = state.prepared?.inputShape ?? null;
  state.shapes = inferShapes(model(), inputShape);
  state.task = state.prepared ? effectiveTask(state.prepared.task, model(), inputShape) : null;
  state.problems = validateModel(model(), state.task, state.shapes);
  if (!state.project.code.custom) state.project.code.text = generatedCode();
}

function generatedCode() {
  return generatePytorch({ project: state.project, task: state.task, inputShape: state.prepared?.inputShape ?? null, hooks: state.settings.codeHooks, device: state.settings.torchDevice }).code;
}

function snapshotOfProject() {
  const p = state.project;
  return structuredClone({ name: p.name, description: p.description, dataset: p.dataset, model: p.model, train: p.train, engine: p.engine, code: p.code });
}

/** After every change: history, dirty, analysis, views. `data` = the dataset recipe changed too. */
function commit(label = 'edit', { data = false, render = true } = {}) {
  if (data) { state.tableRows = state.project.dataset.source.kind === 'table' ? null : state.tableRows; rebuildData(); } else analyse();
  state.history.push(snapshotOfProject());
  state.dirty = true;
  void label;
  if (render) renderAll();
  saveSession();
}

function restore(snapshot) {
  if (!snapshot) return;
  const dataChanged = JSON.stringify(snapshot.dataset) !== JSON.stringify(state.project.dataset);
  Object.assign(state.project, snapshot);
  if (dataChanged) { state.tableRows = null; rebuildData(); } else analyse();
  state.dirty = true;
  graphView?.select([...(graphView?.selection ?? [])].filter((id) => nodeById(model(), id)));
  renderAll();
}

function loadProject(project, { path = null, handle = null, clean = true } = {}) {
  stopEverything();
  if (state.live.mode || state.live.camera) stopLive();
  Object.assign(state.live, { result: null, preview: null, error: null, recent: [] });
  state.project = normalizeProject(project);
  state.path = path;
  state.webHandle = handle;
  state.tableRows = null;
  state.snapshot = null;
  state.selectedUnit = null;
  state.visual = { boundary: null, curve: null };
  state.evaluation = null;
  state.report = null;
  state.run = { state: 'idle', epoch: 0, epochs: 0, from: 0, history: [], canContinue: false };
  state.engineKey = null;
  rebuildData();
  state.history.reset(snapshotOfProject());
  state.dirty = !clean;
  state.showStart = false;
  if (state.project.engine === 'torch' && !desktop) state.project.engine = 'tfjs';
  graphView?.select([]);
  renderAll();
  requestAnimationFrame(() => graphView?.fit());
  saveSession();
  // The untrained network's activations, so the views are not empty.
  setTimeout(() => { if (state.project.engine === 'tfjs' && state.prepared && !state.problems.some((p) => p.level === 'error')) probe(null, 'initial').catch(() => {}); }, 60);
}

function saveSession() {
  clearTimeout(saveSession.timer);
  saveSession.timer = setTimeout(() => {
    try {
      const text = serializeProject(state.project, { includeWeights: false });
      if (text.length < 4_000_000) storage.setItem(SESSION_KEY, JSON.stringify({ path: state.path, dirty: state.dirty, project: text }));
    } catch { /* storage full */ }
  }, 600);
}

function sessionData() {
  try { return JSON.parse(storage.getItem(SESSION_KEY) ?? 'null'); } catch { return null; }
}

// ───────────────────────── engines

function currentEngine() {
  return state.project.engine === 'torch' ? engines.torch : engines.tfjs;
}

function stopEverything() {
  for (const engine of Object.values(engines)) {
    if (!engine) continue;
    if (engine.kind === 'torch') engine.end();
    else if (engine.state === 'training' || engine.state === 'paused') engine.stop();
  }
}

/** Builds the TensorFlow.js model and hands it the data (when the model, data or settings changed). */
/**
 * What the built TF.js model depends on: the graph, the training settings and the data. Which sample is
 * watched (probeIndex, probeCycle) is left out — choosing another input must not rebuild the trained model.
 */
function engineKey() {
  const { probeIndex, probeCycle, ...train } = state.project.train;
  return `${signature()}|${JSON.stringify(train)}|${JSON.stringify(state.project.dataset)}`;
}

function prepareTf(options = {}) {
  const key = engineKey();
  // One preparation at a time: a second request for the same model waits for the first.
  if (prepareTf.pending?.key === key && !options.force) return prepareTf.pending.promise;
  const promise = prepareTfNow({ ...options, key }).finally(() => { if (prepareTf.pending?.promise === promise) prepareTf.pending = null; });
  prepareTf.pending = { key, promise };
  return promise;
}

async function prepareTfNow({ force = false, key }) {
  const engine = engines.tfjs;
  if (!force && state.engineKey === key) return engine;
  // Never rebuild under a running training: edits apply to the next run.
  if (engine.state === 'training' || engine.state === 'paused') return engine;
  if (!state.prepared) throw new Error(state.dataError ?? t('data.none'));
  await engine.start(state.settings.tfBackend);
  state.backend = engine.backend;
  // The model may have been edited while the engine started (a cut right after opening a sample): never build a
  // graph with errors, and remember the model that is actually built.
  const errors = state.problems.filter((p) => p.level === 'error').length;
  if (errors) throw new Error(t('train.fixProblems', { n: errors }));
  key = engineKey();
  if (!force && state.engineKey === key) return engine;
  await engine.prepare({ graph: cloneModel(model()), inputShape: state.prepared.inputShape, task: state.task, train: state.project.train, prepared: state.prepared });
  state.engineKey = key;
  state.run = { ...state.run, epoch: 0, canContinue: false, history: [] };
  // Weights saved with the project, for exactly this model.
  if (state.project.weights?.signature === signature() && state.project.weights.data) {
    try { engine.importWeights(JSON.parse(state.project.weights.data)); } catch { /* damaged: train again */ }
  }
  return engine;
}

/**
 * The result of the last training as [label, value] rows: epochs and time, the last and the best
 * validation figures (with the epoch), the test accuracy / F1 (or regression errors), size and device.
 */
function trainSummaryRows() {
  const history = state.run.history ?? [];
  if (!history.length) return [];
  const last = history.at(-1);
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  const num = (v) => Number(v).toFixed(4);
  const rows = [[t('summary.epochs'), `${history.length}${state.run.lastTime != null ? ` · ${(state.run.lastTime / 1000).toFixed(1)} ${t('summary.seconds')}` : ''}`]];
  rows.push([t('test.loss'), `${num(last.loss)}${last.valLoss != null ? ` · ${t('log.valLoss')} ${num(last.valLoss)}` : ''}`]);
  if (last.acc != null) rows.push([t('test.accuracy'), `${pct(last.acc)}${last.valAcc != null ? ` · ${t('log.valAcc')} ${pct(last.valAcc)}` : ''}`]);
  const withVal = history.filter((h) => h.valLoss != null);
  if (withVal.length) {
    const best = withVal.reduce((a, b) => (b.valLoss < a.valLoss ? b : a));
    rows.push([t('summary.best'), `${t('summary.epoch', { n: best.epoch })} · ${t('log.valLoss')} ${num(best.valLoss)}${best.valAcc != null ? ` · ${pct(best.valAcc)}` : ''}`]);
  }
  const report = state.report;
  if (report?.kind === 'classification') rows.push([t('summary.test'), `${pct(report.accuracy)} · F1 ${report.macroF1.toFixed(3)}`]);
  else if (report?.kind === 'regression') rows.push([t('summary.test'), `MAE ${Number(report.mae).toFixed(4)} · R² ${Number(report.r2).toFixed(3)}`]);
  rows.push([t('inspector.params'), totalParams(state.shapes).total.toLocaleString()]);
  rows.push([t('device.title'), api.engineLabel()]);
  return rows;
}

/** Where the current engine trains: TensorFlow's backend (GPU or CPU) or PyTorch's device. */
function deviceSelect() {
  const torch = state.project.engine === 'torch';
  const key = torch ? 'torchDevice' : 'tfBackend';
  const options = torch ? ['auto', 'cpu'] : ['auto', 'webgpu', 'webgl', 'wasm', 'cpu'];
  return `<label class="prop-row device-row" title="${escapeHtml(t('device.tip'))}"><span class="prop-label">${icon('gpu')}<span>${escapeHtml(t('device.title'))}</span></span>
    <span class="prop-control"><select data-device="${key}" ${busy() ? 'disabled' : ''}>${options.map((o) => `<option value="${o}" ${state.settings[key] === o ? 'selected' : ''}>${escapeHtml(t(`device.${torch ? 'torch' : 'tf'}.${o}`))}</option>`).join('')}</select></span></label>`;
}

/** Another device: TensorFlow's worker starts again on that backend (the model is built again). */
async function setDevice(key, value) {
  updateSettings({ [key]: value }, { quiet: true });
  if (key === 'tfBackend') {
    state.engineKey = null;
    state.run = { ...state.run, history: [], canContinue: false };
    const ready = await engines.tfjs.restart(value);
    state.backend = ready?.backend ?? engines.tfjs.backend;
    log(t('device.switched', { backend: state.backend }), state.backend === value || value === 'auto' ? 'success' : 'warning');
    if (value !== 'auto' && state.backend !== value) notify(t('device.unavailable', { wanted: value, backend: state.backend }), 'warning');
  } else if (!state.project.code.custom) state.project.code.text = generatedCode();
  renderAll();
}

/** ◀ n / N ▶ 🎲: which training sample goes through the network in the Neuron and Train tabs. */
function probeNav() {
  const n = state.prepared?.train?.n ?? 0;
  if (!n) return '';
  const at = Math.min(state.project.train.probeIndex, n - 1);
  return `<span class="probe-nav" title="${escapeHtml(t('probe.navTip'))}">
      <button class="icon-button" data-probe="prev" title="${escapeHtml(t('test.prev'))}" aria-label="${escapeHtml(t('test.prev'))}">${icon('chevronLeft')}</button>
      <span class="probe-at" data-probe-at>${escapeHtml(t('probe.at', { n: at + 1, total: n }))}</span>
      <button class="icon-button" data-probe="next" title="${escapeHtml(t('test.next'))}" aria-label="${escapeHtml(t('test.next'))}">${icon('chevronRight')}</button>
      <button class="icon-button" data-probe="random" title="${escapeHtml(t('test.random'))}" aria-label="${escapeHtml(t('test.random'))}">${icon('dice')}</button>
      <label class="inline-check" title="${escapeHtml(t('probe.cycleTip'))}"><input type="checkbox" data-probe-cycle ${state.project.train.probeCycle !== false ? 'checked' : ''}/><span>${escapeHtml(t('probe.cycle'))}</span></label>
    </span>`;
}

/** Another training sample as the probe input: the network is run on it at once (also while training). */
function moveProbe(how) {
  const train = state.prepared?.train;
  if (!train?.n) return;
  const at = Math.min(state.project.train.probeIndex, train.n - 1);
  const next = how === 'random' ? Math.floor(Math.random() * train.n) : (at + (how === 'prev' ? -1 : 1) + train.n) % train.n;
  state.project.train.probeIndex = next;
  const raw = train.index?.[next];
  const label = raw == null ? null : state.data.task.kind === 'classification' ? state.data.y[raw] : sampleY(state.data, raw)?.[0] ?? null;
  for (const element of root.querySelectorAll('[data-probe-at]')) element.textContent = t('probe.at', { n: next + 1, total: train.n });
  const engine = currentEngine();
  if (engine.kind === 'tfjs' && engine.setProbe && busy()) engine.setProbe(probeValues(), label, next);
  else probe(null, 'probe', label).catch((error) => reportError(error, 'probe'));
}

/** Probe input values for a sample of the training data. */
function probeValues() {
  const part = state.prepared?.train;
  if (!part?.n) return null;
  const s = state.prepared.inputShape.reduce((a, b) => a * b, 1);
  const i = Math.min(state.project.train.probeIndex, part.n - 1);
  return part.x.slice(i * s, (i + 1) * s);
}

/** Runs the network on one input (null: the training probe sample) and takes a snapshot. */
async function probe(x = null, reason = 'probe', label = null) {
  if (!state.prepared || state.problems.some((p) => p.level === 'error')) return;
  const engine = currentEngine();
  if (engine.kind === 'tfjs') {
    await prepareTf();
    engine.probe(x ?? probeValues(), label, reason);
  } else if (engine.canServe) engine.probe(x ?? probeValues(), label, reason);
}

async function startTraining() {
  if (busy()) return;
  if (!state.prepared) { notify(state.dataError ?? t('data.none'), 'error'); switchTab('data'); return; }
  const errors = state.problems.filter((p) => p.level === 'error');
  if (errors.length) {
    notify(t('train.fixProblems', { n: errors.length }), 'error');
    state.view.bottomTab = 'problems';
    if (!state.settings.showBottomPanel) updateSettings({ showBottomPanel: true }, { quiet: true });
    renderAll();
    return;
  }
  state.selectedUnit = null;
  startTrainTask();
  if (state.project.engine === 'torch') return startTorch();
  try {
    state.run.state = 'preparing';
    renderTrainLive();
    const continuing = state.run.canContinue && state.engineKey === engineKey();
    const engine = await prepareTf();
    state.run = { state: 'training', epoch: continuing ? state.run.epoch : 0, epochs: state.project.train.epochs, from: continuing ? state.run.epoch : 0, history: continuing ? state.run.history : [], canContinue: true };
    log(t('log.trainStart', { engine: `TensorFlow (${engine.backend})`, epochs: state.project.train.epochs }));
    engine.train();
    if (!['train', 'model', 'neurons'].includes(state.view.tab)) switchTab('train');
    renderAll();
  } catch (error) {
    state.run.state = 'idle';
    endTrainTask();
    reportError(error, 'train');
  }
}

/** Until the first epoch is done (preparing the data and the model, then its batches) a progress popup shows how far it is. */
let trainTask = null;
function startTrainTask() {
  endTrainTask();
  trainTask = progressTask(t('progress.trainTitle'), t('progress.trainPreparing'));
}
function endTrainTask() { trainTask?.done(); trainTask = null; }

async function choosePython({ ask = true } = {}) {
  if (!desktop) return null;
  if (!state.python) {
    notify(t('py.detecting'));
    try { state.python = await native.pyDetect(); } catch (error) { reportError(error, 'python'); return null; }
  }
  const list = state.python.pythons;
  const preferred = list.find((p) => p.path === state.settings.pythonPath && p.torch && p.numpy);
  const chosen = preferred ?? (state.python.best != null ? list[state.python.best] : null);
  if (chosen) {
    if (state.settings.pythonPath !== chosen.path) updateSettings({ pythonPath: chosen.path }, { quiet: true });
    return chosen;
  }
  if (ask) openPyEnv();
  return null;
}

async function startTorch() {
  const python = await choosePython();
  if (!python) { endTrainTask(); notify(t('py.needTorch'), 'error'); return; }
  try {
    const engine = engines.torch;
    const code = state.project.code.custom ? state.project.code.text : generatedCode();
    await engine.prepare({ graph: cloneModel(model()), inputShape: state.prepared.inputShape, task: state.task, train: state.project.train, prepared: state.prepared, python: python.path, code, probe: probeValues() });
    state.run = { state: 'training', epoch: 0, epochs: state.project.train.epochs, from: 0, history: [], canContinue: false };
    state.snapshot = null;
    log(t('log.trainStart', { engine: `PyTorch ${python.torch} (${python.path})`, epochs: state.project.train.epochs }));
    await engine.train();
    if (!['train', 'model', 'neurons'].includes(state.view.tab)) switchTab('train');
    renderAll();
  } catch (error) {
    state.run.state = 'idle';
    endTrainTask();
    reportError(error, 'torch');
    renderAll();
  }
}

/** Another model of the project's choices (the edits to the current one are kept with it). */
function switchVariant(id) {
  const variants = state.project.variants;
  if (!variants || variants.current === id || busy()) return;
  const next = variants.list.find((v) => v.id === id);
  if (!next) return;
  const current = variants.list.find((v) => v.id === variants.current);
  if (current) current.model = structuredClone(model());
  variants.current = id;
  state.project.model = structuredClone(next.model);
  if (!state.project.code.custom) state.project.code.text = null;
  rebuildData();
  adaptModelToData();
  trainAction('reset');
  log(t('log.variant', { name: next.name, params: totalParams(state.shapes).total.toLocaleString() }));
  commit('variant');
  graphView?.fit?.();
}

function trainAction(action) {
  const engine = currentEngine();
  switch (action) {
    case 'train': startTraining(); break;
    case 'pause': engine?.pause(); break;
    case 'resume': engine?.resume(); break;
    case 'step': engine?.step(); break;
    case 'stop': engine?.stop(); break;
    case 'reset':
      state.engineKey = null;
      state.project.weights = null;
      state.run = { state: 'idle', epoch: 0, epochs: 0, from: 0, history: [], canContinue: false };
      state.evaluation = null; state.report = null; state.visual = { boundary: null, curve: null };
      if (state.project.engine === 'torch') engines.torch?.end();
      log(t('log.reset'));
      probe(null, 'initial').catch(() => {});
      renderAll();
      break;
    case 'pyenv': openPyEnv(); break;
    case 'openCode': switchTab('code'); break;
    default: break;
  }
}

/** One console line per finished epoch: loss, accuracy, validation, learning rate, time. */
function logEpoch(m) {
  const num = (v, digits = 4) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v).toFixed(digits));
  const pct = (v) => (v == null || !Number.isFinite(Number(v)) ? null : `${(Number(v) * 100).toFixed(1)}%`);
  const total = m.epochs ?? state.run.epochs;
  const previous = state.run.history.at(-2);
  const seconds = ((m.time ?? 0) - (previous && previous.epoch < m.epoch ? previous.time ?? 0 : 0)) / 1000;
  const parts = [
    t('log.epoch', { epoch: m.epoch, epochs: total || '?' }),
    `${t('test.loss')} ${num(m.loss)}`,
    pct(m.acc) && `${t('test.accuracy')} ${pct(m.acc)}`,
    num(m.valLoss) && `${t('log.valLoss')} ${num(m.valLoss)}`,
    pct(m.valAcc) && `${t('log.valAcc')} ${pct(m.valAcc)}`,
    m.lr != null && `${t('log.lr')} ${Number(m.lr).toPrecision(3)}`,
    seconds > 0 && `${seconds.toFixed(2)}${t('log.sec')}`,
  ].filter(Boolean);
  log(parts.join(' · '));
}

/** Every engine message ends up here. */
function onEngine(message) {
  const engine = message.engine;
  if (engine !== currentEngine()) return;
  switch (message.type) {
    case 'ready': state.backend = message.backend; log(t('log.backend', { backend: message.backend, version: message.version })); renderStatus(); break;
    case 'built': log(t('log.built', { params: Number(message.params ?? 0).toLocaleString(), backend: message.backend ?? '' })); break;
    case 'status':
      state.run.state = message.state === 'idle' && state.run.state === 'serving' ? 'idle' : message.state;
      if (message.state === 'training' && message.epochs) state.run.epochs = message.epochs;
      renderAllSoon();
      break;
    case 'batch':
      state.run.batch = message;
      trainTask?.update(message.batch / Math.max(1, message.batches), t('progress.trainFirstEpoch', { batch: message.batch, batches: message.batches }));
      renderTrainLive();
      break;
    case 'epoch':
      endTrainTask();
      state.run.epoch = message.epoch;
      state.run.history.push({ epoch: message.epoch, loss: message.loss, acc: message.acc, valLoss: message.valLoss, valAcc: message.valAcc, lr: message.lr, time: message.time });
      logEpoch(message);
      renderTrainLive();
      break;
    case 'snapshot':
      state.snapshot = { ...message, labels: state.data?.labels ?? null, featureNames: state.prepared?.featureNames ?? state.data?.featureNames ?? null, vocab: state.data?.vocab ?? null };
      if (message.reason === 'probe' && state.view.tab === 'test') state.test.lastOutput = message.nodes[outputId()]?.act?.data ?? null;
      if (message.probeIndex != null && state.prepared?.train?.n) {
        state.project.train.probeIndex = message.probeIndex;
        for (const element of root.querySelectorAll('[data-probe-at]')) element.textContent = t('probe.at', { n: message.probeIndex + 1, total: state.prepared.train.n });
      }
      onSnapshot();
      break;
    case 'boundary': state.visual.boundary = message; renderTrainLive(); if (state.view.tab === 'test') redrawCenter(); break;
    case 'curve': state.visual.curve = message; renderTrainLive(); break;
    case 'evaluation':
      state.evaluation = message;
      state.report = evaluationReport(message, state.task);
      if (state.run.summaryWaiting) { const open = state.run.summaryWaiting; state.run.summaryWaiting = null; open(); }
      if (state.view.tab === 'test') renderCenter();
      break;
    case 'done': {
      endTrainTask();
      state.run.state = engine.kind === 'torch' ? 'serving' : 'idle';
      const summary = message.evaluation;
      log(t('log.done', { epochs: message.epochs, time: ((message.time ?? 0) / 1000).toFixed(1), result: summary ? `${t('test.loss')} ${Number(summary.loss ?? 0).toFixed(4)}${summary.acc != null ? ` · ${t('test.accuracy')} ${(summary.acc * 100).toFixed(1)}%` : ''}` : '' }), 'success');
      notify(t('log.doneShort'), 'success');
      state.run.lastTime = message.time ?? null;
      recordRun(message);
      renderAll();
      if (!message.stopped && state.settings.notifyTrainDone) {
        // The test figures arrive with the evaluation a moment later: the popup waits for them (briefly).
        const open = () => popups.open('summary', { title: t('train.doneTitle'), lead: t('train.doneSummary', { epochs: message.epochs, time: ((message.time ?? 0) / 1000).toFixed(1) }), rows: trainSummaryRows() }).catch(() => {});
        if (state.report) open(); else { state.run.summaryWaiting = open; setTimeout(() => { if (state.run.summaryWaiting === open) { state.run.summaryWaiting = null; open(); } }, 3000); }
      }
      if (engine.kind === 'tfjs' && state.settings.saveWeights) storeWeights();
      break;
    }
    case 'log': log(t(message.code, message.params, message.code), message.level); break;
    case 'output': log(message.text, message.stream === 'stderr' ? 'stderr' : 'output'); break;
    case 'error':
      log(`${message.message}${message.stack ? `\n${message.stack}` : ''}`, 'error');
      showError(message.message, engine.kind === 'torch' ? 'PyTorch' : 'TensorFlow', message.stack ?? null);
      if (state.run.state === 'preparing') state.run.state = 'idle';
      endTrainTask();
      renderAllSoon();
      break;
    case 'exit':
      endTrainTask();
      if (message.code && message.code !== 0) { log(t('log.exitCode', { code: message.code }), 'error'); notify(t('log.exitCode', { code: message.code }), 'error'); }
      state.run.state = 'idle';
      renderAll();
      break;
    default: break;
  }
}

function recordRun(message) {
  const history = message.history ?? state.run.history;
  const step = Math.max(1, Math.ceil(history.length / 200));
  state.project.runs = [...(state.project.runs ?? []), {
    date: new Date().toISOString(), engine: state.project.engine, epochs: message.epochs, history: history.filter((_, i) => i % step === 0 || i === history.length - 1), evaluation: message.evaluation ?? null,
  }].slice(-10);
  state.run.saved = state.project.runs.at(-1);
  state.dirty = true;
}

async function storeWeights() {
  const weights = await engines.tfjs.exportWeights();
  if (!weights) return;
  state.project.weights = { engine: 'tfjs', signature: signature(), data: JSON.stringify(weights), epoch: state.run.epoch };
}

function onSnapshot() {
  graphView?.render();
  graphView?.flow();
  for (const view of [neuronModel, neuronTrain, neuronTest]) view?.animate();
  if (state.view.tab === 'train') drawTrainView(api, root.querySelector('#center-body'));
  if (state.view.tab === 'test') redrawCenter();
  renderRight();
}

// ───────────────────────── views shared with the UI modules

const api = {
  t, lang, desktop,
  settings: () => state.settings,
  dark: isDark,
  version: () => VERSION,
  project: () => state.project,
  model,
  shapes: () => state.shapes,
  problems: () => state.problems,
  problemText,
  snapshot: () => state.snapshot,
  data: () => state.data,
  prepared: () => state.prepared,
  dataError: () => state.dataError,
  bankInfo: (id) => bankInfo.get(id) ?? null,
  task: () => state.task,
  run: () => state.run,
  liveState: () => state.live,
  visual: () => state.visual,
  evaluation: () => state.evaluation,
  report: () => state.report,
  testState: () => state.test,
  batchState: () => state.batch,
  inputKind: () => inputKindFor(state.data),
  examples: () => examplesForData(),
  zoomControls: () => zoomControls(),
  deviceSelect: () => deviceSelect(),
  trainSummary: () => trainSummaryRows(),
  probeNav: () => probeNav(),
  recent: () => state.recent,
  view: state.view,
  outputId,
  tfBackend: () => engines.tfjs.backend ?? state.backend,
  pythonInfo: () => {
    const list = state.python?.pythons ?? [];
    return list.find((p) => p.path === state.settings.pythonPath) ?? (state.python?.best != null ? list[state.python.best] : null);
  },
  orderedNodes: () => { try { return topoOrder(model()).map((id) => nodeById(model(), id)); } catch { return model().nodes; } },
  probeIndex: () => state.project.train.probeIndex,
  selectedUnit: () => state.selectedUnit,
  selectedNodes,
  hasSession: () => Boolean(sessionData()?.project),
  sessionName: () => { try { return JSON.parse(sessionData().project).name; } catch { return ''; } },
  tableColumns: () => (state.project.dataset.source.kind === 'table' ? describeTable(state.tableRows ?? parseCsv(state.project.dataset.source.text).rows).columns : null),
  modelInfo: () => {
    const out = outputId();
    return { layers: model().nodes.length, params: totalParams(state.shapes), inputShape: state.prepared?.inputShape ?? null, outputShape: out ? state.shapes.get(out)?.shape : null, task: state.task };
  },
  engineLabel: () => (state.project.engine === 'torch' ? `PyTorch${api.pythonInfo()?.torch ? ` ${api.pythonInfo().torch}` : ''}` : `TensorFlow${engines.tfjs.backend ? ` (${engines.tfjs.backend})` : ''}`),
  explainContext: () => ({ ...state.snapshot, inputNodeId: inputId(), featureNames: state.prepared?.featureNames ?? state.data?.featureNames, vocab: state.data?.vocab, probeLabel: state.snapshot?.label != null ? (state.data?.labels?.[state.snapshot.label] ?? state.snapshot.label) : null }),
  engineReadyText: () => {
    if (state.project.engine === 'torch') return engines.torch?.canServe ? t('test.torchReady') : t('test.torchNeedsRun');
    return state.run.history.length ? t('test.tfReady') : t('test.untrained');
  },
  probeOutput: () => state.snapshot?.nodes?.[outputId()]?.act?.data ?? null,
  probeLabel: () => (state.data?.task.kind === 'classification' ? state.snapshot?.label ?? null : null),
  probeTarget: () => (state.data?.task.kind === 'regression' ? state.snapshot?.label ?? null : null),
  // graph editor
  selectionChanged: () => { state.selectedUnit = null; renderRight(); renderToolbarState(); renderStatus(); },
  focusInspector: (id) => { graphView.select([id]); setTimeout(() => root.querySelector('[data-rename]')?.select(), 30); },
  openLayerPicker: (anchor, target) => openLayerPicker(anchor, target),
  graphContextMenu: (pos, target) => graphContextMenu(pos, target),
  quickAction: (action, id, rect) => quickAction(action, id, rect),
  dropItem: (item, target) => dropItem(item, target),
  connectNodes: (from, to) => {
    const result = connect(model(), from, to);
    if (!result.ok) { notify(t(result.code), 'error'); graphView.render(); return; }
    commit('connect');
  },
  commit: (label) => commit(label),
  zoomChanged: () => { renderStatus(); showZoom(); },
  selectUnit: (sel) => { state.selectedUnit = sel; if (sel) graphView?.select([]); state.selectedUnit = sel; for (const view of [neuronModel, neuronTrain, neuronTest]) view?.render(); renderRight(); },
  bindDrawPad: (pad) => bindDrawPad(pad),
  // code editor
  codeEdited: (text) => {
    state.project.code = { text, custom: true };
    state.dirty = true;
    codeView.renderToolbar();
    clearTimeout(api.codeTimer);
    api.codeTimer = setTimeout(() => { state.history.push(snapshotOfProject()); saveSession(); renderStatus(); }, 700);
  },
  codeAction: (action) => codeAction(action),
  codeOption: (key, value) => {
    updateSettings({ [key]: key === 'codeFontSize' ? Number(value) : value }, { quiet: true });
    if (key === 'codeHooks' && !state.project.code.custom) { state.project.code.text = generatedCode(); codeView.setText(state.project.code.text); }
    codeView.applyLook();
    codeView.renderToolbar();
  },
};

for (const engine of Object.values(engines)) if (engine) engine.on('*', (message) => onEngine({ ...message, engine }));

// ───────────────────────── editing the model (no code needed)

function addLayer(type, target = {}) {
  let node;
  const m = model();
  if (target.edge) {
    const edge = m.edges.find((e) => e.id === target.edge);
    if (!edge) return null;
    node = insertBefore(m, edge.to, type);
    if (node) {
      // insertBefore took over every input of the target; keep the other inputs on the target.
      for (const other of m.edges.filter((e) => e.to === node.id && e.from !== edge.from)) other.to = edge.to;
    }
  } else if (target.node) node = insertAfter(m, target.node, type);
  else if (target.after) node = insertAfter(m, target.after, type);
  else {
    node = addNode(m, type, {}, target.at ?? null);
    const selected = selectedNodes();
    if (!target.at && selected.length === 1 && type !== 'input') {
      m.nodes.pop();
      node = insertAfter(m, selected[0], type);
    }
  }
  if (!node) return null;
  if (type === 'input' && state.prepared) node.params.shape = state.prepared.inputShape.join(', ');
  commit('add');
  graphView.select([node.id]);
  return node;
}

function dropItem(item, target) {
  if (item.kind === 'layer') return addLayer(item.type, target);
  if (item.kind === 'block') {
    const nodes = addBlock(model(), item.id, target.node ?? (target.edge ? model().edges.find((e) => e.id === target.edge)?.from : null), target.at ?? null);
    if (target.edge) {
      const edge = model().edges.find((e) => e.id === target.edge);
      if (edge) { removeEdge(model(), edge.id); connect(model(), nodes.at(-1).id, edge.to); }
    }
    commit('block');
    graphView.select(nodes.map((node) => node.id));
    return nodes;
  }
  return null;
}

function deleteSelection() {
  if (graphView?.selectedEdge) {
    removeEdge(model(), graphView.selectedEdge);
    graphView.selectedEdge = null;
    commit('cut');
    return;
  }
  const ids = selectedNodes();
  if (!ids.length) return;
  removeNodes(model(), ids);
  graphView.select([]);
  commit('delete');
}

function duplicateSelection() {
  const ids = selectedNodes();
  if (!ids.length) return;
  const copies = duplicateNodes(model(), ids);
  commit('duplicate');
  graphView.select(copies.map((node) => node.id));
}

function quickAction(action, id, rect) {
  const node = nodeById(model(), id);
  if (!node) return;
  switch (action) {
    case 'insertAbove': openLayerPicker({ x: rect.left, y: rect.bottom + 4 }, { before: id }); break;
    case 'insertBelow': openLayerPicker({ x: rect.left, y: rect.bottom + 4 }, { after: id }); break;
    case 'replace': openLayerPicker({ x: rect.left, y: rect.bottom + 4 }, { replace: id }); break;
    case 'duplicate': duplicateSelection(); break;
    case 'delete': deleteSelection(); break;
    case 'widthUp':
    case 'widthDown': {
      const key = node.params.units !== undefined ? 'units' : 'filters';
      const value = node.params[key];
      const next = action === 'widthUp' ? (value < 8 ? value + 1 : Math.round(value * 1.5)) : Math.max(1, value <= 8 ? value - 1 : Math.round(value / 1.5));
      setParam(model(), id, key, next);
      commit('width');
      break;
    }
    case 'residual': {
      const result = addResidual(model(), id, id, state.shapes);
      if (!result.ok) { notify(t(result.code), 'error'); return; }
      commit('residual');
      graphView.select([result.node.id]);
      break;
    }
    default: break;
  }
}

// ───────────────────────── in-page menus (menu bar, context menus, layer picker)

function closeMenu() {
  root.querySelector('.dropdown')?.remove();
  root.querySelector('.dropdown-shield')?.remove();
  if (state.openMenu) { state.openMenu = null; renderMenubar(); }
}

/** items = [{ label, icon, key, action, disabled, checked, danger, children }] or 'sep' */
function showMenu(items, anchor, { menuName = null } = {}) {
  root.querySelector('.dropdown')?.remove();
  root.querySelector('.dropdown-shield')?.remove();
  const shield = document.createElement('div');
  shield.className = 'dropdown-shield';
  // Menu-bar menus: the menu bar stays reachable, so pointing at another menu opens it.
  if (menuName) shield.style.top = `${root.querySelector('#menubar').getBoundingClientRect().bottom}px`;
  shield.addEventListener('pointerdown', () => closeMenu());
  shield.addEventListener('contextmenu', (event) => { event.preventDefault(); closeMenu(); });
  const menu = document.createElement('div');
  menu.className = 'dropdown popup-menu';
  menu.setAttribute('role', 'menu');
  const render = (list) => list.map((item, i) => (item === 'sep' ? '<div class="menu-sep"></div>' : `<button class="menu-item ${item.danger ? 'danger' : ''} ${item.children ? 'has-children' : ''}" data-index="${i}" role="menuitem" ${item.disabled ? 'disabled' : ''}>
      <span class="menu-icon">${icon(item.icon ?? 'dot')}</span><span>${escapeHtml(item.label)}</span><span class="menu-key">${escapeHtml(item.key ?? '')}</span><span class="menu-check">${item.children ? icon('caretRight') : item.checked ? icon('check') : ''}</span></button>`)).join('');
  menu.innerHTML = render(items);
  root.append(shield, menu);
  const place = (element, x, y) => {
    const r = element.getBoundingClientRect();
    element.style.left = `${Math.max(4, Math.min(x, window.innerWidth - r.width - 4))}px`;
    element.style.top = `${Math.max(4, Math.min(y, window.innerHeight - r.height - 4))}px`;
  };
  place(menu, anchor.x, anchor.y);
  let sub = null;
  const openSub = (button, item) => {
    sub?.remove();
    sub = document.createElement('div');
    sub.className = 'dropdown popup-menu sub';
    sub.innerHTML = render(item.children);
    root.append(sub);
    const r = button.getBoundingClientRect();
    place(sub, r.right - 2, r.top - 6);
    sub.addEventListener('click', (event) => {
      const b = event.target.closest('[data-index]');
      const child = b && item.children[Number(b.dataset.index)];
      if (!child || child.disabled) return;
      closeMenu(); sub?.remove();
      child.action?.();
    });
  };
  menu.addEventListener('pointerover', (event) => {
    const button = event.target.closest('[data-index]');
    if (!button) return;
    const item = items[Number(button.dataset.index)];
    if (item?.children) openSub(button, item);
    else if (sub && !sub.contains(event.target)) { sub.remove(); sub = null; }
  });
  menu.addEventListener('click', (event) => {
    const button = event.target.closest('[data-index]');
    const item = button && items[Number(button.dataset.index)];
    if (!item || item.disabled) return;
    if (item.children) { openSub(button, item); return; }
    closeMenu(); sub?.remove();
    item.action?.();
  });
  const originalClose = closeMenu;
  void originalClose;
  shield.addEventListener('pointerdown', () => sub?.remove());
  state.openMenu = menuName;
  menu.querySelector('.menu-item:not(:disabled)')?.focus({ preventScroll: true });
  menu.addEventListener('keydown', (event) => {
    const buttons = [...menu.querySelectorAll('.menu-item:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') { event.preventDefault(); buttons[(index + 1) % buttons.length]?.focus(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); buttons[(index - 1 + buttons.length) % buttons.length]?.focus(); }
    if (event.key === 'Escape') { closeMenu(); sub?.remove(); }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const names = Object.keys(MENUS);
      const current = names.indexOf(state.openMenu);
      if (current >= 0) { event.preventDefault(); openMenuBar(names[(current + (event.key === 'ArrowRight' ? 1 : -1) + names.length) % names.length]); }
    }
  });
}

function layerItems(onPick, { allowInput = false } = {}) {
  return LAYER_GROUPS.filter(([, types]) => types.some((type) => allowInput || type !== 'input')).map(([group, types]) => ({
    label: t(`group.${group}`), icon: LAYERS[types.find((type) => allowInput || type !== 'input')]?.icon,
    children: types.filter((type) => allowInput || type !== 'input').map((type) => ({ label: t(`layer.${type}`), icon: LAYERS[type].icon, action: () => onPick(type) })),
  }));
}

function openLayerPicker(anchor, target = {}) {
  const pick = (type) => {
    if (target.replace) {
      replaceType(model(), target.replace, type);
      commit('replace');
      return;
    }
    if (target.before) {
      const node = insertBefore(model(), target.before, type);
      if (node) { commit('add'); graphView.select([node.id]); }
      return;
    }
    addLayer(type, target);
  };
  const items = layerItems(pick, { allowInput: !model().nodes.some((node) => node.type === 'input') && !target.replace && !target.before });
  if (!target.replace) items.push('sep', { label: t('palette.blocks'), icon: 'blkConv', children: BLOCK_IDS.map((id) => ({ label: t(`block.${id}`), icon: BLOCKS[id].icon, action: () => dropItem({ kind: 'block', id }, { node: target.after ?? null, at: target.at ?? null }) })) });
  showMenu(items, anchor);
}

function graphContextMenu(pos, target) {
  const items = [];
  if (target.node) {
    const node = nodeById(model(), target.node);
    items.push(
      { label: t('graph.insertAbove'), icon: 'insertAbove', disabled: node.type === 'input', action: () => openLayerPicker(pos, { before: node.id }) },
      { label: t('graph.insertBelow'), icon: 'insertBelow', action: () => openLayerPicker(pos, { after: node.id }) },
      { label: t('graph.replace'), icon: 'replaceLayer', disabled: node.type === 'input', children: layerItems((type) => { replaceType(model(), node.id, type); commit('replace'); }) },
      { label: t('graph.duplicate'), icon: 'duplicateLayer', key: 'Ctrl+D', disabled: node.type === 'input', action: duplicateSelection },
      { label: t('graph.residual'), icon: 'residual', disabled: node.type === 'input', action: () => quickAction('residual', node.id) },
      { label: t('graph.disconnectInputs'), icon: 'disconnect', disabled: !incoming(model(), node.id).length, action: () => { model().edges = model().edges.filter((e) => e.to !== node.id); commit('cut'); } },
      'sep',
      { label: t('graph.showNeurons'), icon: 'nodesView', action: () => switchTab('neurons') },
      { label: t('graph.delete'), icon: 'trash', key: 'Del', danger: true, action: deleteSelection },
    );
  } else if (target.edge) {
    items.push(
      { label: t('graph.insertOnWire'), icon: 'insertBelow', children: layerItems((type) => addLayer(type, { edge: target.edge })) },
      { label: t('graph.cutWire'), icon: 'disconnect', danger: true, action: deleteSelection },
    );
  } else {
    items.push(
      { label: t('graph.addLayer'), icon: 'plus', children: layerItems((type) => addLayer(type, { at: target.at }), { allowInput: !model().nodes.some((node) => node.type === 'input') }) },
      { label: t('palette.blocks'), icon: 'blkConv', children: BLOCK_IDS.map((id) => ({ label: t(`block.${id}`), icon: BLOCKS[id].icon, action: () => dropItem({ kind: 'block', id }, { at: target.at }) })) },
      'sep',
      { label: t('menu.autoLayout'), icon: 'layoutAuto', key: 'Ctrl+L', action: () => run('autoLayout') },
      { label: t('menu.fit'), icon: 'fitPage', key: 'Ctrl+0', action: () => graphView.fit() },
      { label: t('menu.selectAll'), icon: 'selectAll', key: 'Ctrl+A', action: () => run('selectAll') },
    );
  }
  showMenu(items, pos);
}

// ───────────────────────── commands, menus, toolbar

const commands = {
  new: { label: 'menu.new', icon: 'fileNew', key: 'Ctrl+N', run: () => newEmpty() },
  open: { label: 'menu.open', icon: 'folderOpen', key: 'Ctrl+O', run: () => openFile() },
  gallery: { label: 'menu.samples', icon: 'samples', run: () => openGallery() },
  exportC: { label: 'menu.exportC', icon: 'exportC', enabled: () => !busy(), run: () => exportModel('c') },
  exportOnnx: { label: 'menu.exportOnnx', icon: 'exportOnnx', enabled: () => !busy(), run: () => exportModel('onnx') },
  exportTfjs: { label: 'menu.exportTfjs', icon: 'exportFile', enabled: () => !busy(), run: () => exportModel('tfjs') },
  exportModel: { label: 'menu.export', icon: 'exportOnnx', enabled: () => !busy(), run: () => openExport() },
  print: { label: 'menu.print', icon: 'print', key: 'Ctrl+P', run: () => openReport('print') },
  saveReport: { label: 'menu.saveReport', icon: 'reportPdf', run: () => openReport('save') },
  save: { label: 'menu.save', icon: 'save', key: 'Ctrl+S', run: () => saveFile(false) },
  saveAs: { label: 'menu.saveAs', icon: 'saveAs', key: 'Ctrl+Shift+S', run: () => saveFile(true) },
  exportPy: { label: 'menu.exportPy', icon: 'exportFile', run: () => codeAction('save') },
  home: { label: 'menu.home', icon: 'home', run: () => { state.showStart = true; renderAll(); } },
  exit: { label: 'menu.exit', icon: 'exit', run: () => requestExit() },
  undo: { label: 'menu.undo', icon: 'undo', key: 'Ctrl+Z', enabled: () => state.history.canUndo && !busy(), run: () => restore(state.history.undo()) },
  redo: { label: 'menu.redo', icon: 'redo', key: 'Ctrl+Y', enabled: () => state.history.canRedo && !busy(), run: () => restore(state.history.redo()) },
  delete: { label: 'menu.delete', icon: 'trash', key: 'Del', enabled: () => selectedNodes().length > 0 || Boolean(graphView?.selectedEdge), run: () => deleteSelection() },
  duplicate: { label: 'menu.duplicate', icon: 'duplicateLayer', key: 'Ctrl+D', enabled: () => selectedNodes().length > 0, run: () => duplicateSelection() },
  selectAll: { label: 'menu.selectAll', icon: 'selectAll', key: 'Ctrl+A', run: () => { switchTab('model'); graphView.select(model().nodes.map((node) => node.id)); } },
  settings: { label: 'menu.settings', icon: 'gear', run: () => openSettings() },
  addLayer: { label: 'menu.addLayer', icon: 'plus', run: () => { switchTab('model'); const r = root.querySelector('[data-command="addLayer"]')?.getBoundingClientRect(); openLayerPicker({ x: r?.left ?? 200, y: (r?.bottom ?? 100) + 4 }, {}); } },
  autoLayout: { label: 'menu.autoLayout', icon: 'layoutAuto', key: 'Ctrl+L', run: () => { layoutModel(model()); commit('layout'); requestAnimationFrame(() => graphView.fit()); } },
  fit: { label: 'menu.fit', icon: 'fitPage', key: 'Ctrl+0', run: () => { const view = zoomView(); if (view) view.fit(); else { switchTab('model'); graphView.fit(); } } },
  zoomIn: { label: 'menu.zoomIn', icon: 'zoomIn', key: 'Ctrl+=', run: () => zoomView()?.zoomBy(1.2) },
  zoomOut: { label: 'menu.zoomOut', icon: 'zoomOut', key: 'Ctrl+-', run: () => zoomView()?.zoomBy(1 / 1.2) },
  graphVertical: { label: 'menu.graphVertical', icon: 'flowDown', checked: () => state.settings.graphDirection !== 'horizontal', run: () => setGraphDirection('vertical') },
  graphHorizontal: { label: 'menu.graphHorizontal', icon: 'flowRight', checked: () => state.settings.graphDirection === 'horizontal', run: () => setGraphDirection('horizontal') },
  toggleGrid: { label: 'menu.grid', icon: 'grid', key: 'Ctrl+G', checked: () => state.settings.showGrid, run: () => { updateSettings({ showGrid: !state.settings.showGrid }); graphView?.render(); } },
  neurons: { label: 'menu.neurons', icon: 'nodesView', key: 'Ctrl+E', checked: () => !state.showStart && state.view.tab === 'neurons', run: () => switchTab(state.view.tab === 'neurons' && !state.showStart ? 'model' : 'neurons') },
  train: { label: 'menu.train', icon: 'train', key: 'F5', enabled: () => !busy(), run: () => startTraining() },
  pause: { label: 'menu.pause', icon: 'trainPause', key: 'F6', enabled: () => busy(), run: () => trainAction(state.run.state === 'paused' ? 'resume' : 'pause') },
  step: { label: 'menu.step', icon: 'trainStep', key: 'F10', enabled: () => busy(), run: () => trainAction('step') },
  stop: { label: 'menu.stop', icon: 'trainStop', key: 'Shift+F5', enabled: () => busy() || state.run.state === 'serving', run: () => trainAction('stop') },
  reset: { label: 'menu.reset', icon: 'resetWeights', enabled: () => !busy(), run: () => trainAction('reset') },
  engineTf: { label: 'menu.engineTf', icon: 'engineTf', checked: () => state.project.engine === 'tfjs', enabled: () => !busy(), run: () => setEngine('tfjs') },
  engineTorch: { label: 'menu.engineTorch', icon: 'engineTorch', checked: () => state.project.engine === 'torch', enabled: () => desktop && !busy(), run: () => setEngine('torch') },
  pyenv: { label: 'menu.pyenv', icon: 'python', enabled: () => desktop, run: () => openPyEnv() },
  importCsv: { label: 'menu.importCsv', icon: 'csvImport', enabled: () => !busy(), run: () => importCsv() },
  importImages: { label: 'menu.importImages', icon: 'imageFolder', enabled: () => !busy(), run: () => importImages() },
  newSeed: { label: 'menu.newSeed', icon: 'dice', enabled: () => state.project.dataset.source.kind === 'generator' && !busy(), run: () => { const p = state.project.dataset.source.params; p.seed = Math.floor(Math.random() * 9999) + 1; commit('seed', { data: true }); } },
  evaluate: { label: 'menu.evaluate', icon: 'confusion', run: () => evaluateNow() },
  theme: { label: 'menu.theme', icon: 'palette', run: () => updateSettings({ theme: randomThemeId(state.settings.theme) }) },
  themeMenu: { label: 'menu.themeMenu', icon: 'chevronDown', run: () => openThemeMenu() },
  language: { label: 'menu.language', icon: 'globe', run: () => updateSettings({ language: lang() === 'ko' ? 'en' : 'ko' }) },
  leftPanel: { label: 'menu.leftPanel', icon: 'panelLeft', checked: () => state.settings.showLeftPanel, run: () => updateSettings({ showLeftPanel: !state.settings.showLeftPanel }) },
  rightPanel: { label: 'menu.rightPanel', icon: 'panelRight', checked: () => state.settings.showRightPanel, run: () => updateSettings({ showRightPanel: !state.settings.showRightPanel }) },
  bottomPanel: { label: 'menu.bottomPanel', icon: 'panelBottom', checked: () => state.settings.showBottomPanel, run: () => updateSettings({ showBottomPanel: !state.settings.showBottomPanel }) },
  statusBar: { label: 'menu.statusBar', icon: 'statusBar', checked: () => state.settings.showStatusBar, run: () => updateSettings({ showStatusBar: !state.settings.showStatusBar }) },
  guide: { label: 'menu.guide', icon: 'userGuide', key: 'F1', run: () => openGuide() },
  shortcuts: { label: 'menu.shortcuts', icon: 'keyboard', run: () => popups.open('shortcuts') },
  about: { label: 'menu.about', icon: 'info', run: () => popups.open('about') },
};
for (const [i, tab] of VIEW_TABS.entries()) commands[`tab_${tab}`] = { label: `tab.${tab}`, icon: `tab${tab[0].toUpperCase()}${tab.slice(1)}`, key: `Ctrl+${i + 1}`, checked: () => !state.showStart && state.view.tab === tab, run: () => switchTab(tab) };

const MENUS = {
  file: ['new', 'open', 'recent', 'gallery', 'sep', 'save', 'saveAs', 'sep', 'exportModel', 'sep', 'exportOnnx', 'exportTfjs', 'exportC', 'exportPy', 'sep', 'print', 'saveReport', 'sep', 'home', 'exit'],
  edit: ['undo', 'redo', 'sep', 'delete', 'duplicate', 'selectAll', 'sep', 'settings'],
  view: ['tab_data', 'tab_model', 'tab_neurons', 'tab_code', 'tab_train', 'tab_test', 'sep', 'zoomIn', 'zoomOut', 'fit', 'sep', 'graphVertical', 'graphHorizontal', 'toggleGrid', 'sep', 'leftPanel', 'rightPanel', 'bottomPanel', 'statusBar', 'sep', 'theme', 'language'],
  model: ['addLayer', 'autoLayout', 'sep', 'delete', 'duplicate'],
  data: ['tab_data', 'importCsv', 'importImages', 'newSeed'],
  train: ['train', 'pause', 'step', 'stop', 'reset', 'sep', 'engineTf', 'engineTorch', 'pyenv', 'sep', 'evaluate'],
  help: ['guide', 'shortcuts', 'sep', 'about'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', view: 'eye', model: 'tabModel', data: 'tabData', train: 'tabTrain', help: 'question' };
const TOOLBAR = [['new', 'open', 'save', 'exportModel', 'print'], ['undo', 'redo'], ['addLayer', 'autoLayout', 'fit', 'neurons'], ['train', 'pause', 'step', 'stop', 'reset']];
const TOOLBAR_RIGHT = ['themeSplit', 'language', 'settings', 'about'];

const enabled = (id) => (commands[id]?.enabled ? commands[id].enabled() : true);
const tip = (id) => `${t(commands[id].label)}${commands[id].key ? ` (${commands[id].key})` : ''}`;

function run(id) {
  const command = commands[id];
  if (!command || !enabled(id)) return;
  closeMenu();
  command.run();
}

function menuItems(name) {
  return MENUS[name].map((id) => {
    if (id === 'sep') return 'sep';
    if (id === 'recent') {
      return { label: t('menu.recent'), icon: 'recent', disabled: !state.recent.length, children: state.recent.map((item) => ({ label: item.title || baseName(item.path), icon: 'file', action: () => openRecent(item.path) })).concat(state.recent.length ? ['sep', { label: t('menu.clearRecent'), icon: 'clearHistory', action: () => { state.recent = []; storeRecent(storage, []); } }] : []) };
    }
    const command = commands[id];
    return { label: t(command.label), icon: command.icon, key: command.key, disabled: !enabled(id), checked: command.checked?.(), action: () => run(id) };
  });
}

function openMenuBar(name) {
  const button = root.querySelector(`[data-menu="${name}"]`);
  if (!button) return;
  const r = button.getBoundingClientRect();
  state.openMenu = name;
  renderMenubar();
  showMenu(menuItems(name), { x: r.left, y: r.bottom + 2 }, { menuName: name });
}

/** The theme dropdown beside the theme button: system, light and dark themes apart, and the custom theme. */
/** The theme drop-down: its own window under the arrow (it may reach past the main window). */
async function openThemeMenu() {
  closeMenu();
  if (popups.isOpen('themes')) { popups.close('themes'); return; }
  Object.assign(POPUPS.themes, themesPopupSize(DARK_THEMES.length, LIGHT_THEMES.length));
  const r = root.querySelector('[data-command="themeMenu"]')?.getBoundingClientRect();
  const size = POPUPS.themes;
  // Screen position: the drop-down's right edge under the arrow's right edge.
  const x = window.screenX + (r ? r.right : innerWidth) - size.width;
  const y = window.screenY + (r ? r.bottom + 2 : 60);
  const answer = await popups.open('themes', {}, { anchor: { x, y } });
  state.settings = loadSettings(storage);
  applyLook();
  renderToolbarState();
  if (answer?.editCustom) openSettings('custom');
}

// ───────────────────────── files

async function confirmDiscard() {
  if (!state.dirty) return true;
  const answer = await popups.open('confirm', { title: t('confirm.unsavedTitle'), message: t('confirm.unsaved', { name: state.project.name }), buttons: [['save', t('menu.save'), 'primary'], ['discard', t('confirm.discard'), 'danger'], ['cancel', t('common.cancel'), '']] });
  if (answer?.choice === 'save') return saveFile(false);
  return answer?.choice === 'discard';
}

async function newEmpty() {
  if (!(await confirmDiscard())) return;
  const project = newProject(t('project.untitled'));
  project.model = { nodes: [], edges: [] };
  addNode(project.model, 'input', { shape: '2' }, { x: 300, y: 60 });
  loadProject(project);
  switchTab('model');
}

async function openSample(id) {
  if (!(await confirmDiscard())) return;
  loadProject(sampleProject(id, lang()));
  notify(t('start.sampleOpened', { name: state.project.name }), 'success');
}

async function openFile() {
  if (!(await confirmDiscard())) return;
  try {
    if (desktop) {
      const path = await native.chooseOpenPath(['mytrain']);
      if (!path) return;
      await openPath(path);
    } else {
      const file = await native.pickTextFileWeb('.mytrain', 'MyTrainer');
      if (!file) return;
      loadProject(parseProject(file.text), { path: file.name, handle: file.handle });
      rememberRecent(file.name, true);
    }
  } catch (error) { reportError(error, 'open'); }
}

async function openPath(path) {
  const text = await native.readTextFile(path, 'open');
  loadProject(parseProject(text), { path });
  rememberRecent(path, false);
  notify(t('file.opened', { name: baseName(path) }), 'success');
}

async function openRecent(path) {
  if (!(await confirmDiscard())) return;
  if (!desktop) { notify(t('start.webRecent'), 'error'); return; }
  try { await openPath(path); } catch (error) {
    state.recent = removeRecent(state.recent, path);
    storeRecent(storage, state.recent);
    reportError(error, 'open');
  }
}

function rememberRecent(path, web) {
  state.recent = addRecent(state.recent, { path, title: state.project.name, web });
  storeRecent(storage, state.recent);
}

async function saveFile(saveAs) {
  try {
    if (state.settings.saveWeights && state.project.engine === 'tfjs' && state.run.history.length) await storeWeights();
    const text = serializeProject(state.project, { includeWeights: state.settings.saveWeights });
    const name = `${state.project.name.replace(/[\\/:*?"<>|]/g, '_') || 'model'}.mytrain`;
    if (desktop) {
      let path = state.path;
      if (saveAs || !path) path = await native.chooseSavePath(path ?? name, ['mytrain']);
      if (!path) return false;
      if (!/\.mytrain$/i.test(path)) path += '.mytrain';
      await native.writeTextFile(path, text, 'save');
      state.path = path;
      rememberRecent(path, false);
    } else {
      const saved = await native.saveFileWeb(text, { name, handle: state.webHandle, saveAs });
      if (!saved) return false;
      state.path = saved.name;
      state.webHandle = saved.handle;
      rememberRecent(saved.name, true);
    }
    state.dirty = false;
    notify(t('file.saved', { name: baseName(state.path) }), 'success');
    renderStatus();
    renderMenubar();
    saveSession();
    return true;
  } catch (error) {
    reportError(error, 'save');
    return false;
  }
}

async function importCsv() {
  try {
    let text; let name;
    if (desktop) {
      const path = await native.chooseOpenPath(['csv']);
      if (!path) return;
      text = await native.readTextFile(path, 'open');
      name = baseName(path);
    } else {
      const file = await native.pickTextFileWeb('.csv,.tsv,.txt', 'CSV');
      if (!file) return;
      ({ text, name } = file);
    }
    const rows = parseCsv(text).rows;
    const { columns } = describeTable(rows);
    if (columns.length < 2) throw new Error(t('data.csvColumns'));
    state.tableRows = rows;
    state.project.dataset = { source: { kind: 'table', name, text, target: columns.at(-1).name, features: null, task: 'auto' }, steps: [newStep('standardize')], split: cleanSplit(state.project.dataset.split) };
    rebuildData();
    adaptModelToData();
    commit('csv', { data: false });
    switchTab('data');
    notify(t('data.csvLoaded', { name, rows: rows.length }), 'success');
  } catch (error) { reportError(error, 'csv'); }
}

async function importImages() {
  const size = 28;
  try {
    let entries = [];
    if (desktop) {
      const dir = await native.chooseFolder();
      if (!dir) return;
      const list = await native.listImageFolder(dir, 600, IMAGE_EXTENSIONS);
      if (!list.length) throw new Error(t('data.noImages'));
      notify(t('data.readingImages', { n: list.length }));
      for (const [i, entry] of list.entries()) {
        const b64 = await native.readBase64File(entry.path, 'image');
        entries.push({ label: entry.label, blob: new Blob([native.base64ToBytes(b64)]), name: entry.path });
        if (i % 50 === 0) notify(t('data.readingImages', { n: `${i}/${list.length}` }));
      }
      state.project.dataset.source = { kind: 'images', name: baseName(dir), size, channels: 1, items: [] };
    } else {
      const files = await native.pickWithInput(IMAGE_ACCEPT, { multiple: true, directory: true });
      entries = files.filter((file) => isImageName(file.name)).map((file) => {
        const parts = (file.webkitRelativePath || file.name).split('/');
        return { label: parts.length >= 3 ? parts.at(-2) : 'images', blob: file, name: file.name };
      });
      if (!entries.length) throw new Error(t('data.noImages'));
    }
    const classes = new Set(entries.map((entry) => entry.label));
    if (classes.size < 2) throw new Error(t('data.oneClass'));
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const items = [];
    for (const entry of entries) {
      const bitmap = await decodePicture(await entry.blob.arrayBuffer(), entry.name);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
      ctx.drawImage(bitmap, 0, 0, size, size);
      const rgba = ctx.getImageData(0, 0, size, size).data;
      const gray = new Uint8Array(size * size);
      for (let p = 0; p < size * size; p++) gray[p] = Math.round(0.299 * rgba[p * 4] + 0.587 * rgba[p * 4 + 1] + 0.114 * rgba[p * 4 + 2]);
      items.push({ label: entry.label, data: native.bytesToBase64(gray) });
    }
    state.project.dataset = { source: { kind: 'images', name: state.project.dataset.source.name ?? 'images', size, channels: 1, items }, steps: [], split: cleanSplit(state.project.dataset.split) };
    rebuildData();
    adaptModelToData();
    commit('images');
    switchTab('data');
    notify(t('data.imagesLoaded', { n: items.length, classes: classes.size }), 'success');
  } catch (error) { reportError(error, 'images'); }
}

/** After new data: the output layer gets as many units as the task needs (when it is a Dense layer). */
function adaptModelToData() {
  if (!state.task) return;
  const out = outputNodes(model())[0];
  if (!out || out.type !== 'dense') return;
  const task = state.task;
  if (task.kind === 'classification') {
    if (task.classes === 2 && out.params.units <= 2) { out.params.units = 1; out.params.activation = 'sigmoid'; } else { out.params.units = task.classes; out.params.activation = 'softmax'; }
  } else if (task.kind === 'regression') { out.params.units = task.outputShape[0]; out.params.activation = 'linear'; }
  analyse();
}

async function codeAction(action) {
  switch (action) {
    case 'regenerate': {
      if (state.project.code.custom) {
        const answer = await popups.open('confirm', { title: t('code.regenerate'), message: t('code.regenerateConfirm'), buttons: [['ok', t('code.regenerate'), 'primary danger'], ['cancel', t('common.cancel'), '']] });
        if (answer?.choice !== 'ok') return;
      }
      state.project.code = { text: generatedCode(), custom: false };
      codeView.setText(state.project.code.text);
      codeView.renderToolbar();
      commit('code', { render: false });
      break;
    }
    case 'run':
      setEngine('torch');
      startTraining();
      break;
    case 'save': {
      const name = `${state.project.name.replace(/[\\/:*?"<>|\s]/g, '_') || 'model'}.py`;
      const text = state.project.code.text ?? generatedCode();
      if (desktop) {
        const path = await native.chooseSavePath(name, ['py']);
        if (path) { await native.writeTextFile(path, text, 'save'); notify(t('file.saved', { name: baseName(path) }), 'success'); }
      } else await native.saveFileWeb(text, { name, mime: 'text/x-python', saveAs: true });
      break;
    }
    case 'copy':
      await navigator.clipboard.writeText(state.project.code.text ?? '').catch(() => {});
      notify(t('code.copied'), 'success');
      break;
    case 'search': codeView.openSearch(); break;
    default: break;
  }
}

function setEngine(kind) {
  if (busy() || state.project.engine === kind) return;
  if (kind === 'torch' && !desktop) { notify(t('web.desktopOnly'), 'error'); return; }
  state.project.engine = kind;
  state.snapshot = null;
  commit('engine', { render: false });
  if (kind === 'torch') choosePython({ ask: false }).then(() => renderAll());
  else probe(null, 'initial').catch(() => {});
  renderAll();
}

async function evaluateNow() {
  const engine = currentEngine();
  if (engine.kind === 'tfjs') { await prepareTf(); engine.evaluate(); } else if (engine.canServe) engine.evaluate();
  else notify(t('test.torchNeedsRun'), 'error');
}

function openGuide() {
  native.openGuideWindow(lang() === 'en' ? 'UsersGuide.en.html' : 'UsersGuide.html', `${t('menu.guide')} — MyTrainer`).catch((error) => reportError(error, 'guide'));
}

async function openGallery() {
  const result = await popups.open('samples', {});
  if (result?.sample) openSample(result.sample);
}

/** The canvas the zoom commands work on: the neuron view on its tab, else the model graph. */
function zoomView() {
  if (state.showStart) return null;
  const tab = state.view.tab;
  if (tab === 'neurons') return neuronModel ?? null;
  if (tab === 'train') return neuronTrain ?? null;
  if (tab === 'test') return neuronTest ?? null;
  return tab === 'model' ? graphView : null;
}
const zoomPercent = () => `${Math.round((zoomView()?.zoom ?? zoomView()?.fitScale ?? 1) * 100)}%`;

/** − [zoom %] + and "fit": the zoom of the model graph or the neuron view, shown between its buttons. */
function zoomControls() {
  return `<span class="zoom-group">
      <button class="icon-button" data-command="zoomOut" title="${escapeHtml(tip('zoomOut'))}" aria-label="${escapeHtml(tip('zoomOut'))}">${icon('zoomOut')}</button>
      <span class="zoom-value" data-zoom-value title="${escapeHtml(t('model.zoom'))}">${zoomPercent()}</span>
      <button class="icon-button" data-command="zoomIn" title="${escapeHtml(tip('zoomIn'))}" aria-label="${escapeHtml(tip('zoomIn'))}">${icon('zoomIn')}</button>
      <button class="button small" data-command="fit" title="${escapeHtml(tip('fit'))}">${icon('fitPage')}<span>${escapeHtml(t('model.resetView'))}</span></button>
    </span>`;
}
function showZoom() {
  const label = root.querySelector('[data-zoom-value]');
  if (label) label.textContent = zoomPercent();
}

function setGraphDirection(direction) {
  if (state.settings.graphDirection === direction) return;
  updateSettings({ graphDirection: direction });
  requestAnimationFrame(() => graphView?.fit());
}

async function openSettings(tab = null) {
  await popups.open('settings', tab ? { tab } : {});
  settingsFromStorage();
}

/** What the settings window stored: shown at once (every change while it is open, and its Cancel). */
function settingsFromStorage() {
  const before = state.settings.language;
  state.settings = loadSettings(storage);
  setLanguage(state.settings.language);
  if (state.settings.language !== before) native.setBackendLanguage(state.settings.language);
  applyLook();
  applyFont(state.settings);
  if (!state.project.code.custom) state.project.code.text = generatedCode();
  renderAll();
}

async function openPyEnv() {
  if (!desktop) { notify(t('web.desktopOnly'), 'error'); return; }
  popups.open('pyenv', { detection: state.python, chosen: state.settings.pythonPath, nvidia: state.python?.nvidia ?? false }).then(async () => {
    state.settings = loadSettings(storage);
    renderAll();
  });
  if (!state.python) refreshPython();
}

async function refreshPython() {
  try {
    popups.post('pyenv', { type: 'detecting' });
    state.python = await native.pyDetect();
    popups.post('pyenv', { type: 'detection', detection: state.python, chosen: state.settings.pythonPath });
    renderAll();
  } catch (error) {
    popups.post('pyenv', { type: 'error', message: native.errorText(error) });
  }
}

popups.on('settings-preview', () => settingsFromStorage());
popups.on('report-save', ({ format, settings }) => { saveReport(format, settings).catch((error) => reportError(error, 'report')); });
popups.on('py-refresh', () => refreshPython());
popups.on('py-use', ({ path }) => { updateSettings({ pythonPath: path }, { quiet: true }); popups.post('pyenv', { type: 'detection', detection: state.python, chosen: path }); renderAll(); });
popups.on('py-install', async ({ base, variant }) => {
  const resolved = variant === 'auto' ? (state.python?.nvidia ? 'cuda' : 'cpu') : variant;
  log(t('py.installing', { variant: resolved }));
  try {
    const python = await native.pyInstallTorch(base, resolved);
    log(t('py.installed', { path: python }), 'success');
    state.python = await native.pyDetect();
    updateSettings({ pythonPath: python }, { quiet: true });
    popups.post('pyenv', { type: 'installed', detection: state.python, chosen: python });
    renderAll();
  } catch (error) {
    log(native.errorText(error), 'error');
    popups.post('pyenv', { type: 'installFailed', message: native.errorText(error) });
  }
});
popups.on('py-install-python', async () => {
  try {
    await native.pyInstallPython();
    await refreshPython();
  } catch (error) { popups.post('pyenv', { type: 'installFailed', message: native.errorText(error) }); }
});
popups.on('py-cancel', () => native.pyCancelInstall());

/** No PyTorch anywhere on the first start (macOS / Linux, or the Windows installer's step failed): install Python and
 *  PyTorch once, with the progress in the Python window. Afterwards only the Python window installs. */
async function autoSetupPython() {
  if (!state.settings.pythonAutoSetup || state.python?.best != null) return;
  updateSettings({ pythonAutoSetup: false }, { quiet: true });
  popups.open('pyenv', { detection: state.python, chosen: state.settings.pythonPath, nvidia: state.python?.nvidia ?? false }).then(() => { state.settings = loadSettings(storage); renderAll(); });
  popups.post('pyenv', { type: 'installing' });
  log(t('py.autoSetup'));
  try {
    const python = await native.pySetup();
    log(t('py.installed', { path: python }), 'success');
    state.python = await native.pyDetect();
    popups.post('pyenv', { type: 'installed', detection: state.python, chosen: python });
    renderAll();
  } catch (error) {
    log(native.errorText(error), 'error');
    popups.post('pyenv', { type: 'installFailed', message: native.errorText(error) });
  }
}
popups.on('error', (error) => reportError(error, 'popup'));
popups.on('report-error', (data) => log(`${data.context}: ${data.message}\n${data.detail ?? ''}`, 'error'));

function reportError(error, context) {
  const text = native.errorText(error);
  log(`${context}: ${text}`, 'error');
  showError(text, context, error?.stack);
}

/**
 * An error in a popup: the message, then the details (where, when, version, platform, engine, stack) that
 * the popup's "Copy" puts on the clipboard. One at a time (the next ones are in the console).
 */
let errorOpen = false;
function showError(message, context, stack = null) {
  notify(message, 'error');
  if (errorOpen || state.settings.errorPopups === false) return;
  errorOpen = true;
  const detail = [
    `${t('error.where')}: ${context}`,
    `${t('error.when')}: ${new Date().toLocaleString()}`,
    `MyTrainer ${VERSION} · ${desktop ? 'desktop' : 'web'} · ${api.engineLabel()}`,
    state.project?.name ? `${t('error.project')}: ${state.project.name}` : '',
    stack ? `\n${stack}` : '',
  ].filter(Boolean).join('\n');
  popups.open('error', { message, detail }).catch(() => {}).finally(() => { errorOpen = false; });
}

async function requestExit() {
  if (state.settings.confirmExit && !(await confirmDiscard())) return;
  saveSession();
  stopEverything();
  if (desktop) native.quitApp(); else window.close();
}

// ───────────────────────── rendering

function shell() {
  root.innerHTML = `
    <div id="menubar" role="menubar"></div>
    <div id="toolbar"></div>
    <div id="workspace">
      <aside id="left-panel" class="side-panel"></aside>
      <div class="splitter panel-split" data-split="left"></div>
      <section id="center">
        <nav id="tabs" class="view-tabs"></nav>
        <div id="center-body"></div>
        <div id="start-page" hidden></div>
        <div class="hsplitter" data-split="bottom"></div>
        <section id="bottom-panel"></section>
      </section>
      <div class="splitter panel-split" data-split="right"></div>
      <aside id="right-panel" class="side-panel"></aside>
    </div>
    <footer id="statusbar" role="status"></footer>
    ${desktop ? `<div class="resize-grip" data-resize-grip title="${escapeHtml(t('tip.resize'))}">${icon('grip')}</div>` : ''}`;
  bindShell();
}

function renderAll() {
  root.classList.toggle('no-status', !state.settings.showStatusBar);
  root.classList.toggle('no-left', !state.settings.showLeftPanel);
  root.classList.toggle('no-right', !state.settings.showRightPanel);
  root.classList.toggle('no-bottom', !state.settings.showBottomPanel);
  root.classList.toggle('on-start', state.showStart);
  root.style.setProperty('--left-width', `${state.settings.leftWidth}px`);
  root.style.setProperty('--right-width', `${state.settings.rightWidth}px`);
  root.style.setProperty('--bottom-height', `${state.settings.bottomHeight}px`);
  renderMenubar();
  renderToolbar();
  renderLeft();
  renderTabs();
  renderCenter();
  renderRight();
  renderBottom();
  renderStatus();
  renderStart();
}

let renderAllPending = false;
function renderAllSoon() {
  if (renderAllPending) return;
  renderAllPending = true;
  requestAnimationFrame(() => { renderAllPending = false; renderAll(); });
}

function renderMenubar() {
  const bar = root.querySelector('#menubar');
  const title = `${state.project.name}${state.dirty ? ' *' : ''}`;
  const brand = `<div class="app-brand" data-window-drag><img class="app-brand-icon" src="${appIcon}" alt="" data-window-drag/><span class="app-brand-name" data-window-drag>MyTrainer</span><span class="app-brand-version" data-window-drag>v${escapeHtml(VERSION)}</span></div>`;
  const home = `<button class="menubar-item menubar-home ${state.showStart ? 'current' : ''}" data-command="home" title="${escapeHtml(t('menu.home'))}">${icon('home')}<span>${escapeHtml(t('menu.home'))}</span></button><span class="menubar-sep"></span>`;
  const menus = Object.keys(MENUS).map((name) => `<button class="menubar-item ${state.openMenu === name ? 'open' : ''}" data-menu="${name}" role="menuitem" aria-haspopup="true">${icon(MENU_ICONS[name])}<span>${escapeHtml(t(`menu.${name}`))}</span></button>`).join('');
  const button = (id, glyph, key) => `<button class="window-button ${id === 'close' ? 'close' : ''}" data-window="${id}" title="${escapeHtml(t(key))}" aria-label="${escapeHtml(t(key))}">${icon(glyph)}</button>`;
  const controls = desktop ? `<div class="window-controls">${button('minimize', 'winMinimize', 'window.minimize')}${button('maximize', state.maximized ? 'winRestore' : 'winMaximize', state.maximized ? 'window.restore' : 'window.maximize')}${button('close', 'winClose', 'window.close')}</div>` : '';
  bar.innerHTML = `${brand}${home}${menus}<div class="menubar-drag" data-window-drag></div>${controls}`;
  updateMinimumWidth();
  if (desktop) appWindow.setTitle(`${title} — MyTrainer v${VERSION}`).catch(() => {});
  document.title = `${title} — MyTrainer`;
}

function renderToolbar() {
  const bar = root.querySelector('#toolbar');
  const button = (id) => (id === 'language' ? `<button class="tool-button lang-button" data-command="language" title="${escapeHtml(tip('language'))}" aria-label="${escapeHtml(t(commands.language.label))}"><span class="lang-glyph" lang="${lang() === 'ko' ? 'en' : 'ko'}">${lang() === 'ko' ? 'Aa' : 'ᄒᆞᆫ'}</span></button>` : id === 'themeSplit' ? `<span class="split-button"><button class="tool-button" data-command="theme" title="${escapeHtml(tip('theme'))}">${icon('palette')}</button><button class="tool-button split-arrow" data-command="themeMenu" title="${escapeHtml(t('menu.themeMenu'))}" aria-haspopup="true">${icon('chevronDown')}</button></span>` : `<button class="tool-button" data-command="${id}" title="${escapeHtml(tip(id))}" aria-label="${escapeHtml(t(commands[id].label))}">${icon(id === 'pause' && state.run.state === 'paused' ? 'play' : commands[id].icon)}</button>`);
  const engine = `<span class="segmented tool-engine" role="radiogroup" title="${escapeHtml(t('train.engine'))}">
    <button class="segment ${state.project.engine === 'tfjs' ? 'active' : ''}" data-command="engineTf">${icon('engineTf')}<span>TensorFlow</span></button>
    <button class="segment ${state.project.engine === 'torch' ? 'active' : ''}" data-command="engineTorch" ${desktop ? '' : 'disabled'} title="${escapeHtml(desktop ? t('menu.engineTorch') : t('web.desktopOnly'))}">${icon('engineTorch')}<span>PyTorch</span></button>
  </span>`;
  bar.innerHTML = `<div class="toolbar-inner"><div class="toolbar-left">${TOOLBAR.map((group) => `<div class="tool-group">${group.map(button).join('')}</div>`).join('<span class="tool-sep"></span>')}<span class="tool-sep"></span>${engine}</div>
    <span class="grow"></span><div class="toolbar-right tool-group">${TOOLBAR_RIGHT.map(button).join('')}</div></div>`;
  renderToolbarState();
  updateMinimumWidth();
}

/** The width a bar needs to show everything unsqueezed: laid out once at max-content (items at their full
 * width, gaps, padding, the fillers at their minimum), measured, and put back. */
function naturalWidth(bar, ...inner) {
  const elements = [bar, ...inner];
  const saved = elements.map((el) => el.style.width);
  for (const el of elements) el.style.width = 'max-content';
  const width = bar.getBoundingClientRect().width;
  elements.forEach((el, i) => { el.style.width = saved[i]; });
  return width;
}

/** The window never gets so narrow that toolbar buttons, menus or the window buttons are cut off: its minimum width follows them. */
function updateMinimumWidth() {
  // Measured again once the fonts are in: the text of the bars may get wider.
  if (!updateMinimumWidth.fonts) {
    updateMinimumWidth.fonts = document.fonts?.ready.then(() => updateMinimumWidth());
    // A window made narrower some other way (a restored placement, another program) grows back to the minimum.
    window.addEventListener('resize', () => {
      const needed = updateMinimumWidth.last;
      if (needed && window.innerWidth < needed - 1) native.setMinimumSize(needed, 680).catch(() => {});
    });
  }
  requestAnimationFrame(() => {
    const toolbarRow = root.querySelector('#toolbar');
    const inner = root.querySelector('#toolbar .toolbar-inner');
    const menubarRow = root.querySelector('#menubar');
    if (!toolbarRow || !inner || !menubarRow) return;
    const needed = Math.ceil(Math.max(1100, naturalWidth(toolbarRow, inner), naturalWidth(menubarRow)) + 2);
    root.style.setProperty('--min-width', `${needed}px`);
    if (needed !== updateMinimumWidth.last) { updateMinimumWidth.last = needed; native.setMinimumSize(needed, 680).catch(() => {}); }
  });
}

function renderToolbarState() {
  for (const element of root.querySelectorAll('#toolbar [data-command]')) {
    const id = element.dataset.command;
    if (!commands[id]) continue;
    element.disabled = !enabled(id) || (id === 'engineTorch' && !desktop);
    const checked = commands[id].checked?.();
    if (element.classList.contains('tool-button')) element.classList.toggle('active', Boolean(checked));
  }
}

function renderLeft() {
  const panel = root.querySelector('#left-panel');
  if (!state.settings.showLeftPanel) {
    panel.innerHTML = `<div class="panel-rail"><button class="rail-button expand" data-command="leftPanel" title="${escapeHtml(t('menu.leftPanel'))}">${icon('panelLeft')}</button></div>`;
    return;
  }
  const filter = (state.paletteFilter ?? '').toLowerCase();
  const matches = (type) => !filter || type.toLowerCase().includes(filter) || t(`layer.${type}`).toLowerCase().includes(filter) || (LAYERS[type].torch ?? '').toLowerCase().includes(filter);
  const groups = LAYER_GROUPS.map(([group, types]) => {
    const shown = types.filter(matches);
    if (!shown.length) return '';
    return `<div class="palette-group"><h4>${escapeHtml(t(`group.${group}`))}</h4><div class="tool-grid">${shown.map((type) => `<button class="tool-tile" draggable="true" data-palette-layer="${type}" title="${escapeHtml(`${t(`layer.${type}`)} — ${t(`layerDesc.${type}`)} (PyTorch: ${LAYERS[type].torch})`)}">${icon(LAYERS[type].icon)}<span>${escapeHtml(t(`layer.${type}`))}</span></button>`).join('')}</div></div>`;
  }).join('');
  const blocks = BLOCK_IDS.filter((id) => !filter || t(`block.${id}`).toLowerCase().includes(filter)).map((id) => `<button class="tool-tile" draggable="true" data-palette-block="${id}" title="${escapeHtml(BLOCKS[id].layers.map(([type]) => t(`layer.${type}`)).join(' → '))}">${icon(BLOCKS[id].icon)}<span>${escapeHtml(t(`block.${id}`))}</span></button>`).join('');
  panel.innerHTML = `<div class="panel-header">${icon('tabModel')}<span>${escapeHtml(t('palette.title'))}</span><button class="icon-button" data-command="leftPanel" title="${escapeHtml(t('menu.leftPanel'))}">${icon('chevronLeft')}</button></div>
    <div class="panel-section palette-scroll">
      <div class="search-box">${icon('search')}<input type="text" data-palette-filter value="${escapeHtml(state.paletteFilter ?? '')}" placeholder="${escapeHtml(t('palette.search'))}" spellcheck="false"/></div>
      <p class="muted small">${escapeHtml(t('palette.hint'))}</p>
      ${groups}
      ${blocks ? `<div class="palette-group"><h4>${escapeHtml(t('palette.blocks'))}</h4><div class="tool-grid">${blocks}</div></div>` : ''}
    </div>
    <div class="panel-section project-section"><h3>${icon('file')}<span>${escapeHtml(t('project.title'))}</span></h3>
      <input type="text" class="wide" data-project-name value="${escapeHtml(state.project.name)}" aria-label="${escapeHtml(t('project.name'))}"/>
      <textarea data-project-desc rows="3" placeholder="${escapeHtml(t('project.description'))}">${escapeHtml(state.project.description)}</textarea>
    </div>`;
}

/** Too narrow for the tab names (minimum window size, wide side panels): icons only, names in the tooltips. */
function fitTabs() {
  requestAnimationFrame(() => {
    const tabs = root.querySelector('#tabs');
    if (!tabs) return;
    tabs.classList.remove('compact');
    if (tabs.scrollWidth > tabs.clientWidth + 1) tabs.classList.add('compact');
  });
}

function renderTabs() {
  const tabs = root.querySelector('#tabs');
  tabs.innerHTML = VIEW_TABS.map((tab, i) => `<button class="tab ${state.view.tab === tab ? 'active' : ''}" data-tab="${tab}" title="${escapeHtml(`${t(`tab.${tab}`)} (Ctrl+${i + 1})`)}">${icon(commands[`tab_${tab}`].icon)}<span>${escapeHtml(t(`tab.${tab}`))}</span>${tab === 'model' && state.problems.some((p) => p.level === 'error') ? '<i class="tab-badge error">!</i>' : ''}${tab === 'train' && busy() ? '<i class="tab-badge live"></i>' : ''}${tab === 'code' && state.project.code.custom ? '<i class="tab-badge edited"></i>' : ''}</button>`).join('')
    + `<span class="grow"></span><span class="tab-info muted">${escapeHtml(state.task ? `${t(`task.${state.task.kind}`)} · ${shapeText(state.prepared?.inputShape)} → ${shapeText(state.shapes.get(outputId())?.shape)}` : '')}</span>`;
  fitTabs();
}

let graphView = null;
let neuronModel = null;
let neuronTrain = null;
let neuronTest = null;
let codeView = null;
let graphHost = null;
let neuronHost = null;

function renderCenter() {
  const body = root.querySelector('#center-body');
  if (state.showStart) { body.hidden = true; return; }
  body.hidden = false;
  neuronTrain?.destroy(); neuronTrain = null;
  neuronTest?.destroy(); neuronTest = null;
  const tab = state.view.tab;
  if (tab === 'model' || tab === 'neurons') {
    const mode = tab === 'model' ? 'graph' : 'neurons';
    if (!body.querySelector('.model-view')) {
      body.innerHTML = `<div class="model-view"><div class="model-toolbar"></div><div class="model-stage"></div></div>`;
    }
    const bar = body.querySelector('.model-toolbar');
    const errors = state.problems.filter((p) => p.level === 'error').length;
    const warnings = state.problems.length - errors;
    bar.innerHTML = `${mode === 'graph' ? `<button class="button small" data-command="addLayer">${icon('plus')}<span>${escapeHtml(t('menu.addLayer'))}</span></button>
      <button class="button small" data-command="autoLayout">${icon('layoutAuto')}<span>${escapeHtml(t('menu.autoLayout'))}</span></button>
      <span class="tool-sep"></span>
      <span class="segmented" role="group" aria-label="${escapeHtml(t('model.direction'))}">${['graphVertical', 'graphHorizontal'].map((id) => `<button class="segment ${commands[id].checked() ? 'active' : ''}" data-command="${id}" title="${escapeHtml(tip(id))}">${icon(commands[id].icon)}<span>${escapeHtml(t(`model.${id}`))}</span></button>`).join('')}</span>
      <button class="button small ${state.settings.showGrid ? 'active' : ''}" data-command="toggleGrid" title="${escapeHtml(tip('toggleGrid'))}" aria-pressed="${state.settings.showGrid}">${icon('grid')}<span>${escapeHtml(t('model.grid'))}</span></button>
      <span class="tool-sep"></span>
      ${zoomControls()}` : `${probeNav()}<button class="button small" data-probe-run>${icon('probe')}<span>${escapeHtml(t('model.runProbe'))}</span></button>
      <label class="inline-check">${escapeHtml(t('model.colorMap'))}<select data-setting="colorMap">${['diverging', 'viridis', 'magma', 'gray'].map((m) => `<option value="${m}" ${state.settings.colorMap === m ? 'selected' : ''}>${escapeHtml(t(`colorMap.${m}`))}</option>`).join('')}</select></label>
      <label class="inline-check">${escapeHtml(t('model.maxNeurons'))}<select data-setting="maxNeurons">${[8, 12, 16, 24, 32, 48, 64].map((n) => `<option value="${n}" ${state.settings.maxNeurons === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="inline-check"><input type="checkbox" data-setting="showLinks" ${state.settings.showLinks ? 'checked' : ''}/>${escapeHtml(t('model.showLinks'))}</label>
      <label class="inline-check"><input type="checkbox" data-setting="animateFlow" ${state.settings.animateFlow ? 'checked' : ''}/>${escapeHtml(t('model.animate'))}</label>
      <span class="tool-sep"></span>
      ${zoomControls()}`}
      <span class="grow"></span>
      <span class="model-check ${errors ? 'error' : warnings ? 'warning' : 'ok'}" data-bottom-tab="problems" title="${escapeHtml(t('inspector.problems'))}">${icon(errors ? 'error' : warnings ? 'warning' : 'check')}<span>${escapeHtml(errors || warnings ? t('model.problems', { errors, warnings }) : t('model.ok'))}</span></span>
      <span class="muted small">${escapeHtml(t('inspector.params'))}: ${totalParams(state.shapes).total.toLocaleString()}</span>`;
    const stage = body.querySelector('.model-stage');
    if (mode === 'graph') {
      if (!graphHost) { graphHost = document.createElement('div'); graphHost.className = 'graph-host'; graphView = new GraphView(graphHost, api); }
      if (stage.firstChild !== graphHost) stage.replaceChildren(graphHost);
      graphView.render();
    } else {
      if (!neuronHost) { neuronHost = document.createElement('div'); neuronHost.className = 'neuron-host full'; neuronModel = new NeuronView(neuronHost, api); }
      if (stage.firstChild !== neuronHost) stage.replaceChildren(neuronHost);
      neuronModel.render();
    }
    showZoom();
    return;
  }
  if (tab === 'code') {
    if (!codeView) codeView = new CodeView(api);
    if (body.firstChild !== codeView.element) codeView.mount(body);
    codeView.setText(state.project.code.text ?? generatedCode());
    codeView.renderToolbar();
    return;
  }
  if (tab === 'data') body.innerHTML = dataViewHtml(api);
  else if (tab === 'train') body.innerHTML = trainViewHtml(api);
  else if (tab === 'test') body.innerHTML = testViewHtml(api);
  bindSteppers(body.firstElementChild ?? body, onStepper);
  redrawCenter();
}

/**
 * Stretch guard: a canvas drawn before the layout settled (or before a panel was resized) shows its
 * pixels at another aspect ratio. Such canvases make the center redraw (a few times at most).
 */
let stretchRounds = 0;
function guardStretch() {
  cancelAnimationFrame(guardStretch.frame);
  guardStretch.frame = requestAnimationFrame(() => {
    const body = root.querySelector('#center-body');
    const stretched = [...body.querySelectorAll('canvas')].some((canvas) => {
      if (canvas.closest('.neuron-host') || !canvas.width || !canvas.height) return false;
      const r = canvas.getBoundingClientRect();
      return r.width > 4 && r.height > 4 && Math.abs((r.width / r.height) / (canvas.width / canvas.height) - 1) > 0.02;
    });
    if (stretched && stretchRounds++ < 3) redrawCenter();
    else if (!stretched) stretchRounds = 0;
  });
}

/** Redraws the canvases of the current Data / Train / Test tab. */
function redrawCenter() {
  guardStretch();
  const body = root.querySelector('#center-body');
  const tab = state.view.tab;
  if (tab === 'data') drawDataView(api, body);
  if (tab === 'train') {
    drawTrainView(api, body);
    const host = body.querySelector('[data-neuron="train"]');
    if (host && !neuronTrain) neuronTrain = new NeuronView(host, api, { compact: true });
    neuronTrain?.render();
  }
  if (tab === 'test') {
    drawTestView(api, body);
    drawLive(body.querySelector('.live-section'));
    const host = body.querySelector('[data-neuron="test"]');
    if (host && !neuronTest) neuronTest = new NeuronView(host, api);
    neuronTest?.render();
  }
}

/** Light update while training: status, progress, charts (no rebuilding of the form). */
function renderTrainLive() {
  clearTimeout(renderTrainLive.timer);
  renderTrainLive.timer = setTimeout(() => {
    renderStatus();
    renderToolbarState();
    if (state.view.tab !== 'train' || state.showStart) return;
    const body = root.querySelector('#center-body');
    const line = body.querySelector('.status-line');
    if (line) line.textContent = statusText(api);
    const bar = body.querySelector('.progress-line i');
    if (bar && state.run.epochs) bar.style.width = `${Math.min(100, (100 * (state.run.epoch - state.run.from)) / state.run.epochs)}%`;
    drawTrainView(api, body);
  }, 60);
}

function renderRight() {
  const panel = root.querySelector('#right-panel');
  if (!state.settings.showRightPanel) {
    panel.innerHTML = `<div class="panel-rail"><button class="rail-button expand" data-command="rightPanel" title="${escapeHtml(t('menu.rightPanel'))}">${icon('panelRight')}</button></div>`;
    return;
  }
  const scroll = panel.querySelector('.inspector')?.scrollTop ?? 0;
  panel.innerHTML = `<div class="panel-header">${icon('info')}<span>${escapeHtml(t('inspector.title'))}</span><button class="icon-button" data-command="rightPanel" title="${escapeHtml(t('menu.rightPanel'))}">${icon('chevronRight')}</button></div><div class="inspector">${inspectorHtml(api)}</div>`;
  const inspector = panel.querySelector('.inspector');
  inspector.scrollTop = scroll;
  bindSteppers(inspector, onStepper);
  requestAnimationFrame(() => drawInspector(api, inspector));
}

function renderBottom() {
  const panel = root.querySelector('#bottom-panel');
  if (!state.settings.showBottomPanel) { panel.innerHTML = ''; return; }
  const tabs = [['console', 'console'], ['summary', 'table'], ['problems', 'problems']];
  const errors = state.problems.filter((p) => p.level === 'error').length;
  panel.innerHTML = `<div class="bottom-tabs">${tabs.map(([id, glyph]) => `<button class="tab ${state.view.bottomTab === id ? 'active' : ''}" data-bottom-tab="${id}">${icon(glyph)}<span>${escapeHtml(t(`bottom.${id}`))}</span>${id === 'problems' && state.problems.length ? `<i class="count ${errors ? 'error' : ''}">${state.problems.length}</i>` : ''}</button>`).join('')}
    <span class="grow"></span>${state.view.bottomTab === 'console' ? `<button class="icon-button" data-console-clear title="${escapeHtml(t('bottom.clear'))}">${icon('clear')}</button>` : ''}
    <button class="icon-button" data-command="bottomPanel" title="${escapeHtml(t('menu.bottomPanel'))}">${icon('chevronDown')}</button></div>
    <div class="bottom-body"></div>`;
  if (state.view.bottomTab === 'console') renderConsole();
  else if (state.view.bottomTab === 'summary') renderSummary();
  else renderProblems();
}

function renderConsole(append = false) {
  const body = root.querySelector('#bottom-panel .bottom-body');
  if (!body || state.view.bottomTab !== 'console') return;
  const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 30;
  const line = (entry) => `<div class="log-line ${entry.level}"><span class="log-time">${entry.time.toLocaleTimeString(lang() === "ko" ? "ko-KR" : "en-US")}</span><span class="log-text">${escapeHtml(entry.text)}</span></div>`;
  if (append && body.firstElementChild?.classList.contains('console')) {
    const consoleEl = body.firstElementChild;
    consoleEl.querySelector('.log-empty')?.remove();
    consoleEl.insertAdjacentHTML('beforeend', line(state.console.at(-1)));
    while (consoleEl.childElementCount > 1500) consoleEl.firstElementChild.remove();
  } else {
    body.innerHTML = `<div class="console">${state.console.slice(-1500).map(line).join('') || `<div class="muted log-empty">${escapeHtml(t('bottom.empty'))}</div>`}</div>`;
  }
  if (atBottom || !append) body.scrollTop = body.scrollHeight;
}

function renderSummary() {
  const body = root.querySelector('#bottom-panel .bottom-body');
  let order;
  try { order = topoOrder(model()); } catch { order = model().nodes.map((node) => node.id); }
  const budget = modelBudget(model(), state.shapes);
  const cost = new Map(budget.rows.map((row) => [row.id, row]));
  const rows = order.map((id) => {
    const node = nodeById(model(), id);
    const info = state.shapes.get(id);
    const row = cost.get(id);
    const inputs = incoming(model(), id).map((edge) => nodeById(model(), edge.from)?.name).join(', ');
    return `<tr data-reveal="${id}"><td>${escapeHtml(node.name)}</td><td>${escapeHtml(t(`layer.${node.type}`))}</td><td>${escapeHtml(info?.shape ? shapeText(info.shape) : '—')}</td><td class="num">${(info?.params?.total ?? 0).toLocaleString()}</td><td class="num">${row?.macs ? shortCount(row.macs) : '—'}</td><td class="num">${row ? shortBytes(row.outBytes) : '—'}</td><td>${escapeHtml(inputs)}</td></tr>`;
  }).join('');
  const total = totalParams(state.shapes);
  body.innerHTML = `<table class="summary-table"><thead><tr><th>${escapeHtml(t('summary.layer'))}</th><th>${escapeHtml(t('summary.type'))}</th><th>${escapeHtml(t('summary.output'))}</th><th class="num">${escapeHtml(t('summary.params'))}</th><th class="num" title="${escapeHtml(t('summary.macsTip'))}">MACs</th><th class="num">${escapeHtml(t('summary.outSize'))}</th><th>${escapeHtml(t('summary.inputs'))}</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td colspan="3">${escapeHtml(t('summary.total'))}</td><td class="num">${total.total.toLocaleString()}</td><td class="num">${shortCount(budget.macs)}</td><td class="num">${shortBytes(budget.activationBytes)}</td><td>${escapeHtml(t('inspector.trainable'))} ${total.trainable.toLocaleString()}</td></tr>
      <tr class="budget-row"><td colspan="7">${escapeHtml(t('summary.budget', { macs: shortCount(budget.macs), w32: shortBytes(budget.weightBytes32), w8: shortBytes(budget.weightBytes8), peak: shortBytes(budget.peakBytes) }))}</td></tr></tfoot></table>`;
}

function renderProblems() {
  const body = root.querySelector('#bottom-panel .bottom-body');
  body.innerHTML = state.problems.length ? `<ul class="problem-list wide">${state.problems.map((p) => `<li class="${p.level}" ${p.nodeId ? `data-reveal="${p.nodeId}"` : ''}>${icon(p.level === 'error' ? 'error' : 'warning')}<span>${escapeHtml(problemText(p))}</span></li>`).join('')}</ul>` : `<p class="muted log-empty">${escapeHtml(t('inspector.noProblems'))}</p>`;
}

function renderStatus() {
  const bar = root.querySelector('#statusbar');
  if (!bar) return;
  const notice = state.notice;
  const items = [`<span class="status-notice ${notice?.kind ?? ''}" title="${escapeHtml(notice?.text ?? t('status.ready'))}">${icon(notice?.kind === 'error' ? 'error' : notice?.kind === 'success' ? 'check' : 'info')}<span>${escapeHtml(notice?.text ?? t('status.ready'))}</span></span>`];
  items.push(`<span class="status-item ${state.dirty ? 'modified' : 'saved'}" title="${escapeHtml(state.path ?? t('status.unsaved'))}">${icon(state.dirty ? 'edit' : 'save')}<span>${escapeHtml(state.dirty ? t('status.modified') : t('status.saved'))}</span></span>`);
  items.push(`<button class="status-item" data-command="${state.project.engine === 'torch' ? 'pyenv' : 'tab_train'}" title="${escapeHtml(t('train.engine'))}">${icon(state.project.engine === 'torch' ? 'engineTorch' : 'engineTf')}<span>${escapeHtml(api.engineLabel())}</span></button>`);
  items.push(`<span class="status-item">${icon('tabModel')}<span>${escapeHtml(t('status.params', { n: totalParams(state.shapes).total.toLocaleString() }))}</span></span>`);
  if (state.run.state !== 'idle' || state.run.history.length) {
    const last = state.run.history.at(-1);
    items.push(`<span class="status-item ${busy() ? 'warn' : ''}">${icon('tabTrain')}<span>${escapeHtml(statusText(api))}${last ? ` · ${t('train.lossShort')} ${Number(last.loss).toFixed(4)}` : ''}</span></span>`);
  }
  items.push(`<span class="status-item">${icon('globe')}<span>${escapeHtml(lang() === 'ko' ? '한국어' : 'English')}</span></span>`);
  bar.innerHTML = items.join('');
}

let startBackground = null;
function renderStart() {
  const host = root.querySelector('#start-page');
  if (!state.showStart) {
    host.hidden = true;
    startBackground?.stop();
    return;
  }
  host.hidden = false;
  host.innerHTML = startPageHtml(api);
  startBackground?.destroy();
  const canvas = host.querySelector('.start-bg');
  startBackground = new AnimatedBackground(canvas, {
    kind: state.settings.animation,
    speed: () => state.settings.animationSpeed / 100,
    colors: () => {
      const theme = resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme);
      return { ...theme.colors, dark: theme.dark };
    },
  });
  startBackground.start();
  clearInterval(renderStart.timer);
  if (state.settings.animationInterval) {
    renderStart.timer = setInterval(() => {
      if (!state.showStart) return;
      let next;
      if (state.settings.animationRandom) next = startBackground.shuffle();
      else {
        next = ANIMATIONS[(ANIMATIONS.indexOf(state.settings.animation) + 1) % ANIMATIONS.length];
        startBackground.setKind(next);
      }
      updateSettings({ animation: next }, { quiet: true });
      for (const chip of host.querySelectorAll('.anim-chip')) chip.classList.toggle('active', chip.dataset.value === next);
    }, state.settings.animationInterval * 1000);
  }
}

function switchTab(tab) {
  if (!VIEW_TABS.includes(tab)) return;
  if (tab !== 'test' && (state.live.mode || state.live.camera)) stopLive();
  state.showStart = false;
  state.view.tab = tab;
  renderAll();
  if (tab === 'model') requestAnimationFrame(() => { if (!graphView?.fitted) { graphView?.fit(); if (graphView) graphView.fitted = true; } });
  if (tab === 'test') runTest();
  else if ((tab === 'train' || tab === 'neurons') && !state.snapshot && state.project.engine === 'tfjs') probe(null, 'initial').catch(() => {});
}

// ───────────────────────── input from the views

function onStepper(key, value) {
  const [scope, a, b] = key.split(':');
  const p = state.project;
  if (scope === 'param') {
    const id = selectedNodes()[0];
    if (id && setParam(model(), id, a, value)) commit('param');
  } else if (scope === 'gen') {
    p.dataset.source.params[a] = value;
    commit('data', { data: true });
  } else if (scope === 'snd') {
    p.dataset.source[a] = value;
    commit('data', { data: true });
  } else if (scope === 'step') {
    p.dataset.steps[Number(a)].params[b] = value;
    p.dataset.steps = cleanSteps(p.dataset.steps);
    commit('data', { data: true });
  } else if (scope === 'split') {
    p.dataset.split = cleanSplit({ ...p.dataset.split, [a]: a === 'seed' ? value : value / 100 });
    commit('data', { data: true });
  } else if (scope === 'train') {
    p.train = cleanTrain({ ...p.train, [a]: value });
    commit('train', { render: false });
    renderStatus();
  }
}

/** What the right mouse button offers where it was pressed (every item has an icon). */
function contextItems(event) {
  const target = event.target;
  const text = textMenuItems(target, t);
  if (target.closest('input, textarea')) return text;
  if (target.closest('.cm-editor') && codeView) return codeView.contextItems(t);
  if (target.closest('.console')) {
    return [...text, ...(text.length ? ['sep'] : []),
      { label: t('ctx.copyLog'), icon: 'copyLog', action: () => navigator.clipboard.writeText(state.console.map((e) => e.time.toLocaleTimeString() + ' ' + e.text).join('\n')).catch(() => {}) },
      { label: t('ctx.clearLog'), icon: 'clear', action: () => { state.console = []; renderConsole(); } }];
  }
  const preview = target.closest('canvas[data-preview="main"]');
  if (preview?.hits) {
    const r = preview.getBoundingClientRect();
    const hit = preview.hits.find((h) => event.clientX - r.left >= h.x && event.clientX - r.left <= h.x + h.w && event.clientY - r.top >= h.y && event.clientY - r.top <= h.y + h.h);
    if (hit) {
      return [
        { label: t('ctx.useProbe'), icon: 'probe', action: () => previewClick(preview, event) },
        ...(state.data?.media?.type === 'audio' ? [{ label: t('ctx.playSound'), icon: 'volume', action: () => playWave(state.data.media.waves[hit.index], state.data.media.rate) }] : []),
      ];
    }
  }
  const neuronCanvas = target.closest('canvas.neuron-canvas');
  if (neuronCanvas?.view) {
    const found = neuronCanvas.view.hitAt(event);
    return [
      ...(found ? [{ label: t('ctx.unitInfo'), icon: 'neuron', action: () => api.selectUnit({ nodeId: found.hit.nodeId, unit: found.hit.unit, position: found.position ?? {} }) }, 'sep'] : []),
      { label: t('ctx.recompute'), icon: 'probe', action: () => probe(null, 'probe').catch(() => {}) },
      { label: t('model.showLinks'), icon: 'nodesView', checked: state.settings.showLinks, action: () => { updateSettings({ showLinks: !state.settings.showLinks }, { quiet: true }); for (const view of [neuronModel, neuronTrain, neuronTest]) view?.render(); } },
      { label: t('model.animate'), icon: 'animNeural', checked: state.settings.animateFlow, action: () => updateSettings({ animateFlow: !state.settings.animateFlow }, { quiet: true }) },
    ];
  }
  const layer = target.closest('[data-palette-layer]');
  if (layer) return [{ label: t('menu.addLayer') + ': ' + t('layer.' + layer.dataset.paletteLayer), icon: LAYERS[layer.dataset.paletteLayer].icon, action: () => { switchTab('model'); addLayer(layer.dataset.paletteLayer, {}); } }];
  const block = target.closest('[data-palette-block]');
  if (block) return [{ label: t('block.' + block.dataset.paletteBlock), icon: BLOCKS[block.dataset.paletteBlock].icon, action: () => { switchTab('model'); dropItem({ kind: 'block', id: block.dataset.paletteBlock }, { node: selectedNodes()[0] ?? null }); } }];
  if (text.length) return text;
  return [
    { label: t('menu.undo'), icon: 'undo', key: 'Ctrl+Z', disabled: !enabled('undo'), action: () => run('undo') },
    { label: t('menu.redo'), icon: 'redo', key: 'Ctrl+Y', disabled: !enabled('redo'), action: () => run('redo') },
    'sep',
    ...VIEW_TABS.map((tab) => ({ label: t('tab.' + tab), icon: commands['tab_' + tab].icon, checked: !state.showStart && state.view.tab === tab, action: () => switchTab(tab) })),
    'sep',
    { label: t('menu.home'), icon: 'home', action: () => run('home') },
    { label: t('menu.settings'), icon: 'gear', action: () => run('settings') },
  ];
}

let hoverOpened = false;
let menuLeaveTimer = null;

function bindShell() {
  // Menu bar: pointing at a menu opens it (a click right after keeps it open).
  root.addEventListener('pointerover', (event) => {
    const menu = event.target.closest?.('[data-menu]');
    if (menu && state.openMenu !== menu.dataset.menu) { hoverOpened = true; openMenuBar(menu.dataset.menu); setTimeout(() => { hoverOpened = false; }, 400); }
    if (event.target.closest?.('#menubar [data-menu], .dropdown')) clearTimeout(menuLeaveTimer);
  });
  root.addEventListener('pointerout', (event) => {
    if (!state.openMenu) return;
    const from = event.target.closest?.('#menubar [data-menu], .dropdown');
    const to = event.relatedTarget?.closest?.('#menubar [data-menu], .dropdown');
    if (from && !to) { clearTimeout(menuLeaveTimer); menuLeaveTimer = setTimeout(() => { if (state.openMenu) closeMenu(); }, 650); }
  });
  root.addEventListener('click', (event) => {
    const target = event.target;
    const command = target.closest('[data-command]');
    if (command && !command.disabled) { run(command.dataset.command); return; }
    const menu = target.closest('[data-menu]');
    if (menu) { if (state.openMenu === menu.dataset.menu && !hoverOpened) closeMenu(); else openMenuBar(menu.dataset.menu); hoverOpened = false; return; }
    const win = target.closest('[data-window]');
    if (win) { windowButton(win.dataset.window); return; }
    const tab = target.closest('[data-tab]');
    if (tab) { switchTab(tab.dataset.tab); return; }
    const bottom = target.closest('[data-bottom-tab]');
    if (bottom) { state.view.bottomTab = bottom.dataset.bottomTab; if (!state.settings.showBottomPanel) updateSettings({ showBottomPanel: true }); else renderBottom(); return; }
    if (target.closest('[data-console-clear]')) { state.console = []; renderConsole(); return; }
    const reveal = target.closest('[data-reveal]');
    if (reveal) { switchTab('model'); requestAnimationFrame(() => graphView.reveal(reveal.dataset.reveal)); return; }
    const mode = target.closest('[data-model-mode]');
    if (mode) { switchTab(mode.dataset.modelMode === 'neurons' ? 'neurons' : 'model'); return; }
    const probeCmd = target.closest('[data-probe]');
    if (probeCmd) { moveProbe(probeCmd.dataset.probe); return; }
    if (target.closest('[data-probe-run]')) { probe(null, 'probe').catch((error) => reportError(error, 'probe')); return; }
    const palette = target.closest('[data-palette-layer]');
    if (palette) { switchTab('model'); addLayer(palette.dataset.paletteLayer, {}); return; }
    const block = target.closest('[data-palette-block]');
    if (block) { switchTab('model'); dropItem({ kind: 'block', id: block.dataset.paletteBlock }, { node: selectedNodes()[0] ?? null }); return; }
    const insp = target.closest('[data-insp]');
    if (insp) {
      if (insp.dataset.insp === 'clearUnit') { state.selectedUnit = null; for (const view of [neuronModel, neuronTrain, neuronTest]) view?.render(); renderRight(); }
      if (insp.dataset.insp === 'delete') deleteSelection();
      if (insp.dataset.insp === 'duplicate') duplicateSelection();
      return;
    }
    const start = target.closest('[data-start]');
    if (start) { startAction(start.dataset.start, start.dataset.value); return; }
    const trainBtn = target.closest('[data-train-action]');
    if (trainBtn && !trainBtn.disabled) { trainAction(trainBtn.dataset.trainAction); return; }
    if (target.closest('[data-train-advanced]')) { state.view.trainAdvanced = !target.closest('details').open; return; }
    const variantBtn = target.closest('[data-variant]');
    if (variantBtn && !variantBtn.disabled) { switchVariant(variantBtn.dataset.variant); return; }
    const engineBtn = target.closest('[data-engine]');
    if (engineBtn && !engineBtn.disabled) { setEngine(engineBtn.dataset.engine); return; }
    const data = target.closest('[data-data]');
    if (data && target.tagName === 'BUTTON') { dataAction(data.dataset.data); return; }
    const stepMove = target.closest('[data-step-move]');
    if (stepMove) { const [i, d] = stepMove.dataset.stepMove.split(':').map(Number); const steps = state.project.dataset.steps; [steps[i], steps[i + d]] = [steps[i + d], steps[i]]; commit('data', { data: true }); return; }
    const stepRemove = target.closest('[data-step-remove]');
    if (stepRemove) { state.project.dataset.steps.splice(Number(stepRemove.dataset.stepRemove), 1); commit('data', { data: true }); return; }
    const stage = target.closest('[data-stage]');
    if (stage) { state.view.dataStage = stage.dataset.stage; renderCenter(); return; }
    const preview = target.closest('canvas[data-preview="main"], canvas[data-test-canvas="mistakes"]');
    if (preview?.hits) { previewClick(preview, event); return; }
    const liveCmd = target.closest('[data-live]');
    if (liveCmd && !liveCmd.disabled) { liveAction(liveCmd.dataset.live); return; }
    const exampleCmd = target.closest('[data-example]');
    if (exampleCmd && !exampleCmd.disabled) { runOnExamples(exampleCmd.dataset.example === '*' ? null : [exampleCmd.dataset.example]); return; }
    const batchCmd = target.closest('[data-batch]');
    if (batchCmd && !batchCmd.disabled) {
      const what = batchCmd.dataset.batch;
      if (what === 'files' || what === 'folder') runOnPickedData(what === 'folder');
      if (what === 'save') saveBatchResults().catch((error) => reportError(error, 'save'));
      if (what === 'clear') { state.batch = { items: [], running: false, selected: null, message: null }; renderCenter(); }
      return;
    }
    const batchRow = target.closest('[data-batch-row]');
    if (batchRow) {
      const item = state.batch.items[Number(batchRow.dataset.batchRow)];
      if (item?.x) {
        state.batch.selected = Number(batchRow.dataset.batchRow);
        if (item.wave && state.data?.media?.type === 'audio') playWave(item.wave, state.data.media.rate);
        probe(item.x, 'probe', null).catch(() => {});
        for (const row of root.querySelectorAll('[data-batch-row]')) row.classList.toggle('selected', row === batchRow);
      }
      return;
    }
    const testCmd = target.closest('[data-test]');
    if (testCmd && target.closest('button') && testCmd.dataset.test === 'generate') { if (!state.test.generation?.running) generateText(); return; }
    if (testCmd && target.tagName === 'BUTTON') { testAction(testCmd.dataset.test); return; }
    const testMode = target.closest('[data-test-mode]');
    if (testMode) { state.test.mode = testMode.dataset.testMode; renderCenter(); runTest(); return; }
    const word = target.closest('[data-word]');
    if (word) { state.test.sentence = `${state.test.sentence} ${word.dataset.word}`.trim(); renderCenter(); runTest(); return; }
    const plane = target.closest('canvas[data-test-canvas="plane"]');
    if (plane?.plotBox) { const { box, bounds } = plane.plotBox; const r = plane.getBoundingClientRect(); const x = bounds.minX + ((event.clientX - r.left - box.x) / box.w) * (bounds.maxX - bounds.minX); const y = bounds.minY + (1 - (event.clientY - r.top - box.y) / box.h) * (bounds.maxY - bounds.minY); state.test.point = [x, y]; runTest(); redrawCenter(); return; }
    const confusion = target.closest('canvas[data-test-canvas="confusion"]');
    if (confusion?.cellBox) { const { ox, oy, size, n } = confusion.cellBox; const r = confusion.getBoundingClientRect(); const c = Math.floor((event.clientX - r.left - ox) / size); const a = Math.floor((event.clientY - r.top - oy) / size); if (a >= 0 && c >= 0 && a < n && c < n) { state.test.cell = a === c ? null : [a, c]; redrawCenter(); } }
  });
  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target.matches('[data-param]')) {
      const id = selectedNodes()[0];
      if (id && setParam(model(), id, target.dataset.param, target.type === 'checkbox' ? target.checked : target.value)) commit('param');
    } else if (target.matches('[data-rename]')) {
      const node = nodeById(model(), target.dataset.rename);
      if (node) { node.name = cleanName(model(), target.value, node.id); commit('rename'); }
    } else if (target.matches('[data-retype]')) {
      replaceType(model(), target.dataset.retype, target.value); commit('replace');
    } else if (target.matches('[data-project-name]')) {
      state.project.name = target.value.trim() || t('project.untitled'); commit('name', { render: false }); renderMenubar(); if (!state.project.code.custom) codeView?.setText(state.project.code.text);
    } else if (target.matches('[data-project-desc]')) {
      state.project.description = target.value; commit('desc', { render: false });
    } else if (target.matches('[data-data="source"]')) {
      const value = target.value;
      if (value.startsWith('bank:')) {
        const bank = value.slice(5);
        state.project.dataset.source = { kind: 'sounds', bank, name: t(`bank.${bank}`), seconds: SOUND_BANKS[bank].seconds, copies: 4, noiseClass: true, layout: 'image', seed: 1 };
        state.project.dataset.steps = [];
        state.tableRows = null;
        rebuildData();
        adaptModelToData();
        commit('data', { data: false });
      } else if (value.startsWith('gen:')) {
        const id = value.slice(4);
        state.project.dataset.source = { kind: 'generator', id, params: generatorDefaults(id) };
        state.project.dataset.steps = [];
        state.tableRows = null;
        rebuildData();
        adaptModelToData();
        commit('data', { data: false });
      }
    } else if (target.matches('[data-data="addStep"]') && target.value) {
      state.project.dataset.steps.push(newStep(target.value)); commit('data', { data: true });
    } else if (target.matches('[data-data="noiseClass"]')) {
      state.project.dataset.source.noiseClass = target.checked; rebuildData(); adaptModelToData(); commit('data', { data: false });
    } else if (target.matches('[data-data="group"]')) {
      state.project.dataset.split = cleanSplit({ ...state.project.dataset.split, group: target.checked }); commit('data', { data: true });
    } else if (target.matches('[data-data="stratify"]')) {
      state.project.dataset.split = cleanSplit({ ...state.project.dataset.split, stratify: target.checked }); commit('data', { data: true });
    } else if (target.matches('[data-data="target"]') || target.matches('[data-data="task"]')) {
      state.project.dataset.source[target.dataset.data] = target.value;
      if (target.dataset.data === 'target') state.project.dataset.source.features = null;
      rebuildData(); adaptModelToData(); commit('data', { data: false });
    } else if (target.matches('[data-feature]')) {
      const columns = api.tableColumns() ?? [];
      const source = state.project.dataset.source;
      const all = columns.map((c) => c.name).filter((name) => name !== (source.target ?? columns.at(-1)?.name));
      const current = new Set(source.features ?? all);
      if (target.checked) current.add(target.dataset.feature); else current.delete(target.dataset.feature);
      source.features = all.filter((name) => current.has(name));
      commit('data', { data: true });
    } else if (target.matches('[data-step-toggle]')) {
      state.project.dataset.steps[Number(target.dataset.stepToggle)].enabled = target.checked; commit('data', { data: true });
    } else if (target.matches('[data-train]')) {
      const key = target.dataset.train;
      const value = target.type === 'checkbox' ? target.checked : ['learningRate', 'weightDecay', 'epsilon', 'minLearningRate', 'minDelta', 'labelSmoothing', 'mixup'].includes(key) ? Number(target.value) : target.value;
      state.project.train = cleanTrain({ ...state.project.train, [key]: value });
      commit('train', { render: false });
      // The advanced rows follow the optimizer, the schedule and early stopping; a clamped value is shown as kept.
      if (['earlyStop', 'optimizer', 'schedule', 'learningRate'].includes(key)) renderCenter();
    } else if (target.matches('[data-setting]')) {
      const key = target.dataset.setting;
      updateSettings({ [key]: target.type === 'checkbox' ? target.checked : key === 'maxNeurons' ? Number(target.value) : target.value }, { quiet: true });
      for (const view of [neuronModel, neuronTrain, neuronTest]) view?.render();
      graphView?.render();
    } else if (target.matches('[data-test="index"]')) {
      state.test.index = Math.max(0, Math.round(Number(target.value) || 0)); runTest(); renderCenter();
    } else if (target.matches('[data-test="errorsOnly"]')) {
      state.test.errorsOnly = target.checked; testAction('next');
    } else if (target.matches('[data-test="sentence"]')) {
      state.test.sentence = target.value; runTest();
    } else if (target.matches('[data-device]')) {
      setDevice(target.dataset.device, target.value).catch((error) => reportError(error, 'device'));
    } else if (target.matches('[data-probe-cycle]')) {
      state.project.train.probeCycle = target.checked;
      for (const box of root.querySelectorAll('[data-probe-cycle]')) box.checked = target.checked;
    } else if (target.matches('[data-test="benchRuns"]')) {
      state.test.benchRuns = Number(target.value);
    } else if (target.matches('[data-test="genLength"], [data-test="temperature"]')) {
      state.test.generation = { ...(state.test.generation ?? {}), [target.dataset.test === 'genLength' ? 'length' : 'temperature']: Number(target.value) };
    } else if (target.matches('[data-feature-value]')) {
      state.test.values[Number(target.dataset.featureValue)] = Number(target.value) || 0; runTest();
    } else if (target.matches('[data-test="brush"]')) {
      state.test.brush = Number(target.value);
    } else if (target.matches('[data-start-interval]')) {
      updateSettings({ animationInterval: Number(target.value) }, { quiet: true }); renderStart();
    } else if (target.matches('[data-start-random]')) {
      updateSettings({ animationRandom: target.checked }, { quiet: true });
    } else if (target.matches('[data-start-toggle]')) {
      updateSettings({ showStartPage: target.checked }, { quiet: true });
    }
  });
  root.addEventListener('input', (event) => {
    const target = event.target;
    if (target.matches('[data-palette-filter]')) {
      state.paletteFilter = target.value;
      const caret = target.selectionStart;
      renderLeft();
      const input = root.querySelector('[data-palette-filter]');
      input.focus(); input.setSelectionRange(caret, caret);
    } else if (target.matches('[data-start-speed]')) {
      updateSettings({ animationSpeed: Number(target.value) }, { quiet: true });
      target.nextElementSibling.textContent = `${target.value}%`;
    }
  });
  root.addEventListener('dragstart', (event) => {
    const layer = event.target.closest('[data-palette-layer]');
    const block = event.target.closest('[data-palette-block]');
    if (!layer && !block) return;
    event.dataTransfer.setData('application/x-mytrainer', JSON.stringify(layer ? { kind: 'layer', type: layer.dataset.paletteLayer } : { kind: 'block', id: block.dataset.paletteBlock }));
    event.dataTransfer.effectAllowed = 'copy';
    if (state.view.tab !== 'model' || state.showStart) switchTab('model');
  });
  let dragPress = null;
  root.addEventListener('input', (event) => {
    const slider = event.target.closest?.('[data-live-setting]');
    if (!slider) return;
    const key = slider.dataset.liveSetting;
    const value = Number(slider.value);
    updateSettings({ [key]: value }, { quiet: true, render: false });
    if (key === 'micGain') microphone.setGain(value);
    const out = slider.parentElement.querySelector('output');
    if (out) out.textContent = key === 'micGain' ? `×${value}` : value.toFixed(3);
    const mark = root.querySelector('.live-threshold');
    if (mark && key === 'micThreshold') mark.style.left = `${Math.min(100, Math.round(value * 6 * 100))}%`;
  });
  root.addEventListener('pointerdown', (event) => {
    const split = event.target.closest('[data-split]');
    if (split) { startSplit(event, split.dataset.split); return; }
    if (desktop && event.button === 0 && (event.target.closest('[data-window-drag]') || event.target.id === 'menubar') && !event.target.closest('button')) {
      // A double click maximizes / restores. Counted here: the native drag the first press starts
      // takes the mouse, so the browser never reports the second press as a double click.
      const last = dragPress;
      dragPress = { time: event.timeStamp, x: event.clientX, y: event.clientY };
      if (last && event.timeStamp - last.time < 450 && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 6) {
        dragPress = null;
        appWindow.toggleMaximize().catch(() => {});
      } else native.invoke('window_drag', {}).catch(() => {});
    }
    if (desktop && event.target.closest('[data-resize-grip]')) { event.preventDefault(); native.invoke('window_drag', { edge: 'SouthEast' }).catch(() => {}); }
  });
  root.addEventListener('contextmenu', (event) => {
    if (event.defaultPrevented) return; // the model editor shows its own menu
    event.preventDefault();
    const items = contextItems(event);
    if (items.length) showMenu(items, { x: event.clientX, y: event.clientY });
  });
  root.addEventListener('dblclick', (event) => {
    const canvas = event.target.closest('canvas[data-preview="main"]');
    if (canvas?.hits) { previewClick(canvas, event); switchTab('neurons'); }
  });
  root.addEventListener('wheel', (event) => {
    const canvas = event.target.closest('canvas[data-preview="main"]');
    if (!canvas) return;
    event.preventDefault();
    state.view.dataPage = Math.max(0, state.view.dataPage + (event.deltaY > 0 ? 1 : -1));
    drawDataView(api, root.querySelector('#center-body'));
  }, { passive: false });
}

function startSplit(event, side) {
  event.preventDefault();
  const start = { left: state.settings.leftWidth, right: state.settings.rightWidth, bottom: state.settings.bottomHeight };
  dragPointer(event, {
    move: (e, dx, dy) => {
      if (side === 'left') state.settings.leftWidth = Math.max(200, Math.min(460, start.left + dx));
      if (side === 'right') state.settings.rightWidth = Math.max(280, Math.min(560, start.right - dx));
      if (side === 'bottom') state.settings.bottomHeight = Math.max(90, Math.min(520, start.bottom - dy));
      root.style.setProperty('--left-width', `${state.settings.leftWidth}px`);
      root.style.setProperty('--right-width', `${state.settings.rightWidth}px`);
      root.style.setProperty('--bottom-height', `${state.settings.bottomHeight}px`);
    },
    end: () => { updateSettings({}, { quiet: true }); graphView?.render(); redrawCenter(); },
  });
}

function windowButton(id) {
  if (!desktop) return;
  if (id === 'minimize') appWindow.minimize().catch(() => {});
  else if (id === 'maximize') appWindow.toggleMaximize().catch(() => {});
  else if (id === 'close') requestExit();
}

function startAction(action, value) {
  switch (action) {
    case 'sample': openSample(value); break;
    case 'gallery': openGallery(); break;
    case 'new': newEmpty(); break;
    case 'open': openFile(); break;
    case 'continue': {
      const session = sessionData();
      if (session?.project) loadProject(parseProject(session.project), { path: session.path, clean: !session.dirty });
      break;
    }
    case 'recent': openRecent(value); break;
    case 'forget': state.recent = removeRecent(state.recent, value); storeRecent(storage, state.recent); renderStart(); break;
    case 'guide': openGuide(); break;
    case 'animation': updateSettings({ animation: value }, { quiet: true }); startBackground?.setKind(value); for (const chip of root.querySelectorAll('.anim-chip')) chip.classList.toggle('active', chip.dataset.value === value); break;
    case 'shuffle': { const next = startBackground?.shuffle(); if (next) { updateSettings({ animation: next }, { quiet: true }); for (const chip of root.querySelectorAll('.anim-chip')) chip.classList.toggle('active', chip.dataset.value === next); } break; }
    default: break;
  }
}

function dataAction(action) {
  if (action === 'csv') importCsv();
  if (action === 'images') importImages();
  if (action === 'sounds') importSounds();
}

/** A folder of recordings, one sub-folder per class (desktop), or picked files / a folder (web). */
async function importSounds() {
  const seconds = 1;
  const rate = 8000;
  try {
    let entries = [];
    let name = 'sounds';
    if (desktop) {
      const dir = await native.chooseFolder();
      if (!dir) return;
      name = baseName(dir);
      const list = await native.listImageFolder(dir, 3000, AUDIO_EXTENSIONS);
      if (!list.length) throw new Error(t('data.noSounds'));
      for (const [i, entry] of list.entries()) {
        entries.push({ label: entry.label, bytes: native.base64ToBytes(await native.readBase64File(entry.path, 'open')).buffer });
        if (i % 50 === 0) notify(t('data.readingSounds', { n: `${i}/${list.length}` }));
      }
    } else {
      const files = await native.pickWithInput('audio/*,.wav', { multiple: true, directory: true });
      const audio = files.filter((file) => new RegExp(`\\.(${AUDIO_EXTENSIONS.join('|')})$`, 'i').test(file.name));
      for (const file of audio) {
        const parts = (file.webkitRelativePath || file.name).split('/');
        if (parts.length >= 3) name = parts.at(-3);
        entries.push({ label: parts.length >= 3 ? parts.at(-2) : 'sounds', bytes: await file.arrayBuffer() });
      }
      if (!entries.length) throw new Error(t('data.noSounds'));
    }
    const classes = new Set(entries.map((entry) => entry.label));
    if (classes.size < 2) throw new Error(t('data.oneClass'));
    const items = [];
    for (const [i, entry] of entries.entries()) {
      try {
        const wave = loudestWindow(await decodeSound(entry.bytes, rate), rate, seconds);
        items.push({ label: entry.label, data: native.bytesToBase64(toMulaw(wave)) });
      } catch { /* not a sound the browser can decode: skipped */ }
      if (i % 50 === 0) notify(t('data.readingSounds', { n: `${i}/${entries.length}` }));
    }
    if (!items.length) throw new Error(t('data.noSounds'));
    state.project.dataset = { source: { kind: 'sounds', name, seconds, copies: 3, noiseClass: true, layout: 'image', seed: 1, items }, steps: [], split: cleanSplit(state.project.dataset.split) };
    rebuildData();
    adaptModelToData();
    commit('sounds');
    switchTab('data');
    notify(t('data.soundsLoaded', { n: items.length, classes: classes.size }), 'success');
  } catch (error) { reportError(error, 'sounds'); }
}

function previewClick(canvas, event) {
  const r = canvas.getBoundingClientRect();
  const x = event.clientX - r.left;
  const y = event.clientY - r.top;
  const hit = canvas.hits.find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
  if (!hit) return;
  if (hit.play && state.data?.media?.type === 'audio') playWave(state.data.media.waves[hit.index], state.data.media.rate);
  if (canvas.dataset.testCanvas === 'mistakes') {
    const part = state.prepared.test.n ? state.prepared.test : state.prepared.val;
    state.test.index = Math.min(hit.index, part.n - 1);
    state.test.mode = 'sample';
    renderCenter();
    runTest();
    return;
  }
  // A raw sample becomes the probe: find it in the training part (the part the probe index refers to).
  const train = state.prepared?.train;
  const at = train ? Array.from(train.index).indexOf(hit.index) : -1;
  if (at >= 0) {
    state.project.train.probeIndex = at;
    notify(t('data.probeSet', { index: hit.index }), 'success');
    probe(null, 'probe', state.data.task.kind === 'classification' ? state.data.y[hit.index] : sampleY(state.data, hit.index)?.[0] ?? null).catch(() => {});
  } else {
    // Not in the training part (validation / test): probe it directly.
    probe(state.prepared ? transformInput(state.prepared, sampleX(state.data, hit.index), state.data.inputShape) : null, 'probe', state.data.task.kind === 'classification' ? state.data.y[hit.index] : null).catch(() => {});
    notify(t('data.probeOutside', { index: hit.index }));
  }
  drawDataView(api, root.querySelector('#center-body'));
}

// ───────────────────────── test tab

function testAction(action) {
  const part = state.prepared?.test.n ? state.prepared.test : state.prepared?.val;
  if (!part?.n) return;
  const wrong = state.test.errorsOnly && state.report?.wrong?.length ? state.report.wrong : null;
  const move = (d) => {
    if (wrong) {
      const pos = wrong.indexOf(state.test.index);
      state.test.index = wrong[((pos < 0 ? 0 : pos + d) + wrong.length) % wrong.length];
    } else state.test.index = (state.test.index + d + part.n) % part.n;
  };
  switch (action) {
    case 'prev': move(-1); break;
    case 'next': move(1); break;
    case 'random': state.test.index = wrong ? wrong[Math.floor(Math.random() * wrong.length)] : Math.floor(Math.random() * part.n); break;
    case 'evaluate': evaluateNow(); return;
    case 'bench': benchmark().catch((error) => { state.test.bench = { running: false, error: native.errorText(error) }; renderCenter(); }); return;
    case 'play': if (state.data?.media?.type === 'audio') playWave(state.data.media.waves[part.index[Math.min(state.test.index, part.n - 1)]], state.data.media.rate); return;
    case 'clearPad': clearPad(); return;
    case 'loadSample': padFromSample(); return;
    default: return;
  }
  renderCenter();
  runTest();
}

/**
 * How fast the finished model answers: `runs` single inputs one after another (test samples, after a few
 * warm-up runs), each timed from asking the engine to having the answer (what an app using the model
 * waits), and one batch of up to 256 inputs (the throughput). Mean, standard deviation, min, median, p95, max.
 */
async function benchmark() {
  const prepared = state.prepared;
  const part = prepared?.test.n ? prepared.test : prepared?.val;
  if (!part?.n) return;
  const engine = currentEngine();
  if (engine.kind === 'torch' && !engine.canServe) { notify(t('test.torchNeedsRun'), 'error'); return; }
  const runs = state.test.benchRuns ?? 50;
  state.test.bench = { running: true, done: 0, runs };
  renderCenter();
  if (engine.kind === 'tfjs') await prepareTf();
  const size = prepared.inputShape.reduce((a, b) => a * b, 1);
  const sample = (k) => part.x.slice((k % part.n) * size, ((k % part.n) + 1) * size);
  for (let k = 0; k < 5; k++) await engine.predict(sample(k), 1);
  const times = [];
  for (let k = 0; k < runs; k++) {
    const x = sample(k);
    const started = performance.now();
    const answer = await engine.predict(x, 1);
    times.push(performance.now() - started);
    if (!answer) throw new Error(t('batch.noAnswer'));
    if (k % 10 === 9) { state.test.bench.done = k + 1; const bar = root.querySelector('[data-bench-progress]'); if (bar) bar.style.width = `${Math.round(((k + 1) / runs) * 100)}%`; }
  }
  const batch = Math.min(part.n, 256);
  const started = performance.now();
  await engine.predict(part.x.slice(0, batch * size), batch);
  const batchMs = performance.now() - started;
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const std = Math.sqrt(times.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, times.length - 1));
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.round(q * (sorted.length - 1)))];
  state.test.bench = {
    running: false, runs, mean, std, min: sorted[0], median: at(0.5), p95: at(0.95), max: sorted.at(-1),
    batch, batchMs, perSample: batchMs / batch, throughput: (batch / batchMs) * 1000,
    engine: engine.kind === 'torch' ? `PyTorch${state.python?.chosen?.cuda ? ' (CUDA)' : ''}` : `TensorFlow (${state.backend ?? engine.backend ?? ''})`,
  };
  log(t('bench.log', { runs, mean: mean.toFixed(2), std: std.toFixed(2), throughput: Math.round(state.test.bench.throughput) }), 'success');
  renderCenter();
}

/** Sends the Test tab's current input through the network. */
function runTest() {
  const prepared = state.prepared;
  if (!prepared) return;
  const part = prepared.test.n ? prepared.test : prepared.val;
  const s = prepared.inputShape.reduce((a, b) => a * b, 1);
  let x = null;
  let label = null;
  if (state.test.mode === 'file' || state.test.mode === 'example') {
    // A picked file or an example: the one chosen in the list goes through the network again.
    x = state.batch.items[state.batch.selected]?.x ?? null;
  } else if (state.test.mode === 'sample' && part.n) {
    const i = Math.min(state.test.index, part.n - 1);
    x = part.x.slice(i * s, (i + 1) * s);
    label = state.data.task.kind === 'classification' ? part.y[i] : state.data.task.kind === 'regression' ? part.y[i] : null;
  } else if (prepared.kind === 'image') {
    x = state.test.padValues ? transformInput(prepared, state.test.padValues, state.data.inputShape) : null;
  } else if (prepared.kind === 'points2d' && state.test.point) {
    x = transformInput(prepared, state.test.point, state.data.inputShape);
  } else if (prepared.kind === 'tokens') {
    if (state.data.media?.charLevel) x = encodePrompt(state.test.sentence, state.data);
    else {
      const vocab = state.data.vocab ?? [];
      const ids = state.test.sentence.toLowerCase().split(/\s+/).filter(Boolean).map((word) => { const id = vocab.indexOf(word); return id >= 0 ? id : 1; });
      x = Float32Array.from({ length: s }, (_, i) => ids[i] ?? 0);
    }
  } else if (state.test.values?.length) {
    x = transformInput(prepared, state.test.values, state.data.inputShape);
  }
  if (!x) return;
  probe(x, 'probe', label).catch((error) => reportError(error, 'probe'));
}

function bindDrawPad(pad) {
  pad.dataset.ready = '1';
  const ctx = pad.getContext('2d');
  const paint = () => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, pad.width, pad.height);
    if (state.test.padImage) ctx.putImageData(state.test.padImage, 0, 0);
  };
  paint();
  let drawing = false;
  let last = null;
  const pos = (event) => { const r = pad.getBoundingClientRect(); return [(event.clientX - r.left) * (pad.width / r.width), (event.clientY - r.top) * (pad.height / r.height)]; };
  pad.addEventListener('pointerdown', (event) => { drawing = true; last = pos(event); pad.setPointerCapture(event.pointerId); stroke(last, last); });
  pad.addEventListener('pointermove', (event) => { if (!drawing) return; const p = pos(event); stroke(last, p); last = p; });
  pad.addEventListener('pointerup', () => { drawing = false; padChanged(pad); });
  const stroke = (a, b) => {
    const [h] = state.prepared.inputShape;
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineWidth = (pad.width / h) * state.test.brush;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  };
}

function padChanged(pad) {
  const ctx = pad.getContext('2d');
  state.test.padImage = ctx.getImageData(0, 0, pad.width, pad.height);
  const [h, w, c] = state.data.inputShape;
  const small = new OffscreenCanvas(w, h);
  const sctx = small.getContext('2d');
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(pad, 0, 0, w, h);
  const rgba = sctx.getImageData(0, 0, w, h).data;
  const values = new Float32Array(h * w * c);
  for (let p = 0; p < h * w; p++) for (let k = 0; k < c; k++) values[p * c + k] = rgba[p * 4 + (c === 3 ? k : 0)] / 255;
  state.test.padValues = values;
  runTest();
}

function clearPad() {
  state.test.padImage = null;
  state.test.padValues = null;
  const pad = root.querySelector('[data-test-canvas="pad"]');
  if (pad) { const ctx = pad.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, pad.width, pad.height); }
}

function padFromSample() {
  const pad = root.querySelector('[data-test-canvas="pad"]');
  if (!pad || !state.data) return;
  const part = state.prepared.test.n ? state.prepared.test : state.prepared.val;
  const index = part.index[Math.min(state.test.index, part.n - 1)];
  const raw = sampleX(state.data, index);
  const [h, w, c] = state.data.inputShape;
  const image = new ImageData(w, h);
  for (let p = 0; p < h * w; p++) {
    for (let k = 0; k < 3; k++) image.data[p * 4 + k] = Math.round(Math.min(1, Math.max(0, raw[p * c + (c === 3 ? k : 0)])) * 255);
    image.data[p * 4 + 3] = 255;
  }
  const small = new OffscreenCanvas(w, h);
  small.getContext('2d').putImageData(image, 0, 0);
  const ctx = pad.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, pad.width, pad.height);
  padChanged(pad);
}

// ───────────────────────── running the model on picked data

/** Reads the files the user picks (desktop: dialog or folder; web: file input) as { name, bytes | text }. */
async function pickInputFiles(folder) {
  const spec = inputKindFor(state.data);
  if (!spec) { notify(t('batch.unsupported'), 'error'); return []; }
  const binary = spec.kind === 'image' || spec.kind === 'audio';
  if (desktop) {
    let paths;
    if (folder) {
      const dir = await native.chooseFolder();
      if (!dir) return [];
      paths = await native.listFolderFiles(dir, spec.extensions, 2000);
    } else paths = await native.chooseOpenPaths(spec.extensions, t(`batch.kind.${spec.kind}`));
    const files = [];
    for (const path of paths) {
      const name = baseName(path);
      files.push(binary ? { name, bytes: native.base64ToBytes(await native.readBase64File(path, 'open')).buffer } : { name, text: await native.readTextFile(path, 'open') });
    }
    return files;
  }
  const picked = await native.pickWithInput(spec.accept, { multiple: true, directory: folder });
  const files = [];
  for (const file of picked) {
    if (folder && !spec.extensions.includes(file.name.split('.').pop().toLowerCase())) continue;
    files.push(binary ? { name: file.name, bytes: await file.arrayBuffer() } : { name: file.name, text: await file.text() });
  }
  return files;
}

// ───────────────────────── live input (microphone / webcam)

const microphone = new LiveMicrophone();
microphone.onLevel = (level) => { state.live.level = level; const bar = root.querySelector('[data-live-level]'); if (bar) bar.style.width = `${Math.round(level * 100)}%`; };
const camera = new LiveCamera();
let liveTimer = null;
let liveLoop = 0; // "listen" runs as a loop of words; a new number ends the old loop

/** Live input commands from the Test tab. */
async function liveAction(what) {
  state.live.error = null;
  try {
    if (!state.prepared) throw new Error(state.dataError ?? t('data.none'));
    const engine = currentEngine();
    if (engine.kind === 'torch' && !engine.canServe) throw new Error(t('test.torchNeedsRun'));
    microphone.setGain(state.settings.micGain);
    if (what === 'say') {
      // Say one word: wait (up to 4 s) for it to begin, then for a moment of quiet after it — the whole word,
      // however late it starts, goes to the model.
      await microphone.start();
      stopLiveLoop();
      state.live.mode = 'say';
      renderCenter();
      const seconds = await microphone.utterance(state.settings.micThreshold, { cancelled: () => state.live.mode !== 'say' });
      if (state.live.mode !== 'say') return;
      state.live.mode = null;
      if (seconds == null) { state.live.result = { quiet: true }; updateLiveView(); } else await liveSpeech({ probeToo: true, seconds });
      if (!state.live.mode) microphone.stop();
    } else if (what === 'listen') {
      if (state.live.mode === 'listen') { stopLive(); return; }
      await microphone.start();
      state.live.mode = 'listen';
      state.live.recent = [];
      renderCenter();
      // Every word once it is over (judging half a word, as a sliding window does, mostly gives "unknown").
      const loop = ++liveLoop;
      while (state.live.mode === 'listen' && loop === liveLoop) {
        const seconds = await microphone.utterance(state.settings.micThreshold, { timeout: 0, cancelled: () => state.live.mode !== 'listen' || loop !== liveLoop });
        if (seconds == null) break;
        await liveSpeech({ probeToo: true, seconds }).catch(liveFailed);
      }
    } else if (what === 'camera') {
      if (camera.on) { stopLive(); return; }
      await camera.start();
      state.live.camera = true;
      renderCenter();
    } else if (what === 'snap') {
      await liveFrame({ probeToo: true });
    } else if (what === 'watch') {
      if (state.live.mode === 'watch') { stopLiveLoop(); state.live.mode = null; renderCenter(); return; }
      state.live.mode = 'watch';
      renderCenter();
      let n = 0;
      liveTimer = setInterval(() => { if (!state.live.busy) liveFrame({ probeToo: ++n % 4 === 0 }).catch(liveFailed); }, state.data.kind === 'video' ? 1500 : 350);
    }
  } catch (error) { liveFailed(error); }
}

function liveFailed(error) {
  stopLive();
  const text = native.errorText(error);
  state.live.error = /NotAllowed|Permission|denied/i.test(text) ? t('live.denied') : /NotFound|no.*device|live\.noDevices/i.test(text) ? t('live.noDevice') : t(text, null, text);
  renderCenter();
}

function stopLiveLoop() { clearInterval(liveTimer); liveTimer = null; liveLoop++; }

function stopLive() {
  stopLiveLoop();
  microphone.stop();
  camera.stop();
  Object.assign(state.live, { mode: null, camera: false, busy: false, level: 0 });
  if (state.view.tab === 'test') renderCenter();
}

/** The last recording → a prediction (smooth: averaged over the last three, like keyword spotters do). */
async function liveSpeech({ smooth = false, probeToo = false, seconds = null } = {}) {
  const media = state.data.media;
  // The word just said (how long it took, from microphone.utterance) with some quiet around it.
  const span = seconds != null ? Math.min(1.9, Math.max((media.seconds ?? 0.6) + 0.3, seconds + 0.2)) : smooth ? Math.max(1.2, (media.seconds ?? 0.6) + 0.3) : 1.5;
  const recorded = await microphone.last(span, media.rate);
  const input = speechInput(recorded, media, state.settings.micThreshold);
  state.live.preview = { kind: 'audio', raw: input.raw, wave: input.wave };
  if (!input.loud) {
    state.live.recent = [];
    state.live.result = { quiet: true };
    updateLiveView();
    return;
  }
  await livePredict(input.raw, { smooth, probeToo, label: t('live.micLabel') });
}

/** The webcam's frame (pictures) or a short recording of frames (motion clips) → a prediction. */
async function liveFrame({ probeToo = false } = {}) {
  const data = state.data;
  if (!camera.frame()) return;
  if (data.kind === 'video') {
    state.live.busy = true;
    const frames = [];
    for (let f = 0; f < data.media.frames; f++) {
      frames.push({ image: await createImageBitmap(camera.video), width: camera.video.videoWidth, height: camera.video.videoHeight });
      await new Promise((resolve) => setTimeout(resolve, 110));
    }
    state.live.busy = false;
    const { raw, inverted } = clipFrom(frames, data);
    state.live.preview = { kind: 'video', raw };
    await livePredict(raw, { probeToo, inverted, label: t('live.cameraLabel') });
  } else {
    const { raw, inverted } = pictureFrom(camera.video, camera.video.videoWidth, camera.video.videoHeight, data, { fit: 'cover' });
    state.live.preview = { kind: 'image', raw };
    await livePredict(raw, { probeToo, inverted, label: t('live.cameraLabel') });
  }
}

async function livePredict(raw, { smooth = false, probeToo = false, inverted = false, label = null } = {}) {
  const engine = currentEngine();
  state.live.busy = true;
  try {
    const x = transformInput(state.prepared, raw, state.data.inputShape);
    if (engine.kind === 'tfjs') await prepareTf();
    const answer = await engine.predict(x, 1);
    if (!answer) throw new Error(t('batch.noAnswer'));
    let output = Array.from(answer.values);
    if (smooth) {
      state.live.recent = [...state.live.recent.slice(-2), output];
      output = output.map((_, k) => state.live.recent.reduce((sum, o) => sum + o[k], 0) / state.live.recent.length);
    }
    state.live.result = { output, inverted, ...describeOutput(output, state.task, state.data.labels) };
    if (probeToo) probe(x, 'probe', label).catch(() => {});
  } finally {
    state.live.busy = false;
  }
  updateLiveView();
}

/** Redraws the live section only (the rest of the Test tab stays as it is). */
function updateLiveView() {
  if (state.view.tab !== 'test') return;
  const section = root.querySelector('.live-section');
  if (!section) return;
  const fresh = document.createElement('div');
  fresh.innerHTML = testViewHtml(api);
  const next = fresh.querySelector('.live-section');
  if (next) { section.replaceWith(next); drawLive(root.querySelector('.live-section')); }
}

/** The live section's canvases and the camera element. */
function drawLive(section) {
  if (!section) return;
  const host = section.querySelector('[data-live-video-host]');
  if (host && camera.on && camera.video.parentElement !== host) host.append(camera.video);
  const input = section.querySelector('[data-live-canvas="input"]');
  const preview = state.live.preview;
  if (input && preview) {
    // What the model gets, at the training data's own proportions.
    const data = state.data;
    const room = Math.max(80, input.parentElement.clientWidth || 200);
    if (preview.kind === 'video') {
      const frame = Math.max(18, Math.min(48, Math.floor((room - 2 * (data.media.frames - 1)) / data.media.frames)));
      const { ctx } = setupCanvas(input, data.media.frames * (frame + 2) - 2, frame);
      drawFrameStrip(ctx, preview.raw, data.media, 0, 0, frame, 2, isDark());
    } else {
      const shape = data.inputShape;
      const [rows, cols] = preview.kind === 'audio' && shape.length === 2 ? [shape[1], shape[0]] : [shape[0], shape[1]];
      const w = Math.min(preview.kind === 'audio' ? 220 : 160, room);
      const h = Math.round(w * (rows / cols));
      const { ctx } = setupCanvas(input, w, h);
      if (preview.kind === 'audio') drawSpectrogram(ctx, preview.raw, shape, 0, 0, w, h, isDark());
      else drawPicture(ctx, preview.raw, shape, 0, 0, w, h, { map: 'gray', autoscale: true });
    }
  }
  const bars = section.querySelector('[data-live-canvas="bars"]');
  const result = state.live.result;
  if (bars && result?.output && state.task?.kind === 'classification') {
    const out = result.output.length === 1 ? [1 - result.output[0], result.output[0]] : result.output;
    const top = out.map((value, c) => ({ c, value })).sort((p, q) => q.value - p.value).slice(0, 6);
    barChart(bars, top.map(({ c, value }) => ({ label: state.data.labels?.[c] ?? `C${c}`, value, color: CLASS_COLORS[c % CLASS_COLORS.length] })), { min: 0, max: 1, labelWidth: 70 });
  }
}

/** Lets a character language model continue the prompt one character at a time. */
async function generateText() {
  const data = state.data;
  if (!state.prepared || !data?.media?.charLevel) return;
  const engine = currentEngine();
  if (engine.kind === 'torch' && !engine.canServe) { notify(t('test.torchNeedsRun'), 'error'); return; }
  const gen = state.test.generation = { ...(state.test.generation ?? {}), prompt: state.test.sentence, text: '', running: true };
  const length = gen.length ?? 40;
  const temperature = gen.temperature ?? 0.6;
  renderCenter();
  try {
    if (engine.kind === 'tfjs') await prepareTf();
    for (let k = 0; k < length; k++) {
      const answer = await engine.predict(encodePrompt(gen.prompt + gen.text, data), 1);
      if (!answer) throw new Error(t('batch.noAnswer'));
      const id = sampleToken(answer.values, temperature);
      gen.text += data.vocab[id] ?? '';
      const box = root.querySelector('[data-gen-output]');
      if (box) box.innerHTML = `<span class="gen-prompt">${escapeHtml(gen.prompt)}</span><span class="gen-new">${escapeHtml(gen.text)}</span>`;
    }
    log(t('log.generated', { text: gen.prompt + gen.text }));
  } catch (error) { reportError(error, 'generate'); }
  gen.running = false;
  state.test.sentence = gen.prompt;
  renderCenter();
  // The neuron view and the output follow the text so far.
  probe(encodePrompt(gen.prompt + gen.text, data), 'probe', null).catch(() => {});
}

// ───────────────────────── model export (C / ONNX)

/** The trained weights in full, by node id with canonical names, from the current engine. */
async function trainedWeights() {
  if (state.project.engine === 'torch') {
    const engine = engines.torch;
    if (!engine?.canServe) throw new Error(t('export.needTorchRun'));
    const weights = await engine.exportWeights();
    if (!weights) throw new Error(t('batch.noAnswer'));
    return weights;
  }
  await prepareTf();
  const raw = await engines.tfjs.exportWeights();
  if (!raw) throw new Error(t('batch.noAnswer'));
  return Object.fromEntries(Object.entries(raw).map(([id, list]) => [id, canonicalWeights(nodeById(model(), id)?.type, list)]));
}

/** Writes the model with its trained weights as C source (model.h / model.c / example.c) or as ONNX. */
/** A chart drawn off screen (light colours, for paper) → a PNG data URL with its size. */
function chartImage(name, width, height, draw, caption) {
  const holder = document.createElement('div');
  holder.style.cssText = `position:fixed;left:-30000px;top:0;width:${width}px;height:${height}px`;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `width:${width}px;height:${height}px;display:block`;
  holder.appendChild(canvas);
  document.body.appendChild(holder);
  try { draw(canvas); return { kind: 'image', name, dataUrl: canvas.toDataURL('image/png'), width, height, caption }; } finally { holder.remove(); }
}

/** The results report (see report/report.js): overview, model, training settings and results, evaluation, inputs, speed. */
function buildReport() {
  const blocks = [];
  const section = (id, text) => blocks.push({ kind: 'heading', level: 1, text, section: id });
  const pct = (v) => (v == null ? '' : `${(v * 100).toFixed(1)}%`);
  const num = (v, d = 4) => (v == null || !Number.isFinite(Number(v)) ? '' : Number(v).toFixed(d));
  const data = state.data; const prepared = state.prepared; const train = state.project.train;
  const history = state.run.history ?? [];
  section('overview', t('report.overview'));
  blocks.push({ kind: 'kv', rows: [
    [t('report.project'), state.project.name],
    [t('report.task'), state.task ? `${t(`task.${state.task.kind}`, null, state.task.kind)}${state.task.classes ? ` · ${state.task.classes}` : ''}` : ''],
    [t('report.data'), data?.name ?? ''],
    [t('report.samples'), prepared ? `${t('report.trainPart')} ${prepared.train.n} · ${t('report.valPart')} ${prepared.val.n} · ${t('report.testPart')} ${prepared.test.n}${state.project.dataset.split?.group !== false && data?.groups ? ` · ${t('data.group')}` : ''}` : ''],
    [t('report.input'), prepared ? prepared.inputShape.join(' × ') : ''],
    ...(data?.labels ? [[t('report.classes'), data.labels.join(', ')]] : []),
    [t('inspector.params'), totalParams(state.shapes).total.toLocaleString()],
    [t('device.title'), api.engineLabel()],
    [t('report.app'), `MyTrainer ${VERSION}`],
  ] });
  section('model', t('report.model'));
  let order = [];
  try { order = topoOrder(model()); } catch { order = model().nodes.map((n) => n.id); }
  blocks.push({ kind: 'table', head: [t('report.layer'), t('report.type'), t('report.shape'), t('inspector.params')], rows: order.map((id) => { const node = nodeById(model(), id); const info = state.shapes.get(id); return [node.name, t(`layer.${node.type}`), info?.shape ? info.shape.join('×') : '', (info?.params?.total ?? 0).toLocaleString()]; }) });
  section('training', t('report.training'));
  blocks.push({ kind: 'kv', rows: [
    [t('train.optimizer'), train.optimizer], [t('train.learningRate'), String(train.learningRate)], [t('train.schedule'), t(`schedule.${train.schedule}`, null, train.schedule)],
    [t('train.epochs'), String(train.epochs)], [t('train.batchSize'), String(train.batchSize)], [t('train.loss'), train.loss ?? 'auto'],
    ...(train.labelSmoothing ? [[t('train.labelSmoothing'), String(train.labelSmoothing)]] : []), ...(train.mixup ? [[t('train.mixup'), String(train.mixup)]] : []),
    ...(train.earlyStop ? [[t('train.earlyStop'), `${train.monitor} · ${train.patience}`]] : []),
  ] });
  // The charts in light colours whatever the app's theme (paper is white).
  applyTheme(resolveTheme('light', false, null));
  try {
    if (history.length) {
      section('results', t('summary.title'));
      blocks.push({ kind: 'kv', rows: trainSummaryRows() });
      blocks.push(chartImage('loss.png', 760, 300, (c) => lineChart(c, [
        { name: t('train.trainLoss'), color: SERIES.train, values: history.map((e) => [e.epoch, e.loss]) },
        { name: t('train.valLoss'), color: SERIES.val, values: history.map((e) => [e.epoch, e.valLoss]) },
      ], { xLabel: t('train.epoch'), width: 760, height: 300 }), t('report.lossCaption')));
      if (state.task?.kind === 'classification') blocks.push(chartImage('accuracy.png', 760, 300, (c) => lineChart(c, [
        { name: t('train.trainAcc'), color: SERIES.train, values: history.map((e) => [e.epoch, e.acc == null ? null : e.acc * 100]) },
        { name: t('train.valAcc'), color: SERIES.val, values: history.map((e) => [e.epoch, e.valAcc == null ? null : e.valAcc * 100]) },
      ], { xLabel: t('train.epoch'), yMin: 0, yMax: 100, width: 760, height: 300 }), t('report.accCaption')));
      blocks.push({ kind: 'heading', level: 2, text: t('report.history') });
      blocks.push({ kind: 'table', head: [t('train.epoch'), t('test.loss'), t('test.accuracy'), t('log.valLoss'), t('log.valAcc'), t('train.lr'), t('report.time')], rows: history.map((h) => [h.epoch, num(h.loss), pct(h.acc), num(h.valLoss), pct(h.valAcc), num(h.lr, 5), num((h.time ?? 0) / 1000, 1)]) });
    }
    const report = state.report;
    if (report?.kind === 'classification') {
      section('evaluation', t('report.evaluation'));
      blocks.push({ kind: 'kv', rows: [[t('test.accuracy'), pct(report.accuracy)], [t('test.macroF1'), num(report.macroF1, 3)], [t('report.testCount'), String(report.predicted?.length ?? '')]] });
      const n = report.matrix.length;
      const size = Math.min(620, 90 + n * 46);
      blocks.push(chartImage('confusion.png', size, size, (c) => confusionChart(c, report.matrix, data?.labels ?? report.matrix.map((_, i) => `C${i}`)), t('report.confusionCaption')));
      blocks.push({ kind: 'table', head: [t('report.class'), t('test.precision', null, 'Precision'), t('test.recall', null, 'Recall'), 'F1', t('report.support')], rows: report.perClass.map((c, i) => [data?.labels?.[i] ?? `C${i}`, pct(c.precision), pct(c.recall), num(c.f1, 3), report.matrix[i].reduce((a, b) => a + b, 0)]) });
    } else if (report?.kind === 'regression') {
      section('evaluation', t('report.evaluation'));
      blocks.push({ kind: 'kv', rows: [['MAE', num(report.mae)], ['RMSE', num(report.rmse)], ['R²', num(report.r2, 3)]] });
    }
  } finally { applyLook(); }
  const items = state.batch.items.filter((item) => !item.error);
  if (items.length) {
    section('inputs', t('report.inputs'));
    blocks.push({ kind: 'table', head: [t('batch.input'), t('test.output'), '%'], rows: items.map((item) => [item.name, item.prediction ?? '', item.confidence != null ? `${(item.confidence * 100).toFixed(1)}%` : '']) });
  }
  const b = state.test.bench;
  if (b && !b.running && !b.error && b.mean != null) {
    section('performance', t('bench.title'));
    blocks.push({ kind: 'kv', rows: [[t('bench.mean'), `${b.mean.toFixed(2)} ms ± ${b.std.toFixed(2)} ms`], [t('bench.range'), `${b.min.toFixed(2)} … ${b.max.toFixed(2)} ms`], [t('bench.median'), `${b.median.toFixed(2)} ms · p95 ${b.p95.toFixed(2)} ms`], [t('bench.throughput'), `${Math.round(b.throughput)} ${t('bench.perSecond')}`], [t('bench.engine'), b.engine]] });
  }
  const sections = blocks.filter((x) => x.kind === 'heading' && x.section).map((x) => ({ id: x.section, name: x.text }));
  return { title: `${state.project.name} — ${t('report.title')}`, date: new Date().toLocaleString(), blocks, sections };
}

/** Print / save the results: the report popup (settings on the left, the pages on the right). */
async function openReport(mode = 'print') {
  try {
    const report = buildReport();
    state.reportDoc = report;
    await popups.open('report', { report, mode, settings: state.reportSettings ?? defaultReportSettings() });
  } catch (error) { reportError(error, 'report'); }
}

/** Saves the report as PDF, Word, Markdown or CSV (the last two: a folder with the pictures, ZIP on the web). */
async function saveReport(format, settings) {
  const report = state.reportDoc ?? buildReport();
  state.reportSettings = settings;
  const base = `${cName(state.project.name)}-report`;
  let single = null; let files = null;
  if (format === 'pdf') single = { name: `${base}.pdf`, bytes: toPdf(await renderPages(report, settings, 150), report.title), type: 'pdf' };
  else if (format === 'docx') single = { name: `${base}.docx`, bytes: new Uint8Array(await toDocx(report, settings).arrayBuffer()), type: 'docx' };
  else files = format === 'md' ? toMarkdown(report, settings) : toCsv(report, settings);
  if (desktop) {
    if (single) {
      const path = await native.chooseSavePath(single.name, [single.type]);
      if (!path) return;
      await native.writeBase64File(path, native.bytesToBase64(single.bytes), 'save');
      notify(t('file.saved', { name: baseName(path) }), 'success');
    } else {
      const dir = await native.chooseFolder();
      if (!dir) return;
      const sep = dir.includes('\\') ? '\\' : '/';
      const folder = `${dir}${sep}${base}-${format}`;
      for (const [name, content] of Object.entries(files)) {
        const path = `${folder}${sep}${name.replace(/\//g, sep)}`;
        if (typeof content === 'string') await native.writeTextFile(path, content, 'save');
        else await native.writeBase64File(path, native.bytesToBase64(content), 'save');
      }
      notify(t('export.done', { folder }), 'success');
    }
  } else if (single) {
    native.downloadBlob(new Blob([single.bytes], { type: single.type === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), single.name);
    notify(t('export.downloaded', { name: single.name }), 'success');
  } else {
    native.downloadBlob(zipBlob(files), `${base}-${format}.zip`);
    notify(t('export.downloaded', { name: `${base}-${format}.zip` }), 'success');
  }
  log(t('report.saved', { format: format.toUpperCase() }), 'success');
}

/** "Export…": the formats to choose from (a popup), then that export. */
async function openExport() {
  const answer = await popups.open('export', { engine: state.project.engine, trained: Boolean(state.run.history.length || state.project.weights) });
  if (answer?.format === 'py') codeAction('save');
  else if (answer?.format) exportModel(answer.format);
}

async function exportModel(format) {
  try {
    if (format === 'tfjs') { await exportTfjs(); return; }
    if (!state.prepared) throw new Error(state.dataError ?? t('data.none'));
    if (state.problems.some((p) => p.level === 'error')) throw new Error(t('export.modelErrors'));
    if (!state.run.history.length && !state.project.weights) notify(t('export.untrained'), 'warning');
    const weights = await trainedWeights();
    const data = state.data;
    const base = cName(state.project.name);
    // A test sample and the engine's answer: example.c checks itself against it.
    const part = state.prepared.test.n ? state.prepared.test : state.prepared.val.n ? state.prepared.val : state.prepared.train;
    const rawX = Array.from(sampleX(data, part.index?.[0] ?? 0));
    const answer = await currentEngine().predict(transformInput(state.prepared, rawX, data.inputShape), 1);
    const expected = answer ? Array.from(answer.values) : null;
    let files;
    let errors;
    if (format === 'c') {
      ({ files, errors } = generateC({ project: state.project, prepared: state.prepared, weights, rawShape: data.inputShape, labels: data.labels, task: state.task, name: 'model', example: expected ? { raw: rawX, expected } : null }));
    } else {
      const result = generateOnnx({ project: state.project, prepared: state.prepared, weights, rawShape: data.inputShape });
      errors = result.errors;
      files = { 'model.onnx': result.bytes, 'model.json': JSON.stringify({ name: state.project.name, input: { name: 'input', shape: ['N', ...data.inputShape], note: 'raw values; the training preprocessing is part of the graph' }, output: { name: 'output', shape: ['N', ...result.outputShape] }, task: state.task?.kind, labels: data.labels ?? null, sample: expected ? { input: rawX, output: expected } : null }, null, 2), 'README.md': onnxReadme(result, data) };
    }
    if (errors.length) throw new Error(t('export.unsupported', { list: errors.join(', ') }));
    if (desktop) {
      const dir = await native.chooseFolder();
      if (!dir) return;
      const folder = `${dir}${dir.includes('\\') ? '\\' : '/'}${base}-${format}`;
      for (const [name, content] of Object.entries(files)) {
        const path = `${folder}${folder.includes('\\') ? '\\' : '/'}${name}`;
        if (typeof content === 'string') await native.writeTextFile(path, content, 'save');
        else await native.writeBase64File(path, native.bytesToBase64(content), 'save');
      }
      notify(t('export.done', { folder }), 'success');
      log(t('export.done', { folder }), 'success');
    } else {
      native.downloadBlob(zipBlob(files), `${base}-${format}.zip`);
      notify(t('export.downloaded', { name: `${base}-${format}.zip` }), 'success');
    }
  } catch (error) { reportError(error, 'export'); }
}

/** The TensorFlow.js layers model (tf.loadLayersModel; tensorflowjs_converter turns it into Keras / SavedModel). */
async function exportTfjs() {
  if (!state.prepared) throw new Error(state.dataError ?? t('data.none'));
  if (state.problems.some((p) => p.level === 'error')) throw new Error(t('export.modelErrors'));
  if (state.project.engine === 'torch') throw new Error(t('export.tfjsNeedsTf'));
  if (!state.run.history.length && !state.project.weights) notify(t('export.untrained'), 'warning');
  await prepareTf();
  const saved = await engines.tfjs.exportTfjs();
  if (!saved || saved.error) throw new Error(saved?.error ?? t('batch.noAnswer'));
  const data = state.data;
  const modelJson = {
    format: 'layers-model', generatedBy: `MyTrainer ${VERSION}`, convertedBy: null,
    modelTopology: saved.topology,
    weightsManifest: [{ paths: ['weights.bin'], weights: saved.weightSpecs }],
  };
  const info = {
    name: state.project.name, task: state.task?.kind, labels: data.labels ?? null,
    input: { shape: ['N', ...state.prepared.inputShape], note: 'the values after MyTrainer\'s preprocessing steps (see steps); speech: the log-mel spectrogram' },
    steps: state.project.dataset.steps ?? [], media: data.media ? { type: data.media.type, rate: data.media.rate, bands: data.media.bands, frames: data.media.frames, seconds: data.media.seconds } : null,
  };
  const readme = `# ${state.project.name} — TensorFlow.js export

Made by MyTrainer ${VERSION}. A Keras-style layers model: \`model.json\` (layers and weight list) and \`weights.bin\`.

## JavaScript (browser or Node)

\`\`\`js
const model = await tf.loadLayersModel('model.json');   // or 'file://…/model.json' in Node
const y = model.predict(tf.tensor(input, [1, ${state.prepared.inputShape.join(', ')}]));
\`\`\`

## Python (Keras / TensorFlow SavedModel)

\`\`\`bash
pip install tensorflowjs
tensorflowjs_converter --input_format=tfjs_layers_model --output_format=keras model.json model.h5
\`\`\`

- Input: float32 (N, ${state.prepared.inputShape.join(', ')}) — the values after MyTrainer's preprocessing (\`mytrainer.json\` lists the steps)${data.media?.type === 'audio' ? '; speech: the log-mel spectrogram MyTrainer computes (8 kHz, 32 bands × 32 frames)' : ''}.
- Output: ${data.labels ? `class probabilities — ${data.labels.join(', ')}` : 'the model output'}.
- Layers of MyTrainer's own (token + position embedding, self-attention, last step, frequency average) must be registered before loading.
`;
  const files = { 'model.json': JSON.stringify(modelJson), 'weights.bin': new Uint8Array(saved.weightData), 'mytrainer.json': JSON.stringify(info, null, 2), 'README.md': readme };
  const base = cName(state.project.name);
  if (desktop) {
    const dir = await native.chooseFolder();
    if (!dir) return;
    const sep = dir.includes('\\') ? '\\' : '/';
    const folder = `${dir}${sep}${base}-tfjs`;
    for (const [name, content] of Object.entries(files)) {
      const path = `${folder}${sep}${name}`;
      if (typeof content === 'string') await native.writeTextFile(path, content, 'save');
      else await native.writeBase64File(path, native.bytesToBase64(content), 'save');
    }
    notify(t('export.done', { folder }), 'success');
    log(t('export.done', { folder }), 'success');
  } else {
    native.downloadBlob(zipBlob(files), `${base}-tfjs.zip`);
    notify(t('export.downloaded', { name: `${base}-tfjs.zip` }), 'success');
  }
}

const cName = (text) => String(text || 'model').normalize('NFKD').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'model';

function onnxReadme(result, data) {
  const shape = (list) => list.join(', ');
  return `# ${state.project.name} — ONNX export

Made by MyTrainer (opset 13). Load it with ONNX Runtime from C, C++, C#, Java, Python, JavaScript or mobile.

- Input \`input\`: float32 (N, ${shape(data.inputShape)}) — the raw values; the training preprocessing is inside the model.
- Output \`output\`: float32 (N, ${shape(result.outputShape)})${data.labels ? ` — classes: ${data.labels.slice(0, 30).join(', ')}` : ''}.
- Layout: channels-last (height, width, channels / time, features), like MyTrainer's data.
- \`model.json\` has the shapes, the class names and a test sample with the expected output.

## C++ (ONNX Runtime)

\`\`\`cpp
#include <onnxruntime_cxx_api.h>
Ort::Env env;
Ort::Session session(env, ORT_TSTR("model.onnx"), Ort::SessionOptions{});
std::vector<int64_t> shape = {1, ${shape(data.inputShape)}};
std::vector<float> input(${data.inputShape.reduce((a, b) => a * b, 1)});   // fill with your raw values
auto memory = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
auto tensor = Ort::Value::CreateTensor<float>(memory, input.data(), input.size(), shape.data(), shape.size());
const char *in[] = {"input"}, *out[] = {"output"};
auto result = session.Run(Ort::RunOptions{nullptr}, in, &tensor, 1, out, 1);
const float *y = result[0].GetTensorData<float>();
\`\`\`

## Python

\`\`\`python
import numpy as np, onnxruntime as ort
session = ort.InferenceSession("model.onnx")
y = session.run(None, {"input": np.zeros((1, ${shape(data.inputShape)}), np.float32)})[0]
\`\`\`
${data.kind === 'audio' ? '\nSpeech: the input is the log-mel spectrogram MyTrainer computes (32 bands × 32 frames, 8 kHz), not the waveform.\n' : ''}`;
}

// The example inputs (data/predict, bundled as examples/…): the list is fetched once.
let exampleList = null;
function examplesForData() {
  if (!exampleList) {
    exampleList = [];
    fetch('examples/index.json').then((response) => (response.ok ? response.json() : [])).catch(() => []).then((list) => { exampleList = list; renderCenter(); });
    return null;
  }
  return examplesFor(state.project.dataset.source, exampleList);
}

/** Runs the model on some of the example inputs (all of them: null). */
async function runOnExamples(names) {
  try {
    const files = await Promise.all((names ?? examplesForData() ?? []).map((rel) => exampleFile(rel)));
    await runOnFiles(files);
  } catch (error) { reportError(error, 'batch'); }
}

async function runOnPickedData(folder = false) {
  try {
    if (!state.prepared) { notify(state.dataError ?? t('data.none'), 'error'); return; }
    const files = await pickInputFiles(folder);
    if (files.length) await runOnFiles(files);
  } catch (error) { reportError(error, 'batch'); }
}

/** The finished model on files the user chose ([{ name, bytes | text }]): the first one becomes the input shown. */
async function runOnFiles(files) {
  if (!state.prepared) { notify(state.dataError ?? t('data.none'), 'error'); return; }
  const engine = currentEngine();
  if (engine.kind === 'torch' && !engine.canServe) { notify(t('test.torchNeedsRun'), 'error'); return; }
  try {
    if (!files.length) return;
    state.batch = { items: [], running: true, selected: null, message: t('batch.reading', { n: files.length }) };
    renderCenter();
    const items = await inputsFromFiles(files, state.data);
    const usable = items.filter((item) => !item.error);
    const size = state.prepared.inputShape.reduce((x, y) => x * y, 1);
    const flat = new Float32Array(usable.length * size);
    usable.forEach((item, i) => { item.x = transformInput(state.prepared, item.raw, state.data.inputShape); flat.set(item.x, i * size); });
    if (usable.length) {
      if (engine.kind === 'tfjs') await prepareTf();
      const result = await engine.predict(flat, usable.length);
      if (!result) throw new Error(t('batch.noAnswer'));
      const outputs = result.values.length / usable.length;
      usable.forEach((item, i) => {
        item.output = result.values.slice(i * outputs, (i + 1) * outputs);
        Object.assign(item, describeOutput(item.output, state.task, state.data.labels));
      });
    }
    state.batch = { items, running: false, selected: usable.length ? items.indexOf(usable[0]) : null, message: t('batch.done', { n: usable.length, errors: items.length - usable.length }) };
    log(t('batch.done', { n: usable.length, errors: items.length - usable.length }), 'success');
    if (usable.length) probe(usable[0].x, 'probe', null).catch(() => {});
    renderCenter();
  } catch (error) {
    state.batch = { ...state.batch, running: false, message: native.errorText(error) };
    reportError(error, 'batch');
    renderCenter();
  }
}

async function saveBatchResults() {
  const text = resultsCsv(state.batch.items, state.data?.labels, state.task);
  if (desktop) {
    const path = await native.chooseSavePath('predictions.csv', ['csv']);
    if (path) { await native.writeTextFile(path, text, 'save'); notify(t('file.saved', { name: baseName(path) }), 'success'); }
  } else await native.saveFileWeb(text, { name: 'predictions.csv', mime: 'text/csv', saveAs: true });
}

// ───────────────────────── keyboard

window.addEventListener('keydown', (event) => {
  const typing = event.target.closest?.('input, textarea, select, .cm-editor');
  const ctrl = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (event.key === 'Escape') { if (root.querySelector('.dropdown')) { closeMenu(); return; } if (!typing) { graphView?.select([]); state.selectedUnit = null; renderRight(); } return; }
  if (event.key === 'F5') { event.preventDefault(); run(event.shiftKey ? 'stop' : 'train'); return; }
  if (event.key === 'F6') { event.preventDefault(); run('pause'); return; }
  if (event.key === 'F10') { event.preventDefault(); run('step'); return; }
  if (event.key === 'F1') { event.preventDefault(); run('guide'); return; }
  if (ctrl && key === 's') { event.preventDefault(); run(event.shiftKey ? 'saveAs' : 'save'); return; }
  if (ctrl && key === 'o') { event.preventDefault(); run('open'); return; }
  if (ctrl && key === 'p') { event.preventDefault(); run('print'); return; }
  if (ctrl && key === 'n') { event.preventDefault(); run('new'); return; }
  if (ctrl && /^[1-6]$/.test(event.key)) { event.preventDefault(); switchTab(VIEW_TABS[Number(event.key) - 1]); return; }
  if (typing) return;
  if (ctrl && key === 'z') { event.preventDefault(); run(event.shiftKey ? 'redo' : 'undo'); return; }
  if (ctrl && key === 'y') { event.preventDefault(); run('redo'); return; }
  if (!state.showStart && ['neurons', 'train', 'test'].includes(state.view.tab) && ctrl && ['=', '+', '-', '0'].includes(key)) { event.preventDefault(); run(key === '-' ? 'zoomOut' : key === '0' ? 'fit' : 'zoomIn'); return; }
  if (state.showStart || state.view.tab !== 'model') return;
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); run('delete'); return; }
  if (ctrl && key === 'd') { event.preventDefault(); run('duplicate'); return; }
  if (ctrl && key === 'a') { event.preventDefault(); run('selectAll'); return; }
  if (ctrl && key === 'l') { event.preventDefault(); run('autoLayout'); return; }
  if (ctrl && key === 'e') { event.preventDefault(); run('neurons'); return; }
  if (ctrl && (key === '=' || key === '+')) { event.preventDefault(); run('zoomIn'); return; }
  if (ctrl && key === '-') { event.preventDefault(); run('zoomOut'); return; }
  if (ctrl && key === 'g' && !event.shiftKey) { event.preventDefault(); run('toggleGrid'); return; }
  if (ctrl && key === '0') { event.preventDefault(); run('fit'); return; }
  if (event.key.startsWith('Arrow') && selectedNodes().length) {
    event.preventDefault();
    const d = event.shiftKey ? 50 : 10;
    for (const id of selectedNodes()) {
      const node = nodeById(model(), id);
      if (event.key === 'ArrowLeft') node.x -= d;
      if (event.key === 'ArrowRight') node.x += d;
      if (event.key === 'ArrowUp') node.y -= d;
      if (event.key === 'ArrowDown') node.y += d;
    }
    graphView.render();
    clearTimeout(window.arrowCommit);
    window.arrowCommit = setTimeout(() => commit('move', { render: false }), 400);
  }
});

window.addEventListener('resize', () => { closeMenu(); graphView?.render(); redrawCenter(); });
window.addEventListener('beforeunload', (event) => { saveSession(); if (!desktop && state.dirty) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('error', (event) => {
  log(`${event.message} (${event.filename}:${event.lineno})`, 'error');
  showError(String(event.message), `${event.filename}:${event.lineno}:${event.colno}`, event.error?.stack ?? null);
});
window.addEventListener('unhandledrejection', (event) => {
  log(`${native.errorText(event.reason)}`, 'error');
  showError(native.errorText(event.reason), 'promise', event.reason?.stack ?? null);
});

// ───────────────────────── start

async function startApp() {
  applyLook();
  globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (state.settings.theme === 'system') applyLook(); });
  await popups.init();
  shell();
  // Panels opening, closing or being dragged resize the center without a window resize.
  new ResizeObserver(() => { clearTimeout(redrawCenter.resizeTimer); redrawCenter.resizeTimer = setTimeout(() => { stretchRounds = 0; fitTabs(); if (!state.showStart) redrawCenter(); }, 60); }).observe(root.querySelector('#center-body'));
  native.setBackendLanguage(state.settings.language);
  const files = await native.startupFiles().catch(() => []);
  const session = sessionData();
  if (files.length) {
    try { await openPath(files[0]); } catch (error) { reportError(error, 'open'); loadProject(sampleProject('spiral', lang())); }
  } else if (session?.project && !state.settings.showStartPage) {
    try { loadProject(parseProject(session.project), { path: session.path, clean: !session.dirty }); } catch { loadProject(sampleProject('spiral', lang())); }
  } else {
    loadProject(sampleProject('spiral', lang()));
    state.showStart = state.settings.showStartPage;
    renderAll();
  }
  if (desktop) {
    const update = async () => {
      const maximized = await appWindow.isMaximized().catch(() => false);
      if (maximized !== state.maximized) { state.maximized = maximized; renderMenubar(); }
    };
    await update();
    appWindow.onResized(() => update()).catch(() => {});
    native.listen('fatal-error', (payload) => { log(`${payload.message}\n${payload.location}\n${payload.backtrace}`, 'error'); popups.open('error', { message: payload.message, detail: `${payload.location}\n\n${payload.backtrace}` }); });
    native.listen('py-install', (line) => { popups.post('pyenv', { type: 'log', line }); });
    native.listen('popup-message', () => {});
    await native.invoke('popup_ready').catch(() => {});
    appWindow.show().catch(() => {});
    appWindow.setFocus().catch(() => {});
    // The PyTorch environment, quietly in the background (the Train tab shows what was found).
    setTimeout(() => { if (!state.python) native.pyDetect().then((detection) => { state.python = detection; renderStatus(); if (state.view.tab === 'train') renderCenter(); autoSetupPython(); }).catch(() => {}); }, 1500);
  }
  log(t('log.welcome', { version: VERSION }));
  // Test hook (E2E): the app's state and actions.
  globalThis.__mytrainer = { state, api, run, commands, switchTab, openSample, openSampleNow: (id) => loadProject(sampleProject(id, lang())), startTraining, probe, setEngine, loadProject, engines, graph: () => graphView, codeView: () => codeView };
}

startApp();
void NODE_H; void parseShape; void canConnect;
