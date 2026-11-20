// MyMechanics main window: menu bar (also the title bar), toolbar, the CommandManager (feature, sketch,
// evaluate, assembly and drawing commands), the FeatureManager design tree / PropertyManager on the
// left, the graphics area (or a drawing sheet), the task pane on the right, problems and messages at
// the bottom and the status bar.
//
// The shell (menus as popup windows, toolbar, start page, settings, themes, progress popups) follows
// MySketchBook; the modelling is in cad/ (no DOM) and the 3D view in view/.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import * as THREE from 'three';
import APP_ICON from '../assets/icon-256.png';
import { loadKernel, kernelReady, rep } from './cad/kernel.js';
import { createProject, createPart, createAssembly, addDrawing, documentsOf, findDocument, History, packProject, unpackProject, newId } from './cad/document.js';
import { regenerate, createFeature, setFeatureNamer, allDependents, faceRef, resolvePlane, frame as makeFrame, STD_PLANES, usableSketches, toSketch, nameKey } from './cad/features.js';
import { createSketchGeometry, addRelation, analyse, byId, standalonePoints } from './cad/sketch.js';
import { edgeSignature, faceSignature } from './cad/refs.js';
import { solveMates, placeShape, interferences, mateEntityOfFace, quatIdentity, quatToAxisAngle, instanceName, quatFromAxisAngle, quatMultiply } from './cad/assembly.js';
import { projectView, drawingSvg, drawingDxf, layoutViews, SHEETS } from './cad/drawing.js';
import { MATERIALS, materialOf, materialName, massOf } from './cad/materials.js';
import { SAMPLES, buildSample } from './cad/samples.js';
import { Viewport, hitKey } from './view/viewport.js';
import { SketchEditor } from './view/sketcher.js';
import { treeHtml, featureIcon, MATE_ICONS } from './ui/tree.js';
import { propertyManagerHtml, drawingPropsHtml, HOLE_SIZES } from './ui/propertymanager.js';
import { startPageHtml, TEMPLATES } from './ui/startpage.js';
import { startBoard } from './ui/startboard.js';
import { AnimatedBackground } from './ui/background.js';
import { ANIMATIONS, loadSettings, PANEL_MIN, RECENT_DIRS_KEY, RECENT_KEY, SESSION_KEY, STORAGE_KEY, storeSettings } from './domain/settings.js';
import { addRecent, loadRecent, loadRecentDirs, removeRecent, storeRecent, storeRecentDirs } from './domain/recent.js';
import { baseName, directoryOf, fileSafe, stripExtension, withExtension } from './domain/paths.js';
import { switchFlag } from './flags.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { PopupHost } from './platform/popups.js';
import { applyFont, applyTheme, randomThemeId, resolveTheme, themeName } from './themes.js';
import { escapeHtml, frameThrottle, isMac, keyLabel, pointerDrag } from './ui/dom.js';
import { DOC_KINDS, docLabel, docWindowTitle } from './domain/helpdocs.js';
import { PROGRESS_ICONS, PROGRESS_NAME_ICONS } from './ui/progressicons.js';

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
  hover: null,
  editing: null,
  cmTab: 'features',
  leftTab: 'tree',
  rightTab: 'props',
  bottomTab: 'rebuild',
  collapsed: new Set(),
  hiddenPlanes: new Set(),
  notice: null,
  log: [],
  openMenu: null,
  lastMenuClose: { name: null, at: 0 },
  quitting: false,
  untitled: 0,
  minWidth: 0,
  maximized: false,
  stats: { calls: 0, triangles: 0, ms: 0 },
  section: null,
  mateStatus: new Map(),
  failedMates: new Set(),
  drawingZoom: 1,
  drawingSelected: null,
};

const doc = () => state.doc;
const project = () => state.doc?.project ?? null;
const hasDoc = () => Boolean(state.doc) && !state.showStart;
const active = () => findDocument(project(), project()?.active);
const activeKind = () => (hasDoc() ? project()?.active?.kind ?? null : null);
const activePart = () => (activeKind() === 'part' ? active() : null);
const activeAssembly = () => (activeKind() === 'assembly' ? active() : null);
const activeDrawing = () => (activeKind() === 'drawing' ? active() : null);
const sketching = () => state.editing?.mode === 'sketch';

// ───────────────────────── units and numbers

const UNIT_FACTOR = { mm: 1, cm: 10, in: 25.4 };
const units = () => state.settings.units ?? 'mm';
const decimals = () => state.settings.decimals ?? 2;
function fmt(v, digits = decimals()) {
  if (!Number.isFinite(v)) return '—';
  const r = Number(v.toFixed(digits));
  return String(Object.is(r, -0) ? 0 : r);
}
/** A length in mm shown in the display unit ("25.4 mm", "1 in"). */
const fmtLen = (mm, withUnit = true) => `${fmt(mm / UNIT_FACTOR[units()])}${withUnit ? ` ${units()}` : ''}`;
/** Parses a typed value (arithmetic allowed; for lengths a unit suffix overrides the display unit) → mm, or null. */
function parseLen(text, unit = 'length') {
  const s = String(text ?? '').trim().toLowerCase().replace(/,/g, '.');
  const m = /^(.*?)(mm|cm|in|"|°|deg)?$/.exec(s);
  const expr = (m?.[1] ?? '').replace(/\s+/g, '');
  if (!expr || !/^[\d.+\-*/()]+$/.test(expr)) return null;
  let v;
  try { v = Function(`"use strict"; return (${expr});`)(); } catch { return null; }
  if (!Number.isFinite(v)) return null;
  if (unit !== 'length') return v;
  const u = m[2] === '"' ? 'in' : m[2] && m[2] !== '°' && m[2] !== 'deg' ? m[2] : units();
  return v * UNIT_FACTOR[u];
}

// ───────────────────────── notices & errors

let noticeTimer = 0;
function notify(kind, text, detail = '') {
  state.notice = { kind, text, at: Date.now() };
  state.log.unshift({ kind, text, detail, at: new Date() });
  if (state.log.length > 500) state.log.length = 500;
  if (state.bottomTab === 'messages') renderBottom();
  renderStatus();
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { state.notice = null; renderStatus(); }, kind === 'error' ? 12000 : 6000);
}

function formatError(error) {
  const code = error?.code;
  if (code && t(`error.code.${code}`) !== `error.code.${code}`) return { message: t(`error.code.${code}`), detail: error.message ?? '' };
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
    app: info ? `${info.name} ${info.version} (${info.web ? 'web' : `${info.os}/${info.arch}`}, ${info.commit})` : `MyMechanics ${VERSION}`,
  });
}

window.addEventListener('error', (event) => { if (event.error || event.message) showError('error.unexpected', event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}` : ''); });
window.addEventListener('unhandledrejection', (event) => showError('error.unexpected', event.reason));

// ───────────────────────── documents

class Doc {
  constructor(projectData, { path = null, name = null, handle = null } = {}) {
    this.project = projectData;
    this.history = new History(projectData);
    this.path = path;
    this.name = name;
    this.handle = handle;
    this.revision = 0;
    this.savedRevision = 0;
  }
  get dirty() { return this.revision !== this.savedRevision; }
  markSaved() { this.savedRevision = this.revision; }
}

const docName = (d = doc()) => (d ? (d.path ? baseName(d.path) : d.name ?? (d.project.name || t('tabs.untitled', { n: 1 }))) : '');

// ───────────────────────── the kernel (loaded once, before the first model is built)

async function ensureKernel() {
  if (kernelReady()) return rep();
  return withProgress('progress.kernel', 'OpenCASCADE', async (op, report) => {
    report({ fraction: 0.1, text: t('progress.kernelLoading') });
    return loadKernel({ onProgress: (f) => report({ fraction: f, text: t('progress.kernelLoading') }) });
  }, { delay: 200 });
}

// ───────────────────────── building parts (cached by their feature list)

const builds = new Map();
const meshTolerance = (size) => size * ({ coarse: 0.003, normal: 0.0012, fine: 0.0004 }[state.settings.meshQuality] ?? 0.0012);
const angularTolerance = () => ({ coarse: 0.5, normal: 0.3, fine: 0.15 }[state.settings.meshQuality] ?? 0.3);

/** Triangles, edge polylines and the face / edge lists of a body (for the view and for picking). */
function tessellate(body) {
  if (!body) return { mesh: null };
  let size = 100;
  try { const [lo, hi] = body.boundingBox.bounds; size = Math.max(1, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])); } catch { /* default */ }
  const tolerance = Math.max(0.002, meshTolerance(size));
  const mesh = body.mesh({ tolerance, angularTolerance: angularTolerance() });
  const edges = body.meshEdges({ tolerance, angularTolerance: angularTolerance() });
  const faces = body.faces;
  const edgeList = body.edges;
  return { mesh, edges, faces, edgeList, size, faceIndex: new Map(faces.map((f, i) => [f.hashCode, i])), edgeIndex: new Map(edgeList.map((e, i) => [e.hashCode, i])) };
}

/** The part built (up to its rollback bar, or `upTo`), cached until its features change. */
function buildPart(part, { upTo = undefined, features = null, slot = 'main' } = {}) {
  const feats = features ?? part.features;
  const limit = upTo === undefined ? part.rollback ?? null : upTo;
  const key = JSON.stringify([feats, limit, state.settings.meshQuality]);
  const cacheKey = `${part.id}:${slot}`;
  const cached = builds.get(cacheKey);
  if (cached?.key === key) return cached;
  const t0 = performance.now();
  const result = regenerate({ ...part, features: feats }, { upTo: limit });
  let tess = { mesh: null };
  try { tess = tessellate(result.body); } catch (error) { console.warn('tessellate', error); }
  const entry = { key, result, body: result.body, ...tess, ms: performance.now() - t0 };
  builds.set(cacheKey, entry);
  return entry;
}

/** Errors of the active part's rebuild (the bottom panel and the tree). */
function rebuildProblems() {
  const part = activePart();
  if (!part || !kernelReady()) return [];
  const b = buildPart(part);
  return part.features.filter((f) => b.result.results.get(f.id)?.ok === false).map((f) => ({ feature: f, ...b.result.results.get(f.id) }));
}

// ───────────────────────── changes, undo

function change(labelKey, mutate) {
  const d = doc();
  if (!d) return undefined;
  const result = mutate(d.project);
  commit(labelKey);
  return result;
}

function commit(labelKey) {
  const d = doc();
  if (!d) return;
  if (d.history.commit(d.project, t(labelKey))) d.revision += 1;
  afterChange();
}

function afterChange() {
  pruneSelection();
  if (activeAssembly()) solveAssembly();
  syncView();
  renderAll();
}

function undo() {
  const d = doc();
  if (!d || state.editing) return;
  const r = d.history.undo();
  if (!r) return;
  d.project = r.project;
  d.revision += 1;
  afterChange();
  notify('info', t('notice.undone', { label: r.label }));
}

function redo() {
  const d = doc();
  if (!d || state.editing) return;
  const r = d.history.redo();
  if (!r) return;
  d.project = r.project;
  d.revision += 1;
  afterChange();
  notify('info', t('notice.redone', { label: r.label }));
}

// ───────────────────────── opening documents

async function setDoc(d) {
  await ensureKernel();
  popups.close('welcome');
  cancelEditing({ quiet: true });
  state.doc = d;
  state.selection = [];
  state.hover = null;
  state.showStart = false;
  state.section = null;
  builds.clear();
  mountViewport();
  viewport.setSection(null);
  if (activeAssembly()) solveAssembly();
  renderAll();
  syncView();
  if (d.project.camera && activeKind() !== 'drawing') viewport.setCameraState(d.project.camera);
  else fitView(false);
  if (activeKind() === 'drawing') { fitDrawing(); renderDrawing(); }
  persistSession();
}

function untitledName(kind = 'part') { state.untitled += 1; return t(`new.${kind}Name`, { n: state.untitled }); }

async function newDocument(kind = 'part', { unit = null } = {}) {
  if (kind === 'drawing') {
    if (hasDoc() && (activePart() || activeAssembly())) return newDrawing();
    notify('info', t('notice.drawingNeedsModel'));
    return null;
  }
  if (!(await confirmReplace())) return null;
  const name = untitledName(kind);
  const p = createProject({ name, kind });
  if (unit) updateSettings({ units: unit }, { quiet: true });
  const d = new Doc(p, { name: `${name}.mymech` });
  await busy('progress.new', name, () => setDoc(d));
  viewport?.setView('iso', { animate: false });
  notify('success', t(kind === 'assembly' ? 'notice.newAssembly' : 'notice.newPart', { name }));
  if (kind === 'assembly') startInsertComponent();
  return d;
}

/** A part added to the open project (File › New part while a project is open: a new tab). */
function addPartToProject(name = null) {
  const part = createPart(name ?? untitledName('part'));
  change('op.newPart', (p) => { p.parts.push(part); p.active = { kind: 'part', id: part.id }; });
  viewport?.setView('iso', { animate: false });
  return part;
}

function addAssemblyToProject() {
  const asm = createAssembly(untitledName('assembly'));
  change('op.newAssembly', (p) => { p.assemblies.push(asm); p.active = { kind: 'assembly', id: asm.id }; });
  startInsertComponent();
}

async function confirmReplace() {
  const d = doc();
  if (!d?.dirty) return true;
  const choice = await ask({
    icon: 'save', title: t('confirm.replaceTitle'), message: t('confirm.replaceMessage', { name: docName(d) }),
    buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }],
  });
  if (choice === 'save') return saveDoc();
  return choice === 'discard';
}

async function openSampleAsk(id) {
  if (!(await confirmReplace())) return null;
  const entry = SAMPLES.find((x) => x.id === id);
  const name = entry?.[lang()]?.[0] ?? id;
  await ensureKernel();
  return busy('progress.sample', name, async () => {
    const p = buildSample(id, lang());
    if (!p) return null;
    const d = new Doc(p, { name: `${fileSafe(p.name)}.mymech` });
    await setDoc(d);
    if (activeKind() !== 'drawing') { viewport?.setView('iso', { animate: false }); }
    notify('success', t('notice.sampleOpened', { name }));
    return d;
  });
}

async function busy(titleKey, name, job, { delay = 300 } = {}) {
  return withProgress(titleKey, name, async (op, report) => {
    report({ fraction: 0.1, text: t('progress.step.build') });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return job();
  }, { delay });
}

function persistSession() {
  if (state.instance && !state.instance.first) return;
  try { globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify({ files: state.doc?.path ? [state.doc.path] : [] })); } catch { /* ignore */ }
}

function switchDocument(ref) {
  if (!project() || !findDocument(project(), ref)) return;
  if (state.editing) cancelEditing({ quiet: true });
  project().active = ref;
  state.selection = [];
  state.drawingSelected = null;
  if (activeAssembly()) solveAssembly();
  renderAll();
  syncView();
  if (ref.kind !== 'drawing') fitView(false); else { fitDrawing(); renderDrawing(); }
}

// ───────────────────────── 3D view

let viewport = null;

function mountViewport() {
  if (viewport) return;
  const host = root.querySelector('#view-host');
  host.innerHTML = '';
  viewport = new Viewport(host, {
    onStats: (s) => { state.stats = s; },
    onCamera: (camera) => { if (doc() && activeKind() !== 'drawing') doc().project.camera = camera; if (sketching()) { clearTimeout(mountViewport.grid); mountViewport.grid = setTimeout(() => state.editing?.editor?.render(), 60); } },
    onPick: (hit, e) => onViewportPick(hit, e),
    onHover: (hit) => { state.hover = hit; renderPointer(hit); },
    onContext: (hit, e) => viewportContextMenu(hit, e),
    onDoubleClick: (hit) => onViewportDoubleClick(hit),
    tool: () => (sketching() ? state.editing.editor : null),
    invertZoom: () => state.settings.invertZoom,
  });
  viewport.setStyle(state.settings.displayStyle);
  viewport.setProjection(!state.settings.perspectiveView);
}

function fitView(animate = true) {
  if (!viewport || activeKind() === 'drawing') return;
  viewport.resize();
  viewport.zoomToFit(null, animate);
}

/** Shows the active document: bodies, planes, sketches and previews. */
function syncView() {
  if (!viewport || !hasDoc()) return;
  const kind = activeKind();
  root.querySelector('#view-host').hidden = kind === 'drawing';
  root.querySelector('#drawing-host').hidden = kind !== 'drawing';
  if (kind === 'drawing') { renderDrawing(); return; }
  if (!kernelReady()) return;
  if (kind === 'part') syncPart(activePart());
  else if (kind === 'assembly') syncAssembly(activeAssembly());
  viewport.setSelection(state.selection.map(selectionHit).filter(Boolean));
}

function bodySpec(key, entry, part, extra = {}) {
  const mat = materialOf(part.material);
  return { key, mesh: entry.mesh, edges: entry.edges, faceIndex: entry.faceIndex, edgeIndex: entry.edgeIndex, color: part.color || mat.color, metal: mat.metal * 0.6, rough: mat.rough, ...extra };
}

function syncPart(part) {
  const e = state.editing;
  let entry;
  let preview = null;
  if (e?.mode === 'sketch') {
    const index = part.features.findIndex((f) => f.id === e.feature.id);
    entry = buildPart(part, { upTo: index < 0 ? (part.rollback ?? part.features.length) : index, slot: 'sketch' });
  } else if (e?.mode === 'feature') {
    const features = previewFeatures(part, e);
    const index = features.findIndex((f) => f.id === e.feature.id);
    entry = buildPart(part, { features, upTo: index + 1, slot: 'preview' });
    state.previewResult = entry.result.results.get(e.feature.id) ?? null;
    const tool = state.previewResult?.tool;
    if (tool) { try { preview = { mesh: tool.mesh({ tolerance: Math.max(0.01, meshTolerance(entry.size ?? 100) * 2), angularTolerance: 0.4 }), cut: e.feature.op === 'cut' || e.feature.type === 'hole' }; } catch { preview = null; } }
  } else {
    entry = buildPart(part);
    state.previewResult = null;
  }
  state.partEntry = entry;
  const ghost = e?.mode === 'sketch';
  viewport.setBodies(entry.mesh ? [{ ...bodySpec('body', entry, part), ghost }] : []);
  viewport.setPreview(preview);
  // Planes: the standard ones (always while picking a sketch plane or with no body yet) and the reference planes.
  const size = Math.max(60, (entry.size ?? 100) * 0.75);
  const picking = e?.mode === 'sketchPlane';
  const planes = Object.entries(STD_PLANES).map(([id, f]) => ({
    id, frame: makeFrame(f), size,
    visible: picking || (state.settings.showPlanes && !state.hiddenPlanes.has(id) && !entry.mesh) || state.selection.some((s) => s.key === `plane:${id}`),
  }));
  // Reference planes show while picking, when selected, or before there is a body (they would hide the model).
  for (const [id, fr] of entry.result.planes) planes.push({ id, frame: fr, size: size * 0.8, visible: picking || state.selection.some((s) => s.key === `feat:${id}`) || (state.settings.showPlanes && !entry.mesh) });
  viewport.setPlanes(planes);
  viewport.groups.origin.visible = state.settings.showOrigin;
  // Sketches not used by a feature (and the selected ones) as thin lines.
  const lines = [];
  if (state.settings.showSketches && e?.mode !== 'sketch') {
    const used = new Set(part.features.map((f) => f.sketch).filter(Boolean));
    for (const f of part.features) {
      if (f.type !== 'sketch' || f.suppressed) continue;
      const sel = state.selection.some((s) => s.key === `feat:${f.id}`);
      if (used.has(f.id) && !sel) continue;
      const r = entry.result.results.get(f.id);
      if (!r?.frame) continue;
      lines.push(...sketchLines(f, r.frame, sel ? '#18a058' : '#3f78c9'));
    }
  }
  // Hole positions being placed.
  if (e?.mode === 'feature' && e.holeSketch?.plane) {
    try {
      const main = buildPart(part);
      const fr = resolvePlane(e.holeSketch.plane, { body: main.body, planes: main.result.planes });
      const pts = e.holeSketch.points.flatMap(([u, v]) => [fr.origin[0] + fr.xDir[0] * u + fr.yDir[0] * v, fr.origin[1] + fr.xDir[1] * u + fr.yDir[1] * v, fr.origin[2] + fr.xDir[2] * u + fr.yDir[2] * v]);
      lines.push({ points: pts, color: '#f28c1e', size: 9 });
    } catch { /* face gone */ }
  }
  viewport.setLines('markers', lines);
}

function sketchLines(f, fr, color) {
  const seg = [];
  const map = new Map(f.entities.map((x) => [x.id, x]));
  const w = (u, v) => [fr.origin[0] + fr.xDir[0] * u + fr.yDir[0] * v, fr.origin[1] + fr.xDir[1] * u + fr.yDir[1] * v, fr.origin[2] + fr.xDir[2] * u + fr.yDir[2] * v];
  for (const e of f.entities) {
    if (e.type === 'point') continue;
    let pts = [];
    if (e.type === 'line') { const a = map.get(e.p1); const b = map.get(e.p2); pts = [[a.x, a.y], [b.x, b.y]]; }
    else if (e.type === 'circle') { const c = map.get(e.c); pts = Array.from({ length: 49 }, (_, i) => [c.x + e.r * Math.cos((i / 48) * Math.PI * 2), c.y + e.r * Math.sin((i / 48) * Math.PI * 2)]); }
    else if (e.type === 'arc') { const c = map.get(e.c); const a = map.get(e.p1); const b = map.get(e.p2); const r = Math.hypot(a.x - c.x, a.y - c.y); const a0 = Math.atan2(a.y - c.y, a.x - c.x); let a1 = Math.atan2(b.y - c.y, b.x - c.x); while (a1 <= a0) a1 += Math.PI * 2; pts = Array.from({ length: 33 }, (_, i) => { const t0 = a0 + ((a1 - a0) * i) / 32; return [c.x + r * Math.cos(t0), c.y + r * Math.sin(t0)]; }); }
    for (let i = 1; i < pts.length; i++) seg.push(...w(...pts[i - 1]), ...w(...pts[i]));
  }
  const points = standalonePoints(f).flatMap((p) => w(p.x, p.y));
  return [{ segments: seg, color, width: 1.6 }, ...(points.length ? [{ points, color, size: 6 }] : [])];
}

/** The part's features with the one being edited put in (a new one before the rollback bar). */
function previewFeatures(part, e) {
  const list = part.features.slice();
  const extra = e.holeSketch?.plane ? holeSketchFeature(part, e) : null;
  const index = list.findIndex((f) => f.id === e.feature.id);
  const feature = extra ? { ...e.feature, sketch: extra.id } : e.feature;
  if (index >= 0) list[index] = feature;
  else {
    const at = part.rollback ?? list.length;
    list.splice(at, 0, ...(extra ? [extra] : []), feature);
  }
  return list;
}

/** The sketch of a Hole Wizard's points (a sketch on the picked face, made with the hole). */
function holeSketchFeature(part, e) {
  const hs = e.holeSketch;
  hs.id ??= newId('skh');
  hs.name ??= `${t('feature.holePositions')}${part.features.filter((f) => f.type === 'sketch').length + 1}`;
  const s = { id: hs.id, type: 'sketch', name: hs.name, plane: hs.plane, ...createSketchGeometry() };
  s.entities.push(...hs.points.map(([x, y], i) => ({ id: `hp${i}`, type: 'point', x, y, standalone: true })));
  return s;
}

function syncAssembly(asm) {
  const list = [];
  for (const c of asm.components) {
    if (c.hidden) continue;
    const part = project().parts.find((p) => p.id === c.part);
    if (!part) continue;
    const entry = buildPart(part);
    if (!entry.mesh) continue;
    list.push(bodySpec(`comp:${c.id}`, entry, part, { matrix: componentMatrix(c) }));
  }
  viewport.setBodies(list);
  viewport.setPreview(null);
  viewport.setPlanes(Object.entries(STD_PLANES).map(([id, f]) => ({ id, frame: makeFrame(f), size: 120, visible: state.selection.some((s) => s.key === `plane:${id}`) || (state.settings.showPlanes && !list.length) })));
  viewport.groups.origin.visible = state.settings.showOrigin;
  viewport.setLines('markers', []);
}

function componentMatrix(c) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(...c.position), new THREE.Quaternion(...c.rotation), new THREE.Vector3(1, 1, 1));
  return m;
}

/** Positions the assembly's free components by its mates. */
function solveAssembly() {
  const asm = activeAssembly();
  if (!asm || !kernelReady()) return;
  const r = solveMates(asm, { entity: (ref) => mateEntityNow(ref), size: assemblySize(asm) });
  state.mateStatus = r.status;
  state.failedMates = new Set(r.failed);
}

function assemblySize(asm) {
  let size = 100;
  for (const c of asm.components) { const part = project().parts.find((p) => p.id === c.part); if (part) size = Math.max(size, buildPart(part).size ?? 0); }
  return size;
}

/** A mate reference read again from the current part (the part may have changed since the mate was made). */
function mateEntityNow(ref) {
  const asm = project()?.assemblies.find((a) => a.components.some((c) => c.id === ref.comp));
  const comp = asm?.components.find((c) => c.id === ref.comp);
  const part = comp && project().parts.find((p) => p.id === comp.part);
  if (!part) return null;
  if (ref.sig) {
    const entry = buildPart(part);
    const face = entry.faces?.find((f) => matchesSig(f, ref.sig));
    if (face) { try { return { comp: ref.comp, ...mateEntityOfFace(face, faceSignature) }; } catch { /* fall back */ } }
  }
  return ref;
}

function matchesSig(face, sig) {
  const s = faceSignature(face);
  return s.type === sig.type && Math.hypot(...s.center.map((v, i) => v - sig.center[i])) < 1e-4 && Math.abs(s.area - sig.area) < 1e-3 * Math.max(1, sig.area);
}

// ───────────────────────── selection

/** A selection item → what the view highlights. */
function selectionHit(s) {
  if (s.kind === 'face' || s.kind === 'edge') return { kind: s.kind, bodyKey: s.bodyKey, index: s.index };
  if (s.kind === 'plane') return { kind: 'plane', id: s.id };
  if (s.kind === 'comp') return { kind: 'body', bodyKey: `comp:${s.id}` };
  if (s.kind === 'feat' && activePart()) {
    const f = activePart().features.find((x) => x.id === s.id);
    if (f?.type === 'plane') return { kind: 'plane', id: f.id };
  }
  return null;
}

function select(items, { add = false } = {}) {
  if (add) {
    const next = state.selection.slice();
    for (const it of items) { const i = next.findIndex((x) => x.key === it.key); if (i >= 0) next.splice(i, 1); else next.push(it); }
    state.selection = next;
  } else state.selection = items;
  if (activePart() && !state.editing) syncView();
  else viewport?.setSelection(state.selection.map(selectionHit).filter(Boolean));
  renderLeft();
  renderRight();
  renderStatus();
  renderToolbarState();
}

function clearSelection() { if (state.selection.length) select([]); }

function pruneSelection() {
  const part = activePart(); const asm = activeAssembly();
  state.selection = state.selection.filter((s) => {
    if (s.kind === 'feat') return Boolean(part?.features.some((f) => f.id === s.id));
    if (s.kind === 'comp') return Boolean(asm?.components.some((c) => c.id === s.id));
    if (s.kind === 'mate') return Boolean(asm?.mates.some((m) => m.id === s.id));
    return ['plane', 'doc', 'material', 'origin'].includes(s.kind);
  });
}

/** The kernel face / edge of a pick (part: the body; assembly: the component's part body, local coordinates). */
function topoOf(hit) {
  if (!hit || (hit.kind !== 'face' && hit.kind !== 'edge') || hit.index < 0) return null;
  if (hit.bodyKey === 'body') {
    const entry = state.partEntry;
    return { entry, part: activePart(), comp: null, shape: hit.kind === 'face' ? entry?.faces?.[hit.index] : entry?.edgeList?.[hit.index] };
  }
  const compId = String(hit.bodyKey).replace(/^comp:/, '');
  const comp = activeAssembly()?.components.find((c) => c.id === compId);
  const part = comp && project().parts.find((p) => p.id === comp.part);
  if (!part) return null;
  const entry = buildPart(part);
  return { entry, part, comp, shape: hit.kind === 'face' ? entry.faces?.[hit.index] : entry.edgeList?.[hit.index] };
}

function itemOfHit(hit) {
  if (!hit) return null;
  if (hit.kind === 'plane') {
    const f = activePart()?.features.find((x) => x.id === hit.id);
    return f ? { kind: 'feat', id: f.id, key: `feat:${f.id}` } : { kind: 'plane', id: hit.id, key: `plane:${hit.id}` };
  }
  if (hit.kind === 'face' || hit.kind === 'edge') {
    if (activeAssembly() && !state.editing) {
      const compId = String(hit.bodyKey).replace(/^comp:/, '');
      return { kind: 'comp', id: compId, key: `comp:${compId}` };
    }
    return { kind: hit.kind, bodyKey: hit.bodyKey, index: hit.index, key: hitKey(hit) };
  }
  return null;
}

function onViewportPick(hit, e) {
  const ed = state.editing;
  if (ed?.mode === 'sketchPlane') return pickSketchPlane(hit);
  if (ed?.mode === 'feature' && ed.pick) return pickForFeature(hit, e);
  if (ed?.mode === 'mate') return pickForMate(hit);
  if (ed?.mode === 'measure') return pickForMeasure(hit, e);
  const item = itemOfHit(hit);
  if (!item) { if (!e.ctrlKey && !e.shiftKey) clearSelection(); return undefined; }
  select([item], { add: e.ctrlKey || e.shiftKey || e.metaKey });
  return undefined;
}

function onViewportDoubleClick(hit) {
  if (state.editing) return;
  if (activeAssembly() && hit && hit.kind !== 'plane') {
    const compId = String(hit.bodyKey ?? '').replace(/^comp:/, '');
    const comp = activeAssembly().components.find((c) => c.id === compId);
    if (comp) { switchDocument({ kind: 'part', id: comp.part }); notify('info', t('notice.openedPart')); }
  }
}

function renderPointer(hit) {
  const el = root.querySelector('#status-pointer');
  if (!el) return;
  if (!hit?.point) { el.textContent = '—'; return; }
  const [x, y, z] = hit.point;
  el.textContent = `X ${fmtLen(x, false)}  Y ${fmtLen(y, false)}  Z ${fmtLen(z, false)} ${units()}`;
}

// ───────────────────────── editing features (PropertyManager)

/** Starts a new feature of `type` from the current selection (SolidWorks pre-selection). */
async function startFeature(type) {
  const part = activePart();
  if (!part) { notify('info', t('notice.partOnly')); return; }
  await ensureKernel();
  if (state.editing) cancelEditing({ quiet: true });
  const params = {};
  const sel = state.selection;
  if (['extrude', 'revolve', 'cutExtrude', 'cutRevolve'].includes(type)) {
    const real = type.startsWith('cut') ? (type === 'cutExtrude' ? 'extrude' : 'revolve') : type;
    params.op = type.startsWith('cut') ? 'cut' : 'boss';
    const selSketch = sel.map((s) => s.kind === 'feat' && part.features.find((f) => f.id === s.id && f.type === 'sketch')).find(Boolean);
    const options = usableSketches(part, real, part.rollback ?? part.features.length);
    const sketch = selSketch ?? options.at(-1);
    if (!sketch) { notify('info', t('notice.needSketch')); return; }
    params.sketch = sketch.id;
    if (params.op === 'cut' && real === 'extrude') { params.end = 'blind'; params.depth = 5; params.reverse = cutShouldReverse(part, sketch); }
    return beginFeature(createFeature(part, real, params));
  }
  if (type === 'fillet' || type === 'chamfer') {
    params.edges = sel.filter((s) => s.kind === 'edge').map((s) => topoOf(s)?.shape).filter(Boolean).map(edgeSignature);
    for (const f of sel.filter((s) => s.kind === 'face')) for (const edge of topoOf(f)?.shape?.edges ?? []) params.edges.push(edgeSignature(edge));
    return beginFeature(createFeature(part, type, params), { pick: 'edges' });
  }
  if (type === 'shell') {
    params.faces = sel.filter((s) => s.kind === 'face').map((s) => topoOf(s)?.shape).filter(Boolean).map(faceSignature);
    return beginFeature(createFeature(part, type, params), { pick: 'faces' });
  }
  if (type === 'hole') {
    const face = sel.find((s) => s.kind === 'face');
    const f = createFeature(part, 'hole', { size: 'M6', diameter: 6.6 });
    const holeSketch = { plane: null, points: [] };
    if (face) { const shape = topoOf(face)?.shape; if (shape?.geomType === 'PLANE') holeSketch.plane = faceRef(shape); }
    const planeSel = sel.find((s) => s.kind === 'plane');
    if (planeSel) holeSketch.plane = planeRefOf(planeSel.id);
    return beginFeature(f, { pick: 'holePoints', holeSketch });
  }
  if (type === 'linearPattern' || type === 'circularPattern' || type === 'mirror') {
    params.seeds = sel.filter((s) => s.kind === 'feat').map((s) => part.features.find((f) => f.id === s.id)).filter((f) => f && ['extrude', 'revolve', 'hole'].includes(f.type)).map((f) => f.id);
    if (!params.seeds.length) {
      const usable = part.features.slice(0, part.rollback ?? part.features.length);
      const last = [...usable].reverse().find((f) => ['extrude', 'revolve', 'hole'].includes(f.type) && usable.indexOf(f) !== usable.findIndex((x) => ['extrude', 'revolve'].includes(x.type)));
      if (last) params.seeds = [last.id];
    }
    if (type === 'mirror') { const plane = sel.find((s) => s.kind === 'plane'); if (plane) params.plane = { kind: 'std', name: plane.id }; }
    return beginFeature(createFeature(part, type, params), { pick: 'seeds' });
  }
  if (type === 'plane') {
    const plane = sel.find((s) => s.kind === 'plane'); const face = sel.find((s) => s.kind === 'face');
    if (plane) params.base = { kind: 'std', name: plane.id };
    else if (face && topoOf(face)?.shape?.geomType === 'PLANE') { params.base = faceRef(topoOf(face).shape); params.offset = 10; }
    return beginFeature(createFeature(part, 'plane', params), { pick: 'base' });
  }
  return undefined;
}

/** Whether a cut sketched on `sketch` must be reversed to go into the body (the body on the normal's side). */
function cutShouldReverse(part, sketch) {
  const entry = buildPart(part);
  if (!entry.body) return false;
  const r = entry.result.results.get(sketch.id);
  if (!r?.frame) return false;
  const [lo, hi] = entry.body.boundingBox.bounds;
  const centre = lo.map((v, i) => (v + hi[i]) / 2);
  const side = (centre[0] - r.frame.origin[0]) * r.frame.normal[0] + (centre[1] - r.frame.origin[1]) * r.frame.normal[1] + (centre[2] - r.frame.origin[2]) * r.frame.normal[2];
  return side > 1e-9;
}

function beginFeature(feature, { pick = null, isNew = true, holeSketch = null } = {}) {
  state.editing = { mode: 'feature', feature, isNew, pick, holeSketch };
  state.leftTab = 'pm';
  state.selection = [];
  syncView();
  renderAll();
}

function editFeature(id) {
  const part = activePart();
  const f = part?.features.find((x) => x.id === id);
  if (!f) return;
  if (f.type === 'sketch') { editSketch(id); return; }
  if (f.type === 'import') { notify('info', t('notice.importNotEditable')); return; }
  if (state.editing) cancelEditing({ quiet: true });
  state.editing = { mode: 'feature', feature: JSON.parse(JSON.stringify(f)), isNew: false, pick: null };
  state.leftTab = 'pm';
  syncView();
  renderAll();
}

function cancelEditing({ quiet = false } = {}) {
  const e = state.editing;
  if (!e) return;
  if (e.mode === 'sketch') { e.editor.dispose(); viewport?.setLines('sketch', []); viewport?.setLabels([]); }
  if (e.mode === 'mate' && e.base && activeAssembly()) activeAssembly().components = JSON.parse(e.base);
  state.editing = null;
  state.previewResult = null;
  state.mateError = false;
  state.leftTab = 'tree';
  if (!quiet) notify('info', t('notice.cancelled'));
  syncView();
  renderAll();
}

/** OK in the PropertyManager. */
function acceptEditing() {
  const e = state.editing;
  if (!e) return undefined;
  if (e.mode === 'sketch') return exitSketch();
  if (e.mode === 'mate') return acceptMate();
  if (e.mode !== 'feature') return cancelEditing({ quiet: true });
  const part = activePart();
  const result = state.previewResult;
  if (e.feature.type === 'hole' && e.isNew && !e.holeSketch?.points.length) { notify('error', t('notice.holeNeedsPoints')); return undefined; }
  if (result && result.ok === false) {
    notify('error', `${t('notice.featureFailed')}: ${t(`rebuild.${result.error}`, null, result.error)}`);
    return undefined;
  }
  const features = previewFeatures(part, e);
  state.editing = null;
  state.leftTab = 'tree';
  state.selection = [{ kind: 'feat', id: e.feature.id, key: `feat:${e.feature.id}` }];
  change(e.isNew ? 'op.addFeature' : 'op.editFeature', () => { part.features = features; });
  notify('success', t(e.isNew ? 'notice.featureAdded' : 'notice.featureEdited', { name: e.feature.name }));
  return undefined;
}

/** A change in the PropertyManager: the preview is rebuilt. */
function updateFeature(mutate) {
  const e = state.editing;
  if (e?.mode !== 'feature') return;
  mutate(e.feature, e);
  syncView();
  renderLeft();
  renderStatus();
}

function pickForFeature(hit, ev) {
  const e = state.editing;
  const f = e.feature;
  const part = activePart();
  const topo = topoOf(hit);
  const toggle = (list, sig, same) => { const i = list.findIndex(same); if (i >= 0) list.splice(i, 1); else list.push(sig); };
  const near = (a, b) => Math.hypot(...a.map((v, i) => v - b[i])) < 1e-6;
  if (e.pick === 'edges' && hit?.kind === 'edge' && topo?.shape) {
    const sig = edgeSignature(topo.shape);
    updateFeature(() => toggle(f.edges, sig, (x) => near(x.mid, sig.mid)));
  } else if (e.pick === 'edges' && hit?.kind === 'face' && topo?.shape) {
    // A face: all of its edges (SolidWorks fillets a face's edges when the face is picked).
    updateFeature(() => { for (const edge of topo.shape.edges) { const sig = edgeSignature(edge); if (!f.edges.some((x) => near(x.mid, sig.mid))) f.edges.push(sig); } });
  } else if (e.pick === 'faces' && hit?.kind === 'face' && topo?.shape) {
    const sig = faceSignature(topo.shape);
    updateFeature(() => toggle(f.faces, sig, (x) => near(x.center, sig.center)));
  } else if (e.pick === 'holePoints') {
    if (!e.holeSketch.plane) {
      if (hit?.kind === 'face' && topo?.shape?.geomType === 'PLANE') e.holeSketch.plane = faceRef(topo.shape);
      else if (hit?.kind === 'plane') e.holeSketch.plane = planeRefOf(hit.id);
      else { notify('info', t('notice.pickPlanarFace')); return; }
    }
    // Where the pointer meets the face's plane, in the plane's coordinates.
    const main = buildPart(part);
    let fr;
    try { fr = resolvePlane(e.holeSketch.plane, { body: main.body, planes: main.result.planes }); } catch { notify('error', t('rebuild.face-missing')); return; }
    const ray = viewport.rayAt(ev.clientX, ev.clientY).ray;
    const p = ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...fr.normal), new THREE.Vector3(...fr.origin)), new THREE.Vector3());
    if (!p) return;
    const [u, v] = toSketch(fr, p.toArray());
    updateFeature(() => e.holeSketch.points.push([round3(u), round3(v)]));
  } else if (e.pick === 'seeds') {
    const fid = featureOfHit(hit);
    if (fid) updateFeature(() => { f.seeds = f.seeds.includes(fid) ? f.seeds.filter((x) => x !== fid) : [...f.seeds, fid]; });
    else notify('info', t('notice.pickSeedInTree'));
  } else if (e.pick === 'direction' && hit?.kind === 'edge' && topo?.shape) {
    updateFeature(() => { f.direction = { kind: 'edge', sig: edgeSignature(topo.shape) }; });
  } else if (e.pick === 'axis' && hit?.kind === 'edge' && topo?.shape) {
    updateFeature(() => { f.axis = { kind: 'edge', sig: edgeSignature(topo.shape) }; });
  } else if ((e.pick === 'plane' || e.pick === 'base') && (hit?.kind === 'plane' || (hit?.kind === 'face' && topo?.shape?.geomType === 'PLANE'))) {
    const ref = hit.kind === 'plane' ? planeRefOf(hit.id) : faceRef(topo.shape);
    updateFeature(() => { if (e.pick === 'plane') f.plane = ref; else f.base = ref; });
  }
}

const round3 = (v) => Math.round(v * 1000) / 1000;
const planeRefOf = (id) => (STD_PLANES[id] ? { kind: 'std', name: id } : { kind: 'ref', id });

/** The feature that made a picked face (pattern seeds): the latest tool feature whose tool touches the point. */
function featureOfHit(hit) {
  const part = activePart();
  if (!hit?.point || !part) return null;
  const entry = buildPart(part);
  const R = rep();
  const candidates = part.features.filter((f) => ['extrude', 'revolve', 'hole'].includes(f.type) && entry.result.results.get(f.id)?.tool).reverse();
  for (const f of candidates) {
    try { if (R.measureDistanceBetween(entry.result.results.get(f.id).tool, R.makeVertex(hit.point)) < 1e-3) return f.id; } catch { /* next */ }
  }
  return null;
}

// ───────────────────────── sketches

async function startSketch() {
  const part = activePart();
  if (!part) { notify('info', t('notice.partOnly')); return undefined; }
  await ensureKernel();
  if (state.editing) cancelEditing({ quiet: true });
  const sel = state.selection[0];
  if (sel?.kind === 'plane') return openNewSketch({ kind: 'std', name: sel.id });
  if (sel?.kind === 'feat' && part.features.find((f) => f.id === sel.id)?.type === 'plane') return openNewSketch({ kind: 'ref', id: sel.id });
  if (sel?.kind === 'face') {
    const shape = topoOf(sel)?.shape;
    if (shape?.geomType === 'PLANE') return openNewSketch(faceRef(shape));
  }
  state.editing = { mode: 'sketchPlane' };
  state.leftTab = 'pm';
  syncView();
  if (!state.partEntry?.mesh) viewport.setView('iso');
  renderAll();
  notify('info', t('notice.pickSketchPlane'));
  return undefined;
}

function pickSketchPlane(hit) {
  if (hit?.kind === 'plane') return openNewSketch(planeRefOf(hit.id));
  const topo = topoOf(hit);
  if (hit?.kind === 'face' && topo?.shape?.geomType === 'PLANE') return openNewSketch(faceRef(topo.shape));
  notify('info', t('notice.pickPlanarFace'));
  return undefined;
}

function openNewSketch(plane) {
  const part = activePart();
  const sketch = createFeature(part, 'sketch', { plane, ...createSketchGeometry() });
  state.editing = null;
  openSketchEditor(sketch, { isNew: true });
}

function editSketch(id) {
  const part = activePart();
  const f = part?.features.find((x) => x.id === id);
  if (!f || f.type !== 'sketch') return;
  if (state.editing) cancelEditing({ quiet: true });
  openSketchEditor(JSON.parse(JSON.stringify(f)), { isNew: false });
}

function openSketchEditor(sketch, { isNew }) {
  const part = activePart();
  const index = isNew ? (part.rollback ?? part.features.length) : part.features.findIndex((f) => f.id === sketch.id);
  const before = buildPart(part, { upTo: index, slot: 'sketch' });
  let fr;
  try { fr = resolvePlane(sketch.plane, { body: before.body, planes: before.result.planes }); }
  catch (error) { showError('error.sketchPlane', error); return; }
  const editor = new SketchEditor(sketchApi, sketch, fr);
  state.editing = { mode: 'sketch', editor, feature: sketch, isNew, index, startJson: JSON.stringify(sketch) };
  state.leftTab = 'pm';
  state.cmTab = 'sketch';
  state.selection = [];
  renderAll();
  syncView();
  viewport.setView(null, { frameOf: fr, fit: !isNew || Boolean(before.body) });
  if (isNew) editor.setTool('line');
  editor.render();
  notify('info', t(isNew ? 'notice.sketchStarted' : 'notice.sketchEditing', { name: sketch.name }));
}

/** What the sketch editor uses from the app. */
const sketchApi = {
  get viewport() { return viewport; },
  t,
  settings: () => state.settings,
  notify,
  formatValue: (v, kind) => (kind === 'angle' ? `${fmt(v)}°` : fmt(v / UNIT_FACTOR[units()])),
  changed: () => { renderLeft(); renderStatus(); renderToolbarState(); },
  onState: () => { renderLeft(); renderStatus(); renderToolbarState(); renderCommandManager(); },
  askValue: async ({ type, value, edit = false }) => {
    if (!state.settings.editDimOnCreate && !edit) return value;
    const angle = type === 'angle';
    const shown = angle ? fmt(value) : fmt(value / UNIT_FACTOR[units()]);
    const result = await popups.open('prompt', { title: t('dim.modify'), label: `${t(`dim.${type}`)} (${angle ? '°' : units()})`, value: shown });
    if (result?.value == null) return null;
    const v = parseLen(result.value, angle ? 'angle' : 'length');
    if (v == null || (!angle && v <= 0)) { notify('error', t('notice.invalidValue', { text: result.value })); return null; }
    return v;
  },
};

function exitSketch() {
  const e = state.editing;
  if (e?.mode !== 'sketch') return;
  const part = activePart();
  const sketch = e.editor.sketch;
  const changed = JSON.stringify(sketch) !== e.startJson;
  e.editor.dispose();
  state.editing = null;
  state.leftTab = 'tree';
  state.cmTab = 'features';
  if (e.isNew) {
    if (sketch.entities.length <= 1) { notify('info', t('notice.emptySketch')); syncView(); renderAll(); return; }
    state.selection = [{ kind: 'feat', id: sketch.id, key: `feat:${sketch.id}` }];
    change('op.addSketch', () => { part.features.splice(part.rollback ?? part.features.length, 0, sketch); if (part.rollback != null) part.rollback += 1; });
  } else {
    state.selection = [{ kind: 'feat', id: sketch.id, key: `feat:${sketch.id}` }];
    if (changed) change('op.editSketch', () => { const i = part.features.findIndex((f) => f.id === sketch.id); if (i >= 0) part.features[i] = sketch; });
    else { syncView(); renderAll(); }
  }
  notify('success', t('notice.sketchClosed', { name: sketch.name }));
}

function sketchCommand(tool) {
  if (!sketching()) { startSketch(); return; }
  state.editing.editor.setTool(tool);
  renderCommandManager();
  renderToolbarState();
  renderStatus();
}

function sketchStatusOf(f) {
  try { const r = analyse(f); return r.over ? 'over' : r.dof === 0 ? 'defined' : 'under'; } catch { return 'under'; }
}

// ───────────────────────── assemblies

async function startInsertComponent() {
  if (!activeAssembly()) { notify('info', t('notice.assemblyOnly')); return; }
  await ensureKernel();
  if (state.editing) cancelEditing({ quiet: true });
  state.editing = { mode: 'insert' };
  state.leftTab = 'pm';
  renderAll();
}

function insertComponent(partId) {
  const asm = activeAssembly();
  const part = project().parts.find((p) => p.id === partId);
  if (!asm || !part) return;
  const entry = buildPart(part);
  const first = asm.components.length === 0;
  const offset = first ? [0, 0, 0] : [assemblySize(asm) * 0.6 + (entry.size ?? 50) * 0.3, 0, 0];
  const c = { id: newId('cmp'), part: part.id, name: instanceName(asm, part.name, part.id), position: offset, rotation: quatIdentity(), fixed: first };
  state.selection = [{ kind: 'comp', id: c.id, key: `comp:${c.id}` }];
  change('op.insertComponent', () => { asm.components.push(c); });
  notify('success', t(first ? 'notice.componentFixed' : 'notice.componentInserted', { name: c.name }));
  fitView();
}

async function insertSamplePart(sampleId) {
  await ensureKernel();
  const p = buildSample(sampleId, lang());
  const part = p?.parts[0];
  if (!part) return;
  change('op.addPart', (pr) => { pr.parts.push(part); });
  insertComponent(part.id);
}

function startMate() {
  const asm = activeAssembly();
  if (!asm) { notify('info', t('notice.assemblyOnly')); return; }
  if (state.editing) cancelEditing({ quiet: true });
  state.editing = { mode: 'mate', mate: { id: newId('mate'), type: null, name: '', a: null, b: null, aligned: 'anti' }, isNew: true, pick: 'a' };
  state.leftTab = 'pm';
  state.selection = [];
  syncView();
  renderAll();
}

function pickForMate(hit) {
  const e = state.editing;
  const topo = topoOf(hit);
  if (hit?.kind !== 'face' || !topo?.comp) { notify('info', t('notice.pickComponentFace')); return; }
  const ent = { comp: topo.comp.id, ...mateEntityOfFace(topo.shape, faceSignature) };
  if (e.pick === 'a' || !e.mate.a) { e.mate.a = ent; e.pick = 'b'; }
  else {
    if (ent.comp === e.mate.a.comp) { notify('info', t('notice.sameComponent')); return; }
    e.mate.b = ent; e.pick = null;
  }
  if (e.mate.a && e.mate.b && !e.mate.type) e.mate.type = e.mate.a.kind === 'axis' && e.mate.b.kind === 'axis' ? 'concentric' : 'coincident';
  previewMate();
}

/** Tries the mate being made (components move live); OK keeps it, Cancel puts them back. */
function previewMate() {
  const e = state.editing;
  const asm = activeAssembly();
  e.base ??= JSON.stringify(asm.components);
  asm.components = JSON.parse(e.base);
  state.mateError = false;
  if (e.mate.a && e.mate.b && e.mate.type) {
    const trial = { ...asm, mates: [...asm.mates.filter((m) => m.id !== e.mate.id), e.mate] };
    const r = solveMates(trial, { entity: (ref) => mateEntityNow(ref), size: assemblySize(asm) });
    asm.components = trial.components;
    state.mateError = r.failed.includes(e.mate.id);
  }
  syncView();
  renderAll();
}

function acceptMate() {
  const e = state.editing;
  const asm = activeAssembly();
  if (!e.mate.a || !e.mate.b || !e.mate.type) { notify('error', t('notice.mateIncomplete')); return; }
  const count = asm.mates.filter((m) => m.type === e.mate.type).length + 1;
  const mate = { ...e.mate, name: e.mate.name || `${t(`mate.${e.mate.type}`)}${count}` };
  state.editing = null;
  state.leftTab = 'tree';
  change('op.addMate', () => { asm.mates = [...asm.mates.filter((m) => m.id !== mate.id), mate]; });
  const failed = state.failedMates.has(mate.id);
  notify(failed ? 'warning' : 'success', t(failed ? 'notice.mateFailed' : 'notice.mateAdded', { name: mate.name }));
}

function setComponentFixed(fixed) {
  const asm = activeAssembly();
  const ids = state.selection.filter((s) => s.kind === 'comp').map((s) => s.id);
  if (!asm || !ids.length) return;
  change(fixed ? 'op.fix' : 'op.float', () => { for (const c of asm.components) if (ids.includes(c.id)) c.fixed = fixed; });
}

function rotateComponent(axis, degrees) {
  const asm = activeAssembly();
  const ids = state.selection.filter((s) => s.kind === 'comp').map((s) => s.id);
  if (!asm || !ids.length) return;
  change('op.rotate', () => { for (const c of asm.components) if (ids.includes(c.id) && !c.fixed) c.rotation = quatMultiply(quatFromAxisAngle(axis, degrees), c.rotation); });
}

async function checkInterference() {
  const asm = activeAssembly();
  if (!asm) return;
  const R = rep();
  const bodies = new Map(project().parts.map((p) => [p.id, buildPart(p).body]));
  const list = await busy('progress.interference', asm.name, () => interferences(asm, (c) => (bodies.get(c.part) ? placeShape(bodies.get(c.part), c) : null), (s) => R.measureVolume(s)));
  const nameOf = (id) => asm.components.find((c) => c.id === id)?.name ?? id;
  notify(list.length ? 'warning' : 'success', list.length ? t('interference.found', { count: list.length }) : t('interference.none'));
  await popups.open('interference', { items: list.map((it) => ({ a: nameOf(it.a), b: nameOf(it.b), volume: it.volume })) });
}

// ───────────────────────── evaluate

function massPropertiesRows() {
  const R = rep();
  const part = activePart(); const asm = activeAssembly();
  const u = units(); const k = UNIT_FACTOR[u];
  if (part) {
    const body = buildPart(part).body;
    if (!body) return null;
    const vp = R.measureShapeVolumeProperties(body);
    const area = R.measureArea(body);
    const mat = materialOf(part.material);
    const mass = massOf(vp.volume, part.material);
    const [lo, hi] = body.boundingBox.bounds;
    const rows = [
      ['material', t('mass.material'), materialName(part.material, lang())], ['massProps', t('mass.density'), `${mat.density} kg/m³`],
      ['massProps', t('mass.mass'), `${fmt(mass * 1000)} g`], ['part', t('mass.volume'), `${fmt(vp.volume / k ** 3)} ${u}³`],
      ['featShell', t('mass.area'), `${fmt(area / k ** 2)} ${u}²`], ['origin', t('mass.centerOfMass'), `${vp.centerOfMass.map((v) => fmtLen(v, false)).join(', ')} ${u}`],
      ['autoDims', t('mass.boundingBox'), `${[0, 1, 2].map((i) => fmtLen(hi[i] - lo[i], false)).join(' × ')} ${u}`],
    ];
    return { name: part.name, material: materialName(part.material, lang()), rows, kind: 'part' };
  }
  if (asm) {
    let mass = 0; let volume = 0; const com = [0, 0, 0];
    for (const c of asm.components) {
      const p = project().parts.find((x) => x.id === c.part);
      const body = p && buildPart(p).body;
      if (!body) continue;
      const vp = R.measureShapeVolumeProperties(placeShape(body, c));
      const m = massOf(vp.volume, p.material);
      mass += m; volume += vp.volume;
      vp.centerOfMass.forEach((v, i) => { com[i] += v * m; });
    }
    if (mass > 0) com.forEach((v, i) => { com[i] = v / mass; });
    const rows = [['assembly', t('mass.components'), String(asm.components.length)], ['massProps', t('mass.mass'), `${fmt(mass * 1000)} g`], ['part', t('mass.volume'), `${fmt(volume / k ** 3)} ${u}³`], ['origin', t('mass.centerOfMass'), `${com.map((v) => fmtLen(v, false)).join(', ')} ${u}`]];
    return { name: asm.name, material: '', rows, kind: 'assembly' };
  }
  return null;
}

async function showMassProperties() {
  await ensureKernel();
  const info = massPropertiesRows();
  if (!info) { notify('info', t('notice.noBody')); return; }
  await popups.open('massprops', info);
}

function startMeasure() {
  if (state.editing) cancelEditing({ quiet: true });
  state.editing = { mode: 'measure', picks: [], result: [] };
  state.leftTab = 'pm';
  renderAll();
}

function pickForMeasure(hit, ev) {
  const e = state.editing;
  const topo = topoOf(hit);
  if (!topo?.shape) return;
  if (!(ev.ctrlKey || ev.shiftKey) && e.picks.length >= 2) e.picks = [];
  const shape = topo.comp ? placeShape(topo.shape, topo.comp) : topo.shape;
  e.picks.push({ kind: hit.kind, shape, hit, label: `${t(hit.kind === 'edge' ? 'pm.edge' : 'pm.face')} ${e.picks.length + 1}${topo.comp ? ` — ${topo.comp.name}` : ''}` });
  const R = rep();
  const k = UNIT_FACTOR[units()];
  const out = [];
  try {
    if (e.picks.length === 1) {
      const p = e.picks[0];
      if (p.kind === 'edge') {
        const len = R.measureLength(p.shape);
        out.push([t('measure.length'), fmtLen(len)]);
        if (p.shape.geomType === 'CIRCLE') out.push([t('measure.diameter'), fmtLen(len / Math.PI)]);
      } else {
        out.push([t('measure.area'), `${fmt(R.measureArea(p.shape) / k ** 2)} ${units()}²`]);
        const sig = faceSignature(p.shape);
        if (sig.radius) out.push([t('measure.diameter'), fmtLen(sig.radius * 2)]);
      }
    } else {
      const [a, b] = e.picks.slice(-2);
      out.push([t('measure.distance'), fmtLen(R.measureDistanceBetween(a.shape, b.shape))]);
      if (a.kind === 'face' && b.kind === 'face') {
        const na = faceSignature(a.shape).normal; const nb = faceSignature(b.shape).normal;
        out.push([t('measure.angle'), `${fmt((Math.acos(Math.max(-1, Math.min(1, na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2]))) * 180) / Math.PI)}°`]);
      }
    }
  } catch (error) { out.push([t('measure.error'), native.errorText(error)]); }
  e.result = out;
  viewport.setSelection(e.picks.map((p) => p.hit));
  renderLeft();
  notify('info', out.map(([a, b]) => `${a}: ${b}`).join(' · '));
}

function toggleSection() {
  if (!viewport) return;
  if (state.section) { state.section = null; viewport.setSection(null); notify('info', t('notice.sectionOff')); }
  else {
    const c = viewport.contentBox().getCenter(new THREE.Vector3());
    state.section = { normal: [0, 0, 1], offset: c.z };
    viewport.setSection(state.section);
    notify('info', t('notice.sectionOn'));
    if (!state.settings.showRightPanel) updateSettings({ showRightPanel: true });
    state.rightTab = 'display';
  }
  renderToolbarState();
  renderRight();
}

// ───────────────────────── tree operations

function deleteSelection() {
  if (sketching()) { state.editing.editor.deleteSelection(); state.editing.editor.render(); renderLeft(); return; }
  const part = activePart(); const asm = activeAssembly();
  const feats = state.selection.filter((s) => s.kind === 'feat').map((s) => s.id);
  if (part && feats.length) {
    const all = new Set(feats);
    for (const id of feats) for (const d of allDependents(part, id)) all.add(d);
    for (const id of [...all]) { const f = part.features.find((x) => x.id === id); if (f?.sketch && !part.features.some((x) => x.sketch === f.sketch && !all.has(x.id))) all.add(f.sketch); }
    state.selection = [];
    change('op.delete', () => { part.features = part.features.filter((f) => !all.has(f.id)); if (part.rollback != null && part.rollback > part.features.length) part.rollback = null; });
    notify('success', t('notice.deleted', { count: all.size }));
    return;
  }
  if (asm) {
    const comps = state.selection.filter((s) => s.kind === 'comp').map((s) => s.id);
    const mates = state.selection.filter((s) => s.kind === 'mate').map((s) => s.id);
    if (!comps.length && !mates.length) return;
    state.selection = [];
    change('op.delete', () => {
      asm.components = asm.components.filter((c) => !comps.includes(c.id));
      asm.mates = asm.mates.filter((m) => !mates.includes(m.id) && !comps.includes(m.a.comp) && !comps.includes(m.b.comp));
    });
    return;
  }
  const drw = activeDrawing();
  if (drw && state.drawingSelected) { const id = state.drawingSelected; state.drawingSelected = null; change('op.delete', () => { drw.views = drw.views.filter((v) => v.id !== id); }); }
}

function setSuppressed(value) {
  const part = activePart();
  const ids = state.selection.filter((s) => s.kind === 'feat').map((s) => s.id);
  if (!part || !ids.length) return;
  const all = new Set(ids);
  if (value) for (const id of ids) for (const d of allDependents(part, id)) all.add(d);
  change(value ? 'op.suppress' : 'op.unsuppress', () => { for (const f of part.features) if (all.has(f.id)) { if (value) f.suppressed = true; else delete f.suppressed; } });
}

function rollbackTo(index) {
  const part = activePart();
  if (!part) return;
  const at = index == null || index >= part.features.length ? null : Math.max(0, index);
  if ((part.rollback ?? null) === at) return;
  change('op.rollback', () => { part.rollback = at; });
}

function renameItem(key, name) {
  const value = String(name ?? '').trim();
  if (!value) return;
  const part = activePart(); const asm = activeAssembly(); const drw = activeDrawing();
  change('op.rename', (p) => {
    if (key === 'doc') { (part ?? asm ?? drw).name = value; if (documentsOf(p).length === 1) p.name = value; }
    else if (key.startsWith('feat:')) { const f = part?.features.find((x) => x.id === key.slice(5)); if (f) f.name = value; }
    else if (key.startsWith('comp:')) { const c = asm?.components.find((x) => x.id === key.slice(5)); if (c) c.name = value; }
    else if (key.startsWith('mate:')) { const m = asm?.mates.find((x) => x.id === key.slice(5)); if (m) m.name = value; }
  });
}

async function renameSelected() {
  const s = state.selection[0];
  if (!s) return;
  const current = s.kind === 'doc' ? active()?.name : s.kind === 'feat' ? activePart()?.features.find((f) => f.id === s.id)?.name : s.kind === 'comp' ? activeAssembly()?.components.find((c) => c.id === s.id)?.name : s.kind === 'mate' ? activeAssembly()?.mates.find((m) => m.id === s.id)?.name : '';
  const result = await popups.open('prompt', { title: t('action.rename'), label: t('pm.name'), value: current ?? '' });
  if (result?.value != null) renameItem(s.key, result.value);
}

// ───────────────────────── drawings

async function newDrawing() {
  const p = project();
  if (!p) return;
  await ensureKernel();
  const src = activeAssembly() ? { kind: 'assembly', id: activeAssembly().id } : activePart() ? { kind: 'part', id: activePart().id } : p.parts[0] ? { kind: 'part', id: p.parts[0].id } : null;
  if (!src) { notify('info', t('notice.drawingNeedsModel')); return; }
  const srcDoc = findDocument(p, src);
  let d;
  if (state.editing) cancelEditing({ quiet: true });
  change('op.newDrawing', (pr) => {
    d = addDrawing(pr, src, `${srcDoc.name} - ${t('drawing.sheetName')}${pr.drawings.length + 1}`);
    d.projection = state.settings.projection;
    d.title.partNo = srcDoc.partNo ?? '';
    pr.active = { kind: 'drawing', id: d.id };
  });
  fitDrawing();
  renderDrawing();
  notify('success', t('notice.drawingCreated', { name: d.name }));
}

const projectionCache = new Map();

/** The model a drawing shows, as one shape (an assembly: its placed parts as a compound). */
function drawingShape(d) {
  const p = project();
  const src = findDocument(p, d.source);
  if (!src) return { key: 'none', shape: null };
  if (d.source.kind === 'part') { const b = buildPart(src); return { key: b.key, shape: b.body }; }
  const R = rep();
  const shapes = []; const keys = [];
  for (const c of src.components) {
    if (c.hidden) continue;
    const part = p.parts.find((x) => x.id === c.part);
    const b = part && buildPart(part);
    if (!b?.body) continue;
    shapes.push(placeShape(b.body, c)); keys.push(b.key, JSON.stringify([c.position, c.rotation]));
  }
  return { key: keys.join('|'), shape: shapes.length ? R.makeCompound(shapes) : null };
}

function drawingProjections(d) {
  const { key, shape } = drawingShape(d);
  const out = new Map();
  if (!shape) return out;
  for (const v of d.views) {
    const k = `${key}|${v.type}`;
    if (!projectionCache.has(k)) projectionCache.set(k, projectView(shape, v.type));
    out.set(v.id, projectionCache.get(k));
  }
  if (projectionCache.size > 80) projectionCache.clear();
  return out;
}

function drawingLabels() {
  const keys = ['view.front', 'view.back', 'view.top', 'view.bottom', 'view.left', 'view.right', 'view.iso', 'view.dimetric', 'title.name', 'title.partNo', 'title.material', 'title.mass', 'title.scale', 'title.sheet', 'title.drawnBy', 'title.checkedBy', 'title.date', 'title.revision'];
  return Object.fromEntries(keys.map((k) => [k, t(k)]));
}

function drawingInfo(d) {
  const src = findDocument(project(), d.source);
  if (!src) return {};
  if (d.source.kind === 'part') {
    const body = buildPart(src).body;
    let mass = '';
    try { mass = body ? `${fmt(massOf(rep().measureVolume(body), src.material) * 1000)} g` : ''; } catch { /* none */ }
    return { name: src.name, material: materialName(src.material, lang()), mass };
  }
  return { name: src.name, material: '', mass: '' };
}

function renderDrawing() {
  const host = root.querySelector('#drawing-host');
  const d = activeDrawing();
  if (!host || !d) return;
  if (!kernelReady()) { host.innerHTML = `<p class="panel-hint">${icon('hourglass')}<span>${escapeHtml(t('progress.kernelLoading'))}</span></p>`; return; }
  let svg;
  try { svg = drawingSvg(d, drawingProjections(d), { labels: drawingLabels(), info: drawingInfo(d), selected: state.drawingSelected }); }
  catch (error) { host.innerHTML = `<p class="panel-hint error">${icon('error')}<span>${escapeHtml(native.errorText(error))}</span></p>`; return; }
  const scroll = host.querySelector('.drawing-scroll');
  const pos = scroll ? [scroll.scrollLeft, scroll.scrollTop] : null;
  const [sheetW] = SHEETS[d.sheet] ?? SHEETS.A3;
  host.innerHTML = `<div class="drawing-scroll"><div class="drawing-paper" style="width:${Math.round(sheetW * (96 / 25.4) * state.drawingZoom)}px">${svg}</div></div>
    <div class="drawing-tools">
      <button class="icon-button" data-drw="zoomOut" title="${escapeHtml(t('action.zoomOut'))}">${icon('zoomOut')}</button>
      <span class="drawing-zoom">${Math.round(state.drawingZoom * 100)}%</span>
      <button class="icon-button" data-drw="zoomIn" title="${escapeHtml(t('action.zoomIn'))}">${icon('zoomIn')}</button>
      <button class="icon-button" data-drw="zoomFit" title="${escapeHtml(t('action.zoomFit'))}">${icon('zoomExtents')}</button>
    </div>`;
  const s2 = host.querySelector('.drawing-scroll');
  if (pos) [s2.scrollLeft, s2.scrollTop] = pos;
}

function drawingAction(action) {
  const d = activeDrawing();
  if (!d) return undefined;
  const [cmd, arg] = action.split(':');
  if (cmd === 'zoomIn') { state.drawingZoom = Math.min(6, state.drawingZoom * 1.25); return renderDrawing(); }
  if (cmd === 'zoomOut') { state.drawingZoom = Math.max(0.2, state.drawingZoom / 1.25); return renderDrawing(); }
  if (cmd === 'zoomFit') { fitDrawing(); return renderDrawing(); }
  if (cmd === 'addView') return change('op.addView', () => { d.views.push({ id: newId('v'), type: arg, ...(arg === 'iso' || arg === 'dimetric' ? { hidden: false } : {}) }); });
  if (cmd === 'removeView') return change('op.removeView', () => { d.views = d.views.filter((v) => v.id !== arg); });
  return undefined;
}

function fitDrawing() {
  const d = activeDrawing(); const host = root.querySelector('#drawing-host');
  if (!d || !host || !host.clientWidth) return;
  const [W, H] = SHEETS[d.sheet] ?? SHEETS.A3;
  const px = 96 / 25.4;
  state.drawingZoom = Math.max(0.2, Math.min((host.clientWidth - 48) / (W * px), (host.clientHeight - 48) / (H * px)));
}

// ───────────────────────── commands

const sel = () => state.selection.length > 0;
const asmOpen = () => Boolean(activeAssembly());
const notDrawing = () => hasDoc() && activeKind() !== 'drawing';
const toggle = (key) => updateSettings({ [key]: !state.settings[key] });
const featureCommand = (type, glyph, label) => ({ icon: glyph, label, enabled: () => Boolean(activePart()) && !sketching(), run: () => startFeature(type) });
const skCommand = (tool, glyph, key = null) => ({ icon: glyph, label: `sketch.tool.${tool}`, key, enabled: () => Boolean(activePart()), checked: () => sketching() && state.editing.editor.tool === tool, run: () => sketchCommand(tool) });
const viewCommand = (name, glyph) => ({ icon: glyph, label: `view.${name}`, enabled: notDrawing, run: () => viewport.setView(name) });
const styleCommand = (style, glyph) => ({ icon: glyph, label: `style.${style}`, enabled: notDrawing, checked: () => state.settings.displayStyle === style, run: () => updateSettings({ displayStyle: style }) });

const commands = {
  // file
  newPart: { icon: 'partNew', label: 'action.newPart', key: 'Ctrl+N', run: () => (hasDoc() ? addPartToProject() : newDocument('part')) },
  newProjectPart: { icon: 'fileNew', label: 'action.newProject', run: () => newDocument('part') },
  newAssembly: { icon: 'assemblyNew', label: 'action.newAssembly', run: () => (hasDoc() ? addAssemblyToProject() : newDocument('assembly')) },
  newDrawing: { icon: 'drawingNew', label: 'action.newDrawing', enabled: () => Boolean(activePart() || activeAssembly()), run: () => newDrawing() },
  openExample: { icon: 'samples', label: 'action.openExample', run: (c) => examplesMenu(c?.anchor) },
  open: { icon: 'folderOpen', label: 'action.open', key: 'Ctrl+O', run: () => openWithDialog() },
  startPage: { icon: 'home', label: 'action.startPage', key: 'Ctrl+Shift+H', checked: () => state.showStart || !state.doc, run: () => showStartPage(!state.showStart || !state.doc) },
  save: { icon: 'save', label: 'action.save', key: 'Ctrl+S', enabled: hasDoc, run: () => saveDoc() },
  saveAs: { icon: 'saveAs', label: 'action.saveAs', key: 'Ctrl+Shift+S', enabled: hasDoc, run: () => saveDoc({ saveAs: true }) },
  recent: { icon: 'recent', label: 'action.recent', key: 'Ctrl+R', run: () => popups.open('recent', {}) },
  recentFolders: { icon: 'recentFolder', label: 'action.recentFolders', run: (c) => recentFoldersMenu(c?.anchor) },
  clearRecent: { icon: 'clearHistory', label: 'action.clearRecent', enabled: () => state.recent.length > 0 || state.recentDirs.length > 0, run: () => clearRecentAll() },
  importStep: { icon: 'stepFile', label: 'action.importStep', key: 'Ctrl+I', run: () => importStepDialog() },
  exportMenu: { icon: 'chevronDown', label: 'action.exportMenu', enabled: hasDoc, run: (c) => showMenu(menuItems(SUBMENUS.exportTo.items), c?.anchor ?? anchorFor('exportMenu'), 'context', { header: { icon: 'exportFile', title: t('submenu.exportTo') } }) },
  exportStep: { icon: 'stepFile', label: 'action.exportStep', enabled: () => Boolean(activePart() || activeAssembly()), run: () => exportModel('step') },
  exportStl: { icon: 'stlFile', label: 'action.exportStl', enabled: () => Boolean(activePart() || activeAssembly()), run: () => exportModel('stl') },
  exportImage: { icon: 'exportImage', label: 'action.exportImage', key: 'Ctrl+Shift+E', enabled: hasDoc, run: () => exportImage() },
  exportDxf: { icon: 'dxfFile', label: 'action.exportDxf', enabled: () => Boolean(activeDrawing()), run: () => exportDrawing('dxf') },
  exportSvg: { icon: 'svgFile', label: 'action.exportSvg', enabled: () => Boolean(activeDrawing()), run: () => exportDrawing('svg') },
  print: { icon: 'print', label: 'action.print', key: 'Ctrl+P', enabled: hasDoc, run: () => printDocument() },
  closeProject: { icon: 'closeTab', label: 'action.closeProject', key: 'Ctrl+W', enabled: () => Boolean(state.doc), run: () => closeProject() },
  exitProject: { icon: 'exitProject', label: 'action.exitProject', enabled: () => Boolean(state.doc) && !state.showStart, run: () => closeProject() },
  exit: { icon: 'exit', label: 'action.exit', key: isMac ? 'Ctrl+Q' : 'Alt+F4', run: () => requestExit() },
  // edit
  undo: { icon: 'undo', label: 'action.undo', key: 'Ctrl+Z', enabled: () => Boolean(doc()?.history.canUndo) && !state.editing, run: () => undo() },
  redo: { icon: 'redo', label: 'action.redo', key: 'Ctrl+Y', enabled: () => Boolean(doc()?.history.canRedo) && !state.editing, run: () => redo() },
  delete: { icon: 'trash', label: 'action.delete', key: 'Delete', enabled: () => sel() || (sketching() && state.editing.editor.selection.length > 0) || Boolean(state.drawingSelected), run: () => deleteSelection() },
  rename: { icon: 'edit', label: 'action.rename', key: 'F2', enabled: () => state.selection.length === 1 && ['doc', 'feat', 'comp', 'mate'].includes(state.selection[0].kind), run: () => renameSelected() },
  rebuild: { icon: 'rebuild', label: 'action.rebuild', key: 'Ctrl+B', enabled: hasDoc, run: () => { builds.clear(); projectionCache.clear(); if (activeAssembly()) solveAssembly(); syncView(); renderAll(); notify('success', t('notice.rebuilt', { ms: Math.round(state.partEntry?.ms ?? 0) })); } },
  editFeature: { icon: 'editFeature', label: 'action.editFeature', enabled: () => state.selection.length === 1 && state.selection[0].kind === 'feat', run: () => editFeature(state.selection[0].id) },
  suppress: { icon: 'suppress', label: 'action.suppress', enabled: () => state.selection.some((s) => s.kind === 'feat'), run: () => setSuppressed(true) },
  unsuppress: { icon: 'unsuppress', label: 'action.unsuppress', enabled: () => state.selection.some((s) => s.kind === 'feat'), run: () => setSuppressed(false) },
  rollbackHere: { icon: 'rollback', label: 'action.rollbackHere', enabled: () => state.selection.length === 1 && state.selection[0].kind === 'feat', run: () => rollbackTo(activePart().features.findIndex((f) => f.id === state.selection[0].id) + 1) },
  rollbackEnd: { icon: 'rollback', label: 'action.rollbackEnd', enabled: () => activePart()?.rollback != null, run: () => rollbackTo(null) },
  clearSelection: { icon: 'deselect', label: 'action.clearSelection', key: 'Esc', enabled: sel, run: () => clearSelection() },
  // features
  sketch: { icon: 'featSketch', label: 'cmd.sketch', enabled: () => Boolean(activePart()), checked: () => sketching(), run: () => (sketching() ? exitSketch() : startSketch()) },
  extrude: featureCommand('extrude', 'featExtrude', 'cmd.extrude'),
  revolve: featureCommand('revolve', 'featRevolve', 'cmd.revolve'),
  cutExtrude: featureCommand('cutExtrude', 'featCut', 'cmd.cutExtrude'),
  cutRevolve: featureCommand('cutRevolve', 'featCutRevolve', 'cmd.cutRevolve'),
  fillet: featureCommand('fillet', 'featFillet', 'cmd.fillet'),
  chamfer: featureCommand('chamfer', 'featChamfer', 'cmd.chamfer'),
  shell: featureCommand('shell', 'featShell', 'cmd.shell'),
  hole: featureCommand('hole', 'featHole', 'cmd.hole'),
  linearPattern: featureCommand('linearPattern', 'featLinPattern', 'cmd.linearPattern'),
  circularPattern: featureCommand('circularPattern', 'featCirPattern', 'cmd.circularPattern'),
  mirror: featureCommand('mirror', 'featMirror', 'cmd.mirror'),
  refPlane: featureCommand('plane', 'refPlane', 'cmd.plane'),
  material: { icon: 'material', label: 'cmd.material', enabled: () => Boolean(activePart()), run: (c) => materialMenu(c?.anchor) },
  // sketch
  exitSketch: { icon: 'exitSketch', label: 'sketch.exit', enabled: sketching, run: () => exitSketch() },
  cancelSketch: { icon: 'close', label: 'sketch.cancel', enabled: sketching, run: () => cancelEditing() },
  'sk:select': skCommand('select', 'select'),
  'sk:line': skCommand('line', 'lineTool', 'L'),
  'sk:centerline': skCommand('centerline', 'centerline'),
  'sk:rect': skCommand('rect', 'rectTool', 'R'),
  'sk:centerRect': skCommand('centerRect', 'centerRect'),
  'sk:circle': skCommand('circle', 'circleTool', 'C'),
  'sk:arc3': skCommand('arc3', 'threePointArc', 'A'),
  'sk:centerArc': skCommand('centerArc', 'centerArc'),
  'sk:polygon': skCommand('polygon', 'polygonTool', 'P'),
  'sk:slot': skCommand('slot', 'slotTool'),
  'sk:point': skCommand('point', 'pointTool'),
  'sk:dimension': skCommand('dimension', 'smartDim', 'D'),
  'sk:trim': skCommand('trim', 'trimTool', 'T'),
  construction: { icon: 'constructionToggle', label: 'sketch.construction', enabled: () => sketching() && state.editing.editor.selection.length > 0, run: () => { state.editing.editor.toggleConstruction(); state.editing.editor.render(); } },
  normalTo: { icon: 'normalTo', label: 'action.normalTo', key: 'Ctrl+8', enabled: notDrawing, run: () => normalTo() },
  // view
  ...Object.fromEntries(['front', 'back', 'top', 'bottom', 'left', 'right', 'iso', 'dimetric', 'trimetric'].map((v) => [`view:${v}`, viewCommand(v, { iso: 'viewIso', dimetric: 'viewIso', trimetric: 'viewIso', top: 'viewTop', front: 'viewFront', back: 'viewBack', left: 'viewLeft', right: 'viewRight', bottom: 'viewBottom' }[v])])),
  viewsMenu: { icon: 'chevronDown', label: 'action.viewsMenu', enabled: notDrawing, run: (c) => showMenu(menuItems(SUBMENUS.views.items), c?.anchor ?? anchorFor('viewsMenu'), 'context', { header: { icon: 'views', title: t('submenu.views') } }) },
  zoomFit: { icon: 'zoomExtents', label: 'action.zoomFit', key: 'F', enabled: hasDoc, run: () => (activeDrawing() ? (fitDrawing(), renderDrawing()) : fitView()) },
  perspective: { icon: 'perspective', label: 'action.perspective', enabled: notDrawing, checked: () => state.settings.perspectiveView, run: () => toggle('perspectiveView') },
  ...Object.fromEntries([['shadedEdges', 'styleShaded'], ['shaded', 'styleWhite'], ['hiddenRemoved', 'styleHidden'], ['hiddenVisible', 'styleXray'], ['wireframe', 'styleWireframe']].map(([s, g]) => [`style:${s}`, styleCommand(s, g)])),
  styleMenu: { icon: 'chevronDown', label: 'action.styleMenu', enabled: notDrawing, run: (c) => showMenu(menuItems(SUBMENUS.displayStyle.items), c?.anchor ?? anchorFor('styleMenu'), 'context', { header: { icon: 'styleShaded', title: t('submenu.displayStyle') } }) },
  styleCycle: { icon: 'styleShaded', label: 'action.styleCycle', key: 'K', enabled: notDrawing, run: () => { const list = ['shadedEdges', 'shaded', 'hiddenRemoved', 'hiddenVisible', 'wireframe']; updateSettings({ displayStyle: list[(list.indexOf(state.settings.displayStyle) + 1) % list.length] }); } },
  section: { icon: 'sectionView', label: 'action.section', enabled: notDrawing, checked: () => Boolean(state.section), run: () => toggleSection() },
  showPlanes: { icon: 'refPlane', label: 'action.showPlanes', checked: () => state.settings.showPlanes, run: () => toggle('showPlanes') },
  showOrigin: { icon: 'origin', label: 'action.showOrigin', checked: () => state.settings.showOrigin, run: () => toggle('showOrigin') },
  showSketches: { icon: 'featSketch', label: 'action.showSketches', checked: () => state.settings.showSketches, run: () => toggle('showSketches') },
  leftPanel: { icon: 'panelLeft', label: 'action.leftPanel', key: 'Ctrl+Shift+1', checked: () => state.settings.showLeftPanel, run: () => toggle('showLeftPanel') },
  rightPanel: { icon: 'panelRight', label: 'action.rightPanel', key: 'Ctrl+Shift+2', checked: () => state.settings.showRightPanel, run: () => toggle('showRightPanel') },
  bottomPanel: { icon: 'panelBottom', label: 'action.bottomPanel', key: 'Ctrl+J', checked: () => state.settings.showBottomPanel, run: () => toggle('showBottomPanel') },
  statusBar: { icon: 'statusBar', label: 'action.statusBar', checked: () => state.settings.showStatusBar, run: () => toggle('showStatusBar') },
  fps: { icon: 'fps', label: 'action.fps', checked: () => state.settings.showFps, run: () => toggle('showFps') },
  // evaluate
  massProps: { icon: 'massProps', label: 'cmd.massProps', enabled: () => Boolean(activePart() || activeAssembly()), run: () => showMassProperties() },
  measure: { icon: 'measureTool', label: 'cmd.measure', enabled: () => Boolean(activePart() || activeAssembly()), checked: () => state.editing?.mode === 'measure', run: () => (state.editing?.mode === 'measure' ? cancelEditing({ quiet: true }) : startMeasure()) },
  interference: { icon: 'interference', label: 'cmd.interference', enabled: asmOpen, run: () => checkInterference() },
  // assembly
  insertComponent: { icon: 'insertComponent', label: 'cmd.insertComponent', enabled: asmOpen, run: () => startInsertComponent() },
  mate: { icon: 'mate', label: 'cmd.mate', enabled: () => asmOpen() && (activeAssembly()?.components.length ?? 0) > 1, run: () => startMate() },
  fixComponent: { icon: 'fixComponent', label: 'cmd.fix', enabled: () => asmOpen() && state.selection.some((s) => s.kind === 'comp'), run: () => setComponentFixed(true) },
  floatComponent: { icon: 'floatComponent', label: 'cmd.float', enabled: () => asmOpen() && state.selection.some((s) => s.kind === 'comp'), run: () => setComponentFixed(false) },
  rotateComponent: { icon: 'rotateRight', label: 'cmd.rotate90', enabled: () => asmOpen() && state.selection.some((s) => s.kind === 'comp'), run: () => rotateComponent([0, 1, 0], 90) },
  openPart: { icon: 'part', label: 'cmd.openPart', enabled: () => asmOpen() && state.selection.length === 1 && state.selection[0].kind === 'comp', run: () => { const c = activeAssembly().components.find((x) => x.id === state.selection[0].id); if (c) switchDocument({ kind: 'part', id: c.part }); } },
  // drawing
  addView: { icon: 'drawingView', label: 'cmd.addView', enabled: () => Boolean(activeDrawing()), run: (c) => addViewMenu(c?.anchor) },
  std3View: { icon: 'standard3View', label: 'cmd.std3View', enabled: () => Boolean(activePart() || activeAssembly() || activeDrawing()), run: () => standardThreeView() },
  hiddenLines: { icon: 'hiddenLines', label: 'drawing.hiddenLines', enabled: () => Boolean(activeDrawing()), checked: () => activeDrawing()?.showHidden !== false, run: () => change('op.edit', () => { const d = activeDrawing(); d.showHidden = d.showHidden === false; }) },
  autoDims: { icon: 'autoDims', label: 'drawing.dims', enabled: () => Boolean(activeDrawing()), checked: () => activeDrawing()?.showDims !== false, run: () => change('op.edit', () => { const d = activeDrawing(); d.showDims = d.showDims === false; }) },
  // appearance
  theme: { icon: 'palette', label: 'action.themeRandom', run: () => updateSettings({ theme: randomThemeId(state.settings.theme) }) },
  themeMenu: { icon: 'chevronDown', label: 'action.themeChoose', run: (c) => openThemePicker(c?.anchor) },
  language: { icon: 'globe', label: 'action.language', key: 'Ctrl+Shift+L', run: () => updateSettings({ language: getLanguage() === 'ko' ? 'en' : 'ko' }) },
  shuffleBackground: { icon: 'dice', label: 'action.shuffleBackground', key: 'Ctrl+Shift+B', run: () => shuffleBackground() },
  backgroundImage: { icon: 'imageBg', label: 'action.backgroundImage', run: () => chooseBackground() },
  clearBackground: { icon: 'imageClear', label: 'action.clearBackground', enabled: () => Boolean(state.settings.backgroundImage) || state.settings.backgroundKind !== 'none', run: () => removeBackground() },
  // help
  userGuide: { icon: 'userGuide', label: 'action.userGuide', key: 'F1', run: () => openDocWindow('guide') },
  shortcuts: { icon: 'keyboard', label: 'action.shortcuts', run: () => popups.open('settings', { tab: 'shortcuts' }) },
  settings: { icon: 'gear', label: 'action.settings', key: 'Ctrl+,', run: () => popups.open('settings', { tab: 'general' }) },
  about: { icon: 'info', label: 'action.about', run: () => popups.open('about') },
  welcome: { icon: 'bulb', label: 'action.welcome', run: () => openWelcome() },
};

function normalTo() {
  if (sketching()) { viewport.setView(null, { frameOf: state.editing.editor.frame }); return; }
  const s = state.selection[0];
  if (s?.kind === 'face') {
    const topo = topoOf(s);
    if (topo?.shape?.geomType === 'PLANE') {
      const r = faceRef(topo.shape);
      let fr = makeFrame({ origin: r.origin, xDir: r.xDir, normal: faceSignature(topo.shape).normal });
      if (topo.comp) { const q = new THREE.Quaternion(...topo.comp.rotation); fr = { ...fr, normal: new THREE.Vector3(...fr.normal).applyQuaternion(q).toArray(), yDir: new THREE.Vector3(...fr.yDir).applyQuaternion(q).toArray() }; }
      viewport.setView(null, { frameOf: fr });
      return;
    }
  }
  if (s?.kind === 'plane') { viewport.setView(null, { frameOf: makeFrame(STD_PLANES[s.id]) }); return; }
  viewport.setView('front');
}

function standardThreeView() {
  if (activeDrawing()) {
    change('op.edit', () => { const d = activeDrawing(); d.views = [{ id: newId('v'), type: 'front' }, { id: newId('v'), type: 'top' }, { id: newId('v'), type: 'right' }, { id: newId('v'), type: 'iso', hidden: false }]; });
    return undefined;
  }
  return newDrawing();
}

function addViewMenu(anchor) {
  const d = activeDrawing();
  if (!d) return undefined;
  const handlers = {};
  const items = ['front', 'top', 'right', 'left', 'back', 'bottom', 'iso', 'dimetric'].map((v) => { handlers[`custom:view:${v}`] = () => drawingAction(`addView:${v}`); return { id: `custom:view:${v}`, label: t(`view.${v}`), icon: v === 'iso' || v === 'dimetric' ? 'isoView' : 'drawingView', disabled: d.views.some((x) => x.type === v) }; });
  return showMenu(items, anchor ?? anchorFor('addView'), 'context', { handlers, header: { icon: 'drawingView', title: t('cmd.addView') } });
}

function materialMenu(anchor) {
  const part = activePart();
  if (!part) return undefined;
  const handlers = {};
  const items = MATERIALS.map((m) => { handlers[`custom:mat:${m.id}`] = () => setMaterial(m.id); return { id: `custom:mat:${m.id}`, label: `${lang() === 'en' ? m.en : m.ko} — ${m.density} kg/m³`, icon: 'material', checked: part.material === m.id }; });
  return showMenu(items, anchor ?? anchorFor('material'), 'context', { handlers, header: { icon: 'material', title: t('cmd.material') } });
}

function setMaterial(id) {
  const part = activePart();
  if (!part) return;
  change('op.material', () => { part.material = id; });
  notify('success', t('notice.material', { name: materialName(id, lang()) }));
}

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

const SUBMENUS = {
  newDoc: { icon: 'fileNew', items: ['newPart', 'newAssembly', 'newDrawing', '-', 'newProjectPart'] },
  exportTo: { icon: 'exportFile', items: ['exportStep', 'exportStl', 'exportImage', '-', 'exportDxf', 'exportSvg'] },
  views: { icon: 'views', items: ['view:front', 'view:back', 'view:top', 'view:bottom', 'view:left', 'view:right', '-', 'view:iso', 'view:dimetric', 'view:trimetric', '-', 'normalTo'] },
  displayStyle: { icon: 'styleShaded', items: ['style:shadedEdges', 'style:shaded', 'style:hiddenRemoved', 'style:hiddenVisible', 'style:wireframe'] },
  show: { icon: 'eye', items: ['showPlanes', 'showOrigin', 'showSketches', '-', 'leftPanel', 'rightPanel', 'bottomPanel', 'statusBar', 'fps'] },
  appearance: { icon: 'palette', items: ['theme', 'themeMenu', 'language', '-', 'shuffleBackground', 'backgroundImage', 'clearBackground'] },
  sketchEntities: { icon: 'lineTool', items: ['sk:line', 'sk:centerline', 'sk:rect', 'sk:centerRect', 'sk:circle', 'sk:arc3', 'sk:centerArc', 'sk:polygon', 'sk:slot', 'sk:point'] },
  patterns: { icon: 'featLinPattern', items: ['linearPattern', 'circularPattern', 'mirror'] },
};
const sub = (key) => ({ sub: key });
const MENUS = {
  file: [sub('newDoc'), 'openExample', 'open', 'startPage', 'recent', 'recentFolders', 'clearRecent', '-', 'save', 'saveAs', '-', 'importStep', sub('exportTo'), '-', 'print', '-', 'closeProject', 'exit'],
  edit: ['undo', 'redo', '-', 'delete', 'rename', '-', 'rebuild', 'editFeature', 'suppress', 'unsuppress', '-', 'rollbackHere', 'rollbackEnd', '-', 'clearSelection'],
  view: [sub('views'), 'zoomFit', 'perspective', '-', sub('displayStyle'), 'section', '-', sub('show'), '-', sub('appearance')],
  insert: ['sketch', '-', 'extrude', 'revolve', 'cutExtrude', 'cutRevolve', '-', 'fillet', 'chamfer', 'shell', 'hole', '-', sub('patterns'), '-', 'refPlane', 'material'],
  sketch: ['sketch', 'exitSketch', 'cancelSketch', '-', 'sk:select', sub('sketchEntities'), '-', 'sk:dimension', 'sk:trim', 'construction', '-', 'normalTo'],
  tools: ['massProps', 'measure', '-', 'insertComponent', 'mate', 'fixComponent', 'floatComponent', 'interference', '-', 'newDrawing', 'std3View', 'addView', '-', 'settings'],
  help: ['welcome', 'userGuide', 'shortcuts', '-', 'settings', 'about'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', view: 'eye', insert: 'featExtrude', sketch: 'featSketch', tools: 'tools', help: 'question' };

const TOOLBAR = [
  ['newPart', 'newAssembly', 'newDrawing', 'open', 'save', 'print', 'exportSplit', 'importStep', 'exitProject'],
  ['undo', 'redo', 'rebuild'],
  ['viewsSplit', 'zoomFit', 'normalTo', 'perspective'],
  ['styleSplit', 'section'],
  ['massProps', 'measure'],
  ['leftPanel', 'bottomPanel', 'rightPanel'],
];
const TOOLBAR_RIGHT = ['themeSplit', 'language', 'settings', 'about'];
const TOOLBAR_MAIN = { exportSplit: 'exportStep', themeSplit: 'theme', viewsSplit: 'view:iso', styleSplit: 'styleCycle' };

/** The CommandManager: tabs of big buttons above the graphics area (SolidWorks' ribbon). */
const COMMAND_TABS = {
  features: ['sketch', '|', 'extrude', 'revolve', 'cutExtrude', 'cutRevolve', '|', 'fillet', 'chamfer', 'shell', 'hole', '|', 'linearPattern', 'circularPattern', 'mirror', '|', 'refPlane', 'material', 'rebuild'],
  sketch: ['sketch', 'sk:dimension', '|', 'sk:line', 'sk:centerline', 'sk:rect', 'sk:centerRect', 'sk:circle', 'sk:arc3', 'sk:centerArc', 'sk:polygon', 'sk:slot', 'sk:point', '|', 'sk:trim', 'construction', 'normalTo', 'sk:select'],
  evaluate: ['massProps', 'measure', 'section', 'interference'],
  assembly: ['insertComponent', 'mate', 'fixComponent', 'floatComponent', 'rotateComponent', 'openPart', '|', 'interference', 'massProps'],
  drawing: ['newDrawing', 'std3View', 'addView', 'hiddenLines', 'autoDims', '|', 'exportDxf', 'exportSvg', 'print'],
};

function visibleCommandTabs() {
  const kind = activeKind();
  if (kind === 'part') return ['features', 'sketch', 'evaluate', 'drawing'];
  if (kind === 'assembly') return ['assembly', 'evaluate', 'drawing'];
  if (kind === 'drawing') return ['drawing'];
  return [];
}

// ───────────────────────── shell

function renderShell() {
  root.innerHTML = `
    <div class="app-bg" aria-hidden="true"><canvas class="anim-bg"></canvas><div class="image-bg"></div></div>
    <nav id="menubar" role="menubar"></nav>
    <div id="toolbar" role="toolbar"></div>
    <main id="workspace">
      <aside id="left-panel" class="side-panel" aria-label="${escapeHtml(t('panel.tree'))}"></aside>
      <div class="splitter vertical panel-split" data-split="left" role="separator" aria-orientation="vertical"></div>
      <section id="center">
        <div id="tabs"></div>
        <div id="center-body">
          <div id="palette-host" class="command-manager"></div>
          <div id="view-host" class="view-host"></div>
          <div id="drawing-host" class="drawing-host" hidden></div>
          <div id="start-page" hidden></div>
        </div>
        <div class="splitter horizontal bottom-split" data-split="bottom" title="${escapeHtml(t('bottom.splitter'))}" role="separator" aria-orientation="horizontal"></div>
        <section id="bottom-panel" aria-label="${escapeHtml(t('bottom.title'))}"></section>
      </section>
      <div class="splitter vertical panel-split" data-split="right" role="separator" aria-orientation="vertical"></div>
      <aside id="right-panel" class="side-panel" aria-label="${escapeHtml(t('panel.task'))}"></aside>
    </main>
    <footer id="statusbar" role="status"></footer>
    ${desktop ? `<div class="resize-grip" data-resize-grip title="${escapeHtml(t('tip.resize'))}" role="separator">${icon('grip')}</div>` : `<div class="resize-grip static" aria-hidden="true">${icon('grip')}</div>`}`;
}

function renderMenubar() {
  const menubar = root.querySelector('#menubar');
  const onStart = state.showStart || !state.doc;
  const home = `<button class="menubar-item menubar-home ${onStart ? 'current' : ''}" data-home title="${escapeHtml(t('tip.home'))}" aria-pressed="${onStart}">${icon('home')}<span>${escapeHtml(t('menu.home'))}</span></button><span class="menubar-sep" aria-hidden="true"></span>`;
  const brand = `<div class="app-brand" data-window-drag title="${escapeHtml(`MyMechanics v${VERSION}`)}"><img class="app-brand-icon" src="${APP_ICON}" alt="" data-window-drag /><span class="app-brand-name" data-window-drag>MyMechanics</span><span class="app-brand-version" data-window-drag>v${escapeHtml(VERSION)}</span></div>`;
  const button = (id, glyph, key) => `<button class="window-button ${id === 'close' ? 'close' : ''}" data-window="${id}" title="${escapeHtml(t(key))}" aria-label="${escapeHtml(t(key))}">${icon(glyph)}</button>`;
  const controls = desktop ? `<div class="window-controls">${button('minimize', 'winMinimize', 'window.minimize')}${state.maximized ? button('maximize', 'winRestore', 'window.restore') : button('maximize', 'winMaximize', 'window.maximize')}${button('close', 'winClose', 'window.close')}</div>` : '';
  const projectName = '<span class="menubar-project" data-window-drag><span class="app-brand-project-name" data-window-drag></span><span class="app-brand-dirty" data-window-drag>●</span></span>';
  menubar.innerHTML = brand + home + Object.keys(MENUS).map((name) => `<button class="menubar-item ${state.openMenu === name ? 'open' : ''}" data-menu="${name}" role="menuitem" aria-haspopup="true" title="${escapeHtml(t(`menu.${name}`))}">${icon(MENU_ICONS[name])}<span>${escapeHtml(t(`menu.${name}`))}</span></button>`).join('') + projectName + `<div class="menubar-drag" data-window-drag></div>${controls}`;
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
  if (desktop) appWindow.setTitle(d ? `${docName(d)}${d.dirty ? ' *' : ''} — MyMechanics` : `MyMechanics v${VERSION}`).catch(() => {});
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
}

let toolbarLanguage = null;
function renderToolbar() {
  const toolbar = root.querySelector('#toolbar');
  toolbarLanguage = getLanguage();
  const plain = (id) => {
    const c = commands[id];
    const glyph = id === 'language' ? switchFlag(getLanguage()) : icon(c.icon);
    return `<button class="tool-button" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(c.label))}">${glyph}</button>`;
  };
  const split = (main, arrow, label) => `<span class="split-button">${plain(main)}<button class="tool-button split-arrow" data-command="${arrow}" title="${escapeHtml(commandTip(arrow))}" aria-label="${escapeHtml(t(label))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
  const button = (id) => {
    if (id === 'exportSplit') return split('exportStep', 'exportMenu', 'action.exportMenu');
    if (id === 'themeSplit') return split('theme', 'themeMenu', 'action.themeChoose');
    if (id === 'viewsSplit') return split('view:iso', 'viewsMenu', 'action.viewsMenu');
    if (id === 'styleSplit') return split('styleCycle', 'styleMenu', 'action.styleMenu');
    return plain(id);
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
  for (const el of root.querySelectorAll('#toolbar [data-command], #palette-host [data-command], #tabs [data-command]')) {
    const id = el.dataset.command;
    el.disabled = !commandEnabled(id);
    const checked = commands[id]?.checked?.();
    el.classList.toggle('active', Boolean(checked));
    if (checked !== undefined) el.setAttribute('aria-pressed', String(Boolean(checked)));
  }
  const styleBtn = root.querySelector('#toolbar [data-command="styleCycle"]');
  if (styleBtn) styleBtn.innerHTML = icon(commands[`style:${state.settings.displayStyle}`]?.icon ?? 'styleShaded');
}

function updateMinimumWidth() {
  const left = root.querySelector('.toolbar-left');
  const right = root.querySelector('.toolbar-right');
  if (!left || !right) return;
  requestAnimationFrame(() => {
    const toolbar = root.querySelector('#toolbar');
    const style = getComputedStyle(toolbar);
    const menus = [...root.querySelectorAll('.app-brand, .menubar-item, .window-controls')].reduce((sum, el) => sum + el.offsetWidth + 2, 48);
    const folded = [...left.querySelectorAll('[data-group], [data-group-sep]')].filter((el) => el.hidden);
    const more = left.querySelector('[data-toolbar-more]');
    const moreHidden = more?.hidden;
    for (const el of folded) el.hidden = false;
    if (more) more.hidden = true;
    const full = left.scrollWidth + right.scrollWidth + 24 + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 2;
    for (const el of folded) el.hidden = true;
    if (more) more.hidden = moreHidden;
    const screenWidth = window.screen?.availWidth || Infinity;
    const width = Math.ceil(Math.min(screenWidth, Math.max(menus, full)));
    if (Math.abs(width - state.minWidth) < 1) return;
    state.minWidth = width;
    document.documentElement.style.setProperty('--min-width', `${width}px`);
    native.setMinimumSize(width, 640).catch(() => {});
  });
}

/** Document tabs: every part, assembly and drawing of the project (SolidWorks' open document windows). */
function renderTabs() {
  renderTitleProject();
  const tabs = root.querySelector('#tabs');
  const p = state.showStart ? null : project();
  if (!p) { tabs.innerHTML = ''; return; }
  const glyph = { part: 'part', assembly: 'assembly', drawing: 'drawing' };
  const list = documentsOf(p);
  tabs.innerHTML = `<div class="tab-strip">${list.map(({ kind, doc: d }) => `<button class="tab ${p.active?.id === d.id ? 'active' : ''}" data-doc-tab="${kind}:${escapeHtml(d.id)}" title="${escapeHtml(`${t(`doc.${kind}`)}: ${d.name}`)}">${icon(glyph[kind])}<span>${escapeHtml(d.name)}</span>${list.length > 1 ? `<span class="tab-close" data-doc-close="${kind}:${escapeHtml(d.id)}" title="${escapeHtml(t('tabs.removeDoc'))}">${icon('close', 'icon tiny')}</span>` : ''}</button>`).join('')}
      <button class="tab-add" data-command="newPart" title="${escapeHtml(commandTip('newPart'))}">${icon('plus')}</button></div>
    <span class="grow"></span>
    <div class="tabs-right">${activeKind() !== 'drawing' ? `<span class="seg-toggle" role="group">${['front', 'top', 'right', 'iso'].map((v) => `<button data-command="view:${v}" title="${escapeHtml(commandTip(`view:${v}`))}">${icon(commands[`view:${v}`].icon)}<span>${escapeHtml(t(`view.${v}Short`))}</span></button>`).join('')}</span>` : ''}</div>`;
}

function renderCommandManager() {
  const host = root.querySelector('#palette-host');
  if (!host) return;
  const tabs = visibleCommandTabs();
  host.hidden = state.showStart || !state.doc || !tabs.length;
  if (host.hidden) { host.innerHTML = ''; return; }
  if (!tabs.includes(state.cmTab)) state.cmTab = tabs[0];
  const ids = COMMAND_TABS[state.cmTab];
  host.innerHTML = `<div class="cm-tabs" role="tablist">${tabs.map((id) => `<button class="cm-tab ${state.cmTab === id ? 'active' : ''}" data-cm-tab="${id}" role="tab" aria-selected="${state.cmTab === id}">${escapeHtml(t(`cm.${id}`))}</button>`).join('')}</div>
    <div class="cm-buttons">${ids.map((id) => (id === '|' ? '<span class="cm-sep" aria-hidden="true"></span>' : `<button class="cm-button" data-command="${id}" title="${escapeHtml(commandTip(id))}">${icon(commands[id].icon)}<span>${escapeHtml(t(commands[id].label))}</span></button>`)).join('')}</div>`;
  fitCommandManager();
  renderToolbarState();
}

/** Labels go when the buttons do not fit the width (icons only, names in the tooltips). */
function fitCommandManager() {
  const host = root.querySelector('#palette-host');
  const row = host?.querySelector('.cm-buttons');
  if (!row) return;
  host.classList.remove('compact');
  if (row.scrollWidth > row.clientWidth + 1) host.classList.add('compact');
}

// ───────────────────────── left panel: FeatureManager / PropertyManager

function renderLeft() {
  const panel = root.querySelector('#left-panel');
  if (!panel) return;
  if (state.showStart || !state.doc) { panel.innerHTML = ''; return; }
  if (!state.settings.showLeftPanel) {
    panel.innerHTML = `<div class="panel-rail"><button class="rail-button expand" data-command="leftPanel" title="${escapeHtml(t('panel.expandLeft'))}">${icon('panelLeftOpen')}<span class="rail-label">${escapeHtml(t('panel.expand'))}</span></button><div class="rail-title">${icon('featExtrude')}<span>${escapeHtml(t('panel.treeShort'))}</span></div></div>`;
    return;
  }
  const editing = Boolean(state.editing);
  if (!editing && state.leftTab === 'pm') state.leftTab = 'tree';
  const tabs = [['tree', 'featExtrude', t('panel.tree')], ['pm', 'editFeature', t('panel.pm')]];
  const scroll = panel.querySelector('.panel-body')?.scrollTop ?? 0;
  let body = '';
  if (state.leftTab === 'pm' && editing) body = propertyManagerHtml(pmApi());
  else body = treeHtml(treeApi());
  panel.innerHTML = `<div class="panel-header">${icon(state.leftTab === 'pm' ? 'editFeature' : 'featExtrude')}<span>${escapeHtml(state.leftTab === 'pm' ? t('panel.pm') : t('panel.tree'))}</span>
      <button class="icon-button" data-command="leftPanel" title="${escapeHtml(t('panel.collapseLeft'))}">${icon('panelLeftClose')}</button></div>
    <div class="editor-tabs" role="tablist">${tabs.map(([id, glyph, label]) => `<button class="editor-tab ${state.leftTab === id ? 'active' : ''}" data-left-tab="${id}" role="tab" ${id === 'pm' && !editing ? 'disabled' : ''}>${icon(glyph)}<span>${escapeHtml(label)}</span></button>`).join('')}</div>
    <div class="panel-body left-${state.leftTab}">${body}</div>`;
  panel.querySelector('.panel-body').scrollTop = scroll;
}

function treeApi() {
  const part = activePart();
  return {
    t, lang: lang(), project: project(), doc: active(), kind: activeKind(),
    build: part && kernelReady() ? buildPart(part).result : null,
    selection: new Set(state.selection.map((s) => s.key)),
    collapsed: state.collapsed,
    hiddenPlanes: state.hiddenPlanes,
    sketchStatus: (f) => sketchStatusOf(f),
    editingId: state.editing?.feature?.id ?? null,
    mateStatus: state.mateStatus,
    failedMates: state.failedMates,
  };
}

function pmApi() {
  const part = activePart();
  return {
    t, fmt, fmtLen: (v) => fmtLen(v), editing: state.editing, project: project(),
    previewResult: state.previewResult,
    mateError: state.mateError,
    featureName: (id) => part?.features.find((f) => f.id === id)?.name ?? null,
    sketchById: (id) => part?.features.find((f) => f.id === id) ?? null,
    sketchOptions: (f) => {
      if (!part) return [];
      const index = part.features.findIndex((x) => x.id === f.id);
      const before = index < 0 ? part.features.slice(0, part.rollback ?? part.features.length) : part.features.slice(0, index);
      return before.filter((x) => x.type === 'sketch' && (x.id === f.sketch || !part.features.some((y) => y.sketch === x.id && y.id !== f.id)));
    },
    componentName: (id) => activeAssembly()?.components.find((c) => c.id === id)?.name ?? '?',
    sampleParts: SAMPLES.filter((s) => s.group !== 'assembly').map((s) => ({ id: s.id, name: s[lang()][0], icon: s.icon })),
  };
}

// ───────────────────────── right panel: task pane

const RIGHT_TABS = [['props', 'entityInfo'], ['materials', 'material'], ['display', 'styleShaded']];

function renderRight() {
  const panel = root.querySelector('#right-panel');
  if (!panel) return;
  if (state.showStart || !state.doc) { panel.innerHTML = ''; return; }
  if (!state.settings.showRightPanel) {
    panel.innerHTML = `<div class="panel-rail"><button class="rail-button expand" data-command="rightPanel" title="${escapeHtml(t('panel.expandRight'))}">${icon('panelRightOpen')}<span class="rail-label">${escapeHtml(t('panel.expand'))}</span></button><div class="rail-title">${icon('entityInfo')}<span>${escapeHtml(t('panel.taskShort'))}</span></div></div>`;
    return;
  }
  const focused = document.activeElement;
  if (focused && panel.contains(focused) && focused.matches('input[type="text"], textarea')) {
    clearTimeout(renderRight.timer);
    renderRight.timer = setTimeout(() => { if (!panel.contains(document.activeElement)) renderRight(); }, 400);
    return;
  }
  const drw = activeDrawing();
  let body;
  if (drw) body = drawingPropsHtml({ t }, drw);
  else if (state.rightTab === 'materials') body = materialsHtml();
  else if (state.rightTab === 'display') body = displayHtml();
  else body = propsHtml();
  const scroll = panel.querySelector('.panel-body')?.scrollTop ?? 0;
  panel.innerHTML = `<div class="panel-header">${icon(drw ? 'sheet' : 'entityInfo')}<span>${escapeHtml(drw ? t('drawing.properties') : t('panel.task'))}</span>
      <button class="icon-button" data-command="rightPanel" title="${escapeHtml(t('panel.collapseRight'))}">${icon('panelRightClose')}</button></div>
    ${drw ? '' : `<div class="editor-tabs" role="tablist">${RIGHT_TABS.map(([id, glyph]) => `<button class="editor-tab ${state.rightTab === id ? 'active' : ''}" data-right-tab="${id}" role="tab">${icon(glyph)}<span>${escapeHtml(t(`task.${id}`))}</span></button>`).join('')}</div>`}
    <div class="panel-body right-${state.rightTab}">${body}</div>`;
  panel.querySelector('.panel-body').scrollTop = scroll;
}

const propRow = (glyph, label, value) => `<div class="prop-row" title="${escapeHtml(label)}"><span class="prop-label">${icon(glyph)}<span>${escapeHtml(label)}</span></span><span class="prop-value">${value}</span></div>`;
const propInput = (key, value) => `<input type="text" data-prop="${escapeHtml(key)}" value="${escapeHtml(value ?? '')}" spellcheck="false"/>`;
const actionsHtml = (ids) => `<div class="prop-actions">${ids.map((id) => `<button class="small-button ${id === 'delete' ? 'danger' : ''}" data-command="${id}">${icon(commands[id].icon)}<span>${escapeHtml(t(commands[id].label))}</span></button>`).join('')}</div>`;

function propsHtml() {
  const s = state.selection[0];
  const part = activePart(); const asm = activeAssembly();
  const out = [];
  if (part && (!s || s.kind === 'doc' || s.kind === 'material' || s.kind === 'plane' || s.kind === 'origin')) {
    out.push(`<h4 class="prop-title">${icon('part')}<span>${escapeHtml(t('props.part'))}</span></h4>`);
    out.push(propRow('edit', t('props.name'), propInput('part.name', part.name)));
    out.push(propRow('tag', t('props.partNo'), propInput('part.partNo', part.partNo)));
    out.push(propRow('notes', t('props.description'), propInput('part.description', part.description)));
    out.push(propRow('material', t('props.material'), `<select data-prop="part.material" data-icon="material">${MATERIALS.map((m) => `<option value="${m.id}" ${m.id === part.material ? 'selected' : ''}>${escapeHtml(lang() === 'en' ? m.en : m.ko)}</option>`).join('')}</select>`));
    out.push(propRow('palette', t('props.color'), `<input type="color" data-prop="part.color" value="${escapeHtml(part.color || materialOf(part.material).color)}"/><button class="small-button" data-prop-reset="part.color" title="${escapeHtml(t('props.colorReset'))}">${icon('refresh')}</button>`));
    const b = kernelReady() ? buildPart(part) : null;
    if (b?.body) {
      try {
        const v = rep().measureVolume(b.body);
        out.push(propRow('massProps', t('mass.mass'), escapeHtml(`${fmt(massOf(v, part.material) * 1000)} g`)));
        out.push(propRow('part', t('mass.volume'), escapeHtml(`${fmt(v / UNIT_FACTOR[units()] ** 3)} ${units()}³`)));
        out.push(propRow('statistics', t('props.topology'), escapeHtml(t('props.topologyValue', { faces: b.faces?.length ?? 0, edges: b.edgeList?.length ?? 0, features: part.features.length }))));
        out.push(propRow('clock', t('props.rebuildTime'), escapeHtml(`${Math.round(b.ms)} ms`)));
      } catch { /* measurement failed */ }
    }
    return out.join('');
  }
  if (part && s?.kind === 'feat') {
    const f = part.features.find((x) => x.id === s.id);
    if (!f) return '';
    const r = kernelReady() ? buildPart(part).result.results.get(f.id) : null;
    out.push(`<h4 class="prop-title">${icon(featureIcon(f))}<span>${escapeHtml(f.name)}</span></h4>`);
    out.push(propRow('edit', t('props.name'), propInput(`feat.${f.id}.name`, f.name)));
    out.push(propRow('info', t('props.type'), escapeHtml(t(`feature.${nameKey(f)}`))));
    out.push(propRow(r?.ok === false ? 'error' : 'check', t('props.state'), escapeHtml(r?.ok === false ? t(`rebuild.${r.error}`, null, r.error) : f.suppressed ? t('props.suppressed') : r?.rolledBack ? t('props.rolledBack') : t('props.ok'))));
    if (f.type === 'sketch') { const a = analyse(f); out.push(propRow('dofFree', t('props.dof'), escapeHtml(a.over ? t('sketch.status.over') : a.dof === 0 ? t('sketch.status.defined') : t('sketch.status.under', { dof: a.dof })))); }
    for (const [k, unit] of [['depth', 'len'], ['depth2', 'len'], ['radius', 'len'], ['distance', 'len'], ['thickness', 'len'], ['diameter', 'len'], ['spacing', 'len'], ['offset', 'len'], ['angle', 'deg'], ['count', 'n']]) {
      if (f[k] == null || (k === 'depth2' && (!f.end2 || f.end2 === 'none')) || (k === 'depth' && f.type === 'extrude' && !['blind', 'midplane'].includes(f.end))) continue;
      out.push(propRow('smartDim', t(`pm.${k === 'depth2' ? 'depth' : k === 'count' ? 'instances' : k}`), propInput(`feat.${f.id}.${k}`, unit === 'len' ? fmtLen(f[k]) : unit === 'deg' ? `${fmt(f[k])}°` : String(f[k]))));
    }
    out.push(actionsHtml(['editFeature', f.suppressed ? 'unsuppress' : 'suppress', 'delete']));
    return out.join('');
  }
  if (part && (s?.kind === 'face' || s?.kind === 'edge')) {
    const topo = topoOf(s);
    if (topo?.shape) {
      const R = rep();
      out.push(`<h4 class="prop-title">${icon(s.kind === 'face' ? 'part' : 'lineTool')}<span>${escapeHtml(t(s.kind === 'face' ? 'pm.face' : 'pm.edge'))}</span></h4>`);
      out.push(propRow('info', t('props.type'), escapeHtml(t(`geom.${topo.shape.geomType}`, null, topo.shape.geomType))));
      try {
        if (s.kind === 'face') { out.push(propRow('featShell', t('measure.area'), escapeHtml(`${fmt(R.measureArea(topo.shape) / UNIT_FACTOR[units()] ** 2)} ${units()}²`))); const sig = faceSignature(topo.shape); if (sig.radius) out.push(propRow('dimDiameter', t('measure.diameter'), escapeHtml(fmtLen(sig.radius * 2)))); }
        else out.push(propRow('measureTool', t('measure.length'), escapeHtml(fmtLen(R.measureLength(topo.shape)))));
      } catch { /* measurement failed */ }
      out.push(actionsHtml(s.kind === 'face' ? ['sketch', 'hole', 'shell', 'fillet'] : ['fillet', 'chamfer']));
    }
    return out.join('');
  }
  if (asm && s?.kind === 'comp') {
    const c = asm.components.find((x) => x.id === s.id);
    if (!c) return '';
    const part2 = project().parts.find((p) => p.id === c.part);
    const { axis, angle } = quatToAxisAngle(c.rotation);
    out.push(`<h4 class="prop-title">${icon('part')}<span>${escapeHtml(c.name)}</span></h4>`);
    out.push(propRow('edit', t('props.name'), propInput(`comp.${c.id}.name`, c.name)));
    out.push(propRow('part', t('props.partFile'), escapeHtml(part2?.name ?? '—')));
    out.push(propRow(c.fixed ? 'fixComponent' : 'floatComponent', t('props.state'), escapeHtml(c.fixed ? t('props.fixed') : state.mateStatus.get(c.id) === 'defined' ? t('props.fullyDefined') : t('props.underDefined'))));
    for (const [i, a] of ['X', 'Y', 'Z'].entries()) out.push(propRow('position', `${t('props.position')} ${a}`, propInput(`comp.${c.id}.pos.${i}`, fmtLen(c.position[i]))));
    out.push(propRow('rotateRight', t('props.rotation'), escapeHtml(`${fmt(angle)}° (${axis.map((v) => fmt(v, 2)).join(', ')})`)));
    out.push(actionsHtml([c.fixed ? 'floatComponent' : 'fixComponent', 'rotateComponent', 'openPart', 'delete']));
    return out.join('');
  }
  if (asm && s?.kind === 'mate') {
    const m = asm.mates.find((x) => x.id === s.id);
    if (!m) return '';
    out.push(`<h4 class="prop-title">${icon(MATE_ICONS[m.type] ?? 'mate')}<span>${escapeHtml(m.name)}</span></h4>`);
    out.push(propRow('info', t('props.type'), escapeHtml(t(`mate.${m.type}`))));
    if (m.type === 'distance' || m.type === 'angle') out.push(propRow('smartDim', t('pm.value'), propInput(`mate.${m.id}.value`, m.type === 'angle' ? `${fmt(m.value)}°` : fmtLen(m.value))));
    out.push(propRow(state.failedMates.has(m.id) ? 'error' : 'check', t('props.state'), escapeHtml(state.failedMates.has(m.id) ? t('props.mateFails') : t('props.ok'))));
    out.push(actionsHtml(['delete']));
    return out.join('');
  }
  if (asm) {
    out.push(`<h4 class="prop-title">${icon('assembly')}<span>${escapeHtml(asm.name)}</span></h4>`);
    out.push(propRow('edit', t('props.name'), propInput('asm.name', asm.name)));
    out.push(propRow('part', t('props.components'), escapeHtml(String(asm.components.length))));
    out.push(propRow('mate', t('props.mates'), escapeHtml(String(asm.mates.length))));
    out.push(actionsHtml(['insertComponent', 'mate', 'interference']));
    return out.join('');
  }
  return `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('props.none'))}</span></p>`;
}

function materialsHtml() {
  const part = activePart();
  if (!part) return `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('props.partOnlyMaterial'))}</span></p>`;
  const groups = [...new Set(MATERIALS.map((m) => m.group))];
  return groups.map((g) => `<h4 class="prop-title">${icon('material')}<span>${escapeHtml(t(`matGroup.${g}`))}</span></h4><div class="material-list">${MATERIALS.filter((m) => m.group === g).map((m) => `<button class="material-card ${part.material === m.id ? 'active' : ''}" data-material="${m.id}" title="${escapeHtml(`${lang() === 'en' ? m.en : m.ko} · ${m.density} kg/m³ · E ${m.E} GPa · σy ${m.yield} MPa`)}"><span class="material-swatch" style="background:linear-gradient(135deg, ${m.color}, color-mix(in srgb, ${m.color} 55%, #000))"></span><span class="material-name">${escapeHtml(lang() === 'en' ? m.en : m.ko)}</span><small>${m.density} kg/m³</small></button>`).join('')}</div>`).join('');
}

function displayHtml() {
  const styles = [['shadedEdges', 'styleShaded'], ['shaded', 'styleWhite'], ['hiddenRemoved', 'styleHidden'], ['hiddenVisible', 'styleXray'], ['wireframe', 'styleWireframe']];
  const out = [`<h4 class="prop-title">${icon('styleShaded')}<span>${escapeHtml(t('submenu.displayStyle'))}</span></h4><div class="display-styles">${styles.map(([s, g]) => `<button class="small-button ${state.settings.displayStyle === s ? 'active' : ''}" data-command="style:${s}">${icon(g)}<span>${escapeHtml(t(`style.${s}`))}</span></button>`).join('')}</div>`];
  out.push(`<h4 class="prop-title">${icon('eye')}<span>${escapeHtml(t('submenu.show'))}</span></h4>`);
  for (const id of ['showPlanes', 'showOrigin', 'showSketches', 'perspective', 'section']) out.push(`<label class="pm-check"><input type="checkbox" data-command-check="${id}" ${commands[id].checked() ? 'checked' : ''}/>${icon(commands[id].icon)}<span>${escapeHtml(t(commands[id].label))}</span></label>`);
  if (state.section && viewport) {
    out.push(`<h4 class="prop-title">${icon('sectionView')}<span>${escapeHtml(t('action.section'))}</span></h4>`);
    out.push(`<div class="pm-row">${['x', 'y', 'z'].map((a, i) => `<button class="small-button ${state.section.normal[i] ? 'active' : ''}" data-section-axis="${i}">${escapeHtml(a.toUpperCase())}</button>`).join('')}</div>`);
    const box = viewport.contentBox();
    const i = state.section.normal.findIndex((v) => v);
    const lo = box.min.getComponent(i); const hi = box.max.getComponent(i);
    out.push(`<label class="pm-field"><span class="pm-label">${escapeHtml(t('pm.offset'))}</span><input type="range" data-section-offset min="${lo}" max="${hi}" step="${(hi - lo) / 200 || 0.1}" value="${state.section.offset}"/></label>`);
  }
  return out.join('');
}

// ───────────────────────── bottom panel

const SEV_ICON = { error: 'error', warning: 'warning', info: 'info', success: 'check' };

function renderBottom() {
  const host = root.querySelector('#bottom-panel');
  if (!host) return;
  if (!state.settings.showBottomPanel || state.showStart || !state.doc) { host.innerHTML = ''; return; }
  const problems = rebuildProblems();
  const failedMates = activeAssembly() ? activeAssembly().mates.filter((m) => state.failedMates.has(m.id)) : [];
  const count = problems.length + failedMates.length;
  const tabs = [['rebuild', count ? 'error' : 'check', t('bottom.rebuild'), count], ['messages', 'info', t('bottom.messages'), state.log.length], ['info', 'massProps', t('bottom.info'), null]];
  const tabHtml = `<span class="segmented" role="tablist">${tabs.map(([id, glyph, label, n]) => `<button class="segment ${state.bottomTab === id ? 'active' : ''}" data-bottom-tab="${id}" role="tab" aria-selected="${state.bottomTab === id}" title="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span>${n != null ? `<i class="bottom-count">${n}</i>` : ''}</button>`).join('')}</span>`;
  let tools = ''; let body = '';
  if (state.bottomTab === 'rebuild') {
    tools = `<span class="grow"></span><button class="small-button" data-command="rebuild">${icon('rebuild')}<span>${escapeHtml(t('action.rebuild'))}</span></button>`;
    const rows = [
      ...problems.map((p) => `<div class="problem-row bottom-row error" data-problem="${escapeHtml(p.feature.id)}" title="${escapeHtml(p.detail ?? '')}"><span class="cell sev">${icon('error')}</span><span class="cell"><b>${escapeHtml(p.feature.name)}</b></span><span class="cell">${escapeHtml(t(`rebuild.${p.error}`, null, p.error))}</span><span class="cell fix">${escapeHtml(t(`rebuild.fix.${p.error}`, null, t('rebuild.fix.default')))}</span></div>`),
      ...failedMates.map((m) => `<div class="problem-row bottom-row error"><span class="cell sev">${icon('error')}</span><span class="cell"><b>${escapeHtml(m.name)}</b></span><span class="cell">${escapeHtml(t('props.mateFails'))}</span><span class="cell fix">${escapeHtml(t('rebuild.fix.mate'))}</span></div>`),
    ];
    body = rows.length ? `<div class="problem-row head"><span class="cell"></span><span class="cell">${escapeHtml(t('bottom.feature'))}</span><span class="cell">${escapeHtml(t('bottom.message'))}</span><span class="cell">${escapeHtml(t('bottom.fix'))}</span></div>${rows.join('')}` : `<p class="problems-empty">${icon('check')}<span>${escapeHtml(t('bottom.noErrors'))}</span></p>`;
  } else if (state.bottomTab === 'messages') {
    tools = `<span class="grow"></span><button class="small-button danger" data-bottom-clear ${state.log.length ? '' : 'disabled'}>${icon('clearHistory')}<span>${escapeHtml(t('action.clearMessages'))}</span></button>`;
    body = state.log.length ? state.log.map((e) => `<div class="problem-row bottom-row log-row ${e.kind === 'error' ? 'error' : e.kind === 'info' ? '' : e.kind}" title="${escapeHtml(e.detail || e.text)}"><span class="cell sev">${icon(SEV_ICON[e.kind] ?? 'info')}</span><span class="cell">${escapeHtml(e.text)}</span><span class="cell muted">${escapeHtml(e.detail.split('\n')[0] ?? '')}</span><span class="cell muted">${escapeHtml(e.at.toLocaleTimeString())}</span></div>`).join('') : `<p class="problems-empty">${icon('info')}<span>${escapeHtml(t('bottom.noMessages'))}</span></p>`;
  } else {
    let info = null;
    try { info = kernelReady() && (activePart() || activeAssembly()) ? massPropertiesRows() : null; } catch { info = null; }
    body = info ? info.rows.map(([glyph, label, value]) => `<div class="problem-row bottom-row info-row"><span class="cell sev">${icon(glyph)}</span><span class="cell"><b>${escapeHtml(label)}</b></span><span class="cell info-value">${escapeHtml(value)}</span></div>`).join('') : `<p class="problems-empty">${icon('info')}<span>${escapeHtml(t('notice.noBody'))}</span></p>`;
  }
  const scroll = host.querySelector('.problems-list')?.scrollTop ?? 0;
  host.innerHTML = `<div class="problems-header">${tabHtml}${tools}<button class="icon-button" data-command="bottomPanel" title="${escapeHtml(t('bottom.hide'))}">${icon('close')}</button></div><div class="problems-list bottom-${state.bottomTab}" tabindex="0">${body}</div>`;
  host.querySelector('.problems-list').scrollTop = scroll;
}

// ───────────────────────── status bar

function renderStatus() {
  const bar = root.querySelector('#statusbar');
  if (!bar) return;
  const s = state.settings;
  const notice = state.notice;
  const e = state.editing;
  const hint = notice?.text ?? (e?.mode === 'sketch' ? t(`sketch.hint.${e.editor.tool}`, null, t('sketch.hint.select')) : e?.mode === 'feature' && e.pick ? t(`pm.pickHint.${e.pick}`, null, t('pm.pickNow')) : e?.mode === 'sketchPlane' ? t('notice.pickSketchPlane') : t('status.ready'));
  const items = [`<span class="status-notice ${notice?.kind ?? 'hint'}" title="${escapeHtml(hint)}">${icon(notice?.kind === 'error' ? 'error' : notice?.kind === 'success' ? 'check' : 'info')}<span>${escapeHtml(hint)}</span></span>`];
  if (hasDoc()) {
    if (e?.mode === 'sketch') {
      const ed = e.editor;
      const st = ed.over ? 'over' : ed.dof === 0 ? 'defined' : 'under';
      items.push(`<span class="status-item sketch-state ${st}" title="${escapeHtml(t('pm.status'))}">${icon(st === 'defined' ? 'check' : st === 'over' ? 'error' : 'dofFree')}<span>${escapeHtml(t(`sketch.status.${st}`, { dof: ed.dof }))}</span></span>`);
      items.push(`<span class="status-item">${icon('featSketch')}<span>${escapeHtml(t('status.editingSketch', { name: e.feature.name }))}</span></span>`);
    } else if (e?.mode === 'feature') items.push(`<span class="status-item">${icon(featureIcon(e.feature))}<span>${escapeHtml(t('status.editingFeature', { name: e.feature.name }))}</span></span>`);
    if (state.selection.length) items.push(`<span class="status-item" title="${escapeHtml(t('status.selectedTip'))}">${icon('selectAll')}<span>${escapeHtml(t('status.selected', { count: state.selection.length }))}</span></span>`);
    if (activeKind() !== 'drawing') items.push(`<span class="status-item pointer-pos" title="${escapeHtml(t('status.pointerTip'))}">${icon('position')}<span id="status-pointer">—</span></span>`);
    if (s.showFps && activeKind() !== 'drawing') items.push(`<span class="status-item stats" title="${escapeHtml(t('status.statsTip'))}">${icon('fps')}<span id="status-stats">${escapeHtml(`${state.stats.triangles.toLocaleString()} ${t('status.tris')} · ${state.stats.ms.toFixed(1)} ms`)}</span></span>`);
    const problems = rebuildProblems().length + (activeAssembly() ? state.failedMates.size : 0);
    items.push(`<button class="status-item ${problems ? 'error-count' : ''}" data-bottom-show="rebuild" title="${escapeHtml(t('bottom.rebuild'))}">${icon(problems ? 'error' : 'check')}<span>${escapeHtml(problems ? t('status.errors', { count: problems }) : t('status.noErrors'))}</span></button>`);
    items.push(`<button class="status-item units" data-units-menu title="${escapeHtml(t('settings.units'))}">${icon('units')}<span>${escapeHtml(units().toUpperCase())}</span></button>`);
  }
  items.push(`<span class="status-item" title="${escapeHtml(t('status.theme', { name: themeName(s.theme, getLanguage()) }))}">${icon('palette')}<span>${escapeHtml(themeName(s.theme, getLanguage()))}</span></span>`);
  items.push(`<span class="status-item" title="${escapeHtml(t('status.language'))}">${icon('globe')}<span>${escapeHtml(t('status.language'))}</span></span>`);
  if (s.statusClock) items.push(`<span class="status-item clock" title="${escapeHtml(t('status.clock'))}">${icon('clock')}<span id="status-clock">${escapeHtml(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span></span>`);
  bar.innerHTML = items.join('');
}

function renderAll() {
  root.classList.toggle('no-status', !state.settings.showStatusBar);
  root.classList.toggle('no-left', !state.settings.showLeftPanel);
  root.classList.toggle('no-right', !state.settings.showRightPanel);
  const onStart = state.showStart || !state.doc;
  root.classList.toggle('on-start', onStart);
  root.classList.toggle('no-bottom', !state.settings.showBottomPanel);
  root.classList.toggle('sketching', sketching());
  root.style.setProperty('--bottom-height', `${state.settings.bottomHeight}px`);
  root.style.setProperty('--left-width', `${state.settings.leftWidth}px`);
  root.style.setProperty('--right-width', `${state.settings.rightWidth}px`);
  root.style.setProperty('--zoom', String(state.settings.zoom / 100));
  renderMenubar();
  if (toolbarLanguage !== getLanguage()) renderToolbar(); else renderToolbarState();
  renderTabs();
  renderCommandManager();
  renderLeft();
  renderRight();
  renderBottom();
  renderStatus();
  const startHost = root.querySelector('#start-page');
  startHost.hidden = !onStart;
  root.querySelector('#view-host').hidden = onStart || activeKind() === 'drawing';
  root.querySelector('#drawing-host').hidden = onStart || activeKind() !== 'drawing';
  if (onStart) renderStartPage(); else { startCards?.destroy(); startCards = null; startHost.innerHTML = ''; }
  if (!onStart && activeKind() === 'drawing') renderDrawing();
  updateBackgroundState();
  renderToolbarState();
  viewport?.resize();
}

// ───────────────────────── start page

let startCards = null;
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
  const canvas = host.querySelector('.start-bg');
  startBackground?.destroy();
  startBackground = new AnimatedBackground(canvas, { colors: backgroundColors, speed: () => state.settings.animationSpeed / 100, kind: state.settings.animation, vivid: true });
  if (state.settings.backgroundKind === 'animated') startBackground.start(); else startBackground.draw();
  canvas.classList.toggle('static', state.settings.backgroundKind !== 'animated');
  host.querySelector('.start-scroll').style.setProperty('--start-image', state.backgroundUrl && state.settings.backgroundKind === 'image' ? `url("${state.backgroundUrl}")` : 'none');
  host.classList.toggle('with-image', Boolean(state.backgroundUrl) && state.settings.backgroundKind === 'image');
}

function showStartPage(show = true) {
  if (show && state.editing) cancelEditing({ quiet: true });
  state.showStart = show;
  if (!state.doc) state.showStart = true;
  renderAll();
  if (!state.showStart) syncView();
}

async function onStartAction(target) {
  const value = target.dataset.value;
  switch (target.dataset.start) {
    case 'template': {
      const unit = TEMPLATES.find(([id]) => id === value)?.[2];
      if (value === 'drawing') { if (hasDoc()) return newDrawing(); notify('info', t('notice.drawingNeedsModel')); return openSampleAsk('flangeDrawing'); }
      return newDocument(value === 'assembly' ? 'assembly' : 'part', { unit });
    }
    case 'open': return openWithDialog();
    case 'import': return importStepDialog();
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
    case 'guide': return openDocWindow('guide');
    case 'shortcuts': return run('shortcuts');
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
    const groups = [...new Set(SAMPLES.map((s) => s.group))];
    const items = groups.map((g) => { handlers[`custom:group:${g}`] = () => examplesMenu(at, g); return { id: `custom:group:${g}`, label: `${t(`sampleGroup.${g}`)} (${SAMPLES.filter((x) => x.group === g).length})`, icon: SAMPLES.find((x) => x.group === g).icon }; });
    return showMenu(items, at, 'context', { handlers, header: { icon: 'samples', title: t('action.openExample') } });
  }
  const items = SAMPLES.filter((x) => x.group === group).map((x) => { handlers[`custom:sample:${x.id}`] = () => openSampleAsk(x.id); return { id: `custom:sample:${x.id}`, label: x[lang()][0], icon: x.icon }; });
  return showMenu(items, at, 'context', { handlers, header: { icon: 'samples', title: t(`sampleGroup.${group}`) } });
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
  appBackground.speed = () => state.settings.animationSpeed / 100;
  appBackground.setKind(s.animation);
  startBackground?.setKind(s.animation);
  const showStart = state.showStart || !state.doc;
  layer.classList.toggle('animated', false);
  appBackground.stop();
  if (showStart && startBackground) { if (s.backgroundKind === 'animated') startBackground.start(); else { startBackground.stop(); startBackground.draw(); } }
  else startBackground?.stop();
}

let startBackgroundChangedAt = Date.now();
function randomAnimation(current) { const others = ANIMATIONS.filter((k) => k !== current); return others[Math.floor(Math.random() * others.length)]; }
function tickStartBackground() {
  const s = state.settings;
  const showing = (state.showStart || !state.doc) && s.backgroundKind === 'animated' && s.animationInterval > 0 && !document.hidden;
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
  native.setWindowTheme(theme.dark);
  document.documentElement.classList.toggle('dark', Boolean(theme.dark));
  if (s.language !== getLanguage()) {
    setLanguage(s.language);
    native.setBackendLanguage(s.language);
    if (previous.language) notify('info', t('notice.language'));
  }
  if (s.backgroundImage !== previous.backgroundImage) loadBackground();
  if (s.theme !== previous.theme && previous.theme) notify('info', t('notice.theme', { name: themeName(s.theme, getLanguage()) }));
  if (s.units !== previous.units && previous.units) notify('info', t('notice.units', { unit: s.units }));
  if (viewport) {
    if (s.theme !== previous.theme || s.customTheme !== previous.customTheme) viewport.applyTheme();
    viewport.setStyle(s.displayStyle);
    if (s.perspectiveView !== previous.perspectiveView) viewport.setProjection(!s.perspectiveView);
    if (['showPlanes', 'showOrigin', 'showSketches', 'meshQuality'].some((k) => s[k] !== previous[k])) { if (s.meshQuality !== previous.meshQuality) builds.clear(); syncView(); }
  }
  if (sketching()) state.editing.editor.render();
  renderAll();
  updateMinimumWidth();
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
  const show = (wait = 0) => { shown = true; popups.open('progress', { title: t(titleKey), icon: PROGRESS_ICONS[titleKey] ?? 'hourglass', nameIcon: PROGRESS_NAME_ICONS[titleKey] ?? 'file', name, op, last, cancellable, delay: wait }, { delay: wait }).then((r) => { if (r?.cancel) signal.cancelled = true; }); };
  job.reopen = () => show(0);
  progressJobs.push(job);
  let timer = null;
  if (delay <= 0) { const drawn = popups.whenDrawn('progress'); show(0); await drawn; }
  else if (desktop && !popups.useFrames) show(delay);
  else if (popups.useFrames) {
    const drawn = popups.whenDrawn('progress', 400); show(delay); await drawn;
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  } else timer = setTimeout(() => show(0), delay);
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

// ───────────────────────── files

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

async function readBytes(path, op) {
  const b64 = await native.readBase64File(path, op);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const isStepName = (name) => /\.(step|stp)$/i.test(name);
const isStlName = (name) => /\.stl$/i.test(name);

async function openPath(path, { quiet = false } = {}) {
  const name = baseName(path);
  if (isStepName(name) || isStlName(name)) return importModelFile(name, await readBytes(path, ''));
  if (!(await confirmReplace())) return null;
  try {
    const text = await withProgress('progress.open', name, (op) => native.readTextFile(path, op));
    const p = unpackProject(text);
    const d = new Doc(p, { path });
    await busy('progress.open', name, () => setDoc(d), { delay: 150 });
    rememberRecent({ path, title: p.name });
    if (!quiet) notify('success', t('notice.opened', { name }));
    return d;
  } catch (error) { showError('error.open', error, path); return null; }
}

async function openContent(name, content, handle = null) {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  if (isStepName(name) || isStlName(name)) return importModelFile(name, bytes);
  if (!(await confirmReplace())) return null;
  try {
    const p = unpackProject(bytes);
    const d = new Doc(p, { name, handle });
    await busy('progress.open', name, () => setDoc(d), { delay: 150 });
    rememberRecent({ path: name, title: p.name, web: true });
    if (handle) native.storeWebHandle(name, handle);
    notify('success', t('notice.opened', { name }));
    return d;
  } catch (error) { showError('error.open', error, name); return null; }
}

async function openWithDialog(directory = null) {
  try {
    if (desktop) {
      const paths = await native.chooseDiagramsToOpen(directory ?? state.settings.lastDirectory);
      if (paths[0]) await openPath(paths[0]);
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
      try { if ((await handle.queryPermission?.({ mode: 'read' })) !== 'granted') await handle.requestPermission?.({ mode: 'read' }); const file = await handle.getFile(); return openContent(file.name, new Uint8Array(await file.arrayBuffer()), handle); } catch (error) { return showError('error.open', error, path); }
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

function clearRecentAll() { state.recent = []; state.recentDirs = []; storeRecent(globalThis.localStorage, []); storeRecentDirs(globalThis.localStorage, []); notify('success', t('notice.recentCleared')); renderAll(); }

async function recentFoldersMenu(anchor) {
  const items = state.recentDirs.length ? state.recentDirs.map((item, index) => ({ id: `custom:dir:${index}`, label: item.path, icon: 'folder' })) : [{ id: 'none', label: t('recent.noFolders'), icon: 'info', disabled: true }];
  const handlers = Object.fromEntries(state.recentDirs.map((item, index) => [`custom:dir:${index}`, () => openWithDialog(item.path)]));
  return showMenu(items, anchor ?? anchorBelow(root.querySelector('[data-menu="file"]')), 'context', { handlers, header: { icon: 'recentFolder', title: t('action.recentFolders') } });
}

const safeName = () => fileSafe(doc()?.path ? stripExtension(baseName(doc().path)) : stripExtension(doc()?.name ?? '') || project()?.name || 'project');

function projectThumbnail() {
  try { return viewport && activeKind() !== 'drawing' ? viewport.capture(240, 160).toDataURL('image/png') : null; } catch { return null; }
}

async function saveDoc({ saveAs = false } = {}) {
  const d = doc();
  if (!d) return false;
  if (state.editing) acceptEditing();
  if (viewport && activeKind() !== 'drawing') d.project.camera = viewport.cameraState();
  const suggested = `${safeName()}.mymech`;
  try {
    const text = packProject(d.project, { thumbnail: projectThumbnail() });
    if (desktop) {
      let path = d.path;
      if (!path || saveAs) {
        const dir = d.path ? directoryOf(d.path) : state.settings.lastDirectory;
        path = await native.chooseSavePath(dir ? `${dir}/${suggested}` : suggested, ['mymech']);
        if (!path) return false;
        path = withExtension(path, 'mymech');
      }
      await withProgress('progress.save', baseName(path), (op) => native.writeTextFile(path, text, op));
      d.path = path; d.name = null;
      rememberRecent({ path, title: d.project.name });
    } else {
      const saved = await native.saveFileWeb(new Blob([text], { type: 'application/json' }), { name: suggested, handle: d.handle, saveAs: saveAs || !d.handle, mime: 'application/json' });
      if (!saved) return false;
      d.handle = saved.handle; d.name = saved.name;
      if (saved.handle) native.storeWebHandle(saved.name, saved.handle);
      rememberRecent({ path: saved.name, title: d.project.name, web: true });
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
  cancelEditing({ quiet: true });
  state.doc = null;
  state.selection = [];
  builds.clear();
  projectionCache.clear();
  viewport?.setBodies([]);
  state.showStart = true;
  persistSession();
  renderAll();
  return true;
}

/** Saves bytes / text as a file (desktop: a save dialog; web: the save picker or a download). */
async function saveExport(name, type, content, mime = 'application/octet-stream') {
  try {
    if (desktop) {
      const dir = state.settings.lastDirectory;
      const path = await native.chooseSavePath(dir ? `${dir}/${name}` : name, [type]);
      if (!path) return false;
      const bytes = content instanceof Blob ? new Uint8Array(await content.arrayBuffer()) : typeof content === 'string' ? new TextEncoder().encode(content) : content;
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      await withProgress('progress.export', baseName(path), (op) => native.writeBase64File(path, btoa(bin), op));
      rememberDirectory(directoryOf(path));
      notify('success', t('notice.exported', { name: baseName(path) }));
    } else {
      const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
      const saved = await native.saveFileWeb(blob, { name, saveAs: true, mime });
      if (!saved) return false;
      notify('success', t('notice.exported', { name: saved.name }));
    }
    return true;
  } catch (error) { showError('error.export', error, name); return false; }
}

async function exportModel(format) {
  await ensureKernel();
  const R = rep();
  const part = activePart(); const asm = activeAssembly();
  const base = fileSafe(active()?.name ?? 'model');
  const shapes = [];
  if (part) { const b = buildPart(part).body; if (b) shapes.push({ shape: b, name: part.name, color: part.color || materialOf(part.material).color }); }
  else if (asm) {
    for (const c of asm.components) { const p = project().parts.find((x) => x.id === c.part); const b = p && buildPart(p).body; if (b) shapes.push({ shape: placeShape(b, c), name: c.name, color: p.color || materialOf(p.material).color }); }
  }
  if (!shapes.length) { notify('info', t('notice.noBody')); return; }
  if (format === 'step') {
    const blob = shapes.length === 1 && part ? shapes[0].shape.blobSTEP() : R.exportSTEP(shapes);
    await saveExport(`${base}.step`, 'step', blob, 'model/step');
  } else {
    const shape = shapes.length === 1 ? shapes[0].shape : R.makeCompound(shapes.map((s) => s.shape));
    const blob = shape.blobSTL({ tolerance: 0.02, angularTolerance: 0.2, binary: true });
    await saveExport(`${base}.stl`, 'stl', blob, 'model/stl');
  }
}

async function exportImage() {
  if (activeDrawing()) return exportDrawing('svg');
  if (!viewport) return undefined;
  const canvas = viewport.capture(1920, 1080);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return saveExport(`${fileSafe(active()?.name ?? 'view')}.png`, 'png', blob, 'image/png');
}

async function exportDrawing(format) {
  const d = activeDrawing();
  if (!d) return;
  const projections = drawingProjections(d);
  if (format === 'dxf') await saveExport(`${fileSafe(d.name)}.dxf`, 'dxf', drawingDxf(d, projections), 'application/dxf');
  else await saveExport(`${fileSafe(d.name)}.svg`, 'svg', drawingSvg(d, projections, { labels: drawingLabels(), info: drawingInfo(d) }), 'image/svg+xml');
}

/** Prints the drawing sheet (or a picture of the 3D view) through the system print dialog. */
async function printDocument() {
  let html;
  const d = activeDrawing();
  if (d) {
    const [W, H] = SHEETS[d.sheet] ?? SHEETS.A3;
    html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(d.name)}</title><style>@page{size:${W}mm ${H}mm;margin:0}html,body{margin:0}svg{display:block;width:${W}mm;height:${H}mm}</style></head><body>${drawingSvg(d, drawingProjections(d), { labels: drawingLabels(), info: drawingInfo(d) })}</body></html>`;
  } else if (viewport) {
    const url = viewport.capture(1600, 1000).toDataURL('image/png');
    html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(active()?.name ?? '')}</title><style>@page{margin:10mm}img{width:100%}</style></head><body><img src="${url}"/></body></html>`;
  } else return;
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.append(frame);
  frame.srcdoc = html;
  await new Promise((resolve) => { frame.onload = resolve; });
  frame.contentWindow.focus();
  frame.contentWindow.print();
  setTimeout(() => frame.remove(), 60000);
}

async function importStepDialog() {
  try {
    if (desktop) {
      const paths = await native.chooseModelFiles(state.settings.lastDirectory);
      if (paths[0]) await importModelFile(baseName(paths[0]), await readBytes(paths[0], ''));
    } else {
      const files = await native.pickWithInput('.step,.stp,.stl', false);
      if (files[0]) await importModelFile(files[0].name, new Uint8Array(await files[0].arrayBuffer()));
    }
  } catch (error) { showError('error.import', error); }
}

/** A STEP (or STL) file becomes a part with an imported body (new project, or a part of the open one). */
async function importModelFile(name, bytes) {
  await ensureKernel();
  const R = rep();
  try {
    const shape = await busy('progress.import', name, async () => (isStlName(name) ? R.importSTL(new Blob([bytes])) : R.importSTEP(new Blob([bytes]))));
    const part = createPart(stripExtension(name));
    part.features.push(createFeature(part, 'import', { brep: shape.serialize(), source: name, name: stripExtension(name) }));
    if (hasDoc() && project()) {
      const asm = activeAssembly();
      change('op.import', (p) => { p.parts.push(part); if (!asm) p.active = { kind: 'part', id: part.id }; });
      if (asm) insertComponent(part.id);
    } else {
      const p = createProject({ name: stripExtension(name), kind: 'none' });
      p.parts.push(part);
      p.active = { kind: 'part', id: part.id };
      await setDoc(new Doc(p, { name: `${stripExtension(name)}.mymech` }));
      doc().revision = 1;
    }
    fitView();
    notify('success', t('notice.imported', { name }));
  } catch (error) { showError('error.import', error, name); }
}

// ───────────────────────── popups (menus, confirm)

async function ask(params) { const result = await popups.open('confirm', params); return result?.choice ?? 'cancel'; }
async function requestExit() { if (desktop) return appWindow.close(); return undefined; }
async function confirmExit() {
  if (!doc()?.dirty) return true;
  const choice = await ask({ kind: 'exit', icon: 'save', title: t('confirm.exitTitle'), message: t('confirm.exitMessage'), items: [docName()], buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }] });
  if (choice === 'save') return saveDoc();
  return choice === 'discard';
}

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
function anchorAt(event) { const point = toScreen(event.clientX, event.clientY); return { x: point.x + 1, y: point.y + 1, flipY: point.y }; }

function menuItems(ids) {
  return ids.map((id) => (id === '-' ? { separator: true } : typeof id === 'object' ? {
    id: `submenu:${id.sub}`, label: t(`submenu.${id.sub}`), icon: SUBMENUS[id.sub].icon, submenu: true,
    disabled: !SUBMENUS[id.sub].items.some((item) => item !== '-' && commandEnabled(item)),
  } : { id, label: t(commands[id].label), icon: commands[id].icon, shortcut: commands[id].key ? keyLabel(commands[id].key) : '', disabled: !commandEnabled(id), checked: commands[id].checked?.() }));
}

function withChildren(items, depth = 0) {
  return items.map((item) => {
    if (!item.submenu || item.children || depth > 3) return item;
    const key = item.id.slice('submenu:'.length);
    const children = SUBMENUS[key] ? menuItems(SUBMENUS[key].items) : null;
    return children ? { ...item, children: withChildren(children, depth + 1) } : item;
  });
}

async function showMenu(items, anchor, name = 'context', context = {}) {
  state.openMenu = name;
  renderMenubar();
  const header = context.header ?? (MENUS[name] ? { icon: MENU_ICONS[name], title: t(`menu.${name}`) } : { icon: 'part', title: 'MyMechanics' });
  const result = await popups.open('menu', { items: withChildren(items), name, header }, { anchor });
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

function viewportContextMenu(hit, event) {
  const anchor = anchorAt(event);
  if (sketching()) {
    const ed = state.editing.editor;
    return showMenu(menuItems(['exitSketch', 'cancelSketch', '-', 'sk:select', 'sk:line', 'sk:rect', 'sk:circle', 'sk:dimension', '-', 'construction', 'delete', '-', 'normalTo', 'zoomFit']), anchor, 'context', { header: { icon: 'featSketch', title: `${state.editing.feature.name} · ${t(`sketch.tool.${ed.tool}`)}` } });
  }
  if (state.editing) return showMenu([{ id: 'custom:ok', label: t('pm.ok'), icon: 'check' }, { id: 'custom:cancel', label: t('pm.cancel'), icon: 'close' }, { separator: true }, ...menuItems(['zoomFit', 'viewsMenu'])], anchor, 'context', { handlers: { 'custom:ok': () => acceptEditing(), 'custom:cancel': () => pmCommand('cancel') }, header: { icon: 'editFeature', title: t('panel.pm') } });
  const item = itemOfHit(hit);
  if (item && !state.selection.some((s) => s.key === item.key)) select([item]);
  if (item?.kind === 'face') return showMenu(menuItems(['sketch', 'hole', 'extrude', 'cutExtrude', '-', 'fillet', 'shell', 'refPlane', '-', 'normalTo', 'zoomFit', '-', 'measure', 'massProps']), anchor, 'context', { header: { icon: 'part', title: t('pm.face') } });
  if (item?.kind === 'edge') return showMenu(menuItems(['fillet', 'chamfer', '-', 'measure', 'zoomFit']), anchor, 'context', { header: { icon: 'lineTool', title: t('pm.edge') } });
  if (item?.kind === 'plane' || item?.kind === 'feat') return showMenu(menuItems(['sketch', 'refPlane', 'mirror', '-', 'normalTo']), anchor, 'context', { header: { icon: 'refPlane', title: t(`plane.${item.id}`, null, t('cmd.plane')) } });
  if (item?.kind === 'comp') return showMenu(menuItems(['openPart', 'fixComponent', 'floatComponent', 'rotateComponent', '-', 'mate', 'delete', '-', 'zoomFit']), anchor, 'context', { header: { icon: 'part', title: activeAssembly().components.find((c) => c.id === item.id)?.name ?? '' } });
  return showMenu(menuItems(['zoomFit', 'viewsMenu', 'normalTo', 'perspective', '-', 'styleMenu', 'section', '-', 'showPlanes', 'showOrigin', '-', 'rebuild', 'massProps']), anchor, 'context', { header: { icon: 'view3d', title: active()?.name ?? 'MyMechanics' } });
}

function treeContextMenu(key, event) {
  const anchor = anchorAt(event);
  const part = activePart();
  if (key.startsWith('feat:')) {
    const f = part?.features.find((x) => x.id === key.slice(5));
    if (!f) return undefined;
    const extra = f.type === 'sketch' ? ['extrude', 'cutExtrude', 'revolve'] : ['linearPattern', 'circularPattern', 'mirror'];
    return showMenu(menuItems(['editFeature', 'rename', '-', f.suppressed ? 'unsuppress' : 'suppress', 'rollbackHere', 'rollbackEnd', '-', ...extra, '-', 'delete']), anchor, 'context', { header: { icon: featureIcon(f), title: f.name } });
  }
  if (key.startsWith('plane:')) return showMenu(menuItems(['sketch', 'refPlane', 'mirror', '-', 'normalTo']), anchor, 'context', { header: { icon: 'refPlane', title: t(`plane.${key.slice(6)}`) } });
  if (key.startsWith('comp:')) return showMenu(menuItems(['openPart', 'rename', 'fixComponent', 'floatComponent', 'rotateComponent', '-', 'delete']), anchor, 'context', { header: { icon: 'part', title: activeAssembly()?.components.find((c) => c.id === key.slice(5))?.name ?? '' } });
  if (key.startsWith('mate:')) return showMenu(menuItems(['rename', 'delete']), anchor, 'context', { header: { icon: 'mate', title: activeAssembly()?.mates.find((m) => m.id === key.slice(5))?.name ?? '' } });
  if (key === 'material') return materialMenu(anchor);
  if (key === 'doc') return showMenu(menuItems(['rename', 'rebuild', 'massProps', '-', 'newDrawing', 'exportStep', 'exportStl']), anchor, 'context', { header: { icon: activeKind(), title: active()?.name ?? '' } });
  return undefined;
}

function textContextMenu(element, event) {
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
  ], anchorAt(event), 'context', { handlers, header: { icon: 'edit', title: t('menu.edit') } });
}

// ───────────────────────── documents (help windows)

async function openDocWindow(kind) {
  const info = DOC_KINDS[kind];
  if (!info) return undefined;
  popups.hideMenu();
  const url = `${location.pathname}?viewer=${kind}&lang=${lang()}`;
  if (!desktop) { globalThis.open(url, `mymechanics-${docLabel(kind)}`)?.focus?.(); return undefined; }
  const dark = resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme).dark;
  try { await native.invoke('open_doc_window', { kind, title: docWindowTitle(t(info.title)), width: info.width, height: info.height, dark }); } catch (error) { showError('error.docWindow', error); }
  return undefined;
}

// ───────────────────────── PropertyManager input

function pmFieldChanged(key, raw, unit) {
  const e = state.editing;
  if (!e) return;
  const v = parseLen(raw, unit === 'length' ? 'length' : 'number');
  if (e.mode === 'sketch') {
    const ed = e.editor;
    if (key === 'polygonSides' && v >= 3) { ed.polygonSides = Math.round(v); renderLeft(); return; }
    const x = ed.selectionInfo()[0];
    if (!x || v == null) return;
    if (key === 'pt.x' || key === 'pt.y') { ed.solve({ drag: { id: x.id, x: key === 'pt.x' ? v : x.x, y: key === 'pt.y' ? v : x.y } }); ed.render(); renderLeft(); return; }
    if (key === 'circle.d' && v > 0) { x.r = v / 2; ed.solve(); ed.render(); renderLeft(); }
    return;
  }
  if (e.mode === 'mate') { if (v != null) { e.mate.value = v; previewMate(); } return; }
  if (e.mode !== 'feature' || v == null) { if (v == null) notify('error', t('notice.invalidValue', { text: raw })); renderLeft(); return; }
  const limits = { count: [1, 500], count2: [1, 500], angle: [0.1, 360], csAngle: [30, 150] };
  let value = v;
  if (limits[key]) value = Math.max(limits[key][0], Math.min(limits[key][1], value));
  if (['count', 'count2'].includes(key)) value = Math.round(value);
  if (['depth', 'depth2', 'radius', 'distance', 'thickness', 'diameter', 'cbDiameter', 'cbDepth', 'csDiameter'].includes(key) && !(value > 0)) { notify('error', t('notice.invalidValue', { text: raw })); renderLeft(); return; }
  updateFeature((f) => { f[key] = value; if (key === 'diameter') delete f.size; });
}

function pmStep(key, delta) {
  const e = state.editing;
  if (e?.mode === 'sketch' && key === 'polygonSides') { e.editor.polygonSides = Math.max(3, e.editor.polygonSides + delta); renderLeft(); return; }
  const target = e?.mode === 'feature' ? e.feature : e?.mode === 'mate' ? e.mate : null;
  if (!target) return;
  const k = e.mode === 'mate' ? 'value' : key;
  const cur = Number(target[k]) || 0;
  const step = ['count', 'count2'].includes(k) ? 1 : ['angle', 'csAngle'].includes(k) ? (e.feature?.type === 'circularPattern' ? 15 : 5) : (units() === 'in' ? 1.5875 : cur >= 20 ? 5 : 1);
  pmFieldChanged(key, String(cur + delta * step), 'number');
}

function pmSet(key, value) {
  const e = state.editing;
  if (e?.mode === 'mate') { if (key === 'type') e.mate.type = value; else if (key === 'aligned') e.mate.aligned = value; previewMate(); return; }
  if (e?.mode !== 'feature') return;
  updateFeature((f) => {
    if (key === 'op') { f.op = value; f.name = createFeature(activePart(), f.type, { op: value }).name; if (value === 'cut' && f.type === 'extrude') { const sk = activePart().features.find((x) => x.id === f.sketch); if (sk) f.reverse = cutShouldReverse(activePart(), sk); } }
    else if (key === 'kind') f.kind = value;
    else if (key === 'through') f.through = value === 'true';
    else if (key === 'dir1') f.direction = value === 'edge' ? { kind: 'edge', sig: f.direction?.sig ?? null } : { kind: 'axis', axis: value };
    else if (key === 'dir2axis') f.direction2 = { kind: 'axis', axis: value };
    else if (key === 'axisKind') f.axis = value === 'edge' ? { kind: 'edge', sig: f.axis?.sig ?? null } : { kind: 'axis', axis: value };
    else if (key === 'stdPlane') { if (f.type === 'plane') f.base = { kind: 'std', name: value }; else f.plane = { kind: 'std', name: value }; }
  });
  if (key === 'dir1' && value === 'edge') { e.pick = 'direction'; renderLeft(); }
  if (key === 'axisKind' && value === 'edge') { e.pick = 'axis'; renderLeft(); }
}

function pmToggle(key, checked) {
  const e = state.editing;
  if (e?.mode === 'mate') { if (key === 'flip') { e.mate.flip = checked; previewMate(); } return; }
  if (e?.mode !== 'feature') return;
  updateFeature((f) => {
    if (key === 'dir2') { if (f.type === 'extrude') f.end2 = checked ? 'blind' : 'none'; else f.direction2 = checked ? { kind: 'axis', axis: 'z' } : null; }
    else f[key] = checked;
  });
}

function pmSelect(key, value) {
  const e = state.editing;
  if (e?.mode !== 'feature') return;
  if (key === 'size') {
    const row = HOLE_SIZES.find(([s]) => s === value);
    updateFeature((f) => { f.size = value || undefined; if (row) [, f.diameter, f.cbDiameter, f.cbDepth, f.csDiameter] = row; });
    return;
  }
  updateFeature((f) => { f[key] = value || null; if (key === 'sketch' && f.type === 'revolve') f.axis = null; });
}

async function pmCommand(cmd) {
  const e = state.editing;
  const [name, arg] = cmd.split(':');
  if (name === 'ok') return acceptEditing();
  if (name === 'cancel') return cancelEditing();
  if (name === 'sketchOn') return openNewSketch({ kind: 'std', name: arg });
  if (name === 'clear') {
    if (e?.mode === 'measure') { e.picks = []; e.result = []; viewport.setSelection([]); return renderLeft(); }
    if (e?.mode === 'feature') updateFeature((f, ed) => { if (arg === 'holePoints') ed.holeSketch.points = []; else if (Array.isArray(f[arg])) f[arg] = []; });
    return undefined;
  }
  if (name === 'tangentChain' && e) { e.pick = 'edges'; notify('info', t('pm.pickFaceForEdges')); return renderLeft(); }
  if (name === 'relation' && e?.mode === 'sketch') {
    const ed = e.editor;
    try { addRelation(ed.sketch, arg, ed.selection.filter((id) => byId(ed.sketch, id))); } catch (error) { return showError('error.relation', error); }
    const r = ed.solve();
    if (!r.ok) notify('warning', t('sketch.relationConflict'));
    ed.render(); renderLeft(); renderStatus();
    return undefined;
  }
  if (name === 'delRelation' && e?.mode === 'sketch') { const ed = e.editor; ed.sketch.constraints = ed.sketch.constraints.filter((c) => c.id !== arg); ed.solve(); ed.render(); renderLeft(); renderStatus(); return undefined; }
  if (name === 'construction' && e?.mode === 'sketch') { e.editor.toggleConstruction(); e.editor.render(); return renderLeft(); }
  if (name === 'deleteSel' && e?.mode === 'sketch') { e.editor.deleteSelection(); e.editor.render(); return renderLeft(); }
  if (name === 'insert') { insertComponent(arg); return undefined; }
  if (name === 'insertSample') return insertSamplePart(arg);
  if (name === 'insertStep') return importStepDialog();
  return undefined;
}

// ───────────────────────── events

function treeClick(row, event) {
  const key = row.dataset.tree;
  const e = state.editing;
  if (e?.mode === 'feature' && e.pick === 'seeds' && key.startsWith('feat:')) {
    const id = key.slice(5);
    const f = activePart()?.features.find((x) => x.id === id);
    if (f && ['extrude', 'revolve', 'hole'].includes(f.type)) updateFeature((feat) => { feat.seeds = feat.seeds.includes(id) ? feat.seeds.filter((x) => x !== id) : [...feat.seeds, id]; });
    return undefined;
  }
  if (e?.mode === 'feature' && ['plane', 'base'].includes(e.pick) && (key.startsWith('plane:') || key.startsWith('feat:'))) {
    const id = key.split(':')[1];
    const f = activePart()?.features.find((x) => x.id === id);
    if (key.startsWith('plane:') || f?.type === 'plane') { const ref = planeRefOf(id); updateFeature((feat) => { if (e.pick === 'plane') feat.plane = ref; else feat.base = ref; }); }
    return undefined;
  }
  if (e?.mode === 'feature' && e.feature.type === 'hole' && e.pick === 'holePoints' && key.startsWith('plane:') && !e.holeSketch.plane) {
    e.holeSketch.plane = planeRefOf(key.slice(6)); syncView(); renderLeft(); return undefined;
  }
  if (e?.mode === 'sketchPlane' && (key.startsWith('plane:') || key.startsWith('feat:'))) {
    const id = key.split(':')[1];
    const f = activePart()?.features.find((x) => x.id === id);
    if (key.startsWith('plane:')) return openNewSketch({ kind: 'std', name: id });
    if (f?.type === 'plane') return openNewSketch({ kind: 'ref', id });
  }
  const [kind, id] = key.includes(':') ? key.split(':') : [key, null];
  select([{ kind, id, key }], { add: event.ctrlKey || event.shiftKey || event.metaKey });
  return undefined;
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
    const docClose = target.closest('[data-doc-close]');
    if (docClose) { event.stopPropagation(); return removeDocument(docClose.dataset.docClose); }
    const docTab = target.closest('[data-doc-tab]');
    if (docTab) { const [kind, id] = docTab.dataset.docTab.split(':'); return switchDocument({ kind, id }); }
    const cmTab = target.closest('[data-cm-tab]');
    if (cmTab) { state.cmTab = cmTab.dataset.cmTab; return renderCommandManager(); }
    const command = target.closest('[data-command]');
    if (command && !command.disabled && command.tagName !== 'INPUT') {
      const id = command.dataset.command;
      const anchored = ['themeMenu', 'exportMenu', 'viewsMenu', 'styleMenu', 'recentFolders', 'openExample', 'material', 'addView'].includes(id);
      return run(id, { anchor: anchored ? anchorBelow(command.closest('.split-button') ?? command) : undefined });
    }
    const windowControl = target.closest('[data-window]');
    if (windowControl) return windowButton(windowControl.dataset.window);
    const leftTab = target.closest('[data-left-tab]');
    if (leftTab && !leftTab.disabled) { state.leftTab = leftTab.dataset.leftTab; return renderLeft(); }
    const rightTab = target.closest('[data-right-tab]');
    if (rightTab) { state.rightTab = rightTab.dataset.rightTab; return renderRight(); }
    const twisty = target.closest('[data-tree-toggle]');
    if (twisty) { const k = twisty.dataset.treeToggle; if (state.collapsed.has(k)) state.collapsed.delete(k); else state.collapsed.add(k); return renderLeft(); }
    const treeRow = target.closest('[data-tree]');
    if (treeRow) return treeClick(treeRow, event);
    const pm = target.closest('[data-pm]');
    if (pm) return pmCommand(pm.dataset.pm);
    const pmStepBtn = target.closest('[data-pm-step]');
    if (pmStepBtn) return pmStep(pmStepBtn.dataset.pmStep, Number(pmStepBtn.dataset.delta));
    const pmSetBtn = target.closest('[data-pm-set]');
    if (pmSetBtn) return pmSet(pmSetBtn.dataset.pmSet, pmSetBtn.dataset.value);
    const pmRemove = target.closest('[data-pm-remove]');
    if (pmRemove) { const [k, i] = pmRemove.dataset.pmRemove.split(':'); return updateFeature((f, e) => { if (k === 'holePoints') e.holeSketch.points.splice(Number(i), 1); else if (Array.isArray(f[k])) f[k].splice(Number(i), 1); }); }
    const pick = target.closest('[data-pm-pick]');
    if (pick && state.editing && !target.closest('button')) { state.editing.pick = pick.dataset.pmPick; renderLeft(); renderStatus(); return undefined; }
    const mat = target.closest('[data-material]');
    if (mat) return setMaterial(mat.dataset.material);
    const reset = target.closest('[data-prop-reset]');
    if (reset && activePart()) return change('op.edit', () => { activePart().color = null; });
    const drw = target.closest('[data-drw]');
    if (drw) return drawingAction(drw.dataset.drw);
    const view = target.closest('[data-view]');
    if (view && activeDrawing()) { state.drawingSelected = view.dataset.view; renderDrawing(); renderToolbarState(); return undefined; }
    const bottomTab = target.closest('[data-bottom-tab]');
    if (bottomTab) { state.bottomTab = bottomTab.dataset.bottomTab; return renderBottom(); }
    const bottomShow = target.closest('[data-bottom-show]');
    if (bottomShow) { state.bottomTab = bottomShow.dataset.bottomShow; if (!state.settings.showBottomPanel) updateSettings({ showBottomPanel: true }); else renderBottom(); return undefined; }
    if (target.closest('[data-bottom-clear]')) { state.log = []; return renderBottom(); }
    const problem = target.closest('[data-problem]');
    if (problem) return select([{ kind: 'feat', id: problem.dataset.problem, key: `feat:${problem.dataset.problem}` }]);
    const unitsBtn = target.closest('[data-units-menu]');
    if (unitsBtn) { const handlers = Object.fromEntries(['mm', 'cm', 'in'].map((u) => [`custom:${u}`, () => updateSettings({ units: u })])); return showMenu(['mm', 'cm', 'in'].map((u) => ({ id: `custom:${u}`, label: t(`unit.${u}`), icon: 'units', checked: units() === u })), anchorBelow(unitsBtn), 'context', { handlers, header: { icon: 'units', title: t('settings.units') } }); }
    const secAxis = target.closest('[data-section-axis]');
    if (secAxis && state.section) { const i = Number(secAxis.dataset.sectionAxis); const box = viewport.contentBox(); state.section = { normal: [0, 1, 2].map((k) => (k === i ? 1 : 0)), offset: box.getCenter(new THREE.Vector3()).getComponent(i) }; viewport.setSection(state.section); return renderRight(); }
    return undefined;
  });

  root.addEventListener('dblclick', (event) => {
    const row = event.target.closest('[data-tree]');
    if (row) {
      const key = row.dataset.tree;
      if (key.startsWith('feat:')) return editFeature(key.slice(5));
      if (key.startsWith('comp:')) { const c = activeAssembly()?.components.find((x) => x.id === key.slice(5)); if (c) switchDocument({ kind: 'part', id: c.part }); }
      if (key === 'material') return materialMenu(anchorAt(event));
      return undefined;
    }
    const label = event.target.closest('.vp-label.dim-label');
    if (label && sketching()) return state.editing.editor.editDimension(label.dataset.label);
    return undefined;
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target.closest('.drw-props') && target.dataset.pmSelect != null) return drawingSelect(target.dataset.pmSelect, target.value);
    if (target.dataset.pmField != null) return pmFieldChanged(target.dataset.pmField, target.value, target.dataset.unit);
    if (target.dataset.pmToggle != null) return pmToggle(target.dataset.pmToggle, target.checked);
    if (target.dataset.pmSelect != null) return pmSelect(target.dataset.pmSelect, target.value);
    if (target.dataset.commandCheck) return run(target.dataset.commandCheck);
    if (target.dataset.prop) return setProp(target.dataset.prop, target.value);
    if (target.dataset.drwToggle) return change('op.edit', () => { activeDrawing()[target.dataset.drwToggle] = target.checked; });
    if (target.dataset.drwTitle) return change('op.edit', () => { activeDrawing().title[target.dataset.drwTitle] = target.value; });
    if ('startToggle' in target.dataset) return updateSettings({ showStartPage: target.checked }, { quiet: true });
    if ('startSpeed' in target.dataset) return updateSettings({ animationSpeed: Number(target.value) }, { quiet: true });
    if ('startOpacity' in target.dataset) return updateSettings({ startCardOpacity: Number(target.value) }, { quiet: true });
    if ('startRandom' in target.dataset) return updateSettings({ animationRandom: target.checked }, { quiet: true });
    if ('startInterval' in target.dataset) { startBackgroundChangedAt = Date.now(); return updateSettings({ animationInterval: Number(target.value) }, { quiet: true }); }
    return undefined;
  });

  root.addEventListener('input', (event) => {
    const target = event.target;
    if ('sectionOffset' in target.dataset && state.section) { state.section = { ...state.section, offset: Number(target.value) }; viewport.setSection(state.section); }
    if ('startSpeed' in target.dataset) { target.parentElement.querySelector('output').textContent = `${target.value}%`; state.settings.animationSpeed = Number(target.value); }
    if ('startOpacity' in target.dataset) { target.parentElement.querySelector('output').textContent = `${target.value}%`; root.querySelector('.start-inner')?.style.setProperty('--start-card-alpha', `${target.value}%`); }
  });

  root.addEventListener('keydown', (event) => {
    if (event.target.matches?.('[data-pm-field], [data-prop], [data-drw-title]') && event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); event.target.dispatchEvent(new Event('change', { bubbles: true })); event.target.blur(); }
  });

  root.addEventListener('contextmenu', (event) => {
    const editable = event.target.closest('input:not([type="range"]):not([type="checkbox"]):not([type="color"]), textarea');
    if (editable) { event.preventDefault(); return textContextMenu(editable, event); }
    if (event.defaultPrevented || event.target.closest('#view-host canvas')) return undefined;
    event.preventDefault();
    const row = event.target.closest('[data-tree]');
    if (row) { const key = row.dataset.tree; if (!state.selection.some((s) => s.key === key)) treeClick(row, event); return treeContextMenu(key, event); }
    if (event.target.closest('#start-page')) return showMenu(menuItems(['newPart', 'newAssembly', 'open', 'recent', '-', 'shuffleBackground', 'backgroundImage', '-', 'about']), anchorAt(event), 'context', { header: { icon: 'home', title: t('action.startPage') } });
    return showMenu(menuItems(['newPart', 'open', 'save', '-', 'undo', 'redo', '-', 'leftPanel', 'rightPanel', 'statusBar', '-', 'settings', 'about']), anchorAt(event), 'context', { header: { icon: 'part', title: 'MyMechanics' } });
  });

  // The rollback bar: drag it between features.
  root.addEventListener('pointerdown', (event) => {
    const bar = event.target.closest('[data-rollback-bar]');
    if (!bar || event.button !== 0) return;
    event.preventDefault();
    bar.classList.add('dragging');
    const move = (e) => { bar.style.transform = `translateY(${e.clientY - event.clientY}px)`; };
    const up = (e) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      bar.classList.remove('dragging'); bar.style.transform = '';
      const part = activePart(); if (!part) return;
      let index = part.features.length;
      for (const r of root.querySelectorAll('#left-panel .tree-row.tree-feature')) {
        const rect = r.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) { const id = r.dataset.tree.slice(5); const at = part.features.findIndex((f) => f.id === id); const owner = part.features.findIndex((f) => f.sketch === id); index = owner >= 0 && owner < at ? owner : at; break; }
      }
      rollbackTo(index);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });

  // Drawing views: drag to move.
  root.addEventListener('pointerdown', (event) => {
    const view = event.target.closest?.('#drawing-host [data-view]');
    if (!view || event.button !== 0 || !activeDrawing()) return;
    const d = activeDrawing();
    const id = view.dataset.view;
    const svg = view.ownerSVGElement;
    const pt = (e) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
    const start = pt(event);
    const place = layoutViews(d, drawingProjections(d)).places.get(id);
    if (!place) return;
    let moved = false;
    const move = (e) => { const p = pt(e); const dx = p.x - start.x; const dy = p.y - start.y; if (Math.hypot(dx, dy) > 1) { moved = true; view.setAttribute('transform', `translate(${dx} ${dy})`); } };
    const up = (e) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      if (!moved) return;
      const p = pt(e);
      change('op.moveView', () => { const v = d.views.find((x) => x.id === id); v.x = place.cx + p.x - start.x; v.y = place.cy + p.y - start.y; });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });

  root.querySelector('#drawing-host')?.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    state.drawingZoom = Math.max(0.2, Math.min(6, state.drawingZoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
    renderDrawing();
  }, { passive: false });

  root.querySelectorAll('[data-split="left"], [data-split="right"]').forEach((splitter) => splitter.addEventListener('pointerdown', (event) => {
    const side = splitter.dataset.split;
    if ((side === 'left' && !state.settings.showLeftPanel) || (side === 'right' && !state.settings.showRightPanel)) return;
    event.preventDefault();
    const key = side === 'left' ? 'leftWidth' : 'rightWidth';
    const startWidth = state.settings[key];
    pointerDrag(event, {
      cursor: 'col-resize',
      move: (dx) => { const width = Math.max(side === 'left' ? PANEL_MIN.left : PANEL_MIN.right, Math.min(700, startWidth + (side === 'left' ? dx : -dx))); root.style.setProperty(side === 'left' ? '--left-width' : '--right-width', `${width}px`); state.settings[key] = width; },
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

  window.addEventListener('resize', frameThrottle(() => { fitToolbar(); fitCommandManager(); if (desktop && state.minWidth && window.innerWidth < state.minWidth - 1) native.setMinimumSize(state.minWidth, 640).catch(() => {}); }));
  document.addEventListener('keydown', onKeyDown, true);

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) { const previous = state.settings; state.settings = loadSettings(globalThis.localStorage); applySettings(previous); }
    else if (event.key === RECENT_KEY || event.key === RECENT_DIRS_KEY) { state.recent = loadRecent(globalThis.localStorage); state.recentDirs = loadRecentDirs(globalThis.localStorage); if (state.showStart || !state.doc) renderStartPage(); }
  });

  if (!desktop) {
    document.addEventListener('dragover', (event) => { event.preventDefault(); });
    document.addEventListener('drop', (event) => { event.preventDefault(); const file = event.dataTransfer?.files?.[0]; if (file) file.arrayBuffer().then((b) => openContent(file.name, new Uint8Array(b))); });
    window.addEventListener('beforeunload', (event) => { if (doc()?.dirty) { event.preventDefault(); event.returnValue = ''; } });
  }

  setInterval(() => { const clock = root.querySelector('#status-clock'); if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 15000);
}

function drawingSelect(key, value) {
  const d = activeDrawing();
  if (!d) return;
  change('op.edit', () => {
    if (key === 'sheet') { d.sheet = value; for (const v of d.views) { delete v.x; delete v.y; } }
    else if (key === 'projection') { d.projection = value; for (const v of d.views) { delete v.x; delete v.y; } }
    else if (key === 'scale') { if (value === 'auto') d.autoScale = true; else { d.autoScale = false; d.scale = Number(value); } }
  });
  if (key === 'sheet') { fitDrawing(); renderDrawing(); }
}

async function removeDocument(ref) {
  const [kind, id] = ref.split(':');
  const p = project();
  if (!p || documentsOf(p).length <= 1) return;
  const d = findDocument(p, { kind, id });
  const usedBy = kind === 'part' ? [...p.assemblies.filter((a) => a.components.some((c) => c.part === id)), ...p.drawings.filter((x) => x.source?.id === id)] : kind === 'assembly' ? p.drawings.filter((x) => x.source?.id === id) : [];
  const choice = await ask({ icon: 'trash', title: t('confirm.removeDocTitle'), message: t(usedBy.length ? 'confirm.removeDocUsed' : 'confirm.removeDocMessage', { name: d?.name ?? '', count: usedBy.length }), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'remove', label: t('confirm.remove'), icon: 'trash', danger: true, primary: true }] });
  if (choice !== 'remove') return;
  if (state.editing) cancelEditing({ quiet: true });
  change('op.removeDoc', (pr) => {
    if (kind === 'part') { pr.parts = pr.parts.filter((x) => x.id !== id); for (const a of pr.assemblies) { const gone = a.components.filter((c) => c.part === id).map((c) => c.id); a.components = a.components.filter((c) => c.part !== id); a.mates = a.mates.filter((m) => !gone.includes(m.a.comp) && !gone.includes(m.b.comp)); } pr.drawings = pr.drawings.filter((x) => x.source?.id !== id); }
    if (kind === 'assembly') { pr.assemblies = pr.assemblies.filter((x) => x.id !== id); pr.drawings = pr.drawings.filter((x) => x.source?.id !== id); }
    if (kind === 'drawing') pr.drawings = pr.drawings.filter((x) => x.id !== id);
    if (!findDocument(pr, pr.active)) { const first = documentsOf(pr)[0]; pr.active = { kind: first.kind, id: first.doc.id }; }
  });
}

/** Edits from the task pane (data-prop). */
function setProp(key, raw) {
  const part = activePart(); const asm = activeAssembly();
  const [scope, id, field, index] = key.split('.');
  if (scope === 'part' && part) {
    if (id === 'name') return renameItem('doc', raw);
    return change('op.edit', () => { part[id] = raw; });
  }
  if (scope === 'asm' && asm) return renameItem('doc', raw);
  if (scope === 'feat' && part) {
    const f = part.features.find((x) => x.id === id);
    if (!f) return undefined;
    if (field === 'name') return renameItem(`feat:${id}`, raw);
    const v = parseLen(raw, ['angle', 'count'].includes(field) ? 'number' : 'length');
    if (v == null || (v <= 0 && field !== 'offset')) { notify('error', t('notice.invalidValue', { text: raw })); return renderRight(); }
    return change('op.editFeature', () => { f[field] = field === 'count' ? Math.max(1, Math.round(v)) : v; });
  }
  if (scope === 'comp' && asm) {
    const c = asm.components.find((x) => x.id === id);
    if (!c) return undefined;
    if (field === 'name') return renameItem(`comp:${id}`, raw);
    if (field === 'pos') { const v = parseLen(raw); if (v == null) return renderRight(); return change('op.move', () => { c.position[Number(index)] = v; }); }
  }
  if (scope === 'mate' && asm) {
    const m = asm.mates.find((x) => x.id === id);
    const v = parseLen(raw, m?.type === 'angle' ? 'number' : 'length');
    if (m && v != null) return change('op.editMate', () => { m.value = v; });
  }
  return undefined;
}

/** Ctrl+key shortcuts: [key, shift, command]. */
const SHORTCUTS = [
  ['n', false, 'newPart'], ['o', false, 'open'], ['s', false, 'save'], ['s', true, 'saveAs'], ['p', false, 'print'], ['w', false, 'closeProject'], ['i', false, 'importStep'],
  ['z', false, 'undo'], ['y', false, 'redo'], ['z', true, 'redo'], ['b', false, 'rebuild'], ['8', false, 'normalTo'],
  [',', false, 'settings'], ['l', true, 'language'], ['!', true, 'leftPanel'], ['1', true, 'leftPanel'], ['@', true, 'rightPanel'], ['2', true, 'rightPanel'],
  ['q', false, 'exit'], ['h', true, 'startPage'], ['b', true, 'shuffleBackground'], ['r', false, 'recent'], ['j', false, 'bottomPanel'], ['e', true, 'exportImage'],
];
/** Ctrl+1 … Ctrl+7: the standard views (SolidWorks). */
const VIEW_KEYS = { 1: 'view:front', 2: 'view:back', 3: 'view:left', 4: 'view:right', 5: 'view:top', 6: 'view:bottom', 7: 'view:iso' };

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  const editing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const mod = event.ctrlKey || event.metaKey;
  if (mod && !event.altKey) {
    if (editing && ['x', 'c', 'v', 'z', 'y', 'a'].includes(key)) return;
    if (VIEW_KEYS[key] && !event.shiftKey) { event.preventDefault(); run(VIEW_KEYS[key]); return; }
    const shortcut = SHORTCUTS.find(([k, shift]) => k === key && shift === event.shiftKey);
    if (shortcut) { event.preventDefault(); event.stopPropagation(); run(shortcut[2]); }
    return;
  }
  if (key === 'f1') { event.preventDefault(); run('userGuide'); return; }
  if (key === 'f2') { event.preventDefault(); run('rename'); return; }
  if (editing) { if (key === 'escape') event.target.blur(); return; }
  if (!hasDoc()) return;
  if (key === 'escape') {
    event.preventDefault();
    if (sketching()) { if (state.editing.editor.escape()) { renderCommandManager(); renderLeft(); renderStatus(); } return; }
    if (state.editing) { pmCommand('cancel'); return; }
    clearSelection();
    return;
  }
  if (key === 'enter' && state.editing) { event.preventDefault(); acceptEditing(); return; }
  if (key === 'delete' || key === 'backspace') { event.preventDefault(); run('delete'); return; }
  if (key === ' ' && !sketching()) { event.preventDefault(); run('viewsMenu', { anchor: anchorFor('viewsMenu') }); return; }
  if (key === 'f') { event.preventDefault(); run('zoomFit'); return; }
  if (sketching()) {
    const map = { l: 'sk:line', r: 'sk:rect', c: 'sk:circle', a: 'sk:arc3', p: 'sk:polygon', d: 'sk:dimension', t: 'sk:trim', s: 'sk:select' };
    if (map[key]) { event.preventDefault(); run(map[key]); return; }
  }
  if (key === 'k') { event.preventDefault(); run('styleCycle'); }
}

// ───────────────────────── popup actions

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
  popups.on('start-tutorial', () => openDocWindow('guide'));
  popups.on('show-start', () => showStartPage(true));
  popups.on('progress-cancel', (data) => { popups.actions.get(`cancel:${data.op}`)?.(); });
  popups.on('copy-text', (data) => native.clipboardWrite(data.text).then(() => notify('success', t('notice.copiedText'))).catch((error) => showError('error.unexpected', error)));
}

// ───────────────────────── start-up

async function restoreSession() {
  if (!desktop || !state.settings.restoreSession) return;
  if (state.instance && !state.instance.first) return;
  let files = [];
  try { files = JSON.parse(globalThis.localStorage?.getItem(SESSION_KEY) ?? '{}').files ?? []; } catch { /* none */ }
  if (!files.length) return;
  const exists = await native.pathsExist(files);
  if (exists[0]) await openPath(files[0], { quiet: true });
}

/** What the start page reads. */
const panelApi = {
  state, commands, commandTip, commandEnabled, t,
  settings: () => state.settings,
  version: () => state.info?.version ?? VERSION,
};

async function start() {
  setFeatureNamer((key) => t(`fname.${key}`, null, null));
  renderShell();
  bindEvents();
  bindPopupActions();
  await popups.init();
  const welcomeLikely = desktop && state.settings.showWelcome && state.settings.showStartPage !== false && !globalThis.__MYMECHANICS_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome');
  if (welcomeLikely) popups.prewarm('welcome');
  state.info = await native.appInfo().catch(() => null);
  state.instance = await native.instanceInfo().catch(() => ({ first: true, others: 0 }));
  if (state.settings.animationRandom) updateSettings({ animation: randomAnimation(state.settings.animation) }, { quiet: true });
  setInterval(tickStartBackground, 1000);
  document.title = `MyMechanics v${state.info?.version ?? VERSION}`;
  native.setBackendLanguage(state.settings.language);
  applySettings({});
  await loadBackground();
  // The kernel loads while the start page shows: the first part then opens at once.
  setTimeout(() => { loadKernel().then(() => { if (hasDoc()) { syncView(); renderAll(); } }).catch((error) => console.warn('kernel', error)); }, 600);

  if (desktop) {
    appWindow.onCloseRequested(async (event) => {
      if (state.quitting) return;
      event.preventDefault();
      if (await confirmExit()) { state.quitting = true; await native.quitApp(); }
    });
    getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') { const path = event.payload.paths?.[0]; if (path) openPath(path); }
    });
    native.listen('fatal-error', (fatal) => { const error = new Error(fatal.message); error.stack = [fatal.location, fatal.backtrace].join('\n'); showError('error.fatal', error, fatal.location); });
  }

  await restoreSession();
  trackMaximized();
  for (const path of await native.startupFiles().catch(() => [])) await openPath(path);
  state.showStart = !state.doc;
  renderAll();
  const welcome = state.settings.showWelcome && state.showStart && !globalThis.__MYMECHANICS_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome');
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
  updateSettings({ tutorialOffered: true }, { quiet: true });
  const result = await popups.open('welcome', {});
  if (result?.choice === 'tutorial') openDocWindow('guide');
  else if (result?.choice === 'sample') openSampleAsk('flange');
}

// Test hook: the E2E suite and the smoke script drive the app through this.
window.__mymechanics = {
  state, t, commands, popups, run,
  menus: { MENUS, SUBMENUS, enabled: (id) => commandEnabled(id) },
  get viewport() { return viewport; },
  actions: {
    newDocument, openSampleAsk, openContent, saveDoc, closeProject, select, change, undo, redo, startFeature, startSketch, openNewSketch, editSketch, editFeature,
    acceptEditing, cancelEditing, exitSketch, sketchCommand, switchDocument, newDrawing, insertComponent, startMate, showStartPage, updateSettings, pmFieldChanged, pmSet, pmToggle, pmCommand,
    buildPart: (part) => buildPart(part), exportModel, checkInterference, massPropertiesRows, rollbackTo, ensureKernel, regenerate,
  },
  get project() { return project(); },
  active: () => active(),
};

start()
  .catch((error) => showError('error.unexpected', error, 'start'))
  .finally(() => { if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {}); });
