// My3DMaker: the main window. A project holds the geometry, the engineering data and analysis
// systems; the Project tab shows them as a schematic, the Model tab sets one up in 3D (outline,
// details, picked faces) and shows its results, Engineering Data edits the materials, Design
// Exploration varies parameters. Solving runs the Rust solver (natively on the desktop, as
// WebAssembly in the browser).
import './styles-sim.css';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import APP_ICON from '../assets/icon-256.png';
import { BCS, SYSTEMS, SYSTEM_IDS, RESULTS, FOLLOW_UPS, GROUPS, BC_CATS, defaultBc } from './sim/catalog.js';
import { addBc, addBody, addSystem, buildJob, createProject, ensureMaterial, newId, outputsOf, packProject, pathGet, pathSet, unpackProject, OUTPUT_KINDS, UNIT } from './sim/project.js';
import { TEMPLATES, TEMPLATE_GROUPS, parseStl, writeStl } from './sim/shapes.js';
import { MATERIALS, materialName } from './sim/materials.js';
import { SAMPLES, SAMPLE_GROUPS, buildSample } from './sim/samples.js';
import { resultItems, chartsOf, displayOf } from './sim/results.js';
import { runJob, solverInfo } from './sim/engine.js';
import { reportHtml, reportSvg } from './sim/report.js';
import { fmt, toDisplay, toSI, unitLabel } from './sim/units.js';
import { createModel } from './app-model.js';
import { outlineHtml, detailsHtml, toolboxHtml, schematicHtml, dataTabHtml, studyTabHtml } from './ui/simpanels.js';
import { lineChart, heatMap } from './ui/charts.js';
import { startPageHtml } from './ui/startpage.js';
import { startBoard } from './ui/startboard.js';
import { AnimatedBackground } from './ui/background.js';
import { ANIMATIONS, loadSettings, RECENT_KEY, SESSION_KEY, storeSettings } from './domain/settings.js';
import { addRecent, loadRecent, loadRecentDirs, removeRecent, storeRecent, storeRecentDirs } from './domain/recent.js';
import { baseName, directoryOf, fileSafe, stripExtension, withExtension } from './domain/paths.js';
import { History } from './domain/history.js';
import { switchFlag, flagFor } from './flags.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { PopupHost } from './platform/popups.js';
import { createPrintHost } from './print/host.js';
import { applyFont, applyTheme, resolveTheme, themeName } from './themes.js';
import { escapeHtml, frameThrottle, isMac, keyLabel, pointerDrag } from './ui/dom.js';
import { bindSteppers } from './stepper.js';
import { DOC_KINDS, docLabel, docWindowTitle } from './domain/helpdocs.js';
import { PROGRESS_ICONS } from './ui/progressicons.js';

const root = document.querySelector('#app');
const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const popups = new PopupHost();
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const lang = () => (getLanguage() === 'en' ? 'en' : 'ko');

const state = {
  settings: loadSettings(globalThis.localStorage),
  project: null,
  path: null,
  handle: null,
  dirty: false,
  history: new History(150),
  tab: 'project',
  sel: { kind: 'project', id: null },
  setupMesh: null,
  solving: null,
  log: [],
  notice: null,
  bottomTab: 'messages',
  chartIndex: 0,
  showStart: true,
  recent: loadRecent(globalThis.localStorage),
  recentDirs: loadRecentDirs(globalThis.localStorage),
  maximized: false,
  cmTab: 'geometry',
  animate: false,
  probe: null,
  info: null,
  untitled: 0,
};

// ───────────────────────── context shared with the panels and the 3D view

const units = () => state.settings.unitSystem ?? 'mm';
const activeSystem = () => state.project?.systems.find((s) => s.id === state.project.active) ?? state.project?.systems[0] ?? null;
const systemById = (id) => state.project?.systems.find((s) => s.id === id) ?? null;
const selected = () => state.sel;

function resultTitle(sys, item) {
  if (item.mode) {
    if (item.quantity === 'bucklingMode') return t('res.bucklingModeN', { n: item.index + 1, f: item.mode.factor === null ? '—' : fmt(item.mode.factor, 4) });
    return t('res.modeN', { n: item.index + 1, f: fmt(item.mode.frequency, 4) });
  }
  return t(`res.${item.quantity}`);
}

const ctx = {
  state, t, lang, units, activeSystem, systemById, selected, resultTitle, commands: null, model: null,
  errorText: (e) => errorText(e),
  showError: (k, e) => showError(k, e),
  renderSome: (parts) => renderSome(parts),
  facePicked: (hit, ev) => facePicked(hit, ev),
  parameterCandidates: () => parameterCandidates(),
  studyChart: () => studyChart(),
};
const model = createModel(ctx);
ctx.model = model;

// ───────────────────────── notices, errors

let noticeTimer = 0;
function notify(kind, text, detail = '') {
  state.notice = { kind, text };
  state.log.unshift({ kind, text, detail, at: new Date() });
  state.log.length = Math.min(state.log.length, 300);
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { state.notice = null; renderStatus(); }, 6000);
  renderStatus();
  if (state.bottomTab === 'messages') renderBottom();
}

function errorText(error) {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const [key, ...rest] = raw.split(':');
  const text = t(`err.${key}`, { detail: rest.join(':') }, null);
  return text ?? raw;
}

function showError(titleKey, error, context = '') {
  const text = errorText(error);
  notify('error', `${t(titleKey)}: ${text}`, String(error?.stack ?? ''));
  if (String(error?.message ?? error) === 'cancelled') return;
  popups.open('error', { title: t(titleKey), message: text, detail: String(error?.stack ?? context ?? ''), context }).catch(() => {});
}

// ───────────────────────── project changes (undo / redo)

function snapshot() { return packProject(state.project); }

function change(labelKey, mutate, { geometry = false, keepResults = false } = {}) {
  if (!state.project) return;
  state.history.record(snapshot(), labelKey);
  mutate(state.project);
  state.dirty = true;
  if (!keepResults) for (const s of state.project.systems) if (s.status === 'solved') s.status = 'outdated';
  if (geometry) state.setupMesh = null;
  afterChange();
}

function afterChange() {
  renderAll();
  if (state.tab === 'model') model.refreshSetupMesh();
}

function restore(text) {
  const keep = new Map(state.project.systems.map((s) => [s.id, { result: s.result, status: s.status }]));
  state.project = unpackProject(text);
  for (const s of state.project.systems) { const k = keep.get(s.id); if (k?.result) { s.result = k.result; s.status = k.status === 'solved' ? 'outdated' : s.status; } }
  state.dirty = true;
  state.setupMesh = null;
  afterChange();
}

function undo() { const e = state.history.undo(snapshot()); if (e) { restore(e.snapshot); notify('info', t('notice.undo', { op: t(e.label) })); } }
function redo() { const e = state.history.redo(snapshot()); if (e) { restore(e.snapshot); notify('info', t('notice.redo', { op: t(e.label) })); } }

// ───────────────────────── documents

async function setProject(project, { path = null, handle = null, dirty = false } = {}) {
  model.stopAnimation();
  state.project = project;
  state.path = path;
  state.handle = handle;
  state.dirty = dirty;
  state.history.clear();
  state.setupMesh = null;
  model.resetSetup();
  state.sel = { kind: 'project', id: null };
  state.showStart = false;
  state.tab = project.systems.length ? 'project' : 'model';
  renderAll();
}

async function newProject() {
  if (!(await confirmReplace())) return;
  state.untitled += 1;
  const p = createProject(t('new.projectName', { n: state.untitled }));
  await setProject(p);
  notify('info', t('notice.newProject'));
}

async function confirmReplace() {
  if (!state.project || !state.dirty) return true;
  const choice = await ask({ title: t('confirm.unsavedTitle'), message: t('confirm.unsaved', { name: projectName() }), icon: 'warning', buttons: [{ id: 'save', label: t('action.save'), primary: true }, { id: 'discard', label: t('confirm.discard'), danger: true }, { id: 'cancel', label: t('confirm.cancel') }] });
  if (choice === 'save') return saveProject();
  return choice === 'discard';
}

async function ask(params) { const r = await popups.open('confirm', params); return r?.choice ?? 'cancel'; }

const projectName = () => (state.path ? baseName(state.path) : state.project?.name || t('tabs.untitled', { n: 1 }));
const safeName = () => fileSafe(state.path ? stripExtension(baseName(state.path)) : state.project?.name || 'project');

async function openSample(id) {
  if (!(await confirmReplace())) return;
  const p = buildSample(id, lang());
  if (!p) return;
  await setProject(p);
  state.tab = 'model';
  const s = activeSystem();
  state.sel = s ? { kind: 'system', id: s.id } : { kind: 'project' };
  renderAll();
  model.refreshSetupMesh();
  notify('info', t('notice.sampleOpened', { name: p.name }));
}

async function openWithDialog() {
  if (!(await confirmReplace())) return;
  try {
    if (desktop) {
      const [path] = await native.chooseDiagramsToOpen(state.settings.lastDirectory);
      if (path) await openPath(path);
    } else {
      const [file] = await native.pickDiagramFilesWeb();
      if (file) await openContent(file.name, file.content, file.handle);
    }
  } catch (error) { showError('error.open', error); }
}

async function openPath(path) {
  try {
    if (/\.stl$/i.test(path)) { const b64 = await native.readBase64File(path); const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); return importStlBytes(baseName(path), bytes); }
    const text = await native.readTextFile(path, 'open');
    await setProject(unpackProject(text), { path });
    rememberRecent({ path });
    notify('success', t('notice.opened', { name: baseName(path) }));
  } catch (error) { showError('error.open', error); }
}

async function openContent(name, content, handle = null) {
  if (/\.stl$/i.test(name)) return importStlBytes(name, content instanceof Uint8Array ? content : new TextEncoder().encode(content));
  const text = typeof content === 'string' ? content : new TextDecoder().decode(content);
  await setProject(unpackProject(text), { path: null, handle });
  state.project.name ||= stripExtension(name);
  rememberRecent({ path: name, web: true });
  notify('success', t('notice.opened', { name }));
  renderAll();
}

async function openRecent(path) {
  if (!(await confirmReplace())) return;
  if (!desktop) { notify('info', t('notice.recentWeb')); return openWithDialog(); }
  const [exists] = await native.pathsExist([path]);
  if (!exists) { state.recent = removeRecent(state.recent, path); storeRecent(globalThis.localStorage, state.recent); notify('warning', t('notice.missingFile', { name: baseName(path) })); return renderAll(); }
  return openPath(path);
}

function rememberRecent(entry) {
  state.recent = addRecent(loadRecent(globalThis.localStorage), entry);
  storeRecent(globalThis.localStorage, state.recent);
  if (!entry.web) {
    const dir = directoryOf(entry.path);
    if (dir) { state.recentDirs = addRecent(loadRecentDirs(globalThis.localStorage), { path: dir }); storeRecentDirs(globalThis.localStorage, state.recentDirs); updateSettings({ lastDirectory: dir }, { quiet: true }); }
  }
}

async function saveProject({ saveAs = false } = {}) {
  if (!state.project) return false;
  const text = packProject(state.project);
  try {
    if (desktop) {
      let path = saveAs ? null : state.path;
      if (!path) path = await native.chooseSavePath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${safeName()}.my3d`, ['my3d']);
      if (!path) return false;
      path = withExtension(path, 'my3d');
      await native.writeTextFile(path, text, 'save');
      state.path = path;
      rememberRecent({ path });
    } else {
      const r = await native.saveFileWeb(text, { name: `${safeName()}.my3d`, handle: state.handle, saveAs });
      if (!r) return false;
      state.handle = r.handle;
      rememberRecent({ path: r.name, web: true });
    }
    state.dirty = false;
    notify('success', t('notice.saved', { name: projectName() }));
    renderAll();
    return true;
  } catch (error) { showError('error.save', error); return false; }
}

async function closeProject() {
  if (!(await confirmReplace())) return;
  model.stopAnimation();
  state.project = null;
  state.path = null;
  state.dirty = false;
  state.showStart = true;
  renderAll();
}

async function saveExport(name, type, content, mime = 'application/octet-stream') {
  if (desktop) {
    const path = await native.chooseSavePath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${name}`, [type]);
    if (!path) return;
    if (typeof content === 'string') await native.writeTextFile(path, content, 'export');
    else {
      const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      await native.writeBase64File(path, btoa(bin), 'export');
    }
    notify('success', t('notice.exported', { name: baseName(path) }));
  } else {
    await native.saveFileWeb(typeof content === 'string' ? content : new Blob([content], { type: mime }), { name, saveAs: true, mime });
    notify('success', t('notice.exported', { name }));
  }
}

// ───────────────────────── geometry

function addTemplateBody(template) {
  if (!state.project) return;
  let id = null;
  change('op.addBody', (p) => {
    // A new body sits beside the others (along +X), unless it is the first.
    let x = 0;
    if (p.bodies.length) { const boxes = p.bodies.map((b) => ctxBox(b)); x = Math.max(...boxes.map((b) => b[1][0])) + 20; }
    const b = addBody(p, template, { name: `${t(`tpl.${template}`)} ${p.bodies.length + 1}`, material: template === 'coil' ? 'copper' : template === 'magnetDisc' ? 'magnetNdFeB' : template === 'duct' || template === 'bentChannel' ? 'water' : 'steel', position: [x, 0, 0] });
    if (p.bodies.length > 1) { const w = ctxBox(b); b.position[0] += x - w[0][0]; }
    id = b.id;
  }, { geometry: true });
  select({ kind: 'body', id });
  state.tab = 'model';
  renderAll();
}

function ctxBox(b) { return boxOf(b); }
import { boxOfBody as boxOf } from './sim/project.js';

async function importStl() {
  try {
    if (desktop) {
      const [path] = await native.chooseFiles(state.settings.lastDirectory, [{ name: 'STL (*.stl)', extensions: ['stl'] }], false);
      if (!path) return;
      const b64 = await native.readBase64File(path);
      await importStlBytes(baseName(path), Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    } else {
      const [file] = await native.pickWithInput('.stl');
      if (file) await importStlBytes(file.name, new Uint8Array(await file.arrayBuffer()));
    }
  } catch (error) { showError('error.import', error); }
}

async function importStlBytes(name, bytes) {
  const tris = parseStl(bytes);
  if (!state.project) await setProject(createProject(stripExtension(name)));
  let id = null;
  change('op.importStl', (p) => {
    // Centre the mesh on the origin (its own coordinates stay in the body's parameters).
    const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < tris.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], tris[i + k]); hi[k] = Math.max(hi[k], tris[i + k]); }
    const c = lo.map((v, k) => (v + hi[k]) / 2);
    const centred = tris.map((v, i) => Number((v - c[i % 3]).toFixed(5)));
    const b = addBody(p, 'stl', { name: stripExtension(name), stl: centred });
    id = b.id;
  }, { geometry: true });
  select({ kind: 'body', id });
  state.tab = 'model';
  renderAll();
  notify('success', t('notice.stlImported', { name, n: Math.round(tris.length / 9).toLocaleString() }));
}

// ───────────────────────── systems and conditions

function addSystemOf(type, from = null) {
  if (!state.project) return;
  let id = null;
  change('op.addSystem', (p) => { const s = addSystem(p, type, { from }); s.mesh.order = SYSTEMS[type].linearOnly ? 1 : Number(state.settings.defaultOrder) || 2; id = s.id; }, { keepResults: true });
  state.sel = { kind: 'system', id };
  renderAll();
  notify('info', t('notice.systemAdded', { name: t(`sys.${type}`) }));
}

function activate(sysId) {
  if (!state.project || state.project.active === sysId) return;
  state.project.active = sysId;
  model.stopAnimation();
  if (state.tab === 'model') model.showSetup();
  renderAll();
}

function addCondition(type) {
  const sys = activeSystem();
  if (!sys) return notify('warning', t('notice.noSystem'));
  let id = null;
  change('op.addBc', () => { const bc = addBc(sys, type, { name: '' }); id = bc.id; }, { keepResults: true });
  state.tab = 'model';
  select({ kind: 'bc', id });
  notify('info', t(BCS[type].target === 'none' ? 'notice.bcAddedNone' : BCS[type].target === 'bodies' ? 'notice.bcAddedBodies' : 'notice.bcAddedFaces', { name: t(`bc.${type}`) }));
}

function addContact() {
  const sys = activeSystem();
  const p = state.project;
  if (!sys || p.bodies.length < 2) return notify('warning', t('notice.contactNeedsTwo'));
  let id = null;
  change('op.addContact', () => { const c = { id: newId('k'), type: 'bonded', a: p.bodies[0].id, b: p.bodies[1].id, friction: 0.2, suppressed: false }; sys.contacts.push(c); id = c.id; });
  select({ kind: 'contact', id });
}

function autoContacts() {
  const sys = activeSystem();
  const info = state.setupMesh?.info;
  if (!sys || !info) return notify('warning', t('notice.meshFirst'));
  const pairs = new Set();
  for (const f of info.faces) if (f.other && f.other !== 'air' && f.body < f.other) pairs.add(`${f.body}|${f.other}`);
  let n = 0;
  change('op.addContact', () => {
    for (const key of pairs) {
      const [a, b] = key.split('|');
      if (sys.contacts.some((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a))) continue;
      sys.contacts.push({ id: newId('k'), type: 'bonded', a, b, friction: 0.2, suppressed: false });
      n++;
    }
  });
  notify(n ? 'success' : 'info', t('notice.autoContacts', { n }));
}

function facePicked(hit, event) {
  const sys = activeSystem();
  const sel = state.sel;
  if (sel.kind === 'bc' && sys) {
    const bc = sys.bcs.find((b) => b.id === sel.id);
    const def = BCS[bc?.type];
    if (!bc || !hit) return;
    if (def.target.includes('faces')) {
      change('op.pickFace', () => {
        const i = bc.faces.findIndex((f) => model.faceOf(f, state.setupMesh?.info) === hit.face);
        if (i >= 0) bc.faces.splice(i, 1);
        else { if (!(event?.ctrlKey || event?.shiftKey || event?.metaKey) && state.settings.pickReplace) bc.faces = []; bc.faces.push(hit.sig); }
      }, { keepResults: false });
      return;
    }
    if (def.target === 'bodies') {
      change('op.pickBody', () => { bc.bodies = bc.bodies.includes(hit.body) ? bc.bodies.filter((b) => b !== hit.body) : [...bc.bodies, hit.body]; });
      return;
    }
  }
  if (hit) select({ kind: 'body', id: hit.body });
}

function deleteSelection() {
  const sel = state.sel;
  const p = state.project;
  if (!p) return;
  const sys = activeSystem();
  switch (sel.kind) {
    case 'body': change('op.delete', () => { p.bodies = p.bodies.filter((b) => b.id !== sel.id); for (const s of p.systems) { for (const bc of s.bcs) { bc.faces = bc.faces.filter((f) => f.body !== sel.id); bc.bodies = bc.bodies.filter((b) => b !== sel.id); } s.contacts = s.contacts.filter((c) => c.a !== sel.id && c.b !== sel.id); } }, { geometry: true }); break;
    case 'bc': change('op.delete', () => { sys.bcs = sys.bcs.filter((b) => b.id !== sel.id); }); break;
    case 'contact': change('op.delete', () => { sys.contacts = sys.contacts.filter((c) => c.id !== sel.id); }); break;
    case 'system': change('op.delete', () => { p.systems = p.systems.filter((s) => s.id !== sel.id); p.links = p.links.filter((l) => l.from !== sel.id && l.to !== sel.id); p.active = p.systems[0]?.id ?? null; }); break;
    default: return;
  }
  state.sel = { kind: 'project', id: null };
  renderAll();
}

function duplicateBody() {
  const b = state.project?.bodies.find((x) => x.id === state.sel.id);
  if (!b) return;
  let id = null;
  change('op.duplicate', (p) => { const c = structuredClone(b); c.id = newId('b'); c.name = `${b.name} (2)`; const box = boxOf(b); c.position = [b.position[0] + (box[1][0] - box[0][0]) + 10, b.position[1], b.position[2]]; p.bodies.push(c); id = c.id; }, { geometry: true });
  select({ kind: 'body', id });
}

function select(sel) {
  state.sel = sel;
  state.probe = null;
  if (sel.kind === 'system' || sel.kind === 'settings' || sel.kind === 'mesh' || sel.kind === 'solution' || sel.kind === 'enclosure' || sel.kind === 'contacts') activate(sel.id);
  if (sel.kind === 'result') {
    const [sid, key] = sel.id.split(/:(.+)/);
    activate(sid);
    const sys = systemById(sid);
    const item = resultItems(sys, sys?.result).find((i) => i.key === key);
    if (item && state.tab === 'model') { model.ensureView(root.querySelector('#view-host')); model.showResult(sys, item); }
  } else if (model.shown?.kind === 'result' && state.tab === 'model') {
    model.stopAnimation();
    model.showSetup();
  }
  if (state.tab === 'model') model.paintSetup();
  renderSome(['outline', 'details', 'status', 'ribbon', 'bottom']);
}

// ───────────────────────── solving

async function solve(sys = activeSystem(), { quiet = false } = {}) {
  if (!sys) return notify('warning', t('notice.noSystem'));
  if (state.solving) return notify('warning', t('notice.busy'));
  const p = state.project;
  if (!p.bodies.some((b) => !b.suppressed)) return notify('warning', t('notice.noBodies'));
  const missing = sys.bcs.filter((b) => !b.suppressed && BCS[b.type]?.target !== 'none' && !(b.faces?.length || b.bodies?.length));
  if (missing.length) notify('warning', t('notice.bcNoScope', { name: missing.map((b) => b.name || t(`bc.${b.type}`)).join(', ') }));
  const job = buildJob(p, sys);
  const signal = {};
  state.solving = { sysId: sys.id, fraction: 0, key: 'progress.mesh', signal, started: Date.now() };
  sys.status = 'solving';
  model.stopAnimation();
  renderSome(['outline', 'schematic', 'status', 'toolbar', 'ribbon']);
  try {
    const result = await withProgress('progress.solveTitle', sys.name || t(`sys.${sys.type}`), (op, report) => runJob(job, {
      signal,
      onProgress: (f, key) => { state.solving.fraction = f; state.solving.key = key; report({ fraction: f, text: t(key, null, key) }); renderStatusThrottled(); },
    }), { cancellable: true, onCancel: () => signal.cancel?.() });
    // The browser's solver has no clock: the time is measured here.
    if (!result.elapsedMs) result.elapsedMs = Date.now() - state.solving.started;
    sys.result = result;
    sys.status = 'solved';
    sys.error = null;
    const items = resultItems(sys, result);
    if (!quiet) {
      notify('success', t('notice.solved', { name: sys.name || t(`sys.${sys.type}`), s: fmt((result.elapsedMs ?? Date.now() - state.solving.started) / 1000, 3) }));
      state.tab = 'model';
      if (items.length) state.sel = { kind: 'result', id: `${sys.id}:${items[0].key}` };
    }
    return result;
  } catch (error) {
    sys.status = String(error?.message ?? error) === 'cancelled' ? 'setup' : 'error';
    sys.error = error?.message ?? String(error);
    if (!quiet) { if (sys.status === 'error') showError('error.solve', error); else notify('info', t('notice.cancelled')); }
    throw error;
  } finally {
    state.solving = null;
    renderAll();
    if (state.sel.kind === 'result' && !quiet) select(state.sel);
  }
}

async function solveAll() {
  for (const s of state.project?.systems ?? []) {
    try { await solve(s); } catch { break; }
  }
}

function stopSolve() { state.solving?.signal?.cancel?.(); }

// Progress popup (the shell's): delayed, cancellable.
async function withProgress(titleKey, name, task, { delay = 300, cancellable = false, onCancel = null } = {}) {
  const op = `op-${newId()}`;
  let shown = false;
  let last = null;
  const show = () => { shown = true; popups.open('progress', { title: t(titleKey), icon: PROGRESS_ICONS[titleKey] ?? 'solve', nameIcon: 'simSystems', name, op, last, cancellable, delay: 0 }).then((r) => { if (r?.cancel) onCancel?.(); }); };
  const timer = setTimeout(show, delay);
  popups.on(`cancel:${op}`, () => onCancel?.());
  try {
    return await task(op, (progress) => {
      last = { op, done: Math.round((progress.fraction ?? 0) * 1000), total: 1000, text: progress.text ?? '' };
      if (shown) popups.post('progress', { type: 'progress', ...last });
    });
  } finally {
    clearTimeout(timer);
    if (shown) { popups.post('progress', { type: 'done' }); setTimeout(() => popups.hide('progress'), 300); }
  }
}

// ───────────────────────── results: export

function currentResult() {
  if (state.sel.kind !== 'result') return null;
  const [sid, key] = state.sel.id.split(/:(.+)/);
  const sys = systemById(sid);
  const item = resultItems(sys, sys?.result).find((i) => i.key === key);
  return item ? { sys, item } : null;
}

async function exportCsv() {
  const cur = currentResult();
  const sys = cur?.sys ?? activeSystem();
  const r = sys?.result;
  if (!r) return notify('warning', t('notice.noResult'));
  const us = units();
  const lines = [];
  if (cur) {
    const d = displayOf(cur.item, r, 1);
    const pos = r.mesh.positions;
    const kind = d.kind;
    lines.push(`node,x (mm),y (mm),z (mm),${resultTitle(sys, cur.item)} (${unitLabel(kind, us)})`);
    const vals = d.values;
    if (vals) for (let i = 0; i < vals.length; i++) lines.push(`${i + 1},${pos[3 * i]},${pos[3 * i + 1]},${pos[3 * i + 2]},${toDisplay(kind, vals[i], us)}`);
  }
  for (const c of chartsOf(sys, r)) {
    lines.push('', `# ${t(c.titleKey)}`, [t(`axis.${c.x}`), ...c.series.map((s) => s.name)].join(','));
    const n = c.series[0].x.length;
    for (let i = 0; i < n; i++) lines.push([c.series[0].x[i], ...c.series.map((s) => s.y[i])].join(','));
  }
  const outs = outputsOf(sys, r);
  lines.push('', `# ${t('report.results')}`);
  for (const [k, v] of Object.entries(outs)) lines.push(`${t(`out.${k}`)},${toDisplay(OUTPUT_KINDS[k] ?? 'ratio', v, us)},${unitLabel(OUTPUT_KINDS[k] ?? 'ratio', us)}`);
  await saveExport(`${safeName()}-${fileSafe(sys.name || sys.type)}.csv`, 'csv', lines.join('\n'), 'text/csv');
}

async function exportImage() {
  if (!model.view) return;
  const url = model.view.snapshot();
  const bytes = Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0));
  await saveExport(`${safeName()}.png`, 'png', bytes, 'image/png');
}

async function exportStl() {
  const sys = activeSystem();
  const tris = sys?.result?.topology?.surface;
  if (!tris?.length) return notify('warning', t('notice.noTopology'));
  await saveExport(`${safeName()}-optimized.stl`, 'stl', writeStl(tris, 'My3DMaker topology'), 'model/stl');
}

async function exportReport() {
  const sys = activeSystem();
  const image = state.tab === 'model' && model.view ? model.view.snapshot('image/png') : null;
  await saveExport(`${safeName()}-report.html`, 'html', reportHtml(ctx, sys, { image }), 'text/html');
}

let printHost = null;
function printReport() {
  if (!state.project) return undefined;
  if (!printHost) {
    printHost = createPrintHost({
      popups, safeName, saveExport, showError,
      viewport: () => null,
      info: () => ({ mode: 'drawing', kind: 'drawing', name: state.project?.name ?? '', kindLabel: t('print.kindReport'), sheet: 'A4', sheetW: 210, sheetH: 297 }),
      drawing: async () => {
        const sys = activeSystem();
        let image = null; let legend = null;
        if (model.view && model.view.mesh) {
          image = model.view.snapshot('image/png');
          const c = model.view.contour;
          const d = model.shown?.display;
          if (c && d) legend = { title: model.shown.item ? resultTitle(systemById(model.shown.sysId), model.shown.item) : '', unit: unitLabel(d.kind, units()), min: c.min, max: c.max, colormap: c.colormap, bands: c.bands, reverse: d.reverse, format: (v) => fmt(toDisplay(d.kind, v, units())) };
        }
        return reportSvg(ctx, sys, { image, legend });
      },
    });
    popups.on('print-render', (data) => printHost.render(data));
    popups.on('print-save-pdf', (data) => printHost.savePdf(data));
  }
  return printHost.open();
}

// ───────────────────────── design exploration

function parameterCandidates() {
  const p = state.project;
  if (!p) return [];
  const out = [];
  for (const b of p.bodies) for (const q of TEMPLATES[b.template]?.params ?? []) out.push({ path: `bodies.${b.id}.params.${q.key}`, label: `${b.name} · ${t(`param.${q.key}`, null, q.key)}`, kind: 'length', model: true, value: b.params[q.key] });
  const sys = activeSystem();
  if (sys) {
    for (const bc of sys.bcs) for (const f of BCS[bc.type].fields) {
      if (f.type === 'number') out.push({ path: `systems.${sys.id}.bcs.${bc.id}.${f.key}`, label: `${bc.name || t(`bc.${bc.type}`)} · ${t(`bcf.${f.key}`)}`, kind: f.kind, value: bc[f.key] });
      if (f.type === 'vector') bc[f.key]?.forEach((v, i) => { if (v !== 0) out.push({ path: `systems.${sys.id}.bcs.${bc.id}.${f.key}.${i}`, label: `${bc.name || t(`bc.${bc.type}`)} · ${t(`bcf.${f.key}`)} ${'XYZ'[i]}`, kind: f.kind, value: v }); });
    }
  }
  return out.filter((c) => !p.parameters.some((q) => q.path === c.path));
}

function addParameter(path) {
  const c = parameterCandidates().find((x) => x.path === path);
  if (!c) return;
  change('op.addParam', (p) => { const v = Number(c.value) || 1; p.parameters.push({ id: newId('q'), path, label: c.label, kind: c.kind, model: c.model, base: v, min: v * 0.8, max: v * 1.2, levels: 3, step: Math.abs(v) / 20 || 1 }); }, { keepResults: true });
}

async function runStudy() {
  const p = state.project;
  const sys = activeSystem();
  if (!sys || !p.parameters.length) return notify('warning', t('notice.studyNeeds'));
  const st = p.study;
  try {
    const doe = await runJob({ analysis: 'doe', parameters: p.parameters.map((q) => ({ name: q.label, min: q.min, max: q.max, levels: q.levels ?? 3 })), method: st.method, samples: st.samples ?? 12, seed: 7 });
    st.rows = doe.points.map((x) => ({ inputs: x, outputs: null }));
    st.fit = null;
    renderAll();
    const base = packProject(p);
    const signal = { cancelled: false };
    await withProgress('progress.studyTitle', sys.name || t(`sys.${sys.type}`), async (op, report) => {
      for (let i = 0; i < st.rows.length; i++) {
        if (signal.cancelled) break;
        const row = st.rows[i];
        const variant = unpackProject(base);
        p.parameters.forEach((q, j) => pathSet(variant, q.path, row.inputs[j]));
        const vsys = variant.systems.find((s) => s.id === sys.id);
        try {
          const r = await runJob(buildJob(variant, vsys), { onProgress: (f) => report({ fraction: (i + f) / st.rows.length, text: t('progress.studyPoint', { i: i + 1, n: st.rows.length }) }) });
          row.outputs = outputsOf(vsys, r);
        } catch (error) { row.error = errorText(error); }
        renderSome(['tab']);
      }
    }, { cancellable: true, onCancel: () => { signal.cancelled = true; } });
    state.dirty = true;
    await fitStudy({ quiet: true });
    notify('success', t('notice.studyDone', { n: st.rows.filter((r) => r.outputs).length }));
  } catch (error) { showError('error.study', error); }
  renderAll();
}

async function fitStudy({ quiet = false } = {}) {
  const p = state.project;
  const st = p.study;
  const rows = (st.rows ?? []).filter((r) => r.outputs);
  if (rows.length < p.parameters.length + 2) { if (!quiet) notify('warning', t('notice.fitNeeds')); return; }
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.outputs)))];
  const outputs = Object.fromEntries(keys.map((k) => [k, rows.map((r) => r.outputs[k] ?? NaN)]));
  const sys = activeSystem();
  const objective = st.objective ?? SYSTEMS[sys?.type]?.outputs?.[0] ?? keys[0];
  try {
    st.fit = await runJob({ analysis: 'fit', parameters: p.parameters.map((q) => ({ name: q.label, min: q.min, max: q.max })), inputs: rows.map((r) => r.inputs), outputs, objective: { output: objective, goal: st.goal ?? 'min' } });
    renderAll();
  } catch (error) { showError('error.study', error); }
}

function studyChart() {
  const p = state.project;
  const c = p?.study?.fit?.chart;
  if (!c || p.parameters.length < 2) return '';
  return heatMap(c.values, c.size, { xLabel: p.parameters[0].label, yLabel: p.parameters[1].label, xr: c.x, yr: c.y });
}

// ───────────────────────── commands

const sysOpen = () => Boolean(state.project) && !state.showStart;
const hasSystem = () => Boolean(activeSystem());
const solvedNow = () => Boolean(activeSystem()?.result);
const tabCmd = (tab, glyph) => ({ icon: glyph, label: `tab.${tab}`, enabled: sysOpen, checked: () => sysOpen() && state.tab === tab, run: () => setTab(tab) });
const tplCmd = (id) => ({ icon: TEMPLATES[id].icon, label: `tpl.${id}`, enabled: sysOpen, run: () => (id === 'stl' ? importStl() : addTemplateBody(id)) });
const bcCmd = (id) => ({ icon: BCS[id].icon, label: `bc.${id}`, enabled: () => Boolean(activeSystem() && SYSTEMS[activeSystem().type].bcs.includes(id)), run: () => addCondition(id) });
const sysCmd = (id) => ({ icon: SYSTEMS[id].icon, label: `sys.${id}`, enabled: sysOpen, run: () => addSystemOf(id) });
const viewCmd = (name, glyph) => ({ icon: glyph, label: `view.${name}`, enabled: () => sysOpen() && state.tab === 'model', run: () => model.view?.setView(name) });
const styleCmd = (style, glyph) => ({ icon: glyph, label: `style.${style}`, enabled: () => sysOpen() && state.tab === 'model', checked: () => (state.settings.displayStyle ?? 'shadedEdges') === style, run: () => { updateSettings({ displayStyle: style }); model.view?.setStyle(style); } });

const commands = {
  newProject: { icon: 'fileNew', label: 'action.new', key: 'Ctrl+N', run: newProject },
  open: { icon: 'folderOpen', label: 'action.open', key: 'Ctrl+O', run: openWithDialog },
  save: { icon: 'save', label: 'action.save', key: 'Ctrl+S', enabled: sysOpen, run: () => saveProject() },
  saveAs: { icon: 'saveAs', label: 'action.saveAs', key: 'Ctrl+Shift+S', enabled: sysOpen, run: () => saveProject({ saveAs: true }) },
  openExample: { icon: 'samples', label: 'action.openExample', run: (c) => examplesMenu(c?.anchor) },
  importStl: { icon: 'stlFile', label: 'cmd.importStl', run: importStl },
  exportReport: { icon: 'exportFile', label: 'cmd.exportReport', enabled: sysOpen, run: exportReport },
  exportCsv: { icon: 'csvFile', label: 'cmd.exportCsv', enabled: solvedNow, run: exportCsv },
  exportImage: { icon: 'exportImage', label: 'cmd.exportImage', enabled: () => sysOpen() && state.tab === 'model', run: exportImage },
  exportStl: { icon: 'stlFile', label: 'cmd.exportStl', enabled: () => Boolean(activeSystem()?.result?.topology), run: exportStl },
  print: { icon: 'print', label: 'cmd.report', key: 'Ctrl+P', enabled: sysOpen, run: printReport },
  closeProject: { icon: 'closeTab', label: 'action.closeProject', enabled: sysOpen, run: closeProject },
  exit: { icon: 'exit', label: 'action.exit', run: () => (desktop ? appWindow.close() : undefined), enabled: () => desktop },
  startPage: { icon: 'home', label: 'menu.home', run: () => showStartPage(true) },
  undo: { icon: 'undo', label: 'action.undo', key: 'Ctrl+Z', enabled: () => state.history.canUndo, run: undo },
  redo: { icon: 'redo', label: 'action.redo', key: 'Ctrl+Y', enabled: () => state.history.canRedo, run: redo },
  deleteSelection: { icon: 'trash', label: 'cmd.delete', key: 'Delete', enabled: () => ['body', 'bc', 'contact', 'system'].includes(state.sel.kind), run: deleteSelection },
  duplicateBody: { icon: 'copy', label: 'cmd.duplicateBody', key: 'Ctrl+D', enabled: () => state.sel.kind === 'body', run: duplicateBody },
  tabProject: tabCmd('project', 'simSystems'),
  tabModel: tabCmd('model', 'geometry'),
  tabData: tabCmd('data', 'material'),
  tabStudy: tabCmd('study', 'simDoe'),
  addBox: tplCmd('box'), addCylinder: tplCmd('cylinder'), addTube: tplCmd('tube'), addSphere: tplCmd('sphere'),
  generateMesh: { icon: 'mesh', label: 'cmd.generateMesh', enabled: hasSystem, run: () => meshActive() },
  solve: { icon: 'solve', label: 'cmd.solve', key: 'F5', enabled: () => hasSystem() && !state.solving, run: () => solve().catch(() => {}) },
  solveAll: { icon: 'solveAll', label: 'cmd.solveAll', enabled: () => hasSystem() && !state.solving, run: solveAll },
  stopSolve: { icon: 'stop', label: 'cmd.stopSolve', enabled: () => Boolean(state.solving), run: stopSolve },
  addContact: { icon: 'simContact', label: 'cmd.addContact', enabled: () => Boolean(activeSystem() && SYSTEMS[activeSystem().type].contacts), run: addContact },
  autoContacts: { icon: 'magic', label: 'cmd.autoContacts', enabled: () => Boolean(activeSystem() && SYSTEMS[activeSystem().type].contacts), run: autoContacts },
  clearFaces: { icon: 'trash', label: 'action.clear', enabled: () => state.sel.kind === 'bc', run: () => { const bc = activeSystem()?.bcs.find((b) => b.id === state.sel.id); if (bc) change('op.pickFace', () => { bc.faces = []; }); } },
  animate: { icon: 'play', label: 'cmd.animate', enabled: () => model.shown?.kind === 'result', checked: () => state.animate, run: () => (state.animate ? model.stopAnimation() : model.startAnimation()) },
  zoomFit: { icon: 'zoomFit', label: 'view.fit', key: 'F', enabled: () => state.tab === 'model', run: () => model.view?.setView('iso') },
  perspective: { icon: 'perspective', label: 'view.perspective', enabled: () => state.tab === 'model', checked: () => Boolean(state.settings.perspectiveView), run: () => { updateSettings({ perspectiveView: !state.settings.perspectiveView }); model.view?.setPerspective(state.settings.perspectiveView); } },
  showMaxMin: { icon: 'maxMin', label: 'cmd.showMaxMin', checked: () => Boolean(state.settings.showMaxMin), run: () => { updateSettings({ showMaxMin: !state.settings.showMaxMin }); model.rescale(); } },
  showUndeformed: { icon: 'deform', label: 'cmd.showUndeformed', checked: () => Boolean(state.settings.showUndeformed), run: () => { updateSettings({ showUndeformed: !state.settings.showUndeformed }); model.rescale(); } },
  leftPanel: { icon: 'panelLeft', label: 'cmd.leftPanel', checked: () => state.settings.showLeftPanel, run: () => updateSettings({ showLeftPanel: !state.settings.showLeftPanel }) },
  rightPanel: { icon: 'panelRight', label: 'cmd.rightPanel', checked: () => state.settings.showRightPanel, run: () => updateSettings({ showRightPanel: !state.settings.showRightPanel }) },
  bottomPanel: { icon: 'panelBottom', label: 'cmd.bottomPanel', checked: () => state.settings.showBottomPanel, run: () => updateSettings({ showBottomPanel: !state.settings.showBottomPanel }) },
  statusBar: { icon: 'statusBar', label: 'cmd.statusBar', checked: () => state.settings.showStatusBar, run: () => updateSettings({ showStatusBar: !state.settings.showStatusBar }) },
  units: { icon: 'units', label: 'settings.unitSystem', run: () => updateSettings({ unitSystem: units() === 'mm' ? 'si' : 'mm' }) },
  theme: { icon: 'palette', label: 'action.theme', run: () => updateSettings({ theme: resolveTheme(state.settings.theme, prefersDark()).dark ? 'light' : 'dark' }) },
  themeMenu: { icon: 'chevronDown', label: 'action.themeChoose', run: (c) => openThemePicker(c?.anchor) },
  language: { icon: 'language', label: 'action.language', run: () => updateSettings({ language: lang() === 'ko' ? 'en' : 'ko' }) },
  settings: { icon: 'gear', label: 'action.settings', key: 'Ctrl+,', run: () => popups.open('settings', { tab: 'general' }) },
  about: { icon: 'info', label: 'action.about', run: () => popups.open('about', {}) },
  userGuide: { icon: 'userGuide', label: 'action.userGuide', key: 'F1', run: () => openDocWindow('guide') },
  tutorialDoc: { icon: 'tutorialDoc', label: 'action.tutorialDoc', run: () => openDocWindow('tutorial') },
  shortcuts: { icon: 'keyboard', label: 'action.shortcuts', run: () => showShortcuts() },
  newMenu: { icon: 'chevronDown', label: 'cmd.newMenu', run: (c) => newMenu(c?.anchor) },
  viewsMenu: { icon: 'chevronDown', label: 'cmd.viewsMenu', run: (c) => showMenu(menuItems(['view:iso', 'view:front', 'view:back', 'view:top', 'view:bottom', 'view:right', 'view:left']), c?.anchor) },
  'view:iso': viewCmd('iso', 'viewIso'), 'view:front': viewCmd('front', 'viewFront'), 'view:back': viewCmd('back', 'viewBack'), 'view:top': viewCmd('top', 'viewTop'),
  'view:bottom': viewCmd('bottom', 'viewBottom'), 'view:right': viewCmd('right', 'viewRight'), 'view:left': viewCmd('left', 'viewLeft'),
  'style:shadedEdges': styleCmd('shadedEdges', 'styleShaded'), 'style:shaded': styleCmd('shaded', 'styleWhite'), 'style:mesh': styleCmd('mesh', 'mesh'),
  'style:wireframe': styleCmd('wireframe', 'styleWireframe'), 'style:translucent': styleCmd('translucent', 'styleTranslucent'),
  runStudy: { icon: 'play', label: 'cmd.runStudy', enabled: () => Boolean(state.project?.parameters.length && hasSystem()), run: runStudy },
  fitStudy: { icon: 'chartLine', label: 'cmd.fitStudy', enabled: () => Boolean(state.project?.study.rows?.length), run: () => fitStudy() },
  clearStudy: { icon: 'trash', label: 'cmd.clearStudy', enabled: () => Boolean(state.project?.study.rows?.length), run: () => change('op.clearStudy', (p) => { p.study.rows = []; p.study.fit = null; }, { keepResults: true }) },
};
for (const id of Object.keys(TEMPLATES)) commands[`tpl:${id}`] = tplCmd(id);
for (const id of Object.keys(BCS)) commands[`bc:${id}`] = bcCmd(id);
for (const id of SYSTEM_IDS) commands[`sys:${id}`] = sysCmd(id);
ctx.commands = commands;

async function meshActive() {
  const sys = activeSystem();
  if (!sys) return;
  try {
    const r = await withProgress('progress.meshTitle', sys.name, (op, report) => runJob({ ...buildJob(state.project, sys), analysis: 'mesh' }, { onProgress: (f, key) => report({ fraction: f, text: t(key, null, key) }) }));
    // Show it like a result (a mesh only): the outline's Mesh row gets its counts.
    sys.result = sys.result ?? null;
    state.lastMesh = { sysId: sys.id, info: r.mesh };
    state.setupMesh = { key: model.setupKey(), info: r.mesh };
    model.showSetup();
    model.view?.setStyle('mesh');
    notify('success', t('notice.meshed', { nodes: r.mesh.nodes.toLocaleString(), elements: r.mesh.elements.toLocaleString(), q: fmt(r.mesh.quality.min, 3) }));
    state.sel = { kind: 'mesh', id: sys.id };
    renderAll();
  } catch (error) { showError('error.mesh', error); }
}

function commandEnabled(id) { const c = commands[id]; return Boolean(c) && (c.enabled ? Boolean(c.enabled()) : true); }
function commandTip(id) { const c = commands[id]; if (!c) return id; return `${t(c.label)}${c.key ? ` (${keyLabel(c.key)})` : ''}`; }
async function run(id, context) {
  const c = commands[id];
  if (!c || !commandEnabled(id)) return undefined;
  try { return await c.run(context); } catch (error) { return showError('error.command', error); }
}

// ───────────────────────── menus

const SUBMENUS = {
  newGeometry: () => TEMPLATE_GROUPS.flatMap((g, i) => [...(i ? ['-'] : []), ...Object.keys(TEMPLATES).filter((k) => TEMPLATES[k].group === g).map((k) => `tpl:${k}`)]),
  newSystem: () => GROUPS.flatMap((g, i) => [...(i ? ['-'] : []), ...SYSTEM_IDS.filter((s) => SYSTEMS[s].group === g).map((s) => `sys:${s}`)]),
  conditions: () => { const sys = activeSystem(); const allowed = sys ? SYSTEMS[sys.type].bcs : []; return BC_CATS.flatMap((c) => { const ids = allowed.filter((b) => BCS[b].cat === c).map((b) => `bc:${b}`); return ids.length ? ['-', ...ids] : []; }).slice(1); },
  views: () => ['view:iso', 'view:front', 'view:back', 'view:top', 'view:bottom', 'view:right', 'view:left'],
  styles: () => ['style:shadedEdges', 'style:shaded', 'style:mesh', 'style:wireframe', 'style:translucent'],
  exportTo: () => ['exportReport', 'exportCsv', 'exportImage', 'exportStl'],
};
const SUB_ICONS = { newGeometry: 'geometry', newSystem: 'simSystems', conditions: 'bcForce', views: 'viewIso', styles: 'styleShaded', exportTo: 'exportFile' };
const sub = (key) => ({ sub: key });
const MENUS = {
  file: ['newProject', 'open', 'openExample', '-', 'save', 'saveAs', '-', 'importStl', sub('exportTo'), '-', 'print', '-', 'closeProject', 'exit'],
  edit: ['undo', 'redo', '-', 'deleteSelection', 'duplicateBody'],
  view: ['tabProject', 'tabModel', 'tabData', 'tabStudy', '-', sub('views'), 'zoomFit', 'perspective', sub('styles'), '-', 'leftPanel', 'bottomPanel', 'rightPanel', 'statusBar', '-', 'theme', 'language', 'units'],
  insert: [sub('newGeometry'), sub('newSystem'), sub('conditions'), 'addContact', 'autoContacts'],
  solve: ['generateMesh', 'solve', 'solveAll', 'stopSolve', '-', 'animate', 'showMaxMin', 'showUndeformed'],
  tools: ['tabStudy', 'runStudy', 'fitStudy', '-', 'settings'],
  help: ['userGuide', 'tutorialDoc', 'shortcuts', '-', 'about'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', view: 'eye', insert: 'plus', solve: 'solve', tools: 'tools', help: 'question' };

function menuItems(ids, depth = 0) {
  return ids.map((id) => {
    if (id === '-') return { separator: true };
    if (typeof id === 'object' && id.sub) return { id: `sub:${id.sub}`, label: t(`submenu.${id.sub}`), icon: SUB_ICONS[id.sub] ?? 'dot', children: depth < 2 ? menuItems(SUBMENUS[id.sub](), depth + 1) : [] };
    const c = commands[id];
    if (!c) return null;
    return { id, label: t(c.label), icon: c.icon, key: c.key ? keyLabel(c.key) : '', disabled: !commandEnabled(id), checked: c.checked ? Boolean(c.checked()) : undefined };
  }).filter(Boolean);
}

async function showMenu(items, anchor, name = 'context', options = {}) {
  const result = await popups.open('menu', { items, name, ...options }, { anchor });
  const id = result?.id;
  if (!id) return;
  if (options.handlers?.[id]) return options.handlers[id]();
  if (commands[id]) return run(id);
  return undefined;
}

function toScreen(x, y) { if (popups.useFrames) return { x: window.screenX + x, y: window.screenY + y }; return { x: window.screenX + x, y: window.screenY + y + (window.outerHeight - window.innerHeight > 0 && !desktop ? window.outerHeight - window.innerHeight : 0) }; }
function anchorBelow(el) { const r = el.getBoundingClientRect(); const p = toScreen(r.left, r.bottom + 2); return { ...p, flipY: toScreen(r.left, r.top - 2).y }; }
function anchorAt(ev) { const p = toScreen(ev.clientX, ev.clientY); return { x: p.x + 1, y: p.y + 1, flipY: p.y }; }

function openMenubarMenu(name) { const el = root.querySelector(`[data-menu="${name}"]`); if (el) showMenu(menuItems(MENUS[name]), anchorBelow(el), name); }

function examplesMenu(anchor) {
  const at = anchor ?? anchorBelow(root.querySelector('[data-menu="file"]'));
  const handlers = {};
  const items = SAMPLE_GROUPS.map((g) => ({ id: `group:${g.id}`, label: g[lang()], icon: g.icon, children: SAMPLES.filter((s) => s.group === g.id).map((s) => { handlers[`sample:${s.id}`] = () => openSample(s.id); return { id: `sample:${s.id}`, label: s[lang()][0], icon: s.icon }; }) }));
  return showMenu(items, at, 'context', { handlers, header: { icon: 'samples', title: t('action.openExample') } });
}

function newMenu(anchor) {
  const handlers = { 'custom:project': () => newProject() };
  const items = [{ id: 'custom:project', label: t('action.new'), icon: 'fileNew' }, { separator: true }, ...menuItems([sub('newSystem'), sub('newGeometry')])];
  return showMenu(items, anchor, 'context', { handlers });
}

function systemMenu(sysId, anchor) {
  const sys = systemById(sysId);
  if (!sys) return;
  const handlers = {
    'custom:solve': () => solve(sys).catch(() => {}),
    'custom:open': () => { activate(sys.id); setTab('model'); },
    'custom:rename': async () => { const r = await popups.open('prompt', { title: t('cmd.rename'), value: sys.name, icon: 'rename' }); if (r?.value) change('op.rename', () => { sys.name = r.value; }, { keepResults: true }); },
    'custom:duplicate': () => change('op.duplicate', (p) => { const c = structuredClone({ ...sys, result: undefined }); c.id = newId('s'); c.name = `${sys.name} (2)`; c.status = 'setup'; p.systems.push(c); }, { keepResults: true }),
    'custom:delete': () => { state.sel = { kind: 'system', id: sys.id }; deleteSelection(); },
  };
  const follow = (FOLLOW_UPS[sys.type] ?? []).map((f) => { handlers[`custom:follow:${f}`] = () => addSystemOf(f, sys.id); return { id: `custom:follow:${f}`, label: t('cmd.followUp', { name: t(`sys.${f}`) }), icon: SYSTEMS[f].icon }; });
  const items = [{ id: 'custom:open', label: t('cmd.editSystem'), icon: 'geometry' }, { id: 'custom:solve', label: t('cmd.solve'), icon: 'solve' }, { separator: true }, ...follow, ...(follow.length ? [{ separator: true }] : []), { id: 'custom:rename', label: t('cmd.rename'), icon: 'rename' }, { id: 'custom:duplicate', label: t('cmd.duplicateSystem'), icon: 'copy' }, { id: 'custom:delete', label: t('cmd.delete'), icon: 'trash' }];
  return showMenu(items, anchor, 'context', { handlers, header: { icon: SYSTEMS[sys.type].icon, title: sys.name || t(`sys.${sys.type}`) } });
}

async function openThemePicker(anchor) {
  const el = root.querySelector('[data-command="themeMenu"]');
  const r = await popups.open('theme', { current: state.settings.theme }, { anchor: anchor ?? (el ? anchorBelow(el) : null) });
  if (r?.theme) updateSettings({ theme: r.theme });
}

async function openDocWindow(kind) {
  const name = t(DOC_KINDS[kind]?.title ?? `doc.${kind}`, null, kind);
  try {
    if (desktop) await native.invoke('open_doc_window', { kind, title: docWindowTitle(name), width: 1060, height: 820, dark: resolveTheme(state.settings.theme, prefersDark()).dark });
    else globalThis.open(`./index.html?viewer=${kind}`, docLabel(kind));
  } catch (error) { showError('error.unexpected', error); }
}

function showShortcuts() {
  const list = Object.entries(commands).filter(([, c]) => c.key).map(([id, c]) => `${keyLabel(c.key)} — ${t(c.label)}`);
  popups.open('confirm', { title: t('action.shortcuts'), icon: 'keyboard', message: list.join('\n'), buttons: [{ id: 'ok', label: t('confirm.ok'), primary: true }] });
}

// ───────────────────────── shell

function renderShell() {
  root.innerHTML = `
    <nav id="menubar" role="menubar"></nav>
    <div id="toolbar" role="toolbar"></div>
    <main id="workspace">
      <aside id="left-panel" class="side-panel"></aside>
      <div class="splitter vertical panel-split" data-split="left" role="separator"></div>
      <section id="center">
        <div id="ws-tabs" class="ws-tabs"></div>
        <div id="palette-host" class="command-manager"></div>
        <div id="center-body">
          <div id="view-host" class="view-host sim-view" hidden></div>
          <div id="tab-host" class="tab-host"></div>
          <div id="start-page" hidden></div>
        </div>
        <div class="splitter horizontal bottom-split" data-split="bottom" role="separator"></div>
        <section id="bottom-panel"></section>
      </section>
      <div class="splitter vertical panel-split" data-split="right" role="separator"></div>
      <aside id="right-panel" class="side-panel"></aside>
    </main>
    <footer id="statusbar" role="status"></footer>
    ${desktop ? `<div class="resize-grip" data-resize-grip title="${escapeHtml(t('tip.resize'))}">${icon('grip')}</div>` : `<div class="resize-grip static" aria-hidden="true">${icon('grip')}</div>`}`;
}

function renderMenubar() {
  const bar = root.querySelector('#menubar');
  const onStart = state.showStart || !state.project;
  const brand = `<div class="app-brand" data-window-drag title="My3DMaker v${VERSION}"><img class="app-brand-icon" src="${APP_ICON}" alt="" data-window-drag /><span class="app-brand-name" data-window-drag>My3DMaker</span><span class="app-brand-version" data-window-drag>v${VERSION}</span></div>`;
  const home = `<button class="menubar-item menubar-home ${onStart ? 'current' : ''}" data-home title="${escapeHtml(t('tip.home'))}">${icon('home')}<span>${escapeHtml(t('menu.home'))}</span></button><span class="menubar-sep"></span>`;
  const btn = (id, glyph, key) => `<button class="window-button ${id === 'close' ? 'close' : ''}" data-window="${id}" title="${escapeHtml(t(key))}" aria-label="${escapeHtml(t(key))}">${icon(glyph)}</button>`;
  const controls = desktop ? `<div class="window-controls">${btn('minimize', 'winMinimize', 'window.minimize')}${state.maximized ? btn('maximize', 'winRestore', 'window.restore') : btn('maximize', 'winMaximize', 'window.maximize')}${btn('close', 'winClose', 'window.close')}</div>` : '';
  const name = state.project && !onStart ? `<span class="menubar-project ${state.dirty ? 'dirty' : ''}" data-window-drag title="${escapeHtml(state.path ?? projectName())}"><span class="app-brand-project-name" data-window-drag>${escapeHtml(projectName())}</span><span class="app-brand-dirty" data-window-drag>●</span></span>` : '<span class="menubar-project empty"></span>';
  // Left · bottom · right panel switches, just left of the window buttons (always shown).
  const panelBtn = (id, cmd, on, glyph) => `<button class="window-button panel-toggle ${on ? 'on' : ''}" data-command="${cmd}" title="${escapeHtml(t(`panel.${on ? 'collapse' : 'expand'}${id}`))}" aria-pressed="${on}">${icon(glyph)}</button>`;
  const panels = onStart ? '' : `<div class="panel-toggles">${panelBtn('Left', 'leftPanel', state.settings.showLeftPanel, 'panelLeft')}${panelBtn('Bottom', 'bottomPanel', state.settings.showBottomPanel, 'panelBottom')}${panelBtn('Right', 'rightPanel', state.settings.showRightPanel, 'panelRight')}</div>`;
  bar.innerHTML = brand + home + Object.keys(MENUS).map((m) => `<button class="menubar-item" data-menu="${m}" title="${escapeHtml(t(`menu.${m}`))}">${icon(MENU_ICONS[m])}<span>${escapeHtml(t(`menu.${m}`))}</span></button>`).join('') + name + `<div class="menubar-drag" data-window-drag></div>${panels}${controls}`;
  if (desktop) appWindow.setTitle(state.project && !onStart ? `${projectName()}${state.dirty ? ' *' : ''} — My3DMaker` : `My3DMaker v${VERSION}`).catch(() => {});
}

const TOOLBAR = [
  ['newSplit', 'open', 'save', 'print', 'exportReport'],
  ['undo', 'redo'],
  ['generateMesh', 'solve', 'stopSolve'],
  ['viewsSplit', 'zoomFit', 'perspective', 'style:shadedEdges', 'style:mesh', 'style:translucent'],
  ['animate', 'showMaxMin', 'units'],
];
const TOOLBAR_RIGHT = ['themeSplit', 'language', 'settings', 'about'];
const LABELLED = new Set(['newProject', 'open', 'save', 'generateMesh', 'solve', 'animate', 'units']);

function renderToolbar() {
  const bar = root.querySelector('#toolbar');
  const plain = (id) => {
    const c = commands[id];
    const glyph = id === 'language' ? switchFlag(getLanguage()) : icon(c.icon);
    const label = id === 'units' ? (units() === 'mm' ? 'mm·MPa' : 'SI') : t(c.label);
    if (!LABELLED.has(id)) return `<button class="tool-button" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(c.label))}">${glyph}</button>`;
    return `<button class="tool-button labeled" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(c.label))}">${glyph}<span class="tool-label">${escapeHtml(label)}</span></button>`;
  };
  const split = (main, arrow) => `<span class="split-button">${plain(main)}<button class="tool-button split-arrow" data-command="${arrow}" title="${escapeHtml(commandTip(arrow))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
  const button = (id) => (id === 'newSplit' ? split('newProject', 'newMenu') : id === 'themeSplit' ? split('theme', 'themeMenu') : id === 'viewsSplit' ? split('view:iso', 'viewsMenu') : plain(id));
  bar.innerHTML = `<div class="toolbar-inner"><div class="toolbar-left">${TOOLBAR.map((g, i) => `${i ? '<span class="tool-sep"></span>' : ''}<div class="tool-group">${g.map(button).join('')}</div>`).join('')}</div><span class="grow"></span><div class="toolbar-right tool-group">${TOOLBAR_RIGHT.map(button).join('')}</div></div>`;
  renderToolbarState();
  requestAnimationFrame(fitToolbar);
}

/** Labels go when the toolbar is too narrow (icons stay; language, theme and the window buttons always show). */
function fitToolbar() {
  const bar = root.querySelector('#toolbar');
  const inner = bar?.querySelector('.toolbar-inner');
  if (!inner) return;
  bar.classList.remove('compact');
  if (inner.scrollWidth > inner.clientWidth + 2) bar.classList.add('compact');
  const min = Math.ceil([...root.querySelectorAll('.app-brand, .menubar-item, .window-controls')].reduce((s, el) => s + el.offsetWidth + 2, 60));
  native.setMinimumSize(Math.max(1000, min), 640).catch(() => {});
}

function renderToolbarState() {
  for (const el of root.querySelectorAll('[data-command]')) {
    const id = el.dataset.command;
    if (!commands[id]) continue;
    el.disabled = !commandEnabled(id);
    const on = commands[id].checked?.();
    el.classList.toggle('active', Boolean(on));
  }
  const anim = root.querySelector('#toolbar [data-command="animate"]');
  if (anim) anim.querySelector('svg')?.replaceWith(document.createRange().createContextualFragment(icon(state.animate ? 'pause' : 'play')));
}

const WS_TABS = [['project', 'simSystems'], ['model', 'geometry'], ['data', 'material'], ['study', 'simDoe']];

function renderWsTabs() {
  const host = root.querySelector('#ws-tabs');
  if (!state.project || state.showStart) { host.innerHTML = ''; return; }
  host.innerHTML = WS_TABS.map(([id, glyph]) => `<button class="ws-tab ${state.tab === id ? 'active' : ''}" data-ws-tab="${id}" title="${escapeHtml(t(`tabTip.${id}`))}">${icon(glyph)}<span>${escapeHtml(t(`tab.${id}`))}</span></button>`).join('') + `<span class="grow"></span>${activeSystem() ? `<span class="ws-active" title="${escapeHtml(t('status.activeSystem'))}">${icon(SYSTEMS[activeSystem().type].icon)}<span>${escapeHtml(activeSystem().name || t(`sys.${activeSystem().type}`))}</span></span>` : ''}`;
}

/** The ribbon above the 3D view (Model tab): tabs of command buttons. */
const RIBBON = {
  geometry: () => [...Object.keys(TEMPLATES).filter((k) => TEMPLATES[k].group === 'primitive').map((k) => `tpl:${k}`), '|', ...Object.keys(TEMPLATES).filter((k) => TEMPLATES[k].group === 'part').map((k) => `tpl:${k}`), '|', ...Object.keys(TEMPLATES).filter((k) => ['fluid', 'electromagnetic'].includes(TEMPLATES[k].group)).map((k) => `tpl:${k}`), '|', 'importStl', 'duplicateBody', 'deleteSelection'],
  setup: () => { const sys = activeSystem(); if (!sys) return []; const allowed = SYSTEMS[sys.type].bcs; return [...BC_CATS.flatMap((c) => { const ids = allowed.filter((b) => BCS[b].cat === c).map((b) => `bc:${b}`); return ids.length ? ['|', ...ids] : []; }).slice(1), ...(SYSTEMS[sys.type].contacts ? ['|', 'addContact', 'autoContacts'] : [])]; },
  mesh: () => ['generateMesh', '|', 'style:shadedEdges', 'style:mesh', 'style:wireframe'],
  solution: () => ['solve', 'solveAll', 'stopSolve', '|', 'animate', 'showMaxMin', 'showUndeformed', '|', 'exportCsv', 'exportImage', 'exportStl', 'print', 'exportReport'],
  display: () => ['view:iso', 'view:front', 'view:top', 'view:right', 'zoomFit', 'perspective', '|', 'style:shadedEdges', 'style:shaded', 'style:mesh', 'style:wireframe', 'style:translucent'],
};

function renderRibbon() {
  const host = root.querySelector('#palette-host');
  host.hidden = !state.project || state.showStart || state.tab !== 'model';
  if (host.hidden) { host.innerHTML = ''; return; }
  const tabs = Object.keys(RIBBON);
  if (!tabs.includes(state.cmTab)) state.cmTab = 'geometry';
  const ids = RIBBON[state.cmTab]();
  host.innerHTML = `<div class="cm-tab-row"><div class="cm-tabs">${tabs.map((id) => `<button class="cm-tab ${state.cmTab === id ? 'active' : ''}" data-cm-tab="${id}">${escapeHtml(t(`cm.${id}`))}</button>`).join('')}</div></div>
    <div class="cm-buttons">${ids.map((id) => (id === '|' ? '<span class="cm-sep"></span>' : commands[id] ? `<button class="cm-button" data-command="${id}" title="${escapeHtml(commandTip(id))}">${icon(commands[id].icon)}<span>${escapeHtml(t(commands[id].label))}</span></button>` : '')).join('')}</div>`;
  renderToolbarState();
}

/** A panel's head: its icon and title, its own tools, and the collapse button. */
function panelHead(glyph, title, collapseCmd, collapseIcon, collapseTip, tools = '') {
  return `<div class="lp-head" data-panel-head>${icon(glyph)}<b>${escapeHtml(title)}</b><span class="grow"></span>${tools}<button class="icon-button" data-command="${collapseCmd}" title="${escapeHtml(t(collapseTip))}" aria-label="${escapeHtml(t(collapseTip))}">${icon(collapseIcon)}</button></div>`;
}

/** A collapsed side panel: the expand button, then its icon and title written downwards. */
function panelRail(cmd, openIcon, glyph, title, tip) {
  return `<div class="panel-rail"><button class="rail-button expand" data-command="${cmd}" title="${escapeHtml(t(tip))}" aria-label="${escapeHtml(t(tip))}">${icon(openIcon)}</button><div class="rail-title" data-command="${cmd}" title="${escapeHtml(t(tip))}">${icon(glyph)}<span>${escapeHtml(title)}</span></div></div>`;
}

const leftInfo = () => (state.tab === 'project' ? ['toolbox', t('panel.toolbox')] : ['outline', t('panel.outline')]);

function renderLeft() {
  const panel = root.querySelector('#left-panel');
  if (!state.project || state.showStart) { panel.innerHTML = ''; return; }
  const [glyph, title] = leftInfo();
  if (!state.settings.showLeftPanel) { panel.innerHTML = panelRail('leftPanel', 'panelLeftOpen', glyph, title, 'panel.expandLeft'); return; }
  const body = state.tab === 'project' ? toolboxHtml(ctx) : state.tab === 'model' ? outlineHtml(ctx) : state.tab === 'data' ? `<div class="sd-help pad">${icon('material', 'icon tiny')}${escapeHtml(t('data.leftHelp'))}</div>` : `<div class="sd-help pad">${icon('simDoe', 'icon tiny')}${escapeHtml(t('study.leftHelp'))}</div>`;
  const scroll = panel.querySelector('.lp-body')?.scrollTop ?? 0;
  panel.innerHTML = `${panelHead(glyph, title, 'leftPanel', 'panelLeftClose', 'panel.collapseLeft')}<div class="lp-body" data-panel="left">${body}</div>`;
  panel.querySelector('.lp-body').scrollTop = scroll;
}

/** The right panel: the properties and settings of what is selected. */
function renderRight() {
  const panel = root.querySelector('#right-panel');
  if (!panel) return;
  if (!state.project || state.showStart) { panel.innerHTML = ''; return; }
  const title = t('panel.properties');
  if (!state.settings.showRightPanel) { panel.innerHTML = panelRail('rightPanel', 'panelRightOpen', 'details', title, 'panel.expandRight'); return; }
  const body = state.tab === 'model' || state.tab === 'project' ? detailsHtml(ctx) : state.tab === 'data' ? `<div class="sd-help pad">${icon('material', 'icon tiny')}${escapeHtml(t('data.help'))}</div>` : `<div class="sd-help pad">${icon('simDoe', 'icon tiny')}${escapeHtml(t('study.leftHelp'))}</div>`;
  const scroll = panel.querySelector('.lp-body')?.scrollTop ?? 0;
  panel.innerHTML = `${panelHead('details', title, 'rightPanel', 'panelRightClose', 'panel.collapseRight')}<div class="lp-body rp-body" data-panel="right">${body}</div>`;
  panel.querySelector('.lp-body').scrollTop = scroll;
}

function renderTab() {
  const host = root.querySelector('#tab-host');
  const viewHost = root.querySelector('#view-host');
  const onStart = state.showStart || !state.project;
  viewHost.hidden = onStart || state.tab !== 'model';
  host.hidden = onStart || state.tab === 'model';
  if (host.hidden) host.innerHTML = '';
  else if (state.tab === 'project') host.innerHTML = schematicHtml(ctx);
  else if (state.tab === 'data') host.innerHTML = dataTabHtml(ctx);
  else if (state.tab === 'study') host.innerHTML = studyTabHtml(ctx);
  if (!viewHost.hidden) {
    model.ensureView(viewHost);
    if (!model.shown) model.showSetup();
    model.view?.resize();
    model.refreshSetupMesh();
  }
}

function renderBottom() {
  const host = root.querySelector('#bottom-panel');
  if (!state.project || state.showStart) { host.innerHTML = ''; return; }
  const sys = activeSystem();
  const charts = chartsOf(sys, sys?.result);
  const tabs = [['messages', 'info', t('bottom.messages'), state.log.length], ['graph', 'chartLine', t('bottom.graph'), charts.length], ['table', 'table', t('bottom.table'), null]];
  if (!state.settings.showBottomPanel) {
    host.innerHTML = `<div class="problems-header bottom-rail"><span class="bp-title">${icon('outputPanel')}<b>${escapeHtml(t('panel.output'))}</b></span>${tabs.map(([id, g, label]) => `<button class="small-button flat" data-bottom-show="${id}">${icon(g)}<span>${escapeHtml(label)}</span></button>`).join('')}<span class="grow"></span><button class="icon-button rail-button expand" data-command="bottomPanel" title="${escapeHtml(t('panel.expandBottom'))}" aria-label="${escapeHtml(t('panel.expandBottom'))}">${icon('panelBottomOpen')}</button></div>`;
    return;
  }
  let body = '';
  let tools = '';
  if (state.bottomTab === 'messages') {
    tools = `<span class="grow"></span><button class="small-button danger" data-bottom-clear ${state.log.length ? '' : 'disabled'}>${icon('clearHistory')}<span>${escapeHtml(t('action.clearMessages'))}</span></button>`;
    body = state.log.length ? state.log.map((e) => `<div class="problem-row bottom-row ${e.kind}" title="${escapeHtml(e.detail || e.text)}"><span class="cell sev">${icon({ error: 'error', warning: 'warning', success: 'check' }[e.kind] ?? 'info')}</span><span class="cell">${escapeHtml(e.text)}</span><span class="cell muted">${escapeHtml(e.at.toLocaleTimeString(lang() === 'en' ? 'en-US' : 'ko-KR'))}</span></div>`).join('') : `<p class="problems-empty">${icon('info')}<span>${escapeHtml(t('bottom.noMessages'))}</span></p>`;
  } else if (state.bottomTab === 'graph') {
    if (!charts.length) body = `<p class="problems-empty">${icon('chartLine')}<span>${escapeHtml(t('bottom.noGraph'))}</span></p>`;
    else {
      const i = Math.min(state.chartIndex, charts.length - 1);
      tools = `<span class="segmented">${charts.map((c, k) => `<button class="segment ${k === i ? 'active' : ''}" data-chart="${k}">${escapeHtml(t(c.titleKey))}</button>`).join('')}</span>`;
      body = `<div class="bottom-chart">${lineChart(charts[i], { t, units: units(), width: 900, height: Math.max(160, (state.settings.bottomHeight ?? 170) - 50) })}</div>`;
    }
  } else {
    body = tableHtml(sys);
  }
  host.innerHTML = `<div class="problems-header" data-panel-head><span class="bp-title">${icon('outputPanel')}<b>${escapeHtml(t('panel.output'))}</b></span><span class="segmented">${tabs.map(([id, g, label, n]) => `<button class="segment ${state.bottomTab === id ? 'active' : ''}" data-bottom-tab="${id}">${icon(g)}<span>${escapeHtml(label)}</span>${n !== null && n !== undefined ? `<i class="bottom-count">${n}</i>` : ''}</button>`).join('')}</span>${tools}<button class="icon-button" data-command="bottomPanel" title="${escapeHtml(t('panel.collapseBottom'))}">${icon('panelBottomClose')}</button></div><div class="problems-list bottom-${state.bottomTab}" data-panel="bottom">${body}</div>`;
}

function tableHtml(sys) {
  const r = sys?.result;
  const us = units();
  if (!r) return `<p class="problems-empty">${icon('table')}<span>${escapeHtml(t('bottom.noTable'))}</span></p>`;
  const tbl = (head, rows) => `<table class="data-table"><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const parts = [];
  if (r.modes?.length && r.modes[0].frequency !== undefined) parts.push(tbl([t('col.mode'), `${t('res.frequency')} (Hz)`, ...(r.modes[0].effectiveMass ? ['Mx', 'My', 'Mz', 'ΣMx', 'ΣMy', 'ΣMz'] : [])], r.modes.map((m) => [m.mode, fmt(m.frequency, 5), ...(m.effectiveMass ? [...m.effectiveMass.map((v) => fmt(v, 3)), ...m.cumulative.map((v) => `${fmt(100 * v, 3)} %`)] : [])])));
  if (r.modes?.length && r.modes[0].factor !== undefined) parts.push(tbl([t('col.mode'), t('res.loadFactor')], r.modes.map((m) => [m.mode, m.factor === null ? '—' : fmt(m.factor, 5)])));
  if (r.reactions?.length) parts.push(tbl([t('col.support'), `Fx (${unitLabel('force', us)})`, `Fy`, `Fz`, `|F|`], r.reactions.map((x, i) => { const bc = sys.bcs.find((b) => b.id === x.id); return [bc?.name || t(`bc.${bc?.type ?? 'fixed'}`) || `#${i + 1}`, ...x.force.map((v) => fmt(v)), fmt(Math.hypot(...x.force))]; })));
  if (r.heatBalance?.length) parts.push(tbl([t('col.condition'), `${t('col.heatOut')} (W)`], r.heatBalance.map((x) => { const bc = sys.bcs.find((b) => b.id === x.id); return [bc?.name || t(`bc.${x.type}`), fmt(x.heatOut)]; })));
  if (r.fluid?.forces?.length) parts.push(tbl([t('col.body'), `${t('out.drag')} (N)`, `${t('out.lift')} (N)`, 'Cd', 'Cl', `${t('col.heat')} (W)`], r.fluid.forces.map((f) => [state.project.bodies.find((b) => b.id === f.body)?.name ?? f.body, fmt(f.drag), fmt(f.lift), fmt(f.cd, 3), fmt(f.cl, 3), fmt(f.heat)])));
  if (r.magnetic?.forces?.length) parts.push(tbl([t('col.body'), 'Fx (N)', 'Fy (N)', 'Fz (N)'], r.magnetic.forces.map((f) => [state.project.bodies.find((b) => b.id === f.body)?.name ?? f.body, ...f.force.map((v) => fmt(v))])));
  if (r.electric?.terminals?.length) parts.push(tbl([t('col.terminal'), 'V', 'A'], r.electric.terminals.map((x) => { const bc = sys.bcs.find((b) => b.id === x.id); return [bc?.name || t('bc.voltage'), fmt(x.voltage), fmt(x.current)]; })));
  const outs = Object.entries(outputsOf(sys, r));
  if (outs.length) parts.push(tbl([t('col.quantity'), t('col.value')], outs.map(([k, v]) => [t(`out.${k}`), `${fmt(toDisplay(OUTPUT_KINDS[k] ?? 'ratio', v, us))} ${unitLabel(OUTPUT_KINDS[k] ?? 'ratio', us)}`])));
  return `<div class="bottom-tables">${parts.join('')}</div>`;
}

const renderStatusThrottled = frameThrottle(() => renderStatus());
function renderStatus() {
  const bar = root.querySelector('#statusbar');
  if (!bar) return;
  const n = state.notice;
  const items = [`<span class="status-notice ${n?.kind ?? 'hint'}" title="${escapeHtml(n?.text ?? '')}">${icon(n?.kind === 'error' ? 'error' : n?.kind === 'success' ? 'check' : 'info')}<span>${escapeHtml(n?.text ?? (state.tab === 'model' && state.sel.kind === 'bc' ? t('help.pickFaces') : t('status.ready')))}</span></span>`];
  if (state.solving) items.push(`<span class="status-item solving">${icon('hourglass')}<span>${escapeHtml(t(state.solving.key, null, state.solving.key))} ${Math.round(state.solving.fraction * 100)}%</span><span class="status-progress"><i style="width:${Math.round(state.solving.fraction * 100)}%"></i></span></span>`);
  const sys = activeSystem();
  if (state.project && !state.showStart) {
    if (sys) items.push(`<span class="status-item">${icon(SYSTEMS[sys.type].icon)}<span>${escapeHtml(sys.name || t(`sys.${sys.type}`))} · ${escapeHtml(t(`status.sys.${sys.status}`))}</span></span>`);
    const m = sys?.result?.mesh ?? state.setupMesh?.info;
    if (m) items.push(`<span class="status-item" title="${escapeHtml(t('mesh.statistics'))}">${icon('mesh')}<span>${m.nodes.toLocaleString()} ${escapeHtml(t('mesh.nodesShort'))} · ${m.elements.toLocaleString()} ${escapeHtml(t('mesh.elementsShort'))}</span></span>`);
    if (state.probe) items.push(`<span class="status-item probe">${icon('cursor')}<span>${fmt(toDisplay(state.probe.kind, state.probe.value, units()))} ${escapeHtml(unitLabel(state.probe.kind, units()))}</span></span>`);
    items.push(`<button class="status-item" data-command="units" title="${escapeHtml(t('settings.unitSystem'))}">${icon('units')}<span>${units() === 'mm' ? 'mm · N · MPa' : 'm · N · Pa'}</span></button>`);
  }
  items.push(`<span class="status-item solver" title="${escapeHtml(t('status.solver'))}">${icon('chip')}<span>${escapeHtml(desktop ? t('status.native') : t('status.wasm'))}</span></span>`);
  items.push(`<span class="status-item">${icon('palette')}<span>${escapeHtml(themeName(state.settings.theme, getLanguage()))}</span></span>`);
  items.push(`<button class="status-item status-lang" data-command="language"><span class="flag-slot">${flagFor(getLanguage())}</span><span>${escapeHtml(t('status.language'))}</span></button>`);
  if (state.settings.statusClock) items.push(`<span class="status-item clock">${icon('clock')}<span>${new Date().toLocaleTimeString(lang() === 'en' ? 'en-US' : 'ko-KR', { hour: '2-digit', minute: '2-digit' })}</span></span>`);
  bar.innerHTML = items.join('');
}

function renderSome(parts) {
  for (const p of parts) {
    if (p === 'outline' || p === 'left') renderLeft();
    else if (p === 'details' || p === 'right') renderRight();
    else if (p === 'schematic' || p === 'tab') { if (state.tab !== 'model') renderTab(); }
    else if (p === 'status') renderStatus();
    else if (p === 'toolbar') renderToolbarState();
    else if (p === 'ribbon') renderRibbon();
    else if (p === 'bottom') renderBottom();
  }
}

function renderAll() {
  root.classList.toggle('no-status', !state.settings.showStatusBar);
  root.classList.toggle('no-left', !state.settings.showLeftPanel);
  root.classList.toggle('no-right', !state.settings.showRightPanel);
  root.classList.toggle('no-bottom', !state.settings.showBottomPanel);
  const onStart = state.showStart || !state.project;
  root.classList.toggle('on-start', onStart);
  root.style.setProperty('--bottom-height', `${state.settings.bottomHeight}px`);
  root.style.setProperty('--left-width', `${Math.max(240, state.settings.leftWidth)}px`);
  root.style.setProperty('--right-width', `${Math.max(300, state.settings.rightWidth)}px`);
  root.style.setProperty('--zoom', String(state.settings.zoom / 100));
  renderMenubar();
  renderToolbar();
  renderWsTabs();
  renderRibbon();
  renderLeft();
  renderRight();
  renderTab();
  renderBottom();
  renderStatus();
  const start = root.querySelector('#start-page');
  start.hidden = !onStart;
  if (onStart) renderStartPage(); else { startCards?.destroy(); startCards = null; startBackground?.stop(); start.innerHTML = ''; }
}

function setTab(tab) {
  state.tab = tab;
  if (tab !== 'model') model.stopAnimation();
  renderAll();
  if (tab === 'model' && state.sel.kind === 'result') select(state.sel);
}

function showStartPage(show = true) {
  state.showStart = show || !state.project;
  model.stopAnimation();
  renderAll();
}

// ───────────────────────── start page

let startCards = null;
let startBackground = null;
const panelApi = { state, commands, commandTip, commandEnabled, t, settings: () => state.settings, version: () => state.info?.version ?? VERSION };

function renderStartPage() {
  const host = root.querySelector('#start-page');
  const scroll = host.querySelector('.start-scroll')?.scrollTop ?? 0;
  startCards?.destroy();
  host.innerHTML = startPageHtml(panelApi);
  startCards = startBoard(host.querySelector('.start-board'), { saved: state.settings.startLayout, reduced: Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches), onSave: (layout) => { state.settings.startLayout = layout; storeSettings(globalThis.localStorage, state.settings); } });
  host.querySelector('.start-scroll').scrollTop = scroll;
  const canvas = host.querySelector('.start-bg');
  startBackground?.destroy?.();
  const theme = resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme);
  startBackground = new AnimatedBackground(canvas, { colors: () => ({ bg: theme.colors.bg, accent: theme.colors.accent, text: theme.colors.text, dark: theme.dark, danger: '#e5484d' }), speed: () => state.settings.animationSpeed / 100, kind: state.settings.animation, vivid: true });
  if (state.settings.backgroundKind === 'animated') startBackground.start(); else startBackground.draw();
}

async function onStartAction(target) {
  const v = target.dataset.value;
  switch (target.dataset.start) {
    case 'new': return newProject();
    case 'new-system': { if (!state.project || state.showStart) { if (!(await confirmReplace())) return undefined; state.untitled += 1; await setProject(createProject(t('new.projectName', { n: state.untitled }))); } addSystemOf(v); return setTab('project'); }
    case 'open': return openWithDialog();
    case 'import': return importStl();
    case 'open-recent': return openRecent(v);
    case 'remove-recent': state.recent = removeRecent(state.recent, v); storeRecent(globalThis.localStorage, state.recent); return renderStartPage();
    case 'clear-recent': state.recent = []; storeRecent(globalThis.localStorage, []); return renderStartPage();
    case 'sample': return openSample(v);
    case 'continue': return v ? openRecent(v) : openWithDialog();
    case 'back': return state.project ? showStartPage(false) : undefined;
    case 'arrange': return startCards?.arrange();
    case 'settings': return run('settings');
    case 'start-settings': return popups.open('settings', { tab: 'start' });
    case 'about': return run('about');
    case 'exit': return run('exit');
    case 'guide': return openDocWindow('guide');
    case 'tutorial': return openDocWindow('tutorial');
    case 'shortcuts': return showShortcuts();
    case 'animation': return updateSettings({ animation: v, backgroundKind: 'animated' });
    case 'shuffle': { const next = ANIMATIONS[Math.floor(Math.random() * ANIMATIONS.length)]; return updateSettings({ animation: next, backgroundKind: 'animated' }); }
    default: return undefined;
  }
}

// ───────────────────────── settings

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
  document.documentElement.classList.toggle('dark', Boolean(theme.dark));
  if (s.language !== getLanguage()) { setLanguage(s.language); native.setBackendLanguage(s.language); }
  if (s.theme !== previous.theme || s.customTheme !== previous.customTheme) model.applyTheme();
  if (['colormap', 'contourBands', 'deformScale', 'unitSystem', 'showMaxMin', 'showUndeformed', 'sliceOpacity'].some((k) => s[k] !== previous[k])) model.rescale();
  renderAll();
}

// ───────────────────────── field edits from the panels

function onFieldStep(key, displayValue) {
  const [mode, kind, path] = key.split('|');
  if (path.startsWith('study.')) return change('op.edit', (p) => pathSet(p, path, Number(displayValue)), { keepResults: true });
  const si = mode === 'm' ? Number(displayValue) : toSI(kind, Number(displayValue), units());
  const geometry = path.startsWith('bodies.');
  const keep = path.startsWith('parameters.') || path.startsWith('study.');
  change('op.edit', (p) => pathSet(p, path, path.endsWith('.levels') || kind === 'count' ? Math.round(si) : si), { geometry, keepResults: keep });
}

function onSelect(path, value) {
  if (path === '$units') return updateSettings({ unitSystem: value });
  if (path === '$deform') return updateSettings({ deformScale: value });
  if (path === '$colormap') return updateSettings({ colormap: value });
  if (path === '$bands') return updateSettings({ contourBands: Number(value) });
  if (path === '$addParam') return value ? addParameter(value) : undefined;
  const numeric = /\.order$/.test(path);
  return change('op.edit', (p) => { pathSet(p, path, numeric ? Number(value) : value); if (/\.material$/.test(path)) ensureMaterial(p, value); }, { geometry: path.startsWith('bodies.'), keepResults: path.startsWith('study.') });
}

function onToggle(path, on) {
  if (path.endsWith('#on')) {
    const real = path.slice(0, -3);
    return change('op.edit', (p) => pathSet(p, real, on ? 0 : null));
  }
  return change('op.edit', (p) => pathSet(p, path, on), { geometry: path.startsWith('bodies.') && path.endsWith('.suppressed') });
}

function onText(path, value) {
  if (path === 'name') return change('op.rename', (p) => { p.name = value; }, { keepResults: true });
  return change('op.rename', (p) => pathSet(p, path, value), { keepResults: true });
}

function onCell(spec, value) {
  const [path, i, c, kind] = spec.split('|');
  const v = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(v)) return renderLeft();
  return change('op.edit', (p) => { const rows = pathGet(p, path); if (rows?.[Number(i)]) rows[Number(i)][Number(c)] = toSI(kind, v, units()); });
}

// ───────────────────────── context menus (each panel its own)

let rightDown = null;

/** A menu at the pointer: items made of command ids ('-' separators, sub(...) submenus) and custom entries. */
function contextMenu(event, entries, header = null) {
  const handlers = {};
  const items = [];
  for (const e of entries) {
    if (e === '-') { if (items.length && !items.at(-1).separator) items.push({ separator: true }); continue; }
    if (typeof e === 'string' || e?.sub) { items.push(...menuItems([e])); continue; }
    const id = `custom:${e.id}`;
    handlers[id] = e.run;
    items.push({ id, label: e.label, icon: e.icon, disabled: Boolean(e.disabled), checked: e.checked, children: e.children });
    for (const c of e.children ?? []) if (c.run) { handlers[c.id] = c.run; }
  }
  while (items.at(-1)?.separator) items.pop();
  return showMenu(items, anchorAt(event), 'context', { handlers, header });
}

async function renameItem(current, apply) {
  const r = await popups.open('prompt', { title: t('cmd.rename'), value: current ?? '', icon: 'rename' });
  if (r?.value !== undefined && r.value !== null) change('op.rename', () => apply(String(r.value)), { keepResults: true });
}

const collapse = (side) => ({ id: `collapse-${side}`, label: t(`panel.collapse${side}`), icon: `panel${side}Close`, run: () => run(`${side.toLowerCase()}Panel`) });

function materialChildren(body) {
  const p = state.project;
  const list = [...p.materials, ...MATERIALS.filter((m) => !p.materials.some((x) => x.id === m.id))];
  return list.map((m) => ({ id: `custom:mat:${m.id}`, label: materialName(m, lang()), icon: 'material', checked: body.material === m.id, run: () => change('op.edit', (pr) => { ensureMaterial(pr, m.id); pr.bodies.find((b) => b.id === body.id).material = m.id; }, { keepResults: false }) }));
}

function outlineMenu(event, kind, id) {
  const p = state.project;
  const sys = activeSystem();
  select({ kind, id });
  let entries = [];
  switch (kind) {
    case 'project': entries = [{ id: 'rename', label: t('cmd.rename'), icon: 'rename', run: () => renameItem(p.name, (v) => { p.name = v; }) }, '-', 'solveAll', sub('newSystem'), sub('newGeometry'), '-', 'units', 'save']; break;
    case 'geometry': entries = [sub('newGeometry'), 'importStl', '-', { id: 'showAll', label: t('ctx.showAllBodies'), icon: 'eye', run: () => { for (const b of p.bodies) b.hidden = false; model.paintSetup(); model.rescale(); renderLeft(); } }]; break;
    case 'body': {
      const b = p.bodies.find((x) => x.id === id);
      if (!b) return undefined;
      entries = [
        { id: 'rename', label: t('cmd.rename'), icon: 'rename', run: () => renameItem(b.name, (v) => { p.bodies.find((x) => x.id === id).name = v; }) },
        { id: 'material', label: t('details.material'), icon: 'material', children: materialChildren(b) },
        '-',
        { id: 'hide', label: t(b.hidden ? 'action.showBody' : 'action.hideBody'), icon: b.hidden ? 'eye' : 'eyeOff', run: () => { b.hidden = !b.hidden; model.paintSetup(); model.rescale(); renderLeft(); } },
        { id: 'isolate', label: t('ctx.isolateBody'), icon: 'eye', run: () => { for (const x of p.bodies) x.hidden = x.id !== id; model.paintSetup(); model.rescale(); renderLeft(); } },
        { id: 'suppress', label: t(b.suppressed ? 'ctx.unsuppress' : 'ctx.suppress'), icon: 'suppress', run: () => change('op.edit', (pr) => { const x = pr.bodies.find((y) => y.id === id); x.suppressed = !x.suppressed; }, { geometry: true }) },
        '-', 'duplicateBody', 'deleteSelection',
      ];
      break;
    }
    case 'materials': entries = ['tabData']; break;
    case 'system': case 'settings': case 'solution': {
      const s = systemById(id);
      if (!s) return undefined;
      entries = ['solve', 'generateMesh', ...(kind === 'solution' && s.result ? ['-', 'exportCsv', 'print', 'exportReport'] : []), '-',
        ...(FOLLOW_UPS[s.type] ?? []).map((f) => ({ id: `follow-${f}`, label: t('cmd.followUp', { name: t(`sys.${f}`) }), icon: SYSTEMS[f].icon, run: () => addSystemOf(f, s.id) })), '-',
        { id: 'rename', label: t('cmd.rename'), icon: 'rename', run: () => renameItem(s.name || t(`sys.${s.type}`), (v) => { p.systems.find((x) => x.id === id).name = v; }) },
        { id: 'delete', label: t('cmd.delete'), icon: 'trash', run: () => { state.sel = { kind: 'system', id }; deleteSelection(); } }];
      break;
    }
    case 'mesh': entries = ['generateMesh', 'style:mesh', 'style:shadedEdges']; break;
    case 'enclosure': { const s = systemById(id); entries = [{ id: 'encl', label: t('enclosure.enabled'), icon: 'enclosure', checked: Boolean(s?.enclosure.enabled), run: () => change('op.edit', () => { s.enclosure.enabled = !s.enclosure.enabled; }) }]; break; }
    case 'contacts': entries = ['addContact', 'autoContacts']; break;
    case 'contact': {
      const c = sys?.contacts.find((x) => x.id === id);
      if (!c) return undefined;
      entries = [{ id: 'type', label: t('contact.type'), icon: 'simContact', children: ['bonded', 'noSeparation', 'frictionless', 'rough', 'frictional'].map((k) => ({ id: `custom:ct:${k}`, label: t(`opt.${k}`), icon: 'simContact', checked: c.type === k, run: () => change('op.edit', () => { c.type = k; }) })) },
        { id: 'suppress', label: t(c.suppressed ? 'ctx.unsuppress' : 'ctx.suppress'), icon: 'suppress', run: () => change('op.edit', () => { c.suppressed = !c.suppressed; }) }, '-', 'deleteSelection'];
      break;
    }
    case 'bc': {
      const bc = sys?.bcs.find((x) => x.id === id);
      if (!bc) return undefined;
      entries = [
        { id: 'rename', label: t('cmd.rename'), icon: 'rename', run: () => renameItem(bc.name || t(`bc.${bc.type}`), (v) => { bc.name = v; }) },
        { id: 'suppress', label: t(bc.suppressed ? 'ctx.unsuppress' : 'ctx.suppress'), icon: 'suppress', run: () => change('op.edit', () => { bc.suppressed = !bc.suppressed; }) },
        { id: 'duplicate', label: t('ctx.duplicateBc'), icon: 'copy', run: () => change('op.addBc', () => { sys.bcs.push({ ...structuredClone(bc), id: newId('c'), name: '' }); }) },
        ...(BCS[bc.type].target.includes('faces') ? ['clearFaces'] : []),
        '-', 'deleteSelection',
      ];
      break;
    }
    case 'result': {
      entries = ['animate', 'showMaxMin', 'showUndeformed', '-', 'exportCsv', 'exportImage', ...(activeSystem()?.result?.topology ? ['exportStl'] : []), 'print'];
      break;
    }
    default: break;
  }
  return contextMenu(event, [...entries, '-', collapse('Left')]);
}

function toolboxMenu(event, type) {
  const sys = activeSystem();
  return contextMenu(event, [
    { id: 'add', label: t('ctx.addSystem', { name: t(`sys.${type}`) }), icon: SYSTEMS[type].icon, run: () => addSystemOf(type) },
    { id: 'addLinked', label: t('cmd.followUp', { name: t(`sys.${type}`) }), icon: 'simSystems', disabled: !sys, run: () => addSystemOf(type, sys.id) },
    '-', collapse('Left'),
  ]);
}

function rightPanelMenu(event) {
  const entries = ['undo', 'redo', '-'];
  if (['body', 'bc', 'contact', 'system'].includes(state.sel.kind)) entries.push('deleteSelection');
  if (state.sel.kind === 'body') entries.push('duplicateBody');
  if (['system', 'settings', 'solution', 'mesh'].includes(state.sel.kind)) entries.push('solve', 'generateMesh');
  if (state.sel.kind === 'result') entries.push('animate', 'exportCsv', 'exportImage');
  entries.push('-', 'units', collapse('Right'));
  return contextMenu(event, entries);
}

function bottomPanelMenu(event) {
  const row = event.target.closest('.problem-row');
  const sys = activeSystem();
  const entries = [];
  if (state.bottomTab === 'messages') {
    const i = row ? [...row.parentElement.querySelectorAll('.problem-row')].indexOf(row) : -1;
    const entry = i >= 0 ? state.log[i] : null;
    entries.push(
      { id: 'copy', label: t('ctx.copyMessage'), icon: 'copy', disabled: !entry, run: () => copyText(`${entry.text}${entry.detail ? `\n${entry.detail}` : ''}`) },
      { id: 'copyAll', label: t('ctx.copyAll'), icon: 'copy', disabled: !state.log.length, run: () => copyText(state.log.map((e) => `${e.at.toLocaleTimeString()}  ${e.kind}  ${e.text}`).join('\n')) },
      { id: 'clear', label: t('action.clearMessages'), icon: 'clearHistory', disabled: !state.log.length, run: () => { state.log = []; renderBottom(); } },
    );
  } else if (state.bottomTab === 'graph') {
    const charts = chartsOf(sys, sys?.result);
    const c = charts[Math.min(state.chartIndex, charts.length - 1)];
    entries.push(
      { id: 'svg', label: t('ctx.saveChart'), icon: 'exportImage', disabled: !c, run: () => saveExport(`${safeName()}-${c.id}.svg`, 'svg', lineChart(c, { t, units: units(), width: 900, height: 360 }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '), 'image/svg+xml') },
      { id: 'copyData', label: t('ctx.copyData'), icon: 'copy', disabled: !c, run: () => copyText([[t(`axis.${c.x}`), ...c.series.map((x) => x.name)].join('\t'), ...Array.from(c.series[0].x, (x, k) => [x, ...c.series.map((s) => s.y[k])].join('\t'))].join('\n')) },
      'exportCsv',
    );
  } else {
    entries.push({ id: 'copyTable', label: t('ctx.copyTable'), icon: 'copy', disabled: !root.querySelector('.bottom-tables table'), run: () => copyText([...root.querySelectorAll('.bottom-tables table')].map((tb) => [...tb.rows].map((r) => [...r.cells].map((c) => c.textContent.trim()).join('\t')).join('\n')).join('\n\n')) }, 'exportCsv');
  }
  entries.push('-', { id: 'collapse', label: t('panel.collapseBottom'), icon: 'panelBottomClose', run: () => run('bottomPanel') });
  return contextMenu(event, entries);
}

function viewMenu(event) {
  const hit = model.view?.pickAt(event);
  const result = model.shown?.kind === 'result';
  const entries = [];
  if (result) entries.push('animate', 'showMaxMin', 'showUndeformed', '-', 'exportCsv', 'exportImage', '-');
  else if (hit) {
    const b = state.project.bodies.find((x) => x.id === hit.body);
    const sel = state.sel;
    const bc = sel.kind === 'bc' ? activeSystem()?.bcs.find((x) => x.id === sel.id) : null;
    if (bc && BCS[bc.type].target.includes('faces')) {
      const has = bc.faces.some((f) => model.faceOf(f, state.setupMesh?.info) === hit.face);
      entries.push({ id: 'face', label: t(has ? 'ctx.removeFace' : 'ctx.addFace', { name: bc.name || t(`bc.${bc.type}`) }), icon: 'cursor', run: () => facePicked({ face: hit.face, body: hit.body, sig: model.sigOf(hit.face, state.setupMesh?.info) }) });
    }
    if (b) {
      entries.push({ id: 'selectBody', label: t('ctx.selectBody', { name: b.name }), icon: 'body', run: () => select({ kind: 'body', id: b.id }) });
      entries.push({ id: 'hide', label: t('action.hideBody'), icon: 'eyeOff', run: () => { b.hidden = true; model.paintSetup(); renderLeft(); } });
    }
    const sys = activeSystem();
    if (sys) entries.push({ id: 'bcs', label: t('ctx.addCondition'), icon: 'bcForce', children: SYSTEMS[sys.type].bcs.filter((k) => BCS[k].target !== 'none').map((k) => ({ id: `custom:bcAt:${k}`, label: t(`bc.${k}`), icon: BCS[k].icon, run: () => { addCondition(k); const nb = activeSystem().bcs.at(-1); if (BCS[k].target.includes('faces')) facePicked({ face: hit.face, body: hit.body, sig: model.sigOf(hit.face, state.setupMesh?.info) }); else if (BCS[k].target === 'bodies') change('op.pickBody', () => { nb.bodies = [hit.body]; }); } })) });
    entries.push('-');
  }
  entries.push(sub('views'), 'zoomFit', 'perspective', sub('styles'));
  if (state.project.bodies.some((b) => b.hidden)) entries.push({ id: 'showAll', label: t('ctx.showAllBodies'), icon: 'eye', run: () => { for (const b of state.project.bodies) b.hidden = false; model.paintSetup(); model.rescale(); renderLeft(); } });
  entries.push('-', 'solve');
  return contextMenu(event, entries);
}

function schematicMenu(event) {
  return contextMenu(event, [sub('newSystem'), 'solveAll', '-', 'tabModel', 'tabData', 'tabStudy']);
}

function copyText(text) {
  native.clipboardWrite(text).then(() => notify('success', t('notice.copiedText'))).catch((error) => showError('error.unexpected', error));
}

function onContextMenu(event) {
  const target = event.target;
  if (target.closest('input, textarea, select')) return undefined;
  event.preventDefault();
  if (!state.project || state.showStart) return undefined;
  const block = target.closest('.sys-block');
  if (block) return systemMenu(block.dataset.system, anchorAt(event));
  const row = target.closest('[data-sel]');
  if (row) { const [kind, ...rest] = row.dataset.sel.split(':'); return outlineMenu(event, kind, rest.join(':') || null); }
  const tool = target.closest('[data-add-system]');
  if (tool) return toolboxMenu(event, tool.dataset.addSystem);
  if (target.closest('#left-panel')) return contextMenu(event, state.tab === 'project' ? [sub('newSystem'), '-', collapse('Left')] : [sub('newGeometry'), sub('newSystem'), '-', collapse('Left')]);
  if (target.closest('#right-panel')) return rightPanelMenu(event);
  if (target.closest('#bottom-panel')) return bottomPanelMenu(event);
  if (target.closest('#view-host')) {
    // A right drag pans the view: only a right click without moving opens the menu.
    if (rightDown && Math.hypot(event.clientX - rightDown.x, event.clientY - rightDown.y) > 4) return undefined;
    return viewMenu(event);
  }
  if (target.closest('.schematic')) return schematicMenu(event);
  return undefined;
}

// ───────────────────────── events

function bindEvents() {
  bindSteppers(root, (key, value) => onFieldStep(key, value));
  root.addEventListener('click', (event) => {
    const target = event.target;
    const menu = target.closest('[data-menu]');
    if (menu) return openMenubarMenu(menu.dataset.menu);
    if (target.closest('[data-home]')) return showStartPage(!state.showStart);
    const start = target.closest('[data-start]');
    if (start && !start.disabled) return onStartAction(start);
    const win = target.closest('[data-window]');
    if (win && desktop) { const id = win.dataset.window; if (id === 'minimize') appWindow.minimize(); else if (id === 'maximize') appWindow.toggleMaximize(); else appWindow.close(); return undefined; }
    const wsTab = target.closest('[data-ws-tab]');
    if (wsTab) return setTab(wsTab.dataset.wsTab);
    const cmTab = target.closest('[data-cm-tab]');
    if (cmTab) { state.cmTab = cmTab.dataset.cmTab; return renderRibbon(); }
    const eye = target.closest('[data-eye]');
    if (eye) { event.stopPropagation(); const b = state.project.bodies.find((x) => x.id === eye.dataset.eye); if (b) { b.hidden = !b.hidden; model.paintSetup(); if (model.shown?.kind === 'result') model.rescale(); renderLeft(); } return undefined; }
    const selRow = target.closest('[data-sel]');
    if (selRow) {
      const [kind, ...rest] = selRow.dataset.sel.split(':');
      return select({ kind, id: rest.join(':') || null });
    }
    const addSys = target.closest('[data-add-system]');
    if (addSys) return addSystemOf(addSys.dataset.addSystem);
    const sysMenu = target.closest('[data-system-menu]');
    if (sysMenu) { event.stopPropagation(); return systemMenu(sysMenu.dataset.systemMenu, anchorBelow(sysMenu)); }
    const cell = target.closest('.sys-cell');
    if (cell) {
      const sid = cell.dataset.system;
      activate(sid);
      const c = cell.dataset.cell;
      if (c === 'engineeringData') return setTab('data');
      state.tab = 'model';
      if (c === 'geometry') state.sel = { kind: 'geometry' };
      else if (c === 'model') state.sel = { kind: 'mesh', id: sid };
      else if (c === 'setup') state.sel = { kind: 'settings', id: sid };
      else if (c === 'solution') { state.sel = { kind: 'solution', id: sid }; if (systemById(sid).status !== 'solved') solve(systemById(sid)).catch(() => {}); }
      else if (c === 'results') { const s = systemById(sid); const items = resultItems(s, s.result); state.sel = items.length ? { kind: 'result', id: `${sid}:${items[0].key}` } : { kind: 'solution', id: sid }; }
      renderAll();
      return select(state.sel);
    }
    const block = target.closest('.sys-block');
    if (block) { activate(block.dataset.system); state.sel = { kind: 'system', id: block.dataset.system }; return renderAll(); }
    const follow = target.closest('[data-follow]');
    if (follow) return addSystemOf(follow.dataset.follow, activeSystem()?.id);
    const command = target.closest('[data-command]');
    if (command && !command.disabled && command.tagName !== 'INPUT') {
      const id = command.dataset.command;
      const anchored = ['newMenu', 'themeMenu', 'viewsMenu', 'openExample'].includes(id);
      return run(id, { anchor: anchored ? anchorBelow(command.closest('.split-button') ?? command) : undefined });
    }
    const bottomTab = target.closest('[data-bottom-tab]');
    if (bottomTab) { state.bottomTab = bottomTab.dataset.bottomTab; return renderBottom(); }
    const bottomShow = target.closest('[data-bottom-show]');
    if (bottomShow) { state.bottomTab = bottomShow.dataset.bottomShow; return updateSettings({ showBottomPanel: true }); }
    if (target.closest('[data-bottom-clear]')) { state.log = []; return renderBottom(); }
    const chart = target.closest('[data-chart]');
    if (chart) { state.chartIndex = Number(chart.dataset.chart); return renderBottom(); }
    const mat = target.closest('[data-mat]');
    if (mat) { state.dataSel = mat.dataset.mat; return renderTab(); }
    const addMat = target.closest('[data-add-mat]');
    if (addMat) { change('op.addMaterial', (p) => ensureMaterial(p, addMat.dataset.addMat), { keepResults: true }); state.dataSel = addMat.dataset.addMat; return renderTab(); }
    const matDel = target.closest('[data-mat-del]');
    if (matDel) return change('op.delete', (p) => { p.materials = p.materials.filter((m) => m.id !== matDel.dataset.matDel); state.dataSel = null; });
    const matReset = target.closest('[data-mat-reset]');
    if (matReset) return change('op.edit', (p) => { const lib = MATERIALS.find((m) => m.id === matReset.dataset.matReset); const i = p.materials.findIndex((m) => m.id === matReset.dataset.matReset); if (lib && i >= 0) p.materials[i] = structuredClone(lib); });
    const paramDel = target.closest('[data-param-del]');
    if (paramDel) return change('op.delete', (p) => { p.parameters = p.parameters.filter((q) => q.id !== paramDel.dataset.paramDel); p.study.rows = []; p.study.fit = null; }, { keepResults: true });
    const tAdd = target.closest('[data-table-add]');
    if (tAdd) return change('op.edit', (p) => { const rows = pathGet(p, tAdd.dataset.tableAdd); const last = rows.at(-1) ?? [0, 0]; rows.push([last[0] * 1.5 || 1, last[1]]); });
    const tDel = target.closest('[data-table-del]');
    if (tDel) { const [path, i] = tDel.dataset.tableDel.split('|'); return change('op.edit', (p) => { pathGet(p, path).splice(Number(i), 1); }); }
    return undefined;
  });
  root.addEventListener('dblclick', (event) => {
    const block = event.target.closest('.sys-block');
    if (block && !event.target.closest('.sys-cell')) { activate(block.dataset.system); return setTab('model'); }
    return undefined;
  });
  root.addEventListener('contextmenu', onContextMenu);
  root.addEventListener('pointerdown', (event) => { if (event.button === 2) rightDown = { x: event.clientX, y: event.clientY }; }, true);
  root.addEventListener('change', (event) => {
    const el = event.target;
    if (el.dataset.select !== undefined) return onSelect(el.dataset.select, el.value);
    if (el.dataset.toggleField !== undefined) return onToggle(el.dataset.toggleField, el.checked);
    if (el.dataset.text !== undefined) return onText(el.dataset.text, el.value);
    if (el.dataset.cell !== undefined) return onCell(el.dataset.cell, el.value);
    if (el.dataset.matColor !== undefined) return change('op.edit', (p) => { const m = p.materials.find((x) => x.id === el.dataset.matColor); if (m) m.color = el.value; }, { keepResults: true });
    if (el.dataset.bcBody !== undefined) { const bc = activeSystem()?.bcs.find((b) => b.id === state.sel.id); if (bc) change('op.pickBody', () => { bc.bodies = el.checked ? [...new Set([...bc.bodies, el.dataset.bcBody])] : bc.bodies.filter((b) => b !== el.dataset.bcBody); }); return undefined; }
    if (el.dataset.startToggle !== undefined) return updateSettings({ showStartPage: el.checked }, { quiet: true });
    return undefined;
  });
  root.addEventListener('pointerdown', (event) => {
    const split = event.target.closest('[data-split]');
    if (!split) return;
    const which = split.dataset.split;
    if ((which === 'left' && !state.settings.showLeftPanel) || (which === 'right' && !state.settings.showRightPanel)) return;
    const start = { x: event.clientX, y: event.clientY, left: state.settings.leftWidth, right: state.settings.rightWidth, bottom: state.settings.bottomHeight };
    pointerDrag(event, {
      cursor: which === 'bottom' ? 'ns-resize' : 'ew-resize',
      move: (e) => {
        if (which === 'left') updateSettings({ leftWidth: Math.max(240, Math.min(600, start.left + e.clientX - start.x)) }, { quiet: true });
        else if (which === 'right') updateSettings({ rightWidth: Math.max(300, Math.min(700, start.right - (e.clientX - start.x))) }, { quiet: true });
        else updateSettings({ bottomHeight: Math.max(90, Math.min(window.innerHeight * 0.6, start.bottom - (e.clientY - start.y))) }, { quiet: true });
        root.style.setProperty('--left-width', `${state.settings.leftWidth}px`);
        root.style.setProperty('--right-width', `${state.settings.rightWidth}px`);
        root.style.setProperty('--bottom-height', `${state.settings.bottomHeight}px`);
        model.view?.resize();
      },
      end: () => renderBottom(),
    });
  });
  if (desktop) {
    root.addEventListener('mousedown', (event) => {
      if (event.button !== 0 || !event.target.closest('[data-window-drag]')) return;
      if (event.detail === 2) appWindow.toggleMaximize(); else native.invoke('window_drag', {}).catch(() => appWindow.startDragging());
    });
    root.addEventListener('pointerdown', (event) => {
      if (!event.target.closest('[data-resize-grip]')) return;
      event.preventDefault();
      native.invoke('window_drag', { edge: 'bottomRight' }).catch(() => appWindow.startResizeDragging?.('SouthEast'));
    });
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', frameThrottle(() => { fitToolbar(); model.view?.resize(); }));
  window.addEventListener('beforeunload', (event) => { if (!desktop && state.dirty) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('error', (event) => { if (/ResizeObserver/.test(String(event.message))) return; notify('error', String(event.message)); });
  window.addEventListener('unhandledrejection', (event) => notify('error', errorText(event.reason)));
}

function onKeyDown(event) {
  if (event.target.closest?.('input, textarea, select, [contenteditable]')) return;
  const key = `${event.ctrlKey || event.metaKey ? 'Ctrl+' : ''}${event.shiftKey ? 'Shift+' : ''}${event.key.length === 1 ? event.key.toUpperCase() : event.key}`;
  for (const [id, c] of Object.entries(commands)) {
    if (c.key && c.key.toUpperCase() === key.toUpperCase()) { event.preventDefault(); run(id); return; }
  }
  if (event.key === 'Escape' && state.animate) model.stopAnimation();
}

function bindPopupActions() {
  popups.on('report-error', (d) => showError(d.titleKey ?? 'error.unexpected', Object.assign(new Error(d.message), { stack: d.detail ?? '' }), d.context ?? ''));
  popups.on('open-recent', (d) => openRecent(d.path));
  popups.on('notice', (d) => notify(d.kind ?? 'info', d.text));
  popups.on('open-settings', (d) => popups.open('settings', { tab: d.tab ?? 'general', themeGroup: d.themeGroup }));
  popups.on('start-tutorial', () => openDocWindow('tutorial'));
  popups.on('show-start', () => showStartPage(true));
  popups.on('progress-cancel', (d) => popups.actions.get(`cancel:${d.op}`)?.());
  popups.on('copy-text', (d) => native.clipboardWrite(d.text).then(() => notify('success', t('notice.copiedText'))).catch(() => {}));
  // Settings changed in the settings window: read them back.
  window.addEventListener('storage', (event) => {
    if (event.key !== 'my3dmaker.settings.v1') return;
    const previous = state.settings;
    state.settings = loadSettings(globalThis.localStorage);
    applySettings(previous);
  });
}

// ───────────────────────── start-up

async function start() {
  renderShell();
  bindEvents();
  bindPopupActions();
  await popups.init();
  state.info = await native.appInfo().catch(() => null);
  state.solver = await solverInfo().catch(() => null);
  document.title = `My3DMaker v${state.info?.version ?? VERSION}`;
  native.setBackendLanguage(state.settings.language);
  applySettings({});
  if (desktop) {
    appWindow.onCloseRequested(async (event) => {
      if (state.quitting) return;
      event.preventDefault();
      if (await confirmReplace()) { state.quitting = true; await native.quitApp(); }
    });
    appWindow.onResized(async () => { const m = await appWindow.isMaximized().catch(() => false); if (m !== state.maximized) { state.maximized = m; renderMenubar(); } }).catch(() => {});
    getCurrentWebview().onDragDropEvent((event) => { if (event.payload.type === 'drop') { const path = event.payload.paths?.[0]; if (path) openPath(path); } });
  }
  for (const path of await native.startupFiles().catch(() => [])) await openPath(path);
  state.showStart = !state.project;
  renderAll();
  setInterval(() => { if (state.settings.statusClock) renderStatus(); }, 30000);
  if (desktop) await appWindow.show();
  if (state.settings.showWelcome && state.showStart && !new URLSearchParams(location.search).has('nowelcome') && !globalThis.__MY3DMAKER_NO_WELCOME) {
    const r = await popups.open('welcome', {});
    if (r?.choice === 'tutorial') openDocWindow('tutorial');
    else if (r?.choice === 'sample') openSample('cantilever');
  }
  if (desktop) setTimeout(() => popups.prewarm('menu').then(() => popups.prewarm('progress', { warm: true })), 400);
}

// Test hook (E2E and smoke scripts).
window.__my3dmaker = {
  state, commands, run, popups, t,
  get model() { return model; },
  actions: { openSample, newProject, addSystemOf, addCondition, addTemplateBody, solve, select, setTab, change, undo, redo, saveProject, openContent, updateSettings, facePicked, runStudy, fitStudy, addParameter, meshActive },
  menus: { MENUS, SUBMENUS: Object.fromEntries(Object.entries(SUBMENUS).map(([k, f]) => [k, f()])) },
};

start()
  .catch((error) => showError('error.unexpected', error, 'start'))
  .finally(() => { if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {}); });

void [RESULTS, isMac, SESSION_KEY, RECENT_KEY, UNIT, materialName];
