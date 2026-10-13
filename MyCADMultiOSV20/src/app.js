// Main window: menu bar, toolbar, drawing tabs, tool panel (left), drawing
// canvas with its command line, properties panel (right) and status bar.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { entitiesFromClipboard, entitiesToClipboard } from './domain/clipboard.js';
import { DrawingDocument } from './domain/document.js';
import * as D from './domain/drawing.js';
import { exportDxf, importDxf, looksLikeDxf } from './domain/dxf.js';
import {
  boxOfEntities, canExplode, createEntity, DIM_KINDS, normalizeEntity, dimText, entityDistance, explode, formatNumber, grips, inBox, LINE_TYPES, LINE_WIDTHS, measure, moveGrip, totalLength,
} from './domain/entities.js';
import { evaluate } from './domain/expr.js';
import { startPageHtml } from './view/startpage.js';
import appIconUrl from '../assets/icon-256.png';
import { importDrawingBytes, isCadDrawingFileName } from './domain/import2d.js';
import { exportHpgl } from './domain/formats2d.js';
import { exportIges } from './domain/iges.js';
import { exportDxf2000 } from './domain/dxf2000.js';
import { displayUnit, evaluateLength, formatArea, formatLength, formatVolume, gridBaseFor, lengthValue, setDisplayUnit, toUnit, unitFactor, unitLabel, unitStep } from './domain/units.js';
import {
  baseName, directoryOf, extensionOf, FormatError, isDrawingFileName, isDxfFileName, isImageFileName, isModelFileName, isTextFileName, parseFile, safeFileName, serialize, stripExtension, withExtension,
} from './domain/format.js';
import { boxCenter, boxHeight, boxWidth, dist, normalizeBox, polygonArea } from './domain/geometry.js';
import { booleanOf } from './domain/csg.js';
import { exportMesh, importMesh, setBooleanImplementation } from './domain/exchange3d.js';
import { featureFrom, meshBox, normalizeSolidData, shadedView, SOLID_ICONS, SOLID_KINDS, SOLIDS, solidMesh } from './domain/solids.js';
import { drawingViews, sectionOutlines, VIEW_NAMES } from './domain/views.js';
import { CATEGORY_ICONS, categoryOf, optionIsWord, PART_CATEGORIES, PART_KINDS, PARTS, partInfo } from './domain/parts.js';
import './view/partIcons.js';
import { addRecent, loadRecent, storeRecent } from './domain/recent.js';
import { applyOrtho, findSnap, snapToGrid } from './domain/snap.js';
import { exportSvg } from './domain/svg.js';
import { buildShapes, collectLoops, prepareStl, toAsciiStl, toBase64, toBinaryStl } from './domain/stl.js';
import { HATCH_PATTERN_NAMES } from './domain/hatch.js';
import { loadSettings, RECENT_KEY, SESSION_KEY, SNAP_MODES, STORAGE_KEY, storeSettings, ZOOM } from './domain/settings.js';
import { switchFlag } from './flags.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { PopupHost } from './platform/popups.js';
import { applyFont, applyTheme, drawingFontStack, mix, nextThemeId, resolveTheme, themeName } from './themes.js';
import { cachedBox, PX_PER_MM, render, RULER, Viewport } from './view/renderer.js';
import { createTool, DIM_TOOLS, DRAW_TOOLS, MODIFY_TOOLS, NEEDS_SELECTION, readout, TOOL_ICONS, TOOL_KEYS } from './view/tools.js';

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
/** "V1.0": how the version is shown (title bar, About, start page). */
const displayVersion = (version) => (version ? `V${String(version).split('.').slice(0, 2).join('.')}` : '');
// 3D solid commands (FreeCAD Part workbench).
const FEATURE_KINDS = ['pad', 'revolution', 'loft', 'sweep'];
const BOOL_OPS = ['union', 'cut', 'common'];
const BOOL_ICONS = { union: 'solidUnion', cut: 'solidCut', common: 'solidCommon' };
const EXPORT_3D = ['3mf', 'amf', 'obj', 'ply', 'off', 'step', 'fcstd'];

const state = {
  settings: loadSettings(globalThis.localStorage),
  recent: loadRecent(globalThis.localStorage),
  docs: [],
  active: null,
  selection: new Set(),
  tool: null,
  toolId: 'select',
  toolOptions: { sides: 6, offset: 5, mirrorKeep: true, hatchPattern: 'ansi31', hatchScale: 1, hatchAngle: 0 },
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
    cancelTool();
    state.selection = new Set();
  }
  state.active = id;
}

function activateDoc(id) {
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
  const result = doc.apply(t(labelKey), mutate);
  pruneSelection();
  afterChange();
  return result;
}

function afterChange() {
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
  background: { icon: 'image', label: 'action.background', run: () => chooseBackground() },
  clearBackground: { icon: 'clear', label: 'action.clearBackground', enabled: () => Boolean(state.settings.backgroundImage), run: () => removeBackground() },
  nextTab: { icon: 'chevronRight', label: 'action.nextTab', key: 'Ctrl+Tab', enabled: () => state.docs.length > 1, run: () => cycleTab(1) },
  prevTab: { icon: 'chevronLeft', label: 'action.prevTab', key: 'Ctrl+Shift+Tab', enabled: () => state.docs.length > 1, run: () => cycleTab(-1) },
  renameDrawing: { icon: 'edit', label: 'action.renameDrawing', key: 'F2', enabled: hasDoc, run: () => { select([]); focusProperty('title'); } },
  ...Object.fromEntries(SOLID_KINDS.map((kind) => [`solid:${kind}`, { icon: SOLID_ICONS[kind], label: `solid.${kind}`, enabled: hasDoc, run: () => openSolidDialog({ kind }) }])),
  ...Object.fromEntries(FEATURE_KINDS.map((kind) => [`solid:${kind}`, { icon: SOLID_ICONS[kind], label: `feature.${kind}`, enabled: () => canFeature(kind), run: () => solidFeature(kind) }])),
  ...Object.fromEntries(BOOL_OPS.map((op) => [`bool:${op}`, { icon: BOOL_ICONS[op], label: `bool.${op}`, enabled: () => selectedSolids().length >= 2, run: () => booleanSelection(op) }])),
  solidSection: { icon: 'solidSection', label: 'action.section', enabled: () => selectedSolids(true).length > 0, run: () => sectionSolids() },
  solidProject: { icon: 'solidProject', label: 'action.project', enabled: () => selectedSolids(true).length > 0, run: () => projectSolids() },
  editSolid: { icon: 'solidEdit', label: 'action.editSolid', enabled: () => selectedEntities().length === 1 && selectedEntities()[0].type === 'solid', run: () => openSolidDialog({ entity: selectedEntities()[0] }) },
  import3d: { icon: 'solidImport', label: 'action.import3d', key: 'Ctrl+I', run: () => import3dWithDialog() },
  export3dMenu: { icon: 'solidExport', label: 'action.export3dMenu', enabled: hasDoc, run: (context) => openExport3dMenu(context?.anchor) },
  ...Object.fromEntries(EXPORT_3D.map((format) => [`export3d:${format}`, { icon: format === 'fcstd' ? 'freecad' : 'solidExport', label: `export3d.${format}`, enabled: hasDoc, run: () => export3d(format) }])),
  extrude2d: { icon: 'solidExtrude', label: 'action.extrude2d', checked: () => state.settings.extrude2d, run: () => updateSettings({ extrude2d: !state.settings.extrude2d }) },
  toolbarRows: { icon: 'toolbarRows', label: 'action.toolbarRows', checked: () => state.settings.toolbarRows === 2, run: () => updateSettings({ toolbarRows: state.settings.toolbarRows === 2 ? 1 : 2 }) },
  solidMenu: { icon: 'solidBox', label: 'action.solidMenu', run: (context) => showMenu(menuItems(MENUS.solid), context?.anchor ?? anchorBelow(root.querySelector('[data-command="solidMenu"]')), 'solid', { header: { icon: 'solidBox', title: t('menu.solid') } }) },
  light: { icon: 'light', label: 'action.light', key: 'Ctrl+Shift+G', checked: () => state.settings.light.on, run: () => setLightOptions({ on: !state.settings.light.on }) },
  lightProperties: { icon: 'light', label: 'action.lightProperties', run: () => selectLight() },
  startPage: { icon: 'home', label: 'action.startPage', run: () => showHome(true) },
  tutorial: { icon: 'tutorial', label: 'action.tutorial', run: () => openTutorial() },
  tutorialDoc: { icon: 'book', label: 'action.tutorialDoc', run: () => openTutorialDoc() },
  freecadCoverage: { icon: 'checklist', label: 'action.freecadCoverage', run: () => popups.open('coverage', { tab: 'part' }) },
  ...Object.fromEntries([...DRAW_TOOLS, ...DIM_TOOLS, ...MODIFY_TOOLS].map((id) => [`tool:${id}`, toolCommand(id)])),
  ...Object.fromEntries(PART_KINDS.map((kind) => [`part:${kind}`, { icon: PARTS[kind].icon, label: `part.${kind}`, enabled: hasDoc, run: () => openPartDialog({ kind }) }])),
  ...Object.fromEntries(Object.keys(PART_CATEGORIES).map((category) => [`partCategory:${category}`, { icon: CATEGORY_ICONS[category], label: `cat.${category}`, enabled: hasDoc, run: () => openPartDialog({ category }) }])),
};

function commandEnabled(id) {
  const command = commands[id];
  return Boolean(command) && (!command.enabled || command.enabled());
}

function commandTip(id) {
  const command = commands[id];
  let label = t(command.label).replace(/…$/, '');
  if (id === 'undo' && activeDoc()?.history.canUndo) label = t('tip.undoWith', { label: activeDoc().history.undoLabel });
  if (id === 'redo' && activeDoc()?.history.canRedo) label = t('tip.redoWith', { label: activeDoc().history.redoLabel });
  if (id === 'language') label = t('tip.language');
  if (id === 'theme') label = t('tip.themeNext', { current: themeName(state.settings.theme, getLanguage()), next: themeName(nextThemeId(state.settings.theme), getLanguage()) });
  return command.key ? t('tip.withKey', { label, key: keyLabel(command.key) }) : label;
}

async function run(id, context) {
  const command = commands[id];
  if (!command || !commandEnabled(id)) return;
  try {
    await command.run(context);
  } catch (error) {
    showError('error.unexpected', error, t(command.label));
  }
}

// ───────────────────────── layout

const MENUS = {
  file: ['new', 'open', 'recent', '-', 'save', 'saveAs', 'saveAll', '-', 'importDxf', 'import3d', '-', 'exportDxf', 'exportDxf2000', 'exportSvg', 'exportIges', 'exportHpgl', 'exportPng', 'export3dMenu', '-', 'print', '-', 'closeTab', 'closeOthers', '-', 'exit'],
  edit: ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'duplicate', 'delete', '-', 'selectAll', 'clearSelection', '-', 'explode', 'bringFront', 'sendBack', '-', 'properties'],
  view: ['startPage', '-', 'view3d', 'extrude2d', '-', 'zoomIn', 'zoomOut', 'zoom100', 'zoomFit', '-', 'grid', 'rulers', 'scaleBar', 'snap', 'snapGrid', 'ortho', 'lineWeights', 'crosshair', '-', 'leftPanel', 'rightPanel', 'statusBar', 'toolbarRows', '-', 'theme', 'themeMenu', 'language', '-', 'background', 'clearBackground'],
  draw: [...DRAW_TOOLS.filter((id) => id !== 'select' && id !== 'pan').map((id) => `tool:${id}`), '-', ...DIM_TOOLS.map((id) => `tool:${id}`)],
  modify: ['tool:select', 'tool:pan', '-', ...MODIFY_TOOLS.map((id) => `tool:${id}`), '-', 'array', 'explode', 'editPart', '-', 'addLayer', 'renameDrawing'],
  parts: Object.keys(PART_CATEGORIES).map((category) => `partCategory:${category}`),
  solid: [...SOLID_KINDS.map((kind) => `solid:${kind}`), '-', ...FEATURE_KINDS.map((kind) => `solid:${kind}`), '-', ...BOOL_OPS.map((op) => `bool:${op}`), '-', 'solidSection', 'solidProject', 'editSolid', '-', 'import3d', 'export3dMenu'],
  help: ['tutorial', 'tutorialDoc', 'startPage', '-', 'freecadCoverage', '-', 'shortcuts', 'settings', '-', 'about'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', view: 'eye', draw: 'line', modify: 'move', parts: 'part', solid: 'solidBox', help: 'info' };

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
  ['view3d', 'extrude2d'],
  SOLID_KINDS.map((kind) => `solid:${kind}`),
  FEATURE_KINDS.map((kind) => `solid:${kind}`),
  BOOL_OPS.map((op) => `bool:${op}`),
  ['solidSection', 'solidProject', 'editSolid'],
];
const TOOLBAR_PANELS = ['leftPanel', 'rightPanel', 'toolbarRows'];

/**
 * Toolbar rows. One row: the standard tools with the 3D solids in a dropdown
 * ("3D ▾"), so the window can stay narrow. Two rows (toolbar button): the
 * full Part toolbar gets the second row.
 */
function toolbarRows(rows = 1) {
  if (rows === 2) return [[...TOOLBAR_MAIN, TOOLBAR_PANELS], TOOLBAR_PART];
  return [[...TOOLBAR_MAIN, ['view3d', 'solidSplit'], TOOLBAR_PANELS]];
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
          <div class="drop-overlay" aria-hidden="true"><div>${icon('drop')}<span></span></div></div>
        </div>
        <div class="command-bar">
          <span class="command-prompt" id="command-prompt"></span>
          <label class="command-box" title="${escapeHtml(t('tip.command'))}">${icon('coordinate')}<input id="command-input" type="text" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(t('command.placeholder'))}" aria-label="${escapeHtml(t('tip.command'))}" title="${escapeHtml(t('tip.command'))}" /></label>
          <span class="command-live" id="command-live"></span>
        </div>
      </section>
      <aside id="right-panel" class="side-panel"></aside>
    </main>
    <footer id="statusbar" role="status"></footer>
    ${desktop ? `<div class="resize-grip" data-resize-grip title="${escapeHtml(t('tip.resize'))}" aria-label="${escapeHtml(t('tip.resize'))}" role="separator">${icon('grip')}</div>` : ''}`;
}

function renderMenubar() {
  const menubar = root.querySelector('#menubar');
  // The house: back to the start page from anywhere (lit while it is shown).
  const home = `<button class="menubar-home ${state.home ? 'active' : ''}" data-command="startPage" title="${escapeHtml(t('action.startPage'))}" aria-label="${escapeHtml(t('action.startPage'))}" aria-pressed="${state.home}">${icon('home')}</button><span class="menubar-sep" aria-hidden="true"></span>`;
  menubar.innerHTML = home + Object.keys(MENUS).map((name) => `
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
    <div class="toolbar-left rows-${state.settings.toolbarRows}">${toolbarRows(state.settings.toolbarRows).map((row) => `<div class="toolbar-row">${row.map((group) => `<div class="tool-group">${group.map(button).join('')}</div>`).join('<span class="tool-sep" aria-hidden="true"></span>')}</div>`).join('')}</div>
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
      ${LEFT_SECTIONS.map((section) => leftSection(section, drawing)).join('')}
    </div>`;
}

/** The left panel's sections, by kind of work. Each folds and unfolds; the state is remembered. */
const LEFT_SECTIONS = [
  { id: 'draw', glyph: 'line', title: 'panel.draw' },
  { id: 'dims', glyph: 'dimension', title: 'panel.dimensions' },
  { id: 'modify', glyph: 'move', title: 'panel.modify' },
  { id: 'solids', glyph: 'solidBox', title: 'panel.solidShapes' },
  { id: 'solidOps', glyph: 'solidCut', title: 'panel.solidOps' },
  { id: 'parts', glyph: 'part', title: 'panel.parts' },
  { id: 'layers', glyph: 'layers', title: 'panel.layers' },
];

const commandTiles = (ids) => ids.map((id) => tile(id, commands[id].icon, t(commands[id].label), commandTip(id), `data-command="${id}" ${commandEnabled(id) ? '' : 'disabled'}`)).join('');

function leftSectionBody(id, drawing) {
  switch (id) {
    case 'draw': return `<div class="tool-grid">${DRAW_TOOLS.map(toolTile).join('')}</div>`;
    case 'dims': return `<div class="tool-grid">${DIM_TOOLS.map(toolTile).join('')}</div>`;
    case 'modify': return `<div class="tool-grid">${MODIFY_TOOLS.map(toolTile).join('')}${commandTiles(['array', 'explode'])}</div>${toolOptionsHtml()}`;
    case 'solids': return `<div class="tool-grid solids-grid">${commandTiles(SOLID_KINDS.map((kind) => `solid:${kind}`))}</div>`;
    case 'solidOps': return `<div class="tool-grid solids-grid">${commandTiles([...FEATURE_KINDS.map((kind) => `solid:${kind}`), ...BOOL_OPS.map((op) => `bool:${op}`), 'solidSection', 'solidProject', 'editSolid', 'import3d'])}</div><p class="panel-hint">${t('solid.panelHint')}</p>`;
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
    <button class="tool-button ${on('wireframe')}" data-view3d="wireframe" title="${escapeHtml(t('view3d.wireframe'))}" aria-pressed="${Boolean(v?.options.wireframe)}">${icon('polygon')}</button>
    <button class="tool-button ${on('axes')}" data-view3d="axes" title="${escapeHtml(t('view3d.axes'))}" aria-pressed="${Boolean(v?.options.axes)}">${icon('axes')}</button>
    <button class="tool-button ${light.on ? 'active' : ''}" data-view3d="light" title="${escapeHtml(t(light.on ? 'view3d.lightOff' : 'view3d.lightOn'))}" aria-pressed="${light.on}">${icon(light.on ? 'light' : 'lightOff')}</button>
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
  container.querySelectorAll('.view3d-bar, .view3d-status').forEach((element) => element.remove());
  container.insertAdjacentHTML('beforeend', view3dBar());
}

async function toggle3d(on = !state.view3d) {
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
        // Clicking a solid in 3D selects it (Shift/Ctrl adds), so its properties show on the right.
        onPick: (id, event) => {
          state.lightSelected = false;
          if (!id) { if (!event.shiftKey && !event.ctrlKey) select([]); else renderRight(); return; }
          select([id], { toggle: event.shiftKey || event.ctrlKey });
        },
      });
      view3d.instance.setLight(state.settings.light);
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
  view3d.instance.resize(rect.width, rect.height);
}

function rebuild3d() {
  const doc = activeDoc();
  if (!state.view3d || !view3d.instance || !doc) return null;
  view3d.info = view3d.instance.update(doc.drawing, { thickness: state.settings.extrudeHeight, colors: colors3d(), extrude2d: state.settings.extrude2d, selected: state.selection, axisLabelScale: state.settings.axisLabelSize / 100 });
  renderView3dBar();
  return view3d.info;
}

function schedule3d() {
  if (!state.view3d || view3d.frame) return;
  view3d.frame = requestAnimationFrame(() => { view3d.frame = 0; rebuild3d(); });
}

function on3dBar(action) {
  const v = view3d.instance;
  if (!v) return;
  if (action === 'close') { state.lightSelected = false; toggle3d(false); renderRight(); return; }
  if (action === 'extrude2d') { updateSettings({ extrude2d: !state.settings.extrude2d }); rebuild3d(); return; }
  if (action === 'fit') v.fit();
  else if (action.startsWith('view:')) v.view(action.slice(5));
  else if (action === 'light') { setLightOptions({ on: !v.light.on }); return; }
  else v.setOption(action, !v.options[action]);
  renderView3dBar();
}

// ───────────────────────── the light (sun) of the 3D view

let lightSaveTimer = 0;
/** Keeps the light in the settings (saved a moment after the last change, without redrawing everything). */
function rememberLight(light) {
  state.settings.light = { on: light.on, azimuth: light.azimuth, elevation: light.elevation, intensity: light.intensity, color: light.color, shadows: light.shadows };
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
  if (on && state.tool) cancelTool();
  state.home = on;
  if (on) loadSamples();
  renderAll();
}

/** The sample list (samples/index.json), loaded once. */
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
  const key = JSON.stringify([getLanguage(), state.recent.map((item) => `${item.path}|${item.at}`), state.samples?.length ?? null, state.samplesError, state.info?.version]);
  if (scroll.dataset.key === key) return;
  scroll.dataset.key = key;
  scroll.innerHTML = startPageHtml({ t, language: getLanguage(), appIcon: appIconUrl, version: displayVersion(state.info?.version), recent: state.recent, samples: state.samples, error: state.samplesError });
  paintThumbs();
}

/**
 * The start page's background: two meshing spur gears (z 24 and z 16, module 3,
 * on their shafts) that turn at the right ratio while the view orbits slowly.
 */
function gearPairMeshes() {
  const module = 3;
  const gear = (teeth, bore, angle) => {
    const part = normalizeEntity({ type: 'part', kind: 'gear', x: 0, y: 0, angle, params: { module, teeth, bore, keyway: true, pitchCircle: false } });
    const shapes = buildShapes(collectLoops([part]).loops).map(({ outer, holes }) => ({ outer, holes }));
    return solidMesh(normalizeEntity({ type: 'solid', ...featureFrom('pad', { shapes }, { height: 14 }) }));
  };
  const shaft = (radius) => solidMesh(normalizeEntity({ type: 'solid', kind: 'cylinder', params: { radius, height: 44 }, x: 0, y: 0, z: -15 }));
  const [z1, z2] = [24, 16];
  const distance = (module * (z1 + z2)) / 2;
  const speed = 0.32; // rad/s of the large gear; the small one turns z1/z2 times as fast the other way
  return [
    { tris: gear(z1, 16, 0), color: '#e8a53a', pivot: { x: 0, y: 0 }, rate: speed },
    { tris: shaft(7.6), color: '#9aa4b1', pivot: { x: 0, y: 0 }, rate: speed },
    // Half a tooth turned: a gap of the small gear faces a tooth of the large one.
    { tris: gear(z2, 12, 180 / z2), color: '#3a6cf0', pivot: { x: distance, y: 0 }, rate: (-speed * z1) / z2 },
    { tris: shaft(5.6), color: '#9aa4b1', pivot: { x: distance, y: 0 }, rate: (-speed * z1) / z2 },
  ];
}

let startBackground = null;
let backgroundLoading = null;
function showStartBackground(host) {
  const colors = { background: getComputedStyle(root).getPropertyValue('--canvas').trim() || '#f4f6fb' };
  if (startBackground) {
    startBackground.setColors(colors);
    if (startBackground.radius) { startBackground.wanted = true; startBackground.start(); }
    return;
  }
  if (backgroundLoading) return;
  backgroundLoading = (async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const { StartBackground } = await import('./view/startbg.js');
    startBackground = new StartBackground(host);
    await startBackground.show(gearPairMeshes(), colors);
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

/** The tutorial document (doc/Tutorial.html with its pictures), in the browser. */
async function openTutorialDoc() {
  try {
    if (desktop) await native.invoke('open_document', { name: getLanguage() === 'en' ? 'Tutorial.en.html' : 'Tutorial.html' });
    else window.open(`doc/${getLanguage() === 'en' ? 'Tutorial.en.html' : 'Tutorial.html'}`, '_blank', 'noopener');
  } catch (error) {
    showError('error.open', error, 'doc/Tutorial.html');
  }
}

/** What the tutorial player may use: the real interface, plus a few direct actions for dialogs. */
function tutorialApi() {
  const canvas = () => root.querySelector('#cad-canvas');
  return {
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
  return state.cursor ? `X ${lengthValue(state.cursor.x)}   Y ${lengthValue(state.cursor.y)}` : 'X —   Y —';
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
  const rect = area.getBoundingClientRect();
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
  if (useSnap && s.snapObject) snap = findSnap(D.editable(doc.drawing), raw, 10 / doc.vp.zoom, s.snapModes, { exclude });
  let p = snap ? { x: snap.x, y: snap.y } : raw;
  if (!snap && s.snapGrid) {
    p = snapToGrid(raw, gridBaseFor(doc.drawing.grid?.size || s.gridSize));
    snap = { kind: 'grid', ...p };
  }
  if (!snap && base && s.ortho) p = applyOrtho(base, p);
  else if (snap?.kind === 'grid' && base && s.ortho) p = applyOrtho(base, p);
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
  const show = (key, value) => (key === 'area' || key === 'surface' ? formatArea(value) : key === 'volume' ? formatVolume(value) : ['angle', 'sweep'].includes(key) ? `${fmt(value, 3)}°` : ['vertices', 'triangles', 'loops', 'count'].includes(key) ? fmt(value, 3) : formatLength(value));
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
      ? `${entity.type === 'leader' ? `<label class="prop-block" title="${escapeHtml(t('prop.text'))}"><span class="prop-label">${icon('text')}${t('prop.text')}</span><textarea data-prop="text" rows="2" title="${escapeHtml(t('prop.text'))}">${escapeHtml(entity.text)}</textarea></label>`
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
      ${fields}${extra}
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
  if (target.dataset.solidParam) {
    const entity = D.findEntity(drawing, ids[0]);
    if (!entity || entity.type !== 'solid') return;
    const value = number(target.value);
    if (value === null) return;
    change('op.editSolid', (d) => D.updateEntity(d, entity.id, { params: { ...entity.params, [target.dataset.solidParam]: value } }));
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
  if (target.dataset.drawingNum) {
    const value = number(target.value);
    if (value === null || value <= 0) return;
    change('op.editDrawing', (d) => { d.grid.size = Math.min(1000, value); });
  }
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
    <span class="status-toggles">${toggle('snap', t('status.snap'))}${toggle('grid', t('status.grid'))}${toggle('snapGrid', t('status.snapGrid'))}${toggle('ortho', t('status.ortho'))}</span>
    ${vp ? item('zoomIn', t('status.zoom', { value: formatNumber(vp.percent, vp.percent < 10 ? 1 : 0) }), t('status.zoomTip'), '', 'status-zoom') : ''}
    ${doc ? item('undo', t('status.history', { undo: doc.history.undoStack.length, redo: doc.history.redoStack.length })) : ''}
    ${item('palette', `${themeName(state.settings.theme, getLanguage())} · ${t('status.language')}`, `${t('status.theme', { name: themeName(state.settings.theme, getLanguage()) })} · ${t('status.language')}`)}
    ${item(desktop ? 'drawing' : 'globe', `${desktop ? t('status.desktop') : t('status.web')} · ${state.docs.length}`, `${desktop ? t('status.desktop') : t('status.web')} · ${t('status.drawings', { count: state.docs.length })}`)}
    <span class="status-notice ${notice?.kind ?? ''}" title="${escapeHtml(notice?.text ?? t('status.ready'))}">${icon(notice?.kind === 'error' ? 'error' : notice?.kind === 'success' ? 'check' : 'info')}<span>${escapeHtml(notice?.text ?? t('status.ready'))}</span></span>
    ${state.settings.statusClock ? `<span class="status-item clock" title="${escapeHtml(new Date().toLocaleString())}">${icon('recent')}<span id="status-clock">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span>` : ''}`;
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
  storeSettings(globalThis.localStorage, state.settings);
  applySettings(previous);
}

/** Applies settings after a change (from this window or from the settings popup). */
function applySettings(previous = {}) {
  const s = state.settings;
  const theme = resolveTheme(s.theme, prefersDark(), s.customTheme);
  applyTheme(theme);
  applyFont(s);
  native.setWindowTheme(theme.dark);
  if (s.language !== getLanguage()) {
    setLanguage(s.language);
    native.setBackendLanguage(s.language);
    if (previous.language) notify('info', t('notice.language'));
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
  const text = serialize(doc.drawing);
  try {
    if (desktop) {
      let path = doc.path;
      if (!path || saveAs || doc.format !== 'mcad') {
        const suggested = `${state.settings.lastDirectory ? `${state.settings.lastDirectory}/` : ''}${safeFileName(stripExtension(docName(doc)))}.mcad`;
        path = await native.chooseDrawingToSave(suggested);
        if (!path) return false;
        path = withExtension(path);
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
  render(ctx, { drawing, vp, colors, settings: { ...state.settings, showGrid: false, crosshair: false, showLineWeights: true }, selection: new Set(), dpr: 1 });
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
  showMenu(menuItems(['exportDxf', 'exportDxf2000', 'exportSvg', 'exportIges', 'exportHpgl', 'exportPng', '-', 'exportStl', ...EXPORT_3D.map((format) => `export3d:${format}`), '-', 'print']), anchor ?? anchorBelow(element), 'export', { header: { icon: 'export', title: t('action.exportMenu') } });
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
  return drawing ? drawing.entities.filter((entity) => entity.type === 'solid' && D.isVisible(drawing, entity)) : [];
}

const outlineSelection = () => selectedEntities().filter((entity) => !['solid', 'text', 'dim'].includes(entity.type));
const canFeature = (kind) => hasDoc() && outlineSelection().length >= (kind === 'loft' ? 2 : 1);

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
  if (kind === 'pad') {
    const shapes = buildShapes(collectLoops(entities, drawing).loops).map(({ outer, holes }) => ({ outer, holes }));
    return shapes.length ? { source: { shapes }, ids, count: entities.length } : null;
  }
  if (kind === 'revolution') {
    const [loop] = byArea(collectLoops(entities, drawing).loops);
    return loop ? { source: { loop }, ids, count: entities.length } : null;
  }
  if (kind === 'loft') {
    // Bottom and top in the order they were selected.
    const loops = entities.map((entity) => byArea(collectLoops([entity], drawing).loops)[0]).filter(Boolean);
    return loops.length >= 2 ? { source: { bottom: loops[0], top: loops[1] }, ids, count: entities.length } : null;
  }
  if (kind === 'sweep') {
    const { loops, open } = collectLoops(entities, drawing);
    const path = open.sort((a, b) => b.length - a.length)[0] ?? (loops[0] ? [...loops[0], loops[0][0]] : null);
    return path && path.length >= 2 ? { source: { path }, ids, count: entities.length } : null;
  }
  return null;
}

async function solidFeature(kind) {
  const found = featureSource(kind);
  if (!found) { notify('info', t(`notice.feature.${kind}`)); return null; }
  const defaults = { pad: { height: state.settings.extrudeHeight }, loft: { height: state.settings.extrudeHeight * 2 }, revolution: { angle: 360 }, sweep: { radius: 2 } }[kind];
  const result = await popups.open('solid', { mode: 'feature', kind, source: found.source, count: found.count, params: defaults });
  if (result?.action !== 'feature') return null;
  return applyFeature(kind, found, result.params, result.axis);
}

/** Replaces the outlines by the solid made from them (one undo step). */
function applyFeature(kind, found, params, axis = 'yAxis') {
  const raw = featureFrom(kind, found.source, params, { axis });
  const added = change('op.feature', (drawing) => {
    const layer = D.findEntity(drawing, found.ids[0])?.layer;
    D.removeEntities(drawing, found.ids);
    return D.addEntity(drawing, 'solid', { ...raw, name: t(`feature.${kind}`), ...(layer ? { layer } : {}) });
  });
  if (added) {
    select([added.id]);
    notify('success', t('notice.solidAdded', { name: t(`feature.${kind}`) }));
  }
  return added;
}

/** Insert a primitive (kind) or edit a solid (entity). */
async function openSolidDialog({ kind = null, entity = null } = {}) {
  if (!activeDoc()) return null;
  const c = viewCenter();
  const heavy = entity?.kind === 'mesh' && (entity.shape?.tris?.length ?? 0) > 200000;
  const result = await popups.open('solid', entity
    ? { mode: 'edit', kind: entity.kind, params: entity.params, x: entity.x, y: entity.y, z: entity.z, rx: entity.rx, ry: entity.ry, rz: entity.rz, shape: heavy ? null : entity.shape }
    : { mode: 'insert', kind: kind ?? 'box', x: c.x, y: c.y, z: 0 });
  if (!result) return null;
  const place = { x: result.x, y: result.y, z: result.z, rx: result.rx, ry: result.ry, rz: result.rz };
  if (result.action === 'apply' && entity && D.findEntity(activeDrawing(), entity.id)) {
    change('op.editSolid', (drawing) => D.updateEntity(drawing, entity.id, { kind: result.kind, params: result.params, ...place }));
    select([entity.id]);
    return D.findEntity(activeDrawing(), entity.id);
  }
  if (result.action === 'insert') return insertSolid(result.kind, result.params, place);
  return null;
}

function insertSolid(kind, params, place = {}) {
  const added = change('op.addSolid', (drawing) => D.addEntity(drawing, 'solid', { kind, name: t(`solid.${kind}`), params, ...place }));
  if (added) {
    select([added.id]);
    notify('success', t('notice.solidAdded', { name: t(`solid.${kind}`) }));
  }
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
  const { entities, warnings } = importMesh(extensionOf(name), bytes);
  const drawing = D.createDrawing({ title: stripExtension(baseName(name)) || '3D', language: getLanguage(), author: state.settings.author ?? '' });
  D.insertEntities(drawing, entities);
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

const MODEL_MIME = { obj: 'model/obj', ply: 'application/octet-stream', off: 'application/octet-stream', amf: 'application/x-amf', '3mf': 'model/3mf', step: 'model/step', fcstd: 'application/zip' };

/** Writes the drawing's solids (and, for FCStd, its 2D sketch) in a 3D format. */
async function export3d(format) {
  const doc = activeDoc();
  if (!doc) return null;
  const drawing = doc.drawing;
  const entities = drawing.entities.filter((entity) => D.isVisible(drawing, entity));
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

function solidRows(entity) {
  const tree = entity.kind === 'boolean'
    ? `${readField(t('prop.operation'), t(`bool.${entity.shape.op}`), BOOL_ICONS[entity.shape.op])}${readField(t('solid.parts'), entity.shape.parts.map((part) => part.name || t(`solid.${part.kind}`)).join(', '), 'list')}`
    : '';
  const rows = tree + SOLIDS[entity.kind].params.map((param) => numField(param.key, entity.params[param.key], t(`solidParam.${param.key}`), param.unit === '°' ? '°' : param.unit ? 'mm' : '', 'data-solid-param')).join('');
  return `<label class="prop-row" title="${escapeHtml(t('prop.name'))}"><span class="prop-label">${icon('edit')}${t('prop.name')}</span><input data-prop="name" value="${escapeHtml(entity.name)}" title="${escapeHtml(t('prop.name'))}" /></label>${rows}`;
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
  return ids.map((id) => (id === '-' ? { separator: true } : {
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
        ...menuItems(['properties', ...(hit.type === 'part' ? ['editPart'] : []), '-', 'cut', 'copy', 'paste', 'duplicate', 'delete', '-', 'tool:move', 'tool:copy', 'tool:rotate', 'tool:mirror', 'tool:scale', 'array', 'explode', '-', 'bringFront', 'sendBack', '-']),
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

function bindEvents() {
  root.addEventListener('click', (event) => {
    if (suppressClick) return undefined;
    const target = event.target;
    const menu = target.closest('[data-menu]');
    if (menu) {
      const name = menu.dataset.menu;
      if (state.lastMenuClose.name === name && Date.now() - state.lastMenuClose.at < 300) return undefined;
      return openMenubarMenu(name);
    }
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
    const toolButton = target.closest('[data-tool]');
    if (toolButton && !toolButton.disabled) return setTool(toolButton.dataset.tool);
    const partCategory = target.closest('[data-part-category]');
    if (partCategory) { state.partCategory = partCategory.dataset.partCategory; return renderLeft(); }
    const part = target.closest('[data-part]');
    if (part && !part.disabled) return openPartDialog({ kind: part.dataset.part });
    const visible = target.closest('[data-layer-visible]');
    if (visible) return toggleLayer(visible.dataset.layerVisible, 'visible');
    const lock = target.closest('[data-layer-lock]');
    if (lock) return toggleLayer(lock.dataset.layerLock, 'locked');
    const activateLayer = target.closest('[data-layer-activate]');
    if (activateLayer) return change('op.layer', (drawing) => { drawing.activeLayer = activateLayer.dataset.layerActivate; });
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

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target.id === 'zoom-value') {
      setZoomPercent(parseFloat(target.value) || 100);
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
  ['d', false, 'duplicate'], ['a', false, 'selectAll'], ['p', false, 'print'], ['p', true, 'exportStl'], ['e', true, 'explode'],
  ['=', false, 'zoomIn'], ['+', false, 'zoomIn'], ['+', true, 'zoomIn'], ['-', false, 'zoomOut'], ['0', false, 'zoom100'],
  [',', false, 'settings'], ['l', true, 'language'], ['tab', false, 'nextTab'], ['tab', true, 'prevTab'], ['!', true, 'leftPanel'], ['1', true, 'leftPanel'],
  ['@', true, 'rightPanel'], ['2', true, 'rightPanel'], ['#', true, 'view3d'], ['3', true, 'view3d'], ['q', false, 'exit'], ['i', false, 'import3d'], ['g', true, 'light'], ['b', true, 'scaleBar'],
];
const FUNCTION_KEYS = { f1: 'about', f2: 'renameDrawing', f3: 'snap', f7: 'grid', f8: 'ortho', f9: 'snapGrid', home: 'zoomFit' };

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  const editing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.altKey && key === 's') { event.preventDefault(); run('saveAll'); return; }
  if (mod && !event.altKey) {
    // Text fields keep their own clipboard and undo.
    if (editing && ['x', 'c', 'v', 'z', 'y', 'a'].includes(key)) return;
    const shortcut = SHORTCUTS.find(([k, shift]) => k === key && shift === event.shiftKey);
    if (shortcut) {
      event.preventDefault();
      event.stopPropagation();
      run(shortcut[2]);
    }
    return;
  }
  if (FUNCTION_KEYS[key] && !(editing && key === 'home')) { event.preventDefault(); run(FUNCTION_KEYS[key]); return; }
  if (editing) {
    if (key === 'escape') event.target.blur();
    return;
  }
  if (key === ' ' && !canvasState.spaceDown) { canvasState.spaceDown = true; event.preventDefault(); return; }
  if (key === 'escape') {
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
}

// Test hook: the E2E suites drive the app through this (no effect on normal use).
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
    duplicateSelection, addLayer, toggleLayer, removeLayer, hitEntity, ensureViewport, drawCanvas, openPrint, createEntity,
    toggle3d, rebuild3d, view3d: () => view3d.instance,
    openSolidDialog, insertSolid, solidFeature, applyFeature, featureSource, booleanSelection, sectionSolids, projectSolids,
    openModelBytes, importModelBytes, export3d, exportMesh, selectedSolids,
    showHome, openSample, loadSamples, openTutorial, tutorialApi,
  },
};

start()
  .catch((error) => showError('error.unexpected', error, 'start'))
  .finally(() => {
    // The main window starts hidden (no flash of an empty page); show it even if start-up failed.
    if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {});
  });
