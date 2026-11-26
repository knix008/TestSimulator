// MyMechanics main window: menu bar (also the title bar), toolbar, the CommandManager (feature, sketch,
// evaluate, assembly and drawing commands), the FeatureManager design tree / PropertyManager on the
// left, the graphics area (or a drawing sheet), the task pane on the right, problems and messages at
// the bottom and the status bar.
//
// The shell (menus as popup windows, toolbar, start page, settings, themes, progress popups) follows
// MySketchBook; the modelling is in cad/ (no DOM) and the 3D view in view/.
import { segGlyph } from './ui/seg-icons.js';
import { pickSolid } from './cad/exchange.js';
import { writeObj, writePly, writeGltf, writeGlb, writeVrml, write3mf, writeUsdz, writeOff, writeAmf, MESH_IMPORT_EXTENSIONS } from './cad/mesh-formats.js';
import { importMeshSolids } from './cad/mesh-import.js';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import * as THREE from 'three';
import APP_ICON from '../assets/icon-256.png';
import { loadKernel, kernelReady, rep } from './cad/kernel.js';
import { createProject, createPart, createAssembly, addDrawing, documentsOf, findDocument, History, packProject, unpackProject, newId } from './cad/document.js';
import { regenerate, createFeature, setFeatureNamer, allDependents, faceRef, resolvePlane, frame as makeFrame, STD_PLANES, usableSketches, toSketch, nameKey, TOOL_FEATURES, textOutline } from './cad/features.js';
import { createSketchGeometry, addRelation, addConstraint, addLine, addArc, addCircle, newSketchId, analyse, byId, standalonePoints, profiles, polyline } from './cad/sketch.js';
import { sketchUse, STRUCTURAL_PROFILES, ADVANCED_TYPES } from './cad/advanced.js';
import { equationRows, addConfiguration, setSuppressedIn, designTableCsv, applyDesignTable, activeConfiguration, nextVariableName, evaluate, variableValues } from './cad/params.js';
import { analyse as analyseFea, stressColor, thermal as analyseThermal, modal as analyseModal, temperatureColor } from './cad/fea.js';
import { THREAD_SIZES } from './ui/pm-advanced.js';
import { setModelledThreads } from './cad/threads.js';
import { withThreadMarks } from './cad/drawing-threads.js';
import { PART_MORE_TYPES, CURVE_TYPES, PART_MORE_ICONS } from './cad/part-more-types.js';
import { countSolids } from './cad/part-more.js';
import { importStlSolid, weldMeshObject } from './cad/stl.js';
import { packFiles, unpackFiles, primeScadResult, scadReport, scadTime, scadSpecials } from './cad/openscad-feature.js';
import { csgTree } from './cad/openscad/csg-tree.js';
import { exportScadResult } from './cad/openscad/export.js';
import { makeZip } from './cad/vault-zip.js';
import { runScadWithFiles, decodeScad, loadFonts, writeScad } from './cad/openscad/index.js';
import { startParams as partMoreParams } from './ui/pm-part-more.js';
import { sheetMoreStart, weldmentCutRows, hasWeldments } from './ui/pm-sheet-more.js';
import { SHEET_MORE_TYPES, SHEET_MORE_ICONS } from './cad/sheet-more-types.js';
import { convertEntities, intersectionEntities, transformEntities } from './cad/sketch-more.js';
import { silhouetteEntities } from './cad/sketch-silhouette.js';
import { setDriven, setArcCondition, baselineDimensions } from './cad/sketch-diagnose.js';
import { refreshPierce } from './cad/sketch-pierce.js';
import { moveFeature, makeFolder, moveIntoFolder, dissolveFolder } from './cad/feature-order.js';
import { makePartsFromBlocks, updateFromLayout } from './cad/layout.js';
import { blockInstances } from './cad/asm-extra.js';
import { REL3D, solve3d, addRelation3d, measure3d, pruneRelations3d } from './cad/sketch3d-solve.js';
import { traceImage, traceToSketch } from './cad/autotrace.js';
import { stretchEntities, fullyDefine } from './cad/sketch-draw.js';
import { syncSlider } from './ui/sliders.js';
import { edgeSignature, faceSignature } from './cad/refs.js';
import { explodeLines, chainPath, solveMates, placeShape, interferences, mateEntityOfFace, quatIdentity, quatToAxisAngle, instanceName, quatFromAxisAngle, quatMultiply, captureMate, mateTouches, MATE_REFS, MATE_DEFAULTS, explodedPlacement, autoExplode, motionFrame, motionCursor, flattenAssembly, composePlacement, placePoint, placeDir } from './cad/assembly.js';
import { nearestVertex } from './cad/extrude-more.js';
import { ansiHole, metricStdHole, ANSI_TAPS, NPT_SIZES } from './cad/hole-more.js';
import { projectView, drawingSvg, drawingDxf, layoutViews, SHEETS, projectionKey, bomRows, VIEW_CAMERAS, viewBasis, turnedView } from './cad/drawing.js';
import { toWorld as bendToWorld } from './cad/sheet-fold.js';
import { readDwg } from './cad/dwg/read.js';
import { writeDwg } from './cad/dwg/write.js';
import { readDxf } from './cad/dxf-read.js';
import { flattenDrawing, itemsToSketch, UNIT_MM } from './cad/cad2d-import.js';
import { sketchToEntities, entitiesToDxf } from './cad/sketch-export.js';
import { flatPatternEntities } from './cad/flat-dxf.js';
import { solarPosition, sunDirection } from './cad/sun.js';
import { MATERIALS, MATERIAL_FAMILIES, familyOf, materialOf, materialName, massOf } from './cad/materials.js';
import { SAMPLES, buildSample } from './cad/samples.js';
import { groupTabs, FLY_OF, FLYOUTS, MENU_ONLY } from './ui/flyouts.js';
/** The CommandManager's tabs folded into flyouts (made once, after every module has added its commands). */
let groupedTabs = null;
function ribbonGroups() {
  groupedTabs ??= groupTabs(Object.fromEntries(Object.entries(COMMAND_TABS).filter(([k]) => k !== 'user')), (id) => Boolean(commands[id]), ['features', 'sketch', 'surfaces', 'sheetMetal', 'weldments', 'mold', 'assembly', 'drawing', 'evaluate', 'stdTools', 'cam', 'plastics', 'inspection']);
  return groupedTabs;
}
import { Viewport, hitKey } from './view/viewport.js';
import { SketchEditor } from './view/sketcher.js';
import { treeHtml, featureIcon, MATE_ICONS } from './ui/tree.js';
import { propertyManagerHtml, drawingPropsHtml, HOLE_SIZES, TAP_SIZES } from './ui/propertymanager.js';
import { startPageHtml, TEMPLATES } from './ui/startpage.js';
import { startBoard } from './ui/startboard.js';
import { AnimatedBackground } from './ui/background.js';
import { ANIMATIONS, loadSettings, PANEL_MIN, RECENT_DIRS_KEY, RECENT_KEY, SESSION_KEY, STORAGE_KEY, storeSettings } from './domain/settings.js';
import { addRecent, loadRecent, loadRecentDirs, removeRecent, storeRecent, storeRecentDirs } from './domain/recent.js';
import { baseName, directoryOf, fileSafe, stripExtension, withExtension } from './domain/paths.js';
import { switchFlag, flagFor } from './flags.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { PopupHost } from './platform/popups.js';
import { createPrintHost } from './print/host.js';
import { applyFont, applyTheme, randomThemeId, resolveTheme, themeName } from './themes.js';
import { escapeHtml, frameThrottle, isMac, keyLabel, pointerDrag } from './ui/dom.js';
import { attachScadEditor } from './ui/scad-editor.js';
import { DOC_KINDS, docLabel, docWindowTitle } from './domain/helpdocs.js';
import { PROGRESS_ICONS, PROGRESS_NAME_ICONS } from './ui/progressicons.js';
import { createMoreTools } from './app-more.js';
import { createAsmTools } from './app-asmtools.js';
import { expandFlexible, flexLeafPlacement } from './cad/flex-sub.js';
import { createExplodeTools } from './app-explode.js';
import { createAsmVizTools } from './app-asmviz.js';
import { createSectionPropsTools } from './app-secprops.js';
import { createDecalTools } from './app-decals.js';
import { createWalkTools } from './app-walk.js';
import { createFrameTools } from './app-frame.js';
import { createScanTools } from './app-scan.js';
import { readIdfBoard, readIdfLibrary, idfModel, idfProject } from './cad/idf.js';
import { boardFromBody, packageFromBody, placementOf, writeIdfBoard, writeIdfLibrary } from './cad/idf-export.js';
import { createCustomTools, drawingTemplateOf, applyDrawingTemplate } from './app-custom.js';
import { ruleK, gaugeRowsOf, gaugeOf, seedBendRows, DEFAULT_K_ROWS } from './cad/sheet-gauge.js';
import { createAsmWeldTools } from './app-asmweld.js';
import { hiddenInside } from './cad/asm-more.js';
import { createInContextTools } from './app-incontext.js';
import { keyframePose, captureKey, simulateDynamics, dynamicsPose, inertiaOf, combineInertia } from './cad/motion-dynamics.js';
import { mateRefMates, magneticPairs } from './cad/part-extra.js';
import { withSim2 } from './app-sim2.js';
import { attachPdm } from './app-pdm.js';
import { attachDrwTools } from './app-drw.js';
import { createTable } from './cad/drawing-annot.js';
import { switchAssemblyConfig, addAssemblyConfig, removeAssemblyConfig } from './cad/asm-configs.js';
import { createStdTools } from './app-std.js';
import { attachMfgTools } from './app-mfg.js';
import { createIllustrationTools } from './app-illustration.js';
import { createSchematicTools } from './app-schematic.js';
import { createDesignCheckTools } from './app-designcheck.js';
import { createTaskTools } from './app-tasks.js';
import { createRecorder, createMacroTools } from './app-macros.js';
import { createDesignStudyTools } from './app-designstudy.js';
import { createDefeatureTools } from './app-defeature.js';
import { createMarkupTools } from './app-markup.js';
import { createElectronicsTools } from './app-electronics.js';
import { createFreeSurfaceTools } from './app-freesurface.js';
import { routeBodyColours } from './cad/routing.js';
import { leafCutFeatures, cutLeafBody } from './cad/asm-extra.js';

const root = document.querySelector('#app');
const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const popups = new PopupHost();
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
const lang = () => (getLanguage() === 'en' ? 'en' : 'ko');
/** The status bar clock in the app's language (not the OS locale: an English UI on a Korean PC showed "오후"). */
const clockText = () => new Date().toLocaleTimeString(lang() === 'en' ? 'en-US' : 'ko-KR', { hour: '2-digit', minute: '2-digit' });

// Macro recording (app-macros.js): the entry points below report the user's actions to it.
const recorder = createRecorder();

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
  // CommandManager flyouts: the command each one shows (the family member used last).
  flyLast: {},
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

window.addEventListener('error', (event) => { if (/^ResizeObserver loop/.test(String(event.message ?? ''))) return; if (event.error || event.message) showError('error.unexpected', event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}` : ''); });
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
  // Other parts this one inserts (Insert Part / Cavity) rebuild it when they change.
  const deps = feats.filter((f) => f.type === 'insertPart').map((f) => project()?.parts.find((x) => x.id === f.part)?.features ?? null);
  const key = JSON.stringify([feats, limit, state.settings.meshQuality, part.flat ?? false, part.variables ?? null, part.configurations ?? null, part.config ?? null, part.externalRefs ?? null, deps, Boolean(state.settings.modelledThreads)]);
  const cacheKey = `${part.id}:${slot}`;
  const cached = builds.get(cacheKey);
  if (cached?.key === key) return cached;
  const t0 = performance.now();
  // Threads: modelled for features set to 'auto' when Settings › Modeling › Modelled threads is on.
  setModelledThreads(Boolean(state.settings.modelledThreads));
  const result = regenerate({ ...part, features: feats }, { upTo: limit, project: project() });
  let tess = { mesh: null };
  try { tess = tessellate(result.body); } catch (error) { console.warn('tessellate', error); }
  const entry = { key, result, body: result.body, ...tess, ms: performance.now() - t0, extras: tessellateExtras(result, tess.size ?? 100) };
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
  if (more.blocks(labelKey)) return undefined;
  const d = doc();
  if (!d) return undefined;
  const result = mutate(d.project);
  commit(labelKey);
  return result;
}

// Macro events (app-macros.js mm.on): set once the macro tools exist.
let emitMacro = () => {};

function commit(labelKey) {
  const d = doc();
  if (!d) return;
  if (d.history.commit(d.project, t(labelKey))) { d.revision += 1; queueMicrotask(() => emitMacro('change', { operation: t(labelKey) })); }
  afterChange();
}

function afterChange() {
  pruneSelection();
  if (activeAssembly()) solveAssembly();
  syncView();
  renderAll();
}

/** Undo / redo work outside modes, and inside Render (its appearance edits; the picture renders again). */
// Editors with their own undoable edits (render settings, schematics, design check corrections, tasks run on the
// open document) keep undo/redo; the rest block it.
const undoBlocked = () => Boolean(state.editing) && !['render', 'schematic', 'designCheck', 'tasks', 'designStudy', 'markup', 'electronics', 'moveComp'].includes(state.editing.mode);

function undo() {
  // In a sketch: the sketch's own steps (drawing, dimensions, relations) until the sketch is closed.
  if (sketching()) { const label = state.editing.editor.undo(); if (label) { renderLeft(); notify('info', t('notice.undone', { label: t(label) })); } return; }
  const d = doc();
  if (!d || undoBlocked()) return;
  const r = d.history.undo();
  if (!r) return;
  d.project = r.project;
  d.revision += 1;
  afterChange();
  if (state.editing?.mode === 'render') std.render.afterHistory();
  if (state.editing?.mode === 'schematic') schTools.afterHistory();
  if (state.editing?.mode === 'designCheck') dcTools.afterHistory();
  if (state.editing?.mode === 'markup') mkTools.afterHistory();
  if (state.editing?.mode === 'electronics') elTools.afterHistory();
  notify('info', t('notice.undone', { label: r.label }));
}

function redo() {
  if (sketching()) { const label = state.editing.editor.redo(); if (label) { renderLeft(); notify('info', t('notice.redone', { label: t(label) })); } return; }
  const d = doc();
  if (!d || undoBlocked()) return;
  const r = d.history.redo();
  if (!r) return;
  d.project = r.project;
  d.revision += 1;
  afterChange();
  if (state.editing?.mode === 'render') std.render.afterHistory();
  if (state.editing?.mode === 'schematic') schTools.afterHistory();
  if (state.editing?.mode === 'designCheck') dcTools.afterHistory();
  if (state.editing?.mode === 'markup') mkTools.afterHistory();
  if (state.editing?.mode === 'electronics') elTools.afterHistory();
  notify('info', t('notice.redone', { label: r.label }));
}

// ───────────────────────── opening documents

async function setDoc(d) {
  await ensureKernel();
  void prepareScadFonts(scadSources(d.project));
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

async function newDocument(kind = 'part', { unit = null, blank = false } = {}) {
  if (kind === 'drawing') {
    if (hasDoc() && (activePart() || activeAssembly())) return newDrawing();
    notify('info', t('notice.drawingNeedsModel'));
    return null;
  }
  // The user's default template for this kind (Customize › Templates), unless a blank one is asked for.
  const tpl = blank ? null : customTools.api.defaultTemplate(kind);
  if (tpl) {
    const made = await newFromTemplate(tpl);
    if (made && unit) updateSettings({ units: unit }, { quiet: true });
    return made;
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
  if (choice === 'save') return Boolean(await commands.save.run());
  return choice === 'discard';
}

/** Opens a sample (on its motion scene; `{ stage: false }` builds it without — the sample's own documents only). */
async function openSampleAsk(id, { stage = true } = {}) {
  if (!(await confirmReplace())) return null;
  const entry = SAMPLES.find((x) => x.id === id);
  const name = entry?.[lang()]?.[0] ?? id;
  await ensureKernel();
  return busy('progress.sample', name, async () => {
    const p = buildSample(id, lang(), { stage });
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

/** Switches the open document (recorded for macros). */
function switchDocument(ref) { const r = recorder.around('document', [ref], () => switchDocumentImpl(ref)); emitMacro('document', ref); return r; }
function switchDocumentImpl(ref) {
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
    onCamera: (camera) => { more.onCamera(); if (doc() && activeKind() !== 'drawing') doc().project.camera = camera; if (sketching()) { clearTimeout(mountViewport.grid); mountViewport.grid = setTimeout(() => state.editing?.editor?.render(), 60); } },
    onPick: (hit, e) => onViewportPick(hit, e),
    onHover: (hit) => { state.hover = hit; renderPointer(hit); },
    onContext: (hit, e) => viewportContextMenu(hit, e),
    onDoubleClick: (hit) => onViewportDoubleClick(hit),
    tool: () => (sketching() ? state.editing.editor : more.dragTool?.() ?? null),
    onScaleBarMoved: (pos) => updateSettings({ scaleBarPos: pos }, { quiet: true }),
    onLightSelect: (id) => { if (state.editing?.mode === 'lights') { state.editing.selected = id; renderLeft(); } },
    onLightMoved: (id, position) => { if (!position) return; change('op.light', (p) => { const l = sceneLights(p).lights.find((x) => x.id === id); if (l) l.position = position; }); },
    invertZoom: () => state.settings.invertZoom,
    orbitMode: () => state.settings.orbitMode,
    orbitSpeed: () => state.settings.orbitSpeed,
    gestures: () => customTools.api.gesturesOn(),
    gestureLabels: () => customTools.api.gestureLabels(),
    onGesture: (dx, dy) => customTools.api.onGesture(dx, dy),
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
/** The document's lights (DisplayManager › Lights): ambient, the light that follows the camera, placed lights. */
function sceneLights(p) {
  p.lights ??= { ambient: { color: '#ffffff', ground: '#8a8f99', intensity: 1.1 }, cameraLight: { on: true, color: '#ffffff', intensity: 1.6 }, lights: [] };
  p.lights.lights ??= [];
  return p.lights;
}

const LIGHT_KINDS = ['directional', 'point', 'spot', 'sun'];

/**
 * A sun light's place: from its location, date, time and time zone (cad/sun.js), shining on its target from far
 * along the sun's direction (north along +Y turned by `north`). Below the horizon it is off.
 */
function placeSun(l, size = 400) {
  const now = new Date();
  l.lat ??= 37.57; l.lon ??= 126.98; l.tz ??= 9; l.north ??= 0;
  l.date ??= now.toISOString().slice(0, 10); l.time ??= '12:00';
  const s = solarPosition(Number(l.lat), Number(l.lon), l.date, l.time, Number(l.tz));
  const d = sunDirection(s.azimuth, s.elevation, Number(l.north));
  const tg = l.target ?? [0, 0, 0];
  l.position = tg.map((c, i) => Math.round((c + d[i] * size) * 1000) / 1000);
  l.sun = { azimuth: Math.round(s.azimuth * 100) / 100, elevation: Math.round(s.elevation * 100) / 100 };
  l.on = s.elevation > 0;
  return l;
}

function startLights() {
  if (!project() || activeKind() === 'drawing') { notify('info', t('notice.lightsNeedModel')); return; }
  if (state.editing) cancelEditing({ quiet: true });
  state.editing = { mode: 'lights', selected: sceneLights(project()).lights[0]?.id ?? null };
  state.leftTab = 'pm';
  syncView();
  renderAll();
}

function addLight(kind) {
  const box = viewport?.contentBox();
  const size = box && !box.isEmpty() ? box.getSize(new THREE.Vector3()).length() : 200;
  const c = box && !box.isEmpty() ? box.getCenter(new THREE.Vector3()).toArray() : [0, 0, 0];
  const n = sceneLights(project()).lights.length + 1;
  const light = { id: newId('light'), name: `${t(`light.${kind}`)}${n}`, kind, color: kind === 'spot' ? '#fff3d6' : '#ffffff', intensity: kind === 'directional' ? 1 : 0.8, position: [c[0] + size * 0.6, c[1] - size * 0.5, c[2] + size * 0.8].map((v) => Math.round(v)), target: c.map((v) => Math.round(v)), angle: 30, on: true };
  if (kind === 'sun') placeSun(light, size);
  change('op.light', (p) => { sceneLights(p).lights.push(light); });
  state.editing.selected = light.id;
  syncView();
  renderLeft();
}

function lightsPm(e) {
  const L = sceneLights(project());
  const color = (key, value) => `<input type="color" data-pm-field="${escapeHtml(key)}" value="${escapeHtml(value)}"/>`;
  const row = (label, body, glyph = 'smartDim') => `<label class="pm-field">${icon(glyph)}<span class="pm-label">${escapeHtml(label)}</span>${body}</label>`;
  const num = (key, value, unit = '') => `<input type="text" class="pm-text short" data-pm-field="${escapeHtml(key)}" data-num data-unit-label="${escapeHtml(unit)}" value="${escapeHtml(fmt(value, 3))}" spellcheck="false"/>`;
  const vec3 = (key, v) => `<span class="pm-vec3">${[0, 1, 2].map((i) => num(`${key}.${i}`, v[i])).join('')}</span>`;
  const list = L.lights.map((l) => `<div class="light-row ${e.selected === l.id ? 'active' : ''}"><button class="icon-button" data-pm="selLight:${escapeHtml(l.id)}" title="${escapeHtml(t('light.select'))}">${icon(l.kind === 'directional' ? 'sun' : 'bulb')}</button><span class="grow">${escapeHtml(l.name)}</span><label class="pm-check"><input type="checkbox" data-pm-toggle="light:${escapeHtml(l.id)}:on" ${l.on !== false ? 'checked' : ''}/></label><button class="icon-button" data-pm="delLight:${escapeHtml(l.id)}" title="${escapeHtml(t('action.delete'))}">${icon('trash', 'icon tiny')}</button></div>`).join('');
  const sel = L.lights.find((l) => l.id === e.selected);
  const props = sel ? pmGroup(sel.kind === 'directional' || sel.kind === 'sun' ? 'sun' : 'bulb', t('light.properties', { name: sel.name }), [
    row(t('pm.name'), `<input type="text" class="pm-text" data-pm-field="light:${sel.id}:name" value="${escapeHtml(sel.name)}" spellcheck="false"/>`, 'edit'),
    `<div class="pm-row">${pmSeg(`light:${sel.id}:kind`, LIGHT_KINDS.map((k) => [k, t(`light.${k}`)]), sel.kind)}</div>`,
    row(t('light.color'), color(`light:${sel.id}:color`, sel.color), 'palette'),
    row(t('light.intensity'), num(`light:${sel.id}:intensity`, sel.intensity), 'sun'),
    row(t('light.position'), vec3(`light:${sel.id}:position`, sel.position), 'position'),
    sel.kind !== 'point' ? row(t('light.target'), vec3(`light:${sel.id}:target`, sel.target ?? [0, 0, 0]), 'origin') : '',
    sel.kind === 'spot' ? row(t('light.angle'), num(`light:${sel.id}:angle`, sel.angle ?? 30), 'dimAngle') : '',
    // The sun: where and when (its direction follows; below the horizon it is off).
    sel.kind === 'sun' ? [
      row(t('sun.lat'), num(`light:${sel.id}:lat`, sel.lat ?? 37.57, '°'), 'position'),
      row(t('sun.lon'), num(`light:${sel.id}:lon`, sel.lon ?? 126.98, '°'), 'position'),
      row(t('sun.date'), `<input type="date" class="pm-text" data-pm-field="light:${sel.id}:date" value="${escapeHtml(sel.date ?? '')}"/>`, 'calendar'),
      row(t('sun.time'), `<input type="time" class="pm-text" data-pm-field="light:${sel.id}:time" value="${escapeHtml(sel.time ?? '12:00')}"/>`, 'clock'),
      row(t('sun.tz'), num(`light:${sel.id}:tz`, sel.tz ?? 9, 'h'), 'clock'),
      row(t('sun.north'), num(`light:${sel.id}:north`, sel.north ?? 0, '°'), 'dimAngle'),
      `<p class="pm-note">${escapeHtml(t('sun.at', { azimuth: fmt(sel.sun?.azimuth ?? 0, 1), elevation: fmt(sel.sun?.elevation ?? 0, 1) }))}${sel.on === false ? ` — ${escapeHtml(t('sun.below'))}` : ''}</p>`,
    ].join('') : '',
    `<p class="pm-note">${escapeHtml(t('light.dragHint'))}</p>`,
  ].join('')) : '';
  return [
    pmHead('bulb', t('cmd.lights'), t('pm.help.lights')),
    pmGroup('sun', t('light.ambient'), `${row(t('light.color'), color('amb:color', L.ambient.color), 'palette')}${row(t('light.groundColor'), color('amb:ground', L.ambient.ground ?? '#8a8f99'), 'palette')}${row(t('light.intensity'), num('amb:intensity', L.ambient.intensity), 'sun')}`),
    pmGroup('eye', t('light.cameraLight'), `<label class="pm-check"><input type="checkbox" data-pm-toggle="cam:on" ${L.cameraLight.on !== false ? 'checked' : ''}/><span>${escapeHtml(t('light.followsCamera'))}</span></label>${row(t('light.color'), color('cam:color', L.cameraLight.color), 'palette')}${row(t('light.intensity'), num('cam:intensity', L.cameraLight.intensity), 'sun')}`),
    pmGroup('bulb', t('light.list'), `${list || `<p class="pm-note">${escapeHtml(t('light.none'))}</p>`}<div class="pm-relations">${LIGHT_KINDS.map((k) => pmButton(`addLight:${k}`, k === 'directional' || k === 'sun' ? 'sun' : 'bulb', t(`light.add.${k}`))).join('')}</div>`),
    props,
  ].join('');
}

function lightsField(key, raw, v) {
  const [scope, id, field] = key.split(':');
  const text = String(raw ?? '').trim();
  change('op.light', (p) => {
    const L = sceneLights(p);
    if (scope === 'amb') { if (id === 'intensity') { if (v != null && v >= 0) L.ambient.intensity = v; } else L.ambient[id] = text; return; }
    if (scope === 'cam') { if (id === 'intensity') { if (v != null && v >= 0) L.cameraLight.intensity = v; } else L.cameraLight[id] = text; return; }
    const l = L.lights.find((x) => x.id === id);
    if (!l) return;
    const [name, index] = field.split('.');
    if (name === 'name') { if (text) l.name = text; }
    else if (name === 'color') l.color = text;
    else if (l.kind === 'sun' && ['lat', 'lon', 'tz', 'north'].includes(name)) { if (v != null) { l[name] = name === 'lat' ? Math.max(-90, Math.min(90, v)) : v; placeSun(l); } }
    else if (l.kind === 'sun' && (name === 'date' || name === 'time')) { if (text) { l[name] = text; placeSun(l); } }
    else if (name === 'position' || name === 'target') { if (v != null) { l[name] = [...(l[name] ?? [0, 0, 0])]; l[name][Number(index)] = v; } }
    else if (v != null && v >= 0) l[name] = name === 'angle' ? Math.min(89, Math.max(1, v)) : v;
  });
}

/** Rulers, grid and scale bar (View › Show); the 3D grid steps aside while a sketch shows its own. */
function syncGuides() {
  if (!viewport) return;
  const st = state.settings;
  viewport.setGuides({ rulers: st.showRulers !== false, grid: st.showGrid !== false && !sketching(), scaleBar: st.showScaleBar !== false, unit: units(), factor: UNIT_FACTOR[units()], scaleBarPos: st.scaleBarPos ?? null, gridPlane: st.gridPlane ?? 'top' });
  if (project()) {
    const key = JSON.stringify(sceneLights(project()));
    if (key !== syncGuides.lightsKey) { syncGuides.lightsKey = key; viewport.setLights(sceneLights(project())); }
    viewport.setLightHandles(state.editing?.mode === 'lights', state.editing?.selected ?? null);
  }
}

function syncView() {
  if (!viewport || !hasDoc()) return;
  syncGuides();
  renderMotionBar();
  const kind = activeKind();
  root.querySelector('#view-host').hidden = kind === 'drawing';
  root.querySelector('#drawing-host').hidden = kind !== 'drawing';
  if (kind === 'drawing') { renderDrawing(); return; }
  if (!kernelReady()) return;
  if (kind === 'part') syncPart(activePart());
  else if (kind === 'assembly') syncAssembly(activeAssembly());
  more.decorate(kind);
  viewport.setSelection(state.selection.map(selectionHit).filter(Boolean));
}

function bodySpec(key, entry, part, extra = {}) {
  const mat = materialOf(part.material);
  // Cables and harness pieces show their own colours on the part (route features' faces).
  const routeColors = routeBodyColours(entry, part.color || mat.color);
  return { key, mesh: entry.mesh, edges: entry.edges, faceIndex: entry.faceIndex, edgeIndex: entry.edgeIndex, color: part.color || mat.color, metal: mat.metal * 0.6, rough: mat.rough, material: part.material, partId: part.id, ...(routeColors ? { colors: routeColors, renderColors: routeColors } : {}), ...extra };
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
  const ghost = e?.mode === 'sketch' || e?.mode === 'secProps';
  const bodies = entry.mesh ? [{ ...bodySpec('body', entry, part), ghost, ...resultColours(part, entry) }] : [];
  for (const sf of entry.extras?.surfaces ?? []) bodies.push({ key: `surf:${sf.id}`, mesh: sf.mesh, edges: sf.edges, color: '#2fa39a', opacity: 0.55, metal: 0.1, rough: 0.6, faceIndex: new Map(), edgeIndex: new Map() });
  // Edited in the context of an assembly: the other components around it, see-through.
  bodies.push(...icTools.contextBodies());
  viewport.setBodies(bodies);
  // Section Properties: its section shown on the model.
  viewport.setPreview(state.editing?.mode === 'secProps' ? state.editing.previewSpec ?? null : state.editing?.mode === 'simulation' && state.editing.result && state.editing.subPreview ? state.editing.subPreview : more.fem?.shellPreview?.(state.editing) ?? preview);
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
      const fr = resolvePlane(e.holeSketch.plane, { body: main.body, planes: main.result.planes, part });
      const pts = e.holeSketch.points.flatMap(([u, v]) => [fr.origin[0] + fr.xDir[0] * u + fr.yDir[0] * v, fr.origin[1] + fr.xDir[1] * u + fr.yDir[1] * v, fr.origin[2] + fr.xDir[2] * u + fr.yDir[2] * v]);
      lines.push({ points: pts, color: '#f28c1e', size: 9 });
    } catch { /* face gone */ }
  }
  // Reference curves (helices) and cosmetic threads.
  // Hidden by the body like its edges (an internal thread or a helix inside a part must not show through it).
  for (const c of entry.extras?.curves ?? []) lines.push({ segments: c.segments, color: '#9c4dcc', width: 1.8, depthTest: true });
  viewport.setLines('markers', lines);
  // Decals on the part's faces (app-decals.js).
  decalTools.show();
}

function sketchLines(f, fr, color) {
  const seg = [];
  const map = new Map(f.entities.map((x) => [x.id, x]));
  const w = (u, v) => [fr.origin[0] + fr.xDir[0] * u + fr.yDir[0] * v, fr.origin[1] + fr.xDir[1] * u + fr.yDir[1] * v, fr.origin[2] + fr.xDir[2] * u + fr.yDir[2] * v];
  for (const e of f.entities) {
    if (e.type === 'point') continue;
    const polys = e.type === 'text' ? textOutline(e) : [polyline(f, e, map, 48)];
    for (const pts of polys) for (let i = 1; i < pts.length; i++) seg.push(...w(...pts[i - 1]), ...w(...pts[i]));
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

/** Component instances (leaves) of an assembly, counted through its sub-assemblies. */
function instanceCount(asm) { let n = 0; for (const c of asm?.components ?? []) n += componentLeaves(c).length; return n; }
/** Large assembly mode: on, off, or automatic from the number of instances. */
function largeAssemblyOn(asm = activeAssembly()) {
  const s = state.settings.largeAssembly ?? 'auto';
  return s === 'on' || (s === 'auto' && instanceCount(asm) >= (state.settings.largeAssemblyThreshold ?? 40));
}
let entrySeq = 0;
/** A build entry's own number (one geometry per build in the viewport). */
const entryUid = (entry) => (entry.uid ??= ++entrySeq);
/** A part's display mesh in large assembly mode: a coarse tessellation, made once per build (same faces, fewer triangles). */
function lightMesh(entry) {
  if (!entry.lightMesh) {
    const size = entry.size ?? 100;
    try { entry.lightMesh = entry.body.mesh({ tolerance: Math.max(4 * meshTolerance(size), size / 150), angularTolerance: 0.6 }); } catch { entry.lightMesh = entry.mesh; }
  }
  return entry.lightMesh;
}

function syncAssembly(asm) {
  const list = [];
  // Large assembly mode: coarse display meshes shared by every instance of a part, no edge lines, small parts hidden.
  const light = largeAssemblyOn(asm);
  const hideBelow = light ? (state.settings.largeHideSmall ?? 0) * assemblySize(asm) : 0;
  let hidden = 0;
  for (const c of asm.components) {
    // state.viewHidden: components an illustration view leaves out (display only; the assembly is not changed).
    if (c.hidden || c.suppressed || state.viewHidden?.has(c.id)) continue;
    const placed = displayPlacement(asm, c);
    // Simplified representation: a box for the whole component, or only the parts that show from outside.
    const simple = c.simplified ? simplifiedOf(c) : null;
    if (simple?.box) { list.push(bodySpec(`comp:${c.id}`, simple.box, simple.part, { matrix: componentMatrix(placed), opacity: 0.85 })); continue; }
    for (const leaf of componentLeaves(c)) {
      const part = project().parts.find((p) => p.id === leaf.part);
      if (!part) continue;
      if (simple?.hidden?.has(leaf.path.join('/'))) { hidden++; continue; }
      const entry = leaf.path.length ? buildPart(part) : componentBuild(c, part);
      if (!entry.mesh) continue;
      if (hideBelow > 0 && (entry.size ?? Infinity) < hideBelow) { hidden++; continue; }
      const key = leaf.path.length ? `comp:${c.id}/${leaf.path.join('/')}` : `comp:${c.id}`;
      const spec = bodySpec(key, entry, part, { matrix: componentMatrix(leaf.path.length ? composePlacement(placed, leaf.placement) : placed) });
      // An envelope is a reference: drawn see-through.
      if (c.envelope) spec.opacity = 0.28;
      // Assembly visualization: the component in its colour on the property's scale.
      if (state.asmVizColours?.has(c.id) && state.asmVizFor === asm.id) { spec.color = state.asmVizColours.get(c.id); delete spec.colors; delete spec.renderColors; }
      if (light && !spec.colors) Object.assign(spec, { mesh: lightMesh(entry), edges: null, geometryKey: `light:${entryUid(entry)}` });
      list.push(spec);
    }
  }
  state.largeAssembly = light ? { instances: instanceCount(asm), hidden } : null;
  viewport.setBodies(list);
  viewport.setPreview(null);
  viewport.setPlanes(Object.entries(STD_PLANES).map(([id, f]) => ({ id, frame: makeFrame(f), size: 120, visible: state.selection.some((s) => s.key === `plane:${id}`) || (state.settings.showPlanes && !list.length) })));
  viewport.groups.origin.visible = state.settings.showOrigin;
  viewport.setLines('markers', [...explodeLineSpecs(asm), ...componentSketchLines(asm)]);
  decalTools.show();
}

/**
 * Sketches of the components in the assembly view, placed with them: a layout part's sketches (its blocks), and
 * the sketches of a part that has no solid yet (a part made from a block) or that no feature uses (when sketches
 * are shown). Layout lines are drawn in the layout colour, the others like part sketches.
 */
function componentSketchLines(asm) {
  const out = [];
  for (const c of asm.components) {
    if (c.hidden || c.suppressed || state.viewHidden?.has(c.id)) continue;
    const placed = displayPlacement(asm, c);
    for (const leaf of componentLeaves(c)) {
      const part = project().parts.find((p) => p.id === leaf.part);
      if (!part) continue;
      let entry; try { entry = buildPart(part); } catch { continue; }
      const noSolid = !entry.mesh;
      if (!part.isLayout && !noSolid && !state.settings.showSketches) continue;
      const used = new Set(part.features.map((f) => f.sketch).filter(Boolean));
      const where = leaf.path.length ? composePlacement(placed, leaf.placement) : placed;
      for (const f of part.features) {
        if (f.type !== 'sketch' || f.suppressed) continue;
        if (!part.isLayout && !noSolid && used.has(f.id)) continue;
        const r = entry.result.results.get(f.id);
        if (!r?.frame) continue;
        const fr = { origin: placePoint(where, r.frame.origin), xDir: placeDir(where, r.frame.xDir), yDir: placeDir(where, r.frame.yDir), normal: placeDir(where, r.frame.normal) };
        out.push(...sketchLines(f, fr, part.isLayout ? '#c2410c' : '#3f78c9'));
      }
    }
  }
  return out;
}

function componentMatrix(c) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(...c.position), new THREE.Quaternion(...c.rotation), new THREE.Vector3(1, 1, 1));
  return m;
}

/** A cam's outline (points in its component's frame) from the flat face picked as the cam. */
function camProfile(ref) {
  if (!ref?.sig) return [];
  const asm = activeAssembly();
  const comp = asm?.components.find((c) => c.id === ref.comp);
  if (!comp) return [];
  const leaf = ref.path?.length ? subassemblyLeaf(comp, ref.path) : null;
  const part = project().parts.find((p) => p.id === (leaf ? leaf.part : comp.part));
  const face = part && buildPart(part).faces?.find((f) => matchesSig(f, ref.sig));
  if (!face) return [];
  const pts = [];
  // The outline edges in order, each sampled (the last point of an edge is the next one's first).
  const wire = face.clone().outerWire();
  for (const edge of wire.edges) for (let i = 0; i < 16; i++) { const v = edge.pointAt(i / 16); pts.push([v.x, v.y, v.z]); }
  return leaf ? pts.map((q) => placePoint(leaf.placement, q)) : pts;
}

/** Positions the assembly's free components by its mates. */
/**
 * Solves an assembly's mates, with the components inside its flexible sub-assemblies as unknowns of their own
 * (flex-sub.js); their places are kept on the sub-assembly components. Same result as solveMates.
 */
function solveWithFlex(asm, opts = {}) {
  const ex = expandFlexible(asm, project());
  if (!ex) return solveMates(asm, { entity: (ref) => mateEntityNow(ref, asm), size: assemblySize(asm), ...opts });
  const r = solveMates(ex.assembly, { entity: ex.entity((ref, inside) => mateEntityNow(ref, inside ?? asm)), size: assemblySize(asm), ...opts });
  ex.writeBack();
  return { ...r, status: ex.status(r.status) };
}

/** A motion study's input: the assembly expanded with its flexible sub-assemblies (or itself) and the entity function. */
function motionInput(asm) {
  const ex = expandFlexible(asm, project());
  return ex ? { assembly: ex.assembly, entity: ex.entity((ref, inside) => mateEntityNow(ref, inside ?? asm)) } : { assembly: asm, entity: (ref) => mateEntityNow(ref, asm) };
}

function solveAssembly() {
  const asm = activeAssembly();
  if (!asm || !kernelReady()) return;
  const r = solveWithFlex(asm);
  state.mateStatus = r.status;
  state.failedMates = new Set(r.failed);
  more.afterSolve(asm);
}

function assemblySize(asm) {
  let size = 100;
  for (const c of asm.components) for (const leaf of componentLeaves(c)) { const part = project().parts.find((p) => p.id === leaf.part); if (part) size = Math.max(size, buildPart(part).size ?? 0); }
  return size;
}

/** A mate reference read again from the current part (the part may have changed since the mate was made). */
function mateEntityNow(ref, inAsm = null) {
  const asm = inAsm?.components?.some((c) => c.id === ref.comp) ? inAsm : project()?.assemblies.find((a) => a.components.some((c) => c.id === ref.comp));
  const comp = asm?.components.find((c) => c.id === ref.comp);
  if (!comp) return null;
  const leaf = ref.path?.length ? subassemblyLeaf(comp, ref.path) : null;
  const part = project().parts.find((p) => p.id === (leaf ? leaf.part : comp.part));
  // A sub-assembly referred to as a whole (no path: a face of it in its own frame, as stored) — the entity as stored.
  if (!part) return comp.sub && !ref.path?.length ? ref : null;
  if (ref.conn) {
    const cp = connectionPointsOf(part.id).find((x) => x.name === ref.conn);
    if (cp) { const ent = { ...ref, point: cp.point, dir: cp.dir }; if (leaf) { ent.point = placePoint(leaf.placement, ent.point); ent.dir = placeDir(leaf.placement, ent.dir); } return ent; }
    return ref;
  }
  if (ref.sig) {
    // A face made by an assembly cut lives only on the cut body; the part's own faces are found on either.
    const cut = componentCut(comp, leaf);
    const entry = buildPart(part);
    const face = cut?.faces?.find((f) => matchesSig(f, ref.sig)) ?? entry.faces?.find((f) => matchesSig(f, ref.sig));
    if (face) {
      try {
        const ent = { comp: ref.comp, ...mateEntityOfFace(face, faceSignature) };
        if (leaf) { ent.point = placePoint(leaf.placement, ent.point); ent.dir = placeDir(leaf.placement, ent.dir); ent.path = ref.path; }
        return ent;
      } catch { /* fall back */ }
    }
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

function select(items, { add = false } = {}) { const r = recorder.around('select', [items, add ? { add: true } : null], () => selectImpl(items, { add })); emitMacro('selection', structuredClone(state.selection)); return r; }
function selectImpl(items, { add = false } = {}) {
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
  if (String(hit.bodyKey).startsWith('ctx:')) return icTools.contextTopo(hit);
  if (hit.bodyKey === 'body') {
    const entry = state.partEntry;
    return { entry, part: activePart(), comp: null, shape: hit.kind === 'face' ? entry?.faces?.[hit.index] : entry?.edgeList?.[hit.index] };
  }
  const [compId, ...path] = String(hit.bodyKey).replace(/^comp:/, '').split('/');
  const comp = activeAssembly()?.components.find((c) => c.id === compId);
  if (!comp) return null;
  // A part inside a sub-assembly: its placement in the top component (mates are made in that frame).
  const leaf = path.length ? subassemblyLeaf(comp, path) : null;
  const part = project().parts.find((p) => p.id === (leaf ? leaf.part : comp.part));
  if (!part) return null;
  // Cut by assembly features: the view shows the cut body, so its faces are the ones picked.
  const entry = componentCut(comp, leaf) ?? (leaf ? buildPart(part) : componentBuild(comp, part));
  return { entry, part, comp, inner: leaf?.placement ?? null, path, shape: hit.kind === 'face' ? entry.faces?.[hit.index] : entry.edgeList?.[hit.index] };
}

function itemOfHit(hit) {
  if (!hit) return null;
  if (hit.kind === 'plane') {
    const f = activePart()?.features.find((x) => x.id === hit.id);
    return f ? { kind: 'feat', id: f.id, key: `feat:${f.id}` } : { kind: 'plane', id: hit.id, key: `plane:${hit.id}` };
  }
  if (hit.kind === 'face' || hit.kind === 'edge') {
    if (activeAssembly() && !state.editing) {
      const compId = String(hit.bodyKey).replace(/^comp:/, '').split('/')[0];
      return { kind: 'comp', id: compId, key: `comp:${compId}` };
    }
    return { kind: hit.kind, bodyKey: hit.bodyKey, index: hit.index, key: hitKey(hit) };
  }
  return null;
}

function onViewportPick(hit, e) { return recorder.around('pick', [hit, e && (e.ctrlKey || e.shiftKey || e.metaKey) ? { ctrlKey: Boolean(e.ctrlKey), shiftKey: Boolean(e.shiftKey), metaKey: Boolean(e.metaKey) } : null], () => onViewportPickImpl(hit, e)); }
function onViewportPickImpl(hit, e) {
  const ed = state.editing;
  if (ed?.mode === 'sketchPlane') return pickSketchPlane(hit);
  if (ed?.mode === 'feature' && ed.pick) return pickForFeature(hit, e);
  if (ed?.mode === 'mate') return pickForMate(hit);
  if (ed?.mode === 'measure') return pickForMeasure(hit, e);
  if (ed?.mode === 'simulation') return pickForSimulation(hit);
  if (ed?.mode === 'motion') return pickForMotion(hit);
  if (more.owns(ed)) return more.pick(hit, e);
  if (std.owns(ed)) return std.pick(hit, e);
  const item = itemOfHit(hit);
  if (!item) { if (!e.ctrlKey && !e.shiftKey) clearSelection(); return undefined; }
  select([item], { add: e.ctrlKey || e.shiftKey || e.metaKey });
  return undefined;
}

function onViewportDoubleClick(hit) {
  if (state.editing) return;
  if (activeAssembly() && hit && hit.kind !== 'plane') {
    const compId = String(hit.bodyKey ?? '').replace(/^comp:/, '').split('/')[0];
    const comp = activeAssembly().components.find((c) => c.id === compId);
    if (comp?.sub) switchDocument({ kind: 'assembly', id: comp.sub });
    else if (comp) { switchDocument({ kind: 'part', id: comp.part }); notify('info', t('notice.openedPart')); }
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

/** Starts a new feature of `type` from the current selection (pre-selection). */
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
    params.seeds = sel.filter((s) => s.kind === 'feat').map((s) => part.features.find((f) => f.id === s.id)).filter((f) => f && TOOL_FEATURES.includes(f.type)).map((f) => f.id);
    if (!params.seeds.length) {
      const usable = part.features.slice(0, part.rollback ?? part.features.length);
      const last = [...usable].reverse().find((f) => TOOL_FEATURES.includes(f.type) && usable.indexOf(f) !== usable.findIndex((x) => ['extrude', 'revolve'].includes(x.type)));
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
  if (PART_MORE_TYPES.includes(type)) {
    // Body tools, reference geometry, fillet variants, patterns, curves: their first values come from the selection.
    const picked = {
      faces: sel.filter((s) => s.kind === 'face').map((s) => topoOf(s)?.shape).filter(Boolean).map(faceSignature),
      edges: sel.filter((s) => s.kind === 'edge').map((s) => topoOf(s)?.shape).filter(Boolean).map(edgeSignature),
      features: sel.filter((s) => s.kind === 'feat').map((s) => part.features.find((f) => f.id === s.id)).filter(Boolean),
    };
    const start = partMoreParams(type, part, picked, featuresBefore(part, null));
    if (start.notice) { notify('info', t(start.notice)); return undefined; }
    return beginFeature(createFeature(part, type, start.params), { pick: start.pick });
  }
  return startAdvanced(type, part);
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
  std.cleanup(e);
  if (walkTools.owns(e)) walkTools.cancel(e);
  if (frameTools.owns(e)) { state.editing = null; frameTools.cleanup(); }
  if (customTools.owns(e)) customTools.cancel(e);
  if (e.mode === 'sketch') { e.editor.dispose(); viewport?.setLines('sketch', []); viewport?.setLabels([]); }
  if (e.mode === 'mate' && e.base && activeAssembly()) activeAssembly().components = JSON.parse(e.base);
  // An illustration view's display (exploded placements, hidden components) ends with its page.
  if (e.mode === 'illustration') { state.motionPose = null; state.viewHidden = null; }
  if (e.mode === 'schematic') schTools.cleanup();
  if (e.mode === 'markup') mkTools.cleanup();
  if (e.mode === 'electronics') elTools.cleanup();
  if (e.mode === 'freeSurface') fsTools.cleanup();
  state.editing = null;
  state.previewResult = null;
  state.mateError = false;
  state.leftTab = 'tree';
  if (!quiet) notify('info', t('notice.cancelled'));
  syncView();
  renderAll();
}

/** OK in the PropertyManager. */
function acceptEditing() { return recorder.around('accept', [], () => acceptEditingImpl()); }
function acceptEditingImpl() {
  const e = state.editing;
  if (!e) return undefined;
  if (e.mode === 'sketch') return exitSketch();
  if (e.mode === 'mate') return acceptMate();
  if (more.owns(e)) return more.accept();
  if (std.owns(e)) return std.accept();
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
  if (['startFace', 'endFace', 'endFace2'].includes(e.pick) && (hit?.kind === 'plane' || (hit?.kind === 'face' && topo?.shape))) {
    // An extrude's start / end surface: a face of the body or a plane.
    const ref = hit.kind === 'plane' ? planeRefOf(hit.id) : { kind: 'face', sig: faceSignature(topo.shape) };
    updateFeature(() => { f[e.pick] = ref; });
  } else if (['startVertex', 'endVertex', 'endVertex2'].includes(e.pick) && (hit?.kind === 'face' || hit?.kind === 'edge') && topo?.shape && hit.point) {
    // A vertex: the one of the picked face or edge nearest the pointer.
    const v = nearestVertex(topo.shape, hit.point);
    if (v) updateFeature(() => { f[e.pick] = v.map(round3); });
  } else if ((e.pick === 'faceA' || e.pick === 'faceB') && hit?.kind === 'face' && topo?.shape) {
    // Face-face chamfer: the two faces.
    updateFeature(() => { f[e.pick] = faceSignature(topo.shape); });
    e.pick = e.pick === 'faceA' && !f.faceB ? 'faceB' : e.pick;
  } else if (e.pick === 'faceItems' && hit?.kind === 'face' && topo?.shape) {
    const sig = faceSignature(topo.shape);
    updateFeature(() => { f.faceItems = f.faceItems ?? []; toggle(f.faceItems, sig, (x) => near(x.center, sig.center)); });
  } else if (f.type === 'surfaceSpline' && hit?.kind === 'face' && topo?.shape && hit.point) {
    // Spline on Surface: the first click (or a click on another face) takes the face; clicks on it add points.
    const sig = faceSignature(topo.shape);
    const same = f.face && Math.hypot(...f.face.center.map((v, i) => v - sig.center[i])) < 1e-6;
    updateFeature(() => { if (!same) { f.face = sig; f.points = []; } f.points = [...(f.points ?? []), hit.point.map(round3)]; });
  } else if (e.pick === 'featureItems') {
    const fid = featureOfHit(hit);
    if (fid) updateFeature(() => { const list = f.featureItems ?? []; f.featureItems = list.includes(fid) ? list.filter((x) => x !== fid) : [...list, fid]; });
    else notify('info', t('notice.pickSeedInTree'));
  } else if (e.pick === 'sbVertex' && (hit?.kind === 'face' || hit?.kind === 'edge') && topo?.shape && hit.point) {
    // A fillet setback corner: the vertex nearest the click, with a setback of 2.5 radii along each edge to start.
    const v = nearestVertex(topo.shape, hit.point);
    const d = Math.round((Number(f.radius) || 2) * 2.5 * 1000) / 1000;
    if (v) updateFeature(() => { f.setbacks = [...(f.setbacks ?? []), { vertex: v.map(round3), d: [d, d, d] }]; });
  } else if (e.pick === 'vertex' && (hit?.kind === 'face' || hit?.kind === 'edge') && topo?.shape && hit.point) {
    const v = nearestVertex(topo.shape, hit.point);
    if (v) updateFeature(() => { f.vertex = v.map(round3); });
  } else if (e.pick === 'multiFaces' && hit?.kind === 'face' && topo?.shape) {
    if (topo.shape.geomType !== 'PLANE') { notify('info', t('notice.pickPlanarFace')); return; }
    const sig = faceSignature(topo.shape);
    updateFeature(() => { const list = f.multi ?? []; const i = list.findIndex((x) => near(x.sig.center, sig.center)); f.multi = i >= 0 ? list.filter((_, k) => k !== i) : [...list, { sig, t: Number(f.thickness) * 2 || 3 }]; });
  } else if (f.type === 'plane' && e.pick === 'axisRef' && hit?.kind === 'edge' && topo?.shape) {
    updateFeature(() => { f.axisRef = { kind: 'edge', sig: edgeSignature(topo.shape) }; });
  } else if (f.type === 'plane' && e.pick === 'points' && (hit?.kind === 'face' || hit?.kind === 'edge') && topo?.shape && hit.point) {
    const v = nearestVertex(topo.shape, hit.point);
    if (v) updateFeature(() => { f.points = [...(f.points ?? []), v.map(round3)].slice(-3); });
  } else if (f.type === 'plane' && e.pick === 'point' && (hit?.kind === 'face' || hit?.kind === 'edge') && topo?.shape && hit.point) {
    const p = f.mode === 'tangent' ? hit.point : nearestVertex(topo.shape, hit.point);
    if (p) updateFeature(() => { f.point = p.map(round3); });
  } else if (f.type === 'plane' && e.pick === 'base2' && (hit?.kind === 'plane' || (hit?.kind === 'face' && topo?.shape?.geomType === 'PLANE'))) {
    const ref = hit.kind === 'plane' ? planeRefOf(hit.id) : faceRef(topo.shape);
    updateFeature(() => { f.base2 = ref; });
  } else if (e.pick === 'upToPoint' && (hit?.kind === 'face' || hit?.kind === 'edge') && topo?.shape && hit.point) {
    const v = nearestVertex(topo.shape, hit.point);
    if (v) updateFeature(() => { f.upToPoint = v.map(round3); });
  } else if (e.pick === 'partingEdges' && hit?.kind === 'edge' && topo?.shape) {
    const sig = edgeSignature(topo.shape);
    updateFeature(() => { f.partingEdges = f.partingEdges ?? []; toggle(f.partingEdges, sig, (x) => near(x.mid, sig.mid)); });
  } else if (e.pick === 'pullEdge' && hit?.kind === 'edge' && topo?.shape) {
    updateFeature(() => { f.pull = { kind: 'edge', sig: edgeSignature(topo.shape) }; });
  } else if (e.pick === 'dirVector' && hit?.kind === 'edge' && topo?.shape) {
    updateFeature(() => { f.dirVector = { kind: 'edge', sig: edgeSignature(topo.shape) }; });
  } else if (e.pick === 'edges' && hit?.kind === 'edge' && topo?.shape) {
    const sig = edgeSignature(topo.shape);
    updateFeature(() => toggle(f.edges, sig, (x) => near(x.mid, sig.mid)));
  } else if (e.pick === 'edges' && hit?.kind === 'face' && topo?.shape) {
    // A face: all of its edges (picking a face fillets its edges).
    updateFeature(() => { for (const edge of topo.shape.edges) { const sig = edgeSignature(edge); if (!f.edges.some((x) => near(x.mid, sig.mid))) f.edges.push(sig); } });
  } else if (e.pick === 'toolFaces' && hit?.kind === 'face' && topo?.shape) {
    const sig = faceSignature(topo.shape);
    updateFeature(() => { f.toolFaces ??= []; toggle(f.toolFaces, sig, (x) => near(x.center, sig.center)); });
  } else if (e.pick === 'faces' && hit?.kind === 'face' && topo?.shape) {
    const sig = faceSignature(topo.shape);
    if (f.type === 'dome') { if (sig.type !== 'PLANE') { notify('info', t('notice.pickPlanarFace')); return; } updateFeature(() => { f.faces = [sig]; }); return; }
    updateFeature(() => toggle(f.faces, sig, (x) => near(x.center, sig.center)));
  } else if (e.pick === 'points3d') {
    // A point where the pointer meets the chosen standard plane through the last point (Tab-like plane switch in the PropertyManager).
    const last = f.points?.at(-1) ?? [0, 0, 0];
    const fr = makeFrame(STD_PLANES[e.drawPlane ?? 'top']);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...fr.normal), new THREE.Vector3(...last));
    const p = viewport.rayAt(ev.clientX, ev.clientY).ray.intersectPlane(plane, new THREE.Vector3());
    if (!p) return;
    const q = p.toArray().map(round3);
    updateFeature((g) => { g.points = [...(g.points ?? []), q]; solveRelations3d(g); });
  } else if (e.pick === 'edge' && hit?.kind === 'edge' && topo?.shape) {
    updateFeature(() => { f.edge = edgeSignature(topo.shape); });
  } else if (e.pick === 'face' && hit?.kind === 'face' && topo?.shape) {
    updateFeature(() => { f.face = faceSignature(topo.shape); });
  } else if (e.pick === 'neutral' && (hit?.kind === 'plane' || (hit?.kind === 'face' && topo?.shape?.geomType === 'PLANE'))) {
    const ref = hit.kind === 'plane' ? planeRefOf(hit.id) : faceRef(topo.shape);
    updateFeature((g, ed) => { g.neutral = ref; ed.pick = 'faces'; });
  } else if (e.pick === 'holePoints') {
    if (!e.holeSketch.plane) {
      if (hit?.kind === 'face' && topo?.shape?.geomType === 'PLANE') e.holeSketch.plane = faceRef(topo.shape);
      else if (hit?.kind === 'plane') e.holeSketch.plane = planeRefOf(hit.id);
      else { notify('info', t('notice.pickPlanarFace')); return; }
    }
    // Where the pointer meets the face's plane, in the plane's coordinates.
    const main = buildPart(part);
    let fr;
    try { fr = resolvePlane(e.holeSketch.plane, { body: main.body, planes: main.result.planes, part }); } catch { notify('error', t('rebuild.face-missing')); return; }
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
  const candidates = part.features.filter((f) => TOOL_FEATURES.includes(f.type) && entry.result.results.get(f.id)?.tool).reverse();
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
  if (topo?.ctxComp) return icTools.sketchOnContextFace(topo);
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
  try { fr = resolvePlane(sketch.plane, { body: before.body, planes: before.result.planes, part }); }
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
  askText: async (value = '') => { const r = await popups.open('prompt', { title: t('sketch.tool.text'), label: t('ann.text'), value }); return r?.value ?? null; },
  askValue: async ({ type, value, edit = false, expr = null }) => {
    if (!state.settings.editDimOnCreate && !edit) return value;
    const angle = type === 'angle';
    const shown = expr ? `=${expr}` : angle ? fmt(value) : fmt(value / UNIT_FACTOR[units()]);
    const result = await popups.open('prompt', { title: t('dim.modify'), label: `${t(`dim.${type}`)} (${angle ? '°' : units()}) — ${t('dim.equationHint')}`, value: shown });
    if (result?.value == null) return null;
    if (String(result.value).trim().startsWith('=')) {
      const text = String(result.value).trim().slice(1).trim();
      try { const v = dimensionExpression(null, {}, text); return { value: v, expr: text }; } catch (error) { notify('error', t('notice.badEquation', { text, code: t(`expr.${error.code ?? 'syntax'}`, null, error.code ?? '') })); return null; }
    }
    const v = parseLen(result.value, angle ? 'angle' : 'length');
    if (v == null || (!angle && v <= 0)) { notify('error', t('notice.invalidValue', { text: result.value })); return null; }
    return v;
  },
};

function exitSketch() { return recorder.around('exitSketch', [], () => exitSketchImpl()); }
function exitSketchImpl() {
  const e = state.editing;
  if (e?.mode !== 'sketch') return;
  const part = activePart();
  const sketch = e.editor.sketch;
  recorder.note('setSketch', [{ entities: sketch.entities, constraints: sketch.constraints }], { before: true });
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
  autoMateByReferences(asm, c);
  notify('success', t(first ? 'notice.componentFixed' : 'notice.componentInserted', { name: c.name }));
  fitView();
}

/** The mate references of a part (its Mate Reference features): [{ name, refs }]. */
function mateReferencesOf(partId) {
  const part = project().parts.find((p) => p.id === partId);
  if (!part) return [];
  let entry; try { entry = buildPart(part); } catch { return []; }
  return part.features.filter((f) => f.type === 'mateReference' && !f.suppressed).map((f) => entry.result?.results?.get(f.id)?.mateRef).filter(Boolean);
}

/** The connection points of a part (its Connection Point features): [{ name, point, dir }] in the part. */
function connectionPointsOf(partId) {
  const part = project().parts.find((p) => p.id === partId);
  if (!part) return [];
  let entry; try { entry = buildPart(part); } catch { return []; }
  return part.features.filter((f) => f.type === 'connectionPoint' && !f.suppressed).map((f) => entry.result?.results?.get(f.id)?.connPoint).filter(Boolean);
}

/**
 * Magnetic mates: connection points of components that are near each other (within the snap distance in the
 * settings) and face each other snap together — a magnetic mate each. Returns how many were made.
 */
function magneticSnap({ quiet = false } = {}) {
  const asm = activeAssembly();
  if (!asm) return 0;
  const world = [];
  for (const c of asm.components) {
    if (c.suppressed || c.hidden || !c.part) continue;
    for (const cp of connectionPointsOf(c.part)) world.push({ comp: c.id, name: cp.name, local: cp, point: placePoint(c, cp.point), dir: placeDir(c, cp.dir) });
  }
  const joined = new Set(asm.mates.filter((m) => m.type === 'magnetic').map((m) => `${m.a.comp}:${m.a.conn}|${m.b.comp}:${m.b.conn}`));
  const pairs = magneticPairs(world, { distance: Math.max(0, Number(state.settings.magneticDistance ?? 25)), joined });
  if (!pairs.length) { if (!quiet) notify('info', t('magnet.none')); return 0; }
  change('op.addMate', () => {
    for (const p of pairs) {
      // The component that is not fixed moves (b); a fixed one stays.
      const [a, b] = asm.components.find((c) => c.id === p.a.comp)?.fixed ? [p.a, p.b] : [p.b, p.a];
      const n = asm.mates.filter((x) => x.type === 'magnetic').length + 1;
      asm.mates.push({ id: newId('mate'), name: `${t('mate.magnetic')}${n}`, type: 'magnetic',
        a: { comp: a.comp, kind: 'point', conn: a.name, point: a.local.point, dir: a.local.dir },
        b: { comp: b.comp, kind: 'point', conn: b.name, point: b.local.point, dir: b.local.dir } });
    }
  });
  solveAssembly();
  notify('success', t('magnet.snapped', { count: pairs.length }));
  renderAll();
  return pairs.length;
}

/** A new component with a mate reference is mated to the first other one whose part has one of the same name. */
function autoMateByReferences(asm, c) {
  const mine = mateReferencesOf(c.part);
  if (!mine.length) return;
  for (const other of asm.components) {
    if (other.id === c.id || !other.part) continue;
    const made = mateRefMates(mine, mateReferencesOf(other.part), c.id, other.id);
    if (!made.length) continue;
    change('op.addMate', () => {
      for (const m of made) {
        const n = asm.mates.filter((x) => x.type === m.type).length + 1;
        asm.mates.push({ id: newId('mate'), name: `${t(`mate.${m.type}`)}${n}`, ...m });
      }
    });
    notify('success', t('notice.mateRefMated', { count: made.length, name: other.name }));
    return;
  }
}

/** Save Bodies: every body of the active part becomes a part of its own (linked: it inserts that body), and an assembly of them. */
function saveBodies() {
  const part = activePart();
  if (!part) return;
  const body = buildPart(part).body;
  const R = rep(); const oc = R.getOC(); let n = 0;
  if (body) { const ex = new oc.TopExp_Explorer(body.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); for (; ex.More(); ex.Next()) n++; ex.delete(); }
  if (n < 2) { notify('info', t('notice.needBodies')); return; }
  const made = [];
  const asmId = newId('asm');
  change('op.saveBodies', (pr) => {
    for (let i = 0; i < n; i++) {
      const id = newId('part');
      const p = { id, name: `${part.name}-${t('pm.body')}${i + 1}`, material: part.material, features: [{ ...createFeature({ features: [] }, 'insertPart', { part: part.id, body: i }), id: `${id}-ins`, name: t('feature.insertPart') }] };
      pr.parts.push(p); made.push(p);
    }
    // Every body stays where it is in the part: the instances are all fixed at the origin.
    pr.assemblies.push({ id: asmId, name: `${part.name} (${t('cmd.saveBodies')})`, components: made.map((p, i) => ({ id: newId('cmp'), part: p.id, name: `${p.name}<1>`, position: [0, 0, 0], rotation: quatIdentity(), fixed: true })), mates: [] });
  });
  notify('success', t('notice.bodiesSaved', { count: n }));
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

/** An edge's sample points in its part (a line: its ends; a curve: 48 pieces). */
function edgePoints(edge) {
  const n = edge.geomType === 'LINE' ? 1 : 48;
  const out = [];
  for (let i = 0; i <= n; i++) { const v = edge.pointAt(i / n); out.push([v.x, v.y, v.z]); }
  return out;
}

/**
 * An edge picked while making a mate: the first reference becomes the edge's end nearest the click (a point);
 * the second (or more edges of that component) makes or extends a path — a path mate.
 */
function pickEdgeForMate(hit, topo) {
  const e = state.editing;
  const toTop = (q) => (topo.inner ? placePoint(topo.inner, q) : q);
  const pts = edgePoints(topo.shape).map(toTop);
  const extend = e.mate.b?.kind === 'path' && e.mate.b.comp === topo.comp.id && (e.pick == null || e.pick === 'b');
  if (!extend && (e.pick === 'a' || !e.mate.a)) {
    // The vertex nearest the click, in the component's frame (the click point is in the world).
    const asm = activeAssembly();
    const pl = asm.components.find((c) => c.id === topo.comp.id);
    const ends = [pts[0], pts[pts.length - 1]];
    const world = ends.map((q) => placePoint(pl, q));
    const k = hit.point && Math.hypot(...world[1].map((v, i) => v - hit.point[i])) < Math.hypot(...world[0].map((v, i) => v - hit.point[i])) ? 1 : 0;
    e.mate.a = { comp: topo.comp.id, kind: 'point', point: ends[k], dir: [0, 0, 1] };
    e.pick = 'b';
    previewMate();
    return;
  }
  if (!extend && topo.comp.id === e.mate.a?.comp) { notify('info', t('notice.sameComponent')); return; }
  const pieces = extend ? [...(e.mate.b.pieces ?? []), pts] : [pts];
  const path = chainPath(pieces);
  e.mate.b = { comp: topo.comp.id, kind: 'path', point: path[0], dir: [0, 0, 1], points: path, pieces };
  e.mate.type = 'path';
  e.mateGroup = 'advanced';
  Object.assign(e.mate, Object.fromEntries(Object.entries(MATE_DEFAULTS.path).filter(([k]) => e.mate[k] == null)));
  e.pick = null;
  previewMate();
}

function pickForMate(hit) {
  const e = state.editing;
  const topo = topoOf(hit);
  if (hit?.kind === 'edge' && topo?.comp && topo.shape) return pickEdgeForMate(hit, topo);
  if (hit?.kind !== 'face' || !topo?.comp) { notify('info', t('notice.pickComponentFace')); return; }
  const ent = { comp: topo.comp.id, ...mateEntityOfFace(topo.shape, faceSignature) };
  // A face of a part inside a sub-assembly: in the top component's frame, re-read through its path.
  if (topo.inner) { ent.point = placePoint(topo.inner, ent.point); ent.dir = placeDir(topo.inner, ent.dir); ent.path = topo.path; }
  if (e.pick === 'c' || e.pick === 'd') { e.mate[e.pick] = ent; e.pick = e.pick === 'c' && MATE_REFS[e.mate.type]?.d ? 'd' : null; previewMate(); return; }
  if (e.pick === 'a' || !e.mate.a) { e.mate.a = ent; e.pick = 'b'; }
  else {
    if (ent.comp === e.mate.a.comp) { notify('info', t('notice.sameComponent')); return; }
    e.mate.b = ent; e.pick = MATE_REFS[e.mate.type]?.c ? 'c' : null;
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
    const r = solveWithFlex(trial);
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
  const need = MATE_REFS[e.mate.type] ?? {};
  if ((need.c && !e.mate.c) || (need.d && !e.mate.d)) { notify('error', t('notice.mateIncomplete')); return; }
  const count = asm.mates.filter((m) => m.type === e.mate.type).length + 1;
  const mate = { ...e.mate, name: e.mate.name || `${t(`mate.${e.mate.type}`)}${count}` };
  try { captureMate(asm, mate); } catch { /* a mate that measures from nothing */ }
  state.editing = null;
  state.leftTab = 'tree';
  change('op.addMate', () => { asm.mates = [...asm.mates.filter((m) => m.id !== mate.id), mate]; });
  const failed = state.failedMates.has(mate.id);
  notify(failed ? 'warning' : 'success', t(failed ? 'notice.mateFailed' : 'notice.mateAdded', { name: mate.name }));
}

/** Makes the chosen sub-assembly components flexible (their parts solved in this assembly) or rigid again. */
function toggleFlexible() {
  const asm = activeAssembly();
  const ids = state.selection.filter((s) => s.kind === 'comp').map((s) => s.id);
  const subs = asm?.components.filter((c) => ids.includes(c.id) && c.sub) ?? [];
  if (!subs.length) { notify('info', t('flex.pickSub')); return; }
  const on = !subs.every((c) => c.flexible);
  change(on ? 'op.flexible' : 'op.rigid', () => { for (const c of subs) { if (on) c.flexible = true; else { delete c.flexible; delete c.flexPose; } } });
  solveAssembly();
  notify('success', t(on ? 'flex.on' : 'flex.off', { count: subs.length }));
  renderAll();
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
  const list = await busy('progress.interference', asm.name, () => interferences(asm, (c) => { const list2 = componentShapes(c).map((x) => x.shape); return list2.length > 1 ? R.makeCompound(list2) : list2[0] ?? null; }, (s) => R.measureVolume(s)));
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
    // Envelopes are references: not part of the assembly's mass.
    for (const { shape, part: p } of asm.components.filter((c) => !c.envelope).flatMap((c) => componentShapes(c))) {
      const vp = R.measureShapeVolumeProperties(shape);
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
    // The front plane (XZ) through the middle: the half toward the front viewer (−Y) is taken away.
    state.section = { normal: [0, -1, 0], offset: -c.y };
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
      asm.mates = asm.mates.filter((m) => !mates.includes(m.id) && !comps.some((id) => mateTouches(m, id)));
      if (asm.motion) asm.motion.motors = (asm.motion.motors ?? []).filter((x) => !comps.includes(x.comp));
      if (asm.explode) asm.explode.steps = (asm.explode.steps ?? []).map((st) => ({ ...st, comps: st.comps.filter((id) => !comps.includes(id)) })).filter((st) => st.comps.length);
    });
    return;
  }
  const drw = activeDrawing();
  if (drw && state.drawingSelected) { const id = state.drawingSelected; state.drawingSelected = null; change('op.delete', () => { drw.views = drw.views.filter((v) => v.id !== id && v.parent !== id); drw.annotations = (drw.annotations ?? []).filter((a) => a.id !== id); }); }
}

function setSuppressed(value) {
  const part = activePart();
  const ids = state.selection.filter((s) => s.kind === 'feat').map((s) => s.id);
  if (!part || !ids.length) return;
  const all = new Set(ids);
  if (value) for (const id of ids) for (const d of allDependents(part, id)) all.add(d);
  // With a configuration active, suppression is that configuration's own ("This configuration").
  if (activeConfiguration(part)) { change(value ? 'op.suppress' : 'op.unsuppress', () => { for (const id of all) setSuppressedIn(part, id, value); }); return; }
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

async function newDrawing({ template = null } = {}) {
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
    // A template (or the default drawing template): the sheet, its settings and standard views.
    const tpl = template ?? customTools.api.defaultTemplate('drawing');
    if (tpl?.drawing) applyDrawingTemplate(d, tpl.drawing);
    pr.active = { kind: 'drawing', id: d.id };
  });
  fitDrawing();
  renderDrawing();
  notify('success', t('notice.drawingCreated', { name: d.name }));
}

/**
 * Relative view: two planar faces picked in a part — the view looks square at the first (it faces the viewer) with
 * the second facing right. Added to the part's latest drawing (a new one when it has none).
 */
async function relativeView() {
  const part = activePart();
  if (!part) { notify('info', t('notice.partOnly')); return; }
  const faces = state.selection.filter((s) => s.kind === 'face').map((s) => topoOf(s)?.shape).filter(Boolean);
  if (faces.length < 2 || faces.slice(0, 2).some((f) => f.geomType !== 'PLANE')) { notify('info', t('notice.relativeViewFaces')); return; }
  const normal = (f) => { const v = f.normalAt(); const a = v.toTuple ? v.toTuple() : [v.x, v.y, v.z]; const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
  const front = normal(faces[0]); const right = normal(faces[1]);
  if (Math.abs(front[0] * right[0] + front[1] * right[1] + front[2] * right[2]) > 0.999) { notify('info', t('notice.relativeViewParallel')); return; }
  let d = [...project().drawings].reverse().find((x) => x.source?.kind === 'part' && x.source.id === part.id);
  if (!d) { await newDrawing(); d = activeDrawing(); }
  if (!d) return;
  const view = { id: newId('v'), type: 'custom', dir: front, x: right, label: nextLetter(d) };
  change('op.addView', (pr) => { const dd = pr.drawings.find((x) => x.id === d.id); dd.views.push(view); pr.active = { kind: 'drawing', id: d.id }; });
  state.drawingSelected = view.id;
  fitDrawing(); renderDrawing();
  notify('success', t('notice.relativeView'));
}

/** 3D drawing view: the selected view turned by typed angles (left / right, up / down) into a custom view. */
async function turnDrawingView() {
  const d = activeDrawing();
  const v = d?.views.find((x) => x.id === state.drawingSelected && x.kind !== 'detail' && x.kind !== 'section');
  if (!v) { notify('info', t('notice.selectView')); return; }
  const r = await popups.open('prompt', { title: t('cmd.view3dDrawing'), label: t('drawing.turnAngles'), value: '30, 0' });
  const [yaw, pitch] = String(r?.value ?? '').split(/[,\s]+/).map(Number);
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return;
  const turned = turnedView(v, yaw, pitch);
  if (!turned) return;
  change('op.edit', (pr) => { const vv = pr.drawings.find((x) => x.id === d.id).views.find((x) => x.id === v.id); Object.assign(vv, turned); delete vv.up; });
  renderDrawing();
}

const projectionCache = new Map();
/** Hidden stretches of cosmetic threads per thread and view direction (drawing-threads.js occlusion). */
const threadOcclusion = new Map();
const occlusionOf = (key) => { if (!threadOcclusion.has(key)) { if (threadOcclusion.size > 20) threadOcclusion.clear(); threadOcclusion.set(key, new Map()); } return threadOcclusion.get(key); };

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
    for (const { shape, key: k } of componentShapes(c)) { shapes.push(shape); keys.push(k); }
  }
  return { key: keys.join('|'), shape: shapes.length ? R.makeCompound(shapes) : null };
}

/** The cosmetic threads of a drawing's model in its coordinates (an assembly: every placed part's). */
function drawingThreads(d) {
  const src = findDocument(project(), d.source);
  if (!src) return [];
  const fromPart = (part, pl) => {
    const out = [];
    for (const r of buildPart(part).result.results.values()) {
      for (const th of r.threads ?? (r.thread ? [r.thread] : [])) {
        if (th.modelled || (r.tool && !r.threads)) continue;
        out.push(pl ? { ...th, centre: placePoint(pl, th.centre), dir: placeDir(pl, th.dir) } : th);
      }
    }
    return out;
  };
  if (d.source.kind === 'part') return fromPart(src, null);
  const out = [];
  for (const c of src.components ?? []) {
    if (c.hidden) continue;
    for (const leaf of componentLeaves(c)) {
      const part = project().parts.find((p) => p.id === leaf.part);
      if (part) out.push(...fromPart(part, composePlacement(c, leaf.placement)));
    }
  }
  return out;
}

function drawingProjections(d) {
  const { key, shape } = drawingShape(d);
  const out = new Map();
  if (!shape) return out;
  for (const v of d.views) {
    if (v.kind === 'detail') continue;
    // A flat-pattern view projects the part laid flat (with its bend lines); others the model as it is.
    const flat = v.flat && d.source.kind === 'part' ? flatPatternOf(d) : null;
    const alt = v.alt && d.source.kind === 'assembly' ? alternateShapeOf(d, v.alt) : null;
    const k = `${flat ? flat.key : key}|${projectionKey(v)}${alt ? `|alt:${alt.key}` : ''}`;
    if (!projectionCache.has(k)) {
      let pr = projectView(flat?.shape ?? shape, v.type, v);
      if (flat) pr = { ...pr, bendLines: bendLinePaths(flat, v) };
      else if (d.source.kind === 'part') { const cross = crossBreakPaths(d, v); if (cross.length) pr = { ...pr, bendLines: { up: [], down: [], cross } }; }
      if (alt?.shape) { try { const ap = projectView(alt.shape, v.type, { ...v, kind: undefined }); pr = { ...pr, phantom: ap.visible }; } catch { /* no phantom */ } }
      projectionCache.set(k, pr);
    }
    out.set(v.id, projectionCache.get(k));
  }
  if (projectionCache.size > 80) projectionCache.clear();
  // Cosmetic threads drawn the standard way on the views (drawing-threads.js).
  const threads = drawingThreads(d);
  if (threads.length) for (const v of d.views) if (out.has(v.id)) out.set(v.id, withThreadMarks(out.get(v.id), v, threads, { shape, cache: occlusionOf(key) }));
  return more.adjust(d, out);
}

/** A sheet-metal part's flat pattern for a drawing: { key, shape, bends (flat), formed (bends as formed), sheet }. */
function flatPatternOf(d) {
  const src = findDocument(project(), d.source);
  if (!src) return null;
  const formed = buildPart(src);
  if (!formed.result?.sheet) return null;
  const entry = buildPart({ ...src, flat: true }, { slot: 'drwFlat' });
  if (!entry.body) return null;
  return { key: `flat:${entry.key}`, shape: entry.body, bends: entry.result?.sheet?.bends ?? [], formed: formed.result.sheet.bends ?? [], sheet: formed.result.sheet };
}

/** Bend lines of a flat view (path coordinates like the projection's): { up: [path], down: [path] }. */
function bendLinePaths(flat, v) {
  const b = viewBasis(v);
  if (!b) return { up: [], down: [] };
  const [lo, hi] = flat.shape.boundingBox.bounds;
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]]);
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const out = { up: [], down: [] };
  flat.bends.forEach((bend, i) => {
    const F = bend.frame;
    if (!F) return;
    // The bend runs along z: within its own extent and the flat blank's box.
    const zs = corners.map((c) => dot([c[0] - F.o[0], c[1] - F.o[1], c[2] - F.o[2]], F.z));
    const z0 = Math.max(F.zLo, Math.min(...zs)); const z1 = Math.min(F.zHi, Math.max(...zs));
    if (!(z1 > z0)) return;
    const A = bendToWorld(F, [bend.BA / 2, 0, z0]); const B = bendToWorld(F, [bend.BA / 2, 0, z1]);
    const path = `M ${dot(A, b.x)} ${-dot(A, b.y)} L ${dot(B, b.x)} ${-dot(B, b.y)}`;
    out[bendDirection(flat, i) === 'down' ? 'down' : 'up'].push(path);
  });
  return out;
}

/** The diagonals of the part's cross breaks in a view (path coordinates). */
function crossBreakPaths(d, v) {
  const src = findDocument(project(), d.source);
  const results = src && buildPart(src).result?.results;
  const b = viewBasis(v);
  if (!results || !b || v.kind === 'section') return [];
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const out = [];
  for (const f of src.features) {
    const cb = !f.suppressed && results.get(f.id)?.crossBreak;
    if (cb) for (const [A, B] of cb.lines) out.push(`M ${dot(A, b.x)} ${-dot(A, b.y)} L ${dot(B, b.x)} ${-dot(B, b.y)}`);
  }
  return out;
}

/** Up or down: the side a bend turns toward (as formed), against the sheet's normal. */
function bendDirection(flat, i) {
  const f = flat.formed[i]?.frame; const n = flat.sheet?.normal;
  if (!f || !n) return 'up';
  return f.y[0] * n[0] + f.y[1] * n[1] + f.y[2] * n[2] >= 0 ? 'up' : 'down';
}

/** The rows of a bend table for the drawing's part (number, direction, angle, inner radius, K, allowance). */
function bendTableRows(d) {
  const flat = flatPatternOf(d);
  if (!flat) return null;
  const k = flat.sheet.k ?? 0.44; const tk = flat.sheet.thickness ?? 0;
  return flat.formed.map((b, i) => {
    const angle = Number(b.theta ?? b.angle ?? 90); const radius = Number(b.r ?? b.radius ?? 0);
    const allowance = Number(b.BA ?? b.allowance ?? ((angle * Math.PI) / 180) * (radius + k * tk));
    // The K a table-driven bend amounts to (gauge / bend tables: cad/sheet-gauge.js).
    const kb = flat.sheet.rule != null && typeof flat.sheet.rule !== 'number' ? ruleK(flat.sheet.rule, angle, radius, tk) : k;
    return { no: i + 1, dir: t(bendDirection(flat, i) === 'down' ? 'drw.bendDown' : 'drw.bendUp'), angle, radius, k: Math.round(kb * 1000) / 1000, allowance };
  });
}

/** An assembly in another position (explode steps applied, or the motion study's end) as one shape. */
function alternateShapeOf(d, alt) {
  const asm = findDocument(project(), d.source);
  if (!asm?.components) return null;
  let placements = null;
  if (alt.mode === 'motion' && asm.motion && motionType(asm) === 'keyframe') placements = keyframePose(asm, Number(asm.motion.duration ?? 5));
  else if (alt.mode === 'motion' && asm.motion && motionType(asm) === 'physics') { try { const r = dynamicsResult(asm); placements = r?.frames?.at(-1)?.poses ?? null; } catch { placements = null; } }
  else if (alt.mode === 'motion' && asm.motion) {
    try { const mi = motionInput(asm); placements = motionFrame(mi.assembly, Number(asm.motion.duration ?? 5), { entity: mi.entity, size: assemblySize(asm) }).placements; } catch { placements = null; }
  }
  const R = rep(); const shapes = []; const keys = [];
  for (const c of asm.components) {
    if (c.hidden || c.suppressed) continue;
    const pl = alt.mode === 'motion' ? (placements?.get?.(c.id) ?? c) : explodedPlacement(asm, c, Number(alt.factor ?? 1), { centers: explodeCenters(asm) });
    for (const leaf of componentLeaves(c)) {
      const part = project().parts.find((p) => p.id === leaf.part);
      const b = part && buildPart(part);
      if (!b?.body) continue;
      const at = composePlacement(pl, leaf.placement);
      shapes.push(placeShape(b.body, at)); keys.push(`${b.key}|${JSON.stringify([at.position, at.rotation])}`);
    }
  }
  return { key: keys.join('|'), shape: shapes.length ? R.makeCompound(shapes) : null };
}

function drawingLabels() {
  const keys = ['view.front', 'view.back', 'view.top', 'view.bottom', 'view.left', 'view.right', 'view.iso', 'view.dimetric', 'view.custom', 'drawing.section', 'drawing.detail', 'drawing.view', 'bom.item', 'bom.partNo', 'bom.name', 'bom.description', 'bom.material', 'bom.qty', 'title.name', 'title.partNo', 'title.material', 'title.mass', 'title.scale', 'title.sheet', 'title.drawnBy', 'title.checkedBy', 'title.date', 'title.revision'];
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
  // Harness sheets follow their harness (app-std.js): rebuilt, or marked out of date.
  std.syncHarnessDrawings(d);
  std.syncPipeIsoDrawings?.(d);
  let svg;
  try { svg = more.svg(d, { labels: drawingLabels(), info: drawingInfo(d), selected: state.drawingSelected, bomRows: drawingBom(d) }); }
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
    </div>${more.sheetTabsHtml(d)}`;
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
  if (cmd === 'removeView') return change('op.removeView', () => { d.views = d.views.filter((v) => v.id !== arg && v.parent !== arg); });
  return drawingActionExtra(d, cmd, arg);
}

function fitDrawing() {
  const d = activeDrawing(); const host = root.querySelector('#drawing-host');
  if (!d || !host || !host.clientWidth) return;
  const [W, H] = SHEETS[d.sheet] ?? SHEETS.A3;
  const px = 96 / 25.4;
  state.drawingZoom = Math.max(0.2, Math.min((host.clientWidth - 48) / (W * px), (host.clientHeight - 48) / (H * px)));
}

// ───────────────────────── advanced features (sweep, loft, surfaces, sheet metal, weldments, mold tools)

const SURFACE_TYPES = ['surfaceFillet', 'surfaceExtrude', 'surfaceRevolve', 'surfacePlanar', 'surfaceLoft', 'surfaceOffset', 'knit', 'fillSurface', 'boundary', 'trimSurface', 'ruledSurface', 'extendSurface', 'surfaceSweep', 'deleteHole', 'untrimSurface', 'midSurface', 'radiateSurface', 'flattenSurface'];
const SKETCH_BASED = ['sweep', 'rib', 'wrap', 'baseFlange', 'structural', 'surfaceExtrude', 'surfaceRevolve', 'surfacePlanar'];

/** The features before `f` (or before the rollback bar for a new one). */
function featuresBefore(part, f) {
  if (!part) return [];
  const i = part.features.findIndex((x) => x.id === f?.id);
  return i < 0 ? part.features.slice(0, part.rollback ?? part.features.length) : part.features.slice(0, i);
}

/** Sketches no feature uses yet (newest last). */
function freeSketches(part, test = () => true) {
  const used = new Set(part.features.flatMap((f) => [f.sketch, f.path, ...(f.sketches ?? [])]).filter(Boolean));
  return featuresBefore(part, null).filter((f) => f.type === 'sketch' && !f.suppressed && !used.has(f.id) && test(f));
}

/** Starts one of the newer features from the selection (sketches, faces, edges, planes picked first). */
function startAdvanced(type, part) {
  const sel = state.selection;
  const params = {};
  let pick = null;
  let kind = type;
  if (kind === 'cutSweep' || kind === 'cutLoft') { params.op = 'cut'; kind = kind === 'cutSweep' ? 'sweep' : 'loft'; }
  if (kind === 'cavity') { params.op = 'cut'; kind = 'insertPart'; }
  if (kind === 'shrink') { kind = 'scaleBody'; params.factor = 1.02; params.about = 'centroid'; }
  if (!ADVANCED_TYPES.includes(kind)) return undefined;
  if (SHEET_MORE_TYPES.includes(kind)) {
    // Ruled / delete / replace / extend surface, more sheet metal, weldment details: values from the selection.
    const picked = {
      faces: sel.filter((s) => s.kind === 'face').map((s) => topoOf(s)?.shape).filter(Boolean).map(faceSignature),
      edges: sel.filter((s) => s.kind === 'edge').map((s) => topoOf(s)?.shape).filter(Boolean).map(edgeSignature),
      features: sel.filter((s) => s.kind === 'feat').map((s) => part.features.find((f) => f.id === s.id)).filter(Boolean),
    };
    const start = sheetMoreStart(kind, part, picked, featuresBefore(part, null));
    if (start.notice) { notify('info', t(start.notice)); return undefined; }
    return beginFeature(createFeature(part, kind, start.params), { pick: start.pick });
  }
  const chosen = sel.filter((s) => s.kind === 'feat').map((s) => part.features.find((f) => f.id === s.id && f.type === 'sketch')).filter(Boolean);
  const hasProfile = (f) => profiles(f).length > 0;
  if (SKETCH_BASED.includes(kind)) {
    const use = sketchUse(kind);
    const sk = chosen[0] ?? freeSketches(part, use === 'profile' ? hasProfile : () => true).at(-1);
    if (!sk) { notify('info', t('notice.needSketch')); return undefined; }
    params.sketch = sk.id;
    if (kind === 'sweep') {
      const helix = [...featuresBefore(part, null)].reverse().find((f) => f.type === 'helix');
      const other = chosen[1] ?? freeSketches(part).filter((f) => f.id !== sk.id).at(-1);
      params.path = chosen[1]?.id ?? helix?.id ?? other?.id ?? null;
      // The profile is the closed sketch; when the picked one is the open path, swap them.
      const pathSk = part.features.find((f) => f.id === params.path && f.type === 'sketch');
      if (!hasProfile(sk) && pathSk && hasProfile(pathSk)) [params.sketch, params.path] = [pathSk.id, sk.id];
    }
  }
  if (kind === 'loft' || kind === 'surfaceLoft') params.sketches = (chosen.length >= 2 ? chosen : freeSketches(part, hasProfile).slice(-2)).map((f) => f.id);
  if (['draft', 'dome', 'surfaceOffset'].includes(kind)) {
    params.faces = sel.filter((s) => s.kind === 'face').map((s) => topoOf(s)?.shape).filter(Boolean).map(faceSignature);
    if (kind === 'dome') params.faces = params.faces.filter((x) => x.type === 'PLANE').slice(0, 1);
    pick = 'faces';
    if (kind === 'draft') { const pl = sel.find((s) => s.kind === 'plane'); if (pl) params.neutral = planeRefOf(pl.id); pick = params.faces.length ? 'neutral' : 'faces'; }
  }
  if (kind === 'thread' || kind === 'edgeFlange') { const e = sel.find((s) => s.kind === 'edge'); const shape = e && topoOf(e)?.shape; if (shape) params.edge = edgeSignature(shape); pick = 'edge'; }
  if (kind === 'wrap') { const f = sel.find((s) => s.kind === 'face'); const shape = f && topoOf(f)?.shape; if (shape) params.face = faceSignature(shape); pick = 'face'; }
  if (kind === 'thicken') { const last = [...featuresBefore(part, null)].reverse().find((f) => SURFACE_TYPES.includes(f.type)); if (!last) { notify('info', t('notice.needSurface')); return undefined; } params.surface = last.id; }
  if (kind === 'knit') params.surfaces = featuresBefore(part, null).filter((f) => SURFACE_TYPES.includes(f.type) && f.type !== 'knit').map((f) => f.id);
  if (kind === 'split' || kind === 'helix') { const pl = sel.find((s) => s.kind === 'plane'); if (pl) params.plane = planeRefOf(pl.id); pick = 'plane'; }
  if (kind === 'insertPart') { const other = project().parts.find((p) => p.id !== part.id); if (!other) { notify('info', t('notice.needOtherPart')); return undefined; } params.part = other.id; }
  if (['edgeFlange', 'hem', 'sketchedBend', 'jog'].includes(kind) && !part.features.some((f) => f.type === 'baseFlange')) { notify('info', t('notice.needBaseFlange')); return undefined; }
  if (kind === 'hem') { const e = sel.find((x) => x.kind === 'edge'); const shape = e && topoOf(e)?.shape; if (shape) params.edge = edgeSignature(shape); pick = 'edge'; }
  if (kind === 'sketchedBend' || kind === 'jog') {
    const sk = chosen[0] ?? freeSketches(part, (f) => f.entities.some((x) => x.type === 'line' && !x.construction)).at(-1);
    if (!sk) { notify('info', t('notice.needSketch')); return undefined; }
    params.sketch = sk.id;
  }
  if (kind === 'fillSurface') {
    params.edges = sel.filter((x) => x.kind === 'edge').map((x) => topoOf(x)?.shape).filter(Boolean).map(edgeSignature);
    const c3 = sel.filter((x) => x.kind === 'feat').map((x) => part.features.find((f) => f.id === x.id && (f.type === 'sketch3d' || f.type === 'sketch'))).find(Boolean);
    if (c3) params.curve = c3.id;
    pick = 'edges';
  }
  if (kind === 'boundary') {
    const picked = sel.filter((x) => x.kind === 'feat').map((x) => part.features.find((f) => f.id === x.id && (f.type === 'sketch3d' || f.type === 'sketch'))).filter(Boolean);
    params.curves = (picked.length >= 2 ? picked : featuresBefore(part, null).filter((f) => f.type === 'sketch3d' || (f.type === 'sketch' && f.entities.some((x) => x.type !== 'point'))).slice(-2)).map((f) => f.id);
  }
  if (kind === 'trimSurface') {
    const surfaces = featuresBefore(part, null).filter((f) => SURFACE_TYPES.includes(f.type) || f.type === 'fillSurface' || f.type === 'boundary' || f.type === 'trimSurface');
    if (!surfaces.length) { notify('info', t('notice.needSurface')); return undefined; }
    params.surface = surfaces.at(-1).id;
    const pl = sel.find((x) => x.kind === 'plane'); if (pl) params.plane = planeRefOf(pl.id);
    pick = 'plane';
  }
  if (kind === 'toolingSplit') { const pl = [...featuresBefore(part, null)].reverse().find((f) => f.type === 'partingLine'); if (pl) params.dir = pl.dir; }
  if (kind === 'sketch3d') { pick = 'points3d'; }
  return beginFeature(createFeature(part, kind, params), { pick });
}

/** Surfaces (translucent) and reference curves (helices, cosmetic threads) of a rebuild, ready for the view. */
function tessellateExtras(result, size) {
  const out = { surfaces: [], curves: [] };
  const tol = { tolerance: Math.max(0.002, meshTolerance(size)), angularTolerance: angularTolerance() };
  for (const [id, shape] of result.surfaces ?? []) {
    try { out.surfaces.push({ id, mesh: shape.mesh(tol), edges: shape.meshEdges(tol) }); } catch (error) { console.warn('surface mesh', error); }
  }
  const polylineSegments = (edges) => {
    const seg = [];
    for (const eg of edges.edgeGroups) for (let k = eg.start; k < eg.start + eg.count - 1; k++) seg.push(...edges.lines.slice(k * 3, k * 3 + 6));
    return seg;
  };
  for (const [, wire] of result.curves ?? []) { try { out.curves.push({ segments: polylineSegments(wire.meshEdges(tol)) }); } catch { /* not shown */ } }
  for (const r of result.results?.values() ?? []) {
    for (const th of r.threads ?? (r.thread ? [r.thread] : [])) {
      // A modelled thread is in the solid; a cosmetic one is drawn: circles at both ends of the threaded
      // length (the minor diameter of an external thread, the major of an internal one), like a drawing shows it.
      if (th.modelled || (r.tool && !r.threads)) continue;
      const rr = th.major ? (th.internal ? th.major / 2 : th.minor / 2) : th.internal ? th.radius + 0.54 * th.pitch : th.radius - 0.54 * th.pitch;
      const u = Math.abs(th.dir[0]) < 0.9 ? [0, -th.dir[2], th.dir[1]] : [-th.dir[1], th.dir[0], 0];
      const ul = Math.hypot(...u); const a = u.map((x) => x / ul);
      const b = [th.dir[1] * a[2] - th.dir[2] * a[1], th.dir[2] * a[0] - th.dir[0] * a[2], th.dir[0] * a[1] - th.dir[1] * a[0]];
      const seg = [];
      // The end circles lie on the part's faces: moved a hair outwards so the face does not hide them half the time.
      const lift = Math.max(0.01, size * 2e-4);
      for (const d of [-lift, th.length + lift]) {
        const c = th.centre.map((x, i) => x + th.dir[i] * d);
        for (let i = 0; i < 48; i++) {
          const pnt = (k) => { const ang = (k / 48) * Math.PI * 2; return c.map((x, j) => x + rr * (Math.cos(ang) * a[j] + Math.sin(ang) * b[j])); };
          seg.push(...pnt(i), ...pnt(i + 1));
        }
      }
      out.curves.push({ segments: seg });
    }
  }
  return out;
}

// ───────────────────────── colour plots on the body: draft analysis, simulation results

const draftColours = new Map();

function resultColours(part, entry) {
  const sim = state.sim;
  if (sim && sim.partId === part.id && sim.key === entry.key && sim.result) {
    const extra = { colors: sim.colors };
    // A shell study is drawn on its mid-surface (the viewport's preview); the solid is shown see-through around it.
    if (sim.result.kind === 'shell') extra.ghost = true;
    if (sim.deformed && sim.result.vertexDisplacement) {
      const v = entry.mesh.vertices; const d = sim.result.vertexDisplacement; const k = sim.scale;
      extra.mesh = { ...entry.mesh, vertices: Float32Array.from(v, (x, i) => x + d[i] * k) };
    }
    return extra;
  }
  const evaluated = more.colours(part, entry);
  if (evaluated) return evaluated;
  const da = state.draftAnalysis;
  if (da && entry.mesh) {
    const ck = `${entry.key}|${da.dir}|${da.angle}`;
    if (!draftColours.has(ck)) {
      const n = entry.mesh.normals; const out = new Float32Array(n.length);
      const s = Math.sin((da.angle * Math.PI) / 180);
      for (let i = 0; i < n.length; i += 3) {
        const c = n[i] * da.dir[0] + n[i + 1] * da.dir[1] + n[i + 2] * da.dir[2];
        // Green: draft toward the pull, red: against it, yellow: steeper than the required draft (needs draft).
        const rgb = c >= s ? [0.22, 0.72, 0.33] : c <= -s ? [0.85, 0.22, 0.2] : [0.95, 0.78, 0.15];
        out.set(rgb, i);
      }
      if (draftColours.size > 8) draftColours.clear();
      draftColours.set(ck, out);
    }
    return { colors: draftColours.get(ck) };
  }
  return {};
}

function toggleDraftAnalysis() {
  if (state.draftAnalysis) { state.draftAnalysis = null; notify('info', t('notice.draftAnalysisOff')); syncView(); renderToolbarState(); return; }
  let dir = [0, 0, 1];
  const s = state.selection[0];
  if (s?.kind === 'plane') dir = makeFrame(STD_PLANES[s.id] ?? STD_PLANES.top).normal;
  else if (s?.kind === 'face') { const shape = topoOf(s)?.shape; if (shape?.geomType === 'PLANE') dir = faceSignature(shape).normal; }
  state.evalDisplay = null;
  state.draftAnalysis = { dir, angle: Number(state.settings.draftAngle ?? 1) || 1 };
  notify('info', t('notice.draftAnalysisOn', { angle: state.draftAnalysis.angle }));
  syncView();
  renderToolbarState();
}

// ───────────────────────── simulation (linear static, simulation style)

function startSimulation() {
  const part = activePart();
  if (!part || !state.partEntry?.mesh) { notify('info', t('notice.noBody')); return; }
  if (state.editing) cancelEditing({ quiet: true });
  state.editing = { mode: 'simulation', study: 'static', fixtures: [], loads: [], loadKind: 'force', magnitude: 1000, dir: '-z', resolution: 40, pick: 'fixtures', nu: 0.3, temperature: 100, heatKind: 'convection', power: 10, h: 25, ambient: 20, modes: 4, modeIndex: 0 };
  state.leftTab = 'pm';
  renderAll();
  notify('info', t('notice.simPickFixtures'));
}

function pickForSimulation(hit) {
  const e = state.editing;
  if (hit?.kind !== 'face' || hit.bodyKey !== 'body') { notify('info', t('notice.pickFace')); return; }
  const face = state.partEntry.faces?.[hit.index];
  if (!face) return;
  if (more.fem?.pick(e, hit, face)) return;
  const list = e.pick === 'loads' ? e.loads : e.fixtures;
  const i = list.findIndex((x) => x.index === hit.index);
  if (i >= 0) list.splice(i, 1);
  else list.push({ index: hit.index, faceId: face.hashCode, type: face.geomType, ...(list === e.fixtures && more.fem ? { kind: more.fem.fixtureKind(e) } : {}) });
  viewport.setSelection([...e.fixtures, ...e.loads].map((x) => ({ kind: 'face', bodyKey: 'body', index: x.index })));
  renderLeft();
}

const LOAD_DIRS = { x: [1, 0, 0], '-x': [-1, 0, 0], y: [0, 1, 0], '-y': [0, -1, 0], z: [0, 0, 1], '-z': [0, 0, -1] };

async function runSimulation() {
  const e = state.editing;
  const part = activePart();
  const entry = state.partEntry;
  if (!part || !entry?.mesh) return;
  if (more.fem && ['static', 'thermal', 'modal'].includes(e.study)) return more.fem.runPart(e, part, entry);
  if (e.study === 'thermal') return runThermal(e, part, entry);
  if (more.simStudy(e.study)) return more.runSim(e, part, entry);
  if (e.study === 'modal') return runModal(e, part, entry);
  if (!e.fixtures.length) { notify('error', t('sim.error.no-fixtures')); return; }
  if (!e.loads.length) { notify('error', t('sim.error.no-loads')); return; }
  const mat = materialOf(part.material);
  const loads = e.loads.map((l) => (e.loadKind === 'pressure' ? { faceId: l.faceId, pressure: e.magnitude / e.loads.length } : { faceId: l.faceId, force: LOAD_DIRS[e.dir].map((v) => (v * e.magnitude) / e.loads.length) }));
  const result = await withProgress('progress.simulation', part.name, async (op, report) => {
    await new Promise((r) => setTimeout(r, 30));
    return analyseFea(entry.mesh, { material: { E: mat.E * 1000, nu: mat.nu ?? e.nu, yield: mat.yield, density: mat.density }, fixtures: e.fixtures.map((x) => x.faceId), loads, resolution: Math.max(8, Math.min(140, Math.round(e.resolution))), onProgress: (f) => report({ fraction: f, text: t('progress.solving') }) });
  }, { delay: 150 });
  if (!result) return;
  if (result.error && result.error !== 'not-converged') { notify('error', t(`sim.error.${result.error}`)); return; }
  // Colour scale to the 98th percentile: the voxel model's corners give spikes (see fea.js).
  const sorted = Float32Array.from(result.vertexStress).sort();
  const top = sorted[Math.floor(sorted.length * 0.98)] || result.maxStress || 1;
  const colors = new Float32Array(result.vertexStress.length * 3);
  result.vertexStress.forEach((v, i) => colors.set(stressColor(v, 0, top), i * 3));
  const size = entry.size ?? 100;
  state.sim = { partId: part.id, key: entry.key, result, colors, top, deformed: false, scale: result.maxDisplacement > 0 ? (size * 0.08) / result.maxDisplacement : 1 };
  e.result = result;
  if (result.error === 'not-converged') notify('warning', t('sim.error.not-converged'));
  else notify(result.minFactorOfSafety < 1 ? 'warning' : 'success', t('notice.simDone', { fos: fmt(result.minFactorOfSafety, 2) }));
  syncView();
  renderLeft();
}

/** Steady-state heat: fixed-temperature faces (the "fixtures" list), and heat in by power or out by convection (the "loads" list). */
async function runThermal(e, part, entry) {
  if (!e.fixtures.length && !(e.loads.length && e.heatKind === 'convection')) { notify('error', t(e.heatKind === 'radiation' ? 'sim.error.radiationTet' : 'sim.error.no-temperature')); return; }
  const result = await withProgress('progress.simulation', part.name, async (op, report) => {
    await new Promise((r) => setTimeout(r, 30));
    return analyseThermal(entry.mesh, {
      material: part.material,
      temperatures: e.fixtures.map((x) => ({ faceId: x.faceId, value: e.temperature })),
      fluxes: e.heatKind === 'power' ? e.loads.map((x) => ({ faceId: x.faceId, power: e.power / e.loads.length })) : [],
      convections: e.heatKind === 'convection' ? e.loads.map((x) => ({ faceId: x.faceId, h: e.h, ambient: e.ambient })) : [],
      resolution: Math.max(8, Math.min(140, Math.round(e.resolution))), onProgress: (f) => report({ fraction: f, text: t('progress.solving') }),
    });
  }, { delay: 150 });
  if (!result) return;
  if (result.error && result.error !== 'not-converged') { notify('error', t(`sim.error.${result.error}`)); return; }
  const colors = new Float32Array(result.vertexTemperature.length * 3);
  result.vertexTemperature.forEach((v, i) => colors.set(temperatureColor(v, result.min, result.max), i * 3));
  state.sim = { partId: part.id, key: entry.key, result, colors, deformed: false, scale: 1, study: 'thermal' };
  e.result = result;
  notify('success', t('notice.thermalDone', { min: fmt(result.min, 1), max: fmt(result.max, 1) }));
  syncView(); renderLeft();
}

/** Natural frequencies: the fixed faces hold the part; each mode's shape colours the body and can be shown bent. */
async function runModal(e, part, entry) {
  if (!e.fixtures.length) { notify('error', t('sim.error.no-fixtures')); return; }
  const mat = materialOf(part.material);
  const result = await withProgress('progress.simulation', part.name, async (op, report) => {
    await new Promise((r) => setTimeout(r, 30));
    return analyseModal(entry.mesh, { material: { E: mat.E * 1000, nu: mat.nu ?? e.nu, density: mat.density }, fixtures: e.fixtures.map((x) => x.faceId), modes: Math.max(1, Math.min(8, Math.round(e.modes))), resolution: Math.max(8, Math.min(100, Math.round(e.resolution))), onProgress: (f) => report({ fraction: f, text: t('progress.solving') }) });
  }, { delay: 150 });
  if (!result) return;
  if (result.error && result.error !== 'not-converged') { notify('error', t(`sim.error.${result.error}`)); return; }
  e.result = result;
  e.modeIndex = 0;
  showMode(e, part, entry);
  notify('success', t('notice.modalDone', { f: fmt(result.frequencies[0] ?? 0, 1) }));
}

function showMode(e, part = activePart(), entry = state.partEntry) {
  const r = e.result;
  const shape = r?.modes?.[e.modeIndex];
  if (!shape) return;
  const n = shape.length / 3;
  const mag = new Float32Array(n);
  for (let i = 0; i < n; i++) mag[i] = Math.hypot(shape[3 * i], shape[3 * i + 1], shape[3 * i + 2]);
  const colors = new Float32Array(n * 3);
  mag.forEach((v, i) => colors.set(stressColor(v, 0, 1), i * 3));
  state.sim = { partId: part.id, key: entry.key, result: { ...r, vertexDisplacement: shape }, colors, deformed: true, scale: (entry.size ?? 100) * 0.08, study: 'modal' };
  syncView(); renderLeft();
}

// ───────────────────────── motion study

function startMotion() {
  const asm = activeAssembly();
  if (!asm) { notify('info', t('notice.assemblyOnly')); return; }
  if (state.editing) cancelEditing({ quiet: true });
  asm.motion ??= { duration: 5, motors: [] };
  state.editing = { mode: 'motion', pick: 'motor', speed: 30, kind: 'rotary', time: 0, playing: false };
  state.leftTab = 'pm';
  renderAll();
  notify('info', t('notice.motionPickMotor'));
}

function pickForMotion(hit) {
  const e = state.editing;
  const topo = topoOf(hit);
  if (hit?.kind !== 'face' || !topo?.comp) { notify('info', t('notice.pickComponentFace')); return; }
  const ent = { comp: topo.comp.id, ...mateEntityOfFace(topo.shape, faceSignature) };
  if (topo.inner) { ent.point = placePoint(topo.inner, ent.point); ent.dir = placeDir(topo.inner, ent.dir); ent.path = topo.path; }
  if (e.pick === 'contact') {
    // A contact between two components (picked by any face of each).
    e.contactPick = [...(e.contactPick ?? []).filter((id) => id !== ent.comp), ent.comp];
    if (e.contactPick.length < 2) return renderLeft();
    const asm = activeAssembly();
    const [a, b] = e.contactPick;
    change('op.motion', () => { asm.motion.contacts = [...(asm.motion.contacts ?? []), { id: newId('contact'), a, b, e: 0.5 }]; });
    e.contactPick = [];
    return renderLeft();
  }
  if (e.pick === 'spring') {
    // A spring (with its damper) between the centres / axis points of two faces of two components.
    e.springPick = [...(e.springPick ?? []), { comp: ent.comp, point: ent.point }];
    if (e.springPick.length === 2 && e.springPick[0].comp === e.springPick[1].comp) { e.springPick = [e.springPick[0]]; notify('info', t('notice.sameComponent')); return renderLeft(); }
    if (e.springPick.length < 2) return renderLeft();
    const asm = activeAssembly();
    const [a, b] = e.springPick;
    const pa = placePoint(asm.components.find((c) => c.id === a.comp), a.point); const pb = placePoint(asm.components.find((c) => c.id === b.comp), b.point);
    change('op.motion', () => { asm.motion.springs = [...(asm.motion.springs ?? []), { id: newId('spring'), a, b, k: 1, c: 0.01, length: Math.round(Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]) * 1000) / 1000 }]; });
    e.springPick = [];
    return renderLeft();
  }
  if (e.kind === 'rotary' && ent.kind !== 'axis') { notify('info', t('notice.motorNeedsAxis')); return; }
  const asm = activeAssembly();
  change('op.motor', () => { asm.motion.motors = [...asm.motion.motors.filter((m) => m.comp !== ent.comp), { id: newId('motor'), kind: e.kind, comp: ent.comp, ref: ent, speed: e.speed }]; });
}

// The motion being played: one solver moved on frame by frame (see motionCursor), made again when the assembly
// (its components, mates or motion study) changes.
let motionPlay = null;
/** The kind of an assembly's motion study: 'motors' (motors drive the mates), 'keyframe' (animation) or 'physics' (motion analysis). */
const motionType = (asm) => asm?.motion?.type ?? 'motors';
/** True when the motion study has something to play. */
function hasMotion(asm) {
  const ty = motionType(asm);
  if (ty === 'keyframe') return (asm?.motion?.keys?.length ?? 0) > 1;
  if (ty === 'physics') return Boolean(asm?.components?.some((c) => !c.fixed));
  return Boolean(asm?.motion?.motors?.length);
}

/** Each component's mass, centre of mass and inertia tensor in its own frame (through a sub-assembly's parts). */
function componentMassProps(asm) {
  const R = rep(); const out = new Map();
  for (const c of asm.components) {
    if (c.suppressed) continue;
    const list = [];
    for (const leaf of componentLeaves(c)) {
      const part = project().parts.find((p) => p.id === leaf.part);
      let body = null; try { body = part && buildPart(part).body; } catch { body = null; }
      if (!body) continue;
      try { list.push({ ...inertiaOf(R, body, materialOf(part.material).density), placement: leaf.placement }); } catch { /* no volume */ }
    }
    if (list.length) out.set(c.id, combineInertia(list));
  }
  return out;
}

/**
 * The gap between two components of a contact (the kernel's closest points of their placed solids): { gap, pa, pb,
 * n (a → b) }. Overlapping solids give 0, their normal the last one seen (or the line between their centres).
 */
function contactGapOf(asm) {
  const R = rep(); const oc = R.getOC();
  const local = new Map(); const lastN = new Map();
  const shapeOf = (id) => {
    if (!local.has(id)) {
      const c = asm.components.find((x) => x.id === id);
      const list = (c ? componentLeaves(c) : []).map((leaf) => { const part = project().parts.find((p) => p.id === leaf.part); let b = null; try { b = part && buildPart(part).body; } catch { b = null; } return b ? (leaf.path.length ? placeShape(b, leaf.placement) : b) : null; }).filter(Boolean);
      local.set(id, list.length > 1 ? R.makeCompound(list) : list[0] ?? null);
    }
    return local.get(id);
  };
  return (ct, placeOf) => {
    const A = shapeOf(ct.a); const B = shapeOf(ct.b);
    if (!A || !B) return null;
    const sa = placeShape(A, placeOf(ct.a)); const sb = placeShape(B, placeOf(ct.b));
    const ds = new oc.BRepExtrema_DistShapeShape(sa.wrapped, sb.wrapped);
    try {
      if (!ds.IsDone() || ds.NbSolution() < 1) return null;
      const gap = ds.Value();
      // Every distinct pair of closest points (a face over a face: its corners), the first for the normal.
      const points = [];
      for (let i = 1; i <= Math.min(ds.NbSolution(), 12); i++) {
        const p1 = ds.PointOnShape1(i); const p2 = ds.PointOnShape2(i);
        const q = { pa: [p1.X(), p1.Y(), p1.Z()], pb: [p2.X(), p2.Y(), p2.Z()] };
        if (Math.abs(Math.hypot(q.pb[0] - q.pa[0], q.pb[1] - q.pa[1], q.pb[2] - q.pa[2]) - gap) > 1e-6) continue;
        if (points.some((o) => Math.hypot(o.pb[0] - q.pb[0], o.pb[1] - q.pb[1], o.pb[2] - q.pb[2]) < 1e-6)) continue;
        points.push(q);
      }
      if (!points.length) return null;
      const { pa, pb } = points[0];
      let n = null;
      if (gap > 1e-7) n = pb.map((v, i) => (v - pa[i]) / gap);
      else {
        n = lastN.get(ct.id);
        if (!n) { const ca = sa.boundingBox.center; const cb = sb.boundingBox.center; const d = [cb[0] - ca[0], cb[1] - ca[1], cb[2] - ca[2]]; const l = Math.hypot(...d) || 1; n = d.map((v) => v / l); }
      }
      lastN.set(ct.id, n);
      return { gap, pa, pb, n, points };
    } finally { ds.delete(); sa.delete?.(); sb.delete?.(); }
  };
}

/** The motion analysis of the active assembly (made again when the assembly or its study changes). */
function dynamicsResult(asm, { run = true } = {}) {
  const key = JSON.stringify([asm.id, asm.components, asm.mates, asm.motion]);
  if (state.dynamics?.key === key) return state.dynamics.result;
  if (!run) return null;
  const mi = motionInput(asm);
  const result = simulateDynamics(mi.assembly, { entity: mi.entity, size: assemblySize(asm), bodies: componentMassProps(asm), fps: 30, gap: asm.motion?.contacts?.length ? contactGapOf(asm) : null, dt: Number(asm.motion?.step) > 0 ? Number(asm.motion.step) : 1 / 400 });
  state.dynamics = { key, result };
  return result;
}

function motionPose(time) {
  const asm = activeAssembly();
  if (motionType(asm) === 'keyframe') return hasMotion(asm) ? keyframePose(asm, time) : null;
  if (motionType(asm) === 'physics') return hasMotion(asm) ? dynamicsPose(dynamicsResult(asm), time) : null;
  if (!asm?.motion?.motors?.length) return null;
  const key = JSON.stringify([asm.id, asm.components, asm.mates, asm.motion]);
  if (motionPlay?.key !== key) { const mi = motionInput(asm); motionPlay = { key, cursor: motionCursor(mi.assembly, { entity: mi.entity, size: assemblySize(asm) }) }; }
  return motionPlay.cursor.at(time);
}

// A sub-assembly with a motion study of its own plays it too while the assembly's plays (a robot's gripper
// opens and closes while the arm moves): one cursor per sub-assembly, made again when it changes.
const subMotionPlay = new Map();
function subMotionPose(sub, time) {
  if (!sub?.motion?.motors?.length) return null;
  const key = JSON.stringify([sub.components, sub.mates, sub.motion]);
  let play = subMotionPlay.get(sub.id);
  if (play?.key !== key) { play = { key, cursor: motionCursor(sub, { entity: (ref) => mateEntityNow(ref), size: assemblySize(sub) }) }; subMotionPlay.set(sub.id, play); }
  try { return play.cursor.at(time); } catch { return null; }
}

/** The motion analysis results as a plot (SVG): one quantity of one body, spring, mate or motor over time. */
function physicsPlot(asm, res, e) {
  const kind = e.plotKind ?? 'disp';
  const s = res.series;
  const nameOf = (id) => asm.components.find((c) => c.id === id)?.name ?? asm.mates.find((m) => m.id === id)?.name ?? id;
  const groups = { disp: ['bodies', 'disp', 'mm'], speed: ['bodies', 'speed', 'mm/s'], acc: ['bodies', 'acc', 'mm/s²'], spring: ['springs', null, 'N'], mate: ['mates', null, 'N'], motor: ['motors', null, 'N·mm'], contact: ['contacts', null, 'N'] };
  const [grp, field, unit] = groups[kind];
  const ids = Object.keys(s[grp] ?? {});
  const item = ids.includes(e.plotItem) ? e.plotItem : ids[0];
  const ys = item ? (field ? s[grp][item][field] : s[grp][item]) : [];
  const W = 260; const H = 120; const pad = 26;
  const lo = Math.min(0, ...ys); const hi = Math.max(1e-9, ...ys);
  const T = s.t.at(-1) || 1;
  const pts = ys.map((y, i) => `${(pad + (s.t[i] / T) * (W - pad - 6)).toFixed(1)},${(H - 16 - ((y - lo) / (hi - lo || 1)) * (H - 26)).toFixed(1)}`).join(' ');
  const springName = (id, i) => `${t('ph.spring')} ${i + 1}`;
  const label = (id, i) => (grp === 'contacts' ? `${t('ph.contact')} ${i + 1}` : grp === 'springs' ? springName(id, i) : grp === 'motors' ? `${t('motion.motor')} ${nameOf(asm.motion.motors.find((m) => m.id === id)?.comp)}` : nameOf(id));
  return `${pmSeg('plotKind', [['disp', t('ph.disp'), 'smartDim'], ['speed', t('ph.speed'), 'motion'], ['acc', t('ph.acc'), 'motion'], ['spring', t('ph.springForce'), 'spring'], ['mate', t('ph.mateForce'), 'mate'], ['motor', t('ph.motorTorque'), 'motor'], ['contact', t('ph.contactForce'), 'contact']], kind)}
    ${ids.length ? `<label class="pm-field"><span class="pm-label">${escapeHtml(t('ph.item'))}</span><select data-pm-select="plotItem" aria-label="${escapeHtml(t('ph.item'))}">${ids.map((id, i) => `<option value="${escapeHtml(id)}" ${id === item ? 'selected' : ''}>${escapeHtml(label(id, i))}</option>`).join('')}</select></label>
    <svg class="ph-plot" viewBox="0 0 ${W} ${H}" width="100%" data-physics-plot role="img" aria-label="${escapeHtml(t('ph.plot'))}"><rect x="${pad}" y="10" width="${W - pad - 6}" height="${H - 26}" fill="none" stroke="currentColor" stroke-opacity="0.25"/><polyline points="${pts}" fill="none" stroke="#2f7de1" stroke-width="1.6"/><text x="2" y="16" font-size="8" fill="currentColor">${escapeHtml(fmt(hi, 1))}</text><text x="2" y="${H - 14}" font-size="8" fill="currentColor">${escapeHtml(fmt(lo, 1))}</text><text x="${W - 6}" y="${H - 3}" font-size="8" text-anchor="end" fill="currentColor">${escapeHtml(`${fmt(T, 2)} s`)}</text><text x="${pad + 2}" y="${H - 3}" font-size="8" fill="currentColor">${escapeHtml(unit)}</text></svg>
    <p class="pm-note" data-physics-peak>${escapeHtml(t('ph.peak', { value: fmt(Math.max(...ys.map(Math.abs), 0), 2), unit }))}</p>` : `<p class="pm-note">${escapeHtml(t('ph.noSeries'))}</p>`}`;
}

function showMotionTime(time) {
  const asm = activeAssembly();
  const pose = motionPose(time);
  more.onMotionPose(pose);
  if (!asm || !pose) return;
  for (const c of asm.components) {
    const pl = pose.get(c.id);
    if (!pl) continue;
    const subPose = c.sub ? subMotionPose(project()?.assemblies.find((a) => a.id === c.sub), time) : null;
    for (const leaf of componentLeaves(c)) {
      const key = leaf.path.length ? `comp:${c.id}/${leaf.path.join('/')}` : `comp:${c.id}`;
      // A part inside a flexible sub-assembly: where the motion has moved it (its own unknowns).
      const flexPl = c.flexible && leaf.path.length ? flexLeafPlacement(c, project()?.assemblies.find((a) => a.id === c.sub), leaf, pose) : null;
      if (flexPl) { viewport.setBodyMatrix(key, componentMatrix(flexPl)); continue; }
      // A direct component of a playing sub-assembly: its placement at this time, not its resting one.
      const inner = subPose && leaf.path.length === 1 ? subPose.get(leaf.path[0]) ?? leaf.placement : leaf.placement;
      viewport.setBodyMatrix(key, componentMatrix(leaf.path.length ? composePlacement(pl, inner) : pl));
    }
  }
}

/**
 * The next frame of a playing motion: at once with the screen when this one was quick, after the page's other
 * waiting work (clicks, timers) when it was slow — a heavy assembly then plays slower instead of locking the window.
 */
/**
 * How far a playing motion moves this frame: the real time since the last one, at most 50 ms of motion — a slow
 * frame must not make the next one solve a longer stretch (which would be slower again).
 */
function motionStep(last, setLast) {
  const now = performance.now();
  setLast(now);
  return Math.min(0.05, Math.max(0, (now - last) / 1000));
}

function nextMotionFrame(step, started) {
  if (performance.now() - started > 30) setTimeout(() => requestAnimationFrame(step), 0);
  else requestAnimationFrame(step);
}

function playMotion(on) {
  const e = state.editing;
  if (e?.mode !== 'motion') return;
  const asm = activeAssembly();
  if (on && !hasMotion(asm)) { notify('info', t(motionType(asm) === 'keyframe' ? 'kf.needKeys' : 'notice.motionPickMotor')); return; }
  e.playing = on;
  if (!on) { renderLeft(); return; }
  let last = performance.now();
  const step = () => {
    if (state.editing !== e || !e.playing) return;
    const started = performance.now();
    const duration = Math.max(0.1, Number(asm.motion.duration) || 5);
    e.time = (e.time + motionStep(last, (now) => { last = now; })) % duration;
    try { showMotionTime(e.time); } catch (error) { e.playing = false; showError('error.command', error, t('cmd.motion')); return; }
    const slider = root.querySelector('[data-motion-time]');
    if (slider) { slider.value = String(e.time); syncSlider(slider); }
    const out = root.querySelector('[data-motion-clock]');
    if (out) out.textContent = `${fmt(e.time, 2)} s`;
    nextMotionFrame(step, started);
  };
  renderLeft();
  requestAnimationFrame(step);
}

// ───────────────────────── the motion player (an assembly that can move: play, pause, stop)

state.player = { asmId: null, time: 0, playing: false };

/** The bar over the graphics area of an assembly that has a motion study: ▶ play, ❚❚ pause, ■ stop, time. */
function renderMotionBar() {
  const area = root.querySelector('#view-host')?.parentElement;
  if (!area) return;
  let bar = area.querySelector('#motion-bar');
  const asm = activeAssembly();
  const show = hasMotion(asm) && (motionType(asm) !== 'physics' || Boolean(dynamicsResult(asm, { run: false }))) && state.editing?.mode !== 'motion' && !state.showStart;
  if (!show) {
    if (state.player.playing) stopPlayer({ quiet: true });
    bar?.remove();
    return;
  }
  if (state.player.asmId !== asm.id) state.player = { asmId: asm.id, time: 0, playing: false };
  const duration = Math.max(0.1, Number(asm.motion.duration) || 5);
  const p = state.player;
  const html = `<span class="motion-bar-title">${icon('motion')}<span>${escapeHtml(t('cmd.motion'))}</span></span>
    <button class="icon-button ${p.playing ? 'active' : ''}" data-player="play" title="${escapeHtml(t('motion.play'))}" aria-label="${escapeHtml(t('motion.play'))}" ${p.playing ? 'disabled' : ''}>${icon('play')}</button>
    <button class="icon-button" data-player="pause" title="${escapeHtml(t('motion.pause'))}" aria-label="${escapeHtml(t('motion.pause'))}" ${p.playing ? '' : 'disabled'}>${icon('pause')}</button>
    <button class="icon-button" data-player="stop" title="${escapeHtml(t('motion.stop'))}" aria-label="${escapeHtml(t('motion.stop'))}" ${p.playing || p.time > 0 ? '' : 'disabled'}>${icon('stop')}</button>
    <input type="range" data-unit="s" data-player-time min="0" max="${duration}" step="0.01" value="${p.time}" aria-label="${escapeHtml(t('motion.time'))}"/>`;
  if (!bar) { bar = document.createElement('div'); bar.id = 'motion-bar'; bar.className = 'motion-bar'; area.append(bar); }
  bar.innerHTML = html;
}

function playPlayer() {
  const asm = activeAssembly();
  if (!hasMotion(asm) || state.player.playing) return;
  const p = state.player;
  p.playing = true;
  let last = performance.now();
  const step = () => {
    if (!p.playing || state.player !== p || activeAssembly()?.id !== p.asmId) return;
    const started = performance.now();
    const duration = Math.max(0.1, Number(asm.motion.duration) || 5);
    p.time = (p.time + motionStep(last, (now) => { last = now; })) % duration;
    try { showMotionTime(p.time); } catch (error) { p.playing = false; renderMotionBar(); showError('error.command', error, t('cmd.motion')); return; }
    const slider = root.querySelector('[data-player-time]');
    if (slider) { slider.value = String(p.time); syncSlider(slider); }
    nextMotionFrame(step, started);
  };
  renderMotionBar();
  requestAnimationFrame(step);
}

/** Pause: the parts stay where they are; Play goes on from there. */
function pausePlayer() { state.player.playing = false; renderMotionBar(); }

/** Stop: back to the start, the parts back where the mates put them. */
function stopPlayer({ quiet = false } = {}) {
  state.player.playing = false;
  state.player.time = 0;
  if (!quiet) { syncView(); renderMotionBar(); }
}

// ───────────────────────── exploded views, sub-assemblies

function toggleExplode() {
  const asm = activeAssembly();
  if (!asm) return;
  if (asm.explode?.steps?.length) { change('op.explode', () => { asm.explode.on = !asm.explode.on; }); notify('info', t(asm.explode.on ? 'notice.exploded' : 'notice.collapsed')); return; }
  autoExplodeNow();
}

/** Automatic explode steps (replacing the ones there are): components pushed apart along the assembly's long axis. */
function autoExplodeNow() {
  const asm = activeAssembly();
  if (!asm) return;
  const boxes = new Map();
  for (const c of asm.components) {
    const list = componentShapes(c);
    if (!list.length) continue;
    const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
    for (const { shape } of list) { const [a, b] = shape.boundingBox.bounds; for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], a[i]); hi[i] = Math.max(hi[i], b[i]); } }
    boxes.set(c.id, [lo, hi]);
  }
  const lines = asm.explode?.lines;
  change('op.explode', () => { autoExplode(asm, boxes, assemblySize(asm) * 0.15); if (lines === false) asm.explode.lines = false; });
  notify('success', t('notice.exploded'));
  fitView();
}

const simpleCache = new Map();
/**
 * A component's simplified representation (display only; mass, interference and drawings use the full one):
 * 'box' — its bounding box as one body; 'outer' — its parts without those inside others or tiny ones.
 */
function simplifiedOf(c) {
  const leaves = componentLeaves(c).map((leaf) => {
    const part = project().parts.find((p) => p.id === leaf.part);
    let entry = null; try { entry = part && buildPart(part); } catch { entry = null; }
    if (!entry?.body) return null;
    let b; try { b = entry.body.boundingBox.bounds; } catch { return null; }
    const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
    for (let m = 0; m < 8; m++) { const p = placePoint(leaf.placement, [b[m & 1][0], b[(m >> 1) & 1][1], b[(m >> 2) & 1][2]]); for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); } }
    return { key: leaf.path.join('/'), box: [lo, hi], part, uid: entryUid(entry) };
  }).filter(Boolean);
  if (!leaves.length) return null;
  const key = JSON.stringify([c.simplified, leaves.map((l) => [l.key, l.uid, l.box])]);
  const hit = simpleCache.get(c.id);
  if (hit?.key === key) return hit.value;
  let value;
  if (c.simplified === 'box') {
    const lo = [0, 1, 2].map((i) => Math.min(...leaves.map((l) => l.box[0][i]))); const hi = [0, 1, 2].map((i) => Math.max(...leaves.map((l) => l.box[1][i])));
    const R = rep(); const shape = R.makeBox(lo, hi); const tol = { tolerance: 0.1, angularTolerance: 0.5 };
    value = { box: { mesh: shape.mesh(tol), edges: shape.meshEdges(tol), faceIndex: new Map(), edgeIndex: new Map() }, part: leaves[0].part };
  } else value = { hidden: hiddenInside(leaves, { minSize: Number(state.settings.simplifiedMinSize ?? 0.02) }) };
  simpleCache.set(c.id, { key, value });
  return value;
}

/** Sets the simplified representation of the chosen components ('' = full). */
function setSimplified(mode) {
  const asm = activeAssembly();
  const ids = state.selection.filter((s) => s.kind === 'comp').map((s) => s.id);
  if (!asm || !ids.length) { notify('info', t('simp.pick')); return; }
  change('op.simplified', () => { for (const c of asm.components) if (ids.includes(c.id)) { if (mode) c.simplified = mode; else delete c.simplified; } });
  notify('success', t(mode ? `simp.done.${mode}` : 'simp.done.full', { count: ids.length }));
}

const xpBoxes = new Map();
/** Each component's centre in its own frame (the middle of its box, through a sub-assembly's parts): explode steps turn about it and radial ones move it out. */
function explodeCenters(asm) {
  const out = new Map();
  for (const c of asm?.components ?? []) {
    const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
    for (const leaf of componentLeaves(c)) {
      const part = project().parts.find((p) => p.id === leaf.part);
      let entry; try { entry = part && buildPart(part); } catch { entry = null; }
      if (!entry?.body) continue;
      const k = entryUid(entry);
      let b = xpBoxes.get(k);
      if (!b) { try { b = entry.body.boundingBox.bounds; } catch { continue; } xpBoxes.set(k, b); if (xpBoxes.size > 500) xpBoxes.delete(xpBoxes.keys().next().value); }
      for (let m = 0; m < 8; m++) {
        const p = placePoint(leaf.placement, [b[m & 1][0], b[(m >> 1) & 1][1], b[(m >> 2) & 1][2]]);
        for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
      }
    }
    if (lo[0] <= hi[0]) out.set(c.id, [0, 1, 2].map((i) => (lo[i] + hi[i]) / 2));
  }
  return out;
}

/** A component's centre in the world where the explode steps so far put it. */
function placedCenter(asm, id, centers = explodeCenters(asm)) {
  const c = asm.components.find((x) => x.id === id);
  if (!c) return null;
  const pl = asm.explode?.on ? explodedPlacement(asm, c, 1, { centers }) : c;
  return placePoint(pl, centers.get(id) ?? [0, 0, 0]);
}

/** Plays the explode (collapsed → exploded) or the collapse, the steps one after the other; resolves at the end. */
function animateExplode() {
  const asm = activeAssembly();
  const n = asm?.explode?.steps?.length ?? 0;
  if (!n) { notify('info', t('xp.noSteps')); return Promise.resolve(false); }
  const out = !asm.explode.on;
  const total = Math.min(6000, 700 * n);
  const t0 = performance.now();
  state.explodeCentersNow = explodeCenters(asm);
  return new Promise((resolve) => {
    const frame = () => {
      const k = Math.min(1, (performance.now() - t0) / total);
      state.explodeProgress = out ? k * n : (1 - k) * n;
      try { showExplodeProgress(asm); } catch { /* shown at the end */ }
      if (k < 1) { requestAnimationFrame(frame); return; }
      state.explodeProgress = null;
      state.explodeCentersNow = null;
      // Another command may have removed the explode meanwhile.
      if (asm.explode) change('op.explode', () => { asm.explode.on = out; });
      notify('info', t(out ? 'notice.exploded' : 'notice.collapsed'));
      resolve(true);
    };
    requestAnimationFrame(frame);
  });
}

function showExplodeProgress(asm) {
  for (const c of asm.components) {
    if (c.hidden || c.suppressed) continue;
    const placed = displayPlacement(asm, c);
    for (const leaf of componentLeaves(c)) {
      const key = leaf.path.length ? `comp:${c.id}/${leaf.path.join('/')}` : `comp:${c.id}`;
      viewport.setBodyMatrix(key, componentMatrix(leaf.path.length ? composePlacement(placed, leaf.placement) : placed));
    }
  }
}

/** The explode lines of an exploded assembly (dashed, the paths its parts take). */
function explodeLineSpecs(asm) {
  if (!asm?.explode?.on || asm.explode.lines === false || !asm.explode.steps?.length) return [];
  const segs = [];
  for (const l of explodeLines(asm, explodeCenters(asm))) for (let i = 1; i < l.points.length; i++) segs.push(...l.points[i - 1], ...l.points[i]);
  return segs.length ? [{ segments: segs, color: '#d9822b', width: 1.4, dashed: true, dashSize: 4, gapSize: 3 }] : [];
}

function displayPlacement(asm, c) {
  if (state.motionPose?.has(c.id)) return state.motionPose.get(c.id);
  if (state.explodeProgress != null && asm.explode?.steps?.length) return explodedPlacement(asm, c, 1, { centers: state.explodeCentersNow ?? explodeCenters(asm), progress: state.explodeProgress });
  return asm.explode?.on ? explodedPlacement(asm, c, 1, { centers: explodeCenters(asm) }) : c;
}

const IDENTITY = { position: [0, 0, 0], rotation: [0, 0, 0, 1] };

/** The parts a component stands for: itself, or every part of its sub-assembly (placed in the component). */
function componentLeaves(c) {
  if (!c.sub) return [{ path: [], part: c.part, placement: IDENTITY }];
  const sub = project()?.assemblies.find((a) => a.id === c.sub);
  if (!sub) return [];
  return flattenAssembly(project(), sub, undefined, [], new Set(), c.flexible ? c.flexPose ?? null : null).map((x) => ({ path: x.path, part: x.part, placement: x.placement }));
}

function subassemblyLeaf(comp, path) {
  return componentLeaves(comp).find((x) => x.path.join('/') === path.join('/')) ?? null;
}

const cutBuilds = new Map();
/**
 * A part of a component with the assembly cuts (asm-extra.js) taken out, in the part's own frame: an entry like
 * buildPart's (body, mesh, faces, edgeList, faceIndex, edgeIndex, key) so the cut faces show, pick and take
 * mates; null when no assembly feature acts on it. `leaf` as componentLeaves gives (default: the component's part).
 */
/** A component's part built in the configuration the instance uses (its own build slot per configuration). */
function componentBuild(c, part) {
  const cfg = c?.config;
  if (!cfg || !(part.configurations ?? []).some((x) => x.id === cfg)) return buildPart(part);
  return buildPart({ ...part, config: cfg }, { slot: `cfg:${cfg}` });
}

function componentCut(c, leaf = null) {
  const p = project();
  const asm = p?.assemblies.find((a) => a.components.includes(c));
  if (!asm || !kernelReady()) return null;
  const lf = leaf ?? { path: [], part: c.part, placement: IDENTITY };
  const cuts = leafCutFeatures(p, asm, c, lf.path);
  if (!cuts.length) return null;
  const part = p.parts.find((x) => x.id === lf.part);
  const entry = part && (lf.path.length ? buildPart(part) : componentBuild(c, part));
  if (!entry?.body) return null;
  const pl = composePlacement(c, lf.placement);
  const size = assemblySize(asm);
  const key = `${entry.key}|cut|${JSON.stringify([pl.position, pl.rotation, size, cuts.map((x) => [x.f, x.frame.position, x.frame.rotation])])}`;
  if (!cutBuilds.has(key)) {
    if (cutBuilds.size > 60) cutBuilds.clear();
    let out = null;
    try { const body = cutLeafBody(entry.body, pl, cuts, size); out = { ...tessellate(body), body, key, cut: true }; } catch { out = null; }
    cutBuilds.set(key, out);
  }
  return cutBuilds.get(key);
}

/** Placed solids of a component (sub-assemblies give one per part), with the assembly cuts taken out. */
function componentShapes(c) {
  const out = [];
  for (const leaf of componentLeaves(c)) {
    const part = project().parts.find((p) => p.id === leaf.part);
    const b = part && (componentCut(c, leaf) ?? (leaf.path.length ? buildPart(part) : componentBuild(c, part)));
    if (!b?.body) continue;
    const pl = composePlacement(c, leaf.placement);
    out.push({ shape: placeShape(b.body, pl), part, key: `${b.key}|${JSON.stringify([pl.position, pl.rotation])}` });
  }
  return out;
}

function assemblyContains(a, id, seen = new Set()) {
  if (!a || !id || seen.has(a.id)) return false;
  seen.add(a.id);
  return a.components.some((c) => c.sub && (c.sub === id || assemblyContains(project().assemblies.find((x) => x.id === c.sub), id, seen)));
}

function insertSubassembly(id) {
  const asm = activeAssembly();
  const sub = project().assemblies.find((a) => a.id === id);
  if (!asm || !sub || sub.id === asm.id || assemblyContains(sub, asm.id)) { notify('error', t('notice.subCycle')); return; }
  const first = asm.components.length === 0;
  const c = { id: newId('cmp'), sub: sub.id, name: instanceName(asm, sub.name, sub.id), position: first ? [0, 0, 0] : [assemblySize(asm) * 0.8, 0, 0], rotation: quatIdentity(), fixed: first };
  state.selection = [{ kind: 'comp', id: c.id, key: `comp:${c.id}` }];
  change('op.insertComponent', () => { asm.components.push(c); });
  autoMateByReferences(asm, c);
  notify('success', t('notice.componentInserted', { name: c.name }));
  fitView();
}

// ───────────────────────── sheet metal, weldments

function toggleFlatten() {
  const part = activePart();
  if (!part) return;
  if (!part.features.some((f) => f.type === 'baseFlange' || f.type === 'loftedBend')) { notify('info', t('notice.needBaseFlange')); return; }
  change('op.flatten', () => { part.flat = !part.flat; });
  notify('info', t(part.flat ? 'notice.flattened' : 'notice.formed'));
  fitView();
}

async function showCutList() {
  const part = activePart();
  if (!part) return;
  const entry = buildPart(part);
  // Members (with their trimmed / extended lengths), end caps, gussets and weld beads.
  const { rows, memberTotal } = weldmentCutRows(part, entry.result.results, { t, fmtLen });
  if (!rows.length) { notify('info', t('notice.noMembers')); return; }
  if (memberTotal > 0) rows.push(['massProps', t('weld.total'), fmtLen(memberTotal)]);
  await popups.open('massprops', { name: `${part.name} — ${t('cmd.cutList')}`, material: '', rows, kind: 'part' });
}

/** The weld beads of a drawing's model: [{ size, length, count, volume, cosmetic }] (part features or assembly welds). */
function modelWeldBeads(d) {
  const out = [];
  if (d.source?.kind === 'part') {
    const part = project().parts.find((p) => p.id === d.source.id);
    const results = part ? buildPart(part).result?.results : null;
    for (const f of part?.features ?? []) {
      const w = f.type === 'weldBead' && !f.suppressed ? results?.get(f.id)?.weld : null;
      if (w) out.push({ size: w.size, length: w.length, count: w.count, cosmetic: w.cosmetic, volume: w.cosmetic ? 0 : w.volume ?? 0.5 * w.size * w.size * w.length });
    }
  } else if (d.source?.kind === 'assembly') {
    const a = project().assemblies?.find((x) => x.id === d.source.id);
    for (const w of (a?.welds ?? []).filter((x) => !x.suppressed)) {
      try { const g = awTools.geometry(w); out.push({ size: Number(w.size), length: g.length, count: w.a.edges?.length ?? 1, cosmetic: false, volume: g.volume }); } catch { /* a weld that cannot be made is left out */ }
    }
  }
  return out;
}

/**
 * A weld table (the drawing's weld symbols, alike ones counted together) or a weldment cut list table (members,
 * end caps, gussets, beads of the drawn part) as a general table on the sheet, top left of the title block.
 */
function drawingTable(kind) {
  const d = activeDrawing();
  if (!d) return;
  let header; let rows;
  if (kind === 'weld') {
    const welds = (d.annotations ?? []).filter((a) => a.kind === 'drwWeld');
    // The model's weld beads too: the drawn part's Weld Bead features, or the drawn assembly's welds (fillets of
    // leg z): one row per size, its total length, bead count and deposited volume.
    const beads = modelWeldBeads(d);
    if (!welds.length && !beads.length) { notify('info', t('notice.noWelds')); return; }
    const groups = new Map();
    for (const w of welds) { const key = [w.symbol, w.size, w.length, w.allAround ? 1 : 0].join('|'); const g = groups.get(key) ?? { w, qty: 0 }; g.qty += 1; groups.set(key, g); }
    header = [t('weldTable.no'), t('weldTable.type'), t('weldTable.size'), t('weldTable.length'), t('weldTable.qty'), t('weldTable.volume')];
    rows = [...groups.values()].map(({ w, qty }) => [t(`drwWeld.sym.${w.symbol}`, null, w.symbol), String(w.size ?? ''), w.allAround ? t('weldTable.allAround') : String(w.length || '—'), String(qty), '—']);
    const bySize = new Map();
    for (const b of beads) { const key = `${b.size}|${b.cosmetic ? 1 : 0}`; const g = bySize.get(key) ?? { size: b.size, cosmetic: b.cosmetic, length: 0, count: 0, volume: 0 }; g.length += b.length; g.count += b.count; g.volume += b.volume; bySize.set(key, g); }
    for (const g of bySize.values()) rows.push([`${t('drwWeld.sym.fillet', null, 'fillet')}${g.cosmetic ? ` (${t('weldTable.cosmetic')})` : ''}`, `z${fmt(g.size)}`, fmtLen(g.length), String(g.count), g.cosmetic ? '—' : `${fmt(g.volume)} mm³`]);
    rows = rows.map((r, i) => [String(i + 1), ...r]);
  } else {
    const part = project().parts.find((p) => p.id === d.source?.id);
    if (!part || !hasWeldments(part)) { notify('info', t('notice.noMembers')); return; }
    const { rows: cut } = weldmentCutRows(part, buildPart(part).result.results, { t, fmtLen });
    if (!cut.length) { notify('info', t('notice.noMembers')); return; }
    header = [t('weldTable.no'), t('cutTable.item'), t('cutTable.value')];
    rows = cut.map((r, i) => [String(i + 1), String(r[1] ?? ''), String(r[2] ?? '')]);
  }
  const cells = [header, ...rows];
  const cols = header.length;
  const a = createTable({ id: newId('tbl'), x: 20, y: 20, rows: cells.length, cols, title: t(kind === 'weld' ? 'cmd.weldTable' : 'cmd.cutListTable') });
  a.cells = cells;
  a.colW = header.map((_, c) => Math.max(14, Math.min(70, Math.max(...cells.map((r) => String(r[c]).length)) * 2.2 + 4)));
  a.auto = kind;
  change('op.annotation', () => { d.annotations = [...(d.annotations ?? []).filter((x) => !(x.kind === 'drwTable' && x.auto === kind)), a]; });
  state.drawingSelected = a.id;
  notify('success', t('notice.tableAdded'));
}

// ───────────────────────── equations, configurations, design tables

function startEquations(mode = 'equations') {
  const part = activePart();
  if (!part && !(mode === 'configs' && activeAssembly())) { notify('info', t('notice.partOnly')); return; }
  if (state.editing) cancelEditing({ quiet: true });
  state.editing = { mode };
  state.leftTab = 'pm';
  renderAll();
}

async function exportDesignTable() {
  const part = activePart();
  if (!part) return;
  await saveExport(`${fileSafe(part.name)}-design-table.csv`, 'csv', designTableCsv(part, t('config.default')), 'text/csv');
}

/** The text of a file the user picks ({ name, extensions }), or null when cancelled or unreadable. */
async function readPickedText(filter) {
  try {
    if (desktop) {
      const [path] = await native.chooseFiles(state.settings.lastDirectory, [filter], false);
      return path ? await native.readTextFile(path, '') : null;
    }
    const [file] = await native.pickWithInput(filter.extensions.map((x) => `.${x}`).join(','), false);
    return file ? await file.text() : null;
  } catch (error) { showError('error.import', error); return null; }
}

async function importDesignTable() {
  const part = activePart();
  if (!part) return;
  let text = null;
  try {
    if (desktop) {
      const [path] = await native.chooseFiles(state.settings.lastDirectory, [{ name: 'CSV', extensions: ['csv', 'txt'] }], false);
      if (path) text = await native.readTextFile(path, '');
    } else {
      const [file] = await native.pickWithInput('.csv,.txt', false);
      if (file) text = await file.text();
    }
  } catch (error) { showError('error.import', error); return; }
  if (text == null) return;
  try {
    let info;
    change('op.designTable', () => { info = applyDesignTable(part, String(text)); });
    notify('success', t('notice.designTable', { configs: info.configs, variables: info.variables }));
  } catch (error) { showError('error.import', error); }
}

const textInput = (key, value, cls = '') => `<input type="text" class="pm-text ${cls}" data-pm-field="${escapeHtml(key)}" value="${escapeHtml(value ?? '')}" spellcheck="false"/>`;
const pmButton = (cmd, glyph, label, cls = '') => `<button class="small-button ${cls}" data-pm="${escapeHtml(cmd)}" title="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span></button>`;
const pmGroup = (glyph, title, body) => `<section class="pm-group"><h4>${icon(glyph)}<span>${escapeHtml(title)}</span></h4><div class="pm-group-body">${body}</div></section>`;
const pmHead = (glyph, title, help) => `<div class="pm-head"><div class="pm-title">${icon(glyph)}<b>${escapeHtml(title)}</b></div><div class="pm-buttons"><button class="pm-ok" data-pm="ok" title="${escapeHtml(t('pm.ok'))}">${icon('check')}</button><button class="pm-cancel" data-pm="cancel" title="${escapeHtml(t('pm.close'))}">${icon('close')}</button></div>${help ? `<p class="pm-help">${icon('info', 'icon tiny')}<span>${escapeHtml(help)}</span></p>` : ''}</div>`;
const pmNum = (key, value, label, glyph = 'smartDim', unit = '', step = '') => `<label class="pm-field" title="${escapeHtml(label)}">${icon(glyph)}<span class="pm-label">${escapeHtml(label)}</span><input type="text" data-pm-field="${escapeHtml(key)}" data-num data-unit-label="${escapeHtml(unit)}" ${step ? `data-num-step="${step}"` : ''} value="${escapeHtml(String(value))}" spellcheck="false"/></label>`;
const pmSeg = (key, options, current) => `<span class="segmented pm-seg" role="radiogroup">${options.map(([v, label, glyph]) => `<button type="button" class="segment ${String(v) === String(current) ? 'active' : ''}" data-pm-set="${escapeHtml(key)}" data-value="${escapeHtml(v)}" title="${escapeHtml(label)}">${icon(glyph || segGlyph(key, v))}<span>${escapeHtml(label)}</span></button>`).join('')}</span>`;
const pmList = (key, items, label, glyph, active) => `<div class="pm-pick ${active ? 'active' : ''}" data-pm-pick="${escapeHtml(key)}" tabindex="0"><div class="pm-pick-head">${icon(glyph)}<span>${escapeHtml(label)}</span><span class="grow"></span><span class="pm-count">${items.length}</span>${items.length ? `<button type="button" class="icon-button" data-pm="clear:${escapeHtml(key)}" title="${escapeHtml(t('pm.clear'))}">${icon('trash', 'icon tiny')}</button>` : ''}</div><ul class="pm-pick-list">${items.length ? items.map((it) => `<li>${icon(glyph, 'icon tiny')}<span>${escapeHtml(it)}</span></li>`).join('') : `<li class="muted">${escapeHtml(t(active ? 'pm.pickNow' : 'pm.clickToPick'))}</li>`}</ul></div>`;

/** PropertyManager pages that are not features: equations, configurations, simulation, motion study. */
function customPm(e) {
  const part = activePart();
  if (more.owns(e)) return more.pm(e);
  if (std.owns(e)) return std.pm(e);
  if (e.mode === 'lights') return lightsPm(e);
  if (e.mode === 'equations' && part) {
    const rows = equationRows(part);
    const vars = (part.variables ?? []).map((v, i) => { const r = rows.find((x) => x.kind === 'variable' && x.target === v.name); return `<div class="eq-row ${r?.error ? 'error' : ''}">${textInput(`varName:${i}`, v.name, 'eq-name')}<span>=</span>${textInput(`varExpr:${i}`, v.expr, 'eq-expr')}<output title="${escapeHtml(r?.error ? t(`expr.${r.error}`, null, r.error) : '')}">${r?.error ? icon('error', 'icon tiny') : escapeHtml(fmt(r?.value ?? 0))}</output><button class="icon-button" data-pm="delVar:${i}" title="${escapeHtml(t('action.delete'))}">${icon('trash', 'icon tiny')}</button></div>`; }).join('');
    const driven = rows.filter((r) => r.kind !== 'variable').map((r) => `<li class="${r.error ? 'error' : ''}">${icon(r.kind === 'dimension' ? 'smartDim' : 'editFeature', 'icon tiny')}<span><b>${escapeHtml(r.target)}</b> = ${escapeHtml(r.expr)} → ${r.error ? escapeHtml(t(`expr.${r.error}`, null, r.error)) : escapeHtml(fmt(r.value ?? 0))}</span><button class="icon-button" data-pm="delExpr:${escapeHtml(r.kind === 'dimension' ? `${r.id}|${r.cid}` : `${r.id}|${r.key}`)}" title="${escapeHtml(t('pm.removeEquation'))}">${icon('trash', 'icon tiny')}</button></li>`).join('');
    return [
      pmHead('equations', t('cmd.equations'), t('pm.help.equations')),
      pmGroup('equations', t('eq.globals'), `<div class="eq-table">${vars || `<p class="pm-note">${escapeHtml(t('eq.none'))}</p>`}</div><div class="pm-row">${pmButton('addVar', 'plus', t('eq.addVariable'))}</div>`),
      pmGroup('smartDim', t('eq.driven'), driven ? `<ul class="pm-list">${driven}</ul>` : `<p class="pm-note">${escapeHtml(t('eq.howToDrive'))}</p>`),
      pmGroup('designTable', t('cmd.designTable'), `<div class="pm-row">${pmButton('exportTable', 'exportFile', t('cmd.exportTable'))}${pmButton('importTable', 'folderOpen', t('cmd.importTable'))}</div>`),
    ].join('');
  }
  if (e.mode === 'configs' && !part && activeAssembly()) {
    const asm = activeAssembly();
    const cur = asm.config ?? '';
    const list = [{ id: '', name: t('config.default') }, ...(asm.configurations ?? [])];
    const rows = list.map((c) => `<div class="cfg-row ${cur === c.id ? 'active' : ''}"><button class="icon-button" data-pm-set="asmConfig" data-value="${escapeHtml(c.id)}" title="${escapeHtml(t('config.activate'))}">${icon(cur === c.id ? 'check' : 'configurations')}</button><span>${escapeHtml(c.name)}</span>${c.id ? `<button class="icon-button" data-pm="delAsmCfg:${escapeHtml(c.id)}" title="${escapeHtml(t('config.delete'))}">${icon('trash')}</button>` : ''}</div>`).join('');
    // Per component: suppressed, hidden, and the part configuration it uses.
    const comps = asm.components.map((c) => {
      const part = c.part != null ? project().parts.find((p) => p.id === c.part) : null;
      const cfgs = part?.configurations ?? [];
      const pick = cfgs.length ? `<select data-pm-select="acc:${escapeHtml(c.id)}" aria-label="${escapeHtml(t('config.partConfig'))}">${[['', t('config.default')], ...cfgs.map((x) => [x.id, x.name])].map(([v, l]) => `<option value="${escapeHtml(v)}" ${(c.config ?? '') === v ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select>` : '';
      return `<div class="cfg-comp"><span class="cfg-name">${icon('part', 'icon tiny')}${escapeHtml(c.name)}</span><label class="pm-check" title="${escapeHtml(t('config.suppress'))}"><input type="checkbox" data-pm-toggle="acs:${escapeHtml(c.id)}" ${c.suppressed ? 'checked' : ''}/>${icon('suppress', 'icon tiny')}</label><label class="pm-check" title="${escapeHtml(t('config.hide'))}"><input type="checkbox" data-pm-toggle="ach:${escapeHtml(c.id)}" ${c.hidden ? 'checked' : ''}/>${icon('eye', 'icon tiny')}</label>${pick}</div>`;
    }).join('');
    const mates = (asm.mates ?? []).map((m) => `<label class="pm-check"><input type="checkbox" data-pm-toggle="acm:${escapeHtml(m.id)}" ${m.suppressed ? '' : 'checked'}/>${icon('mate', 'icon tiny')}<span>${escapeHtml(m.name ?? t(`mate.${m.type}`))}</span></label>`).join('');
    return [
      pmHead('configurations', t('cmd.configurations'), t('pm.help.asmConfigurations')),
      pmGroup('configurations', t('config.list'), `${rows}<div class="pm-row">${pmButton('addAsmCfg', 'plus', t('config.add'))}</div>`),
      pmGroup('part', t('config.components', { name: list.find((c) => c.id === cur)?.name ?? '' }), comps || `<p class="pm-note">${escapeHtml(t('config.noComponents'))}</p>`),
      mates ? pmGroup('mate', t('config.mates'), mates) : '',
    ].join('');
  }
  if (e.mode === 'configs' && part) {
    const cfg = activeConfiguration(part);
    const list = [{ id: '', name: t('config.default') }, ...(part.configurations ?? [])];
    const rows = list.map((c) => `<div class="cfg-row ${(cfg?.id ?? '') === c.id ? 'active' : ''}"><button class="icon-button" data-pm-set="activeConfig" data-value="${escapeHtml(c.id)}" title="${escapeHtml(t('config.activate'))}">${icon((cfg?.id ?? '') === c.id ? 'check' : 'configurations')}</button>${c.id ? textInput(`cfgName:${c.id}`, c.name) : `<span class="cfg-name">${escapeHtml(c.name)}</span>`}${c.id ? `<button class="icon-button" data-pm="delCfg:${escapeHtml(c.id)}" title="${escapeHtml(t('action.delete'))}">${icon('trash', 'icon tiny')}</button>` : ''}</div>`).join('');
    const overrides = cfg && part.variables?.length ? pmGroup('equations', t('config.values', { name: cfg.name }), part.variables.map((v) => `<div class="eq-row"><span class="eq-name">${escapeHtml(v.name)}</span><span>=</span>${textInput(`cfgVar:${v.name}`, cfg.variables?.[v.name] ?? v.expr, 'eq-expr')}</div>`).join('')) : '';
    const suppressed = cfg ? Object.entries(cfg.suppress ?? {}).filter(([, v]) => v).map(([id]) => part.features.find((f) => f.id === id)?.name).filter(Boolean) : [];
    return [
      pmHead('configurations', t('cmd.configurations'), t('pm.help.configurations')),
      pmGroup('configurations', t('config.list'), `${rows}<div class="pm-row">${pmButton('addCfg', 'plus', t('config.add'))}</div>`),
      overrides,
      cfg ? pmGroup('suppress', t('config.suppressed'), suppressed.length ? `<ul class="pm-list">${suppressed.map((n) => `<li>${icon('suppress', 'icon tiny')}<span>${escapeHtml(n)}</span></li>`).join('')}</ul>` : `<p class="pm-note">${escapeHtml(t('config.howToSuppress'))}</p>`) : '',
      pmGroup('designTable', t('cmd.designTable'), `<div class="pm-row">${pmButton('exportTable', 'exportFile', t('cmd.exportTable'))}${pmButton('importTable', 'folderOpen', t('cmd.importTable'))}</div>`),
    ].join('');
  }
  if (e.mode === 'simulation' && part) {
    const mat = materialOf(part.material);
    const faceName = (x, i) => `${t('pm.face')} ${i + 1} (${x.type === 'PLANE' ? t('pm.planar') : t('pm.curved')})`;
    const r = e.result;
    const res = r ? pmGroup('simulation', t('sim.results'), `<dl class="pm-results">
        <dt>${escapeHtml(t('sim.maxStress'))}</dt><dd>${escapeHtml(`${fmt(r.maxStress, 2)} MPa`)}</dd>
        <dt>${escapeHtml(t('sim.maxDisp'))}</dt><dd>${escapeHtml(`${fmt(r.maxDisplacement, 4)} mm`)}</dd>
        <dt>${escapeHtml(t('sim.fos'))}</dt><dd class="${r.minFactorOfSafety < 1 ? 'error' : ''}">${escapeHtml(fmt(r.minFactorOfSafety, 2))}</dd>
        <dt>${escapeHtml(t('sim.elements'))}</dt><dd>${escapeHtml(`${r.elements} (${fmt(r.elementSize, 2)} mm)`)}</dd>
        <dt>${escapeHtml(t('sim.iterations'))}</dt><dd>${escapeHtml(String(r.iterations))}</dd></dl>
        <div class="sim-legend"><span>0</span><i></i><span>${escapeHtml(`${fmt(state.sim?.top ?? r.maxStress, 1)} MPa`)}</span></div>
        <label class="pm-check"><input type="checkbox" data-pm-toggle="deformed" ${state.sim?.deformed ? 'checked' : ''}/>${icon('simulation')}<span>${escapeHtml(t('sim.deformed'))}</span></label>
        <div class="pm-row">${pmButton('clearSim', 'trash', t('sim.clear'))}</div>`) : '';
    const study = pmGroup('simulation', t('sim.study'), pmSeg('study', [['static', t('sim.static')], ['thermal', t('sim.thermal')], ['modal', t('sim.modal')], ...more.studyOptions()], e.study));
    if (more.simStudy(e.study)) return more.simPm(e, study);
    if (e.study === 'thermal') {
      const tr = e.result && state.sim?.study === 'thermal' ? pmGroup('simulation', t('sim.results'), `<dl class="pm-results"><dt>${escapeHtml(t('sim.tMin'))}</dt><dd>${escapeHtml(`${fmt(r.min, 2)} °C`)}</dd><dt>${escapeHtml(t('sim.tMax'))}</dt><dd>${escapeHtml(`${fmt(r.max, 2)} °C`)}</dd><dt>${escapeHtml(t('sim.heatFlow'))}</dt><dd>${escapeHtml(`${fmt(r.heatFlowOut ?? 0, 3)} W`)}</dd>${r.radiationOut ? `<dt>${escapeHtml(t('sim.radiated'))}</dt><dd>${escapeHtml(`${fmt(r.radiationOut, 3)} W`)}</dd>` : ''}<dt>${escapeHtml(t('sim.elements'))}</dt><dd>${escapeHtml(String(r.elements))}</dd></dl><div class="sim-legend"><span>${escapeHtml(`${fmt(r.min, 1)} °C`)}</span><i></i><span>${escapeHtml(`${fmt(r.max, 1)} °C`)}</span></div><div class="pm-row">${pmButton('clearSim', 'trash', t('sim.clear'))}</div>`) : '';
      return [
        pmHead('simulation', t('cmd.simulation'), t('pm.help.thermal')), study,
        pmGroup('fixture', t('sim.temperatures'), `${pmList('fixtures', e.fixtures.map(faceName), t('sim.fixedTempFaces'), 'fixture', e.pick === 'fixtures')}${pmNum('temperature', e.temperature, `${t('sim.temperature')} (°C)`, 'sun')}`),
        pmGroup('load', t('sim.heat'), `${pmSeg('heatKind', [['convection', t('sim.convection')], ['radiation', t('sim.radiation')], ['power', t('sim.heatPower')]], e.heatKind)}${pmList('loads', e.loads.map(faceName), t('sim.heatFaces'), 'load', e.pick === 'loads')}${e.heatKind === 'power' ? pmNum('power', e.power, `${t('sim.heatPower')} (W)`, 'load') : e.heatKind === 'radiation' ? `${pmNum('emissivity', e.emissivity ?? 0.9, t('sim.emissivity'), 'sun')}${pmNum('ambient', e.ambient, `${t('sim.ambient')} (°C)`, 'sun')}<p class="pm-note">${escapeHtml(t('sim.radiationNote'))}</p>` : `${pmNum('h', e.h, t('sim.filmCoefficient'), 'load')}${pmNum('ambient', e.ambient, `${t('sim.ambient')} (°C)`, 'sun')}`}`),
        more.fem ? more.fem.meshGroup(e) : pmGroup('statistics', t('sim.mesh'), `${pmNum('resolution', e.resolution, t('sim.resolution'), 'statistics')}<div class="pm-row">${pmButton('runSim', 'play', t('sim.run'), 'primary')}</div>`),
        tr, more.fem?.resultTools(e) ?? '',
      ].join('');
    }
    if (e.study === 'modal') {
      const freqs = e.result?.frequencies ?? [];
      const mr = freqs.length ? pmGroup('simulation', t('sim.frequencies'), `<div class="pm-relations">${freqs.map((f, i) => `<button class="small-button ${e.modeIndex === i ? 'active' : ''}" data-pm-set="modeIndex" data-value="${i}">${icon('simulation')}<span>${escapeHtml(`${i + 1}: ${fmt(f, 1)} Hz`)}</span></button>`).join('')}</div><div class="pm-row">${pmButton('clearSim', 'trash', t('sim.clear'))}</div>`) : '';
      return [
        pmHead('simulation', t('cmd.simulation'), t('pm.help.modal')), study,
        pmGroup('material', t('sim.material'), `<p class="pm-note">${escapeHtml(`${materialName(part.material, lang())} · E ${mat.E} GPa · ρ ${mat.density} kg/m³`)}</p>${pmNum('nu', e.nu, t('sim.poisson'))}`),
        pmGroup('fixture', t('sim.fixtures'), `${more.fem?.fixtureKinds(e) ?? ''}${pmList('fixtures', e.fixtures.map(more.fem?.faceItem ?? faceName), t('sim.fixedFaces'), 'fixture', e.pick === 'fixtures')}`),
        pmGroup('simulation', t('sim.modeCount'), pmNum('modes', e.modes, t('sim.modeCount'), 'simulation')),
        more.fem ? more.fem.meshGroup(e) : pmGroup('statistics', t('sim.mesh'), `${pmNum('resolution', e.resolution, t('sim.resolution'), 'statistics')}<div class="pm-row">${pmButton('runSim', 'play', t('sim.run'), 'primary')}</div>`),
        mr, more.fem?.resultTools(e) ?? '',
      ].join('');
    }
    return [
      pmHead('simulation', t('cmd.simulation'), t('pm.help.simulation')),
      study,
      pmGroup('material', t('sim.material'), `<p class="pm-note">${escapeHtml(`${materialName(part.material, lang())} · E ${mat.E} GPa · σy ${mat.yield} MPa`)}</p>${pmNum('nu', e.nu, t('sim.poisson'))}`),
      pmGroup('fixture', t('sim.fixtures'), `${more.fem?.fixtureKinds(e) ?? ''}${pmList('fixtures', e.fixtures.map(more.fem?.faceItem ?? faceName), t('sim.fixedFaces'), 'fixture', e.pick === 'fixtures')}`),
      pmGroup('load', t('sim.loads'), `${pmSeg('loadKind', more.fem ? more.fem.loadKinds(e) : [['force', t('sim.force')], ['pressure', t('sim.pressure')]], e.loadKind)}${(more.fem ? more.fem.bodyLoad(e.loadKind) : e.loadKind === 'gravity') ? '' : pmList('loads', e.loads.map(faceName), t('sim.loadFaces'), 'load', e.pick === 'loads')}${pmNum('magnitude', e.magnitude, more.fem ? more.fem.loadLabel(e) : e.loadKind === 'pressure' ? `${t('sim.pressure')} (MPa)` : `${t('sim.force')} (N)`, 'load')}${(more.fem ? more.fem.loadHasDir(e) : e.loadKind !== 'pressure') ? pmSeg('dir', Object.keys(LOAD_DIRS).map((k) => [k, k.toUpperCase()]), e.dir) : ''}${more.fem?.loadExtras(e) ?? ''}`),
      e.study === 'static' && more.fem ? more.fem.connectorGroup(e) : '',
      more.fem ? more.fem.meshGroup(e) : pmGroup('statistics', t('sim.mesh'), `${pmNum('resolution', e.resolution, t('sim.resolution'), 'statistics')}<div class="pm-row">${pmButton('runSim', 'play', t('sim.run'), 'primary')}</div>`),
      res, more.fem?.resultTools(e) ?? '',
    ].join('');
  }
  if (e.mode === 'motion') {
    const asm = activeAssembly();
    const motors = asm?.motion?.motors ?? [];
    const duration = asm?.motion?.duration ?? 5;
    const mtype = motionType(asm);
    const typeSeg = pmGroup('motion', t('motion.studyType'), pmSeg('mtype', [['motors', t('motion.typeMotors'), 'motor'], ['keyframe', t('motion.typeKeyframe'), 'keyframe'], ['physics', t('motion.typePhysics'), 'physics']], mtype));
    const clock = pmGroup('clock', t('motion.study'), `${pmNum('duration', duration, t('motion.duration'), 'clock')}<label class="pm-field"><span class="pm-label">${escapeHtml(t('motion.time'))}</span><input type="range" data-unit="s" data-motion-time min="0" max="${duration}" step="0.01" value="${e.time}"/><output data-motion-clock>${escapeHtml(`${fmt(e.time, 2)} s`)}</output></label><div class="pm-row">${e.playing ? pmButton('stopMotion', 'stop', t('motion.stop')) : pmButton('playMotion', 'play', t('motion.play'), 'primary')}${pmButton('resetMotion', 'rollback', t('motion.reset'))}</div>`);
    if (mtype === 'keyframe') {
      const keys = asm.motion.keys ?? [];
      const rows = keys.map((k, i) => `<div class="cfg-row"><button class="icon-button" data-pm="goKey:${i}" title="${escapeHtml(t('kf.goTo'))}">${icon('keyframe')}</button><span>${escapeHtml(`${fmt(k.time, 2)} s · ${t(k.ease === 'smooth' ? 'kf.smooth' : 'kf.linear')}`)}</span><button class="icon-button" data-pm="delKey:${i}" title="${escapeHtml(t('kf.delete'))}">${icon('trash')}</button></div>`).join('');
      return [
        pmHead('motion', t('cmd.motion'), t('pm.help.motion')), typeSeg,
        pmGroup('keyframe', t('kf.keys', { count: keys.length }), `<p class="pm-note">${escapeHtml(t('kf.hint'))}</p>${rows}${pmSeg('keyEase', [['linear', t('kf.linear'), 'lineTool'], ['smooth', t('kf.smooth'), 'spline']], e.keyEase ?? 'linear')}<div class="pm-row">${pmButton('addKey', 'plus', t('kf.add', { time: fmt(e.time, 2) }), 'primary')}</div>`),
        clock,
      ].join('');
    }
    if (mtype === 'physics') {
      const m = asm.motion;
      const springs = m.springs ?? [];
      const gr = m.gravity ?? { on: true, dir: [0, 0, -1], g: 9806.65 };
      const gdir = ['x', 'y', 'z'].flatMap((a) => [`-${a}`, a]).find((k) => { const v = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[k.replace('-', '')].map((x) => (k.startsWith('-') ? -x : x)); return v.every((x, i) => Math.abs(x - (gr.dir?.[i] ?? 0)) < 1e-9); }) ?? '-z';
      const res = dynamicsResult(asm, { run: false });
      return [
        pmHead('motion', t('cmd.motion'), t('pm.help.physics')), typeSeg,
        pmGroup('physics', t('ph.gravity'), `<label class="pm-check"><input type="checkbox" data-pm-toggle="gravityOn" ${gr.on !== false ? 'checked' : ''}/>${icon('arrowDown')}<span>${escapeHtml(t('ph.gravityOn'))}</span></label>${pmSeg('gravityDir', ['-z', 'z', '-y', 'y', '-x', 'x'].map((k) => [k, k.toUpperCase(), 'mkArrow']), gdir)}${pmNum('gravityG', fmt(gr.g ?? 9806.65, 2), t('ph.g'), 'arrowDown', 'mm/s²')}`),
        pmGroup('spring', t('ph.springs', { count: springs.length }), `${springs.map((s, i) => `<div class="cfg-row"><span>${icon('spring')}</span><span>${escapeHtml(`${asm.components.find((c) => c.id === s.a.comp)?.name ?? '?'} ↔ ${asm.components.find((c) => c.id === s.b.comp)?.name ?? '?'}`)}</span><button class="icon-button" data-pm="delSpring:${i}" title="${escapeHtml(t('ph.deleteSpring'))}">${icon('trash')}</button></div>${pmNum(`spk:${i}`, s.k ?? 1, t('ph.k'), 'spring', 'N/mm')}${pmNum(`spc:${i}`, s.c ?? 0, t('ph.c'), 'damper', 'N·s/mm')}${pmNum(`spl:${i}`, fmt(s.length ?? 0, 3), t('ph.freeLength'), 'smartDim', 'mm')}`).join('')}${pmList('spring', (e.springPick ?? []).map((p) => asm.components.find((c) => c.id === p.comp)?.name ?? '?'), t('ph.pickSpring'), 'spring', e.pick === 'spring')}`),
        pmGroup('contact', t('ph.contacts', { count: (m.contacts ?? []).length }), `${(m.contacts ?? []).map((ct, i) => `<div class="cfg-row"><span>${icon('contact')}</span><span>${escapeHtml(`${asm.components.find((c) => c.id === ct.a)?.name ?? '?'} ↔ ${asm.components.find((c) => c.id === ct.b)?.name ?? '?'}`)}</span><button class="icon-button" data-pm="delContact:${i}" title="${escapeHtml(t('ph.deleteContact'))}">${icon('trash')}</button></div>${pmNum(`cte:${i}`, ct.e ?? 0.5, t('ph.restitution'), 'contact')}`).join('')}${pmList('contact', (e.contactPick ?? []).map((id) => asm.components.find((c) => c.id === id)?.name ?? '?'), t('ph.pickContact'), 'contact', e.pick === 'contact')}`),
        pmGroup('motor', t('motion.motors'), `${pmSeg('kind', [['rotary', t('motion.rotary')], ['linear', t('motion.linear')]], e.kind)}${pmNum('speed', e.speed, e.kind === 'rotary' ? t('motion.rpm') : t('motion.mmps'), 'motor')}${pmList('motor', motors.map((mo) => asm.components.find((c) => c.id === mo.comp)?.name ?? '?'), t('motion.motorFace'), 'motor', e.pick === 'motor')}`),
        pmGroup('statistics', t('ph.run'), `<div class="pm-row">${pmButton('runPhysics', 'play', t('ph.calculate'), 'primary')}</div>${res ? physicsPlot(asm, res, e) : `<p class="pm-note">${escapeHtml(t('ph.notRun'))}</p>`}`),
        clock,
      ].join('');
    }
    return [
      pmHead('motion', t('cmd.motion'), t('pm.help.motion')), typeSeg,
      pmGroup('motor', t('motion.motors'), `${pmSeg('kind', [['rotary', t('motion.rotary')], ['linear', t('motion.linear')]], e.kind)}${pmNum('speed', e.speed, e.kind === 'rotary' ? t('motion.rpm') : t('motion.mmps'), 'motor')}${pmList('motor', motors.map((m) => `${asm.components.find((c) => c.id === m.comp)?.name ?? '?'} — ${m.amplitude && m.period ? `${m.oneWay ? '0…' : '±'}${fmt(m.amplitude)}${m.kind === 'rotary' ? '°' : ' mm'} / ${fmt(m.period)} s` : `${fmt(m.speed)} ${m.kind === 'rotary' ? 'rpm' : 'mm/s'}`}`), t('motion.motorFace'), 'motor', e.pick === 'motor')}`),
      pmGroup('clock', t('motion.study'), `${pmNum('duration', duration, t('motion.duration'), 'clock')}<label class="pm-field"><span class="pm-label">${escapeHtml(t('motion.time'))}</span><input type="range" data-unit="s" data-motion-time min="0" max="${duration}" step="0.01" value="${e.time}"/><output data-motion-clock>${escapeHtml(`${fmt(e.time, 2)} s`)}</output></label><div class="pm-row">${e.playing ? pmButton('stopMotion', 'stop', t('motion.stop')) : pmButton('playMotion', 'play', t('motion.play'), 'primary')}${pmButton('resetMotion', 'rollback', t('motion.reset'))}</div>`),
    ].join('');
  }
  return '';
}

function customField(key, raw, v) {
  const e = state.editing;
  const part = activePart();
  if (e.mode === 'simulation' && more.simField?.(e, key, raw, v)) return;
  if (e.mode === 'simulation' && more.fem?.field(e, key, v)) return;
  if (e.mode === 'simulation') { if (v != null && (v > 0 || ['temperature', 'ambient'].includes(key))) { if (key === 'nu') e.nu = Math.min(0.49, v); else if (key === 'emissivity') e.emissivity = Math.min(1, v); else e[key] = v; } renderLeft(); return; }
  if (e.mode === 'motion') {
    const asm = activeAssembly();
    if (v == null) return;
    if (key === 'duration' && v > 0) change('op.motion', () => { asm.motion.duration = v; });
    if (key === 'gravityG' && v >= 0) change('op.motion', () => { asm.motion.gravity = { on: true, dir: [0, 0, -1], ...asm.motion.gravity, g: v }; });
    const [sk, si] = key.split(':');
    const sp = asm.motion.springs?.[Number(si)];
    if (sp && sk === 'spk' && v >= 0) change('op.motion', () => { sp.k = v; });
    if (sp && sk === 'spc' && v >= 0) change('op.motion', () => { sp.c = v; });
    if (sp && sk === 'spl' && v >= 0) change('op.motion', () => { sp.length = v; });
    const ctc = sk === 'cte' ? asm.motion.contacts?.[Number(si)] : null;
    if (ctc) change('op.motion', () => { ctc.e = Math.min(1, Math.max(0, v)); });
    if (key === 'speed') { e.speed = v; change('op.motion', () => { for (const m of asm.motion.motors) m.speed = v; }); }
    return;
  }
  if (!part) return;
  const text = String(raw ?? '').trim();
  const [k, arg] = key.split(':');
  if (k === 'varName' && text && /^[A-Za-z_ㄱ-힝][\wㄱ-힝]*$/.test(text)) change('op.equations', () => { part.variables[Number(arg)].name = text; });
  else if (k === 'varName') { notify('error', t('notice.badName', { text })); renderLeft(); }
  else if (k === 'varExpr' && text) change('op.equations', () => { part.variables[Number(arg)].expr = text; });
  else if (k === 'cfgName' && text) change('op.config', () => { const c = part.configurations.find((x) => x.id === arg); if (c) c.name = text; });
  else if (k === 'cfgVar') change('op.config', () => { const c = activeConfiguration(part); if (c) { c.variables ??= {}; c.variables[arg] = text || part.variables.find((x) => x.name === arg)?.expr; } });
}

function customSet(key, value) {
  const e = state.editing;
  const part = activePart();
  if (e.mode === 'simulation') {
    if (more.simSet(e, key, value)) return undefined;
    if (more.fem?.set(e, key, value)) return undefined;
    if (key === 'modeIndex') { e.modeIndex = Number(value); return showMode(e); }
    if (key === 'study') { e.study = value; e.result = null; state.sim = null; syncView(); return renderLeft(); }
    e[key] = value; if (key === 'loadKind' || key === 'heatKind') e.pick = 'loads'; return renderLeft();
  }
  if (e.mode === 'motion') {
    const asm = activeAssembly();
    if (key === 'mtype') {
      change('op.motion', () => { asm.motion.type = value; if (value === 'keyframe' && !(asm.motion.keys ?? []).length) captureKey(asm, 0); });
      e.pick = value === 'physics' ? 'spring' : 'motor';
      return renderAll();
    }
    if (key === 'gravityDir') { const v = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[value.replace('-', '')].map((x) => (value.startsWith('-') ? -x : x)); change('op.motion', () => { asm.motion.gravity = { on: true, g: 9806.65, ...asm.motion.gravity, dir: v }; }); return renderLeft(); }
    if (key === 'plotKind') { e.plotKind = value; e.plotItem = null; return renderLeft(); }
    e[key] = value; return renderLeft();
  }
  if (key === 'asmConfig' && activeAssembly()) { change('op.config', () => { switchAssemblyConfig(activeAssembly(), value); }); solveAssembly(); return renderAll(); }
  if (key.startsWith('acc:') && activeAssembly()) { const id = key.slice(4); change('op.config', () => { const c = activeAssembly().components.find((x) => x.id === id); if (c) { if (value) c.config = value; else delete c.config; } }); return renderAll(); }
  if (key === 'activeConfig' && part) { change('op.config', () => { part.config = value || null; }); notify('info', t('notice.configActive', { name: activeConfiguration(part)?.name ?? t('config.default') })); }
  return undefined;
}

function customToggle(key, checked) {
  if (state.editing?.mode === 'simulation' && more.fem?.toggle?.(state.editing, key, checked)) return undefined;
  const asm = activeAssembly();
  if (asm && /^ac[shm]:/.test(key)) {
    const id = key.slice(4);
    change('op.config', () => {
      if (key.startsWith('acm:')) { const m = asm.mates.find((x) => x.id === id); if (m) { if (checked) delete m.suppressed; else m.suppressed = true; } return; }
      const c = asm.components.find((x) => x.id === id);
      if (!c) return;
      const prop = key.startsWith('acs:') ? 'suppressed' : 'hidden';
      if (checked) c[prop] = true; else delete c[prop];
    });
    solveAssembly();
    return renderAll();
  }
  if (key === 'gravityOn' && state.editing?.mode === 'motion') { const asm = activeAssembly(); change('op.motion', () => { asm.motion.gravity = { dir: [0, 0, -1], g: 9806.65, ...asm.motion.gravity, on: checked }; }); return renderLeft(); }
  if (key === 'deformed' && state.sim) { state.sim.deformed = checked; syncView(); }
}

// Drop-downs of the custom pages: an assembly configuration's part configuration per component.
function customSelect(key, value) {
  if (key === 'plotItem' && state.editing?.mode === 'motion') { state.editing.plotItem = value; return renderLeft(); }
  // Assembly study: a component's element kind (solid / shell / beam — a mixed mesh).
  if (key?.startsWith('elemKind:') && state.editing?.mode === 'simulation') { const e = state.editing; e.elemKinds ??= {}; e.elemKinds[key.slice(9)] = value; e.result = null; state.asmSim = null; return renderLeft(); }
  return key?.startsWith('acc:') ? customSet(key, value) : undefined;
}

function customCommand(name, arg) {
  const e = state.editing;
  if (e?.mode === 'simulation' && more.simCommand?.(e, name, arg)) return undefined;
  if (more.handles(name)) return more.command(name, arg);
  if (std.handles(name)) return std.command(name, arg);
  if (name === 'addLight') return addLight(arg);
  if (name === 'selLight' && e?.mode === 'lights') { e.selected = arg; syncView(); return renderLeft(); }
  if (name === 'delLight' && e?.mode === 'lights') { change('op.light', (p) => { const L = sceneLights(p); L.lights = L.lights.filter((x) => x.id !== arg); }); if (e.selected === arg) e.selected = null; return renderLeft(); }
  const part = activePart();
  if (e?.mode === 'simulation' && more.fem?.handles(name)) return more.fem.command(name, e, active()?.name ?? '', arg);
  if (name === 'clear' && e?.mode === 'simulation' && more.fem?.clear(e, arg)) return undefined;
  if (name === 'clear' && e?.mode === 'simulation') { e[arg] = []; viewport.setSelection([]); return renderLeft(); }
  if (name === 'clear' && e?.mode === 'motion') { const asm = activeAssembly(); change('op.motion', () => { asm.motion.motors = []; }); return undefined; }
  if (name === 'runSim') return runSimulation();
  if (name === 'clearSim') { state.sim = null; if (e) e.result = null; syncView(); return renderLeft(); }
  if (name === 'addKey' && e?.mode === 'motion') { const asm = activeAssembly(); change('op.motion', () => { captureKey(asm, e.time, e.keyEase ?? 'linear'); if (asm.motion.duration < e.time) asm.motion.duration = e.time; }); notify('success', t('kf.added', { time: fmt(e.time, 2) })); return renderLeft(); }
  if (name === 'delKey' && e?.mode === 'motion') { const asm = activeAssembly(); change('op.motion', () => { asm.motion.keys.splice(Number(arg), 1); }); return renderLeft(); }
  if (name === 'goKey' && e?.mode === 'motion') { const k = activeAssembly().motion.keys?.[Number(arg)]; if (k) { e.time = k.time; showMotionTime(e.time); } return renderLeft(); }
  if (name === 'delContact' && e?.mode === 'motion') { const asm = activeAssembly(); change('op.motion', () => { asm.motion.contacts.splice(Number(arg), 1); }); return renderLeft(); }
  if (name === 'clear' && e?.mode === 'motion' && arg === 'contact') { e.contactPick = []; return renderLeft(); }
  if (name === 'delSpring' && e?.mode === 'motion') { const asm = activeAssembly(); change('op.motion', () => { asm.motion.springs.splice(Number(arg), 1); }); return renderLeft(); }
  if (name === 'runPhysics' && e?.mode === 'motion') {
    const asm = activeAssembly();
    if (!asm.components.some((c) => !c.fixed)) { notify('info', t('ph.nothingMoves')); return undefined; }
    return busy('progress.physics', asm.name, () => dynamicsResult(asm)).then((r) => { notify(r?.ok ? 'success' : 'warning', t(r?.ok ? 'ph.done' : 'ph.unstable', { frames: r?.frames?.length ?? 0 })); e.time = 0; renderAll(); return r; });
  }
  if (name === 'clear' && e?.mode === 'motion' && arg === 'spring') { e.springPick = []; return renderLeft(); }
  if (name === 'playMotion') return playMotion(true);
  if (name === 'stopMotion') return playMotion(false);
  if (name === 'resetMotion') { playMotion(false); e.time = 0; syncView(); return renderLeft(); }
  if (name === 'addVar' && part) { change('op.equations', () => { part.variables ??= []; part.variables.push({ name: nextVariableName(part), expr: '10' }); }); return undefined; }
  if (name === 'delVar' && part) { change('op.equations', () => { part.variables.splice(Number(arg), 1); }); return undefined; }
  if (name === 'delExpr' && part) {
    const [id, k] = arg.split('|');
    change('op.equations', () => {
      const f = part.features.find((x) => x.id === id);
      if (!f) return;
      const c = f.constraints?.find((x) => x.id === k);
      if (c) delete c.expr;
      else if (f.exprs) { delete f.exprs[k]; if (!Object.keys(f.exprs).length) delete f.exprs; }
    });
    return undefined;
  }
  if (name === 'addAsmCfg' && activeAssembly()) { let c; change('op.config', () => { c = addAssemblyConfig(activeAssembly(), `${t('config.name')}${(activeAssembly().configurations?.length ?? 0) + 1}`); }); notify('success', t('notice.configActive', { name: c.name })); return renderAll(); }
  if (name === 'delAsmCfg' && activeAssembly()) { change('op.config', () => { removeAssemblyConfig(activeAssembly(), arg); }); return renderAll(); }
  if (name === 'exportTable') return exportDesignTable();
  if (name === 'importTable') return importDesignTable();
  if (name === 'addCfg' && part) { let c; change('op.config', () => { c = addConfiguration(part, `${t('config.name')}${(part.configurations?.length ?? 0) + 1}`); part.config = c.id; }); notify('success', t('notice.configActive', { name: c.name })); return undefined; }
  if (name === 'delCfg' && part) { change('op.config', () => { part.configurations = part.configurations.filter((c) => c.id !== arg); if (part.config === arg) part.config = null; }); return undefined; }
  return undefined;
}

/** Sketch dimension driven by an equation: double-click a dimension, type "=W". */
function dimensionExpression(sketch, c, text) {
  const part = activePart();
  const vars = variableValues(part).values;
  const value = evaluate(text, (name) => { if (vars.has(name)) return vars.get(name); throw Object.assign(new Error(name), { code: 'unknown' }); });
  c.expr = text;
  return value;
}

// ───────────────────────── sketch tools that work on the selection

async function sketchSelectionCommand(kind) {
  if (!sketching()) return;
  const ed = state.editing.editor;
  if (!ed.selection.length) { notify('info', t('sketch.selectFirst')); return; }
  const ask2 = async (label, value) => { const r = await popups.open('prompt', { title: t(`sketch.tool.${kind}`), label, value }); return r?.value ?? null; };
  let n = 0;
  if (kind === 'offset') {
    // The Offset Entities page: distance and options, applied with Apply (the selection stays picked).
    ed.offsetOpen = true; state.leftTab = 'pm'; renderLeft();
    return;
  } else if (kind === 'mirror') {
    n = ed.mirrorSelection();
    if (!n) { notify('info', t('sketch.needCenterline')); return; }
  } else if (kind === 'linPattern') {
    const text = await ask2(t('sketch.linPatternPrompt'), '20, 0, 3');
    const [dx, dy, count] = String(text ?? '').split(/[,\s]+/).map(Number);
    if (!Number.isFinite(dx) || !(count >= 2)) return;
    n = ed.patternSelection('linear', { dx: dx * UNIT_FACTOR[units()], dy: (dy || 0) * UNIT_FACTOR[units()], count: Math.round(count) });
  } else if (kind === 'cirPattern') {
    const text = await ask2(t('sketch.cirPatternPrompt'), '6, 360');
    const [count, angle] = String(text ?? '').split(/[,\s]+/).map(Number);
    if (!(count >= 2)) return;
    const centre = ed.selection.map((id) => byId(ed.sketch, id)).find((x) => x?.type === 'point') ?? { x: 0, y: 0 };
    n = ed.patternSelection('circular', { cx: centre.x, cy: centre.y, count: Math.round(count), angle: Number.isFinite(angle) ? angle : 360 });
  }
  ed.render();
  renderLeft();
  notify(n ? 'success' : 'info', t(n ? 'sketch.made' : 'sketch.nothingMade', { count: n }));
}

/** Convert entities / intersection curve (from the body before the sketch) and move / copy / rotate / scale of the selection. */
async function sketchMoreCommand(kind) {
  if (!sketching()) return;
  const e = state.editing;
  const ed = e.editor;
  let made = [];
  if (kind === 'convert' || kind === 'intersect' || kind === 'silhouette' || kind === 'silhouetteInternal') {
    const body = buildPart(activePart(), { upTo: e.index, slot: 'sketch' }).body;
    if (!body) { notify('info', t('notice.sketchNeedsBody')); return; }
    try {
      made = kind === 'convert' ? convertEntities(ed.sketch, ed.frame, body)
        : kind === 'intersect' ? intersectionEntities(ed.sketch, ed.frame, body)
          : silhouetteEntities(ed.sketch, ed.frame, body, { mode: kind === 'silhouette' ? 'external' : 'internal' });
    } catch (error) { showError('error.command', error, t(`sketch.tool.${kind}`)); return; }
  } else {
    if (!ed.selection.length) { notify('info', t('sketch.selectFirst')); return; }
    const k = UNIT_FACTOR[units()];
    const prompts = { move: ['sketch.movePrompt', '10, 0'], copy: ['sketch.movePrompt', '10, 0'], rotate: ['sketch.rotatePrompt', '90, 0, 0'], scale: ['sketch.scalePrompt', '2, 0, 0'] };
    const r = await popups.open('prompt', { title: t(`sketch.tool.${kind}`), label: t(prompts[kind][0]), value: prompts[kind][1] });
    if (r?.value == null) return;
    const v = String(r.value).split(/[,\s]+/).filter(Boolean).map(Number);
    if (!v.length || v.some((x) => !Number.isFinite(x))) { notify('error', t('notice.invalidValue', { text: r.value })); return; }
    const op = kind === 'rotate' ? { kind: 'rotate', angle: v[0], cx: (v[1] ?? 0) * k, cy: (v[2] ?? 0) * k }
      : kind === 'scale' ? { kind: 'scale', factor: v[0], cx: (v[1] ?? 0) * k, cy: (v[2] ?? 0) * k }
        : { kind: 'move', dx: v[0] * k, dy: (v[1] ?? 0) * k, copy: kind === 'copy' };
    if (op.kind === 'scale' && !(op.factor > 0)) { notify('error', t('notice.invalidValue', { text: r.value })); return; }
    made = transformEntities(ed.sketch, [...ed.selection], op);
  }
  if (kind !== 'move' && kind !== 'rotate' && kind !== 'scale') ed.selection = made.map((x) => x.id);
  ed.solve();
  ed.commit(`op.sketch.${kind}`);
  renderLeft();
  notify(made.length ? 'success' : 'info', t(made.length ? 'sketch.made' : 'sketch.nothingMade', { count: made.length }));
}

/** Stretch Entities: the selection moves by the typed step, the relations kept (joined curves stretch). */
async function sketchStretchCommand() {
  if (!sketching()) return;
  const ed = state.editing.editor;
  if (!ed.selection.length) { notify('info', t('sketch.selectFirst')); return; }
  const r = await popups.open('prompt', { title: t('sketch.tool.stretch'), label: t('sketch.movePrompt'), value: '10, 0' });
  if (r?.value == null) return;
  const v = String(r.value).split(/[,\s]+/).filter(Boolean).map(Number);
  if (!v.length || v.some((x) => !Number.isFinite(x))) { notify('error', t('notice.invalidValue', { text: r.value })); return; }
  const k = UNIT_FACTOR[units()];
  if (!stretchEntities(ed.sketch, [...ed.selection], v[0] * k, (v[1] ?? 0) * k)) { ed.solve(); ed.render(); notify('warning', t('sketch.stretchBlocked')); return; }
  ed.solve();
  ed.commit('op.sketch.stretch');
  renderLeft();
}

/** Fully Define Sketch: relations and dimensions until nothing can move (positions from the sketch origin). */
function sketchFullyDefineCommand() {
  if (!sketching()) return;
  const ed = state.editing.editor;
  const r = fullyDefine(ed.sketch);
  ed.solve();
  ed.commit('op.sketch.fullyDefine');
  renderLeft();
  notify(r.dof === 0 ? 'success' : 'info', t(r.dof === 0 ? 'sketch.fullyDefined' : 'sketch.partlyDefined', { relations: r.relations, dimensions: r.dimensions, dof: r.dof }));
}

// ───────────────────────── drawings: section, detail, auxiliary views, annotations, BOM

function drawingBom(d) {
  if (!d.bom?.show || d.source?.kind !== 'assembly') return null;
  const asm = project().assemblies.find((a) => a.id === d.source.id);
  return asm ? bomRows(asm, project(), { lang: lang() }) : null;
}

const nextLetter = (d) => { const used = new Set(d.views.map((v) => v.label).filter(Boolean)); return 'ABCDEFGHJKLMNPRSTUVWXYZ'.split('').find((c) => !used.has(c)) ?? 'Z'; };

function drawingActionExtra(d, cmd, arg) {
  const parent = d.views.find((v) => v.id === state.drawingSelected && v.kind !== 'detail') ?? d.views.find((v) => v.type === 'front' && !v.kind) ?? d.views[0];
  if (cmd === 'section') {
    if (!parent) { notify('info', t('notice.needParentView')); return undefined; }
    const { shape } = drawingShape(d);
    if (!shape) return undefined;
    const [lo, hi] = shape.boundingBox.bounds;
    const point = lo.map((v, i) => (v + hi[i]) / 2);
    const cam = VIEW_CAMERAS[parent.type] ?? VIEW_CAMERAS.front;
    // Cut across the parent view (a vertical line in it): the section looks along the parent's x axis.
    const xl = Math.hypot(...cam.x); const normal = (arg === 'h' ? (() => { const dl = Math.hypot(...cam.dir); const dd = cam.dir.map((v) => v / dl); const xx = cam.x.map((v) => v / xl); return [dd[1] * xx[2] - dd[2] * xx[1], dd[2] * xx[0] - dd[0] * xx[2], dd[0] * xx[1] - dd[1] * xx[0]]; })() : cam.x.map((v) => v / xl));
    const type = Object.entries(VIEW_CAMERAS).find(([, c]) => { const l = Math.hypot(...c.dir); return c.dir.every((v, i) => Math.abs(v / l - normal[i]) < 1e-6); })?.[0] ?? 'custom';
    const view = { id: newId('v'), type, kind: 'section', plane: { point, normal }, label: nextLetter(d), parent: parent.id, ...(type === 'custom' ? { dir: normal } : {}), ...(arg === 'r' ? { removed: true } : {}) };
    change('op.addView', () => { d.views.push(view); });
    state.drawingSelected = view.id;
    return notify('success', t('notice.sectionView', { label: view.label }));
  }
  if (cmd === 'detail') {
    if (!parent) { notify('info', t('notice.needParentView')); return undefined; }
    const view = { id: newId('v'), kind: 'detail', type: parent.type, parent: parent.id, scale: 2, label: nextLetter(d) };
    change('op.addView', () => { d.views.push(view); });
    state.drawingSelected = view.id;
    return notify('success', t('notice.detailView', { label: view.label }));
  }
  if (cmd === 'aux') return addAuxView(d);
  if (cmd === 'flatView') {
    if (d.source?.kind !== 'part' || !flatPatternOf(d)) { notify('info', t('notice.needSheetPart')); return undefined; }
    const view = { id: newId('v'), type: 'top', flat: true, label: t('drw.flatPattern') };
    change('op.addView', () => { d.views.push(view); });
    state.drawingSelected = view.id;
    return notify('success', t('notice.flatView'));
  }
  if (cmd === 'bendTable') {
    const rows = bendTableRows(d);
    if (!rows) { notify('info', t('notice.needSheetPart')); return undefined; }
    const existing = (d.annotations ?? []).find((a) => a.kind === 'bendTable');
    const head = ['drw.bt.no', 'drw.bt.dir', 'drw.bt.angle', 'drw.bt.radius', 'drw.bt.k', 'drw.bt.allowance'].map((key) => t(key));
    change('op.annotation', () => {
      if (existing) Object.assign(existing, { rows, head });
      else d.annotations = [...(d.annotations ?? []), { id: newId('ann'), kind: 'bendTable', x: 20, y: 20, rows, head }];
    });
    return notify('success', t('notice.bendTable', { count: rows.length }));
  }
  if (cmd === 'alignedSection') {
    if (!parent) { notify('info', t('notice.needParentView')); return undefined; }
    const { shape } = drawingShape(d);
    if (!shape) return undefined;
    const [lo, hi] = shape.boundingBox.bounds;
    const point = lo.map((v, i) => (v + hi[i]) / 2);
    const cam = VIEW_CAMERAS[parent.type] ?? VIEW_CAMERAS.front;
    const unit = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
    const axis = unit(cam.dir); const xx = unit(cam.x);
    // The first leg runs up the parent view from the centre; the second down and turned by the angle.
    const up = [axis[1] * xx[2] - axis[2] * xx[1], axis[2] * xx[0] - axis[0] * xx[2], axis[0] * xx[1] - axis[1] * xx[0]];
    const view = { id: newId('v'), type: 'custom', kind: 'section', plane: { point, normal: xx }, dir: xx, aligned: { angle: Number(arg) || 30, axis, along: up }, label: nextLetter(d), parent: parent.id };
    change('op.addView', () => { d.views.push(view); });
    state.drawingSelected = view.id;
    return notify('success', t('notice.sectionView', { label: view.label }));
  }
  if (cmd === 'alternate') {
    if (d.source?.kind !== 'assembly') { notify('info', t('notice.bomNeedsAssembly')); return undefined; }
    if (!parent) { notify('info', t('notice.needParentView')); return undefined; }
    const asm = findDocument(project(), d.source);
    const mode = arg === 'motion' || (!asm?.explode?.steps?.length && asm?.motion) ? 'motion' : 'explode';
    change('op.edit', () => { if (parent.alt) delete parent.alt; else parent.alt = { mode }; });
    return notify('success', t(parent.alt ? 'notice.alternateOn' : 'notice.alternateOff', { mode: t(`drw.alt.${mode}`) }));
  }
  if (cmd === 'place') { state.drawingPlace = arg; return notify('info', t('notice.clickSheet', { kind: t(`ann.${arg}`) })); }
  if (cmd === 'bom') {
    if (d.source?.kind !== 'assembly') { notify('info', t('notice.bomNeedsAssembly')); return undefined; }
    return change('op.edit', () => { d.bom = { ...(d.bom ?? {}), show: !d.bom?.show }; });
  }
  if (cmd === 'removeAnn') return change('op.edit', () => { d.annotations = (d.annotations ?? []).filter((a) => a.id !== arg); });
  return more.drawingAction(d, cmd, arg);
}

async function addAuxView(d) {
  const r = await popups.open('prompt', { title: t('cmd.auxView'), label: t('drawing.auxDirection'), value: '1, 1, 0' });
  const dir = String(r?.value ?? '').split(/[,\s]+/).map(Number);
  if (dir.length !== 3 || dir.some((v) => !Number.isFinite(v)) || Math.hypot(...dir) < 1e-9) return;
  const view = { id: newId('v'), type: 'custom', dir, label: nextLetter(d) };
  change('op.addView', () => { d.views.push(view); });
}

/** Places an annotation where the sheet was clicked (sheet mm, y down). */
async function placeAnnotation(event) {
  const d = activeDrawing();
  const kind = state.drawingPlace;
  state.drawingPlace = null;
  const svg = root.querySelector('#drawing-host svg');
  if (!d || !svg) return;
  const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY;
  const at = p.matrixTransform(svg.getScreenCTM().inverse());
  const list = d.annotations ?? [];
  const a = { id: newId('ann'), kind, x: Math.round(at.x * 10) / 10, y: Math.round(at.y * 10) / 10 };
  if (kind === 'note') { const r = await popups.open('prompt', { title: t('ann.note'), label: t('ann.text'), value: t('ann.defaultNote') }); if (r?.value == null) return; a.text = r.value; a.size = 3.5; }
  if (kind === 'balloon') { a.item = list.filter((x) => x.kind === 'balloon').length + 1; a.target = [a.x - 12, a.y + 10]; }
  if (kind === 'gdt') Object.assign(a, { symbol: 'flatness', tolerance: '0.05', diameter: false, modifier: '', datums: [], target: [a.x - 8, a.y + 10] });
  if (kind === 'datum') { const used = new Set(list.filter((x) => x.kind === 'datum').map((x) => x.letter)); a.letter = 'ABCDEFGH'.split('').find((c) => !used.has(c)) ?? 'A'; a.target = [a.x, a.y + 10]; }
  if (kind === 'surface') Object.assign(a, { ra: '1.6', process: 'removal' });
  if (kind === 'centermark') a.size = 10;
  if (kind === 'cloud') Object.assign(a, { w: 50, h: 30, arc: 6, rev: d.title?.revision || 'A' });
  if (kind === 'datumTarget') { const n = list.filter((x) => x.kind === 'datumTarget').length + 1; Object.assign(a, { label: `A${n}`, area: '', targetKind: 'point', areaSize: 6, size: 5, target: [a.x + 12, a.y + 12] }); }
  if (kind === 'hatch') Object.assign(a, { w: 30, h: 20, pattern: 'ansi31', spacing: 2.5, angle: 45 });
  change('op.annotation', () => { d.annotations = [...list, a]; });
  state.drawingSelected = a.id;
  renderDrawing();
  renderRight();
}

function setAnnotationField(id, field, value) {
  const d = activeDrawing();
  const a = d?.annotations?.find((x) => x.id === id);
  if (!a) return;
  change('op.annotation', () => {
    if (field === 'datums') a.datums = String(value).split(/[,\s|]+/).filter(Boolean).map((x) => x.toUpperCase()).slice(0, 3);
    else if (['diameter'].includes(field)) a[field] = Boolean(value);
    else if (['size', 'item', 'w', 'h', 'arc', 'spacing', 'areaSize'].includes(field)) { const n = Number(value); if (Number.isFinite(n) && n > 0) a[field] = n; }
    else if (field === 'angle') { const n = Number(value); if (Number.isFinite(n)) a[field] = n; }
    else if (field === 'border') a[field] = Boolean(value);
    else a[field] = value;
  });
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
  importIdf: { icon: 'pcbBoard', label: 'cmd.importIdf', run: () => importIdfDialog() },
  exportIdf: { icon: 'pcbBoard', label: 'cmd.exportIdf', enabled: () => Boolean(activePart() || activeAssembly()), run: () => exportIdf() },
  newMenu: { icon: 'chevronDown', label: 'action.newMenu', enabled: () => true, run: (c) => showMenu(menuItems(SUBMENUS.newDoc.items), c?.anchor ?? anchorFor('newMenu'), 'context', { header: { icon: 'fileNew', title: t('submenu.newDoc') } }) },
  exportMenu: { icon: 'chevronDown', label: 'action.exportMenu', enabled: hasDoc, run: (c) => showMenu(menuItems(SUBMENUS.exportTo.items), c?.anchor ?? anchorFor('exportMenu'), 'context', { header: { icon: 'exportFile', title: t('submenu.exportTo') } }) },
  exportStep: { icon: 'stepFile', label: 'action.exportStep', enabled: () => Boolean(activePart() || activeAssembly()), run: () => exportModel('step') },
  exportIges: { icon: 'igesFile', label: 'action.exportIges', enabled: () => Boolean(activePart() || activeAssembly()), run: () => exportModel('iges') },
  exportXt: { icon: 'xtFile', label: 'action.exportXt', enabled: () => Boolean(activePart() || activeAssembly()), run: () => exportModel('xt') },
  exportXb: { icon: 'xtFile', label: 'action.exportXb', enabled: () => Boolean(activePart() || activeAssembly()), run: () => exportModel('xb') },
  ...Object.fromEntries(['glb', 'gltf', 'obj', 'ply', 'wrl', '3mf', 'off', 'amf', 'usdz'].map((f) => [`exportMesh:${f}`, { icon: 'meshFile', label: `action.exportMesh.${f}`, enabled: () => Boolean(activePart() || activeAssembly()), run: () => exportModel(f) }])),
  exportStl: { icon: 'stlFile', label: 'action.exportStl', enabled: () => Boolean(activePart() || activeAssembly()), run: () => exportModel('stl') },
  exportImage: { icon: 'exportImage', label: 'action.exportImage', key: 'Ctrl+Shift+E', enabled: hasDoc, run: () => exportImage() },
  exportDxf: { icon: 'dxfFile', label: 'action.exportDxf', enabled: () => Boolean(activeDrawing()), run: () => exportDrawing('dxf') },
  exportDwg: { icon: 'dwgFile', label: 'action.exportDwg', enabled: () => Boolean(activeDrawing()), run: () => exportDrawing('dwg') },
  exportSketchDxf: { icon: 'dxfFile', label: 'action.exportSketchDxf', enabled: () => Boolean(sketchForExport()), run: () => exportSketch('dxf') },
  exportSketchDwg: { icon: 'dwgFile', label: 'action.exportSketchDwg', enabled: () => Boolean(sketchForExport()), run: () => exportSketch('dwg') },
  exportFlatDxf: { icon: 'dxfFile', label: 'action.exportFlatDxf', enabled: () => hasSheet(), run: () => exportFlatPattern('dxf') },
  exportFlatDwg: { icon: 'dwgFile', label: 'action.exportFlatDwg', enabled: () => hasSheet(), run: () => exportFlatPattern('dwg') },
  exportSvg: { icon: 'svgFile', label: 'action.exportSvg', enabled: () => Boolean(activeDrawing()), run: () => exportDrawing('svg') },
  print: { icon: 'print', label: 'action.print', key: 'Ctrl+P', enabled: hasDoc, run: () => printDocument() },
  closeProject: { icon: 'closeTab', label: 'action.closeProject', key: 'Ctrl+W', enabled: () => Boolean(state.doc), run: () => closeProject() },
  exitProject: { icon: 'exitProject', label: 'action.exitProject', enabled: () => Boolean(state.doc) && !state.showStart, run: () => closeProject() },
  exit: { icon: 'exit', label: 'action.exit', key: isMac ? 'Ctrl+Q' : 'Alt+F4', run: () => requestExit() },
  // edit
  undo: { icon: 'undo', label: 'action.undo', key: 'Ctrl+Z', enabled: () => (sketching() ? state.editing.editor.canUndo : Boolean(doc()?.history.canUndo) && !undoBlocked()), run: () => undo() },
  redo: { icon: 'redo', label: 'action.redo', key: 'Ctrl+Y', enabled: () => (sketching() ? state.editing.editor.canRedo : Boolean(doc()?.history.canRedo) && !undoBlocked()), run: () => redo() },
  delete: { icon: 'trash', label: 'action.delete', key: 'Delete', enabled: () => sel() || (sketching() && state.editing.editor.selection.length > 0) || Boolean(state.drawingSelected), run: () => deleteSelection() },
  rename: { icon: 'edit', label: 'action.rename', key: 'F2', enabled: () => state.selection.length === 1 && ['doc', 'feat', 'comp', 'mate'].includes(state.selection[0].kind), run: () => renameSelected() },
  // Large assembly mode: auto → on → off → auto (the status bar shows it while it is on).
  largeAssemblyMode: { icon: 'largeAssembly', label: 'cmd.largeAssemblyMode', enabled: () => Boolean(activeAssembly()), checked: () => Boolean(activeAssembly()) && largeAssemblyOn(), run: () => { const next = { auto: 'on', on: 'off', off: 'auto' }[state.settings.largeAssembly ?? 'auto']; updateSettings({ largeAssembly: next }, { quiet: true }); syncView(); renderAll(); notify('info', t(`lam.mode.${next}`, { n: state.settings.largeAssemblyThreshold ?? 40 })); } },
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
  sweep: featureCommand('sweep', 'featSweep', 'cmd.sweep'),
  cutSweep: featureCommand('cutSweep', 'featCutSweep', 'cmd.cutSweep'),
  loft: featureCommand('loft', 'featLoft', 'cmd.loft'),
  cutLoft: featureCommand('cutLoft', 'featCutLoft', 'cmd.cutLoft'),
  draft: featureCommand('draft', 'featDraft', 'cmd.draft'),
  rib: featureCommand('rib', 'featRib', 'cmd.rib'),
  dome: featureCommand('dome', 'featDome', 'cmd.dome'),
  helix: featureCommand('helix', 'helix', 'cmd.helix'),
  thread: featureCommand('thread', 'featThread', 'cmd.thread'),
  wrap: featureCommand('wrap', 'featWrap', 'cmd.wrap'),
  thicken: featureCommand('thicken', 'featThicken', 'cmd.thicken'),
  surfaceExtrude: featureCommand('surfaceExtrude', 'surfaceExtrude', 'cmd.surfaceExtrude'),
  surfaceRevolve: featureCommand('surfaceRevolve', 'surfaceRevolve', 'cmd.surfaceRevolve'),
  surfacePlanar: featureCommand('surfacePlanar', 'surface', 'cmd.surfacePlanar'),
  surfaceLoft: featureCommand('surfaceLoft', 'surfaceLoft', 'cmd.surfaceLoft'),
  surfaceOffset: featureCommand('surfaceOffset', 'surfaceOffset', 'cmd.surfaceOffset'),
  knit: featureCommand('knit', 'knit', 'cmd.knit'),
  moveBody: featureCommand('moveBody', 'moveBody', 'cmd.moveBody'),
  openscadFeature: featureCommand('openscad', 'scadFile', 'cmd.openscad'),
  exportScad: { icon: 'scadFile', label: 'action.exportScad', enabled: () => Boolean(activePart() || activeAssembly()), run: () => exportScad() },
  scaleBody: featureCommand('scaleBody', 'scaleBody', 'cmd.scaleBody'),
  split: featureCommand('split', 'split', 'cmd.split'),
  insertPart: featureCommand('insertPart', 'insertPartFeat', 'cmd.insertPart'),
  cavity: featureCommand('cavity', 'cavity', 'cmd.cavity'),
  shrink: featureCommand('shrink', 'scaleBody', 'cmd.shrink'),
  baseFlange: featureCommand('baseFlange', 'sheetMetal', 'cmd.baseFlange'),
  edgeFlange: featureCommand('edgeFlange', 'edgeFlange', 'cmd.edgeFlange'),
  flatten: { icon: 'flatten', label: 'cmd.flatten', enabled: () => Boolean(activePart()) && !sketching(), checked: () => Boolean(activePart()?.flat), run: () => toggleFlatten() },
  structural: featureCommand('structural', 'structural', 'cmd.structural'),
  fillSurface: featureCommand('fillSurface', 'surfaceFill', 'cmd.fillSurface'),
  boundary: featureCommand('boundary', 'boundarySurface', 'cmd.boundary'),
  trimSurface: featureCommand('trimSurface', 'surfaceTrim', 'cmd.trimSurface'),
  hem: featureCommand('hem', 'hem', 'cmd.hem'),
  sketchedBend: featureCommand('sketchedBend', 'sketchedBend', 'cmd.sketchedBend'),
  jog: featureCommand('jog', 'jog', 'cmd.jog'),
  partingLine: featureCommand('partingLine', 'partingLine', 'cmd.partingLine'),
  toolingSplit: featureCommand('toolingSplit', 'toolingSplit', 'cmd.toolingSplit'),
  sketch3d: featureCommand('sketch3d', 'sketch3d', 'cmd.sketch3d'),
  // body tools, reference geometry, fillet variants, patterns and curves (cad/part-more.js)
  ...Object.fromEntries(PART_MORE_TYPES.map((type) => [type, featureCommand(type, PART_MORE_ICONS[type], `cmd.${type}`)])),
  ...Object.fromEntries(SHEET_MORE_TYPES.map((type) => [type, featureCommand(type, SHEET_MORE_ICONS[type], `cmd.${type}`)])),
  // sketch tools that read the body or move the selection (cad/sketch-more.js)
  'sk:silhouette': { icon: 'silhouette', label: 'sketch.tool.silhouette', enabled: () => sketching(), run: () => sketchMoreCommand('silhouette') },
  'sk:silhouetteInternal': { icon: 'silhouetteInternal', label: 'sketch.tool.silhouetteInternal', enabled: () => sketching(), run: () => sketchMoreCommand('silhouetteInternal') },
  'sk:convert': { icon: 'convertEntities', label: 'sketch.tool.convert', enabled: () => sketching(), run: () => sketchMoreCommand('convert') },
  'sk:intersect': { icon: 'intersectionCurve', label: 'sketch.tool.intersect', enabled: () => sketching(), run: () => sketchMoreCommand('intersect') },
  'sk:move': { icon: 'moveEntities', label: 'sketch.tool.move', enabled: () => sketching() && state.editing.editor.selection.length > 0, run: () => sketchMoreCommand('move') },
  'sk:copy': { icon: 'copyEntities', label: 'sketch.tool.copy', enabled: () => sketching() && state.editing.editor.selection.length > 0, run: () => sketchMoreCommand('copy') },
  'sk:rotate': { icon: 'rotateEntities', label: 'sketch.tool.rotate', enabled: () => sketching() && state.editing.editor.selection.length > 0, run: () => sketchMoreCommand('rotate') },
  'sk:scale': { icon: 'scaleEntities', label: 'sketch.tool.scale', enabled: () => sketching() && state.editing.editor.selection.length > 0, run: () => sketchMoreCommand('scale') },
  cutList: { icon: 'cutList', label: 'cmd.cutList', enabled: () => hasWeldments(activePart()), run: () => showCutList() },
  draftAnalysis: { icon: 'draftAnalysis', label: 'cmd.draftAnalysis', enabled: () => Boolean(activePart()), checked: () => Boolean(state.draftAnalysis), run: () => toggleDraftAnalysis() },
  simulation: { icon: 'simulation', label: 'cmd.simulation', enabled: () => Boolean(activePart()) && !sketching(), checked: () => state.editing?.mode === 'simulation', run: () => (state.editing?.mode === 'simulation' ? cancelEditing({ quiet: true }) : startSimulation()) },
  equations: { icon: 'equations', label: 'cmd.equations', enabled: () => Boolean(activePart()) && !sketching(), checked: () => state.editing?.mode === 'equations', run: () => startEquations('equations') },
  configurations: { icon: 'configurations', label: 'cmd.configurations', enabled: () => Boolean(activePart() || activeAssembly()) && !sketching(), checked: () => state.editing?.mode === 'configs', run: () => startEquations('configs') },
  designTable: { icon: 'designTable', label: 'cmd.exportTable', enabled: () => Boolean(activePart()), run: () => exportDesignTable() },
  importTable: { icon: 'folderOpen', label: 'cmd.importTable', enabled: () => Boolean(activePart()), run: () => importDesignTable() },
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
  'sk:slotCenter': skCommand('slotCenter', 'slotCenterTool'),
  'sk:slotArc3': skCommand('slotArc3', 'slotArcTool'),
  'sk:slotArcCenter': skCommand('slotArcCenter', 'slotArcCenterTool'),
  'sk:point': skCommand('point', 'pointTool'),
  'sk:spline': skCommand('spline', 'splineTool', 'S'),
  'sk:styleSpline': skCommand('styleSpline', 'styleSpline'),
  'sk:ellipse': skCommand('ellipse', 'ellipseTool', 'E'),
  'sk:rect3': skCommand('rect3', 'rect3Tool'),
  'sk:rect3c': skCommand('rect3c', 'rect3cTool'),
  'sk:parallelogram': skCommand('parallelogram', 'parallelogramTool'),
  'sk:circle3': skCommand('circle3', 'circle3Tool'),
  'sk:tangentArc': skCommand('tangentArc', 'tangentArcTool'),
  'sk:partialEllipse': skCommand('partialEllipse', 'partialEllipseTool'),
  'sk:parabola': skCommand('parabola', 'parabolaTool'),
  'sk:conic': skCommand('conic', 'conicTool'),
  'sk:equation': skCommand('equation', 'equationCurve'),
  'sk:split': skCommand('split', 'splitTool'),
  'sk:stretch': { icon: 'stretchTool', label: 'sketch.tool.stretch', enabled: () => sketching() && state.editing.editor.selection.length > 0, run: () => sketchStretchCommand() },
  'sk:baselineDim': { icon: 'baselineDim', label: 'sketch.tool.baselineDim', enabled: () => sketching() && state.editing.editor.selection.length > 1, run: () => {
    const ed = state.editing.editor; const [base, ...others] = ed.selection;
    const made = baselineDimensions(ed.sketch, base, others);
    if (!made.length) { notify('info', t('skd.baselinePick')); return; }
    ed.solve(); ed.commit('op.dimension'); ed.selection = []; ed.render(); renderLeft();
    notify('success', t('skd.baselineMade', { count: made.length }));
  } },
  'sk:dynamicMirror': { icon: 'dynamicMirror', label: 'sketch.tool.dynamicMirror', enabled: () => sketching() && (Boolean(state.editing.editor.mirrorAxis) || state.editing.editor.selection.some((id) => byId(state.editing.editor.sketch, id)?.type === 'line')), checked: () => sketching() && Boolean(state.editing.editor.mirrorAxis), run: () => {
    const ed = state.editing.editor; const on = ed.toggleDynamicMirror();
    notify('info', t(on ? 'sketch.dynamicMirrorOn' : 'sketch.dynamicMirrorOff')); ed.render(); renderAll();
  } },
  'sk:autotrace': { icon: 'autoTrace', label: 'sketch.tool.autoTrace', enabled: () => sketching() && Boolean(state.editing.editor.sketch.picture?.src), checked: () => sketching() && Boolean(state.editing.editor.traceOpen), run: () => { const ed = state.editing.editor; ed.traceOpen = !ed.traceOpen; state.leftTab = 'pm'; renderLeft(); } },
  'sk:repair': { icon: 'repairSketch', label: 'sketch.tool.repair', enabled: () => sketching(), checked: () => sketching() && Boolean(state.editing.editor.repairOpen), run: () => { const ed = state.editing.editor; ed.repairOpen = !ed.repairOpen; state.leftTab = 'pm'; renderLeft(); } },
  'sk:fullyDefine': { icon: 'fullyDefine', label: 'sketch.tool.fullyDefine', enabled: () => sketching(), run: () => sketchFullyDefineCommand() },
  'sk:text': skCommand('text', 'textTool'),
  'sk:fillet': skCommand('sketchFillet', 'sketchFillet'),
  'sk:chamfer': skCommand('sketchChamfer', 'sketchChamfer'),
  'sk:extend': skCommand('extend', 'extendTool', 'X'),
  'sk:offset': { icon: 'offsetTool', label: 'sketch.tool.offset', key: 'O', enabled: () => sketching() && state.editing.editor.selection.length > 0, run: () => sketchSelectionCommand('offset') },
  'sk:mirror': { icon: 'mirrorEntities', label: 'sketch.tool.mirror', enabled: () => sketching() && state.editing.editor.selection.length > 0, run: () => sketchSelectionCommand('mirror') },
  'sk:linPattern': { icon: 'sketchLinPattern', label: 'sketch.tool.linPattern', enabled: () => sketching() && state.editing.editor.selection.length > 0, run: () => sketchSelectionCommand('linPattern') },
  'sk:cirPattern': { icon: 'sketchCirPattern', label: 'sketch.tool.cirPattern', enabled: () => sketching() && state.editing.editor.selection.length > 0, run: () => sketchSelectionCommand('cirPattern') },
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
  showRulers: { icon: 'ruler', label: 'action.showRulers', checked: () => state.settings.showRulers !== false, run: () => { updateSettings({ showRulers: state.settings.showRulers === false }); syncGuides(); } },
  showGrid: { icon: 'grid', label: 'action.showGrid', checked: () => state.settings.showGrid !== false, run: () => { updateSettings({ showGrid: state.settings.showGrid === false }); syncGuides(); } },
  ...Object.fromEntries(['front', 'top', 'right'].map((pl) => [`gridPlane:${pl}`, { icon: { front: 'planeFront', top: 'planeTop', right: 'planeRight' }[pl], label: `action.gridPlane.${pl}`, checked: () => (state.settings.gridPlane ?? 'top') === pl, run: () => { updateSettings({ gridPlane: pl, showGrid: true }); syncGuides(); } }])),
  showScaleBar: { icon: 'scaleBar', label: 'action.showScaleBar', checked: () => state.settings.showScaleBar !== false, run: () => { updateSettings({ showScaleBar: state.settings.showScaleBar === false }); syncGuides(); } },
  leftPanel: { icon: 'panelLeft', label: 'action.leftPanel', key: 'Ctrl+Shift+1', checked: () => state.settings.showLeftPanel, run: () => toggle('showLeftPanel') },
  rightPanel: { icon: 'panelRight', label: 'action.rightPanel', key: 'Ctrl+Shift+2', checked: () => state.settings.showRightPanel, run: () => toggle('showRightPanel') },
  bottomPanel: { icon: 'panelBottom', label: 'action.bottomPanel', key: 'Ctrl+J', checked: () => state.settings.showBottomPanel, run: () => toggle('showBottomPanel') },
  statusBar: { icon: 'statusBar', label: 'action.statusBar', checked: () => state.settings.showStatusBar, run: () => toggle('showStatusBar') },
  fps: { icon: 'fps', label: 'action.fps', checked: () => state.settings.showFps, run: () => toggle('showFps') },
  // evaluate
  massProps: { icon: 'massProps', label: 'cmd.massProps', enabled: () => Boolean(activePart() || activeAssembly()), run: () => showMassProperties() },
  lights: { icon: 'bulb', label: 'cmd.lights', enabled: () => Boolean(activePart() || activeAssembly()), checked: () => state.editing?.mode === 'lights', run: () => (state.editing?.mode === 'lights' ? cancelEditing({ quiet: true }) : startLights()) },
  measure: { icon: 'measureTool', label: 'cmd.measure', enabled: () => Boolean(activePart() || activeAssembly()), checked: () => state.editing?.mode === 'measure', run: () => (state.editing?.mode === 'measure' ? cancelEditing({ quiet: true }) : startMeasure()) },
  interference: { icon: 'interference', label: 'cmd.interference', enabled: asmOpen, run: () => checkInterference() },
  // assembly
  insertComponent: { icon: 'insertComponent', label: 'cmd.insertComponent', enabled: asmOpen, run: () => startInsertComponent() },
  mate: { icon: 'mate', label: 'cmd.mate', enabled: () => asmOpen() && (activeAssembly()?.components.length ?? 0) > 1, run: () => startMate() },
  fixComponent: { icon: 'fixComponent', label: 'cmd.fix', enabled: () => asmOpen() && state.selection.some((s) => s.kind === 'comp'), run: () => setComponentFixed(true) },
  magneticSnap: { icon: 'magneticMate', label: 'cmd.magneticSnap', enabled: () => asmOpen() && (activeAssembly()?.components.length ?? 0) > 1, run: () => magneticSnap() },
  simplifyOuter: { icon: 'simplifyOuter', label: 'cmd.simplifyOuter', enabled: () => asmOpen() && state.selection.some((s) => s.kind === 'comp'), checked: () => { const l = state.selection.filter((s) => s.kind === 'comp').map((s) => activeAssembly()?.components.find((c) => c.id === s.id)); return l.length > 0 && l.every((c) => c?.simplified === 'outer'); }, run: () => setSimplified('outer') },
  simplifyBox: { icon: 'simplifyBox', label: 'cmd.simplifyBox', enabled: () => asmOpen() && state.selection.some((s) => s.kind === 'comp'), checked: () => { const l = state.selection.filter((s) => s.kind === 'comp').map((s) => activeAssembly()?.components.find((c) => c.id === s.id)); return l.length > 0 && l.every((c) => c?.simplified === 'box'); }, run: () => setSimplified('box') },
  simplifyFull: { icon: 'assembly', label: 'cmd.simplifyFull', enabled: () => asmOpen() && state.selection.some((s) => s.kind === 'comp' && activeAssembly()?.components.find((c) => c.id === s.id)?.simplified), run: () => setSimplified('') },
  flexibleComponent: { icon: 'flexibleSub', label: 'cmd.flexibleComponent', enabled: () => asmOpen() && state.selection.some((s) => s.kind === 'comp' && activeAssembly()?.components.find((c) => c.id === s.id)?.sub), checked: () => { const l = state.selection.filter((s) => s.kind === 'comp').map((s) => activeAssembly()?.components.find((c) => c.id === s.id)).filter((c) => c?.sub); return l.length > 0 && l.every((c) => c.flexible); }, run: () => toggleFlexible() },
  floatComponent: { icon: 'floatComponent', label: 'cmd.float', enabled: () => asmOpen() && state.selection.some((s) => s.kind === 'comp'), run: () => setComponentFixed(false) },
  rotateComponent: { icon: 'rotateRight', label: 'cmd.rotate90z', enabled: () => asmOpen() && state.selection.some((s) => s.kind === 'comp'), run: () => rotateComponent([0, 0, 1], 90) },
  rotateComponentX: { icon: 'rotateRight', label: 'cmd.rotate90x', enabled: () => asmOpen() && state.selection.some((s) => s.kind === 'comp'), run: () => rotateComponent([1, 0, 0], 90) },
  rotateComponentY: { icon: 'rotateRight', label: 'cmd.rotate90y', enabled: () => asmOpen() && state.selection.some((s) => s.kind === 'comp'), run: () => rotateComponent([0, 1, 0], 90) },
  explode: { icon: 'explode', label: 'cmd.explode', enabled: () => asmOpen() && (activeAssembly()?.components.length ?? 0) > 1, checked: () => Boolean(activeAssembly()?.explode?.on), run: () => toggleExplode() },
  resetExplode: { icon: 'collapse', label: 'cmd.resetExplode', enabled: () => Boolean(activeAssembly()?.explode?.steps?.length), run: () => change('op.explode', () => { delete activeAssembly().explode; }) },
  motion: { icon: 'motion', label: 'cmd.motion', enabled: () => asmOpen() && (activeAssembly()?.components.length ?? 0) > 1, checked: () => state.editing?.mode === 'motion', run: () => (state.editing?.mode === 'motion' ? cancelEditing({ quiet: true }) : startMotion()) },
  openPart: { icon: 'part', label: 'cmd.openPart', enabled: () => asmOpen() && state.selection.length === 1 && state.selection[0].kind === 'comp', run: () => { const c = activeAssembly().components.find((x) => x.id === state.selection[0].id); if (c) switchDocument({ kind: 'part', id: c.part }); } },
  // drawing
  addView: { icon: 'drawingView', label: 'cmd.addView', enabled: () => Boolean(activeDrawing()), run: (c) => addViewMenu(c?.anchor) },
  std3View: { icon: 'standard3View', label: 'cmd.std3View', enabled: () => Boolean(activePart() || activeAssembly() || activeDrawing()), run: () => standardThreeView() },
  hiddenLines: { icon: 'hiddenLines', label: 'drawing.hiddenLines', enabled: () => Boolean(activeDrawing()), checked: () => activeDrawing()?.showHidden !== false, run: () => change('op.edit', () => { const d = activeDrawing(); d.showHidden = d.showHidden === false; }) },
  sectionView: { icon: 'sectionDrawing', label: 'cmd.sectionView', enabled: () => Boolean(activeDrawing()), run: () => drawingAction('section:v') },
  view3dDrawing: { icon: 'view3dDrawing', label: 'cmd.view3dDrawing', enabled: () => Boolean(activeDrawing()), run: () => turnDrawingView() },
  relativeView: { icon: 'relativeView', label: 'cmd.relativeView', enabled: () => Boolean(activePart()), run: () => relativeView() },
  removedSection: { icon: 'removedSection', label: 'cmd.removedSection', enabled: () => Boolean(activeDrawing()), run: () => drawingAction('section:r') },
  saveBodies: { icon: 'saveBodies', label: 'cmd.saveBodies', enabled: () => Boolean(activePart()) && !sketching(), run: () => saveBodies() },
  sectionViewH: { icon: 'sectionDrawing', label: 'cmd.sectionViewH', enabled: () => Boolean(activeDrawing()), run: () => drawingAction('section:h') },
  alignedSection: { icon: 'alignedSection', label: 'cmd.alignedSection', enabled: () => Boolean(activeDrawing()), run: () => drawingAction('alignedSection:30') },
  alternatePositionView: { icon: 'alternatePosition', label: 'cmd.alternatePositionView', enabled: () => activeDrawing()?.source?.kind === 'assembly', checked: () => { const d = activeDrawing(); return Boolean(d?.views.find((v) => v.id === state.drawingSelected)?.alt); }, run: () => drawingAction('alternate') },
  flatPatternView: { icon: 'flatPatternView', label: 'cmd.flatPatternView', enabled: () => activeDrawing()?.source?.kind === 'part', run: () => drawingAction('flatView') },
  weldTable: { icon: 'weldTable', label: 'cmd.weldTable', enabled: () => Boolean(activeDrawing()), run: () => drawingTable('weld') },
  cutListTable: { icon: 'cutList', label: 'cmd.cutListTable', enabled: () => activeDrawing()?.source?.kind === 'part', run: () => drawingTable('cutList') },
  bendTable: { icon: 'bendTable', label: 'cmd.bendTable', enabled: () => activeDrawing()?.source?.kind === 'part', run: () => drawingAction('bendTable') },
  detailView: { icon: 'detailView', label: 'cmd.detailView', enabled: () => Boolean(activeDrawing()), run: () => drawingAction('detail') },
  auxView: { icon: 'auxView', label: 'cmd.auxView', enabled: () => Boolean(activeDrawing()), run: () => drawingAction('aux') },
  bom: { icon: 'bom', label: 'cmd.bom', enabled: () => activeDrawing()?.source?.kind === 'assembly', checked: () => Boolean(activeDrawing()?.bom?.show), run: () => drawingAction('bom') },
  ...Object.fromEntries([['note', 'note'], ['balloon', 'balloon'], ['gdt', 'gdt'], ['datum', 'datum'], ['surface', 'surfaceFinish'], ['centermark', 'centerMark'], ['cloud', 'revisionCloud'], ['datumTarget', 'datumTarget'], ['hatch', 'areaHatch']].map(([k, g]) => [`ann:${k}`, { icon: g, label: `ann.${k}`, enabled: () => Boolean(activeDrawing()), checked: () => state.drawingPlace === k, run: () => drawingAction(`place:${k}`) }])),
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
  tutorialDoc: { icon: 'tutorialDoc', label: 'action.tutorialDoc', run: () => openDocWindow('tutorial') },
  shortcuts: { icon: 'keyboard', label: 'action.shortcuts', run: () => popups.open('settings', { tab: 'shortcuts' }) },
  settings: { icon: 'gear', label: 'action.settings', key: 'Ctrl+,', run: () => popups.open('settings', { tab: 'general' }) },
  about: { icon: 'info', label: 'action.about', run: () => popups.open('about') },
  welcome: { icon: 'bulb', label: 'action.welcome', run: () => openWelcome() },
};

// Component patterns, smart mates, collision detection, more drawing views and tables, sheets, curvature /
// zebra / thickness, buckling and fatigue (app-more.js).
const more = withSim2(createMoreTools, {
  state, t, notify, change, commit, syncView, renderAll, renderLeft, renderDrawing, renderToolbarState, fitView, fitDrawing, cancelEditing, ensureKernel, withProgress, ask, newId, fmt, fmtLen, parseLen, units, lang, popups,
  saveExport: (...a) => saveExport(...a), showMode: (...a) => showMode(...a),
  viewport: () => viewport, project, activePart, activeAssembly, activeDrawing, topoOf, assemblySize, componentShapes, componentCut, componentLeaves, drawingShape, drawingProjections,
  buildPart, displayPlacement, doc, projectThumbnail, activeKind, runCommand: (id, c) => run(id, c),
  pm: { pmHead, pmGroup, pmNum, pmSeg, pmList, pmButton, textInput },
});
Object.assign(commands, more.commands);
// Product data management: the vault explorer, check-in / check-out, lifecycle, change orders, references,
// Pack and Go (app-pdm.js); chained onto `more` (its read-only check, CommandManager tabs and menus).
const pdm = attachPdm(more, {
  state, t, notify, change, renderAll, ask, newId, project, doc, activeAssembly, saveExport,
  insertComponent: (id) => insertComponent(id),
  openVaultDoc: async (name, text) => { if (!(await confirmReplace())) return null; const d = new Doc(unpackProject(text), { name }); await busy('progress.open', name, () => setDoc(d), { delay: 150 }); return d; },
});
Object.assign(commands, pdm.commands);
// Save on a document from the vault offers check-in or a local copy (app-pdm.js).
commands.save = { ...commands.save, run: () => pdm.api.save(() => saveDoc()) };
// Smart dimensions, model items, centre marks, welds, tables, layers, title block, sheet formats; more Evaluate
// tools and the mold surfaces (app-drw.js), chained onto the hooks of `more`.
const drwTools = attachDrwTools(more, {
  state, t, notify, change, syncView, renderAll, renderLeft, renderDrawing, renderToolbarState, fitDrawing, cancelEditing, newId, fmt, fmtLen, units, lang,
  viewport: () => viewport, project, activePart, activeDrawing, topoOf, drawingShape, drawingProjections, drawingInfo, buildPart: (p, o) => buildPart(p, o), startFeature, saveExport,
  pm: { pmHead, pmGroup, pmNum, pmSeg, pmList, pmButton, textInput },
});
Object.assign(commands, drwTools.commands);
// CAM, injection moulding flow and inspection (app-mfg.js), chained onto the hooks of `more` after app-drw.js.
const mfgTools = attachMfgTools(more, {
  state, t, notify, change, syncView, renderAll, renderLeft, renderDrawing, cancelEditing, ensureKernel, withProgress, newId, fmt, fmtLen, lang,
  viewport: () => viewport, project, activePart, activeDrawing, activeKind, buildPart: (p) => buildPart(p), drawingProjections, saveExport,
  drawingSvg: (d) => more.svg(d, { labels: drawingLabels(), info: drawingInfo(d), bomRows: drawingBom(d) }),
  pm: { pmHead, pmGroup, pmNum, pmSeg, pmList, pmButton, textInput },
});
Object.assign(commands, mfgTools.commands);

// Technical illustrations of assemblies (app-illustration.js), chained onto the hooks of `more` like the add-ins above.
const illTools = createIllustrationTools({
  state, t, notify, change, syncView, renderAll, renderLeft, cancelEditing, ensureKernel, newId, saveExport, fileSafe,
  viewport: () => viewport, project, activeAssembly,
  // A component's shape in its own coordinates (a sub-assembly: its parts placed in it, as one compound).
  localShape: (c) => {
    const shapes = componentLeaves(c).map((l) => { const pt = project()?.parts.find((p) => p.id === l.part); const b = pt && buildPart(pt).body; return b ? (c.sub ? placeShape(b, l.placement) : b) : null; }).filter(Boolean);
    return shapes.length === 1 ? shapes[0] : shapes.length ? rep().makeCompound(shapes) : null;
  },
  pm: { pmHead, pmGroup, pmNum, pmSeg, pmList, pmButton, textInput },
});
{
  const o = { ...more };
  const mine = (e = state.editing) => illTools.owns(e);
  more.owns = (e) => mine(e) || o.owns(e);
  more.pm = (e) => (mine(e) ? illTools.pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? illTools.pick(hit, ev) : o.pick(hit, ev));
  more.field = (k, raw, v) => (mine() ? illTools.field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? illTools.set(k, v) : o.set(k, v));
  more.toggle = (k, c) => (mine() ? illTools.toggle(k, c) : o.toggle(k, c));
  more.accept = () => (mine() ? illTools.accept() : o.accept());
  more.subject = (e) => (mine(e) ? illTools.subject(e) : o.subject(e));
  more.handles = (name) => illTools.handles(name) || o.handles(name);
  more.command = (name, arg) => (illTools.handles(name) ? illTools.command(name, arg) : o.command(name, arg));
}
Object.assign(commands, illTools.commands);

// 2D electrical schematics (app-schematic.js), chained the same way.
const schTools = createSchematicTools({
  state, t, notify, change, renderAll, renderLeft, cancelEditing, newId, saveExport, fileSafe, project,
  pm: { pmHead, pmGroup, pmNum, pmSeg, pmList, pmButton, textInput },
});
{
  const o = { ...more };
  const mine = (e = state.editing) => schTools.owns(e);
  more.owns = (e) => mine(e) || o.owns(e);
  more.pm = (e) => (mine(e) ? schTools.pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? schTools.pick(hit, ev) : o.pick(hit, ev));
  more.field = (k, raw, v) => (mine() ? schTools.field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? schTools.set(k, v) : o.set(k, v));
  more.toggle = (k, c) => (mine() ? schTools.toggle(k, c) : o.toggle(k, c));
  more.accept = () => (mine() ? schTools.accept() : o.accept());
  more.subject = (e) => (mine(e) ? schTools.subject(e) : o.subject(e));
  more.handles = (name) => schTools.handles(name) || o.handles(name);
  more.command = (name, arg) => (schTools.handles(name) ? schTools.command(name, arg) : o.command(name, arg));
}
Object.assign(commands, schTools.commands);

// Replace components, copy with mates, hole alignment, envelopes (app-asmtools.js), chained the same way.
const asmTools = createAsmTools({
  state, t, notify, change, renderAll, renderLeft, cancelEditing, newId, project, activeAssembly, withProgress, popups,
  viewport: () => viewport, topoOf, assemblySize, componentShapes, rep, buildPart: (p, o) => buildPart(p, o),
  pm: { pmHead, pmGroup, pmNum, pmSeg, pmList, pmButton, textInput },
});
{
  const o = { ...more };
  const mine = (e = state.editing) => asmTools.owns(e);
  more.owns = (e) => mine(e) || o.owns(e);
  more.pm = (e) => (mine(e) ? asmTools.pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? asmTools.pick(hit, ev) : o.pick(hit, ev));
  more.field = (k, raw, v) => (mine() ? asmTools.field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? asmTools.set(k, v) : o.set(k, v));
  more.toggle = (k, c) => (mine() ? asmTools.toggle(k, c) : o.toggle(k, c));
  more.select = (k, v) => (mine() ? asmTools.select(k, v) : o.select?.(k, v));
  more.accept = () => (mine() ? asmTools.accept() : o.accept());
  more.subject = (e) => (mine(e) ? asmTools.subject(e) : o.subject(e));
  more.handles = (name) => (mine() && asmTools.handles(name)) || o.handles(name);
  more.command = (name, arg) => (mine() && asmTools.handles(name) ? asmTools.command(name, arg) : o.command(name, arg));
}
Object.assign(commands, asmTools.commands);

// The exploded view editor (app-explode.js), chained the same way.
const xpTools = createExplodeTools({
  state, t, notify, change, renderAll, renderLeft, cancelEditing, newId, activeAssembly, assemblySize, topoOf,
  viewport: () => viewport, explodeCenters, placedCenter, autoExplode: () => autoExplodeNow(), animateExplode: () => animateExplode(),
  pm: { pmHead, pmGroup, pmNum, pmSeg, pmList, pmButton },
});
{
  const o = { ...more };
  const mine = (e = state.editing) => xpTools.owns(e);
  more.owns = (e) => mine(e) || o.owns(e);
  more.pm = (e) => (mine(e) ? xpTools.pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? xpTools.pick(hit, ev) : o.pick(hit, ev));
  more.field = (k, raw, v) => (mine() ? xpTools.field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? xpTools.set(k, v) : o.set(k, v));
  more.toggle = (k, c) => (mine() ? xpTools.toggle(k, c) : o.toggle(k, c));
  more.select = (k, v) => (mine() ? xpTools.select(k, v) : o.select?.(k, v));
  more.accept = () => (mine() ? xpTools.accept() : o.accept());
  more.subject = (e) => (mine(e) ? xpTools.subject(e) : o.subject(e));
  more.handles = (name) => (mine() && xpTools.handles(name)) || o.handles(name);
  more.command = (name, arg) => (mine() && xpTools.handles(name) ? xpTools.command(name, arg) : o.command(name, arg));
}
Object.assign(commands, xpTools.commands);

// Assembly visualization (app-asmviz.js), chained the same way.
const vizTools = createAsmVizTools({
  state, t, notify, renderAll, renderLeft, cancelEditing, activeAssembly, componentShapes, rep, massOf, fmt, syncView: () => syncView(),
  pm: { pmHead, pmGroup, pmSeg },
});
{
  const o = { ...more };
  const mine = (e = state.editing) => vizTools.owns(e);
  more.owns = (e) => mine(e) || o.owns(e);
  more.pm = (e) => (mine(e) ? vizTools.pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? vizTools.pick(hit, ev) : o.pick(hit, ev));
  more.field = (k, raw, v) => (mine() ? vizTools.field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? vizTools.set(k, v) : o.set(k, v));
  more.toggle = (k, c) => (mine() ? vizTools.toggle(k, c) : o.toggle(k, c));
  more.select = (k, v) => (mine() ? vizTools.select(k, v) : o.select?.(k, v));
  more.accept = () => (mine() ? vizTools.accept() : o.accept());
  more.subject = (e) => (mine(e) ? vizTools.subject(e) : o.subject(e));
  more.handles = (name) => (mine() && vizTools.handles(name)) || o.handles(name);
  more.command = (name, arg) => (mine() && vizTools.handles(name) ? vizTools.command(name, arg) : o.command(name, arg));
}
Object.assign(commands, vizTools.commands);

// Section properties of the active part (app-secprops.js).
const secTools = createSectionPropsTools({
  state, t, notify, renderAll, renderLeft, cancelEditing, activePart, buildPart: (p) => buildPart(p), fmt, fmtLen: (v) => fmtLen(v), units: () => units(),
  setPreview: (spec) => viewport?.setPreview(spec), syncView: () => syncView(),
  planeFrame: (ref) => { const part = activePart(); if (!part) return null; const main = buildPart(part); try { return resolvePlane(ref, { body: main.body, planes: main.result.planes, part }); } catch { return null; } },
  planeRefOfHit: (hit) => { if (hit?.kind === 'plane') return planeRefOf(hit.id); const topo = topoOf(hit); return hit?.kind === 'face' && topo?.shape?.geomType === 'PLANE' ? faceRef(topo.shape) : null; },
  pm: { pmHead, pmGroup, pmSeg, pmNum },
});
{
  const o = { ...more };
  const mine = (e = state.editing) => secTools.owns(e);
  more.owns = (e) => mine(e) || o.owns(e);
  more.pm = (e) => (mine(e) ? secTools.pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? secTools.pick(hit, ev) : o.pick(hit, ev));
  more.field = (k, raw, v) => (mine() ? secTools.field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? secTools.set(k, v) : o.set(k, v));
  more.toggle = (k, c) => (mine() ? secTools.toggle(k, c) : o.toggle(k, c));
  more.select = (k, v) => (mine() ? secTools.select(k, v) : o.select?.(k, v));
  more.accept = () => (mine() ? secTools.accept() : o.accept());
  more.subject = (e) => (mine(e) ? secTools.subject(e) : o.subject(e));
  more.handles = (name) => (mine() && secTools.handles(name)) || o.handles(name);
  more.command = (name, arg) => (mine() && secTools.handles(name) ? secTools.command(name, arg) : o.command(name, arg));
}
Object.assign(commands, secTools.commands);

// Decals on the part's faces (app-decals.js).
const decalTools = createDecalTools({
  state, t, notify, renderAll, renderLeft, cancelEditing, activePart, newId, change, rep, units: () => units(),
  viewport: () => viewport, partEntry: () => (activePart() ? buildPart(activePart()) : null), topoOf: (hit) => topoOf(hit), requestRender: () => viewport?.requestRender(),
  pm: { pmHead, pmGroup, pmNum, pmSeg },
});
{
  const o = { ...more };
  const mine = (e = state.editing) => decalTools.owns(e);
  more.owns = (e) => mine(e) || o.owns(e);
  more.pm = (e) => (mine(e) ? decalTools.pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? decalTools.pick(hit, ev) : o.pick(hit, ev));
  more.field = (k, raw, v) => (mine() ? decalTools.field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? decalTools.set(k, v) : o.set(k, v));
  more.toggle = (k, c) => (mine() ? decalTools.toggle(k, c) : o.toggle(k, c));
  more.select = (k, v) => (mine() ? decalTools.select(k, v) : o.select?.(k, v));
  more.accept = () => (mine() ? decalTools.accept() : o.accept());
  more.subject = (e) => (mine(e) ? decalTools.subject(e) : o.subject(e));
  more.handles = (name) => (mine() && decalTools.handles(name)) || o.handles(name);
  more.command = (name, arg) => (mine() && decalTools.handles(name) ? decalTools.command(name, arg) : o.command(name, arg));
}
Object.assign(commands, decalTools.commands);

// Walkthrough and video recording (app-walk.js).
const walkTools = createWalkTools({
  state, t, notify, renderAll, renderLeft, cancelEditing, fmt, saveExport, viewport: () => viewport, units: () => units(),
  updateSettings: (patch) => updateSettings(patch, { quiet: true }),
  hasModel: () => hasDoc() && activeKind() !== 'drawing',
  baseName: () => safeName(),
  motion: {
    available: () => { const a = activeAssembly(); return Boolean(a && hasMotion(a) && (motionType(a) !== 'physics' || dynamicsResult(a, { run: false }))); },
    duration: () => Math.max(0.1, Number(activeAssembly()?.motion?.duration) || 5),
    show: (time) => showMotionTime(time),
  },
  pm: { pmHead, pmGroup, pmNum, pmSeg, pmButton },
});
{
  const o = { ...more };
  const mine = (e = state.editing) => walkTools.owns(e);
  more.owns = (e) => mine(e) || o.owns(e);
  more.pm = (e) => (mine(e) ? walkTools.pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? walkTools.pick(hit, ev) : o.pick(hit, ev));
  more.dragTool = () => (mine() ? walkTools.dragTool() : o.dragTool?.() ?? null);
  more.field = (k, raw, v) => (mine() ? walkTools.field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? walkTools.set(k, v) : o.set(k, v));
  more.toggle = (k, c) => (mine() ? walkTools.toggle(k, c) : o.toggle(k, c));
  more.select = (k, v) => (mine() ? walkTools.select(k, v) : o.select?.(k, v));
  more.accept = () => (mine() ? walkTools.accept() : o.accept());
  more.subject = (e) => (mine(e) ? walkTools.subject(e) : o.subject(e));
  more.handles = (name) => (mine() && walkTools.handles(name)) || o.handles(name);
  more.command = (name, arg) => (mine() && walkTools.handles(name) ? walkTools.command(name, arg) : o.command(name, arg));
}
Object.assign(commands, walkTools.commands);

// Beam (frame) study of weldments (app-frame.js).
const frameTools = createFrameTools({
  state, t, notify, renderAll, renderLeft, cancelEditing, change, fmt, saveExport, activePart, viewport: () => viewport, syncView: () => syncView(),
  partEntry: () => state.partEntry,
  feaMaterial: (p) => { const m = materialOf(p.material); return { E: m.E * 1000, nu: m.nu ?? 0.3, yield: m.yield, density: m.density }; },
  pm: { pmHead, pmGroup, pmNum, pmSeg, pmButton },
});
{
  const o = { ...more };
  const mine = (e = state.editing) => frameTools.owns(e);
  more.owns = (e) => mine(e) || o.owns(e);
  more.pm = (e) => (mine(e) ? frameTools.pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? frameTools.pick(hit, ev) : o.pick(hit, ev));
  more.field = (k, raw, v) => (mine() ? frameTools.field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? frameTools.set(k, v) : o.set(k, v));
  more.toggle = (k, c) => (mine() ? frameTools.toggle(k, c) : o.toggle(k, c));
  more.select = (k, v) => (mine() ? frameTools.select(k, v) : o.select?.(k, v));
  more.accept = () => (mine() ? frameTools.accept() : o.accept());
  more.subject = (e) => (mine(e) ? frameTools.subject(e) : o.subject(e));
  more.handles = (name) => (mine() && frameTools.handles(name)) || o.handles(name);
  more.command = (name, arg) => (mine() && frameTools.handles(name) ? frameTools.command(name, arg) : o.command(name, arg));
  const od = more.decorate;
  more.decorate = (kind) => { od?.(kind); frameTools.decorate(kind); };
}
Object.assign(commands, frameTools.commands);

// Scan to Solid: a scanned / faceted body rebuilt from fitted surfaces (app-scan.js).
const scanTools = createScanTools({
  state, t, notify, renderAll, renderLeft, cancelEditing, change, fmt, activePart, withProgress,
  partEntry: () => state.partEntry,
  pm: { pmHead, pmGroup, pmNum, pmSeg, pmButton },
});
{
  const o = { ...more };
  const mine = (e = state.editing) => scanTools.owns(e);
  more.owns = (e) => mine(e) || o.owns(e);
  more.pm = (e) => (mine(e) ? scanTools.pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? scanTools.pick(hit, ev) : o.pick(hit, ev));
  more.field = (k, raw, v) => (mine() ? scanTools.field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? scanTools.set(k, v) : o.set(k, v));
  more.toggle = (k, c) => (mine() ? scanTools.toggle(k, c) : o.toggle(k, c));
  more.select = (k, v) => (mine() ? scanTools.select(k, v) : o.select?.(k, v));
  more.accept = () => (mine() ? scanTools.accept() : o.accept());
  more.subject = (e) => (mine(e) ? scanTools.subject(e) : o.subject(e));
  more.handles = (name) => (mine() && scanTools.handles(name)) || o.handles(name);
  more.command = (name, arg) => (mine() && scanTools.handles(name) ? scanTools.command(name, arg) : o.command(name, arg));
}
Object.assign(commands, scanTools.commands);

// Customize: shortcuts, toolbar, mouse gestures and templates (app-custom.js).
const customTools = createCustomTools({
  state, t, notify, renderAll, renderLeft, cancelEditing, commands, saveExport, run: (id) => run(id),
  updateSettings: (patch) => updateSettings(patch, { quiet: true }),
  renderChrome: () => { renderToolbar(); renderCommandManager(); },
  defaultShortcuts: () => defaultShortcuts(),
  allTabs: () => baseCommandTabs(),
  hasDoc: () => hasDoc(),
  currentKind: () => activeKind(),
  pickFile: (accept) => native.pickWithInput(accept, false),
  templateOfCurrent: (kind) => templateOfCurrent(kind),
  newFromTemplate: (tpl) => newFromTemplate(tpl),
  pm: { pmHead, pmGroup, pmNum, pmSeg, pmButton },
});
{
  const o = { ...more };
  const mine = (e = state.editing) => customTools.owns(e);
  more.owns = (e) => mine(e) || o.owns(e);
  more.pm = (e) => (mine(e) ? customTools.pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? customTools.pick(hit, ev) : o.pick(hit, ev));
  more.field = (k, raw, v) => (mine() ? customTools.field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? customTools.set(k, v) : o.set(k, v));
  more.toggle = (k, c) => (mine() ? customTools.toggle(k, c) : o.toggle(k, c));
  more.select = (k, v) => (mine() ? customTools.select(k, v) : o.select?.(k, v));
  more.accept = () => (mine() ? customTools.accept() : o.accept());
  more.subject = (e) => (mine(e) ? customTools.subject(e) : o.subject(e));
  more.handles = (name) => (mine() && customTools.handles(name)) || o.handles(name);
  more.command = (name, arg) => (mine() && customTools.handles(name) ? customTools.command(name, arg) : o.command(name, arg));
}
Object.assign(commands, customTools.commands);

/** A template's body from the active document: the whole project (a part or assembly) or a drawing's sheet. */
function templateOfCurrent(kind) {
  if (!project()) return null;
  if (kind === 'drawing') { const d = activeDrawing(); return d ? { drawing: drawingTemplateOf(d) } : null; }
  const k = activeKind();
  if (k !== 'part' && k !== 'assembly') return null;
  return { text: packProject(project()) };
}

/** A new document from a template: a project copy under a new name, or a drawing of the active model laid out like it. */
async function newFromTemplate(tpl) {
  if (tpl.kind === 'drawing') {
    if (!hasDoc() || !(activePart() || activeAssembly())) { notify('info', t('notice.drawingNeedsModel')); return null; }
    await newDrawing({ template: tpl });
    return activeDrawing();
  }
  if (!(await confirmReplace())) return null;
  try {
    const p = unpackProject(new TextEncoder().encode(tpl.text));
    const name = untitledName(tpl.kind);
    p.name = name;
    const d = new Doc(p, { name: `${name}.mymech` });
    await busy('progress.new', name, () => setDoc(d));
    notify('success', t('custom.tplCreated', { name, template: tpl.name }));
    return d;
  } catch (error) { showError('error.open', error, tpl.name); return null; }
}

/**
 * Mirror Part: a new part, the active one mirrored about a standard plane (an Insert Part feature with its mirror
 * set: it follows the original whenever that changes), with the original's material and colour.
 */
async function mirrorPart() {
  const src = activePart();
  if (!src) { notify('info', t('notice.partOnly')); return; }
  const r = await popups.open('prompt', { title: t('cmd.mirrorPart'), label: t('mirp.prompt'), value: 'right' });
  const plane = String(r?.value ?? '').trim().toLowerCase();
  if (!['front', 'top', 'right'].includes(plane)) { if (r?.value != null) notify('error', t('notice.invalidValue', { text: r.value })); return; }
  const part = createPart(`${src.name} (${t('mirp.suffix')})`);
  part.material = src.material; if (src.color) part.color = src.color;
  part.features.push(createFeature(part, 'insertPart', { part: src.id, mirror: plane, name: `${t('mirp.of')} ${src.name}` }));
  change('op.mirrorPart', (p) => { p.parts.push(part); });
  switchDocument({ kind: 'part', id: part.id });
  notify('success', t('mirp.made', { name: part.name }));
  renderAll();
}
commands.mirrorPart = { icon: 'mirrorPart', label: 'cmd.mirrorPart', enabled: () => Boolean(activePart()), run: () => mirrorPart() };

// Assembly weld beads (app-asmweld.js), chained the same way (and drawn after the components).
const awTools = createAsmWeldTools({
  state, t, notify, change, renderAll, renderLeft, cancelEditing, newId, project, activeAssembly, topoOf, fmt, buildPart: (p) => buildPart(p),
  viewport: () => viewport,
  pm: { pmHead, pmGroup, pmNum, pmList },
});
{
  const o = { ...more };
  const mine = (e = state.editing) => awTools.owns(e);
  more.owns = (e) => mine(e) || o.owns(e);
  more.pm = (e) => (mine(e) ? awTools.pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? awTools.pick(hit, ev) : o.pick(hit, ev));
  more.field = (k, raw, v) => (mine() ? awTools.field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? awTools.set(k, v) : o.set(k, v));
  more.toggle = (k, c) => (mine() ? awTools.toggle(k, c) : o.toggle(k, c));
  more.select = (k, v) => (mine() ? awTools.select(k, v) : o.select?.(k, v));
  more.accept = () => (mine() ? awTools.accept() : o.accept());
  more.subject = (e) => (mine(e) ? awTools.subject(e) : o.subject(e));
  more.handles = (name) => (mine() && awTools.handles(name)) || o.handles(name);
  more.command = (name, arg) => (mine() && awTools.handles(name) ? awTools.command(name, arg) : o.command(name, arg));
  more.decorate = (kind) => { o.decorate?.(kind); awTools.decorate(kind); };
}
Object.assign(commands, awTools.commands);

// Top-down design: parts edited in the context of an assembly, external references (app-incontext.js).
const icTools = createInContextTools({
  state, t, notify, change, renderAll, renderLeft, cancelEditing, newId, project, activeAssembly, activePart, switchDocument, buildPart: (p) => buildPart(p),
  componentLeaves, matchesSig, bodySpec, componentMatrix, openNewSketch, startSketchPick: () => startSketch(),
  pm: { pmHead, pmGroup, pmButton },
});
{
  const o = { ...more };
  const mine = (e = state.editing) => icTools.owns(e);
  more.owns = (e) => mine(e) || o.owns(e);
  more.pm = (e) => (mine(e) ? icTools.pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? icTools.pick(hit, ev) : o.pick(hit, ev));
  more.field = (k, raw, v) => (mine() ? icTools.field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? icTools.set(k, v) : o.set(k, v));
  more.toggle = (k, c) => (mine() ? icTools.toggle(k, c) : o.toggle(k, c));
  more.select = (k, v) => (mine() ? icTools.select(k, v) : o.select?.(k, v));
  more.accept = () => (mine() ? icTools.accept() : o.accept());
  more.subject = (e) => (mine(e) ? icTools.subject(e) : o.subject(e));
  more.handles = (name) => (mine() && icTools.handles(name)) || o.handles(name);
  more.command = (name, arg) => (mine() && icTools.handles(name) ? icTools.command(name, arg) : o.command(name, arg));
}
Object.assign(commands, icTools.commands);

// ───────────────────────── layout-based design (cad/layout.js)

/** A layout sketch's frame (from its part's build). */
const layoutFrames = (part) => (sk) => buildPart(part).result.results.get(sk.id)?.frame ?? makeFrame(STD_PLANES.top);
/** The layout component of the active assembly: the selected one, else the one marked as the layout. */
function layoutComponent() {
  const asm = activeAssembly();
  if (!asm) return null;
  const sel = state.selection.find((s) => s.kind === 'comp');
  return asm.components.find((c) => c.id === sel?.id && !c.layoutLink) ?? asm.components.find((c) => c.layout) ?? null;
}
/** New Layout: a layout part (a sketch on Top for blocks) fixed at the assembly origin, opened in context. */
function newLayout() {
  const asm = activeAssembly();
  if (!asm) { notify('info', t('notice.assemblyOnly')); return; }
  const part = createPart(`${t('lay.name')}${(project().parts.filter((p) => p.isLayout).length || 0) + 1}`);
  part.isLayout = true;
  const sk = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() });
  part.features.push(sk);
  const compId = newId('cmp');
  change('op.layout', (p) => { p.parts.push(part); asm.components.push({ id: compId, name: `${part.name}<1>`, part: part.id, position: [0, 0, 0], rotation: [0, 0, 0, 1], fixed: true, layout: true }); });
  icTools.editInContext?.(compId);
  notify('info', t('lay.started'));
}
/** Make Part from Block: a part per block of the layout, a linked component on every instance. */
function makePartFromBlock() {
  const asm = activeAssembly(); const lc = layoutComponent();
  if (!asm || !lc) { notify('info', t('lay.pickLayout')); return; }
  const lp = project().parts.find((p) => p.id === lc.part);
  let made;
  change('op.layout', (p) => { made = makePartsFromBlocks(p, asm, lc, { createPart, createFeature, newId, blockInstances, frames: layoutFrames(lp) }); });
  notify(made.comps.length ? 'success' : 'info', t(made.comps.length ? 'lay.made' : 'lay.nothing', { parts: made.parts.length, comps: made.comps.length }));
  renderAll();
}
/** Update from Layout: linked components to their instances, block parts to their blocks. */
function updateLayout({ quiet = false } = {}) {
  const asm = activeAssembly();
  if (!asm?.components.some((c) => c.layoutLink)) { if (!quiet) notify('info', t('lay.noLinks')); return null; }
  let r;
  change('op.layout', (p) => { r = updateFromLayout(p, asm, { frames: (sk) => { const part = p.parts.find((x) => x.features.includes(sk)); return part ? layoutFrames(part)(sk) : makeFrame(STD_PLANES.top); } }); });
  if (!quiet || r.moved || r.updated || r.lost.length) notify(r.lost.length ? 'warning' : 'success', t('lay.updated', { moved: r.moved, updated: r.updated, lost: r.lost.length }));
  renderAll();
  return r;
}
Object.assign(commands, {
  newLayout: { icon: 'layoutSketch', label: 'cmd.newLayout', enabled: () => Boolean(activeAssembly()), run: () => newLayout() },
  makePartFromBlock: { icon: 'partFromBlock', label: 'cmd.makePartFromBlock', enabled: () => Boolean(activeAssembly()), run: () => makePartFromBlock() },
  updateLayout: { icon: 'rebuild', label: 'cmd.updateLayout', enabled: () => Boolean(activeAssembly()?.components.some((c) => c.layoutLink)), run: () => updateLayout() },
});
// Leaving in-context editing of a layout brings what it drives up to date.
{
  const exit = commands.exitInContext.run;
  commands.exitInContext.run = (...a) => { const r = exit(...a); if (activeAssembly()?.components.some((c) => c.layoutLink)) updateLayout({ quiet: true }); return r; };
}

// Design checker (app-designcheck.js), chained the same way.
const dcTools = createDesignCheckTools({
  state, t, notify, change, renderAll, renderLeft, cancelEditing, saveExport, fileSafe, project, updateSettings, units, switchDocument, select,
  renderDrawing: () => renderDrawing(), readText: readPickedText,
  checkContext: () => designCheckContext(),
  pm: { pmHead, pmGroup, pmNum, pmSeg, pmList, pmButton, textInput },
});
/** What the design rules that need the modeller see: rebuild errors (kernel up), mates that fail (solved on a copy). */
function designCheckContext() {
  return {
    units: units(),
    localBaseName: (key) => t(`fname.${key}`, null, null),
    ...(kernelReady() ? {
      rebuildErrors: (part) => partRebuildErrors(part),
      mateFailures: (asm) => (asm.mates?.length ? solveWithFlex(structuredClone(asm), { status: false }).failed : []),
    } : {}),
  };
}
function partRebuildErrors(part) {
  const b = buildPart(part);
  return part.features.filter((f) => b.result.results.get(f.id)?.ok === false).map((f) => ({ feature: f, ...b.result.results.get(f.id) }));
}
{
  const o = { ...more };
  const mine = (e = state.editing) => dcTools.owns(e);
  more.owns = (e) => mine(e) || o.owns(e);
  more.pm = (e) => (mine(e) ? dcTools.pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? dcTools.pick(hit, ev) : o.pick(hit, ev));
  more.field = (k, raw, v) => (mine() ? dcTools.field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? dcTools.set(k, v) : o.set(k, v));
  more.toggle = (k, c) => (mine() ? dcTools.toggle(k, c) : o.toggle(k, c));
  more.accept = () => (mine() ? dcTools.accept() : o.accept());
  more.subject = (e) => (mine(e) ? dcTools.subject(e) : o.subject(e));
  more.handles = (name) => dcTools.handles(name) || o.handles(name);
  more.command = (name, arg) => (dcTools.handles(name) ? dcTools.command(name, arg) : o.command(name, arg));
}
Object.assign(commands, dcTools.commands);

// Task scheduler (app-tasks.js), chained the same way; its timer starts once the window is up.
const taskTools = createTaskTools({
  state, t, notify, renderAll, renderLeft, cancelEditing, saveExport, fileSafe, updateSettings, desktop, native, withProgress,
  doc: () => state.doc, docName: (d) => docName(d),
  readBytes: (path) => readBytes(path, ''),
  writeBytes: async (path, bytes) => { let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); await native.writeBase64File(path, btoa(bin), ''); return true; },
  storeWebHandle: (k, h) => native.storeWebHandle(k, h), loadWebHandle: (k) => native.loadWebHandle(k), forgetWebHandle: (k) => native.forgetWebHandle(k),
  withDocument, withExportSink, projectFromModel, exportModel, exportDrawing,
  activate: (ref) => { const p = project(); if (p && findDocument(p, ref)) p.active = ref; },
  docTitle: (ref) => findDocument(project(), ref)?.name ?? '',
  standard: () => dcTools.api.standard(), checkContext: () => designCheckContext(), reportHtml: (r, name) => dcTools.api.reportFor(r, name),
  rebuildErrors: (part) => (kernelReady() ? partRebuildErrors(part) : []),
  // A task on the open document: its parts, assemblies and drawings replaced in one undo step.
  replaceCurrent: (data) => change('op.task', (p) => { p.parts = data.parts; p.assemblies = data.assemblies; p.drawings = data.drawings; }),
  pm: { pmHead, pmGroup, pmNum, pmSeg, pmList, pmButton, textInput },
});
{
  const o = { ...more };
  const mine = (e = state.editing) => taskTools.owns(e);
  more.owns = (e) => mine(e) || o.owns(e);
  more.pm = (e) => (mine(e) ? taskTools.pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? taskTools.pick(hit, ev) : o.pick(hit, ev));
  more.field = (k, raw, v) => (mine() ? taskTools.field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? taskTools.set(k, v) : o.set(k, v));
  more.select = (k, v) => (mine() ? taskTools.select(k, v) : o.select?.(k, v));
  more.toggle = (k, c) => (mine() ? taskTools.toggle(k, c) : o.toggle(k, c));
  more.accept = () => (mine() ? taskTools.accept() : o.accept());
  more.subject = (e) => (mine(e) ? taskTools.subject(e) : o.subject(e));
  more.handles = (name) => taskTools.handles(name) || o.handles(name);
  more.command = (name, arg) => (taskTools.handles(name) ? taskTools.command(name, arg) : o.command(name, arg));
}
Object.assign(commands, taskTools.commands);

// Macros (app-macros.js): recording, playback, the editor window and the automation API.
const macroTools = createMacroTools({
  state, t, recorder, notify, popups, renderAll, renderLeft, renderStatus, project, active, activePart, change, saveExport, readText: readPickedText,
  projectName: () => project()?.name ?? '', version: () => state.info?.version ?? VERSION,
  run, pick: (hit, mods) => onViewportPick(hit, mods), select, pmCommand, pmSet, pmField: pmFieldChanged, pmToggle, pmSelect, pmStep,
  accept: () => acceptEditing(), cancel: () => cancelEditing(), exitSketch, switchDocument, setMaterial,
  openSample: (id) => openSampleAsk(id), newDocument: (kind) => newDocument(kind), massProperties: () => massPropertiesRows(),
  activeAssembly, insertComponent, buildPart: (p) => buildPart(p),
  addPart: (name) => addPartToProject(name), addAssembly: (name) => { addAssemblyToProject(); if (state.editing) cancelEditing({ quiet: true }); if (name) change('op.macro', () => { activeAssembly().name = String(name); }); return activeAssembly().name; }, rebuildErrors: (p) => (p && kernelReady() ? partRebuildErrors(p) : []),
  interferenceList: () => { const asm = activeAssembly(); if (!asm) return []; const R = rep(); const nameOf = (id) => asm.components.find((c) => c.id === id)?.name ?? id; return interferences(asm, (c) => { const l = componentShapes(c).map((x) => x.shape); return l.length > 1 ? R.makeCompound(l) : l[0] ?? null; }, (s) => R.measureVolume(s)).map((it) => ({ a: nameOf(it.a), b: nameOf(it.b), volume: it.volume })); },
  // A recorded sketch's contents put into the sketch being edited (then solved and drawn).
  setSketch: (g) => {
    const e = state.editing;
    if (e?.mode !== 'sketch') throw new Error(t('macro.noSketch'));
    const ed = e.editor;
    ed.feature.entities = structuredClone(g.entities ?? []); ed.feature.constraints = structuredClone(g.constraints ?? []);
    ed.selection = []; ed.pending = []; ed.chain = null;
    ed.solve(); ed.commit('op.macro');
  },
  idle: () => new Promise((resolve) => setTimeout(resolve, 16)),
});
Object.assign(commands, macroTools.commands);
emitMacro = (event, payload) => macroTools.emit(event, payload);

// Design study (app-designstudy.js): variables varied, designs rebuilt on a copy and measured; chained like the others.
const dsTools = createDesignStudyTools({
  state, t, notify, renderAll, renderLeft, cancelEditing, activePart, change, saveExport, fileSafe, fmt, withProgress,
  rep: () => rep(), massOf, buildPart: (p, o) => buildPart(p, o),
  feaMaterial: (p) => { const m = materialOf(p.material); return { E: m.E * 1000, nu: m.nu ?? 0.3, yield: m.yield, density: m.density, ultimate: m.ultimate, group: m.group }; },
  runFem: (kind, input) => more.fem.run(kind, input, activePart()?.name ?? ''),
  pm: { pmHead, pmGroup, pmNum, pmSeg, pmList, pmButton, textInput },
});
{
  const o = { ...more };
  const mine = (e = state.editing) => dsTools.owns(e);
  more.owns = (e) => mine(e) || o.owns(e);
  more.pm = (e) => (mine(e) ? dsTools.pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? dsTools.pick(hit, ev) : o.pick(hit, ev));
  more.field = (k, raw, v) => (mine() ? dsTools.field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? dsTools.set(k, v) : o.set(k, v));
  more.select = (k, v) => (mine() ? dsTools.select(k, v) : o.select?.(k, v));
  more.toggle = (k, c) => (mine() ? dsTools.toggle(k, c) : o.toggle(k, c));
  more.accept = () => (mine() ? dsTools.accept() : o.accept());
  more.subject = (e) => (mine(e) ? dsTools.subject(e) : o.subject(e));
  more.handles = (name) => dsTools.handles(name) || o.handles(name);
  more.command = (name, arg) => (dsTools.handles(name) ? dsTools.command(name, arg) : o.command(name, arg));
}
Object.assign(commands, dsTools.commands);

// Defeature (app-defeature.js): a simplified configuration (and optionally a body-only part); chained like the others.
const dfTools = createDefeatureTools({
  state, t, notify, renderAll, renderLeft, cancelEditing, activePart, change, fmt, rep: () => rep(),
  buildPart: (p, o) => buildPart(p, o), rebuildErrors: (p) => (kernelReady() ? partRebuildErrors(p) : []),
  pm: { pmHead, pmGroup, pmNum, pmSeg, pmList, pmButton, textInput },
});
{
  const o = { ...more };
  const mine = (e = state.editing) => dfTools.owns(e);
  more.owns = (e) => mine(e) || o.owns(e);
  more.pm = (e) => (mine(e) ? dfTools.pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? dfTools.pick(hit, ev) : o.pick(hit, ev));
  more.field = (k, raw, v) => (mine() ? dfTools.field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? dfTools.set(k, v) : o.set(k, v));
  more.select = (k, v) => (mine() ? dfTools.select(k, v) : o.select?.(k, v));
  more.toggle = (k, c) => (mine() ? dfTools.toggle(k, c) : o.toggle(k, c));
  more.accept = () => (mine() ? dfTools.accept() : o.accept());
  more.subject = (e) => (mine(e) ? dfTools.subject(e) : o.subject(e));
  more.handles = (name) => dfTools.handles(name) || o.handles(name);
  more.command = (name, arg) => (dfTools.handles(name) ? dfTools.command(name, arg) : o.command(name, arg));
}
Object.assign(commands, dfTools.commands);

// Markup (app-markup.js): notes drawn over the view, kept in the document with their camera and comments.
const mkTools = createMarkupTools({
  state, t, notify, change, renderAll, renderLeft, cancelEditing, newId, saveExport, fileSafe, activePart, activeAssembly,
  viewport: () => viewport, askText: (v) => sketchApi.askText(v),
  author: () => { try { return pdm.api.vault()?.user || localStorage.getItem('mymechanics.vault.author') || t('ver.defaultAuthor'); } catch { return t('ver.defaultAuthor'); } },
  pm: { pmHead, pmGroup, pmNum, pmSeg, pmList, pmButton, textInput },
});
{
  const o = { ...more };
  const mine = (e = state.editing) => mkTools.owns(e);
  more.owns = (e) => mine(e) || o.owns(e);
  more.pm = (e) => (mine(e) ? mkTools.pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? mkTools.pick(hit, ev) : o.pick(hit, ev));
  more.field = (k, raw, v) => (mine() ? mkTools.field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? mkTools.set(k, v) : o.set(k, v));
  more.select = (k, v) => (mine() ? mkTools.select(k, v) : o.select?.(k, v));
  more.toggle = (k, c) => (mine() ? mkTools.toggle(k, c) : o.toggle(k, c));
  more.accept = () => (mine() ? mkTools.accept() : o.accept());
  more.subject = (e) => (mine(e) ? mkTools.subject(e) : o.subject(e));
  more.handles = (name) => mkTools.handles(name) || o.handles(name);
  more.command = (name, arg) => (mkTools.handles(name) ? mkTools.command(name, arg) : o.command(name, arg));
}
Object.assign(commands, mkTools.commands);

// Electronics cooling of an assembly (app-electronics.js): conjugate heat transfer on the lattice, chained the same way.
const elTools = createElectronicsTools({
  state, t, notify, change, renderAll, renderLeft, cancelEditing, fmt, syncView, activeAssembly,
  viewport: () => viewport, assemblyBodies: (a) => more.fem.assemblyBodies(a), runStudy: (kind, input, name) => more.fem.run(kind, input, name),
  pm: { pmHead, pmGroup, pmNum, pmSeg, pmList, pmButton, textInput },
});
{
  const o = { ...more };
  const mine = (e = state.editing) => elTools.owns(e);
  more.owns = (e) => mine(e) || o.owns(e);
  more.pm = (e) => (mine(e) ? elTools.pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? elTools.pick(hit, ev) : o.pick(hit, ev));
  more.field = (k, raw, v) => (mine() ? elTools.field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? elTools.set(k, v) : o.set(k, v));
  more.select = (k, v) => (mine() ? elTools.select(k, v) : o.select?.(k, v));
  more.toggle = (k, c) => (mine() ? elTools.toggle(k, c) : o.toggle(k, c));
  more.accept = () => (mine() ? elTools.accept() : o.accept());
  more.subject = (e) => (mine(e) ? elTools.subject(e) : o.subject(e));
  more.handles = (name) => elTools.handles(name) || o.handles(name);
  more.command = (name, arg) => (elTools.handles(name) ? elTools.command(name, arg) : o.command(name, arg));
  more.decorate = (kind) => { o.decorate?.(kind); elTools.decorate(kind); };
}
Object.assign(commands, elTools.commands);

// Free-surface flow in a part used as a container (app-freesurface.js), chained the same way.
const fsTools = createFreeSurfaceTools({
  state, t, notify, renderAll, renderLeft, cancelEditing, fmt, syncView, activePart, buildPart: (p) => buildPart(p),
  viewport: () => viewport, runStudy: (kind, input, name) => more.fem.run(kind, input, name),
  pm: { pmHead, pmGroup, pmNum, pmSeg, pmList, pmButton, textInput },
});
{
  const o = { ...more };
  const mine = (e = state.editing) => fsTools.owns(e);
  more.owns = (e) => mine(e) || o.owns(e);
  more.pm = (e) => (mine(e) ? fsTools.pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? fsTools.pick(hit, ev) : o.pick(hit, ev));
  more.field = (k, raw, v) => (mine() ? fsTools.field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? fsTools.set(k, v) : o.set(k, v));
  more.select = (k, v) => (mine() ? fsTools.select(k, v) : o.select?.(k, v));
  more.toggle = (k, c) => (mine() ? fsTools.toggle(k, c) : o.toggle(k, c));
  more.accept = () => (mine() ? fsTools.accept() : o.accept());
  more.subject = (e) => (mine(e) ? fsTools.subject(e) : o.subject(e));
  more.handles = (name) => fsTools.handles(name) || o.handles(name);
  more.command = (name, arg) => (fsTools.handles(name) ? fsTools.command(name, arg) : o.command(name, arg));
  more.decorate = (kind) => { o.decorate?.(kind); fsTools.decorate(kind); };
}
Object.assign(commands, fsTools.commands);

// Standard parts library, smart fasteners, pipe / tube / cable routes and photo rendering (app-std.js).
const std = createStdTools({
  state, t, notify, change, commit, syncView, renderAll, renderLeft, cancelEditing, ensureKernel, newId, fmt, fmtLen, parseLen, units, lang, fitView, saveExport, fileSafe,
  viewport: () => viewport, viewHost: () => root.querySelector('#view-host'), activeName: () => active()?.name ?? '', project, activePart, activeAssembly, topoOf, assemblySize,
  beginFeature, updateFeature, buildPart: (p) => buildPart(p),
  // Routing components: the connection / route points of the active assembly's components, in its frame.
  routingPoints: () => { const a = activeAssembly(); if (!a) return []; const out = []; for (const c of a.components) { if (c.suppressed || !c.part) continue; for (const cp of connectionPointsOf(c.part)) if (cp.routeType) out.push({ comp: c.id, compName: c.name, ...cp, point: placePoint(c, cp.point), dir: placeDir(c, cp.dir) }); } return out; },
  partEntry: (c) => { const pt = project()?.parts.find((x) => x.id === c.part); return pt ? buildPart(pt) : null; },
  // Every part of a component (a sub-assembly's parts with their placement in it) and its build, for hole series.
  partLeaves: (c) => componentLeaves(c).map((l) => { const pt = project()?.parts.find((x) => x.id === l.part); return pt ? { ...l, entry: buildPart(pt) } : null; }).filter(Boolean),
  pm: { pmHead, pmGroup, pmNum, pmSeg, pmList, pmButton, textInput },
});
Object.assign(commands, std.commands);

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
  // One submenu per family (steel, tool steel, stainless, … wood, ceramics): the list is long.
  const item = (m) => { handlers[`custom:mat:${m.id}`] = () => setMaterial(m.id); return { id: `custom:mat:${m.id}`, label: `${lang() === 'en' ? m.en : m.ko} — ${m.density} kg/m³`, icon: 'material', checked: part.material === m.id }; };
  const items = MATERIAL_FAMILIES.map((fam) => [fam, MATERIALS.filter((m) => familyOf(m) === fam)]).filter(([, list]) => list.length).map(([fam, list]) => ({ id: `submenu:mat-${fam}`, label: t(`matFamily.${fam}`), icon: 'material', submenu: true, checked: list.some((m) => m.id === part.material), children: list.map(item) }));
  return showMenu(items, anchor ?? anchorFor('material'), 'context', { handlers, header: { icon: 'material', title: t('cmd.material') } });
}

function setMaterial(id) { return recorder.around('material', [id], () => setMaterialImpl(id)); }
function setMaterialImpl(id) {
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
  // A command of a CommandManager flyout becomes that flyout's button (the one used last).
  const fly = FLY_OF.get(id);
  if (fly && state.flyLast[fly] !== id) { state.flyLast[fly] = id; queueMicrotask(() => renderCommandManager()); }
  try { return await recorder.around('run', [id], () => c.run(context)); } catch (error) { return showError('error.command', error, t(c.label)); }
}

const SUBMENUS = {
  newDoc: { icon: 'fileNew', items: ['newPart', 'newAssembly', 'newDrawing', '-', 'newProjectPart'] },
  exportTo: { icon: 'exportFile', items: ['exportStep', 'exportIges', 'exportXt', 'exportXb', 'exportStl', 'exportScad', '-', 'exportMesh:glb', 'exportMesh:gltf', 'exportMesh:obj', 'exportMesh:ply', 'exportMesh:3mf', 'exportMesh:off', 'exportMesh:amf', 'exportMesh:wrl', 'exportMesh:usdz', '-', 'exportImage', 'exportDxf', 'exportDwg', 'exportSvg', '-', 'exportSketchDxf', 'exportSketchDwg', 'exportFlatDxf', 'exportFlatDwg'] },
  views: { icon: 'views', items: ['view:front', 'view:back', 'view:top', 'view:bottom', 'view:left', 'view:right', '-', 'view:iso', 'view:dimetric', 'view:trimetric', '-', 'normalTo'] },
  displayStyle: { icon: 'styleShaded', items: ['style:shadedEdges', 'style:shaded', 'style:hiddenRemoved', 'style:hiddenVisible', 'style:wireframe'] },
  show: { icon: 'eye', items: ['showPlanes', 'showOrigin', 'showSketches', '-', 'showRulers', 'showGrid', 'gridPlane:front', 'gridPlane:top', 'gridPlane:right', 'showScaleBar', '-', 'leftPanel', 'rightPanel', 'bottomPanel', 'statusBar', 'fps'] },
  appearance: { icon: 'palette', items: ['theme', 'themeMenu', 'language', '-', 'shuffleBackground', 'backgroundImage', 'clearBackground'] },
  sketchEntities: { icon: 'lineTool', items: ['sk:line', 'sk:centerline', '-', 'sk:rect', 'sk:centerRect', 'sk:rect3', 'sk:rect3c', 'sk:parallelogram', '-', 'sk:circle', 'sk:circle3', 'sk:arc3', 'sk:centerArc', 'sk:tangentArc', '-', 'sk:polygon', 'sk:slot', 'sk:slotCenter', 'sk:slotArc3', 'sk:slotArcCenter', 'sk:spline', 'sk:styleSpline', 'sk:equation', '-', 'sk:ellipse', 'sk:partialEllipse', 'sk:parabola', 'sk:conic', '-', 'sk:point', 'sk:text'] },
  sketchTools: { icon: 'sketchFillet', items: ['sk:fillet', 'sk:chamfer', 'sk:offset', 'sk:mirror', 'sk:dynamicMirror', 'sk:linPattern', 'sk:cirPattern', 'sk:trim', 'sk:extend', 'sk:split', '-', 'sk:convert', 'sk:intersect', 'sk:silhouette', 'sk:silhouetteInternal', 'sk:move', 'sk:copy', 'sk:rotate', 'sk:scale', 'sk:stretch', '-', 'sk:fullyDefine', 'sk:baselineDim', 'sk:repair', 'sk:autotrace'] },
  patterns: { icon: 'featLinPattern', items: ['linearPattern', 'circularPattern', 'mirror', '-', 'curvePattern', 'sketchPattern', 'tablePattern', 'fillPattern', 'variablePattern'] },
  refGeometry: { icon: 'refAxis', items: ['refPlane', 'refAxis', 'refPoint', 'coordSys', 'boundingBox'] },
  curves: { icon: 'curveXYZ', items: ['projectedCurve', 'splitLine', 'compositeCurve', 'curveXYZ', 'surfaceSpline', 'helix'] },
  bossBase: { icon: 'featExtrude', items: ['extrude', 'revolve', 'sweep', 'loft', 'thicken'] },
  cutFeat: { icon: 'featCut', items: ['cutExtrude', 'cutRevolve', 'cutSweep', 'cutLoft'] },
  featuresMore: { icon: 'featDraft', items: ['fillet', 'variableFillet', 'faceFillet', 'fullRoundFillet', 'chamfer', 'shell', 'draft', 'rib', 'dome', 'wrap', 'hole', 'thread', 'helix'] },
  surfaces: { icon: 'surface', items: ['surfaceExtrude', 'surfaceRevolve', 'surfacePlanar', 'surfaceLoft', 'boundary', 'fillSurface', 'surfaceOffset', 'ruledSurface', 'trimSurface', 'extendSurface', 'knit', 'surfaceFillet', 'thicken', '-', 'surfaceSweep', 'radiateSurface', 'midSurface', 'untrimSurface', 'deleteHole', 'cutWithSurface', 'flattenSurface', '-', 'deleteFace', 'replaceFace'] },
  bodies: { icon: 'moveBody', items: ['moveBody', 'scaleBody', 'split', 'insertPart', 'mirrorPart', 'openscadFeature', '-', 'combine', 'deleteBody', 'indent', 'flex', 'deform', 'freeform'] },
  sheetMetal: { icon: 'sheetMetal', items: ['baseFlange', 'convertSheet', 'insertBends', 'edgeFlange', 'miterFlange', 'hem', 'tab', 'loftedBend', 'sketchedBend', 'jog', '-', 'closedCorner', 'weldedCorner', 'cornerRelief', 'rip', 'formTool', 'crossBreak', 'tabSlot', '-', 'unfold', 'fold', 'flatten', 'exportFlatDxf'] },
  fastening: { icon: 'mountingBoss', items: ['mountingBoss', 'snapHook', 'snapHookGroove', 'vent', 'lipGroove'] },
  partExtra: { icon: 'advancedHole', items: ['advancedHole', 'intersect', 'mateReference', 'connectionPoint', 'moveFace', '-', 'saveBodies', '-', 'exitInContext', 'updateExternalRefs', 'externalRefs'] },
  weldments: { icon: 'structural', items: ['structural', 'trimExtend', 'endCap', 'gusset', 'weldBead', '-', 'cutList'] },
  mold: { icon: 'cavity', items: ['draftAnalysis', 'draft', 'partingLine', 'toolingSplit', 'sideCore', 'shrink', 'split', 'cavity'] },
  annotations: { icon: 'note', items: ['ann:note', 'ann:balloon', 'ann:gdt', 'ann:datum', 'ann:datumTarget', 'ann:surface', 'ann:centermark', '-', 'ann:cloud', 'ann:hatch', '-', 'bom', 'weldTable', 'cutListTable', 'bendTable'] },
  drawingViews: { icon: 'drawingView', items: ['std3View', 'addView', 'sectionView', 'sectionViewH', 'alignedSection', 'detailView', 'auxView', '-', 'flatPatternView', 'alternatePositionView'] },
};
const sub = (key) => ({ sub: key });
const MENUS = {
  file: [sub('newDoc'), 'templates', 'openExample', 'open', 'startPage', 'recent', 'recentFolders', 'clearRecent', '-', 'save', 'saveAs', '-', 'importStep', 'importIdf', sub('exportTo'), 'exportIdf', '-', 'print', '-', 'closeProject', 'exit'],
  edit: ['undo', 'redo', '-', 'delete', 'rename', '-', 'rebuild', 'editFeature', 'suppress', 'unsuppress', '-', 'rollbackHere', 'rollbackEnd', '-', 'clearSelection'],
  view: [sub('views'), 'zoomFit', 'perspective', '-', sub('displayStyle'), 'section', 'lights', '-', sub('show'), '-', sub('appearance')],
  insert: ['sketch', '-', sub('bossBase'), sub('cutFeat'), sub('featuresMore'), sub('patterns'), '-', sub('surfaces'), sub('bodies'), sub('fastening'), sub('partExtra'), sub('sheetMetal'), sub('weldments'), sub('mold'), '-', 'refPlane', sub('refGeometry'), sub('curves'), 'material', '-', sub('drawingViews'), sub('annotations')],
  sketch: ['sketch', 'sketch3d', 'exitSketch', 'cancelSketch', '-', 'sk:select', sub('sketchEntities'), sub('sketchTools'), '-', 'sk:dimension', 'construction', '-', 'normalTo'],
  tools: ['massProps', 'measure', 'simulation', 'draftAnalysis', '-', 'equations', 'configurations', 'designTable', 'importTable', '-', 'insertComponent', 'mate', 'fixComponent', 'floatComponent', 'interference', 'explode', 'motion', '-', 'newDrawing', 'std3View', 'addView', '-', 'settings'],
  help: ['welcome', 'userGuide', 'tutorialDoc', 'shortcuts', '-', 'settings', 'about'],
};
drwTools.extendMenus(SUBMENUS, MENUS);
const MENU_ICONS = { file: 'file', edit: 'edit', view: 'eye', insert: 'featExtrude', sketch: 'featSketch', tools: 'tools', help: 'question' };

const TOOLBAR = [
  ['newSplit', 'open', 'save', 'print', 'exportSplit', 'importStep', 'exitProject'],
  ['undo', 'redo', 'rebuild'],
  ['viewsSplit', 'zoomFit', 'normalTo', 'perspective'],
  ['styleSplit', 'section', 'lights', 'showRulers', 'showGrid'],
  ['massProps', 'measure'],
];
const TOOLBAR_RIGHT = ['themeSplit', 'language', 'settings', 'about'];
/** The toolbar's groups and the user's own (Customize › Toolbar) after them. */
const toolbarGroups = () => { const extra = customTools.api.toolbarExtra(); return extra.length ? [...TOOLBAR, extra] : TOOLBAR; };
const TOOLBAR_MAIN = { newSplit: 'newPart', exportSplit: 'exportStep', themeSplit: 'theme', viewsSplit: 'view:iso', styleSplit: 'styleCycle' };

/** The CommandManager: tabs of big buttons above the graphics area (a ribbon). */
const COMMAND_TABS = {
  features: ['sketch', '|', 'extrude', 'revolve', 'sweep', 'loft', '|', 'cutExtrude', 'cutRevolve', 'cutSweep', 'cutLoft', '|', 'fillet', 'chamfer', 'shell', 'draft', 'rib', 'dome', 'wrap', '|', 'hole', 'thread', 'helix', '|', 'linearPattern', 'circularPattern', 'mirror', '|', 'refPlane', 'refAxis', 'refPoint', 'coordSys', 'boundingBox', 'moveBody', 'split', 'insertPart', 'openscadFeature', 'material', 'decals', 'rebuild'],
  bodiesCurves: ['combine', 'deleteBody', 'indent', 'flex', 'deform', 'freeform', 'intersect', 'saveBodies', '|', 'advancedHole', 'mateReference', 'connectionPoint', 'moveFace', '|', 'exitInContext', 'updateExternalRefs', 'externalRefs', '|', 'mountingBoss', 'snapHook', 'snapHookGroove', 'vent', 'lipGroove', '|', 'variableFillet', 'faceFillet', 'fullRoundFillet', '|', 'curvePattern', 'sketchPattern', 'tablePattern', 'fillPattern', 'variablePattern', '|', 'projectedCurve', 'splitLine', 'compositeCurve', 'curveXYZ'],
  sketch: ['sketch', 'sketch3d', 'sk:dimension', '|', 'sk:line', 'sk:centerline', 'sk:rect', 'sk:centerRect', 'sk:rect3', 'sk:rect3c', 'sk:parallelogram', 'sk:circle', 'sk:circle3', 'sk:arc3', 'sk:centerArc', 'sk:tangentArc', 'sk:polygon', 'sk:slot', 'sk:slotCenter', 'sk:slotArc3', 'sk:slotArcCenter', 'sk:spline', 'sk:styleSpline', 'sk:equation', 'sk:ellipse', 'sk:partialEllipse', 'sk:parabola', 'sk:conic', 'sk:point', 'sk:text', '|', 'sk:fillet', 'sk:chamfer', 'sk:offset', 'sk:mirror', 'sk:dynamicMirror', 'sk:linPattern', 'sk:cirPattern', 'sk:trim', 'sk:extend', 'sk:split', '|', 'sk:convert', 'sk:intersect', 'sk:silhouette', 'sk:silhouetteInternal', 'sk:move', 'sk:copy', 'sk:rotate', 'sk:scale', 'sk:stretch', '|', 'sk:fullyDefine', 'sk:baselineDim', 'sk:repair', 'sk:autotrace', 'construction', 'normalTo', 'sk:select'],
  surfaces: ['surfaceExtrude', 'surfaceRevolve', 'surfacePlanar', 'surfaceLoft', 'boundary', 'fillSurface', 'surfaceOffset', 'ruledSurface', '|', 'trimSurface', 'extendSurface', 'knit', 'surfaceFillet', '|', 'surfaceSweep', 'radiateSurface', 'midSurface', 'untrimSurface', 'deleteHole', 'cutWithSurface', 'flattenSurface', '|', 'deleteFace', 'replaceFace', '|', 'thicken', 'sketch3d', '|', 'scanToSolid', 'recognizeFeatures'],
  sheetMetal: ['baseFlange', 'convertSheet', 'insertBends', 'edgeFlange', 'miterFlange', 'hem', 'tab', 'loftedBend', 'sketchedBend', 'jog', '|', 'closedCorner', 'weldedCorner', 'cornerRelief', 'rip', 'formTool', 'crossBreak', 'tabSlot', '|', 'unfold', 'fold', 'flatten', 'exportFlatDxf', '|', 'hole', 'cutExtrude'],
  weldments: ['sketch', 'sketch3d', 'structural', 'trimExtend', '|', 'endCap', 'gusset', 'weldBead', '|', 'cutList', 'frameStudy'],
  mold: ['draftAnalysis', 'draft', 'partingLine', 'toolingSplit', 'sideCore', 'shrink', 'split', 'cavity'],
  evaluate: ['massProps', 'measure', 'sectionProperties', 'section', 'lights', 'interference', '|', 'simulation', 'draftAnalysis', '|', 'equations', 'configurations', 'designTable', 'importTable', 'designStudy'],
  assembly: ['insertComponent', 'newPartInContext', 'editInContext', 'newLayout', 'makePartFromBlock', 'updateLayout', 'mate', 'magneticSnap', 'fixComponent', 'floatComponent', 'flexibleComponent', 'rotateComponent', 'rotateComponentX', 'rotateComponentY', 'openPart', '|', 'explode', 'explodeEditor', 'explodeAnimate', 'resetExplode', 'motion', '|', 'illustration', 'ilAddView', 'ilPlay', 'ilExportHtml', '|', 'interference', 'massProps', 'assemblyVisualization', 'assemblyVisualizationOff', 'asmWeldBead', 'largeAssemblyMode', 'simplifyOuter', 'simplifyBox', 'simplifyFull'],
  drawing: ['newDrawing', 'std3View', 'addView', 'sectionView', 'removedSection', 'relativeView', 'view3dDrawing', 'alignedSection', 'detailView', 'auxView', 'flatPatternView', 'alternatePositionView', '|', 'ann:note', 'ann:balloon', 'ann:gdt', 'ann:datum', 'ann:datumTarget', 'ann:surface', 'ann:centermark', 'ann:cloud', 'ann:hatch', 'bom', 'weldTable', 'cutListTable', 'bendTable', '|', 'hiddenLines', 'autoDims', '|', 'exportDxf', 'exportDwg', 'exportSvg', 'print'],
};
// Bodies, curves, fastening features and external references are flyouts of the Features tab (no tab of their own).
COMMAND_TABS.features.push('|', ...COMMAND_TABS.bodiesCurves);
delete COMMAND_TABS.bodiesCurves;
for (const [tab, ids] of Object.entries(more.TABS)) COMMAND_TABS[tab]?.push('|', ...ids);
COMMAND_TABS.assembly.push('|', ...asmTools.TAB);
more.extendMenus(MENUS);
COMMAND_TABS.stdTools = std.TAB;
Object.assign(COMMAND_TABS, mfgTools.TABS);
mfgTools.extendMenus(SUBMENUS, MENUS);
SUBMENUS.illustration = { icon: 'illustration', items: ['illustration', 'ilAddView', 'ilPlay', '-', 'ilExportSvg', 'ilExportHtml'] };
SUBMENUS.macros = { icon: 'macroEditor', items: ['macroRecord', 'macroStop', '-', 'macroRun', 'macroEditor'] };
MENUS.tools?.push({ sub: 'illustration' }, 'schematic', 'schFromTo', '-', 'designCheck', 'designStudy', 'defeature', 'taskScheduler', { sub: 'macros' }, '-', 'markup', 'markupReport');
COMMAND_TABS.evaluate?.push('|', 'designCheck');
SUBMENUS.stdRouting = std.SUBMENU;
MENUS.insert.push('-', sub('stdRouting'));
MENUS.view.splice(MENUS.view.indexOf('lights') + 1, 0, 'renderView', 'walkthrough', 'recordVideo');
MENUS.tools.splice(MENUS.tools.indexOf('motion') + 1, 0, '-', 'stdLibrary', 'smartFastener', 'renderView', 'walkthrough', 'recordVideo');
COMMAND_TABS.evaluate?.splice(COMMAND_TABS.evaluate.indexOf('lights') + 1, 0, 'walkthrough', 'recordVideo');
MENUS.tools.push('-', 'customize');
MENUS.tools.splice(MENUS.tools.indexOf('interference') + 1, 0, 'holeAlignment', 'replaceComponent', 'copyWithMates', 'envelopeComponent', 'envelopeSelectInside', 'envelopeSelectCrossing');

// ── Every command can be reached from the menu bar too (the CommandManager's flyout families as submenus).
{
  const family = (key) => { const ids = FLYOUTS[key] ?? MENU_ONLY[key]; SUBMENUS[key] ??= { icon: commands[ids[0]]?.icon ?? 'dot', items: ids.filter((id) => commands[id]) }; return sub(key); };
  const drop = (list, ids) => { for (const id of ids) { const i = list.indexOf(id); if (i >= 0) list.splice(i, 1); } };
  const after = (list, anchorId, ids) => { const i = list.findIndex((x) => x === anchorId || (typeof x === 'object' && x.sub === anchorId)); list.splice(i >= 0 ? i + 1 : list.length, 0, ...ids); };
  // Assembly: a menu of its own (the commands leave Tools).
  const ASM = ['insertComponent', 'newPartInContext', 'editInContext', 'openPart', 'newLayout', 'makePartFromBlock', 'updateLayout', 'mate', 'smartMate', 'magneticSnap', 'fixComponent', 'floatComponent', 'flexibleComponent',
    'moveComponent', 'rotateComponent', 'rotateComponentX', 'rotateComponentY', ...FLYOUTS.compPattern, 'explode', 'explodeEditor', 'explodeAnimate', 'resetExplode', 'motion', 'interference', 'clearanceCheck', 'holeAlignment',
    'assemblyVisualization', 'assemblyVisualizationOff', 'largeAssemblyMode', 'simplifyOuter', 'simplifyBox', 'simplifyFull', 'asmCut', 'asmHole', 'asmWeldBead', 'beltChain', 'replaceComponent', 'copyWithMates', ...FLYOUTS.envelope];
  drop(MENUS.tools, ASM);
  const tools = MENUS.tools;
  const entries = Object.entries(MENUS);
  const assembly = ['insertComponent', 'vaultInsert', family('inContext'), family('layout'), '-', family('mates'), family('fixFloat'), family('moveComp'), family('compPattern'), '-', family('explodeFly'), 'motion', '-',
    family('asmChecks'), family('asmVis'), family('simplify'), '-', family('asmFeat'), family('compTools'), family('envelope')];
  // Keep the menu bar's order: File, Edit, View, Insert, Sketch, Assembly, Tools, Help.
  for (const k of Object.keys(MENUS)) delete MENUS[k];
  for (const [k, v] of entries) { if (k === 'tools') MENUS.assembly = assembly; MENUS[k] = v; }
  MENU_ICONS.assembly = 'assembly';
  // Edit: the FeatureManager's folders (also on the tree's right-click menu).
  after(MENUS.edit, 'unsuppress', ['-', 'newFolder', 'renameFolder', 'dissolveFolder']);
  // Tools: the analysis displays, the frame study.
  after(tools, 'measure', [family('analysisMenu')]);
  after(tools, 'simulation', ['frameStudy']);
  // View: decals with the lights.
  after(MENUS.view, 'lights', ['decals']);
  // Insert: scan to solid, the drawing views, sheets and tables.
  SUBMENUS.surfaces.items.push('-', 'scanToSolid', 'recognizeFeatures');
  SUBMENUS.drawingViews.items.push('-', 'removedSection', 'relativeView', 'view3dDrawing', 'brokenOutSection', 'breakView', 'cropView', '-', 'hiddenLines', 'autoDims');
  SUBMENUS.annotations.items.push('-', 'holeTable', 'revisionTable');
  after(MENUS.insert, 'drawingViews', [family('drwSheetsMenu')]);
  // Manufacturing: every operation and result.
  if (SUBMENUS.mfgCam) SUBMENUS.mfgCam.items = ['camManager', 'camStock', 'camTools', '-', 'camRecognize', 'camPlan', '-', family('cam25'), family('camHoles'), family('cam3d'), family('camMulti'), family('camTurn'), '-', 'camGenerate', 'camSimulate', 'camPost', 'camSetupSheet'];
  if (SUBMENUS.mfgPlastics) SUBMENUS.mfgPlastics.items = ['plasticsStudy', 'plGate', 'plSuggest', '-', 'plRun', family('plResults'), 'plFiber', 'plCooling', 'plWarp', '-', 'plReport'];
  if (SUBMENUS.mfgInspection) SUBMENUS.mfgInspection.items = ['inspBalloon', 'inspTable', 'inspRenumber', 'inspClear', '-', 'inspImport', '-', 'inspCsv', 'inspExcel', 'inspReport'];
}

/** The CommandManager's tabs with the user's choices: hidden ones left out, My tools first when it has commands. */
function visibleCommandTabs() {
  const base = baseCommandTabs();
  const hidden = new Set(state.settings.hiddenTabs ?? []);
  let tabs = base.filter((id) => !hidden.has(id));
  if (!tabs.length && base.length) tabs = [base[0]];
  const mine = customTools.api.userTab();
  COMMAND_TABS.user = mine;
  return base.length && mine.length ? ['user', ...tabs] : tabs;
}

function baseCommandTabs() {
  const kind = activeKind();
  if (kind === 'part') return ['features', 'sketch', 'surfaces', 'sheetMetal', 'weldments', 'mold', 'stdTools', 'evaluate', 'drawing', 'cam', 'plastics'];
  if (kind === 'assembly') return ['assembly', 'stdTools', 'evaluate', 'drawing'];
  if (kind === 'drawing') return ['drawing', 'inspection'];
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
  // The panel toggles sit just left of the window buttons (minimize · maximize · close).
  // (no panel toggles here: each panel has its own collapse / expand button; View › Show and Ctrl+J … keep them)
  const panels = '';
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
    if (id === 'newSplit') return split('newPart', 'newMenu', 'action.newMenu');
    if (id === 'exportSplit') return split('exportStep', 'exportMenu', 'action.exportMenu');
    if (id === 'themeSplit') return split('theme', 'themeMenu', 'action.themeChoose');
    if (id === 'viewsSplit') return split('view:iso', 'viewsMenu', 'action.viewsMenu');
    if (id === 'styleSplit') return split('styleCycle', 'styleMenu', 'action.styleMenu');
    return plain(id);
  };
  toolbar.innerHTML = `<div class="toolbar-inner">
    <div class="toolbar-left">${toolbarGroups().map((group, i) => `${i ? `<span class="tool-sep" data-group-sep="${i}" aria-hidden="true"></span>` : ''}<div class="tool-group" data-group="${i}">${group.map(button).join('')}</div>`).join('')}<button class="tool-button toolbar-more" data-toolbar-more hidden title="${escapeHtml(t('toolbar.more'))}" aria-label="${escapeHtml(t('toolbar.more'))}" aria-haspopup="true">${icon('toolbarMore')}</button></div>
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
  state.toolbarHidden = toolbarGroups().slice(cut);
}

function showToolbarMore(button) {
  const ids = (state.toolbarHidden ?? []).flatMap((group, i) => [...(i ? ['-'] : []), ...group.map((id) => TOOLBAR_MAIN[id] ?? id)]).filter((id) => id === '-' || commands[id]);
  if (ids.length) showMenu(menuItems(ids), anchorBelow(button));
}

function renderToolbarState() {
  for (const el of root.querySelectorAll('#toolbar [data-command], #palette-host [data-command], #tabs [data-command], #menubar [data-command]')) {
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

/** Document tabs: every part, assembly and drawing of the project (the open document windows). */
function renderTabs() {
  renderTitleProject();
  const tabs = root.querySelector('#tabs');
  const p = state.showStart ? null : project();
  if (!p) { tabs.innerHTML = ''; return; }
  const glyph = { part: 'part', assembly: 'assembly', drawing: 'drawing' };
  const list = documentsOf(p);
  tabs.innerHTML = `<div class="tab-strip">${list.map(({ kind, doc: d }) => `<button class="tab ${p.active?.id === d.id ? 'active' : ''}" data-doc-tab="${kind}:${escapeHtml(d.id)}" title="${escapeHtml(`${t(`doc.${kind}`)}: ${d.name}`)}">${icon(glyph[kind])}<span>${escapeHtml(d.name)}</span><span class="tab-close" data-doc-close="${kind}:${escapeHtml(d.id)}" role="button" aria-label="${escapeHtml(t(list.length > 1 ? 'tabs.removeDoc' : 'action.closeProject'))}" title="${escapeHtml(t(list.length > 1 ? 'tabs.removeDoc' : 'action.closeProject'))}">${icon('close', 'icon tiny')}</span></button>`).join('')}
      <button class="tab-add" data-command="newPart" title="${escapeHtml(commandTip('newPart'))}">${icon('plus')}</button></div>
    <span class="grow"></span>
    <span class="tab-scroll" role="group" aria-label="${escapeHtml(t('tabs.scroll'))}"><button class="icon-button" data-tab-scroll="-1" title="${escapeHtml(t('tabs.scrollLeft'))}" aria-label="${escapeHtml(t('tabs.scrollLeft'))}">${icon('chevronLeft')}</button><button class="icon-button" data-tab-scroll="1" title="${escapeHtml(t('tabs.scrollRight'))}" aria-label="${escapeHtml(t('tabs.scrollRight'))}">${icon('chevronRight')}</button></span>
`; // (the standard views are the toolbar's views button — not repeated here)
  const strip = tabs.querySelector('.tab-strip');
  strip.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  strip.addEventListener('scroll', frameThrottle(updateTabScroll), { passive: true });
  updateTabScroll();
}

/** The document tabs scroll sideways when there are more than fit; the arrows say which way there is more. */
function updateTabScroll() {
  for (const [stripSel, attr] of [['#tabs .tab-strip', 'tabScroll'], ['#palette-host .cm-tabs', 'cmScroll']]) {
    const strip = root.querySelector(stripSel);
    if (!strip) continue;
    const can = (dir) => (dir < 0 ? strip.scrollLeft > 1 : strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1);
    const name = attr === 'tabScroll' ? 'data-tab-scroll' : 'data-cm-scroll';
    // Both arrows are always shown; one is dimmed when there is nothing more that way.
    for (const btn of root.querySelectorAll(`[${name}]`)) btn.disabled = !can(Number(btn.dataset[attr]));
  }
}

function renderCommandManager() {
  const host = root.querySelector('#palette-host');
  if (!host) return;
  const tabs = visibleCommandTabs();
  host.hidden = state.showStart || !state.doc || !tabs.length;
  if (host.hidden) { host.innerHTML = ''; return; }
  if (!tabs.includes(state.cmTab)) state.cmTab = tabs[0];
  // The tab's commands with the families folded into flyouts (My tools stays as the user arranged it).
  const raw = COMMAND_TABS[state.cmTab].filter((id) => id === '|' || commands[id]);
  ribbonGroups();
  const ids = state.cmTab === 'user' ? raw : (groupedTabs.tabs[state.cmTab] ?? raw);
  const flyMembers = (key) => groupedTabs.members[key] ?? [];
  const button = (id) => {
    if (id === '|') return '<span class="cm-sep" aria-hidden="true"></span>';
    if (!id.startsWith('fly:')) return `<button class="cm-button" data-command="${id}" title="${escapeHtml(commandTip(id))}">${icon(commands[id].icon)}<span>${escapeHtml(t(commands[id].label))}</span></button>`;
    const key = id.slice(4); const members = flyMembers(key);
    const main = members.includes(state.flyLast[key]) ? state.flyLast[key] : members[0];
    const more = t('fly.more', { name: t(`fly.${key}`) });
    return `<span class="cm-fly" data-fly-items="${members.join(' ')}"><button class="cm-button" data-command="${main}" title="${escapeHtml(commandTip(main))}">${icon(commands[main].icon)}<span>${escapeHtml(t(commands[main].label))}</span></button><button class="cm-fly-arrow" data-fly="${key}" title="${escapeHtml(more)}" aria-label="${escapeHtml(more)}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
  };
  host.innerHTML = `<div class="cm-tab-row"><div class="cm-tabs" role="tablist">${tabs.map((id) => `<button class="cm-tab ${state.cmTab === id ? 'active' : ''}" data-cm-tab="${id}" role="tab" aria-selected="${state.cmTab === id}">${escapeHtml(t(`cm.${id}`))}</button>`).join('')}</div>
    <span class="tab-scroll cm-scroll" role="group" aria-label="${escapeHtml(t('tabs.scroll'))}"><button class="icon-button" data-cm-scroll="-1" title="${escapeHtml(t('tabs.scrollLeft'))}" aria-label="${escapeHtml(t('tabs.scrollLeft'))}">${icon('chevronLeft')}</button><button class="icon-button" data-cm-scroll="1" title="${escapeHtml(t('tabs.scrollRight'))}" aria-label="${escapeHtml(t('tabs.scrollRight'))}">${icon('chevronRight')}</button></span></div>
    <div class="cm-buttons">${ids.map(button).join('')}</div>`;
  fitCommandManager();
  renderToolbarState();
  const strip = host.querySelector('.cm-tabs');
  strip.querySelector('.cm-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  strip.addEventListener('scroll', frameThrottle(updateTabScroll), { passive: true });
  updateTabScroll();
}

/** Labels go when the buttons do not fit the width (icons only, names in the tooltips). */
function fitCommandManager() {
  const host = root.querySelector('#palette-host');
  const row = host?.querySelector('.cm-buttons');
  if (!row) return;
  // Always icons only (the same at any width); each button's name, key and hint are in its tooltip.
  host.classList.add('compact');
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
  state.leftTab = editing ? 'pm' : 'tree';
  const treeScroll = panel.querySelector('.left-tree-body')?.scrollTop ?? 0;
  const pmScroll = panel.querySelector('.left-pm-body')?.scrollTop ?? 0;
  const wasEditing = panel.dataset.editing === '1';
  // Two sections, one above the other: the FeatureManager tree and the PropertyManager.
  // The PropertyManager section is always there; with nothing being made or edited it holds only the hint.
  const what = editing ? pmSubject() : '';
  const ratio = Math.min(0.85, Math.max(0.15, Number(state.settings.leftPmRatio) || 0.55));
  const pmBody = editing
    ? propertyManagerHtml(pmApi())
    : state.settings.showPmHint !== false ? `<p class="left-pm-hint">${icon('info', 'icon tiny')}<span>${escapeHtml(t('panel.pmInactiveTip'))}</span></p>` : '';
  panel.innerHTML = `<section class="left-section left-tree-section" style="flex: ${1 - ratio} 1 0">
      <div class="panel-header left-section-header" title="${escapeHtml(`${t('panel.tree')} — ${t('panel.treeTip')}`)}">${icon('featExtrude')}<span class="left-section-title">${escapeHtml(t('panel.tree'))}</span>
        <span class="grow"></span>
        <button class="icon-button" data-command="leftPanel" title="${escapeHtml(t('panel.collapseLeft'))}">${icon('panelLeftClose')}</button></div>
      <div class="panel-body left-tree-body">${treeHtml(treeApi())}${more.treeExtra()}</div>
    </section>
    <div class="splitter horizontal left-pm-split" data-split="leftPm" role="separator" aria-orientation="horizontal" title="${escapeHtml(t('panel.pmSplit'))}"></div>
    <section class="left-section left-pm-section ${editing ? 'active' : 'idle'}" style="flex: ${ratio} 1 0">
      <div class="panel-header left-section-header" title="${escapeHtml(editing ? `${t('panel.pm')} — ${what}` : t('panel.pmInactiveTip'))}">${icon('editFeature')}<span class="left-section-title">${escapeHtml(t('panel.pm'))}</span>${editing ? `<span class="left-section-subject">${escapeHtml(what)}</span>` : ''}</div>
      <div class="panel-body left-pm-body">${pmBody}</div>
    </section>`;
  panel.dataset.editing = editing ? '1' : '0';
  panel.classList.add('left-split');
  panel.querySelector('.left-tree-body').scrollTop = treeScroll;
  // A new editing session starts at the top of its page; re-renders while editing keep the place.
  panel.querySelector('.left-pm-body').scrollTop = editing && wasEditing ? pmScroll : 0;
}

/** Drag the divider between the tree and the PropertyManager (the share is kept in the settings). */
function startLeftPmSplit(event) {
  const panel = root.querySelector('#left-panel');
  if (!panel) return;
  event.preventDefault();
  const rect = panel.getBoundingClientRect();
  const start = Number(state.settings.leftPmRatio) || 0.55;
  pointerDrag(event, {
    cursor: 'row-resize',
    move: (dx, dy) => {
      const ratio = Math.min(0.85, Math.max(0.15, start - dy / Math.max(1, rect.height)));
      state.settings.leftPmRatio = Math.round(ratio * 1000) / 1000;
      const tree = panel.querySelector('.left-tree-section');
      const pm = panel.querySelector('.left-pm-section');
      if (tree) tree.style.flex = `${1 - ratio} 1 0`;
      if (pm) pm.style.flex = `${ratio} 1 0`;
    },
    end: (e, moved) => { if (moved) updateSettings({ leftPmRatio: state.settings.leftPmRatio }, { quiet: true }); },
  });
}

/** What the PropertyManager is editing now (its title bar tooltip): "Boss-Extrude1", "Sketch2", "Lights" … */
function pmSubject() {
  const e = state.editing;
  if (!e) return '';
  if (e.feature?.name) return e.feature.name;
  if (more.owns(e)) return more.subject(e);
  if (std.owns(e)) return std.subject(e);
  const key = { mate: 'cmd.mate', insert: 'cmd.insertComponent', measure: 'cmd.measure', sketchPlane: 'pm.newSketch', simulation: 'cmd.simulation', motion: 'cmd.motion', equations: 'cmd.equations', configs: 'cmd.configurations', lights: 'cmd.lights' }[e.mode];
  return key ? t(key) : e.mode;
}

function treeApi() {
  const part = activePart();
  return {
    t, lang: lang(), project: project(), doc: activeKind() === 'drawing' ? more.sheetDrawing(active()) : active(), kind: activeKind(),
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
    t, fmt, fmtLen: (v) => fmtLen(v), fmtLenBare: (v) => fmtLen(v, false), unitName: () => units(), editing: state.editing, project: project(),
    previewResult: state.previewResult, scadPlaying, pierceOptions,
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
    sketchList: (f, use = 'any') => featuresBefore(part, f).filter((x) => x.type === 'sketch' && !x.suppressed && (use !== 'profile' || profiles(x).length > 0) && (use !== 'path' || x.entities.some((k) => k.type !== 'point' && !k.construction))),
    // Curves a sweep path, fill boundary or boundary surface can use: helices, 3D sketches (the sweep path of
    // the spring samples) and the reference curves.
    curveList: (f) => featuresBefore(part, f).filter((x) => x.type === 'helix' || x.type === 'sketch3d' || (CURVE_TYPES.includes(x.type) && PART_MORE_TYPES.includes(x.type))),
    featuresBefore: (f) => featuresBefore(part, f),
    // The schematics (a harness route offers "Wires from schematic" when there is one).
    get schematics() { return project()?.schematics ?? []; },
    bodyCount: (f) => {
      // The bodies the feature starts from: the rebuild result of the feature before it (the preview's or the part's).
      const prev = featuresBefore(part, f).filter((x) => !x.suppressed).at(-1);
      const r = prev ? state.partEntry?.result?.results.get(prev.id) : null;
      return countSolids(r?.body ?? null);
    },
    surfaceList: (f) => featuresBefore(part, f).filter((x) => SURFACE_TYPES.includes(x.type) && x.id !== f.id),
    otherParts: () => project().parts.filter((p) => p.id !== part?.id),
    // The planar faces of another part (a custom forming tool's stop face and faces to remove): [{ sig, label }].
    partPlanarFaces: (id) => { const other = project().parts.find((p) => p.id === id); const body = other ? buildPart(other).body : null; return (body?.faces ?? []).map((fc, i) => ({ fc, i })).filter((x) => x.fc.geomType === 'PLANE').map(({ fc, i }) => { const sig = faceSignature(fc); const n = sig.normal ?? [0, 0, 0]; return { sig, label: `F${i + 1} (${sig.center.map((c) => fmt(c)).join(', ')}) n ${n.map((c) => fmt(c)).join(', ')}` }; }); },
    // How many bodies another part has (Insert Part can take one of them).
    partBodyCount: (id) => { const p = project().parts.find((x) => x.id === id); try { return p ? countSolids(buildPart(p).body ?? null) : 0; } catch { return 0; } },
    assemblies: () => project().assemblies.filter((a) => a.id !== activeAssembly()?.id && !assemblyContains(a, activeAssembly()?.id)),
    custom: (e) => customPm(e),
    customMode: (mode) => more.owns({ mode }) || std.owns({ mode }),
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
  if (drw) body = drawingPropsHtml({ t, selected: state.drawingSelected }, more.sheetDrawing(drw));
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
const propInput = (key, value) => {
  // A number with its unit ("12.5 mm", "30°") gets the − / + frame with the unit beside it; text stays plain.
  const m = /^(-?[\d.]+)\s*(mm|cm|in|°)?$/.exec(String(value ?? '').trim());
  if (m && !/\.name$|partNo|description/.test(key)) return `<input type="text" data-prop="${escapeHtml(key)}" data-num data-unit-label="${escapeHtml(m[2] ?? '')}" value="${escapeHtml(m[1])}" spellcheck="false"/>`;
  return `<input type="text" data-prop="${escapeHtml(key)}" value="${escapeHtml(value ?? '')}" spellcheck="false"/>`;
};
const actionsHtml = (ids) => `<div class="prop-actions">${ids.map((id) => `<button class="small-button ${id === 'delete' ? 'danger' : ''}" data-command="${id}">${icon(commands[id].icon)}<span>${escapeHtml(t(commands[id].label))}</span></button>`).join('')}</div>`;

/** Custom properties of a document (name → value): editable rows, add and delete. */
function customPropsHtml(d) {
  const rows = Object.entries(d.customProperties ?? {}).map(([k, v], i) => `<div class="cprop-row"><input type="text" data-prop="cprop.${i}.key" value="${escapeHtml(k)}" aria-label="${escapeHtml(t('props.customName'))}" spellcheck="false"/><input type="text" data-prop="cprop.${i}.value" value="${escapeHtml(v)}" aria-label="${escapeHtml(t('props.customValue'))}" spellcheck="false"/><button class="icon-button" data-cprop-del="${i}" title="${escapeHtml(t('action.delete'))}">${icon('trash', 'icon tiny')}</button></div>`).join('');
  return `<h4 class="prop-title">${icon('tag')}<span>${escapeHtml(t('props.custom'))}</span></h4><div class="cprop-list">${rows || `<p class="panel-hint">${escapeHtml(t('props.customNone'))}</p>`}</div><div class="prop-actions"><button class="small-button" data-cprop-add>${icon('plus')}<span>${escapeHtml(t('props.customAdd'))}</span></button></div>`;
}

function propsHtml() {
  const s = state.selection[0];
  const part = activePart(); const asm = activeAssembly();
  const out = [];
  if (part && (!s || s.kind === 'doc' || s.kind === 'material' || s.kind === 'plane' || s.kind === 'origin')) {
    out.push(`<h4 class="prop-title">${icon('part')}<span>${escapeHtml(t('props.part'))}</span></h4>`);
    out.push(propRow('edit', t('props.name'), propInput('part.name', part.name)));
    out.push(propRow('tag', t('props.partNo'), propInput('part.partNo', part.partNo)));
    out.push(propRow('notes', t('props.description'), propInput('part.description', part.description)));
    out.push(customPropsHtml(part));
    out.push(propRow('material', t('props.material'), `<select data-prop="part.material" data-icon="material">${MATERIAL_FAMILIES.filter((fam) => MATERIALS.some((m) => familyOf(m) === fam)).map((fam) => `<optgroup label="${escapeHtml(t(`matFamily.${fam}`))}">${MATERIALS.filter((m) => familyOf(m) === fam).map((m) => `<option value="${m.id}" ${m.id === part.material ? 'selected' : ''}>${escapeHtml(lang() === 'en' ? m.en : m.ko)}</option>`).join('')}</optgroup>`).join('')}</select>`));
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
    out.push(actionsHtml([c.fixed ? 'floatComponent' : 'fixComponent', 'rotateComponent', 'rotateComponentX', 'rotateComponentY', 'openPart', 'delete']));
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
    out.push(customPropsHtml(asm));
    out.push(actionsHtml(['insertComponent', 'mate', 'interference']));
    return out.join('');
  }
  return `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('props.none'))}</span></p>`;
}

function materialsHtml() {
  const part = activePart();
  if (!part) return `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('props.partOnlyMaterial'))}</span></p>`;
  // A search box over the cards, the families folded (the one holding the part's material open).
  const search = `<label class="pm-field material-search">${icon('search')}<input type="search" data-material-search placeholder="${escapeHtml(t('mat.search'))}" aria-label="${escapeHtml(t('mat.search'))}" /></label>`;
  const fams = MATERIAL_FAMILIES.filter((fam) => MATERIALS.some((m) => familyOf(m) === fam));
  return search + fams.map((g) => `<details class="material-family" ${MATERIALS.some((m) => familyOf(m) === g && m.id === part.material) ? 'open' : ''}><summary class="prop-title">${icon('material')}<span>${escapeHtml(t(`matFamily.${g}`))}</span><span class="pm-count">${MATERIALS.filter((m) => familyOf(m) === g).length}</span></summary><div class="material-list">${MATERIALS.filter((m) => familyOf(m) === g).map((m) => `<button class="material-card ${part.material === m.id ? 'active' : ''}" data-material="${m.id}" title="${escapeHtml(`${lang() === 'en' ? m.en : m.ko} · ${m.density} kg/m³ · E ${m.E} GPa · σy ${m.yield} MPa`)}"><span class="material-swatch" style="background:linear-gradient(135deg, ${m.color}, color-mix(in srgb, ${m.color} 55%, #000))"></span><span class="material-name">${escapeHtml(lang() === 'en' ? m.en : m.ko)}</span><small>${m.density} kg/m³</small></button>`).join('')}</div></details>`).join('');
}

function displayHtml() {
  const styles = [['shadedEdges', 'styleShaded'], ['shaded', 'styleWhite'], ['hiddenRemoved', 'styleHidden'], ['hiddenVisible', 'styleXray'], ['wireframe', 'styleWireframe']];
  const out = [`<h4 class="prop-title">${icon('styleShaded')}<span>${escapeHtml(t('submenu.displayStyle'))}</span></h4><div class="display-styles">${styles.map(([s, g]) => `<button class="small-button ${state.settings.displayStyle === s ? 'active' : ''}" data-command="style:${s}">${icon(g)}<span>${escapeHtml(t(`style.${s}`))}</span></button>`).join('')}</div>`];
  out.push(`<h4 class="prop-title">${icon('eye')}<span>${escapeHtml(t('submenu.show'))}</span></h4>`);
  for (const id of ['showPlanes', 'showOrigin', 'showSketches', 'showRulers', 'showGrid', 'showScaleBar', 'perspective', 'section']) out.push(`<label class="pm-check"><input type="checkbox" data-command-check="${id}" ${commands[id].checked() ? 'checked' : ''}/>${icon(commands[id].icon)}<span>${escapeHtml(t(commands[id].label))}</span></label>`);
  if (state.section && viewport) {
    out.push(`<h4 class="prop-title">${icon('sectionView')}<span>${escapeHtml(t('action.section'))}</span></h4>`);
    out.push(`<div class="pm-row">${['x', 'y', 'z'].map((a, i) => `<button class="small-button ${state.section.normal[i] ? 'active' : ''}" data-section-axis="${i}">${escapeHtml(a.toUpperCase())}</button>`).join('')}</div>`);
    const box = viewport.contentBox();
    const i = state.section.normal.findIndex((v) => v);
    // The offset is measured along the normal (the default front section's normal is −Y).
    const sg = Math.sign(state.section.normal[i]) || 1;
    const lo = sg > 0 ? box.min.getComponent(i) : -box.max.getComponent(i); const hi = sg > 0 ? box.max.getComponent(i) : -box.min.getComponent(i);
    out.push(`<label class="pm-field"><span class="pm-label">${escapeHtml(t('pm.offset'))}</span><input type="range" data-unit="${escapeHtml(units())}" data-section-offset min="${lo}" max="${hi}" step="${(hi - lo) / 200 || 0.1}" value="${state.section.offset}"/></label>`);
  }
  return out.join('');
}

// ───────────────────────── bottom panel

const SEV_ICON = { error: 'error', warning: 'warning', info: 'info', success: 'check' };

function renderBottom() {
  const host = root.querySelector('#bottom-panel');
  if (!host) return;
  if (state.showStart || !state.doc) { host.innerHTML = ''; return; }
  const problems = rebuildProblems();
  const failedMates = activeAssembly() ? activeAssembly().mates.filter((m) => state.failedMates.has(m.id)) : [];
  const count = problems.length + failedMates.length;
  const tabs = [['rebuild', count ? 'error' : 'check', t('bottom.rebuild'), count], ['messages', 'info', t('bottom.messages'), state.log.length], ['info', 'massProps', t('bottom.info'), null]];
  // Collapsed: a thin bar with the expand button and the tabs (a tab opens the panel on it), like the side panels' rails.
  if (!state.settings.showBottomPanel) {
    host.innerHTML = `<div class="problems-header bottom-rail"><button class="icon-button rail-button expand" data-command="bottomPanel" title="${escapeHtml(t('panel.expandBottom'))}" aria-label="${escapeHtml(t('panel.expandBottom'))}">${icon('panelBottomOpen')}</button><span class="bottom-rail-tabs">${tabs.map(([id, glyph, label, n]) => `<button class="small-button flat" data-bottom-show="${id}" title="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span>${n != null ? `<i class="bottom-count">${n}</i>` : ''}</button>`).join('')}</span></div>`;
    return;
  }
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
  host.innerHTML = `<div class="problems-header">${tabHtml}${tools}<button class="icon-button" data-command="bottomPanel" title="${escapeHtml(t('panel.collapseBottom'))}" aria-label="${escapeHtml(t('panel.collapseBottom'))}">${icon('panelBottomClose')}</button></div><div class="problems-list bottom-${state.bottomTab}" tabindex="0">${body}</div>`;
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
  // A macro being recorded (click: stop) or played.
  if (recorder.on) items.push(`<button class="status-item macro-rec" data-command="macroStop" title="${escapeHtml(t('macro.stopRecording'))}">${icon('macroRecord')}<span>${escapeHtml(t('macro.rec', { count: recorder.steps.length }))}</span></button>`);
  else if (state.macro?.running) items.push(`<button class="status-item macro-play" data-command="macroStop" title="${escapeHtml(t('cmd.macroStop'))}">${icon('macroRun')}<span>${escapeHtml(t('macro.playing'))}</span></button>`);
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
    if (activeAssembly() && state.largeAssembly) items.push(`<button class="status-item large-asm" data-command="largeAssemblyMode" title="${escapeHtml(t('lam.statusTip', { n: state.largeAssembly.instances, hidden: state.largeAssembly.hidden }))}">${icon('largeAssembly')}<span>${escapeHtml(t('lam.status'))}</span></button>`);
    items.push(`<button class="status-item units" data-units-menu title="${escapeHtml(t('settings.units'))}">${icon('units')}<span>${escapeHtml(units().toUpperCase())}</span></button>`);
  }
  items.push(`<span class="status-item" title="${escapeHtml(t('status.theme', { name: themeName(s.theme, getLanguage()) }))}">${icon('palette')}<span>${escapeHtml(themeName(s.theme, getLanguage()))}</span></span>`);
  // The language: the flag of the current language; a click switches (as the toolbar button does).
  items.push(`<button class="status-item status-lang" data-command="language" title="${escapeHtml(`${t('status.language')} — ${t('action.language')}`)}"><span class="flag-slot">${flagFor(getLanguage())}</span><span>${escapeHtml(t('status.language'))}</span></button>`);
  if (s.statusClock) items.push(`<span class="status-item clock" title="${escapeHtml(t('status.clock'))}">${icon('clock')}<span id="status-clock">${escapeHtml(clockText())}</span></span>`);
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
  const startScroll = host.querySelector('.start-scroll');
  startScroll.style.setProperty('--start-image', state.backgroundUrl && state.settings.backgroundKind === 'image' ? `url("${state.backgroundUrl}")` : 'none');
  // Settings › Background: how the picture is laid out (fit) and how strongly it shows (opacity: a veil of
  // the page colour over it).
  const [size, repeat] = { cover: ['cover', 'no-repeat'], contain: ['contain', 'no-repeat'], tile: ['auto', 'repeat'], center: ['auto', 'no-repeat'], stretch: ['100% 100%', 'no-repeat'] }[state.settings.backgroundFit] ?? ['cover', 'no-repeat'];
  startScroll.style.setProperty('--start-image-size', size);
  startScroll.style.setProperty('--start-image-repeat', repeat);
  startScroll.style.setProperty('--start-image-veil', `${100 - Math.max(0, Math.min(100, Number(state.settings.backgroundOpacity) || 0))}%`);
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
    case 'tutorial': return openDocWindow('tutorial');
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
    if (['showPlanes', 'showOrigin', 'showSketches', 'meshQuality', 'modelledThreads'].some((k) => s[k] !== previous[k])) { if (s.meshQuality !== previous.meshQuality) builds.clear(); syncView(); if (s.modelledThreads !== previous.modelledThreads && activeDrawing()) renderDrawing(); }
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
const isIgesName = (name) => /\.(igs|iges)$/i.test(name);
// Parasolid transmit files: text (.x_t, .xmt_txt) and binary (.x_b, .xmt_bin).
const isXtName = (name) => /\.(x_t|x_b|xmt_txt|xmt_bin)$/i.test(name);
// 2D drawings: DWG (R2000–R2018) and DXF, opened as a sketch.
const isCad2dName = (name) => /\.(dwg|dxf)$/i.test(name);
const isMeshName = (name) => MESH_IMPORT_EXTENSIONS.includes(String(name).toLowerCase().split('.').pop());
const isScadName = (name) => /\.scad$/i.test(name);
const isIdfName = (name) => /\.(emn|brd|idf)$/i.test(name);
const isModelName = (name) => isIdfName(name) || isStepName(name) || isIgesName(name) || isXtName(name) || isCad2dName(name) || isStlName(name) || isMeshName(name) || isScadName(name);

/** Mesh exports: format id → extension, MIME type and writer (cad/mesh-formats.js). */
const MESH_EXPORTS = {
  glb: { ext: 'glb', mime: 'model/gltf-binary', write: writeGlb },
  gltf: { ext: 'gltf', mime: 'model/gltf+json', write: writeGltf },
  obj: { ext: 'obj', mime: 'model/obj', write: writeObj },
  ply: { ext: 'ply', mime: 'application/vnd.ply', write: writePly },
  wrl: { ext: 'wrl', mime: 'model/vrml', write: writeVrml },
  '3mf': { ext: '3mf', mime: 'model/3mf', write: write3mf },
  off: { ext: 'off', mime: 'model/off', write: writeOff },
  amf: { ext: 'amf', mime: 'application/x-amf', write: writeAmf },
  usdz: { ext: 'usdz', mime: 'model/vnd.usdz+zip', write: writeUsdz },
};

// The exchange-format worker (workers/formats-worker.js: the full OpenCASCADE build, loaded on first use). Without
// workers (Node) the conversion runs here.
let formatsWorker = null; let formatsRequests = 0;
function formatsRequest(message) {
  if (typeof Worker === 'undefined') {
    return import('./workers/formats-jobs.js').then((m) => m.formatsJob(message));
  }
  formatsWorker ??= new Worker(new URL('./workers/formats-worker.js', import.meta.url), { type: 'module' });
  const id = ++formatsRequests;
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const m = event.data;
      if (m?.id !== id) return;
      formatsWorker.removeEventListener('message', onMessage);
      if (m.type === 'done') resolve(m.result); else reject(Object.assign(new Error(m.message), { code: m.code }));
    };
    formatsWorker.addEventListener('message', onMessage);
    formatsWorker.postMessage({ ...message, id });
  });
}

async function openPath(path, { quiet = false } = {}) {
  const name = baseName(path);
  if (isModelName(name)) return importModelFile(name, await readBytes(path, ''), { path });
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
  if (isModelName(name)) return importModelFile(name, bytes);
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
    more.beforeSave(d);
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

/** Where exports go while a task runs (app-tasks.js): sink(name, type, content, mime) instead of a dialog. */
let exportSink = null;
async function withExportSink(sink, job) {
  const before = exportSink;
  exportSink = sink;
  try { return await job(); } finally { exportSink = before; }
}

/** Saves bytes / text as a file (desktop: a save dialog; web: the save picker or a download). */
async function saveExport(name, type, content, mime = 'application/octet-stream') {
  if (exportSink) return exportSink(name, type, content, mime);
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
  } else if (format === 'iges') {
    const shape = shapes.length === 1 ? shapes[0].shape : R.makeCompound(shapes.map((s) => s.shape));
    const text = await busy('progress.export', `${base}.igs`, () => formatsRequest({ kind: 'export-iges', brep: shape.serialize(), unit: state.settings.units === 'in' ? 'IN' : 'MM', mode: 'brep' }));
    await saveExport(`${base}.igs`, 'iges', new Blob([text], { type: 'model/iges' }), 'model/iges');
  } else if (format === 'xt' || format === 'xb') {
    // Parasolid transmit: one solid body (several parts' solids as its regions), in metres.
    const shape = shapes.length === 1 ? shapes[0].shape : R.makeCompound(shapes.map((s) => s.shape));
    const binary = format === 'xb'; const name = `${base}.${binary ? 'x_b' : 'x_t'}`;
    const mime = binary ? 'model/vnd.parasolid.transmit.binary' : 'model/vnd.parasolid.transmit.text';
    const data = await busy('progress.export', name, () => formatsRequest({ kind: 'export-xt', brep: shape.serialize(), binary, file: name }));
    await saveExport(name, binary ? 'x_b' : 'x_t', new Blob([data], { type: mime }), mime);
  } else if (MESH_EXPORTS[format]) {
    // Mesh formats: every body tessellated (the STL export's tolerance), its part colour kept.
    const rgb = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '')); const v = m ? parseInt(m[1], 16) : 0xb3b3b3; return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; };
    const items = shapes.map((s) => { const m = s.shape.mesh({ tolerance: 0.02, angularTolerance: 0.2 }); return { name: s.name, color: rgb(s.color), vertices: Float32Array.from(m.vertices), triangles: Uint32Array.from(m.triangles) }; });
    const { ext, mime, write } = MESH_EXPORTS[format];
    const data = write(items);
    await saveExport(`${base}.${ext}`, format, data instanceof Uint8Array ? new Blob([data], { type: mime }) : new Blob([data], { type: mime }), mime);
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
  // The active sheet (app-more.js: sheets, view changes and tables).
  if (format === 'dxf') await saveExport(`${fileSafe(d.name)}.dxf`, 'dxf', more.dxf(d, { labels: drawingLabels(), bomRows: drawingBom(d) }), 'application/dxf');
  else if (format === 'dwg') {
    // The DWG holds what the DXF does: the sheet's DXF read back as entities and layers, written as DWG (R2004, or R2000 by the settings).
    const model = readDxf(more.dxf(d, { labels: drawingLabels(), bomRows: drawingBom(d) }));
    const bytes = writeDwg({ layers: [...model.layers.values()], entities: model.modelSpace, units: 4, version: state.settings.dwgVersion });
    await saveExport(`${fileSafe(d.name)}.dwg`, 'dwg', new Blob([bytes], { type: 'image/vnd.dwg' }), 'image/vnd.dwg');
  }
  else await saveExport(`${fileSafe(d.name)}.svg`, 'svg', more.svg(d, { labels: drawingLabels(), info: drawingInfo(d), bomRows: drawingBom(d), embedFonts: true }), 'image/svg+xml');
}

/**
 * Opens the print window (print/popup.js: its own OS window on the desktop, a frame on the web). It asks
 * this window for the page's content (print/host.js): the drawing's sheet SVG, or a picture of the 3D view.
 */
let printHost = null;
async function printDocument() {
  if (!printHost) {
    const sheetSize = (d) => { const [W, H] = SHEETS[d.sheet] ?? SHEETS.A3; return { sheet: d.sheet in SHEETS ? d.sheet : 'A3', sheetW: W, sheetH: H }; };
    printHost = createPrintHost({
      popups, safeName, saveExport, showError,
      viewport: () => viewport,
      info: () => {
        const d = activeDrawing();
        if (d) return { mode: 'drawing', kind: 'drawing', name: d.name, kindLabel: t('mprint.kind.drawing'), ...sheetSize(d) };
        const part = activePart();
        if (!viewport || !(part || activeAssembly())) return null;
        return { mode: 'model', kind: part ? 'part' : 'assembly', name: active()?.name ?? '', kindLabel: t(part ? 'mprint.kind.part' : 'mprint.kind.assembly'), material: part ? materialName(part.material, lang()) : '' };
      },
      drawing: async () => {
        await ensureKernel();
        const d = activeDrawing();
        if (!d) throw new Error(t('mprint.noDrawing'));
        const { sheetW, sheetH } = sheetSize(d);
        return { svg: more.svg(d, { labels: drawingLabels(), info: drawingInfo(d), bomRows: drawingBom(d) }), sheetW, sheetH };
      },
    });
    popups.on('print-render', (data) => printHost.render(data));
    popups.on('print-save-pdf', (data) => printHost.savePdf(data));
  }
  return printHost.open();
}

async function importStepDialog() {
  try {
    if (desktop) {
      const paths = await native.chooseModelFiles(state.settings.lastDirectory);
      if (paths[0]) await importModelFile(baseName(paths[0]), await readBytes(paths[0], ''), { path: paths[0] });
    } else {
      const files = await native.pickWithInput('.step,.stp,.igs,.iges,.x_t,.x_b,.dwg,.dxf,.stl,.scad', false);
      if (files[0]) await importModelFile(files[0].name, new Uint8Array(await files[0].arrayBuffer()));
    }
  } catch (error) { showError('error.import', error); }
}

// ───────────────────────── IDF (ECAD ↔ MCAD: board outline, holes, component placement)

/**
 * An IDF board file (and its library, given or found next to it with the same name) as a new assembly: the board
 * and every placed package (cad/idf.js). Packages the library lacks are listed in the notice.
 */
async function importIdfBoard(name, bytes, { path = null, library = null } = {}) {
  try {
    const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
    let libText = library;
    if (libText == null && path && desktop) {
      const base = path.replace(/\.[^./\\]+$/, '');
      const candidates = ['.emp', '.EMP', '.lib', '.LIB'].map((x) => base + x);
      const found = await native.pathsExist(candidates).catch(() => candidates.map(() => false));
      const at = candidates[found.findIndex(Boolean)];
      if (at) libText = new TextDecoder().decode(await readBytes(at, ''));
    }
    await ensureKernel();
    const board = readIdfBoard(text);
    const model = idfModel(board, libText ? readIdfLibrary(libText) : new Map());
    const p = idfProject(model, stripExtension(name));
    p.assemblies[0].idf = { source: name, version: board.version, keepouts: model.keepouts, notes: board.notes, missing: model.missing, holes: board.holes.length };
    if (!(await confirmReplace())) return null;
    await busy('progress.import', name, () => setDoc(new Doc(p, { name: `${stripExtension(name)}.mymech` })));
    doc().revision = 1;
    fitView();
    notify('success', t('idf.imported', { name, count: model.placements.length, holes: board.holes.length }), model.missing.length ? t('idf.missing', { count: model.missing.length, list: model.missing.slice(0, 12).join(', ') }) : (libText ? '' : t('idf.noLibrary')));
    return p;
  } catch (error) { showError('error.import', error, name); return null; }
}

/** File › Import IDF: the board file and (picked with it) the library file. */
async function importIdfDialog() {
  try {
    const files = await native.pickWithInput('.emn,.brd,.idf,.emp,.lib', true);
    if (!files?.length) return null;
    const texts = await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
    const board = texts.find((f) => /BOARD_FILE|PANEL_FILE/i.test(f.text.slice(0, 400))) ?? texts.find((f) => isIdfName(f.name));
    if (!board) { notify('info', t('idf.pickBoard')); return null; }
    const lib = texts.find((f) => f !== board && /LIBRARY_FILE/i.test(f.text.slice(0, 400)));
    return importIdfBoard(board.name, board.text, { library: lib?.text ?? null });
  } catch (error) { showError('error.import', error); return null; }
}

/**
 * File › Export IDF: the board (the active part, or in an assembly its FR-4 part, else the first) — outline,
 * cutouts, round holes, thickness — and in an assembly every other component placed on it with its package
 * outline and height (relative to the board's own placement), as .emn and .emp files.
 */
async function exportIdf() {
  await ensureKernel();
  const asm = activeAssembly(); const part = activePart();
  if (!asm && !part) { notify('info', t('idf.needModel')); return false; }
  try {
    const partById = (id) => project().parts.find((x) => x.id === id);
    const comps = asm ? asm.components.filter((c) => c.part && !c.suppressed && partById(c.part)) : [];
    const boardComp = asm ? comps.find((c) => partById(c.part).material === 'fr4') ?? comps[0] : null;
    const boardPart = asm ? partById(boardComp?.part) : part;
    if (!boardPart) { notify('info', t('idf.needModel')); return false; }
    const body = buildPart(boardPart)?.body;
    if (!body) { notify('info', t('idf.needModel')); return false; }
    const board = boardFromBody(body);
    const inv = boardComp ? componentMatrix(boardComp).invert() : new THREE.Matrix4();
    const packages = new Map(); const placements = [];
    for (const c of comps) {
      if (c === boardComp) continue;
      const pp = partById(c.part); const pb = buildPart(pp)?.body;
      if (!pb) continue;
      if (!packages.has(pp.id)) packages.set(pp.id, { pkg: pp.name, partNo: pp.partNo || pp.name, ...packageFromBody(pb) });
      const pos = new THREE.Vector3(); const quat = new THREE.Quaternion();
      inv.clone().multiply(componentMatrix(c)).decompose(pos, quat, new THREE.Vector3());
      // The package's own base (its lowest Z) sits at the mounting offset.
      const base = packages.get(pp.id).base;
      const lift = new THREE.Vector3(0, 0, base).applyQuaternion(quat);
      const at = pos.clone().add(lift).toArray();
      placements.push({ pkg: pp.name, partNo: pp.partNo || pp.name, refdes: c.refdes ?? c.name.replace(/[<>]/g, ''), x: at[0], y: at[1], ...placementOf(at, quat.toArray(), board) });
    }
    const name = safeName();
    const ok = await saveExport(`${name}.emn`, 'emn', writeIdfBoard({ name, board, placements }), 'text/plain');
    if (ok && packages.size) await saveExport(`${name}.emp`, 'emp', writeIdfLibrary([...packages.values()]), 'text/plain');
    return ok;
  } catch (error) { showError('error.export', error, 'IDF'); return false; }
}

/** The body of a neutral model file (STEP, IGES, STL and the mesh formats). `warn(key, args)` for what was off. */
async function shapeFromModel(name, bytes, warn = (key, args) => notify('warning', t(key, args))) {
  await ensureKernel();
  const R = rep();
  if (isStlName(name)) return importStlSolid(bytes);
  if (isMeshName(name)) {
    const got = importMeshSolids(name, bytes);
    if (got.skipped.length) warn('notice.meshSkipped', { count: got.skipped.length });
    return got.shape;
  }
  if (isXtName(name)) {
    const got = await formatsRequest({ kind: 'import-xt', data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    if (got.failed) warn('notice.xtFaces', { count: got.failed });
    if (!got.solids) warn('notice.xtSheet');
    return pickSolid(R.deserializeShape(got.brep)).shape;
  }
  if (isIgesName(name)) {
    const got = pickSolid(R.deserializeShape(await formatsRequest({ kind: 'import-iges', data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) })));
    if (!got.solid) warn('notice.igesOpen');
    return got.shape;
  }
  return R.importSTEP(new Blob([bytes]));
}

/** A neutral model file as a new project with one part (its imported body) — the task scheduler's import. */
async function projectFromModel(name, bytes) {
  const shape = await shapeFromModel(name, bytes, () => {});
  const part = createPart(stripExtension(name));
  part.features.push(createFeature(part, 'import', { brep: shape.serialize(), source: name, name: stripExtension(name) }));
  const p = createProject({ name: stripExtension(name), kind: 'none' });
  p.parts.push(part);
  p.active = { kind: 'part', id: part.id };
  return p;
}

/**
 * Runs `job` with `projectData` as the open document (in the background: nothing is shown), then puts the user's
 * document back as it was — its selection, its editing mode and its built parts.
 */
async function withDocument(projectData, job) {
  const keep = { doc: state.doc, selection: state.selection, drawingSelected: state.drawingSelected, editing: state.editing };
  const keepBuilds = new Map(builds), keepProjections = new Map(projectionCache);
  state.doc = new Doc(projectData, { name: projectData.name });
  state.selection = []; state.drawingSelected = null;
  builds.clear(); projectionCache.clear();
  try { return await job(); }
  finally {
    Object.assign(state, keep);
    builds.clear(); for (const [k, v] of keepBuilds) builds.set(k, v);
    projectionCache.clear(); for (const [k, v] of keepProjections) projectionCache.set(k, v);
    if (state.doc && activeAssembly()) solveAssembly();
    renderAll(); syncView();
    if (activeKind() === 'drawing') renderDrawing();
  }
}

/**
 * An OpenSCAD program as a part: a 3D result becomes an OpenSCAD feature (the program, its Customizer values and
 * the files it reads kept in it, editable), a 2D one a sketch on the Top plane. include / use / import files are
 * looked for next to the program, then in OpenSCAD's library folders (OPENSCADPATH, the user's, the installed).
 */
async function importScad(name, bytes, { path = null, files: given = {} } = {}) {
  await ensureKernel();
  const source = decodeScad(bytes);
  const dir = path ? path.replace(/[\\/][^\\/]*$/, '') : null;
  const libraries = desktop ? await native.scadLibraryDirs() : [];
  const loadFile = async (p) => {
    if (Object.prototype.hasOwnProperty.call(given, p)) return given[p];
    const places = /^([a-z]:)?[\\/]/i.test(p) ? [p] : [...(dir ? [`${dir}/${p}`] : []), ...libraries.map((l) => `${l}/${p}`)];
    for (const place of places) { try { return await readBytes(place, ''); } catch { /* not there */ } }
    return null;
  };
  let run;
  try { run = await busy('progress.import', name, () => runScadWithFiles(source, { loadFile, fileName: name })); }
  catch (error) { showError('error.import', error, name); return; }
  const { result, files } = run;
  for (const w of result.warnings.slice(0, 3)) notify('warning', `OpenSCAD: ${w}`);
  if (result.missing?.length) notify('warning', t('notice.scadMissing', { files: result.missing.slice(0, 4).join(', ') }));
  if (result.error) { notify('error', t('notice.scadError', { name, message: result.error.message })); return; }
  const partName = stripExtension(name);
  const part = createPart(partName);
  if (result.dim === 2) {
    const items = result.outlines.flatMap((o) => o.map((a, i) => ({ kind: 'line', a, b: o[(i + 1) % o.length] })));
    const { sketch } = itemsToSketch(items, { scale: 1 });
    part.features.push(createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...sketch, name: partName }));
  } else if (result.dim === 3) {
    const kept = Object.fromEntries(Object.entries(files).filter(([, v]) => v != null));
    const f = createFeature(part, 'openscad', { source, fileName: name, files: packFiles(kept), overrides: {}, name: partName });
    let entry;
    try { entry = primeScadResult(f, result); } catch (error) { showError('error.import', error, name); return; }
    f.result = { key: entry.key, brep: entry.brep };
    part.features.push(f);
    if (result.color) part.color = `#${result.color.slice(0, 3).map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
  } else { notify('warning', t('notice.scadEmpty', { name })); return; }
  if (hasDoc() && project()) change('op.import', (p) => { p.parts.push(part); p.active = { kind: 'part', id: part.id }; });
  else {
    const p = createProject({ name: partName, kind: 'none' });
    p.parts.push(part); p.active = { kind: 'part', id: part.id };
    await setDoc(new Doc(p, { name: `${partName}.mymech` }));
    doc().revision = 1;
  }
  fitView();
  notify('success', t(result.dim === 2 ? 'notice.scad2d' : 'notice.scadImported', { name, count: result.dim === 3 ? result.tris.length : result.outlines.length }));
}

/**
 * The active part (or every component of the assembly, placed) as an OpenSCAD program: each body a polyhedron
 * of its tessellation (corners shared, so OpenSCAD sees a closed solid), in its colour.
 */
async function exportScad() {
  await ensureKernel();
  const part = activePart(); const asm = activeAssembly();
  const base = fileSafe(active()?.name ?? 'model');
  const bodies = [];
  const add = (shape, name, color) => {
    const m = shape.mesh({ tolerance: 0.02, angularTolerance: 0.2 });
    const verts = []; for (let i = 0; i < m.vertices.length; i += 3) verts.push([m.vertices[i], m.vertices[i + 1], m.vertices[i + 2]]);
    const tris = []; for (let i = 0; i < m.triangles.length; i += 3) tris.push([m.triangles[i], m.triangles[i + 1], m.triangles[i + 2]]);
    const w = weldMeshObject(verts, tris, 1e-6);
    bodies.push({ name, verts: w.verts, tris: w.tris, color: /^#[0-9a-f]{6}$/i.test(color ?? '') ? color : undefined });
  };
  if (part) { const b = buildPart(part).body; if (b) add(b, part.name, part.color || materialOf(part.material).color); }
  else if (asm) for (const c of asm.components) { const p = project().parts.find((x) => x.id === c.part); const b = p && buildPart(p).body; if (b) add(placeShape(b, c), c.name, p.color || materialOf(p.material).color); }
  if (!bodies.length) { notify('info', t('notice.noBody')); return; }
  const text = writeScad(bodies, { title: active()?.name ?? 'model' });
  await saveExport(`${base}.scad`, 'scad', new Blob([text], { type: 'text/plain' }), 'text/plain');
}

/** The fonts an OpenSCAD program's text() needs (loaded before it runs); a rebuild when new ones came in. */
async function prepareScadFonts(sources) {
  let added = false;
  for (const s of sources) { try { added = (await loadFonts(s)) || added; } catch { /* the program warns */ } }
  if (added && hasDoc()) { builds.clear(); syncView(); renderAll(); }
  return added;
}
const scadSources = (p) => (p?.parts ?? []).flatMap((part) => part.features.filter((f) => f.type === 'openscad').map((f) => f.source ?? ''));

/**
 * The files an OpenSCAD feature asked for and did not find, read from a folder the user picks (the program's
 * folder or a library folder): they are kept in the feature.
 */
async function scadChooseFolder() {
  const e = state.editing;
  if (e?.mode !== 'feature' || e.feature.type !== 'openscad') return;
  const report = scadReport(e.feature);
  const wanted = report?.missing ?? [];
  if (!wanted.length) return;
  const found = {};
  if (desktop) {
    const folder = await native.chooseFolder(state.settings.lastDirectory);
    if (!folder) return;
    for (const p of wanted) { try { found[p] = await readBytes(`${folder}/${p}`, ''); } catch { /* not in that folder */ } }
  } else {
    const list = await native.pickFolderWeb();
    const byPath = new Map(list.map((file) => [String(file.webkitRelativePath || file.name).split('/').slice(1).join('/'), file]));
    for (const p of wanted) {
      const file = byPath.get(p) ?? [...byPath.entries()].find(([k]) => k.endsWith(`/${p}`) || k === p.split('/').pop())?.[1];
      if (file) found[p] = new Uint8Array(await file.arrayBuffer());
    }
  }
  const n = Object.keys(found).length;
  notify(n ? 'success' : 'warning', t(n ? 'notice.scadFilesAdded' : 'notice.scadFilesNone', { count: n }));
  if (!n) return;
  for (const [p, b] of Object.entries(found)) if (/\.scad$/i.test(p)) await prepareScadFonts([decodeScad(b)]);
  updateFeature((f) => { f.files = { ...(f.files ?? {}), ...packFiles(found) }; delete f.result; });
}

/** A Customizer value or the program changed in the PropertyManager. */
async function scadSourceChanged(text) {
  if (state.editing?.mode !== 'feature' || state.editing.feature.type !== 'openscad') return;
  await prepareScadFonts([text]);
  updateFeature((f) => { f.source = text; delete f.result; });
}
function scadParamChanged(name, raw, kind, checked) {
  if (state.editing?.mode !== 'feature' || state.editing.feature.type !== 'openscad') return;
  let value;
  if (kind === 'bool') value = Boolean(checked);
  else if (kind === 'number') { value = parseLen(raw, 'number'); if (value == null) { notify('error', t('notice.invalidValue', { text: raw })); renderLeft(); return; } }
  else if (kind === 'json') { try { value = JSON.parse(raw); } catch { value = raw; } }
  else if (kind === 'vector') { try { value = JSON.parse(String(raw).replace(/\bundef\b/g, 'null')); } catch { notify('error', t('notice.invalidValue', { text: raw })); renderLeft(); return; } }
  else value = String(raw);
  updateFeature((f) => { f.overrides = { ...(f.overrides ?? {}), [name]: value }; delete f.result; });
}

// ───────────────────────── OpenSCAD animation ($t) and exports

let scadTimer = null;
const scadPlaying = () => Boolean(scadTimer);
function scadStop() { if (scadTimer) { clearInterval(scadTimer); scadTimer = null; } }
/** Steps $t one frame on (wrapping at 1), without an undo step per frame. */
function scadStepFrame() {
  const e = state.editing;
  if (e?.mode !== 'feature' || e.feature.type !== 'openscad') { scadStop(); return; }
  const steps = Math.max(1, Math.round(Number(e.feature.animSteps ?? 20)));
  const frame = (Math.round(scadTime(e.feature) * steps) + 1) % steps;
  updateFeature((f) => { f.animT = frame / steps; delete f.result; });
}
function scadAnimToggle() {
  if (scadTimer) { scadStop(); return renderLeft(); }
  const fps = Math.min(60, Math.max(0.1, Number(state.editing?.feature?.animFps ?? 10)));
  scadTimer = setInterval(scadStepFrame, 1000 / fps);
  return renderLeft();
}
function scadAnimChanged(key, raw) {
  const e = state.editing;
  if (e?.mode !== 'feature' || e.feature.type !== 'openscad') return;
  const v = Number(String(raw).trim());
  if (!Number.isFinite(v)) { notify('error', t('notice.invalidValue', { text: raw })); renderLeft(); return; }
  const steps = Math.max(1, Math.round(Number(e.feature.animSteps ?? 20)));
  updateFeature((f) => {
    if (key === 't') f.animT = v - Math.floor(v);
    else if (key === 'frame') f.animT = Math.max(0, Math.min(steps - 1, Math.round(v))) / steps;
    else if (key === 'fps') f.animFps = Math.min(60, Math.max(0.1, v));
    else if (key === 'steps') f.animSteps = Math.max(1, Math.min(10000, Math.round(v)));
    delete f.result;
  });
  if (key === 'fps' && scadTimer) { scadStop(); scadAnimToggle(); }
}
/** Every frame of the animation as a picture of the view (frame00000.png …), in one ZIP file. */
async function scadAnimDump() {
  const e = state.editing;
  if (e?.mode !== 'feature' || !viewport) return;
  scadStop();
  const f = e.feature; const keepT = f.animT;
  const steps = Math.max(1, Math.round(Number(f.animSteps ?? 20)));
  const entries = [];
  await busy('progress.export', 'frames.zip', async () => {
    for (let k = 0; k < steps; k++) {
      f.animT = k / steps; delete f.result;
      syncView();
      const canvas = viewport.capture(Number(state.settings.scadFrameWidth ?? 800), Number(state.settings.scadFrameHeight ?? 600));
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      entries.push({ name: `frame${String(k).padStart(5, '0')}.png`, content: new Uint8Array(await blob.arrayBuffer()) });
    }
  });
  f.animT = keepT; delete f.result; syncView(); renderLeft();
  const zip = makeZip(entries);
  await saveExport(`${fileSafe(f.name || 'animation')}-frames.zip`, 'zip', new Blob([zip], { type: 'application/zip' }), 'application/zip');
  return entries.length;
}
/** What the feature's program made, as a file (2D: SVG, DXF, PDF; 3D: STL, OFF, AMF, 3MF) or its CSG tree. */
async function scadExportResult(format) {
  const e = state.editing;
  if (e?.mode !== 'feature' || e.feature.type !== 'openscad') return;
  const f = e.feature;
  const base = fileSafe(String(f.fileName || 'model.scad').replace(/\.scad$/i, ''));
  const files = unpackFiles(f.files);
  if (format === 'csg') {
    const r = csgTree(String(f.source ?? ''), { readFile: (p) => files[p] ?? files[Object.keys(files).find((k) => k.split('/').pop() === String(p).split('/').pop())] ?? null, overrides: f.overrides ?? {}, fileName: f.fileName || 'model.scad', specials: scadSpecials(f) });
    if (r.error) { notify('error', t('notice.scadError', { name: f.fileName || 'model.scad', message: r.error.message })); return; }
    await saveExport(`${base}.csg`, 'csg', new Blob([r.text], { type: 'text/plain' }), 'text/plain');
    return;
  }
  const { result: r } = await runScadWithFiles(String(f.source ?? ''), { files, overrides: f.overrides ?? {}, fileName: f.fileName || 'model.scad', specials: scadSpecials(f) });
  if (r.error) { notify('error', t('notice.scadError', { name: f.fileName || 'model.scad', message: r.error.message })); return; }
  const out = exportScadResult(r, format, { name: base });
  if (!out) { notify('warning', t('scad.exportWrongDim', { format: format.toUpperCase() })); return; }
  await saveExport(`${base}.${out.ext}`, out.ext, new Blob([out.data], { type: out.mime }), out.mime);
}

/** A STEP (or STL) file becomes a part with an imported body (new project, or a part of the open one). */
async function importModelFile(name, bytes, { path = null } = {}) {
  if (isIdfName(name)) return importIdfBoard(name, bytes, { path });
  if (isCad2dName(name)) return importDrawing2d(name, bytes);
  if (isScadName(name)) return importScad(name, bytes, { path });
  await ensureKernel();
  try {
    const shape = await busy('progress.import', name, () => shapeFromModel(name, bytes));
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

/**
 * A DWG or DXF drawing as a new part with one sketch on the top plane: the model-space geometry, inserts expanded,
 * in millimetres (cad/cad2d-import.js). Dimensions and what a sketch cannot hold are counted in the notice.
 */
async function importDrawing2d(name, bytes) {
  try {
    const { part, count, skipped } = await busy('progress.import', name, async () => {
      const dwg = /\.dwg$/i.test(name);
      const model = dwg ? readDwg(bytes) : readDxf(decodeDxf(bytes));
      const { items, skipped: left } = flattenDrawing(model);
      const scale = UNIT_MM[model.units ?? 0] ?? 1;
      const { sketch, count: n } = itemsToSketch(items, { scale });
      const p = createPart(stripExtension(name));
      p.features.push(createFeature(p, 'sketch', { plane: { kind: 'std', name: 'top' }, ...sketch, name: stripExtension(name) }));
      return { part: p, count: n, skipped: { ...model.skipped, ...left } };
    });
    if (!count) { notify('warning', t('notice.cad2dEmpty', { name })); return; }
    if (hasDoc() && project()) change('op.import', (p) => { p.parts.push(part); p.active = { kind: 'part', id: part.id }; });
    else {
      const p = createProject({ name: stripExtension(name), kind: 'none' });
      p.parts.push(part); p.active = { kind: 'part', id: part.id };
      await setDoc(new Doc(p, { name: `${stripExtension(name)}.mymech` }));
      doc().revision = 1;
    }
    // The view takes in the drawing: a sketch has no body, so the fit goes by its points (the top plane is XY).
    const pts = part.features[0].entities.filter((e) => e.type === 'point');
    if (viewport && pts.length) {
      const box = new THREE.Box3();
      for (const q of pts) box.expandByPoint(new THREE.Vector3(q.x, q.y, 0));
      viewport.resize(); viewport.zoomToFit(box.expandByScalar(1), true);
    } else fitView();
    const left = Object.entries(skipped).filter(([k]) => !/^(unreadable|mismatch|ATTDEF|ATTRIB)$/.test(k)).reduce((s, [, v]) => s + v, 0);
    notify('success', t('notice.cad2dImported', { name, count }), left ? t('notice.cad2dSkipped', { count: left }) : '');
  } catch (error) { showError('error.import', error, name); }
}
/** The sketch to save as a 2D drawing: the one being edited, else the active part's last sketch. */
function sketchForExport() {
  if (sketching()) return state.editing.feature;
  const part = activePart();
  return part ? [...part.features].reverse().find((f) => f.type === 'sketch' && !f.suppressed) ?? null : null;
}
/** A sketch as DXF or DWG (R2004 / R2000): its geometry in the sketch plane's coordinates, millimetres. */
async function exportSketch(format) {
  const s = sketchForExport();
  if (!s) return;
  const entities = sketchToEntities(s);
  const base = fileSafe(s.name || 'sketch');
  if (format === 'dxf') await saveExport(`${base}.dxf`, 'dxf', entitiesToDxf(entities), 'application/dxf');
  else await saveExport(`${base}.dwg`, 'dwg', new Blob([writeDwg({ layers: [{ name: 'SKETCH', color: 7 }], entities, units: 4, version: state.settings.dwgVersion })], { type: 'image/vnd.dwg' }), 'image/vnd.dwg');
}
/**
 * The active sheet metal part's flat pattern as DXF or DWG (R2004 / R2000), straight from the part: outline and holes, bend
 * lines on BEND_UP / BEND_DOWN, a note per bend (cad/flat-dxf.js).
 */
async function exportFlatPattern(format) {
  const part = activePart();
  if (!part) return;
  const formed = buildPart(part);
  if (!formed.result?.sheet) { notify('info', t('notice.needSheetMetal')); return; }
  const flat = buildPart({ ...part, flat: true }, { slot: 'drwFlat' });
  const out = flat.body ? flatPatternEntities(flat.body, formed.result.sheet, flat.result?.sheet?.bends ?? [], formed.result.sheet.bends ?? [], { fmt: (v) => fmt(v) }) : null;
  if (!out) { notify('warning', t('notice.flatFailed')); return; }
  const base = fileSafe(`${part.name || 'part'}-flat`);
  if (format === 'dxf') await saveExport(`${base}.dxf`, 'dxf', entitiesToDxf(out.entities, out.layers), 'application/dxf');
  else await saveExport(`${base}.dwg`, 'dwg', new Blob([writeDwg({ layers: out.layers, entities: out.entities, units: 4, version: state.settings.dwgVersion })], { type: 'image/vnd.dwg' }), 'image/vnd.dwg');
}
const hasSheet = () => { const p = activePart(); return Boolean(p && !sketching() && p.features.some((f) => ['baseFlange', 'convertSheet', 'insertBends', 'loftedBend'].includes(f.type) && !f.suppressed)); };
/** DXF text: UTF-8 (R2007+), else the ANSI code page read as Latin-1. */
function decodeDxf(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('latin1').decode(bytes); }
}

// ───────────────────────── popups (menus, confirm)

async function ask(params) { const result = await popups.open('confirm', params); return result?.choice ?? 'cancel'; }
async function requestExit() { if (desktop) return appWindow.close(); return undefined; }
async function confirmExit() {
  if (!doc()?.dirty) return true;
  const choice = await ask({ kind: 'exit', icon: 'save', title: t('confirm.exitTitle'), message: t('confirm.exitMessage'), items: [docName()], buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }] });
  if (choice === 'save') return Boolean(await commands.save.run());
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

/** A submenu's name (the CommandManager flyout family's name when the submenu is one of those). */
const subLabel = (key) => t(`submenu.${key}`, null, t(`fly.${key}`));

function menuItems(ids) {
  return ids.map((id) => (id === '-' ? { separator: true } : typeof id === 'object' ? {
    id: `submenu:${id.sub}`, label: subLabel(id.sub), icon: SUBMENUS[id.sub].icon, submenu: true,
    disabled: !SUBMENUS[id.sub].items.some((item) => item !== '-' && commandEnabled(item)),
  } : { id, label: t(commands[id].label), icon: commands[id].icon, ...(id === 'language' ? { flag: getLanguage() === 'ko' ? 'en' : 'ko' } : {}), shortcut: commands[id].key ? keyLabel(commands[id].key) : '', disabled: !commandEnabled(id), checked: commands[id].checked?.() }));
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
    return showMenu(menuItems(SUBMENUS[key].items), { x: at.x, y: at.y, flipY: at.flipY ?? at.y }, name, { ...context, header: { icon: SUBMENUS[key].icon, title: subLabel(key) } });
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
  if (item?.kind === 'comp') return showMenu(menuItems(['openPart', 'fixComponent', 'floatComponent', 'flexibleComponent', 'simplifyOuter', 'simplifyBox', 'simplifyFull', 'rotateComponent', 'rotateComponentX', 'rotateComponentY', '-', 'mate', 'delete', '-', 'zoomFit']), anchor, 'context', { header: { icon: 'part', title: activeAssembly().components.find((c) => c.id === item.id)?.name ?? '' } });
  return showMenu(menuItems(['zoomFit', 'viewsMenu', 'normalTo', 'perspective', '-', 'styleMenu', 'section', '-', 'showPlanes', 'showOrigin', '-', 'rebuild', 'massProps']), anchor, 'context', { header: { icon: 'view3d', title: active()?.name ?? 'MyMechanics' } });
}

// ───────────────────────── feature order and folders (cad/feature-order.js)

/** Moves a feature before another (or into a folder) from a drag in the tree. */
function dropFeature(id, targetKey) {
  const part = activePart();
  if (!part) return;
  const apply = (pt) => (targetKey.startsWith('folder:') ? moveIntoFolder(pt, id, targetKey.slice(7)) : moveFeature(pt, id, targetKey.startsWith('feat:') ? targetKey.slice(5) : null));
  // Tried on a copy first: a refused move leaves the part (and the undo history) alone.
  const r = apply(JSON.parse(JSON.stringify(part)));
  if (!r.ok) {
    if (r.reason === 'dependency') { const [a, b] = r.bad[0]; const name = (x) => part.features.find((f) => f.id === x)?.name ?? x; notify('warning', t('order.refused', { feature: name(a), needs: name(b) })); }
    return;
  }
  change('op.reorder', (p) => { apply(p.parts.find((x) => x.id === part.id)); });
  renderAll();
}
function newFolder() {
  const part = activePart();
  const ids = state.selection.filter((s) => s.kind === 'feat').map((s) => s.id);
  if (!part || !ids.length) { notify('info', t('order.pickFeatures')); return; }
  const fid = newId('fold'); const name = `${t('order.folder')}${(part.folders?.length ?? 0) + 1}`;
  if (!makeFolder(JSON.parse(JSON.stringify(part)), ids, name, () => fid)) { notify('warning', t('order.notAdjacent')); return; }
  change('op.folder', (p) => { makeFolder(p.parts.find((x) => x.id === part.id), ids, name, () => fid); });
  renderAll();
}
function dissolveSelectedFolder() {
  const part = activePart(); const sel = state.selection.find((s) => s.kind === 'folder');
  if (!part || !sel) return;
  change('op.folder', (p) => dissolveFolder(p.parts.find((x) => x.id === part.id), sel.id));
  state.selection = []; renderAll();
}
async function renameFolder() {
  const part = activePart(); const sel = state.selection.find((s) => s.kind === 'folder');
  const g = part?.folders?.find((x) => x.id === sel?.id);
  if (!g) return;
  const r = await popups.open('prompt', { title: t('cmd.renameFolder'), label: t('order.folderName'), value: g.name });
  if (!r?.value?.trim()) return;
  change('op.folder', (p) => { const x = p.parts.find((q) => q.id === part.id).folders.find((q) => q.id === g.id); x.name = r.value.trim(); });
  renderAll();
}
Object.assign(commands, {
  newFolder: { icon: 'folder', label: 'cmd.newFolder', enabled: () => Boolean(activePart()) && state.selection.some((s) => s.kind === 'feat'), run: () => newFolder() },
  dissolveFolder: { icon: 'folderOpen', label: 'cmd.dissolveFolder', enabled: () => state.selection.some((s) => s.kind === 'folder'), run: () => dissolveSelectedFolder() },
  renameFolder: { icon: 'edit', label: 'cmd.renameFolder', enabled: () => state.selection.some((s) => s.kind === 'folder'), run: () => renameFolder() },
});

function treeContextMenu(key, event) {
  if (key.startsWith('folder:')) return showMenu(menuItems(['renameFolder', 'dissolveFolder']), anchorAt(event), 'context', { header: { icon: 'folder', title: t('order.folder') } });
  const anchor = anchorAt(event);
  const part = activePart();
  if (key.startsWith('feat:')) {
    const f = part?.features.find((x) => x.id === key.slice(5));
    if (!f) return undefined;
    const extra = f.type === 'sketch' ? ['extrude', 'cutExtrude', 'revolve'] : ['linearPattern', 'circularPattern', 'mirror'];
    return showMenu(menuItems(['editFeature', 'rename', '-', f.suppressed ? 'unsuppress' : 'suppress', 'rollbackHere', 'rollbackEnd', '-', ...extra, '-', 'newFolder', '-', 'delete']), anchor, 'context', { header: { icon: featureIcon(f), title: f.name } });
  }
  if (key.startsWith('plane:')) return showMenu(menuItems(['sketch', 'refPlane', 'mirror', '-', 'normalTo']), anchor, 'context', { header: { icon: 'refPlane', title: t(`plane.${key.slice(6)}`) } });
  if (key.startsWith('comp:')) return showMenu(menuItems(['openPart', 'rename', 'fixComponent', 'floatComponent', 'flexibleComponent', 'simplifyOuter', 'simplifyBox', 'simplifyFull', 'editInContext', 'rotateComponent', 'rotateComponentX', 'rotateComponentY', '-', 'delete']), anchor, 'context', { header: { icon: 'part', title: activeAssembly()?.components.find((c) => c.id === key.slice(5))?.name ?? '' } });
  if (key.startsWith('mate:')) return showMenu(menuItems(['rename', 'delete']), anchor, 'context', { header: { icon: 'mate', title: activeAssembly()?.mates.find((m) => m.id === key.slice(5))?.name ?? '' } });
  if (key === 'material') return materialMenu(anchor);
  if (key === 'doc') return showMenu(menuItems(['rename', 'rebuild', 'massProps', '-', 'newDrawing', 'exportStep', 'exportIges', 'exportXt', 'exportStl']), anchor, 'context', { header: { icon: activeKind(), title: active()?.name ?? '' } });
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

function pmFieldChanged(key, raw, unit) { return recorder.around('pmField', [key, raw, unit ?? null], () => pmFieldChangedImpl(key, raw, unit)); }
function pmFieldChangedImpl(key, raw, unit) {
  const e = state.editing;
  if (!e) return;
  const v = parseLen(raw, unit === 'length' ? 'length' : 'number');
  // Sheet metal gauge / bend table rows (ui/pm-sheet-gauge.js).
  if (e.mode === 'feature' && /^(cg|kr|br|fp):\d+:\w+$/.test(key)) return sheetRowField(key, raw, v);
  if (e.mode === 'sketch') {
    const ed = e.editor;
    if (key === 'polygonSides' && v >= 3) { ed.polygonSides = Math.round(v); renderLeft(); return; }
    if (key === 'filletRadius' && v > 0) { ed.filletRadius = v; renderLeft(); return; }
    if (key === 'text.value' || key === 'text.size') {
      const x0 = ed.selectionInfo()[0];
      if (x0?.type === 'text') { if (key === 'text.value') x0.text = String(raw); else if (v > 0) x0.size = v; ed.commit('op.text'); renderLeft(); }
      return;
    }
    if (key === 'chamferDistance' && v > 0) { ed.chamferDistance = v; renderLeft(); return; }
    if (key === 'repair.gap' && v > 0) { ed.repairGap = v; renderLeft(); return; }
    if (key === 'comb.scale' && v > 0) { ed.combScale = v; ed.render(); renderLeft(); return; }
    if (key.startsWith('handle.')) {
      // handle.<angle|weight>.<splineId>.<index>
      const [, what, sid, ix] = key.split('.');
      if (v == null) return;
      const cur = byId(ed.sketch, sid)?.handles?.[ix];
      ed.setHandle(sid, Number(ix), what === 'angle' ? { angle: v, weight: cur?.weight ?? 1 } : { weight: v, angle: cur?.angle ?? ed.naturalAngle(sid, Number(ix)) });
      ed.render(); renderLeft(); return;
    }
    if (key === 'trace.threshold' && v >= 0 && v <= 255) { ed.traceOptions.threshold = v; renderLeft(); return; }
    if (key === 'trace.tol' && v > 0) { ed.traceOptions.tol = v; renderLeft(); return; }
    if (key === 'trace.minArea' && v >= 0) { ed.traceOptions.minArea = v; renderLeft(); return; }
    if (key === 'offset.distance' && v > 0) { ed.offsetOptions.distance = v; renderLeft(); return; }
    if (key === 'chamferDistance2' && v > 0) { ed.chamferDistance2 = v; renderLeft(); return; }
    if (key === 'chamferAngle' && v > 0 && v < 180) { ed.chamferAngle = v; renderLeft(); return; }
    if (key.startsWith('eq.')) { ed.setEquationDraft(key.slice(3), raw); renderLeft(); return; }
    if (key.startsWith('eqSel.') || key.startsWith('ell.') || key === 'conic.rho') {
      const x1 = ed.selectionInfo()[0];
      if (x1 && !ed.setEntityValue(x1, key, raw)) notify('error', t('notice.invalidValue', { text: raw }));
      renderLeft();
      return;
    }
    const x = ed.selectionInfo()[0];
    if (!x || v == null) return;
    if (key === 'pt.x' || key === 'pt.y') { ed.solve({ drag: { id: x.id, x: key === 'pt.x' ? v : x.x, y: key === 'pt.y' ? v : x.y } }); ed.render(); renderLeft(); return; }
    if (key === 'circle.d' && v > 0) { x.r = v / 2; ed.solve(); ed.render(); renderLeft(); }
    return;
  }
  if (more.owns(e)) return more.field(key, raw, v);
  if (std.owns(e)) return std.field(key, raw, v);
  if (e.mode === 'mate') { if (v != null) { if (['min', 'max', 'ratio', 'radius', 'pitch'].includes(key)) e.mate[key] = v; else e.mate.value = v; previewMate(); } return; }
  if (e.mode === 'lights') return lightsField(key, raw, parseLen(raw, 'number'));
  if (['simulation', 'motion', 'equations', 'configs'].includes(e.mode)) return customField(key, raw, v);
  if (std.featureField(key, raw, v)) return;
  // A mate reference's name is text, not a number.
  if (e.mode === 'feature' && key === 'refName') { updateFeature((f) => { f.refName = String(raw).trim() || 'Default'; }); return; }
  if (e.mode === 'feature' && key.startsWith('hel:')) {
    // An advanced hole's element: "hel:<near|far>:<index>:<d|depth|angle>".
    const [, side, i, prop] = key.split(':');
    if (v == null || v < 0) { notify('error', t('notice.invalidValue', { text: raw })); renderLeft(); return; }
    updateFeature((f) => { f[side] = (f[side] ?? []).map((x, k) => (k === Number(i) ? { ...x, [prop]: v } : x)); });
    return;
  }
  if (e.mode === 'feature' && key.startsWith('var:')) {
    const [, i, prop] = key.split(':');
    if (v == null || (prop !== 'rev' && !(v > 0)) || v < 0) { notify('error', t('notice.invalidValue', { text: raw })); renderLeft(); return; }
    updateFeature((f) => { if (f.variable?.[Number(i)]) f.variable[Number(i)] = { ...f.variable[Number(i)], [prop]: v }; });
    return;
  }
  if (e.mode === 'feature' && key.startsWith('fa:')) {
    const i = Number(key.split(':')[1]);
    if (!(v > 0) || v >= 45) { notify('error', t('notice.invalidValue', { text: raw })); renderLeft(); return; }
    updateFeature((f) => { const sig = f.faces?.[i]; if (!sig) return; f.angles = (f.angles ?? []).filter((x) => Math.hypot(...x.sig.center.map((c, k) => c - sig.center[k])) >= 1e-6); f.angles.push({ sig, angle: v }); });
    return;
  }
  if (e.mode === 'feature' && (key.startsWith('rad:') || key.startsWith('mt:'))) {
    const i = Number(key.split(':')[1]);
    if (!(v > 0)) { notify('error', t('notice.invalidValue', { text: raw })); renderLeft(); return; }
    updateFeature((f) => {
      if (key.startsWith('mt:')) { if (f.multi?.[i]) f.multi[i] = { ...f.multi[i], t: v }; return; }
      const sig = f.edges?.[i];
      if (!sig) return;
      f.radii = (f.radii ?? []).filter((x) => !(x.sig && Math.hypot(...x.sig.mid.map((c, k) => c - sig.mid[k])) < 1e-6));
      f.radii.push({ sig, r: v });
    });
    return;
  }
  if (e.mode === 'feature' && /^ffp:\d+:\d+$/.test(key)) {
    // A freeform control point's offset along the face normal.
    if (v == null) { notify('error', t('notice.invalidValue', { text: raw })); renderLeft(); return; }
    const [, i, j] = key.split(':').map(Number);
    updateFeature((f) => { f.points = [...(f.points ?? []).filter((p) => !(p.i === i && p.j === j)), ...(v ? [{ i, j, d: v }] : [])]; });
    return;
  }
  if (e.mode === 'feature' && /^sb:\d+:\d$/.test(key)) {
    // A fillet setback distance (corner i, edge k).
    if (!(v > 0)) { notify('error', t('notice.invalidValue', { text: raw })); renderLeft(); return; }
    const [, i, k] = key.split(':').map(Number);
    updateFeature((f) => { const x = f.setbacks?.[i]; if (!x) return; const d = [0, 1, 2].map((m) => x.d?.[m] ?? x.d?.[0] ?? v); d[k] = v; f.setbacks = f.setbacks.map((y, m) => (m === i ? { ...y, d } : y)); });
    return;
  }
  if (e.mode === 'feature' && (key.startsWith('vary:') || key.startsWith('vary2:'))) {
    // A variable pattern's step for one dimension of the seed sketch (per instance along direction 1 / 2).
    if (v == null) { notify('error', t('notice.invalidValue', { text: raw })); renderLeft(); return; }
    const [k, dim] = key.split(':'); const prop = k === 'vary' ? 'step' : 'step2';
    updateFeature((f) => {
      const list = (f.vary ?? []).map((x) => ({ ...x }));
      let row = list.find((x) => x.dim === dim);
      if (!row) { row = { dim, step: 0, step2: 0 }; list.push(row); }
      row[prop] = v;
      f.vary = list.filter((x) => Number(x.step) || Number(x.step2));
      if (!f.vary.length) delete f.vary;
    });
    return;
  }
  if (e.mode === 'feature' && key.startsWith('pt3:')) {
    const [, i, j] = key.split(':').map(Number);
    if (v == null) { notify('error', t('notice.invalidValue', { text: raw })); renderLeft(); return; }
    updateFeature((f) => { f.points = f.points.map((p, k) => (k === i ? p.map((c, m) => (m === j ? v : c)) : p)); solveRelations3d(f); });
    return;
  }
  if (e.mode === 'feature' && key.startsWith('r3:')) {
    // A 3D sketch dimension's value.
    if (v == null) { notify('error', t('notice.invalidValue', { text: raw })); renderLeft(); return; }
    updateFeature((f) => { const r = f.relations3d?.find((x) => x.id === key.slice(3)); if (r) { const keep = r.value; r.value = v; if (!solveRelations3d(f)) { r.value = keep; notify('warning', t('s3.cannotSolve')); } } });
    return;
  }
  // "=W/2": the value is driven by an equation (global variables, other features' values).
  if (e.mode === 'feature' && String(raw).trim().startsWith('=')) {
    const expr = String(raw).trim().slice(1).trim();
    const part = activePart();
    try {
      const vars = variableValues(part).values;
      const value = evaluate(expr, (name) => { if (vars.has(name)) return vars.get(name); throw Object.assign(new Error(name), { code: 'unknown' }); });
      updateFeature((f) => { f.exprs = { ...(f.exprs ?? {}), [key]: expr }; f[key] = value; });
    } catch (error) { notify('error', t('notice.badEquation', { text: expr, code: t(`expr.${error.code ?? 'syntax'}`, null, error.code ?? '') })); renderLeft(); }
    return;
  }
  if (e.mode !== 'feature' || v == null) { if (v == null) notify('error', t('notice.invalidValue', { text: raw })); renderLeft(); return; }
  const type = e.feature.type;
  const limits = { count: [1, 500], count2: [1, 500], csAngle: [30, 150], turns: [0.05, 500], kFactor: [0, 1], starts: [1, 8] };
  if (['revolve', 'circularPattern', 'surfaceRevolve'].includes(type)) limits.angle = [0.1, 360];
  if (type === 'revolve') Object.assign(limits, { angle2: [0.1, 360], endOffset: [0, 1e6], endOffset2: [0, 1e6] });
  if (type === 'draft') limits.angle = [0.1, 44];
  if (type === 'edgeFlange') limits.angle = [1, 180];
  if (type === 'extrude') Object.assign(limits, { draftAngle: [0.1, 44], startOffset: [0, 1e6], endOffset: [0, 1e6], endOffset2: [0, 1e6] });
  let value = v;
  if (limits[key]) value = Math.max(limits[key][0], Math.min(limits[key][1], value));
  if (['count', 'count2', 'starts'].includes(key)) value = Math.round(value);
  if (['depth', 'depth2', 'diameter', 'cbDiameter', 'cbDepth', 'csDiameter', 'pitch', 'length', 'height', 'factor', 'w', 'h', 't', 'scale', 'thinT1', 'thinT2', 'capThickness'].includes(key) && !(value > 0)) { notify('error', t('notice.invalidValue', { text: raw })); renderLeft(); return; }
  if (['radius', 'distance', 'thickness'].includes(key) && !(value > 0) && !(key === 'radius' && ['baseFlange', 'edgeFlange'].includes(type) && value === 0) && !(key === 'distance' && type === 'surfaceOffset' && value !== 0)) { notify('error', t('notice.invalidValue', { text: raw })); renderLeft(); return; }
  updateFeature((f) => { f[key] = value; if (f.exprs?.[key]) { delete f.exprs[key]; if (!Object.keys(f.exprs).length) delete f.exprs; } if (key === 'diameter') delete f.size; if (key === 'pitch' && f.type === 'thread') delete f.size; });
}

function pmStep(key, delta) { return recorder.around('pmStep', [key, delta], () => pmStepImpl(key, delta)); }
function pmStepImpl(key, delta) {
  if (std.owns(state.editing)) return std.step(key, delta);
  const e = state.editing;
  if (e?.mode === 'sketch' && key === 'polygonSides') { e.editor.polygonSides = Math.max(3, e.editor.polygonSides + delta); renderLeft(); return; }
  const target = e?.mode === 'feature' ? e.feature : e?.mode === 'mate' ? e.mate : null;
  if (!target) return;
  const k = e.mode === 'mate' && !['min', 'max', 'ratio', 'radius', 'pitch'].includes(key) ? 'value' : key;
  // Fields of table rows ("var:1:pitch", "rad:0", "mt:2"): the value shown in the field.
  const shown = key.includes(':') ? Number(document.querySelector(`#left-panel [data-pm-field="${CSS.escape(key)}"]`)?.value) : NaN;
  const cur = Number.isFinite(shown) ? shown : Number(target[k]) || 0;
  const step = ['count', 'count2'].includes(k) ? 1 : ['angle', 'csAngle'].includes(k) ? (e.feature?.type === 'circularPattern' ? 15 : 5) : (units() === 'in' ? 1.5875 : cur >= 20 ? 5 : 1);
  pmFieldChanged(key, String(cur + delta * step), 'number');
}

function pmSet(key, value) { return recorder.around('pmSet', [key, value], () => pmSetImpl(key, value)); }
function pmSetImpl(key, value) {
  const e = state.editing;
  if (e?.mode === 'feature' && key === 'bendMethod') {
    // An allowance / deduction table starts filled from the K-factor (the gauge's radii, or the bend radius).
    updateFeature((f) => {
      const was = f.bendMethod; f.bendMethod = value;
      if ((value === 'allowance' || value === 'deduction') && (!f.bendRows?.length || (was !== value && (was === 'allowance' || was === 'deduction')))) {
        const g = gaugeOf(f); f.bendRows = seedBendRows(value, g?.thickness ?? (Number(f.thickness) || 2), g ? g.radii : [Number(f.radius) || 0], g?.k ?? (Number(f.kFactor) || 0.44));
      }
    });
    return undefined;
  }
  if (e?.mode === 'sketch' && key === 'styleDegree') { e.editor.styleDegree = Number(value); e.editor.pending = []; e.editor.render(); renderLeft(); return undefined; }
  if (e?.mode === 'sketch' && key === 'trace.mode') { e.editor.traceOptions.mode = value; renderLeft(); return undefined; }
  if (e?.mode === 'sketch' && key === 'offset.cap') { e.editor.offsetOptions.cap = value; renderLeft(); return undefined; }
  if (e?.mode === 'sketch' && key === 'chamferMode') { e.editor.chamferMode = value; renderLeft(); return undefined; }
  if (e?.mode === 'sketch' && key === 'eq.mode') { e.editor.setEquationDraft('mode', value); renderLeft(); return undefined; }
  if (e?.mode === 'sketch' && key === 'eqSel.mode') { const x = e.editor.selectionInfo()[0]; if (x) e.editor.setEntityValue(x, key, value); renderLeft(); return undefined; }
  if (more.owns(e)) return more.set(key, value);
  if (std.owns(e)) return std.set(key, value);
  if (std.featureSet(key, value)) return undefined;
  if (e?.mode === 'mate') {
    if (key === 'type') {
      e.mate.type = value;
      Object.assign(e.mate, Object.fromEntries(Object.entries(MATE_DEFAULTS[value] ?? {}).filter(([k]) => e.mate[k] == null)));
      if (value === 'cam') { e.mate.profile = camProfile(e.mate.a); if (e.mate.b?.kind === 'axis' && e.mate.b.sig?.radius) e.mate.followerRadius = e.mate.b.sig.radius; }
    }
    else if (key === 'aligned') e.mate.aligned = value;
    else if (key === 'slotMode') e.mate.slotMode = value;
    else if (key === 'pathMode') e.mate.pathMode = value;
    else if (key === 'mateGroup') e.mateGroup = value;
    previewMate(); return;
  }
  if (e?.mode === 'lights' && key.startsWith('light:')) { const [, id] = key.split(':'); change('op.light', (p) => { const l = sceneLights(p).lights.find((x) => x.id === id); if (l) { l.kind = value; if (value === 'sun') placeSun(l); else delete l.sun; } }); return undefined; }
  if (['simulation', 'motion', 'equations', 'configs'].includes(e?.mode)) return customSet(key, value);
  if (e?.mode !== 'feature') return;
  updateFeature((f) => {
    if (key === 'op') { f.op = value; f.name = createFeature(activePart(), f.type, { op: value }).name; if (value === 'cut' && f.type === 'extrude') { const sk = activePart().features.find((x) => x.id === f.sketch); if (sk) f.reverse = cutShouldReverse(activePart(), sk); } }
    else if (key === 'kind') { f.kind = value; if (value === 'tapped' && f.type === 'hole') { const row = TAP_SIZES.find(([sz]) => sz === (f.threadSize ?? 'M8')); if (row) f.diameter = Math.round((row[1] - row[2]) * 10) / 10; } }
    else if (key === 'through') f.through = value === 'true';
    else if (key === 'dir1') f.direction = value === 'edge' ? { kind: 'edge', sig: f.direction?.sig ?? null } : { kind: 'axis', axis: value };
    else if (key === 'dir2axis') f.direction2 = { kind: 'axis', axis: value };
    else if (key === 'axisKind') f.axis = value === 'edge' ? { kind: 'edge', sig: f.axis?.sig ?? null } : value.startsWith('ref:') ? { kind: 'ref', id: value.slice(4) } : { kind: 'axis', axis: value };
    else if (key === 'stdPlane') { if (f.type === 'plane') f.base = { kind: 'std', name: value }; else f.plane = { kind: 'std', name: value }; }
    else if (key === 'fit') { f.fit = value; if (f.ansiSize) Object.assign(f, ansiHole(f.ansiSize, f.kind, value) ?? {}); if (f.mSize) Object.assign(f, metricStdHole(f.standard, f.mSize, f.kind, value) ?? {}); }
    else if (key === 'pullAxis') f.pull = value === 'edge' ? { kind: 'edge', sig: f.pull?.sig ?? null } : { kind: 'axis', axis: value };
    else if (key === 'stdPlane2') f.base2 = { kind: 'std', name: value };
    else if (key === 'axisKind2') f.axisRef = value === 'edge' ? { kind: 'edge', sig: f.axisRef?.sig ?? null } : { kind: 'axis', axis: value };
    else if (key === 'neutralStd') f.neutral = { kind: 'std', name: value };
    else if (key === 'drawPlane') { e.drawPlane = value; e.pick = 'points3d'; }
    else if (key === 'at' && ['center', 'xyz', 'ref'].includes(value)) {
      // Where a boss or a hook stands: the face's centre, typed coordinates (starting at that centre) or a reference point.
      // (Other features' `at` settings, such as a shut-off's parting / top, are stored as they are.)
      f.atCenter = value === 'center';
      if (value === 'ref') f.pointRef = f.pointRef ?? featuresBefore(activePart(), f).find((x) => x.type === 'refPoint')?.id ?? null;
      else f.pointRef = null;
      if (value === 'xyz' && f.face?.center) [f.x, f.y, f.z] = f.face.center;
    }
    else f[key] = value;
  });
  if (key === 'dir1' && value === 'edge') { e.pick = 'direction'; renderLeft(); }
  if (key === 'axisKind' && value === 'edge') { e.pick = 'axis'; renderLeft(); }
  if (key === 'axisKind2' && value === 'edge') { e.pick = 'axisRef'; renderLeft(); }
}

function pmToggle(key, checked) { return recorder.around('pmToggle', [key, checked], () => pmToggleImpl(key, checked)); }
function pmToggleImpl(key, checked) {
  const e = state.editing;
  if (e?.mode === 'sketch' && key.startsWith('offset.')) { e.editor.offsetOptions[key.slice(7)] = checked; renderLeft(); return undefined; }
  if (e?.mode === 'sketch' && key.startsWith('comb:')) { const ed = e.editor; const id = key.slice(5); if (checked) ed.combs.add(id); else ed.combs.delete(id); ed.render(); renderLeft(); return undefined; }
  if (e?.mode === 'sketch' && key.startsWith('handleOn:')) {
    const ed = e.editor; const [, sid, ix] = key.split(':');
    ed.setHandle(sid, Number(ix), checked ? { angle: Math.round(ed.naturalAngle(sid, Number(ix)) * 1000) / 1000, weight: 1 } : null);
    ed.render(); renderLeft(); return undefined;
  }
  if (e?.mode === 'sketch' && key === 'chamferFlip') { e.editor.chamferFlip = checked; renderLeft(); return undefined; }
  if (more.owns(e)) return more.toggle(key, checked);
  if (std.owns(e)) return std.toggle(key, checked);
  if (e?.mode === 'mate') { if (key === 'flip' || key === 'reverse' || key === 'follow') { e.mate[key] = checked; previewMate(); } return; }
  if (e?.mode === 'lights') { const [scope, id] = key.split(':'); change('op.light', (p) => { const L = sceneLights(p); if (scope === 'cam') L.cameraLight.on = checked; else { const l = L.lights.find((x) => x.id === id); if (l) l.on = checked; } }); return undefined; }
  if (['simulation', 'motion', 'equations', 'configs'].includes(e?.mode)) return customToggle(key, checked);
  if (e?.mode !== 'feature') return;
  updateFeature((f) => {
    if (key.startsWith('loft:') || key.startsWith('surf:') || key.startsWith('curv:')) {
      const id = key.slice(5); const list = key.startsWith('loft:') ? 'sketches' : key.startsWith('curv:') ? 'curves' : 'surfaces';
      f[list] = (f[list] ?? []).filter((x) => x !== id);
      if (checked) f[list].push(id);
    } else if (key.startsWith('fcon:')) {
      // A fill surface's constraint curves (the patch passes through them).
      const id = key.slice(5);
      f.constraints = (f.constraints ?? []).filter((x) => x !== id);
      if (checked) f.constraints.push(id);
      if (!f.constraints.length) delete f.constraints;
    } else if (key.startsWith('frm:')) {
      // A custom forming tool's face to punch out (by its centre key).
      const k = key.slice(4);
      const face = (pmApi().partPlanarFaces?.(f.toolPart) ?? []).find((x) => x.sig.center.map((c) => Math.round(c * 1e4)).join(',') === k);
      f.removeFaces = (f.removeFaces ?? []).filter((x) => x.center.map((c) => Math.round(c * 1e4)).join(',') !== k);
      if (checked && face) f.removeFaces.push(face.sig);
      if (!f.removeFaces.length) delete f.removeFaces;
    } else if (key.startsWith('crv2:')) {
      // A boundary's second-direction curves.
      const id = key.slice(5);
      f.curves2 = (f.curves2 ?? []).filter((x) => x !== id);
      if (checked) f.curves2.push(id);
      if (!f.curves2.length) delete f.curves2;
    } else if (key.startsWith('lf:')) {
      // A loft connector's direction (the profile run the other way round).
      const id = key.slice(3);
      const c = { ...(f.connect?.[id] ?? {}) };
      if (checked) c.flip = true; else delete c.flip;
      f.connect = { ...(f.connect ?? {}), [id]: c };
      if (!Object.keys(c).length) delete f.connect[id];
      if (!Object.keys(f.connect).length) delete f.connect;
    } else if (key.startsWith('sg:')) {
      // A sweep's further guide curves (the profile follows every guide).
      const id = key.slice(3);
      f.guides = (f.guides ?? []).filter((x) => x !== id);
      if (checked) f.guides.push(id);
      if (!f.guides.length) delete f.guides;
    } else if (key.startsWith('slt:')) {
      // Split line by intersection: the planes / surface bodies it meets ("slt:std:front", "slt:ref:<id>", "slt:surf:<id>").
      const ref = key.slice(4);
      f.tools = (f.tools ?? []).filter((x) => x !== ref);
      if (checked) f.tools.push(ref);
    } else if (key.startsWith('list:')) {
      // A list of plain values (body numbers): "list:<field>:<value>".
      const [, list, raw] = key.split(':');
      const value = Number.isFinite(Number(raw)) ? Number(raw) : raw;
      f[list] = (f[list] ?? []).filter((x) => String(x) !== raw);
      if (checked) f[list].push(value);
    } else if (key === 'variablePitch') {
      if (checked) { const d = 2 * (Number(f.radius) || 10); const p = Number(f.pitch) || 5; f.variable = [{ rev: 0, pitch: p, d }, { rev: Math.max(1, Number(f.turns) || 4), pitch: p, d }]; } else delete f.variable;
    } else if (key === 'faceAngles') {
      if (checked) f.angles = []; else delete f.angles;
    } else if (key === 'multiRadius') {
      if (checked) f.radii = []; else delete f.radii;
    } else if (key === 'selContours') {
      const sk = activePart()?.features.find((x) => x.id === f.sketch);
      f.contours = checked ? (sk ? profiles(sk).map((_, i) => i) : []) : undefined;
      if (!checked) delete f.contours;
    } else if (key === 'dir2' && f.type === 'circularPattern') { f.dir2 = checked; } else if (key === 'dir2') { if (f.type === 'extrude' || f.type === 'revolve') f.end2 = checked ? 'blind' : 'none'; else f.direction2 = checked ? { kind: 'axis', axis: 'y' } : null; }
    else f[key] = checked;
  });
}

function pmSelect(key, value) { return recorder.around('pmSelect', [key, value], () => pmSelectImpl(key, value)); }
/** The sketch picture's pixels (at most 1600 px on the long side): { width, height, data } or null. */
async function picturePixels(src) {
  if (typeof Image === 'undefined' || !src) return null;
  const img = await new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = src; });
  if (!img) return null;
  const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.max(1, Math.round(img.naturalWidth * k)); const H = Math.max(1, Math.round(img.naturalHeight * k));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H);
  return { width: W, height: H, data: d.data };
}
/** Auto Trace: the picture's outlines as lines, arcs and circles (cad/autotrace.js). */
async function autoTraceNow() {
  const e = state.editing; const ed = e?.editor;
  const pic = ed?.sketch?.picture;
  if (!pic?.src) { notify('info', t('skt.noPicture')); return; }
  const img = await picturePixels(pic.src);
  if (!img) { notify('error', t('skt.cannotRead')); return; }
  const o = ed.traceOptions;
  const traced = traceImage(img, { mode: o.mode, threshold: o.threshold, tol: o.tol, minArea: o.minArea });
  const made = traceToSketch(ed.sketch, traced, pic, img.width, img.height, { addLine, addArc, addCircle, newPoint: (s, x, y) => { const p = { id: newSketchId('p'), type: 'point', x, y }; s.entities.push(p); return p; } });
  if (!made.length) { notify('info', t('skt.nothing')); return; }
  ed.selection = made.map((x) => x.id); ed.traceOpen = false;
  ed.solve(); ed.commit('op.autoTrace'); ed.render(); renderLeft();
  notify('success', t('skt.made', { count: made.length, loops: traced.length }));
  return made.length;
}

/** Solves a 3D sketch feature's relations into its points (sketch3d-solve.js); false when they conflict. */
function solveRelations3d(f) {
  if (f?.type !== 'sketch3d' || !f.relations3d?.length) return true;
  const r = solve3d(f.points, f.relations3d, { closed: f.closed });
  for (const d of f.relations3d) if (d.driven) d.value = Math.round(measure3d(r.points, d, f.closed) * 1e6) / 1e6;
  if (r.ok) f.points = r.points;
  f.dof3 = r.dof; f.red3 = r.redundant;
  return r.ok;
}

/**
 * The curves a point of the sketch being edited can pierce: curves of the sketches before it and curve features
 * (3D sketch, helix …): [{ value: 'feature|entity', label }].
 */
function pierceOptions() {
  const e = state.editing; const part = activePart();
  if (e?.mode !== 'sketch' || !part) return [];
  const before = part.features.slice(0, e.index >= 0 ? e.index : part.features.length);
  const out = [];
  for (const f of before) {
    if (f.suppressed || f.id === e.feature.id) continue;
    if (f.type === 'sketch') for (const x of f.entities ?? []) if (['line', 'arc', 'circle', 'spline', 'ellipse', 'ellipseArc', 'conic', 'equation'].includes(x.type) && !x.construction) out.push({ value: `${f.id}|${x.id}`, label: `${f.name} › ${t(`sketch.entity.${x.type}`, null, x.type)}` });
    if (CURVE_TYPES.includes(f.type)) out.push({ value: `${f.id}|`, label: f.name });
  }
  return out;
}
/** Adds a pierce relation from the selected point to the chosen curve (its crossing found at once). */
function addPierce(value) {
  const e = state.editing; const ed = e?.editor; const part = activePart();
  const pid = ed?.selection.find((id) => byId(ed.sketch, id)?.type === 'point');
  if (!pid || !part) { notify('info', t('skp.pickPoint')); return; }
  const [feature, entity] = String(value).split('|');
  const c = addConstraint(ed.sketch, { type: 'pierce', a: pid, src: { feature, ...(entity ? { entity } : {}) } });
  const built = buildPart(part, { upTo: e.index, slot: 'sketch' }).result;
  const frames = new Map([...built.results].filter(([, r]) => r.frame && r.ok).map(([id, r]) => [id, r.frame]));
  const r = refreshPierce(ed.sketch, ed.frame, { features: built.features ?? part.features, frames, curves: built.curves });
  if (r.missing.includes(c.id)) { ed.sketch.constraints = ed.sketch.constraints.filter((k) => k !== c); notify('warning', t('skp.noCrossing')); return renderLeft(); }
  ed.solve(); ed.commit('op.addRelationship'); ed.render();
  return renderLeft();
}

function pmSelectImpl(key, value) {
  const e = state.editing;
  if (e?.mode === 'sketch' && key === 'pierceTo') { if (value) addPierce(value); return undefined; }
  if (e?.mode === 'sketch' && key.startsWith('arcCond:')) {
    const [, id, which] = key.split(':'); const ed = e.editor;
    if (setArcCondition(ed.sketch, id, which, value)) { ed.solve(); ed.commit('op.dimension'); ed.render(); }
    return renderLeft();
  }
  if (std.select(key, value)) return undefined;
  if (['simulation', 'motion', 'equations', 'configs'].includes(e?.mode)) return customSelect(key, value);
  if (more.owns(e)) return more.select?.(key, value);
  if (e?.mode !== 'feature') return;
  if (key === 'threadSize' && e.feature?.type === 'hole') {
    // A tapped hole: the tap drill (d − P) and a thread depth of 2 d (a drill deep enough for it).
    const row = TAP_SIZES.find(([sz]) => sz === value);
    updateFeature((f) => { f.threadSize = value; if (row) { const [, d, p] = row; f.diameter = Math.round((d - p) * 10) / 10; f.threadDepth = 2 * d; if (!f.through) f.depth = Math.max(Number(f.depth) || 0, 2 * d + 4 * p); } });
    return;
  }
  if (key === 'threadSize') {
    const row = THREAD_SIZES.find(([sz]) => sz === value);
    updateFeature((f) => { f.size = value || undefined; if (row) f.pitch = row[2]; });
    return;
  }
  if (key === 'profile') { updateFeature((f) => { f.profile = value; if (f.type === 'structural') [f.w, f.h, f.t] = STRUCTURAL_PROFILES[value] ?? [f.w, f.h, f.t]; }); return; }
  // Hole Wizard: ANSI inch sizes (clearance by fit, counterbore, countersink), UNC / UNF and NPT taps, the end condition.
  if (key === 'mSize') { updateFeature((f) => { f.mSize = value || undefined; const d = value ? metricStdHole(f.standard, value, f.kind, f.fit ?? 'normal') : null; if (d) Object.assign(f, d); }); return; }
  if (key === 'ansiSize') { updateFeature((f) => { f.ansiSize = value || undefined; const d = value ? ansiHole(value, f.kind, f.fit ?? 'normal') : null; if (d) Object.assign(f, d); }); return; }
  if (key === 'ansiTap') { updateFeature((f) => { f.ansiTap = value || undefined; const row = ANSI_TAPS.find(([n]) => n === value); if (row) { f.diameter = Math.round(row[3] * 25.4 * 1e4) / 1e4; f.threadSize = undefined; } }); return; }
  if (key === 'nptSize') { updateFeature((f) => { f.nptSize = value || undefined; const row = NPT_SIZES.find(([n]) => n === value); if (row) f.diameter = Math.round(row[3] * 25.4 * 1e4) / 1e4; }); return; }
  if (key === 'holeEnd') { updateFeature((f) => { f.through = value === 'through'; f.end = value === 'through' || value === 'blind' ? undefined : value; if (!f.end) delete f.end; }); return; }
  if (key === 'size') {
    const row = HOLE_SIZES.find(([s]) => s === value);
    updateFeature((f) => { f.size = value || undefined; if (row) [, f.diameter, f.cbDiameter, f.cbDepth, f.csDiameter] = row; });
    return;
  }
  if (key === 'gaugeTable') {
    updateFeature((f) => {
      f.gaugeTable = value || 'none';
      if (f.gaugeTable === 'custom' && !f.customGauges?.length) f.customGauges = [{ name: '1', thickness: Number(f.thickness) || 2, radius: Number(f.radius) || 2, k: Number(f.kFactor) || 0.44 }];
      const rows = gaugeRowsOf(f);
      if (rows.length && !rows.some((r) => r.name === String(f.gauge))) f.gauge = rows[0].name;
      const g = gaugeOf(f); if (g) { f.thickness = g.thickness; f.radius = g.radii[0]; f.kFactor = g.k; }
    });
    return;
  }
  if (key === 'gauge') { updateFeature((f) => { f.gauge = value; const g = gaugeOf(f); if (g) { f.thickness = g.thickness; f.radius = g.radii[0]; f.kFactor = g.k; } }); return; }
  if (key === 'gaugeRadius') { updateFeature((f) => { f.radius = Number(value); }); return; }
  if (key === 'stopFace' && e.feature?.type === 'formTool') {
    const face = (pmApi().partPlanarFaces?.(e.feature.toolPart) ?? []).find((x) => x.sig.center.map((c) => Math.round(c * 1e4)).join(',') === value);
    updateFeature((f) => { f.stopFace = face ? face.sig : null; f.removeFaces = (f.removeFaces ?? []).filter((x) => !face || x.center.join() !== face.sig.center.join()); });
    return;
  }
  if (key.startsWith('dfFrom:') || key.startsWith('dfTo:')) {
    // Deform curve pairs: the i-th initial / target curve ('' removes the pair).
    const [k, i] = key.split(':'); const list = k === 'dfFrom' ? 'curvesFrom' : 'curvesTo';
    updateFeature((f) => {
      const a = [...(f[list] ?? [])]; a[Number(i)] = value || null;
      f[list] = a;
      if (!value && k === 'dfFrom') { f.curvesFrom = (f.curvesFrom ?? []).filter((_, j) => j !== Number(i)); f.curvesTo = (f.curvesTo ?? []).filter((_, j) => j !== Number(i)); }
    });
    return;
  }
  if (key.startsWith('lc:')) {
    // A loft connector: the profile's start vertex ('' = automatic).
    const id = key.slice(3);
    updateFeature((f) => {
      const c = { ...(f.connect?.[id] ?? {}) };
      if (value === '' || value == null) delete c.start; else c.start = Number(value);
      f.connect = { ...(f.connect ?? {}), [id]: c };
      if (!Object.keys(c).length) delete f.connect[id];
      if (!Object.keys(f.connect).length) delete f.connect;
    });
    return;
  }
  if (key.startsWith('hel:')) { const [, side, i] = key.split(':'); updateFeature((f) => { f[side] = (f[side] ?? []).map((x, k) => (k === Number(i) ? { ...x, kind: value } : x)); }); return undefined; }
  updateFeature((f) => { f[key] = value || null; if (key === 'sketch' && f.type === 'revolve') f.axis = null; });
}

// ───────────────────────── sheet metal gauge and bend tables (cad/sheet-gauge.js, ui/pm-sheet-gauge.js)

const SHEET_ROWS = { cg: 'customGauges', kr: 'kRows', br: 'bendRows', fp: 'profilePts' };
/** A cell of a gauge / K / bend table row ("br:2:value"). */
function sheetRowField(key, raw, v) {
  const [p, i, col] = key.split(':'); const list = SHEET_ROWS[p];
  if (col !== 'name' && (v == null || (!(v >= 0) && p !== 'fp'))) { notify('error', t('notice.invalidValue', { text: raw })); renderLeft(); return; }
  updateFeature((f) => {
    const rows = (f[list]?.length ? f[list] : p === 'kr' ? DEFAULT_K_ROWS : []).map((r) => ({ ...r }));
    if (!rows[Number(i)]) return;
    rows[Number(i)][col] = col === 'name' ? String(raw).trim() : col === 'k' ? Math.min(1, v) : v;
    f[list] = rows;
    if (p === 'cg') { const g = gaugeOf(f); if (g) { f.thickness = g.thickness; f.kFactor = g.k; if (!g.radii.some((r) => Math.abs(r - Number(f.radius)) < 1e-6)) f.radius = g.radii[0]; } }
  });
}
/** Adds a row (a copy of the last), deletes one, or fills a bend table from the K-factor. */
function sheetRowCommand(name, arg) {
  const [p, i] = String(arg).split('.'); const list = SHEET_ROWS[p];
  if (!list) return;
  updateFeature((f) => {
    const rows = (f[list]?.length ? f[list] : p === 'kr' ? DEFAULT_K_ROWS : []).map((r) => ({ ...r }));
    if (name === 'smRowDel') rows.splice(Number(i), 1);
    else if (name === 'smRowAdd' && p === 'fp') {
      // A new corner halfway along the profile's closing side.
      const a = rows[rows.length - 1] ?? { u: 0, v: 0 }; const b = rows[0] ?? { u: 0, v: 0 };
      rows.push({ u: (Number(a.u) + Number(b.u)) / 2, v: (Number(a.v) + Number(b.v)) / 2 });
    } else if (name === 'smRowsSeed' && p === 'fp') {
      // The rectangle the flange has now: its width along the edge, its length.
      const w = Math.max(1e-3, (Number(f.edge?.length) || 50) - (Number(f.offsetStart) || 0) - (Number(f.offsetEnd) || 0)); const L = Number(f.length) || 20;
      rows.splice(0, rows.length, { u: 0, v: 0 }, { u: w, v: 0 }, { u: w, v: L }, { u: 0, v: L });
    } else if (name === 'smRowAdd') {
      const last = rows[rows.length - 1];
      rows.push(p === 'cg' ? { name: String(rows.length + 1), thickness: last?.thickness ?? (Number(f.thickness) || 2), radius: last?.radius ?? (Number(f.radius) || 2), k: last?.k ?? 0.44 }
        : p === 'kr' ? { ratio: (last?.ratio ?? 0) + 1, k: last?.k ?? 0.44 } : { angle: 90, radius: Number(f.radius) || 0, value: 0 });
    } else if (name === 'smRowsSeed') {
      const g = gaugeOf(f); const tk = g?.thickness ?? (Number(f.thickness) || 2); const k = g?.k ?? (Number(f.kFactor) || 0.44);
      if (p === 'kr') rows.splice(0, rows.length, ...DEFAULT_K_ROWS.map((r) => ({ ...r })));
      else rows.splice(0, rows.length, ...seedBendRows(f.bendMethod === 'deduction' ? 'deduction' : 'allowance', tk, g ? g.radii : [Number(f.radius) || 0], k));
    }
    f[list] = rows;
    if (name === 'smRowsClear') delete f[list];
  });
}

function pmCommand(cmd) { return recorder.around('pmCommand', [cmd], () => pmCommandImpl(cmd)); }
async function pmCommandImpl(cmd) {
  const e = state.editing;
  const [name, arg] = cmd.split(':');
  if (name === 'ok') return acceptEditing();
  if (name === 'cancel') return cancelEditing();
  if (['smRowAdd', 'smRowDel', 'smRowsSeed', 'smRowsClear'].includes(name) && e?.mode === 'feature') return sheetRowCommand(name, arg);
  if (name === 'sbDel' && e?.mode === 'feature') { updateFeature((f) => { f.setbacks = (f.setbacks ?? []).filter((_, i) => i !== Number(arg)); if (!f.setbacks.length) delete f.setbacks; }); return undefined; }
  if (name === 'scadReset' && e?.mode === 'feature') { updateFeature((f) => { f.overrides = {}; delete f.result; }); return undefined; }
  if (name === 'scadFolder' && e?.mode === 'feature') return scadChooseFolder();
  if (name === 'offsetApply' && e?.mode === 'sketch') {
    const n = e.editor.offsetSelectionBy();
    if (!n) notify('info', t('sketch.selectFirst')); else { e.editor.offsetOpen = false; e.editor.render(); notify('success', t('sko.made', { count: n })); }
    return renderLeft();
  }
  if (name === 'traceNow' && e?.mode === 'sketch') return autoTraceNow();
  if (name === 'traceClose' && e?.mode === 'sketch') { e.editor.traceOpen = false; return renderLeft(); }
  if (name === 'repairNow' && e?.mode === 'sketch') {
    const r = e.editor.repairNow(); e.editor.render();
    notify(r.openEnds.length ? 'warning' : 'success', t('skr.done', { fixed: r.removedTiny + r.removedDuplicates + r.mergedOverlaps + r.closedGaps, open: r.openEnds.length }));
    return renderAll();
  }
  if (name === 'repairShowOpen' && e?.mode === 'sketch') { const c = e.editor.repairCheck(); e.editor.selection = [...c.openEnds, ...c.branches]; e.editor.render(); return renderLeft(); }
  if (name === 'repairClose' && e?.mode === 'sketch') { e.editor.repairOpen = false; return renderLeft(); }
  if (name === 'offsetClose' && e?.mode === 'sketch') { e.editor.offsetOpen = false; return renderLeft(); }
  if (name === 'scadAnimPlay' && e?.mode === 'feature') return scadAnimToggle();
  if (name === 'scadAnimDump' && e?.mode === 'feature') return scadAnimDump();
  if (name === 'scadExport' && e?.mode === 'feature') return scadExportResult(arg);
  if (name === 'sketchOn') return openNewSketch({ kind: 'std', name: arg });
  if (name === 'clear') {
    if (more.owns(e)) return more.command('clear', arg);
    if (std.owns(e)) return std.command('clear', arg);
    if (e?.mode === 'measure') { e.picks = []; e.result = []; viewport.setSelection([]); return renderLeft(); }
    if (e?.mode === 'feature') updateFeature((f, ed) => { if (arg === 'holePoints') ed.holeSketch.points = []; else if (Array.isArray(f[arg]) && !/Vertex/.test(arg)) f[arg] = []; else if (arg in f) delete f[arg]; });
    // The simulation's fixture / load lists and the motion study's motors are cleared by customCommand.
    if (e?.mode === 'simulation' || e?.mode === 'motion') return customCommand(name, arg);
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
  if (name === 'drivenToggle' && e?.mode === 'sketch') {
    const ed = e.editor; const c = ed.sketch.constraints.find((k) => k.id === arg);
    if (c && !setDriven(ed.sketch, arg, !c.driven)) notify('warning', t('skd.cannotDrive'));
    ed.solve(); ed.commit('op.dimension'); ed.render(); return renderLeft();
  }
  if (name === 'delRelation' && e?.mode === 'sketch') { const ed = e.editor; ed.sketch.constraints = ed.sketch.constraints.filter((c) => c.id !== arg); ed.solve(); ed.render(); renderLeft(); renderStatus(); return undefined; }
  if (name === 'construction' && e?.mode === 'sketch') { e.editor.toggleConstruction(); e.editor.render(); return renderLeft(); }
  if (name === 'deleteSel' && e?.mode === 'sketch') { e.editor.deleteSelection(); e.editor.render(); return renderLeft(); }
  if (name === 'insert') { insertComponent(arg); return undefined; }
  if (name === 'insertSample') return insertSamplePart(arg);
  if (name === 'insertStep') return importStepDialog();
  if (name === 'insertSub') return insertSubassembly(arg);
  if (name === 'finishSpline' && e?.mode === 'sketch') { e.editor.finishSpline(); return renderLeft(); }
  if (name === 'equationApply' && e?.mode === 'sketch') { e.editor.addEquationFromDraft(); return renderLeft(); }
  if (name === 's3sel' && e?.mode === 'feature') {
    // A 3D sketch's segment or point picked (or unpicked) for the next relation.
    const [kind, ix] = String(arg).split('.'); const i = Number(ix);
    const sel = (e.s3sel ??= { segs: [], pts: [] }); const list = kind === 'seg' ? sel.segs : sel.pts;
    const at = list.indexOf(i); if (at >= 0) list.splice(at, 1); else list.push(i);
    return renderLeft();
  }
  if (name === 'rel3' && e?.mode === 'feature') {
    const sel = e.s3sel ?? { segs: [], pts: [] };
    const spec = REL3D[arg];
    const pick = spec?.on === 'seg' ? sel.segs : sel.pts;
    if (!spec || pick.length !== spec.n) { notify('info', t(spec?.on === 'seg' ? 's3.pickSegs' : 's3.pickPts', { n: spec?.n ?? 1 })); return undefined; }
    updateFeature((f) => { solveRelations3d(f); const red0 = f.red3 ?? 0; const r = addRelation3d(f, arg, pick[0], pick[1], () => newId('r3')); const solved = solveRelations3d(f); if (!solved || (spec.dim && (f.red3 ?? 0) > red0)) { if (spec.dim) { r.driven = true; solveRelations3d(f); notify('warning', t('sketch.overDefinedDriven')); } else { f.relations3d = f.relations3d.filter((x) => x !== r); solveRelations3d(f); notify('warning', t('s3.conflict')); } } });
    e.s3sel = { segs: [], pts: [] };
    return renderLeft();
  }
  if (name === 'delRel3' && e?.mode === 'feature') { updateFeature((f) => { f.relations3d = (f.relations3d ?? []).filter((x) => x.id !== arg); if (!f.relations3d.length) delete f.relations3d; solveRelations3d(f); }); return undefined; }
  if (name === 'drivenRel3' && e?.mode === 'feature') { updateFeature((f) => { const r = f.relations3d?.find((x) => x.id === arg); if (!r) return; if (r.driven) { delete r.driven; if (!solveRelations3d(f)) { r.driven = true; notify('warning', t('s3.conflict')); } } else { r.driven = true; solveRelations3d(f); } }); return undefined; }
  if (name === 'addPt3' && e?.mode === 'feature') { updateFeature((f) => { const last = f.points?.at(-1) ?? [0, 0, 0]; f.points = [...(f.points ?? []), [last[0] + 20, last[1], last[2]]]; }); return undefined; }
  if (name.startsWith('addHel') && e?.mode === 'feature') { const side = arg === 'far' ? 'far' : 'near'; updateFeature((f) => { const list = f[side] ?? []; const last = list.at(-1); f[side] = [...list, { kind: side === 'far' ? 'countersink' : 'straight', d: last ? Math.max(1, Number(last.d) * 0.8) : 8, depth: 5, angle: 90 }]; }); return undefined; }
  if (name === 'addVar' && e?.mode === 'feature') { updateFeature((f) => { const list = f.variable ?? []; const last = list.at(-1) ?? { rev: 0, pitch: Number(f.pitch) || 5, d: 2 * (Number(f.radius) || 10) }; f.variable = [...list, { rev: last.rev + 1, pitch: last.pitch, d: last.d }]; }); return undefined; }
  if (name === 'delVar' && e?.mode === 'feature') { updateFeature((f) => { f.variable = (f.variable ?? []).filter((_, k) => k !== Number(arg)); if (!f.variable.length) delete f.variable; }); return undefined; }
  if (name.startsWith('delHel') && e?.mode === 'feature') { const [side, i] = String(arg).split('.'); updateFeature((f) => { f[side] = (f[side] ?? []).filter((_, k) => k !== Number(i)); }); return undefined; }
  if (name === 'delPt3' && e?.mode === 'feature') { updateFeature((f) => { f.points = f.points.filter((_, k) => k !== Number(arg)); pruneRelations3d(f); solveRelations3d(f); }); return undefined; }
  // Customize's commands carry a command id that may hold ':' (view:top): the whole rest is the argument.
  return customCommand(name, /^(ck|ct|cg|tp)\./.test(name) ? cmd.slice(name.length + 1) : arg);
}

// ───────────────────────── events

function treeClick(row, event) {
  const key = row.dataset.tree;
  const e = state.editing;
  if (e?.mode === 'feature' && e.pick === 'seeds' && key.startsWith('feat:')) {
    const id = key.slice(5);
    const f = activePart()?.features.find((x) => x.id === id);
    if (f && TOOL_FEATURES.includes(f.type)) updateFeature((feat) => { feat.seeds = feat.seeds.includes(id) ? feat.seeds.filter((x) => x !== id) : [...feat.seeds, id]; });
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
  if (activeDrawing() && (kind === 'view' || kind === 'ann')) { state.drawingSelected = id; renderDrawing(); renderRight(); renderToolbarState(); }
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
    // (Not named `more`: that would hide the module's `more` tools in the rest of this handler.)
    const moreButton = target.closest('[data-toolbar-more]');
    if (moreButton) return showToolbarMore(moreButton);
    const docClose = target.closest('[data-doc-close]');
    if (docClose) { event.stopPropagation(); return removeDocument(docClose.dataset.docClose); }
    const docTab = target.closest('[data-doc-tab]');
    if (docTab) { const [kind, id] = docTab.dataset.docTab.split(':'); return switchDocument({ kind, id }); }
    const cmTab = target.closest('[data-cm-tab]');
    if (cmTab) { state.cmTab = cmTab.dataset.cmTab; return renderCommandManager(); }
    // A flyout's ▾: its family as a menu (the chosen one becomes the flyout's button).
    const flyArrow = target.closest('[data-fly]');
    if (flyArrow) {
      const box = flyArrow.closest('.cm-fly'); const key = flyArrow.dataset.fly;
      return showMenu(menuItems(box.dataset.flyItems.split(' ').filter((id) => commands[id])), anchorBelow(box), 'context', { header: { icon: commands[box.querySelector('[data-command]').dataset.command]?.icon ?? 'chevronDown', title: t(`fly.${key}`) } });
    }
    const command = target.closest('[data-command]');
    if (command && !command.disabled && command.tagName !== 'INPUT') {
      const id = command.dataset.command;
      const anchored = ['newMenu', 'themeMenu', 'exportMenu', 'viewsMenu', 'styleMenu', 'recentFolders', 'openExample', 'material', 'addView'].includes(id);
      return run(id, { anchor: anchored ? anchorBelow(command.closest('.split-button') ?? command) : undefined });
    }
    const windowControl = target.closest('[data-window]');
    if (windowControl) return windowButton(windowControl.dataset.window);
    const leftTab = target.closest('[data-left-tab]');
    if (leftTab && !leftTab.disabled) { state.leftTab = leftTab.dataset.leftTab; return renderLeft(); }
    const player = target.closest('[data-player]');
    if (player) { ({ play: playPlayer, pause: pausePlayer, stop: () => stopPlayer() })[player.dataset.player]?.(); return undefined; }
    const cmScroll = target.closest('[data-cm-scroll]');
    if (cmScroll) { const strip = root.querySelector('#palette-host .cm-tabs'); strip?.scrollBy({ left: Number(cmScroll.dataset.cmScroll) * Math.max(120, strip.clientWidth * 0.6), behavior: 'smooth' }); setTimeout(updateTabScroll, 350); return undefined; }
    const tabScroll = target.closest('[data-tab-scroll]');
    if (tabScroll) { const strip = root.querySelector('#tabs .tab-strip'); strip?.scrollBy({ left: Number(tabScroll.dataset.tabScroll) * Math.max(160, strip.clientWidth * 0.6), behavior: 'smooth' }); setTimeout(updateTabScroll, 350); return undefined; }
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
    if (pmRemove) { const [k, i] = pmRemove.dataset.pmRemove.split(':'); return updateFeature((f, e) => { if (k === 'holePoints') e.holeSketch.points.splice(Number(i), 1); else if (/^(start|end)(Face|Vertex)2?$|^dirVector$|^vertex$|^point$|^axisRef$|^base2$|^upToPoint$|^pullEdge$/.test(k)) { delete f[k === 'pullEdge' ? 'pull' : k]; } else if (k === 'multiFaces') f.multi.splice(Number(i), 1); else if (Array.isArray(f[k])) f[k].splice(Number(i), 1); }); }
    const pick = target.closest('[data-pm-pick]');
    if (pick && state.editing && !target.closest('button')) { state.editing.pick = pick.dataset.pmPick; renderLeft(); renderStatus(); return undefined; }
    const mat = target.closest('[data-material]');
    if (mat) return setMaterial(mat.dataset.material);
    const cpAdd = target.closest('[data-cprop-add]');
    const cpDel = target.closest('[data-cprop-del]');
    if ((cpAdd || cpDel) && (activePart() || activeAssembly())) {
      const d = activePart() ?? activeAssembly();
      if (cpAdd) { let n = 1; while ((d.customProperties ?? {})[`${t('props.customDefault')}${n}`] != null) n++; return change('op.customProperty', () => { d.customProperties = { ...(d.customProperties ?? {}), [`${t('props.customDefault')}${n}`]: '' }; }); }
      return change('op.customProperty', () => { d.customProperties = Object.fromEntries(Object.entries(d.customProperties ?? {}).filter((_, i) => i !== Number(cpDel.dataset.cpropDel))); });
    }
    const reset = target.closest('[data-prop-reset]');
    if (reset && activePart()) return change('op.edit', () => { activePart().color = null; });
    const drw = target.closest('[data-drw]');
    if (drw) return drawingAction(drw.dataset.drw);
    if (drwTools.sheetClick(event)) return undefined;
    if (state.drawingPlace && activeDrawing() && target.closest('#drawing-host svg')) return placeAnnotation(event);
    const ann = target.closest('#drawing-host [data-annotation]');
    if (ann && activeDrawing()) { state.drawingSelected = ann.dataset.annotation; renderDrawing(); renderRight(); renderToolbarState(); return undefined; }
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
      if (more.treeDouble(key)) return undefined;
      if (key.startsWith('feat:')) return editFeature(key.slice(5));
      if (key.startsWith('comp:')) { const c = activeAssembly()?.components.find((x) => x.id === key.slice(5)); if (c) switchDocument(c.sub ? { kind: 'assembly', id: c.sub } : { kind: 'part', id: c.part }); }
      if (key === 'equations') return startEquations('equations');
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
    if ('scadSource' in target.dataset) return scadSourceChanged(target.value);
    if (target.dataset.scadAnim != null) return scadAnimChanged(target.dataset.scadAnim, target.value);
    if (target.dataset.scadParam != null) return scadParamChanged(target.dataset.scadParam, target.value, target.dataset.kind, target.checked);
    if (target.dataset.pmField != null) return pmFieldChanged(target.dataset.pmField, target.value, target.dataset.unit);
    if (target.dataset.pmToggle != null) return pmToggle(target.dataset.pmToggle, target.checked);
    if (target.dataset.pmSelect != null) return pmSelect(target.dataset.pmSelect, target.value);
    if (target.dataset.commandCheck) return run(target.dataset.commandCheck);
    if (target.dataset.prop) return setProp(target.dataset.prop, target.value);
    if (target.dataset.drwToggle) return change('op.edit', () => { activeDrawing()[target.dataset.drwToggle] = target.checked; });
    if (target.dataset.drwBom != null) return change('op.edit', () => { const d = activeDrawing(); d.bom = { ...(d.bom ?? {}), show: target.checked }; });
    if (target.dataset.ann) { const [id, field] = target.dataset.ann.split(':'); return setAnnotationField(id, field, target.type === 'checkbox' ? target.checked : target.value); }
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
    if ('materialSearch' in target.dataset) {
      const q = target.value.trim().toLowerCase();
      for (const fam of root.querySelectorAll('.material-family')) {
        let any = false;
        for (const card of fam.querySelectorAll('.material-card')) { const hit = !q || (card.title + ' ' + card.textContent).toLowerCase().includes(q); card.hidden = !hit; any ||= hit; }
        fam.hidden = !any; if (q) fam.open = any;
      }
      return undefined;
    }
    if ('sectionOffset' in target.dataset && state.section) { state.section = { ...state.section, offset: Number(target.value) }; viewport.setSection(state.section); }
    if ('playerTime' in target.dataset && activeAssembly()) {
      state.player.playing = false; state.player.time = Number(target.value);
      try { showMotionTime(state.player.time); } catch { /* shown next time */ }
      // Only the buttons' states change: drawing the bar again would replace the slider being dragged.
      const bar = root.querySelector('#motion-bar');
      const btn = (k) => bar?.querySelector(`[data-player="${k}"]`);
      if (btn('play')) { btn('play').disabled = false; btn('play').classList.remove('active'); }
      if (btn('pause')) btn('pause').disabled = true;
      if (btn('stop')) btn('stop').disabled = !(state.player.time > 0);
    }
    if ('motionTime' in target.dataset && state.editing?.mode === 'motion') { state.editing.playing = false; state.editing.time = Number(target.value); try { showMotionTime(state.editing.time); } catch { /* shown next time */ } const out = root.querySelector('[data-motion-clock]'); if (out) out.textContent = `${fmt(state.editing.time, 2)} s`; }
    if ('startSpeed' in target.dataset) { const out = target.closest('label')?.querySelector('output'); if (out) out.textContent = `${target.value}%`; state.settings.animationSpeed = Number(target.value); }
    if ('startOpacity' in target.dataset) { const out = target.closest('label')?.querySelector('output'); if (out) out.textContent = `${target.value}%`; root.querySelector('.start-inner')?.style.setProperty('--start-card-alpha', `${target.value}%`); }
  });

  // The OpenSCAD code editor: highlighting, completion, console lines that jump to the code (ui/scad-editor.js).
  attachScadEditor(root);
  root.addEventListener('keydown', (event) => {
    if (event.target.matches?.('textarea[data-scad-source]')) {
      // Ctrl+Enter applies the code at once (leaving the field applies it too, through 'change').
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); void scadSourceChanged(event.target.value); return; }
      if (event.key === 'Tab' && !event.shiftKey) { event.preventDefault(); const ta = event.target; const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); return; }
    }
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

  // Annotations: drag to move (the leader end stays where it points).
  root.addEventListener('pointerdown', (event) => {
    const el = event.target.closest?.('#drawing-host [data-annotation]');
    if (!el || event.button !== 0 || !activeDrawing()) return;
    // app-drw.js drags with snapping, also while a drawing tool's PropertyManager is open.
    if (drwTools.annotationDrag?.(event, el)) return;
    if (state.drawingPlace) return;
    event.stopPropagation();
    const d = activeDrawing();
    const id = el.dataset.annotation;
    const svg = el.ownerSVGElement;
    const pt = (e) => { const q = svg.createSVGPoint(); q.x = e.clientX; q.y = e.clientY; return q.matrixTransform(svg.getScreenCTM().inverse()); };
    const start = pt(event);
    let moved = false;
    const move = (e) => { const q = pt(e); if (Math.hypot(q.x - start.x, q.y - start.y) > 0.8) { moved = true; el.setAttribute('transform', `translate(${q.x - start.x} ${q.y - start.y})`); } };
    const up = (e) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      if (!moved) return;
      const q = pt(e);
      change('op.annotation', () => { const a = d.annotations.find((x) => x.id === id); if (!a) return; const dx = q.x - start.x; const dy = q.y - start.y; a.x += dx; a.y += dy; if (a.kind === 'dimension') { a.a = [a.a[0] + dx, a.a[1] + dy]; a.b = [a.b[0] + dx, a.b[1] + dy]; } });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }, true);

  // Feature tree: drag a feature onto another (it goes before it) or onto a folder (into it).
  root.addEventListener('dragstart', (event) => {
    const r = event.target.closest?.('[data-tree^="feat:"]');
    if (!r) return;
    event.dataTransfer.setData('application/x-mymech-feature', r.dataset.tree.slice(5));
    event.dataTransfer.effectAllowed = 'move';
  });
  root.addEventListener('dragover', (event) => {
    const r = event.target.closest?.('[data-tree^="feat:"], [data-tree^="folder:"]');
    if (!r || !event.dataTransfer?.types?.includes('application/x-mymech-feature')) return;
    event.preventDefault();
    root.querySelectorAll('.tree-row.drop-target').forEach((x) => x.classList.remove('drop-target'));
    r.classList.add('drop-target');
  });
  root.addEventListener('drop', (event) => {
    const r = event.target.closest?.('[data-tree^="feat:"], [data-tree^="folder:"]');
    const id = event.dataTransfer?.getData('application/x-mymech-feature');
    root.querySelectorAll('.tree-row.drop-target').forEach((x) => x.classList.remove('drop-target'));
    if (!r || !id) return;
    event.preventDefault();
    if (r.dataset.tree !== `feat:${id}`) dropFeature(id, r.dataset.tree);
  });

  // Drawing views: drag to move.
  root.addEventListener('pointerdown', (event) => {
    const view = event.target.closest?.('#drawing-host [data-view]');
    if (!view || event.button !== 0 || !activeDrawing() || state.drawingPlace || event.target.closest('[data-annotation]')) return;
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

  // The left panel is re-rendered often, so its inner divider is handled here (delegated).
  root.addEventListener('pointerdown', (event) => { if (event.button === 0 && event.target.closest?.('[data-split="leftPm"]')) startLeftPmSplit(event); });

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

  window.addEventListener('resize', frameThrottle(() => { fitToolbar(); fitCommandManager(); updateTabScroll(); if (desktop && state.minWidth && window.innerWidth < state.minWidth - 1) native.setMinimumSize(state.minWidth, 640).catch(() => {}); }));
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

  setInterval(() => { const clock = root.querySelector('#status-clock'); if (clock) clock.textContent = clockText(); }, 15000);
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
  if (!p) return;
  // The last tab's ✕ closes the project (back to the start page, asking to save as Close does).
  if (documentsOf(p).length <= 1) return closeProject();
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
  if (scope === 'cprop' && (part || asm)) {
    const d = part ?? asm; const entries = Object.entries(d.customProperties ?? {}); const i = Number(id);
    if (!entries[i]) return undefined;
    const text = String(raw ?? '').trim();
    if (field === 'key') { if (!text || (text !== entries[i][0] && entries.some(([k]) => k === text))) { notify('error', t('props.customKeyBad', { name: text })); return renderRight(); } entries[i][0] = text; }
    else entries[i][1] = String(raw ?? '');
    return change('op.customProperty', () => { d.customProperties = Object.fromEntries(entries); });
  }
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
/** Ctrl+1 … Ctrl+7: the standard views. */
const VIEW_KEYS = { 1: 'view:front', 2: 'view:back', 3: 'view:left', 4: 'view:right', 5: 'view:top', 6: 'view:bottom', 7: 'view:iso' };

/**
 * Arrow keys turn the view about the screen axes by the set step (Shift: 90°); Alt+←/→ roll; Ctrl+arrows pan.
 * Only while the graphics area (not a field, a list or a menu) has the keyboard.
 */
function arrowView(event, key) {
  const dirs = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
  if (!dirs[key] || !viewport || viewport.lockRotation && !(event.ctrlKey || event.metaKey)) return false;
  const inView = event.target === document.body || event.target === viewport.canvas || event.target.closest?.('#view-host');
  if (!inView) return false;
  event.preventDefault();
  const [x, y] = dirs[key];
  if (event.ctrlKey || event.metaKey) { viewport.panBy(-x * 40, -y * 40); return true; }
  const step = event.shiftKey ? 90 : Number(state.settings.arrowStep) || 15;
  if (event.altKey) { if (x) viewport.rotateScreen('z', -x * step); return true; }
  if (x) viewport.rotateScreen('y', x * step); else viewport.rotateScreen('x', y * step);
  return true;
}

/** The built-in shortcuts as key combinations ('Ctrl+Shift+S' → saveAs …), for Customize. */
function defaultShortcuts() {
  const name = (k) => ({ '!': '1', '@': '2' }[k] ?? k.toUpperCase());
  return [
    ...SHORTCUTS.map(([k, shift, cmd]) => [`Ctrl+${shift ? 'Shift+' : ''}${name(k)}`, cmd]),
    ...Object.entries(VIEW_KEYS).map(([k, cmd]) => [`Ctrl+${k}`, cmd]),
    ['F1', 'userGuide'], ['F2', 'rename'], ['F', 'zoomFit'], ['K', 'styleCycle'], ['Delete', 'delete'], ['Space', 'viewsMenu'],
  ];
}

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  const editing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const mod = event.ctrlKey || event.metaKey;
  // The user's own shortcuts (Customize › Keyboard) come first; a default turned off does nothing.
  const custom = customTools.api.keyCommand(event, Boolean(editing));
  if (custom) { event.preventDefault(); event.stopPropagation(); if (custom.cmd) run(custom.cmd, custom.cmd === 'viewsMenu' ? { anchor: anchorFor('viewsMenu') } : undefined); return; }
  if (mod && !event.altKey) {
    if (editing && ['x', 'c', 'v', 'z', 'y', 'a'].includes(key)) return;
    if (!editing && hasDoc() && arrowView(event, key)) return;
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
  if (key === 'enter' && sketching() && state.editing.editor.finishSpline()) { event.preventDefault(); renderLeft(); return; }
  if (key === 'enter' && state.editing) { event.preventDefault(); acceptEditing(); return; }
  if (key === 'delete' || key === 'backspace') { event.preventDefault(); run('delete'); return; }
  if (key === ' ' && !sketching()) { event.preventDefault(); run('viewsMenu', { anchor: anchorFor('viewsMenu') }); return; }
  if (key === 'f') { event.preventDefault(); run('zoomFit'); return; }
  if (arrowView(event, key)) return;
  if (sketching()) {
    const map = { l: 'sk:line', r: 'sk:rect', c: 'sk:circle', a: 'sk:arc3', p: 'sk:polygon', d: 'sk:dimension', t: 'sk:trim', s: 'sk:select', e: 'sk:ellipse', x: 'sk:extend', o: 'sk:offset' };
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
  popups.on('start-tutorial', () => openDocWindow('tutorial'));
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
  // Scheduled tasks run while the application is open (one instance: the first window only).
  if (!state.instance || state.instance.first) taskTools.startTimer();
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
  if (result?.choice === 'tutorial') openDocWindow('tutorial');
  else if (result?.choice === 'sample') openSampleAsk('flange');
}

// Test hook: the E2E suite and the smoke script drive the app through this.
window.__mymechanics = {
  state, t, commands, popups, run, std,
  menus: { MENUS, SUBMENUS, enabled: (id) => commandEnabled(id) },
  get viewport() { return viewport; },
  actions: {
    newDocument, openSampleAsk, openContent, saveDoc, closeProject, select, change, undo, redo, startFeature, startSketch, openNewSketch, editSketch, editFeature,
    acceptEditing, cancelEditing, exitSketch, sketchCommand, switchDocument, newDrawing, insertComponent, startMate, showStartPage, updateSettings, pmFieldChanged, pmSet, pmToggle, pmCommand, pmSelect,
    pick: (hit, mods) => onViewportPick(hit, mods),
    buildPart: (part) => buildPart(part), exportModel, checkInterference, massPropertiesRows, rollbackTo, ensureKernel, regenerate, withExportSink,
  },
  get project() { return project(); },
  active: () => active(),
};
window.__mymechanics.sim2 = more.sim2;
// The tutorial video's replay (scripts/make-tutorial-video.mjs): the finished tutorial robot (without its stage) and
// a feature opened in its own PropertyManager, ready to accept.
// (A hole there refers to its point sketch, already made: its points count as placed, no new sketch is made.)
window.__mymechanics.tutorial = { robot: (lang) => buildSample('tut17', lang ?? state.settings.language, { stage: false }), begin: (feature) => beginFeature(structuredClone(feature), feature.type === 'hole' ? { holeSketch: { plane: null, points: [[0, 0]] } } : {}) };
// The CommandManager as written (COMMAND_TABS) and as shown (families folded into flyouts) — for the tests.
window.__mymechanics.ribbon = () => { return { tabs: COMMAND_TABS, grouped: ribbonGroups(), toolbar: [...TOOLBAR.flat(), ...TOOLBAR_RIGHT, ...Object.values(TOOLBAR_MAIN)] }; };
window.__mymechanics.decals = decalTools;
window.__mymechanics.walk = walkTools.api;
window.__mymechanics.frame = frameTools.api;
window.__mymechanics.custom = customTools.api;
window.__mymechanics.idf = { importIdfBoard, exportIdf };
window.__mymechanics.mfg = mfgTools.api;
window.__mymechanics.illustration = illTools.api;
window.__mymechanics.schematic = schTools.api;
window.__mymechanics.designCheck = dcTools.api;
window.__mymechanics.tasks = taskTools.api;
window.__mymechanics.macro = macroTools.api;
window.__mymechanics.designStudy = dsTools.api;
window.__mymechanics.defeature = dfTools.api;
window.__mymechanics.markup = mkTools.api;
window.__mymechanics.electronics = elTools.api;
window.__mymechanics.freeSurface = fsTools.api;
window.__mymechanics.pdm = pdm.api;
window.__mymechanics.asmTools = asmTools;

start()
  .catch((error) => showError('error.unexpected', error, 'start'))
  .finally(() => { if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {}); });
