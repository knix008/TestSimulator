// Main window: menu bar, toolbar, drawing tabs, tool panel (left), drawing
// canvas with its command line, properties panel (right) and status bar.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { entitiesFromClipboard, entitiesToClipboard } from './domain/clipboard.js';
import { DrawingDocument } from './domain/document.js';
import * as D from './domain/drawing.js';
import { exportDxf, importDxf, looksLikeDxf } from './domain/dxf.js';
import {
  boxOfEntities, canExplode, createEntity, DIM_KINDS, normalizeEntity, dimText, entityDistance, explode, formatNumber, grips, inBox, LINE_TYPES, LINE_WIDTHS, measure, moveGrip, primitives, totalLength, transformEntity,
} from './domain/entities.js';
import { evaluate } from './domain/expr.js';
import { startPageHtml } from './view/startpage.js';
import { bindSteppers } from './stepper.js';
import appIconUrl from '../assets/icon-256.png';
import { importDrawingBytes, isCadDrawingFileName } from './domain/import2d.js';
import { exportHpgl } from './domain/formats2d.js';
import { exportIges } from './domain/iges.js';
import { exportDxf2000 } from './domain/dxf2000.js';
import { displayUnit, evaluateLength, formatArea, formatLength, formatVolume, gridBaseFor, lengthValue, setDisplayUnit, toUnit, unitFactor, unitLabel, unitStep } from './domain/units.js';
import {
  baseName, directoryOf, extensionOf, FormatError, isDrawingFileName, isDxfFileName, isImageFileName, isModelFileName, isTextFileName, parseFile, safeFileName, serialize, stripExtension, withExtension,
} from './domain/format.js';
import { arcPoints, boxCenter, boxHeight, boxWidth, dist, normalizeBox, polygonArea } from './domain/geometry.js';
import { booleanOf } from './domain/csg.js';
import { exportMesh, importMesh, setBooleanImplementation } from './domain/exchange3d.js';
import { canDressUp, DRESSUP_EDGES, DRESSUP_KINDS } from './domain/dressup.js';
import { frameMatrix, frameOnFace, isGlobal, planeFrom, toPlane } from './domain/workplane.js';
import { BALLOON_SHAPES, GDT_MODIFIERS, GDT_SYMBOLS, LEADER_STYLES } from './domain/annotate.js';
import { checkSolid, repairMesh } from './domain/meshcheck.js';
import { nestPanels } from './domain/nesting.js';
import { normalizeSpreadsheet, parseCsv, sheetCsv, sheetVariables } from './domain/spreadsheet.js';
import { eulerTo, fitCylinder, fitPlane, fitSphere, meshFromPoints } from './domain/points.js';
import { convexHull, placement, solidPoints } from './domain/solids.js';
import { inverseKinematics, samplePath, toKrl, trajectory } from './domain/robot.js';
import { composePose, placementOf as poseFields, ANIMATION_MODES, explodeDeltas, hasDrives, JOINT_TYPES, jointKeys, makeJoint, makeOrientedJoint, normalizeAnimation, ORIENTING, poseDelta, poseOf, solveAnimation } from './domain/assembly.js';
import { followRobotTools } from './domain/robot.js';
import { setVariables } from './domain/expr.js';
import { decimateMesh } from './domain/features.js';
import { CAM_3D, camPaths, camSource, toGcode } from './domain/cam.js';
import { gridFor, heightField, simulate, stockMesh } from './domain/cam3d.js';
import { analyzeFrame, autoScale, deformedShape, frameFrom, momentDiagram, normalizeFem } from './domain/fem.js';
import { analyzePlate, normalizePlate, plateDeformed, platePeak, plateScale, plateSource } from './domain/plate.js';
import { addConstraint, canConstrain, CONSTRAINT_TYPES, DIMENSIONAL, entityPoint, nearestPoints, pointsOf, UNITLESS, VIRTUAL_ENTITIES } from './domain/constraints.js';
import { loadOcc, occDressEdges, occReady } from './domain/occ.js';
import { loadPython, nextStep, pythonReady, runPython, tracePython } from './script/python.js';
import { analyzeSolid, boundaryQuads, normalizeFem3d, parseCalculixDat, toCalculix } from './domain/fem3d.js';
import { ADDON_CATALOG } from './script/addons.js';
import { PYTHON_MODULES } from './script/python.js';
import { stdCommands } from './commands/std.js';
import { std2Commands, OVERLAY_SIDES, WORKBENCHES } from './commands/std2.js';
import { modelTreeHtml } from './view/modeltree.js';
import { testCommands, TEST_MENU } from './commands/test.js';
import { partCommands } from './commands/part.js';
import { partDesignCommands } from './commands/partdesign.js';
import { sketcherCommands, sketchOverlayPrims, SKETCHER_MENU } from './commands/sketcher.js';
import { draftCommands, DRAFT_MENU } from './commands/draft.js';
import { meshCommands, MESH_MENU } from './commands/mesh.js';
import { sheetCommands, SHEET_MENU } from './commands/sheet.js';
import { assemblyCommands, ASSEMBLY_MENU } from './commands/assembly.js';
import { openscadCommands, OPENSCAD_MENU } from './commands/openscad.js';
import { camJobCommands, CAMJOB_MENU } from './commands/camjob.js';
import { femxCommands, FEMX_MENU } from './commands/femx.js';
import { techDrawCommands, TECHDRAW_MENU } from './commands/techdraw.js';
import { bimCommands, BIM_MENU } from './commands/bim.js';
import { elementName, matchElement, meshTopology } from './domain/topology.js';
import { SURFACE_MODES } from './domain/surface.js';
import { apply as apply3, bestFit as _bestFit, rotationOf, transformPlacement } from './domain/transform3d.js';
import { massOf } from './domain/materials.js';
import { buildPdf } from './domain/pdf.js';
import { defaultPrintOptions, pageSvg, paginate, selectContent } from './domain/print.js';
import { variableScope } from './domain/docextras.js';
import { newId } from './domain/entities.js';
import packageInfo from '../package.json';
import { REVISION as THREE_REVISION } from 'three';
import { resetSolidCaches } from './domain/solids.js';
import { featureFrom, meshBox, normalizeSolidData, normalizeSolidParams, flattenTriangles, shadedView, SOLID_ICONS, SOLID_KINDS, SOLIDS, solidMesh, solidProperties } from './domain/solids.js';
import { ARCH_FROM_LINES, ARCH_FROM_OUTLINES, ARCH_INSERT_KINDS, archFrom, archQuantities, createBim, normalizeBim, defaultOpening, isArchKind, MATERIAL_PATTERNS, profileFromLoops, REBAR_HOSTS, wallLength, wallWidth } from './domain/arch.js';
import { drawingViews, sectionOutlines, VIEW_NAMES } from './domain/views.js';
import { CATEGORY_ICONS, categoryOf, optionIsWord, PART_CATEGORIES, PART_KINDS, PARTS, partInfo } from './domain/parts.js';
import './view/partIcons.js';
import { addRecent, loadRecent, storeRecent } from './domain/recent.js';
import { applyOrtho, findSnap, snapToGrid } from './domain/snap.js';
import { exportSvg } from './domain/svg.js';
import { buildShapes, collectLoops, prepareStl, toAsciiStl, toBase64, toBinaryStl } from './domain/stl.js';
import { HATCH_PATTERN_NAMES } from './domain/hatch.js';
import { defaultSettings, loadSettings, normalizeSettings, RECENT_KEY, SESSION_KEY, SNAP_MODES, STORAGE_KEY, storeSettings, ZOOM } from './domain/settings.js';
import { switchFlag } from './flags.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { POPUPS, PopupHost } from './platform/popups.js';
import { checkDrawing, problemCounts, SEVERITIES } from './domain/check.js';
import { applyFont, applyTheme, drawingFontStack, mix, nextThemeId, resolveTheme, themeName } from './themes.js';
import { cachedBox, PX_PER_MM, render, RULER, Viewport } from './view/renderer.js';
import { createTool, DIM_TOOLS, DRAW_TOOLS, MODIFY_TOOLS, NEEDS_SELECTION, readout, TOOL_ICONS, TOOL_KEYS, VIEW_TOOLS } from './view/tools.js';

// FreeCAD documents may hold booleans; they are computed with MyCAD's CSG.
setBooleanImplementation(booleanOf);

const root = document.querySelector('#app');
const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const popups = new PopupHost();
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const isMac = /Mac/i.test(navigator.platform ?? '');
const keyLabel = (key) => (isMac ? key.replace('Ctrl+', '⌘').replace('Shift+', '⇧').replace('Alt+', '⌥') : key);
const fmt = (value, digits = 2) => formatNumber(value, digits);
/** Assembly animation player: time (s), the joint values of the last frame (the next solve starts there). */
const anim = { active: false, playing: false, time: 0, joints: null, frame: 0, last: 0, failed: [] };
/** "V1.0": how the version is shown (title bar, About, start page). */
const displayVersion = (version) => (version ? `V${String(version).split('.').slice(0, 2).join('.')}` : '');
// 3D solid commands (FreeCAD Part workbench).
const FEATURE_KINDS = ['pad', 'revolution', 'loft', 'sweep', 'pocket', 'groove', 'hole', 'surfRuled', 'surfFill', 'surfExtrude'];
/** PartDesign features that cut the one selected solid. */
const CUT_FEATURES = ['pocket', 'groove', 'hole'];
const BOOL_OPS = ['union', 'cut', 'common'];
const BOOL_ICONS = { union: 'solidUnion', cut: 'solidCut', common: 'solidCommon' };
const EXPORT_3D = ['3mf', 'amf', 'obj', 'ply', 'off', 'wrl', 'dae', 'step', 'brep', 'scad', 'xyz', 'fcstd', 'ifc'];
// Draw styles of the 3D view (FreeCAD Std_DrawStyle, X-ray, sketch, clay): the same list as view3d.js VIEW_STYLES.
const VIEW_STYLE_IDS = ['asis', 'shaded', 'flat', 'clay', 'hidden', 'xray', 'sketch', 'wireframe', 'mesh', 'points'];
const VIEW_STYLE_ICONS = { asis: 'styleAsIs', shaded: 'styleShaded', flat: 'styleFlat', clay: 'styleClay', hidden: 'styleHidden', xray: 'styleXray', sketch: 'styleSketch', wireframe: 'styleWire', mesh: 'polygon', points: 'stylePoints' };
// BIM objects (FreeCAD BIM workbench): made from selected lines / outlines, or placed.
const ARCH_SELECTION_KINDS = [...ARCH_FROM_LINES, ...ARCH_FROM_OUTLINES];
const ARCH_MENU = ['arch:wall', 'arch:curtainwall', group('openings', ['arch:window', 'arch:door', 'arch:customWindow']), '-', group('structure', ['arch:column', 'arch:beam', 'arch:slab', 'arch:stairs', 'arch:roof', 'arch:railing']), group('reinforce', ['arch:rebar', 'arch:truss', 'arch:panel', 'arch:pipe']), '-', 'arch:space', 'arch:equipment', 'arch:axis', '-', 'bimManager', 'editSolid', group('sections', ['solidSection', 'solidProject']), group('reports', ['archSchedule', 'scheduleCsv', 'panelNest']), '-',
  group('bimTools', [group('bimComponents', BIM_MENU.components), group('bimStructure', BIM_MENU.structure), group('bimIfc', BIM_MENU.ifc), group('bimManage', BIM_MENU.manage), group('bimNudge', BIM_MENU.nudge), group('bimWorkPlane', BIM_MENU.workPlane)])];
/** A submenu: a named group of commands opened in the same menu window. */
function group(key, items) { return { group: key, items }; }
/** Every command of a menu, its groups opened out. */
function menuIds(items) { return items.flatMap((id) => (id?.group ? menuIds(id.items) : [id])); }

/** Std_RestartInSafeMode: this run uses the default settings (the stored ones stay as they are). */
const SAFE_MODE = (() => { try { return globalThis.sessionStorage?.getItem('mycad.safeMode') === '1'; } catch { return false; } })();

const state = {
  safeMode: SAFE_MODE,
  settings: SAFE_MODE ? defaultSettings(loadSettings(globalThis.localStorage).language) : loadSettings(globalThis.localStorage),
  recent: loadRecent(globalThis.localStorage),
  docs: [],
  active: null,
  selection: new Set(),
  problems: { list: [], doc: null, filter: { error: true, warning: true, info: true } },
  tool: null,
  toolId: 'select',
  toolOptions: { sides: 6, offset: 5, fillet: 10, chamfer: 5, mirrorKeep: true, hatchPattern: 'ansi31', hatchScale: 1, hatchAngle: 0 },
  partCategory: 'fasteners',
  notice: null,
  info: null,
  openMenu: null,
  lastMenuClose: { name: null, at: 0 },
  quitting: false,
  untitled: 0,
  dropActive: false,
  minWidth: 0,
  clipboard: '',
  fonts: null,
  cursor: null,
  snap: null,
  hover: null,
  measured: null,
  live: null,
  // Start page (the house tab): shown instead of the drawing; its sample list and thumbnails.
  home: false,
  samples: null,
  samplesError: null,
  thumbs: new Map(),
  loading: null,
  tutorial: null,
};

const activeDoc = () => state.docs.find((doc) => doc.id === state.active) ?? null;
const activeDrawing = () => activeDoc()?.drawing ?? null;
const docName = (doc) => (doc.path ? baseName(doc.path) : doc.name ?? doc.drawing.title);
const selectedIds = () => [...state.selection];
const selectedEntities = () => {
  const drawing = activeDrawing();
  return drawing ? drawing.entities.filter((entity) => state.selection.has(entity.id)) : [];
};

// ───────────────────────── notices & errors

let noticeTimer = 0;
function notify(kind, text) {
  state.notice = { kind, text, at: Date.now() };
  renderStatus();
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { state.notice = null; renderStatus(); }, kind === 'error' ? 12000 : 6000);
}

function formatError(error) {
  if (error instanceof FormatError) return { message: t(error.code), detail: error.detail };
  const text = native.errorText(error);
  return { message: text, detail: error?.stack && !String(error.stack).startsWith(text) ? error.stack : error?.stack?.split('\n').slice(1).join('\n') ?? '' };
}

/** Shows an error in its own popup (details can be copied) and in the status bar. */
function showError(titleKey, error, context = '') {
  const { message, detail } = formatError(error);
  console.error(titleKey, error);
  notify('error', `${t(titleKey)}: ${message}`);
  const info = state.info;
  const report = {
    title: t(titleKey),
    message,
    detail: detail ?? '',
    context,
    time: new Date().toLocaleString(),
    app: info ? `${info.name} ${info.version} (${info.web ? 'web' : `${info.os}/${info.arch}`}, ${info.commit})` : 'MyCAD',
  };
  // The popup window could not open (very early, or the popup system itself failed): the same report in this window.
  try {
    Promise.resolve(popups.open('error', report)).catch(() => inlineError(report));
  } catch {
    inlineError(report);
  }
}

/** An error report inside the main window, with every detail and a copy button (when the popup cannot open). */
function inlineError(report) {
  const text = [report.title, report.message, report.context, report.time, report.app, '', report.detail].filter((line) => line !== undefined).join('\n');
  let panel = document.querySelector('.inline-error');
  if (!panel) {
    panel = document.createElement('section');
    panel.className = 'inline-error';
    panel.setAttribute('role', 'alertdialog');
    document.body.append(panel);
  }
  const escape = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  panel.innerHTML = `<h2>${escape(report.title)}</h2><p>${escape(report.message)}</p>
    <textarea readonly spellcheck="false">${escape(text)}</textarea>
    <div><button type="button" data-inline-copy>${escape(t('error.copy'))}</button><button type="button" data-inline-close>${escape(t('error.close'))}</button></div>`;
  panel.querySelector('[data-inline-copy]').onclick = () => { native.clipboardWrite(text).catch(() => navigator.clipboard?.writeText(text)); };
  panel.querySelector('[data-inline-close]').onclick = () => panel.remove();
}

/** The last run ended abnormally (crash, kill, power loss): say so, with what crash.log recorded. */
async function reportPreviousRun() {
  if (!desktop) return;
  const previous = await native.invoke('previous_run').catch(() => null);
  if (!previous) return;
  const when = previous.started ? new Date(previous.started * 1000).toLocaleString() : '';
  const error = new Error(t(previous.log ? 'error.previousRunCrash' : 'error.previousRunUnknown', { when }));
  error.stack = previous.log || t('error.previousRunNoLog');
  showError('error.previousRun', error, previous.logPath ?? '');
}

window.addEventListener('error', (event) => showError('error.unexpected', event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}` : ''));
window.addEventListener('unhandledrejection', (event) => showError('error.unexpected', event.reason));

// ───────────────────────── documents

function untitledName() {
  state.untitled += 1;
  return t('tabs.untitled', { n: state.untitled });
}

function addDocument(doc, { activate = true } = {}) {
  if (activate) state.home = false;
  state.docs.push(doc);
  if (activate) activate_(doc.id);
  persistSession();
  return doc;
}

function newDrawing() {
  const name = untitledName();
  const drawing = D.createDrawing({ title: name, language: getLanguage(), author: state.settings.author, gridSize: state.settings.gridSize });
  addDocument(new DrawingDocument(drawing, { name }));
  renderAll();
  return drawing;
}

/** First start: a small machine drawing that shows what the app does. */
function welcomeDrawing() {
  const en = getLanguage() === 'en';
  const drawing = D.createDrawing({ title: en ? 'Getting started' : '시작하기', language: getLanguage(), author: state.settings.author });
  const add = (type, data) => D.addEntity(drawing, type, data);
  add('part', { kind: 'gear', x: 0, y: 0, params: { module: 2, teeth: 24, bore: 12 } });
  add('part', { kind: 'gear', x: 46, y: 0, params: { module: 2, teeth: 22, bore: 10 }, angle: 360 / 44 });
  add('rect', { x: -40, y: -70, width: 130, height: 30, radius: 3 });
  add('circle', { cx: -25, cy: -55, r: 5, centerMark: true });
  add('circle', { cx: 75, cy: -55, r: 5, centerMark: true });
  add('dim', { kind: 'horizontal', x1: -40, y1: -70, x2: 90, y2: -70, ox: 25, oy: -82, size: 3.5, precision: 1, layer: 'dim' });
  add('dim', { kind: 'horizontal', x1: 0, y1: 0, x2: 46, y2: 0, ox: 23, oy: 40, size: 3.5, precision: 1, layer: 'dim' });
  add('text', { x: -40, y: -100, text: en ? 'Right-click for menus · Ctrl + wheel zooms · type coordinates while drawing' : '오른쪽 클릭: 메뉴 · Ctrl + 휠: 확대/축소 · 그리는 중에 좌표를 입력할 수 있습니다', size: 3.5, layer: 'text' });
  const doc = new DrawingDocument(drawing, { name: drawing.title });
  doc.markSaved(null);
  return doc;
}

function activate_(id) {
  if (state.active !== id) {
    if (anim.active) stopAnimation();
    cancelTool();
    state.selection = new Set();
  }
  state.active = id;
}

function activateDoc(id) {
  closeDocViewer();
  if (state.active === id && !state.home) return;
  state.home = false;
  activate_(id);
  renderAll();
  scrollActiveTabIntoView();
}

/** Applies a change to the active drawing as one undo step and redraws. */
function change(labelKey, mutate) {
  const doc = activeDoc();
  if (!doc) return undefined;
  if (anim.active) stopAnimation();
  const before = consoleState.recording ? doc.drawing.entities.map((e) => e.id) : null;
  // PartDesign: new solids join the active body. Sketcher: new 2D geometry joins the sketch being edited.
  const body = state.activeBody && doc.drawing.groups?.some((g) => g.id === state.activeBody && g.body) ? state.activeBody : null;
  const sketch = state.editSketch && doc.drawing.groups?.some((g) => g.id === state.editSketch && g.sketch) ? state.editSketch : null;
  // Assembly_ActivateAssembly: new parts go into the active assembly (a body inside it takes them first).
  const assembly = !body && state.activeAssembly && doc.drawing.groups?.some((g) => g.id === state.activeAssembly && g.assembly) ? state.activeAssembly : null;
  // Draft_AutoGroup: everything new goes into the chosen group.
  const auto = state.autoGroup && doc.drawing.groups?.some((g) => g.id === state.autoGroup) ? state.autoGroup : null;
  const known = body || sketch || auto || assembly ? new Set(doc.drawing.entities.map((e) => e.id)) : null;
  const result = doc.apply(t(labelKey), known ? (d) => {
    const out = mutate(d);
    for (const e of d.entities) {
      if (known.has(e.id) || e.group) continue;
      if (body && e.type === 'solid' && e.kind !== 'datum') e.group = body;
      else if (assembly && e.type === 'solid' && e.kind !== 'datum') e.group = assembly;
      else if (sketch && e.type !== 'solid') e.group = sketch;
      else if (auto) e.group = auto;
    }
    return out;
  } : mutate);
  if (before) recordAdded(before, doc.drawing.entities);
  pruneSelection();
  afterChange();
  return result;
}

function afterChange() {
  // An undocked 3D window (Std_ViewUndock) follows the drawing.
  syncViewer();
  // Fields may use the spreadsheet's aliases and cells (=width*2).
  setExpressionScope();
  scheduleProblems();
  scheduleRender();
  schedule3d();
  renderTabs();
  renderLeft();
  renderRight();
  renderStatus();
  renderToolbarState();
}

function persistSession() {
  try {
    globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify({ files: state.docs.filter((doc) => doc.path).map((doc) => doc.path) }));
  } catch { /* ignore */ }
}

// ───────────────────────── selection

function select(ids, { toggle = false, add = false } = {}) {
  if (toggle) {
    for (const id of ids) (state.selection.has(id) ? state.selection.delete(id) : state.selection.add(id));
  } else if (add) {
    for (const id of ids) state.selection.add(id);
  } else {
    state.selection = new Set(ids);
  }
  if (state.selection.size) state.lightSelected = false;
  // Picked faces, edges and vertices go with their objects.
  if (state.elements?.length && state.elements.some((el) => !state.selection.has(el.id))) { state.elements = state.elements.filter((el) => state.selection.has(el.id)); view3d.instance?.setElementHighlight(state.elements); }
  if (state.settings.tree?.recordSelection !== false) recordSelection();
  // Std_TreeSyncSelection: the tree scrolls to what is selected.
  if (state.settings.tree?.syncSelection !== false && state.selection.size) {
    requestAnimationFrame(() => root.querySelector(`[data-tree-entity="${CSS.escape([...state.selection][0])}"]`)?.scrollIntoView({ block: 'nearest' }));
  }
  scheduleRender();
  schedule3d();
  renderLeft();
  renderRight();
  renderStatus();
  renderToolbarState();
}

function pruneSelection() {
  const drawing = activeDrawing();
  if (!drawing) { state.selection = new Set(); return; }
  const ids = new Set(drawing.entities.map((entity) => entity.id));
  state.selection = new Set([...state.selection].filter((id) => ids.has(id)));
}

// ───────────────────────── commands

const hasDoc = () => Boolean(activeDoc());
const hasSelection = () => state.selection.size > 0;

const toolCommand = (id) => ({ icon: TOOL_ICONS[id], label: `tool.${id}`, key: TOOL_KEYS[id], enabled: () => hasDoc() && (!NEEDS_SELECTION.has(id) || hasSelection()), checked: () => state.toolId === id, run: () => setTool(id) });

const commands = {
  new: { icon: 'newDrawing', label: 'action.new', key: 'Ctrl+N', run: () => newDrawing() },
  open: { icon: 'open', label: 'action.open', key: 'Ctrl+O', run: () => openWithDialog() },
  importDxf: { icon: 'import', label: 'action.importDxf', run: () => openWithDialog({ dxf: true }) },
  exportDxf2000: { icon: 'export', label: 'action.exportDxf2000', enabled: hasDoc, run: () => exportAs('dxf2000') },
  exportHpgl: { icon: 'print', label: 'action.exportHpgl', enabled: hasDoc, run: () => exportAs('plt') },
  exportIges: { icon: 'export', label: 'action.exportIges', enabled: hasDoc, run: () => exportAs('igs') },
  save: { icon: 'save', label: 'action.save', key: 'Ctrl+S', enabled: hasDoc, run: () => saveDoc(activeDoc()) },
  saveAs: { icon: 'saveAs', label: 'action.saveAs', key: 'Ctrl+Shift+S', enabled: hasDoc, run: () => saveDoc(activeDoc(), { saveAs: true }) },
  saveAll: { icon: 'save', label: 'action.saveAll', key: 'Ctrl+Alt+S', enabled: () => state.docs.some((doc) => doc.dirty), run: () => saveAll() },
  recent: { icon: 'recent', label: 'action.recent', key: 'Ctrl+Shift+R', run: () => popups.open('recent', { desktop }) },
  exportMenu: { icon: 'export', label: 'action.exportMenu', enabled: hasDoc, run: (context) => openExportMenu(context?.anchor) },
  exportDxf: { icon: 'export', label: 'action.exportDxf', enabled: hasDoc, run: () => exportAs('dxf') },
  exportSvg: { icon: 'image', label: 'action.exportSvg', enabled: hasDoc, run: () => exportAs('svg') },
  exportPng: { icon: 'image', label: 'action.exportPng', enabled: hasDoc, run: () => exportAs('png') },
  exportStl: { icon: 'printer3d', label: 'action.exportStl', key: 'Ctrl+Shift+P', enabled: hasDoc, run: () => openStlDialog() },
  print: { icon: 'print', label: 'action.print', key: 'Ctrl+P', enabled: hasDoc, run: () => openPrint() },
  closeTab: { icon: 'close', label: 'action.closeTab', key: 'Ctrl+W', enabled: hasDoc, run: () => closeDoc(activeDoc()) },
  closeOthers: { icon: 'close', label: 'action.closeOthers', enabled: () => state.docs.length > 1, run: () => closeOthers(activeDoc()) },
  exit: { icon: 'exit', label: 'action.exit', key: isMac ? 'Ctrl+Q' : 'Alt+F4', run: () => requestExit() },
  undo: { icon: 'undo', label: 'action.undo', key: 'Ctrl+Z', enabled: () => Boolean(activeDoc()?.history.canUndo), run: () => undo() },
  redo: { icon: 'redo', label: 'action.redo', key: 'Ctrl+Y', enabled: () => Boolean(activeDoc()?.history.canRedo), run: () => redo() },
  cut: { icon: 'cut', label: 'action.cut', key: 'Ctrl+X', enabled: hasSelection, run: () => cutSelection() },
  copy: { icon: 'copy', label: 'action.copy', key: 'Ctrl+C', enabled: hasSelection, run: () => copySelection() },
  paste: { icon: 'paste', label: 'action.paste', key: 'Ctrl+V', enabled: hasDoc, run: () => paste() },
  delete: { icon: 'trash', label: 'action.delete', key: 'Delete', enabled: hasSelection, run: () => deleteSelection() },
  duplicate: { icon: 'duplicate', label: 'action.duplicate', key: 'Ctrl+D', enabled: hasSelection, run: () => duplicateSelection() },
  selectAll: { icon: 'selectAll', label: 'action.selectAll', key: 'Ctrl+A', enabled: hasDoc, run: () => select(D.editable(activeDrawing()).map((entity) => entity.id)) },
  clearSelection: { icon: 'close', label: 'action.clearSelection', key: 'Esc', enabled: hasSelection, run: () => select([]) },
  ...Object.fromEntries(CONSTRAINT_TYPES.map((type) => [`constrain:${type}`, { icon: `k${type[0].toUpperCase()}${type.slice(1)}`, label: `constraint.${type}`, tip: `constraintTip.${type}`, enabled: () => Boolean(constraintRefs(type)), run: () => constrainSelection(type) }])),
  addons: { icon: 'part', label: 'action.addons', tip: 'tip.addons', enabled: () => true, run: () => openAddons() },
  fem: { icon: 'fem', label: 'action.fem', tip: 'tip.fem', enabled: hasDoc, run: () => openFem() },
  fem3d: { icon: 'femSolid', label: 'action.fem3d', tip: 'tip.fem3d', enabled: () => selectedSolids().length === 1, run: () => openFem3d() },
  femPlate: { icon: 'femPlate', label: 'action.femPlate', tip: 'tip.femPlate', enabled: hasDoc, run: () => openPlate() },
  cam: { icon: 'cam', label: 'action.cam', tip: 'tip.cam', enabled: hasDoc, run: () => openCam() },
  workPlaneFace: { icon: 'workPlane', label: 'action.workPlaneFace', tip: 'tip.workPlaneFace', enabled: hasDoc, run: () => pickWorkPlaneFace() },
  workPlaneReset: { icon: 'workPlane', label: 'action.workPlaneReset', enabled: () => Boolean(activeDrawing()?.workPlane), run: () => setWorkPlane(null) },
  construction: { icon: 'construction', label: 'action.construction', tip: 'tip.construction', enabled: () => selectedEntities().some((e) => e.type !== 'solid'), checked: () => { const list = selectedEntities(); return list.length > 0 && list.every((e) => e.construction); }, run: () => toggleConstruction() },
  clone: { icon: 'clone', label: 'action.clone', tip: 'tip.clone', enabled: hasSelection, run: () => cloneSelection() },
  unlinkClone: { icon: 'unlink', label: 'action.unlinkClone', tip: 'tip.unlinkClone', enabled: () => selectedEntities().some((e) => e.clone), run: () => unlinkSelection() },
  cloneSource: { icon: 'select', label: 'action.cloneSource', enabled: () => selectedEntities().some((e) => e.clone), run: () => select([...new Set(selectedEntities().filter((e) => e.clone).map((e) => e.clone.of))].filter((id) => D.findEntity(activeDrawing(), id))) },
  explode: { icon: 'explode', label: 'action.explode', key: 'Ctrl+Shift+E', enabled: () => selectedEntities().some(canExplode), run: () => explodeSelection() },
  bringFront: { icon: 'front', label: 'action.bringFront', enabled: hasSelection, run: () => change('op.order', (drawing) => D.reorder(drawing, selectedIds(), true)) },
  sendBack: { icon: 'back', label: 'action.sendBack', enabled: hasSelection, run: () => change('op.order', (drawing) => D.reorder(drawing, selectedIds(), false)) },
  array: { icon: 'array', label: 'action.array', enabled: hasSelection, run: () => openArrayDialog() },
  editPart: { icon: 'part', label: 'action.editPart', enabled: () => selectedEntities().length === 1 && selectedEntities()[0].type === 'part', run: () => openPartDialog({ entity: selectedEntities()[0] }) },
  properties: { icon: 'edit', label: 'action.properties', enabled: hasDoc, run: () => focusProperties() },
  addLayer: { icon: 'layers', label: 'action.addLayer', enabled: hasDoc, run: () => addLayer() },
  zoomOut: { icon: 'zoomOut', label: 'action.zoomOut', key: 'Ctrl+-', enabled: hasDoc, run: () => zoomBy(1 / 1.25) },
  zoomIn: { icon: 'zoomIn', label: 'action.zoomIn', key: 'Ctrl+=', enabled: hasDoc, run: () => zoomBy(1.25) },
  zoom100: { icon: 'zoomReset', label: 'action.zoom100', key: 'Ctrl+0', enabled: hasDoc, run: () => setZoomPercent(100) },
  zoomFit: { icon: 'zoomFit', label: 'action.zoomFit', key: 'Home', enabled: hasDoc, run: () => zoomFit() },
  grid: { icon: 'grid', label: 'action.grid', key: 'F7', checked: () => state.settings.showGrid, run: () => updateSettings({ showGrid: !state.settings.showGrid }) },
  snap: { icon: 'snap', label: 'action.snap', key: 'F3', checked: () => state.settings.snapObject, run: () => updateSettings({ snapObject: !state.settings.snapObject }) },
  snapGrid: { icon: 'grid', label: 'action.snapGrid', key: 'F9', checked: () => state.settings.snapGrid, run: () => updateSettings({ snapGrid: !state.settings.snapGrid }) },
  view3d: { icon: 'cube', label: 'action.view3d', key: 'Ctrl+Shift+3', enabled: hasDoc, checked: () => state.view3d, run: () => toggle3d() },
  rulers: { icon: 'ruler', label: 'action.rulers', key: 'Ctrl+R', checked: () => state.settings.showRulers, run: () => updateSettings({ showRulers: !state.settings.showRulers }) },
  scaleBar: { icon: 'scaleBar', label: 'action.scaleBar', key: 'Ctrl+Shift+B', checked: () => state.settings.showScaleBar, run: () => updateSettings({ showScaleBar: !state.settings.showScaleBar }) },
  ortho: { icon: 'ortho', label: 'action.ortho', key: 'F8', checked: () => state.settings.ortho, run: () => updateSettings({ ortho: !state.settings.ortho }) },
  lineWeights: { icon: 'line', label: 'action.lineWeights', checked: () => state.settings.showLineWeights, run: () => updateSettings({ showLineWeights: !state.settings.showLineWeights }) },
  crosshair: { icon: 'coordinate', label: 'action.crosshair', checked: () => state.settings.crosshair, run: () => updateSettings({ crosshair: !state.settings.crosshair }) },
  theme: { icon: 'palette', label: 'action.themeNext', run: () => updateSettings({ theme: nextThemeId(state.settings.theme) }) },
  themeMenu: { icon: 'chevronDown', label: 'action.themeChoose', run: (context) => openThemePicker(context?.anchor) },
  language: { icon: 'globe', label: 'action.language', key: 'Ctrl+Shift+L', run: () => updateSettings({ language: getLanguage() === 'ko' ? 'en' : 'ko' }) },
  settings: { icon: 'gear', label: 'action.settings', key: 'Ctrl+,', run: () => popups.open('settings', { tab: 'general' }) },
  about: { icon: 'info', label: 'action.about', key: 'F1', run: () => popups.open('about') },
  shortcuts: { icon: 'keyboard', label: 'action.shortcuts', run: () => popups.open('settings', { tab: 'shortcuts' }) },
  leftPanel: { icon: 'panelLeft', label: 'action.leftPanel', key: 'Ctrl+Shift+1', checked: () => state.settings.showLeftPanel, run: () => updateSettings({ showLeftPanel: !state.settings.showLeftPanel }) },
  rightPanel: { icon: 'panelRight', label: 'action.rightPanel', key: 'Ctrl+Shift+2', checked: () => state.settings.showRightPanel, run: () => updateSettings({ showRightPanel: !state.settings.showRightPanel }) },
  statusBar: { icon: 'statusBar', label: 'action.statusBar', checked: () => state.settings.showStatusBar, run: () => updateSettings({ showStatusBar: !state.settings.showStatusBar }) },
  ...Object.fromEntries(['plane', 'sphere', 'cylinder', 'mesh'].map((fit) => [`re:${fit}`, { icon: `re${fit[0].toUpperCase()}${fit.slice(1)}`, label: `re.${fit}`, tip: `reTip.${fit}`, enabled: () => cloudSelection().length >= 9, run: () => reverseEngineer(fit) }])),
  spreadsheet: { icon: 'spreadsheet', label: 'action.spreadsheet', tip: 'tip.spreadsheet', enabled: hasDoc, run: () => openSpreadsheet() },
  console: { icon: 'console', label: 'action.console', tip: 'tip.console', key: 'Ctrl+Shift+J', checked: () => state.settings.showConsole, run: () => updateSettings({ showConsole: !state.settings.showConsole }) },
  problems: { icon: 'warning', label: 'action.problems', key: 'Ctrl+Shift+M', checked: () => state.settings.showProblems, run: () => updateSettings({ showProblems: !state.settings.showProblems }) },
  background: { icon: 'image', label: 'action.background', run: () => chooseBackground() },
  clearBackground: { icon: 'clear', label: 'action.clearBackground', enabled: () => Boolean(state.settings.backgroundImage), run: () => removeBackground() },
  nextTab: { icon: 'chevronRight', label: 'action.nextTab', key: 'Ctrl+Tab', enabled: () => state.docs.length > 1, run: () => cycleTab(1) },
  prevTab: { icon: 'chevronLeft', label: 'action.prevTab', key: 'Ctrl+Shift+Tab', enabled: () => state.docs.length > 1, run: () => cycleTab(-1) },
  renameDrawing: { icon: 'edit', label: 'action.renameDrawing', key: 'F2', enabled: hasDoc, run: () => { select([]); focusProperty('title'); } },
  ...Object.fromEntries(SOLID_KINDS.map((kind) => [`solid:${kind}`, { icon: SOLID_ICONS[kind], label: `solid.${kind}`, enabled: hasDoc, run: () => openSolidDialog({ kind }) }])),
  ...Object.fromEntries(FEATURE_KINDS.map((kind) => [`solid:${kind}`, { icon: SOLID_ICONS[kind], label: `feature.${kind}`, enabled: () => canFeature(kind), run: () => solidFeature(kind) }])),
  ...Object.fromEntries(ARCH_SELECTION_KINDS.map((kind) => [`arch:${kind}`, { icon: SOLID_ICONS[kind], label: `solid.${kind}`, enabled: hasDoc, run: () => archFeature(kind) }])),
  ...Object.fromEntries(ARCH_INSERT_KINDS.map((kind) => [`arch:${kind}`, { icon: SOLID_ICONS[kind], label: `solid.${kind}`, enabled: hasDoc, run: () => openSolidDialog({ kind }) }])),
  ...Object.fromEntries(['window', 'door'].map((type) => [`arch:${type}`, { icon: type === 'window' ? 'archWindow' : 'archDoor', label: `arch.${type}`, enabled: () => Boolean(selectedWall()), run: () => addOpening(type) }])),
  'arch:rebar': { icon: 'archRebar', label: 'arch.rebar', enabled: () => rebarHosts().length > 0 || selectedEntities().some((e) => e.type === 'line' || e.type === 'polyline'), run: () => addRebar() },
  'arch:customWindow': { icon: 'archCustomWindow', label: 'arch.customWindow', enabled: hasDoc, run: () => addCustomWindow() },
  bimManager: { icon: 'archBuilding', label: 'action.bimManager', enabled: hasDoc, run: () => openBimManager() },
  scheduleCsv: { icon: 'archSchedule', label: 'action.scheduleCsv', enabled: () => archObjects().length > 0, run: () => exportScheduleCsv() },
  ...Object.fromEntries(JOINT_TYPES.map((type) => [`joint:${type}`, { icon: `joint${type[0].toUpperCase()}${type.slice(1)}`, label: `joint.${type}`, tip: `jointTip.${type}`, enabled: () => selectedSolids().length === 2, run: () => addJoint(type) }])),
  'assembly:animate': { icon: 'play', label: 'anim.play', tip: 'animTip.play', enabled: () => hasDrives(activeDrawing()?.joints), run: () => toggleAnimation() },
  'robot:add': { icon: 'robot', label: 'robot.add', tip: 'robotTip.add', enabled: hasDoc, run: () => addRobot() },
  'robot:moveTo': { icon: 'robotMove', label: 'robot.moveTo', tip: 'robotTip.moveTo', enabled: () => Boolean(selectedRobot()) && robotTargets().length > 0, run: () => robotMoveTo() },
  'robot:path': { icon: 'robotPath', label: 'robot.path', tip: 'robotTip.path', enabled: () => Boolean(selectedRobot()) && robotTargets().length > 0, run: () => robotTrajectory() },
  panelNest: { icon: 'archPanel', label: 'action.panelNest', tip: 'tip.panelNest', enabled: () => selectedEntities().length > 0, run: () => nestSelection() },
  archSchedule: { icon: 'archSchedule', label: 'action.archSchedule', enabled: () => archObjects().length > 0, run: () => insertSchedule() },
  archMenu: { icon: 'archRoof', label: 'action.archMenu', run: (context) => showMenu(menuItems(MENUS.arch), context?.anchor ?? anchorBelow(root.querySelector('[data-command="archMenu"]') ?? root.querySelector('[data-menu="arch"]')), 'arch', { header: { icon: 'archRoof', title: t('menu.arch') } }) },
  checkGeometry: { icon: 'checkGeometry', label: 'action.checkGeometry', tip: 'tip.checkGeometry', enabled: () => checkTargets().length > 0, run: () => checkGeometry() },
  meshDecimate: { icon: 'meshDecimate', label: 'action.meshDecimate', tip: 'tip.meshDecimate', enabled: () => selectedSolids().length > 0, run: () => decimateSolids(selectedSolids().map((e) => e.id)) },
  meshRepair: { icon: 'meshRepair', label: 'action.meshRepair', tip: 'tip.meshRepair', enabled: () => selectedSolids().length > 0, run: () => repairSolids(selectedSolids().map((e) => e.id)) },
  ...Object.fromEntries(DRESSUP_KINDS.map((kind) => [`dress:${kind}`, { icon: SOLID_ICONS[kind], label: `dress.${kind}`, tip: `dressTip.${kind}`, enabled: () => Boolean(dressBase()), run: () => dressUp(kind) }])),
  ...Object.fromEntries(BOOL_OPS.map((op) => [`bool:${op}`, { icon: BOOL_ICONS[op], label: `bool.${op}`, enabled: () => selectedSolids().length >= 2, run: () => booleanSelection(op) }])),
  solidSection: { icon: 'solidSection', label: 'action.section', enabled: () => selectedSolids(true).length > 0, run: () => sectionSolids() },
  solidProject: { icon: 'solidProject', label: 'action.project', enabled: () => selectedSolids(true).length > 0, run: () => projectSolids() },
  editSolid: { icon: 'solidEdit', label: 'action.editSolid', enabled: () => selectedEntities().length === 1 && selectedEntities()[0].type === 'solid', run: () => openSolidDialog({ entity: selectedEntities()[0] }) },
  import3d: { icon: 'solidImport', label: 'action.import3d', key: 'Ctrl+I', run: () => import3dWithDialog() },
  export3dMenu: { icon: 'solidExport', label: 'action.export3dMenu', enabled: hasDoc, run: (context) => openExport3dMenu(context?.anchor) },
  ...Object.fromEntries(EXPORT_3D.map((format) => [`export3d:${format}`, { icon: format === 'fcstd' ? 'freecad' : 'solidExport', label: `export3d.${format}`, enabled: hasDoc, run: () => export3d(format) }])),
  ...Object.fromEntries(VIEW_STYLE_IDS.map((style) => [`view3dStyle:${style}`, { icon: VIEW_STYLE_ICONS[style], label: `view3dStyle.${style}`, checked: () => (state.settings.view3dStyle ?? 'asis') === style, run: () => setView3dStyle(style) }])),
  view3dStyleMenu: { icon: 'drawStyle', label: 'action.view3dStyle', run: (context) => showMenu(menuItems(VIEW_STYLE_IDS.map((style) => `view3dStyle:${style}`)), context?.anchor ?? anchorBelow(root.querySelector('[data-view3d="styleMenu"]') ?? root.querySelector('[data-menu="view"]')), 'view3dStyle', { header: { icon: 'drawStyle', title: t('action.view3dStyle') } }) },
  extrude2d: { icon: 'solidExtrude', label: 'action.extrude2d', checked: () => state.settings.extrude2d, run: () => updateSettings({ extrude2d: !state.settings.extrude2d }) },
  toolbarRows: { icon: 'toolbarRows', label: 'action.toolbarRows', checked: () => state.settings.toolbarRows === 2, run: () => updateSettings({ toolbarRows: state.settings.toolbarRows === 2 ? 1 : 2 }) },
  solidMenu: { icon: 'solidBox', label: 'action.solidMenu', run: (context) => showMenu(menuItems(MENUS.solid), context?.anchor ?? anchorBelow(root.querySelector('[data-command="solidMenu"]')), 'solid', { header: { icon: 'solidBox', title: t('menu.solid') } }) },
  light: { icon: 'light', label: 'action.light', key: 'Ctrl+Shift+G', checked: () => state.settings.light.on && state.settings.view3dStyle !== 'flat', run: () => { if (state.settings.view3dStyle === 'flat') { setView3dStyle('asis'); setLightOptions({ on: true }); return; } setLightOptions({ on: !state.settings.light.on }); } },
  lightProperties: { icon: 'light', label: 'action.lightProperties', run: () => selectLight() },
  startPage: { icon: 'home', label: 'action.startPage', run: () => showHome(true) },
  tutorial: { icon: 'tutorial', label: 'action.tutorial', run: () => openTutorial() },
  tutorialDoc: { icon: 'book', label: 'action.tutorialDoc', run: () => openTutorialDoc() },
  freecadCoverage: { icon: 'checklist', label: 'action.freecadCoverage', run: () => popups.open('coverage', { tab: 'part' }) },
  ...Object.fromEntries([...DRAW_TOOLS, ...DIM_TOOLS, ...MODIFY_TOOLS, ...VIEW_TOOLS].map((id) => [`tool:${id}`, toolCommand(id)])),
  ...Object.fromEntries(PART_KINDS.map((kind) => [`part:${kind}`, { icon: PARTS[kind].icon, label: `part.${kind}`, enabled: hasDoc, run: () => openPartDialog({ kind }) }])),
  ...Object.fromEntries(Object.keys(PART_CATEGORIES).map((category) => [`partCategory:${category}`, { icon: CATEGORY_ICONS[category], label: `cat.${category}`, enabled: hasDoc, run: () => openPartDialog({ category }) }])),
};
// The macro debugger (Python): run, stop at breakpoints, step into or over, stop.
Object.assign(commands, {
  macroStartDebug: { icon: 'debug', label: 'debug.start', run: () => startDebug() },
  macroStepInto: { icon: 'stepInto', label: 'debug.stepInto', enabled: () => Boolean(consoleState.debug), run: () => debugMove('into') },
  macroStepOver: { icon: 'stepOver', label: 'debug.stepOver', enabled: () => Boolean(consoleState.debug), run: () => debugMove('over') },
  macroStopDebug: { icon: 'stop', label: 'debug.stop', enabled: () => Boolean(consoleState.debug), run: () => stopDebug() },
  toggleBreakpoint: { icon: 'breakpoint', label: 'debug.breakpoint', run: () => toggleBreakpoint() },
});
// FreeCAD's Std commands (src/commands/std.js, std2.js): views, visibility, windows, document tools,
// help; the model tree, links, transforms, materials, customising, overlays, workbenches.
Object.assign(commands, stdCommands(stdApp()), std2Commands(stdApp()), testCommands(stdApp()), partCommands(stdApp()), partDesignCommands(stdApp()), sketcherCommands(stdApp()), draftCommands(stdApp()), meshCommands(stdApp()), sheetCommands(stdApp()), assemblyCommands(stdApp()), openscadCommands(stdApp()), camJobCommands(stdApp()), femxCommands(stdApp()), techDrawCommands(stdApp()), bimCommands(stdApp()));

function commandEnabled(id) {
  const command = commands[id];
  return Boolean(command) && (!command.enabled || command.enabled());
}

function commandTip(id) {
  const command = commands[id];
  let label = t(command.label).replace(/…$/, '');
  if (id === 'undo' && activeDoc()?.history.canUndo) label = t('tip.undoWith', { label: activeDoc().history.undoLabel });
  if (id === 'redo' && activeDoc()?.history.canRedo) label = t('tip.redoWith', { label: activeDoc().history.redoLabel });
  if (command.tip) label = `${label} — ${t(command.tip)}`;
  if (id === 'language') label = t('tip.language');
  if (id === 'theme') label = t('tip.themeNext', { current: themeName(state.settings.theme, getLanguage()), next: themeName(nextThemeId(state.settings.theme), getLanguage()) });
  return command.key ? t('tip.withKey', { label, key: keyLabel(command.key) }) : label;
}

async function run(id, context) {
  const command = commands[id];
  if (!command || !commandEnabled(id)) return;
  // Reading the tutorial document stays up while the language changes (it reloads in that language).
  if (id !== 'tutorialDoc' && id !== 'language') closeDocViewer();
  recordCommand(id);
  try {
    await command.run(context);
  } catch (error) {
    showError('error.unexpected', error, t(command.label));
  }
}

// ───────────────────────── layout

const MENUS = {
  file: ['new', 'open', 'recent', '-', 'save', 'saveAs', 'saveCopy', 'saveAll', 'revert', '-', 'importDxf', 'import3d', 'mergeDocument', group('export', ['exportDxf', 'exportDxf2000', 'exportSvg', 'exportIges', 'exportHpgl', 'exportPng', 'export3dMenu']), group('cam', ['cam', '-', group('camOps', CAMJOB_MENU.ops), group('camJob', CAMJOB_MENU.job), group('camDressups', CAMJOB_MENU.dressups), group('camTools', CAMJOB_MENU.tools)]), '-', 'print', 'printPdf', '-', 'closeTab', 'closeOthers', 'closeAll', '-', 'exit'],
  edit: ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'duplicate', 'clone', 'delete', '-', 'selectAll', 'clearSelection', group('selection', ['selectionBack', 'selectionForward', '-', 'selectVisible', 'toggleSelectability']), '-', 'explode', 'bringFront', 'sendBack', '-', group('visibility', ['hideSelection', 'showSelection', 'toggleVisibility', '-', 'hideAll', 'showAll', 'toggleAll']), group('look', ['appearance', 'randomColor', 'toggleTransparency', '-', 'setMaterial', 'materialEditor', 'inspectMaterial', 'inspectAppearance', 'textureMapping']), group('objects', ['newGroup', 'newPart', 'textDocument', 'varSet', 'expressions', '-', 'recompute', 'skipRecompute', 'toggleFreeze']), group('links', ['linkMake', 'linkMakeGroup', 'linkMakeRelative', 'linkReplace', 'linkUnlink', '-', 'linkImport', 'linkImportAll', '-', 'linkSelectLinked', 'linkSelectLinkedFinal', 'linkSelectAllLinks']), group('placement', ['editObject', 'userEditMode', '-', 'transform', 'transformManip', 'alignTo', 'alignToSelection', '-', 'boxElementSelection', 'clarifySelection', 'toggleNavigation']), '-', 'properties', group('spreadsheet', ['spreadsheet', '-', ...SHEET_MENU])],
  view: ['startPage', '-', 'view3d', 'view3dStyleMenu', 'extrude2d', '-', group('standardViews', ['viewFront', 'viewTop', 'viewRight', 'viewRear', 'viewBottom', 'viewLeft', '-', 'viewIsometric', 'viewDimetric', 'viewTrimetric', 'viewHome', '-', 'viewRotateLeft', 'viewRotateRight']), group('camera', ['cameraOrtho', 'cameraPerspective', '-', 'viewFitSelection', 'viewBoxZoom', '-', 'viewSaveCamera', 'viewRestoreCamera', 'storeWorkingView', 'recallWorkingView', 'freezeViews', 'issueCameraPosition']), group('viewTools', ['axisCross', 'selectionBox', 'clipPlane', 'demoMode', 'sceneInspector', '-', 'stereo:off', 'stereo:anaglyph', 'stereo:rows', 'stereo:columns', 'stereo:sideBySide', '-', 'viewVR']), group('zoom', ['zoomIn', 'zoomOut', 'zoom100', 'zoomFit']), group('show', ['grid', 'rulers', 'scaleBar', 'snap', 'snapGrid', 'ortho', 'lineWeights', 'crosshair']), group('panels', ['leftPanel', 'rightPanel', 'statusBar', 'problems', 'console', 'toolbarRows', '-', 'dockOverlay', 'dockOverlayAll', 'dockOverlayToggle', 'dockOverlay:left', 'dockOverlay:right', 'dockOverlay:top', 'dockOverlay:bottom', 'dockOverlayTransparent', 'dockOverlayTransparentAll', 'dockOverlayMouseTransparent']), group('tree', ['treeCollapse', 'treeExpand', 'treeCollapseDocument', 'treeSelection', 'treeSelectAllInstances', 'treeDrag', '-', 'tree:syncSelection', 'tree:syncView', 'tree:syncPlacement', 'tree:preSelection', 'tree:recordSelection', '-', 'treeSingleDocument', 'treeMultiDocument']), group('windows', ['windows', 'nextTab', 'prevTab', '-', 'newView3d', 'viewUndock', 'viewDock', 'tileWindows', 'cascadeWindows', '-', 'fullscreen', 'focusView']), 'workbench', '-', 'theme', 'themeMenu', 'language', '-', group('background', ['background', 'clearBackground'])],
  draw: [...DRAW_TOOLS.filter((id) => id !== 'select' && id !== 'pan').map((id) => `tool:${id}`), '-', group('dimensions', DIM_TOOLS.map((id) => `tool:${id}`)), group('techDraw', [group('tdViews', TECHDRAW_MENU.views), group('tdCosmetic', TECHDRAW_MENU.cosmetic), group('tdDims', TECHDRAW_MENU.dims), group('tdPage', TECHDRAW_MENU.page)]), '-', group('sketchObject', SKETCHER_MENU.object), group('sketchCurves', SKETCHER_MENU.curves), group('draftDraw', DRAFT_MENU.draw)],
  modify: ['tool:select', 'tool:pan', '-', ...MODIFY_TOOLS.map((id) => `tool:${id}`), '-', 'array', 'clone', 'unlinkClone', 'explode', 'editPart', '-', group('workPlane', ['tool:workPlane', 'workPlaneFace', 'workPlaneReset']), group('constraints', ['construction', '-', ...CONSTRAINT_TYPES.map((type) => `constrain:${type}`)]), group('sketchTools', [group('sketchConstraints', SKETCHER_MENU.constraints), group('sketchSelect', SKETCHER_MENU.select), group('sketchBspline', SKETCHER_MENU.bspline), group('sketchEdit', SKETCHER_MENU.edit), group('sketchShow', SKETCHER_MENU.show)]), group('draftTools', [group('draftModify', DRAFT_MENU.modify), group('draftArrays', DRAFT_MENU.arrays), group('draftOrganize', DRAFT_MENU.organize), group('draftSnaps', DRAFT_MENU.snaps)]), '-', 'addLayer', 'renameDrawing'],
  parts: Object.keys(PART_CATEGORIES).map((category) => `partCategory:${category}`),
  solid: [group('primitives', SOLID_KINDS.map((kind) => `solid:${kind}`)), group('features', FEATURE_KINDS.map((kind) => `solid:${kind}`)), group('body', ['pd:body', 'pd:migrate', 'pd:activeBody', '-', 'pd:moveTip', 'pd:moveFeature', 'pd:moveFeatureInTree']), group('patterns', ['pd:linearPattern', 'pd:polarPattern', 'pd:mirrored', 'pd:multiTransform']), group('subtractive', ['pd:subtractiveHelix', 'pd:subtractiveLoft', 'pd:subtractivePipe']), group('binders', ['pd:newSketch', 'pd:shapeBinder', 'pd:subShapeBinder']), '-', ...BOOL_OPS.map((op) => `bool:${op}`), group('compounds', ['part:compound', 'part:fragments', 'part:slice', 'part:sliceApart', 'part:xor', '-', 'part:joinConnect', 'part:joinEmbed', 'part:joinCutout', '-', 'part:compoundFilter']), group('dressup', DRESSUP_KINDS.map((kind) => `dress:${kind}`)), group('shapeOps', ['part:mirror', 'part:scale', 'part:refine', 'part:reverse', 'part:simpleCopy', 'part:transformedCopy', '-', 'part:shapeFromMesh', 'part:makeSolid', 'part:pointsFromShape', 'part:makeFace', 'part:builder', '-', 'part:elementCopy', 'part:colorPerFace', 'part:projectOnSurface', 'part:importCurveNet', 'part:pickCurveNet', '-', group('openscad', OPENSCAD_MENU)]), '-', group('selectElements', ['selectFilter:face', 'selectFilter:edge', 'selectFilter:vertex', 'selectFilter:off', '-', 'boxSelect3d']), group('datums', ['datum:plane', 'datum:line', 'datum:point', 'datum:csys', '-', 'attachment']), '-', group('analysis', ['checkGeometry', 'part:shapeInfo', 'part:tolerance', 'part:defeaturing', 'meshRepair', 'meshDecimate', '-', group('meshTools', MESH_MENU.mesh), '-', 'fem', 'femPlate', 'fem3d', group('femTools', [group('femConstraints', FEMX_MENU.constraints), group('femPhysics', FEMX_MENU.physics), group('femEquations', FEMX_MENU.equations), group('femMaterials', FEMX_MENU.materials), group('femMesh', FEMX_MENU.mesh), group('femSolve', FEMX_MENU.solve), group('femResults', FEMX_MENU.results)])]), group('reverse', ['re:plane', 're:sphere', 're:cylinder', 're:mesh', '-', group('reverseTools', MESH_MENU.reverse)]), '-', group('assembly', [...JOINT_TYPES.map((type) => `joint:${type}`), '-', 'assembly:animate', '-', group('assemblyTools', ASSEMBLY_MENU.assembly)]), group('robot', ['robot:add', 'robot:moveTo', 'robot:path', '-', ...ASSEMBLY_MENU.robot]), '-', group('sections', ['solidSection', 'solidProject', 'part:sectionCut', 'part:crossSections']), 'editSolid', '-', 'import3d', 'export3dMenu'],
  arch: ARCH_MENU,
  tools: ['unitsCalculator', 'dependencyGraph', 'documentUtility', '-', 'console', 'sendToConsole', 'macroFolder', 'recentMacros', 'addons', group('debugger', ['macroStartDebug', 'macroStepInto', 'macroStepOver', 'macroStopDebug', '-', 'toggleBreakpoint']), '-', 'parameters', 'customize', 'toolbarMenu', 'toggleToolbarLock', '-', 'whatsThis', 'reloadStyleSheet', 'settings', '-', 'restartSafeMode', 'leaveSafeMode'],
  help: ['tutorial', 'tutorialDoc', 'usersGuide', 'devHandbook', 'pythonHelp', 'startPage', '-', 'freecadCoverage', group('selfTests', ['selfTest', 'selfTest:all', 'selfTest:allText', '-', 'testMenuShow']), '-', 'website', 'forum', 'reportBug', '-', 'shortcuts', 'settings', '-', 'libraries', 'about'],
  // FreeCAD's Test workbench menu: shown with Help › Self-tests › Show the Test menu.
  test: TEST_MENU,
};
const MENU_ICONS = { file: 'file', edit: 'edit', view: 'eye', draw: 'line', modify: 'move', parts: 'part', solid: 'solidBox', arch: 'archRoof', tools: 'gear', help: 'info', test: 'checklist' };

/** The standard toolbar (always in the first row). */
const TOOLBAR_MAIN = [
  ['new', 'open', 'save', 'saveAs', 'recent', 'print', 'exportMenu'],
  ['undo', 'redo'],
  ['cut', 'copy', 'paste', 'delete'],
  ['zoom', 'zoomFit'],
  ['grid', 'rulers', 'scaleBar', 'snap', 'ortho'],
];
/** FreeCAD-style Part toolbar: primitives, 2D→3D features, booleans, section/views (second row). */
const TOOLBAR_PART = [
  ['view3d'],
  SOLID_KINDS.map((kind) => `solid:${kind}`),
  FEATURE_KINDS.filter((kind) => !kind.startsWith('surf')).map((kind) => `solid:${kind}`),
  BOOL_OPS.map((op) => `bool:${op}`),
  DRESSUP_KINDS.map((kind) => `dress:${kind}`),
  ['solidSection', 'editSolid', 'checkGeometry'],
];
const TOOLBAR_PANELS = ['leftPanel', 'rightPanel', 'problems', 'toolbarRows'];

/**
 * Toolbar rows. One row: the standard tools with the 3D solids in a dropdown
 * ("3D ▾"), so the window can stay narrow. Two rows (toolbar button): the
 * full Part toolbar gets the second row.
 */
/** The toolbars that can be hidden (Std_ToolBarMenu) and moved (Std_ToggleToolBarLock), in their order. */
const TOOLBAR_IDS = ['main', 'edit', 'clipboard', 'zoom', 'toggles', 'view3d', 'panels', 'custom'];
function toolbarRows(rows = 1) {
  const hidden = new Set(state.settings.hiddenToolbars ?? []);
  const groups = {
    main: TOOLBAR_MAIN[0], edit: TOOLBAR_MAIN[1], clipboard: TOOLBAR_MAIN[2], zoom: TOOLBAR_MAIN[3], toggles: TOOLBAR_MAIN[4],
    view3d: rows === 2 ? ['archMenu'] : ['view3d', 'solidSplit'], panels: TOOLBAR_PANELS,
    custom: (state.settings.customToolbar ?? []).filter((id) => commands[id]),
  };
  const order = [...(state.settings.toolbarOrder ?? []).filter((id) => TOOLBAR_IDS.includes(id)), ...TOOLBAR_IDS.filter((id) => !(state.settings.toolbarOrder ?? []).includes(id))];
  const first = order.filter((id) => !hidden.has(id) && groups[id].length).map((id) => Object.assign([...groups[id]], { toolbarId: id }));
  return rows === 2 ? [first, TOOLBAR_PART] : [first];
}
/** Right end of the toolbar: theme (cycle + dropdown), language, settings, about. */
const TOOLBAR_RIGHT = ['themeSplit', 'language', 'settings', 'about'];

function renderShell() {
  root.innerHTML = `
    <nav id="menubar" role="menubar"></nav>
    <div id="toolbar" role="toolbar"></div>
    <main id="workspace">
      <aside id="left-panel" class="side-panel"></aside>
      <section id="canvas-area" tabindex="-1">
        <div id="tabs"></div>
        <div class="canvas-wrap" id="canvas-wrap">
          <div class="canvas-bg" aria-hidden="true"></div>
          <div class="canvas-image" aria-hidden="true"></div>
          <canvas id="cad-canvas" aria-label="${escapeHtml(t('canvas.label'))}"></canvas>
          <div class="scale-bar" id="scale-bar" hidden>
            <span class="scale-caption"><b class="scale-length"></b><small class="scale-ratio"></small></span>
            <span class="scale-track"><span class="scale-handle start" data-scale-handle="start"></span><span class="scale-handle end" data-scale-handle="end"></span></span>
          </div>
          <div class="view3d" id="view3d" hidden></div>
          <div class="start-page" id="start-page" hidden></div>
          <div class="doc-viewer" id="doc-viewer" hidden></div>
          <div class="drop-overlay" aria-hidden="true"><div>${icon('drop')}<span></span></div></div>
        </div>
        <div class="command-bar">
          <span class="command-prompt" id="command-prompt"></span>
          <label class="command-box" title="${escapeHtml(t('tip.command'))}">${icon('coordinate')}<input id="command-input" type="text" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(t('command.placeholder'))}" aria-label="${escapeHtml(t('tip.command'))}" title="${escapeHtml(t('tip.command'))}" /></label>
          <span class="command-live" id="command-live"></span>
        </div>
        <section id="problems-panel" class="problems-panel" aria-label="${escapeHtml(t('problems.title'))}" hidden></section>
        <section id="console-panel" class="console-panel" aria-label="${escapeHtml(t('console.title'))}" hidden></section>
      </section>
      <aside id="right-panel" class="side-panel"></aside>
    </main>
    <footer id="statusbar" role="status"></footer>
    ${desktop ? `<div class="resize-grip" data-resize-grip title="${escapeHtml(t('tip.resize'))}" aria-label="${escapeHtml(t('tip.resize'))}" role="separator">${icon('grip')}</div>` : ''}`;
}

function renderMenubar() {
  const menubar = root.querySelector('#menubar');
  // The house: back to the start page from anywhere (lit while it is shown).
  const home = `<button class="menubar-home ${state.home ? 'active' : ''}" data-command="startPage" title="${escapeHtml(t('action.startPage'))}" aria-label="${escapeHtml(t('menubar.home'))}" aria-pressed="${state.home}">${icon('home')}<span>${escapeHtml(t('menubar.home'))}</span></button><span class="menubar-sep" aria-hidden="true"></span>`;
  menubar.innerHTML = home + Object.keys(MENUS).filter((name) => name !== 'test' || state.settings.testMenu).map((name) => `
    <button class="menubar-item ${state.openMenu === name ? 'open' : ''}" data-menu="${name}" role="menuitem" aria-haspopup="true" title="${escapeHtml(t(`menu.${name}`))}">${icon(MENU_ICONS[name])}<span>${escapeHtml(t(`menu.${name}`))}</span></button>`).join('');
}

function renderToolbar() {
  const toolbar = root.querySelector('#toolbar');
  const plain = (id) => {
    const command = commands[id];
    const glyph = id === 'language' ? switchFlag(getLanguage()) : icon(command.icon);
    return `<button class="tool-button" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(command.label))}">${glyph}</button>`;
  };
  const button = (id) => {
    if (id === 'zoom') {
      return `<span class="stepper toolbar-zoom" title="${escapeHtml(t('tip.zoomValue'))}">
        <button class="tool-button stepper-button-tool" data-command="zoomOut" title="${escapeHtml(commandTip('zoomOut'))}" aria-label="${escapeHtml(t('action.zoomOut'))}">${icon('minus')}</button>
        <input class="stepper-value" id="zoom-value" type="text" inputmode="decimal" value="100%" title="${escapeHtml(t('tip.zoomValue'))}" aria-label="${escapeHtml(t('tip.zoomValue'))}" />
        <button class="tool-button stepper-button-tool" data-command="zoomIn" title="${escapeHtml(commandTip('zoomIn'))}" aria-label="${escapeHtml(t('action.zoomIn'))}">${icon('plus')}</button>
      </span>`;
    }
    if (id === 'solidSplit') {
      return `<span class="split-button">${plain('solid:box')}<button class="tool-button split-arrow" data-command="solidMenu" title="${escapeHtml(commandTip('solidMenu'))}" aria-label="${escapeHtml(t('action.solidMenu'))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
    }
    if (id === 'themeSplit') {
      return `<span class="split-button">${plain('theme')}<button class="tool-button split-arrow" data-command="themeMenu" title="${escapeHtml(commandTip('themeMenu'))}" aria-label="${escapeHtml(t('action.themeChoose'))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
    }
    return plain(id);
  };
  toolbar.innerHTML = `<div class="toolbar-inner">
    <div class="toolbar-left rows-${state.settings.toolbarRows} ${state.settings.toolbarLocked === false ? 'unlocked' : ''}">${toolbarRows(state.settings.toolbarRows).map((row) => `<div class="toolbar-row">${row.map((group) => `<div class="tool-group" ${group.toolbarId ? `data-toolbar-id="${group.toolbarId}" ${state.settings.toolbarLocked === false ? 'draggable="true"' : ''}` : ''}>${group.map(button).join('')}</div>`).join('<span class="tool-sep" aria-hidden="true"></span>')}</div>`).join('')}</div>
    <span class="grow"></span>
    <div class="toolbar-right tool-group">${TOOLBAR_RIGHT.map(button).join('')}</div>
  </div>`;
  renderToolbarState();
  updateMinimumWidth();
}

function renderToolbarState() {
  for (const element of root.querySelectorAll('#toolbar [data-command]')) {
    const id = element.dataset.command;
    element.disabled = !commandEnabled(id);
    element.title = commandTip(id);
    const checked = commands[id].checked?.();
    element.classList.toggle('active', Boolean(checked));
    if (checked !== undefined) element.setAttribute('aria-pressed', String(Boolean(checked)));
  }
  const zoom = root.querySelector('#zoom-value');
  const vp = activeDoc()?.vp;
  if (zoom && document.activeElement !== zoom) zoom.value = vp ? `${formatNumber(vp.percent, vp.percent < 10 ? 1 : 0)}%` : '100%';
}

/** The window can never be so narrow that toolbar buttons are hidden. */
function updateMinimumWidth() {
  const left = root.querySelector('.toolbar-left');
  const right = root.querySelector('.toolbar-right');
  if (!left || !right) return;
  requestAnimationFrame(() => {
    const toolbar = root.querySelector('#toolbar');
    const style = getComputedStyle(toolbar);
    const width = Math.ceil(left.scrollWidth + right.scrollWidth + 24 + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 2);
    if (Math.abs(width - state.minWidth) < 1) return;
    state.minWidth = width;
    document.documentElement.style.setProperty('--min-width', `${width}px`);
    native.setMinimumSize(width, 600).catch(() => {});
  });
}

// ───────────────────────── tabs

function renderTabs() {
  const tabs = root.querySelector('#tabs');
  const scroll = tabs.querySelector('.tab-strip')?.scrollLeft ?? 0;
  tabs.innerHTML = `
    <div class="tab-strip"><div class="tab-list" role="tablist">
      <div class="tab tab-home ${state.home ? 'active' : ''}" role="tab" aria-selected="${state.home}" data-tab-home title="${escapeHtml(t('action.startPage'))}">${icon('home')}<span class="tab-name">${escapeHtml(t('tabs.home'))}</span></div>
      ${state.docs.map((doc) => `
        <div class="tab ${doc.id === state.active && !state.home ? 'active' : ''} ${doc.dirty ? 'dirty' : ''}" role="tab" aria-selected="${doc.id === state.active && !state.home}" data-doc="${doc.id}" title="${escapeHtml(doc.path ?? docName(doc))}">
          ${icon(doc.format !== 'mcad' ? 'import' : 'drawing')}<span class="tab-name">${escapeHtml(docName(doc))}</span>
          <span class="tab-dirty" title="${escapeHtml(t('status.modified'))}">●</span>
          <button class="tab-close" data-close-doc="${doc.id}" title="${escapeHtml(t('tabs.close'))}" aria-label="${escapeHtml(t('tabs.close'))}">${icon('close')}</button>
        </div>`).join('')}
    </div></div>
    <button class="tab-add" data-command="new" title="${escapeHtml(t('tabs.new'))}" aria-label="${escapeHtml(t('tabs.new'))}">${icon('plus')}</button>
    <div class="tab-nav">
      <button class="tab-scroll" data-tab-scroll="-1" title="${escapeHtml(t('tabs.left'))}" aria-label="${escapeHtml(t('tabs.left'))}">${icon('chevronLeft')}</button>
      <button class="tab-scroll" data-tab-scroll="1" title="${escapeHtml(t('tabs.right'))}" aria-label="${escapeHtml(t('tabs.right'))}">${icon('chevronRight')}</button>
    </div>`;
  const strip = tabs.querySelector('.tab-strip');
  strip.scrollLeft = scroll;
  updateTabNav();
}

/** "<" ">" appear at the right end only when the tabs are wider than the strip. */
function updateTabNav() {
  const tabs = root.querySelector('#tabs');
  const strip = tabs?.querySelector('.tab-strip');
  if (!strip) return;
  const overflow = strip.scrollWidth > strip.clientWidth + 1;
  tabs.classList.toggle('overflow', overflow);
  const [left, right] = tabs.querySelectorAll('.tab-scroll');
  left.disabled = strip.scrollLeft <= 0;
  right.disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
}

function scrollTabs(direction) {
  const strip = root.querySelector('.tab-strip');
  strip.scrollBy({ left: direction * Math.max(160, strip.clientWidth * 0.6), behavior: 'instant' });
  updateTabNav();
}

function scrollActiveTabIntoView() {
  const strip = root.querySelector('.tab-strip');
  const tab = strip?.querySelector('.tab.active');
  if (!tab) return;
  const left = tab.offsetLeft;
  const right = left + tab.offsetWidth;
  if (left < strip.scrollLeft) strip.scrollLeft = left;
  else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
  updateTabNav();
}

function cycleTab(direction) {
  const index = state.docs.findIndex((doc) => doc.id === state.active);
  const next = state.docs[(index + direction + state.docs.length) % state.docs.length];
  if (next) activateDoc(next.id);
}

// ───────────────────────── left panel (tools, parts, layers)

const tile = (id, glyph, label, tip, attributes = '') => `<button class="tool-tile ${state.toolId === id ? 'active' : ''}" ${attributes} title="${escapeHtml(tip)}" aria-label="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span></button>`;

function toolTile(id) {
  return tile(id, TOOL_ICONS[id], t(`tool.${id}`), commandTip(`tool:${id}`), `data-tool="${id}" ${commandEnabled(`tool:${id}`) ? '' : 'disabled'}`);
}

function toolOptionsHtml() {
  const id = state.toolId;
  const o = state.toolOptions;
  const rows = [];
  if (id === 'polygon') rows.push(`<label class="field-row" title="${escapeHtml(t('option.sides'))}"><span>${icon('polygon')}${t('option.sides')}</span><input class="num" data-tool-option="sides" value="${o.sides}" title="${escapeHtml(t('option.sides'))}" /></label>`);
  if (id === 'offset') rows.push(`<label class="field-row" title="${escapeHtml(t('option.offset'))}"><span>${icon('offset')}${t('option.offset')}</span><input class="num" data-tool-option="offset" data-length="1" value="${lengthText(o.offset)}" title="${escapeHtml(lengthTip(t('option.offset')))}" /><small>${unitLabel()}</small></label>`);
  if (id === 'hatch') {
    rows.push(`<label class="field-row" title="${escapeHtml(t('option.hatchPattern'))}"><span>${icon('hatch')}${t('option.hatchPattern')}</span><select data-tool-option="hatchPattern" title="${escapeHtml(t('option.hatchPattern'))}">${HATCH_PATTERN_NAMES.map((name) => `<option value="${name}" ${o.hatchPattern === name ? 'selected' : ''}>${escapeHtml(t(`hatch.${name}`))}</option>`).join('')}</select></label>`);
    rows.push(`<label class="field-row" title="${escapeHtml(t('option.hatchScale'))}"><span>${icon('scale')}${t('option.hatchScale')}</span><input class="num" data-tool-option="hatchScale" value="${o.hatchScale}" title="${escapeHtml(t('option.hatchScale'))}" /></label>`);
    rows.push(`<label class="field-row" title="${escapeHtml(t('option.hatchAngle'))}"><span>${icon('rotate')}${t('option.hatchAngle')}</span><input class="num" data-tool-option="hatchAngle" value="${o.hatchAngle}" title="${escapeHtml(t('option.hatchAngle'))}" /></label>`);
  }
  if (id === 'fillet' || id === 'chamfer') rows.push(`<label class="field-row" title="${escapeHtml(t(`option.${id}`))}"><span>${icon(id === 'fillet' ? 'fillet2d' : 'chamfer2d')}${t(`option.${id}`)}</span><input class="num" data-tool-option="${id}" data-length="1" value="${lengthText(o[id] ?? (id === 'fillet' ? 10 : 5))}" title="${escapeHtml(lengthTip(t(`option.${id}`)))}" /><small>${unitLabel()}</small></label>`);
  if (id === 'mirror') rows.push(`<label class="check-row" title="${escapeHtml(t('option.mirrorKeep'))}"><input type="checkbox" data-tool-option="mirrorKeep" ${o.mirrorKeep ? 'checked' : ''} /><span>${t('option.mirrorKeep')}</span></label>`);
  if (!rows.length) return '';
  return `<div class="tool-options">${rows.join('')}</div>`;
}

function layerRowHtml(drawing, layer) {
  const active = drawing.activeLayer === layer.id;
  const count = drawing.entities.filter((entity) => entity.layer === layer.id).length;
  return `<li class="layer-row ${active ? 'active' : ''}" data-layer="${escapeHtml(layer.id)}" title="${escapeHtml(t('layer.rowTip', { name: layer.name }))}">
    <button class="icon-button" data-layer-visible="${escapeHtml(layer.id)}" title="${escapeHtml(t(layer.visible ? 'layer.hide' : 'layer.show'))}" aria-label="${escapeHtml(t(layer.visible ? 'layer.hide' : 'layer.show'))}">${icon(layer.visible ? 'eye' : 'eyeOff')}</button>
    <button class="icon-button" data-layer-lock="${escapeHtml(layer.id)}" title="${escapeHtml(t(layer.locked ? 'layer.unlock' : 'layer.lock'))}" aria-label="${escapeHtml(t(layer.locked ? 'layer.unlock' : 'layer.lock'))}">${icon(layer.locked ? 'lock' : 'unlock')}</button>
    <label class="layer-color" title="${escapeHtml(t('layer.color'))}"><i style="background:${layer.color === D.AUTO ? 'var(--text)' : layer.color}"></i><input type="color" data-layer-color="${escapeHtml(layer.id)}" value="${layer.color === D.AUTO ? '#000000' : layer.color}" aria-label="${escapeHtml(t('layer.color'))}" /></label>
    <button class="layer-name" data-layer-activate="${escapeHtml(layer.id)}" title="${escapeHtml(t('layer.activate', { name: layer.name }))}">${active ? icon('check') : ''}<span>${escapeHtml(layer.name)}</span><small>${count}</small></button>
    <button class="icon-button" data-layer-remove="${escapeHtml(layer.id)}" title="${escapeHtml(t('layer.remove'))}" aria-label="${escapeHtml(t('layer.remove'))}" ${drawing.layers.length <= 1 ? 'disabled' : ''}>${icon('trash')}</button>
  </li>`;
}

function renderLeft() {
  const panel = root.querySelector('#left-panel');
  root.querySelector('#workspace').classList.toggle('no-left', !state.settings.showLeftPanel);
  const drawing = activeDrawing();
  if (!state.settings.showLeftPanel) {
    const rail = (glyph, label, attributes, tip = label) => `<button class="rail-button" ${attributes} title="${escapeHtml(tip)}" aria-label="${escapeHtml(label)}">${icon(glyph)}<span class="rail-label">${escapeHtml(label)}</span></button>`;
    panel.innerHTML = `<div class="panel-rail">
      ${rail('chevronRight', t('rail.expand'), 'data-panel-toggle="left"', t('panel.expandLeft'))}
      <div class="rail-title" title="${escapeHtml(t('panel.leftTitle'))}">${icon('panelLeft')}<span>${escapeHtml(t('panel.leftShort'))}</span></div>
      ${['select', 'line', 'polyline', 'rect', 'circle', 'arc', 'text', 'dimLinear', 'move'].map((id) => rail(TOOL_ICONS[id], t(`tool.${id}`), `class="rail-button ${state.toolId === id ? 'active' : ''}" data-tool="${id}" ${commandEnabled(`tool:${id}`) ? '' : 'disabled'}`, commandTip(`tool:${id}`))).join('')}
      <span class="rail-sep"></span>
      ${rail('part', t('panel.parts'), 'data-panel-section="left:parts"')}
      ${rail('layers', t('panel.layers'), 'data-panel-section="left:layers"')}
    </div>`;
    return;
  }
  panel.innerHTML = `
    <div class="panel-header">${icon('panelLeft')}<span>${t('panel.leftTitle')}</span>
      <button class="icon-button" data-sections="expand" title="${escapeHtml(t('panel.expandAll'))}" aria-label="${escapeHtml(t('panel.expandAll'))}">${icon('expandAll')}</button>
      <button class="icon-button" data-sections="collapse" title="${escapeHtml(t('panel.collapseAll'))}" aria-label="${escapeHtml(t('panel.collapseAll'))}">${icon('collapseAll')}</button>
      <button class="icon-button" data-panel-toggle="left" title="${escapeHtml(t('panel.collapseLeft'))}" aria-label="${escapeHtml(t('panel.collapseLeft'))}">${icon('chevronLeft')}</button></div>
    <div class="panel-scroll">
      ${LEFT_SECTIONS.filter((section) => (section.id !== 'building' || drawing?.bim) && workbenchShows(section.id)).map((section) => leftSection(section, drawing)).join('')}
    </div>`;
}

/** The left panel's sections, by kind of work. Each folds and unfolds; the state is remembered. */
const LEFT_SECTIONS = [
  { id: 'model', glyph: 'tree', title: 'std.panelModel' },
  { id: 'draw', glyph: 'line', title: 'panel.draw' },
  { id: 'dims', glyph: 'dimension', title: 'panel.dimensions' },
  { id: 'modify', glyph: 'move', title: 'panel.modify' },
  { id: 'sketch', glyph: 'kCoincident', title: 'panel.sketch' },
  { id: 'solids', glyph: 'solidBox', title: 'panel.solidShapes' },
  { id: 'solidOps', glyph: 'solidCut', title: 'panel.solidOps' },
  { id: 'arch', glyph: 'archRoof', title: 'panel.arch' },
  { id: 'building', glyph: 'archBuilding', title: 'panel.building' },
  { id: 'parts', glyph: 'part', title: 'panel.parts' },
  { id: 'layers', glyph: 'layers', title: 'panel.layers' },
];

const commandTiles = (ids) => ids.map((id) => tile(id, commands[id].icon, t(commands[id].label), commandTip(id), `data-command="${id}" ${commandEnabled(id) ? '' : 'disabled'}`)).join('');

function leftSectionBody(id, drawing) {
  switch (id) {
    case 'draw': return `<div class="tool-grid">${DRAW_TOOLS.map(toolTile).join('')}</div>`;
    case 'dims': return `<div class="tool-grid">${DIM_TOOLS.map(toolTile).join('')}</div>`;
    case 'modify': return `<div class="tool-grid">${MODIFY_TOOLS.map(toolTile).join('')}${commandTiles(['array', 'clone', 'explode'])}</div>${toolOptionsHtml()}`;
    case 'sketch': return `<div class="tool-grid">${commandTiles(['construction', ...CONSTRAINT_TYPES.map((type) => `constrain:${type}`)])}</div>${constraintStatusHtml()}<p class="panel-hint">${t('constraint.hint')}</p>`;
    case 'solids': return `<div class="tool-grid solids-grid">${commandTiles(SOLID_KINDS.map((kind) => `solid:${kind}`))}</div>`;
    case 'solidOps': return `<div class="tool-grid solids-grid">${commandTiles([...FEATURE_KINDS.map((kind) => `solid:${kind}`), ...BOOL_OPS.map((op) => `bool:${op}`), ...DRESSUP_KINDS.map((kind) => `dress:${kind}`), 'checkGeometry', 'meshRepair', 'meshDecimate', 'fem', 'femPlate', 'fem3d', 'solidSection', 'solidProject', 'editSolid', 'import3d'])}</div><p class="panel-hint">${t('solid.panelHint')}</p>`;
    case 'arch': return `<div class="tool-grid solids-grid">${commandTiles(menuIds(ARCH_MENU).filter((id) => id !== '-' && !id.startsWith('bim:') && !['editSolid', 'solidSection', 'solidProject', 'bimManager'].includes(id)))}</div>`;
    case 'building': return buildingTreeHtml(drawing);
    case 'model': return modelTreeHtml(treeApi());
    case 'parts': return `<div class="part-categories" role="tablist">${Object.keys(PART_CATEGORIES).map((category) => `<button class="icon-button ${state.partCategory === category ? 'active' : ''}" role="tab" aria-selected="${state.partCategory === category}" data-part-category="${category}" title="${escapeHtml(t(`cat.${category}`))}" aria-label="${escapeHtml(t(`cat.${category}`))}">${icon(CATEGORY_ICONS[category])}</button>`).join('')}<span class="part-category-name">${escapeHtml(t(`cat.${state.partCategory}`))}</span></div>
        <div class="tool-grid parts-grid">${PART_CATEGORIES[state.partCategory].map((kind) => tile(`part:${kind}`, PARTS[kind].icon, t(`part.${kind}`), t('part.tileTip', { name: t(`part.${kind}`) }), `data-part="${kind}" ${drawing ? '' : 'disabled'}`)).join('')}</div>
        <p class="panel-hint">${t('part.hint')}</p>`;
    case 'layers': return `<ul class="layer-list">${drawing ? drawing.layers.map((layer) => layerRowHtml(drawing, layer)).join('') : ''}</ul>`;
    default: return '';
  }
}

function leftSection({ id, glyph, title }, drawing) {
  const collapsed = state.settings.collapsedSections.includes(id);
  const extra = id === 'solids'
    ? `<button class="icon-button" data-command="freecadCoverage" title="${escapeHtml(t('action.freecadCoverage'))}" aria-label="${escapeHtml(t('action.freecadCoverage'))}">${icon('freecad')}</button>`
    : id === 'layers' ? `<button class="icon-button" data-command="addLayer" title="${escapeHtml(t('action.addLayer'))}" aria-label="${escapeHtml(t('action.addLayer'))}" ${drawing ? '' : 'disabled'}>${icon('plus')}</button>` : '';
  const label = t(collapsed ? 'panel.expandSection' : 'panel.collapseSection', { name: t(title) });
  return `<section class="panel-section ${collapsed ? 'collapsed' : ''}" data-section="${id}">
      <h3><button class="section-toggle" data-section-toggle="${id}" aria-expanded="${!collapsed}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${icon(collapsed ? 'chevronRight' : 'chevronDown', 'icon chevron')}${icon(glyph)}<span>${escapeHtml(t(title))}</span></button>${extra}</h3>
      ${collapsed ? '' : `<div class="section-body">${leftSectionBody(id, drawing)}</div>`}
    </section>`;
}

/** Folds or unfolds one section (or all of them). */
function toggleSection(id, open = null) {
  const now = new Set(state.settings.collapsedSections);
  const ids = id === '*' ? LEFT_SECTIONS.map((section) => section.id) : [id];
  for (const one of ids) {
    const shouldOpen = open ?? now.has(one);
    if (shouldOpen) now.delete(one); else now.add(one);
  }
  updateSettings({ collapsedSections: LEFT_SECTIONS.map((section) => section.id).filter((one) => now.has(one)) });
}

// ───────────────────────── tools

const LAYER_FOR = { center: 'center', dim: 'dim', text: 'text', hidden: 'hidden' };

function toolApi() {
  return {
    drawing: () => activeDrawing(),
    settings: () => state.settings,
    options: state.toolOptions,
    t,
    layerFor: (kind) => {
      const drawing = activeDrawing();
      // The standard layer for centre lines / dimensions / texts when the drawing has it, else the active layer.
      const id = LAYER_FOR[kind];
      return drawing && id && D.findLayer(drawing, id) && D.findLayer(drawing, id).visible && !D.findLayer(drawing, id).locked ? id : drawing?.activeLayer ?? '0';
    },
    add: (type, data, op) => change(op, (drawing) => D.addEntity(drawing, type, data)),
    change: (op, mutate) => change(op, mutate),
    selection: () => selectedIds(),
    select: (ids) => select(ids),
    hit: (p, filter) => hitEntity(p, filter),
    notify: (kind, key, params) => notify(kind, t(key, params)),
    measured: (info) => {
      state.measured = info;
      notify('info', t('notice.measured', { distance: fmt(info.distance, 3), dx: fmt(info.dx, 3), dy: fmt(info.dy, 3), angle: fmt(info.angle, 2) }));
    },
    setOption: (key, value) => { state.toolOptions[key] = value; renderLeft(); renderCommandBar(); },
    focusProperty: (field) => setTimeout(() => focusProperty(field), 30),
    setWorkPlane: (origin, toward) => setWorkPlane(origin, toward),
    regionAt: (p) => regionAt(p),
    done: () => setTool('select'),
  };
}

/** The closed area around a point (outer outline and the holes in it), from the visible outlines. */
function regionAt(p) {
  const drawing = activeDrawing();
  if (!drawing) return null;
  const pool = drawing.entities.filter((entity) => D.isVisible(drawing, entity) && !['hatch', 'solid', 'text', 'dim', 'leader', 'point'].includes(entity.type));
  const shapes = buildShapes(collectLoops(pool, drawing).loops);
  const inside = (q, loop) => {
    let c = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const a = loop[i];
      const b = loop[j];
      if ((a.y > q.y) !== (b.y > q.y) && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  const hits = shapes.filter((shape) => inside(p, shape.outer) && !shape.holes.some((hole) => inside(p, hole)));
  if (!hits.length) return null;
  const best = hits.sort((a, b) => a.area - b.area)[0];
  return [best.outer, ...best.holes];
}

function setTool(id, extra = {}) {
  if (!activeDoc() && id !== 'select') return;
  if (NEEDS_SELECTION.has(id) && !hasSelection()) {
    notify('info', t('notice.selectFirst'));
    return;
  }
  state.tool?.cancel();
  state.toolId = id;
  state.tool = id === 'select' || id === 'pan' ? null : createTool(id, toolApi(), extra);
  state.live = null;
  const canvas = root.querySelector('#cad-canvas');
  canvas.dataset.activeTool = id;
  renderLeft();
  renderToolbarState();
  renderCommandBar();
  renderStatus();
  scheduleRender();
}

function cancelTool() {
  if (!state.tool && state.toolId === 'select') return;
  state.tool?.cancel();
  state.tool = null;
  state.toolId = 'select';
  const canvas = root.querySelector('#cad-canvas');
  if (canvas) canvas.dataset.activeTool = 'select';
}

function renderCommandBar() {
  const prompt = root.querySelector('#command-prompt');
  const live = root.querySelector('#command-live');
  if (!prompt) return;
  const tool = state.tool;
  const key = state.view3d ? 'prompt.view3d.0' : tool ? tool.prompt() : state.toolId === 'pan' ? 'prompt.pan.0' : 'prompt.select.0';
  prompt.innerHTML = `${icon(TOOL_ICONS[state.toolId] ?? 'select')}<b>${escapeHtml(t(state.toolId === 'place' ? 'tool.place' : `tool.${state.toolId}`))}</b><span>${escapeHtml(t(key, { offset: state.toolOptions.offset, sides: state.toolOptions.sides }))}</span>`;
  live.textContent = state.live ? readout(state.live, Math.max(2, state.settings.dimPrecision)) : '';
}


// ───────────────────────── 3D view

const view3d = { instance: null, loading: null, frame: 0, info: null };

function colors3d() {
  const theme = resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme);
  const c = theme.colors;
  return {
    background: c.canvas, ink: c.text, solid: theme.dark ? '#a9bdd2' : '#8fa7c2', edge: theme.dark ? '#0b0f16' : '#24324a',
    grid: mix(c.canvas, c.text, 0.12), gridMajor: mix(c.canvas, c.text, 0.25), axisText: c.text, selection: c.accent,
  };
}

function view3dBar() {
  const b = (action, glyph, label, extra = '') => `<button class="tool-button" data-view3d="${action}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" ${extra}>${icon(glyph)}</button>`;
  const v = view3d.instance;
  const on = (key) => (v?.options[key] ? 'active' : '');
  const light = v?.light ?? { on: true, azimuth: 135, elevation: 55 };
  return `<div class="view3d-bar" role="toolbar">
    ${['iso', 'top', 'front', 'right'].map((preset) => `<button class="small-button ${v?.preset === preset ? 'active' : ''}" data-view3d="view:${preset}" title="${escapeHtml(t(`view3d.${preset}`))}">${icon('cube')}<span>${escapeHtml(t(`view3d.${preset}`))}</span></button>`).join('')}
    ${b('fit', 'zoomFit', t('action.zoomFit'))}
    <span class="tool-sep"></span>
    <label class="view3d-thickness" title="${escapeHtml(t('view3d.thicknessTip'))}">${icon('measure')}<span>${escapeHtml(t('view3d.thickness'))}</span><input class="num" id="view3d-thickness" value="${lengthText(state.settings.extrudeHeight)}" title="${escapeHtml(lengthTip(t('view3d.thicknessTip')))}" /><small>${unitLabel()}</small></label>
    <span class="tool-sep"></span>
    <button class="tool-button ${state.settings.extrude2d ? 'active' : ''}" data-view3d="extrude2d" title="${escapeHtml(t('action.extrude2d'))}" aria-pressed="${state.settings.extrude2d}">${icon('solidExtrude')}</button>
    <button class="small-button view3d-style" data-view3d="styleMenu" title="${escapeHtml(`${t('action.view3dStyle')}: ${t(`view3dStyle.${state.settings.view3dStyle ?? 'asis'}`)}`)}" aria-haspopup="menu">${icon(VIEW_STYLE_ICONS[state.settings.view3dStyle ?? 'asis'])}${icon('chevronDown')}</button>
    <span class="segmented view3d-handle" role="group">${['move', 'rotate', 'off'].map((mode) => `<button class="segment ${(v ? v.options.handle ?? 'off' : 'move') === mode ? 'active' : ''}" data-view3d="handle:${mode}" title="${escapeHtml(t(`view3d.handle.${mode}`))}" aria-label="${escapeHtml(t(`view3d.handle.${mode}`))}">${icon(mode === 'move' ? 'move' : mode === 'rotate' ? 'rotate' : 'select')}</button>`).join('')}</span>
    <button class="tool-button ${on('axes')}" data-view3d="axes" title="${escapeHtml(t('view3d.axes'))}" aria-pressed="${Boolean(v?.options.axes)}">${icon('axes')}</button>
    ${(() => { const lit = light.on && (state.settings.view3dStyle ?? 'asis') !== 'flat'; return `<button class="tool-button ${lit ? 'active' : ''}" data-view3d="light" title="${escapeHtml(t(lit ? 'view3d.lightOff' : 'view3d.lightOn'))}" aria-pressed="${lit}">${icon(lit ? 'light' : 'lightOff')}</button>`; })()}
    <button class="tool-button ${on('lightMode')}" data-view3d="lightMode" title="${escapeHtml(t('view3d.lightMode'))}" aria-pressed="${Boolean(v?.options.lightMode)}">${icon('move')}</button>
    <span class="grow"></span>
    <button class="small-button" data-view3d="close" title="${escapeHtml(t('view3d.close'))}">${icon('drawing')}<span>${escapeHtml(t('view3d.close'))}</span></button>
  </div>
  <div class="view3d-status">
    <span class="view3d-light" id="view3d-light" title="${escapeHtml(t('view3d.lightTip'))}">${icon(light.on ? 'light' : 'lightOff')}<span>${escapeHtml(t('view3d.lightPosition', { azimuth: Math.round(light.azimuth), elevation: Math.round(light.elevation) }))}</span></span>
    <span class="view3d-info" id="view3d-info">${icon('part')}<span>${view3d.info ? escapeHtml(t('view3d.info', view3d.info)) : ''}</span></span>
  </div>`;
}

function renderView3dBar() {
  const container = root.querySelector('#view3d');
  if (!container || container.hidden) return;
  container.querySelectorAll('.view3d-bar, .view3d-status, .anim-bar').forEach((element) => element.remove());
  container.insertAdjacentHTML('beforeend', view3dBar() + animationBar());
}

async function toggle3d(on = !state.view3d) {
  if (!on && anim.active) stopAnimation();
  state.view3d = on;
  const container = root.querySelector('#view3d');
  const canvas = root.querySelector('#cad-canvas');
  container.hidden = !on;
  canvas.hidden = on;
  updateScaleBar();
  if (on) {
    setTool('select');
    if (!view3d.instance) {
      view3d.loading ??= import('./view/view3d.js');
      const { View3D } = await view3d.loading;
      let wasOn = state.settings.light.on;
      view3d.instance = new View3D(container, {
        onLightChange: (light) => {
          rememberLight(light);
          // Switched on/off (e.g. by double-clicking the sun): the buttons follow.
          if (light.on !== wasOn) { wasOn = light.on; renderView3dBar(); renderToolbarState(); return; }
          const text = root.querySelector('#view3d-light span');
          if (text) text.textContent = t('view3d.lightPosition', { azimuth: Math.round(light.azimuth), elevation: Math.round(light.elevation) });
        },
        onLightSelect: () => selectLight(),
        // The 3D move / rotate handle: one undoable change when the drag ends.
        onMove: (id, { dx, dy, dz, drz }) => {
          const entity = D.findEntity(activeDrawing(), id);
          if (!entity) return;
          change('op.move3d', (d) => D.updateEntity(d, id, { x: (entity.x ?? 0) + dx, y: (entity.y ?? 0) + dy, z: (entity.z ?? 0) + dz, rz: (entity.rz ?? 0) + drz }));
        },
        // Clicking a solid in 3D selects it (Shift/Ctrl adds), so its properties show on the right.
        onPick: (id, event, hit) => {
          state.lightSelected = false;
          if (hit) state.lastPick = { point: hit.point, normal: hit.normal, id };
          // Std_Alignment: clicks on the two solids give the point pairs.
          if (state.align) {
            if (!hit || (id !== state.align.movable && id !== state.align.fixed)) { notify('info', t('std.alignClickSolids')); return; }
            (id === state.align.movable ? state.align.from : state.align.to).push(hit.point);
            state.align.refresh?.();
            return;
          }
          // Std_ToggleNavigation: clicks only move the view.
          if (state.navigationOnly) return;
          if (state.pickFace) { state.pickFace = false; view3d.instance.canvas.classList.remove('edge-pick'); if (hit) setWorkPlaneFace(hit.point, hit.normal); else notify('info', t('wp.faceNone')); return; }
          if (!id) { if (!event.shiftKey && !event.ctrlKey) select([]); else renderRight(); return; }
          select([id], { toggle: event.shiftKey || event.ctrlKey });
        },
      });
      view3d.instance.setLight(state.settings.light);
      view3d.instance.options.style = state.settings.view3dStyle ?? 'asis';
    }
    resize3d();
    rebuild3d();
    view3d.instance.fit();
  }
  renderView3dBar();
  renderToolbarState();
  renderCommandBar();
  renderStatus();
  return state.view3d;
}

function resize3d() {
  const wrap = root.querySelector('#canvas-wrap');
  if (!view3d.instance || !wrap) return;
  const rect = wrap.getBoundingClientRect();
  view3d.instance.resize(state.tiled ? Math.floor(rect.width / 2) - 2 : rect.width, rect.height);
}

function rebuild3d() {
  const doc = activeDoc();
  if (!state.view3d || !view3d.instance || !doc) return null;
  // Picking edges of a solid that is gone or no longer selected ends it.
  if (state.edgePick && !(state.selection.has(state.edgePick) && D.findEntity(doc.drawing, state.edgePick))) { state.edgePick = null; view3d.instance.setEdgeOverlay(null); }
  const frame = doc.drawing.workPlane?.frame;
  view3d.info = view3d.instance.update(doc.drawing, { thickness: state.settings.extrudeHeight, colors: colors3d(), extrude2d: state.settings.extrude2d, selected: state.selection, axisLabelScale: state.settings.axisLabelSize / 100, plane: frame ? frameMatrix(frame) : null });
  // The picked elements, found again on the rebuilt meshes.
  if (state.elements?.length) {
    state.elements = state.elements.map((el) => { const topology = view3d.instance.topologyOf(el.id); const index = topology ? matchElement(topology, el.kind, el.signature) : -1; return index >= 0 ? { ...el, index } : null; }).filter(Boolean);
    view3d.instance.setElementHighlight(state.elements);
  }
  view3d.instance.setElementMode(state.elementFilter ?? null, onElementPick);
  // Assembly_CreateView: the parts shown pulled apart (the drawing itself stays).
  if (doc.drawing.exploded && !anim.active) view3d.instance.setPoses(explodeDeltas(doc.drawing.entities.filter((e) => e.type === 'solid' && e.kind !== 'datum'), doc.drawing.exploded.factor, (e) => { const tris = view3d.instance.entityTris?.get(e.id); if (!tris?.length) return null; const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity]; for (const tri of tris) for (const p of tri) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } return lo.map((v, k) => (v + hi[k]) / 2); }));
  // Another drawing: framed afresh (a room and a gear are not seen from the same place).
  if (view3d.docId !== doc.id) { if (view3d.docId) view3d.instance.view('iso'); view3d.docId = doc.id; }
  renderView3dBar();
  if (state.edgePick) showEdgeOverlay();
  return view3d.info;
}

/** Draw style of the 3D view (kept in the settings). */
function setView3dStyle(style) {
  if (!VIEW_STYLE_IDS.includes(style)) return;
  updateSettings({ view3dStyle: style });
  view3d.instance?.setOption('style', style);
  renderView3dBar();
}

function schedule3d() {
  // Std_ToggleSkipRecompute: the model is not rebuilt until a recompute.
  if (!state.view3d || view3d.frame || state.skipRecompute) return;
  view3d.frame = requestAnimationFrame(() => { view3d.frame = 0; rebuild3d(); });
}

function on3dBar(action) {
  const v = view3d.instance;
  if (!v) return;
  if (action === 'close') { state.lightSelected = false; toggle3d(false); renderRight(); return; }
  if (action === 'extrude2d') { updateSettings({ extrude2d: !state.settings.extrude2d }); rebuild3d(); return; }
  if (action === 'styleMenu') { run('view3dStyleMenu'); return; }
  if (action.startsWith('handle:')) { const mode = action.slice(7); v.setOption('handle', mode === 'off' ? null : mode); renderView3dBar(); return; }
  if (action === 'wireframe') { setView3dStyle(v.options.style === 'mesh' ? 'asis' : 'mesh'); return; }
  if (action === 'fit') v.fit();
  else if (action.startsWith('view:')) v.view(action.slice(5));
  else if (action === 'light') {
    // The no-shading style has no light: switching the light on goes back to the usual model.
    if (v.options.style === 'flat') { setView3dStyle('asis'); setLightOptions({ on: true }); return; }
    setLightOptions({ on: !v.light.on });
    return;
  }
  else v.setOption(action, !v.options[action]);
  renderView3dBar();
}

// ───────────────────────── the light (sun) of the 3D view

let lightSaveTimer = 0;
/** Keeps the light in the settings (saved a moment after the last change, without redrawing everything). */
function rememberLight(light) {
  state.settings.light = { on: light.on, azimuth: light.azimuth, elevation: light.elevation, intensity: light.intensity, color: light.color, shadows: light.shadows, distance: light.distance ?? 0 };
  clearTimeout(lightSaveTimer);
  lightSaveTimer = setTimeout(() => storeSettings(globalThis.localStorage, state.settings), 300);
  if (state.lightSelected && !lightPanelFrame) {
    lightPanelFrame = requestAnimationFrame(() => {
      lightPanelFrame = 0;
      for (const key of ['azimuth', 'elevation', 'intensity']) {
        const input = root.querySelector(`#right-panel [data-light="${key}"]`);
        if (input && document.activeElement !== input) input.value = fmt(state.settings.light[key], 4);
      }
    });
  }
}
let lightPanelFrame = 0;

function setLightOptions(patch) {
  const next = { ...state.settings.light, ...patch };
  if (view3d.instance) view3d.instance.setLight(next);
  else rememberLight(next);
  renderToolbarState();
  renderView3dBar();
  if (state.lightSelected) renderRight();
}

/** Selects the light: its properties show in the right panel. */
function selectLight() {
  if (!state.view3d) return;
  state.selection = new Set();
  state.lightSelected = true;
  if (!state.settings.showRightPanel) updateSettings({ showRightPanel: true });
  renderRight();
  renderStatus();
  notify('info', t('light.selected'));
}

// ───────────────────────── start page

/** Shows (or leaves) the start page. */
function showHome(on = true) {
  if (on) closeDocViewer();
  if (on && state.tool) cancelTool();
  state.home = on;
  if (on) loadSamples();
  renderAll();
}

/** The sample list (samples/index.json), loaded once. */
/**
 * The OpenCASCADE kernel (exact booleans, fillets, STEP surfaces) loads in the
 * background; booleans and dress-ups use the mesh kernel until it is there,
 * then everything is meshed again from the exact shapes.
 */
function startKernel() {
  state.kernel = 'loading';
  return import('replicad-opencascadejs/wasm?url')
    .then(({ default: wasm }) => loadOcc({ locateFile: () => wasm }))
    .then(() => {
      state.kernel = 'occ';
      resetSolidCaches();
      drawCanvas();
      rebuild3d();
      renderStatus();
      return true;
    })
    .catch((error) => { state.kernel = 'mesh'; console.warn('OpenCASCADE did not load:', error); return false; });
}

function loadSamples() {
  if (state.samples || state.samplesLoading) return state.samplesLoading;
  state.samplesLoading = fetch('samples/index.json', { cache: 'no-store' })
    .then((response) => { if (!response.ok) throw new Error(`index.json: ${response.status}`); return response.json(); })
    .then((list) => { state.samples = Array.isArray(list) ? list : []; })
    .catch((error) => { state.samplesError = native.errorText?.(error) ?? String(error); })
    .finally(() => { state.samplesLoading = null; renderStart(); });
  return state.samplesLoading;
}

async function fetchSample(file) {
  const response = await fetch(`samples/${file.split('/').map(encodeURIComponent).join('/')}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${file}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** A sample as a drawing (for its thumbnail): .mcad, 2D CAD or 3D model. */
function sampleDrawing(file, bytes) {
  if (/\.mcad$/i.test(file)) return parseFile(new TextDecoder().decode(bytes), getLanguage());
  if (isModelFileName(file)) return drawingFromModel(baseName(file), bytes).drawing;
  return importDrawingBytes(file, bytes, { language: getLanguage() }).drawing;
}

/** Opens a sample in a new tab (an unsaved copy: Save asks where to keep it). */
function openSample(file) {
  state.loading = (async () => {
    try {
      const bytes = await withProgress('progress.open', baseName(file), async () => fetchSample(file));
      let doc;
      if (/\.mcad$/i.test(file)) {
        const drawing = parseFile(new TextDecoder().decode(bytes), getLanguage());
        doc = addDocument(new DrawingDocument(drawing, { name: baseName(file) }));
      } else if (isModelFileName(file)) doc = openModelBytes(baseName(file), bytes);
      else doc = openDrawingBytes(file, bytes, { quiet: true });
      state.home = false;
      renderAll();
      notify('success', t('notice.sampleOpened', { name: baseName(file) }));
      // A moving sample shows itself moving.
      if (hasDrives(doc?.drawing?.joints)) await toggleAnimation(true);
      return doc;
    } catch (error) {
      showError('error.open', error, file);
      return null;
    }
  })();
  return state.loading;
}

function renderStart() {
  const page = root.querySelector('#start-page');
  if (!page) return;
  page.hidden = !state.home;
  root.classList.toggle('home', state.home);
  if (!state.home) { startBackground?.hide(); return; }
  // A moving 3D background behind a scrolling page.
  let scroll = page.querySelector('.start-scroll');
  if (!scroll) {
    page.innerHTML = '<div class="start-bg" aria-hidden="true"></div><div class="start-scroll"></div>';
    scroll = page.querySelector('.start-scroll');
  }
  showStartBackground(page.querySelector('.start-bg'));
  const screen = state.settings;
  const key = JSON.stringify([getLanguage(), state.recent.map((item) => `${item.path}|${item.at}`), state.samples?.length ?? null, state.samplesError, state.info?.version, screen.startScene, screen.startTransparency, screen.startMotion, screen.startCamera, screen.startObjects]);
  if (scroll.dataset.key === key) return;
  const top = scroll.scrollTop;
  scroll.dataset.key = key;
  scroll.innerHTML = startPageHtml({ t, language: getLanguage(), appIcon: appIconUrl, version: displayVersion(state.info?.version), recent: state.recent, samples: state.samples, error: state.samplesError, settings: screen });
  scroll.scrollTop = top;
  paintThumbs();
}

let startBackground = null;
let backgroundLoading = null;

function startViewOptions() {
  const s = state.settings;
  return {
    scene: s.startScene,
    transparency: s.startTransparency,
    motion: s.startMotion,
    camera: s.startCamera,
    objects: s.startObjects,
    colors: { background: getComputedStyle(root).getPropertyValue('--canvas').trim() || '#f4f6fb' },
  };
}

function showStartBackground(host) {
  if (startBackground) {
    startBackground.configure(startViewOptions());
    return;
  }
  if (backgroundLoading) return;
  backgroundLoading = (async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const { StartBackground } = await import('./view/startbg.js');
    startBackground = new StartBackground(host);
    await startBackground.configure(startViewOptions());
    if (!state.home) startBackground.hide();
  })().catch(() => { /* the page works without its background */ });
}

/** Thumbnails: made one at a time after the page shows, kept for the session. */
let thumbQueue = null;
function paintThumbs() {
  const canvases = [...root.querySelectorAll('#start-page canvas[data-thumb]')];
  const missing = [];
  for (const canvas of canvases) {
    const url = state.thumbs.get(canvas.dataset.thumb);
    if (url) drawThumb(canvas, url); else missing.push(canvas.dataset.thumb);
  }
  if (!missing.length || thumbQueue) return;
  thumbQueue = (async () => {
    for (const file of missing) {
      if (state.thumbs.has(file)) continue;
      try {
        const drawing = sampleDrawing(file, await fetchSample(file));
        state.thumbs.set(file, await thumbnailOf(drawing));
      } catch {
        state.thumbs.set(file, '');
      }
      for (const canvas of root.querySelectorAll(`#start-page canvas[data-thumb="${CSS.escape(file)}"]`)) drawThumb(canvas, state.thumbs.get(file));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    thumbQueue = null;
  })();
}

function drawThumb(canvas, url) {
  if (!url) { canvas.classList.add('empty'); return; }
  const image = new Image();
  image.onload = () => { const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height); canvas.classList.add('ready'); };
  image.src = url;
}

/** A 320 × 200 picture of a drawing: solids shaded in isometric view, 2D drawings as drawn. */
let thumbWorker = null;
let thumbJob = 0;
const thumbJobs = new Map();
/** The shaded iso view of solids, computed in a worker (meshing can take seconds); on the main thread if no worker. */
function shadedInWorker(solids) {
  try {
    if (!thumbWorker) {
      thumbWorker = new Worker(new URL('./view/thumbworker.js', import.meta.url), { type: 'module' });
      thumbWorker.onmessage = ({ data }) => { thumbJobs.get(data.id)?.(data.shaded); thumbJobs.delete(data.id); };
      thumbWorker.onerror = () => { for (const done of thumbJobs.values()) done(undefined); thumbJobs.clear(); thumbWorker = false; };
    }
    if (thumbWorker === false) throw new Error('no worker');
    const id = ++thumbJob;
    return new Promise((resolve) => { thumbJobs.set(id, resolve); thumbWorker.postMessage({ id, solids }); })
      .then((shaded) => (shaded === undefined ? shadedHere(solids) : shaded));
  } catch {
    return Promise.resolve(shadedHere(solids));
  }
}
function shadedHere(solids) {
  const tris = solids.flatMap((entity) => solidMesh(entity));
  if (!tris.length || tris.length > 120000) return null;
  const view = shadedView(tris, 'iso');
  const out = new Float32Array(view.length * 7);
  view.forEach((tri, i) => { tri.points.forEach((p, j) => { out[i * 7 + j * 2] = p.x; out[i * 7 + j * 2 + 1] = p.y; }); out[i * 7 + 6] = tri.light; });
  return out;
}

async function thumbnailOf(drawing, width = 320, height = 200) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  const solids = drawing.entities.filter((entity) => entity.type === 'solid');
  // Mostly solids: a shaded isometric picture (x1 y1 x2 y2 x3 y3 light per triangle).
  const shaded = solids.length && solids.length * 4 >= drawing.entities.length ? await shadedInWorker(solids) : null;
  if (shaded?.length) {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (let i = 0; i < shaded.length; i += 7) {
      for (let j = 0; j < 6; j += 2) { const x = shaded[i + j]; const y = shaded[i + j + 1]; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }
    const k = Math.min((width - 24) / Math.max(maxX - minX, 1e-6), (height - 24) / Math.max(maxY - minY, 1e-6));
    const x0 = (width - (maxX - minX) * k) / 2; const y0 = (height - (maxY - minY) * k) / 2;
    for (let i = 0; i < shaded.length; i += 7) {
      const shade = 0.35 + 0.65 * shaded[i + 6];
      const color = `rgb(${Math.round(58 * shade + 40)}, ${Math.round(108 * shade + 40)}, ${Math.round(240 * shade)})`;
      ctx.beginPath();
      for (let j = 0; j < 6; j += 2) { const x = x0 + (shaded[i + j] - minX) * k; const y = y0 + (maxY - shaded[i + j + 1]) * k; if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.6;
      ctx.fill();
      ctx.stroke();
    }
    return canvas.toDataURL('image/png');
  }
  const box = D.extents(drawing) ?? { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const zoom = Math.min((width - 24) / Math.max(boxWidth(box), 1e-6), (height - 24) / Math.max(boxHeight(box), 1e-6));
  const vp = new Viewport({ cx: (box.minX + box.maxX) / 2, cy: (box.minY + box.maxY) / 2, zoom, width, height });
  const colors = { ...canvasColors(), canvas: '#ffffff', ink: '#1d2433', grid: '#ffffff', gridMajor: '#ffffff', ucs: 'rgba(0,0,0,0)' };
  render(ctx, { drawing, vp, colors, settings: { ...state.settings, showGrid: false, showRulers: false, crosshair: false, showLineWeights: true }, selection: new Set(), dpr: 1 });
  return canvas.toDataURL('image/png');
}

// ───────────────────────── tutorial

async function openTutorial(options = {}) {
  if (!state.tutorial) {
    const { TutorialPlayer } = await import('./tutorial/player.js');
    state.tutorial = new TutorialPlayer(tutorialApi());
  }
  await state.tutorial.open(options);
  return state.tutorial;
}

/**
 * Tutorial.html in the current language. The installed app reads the copy
 * shipped in its resource folder (doc/); the web build reads doc/ next to the page.
 */
async function tutorialDocUrl() {
  const name = getLanguage() === 'en' ? 'Tutorial.en.html' : 'Tutorial.html';
  if (desktop) {
    const path = await native.tutorialDocument(name);
    return { name, url: native.assetUrl(path) };
  }
  return { name, url: new URL(`doc/${name}`, document.baseURI).href };
}

function isDocViewerOpen() {
  const viewer = root.querySelector('#doc-viewer');
  return Boolean(viewer && !viewer.hidden);
}

/** The tutorial document (doc/Tutorial.html with its pictures), inside this window. */
async function showDocViewer(url) {
  const viewer = root.querySelector('#doc-viewer');
  if (!viewer) return;
  if (!url) url = (await tutorialDocUrl()).url;
  const current = viewer.querySelector('iframe');
  viewer.hidden = false;
  root.classList.add('doc-open');
  if (current?.dataset.src === url) return;
  viewer.innerHTML = `<header class="doc-viewer-bar">
      ${icon('book')}<b>${escapeHtml(t('action.tutorialDoc'))}</b>
      <button type="button" class="small-button doc-viewer-close" data-doc-close title="${escapeHtml(t('error.close'))}">${icon('close')}<span>${escapeHtml(t('error.close'))}</span></button>
    </header>
    <iframe class="doc-viewer-frame" title="${escapeHtml(t('action.tutorialDoc'))}" src="${escapeHtml(url)}" data-src="${escapeHtml(url)}"></iframe>`;
  const frame = viewer.querySelector('iframe');
  frame.addEventListener('load', () => {
    try {
      frame.contentWindow?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { event.preventDefault(); closeDocViewer(); }
      });
    } catch { /* the page went away */ }
  });
  viewer.querySelector('[data-doc-close]')?.focus();
}

function closeDocViewer() {
  const viewer = root.querySelector('#doc-viewer');
  if (!viewer || viewer.hidden) return;
  viewer.hidden = true;
  const frame = viewer.querySelector('iframe');
  if (frame) frame.src = 'about:blank';
  frame?.removeAttribute('data-src');
  root.classList.remove('doc-open');
}

async function openTutorialDoc() {
  let name = 'Tutorial.html';
  try {
    const found = await tutorialDocUrl();
    name = found.name;
    if (!desktop) {
      const response = await fetch(found.url, { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
    }
    await showDocViewer(found.url);
  } catch (error) {
    showError('error.open', error, `doc/${name}`);
  }
}

/**
 * The tutorial panel's own window (desktop): opened at the lower right of the
 * main window, then moved anywhere by its header. Its buttons come back as
 * 'tutorial' actions; it calls onClosed when it goes away (its close button, Escape).
 */
const tutorialWindow = {
  show(html, onClosed) {
    const size = POPUPS.tutorial;
    const anchor = { x: Math.round(window.screenX + window.outerWidth - size.width - 28), y: Math.round(window.screenY + window.outerHeight - size.height - 48) };
    popups.open('tutorial', { html }, { anchor }).then(() => onClosed?.());
  },
  update(html) {
    popups.post('tutorial', { type: 'tutorial', html });
  },
  hide() {
    native.invoke('close_popup', { kind: 'tutorial' }).catch(() => {});
    popups.settle('tutorial', null);
  },
};

/** What the tutorial player may use: the real interface, plus a few direct actions for dialogs. */
function tutorialApi() {
  const canvas = () => root.querySelector('#cad-canvas');
  return {
    panelWindow: desktop ? tutorialWindow : null,
    language: () => getLanguage(),
    state: () => state,
    settings: () => state.settings,
    updateSettings,
    drawing: () => activeDrawing(),
    canvas,
    run: (id) => run(id),
    commandLabel: (id) => t(commands[id]?.label ?? id),
    openSectionFor(toolId) {
      if (state.home) showHome(false);
      if (!state.settings.showLeftPanel) updateSettings({ showLeftPanel: true });
      const section = DRAW_TOOLS.includes(toolId) ? 'draw' : DIM_TOOLS.includes(toolId) ? 'dims' : MODIFY_TOOLS.includes(toolId) ? 'modify' : null;
      if (section && state.settings.collapsedSections.includes(section)) toggleSection(section, true);
    },
    openSection(id) { if (state.settings.collapsedSections.includes(id)) toggleSection(id, true); },
    worldToClient(p) {
      const doc = activeDoc();
      if (!doc) return null;
      const s = ensureViewport(doc).toScreen(p);
      const r = canvas().getBoundingClientRect();
      return { x: r.left + s.x, y: r.top + s.y };
    },
    pointer(type, p, { shift = false, buttons } = {}) {
      canvas().dispatchEvent(new PointerEvent(type, { clientX: p.x, clientY: p.y, button: 0, buttons: buttons ?? (type === 'pointerdown' ? 1 : 0), pointerId: 1, pointerType: 'mouse', isPrimary: true, bubbles: true, cancelable: true, shiftKey: shift }));
    },
    view(box) {
      const doc = activeDoc();
      if (!doc) return;
      ensureViewport(doc).fit(box, 30, state.settings.showRulers ? RULER : 0);
      scheduleRender();
    },
    zoom: () => activeDoc()?.vp?.zoom ?? 0,
    centre: () => ({ x: activeDoc()?.vp?.cx ?? 0, y: activeDoc()?.vp?.cy ?? 0 }),
    zoomFit,
    closePopup: (kind) => popups.close(kind),
    closeMenu() {
      if (desktop) native.invoke('hide_popup', { kind: 'menu' }).catch(() => {});
      else popups.close('menu');
      popups.settle('menu', null);
      state.openMenu = null;
    },
    popups,
    select: (ids) => select(ids),
    selection: () => selectedIds(),
    setTool: (id) => setTool(id),
    newDrawing: async () => { newDrawing(); },
    openSample,
    async waitIdle(ms = 0) { await state.loading; if (ms) await new Promise((resolve) => setTimeout(resolve, ms)); },
    openPartDialog: (options) => openPartDialog(options),
    placePart: (kind, params) => setTool('place', { part: { kind, params, angle: 0 } }),
    openSolidDialog: (options) => openSolidDialog(options),
    insertSolid,
    applyFeature(kind, params) {
      const found = featureSource(kind);
      if (!found) throw new Error(`${kind}: nothing to make it from`);
      return applyFeature(kind, found, params);
    },
    projectSolids: (options) => projectSolids(options),
    sectionSolids: (level) => sectionSolids(level),
    arrayRect({ rows, columns, dx, dy }) {
      const ids = selectedIds();
      const created = change('op.array', (drawing) => D.rectangularArray(drawing, ids, { rows, columns, dx, dy }));
      select([...ids, ...created.map((entity) => entity.id)]);
      return created;
    },
    notice: () => state.notice?.text ?? '',
    activeFormat: () => activeDoc()?.format ?? null,
    onTutorial(on) { root.classList.toggle('tutorial-on', on); },
    // The newer lessons (assembly, exact solids, CAM, FEM, Python).
    toggleAnimation: (on) => toggleAnimation(on), stopAnimation: () => stopAnimation(), animState: () => ({ ...anim }),
    addJoint: (type) => addJoint(type), setJointDrive: (id, part, value) => setJointDrive(id, part, value),
    dressUp: (kind, params) => dressUp(kind, params), toggleEdgePick: (on) => toggleEdgePick(on), toggleEdge: (id, edge) => toggleEdge(id, edge),
    openCam: (options) => openCam(options), openPlate: (result) => openPlate(result), openFem3d: (result) => openFem3d(result),
    runScript: (code, options) => runScript(code, options), toggle3d: (on) => toggle3d(on), view3d: () => view3d.instance,
    kernelReady: () => occReady(), addEntity: (type, data) => change(`op.${type}`, (d) => D.addEntity(d, type, data)),
  };
}

// ───────────────────────── canvas

const canvasState = { vpSize: { width: 800, height: 600 }, dpr: 1, frame: 0, drag: null, spaceDown: false };

function canvasColors() {
  const theme = resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme);
  const c = theme.colors;
  return {
    canvas: c.canvas, grid: c.grid, gridMajor: c.gridMajor, axis: mix(c.canvas, c.text, 0.3), ink: c.text,
    select: c.accent, hover: mix(c.accent, c.text, 0.35), preview: c.accent, grip: c.accent, snap: '#f5a524',
    window: '#3a8fd6', windowFill: 'rgba(58,143,214,0.12)', crossing: '#2fa36b', crossingFill: 'rgba(47,163,107,0.12)',
    crosshair: mix(c.canvas, c.text, 0.45), ucs: mix(c.canvas, c.text, 0.55),
    ruler: c.panel, rulerLine: c.border, rulerText: c.muted,
  };
}

function ensureViewport(doc) {
  if (!doc) return null;
  const { width, height } = canvasState.vpSize;
  if (!doc.vp) {
    doc.vp = new Viewport({ width, height });
    const box = D.extents(doc.drawing);
    if (box) doc.vp.fit(box, 60, state.settings.showRulers ? RULER : 0);
    else { doc.vp.zoom = PX_PER_MM; doc.vp.cx = width / 2 / PX_PER_MM - 20; doc.vp.cy = height / 2 / PX_PER_MM - 20; }
  }
  doc.vp.width = width;
  doc.vp.height = height;
  return doc.vp;
}

function scheduleRender() {
  if (canvasState.frame) return;
  canvasState.frame = requestAnimationFrame(() => {
    canvasState.frame = 0;
    drawCanvas();
  });
}

function drawCanvas() {
  const canvas = root.querySelector('#cad-canvas');
  const doc = activeDoc();
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!doc) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const vp = ensureViewport(doc);
  const colors = canvasColors();
  let previews = [];
  let previewPrims = [];
  const drag = canvasState.drag;
  if (state.tool && state.cursor) {
    const result = state.tool.preview(state.cursor) ?? {};
    previews = result.previews ?? [];
    previewPrims = result.previewPrims ?? [];
    state.live = result.length !== undefined || result.angle !== undefined ? result : null;
  }
  if (drag?.kind === 'move' && drag.started) previews = drag.previews ?? [];
  if (drag?.kind === 'grip' && drag.preview) previews = [drag.preview];
  const hidden = drag?.started && (drag.kind === 'move' || drag.kind === 'grip') ? new Set(drag.kind === 'move' ? drag.ids : [drag.entityId]) : null;
  const drawing = hidden ? { ...doc.drawing, entities: doc.drawing.entities.filter((entity) => !hidden.has(entity.id)) } : doc.drawing;
  const result = render(ctx, {
    drawing, vp, colors, settings: state.settings, selection: state.selection, hover: state.hover, previews, previewPrims,
    box: drag?.kind === 'box' && drag.started ? { a: drag.start, b: drag.current, crossing: drag.current.x < drag.start.x } : null,
    snap: state.snap, cursor: state.cursor, dpr: canvasState.dpr, gripHover: state.gripHover, showCrosshair: !canvasState.drag || canvasState.drag.kind !== 'pan',
    overlayPrims: sketchOverlayPrims(drawing, state.settings, { size: 4 / vp.zoom, refs: state.sketchRefs ?? [], selection: state.settings.subelementHighlight ? selectedEntities() : [] }), pickedConstraints: new Set(state.constraintSelection ?? []),
    liveLabel: state.settings.snapDimensions && state.live ? readout(state.live, Math.max(2, state.settings.dimPrecision)) : null,
  });
  canvasState.lastDrawn = result.drawn;
  canvasState.gridStep = result.gridStep;
  canvasState.lastRuler = result.ruler;
  renderCommandBarLive();
  updateScaleBar();
}

// ───────────────────────── scale bar (2D canvas)

/** About three significant digits. */
const scaleDigits = (value) => Math.max(0, Math.min(6, 2 - Math.floor(Math.log10(Math.max(Math.abs(value), 1e-9)))));

/** The view's scale as a ratio: 100% (actual size) = 1:1, 50% = 1:2, 400% = 4:1. */
function scaleRatio(percent) {
  if (!(percent > 0)) return '';
  return percent >= 100 ? `${formatNumber(percent / 100, 2)}:1` : `1:${formatNumber(100 / percent, 2)}`;
}

/**
 * The scale bar: a bar of `width` px with the drawing length it covers at the
 * current zoom (display unit) and the view's ratio. Stays inside the canvas;
 * hidden in the 3D view.
 */
function updateScaleBar() {
  const bar = root.querySelector('#scale-bar');
  if (!bar) return;
  const vp = activeDoc()?.vp;
  const show = Boolean(state.settings.showScaleBar && !state.view3d && vp?.zoom > 0);
  bar.hidden = !show;
  if (!show) return;
  const size = canvasState.vpSize ?? { width: 800, height: 600 };
  const { x, y, width } = state.settings.scaleBar;
  const w = Math.max(30, Math.min(width, size.width - 24));
  const left = Math.max(0, Math.min(x, size.width - w - 12));
  const bottom = Math.max(0, Math.min(y, size.height - 44));
  bar.style.left = `${left}px`;
  bar.style.bottom = `${bottom}px`;
  bar.querySelector('.scale-track').style.width = `${w}px`;
  const mm = w / vp.zoom;
  const text = formatLength(mm, displayUnit(), scaleDigits(toUnit(mm)));
  const ratio = scaleRatio(vp.percent);
  const length = bar.querySelector('.scale-length');
  if (length.textContent !== text) length.textContent = text;
  const ratioText = ratio ? t('scaleBar.ratio', { ratio }) : '';
  const small = bar.querySelector('.scale-ratio');
  if (small.textContent !== ratioText) small.textContent = ratioText;
  const tip = `${t('action.scaleBar')}: ${text}${ratio ? ` · ${ratioText}` : ''}\n${t('scaleBar.tip')}`;
  if (bar.title !== tip) bar.title = tip;
  bar.dataset.mm = String(mm);
}

/** Drag the bar to move it, its start or end line to change its length; double-click: a round length. */
function bindScaleBar() {
  const bar = root.querySelector('#scale-bar');
  if (!bar) return;
  let drag = null;
  bar.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const shown = bar.querySelector('.scale-track').getBoundingClientRect().width;
    drag = { mode: event.target.closest('[data-scale-handle]')?.dataset.scaleHandle ?? 'move', sx: event.clientX, sy: event.clientY, start: { ...state.settings.scaleBar, x: parseFloat(bar.style.left) || 0, y: parseFloat(bar.style.bottom) || 0, width: shown } };
    bar.setPointerCapture(event.pointerId);
    bar.classList.add('dragging', `drag-${drag.mode}`);
  });
  bar.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.sx;
    const dy = event.clientY - drag.sy;
    const s = drag.start;
    let next;
    if (drag.mode === 'start') {
      const width = Math.max(30, s.width - dx);
      next = { ...s, x: s.x + (s.width - width), width };
    } else if (drag.mode === 'end') next = { ...s, width: Math.max(30, s.width + dx) };
    else next = { ...s, x: Math.max(0, s.x + dx), y: Math.max(0, s.y - dy) };
    state.settings.scaleBar = { x: Math.round(next.x), y: Math.round(next.y), width: Math.round(next.width) };
    updateScaleBar();
  });
  const end = () => {
    if (!drag) return;
    drag = null;
    bar.classList.remove('dragging', 'drag-move', 'drag-start', 'drag-end');
    storeSettings(globalThis.localStorage, state.settings);
  };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
  bar.addEventListener('dblclick', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const vp = activeDoc()?.vp;
    if (!vp?.zoom) return;
    // The nearest round length (1, 2, 5 × 10ⁿ in the display unit).
    const inUnit = toUnit(state.settings.scaleBar.width / vp.zoom);
    const power = 10 ** Math.floor(Math.log10(inUnit));
    const round = [1, 2, 5, 10].map((k) => k * power).reduce((best, v) => (Math.abs(v - inUnit) < Math.abs(best - inUnit) ? v : best));
    state.settings.scaleBar = { ...state.settings.scaleBar, width: Math.max(30, Math.round(round * unitFactor(displayUnit()) * vp.zoom)) };
    storeSettings(globalThis.localStorage, state.settings);
    updateScaleBar();
  });
  bar.addEventListener('wheel', (event) => onCanvasWheel(event), { passive: false });
}

/** Cursor position in the display unit. */
function coordsText() {
  // On a working plane the readout is in its coordinates.
  const wp = activeDrawing()?.workPlane ?? null;
  const p = state.cursor ? toPlane(state.cursor, wp) : null;
  return `${wp ? `${t('wp.short')} ` : ''}${p ? `X ${lengthValue(p.x)}   Y ${lengthValue(p.y)}` : 'X —   Y —'}`;
}

function renderCommandBarLive() {
  const live = root.querySelector('#command-live');
  if (live) live.textContent = state.live ? readout(state.live, Math.max(2, state.settings.dimPrecision)) : '';
  const coords = root.querySelector('#status-coords');
  if (coords) coords.textContent = coordsText();
  const zoom = root.querySelector('#zoom-value');
  const vp = activeDoc()?.vp;
  if (zoom && vp && document.activeElement !== zoom) zoom.value = `${formatNumber(vp.percent, vp.percent < 10 ? 1 : 0)}%`;
  const statusZoom = root.querySelector('#status-zoom');
  if (statusZoom && vp) statusZoom.textContent = t('status.zoom', { value: formatNumber(vp.percent, vp.percent < 10 ? 1 : 0) });
}

function resizeCanvas() {
  const area = root.querySelector('#canvas-wrap');
  const canvas = root.querySelector('#cad-canvas');
  if (!area || !canvas) return;
  const full = area.getBoundingClientRect();
  // Std_TileWindows: the drawing on the left half, the 3D view on the right.
  const rect = state.tiled ? { width: Math.floor(full.width / 2) - 2, height: full.height } : full;
  const dpr = window.devicePixelRatio || 1;
  canvasState.dpr = dpr;
  canvasState.vpSize = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  scheduleRender();
}

/** Canvas point of a pointer event (CSS px). */
function canvasPoint(event) {
  const rect = root.querySelector('#cad-canvas').getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

const pickTolerance = () => 6 / (activeDoc()?.vp?.zoom ?? 1);

/** The topmost editable entity under p (drawing units), optionally filtered. */
function hitEntity(p, filter = null) {
  const drawing = activeDrawing();
  if (!drawing) return null;
  const tolerance = pickTolerance();
  let best = null;
  let bestDistance = Infinity;
  const list = D.editable(drawing);
  for (let i = list.length - 1; i >= 0; i--) {
    const entity = list[i];
    if (filter && !filter(entity)) continue;
    const box = cachedBox(entity);
    if (!box || p.x < box.minX - tolerance || p.x > box.maxX + tolerance || p.y < box.minY - tolerance || p.y > box.maxY + tolerance) continue;
    const d = entityDistance(entity, p);
    if (d <= tolerance && d < bestDistance - 1e-9) { best = entity; bestDistance = d; }
  }
  return best;
}

function gripAt(screen) {
  const doc = activeDoc();
  if (!doc?.vp || !state.selection.size || state.selection.size > 60) return null;
  for (const entity of doc.drawing.entities) {
    if (!state.selection.has(entity.id) || D.isLocked(doc.drawing, entity)) continue;
    for (const grip of grips(entity)) {
      const s = doc.vp.toScreen(grip);
      if (Math.abs(s.x - screen.x) <= 6 && Math.abs(s.y - screen.y) <= 6) return { entity: entity.id, id: grip.id };
    }
  }
  return null;
}

/** Snapped drawing point for a raw pointer position. `base` enables ortho. */
function snappedPoint(raw, { base = null, exclude = new Set(), useSnap = true } = {}) {
  const doc = activeDoc();
  const s = state.settings;
  let snap = null;
  if (useSnap && s.snapObject) snap = findSnap(D.editable(doc.drawing), raw, 10 / doc.vp.zoom, s.snapModes, { exclude, base: base ?? state.tool?.base?.() ?? null });
  let p = snap ? { x: snap.x, y: snap.y } : raw;
  if (!snap && s.snapGrid) {
    // Draft_Snap_WorkingPlane: the grid of the working plane (on), or of the drawing's own axes (off).
    p = snapToGrid(raw, gridBaseFor(doc.drawing.grid?.size || s.gridSize), s.snapWorkingPlane === false ? null : doc.drawing.workPlane ?? null);
    snap = { kind: 'grid', ...p };
  }
  if (!snap && base && s.ortho) p = applyOrtho(base, p, doc.drawing.workPlane ?? null);
  else if (snap?.kind === 'grid' && base && s.ortho) p = applyOrtho(base, p, doc.drawing.workPlane ?? null);
  state.snap = snap;
  return p;
}

function onCanvasPointerDown(event) {
  const doc = activeDoc();
  if (!doc) return;
  const canvas = root.querySelector('#cad-canvas');
  canvas.focus({ preventScroll: true });
  const screen = canvasPoint(event);
  const vp = ensureViewport(doc);
  const raw = vp.toWorld(screen.x, screen.y);
  // Pan: middle button, space + left button, or the pan tool.
  if (event.button === 1 || (event.button === 0 && (canvasState.spaceDown || state.toolId === 'pan'))) {
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    canvasState.drag = { kind: 'pan', last: screen, started: true };
    canvas.classList.add('panning');
    return;
  }
  if (event.button !== 0) return;
  if (state.tool) {
    const p = snappedPoint(raw, { base: state.tool.base() });
    try {
      state.tool.click(p, { tolerance: pickTolerance() * 1.5, event });
    } catch (error) {
      showError('error.unexpected', error, t(`tool.${state.toolId}`));
    }
    renderCommandBar();
    scheduleRender();
    return;
  }
  canvas.setPointerCapture(event.pointerId);
  const grip = gripAt(screen);
  if (grip) {
    canvasState.drag = { kind: 'grip', entityId: grip.entity, gripId: grip.id, start: raw, started: false, screen };
    return;
  }
  const hit = hitEntity(raw);
  const additive = event.shiftKey || event.ctrlKey || event.metaKey;
  if (hit) {
    if (additive) select([hit.id], { toggle: true });
    else if (!state.selection.has(hit.id)) select([hit.id]);
    if (state.selection.has(hit.id)) canvasState.drag = { kind: 'move', ids: selectedIds(), start: snappedPoint(raw), startRaw: raw, started: false, screen };
    return;
  }
  canvasState.drag = { kind: 'box', start: raw, current: raw, started: false, screen, additive };
}

function onCanvasPointerMove(event) {
  const doc = activeDoc();
  if (!doc) return;
  const screen = canvasPoint(event);
  const vp = ensureViewport(doc);
  const raw = vp.toWorld(screen.x, screen.y);
  const drag = canvasState.drag;
  if (drag?.kind === 'pan') {
    vp.cx -= (screen.x - drag.last.x) / vp.zoom;
    vp.cy += (screen.y - drag.last.y) / vp.zoom;
    drag.last = screen;
    state.cursor = raw;
    scheduleRender();
    return;
  }
  if (drag && !drag.started && Math.hypot(screen.x - drag.screen.x, screen.y - drag.screen.y) >= 4) drag.started = true;
  if (drag?.kind === 'box') {
    drag.current = raw;
    state.cursor = raw;
    state.snap = null;
    scheduleRender();
    return;
  }
  if (drag?.kind === 'move' && drag.started) {
    const p = snappedPoint(raw, { base: drag.start, exclude: new Set(drag.ids) });
    const op = { type: 'move', dx: p.x - drag.start.x, dy: p.y - drag.start.y };
    const scratch = structuredClone(doc.drawing);
    drag.previews = D.transformEntities(scratch, drag.ids, op);
    drag.op = op;
    state.cursor = p;
    state.live = { length: dist(drag.start, p) };
    scheduleRender();
    return;
  }
  if (drag?.kind === 'grip' && drag.started) {
    const entity = D.findEntity(doc.drawing, drag.entityId);
    const p = snappedPoint(raw, { exclude: new Set([drag.entityId]) });
    drag.preview = entity ? moveGrip(entity, drag.gripId, p) : null;
    state.cursor = p;
    scheduleRender();
    return;
  }
  if (state.tool) {
    state.cursor = snappedPoint(raw, { base: state.tool.base() });
  } else {
    state.snap = null;
    state.cursor = raw;
    const grip = gripAt(screen);
    state.gripHover = grip;
    const hover = grip ? null : hitEntity(raw)?.id ?? null;
    if (hover !== state.hover) state.hover = hover;
    root.querySelector('#cad-canvas').classList.toggle('over-grip', Boolean(grip));
  }
  scheduleRender();
}

function onCanvasPointerUp(event) {
  const doc = activeDoc();
  const drag = canvasState.drag;
  canvasState.drag = null;
  const canvas = root.querySelector('#cad-canvas');
  canvas.classList.remove('panning');
  try { canvas.releasePointerCapture(event.pointerId); } catch { /* not captured */ }
  if (!doc || !drag) return;
  if (drag.kind === 'pan') { scheduleRender(); return; }
  if (drag.kind === 'box') {
    if (!drag.started) {
      if (!drag.additive) select([]);
      return;
    }
    const box = normalizeBox(drag.start, drag.current);
    const crossing = drag.current.x < drag.start.x;
    const ids = D.editable(doc.drawing).filter((entity) => inBoxCached(entity, box, crossing)).map((entity) => entity.id);
    select(ids, { add: drag.additive });
    return;
  }
  if (drag.kind === 'move') {
    if (drag.started && drag.op && (Math.abs(drag.op.dx) > 1e-12 || Math.abs(drag.op.dy) > 1e-12)) {
      change('op.move', (drawing) => D.transformEntities(drawing, drag.ids, drag.op));
    }
    scheduleRender();
    return;
  }
  if (drag.kind === 'grip' && drag.started && drag.preview) {
    change('op.grip', (drawing) => D.replaceEntity(drawing, drag.preview));
    scheduleRender();
  }
}

function inBoxCached(entity, box, crossing) {
  const ebox = cachedBox(entity);
  if (!ebox) return false;
  if (ebox.minX >= box.minX && ebox.maxX <= box.maxX && ebox.minY >= box.minY && ebox.maxY <= box.maxY) return true;
  return crossing && inBox(entity, box, true);
}

function onCanvasWheel(event) {
  const doc = activeDoc();
  if (!doc) return;
  event.preventDefault();
  const vp = ensureViewport(doc);
  const screen = canvasPoint(event);
  if (event.ctrlKey || event.metaKey) {
    // Ctrl + wheel: zoom around the cursor.
    vp.zoomAt(event.deltaY < 0 ? 1.2 : 1 / 1.2, screen.x, screen.y, zoomLimits());
  } else if (event.shiftKey) {
    vp.cx += (event.deltaY || event.deltaX) / vp.zoom;
  } else {
    vp.cx += event.deltaX / vp.zoom;
    vp.cy -= event.deltaY / vp.zoom;
  }
  state.cursor = vp.toWorld(screen.x, screen.y);
  scheduleRender();
  renderToolbarState();
}

const zoomLimits = () => ({ min: (ZOOM.min / 100) * PX_PER_MM, max: (ZOOM.max / 100) * PX_PER_MM });

function zoomBy(factor) {
  if (state.view3d && view3d.instance) { view3d.instance.zoom(factor); return; }
  const vp = ensureViewport(activeDoc());
  if (!vp) return;
  vp.zoomAt(factor, vp.width / 2, vp.height / 2, zoomLimits());
  scheduleRender();
  renderToolbarState();
  renderStatus();
}

function setZoomPercent(percent) {
  const vp = ensureViewport(activeDoc());
  if (!vp || !(percent > 0)) return;
  const target = (Math.min(ZOOM.max, Math.max(ZOOM.min, percent)) / 100) * PX_PER_MM;
  vp.zoomAt(target / vp.zoom, vp.width / 2, vp.height / 2, zoomLimits());
  scheduleRender();
  renderToolbarState();
  renderStatus();
}

function zoomFit() {
  if (state.view3d && view3d.instance) { view3d.instance.fit(); return; }
  const doc = activeDoc();
  const vp = ensureViewport(doc);
  if (!vp) return;
  const box = state.selection.size ? boxOfEntities(selectedEntities()) : D.extents(doc.drawing);
  vp.fit(box, 50, state.settings.showRulers ? RULER : 0);
  scheduleRender();
  renderToolbarState();
  renderStatus();
}

/** Text typed in the command box: a coordinate/number for the active tool, or a tool shortcut. */
function submitCommand(text) {
  const value = String(text ?? '').trim();
  if (!value) {
    if (state.tool?.finish()) { renderCommandBar(); scheduleRender(); return true; }
    if (state.tool) { setTool('select'); return true; }
    return false;
  }
  if (state.tool) {
    const handled = state.tool.typed(value, state.cursor);
    if (!handled) notify('error', t('notice.badCoordinate', { text: value }));
    renderCommandBar();
    scheduleRender();
    return handled;
  }
  // No tool: a tool name or shortcut letter.
  const byKey = Object.entries(TOOL_KEYS).find(([, key]) => key.toLowerCase() === value.toLowerCase());
  const byName = [...DRAW_TOOLS, ...DIM_TOOLS, ...MODIFY_TOOLS].find((id) => id.toLowerCase() === value.toLowerCase() || t(`tool.${id}`) === value);
  const id = byKey?.[0] ?? byName;
  if (id) { setTool(id); return true; }
  notify('error', t('notice.unknownCommand', { text: value }));
  return false;
}

// ───────────────────────── right panel (properties)

/** Steps of the − / + buttons by unit (lengths: by the display unit). */
const STEP_BY_UNIT = { '°': 5, '×': 0.1, '': 1 };
/** A length (mm) as the number shown in a field (display unit). */
const lengthText = (mm) => (Number.isFinite(mm) ? lengthValue(mm) : '');
/** Tip of a length field: also says that other units may be typed. */
const lengthTip = (label) => `${label} (${unitLabel()}) · ${t('units.typeTip')}`;
/**
 * A number property: [−] value (centred, editable, formulas allowed) [+], then its unit.
 * unit 'mm' marks a length: shown in the display unit, typed values converted back to mm.
 */
const numField = (prop, value, label, unit = 'mm', attr = 'data-prop', step) => {
  const length = unit === 'mm';
  const by = step ?? (length ? unitStep(displayUnit()) : STEP_BY_UNIT[unit] ?? 1);
  const shown = length ? lengthText(value) : fmt(value, 4);
  const tip = length ? lengthTip(label) : label;
  return `<div class="prop-row" title="${escapeHtml(tip)}"><span class="prop-label">${escapeHtml(label)}</span><span class="prop-input"><span class="stepper prop-stepper" data-prop-step="${by}">
  <button type="button" class="stepper-button" data-prop-step-dir="-1" title="${escapeHtml(`${label} −${by}`)}" aria-label="${escapeHtml(`${label} −${by}`)}">${icon('minus')}</button>
  <input class="num stepper-value" ${attr}="${prop}" ${length ? 'data-length="1"' : ''} value="${escapeHtml(shown)}" title="${escapeHtml(tip)}" aria-label="${escapeHtml(label)}" />
  <button type="button" class="stepper-button" data-prop-step-dir="1" title="${escapeHtml(`${label} +${by}`)}" aria-label="${escapeHtml(`${label} +${by}`)}">${icon('plus')}</button></span><small class="unit">${length ? unitLabel() : unit}</small></span></div>`;
};
const readField = (label, value, glyph = 'info') => `<div class="prop-row read" title="${escapeHtml(`${label}: ${value}`)}"><span class="prop-label">${icon(glyph)}${escapeHtml(label)}</span><span class="prop-value">${escapeHtml(value)}</span></div>`;

const GEOMETRY_FIELDS = {
  line: [['x1', 'prop.x1'], ['y1', 'prop.y1'], ['x2', 'prop.x2'], ['y2', 'prop.y2']],
  rect: [['x', 'prop.x'], ['y', 'prop.y'], ['width', 'prop.width'], ['height', 'prop.height'], ['angle', 'prop.angle', '°'], ['radius', 'prop.cornerRadius']],
  circle: [['cx', 'prop.cx'], ['cy', 'prop.cy'], ['r', 'prop.radius']],
  arc: [['cx', 'prop.cx'], ['cy', 'prop.cy'], ['r', 'prop.radius'], ['start', 'prop.start', '°'], ['end', 'prop.end', '°']],
  ellipse: [['cx', 'prop.cx'], ['cy', 'prop.cy'], ['rx', 'prop.rx'], ['ry', 'prop.ry'], ['angle', 'prop.angle', '°'], ['start', 'prop.start', '°'], ['end', 'prop.end', '°']],
  polygon: [['cx', 'prop.cx'], ['cy', 'prop.cy'], ['r', 'prop.radius'], ['sides', 'prop.sides', ''], ['angle', 'prop.angle', '°']],
  text: [['x', 'prop.x'], ['y', 'prop.y'], ['size', 'prop.textHeight'], ['angle', 'prop.angle', '°']],
  part: [['x', 'prop.x'], ['y', 'prop.y'], ['angle', 'prop.angle', '°'], ['scale', 'prop.scale', '×']],
  point: [['x', 'prop.x'], ['y', 'prop.y'], ['size', 'prop.pointSize']],
  leader: [['size', 'prop.textHeight']],
  hatch: [['scale', 'prop.hatchScale', '×'], ['angle', 'prop.angle', '°']],
  solid: [['x', 'prop.x'], ['y', 'prop.y'], ['z', 'prop.z'], ['rx', 'prop.rotX', '°'], ['ry', 'prop.rotY', '°'], ['rz', 'prop.rotZ', '°'], ['scale', 'prop.scale', '×']],
};

/** A leader's kind (note, balloon, GD&T frame, datum) and what that kind has. */
function leaderRows(entity) {
  const style = entity.style ?? 'note';
  const select = (key, label, glyph, options, current, prefix) => `<label class="prop-row" title="${escapeHtml(t(label))}"><span class="prop-label">${icon(glyph)}${t(label)}</span><select data-prop="${key}" title="${escapeHtml(t(label))}">${options.map((value) => `<option value="${value}" ${current === value ? 'selected' : ''}>${escapeHtml(t(`${prefix}.${value}`))}</option>`).join('')}</select></label>`;
  const line = (key, label, glyph, value) => `<label class="prop-row" title="${escapeHtml(t(label))}"><span class="prop-label">${icon(glyph)}${t(label)}</span><input data-prop="${key}" value="${escapeHtml(value)}" title="${escapeHtml(t(label))}" /></label>`;
  const kind = select('style', 'prop.leaderStyle', 'leader', LEADER_STYLES, style, 'leaderStyle');
  if (style === 'balloon') return kind + line('text', 'prop.balloonNumber', 'balloon', entity.text) + select('shape', 'prop.balloonShape', 'circle', BALLOON_SHAPES, entity.shape, 'balloonShape');
  if (style === 'datum') return kind + line('text', 'prop.datumLetter', 'datum', entity.text);
  if (style === 'gdt') {
    return kind + select('symbol', 'prop.gdtSymbol', 'gdt', GDT_SYMBOLS, entity.symbol, 'gdt') + line('text', 'prop.gdtTolerance', 'measure', entity.text)
      + `<label class="prop-row" title="${escapeHtml(t('prop.gdtDiameter'))}"><span class="prop-label">${t('prop.gdtDiameter')}</span><input type="checkbox" data-prop-bool="diameter" ${entity.diameter ? 'checked' : ''} title="${escapeHtml(t('prop.gdtDiameter'))}" /></label>`
      + select('modifier', 'prop.gdtModifier', 'circle', GDT_MODIFIERS, entity.modifier, 'gdtModifier') + line('datums', 'prop.gdtDatums', 'datum', entity.datums);
  }
  return kind + `<label class="prop-block" title="${escapeHtml(t('prop.text'))}"><span class="prop-label">${icon('text')}${t('prop.text')}</span><textarea data-prop="text" rows="2" title="${escapeHtml(t('prop.text'))}">${escapeHtml(entity.text)}</textarea></label>`;
}

function styleRows(drawing, entities) {
  const first = entities[0];
  const same = (key) => entities.every((entity) => entity[key] === first[key]);
  const layerOptions = drawing.layers.map((layer) => `<option value="${escapeHtml(layer.id)}" ${same('layer') && first.layer === layer.id ? 'selected' : ''}>${escapeHtml(layer.name)}</option>`).join('');
  const color = same('color') ? first.color : undefined;
  const lineType = same('lineType') ? first.lineType : undefined;
  const lineWidth = same('lineWidth') ? first.lineWidth : undefined;
  return `
    <label class="prop-row" title="${escapeHtml(t('prop.layer'))}"><span class="prop-label">${icon('layers')}${t('prop.layer')}</span><select data-style="layer" title="${escapeHtml(t('prop.layer'))}">${same('layer') ? '' : '<option value="">—</option>'}${layerOptions}</select></label>
    <div class="prop-row" title="${escapeHtml(t('prop.color'))}"><span class="prop-label">${icon('palette')}${t('prop.color')}</span><span class="prop-input">
      <label class="check-inline" title="${escapeHtml(t('prop.byLayer'))}"><input type="checkbox" data-style="colorByLayer" ${color === null ? 'checked' : ''} /><span>${t('prop.byLayer')}</span></label>
      <input type="color" data-style="color" value="${color || '#3a6cf0'}" title="${escapeHtml(t('prop.color'))}" aria-label="${escapeHtml(t('prop.color'))}" ${color === null ? 'disabled' : ''} /></span></div>
    <label class="prop-row" title="${escapeHtml(t('prop.lineType'))}"><span class="prop-label">${icon('centerline')}${t('prop.lineType')}</span><select data-style="lineType" title="${escapeHtml(t('prop.lineType'))}">
      ${lineType === undefined ? '<option value="-">—</option>' : ''}<option value="" ${lineType === null ? 'selected' : ''}>${t('prop.byLayer')}</option>${LINE_TYPES.map((type) => `<option value="${type}" ${lineType === type ? 'selected' : ''}>${t(`lineType.${type}`)}</option>`).join('')}</select></label>
    <label class="prop-row" title="${escapeHtml(t('prop.lineWidth'))}"><span class="prop-label">${icon('line')}${t('prop.lineWidth')}</span><select data-style="lineWidth" title="${escapeHtml(t('prop.lineWidth'))}">
      ${lineWidth === undefined ? '<option value="-">—</option>' : ''}<option value="" ${lineWidth === null ? 'selected' : ''}>${t('prop.byLayer')}</option>${LINE_WIDTHS.map((w) => `<option value="${w}" ${lineWidth === w ? 'selected' : ''}>${w} mm</option>`).join('')}</select></label>`;
}

function measureRows(entity) {
  const m = measure(entity);
  const rows = [];
  const show = (key, value) => (key === 'area' || key === 'surface' || key.endsWith('Area') ? formatArea(value) : key === 'volume' ? formatVolume(value) : ['angle', 'sweep'].includes(key) ? `${fmt(value, 3)}°` : ['vertices', 'triangles', 'loops', 'count', 'windows', 'doors'].includes(key) ? fmt(value, 3) : formatLength(value));
  for (const [key, value] of Object.entries(m)) rows.push(readField(t(`measure.${key}`), show(key, value), 'measure'));
  return rows.join('');
}

function partRows(entity) {
  const def = PARTS[entity.kind];
  const rows = def.params.map((param) => {
    const label = t(`param.${param.key}`);
    const value = entity.params[param.key];
    if (param.type === 'bool') return `<label class="prop-row" title="${escapeHtml(label)}"><span class="prop-label">${escapeHtml(label)}</span><input type="checkbox" data-param="${param.key}" ${value ? 'checked' : ''} title="${escapeHtml(label)}" /></label>`;
    if (param.type === 'select') return `<label class="prop-row" title="${escapeHtml(label)}"><span class="prop-label">${escapeHtml(label)}</span><select data-param="${param.key}" title="${escapeHtml(label)}">${param.options.map((option) => `<option value="${option}" ${String(value) === String(option) ? 'selected' : ''}>${escapeHtml(optionIsWord(option) ? t(`opt.${option}`) : `${param.unit}${option}`)}</option>`).join('')}</select></label>`;
    if (param.type === 'text') return `<label class="prop-row" title="${escapeHtml(label)}"><span class="prop-label">${escapeHtml(label)}</span><input data-param="${param.key}" value="${escapeHtml(value)}" title="${escapeHtml(t('param.segmentsTip'))}" /></label>`;
    return numField(param.key, value, label, param.unit, 'data-param');
  }).join('');
  const info = Object.entries(partInfo(entity.kind, entity.params)).map(([key, value]) => readField(t(`info.${key}`), formatLength(value), 'measure')).join('');
  return `${rows}${info}`;
}

function textRows(entity) {
  const fonts = state.fonts ?? [];
  const fontOptions = [`<option value="">${escapeHtml(t('prop.fontDefault'))}</option>`, ...(entity.font && !fonts.includes(entity.font) ? [entity.font, ...fonts] : fonts).map((family) => `<option value="${escapeHtml(family)}" ${family === entity.font ? 'selected' : ''}>${escapeHtml(family)}</option>`)].join('');
  return `
    <label class="prop-block" title="${escapeHtml(t('prop.text'))}"><span class="prop-label">${icon('text')}${t('prop.text')}</span><textarea data-prop="text" rows="3" title="${escapeHtml(t('prop.text'))}">${escapeHtml(entity.text)}</textarea></label>
    <label class="prop-row" title="${escapeHtml(t('prop.font'))}"><span class="prop-label">${icon('font')}${t('prop.font')}</span><select data-prop="font" title="${escapeHtml(t('prop.font'))}">${fontOptions}</select></label>
    <div class="prop-row" title="${escapeHtml(t('prop.align'))}"><span class="prop-label">${t('prop.align')}</span><span class="segmented">${['left', 'center', 'right'].map((align) => `<button class="segment ${entity.align === align ? 'active' : ''}" data-text-align="${align}" title="${escapeHtml(t(`align.${align}`))}">${escapeHtml(t(`align.${align}`))}</button>`).join('')}</span></div>
    <div class="prop-row" title="${escapeHtml(t('prop.style'))}"><span class="prop-label">${t('prop.style')}</span><span class="prop-input">
      <label class="check-inline" title="${escapeHtml(t('prop.bold'))}"><input type="checkbox" data-prop-bool="bold" ${entity.bold ? 'checked' : ''} /><b>${t('prop.bold')}</b></label>
      <label class="check-inline" title="${escapeHtml(t('prop.italic'))}"><input type="checkbox" data-prop-bool="italic" ${entity.italic ? 'checked' : ''} /><i>${t('prop.italic')}</i></label></span></div>`;
}

function dimRows(entity) {
  return `
    <label class="prop-row" title="${escapeHtml(t('prop.dimKind'))}"><span class="prop-label">${icon('dimension')}${t('prop.dimKind')}</span><select data-prop="kind" title="${escapeHtml(t('prop.dimKind'))}">
      ${DIM_KINDS.filter((kind) => (['radius', 'diameter'].includes(entity.kind) ? ['radius', 'diameter'].includes(kind) : entity.kind === 'angle' ? kind === 'angle' : ['aligned', 'horizontal', 'vertical'].includes(kind))).map((kind) => `<option value="${kind}" ${entity.kind === kind ? 'selected' : ''}>${t(`dimKind.${kind}`)}</option>`).join('')}</select></label>
    ${readField(t('prop.measured'), dimText({ ...entity, text: '' }), 'measure')}
    <label class="prop-row" title="${escapeHtml(t('prop.dimTextTip'))}"><span class="prop-label">${icon('text')}${t('prop.dimText')}</span><input data-prop="text" value="${escapeHtml(entity.text)}" placeholder="${escapeHtml(t('prop.dimTextAuto'))}" title="${escapeHtml(t('prop.dimTextTip'))}" /></label>
    ${numField('size', entity.size, t('prop.textHeight'))}
    <label class="prop-row" title="${escapeHtml(t('prop.precision'))}"><span class="prop-label">${t('prop.precision')}</span><select data-prop="precision" title="${escapeHtml(t('prop.precision'))}">${[0, 1, 2, 3, 4].map((p) => `<option value="${p}" ${entity.precision === p ? 'selected' : ''}>${p === 0 ? '0' : `0.${'0'.repeat(p)}`}</option>`).join('')}</select></label>
    ${entity.kind === 'radius' || entity.kind === 'diameter' ? numField('angle', entity.angle, t('prop.leaderAngle'), '°') : ''}`;
}

function renderRight() {
  const outer = root.querySelector('#right-panel');
  root.querySelector('#workspace').classList.toggle('no-right', !state.settings.showRightPanel);
  const selection = selectedEntities();
  const title = selection.length === 1 ? t(`entity.${selection[0].type}`) : selection.length > 1 ? t('props.multi', { count: selection.length }) : t('props.drawing');
  if (!state.settings.showRightPanel) {
    outer.innerHTML = `<div class="panel-rail">
      <button class="rail-button" data-panel-toggle="right" title="${escapeHtml(t('panel.expandRight'))}" aria-label="${escapeHtml(t('panel.expandRight'))}">${icon('chevronLeft')}<span class="rail-label">${escapeHtml(t('rail.expand'))}</span></button>
      <div class="rail-title" title="${escapeHtml(t('panel.rightTitle'))}">${icon('panelRight')}<span>${escapeHtml(t('panel.rightShort'))}</span></div>
      <button class="rail-button active" data-panel-section="right:props" title="${escapeHtml(`${t('panel.properties')}: ${title}`)}" aria-label="${escapeHtml(t('panel.properties'))}">${icon('edit')}<span class="rail-label">${escapeHtml(title)}</span></button>
    </div>`;
    return;
  }
  const focused = document.activeElement?.closest?.('#right-panel') ? document.activeElement.dataset?.prop ?? document.activeElement.dataset?.param ?? document.activeElement.dataset?.drawing : null;
  outer.innerHTML = `<div class="panel-header">${icon('panelRight')}<span>${t('panel.rightTitle')}</span>
      <button class="icon-button" data-panel-toggle="right" title="${escapeHtml(t('panel.collapseRight'))}" aria-label="${escapeHtml(t('panel.collapseRight'))}">${icon('chevronRight')}</button></div><div class="panel-scroll panel-content"></div>`;
  renderRightContent(outer.querySelector('.panel-content'), selection);
  if (focused) {
    const input = outer.querySelector(`[data-prop="${focused}"], [data-param="${focused}"], [data-drawing="${focused}"]`);
    if (input && input.tagName !== 'SELECT') { input.focus(); input.setSelectionRange?.(input.value.length, input.value.length); }
  }
}

function renderRightContent(panel, selection) {
  const drawing = activeDrawing();
  if (!drawing) { panel.innerHTML = ''; return; }
  const head = (glyph, title) => `<h3>${icon(glyph)}<span>${escapeHtml(title)}</span></h3>`;
  renderRightContentInner(panel, selection, drawing, head);
  // The picked faces, edges and vertices (FreeCAD: Box › Face3).
  if (state.elements?.length) {
    panel.insertAdjacentHTML('afterbegin', `<section class="panel-section props elements-list" data-props="elements">${head('selectFace', t('part.elements', { count: state.elements.length }))}
      <ul class="element-rows">${state.elements.map((el) => `<li>${icon(el.kind === 'face' ? 'selectFace' : el.kind === 'edge' ? 'selectEdge' : 'selectVertex')}<span>${escapeHtml(`${labelOf(D.findEntity(drawing, el.id) ?? { type: 'solid', name: el.id })} › ${elementName(el.kind, el.index)}`)}</span></li>`).join('')}</ul></section>`);
  }
}

function renderRightContentInner(panel, selection, drawing, head) {
  if (state.lightSelected && state.view3d) {
    const l = state.settings.light;
    const check = (key, label) => `<label class="prop-row" title="${escapeHtml(label)}"><span class="prop-label">${escapeHtml(label)}</span><input type="checkbox" data-light-bool="${key}" ${l[key] ? 'checked' : ''} title="${escapeHtml(label)}" /></label>`;
    panel.innerHTML = `<section class="panel-section props" data-props="light">
      ${head(l.on ? 'light' : 'lightOff', t('light.title'))}
      ${check('on', t('light.on'))}
      ${numField('azimuth', l.azimuth, t('light.azimuth'), '°', 'data-light')}
      ${numField('elevation', l.elevation, t('light.elevation'), '°', 'data-light')}
      ${numField('intensity', l.intensity, t('light.intensity'), '×', 'data-light')}
      <label class="prop-row" title="${escapeHtml(t('light.color'))}"><span class="prop-label">${icon('palette')}${t('light.color')}</span><input type="color" data-light="color" value="${l.color}" title="${escapeHtml(t('light.color'))}" /></label>
      ${check('shadows', t('light.shadows'))}
      <p class="panel-hint">${t('light.hint')}</p>
      <div class="prop-actions"><button class="small-button" data-light-reset title="${escapeHtml(t('light.reset'))}">${icon('undo')}<span>${t('light.reset')}</span></button></div>
    </section>`;
    return;
  }
  if (selection.length === 1) {
    const entity = selection[0];
    const glyph = entity.type === 'part' ? PARTS[entity.kind].icon : entity.type === 'solid' ? SOLID_ICONS[entity.kind] : entity.type === 'dim' ? 'dimension' : TOOL_ICONS[entity.type] ?? 'line';
    const fields = (GEOMETRY_FIELDS[entity.type] ?? []).map(([key, label, unit]) => numField(key, entity[key], t(label), unit ?? 'mm')).join('');
    const extra = ['polyline', 'spline', 'leader'].includes(entity.type)
      ? `${entity.type === 'leader' ? leaderRows(entity)
        : `<label class="prop-row" title="${escapeHtml(t('prop.closed'))}"><span class="prop-label">${t('prop.closed')}</span><input type="checkbox" data-prop-bool="closed" ${entity.closed ? 'checked' : ''} title="${escapeHtml(t('prop.closed'))}" /></label>`}
         ${entity.type === 'spline' ? readField(t('prop.degree'), String(entity.degree), 'spline') : ''}
         <div class="vertex-list">${entity.points.slice(0, 40).map((p, i) => `<div class="vertex-row"><small>${i + 1}</small><input class="num" data-vertex="${i}:x" data-length="1" value="${lengthText(p.x)}" title="X${i + 1} (${unitLabel()})" /><input class="num" data-vertex="${i}:y" data-length="1" value="${lengthText(p.y)}" title="Y${i + 1} (${unitLabel()})" /></div>`).join('')}</div>`
      : entity.type === 'hatch' ? `<label class="prop-row" title="${escapeHtml(t('option.hatchPattern'))}"><span class="prop-label">${icon('hatch')}${t('option.hatchPattern')}</span><select data-prop="pattern" title="${escapeHtml(t('option.hatchPattern'))}">${HATCH_PATTERN_NAMES.map((name) => `<option value="${name}" ${entity.pattern === name ? 'selected' : ''}>${escapeHtml(t(`hatch.${name}`))}</option>`).join('')}</select></label>${readField(t('prop.loops'), String(entity.loops.length), 'polygon')}`
      : entity.type === 'circle' ? `<label class="prop-row" title="${escapeHtml(t('prop.centerMark'))}"><span class="prop-label">${t('prop.centerMark')}</span><input type="checkbox" data-prop-bool="centerMark" ${entity.centerMark ? 'checked' : ''} title="${escapeHtml(t('prop.centerMark'))}" /></label>`
        : entity.type === 'text' ? textRows(entity)
          : entity.type === 'dim' ? dimRows(entity)
            : entity.type === 'part' ? `<h4>${icon('gear')}<span>${escapeHtml(t(`part.${entity.kind}`))}</span></h4>${partRows(entity)}`
              : entity.type === 'solid' ? `<h4>${icon(SOLID_ICONS[entity.kind])}<span>${escapeHtml(t(`solid.${entity.kind}`))}</span></h4>${solidRows(entity)}` : '';
    panel.innerHTML = `<section class="panel-section props" data-props="${entity.type}">
      ${head(glyph, t(`entity.${entity.type}`))}
      ${styleRows(drawing, [entity])}
      <h4>${icon('measure')}<span>${t('props.geometry')}</span></h4>
      ${entity.clone ? cloneRows(entity) : `${fields}${extra}`}
      ${entity.type !== 'solid' ? `<label class="prop-row" title="${escapeHtml(t('tip.construction'))}"><span class="prop-label">${icon('construction')}${t('action.construction')}</span><input type="checkbox" data-prop-bool="construction" ${entity.construction ? 'checked' : ''} title="${escapeHtml(t('tip.construction'))}" /></label>` : ''}
      ${bindRows(entity)}
      ${jointRows(entity)}
      ${constraintRows(entity)}
      ${measureRows(entity)}
      <div class="prop-actions">
        ${entity.type === 'part' ? `<button class="small-button" data-command="editPart" title="${escapeHtml(t('action.editPart'))}">${icon('part')}<span>${t('action.editPart')}</span></button>` : ''}
        ${entity.type === 'solid' ? `<button class="small-button" data-command="editSolid" title="${escapeHtml(t('action.editSolid'))}">${icon('solidEdit')}<span>${t('action.editSolid')}</span></button>` : ''}
        ${canExplode(entity) ? `<button class="small-button" data-command="explode" title="${escapeHtml(commandTip('explode'))}">${icon('explode')}<span>${t('action.explode')}</span></button>` : ''}
        <button class="small-button" data-command="duplicate" title="${escapeHtml(commandTip('duplicate'))}">${icon('duplicate')}<span>${t('action.duplicate')}</span></button>
        <button class="small-button danger" data-command="delete" title="${escapeHtml(commandTip('delete'))}">${icon('trash')}<span>${t('action.delete')}</span></button>
      </div>
    </section>`;
    return;
  }
  if (selection.length > 1) {
    const box = boxOfEntities(selection);
    panel.innerHTML = `<section class="panel-section props" data-props="multi">
      ${head('selectAll', t('props.multi', { count: selection.length }))}
      ${styleRows(drawing, selection)}
      ${readField(t('measure.totalLength'), formatLength(totalLength(selection)), 'measure')}
      ${box ? readField(t('measure.extent'), `${lengthValue(boxWidth(box))} × ${lengthValue(boxHeight(box))} ${unitLabel()}`, 'zoomFit') : ''}
      <div class="prop-actions">
        <button class="small-button" data-command="array" title="${escapeHtml(t('action.array'))}">${icon('array')}<span>${t('action.array')}</span></button>
        <button class="small-button" data-command="explode" title="${escapeHtml(commandTip('explode'))}" ${commandEnabled('explode') ? '' : 'disabled'}>${icon('explode')}<span>${t('action.explode')}</span></button>
        <button class="small-button" data-command="duplicate" title="${escapeHtml(commandTip('duplicate'))}">${icon('duplicate')}<span>${t('action.duplicate')}</span></button>
        <button class="small-button danger" data-command="delete" title="${escapeHtml(commandTip('delete'))}">${icon('trash')}<span>${t('action.delete')}</span></button>
      </div>
    </section>`;
    return;
  }
  const s = D.stats(drawing);
  const field = (key, label, value, glyph) => `<label class="prop-row" title="${escapeHtml(label)}"><span class="prop-label">${icon(glyph)}${escapeHtml(label)}</span><input data-drawing="${key}" value="${escapeHtml(value)}" title="${escapeHtml(label)}" /></label>`;
  panel.innerHTML = `<section class="panel-section props" data-props="drawing">
    ${head('drawing', t('props.drawing'))}
    ${field('title', t('prop.title'), drawing.title, 'edit')}
    ${field('author', t('prop.author'), drawing.author, 'user')}
    <label class="prop-block" title="${escapeHtml(t('prop.description'))}"><span class="prop-label">${icon('list')}${t('prop.description')}</span><textarea data-drawing="description" rows="3" title="${escapeHtml(t('prop.description'))}">${escapeHtml(drawing.description)}</textarea></label>
      ${numField('gridSize', drawing.grid.size, t('prop.gridSize'), 'mm', 'data-drawing-num')}
      <h4>${icon('workPlane')}<span>${t('wp.title')}</span></h4>
      ${drawing.workPlane?.frame ? `<p class="panel-hint" id="wp-face">${escapeHtml(t('wp.onFace', { x: fmt(drawing.workPlane.frame.origin[0], 1), y: fmt(drawing.workPlane.frame.origin[1], 1), z: fmt(drawing.workPlane.frame.origin[2], 1), n: drawing.workPlane.frame.z.map((v) => fmt(v, 2)).join(', ') }))}</p>` : ''}
      ${numField('wp.x', drawing.workPlane?.x ?? 0, t('wp.x'), 'mm', 'data-drawing-wp')}${numField('wp.y', drawing.workPlane?.y ?? 0, t('wp.y'), 'mm', 'data-drawing-wp')}${numField('wp.angle', drawing.workPlane?.angle ?? 0, t('wp.angle'), '°', 'data-drawing-wp')}${numField('wp.z', drawing.workPlane?.z ?? 0, t('wp.z'), 'mm', 'data-drawing-wp')}
      <div class="prop-actions"><button class="small-button" data-command="tool:workPlane" title="${escapeHtml(t('tool.workPlane'))}">${icon('workPlane')}<span>${t('wp.pick')}</span></button><button class="small-button" data-command="workPlaneFace" title="${escapeHtml(t('tip.workPlaneFace'))}">${icon('solidBox')}<span>${t('wp.face')}</span></button><button class="small-button" data-command="workPlaneReset" title="${escapeHtml(t('action.workPlaneReset'))}" ${drawing.workPlane ? '' : 'disabled'}>${icon('home')}<span>${t('wp.reset')}</span></button></div>
    <h4>${icon('pageSetup')}<span>${t('props.titleBlock')}</span></h4>
    ${field('sheet.number', t('prop.number'), drawing.sheet.number, 'list')}
    ${field('sheet.material', t('prop.material'), drawing.sheet.material, 'part')}
    ${field('sheet.company', t('prop.company'), drawing.sheet.company, 'info')}
    <h4>${icon('info')}<span>${t('props.stats')}</span></h4>
    ${readField(t('stats.entities'), String(s.entities), 'list')}
    ${readField(t('stats.layers'), String(s.layers), 'layers')}
    ${s.box ? readField(t('measure.extent'), `${lengthValue(boxWidth(s.box))} × ${lengthValue(boxHeight(s.box))} ${unitLabel()}`, 'zoomFit') : ''}
    ${readField(t('prop.created'), new Date(drawing.created).toLocaleString(), 'recent')}
    ${readField(t('prop.updated'), new Date(drawing.updated).toLocaleString(), 'recent')}
    <p class="panel-hint">${t('props.hint')}</p>
  </section>`;
}

function focusProperty(field) {
  if (!state.settings.showRightPanel) updateSettings({ showRightPanel: true });
  const input = root.querySelector(`#right-panel [data-prop="${field}"], #right-panel [data-drawing="${field}"]`);
  input?.focus();
  input?.select?.();
}

function focusProperties() {
  if (!state.settings.showRightPanel) updateSettings({ showRightPanel: true });
  root.querySelector('#right-panel input, #right-panel textarea')?.focus();
}

/** A property field changed: updates the selected entities as one undo step. */
function onPropertyChange(target) {
  const drawing = activeDrawing();
  if (!drawing) return;
  const ids = selectedIds();
  const number = (text) => {
    const value = target.dataset.length ? evaluateLength(text) : evaluate(text);
    if (!Number.isFinite(value)) {
      notify('error', t('notice.badNumber', { text }));
      renderRight();
      return null;
    }
    return value;
  };
  if (target.dataset.style) {
    const key = target.dataset.style;
    if (key === 'layer') { if (target.value) change('op.style', (d) => D.moveToLayer(d, ids, target.value)); return; }
    let patch;
    if (key === 'colorByLayer') patch = { color: target.checked ? null : root.querySelector('#right-panel [data-style="color"]')?.value ?? '#3a6cf0' };
    else if (key === 'color') patch = { color: target.value };
    else if (key === 'lineType') { if (target.value === '-') return; patch = { lineType: target.value || null }; }
    else if (key === 'lineWidth') { if (target.value === '-') return; patch = { lineWidth: target.value ? Number(target.value) : null }; }
    change('op.style', (d) => ids.forEach((id) => D.updateEntity(d, id, patch)));
    return;
  }
  if (target.dataset.prop) {
    const key = target.dataset.prop;
    const entity = D.findEntity(drawing, ids[0]);
    if (!entity) return;
    let value = target.value;
    if (target.classList.contains('num')) { value = number(target.value); if (value === null) return; }
    else if (key === 'precision') value = Number(value);
    if (entity[key] === value) return;
    change('op.edit', (d) => D.updateEntity(d, entity.id, { [key]: value }));
    return;
  }
  if (target.dataset.propBool) {
    change('op.edit', (d) => D.updateEntity(d, ids[0], { [target.dataset.propBool]: target.checked }));
    return;
  }
  if (target.dataset.vertex) {
    const [index, axis] = target.dataset.vertex.split(':');
    const value = number(target.value);
    if (value === null) return;
    const entity = D.findEntity(drawing, ids[0]);
    const points = entity.points.map((p, i) => (i === Number(index) ? { ...p, [axis]: value } : p));
    change('op.edit', (d) => D.updateEntity(d, entity.id, { points }));
    return;
  }
  if (target.dataset.param) {
    const entity = D.findEntity(drawing, ids[0]);
    if (!entity || entity.type !== 'part') return;
    const param = PARTS[entity.kind].params.find((item) => item.key === target.dataset.param);
    let value = target.type === 'checkbox' ? target.checked : target.value;
    if (param.type === 'number' || param.type === 'int') { value = number(target.value); if (value === null) return; }
    change('op.editPart', (d) => D.updateEntity(d, entity.id, { params: { ...entity.params, [param.key]: value } }));
    return;
  }
  if (target.dataset.light) {
    const key = target.dataset.light;
    if (key === 'color') { setLightOptions({ color: target.value }); return; }
    const value = number(target.value);
    if (value === null) return;
    setLightOptions({ [key]: value });
    return;
  }
  if (target.dataset.lightBool) { setLightOptions({ [target.dataset.lightBool]: target.checked }); return; }
  if (target.dataset.solidLevel) {
    const entity = D.findEntity(drawing, ids[0]);
    if (!entity) return;
    const from = D.levelOf(drawing, entity)?.elevation ?? 0;
    const level = drawing.bim?.levels.find((item) => item.id === target.value) ?? null;
    change('op.level', (d) => D.updateEntity(d, entity.id, { level: level?.id ?? null, z: (entity.z ?? 0) - from + (level?.elevation ?? 0) }));
    return;
  }
  if (target.dataset.solidMaterial) {
    const entity = D.findEntity(drawing, ids[0]);
    if (!entity) return;
    const material = drawing.bim?.materials.find((item) => item.id === target.value) ?? null;
    change('op.material', (d) => D.updateEntity(d, entity.id, { material: material ? { ...material } : null }));
    return;
  }
  if (target.dataset.jointDrive) {
    const [id, part] = target.dataset.jointDrive.split(':');
    const value = number(target.value);
    if (value === null) return;
    setJointDrive(id, part, value);
    return;
  }
  if (target.dataset.jointFollow !== undefined) { setJointFollow(target.dataset.jointFollow, target.value || null); return; }
  if (target.dataset.jointRatio) {
    const value = number(target.value);
    if (value === null) return;
    setJointFollow(target.dataset.jointRatio, undefined, value);
    return;
  }
  if (target.dataset.jointValue) {
    const [id, key] = target.dataset.jointValue.split(':');
    const value = number(target.value);
    if (value === null) return;
    setJoint(id, { [key]: value });
    return;
  }
  if (target.dataset.solidParam) {
    const entity = D.findEntity(drawing, ids[0]);
    if (!entity || entity.type !== 'solid') return;
    // "=expression" binds the value to the spreadsheet (FreeCAD expression); a plain value unbinds it.
    const text = target.value.trim();
    const bound = text.startsWith('=');
    const value = number(bound ? text.slice(1) : text);
    if (value === null) return;
    const key = `params.${target.dataset.solidParam}`;
    const bind = { ...(entity.bind ?? {}) };
    if (bound) bind[key] = text.slice(1); else delete bind[key];
    change('op.editSolid', (d) => D.updateEntity(d, entity.id, { params: { ...entity.params, [target.dataset.solidParam]: value }, bind }));
    return;
  }
  if (target.dataset.drawing) {
    const key = target.dataset.drawing;
    change('op.editDrawing', (d) => {
      if (key.startsWith('sheet.')) d.sheet[key.slice(6)] = target.value;
      else d[key] = target.value;
      d.updated = new Date().toISOString();
    });
    if (key === 'title') renderTabs();
    return;
  }
  if (target.dataset.constraintValue) {
    const c = activeDrawing()?.constraints?.find((k) => k.id === target.dataset.constraintValue);
    const value = UNITLESS.includes(c?.type) ? Number(evaluate(target.value)) : number(target.value);
    if (!c || !Number.isFinite(value) || value < 0) return;
    change('op.constrain', (d) => { d.constraints.find((k) => k.id === c.id).value = value; });
    if (activeDoc()?.constraintStatus?.status === 'conflict') notify('error', t('constraint.conflict'));
    return;
  }
  if (target.dataset.drawingWp) {
    const value = number(target.value);
    if (value === null) return;
    const key = target.dataset.drawingWp.replace('wp.', '');
    change('op.workPlane', (d) => {
      const wp = { x: 0, y: 0, angle: 0, z: 0, ...(d.workPlane ?? {}), [key]: value };
      if (isGlobal(wp)) delete d.workPlane; else d.workPlane = D.normalizeDrawing({ workPlane: wp }).workPlane;
    });
    return;
  }
  if (target.dataset.drawingNum) {
    const value = number(target.value);
    if (value === null || value <= 0) return;
    change('op.editDrawing', (d) => { d.grid.size = Math.min(1000, value); });
  }
}

// ───────────────────────── problems panel
// What is wrong in the active drawing (domain/check.js), listed under the
// canvas; checked again a moment after every change. A row selects the
// entities and shows them; the severity chips filter the list.

let problemsTimer = 0;
function scheduleProblems() {
  clearTimeout(problemsTimer);
  problemsTimer = setTimeout(checkProblems, 250);
}

function checkProblems() {
  const doc = activeDoc();
  try {
    state.problems.list = doc ? checkDrawing(doc.drawing) : [];
  } catch (error) {
    state.problems.list = [];
    showError('error.unexpected', error, 'check');
  }
  state.problems.doc = doc?.id ?? null;
  renderProblems();
  renderConsole();
  renderStatus();
}

function problemText(finding) {
  const params = { ...finding.params };
  if (typeof params.gap === 'number') params.gap = formatLength(params.gap, undefined, params.gap < 0.1 ? 3 : 2);
  if (params.type) params.type = t(`entity.${params.type}`);
  if (finding.code === 'zeroLength' || finding.code === 'degenerateOutline') {
    const entity = activeDrawing()?.entities.find((e) => e.id === finding.ids[0]);
    params.type = entity ? t(`entity.${entity.type}`) : '';
  }
  return t(`problems.${finding.code}`, params);
}

// ───────────────────────── script console and macros (FreeCAD Python console / macros)

const consoleState = { log: [], history: [], at: -1, code: '', recording: null, running: false };

/** One line in the console output. */
function consoleLog(kind, text) {
  consoleState.log.push({ kind, text: String(text) });
  if (consoleState.log.length > 400) consoleState.log.splice(0, consoleState.log.length - 400);
  const out = root.querySelector('#console-output');
  if (out) {
    out.insertAdjacentHTML('beforeend', `<div class="console-line ${kind}">${escapeHtml(String(text))}</div>`);
    out.scrollTop = out.scrollHeight;
  }
}

const show = (value) => {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, (k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v)); } catch { return String(value); }
};

/** The `cad` object scripts and macros use: each change is one undo step. */
function scriptApi() {
  const doc = () => {
    const d = activeDoc();
    if (!d) throw new Error(t('console.noDrawing'));
    return d;
  };
  const ids = (v) => (Array.isArray(v) ? v : [v]).map((x) => (typeof x === 'object' && x ? x.id : x));
  const add = (type, data = {}) => {
    const made = change('op.script', (d) => D.addEntity(d, type, { layer: d.activeLayer, ...data }));
    if (!made) throw new Error(t('console.badEntity', { type }));
    return made.id;
  };
  const api = {
    version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '',
    units: 'mm',
    print: (...values) => consoleLog('out', values.map(show).join(' ')),
    entities: (type) => structuredClone(doc().drawing.entities.filter((e) => !type || e.type === type)),
    get: (id) => structuredClone(D.findEntity(doc().drawing, id) ?? null),
    add,
    line: (x1, y1, x2, y2) => add('line', { x1, y1, x2, y2 }),
    circle: (cx, cy, r) => add('circle', { cx, cy, r }),
    arc: (cx, cy, r, start, end) => add('arc', { cx, cy, r, start, end }),
    rect: (x, y, width, height) => add('rect', { x, y, width, height }),
    polyline: (points, closed = false) => add('polyline', { points: points.map((p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : p)), closed }),
    point: (x, y) => add('point', { x, y }),
    text: (x, y, text, size) => add('text', { x, y, text, ...(size ? { size } : {}) }),
    solid: (kind, params = {}, place = {}) => add('solid', { kind, name: t(`solid.${kind}`), params, ...place }),
    update: (id, patch) => { change('op.script', (d) => D.updateEntity(d, id, patch)); return id; },
    remove: (v) => change('op.script', (d) => D.removeEntities(d, ids(v))),
    move: (v, dx, dy) => change('op.script', (d) => D.transformEntities(d, ids(v), { type: 'move', dx, dy })).map((e) => e.id),
    copy: (v, dx, dy) => change('op.script', (d) => D.transformEntities(d, ids(v), { type: 'move', dx, dy }, { copy: true })).map((e) => e.id),
    rotate: (v, cx, cy, angle) => change('op.script', (d) => D.transformEntities(d, ids(v), { type: 'rotate', cx, cy, angle })).map((e) => e.id),
    scale: (v, cx, cy, factor) => change('op.script', (d) => D.transformEntities(d, ids(v), { type: 'scale', cx, cy, factor })).map((e) => e.id),
    constrain: (type, refs, value) => change('op.constrain', (d) => addConstraint(d, type, refs, value ?? null))?.id ?? null,
    status: () => structuredClone(activeDoc()?.constraintStatus ?? null),
    select: (v) => { select(ids(v ?? [])); return selectedIds(); },
    selection: () => selectedIds(),
    measure: (id) => { const e = D.findEntity(doc().drawing, id); return e ? measure(e) : null; },
    // Volume, area and size of a solid description (exact with the OpenCASCADE kernel).
    properties: (spec) => solidProperties(normalizeEntity({ type: 'solid', ...spec })),
    run: (id) => {
      if (!commands[id]) throw new Error(t('console.noCommand', { id }));
      return run(id);
    },
    commands: () => Object.keys(commands),
    undo: () => run('undo'),
    redo: () => run('redo'),
    zoomFit: () => run('zoomFit'),
  };
  return Object.freeze(api);
}

/** Where Python's files are: next to the app (dist/pyodide) or, while developing, in node_modules. */
const pythonHome = () => (import.meta.env.DEV ? new URL('/node_modules/pyodide/', location.href).href : new URL('./pyodide/', location.href).href);

/** Python (Pyodide) — loaded on first use; the console says so while it loads. */
async function ensurePython() {
  if (pythonReady()) return true;
  consoleLog('info', t('console.pythonLoading'));
  try { await loadPython(pythonHome()); consoleLog('info', t('console.pythonReady')); return true; } catch (error) { consoleLog('error', t('console.pythonFailed', { error: error?.message ?? error })); return false; }
}

/** Runs script text — JavaScript with `cad`, or Python with `mycad` and the FreeCAD / Part modules. */
async function runScript(code, { echo = true, language = state.settings.consoleLanguage } = {}) {
  const text = String(code ?? '').trim();
  if (!text) return undefined;
  if (echo) consoleLog('in', text);
  if (language === 'python') {
    if (!(await ensurePython())) return undefined;
    consoleState.running = true;
    try {
      const value = await runPython(text, scriptApi(), (kind, line) => consoleLog(kind, line));
      if (value !== undefined) consoleLog('value', value);
      return value;
    } catch (error) {
      // The last lines of the Python traceback are the useful ones.
      consoleLog('error', String(error?.message ?? error).trim().split('\n').slice(-3).join('\n'));
      return undefined;
    } finally {
      consoleState.running = false;
    }
  }
  consoleState.running = true;
  try {
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    const api = scriptApi();
    // A lone expression returns its value (as in a REPL); statements run as they are.
    let fn;
    try { fn = new AsyncFunction('cad', 'print', `"use strict";\nreturn (${text}\n);`); } catch { fn = new AsyncFunction('cad', 'print', `"use strict";\n${text}`); }
    const value = await fn(api, api.print);
    if (value !== undefined) consoleLog('value', show(value));
    return value;
  } catch (error) {
    consoleLog('error', `${error?.name ?? 'Error'}: ${error?.message ?? error}`);
    return undefined;
  } finally {
    consoleState.running = false;
  }
}

// ───────────────────────── macro debugger (Std_MacroStartDebug, StepInto, StepOver, StopDebug, ToggleBreakpoint)

/** The editor line the caret is on (1-based). */
function caretLine() {
  const code = root.querySelector('#console-code');
  if (!code) return 1;
  return code.value.slice(0, code.selectionStart).split('\n').length;
}

/** Std_ToggleBreakpoint: a breakpoint on the editor's current line. */
function toggleBreakpoint() {
  if (!state.settings.showConsole) updateSettings({ showConsole: true });
  const line = caretLine();
  consoleState.breakpoints ??= new Set();
  if (consoleState.breakpoints.has(line)) consoleState.breakpoints.delete(line); else consoleState.breakpoints.add(line);
  renderConsole();
}

/** Std_MacroStartDebug: runs the editor's Python under the tracer, then stops at the first breakpoint (or the first line). A running session continues to the next breakpoint. */
async function startDebug() {
  if (consoleState.debug) return debugMove('continue');
  if (!state.settings.showConsole) updateSettings({ showConsole: true });
  const code = (root.querySelector('#console-code')?.value ?? consoleState.code ?? '').replace(/\s+$/, '');
  if (!code.trim()) { notify('info', t('debug.nothing')); return undefined; }
  if (state.settings.consoleLanguage !== 'python') updateSettings({ consoleLanguage: 'python' });
  if (!(await ensurePython())) return undefined;
  consoleLog('info', t('debug.started'));
  consoleState.running = true;
  try {
    const { steps, error } = await tracePython(code, scriptApi(), (kind, line) => consoleLog(kind, line));
    const lines = steps.filter((s) => s.event === 'line');
    if (!lines.length) { consoleLog(error ? 'error' : 'info', error ?? t('debug.noLines')); return undefined; }
    const first = steps.findIndex((s) => s.event === 'line');
    const stop = nextStep(steps, first - 1, 'continue', consoleState.breakpoints ?? new Set());
    consoleState.debug = { steps, at: stop >= 0 ? stop : first, code: code.split('\n'), error };
    if (error) consoleLog('error', error.trim().split('\n').slice(-2).join('\n'));
    renderConsole();
    showDebugLine();
  } finally {
    consoleState.running = false;
  }
  return undefined;
}

function debugMove(how) {
  const debug = consoleState.debug;
  if (!debug) return;
  const next = nextStep(debug.steps, debug.at, how, consoleState.breakpoints ?? new Set());
  if (next < 0) { consoleLog('info', t('debug.finished')); stopDebug(); return; }
  debug.at = next;
  renderConsole();
  showDebugLine();
}

function stopDebug() {
  if (!consoleState.debug) return;
  consoleState.debug = null;
  consoleLog('info', t('debug.stopped'));
  renderConsole();
}

/** The current line selected in the editor. */
function showDebugLine() {
  const debug = consoleState.debug;
  const code = root.querySelector('#console-code');
  if (!debug || !code) return;
  const line = debug.steps[debug.at].line;
  const lines = code.value.split('\n');
  const start = lines.slice(0, line - 1).reduce((sum, l) => sum + l.length + 1, 0);
  code.focus();
  code.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
}

function debugPanelHtml() {
  const breakpoints = [...(consoleState.breakpoints ?? [])].sort((a, b) => a - b);
  const debug = consoleState.debug;
  if (!debug && !breakpoints.length) return '';
  const step = debug?.steps[debug.at];
  const locals = step ? Object.entries(step.locals) : [];
  return `<div class="debug-panel" id="debug-panel">
    <div class="debug-head">${icon('debug')}<b>${escapeHtml(t('debug.title'))}</b>
      ${breakpoints.length ? `<span class="muted">${escapeHtml(t('debug.breakpoints', { lines: breakpoints.join(', ') }))}</span>` : ''}
      ${debug ? `<span class="debug-where">${escapeHtml(t('debug.where', { line: step.line, fn: step.fn === '<module>' ? '—' : step.fn, step: debug.at + 1, total: debug.steps.length }))}</span>` : ''}
      <span class="grow"></span>
      ${['macroStartDebug', 'macroStepInto', 'macroStepOver', 'macroStopDebug', 'toggleBreakpoint'].map((id) => `<button type="button" class="icon-button" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(commands[id].label))}" ${commandEnabled(id) ? '' : 'disabled'}>${icon(commands[id].icon)}</button>`).join('')}
    </div>
    ${debug ? `<code class="debug-line">${escapeHtml(debug.code[step.line - 1] ?? '')}</code>
    <div class="debug-locals">${locals.length ? locals.map(([k, v]) => `<span><b>${escapeHtml(k)}</b> = ${escapeHtml(v)}</span>`).join('') : `<span class="muted">${escapeHtml(t('debug.noLocals'))}</span>`}</div>` : ''}
  </div>`;
}

/** Macro recording: commands run from the UI and objects added are written as `cad.*` lines. */
function recordCommand(id) {
  if (!consoleState.recording || consoleState.running || ['console', 'macroRecord'].includes(id)) return;
  consoleState.recording.push(state.settings.consoleLanguage === 'python' ? `mycad.run(${JSON.stringify(id)})` : `await cad.run(${JSON.stringify(id)});`);
}

function recordAdded(before, after) {
  if (!consoleState.recording || consoleState.running) return;
  const had = new Set(before);
  for (const e of after) {
    if (had.has(e.id)) continue;
    const { id, ...data } = e;
    for (const key of Object.keys(data)) if (data[key] === null) delete data[key];
    const { type, ...rest } = data;
    consoleState.recording.push(state.settings.consoleLanguage === 'python' ? `mycad.add(${JSON.stringify(type)}, mycad.obj(${JSON.stringify(JSON.stringify(rest))}))` : `cad.add(${JSON.stringify(type)}, ${JSON.stringify(rest)});`);
  }
}

function toggleRecording() {
  if (consoleState.recording) {
    const lines = consoleState.recording;
    consoleState.recording = null;
    const python = state.settings.consoleLanguage === 'python';
    consoleState.code = [`${python ? '#' : '//'} ${t('console.recordedAt', { time: new Date().toLocaleString() })}`, ...(python ? ['import mycad'] : []), ...lines].join('\n');
    consoleLog('info', t('console.recorded', { count: lines.length }));
    const editor = root.querySelector('#console-code');
    if (editor) editor.value = consoleState.code;
  } else {
    consoleState.recording = [];
    consoleLog('info', t('console.recording'));
  }
  renderConsole();
}

function saveMacro() {
  const code = root.querySelector('#console-code')?.value ?? consoleState.code;
  if (!code.trim()) return notify('info', t('console.emptyMacro'));
  const name = (root.querySelector('#console-macro-name')?.value || '').trim() || t('console.macroName', { n: state.settings.macros.length + 1 });
  const macros = [...state.settings.macros.filter((m) => m.name !== name), { name, code, language: state.settings.consoleLanguage }];
  updateSettings({ macros });
  notify('success', t('console.macroSaved', { name }));
  renderConsole();
}

async function runMacro(name) {
  const macro = state.settings.macros.find((m) => m.name === name);
  if (!macro) return undefined;
  // Std_RecentMacros: the last ten run, newest first.
  updateSettings({ recentMacros: [name, ...(state.settings.recentMacros ?? []).filter((n) => n !== name)].slice(0, 10) });
  consoleLog('info', t('console.runMacro', { name }));
  return runScript(macro.code, { echo: false, language: macro.language });
}

function renderConsole() {
  const panel = root.querySelector('#console-panel');
  if (!panel) return;
  const show = Boolean(state.settings.showConsole && !state.home);
  panel.hidden = !show;
  if (!show) return;
  const typed = root.querySelector('#console-code')?.value;
  if (typed !== undefined) consoleState.code = typed;
  const macros = state.settings.macros;
  panel.innerHTML = `
    <header class="problems-head console-head">
      ${icon('console')}<b>${escapeHtml(t('console.title'))}</b>
      <span class="segmented console-language" role="group" aria-label="${escapeHtml(t('console.language'))}">${['js', 'python'].map((lang) => `<button type="button" class="segment ${state.settings.consoleLanguage === lang ? 'active' : ''}" data-console="lang:${lang}" title="${escapeHtml(t(`console.lang.${lang}Tip`))}">${escapeHtml(t(`console.lang.${lang}`))}</button>`).join('')}</span>
      <button type="button" class="small-button ${consoleState.recording ? 'recording' : ''}" data-console="record" title="${escapeHtml(t(consoleState.recording ? 'console.stopTip' : 'console.recordTip'))}">${icon(consoleState.recording ? 'stop' : 'record')}<span>${escapeHtml(t(consoleState.recording ? 'console.stop' : 'console.record'))}</span></button>
      <select id="console-macros" title="${escapeHtml(t('console.macros'))}" aria-label="${escapeHtml(t('console.macros'))}"><option value="">${escapeHtml(t('console.macros'))} (${macros.length})</option>${macros.map((m) => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}${m.language === 'python' ? ' (Python)' : ''}</option>`).join('')}</select>
      <button type="button" class="icon-button" data-console="macro-run" title="${escapeHtml(t('console.macroRun'))}" aria-label="${escapeHtml(t('console.macroRun'))}">${icon('play')}</button>
      <button type="button" class="icon-button" data-console="macro-load" title="${escapeHtml(t('console.macroLoad'))}" aria-label="${escapeHtml(t('console.macroLoad'))}">${icon('edit')}</button>
      <button type="button" class="icon-button" data-command="addons" title="${escapeHtml(commandTip('addons'))}" aria-label="${escapeHtml(t('action.addons'))}">${icon('part')}</button>
      <button type="button" class="icon-button" data-console="macro-delete" title="${escapeHtml(t('console.macroDelete'))}" aria-label="${escapeHtml(t('console.macroDelete'))}">${icon('trash')}</button>
      <span class="grow"></span>
      <button type="button" class="icon-button" data-console="clear" title="${escapeHtml(t('console.clear'))}" aria-label="${escapeHtml(t('console.clear'))}">${icon('clear')}</button>
      <button type="button" class="problems-close" data-command="console" title="${escapeHtml(commandTip('console'))}" aria-label="${escapeHtml(t('console.close'))}">${icon('close')}</button>
    </header>
    <div class="console-body">
      ${debugPanelHtml()}
      <div class="console-output" id="console-output" role="log">${consoleState.log.map((l) => `<div class="console-line ${l.kind}">${escapeHtml(l.text)}</div>`).join('') || `<div class="console-line info">${escapeHtml(t('console.welcome'))}</div>`}</div>
      <div class="console-editor">
        <textarea id="console-code" spellcheck="false" placeholder="${escapeHtml(t(state.settings.consoleLanguage === 'python' ? 'console.placeholderPython' : 'console.placeholder'))}" title="${escapeHtml(t('console.codeTip'))}">${escapeHtml(consoleState.code)}</textarea>
        <div class="console-actions">
          <input id="console-macro-name" placeholder="${escapeHtml(t('console.macroNamePlaceholder'))}" title="${escapeHtml(t('console.macroNamePlaceholder'))}" />
          <button type="button" class="small-button" data-console="save" title="${escapeHtml(t('console.saveTip'))}">${icon('save')}<span>${escapeHtml(t('console.save'))}</span></button>
          <button type="button" class="small-button primary" data-console="run" title="${escapeHtml(t('console.runTip'))}">${icon('play')}<span>${escapeHtml(t('console.run'))}</span></button>
        </div>
      </div>
    </div>`;
  const out = root.querySelector('#console-output');
  if (out) out.scrollTop = out.scrollHeight;
}

async function onConsoleAction(action) {
  const code = root.querySelector('#console-code');
  const macro = root.querySelector('#console-macros')?.value;
  switch (action) {
    case 'run': {
      const text = code?.value ?? '';
      if (!text.trim()) return;
      consoleState.history.push(text);
      consoleState.at = consoleState.history.length;
      await runScript(text);
      return;
    }
    case 'record': return toggleRecording();
    case 'lang:js': case 'lang:python': updateSettings({ consoleLanguage: action.slice(5) }); renderConsole(); if (action === 'lang:python') ensurePython(); return;
    case 'save': return saveMacro();
    case 'clear': consoleState.log = []; return renderConsole();
    case 'macro-run': if (macro) await runMacro(macro); return;
    case 'macro-load': if (macro) { const m = state.settings.macros.find((x) => x.name === macro); if (m && m.language !== state.settings.consoleLanguage) updateSettings({ consoleLanguage: m.language }); consoleState.code = m?.code ?? ''; if (code) code.value = consoleState.code; const name = root.querySelector('#console-macro-name'); if (name) name.value = macro; } return;
    case 'macro-delete': if (macro) { updateSettings({ macros: state.settings.macros.filter((m) => m.name !== macro) }); renderConsole(); } return;
    default:
  }
}

/**
 * The addon manager (FreeCAD's Addon Manager, for macros): the catalogue that
 * comes with MyCAD, and macros from a web address or a file — installed into
 * the macro list, updated from where they came, removed.
 */
async function openAddons(resultArg = null) {
  const result = resultArg ?? await popups.open('addons', { catalog: ADDON_CATALOG, installed: state.settings.macros.map((m) => ({ name: m.name, language: m.language, source: m.source ?? null })) });
  if (!result) return null;
  if (result.action === 'install') {
    const entries = [];
    for (const item of result.items ?? []) {
      let code = item.code;
      const source = item.url ?? null;
      if (!code && item.url) {
        try { code = await (await fetch(item.url)).text(); } catch (error) { notify('error', t('addons.fetchFailed', { url: item.url, error: error?.message ?? error })); continue; }
      }
      if (!code?.trim()) continue;
      const language = item.language ?? (/\.(py|fcmacro)$/i.test(item.url ?? item.name ?? '') || /^\s*(import|from)\s/m.test(code) ? 'python' : 'js');
      entries.push({ name: item.name || (item.url ?? '').split('/').pop() || t('console.macroName', { n: state.settings.macros.length + 1 }), code, language, ...(source ? { source } : {}) });
    }
    if (!entries.length) return null;
    const names = new Set(entries.map((e) => e.name));
    updateSettings({ macros: [...state.settings.macros.filter((m) => !names.has(m.name)), ...entries] });
    notify('success', t('addons.installed', { count: entries.length }));
    renderConsole();
    return entries;
  }
  if (result.action === 'remove') {
    const names = new Set(result.names ?? []);
    updateSettings({ macros: state.settings.macros.filter((m) => !names.has(m.name)) });
    renderConsole();
    return [...names];
  }
  if (result.action === 'run' && result.name) {
    if (!state.settings.showConsole) updateSettings({ showConsole: true });
    renderConsole();
    return runMacro(result.name);
  }
  return null;
}

function renderProblems() {
  const panel = root.querySelector('#problems-panel');
  if (!panel) return;
  const doc = activeDoc();
  const show = Boolean(state.settings.showProblems && doc && !state.home);
  panel.hidden = !show;
  root.querySelector('#canvas-area')?.classList.toggle('with-problems', show);
  if (!show) return;
  const list = state.problems.doc === doc.id ? state.problems.list : [];
  const counts = problemCounts(list);
  const filter = state.problems.filter;
  const glyph = { error: 'error', warning: 'warning', info: 'info' };
  const chips = SEVERITIES.map((severity) => `<button type="button" class="problems-chip ${severity} ${filter[severity] ? 'on' : ''}" data-problem-filter="${severity}" aria-pressed="${filter[severity]}" title="${escapeHtml(t('problems.filterTip', { name: t(`problems.severity.${severity}`) }))}">${icon(glyph[severity])}<span>${counts[severity]}</span></button>`).join('');
  const shown = list.map((finding, index) => ({ finding, index })).filter(({ finding }) => filter[finding.severity]);
  const rows = shown.map(({ finding, index }) => {
    const entity = doc.drawing.entities.find((e) => e.id === finding.ids[0]);
    const where = finding.at ? `${formatLength(finding.at.x, undefined, 1)}, ${formatLength(finding.at.y, undefined, 1)}` : '';
    const text = problemText(finding);
    return `<button type="button" class="problem-row ${finding.severity}" data-problem="${index}" title="${escapeHtml(`${text} — ${t('problems.rowTip')}`)}">
      ${icon(glyph[finding.severity])}<span class="problem-text">${escapeHtml(text)}</span>
      <span class="problem-type">${escapeHtml(entity ? t(`entity.${entity.type}`) : '')}${finding.ids.length > 1 ? ` +${finding.ids.length - 1}` : ''}</span>
      <span class="problem-where">${escapeHtml(where)}</span></button>`;
  }).join('');
  const empty = list.length
    ? `<p class="problems-empty">${escapeHtml(t('problems.filtered'))}</p>`
    : `<p class="problems-empty ok">${icon('check')}<span>${escapeHtml(t('problems.none'))}</span></p>`;
  panel.innerHTML = `
    <header class="problems-head">
      ${icon('warning')}<b>${escapeHtml(t('problems.title'))}</b><span class="problems-count">${counts.total}</span>
      <span class="problems-chips">${chips}</span>
      <button type="button" class="problems-close" data-command="problems" title="${escapeHtml(commandTip('problems'))}" aria-label="${escapeHtml(t('problems.close'))}">${icon('close')}</button>
    </header>
    <div class="problems-list" role="list">${rows || empty}</div>`;
}

/** Selects what a problem is about and brings it into view (close up for gaps). */
function showProblem(index) {
  const finding = state.problems.list[index];
  const doc = activeDoc();
  if (!finding || !doc) return;
  const ids = finding.ids.filter((id) => doc.drawing.entities.some((e) => e.id === id));
  select(ids);
  if (state.view3d) return;
  const vp = ensureViewport(doc);
  const inset = state.settings.showRulers ? RULER : 0;
  const near = ['gap', 'nearlyClosed', 'repeatedPoint'].includes(finding.code);
  if (near && finding.at) {
    const half = Math.max((finding.params.gap ?? 0) * 25, 8 / vp.zoom, 0.05);
    vp.fit({ minX: finding.at.x - half, minY: finding.at.y - half, maxX: finding.at.x + half, maxY: finding.at.y + half }, 40, inset);
  } else {
    const entities = doc.drawing.entities.filter((e) => ids.includes(e.id) && e.type !== 'solid');
    const box = entities.length ? boxOfEntities(entities) : null;
    if (box && Math.max(box.maxX - box.minX, box.maxY - box.minY) > 1e-6) vp.fit(box, 80, inset);
    else if (finding.at) { vp.cx = finding.at.x; vp.cy = finding.at.y; }
  }
  scheduleRender();
  renderStatus();
}

// ───────────────────────── status bar

function renderStatus() {
  const bar = root.querySelector('#statusbar');
  root.classList.toggle('no-status', !state.settings.showStatusBar);
  const doc = activeDoc();
  const drawing = doc?.drawing;
  const notice = state.notice;
  const item = (glyph, text, title = text, extra = '', id = '') => `<span class="status-item ${extra}" ${id ? `id="${id}"` : ''} title="${escapeHtml(title)}">${icon(glyph)}<span>${escapeHtml(text)}</span></span>`;
  const toggle = (command, label) => `<button class="status-toggle ${commands[command].checked() ? 'on' : ''}" data-command="${command}" title="${escapeHtml(commandTip(command))}" aria-pressed="${commands[command].checked()}">${escapeHtml(label)}</button>`;
  const layer = drawing ? D.findLayer(drawing, drawing.activeLayer) : null;
  const vp = doc ? ensureViewport(doc) : null;
  bar.innerHTML = `
    ${doc ? item(doc.dirty ? 'edit' : 'check', doc.dirty ? t('status.modified') : t('status.saved'), doc.dirty ? t('status.modified') : t('status.saved'), doc.dirty ? 'modified' : 'saved') : ''}
    ${doc ? item('file', doc.path ?? t('status.unsavedFile'), doc.path ?? t('status.unsavedFile'), 'path') : ''}
    <span class="status-item coords" title="${escapeHtml(`${t('status.coordsTip')} · ${t('status.units')}`)}">${icon('coordinate')}<span id="status-coords">${coordsText()}</span><small id="status-unit">${unitLabel()}</small></span>
    ${item(TOOL_ICONS[state.toolId] ?? 'select', t(state.toolId === 'place' ? 'tool.place' : `tool.${state.toolId}`), t('status.toolTip'))}
    ${drawing ? item('selectAll', t('status.selection', { selected: state.selection.size, total: drawing.entities.length })) : ''}
    ${layer ? item('layers', layer.name, t('status.layerTip', { name: layer.name })) : ''}
    ${drawing ? problemsBadge() : ''}
    <span class="status-toggles">${toggle('snap', t('status.snap'))}${toggle('grid', t('status.grid'))}${toggle('snapGrid', t('status.snapGrid'))}${toggle('ortho', t('status.ortho'))}</span>
    ${vp ? item('zoomIn', t('status.zoom', { value: formatNumber(vp.percent, vp.percent < 10 ? 1 : 0) }), t('status.zoomTip'), '', 'status-zoom') : ''}
    ${doc ? item('undo', t('status.history', { undo: doc.history.undoStack.length, redo: doc.history.redoStack.length })) : ''}
    ${item('palette', `${themeName(state.settings.theme, getLanguage())} · ${t('status.language')}`, `${t('status.theme', { name: themeName(state.settings.theme, getLanguage()) })} · ${t('status.language')}`)}
    ${item(desktop ? 'drawing' : 'globe', `${desktop ? t('status.desktop') : t('status.web')} · ${state.docs.length}`, `${desktop ? t('status.desktop') : t('status.web')} · ${t('status.drawings', { count: state.docs.length })}`)}
    <span class="status-notice ${notice?.kind ?? ''}" title="${escapeHtml(notice?.text ?? t('status.ready'))}">${icon(notice?.kind === 'error' ? 'error' : notice?.kind === 'success' ? 'check' : 'info')}<span>${escapeHtml(notice?.text ?? t('status.ready'))}</span></span>
    ${state.settings.statusClock ? `<span class="status-item clock" title="${escapeHtml(new Date().toLocaleString())}">${icon('recent')}<span id="status-clock">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span>` : ''}`;
}

/** Problem counts in the status bar; a click shows or hides the panel. */
function problemsBadge() {
  const list = state.problems.doc === state.active ? state.problems.list : [];
  const counts = problemCounts(list);
  const tip = t('problems.badgeTip', { error: counts.error, warning: counts.warning, info: counts.info });
  return `<button type="button" class="status-problems ${counts.error ? 'has-error' : counts.warning ? 'has-warning' : 'clean'}" data-command="problems" title="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}">${icon('error')}<span>${counts.error}</span>${icon('warning')}<span>${counts.warning}</span></button>`;
}

setInterval(() => {
  const clock = root.querySelector('#status-clock');
  if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}, 15000);

function renderAll() {
  schedule3d();
  const grip = root.querySelector('.resize-grip');
  if (grip) grip.title = t('tip.resize');
  renderMenubar();
  renderToolbar();
  renderTabs();
  renderLeft();
  renderRight();
  renderStatus();
  renderCommandBar();
  applyBackgroundStyle();
  renderStart();
  renderProblems();
  renderConsole();
  if (state.problems.doc !== (activeDoc()?.id ?? null)) checkProblems();
  scheduleRender();
  document.title = `MyCAD ${displayVersion(state.info?.version)}${activeDoc() ? ` — ${docName(activeDoc())}` : ''}`;
}

// ───────────────────────── editing operations

async function deleteSelection() {
  const ids = selectedIds();
  if (!ids.length) return;
  if (state.settings.confirmDelete && ids.length > 20) {
    const choice = await ask({ icon: 'trash', title: t('confirm.deleteTitle'), message: t('confirm.deleteEntities', { count: ids.length }), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'delete', label: t('confirm.delete'), icon: 'trash', danger: true, primary: true }] });
    if (choice !== 'delete') return;
  }
  const removed = change('op.delete', (drawing) => D.removeEntities(drawing, ids));
  select([]);
  notify('success', t('notice.deleted', { count: removed }));
}

/**
 * FEM (FreeCAD FEM, beam elements): the selected lines (or all visible lines and
 * polylines) as a 2D frame. The window sets supports, loads and the section and
 * shows the results; "draw" puts the deformed shape and the moment diagram on a FEM layer.
 */
async function openFem(resultArg = null) {
  const doc = activeDoc();
  if (!doc) return null;
  const selected = selectedEntities().filter((e) => e.type === 'line' || e.type === 'polyline');
  const entities = selected.length ? selected : doc.drawing.entities.filter((e) => (e.type === 'line' || e.type === 'polyline') && D.isVisible(doc.drawing, e));
  const frame = frameFrom(entities);
  if (!frame.members.length) { notify('info', t('fem.noFrame')); return null; }
  const result = resultArg ?? await popups.open('fem', { frame, fem: doc.drawing.fem ?? {}, name: docName(doc) });
  if (!result || !['apply', 'draw'].includes(result.action)) return null;
  const fem = normalizeFem(result.fem);
  const analysis = analyzeFrame(frame, fem);
  change('op.fem', (d) => {
    d.fem = fem;
    if (result.action !== 'draw' || !analysis.ok) return;
    if (!d.layers.some((l) => l.id === 'fem')) d.layers.push({ id: 'fem', name: 'FEM', color: '#e5484d', lineType: 'continuous', lineWidth: null, visible: true, locked: false });
    // The last results are replaced.
    d.entities = d.entities.filter((e) => e.layer !== 'fem');
    const xs = frame.nodes.map((n) => n.x);
    const ys = frame.nodes.map((n) => n.y);
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
    if (result.view?.deformed !== false) for (const points of deformedShape(frame, analysis, autoScale(frame, analysis))) D.addEntity(d, 'polyline', { points, layer: 'fem', lineType: 'dashed' });
    if (result.view?.moment !== false && analysis.max.moment) for (const points of momentDiagram(frame, analysis, (size * 0.12) / Math.abs(analysis.max.moment))) D.addEntity(d, 'polyline', { points, closed: true, layer: 'fem', color: '#3b82f6' });
    const top = Math.max(...ys);
    D.addEntity(d, 'text', { x: Math.min(...xs), y: top + size * 0.08, size: Math.max(2.5, size / 60), layer: 'fem', text: t('fem.summary', { disp: fmt(analysis.max.displacement, 3), moment: fmt(analysis.max.moment / 1e6, 3), stress: fmt(analysis.max.sigma, 1), util: fmt(analysis.max.utilisation * 100, 0) }) });
  });
  if (result.action === 'draw') notify(analysis.ok ? 'success' : 'error', analysis.ok ? t('fem.drawn') : t(`fem.error.${analysis.error}`));
  return analysis;
}

/**
 * Plate FEM (FreeCAD FEM, plane stress): the largest selected (or visible)
 * closed outline is the plate, the outlines inside it holes. The window sets
 * supports and loads by side and shows the von Mises stress; "draw" puts the
 * deformed outline, the peak and a summary on the FEM layer.
 */
async function openPlate(resultArg = null) {
  const doc = activeDoc();
  if (!doc) return null;
  const selected = selectedEntities();
  const entities = selected.length ? selected : doc.drawing.entities.filter((e) => D.isVisible(doc.drawing, e) && e.layer !== 'fem');
  const source = plateSource(collectLoops(entities, doc.drawing).loops);
  if (!source) { notify('info', t('plate.noOutline')); return null; }
  const result = resultArg ?? await popups.open('plate', { source, plate: doc.drawing.plate ?? {}, name: docName(doc) });
  if (!result || !['apply', 'draw'].includes(result.action)) return null;
  const plate = normalizePlate(result.plate);
  const analysis = analyzePlate(source.outer, source.holes, plate);
  change('op.fem', (d) => {
    d.plate = plate;
    if (result.action !== 'draw' || !analysis.ok) return;
    if (!d.layers.some((l) => l.id === 'fem')) d.layers.push({ id: 'fem', name: 'FEM', color: '#e5484d', lineType: 'continuous', lineWidth: null, visible: true, locked: false });
    d.entities = d.entities.filter((e) => e.layer !== 'fem');
    const xs = source.outer.map((p) => p.x);
    const ys = source.outer.map((p) => p.y);
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
    if (result.view?.deformed !== false) for (const points of plateDeformed(analysis, plateScale(analysis))) D.addEntity(d, 'polyline', { points, closed: true, layer: 'fem', lineType: 'dashed' });
    const peak = platePeak(analysis);
    const mark = size / 40;
    D.addEntity(d, 'circle', { cx: peak.x, cy: peak.y, r: mark, layer: 'fem', color: '#e5484d' });
    D.addEntity(d, 'text', { x: peak.x + mark * 1.4, y: peak.y + mark * 1.4, size: Math.max(2.5, size / 60), layer: 'fem', color: '#e5484d', text: t('plate.peak', { vm: fmt(peak.vm, 1) }) });
    D.addEntity(d, 'text', { x: Math.min(...xs), y: Math.max(...ys) + size * 0.08, size: Math.max(2.5, size / 60), layer: 'fem', text: t('plate.summary', { disp: fmt(analysis.max.displacement, 4), vm: fmt(analysis.max.vm, 1), util: fmt(analysis.max.utilisation * 100, 0), elements: analysis.mesh.tris.length }) });
  });
  if (result.action === 'draw') notify(analysis.ok ? 'success' : 'error', analysis.ok ? t('fem.drawn') : t(`plate.error.${analysis.error}`));
  return analysis;
}

/**
 * FEM of a solid (FreeCAD FEM with CalculiX): the selected solid filled with
 * brick elements, clamped and loaded on its faces; "draw" puts the deformed
 * solid in the drawing, ".inp" saves the CalculiX deck, "CalculiX" solves it
 * with ccx (when installed — FreeCAD ships it) and compares.
 */
async function openFem3d(resultArg = null) {
  const doc = activeDoc();
  const solid = selectedSolids()[0];
  if (!doc || !solid) { notify('info', t('fem3d.noSolid')); return null; }
  const tris = solidMesh(solid);
  const result = resultArg ?? await popups.open('fem3d', { tris: flattenTriangles(tris), fem3d: doc.drawing.fem3d ?? {}, name: solid.name || t(`solid.${solid.kind}`) });
  if (!result || !['draw', 'inp', 'ccx'].includes(result.action)) return null;
  const options = normalizeFem3d(result.fem3d);
  change('op.fem', (d) => { d.fem3d = options; });
  const analysis = analyzeSolid(tris, options);
  if (!analysis.ok) { notify('error', t(`fem3d.error.${analysis.error}`)); return analysis; }
  const name = solid.name || t(`solid.${solid.kind}`);
  if (result.action === 'inp') {
    const text = toCalculix(analysis, name);
    const file = `${safeFileName(name)}.inp`;
    try {
      if (desktop && !resultArg) {
        const path = await native.chooseExportPath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${file}`, 'inp');
        if (path) { await native.writeTextFile(path, text); notify('success', t('notice.exported', { name: baseName(path) })); }
      } else if (!resultArg) native.downloadText(text, file, 'text/plain');
    } catch (error) { showError('error.export', error, file); }
    return { ...analysis, inp: text };
  }
  if (result.action === 'ccx') {
    const ccx = await native.ccxLocate(state.settings.ccxPath ?? '');
    if (!ccx) { notify('error', t('fem3d.noCcx')); return analysis; }
    try {
      const dat = await withProgress('progress.ccx', 'CalculiX', () => native.ccxRun(ccx, toCalculix(analysis, name)));
      const { u } = parseCalculixDat(dat);
      let theirs = 0;
      for (const v of u.values()) theirs = Math.max(theirs, Math.hypot(...v));
      const diff = analysis.max.displacement ? Math.abs(theirs - analysis.max.displacement) / analysis.max.displacement : 0;
      notify(diff < 0.02 ? 'success' : 'info', t('fem3d.ccxDone', { ccx: fmt(theirs, 4), ours: fmt(analysis.max.displacement, 4), diff: fmt(diff * 100, 2) }));
      return { ...analysis, ccx: { max: theirs, nodes: u.size } };
    } catch (error) { showError('error.fem3d', error, 'CalculiX'); return analysis; }
  }
  // The deformed solid (outer faces moved, scaled so the largest move is 6 % of the size).
  const size = Math.max(...[0, 1, 2].map((dd) => Math.max(...analysis.nodes.map((p) => p[dd])) - Math.min(...analysis.nodes.map((p) => p[dd]))), 1);
  const scale = analysis.max.displacement ? (size * 0.06) / analysis.max.displacement : 1;
  const P = analysis.nodes.map((p, i) => [p[0] + analysis.u[3 * i] * scale, p[1] + analysis.u[3 * i + 1] * scale, p[2] + analysis.u[3 * i + 2] * scale]);
  const out = [];
  for (const [quad] of boundaryQuads(analysis)) { const [a, b, c, dd] = quad.map((i) => P[i]); out.push([a, b, c], [a, c, dd]); }
  const added = change('op.fem', (d) => D.addEntity(d, 'solid', { kind: 'mesh', params: {}, shape: { tris: flattenTriangles(out) }, name: t('fem3d.resultName', { name, scale: fmt(scale, 0), vm: fmt(analysis.max.vm, 1) }), color: '#e5484d' }));
  if (added) notify('success', t('fem3d.drawn', { disp: fmt(analysis.max.displacement, 4), vm: fmt(analysis.max.vm, 1) }));
  return analysis;
}

/**
 * CAM (FreeCAD CAM): tool paths from the selected 2D outlines (or all visible
 * ones) → a G-code file. The window previews the paths; the file is written here.
 */
async function openCam(optionsArg = null) {
  const doc = activeDoc();
  if (!doc) return null;
  const selected = selectedEntities();
  const entities = (selected.length ? selected : doc.drawing.entities.filter((e) => D.isVisible(doc.drawing, e)));
  const source = camSource(entities, doc.drawing);
  // Solids: their top surface as a height field for 3D machining (FreeCAD 3D Surface).
  const solids = entities.filter((e) => e.type === 'solid' && D.isVisible3d(doc.drawing, e));
  if (solids.length) {
    const tris = solids.flatMap((e) => solidMesh(e));
    const xs = tris.flatMap((tri) => tri.map((p) => p[0])); const ys = tris.flatMap((tri) => tri.map((p) => p[1]));
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
    source.model = heightField(tris, { pad: Math.max(5, size * 0.06), maxCells: 240 });
  }
  if (!source.loops.length && !source.chains.length && !source.circles.length && !source.model) { notify('info', t('cam.nothing')); return null; }
  let options = optionsArg;
  let action = 'export';
  if (!options) {
    const result = await popups.open('cam', { source, name: docName(doc) });
    if (!['export', 'stock'].includes(result?.action)) return null;
    options = result.options;
    action = result.action;
  } else if (options.action) action = options.action;
  const job = camPaths(source, options);
  if (action === 'stock') return addMachinedStock(source, job);
  const text = toGcode(job, { title: doc.drawing.title || docName(doc) });
  const name = `${safeFileName(stripExtension(docName(doc)))}.nc`;
  try {
    if (desktop && !optionsArg) {
      const path = await native.chooseExportPath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${name}`, 'nc');
      if (!path) return text;
      await withProgress('progress.export', baseName(path), (op) => native.writeTextFile(path, text, op));
      updateSettings({ lastDirectory: directoryOf(path) || state.settings.lastDirectory });
      notify('success', t('notice.exported', { name: baseName(path) }));
    } else if (!optionsArg) {
      native.downloadText(text, name, 'text/x-gcode');
      notify('success', t('notice.exported', { name }));
    }
  } catch (error) {
    showError('error.export', error, name);
  }
  return text;
}

/** The CAM simulator's result in the drawing: the stock as cut, a mesh solid (FreeCAD CAM simulator). */
function addMachinedStock(source, job) {
  const grid = source.model ?? gridFor(job);
  if (!grid || !job.paths.length) { notify('info', t('cam.nothing')); return null; }
  const run = simulate(grid, job, { top: job.options.top });
  const bottom = CAM_3D.includes(job.options.operation) ? grid.zMin : job.options.top - job.options.depth - Math.max(2, job.options.depth * 0.5);
  // At most 120 cells a side: the drawing (and every undo step) stays light.
  const every = Math.max(1, Math.ceil(Math.max(grid.nx, grid.ny) / 120));
  const nx = Math.ceil(grid.nx / every); const ny = Math.ceil(grid.ny / every);
  const coarse = { ...grid, nx, ny, cell: grid.cell * every };
  const stock = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) stock.push(run.stock[Math.min(grid.ny - 1, j * every) * grid.nx + Math.min(grid.nx - 1, i * every)]);
  const tris = stockMesh(coarse, stock, bottom);
  const added = change('op.cam', (d) => D.addEntity(d, 'solid', { kind: 'mesh', params: {}, shape: { tris: flattenTriangles(tris) }, name: t('cam.stockName'), color: '#d6aa6e' }));
  if (added) { select([added.id]); notify('success', t('cam.stockDone', { count: tris.length })); }
  return added;
}

/** Waits for a click on a solid's face in the 3D view: the working plane goes onto it. */
async function pickWorkPlaneFace() {
  if (!state.view3d) await toggle3d(true);
  state.pickFace = true;
  view3d.instance?.canvas.classList.add('edge-pick');
  notify('info', t('wp.facePick'));
}

/** The working plane on a face: the canvas becomes that face, solids made from outlines stand on it. */
function setWorkPlaneFace(point, normal) {
  const frame = frameOnFace(point, normal);
  const done = change('op.workPlane', (d) => { d.workPlane = { x: 0, y: 0, angle: 0, z: 0, frame }; });
  if (done !== undefined) notify('success', t('wp.faceSet', { x: fmt(frame.origin[0], 1), y: fmt(frame.origin[1], 1), z: fmt(frame.origin[2], 1), n: frame.z.map((v) => fmt(v, 2)).join(', ') }));
  return activeDrawing()?.workPlane ?? null;
}

/** A solid made on the working plane: on a face, its pose carried onto the face (frame · pose). */
function onWorkPlane(raw, drawing) {
  const frame = drawing.workPlane?.frame;
  if (!frame) return { ...raw, z: (raw.z ?? 0) + (drawing.workPlane?.z ?? 0) };
  return { ...raw, ...poseFields(composePose(frameMatrix(frame), poseOf(raw))) };
}

/** Sets the working plane from an origin and a point on its X axis (null = back to the global plane). */
function setWorkPlane(origin, toward = null) {
  const done = change('op.workPlane', (d) => {
    const wp = origin ? planeFrom(origin, toward, d.workPlane?.z ?? 0) : null;
    if (wp) d.workPlane = wp; else delete d.workPlane;
    return true;
  });
  if (done) notify('success', t(origin ? 'notice.workPlaneSet' : 'notice.workPlaneReset'));
  setTool?.('select');
  return activeDrawing()?.workPlane ?? null;
}

// ───────────────────────── sketch constraints (FreeCAD Sketcher)

/** Points of the selected point clouds and meshes (drawing coordinates, flat [x, y, z, …]). */
function cloudSelection() {
  const out = [];
  for (const e of selectedSolids()) {
    if (e.kind === 'points') for (const p of solidPoints(e)) out.push(...p);
    else if (e.kind === 'mesh') {
      const seen = new Set();
      for (const tri of solidMesh(e)) for (const p of tri) { const k = p.map((v) => Math.round(v * 1e4)).join(','); if (!seen.has(k)) { seen.add(k); out.push(...p); } }
    }
  }
  return out;
}

/**
 * Reverse Engineering: fits a plane, a sphere or a cylinder to the selected
 * points (least squares), or makes a surface mesh through them.
 */
function reverseEngineer(fit) {
  const pts = cloudSelection();
  if (pts.length < 9) { notify('info', t('notice.reNone')); return null; }
  let raw = null;
  let error = null;
  if (fit === 'plane') {
    const plane = fitPlane(pts);
    const { rx, ry, x, y } = eulerTo(plane.normal);
    const local = [];
    for (let i = 0; i + 2 < pts.length; i += 3) { const d = [pts[i] - plane.centroid[0], pts[i + 1] - plane.centroid[1], pts[i + 2] - plane.centroid[2]]; local.push({ x: d[0] * x[0] + d[1] * x[1] + d[2] * x[2], y: d[0] * y[0] + d[1] * y[1] + d[2] * y[2] }); }
    const outline = convexHull(local);
    const thick = Math.max(0.1, plane.rms * 2);
    raw = { kind: 'pad', params: { height: thick }, shape: { shapes: [{ outer: outline, holes: [] }] }, x: plane.centroid[0], y: plane.centroid[1], z: plane.centroid[2], rx, ry, rz: 0 };
    // The slab is centred on the plane.
    const nx = plane.normal;
    raw.x -= nx[0] * thick / 2; raw.y -= nx[1] * thick / 2; raw.z -= nx[2] * thick / 2;
    error = plane.rms;
  } else if (fit === 'sphere') {
    const s = fitSphere(pts);
    if (!s) return null;
    raw = { kind: 'sphere', params: { radius: s.radius }, x: s.center[0], y: s.center[1], z: s.center[2] };
    error = s.rms;
  } else if (fit === 'cylinder') {
    const c = fitCylinder(pts);
    if (!c) return null;
    const { rx, ry } = eulerTo(c.axis);
    raw = { kind: 'cylinder', params: { radius: c.radius, height: Math.max(0.01, c.height), angle: 360 }, x: c.base[0], y: c.base[1], z: c.base[2], rx, ry, rz: 0 };
    error = c.rms;
  } else {
    const tris = meshFromPoints(pts);
    raw = { kind: 'mesh', params: {}, shape: { tris: flattenTriangles(tris) } };
  }
  const added = change('op.reverse', (d) => D.addEntity(d, 'solid', { ...raw, name: t(`re.${fit}`) }));
  if (added) {
    select([added.id]);
    notify('success', error === null ? t('notice.reMesh', { count: added.shape?.tris ? added.shape.tris.length / 9 : 0 }) : t('notice.reFit', { name: t(`re.${fit}`), rms: fmt(error, 4) }));
  }
  return added;
}

// ───────────────────────── Assembly joints (FreeCAD Assembly)

/**
 * A joint between the two selected solids: the first picked is the base, the
 * second the moving part; the joint sits at the part's origin, along its z axis.
 */
function addJoint(type, value = undefined) {
  let [base, part] = pickedEntities().filter((e) => e.type === 'solid');
  if (!base || !part) { notify('info', t('notice.jointNone')); return null; }
  // A grounded part stays: the other one moves.
  if (part.grounded && !base.grounded) [base, part] = [part, base];
  const drawing = activeDrawing();
  if ((drawing.joints ?? []).some((j) => j.part === part.id)) { notify('error', t('notice.jointTwice')); return null; }
  // Distance and angle joints ask for their value first.
  if ((type === 'distance' || type === 'angle') && value === undefined) {
    return form({ title: t(`joint.${type}`), icon: `joint${type[0].toUpperCase()}${type.slice(1)}`, width: 420, fields: [{ key: 'value', type: 'number', label: t(type === 'distance' ? 'asm.distanceValue' : 'asm.angleValue'), icon: 'move', value: type === 'distance' ? 10 : 45, step: 1, unit: type === 'distance' ? 'mm' : '°' }], actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }] })
      .then((answer) => (answer?.action === 'ok' ? addJoint(type, Number(answer.values.value)) : null));
  }
  const pose = poseOf(part);
  const joint = ORIENTING.includes(type)
    ? makeOrientedJoint(type, base, part, { distance: value ?? 0, tilt: value ?? 0, id: newJointId(drawing) })
    : makeJoint(type, base, part, [pose[3], pose[7], pose[11]], [pose[2], pose[6], pose[10]], newJointId(drawing));
  change('op.joint', (d) => { d.joints = [...(d.joints ?? []), joint]; });
  notify('success', t('notice.joint', { type: t(`joint.${type}`), base: base.name || t(`solid.${base.kind}`), part: part.name || t(`solid.${part.kind}`) }));
  return joint;
}

const newJointId = (drawing) => { let n = (drawing.joints?.length ?? 0) + 1; while ((drawing.joints ?? []).some((j) => j.id === `j${n}`)) n++; return `j${n}`; };

/** A joint's drive (from → to over the animation) and coupling (follows another joint × ratio). */
function jointMotionRows(j, drawing) {
  const keys = jointKeys(j.type);
  if (!keys.length) return '';
  const unit = keys[0] === 'angle' ? '°' : 'mm';
  const field = (attr, value, label) => `<input class="num" ${attr} value="${fmt(value, 4)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" />`;
  const drive = j.drive ?? { from: j[keys[0]], to: j[keys[0]] };
  const leaders = (drawing.joints ?? []).filter((o) => o.id !== j.id && jointKeys(o.type).length);
  const screw = j.type === 'cylindrical';
  const options = [`<option value="">${escapeHtml(t('joint.followNone'))}</option>`, ...leaders.map((o) => `<option value="${o.id}" ${j.follow?.joint === o.id ? 'selected' : ''}>${escapeHtml(`${o.id} · ${t(`joint.${o.type}`)}`)}</option>`), ...(screw ? [`<option value="${j.id}" ${j.follow?.joint === j.id ? 'selected' : ''}>${escapeHtml(t('joint.screw'))}</option>`] : [])].join('');
  return `<div class="joint-motion" data-joint-motion="${j.id}">
    <div class="joint-motion-line"><span class="joint-motion-label" title="${escapeHtml(t('joint.driveTip'))}">${icon('play')}${escapeHtml(t('joint.drive'))}</span>${field(`data-joint-drive="${j.id}:from"`, drive.from, t('joint.driveFrom'))}<span>→</span>${field(`data-joint-drive="${j.id}:to"`, drive.to, t('joint.driveTo'))}<small>${unit}</small></div>
    <div class="joint-motion-line"><span class="joint-motion-label" title="${escapeHtml(t('joint.followTip'))}">${icon('link')}${escapeHtml(t('joint.follow'))}</span><select data-joint-follow="${j.id}" title="${escapeHtml(t('joint.followTip'))}">${options}</select><span>×</span>${field(`data-joint-ratio="${j.id}"`, j.follow?.ratio ?? 1, t('joint.ratio'))}</div>
  </div>`;
}

/** Sets a joint's drive: the first value of its type runs from → to (equal = no drive). */
function setJointDrive(id, part, value) {
  return change('op.joint', (d) => {
    d.joints = (d.joints ?? []).map((j) => {
      if (j.id !== id) return j;
      const key = jointKeys(j.type)[0];
      const drive = { key, from: j.drive?.from ?? j[key] ?? 0, to: j.drive?.to ?? j[key] ?? 0, [part]: value };
      const next = { ...j, drive };
      if (drive.from === drive.to) delete next.drive;
      return next;
    });
    if (!hasDrives(d.joints)) delete d.animation;
    else d.animation = normalizeAnimation(d.animation);
  });
}

/** Couples a joint to a leader joint (or itself: a screw, offset from angle); '' = none. */
function setJointFollow(id, leader, ratio = null) {
  return change('op.joint', (d) => {
    d.joints = (d.joints ?? []).map((j) => {
      if (j.id !== id) return j;
      const next = { ...j };
      const target = leader === undefined ? j.follow?.joint : leader;
      if (!target) { delete next.follow; return next; }
      const lead = d.joints.find((o) => o.id === target);
      if (!lead) return j;
      const self = target === j.id;
      next.follow = { joint: target, key: self ? 'offset' : jointKeys(j.type)[0], from: self ? 'angle' : jointKeys(lead.type)[0], ratio: ratio ?? j.follow?.ratio ?? (self ? 1 / 360 : 1), phase: j.follow?.phase ?? 0 };
      return next;
    });
  });
}

// ───────────────────────── Assembly animation (FreeCAD Assembly › Animate)

/** Shows the assembly at a time: driven joints set, loops solved, parts moved in the 3D view. */
function showAnimationAt(time) {
  const doc = activeDoc();
  const drawing = doc?.drawing;
  if (!drawing?.joints || !view3d.instance) return null;
  // From the last frame (or the start, with the drawing's joint values), in small steps.
  const run = solveAnimation(drawing.entities, anim.joints ?? drawing.joints, anim.joints ? anim.time : 0, time, drawing.animation);
  anim.active = true;
  anim.time = time;
  anim.joints = run.joints;
  anim.failed = run.failed;
  const before = new Map(drawing.entities.map((e) => [e.id, e]));
  const deltas = new Map();
  for (const e of run.entities) if (e !== before.get(e.id)) deltas.set(e.id, poseDelta(before.get(e.id), e));
  view3d.instance.setPoses(deltas);
  updateAnimationBar();
  return run;
}

function animationStep(now) {
  anim.frame = 0;
  if (!anim.playing) return;
  const drawing = activeDrawing();
  const a = normalizeAnimation(drawing?.animation);
  const dt = anim.last ? (now - anim.last) / 1000 : 0;
  anim.last = now;
  let time = anim.time + dt;
  if (a.mode === 'once' && time >= a.duration) { time = a.duration; anim.playing = false; }
  showAnimationAt(time);
  if (anim.playing) anim.frame = requestAnimationFrame(animationStep);
  else renderView3dBar();
}

/** Plays (from where it stopped; from the start after a finished "once") or pauses. */
async function toggleAnimation(play = !anim.playing) {
  const drawing = activeDrawing();
  if (!hasDrives(drawing?.joints)) { notify('info', t('anim.none')); return false; }
  if (!state.view3d) await toggle3d(true);
  const a = normalizeAnimation(drawing.animation);
  anim.playing = play;
  if (play) {
    if (a.mode === 'once' && anim.time >= a.duration) anim.time = 0;
    anim.last = 0;
    cancelAnimationFrame(anim.frame);
    anim.frame = requestAnimationFrame(animationStep);
  } else cancelAnimationFrame(anim.frame);
  renderView3dBar();
  return play;
}

/** Ends the animation: the parts go back to where the drawing has them. */
function stopAnimation() {
  cancelAnimationFrame(anim.frame);
  Object.assign(anim, { active: false, playing: false, time: 0, joints: null, frame: 0, last: 0, failed: [] });
  view3d.instance?.setPoses(null);
  if (state.view3d) rebuild3d();
}

/** Keeps the pose being shown: the joints take their animated values (one undo step). */
function keepAnimationPose() {
  if (!anim.active || !anim.joints) return;
  const joints = anim.joints;
  stopAnimation();
  change('op.joint', (d) => { d.joints = joints; });
}

function setAnimation(values) {
  const drawing = activeDrawing();
  if (!drawing) return;
  const next = normalizeAnimation({ ...drawing.animation, ...values });
  // Kept in the drawing directly (an undo step would end the animation); the tab shows it unsaved.
  drawing.animation = next;
  renderTabs();
  if (anim.active) showAnimationAt(Math.min(anim.time, next.duration));
  renderView3dBar();
}

function animationBar() {
  const drawing = activeDrawing();
  if (!hasDrives(drawing?.joints)) return '';
  const a = normalizeAnimation(drawing.animation);
  const b = (action, glyph, label, active = false) => `<button class="tool-button ${active ? 'active' : ''}" data-anim="${action}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${icon(glyph)}</button>`;
  return `<div class="anim-bar" role="toolbar" aria-label="${escapeHtml(t('anim.title'))}">
    ${b('play', anim.playing ? 'pause' : 'play', t(anim.playing ? 'anim.pause' : 'anim.play'), anim.playing)}
    ${b('stop', 'stop', t('anim.stop'))}
    <input type="range" id="anim-time" min="0" max="${a.duration}" step="0.01" value="${anim.time}" title="${escapeHtml(t('anim.time'))}" aria-label="${escapeHtml(t('anim.time'))}" />
    <span class="anim-clock" id="anim-clock">${fmt(anim.time, 2)} / ${fmt(a.duration, 2)} s</span>
    <span class="segmented anim-mode" role="group">${ANIMATION_MODES.map((mode) => `<button class="segment ${a.mode === mode ? 'active' : ''}" data-anim="mode:${mode}" title="${escapeHtml(t(`anim.mode.${mode}`))}">${escapeHtml(t(`anim.modeShort.${mode}`))}</button>`).join('')}</span>
    <label class="anim-duration" title="${escapeHtml(t('anim.duration'))}">${icon('clock')}<input class="num" id="anim-duration" value="${fmt(a.duration, 2)}" aria-label="${escapeHtml(t('anim.duration'))}" /><small>s</small></label>
    ${b('keep', 'save', t('anim.keep'))}
    <span class="anim-warn" id="anim-warn" ${anim.failed.length ? '' : 'hidden'} title="${escapeHtml(t('anim.failedTip'))}">${icon('warning')}</span>
  </div>`;
}

/** Only the moving parts of the bar (each frame). */
function updateAnimationBar() {
  const slider = root.querySelector('#anim-time');
  if (slider && document.activeElement !== slider) slider.value = String(anim.time);
  const clock = root.querySelector('#anim-clock');
  if (clock) clock.textContent = `${fmt(anim.time, 2)} / ${fmt(normalizeAnimation(activeDrawing()?.animation).duration, 2)} s`;
  const warn = root.querySelector('#anim-warn');
  if (warn) warn.hidden = !anim.failed.length;
}

function onAnimBar(action) {
  if (action === 'play') return toggleAnimation();
  if (action === 'stop') return stopAnimation();
  if (action === 'keep') return keepAnimationPose();
  if (action.startsWith('mode:')) return setAnimation({ mode: action.slice(5) });
  return null;
}

/** Changes a joint's turn (degrees) or slide (mm). */
function setJoint(id, values) {
  return change('op.joint', (d) => { d.joints = (d.joints ?? []).map((j) => (j.id === id ? { ...j, ...values } : j)); });
}

/** The joints a solid takes part in, with their values. */
function jointRows(entity) {
  const list = (activeDrawing()?.joints ?? []).filter((j) => j.base === entity.id || j.part === entity.id);
  if (!list.length) return '';
  const drawing = activeDrawing();
  const nameOf = (id) => { const e = D.findEntity(drawing, id); return e ? e.name || t(`solid.${e.kind}`) : '?'; };
  const input = (j, key) => `<input class="num" data-joint-value="${j.id}:${key}" value="${fmt(j[key], 4)}" title="${escapeHtml(t(`joint.${key}`))}" aria-label="${escapeHtml(t(`joint.${key}`))}" />`;
  return `<h4>${icon('jointRevolute')}<span>${t('joint.title')}</span></h4><div class="constraint-list">${list.map((j) => `<div class="constraint-row joint-row" data-joint="${j.id}" title="${escapeHtml(`${nameOf(j.base)} → ${nameOf(j.part)}`)}">${icon(commands[`joint:${j.type}`].icon)}<span class="constraint-name">${escapeHtml(t(`joint.${j.type}`))}</span>${j.type === 'revolute' || j.type === 'cylindrical' ? `${input(j, 'angle')}<small>°</small>` : ''}${j.type === 'slider' || j.type === 'cylindrical' ? `${input(j, 'offset')}<small>mm</small>` : ''}<button class="icon-button" data-joint-remove="${j.id}" title="${escapeHtml(t('joint.remove'))}" aria-label="${escapeHtml(t('joint.remove'))}">${icon('trash')}</button></div>${jointMotionRows(j, drawing)}`).join('')}</div>`;
}

// ───────────────────────── Robot (FreeCAD Robot workbench)

const selectedRobot = () => selectedSolids().find((entity) => entity.kind === 'robot') ?? null;

/** Selected points and curves as world points on the drawing plane (z = 0), in order. */
function robotTargets() {
  const drawing = activeDrawing();
  if (!drawing) return [];
  const out = [];
  for (const e of selectedEntities()) {
    if (e.type === 'point') out.push([e.x, e.y, 0]);
    else if (!['solid', 'text', 'dim'].includes(e.type)) {
      const { loops, open } = collectLoops([e], drawing);
      for (const path of [...open, ...loops.map((l) => [...l, l[0]])]) out.push(...path.map((p) => [p.x, p.y, 0]));
    }
  }
  return out;
}

/** World → the robot's own coordinates (its placement undone). */
function robotLocal(robot, p) {
  const map = placement(robot);
  const o = map([0, 0, 0]);
  const cols = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((e) => map(e).map((v, i) => v - o[i]));
  const [a, b, c] = cols;
  // Inverse of the 3×3 whose columns are a, b, c.
  const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - b[0] * (a[1] * c[2] - a[2] * c[1]) + c[0] * (a[1] * b[2] - a[2] * b[1]);
  const d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
  const solve = (col) => { const m = [a, b, c].map((v, i) => (i === col ? d : v)); return (m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[1][0] * (m[0][1] * m[2][2] - m[0][2] * m[2][1]) + m[2][0] * (m[0][1] * m[1][2] - m[0][2] * m[1][1])) / det; };
  return [solve(0), solve(1), solve(2)];
}

const robotJoints = (robot) => ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((k) => robot.params[k]);
const robotOptions = (robot) => ({ reach: robot.params.reach, tool: robot.params.tool });
const setRobotJoints = (d, id, joints) => D.updateEntity(d, id, { params: { ...d.entities.find((e) => e.id === id).params, ...Object.fromEntries(joints.map((v, i) => [`a${i + 1}`, Math.round(v * 1000) / 1000])) } });

/** A 6-axis robot at the origin (or at a selected point). */
function addRobot() {
  const at = selectedEntities().find((e) => e.type === 'point');
  const added = change('op.robot', (d) => D.addEntity(d, 'solid', { kind: 'robot', name: t('solid.robot'), x: at?.x ?? 0, y: at?.y ?? 0, z: 0 }));
  if (added) select([added.id]);
  return added;
}

/** Inverse kinematics: the tool tip to the first selected point, pointing down. */
function robotMoveTo() {
  const robot = selectedRobot();
  const [target] = robotTargets();
  if (!robot || !target) { notify('info', t('notice.robotNone')); return null; }
  const r = inverseKinematics(robotLocal(robot, target), robotJoints(robot), robotOptions(robot));
  change('op.robot', (d) => setRobotJoints(d, robot.id, r.joints));
  notify(r.reached ? 'success' : 'error', r.reached ? t('notice.robotMoved') : t('notice.robotFar', { error: fmt(r.error, 1) }));
  return r;
}

/** Plays joint poses in the 3D view (the drawing itself is not changed until the end). */
async function animateRobot(id, poses, ms = 40) {
  const doc = activeDoc();
  if (!doc || !state.view3d || !view3d.instance) return;
  const original = doc.drawing.entities;
  try {
    for (const joints of poses) {
      doc.drawing.entities = original.map((e) => (e.id === id ? { ...e, params: { ...e.params, ...Object.fromEntries(joints.map((v, i) => [`a${i + 1}`, v])) } } : e));
      // The tool shape on the flange moves with the arm.
      if (doc.drawing.robots) followRobotTools(doc.drawing);
      rebuild3d();
      view3d.instance.render?.();
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  } finally {
    doc.drawing.entities = original;
  }
}

/** A trajectory along the selected curves: joint poses every 20 mm, KUKA KRL saved, played in 3D. */
async function robotTrajectory({ save = true, animate = true, step = 20, robot: given = null, targets: path = null } = {}) {
  const robot = given ?? selectedRobot();
  const targets = path ?? robotTargets();
  if (!robot || !targets.length) { notify('info', t('notice.robotNone')); return null; }
  const doc = activeDoc();
  const points = samplePath(targets.map((p) => robotLocal(robot, p)), step);
  const run = trajectory(points, robotJoints(robot), robotOptions(robot));
  const text = toKrl(run.steps, { name: robot.name || 'mycad_path' });
  if (animate) await animateRobot(robot.id, run.steps.map((s) => s.joints));
  change('op.robot', (d) => setRobotJoints(d, robot.id, run.steps[run.steps.length - 1].joints));
  const missed = run.steps.filter((s) => s.error >= 0.5).length;
  notify(missed ? 'error' : 'success', missed ? t('notice.robotPathFar', { count: missed, total: run.steps.length }) : t('notice.robotPath', { count: run.steps.length }));
  if (save) {
    const name = `${safeFileName(stripExtension(docName(doc)))}-robot.src`;
    try {
      if (desktop) {
        const path = await native.chooseExportPath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${name}`, 'krl');
        if (path) {
          await withProgress('progress.export', baseName(path), (op) => native.writeTextFile(path, text, op));
          notify('success', t('notice.exported', { name: baseName(path) }));
        }
      } else {
        native.downloadText(text, name, 'text/plain');
        notify('success', t('notice.exported', { name }));
      }
    } catch (error) {
      showError('error.export', error, name);
    }
  }
  return { ...run, text };
}

/** Values of the entity bound to spreadsheet expressions: key = expression, each removable. */
function bindRows(entity) {
  if (!entity.bind) return '';
  return `<h4>${icon('spreadsheet')}<span>${t('bind.title')}</span></h4>${Object.entries(entity.bind).map(([key, expression]) => `<div class="bind-row" title="${escapeHtml(t('bind.tip'))}"><code>${escapeHtml(`${key.replace(/^params\./, '')} = ${expression}`)}</code><button class="icon-button" data-bind-remove="${escapeHtml(key)}" title="${escapeHtml(t('bind.remove'))}" aria-label="${escapeHtml(t('bind.remove'))}">${icon('unlink')}</button></div>`).join('')}`;
}

/** The spreadsheet window (FreeCAD Spreadsheet); its aliases feed the expressions. */
async function openSpreadsheet(resultArg = null) {
  const doc = activeDoc();
  if (!doc) return null;
  const result = resultArg ?? await popups.open('spreadsheet', { sheet: doc.drawing.spreadsheet ?? {} });
  // Spreadsheet_Import from the window: the file's cells over what was being edited, then the window again.
  if (result?.action === 'import') {
    await importSheetCsv(result.sheet);
    return openSpreadsheet();
  }
  if (!result || !['apply', 'csv'].includes(result.action)) return null;
  const sheet = normalizeSpreadsheet(result.sheet);
  change('op.sheet', (d) => { if (Object.keys(sheet.cells).length) d.spreadsheet = sheet; else delete d.spreadsheet; });
  setExpressionScope();
  if (result.action === 'csv') {
    const text = sheetCsv(sheet);
    const name = `${safeFileName(stripExtension(docName(doc)))}-sheet.csv`;
    try {
      if (desktop) {
        const path = await native.chooseExportPath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${name}`, 'csv');
        if (path) { await native.writeTextFile(path, `\ufeff${text}`); notify('success', t('notice.exported', { name: baseName(path) })); }
      } else native.downloadText(`\ufeff${text}`, name, 'text/csv');
    } catch (error) { showError('error.export', error, name); }
  }
  return sheet;
}

/** Bytes (a zip…) saved where the user picks (desktop) or downloaded (web). */
async function saveBytes(name, bytes, kind) {
  try {
    if (desktop) {
      const path = await native.chooseExportPath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${name}`, kind);
      if (!path) return null;
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      await withProgress('progress.export', baseName(path), (op) => native.writeBase64File(path, btoa(binary), op));
      notify('success', t('notice.exported', { name: baseName(path) }));
      return path;
    }
    native.downloadBytes(bytes, name);
    notify('success', t('notice.exported', { name }));
    return name;
  } catch (error) {
    showError('error.export', error, name);
    return null;
  }
}

/** A text file saved where the user picks (desktop) or downloaded (web); kind names the file filter. */
async function saveText(name, text, kind) {
  try {
    if (desktop) {
      const path = await native.chooseExportPath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${name}`, kind);
      if (!path) return null;
      await withProgress('progress.export', baseName(path), (op) => native.writeTextFile(path, text, op));
      notify('success', t('notice.exported', { name: baseName(path) }));
      return path;
    }
    native.downloadText(text, name, 'text/plain');
    notify('success', t('notice.exported', { name }));
    return name;
  } catch (error) {
    showError('error.export', error, name);
    return null;
  }
}

/**
 * Spreadsheet_Import: a CSV file's values into the drawing's spreadsheet from A1
 * (aliases and styles stay); an open spreadsheet window shows it. `given`
 * ({ text, name }) skips the file dialog (macros, tests).
 */
/** A text file the user picks (desktop dialog or web file input): { text, name } or null. */
async function readTextFileDialog(extensions) {
  let name = '';
  try {
    if (desktop) {
      const path = await native.chooseTextFile(state.settings.lastDirectory, extensions);
      if (!path) return null;
      name = baseName(path);
      return { text: await native.readTextFile(path, 'text'), name };
    }
    const [file] = await native.pickWithInput(extensions.map((e) => `.${e}`).join(','));
    if (!file) return null;
    return { text: await file.text(), name: file.name };
  } catch (error) {
    showError('error.open', error, name);
    return null;
  }
}

async function importSheetCsv(base = null, given = null) {
  const doc = activeDoc();
  if (!doc) return null;
  const file = given ?? await readTextFileDialog(['csv', 'txt']);
  if (!file) return null;
  const { text, name } = file;
  const parsed = parseCsv(text);
  const sheet = normalizeSpreadsheet({ ...(base ?? doc.drawing.spreadsheet ?? {}), cells: parsed.cells });
  change('op.sheet', (d) => { d.spreadsheet = sheet; });
  setExpressionScope();
  if (popups.isOpen('spreadsheet')) popups.post('spreadsheet', { type: 'sheet:load', sheet });
  notify('success', t('sheet.imported', { name, count: Object.keys(parsed.cells).length }));
  return sheet;
}

/** Construction geometry on/off for the selection (Sketcher: toggle construction). */
function toggleConstruction() {
  const list = selectedEntities().filter((e) => e.type !== 'solid');
  if (!list.length) return;
  const on = !list.every((e) => e.construction);
  change('op.construction', (d) => { for (const e of list) D.updateEntity(d, e.id, { construction: on }); });
  notify('success', t(on ? 'notice.constructionOn' : 'notice.constructionOff', { count: list.length }));
}

/** The selection in the order it was picked. */
const pickedEntities = () => {
  const drawing = activeDrawing();
  // The sketch's origin and axes picked with Sketcher_SelectOrigin / …HorizontalAxis / …VerticalAxis come last.
  return drawing ? [...selectedIds().map((id) => D.findEntity(drawing, id)).filter(Boolean), ...(state.sketchRefs ?? []).map((id) => VIRTUAL_ENTITIES[id]).filter(Boolean)] : [];
};

/** Which points / entities a constraint of this type would take from the selection (null = it does not fit). */
function constraintRefs(type) {
  const ents = pickedEntities();
  if (!ents.length) return null;
  let refs;
  if (type === 'fixed') refs = ents.map((e) => ({ id: e.id }));
  else if (type === 'snellsLaw') {
    // Two rays (their ends that meet) and the boundary they cross.
    if (ents.length !== 3) return null;
    const meet = nearestPoints(ents[0], ents[1]);
    refs = meet ? [...meet, { id: ents[2].id }] : null;
  } else if (ents.length === 1) refs = [{ id: ents[0].id }];
  else if (ents.length !== 2 && type !== 'symmetric') return null;
  else if (type === 'symmetric') {
    if (ents.length !== 3 || ents[2].type !== 'line') return null;
    const l = ents[2];
    const off = (p) => Math.abs((l.x2 - l.x1) * (p.y - l.y1) - (l.y2 - l.y1) * (p.x - l.x1));
    const nearest = (e) => pointsOf(e).sort((p, q) => off(entityPoint(e, p)) - off(entityPoint(e, q)))[0];
    const [pa, pb] = [nearest(ents[0]), nearest(ents[1])];
    refs = pa && pb ? [{ id: ents[0].id, at: pa }, { id: ents[1].id, at: pb }, { id: l.id }] : null;
  } else if (['coincident', 'horizontal', 'vertical', 'distance', 'distanceX', 'distanceY'].includes(type)) refs = nearestPoints(ents[0], ents[1]);
  else if (type === 'pointOnObject') {
    // The point of the first that lies nearest the second (a line or a circle).
    const [a, b] = ents;
    const curve = b.type === 'spline' ? primitives(b)[0].points : null;
    const off = (p) => (b.type === 'line'
      ? Math.abs((b.x2 - b.x1) * (p.y - b.y1) - (b.y2 - b.y1) * (p.x - b.x1)) / (Math.hypot(b.x2 - b.x1, b.y2 - b.y1) || 1)
      : curve ? Math.min(...curve.map((q) => Math.hypot(q.x - p.x, q.y - p.y)))
        : Math.abs(Math.hypot(p.x - b.cx, p.y - b.cy) - (b.r ?? 0)));
    const at = pointsOf(a).sort((p, q) => off(entityPoint(a, p)) - off(entityPoint(a, q)))[0];
    refs = at ? [{ id: a.id, at }, { id: b.id }] : null;
  } else if (type === 'tangent' && ents.some((e) => e.type === 'spline')) {
    // A B-spline is tangent at one of its ends: the end nearest the other (a line, or another spline's end).
    const ends = (e) => (e.type === 'spline' ? ['start', 'end'] : pointsOf(e));
    let best = null;
    for (const pa of ends(ents[0])) for (const pb of ends(ents[1])) {
      const d = Math.hypot(entityPoint(ents[0], pa).x - entityPoint(ents[1], pb).x, entityPoint(ents[0], pa).y - entityPoint(ents[1], pb).y);
      if (!best || d < best.d) best = { d, refs: [{ id: ents[0].id, ...(ents[0].type === 'spline' ? { at: pa } : {}) }, { id: ents[1].id, ...(ents[1].type === 'spline' ? { at: pb } : {}) }] };
    }
    refs = best?.refs ?? null;
  } else refs = ents.map((e) => ({ id: e.id }));
  if (!refs) return null;
  return canConstrain(type, refs.map((r) => ents.find((e) => e.id === r.id)), refs) ? refs : null;
}

/** Adds a constraint on the selection and solves; tells when it conflicts or is redundant. */
function constrainSelection(type, value = null) {
  const refs = constraintRefs(type);
  if (!refs) { notify('info', t('constraint.pick')); return null; }
  const made = change('op.constrain', (d) => addConstraint(d, type, refs, value));
  if (made) state.sketchRefs = [];
  const status = activeDoc()?.constraintStatus;
  if (status?.status === 'conflict') notify('error', t('constraint.conflict'));
  else if (status?.status === 'over') notify('info', t('constraint.redundant'));
  else notify('success', t('constraint.added', { name: t(`constraint.${type}`), status: constraintStatusText(status) }));
  if (made && DIMENSIONAL.includes(type)) setTimeout(() => focusConstraint(made.id), 40);
  return made;
}

function constraintStatusText(status) {
  if (!status || status.status === 'none') return t('constraint.none');
  if (status.status === 'full') return t('constraint.full');
  if (status.status === 'conflict') return t('constraint.conflictShort');
  if (status.status === 'over') return t('constraint.overShort');
  return t('constraint.dof', { n: status.dof });
}

function constraintStatusHtml() {
  const status = activeDoc()?.constraintStatus;
  if (!activeDrawing()?.constraints?.length) return '';
  return `<div class="constraint-status status-${status?.status ?? 'none'}" id="constraint-status">${icon(status?.status === 'conflict' ? 'warning' : status?.status === 'full' ? 'check' : 'kCoincident')}<span>${escapeHtml(constraintStatusText(status))}</span></div>`;
}

/** The constraints on an entity in its properties: value boxes for dimensions, a remove button each. */
function constraintRows(entity) {
  const list = (activeDrawing()?.constraints ?? []).filter((c) => c.refs.some((r) => r.id === entity.id));
  if (!list.length) return '';
  const picked = new Set(state.constraintSelection ?? []);
  // Picked (Sketcher selection commands), inactive and reference constraints are marked; a click on the name picks one.
  const marks = (c) => [picked.has(c.id) ? 'picked' : '', c.active === false ? 'inactive' : '', c.driving === false ? 'reference' : '', c.virtual ? 'virtual' : ''].filter(Boolean).join(' ');
  return `<h4>${icon('kCoincident')}<span>${t('constraint.title')}</span></h4>${constraintStatusHtml()}<div class="constraint-list">${list.map((c) => `<div class="constraint-row ${marks(c)}" data-constraint="${c.id}">${icon(commands[`constrain:${c.type}`].icon)}<span class="constraint-name" data-constraint-pick="${c.id}" title="${escapeHtml(t('sk.pickConstraintTip'))}">${escapeHtml(t(`constraint.${c.type}`))}</span>${DIMENSIONAL.includes(c.type) ? `<input class="num" data-constraint-value="${c.id}" ${UNITLESS.includes(c.type) ? '' : 'data-length="1"'} value="${UNITLESS.includes(c.type) ? fmt(c.value, 4) : lengthText(c.value)}" title="${escapeHtml(t(`constraint.${c.type}`))}" ${c.driving === false ? 'readonly' : ''} />` : ''}<button class="icon-button" data-constraint-remove="${c.id}" title="${escapeHtml(t('constraint.remove'))}" aria-label="${escapeHtml(t('constraint.remove'))}">${icon('trash')}</button></div>`).join('')}</div>`;
}

function focusConstraint(id) {
  const input = root.querySelector(`#right-panel [data-constraint-value="${id}"]`);
  if (input) { input.focus(); input.select(); }
}

/** Draft Clone: copies that keep following their sources. */
function cloneSelection() {
  const grid = gridBaseFor(activeDrawing().grid?.size || 10);
  const made = change('op.clone', (drawing) => D.cloneEntities(drawing, selectedIds(), { x: grid, y: -grid }));
  if (!made?.length) return;
  select(made.map((entity) => entity.id));
  notify('success', t('notice.cloned', { count: made.length }));
}

/** Make independent: the clones become ordinary objects. */
function unlinkSelection() {
  const count = change('op.unlinkClone', (drawing) => D.unlinkClones(drawing, selectedIds()));
  if (count) notify('success', t('notice.unlinked', { count }));
}

/** A clone's panel: its source and its own transform (its shape comes from the source). */
function cloneRows(entity) {
  const source = D.findEntity(activeDrawing(), entity.clone.of);
  const c = entity.clone;
  const name = source ? (source.name || t(source.type === 'solid' ? `solid.${source.kind}` : `entity.${source.type}`)) : '—';
  return `<div class="clone-note">${icon('clone')}<span>${escapeHtml(t('clone.note', { name }))}</span></div>
    ${readField(t('clone.offset'), `${lengthValue(c.dx)}, ${lengthValue(c.dy)} ${unitLabel()}`, 'move')}
    ${readField(t('clone.angle'), `${formatNumber(c.angle)}°`, 'rotate')}
    ${readField(t('clone.scale'), `× ${formatNumber(c.scale)}${c.flip ? ` · ${t('clone.mirrored')}` : ''}`, 'scale')}
    <div class="prop-actions"><button class="small-button" data-command="cloneSource" title="${escapeHtml(t('action.cloneSource'))}">${icon('select')}<span>${t('action.cloneSource')}</span></button><button class="small-button" data-command="unlinkClone" title="${escapeHtml(commandTip('unlinkClone'))}">${icon('unlink')}<span>${t('action.unlinkClone')}</span></button></div>`;
}

function duplicateSelection() {
  const grid = gridBaseFor(activeDrawing().grid?.size || 10);
  const copies = change('op.duplicate', (drawing) => D.duplicateEntities(drawing, selectedIds(), { x: grid, y: -grid }));
  select(copies.map((entity) => entity.id));
  notify('success', t('notice.duplicated', { count: copies.length }));
}

function explodeSelection() {
  const targets = selectedEntities().filter(canExplode);
  const created = change('op.explode', (drawing) => {
    const out = [];
    for (const entity of targets) {
      const parts = explode(entity);
      D.removeEntities(drawing, [entity.id]);
      out.push(...D.insertEntities(drawing, parts));
    }
    return out;
  });
  select(created.map((entity) => entity.id));
  notify('success', t('notice.exploded', { count: targets.length, parts: created.length }));
}

function addLayer() {
  const layer = change('op.layer', (drawing) => D.addLayer(drawing, { base: t('layer.base') }));
  change('op.layer', (drawing) => { drawing.activeLayer = layer.id; });
  notify('success', t('notice.layerAdded', { name: layer.name }));
  return layer;
}

function undo() {
  const doc = activeDoc();
  const label = doc?.undo();
  if (!label) return notify('info', t('notice.nothingUndo'));
  pruneSelection();
  afterChange();
  return notify('success', t('notice.undone', { label }));
}

function redo() {
  const doc = activeDoc();
  const label = doc?.redo();
  if (!label) return notify('info', t('notice.nothingRedo'));
  pruneSelection();
  afterChange();
  return notify('success', t('notice.redone', { label }));
}

// ───────────────────────── clipboard

async function copySelection({ silent = false } = {}) {
  const entities = selectedEntities();
  if (!entities.length) return 0;
  const text = entitiesToClipboard(entities, activeDrawing().layers);
  state.clipboard = text;
  try {
    await native.clipboardWrite(text);
  } catch (error) {
    if (desktop) throw error;
  }
  if (!silent) notify('success', t('notice.copied', { count: entities.length }));
  renderToolbarState();
  return entities.length;
}

async function cutSelection() {
  const ids = selectedIds();
  const count = await copySelection({ silent: true });
  if (!count) return;
  change('op.cut', (drawing) => D.removeEntities(drawing, ids));
  select([]);
  notify('success', t('notice.cut', { count }));
}

async function paste() {
  let text = '';
  try {
    text = await native.clipboardRead();
  } catch (error) {
    if (desktop) return showError('error.paste', error);
  }
  text = text || (desktop ? '' : state.clipboard);
  if (!text) return notify('info', t('notice.clipboardEmpty'));
  return pasteText(text);
}

/** Pastes clipboard text: MyCAD entities (at the cursor), DXF, or plain text as a text entity. */
function pasteText(text, at = null) {
  const drawing = activeDrawing();
  if (!drawing) return null;
  const clip = entitiesFromClipboard(text);
  const target = at ?? state.cursor ?? boxCenter(activeDoc().vp.worldBox());
  if (clip) {
    // Layers that the drawing does not have come along.
    const created = change('op.paste', (d) => {
      for (const layer of clip.layers) if (!D.findLayer(d, layer.id)) d.layers.push(D.normalizeLayer(layer));
      const added = D.insertEntities(d, clip.entities);
      const box = boxOfEntities(added);
      if (box) {
        const center = boxCenter(box);
        D.transformEntities(d, added.map((entity) => entity.id), { type: 'move', dx: target.x - center.x, dy: target.y - center.y });
      }
      return added.map((entity) => entity.id);
    });
    select(created);
    notify('success', t('notice.pasted', { count: created.length }));
    return created;
  }
  if (looksLikeDxf(text)) {
    const { drawing: imported } = importDxf(text, { language: getLanguage() });
    const created = change('op.paste', (d) => D.insertEntities(d, imported.entities.map((entity) => ({ ...entity, layer: d.activeLayer }))).map((entity) => entity.id));
    select(created);
    notify('success', t('notice.pasted', { count: created.length }));
    return created;
  }
  const entity = change('op.paste', (d) => D.addEntity(d, 'text', { x: target.x, y: target.y, text: String(text).slice(0, 5000), size: state.settings.textHeight, layer: toolApi().layerFor('text') }));
  select([entity.id]);
  notify('success', t('notice.pastedText'));
  return [entity.id];
}

// ───────────────────────── settings, theme

function updateSettings(patch) {
  const previous = state.settings;
  state.settings = { ...state.settings, ...patch };
  // Safe mode (Std_RestartInSafeMode) runs on defaults and leaves the stored settings alone.
  if (!state.safeMode) storeSettings(globalThis.localStorage, state.settings);
  applySettings(previous);
}

/** Applies settings after a change (from this window or from the settings popup). */
function applySettings(previous = {}) {
  const s = state.settings;
  const theme = resolveTheme(s.theme, prefersDark(), s.customTheme);
  applyTheme(theme);
  applyFont(s);
  native.setWindowTheme(theme.dark);
  // The Save dialog's options start from the remembered choice; a new choice is remembered.
  native.setSaveOptions(s.saveOptions, (options) => updateSettings({ saveOptions: options }));
  if (s.language !== getLanguage()) {
    setLanguage(s.language);
    native.setBackendLanguage(s.language);
    if (previous.language) notify('info', t('notice.language'));
    if (isDocViewerOpen()) openTutorialDoc();
  }
  if (s.backgroundImage !== previous.backgroundImage) loadBackground();
  if (s.theme !== previous.theme && previous.theme) notify('info', t('notice.theme', { name: themeName(s.theme, getLanguage()) }));
  root.classList.toggle('no-status', !s.showStatusBar);
  if (setDisplayUnit(s.units)) {
    if (previous.units) notify('info', t('notice.units', { unit: t(`units.${s.units}`) }));
    if (view3d.instance) rebuild3d();
  }
  renderAll();
  updateScaleBar();
}

async function openThemePicker(anchor) {
  const element = root.querySelector('.split-button') ?? root.querySelector('[data-command="themeMenu"]');
  const result = await popups.open('theme', { current: state.settings.theme }, { anchor: anchor ?? anchorBelow(element) });
  if (result?.theme) updateSettings({ theme: result.theme });
}

// ───────────────────────── background image

async function loadBackground() {
  const layer = root.querySelector('.canvas-image');
  if (!layer) return;
  try {
    const url = await native.backgroundUrl(state.settings);
    layer.style.backgroundImage = url ? `url("${url}")` : 'none';
    layer.classList.toggle('has-image', Boolean(url));
  } catch (error) {
    layer.style.backgroundImage = 'none';
    showError('error.background', error);
  }
}

function applyBackgroundStyle() {
  const layer = root.querySelector('.canvas-image');
  if (!layer) return;
  const fit = state.settings.backgroundFit;
  layer.style.opacity = String(state.settings.backgroundOpacity / 100);
  layer.style.backgroundSize = { cover: 'cover', contain: 'contain', tile: 'auto', center: 'auto', stretch: '100% 100%' }[fit];
  layer.style.backgroundRepeat = fit === 'tile' ? 'repeat' : 'no-repeat';
  layer.style.backgroundPosition = 'center';
}

async function chooseBackground() {
  try {
    if (desktop) {
      const path = await native.chooseImage(state.settings.lastDirectory);
      if (path) await setBackgroundFromPath(path);
    } else {
      const [file] = await native.pickWithInput('image/*');
      if (file) await setBackgroundFromFile(file);
    }
  } catch (error) {
    showError('error.background', error);
  }
}

async function setBackgroundFromPath(path) {
  const stored = await withProgress('progress.background', baseName(path), (op) => native.importBackground(path, op));
  updateSettings({ backgroundImage: stored, backgroundName: baseName(path), lastDirectory: directoryOf(path) || state.settings.lastDirectory });
  await loadBackground();
  notify('success', t('notice.background'));
}

async function setBackgroundFromFile(file) {
  await withProgress('progress.background', file.name, async (op, report) => { report({ done: 0, total: file.size }); await native.storeWebBackground(file); report({ done: file.size, total: file.size }); });
  updateSettings({ backgroundImage: `web:${file.name}:${Date.now()}`, backgroundName: file.name });
  await loadBackground();
  notify('success', t('notice.background'));
}

async function removeBackground() {
  await native.clearBackground();
  updateSettings({ backgroundImage: null, backgroundName: '' });
  notify('success', t('notice.backgroundCleared'));
}

// ───────────────────────── progress

let opCounter = 0;
/**
 * Runs a file task; when it takes longer than a moment, a progress popup shows
 * how far it got (bytes read/written, reported by the backend or by `report`).
 */
async function withProgress(titleKey, name, task) {
  opCounter += 1;
  const op = `op-${Date.now().toString(36)}-${opCounter}`;
  let shown = false;
  let last = null;
  const timer = setTimeout(() => {
    shown = true;
    popups.open('progress', { title: t(titleKey), name, op, last });
  }, 250);
  const unlisten = await native.listen('io-progress', (progress) => {
    if (progress.op !== op) return;
    last = progress;
    if (shown) popups.post('progress', { type: 'progress', ...progress });
  });
  try {
    return await task(op, (progress) => {
      last = { op, ...progress };
      if (shown) popups.post('progress', { type: 'progress', ...last });
    });
  } finally {
    clearTimeout(timer);
    unlisten();
    if (shown) {
      popups.post('progress', { type: 'done' });
      setTimeout(() => popups.close('progress'), 250);
    }
  }
}

// ───────────────────────── files

const samePath = (a, b) => String(a).replace(/\\/g, '/').toLowerCase() === String(b).replace(/\\/g, '/').toLowerCase();
const findOpenDoc = (path) => state.docs.find((doc) => doc.path && samePath(doc.path, path));

function rememberRecent(entry) {
  state.recent = addRecent(state.recent, entry);
  storeRecent(globalThis.localStorage, state.recent);
}

/** A drawing from 2D CAD file bytes: DXF (text or binary, any code page), SVG, HP-GL, IGES, Gerber, Excellon. */
function drawingFromBytes(name, bytes) {
  const result = importDrawingBytes(name, bytes, { language: getLanguage() });
  const skipped = Object.entries(result.skipped ?? {}).map(([type, count]) => `${type} ${count}`).join(', ');
  return { drawing: result.drawing, format: result.format, note: skipped ? t('notice.dxfSkipped', { list: skipped }) : '' };
}

/** Opens 2D CAD bytes as a new (unsaved) drawing named after the file. */
function openDrawingBytes(name, bytes, { quiet = false } = {}) {
  const { drawing, format, note } = drawingFromBytes(name, bytes);
  const doc = addDocument(new DrawingDocument(drawing, { name: baseName(name), format }));
  renderAll();
  if (!quiet) notify(note ? 'info' : 'success', `${t('notice.opened', { name: baseName(name) })}${note ? ` · ${note}` : ''}`);
  return doc;
}

/** A drawing from file text: .mcad JSON, or DXF. */
function drawingFromText(name, text) {
  if (isDxfFileName(name) || looksLikeDxf(text)) {
    const result = importDxf(text, { title: stripExtension(baseName(name)) || 'DXF', language: getLanguage() });
    const skipped = Object.entries(result.skipped).map(([type, count]) => `${type} ${count}`).join(', ');
    return { drawing: result.drawing, format: 'dxf', note: skipped ? t('notice.dxfSkipped', { list: skipped }) : '' };
  }
  return { drawing: parseFile(text, getLanguage()), format: 'mcad', note: '' };
}

async function openPath(path, { quiet = false } = {}) {
  const existing = findOpenDoc(path);
  if (existing) {
    activateDoc(existing.id);
    if (!quiet) notify('info', t('notice.alreadyOpen', { name: baseName(path) }));
    return existing;
  }
  try {
    if (isCadDrawingFileName(path)) {
      const bytes = await withProgress('progress.open', baseName(path), (op) => native.readBinaryFile(path, op));
      const doc = openDrawingBytes(path, bytes, { quiet });
      rememberRecent({ path, title: doc.drawing.title });
      updateSettings({ lastDirectory: directoryOf(path) || state.settings.lastDirectory });
      return doc;
    }
    if (isModelFileName(path)) {
      const bytes = await withProgress('progress.open', baseName(path), (op) => native.readBinaryFile(path, op));
      const doc = openModelBytes(baseName(path), bytes);
      rememberRecent({ path, title: doc.drawing.title });
      updateSettings({ lastDirectory: directoryOf(path) || state.settings.lastDirectory });
      return doc;
    }
    const text = await withProgress('progress.open', baseName(path), (op) => native.readTextFile(path, op));
    const { drawing, format, note } = drawingFromText(path, text);
    const doc = addDocument(new DrawingDocument(drawing, { path: format === 'mcad' ? path : null, name: format === 'dxf' ? `${stripExtension(baseName(path))}.dxf` : null, format }));
    rememberRecent({ path, title: drawing.title });
    updateSettings({ lastDirectory: directoryOf(path) || state.settings.lastDirectory });
    if (!quiet) notify(note ? 'info' : 'success', `${t('notice.opened', { name: baseName(path) })}${note ? ` · ${note}` : ''}`);
    return doc;
  } catch (error) {
    if (!quiet) showError('error.open', error, path);
    return null;
  }
}

function openText(name, text, handle = null) {
  const { drawing, format, note } = drawingFromText(name, text);
  const doc = addDocument(new DrawingDocument(drawing, { name: format === 'dxf' ? name : name, handle: format === 'mcad' ? handle : null, format }));
  if (handle && format === 'mcad') {
    native.storeWebHandle(name, handle);
    rememberRecent({ path: name, title: drawing.title, web: true });
  }
  renderAll();
  notify(note ? 'info' : 'success', `${t('notice.opened', { name })}${note ? ` · ${note}` : ''}`);
  return doc;
}

async function openWithDialog({ dxf = false } = {}) {
  try {
    if (desktop) {
      const paths = await native.chooseDrawingToOpen(state.settings.lastDirectory, { dxf });
      for (const path of paths) await openPath(path);
    } else {
      const files = await native.pickDrawingFilesWeb({ dxf });
      for (const file of files) {
        try {
          await withProgress('progress.open', file.name, async (op, report) => { report({ done: file.size ?? 0, total: file.size ?? 0 }); });
          if (file.bytes) { if (isCadDrawingFileName(file.name)) openDrawingBytes(file.name, file.bytes); else openModelBytes(file.name, file.bytes); } else openText(file.name, file.text, file.handle);
        } catch (error) {
          showError('error.open', error, file.name);
        }
      }
    }
  } catch (error) {
    showError('error.open', error);
  }
  renderAll();
}

async function saveDoc(doc, { saveAs = false } = {}) {
  if (!doc) return false;
  let text = serialize(doc.drawing, { compact: Boolean(state.settings.saveOptions?.compact) });
  try {
    if (desktop) {
      let path = doc.path;
      if (!path || saveAs || doc.format !== 'mcad') {
        const suggested = `${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${safeFileName(stripExtension(docName(doc)))}.mcad`;
        path = await native.chooseDrawingToSave(suggested);
        if (!path) return false;
        path = withExtension(path);
        // The options just chosen in the dialog (compact or not).
        text = serialize(doc.drawing, { compact: Boolean(native.currentSaveOptions().compact) });
      } else if (state.settings.saveOptions?.backup) {
        await native.backupFile(path);
      }
      await withProgress('progress.save', baseName(path), (op) => native.writeTextFile(path, text, op));
      doc.markSaved(path);
      rememberRecent({ path, title: doc.drawing.title });
      updateSettings({ lastDirectory: directoryOf(path) || state.settings.lastDirectory });
    } else {
      const name = `${safeFileName(stripExtension(docName(doc)))}.mcad`;
      const saved = await withProgress('progress.save', name, () => native.saveTextWeb(text, { name, handle: doc.format === 'mcad' ? doc.handle : null, saveAs }));
      if (!saved) return false;
      doc.handle = saved.handle;
      doc.name = saved.name;
      doc.markSaved(null);
      if (saved.handle) {
        native.storeWebHandle(saved.name, saved.handle);
        rememberRecent({ path: saved.name, title: doc.drawing.title, web: true });
      }
    }
    persistSession();
    renderTabs();
    renderStatus();
    notify('success', t('notice.saved', { name: docName(doc) }));
    return true;
  } catch (error) {
    showError('error.save', error, doc.path ?? docName(doc));
    return false;
  }
}

async function saveAll() {
  for (const doc of state.docs.filter((item) => item.dirty)) {
    if (!(await saveDoc(doc))) return false;
  }
  return true;
}

/** PNG of the drawing (white background, true colours), `scale` px per mm. */
function renderPng(drawing, { pxPerMm = 8, margin = 10 } = {}) {
  const box = D.extents(drawing) ?? { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const max = 8000;
  let k = pxPerMm;
  const wmm = boxWidth(box) + margin * 2;
  const hmm = boxHeight(box) + margin * 2;
  k = Math.min(k, max / Math.max(wmm, 1e-6), max / Math.max(hmm, 1e-6));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(wmm * k));
  canvas.height = Math.max(1, Math.round(hmm * k));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const vp = new Viewport({ cx: (box.minX + box.maxX) / 2, cy: (box.minY + box.maxY) / 2, zoom: k, width: canvas.width, height: canvas.height });
  const colors = { ...canvasColors(), canvas: '#ffffff', ink: '#000000', grid: '#ffffff', gridMajor: '#ffffff', ucs: 'rgba(0,0,0,0)' };
  render(ctx, { drawing, vp, colors, settings: { ...state.settings, showGrid: false, crosshair: false, showLineWeights: true, output: true, showConstraints: false }, selection: new Set(), dpr: 1 });
  return canvas.toDataURL('image/png');
}

async function exportAs(kind) {
  const doc = activeDoc();
  if (!doc) return;
  const drawing = doc.drawing;
  const extension = kind === 'dxf2000' ? 'dxf' : kind;
  const name = `${safeFileName(stripExtension(docName(doc)))}.${extension}`;
  const fonts = { family: state.settings.fontFamily || '', weight: state.settings.fontWeight, style: state.settings.fontStyle };
  try {
    if (kind === 'png') {
      const dataUrl = renderPng(drawing);
      const base64 = dataUrl.split(',')[1];
      if (desktop) {
        const path = await native.chooseExportPath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${name}`, kind);
        if (!path) return;
        await withProgress('progress.export', baseName(path), (op) => native.writeBase64File(path, base64, op));
        updateSettings({ lastDirectory: directoryOf(path) || state.settings.lastDirectory });
        notify('success', t('notice.exported', { name: baseName(path) }));
      } else {
        native.downloadDataUrl(dataUrl, name);
        notify('success', t('notice.exported', { name }));
      }
      return;
    }
    const text = kind === 'dxf' ? exportDxf(drawing) : kind === 'dxf2000' ? exportDxf2000(drawing) : kind === 'plt' ? exportHpgl(drawing)
      : kind === 'igs' ? exportIges(drawing, { author: state.settings.author, file: name }) : exportSvg(drawing, { fonts });
    if (desktop) {
      const path = await native.chooseExportPath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${name}`, kind);
      if (!path) return;
      await withProgress('progress.export', baseName(path), (op) => native.writeTextFile(path, text, op));
      updateSettings({ lastDirectory: directoryOf(path) || state.settings.lastDirectory });
      notify('success', t('notice.exported', { name: baseName(path) }));
    } else {
      native.downloadText(text, name, { svg: 'image/svg+xml', plt: 'application/vnd.hp-hpgl', igs: 'model/iges' }[kind] ?? 'application/dxf');
      notify('success', t('notice.exported', { name }));
    }
  } catch (error) {
    showError('error.export', error, name);
  }
}

function openExportMenu(anchor) {
  const element = root.querySelector('[data-command="exportMenu"]');
  showMenu(menuItems(['exportDxf', 'exportDxf2000', 'exportSvg', 'exportIges', 'exportHpgl', 'exportPng', '-', 'exportStl', ...EXPORT_3D.map((format) => `export3d:${format}`), '-', 'cam', '-', 'print']), anchor ?? anchorBelow(element), 'export', { header: { icon: 'export', title: t('action.exportMenu') } });
}

async function closeDoc(doc, { force = false } = {}) {
  if (!doc) return true;
  if (doc.dirty && !force) {
    activateDoc(doc.id);
    const choice = await ask({
      icon: 'save', title: t('confirm.exitTitle'), message: t('confirm.closeTabMessage', { name: docName(doc) }),
      buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }],
    });
    if (choice === 'save' && !(await saveDoc(doc))) return false;
    if (choice !== 'save' && choice !== 'discard') return false;
  }
  const index = state.docs.indexOf(doc);
  state.docs.splice(index, 1);
  if (state.active === doc.id) {
    const next = state.docs[Math.min(index, state.docs.length - 1)];
    activate_(next?.id ?? null);
  }
  persistSession();
  renderAll();
  return true;
}

async function closeOthers(keep) {
  for (const doc of [...state.docs]) {
    if (doc !== keep && !(await closeDoc(doc))) return;
  }
  activateDoc(keep.id);
}

async function openRecent(path) {
  const entry = state.recent.find((item) => item.path === path);
  if (entry?.web || !desktop) {
    const handle = await native.loadWebHandle(path);
    if (!handle) return notify('error', t('web.reopen', { name: path }));
    try {
      if ((await handle.queryPermission?.({ mode: 'read' })) !== 'granted') await handle.requestPermission?.({ mode: 'read' });
      const file = await handle.getFile();
      openText(file.name, await file.text(), handle);
    } catch (error) {
      showError('error.open', error, path);
    }
    return undefined;
  }
  const [exists] = await native.pathsExist([path]);
  if (!exists) {
    showError('error.open', new Error(t('error.recentMissing', { path })), path);
    return undefined;
  }
  await openPath(path);
  renderAll();
  return undefined;
}

// ───────────────────────── print

function openPrint() {
  const doc = activeDoc();
  popups.open('print', {
    drawings: state.docs.map((item) => item.drawing),
    names: state.docs.map(docName),
    current: state.docs.indexOf(doc),
    selected: selectedIds(),
    fonts: { family: state.settings.fontFamily || '', weight: state.settings.fontWeight, style: state.settings.fontStyle },
  });
}

// ───────────────────────── 3D printing (STL)

/** The STL window: thickness, what to print, binary/ASCII. Writes the extruded solid. */
async function openStlDialog() {
  const doc = activeDoc();
  if (!doc) return undefined;
  const result = await popups.open('stl', { drawing: doc.drawing, selected: selectedIds(), name: stripExtension(docName(doc)) });
  if (result?.action !== 'export') return undefined;
  return exportStl({ thickness: result.thickness, scope: result.scope, ascii: result.ascii });
}

async function exportStl({ thickness = 5, scope = 'all', ascii = false } = {}) {
  const doc = activeDoc();
  const drawing = doc.drawing;
  const pool = drawing.entities.filter((entity) => D.isVisible(drawing, entity));
  const entities = scope === 'selection' ? pool.filter((entity) => state.selection.has(entity.id)) : pool;
  const name = `${safeFileName(stripExtension(docName(doc)))}.stl`;
  try {
    const mesh = prepareStl(entities, drawing, { thickness });
    if (!mesh.triangles.length) {
      showError('error.stl', new Error(t('stl.noOutline')), name);
      return null;
    }
    const bytes = ascii ? new TextEncoder().encode(toAsciiStl(mesh.triangles, drawing.title)) : toBinaryStl(mesh.triangles, drawing.title);
    if (desktop) {
      const path = await native.chooseExportPath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${name}`, 'stl');
      if (!path) return null;
      await withProgress('progress.export', baseName(path), (op) => native.writeBase64File(path, toBase64(bytes), op));
      updateSettings({ lastDirectory: directoryOf(path) || state.settings.lastDirectory });
      notify('success', t('notice.stlExported', { name: baseName(path), count: mesh.triangles.length }));
    } else {
      native.downloadBytes(bytes, name, 'model/stl');
      notify('success', t('notice.stlExported', { name, count: mesh.triangles.length }));
    }
    return mesh;
  } catch (error) {
    showError('error.stl', error, name);
    return null;
  }
}

// ───────────────────────── parts and arrays

/** Part window: insert a new part (kind) or edit the selected one (entity). */
async function openPartDialog({ kind = null, category = null, entity = null } = {}) {
  if (!activeDoc()) return;
  const chosen = kind ?? (category ? PART_CATEGORIES[category][0] : null);
  if (chosen) state.partCategory = categoryOf(chosen);
  const result = await popups.open('part', entity
    ? { mode: 'edit', kind: entity.kind, params: entity.params, angle: entity.angle }
    : { mode: 'insert', kind: chosen, params: null, angle: 0 });
  if (!result) return;
  if (result.action === 'apply' && entity && D.findEntity(activeDrawing(), entity.id)) {
    change('op.editPart', (drawing) => D.updateEntity(drawing, entity.id, { kind: result.kind, params: result.params, angle: result.angle }));
    select([entity.id]);
  } else if (result.action === 'insert') {
    setTool('place', { part: { kind: result.kind, params: result.params, angle: result.angle } });
    notify('info', t('notice.placePart', { name: t(`part.${result.kind}`) }));
  }
}

async function openArrayDialog() {
  const entities = selectedEntities();
  if (!entities.length) return notify('info', t('notice.selectFirst'));
  const box = boxOfEntities(entities);
  const center = box ? boxCenter(box) : { x: 0, y: 0 };
  const result = await popups.open('array', { count: entities.length, width: box ? boxWidth(box) : 10, height: box ? boxHeight(box) : 10, cx: center.x, cy: center.y });
  if (result?.action !== 'apply') return undefined;
  const ids = selectedIds();
  const created = change('op.array', (drawing) => (result.mode === 'polar'
    ? D.polarArray(drawing, ids, { count: result.count, angle: result.angle, cx: result.cx, cy: result.cy, rotateItems: result.rotateItems })
    : D.rectangularArray(drawing, ids, { rows: result.rows, columns: result.columns, dx: result.dx, dy: result.dy })));
  select([...ids, ...created.map((entity) => entity.id)]);
  notify('success', t('notice.arrayed', { count: created.length }));
  return created;
}

// ───────────────────────── 3D solids (FreeCAD Part: primitives, features, booleans, section, projection)


/** Selected solids; with orAll, every visible solid when none is selected. */
function selectedSolids(orAll = false) {
  const chosen = selectedEntities().filter((entity) => entity.type === 'solid');
  if (chosen.length || !orAll) return chosen;
  const drawing = activeDrawing();
  return drawing ? drawing.entities.filter((entity) => entity.type === 'solid' && D.isVisible3d(drawing, entity)) : [];
}

const outlineSelection = () => selectedEntities().filter((entity) => !['solid', 'text', 'dim'].includes(entity.type));
const canFeature = (kind) => hasDoc() && outlineSelection().length >= (kind === 'loft' || kind === 'surfRuled' ? 2 : 1) && (!CUT_FEATURES.includes(kind) || selectedSolids().length === 1)
  && (kind !== 'hole' || outlineSelection().some((e) => e.type === 'circle'));

/** Centre of the canvas in drawing units, on the grid. */
function viewCenter() {
  const doc = activeDoc();
  const vp = ensureViewport(doc);
  const c = vp ? vp.toWorld(vp.width / 2, vp.height / 2) : { x: 0, y: 0 };
  const step = gridBaseFor(doc?.drawing.grid?.size || 10);
  return { x: Math.round(c.x / step) * step, y: Math.round(c.y / step) * step };
}

/** What a feature is made from: the outlines (or path) among the selected 2D entities. */
function featureSource(kind) {
  const drawing = activeDrawing();
  const entities = outlineSelection();
  if (!drawing || !entities.length) return null;
  const ids = entities.map((entity) => entity.id);
  const byArea = (loops) => loops.slice().sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
  if (kind === 'hole') {
    const circles = entities.filter((e) => e.type === 'circle').map((e) => ({ x: e.cx, y: e.cy, r: e.r }));
    return circles.length ? { source: { circles }, ids: entities.filter((e) => e.type === 'circle').map((e) => e.id), count: circles.length } : null;
  }
  if (kind === 'pad' || kind === 'pocket') {
    const shapes = buildShapes(collectLoops(entities, drawing).loops).map(({ outer, holes }) => ({ outer, holes }));
    return shapes.length ? { source: { shapes }, ids, count: entities.length } : null;
  }
  if (kind === 'surfRuled' || kind === 'surfExtrude') {
    // Open curves, in the order they were picked (lines, polylines, arcs, splines).
    const picked = pickedEntities().filter((entity) => !['solid', 'text', 'dim'].includes(entity.type));
    const curves = picked.flatMap((entity) => { const { loops, open } = collectLoops([entity], drawing); return [...open, ...loops.map((l) => [...l, l[0]])]; });
    if (curves.length < (kind === 'surfRuled' ? 2 : 1)) return null;
    return { source: kind === 'surfRuled' ? { curves } : { paths: curves }, ids, count: entities.length };
  }
  if (kind === 'surfFill') {
    const [shape] = buildShapes(collectLoops(entities, drawing).loops);
    return shape ? { source: { outer: shape.outer, holes: shape.holes }, ids, count: entities.length } : null;
  }
  if (kind === 'revolution' || kind === 'groove') {
    const [loop] = byArea(collectLoops(entities, drawing).loops);
    return loop ? { source: { loop }, ids, count: entities.length } : null;
  }
  if (kind === 'loft') {
    // Sections bottom to top in the order they were picked.
    const picked = pickedEntities().filter((entity) => !['solid', 'text', 'dim'].includes(entity.type));
    const loops = picked.map((entity) => byArea(collectLoops([entity], drawing).loops)[0]).filter(Boolean);
    return loops.length >= 2 ? { source: { sections: loops, bottom: loops[0], top: loops[1] }, ids, count: entities.length } : null;
  }
  if (kind === 'sweep') {
    const { loops, open } = collectLoops(entities, drawing);
    // An open path; a closed outline picked with it is the section (else a round pipe).
    const path = open.sort((a, b) => b.length - a.length)[0] ?? (loops[0] && loops.length === 1 ? [...loops[0], loops[0][0]] : null);
    const section = open.length && loops.length ? byArea(loops)[0] : null;
    return path && path.length >= 2 ? { source: { path, ...(section ? { section } : {}) }, ids, count: entities.length } : null;
  }
  return null;
}

async function solidFeature(kind) {
  const found = featureSource(kind);
  if (!found) { notify('info', t(`notice.feature.${kind}`)); return null; }
  const defaults = { pad: { height: state.settings.extrudeHeight }, loft: { height: state.settings.extrudeHeight * 2 }, revolution: { angle: 360 }, sweep: { radius: 2 }, pocket: { depth: 5 }, groove: { angle: 360 }, surfRuled: { height: 50 }, surfFill: { bulge: 20 }, surfExtrude: { height: 50 }, hole: { diameter: Math.round((found.source.circles?.[0]?.r ?? 3.3) * 2 * 100) / 100 } }[kind];
  const result = await popups.open('solid', { mode: 'feature', kind, source: found.source, count: found.count, params: defaults });
  if (result?.action !== 'feature') return null;
  return applyFeature(kind, found, result.params, result.axis);
}

/**
 * Pocket / Groove / Hole (PartDesign): the tool made from the outlines is cut
 * from the selected solid — kept as a Cut tree, as FreeCAD keeps its features.
 * The tool goes down from the solid's top (Pocket, Hole).
 */
function cutFeature(kind, found, params, axis = 'yAxis') {
  const target = selectedSolids()[0];
  if (!target) { notify('info', t('notice.featureTarget')); return null; }
  const box = meshBox(solidMesh(target));
  const top = box.max[2];
  const bottom = box.min[2];
  const p = normalizeSolidParams(kind, params);
  let tools;
  if (kind === 'pocket') {
    const through = p.through === 1;
    const depth = through ? top - bottom + 2 : p.depth;
    tools = [{ ...featureFrom('pad', found.source, { height: depth }), z: through ? bottom - 1 : top - depth }];
  } else if (kind === 'groove') tools = [featureFrom('revolution', found.source, { angle: p.angle }, { axis })];
  else tools = found.source.circles.map((c) => ({ type: 'solid', kind: 'hole', params: p, x: c.x, y: c.y, z: top, rx: 0, ry: 0, rz: 0 }));
  const raw = { type: 'solid', kind: 'boolean', name: `${t(`feature.${kind}`)} (${target.name || t(`solid.${target.kind}`)})`, params: {}, shape: { op: 'cut', parts: [normalizeSolidData(target), ...tools.map((tool) => normalizeSolidData(tool))] } };
  const added = change('op.feature', (drawing) => {
    D.removeEntities(drawing, [target.id, ...found.ids]);
    return D.addEntity(drawing, 'solid', { ...raw, layer: target.layer, color: target.color });
  });
  if (added) {
    select([added.id]);
    notify('success', t('notice.solidAdded', { name: t(`feature.${kind}`) }));
  }
  return added;
}

/** Replaces the outlines by the solid made from them (one undo step). */
function applyFeature(kind, found, params, axis = 'yAxis') {
  if (CUT_FEATURES.includes(kind)) return cutFeature(kind, found, params, axis);
  const raw = featureFrom(kind, found.source, params, { axis });
  const added = change('op.feature', (drawing) => {
    const layer = D.findEntity(drawing, found.ids[0])?.layer;
    D.removeEntities(drawing, found.ids);
    // On a working plane the solid stands at its elevation — or on its face.
    return D.addEntity(drawing, 'solid', { ...onWorkPlane(raw, drawing), name: t(`feature.${kind}`), ...(layer ? { layer } : {}) });
  });
  if (added) {
    select([added.id]);
    notify('success', t('notice.solidAdded', { name: t(`feature.${kind}`) }));
  }
  return added;
}

/** Insert a primitive (kind) or edit a solid (entity). */
async function openSolidDialog({ kind = null, entity = null, shape = null, focus = null } = {}) {
  if (!activeDoc()) return null;
  const c = viewCenter();
  const heavy = entity?.kind === 'mesh' && (entity.shape?.tris?.length ?? 0) > 200000;
  const result = await popups.open('solid', entity
    ? { mode: 'edit', kind: entity.kind, params: entity.params, x: entity.x, y: entity.y, z: entity.z, rx: entity.rx, ry: entity.ry, rz: entity.rz, shape: heavy ? null : shape ?? entity.shape, focus, materials: activeDrawing()?.bim?.materials ?? null }
    : { mode: 'insert', kind: kind ?? 'box', x: c.x, y: c.y, z: activeDrawing()?.workPlane?.z ?? 0, rz: activeDrawing()?.workPlane?.angle ?? 0 });
  if (!result) return null;
  const place = { x: result.x, y: result.y, z: result.z, rx: result.rx, ry: result.ry, rz: result.rz };
  if (result.action === 'apply' && entity && D.findEntity(activeDrawing(), entity.id)) {
    change('op.editSolid', (drawing) => D.updateEntity(drawing, entity.id, { kind: result.kind, params: result.params, ...place, ...(result.shape && ['wall', 'roof'].includes(entity.kind) ? { shape: result.shape } : {}) }));
    select([entity.id]);
    return D.findEntity(activeDrawing(), entity.id);
  }
  if (result.action === 'insert') return insertSolid(result.kind, result.params, place);
  return null;
}

// ───────────────────────── BIM (FreeCAD BIM workbench)

// Levels (FreeCAD BuildingPart / Level): every BIM object stands on one; its z includes the level's elevation.

/** The drawing's BIM block, made on first use (one level). */
function ensureBim(drawing) {
  if (!drawing.bim) drawing.bim = createBim(getLanguage());
  return drawing.bim;
}

function activeLevel(drawing) {
  const bim = ensureBim(drawing);
  return bim.levels.find((level) => level.id === bim.activeLevel) ?? bim.levels[0];
}

/** A new BIM object on the level new objects go to (raised by its elevation, unless it already has a level). */
function onLevel(drawing, raw) {
  if (raw.level && drawing.bim?.levels.some((level) => level.id === raw.level)) return raw;
  const level = activeLevel(drawing);
  return { ...raw, level: level.id, z: (Number(raw.z) || 0) + level.elevation };
}

/** Structures selected for rebar. */
const rebarHosts = () => selectedEntities().filter((entity) => entity.type === 'solid' && REBAR_HOSTS.includes(entity.kind));

/** Rebar in the selected columns, beams and slabs (one rebar object each). */
async function addRebar(paramsArg = null) {
  const hosts = rebarHosts();
  // No structure selected: custom bars along the selected lines and polylines.
  if (!hosts.length) return addCustomRebar(paramsArg);
  const source = { hosts: hosts.map((host) => normalizeSolidData(host) && { ...host }) };
  let params = paramsArg;
  if (!params) {
    const result = await popups.open('solid', { mode: 'arch', kind: 'rebar', source, count: hosts.length, params: {} });
    if (result?.action !== 'arch') return null;
    params = result.params;
  }
  const raws = archFrom('rebar', source, params, { normalizeParams: normalizeSolidParams });
  const added = change('op.rebar', (d) => raws.map((raw, i) => D.addEntity(d, 'solid', { ...raw, name: `${t('solid.rebar')} (${hosts[i].name || t(`solid.${hosts[i].kind}`)})`, layer: hosts[i].layer })));
  if (added?.length) {
    select(added.map((entity) => entity.id));
    notify('success', t('notice.rebarAdded', { count: added.reduce((sum, entity) => sum + (archQuantities(entity).count ?? 0), 0) }));
  }
  return added;
}

/** Custom-shaped bars (FreeCAD Rebar, custom): one rebar object per selected line or polyline. */
async function addCustomRebar(paramsArg = null) {
  const drawing = activeDrawing();
  const lines = selectedEntities().filter((e) => e.type === 'line' || e.type === 'polyline');
  if (!lines.length) { notify('info', t('notice.rebarHost')); return null; }
  const paths = lines.map((e) => (e.type === 'line' ? { points: [{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }], closed: false } : { points: e.points, closed: e.closed }));
  let params = paramsArg;
  if (!params) {
    const result = await popups.open('solid', { mode: 'arch', kind: 'rebar', source: { paths }, count: lines.length, params: { bars: 1 } });
    if (result?.action !== 'arch') return null;
    params = result.params;
  }
  const raws = archFrom('rebar', { paths }, params, { normalizeParams: normalizeSolidParams });
  const added = change('op.rebar', (d) => {
    D.removeEntities(d, lines.map((e) => e.id));
    return raws.map((raw) => D.addEntity(d, 'solid', onLevel(d, { ...raw, name: t('solid.rebar') })));
  });
  if (added?.length) {
    select(added.map((entity) => entity.id));
    notify('success', t('notice.rebarAdded', { count: added.reduce((sum, entity) => sum + (archQuantities(entity).count ?? 0), 0) }));
  }
  void drawing;
  return added;
}

/** The schedule as CSV (one row per BIM object), for a spreadsheet. */
function scheduleCsv(list = archObjects()) {
  const drawing = activeDrawing();
  const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const level = (e) => drawing?.bim?.levels?.find((l) => l.id === e.level)?.name ?? '';
  const header = ['schedule.col.name', 'schedule.col.kind', 'schedule.col.level', 'schedule.col.material', 'schedule.col.count', 'schedule.col.length', 'schedule.col.area', 'schedule.col.volume'].map((key) => t(key));
  const rows = list.map((e) => {
    const qty = archQuantities(e);
    const area = qty.wallArea ?? qty.floorArea ?? qty.roofArea ?? '';
    return [e.name || t(`solid.${e.kind}`), t(`solid.${e.kind}`), level(e), e.material?.name ?? '', qty.count ?? 1, qty.length !== undefined ? (qty.length / 1000).toFixed(3) : '', area !== '' ? (area / 1e6).toFixed(3) : '', (Math.abs(solidProperties(e).volume ?? 0) / 1e9).toFixed(4)];
  });
  return `\ufeff${[header, ...rows].map((r) => r.map(q).join(',')).join('\r\n')}\r\n`;
}

async function exportScheduleCsv() {
  const list = archObjects();
  if (!list.length) { notify('info', t('notice.noArch')); return null; }
  const text = scheduleCsv(list);
  const doc = activeDoc();
  const name = `${safeFileName(stripExtension(docName(doc)))}-schedule.csv`;
  try {
    if (desktop) {
      const path = await native.chooseExportPath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${name}`, 'csv');
      if (!path) return text;
      await withProgress('progress.export', baseName(path), (op) => native.writeTextFile(path, text, op));
      notify('success', t('notice.exported', { name: baseName(path) }));
    } else {
      native.downloadText(text, name, 'text/csv');
      notify('success', t('notice.exported', { name }));
    }
  } catch (error) {
    showError('error.export', error, name);
  }
  return text;
}

/**
 * Panel sheets (Arch Panel nesting): the selected panels (or closed outlines)
 * packed onto stock sheets, drawn right of the drawing on a "nesting" layer.
 */
function nestSelection({ width = 2440, height = 1220, gap = 10 } = {}) {
  const drawing = activeDrawing();
  const picked = selectedEntities();
  const items = [];
  for (const e of picked) {
    if (e.type === 'solid' && e.kind === 'panel' && e.shape?.outer?.length >= 3) items.push({ id: e.id, name: e.name || t('solid.panel'), outer: e.shape.outer, holes: e.shape.holes ?? [] });
    else if (e.type !== 'solid') for (const shape of buildShapes(collectLoops([e], drawing).loops)) items.push({ id: e.id, name: t(`entity.${e.type}`), outer: shape.outer, holes: shape.holes });
  }
  if (!items.length) { notify('info', t('notice.nestNone')); return null; }
  const result = nestPanels(items, { width, height, gap });
  const box = D.extents(drawing) ?? { maxX: 0, minY: 0 };
  const x0 = box.maxX + Math.max(width, height) * 0.2;
  const y0 = box.minY;
  const size = Math.max(height / 40, 20);
  change('op.nest', (d) => {
    if (!d.layers.some((l) => l.id === 'nesting')) d.layers.push({ id: 'nesting', name: t('layer.nesting'), color: '#d08a00', lineType: 'continuous', lineWidth: null, visible: true, locked: false });
    d.entities = d.entities.filter((e) => e.layer !== 'nesting');
    result.sheets.forEach((sheet, k) => {
      const ox = x0;
      const oy = y0 + k * (height + size * 4);
      const at = (q) => ({ x: ox + q.x, y: oy + q.y });
      D.addEntity(d, 'rect', { x: ox, y: oy, width, height, layer: 'nesting', lineWidth: 0.5 });
      D.addEntity(d, 'text', { x: ox, y: oy + height + size * 0.8, size, layer: 'nesting', text: t('nest.sheet', { n: k + 1, used: Math.round(sheet.used * 100), w: width, h: height }) });
      for (const part of sheet.parts) {
        D.addEntity(d, 'polyline', { points: part.outer.map(at), closed: true, layer: 'nesting' });
        for (const hole of part.holes) D.addEntity(d, 'polyline', { points: hole.map(at), closed: true, layer: 'nesting' });
        const xs = part.outer.map((q) => q.x); const ys = part.outer.map((q) => q.y);
        D.addEntity(d, 'text', { x: ox + (Math.min(...xs) + Math.max(...xs)) / 2, y: oy + (Math.min(...ys) + Math.max(...ys)) / 2, size: size * 0.7, align: 'center', layer: 'nesting', text: part.name });
      }
    });
  });
  notify(result.left.length ? 'error' : 'success', result.left.length ? t('notice.nestLeft', { count: result.left.length }) : t('notice.nested', { count: items.length, sheets: result.sheets.length }));
  return result;
}

/** A window drawn as a sketch (FreeCAD: a window from a sketch): one selected wall and the closed outlines of the window. */
async function addCustomWindow() {
  const drawing = activeDrawing();
  const chosen = selectedEntities();
  const walls = chosen.filter((entity) => entity.type === 'solid' && entity.kind === 'wall');
  const outlines = chosen.filter((entity) => !['solid', 'text', 'dim'].includes(entity.type));
  const found = walls.length === 1 && outlines.length ? profileFromLoops(collectLoops(outlines, drawing).loops) : null;
  if (!found) { notify('info', t('notice.customWindow')); return null; }
  const wall = walls[0];
  const opening = { type: 'custom', at: freeSpot(wall, found.width), width: Math.round(found.width), height: Math.round(found.height), sill: found.height < 2000 ? 900 : 0, swing: 1, hinge: 1, profile: found.profile };
  change('op.customWindow', (d) => {
    D.removeEntities(d, outlines.map((entity) => entity.id));
    D.updateEntity(d, wall.id, { shape: { ...wall.shape, openings: [...(wall.shape.openings ?? []), opening] } });
  });
  const updated = D.findEntity(activeDrawing(), wall.id);
  select([wall.id]);
  return openSolidDialog({ entity: updated, focus: updated.shape.openings.length - 1 });
}

/**
 * The building window (site, building, levels, materials). Changing a level's
 * elevation moves its objects; a changed material changes every object and
 * wall layer that uses it.
 */
async function openBimManager(resultArg = null) {
  const drawing = activeDrawing();
  if (!drawing) return null;
  const bim = structuredClone(drawing.bim ?? createBim(getLanguage()));
  const result = resultArg ?? await popups.open('bim', { bim, counts: Object.fromEntries(bim.levels.map((level) => [level.id, drawing.entities.filter((entity) => entity.level === level.id).length])) });
  if (!result?.bim) return null;
  applyBim(result.bim);
  return activeDrawing().bim;
}

function applyBim(next) {
  change('op.bim', (d) => {
    const before = d.bim ?? createBim(getLanguage());
    const after = structuredClone(next);
    for (const level of after.levels) {
      const old = before.levels.find((item) => item.id === level.id);
      const delta = old ? level.elevation - old.elevation : 0;
      if (delta) for (const entity of d.entities) if (entity.level === level.id) entity.z = (entity.z ?? 0) + delta;
    }
    // Objects of a removed level stay where they are, on the first level.
    for (const entity of d.entities) if (entity.level && !after.levels.some((level) => level.id === entity.level)) entity.level = after.levels[0].id;
    const byId = new Map(after.materials.map((material) => [material.id, material]));
    for (const entity of d.entities) {
      if (entity.material && byId.has(entity.material.id)) entity.material = { ...byId.get(entity.material.id) };
      if (entity.kind === 'wall' && entity.shape?.layers?.length) entity.shape = { ...entity.shape, layers: entity.shape.layers.map((layer) => (byId.has(layer.material.id) ? { ...layer, material: { ...byId.get(layer.material.id) } } : layer)) };
    }
    d.bim = after;
    // Changed objects are new objects: their meshes and plans are built again.
    d.entities = d.entities.map((entity) => ({ ...entity }));
  });
}

/** The building tree in the left panel: site › building › levels (show, plan, new objects here). */
function buildingTreeHtml(drawing) {
  if (!drawing?.bim) return `<p class="panel-hint">${escapeHtml(t('building.none'))}</p><div class="tool-grid">${commandTiles(['bimManager'])}</div>`;
  const bim = drawing.bim;
  const levels = [...bim.levels].reverse().map((level) => {
    const count = drawing.entities.filter((entity) => entity.level === level.id).length;
    const active = bim.activeLevel === level.id;
    const plan = bim.planLevel === level.id;
    return `<li class="layer-row level-row ${active ? 'active' : ''}" data-level="${escapeHtml(level.id)}">
      <button class="icon-button" data-level-visible="${escapeHtml(level.id)}" title="${escapeHtml(t('building.show'))}" aria-label="${escapeHtml(t('building.show'))}">${icon(level.visible ? 'eye' : 'eyeOff')}</button>
      <button class="icon-button ${plan ? 'active' : ''}" data-level-plan="${escapeHtml(level.id)}" title="${escapeHtml(t('building.plan'))}" aria-label="${escapeHtml(t('building.plan'))}" aria-pressed="${plan}">${icon('drawing')}</button>
      <button class="layer-name" data-level-active="${escapeHtml(level.id)}" title="${escapeHtml(t('building.active'))}">${active ? icon('check') : icon('archLevel')}<span>${escapeHtml(level.name)}</span><small>${escapeHtml(fmt(level.elevation / 1000, 2))} m · ${count}</small></button>
    </li>`;
  }).join('');
  return `<div class="building-tree">
      <div class="building-node" title="${escapeHtml(t('bim.site'))}">${icon('globe')}<span>${escapeHtml(bim.site)}</span></div>
      <div class="building-node child" title="${escapeHtml(t('bim.building'))}">${icon('archBuilding')}<span>${escapeHtml(bim.building)}</span></div>
      <ul class="layer-list level-list">${levels}</ul>
      <div class="building-actions"><button class="small-button ${bim.planLevel ? '' : 'active'}" data-level-plan="" title="${escapeHtml(t('building.all'))}">${icon('layers')}<span>${escapeHtml(t('building.all'))}</span></button><button class="small-button" data-level-add="1" title="${escapeHtml(t('bim.addLevel'))}">${icon('plus')}<span>${escapeHtml(t('bim.addLevel'))}</span></button>${commandTiles(['bimManager']).replace('tool-tile', 'tool-tile compact')}</div>
    </div>`;
}

/** A new level on top of the highest. */
function addLevel() {
  change('op.level', (d) => {
    const bim = ensureBim(d);
    const top = bim.levels.reduce((best, level) => (level.elevation > best.elevation ? level : best), bim.levels[0]);
    const n = bim.levels.length + 1;
    let id = `L${n}`;
    while (bim.levels.some((level) => level.id === id)) id = `${id}x`;
    bim.levels.push({ id, name: getLanguage() === 'en' ? `Level ${n}` : `${n}층`, elevation: top.elevation + top.height, height: top.height, visible: true });
    bim.activeLevel = id;
  });
}

/** The BIM objects of the drawing (visible ones). */
function archObjects() {
  const drawing = activeDrawing();
  return drawing ? drawing.entities.filter((entity) => entity.type === 'solid' && isArchKind(entity.kind) && D.isVisible3d(drawing, entity)) : [];
}

const selectedWall = () => { const list = selectedEntities(); return list.length === 1 && list[0].type === 'solid' && list[0].kind === 'wall' ? list[0] : null; };

/** Walls, beams, railings, curtain walls (one per selected wire); slabs, roofs, spaces (one per closed outline). */
async function archFeature(kind, paramsArg = null) {
  const drawing = activeDrawing();
  const entities = outlineSelection();
  const byLines = ARCH_FROM_LINES.includes(kind);
  const name = t(`solid.${kind}`);
  const { loops, open } = entities.length ? collectLoops(entities, drawing) : { loops: [], open: [] };
  const source = byLines
    ? { paths: [...open.map((points) => ({ points, closed: false })), ...loops.map((points) => ({ points, closed: true }))] }
    : { shapes: buildShapes(loops).map(({ outer, holes }) => ({ outer, holes })) };
  if (!(byLines ? source.paths : source.shapes).length) { notify('info', t(byLines ? 'notice.arch.lines' : 'notice.arch.outlines', { name })); return null; }
  let params = paramsArg;
  if (!params) {
    const result = await popups.open('solid', { mode: 'arch', kind, source, count: entities.length, params: {} });
    if (result?.action !== 'arch') return null;
    params = result.params;
  }
  const raws = archFrom(kind, source, params, { normalizeParams: normalizeSolidParams });
  const ids = entities.map((entity) => entity.id);
  const added = change('op.feature', (d) => {
    const layer = D.findEntity(d, ids[0])?.layer;
    D.removeEntities(d, ids);
    return raws.map((raw, i) => D.addEntity(d, 'solid', { ...onLevel(d, raw), name: raws.length > 1 ? `${name} ${i + 1}` : name, ...(layer ? { layer } : {}) }));
  });
  if (added?.length) {
    select(added.map((entity) => entity.id));
    notify('success', t('notice.archAdded', { name, count: added.length }));
  }
  return added;
}

/** A free place on a wall for an opening of a width: the middle, else the nearest gap. */
function freeSpot(wall, width) {
  const total = wallLength(wall);
  const taken = (wall.shape?.openings ?? []).map((o) => [o.at - 100, o.at + o.width + 100]);
  const fits = (at) => at >= 0 && at + width <= total && taken.every(([a, b]) => at + width <= a || at >= b);
  const middle = Math.max(0, (total - width) / 2);
  for (let step = 0; step <= total; step += 50) {
    for (const at of [middle + step, middle - step]) if (fits(at)) return Math.round(at);
  }
  return Math.round(middle);
}

/** Window or door in the selected wall (FreeCAD: select the wall, press Window / Door). */
async function addOpening(type, { at = null, width = null } = {}) {
  const wall = selectedWall();
  if (!wall) { notify('info', t('notice.wallFirst')); return null; }
  const opening = defaultOpening(type);
  if (width) opening.width = width;
  opening.at = at ?? freeSpot(wall, opening.width);
  const openings = [...(wall.shape?.openings ?? []), opening];
  const updated = await openSolidDialog({ entity: wall, shape: { ...wall.shape, openings }, focus: openings.length - 1 });
  if (updated) notify('success', t('notice.openingAdded', { name: t(`archOpt.${type}`) }));
  return updated;
}

/** The quantities of the BIM objects (FreeCAD Arch Schedule), one line per kind. */
function scheduleLines(list) {
  const by = (kind) => list.filter((entity) => entity.kind === kind);
  const sum = (items, key) => items.reduce((total, entity) => total + (archQuantities(entity)[key] ?? 0), 0);
  const volume = (items) => items.reduce((total, entity) => total + Math.abs(solidProperties(entity).volume ?? 0), 0);
  const m = (mm) => fmt(mm / 1000, 2);
  const m2 = (mm2) => fmt(mm2 / 1e6, 2);
  const m3 = (mm3) => fmt(mm3 / 1e9, 2);
  const lines = [t('schedule.title')];
  const walls = by('wall');
  if (walls.length) lines.push(t('schedule.walls', { count: walls.length, length: m(sum(walls, 'length')), area: m2(sum(walls, 'wallArea')), volume: m3(volume(walls)) }), t('schedule.openings', { windows: sum(walls, 'windows'), doors: sum(walls, 'doors') }));
  const curtain = by('curtainwall');
  if (curtain.length) lines.push(t('schedule.curtain', { count: curtain.length, length: m(sum(curtain, 'length')), area: m2(sum(curtain, 'wallArea')) }));
  const columns = by('column');
  if (columns.length) lines.push(t('schedule.columns', { count: columns.length, volume: m3(volume(columns)) }));
  const beams = by('beam');
  if (beams.length) lines.push(t('schedule.beams', { count: beams.length, length: m(sum(beams, 'length')), volume: m3(volume(beams)) }));
  const slabs = by('slab');
  if (slabs.length) lines.push(t('schedule.slabs', { count: slabs.length, area: m2(sum(slabs, 'floorArea')), volume: m3(volume(slabs)) }));
  if (by('stairs').length) lines.push(t('schedule.stairs', { count: by('stairs').length }));
  const roofs = by('roof');
  if (roofs.length) lines.push(t('schedule.roofs', { count: roofs.length, area: m2(sum(roofs, 'roofArea')) }));
  const railings = by('railing');
  if (railings.length) lines.push(t('schedule.railings', { count: railings.length, length: m(sum(railings, 'length')) }));
  if (by('equipment').length) lines.push(t('schedule.equipment', { count: by('equipment').length }));
  const rebars = by('rebar');
  if (rebars.length) lines.push(t('schedule.rebar', { count: sum(rebars, 'count'), length: m(sum(rebars, 'length')), weight: fmt(sum(rebars, 'weight'), 1) }));
  const trusses = by('truss');
  if (trusses.length) lines.push(t('schedule.truss', { count: trusses.length, members: sum(trusses, 'count') }));
  const pipes = by('pipe');
  if (pipes.length) lines.push(t('schedule.pipes', { count: pipes.length, length: m(sum(pipes, 'length')) }));
  const panels = by('panel');
  if (panels.length) lines.push(t('schedule.panels', { count: panels.length, area: m2(sum(panels, 'floorArea')) }));
  const spaces = by('space');
  if (spaces.length) {
    lines.push(t('schedule.spaces', { count: spaces.length, area: m2(sum(spaces, 'floorArea')) }));
    for (const space of spaces) lines.push(`  · ${space.name || t('solid.space')}  ${m2(archQuantities(space).floorArea)} m²`);
  }
  return lines;
}

/** The schedule as a text block right of the drawing. */
function insertSchedule() {
  const list = archObjects();
  if (!list.length) { notify('info', t('notice.noArch')); return null; }
  const drawing = activeDrawing();
  const box = D.extents(drawing) ?? { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  const size = Math.max(state.settings.textHeight ?? 3.5, (box.maxY - box.minY) / 70);
  // Per level when the building has several.
  const levels = drawing.bim?.levels ?? [];
  const text = levels.length > 1
    ? [t('schedule.title'), ...levels.flatMap((level) => { const own = list.filter((entity) => entity.level === level.id); return own.length ? [t('schedule.level', { name: level.name, elevation: fmt(level.elevation / 1000, 2) }), ...scheduleLines(own).slice(1).map((line) => `  ${line}`)] : []; })].join('\n')
    : scheduleLines(list).join('\n');
  const added = change('op.schedule', (d) => D.addEntity(d, 'text', { x: box.maxX + size * 6, y: box.maxY - size, text, size, ...(D.findLayer(d, 'text') ? { layer: 'text' } : {}) }));
  if (added) { select([added.id]); notify('success', t('notice.scheduleDone')); }
  return added;
}

function insertSolid(kind, params, place = {}) {
  const added = change('op.addSolid', (drawing) => D.addEntity(drawing, 'solid', isArchKind(kind) ? onLevel(drawing, { kind, name: t(`solid.${kind}`), params, ...place }) : { kind, name: t(`solid.${kind}`), params, ...place }));
  if (added) {
    select([added.id]);
    notify('success', t('notice.solidAdded', { name: t(`solid.${kind}`) }));
  }
  return added;
}

/** The solids Check geometry looks at: the selected ones, or every visible one. */
function checkTargets() {
  const selected = selectedSolids();
  if (selected.length) return selected;
  const d = activeDrawing();
  return d ? d.entities.filter((e) => e.type === 'solid' && D.isVisible3d(d, e)) : [];
}

/** Check geometry (FreeCAD Part / Mesh): a report per solid; the window can send the bad ones to repair. */
async function checkGeometry() {
  const targets = checkTargets();
  if (!targets.length) { notify('info', t('notice.checkNone')); return null; }
  const rows = targets.map((e) => ({ id: e.id, name: e.name || t(`solid.${e.kind}`), icon: SOLID_ICONS[e.kind], report: checkSolid(e) }));
  const result = await popups.open('check', { rows });
  if (result?.action === 'repair') repairSolids(result.ids);
  return rows;
}

/** Mesh › Decimation: each solid becomes a mesh solid with about half its triangles. */
function decimateSolids(ids, ratio = 0.5) {
  const d = activeDrawing();
  const list = (ids ?? []).map((id) => D.findEntity(d, id)).filter((e) => e?.type === 'solid');
  if (!list.length) { notify('info', t('notice.repairNone')); return null; }
  let before = 0;
  let after = 0;
  const made = list.map((e) => {
    const tris = solidMesh(e);
    const fewer = decimateMesh(tris, ratio);
    before += tris.length;
    after += fewer.length;
    return { e, fewer };
  });
  change('op.meshDecimate', (dd) => {
    for (const { e, fewer } of made) D.updateEntity(dd, e.id, { kind: 'mesh', params: {}, shape: { tris: flattenTriangles(fewer) }, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, flip: false });
  });
  notify('success', t('notice.decimated', { before, after }));
  return { before, after };
}

/** Mesh › Repair: each solid becomes a mended mesh solid (one undo step). */
function repairSolids(ids) {
  const d = activeDrawing();
  const list = (ids ?? []).map((id) => D.findEntity(d, id)).filter((e) => e?.type === 'solid');
  if (!list.length) { notify('info', t('notice.repairNone')); return null; }
  const total = { degenerate: 0, duplicates: 0, flipped: 0, cracks: 0, holes: 0, inverted: 0 };
  const mended = list.map((e) => {
    const { triangles, fixed } = repairMesh(solidMesh(e));
    for (const key of Object.keys(total)) total[key] += fixed[key] ?? 0;
    return { e, triangles };
  });
  const details = Object.entries(total).filter(([, n]) => n > 0).map(([key, n]) => t(`repair.${key}`, { n }));
  if (!details.length) { notify('info', t('notice.repairClean')); return total; }
  change('op.meshRepair', (dd) => {
    for (const { e, triangles } of mended) {
      D.updateEntity(dd, e.id, { kind: 'mesh', params: {}, shape: { tris: flattenTriangles(triangles) }, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, flip: false });
    }
  });
  notify('success', t('notice.repaired', { count: list.length, details: details.join(', ') }));
  return total;
}

/** The one selected solid a fillet, chamfer, thickness or offset can go on. */
function dressBase() {
  const list = selectedSolids();
  return list.length === 1 && canDressUp(list[0]) ? list[0] : null;
}

/**
 * Fillet / Chamfer / Thickness / Offset (FreeCAD Part): the selected solid
 * becomes the base of a dress-up that takes its place (Explode gives it back).
 */
async function dressUp(kind, paramsArg = null) {
  const base = dressBase();
  if (!base) { notify('info', t('notice.dressBase')); return null; }
  const data = normalizeSolidData(base);
  const placed = { x: data.x, y: data.y, z: data.z, rx: data.rx, ry: data.ry, rz: data.rz, scale: data.scale, flip: data.flip };
  const inside = { ...data, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, flip: false };
  let params = paramsArg;
  if (!params) {
    const result = await popups.open('solid', { mode: 'dressup', kind, shape: { base: inside }, params: {}, ...placed });
    if (result?.action !== 'dressup') return null;
    params = result.params;
  }
  const added = change('op.dressup', (d) => {
    D.removeEntities(d, [base.id]);
    return D.addEntity(d, 'solid', { kind, name: `${t(`dress.${kind}`)} (${base.name || t(`solid.${base.kind}`)})`, params, shape: { base: inside }, ...placed, layer: base.layer, color: base.color, ...(base.level ? { level: base.level } : {}) });
  });
  if (added) { select([added.id]); notify('success', t('notice.solidAdded', { name: t(`dress.${kind}`) })); }
  return added;
}

/** Fuse / Cut / Common of the selected solids (the first selected is the base). */
function booleanSelection(op) {
  const solids = selectedSolids();
  if (solids.length < 2) { notify('info', t('notice.selectSolids')); return null; }
  // Kept as a tree (like FreeCAD's Part::Cut / Fuse / Common): Explode gives the solids back.
  const raw = { type: 'solid', kind: 'boolean', name: `${t(`bool.${op}`)} (${solids[0].name || t(`solid.${solids[0].kind}`)})`, params: {}, shape: { op, parts: solids.map((entity) => normalizeSolidData(entity)) } };
  const result = solidMesh(normalizeEntity(raw));
  if (!result.length) { notify('error', t('notice.boolEmpty', { op: t(`bool.${op}`) })); return null; }
  const base = solids[0];
  const added = change('op.boolean', (drawing) => {
    D.removeEntities(drawing, solids.map((entity) => entity.id));
    return D.addEntity(drawing, 'solid', { ...raw, layer: base.layer, color: base.color });
  });
  select([added.id]);
  notify('success', t('notice.boolDone', { op: t(`bool.${op}`), count: result.length }));
  return added;
}

async function sectionSolids(levelArg = null) {
  const solids = selectedSolids(true);
  if (!solids.length) { notify('info', t('notice.noSolids')); return null; }
  const box = meshBox(solids.flatMap((entity) => solidMesh(entity)));
  let level = levelArg;
  if (level === null) {
    const result = await popups.open('solid', { mode: 'section', solids, range: [box.min[2], box.max[2]], level: Number(fmt((box.min[2] + box.max[2]) / 2, 2)) });
    if (result?.action !== 'section') return null;
    level = result.level;
  }
  const outlines = sectionOutlines(solids, level);
  if (!outlines.length) { notify('info', t('notice.sectionEmpty', { level: fmt(level, 2) })); return []; }
  const added = change('op.section', (drawing) => D.insertEntities(drawing, outlines));
  select(added.map((entity) => entity.id));
  notify('success', t('notice.sectionDone', { count: added.length, level: fmt(level, 2) }));
  return added;
}

/** Drawing views of the solids (third-angle layout: top above front, right beside it), placed right of the drawing. */
async function projectSolids(optionsArg = null) {
  const solids = selectedSolids(true);
  if (!solids.length) { notify('info', t('notice.noSolids')); return null; }
  let options = optionsArg;
  if (!options) {
    const result = await popups.open('solid', { mode: 'project', solids, gap: 20 });
    if (result?.action !== 'project') return null;
    options = result;
  }
  const drawing = activeDrawing();
  const extent = D.extents(drawing) ?? { maxX: 0, minY: 0 };
  const gap = Number(options.gap) || 20;
  const raw = drawingViews(solids, {
    x0: extent.maxX + gap * 2, y0: extent.minY, gap, views: options.views, textHeight: state.settings.textHeight,
    labels: Object.fromEntries(VIEW_NAMES.map((view) => [view, t(`view3d.${view}`)])),
    hiddenLayer: D.findLayer(drawing, 'hidden') ? 'hidden' : null, textLayer: D.findLayer(drawing, 'text') ? 'text' : null,
  });
  const views = VIEW_NAMES.filter((view) => options.views?.[view]);
  const added = change('op.project', (d) => D.insertEntities(d, raw));
  select(added.map((entity) => entity.id));
  notify('success', t('notice.projected', { count: views.length }));
  return added;
}

// ───────────────────────── 3D files

/** A drawing from a 3D model file (FCStd, STEP, STL, OBJ, PLY, OFF, AMF, 3MF). */
function drawingFromModel(name, bytes) {
  const { entities, warnings, bim } = importMesh(extensionOf(name), bytes);
  const drawing = D.createDrawing({ title: stripExtension(baseName(name)) || '3D', language: getLanguage(), author: state.settings.author ?? '' });
  D.insertEntities(drawing, entities);
  // An IFC brings its storeys (and MyCAD's own building data) as levels.
  if (bim) drawing.bim = normalizeBim(bim, getLanguage());
  return { drawing, count: entities.length, note: warnings.length ? t('notice.modelSkipped', { list: warnings.join(', ') }) : '' };
}

/** Opens model bytes as a new drawing tab and shows it in 3D. */
function openModelBytes(name, bytes) {
  const { drawing, count, note } = drawingFromModel(name, bytes);
  const doc = addDocument(new DrawingDocument(drawing, { name: baseName(name), format: 'model' }));
  renderAll();
  zoomFit();
  notify(note ? 'info' : 'success', `${t('notice.modelOpened', { name: baseName(name), count })}${note ? ` · ${note}` : ''}`);
  return doc;
}

/** Inserts the solids of model files into the current drawing (a new one when none is open). */
async function import3dWithDialog() {
  try {
    if (desktop) {
      const paths = await native.chooseDrawingToOpen(state.settings.lastDirectory, { models: true });
      for (const path of paths) {
        const bytes = await withProgress('progress.import', baseName(path), (op) => native.readBinaryFile(path, op));
        importModelBytes(baseName(path), bytes);
        updateSettings({ lastDirectory: directoryOf(path) || state.settings.lastDirectory });
      }
    } else {
      for (const file of await native.pickDrawingFilesWeb({ models: true })) importModelBytes(file.name, file.bytes ?? new TextEncoder().encode(file.text ?? ''));
    }
  } catch (error) {
    showError('error.import3d', error);
  }
}

function importModelBytes(name, bytes) {
  if (!activeDoc()) return openModelBytes(name, bytes);
  const { entities, warnings } = importMesh(extensionOf(name), bytes);
  const added = change('op.import3d', (drawing) => D.insertEntities(drawing, entities));
  select((added ?? []).map((entity) => entity.id));
  notify(warnings.length ? 'info' : 'success', `${t('notice.modelImported', { name, count: added?.length ?? 0 })}${warnings.length ? ` · ${t('notice.modelSkipped', { list: warnings.join(', ') })}` : ''}`);
  return activeDoc();
}

const MODEL_MIME = { obj: 'model/obj', ply: 'application/octet-stream', off: 'application/octet-stream', amf: 'application/x-amf', '3mf': 'model/3mf', step: 'model/step', fcstd: 'application/zip', ifc: 'application/x-step' };

/** Writes the drawing's solids (and, for FCStd, its 2D sketch) in a 3D format. */
async function export3d(format) {
  const doc = activeDoc();
  if (!doc) return null;
  const drawing = doc.drawing;
  const entities = drawing.entities.filter((entity) => D.isVisible3d(drawing, entity));
  const name = `${safeFileName(stripExtension(docName(doc)))}.${format === 'fcstd' ? 'FCStd' : format}`;
  try {
    if (format !== 'fcstd' && !entities.some((entity) => entity.type === 'solid')) throw new Error(t('export3d.noSolids'));
    const bytes = exportMesh(format, drawing, entities, { title: drawing.title, author: drawing.author });
    if (desktop) {
      const path = await native.chooseExportPath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${name}`, format);
      if (!path) return null;
      await withProgress('progress.export', baseName(path), (op) => native.writeBase64File(path, toBase64(bytes), op));
      updateSettings({ lastDirectory: directoryOf(path) || state.settings.lastDirectory });
      notify('success', t('notice.exported', { name: baseName(path) }));
    } else {
      native.downloadBytes(bytes, name, MODEL_MIME[format]);
      notify('success', t('notice.exported', { name }));
    }
    return bytes;
  } catch (error) {
    showError('error.export', error, name);
    return null;
  }
}

function openExport3dMenu(anchor) {
  const element = root.querySelector('[data-command="export3dMenu"]') ?? root.querySelector('[data-command="exportMenu"]');
  showMenu(menuItems(['exportStl', ...EXPORT_3D.map((format) => `export3d:${format}`)]), anchor ?? anchorBelow(element), 'export3d', { header: { icon: 'solidExport', title: t('action.export3dMenu') } });
}

/** The level and material of a BIM object (properties panel). */
function bimRows(entity) {
  const bim = activeDrawing()?.bim;
  if (!bim) return '';
  const level = `<label class="prop-row" title="${escapeHtml(t('prop.level'))}"><span class="prop-label">${icon('archLevel')}${t('prop.level')}</span><select data-solid-level="1" title="${escapeHtml(t('prop.level'))}"><option value="">${escapeHtml(t('prop.levelNone'))}</option>${bim.levels.map((item) => `<option value="${escapeHtml(item.id)}" ${entity.level === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>`;
  const layered = entity.kind === 'wall' && entity.shape?.layers?.length;
  const material = layered || ['space', 'axis'].includes(entity.kind) ? '' : `<label class="prop-row" title="${escapeHtml(t('prop.material'))}"><span class="prop-label">${icon('archMaterial')}${t('prop.material')}</span><select data-solid-material="1" title="${escapeHtml(t('prop.material'))}"><option value="">${escapeHtml(t('prop.materialNone'))}</option>${bim.materials.map((item) => `<option value="${escapeHtml(item.id)}" ${entity.material?.id === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>`;
  return level + material;
}

/** Label of a solid parameter: per kind when it reads differently (a wall's width is its thickness). */
function solidParamLabel(kind, key) {
  const own = `solidParam.${kind}.${key}`;
  const text = t(own);
  return text === own ? t(`solidParam.${key}`) : text;
}

function solidRows(entity) {
  const tree = entity.kind === 'boolean'
    ? `${readField(t('prop.operation'), t(`bool.${entity.shape.op}`), BOOL_ICONS[entity.shape.op])}${readField(t('solid.parts'), entity.shape.parts.map((part) => part.name || t(`solid.${part.kind}`)).join(', '), 'list')}`
    : '';
  const rows = tree + SOLIDS[entity.kind].params.map((param) => {
    const label = solidParamLabel(entity.kind, param.key);
    if (param.type === 'choice') return `<label class="prop-row" title="${escapeHtml(label)}"><span class="prop-label">${escapeHtml(label)}</span><select data-solid-param="${param.key}" title="${escapeHtml(label)}">${param.options.map((option, i) => `<option value="${i}" ${entity.params[param.key] === i ? 'selected' : ''}>${escapeHtml(t(`archOpt.${option}`))}</option>`).join('')}</select></label>`;
    return numField(param.key, entity.params[param.key], label, param.unit === '°' ? '°' : param.unit ? 'mm' : '', 'data-solid-param');
  }).join('');
  const picking = state.edgePick === entity.id;
  const pick = (entity.kind === 'fillet' || entity.kind === 'chamfer') ? `<div class="prop-actions"><button class="small-button ${picking ? 'active' : ''}" data-edge-pick-mode title="${escapeHtml(t(occReady() ? 'edgePick.tip' : 'edgePick.noKernel'))}" ${occReady() ? '' : 'disabled'}>${icon('select')}<span>${escapeHtml(t(picking ? 'edgePick.done' : 'edgePick.start'))}</span></button>${entity.shape?.picks?.length ? `<small class="muted">${escapeHtml(t('edgePick.count', { count: entity.shape.picks.length }))}</small>` : ''}</div>` : '';
  return `<label class="prop-row" title="${escapeHtml(t('prop.name'))}"><span class="prop-label">${icon('edit')}${t('prop.name')}</span><input data-prop="name" value="${escapeHtml(entity.name)}" title="${escapeHtml(t('prop.name'))}" /></label>${isArchKind(entity.kind) ? bimRows(entity) : ''}${rows}${pick}`;
}

// ───────────────────────── picking a fillet's / chamfer's edges in 3D (persistent: by geometry)

/** Starts (or ends) picking the selected dress-up's edges in the 3D view. */
async function toggleEdgePick(on = !state.edgePick) {
  const entity = selectedSolids()[0];
  if (!on || !entity || !['fillet', 'chamfer'].includes(entity.kind)) {
    state.edgePick = null;
    view3d.instance?.setEdgeOverlay(null);
    renderRight();
    return false;
  }
  if (!state.view3d) await toggle3d(true);
  state.edgePick = entity.id;
  showEdgeOverlay();
  renderRight();
  return true;
}

/** The dress-up's base edges over the 3D view (after every rebuild while picking). */
function showEdgeOverlay() {
  const entity = state.edgePick ? D.findEntity(activeDrawing(), state.edgePick) : null;
  if (!entity || !view3d.instance) return;
  const edges = occDressEdges(entity);
  if (!edges) { state.edgePick = null; notify('error', t('edgePick.noKernel')); return; }
  view3d.instance.setEdgeOverlay(edges, (key) => toggleEdge(entity.id, edges.find((e) => e.key === key)));
}

/** Adds or removes an edge (kept by its midpoint and direction); the fillet switches to "picked edges". */
function toggleEdge(id, edge) {
  const entity = D.findEntity(activeDrawing(), id);
  if (!entity || !edge) return;
  const picks = entity.shape?.picks ?? [];
  const same = (p) => Math.hypot(...p.mid.map((v, i) => v - edge.mid[i])) < 1e-6;
  // An edge picked through a group: start the list from the group's edges.
  const current = DRESSUP_EDGES[entity.params.edges] === 'picked' ? picks : occDressEdges(entity).filter((e) => e.picked).map((e) => ({ mid: e.mid, dir: e.dir }));
  const next = edge.picked ? current.filter((p) => !same(p)) : [...current, { mid: edge.mid, dir: edge.dir }];
  change('op.edges', (d) => D.updateEntity(d, id, { params: { ...entity.params, edges: DRESSUP_EDGES.indexOf('picked') }, shape: { ...entity.shape, picks: next } }));
}

// ───────────────────────── confirmation

async function ask(params) {
  const result = await popups.open('confirm', params);
  return result?.choice ?? 'cancel';
}

async function requestExit() {
  if (desktop) return appWindow.close();
  return undefined;
}

/** Before the window closes: unsaved drawings → save / don't save / cancel. */
async function confirmExit() {
  const dirty = state.docs.filter((doc) => doc.dirty);
  if (!dirty.length) return true;
  const choice = await ask({
    kind: 'exit', icon: 'save', title: t('confirm.exitTitle'), message: t('confirm.exitMessage'),
    items: dirty.map(docName),
    buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }],
  });
  if (choice === 'save') return saveAll();
  return choice === 'discard';
}

// ───────────────────────── menus (popup windows)

/** Screen position of a point in this window, in CSS pixels. */
const screenOffset = { x: 0, y: 0, measured: false };
function estimateOffset() {
  if (screenOffset.measured) return;
  const border = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
  screenOffset.x = window.screenX + border;
  screenOffset.y = window.screenY + Math.max(0, window.outerHeight - window.innerHeight - border);
}
window.addEventListener('pointermove', (event) => {
  if (!event.isTrusted) return;
  screenOffset.x = event.screenX - event.clientX;
  screenOffset.y = event.screenY - event.clientY;
  screenOffset.measured = true;
}, { passive: true });

function toScreen(x, y) {
  if (!desktop) return { x: window.screenX + x, y: window.screenY + y };
  estimateOffset();
  return { x: screenOffset.x + x, y: screenOffset.y + y };
}

function anchorBelow(element) {
  const rect = element.getBoundingClientRect();
  const point = toScreen(rect.left, rect.bottom + 2);
  return { ...point, flipY: toScreen(rect.left, rect.top - 2).y };
}

function menuItems(ids) {
  const first = (items) => items.map((id) => (id?.group ? first(id.items) : id)).find((id) => id && id !== '-');
  return ids.map((id) => (id === '-' ? { separator: true } : id?.group ? {
    id: `group:${id.group}`,
    label: t(`menuGroup.${id.group}`),
    icon: commands[first(id.items)]?.icon,
    items: menuItems(id.items),
  } : {
    id,
    label: t(commands[id].label),
    icon: commands[id].icon,
    shortcut: commands[id].key ? keyLabel(commands[id].key) : '',
    disabled: !commandEnabled(id),
    checked: commands[id].checked?.(),
  }));
}

async function showMenu(items, anchor, name = 'context', context = {}) {
  state.openMenu = name;
  renderMenubar();
  const header = context.header ?? (MENUS[name] ? { icon: MENU_ICONS[name], title: t(`menu.${name}`) } : { icon: 'drawing', title: 'MyCAD' });
  const result = await popups.open('menu', { items, name, header }, { anchor });
  if (state.openMenu === name) {
    state.openMenu = null;
    state.lastMenuClose = { name, at: Date.now() };
    renderMenubar();
  }
  const id = result?.id;
  if (!id) return;
  if (id.startsWith('custom:')) { context.handlers?.[id]?.(); return; }
  run(id, context);
}

function openMenubarMenu(name) {
  const element = root.querySelector(`[data-menu="${name}"]`);
  if (!element) return;
  showMenu(menuItems(MENUS[name]), anchorBelow(element), name);
}

function contextMenuFor(event) {
  const target = event.target;
  const point = toScreen(event.clientX, event.clientY);
  const anchor = { x: point.x + 1, y: point.y + 1, flipY: point.y };
  const tab = target.closest('.tab');
  const editable = target.closest('input, textarea, [contenteditable="true"]');
  const layerRow = target.closest('[data-layer]');
  if (editable && editable.type !== 'range' && editable.type !== 'checkbox' && editable.type !== 'color') return textContextMenu(editable, anchor);
  if (tab?.dataset.tabHome !== undefined) {
    showHome(true);
    return showMenu(menuItems(['tutorial', 'tutorialDoc', '-', 'new', 'open', 'recent']), anchor, 'context', { header: { icon: 'home', title: t('action.startPage') } });
  }
  if (tab) {
    activateDoc(tab.dataset.doc);
    return showMenu(menuItems(['save', 'saveAs', '-', 'renameDrawing', 'print', 'exportDxf', '-', 'closeTab', 'closeOthers', '-', 'new']), anchor, 'context', { header: { icon: 'drawing', title: docName(activeDoc()) } });
  }
  if (layerRow) return layerContextMenu(layerRow.dataset.layer, anchor);
  if (target.closest('#cad-canvas')) {
    if (state.tool) {
      // Right click while drawing = Enter (finish), or back to the select tool.
      if (!state.tool.finish()) setTool('select');
      renderCommandBar();
      scheduleRender();
      return undefined;
    }
    const doc = activeDoc();
    const screen = canvasPoint(event);
    const p = doc?.vp ? doc.vp.toWorld(screen.x, screen.y) : null;
    const hit = p ? hitEntity(p) : null;
    if (hit) {
      if (!state.selection.has(hit.id)) select([hit.id]);
      const drawing = activeDrawing();
      const layers = drawing.layers.map((layer) => ({ id: `custom:layer:${layer.id}`, label: t('menu.toLayer', { name: layer.name }), icon: 'layers', checked: selectedEntities().every((entity) => entity.layer === layer.id) }));
      const handlers = Object.fromEntries(drawing.layers.map((layer) => [`custom:layer:${layer.id}`, () => change('op.style', (d) => D.moveToLayer(d, selectedIds(), layer.id))]));
      const title = state.selection.size > 1 ? t('props.multi', { count: state.selection.size }) : t(`entity.${hit.type}`);
      return showMenu([
        ...menuItems(['properties', ...(hit.type === 'part' ? ['editPart'] : []), '-', 'cut', 'copy', 'paste', 'duplicate', 'clone', ...(hit.clone ? ['cloneSource', 'unlinkClone'] : []), 'delete', '-', 'tool:move', 'tool:copy', 'tool:rotate', 'tool:mirror', 'tool:scale', 'array', 'explode', '-', 'bringFront', 'sendBack', '-']),
        ...layers,
      ], anchor, 'context', { handlers, header: { icon: 'edit', title } });
    }
    return showMenu(menuItems(['paste', 'selectAll', '-', 'zoomFit', 'zoom100', '-', 'grid', 'rulers', 'snap', 'ortho', '-', 'tool:line', 'tool:rect', 'tool:circle', 'tool:dimLinear', '-', 'background', 'clearBackground', '-', 'print']), anchor, 'context', { header: { icon: 'drawing', title: `${t('props.drawing')}: ${activeDrawing()?.title ?? ''}` } });
  }
  return showMenu(menuItems(['new', 'open', 'save', '-', 'undo', 'redo', '-', 'settings', 'about']), anchor, 'context', { header: { icon: 'drawing', title: 'MyCAD' } });
}

function layerContextMenu(layerId, anchor) {
  const drawing = activeDrawing();
  const layer = D.findLayer(drawing, layerId);
  if (!layer) return undefined;
  const handlers = {
    'custom:activate': () => change('op.layer', (d) => { d.activeLayer = layerId; }),
    'custom:visible': () => toggleLayer(layerId, 'visible'),
    'custom:lock': () => toggleLayer(layerId, 'locked'),
    'custom:rename': () => renameLayer(layerId),
    'custom:select': () => select(drawing.entities.filter((entity) => entity.layer === layerId).map((entity) => entity.id)),
    'custom:moveHere': () => change('op.style', (d) => D.moveToLayer(d, selectedIds(), layerId)),
    'custom:remove': () => removeLayer(layerId),
  };
  return showMenu([
    { id: 'custom:activate', label: t('layer.setActive'), icon: 'check', disabled: drawing.activeLayer === layerId },
    { id: 'custom:visible', label: t(layer.visible ? 'layer.hide' : 'layer.show'), icon: layer.visible ? 'eyeOff' : 'eye' },
    { id: 'custom:lock', label: t(layer.locked ? 'layer.unlock' : 'layer.lock'), icon: layer.locked ? 'unlock' : 'lock' },
    { id: 'custom:rename', label: t('layer.rename'), icon: 'edit' },
    { separator: true },
    { id: 'custom:select', label: t('layer.selectEntities'), icon: 'selectAll' },
    { id: 'custom:moveHere', label: t('layer.moveHere'), icon: 'layers', disabled: !hasSelection() },
    { separator: true },
    { id: 'custom:remove', label: t('layer.remove'), icon: 'trash', danger: true, disabled: drawing.layers.length <= 1 },
  ], anchor, 'context', { handlers, header: { icon: 'layers', title: `${t('panel.layers')}: ${layer.name}` } });
}

function textContextMenu(element, anchor) {
  const handlers = {
    'custom:cut': () => { element.focus(); document.execCommand('cut'); },
    'custom:copy': () => { element.focus(); document.execCommand('copy'); },
    'custom:paste': async () => {
      element.focus();
      const text = await native.clipboardRead().catch(() => state.clipboard);
      document.execCommand('insertText', false, text ?? '');
    },
    'custom:selectAll': () => { element.focus(); element.select?.(); },
    'custom:undo': () => { element.focus(); document.execCommand('undo'); },
  };
  const hasText = element.selectionStart !== element.selectionEnd;
  showMenu([
    { id: 'custom:undo', label: t('action.undo'), icon: 'undo', shortcut: keyLabel('Ctrl+Z') },
    { separator: true },
    { id: 'custom:cut', label: t('action.cut'), icon: 'cut', shortcut: keyLabel('Ctrl+X'), disabled: !hasText },
    { id: 'custom:copy', label: t('action.copy'), icon: 'copy', shortcut: keyLabel('Ctrl+C'), disabled: !hasText },
    { id: 'custom:paste', label: t('action.paste'), icon: 'paste', shortcut: keyLabel('Ctrl+V') },
    { separator: true },
    { id: 'custom:selectAll', label: t('action.selectText'), icon: 'selectAll', shortcut: keyLabel('Ctrl+A') },
  ], anchor, 'context', { handlers, header: { icon: 'edit', title: t('menu.edit') } });
}

// ───────────────────────── layers

function toggleLayer(id, key) {
  change('op.layer', (drawing) => {
    const layer = D.findLayer(drawing, id);
    D.updateLayer(drawing, id, { [key]: !layer[key] });
  });
  // Hidden or locked entities cannot stay selected.
  const drawing = activeDrawing();
  state.selection = new Set([...state.selection].filter((entityId) => {
    const entity = D.findEntity(drawing, entityId);
    return entity && D.isVisible(drawing, entity) && !D.isLocked(drawing, entity);
  }));
  afterChange();
}

function renameLayer(id) {
  const name = root.querySelector(`[data-layer-activate="${CSS.escape(id)}"] span`);
  const layer = D.findLayer(activeDrawing(), id);
  if (!name || !layer) return;
  const input = document.createElement('input');
  input.className = 'layer-rename';
  input.value = layer.name;
  input.title = t('layer.rename');
  name.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const value = input.value.trim();
    if (commit && value && value !== layer.name) change('op.layer', (drawing) => D.updateLayer(drawing, id, { name: value }));
    else renderLeft();
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') finish(true);
    if (event.key === 'Escape') finish(false);
    event.stopPropagation();
  });
  input.addEventListener('blur', () => finish(true));
}

async function removeLayer(id) {
  const drawing = activeDrawing();
  const layer = D.findLayer(drawing, id);
  if (!layer || drawing.layers.length <= 1) return;
  const count = drawing.entities.filter((entity) => entity.layer === id).length;
  if (count && state.settings.confirmDelete) {
    const choice = await ask({ icon: 'layers', title: t('confirm.deleteTitle'), message: t('confirm.deleteLayer', { name: layer.name, count }), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'delete', label: t('confirm.delete'), icon: 'trash', danger: true, primary: true }] });
    if (choice !== 'delete') return;
  }
  change('op.layer', (d) => D.removeLayer(d, id));
}

// ───────────────────────── external drag & drop

async function handleDroppedPaths(paths, point) {
  for (const path of paths) {
    const name = baseName(path);
    try {
      if (isDrawingFileName(name) || isCadDrawingFileName(name) || isModelFileName(name)) await openPath(path);
      else if (isImageFileName(name)) await setBackgroundFromPath(path);
      else if (isTextFileName(name)) {
        if (!activeDoc()) newDrawing();
        const text = await withProgress('progress.import', name, (op) => native.readTextFile(path, op));
        pasteText(text, point ? worldAt(point) : null);
      } else notify('error', t('notice.unsupportedDrop', { name }));
    } catch (error) {
      showError('error.drop', error, path);
    }
  }
  renderAll();
}

async function handleDroppedFiles(files, text, point) {
  for (const file of files) {
    try {
      if (isModelFileName(file.name)) openModelBytes(file.name, new Uint8Array(await file.arrayBuffer()));
      else if (isCadDrawingFileName(file.name)) openDrawingBytes(file.name, new Uint8Array(await file.arrayBuffer()));
      else if (isDrawingFileName(file.name)) openText(file.name, await file.text());
      else if (isImageFileName(file.name) || file.type.startsWith('image/')) await setBackgroundFromFile(file);
      else if (isTextFileName(file.name) || file.type.startsWith('text/')) {
        if (!activeDoc()) newDrawing();
        pasteText(await file.text(), point ? worldAt(point) : null);
      } else notify('error', t('notice.unsupportedDrop', { name: file.name }));
    } catch (error) {
      showError('error.drop', error, file.name);
    }
  }
  if (!files.length && text) {
    if (!activeDoc()) newDrawing();
    pasteText(text, point ? worldAt(point) : null);
  }
}

/** Drawing point under a client point (null outside the canvas). */
function worldAt(client) {
  const canvas = root.querySelector('#cad-canvas');
  const rect = canvas.getBoundingClientRect();
  if (client.x < rect.left || client.x > rect.right || client.y < rect.top || client.y > rect.bottom) return null;
  return ensureViewport(activeDoc())?.toWorld(client.x - rect.left, client.y - rect.top) ?? null;
}

function setDropActive(active) {
  state.dropActive = active;
  const overlay = root.querySelector('.drop-overlay');
  overlay.classList.toggle('visible', active);
  overlay.querySelector('span').textContent = t('drop.hint');
}

// ───────────────────────── part tiles: click opens the part window, dragging places it

let partDrag = null;

function startPartDrag(event, kind) {
  partDrag = { kind, startX: event.clientX, startY: event.clientY, started: false };
}

window.addEventListener('pointermove', (event) => {
  if (!partDrag) return;
  if (!partDrag.started) {
    if (Math.hypot(event.clientX - partDrag.startX, event.clientY - partDrag.startY) < 6) return;
    partDrag.started = true;
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.innerHTML = `<div class="ghost-tool">${icon(PARTS[partDrag.kind].icon)}<span>${escapeHtml(t(`part.${partDrag.kind}`))}</span></div>`;
    document.body.append(ghost);
    partDrag.ghost = ghost;
    document.body.classList.add('dragging');
  }
  partDrag.ghost.style.transform = `translate(${event.clientX + 8}px, ${event.clientY + 8}px)`;
});

window.addEventListener('pointerup', (event) => {
  const drag = partDrag;
  partDrag = null;
  if (!drag?.started) return;
  drag.ghost?.remove();
  document.body.classList.remove('dragging');
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
  const p = worldAt({ x: event.clientX, y: event.clientY });
  if (!p) return;
  const entity = change('op.part', (drawing) => D.addEntity(drawing, 'part', { kind: drag.kind, x: p.x, y: p.y }));
  select([entity.id]);
});

let suppressClick = false;

// ───────────────────────── events

/** The model tree's clicks, double clicks, dragging and hovering (FreeCAD's tree view). */
function bindTreeEvents() {
  root.addEventListener('click', (event) => {
    const target = event.target;
    const toggle = target.closest('[data-tree-toggle]');
    if (toggle) {
      const key = toggle.dataset.treeToggle;
      const set = key.startsWith('folder:') ? state.tree.expanded : state.tree.collapsed;
      if (set.has(key)) set.delete(key); else set.add(key);
      event.stopPropagation();
      renderLeft();
      return;
    }
    const eye = target.closest('[data-tree-eye]');
    if (eye) {
      event.stopPropagation();
      const id = eye.dataset.treeEye;
      change('std.op.toggleVisibility', (d) => { const entity = D.findEntity(d, id); if (entity) D.updateEntity(d, id, { hidden: !entity.hidden }); });
      return;
    }
    const groupEye = target.closest('[data-tree-group-eye]');
    if (groupEye) {
      event.stopPropagation();
      const id = groupEye.dataset.treeGroupEye;
      change('std.op.toggleVisibility', (d) => { d.groups = d.groups.map((g) => (g.id === id ? { ...g, hidden: !g.hidden } : g)); });
      return;
    }
    const doc = target.closest('[data-tree-doc]');
    if (doc && doc.dataset.treeDoc !== state.active) { activateDoc(doc.dataset.treeDoc); return; }
    const item = target.closest('[data-tree-entity]');
    if (item) {
      const id = item.dataset.treeEntity;
      if (event.shiftKey || event.ctrlKey || event.metaKey) select([id], { toggle: true });
      else select([id]);
      // Std_TreeSyncView: the view goes to what is picked in the tree.
      if (state.settings.tree?.syncView) run('viewFitSelection');
      return;
    }
    const groupRow = target.closest('[data-tree-group]');
    if (groupRow) {
      const drawing = activeDrawing();
      // The group picked in the tree (the sketch the Sketcher commands are about).
      state.treeGroup = groupRow.dataset.treeGroup;
      const ids = new Set([groupRow.dataset.treeGroup]);
      for (const g of drawing.groups ?? []) if (ids.has(g.parent)) ids.add(g.id);
      select(drawing.entities.filter((e) => ids.has(e.group)).map((e) => e.id));
    }
  });
  root.addEventListener('dblclick', (event) => {
    const item = event.target.closest('[data-tree-entity]');
    if (item) { select([item.dataset.treeEntity]); run('editObject'); return; }
    const rename = event.target.closest('[data-tree-rename]');
    if (rename) renameGroup(rename.dataset.treeRename);
  });
  root.addEventListener('mouseover', (event) => {
    // Std_TreePreSelection: what the pointer is on in the tree lights up in the drawing.
    if (state.settings.tree?.preSelection === false) return;
    const item = event.target.closest?.('[data-tree-entity]');
    const id = item?.dataset.treeEntity ?? null;
    if (!event.target.closest?.('.model-tree') || id === state.hover) return;
    state.hover = id;
    scheduleRender();
  });
  root.addEventListener('dragstart', (event) => {
    const item = event.target.closest?.('[data-tree-entity], [data-tree-group]');
    if (item && event.target.closest('.model-tree')) {
      const id = item.dataset.treeEntity;
      const ids = id ? (state.selection.has(id) ? selectedIds() : [id]) : [];
      event.dataTransfer.setData('application/x-mycad-tree', JSON.stringify({ ids, group: item.dataset.treeGroup ?? null }));
      event.dataTransfer.effectAllowed = 'move';
      return;
    }
    const tool = event.target.closest?.('.toolbar-left.unlocked [data-toolbar-id]');
    if (tool) event.dataTransfer.setData('application/x-mycad-toolbar', tool.dataset.toolbarId);
  });
  root.addEventListener('dragover', (event) => {
    if (event.target.closest?.('.model-tree [data-tree-drop]') && [...event.dataTransfer.types].includes('application/x-mycad-tree')) event.preventDefault();
    if (event.target.closest?.('.toolbar-left.unlocked [data-toolbar-id]') && [...event.dataTransfer.types].includes('application/x-mycad-toolbar')) event.preventDefault();
  });
  root.addEventListener('drop', (event) => {
    const toolbar = event.dataTransfer.getData('application/x-mycad-toolbar');
    const onTool = event.target.closest?.('[data-toolbar-id]');
    if (toolbar && onTool) {
      event.preventDefault();
      const order = TOOLBAR_IDS.slice();
      const order2 = [...(state.settings.toolbarOrder ?? []).filter((id) => order.includes(id)), ...order.filter((id) => !(state.settings.toolbarOrder ?? []).includes(id))];
      order2.splice(order2.indexOf(toolbar), 1);
      order2.splice(order2.indexOf(onTool.dataset.toolbarId), 0, toolbar);
      updateSettings({ toolbarOrder: order2 });
      return;
    }
    const target = event.target.closest?.('.model-tree [data-tree-drop]');
    const raw = event.dataTransfer.getData('application/x-mycad-tree');
    if (!target || !raw) return;
    event.preventDefault();
    const { ids, group } = JSON.parse(raw);
    const into = target.dataset.treeDrop || null;
    if (group) {
      if (group === into) return;
      change('std.op.moveToGroup', (d) => { d.groups = d.groups.map((g) => (g.id === group ? { ...g, parent: into } : g)); });
    } else if (ids.length) moveToGroup(ids, into);
  });
  window.addEventListener('pointermove', (event) => {
    const screen = toScreen(event.clientX, event.clientY);
    state.pointer = { x: screen.x, y: screen.y, clientX: event.clientX, clientY: event.clientY };
  }, { passive: true });
}

async function renameGroup(id) {
  const group = activeDrawing()?.groups?.find((g) => g.id === id);
  if (!group) return;
  const answer = await form({ title: t('std.renameGroup'), icon: 'group', width: 440, fields: [{ key: 'name', type: 'text', label: t('std.groupName'), icon: 'edit', value: group.name }], actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }] });
  if (answer?.action !== 'ok' || !answer.values.name.trim()) return;
  change('std.op.group', (d) => { d.groups = d.groups.map((g) => (g.id === id ? { ...g, name: answer.values.name.trim() } : g)); });
}

function bindEvents() {
  bindTreeEvents();
  bindSteppers(root, (key, value) => {
    if (key === 'startTransparency' || key === 'startMotion' || key === 'startCamera' || key === 'startObjects') updateSettings({ [key]: value });
  });
  root.addEventListener('click', (event) => {
    if (suppressClick) return undefined;
    const target = event.target;
    const menu = target.closest('[data-menu]');
    if (menu) {
      const name = menu.dataset.menu;
      if (state.lastMenuClose.name === name && Date.now() - state.lastMenuClose.at < 300) return undefined;
      return openMenubarMenu(name);
    }
    if (target.closest('[data-doc-close]')) return closeDocViewer();
    const command = target.closest('[data-command]');
    if (command && !command.disabled) {
      const anchor = command.dataset.command === 'themeMenu' ? anchorBelow(command.closest('.split-button') ?? command)
        : command.dataset.command === 'exportMenu' ? anchorBelow(command) : undefined;
      return run(command.dataset.command, { anchor });
    }
    // Start page: the house tab, recent files, samples, lessons.
    if (target.closest('[data-tab-home]')) return showHome(true);
    const recentRemove = target.closest('[data-recent-remove]');
    if (recentRemove) {
      state.recent = state.recent.filter((item) => item.path !== recentRemove.dataset.recentRemove);
      storeRecent(globalThis.localStorage, state.recent);
      return renderStart();
    }
    if (target.closest('[data-recent-clear]')) { state.recent = []; storeRecent(globalThis.localStorage, state.recent); return renderStart(); }
    const sceneButton = target.closest('[data-start-scene]');
    if (sceneButton) return updateSettings({ startScene: sceneButton.dataset.startScene });
    if (target.closest('[data-start-motion-reset]')) {
      const fresh = defaultSettings(state.settings.language);
      return updateSettings({ startTransparency: fresh.startTransparency, startMotion: fresh.startMotion, startCamera: fresh.startCamera, startObjects: fresh.startObjects });
    }
    const recentItem = target.closest('[data-recent-path]');
    if (recentItem) return openRecent(recentItem.dataset.recentPath);
    const sample = target.closest('[data-sample-open], [data-sample]');
    if (sample) return openSample(sample.dataset.sampleOpen ?? sample.dataset.sample);
    const lesson = target.closest('[data-start-lesson]');
    if (lesson) return openTutorial({ lesson: Number(lesson.dataset.startLesson) });
    const closeDocButton = target.closest('[data-close-doc]');
    if (closeDocButton) return closeDoc(state.docs.find((doc) => doc.id === closeDocButton.dataset.closeDoc));
    const tab = target.closest('.tab');
    if (tab) return activateDoc(tab.dataset.doc);
    const scroll = target.closest('[data-tab-scroll]');
    if (scroll) return scrollTabs(Number(scroll.dataset.tabScroll));
    const panelToggle = target.closest('[data-panel-toggle]');
    if (panelToggle) return run(panelToggle.dataset.panelToggle === 'left' ? 'leftPanel' : 'rightPanel');
    const sectionToggle = target.closest('[data-section-toggle]');
    if (sectionToggle) return toggleSection(sectionToggle.dataset.sectionToggle);
    const sectionsAll = target.closest('[data-sections]');
    if (sectionsAll) return toggleSection('*', sectionsAll.dataset.sections === 'expand');
    const section = target.closest('[data-panel-section]');
    if (section) {
      const [side, name] = section.dataset.panelSection.split(':');
      // From the rail: open the panel and that section.
      if (side === 'left' && state.settings.collapsedSections.includes(name)) toggleSection(name, true);
      updateSettings(side === 'left' ? { showLeftPanel: true } : { showRightPanel: true });
      return root.querySelector(`#${side}-panel [data-section="${name}"]`)?.scrollIntoView({ block: 'start' });
    }
    const stepButton = target.closest('[data-prop-step-dir]');
    if (stepButton) {
      const wrap = stepButton.closest('[data-prop-step]');
      const input = wrap?.querySelector('input');
      if (input) {
        const current = input.dataset.length ? toUnit(evaluateLength(input.value)) : evaluate(input.value);
        const step = Number(wrap.dataset.propStep) || 1;
        const value = (Number.isFinite(current) ? current : 0) + Number(stepButton.dataset.propStepDir) * step;
        input.value = String(Math.round(value * 1e6) / 1e6);
        onPropertyChange(input);
      }
      return undefined;
    }
    const lightReset = target.closest('[data-light-reset]');
    if (lightReset) return setLightOptions({ on: true, azimuth: 135, elevation: 55, intensity: 1, color: '#ffffff', shadows: true });
    const bar3d = target.closest('[data-view3d]');
    if (bar3d) return on3dBar(bar3d.dataset.view3d);
    if (target.closest('[data-edge-pick-mode]')) return toggleEdgePick();
    const animButton = target.closest('[data-anim]');
    if (animButton) return onAnimBar(animButton.dataset.anim);
    const toolButton = target.closest('[data-tool]');
    if (toolButton && !toolButton.disabled) return setTool(toolButton.dataset.tool);
    const partCategory = target.closest('[data-part-category]');
    if (partCategory) { state.partCategory = partCategory.dataset.partCategory; return renderLeft(); }
    const part = target.closest('[data-part]');
    if (part && !part.disabled) return openPartDialog({ kind: part.dataset.part });
    const levelVisible = target.closest('[data-level-visible]');
    if (levelVisible) return change('op.level', (d) => { const level = d.bim.levels.find((item) => item.id === levelVisible.dataset.levelVisible); level.visible = !level.visible; });
    const levelPlan = target.closest('[data-level-plan]');
    if (levelPlan) return change('op.level', (d) => { ensureBim(d).planLevel = levelPlan.dataset.levelPlan || null; });
    const levelActive = target.closest('[data-level-active]');
    if (levelActive) return change('op.level', (d) => { ensureBim(d).activeLevel = levelActive.dataset.levelActive; });
    if (target.closest('[data-level-add]')) return addLevel();
    const visible = target.closest('[data-layer-visible]');
    if (visible) return toggleLayer(visible.dataset.layerVisible, 'visible');
    const lock = target.closest('[data-layer-lock]');
    if (lock) return toggleLayer(lock.dataset.layerLock, 'locked');
    const activateLayer = target.closest('[data-layer-activate]');
    if (activateLayer) return change('op.layer', (drawing) => { drawing.activeLayer = activateLayer.dataset.layerActivate; });
    const consoleButton = target.closest('[data-console]');
    if (consoleButton) return onConsoleAction(consoleButton.dataset.console);
    const bindRemove = target.closest('[data-bind-remove]');
    if (bindRemove) {
      const id = selectedIds()[0];
      return change('op.unbind', (d) => { const e = D.findEntity(d, id); if (!e?.bind) return; const bind = { ...e.bind }; delete bind[bindRemove.dataset.bindRemove]; D.updateEntity(d, id, { bind }); });
    }
    const jointRemove = target.closest('[data-joint-remove]');
    if (jointRemove) return change('op.joint', (d) => { d.joints = (d.joints ?? []).filter((j) => j.id !== jointRemove.dataset.jointRemove); if (!d.joints.length) delete d.joints; });
    const constraintPick = target.closest('[data-constraint-pick]');
    if (constraintPick) {
      const id = constraintPick.dataset.constraintPick;
      const picked = new Set(state.constraintSelection ?? []);
      if (picked.has(id)) picked.delete(id); else picked.add(id);
      state.constraintSelection = [...picked];
      renderRight();
      scheduleRender();
      return undefined;
    }
    const constraintRemove = target.closest('[data-constraint-remove]');
    if (constraintRemove) return change('op.unconstrain', (d) => { d.constraints = (d.constraints ?? []).filter((c) => c.id !== constraintRemove.dataset.constraintRemove); });
    const removeButton = target.closest('[data-layer-remove]');
    if (removeButton && !removeButton.disabled) return removeLayer(removeButton.dataset.layerRemove);
    const align = target.closest('[data-text-align]');
    if (align) return change('op.edit', (drawing) => D.updateEntity(drawing, selectedIds()[0], { align: align.dataset.textAlign }));
    return undefined;
  });

  root.addEventListener('dblclick', (event) => {
    const layer = event.target.closest('[data-layer-activate]');
    if (layer) return renameLayer(layer.dataset.layerActivate);
    const tab = event.target.closest('.tab');
    if (tab) return run('renameDrawing');
    if (event.target.closest('#tabs') && !tab) return run('new');
    if (event.target.id === 'zoom-value') return setZoomPercent(100);
    if (event.target.closest('#cad-canvas')) {
      if (state.tool?.id === 'polyline') { state.tool.finish(); renderCommandBar(); scheduleRender(); return undefined; }
      const entity = selectedEntities()[0];
      if (!state.tool && entity?.type === 'part') return openPartDialog({ entity });
      if (!state.tool && entity?.type === 'text') return focusProperty('text');
    }
    return undefined;
  });

  root.addEventListener('auxclick', (event) => {
    const tab = event.target.closest('.tab');
    if (tab && event.button === 1) closeDoc(state.docs.find((doc) => doc.id === tab.dataset.doc));
  });

  // Bottom-right grip: resizes the window like its OS border.
  root.addEventListener('pointerdown', (event) => {
    if (event.button === 0 && desktop && event.target.closest('[data-resize-grip]')) {
      event.preventDefault();
      appWindow.startResizeDragging('SouthEast').catch((error) => showError('error.unexpected', error, 'resize'));
    }
  });

  // Problems panel: a row shows its problem, a chip filters by severity.
  root.addEventListener('click', (event) => {
    const row = event.target.closest('[data-problem]');
    if (row) { showProblem(Number(row.dataset.problem)); return; }
    const chip = event.target.closest('[data-problem-filter]');
    if (chip) {
      const severity = chip.dataset.problemFilter;
      state.problems.filter = { ...state.problems.filter, [severity]: !state.problems.filter[severity] };
      renderProblems();
  renderConsole();
    }
  });

  root.addEventListener('pointerdown', (event) => {
    // A click in the main window closes an open menu (it normally closes itself on losing focus).
    if (state.openMenu && desktop) native.invoke('hide_popup', { kind: 'menu' }).catch(() => {});
    const part = event.target.closest('[data-part]');
    if (part && !part.disabled && event.button === 0) startPartDrag(event, part.dataset.part);
  });

  root.addEventListener('pointerover', (event) => {
    const menu = event.target.closest('[data-menu]');
    if (menu && state.openMenu && MENUS[state.openMenu] && state.openMenu !== menu.dataset.menu) openMenubarMenu(menu.dataset.menu);
  });

  document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (canvasState.drag) return;
    contextMenuFor(event);
  });

  const canvas = root.querySelector('#cad-canvas');
  canvas.tabIndex = 0;
  canvas.addEventListener('pointerdown', onCanvasPointerDown);
  canvas.addEventListener('pointermove', onCanvasPointerMove);
  canvas.addEventListener('pointerup', onCanvasPointerUp);
  canvas.addEventListener('pointercancel', onCanvasPointerUp);
  canvas.addEventListener('pointerleave', () => {
    if (canvasState.drag) return;
    state.cursor = null;
    state.snap = null;
    state.hover = null;
    scheduleRender();
  });
  canvas.addEventListener('wheel', onCanvasWheel, { passive: false });
  new ResizeObserver(() => { resizeCanvas(); resize3d(); }).observe(root.querySelector('#canvas-wrap'));
  bindScaleBar();

  // The animation's time slider: scrubbing pauses and shows that moment.
  root.addEventListener('input', (event) => {
    if (event.target.id !== 'anim-time') return;
    if (anim.playing) { anim.playing = false; cancelAnimationFrame(anim.frame); renderView3dBar(); }
    showAnimationAt(Number(event.target.value));
  });
  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target.id === 'zoom-value') {
      setZoomPercent(parseFloat(target.value) || 100);
      return;
    }
    if (target.id === 'anim-duration') {
      const value = evaluate(target.value);
      if (Number.isFinite(value) && value > 0) setAnimation({ duration: value });
      else { notify('error', t('notice.badNumber', { text: target.value })); renderView3dBar(); }
      return;
    }
    if (target.id === 'view3d-thickness') {
      const value = evaluateLength(target.value);
      if (Number.isFinite(value) && value > 0) updateSettings({ extrudeHeight: Math.min(1000, value) });
      else notify('error', t('notice.badNumber', { text: target.value }));
      rebuild3d();
      return;
    }
    if (target.dataset.layerColor) {
      change('op.layer', (drawing) => D.updateLayer(drawing, target.dataset.layerColor, { color: target.value }));
      return;
    }
    if (target.dataset.toolOption) {
      const key = target.dataset.toolOption;
      if (target.type === 'checkbox') state.toolOptions[key] = target.checked;
      else if (target.tagName === 'SELECT') state.toolOptions[key] = target.value;
      else if (key === 'hatchAngle') {
        const value = evaluate(target.value);
        if (Number.isFinite(value)) state.toolOptions[key] = value;
        else notify('error', t('notice.badNumber', { text: target.value }));
      } else {
        const value = target.dataset.length ? evaluateLength(target.value) : evaluate(target.value);
        if (Number.isFinite(value) && value > 0) state.toolOptions[key] = key === 'sides' ? Math.max(3, Math.min(64, Math.round(value))) : value;
        else notify('error', t('notice.badNumber', { text: target.value }));
      }
      renderLeft();
      renderCommandBar();
      return;
    }
    if (target.closest('#right-panel')) onPropertyChange(target);
  });

  const command = root.querySelector('#command-input');
  command.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const value = command.value;
      command.value = '';
      submitCommand(value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      command.value = '';
      command.blur();
      if (state.tool) setTool('select');
    }
    event.stopPropagation();
  });

  root.querySelector('#tabs').addEventListener('wheel', (event) => {
    const strip = root.querySelector('.tab-strip');
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    event.preventDefault();
    strip.scrollLeft += event.deltaY || event.deltaX;
    updateTabNav();
  }, { passive: false });

  window.addEventListener('resize', () => {
    updateTabNav();
    // Programmatic resizes are not limited by the OS minimum size: grow back.
    if (desktop && state.minWidth && window.innerWidth < state.minWidth - 1) native.setMinimumSize(state.minWidth, 600).catch(() => {});
  });

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', (event) => {
    if (event.key === ' ') canvasState.spaceDown = false;
  });

  // Settings and recent files changed in another window (settings popup, recent popup).
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      const previous = state.settings;
      state.settings = loadSettings(globalThis.localStorage);
      applySettings(previous);
    } else if (event.key === RECENT_KEY) {
      state.recent = loadRecent(globalThis.localStorage);
    }
  });

  // External drops (web build): files and text.
  if (!desktop) {
    let depth = 0;
    document.addEventListener('dragenter', (event) => { if (event.dataTransfer?.types?.length) { depth += 1; setDropActive(true); event.preventDefault(); } });
    document.addEventListener('dragover', (event) => { event.preventDefault(); });
    document.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) setDropActive(false); });
    document.addEventListener('drop', (event) => {
      event.preventDefault();
      depth = 0;
      setDropActive(false);
      const files = [...(event.dataTransfer?.files ?? [])];
      const text = event.dataTransfer?.getData('text/plain') ?? '';
      handleDroppedFiles(files, text, { x: event.clientX, y: event.clientY });
    });
    window.addEventListener('beforeunload', (event) => {
      if (state.docs.some((doc) => doc.dirty)) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  }
}

const SHORTCUTS = [
  ['n', false, 'new'], ['o', false, 'open'], ['s', false, 'save'], ['s', true, 'saveAs'], ['r', true, 'recent'], ['r', false, 'rulers'], ['w', false, 'closeTab'],
  ['z', false, 'undo'], ['y', false, 'redo'], ['z', true, 'redo'], ['x', false, 'cut'], ['c', false, 'copy'], ['v', false, 'paste'],
  ['j', true, 'console'], ['d', false, 'duplicate'], ['a', false, 'selectAll'], ['p', false, 'print'], ['p', true, 'exportStl'], ['e', true, 'explode'],
  ['=', false, 'zoomIn'], ['+', false, 'zoomIn'], ['+', true, 'zoomIn'], ['-', false, 'zoomOut'], ['0', false, 'zoom100'],
  [',', false, 'settings'], ['l', true, 'language'], ['tab', false, 'nextTab'], ['tab', true, 'prevTab'], ['!', true, 'leftPanel'], ['1', true, 'leftPanel'],
  ['@', true, 'rightPanel'], ['2', true, 'rightPanel'], ['#', true, 'view3d'], ['3', true, 'view3d'], ['q', false, 'exit'], ['i', false, 'import3d'], ['g', true, 'light'], ['b', true, 'scaleBar'],
];
const FUNCTION_KEYS = { f1: 'about', f2: 'renameDrawing', f3: 'snap', f7: 'grid', f8: 'ortho', f9: 'snapGrid', f11: 'fullscreen', home: 'zoomFit' };

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  // Script console: Ctrl+Enter runs, Ctrl+↑/↓ walks the history.
  if (event.target.id === 'console-code' && (event.ctrlKey || event.metaKey)) {
    if (key === 'enter') { event.preventDefault(); event.stopPropagation(); onConsoleAction('run'); return; }
    if ((key === 'arrowup' || key === 'arrowdown') && consoleState.history.length) {
      event.preventDefault();
      consoleState.at = Math.max(0, Math.min(consoleState.history.length, consoleState.at + (key === 'arrowup' ? -1 : 1)));
      event.target.value = consoleState.history[consoleState.at] ?? '';
      return;
    }
  }
  const editing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.altKey && key === 's') { event.preventDefault(); run('saveAll'); return; }
  if (mod && !event.altKey) {
    // Text fields keep their own clipboard and undo.
    if (editing && ['x', 'c', 'v', 'z', 'y', 'a'].includes(key)) return;
    const custom = customShortcut(event);
    if (custom) { event.preventDefault(); event.stopPropagation(); run(custom); return; }
    const shortcut = SHORTCUTS.find(([k, shift]) => k === key && shift === event.shiftKey);
    if (shortcut) {
      event.preventDefault();
      event.stopPropagation();
      run(shortcut[2]);
    }
    return;
  }
  if (FUNCTION_KEYS[key] && !(editing && key === 'home')) { event.preventDefault(); run(FUNCTION_KEYS[key]); return; }
  if (!editing && !event.altKey && customShortcut(event)) { event.preventDefault(); run(customShortcut(event)); return; }
  if (editing) {
    if (key === 'escape') event.target.blur();
    return;
  }
  if (key === ' ' && !canvasState.spaceDown) { canvasState.spaceDown = true; event.preventDefault(); return; }
  if (key === 'escape') {
    if (isDocViewerOpen()) { closeDocViewer(); return; }
    if (state.focusView) { setFocusView(false); return; }
    if (state.tool) { if (state.tool.points.length || state.tool.target) { state.tool.cancel(); renderCommandBar(); scheduleRender(); } else setTool('select'); return; }
    if (state.toolId !== 'select') { setTool('select'); return; }
    run('clearSelection');
    return;
  }
  if (key === 'enter') {
    if (state.tool) { event.preventDefault(); if (!state.tool.finish()) setTool('select'); renderCommandBar(); scheduleRender(); }
    return;
  }
  if (key === 'delete' || (isMac && key === 'backspace')) { event.preventDefault(); run('delete'); return; }
  // Digits, @, minus… go to the command box (typed coordinates); letters pick tools.
  if (activeDoc() && event.key.length === 1 && !event.altKey) {
    const input = root.querySelector('#command-input');
    if (/[0-9@.\-<,]/.test(event.key) && state.tool) {
      event.preventDefault();
      input.focus();
      input.value += event.key;
      return;
    }
    const tool = Object.entries(TOOL_KEYS).find(([, letter]) => letter.toLowerCase() === key);
    if (tool) { event.preventDefault(); run(`tool:${tool[0]}`); }
  }
}

// ───────────────────────── popup actions

function bindPopupActions() {
  popups.on('error', (error) => showError('error.unexpected', error));
  popups.on('tutorial', (data) => state.tutorial?.handle(data));
  popups.on('report-error', (data) => showError(data.titleKey ?? 'error.unexpected', new Error(data.message), data.context ?? ''));
  popups.on('choose-background', () => chooseBackground());
  popups.on('clear-background', () => removeBackground());
  popups.on('open-recent', (data) => openRecent(data.path));
  popups.on('notice', (data) => notify(data.kind ?? 'info', data.text));
  popups.on('printed', () => notify('success', t('notice.printed')));
  popups.on('open-settings', (data) => popups.open('settings', { tab: data.tab ?? 'general', themeGroup: data.themeGroup }));
}

// ───────────────────────── start-up

async function restoreSession() {
  if (!desktop || !state.settings.restoreSession) return;
  let files = [];
  try {
    files = JSON.parse(globalThis.localStorage?.getItem(SESSION_KEY) ?? '{}').files ?? [];
  } catch { /* none */ }
  if (!files.length) return;
  const exists = await native.pathsExist(files);
  for (const [index, path] of files.entries()) {
    if (exists[index]) await openPath(path, { quiet: true });
  }
}

async function start() {
  renderShell();
  bindEvents();
  bindPopupActions();
  resizeCanvas();
  await popups.init();
  reportPreviousRun();
  state.info = await native.appInfo().catch(() => null);
  native.listFonts().then((fonts) => { state.fonts = fonts; if (selectedEntities()[0]?.type === 'text') renderRight(); }).catch(() => {});
  native.setBackendLanguage(state.settings.language);
  applySettings({});
  applyOverlay();
  if (state.safeMode) notify('warning', t('std.safeModeOn'));
  await loadBackground();

  if (desktop) {
    appWindow.onCloseRequested(async (event) => {
      if (state.quitting) return;
      event.preventDefault();
      if (await confirmExit()) {
        state.quitting = true;
        await native.quitApp();
      }
    });
    getCurrentWebview().onDragDropEvent((event) => {
      const { type } = event.payload;
      if (type === 'enter' || type === 'over') setDropActive(true);
      else if (type === 'leave') setDropActive(false);
      else if (type === 'drop') {
        setDropActive(false);
        const scale = window.devicePixelRatio || 1;
        const point = event.payload.position ? { x: event.payload.position.x / scale, y: event.payload.position.y / scale } : null;
        handleDroppedPaths(event.payload.paths ?? [], point);
      }
    });
    native.listen('fatal-error', (fatal) => {
      const detail = [`${t('error.location')}: ${fatal.location}`, `${t('error.thread')}: ${fatal.thread}`, fatal.log ? `${t('error.log')}: ${fatal.log}` : '', '', fatal.backtrace].join('\n');
      const error = new Error(fatal.message);
      error.stack = detail;
      showError('error.fatal', error, fatal.location);
    });
    native.listen('open-files', async (paths) => {
      for (const path of paths) await openPath(path);
      renderAll();
    });
  }

  await restoreSession();
  const startupFiles = await native.startupFiles().catch(() => []);
  for (const path of startupFiles) await openPath(path);
  if (!state.docs.length) addDocument(welcomeDrawing());
  // The start page greets you, unless files were opened with the program.
  if (!startupFiles.length && state.settings.showStartPage) { state.home = true; loadSamples(); }
  if (!state.active && state.docs.length) activate_(state.docs[0].id);
  renderAll();
  if (desktop) {
    await appWindow.show();
    await appWindow.setFocus();
    setTimeout(() => popups.prewarm('menu'), 300);
  }
  startKernel();
}

// Test hook: the E2E suites drive the app through this (no effect on normal use).
// ───────────────────────── FreeCAD Std commands: what src/commands/std.js uses

/** The app as the Std commands see it (getters: some of it is made further down). */
function stdApp() {
  return {
    get state() { return state; }, get view3d() { return view3d; }, get popups() { return popups; }, get commands() { return commands; }, D, t,
    get TOOLBAR_IDS() { return TOOLBAR_IDS; }, updateSettings, renderLeft, run, commandEnabled, showTree, showCommandMenu, applyOverlay, moveToGroup, boxOf: (entity) => cachedBox(entity),
    labelOf, language: () => getLanguage(), readClipboard, transformSelection, massText, chooseTexture, replaceSettings, openViewerWindow, setTiled, startVr,
    printPdf, extractDocument, createDocumentFromJson, showMacroMenu, reloadStyle: () => applySettings(state.settings), restartSafeMode, leaveSafeMode, boxSelectEdges, clarifySelection,
    selectedSolids, setElementFilter, clearElements, boxSelect3d, topologyOfEntity, elementTriangles, elementPoints, boxOf3d, datumSize, makeFaceFromWires, projectOnSurface, importCurveNetwork,
    fmt, newId, selectedEntitiesList: () => selectedEntities(),
    setTool, constrainSelection, solidMeshOf: (entity) => solidMesh(entity), repaint: () => scheduleRender(), renderRight, openSpreadsheet, importSheetCsv, robotTrajectory, saveText, saveBytes, readTextFileDialog,
    solidFeature, openSolidDialog, booleanSelection, workPlaneOnFace: (point, normal) => setWorkPlaneFace(point, normal),
    workPlaneOnDatum: (datum) => setWorkPlaneFace([datum.x ?? 0, datum.y ?? 0, datum.z ?? 0], apply3(rotationOf(datum), [0, 0, 1])),
    notify, change, select, selectedIds, selectedEntities, activeDoc, activeDrawing, activateDoc, docName, closeDoc, toggle3d, rebuild3d,
    renderToolbarState, form, copyText, zoomToSelection, startBoxZoom2d, selectionStep, setFullscreen, setFocusView, revertDoc, saveCopy,
    mergeDocument, recompute, newGroup, dependencyGraph, startWhatsThis, openUrl, openDocument, libraryVersions, pythonModulesText,
    openMacroFolder, sendToConsole, setExpressionScope, consolePrint: (text) => consoleLog('info', text), consoleLog, insertSolid,
    ensureBim, newDrawing, chooseImageData,
  };
}

/** A small dialog (the generic form popup). Handlers get live changes, list picks and buttons that keep it open. */
function form(spec, { onChange = null, onPick = null, onButton = null } = {}) {
  popups.on('form:change', onChange ?? (() => {}));
  popups.on('form:pick', onPick ?? (() => {}));
  popups.on('form:button', onButton ?? (() => {}));
  // reserveRows: room for fields the dialog adds later (form:fields).
  const rows = spec.fields.reduce((sum, f) => sum + (f.type === 'textarea' ? (f.rows ?? 6) * 19 + 44 : f.type === 'list' ? Math.min(8, Math.max(1, f.options?.length ?? 1)) * 34 + 44 : 40), 0) + (spec.reserveRows ?? 0) * 40;
  const height = Math.min(Math.round(window.screen.availHeight * 0.9), 116 + (spec.intro ? 48 : 0) + rows);
  return popups.open('form', spec, { size: { width: spec.width ?? POPUPS.form.width, height } });
}

/** Expressions see the spreadsheet's aliases and cells and the variables of the variable sets. */
function setExpressionScope() {
  const drawing = activeDrawing();
  // Sheet names come as a Map (lower-case); variable-set names are added to it.
  const scope = new Map(sheetVariables(drawing?.spreadsheet));
  for (const [name, value] of Object.entries(variableScope(drawing))) scope.set(name.toLowerCase(), value);
  setVariables(scope);
}

async function copyText(text) {
  try {
    await native.clipboardWrite(text);
  } catch {
    try { await navigator.clipboard?.writeText(text); } catch { /* no clipboard */ }
  }
}

/** Std_SelBack / Std_SelForward: the selections made, newest last. */
function recordSelection() {
  if (state.selStepping) return;
  void _bestFit;
  const history = state.selHistory ??= { list: [[]], at: 0 };
  const now = [...state.selection];
  const last = history.list[history.at] ?? [];
  if (now.length === last.length && now.every((id, i) => id === last[i])) return;
  history.list = history.list.slice(0, history.at + 1);
  history.list.push(now);
  if (history.list.length > 50) history.list.shift();
  history.at = history.list.length - 1;
}

function selectionStep(direction) {
  const history = state.selHistory;
  if (!history) return;
  const at = Math.max(0, Math.min(history.list.length - 1, history.at + direction));
  if (at === history.at) return;
  history.at = at;
  const ids = new Set(activeDrawing()?.entities.map((e) => e.id) ?? []);
  state.selStepping = true;
  try { select(history.list[at].filter((id) => ids.has(id))); } finally { state.selStepping = false; }
}

/** Std_ViewFitSelection in 2D: the selected entities fill the view. */
function zoomToSelection() {
  const doc = activeDoc();
  const boxes = selectedEntities().map((entity) => cachedBox(entity)).filter(Boolean);
  if (!doc || !boxes.length) return;
  const box = boxes.reduce((a, b) => ({ minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) }));
  ensureViewport(doc).fit(box, 40, state.settings.showRulers ? RULER : 0);
  scheduleRender();
}

/** Std_ViewBoxZoom in 2D: the next drag on the drawing draws a box, and the view zooms to it. */
function startBoxZoom2d() {
  const canvas = root.querySelector('#cad-canvas');
  const wrap = root.querySelector('#canvas-wrap');
  if (!canvas || !wrap) return;
  notify('info', t('std.boxZoomHint'));
  const box = document.createElement('div');
  box.className = 'view3d-zoom-box';
  wrap.append(box);
  let start = null;
  const rect = () => canvas.getBoundingClientRect();
  const down = (event) => { event.preventDefault(); event.stopPropagation(); const r = rect(); start = { x: event.clientX - r.left, y: event.clientY - r.top }; };
  const move = (event) => {
    if (!start) return;
    const r = rect();
    const x = event.clientX - r.left;
    const y = event.clientY - r.top;
    Object.assign(box.style, { left: `${Math.min(x, start.x)}px`, top: `${Math.min(y, start.y)}px`, width: `${Math.abs(x - start.x)}px`, height: `${Math.abs(y - start.y)}px` });
  };
  const up = (event) => {
    canvas.removeEventListener('pointerdown', down, true);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up, true);
    box.remove();
    const doc = activeDoc();
    if (!start || !doc) return;
    event.stopPropagation();
    const r = rect();
    const vp = ensureViewport(doc);
    const a = vp.toWorld({ x: start.x, y: start.y });
    const b = vp.toWorld({ x: event.clientX - r.left, y: event.clientY - r.top });
    if (Math.abs(event.clientX - r.left - start.x) < 4 || Math.abs(event.clientY - r.top - start.y) < 4) return;
    vp.fit({ minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) }, 0, state.settings.showRulers ? RULER : 0);
    scheduleRender();
  };
  canvas.addEventListener('pointerdown', down, true);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up, true);
}

/** Std_MainFullscreen: the window fills the screen. */
async function setFullscreen(on) {
  state.fullscreen = Boolean(on);
  try {
    if (desktop) await appWindow.setFullscreen(state.fullscreen);
    else if (state.fullscreen) await document.documentElement.requestFullscreen?.();
    else if (document.fullscreenElement) await document.exitFullscreen?.();
  } catch (error) {
    state.fullscreen = false;
    showError('error.unexpected', error, 'fullscreen');
  }
  renderToolbarState();
}

/** Std_ViewFullscreen: only the drawing (or the 3D view) is shown; the same command brings the rest back. */
function setFocusView(on) {
  state.focusView = Boolean(on);
  root.classList.toggle('focus-view', state.focusView);
  if (state.focusView) notify('info', t('std.focusViewHint'));
  requestAnimationFrame(() => { window.dispatchEvent(new Event('resize')); resize3d(); scheduleRender(); });
  renderToolbarState();
}

/** Std_Revert: the drawing as last saved. */
async function revertDoc() {
  const doc = activeDoc();
  if (!doc?.path) return;
  if (doc.dirty) {
    const choice = await ask({ icon: 'revert', title: t('std.revert'), message: t('std.revertMessage', { name: docName(doc) }), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'revert', label: t('std.revert'), icon: 'revert', danger: true, primary: true }] });
    if (choice !== 'revert') return;
  }
  const path = doc.path;
  await closeDoc(doc, { force: true });
  await openPath(path);
}

/** Std_SaveCopy: written elsewhere; the drawing keeps its own file. */
async function saveCopy() {
  const doc = activeDoc();
  if (!doc) return;
  const text = serialize(doc.drawing);
  const name = `${safeFileName(stripExtension(docName(doc)))} copy.mcad`;
  try {
    if (desktop) {
      let path = await native.chooseDrawingToSave(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${name}`);
      if (!path) return;
      path = withExtension(path);
      await withProgress('progress.save', baseName(path), (op) => native.writeTextFile(path, text, op));
      notify('success', t('std.copySaved', { name: baseName(path) }));
    } else {
      native.downloadText(text, name, 'application/json');
    }
  } catch (error) {
    showError('error.save', error, name);
  }
}

/** Std_MergeProjects: the entities (and their layers) of another drawing come into this one. */
async function mergeDocument() {
  const doc = activeDoc();
  if (!doc) return;
  let incoming = [];
  try {
    if (desktop) {
      const paths = await native.chooseDrawingToOpen(state.settings.lastDirectory, {});
      for (const path of paths) {
        const text = await withProgress('progress.open', baseName(path), (op) => native.readTextFile(path, op));
        incoming.push(drawingFromText(path, text).drawing);
      }
    } else {
      const files = await native.pickDrawingFilesWeb({});
      incoming = files.filter((file) => file.text).map((file) => drawingFromText(file.name, file.text).drawing);
    }
  } catch (error) {
    showError('error.open', error);
    return;
  }
  if (!incoming.length) return;
  let count = 0;
  change('std.op.merge', (d) => {
    for (const other of incoming) {
      for (const layer of other.layers) if (!d.layers.some((l) => l.id === layer.id)) d.layers.push(structuredClone(layer));
      count += D.insertEntities(d, other.entities).length;
    }
  });
  notify('success', t('std.merged', { count }));
}

/** Std_Recompute: every derived shape is built again from its parameters. */
function recompute() {
  resetSolidCaches();
  const doc = activeDoc();
  if (doc) doc.apply(t('std.op.recompute'), () => {});
  afterChange();
  if (state.view3d) rebuild3d();
  notify('success', t('std.recomputed'));
}

/** Std_Group / Std_Part: a new group; what is selected goes into it. */
function newGroup({ part = false } = {}) {
  const ids = selectedIds();
  const drawing = activeDrawing();
  if (!drawing) return;
  const n = (drawing.groups?.filter((g) => Boolean(g.part) === part).length ?? 0) + 1;
  const group = { id: newId(), name: t(part ? 'std.partN' : 'std.groupN', { n }), parent: null, ...(part ? { part: true, placement: { x: 0, y: 0, z: 0, rz: 0 } } : {}) };
  change(part ? 'std.op.part' : 'std.op.group', (d) => {
    d.groups = [...(d.groups ?? []), group];
    for (const id of ids) { const entity = D.findEntity(d, id); if (entity) D.updateEntity(d, id, { group: group.id }); }
  });
  notify('success', t(part ? 'std.partMade' : 'std.groupMade', { name: group.name, count: ids.length }));
}

/** Std_DependencyGraph: what each object follows (clone sources, joints, constraints, spreadsheet). */
async function dependencyGraph() {
  const drawing = activeDrawing();
  if (!drawing) return;
  const { dependencyEdges, graphSvg } = await import('./domain/depgraph.js');
  const graph = dependencyEdges(drawing, (entity) => entity.name || t(`entity.${entity.type}`));
  const svg = graphSvg(graph);
  const answer = await form({
    title: t('std.dependencyGraph'), icon: 'dependencyGraph', width: 900,
    intro: graph.edges.length ? t('std.dependencyCount', { nodes: graph.nodes.length, edges: graph.edges.length }) : t('std.dependencyNone'),
    fields: [{ key: 'graph', type: 'textarea', label: t('std.dependencyText'), icon: 'dependencyGraph', value: graph.edges.map((e) => `${graph.nodes[e.from].label} → ${graph.nodes[e.to].label}  (${t(`std.dep.${e.kind}`)})`).join('\n') || '—', rows: 12, readonly: true }],
    actions: [{ id: 'svg', label: t('std.exportGraph'), icon: 'export' }, { id: 'ok', label: t('error.close'), primary: true }],
  });
  if (answer?.action !== 'svg') return;
  const name = `${safeFileName(stripExtension(docName(activeDoc())))}-dependencies.svg`;
  try {
    if (desktop) {
      const path = await native.chooseExportPath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${name}`, 'svg');
      if (path) await native.writeTextFile(path, svg, 'std');
    } else native.downloadText(svg, name, 'image/svg+xml');
  } catch (error) {
    showError('error.save', error, name);
  }
}

/** Std_WhatsThis: the next click on a button explains it instead of running it. */
function startWhatsThis() {
  notify('info', t('std.whatsThisHint'));
  root.classList.add('whats-this');
  const explain = (event) => {
    const target = event.target.closest('[data-command], [title]');
    event.preventDefault();
    event.stopPropagation();
    document.removeEventListener('click', explain, true);
    root.classList.remove('whats-this');
    if (!target) return;
    const id = target.dataset.command;
    const command = id ? commands[id] : null;
    const text = command ? `${t(command.label)}${command.key ? ` (${keyLabel(command.key)})` : ''}${command.tip ? ` — ${t(command.tip)}` : ''}` : target.title;
    notify('info', text || t('std.whatsThisNothing'));
  };
  setTimeout(() => document.addEventListener('click', explain, true), 0);
}

async function openUrl(url) {
  try {
    if (desktop) await native.invoke('open_url', { url });
    else window.open(url, '_blank', 'noopener');
  } catch (error) {
    showError('error.open', error, url);
  }
}

async function openDocument(name) {
  try {
    if (desktop) await native.invoke('open_document', { name });
    else window.open(name, '_blank', 'noopener');
  } catch (error) {
    showError('error.open', error, name);
  }
}

/** Std_AboutQt: the libraries MyCAD is built on, with their versions. */
async function libraryVersions() {
  const deps = packageInfo.dependencies ?? {};
  const info = await native.appInfo().catch(() => ({}));
  const clean = (v) => String(v ?? '').replace(/^[\^~]/, '');
  return [
    ['MyCAD', info.version ?? packageInfo.version, t('std.lib.mycad')],
    ['Tauri', clean(deps['@tauri-apps/api']), t('std.lib.tauri')],
    ['three.js', `r${THREE_REVISION}`, t('std.lib.three')],
    ['OpenCASCADE (replicad-opencascadejs)', clean(deps['replicad-opencascadejs']), t('std.lib.occ')],
    ['Pyodide', clean(deps.pyodide), t('std.lib.pyodide')],
  ];
}

/** Std_PythonHelp: the Python modules scripts can import, with their classes and functions. */
async function pythonModulesText() {
  const lines = [t('std.pythonIntro'), ''];
  for (const [file, source] of Object.entries(PYTHON_MODULES)) {
    lines.push(`── ${file.replace(/\.py$/, '')}`);
    for (const line of source.split('\n')) {
      const m = line.match(/^(\s*)(class|def)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(\([^)]*\))?/);
      if (m && !m[3].startsWith('_')) lines.push(`${m[1]}${m[2]} ${m[3]}${m[4] ?? ''}`);
    }
    lines.push('');
  }
  lines.push('── mycad', ...['add(type, data)', 'solid(kind, params, place)', 'get(id)', 'update(id, patch)', 'remove(id)', 'select(ids)', 'run(command)', 'json(value)', 'obj(json)'].map((f) => `def ${f}`));
  return lines.join('\n');
}

/** Std_OpenMacrosFolder: the macros as files in the data folder, shown in the file manager. */
async function openMacroFolder() {
  const macros = state.settings.macros ?? [];
  if (!desktop) {
    native.downloadText(macros.map((m) => `# ${m.name} (${m.language ?? 'js'})\n${m.code ?? m.source ?? ''}`).join('\n\n'), 'macros.txt');
    return;
  }
  try {
    const dir = await native.invoke('open_data_folder', { name: 'macros' });
    for (const macro of macros) {
      const ext = macro.language === 'python' ? 'py' : 'js';
      await native.writeTextFile(`${dir}/${safeFileName(macro.name || 'macro')}.${ext}`, macro.code ?? macro.source ?? '', 'std');
    }
    notify('info', t('std.macroFolderOpened', { count: macros.length }));
  } catch (error) {
    showError('error.save', error, 'macros');
  }
}

/** Std_SendToPythonConsole: the selected objects as Python variables in the console. */
function sendToConsole(ids) {
  if (!state.settings.showConsole) updateSettings({ showConsole: true });
  updateSettings({ consoleLanguage: 'python' });
  const code = ['import mycad, json', ...ids.map((id, i) => `obj${ids.length > 1 ? i + 1 : ''} = json.loads(mycad.json(mycad.get(${JSON.stringify(id)})))`)].join('\n');
  consoleState.code = code;
  renderConsole();
  const input = root.querySelector('#console-code');
  if (input) { input.value = code; input.focus(); }
}

// ───────────────────────── Part: element selection and its helpers (src/commands/part.js)

/** Part_FaceSelection / EdgeSelection / VertexSelection: clicks in 3D pick that kind of element (null: whole objects). */
async function setElementFilter(kind) {
  state.elementFilter = kind ?? null;
  if (kind && !state.view3d) await toggle3d(true);
  view3d.instance?.setElementMode(state.elementFilter, onElementPick);
  if (kind) notify('info', t('part.filterHint', { kind: t(`part.kind.${kind}`) }));
  renderToolbarState();
}

function onElementPick(element, event) {
  if (!element) { if (!event?.shiftKey && !event?.ctrlKey) clearElements(); return; }
  const same = (el) => el.id === element.id && el.kind === element.kind && el.index === element.index;
  const add = event?.shiftKey || event?.ctrlKey;
  const list = state.elements ?? [];
  state.elements = add ? (list.some(same) ? list.filter((el) => !same(el)) : [...list, element]) : [element];
  select([...new Set(state.elements.map((el) => el.id))]);
  view3d.instance?.setElementHighlight(state.elements);
  renderRight();
}

function clearElements() {
  state.elements = [];
  view3d.instance?.setElementHighlight([]);
  renderRight();
}

/** Part_BoxSelection: objects (or, with an element filter, faces / edges / vertices) inside a dragged box. */
async function boxSelect3d() {
  if (!state.view3d) await toggle3d(true);
  notify('info', t('std.boxZoomHint'));
  view3d.instance.startBoxSelect((rect) => {
    const found = view3d.instance.elementsInRect(rect, state.elementFilter);
    if (state.elementFilter) {
      state.elements = found;
      select([...new Set(found.map((el) => el.id))]);
      view3d.instance.setElementHighlight(found);
    } else select(found.map((el) => el.id));
    renderRight();
  });
}

/** The faces, edges and vertices of a solid (from the 3D view when it is open, else from its mesh). */
function topologyOfEntity(entity) {
  return view3d.instance?.topologyOf(entity.id) ?? meshTopology(solidMesh(entity));
}

function elementTriangles(element) {
  const entity = D.findEntity(activeDrawing(), element.id);
  if (!entity || element.kind !== 'face') return [];
  const tris = view3d.instance?.entityTris?.get(entity.id) ?? solidMesh(entity);
  const topology = topologyOfEntity(entity);
  return (topology.faces[element.index]?.triangles ?? []).map((i) => tris[i]);
}

function elementPoints(element) {
  const entity = D.findEntity(activeDrawing(), element.id);
  if (!entity) return [];
  const topology = topologyOfEntity(entity);
  if (element.kind === 'edge') return topology.edges[element.index]?.points ?? [];
  if (element.kind === 'vertex') return topology.vertices[element.index] ? [topology.vertices[element.index].point] : [];
  return [];
}

function boxOf3d(entity) {
  const tris = solidMesh(entity);
  if (!tris.length) return null;
  const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
  for (const tri of tris) for (const p of tri) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
  return hi.map((v, i) => v - lo[i]);
}

/** A sensible datum size: a little over half the model. */
function datumSize() {
  if (view3d.instance?.size) return Math.max(10, Math.round(view3d.instance.size * 0.6));
  const box = D.extents(activeDrawing());
  return box ? Math.max(10, Math.round(Math.max(box.maxX - box.minX, box.maxY - box.minY) * 0.6)) : 50;
}

/** Part_MakeFace: the selected closed outlines (with their holes) as flat faces. */
function makeFaceFromWires() {
  const drawing = activeDrawing();
  const { loops } = collectLoops(selectedEntities().filter((e) => e.type !== 'solid'), drawing);
  const shapes = buildShapes(loops);
  if (!shapes.length) { notify('info', t('part.noClosedOutline')); return; }
  const made = change('part.op.makeFace', (d) => shapes.map((shape) => D.addEntity(d, 'solid', { kind: 'surface', name: t('part.name.face'), params: { mode: SURFACE_MODES.indexOf('fill'), bulge: 0, thickness: 0 }, shape: { outer: shape.outer, holes: shape.holes ?? [] } }).id));
  select(made);
  notify('success', t('part.facesMade', { count: made.length }));
}

/** Part_ProjectionOnSurface: the selected 2D lines projected onto the picked face, along its normal, as 3D wires. */
function projectOnSurface() {
  const face = state.elements.find((el) => el.kind === 'face');
  const tris = elementTriangles(face);
  const n = face.signature.normal;
  const big = 1e5;
  const hitTriangle = (o, d) => {
    let best = Infinity;
    for (const [a, b, c] of tris) {
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
      const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
      if (Math.abs(det) < 1e-12) continue;
      const tv = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
      const u = (tv[0] * p[0] + tv[1] * p[1] + tv[2] * p[2]) / det;
      if (u < -1e-9 || u > 1 + 1e-9) continue;
      const q = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
      const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
      if (v < -1e-9 || u + v > 1 + 1e-9) continue;
      const tt = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
      if (tt > 0 && tt < best) best = tt;
    }
    return best < Infinity ? o.map((x, i) => x + d[i] * best) : null;
  };
  const paths = [];
  for (const entity of selectedEntities().filter((e) => e.type !== 'solid')) {
    for (const prim of primitives(entity)) {
      const pts = prim.kind === 'line' ? [prim.a, prim.b] : prim.kind === 'poly' ? (prim.closed ? [...prim.points, prim.points[0]] : prim.points) : prim.kind === 'circle' ? arcPoints(prim.c.x, prim.c.y, prim.r, 0, 360, 4) : prim.kind === 'arc' ? arcPoints(prim.c.x, prim.c.y, prim.r, prim.start, prim.end, 4) : [];
      // Lines are cut into short steps so they follow the surface.
      const dense = [];
      for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i]; const b = pts[i + 1]; const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2)); for (let k = 0; k < steps; k++) dense.push({ x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps }); }
      if (pts.length) dense.push(pts[pts.length - 1]);
      let current = [];
      for (const p of dense) {
        const hit = hitTriangle([p.x + n[0] * big, p.y + n[1] * big, n[2] * big], n.map((v) => -v));
        if (hit) current.push(hit);
        else if (current.length) { if (current.length >= 2) paths.push(current); current = []; }
      }
      if (current.length >= 2) paths.push(current);
    }
  }
  if (!paths.length) { notify('info', t('part.projectionMissed')); return; }
  const id = change('part.op.project', (d) => D.addEntity(d, 'solid', { kind: 'wire3d', name: t('part.projectionName'), params: {}, shape: { paths } }).id);
  clearElements();
  select([id]);
}

/** Part_ImportCurveNet: the curves of a 2D CAD file (DXF, SVG, IGES …) as 3D wires. */
async function importCurveNetwork() {
  try {
    let name = null; let text = null;
    if (desktop) {
      const [path] = await native.chooseDrawingToOpen(state.settings.lastDirectory, { dxf: true });
      if (!path) return;
      name = baseName(path);
      text = await native.readTextFile(path, 'std');
    } else {
      const [file] = await native.pickDrawingFilesWeb({ dxf: true });
      if (!file?.text) return;
      name = file.name; text = file.text;
    }
    const { drawing } = drawingFromText(name, text);
    const paths = [];
    for (const entity of drawing.entities) {
      for (const prim of primitives(entity)) {
        const pts = prim.kind === 'line' ? [prim.a, prim.b] : prim.kind === 'poly' ? (prim.closed ? [...prim.points, prim.points[0]] : prim.points) : prim.kind === 'circle' ? arcPoints(prim.c.x, prim.c.y, prim.r, 0, 360, 4) : prim.kind === 'arc' ? arcPoints(prim.c.x, prim.c.y, prim.r, prim.start, prim.end, 4) : [];
        if (pts.length >= 2) paths.push(pts.map((p) => [p.x, p.y, 0]));
      }
    }
    if (!paths.length) { notify('info', t('part.curveNetEmpty')); return; }
    const id = change('part.op.curveNet', (d) => D.addEntity(d, 'solid', { kind: 'wire3d', name: `${t('part.curveNetName')} (${name})`, params: {}, shape: { paths } }).id);
    select([id]);
    notify('success', t('part.curveNetMade', { count: paths.length }));
  } catch (error) {
    showError('error.open', error);
  }
}

// ───────────────────────── FreeCAD Std commands, second part (src/commands/std2.js)

/** A name for an entity: its own, or its kind. */
function labelOf(entity) {
  if (entity.name) return entity.name;
  if (entity.type === 'solid') {
    const key = `solid.${entity.kind}`;
    const label = t(key);
    if (label !== key) return label;
    return commands[`arch:${entity.kind}`] ? t(commands[`arch:${entity.kind}`].label) : entity.kind;
  }
  if (entity.type === 'part') return t(`part.${entity.kind}`);
  return t(`entity.${entity.type}`);
}

function iconOf(entity) {
  if (entity.type === 'solid') return SOLID_ICONS[entity.kind] ?? commands[`arch:${entity.kind}`]?.icon ?? 'solidBox';
  if (entity.type === 'part') return PARTS[entity.kind]?.icon ?? 'part';
  return TOOL_ICONS[entity.type] ?? (entity.type === 'dim' ? 'dimension' : 'line');
}

/** What the model tree needs. */
function treeApi() {
  state.tree ??= { collapsed: new Set(), expanded: new Set() };
  state.tree.options = state.settings.tree ?? {};
  return { state, t, icon, escapeHtml, labelOf, iconOf, docName };
}

/** Shows the model tree; `reveal` scrolls to (and unfolds the groups of) those entities. */
function showTree({ reveal = null } = {}) {
  treeApi();
  if (state.settings.collapsedSections.includes('model')) toggleSection('model', true);
  if (reveal?.length) {
    const drawing = activeDrawing();
    for (const id of reveal) {
      let group = drawing?.entities.find((e) => e.id === id)?.group;
      for (let guard = 0; group && guard < 32; guard++) { state.tree.collapsed.delete(`group:${group}`); group = drawing.groups?.find((g) => g.id === group)?.parent; }
      if (!drawing?.entities.find((e) => e.id === id)?.group) state.tree.expanded.add('folder:2d');
    }
  }
  renderLeft();
  if (reveal?.length) requestAnimationFrame(() => root.querySelector(`[data-tree-entity="${CSS.escape(reveal[0])}"]`)?.scrollIntoView({ block: 'nearest' }));
}

/** Which left-panel sections the chosen workbench (Std_Workbench) shows. */
function workbenchShows(id) {
  const sections = WORKBENCHES[state.settings.workbench ?? 'all'];
  return !sections || id === 'model' || id === 'layers' || sections.includes(id);
}

/** A small menu of commands (tree options, edit modes, toolbars…) at the pointer or the button. */
function showCommandMenu(ids, context, titleKey) {
  const anchor = context?.anchor ?? (state.pointer ? { x: state.pointer.x, y: state.pointer.y } : anchorBelow(root.querySelector('[data-menu="view"]')));
  return showMenu(menuItems(ids), anchor, 'context', { header: { icon: 'gear', title: t(titleKey) } });
}

function showMacroMenu(context) {
  const names = (state.settings.recentMacros ?? []).filter((name) => state.settings.macros.some((m) => m.name === name));
  const handlers = Object.fromEntries(names.map((name, i) => [`custom:macro${i}`, () => runMacro(name)]));
  const items = names.map((name, i) => ({ id: `custom:macro${i}`, label: name, icon: 'play' }));
  const anchor = context?.anchor ?? (state.pointer ? { x: state.pointer.x, y: state.pointer.y } : anchorBelow(root.querySelector('[data-menu="tools"]')));
  return showMenu(items, anchor, 'context', { header: { icon: 'recentMacros', title: t('std.recentMacros') }, handlers });
}

/** Std_DockOverlay*: panels float over the drawing (transparent, letting the mouse through). */
function applyOverlay() {
  const o = state.settings.overlay ?? {};
  for (const side of OVERLAY_SIDES) root.classList.toggle(`overlay-${side}`, Boolean(o[side]) && !o.hidden);
  root.classList.toggle('overlay-transparent', Boolean(o.transparent));
  root.classList.toggle('overlay-mouse-through', Boolean(o.mouseTransparent));
  requestAnimationFrame(() => { resizeCanvas(); resize3d(); });
}

/** Std_TreeDrag and dropping in the tree: entities into a group (or out of all groups). */
function moveToGroup(ids, groupId) {
  const drawing = activeDrawing();
  const part = groupId ? drawing.groups?.find((g) => g.id === groupId && g.part) : null;
  const sync = state.settings.tree?.syncPlacement !== false;
  change('std.op.moveToGroup', (d) => {
    for (const id of ids) {
      const entity = D.findEntity(d, id);
      if (!entity) continue;
      const patch = { group: groupId ?? null };
      // Without sync placement an object keeps its own placement, now inside the part's: it moves with the part's offset.
      if (part && !sync) Object.assign(patch, { x: (entity.x ?? 0) + part.placement.x, y: (entity.y ?? 0) + part.placement.y, ...(entity.type === 'solid' ? { z: (entity.z ?? 0) + part.placement.z, rz: (entity.rz ?? 0) + part.placement.rz } : {}) });
      D.updateEntity(d, id, patch);
    }
  });
}

async function readClipboard() {
  try { return await native.clipboardRead(); } catch { /* the web */ }
  try { return await navigator.clipboard.readText(); } catch { return ''; }
}

/** Std_Transform: a move and turn of the selection (solids in 3D, other objects in the plane). */
function transformSelection({ dx = 0, dy = 0, dz = 0, rx = 0, ry = 0, rz = 0, about = 'center' }) {
  const ids = selectedIds();
  change('std.op.transform', (d) => {
    for (const id of ids) {
      const entity = D.findEntity(d, id);
      if (!entity) continue;
      if (entity.type === 'solid') {
        const R = rotationOf({ rx, ry, rz });
        const box = cachedBox(entity);
        const c = about === 'center' && box ? [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, entity.z ?? 0] : [0, 0, 0];
        const rc = [0, 1, 2].map((i) => R[i][0] * c[0] + R[i][1] * c[1] + R[i][2] * c[2]);
        D.updateEntity(d, id, transformPlacement(entity, R, c.map((v, i) => v - rc[i] + [dx, dy, dz][i])));
      } else {
        const box = cachedBox(entity);
        const cx = about === 'center' && box ? (box.minX + box.maxX) / 2 : 0;
        const cy = about === 'center' && box ? (box.minY + box.maxY) / 2 : 0;
        let next = entity;
        if (rz) next = transformEntity(next, { type: 'rotate', cx, cy, angle: rz });
        if (dx || dy) next = transformEntity(next, { type: 'move', dx, dy });
        D.replaceEntity(d, next);
      }
    }
  });
}

function massText(entity) {
  const material = entity.physical;
  if (!material || entity.type !== 'solid') return '—';
  const volume = solidProperties(entity)?.volume ?? 0;
  return `${formatNumber(massOf(volume, material), 3)} kg (${formatNumber(volume / 1000, 2)} cm³ × ${material.density} kg/m³)`;
}

/** Std_TextureMapping: an image file on the selected solids. */
/** An image file the user picks, as a data URL (null when cancelled or too big). */
async function chooseImageData() {
  let data = null;
  try {
    if (desktop) {
      const path = await native.chooseImage(state.settings.lastDirectory);
      if (!path) return null;
      const bytes = await native.readBinaryFile(path, 'std');
      const ext = extensionOf(path).toLowerCase();
      const type = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/png';
      data = `data:${type};base64,${toBase64(bytes)}`;
    } else {
      const [file] = await native.pickWithInput('image/*');
      if (!file) return null;
      data = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(file); });
    }
  } catch (error) {
    showError('error.open', error);
    return null;
  }
  if (!data || data.length > 6_000_000) { notify('error', t('std.textureTooBig')); return null; }
  return data;
}

async function chooseTexture(ids) {
  const data = await chooseImageData();
  if (!data) return;
  const answer = await form({ title: t('std.textureMapping'), icon: 'texture', width: 460, fields: [{ key: 'scale', type: 'number', label: t('std.textureScale'), icon: 'scale', value: 50, min: 1, step: 1, unit: 'mm' }], actions: [{ id: 'remove', label: t('std.textureRemove'), icon: 'trash' }, { id: 'ok', label: t('confirm.ok'), primary: true }] });
  if (!answer) return;
  change('std.op.texture', (d) => { for (const id of ids) D.updateEntity(d, id, { texture: answer.action === 'remove' ? null : { data, scale: answer.values.scale } }); });
  if (!state.view3d) toggle3d(true);
}

/** Std_DlgParameter: every setting, edited as JSON. */
function replaceSettings(raw) {
  const previous = state.settings;
  state.settings = normalizeSettings({ ...raw }, getLanguage());
  if (!state.safeMode) storeSettings(globalThis.localStorage, state.settings);
  applySettings(previous);
}

/** Std_ViewCreate / Std_ViewUndock: the 3D view of this drawing in a window of its own. */
function openViewerWindow({ undock = false } = {}) {
  const doc = activeDoc();
  if (!doc) return;
  if (undock && state.view3d) toggle3d(false);
  popups.open('viewer', { drawing: doc.drawing, name: docName(doc), colors: colors3d(), thickness: state.settings.extrudeHeight, style: state.settings.view3dStyle });
}

/** Keeps an open viewer window up to date. */
function syncViewer() {
  if (!popups.isOpen('viewer')) return;
  const doc = activeDoc();
  if (doc) popups.post('viewer', { type: 'viewer:drawing', drawing: doc.drawing, name: docName(doc) });
}

/** Std_TileWindows / Std_CascadeWindows: the drawing and its 3D view side by side, or one at a time. */
async function setTiled(on) {
  state.tiled = Boolean(on);
  root.classList.toggle('tiled', state.tiled);
  if (state.tiled) {
    await toggle3d(true);
    root.querySelector('#cad-canvas').hidden = false;
  } else if (state.view3d) {
    await toggle3d(false);
  }
  requestAnimationFrame(() => { resizeCanvas(); resize3d(); });
  renderToolbarState();
}

async function startVr() {
  if (!state.view3d) await toggle3d(true);
  try {
    if (!(await view3d.instance.startVr())) notify('info', t('std.vrUnsupported'));
  } catch (error) {
    showError('error.unexpected', error, 'VR');
  }
}

/** Std_PrintPdf: the printed pages (current drawing, the print settings) as a PDF file. */
async function printPdf({ path: given = null } = {}) {
  const doc = activeDoc();
  if (!doc) return;
  let stored = {};
  try { stored = JSON.parse(globalThis.localStorage?.getItem('mycad.print') ?? '{}') ?? {}; } catch { /* defaults */ }
  const options = { ...defaultPrintOptions(), ...stored, range: 'current', layers: null, selectedOnly: false };
  const layout = paginate(selectContent([doc.drawing], 0, options, []), options);
  const labels = { title: t('titleBlock.title'), number: t('titleBlock.number'), scale: t('titleBlock.scale'), material: t('titleBlock.material'), drawnBy: t('titleBlock.drawnBy'), date: t('titleBlock.date'), sheet: t('titleBlock.sheet'), units: t('titleBlock.units'), tile: t('titleBlock.tile') };
  const dpi = 200;
  try {
    const pages = await withProgress('std.progress.pdf', docName(doc), async () => {
      const out = [];
      for (const page of layout.pages) {
        const svg = pageSvg(page, layout, options, { fonts: { family: state.settings.fontFamily || '' }, labels });
        const w = Math.round((layout.size.width / 25.4) * dpi);
        const h = Math.round((layout.size.height / 25.4) * dpi);
        const image = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('page image'));
          img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/ width="[^"]*" height="[^"]*"/, ` width="${w}" height="${h}"`))}`;
        });
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(image, 0, 0, w, h);
        const jpeg = atob(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
        const data = new Uint8Array(jpeg.length);
        for (let i = 0; i < jpeg.length; i++) data[i] = jpeg.charCodeAt(i);
        out.push({ widthMm: layout.size.width, heightMm: layout.size.height, image: { width: w, height: h, data, filter: 'DCTDecode' } });
      }
      return out;
    });
    const bytes = buildPdf(pages, { title: doc.drawing.title, author: doc.drawing.author ?? state.settings.author ?? '' });
    const name = `${safeFileName(stripExtension(docName(doc)))}.pdf`;
    if (desktop) {
      const path = given ?? await native.chooseExportPath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${name}`, 'pdf');
      if (!path) return;
      await native.writeBase64File(path, toBase64(bytes), 'std');
      notify('success', t('std.pdfSaved', { name: baseName(path), pages: pages.length }));
    } else {
      native.downloadBytes(bytes, name, 'application/pdf');
    }
  } catch (error) {
    showError('error.save', error, 'PDF');
  }
}

/** Std_ProjectUtil: a drawing file as readable JSON, and back. */
async function extractDocument() {
  try {
    let text = null; let name = 'drawing.mcad';
    if (desktop) {
      const [path] = await native.chooseDrawingToOpen(state.settings.lastDirectory, {});
      if (!path) return;
      text = await native.readTextFile(path, 'std');
      name = baseName(path);
    } else {
      const [file] = await native.pickDrawingFilesWeb({});
      if (!file?.text) return;
      text = file.text;
      name = file.name;
    }
    const pretty = JSON.stringify(JSON.parse(text), null, 2);
    const target = `${stripExtension(name)}.json`;
    if (desktop) {
      const path = await native.chooseExportPath(`${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${target}`, 'json');
      if (path) await native.writeTextFile(path, pretty, 'std');
    } else native.downloadText(pretty, target, 'application/json');
    notify('success', t('std.docExtracted', { name: target }));
  } catch (error) {
    showError('error.open', error);
  }
}

async function createDocumentFromJson() {
  try {
    let text = null; let name = 'drawing.json';
    if (desktop) {
      const [path] = await native.chooseDrawingToOpen(state.settings.lastDirectory, { json: true });
      if (!path) return;
      text = await native.readTextFile(path, 'std');
      name = baseName(path);
    } else {
      const [file] = await native.pickWithInput('.json,application/json');
      if (!file) return;
      text = await file.text();
      name = file.name;
    }
    openText(`${stripExtension(name)}.mcad`, text);
  } catch (error) {
    showError('error.open', error);
  }
}

/** Std_RestartInSafeMode: the app again with default settings, the stored ones untouched. */
async function restartSafeMode() {
  const choice = await ask({ icon: 'safeMode', title: t('std.restartSafeMode'), message: t('std.safeModeMessage'), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'restart', label: t('std.restartSafeMode'), icon: 'safeMode', primary: true }] });
  if (choice !== 'restart') return;
  if (!(await saveAllBeforeRestart())) return;
  try { globalThis.sessionStorage?.setItem('mycad.safeMode', '1'); } catch { /* none */ }
  location.reload();
}

async function saveAllBeforeRestart() {
  for (const doc of state.docs.filter((d) => d.dirty)) if (!(await closeDoc(doc))) return false;
  return true;
}

/** Leaves safe mode: the stored settings again. */
function leaveSafeMode() {
  try { globalThis.sessionStorage?.removeItem('mycad.safeMode'); } catch { /* none */ }
  location.reload();
}

/** Std_BoxElementSelection: edges of the solid being filleted, inside a dragged box. */
function boxSelectEdges() {
  const v = view3d.instance;
  if (!v || !state.edgePick) return;
  notify('info', t('std.boxElementHint'));
  v.startBoxSelect((rect) => {
    const edges = v.edgesInRect(rect);
    for (const edge of edges) toggleEdge(state.edgePick, edge.key ?? edge);
    notify('info', t('std.boxElementDone', { count: edges.length }));
  });
}

/** Std_ClarifySelection: everything under the pointer, to pick one of them. */
function clarifySelection(context) {
  const drawing = activeDrawing();
  if (!drawing || !state.pointer) return;
  let ids = [];
  if (state.view3d && view3d.instance) {
    const rect = view3d.instance.canvas.getBoundingClientRect();
    ids = view3d.instance.entitiesAt(state.pointer.clientX - rect.left, state.pointer.clientY - rect.top);
  } else if (state.cursor) {
    const tolerance = pickTolerance() * 2;
    ids = D.editable(drawing).filter((entity) => entityDistance(entity, state.cursor) <= tolerance).map((e) => e.id).reverse();
  }
  if (!ids.length) { notify('info', t('std.clarifyNothing')); return; }
  const handlers = Object.fromEntries(ids.map((id, i) => [`custom:pick${i}`, () => select([id])]));
  const items = ids.map((id, i) => { const entity = D.findEntity(drawing, id); return { id: `custom:pick${i}`, label: labelOf(entity), icon: iconOf(entity) }; });
  showMenu(items, context?.anchor ?? { x: state.pointer.x + 2, y: state.pointer.y + 2 }, 'context', { header: { icon: 'clarify', title: t('std.clarifySelection') }, handlers });
}

/** User shortcuts of Std_DlgCustomize ("Ctrl+Shift+K = command"). */
function customShortcut(event) {
  const keys = state.settings.customKeys;
  if (!keys) return null;
  const name = `${event.ctrlKey || event.metaKey ? 'Ctrl+' : ''}${event.shiftKey ? 'Shift+' : ''}${event.altKey ? 'Alt+' : ''}${event.key.length === 1 ? event.key.toUpperCase() : event.key}`;
  const id = Object.entries(keys).find(([key]) => key.toUpperCase() === name.toUpperCase())?.[1];
  return id && commands[id] ? id : null;
}

window.__mycad = {
  state,
  canvasState,
  t,
  commands,
  popups,
  run,
  drawingModule: D,
  actions: {
    openPath, openText, saveDoc, closeDoc, newDrawing, select, change, undo, redo, copySelection, cutSelection, paste, pasteText,
    setTool, submitCommand, zoomBy, setZoomPercent, zoomFit, updateSettings, handleDroppedPaths, handleDroppedFiles,
    setBackgroundFromPath, removeBackground, confirmExit, openRecent, showError, openMenubarMenu, contextMenuFor, activeDoc, activeDrawing,
    toScreen, docName, scrollTabs, withProgress, exportAs, renderPng, openStlDialog, exportStl, openPartDialog, openArrayDialog, explodeSelection, deleteSelection,
    duplicateSelection, setWorkPlane, openCam, openFem, openPlate, openAddons, openFem3d, openSpreadsheet, reverseEngineer, decimateSolids, cutFeature, toggleConstruction, addCustomRebar, scheduleCsv, nestSelection, addRobot, robotMoveTo, robotTrajectory, addJoint, setJoint, setWorkPlaneFace, pickWorkPlaneFace, toggleEdgePick, toggleEdge, setJointDrive, setJointFollow, toggleAnimation, stopAnimation, showAnimationAt, keepAnimationPose, setAnimation, animState: () => ({ ...anim }), constrainSelection, importSheetCsv, saveText, runScript, runMacro, toggleRecording, consoleState, addLayer, toggleLayer, removeLayer, hitEntity, ensureViewport, drawCanvas, openPrint, createEntity,
    toggle3d, rebuild3d, view3d: () => view3d.instance,
    openSolidDialog, insertSolid, solidFeature, dressUp, checkGeometry, repairSolids, archFeature, addOpening, insertSchedule, scheduleLines, addRebar, addCustomWindow, openBimManager, applyBim, addLevel, ensureBim, wallWidth, solidProperties, planOf: (entity) => primitives(entity), applyFeature, featureSource, booleanSelection, sectionSolids, projectSolids,
    openModelBytes, importModelBytes, export3d, exportMesh, selectedSolids, setView3dStyle,
    printPdf, form, setTiled, openViewerWindow, labelOf, activateDoc,
    showHome, openSample, loadSamples, kernelState: () => ({ state: state.kernel, ready: occReady() }), openTutorial, tutorialApi,
  },
};

start()
  .catch((error) => showError('error.unexpected', error, 'start'))
  .finally(() => {
    // The main window starts hidden (no flash of an empty page); show it even if start-up failed.
    if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {});
  });
